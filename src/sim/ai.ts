import { getSampleAtDistance, INTERLAGOS_TRACK, type InterlagosTrack } from './track';
import {steeringLock, BASE_TIRE_MU, tireForceCapacity} from './dynamics';
import type { CarState, ControlInputs, DifficultyLevel, RaceConfig } from './types';

const LOOK_DISTANCES = [16, 32, 52, 78, 110, 148, 188, 230] as const;

const SURVEY_LOOK_DISTANCES = [2, 8, 16, 24, 32, 44, 58, 72, 90, 110, 134, 160, 190, 224] as const;

function getDifficultyProfile(difficulty: DifficultyLevel = 'competitivo'): {
  cornerPaceMult: number;
  brakeDecelMult: number;
  throttleCap: number;
  useErs: boolean;
} {
  switch (difficulty) {
    case 'iniciante':
      return { cornerPaceMult: 0.81, brakeDecelMult: 0.86, throttleCap: 0.84, useErs: false };
    case 'competitivo':
      return { cornerPaceMult: 0.92, brakeDecelMult: 0.94, throttleCap: 0.94, useErs: true };
    case 'pro':
      return { cornerPaceMult: 1.0, brakeDecelMult: 1.0, throttleCap: 1.0, useErs: true };
    case 'lendario':
      return { cornerPaceMult: 1.025, brakeDecelMult: 1.025, throttleCap: 1.0, useErs: true };
  }
}

/**
 * Computes steering, throttle, brake, ERS and DRS inputs for an AI F1 driver
 * using difficulty-scaled curvature lookahead braking, dynamic racing line, and traffic overtaking.
 */
export function computeAiInputs(
  car: CarState,
  allCars: CarState[],
  config: RaceConfig,
  dt: number,
  track: InterlagosTrack = INTERLAGOS_TRACK,
): ControlInputs {
  const weatherFactor = config.weather === 'wet' ? 0.78 : 1.0;
  const diff = getDifficultyProfile(config.difficulty);

  // 1. Scan ahead for upcoming corner curvature to calculate target entry speed
  let minSafeSpeed = 96.0 * diff.throttleCap;
  const lookDistances = track.surveyed ? SURVEY_LOOK_DISTANCES : LOOK_DISTANCES;

  for (const dist of lookDistances) {
    const sample = getSampleAtDistance(car.s + dist, track);
    const k = Math.max(0.0005, Math.abs(sample.drivingCurvature));
    let approxCornerSpeed = 50;
    // Fixed-point estimate: lateral capacity grows sublinearly with aero load.
    for (let pass = 0; pass < 4; pass++) {
      const load = 798 * 9.81 + 0.5 * 1.225 * 4.25 * approxCornerSpeed * approxCornerSpeed;
      const lateral = tireForceCapacity(load, 798 * 9.81, BASE_TIRE_MU) * 0.86 / 798;
      approxCornerSpeed = Math.sqrt(Math.min(40, lateral) * weatherFactor * car.aiSkill * diff.cornerPaceMult / k);
    }
    const brakeDecel = 18.0 * weatherFactor * diff.brakeDecelMult;
    const brakingAllowSpeed = Math.sqrt(approxCornerSpeed * approxCornerSpeed + 2 * brakeDecel * Math.max(0, dist - 22));
    if (brakingAllowSpeed < minSafeSpeed) {
      minSafeSpeed = brakingAllowSpeed;
    }
  }

  // 2. Curvature-based racing line (outside-apex-outside) + safe wide-track overtaking
  const apexSample = getSampleAtDistance(car.s + Math.max(18, car.speed * 0.55), track);
  const apexStrength = Math.min(1, apexSample.absCurvature * 140);
  const leftLimit = -Math.max(0, apexSample.widthLeft - 2.3);
  const rightLimit = Math.max(0, apexSample.widthRight - 2.3);
  const racingLineOffset =
    apexStrength > 0.08
      ? -Math.sign(apexSample.curvature) * Math.min(2.0, apexStrength * 2.0)
      : car.aiPreferredOffset;

  let desiredOffset = track.surveyed ? racingLineOffset * .45 : racingLineOffset;
  let closestCarAhead: CarState | null = null;
  let gapAhead = Infinity;
  let blockingLaneDist = Infinity;

  const checkLaneClear = (candOffset: number): boolean => {
    for (const c of allCars) {
      if (c.id === car.id) continue;
      let dsSigned = c.s - car.s;
      if (dsSigned > track.totalLength * 0.5) dsSigned -= track.totalLength;
      if (dsSigned < -track.totalLength * 0.5) dsSigned += track.totalLength;
      if (dsSigned > -7.0 && dsSigned < 26.0 && Math.abs(c.lateralOffset - candOffset) < 2.9) {
        return false;
      }
    }
    return true;
  };

  for (const other of allCars) {
    if (other.id === car.id) continue;
    let dsSigned = other.s - car.s;
    if (dsSigned > track.totalLength * 0.5) dsSigned -= track.totalLength;
    if (dsSigned < -track.totalLength * 0.5) dsSigned += track.totalLength;

    const latDiffFromSelf = Math.abs(other.lateralOffset - car.lateralOffset);

    if (dsSigned > -6.0 && dsSigned < 7.5 && latDiffFromSelf < 3.6) {
      const pushAway = other.lateralOffset >= car.lateralOffset ? -1.4 : 1.4;
      desiredOffset = Math.max(leftLimit, Math.min(rightLimit, desiredOffset + pushAway));
    }

    if (dsSigned > 1.2 && dsSigned < 48) {
      const laneOverlap =
        Math.abs(other.lateralOffset - desiredOffset) < 3.1 ||
        Math.abs(other.lateralOffset - car.lateralOffset) < 2.8;

      if (laneOverlap && dsSigned < gapAhead) {
        gapAhead = dsSigned;
        closestCarAhead = other;
      }

      if (Math.abs(other.lateralOffset - desiredOffset) < 3.1 && dsSigned < blockingLaneDist) {
        blockingLaneDist = dsSigned;
        if (dsSigned < 40 && (car.speed > other.speed + 1.0 || dsSigned < 20)) {
          const leftCand = Math.max(leftLimit, other.lateralOffset - 4.6);
          const rightCand = Math.min(rightLimit, other.lateralOffset + 4.6);
          const preferLeft = other.lateralOffset > -0.6;
          if (preferLeft && Math.abs(leftCand - other.lateralOffset) >= 3.0 && checkLaneClear(leftCand)) {
            desiredOffset = leftCand;
          } else if (Math.abs(rightCand - other.lateralOffset) >= 3.0 && checkLaneClear(rightCand)) {
            desiredOffset = rightCand;
          } else if (Math.abs(leftCand - other.lateralOffset) >= 3.0 && checkLaneClear(leftCand)) {
            desiredOffset = leftCand;
          }
        }
      }
    }
  }

  desiredOffset = Math.max(leftLimit, Math.min(rightLimit, desiredOffset));
  car.aiTargetOffset += (desiredOffset - car.aiTargetOffset) * (1 - Math.exp(-4.5 * dt));

  // 3. Pure-pursuit steering toward lookahead point on target racing line
  const speedLookahead = track.surveyed ? Math.max(8, Math.min(33, car.speed * .42)) : Math.max(13, Math.min(50, car.speed * 0.60));
  // Limit the preview arc in tight bends so the target stays near the apex.
  const lookDist = Math.min(speedLookahead, Math.max(6, .55 / Math.max(.001, Math.abs(apexSample.drivingCurvature))));
  const aimSample = getSampleAtDistance(car.s + lookDist, track);
  const aimX = aimSample.pos.x + aimSample.right.x * car.aiTargetOffset;
  const aimZ = aimSample.pos.z + aimSample.right.z * car.aiTargetOffset;

  const dx = aimX - car.x;
  const dz = aimZ - car.z;
  const targetYaw = Math.atan2(dx, dz);
  let yawError = targetYaw - car.yaw;
  while (yawError > Math.PI) yawError -= Math.PI * 2;
  while (yawError < -Math.PI) yawError += Math.PI * 2;

  const wheelbase = car.geometry?.wheelbaseM ?? 3.6;
  const chord = Math.max(1, Math.hypot(dx, dz));
  const pursuitAngle = Math.atan2(2 * wheelbase * Math.sin(yawError), chord);
  const steer = Math.max(-1, Math.min(1, pursuitAngle / steeringLock(car.speed)));

  // 4. Longitudinal throttle / brake control with smooth time-headway gap spacing
  let targetSpeed = minSafeSpeed;
  if (closestCarAhead) {
    const safeGap = 9 + car.speed * 0.45;
    if (gapAhead < safeGap) {
      const clearanceRatio = Math.max(0, (gapAhead - 5.2) / Math.max(1, safeGap - 5.2));
      const sameLaneBlocked = Math.abs(closestCarAhead.lateralOffset - car.aiTargetOffset) < 2.8;
      if (sameLaneBlocked || gapAhead < 9.5) {
        const followScale = gapAhead < 6.8 ? 0.58 : 0.76 + 0.24 * clearanceRatio;
        targetSpeed = Math.min(targetSpeed, Math.max(8, closestCarAhead.speed * followScale));
      }
    }
  }

  const speedDiff = targetSpeed - car.speed;
  let throttle = 0;
  let brake = 0;

  if (speedDiff > 1.2) {
    throttle = Math.min(diff.throttleCap, 0.58 + speedDiff * 0.085);
  } else if (speedDiff > -1.2) {
    throttle = Math.min(diff.throttleCap, 0.42);
  } else {
    brake = Math.min(1, (-speedDiff - 0.8) / 11.5);
  }

  if (!car.onTrack) {
    throttle = Math.min(throttle, 0.55);
  }

  // 5. ERS & DRS strategic usage on straights
  const drsToggleJustPressed = car.drsEligible && !car.drsActive && brake < 0.05 && Math.abs(yawError) < 0.14;
  const ersBoost =
    diff.useErs &&
    car.ersCharge > 25 &&
    throttle > 0.82 &&
    (aimSample.drsZone !== 0 || (gapAhead > 12 && gapAhead < 34));

  return {
    throttle,
    brake,
    steer,
    ersBoost,
    drsToggleJustPressed,
  };
}
