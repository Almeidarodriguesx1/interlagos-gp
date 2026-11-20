import { measureBraking } from '../../scripts/benchmark-dynamics';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERLAGOS_LENGTH_M,
  INTERLAGOS_TRACK,
  TRACK_LIST,
  getSampleAtDistance,
  getTrack,
  projectPointToTrack,
} from './track';
import {
  computeCornerBrakingCue,
  computeKerbParticleSide,
  computeMotionBlurIntensity,
  computeSlipstreamIntensity,
  resolveCarCollisions,
  stepVehiclePhysics,
} from './physics';
import { computeAiInputs } from './ai';
import { applySteeringCurve, createGamepadEdgeState, mapGamepadState } from './gamepad';
import {
  createGhostRecorder,
  finalizeGhostLap,
  recordGhostFrame,
  sampleGhostPose,
} from './ghost';
import {
  computeAxleLoads,
  computeThermalGripMultiplier,
  computeTireWearGripMultiplier,
  pacejkaMagic,
  stepPacejkaTireState,
} from './pacejka';
import {
  PLAYER_TEAMS,
  buildTelemetrySnapshot,
  createRaceSession,
  stepRaceSession,
} from './raceDirector';
import {
  computeDopplerPitchRatio,
  computeEngineOrderFrequencies,
  computeGearboxFrequency,
  selectNearestRivals,
} from '../audio/F1AudioEngine';
import { createF1SoundBank } from '../audio/soundBank';
import type { ControlInputs, DifficultyLevel, RaceConfig } from './types';

const DEFAULT_CONFIG: RaceConfig = {
  totalLaps: 3,
  weather: 'dry',
  absEnabled: true,
  tcEnabled: true,
  racingLineEnabled: true,
};

test('Interlagos track spline matches real-world length (~4309 m) and ~43 m elevation span', () => {
  assert.ok(Math.abs(INTERLAGOS_TRACK.totalLength - INTERLAGOS_LENGTH_M) < 5);
  const ys = INTERLAGOS_TRACK.samples.map((s) => s.pos.y);
  const span = Math.max(...ys) - Math.min(...ys);
  assert.ok(span >= 40 && span <= 46, `Expected ~43m elevation span, got ${span}`);

  // Check closed loop continuity
  const first = INTERLAGOS_TRACK.samples[0].pos;
  const last = INTERLAGOS_TRACK.samples[INTERLAGOS_TRACK.samples.length - 1].pos;
  const gap = Math.hypot(first.x - last.x, first.z - last.z);
  assert.ok(gap < 15, `Closed spline gap too large: ${gap}`);
});

test('Interlagos defines 3 sectors, 2 DRS zones, and 8 TV trackside cameras', () => {
  const sectors = new Set(INTERLAGOS_TRACK.samples.map((s) => s.sector));
  assert.deepEqual([...sectors].sort(), [1, 2, 3]);

  const drsZones = new Set(INTERLAGOS_TRACK.samples.map((s) => s.drsZone).filter((z) => z !== 0));
  assert.deepEqual([...drsZones].sort(), [1, 2]);

  assert.equal(INTERLAGOS_TRACK.towers.length, 8);
});

test('Track projection accurately finds centerline and off-track offsets', () => {
  const sample = getSampleAtDistance(1000);
  const onCenter = projectPointToTrack(sample.pos.x, sample.pos.z, sample.index);
  assert.equal(onCenter.onTrack, true);
  assert.ok(Math.abs(onCenter.lateralOffset) < 1.0);

  const farRightX = sample.pos.x + sample.right.x * 12;
  const farRightZ = sample.pos.z + sample.right.z * 12;
  const offTrack = projectPointToTrack(farRightX, farRightZ, sample.index);
  assert.equal(offTrack.onTrack, false);
  assert.ok(offTrack.lateralOffset > 9);
});

test('F1 car accelerates to 300+ km/h with 8-speed gearbox and benefits from DRS + ERS', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];

  // Place at start of Reta Oposta DRS straight (tNorm = 0.22)
  const straightSample = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.22);
  car.x = straightSample.pos.x;
  car.z = straightSample.pos.z;
  car.y = straightSample.pos.y;
  car.yaw = Math.atan2(straightSample.tangent.x, straightSample.tangent.z);
  car.trackIndex = straightSample.index;

  for (let i = 0; i < 60 * 9; i++) {
    const ahead = getSampleAtDistance(car.s + 24);
    const targetYaw = Math.atan2(ahead.pos.x - car.x, ahead.pos.z - car.z);
    let err = targetYaw - car.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const inputs: ControlInputs = {
      throttle: 1,
      brake: 0,
      steer: Math.max(-1, Math.min(1, err * 2.0)),
      ersBoost: true,
      drsToggleJustPressed: i === 20,
    };
    stepVehiclePhysics(car, inputs, DEFAULT_CONFIG, 1 / 60);
  }

  const speedKmh = car.speed * 3.6;
  assert.ok(speedKmh > 300, `Expected >300 km/h after 9s, got ${speedKmh.toFixed(1)} km/h`);
  assert.ok(car.gear >= 7, `Expected high gear >= 7, got ${car.gear}`);
});

test('Wet weather reduces cornering/braking deceleration vs dry weather', () => {
  const drySession = createRaceSession({ ...DEFAULT_CONFIG, weather: 'dry' }, 'playing');
  const wetSession = createRaceSession({ ...DEFAULT_CONFIG, weather: 'wet' }, 'playing');
  const dryCar = drySession.cars[drySession.playerIndex];
  const wetCar = wetSession.cars[wetSession.playerIndex];

  for (const car of [dryCar, wetCar]) {
    car.vx = Math.sin(car.yaw) * 65;
    car.vz = Math.cos(car.yaw) * 65;
    car.speed = 65;
    car.forwardSpeed = 65;
  }

  const hardBrake: ControlInputs = { throttle: 0, brake: 1, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(dryCar, hardBrake, drySession.config, 1 / 60);
    stepVehiclePhysics(wetCar, hardBrake, wetSession.config, 1 / 60);
  }

  assert.ok(dryCar.speed < wetCar.speed, `Dry car (${dryCar.speed}) should slow faster than wet car (${wetCar.speed})`);
});

test('Race director runs 5-light FIA countdown, transitions to playing, and counts laps to finish', () => {
  const session = createRaceSession({ ...DEFAULT_CONFIG, totalLaps: 1 }, 'countdown');
  const idle: ControlInputs = { throttle: 0.5, brake: 0, steer: 0, ersBoost: false, drsToggleJustPressed: false };

  // Five signals at one-second intervals, followed by lights out.
  for (let i = 0; i < 60 * 6; i++) {
    stepRaceSession(session, idle, 1 / 60);
    if (session.phase === 'playing') break;
  }
  assert.equal(session.phase, 'playing');

  // Simulate AI-controlled player completing 1 full lap + grid start
  const player = session.cars[session.playerIndex];
  assert.equal(player.lap, 0);

  // Run enough steps at ~60s-75s lap pace? Run AI inputs for player by stepping fast at 1/30s for 100s
  for (let i = 0; i < 30 * 110; i++) {
    // Simple cruise along track
    const ahead = getSampleAtDistance(player.s + 22);
    const targetYaw = Math.atan2(ahead.pos.x - player.x, ahead.pos.z - player.z);
    let err = targetYaw - player.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const drive: ControlInputs = {
      throttle: Math.abs(err) > 0.25 ? 0.35 : 0.85,
      brake: player.speed > 55 && Math.abs(err) > 0.3 ? 0.6 : 0,
      steer: Math.max(-1, Math.min(1, err * 2.2)),
      ersBoost: false,
      drsToggleJustPressed: false,
    };
    stepRaceSession(session, drive, 1 / 30);
    if (player.finished) break;
  }

  assert.equal(player.finished, true, `Player should finish 1-lap race (lap=${player.lap}, t=${player.tNorm.toFixed(2)})`);
  assert.equal(session.phase as string, 'gameover');
});

test('braking into a slow bend stops and holds the car on an incline until the pedal is released', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];
  const crest = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * .94);
  Object.assign(car, {x:crest.pos.x, y:crest.pos.y, z:crest.pos.z, trackIndex:crest.index,
    yaw:Math.atan2(crest.tangent.x, crest.tangent.z) + Math.PI, vx:-crest.tangent.x * 2, vz:-crest.tangent.z * 2});
  const braking = {throttle:0, brake:1, steer:.7, ersBoost:false, drsToggleJustPressed:false};
  for (let i=0; i<180; i++) stepVehiclePhysics(car, braking, DEFAULT_CONFIG, 1/180);
  const stopped = [car.x, car.z];
  for (let i=0; i<540; i++) stepVehiclePhysics(car, braking, DEFAULT_CONFIG, 1/180);
  assert.deepEqual([car.x, car.z], stopped);
  assert.equal(car.gear, 1);
  assert.equal(car.speed, 0);
});

test('Holding brake from standstill engages Reverse (-1) and throttle shifts back to 1st', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];

  const holdBrake: ControlInputs = { throttle: 0, brake: 1, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(car, holdBrake, DEFAULT_CONFIG, 1 / 60);
  }
  assert.equal(car.gear, -1, 'Should shift into reverse gear (-1)');
  assert.ok(car.forwardSpeed < -2.0, `Car should reverse backward, got forwardSpeed=${car.forwardSpeed}`);

  const holdThrottle: ControlInputs = { throttle: 1, brake: 0, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(car, holdThrottle, DEFAULT_CONFIG, 1 / 60);
  }
  assert.ok(car.gear >= 1, `Should shift back into forward gear, got ${car.gear}`);
  assert.ok(car.forwardSpeed > 2.0, `Car should accelerate forward, got ${car.forwardSpeed}`);
});

test('Scraping outer barrier glides car smoothly along track instead of bouncing backward', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];
  const sample = getSampleAtDistance(200);
  car.x = sample.pos.x + sample.right.x * (sample.widthRight + 6.4);
  car.z = sample.pos.z + sample.right.z * (sample.widthRight + 6.4);
  car.yaw = Math.atan2(sample.tangent.x, sample.tangent.z) - 0.35; // angled into right barrier
  car.vx = Math.sin(car.yaw) * 40;
  car.vz = Math.cos(car.yaw) * 40;
  car.speed = 40;
  car.forwardSpeed = 40;
  car.trackIndex = sample.index;

  const gas: ControlInputs = { throttle: 0.8, brake: 0, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 30; i++) {
    stepVehiclePhysics(car, gas, DEFAULT_CONFIG, 1 / 60);
  }
  assert.ok(car.forwardSpeed > 20, `Car should glide along barrier instead of stalling, got ${car.forwardSpeed}`);
});

test('computeCornerBrakingCue triggers before S do Senna at high speed', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];
  // Approaching S do Senna (tNorm = 0.130, ~120m before T1 apex at 0.158) at 300 km/h (83 m/s)
  const sp = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.130);
  car.s = sp.s;
  car.speed = 83;
  assert.equal(computeCornerBrakingCue(car, DEFAULT_CONFIG), true);

  // Safe slow cruise speed should not trigger braking cue
  car.speed = 22;
  assert.equal(computeCornerBrakingCue(car, DEFAULT_CONFIG), false);
});

test('Slipstream tow reduces drag and increases straight-line speed behind another car', () => {
  const sessionA = createRaceSession(DEFAULT_CONFIG, 'playing');
  const sessionB = createRaceSession(DEFAULT_CONFIG, 'playing');
  const soloCar = sessionA.cars[sessionA.playerIndex];
  const towCar = sessionB.cars[sessionB.playerIndex];
  const leadCar = sessionB.cars[0];

  const straight = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.22);
  for (const c of [soloCar, towCar]) {
    c.x = straight.pos.x;
    c.z = straight.pos.z;
    c.y = straight.pos.y;
    c.s = straight.s;
    c.lateralOffset = 0;
    c.trackIndex = straight.index;
    c.yaw = Math.atan2(straight.tangent.x, straight.tangent.z);
    c.vx = straight.tangent.x * 65;
    c.vz = straight.tangent.z * 65;
    c.speed = 65;
    c.forwardSpeed = 65;
    c.gear = 6;
  }

  // Place lead car 12m ahead on same lateral line
  const leadSample = getSampleAtDistance(straight.s + 12);
  leadCar.x = leadSample.pos.x;
  leadCar.z = leadSample.pos.z;
  leadCar.s = leadSample.s;
  leadCar.lateralOffset = 0;

  const towStrength = computeSlipstreamIntensity(towCar, [towCar, leadCar]);
  assert.ok(towStrength > 0.5, `Expected strong slipstream tow, got ${towStrength}`);

  for (let i = 0; i < 120; i++) {
    for (const [car, tow] of [
      [soloCar, 0],
      [towCar, towStrength],
    ] as const) {
      const ahead = getSampleAtDistance(car.s + 24);
      const targetYaw = Math.atan2(ahead.pos.x - car.x, ahead.pos.z - car.z);
      let err = targetYaw - car.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      stepVehiclePhysics(
        car,
        {
          throttle: 1,
          brake: 0,
          steer: Math.max(-1, Math.min(1, err * 2.0)),
          ersBoost: false,
          drsToggleJustPressed: false,
        },
        DEFAULT_CONFIG,
        1 / 60,
        INTERLAGOS_TRACK,
        true,
        tow,
      );
    }
  }
  assert.equal(towCar.slipstreamActive, true);
  assert.ok(towCar.speed > soloCar.speed + 0.8, `Slipstream car (${towCar.speed}) should exceed solo (${soloCar.speed})`);
});

test('Brake disc temperature rises under heavy braking and trackPitch aligns to slope', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];
  const hillSample = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.94); // Subida dos Boxes climb
  car.x = hillSample.pos.x;
  car.z = hillSample.pos.z;
  car.y = hillSample.pos.y;
  car.trackIndex = hillSample.index;
  car.yaw = Math.atan2(hillSample.tangent.x, hillSample.tangent.z);
  car.vx = hillSample.tangent.x * 72;
  car.vz = hillSample.tangent.z * 72;
  car.speed = 72;
  car.forwardSpeed = 72;

  const hardBrake: ControlInputs = { throttle: 0, brake: 1, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 45; i++) {
    stepVehiclePhysics(car, hardBrake, DEFAULT_CONFIG, 1 / 60);
  }
  assert.ok(car.brakeTemp > 0.45, `Brake temp should heat up under braking, got ${car.brakeTemp}`);
  assert.ok(car.trackPitch < -0.01, `Climbing uphill should pitch nose up (negative trackPitch), got ${car.trackPitch}`);
});

test('Widened Interlagos track maintains clean barrier clearance, expanded kerbs, and valid racing line', () => {
  const samples = INTERLAGOS_TRACK.samples;
  const n = samples.length;

  // 1. Widened track width >= 16.5 m everywhere
  let minWidth = Infinity;
  let kerbLeftCount = 0;
  let kerbRightCount = 0;
  const phaseSet = new Set<string>();

  for (const s of samples) {
    const w = s.widthLeft + s.widthRight;
    if (w < minWidth) minWidth = w;
    if (s.kerbLeft) kerbLeftCount++;
    if (s.kerbRight) kerbRightCount++;
    assert.ok(
      Math.abs(s.racingLineOffset) <= s.widthLeft - 1.0,
      `Racing line offset (${s.racingLineOffset}) should stay inside track width (${s.widthLeft})`,
    );
    phaseSet.add(s.racingLinePhase);
  }

  assert.ok(minWidth >= 16.5, `Expected widened track >= 16.5m, got ${minWidth.toFixed(2)}m`);
  assert.ok(kerbLeftCount > 100 && kerbRightCount > 100, `Expected rich corner kerbs, got L=${kerbLeftCount}, R=${kerbRightCount}`);
  assert.equal(phaseSet.has('accel'), true);
  assert.equal(phaseSet.has('brake'), true);

  // 2. Non-adjacent track sections must stay well clear (>= 60m) so barriers/aprons never cross asphalt
  let minNonAdjacentDist = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ds = Math.abs(samples[j].s - samples[i].s);
      const arcDist = Math.min(ds, INTERLAGOS_TRACK.totalLength - ds);
      if (arcDist < 215) continue;
      const d = Math.hypot(
        samples[i].pos.x - samples[j].pos.x,
        samples[i].pos.z - samples[j].pos.z,
      );
      if (d < minNonAdjacentDist) minNonAdjacentDist = d;
    }
  }
  assert.ok(
    minNonAdjacentDist >= 60,
    `Non-adjacent track sections too close (${minNonAdjacentDist.toFixed(1)}m < 60m), barriers could overlap`,
  );
});

test('computeMotionBlurIntensity scales monotonically with speed and varies by camera perspective', () => {
  assert.equal(computeMotionBlurIntensity(0, 'cockpit'), 0);
  assert.equal(computeMotionBlurIntensity(18, 'cockpit'), 0);

  const lowSpeedBlur = computeMotionBlurIntensity(32, 'cockpit');
  const midSpeedBlur = computeMotionBlurIntensity(60, 'cockpit');
  const highSpeedBlur = computeMotionBlurIntensity(90, 'cockpit');
  assert.ok(lowSpeedBlur > 0 && lowSpeedBlur < midSpeedBlur, `Expected low < mid blur (${lowSpeedBlur} vs ${midSpeedBlur})`);
  assert.ok(midSpeedBlur < highSpeedBlur && highSpeedBlur <= 1.0, `Expected mid < high <= 1 (${midSpeedBlur} vs ${highSpeedBlur})`);

  const cockpitBlur = computeMotionBlurIntensity(85, 'cockpit');
  const chaseBlur = computeMotionBlurIntensity(85, 'chase');
  const heliBlur = computeMotionBlurIntensity(85, 'helicopter');
  assert.ok(cockpitBlur > chaseBlur && chaseBlur > heliBlur);
});

test('computeKerbParticleSide detects left/right kerb contact above minimum speed', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];

  car.onKerb = false;
  car.speed = 45;
  car.lateralOffset = -9.0;
  assert.equal(computeKerbParticleSide(car), 0);

  car.onKerb = true;
  car.speed = 4; // too slow to kick up kerb grit
  assert.equal(computeKerbParticleSide(car), 0);

  car.speed = 45;
  car.lateralOffset = -9.2;
  assert.equal(computeKerbParticleSide(car), -1);

  car.lateralOffset = 9.2;
  assert.equal(computeKerbParticleSide(car), 1);
});

test('braking downshifts cleanly on a clear straight with a bounded dry/wet stopping envelope', () => {
  // A 73m requirement previously encouraged excessive grip. This is a regression
  // envelope for this model, not a claim to reproduce real Turn 1 telemetry.
  const results = (['dry', 'wet'] as const).map(weather => measureBraking(weather));
  const [dry, wet] = results;
  assert.equal(dry.impactSteps + wet.impactSteps, 0);
  assert.equal(dry.offTrackSteps + wet.offTrackSteps, 0);
  assert.ok(dry.distance > 110 && dry.distance < 140, `Dry: ${dry.distance}m`);
  assert.ok(dry.time > 1.8 && dry.time < 2.6);
  assert.ok(dry.peakG > 4 && dry.peakG < 5.2);
  assert.ok(wet.distance > dry.distance * 1.15 && wet.distance < dry.distance * 1.4);
  assert.ok(wet.time > dry.time && wet.peakG < dry.peakG);
  assert.ok(dry.finalGear <= 3 && wet.finalGear <= 3);
});

test('Steering response at 180 km/h achieves >= 80% peak yaw rate within 100ms', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const car = session.cars[session.playerIndex];
  const sp = getSampleAtDistance(INTERLAGOS_TRACK.totalLength * 0.10);
  car.x = sp.pos.x;
  car.z = sp.pos.z;
  car.y = sp.pos.y;
  car.trackIndex = sp.index;
  car.s = sp.s;
  car.yaw = Math.atan2(sp.tangent.x, sp.tangent.z);
  car.vx = sp.tangent.x * 50;
  car.vz = sp.tangent.z * 50;
  car.speed = 50;
  car.forwardSpeed = 50;
  car.gear = 4;

  const turnLeft: ControlInputs = { throttle: 0.4, brake: 0, steer: 1, ersBoost: false, drsToggleJustPressed: false };
  let yawAt100ms = 0;
  for (let f = 1; f <= 24; f++) {
    stepVehiclePhysics(car, turnLeft, DEFAULT_CONFIG, 1 / 60);
    if (f === 6) yawAt100ms = car.yawRate;
  }

  assert.ok(
    yawAt100ms >= car.yawRate * 0.80,
    `Expected rapid steering response within 100ms (>=80% of ${car.yawRate.toFixed(3)}), got ${yawAt100ms.toFixed(3)}`,
  );
});

test('10-car AI pack at 180 Hz avoids capsule penetration and remains moving after 30 seconds', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  let minClearance = Infinity;
  for (let step = 0; step < 30 * 180; step++) {
    const input = computeAiInputs(session.cars[session.playerIndex], session.cars, DEFAULT_CONFIG, 1 / 180);
    stepRaceSession(session, input, 1 / 180);
    for (let i = 0; i < session.cars.length; i++) {
      for (let j = i + 1; j < session.cars.length; j++) {
        const a = session.cars[i], b = session.cars[j];
        // Compare the actual 3-circle bodies: legal side-by-side racing can
        // put centers 2.1m apart, so the former 3.05m center check was invalid.
        for (const ao of [-1.45, 0, 1.45]) for (const bo of [-1.45, 0, 1.45]) {
          const clearance = Math.hypot(
            a.x + Math.sin(a.yaw) * ao - b.x - Math.sin(b.yaw) * bo,
            a.z + Math.cos(a.yaw) * ao - b.z - Math.cos(b.yaw) * bo,
          ) - 1.94;
          minClearance = Math.min(minClearance, clearance);
        }
      }
    }
  }
  assert.ok(minClearance >= -0.03, `Body overlap exceeds 3cm: ${minClearance}m`);
  assert.ok(session.cars.every(c => c.speed > 12), 'No car may remain stuck in a pile-up');
});

test('All selectable circuits (Interlagos, Monza, Spa) are closed, wide, and well-separated', () => {
  assert.equal(TRACK_LIST.length, 3);
  for (const track of TRACK_LIST) {
    assert.ok(
      Math.abs(track.totalLength - track.meta.lengthMeters) < 25,
      `${track.id} length mismatch: ${track.totalLength} vs ${track.meta.lengthMeters}`,
    );

    const first = track.samples[0].pos;
    const last = track.samples[track.samples.length - 1].pos;
    const gap = Math.hypot(first.x - last.x, first.z - last.z);
    assert.ok(gap < 15, `${track.id} closed loop gap too large: ${gap}`);

    const sectors = new Set(track.samples.map((s) => s.sector));
    assert.deepEqual([...sectors].sort(), [1, 2, 3]);

    const drsZones = new Set(track.samples.map((s) => s.drsZone).filter((z) => z !== 0));
    assert.deepEqual([...drsZones].sort(), [1, 2]);
    assert.equal(track.towers.length, 8);

    const n = track.samples.length;
    let minWidth = Infinity;
    let minNonAdjacentDist = Infinity;
    for (let i = 0; i < n; i++) {
      const s = track.samples[i];
      minWidth = Math.min(minWidth, s.widthLeft + s.widthRight);
      for (let j = i + 1; j < n; j++) {
        const ds = Math.abs(track.samples[j].s - s.s);
        const arcDist = Math.min(ds, track.totalLength - ds);
        if (arcDist < 215) continue;
        const d = Math.hypot(s.pos.x - track.samples[j].pos.x, s.pos.z - track.samples[j].pos.z);
        if (d < minNonAdjacentDist) minNonAdjacentDist = d;
      }
    }
    assert.ok(minWidth >= 16.5, `${track.id} min width < 16.5m (${minWidth.toFixed(2)}m)`);
    assert.ok(
      minNonAdjacentDist >= 50,
      `${track.id} non-adjacent clearance ${minNonAdjacentDist.toFixed(1)}m < 50m`,
    );
  }
});

test('Gamepad mapper applies deadzone, steering curve, triggers, and edge-triggered actions', () => {
  assert.equal(applySteeringCurve(0.05, 0.08), 0);
  assert.ok(applySteeringCurve(-0.5, 0.08) > 0 && applySteeringCurve(-0.5, 0.08) < 0.5);
  assert.equal(applySteeringCurve(1.0, 0.08), -1);

  const edge = createGamepadEdgeState();
  const makeButtons = (overrides: Record<number, { pressed: boolean; value: number }> = {}) =>
    Array.from({ length: 16 }, (_, idx) => overrides[idx] ?? { pressed: false, value: 0 });

  const frame1 = mapGamepadState(
    {
      id: 'Xbox Wireless Controller',
      connected: true,
      axes: [-0.6, 0],
      buttons: makeButtons({
        7: { pressed: true, value: 0.85 },
        6: { pressed: false, value: 0.1 },
        1: { pressed: true, value: 1 },
        3: { pressed: true, value: 1 },
        8: { pressed: true, value: 1 },
        9: { pressed: true, value: 1 },
      }),
    },
    edge,
  );
  assert.ok(frame1.inputs.steer > 0.3);
  assert.equal(frame1.inputs.throttle, 0.85);
  assert.equal(frame1.inputs.brake, 0.1);
  assert.equal(frame1.inputs.ersBoost, true);
  assert.equal(frame1.inputs.drsToggleJustPressed, true);
  assert.equal(frame1.cameraCycleJustPressed, true);
  assert.equal(frame1.pauseJustPressed, true);

  // Holding Y/Select/Start on frame 2 must not re-fire edge actions
  const frame2 = mapGamepadState(
    {
      id: 'Xbox Wireless Controller',
      connected: true,
      axes: [0, 0],
      buttons: makeButtons({
        3: { pressed: true, value: 1 },
        8: { pressed: true, value: 1 },
        9: { pressed: true, value: 1 },
      }),
    },
    edge,
  );
  assert.equal(frame2.inputs.drsToggleJustPressed, false);
  assert.equal(frame2.cameraCycleJustPressed, false);
  assert.equal(frame2.pauseJustPressed, false);
});

test('AI difficulty levels produce distinct race pace (iniciante < competitivo < lendario)', () => {
  const runDistance = (difficulty: DifficultyLevel): number => {
    const cfg: RaceConfig = { ...DEFAULT_CONFIG, difficulty };
    const session = createRaceSession(cfg, 'playing');
    const leadAi = session.cars[0];
    for (let i = 0; i < 60 * 18; i++) {
      const inputs = computeAiInputs(leadAi, [leadAi], cfg, 1 / 60);
      stepVehiclePhysics(leadAi, inputs, cfg, 1 / 60);
    }
    return leadAi.s;
  };

  const dIni = runDistance('iniciante');
  const dComp = runDistance('competitivo');
  const dLeg = runDistance('lendario');
  assert.ok(dIni < dComp, `Expected iniciante (${dIni.toFixed(1)}m) < competitivo (${dComp.toFixed(1)}m)`);
  assert.ok(dComp < dLeg, `Expected competitivo (${dComp.toFixed(1)}m) < lendario (${dLeg.toFixed(1)}m)`);
});

test('Time Trial mode runs solo flying laps, records personal best, and emits live split delta', () => {
  const monza = getTrack('monza');
  const ttConfig: RaceConfig = { ...DEFAULT_CONFIG, trackId: 'monza', mode: 'timetrial' };
  const session = createRaceSession(ttConfig, 'playing', 'chase', false, monza, null);
  assert.equal(session.cars.length, 1);
  assert.equal(session.cars[0].isPlayer, true);

  let recordEvents = 0;
  let completedLaps = 0;
  // Session lifecycle uses the actual driver and fixed timestep, rather than a
  // hand-written controller that relied on the old wall heading assist.
  for (let step = 0; step < 180 * 360; step++) {
    const drive = computeAiInputs(session.cars[0], session.cars, session.config, 1/180, monza);
    const ev = stepRaceSession(session, drive, 1 / 180, monza);
    if (ev.lapCompleted) completedLaps++;
    if (ev.newRecordAchieved) recordEvents++;
    if (completedLaps >= 2 && session.cars[0].tNorm > 0.2) break;
  }

  assert.equal(session.phase, 'playing', 'Time Trial must continue running flying laps');
  assert.ok(completedLaps >= 2, `Expected >= 2 flying laps completed, got ${completedLaps}`);
  assert.ok(recordEvents >= 1, 'Expected at least 1 personal record achievement');
  assert.ok(session.personalRecordTime !== null && session.personalRecordTime > 25);
  assert.ok(session.bestLapBins !== null);

  const snap = buildTelemetrySnapshot(session, {
    throttle: 1,
    brake: 0,
    steer: 0,
    ersBoost: false,
    drsToggleJustPressed: false,
  });
  assert.equal(snap.trackId, 'monza');
  assert.equal(snap.mode, 'timetrial');
  assert.ok(snap.liveDeltaSeconds !== null && Number.isFinite(snap.liveDeltaSeconds));
});

test('Pacejka tire physics models slip saturation, braking axle load transfer, thermal window, and wear', () => {
  const fLow = pacejkaMagic(0.03);
  const fPeak = pacejkaMagic(0.14);
  const fSat = pacejkaMagic(0.38);
  assert.ok(fPeak > fLow && fPeak > fSat, `Expected Pacejka peak at ~0.14 rad slip (${fLow}, ${fPeak}, ${fSat})`);

  const brakingLoads = computeAxleLoads(798, 4000, -40);
  const accelLoads = computeAxleLoads(798, 4000, 15);
  assert.ok(brakingLoads.frontLoadN > accelLoads.frontLoadN, 'Braking must transfer vertical load onto front axle');
  assert.ok(accelLoads.rearLoadN > brakingLoads.rearLoadN, 'Acceleration must transfer load onto rear axle');

  const optDry = computeThermalGripMultiplier(95, 'dry');
  const coldDry = computeThermalGripMultiplier(55, 'dry');
  const hotDry = computeThermalGripMultiplier(130, 'dry');
  assert.ok(optDry > coldDry && optDry > hotDry);

  assert.ok(computeTireWearGripMultiplier(1.0) > computeTireWearGripMultiplier(0.25));

  const session = createRaceSession({ ...DEFAULT_CONFIG, tireWearEnabled: true }, 'playing');
  const car = session.cars[session.playerIndex];
  car.tireTempFront = 62;
  car.tireTempRear = 62;
  car.forwardSpeed = 68;
  car.absTriggered = true;

  for (let i = 0; i < 120; i++) {
    stepPacejkaTireState(car, 0.14, -35, 3500, 'dry', true, 1 / 60);
  }
  assert.ok(car.tireTempFront > 65, `Cold front tire should warm under cornering/braking (${car.tireTempFront})`);
  assert.ok(car.tireWear < 1.0, `Tire wear must decrease when wearEnabled is true (${car.tireWear})`);
});

test('Ghost Car records at 20 Hz, interpolates yaw across PI/-PI wrap, and drives Time Trial replay', () => {
  const rec = createGhostRecorder();
  const session = createRaceSession({ ...DEFAULT_CONFIG, mode: 'timetrial' }, 'playing');
  const car = session.cars[session.playerIndex];

  // Test 20 Hz interval cap + angle wrap interpolation
  car.x = 10;
  car.z = 20;
  car.yaw = Math.PI - 0.1;
  recordGhostFrame(rec, car, 0.0, true);
  recordGhostFrame(rec, car, 0.02); // below 0.05s interval -> ignored
  assert.equal(rec.samples.length, 1);

  car.x = 20;
  car.z = 40;
  car.yaw = -Math.PI + 0.1; // shortest diff across PI/-PI is +0.2 rad
  recordGhostFrame(rec, car, 0.06);
  assert.equal(rec.samples.length, 2);

  // Need >= 10 samples to finalize a full lap
  for (let s = 2; s < 12; s++) {
    recordGhostFrame(rec, car, s * 0.06, true);
  }
  const ghost = finalizeGhostLap(rec, 'interlagos', 'dry', 65.4);
  assert.ok(ghost !== null);

  const midPose = sampleGhostPose(ghost, 0.03);
  assert.ok(midPose !== null);
  assert.ok(Math.abs(midPose.x - 15) < 0.2);
  // Halfway across PI-0.1 -> -PI+0.1 should be near +-PI, not 0
  assert.ok(Math.abs(Math.abs(midPose.yaw) - Math.PI) < 0.15, `Expected wrapped yaw near PI, got ${midPose.yaw}`);
});

test('Spatial 3D rival audio selects closest rivals and applies physical Doppler pitch shift', () => {
  const cam = { x: 0, y: 2, z: 0 };
  const approaching = computeDopplerPitchRatio(cam, { vx: 0, vz: 0 }, { x: 0, y: 0, z: 40 }, { vx: 0, vz: -75 });
  const receding = computeDopplerPitchRatio(cam, { vx: 0, vz: 0 }, { x: 0, y: 0, z: 40 }, { vx: 0, vz: 75 });
  const stationary = computeDopplerPitchRatio(cam, { vx: 0, vz: 0 }, { x: 0, y: 0, z: 40 }, { vx: 0, vz: 0 });

  assert.ok(approaching > 1.15, `Approaching rival should pitch up (>1.15), got ${approaching}`);
  assert.ok(receding < 0.88, `Receding rival should pitch down (<0.88), got ${receding}`);
  assert.ok(Math.abs(stationary - 1.0) < 0.01);

  const rivals = [
    { id: 'far', x: 0, y: 0, z: 160 },
    { id: 'mid', x: 0, y: 0, z: 55 },
    { id: 'close', x: 5, y: 0, z: 12 },
    { id: 'third', x: 0, y: 0, z: 92 },
    { id: 'fourth', x: 0, y: 0, z: 105 },
  ];
  const selected = selectNearestRivals(rivals, cam, 3, 115);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].rival.id, 'close');
  assert.equal(selected[1].rival.id, 'mid');
  assert.equal(selected[2].rival.id, 'third');
});

test('Selecting any PLAYER_TEAMS preset updates player livery and keeps all 10 grid car numbers unique', () => {
  assert.ok(PLAYER_TEAMS.length >= 6);
  for (const team of PLAYER_TEAMS) {
    const session = createRaceSession({ ...DEFAULT_CONFIG, teamId: team.id }, 'playing');
    const player = session.cars[session.playerIndex];
    assert.equal(player.teamName, team.teamName);
    assert.equal(player.primaryColor, team.primaryColor);
    assert.equal(player.accentColor, team.accentColor);
    assert.equal(player.number, team.number);

    const gridNumbers = new Set(session.cars.map((c) => c.number));
    assert.equal(
      gridNumbers.size,
      session.cars.length,
      `Duplicate car number detected on grid for team ${team.id}`,
    );
  }
});

test('3-circle F1 capsule collision blocks nose-to-tail penetration at 4.5m while keeping 2.1m side-by-side clean', () => {
  const session = createRaceSession(DEFAULT_CONFIG, 'playing');
  const carA = { ...session.cars[0], x: 0, z: 0, yaw: 0, vx: 0, vz: 60, yawRate: 0, impactIntensity: 0 };
  const carB = { ...session.cars[1], x: 2.1, z: 0, yaw: 0, vx: 0, vz: 60, yawRate: 0, impactIntensity: 0 };

  // Side-by-side at 2.1m center spacing (> 1.94m capsule diameter): zero false bounce
  resolveCarCollisions([carA, carB]);
  assert.equal(carA.x, 0);
  assert.equal(carB.x, 2.1);
  assert.equal(carA.impactIntensity, 0);

  // Nose-to-tail at 4.5m longitudinal spacing (< 4.84m F1 axial capsule span): collides and pushes apart
  const noseA = { ...session.cars[0], x: 0, z: 0, yaw: 0, vx: 0, vz: 65, yawRate: 0, impactIntensity: 0 };
  const tailB = { ...session.cars[1], x: 0.45, z: 4.5, yaw: 0, vx: 0, vz: 50, yawRate: 0, impactIntensity: 0 };
  resolveCarCollisions([noseA, tailB]);
  assert.ok(tailB.z > 4.5 && noseA.z < 0, `Expected longitudinal separation (${noseA.z}, ${tailB.z})`);
  assert.ok(noseA.vz < 65 && tailB.vz > 50, 'Expected momentum exchange on nose-to-tail impact');
  assert.ok(noseA.yawRate !== 0 || tailB.yawRate !== 0, 'Expected off-center axial impact yaw deflection');
});

test('Kerb physics applies asymmetric roll kick and steeper wet kerb grip reduction', () => {
  const drySession = createRaceSession({ ...DEFAULT_CONFIG, weather: 'dry' }, 'playing');
  const wetSession = createRaceSession({ ...DEFAULT_CONFIG, weather: 'wet' }, 'playing');

  // Find a track sample that actively sits inside a kerb zone
  const kerbSample = INTERLAGOS_TRACK.samples.find((s) => s.kerbLeft || s.kerbRight)!;
  const sideSign = kerbSample.kerbRight ? 1 : -1;
  const kerbLat = sideSign * ((sideSign > 0 ? kerbSample.widthRight : kerbSample.widthLeft) + 0.35);

  const setupCarOnKerb = (car: typeof drySession.cars[0]) => {
    car.x = kerbSample.pos.x + kerbSample.right.x * kerbLat;
    car.z = kerbSample.pos.z + kerbSample.right.z * kerbLat;
    car.y = kerbSample.pos.y;
    car.trackIndex = kerbSample.index;
    car.yaw = Math.atan2(kerbSample.tangent.x, kerbSample.tangent.z);
    car.vx = kerbSample.tangent.x * 65;
    car.vz = kerbSample.tangent.z * 65;
    car.speed = 65;
    car.forwardSpeed = 65;
    car.gear = 6;
    car.rpm = 11200;
    car.roll = 0;
  };

  const dryCar = drySession.cars[drySession.playerIndex];
  const wetCar = wetSession.cars[wetSession.playerIndex];
  setupCarOnKerb(dryCar);
  setupCarOnKerb(wetCar);

  const brakeInput: ControlInputs = { throttle: 0, brake: 1, steer: 0, ersBoost: false, drsToggleJustPressed: false };
  for (let i = 0; i < 3; i++) {
    stepVehiclePhysics(dryCar, brakeInput, { ...DEFAULT_CONFIG, weather: 'dry' }, 1 / 60);
    stepVehiclePhysics(wetCar, brakeInput, { ...DEFAULT_CONFIG, weather: 'wet' }, 1 / 60);
  }

  assert.equal(dryCar.onKerb, true, 'Car positioned on kerb strip must report onKerb=true');
  assert.ok(
    Math.sign(dryCar.roll) === sideSign && Math.abs(dryCar.roll) > 0.001,
    `Expected asymmetric kerb roll kick toward side ${sideSign}, got ${dryCar.roll}`,
  );
  const drySpeed = Math.hypot(dryCar.vx, dryCar.vz);
  const wetSpeed = Math.hypot(wetCar.vx, wetCar.vz);
  assert.ok(
    drySpeed < wetSpeed,
    `Expected dry kerb braking (${drySpeed.toFixed(3)} m/s) to slow car more than wet kerb (${wetSpeed.toFixed(3)} m/s)`,
  );
});

test('Adaptive track sampling keeps step <= 3.0m, generates corner banking camber, and preserves GhostSample speed', () => {
  for (const track of TRACK_LIST) {
    let maxStep = 0;
    let maxBank = 0;
    for (let i = 0; i < track.samples.length; i++) {
      const a = track.samples[i];
      const b = track.samples[(i + 1) % track.samples.length];
      const stepDist = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z);
      if (stepDist > maxStep) maxStep = stepDist;
      if (Math.abs(a.bank) > maxBank) maxBank = Math.abs(a.bank);
    }
    assert.ok(maxStep <= 3.0, `${track.id} max sample spacing (${maxStep.toFixed(2)}m) exceeded 3.0m`);
    assert.ok(maxBank > 0.01 && maxBank <= 0.08, `${track.id} expected smooth corner banking, got ${maxBank}`);
  }

  const rec = createGhostRecorder();
  const session = createRaceSession({ ...DEFAULT_CONFIG, mode: 'timetrial' }, 'playing');
  const car = session.cars[session.playerIndex];
  car.forwardSpeed = 78.4;
  recordGhostFrame(rec, car, 0, true);
  assert.ok(typeof rec.samples[0].speed === 'number' && Math.abs(rec.samples[0].speed - 78.4) < 0.05);
});

test('F1 Sound Bank generates bounded PCM samples, gearbox ratios, and V6 firing orders', () => {
  const idleOrders = computeEngineOrderFrequencies(4000);
  const peakOrders = computeEngineOrderFrequencies(12000);
  assert.ok(Math.abs(idleOrders.fireHz - 200) < 0.1);
  assert.ok(Math.abs(peakOrders.fireHz - 600) < 0.1);
  assert.ok(Math.abs(peakOrders.secondOrderHz - 1200) < 0.1);

  const g2 = computeGearboxFrequency(2, 45, 11000);
  const g7 = computeGearboxFrequency(7, 45, 11000);
  assert.ok(g2 > g7, `Lower gear tooth ratio (${g2}) should whine higher at same speed/RPM than 7th (${g7})`);

  const fakeCtx = {
    sampleRate: 48000,
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const chans = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        sampleRate,
        length,
        numberOfChannels: channels,
        getChannelData: (c: number) => chans[c],
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;

  const bank = createF1SoundBank(fakeCtx);
  assert.equal(bank.upshiftCuts.length, 3);
  assert.equal(bank.downshiftClunks.length, 3);
  assert.equal(bank.downshiftBlips.length, 3);
  assert.equal(bank.exhaustPops.length, 4);
  assert.equal(bank.wastegateFlutters.length, 3);
  assert.equal(bank.chassisImpacts.length, 3);
  assert.equal(bank.autodromeIR.numberOfChannels, 2);

  for (const buf of [
    ...bank.upshiftCuts,
    ...bank.downshiftClunks,
    ...bank.downshiftBlips,
    ...bank.exhaustPops,
    ...bank.wastegateFlutters,
    bank.drsOpen,
    bank.drsClose,
    bank.kerbLoop,
    bank.skidScrapeLoop,
  ]) {
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      assert.ok(Number.isFinite(ch[i]) && a <= 1.0, 'Sample must stay bounded in [-1, 1]');
      if (a > peak) peak = a;
    }
    assert.ok(peak > 0.05, 'Generated PCM buffer must contain audible signal');
  }
});

