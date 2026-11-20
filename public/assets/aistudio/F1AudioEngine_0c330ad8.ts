import { createCombustionWorkletBlobUrl } from './combustionWorklet';
import {
  createF1SoundBank,
  loadRealAudioSamples,
  type F1SoundBank,
  type RealSoundId,
} from './soundBank';

export interface SpatialRivalAudioInput {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  rpm: number;
  throttle: number;
}

export interface AudioUpdateParams {
  active: boolean;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  speedMs: number;
  slipRatio: number;
  ersActive: boolean;
  onKerb: boolean;
  onTrack: boolean;
  wet: boolean;
  isOnboard?: boolean;
  drsActive?: boolean;
  skidSparks?: boolean;
  absTriggered?: boolean;
  tcTriggered?: boolean;
  brakeTemp?: number;
  impactIntensity?: number;
  playerPos?: { x: number; y: number; z: number };
  playerVel?: { vx: number; vz: number };
  cameraPos?: { x: number; y: number; z: number };
  cameraForward?: { x: number; y: number; z: number };
  cameraUp?: { x: number; y: number; z: number };
  rivals?: SpatialRivalAudioInput[];
}

export interface RpmBandConfig {
  id: Extract<
    RealSoundId,
    'engine_idle' | 'engine_low' | 'engine_mid' | 'engine_high' | 'engine_limiter'
  >;
  centerRpm: number;
  minRpm: number;
  maxRpm: number;
}

export interface RpmBandMix {
  id: RpmBandConfig['id'];
  gain: number;
  playbackRate: number;
}

interface RealLoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface RivalVoice {
  oscPrimary: OscillatorNode;
  oscSub: OscillatorNode;
  oscHarmonic: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
}

const SPEED_OF_SOUND_MS = 343;
const MAX_RIVAL_VOICES = 3;
const MAX_RIVAL_AUDIO_DIST_M = 120;

// Per-gear straight-cut tooth mesh multiplier (tracks distinct shaft + final-drive ratios)
const GEAR_WHINE_RATIOS = [0.65, 1.48, 1.34, 1.22, 1.13, 1.06, 1.00, 0.95, 0.91];

/**
 * 5-band RPM crossfade map calibrated to the physics engine rev curve (4,000 - 12,800 RPM).
 * Keeps playbackRate within [0.85, 1.15] around each sample's native RPM to avoid chipmunk/pitch artifacts.
 */
export const RPM_BANDS: RpmBandConfig[] = [
  { id: 'engine_idle', centerRpm: 4200, minRpm: 2500, maxRpm: 6300 },
  { id: 'engine_low', centerRpm: 6300, minRpm: 4500, maxRpm: 8400 },
  { id: 'engine_mid', centerRpm: 8400, minRpm: 6500, maxRpm: 10500 },
  { id: 'engine_high', centerRpm: 10500, minRpm: 8600, maxRpm: 12300 },
  { id: 'engine_limiter', centerRpm: 12300, minRpm: 10700, maxRpm: 13200 },
];

/**
 * Computes cosine-smoothed crossfade gains and clamped playbackRates across the 5 RPM bands.
 */
export function computeRpmBandMix(rpm: number, throttle: number): RpmBandMix[] {
  const clampedRpm = Math.max(3000, Math.min(13200, rpm));
  const loadScale = 0.42 + 0.58 * Math.max(0, Math.min(1, throttle));

  return RPM_BANDS.map((band) => {
    let windowWeight = 0;
    if (clampedRpm >= band.minRpm && clampedRpm <= band.maxRpm) {
      const halfSpan = Math.max(1, (band.maxRpm - band.minRpm) / 2);
      const dist = Math.abs(clampedRpm - band.centerRpm);
      const normDist = Math.min(1, dist / halfSpan);
      windowWeight = Math.cos(normDist * (Math.PI / 2));
    }

    const rawRate = clampedRpm / band.centerRpm;
    const playbackRate = Math.max(0.85, Math.min(1.15, rawRate));

    return {
      id: band.id,
      gain: windowWeight * loadScale,
      playbackRate,
    };
  });
}

/**
 * Computes straight-cut F1 gearbox tooth-mesh carrier frequency (Hz) from active gear, speed, and RPM.
 */
export function computeGearboxFrequency(gear: number, speedMs: number, rpm: number): number {
  const gIdx = Math.max(0, Math.min(8, Math.round(gear < 0 ? 1 : gear)));
  const ratio = GEAR_WHINE_RATIOS[gIdx] ?? 1.0;
  const speedNorm = Math.max(0, Math.min(1.2, speedMs / 92));
  const rpmNorm = Math.max(0, Math.min(1.2, (rpm - 3500) / 9500));
  return Math.max(420, (540 + speedNorm * 1680 + rpmNorm * 320) * ratio);
}

/**
 * Computes V6 4-stroke combustion firing frequency & crank/harmonic orders from RPM.
 */
export function computeEngineOrderFrequencies(rpm: number): {
  crankHz: number;
  fireHz: number;
  secondOrderHz: number;
  thirdOrderHz: number;
} {
  const clampedRpm = Math.max(2000, Math.min(15000, rpm));
  const crankHz = clampedRpm / 60;
  const fireHz = crankHz * 3.0;
  return {
    crankHz,
    fireHz,
    secondOrderHz: fireHz * 2.0,
    thirdOrderHz: fireHz * 3.0,
  };
}

/**
 * Pure helper: computes clamped physical Doppler pitch multiplier given listener and emitter
 * world positions & XZ velocities.
 */
export function computeDopplerPitchRatio(
  listenerPos: { x: number; y: number; z: number },
  listenerVel: { vx: number; vz: number },
  sourcePos: { x: number; y: number; z: number },
  sourceVel: { vx: number; vz: number },
): number {
  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;
  const dz = sourcePos.z - listenerPos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.25) return 1.0;

  const nx = dx / dist;
  const nz = dz / dist;
  const vSourceTowards = -(sourceVel.vx * nx + sourceVel.vz * nz);
  const vListenerTowards = listenerVel.vx * nx + listenerVel.vz * nz;
  const raw = (SPEED_OF_SOUND_MS + vListenerTowards) / Math.max(120, SPEED_OF_SOUND_MS - vSourceTowards);
  return Math.max(0.72, Math.min(1.38, raw));
}

/**
 * Pure helper: picks up to `limit` closest rivals within `maxDist` meters of camera.
 */
export function selectNearestRivals<T extends { x: number; y: number; z: number }>(
  rivals: T[],
  cameraPos: { x: number; y: number; z: number },
  limit = MAX_RIVAL_VOICES,
  maxDist = MAX_RIVAL_AUDIO_DIST_M,
): Array<{ rival: T; dist: number }> {
  const maxDistSq = maxDist * maxDist;
  const list: Array<{ rival: T; dist: number }> = [];
  for (const r of rivals) {
    const dx = r.x - cameraPos.x;
    const dy = r.y - cameraPos.y;
    const dz = r.z - cameraPos.z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq <= maxDistSq) {
      list.push({ rival: r, dist: Math.sqrt(dSq) });
    }
  }
  list.sort((a, b) => a.dist - b.dist);
  return list.slice(0, limit);
}

export class F1AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbSend: GainNode | null = null;
  private surfaceDuckGain: GainNode | null = null;
  private bank: F1SoundBank | null = null;

  // Real Multi-Band RPM Crossfade Engine + Off-Throttle Overrun Loops
  private realBandVoices = new Map<RpmBandConfig['id'], RealLoopVoice>();
  private realOffThrottleVoice: RealLoopVoice | null = null;
  private realEngineBus: GainNode | null = null;
  private realEngineFilter: BiquadFilterNode | null = null;
  private realSamplesLoaded = false;

  // Real Surface Loops (tire_screech.ogg, kerb_rumble.ogg, gravel_grass.ogg, wind_aero.ogg)
  private realTireVoice: RealLoopVoice | null = null;
  private realKerbVoice: RealLoopVoice | null = null;
  private realGravelVoice: RealLoopVoice | null = null;
  private realWindVoice: RealLoopVoice | null = null;

  // V6 1.6L Turbo Hybrid Power Unit + Off-Thread Combustion Worklet (synthetic layer / fallback)
  private engineGain: GainNode | null = null;
  private oscLayerGain: GainNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscDetuned: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private exhaustLow: BiquadFilterNode | null = null;
  private exhaustMid: BiquadFilterNode | null = null;
  private exhaustHigh: BiquadFilterNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletGain: GainNode | null = null;
  private workletBlobUrl: string | null = null;

  // Overhead Carbon Airbox Induction Layer
  private airboxSrc: AudioBufferSourceNode | null = null;
  private airboxFilter: BiquadFilterNode | null = null;
  private airboxGain: GainNode | null = null;

  // Dual-Harmonic Straight-Cut Gearbox Whine, Turbocharger & MGU-K
  private oscGearbox1: OscillatorNode | null = null;
  private oscGearbox2: OscillatorNode | null = null;
  private gearboxFilter: BiquadFilterNode | null = null;
  private gearboxGain: GainNode | null = null;

  private oscTurbo: OscillatorNode | null = null;
  private turboFilter: BiquadFilterNode | null = null;
  private turboGain: GainNode | null = null;

  private oscMguk: OscillatorNode | null = null;
  private oscMgukSub: OscillatorNode | null = null;
  private mgukGain: GainNode | null = null;

  // Procedural Surface Layers (active when real .ogg loop is not loaded)
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private brakeGain: GainNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;
  private kerbSrc: AudioBufferSourceNode | null = null;
  private kerbGain: GainNode | null = null;
  private skidSrc: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;
  private gravelGain: GainNode | null = null;

  // 3D Spatial Rival Car Voices
  private rivalVoices: RivalVoice[] = [];

  private initialized = false;
  private workletReady = false;
  private muted = false;
  private paused = false;
  private prevGear = 1;
  private prevThrottle = 0;
  private prevDrsActive = false;
  private shiftDipUntil = 0;
  private nextOverrunPopAt = 0;
  private nextWastegateAt = 0;
  private lastImpactAt = 0;
  private duckUntilMs = 0;
  private rrCursor = 0;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // 1. Pre-render procedural PCM Sample Bank (zero-latency startup)
    const bank = createF1SoundBank(ctx);
    this.bank = bank;

    // 2. Master Bus Compressor / Limiter
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10.5;
    compressor.knee.value = 14;
    compressor.ratio.value = 4.6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.13;
    this.compressor = compressor;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.muted ? 0 : 0.56;
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    // 3. Stereo Autódromo Grandstand / Pit-Wall Reverb Bus
    const convolver = ctx.createConvolver();
    convolver.buffer = bank.autodromeIR;
    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 3100;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.14;
    reverbSend.connect(convolver);
    convolver.connect(reverbFilter);
    reverbFilter.connect(compressor);
    this.reverbSend = reverbSend;

    // 4. Real Sample Engine Bus (Cabin Low-Pass + Master Crossfade Gain)
    const realEngineFilter = ctx.createBiquadFilter();
    realEngineFilter.type = 'lowpass';
    realEngineFilter.frequency.value = 2400;
    realEngineFilter.Q.value = 0.85;

    const realEngineBus = ctx.createGain();
    realEngineBus.gain.value = 0.0;
    realEngineFilter.connect(realEngineBus);
    realEngineBus.connect(compressor);
    realEngineBus.connect(reverbSend);
    this.realEngineFilter = realEngineFilter;
    this.realEngineBus = realEngineBus;

    // 5. Multi-Stage Exhaust Header Saturation & 3-Band Formant Shaping (Synthetic / Worklet Layer)
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.tanh(x * 2.85 + 0.09 * x * x);
    }
    shaper.curve = curve;

    const exhaustLow = ctx.createBiquadFilter();
    exhaustLow.type = 'peaking';
    exhaustLow.frequency.value = 215;
    exhaustLow.Q.value = 1.25;
    exhaustLow.gain.value = 5.4;

    const exhaustMid = ctx.createBiquadFilter();
    exhaustMid.type = 'peaking';
    exhaustMid.frequency.value = 790;
    exhaustMid.Q.value = 1.85;
    exhaustMid.gain.value = 6.2;

    const exhaustHigh = ctx.createBiquadFilter();
    exhaustHigh.type = 'peaking';
    exhaustHigh.frequency.value = 2650;
    exhaustHigh.Q.value = 1.4;
    exhaustHigh.gain.value = 3.2;

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 2400;
    engineFilter.Q.value = 1.15;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;

    shaper.connect(exhaustLow);
    exhaustLow.connect(exhaustMid);
    exhaustMid.connect(exhaustHigh);
    exhaustHigh.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(compressor);
    engineGain.connect(reverbSend);

    const oscLayerGain = ctx.createGain();
    oscLayerGain.gain.value = 0.56;
    oscLayerGain.connect(shaper);

    const oscPrimary = ctx.createOscillator();
    oscPrimary.type = 'sawtooth';
    oscPrimary.frequency.value = 200;
    const gPrim = ctx.createGain();
    gPrim.gain.value = 0.36;
    oscPrimary.connect(gPrim);
    gPrim.connect(oscLayerGain);

    const oscDetuned = ctx.createOscillator();
    oscDetuned.type = 'sawtooth';
    oscDetuned.frequency.value = 201.3;
    const gDet = ctx.createGain();
    gDet.gain.value = 0.24;
    oscDetuned.connect(gDet);
    gDet.connect(oscLayerGain);

    const oscSub = ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.value = 100;
    const gSub = ctx.createGain();
    gSub.gain.value = 0.58;
    oscSub.connect(gSub);
    gSub.connect(oscLayerGain);

    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.value = 400;
    const gHarm = ctx.createGain();
    gHarm.gain.value = 0.22;
    oscHarmonic.connect(gHarm);
    gHarm.connect(oscLayerGain);

    oscPrimary.start();
    oscDetuned.start();
    oscSub.start();
    oscHarmonic.start();

    this.oscLayerGain = oscLayerGain;
    this.oscPrimary = oscPrimary;
    this.oscDetuned = oscDetuned;
    this.oscSub = oscSub;
    this.oscHarmonic = oscHarmonic;
    this.engineFilter = engineFilter;
    this.exhaustLow = exhaustLow;
    this.exhaustMid = exhaustMid;
    this.exhaustHigh = exhaustHigh;
    this.engineGain = engineGain;

    // Launch off-thread 1.6L V6 Combustion Worklet
    this.initCombustionWorklet(ctx, shaper);

    // 6. Overhead Carbon Airbox Induction Layer
    const airboxSrc = ctx.createBufferSource();
    airboxSrc.buffer = bank.pinkNoise;
    airboxSrc.loop = true;
    const airboxFilter = ctx.createBiquadFilter();
    airboxFilter.type = 'bandpass';
    airboxFilter.frequency.value = 680;
    airboxFilter.Q.value = 2.4;
    const airboxGain = ctx.createGain();
    airboxGain.gain.value = 0;
    airboxSrc.connect(airboxFilter);
    airboxFilter.connect(airboxGain);
    airboxGain.connect(compressor);
    airboxSrc.start();
    this.airboxSrc = airboxSrc;
    this.airboxFilter = airboxFilter;
    this.airboxGain = airboxGain;

    // 7. Dual-Harmonic Straight-Cut Transmission Whine
    const oscGearbox1 = ctx.createOscillator();
    oscGearbox1.type = 'triangle';
    oscGearbox1.frequency.value = 950;
    const oscGearbox2 = ctx.createOscillator();
    oscGearbox2.type = 'sine';
    oscGearbox2.frequency.value = 1900;
    const gGear2 = ctx.createGain();
    gGear2.gain.value = 0.38;

    const gearboxFilter = ctx.createBiquadFilter();
    gearboxFilter.type = 'bandpass';
    gearboxFilter.frequency.value = 1350;
    gearboxFilter.Q.value = 2.6;
    const gearboxGain = ctx.createGain();
    gearboxGain.gain.value = 0;

    oscGearbox1.connect(gearboxFilter);
    oscGearbox2.connect(gGear2);
    gGear2.connect(gearboxFilter);
    gearboxFilter.connect(gearboxGain);
    gearboxGain.connect(compressor);
    oscGearbox1.start();
    oscGearbox2.start();
    this.oscGearbox1 = oscGearbox1;
    this.oscGearbox2 = oscGearbox2;
    this.gearboxFilter = gearboxFilter;
    this.gearboxGain = gearboxGain;

    // 8. Turbocharger Spool Whistle
    const oscTurbo = ctx.createOscillator();
    oscTurbo.type = 'sine';
    oscTurbo.frequency.value = 3400;
    const turboFilter = ctx.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 4200;
    turboFilter.Q.value = 2.0;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    oscTurbo.connect(turboFilter);
    turboFilter.connect(turboGain);
    turboGain.connect(compressor);
    oscTurbo.start();
    this.oscTurbo = oscTurbo;
    this.turboFilter = turboFilter;
    this.turboGain = turboGain;

    // 9. MGU-K Electric Inverter & Rotor Whine
    const oscMguk = ctx.createOscillator();
    oscMguk.type = 'sine';
    oscMguk.frequency.value = 2100;
    const oscMgukSub = ctx.createOscillator();
    oscMgukSub.type = 'triangle';
    oscMgukSub.frequency.value = 1050;
    const gMgukSub = ctx.createGain();
    gMgukSub.gain.value = 0.3;
    const mgukGain = ctx.createGain();
    mgukGain.gain.value = 0;
    oscMguk.connect(mgukGain);
    oscMgukSub.connect(gMgukSub);
    gMgukSub.connect(mgukGain);
    mgukGain.connect(compressor);
    oscMguk.start();
    oscMgukSub.start();
    this.oscMguk = oscMguk;
    this.oscMgukSub = oscMgukSub;
    this.mgukGain = mgukGain;

    // 10. Surface Bus (ducks briefly on heavy impact thuds)
    const surfaceDuckGain = ctx.createGain();
    surfaceDuckGain.gain.value = 1.0;
    surfaceDuckGain.connect(compressor);
    this.surfaceDuckGain = surfaceDuckGain;

    // Wind Aero Rush (procedural fallback)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = bank.pinkNoise;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(surfaceDuckGain);
    windSrc.start();
    this.windFilter = windFilter;
    this.windGain = windGain;

    // Tire Scrub / Screech / Hydro-Spray (procedural fallback)
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = bank.pinkNoise;
    tireSrc.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 1150;
    tireFilter.Q.value = 3.6;
    const tireGain = ctx.createGain();
    tireGain.gain.value = 0;
    tireSrc.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(surfaceDuckGain);
    tireSrc.start();
    this.tireFilter = tireFilter;
    this.tireGain = tireGain;

    // Carbon-Ceramic Brake Pad Bite & Thermal Squeal
    const brakeSrc = ctx.createBufferSource();
    brakeSrc.buffer = bank.pinkNoise;
    brakeSrc.loop = true;
    const brakeFilter = ctx.createBiquadFilter();
    brakeFilter.type = 'bandpass';
    brakeFilter.frequency.value = 2950;
    brakeFilter.Q.value = 6.5;
    const brakeGain = ctx.createGain();
    brakeGain.gain.value = 0;
    brakeSrc.connect(brakeFilter);
    brakeFilter.connect(brakeGain);
    brakeGain.connect(surfaceDuckGain);
    brakeSrc.start();
    this.brakeFilter = brakeFilter;
    this.brakeGain = brakeGain;

    // Serrated Kerb Loop (procedural fallback)
    const kerbSrc = ctx.createBufferSource();
    kerbSrc.buffer = bank.kerbLoop;
    kerbSrc.loop = true;
    const kerbFilter = ctx.createBiquadFilter();
    kerbFilter.type = 'lowpass';
    kerbFilter.frequency.value = 520;
    const kerbGain = ctx.createGain();
    kerbGain.gain.value = 0;
    kerbSrc.connect(kerbFilter);
    kerbFilter.connect(kerbGain);
    kerbGain.connect(surfaceDuckGain);
    kerbSrc.start();
    this.kerbSrc = kerbSrc;
    this.kerbGain = kerbGain;

    // Titanium Skid-Block Spark Scrape Loop
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = bank.skidScrapeLoop;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'highpass';
    skidFilter.frequency.value = 1100;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(surfaceDuckGain);
    skidSrc.start();
    this.skidSrc = skidSrc;
    this.skidGain = skidGain;

    // Off-Track Gravel / Grass Crunch (procedural fallback)
    const gravelSrc = ctx.createBufferSource();
    gravelSrc.buffer = bank.pinkNoise;
    gravelSrc.loop = true;
    const gravelFilter = ctx.createBiquadFilter();
    gravelFilter.type = 'bandpass';
    gravelFilter.frequency.value = 480;
    gravelFilter.Q.value = 1.5;
    const gravelGain = ctx.createGain();
    gravelGain.gain.value = 0;
    gravelSrc.connect(gravelFilter);
    gravelFilter.connect(gravelGain);
    gravelGain.connect(surfaceDuckGain);
    gravelSrc.start();
    this.gravelGain = gravelGain;

    // 11. Pre-allocate 3 Spatial 3D Rival Voices
    for (let i = 0; i < MAX_RIVAL_VOICES; i++) {
      const oscPrimaryR = ctx.createOscillator();
      oscPrimaryR.type = 'sawtooth';
      oscPrimaryR.frequency.value = 180;

      const oscSubR = ctx.createOscillator();
      oscSubR.type = 'triangle';
      oscSubR.frequency.value = 90;

      const oscHarmR = ctx.createOscillator();
      oscHarmR.type = 'sawtooth';
      oscHarmR.frequency.value = 360;

      const gSubR = ctx.createGain();
      gSubR.gain.value = 0.55;
      const gHarmR = ctx.createGain();
      gHarmR.gain.value = 0.35;

      const rFilter = ctx.createBiquadFilter();
      rFilter.type = 'lowpass';
      rFilter.frequency.value = 1850;

      const rGain = ctx.createGain();
      rGain.gain.value = 0;

      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 7;
      panner.maxDistance = MAX_RIVAL_AUDIO_DIST_M;
      panner.rolloffFactor = 1.15;

      oscPrimaryR.connect(rFilter);
      oscSubR.connect(gSubR);
      gSubR.connect(rFilter);
      oscHarmR.connect(gHarmR);
      gHarmR.connect(rFilter);
      rFilter.connect(rGain);
      rGain.connect(panner);
      panner.connect(compressor);
      panner.connect(reverbSend);

      oscPrimaryR.start();
      oscSubR.start();
      oscHarmR.start();

      this.rivalVoices.push({
        oscPrimary: oscPrimaryR,
        oscSub: oscSubR,
        oscHarmonic: oscHarmR,
        filter: rFilter,
        gain: rGain,
        panner,
      });
    }

    this.initialized = true;

    // 12. Load real CC0 .ogg sample library from `/audio/*.ogg` asynchronously
    void this.mountRealSamplesAsync(ctx, bank);
  }

  private createLoopedVoice(
    ctx: AudioContext,
    buffer: AudioBuffer,
    destination: AudioNode,
  ): RealLoopVoice {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(destination);
    src.start();
    return { src, gain };
  }

  private async mountRealSamplesAsync(ctx: AudioContext, bank: F1SoundBank): Promise<void> {
    await loadRealAudioSamples(ctx, bank);
    if (!this.ctx || this.ctx.state === 'closed' || !this.realEngineFilter || !this.surfaceDuckGain) {
      return;
    }

    // Mount 5 RPM band loops
    for (const band of RPM_BANDS) {
      const buf = bank.realSamples[band.id];
      if (buf && !this.realBandVoices.has(band.id)) {
        this.realBandVoices.set(band.id, this.createLoopedVoice(ctx, buf, this.realEngineFilter));
      }
    }

    // Mount off-throttle overrun deceleration loop
    const offBuf = bank.realSamples.engine_off_throttle;
    if (offBuf && !this.realOffThrottleVoice) {
      this.realOffThrottleVoice = this.createLoopedVoice(ctx, offBuf, this.realEngineFilter);
    }

    // Mount real continuous surface loops (tire screech, kerb rumble, gravel/grass, wind aero)
    if (bank.realSamples.tire_screech && !this.realTireVoice) {
      this.realTireVoice = this.createLoopedVoice(ctx, bank.realSamples.tire_screech, this.surfaceDuckGain);
    }
    if (bank.realSamples.kerb_rumble && !this.realKerbVoice) {
      this.realKerbVoice = this.createLoopedVoice(ctx, bank.realSamples.kerb_rumble, this.surfaceDuckGain);
    }
    if (bank.realSamples.gravel_grass && !this.realGravelVoice) {
      this.realGravelVoice = this.createLoopedVoice(ctx, bank.realSamples.gravel_grass, this.surfaceDuckGain);
    }
    if (bank.realSamples.wind_aero && !this.realWindVoice) {
      this.realWindVoice = this.createLoopedVoice(ctx, bank.realSamples.wind_aero, this.surfaceDuckGain);
    }

    this.realSamplesLoaded = true;
  }

  private initCombustionWorklet(ctx: AudioContext, targetNode: AudioNode): void {
    if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') return;
    try {
      const url = createCombustionWorkletBlobUrl();
      this.workletBlobUrl = url;
      void ctx.audioWorklet
        .addModule(url)
        .then(() => {
          if (!this.ctx || this.ctx.state === 'closed') return;
          const node = new AudioWorkletNode(this.ctx, 'f1-v6-combustion');
          const gain = this.ctx.createGain();
          // Keep subtle physical sub-harmonic texture (0.14) when real .ogg engine is active, else 0.94
          gain.gain.value = this.bank?.realEngineReady ? 0.14 : 0.94;
          node.connect(gain);
          gain.connect(targetNode);
          this.workletNode = node;
          this.workletGain = gain;
          this.workletReady = true;
          if (this.oscLayerGain) {
            this.oscLayerGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.08);
          }
        })
        .catch(() => {
          // Graceful fallback: 4-oscillator harmonic foundation continues seamlessly
        });
    } catch {
      // Ignore AudioWorklet unsupported environments
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncMasterLevel();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncMasterLevel();
  }

  private syncMasterLevel(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted || this.paused ? 0 : 0.56;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.035);
  }

  private pickNextBuffer(pool: AudioBuffer[]): AudioBuffer {
    const idx = this.rrCursor++ % pool.length;
    return pool[idx];
  }

  private playBankSample(
    buf: AudioBuffer,
    level: number,
    playbackRate = 1.0,
    sendReverb = true,
    delaySec = 0,
  ): void {
    if (!this.ctx || !this.compressor || this.muted || this.paused) return;
    const startAt = this.ctx.currentTime + delaySec;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, Math.min(2.0, playbackRate));
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, Math.min(0.85, level));
    src.connect(g);
    g.connect(this.compressor);
    if (sendReverb && this.reverbSend) g.connect(this.reverbSend);
    src.start(startAt);
  }

  private silenceAllLoops(now: number): void {
    this.realEngineBus?.gain.setTargetAtTime(0, now, 0.04);
    for (const voice of this.realBandVoices.values()) {
      voice.gain.gain.setTargetAtTime(0, now, 0.04);
    }
    this.realOffThrottleVoice?.gain.gain.setTargetAtTime(0, now, 0.04);
    this.realTireVoice?.gain.gain.setTargetAtTime(0, now, 0.04);
    this.realKerbVoice?.gain.gain.setTargetAtTime(0, now, 0.04);
    this.realGravelVoice?.gain.gain.setTargetAtTime(0, now, 0.04);
    this.realWindVoice?.gain.gain.setTargetAtTime(0, now, 0.04);

    this.engineGain?.gain.setTargetAtTime(0, now, 0.04);
    this.airboxGain?.gain.setTargetAtTime(0, now, 0.04);
    this.gearboxGain?.gain.setTargetAtTime(0, now, 0.04);
    this.turboGain?.gain.setTargetAtTime(0, now, 0.04);
    this.mgukGain?.gain.setTargetAtTime(0, now, 0.04);
    this.windGain?.gain.setTargetAtTime(0, now, 0.04);
    this.tireGain?.gain.setTargetAtTime(0, now, 0.04);
    this.brakeGain?.gain.setTargetAtTime(0, now, 0.04);
    this.kerbGain?.gain.setTargetAtTime(0, now, 0.04);
    this.skidGain?.gain.setTargetAtTime(0, now, 0.04);
    this.gravelGain?.gain.setTargetAtTime(0, now, 0.04);
    for (const rv of this.rivalVoices) {
      rv.gain.gain.setTargetAtTime(0, now, 0.04);
    }
  }

  public update(params: AudioUpdateParams): void {
    if (!this.initialized || !this.ctx || !this.bank) return;
    if (this.ctx.state === 'suspended' && !this.paused && !this.muted) {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const nowMs = performance.now();

    if (!params.active || this.paused) {
      this.silenceAllLoops(now);
      return;
    }

    const isOnboard = Boolean(params.isOnboard);
    const speedNorm = Math.min(1, params.speedMs / 92);
    const rpmNorm = Math.max(0, Math.min(1, (params.rpm - 4000) / 8800));
    const orders = computeEngineOrderFrequencies(params.rpm);
    const realSamples = this.bank.realSamples;
    const useRealEngine = this.realSamplesLoaded && this.bank.realEngineReady;

    // Dynamic reverb mix: tight cabin vs open autódromo grandstand echo
    if (this.reverbSend) {
      this.reverbSend.gain.setTargetAtTime(isOnboard ? 0.075 : 0.22, now, 0.05);
    }

    // Update 3D AudioListener pose from active camera
    if (params.cameraPos && params.cameraForward && params.cameraUp) {
      const listener = this.ctx.listener;
      if (listener.positionX) {
        listener.positionX.setTargetAtTime(params.cameraPos.x, now, 0.015);
        listener.positionY.setTargetAtTime(params.cameraPos.y, now, 0.015);
        listener.positionZ.setTargetAtTime(params.cameraPos.z, now, 0.015);
        listener.forwardX.setTargetAtTime(params.cameraForward.x, now, 0.015);
        listener.forwardY.setTargetAtTime(params.cameraForward.y, now, 0.015);
        listener.forwardZ.setTargetAtTime(params.cameraForward.z, now, 0.015);
        listener.upX.setTargetAtTime(params.cameraUp.x, now, 0.015);
        listener.upY.setTargetAtTime(params.cameraUp.y, now, 0.015);
        listener.upZ.setTargetAtTime(params.cameraUp.z, now, 0.015);
      }
    }

    // 1. Gear Shift Acoustic Bank (Real gear_upshift / gear_downshift / exhaust_backfire with procedural fallback)
    if (params.gear !== this.prevGear) {
      if (params.gear > this.prevGear && params.gear > 1) {
        // 45ms seamless ignition-cut dip + sequential gearbox shift transient
        this.shiftDipUntil = now + 0.045;
        const upshiftBuf = realSamples.gear_upshift ?? this.pickNextBuffer(this.bank.upshiftCuts);
        this.playBankSample(
          upshiftBuf,
          isOnboard ? 0.42 : 0.32,
          0.95 + Math.random() * 0.12,
          true,
        );
        if (params.throttle > 0.65 && rpmNorm > 0.58) {
          const popBuf = realSamples.exhaust_backfire ?? this.pickNextBuffer(this.bank.exhaustPops);
          this.playBankSample(
            popBuf,
            isOnboard ? 0.22 : 0.34,
            0.94 + Math.random() * 0.18,
            true,
            0.018,
          );
          if (now >= this.nextWastegateAt) {
            this.playBankSample(
              this.pickNextBuffer(this.bank.wastegateFlutters),
              isOnboard ? 0.09 : 0.13,
              1.02 + Math.random() * 0.12,
              false,
              0.02,
            );
            this.nextWastegateAt = now + 0.18;
          }
        }
      } else if (params.gear < this.prevGear && params.gear >= 1) {
        // Sequential downshift blip + optional high-RPM exhaust backfire
        const blipPitch = Math.max(0.82, Math.min(1.24, params.rpm / 9600));
        if (realSamples.gear_downshift) {
          this.playBankSample(
            realSamples.gear_downshift,
            isOnboard ? 0.44 : 0.34,
            blipPitch,
            true,
          );
        } else {
          this.playBankSample(
            this.pickNextBuffer(this.bank.downshiftClunks),
            isOnboard ? 0.36 : 0.22,
            0.94 + Math.random() * 0.14,
            true,
          );
          this.playBankSample(
            this.pickNextBuffer(this.bank.downshiftBlips),
            isOnboard ? 0.28 : 0.24,
            blipPitch,
            true,
            0.008,
          );
        }

        if (params.rpm > 10500 || rpmNorm > 0.55) {
          const popBuf = realSamples.exhaust_backfire ?? this.pickNextBuffer(this.bank.exhaustPops);
          this.playBankSample(
            popBuf,
            isOnboard ? 0.22 : 0.36,
            0.92 + Math.random() * 0.16,
            true,
            0.024,
          );
        }
      } else if (params.gear === 1 && this.prevGear <= 0) {
        const launchBuf = realSamples.gear_downshift ?? this.bank.downshiftClunks[0];
        this.playBankSample(launchBuf, isOnboard ? 0.34 : 0.22, 0.88, false);
      }
      this.prevGear = params.gear;
    }

    // 2. DRS Actuator Click & Flap Sound
    const drsNow = Boolean(params.drsActive);
    if (drsNow !== this.prevDrsActive) {
      this.playBankSample(
        drsNow ? this.bank.drsOpen : this.bank.drsClose,
        isOnboard ? 0.26 : 0.16,
        1.0,
        false,
      );
      this.prevDrsActive = drsNow;
    }

    // 3. Sudden Throttle Lift: Wastegate Compressor Flutter + Tailpipe Backfire Crackles
    if (this.prevThrottle > 0.65 && params.throttle < 0.20 && params.rpm > 7800) {
      if (now >= this.nextWastegateAt) {
        this.playBankSample(
          this.pickNextBuffer(this.bank.wastegateFlutters),
          isOnboard ? 0.11 : 0.15,
          0.95 + rpmNorm * 0.18,
          false,
        );
        this.nextWastegateAt = now + 0.24;
      }
      const popBuf = realSamples.exhaust_backfire ?? this.pickNextBuffer(this.bank.exhaustPops);
      this.playBankSample(
        popBuf,
        isOnboard ? 0.18 : 0.32,
        0.92 + Math.random() * 0.16,
        true,
      );
      this.nextOverrunPopAt = now + 0.11;
    } else if (
      params.throttle < 0.10 &&
      params.rpm > 8500 &&
      params.speedMs > 26 &&
      now >= this.nextOverrunPopAt
    ) {
      const popBuf = realSamples.exhaust_backfire ?? this.pickNextBuffer(this.bank.exhaustPops);
      this.playBankSample(
        popBuf,
        isOnboard ? 0.10 : 0.20,
        0.88 + Math.random() * 0.20,
        true,
      );
      this.nextOverrunPopAt = now + 0.13 + Math.random() * 0.15;
    }
    this.prevThrottle = params.throttle;

    // 4. Chassis / Barrier Impacts & Surface Bus Ducking
    if ((params.impactIntensity ?? 0) > 0.15 && now - this.lastImpactAt > 0.14) {
      this.lastImpactAt = now;
      this.duckUntilMs = nowMs + 150;
      this.playImpact(params.impactIntensity ?? 0.5);
    }
    const duckTarget = nowMs < this.duckUntilMs ? 0.52 : 1.0;
    this.surfaceDuckGain?.gain.setTargetAtTime(duckTarget, now, 0.025);

    // 5A. Real 5-Band RPM Cosine Crossfader + Off-Throttle Overrun Layer (when .ogg files are loaded)
    const isDipping = now < this.shiftDipUntil;
    if (useRealEngine && this.realEngineBus && this.realEngineFilter) {
      // Helmet / airbox low-pass acoustics in cockpit vs open trackside air
      this.realEngineFilter.frequency.setTargetAtTime(isOnboard ? 2250 : 18000, now, 0.04);

      const mixes = computeRpmBandMix(params.rpm, params.throttle);
      for (const m of mixes) {
        const voice = this.realBandVoices.get(m.id);
        if (!voice) continue;
        voice.src.playbackRate.setTargetAtTime(m.playbackRate, now, 0.015);
        voice.gain.gain.setTargetAtTime(m.gain, now, 0.02);
      }

      if (this.realOffThrottleVoice) {
        const offGain =
          (1 - Math.max(0, Math.min(1, params.throttle))) *
          Math.min(1, params.rpm / 9500) *
          0.65;
        const offRate = Math.max(0.85, Math.min(1.15, params.rpm / 8800));
        this.realOffThrottleVoice.src.playbackRate.setTargetAtTime(offRate, now, 0.02);
        this.realOffThrottleVoice.gain.gain.setTargetAtTime(offGain, now, 0.025);
      }

      const realBusGain = isDipping ? 0.16 : 0.72 + rpmNorm * 0.16;
      this.realEngineBus.gain.setTargetAtTime(realBusGain, now, 0.012);
    } else if (this.realEngineBus) {
      this.realEngineBus.gain.setTargetAtTime(0, now, 0.03);
    }

    // 5B. V6 Combustion Worklet + Companion Oscillators (12% sub-harmonic body when real .ogg is active, else 100%)
    this.oscPrimary?.frequency.setTargetAtTime(orders.fireHz, now, 0.011);
    this.oscDetuned?.frequency.setTargetAtTime(orders.fireHz * 1.0055, now, 0.011);
    this.oscSub?.frequency.setTargetAtTime(orders.crankHz, now, 0.011);
    this.oscHarmonic?.frequency.setTargetAtTime(orders.secondOrderHz, now, 0.011);

    const engineLoad = Math.max(
      0.15,
      Math.min(1.0, params.throttle * 0.72 + (Math.max(1, params.gear) / 8) * 0.28),
    );
    if (this.workletNode) {
      const wParams = this.workletNode.parameters;
      wParams.get('rpm')?.setTargetAtTime(params.rpm, now, 0.011);
      wParams.get('throttle')?.setTargetAtTime(params.throttle, now, 0.014);
      wParams.get('limiter')?.setValueAtTime(params.rpm > 12380 ? 1 : 0, now);
      wParams.get('load')?.setTargetAtTime(engineLoad, now, 0.02);
      wParams.get('onboard')?.setTargetAtTime(isOnboard ? 1 : 0, now, 0.04);
      wParams.get('tcCut')?.setValueAtTime(params.tcTriggered ? 1 : 0, now);
    }
    if (this.workletGain) {
      this.workletGain.gain.setTargetAtTime(useRealEngine ? 0.14 : 0.94, now, 0.05);
    }

    const cutoff = (isOnboard ? 1150 : 1450) + rpmNorm * 3500 + params.throttle * 1700;
    this.engineFilter?.frequency.setTargetAtTime(cutoff, now, 0.02);
    this.exhaustLow?.frequency.setTargetAtTime(185 + rpmNorm * 135, now, 0.03);
    this.exhaustMid?.frequency.setTargetAtTime(560 + rpmNorm * 780, now, 0.03);
    this.exhaustHigh?.frequency.setTargetAtTime(2200 + rpmNorm * 1450, now, 0.03);
    this.exhaustHigh?.gain.setTargetAtTime(isOnboard ? 2.2 : 5.2, now, 0.04);

    const limiterDip =
      !this.workletReady && params.rpm > 12380 && Math.sin(now * 92) > 0.15 ? 0.38 : 1.0;
    const synthScale = useRealEngine ? 0.14 : 1.0;
    const engineGainTarget = isDipping
      ? 0.14 * synthScale
      : (0.29 + params.throttle * 0.23 + rpmNorm * 0.19) * limiterDip * synthScale;
    this.engineGain?.gain.setTargetAtTime(engineGainTarget, now, 0.011);

    // 6. Carbon Airbox Overhead Induction Growl
    if (this.airboxFilter && this.airboxGain) {
      this.airboxFilter.frequency.setTargetAtTime(420 + rpmNorm * 820 + params.throttle * 340, now, 0.025);
      const airboxVol =
        (isOnboard ? 0.11 : 0.035) * (0.18 + params.throttle * 0.82) * (0.35 + rpmNorm * 0.65);
      this.airboxGain.gain.setTargetAtTime(airboxVol, now, 0.03);
    }

    // 7. Dual-Harmonic Straight-Cut Gearbox Whine
    const gearHz = computeGearboxFrequency(params.gear, params.speedMs, params.rpm);
    this.oscGearbox1?.frequency.setTargetAtTime(gearHz, now, 0.024);
    this.oscGearbox2?.frequency.setTargetAtTime(gearHz * 2.0, now, 0.024);
    this.gearboxFilter?.frequency.setTargetAtTime(gearHz * 1.15, now, 0.03);
    const gearboxMult = isOnboard ? 1.45 : 0.60;
    const loadDrive = 0.38 + Math.max(params.throttle, params.brake * 0.55) * 0.62;
    const gearboxVol =
      params.speedMs > 6
        ? Math.min(0.062, (0.009 + speedNorm * 0.030) * gearboxMult * loadDrive)
        : 0;
    this.gearboxGain?.gain.setTargetAtTime(gearboxVol, now, 0.03);

    // 8. Turbocharger Spool
    const turboHz = 3100 + rpmNorm * 2850 + params.throttle * 1200;
    this.oscTurbo?.frequency.setTargetAtTime(turboHz, now, 0.04);
    this.turboFilter?.frequency.setTargetAtTime(turboHz, now, 0.04);
    const turboVol = (0.008 + params.throttle * 0.022) * (0.28 + rpmNorm * 0.72);
    this.turboGain?.gain.setTargetAtTime(turboVol, now, 0.04);

    // 9. MGU-K Electric Deployment & Braking Regen Harvest Whine
    const regenActive = params.brake > 0.22 && params.speedMs > 16;
    const mgukActive = params.ersActive || regenActive;
    const mgukHz = 1580 + speedNorm * 2850;
    this.oscMguk?.frequency.setTargetAtTime(mgukHz, now, 0.03);
    this.oscMgukSub?.frequency.setTargetAtTime(mgukHz * 0.5, now, 0.03);
    this.mgukGain?.gain.setTargetAtTime(mgukActive ? (params.ersActive ? 0.034 : 0.022) : 0.0, now, 0.03);

    // 10. Aero Wind, Tires, Carbon Brakes (with ABS Pulse), Kerbs, Skid Sparks, Gravel
    const windMix = (isOnboard ? 0.11 : 0.16) * (drsNow ? 1.22 : 1.0);
    const windTarget = speedNorm * speedNorm * windMix;
    if (this.realWindVoice) {
      this.realWindVoice.src.playbackRate.setTargetAtTime(0.85 + speedNorm * 0.35, now, 0.05);
      this.realWindVoice.gain.gain.setTargetAtTime(windTarget * 1.4, now, 0.05);
      this.windGain?.gain.setTargetAtTime(0, now, 0.04);
    } else {
      this.windFilter?.frequency.setTargetAtTime(280 + speedNorm * 1860, now, 0.05);
      this.windGain?.gain.setTargetAtTime(windTarget, now, 0.05);
    }

    const wetSpray = params.wet && params.speedMs > 15 ? speedNorm * 0.11 : 0;
    const slipVol = Math.min(
      0.34,
      Math.max(0, params.slipRatio - 0.14) * (params.wet ? 0.20 : 0.38) + wetSpray,
    );
    if (this.realTireVoice) {
      this.realTireVoice.src.playbackRate.setTargetAtTime(
        0.90 + Math.min(0.25, params.slipRatio * 0.30),
        now,
        0.03,
      );
      this.realTireVoice.gain.gain.setTargetAtTime(slipVol * 1.15, now, 0.03);
      this.tireGain?.gain.setTargetAtTime(0, now, 0.03);
    } else {
      this.tireFilter?.frequency.setTargetAtTime(
        params.wet ? 1820 + speedNorm * 720 : 1080 + Math.min(620, params.slipRatio * 480),
        now,
        0.03,
      );
      this.tireGain?.gain.setTargetAtTime(slipVol, now, 0.03);
    }

    const tempBoost = 0.65 + (params.brakeTemp ?? 0.3) * 0.75;
    const absPulse = params.absTriggered ? (Math.sin(now * 138) > 0 ? 1.25 : 0.35) : 1.0;
    const brakeSquealVol =
      params.brake > 0.38 && params.speedMs > 18
        ? Math.min(0.055, params.brake * speedNorm * 0.042 * tempBoost * absPulse)
        : 0;
    this.brakeFilter?.frequency.setTargetAtTime(2600 + (params.brakeTemp ?? 0) * 1100, now, 0.04);
    this.brakeGain?.gain.setTargetAtTime(brakeSquealVol, now, 0.02);

    const kerbVol = params.onKerb && params.speedMs > 7 ? Math.min(0.38, 0.10 + speedNorm * 0.30) : 0;
    if (this.realKerbVoice) {
      this.realKerbVoice.src.playbackRate.setTargetAtTime(0.75 + speedNorm * 0.65, now, 0.025);
      this.realKerbVoice.gain.gain.setTargetAtTime(kerbVol, now, 0.02);
      this.kerbGain?.gain.setTargetAtTime(0, now, 0.02);
    } else if (this.kerbSrc && this.kerbGain) {
      this.kerbSrc.playbackRate.setTargetAtTime(0.62 + speedNorm * 1.22, now, 0.025);
      this.kerbGain.gain.setTargetAtTime(kerbVol, now, 0.02);
    }

    if (this.skidSrc && this.skidGain) {
      this.skidSrc.playbackRate.setTargetAtTime(0.85 + speedNorm * 0.45, now, 0.03);
      const skidVol = params.skidSparks && params.speedMs > 28 ? (isOnboard ? 0.12 : 0.17) : 0;
      this.skidGain.gain.setTargetAtTime(skidVol, now, 0.02);
    }

    const gravelVol = !params.onTrack && params.speedMs > 5 ? Math.min(0.30, 0.09 + speedNorm * 0.22) : 0;
    if (this.realGravelVoice) {
      this.realGravelVoice.src.playbackRate.setTargetAtTime(0.82 + speedNorm * 0.42, now, 0.03);
      this.realGravelVoice.gain.gain.setTargetAtTime(gravelVol, now, 0.025);
      this.gravelGain?.gain.setTargetAtTime(0, now, 0.025);
    } else {
      this.gravelGain?.gain.setTargetAtTime(gravelVol, now, 0.025);
    }

    // 11. Spatial 3D Rival Cars with Doppler Frequency Shift
    if (params.rivals && params.cameraPos) {
      const nearest = selectNearestRivals(
        params.rivals,
        params.cameraPos,
        MAX_RIVAL_VOICES,
        MAX_RIVAL_AUDIO_DIST_M,
      );
      const listenerVel = params.playerVel ?? { vx: 0, vz: 0 };

      for (let i = 0; i < MAX_RIVAL_VOICES; i++) {
        const voice = this.rivalVoices[i];
        const entry = nearest[i];
        if (!entry) {
          voice.gain.gain.setTargetAtTime(0, now, 0.05);
          continue;
        }
        const r = entry.rival;
        const doppler = computeDopplerPitchRatio(
          params.cameraPos,
          listenerVel,
          r,
          { vx: r.vx, vz: r.vz },
        );
        const rOrders = computeEngineOrderFrequencies(r.rpm);
        const rFireHz = rOrders.fireHz * doppler;

        voice.oscPrimary.frequency.setTargetAtTime(rFireHz, now, 0.02);
        voice.oscSub.frequency.setTargetAtTime(rOrders.crankHz * doppler, now, 0.02);
        voice.oscHarmonic.frequency.setTargetAtTime(rFireHz * 2.01, now, 0.02);
        voice.filter.frequency.setTargetAtTime(1050 + r.throttle * 1650, now, 0.03);

        if (voice.panner.positionX) {
          voice.panner.positionX.setTargetAtTime(r.x, now, 0.02);
          voice.panner.positionY.setTargetAtTime(r.y, now, 0.02);
          voice.panner.positionZ.setTargetAtTime(r.z, now, 0.02);
        }

        const rVol = Math.min(
          0.25,
          (0.10 + r.throttle * 0.11) * Math.max(0, 1 - entry.dist / MAX_RIVAL_AUDIO_DIST_M),
        );
        voice.gain.gain.setTargetAtTime(rVol, now, 0.03);
      }
    }
  }

  public playImpact(intensity: number): void {
    if (!this.ctx || !this.bank || this.muted || this.paused) return;
    const level = Math.max(0.16, Math.min(0.55, intensity * 0.55));
    const impactBuf =
      this.bank.realSamples.collision_carbon ?? this.pickNextBuffer(this.bank.chassisImpacts);
    this.playBankSample(impactBuf, level, 0.88 + Math.random() * 0.24, true);
  }

  public playRecordChime(): void {
    if (!this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [660, 880, 1175];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    g.gain.setValueAtTime(isGo ? 0.22 : 0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.32 : 0.14));
    osc.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + (isGo ? 0.34 : 0.15));
  }

  public dispose(): void {
    try {
      for (const voice of this.realBandVoices.values()) {
        voice.src.stop();
      }
      this.realBandVoices.clear();
      this.realOffThrottleVoice?.src.stop();
      this.realTireVoice?.src.stop();
      this.realKerbVoice?.src.stop();
      this.realGravelVoice?.src.stop();
      this.realWindVoice?.src.stop();

      this.oscPrimary?.stop();
      this.oscDetuned?.stop();
      this.oscSub?.stop();
      this.oscHarmonic?.stop();
      this.airboxSrc?.stop();
      this.oscGearbox1?.stop();
      this.oscGearbox2?.stop();
      this.oscTurbo?.stop();
      this.oscMguk?.stop();
      this.oscMgukSub?.stop();
      this.kerbSrc?.stop();
      this.skidSrc?.stop();
      this.workletNode?.disconnect();
      for (const rv of this.rivalVoices) {
        rv.oscPrimary.stop();
        rv.oscSub.stop();
        rv.oscHarmonic.stop();
      }
      if (this.workletBlobUrl) {
        URL.revokeObjectURL(this.workletBlobUrl);
        this.workletBlobUrl = null;
      }
      void this.ctx?.close();
    } catch {
      // Ignore cleanup error
    }
    this.initialized = false;
    this.realSamplesLoaded = false;
  }
}
