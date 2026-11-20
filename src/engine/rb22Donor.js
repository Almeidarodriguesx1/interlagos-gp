// Test-drive car: "2026 Redbull RB22" by Tyler_Dave (CC BY 4.0, see models/CREDITS.md),
// fitted to the physics car as a drop-in for buildF1Car: { group, body, wheels, driver,
// drsFlap, steeringWheel, eye, mirrors, cockpitSides }. The standard car; each car is repainted in its own colours
// with our sponsors in place of the Red Bull livery.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const RB22_URL = import.meta.env.BASE_URL + 'models/rb22-donor.glb';
// All four wheels of each of these materials are one mesh: split per corner at load.
const WHEEL_MATERIAL = /^(discs|redbull_wheel_hub|sidewall)/;
// Parts wholly inside this box (model metres, nose at +z) make up the steering wheel.
const STEERING_BOX = new THREE.Box3(new THREE.Vector3(-0.14, 0.48, 0.63), new THREE.Vector3(0.14, 0.69, 0.81));
const CORNERS = ['front-left', 'front-right', 'rear-left', 'rear-right'];
const MIRRORS = ['mirror-left', 'mirror-right'];
// Steering wheel turn per radian of road-wheel steer (full lock 0.38 rad -> about 110°).
export const STEERING_RATIO = 5;
// A flat 4 cm plate on top of the bodywork, left of the cockpit (part of the detail mesh): its
// magenta-and-white metallic texture flashes white in the cockpit view, so it is left out.
const NOSE_PLATE = new THREE.Box3(new THREE.Vector3(0.07, 0.69, 1.11), new THREE.Vector3(0.125, 0.712, 1.165));
// The painted cockpit rim beside the driver's head (either side, |x|; below the halo): it fills
// the lower corners of the Driver camera, so it is a mesh of its own, hidden in that view.
export const COCKPIT_SIDES = 'cockpit-sides';
const COCKPIT_SIDES_BOX = new THREE.Box3(new THREE.Vector3(0.12, 0.55, 0), new THREE.Vector3(0.4, 0.75, 0.8));

// Load once (a URL in the browser, an ArrayBuffer in node, where textures are skipped);
// bake every mesh into model space and split the merged wheel meshes per corner.
export async function loadRB22Template(source = RB22_URL) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (typeof document === 'undefined') loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(null) }));
  const gltf = await (typeof source === 'string' ? loader.loadAsync(source) : loader.parseAsync(source, ''));
  gltf.scene.updateMatrixWorld(true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const template = new THREE.Group(), wheels = CORNERS.map(name => Object.assign(new THREE.Group(), { name }));
  const steering = new THREE.Group(); steering.name = 'steering';
  const rest = [];
  for (const m of meshes) {
    const geometry = toFloat(m.geometry).applyMatrix4(m.matrixWorld);
    if (m.material.name.startsWith('redbull_detail')) dropTriangles(geometry, NOSE_PLATE);
    geometry.computeBoundingBox();
    if (WHEEL_MATERIAL.test(m.material.name)) {
      splitCorners(geometry).forEach((g, i) => g && wheels[i].add(new THREE.Mesh(g, m.material)));
      continue;
    }
    rest.push([m, geometry]);
  }
  // The hub, brake and upright parts inside each wheel are in the bodywork meshes: they go
  // to the corner's upright (steers with the wheel), or a steered wheel swings off them; the
  // round brake drum among them goes to the corner's drum (steers and spins with the wheel).
  // Inside = centroid within the tyre radius, in the wheel's box stretched
  // 8 cm inboard (the brake drum and upright stand out of the rim there); the painted layers
  // stay whole (the livery is baked onto one mesh of each).
  const uprights = CORNERS.map(name => Object.assign(new THREE.Group(), { name: `${name}-upright` }));
  const drums = CORNERS.map(name => Object.assign(new THREE.Group(), { name: `${name}-drum` }));
  const hubs = wheels.map(w => {
    const box = new THREE.Box3().setFromObject(w), c = box.getCenter(new THREE.Vector3());
    if (c.x > 0) box.min.x -= 0.08; else box.max.x += 0.08;
    return { box, c, r: 0.95 * (box.max.y - box.min.y) / 2 };
  });
  for (const [m, src] of rest) {
    let geometry = src;
    // Whole connected pieces move (most of their triangles inside), so no part is torn at the cut.
    if (!Object.values(LAYERS).some(l => m.material.name.startsWith(l))) hubs.forEach(({ box, c, r }, i) => {
      if (geometry.index) geometry = geometry.toNonIndexed();
      const piece = pieces(geometry), pos = geometry.attributes.position, votes = new Map(), p = new THREE.Vector3(), v = new THREE.Vector3();
      for (let t = 0; t < pos.count / 3; t++) {
        p.set(0, 0, 0); for (let k = 0; k < 3; k++) p.add(v.fromBufferAttribute(pos, t * 3 + k)); p.divideScalar(3);
        const n = votes.get(piece[t]) ?? 0; votes.set(piece[t], n + (box.containsPoint(p) && Math.hypot(p.y - c.y, p.z - c.z) < r ? 1 : -1));
      }
      const taken = takeTriangles(geometry, (_, t) => votes.get(piece[t]) > 0);
      if (!taken) return;
      geometry = taken.kept;
      const isRound = roundParts(taken.inside, c), drum = takeTriangles(taken.inside, (_, t) => isRound(t));
      if (drum) drums[i].add(new THREE.Mesh(drum.inside, m.material));
      const still = drum ? drum.kept : taken.inside;
      if (still.attributes.position.count) uprights[i].add(new THREE.Mesh(still, m.material));
    });
    geometry.computeBoundingBox();
    // Both mirrors' glass is one mesh: split left / right so each can reflect its own view.
    if (m.material.name.startsWith('redbull_mirror')) {
      splitCorners(geometry).slice(0, 2).forEach((g, i) => template.add(Object.assign(new THREE.Mesh(g, m.material), { name: MIRRORS[i] })));
      continue;
    }
    const rim = Object.values(LAYERS).some(l => m.material.name.startsWith(l)) && takeTriangles(geometry, c => COCKPIT_SIDES_BOX.containsPoint(c.setX(Math.abs(c.x))));
    if (rim) {
      geometry = rim.kept; geometry.computeBoundingBox();
      template.add(Object.assign(new THREE.Mesh(rim.inside, m.material), { name: COCKPIT_SIDES }));
    }
    const mesh = new THREE.Mesh(geometry, m.material); mesh.name = m.name;
    (STEERING_BOX.containsBox(geometry.boundingBox) ? steering : template).add(mesh);
  }
  template.add(steering, ...wheels, ...uprights, ...drums);
  return template;
}

// Split geometry by triangle centroid: null if no centroid passes test, else
// { inside, kept } (non-indexed).
function takeTriangles(geometry, test) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.attributes.position;
  const inside = [], kept = [], c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, t + k));
    (test(c.divideScalar(3), t / 3) ? inside : kept).push(t);
  }
  if (!inside.length) return null;
  const build = tris => {
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(tris.length * 3 * n);
      tris.forEach((t, k) => dst.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    return out;
  };
  return { inside: build(inside), kept: build(kept) };
}

// The connected piece (a representative triangle) of each triangle of a non-indexed geometry:
// triangles sharing a vertex position are one piece.
function pieces(geometry) {
  const pos = geometry.attributes.position, n = pos.count / 3, parent = [...Array(n).keys()], seen = new Map();
  const find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const i = t * 3 + k, key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (seen.has(key)) parent[find(t)] = find(seen.get(key)); else seen.set(key, t);
  }
  return Int32Array.from(parent, (_, t) => find(t));
}

// Triangle indices of the round parts of a non-indexed geometry centred on the hub c (the
// brake drum): connected pieces about as tall as long, at least 35 cm across, centred within
// 3 cm of the axle. The off-centre brackets and arms around it are left out.
function roundParts(geometry, c) {
  const pos = geometry.attributes.position, n = pos.count / 3, piece = pieces(geometry), find = t => piece[t];
  const boxes = new Map(), v = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const r = find(t); if (!boxes.has(r)) boxes.set(r, new THREE.Box3());
    for (let k = 0; k < 3; k++) boxes.get(r).expandByPoint(v.fromBufferAttribute(pos, t * 3 + k));
  }
  const round = new Set([...boxes].filter(([, b]) => {
    const s = b.getSize(new THREE.Vector3()), m = b.getCenter(new THREE.Vector3());
    return Math.min(s.y, s.z) > 0.35 && Math.abs(s.y - s.z) < 0.03 && Math.hypot(m.y - c.y, m.z - c.z) < 0.03;
  }).map(([r]) => r));
  return t => round.has(find(t));
}

// A copy with float attributes (meshopt quantizes them, which a transform would clip).
export function toFloat(geometry) {
  const out = new THREE.BufferGeometry(); out.setIndex(geometry.index);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const n = attr.itemSize, dst = new Float32Array(attr.count * n), get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < attr.count; i++) for (let j = 0; j < n; j++) dst[i * n + j] = attr[get[j]](i);
    out.setAttribute(name, new THREE.BufferAttribute(dst, n));
  }
  return out;
}

// Remove the triangles whose centroid lies inside box (in place).
function dropTriangles(geometry, box) {
  const pos = geometry.attributes.position, n = geometry.index ? geometry.index.count : pos.count;
  const at = i => geometry.index ? geometry.index.getX(i) : i, c = new THREE.Vector3(), v = new THREE.Vector3(), keep = [];
  for (let i = 0; i < n; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, at(i + k)));
    if (!box.containsPoint(c.divideScalar(3))) keep.push(at(i), at(i + 1), at(i + 2));
  }
  geometry.setIndex(keep);
  return geometry;
}

// Split a non-indexed copy of geometry into four by triangle centroid: +z front, +x left.
export function splitCorners(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.attributes.position;
  const buckets = [[], [], [], []];
  for (let t = 0; t < pos.count; t += 3) {
    const x = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2), z = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    buckets[(z > 0 ? 0 : 2) + (x > 0 ? 0 : 1)].push(t);
  }
  return buckets.map(tris => {
    if (!tris.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(tris.length * 3 * n);
      tris.forEach((t, k) => dst.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    return out;
  });
}


const LAYERS = {paint:'redbull_paint',decals:'redbull_decals'};
