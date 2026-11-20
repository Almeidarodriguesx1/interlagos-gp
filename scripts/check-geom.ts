import * as THREE from 'three';
import { getTrack, buildSurveyedInterlagos } from '../src/sim/track';
import type { TrackId } from '../src/sim/types';
import { buildTrackGeometryBundle } from '../src/engine/trackBuilder';
import { CAR_TIRE_SPECS, getSharedCarGeometries } from '../src/engine/carBuilder';

function sampleGridTerrainY(
  terrainGeo: THREE.BufferGeometry,
  terrainSize: number,
  centerX: number,
  centerZ: number,
  segs: number,
  wx: number,
  wz: number,
): number {
  const pos = terrainGeo.attributes.position;
  const cols = segs + 1;
  const minX = centerX - terrainSize * 0.5;
  const minZ = centerZ - terrainSize * 0.5;

  const gx = Math.max(0, Math.min(segs - 0.0001, ((wx - minX) / terrainSize) * segs));
  const gz = Math.max(0, Math.min(segs - 0.0001, ((wz - minZ) / terrainSize) * segs));
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;

  // PlaneGeometry rotatedX(-PI/2): row iz corresponds to z = minZ + iz * step (note rotateX(-PI/2) maps +Y -> +Z? Wait: verify vertex ordering!)
  // Let's check actual vertex Z of row 0 vs row segs:
  const i00 = iz * cols + ix;
  const i10 = iz * cols + (ix + 1);
  const i01 = (iz + 1) * cols + ix;
  const i11 = (iz + 1) * cols + (ix + 1);

  const z00 = pos.getZ(i00);
  const z01 = pos.getZ(i01);
  // If rotateX(-PI/2) mapped PlaneGeometry +Y -> -Z, z decreases with iz! Handle exact grid index directly:
  let actualIz = iz;
  let actualFz = fz;
  if (z01 < z00) {
    const rawGz = Math.max(0, Math.min(segs - 0.0001, ((centerZ + terrainSize * 0.5 - wz) / terrainSize) * segs));
    actualIz = Math.floor(rawGz);
    actualFz = rawGz - actualIz;
  }

  const v00 = actualIz * cols + ix;
  const v10 = actualIz * cols + (ix + 1);
  const v01 = (actualIz + 1) * cols + ix;
  const v11 = (actualIz + 1) * cols + (ix + 1);

  const y00 = pos.getY(v00);
  const y10 = pos.getY(v10);
  const y01 = pos.getY(v01);
  const y11 = pos.getY(v11);

  // Three.js PlaneGeometry diagonal splits cell along (v10 -> v01): triangle A = (v00, v01, v10), triangle B = (v01, v11, v10)
  if (fx + actualFz <= 1) {
    return y00 + fx * (y10 - y00) + actualFz * (y01 - y00);
  }
  return y11 + (1 - fx) * (y01 - y11) + (1 - actualFz) * (y10 - y11);
}

function checkTracks(): number {
  const trackIds: TrackId[] = ['interlagos', 'monza', 'spa'];
  let failures = 0;

  for (const track of [...trackIds.map(id => getTrack(id)), buildSurveyedInterlagos()]) {
    const id = track.surveyed ? "interlagos-geo" : track.id;
    const bundle = buildTrackGeometryBundle(track);
    const segs = Math.sqrt(bundle.terrainGeo.attributes.position.count)-1;

    let maxSpacing = 0;
    let terrainPokeCount = 0;
    let maxPokeHeight = -Infinity;
    let apronGapOver16m = 0;
    let maxApronGap = 0;
    let barrierGapCount = 0;

    for (let i = 0; i < track.samples.length; i++) {
      const a = track.samples[i];
      const b = track.samples[(i + 1) % track.samples.length];
      const stepDist = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z);
      if (stepDist > maxSpacing) maxSpacing = stepDist;
      if (stepDist > 3.5) barrierGapCount++;

      // Check centerline, road edges, and apron mid/outer strips against barycentric terrain mesh
      const probeOffsets = [
        { lat: 0, surfaceOff: 0.04, isApronMid: false },
        { lat: -a.widthLeft, surfaceOff: 0.04, isApronMid: false },
        { lat: a.widthRight, surfaceOff: 0.04, isApronMid: false },
        { lat: -(a.widthLeft + 3.0), surfaceOff: -0.06, isApronMid: true },
        { lat: a.widthRight + 3.0, surfaceOff: -0.06, isApronMid: true },
        { lat: -(a.widthLeft + 6.5), surfaceOff: -0.08, isApronMid: false },
        { lat: a.widthRight + 6.5, surfaceOff: -0.08, isApronMid: false },
      ];

      for (const p of probeOffsets) {
        const px = a.pos.x + a.right.x * p.lat;
        const py = a.pos.y + a.right.y * p.lat + p.surfaceOff;
        const pz = a.pos.z + a.right.z * p.lat;
        const terrainY = sampleGridTerrainY(
          bundle.terrainGeo,
          bundle.terrainSize,
          bundle.centerX,
          bundle.centerZ,
          segs,
          px,
          pz,
        );

        const poke = terrainY - py;
        if (poke > maxPokeHeight) maxPokeHeight = poke;
        if (poke > -0.02) {
          terrainPokeCount++;
        }

        if (p.isApronMid) {
          const gap = py - terrainY;
          if (gap > maxApronGap) maxApronGap = gap;
          if (gap > 1.6) {
            apronGapOver16m++;
          }
        }
      }
    }

    const ok =
      maxSpacing <= 3.0 &&
      terrainPokeCount === 0 &&
      apronGapOver16m === 0 &&
      barrierGapCount === 0;

    console.log(
      `[track:${id}] samples=${track.samples.length} maxStep=${maxSpacing.toFixed(2)}m ` +
        `pokes=${terrainPokeCount} (maxDelta=${maxPokeHeight.toFixed(3)}m) ` +
        `apronGaps>1.6m=${apronGapOver16m} (maxGap=${maxApronGap.toFixed(3)}m) ` +
        `barrierGaps=${barrierGapCount} -> ${ok ? 'PASS' : 'FAIL'}`,
    );

    if (!ok) failures++;

    bundle.roadGeo.dispose();
    bundle.apronGeo.dispose();
    bundle.kerbLeftGeo?.dispose();
    bundle.kerbRightGeo?.dispose();
    bundle.wallSideGeo.dispose();
    bundle.wallTopGeo.dispose();
    bundle.corridorSkirtGeo.dispose();
    bundle.terrainGeo.dispose();
  }

  return failures;
}

function checkCarClearances(): number {
  const g = getSharedCarGeometries();
  let failures = 0;

  const makeTireBox = (x: number, y: number, z: number, width: number, radius: number): THREE.Box3 => {
    const hw = width * 0.5;
    return new THREE.Box3(
      new THREE.Vector3(x - hw, y - radius, z - radius),
      new THREE.Vector3(x + hw, y + radius, z + radius),
    );
  };

  const tires = [
    {
      name: 'FL',
      box: makeTireBox(
        CAR_TIRE_SPECS.frontCenterX,
        CAR_TIRE_SPECS.frontCenterY,
        CAR_TIRE_SPECS.frontCenterZ,
        CAR_TIRE_SPECS.frontWidth,
        CAR_TIRE_SPECS.frontRadius,
      ),
    },
    {
      name: 'FR',
      box: makeTireBox(
        -CAR_TIRE_SPECS.frontCenterX,
        CAR_TIRE_SPECS.frontCenterY,
        CAR_TIRE_SPECS.frontCenterZ,
        CAR_TIRE_SPECS.frontWidth,
        CAR_TIRE_SPECS.frontRadius,
      ),
    },
    {
      name: 'RL',
      box: makeTireBox(
        CAR_TIRE_SPECS.rearCenterX,
        CAR_TIRE_SPECS.rearCenterY,
        CAR_TIRE_SPECS.rearCenterZ,
        CAR_TIRE_SPECS.rearWidth,
        CAR_TIRE_SPECS.rearRadius,
      ),
    },
    {
      name: 'RR',
      box: makeTireBox(
        -CAR_TIRE_SPECS.rearCenterX,
        CAR_TIRE_SPECS.rearCenterY,
        CAR_TIRE_SPECS.rearCenterZ,
        CAR_TIRE_SPECS.rearWidth,
        CAR_TIRE_SPECS.rearRadius,
      ),
    },
  ];

  // Test placed Floor, Edge Strakes, Monocoque/Nose, and Sidepods against all 4 tire Box3s
  const dummyMat = new THREE.MeshBasicMaterial();
  const checkMeshClearance = (label: string, mesh: THREE.Mesh) => {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    for (const t of tires) {
      if (box.intersectsBox(t.box)) {
        console.error(
          `[car:${label}] INTERSECTS ${t.name} tire! partZ=[${box.min.z.toFixed(3)},${box.max.z.toFixed(3)}] tireZ=[${t.box.min.z.toFixed(3)},${t.box.max.z.toFixed(3)}] partX=[${box.min.x.toFixed(3)},${box.max.x.toFixed(3)}]`,
        );
        failures++;
      }
    }
  };

  // Floor has coke-bottle cutout ahead of rear tires, so test its actual vertices near rear wheel zone too
  const floorMesh = new THREE.Mesh(g.floorGeo, dummyMat);
  floorMesh.position.set(0, 0.085, 0);
  floorMesh.updateMatrixWorld(true);
  const fPos = g.floorGeo.attributes.position;
  let floorTireVertHits = 0;
  for (let i = 0; i < fPos.count; i++) {
    const vx = fPos.getX(i);
    const vy = fPos.getY(i) + 0.085;
    const vz = fPos.getZ(i);
    for (const t of tires) {
      if (
        vx >= t.box.min.x &&
        vx <= t.box.max.x &&
        vy >= t.box.min.y &&
        vy <= t.box.max.y &&
        vz >= t.box.min.z &&
        vz <= t.box.max.z
      ) {
        floorTireVertHits++;
      }
    }
  }
  if (floorTireVertHits > 0) {
    console.error(`[car:floorGeo] ${floorTireVertHits} vertices intersect tire Box3!`);
    failures++;
  }

  for (const sx of [-0.93, 0.93]) {
    const strake = new THREE.Mesh(g.edgeWingGeo, dummyMat);
    strake.position.set(sx, 0.14, -0.22);
    checkMeshClearance(`edgeWing(${sx})`, strake);
  }

  const mono = new THREE.Mesh(g.noseExtrudeGeo, dummyMat);
  mono.position.set(0, 0.17, 0);
  checkMeshClearance('noseExtrude', mono);

  for (const side of [1, -1]) {
    const pod = new THREE.Mesh(g.podGeo, dummyMat);
    pod.scale.x = -side;
    pod.position.set(side * 0.28, 0.19, 0.42);
    pod.rotation.y = side * -0.075;
    checkMeshClearance(`sidepod(${side})`, pod);
  }

  // Verify contoured sidewall radius & radial accuracy
  g.sidewallFrontGeo.computeBoundingBox();
  const swBox = g.sidewallFrontGeo.boundingBox!;
  const tireBox = new THREE.Box3().setFromBufferAttribute(
    g.tireFrontGeo.attributes.position as THREE.BufferAttribute,
  );
  const maxWidthGap = Math.abs(swBox.max.x - tireBox.max.x);
  if (maxWidthGap > 0.01) {
    console.error(`[car:sidewall] maxWidthGap=${maxWidthGap.toFixed(4)}m > 0.01m!`);
    failures++;
  }

  dummyMat.dispose();

  console.log(
    `[car:clearances] floorVertHits=${floorTireVertHits} sidewallGap=${maxWidthGap.toFixed(4)}m -> ${failures === 0 ? 'PASS' : 'FAIL'}`,
  );

  return failures;
}

const totalFailures = checkTracks() + checkCarClearances();
if (totalFailures > 0) {
  console.error(`Geometry check failed with ${totalFailures} error(s).`);
  process.exit(1);
}
console.log('ALL GEOMETRY & CLEARANCE CHECKS PASSED.');
