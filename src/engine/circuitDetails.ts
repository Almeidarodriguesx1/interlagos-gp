import * as THREE from 'three';
import { projectPointToTrack, type TrackData } from '../sim/track';
import { APRON_WIDTH } from '../sim/surfaceModel';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Seated silhouettes with solid heads, placed on the horizontal tier decks. */
export function buildSeatedCrowd(length: number): THREE.Group {
  const group = new THREE.Group(); group.name = 'seated-spectators';
  const bodyParts: THREE.BufferGeometry[] = [];
  const torso = new THREE.BoxGeometry(0.29, 0.40, 0.20); torso.translate(-0.02, 0.63, 0); bodyParts.push(torso.toNonIndexed()); torso.dispose();
  const limbs = new THREE.BufferGeometry();
  // Bent thighs, shins and arms, facing local +X (towards the circuit).
  limbs.setAttribute('position', new THREE.Float32BufferAttribute([
    -.1,.43,-.14, .3,.36,-.14, .3,.36,.14, -.1,.43,-.14, .3,.36,.14, -.1,.43,.14,
    .3,.36,-.14, .36,.03,-.14, .22,.03,-.14, .3,.36,-.14, .22,.03,-.14, .19,.36,-.14,
    .3,.36,.14, .22,.03,.14, .36,.03,.14, .3,.36,.14, .19,.36,.14, .22,.03,.14,
    -.05,.73,-.18, .24,.46,-.18, .16,.43,-.18, -.05,.73,-.18, .16,.43,-.18, -.11,.68,-.18,
    -.05,.73,.18, .16,.43,.18, .24,.46,.18, -.05,.73,.18, -.11,.68,.18, .16,.43,.18,
  ], 3)); limbs.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(limbs.attributes.position.count*2),2)); limbs.computeVertexNormals(); bodyParts.push(limbs);
  const bodyGeo = mergeGeometries(bodyParts, false)!; for (const p of bodyParts) p.dispose();
  const headGeo = new THREE.OctahedronGeometry(0.105, 0); headGeo.translate(-0.01, 0.95, 0);
  const bodyMat = new THREE.MeshStandardMaterial({roughness: 1, side: THREE.DoubleSide});
  const headMat = new THREE.MeshStandardMaterial({roughness: 1});
  const columns = Math.floor((length - 4) / 0.80), capacity = columns * 8;
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, capacity), heads = new THREE.InstancedMesh(headGeo, headMat, capacity);
  bodies.name = 'spectator-bodies'; heads.name = 'spectator-heads';
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const shirts = [0xe6bc31, 0x16834c, 0xad303a, 0xe1e0d5, 0x2365aa, 0xd57737, 0x283342];
  const skins = [0xc88d63, 0x9c6244, 0xe6b58c, 0x684733];
  let placed = 0;
  for (let tier = 0; tier < 4; tier++) for (let row = 0; row < 2; row++) for (let col = 0; col < columns; col++) {
    const seed = (tier * 431 + row * 173 + col * 37) % 101;
    if (seed < 13 || col % 32 === 0) continue; // sparse seats and real aisle gaps, no repeating fabric sheet
    const floor = 2.3 + tier * 1.45 + 1.45 / 2;
    dummy.position.set(3.35 - tier * 3.1 - row * 1.45, floor, (col + .5) * .8 - (columns * .8) / 2);
    dummy.rotation.set(0, ((seed % 13) - 6) * .025, 0);
    dummy.scale.setScalar(.90 + (seed % 17) / 100); dummy.updateMatrix();
    bodies.setMatrixAt(placed, dummy.matrix); heads.setMatrixAt(placed, dummy.matrix);
    bodies.setColorAt(placed, color.setHex(shirts[seed % shirts.length])); heads.setColorAt(placed, color.setHex(skins[seed % skins.length]));
    placed++;
  }
  for (const mesh of [bodies, heads]) {
    mesh.count = placed; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  group.userData = {spectators: placed, tierTopY: [3.025, 4.475, 5.925, 7.375]};
  return group;
}

/** Tufts rooted directly on the existing skirt triangles. No new surface zones. */
export function buildGrassTufts(skirt: THREE.BufferGeometry, sampleCount: number, terrain: THREE.BufferGeometry, track: TrackData): THREE.Group {
  const group = new THREE.Group(); group.name = 'grass-detail';
  const positions: number[] = [], colors: number[] = [];
  for (let b = 0; b < 12; b++) {
    const a = b * 2.39996, x = Math.cos(a) * (b%4)*.035, z = Math.sin(a)*(b%5)*.025;
    const height=.07+(b%7)*.015, width=.006+(b%3)*.002;
    for(const [dx,y,dz] of [[-width,0,0],[width,0,0],[Math.cos(a)*.035,height,Math.sin(a)*.035]]){
      positions.push(x+dx,y,z+dz);const light=.38+y*3;colors.push(light*.85,light,light*.65);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, vertexColors: true, side: THREE.DoubleSide});
  const ground = terrain.attributes.position;
  const grid = Math.round(Math.sqrt(ground.count)), minX = ground.getX(0), minZ = ground.getZ(0);
  const step = (ground.getX(grid - 1) - minX) / (grid - 1);
  const surfaceY = (x: number, z: number): number => {
    const gx = Math.max(0, Math.min(grid - 1.00001, (x-minX)/step)), gz = Math.max(0, Math.min(grid - 1.00001, (z-minZ)/step));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx-ix, v = gz-iz, i = iz*grid+ix;
    const y00 = ground.getY(i), y10 = ground.getY(i+1), y01 = ground.getY(i+grid), y11 = ground.getY(i+grid+1);
    return u+v <= 1 ? y00+u*(y10-y00)+v*(y01-y00) : y11+(1-u)*(y01-y11)+(1-v)*(y10-y11);
  };
  const source = skirt.attributes.position, dummy = new THREE.Object3D(), color = new THREE.Color();
  let total = 0;
  for (let chunk = 0; chunk < sampleCount; chunk += 96) {
    const end = Math.min(sampleCount, chunk + 96), points: number[][] = [];
    for (let side = 0; side < 2; side++) for (let i = chunk; i < end; i += 3) for (let k = 0; k < 4; k++) {
      const base = side * (sampleCount + 1) * 3 + i * 3;
      const band = k % 2, triangle = k < 2 ? 0 : 1;
      const ia = base + band, ib = base + band + 1, ic = base + 3 + band;
      let u = ((i * 37 + k * 43 + side * 17) % 97) / 97, v = ((i * 53 + k * 11 + 23) % 89) / 89;
      if (u+v > 1) { u=1-u; v=1-v; }
      // Both triangles use the actual vertices of the existing quad.
      const a = triangle ? ib : ia, b = triangle ? base + 4 + band : ib, c = ic;
      points.push([source.getX(a)*(1-u-v)+source.getX(b)*u+source.getX(c)*v,
        source.getY(a)*(1-u-v)+source.getY(b)*u+source.getY(c)*v,
        source.getZ(a)*(1-u-v)+source.getZ(b)*u+source.getZ(c)*v, i+k*17+side*31]);
      const point=points[points.length-1], p=projectPointToTrack(point[0],point[2],undefined,track);
      if(Math.abs(p.lateralOffset) <= (p.lateralOffset<0?p.widthLeft:p.widthRight)+APRON_WIDTH+.05) points.pop();
    }
    const mesh = new THREE.InstancedMesh(geo, mat, points.length); mesh.name = `grass-patch-${chunk}`;
    for (let i = 0; i < points.length; i++) {
      const [x,y,z,seed] = points[i];
      dummy.position.set(x,Math.max(y,surfaceY(x,z))-.01,z); dummy.rotation.set(0,seed*1.137,0);
      dummy.scale.set(.65+(seed%11)/10, .55+(seed%13)/10, .65+(seed%11)/10); dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix); color.setRGB(.20+(seed%7)*.014, .31+(seed%11)*.012, .08+(seed%5)*.012); mesh.setColorAt(i,color);
    }
    mesh.instanceMatrix.needsUpdate = true; if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere(); group.add(mesh); total += points.length;
  }
  group.userData = {tufts:total, rootedOnExistingSkirt:true};
  return group;
}
