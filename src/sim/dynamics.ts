/** Versioned gameplay calibration. Not a homologated F1 2026 vehicle model. */
export const DYNAMICS_VERSION = 'physics-v6';

/** Extra steering lock fades out by 72 km/h, retaining high-speed response. */
export function steeringLock(speed: number): number {
  const normalized = Math.min(1, Math.abs(speed) / 88);
  const slow = Math.max(0, 1 - Math.abs(speed) / 20);
  return .44 * (1 - normalized) ** 1.28 + .068 + .15 * slow * slow;
}

// Empirical gameplay coefficients; not measured Pirelli tire data.
export const BASE_TIRE_MU = 1.30;
export const LOAD_EXPONENT = 0.80;

/** Signed Menger curvature in the horizontal plane; + means increasing yaw. */
export function drivingCurvature(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ux = bx - ax, uz = bz - az, vx = cx - bx, vz = cz - bz;
  const denominator = Math.hypot(ux, uz) * Math.hypot(vx, vz) * Math.hypot(cx - ax, cz - az);
  return denominator > 1e-9 ? 2 * (uz * vx - ux * vz) / denominator : 0;
}

export function tireForceCapacity(normalForce: number, staticLoad: number, mu: number): number {
  return Math.max(0, mu) * staticLoad * Math.pow(Math.max(0, normalForce) / Math.max(1, staticLoad), LOAD_EXPONENT);
}

/** Shared circular budget: tires cannot spend full grip on both axes simultaneously. */
export function combinedGripScale(longitudinal: number, lateral: number, capacity: number): number {
  const demand = Math.hypot(longitudinal, lateral);
  return demand > 0 ? Math.min(1, Math.max(0, capacity) / demand) : 1;
}
