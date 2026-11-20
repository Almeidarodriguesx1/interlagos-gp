import type { CarState } from './types';
import { projectPointToTrack, type TrackData } from './track';
import { BARRIER_OFFSET, runoffExtension } from './surfaceModel';
import type { SceneryWorld } from './scenery';

// Horizontal 3-disk body. Approximate hull, not a soft-body crash simulator.
export const CONTACT_OFFSETS = [-1.65, 0, 1.65] as const;
export const CONTACT_RADIUS = 0.98;
const MASS = 798;
const INERTIA = MASS * (5.3 * 5.3 + 1.96 * 1.96) / 12;

/** Impulse at a contact, including angular inertia and Coulomb tangential friction. */
export function applyContactImpulse(car: CarState, nx: number, nz: number, rx: number, rz: number, restitution = 0.035, friction = 0.28): number {
  const vn = (car.vx + car.yawRate * rz) * nx + (car.vz - car.yawRate * rx) * nz;
  if (vn >= 0) return 0;
  const arm = rz * nx - rx * nz;
  const impulse = -(1 + (vn < -2 ? restitution : 0)) * vn / (1 / MASS + arm * arm / INERTIA);
  car.vx += impulse * nx / MASS;
  car.vz += impulse * nz / MASS;
  car.yawRate += impulse * arm / INERTIA;
  const tx = -nz, tz = nx, tangentArm = rz * tx - rx * tz;
  const vt = (car.vx + car.yawRate * rz) * tx + (car.vz - car.yawRate * rx) * tz;
  const jt = Math.max(-friction * impulse, Math.min(friction * impulse, -vt / (1 / MASS + tangentArm * tangentArm / INERTIA)));
  car.vx += jt * tx / MASS; car.vz += jt * tz / MASS; car.yawRate += jt * tangentArm / INERTIA;
  car.impactIntensity = Math.max(car.impactIntensity, Math.min(1, impulse / MASS / 28));
  if (vn < -4) {
    const localForward = rx * Math.sin(car.yaw) + rz * Math.cos(car.yaw);
    const damage = Math.min(0.6, (vn * vn - 16) / 2200);
    if (localForward > 0.3) car.frontAeroDamage = Math.min(1, (car.frontAeroDamage ?? 0) + damage);
    else if (localForward < -0.3) car.rearAeroDamage = Math.min(1, (car.rearAeroDamage ?? 0) + damage);
  }
  return impulse;
}

export function resolveBarrierContacts(car: CarState, track: TrackData): void {
  const center = projectPointToTrack(car.x, car.z, car.trackIndex, track);
  if (Math.abs(center.lateralOffset) < Math.min(center.widthLeft, center.widthRight) + BARRIER_OFFSET - 3.7) return;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  // A bounded sequential contact solver handles both ends without forcing heading parallel.
  for (let pass = 0; pass < 3; pass++) for (const offset of CONTACT_OFFSETS) {
    const cx = car.x + fx * offset, cz = car.z + fz * offset;
    const p = projectPointToTrack(cx, cz, car.trackIndex, track);
    const side = p.lateralOffset >= 0 ? 1 : -1;
    const horizontal = Math.hypot(p.right.x, p.right.z) || 1;
    const limit = ((side > 0 ? p.widthRight : p.widthLeft) + BARRIER_OFFSET + runoffExtension(track,p.s,side)) * horizontal;
    const penetration = Math.abs(p.lateralOffset) + CONTACT_RADIUS - limit;
    if (penetration <= 0) continue;
    const nx = -side * p.right.x / horizontal, nz = -side * p.right.z / horizontal;
    car.x += nx * (penetration + 0.0001); car.z += nz * (penetration + 0.0001);
    applyContactImpulse(car, nx, nz, fx * offset - nx * CONTACT_RADIUS, fz * offset - nz * CONTACT_RADIUS);
  }
}

/** Earliest time of impact for a moving disk and stationary circle; -1 means no hit. */
export function sweepDiskCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, radius: number): number {
  const x = ax - cx, z = az - cz, dx = bx - ax, dz = bz - az;
  const c = x * x + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return -1;
  const b = x * dx + z * dz, discriminant = b * b - a * c;
  if (b >= 0 || discriminant < 0) return -1;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

export function resolveSceneryContacts(car: CarState, world: SceneryWorld, oldX: number, oldZ: number, oldYaw: number): void {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), oldFx = Math.sin(oldYaw), oldFz = Math.cos(oldYaw);
  for (const state of world.objects) {
    const prop = state.prop;
    if (state.broken || car.y + 1.2 < prop.y || car.y > prop.y + prop.height) continue;
    const reach = Math.hypot(car.x - oldX, car.z - oldZ) + 4;
    if (Math.abs(prop.x - car.x) > reach || Math.abs(prop.z - car.z) > reach) continue;
    let earliest = 2, hitOffset = 0;
    for (const offset of CONTACT_OFFSETS) {
      const t = sweepDiskCircle(oldX + oldFx * offset, oldZ + oldFz * offset,
        car.x + fx * offset, car.z + fz * offset, prop.x, prop.z, CONTACT_RADIUS + prop.radius);
      if (t >= 0 && t < earliest) { earliest = t; hitOffset = offset; }
    }
    if (earliest > 1) continue;
    const hitX = oldX + (car.x - oldX) * earliest + fx * hitOffset;
    const hitZ = oldZ + (car.z - oldZ) * earliest + fz * hitOffset;
    let nx = hitX - prop.x, nz = hitZ - prop.z;
    const length = Math.hypot(nx, nz);
    if (length > 1e-8) { nx /= length; nz /= length; }
    else { nx = -fx; nz = -fz; }
    const vn = (car.vx + car.yawRate * fz * hitOffset) * nx + (car.vz - car.yawRate * fx * hitOffset) * nz;
    if (prop.breakawayMass > 0 && vn < -0.3) {
      // Lightweight breakaway prop: momentum transfer, not an infinite-mass wall.
      const impulse = -vn / (1 / MASS + 1 / prop.breakawayMass);
      car.vx += impulse * nx / MASS; car.vz += impulse * nz / MASS;
      state.broken = true; state.age = 0; state.fallYaw = Math.atan2(-nx, -nz);
      car.impactIntensity = Math.max(car.impactIntensity, Math.min(0.3, -vn / 80));
      continue;
    }
    car.x = oldX + (car.x - oldX) * earliest;
    car.z = oldZ + (car.z - oldZ) * earliest;
    const px = car.x + fx * hitOffset - prop.x, pz = car.z + fz * hitOffset - prop.z;
    const separation = CONTACT_RADIUS + prop.radius - Math.hypot(px, pz);
    if (separation > 0) { car.x += nx * (separation + 0.001); car.z += nz * (separation + 0.001); }
    applyContactImpulse(car, nx, nz, fx * hitOffset - nx * CONTACT_RADIUS, fz * hitOffset - nz * CONTACT_RADIUS, 0.025, 0.35);
  }
}
