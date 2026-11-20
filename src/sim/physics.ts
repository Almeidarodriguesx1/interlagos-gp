import { createWheelContacts, wheelContacts } from './wheelContacts';
import { resolveBarrierContacts, resolveSceneryContacts } from './collisions';
import type { SceneryWorld } from './scenery';
import { steeringLock, BASE_TIRE_MU, tireForceCapacity, combinedGripScale } from './dynamics';
/** Gravity projected from the track tangent into the car heading (horizontal m/s²). */
const gripContacts = createWheelContacts();

export function slopeAcceleration(grade:number, tx:number, tz:number, axisX:number, axisZ:number):number {
  return -9.81 * grade * (tx * axisX + tz * axisZ);
}
import { classifySurface, getSurfaceZones, SURFACE_PROFILES } from './surfaceModel';
import { stepPacejkaTireState } from './pacejka';
import { getSampleAtDistance, INTERLAGOS_TRACK, projectPointToTrack, type InterlagosTrack } from './track';
import type { CameraMode, CarState, ControlInputs, RaceConfig } from './types';

export const MAX_RPM = 12800;
export const IDLE_RPM = 4000;
export const CAR_MASS_KG = 798;
const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
export const WHEEL_RADIUS = 0.36;
const FINAL_DRIVE = 5.45;

// 8-speed F1 gearbox ratios (matched to shift cleanly 1st ~106 km/h -> 8th ~340 km/h at 12,100 RPM)
export const GEAR_RATIOS = [
  0, // 0: Neutral
  2.85, // 1st (~106 km/h)
  2.22, // 2nd (~136 km/h)
  1.80, // 3rd (~168 km/h)
  1.50, // 4th (~201 km/h)
  1.28, // 5th (~236 km/h)
  1.12, // 6th (~270 km/h)
  0.99, // 7th (~305 km/h)
  0.89, // 8th (~339 km/h)
];

const REVERSE_RATIO = -2.4;

/**
 * Normalized F1 1.6L V6 Turbo Hybrid torque curve.
 * Strong mid-range electric fill + screaming high-RPM power band (9500-12500 RPM).
 */
export function getEngineTorqueNm(rpm: number, ersActive: boolean): number {
  const clamped = Math.max(IDLE_RPM, Math.min(MAX_RPM, rpm));
  const norm = (clamped - IDLE_RPM) / (MAX_RPM - IDLE_RPM);
  const iceFactor = 0.72 + 0.28 * Math.sin(Math.min(1, norm * 1.12) * Math.PI * 0.7);
  const limiter = clamped > 12550 ? Math.max(0.15, 1 - (clamped - 12550) / 300) : 1;
  const iceTorque = 625 * iceFactor * limiter;
  // MGU-K adds ~120 kW electrical torque across the power band
  const ersTorque = ersActive ? 135 * (1 - 0.1 * norm) : 0;
  return iceTorque + ersTorque;
}

/**
 * Computes wheel-to-engine RPM and automatic 8-speed F1 transmission shifts.
 */
export function updateGearbox(car: CarState, throttle: number, brake: number, dt: number): void {
  if (car.engineRunning === false) { car.rpm = 0; return; }
  const absFwd = Math.abs(car.forwardSpeed);

  // Allow reverse only when nearly stationary and holding brake
  if (!car.manualTransmission && car.gear === -1) {
    if (throttle > 0.15 && car.forwardSpeed > -1.5) {
      car.gear = 1;
    } else if (car.forwardSpeed > 1.0) {
      car.gear = 1;
    }
  } else if (!car.manualTransmission && car.gear === 0) {
    if (throttle > 0.1) car.gear = 1;
  }

  const ratio = car.gear === -1 ? Math.abs(REVERSE_RATIO) : GEAR_RATIOS[Math.max(1, car.gear)] || GEAR_RATIOS[1];
  const wheelOmega = absFwd / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS);
  const targetEngineRpm = Math.max(IDLE_RPM, (wheelOmega * ratio * FINAL_DRIVE * 60) / (2 * Math.PI));

  // Smooth clutch slip at low launch speed
  const launchBlend = Math.min(1, absFwd / 10);
  const freeRevRpm = IDLE_RPM + (car.gear === -1 ? brake : throttle) * 6800;
  const blendedRpm = car.gear === 0 ? freeRevRpm : freeRevRpm * (1 - launchBlend) + targetEngineRpm * launchBlend;
  car.rpm += (Math.min(MAX_RPM, blendedRpm) - car.rpm) * (1 - Math.exp(-20 * dt));

  if (car.manualTransmission) return;

  // Automatic F1 shift points (forward gears only; allow multi-gear downshifts under hard braking)
  if (car.gear >= 1 && car.gear < 8 && car.rpm > 12150 && throttle > 0.32 && car.slipRatio < 0.34) {
    car.gear += 1;
    const nextRatio = GEAR_RATIOS[car.gear];
    car.rpm = Math.max(IDLE_RPM, (wheelOmega * nextRatio * FINAL_DRIVE * 60) / (2 * Math.PI));
    car.shiftFlashTimer = 0.095;
  } else {
    let downshifts = 0;
    while (car.gear > 1 && car.rpm < 9200 && downshifts < 3) {
      const prevRatio = GEAR_RATIOS[car.gear - 1];
      const wouldBeRpm = (wheelOmega * prevRatio * FINAL_DRIVE * 60) / (2 * Math.PI);
      if (wouldBeRpm < 12100) {
        car.gear -= 1;
        car.rpm = Math.max(IDLE_RPM, wouldBeRpm);
        car.shiftFlashTimer = 0.11;
        downshifts++;
      } else {
        break;
      }
    }
  }
}

/**
 * Pure helper: checks whether an upcoming corner requires braking soon given current speed.
 */
export function computeCornerBrakingCue(
  car: CarState,
  config: RaceConfig,
  track: InterlagosTrack = INTERLAGOS_TRACK,
): boolean {
  if (car.speed < 28 || car.gear === -1) return false;
  const weatherFactor = config.weather === 'wet' ? 0.78 : 1.0;
  for (let dist = 20; dist <= 185; dist += 15) {
    const sample = getSampleAtDistance(car.s + dist, track);
    const k = Math.max(0.0005, Math.abs(sample.drivingCurvature));
    const safeCornerSpeed = Math.sqrt((19.0 * weatherFactor) / k);
    const brakeDecel = 20.5 * weatherFactor; // Conservative gameplay cue, not measured braking telemetry
    const entryThreshold = Math.sqrt(safeCornerSpeed * safeCornerSpeed + 2 * brakeDecel * Math.max(0, dist - 14));
    if (car.speed > entryThreshold) {
      return true;
    }
  }
  return false;
}

/**
 * Pure helper: computes aerodynamic slipstream intensity (0..1) from cars directly ahead.
 * Trailing another F1 car within 2.5m..34m aligned laterally reduces drag by up to ~21%.
 */
export function computeSlipstreamIntensity(
  car: CarState,
  allCars: CarState[],
  track: InterlagosTrack = INTERLAGOS_TRACK,
): number {
  if (car.speed < 25 || car.gear === -1) return 0;
  let best = 0;
  for (const other of allCars) {
    if (other.id === car.id) continue;
    let ds = other.s - car.s;
    if (ds < 0) ds += track.totalLength;
    if (ds >= 2.5 && ds <= 34) {
      const latDiff = Math.abs(other.lateralOffset - car.lateralOffset);
      if (latDiff < 2.5) {
        const distWeight = 1 - (ds - 2.5) / 31.5;
        const alignWeight = 1 - latDiff / 2.5;
        const tow = distWeight * alignWeight;
        if (tow > best) best = tow;
      }
    }
  }
  return Math.max(0, Math.min(1, best));
}

/**
 * Pure helper: computes speed-scaled screen motion blur intensity (0..1)
 * ramping smoothly from ~80 km/h (22 m/s) up to 335 km/h (93 m/s),
 * weighted by camera perspective (strongest onboard/chase, subtle on TV/Heli).
 */
export function computeMotionBlurIntensity(speedMs: number, cameraMode: CameraMode): number {
  const absSpeed = Math.abs(speedMs);
  if (absSpeed <= 22) return 0;
  const t = Math.max(0, Math.min(1, (absSpeed - 22) / (93 - 22)));
  const smooth = t * t * (3 - 2 * t);
  const camScale =
    cameraMode === 'cockpit'
      ? 1.0
      : cameraMode === 'tcam'
      ? 0.94
      : cameraMode === 'chase'
      ? 0.85
      : cameraMode === 'trackside'
      ? 0.32
      : 0.18;
  return Math.max(0, Math.min(1, smooth * camScale));
}

/**
 * Pure helper: returns which lateral side (-1 left, +1 right, 0 none)
 * has tires actively kicking up kerb dust/grit particles.
 */
export function computeKerbParticleSide(car: CarState): -1 | 0 | 1 {
  if (!car.onKerb || car.speed < 10) return 0;
  return car.lateralOffset < 0 ? -1 : 1;
}

/**
 * Steps a single F1 vehicle forward by `dt` seconds.
 * Pure deterministic physics function (no DOM/Three.js coupling).
 */
export function stepVehiclePhysics(
  car: CarState,
  inputs: ControlInputs,
  config: RaceConfig,
  dt: number,
  track: InterlagosTrack = INTERLAGOS_TRACK,
  allowMotion = true,
  slipstreamIntensity = 0,
  scenery?: SceneryWorld,
): void {
  if (inputs.ignitionToggleJustPressed) {
    car.engineRunning = car.engineRunning === false;
    car.engineStartTimer = car.engineRunning ? .7 : 0;
  }
  car.engineStartTimer = Math.max(0, (car.engineStartTimer ?? 0) - dt);
  const powered = car.engineRunning !== false && car.engineStartTimer === 0;
  if (car.manualTransmission) {
    if (inputs.shiftUpJustPressed && car.gear < 8) { car.gear++; car.shiftFlashTimer = .1; }
    if (inputs.shiftDownJustPressed && car.gear > -1) {
      const next = car.gear - 1;
      const rpm = Math.abs(car.forwardSpeed) / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS) * (GEAR_RATIOS[Math.max(1,next)] || 1) * FINAL_DRIVE * 60 / (2*Math.PI);
      if ((next > 0 && rpm < MAX_RPM) || (next <= 0 && car.speed < 1)) { car.gear = next; car.shiftFlashTimer = .1; }
    }
  }
  const brake = Math.max(0, Math.min(1, inputs.brake));
  const throttle = powered ? Math.max(0, Math.min(1, inputs.throttle)) * (1 - brake) : 0;
  const steerInput = Math.max(-1, Math.min(1, inputs.steer));

  car.shiftFlashTimer = Math.max(0, car.shiftFlashTimer - dt);
  car.impactIntensity = Math.max(0, car.impactIntensity - dt * 5.5);

  // Pre-launch revving during countdown
  if (!allowMotion) {
    const targetRev = car.engineRunning === false ? 0 : IDLE_RPM + throttle * 7400;
    car.rpm += (targetRev - car.rpm) * (1 - Math.exp(-14 * dt));
    if (!car.manualTransmission) car.gear = 1;
    car.steerAngle = steerInput * 0.25;
    return;
  }

  // Track projection
  const proj = projectPointToTrack(car.x, car.z, car.trackIndex, track);
  car.trackIndex = proj.sampleIndex;
  car.s = proj.s;
  car.tNorm = proj.tNorm;
  car.lateralOffset = proj.lateralOffset;
  car.sector = proj.sector;
  car.onTrack = proj.onTrack;
  car.onKerb = proj.onKerb;
  if (!proj.onTrack) {
    car.offTrackTime += dt;
  } else {
    car.offTrackTime = Math.max(0, car.offTrackTime - dt * 2);
  }

  // DRS eligibility & toggle
  if (proj.drsDetection !== 0) {
    car.drsArmedZone = proj.drsDetection;
  }
  const inActiveDrsZone = proj.drsZone !== 0;
  car.drsEligible = inActiveDrsZone;
  if (inputs.drsToggleJustPressed && car.drsEligible) {
    car.drsActive = !car.drsActive;
  }
  if (!car.drsEligible || brake > 0.15) {
    car.drsActive = false;
  }

  // ERS MGU-K battery management
  if (inputs.ersBoost && throttle > 0.4 && car.ersCharge > 1) {
    car.ersActive = true;
    car.ersCharge = Math.max(0, car.ersCharge - 11.0 * dt);
  } else {
    car.ersActive = false;
    if (brake > 0.15 && car.forwardSpeed > 15) {
      car.ersCharge = Math.min(100, car.ersCharge + brake * 9.5 * dt);
    } else {
      car.ersCharge = Math.min(100, car.ersCharge + 0.9 * dt);
    }
  }

  // Forward & right unit vectors in XZ plane
  const fwdX = Math.sin(car.yaw);
  const fwdZ = Math.cos(car.yaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  // Decompose world velocity into car local frame
  const vFwd = car.vx * fwdX + car.vz * fwdZ;
  const vLat = car.vx * rightX + car.vz * rightZ;
  car.forwardSpeed = vFwd;
  car.lateralSpeed = vLat;
  car.speed = Math.sqrt(car.vx * car.vx + car.vz * car.vz);

  if (brake < .08) car.brakeHeldFromMotion = false;
  else if (car.speed > .05 && car.reverseHoldTime === 0) car.brakeHeldFromMotion = true;
  // Reverse engagement logic: require firm standstill hold so corner braking never shifts into Reverse accidentally
  if (!car.manualTransmission && powered) {
  if (car.gear === -1) {
    if (throttle > 0.12 && vFwd > -2.5) {
      car.gear = 1;
      car.reverseHoldTime = 0;
    }
  } else {
    if (!car.brakeHeldFromMotion && brake > 0.35 && throttle < 0.08 && car.speed < .05) {
      car.reverseHoldTime += dt;
      if (car.reverseHoldTime >= 0.38) {
        car.gear = -1;
      }
    } else {
      car.reverseHoldTime = 0;
    }
  }

  }

  // Update 8-speed gearbox & RPM
  updateGearbox(car, throttle, brake, dt);

  // Crisp speed-sensitive steering: immediate turn-in bite on command, fast centering, rock-solid at 320+ km/h
  const speedNorm = Math.min(1, car.speed / 88);
  const maxSteerRad = steeringLock(car.speed);
  const targetSteer = steerInput * maxSteerRad;
  const isReturningOrCountering =
    Math.abs(steerInput) < 0.05 ||
    (Math.abs(car.steerAngle) > 0.01 && Math.sign(steerInput) !== Math.sign(car.steerAngle));
  // Blend progressively into full lock so an analogue stick crossing 98% has no rate step.
  const fullLockBlend = car.isPlayer ? Math.max(0, (Math.abs(steerInput) - .65) / .35) : 0;
  const turnInRate = 16.5 - 5.5 * speedNorm - fullLockBlend * (3.5 + .5 * speedNorm);
  const steerRate = isReturningOrCountering ? 26 : turnInRate;
  car.steerAngle += (targetSteer - car.steerAngle) * (1 - Math.exp(-steerRate * dt));

  // Aerodynamics: Drag, Slipstream Tow & High-Downforce Ground Effect
  const clampedTow = Math.max(0, Math.min(1, slipstreamIntensity));
  car.slipstreamActive = clampedTow > 0.16 && car.speed > 32;
  const baseCdA = car.drsActive ? 1.02 : 1.32;
  const cdA = baseCdA * (1 - clampedTow * 0.21);
  const aeroHealth = 1 - 0.18 * (car.frontAeroDamage ?? 0) - 0.16 * (car.rearAeroDamage ?? 0);
  const clA = (car.drsActive ? 3.25 : 4.25) * (1 - clampedTow * 0.10) * aeroHealth;
  const q = 0.5 * AIR_DENSITY * vFwd * Math.abs(vFwd);
  const dragForce = q * cdA;
  const downforce = Math.max(0, 0.5 * AIR_DENSITY * vFwd * vFwd * clA);

  // Road surface, weather & Pacejka thermal/wear grip multiplier
  const weatherGrip = config.weather === 'wet' ? 0.78 : 1.0;
  const zones = getSurfaceZones(track);
  const centerSurface = SURFACE_PROFILES[classifySurface(proj, zones)];
  const weatherGripKey = config.weather === 'wet' ? 'wetGrip' : 'dryGrip';
  let surfaceGrip = centerSurface[weatherGripKey];
  let rolling = centerSurface.rollingResistance;
  let lateralStiffness = centerSurface.lateralStiffness;
  const edge = proj.lateralOffset < 0 ? proj.widthLeft : proj.widthRight;
  if (edge - Math.abs(proj.lateralOffset) < 2) {
    let grounded = 0;
    let grip = 0, resistance = 0, stiffness = 0;
    for (const contact of wheelContacts(car, track, zones, gripContacts)) {
      if (!contact.grounded) continue;
      const profile = SURFACE_PROFILES[contact.material];
      grounded++;
      grip += profile[weatherGripKey];
      resistance += profile.rollingResistance;
      stiffness += profile.lateralStiffness;
    }
    if (config.mode === 'race' && gripContacts.every(contact => !contact.insideTrack)) car.lapValid = false;
    if (grounded) {
      surfaceGrip = grip / grounded;
      rolling = resistance / grounded;
      lateralStiffness = stiffness / grounded;
    }
  }
  const normalForce = CAR_MASS_KG * GRAVITY + downforce;
  const slipAngle = Math.atan2(vLat, Math.max(2.0, Math.abs(vFwd)));
  const estLongAccel = brake > 0.15 ? -brake * 42 : throttle * 16;
  const tireRes = stepPacejkaTireState(
    car,
    slipAngle,
    estLongAccel,
    downforce,
    config.weather,
    config.tireWearEnabled !== false,
    dt,
  );
  const tirePeakMu = BASE_TIRE_MU * weatherGrip * surfaceGrip * tireRes.combinedGripMult;
  const maxTireForce = tireForceCapacity(normalForce, CAR_MASS_KG * GRAVITY, tirePeakMu);

  // Longitudinal drive & braking forces
  const gearRatio = car.gear === -1 ? REVERSE_RATIO : GEAR_RATIOS[Math.max(1, car.gear)] || GEAR_RATIOS[1];
  const engineTorque = powered && car.gear !== 0 ? getEngineTorqueNm(car.rpm, car.ersActive) : 0;
  const drivetrainEfficiency = 0.92;

  let driveForce = 0;
  if (car.gear === -1) {
    // In Reverse, holding brake/reverse pedal accelerates backward up to ~65 km/h
    const revInput = car.manualTransmission ? throttle : brake > 0.1 ? brake : 0;
    const revCap = vFwd < -18 ? 0 : 1;
    driveForce = -((engineTorque * Math.abs(REVERSE_RATIO) * FINAL_DRIVE * drivetrainEfficiency) / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS)) * revInput * 0.45 * revCap;
  } else {
    driveForce = ((engineTorque * gearRatio * FINAL_DRIVE * drivetrainEfficiency) / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS)) * throttle;
  }

  // Traction Control (TC): caps drive force within rear tire grip budget
  car.tcTriggered = false;
  const maxDriveTraction = maxTireForce * 0.84 * tireRes.rearGripMult;
  if (driveForce > maxDriveTraction) {
    if (config.tcEnabled) {
      driveForce = maxDriveTraction * 0.97;
      car.tcTriggered = true;
    } else {
      const excessRatio = (driveForce - maxDriveTraction) / maxDriveTraction;
      driveForce = maxDriveTraction * (0.88 - Math.min(0.22, excessRatio * 0.22));
      car.slipRatio = Math.max(car.slipRatio, Math.min(1, excessRatio * 0.55));
    }
  }

  // Requested brake force; actual braking is limited by load-sensitive combined grip.
  const rawBrakeForce = car.gear === -1 && !car.manualTransmission && powered ? throttle * 18000 : brake * (27500 + downforce * 1.65);
  car.absTriggered = false;
  let effectiveBrake = rawBrakeForce;
  const maxBrakeTraction = maxTireForce * 0.99;
  if (rawBrakeForce > maxBrakeTraction) {
    if (config.absEnabled) {
      effectiveBrake = maxBrakeTraction * 0.97;
      car.absTriggered = true;
    } else {
      effectiveBrake = maxBrakeTraction * 0.84;
      car.slipRatio = Math.max(car.slipRatio, 0.72);
    }
  }

  // Braking opposes current motion direction; in reverse, throttle acts as brake
  let brakeSigned = 0;
  if (car.gear === -1 && !car.manualTransmission && powered) {
    if (vFwd < -0.3 && throttle > 0.05) {
      brakeSigned = effectiveBrake;
    } else if (brake < 0.08 && Math.abs(vFwd) > 0.2) {
      brakeSigned = -Math.sign(vFwd) * 900;
    }
  } else {
    if (vFwd > 0.3) {
      brakeSigned = -effectiveBrake;
    } else if (vFwd < -0.3) {
      brakeSigned = effectiveBrake;
    } else if (brake > 0.1 && throttle < 0.05) {
      brakeSigned = -vFwd * CAR_MASS_KG * 12;
    }
  }

  // Rolling resistance + off-track drag + track grade
  const gradeForce = CAR_MASS_KG * slopeAcceleration(proj.grade, proj.tangent.x, proj.tangent.z, fwdX, fwdZ);
  if (brake > .1 && throttle < .05 && Math.abs(vFwd) < .25) brakeSigned = -Math.max(-effectiveBrake, Math.min(effectiveBrake, gradeForce));
  const beforeRolling = driveForce + brakeSigned - dragForce + gradeForce;
  const rollingResistance = Math.abs(vFwd) > .03 ? rolling * Math.sign(vFwd) : Math.max(-rolling, Math.min(rolling, beforeRolling));

  // ABS reserves part of the combined tire budget for turn-in under braking.
  const turnDemand = Math.min(.85 - .20 * brake, Math.abs(vFwd * vFwd * Math.tan(car.steerAngle)) /
    ((car.geometry?.wheelbaseM ?? 3.6) * Math.max(1, maxTireForce / CAR_MASS_KG)));
  if (config.absEnabled && brake > 0 && brakeSigned * vFwd < 0) {
    const available = maxTireForce * Math.sqrt(1 - turnDemand * turnDemand);
    brakeSigned = Math.sign(brakeSigned) * Math.min(Math.abs(brakeSigned), available);
  }
  const requestedLongTireForce = driveForce + brakeSigned;

  // Lateral tire cornering force (responsive front bite + trail-braking turn-in + planted rear)
  const wheelbase = car.geometry?.wheelbaseM ?? 3.6;
  const absSpeed = Math.max(0.5, Math.abs(vFwd));
  const targetYawRate = (vFwd / wheelbase) * Math.tan(car.steerAngle);

  const lockupSteeringPenalty = !config.absEnabled && brake > 0.75 && rawBrakeForce > maxBrakeTraction ? 0.58 : 1.0;

  // Strong lateral grip damps unwanted sideways drift smoothly without sluggish steering delay
  const corneringStiffness = lateralStiffness * weatherGrip * lockupSteeringPenalty * tireRes.pacejkaLatFactor;
  const maxLatAccel = maxTireForce / CAR_MASS_KG;


  // Clamp target yaw rate within tire lateral force capability (0.97 preserves crisp turn-in without snap-spins)
  const gripFactor = Math.min(1, (maxLatAccel / (Math.abs(targetYawRate * absSpeed) + 1e-4)) * 0.97);
  // Subtle TC counter-steer/yaw stabilization + steering nibble when climbing raised kerbs
  const tcStability = config.tcEnabled ? -vLat * 0.032 : 0;
  const kerbNibble = car.onKerb && car.speed > 14 ? (car.lateralOffset < 0 ? -1 : 1) * 0.045 : 0;
  const effectiveTargetYawRate = targetYawRate * gripFactor * lockupSteeringPenalty + tcStability + kerbNibble;
  const yawAgility = 24.0 * weatherGrip * (car.onTrack ? 1.0 : 0.80) * tireRes.frontGripMult;
  car.yawRate += (effectiveTargetYawRate - car.yawRate) * (1 - Math.exp(-yawAgility * dt));

  // Track slip ratio for tire smoke & audio screech
  const rawSlip = Math.min(1.2, Math.abs(slipAngle) * 2.2 + (car.tcTriggered ? 0.12 : 0));
  car.slipRatio += (rawSlip - car.slipRatio) * (1 - Math.exp(-10 * dt));

  // Integrate local accelerations into world velocities (including track camber lateral gravity)
  const bankDotRight = proj.right.x * rightX + proj.right.z * rightZ;
  const bankLatAccel = -GRAVITY * Math.sin(proj.bank) * bankDotRight + slopeAcceleration(proj.grade, proj.tangent.x, proj.tangent.z, rightX, rightZ);
  // Tire forces act in the OLD chassis frame. Rotating velocity with the new yaw
  // would add free centripetal acceleration and bypass the friction budget.
  const requestedLatForce = CAR_MASS_KG * (-vFwd * car.yawRate - vLat * corneringStiffness);
  // ABS has already metered the brake force. Give lateral correction the remaining
  // friction budget instead of reducing that brake force again for the same turn.
  const lateralBudget = Math.sqrt(Math.max(0, maxTireForce ** 2 - requestedLongTireForce ** 2));
  const lateralForce = config.absEnabled && brakeSigned * vFwd < 0 && brake > 0
    ? Math.max(-lateralBudget, Math.min(lateralBudget, requestedLatForce))
    : requestedLatForce;
  const gripScale = combinedGripScale(requestedLongTireForce, lateralForce, maxTireForce);
  const clampedLatAccel = lateralForce * gripScale / CAR_MASS_KG;
  const netLongForce = requestedLongTireForce * gripScale - dragForce - rollingResistance + gradeForce;
  const longAccel = netLongForce / CAR_MASS_KG;
  const nextVFwd = vFwd + longAccel * dt;
  const holdLateral = brake > .1 && throttle < .05 && Math.abs(vFwd) < .25 && Math.abs(vLat) < .05 && Math.abs(bankLatAccel) < maxLatAccel;
  const nextVLat = holdLateral ? 0 : vLat + (clampedLatAccel + bankLatAccel) * dt;

  // Update yaw
  car.yaw += car.yawRate * dt;
  while (car.yaw > Math.PI) car.yaw -= Math.PI * 2;
  while (car.yaw < -Math.PI) car.yaw += Math.PI * 2;

  car.vx = fwdX * nextVFwd + rightX * nextVLat;
  car.vz = fwdZ * nextVFwd + rightZ * nextVLat;

  // Prevent drift at standstill
  if (car.gear !== -1 && brake > 0.1 && throttle < 0.05 && Math.hypot(nextVFwd, nextVLat) < 0.25 && Math.hypot(gradeForce, CAR_MASS_KG * bankLatAccel) <= effectiveBrake) {
    car.vx = 0;
    car.vz = 0;
  }

  const oldX = car.x, oldZ = car.z, oldYaw = car.yaw - car.yawRate * dt;
  // Integrate position
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Update elevation smoothly to Interlagos surface height with serrated kerb vibration
  const postProj = projectPointToTrack(car.x, car.z, car.trackIndex, track);
  const kerbPhase = Math.sin(postProj.s * 12.0);
  const kerbBump = postProj.onKerb ? kerbPhase * 0.022 : 0;
  car.y = postProj.elevation + kerbBump;
  car.lateralOffset = postProj.lateralOffset;

  if (scenery) resolveSceneryContacts(car, scenery, oldX, oldZ, oldYaw);
  resolveBarrierContacts(car, track);
  if (config.mode === 'practice') car.frontAeroDamage = car.rearAeroDamage = 0;
  const corrected = projectPointToTrack(car.x, car.z, car.trackIndex, track);
  car.lateralOffset = corrected.lateralOffset;
  car.y = corrected.elevation + (corrected.onKerb ? Math.sin(corrected.s * 12) * 0.022 : 0);

  // Visual suspension pitch, asymmetric kerb roll & track elevation slope alignment
  const targetPitch = Math.max(-0.035, Math.min(0.035, -longAccel / 450));
  const kerbSideSign = postProj.onKerb ? (postProj.lateralOffset < 0 ? -1 : 1) : 0;
  const kerbRollKick =
    kerbSideSign * (0.016 + kerbPhase * 0.006) * Math.min(1, car.speed / 28);
  const targetRoll = Math.max(-0.028, Math.min(0.028, (car.yawRate * vFwd) / 1100 + kerbRollKick));
  const normal = corrected.up;
  const targetTrackPitch = Math.atan2(normal.x * fwdX + normal.z * fwdZ, normal.y);
  const targetBank = Math.asin(Math.max(-1, Math.min(1, normal.x * rightX + normal.z * rightZ)));
  car.pitch += (targetPitch - car.pitch) * (1 - Math.exp(-12 * dt));
  car.roll += (targetRoll - car.roll) * (1 - Math.exp(-12 * dt));
  car.trackPitch += (targetTrackPitch - car.trackPitch) * (1 - Math.exp(-16 * dt));
  car.trackBank += (targetBank - car.trackBank) * (1 - Math.exp(-14 * dt));

  // Carbon brake disc temperature (heats rapidly under high-speed braking, cools with airflow)
  const brakeHeatRate = brake > 0.15 && car.speed > 12 ? brake * (car.speed / 68) * 1.65 : 0;
  const brakeCoolRate = 0.20 + car.speed * 0.0085;
  car.brakeTemp = Math.max(0, Math.min(1, car.brakeTemp + (brakeHeatRate - brakeCoolRate * car.brakeTemp) * dt));

  // Titanium skid-block sparks when high downforce compresses suspension over kerbs or crests
  car.skidSparks =
    car.speed > 56 &&
    (postProj.onKerb || Math.abs(postProj.grade) > 0.042 || (brake > 0.65 && car.speed > 66));

  // Wheel rotation
  car.wheelSpin = (car.wheelSpin + (nextVFwd / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS)) * dt) % (Math.PI * 200);
}

const AXIAL_CAPSULE_OFFSETS = [-1.45, 0, 1.45] as const;

/**
 * Resolves car-to-car collisions using a 3-circle axial capsule per car (~1.94m wide x ~4.84m long)
 * so wheel-to-wheel side clearance stays tight while nose-to-tail contact and yaw deflection feel realistic.
 */
export function resolveCarCollisions(cars: CarState[]): void {
  const circleRadius = 0.97;
  const minDist = circleRadius * 2;
  const minDistSq = minDist * minDist;
  const broadphaseMax = 5.4;
  const broadphaseMaxSq = broadphaseMax * broadphaseMax;

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dxCenter = b.x - a.x;
      const dzCenter = b.z - a.z;
      const centerDistSq = dxCenter * dxCenter + dzCenter * dzCenter;
      if (centerDistSq > broadphaseMaxSq || centerDistSq < 1e-8) continue;

      const afx = Math.sin(a.yaw);
      const afz = Math.cos(a.yaw);
      const bfx = Math.sin(b.yaw);
      const bfz = Math.cos(b.yaw);

      let deepestOverlap = 0;
      let bestNx = 0;
      let bestNz = 0;
      let bestOffsetA = 0;
      let bestOffsetB = 0;

      for (let ai = 0; ai < AXIAL_CAPSULE_OFFSETS.length; ai++) {
        const offA = AXIAL_CAPSULE_OFFSETS[ai];
        const ax = a.x + afx * offA;
        const az = a.z + afz * offA;

        for (let bi = 0; bi < AXIAL_CAPSULE_OFFSETS.length; bi++) {
          const offB = AXIAL_CAPSULE_OFFSETS[bi];
          const bx = b.x + bfx * offB;
          const bz = b.z + bfz * offB;

          const dx = bx - ax;
          const dz = bz - az;
          const dSq = dx * dx + dz * dz;
          if (dSq < minDistSq) {
            const d = Math.sqrt(dSq);
            const overlap = minDist - d;
            if (overlap > deepestOverlap) {
              deepestOverlap = overlap;
              bestOffsetA = offA;
              bestOffsetB = offB;
              if (d > 1e-5) {
                bestNx = dx / d;
                bestNz = dz / d;
              } else {
                const cd = Math.sqrt(centerDistSq);
                bestNx = dxCenter / cd;
                bestNz = dzCenter / cd;
              }
            }
          }
        }
      }

      if (deepestOverlap > 0) {
        const sep = deepestOverlap * 0.5;
        a.x -= bestNx * sep;
        a.z -= bestNz * sep;
        b.x += bestNx * sep;
        b.z += bestNz * sep;

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const velAlongNormal = rvx * bestNx + rvz * bestNz;
        if (velAlongNormal < 0) {
          const restitution = 0.14;
          const jMag = -(1 + restitution) * velAlongNormal * 0.5;
          a.vx -= jMag * bestNx;
          a.vz -= jMag * bestNz;
          b.vx += jMag * bestNx;
          b.vz += jMag * bestNz;

          // Subtle tangential friction scraping between bodywork/tires
          const tx = -bestNz;
          const tz = bestNx;
          const velAlongTan = rvx * tx + rvz * tz;
          const friction = velAlongTan * 0.08;
          a.vx += friction * tx;
          a.vz += friction * tz;
          b.vx -= friction * tx;
          b.vz -= friction * tz;

          // Off-center axial impact creates physical yaw nudge
          const torqueA = (afz * -bestNx - afx * -bestNz) * bestOffsetA;
          const torqueB = (bfz * bestNx - bfx * bestNz) * bestOffsetB;
          a.yawRate = Math.max(-2.6, Math.min(2.6, a.yawRate + torqueA * jMag * 0.025));
          b.yawRate = Math.max(-2.6, Math.min(2.6, b.yawRate + torqueB * jMag * 0.025));

          a.slipRatio = Math.min(1, a.slipRatio + 0.25);
          b.slipRatio = Math.min(1, b.slipRatio + 0.25);
          const impact = Math.min(1, Math.abs(velAlongNormal) / 22);
          a.impactIntensity = Math.max(a.impactIntensity, impact);
          b.impactIntensity = Math.max(b.impactIntensity, impact);
        }
      }
    }
  }
}
