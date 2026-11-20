import { writeFileSync } from 'node:fs';
import { createRaceSession, stepRaceSession } from '../src/sim/raceDirector';
import { computeAiInputs } from '../src/sim/ai';
import { INTERLAGOS_TRACK as track, getSampleAtDistance } from '../src/sim/track';
import { stepVehiclePhysics } from '../src/sim/physics';
import { DYNAMICS_VERSION } from '../src/sim/dynamics';
import { PHYSICS_HZ, PHYSICS_DT as dt } from '../src/sim/fixedStep';
import type { DifficultyLevel, WeatherCondition } from '../src/sim/types';

/** Straight-line diagnostic, not a Turn 1 telemetry reproduction. */
export function measureBraking(weather: WeatherCondition, create = createRaceSession, physics = stepVehiclePhysics, activeTrack = track) {
  const session = create({ totalLaps: 3, weather, absEnabled: true, tcEnabled: true, racingLineEnabled: true }, 'playing', 'chase', false, activeTrack);
  const car = session.cars[session.playerIndex];
  const sample = getSampleAtDistance(activeTrack.totalLength * 0.03, activeTrack);
  const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  Object.assign(car, { x: sample.pos.x, z: sample.pos.z, y: sample.pos.y, yaw, trackIndex: sample.index, s: sample.s,
    vx: Math.sin(yaw) * 325 / 3.6, vz: Math.cos(yaw) * 325 / 3.6, speed: 325 / 3.6, forwardSpeed: 325 / 3.6, gear: 8, rpm: 12000 });
  let distance = 0, time = 0, peakG = 0, impactSteps = 0, offTrackSteps = 0;
  const input = { throttle: 0, brake: 1, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < PHYSICS_HZ * 12 && Math.hypot(car.vx, car.vz) > 123 / 3.6; i++) {
    const before = Math.hypot(car.vx, car.vz), x = car.x, z = car.z;
    physics(car, input, session.config, dt, activeTrack);
    time += dt;
    distance += Math.hypot(car.x - x, car.z - z);
    peakG = Math.max(peakG, (before - Math.hypot(car.vx, car.vz)) / dt / 9.81);
    if (car.impactIntensity > 0.001) impactSteps++;
    if (!car.onTrack) offTrackSteps++;
  }
  return { weather, fromKmh: 325, toKmh: 123, distance, time, peakG, impactSteps, offTrackSteps, finalGear: car.gear, startNorm: sample.tNorm };
}

/** Deterministic, solo, no browser. Same timestep and vehicle update as the game. */
export function benchmark(create = createRaceSession, step = stepRaceSession, ai = computeAiInputs, physics = stepVehiclePhysics, activeTrack = track) {
  const rows = [];
  for (const weather of ['dry', 'wet'] as WeatherCondition[]) {
    for (const difficulty of ['iniciante', 'competitivo', 'pro', 'lendario'] as DifficultyLevel[]) {
      if (weather === 'wet' && difficulty !== 'competitivo') continue;
      const session = create({ totalLaps: 8, weather, absEnabled: true, tcEnabled: true, tireWearEnabled: true, racingLineEnabled: true, difficulty, mode: 'timetrial' }, 'playing', 'chase', false, activeTrack);
      const car = session.cars[session.playerIndex], solo = [car], laps: number[] = [];
      let max = 0, min = Infinity, off = 0, brake = 0, impactSteps = 0;
      const sectorTime = [0, 0, 0], sectorDistance = [0, 0, 0];
      for (let i = 0; i < PHYSICS_HZ * 480 && laps.length < 3; i++) {
        const lap = car.lap, sector = car.sector - 1, input = ai(car, solo, session.config, dt, activeTrack);
        step(session, input, dt, activeTrack);
        const speed = Math.hypot(car.vx, car.vz);
        if (lap >= 1) {
          max = Math.max(max, speed * 3.6); min = Math.min(min, speed * 3.6);
          off += !car.onTrack ? dt : 0; brake += input.brake > 0.05 ? dt : 0;
          sectorTime[sector] += dt; sectorDistance[sector] += speed * dt;
          if (car.impactIntensity > 0.001) impactSteps++;
        }
        if (car.lap > lap && car.lastLapTime) laps.push(car.lastLapTime);
      }
      rows.push({ weather, difficulty, laps, maxKmh: max, minKmh: min, offTrackSeconds: off, impactSteps,
        brakingSecondsPerLap: brake / Math.max(1, laps.length),
        sectorMeanKmh: sectorTime.map((seconds, i) => seconds ? sectorDistance[i] / seconds * 3.6 : 0) });
    }
  }
  return { version: DYNAMICS_VERSION, hz: PHYSICS_HZ, circuit: activeTrack.id, conditions: 'solo; ABS/TC on; tire wear on; default tires; 3 flying laps; no fuel model', rows,
    braking: (['dry', 'wet'] as const).map(weather => measureBraking(weather, create, physics, activeTrack)) };
}
if (process.argv[1]?.endsWith('benchmark-dynamics.ts')) {
  const result = benchmark();
  console.log(JSON.stringify(result, null, 2));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
}
