import configuredZones from './surface-zones.json';
import type { TrackId } from './types';

export type Surface = 'asphalt' | 'kerb' | 'grass' | 'dirt' | 'gravel';
export interface SurfaceZone {
  start: number; end: number; side: 'left' | 'right';
  minOffset: number; maxOffset: number; material: Surface;
  trackId?: TrackId; validation?: 'confirmed' | 'pending'; reference?: string;
}
export interface SurfaceProjection {
  apronWidth?: number;
  onKerb: boolean; lateralOffset: number; widthLeft: number; widthRight: number; tNorm: number;
}
// Existing model dimensions in metres. These are not surveyed real-world widths.
export const APRON_WIDTH = 6.95;
export const BARRIER_OFFSET = 6.75;
export const CAR_BARRIER_CLEARANCE = 0.9;
export const CORRIDOR_CENTER_LIMIT = BARRIER_OFFSET - CAR_BARRIER_CLEARANCE;
export const SURFACE_ORDER: readonly Surface[] = ['asphalt', 'kerb', 'grass', 'dirt', 'gravel'];
// Gameplay tuning, not measured tire coefficients. Global rain/tire multipliers apply separately.
export const SURFACE_PROFILES = {
  asphalt: { dryGrip: 1, wetGrip: 1, rollingResistance: 180, lateralStiffness: 21.5, color: 0x62696b, roughness: 0.9 },
  kerb: { dryGrip: 0.94, wetGrip: 0.74, rollingResistance: 210, lateralStiffness: 20, color: 0xdddddd, roughness: 0.72 },
  grass: { dryGrip: 0.58, wetGrip: 0.39, rollingResistance: 1250, lateralStiffness: 9, color: 0x738449, roughness: 0.96 },
  dirt: { dryGrip: 0.65, wetGrip: 0.46, rollingResistance: 1000, lateralStiffness: 10, color: 0x927451, roughness: 0.98 },
  gravel: { dryGrip: 0.52, wetGrip: 0.48, rollingResistance: 1900, lateralStiffness: 8, color: 0x9f9782, roughness: 1 },
} as const;
const NO_ZONES: readonly SurfaceZone[] = Object.freeze([]);

/** Only the generated apron corridor is supported by authored zones in this phase. */
export function validateSurfaceZones(zones: readonly SurfaceZone[]): string[] {
  const errors: string[] = [];
  zones.forEach((z, i) => {
    if (!['interlagos', 'monza', 'spa'].includes(z.trackId ?? '')) errors.push(`zone ${i}: trackId required`);
    if (z.validation !== 'confirmed' && z.validation !== 'pending') errors.push(`zone ${i}: validation required`);
    if (!z.reference?.trim()) errors.push(`zone ${i}: reference required`);
    if (!SURFACE_ORDER.includes(z.material) || z.material === 'kerb') errors.push(`zone ${i}: invalid material (kerbs come from track geometry)`);
    if (z.side !== 'left' && z.side !== 'right') errors.push(`zone ${i}: invalid side`);
    if (![z.start, z.end, z.minOffset, z.maxOffset].every(Number.isFinite) ||
        z.start < 0 || z.start >= 1 || z.end < 0 || z.end > 1 || z.start === z.end ||
        z.minOffset < 0 || z.maxOffset > APRON_WIDTH || z.minOffset >= z.maxOffset) errors.push(`zone ${i}: invalid bounds`);
  });
  // Conflicting confirmed zones are rejected, rather than relying on JSON order.
  const intervals = (z: SurfaceZone) => z.start < z.end ? [[z.start, z.end]] : [[z.start, 1], [0, z.end]];
  zones.forEach((a, i) => zones.slice(i + 1).forEach((b, j) => {
    if (a.validation !== 'confirmed' || b.validation !== 'confirmed' || a.trackId !== b.trackId || a.side !== b.side) return;
    if (Math.max(a.minOffset, b.minOffset) < Math.min(a.maxOffset, b.maxOffset) &&
        intervals(a).some(x => intervals(b).some(y => Math.max(x[0], y[0]) < Math.min(x[1], y[1])))) errors.push(`zones ${i}/${i + j + 1}: overlap`);
  }));
  return errors;
}
const config = configuredZones as SurfaceZone[];
const errors = validateSurfaceZones(config);
if (errors.length) throw new Error(`Invalid surface-zones.json: ${errors.join('; ')}`);
const byTrack = new Map<TrackId, readonly SurfaceZone[]>();
for (const id of ['interlagos', 'monza', 'spa'] as const) {
  byTrack.set(id, Object.freeze(config.filter(z => z.trackId === id && z.validation === 'confirmed')));
}
const overrideCache = new WeakMap<object, { source: readonly SurfaceZone[]; zones: readonly SurfaceZone[] }>();
export function getSurfaceZones(track: { id: TrackId; surfaceZones?: readonly SurfaceZone[] }): readonly SurfaceZone[] {
  if (!track.surfaceZones) return byTrack.get(track.id) ?? NO_ZONES;
  let cached = overrideCache.get(track);
  if (cached?.source !== track.surfaceZones) {
    const problems = validateSurfaceZones(track.surfaceZones);
    if (problems.length) throw new Error(`Invalid surface map override: ${problems.join('; ')}`);
    cached = { source: track.surfaceZones, zones: Object.freeze(track.surfaceZones.filter(z => z.trackId === track.id && z.validation === 'confirmed')) };
    overrideCache.set(track, cached);
  }
  return cached!.zones;
}
export function classifySurface(p: SurfaceProjection, zones: readonly SurfaceZone[] = NO_ZONES): Surface {
  if (p.onKerb) return 'kerb';
  const side = p.lateralOffset < 0 ? 'left' : 'right';
  const offset = Math.abs(p.lateralOffset) - (side === 'left' ? p.widthLeft : p.widthRight);
  if (offset <= 0) return 'asphalt';
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.side === side && (z.start < z.end ? p.tNorm >= z.start && p.tNorm < z.end : p.tNorm >= z.start || p.tNorm < z.end) &&
        offset >= z.minOffset && offset < z.maxOffset) return z.material;
  }
  return offset <= (p.apronWidth ?? APRON_WIDTH) ? 'asphalt' : 'grass';
}

// Conservative inner part of the paved T1 escape visible in the colourised survey.
// Model chainage is measured from the grid stripe and increases in the driving direction.
export function runoffExtension(track: {surveyed?: boolean}, s: number, side: number): number {
  if (!track.surveyed || side <= 0 || s <= 320 || s >= 473) return 0;
  const ramp = Math.min(1, (s-320)/58, (473-s)/55);
  return 11 * ramp * ramp * (3 - 2*ramp);
}
