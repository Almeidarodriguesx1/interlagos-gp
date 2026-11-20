/**
 * Hybrid F1 Audio Sample Bank (Real Public-Library .ogg Samples + Procedural Fallback).
 *
 * Loads 14 real CC0 / Royalty-Free .ogg samples from `/audio/*.ogg` asynchronously when
 * `loadRealAudioSamples()` is called, while preserving synchronous procedural PCM buffers
 * so playback starts with zero latency and gracefully falls back if any `.ogg` is absent.
 */

export type RealSoundId =
  | 'engine_idle'
  | 'engine_low'
  | 'engine_mid'
  | 'engine_high'
  | 'engine_limiter'
  | 'engine_off_throttle'
  | 'gear_upshift'
  | 'gear_downshift'
  | 'exhaust_backfire'
  | 'tire_screech'
  | 'kerb_rumble'
  | 'gravel_grass'
  | 'wind_aero'
  | 'collision_carbon';

export const REAL_SOUND_PATHS: Record<RealSoundId, string> = {
  engine_idle: '/audio/engine_idle.ogg',
  engine_low: '/audio/engine_low.ogg',
  engine_mid: '/audio/engine_mid.ogg',
  engine_high: '/audio/engine_high.ogg',
  engine_limiter: '/audio/engine_limiter.ogg',
  engine_off_throttle: '/audio/engine_off_throttle.ogg',
  gear_upshift: '/audio/gear_upshift.ogg',
  gear_downshift: '/audio/gear_downshift.ogg',
  exhaust_backfire: '/audio/exhaust_backfire.ogg',
  tire_screech: '/audio/tire_screech.ogg',
  kerb_rumble: '/audio/kerb_rumble.ogg',
  gravel_grass: '/audio/gravel_grass.ogg',
  wind_aero: '/audio/wind_aero.ogg',
  collision_carbon: '/audio/collision_carbon.ogg',
};

export const REQUIRED_ENGINE_BAND_IDS: RealSoundId[] = [
  'engine_idle',
  'engine_low',
  'engine_mid',
  'engine_high',
  'engine_limiter',
];

export interface F1SoundBank {
  // Real .ogg buffers loaded from /audio/*.ogg
  realSamples: Partial<Record<RealSoundId, AudioBuffer>>;
  realEngineReady: boolean;

  // Synchronous procedural PCM buffers (immediate startup + automatic fallback)
  pinkNoise: AudioBuffer;
  kerbLoop: AudioBuffer;
  skidScrapeLoop: AudioBuffer;
  autodromeIR: AudioBuffer;
  upshiftCuts: AudioBuffer[];
  downshiftClunks: AudioBuffer[];
  downshiftBlips: AudioBuffer[];
  exhaustPops: AudioBuffer[];
  wastegateFlutters: AudioBuffer[];
  drsOpen: AudioBuffer;
  drsClose: AudioBuffer;
  chassisImpacts: AudioBuffer[];
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBufferWithEnvelope(
  ctx: BaseAudioContext,
  durationSec: number,
  render: (t: number, i: number, total: number, rand: () => number) => number,
  seed: number,
): AudioBuffer {
  const len = Math.max(128, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = makeRng(seed);
  const attackSamples = Math.min(64, Math.floor(len * 0.04));
  const releaseSamples = Math.min(240, Math.floor(len * 0.14));

  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    let s = render(t, i, len, rand);
    if (i < attackSamples) {
      s *= i / attackSamples;
    } else if (i > len - releaseSamples) {
      s *= (len - i) / releaseSamples;
    }
    data[i] = Math.max(-1, Math.min(1, s));
  }
  return buf;
}

export function createF1SoundBank(ctx: BaseAudioContext): F1SoundBank {
  const sr = ctx.sampleRate;
  const randBase = makeRng(20261117);

  // 1. Seamless 2.5s circular pink noise buffer
  const noiseLen = Math.floor(sr * 2.5);
  const pinkNoise = ctx.createBuffer(1, noiseLen, sr);
  {
    const data = pinkNoise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    for (let i = 0; i < noiseLen; i++) {
      const white = randBase() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + white * 0.14) * 0.36));
    }
    const xfade = 1024;
    for (let i = 0; i < xfade; i++) {
      const k = i / xfade;
      data[i] = data[i] * k + data[noiseLen - xfade + i] * (1 - k);
    }
  }

  // 2. Seamless Serrated FIA Kerb Loop
  const kerbLen = Math.floor(sr * 0.50);
  const kerbLoop = ctx.createBuffer(1, kerbLen, sr);
  {
    const kData = kerbLoop.getChannelData(0);
    const ridges = 14;
    const ribPeriod = kerbLen / ridges;
    for (let i = 0; i < kerbLen; i++) {
      const ridgeIdx = Math.floor(i / ribPeriod);
      const p = (i % ribPeriod) / ribPeriod;
      const toneVar = 1 + ((ridgeIdx % 3) - 1) * 0.04;
      const subThump = Math.exp(-p * 8.5) * Math.sin(2 * Math.PI * 82 * toneVar * (p / 28));
      const rubberSlap = Math.exp(-p * 18) * Math.sin(2 * Math.PI * 310 * toneVar * (p / 28));
      const grit = (randBase() * 2 - 1) * 0.24 * Math.exp(-p * 11);
      kData[i] = Math.max(-1, Math.min(1, subThump * 0.78 + rubberSlap * 0.38 + grit));
    }
  }

  // 3. Seamless Titanium Skid-Block Spark Scrape Loop
  const skidLen = Math.floor(sr * 0.55);
  const skidScrapeLoop = ctx.createBuffer(1, skidLen, sr);
  {
    const sData = skidScrapeLoop.getChannelData(0);
    let lp = 0;
    let hpPrev = 0;
    for (let i = 0; i < skidLen; i++) {
      const t = i / sr;
      const white = randBase() * 2 - 1;
      lp = lp * 0.65 + white * 0.35;
      const hp = white - lp;
      const ring = Math.sin(2 * Math.PI * 2420 * t) * 0.24 + Math.sin(2 * Math.PI * 3780 * t) * 0.18;
      const gritMod = 0.65 + 0.35 * Math.sin(2 * Math.PI * 42 * t);
      const out = (hp * 0.68 + ring * (0.4 + 0.6 * Math.abs(white))) * gritMod;
      sData[i] = Math.max(-1, Math.min(1, out * 0.85 + hpPrev * 0.15));
      hpPrev = out;
    }
    const xfade = 1024;
    for (let i = 0; i < xfade; i++) {
      const k = i / xfade;
      sData[i] = sData[i] * k + sData[skidLen - xfade + i] * (1 - k);
    }
  }

  // 4. Autódromo Open-Air / Grandstand / Pit-Wall Stereo Impulse Response (1.15s)
  const irLen = Math.floor(sr * 1.15);
  const autodromeIR = ctx.createBuffer(2, irLen, sr);
  {
    for (let ch = 0; ch < 2; ch++) {
      const chData = autodromeIR.getChannelData(ch);
      const chOffset = ch === 0 ? 0.0 : 0.0045;
      for (let i = 0; i < irLen; i++) {
        const t = i / sr;
        const early =
          (Math.abs(t - (0.024 + chOffset)) < 0.0022 ? 0.58 : 0) +
          (Math.abs(t - (0.053 - chOffset * 0.5)) < 0.0028 ? 0.40 : 0) +
          (Math.abs(t - (0.094 + chOffset)) < 0.0035 ? 0.28 : 0) +
          (Math.abs(t - 0.148) < 0.004 ? 0.16 : 0);
        const tail = (randBase() * 2 - 1) * 0.22 * Math.exp(-t * 4.7);
        chData[i] = (tail + early * (randBase() * 2 - 1)) * 0.62;
      }
    }
  }

  // 5. Upshift Seamless Ignition-Cut + Pneumatic Actuator (3 takes)
  const upshiftCuts = [0, 1, 2].map((take) => {
    const baseHz = 115 + take * 11;
    return createBufferWithEnvelope(
      ctx,
      0.092,
      (t, _i, _len, rand) => {
        const thump = Math.exp(-t * 58) * Math.sin(2 * Math.PI * (baseHz - t * 650) * t);
        const actuator = Math.exp(-t * 145) * (Math.sin(2 * Math.PI * 1950 * t) * 0.45 + rand() * 0.55);
        const brap =
          t > 0.022
            ? Math.exp(-(t - 0.022) * 44) *
              Math.tanh(Math.sin(2 * Math.PI * 265 * t) * 1.8 + rand() * 0.55)
            : 0;
        return thump * 0.72 + actuator * 0.48 + brap * 0.55;
      },
      1010 + take * 137,
    );
  });

  // 6. Downshift Dog-Ring Mechanical Clunk (3 takes)
  const downshiftClunks = [0, 1, 2].map((take) => {
    const thudHz = 138 + take * 9;
    return createBufferWithEnvelope(
      ctx,
      0.115,
      (t, _i, _len, rand) => {
        const sub = Math.exp(-t * 36) * Math.sin(2 * Math.PI * (thudHz - t * 520) * t);
        const metallic =
          Math.exp(-t * 92) *
          (Math.sin(2 * Math.PI * (1280 + take * 110) * t) * 0.5 + Math.sin(2 * Math.PI * 2640 * t) * 0.25);
        const grit = Math.exp(-t * 68) * rand() * 0.42;
        return sub * 0.8 + metallic * 0.46 + grit;
      },
      2020 + take * 193,
    );
  });

  // 7. Downshift Pneumatic Auto-Blip Induction Bark (3 takes)
  const downshiftBlips = [0, 1, 2].map((take) => {
    const peakHz = 340 + take * 22;
    return createBufferWithEnvelope(
      ctx,
      0.135,
      (t, _i, _len, rand) => {
        const flareEnv = t < 0.032 ? t / 0.032 : Math.exp(-(t - 0.032) * 26);
        const freq = peakHz * (0.72 + 0.65 * Math.exp(-Math.pow((t - 0.035) / 0.028, 2)));
        const pulse = Math.sin(2 * Math.PI * freq * t) * 0.55 + Math.sin(4 * Math.PI * freq * t) * 0.35;
        const bark = Math.tanh((pulse + rand() * 0.28) * 1.9) * flareEnv;
        return bark * 0.78;
      },
      3030 + take * 211,
    );
  });

  // 8. Exhaust Backfire / Overrun Crackle Pop (4 takes)
  const exhaustPops = [0, 1, 2, 3].map((take) => {
    const bodyHz = 152 + take * 14;
    return createBufferWithEnvelope(
      ctx,
      0.15,
      (t, _i, _len, rand) => {
        const crack = Math.exp(-t * 54) * rand() * 0.78;
        const pipeSub = Math.exp(-t * 27) * Math.sin(2 * Math.PI * Math.max(48, bodyHz - t * 520) * t);
        const flutter = t > 0.035 ? Math.exp(-(t - 0.035) * 32) * rand() * 0.28 : 0;
        return pipeSub * 0.85 + crack + flutter;
      },
      4040 + take * 257,
    );
  });

  // 9. Turbocharger Wastegate Flutter / Compressor Surge (3 takes)
  const wastegateFlutters = [0, 1, 2].map((take) => {
    const chopHz = 15.5 + take * 2.1;
    const carrierHz = 2650 + take * 280;
    return createBufferWithEnvelope(
      ctx,
      0.24,
      (t, _i, _len, rand) => {
        const decay = Math.exp(-t * 10.5);
        const chop = 0.5 + 0.5 * Math.sin(2 * Math.PI * chopHz * t);
        const mod = Math.pow(chop, 1.8);
        const air = Math.sin(2 * Math.PI * (carrierHz - t * 2400) * t) * 0.45 + rand() * 0.55;
        return air * mod * decay * 0.72;
      },
      5050 + take * 307,
    );
  });

  // 10. DRS Wing Flap Actuator (Open / Close)
  const drsOpen = createBufferWithEnvelope(
    ctx,
    0.095,
    (t, _i, _len, rand) => {
      const servo = Math.exp(-t * 28) * Math.sin(2 * Math.PI * (920 + t * 2200) * t) * 0.35;
      const latch = Math.exp(-t * 95) * rand() * 0.42;
      const swoop = Math.sin((t / 0.095) * Math.PI) * rand() * 0.32;
      return servo + latch + swoop;
    },
    6061,
  );

  const drsClose = createBufferWithEnvelope(
    ctx,
    0.075,
    (t, _i, _len, rand) => {
      const thock = Math.exp(-t * 62) * Math.sin(2 * Math.PI * (240 - t * 900) * t) * 0.65;
      const snap = Math.exp(-t * 120) * rand() * 0.48;
      return thock + snap;
    },
    6062,
  );

  // 11. Carbon Chassis / Barrier Impacts (3 takes)
  const chassisImpacts = [0, 1, 2].map((take) => {
    const rootHz = 108 + take * 10;
    return createBufferWithEnvelope(
      ctx,
      0.27,
      (t, _i, _len, rand) => {
        const sub = Math.exp(-t * 18) * Math.sin(2 * Math.PI * Math.max(32, rootHz - t * 250) * t);
        const crunch = Math.exp(-t * 26) * rand() * 0.66;
        const rattle =
          t > 0.03 ? Math.exp(-(t - 0.03) * 20) * Math.sin(2 * Math.PI * 520 * t) * rand() * 0.32 : 0;
        return sub * 0.88 + crunch + rattle;
      },
      7070 + take * 331,
    );
  });

  return {
    realSamples: {},
    realEngineReady: false,
    pinkNoise,
    kerbLoop,
    skidScrapeLoop,
    autodromeIR,
    upshiftCuts,
    downshiftClunks,
    downshiftBlips,
    exhaustPops,
    wastegateFlutters,
    drsOpen,
    drsClose,
    chassisImpacts,
  };
}

/**
 * Fetches and decodes real `.ogg` audio samples from `/audio/*.ogg` into `bank.realSamples`.
 * Safely ignores missing files (including Vite dev server HTML SPA fallbacks) so procedural
 * buffers continue playing seamlessly for any sample not yet added.
 */
export async function loadRealAudioSamples(
  ctx: BaseAudioContext,
  bank: F1SoundBank,
  onProgress?: (loaded: number, total: number, id: RealSoundId) => void,
): Promise<F1SoundBank> {
  if (typeof fetch !== 'function') return bank;

  const entries = Object.entries(REAL_SOUND_PATHS) as [RealSoundId, string][];
  let completed = 0;

  await Promise.all(
    entries.map(async ([id, url]) => {
      try {
        const res = await fetch(url);
        const contentType = res.headers?.get('content-type') ?? '';
        // Skip 404s or Vite SPA index.html fallbacks
        if (!res.ok || contentType.includes('text/html')) {
          return;
        }
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength < 64) return;
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        bank.realSamples[id] = decoded;
      } catch {
        // Sample not present or unsupported format; fallback buffer stays active
      } finally {
        completed += 1;
        onProgress?.(completed, entries.length, id);
      }
    }),
  );

  // Enable 5-band RPM crossfader if at least 3 engine bands are loaded
  const loadedEngineBands = REQUIRED_ENGINE_BAND_IDS.filter((id) => Boolean(bank.realSamples[id]));
  bank.realEngineReady = loadedEngineBands.length >= 3;

  return bank;
}
