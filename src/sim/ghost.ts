import type { CarState, GhostLapData, GhostSample, TrackId, WeatherCondition } from './types';

export const GHOST_SAMPLE_INTERVAL = 0.05; // 20 Hz recording

export interface GhostRecorder {
  samples: GhostSample[];
  nextSampleTime: number;
}

export function createGhostRecorder(): GhostRecorder {
  return {
    samples: [],
    nextSampleTime: 0,
  };
}

export function recordGhostFrame(
  rec: GhostRecorder,
  car: CarState,
  lapTime: number,
  force = false,
): void {
  if (!force && lapTime < rec.nextSampleTime) return;
  if (rec.samples.length >= 4200) return; // safety cap (~3.5 min lap)
  rec.samples.push({
    time: Number(lapTime.toFixed(3)),
    x: Number(car.x.toFixed(2)),
    y: Number(car.y.toFixed(2)),
    z: Number(car.z.toFixed(2)),
    yaw: Number(car.yaw.toFixed(4)),
    pitch: Number((car.trackPitch + car.pitch).toFixed(4)),
    drsActive: car.drsActive,
    speed: Number(car.forwardSpeed.toFixed(2)),
  });
  rec.nextSampleTime = lapTime + GHOST_SAMPLE_INTERVAL;
}

export function finalizeGhostLap(
  rec: GhostRecorder,
  trackId: TrackId,
  weather: WeatherCondition,
  lapTime: number,
): GhostLapData | null {
  if (rec.samples.length < 10) return null;
  return {
    trackId,
    weather,
    lapTime,
    samples: [...rec.samples],
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Pure binary-search interpolator returning the exact interpolated 3D ghost pose at `lapTime`.
 */
export function sampleGhostPose(
  ghost: GhostLapData | null,
  lapTime: number,
): GhostSample | null {
  if (!ghost || ghost.samples.length < 2 || lapTime < 0) return null;
  const list = ghost.samples;
  if (lapTime <= list[0].time) return list[0];
  const last = list[list.length - 1];
  if (lapTime >= last.time) return last;

  let lo = 0;
  let hi = list.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].time <= lapTime) lo = mid;
    else hi = mid;
  }

  const a = list[lo];
  const b = list[hi];
  const span = Math.max(1e-4, b.time - a.time);
  const t = Math.max(0, Math.min(1, (lapTime - a.time) / span));

  const fallbackSpeed = Math.hypot(b.x - a.x, b.z - a.z) / span;
  const speedA = typeof a.speed === 'number' ? a.speed : fallbackSpeed;
  const speedB = typeof b.speed === 'number' ? b.speed : fallbackSpeed;

  return {
    time: lapTime,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    drsActive: t < 0.5 ? a.drsActive : b.drsActive,
    speed: speedA + (speedB - speedA) * t,
  };
}
