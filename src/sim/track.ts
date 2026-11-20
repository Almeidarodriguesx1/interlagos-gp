import { APRON_WIDTH, runoffExtension } from './surfaceModel';
import geoZones from './interlagos-geo-zones.json';
import profile from './interlagos-geo.json';
import { drivingCurvature } from './dynamics';
import type { SurfaceZone } from './surfaceModel';
import type { TrackId, TrackProjection, TrackSample, TracksideCameraTower, Vec3 } from './types';

export const INTERLAGOS_LENGTH_M = 4309;
const MAX_ADAPTIVE_STEP_M = 2.75;
const MIN_ADAPTIVE_STEP_M = 1.35;
const SPATIAL_CELL_SIZE = 32;

export type KerbPaletteStyle = 'brazil' | 'italy' | 'belgium';

export interface TrackMetadata {
  id: TrackId;
  name: string;
  shortName: string;
  country: string;
  lengthMeters: number;
  elevationSpan: number;
  subtitle: string;
  bannerText: string;
  kerbStyle: KerbPaletteStyle;
  barrierCapColor: number;
  apronColor: number;
  hasLake: boolean;
  hasSkyline: boolean;
  hillAmplitude: number;
  estLapSeconds: number;
}

export interface TrackSpatialGrid {
  cellSize: number;
  cells: Map<number, number[]>;
  coarseIndices: number[];
}

export interface TrackData {
  id: TrackId;
  /** Optional validated map override for tooling/tests. Production uses surface-zones.json. */
  surfaceZones?: readonly SurfaceZone[];
  surveyed?: boolean;
  meta: TrackMetadata;
  totalLength: number;
  samples: TrackSample[];
  towers: TracksideCameraTower[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
  spatialGrid: TrackSpatialGrid;
}

export type InterlagosTrack = TrackData;

interface RawControlPoint {
  x: number;
  y: number;
  z: number;
  width?: number;
  cornerName?: string;
}

interface TrackBlueprint {
  meta: TrackMetadata;
  controlPoints: RawControlPoint[];
  sectorBounds: [number, number]; // [s1EndTNorm, s2EndTNorm]
  drsZone1: [number, number];
  drsZone2: [number, number]; // wraps across 1.0 -> 0.0 when start > end
  drsDet1: [number, number];
  drsDet2: [number, number];
  towers: Array<{ name: string; tNorm: number; sideOffset: number; height: number; minFov: number; maxFov: number }>;
}

const INTERLAGOS_POINTS: RawControlPoint[] = [
  { x: 0, y: 38.0, z: 180, width: 19.5, cornerName: 'Reta dos Boxes' },
  { x: -18, y: 41.0, z: 30, width: 19.5, cornerName: 'Linha de Chegada' },
  { x: -42, y: 42.5, z: -150, width: 19.5, cornerName: 'Freada do S' },
  { x: -72, y: 35.0, z: -295, width: 18.5, cornerName: 'S do Senna (T1)' },
  { x: -138, y: 26.5, z: -318, width: 18.0, cornerName: 'S do Senna (T2)' },
  { x: -195, y: 20.5, z: -385, width: 18.0, cornerName: 'Curva do Sol' },
  { x: -298, y: 17.0, z: -370, width: 18.0, cornerName: 'Curva do Sol' },
  { x: -395, y: 14.5, z: -262, width: 18.5, cornerName: 'Reta Oposta' },
  { x: -468, y: 11.5, z: -85, width: 18.5, cornerName: 'Reta Oposta' },
  { x: -522, y: 7.5, z: 95, width: 18.5, cornerName: 'Reta Oposta' },
  { x: -540, y: 1.5, z: 238, width: 18.0, cornerName: 'Descida do Lago (T4)' },
  { x: -485, y: 0.0, z: 332, width: 18.0, cornerName: 'Descida do Lago (T5)' },
  { x: -365, y: 4.5, z: 338, width: 17.5, cornerName: 'Saída do Lago' },
  { x: -258, y: 9.0, z: 274, width: 17.2, cornerName: 'Ferradura (T6)' },
  { x: -242, y: 12.0, z: 172, width: 17.2, cornerName: 'Ferradura (T7)' },
  { x: -294, y: 14.5, z: 92, width: 16.8, cornerName: 'Miolo' },
  { x: -286, y: 16.5, z: -16, width: 16.8, cornerName: 'Laranjinha (T8)' },
  { x: -195, y: 17.5, z: -60, width: 16.8, cornerName: 'Laranjinha' },
  { x: -115, y: 16.0, z: -18, width: 16.8, cornerName: 'Pinheirinho (T9)' },
  { x: -116, y: 14.5, z: 72, width: 16.8, cornerName: 'Pinheirinho' },
  { x: -158, y: 12.5, z: 132, width: 17.2, cornerName: 'Bico de Pato (T10)' },
  { x: -146, y: 10.5, z: 222, width: 17.5, cornerName: 'Saída Bico de Pato' },
  { x: -94, y: 6.5, z: 288, width: 17.5, cornerName: 'Mergulho (T11)' },
  { x: -24, y: 8.0, z: 382, width: 17.5, cornerName: 'Entrada da Junção' },
  { x: 56, y: 12.5, z: 432, width: 18.0, cornerName: 'Junção (T12)' },
  { x: 112, y: 19.5, z: 392, width: 18.5, cornerName: 'Subida dos Boxes' },
  { x: 86, y: 26.5, z: 318, width: 19.0, cornerName: 'Subida dos Boxes' },
  { x: 44, y: 33.0, z: 255, width: 19.0, cornerName: 'Curva do Café (T14)' },
];

/**
 * Autodromo Nazionale Monza (5,793 m) — Temple of Speed.
 * Clockwise/flowing high-speed layout with long straights, Rettifilo chicane,
 * Curva Grande, Variante della Roggia, Lesmo 1 & 2, Serraglio, Ascari & Parabolica.
 */
const MONZA_POINTS: RawControlPoint[] = [
  // Main Straight (heading North -Z)
  { x: 0, y: 2.0, z: 240, width: 20.0, cornerName: 'Reta Principal' },
  { x: 0, y: 2.5, z: 20, width: 20.0, cornerName: 'Linha de Chegada' },
  { x: 0, y: 3.0, z: -220, width: 20.0, cornerName: 'Freada Rettifilo' },

  // T1-T2: Prima Variante (Rettifilo right-left chicane)
  { x: 18, y: 3.2, z: -310, width: 17.5, cornerName: 'Variante del Rettifilo (T1)' },
  { x: -14, y: 3.5, z: -365, width: 17.5, cornerName: 'Variante del Rettifilo (T2)' },

  // T3: Curva Grande (Biassono) sweeping fast right
  { x: -10, y: 4.5, z: -500, width: 18.5, cornerName: 'Curva Grande' },
  { x: 95, y: 6.5, z: -610, width: 18.5, cornerName: 'Curva Grande (Biassono)' },
  { x: 255, y: 8.5, z: -595, width: 18.5, cornerName: 'Aproximação Roggia' },

  // T4-T5: Variante della Roggia (left-right chicane)
  { x: 350, y: 9.0, z: -535, width: 17.2, cornerName: 'Variante della Roggia (T4)' },
  { x: 410, y: 9.0, z: -575, width: 17.2, cornerName: 'Variante della Roggia (T5)' },

  // T6: Curva di Lesmo 1 (right)
  { x: 525, y: 7.5, z: -520, width: 17.5, cornerName: 'Lesmo 1 (T6)' },
  { x: 565, y: 6.0, z: -380, width: 17.5, cornerName: 'Saída Lesmo 1' },

  // T7: Curva di Lesmo 2 (sharp right onto Serraglio straight)
  { x: 525, y: 4.5, z: -245, width: 17.5, cornerName: 'Lesmo 2 (T7)' },
  { x: 420, y: 3.5, z: -150, width: 18.5, cornerName: 'Rettilineo del Serraglio' },
  { x: 355, y: 3.0, z: 30, width: 18.5, cornerName: 'Ponte Serraglio' },

  // T8-T10: Variante Ascari (fast left-right-left)
  { x: 320, y: 2.5, z: 185, width: 18.0, cornerName: 'Variante Ascari (T8)' },
  { x: 245, y: 2.0, z: 245, width: 18.0, cornerName: 'Variante Ascari (T9)' },
  { x: 280, y: 2.0, z: 335, width: 18.0, cornerName: 'Saída Ascari (T10)' },

  // Back Straight (DRS 1) toward Parabolica
  { x: 265, y: 1.5, z: 525, width: 19.0, cornerName: 'Reta Oposta Ascari' },
  { x: 235, y: 1.2, z: 710, width: 19.0, cornerName: 'Freada da Parabolica' },

  // T11: Curva Parabolica (Alboreto) long accelerating right-hander onto Main Straight
  { x: 165, y: 1.0, z: 815, width: 19.5, cornerName: 'Curva Parabolica (T11)' },
  { x: 48, y: 1.2, z: 765, width: 19.5, cornerName: 'Saída Parabolica' },
  { x: 4, y: 1.5, z: 540, width: 20.0, cornerName: 'Reta dos Boxes' },
];

/**
 * Circuit de Spa-Francorchamps (7,004 m) — Ardennes Rollercoaster.
 * 102m elevation drop/climb: La Source -> Eau Rouge -> Raidillon -> Kemmel Straight ->
 * Les Combes -> Bruxelles -> Pouhon -> Stavelot -> Blanchimont -> Bus Stop Chicane.
 */
const SPA_POINTS: RawControlPoint[] = [
  // Main Straight & T1 La Source Hairpin
  { x: 0, y: 42.0, z: 180, width: 19.5, cornerName: 'Reta Principal' },
  { x: -8, y: 43.5, z: 0, width: 19.5, cornerName: 'Linha de Chegada' },
  { x: -18, y: 44.0, z: -155, width: 19.0, cornerName: 'Freada La Source' },
  { x: 28, y: 41.0, z: -235, width: 17.8, cornerName: 'La Source (T1)' },
  { x: 112, y: 31.0, z: -175, width: 18.5, cornerName: 'Descida Eau Rouge' },

  // T2-T4: Eau Rouge & Raidillon uphill climb onto Kemmel Straight
  { x: 180, y: 14.0, z: -95, width: 18.5, cornerName: 'Eau Rouge (T2)' },
  { x: 255, y: 38.0, z: -25, width: 18.5, cornerName: 'Raidillon (T3-T4)' },
  { x: 425, y: 74.0, z: 45, width: 19.0, cornerName: 'Kemmel Straight (DRS)' },
  { x: 655, y: 95.0, z: 120, width: 19.0, cornerName: 'Kemmel Straight (DRS)' },

  // T5-T7: Les Combes & Malmedy
  { x: 825, y: 102.0, z: 175, width: 18.0, cornerName: 'Les Combes (T5)' },
  { x: 870, y: 98.0, z: 255, width: 18.0, cornerName: 'Les Combes (T6)' },
  { x: 945, y: 88.0, z: 295, width: 18.0, cornerName: 'Malmedy (T7)' },

  // T8: Bruxelles hairpin
  { x: 965, y: 74.0, z: 410, width: 17.5, cornerName: 'Bruxelles (T8)' },
  { x: 845, y: 62.0, z: 435, width: 17.5, cornerName: 'Saída Bruxelles' },

  // T9-T11: Speaker Corner & Double-Apex Pouhon
  { x: 735, y: 50.0, z: 365, width: 18.0, cornerName: 'Speaker Corner (T9)' },
  { x: 665, y: 38.0, z: 455, width: 18.5, cornerName: 'Pouhon (T10)' },
  { x: 725, y: 28.0, z: 565, width: 18.5, cornerName: 'Pouhon (T11)' },

  // T12-T15: Fagnes -> Campus -> Stavelot
  { x: 850, y: 20.0, z: 615, width: 18.0, cornerName: 'Les Fagnes (T12)' },
  { x: 820, y: 14.0, z: 710, width: 18.0, cornerName: 'Campus (T14)' },
  { x: 680, y: 6.0, z: 725, width: 18.0, cornerName: 'Courbe Paul Frère' },
  { x: 540, y: 0.0, z: 665, width: 18.5, cornerName: 'Stavelot (T15)' },

  // T16-T17: Blanchimont high-speed sweepers back toward Bus Stop
  { x: 380, y: 6.0, z: 565, width: 18.5, cornerName: 'Reta Blanchimont' },
  { x: 245, y: 15.0, z: 455, width: 18.5, cornerName: 'Blanchimont (T16)' },
  { x: 140, y: 24.0, z: 355, width: 18.5, cornerName: 'Blanchimont (T17)' },

  // T18-T19: Bus Stop Chicane onto Main Straight
  { x: 62, y: 32.0, z: 295, width: 17.5, cornerName: 'Bus Stop Chicane (T18)' },
  { x: 15, y: 37.5, z: 245, width: 18.5, cornerName: 'Saída Bus Stop (T19)' },
];

const TRACK_BLUEPRINTS: Record<TrackId, TrackBlueprint> = {
  interlagos: {
    meta: {
      id: 'interlagos',
      name: 'Autódromo José Carlos Pace (Interlagos)',
      shortName: 'Interlagos',
      country: 'Brasil',
      lengthMeters: 4309,
      elevationSpan: 43,
      subtitle: 'S do Senna, Reta Oposta e Subida dos Boxes',
      bannerText: 'GP SÃO PAULO  ·  INTERLAGOS',
      kerbStyle: 'brazil',
      barrierCapColor: 0x90928e,
      apronColor: 0x525455,
      hasLake: true,
      hasSkyline: true,
      hillAmplitude: 14,
      estLapSeconds: 72,
    },
    controlPoints: INTERLAGOS_POINTS,
    sectorBounds: [0.24, 0.72],
    drsZone1: [0.22, 0.36],
    drsZone2: [0.90, 0.065],
    drsDet1: [0.16, 0.19],
    drsDet2: [0.82, 0.86],
    towers: [
      { name: 'Torre Subida dos Boxes', tNorm: 0.02, sideOffset: -24, height: 14, minFov: 26, maxFov: 52 },
      { name: 'Câmera S do Senna', tNorm: 0.11, sideOffset: 24, height: 12, minFov: 24, maxFov: 48 },
      { name: 'Câmera Curva do Sol', tNorm: 0.19, sideOffset: -25, height: 11, minFov: 28, maxFov: 54 },
      { name: 'Câmera Descida do Lago', tNorm: 0.38, sideOffset: 26, height: 13, minFov: 24, maxFov: 50 },
      { name: 'Câmera Ferradura', tNorm: 0.50, sideOffset: -22, height: 11, minFov: 26, maxFov: 50 },
      { name: 'Câmera Laranjinha / Pinheirinho', tNorm: 0.61, sideOffset: 22, height: 11, minFov: 26, maxFov: 50 },
      { name: 'Câmera Bico de Pato', tNorm: 0.71, sideOffset: -22, height: 10, minFov: 24, maxFov: 48 },
      { name: 'Câmera Junção', tNorm: 0.85, sideOffset: 26, height: 13, minFov: 26, maxFov: 52 },
    ],
  },
  monza: {
    meta: {
      id: 'monza',
      name: 'Autodromo Nazionale Monza',
      shortName: 'Monza',
      country: 'Itália',
      lengthMeters: 5793,
      elevationSpan: 8.5,
      subtitle: 'Templo da Velocidade · Rettifilo, Ascari e Parabolica',
      bannerText: 'GP ITÁLIA  ·  MONZA',
      kerbStyle: 'italy',
      barrierCapColor: 0xdc2626,
      apronColor: 0x263238,
      hasLake: false,
      hasSkyline: false,
      hillAmplitude: 4.5,
      estLapSeconds: 82,
    },
    controlPoints: MONZA_POINTS,
    sectorBounds: [0.34, 0.69],
    drsZone1: [0.75, 0.87],
    drsZone2: [0.94, 0.10],
    drsDet1: [0.69, 0.73],
    drsDet2: [0.89, 0.92],
    towers: [
      { name: 'Reta Principal Monza', tNorm: 0.03, sideOffset: -25, height: 14, minFov: 25, maxFov: 52 },
      { name: 'Variante del Rettifilo', tNorm: 0.15, sideOffset: 24, height: 11, minFov: 24, maxFov: 48 },
      { name: 'Curva Grande Biassono', tNorm: 0.27, sideOffset: -26, height: 13, minFov: 26, maxFov: 52 },
      { name: 'Variante della Roggia', tNorm: 0.39, sideOffset: 24, height: 11, minFov: 24, maxFov: 48 },
      { name: 'Curva di Lesmo', tNorm: 0.50, sideOffset: -24, height: 12, minFov: 26, maxFov: 50 },
      { name: 'Variante Ascari', tNorm: 0.68, sideOffset: 26, height: 12, minFov: 24, maxFov: 50 },
      { name: 'Reta Oposta Ascari', tNorm: 0.79, sideOffset: -25, height: 13, minFov: 26, maxFov: 52 },
      { name: 'Curva Parabolica', tNorm: 0.90, sideOffset: 27, height: 14, minFov: 25, maxFov: 52 },
    ],
  },
  spa: {
    meta: {
      id: 'spa',
      name: 'Circuit de Spa-Francorchamps',
      shortName: 'Spa',
      country: 'Bélgica',
      lengthMeters: 7004,
      elevationSpan: 102,
      subtitle: 'Eau Rouge, Raidillon, Kemmel Straight e Pouhon',
      bannerText: 'GP BÉLGICA  ·  SPA-FRANCORCHAMPS',
      kerbStyle: 'belgium',
      barrierCapColor: 0xeab308,
      apronColor: 0x1f2d28,
      hasLake: false,
      hasSkyline: false,
      hillAmplitude: 24,
      estLapSeconds: 104,
    },
    controlPoints: SPA_POINTS,
    sectorBounds: [0.34, 0.71],
    drsZone1: [0.21, 0.32],
    drsZone2: [0.95, 0.06],
    drsDet1: [0.16, 0.19],
    drsDet2: [0.89, 0.93],
    towers: [
      { name: 'La Source Hairpin', tNorm: 0.07, sideOffset: -25, height: 13, minFov: 24, maxFov: 50 },
      { name: 'Eau Rouge / Raidillon', tNorm: 0.16, sideOffset: 27, height: 16, minFov: 24, maxFov: 50 },
      { name: 'Kemmel Straight', tNorm: 0.26, sideOffset: -24, height: 13, minFov: 26, maxFov: 52 },
      { name: 'Les Combes / Malmedy', tNorm: 0.37, sideOffset: 24, height: 12, minFov: 25, maxFov: 50 },
      { name: 'Bruxelles Hairpin', tNorm: 0.49, sideOffset: -24, height: 12, minFov: 24, maxFov: 48 },
      { name: 'Double Pouhon', tNorm: 0.62, sideOffset: 26, height: 14, minFov: 26, maxFov: 52 },
      { name: 'Stavelot / Blanchimont', tNorm: 0.78, sideOffset: -25, height: 13, minFov: 26, maxFov: 52 },
      { name: 'Bus Stop Chicane', tNorm: 0.92, sideOffset: 25, height: 13, minFov: 24, maxFov: 48 },
    ],
  },
};

function centripetalCatmullRomVec3(
  p0: RawControlPoint,
  p1: RawControlPoint,
  p2: RawControlPoint,
  p3: RawControlPoint,
  u: number, // [0, 1] between p1 and p2
): Vec3 {
  const distPow = (a: RawControlPoint, b: RawControlPoint): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.max(0.05, Math.pow(dx * dx + dy * dy + dz * dz, 0.25)); // alpha = 0.5
  };

  const t0 = 0;
  const t1 = t0 + distPow(p0, p1);
  const t2 = t1 + distPow(p1, p2);
  const t3 = t2 + distPow(p2, p3);
  const t = t1 + u * (t2 - t1);

  const lerpPt = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    ta: number,
    tb: number,
  ): Vec3 => {
    const denom = tb - ta || 1;
    const w1 = (tb - t) / denom;
    const w2 = (t - ta) / denom;
    return {
      x: ax * w1 + bx * w2,
      y: ay * w1 + by * w2,
      z: az * w1 + bz * w2,
    };
  };

  const a1 = lerpPt(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, t0, t1);
  const a2 = lerpPt(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, t1, t2);
  const a3 = lerpPt(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, t2, t3);

  const b1 = lerpPt(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, t0, t2);
  const b2 = lerpPt(a2.x, a2.y, a2.z, a3.x, a3.y, a3.z, t1, t3);

  return lerpPt(b1.x, b1.y, b1.z, b2.x, b2.y, b2.z, t1, t2);
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function interpolateControlPoints(
  points: RawControlPoint[],
  defaultName: string,
): Array<{ pos: Vec3; width: number; cornerName: string }> {
  const n = points.length;
  // Allocate steps per segment proportional to chord length so dense spline has smooth parameterization
  const chordLens: number[] = [];
  let totalChord = 0;
  for (let seg = 0; seg < n; seg++) {
    const a = points[seg];
    const b = points[(seg + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    chordLens.push(d);
    totalChord += d;
  }

  const targetDenseCount = 5400;
  const result: Array<{ pos: Vec3; width: number; cornerName: string }> = [];
  for (let seg = 0; seg < n; seg++) {
    const steps = Math.max(40, Math.round((chordLens[seg] / (totalChord || 1)) * targetDenseCount));
    const p0 = points[(seg - 1 + n) % n];
    const p1 = points[seg];
    const p2 = points[(seg + 1) % n];
    const p3 = points[(seg + 2) % n];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      result.push({
        pos: centripetalCatmullRomVec3(p0, p1, p2, p3, t),
        width: catmullRomScalar(
          p0.width ?? 17.5,
          p1.width ?? 17.5,
          p2.width ?? 17.5,
          p3.width ?? 17.5,
          t,
        ),
        cornerName: (t < 0.5 ? p1.cornerName : p2.cornerName) ?? defaultName,
      });
    }
  }
  return result;
}

function computeLoopLength(pts: Array<{ pos: Vec3 }>): number {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i].pos;
    const b = pts[(i + 1) % pts.length].pos;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}

function inZone(tNorm: number, [start, end]: [number, number]): boolean {
  if (start <= end) {
    return tNorm >= start && tNorm <= end;
  }
  return tNorm >= start || tNorm <= end;
}

function spatialCellKey(gx: number, gz: number): number {
  return (gx + 4096) * 8192 + (gz + 4096);
}

function buildTrackSpatialGrid(samples: TrackSample[]): TrackSpatialGrid {
  const cells = new Map<number, number[]>();
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].pos;
    const gx = Math.floor(p.x / SPATIAL_CELL_SIZE);
    const gz = Math.floor(p.z / SPATIAL_CELL_SIZE);
    const key = spatialCellKey(gx, gz);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(i);
  }
  const coarseIndices: number[] = [];
  const step = Math.max(4, Math.floor(samples.length / 450));
  for (let i = 0; i < samples.length; i += step) {
    coarseIndices.push(i);
  }
  return {
    cellSize: SPATIAL_CELL_SIZE,
    cells,
    coarseIndices,
  };
}

function findSampleIndexAtS(samples: TrackSample[], s: number): number {
  const n = samples.length;
  if (s <= 0 || n <= 1) return 0;
  if (s >= samples[n - 1].s) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

function scaleBlueprint(blueprint: TrackBlueprint) {
  const denseRaw = interpolateControlPoints(blueprint.controlPoints, blueprint.meta.shortName);
  const rawLength = computeLoopLength(denseRaw);
  const initialScale = blueprint.meta.lengthMeters / (rawLength || 1);

  const scaledDense = denseRaw.map((d) => ({
    pos: {
      x: d.pos.x * initialScale,
      y: d.pos.y * initialScale,
      z: d.pos.z * initialScale,
    },
    width: d.width,
    cornerName: d.cornerName,
  }));

  // Rescale Y to exact elevation span BEFORE resampling
  let minRawY = Infinity;
  let maxRawY = -Infinity;
  for (const pt of scaledDense) {
    if (pt.pos.y < minRawY) minRawY = pt.pos.y;
    if (pt.pos.y > maxRawY) maxRawY = pt.pos.y;
  }
  const ySpan = maxRawY - minRawY;
  const yScale = ySpan > 0 ? blueprint.meta.elevationSpan / ySpan : 1;
  for (const pt of scaledDense) {
    pt.pos.y = (pt.pos.y - minRawY) * yScale;
  }

  // Fine-tune XZ scale (preserving exact elevation span) so 3D loop length matches meta.lengthMeters (< 0.5m error)
  for (let iter = 0; iter < 2; iter++) {
    const len3d = computeLoopLength(scaledDense);
    const xzCorrection = blueprint.meta.lengthMeters / (len3d || 1);
    if (Math.abs(xzCorrection - 1) < 1e-4) break;
    for (const pt of scaledDense) {
      pt.pos.x *= xzCorrection;
      pt.pos.z *= xzCorrection;
    }
  }

  return scaledDense;
}

function buildTrackFromBlueprint(blueprint: TrackBlueprint, surveyed = false): TrackData {
  const scaledDense = surveyed
    ? profile.stations.map(([x,y,z,width,label]) => ({pos:{x,y,z}, width, cornerName:profile.labels[label]}))
    : scaleBlueprint(blueprint);
  const denseCount = scaledDense.length;

  // Build dense arc-length table + curvature weights for adaptive resampling
  const cumLen = new Float64Array(denseCount + 1);
  for (let i = 0; i < denseCount; i++) {
    const a = scaledDense[i].pos;
    const b = scaledDense[(i + 1) % denseCount].pos;
    cumLen[i + 1] = cumLen[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  let totalLen = cumLen[denseCount];

  if (blueprint.meta.id === 'interlagos') {
    // Distance-domain low-pass filter. Preserve the broad climbs and descents
    // while removing metre-scale ripples from contour interpolation.
    const heights=scaledDense.map(p=>p.pos.y);
    const sigma=40;
    for(let i=0;i<denseCount;i++){
      let total=heights[i],weight=1;
      for(const dir of [-1,1]){
        for(let step=1;step<denseCount;step++){
          const j=(i+dir*step+denseCount)%denseCount;
          const dist=(dir*(cumLen[j]-cumLen[i])+totalLen)%totalLen;
          if(dist>3*sigma)break;
          const w=Math.exp(-.5*(dist/sigma)**2);
          total+=heights[j]*w;weight+=w;
        }
      }
      scaledDense[i].pos.y=total/weight;
    }
    for(let i=0;i<denseCount;i++){
      const a=scaledDense[i].pos,b=scaledDense[(i+1)%denseCount].pos;
      cumLen[i+1]=cumLen[i]+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    }
    totalLen=cumLen[denseCount];
  }

  // Adaptive step target: <= 2.75m on straights, down to ~1.35m in sharp corners
  const cumSampleWeight = new Float64Array(denseCount + 1);
  const kWindow = Math.max(4, Math.round(denseCount * 0.003));
  for (let i = 0; i < denseCount; i++) {
    const pPrev = scaledDense[(i - kWindow + denseCount) % denseCount].pos;
    const pCurr = scaledDense[i].pos;
    const pNext = scaledDense[(i + kWindow) % denseCount].pos;
    const v1x = pCurr.x - pPrev.x;
    const v1z = pCurr.z - pPrev.z;
    const v2x = pNext.x - pCurr.x;
    const v2z = pNext.z - pCurr.z;
    let dAng = Math.atan2(v2x, v2z) - Math.atan2(v1x, v1z);
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const spanDist = Math.max(1, Math.hypot(v1x, v1z) + Math.hypot(v2x, v2z));
    const estK = Math.abs(dAng) / spanDist;
    const localStep = Math.max(
      MIN_ADAPTIVE_STEP_M,
      MAX_ADAPTIVE_STEP_M / (1 + Math.min(1.05, estK * 150)),
    );
    const segLen = cumLen[i + 1] - cumLen[i];
    cumSampleWeight[i + 1] = cumSampleWeight[i] + segLen / localStep;
  }

  const totalWeight = cumSampleWeight[denseCount];
  const sampleCount = Math.max(900, Math.ceil(totalWeight));

  const sourceStations: number[] = [];
  const resampled: Array<{ pos: Vec3; s: number; width: number; cornerName: string }> = [];
  let ptr = 0;
  for (let i = 0; i < sampleCount; i++) {
    const targetW = (i / sampleCount) * totalWeight;
    while (ptr < denseCount - 1 && cumSampleWeight[ptr + 1] < targetW) {
      ptr++;
    }
    const wSpan = cumSampleWeight[ptr + 1] - cumSampleWeight[ptr] || 1;
    const alpha = Math.max(0, Math.min(1, (targetW - cumSampleWeight[ptr]) / wSpan));
    const a = scaledDense[ptr];
    const b = scaledDense[(ptr + 1) % denseCount];
    const sVal = cumLen[ptr] + (cumLen[ptr + 1] - cumLen[ptr]) * alpha;
    if (surveyed) sourceStations.push(profile.stations[alpha < .5 ? ptr : (ptr+1)%denseCount][5]);
    resampled.push({
      pos: {
        x: a.pos.x + (b.pos.x - a.pos.x) * alpha,
        y: a.pos.y + (b.pos.y - a.pos.y) * alpha,
        z: a.pos.z + (b.pos.z - a.pos.z) * alpha,
      },
      s: sVal,
      width: a.width + (b.width - a.width) * alpha,
      cornerName: alpha < 0.5 ? a.cornerName : b.cornerName,
    });
  }

  // First pass: tangent, curvature & metadata
  const rawCurvature = new Float64Array(sampleCount);
  const rawTangents: Vec3[] = new Array(sampleCount);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < sampleCount; i++) {
    const prev = resampled[(i - 1 + sampleCount) % sampleCount];
    const curr = resampled[i];
    const next = resampled[(i + 1) % sampleCount];

    const tx = next.pos.x - prev.pos.x;
    const ty = next.pos.y - prev.pos.y;
    const tz = next.pos.z - prev.pos.z;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    rawTangents[i] = { x: tx / tLen, y: ty / tLen, z: tz / tLen };

    // Curvature over ~12m span regardless of adaptive density
    let backIdx = i;
    let accumBack = 0;
    while (accumBack < 6.0) {
      const pIdx = (backIdx - 1 + sampleCount) % sampleCount;
      accumBack += Math.hypot(
        resampled[backIdx].pos.x - resampled[pIdx].pos.x,
        resampled[backIdx].pos.z - resampled[pIdx].pos.z,
      );
      backIdx = pIdx;
      if (backIdx === i) break;
    }
    let fwdIdx = i;
    let accumFwd = 0;
    while (accumFwd < 6.0) {
      const nIdx = (fwdIdx + 1) % sampleCount;
      accumFwd += Math.hypot(
        resampled[nIdx].pos.x - resampled[fwdIdx].pos.x,
        resampled[nIdx].pos.z - resampled[fwdIdx].pos.z,
      );
      fwdIdx = nIdx;
      if (fwdIdx === i) break;
    }

    const pPrev2 = resampled[backIdx].pos;
    const pNext2 = resampled[fwdIdx].pos;
    const v1x = curr.pos.x - pPrev2.x;
    const v1z = curr.pos.z - pPrev2.z;
    const v2x = pNext2.x - curr.pos.x;
    const v2z = pNext2.z - curr.pos.z;
    let dAngle = Math.atan2(v2x, v2z) - Math.atan2(v1x, v1z);
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    const dsSpan = Math.max(2, accumBack + accumFwd);
    rawCurvature[i] = dAngle / dsSpan;

    if (curr.pos.x < minX) minX = curr.pos.x;
    if (curr.pos.x > maxX) maxX = curr.pos.x;
    if (curr.pos.z < minZ) minZ = curr.pos.z;
    if (curr.pos.z > maxZ) maxZ = curr.pos.z;
    if (curr.pos.y < minY) minY = curr.pos.y;
    if (curr.pos.y > maxY) maxY = curr.pos.y;
  }

  // Smooth signed curvature for subtle realistic banking/camber (zero harsh banking jumps)
  let smoothCurv = Float64Array.from(rawCurvature);
  for (let pass = 0; pass < 6; pass++) {
    const nextBuf = new Float64Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      let sum = 0;
      for (let k = -5; k <= 5; k++) {
        sum += smoothCurv[(i + k + sampleCount) % sampleCount];
      }
      nextBuf[i] = sum / 11;
    }
    smoothCurv = nextBuf;
  }

  const samples: TrackSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const curr = resampled[i];
    const tangent = rawTangents[i];
    const curvature = rawCurvature[i];
    const absCurvature = Math.abs(curvature);

    // Realistic F1 camber/banking: gently tilts inner apex downward (~0..4.1 deg)
    const bank = Math.max(-0.072, Math.min(0.072, smoothCurv[i] * 4.4));
    const horizLen = Math.hypot(tangent.x, tangent.z) || 1;
    const hrx = -tangent.z / horizLen;
    const hrz = tangent.x / horizLen;
    const cosB = Math.cos(bank);
    const sinB = Math.sin(bank);
    const r0x = hrx * cosB;
    const r0y = sinB;
    const r0z = hrz * cosB;

    // Orthonormal surface normal up = normalize(r0 x tangent)
    const ux = r0y * tangent.z - r0z * tangent.y;
    const uy = r0z * tangent.x - r0x * tangent.z;
    const uz = r0x * tangent.y - r0y * tangent.x;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    const up: Vec3 = { x: ux / uLen, y: uy / uLen, z: uz / uLen };

    // Orthogonal right = normalize(tangent x up)
    const rx = tangent.y * up.z - tangent.z * up.y;
    const ry = tangent.z * up.x - tangent.x * up.z;
    const rz = tangent.x * up.y - tangent.y * up.x;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    const right: Vec3 = { x: rx / rLen, y: ry / rLen, z: rz / rLen };

    const tNorm = curr.s / totalLen;
    const [s1End, s2End] = blueprint.sectorBounds;
    const sector: 1 | 2 | 3 = tNorm < s1End ? 1 : tNorm < s2End ? 2 : 3;

    let drsZone: 0 | 1 | 2 = 0;
    if (inZone(tNorm, blueprint.drsZone1)) drsZone = 1;
    else if (inZone(tNorm, blueprint.drsZone2)) drsZone = 2;

    let drsDetection: 0 | 1 | 2 = 0;
    if (inZone(tNorm, blueprint.drsDet1)) drsDetection = 1;
    else if (inZone(tNorm, blueprint.drsDet2)) drsDetection = 2;

    const kerbThreshold = 0.0036;
    const kerbLeft = curvature > kerbThreshold || absCurvature > kerbThreshold * 1.45;
    const kerbRight = curvature < -kerbThreshold || absCurvature > kerbThreshold * 1.45;
    const halfW = curr.width * 0.5;

    // Keep legacy curvature for existing kerbs/banking; driving uses full 1/R.
    const drivingBack = resampled[(i - 4 + sampleCount) % sampleCount].pos;
    const drivingNext = resampled[(i + 4) % sampleCount].pos;
    const horizontalCurvature = drivingCurvature(drivingBack.x, drivingBack.z, curr.pos.x, curr.pos.z, drivingNext.x, drivingNext.z);

    samples.push({
      index: i,
      s: curr.s,
      tNorm,
      pos: curr.pos,
      tangent,
      right,
      up,
      widthLeft: halfW,
      widthRight: halfW,
      curvature,
      absCurvature,
      drivingCurvature: horizontalCurvature,
      grade: tangent.y,
      bank,
      sector,
      drsZone,
      drsDetection,
      kerbLeft,
      kerbRight,
      cornerName: curr.cornerName,
      racingLineOffset: 0,
      racingLinePhase: 'accel',
    });
  }

  // Arc-length consistent kerb extension (~22m before & after corners, regardless of adaptive density)
  const rawLeft = samples.map((s) => s.kerbLeft);
  const rawRight = samples.map((s) => s.kerbRight);
  const avgStep = totalLen / sampleCount;
  const kerbExtendSteps = Math.max(6, Math.round(22 / avgStep));
  for (let i = 0; i < sampleCount; i++) {
    let extL = rawLeft[i];
    let extR = rawRight[i];
    for (let off = -kerbExtendSteps; off <= kerbExtendSteps; off++) {
      const idx = (i + off + sampleCount) % sampleCount;
      if (Math.abs(off) <= Math.round(14 / avgStep)) {
        if (rawLeft[idx]) extL = true;
        if (rawRight[idx]) extR = true;
      }
      if (off < 0 && off >= -kerbExtendSteps) {
        if (samples[idx].curvature > 0.006) extR = true;
        if (samples[idx].curvature < -0.006) extL = true;
      }
      if (off > 0 && off <= kerbExtendSteps) {
        if (samples[idx].curvature > 0.007) extR = true;
        if (samples[idx].curvature < -0.007) extL = true;
      }
    }
    samples[i].kerbLeft = extL;
    samples[i].kerbRight = extR;
  }

  // Local chainage starts at the Blender stripe, 47 m before the GIS origin.
  // Boundaries traced visually on the colourised survey; millimetres are not implied.
  if (surveyed) {
    // T1–T3 from colourised survey; other intervals from estacoes_fia2026_base.csv (estimated).
    const left = [[298,352],[482,615],[1210,1330],[1465,1655],[2455,2545],[2825,2955],[3335,3475],[3635,3765],[3900,4030]];
    const right = [[381,440],[1840,1940],[1950,2070],[2230,2370],[2605,2715],[3040,3150]];
    for (const sample of samples) {
      const station = sourceStations[sample.index];
      sample.kerbLeft = left.some(([start,end]) => station >= start && station <= end);
      sample.kerbRight = right.some(([start,end]) => station >= start && station <= end);
    }
  }

  const aheadIdxOff = Math.max(8, Math.round(52 / avgStep));
  const behindIdxOff = Math.max(6, Math.round(42 / avgStep));
  const rawOffsets = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const maxLat = s.widthLeft - 1.5;
    let target = 0;
    if (s.absCurvature > 0.0032) {
      target = -Math.sign(s.curvature) * Math.min(maxLat, s.absCurvature * 520);
    } else {
      const ahead = samples[(i + aheadIdxOff) % sampleCount];
      if (ahead.absCurvature > 0.0055) {
        target = Math.sign(ahead.curvature) * Math.min(maxLat * 0.85, ahead.absCurvature * 440);
      } else {
        const behind = samples[(i - behindIdxOff + sampleCount) % sampleCount];
        if (behind.absCurvature > 0.0055) {
          target = Math.sign(behind.curvature) * Math.min(maxLat * 0.8, behind.absCurvature * 420);
        }
      }
    }
    rawOffsets[i] = target;
  }

  const smoothRad = Math.max(4, Math.round(16 / avgStep));
  let smoothed = rawOffsets;
  for (let pass = 0; pass < 4; pass++) {
    const nextBuf = new Float64Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      let sum = 0;
      for (let k = -smoothRad; k <= smoothRad; k++) {
        sum += smoothed[(i + k + sampleCount) % sampleCount];
      }
      nextBuf[i] = sum / (smoothRad * 2 + 1);
    }
    smoothed = nextBuf;
  }

  const safeSpeeds = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const k = Math.max(0.0005, samples[i].absCurvature);
    safeSpeeds[i] = Math.min(94, Math.sqrt(24.5 / k));
  }
  const brakeLookMax = Math.max(24, Math.round(165 / avgStep));
  const brakeLookMin = Math.max(3, Math.round(16 / avgStep));
  const coastLookMax = Math.max(10, Math.round(72 / avgStep));
  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const maxLat = s.widthLeft - 1.4;
    s.racingLineOffset = Math.max(-maxLat, Math.min(maxLat, smoothed[i]));

    let brakeNeeded = false;
    let liftNeeded = false;
    const estSpeed = safeSpeeds[i];
    for (let step = brakeLookMin; step <= brakeLookMax; step++) {
      const aheadIdx = (i + step) % sampleCount;
      const dist = (samples[aheadIdx].s - s.s + totalLen) % totalLen;
      const cornerSpd = safeSpeeds[aheadIdx];
      const brakeCap = Math.sqrt(cornerSpd * cornerSpd + 2 * 26.5 * Math.max(0, dist - 10));
      if (estSpeed > brakeCap + 3.0) {
        brakeNeeded = true;
        break;
      }
      if (estSpeed > cornerSpd + 6 && step <= coastLookMax) {
        liftNeeded = true;
      }
    }
    s.racingLinePhase = brakeNeeded ? 'brake' : liftNeeded || s.absCurvature > 0.011 ? 'coast' : 'accel';
  }

  const spatialGrid = buildTrackSpatialGrid(samples);

  const towers: TracksideCameraTower[] = blueprint.towers.map((spec, id) => {
    const idx = findSampleIndexAtS(samples, spec.tNorm * totalLen);
    const s = samples[idx];
    return {
      id,
      name: spec.name,
      sCenter: s.s,
      pos: {
        x: s.pos.x + s.right.x * spec.sideOffset,
        y: s.pos.y + s.right.y * spec.sideOffset + spec.height,
        z: s.pos.z + s.right.z * spec.sideOffset,
      },
      minFov: spec.minFov,
      maxFov: spec.maxFov,
    };
  });

  return {
    id: blueprint.meta.id, surveyed, surfaceZones:surveyed ? geoZones as SurfaceZone[] : undefined,
    meta: blueprint.meta,
    totalLength: totalLen,
    samples,
    towers,
    bounds: { minX, maxX, minZ, maxZ, minY, maxY },
    spatialGrid,
  };
}

export function buildSurveyedInterlagos() {
  return buildTrackFromBlueprint(TRACK_BLUEPRINTS.interlagos, true);
}
export const surveyedInterlagos = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('interlagos') !== 'legacy';
export const TRACKS: Record<TrackId, TrackData> = {
  interlagos: surveyedInterlagos ? buildSurveyedInterlagos() : buildTrackFromBlueprint(TRACK_BLUEPRINTS.interlagos),
  monza: buildTrackFromBlueprint(TRACK_BLUEPRINTS.monza),
  spa: buildTrackFromBlueprint(TRACK_BLUEPRINTS.spa),
};

export const TRACK_LIST: TrackData[] = [TRACKS.interlagos, TRACKS.monza, TRACKS.spa];

export const INTERLAGOS_TRACK = TRACKS.interlagos;

export function getTrack(trackId: TrackId = 'interlagos'): TrackData {
  return TRACKS[trackId] ?? TRACKS.interlagos;
}

export function getSampleAtDistance(s: number, track: TrackData = INTERLAGOS_TRACK): TrackSample {
  const wrapped = ((s % track.totalLength) + track.totalLength) % track.totalLength;
  const idx = findSampleIndexAtS(track.samples, wrapped);
  return track.samples[idx];
}

export function getSampleAtNorm(tNorm: number, track: TrackData = INTERLAGOS_TRACK): TrackSample {
  const wrapped = ((tNorm % 1) + 1) % 1;
  return getSampleAtDistance(wrapped * track.totalLength, track);
}

/**
 * Fast O(1) spatial-grid lookup returning the nearest sample index for any world (x, z).
 */
export function findNearestSampleIndex(
  x: number,
  z: number,
  track: TrackData = INTERLAGOS_TRACK,
  hintIndex?: number,
): number {
  const samples = track.samples;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    const windowRadius = 48;
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const idx = (hintIndex + offset + n) % n;
      const p = samples[idx].pos;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
    if (bestDistSq <= 35 * 35) return bestIdx;
  }

  // Check 3x3 spatial hash neighborhood around (x, z)
  const grid = track.spatialGrid;
  const gx = Math.floor(x / grid.cellSize);
  const gz = Math.floor(z / grid.cellSize);
  let foundInGrid = false;
  bestDistSq = Infinity;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const bucket = grid.cells.get(spatialCellKey(gx + ox, gz + oz));
      if (!bucket) continue;
      foundInGrid = true;
      for (let k = 0; k < bucket.length; k++) {
        const idx = bucket[k];
        const p = samples[idx].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }
  }
  if (foundInGrid && bestDistSq <= grid.cellSize * grid.cellSize * 1.5) {
    return bestIdx;
  }

  // Distant query (e.g., outer terrain mesh vertices): coarse index + local refinement
  bestDistSq = Infinity;
  const coarse = grid.coarseIndices;
  for (let c = 0; c < coarse.length; c++) {
    const idx = coarse[c];
    const p = samples[idx].pos;
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
    }
  }
  const centerIdx = bestIdx;
  const refineRadius = Math.ceil(n / Math.max(1, coarse.length)) + 6;
  for (let off = -refineRadius; off <= refineRadius; off++) {
    const idx = (centerIdx + off + n) % n;
    const p = samples[idx].pos;
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

/**
 * Projects a world (x, z) position onto the active circuit centerline spline.
 * Uses local window search around hintIndex with O(1) spatial hash grid fallback.
 */
export function projectPointToTrack(
  x: number,
  z: number,
  hintIndex?: number,
  track: TrackData = INTERLAGOS_TRACK,
): TrackProjection {
  const samples = track.samples;
  const n = samples.length;
  const nearestIdx = findNearestSampleIndex(x, z, track, hintIndex);

  // Check both adjacent segments [nearestIdx-1 -> nearestIdx] and [nearestIdx -> nearestIdx+1]
  // so projection across adaptive vertices is strictly continuous
  const candA = (nearestIdx - 1 + n) % n;
  const candB = nearestIdx;

  let bestSegIdx = candB;
  let bestFrac = 0;
  let bestSegDistSq = Infinity;
  let nearestX = samples[candB].pos.x;
  let nearestY = samples[candB].pos.y;
  let nearestZ = samples[candB].pos.z;

  for (const sIdx of [candA, candB]) {
    const a = samples[sIdx];
    const b = samples[(sIdx + 1) % n];
    const segX = b.pos.x - a.pos.x;
    const segZ = b.pos.z - a.pos.z;
    const segLenSq = segX * segX + segZ * segZ || 1;
    const frac = Math.max(0, Math.min(1, ((x - a.pos.x) * segX + (z - a.pos.z) * segZ) / segLenSq));
    const px = a.pos.x + segX * frac;
    const pz = a.pos.z + segZ * frac;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < bestSegDistSq) {
      bestSegDistSq = dSq;
      bestSegIdx = sIdx;
      bestFrac = frac;
      nearestX = px;
      nearestY = a.pos.y + (b.pos.y - a.pos.y) * frac;
      nearestZ = pz;
    }
  }

  const s0 = samples[bestSegIdx];
  const sNext = samples[(bestSegIdx + 1) % n];

  const interpVec = (va: Vec3, vb: Vec3): Vec3 => {
    const vx = va.x + (vb.x - va.x) * bestFrac;
    const vy = va.y + (vb.y - va.y) * bestFrac;
    const vz = va.z + (vb.z - va.z) * bestFrac;
    const l = Math.hypot(vx, vy, vz) || 1;
    return { x: vx / l, y: vy / l, z: vz / l };
  };

  const tangent = interpVec(s0.tangent, sNext.tangent);
  const right = interpVec(s0.right, sNext.right);
  const up = interpVec(s0.up, sNext.up);
  const grade = s0.grade + (sNext.grade - s0.grade) * bestFrac;
  const bank = s0.bank + (sNext.bank - s0.bank) * bestFrac;
  const widthLeft = s0.widthLeft + (sNext.widthLeft - s0.widthLeft) * bestFrac;
  const widthRight = s0.widthRight + (sNext.widthRight - s0.widthRight) * bestFrac;

  const rXzLen = Math.hypot(right.x, right.z) || 1;
  const dx = x - nearestX;
  const dz = z - nearestZ;
  const lateralOffset = (dx * right.x + dz * right.z) / rXzLen;

  // Camber raises/lowers surface vertically by sin(bank) * lateralOffset
  const camberedElevation = nearestY + right.y * lateralOffset;

  const ds = ((sNext.s - s0.s + track.totalLength) % track.totalLength) * bestFrac;
  const s = (s0.s + ds) % track.totalLength;
  const tNorm = s / track.totalLength;

  const onTrack = lateralOffset >= -widthLeft - 0.8 && lateralOffset <= widthRight + 0.8;
  const kerbBand = 1.85;
  const kerbL = s0.kerbLeft || sNext.kerbLeft;
  const kerbR = s0.kerbRight || sNext.kerbRight;
  const onKerb =
    (kerbL && lateralOffset < -widthLeft + 0.4 && lateralOffset > -widthLeft - kerbBand) ||
    (kerbR && lateralOffset > widthRight - 0.4 && lateralOffset < widthRight + kerbBand);

  return {
    sampleIndex: bestSegIdx,
    apronWidth: APRON_WIDTH + runoffExtension(track, s, lateralOffset),
    s,
    tNorm,
    lateralOffset,
    nearestPoint: { x: nearestX, y: nearestY, z: nearestZ },
    tangent,
    right,
    up,
    elevation: camberedElevation,
    grade,
    bank,
    sector: s0.sector,
    drsZone: s0.drsZone,
    drsDetection: s0.drsDetection,
    widthLeft,
    widthRight,
    onTrack,
    onKerb,
    cornerName: bestFrac < 0.5 ? s0.cornerName : sNext.cornerName,
  };
}
