import { projectPointToTrack, type TrackData } from './track';
import type { CarState } from './types';
import { classifySurface, getSurfaceZones, type Surface, type SurfaceZone } from './surfaceModel';
export { classifySurface, APRON_WIDTH } from './surfaceModel';
export type { Surface, SurfaceZone } from './surfaceModel';
export interface WheelContact { insideTrack?: boolean; wheel: string; side: number; material: Surface; grounded: boolean; speed: number; slip: number; load: number }
const WHEELS = [ [1.65, -.8, 'FL'], [1.65, .8, 'FR'], [-1.65, -.8, 'RL'], [-1.65, .8, 'RR'] ] as const;
export function createWheelContacts(): WheelContact[] {
  return WHEELS.map(([, lateral, wheel]) => ({ wheel, side: Math.sign(lateral), material: 'asphalt', grounded: true, speed: 0, slip: 0, load: 1 }));
}
/** Reuses the array and four contact objects supplied by the renderer. Projection still allocates. */
export function wheelContacts(car: CarState, track: TrackData, zones: readonly SurfaceZone[] = getSurfaceZones(track), output = createWheelContacts()): WheelContact[] {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  for (let i = 0; i < WHEELS.length; i++) {
    const geometry = car.geometry;
    const f = geometry ? (i < 2 ? geometry.frontAxleZ : geometry.rearAxleZ) : WHEELS[i][0];
    const l = geometry ? (i % 2 === 0 ? -1 : 1) * (i < 2 ? geometry.frontHalfTrackM : geometry.rearHalfTrackM) : WHEELS[i][1];
    const p = projectPointToTrack(car.x + fx*f + rx*l, car.z + fz*f + rz*l, car.trackIndex, track);
    const c = output[i];
    // Allow for the outer half of the contact patch at the white line.
    c.insideTrack = p.lateralOffset >= -p.widthLeft - .15 && p.lateralOffset <= p.widthRight + .15;
    c.material = classifySurface(p, zones);
    c.grounded = Math.abs(car.y - p.elevation) < .65;
    c.speed = Math.abs(car.speed); c.slip = car.slipRatio;
    c.load = Math.max(.2, Math.min(1.5, 1 - car.roll*c.side*3));
  }
  return output;
}
