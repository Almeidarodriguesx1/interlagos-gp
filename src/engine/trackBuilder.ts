import {createModelLoader} from './modelLoader';
import {buildInterlagosFences} from './interlagosFences';
import {attachStandPreview} from './interlagosStandPreview';
import {teams2026} from '../sim/grid2026';
import {attachPitEquipment} from './pitEquipment';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structurePlacements,skylinePlacements,terrainSampler,supportHeight,localToWorld,type StructurePlacement} from './sceneryPlacement';
import { buildSeatedCrowd, buildGrassTufts } from './circuitDetails';
import { getSceneryLayout, type SceneryWorld } from '../sim/scenery';
import * as THREE from 'three';
import {
  getSampleAtDistance,
  INTERLAGOS_TRACK,
  projectPointToTrack,
  type InterlagosTrack,
} from '../sim/track';
import { APRON_WIDTH, BARRIER_OFFSET, runoffExtension, classifySurface, getSurfaceZones, SURFACE_ORDER, SURFACE_PROFILES } from '../sim/surfaceModel';
import type { WeatherCondition } from '../sim/types';
import type { ProceduralTextures } from './textures';

export interface InterlagosEnvironment {
  ready: Promise<void>;
  group: THREE.Group;
  asphaltMaterial: THREE.MeshStandardMaterial;
  gantryLights: THREE.Mesh[];
  crowdSources: readonly THREE.Vector3[];
  setWeatherVisuals: (weather: WeatherCondition) => void;
  setWeatherTime: (timeSec: number) => void;
  setRacingLineVisible: (visible: boolean) => void;
  syncScenery: (world: SceneryWorld) => void;
  dispose: () => void;
}

export interface TrackGeometryBundle {
  roadGeo: THREE.BufferGeometry;
  apronGeo: THREE.BufferGeometry;
  kerbLeftGeo: THREE.BufferGeometry | null;
  kerbRightGeo: THREE.BufferGeometry | null;
  wallSideGeo: THREE.BufferGeometry;
  wallTopGeo: THREE.BufferGeometry;
  corridorSkirtGeo: THREE.BufferGeometry;
  terrainGeo: THREE.BufferGeometry;
  terrainSize: number;
  centerX: number;
  centerZ: number;
}

/**
 * Deterministic terrain height evaluator at world (vx, vz) using O(1) track centerline projection.
 * Strictly clamps terrain beneath the road + apron corridor so grass never pokes through asphalt
 * on sloped/banked corners (e.g. Spa Eau Rouge / Raidillon) while blending smoothly outside barriers.
 */
export function computeTerrainHeight(
  vx: number,
  vz: number,
  track: InterlagosTrack = INTERLAGOS_TRACK,
): number {
  const proj = projectPointToTrack(vx, vz, undefined, track);
  const absLat = Math.abs(proj.lateralOffset);
  const barrierDist = (proj.lateralOffset >= 0 ? proj.widthRight : proj.widthLeft) + APRON_WIDTH + runoffExtension(track,proj.s,proj.lateralOffset);

  const rollingHill =
    Math.sin(vx * 0.0065) * Math.cos(vz * 0.0065) * track.meta.hillAmplitude +
    Math.sin(vx * 0.014 + vz * 0.011) * (track.meta.hillAmplitude * 0.28) +
    track.meta.elevationSpan * 0.32;

  // Inside the barrier + 14m buffer corridor (wider than a terrain grid cell), clamp tightly below
  // both centerline and banked edge height so triangle chords never poke asphalt nor leave >1.6m gaps.
  const roadEdgeY = proj.elevation;
  const underCorridorY = Math.min(proj.nearestPoint.y, roadEdgeY) - 0.85;

  if (absLat <= barrierDist + 14.0) {
    return underCorridorY;
  }

  const corridorOuter = barrierDist + 32.0;
  if (absLat <= corridorOuter) {
    const tSkirt = (absLat - (barrierDist + 14.0)) / (corridorOuter - (barrierDist + 14.0));
    const smooth = tSkirt * tSkirt * (3 - 2 * tSkirt);
    return underCorridorY * (1 - smooth) + (roadEdgeY - 0.45) * smooth;
  }

  const outerDist = absLat - corridorOuter;
  const blend = Math.max(0, Math.min(1, outerDist / 200));
  const smoothBlend = blend * blend * (3 - 2 * blend);
  const anchorY = roadEdgeY - 0.45;
  return anchorY * (1 - smoothBlend) + rollingHill * smoothBlend;
}

/**
 * Pure geometry builder for circuit road, apron, 3D serrated kerbs, concrete barriers,
 * outer corridor bank skirt, and high-res clamped terrain (headless-testable via check-geom).
 */
export function buildTrackGeometryBundle(track: InterlagosTrack): TrackGeometryBundle {
  const samples = track.samples;
  const n = samples.length;

  // 1. Continuous 5-Column Cambered Asphalt Ribbon (supports subtle racing-line rubber groove vertex shading)
  const cols = 5;
  const roadPositions: number[] = [];
  const roadColors: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const uDist = i === n ? track.totalLength / 14 : s.s / 14;
    const totalW = s.widthLeft + s.widthRight;

    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const lat = -s.widthLeft + u * totalW;
      const px = s.pos.x + s.right.x * lat;
      const py = s.pos.y + s.right.y * lat + 0.04;
      const pz = s.pos.z + s.right.z * lat;

      roadPositions.push(px, py, pz);
      roadUvs.push(u, uDist);

      const dLine = Math.abs(lat - s.racingLineOffset);
      const groove = 1.0 - 0.15 * Math.exp(-(dLine * dLine) / (2.5 * 2.5));
      roadColors.push(groove, groove, groove);
    }

    if (i < n) {
      const rowA = i * cols;
      const rowB = (i + 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        const a0 = rowA + c;
        const a1 = rowA + c + 1;
        const b0 = rowB + c;
        const b1 = rowB + c + 1;
        roadIndices.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setAttribute('uv2', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  // 2. Outer Runoff Apron Strips (split left & right with 0.35m tucked lip under road edge -> zero center overlap/z-fight)
  const apronPositions: number[] = [];
  const apronUvs: number[] = [];
  const apronIndices: number[] = [];

  const zones = getSurfaceZones(track);
  const materialIndices = SURFACE_ORDER.map(() => [] as number[]);
  // Add exact authored longitudinal boundaries to the existing sample rows.
  const rowDistances = new Set(samples.map(s => s.s));
  rowDistances.add(track.totalLength);
  for (const zone of zones) {
    rowDistances.add(zone.start * track.totalLength);
    rowDistances.add(zone.end * track.totalLength);
  }
  const rows = [...rowDistances].sort((a, b) => a - b).map(distance => {
    const a = getSampleAtDistance(distance === track.totalLength ? 0 : distance, track);
    const b = samples[(a.index + 1) % n];
    const end = b.s > a.s ? b.s : track.totalLength;
    const fraction = distance === track.totalLength ? 0 : (distance - a.s) / Math.max(1e-6, end - a.s);
    return { a, b, fraction, distance };
  });
  for (const side of [-1, 1] as const) {
    const offsets = new Set([-0.35, APRON_WIDTH]);
    for (const zone of zones) if (zone.side === (side < 0 ? 'left' : 'right')) {
      offsets.add(zone.minOffset); offsets.add(zone.maxOffset);
    }
    const columns = [...offsets].sort((a, b) => side < 0 ? b - a : a - b);
    const baseVert = apronPositions.length / 3;
    for (const row of rows) {
      const { a, b, fraction } = row;
      for (const offset of columns) {
        const latA = side * ((side < 0 ? a.widthLeft : a.widthRight) + offset + (offset === APRON_WIDTH ? runoffExtension(track,a.s,side) : 0));
        const latB = side * ((side < 0 ? b.widthLeft : b.widthRight) + offset + (offset === APRON_WIDTH ? runoffExtension(track,b.s,side) : 0));
        const drop = -0.04 - 0.04 * ((offset + 0.35) / (APRON_WIDTH + 0.35));
        // Interpolate existing strip edges: adding zones never moves the road or walls.
        apronPositions.push(
          THREE.MathUtils.lerp(a.pos.x + a.right.x * latA, b.pos.x + b.right.x * latB, fraction),
          THREE.MathUtils.lerp(a.pos.y + a.right.y * latA, b.pos.y + b.right.y * latB, fraction) + drop,
          THREE.MathUtils.lerp(a.pos.z + a.right.z * latA, b.pos.z + b.right.z * latB, fraction),
        );
        apronUvs.push((offset + 0.35) / (APRON_WIDTH + 0.35), row.distance / 14);
      }
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let c = 0; c < columns.length - 1; c++) {
        const offset = (columns[c] + columns[c + 1]) * 0.5;
        const material = classifySurface({ onKerb: false, widthLeft: 0, widthRight: 0,
          lateralOffset: side * Math.max(0, offset), tNorm: (rows[i].distance + rows[i + 1].distance) * 0.5 / track.totalLength }, zones);
        const v = baseVert + i * columns.length + c;
        const next = v + columns.length;
        materialIndices[SURFACE_ORDER.indexOf(material)].push(v, v + 1, next, v + 1, next + 1, next);
      }
    }
  }
  const apronGeo = new THREE.BufferGeometry();
  apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronPositions, 3));
  apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(apronUvs, 2));
  materialIndices.forEach((indices, materialIndex) => {
    if (indices.length) apronGeo.addGroup(apronIndices.length, indices.length, materialIndex);
    apronIndices.push(...indices);
  });
  apronGeo.setIndex(apronIndices);
  apronGeo.computeVertexNormals();

  // 3. 3D Raised Serrated Kerbs with Chamfered Profile + Physical End Caps
  const buildKerbGeo = (side: 'left' | 'right'): THREE.BufferGeometry | null => {
    const kPos: number[] = [];
    const kUv: number[] = [];
    const kIdx: number[] = [];
    let vertOffset = 0;

    let inRun = false;
    let runStart = 0;
    const sign = side === 'left' ? -1 : 1;

    const flushRun = (startIdx: number, endIdx: number) => {
      const len = endIdx - startIdx;
      if (len < 3) return;
      const baseV = vertOffset;
      const ringCols = 4; // inner lip -> apex ridge -> flat shoulder -> outer apron bevel

      for (let j = startIdx; j <= endIdx; j++) {
        const s = samples[j % n];
        const edgeDist = side === 'left' ? s.widthLeft : s.widthRight;
        const endDistance = Math.min(s.s - samples[startIdx].s, samples[endIdx].s - s.s);
        const t = Math.min(1, endDistance / 5);
        const fade = t * t * (3 - 2 * t);
        const widthScale = .08 + .92 * fade;
        const sawBump = 0.009 * Math.sin(s.s * 5.2);

        const lat0 = sign * (edgeDist - 0.14);
        const lat1 = sign * (edgeDist + 0.42 * widthScale);
        const lat2 = sign * (edgeDist + 1.18 * widthScale);
        const lat3 = sign * (edgeDist + 1.65 * widthScale);

        const h0 = 0.045;
        const h1 = 0.045 + (0.062 + sawBump) * fade;
        const h2 = 0.045 + (0.052 + sawBump * 0.5) * fade;
        const h3 = -0.025;

        const profile: Array<[number, number, number]> = [
          [lat0, h0, 0.0],
          [lat1, h1, 0.34],
          [lat2, h2, 0.76],
          [lat3, h3, 1.0],
        ];
        const vCoord = s.s / 3.0;
        for (const [lat, hOff, uCol] of profile) {
          kPos.push(
            s.pos.x + s.right.x * lat,
            s.pos.y + s.right.y * lat + hOff,
            s.pos.z + s.right.z * lat,
          );
          kUv.push(uCol, vCoord);
          vertOffset++;
        }
      }

      for (let k = 0; k < len; k++) {
        const rA = baseV + k * ringCols;
        const rB = baseV + (k + 1) * ringCols;
        for (let c = 0; c < ringCols - 1; c++) {
          const a0 = rA + c;
          const a1 = rA + c + 1;
          const b0 = rB + c;
          const b1 = rB + c + 1;
          if (side === 'left') {
            kIdx.push(a0, b0, a1, a1, b0, b1);
          } else {
            kIdx.push(a0, a1, b0, a1, b1, b0);
          }
        }
      }
    };

    for (let i = 0; i < n; i++) {
      const flag = side === 'left' ? samples[i].kerbLeft : samples[i].kerbRight;
      if (flag && !inRun) {
        inRun = true;
        runStart = i;
      } else if (!flag && inRun) {
        inRun = false;
        flushRun(runStart, i);
      }
    }
    if (inRun) flushRun(runStart, n - 1);

    if (kPos.length === 0) return null;
    const kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kPos, 3));
    kGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kUv, 2));
    kGeo.setIndex(kIdx);
    kGeo.computeVertexNormals();
    return kGeo;
  };

  const kerbLeftGeo = buildKerbGeo('left');
  const kerbRightGeo = buildKerbGeo('right');

  // 4. Solid 3D Concrete Safety Barriers (cambered footing so walls never float or split)
  const wallSidePos: number[] = [];
  const wallSideIdx: number[] = [];
  const wallTopPos: number[] = [];
  const wallTopIdx: number[] = [];

  for (const side of [-1, 1] as const) {
    const innerBase = wallSidePos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const lat = side * ((side === -1 ? s.widthLeft : s.widthRight) + BARRIER_OFFSET + runoffExtension(track,s.s,side));
      const wx = s.pos.x + s.right.x * lat;
      const wy = s.pos.y + s.right.y * lat;
      const wz = s.pos.z + s.right.z * lat;
      wallSidePos.push(wx, wy - 0.38, wz, wx, wy + 1.05, wz);
      if (i < n) {
        const b = innerBase + i * 2;
        if (side === -1) {
          wallSideIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        } else {
          wallSideIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }

    const outerBase = wallSidePos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const lat = side * ((side === -1 ? s.widthLeft : s.widthRight) + 7.15 + runoffExtension(track,s.s,side));
      const wx = s.pos.x + s.right.x * lat;
      const wy = s.pos.y + s.right.y * lat;
      const wz = s.pos.z + s.right.z * lat;
      wallSidePos.push(wx, wy + 1.05, wz, wx, wy - 0.45, wz);
      if (i < n) {
        const b = outerBase + i * 2;
        if (side === -1) {
          wallSideIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        } else {
          wallSideIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }

    const topBase = wallTopPos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const latIn = side * ((side === -1 ? s.widthLeft : s.widthRight) + BARRIER_OFFSET + runoffExtension(track,s.s,side));
      const latOut = side * ((side === -1 ? s.widthLeft : s.widthRight) + 7.15 + runoffExtension(track,s.s,side));
      const ix = s.pos.x + s.right.x * latIn;
      const iy = s.pos.y + s.right.y * latIn;
      const iz = s.pos.z + s.right.z * latIn;
      const ox = s.pos.x + s.right.x * latOut;
      const oy = s.pos.y + s.right.y * latOut;
      const oz = s.pos.z + s.right.z * latOut;
      wallTopPos.push(ix, iy + 1.05, iz, ox, oy + 1.05, oz);
      if (i < n) {
        const b = topBase + i * 2;
        if (side === -1) {
          wallTopIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        } else {
          wallTopIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }
  }

  const wallSideGeo = new THREE.BufferGeometry();
  wallSideGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallSidePos, 3));
  wallSideGeo.setIndex(wallSideIdx);
  wallSideGeo.computeVertexNormals();

  const wallTopGeo = new THREE.BufferGeometry();
  wallTopGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallTopPos, 3));
  wallTopGeo.setIndex(wallTopIdx);
  wallTopGeo.computeVertexNormals();

  // 5. Extruded Continuous Grass Corridor Bank Skirt outside barriers (bridges barrier footing -> park terrain seamlessly)
  const skirtPos: number[] = [];
  const skirtUv: number[] = [];
  const skirtIdx: number[] = [];

  for (const side of [-1, 1] as const) {
    const baseVert = skirtPos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const uDist = i === n ? track.totalLength / 18 : s.s / 18;
      const wSide = side === -1 ? s.widthLeft : s.widthRight;
      const latWall = side * (wSide + 7.0 + runoffExtension(track,s.s,side));
      const latMid = side * (wSide + 14.0 + runoffExtension(track,s.s,side));
      const latOuter = side * (wSide + 24.0 + runoffExtension(track,s.s,side));

      const wx = s.pos.x + s.right.x * latWall;
      const wy = s.pos.y + s.right.y * latWall - 0.14;
      const wz = s.pos.z + s.right.z * latWall;

      const mx = s.pos.x + s.right.x * latMid;
      const my = computeTerrainHeight(mx, s.pos.z + s.right.z * latMid, track) + 0.06;
      const mz = s.pos.z + s.right.z * latMid;

      const ox = s.pos.x + s.right.x * latOuter;
      const oz = s.pos.z + s.right.z * latOuter;
      const oy = computeTerrainHeight(ox, oz, track) - 0.55;

      if (side === -1) {
        skirtPos.push(ox, oy, oz, mx, my, mz, wx, wy, wz);
        skirtUv.push(0, uDist, 0.5, uDist, 1, uDist);
      } else {
        skirtPos.push(wx, wy, wz, mx, my, mz, ox, oy, oz);
        skirtUv.push(0, uDist, 0.5, uDist, 1, uDist);
      }

      if (i < n) {
        const rA = baseVert + i * 3;
        const rB = baseVert + (i + 1) * 3;
        skirtIdx.push(rA, rA + 1, rB, rA + 1, rB + 1, rB);
        skirtIdx.push(rA + 1, rA + 2, rB + 1, rA + 2, rB + 2, rB + 1);
      }
    }
  }

  const corridorSkirtGeo = new THREE.BufferGeometry();
  corridorSkirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
  corridorSkirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUv, 2));
  corridorSkirtGeo.setIndex(skirtIdx);
  corridorSkirtGeo.computeVertexNormals();

  // 6. High-Resolution Clamped Surrounding Parklands Terrain (168x168 grid)
  const centerX = (track.bounds.minX + track.bounds.maxX) * 0.5;
  const centerZ = (track.bounds.minZ + track.bounds.maxZ) * 0.5;
  const spanXZ = Math.max(
    track.bounds.maxX - track.bounds.minX,
    track.bounds.maxZ - track.bounds.minZ,
  );
  const terrainSize = Math.max(2400, spanXZ + 1400);
  const segs = track.surveyed ? 360 : 220;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;

  for (let i = 0; i < tPos.count; i++) {
    const vx = tPos.getX(i) + centerX;
    const vz = tPos.getZ(i) + centerZ;
    tPos.setX(i, vx);
    tPos.setZ(i, vz);
    tPos.setY(i, computeTerrainHeight(vx, vz, track));
  }
  terrainGeo.computeVertexNormals();
  // Broad and fine patches, baked once into vertex colors; no new grass locations or draw calls.
  for (const geometry of [terrainGeo, corridorSkirtGeo]) {
    const positions = geometry.attributes.position;
    // Same world scale on the skirt and terrain: avoid the former visible texture seam.
    const grassUV = new Float32Array(positions.count * 2);
    for(let i=0;i<positions.count;i++){grassUV[i*2]=positions.getX(i)/8;grassUV[i*2+1]=positions.getZ(i)/8;}
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(grassUV,2));
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const variation = 0.5 + 0.32 * Math.sin(x * 0.027 + Math.sin(z * 0.019)) * Math.cos(z * 0.036) + 0.18 * Math.sin(x * 0.11 + z * 0.08);
      colors[i * 3] = 0.82 + variation * 0.18;
      colors[i * 3 + 1] = 0.88 + variation * 0.12;
      colors[i * 3 + 2] = 0.76 + variation * 0.16;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  return {
    roadGeo,
    apronGeo,
    kerbLeftGeo,
    kerbRightGeo,
    wallSideGeo,
    wallTopGeo,
    corridorSkirtGeo,
    terrainGeo,
    terrainSize,
    centerX,
    centerZ,
  };
}

const _basisRight = new THREE.Vector3();
const _basisUp = new THREE.Vector3();
const _basisFwd = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();

function setObjectSampleOrientation(
  obj: THREE.Object3D,
  sample: InterlagosTrack['samples'][number],
): void {
  _basisRight.set(-sample.right.x, -sample.right.y, -sample.right.z).normalize();
  _basisUp.set(sample.up.x, sample.up.y, sample.up.z).normalize();
  _basisFwd.set(sample.tangent.x, sample.tangent.y, sample.tangent.z).normalize();
  // Ensure right-handed basis where local +X = -right? Wait: yaw=atan2(tx,tz) puts local +Z along +tangent and local +X along (-tz, 0, tx) = left!
  // Check: right = (-tz, tx) in track.ts! Wait: in Three.js, rotation.y = theta maps +Z -> (sin theta, 0, cos theta) and +X -> (cos theta, 0, -sin theta) = (tz, 0, -tx) = -right!
  // Verify: cross(up, fwd) = (0,1,0) x (tx,0,tz) = (tz, 0, -tx) = -right!
  _basisMat.makeBasis(_basisRight, _basisUp, _basisFwd);
  obj.quaternion.setFromRotationMatrix(_basisMat);
}

/**
 * Builds the complete 3D circuit environment: cambered asphalt, runoff aprons,
 * 3D serrated kerbs, concrete barriers, extruded corridor skirt, high-res terrain,
 * pit complex, grandstands, FIA starting gantry, lake, and grounded instanced trees.
 */
export function buildInterlagosScene(
  textures: ProceduralTextures,
  track: InterlagosTrack = INTERLAGOS_TRACK,
): InterlagosEnvironment {
  const manager = new THREE.LoadingManager();
  const ready = new Promise<void>(resolve => { manager.onLoad = resolve; });
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const samples = track.samples;
  const n = samples.length;
  const bundle = buildTrackGeometryBundle(track);
  if (track.id === 'interlagos') {
    const fences = buildInterlagosFences(track);
    group.add(fences);
    fences.traverse(object => {
      if (object instanceof THREE.LineSegments) disposables.push(object.geometry, object.material as THREE.Material);
    });
  }

  const boxTexture = (file:string) => {
    const map = new THREE.TextureLoader(manager).load(import.meta.env.BASE_URL+'textures/boxes/'+file+'.webp');
    map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=4;
    disposables.push(map);
    return map;
  };
  if (track.id==='interlagos') {
    // Follow the existing pit-side collider across the lap seam.
    const sections=[[-215,245,-.035,1.04,'pit-wall'],[-215,245,1.04,2.95,'debris-fence']] as const;
    for(const [start,end,bottom,top,file] of sections){
      const positions:number[]=[],uv:number[]=[],indices:number[]=[];
      for(let distance=start;distance<=end;distance+=2){
        const sample=getSampleAtDistance((distance+track.totalLength)%track.totalLength,track);
        const offset=-(sample.widthLeft+BARRIER_OFFSET+runoffExtension(track,sample.s,-1)-.025);
        for(const h of [bottom,top]){
          positions.push(sample.pos.x+sample.right.x*offset,sample.pos.y+sample.right.y*offset+h,sample.pos.z+sample.right.z*offset);
          uv.push((distance-start)/(file==='pit-wall'?3.2:2),h===bottom?0:1);
        }
        const k=positions.length/3-2;
        if(k>0)indices.push(k-2,k-1,k,k,k-1,k+1);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const steel=file==='debris-fence';
      const mat=new THREE.MeshStandardMaterial({map:boxTexture(file),roughness:steel?.58:.92,side:THREE.DoubleSide,alphaTest:steel?.32:0});
      if(steel){
        const count=Math.floor((end-start)/4)+1;
        const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.075,top-bottom,.075),
          new THREE.MeshStandardMaterial({color:0x62676a,metalness:.5,roughness:.58}),count);
        const transform=new THREE.Matrix4();
        for(let i=0;i<count;i++){
          const k=i*12;
          transform.makeTranslation(positions[k],positions[k+1]+(top-bottom)/2,positions[k+2]);
          posts.setMatrixAt(i,transform);
        }
        group.add(posts);
      }
      const panel=new THREE.Mesh(geometry,mat);panel.name=file;panel.receiveShadow=true;group.add(panel);
    }
  }

  const groundAt=terrainSampler(bundle.terrainGeo);
  const structures=structurePlacements(track);
  const addFoundation=(parent:THREE.Group,placement:StructurePlacement,topWorld:number,material:THREE.Material)=>{
    // Closed strips overlap the plinth; their lower edge follows the actual terrain.
    const segments=Math.ceil(placement.halfZ*2/6),pieces:THREE.BufferGeometry[]=[];
    for(let i=0;i<segments;i++){
      const za=-placement.halfZ+i*placement.halfZ*2/segments,zb=-placement.halfZ+(i+1)*placement.halfZ*2/segments;
      const xa=placement.localCenterX-placement.halfX,xb=placement.localCenterX+placement.halfX;
      const corners=[[xa,za],[xb,za],[xb,zb],[xa,zb]];const vertices:number[]=[];
      for(const [x,z]of corners){const [wx,wz]=localToWorld(placement,x,z);vertices.push(x,groundAt(wx,wz)-parent.position.y-.18,z);}
      for(const [x,z]of corners)vertices.push(x,topWorld-parent.position.y,z);
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];for(let t=0;t<faces.length;t+=3){const b=faces[t+1];faces[t+1]=faces[t+2];faces[t+2]=b;}geo.setIndex(faces);geo.computeVertexNormals();
      const flat=geo.toNonIndexed();flat.computeVertexNormals();geo.dispose();pieces.push(flat);
    }
    const merged=mergeGeometries(pieces,false)!;for(const piece of pieces)piece.dispose();const mesh=new THREE.Mesh(merged,material);mesh.name='grounded-foundation';mesh.receiveShadow=true;parent.add(mesh);
  };

  disposables.push(
    bundle.roadGeo,
    bundle.apronGeo,
    bundle.wallSideGeo,
    bundle.wallTopGeo,
    bundle.corridorSkirtGeo,
    bundle.terrainGeo,
  );
  if (bundle.kerbLeftGeo) disposables.push(bundle.kerbLeftGeo);
  if (bundle.kerbRightGeo) disposables.push(bundle.kerbRightGeo);

  const asphaltUniforms = {
    uWetAmount: { value: 0.0 },
    uTime: { value: 0.0 },
  };

  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: textures.asphaltMap,
    normalMap: textures.asphaltNormalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: textures.asphaltRoughnessMap,
    aoMap: textures.asphaltAoMap,
    aoMapIntensity: 0.72,
    roughness: 0.84,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // Extend PBR asphalt shader with world-space organic standing puddles + subtle rain shimmer
  asphaltMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWetAmount = asphaltUniforms.uWetAmount;
    shader.uniforms.uTime = asphaltUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vAsphaltWorldPos;
        varying float vRoadAcross;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vRoadAcross = uv.x;
        vAsphaltWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetAmount;
        uniform float uTime;
        varying vec3 vAsphaltWorldPos;
        varying float vRoadAcross;

        float puddleHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float puddleNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(puddleHash(i), puddleHash(i + vec2(1.0, 0.0)), u.x),
            mix(puddleHash(i + vec2(0.0, 1.0)), puddleHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float puddleMask = 0.0;
        if (uWetAmount > 0.01) {
          float puddleField = puddleNoise(vAsphaltWorldPos.xz * 0.055) * 0.65
                            + puddleNoise(vAsphaltWorldPos.xz * 0.145 + vec2(3.7, 1.9)) * 0.35;
          float shoulder = smoothstep(0.30, 0.48, abs(vRoadAcross - 0.5));
          puddleMask = uWetAmount * smoothstep(0.49, 0.72, puddleField + shoulder * 0.10);
          diffuseColor.rgb *= mix(1.0, 0.56, uWetAmount * 0.62 + puddleMask * 0.38);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if (uWetAmount > 0.01) {
          float wetRip = sin(vAsphaltWorldPos.x * 3.1 + uTime * 6.5) * cos(vAsphaltWorldPos.z * 3.1 - uTime * 5.2);
          roughnessFactor = mix(roughnessFactor, 0.24, uWetAmount * 0.72);
          roughnessFactor = mix(roughnessFactor, 0.045 + abs(wetRip) * 0.025, puddleMask);
        }`,
      );
  };
  if (track.id === 'interlagos') {
    const loader = new THREE.TextureLoader(manager);
    const load = (kind: string, color = false) => {
      const path = `${import.meta.env.BASE_URL}textures/interlagos-trecho1/asphalt_track_${kind}_1k.jpg`;
      const texture = loader.load(path);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      disposables.push(texture);
      return texture;
    };
    asphaltMaterial.map = load('diff', true);
    asphaltMaterial.normalMap = load('nor_gl');
    asphaltMaterial.roughnessMap = load('rough');
  }
  disposables.push(asphaltMaterial);

  const roadMesh = new THREE.Mesh(bundle.roadGeo, asphaltMaterial);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  if (track.surveyed) {
    const points:number[] = [];
    for (let i=1;i<track.samples.length;i++) {
      const a=track.samples[i-1], b=track.samples[i];
      if (a.s > 490 && a.s < track.totalLength-215 && !['Curva do Sol','Reta Oposta'].includes(a.cornerName)) continue;
      for(const side of [-1,1]) for(const [sample,inset] of [[a,.06],[b,.06],[b,.21],[a,.06],[b,.21],[a,.21]] as const) {
        const offset=side*((side<0?sample.widthLeft:sample.widthRight)-inset);
        points.push(sample.pos.x+offset*sample.right.x,sample.pos.y+offset*sample.right.y+.055,sample.pos.z+offset*sample.right.z);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const paint=new THREE.MeshBasicMaterial({color:0xe4e2da,side:THREE.DoubleSide});
    group.add(new THREE.Mesh(geometry,paint));
    disposables.push(geometry,paint);
  }

  const apronMat = new THREE.MeshStandardMaterial({
    color: track.meta.apronColor,
    roughness: 0.9,
    metalness: 0.02,
  });
  disposables.push(apronMat);
  const apronMaterials = SURFACE_ORDER.map(material => {
    if (material === 'asphalt') return apronMat;
    const profile = SURFACE_PROFILES[material];
    const mat = new THREE.MeshStandardMaterial({
      color: profile.color, roughness: profile.roughness, metalness: 0,
      map: material === 'grass' ? textures.grassMap : null,
    });
    disposables.push(mat);
    return mat;
  });
  const apronMesh = new THREE.Mesh(bundle.apronGeo, apronMaterials);
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  // 2. 3D Serrated Painted Kerbs
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.getKerbTexture(track.meta.kerbStyle),
    normalMap: textures.kerbNormalMap,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: textures.kerbRoughnessMap,
    roughness: 0.72,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(kerbMat);

  if (bundle.kerbLeftGeo) {
    const klMesh = new THREE.Mesh(bundle.kerbLeftGeo, kerbMat);
    klMesh.receiveShadow = true;
    group.add(klMesh);
  }
  if (bundle.kerbRightGeo) {
    const krMesh = new THREE.Mesh(bundle.kerbRightGeo, kerbMat);
    krMesh.receiveShadow = true;
    group.add(krMesh);
  }

  // 2B. Dashed Optimal Racing Line (aligned to full 3D track tangent/bank/up frame)
  const dashCount = 312;
  const dashGeo = new THREE.PlaneGeometry(0.76, 6.8);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  disposables.push(dashGeo, dashMat);
  const racingLineMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  racingLineMesh.renderOrder = 2;

  const lineDummy = new THREE.Object3D();
  const lineColor = new THREE.Color();

  for (let i = 0; i < dashCount; i++) {
    const s = (i / dashCount) * track.totalLength;
    const sp = getSampleAtDistance(s, track);
    const lx = sp.pos.x + sp.right.x * sp.racingLineOffset + sp.up.x * 0.068;
    const ly = sp.pos.y + sp.right.y * sp.racingLineOffset + sp.up.y * 0.068;
    const lz = sp.pos.z + sp.right.z * sp.racingLineOffset + sp.up.z * 0.068;

    lineDummy.position.set(lx, ly, lz);
    setObjectSampleOrientation(lineDummy, sp);
    lineDummy.scale.set(1, 1, 1);
    lineDummy.updateMatrix();
    racingLineMesh.setMatrixAt(i, lineDummy.matrix);

    if (sp.racingLinePhase === 'brake') {
      lineColor.setHex(0xef4444);
    } else if (sp.racingLinePhase === 'coast') {
      lineColor.setHex(0xf59e0b);
    } else {
      lineColor.setHex(0x10b981);
    }
    racingLineMesh.setColorAt(i, lineColor);
  }
  racingLineMesh.instanceMatrix.needsUpdate = true;
  if (racingLineMesh.instanceColor) racingLineMesh.instanceColor.needsUpdate = true;
  racingLineMesh.computeBoundingSphere();
  group.add(racingLineMesh);

  // 3. Solid 3D Concrete Safety Barriers
  const wallSideMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.65,
    metalness: 0.12,
  });
  const wallTopMat = new THREE.MeshStandardMaterial({
    color: track.meta.barrierCapColor,
    roughness: 0.52,
    metalness: 0.18,
  });
  disposables.push(wallSideMat, wallTopMat);

  const wallSideMesh = new THREE.Mesh(bundle.wallSideGeo, wallSideMat);
  wallSideMesh.castShadow = true;
  wallSideMesh.receiveShadow = true;
  group.add(wallSideMesh);

  const wallTopMesh = new THREE.Mesh(bundle.wallTopGeo, wallTopMat);
  wallTopMesh.receiveShadow = true;
  group.add(wallTopMesh);

  // 4. Outer Corridor Grass Skirt + Clamped High-Res Terrain
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.grassMap,
    vertexColors: true,
    normalMap: textures.grassNormalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.94,
    metalness: 0.0,
  });
  disposables.push(terrainMat);

  const corridorSkirtMesh = new THREE.Mesh(bundle.corridorSkirtGeo, terrainMat);
  corridorSkirtMesh.receiveShadow = true;
  group.add(corridorSkirtMesh);
  group.add(buildGrassTufts(bundle.corridorSkirtGeo, n, bundle.terrainGeo, track));

  const terrainMesh = new THREE.Mesh(bundle.terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Distant Represa Guarapiranga Water Basin (Interlagos)
  const lakeMat = new THREE.MeshStandardMaterial({
    color: 0x164e63,
    roughness: 0.22,
    metalness: 0.45,
  });
  disposables.push(lakeMat);
  if (track.meta.hasLake && !track.surveyed) {
    const lakeGeo = new THREE.PlaneGeometry(bundle.terrainSize + 400, bundle.terrainSize + 400);
    lakeGeo.rotateX(-Math.PI / 2);
    disposables.push(lakeGeo);
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.position.set(bundle.centerX, -4.5, bundle.centerZ);
    group.add(lake);
  }

  // 5. Start/Finish Checkered Line & FIA Starting Gantry with 5 Red Lights
  const startSample = samples[0];
  const startYaw = Math.atan2(startSample.tangent.x, startSample.tangent.z);

  const finishStripGeo = new THREE.PlaneGeometry(startSample.widthLeft + startSample.widthRight, 2.4);
  finishStripGeo.rotateX(-Math.PI / 2);
  disposables.push(finishStripGeo);
  const finishStripMat = new THREE.MeshStandardMaterial({
    map: textures.gridLineMap,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(finishStripMat);
  const finishStrip = new THREE.Mesh(finishStripGeo, finishStripMat);
  finishStrip.position.set(
    startSample.pos.x + startSample.up.x * 0.065,
    startSample.pos.y + startSample.up.y * 0.065,
    startSample.pos.z + startSample.up.z * 0.065,
  );
  setObjectSampleOrientation(finishStrip, startSample);
  group.add(finishStrip);

  // Starting Grid Boxes (10 painted white FIA slots behind start line)
  const gridBoxMat = new THREE.MeshBasicMaterial({
    color: 0xf1f5f9,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const gridFrontBarGeo = new THREE.PlaneGeometry(2.3, 0.18);
  gridFrontBarGeo.rotateX(-Math.PI / 2);
  const gridSideBarGeo = new THREE.PlaneGeometry(0.18, 1.45);
  gridSideBarGeo.rotateX(-Math.PI / 2);
  disposables.push(gridBoxMat, gridFrontBarGeo, gridSideBarGeo);

  for (let slot = 0; slot < 10; slot++) {
    const sBack = 14 + slot * 9.5;
    const gs = getSampleAtDistance(track.totalLength - sBack, track);
    const latOffset = slot % 2 === 0 ? -2.8 : 2.8;
    const gx = gs.pos.x + gs.right.x * latOffset + gs.up.x * 0.065;
    const gy = gs.pos.y + gs.right.y * latOffset + gs.up.y * 0.065;
    const gz = gs.pos.z + gs.right.z * latOffset + gs.up.z * 0.065;

    const slotGroup = new THREE.Group();
    slotGroup.position.set(gx, gy, gz);
    setObjectSampleOrientation(slotGroup, gs);

    const frontBar = new THREE.Mesh(gridFrontBarGeo, gridBoxMat);
    frontBar.position.set(0, 0, 2.55);
    const leftBar = new THREE.Mesh(gridSideBarGeo, gridBoxMat);
    leftBar.position.set(-1.07, 0, 1.9);
    const rightBar = new THREE.Mesh(gridSideBarGeo, gridBoxMat);
    rightBar.position.set(1.07, 0, 1.9);
    slotGroup.add(frontBar, leftBar, rightBar);
    group.add(slotGroup);
  }

  // FIA Gantry Arch
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(startSample.pos.x, startSample.pos.y, startSample.pos.z);
  gantryGroup.rotation.y = startYaw;

  const gantrySteelMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.72, roughness: 0.34 });
  const gantryBannerMat = new THREE.MeshStandardMaterial({
    map: textures.getGantryBannerTexture(track.meta.bannerText, track.meta.kerbStyle),
    roughness: 0.42,
    metalness: 0.15,
  });
  const gantryGreenMat = new THREE.MeshStandardMaterial({
    color: track.meta.barrierCapColor,
    roughness: 0.45,
    metalness: 0.2,
  });
  disposables.push(gantrySteelMat, gantryBannerMat, gantryGreenMat);

  const spanW = startSample.widthLeft + startSample.widthRight + 5;
  for (const px of [-spanW * 0.5, spanW * 0.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 8.2, 0.65), gantrySteelMat);
    pillar.position.set(px, 4.1, 0);
    pillar.castShadow = true;
    gantryGroup.add(pillar);
  }
  if(track.id==='interlagos'){
    const steel=gantrySteelMat.clone();
    steel.color.setHex(0xb8c1c4);steel.map=boxTexture('gantry-metal');
    const braces=new THREE.InstancedMesh(new THREE.BoxGeometry(.095,1,.095),steel,24);
    const jig=new THREE.Object3D();
    for(let bay=0;bay<12;bay++) for(let face=0;face<2;face++){
      const width=spanW/12,height=.88;
      jig.position.set(-spanW/2+(bay+.5)*width,6.46,face?.34:-.34);
      jig.rotation.z=(bay%2?1:-1)*Math.atan2(width,height);
      jig.scale.y=Math.hypot(width,height);jig.updateMatrix();braces.setMatrixAt(bay*2+face,jig.matrix);
    }
    gantryGroup.add(braces);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(spanW,.12,.8),steel);rail.position.y=6;gantryGroup.add(rail);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(spanW + 0.8, 1.55, 0.9), gantrySteelMat);
  bridge.position.set(0, 7.6, 0);
  bridge.castShadow = true;
  gantryGroup.add(bridge);

  const bannerFront = new THREE.Mesh(new THREE.PlaneGeometry(spanW, 1.4), gantryBannerMat);
  bannerFront.position.set(0, 7.6, -0.47);
  bannerFront.rotation.y = Math.PI;
  const bannerBack = new THREE.Mesh(new THREE.PlaneGeometry(spanW, 1.4), gantryBannerMat);
  bannerBack.position.set(0, 7.6, 0.47);
  gantryGroup.add(bannerFront, bannerBack);

  // 5 FIA Countdown Light Pods facing oncoming drivers (-Z local)
  const gantryLights: THREE.Mesh[] = [];
  const podHousingMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 0.5 });
  disposables.push(podHousingMat);
  const podHousing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.95, 0.35), podHousingMat);
  podHousing.position.set(0, 6.2, -0.45);
  gantryGroup.add(podHousing);

  const bulbGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.14, 16);
  bulbGeo.rotateX(Math.PI / 2);
  disposables.push(bulbGeo);
  for (let i = 0; i < 5; i++) {
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x3f1010,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.05,
      roughness: 0.2,
    });
    disposables.push(bulbMat);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set((i - 2) * 1.05, 6.2, -0.62);
    gantryGroup.add(bulb);
    gantryLights.push(bulb);
  }
  group.add(gantryGroup);

  // 6. Iconic Pit Complex & Covered Grandstands
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.08 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.25 });
  const standDeckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78, metalness: 0.1 });
  const standAccentMat = new THREE.MeshStandardMaterial({
    color: track.meta.barrierCapColor,
    roughness: 0.65,
    metalness: 0.08,
  });
  const garageDoorMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55, metalness: 0.35 });
  disposables.push(concreteMat, roofMat, standDeckMat, standAccentMat, garageDoorMat);

  const pitPlacement=structures[0],pitGroup=new THREE.Group();pitGroup.name='pit-complex';
  const pitGround=supportHeight(pitPlacement,groundAt);
  pitGroup.position.set(pitPlacement.rootX,pitGround+1.5,pitPlacement.rootZ);pitGroup.rotation.y=pitPlacement.yaw;
  pitGroup.userData.footprint=pitPlacement;
  addFoundation(pitGroup,pitPlacement,pitGround+.1,concreteMat);

  const pitBlock = new THREE.Mesh(new THREE.BoxGeometry(14, 9.0, 160), concreteMat);
  pitBlock.position.set(0, 3.0, 0);
  pitBlock.castShadow = true;
  pitBlock.receiveShadow = true;
  pitGroup.add(pitBlock);

  const doorGeo = new THREE.BoxGeometry(0.35, 3.6, 8.2);
  disposables.push(doorGeo);
  for (const [index, team] of teams2026.entries()) {
    const bz = -68 + index * 13.6;
    const door = new THREE.Mesh(doorGeo, garageDoorMat);
    door.position.set(-7.05, 1.85, bz);
    pitGroup.add(door);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#15171b';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = team.color;
    ctx.fillRect(0, 0, 16, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(team.name.toUpperCase(), 34, 33);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const signMaterial = new THREE.MeshBasicMaterial({map});
    const signGeometry = new THREE.PlaneGeometry(8.2, 1.025);
    disposables.push(signMaterial, signGeometry, map);
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.name = 'pit-sign-' + team.model;
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(-7.38, 4.45, bz);
    pitGroup.add(sign);
  }
  const pitFascia = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.15, 160), standAccentMat);
  pitFascia.position.set(-7.1, 6.4, 0);
  pitGroup.add(pitFascia);

  const pitOverhang = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.7, 162), roofMat);
  pitOverhang.position.set(-1.5, 7.8, 0);
  pitGroup.add(pitOverhang);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(5.5, 22, 5.5), concreteMat);
  tower.position.set(-3.5, 11, 78);
  tower.castShadow = true;
  pitGroup.add(tower);
  const towerTop = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.2, 6.2), gantryGreenMat);
  towerTop.position.set(-3.5, 21.5, 78);
  pitGroup.add(towerTop);
  group.add(pitGroup);
  const disposePitEquipment=attachPitEquipment(pitGroup, manager);

  const colGeo = new THREE.BoxGeometry(.55,12.6,.55);disposables.push(colGeo);
  const crowdSources: THREE.Vector3[] = [];
  const stands = structures.filter(p=>p.kind==='stand');
  for (const [standIndex, st] of stands.entries()) {
    const sg=new THREE.Group();sg.name='grounded-grandstand';
    const foundationTop=supportHeight(st,groundAt);
    sg.position.set(st.rootX,foundationTop+2.2,st.rootZ);sg.rotation.y=st.yaw;sg.userData.footprint=st;
    addFoundation(sg,st,foundationTop+.1,concreteMat);
    const standLength=st.length;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(15.2, 3.2, standLength), concreteMat);
    plinth.position.set(-1.8, -0.6, 0);
    plinth.receiveShadow = true;
    sg.add(plinth);

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, standLength), concreteMat);
    frontWall.position.set(4.8, 1.0, 0);
    frontWall.receiveShadow = true;
    sg.add(frontWall);

    const trimBand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, standLength), standAccentMat);
    trimBand.position.set(4.8, 2.1, 0);
    sg.add(trimBand);

    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.45, standLength), standDeckMat);
      tier.position.set(2.5 - t * 3.1, 2.3 + t * 1.45, 0);
      tier.castShadow = true;
      tier.receiveShadow = true;
      sg.add(tier);


    }

    sg.add(buildSeatedCrowd(standLength));

    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 8.2, standLength), concreteMat);
    rearWall.position.set(-8.2, 4.1, 0);
    sg.add(rearWall);

    const colSpacing = standLength / 4;
    for (let c = -2; c <= 2; c++) {
      const col = new THREE.Mesh(colGeo, gantrySteelMat);
      col.position.set(-7.6, 6.3, c * (colSpacing * 0.88));
      sg.add(col);
    }

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.45, standLength + 2), roofMat);
    canopy.position.set(-1.2, 12.6, 0);
    canopy.rotation.z = -0.06;
    canopy.castShadow = true;
    sg.add(canopy);
    group.add(sg);
    if (track.id === 'interlagos') crowdSources.push(new THREE.Vector3(st.x, foundationTop + 5, st.z));
    if (track.id === 'interlagos' && standIndex < 2) {
      disposables.push({dispose: attachStandPreview(sg, standLength, standIndex === 0 ? 'a' : 'd', manager)});
    }
  }

  if (track.surveyed) {
    let closed = false;
    disposables.push({dispose:()=>{closed=true;}});
    void createModelLoader(manager).loadAsync(import.meta.env.BASE_URL+'models/s1-shrub.glb').then(({scene})=>{
      const shrub=scene.getObjectByName('Shrub') as THREE.Mesh;
      const material=shrub.material as THREE.MeshStandardMaterial;
      const textures=new Set(Object.values(material).filter((v):v is THREE.Texture=>v instanceof THREE.Texture));
      if(closed){shrub.geometry.dispose();material.dispose();for(const t of textures)t.dispose();return;}
      disposables.push(...textures);
      const locations=samples.filter((s,i)=>i%11===0 && (['Curva do Sol','Reta Oposta','Ligação'].includes(s.cornerName) || s.cornerName.startsWith('Descida do Lago')));
      const plants=new THREE.InstancedMesh(shrub.geometry,material,locations.length);
      const plant=new THREE.Object3D();
      plants.name='Arbustos S1';let count=0;
      for(const sample of locations){
        const distance=28+6*Math.sin(sample.s);
        const x=sample.pos.x+sample.right.x*distance,z=sample.pos.z+sample.right.z*distance;
        const near=projectPointToTrack(x,z,undefined,track);
        if(Math.abs(near.lateralOffset)<Math.max(near.widthRight,near.widthLeft)+15)continue;
        plant.position.set(x,computeTerrainHeight(x,z,track),z);
        plant.rotation.y=sample.s;plant.scale.setScalar(1.4+.4*Math.cos(sample.s));
        plant.updateMatrix();plants.setMatrixAt(count++,plant.matrix);
      }
      plants.count=count;group.add(plants);
    }).catch(error=>console.warn('Vegetação do S1 indisponível',error));
  }

  // 7. Instanced Organic Multi-Cluster Trees grounded firmly onto computed terrain (zero floating trees)
  const treeCount = 260;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 3.8, 6);
  trunkGeo.translate(0, 1.9, 0);
  const canopyMainGeo = new THREE.DodecahedronGeometry(2.85, 1);
  canopyMainGeo.scale(1.15, 0.88, 1.1);
  canopyMainGeo.translate(0, 5.1, 0);
  const canopyCrownGeo = new THREE.DodecahedronGeometry(2.05, 1);
  canopyCrownGeo.translate(0.95, 6.4, -0.65);
  disposables.push(trunkGeo, canopyMainGeo, canopyCrownGeo);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.92 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
  disposables.push(trunkMat, canopyMat);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopiesMain = new THREE.InstancedMesh(canopyMainGeo, canopyMat, treeCount);
  const canopiesCrown = new THREE.InstancedMesh(canopyCrownGeo, canopyMat, treeCount);
  canopiesMain.castShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < treeCount * 4 && placed < treeCount; i++) {
    const sample = samples[(i * 23) % n];
    const side = i % 2 === 0 ? 1 : -1;
    const distOut = 32 + ((i * 37) % 130);
    const tx = sample.pos.x + sample.right.x * side * distOut;
    const tz = sample.pos.z + sample.right.z * side * distOut;

    const proj = projectPointToTrack(tx, tz, undefined, track);
    if (Math.abs(proj.lateralOffset) < proj.widthRight + 24) continue;

    if(structures.some(f=>{const dx=tx-f.x,dz=tz-f.z,c=Math.cos(f.yaw),s=Math.sin(f.yaw);return Math.abs(c*dx-s*dz)<f.halfX+4&&Math.abs(s*dx+c*dz)<f.halfZ+4;}))continue;
    const sScale = 0.82 + ((i * 17) % 34) / 100;
    const groundY = computeTerrainHeight(tx, tz, track);
    dummy.position.set(tx, groundY - 0.35, tz);
    dummy.rotation.y = (i * 1.37) % (Math.PI * 2);
    dummy.scale.set(sScale, sScale * (0.9 + ((i * 7) % 24) / 100), sScale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    canopiesMain.setMatrixAt(placed, dummy.matrix);
    canopiesCrown.setMatrixAt(placed, dummy.matrix);

    const gVal = 0.32 + ((i * 13) % 20) / 100;
    tint.setRGB(gVal * 0.52, gVal, gVal * 0.42);
    canopiesMain.setColorAt(placed, tint);
    tint.setRGB(gVal * 0.58, Math.min(0.65, gVal * 1.12), gVal * 0.44);
    canopiesCrown.setColorAt(placed, tint);
    placed++;
  }
  trunks.count = placed;
  canopiesMain.count = placed;
  canopiesCrown.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  canopiesMain.instanceMatrix.needsUpdate = true;
  canopiesCrown.instanceMatrix.needsUpdate = true;
  if (canopiesMain.instanceColor) canopiesMain.instanceColor.needsUpdate = true;
  if (canopiesCrown.instanceColor) canopiesCrown.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  canopiesMain.computeBoundingSphere();
  canopiesCrown.computeBoundingSphere();
  group.add(trunks, canopiesMain, canopiesCrown);

  // Distant São Paulo Urban Skyline Silhouettes (Interlagos)
  if (track.meta.hasSkyline) {
    const skylineCount = 68;
    const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
    bldgGeo.translate(0, 0.5, 0);
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.78,
      metalness: 0.18,
    });
    disposables.push(bldgGeo, bldgMat);
    const skylineMesh = new THREE.InstancedMesh(bldgGeo, bldgMat, skylineCount);
    skylineMesh.name='distant-skyline';
    const city=skylinePlacements(track);skylineMesh.userData.footprints=city;
    for(let i=0;i<city.length;i++){
      const f=city[i];let base=Infinity;
      for(const x of[-f.halfX,f.halfX])for(const z of[-f.halfZ,f.halfZ]){const wx=f.x+Math.cos(f.yaw)*x+Math.sin(f.yaw)*z,wz=f.z-Math.sin(f.yaw)*x+Math.cos(f.yaw)*z;base=Math.min(base,groundAt(wx,wz));}
      dummy.position.set(f.x,base-.2,f.z);dummy.rotation.set(0,f.yaw,0);dummy.scale.set(f.halfX*2,f.height,f.halfZ*2);dummy.updateMatrix();skylineMesh.setMatrixAt(i,dummy.matrix);
    }
    skylineMesh.instanceMatrix.needsUpdate = true;
    skylineMesh.computeBoundingSphere();
    group.add(skylineMesh);
  }

  // 8. DRS Signboards & Dynamic 100m/50m Trackside Braking Marker Boards before sharp corners
  const drsBoardMat = new THREE.MeshStandardMaterial({
    map: textures.drsBoardMap,
    emissive: 0x059669,
    emissiveIntensity: 0.18,
    roughness: 0.4,
  });
  const brake100Mat = new THREE.MeshStandardMaterial({ map: textures.brake100Map, roughness: 0.45 });
  const brake50Mat = new THREE.MeshStandardMaterial({ map: textures.brake50Map, roughness: 0.45 });
  const boardBackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
  const boardPostMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
  disposables.push(drsBoardMat, brake100Mat, brake50Mat, boardBackMat, boardPostMat);

  const propGroups: Array<THREE.Group | null> = [];
  const drsPostGeo = new THREE.CylinderGeometry(.08,.08,2.8,8);
  const drsSignGeo = new THREE.BoxGeometry(1.6,.95,.14);
  const mPostGeo = new THREE.CylinderGeometry(.06,.06,2.2,8);
  const mBoardGeo = new THREE.BoxGeometry(1.45,.92,.12);
  disposables.push(drsPostGeo,drsSignGeo,mPostGeo,mBoardGeo);
  for (const prop of getSceneryLayout(track)) {
    if (prop.kind === 'gantry-pillar') { propGroups.push(null); continue; }
    const bg = new THREE.Group(); bg.name = prop.id; bg.position.set(prop.x,prop.y,prop.z); bg.rotation.y=prop.yaw;
    const drs = prop.kind === 'drs';
    const post = new THREE.Mesh(drs?drsPostGeo:mPostGeo,boardPostMat); post.position.y=drs?1.4:1.1;
    const faceMat = drs?drsBoardMat:prop.kind==='brake100'?brake100Mat:brake50Mat;
    const board = new THREE.Mesh(drs?drsSignGeo:mBoardGeo,[boardBackMat,boardBackMat,boardBackMat,boardBackMat,faceMat,faceMat]);
    board.position.y=drs?2.6:2.05; bg.add(post,board); group.add(bg); propGroups.push(bg);
  }
  const fallAxis = new THREE.Vector3(), baseRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0,1,0);
  const syncScenery = (world: SceneryWorld) => {
    for(let i=0;i<world.objects.length;i++) {
      const state=world.objects[i], mesh=propGroups[i]; if(!mesh)continue;
      baseRotation.setFromAxisAngle(upAxis,state.prop.yaw);
      if(state.broken){
        const angle=Math.min(1,state.age*2.2)*Math.PI*.49;
        fallAxis.set(Math.cos(state.fallYaw),0,-Math.sin(state.fallYaw));
        mesh.quaternion.setFromAxisAngle(fallAxis,angle).multiply(baseRotation);
      }else mesh.quaternion.copy(baseRotation);
    }
  };

  const setWeatherVisuals = (weather: WeatherCondition) => {
    if (weather === 'wet') {
      asphaltUniforms.uWetAmount.value = 1.0;
      asphaltMaterial.roughness = 0.24;
      asphaltMaterial.metalness = 0.26;
      asphaltMaterial.envMapIntensity = 1.75;
      asphaltMaterial.color.setHex(0xdbe4ee);
      apronMat.roughness = 0.28;
      apronMat.envMapIntensity = 1.25;
      lakeMat.color.setHex(0x1e293b);
    } else {
      asphaltUniforms.uWetAmount.value = 0.0;
      asphaltMaterial.roughness = 0.84;
      asphaltMaterial.metalness = 0.06;
      asphaltMaterial.envMapIntensity = 0.42;
      asphaltMaterial.color.setHex(0xffffff);
      apronMat.roughness = 0.9;
      apronMat.envMapIntensity = 0.28;
      lakeMat.color.setHex(0x164e63);
    }
  };

  const setWeatherTime = (timeSec: number) => {
    asphaltUniforms.uTime.value = timeSec;
  };

  const setRacingLineVisible = (visible: boolean) => {
    racingLineMesh.visible = visible;
  };

  return {
    ready,
    group,
    asphaltMaterial,
    gantryLights,
    crowdSources,
    setWeatherVisuals,
    setWeatherTime,
    setRacingLineVisible,
    syncScenery,
    dispose: () => {
      disposePitEquipment();
      const owned = new Set<{dispose:()=>void}>(disposables);
      group.traverse(object => {
        if (object instanceof THREE.Mesh) owned.add(object.geometry);
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.Mesh) for(const m of Array.isArray(object.material)?object.material:[object.material]) owned.add(m);
      });
      for (const resource of owned) resource.dispose();
    },
  };
}
