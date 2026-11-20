import type { CarState, WeatherCondition } from './types';

export interface AxleLoads {
  frontLoadN: number;
  rearLoadN: number;
}

export interface PacejkaGripResult {
  frontGripMult: number;
  rearGripMult: number;
  combinedGripMult: number;
  pacejkaLatFactor: number;
}

/**
 * Pure Pacejka Magic Formula curve:
 * F(x) = D * sin(C * atan(B * x - E * (B * x - atan(B * x))))
 * Models progressive tire build-up up to peak slip followed by realistic saturation falloff.
 */
export function pacejkaMagic(
  slip: number,
  B = 13.5,
  C = 1.65,
  D = 1.0,
  E = 0.65,
): number {
  const bx = B * slip;
  return D * Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

/**
 * Computes dynamic vertical normal load on front & rear axles accounting for
 * F1 ~45/55 aero balance plus longitudinal pitch transfer under braking/acceleration.
 */
export function computeAxleLoads(
  massKg: number,
  downforceN: number,
  longAccelMs2: number,
  wheelbaseM = 3.6,
  cgHeightM = 0.28,
): AxleLoads {
  const staticGravity = massKg * 9.81;
  const totalVertical = staticGravity + Math.max(0, downforceN);
  // Base F1 aerodynamic/weight split ~45% front / 55% rear
  const baseFront = totalVertical * 0.45;
  // Negative longAccel (braking) transfers load forward; positive transfers rearward
  const transfer = (massKg * longAccelMs2 * cgHeightM) / wheelbaseM;
  const frontLoadN = Math.max(totalVertical * 0.22, Math.min(totalVertical * 0.78, baseFront - transfer));
  const rearLoadN = Math.max(totalVertical * 0.22, totalVertical - frontLoadN);
  return { frontLoadN, rearLoadN };
}

/**
 * Pure tire temperature grip curve (°C):
 * - Optimal F1 window (82°C–108°C): peak baseline grip (1.00x)
 * - Cold tires (<82°C): reduced mechanical bite (~0.90x)
 * - Overheated tires (>108°C): thermal degradation (~0.92x)
 */
export function computeThermalGripMultiplier(tempC: number, weather: WeatherCondition): number {
  const optLow = weather === 'wet' ? 66 : 82;
  const optHigh = weather === 'wet' ? 94 : 108;
  if (tempC >= optLow && tempC <= optHigh) {
    return 1.0;
  }
  if (tempC < optLow) {
    const deficit = Math.min(1, (optLow - tempC) / 38);
    return 1.0 - deficit * 0.10; // floors at 0.90x cold
  }
  const overheat = Math.min(1, (tempC - optHigh) / 34);
  return 1.0 - overheat * 0.08; // floors at 0.92x blistered
}

/**
 * Progressive rubber wear grip multiplier (1.0 fresh -> 0.83 worn-out).
 */
export function computeTireWearGripMultiplier(wear: number): number {
  const clamped = Math.max(0.15, Math.min(1.0, wear));
  if (clamped >= 0.72) return 1.0;
  const t = (0.72 - clamped) / (0.72 - 0.15);
  return 1.0 - t * 0.17;
}

/**
 * Updates front/rear tire core temperature (°C) and progressive rubber wear,
 * returning axle-split Pacejka grip multipliers for realistic understeer/oversteer balance.
 */
export function stepPacejkaTireState(
  car: CarState,
  slipAngleRad: number,
  longAccelMs2: number,
  downforceN: number,
  weather: WeatherCondition,
  wearEnabled: boolean,
  dt: number,
): PacejkaGripResult {
  const ambientTemp = weather === 'wet' ? 56 : 66;
  const loads = computeAxleLoads(798, downforceN, longAccelMs2);
  const absSpeed = Math.abs(car.forwardSpeed);
  const latEnergy = Math.min(2.2, Math.abs(slipAngleRad) * 6.5) * (absSpeed / 55);
  const brakeEnergy = car.absTriggered || car.slipRatio > 0.45 ? 1.35 : 0;
  const driveEnergy = car.tcTriggered || (car.slipRatio > 0.25 && longAccelMs2 > 4) ? 1.25 : 0;

  // Front axle warms from cornering + braking weight transfer; rear from cornering + traction
  const frontHeat = (latEnergy * 11.5 + brakeEnergy * 15.0) * (loads.frontLoadN / 8500);
  const rearHeat = (latEnergy * 11.0 + driveEnergy * 16.0) * (loads.rearLoadN / 9500);
  const airflowCool = 0.08 + absSpeed * 0.0045;

  car.tireTempFront = Math.max(
    ambientTemp - 8,
    Math.min(138, car.tireTempFront + (frontHeat - (car.tireTempFront - ambientTemp) * airflowCool) * dt),
  );
  car.tireTempRear = Math.max(
    ambientTemp - 8,
    Math.min(142, car.tireTempRear + (rearHeat - (car.tireTempRear - ambientTemp) * airflowCool) * dt),
  );

  if (wearEnabled && absSpeed > 8) {
    const scrubEnergy = Math.min(1.8, Math.abs(slipAngleRad) * 3.8 + car.slipRatio * 0.65);
    const wearRate = (0.00055 + scrubEnergy * 0.0022) * (weather === 'wet' ? 0.72 : 1.0);
    car.tireWear = Math.max(0.15, car.tireWear - wearRate * dt);
  }

  const frontTherm = computeThermalGripMultiplier(car.tireTempFront, weather);
  const rearTherm = computeThermalGripMultiplier(car.tireTempRear, weather);
  const wearMult = wearEnabled ? computeTireWearGripMultiplier(car.tireWear) : 1.0;

  // Pacejka Magic Formula post-peak lateral saturation beyond ~0.14 rad slip angle
  const absSlip = Math.min(0.45, Math.abs(slipAngleRad));
  const pacejkaLatFactor =
    absSlip <= 0.14 ? 1.0 : Math.max(0.82, Math.min(1.0, pacejkaMagic(absSlip)));

  const frontGripMult = frontTherm * wearMult;
  const rearGripMult = rearTherm * wearMult;
  const combinedGripMult = (frontGripMult * 0.46 + rearGripMult * 0.54) * pacejkaLatFactor;

  return {
    frontGripMult,
    rearGripMult,
    combinedGripMult,
    pacejkaLatFactor,
  };
}
