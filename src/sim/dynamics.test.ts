import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingCurvature, tireForceCapacity, combinedGripScale } from './dynamics';
import { benchmark } from '../../scripts/benchmark-dynamics';
import { CAR_MASS_KG, stepVehiclePhysics } from './physics';
import { createRaceSession } from './raceDirector';
import { getSampleAtDistance, INTERLAGOS_TRACK } from './track';

test('driving curvature recovers analytical circles without the legacy factor-of-two error', () => {
  for (const radius of [20, 50, 180, 500]) {
    const angle = 0.08;
    const a = [radius * Math.sin(-angle), radius * Math.cos(-angle)];
    const b = [0, radius];
    const c = [radius * Math.sin(angle), radius * Math.cos(angle)];
    const k = drivingCurvature(a[0], a[1], b[0], b[1], c[0], c[1]);
    assert.ok(Math.abs(k - 1 / radius) < 1e-10, `R=${radius}, curvature=${k}`);
    assert.ok(Math.abs(drivingCurvature(c[0], c[1], b[0], b[1], a[0], a[1]) + k) < 1e-10);
  }
  assert.equal(drivingCurvature(0, 0, 0, 1, 0, 2), 0);
  assert.equal(drivingCurvature(0, 0, 0, 0, 0, 0), 0);
});

test('tire load sensitivity and combined forces obey a shared grip budget', () => {
  const staticLoad = 798 * 9.81;
  const base = tireForceCapacity(staticLoad, staticLoad, 1.3);
  const doubled = tireForceCapacity(staticLoad * 2, staticLoad, 1.3);
  assert.ok(doubled > base && doubled < base * 2);
  assert.equal(tireForceCapacity(0, staticLoad, 1.3), 0);
  const scale = combinedGripScale(base, base, base);
  assert.ok(Math.abs(Math.hypot(base * scale, base * scale) - base) < 1e-8);
  assert.equal(combinedGripScale(0, 0, 0), 1);
});

test('steering while braking cannot rotate velocity for free beyond the tire force envelope', () => {
  const session = createRaceSession({totalLaps: 3, weather: 'dry', absEnabled: true, tcEnabled: true, racingLineEnabled: true}, 'playing');
  const car = session.cars[session.playerIndex];
  const sample = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.03);
  const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  Object.assign(car, {x: sample.pos.x, z: sample.pos.z, y: sample.pos.y, yaw, trackIndex: sample.index,
    vx: Math.sin(yaw) * 65, vz: Math.cos(yaw) * 65, forwardSpeed: 65, speed: 65, gear: 5});
  const dt = 1 / 180;
  for (let i = 0; i < 36; i++) {
    const vx = car.vx, vz = car.vz, speed = Math.hypot(vx, vz);
    stepVehiclePhysics(car, {throttle: 0, brake: 1, steer: 1, ersBoost: false, drsToggleJustPressed: false}, session.config, dt);
    const accel = Math.hypot(car.vx - vx, car.vz - vz) / dt;
    const load = CAR_MASS_KG * 9.81 + 0.5 * 1.225 * 4.25 * speed * speed;
    const tireLimit = tireForceCapacity(load, CAR_MASS_KG * 9.81, 1.3) / CAR_MASS_KG;
    // Upper bound includes drag, rolling resistance and gravity (under 1m/s² here).
    const external = (0.5 * 1.225 * 1.32 * speed * speed + 180) / CAR_MASS_KG + 1;
    assert.ok(accel <= tireLimit + external + 0.1, `${accel} exceeds ${tireLimit + external}`);
    assert.ok(car.impactIntensity < 0.001 && car.onTrack, 'Isolate tire forces from collisions/surfaces');
  }
});

test('solo Interlagos pace is ordered, bounded and stays on asphalt for three laps at 180 Hz', () => {
  const result = benchmark();
  assert.equal(result.hz, 180);
  let previousLap = Infinity;
  for (const row of result.rows.filter(r => r.weather === 'dry')) {
    assert.equal(row.laps.length, 3);
    const average = row.laps.reduce((a, b) => a + b, 0) / 3;
    // Deliberately an engineering regression range; not a real F1 lap target.
    assert.ok(average > 72 && average < 92, `${row.difficulty}: ${average}s`);
    assert.ok(average < previousLap, `Difficulty order: ${row.difficulty}`);
    assert.ok(Math.max(...row.laps) - Math.min(...row.laps) < 0.5);
    assert.ok(row.maxKmh > 280 && row.maxKmh < 345);
    assert.equal(row.offTrackSeconds, 0);
    assert.equal(row.impactSteps, 0);
    previousLap = average;
  }
  const dry = result.rows.find(r => r.weather === 'dry' && r.difficulty === 'competitivo')!;
  const wet = result.rows.find(r => r.weather === 'wet')!;
  assert.equal(wet.laps.length, 3);
  assert.equal(wet.offTrackSeconds, 0);
  assert.equal(wet.impactSteps, 0);
  assert.ok(wet.laps[1] > dry.laps[1] * 1.08);
});
