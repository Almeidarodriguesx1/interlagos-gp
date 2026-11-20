/**
 * Hybrid F1 Audio Sample Bank (Real Public-Library .ogg/.wav Samples + High-Definition Physical PCM Synthesis).
 *
 * 1. Automatically loads real CC0 / Royalty-Free samples from `/audio/*.ogg` (or `.wav`) when present.
 * 2. Synthesizes multi-layered, cinema/sim-grade PCM buffers on AudioContext init() so the game
 *    delivers visceral F1 sound design immediately in the browser with zero external dependencies:
 *    - Sequential gearbox upshift ignition-cut + pneumatic actuator snap + exhaust crack (3 takes)
 *    - Downshift dog-ring clunk + throttle-blip induction roar (3 takes each)
 *    - Exhaust overrun crackle / flame pop (4 takes)
 *    - Turbocharger wastegate compressor flutter ("tsu-tsu-tsu") (3 takes)
 *    - DRS pneumatic wing flap actuator open/close (2 takes)
 *    - Visceral 3-layer serrated FIA kerb rumble loop (suspension thump + carbon plank knock + tire slap)
 *    - Off-track dirt/gravel/grass immersion loop (carbon floor pebble impacts + soil shear + chassis bumps)
 *    - Stick-slip rubber tire screech loop & titanium skid-block spark scrape loop
 *    - Carbon chassis / barrier impact thud (3 takes)
 *    - Stereo Autódromo grandstand/pit-wall impulse response
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
  // Real .ogg/.wav buffers loaded from /audio/*
  realSamples: Partial<Record<RealSoundId, AudioBuffer>>;
  realEngineReady: boolean;

  // Synchronous High-Definition Physical PCM buffers (immediate startup + automatic fallback)
  pinkNoise: AudioBuffer;
  kerbLoop: AudioBuffer;
  gravelLoop: AudioBuffer;
  tireScreechLoop: AudioBuffer;
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

function crossfadeLoop(data: Float32Array, xfadeSamples: number): void {
  const len = data.length;
  const xf = Math.min(xfadeSamples, Math.floor(len * 0.2));
  for (let i = 0; i < xf; i++) {
    const k = i / xf;
    const endSample = data[len - xf + i];
    data[i] = data[i] * k + endSample * (1 - k);
  }
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
  const attackSamples = Math.min(48, Math.floor(len * 0.03));
  const releaseSamples = Math.min(260, Math.floor(len * 0.14));

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
    crossfadeLoop(data, 1024);
  }

  // 2. Visceral 3-Layer Serrated FIA Kerb Loop (0.60s, 16 ridges -> ~26.7 ridges/sec at 1.0x)
  // Models: (A) deep suspension punch, (B) hollow carbon plank knock, (C) slick tire tread slap
  const kerbLen = Math.floor(sr * 0.60);
  const kerbLoop = ctx.createBuffer(1, kerbLen, sr);
  {
    const kData = kerbLoop.getChannelData(0);
    const ridges = 16;
    const ribSamples = kerbLen / ridges;
    for (let i = 0; i < kerbLen; i++) {
      const ridgeIdx = Math.floor(i / ribSamples);
      const localSample = i - ridgeIdx * ribSamples;
      const localT = localSample / sr;
      const p = localSample / ribSamples;
      const toneVar = 1 + ((ridgeIdx % 4) - 1.5) * 0.035;

      // Full-cycle damped 78 Hz suspension punch + pitch drop
      const subFreq = (88 - p * 26) * toneVar;
      const subThump = Math.exp(-p * 6.2) * Math.sin(2 * Math.PI * subFreq * localT);

      // Hollow wooden/titanium skid-plank knock (320 Hz + 540 Hz)
      const plankEnv = Math.exp(-p * 11.5);
      const plankKnock =
        plankEnv *
        (Math.sin(2 * Math.PI * 325 * toneVar * localT) * 0.65 +
          Math.sin(2 * Math.PI * 545 * toneVar * localT) * 0.35);

      // Crisp slick rubber ridge slap
      const rubberSlap =
        Math.exp(-p * 22.0) *
        (Math.sin(2 * Math.PI * 1180 * toneVar * localT) * 0.45 + (randBase() * 2 - 1) * 0.55);

      const raw = subThump * 0.72 + plankKnock * 0.46 + rubberSlap * 0.32;
      kData[i] = Math.max(-1, Math.min(1, Math.tanh(raw * 1.35)));
    }
    crossfadeLoop(kData, 512);
  }

  // 3. Off-Track Dirt / Gravel / Grass Immersion Loop (1.60s)
  // Models: (A) discrete gravel/pebbles pinging against carbon floor & sidepods,
  // (B) coarse soil/grass tire shear crunch, (C) irregular bumpy terrain suspension rumble
  const gravelLen = Math.floor(sr * 1.60);
  const gravelLoop = ctx.createBuffer(1, gravelLen, sr);
  {
    const gData = gravelLoop.getChannelData(0);
    // Pre-schedule ~240 discrete pebble/stone impacts onto the carbon undertray
    const numPebbles = 240;
    const pebbleStarts = new Int32Array(numPebbles);
    const pebbleFreqs = new Float32Array(numPebbles);
    const pebbleAmps = new Float32Array(numPebbles);
    const pebbleDecays = new Float32Array(numPebbles);
    for (let k = 0; k < numPebbles; k++) {
      pebbleStarts[k] = Math.floor(randBase() * (gravelLen - Math.floor(sr * 0.03)));
      pebbleFreqs[k] = 1650 + randBase() * 3900; // Carbon/composite panel ping
      pebbleAmps[k] = 0.16 + randBase() * 0.44;
      pebbleDecays[k] = 180 + randBase() * 260;
    }

    let soilLp = 0;
    let bumpPhase = 0;
    let bumpFreq = 58;
    for (let i = 0; i < gravelLen; i++) {
      const t = i / sr;
      const white = randBase() * 2 - 1;

      // Irregular off-track terrain suspension thumps (45 - 105 Hz)
      if (i % Math.floor(sr * 0.045) === 0) {
        bumpFreq = 46 + randBase() * 58;
      }
      bumpPhase += (2 * Math.PI * bumpFreq) / sr;
      const bumpEnv = 0.55 + 0.45 * Math.sin(2 * Math.PI * 11.5 * t + Math.sin(2 * Math.PI * 3.2 * t));
      const terrainThump = Math.sin(bumpPhase) * bumpEnv * 0.36;

      // Granular dirt/grass tire shear crunch
      soilLp = soilLp * 0.76 + white * 0.24;
      const soilBand = white - soilLp;
      const grainMod = 0.45 + 0.55 * Math.abs(Math.sin(2 * Math.PI * 37 * t + white * 0.35));
      const soilCrunch = soilBand * grainMod * 0.44;

      gData[i] = terrainThump + soilCrunch;
    }

    // Stamp crisp pebble impacts onto carbon floor
    const maxPebbleSamples = Math.floor(sr * 0.024);
    for (let k = 0; k < numPebbles; k++) {
      const start = pebbleStarts[k];
      const f = pebbleFreqs[k];
      const amp = pebbleAmps[k];
      const dec = pebbleDecays[k];
      for (let j = 0; j < maxPebbleSamples && start + j < gravelLen; j++) {
        const dt = j / sr;
        const env = Math.exp(-dt * dec);
        const ping =
          Math.sin(2 * Math.PI * f * dt) * 0.65 +
          Math.sin(2 * Math.PI * (f * 1.47) * dt) * 0.35;
        gData[start + j] += ping * env * amp;
      }
    }

    for (let i = 0; i < gravelLen; i++) {
      gData[i] = Math.max(-1, Math.min(1, Math.tanh(gData[i] * 1.25)));
    }
    crossfadeLoop(gData, 1024);
  }

  // 4. Stick-Slip Rubber Tire Screech Loop (0.90s)
  // Models real rubber tread slip resonance (1.15 kHz + 1.88 kHz + 2.74 kHz micro-chatter)
  const screechLen = Math.floor(sr * 0.90);
  const tireScreechLoop = ctx.createBuffer(1, screechLen, sr);
  {
    const tData = tireScreechLoop.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < screechLen; i++) {
      const t = i / sr;
      const white = randBase() * 2 - 1;
      lp = lp * 0.72 + white * 0.28;
      const hp = white - lp;

      // Rubber block stick-slip harmonic modes with organic frequency wobble
      const wobble = 1 + 0.018 * Math.sin(2 * Math.PI * 19 * t) + 0.011 * Math.sin(2 * Math.PI * 43 * t);
      const chatter = 0.72 + 0.28 * Math.sin(2 * Math.PI * 64 * t + white * 0.25);
      const mode1 = Math.sin(2 * Math.PI * 1160 * wobble * t) * 0.34;
      const mode2 = Math.sin(2 * Math.PI * 1890 * wobble * t) * 0.28;
      const mode3 = Math.sin(2 * Math.PI * 2740 * wobble * t) * 0.16;
      const scrub = hp * 0.42;

      const s = ((mode1 + mode2 + mode3) * chatter + scrub) * 0.88;
      tData[i] = Math.max(-1, Math.min(1, Math.tanh(s * 1.3)));
    }
    crossfadeLoop(tData, 1024);
  }

  // 5. Seamless Titanium Skid-Block Spark Scrape Loop (0.55s)
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
    crossfadeLoop(sData, 1024);
  }

  // 6. Autódromo Open-Air / Grandstand / Pit-Wall Stereo Impulse Response (1.15s)
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

  // 7. F1 Sequential Upshift: Pneumatic Actuator Clack + Torque-Cut Thud + Re-Ignition Exhaust Snap (3 takes)
  const upshiftCuts = [0, 1, 2].map((take) => {
    const baseHz = 112 + take * 12;
    return createBufferWithEnvelope(
      ctx,
      0.145,
      (t, _i, _len, rand) => {
        // Stage 1 (0-25ms): Mechanical dog-ring unload thud + pneumatic solenoid metallic click
        const thump = Math.exp(-t * 46) * Math.sin(2 * Math.PI * (baseHz - t * 480) * t);
        const solenoid =
          Math.exp(-t * 135) *
          (Math.sin(2 * Math.PI * (1820 + take * 140) * t) * 0.55 +
            Math.sin(2 * Math.PI * 3450 * t) * 0.30 +
            rand() * 0.45);

        // Stage 2 (34-145ms): Re-ignition pressure wave "BRAP!" as next gear locks under full load
        const t2 = t - 0.034;
        const brap =
          t2 > 0
            ? Math.exp(-t2 * 28) *
              Math.tanh(
                (Math.sin(2 * Math.PI * (245 + take * 18) * t2) * 0.65 +
                  Math.sin(2 * Math.PI * 490 * t2) * 0.35 +
                  rand() * 0.42) *
                  2.2,
              )
            : 0;

        return Math.tanh((thump * 0.85 + solenoid * 0.62 + brap * 0.78) * 1.3);
      },
      1010 + take * 137,
    );
  });

  // 8. Downshift Sequential Dog-Ring Mechanical Clunk (3 takes)
  const downshiftClunks = [0, 1, 2].map((take) => {
    const thudHz = 132 + take * 11;
    return createBufferWithEnvelope(
      ctx,
      0.15,
      (t, _i, _len, rand) => {
        // Heavy transmission housing punch + double metallic dog-ring engagement snap
        const sub = Math.exp(-t * 30) * Math.sin(2 * Math.PI * (thudHz - t * 460) * t);
        const click1 =
          Math.exp(-t * 110) *
          (Math.sin(2 * Math.PI * (1340 + take * 120) * t) * 0.55 + Math.sin(2 * Math.PI * 2780 * t) * 0.32);
        const tLock = t - 0.026;
        const click2 =
          tLock > 0
            ? Math.exp(-tLock * 95) * Math.sin(2 * Math.PI * (1680 + take * 90) * tLock) * 0.48
            : 0;
        const grit = Math.exp(-t * 58) * rand() * 0.45;
        return Math.tanh((sub * 0.90 + click1 * 0.56 + click2 + grit) * 1.25);
      },
      2020 + take * 193,
    );
  });

  // 9. Downshift Pneumatic Auto-Blip Induction Bark (3 takes)
  const downshiftBlips = [0, 1, 2].map((take) => {
    const peakHz = 360 + take * 24;
    return createBufferWithEnvelope(
      ctx,
      0.165,
      (t, _i, _len, rand) => {
        // Sharp throttle-by-wire rev flare peaking at 38ms then snapping down
        const flareEnv = t < 0.038 ? t / 0.038 : Math.exp(-(t - 0.038) * 21);
        const freq = peakHz * (0.68 + 0.75 * Math.exp(-Math.pow((t - 0.038) / 0.032, 2)));
        const pulse =
          Math.sin(2 * Math.PI * freq * t) * 0.52 +
          Math.sin(4 * Math.PI * freq * t) * 0.36 +
          Math.sin(6 * Math.PI * freq * t) * 0.18;
        const bark = Math.tanh((pulse + rand() * 0.32) * 2.1) * flareEnv;
        return bark * 0.85;
      },
      3030 + take * 211,
    );
  });

  // 10. Exhaust Backfire / Overrun Crackle Pop (4 takes)
  const exhaustPops = [0, 1, 2, 3].map((take) => {
    const bodyHz = 148 + take * 16;
    return createBufferWithEnvelope(
      ctx,
      0.175,
      (t, _i, _len, rand) => {
        const crack = Math.exp(-t * 48) * rand() * 0.84;
        const pipeSub = Math.exp(-t * 24) * Math.sin(2 * Math.PI * Math.max(46, bodyHz - t * 480) * t);
        const secondaryPop =
          t > 0.042
            ? Math.exp(-(t - 0.042) * 36) *
              (Math.sin(2 * Math.PI * (110 + take * 12) * t) * 0.45 + rand() * 0.45)
            : 0;
        return Math.tanh((pipeSub * 0.90 + crack + secondaryPop * 0.65) * 1.25);
      },
      4040 + take * 257,
    );
  });

  // 11. Turbocharger Wastegate Flutter / Compressor Surge (3 takes)
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

  // 12. DRS Wing Flap Actuator (Open / Close)
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

  // 13. Carbon Chassis / Barrier Impacts (3 takes)
  const chassisImpacts = [0, 1, 2].map((take) => {
    const rootHz = 104 + take * 10;
    return createBufferWithEnvelope(
      ctx,
      0.28,
      (t, _i, _len, rand) => {
        const sub = Math.exp(-t * 16) * Math.sin(2 * Math.PI * Math.max(30, rootHz - t * 240) * t);
        const crunch = Math.exp(-t * 24) * rand() * 0.72;
        const rattle =
          t > 0.03 ? Math.exp(-(t - 0.03) * 19) * Math.sin(2 * Math.PI * 520 * t) * rand() * 0.36 : 0;
        return Math.tanh((sub * 0.92 + crunch + rattle) * 1.25);
      },
      7070 + take * 331,
    );
  });

  return {
    realSamples: {},
    realEngineReady: false,
    pinkNoise,
    kerbLoop,
    gravelLoop,
    tireScreechLoop,
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
 * Fetches and decodes real `.ogg` (or `.wav`) audio samples from `/audio/*` into `bank.realSamples`.
 * Safely ignores missing files (including Vite dev server HTML SPA fallbacks) so high-definition
 * physical buffers continue playing seamlessly for any sample not yet added.
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
    entries.map(async ([id, oggUrl]) => {
      const candidateUrls = [oggUrl, oggUrl.replace(/\.ogg$/i, '.wav')];
      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          const contentType = res.headers?.get('content-type') ?? '';
          if (!res.ok || contentType.includes('text/html')) {
            continue;
          }
          const arrayBuffer = await res.arrayBuffer();
          if (arrayBuffer.byteLength < 64) continue;
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          bank.realSamples[id] = decoded;
          break;
        } catch {
          // Try next extension or keep physical PCM buffer
        }
      }
      completed += 1;
      onProgress?.(completed, entries.length, id);
    }),
  );

  // Enable 5-band RPM crossfader if at least 3 engine bands are loaded
  const loadedEngineBands = REQUIRED_ENGINE_BAND_IDS.filter((id) => Boolean(bank.realSamples[id]));
  bank.realEngineReady = loadedEngineBands.length >= 3;

  return bank;
}
