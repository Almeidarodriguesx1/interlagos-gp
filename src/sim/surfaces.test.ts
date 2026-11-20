import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySurface, APRON_WIDTH, getSurfaceZones, SURFACE_ORDER, validateSurfaceZones, type SurfaceZone } from './surfaceModel';
import { INTERLAGOS_TRACK, getSampleAtNorm, projectPointToTrack } from './track';
import { FixedStepClock, PHYSICS_DT, PHYSICS_HZ, MAX_PHYSICS_STEPS } from './fixedStep';
import { createRaceSession, stepRaceSession } from './raceDirector';
import { stepVehiclePhysics } from './physics';
import { createWheelContacts, wheelContacts } from '../audio/surfaces';
import { buildTrackGeometryBundle } from '../engine/trackBuilder';
import type { ControlInputs, RaceConfig } from './types';

const config: RaceConfig = { totalLaps: 3, weather: 'dry', absEnabled: true, tcEnabled: true, racingLineEnabled: true };
const coast: ControlInputs = { throttle: 0, brake: 0, steer: 0, ersBoost: false, drsToggleJustPressed: false };
// Synthetic test fixture only: never added to the production map.
const zone: SurfaceZone = { trackId: 'interlagos', start: .20, end: .24, side: 'right', minOffset: 1.8, maxOffset: 5.8, material: 'gravel', validation: 'confirmed', reference: 'Synthetic automated-test fixture' };
const projection = { onKerb: false, lateralOffset: 10, widthLeft: 7, widthRight: 6, tNorm: .22 };

function carOnApron() {
  const session = createRaceSession(config, 'playing');
  const car = session.cars[session.playerIndex];
  const s = getSampleAtNorm(.22);
  const lat = s.widthRight + 3.7;
  Object.assign(car, { x: s.pos.x + s.right.x * lat, z: s.pos.z + s.right.z * lat,
    y: s.pos.y + s.right.y * lat, yaw: Math.atan2(s.tangent.x, s.tangent.z),
    trackIndex: s.index, speed: 30, forwardSpeed: 30, vx: s.tangent.x * 30, vz: s.tangent.z * 30 });
  return car;
}

test('shared materials can replace the apron, preserve road/kerb priority and obey side/wrap boundaries', () => {
  assert.equal(classifySurface(projection, [zone]), 'gravel');
  assert.equal(classifySurface({ ...projection, lateralOffset: 0 }, [zone]), 'asphalt');
  assert.equal(classifySurface({ ...projection, onKerb: true }, [zone]), 'kerb');
  assert.equal(classifySurface({ ...projection, lateralOffset: -10 }, [zone]), 'asphalt');
  const wrapped = { ...zone, start: .95, end: .02 };
  assert.equal(classifySurface({ ...projection, tNorm: .001 }, [wrapped]), 'gravel');
  assert.equal(classifySurface({ ...projection, tNorm: .02 }, [wrapped]), 'asphalt');
  assert.equal(classifySurface({ ...projection, lateralOffset: 6 + APRON_WIDTH - .01 }), 'asphalt');
  assert.equal(classifySurface({ ...projection, lateralOffset: 6 + APRON_WIDTH + .01 }), 'grass');
});

test('authored zones require provenance, circuit, valid bounds and non-conflicting intervals', () => {
  assert.deepEqual(validateSurfaceZones([zone]), []);
  for (const invalid of [{ ...zone, trackId: undefined }, { ...zone, reference: '' }, { ...zone, minOffset: NaN }, { ...zone, maxOffset: 7 }, { ...zone, validation: undefined }]) {
    assert.ok(validateSurfaceZones([invalid]).length > 0);
  }
  assert.ok(validateSurfaceZones([zone, { ...zone, start: .21 }]).some(e => e.includes('overlap')));
  assert.deepEqual(validateSurfaceZones([zone, { ...zone, start: zone.end, end: .26 }]), []);
  assert.deepEqual(getSurfaceZones(INTERLAGOS_TRACK), [], 'No fictional zones enabled');
  const pending = { ...INTERLAGOS_TRACK, surfaceZones: [{ ...zone, validation: 'pending' as const }] };
  assert.deepEqual(getSurfaceZones(pending), [], 'Unconfirmed regions must never reach production consumers');
  assert.deepEqual(getSurfaceZones({ ...INTERLAGOS_TRACK, id: 'spa', surfaceZones: [zone] }), []);
  assert.throws(() => getSurfaceZones({ ...INTERLAGOS_TRACK, surfaceZones: [{ ...zone, reference: '' }] }), /reference required/);
});

test('recorded audio contacts reuse storage and read the same test map as vehicle physics', () => {
  const car = carOnApron();
  const track = { ...INTERLAGOS_TRACK, surfaceZones: [zone] };
  const contacts = createWheelContacts();
  const first = contacts[0];
  assert.equal(wheelContacts(car, track, undefined, contacts), contacts);
  assert.equal(contacts[0], first);
  assert.ok(contacts.every(c => c.material === 'gravel' && c.grounded));
  const asphalt = { ...car }, gravel = { ...car };
  stepVehiclePhysics(asphalt, coast, config, PHYSICS_DT, INTERLAGOS_TRACK);
  stepVehiclePhysics(gravel, coast, config, PHYSICS_DT, track);
  assert.ok(Math.hypot(gravel.vx, gravel.vz) < Math.hypot(asphalt.vx, asphalt.vz) - .005, `Gravel drag must slow coasting car`);
  const brake = { ...coast, brake: 1 };
  const roadBrake = { ...car }, gravelBrake = { ...car }, wetGrassBrake = { ...car };
  stepVehiclePhysics(roadBrake, brake, config, PHYSICS_DT, INTERLAGOS_TRACK);
  stepVehiclePhysics(gravelBrake, brake, config, PHYSICS_DT, track);
  stepVehiclePhysics(wetGrassBrake, brake, { ...config, weather: 'wet' }, PHYSICS_DT,
    { ...track, surfaceZones: [{ ...zone, material: 'grass' }] });
  assert.ok(Math.hypot(roadBrake.vx, roadBrake.vz) < Math.hypot(gravelBrake.vx, gravelBrake.vz), 'Road must have more braking grip than loose gravel');
  assert.ok(Math.hypot(wetGrassBrake.vx, wetGrassBrake.vz) > Math.hypot(gravelBrake.vx, gravelBrake.vz), 'Wet grass must offer less braking grip than gravel');
});

test('visual apron cells and sound classify an authored region identically, with unchanged road and walls', () => {
  const baseline = buildTrackGeometryBundle(INTERLAGOS_TRACK);
  const mappedTrack = { ...INTERLAGOS_TRACK, surfaceZones: [zone] };
  const mapped = buildTrackGeometryBundle(mappedTrack);
  try {
    assert.deepEqual(mapped.roadGeo.attributes.position.array, baseline.roadGeo.attributes.position.array);
    assert.deepEqual(mapped.wallSideGeo.attributes.position.array, baseline.wallSideGeo.attributes.position.array);
    const gravel = mapped.apronGeo.groups.find(g => g.materialIndex === SURFACE_ORDER.indexOf('gravel'));
    assert.ok(gravel && gravel.count > 0);
    const indices = mapped.apronGeo.index!, positions = mapped.apronGeo.attributes.position;
    let checked = 0;
    for (let i = gravel.start; i < gravel.start + gravel.count; i += 3) {
      let x = 0, z = 0;
      for (let j = 0; j < 3; j++) { const v = indices.getX(i + j); x += positions.getX(v) / 3; z += positions.getZ(v) / 3; }
      const p = projectPointToTrack(x, z, undefined, mappedTrack);
      assert.equal(classifySurface(p, getSurfaceZones(mappedTrack)), 'gravel');
      checked++;
    }
    assert.ok(checked > 50);
    const colors = mapped.terrainGeo.attributes.color.array;
    assert.ok(Math.max(...colors.slice(0, 600)) - Math.min(...colors.slice(0, 600)) > .04);
  } finally {
    for (const bundle of [mapped, baseline]) for (const value of Object.values(bundle)) {
      if (value && typeof value === 'object' && 'dispose' in value) value.dispose();
    }
  }
});

test('180 Hz clock preserves real time across common and software-rendered frame rates, and bounds stall recovery', () => {
  for (const fps of [12.5, 20, 30, 60, 120, 144, 240]) {
    const clock = new FixedStepClock();
    let steps = 0;
    for (let i = 0; i < fps * 10; i++) steps += clock.advance(1 / fps);
    assert.equal(steps, PHYSICS_HZ * 10, `${fps} FPS lost simulation time`);
    assert.equal(clock.droppedSeconds, 0);
    assert.ok(clock.alpha < 1e-7);
  }
  const clock = new FixedStepClock();
  assert.equal(clock.advance(NaN), 0);
  assert.equal(clock.advance(2), MAX_PHYSICS_STEPS);
  assert.ok(Math.abs(clock.droppedSeconds - (2 - MAX_PHYSICS_STEPS * PHYSICS_DT)) < 1e-9);
  assert.ok(clock.advance(1 / 240) === 0 && clock.alpha > 0);
});

test('race physics at 180 Hz produces identical state with 30 and 144 FPS presentation', () => {
  const simulate = (fps: number) => {
    const session = createRaceSession(config, 'playing');
    const clock = new FixedStepClock();
    for (let frame = 0; frame < fps * 3; frame++) {
      const count = clock.advance(1 / fps);
      for (let i = 0; i < count; i++) stepRaceSession(session, { ...coast, throttle: .6 }, PHYSICS_DT);
    }
    return session;
  };
  const slow = simulate(30), fast = simulate(144);
  assert.deepEqual(slow.cars, fast.cars);
  assert.ok(slow.cars.every(c => Number.isFinite(c.x + c.z + c.speed + c.rpm)));
});

test('braking responds to one side on gravel even when the chassis is over asphalt', () => {
  const mappedTrack = { ...INTERLAGOS_TRACK, surfaceZones: [zone] };
  const car = carOnApron();
  const s = getSampleAtNorm(.22, mappedTrack);
  const lat = s.widthRight + 1.65;
  Object.assign(car, { x: s.pos.x + s.right.x * lat, z: s.pos.z + s.right.z * lat, y: s.pos.y + s.right.y * lat });
  assert.equal(classifySurface(projectPointToTrack(car.x, car.z, s.index, mappedTrack), [zone]), 'asphalt');
  const wheels = wheelContacts(car, mappedTrack);
  assert.ok(wheels.some(wheel => wheel.material === 'gravel'));
  assert.ok(wheels.some(wheel => wheel.material !== 'gravel'));
  const allAsphalt = { ...car };
  const brake = { ...coast, brake: 1 };
  stepVehiclePhysics(allAsphalt, brake, config, PHYSICS_DT, INTERLAGOS_TRACK);
  stepVehiclePhysics(car, brake, config, PHYSICS_DT, mappedTrack);
  assert.ok(Math.hypot(car.vx, car.vz) > Math.hypot(allAsphalt.vx, allAsphalt.vz));
});
