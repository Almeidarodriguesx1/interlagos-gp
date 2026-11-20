import { buildPilotDetails, buildPilotNose, buildPilotBodywork } from './carDetails';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const CAR_TIRE_SPECS = {
  frontCenterX: 0.84,
  frontCenterY: 0.36,
  frontCenterZ: 1.58,
  frontWidth: 0.33,
  frontRadius: 0.36,
  rearCenterX: 0.84,
  rearCenterY: 0.36,
  rearCenterZ: -1.52,
  rearWidth: 0.41,
  rearRadius: 0.36,
} as const;

export interface F1CarVisual {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontLeftSteering: THREE.Group;
  frontRightSteering: THREE.Group;
  wheels: THREE.Group[];
  drsFlap: THREE.Object3D;
  rainLightMat: THREE.MeshStandardMaterial;
  brakeDiscMats: THREE.MeshStandardMaterial[];
  sidewallMat: THREE.MeshStandardMaterial;
  rubberMat: THREE.MeshStandardMaterial;
  steeringWheelGroup: THREE.Group;
  steeringShiftLeds: THREE.Mesh[];
  paintMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  helmetMat: THREE.MeshStandardMaterial;
  numberPlateMat: THREE.MeshBasicMaterial;
  cockpitCameraAnchor: THREE.Object3D;
  tcamCameraAnchor: THREE.Object3D;
  setHelmetVisible: (visible: boolean) => void;
  setWheelMotionBlur: (wheelOmega: number) => void;
  updateSuspension: (pitch: number, roll: number, steerAngle: number) => void;
  updateActiveAero?: (active: boolean, dt: number) => void;
  configureDisplay?: (accent: string, showRpmBar: boolean, label?: string) => void;
  updateSteeringTelemetry: (
    gear: number,
    speedKmh: number,
    rpm: number,
    maxRpm: number,
    ersCharge: number,
    ersActive: boolean,
    drsActive: boolean,
    drsEligible: boolean,
  ) => void;
  setDamage: (front: number, rear: number) => void;
  updateLivery: (
    primaryColor: string,
    accentColor: string,
    helmetColor: string,
    numberDecalMap: THREE.Texture,
  ) => void;
  dispose: () => void;
}

export interface CarVisualOptions {
  primaryColor: string;
  accentColor: string;
  helmetColor: string;
  carNumber: number;
  carbonMap: THREE.Texture;
  carbonNormalMap?: THREE.Texture;
  carbonRoughnessMap?: THREE.Texture;
  tireDryMap?: THREE.Texture;
  tireDryNormalMap?: THREE.Texture;
  tireSidewallDryMap?: THREE.Texture;
  tireSidewallBlurMap?: THREE.Texture;
  numberDecalMap: THREE.Texture;
  contactShadowMap: THREE.Texture;
  enableSteeringScreen?: boolean;
  pilotDetail?: boolean;
}

export interface SharedCarGeometries {
  shadowGeo: THREE.BufferGeometry;
  floorGeo: THREE.BufferGeometry;
  edgeWingGeo: THREE.BufferGeometry;
  diffuserGeo: THREE.BufferGeometry;
  noseExtrudeGeo: THREE.BufferGeometry;
  tubSideGeo: THREE.BufferGeometry;
  cockpitRearGeo: THREE.BufferGeometry;
  noseSpineGeo: THREE.BufferGeometry;
  noseTipGeo: THREE.BufferGeometry;
  numberPlateGeo: THREE.BufferGeometry;
  podGeo: THREE.BufferGeometry;
  podStripeGeo: THREE.BufferGeometry;
  intakeGeo: THREE.BufferGeometry;
  stalkGeo: THREE.BufferGeometry;
  mirrorGeo: THREE.BufferGeometry;
  engineCoverGeo: THREE.BufferGeometry;
  airboxGeo: THREE.BufferGeometry;
  airboxHoleGeo: THREE.BufferGeometry;
  sharkfinGeo: THREE.BufferGeometry;
  tcamStemGeo: THREE.BufferGeometry;
  tcamBarGeo: THREE.BufferGeometry;
  exhaustGeo: THREE.BufferGeometry;
  haloLoopGeo: THREE.BufferGeometry;
  haloPillarGeo: THREE.BufferGeometry;
  helmetGeo: THREE.BufferGeometry;
  visorGeo: THREE.BufferGeometry;
  steeringColumnGeo: THREE.BufferGeometry;
  wheelYokeGeo: THREE.BufferGeometry;
  wheelGripGeo: THREE.BufferGeometry;
  wheelThumbGeo: THREE.BufferGeometry;
  wheelScreenBezelGeo: THREE.BufferGeometry;
  wheelScreenGeo: THREE.BufferGeometry;
  wheelLedGeo: THREE.BufferGeometry;
  wheelRotaryGeo: THREE.BufferGeometry;
  wheelButtonGeo: THREE.BufferGeometry;
  wheelPaddleGeo: THREE.BufferGeometry;
  fwMainGeo: THREE.BufferGeometry;
  fwPlane1Geo: THREE.BufferGeometry;
  fwPlane2Geo: THREE.BufferGeometry;
  fwEndGeo: THREE.BufferGeometry;
  rwBeamGeo: THREE.BufferGeometry;
  rwMainGeo: THREE.BufferGeometry;
  drsFlapGeo: THREE.BufferGeometry;
  rwEndGeo: THREE.BufferGeometry;
  rwPylonGeo: THREE.BufferGeometry;
  rainLightGeo: THREE.BufferGeometry;
  wishboneUpperGeo: THREE.BufferGeometry;
  wishboneLowerGeo: THREE.BufferGeometry;
  tireFrontGeo: THREE.BufferGeometry;
  tireRearGeo: THREE.BufferGeometry;
  sidewallFrontGeo: THREE.BufferGeometry;
  sidewallRearGeo: THREE.BufferGeometry;
  wheelBlurFrontGeo: THREE.BufferGeometry;
  wheelBlurRearGeo: THREE.BufferGeometry;
  rimBarrelFrontGeo: THREE.BufferGeometry;
  rimBarrelRearGeo: THREE.BufferGeometry;
  wheelSpokesGeo: THREE.BufferGeometry;
  lockNutFrontGeo: THREE.BufferGeometry;
  lockNutRearGeo: THREE.BufferGeometry;
  brakeDiscGeo: THREE.BufferGeometry;
  caliperGeo: THREE.BufferGeometry;
}

let _sharedGeos: SharedCarGeometries | null = null;

const RIM_RADIUS = 0.224;
const SIDEWALL_OUTER_RADIUS = 0.338;

/**
 * Exact tire sidewall lateral Z profile as a function of radius r in [RIM_RADIUS, SIDEWALL_OUTER_RADIUS].
 * Used by both the tire carcass LatheGeometry and the contoured molded sidewall ring so gap = 0.
 */
function tireSidewallZ(r: number, halfW: number): number {
  const u = Math.max(0, Math.min(1, (r - RIM_RADIUS) / (SIDEWALL_OUTER_RADIUS - RIM_RADIUS)));
  const bulge = Math.sin(u * Math.PI) * 0.014 - Math.pow(u, 2.4) * 0.016;
  return halfW - 0.006 + bulge;
}

function createTireCarcassGeometry(tireWidth: number, tireRadius = 0.36): THREE.BufferGeometry {
  const halfW = tireWidth * 0.5;
  const pts: THREE.Vector2[] = [];

  // Inner sidewall (bead -> outer shoulder, 9 points)
  const swSteps = 8;
  for (let i = 0; i <= swSteps; i++) {
    const r = RIM_RADIUS + (i / swSteps) * (SIDEWALL_OUTER_RADIUS - RIM_RADIUS);
    pts.push(new THREE.Vector2(r, -tireSidewallZ(r, halfW)));
  }

  // Rounded tread shoulder transition + flat crowned tread (-halfW -> +halfW, 15 points)
  const shoulderZStart = tireSidewallZ(SIDEWALL_OUTER_RADIUS, halfW);
  const shoulderSteps = 5;
  for (let i = 1; i <= shoulderSteps; i++) {
    const t = i / shoulderSteps;
    const ang = (1 - t) * (Math.PI * 0.5);
    const r = SIDEWALL_OUTER_RADIUS + (tireRadius - 0.003 - SIDEWALL_OUTER_RADIUS) * Math.cos(ang);
    const z = -(shoulderZStart - 0.032 * t);
    pts.push(new THREE.Vector2(r, z));
  }

  const treadHalfZ = shoulderZStart - 0.032;
  const treadSteps = 6;
  for (let i = 1; i < treadSteps; i++) {
    const f = i / treadSteps; // 0..1 from -treadHalfZ to +treadHalfZ
    const z = -treadHalfZ + f * (treadHalfZ * 2);
    const crown = Math.sin(f * Math.PI) * 0.003;
    pts.push(new THREE.Vector2(tireRadius - 0.003 + crown, z));
  }

  for (let i = 0; i <= shoulderSteps; i++) {
    const t = i / shoulderSteps;
    const ang = t * (Math.PI * 0.5);
    const r = SIDEWALL_OUTER_RADIUS + (tireRadius - 0.003 - SIDEWALL_OUTER_RADIUS) * Math.cos(ang);
    const z = treadHalfZ + 0.032 * t;
    pts.push(new THREE.Vector2(r, z));
  }

  // Outer sidewall (shoulder -> outer bead, 9 points)
  for (let i = swSteps - 1; i >= 0; i--) {
    const r = RIM_RADIUS + (i / swSteps) * (SIDEWALL_OUTER_RADIUS - RIM_RADIUS);
    pts.push(new THREE.Vector2(r, tireSidewallZ(r, halfW)));
  }

  let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, 128);
  // Map U across tread width [0..1] and V wrapping 2x around circumference
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const circU = uv.getX(i);
    const profV = uv.getY(i);
    uv.setXY(i, profV, circU * 2.0);
  }
  uv.needsUpdate = true;
  geo.rotateZ(Math.PI / 2);

  // Weld LatheGeometry wrap seam vertices before computing normals & tangents (eliminates lighting seam)
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  geo.computeTangents();
  return geo;
}

/**
 * Contoured molded sidewall ring following the exact tireSidewallZ(r) contour on both +X and -X faces
 * so sidewall markings sit flush on the rubber with zero floating gap.
 */
function createContouredSidewallPairGeometry(tireWidth: number): THREE.BufferGeometry {
  const halfW = tireWidth * 0.5;
  const steps = 10;
  const ptsOuter: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = (RIM_RADIUS + 0.002) + (i / steps) * (SIDEWALL_OUTER_RADIUS - 0.004 - RIM_RADIUS);
    ptsOuter.push(new THREE.Vector2(r, tireSidewallZ(r, halfW) + 0.0014));
  }

  const buildSide = (signX: 1 | -1): THREE.BufferGeometry => {
    const g = new THREE.LatheGeometry(ptsOuter, 72);
    // Rotate -PI/2 maps Lathe +Y -> +X; Rotate +PI/2 maps Lathe +Y -> -X
    g.rotateZ(signX === 1 ? -Math.PI / 2 : Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // Planar radial UVs centered at (0.5, 0.5)
      uv.setXY(i, (signX * z) / (SIDEWALL_OUTER_RADIUS * 2) + 0.5, y / (SIDEWALL_OUTER_RADIUS * 2) + 0.5);
    }
    uv.needsUpdate = true;
    const nonIdx = g.toNonIndexed();
    g.dispose();
    nonIdx.computeVertexNormals();
    return nonIdx;
  };

  const gOuter = buildSide(1);
  const gInner = buildSide(-1);
  const merged = mergeGeometries([gOuter, gInner], false);
  gOuter.dispose();
  gInner.dispose();
  return merged;
}

/**
 * Open annular 18-inch rim barrel (recessed inner bore exposing brake rotor & caliper through spokes).
 */
function createWheelBarrelGeometry(tireWidth: number): THREE.BufferGeometry {
  const halfW = tireWidth * 0.5;
  const lipZ = halfW - 0.006;
  const innerZ = -(halfW - 0.01);
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.198, innerZ),
    new THREE.Vector2(RIM_RADIUS, innerZ),
    new THREE.Vector2(RIM_RADIUS, lipZ),
    new THREE.Vector2(0.208, lipZ + 0.002),
    new THREE.Vector2(0.198, lipZ - 0.018),
    new THREE.Vector2(0.198, innerZ),
  ];
  let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, 48);
  geo.rotateZ(-Math.PI / 2);
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 10-spoke open forged alloy star wheel + hub ring merged into a single draw call.
 */
function createWheelSpokesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spokeCount = 10;
  for (let i = 0; i < spokeCount; i++) {
    const ang = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.018, 0.145, 0.016);
    spoke.translate(0, 0.125, 0);
    spoke.rotateX(ang);
    parts.push(spoke.toNonIndexed());
    spoke.dispose();
  }
  // Thin outer tension ring
  const hubRing = new THREE.CylinderGeometry(0.062, 0.066, 0.024, 20);
  hubRing.rotateZ(Math.PI / 2);
  parts.push(hubRing.toNonIndexed());
  hubRing.dispose();

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

function createWheelBlurDiscPairGeometry(tireWidth: number): THREE.BufferGeometry {
  const halfW = tireWidth * 0.5;
  const buildDisc = (signX: 1 | -1): THREE.BufferGeometry => {
    const ring = new THREE.RingGeometry(0.065, SIDEWALL_OUTER_RADIUS - 0.003, 56, 1);
    const pos = ring.attributes.position;
    const uv = ring.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      uv.setXY(i, x / (SIDEWALL_OUTER_RADIUS * 2) + 0.5, y / (SIDEWALL_OUTER_RADIUS * 2) + 0.5);
    }
    uv.needsUpdate = true;
    ring.rotateY(signX === 1 ? Math.PI / 2 : -Math.PI / 2);
    ring.translate(signX * (halfW + 0.008), 0, 0);
    const nonIdx = ring.toNonIndexed();
    ring.dispose();
    return nonIdx;
  };
  const d1 = buildDisc(1);
  const d2 = buildDisc(-1);
  const merged = mergeGeometries([d1, d2], false);
  d1.dispose();
  d2.dispose();
  return merged;
}

export function getSharedCarGeometries(): SharedCarGeometries {
  if (_sharedGeos) return _sharedGeos;

  const shadowGeo = new THREE.PlaneGeometry(2.75, 5.75);
  shadowGeo.rotateX(-Math.PI / 2);

  // Venturi Floor: rotateX(+PI/2) + translateY(depth) preserves Shape (x, y) -> (x, +z) cleanly!
  // Kept strictly inside |x| <= 0.56 for z <= -1.06 (clear of rear tires |x| >= 0.635, z in [-1.88, -1.16])
  // and ending at z = +1.05 (clear of front tires z in [1.22, 1.94]).
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-0.34, 1.05);
  floorShape.lineTo(0.34, 1.05);
  floorShape.lineTo(0.92, 0.55);
  floorShape.lineTo(0.92, -0.96);
  floorShape.lineTo(0.56, -1.08);
  floorShape.lineTo(0.54, -2.26);
  floorShape.lineTo(-0.54, -2.26);
  floorShape.lineTo(-0.56, -1.08);
  floorShape.lineTo(-0.92, -0.96);
  floorShape.lineTo(-0.92, 0.55);
  floorShape.closePath();
  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  floorGeo.rotateX(Math.PI / 2);
  floorGeo.translate(0, 0.036, 0);

  // Merged carbon rear diffuser ramp + 4 vertical strakes (1 draw call instead of 5)
  const diffParts: THREE.BufferGeometry[] = [];
  const ramp = new THREE.BoxGeometry(1.0, 0.05, 0.62);
  ramp.rotateX(-0.24);
  ramp.translate(0, 0.19, -2.08);
  diffParts.push(ramp.toNonIndexed());
  ramp.dispose();
  for (const fx of [-0.36, -0.14, 0.14, 0.36]) {
    const fin = new THREE.BoxGeometry(0.025, 0.18, 0.45);
    fin.translate(fx, 0.17, -2.14);
    diffParts.push(fin.toNonIndexed());
    fin.dispose();
  }
  const diffuserGeo = mergeGeometries(diffParts, false);
  for (const p of diffParts) p.dispose();
  diffuserGeo.computeVertexNormals();

  // Monocoque & Nose: rotateX(+PI/2) maps Shape y [0.58..2.55] forward along +Z
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-0.34, 0.58);
  noseShape.lineTo(0.34, 0.58);
  noseShape.lineTo(0.28, 1.25);
  noseShape.lineTo(0.16, 2.05);
  noseShape.lineTo(0.09, 2.55);
  noseShape.lineTo(-0.09, 2.55);
  noseShape.lineTo(-0.16, 2.05);
  noseShape.lineTo(-0.28, 1.25);
  noseShape.closePath();
  const noseExtrudeGeo = new THREE.ExtrudeGeometry(noseShape, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  noseExtrudeGeo.rotateX(Math.PI / 2);
  noseExtrudeGeo.translate(0, 0.25, 0);

  const noseSpineGeo = new THREE.CylinderGeometry(0.085, 0.21, 1.72, 12);
  noseSpineGeo.rotateX(Math.PI / 2);

  // Sidepods & Sharkfin (shortened depth 1.46 so trailing undercut terminates cleanly ahead of rear wheels)
  const podShape = new THREE.Shape();
  podShape.moveTo(0, 0.05);
  podShape.lineTo(0.47, 0.09);
  podShape.lineTo(0.44, 0.31);
  podShape.lineTo(0.08, 0.37);
  podShape.closePath();
  const podGeo = new THREE.ExtrudeGeometry(podShape, {
    depth: 1.44,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  podGeo.rotateY(Math.PI);

  const engineCoverGeo = new THREE.CylinderGeometry(0.09, 0.31, 1.65, 12);
  engineCoverGeo.rotateX(Math.PI / 2);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-1.38, 0);
  finShape.lineTo(-1.28, 0.29);
  finShape.lineTo(-0.08, 0.44);
  finShape.closePath();
  const sharkfinGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.026, bevelEnabled: false });
  sharkfinGeo.rotateY(-Math.PI / 2);

  const exhaustGeo = new THREE.CylinderGeometry(0.048, 0.052, 0.32, 10);
  exhaustGeo.rotateX(Math.PI / 2);

  // Halo
  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.31, 0.54, -0.02),
    new THREE.Vector3(-0.29, 0.72, 0.32),
    new THREE.Vector3(0, 0.75, 0.7),
    new THREE.Vector3(0.29, 0.72, 0.32),
    new THREE.Vector3(0.31, 0.54, -0.02),
  ]);
  const haloLoopGeo = new THREE.TubeGeometry(haloCurve, 22, 0.023, 8, false);
  const haloPillarCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.52, 0.86),
    new THREE.Vector3(0, 0.64, 0.79),
    new THREE.Vector3(0, 0.75, 0.7),
  ]);
  const haloPillarGeo = new THREE.TubeGeometry(haloPillarCurve, 8, 0.02, 8, false);

  // Sculpted F1 Butterfly Yoke Steering Wheel
  const yokeShape = new THREE.Shape();
  yokeShape.moveTo(-0.09, 0.068);
  yokeShape.quadraticCurveTo(0, 0.082, 0.09, 0.068);
  yokeShape.lineTo(0.145, 0.058);
  yokeShape.quadraticCurveTo(0.165, 0.02, 0.148, -0.055);
  yokeShape.lineTo(0.12, -0.078);
  yokeShape.quadraticCurveTo(0.07, -0.048, 0.05, -0.068);
  yokeShape.lineTo(-0.05, -0.068);
  yokeShape.quadraticCurveTo(-0.07, -0.048, -0.12, -0.078);
  yokeShape.lineTo(-0.148, -0.055);
  yokeShape.quadraticCurveTo(-0.165, 0.02, -0.145, 0.058);
  yokeShape.closePath();

  const wheelYokeGeo = new THREE.ExtrudeGeometry(yokeShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  wheelYokeGeo.translate(0, 0, -0.011);

  const steeringColumnGeo = new THREE.CylinderGeometry(0.024, 0.03, 0.19, 12);
  steeringColumnGeo.rotateX(Math.PI / 2);

  const wheelGripGeo = new THREE.CapsuleGeometry(0.02, 0.088, 6, 10);
  const wheelThumbGeo = new THREE.CapsuleGeometry(0.012, 0.026, 4, 8);
  const wheelRotaryGeo = new THREE.CylinderGeometry(0.0088, 0.0094, 0.011, 12);
  wheelRotaryGeo.rotateX(Math.PI / 2);

  // Front & Rear Wing Endplates
  const endShape = new THREE.Shape();
  endShape.moveTo(0.24, 0);
  endShape.lineTo(-0.28, 0);
  endShape.lineTo(-0.26, 0.28);
  endShape.quadraticCurveTo(0.05, 0.24, 0.22, 0.08);
  endShape.closePath();
  const fwEndGeo = new THREE.ExtrudeGeometry(endShape, { depth: 0.032, bevelEnabled: false });
  fwEndGeo.rotateY(-Math.PI / 2);

  const drsFlapGeo = new THREE.BoxGeometry(1.02, 0.032, 0.22);
  drsFlapGeo.translate(0, 0, -0.08);

  const rwEndShape = new THREE.Shape();
  rwEndShape.moveTo(-0.24, -0.42);
  rwEndShape.lineTo(0.2, -0.42);
  rwEndShape.lineTo(0.24, 0.22);
  rwEndShape.lineTo(-0.18, 0.24);
  rwEndShape.closePath();
  const rwEndGeo = new THREE.ExtrudeGeometry(rwEndShape, { depth: 0.032, bevelEnabled: false });
  rwEndGeo.rotateY(-Math.PI / 2);

  // Realistic Seam-Free Lathe Tires + Contoured Sidewalls + Open 18-inch Spoked Barrels + Motion Blur Discs
  const tireFrontGeo = createTireCarcassGeometry(CAR_TIRE_SPECS.frontWidth, CAR_TIRE_SPECS.frontRadius);
  const tireRearGeo = createTireCarcassGeometry(CAR_TIRE_SPECS.rearWidth, CAR_TIRE_SPECS.rearRadius);
  const sidewallFrontGeo = createContouredSidewallPairGeometry(CAR_TIRE_SPECS.frontWidth);
  const sidewallRearGeo = createContouredSidewallPairGeometry(CAR_TIRE_SPECS.rearWidth);
  const wheelBlurFrontGeo = createWheelBlurDiscPairGeometry(CAR_TIRE_SPECS.frontWidth);
  const wheelBlurRearGeo = createWheelBlurDiscPairGeometry(CAR_TIRE_SPECS.rearWidth);

  const rimBarrelFrontGeo = createWheelBarrelGeometry(CAR_TIRE_SPECS.frontWidth);
  const rimBarrelRearGeo = createWheelBarrelGeometry(CAR_TIRE_SPECS.rearWidth);
  const wheelSpokesGeo = createWheelSpokesGeometry();

  const lockNutFrontGeo = new THREE.CylinderGeometry(0.046, 0.056, 0.34, 16);
  lockNutFrontGeo.rotateZ(Math.PI / 2);
  const lockNutRearGeo = new THREE.CylinderGeometry(0.046, 0.056, 0.42, 16);
  lockNutRearGeo.rotateZ(Math.PI / 2);

  const brakeDiscGeo = new THREE.CylinderGeometry(0.184, 0.184, 0.034, 28);
  brakeDiscGeo.rotateZ(Math.PI / 2);

  // Wishbone geometries anchored from inboard chassis pickup (x = 0) out to hub (+0.62 in local X)
  const wishboneUpperGeo = new THREE.BoxGeometry(0.58, 0.024, 0.062);
  wishboneUpperGeo.translate(0.29, 0, 0);
  const wishboneLowerGeo = new THREE.BoxGeometry(0.60, 0.024, 0.072);
  wishboneLowerGeo.translate(0.30, 0, 0);

  _sharedGeos = {
    shadowGeo,
    floorGeo,
    edgeWingGeo: new THREE.BoxGeometry(0.055, 0.075, 1.48),
    diffuserGeo,
    noseExtrudeGeo,
    tubSideGeo: new THREE.BoxGeometry(0.09, 0.34, 1.15),
    cockpitRearGeo: new THREE.BoxGeometry(0.62, 0.38, 0.22),
    noseSpineGeo,
    noseTipGeo: new THREE.SphereGeometry(0.095, 12, 10),
    numberPlateGeo: new THREE.PlaneGeometry(0.26, 0.32),
    podGeo,
    podStripeGeo: new THREE.BoxGeometry(0.11, 0.022, 1.24),
    intakeGeo: new THREE.BoxGeometry(0.36, 0.17, 0.09),
    stalkGeo: new THREE.BoxGeometry(0.24, 0.02, 0.04),
    mirrorGeo: new THREE.BoxGeometry(0.16, 0.075, 0.1),
    engineCoverGeo,
    airboxGeo: new THREE.CylinderGeometry(0.11, 0.14, 0.42, 10),
    airboxHoleGeo: new THREE.BoxGeometry(0.14, 0.12, 0.05),
    sharkfinGeo,
    tcamStemGeo: new THREE.BoxGeometry(0.055, 0.15, 0.12),
    tcamBarGeo: new THREE.BoxGeometry(0.42, 0.045, 0.085),
    exhaustGeo,
    haloLoopGeo,
    haloPillarGeo,
    helmetGeo: new THREE.SphereGeometry(0.155, 16, 12),
    visorGeo: new THREE.CylinderGeometry(0.157, 0.157, 0.072, 14, 1, false, -0.7, 1.4),
    steeringColumnGeo,
    wheelYokeGeo,
    wheelGripGeo,
    wheelThumbGeo,
    wheelScreenBezelGeo: new THREE.BoxGeometry(0.122, 0.066, 0.012),
    wheelScreenGeo: new THREE.PlaneGeometry(0.114, 0.058),
    wheelLedGeo: new THREE.BoxGeometry(0.0068, 0.008, 0.008),
    wheelRotaryGeo,
    wheelButtonGeo: new THREE.CylinderGeometry(0.007, 0.007, 0.01, 10),
    wheelPaddleGeo: new THREE.BoxGeometry(0.052, 0.032, 0.006),
    fwMainGeo: new THREE.BoxGeometry(1.98, 0.032, 0.36),
    fwPlane1Geo: new THREE.BoxGeometry(0.94, 0.026, 0.2),
    fwPlane2Geo: new THREE.BoxGeometry(0.88, 0.022, 0.15),
    fwEndGeo,
    rwBeamGeo: new THREE.BoxGeometry(0.94, 0.028, 0.2),
    rwMainGeo: new THREE.BoxGeometry(1.04, 0.038, 0.27),
    drsFlapGeo,
    rwEndGeo,
    rwPylonGeo: new THREE.BoxGeometry(0.038, 0.48, 0.22),
    rainLightGeo: new THREE.BoxGeometry(0.09, 0.14, 0.04),
    wishboneUpperGeo,
    wishboneLowerGeo,
    tireFrontGeo,
    tireRearGeo,
    sidewallFrontGeo,
    sidewallRearGeo,
    wheelBlurFrontGeo,
    wheelBlurRearGeo,
    rimBarrelFrontGeo,
    rimBarrelRearGeo,
    wheelSpokesGeo,
    lockNutFrontGeo,
    lockNutRearGeo,
    brakeDiscGeo,
    caliperGeo: new THREE.BoxGeometry(0.048, 0.112, 0.088),
  };

  return _sharedGeos;
}

function drawSteeringOledScreen(
  ctx: CanvasRenderingContext2D,
  gear: number,
  speedKmh: number,
  rpm: number,
  maxRpm: number,
  ersCharge: number,
  ersActive: boolean,
  drsActive: boolean,
  drsEligible: boolean,
  accent = '#334155',
  showRpmBar = true,
  label = '',
): void {
  const w = 256;
  const h = 128;

  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, w, h);

  if (showRpmBar) {
    const rpmPct = Math.max(0, Math.min(1, (rpm - 4500) / (maxRpm - 4500)));
    const bars = 18;
    const litBars = Math.round(rpmPct * bars);
    const barW = (w - 20) / bars;
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle =
        i < litBars
          ? i < 6
            ? '#22c55e'
            : i < 12
            ? '#ef4444'
            : '#38bdf8'
          : '#1e293b';
      ctx.fillRect(10 + i * barW, 8, barW - 2, 10);
    }
  }

  if (label) {
    ctx.fillStyle = '#b7df45';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, w / 2, 5);
  }

  // Left Speed block
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('KM/H', 12, 27);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.fillText(String(Math.max(0, Math.round(speedKmh))), 12, 42);

  // Center Big Gear
  ctx.fillStyle = '#141a24';
  ctx.fillRect(96, 26, 64, 62);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(96, 26, 64, 62);

  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 48px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const gearLabel = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear);
  ctx.fillText(gearLabel, 128, 59);

  // Right RPM block
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px Inter, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('RPM', w - 12, 27);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px Inter, Arial, sans-serif';
  ctx.fillText(String(Math.round(rpm)), w - 12, 46);

  // Bottom Left: ERS Battery Bar
  ctx.textAlign = 'left';
  ctx.fillStyle = ersActive ? '#67e8f9' : '#38bdf8';
  ctx.font = 'bold 13px Inter, Arial, sans-serif';
  ctx.fillText(`ERS ${Math.round(ersCharge)}%`, 12, 96);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(12, 113, 130, 8);
  ctx.fillStyle = ersActive ? '#22d3ee' : '#0ea5e9';
  ctx.fillRect(12, 113, Math.round((Math.max(0, Math.min(100, ersCharge)) / 100) * 130), 8);

  // Bottom Right: DRS Status Pill
  const drsBg = drsActive ? '#10b981' : drsEligible ? '#065f46' : '#1e293b';
  const drsFg = drsActive ? '#052e16' : drsEligible ? '#6ee7b7' : '#64748b';
  ctx.fillStyle = drsBg;
  ctx.fillRect(168, 95, 76, 26);
  ctx.fillStyle = drsFg;
  ctx.font = 'bold 15px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DRS', 206, 109);
}

/**
 * Builds a procedural ground-effect Formula prototype using shared
 * merged static geometries, open 18-inch alloy spoked rims exposing glowing carbon brakes,
 * seam-free radial Lathe tires with contoured sidewalls, radial motion blur, and articulated wishbones.
 */
export function buildF1CarVisual(opts: CarVisualOptions): F1CarVisual {
  const g = getSharedCarGeometries();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const localDisposables: Array<{ dispose: () => void }> = [];

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.primaryColor),
    metalness: 0.56,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.35,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.accentColor),
    metalness: 0.38,
    roughness: 0.24,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.25,
  });

  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.helmetColor),
    roughness: 0.14,
    metalness: 0.3,
    clearcoat: 1.0,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: opts.carbonMap,
    normalMap: opts.carbonNormalMap ?? null,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: opts.carbonRoughnessMap ?? null,
    metalness: 0.26,
    roughness: 0.64,
    envMapIntensity: 1.1,
  });

  const titaniumMat = new THREE.MeshPhysicalMaterial({
    color: 0x475569,
    metalness: 0.92,
    roughness: 0.18,
    anisotropy: 0.85,
    anisotropyRotation: Math.PI / 4,
  });

  const rubberMat = new THREE.MeshStandardMaterial({
    color: opts.tireDryMap ? 0xffffff : 0x111317,
    map: opts.tireDryMap ?? null,
    normalMap: opts.tireDryNormalMap ?? null,
    normalScale: new THREE.Vector2(1.15, 1.15),
    metalness: 0.05,
    roughness: 0.84,
  });

  const sidewallMat = new THREE.MeshStandardMaterial({
    color: opts.tireSidewallDryMap ? 0xffffff : 0x181b22,
    map: opts.tireSidewallDryMap ?? null,
    roughness: 0.72,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const wheelBlurMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: opts.tireSidewallBlurMap ?? null,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const wheelBarrelMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    metalness: 0.78,
    roughness: 0.26,
  });

  const wheelSpokeMat = new THREE.MeshStandardMaterial({
    color: 0x262c38,
    metalness: 0.84,
    roughness: 0.24,
    transparent: true,
    opacity: 1.0,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    metalness: 0.6,
    roughness: 0.28,
  });

  const rainLightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 0.3,
    roughness: 0.2,
    metalness: 0.1,
  });

  const shadowMat = new THREE.MeshBasicMaterial({
    map: opts.contactShadowMap,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  const numberPlateMat = new THREE.MeshBasicMaterial({ map: opts.numberDecalMap });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.95,
    roughness: 0.06,
    clearcoat: 1.0,
  });

  localDisposables.push(
    paintMat,
    accentMat,
    helmetMat,
    carbonMat,
    titaniumMat,
    rubberMat,
    sidewallMat,
    wheelBlurMat,
    wheelBarrelMat,
    wheelSpokeMat,
    caliperMat,
    rainLightMat,
    shadowMat,
    numberPlateMat,
    visorMat,
  );

  const brakeDiscMats: THREE.MeshStandardMaterial[] = [];
  const wheelBlurMeshes: THREE.Mesh[] = [];

  // 0. Grounding Radial Contact Shadow Plane
  const contactShadow = new THREE.Mesh(g.shadowGeo, shadowMat);
  contactShadow.name='contact-shadow';
  contactShadow.position.set(0, 0.016, 0);
  root.add(contactShadow);

  // 1. Carbon Venturi Floor, Edge Wings & Merged Multi-Strake Rear Diffuser
  const floor = new THREE.Mesh(g.floorGeo, carbonMat);
  floor.position.set(0, 0.085, 0);
  floor.castShadow = true;
  floor.receiveShadow = true;
  bodyGroup.add(floor);

  for (const sx of [-0.93, 0.93]) {
    const strake = new THREE.Mesh(g.edgeWingGeo, accentMat);
    strake.position.set(sx, 0.14, -0.22);
    bodyGroup.add(strake);
  }

  const diffuser = new THREE.Mesh(g.diffuserGeo, carbonMat);
  bodyGroup.add(diffuser);

  // 2. Sculpted Monocoque, Nosecone, Rounded Nose Tip & Driver Number Decal
  const pilotNose = opts.pilotDetail ? buildPilotNose() : null;
  if(pilotNose)localDisposables.push(pilotNose);
  const monocoque = new THREE.Mesh(pilotNose ?? g.noseExtrudeGeo, paintMat);
  monocoque.position.set(0, pilotNose ? 0 : 0.17, 0);
  monocoque.castShadow = true;
  bodyGroup.add(monocoque);

  for (const side of [-1, 1]) {
    const tubSide = new THREE.Mesh(g.tubSideGeo, paintMat);
    tubSide.position.set(side * 0.31, 0.38, 0.08);
    bodyGroup.add(tubSide);
  }
  const cockpitRear = new THREE.Mesh(g.cockpitRearGeo, carbonMat);
  cockpitRear.position.set(0, 0.42, -0.35);
  bodyGroup.add(cockpitRear);

  const noseSpine = new THREE.Mesh(g.noseSpineGeo, paintMat);
  noseSpine.scale.set(1.12, 0.62, 1);
  noseSpine.position.set(0, 0.41, 1.66);
  noseSpine.rotation.x = 0.095;
  noseSpine.castShadow = true;
  noseSpine.visible = !opts.pilotDetail;
  bodyGroup.add(noseSpine);

  const noseTip = new THREE.Mesh(g.noseTipGeo, paintMat);
  noseTip.scale.set(1.05, 0.62, 1.45);
  noseTip.position.set(0, 0.31, 2.53);
  noseTip.visible = !opts.pilotDetail;
  bodyGroup.add(noseTip);

  const numberPlate = new THREE.Mesh(g.numberPlateGeo, numberPlateMat);
  numberPlate.rotation.x = -Math.PI / 2 + 0.095;
  numberPlate.position.set(0, 0.505, 1.52);
  bodyGroup.add(numberPlate);

  // 3. Sculpted Downwash Sidepods, Undercuts & Wing Mirrors
  for (const side of [1, -1]) {
    const pod = new THREE.Mesh(g.podGeo, paintMat);
    pod.scale.x = -side;
    pod.position.set(side * 0.28, 0.19, 0.42);
    pod.rotation.y = side * -0.075;
    pod.castShadow = true;
    pod.visible=!opts.pilotDetail;
    bodyGroup.add(pod);

    const podStripe = new THREE.Mesh(g.podStripeGeo, accentMat);
    podStripe.position.set(side * 0.51, 0.565, -0.22);
    podStripe.rotation.y = side * -0.075;
    podStripe.rotation.x = 0.04;
    podStripe.visible=!opts.pilotDetail;
    bodyGroup.add(podStripe);

    const intake = new THREE.Mesh(g.intakeGeo, carbonMat);
    intake.position.set(side * 0.52, 0.42, 0.43);
    intake.visible=!opts.pilotDetail;
    bodyGroup.add(intake);

    const stalk = new THREE.Mesh(g.stalkGeo, carbonMat);
    stalk.position.set(side * 0.52, 0.62, 0.56);
    bodyGroup.add(stalk);

    const mirrorHousing = new THREE.Mesh(g.mirrorGeo, paintMat);
    mirrorHousing.position.set(side * 0.64, 0.635, 0.56);
    bodyGroup.add(mirrorHousing);
  }

  // 4. Engine Cover, Airbox Scoop, Sharkfin & Exhaust
  const engineCover = new THREE.Mesh(g.engineCoverGeo, paintMat);
  engineCover.scale.set(0.92, 1.08, 1);
  engineCover.position.set(0, 0.54, -0.82);
  engineCover.rotation.x = 0.09;
  engineCover.castShadow = true;
  engineCover.visible=!opts.pilotDetail;
  bodyGroup.add(engineCover);

  const airbox = new THREE.Mesh(g.airboxGeo, paintMat);
  airbox.rotation.x = Math.PI / 2;
  airbox.position.set(0, 0.84, -0.05);
  bodyGroup.add(airbox);

  const airboxHole = new THREE.Mesh(g.airboxHoleGeo, carbonMat);
  airboxHole.position.set(0, 0.85, 0.15);
  bodyGroup.add(airboxHole);

  const sharkfin = new THREE.Mesh(g.sharkfinGeo, accentMat);
  sharkfin.position.set(0.013, 0.65, -0.2);
  sharkfin.visible=!opts.pilotDetail;
  bodyGroup.add(sharkfin);

  const tcamStem = new THREE.Mesh(g.tcamStemGeo, carbonMat);
  tcamStem.position.set(0, 0.99, -0.14);
  bodyGroup.add(tcamStem);

  const tcamBar = new THREE.Mesh(g.tcamBarGeo, accentMat);
  tcamBar.position.set(0, 1.075, -0.14);
  bodyGroup.add(tcamBar);

  const exhaust = new THREE.Mesh(g.exhaustGeo, titaniumMat);
  exhaust.position.set(0, 0.37, -2.14);
  bodyGroup.add(exhaust);

  // 5. TubeGeometry Halo Safety Structure
  const haloLoop = new THREE.Mesh(g.haloLoopGeo, carbonMat);
  haloLoop.castShadow = true;
  bodyGroup.add(haloLoop);

  const haloPillar = new THREE.Mesh(g.haloPillarGeo, carbonMat);
  bodyGroup.add(haloPillar);

  // 6. Driver Helmet, Iridium Visor & Authentic Interactive F1 Butterfly Steering Wheel
  const helmet = new THREE.Mesh(g.helmetGeo, helmetMat);
  helmet.position.set(0, 0.56, 0.08);
  bodyGroup.add(helmet);

  const visor = new THREE.Mesh(g.visorGeo, visorMat);
  visor.position.set(0, 0.575, 0.085);
  bodyGroup.add(visor);

  // Tilted Steering Column Mount so wheel rotates cleanly around its physical shaft axis
  const steeringMount = new THREE.Group();
  steeringMount.position.set(0, 0.675, 0.49);
  steeringMount.rotation.x = -0.30;
  bodyGroup.add(steeringMount);

  const steeringColumn = new THREE.Mesh(g.steeringColumnGeo, carbonMat);
  steeringColumn.position.set(0, 0, 0.095);
  steeringMount.add(steeringColumn);

  const steeringWheelGroup = new THREE.Group();
  steeringMount.add(steeringWheelGroup);

  const wheelPlate = new THREE.Mesh(g.wheelYokeGeo, carbonMat);
  steeringWheelGroup.add(wheelPlate);

  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x181b22,
    roughness: 0.92,
    metalness: 0.04,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.78,
    metalness: 0.06,
  });
  localDisposables.push(gripMat, gloveMat);

  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(g.wheelGripGeo, gripMat);
    grip.position.set(side * 0.146, -0.004, -0.002);
    grip.rotation.z = side * 0.1;
    steeringWheelGroup.add(grip);

    const thumb = new THREE.Mesh(g.wheelThumbGeo, gloveMat);
    thumb.position.set(side * 0.132, 0.018, -0.013);
    thumb.rotation.z = side * -0.52;
    thumb.rotation.x = 0.2;
    steeringWheelGroup.add(thumb);

    const palm = new THREE.Mesh(g.wheelThumbGeo, paintMat);
    palm.position.set(side * 0.162, -0.008, -0.004);
    palm.rotation.z = side * 0.12;
    steeringWheelGroup.add(palm);

    const paddle = new THREE.Mesh(g.wheelPaddleGeo, carbonMat);
    paddle.position.set(side * 0.088, 0.008, 0.026);
    paddle.rotation.y = side * -0.18;
    steeringWheelGroup.add(paddle);
  }

  const bezel = new THREE.Mesh(g.wheelScreenBezelGeo, titaniumMat);
  bezel.position.set(0, 0.004, -0.011);
  steeringWheelGroup.add(bezel);

  let screenCanvas: HTMLCanvasElement | null = null;
  let screenCtx: CanvasRenderingContext2D | null = null;
  let screenTex: THREE.CanvasTexture | null = null;
  let screenMat: THREE.MeshBasicMaterial;

  if (opts.enableSteeringScreen !== false) {
    screenCanvas = document.createElement('canvas');
    screenCanvas.width = 256;
    screenCanvas.height = 128;
    screenCtx = screenCanvas.getContext('2d');
    if (screenCtx) {
      drawSteeringOledScreen(screenCtx, 1, 0, 4000, 13000, 100, false, false, false);
    }
    screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.minFilter = THREE.LinearFilter;
    screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    localDisposables.push(screenTex, screenMat);
  } else {
    screenMat = new THREE.MeshBasicMaterial({ color: 0x0b1220 });
    localDisposables.push(screenMat);
  }

  const wheelScreen = new THREE.Mesh(g.wheelScreenGeo, screenMat);
  wheelScreen.position.set(0, 0.004, -0.0185);
  wheelScreen.rotation.y = Math.PI;
  steeringWheelGroup.add(wheelScreen);

  const steeringShiftLeds: THREE.Mesh[] = [];
  for (let i = 0; i < 15; i++) {
    const ledColor = i < 5 ? 0x22c55e : i < 10 ? 0xef4444 : 0x38bdf8;
    const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
    localDisposables.push(ledMat);
    const led = new THREE.Mesh(g.wheelLedGeo, ledMat);
    const xPos = -(i - 7) * 0.0086;
    const archY = 0.048 + Math.cos(((i - 7) / 7) * 0.65) * 0.0035;
    led.position.set(xPos, archY, -0.0155);
    steeringWheelGroup.add(led);
    steeringShiftLeds.push(led);
  }

  const rotarySpecs: Array<[number, number, number]> = [
    [-0.072, -0.036, 0xef4444],
    [-0.036, -0.044, 0x38bdf8],
    [0.0, -0.046, 0xfacc15],
    [0.036, -0.044, 0x22c55e],
    [0.072, -0.036, 0xf97316],
  ];
  for (const [rx, ry, rHex] of rotarySpecs) {
    const rMat = new THREE.MeshStandardMaterial({
      color: rHex,
      metalness: 0.7,
      roughness: 0.28,
    });
    localDisposables.push(rMat);
    const knob = new THREE.Mesh(g.wheelRotaryGeo, rMat);
    knob.position.set(rx, ry, -0.017);
    steeringWheelGroup.add(knob);
  }

  const buttonSpecs: Array<[number, number, number]> = [
    [-0.095, 0.032, 0x10b981],
    [-0.095, 0.004, 0xf59e0b],
    [0.095, 0.032, 0x3b82f6],
    [0.095, 0.004, 0xec4899],
  ];
  for (const [bx, by, bHex] of buttonSpecs) {
    const bMat = new THREE.MeshStandardMaterial({
      color: bHex,
      roughness: 0.35,
      metalness: 0.25,
    });
    localDisposables.push(bMat);
    const btn = new THREE.Mesh(g.wheelButtonGeo, bMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(bx, by, -0.016);
    steeringWheelGroup.add(btn);
  }

  // 7. Swept 3-Element Front Wing + Curved Endplates
  const frontWingGroup = new THREE.Group();
  frontWingGroup.position.set(0, 0.13, 2.38);
  frontWingGroup.add(new THREE.Mesh(g.fwMainGeo, carbonMat));

  for (const side of [-1, 1]) {
    const plane1 = new THREE.Mesh(g.fwPlane1Geo, paintMat);
    plane1.position.set(side * 0.51, 0.038, -0.04);
    plane1.rotation.y = side * -0.11;
    plane1.rotation.x = 0.16;
    frontWingGroup.add(plane1);

    const plane2 = new THREE.Mesh(g.fwPlane2Geo, accentMat);
    plane2.position.set(side * 0.52, 0.072, -0.12);
    plane2.rotation.y = side * -0.14;
    plane2.rotation.x = 0.24;
    frontWingGroup.add(plane2);

    const endplate = new THREE.Mesh(g.fwEndGeo, paintMat);
    endplate.position.set(side * 0.985, -0.02, 0);
    frontWingGroup.add(endplate);
  }
  bodyGroup.add(frontWingGroup);

  // 8. Rear Wing + Lower Beam Wing + Contoured Endplates + Animated DRS Flap
  const rearWingGroup = new THREE.Group();
  rearWingGroup.position.set(0, 0.72, -2.08);

  const beamWing = new THREE.Mesh(g.rwBeamGeo, carbonMat);
  beamWing.position.set(0, -0.34, 0.04);
  beamWing.rotation.x = 0.22;
  rearWingGroup.add(beamWing);

  const rwMain = new THREE.Mesh(g.rwMainGeo, carbonMat);
  rwMain.rotation.x = 0.14;
  rearWingGroup.add(rwMain);

  const drsFlap = new THREE.Mesh(g.drsFlapGeo, accentMat);
  drsFlap.position.set(0, 0.135, 0.055);
  drsFlap.rotation.x = 0.42;
  rearWingGroup.add(drsFlap);

  for (const rx of [-0.535, 0.505]) {
    const rwEnd = new THREE.Mesh(g.rwEndGeo, paintMat);
    rwEnd.position.set(rx, 0, 0);
    rearWingGroup.add(rwEnd);
  }

  const pylon = new THREE.Mesh(g.rwPylonGeo, carbonMat);
  pylon.position.set(0, -0.22, 0.08);
  rearWingGroup.add(pylon);
  bodyGroup.add(rearWingGroup);

  const rainLight = new THREE.Mesh(g.rainLightGeo, rainLightMat);
  rainLight.position.set(0, 0.22, -2.33);
  bodyGroup.add(rainLight);

  if(opts.pilotDetail){
    const cavityMat=new THREE.MeshStandardMaterial({color:0x090b0e,roughness:.86,metalness:.04});localDisposables.push(cavityMat);
    const shell=buildPilotBodywork(paintMat,accentMat,cavityMat);bodyGroup.add(shell);shell.traverse(o=>{if(o instanceof THREE.Mesh)localDisposables.push(o.geometry);});
    const details=buildPilotDetails(carbonMat,titaniumMat,cavityMat);bodyGroup.add(details);
    details.traverse(object=>{if(object instanceof THREE.Mesh)localDisposables.push(object.geometry);});
    root.userData.pilotDetail=true;
  }
  const setDamage=(front:number,rear:number)=>{
    frontWingGroup.rotation.z=Math.max(0,Math.min(1,front))*.13;
    frontWingGroup.rotation.x=-Math.max(0,Math.min(1,front))*.10;
    rearWingGroup.rotation.z=-Math.max(0,Math.min(1,rear))*.09;
  };

  // 9. Articulated Suspension Wishbones anchored at inboard chassis pickups
  interface WishboneArm {
    group: THREE.Group;
    sideSign: number;
    baseZRot: number;
    baseY: number;
    baseYaw: number;
    isFront: boolean;
  }
  const wishbones: WishboneArm[] = [];
  for (const [sideSign, isFront, baseYaw] of [
    [-1, true, 0.18],
    [1, true, -0.18],
    [-1, false, -0.14],
    [1, false, 0.14],
  ] as const) {
    const zPos = isFront ? CAR_TIRE_SPECS.frontCenterZ : CAR_TIRE_SPECS.rearCenterZ;
    const inboardX = sideSign * 0.22;

    const upperGrp = new THREE.Group();
    upperGrp.position.set(inboardX, 0.42, zPos);
    const upperMesh = new THREE.Mesh(g.wishboneUpperGeo, carbonMat);
    if (sideSign < 0) upperMesh.scale.x = -1;
    upperGrp.add(upperMesh);
    upperGrp.rotation.y = baseYaw;
    bodyGroup.add(upperGrp);
    wishbones.push({ group: upperGrp, sideSign, baseZRot: -0.05 * sideSign, baseY: 0.42, baseYaw, isFront });

    const lowerGrp = new THREE.Group();
    lowerGrp.position.set(inboardX, 0.26, zPos);
    const lowerMesh = new THREE.Mesh(g.wishboneLowerGeo, carbonMat);
    if (sideSign < 0) lowerMesh.scale.x = -1;
    lowerGrp.add(lowerMesh);
    lowerGrp.rotation.y = -baseYaw * 0.45;
    bodyGroup.add(lowerGrp);
    wishbones.push({
      group: lowerGrp,
      sideSign,
      baseZRot: 0.08 * sideSign,
      baseY: 0.26,
      baseYaw: -baseYaw * 0.45,
      isFront,
    });
  }

  // 4 Open 18-inch Spoked Wheels with Contoured Sidewalls, Visible Carbon Rotors & Radial Blur Discs
  const createWheel = (isRear: boolean, sideSign: number): THREE.Group => {
    const wg = new THREE.Group();
    const tireWidth = isRear ? CAR_TIRE_SPECS.rearWidth : CAR_TIRE_SPECS.frontWidth;
    const halfW = tireWidth * 0.5;

    const tireMesh = new THREE.Mesh(isRear ? g.tireRearGeo : g.tireFrontGeo, rubberMat);
    tireMesh.castShadow = true;
    wg.add(tireMesh);

    const sidewallMesh = new THREE.Mesh(isRear ? g.sidewallRearGeo : g.sidewallFrontGeo, sidewallMat);
    wg.add(sidewallMesh);

    // Open forged alloy rim barrel + 10 spokes (leaves direct sightlines onto brake rotor & red caliper)
    const rimMesh = new THREE.Mesh(isRear ? g.rimBarrelRearGeo : g.rimBarrelFrontGeo, wheelBarrelMat);
    wg.add(rimMesh);

    const spokes = new THREE.Mesh(g.wheelSpokesGeo, wheelSpokeMat);
    spokes.position.x = sideSign * (halfW - 0.032);
    wg.add(spokes);

    const lockNut = new THREE.Mesh(isRear ? g.lockNutRearGeo : g.lockNutFrontGeo, titaniumMat);
    wg.add(lockNut);

    // Glowing Carbon Brake Rotor + Red Caliper visible through the 10 wheel spokes
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x2a2e38,
      emissive: new THREE.Color(0xff4500),
      emissiveIntensity: 0,
      metalness: 0.74,
      roughness: 0.34,
    });
    localDisposables.push(discMat);
    brakeDiscMats.push(discMat);

    const discMesh = new THREE.Mesh(g.brakeDiscGeo, discMat);
    discMesh.position.x = sideSign * (halfW * 0.14);
    wg.add(discMesh);

    const caliper = new THREE.Mesh(g.caliperGeo, caliperMat);
    caliper.position.set(sideSign * (halfW * 0.24), 0.055, 0.105);
    wg.add(caliper);

    // Radial motion blur disc faded in smoothly above ~26 rad/s to suppress strobe artifact
    const blurMesh = new THREE.Mesh(isRear ? g.wheelBlurRearGeo : g.wheelBlurFrontGeo, wheelBlurMat);
    blurMesh.visible = false;
    wg.add(blurMesh);
    wheelBlurMeshes.push(blurMesh);

    return wg;
  };

  const frontLeftSteering = new THREE.Group();
  frontLeftSteering.position.set(
    CAR_TIRE_SPECS.frontCenterX,
    CAR_TIRE_SPECS.frontCenterY,
    CAR_TIRE_SPECS.frontCenterZ,
  );
  const flWheel = createWheel(false, 1);
  frontLeftSteering.add(flWheel);
  root.add(frontLeftSteering);

  const frontRightSteering = new THREE.Group();
  frontRightSteering.position.set(
    -CAR_TIRE_SPECS.frontCenterX,
    CAR_TIRE_SPECS.frontCenterY,
    CAR_TIRE_SPECS.frontCenterZ,
  );
  const frWheel = createWheel(false, -1);
  frontRightSteering.add(frWheel);
  root.add(frontRightSteering);

  const rlWheel = createWheel(true, 1);
  rlWheel.position.set(
    CAR_TIRE_SPECS.rearCenterX,
    CAR_TIRE_SPECS.rearCenterY,
    CAR_TIRE_SPECS.rearCenterZ,
  );
  root.add(rlWheel);

  const rrWheel = createWheel(true, -1);
  rrWheel.position.set(
    -CAR_TIRE_SPECS.rearCenterX,
    CAR_TIRE_SPECS.rearCenterY,
    CAR_TIRE_SPECS.rearCenterZ,
  );
  root.add(rrWheel);

  // 10. Camera Anchors (Cockpit tuned for crisp OLED steering wheel + wide track apex sightline)
  const cockpitCameraAnchor = new THREE.Object3D();
  cockpitCameraAnchor.position.set(0, 0.93, 0.045);
  bodyGroup.add(cockpitCameraAnchor);

  const tcamCameraAnchor = new THREE.Object3D();
  tcamCameraAnchor.position.set(0, 1.18, 0.05);
  bodyGroup.add(tcamCameraAnchor);

  const setHelmetVisible = (visible: boolean): void => {
    helmet.visible = visible;
    visor.visible = visible;
  };

  const setWheelMotionBlur = (wheelOmega: number): void => {
    const absOmega = Math.abs(wheelOmega);
    const t = Math.max(0, Math.min(1, (absOmega - 26) / 48));
    wheelBlurMat.opacity = t * 0.88;
    wheelSpokeMat.opacity = 1.0 - t * 0.72;
    const showBlur = t > 0.02;
    for (let i = 0; i < wheelBlurMeshes.length; i++) {
      wheelBlurMeshes[i].visible = showBlur;
    }
  };

  const updateSuspension = (pitch: number, roll: number, steerAngle: number): void => {
    // Counter-articulate wishbones so outboard pickups track ground-locked hubs while body pitches/rolls
    for (let i = 0; i < wishbones.length; i++) {
      const wb = wishbones[i];
      const hubRelY = (wb.isFront ? pitch * 1.58 : -pitch * 1.52) - roll * wb.sideSign * 0.62;
      wb.group.rotation.z = wb.baseZRot + hubRelY * wb.sideSign * 1.25;
      if (wb.isFront) {
        wb.group.rotation.y = wb.baseYaw + steerAngle * 0.14;
      }
    }
  };

  let displayLabel = '';
  let displayRpmBar = true;
  let displayAccent = '#334155';
  let lastOledKey = '';
  const updateSteeringTelemetry = (
    gear: number,
    speedKmh: number,
    rpm: number,
    maxRpm: number,
    ersCharge: number,
    ersActive: boolean,
    drsActive: boolean,
    drsEligible: boolean,
  ): void => {
    if (!screenCtx || !screenTex) return;
    const roundedSpeed = Math.max(0, Math.round(speedKmh));
    const rpmBucket = Math.round(rpm / 50);
    const roundedErs = Math.round(ersCharge);
    const key = `${gear}|${roundedSpeed}|${rpmBucket}|${roundedErs}|${ersActive ? 1 : 0}|${drsActive ? 1 : 0}|${drsEligible ? 1 : 0}`;
    if (key === lastOledKey) return;
    lastOledKey = key;
    drawSteeringOledScreen(
      screenCtx,
      gear,
      roundedSpeed,
      rpm,
      maxRpm,
      roundedErs,
      ersActive,
      drsActive,
      drsEligible,
      displayAccent,
      displayRpmBar,
      displayLabel,
    );
    screenTex.needsUpdate = true;
  };

  const updateLivery = (
    primaryColor: string,
    accentColor: string,
    helmetColor: string,
    numberDecalMap: THREE.Texture,
  ): void => {
    paintMat.color.set(primaryColor);
    accentMat.color.set(accentColor);
    helmetMat.color.set(helmetColor);
    numberPlateMat.map = numberDecalMap;
    numberPlateMat.needsUpdate = true;
  };

  return {
    root,
    bodyGroup,
    frontLeftSteering,
    frontRightSteering,
    wheels: [flWheel, frWheel, rlWheel, rrWheel],
    drsFlap,
    rainLightMat,
    brakeDiscMats,
    sidewallMat,
    rubberMat,
    steeringWheelGroup,
    steeringShiftLeds,
    paintMat,
    accentMat,
    helmetMat,
    numberPlateMat,
    cockpitCameraAnchor,
    tcamCameraAnchor,
    setHelmetVisible,
    setWheelMotionBlur,
    updateSuspension,
    configureDisplay(accent, showRpmBar, label = '') {
      displayLabel = label;
      displayAccent = accent;
      displayRpmBar = showRpmBar;
      lastOledKey = "";
    },
    updateSteeringTelemetry,
    updateLivery,
    setDamage,
    dispose: () => {
      for (const d of localDisposables) d.dispose();
    },
  };
}
