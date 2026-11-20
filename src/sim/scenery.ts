import { getSampleAtDistance, type TrackData } from './track';

export type SceneryKind = 'drs' | 'brake100' | 'brake50' | 'gantry-pillar';
export interface SceneryProp {
  id: string; kind: SceneryKind; x: number; y: number; z: number; yaw: number;
  radius: number; height: number; breakawayMass: number;
}
export interface SceneryState { prop: SceneryProp; broken: boolean; age: number; fallYaw: number; }
export interface SceneryWorld { objects: SceneryState[]; }
const layouts = new WeakMap<TrackData, readonly SceneryProp[]>();

/** Positions shared by rendering and collisions, inherited from the existing scene. */
export function getSceneryLayout(track: TrackData): readonly SceneryProp[] {
  const cached = layouts.get(track);
  if (cached) return cached;
  const props: SceneryProp[] = [], samples = track.samples, n = samples.length;
  const place = (id: string, kind: SceneryKind, s: number, side: number, extra: number, radius: number, height: number, mass: number) => {
    const sp = getSampleAtDistance(s, track), lat = side * ((side < 0 ? sp.widthLeft : sp.widthRight) + extra);
    props.push({id, kind, x: sp.pos.x + sp.right.x * lat, y: sp.pos.y + sp.right.y * lat,
      z: sp.pos.z + sp.right.z * lat, yaw: Math.atan2(sp.tangent.x, sp.tangent.z), radius, height, breakawayMass: mass});
  };
  let lastMarkerS = -400;
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n], curr = samples[i];
    if (curr.drsZone !== 0 && prev.drsZone === 0) place(`drs-${i}`, 'drs', curr.s, 1, 2.4, 0.08, 3.075, 5);
    if (curr.racingLinePhase === 'brake' && prev.racingLinePhase !== 'brake' && curr.s - lastMarkerS > 220) {
      lastMarkerS = curr.s;
      const side = getSampleAtDistance(curr.s + 95, track).curvature >= 0 ? 1 : -1;
      place(`brake100-${i}`, 'brake100', curr.s + 5, side, 2.6, 0.06, 2.51, 3);
      place(`brake50-${i}`, 'brake50', curr.s + 55, side, 2.6, 0.06, 2.51, 3);
    }
  }
  const sp = samples[0], yaw = Math.atan2(sp.tangent.x, sp.tangent.z);
  const span = sp.widthLeft + sp.widthRight + 5;
  for (const side of [-1, 1]) {
    const x = side * span * 0.5;
    props.push({id: `gantry-${side}`, kind: 'gantry-pillar', x: sp.pos.x + Math.cos(yaw) * x,
      y: sp.pos.y, z: sp.pos.z - Math.sin(yaw) * x, yaw, radius: Math.SQRT2 * 0.325, height: 8.2, breakawayMass: 0});
  }
  layouts.set(track, props);
  return props;
}
export function createSceneryWorld(track: TrackData): SceneryWorld {
  return {objects: getSceneryLayout(track).map(prop => ({prop, broken: false, age: 0, fallYaw: 0}))};
}
export function stepScenery(world: SceneryWorld, dt: number): void {
  for (const obj of world.objects) if (obj.broken) obj.age = Math.min(1, obj.age + dt);
}
