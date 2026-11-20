/**
 * Self-contained AudioWorkletProcessor synthesized via Blob URL (zero-404).
 * Models a 90-degree 1.6L V6 Turbo Hybrid power unit off the main thread:
 * - Dual cylinder bank exhaust collector phase dispersion (left bank vs right bank)
 * - Asymmetric cylinder combustion blowdown pressure pulse + Helmholtz exhaust header resonance
 * - Dynamic auto-blip RPM surge on downshifts + smooth per-sample slew to eliminate zipper noise
 * - Cylinder-selective soft-cut rev limiter misfires & off-throttle overrun burble
 */
const WORKLET_SOURCE = `
class F1V6CombustionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 4000, minValue: 1800, maxValue: 15500, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'limiter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'onboard', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'tcCut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'blipRpm', defaultValue: 0, minValue: 0, maxValue: 4000, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.phaseA = 0;
    this.phaseB = 0.508;
    this.crankPhase = 0;
    this.cylinderIdx = 0;
    this.cylGainA = 1.0;
    this.cylGainB = 0.98;
    this.smoothedRpm = 4000;
    this.smoothedThr = 0;
    this.smoothedLoad = 0.4;
    this.dcPrevIn = 0;
    this.dcPrevOut = 0;
    this.lpState = 0;
    // 2-pole resonant exhaust collector chamber state
    this.resY1 = 0;
    this.resY2 = 0;
    this.overrunTimer = 0;
    this.overrunEnv = 0;
    this.seed = 91827364;
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  // Asymmetric combustion pressure pulse in phase p in [0, 1)
  evalBankPulse(p, throttle, load) {
    const rise = p < 0.09 ? (p / 0.09) : 1.0;
    const fallRate = 4.4 - throttle * 1.55 - load * 0.45;
    const blowdown = rise * Math.exp(-Math.max(0, p - 0.035) * fallRate);

    // Exhaust header standing-wave harmonics (1st through 5th firing order)
    const twoPiP = p * 6.28318530718;
    const h1 = Math.sin(twoPiP);
    const h2 = Math.sin(twoPiP * 2.0 + 0.35) * (0.46 + throttle * 0.30);
    const h3 = Math.sin(twoPiP * 3.0 - 0.2) * (0.24 + throttle * 0.28);
    const h4 = Math.sin(twoPiP * 4.0 + 0.15) * (0.12 + throttle * 0.18);
    const h5 = Math.sin(twoPiP * 5.0 - 0.1) * (0.05 + throttle * 0.10);

    return blowdown * (0.64 + 0.36 * throttle) + (h1 * 0.32 + h2 + h3 + h4 + h5) * 0.46;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const ch0 = output[0];

    const baseRpm = parameters.rpm.length > 0 ? parameters.rpm[0] : 4000;
    const blipRpm = parameters.blipRpm && parameters.blipRpm.length > 0 ? parameters.blipRpm[0] : 0;
    const targetRpm = baseRpm + blipRpm;
    const targetThr = Math.max(
      parameters.throttle.length > 0 ? parameters.throttle[0] : 0,
      blipRpm > 120 ? 0.88 : 0
    );
    const limiter = parameters.limiter.length > 0 ? parameters.limiter[0] : 0;
    const targetLoad = parameters.load.length > 0 ? parameters.load[0] : 0.4;
    const onboard = parameters.onboard.length > 0 ? parameters.onboard[0] : 1;
    const tcCut = parameters.tcCut.length > 0 ? parameters.tcCut[0] : 0;

    const dt = 1 / sampleRate;
    const slew = 1 - Math.exp(-dt * 280);

    for (let i = 0; i < ch0.length; i++) {
      this.smoothedRpm += (targetRpm - this.smoothedRpm) * slew;
      this.smoothedThr += (targetThr - this.smoothedThr) * slew;
      this.smoothedLoad += (targetLoad - this.smoothedLoad) * slew;

      // 4-stroke V6 firing frequency = (RPM / 60) * 3; crank order = RPM / 60
      const fireHz = Math.max(75, (this.smoothedRpm / 60) * 3.0);
      const bankHz = fireHz * 0.5;
      const bankInc = bankHz * dt;
      const crankInc = (this.smoothedRpm / 60) * dt;

      this.phaseA += bankInc;
      this.phaseB += bankInc * 1.0022;
      this.crankPhase += crankInc;

      if (this.phaseA >= 1) {
        this.phaseA -= 1;
        this.cylinderIdx = (this.cylinderIdx + 1) % 6;
        const bias = (this.cylinderIdx % 3 === 0) ? 1.07 : 0.95;
        this.cylGainA = bias + this.nextRand() * 0.065;
      }
      if (this.phaseB >= 1) {
        this.phaseB -= 1;
        this.cylGainB = 0.99 + this.nextRand() * 0.065;
      }
      if (this.crankPhase >= 1) {
        this.crankPhase -= 1;
      }

      let bankA = this.evalBankPulse(this.phaseA, this.smoothedThr, this.smoothedLoad) * this.cylGainA;
      let bankB = this.evalBankPulse(this.phaseB, this.smoothedThr, this.smoothedLoad) * this.cylGainB;

      if (limiter > 0.5) {
        const dropA = (this.cylinderIdx === 1 || this.cylinderIdx === 4);
        const dropB = (this.cylinderIdx === 2 || this.cylinderIdx === 5);
        if (dropA) bankA *= 0.12;
        if (dropB) bankB *= 0.16;
      } else if (tcCut > 0.5 && (this.cylinderIdx === 2 || this.cylinderIdx === 5)) {
        bankA *= 0.52;
        bankB *= 0.42;
      }

      const crankFund = Math.sin(this.crankPhase * 6.28318530718);
      const halfCrank = Math.sin(this.crankPhase * 3.14159265359);
      const airboxSuck = this.nextRand() * (0.035 + this.smoothedThr * 0.11) * (0.45 + 0.55 * onboard);

      // Stochastic overrun exhaust burble on high-RPM coasting
      let burble = 0;
      if (this.smoothedThr < 0.08 && this.smoothedRpm > 7200) {
        this.overrunTimer -= dt;
        if (this.overrunTimer <= 0) {
          this.overrunTimer = 0.042 + (this.nextRand() * 0.5 + 0.5) * 0.13;
          if (this.nextRand() > -0.30) {
            this.overrunEnv = 0.42 + (this.nextRand() * 0.5 + 0.5) * 0.48;
          }
        }
        this.overrunEnv *= Math.exp(-dt * 38);
        burble = this.overrunEnv * this.nextRand() * (0.72 - onboard * 0.26);
      } else {
        this.overrunEnv = 0;
      }

      let raw =
        (bankA + bankB) * 0.48 +
        crankFund * (0.25 + this.smoothedLoad * 0.16) +
        halfCrank * (0.16 + onboard * 0.07) +
        airboxSuck +
        burble;

      // Exhaust collector pipe Helmholtz resonance (eliminates flat synthesizer timbre)
      const resHz = Math.min(2800, fireHz * 2.15 + 140);
      const omega = 6.28318530718 * resHz * dt;
      const r = 0.88;
      const c1 = 2 * r * Math.cos(omega);
      const c2 = r * r;
      const resOut = (1 - r) * raw + c1 * this.resY1 - c2 * this.resY2;
      this.resY2 = this.resY1;
      this.resY1 = resOut;
      raw = raw * 0.68 + resOut * 0.52;

      // Asymmetrical exhaust manifold saturation
      const drive = 1.35 + this.smoothedThr * 1.55 + this.smoothedLoad * 0.38;
      raw = Math.tanh(raw * drive);

      // Collector anti-aliasing 1-pole lowpass scaled dynamically by RPM & perspective
      const lpCutoff = 3400 + (this.smoothedRpm / 13000) * 6200 + (1 - onboard) * 1600;
      const lpAlpha = Math.min(0.90, (6.2831853 * lpCutoff * dt) / (1 + 6.2831853 * lpCutoff * dt));
      this.lpState += (raw - this.lpState) * lpAlpha;

      // DC blocker
      const hp = this.lpState - this.dcPrevIn + 0.996 * this.dcPrevOut;
      this.dcPrevIn = this.lpState;
      this.dcPrevOut = hp;

      ch0[i] = Math.max(-0.98, Math.min(0.98, hp * 0.78));
    }

    for (let c = 1; c < output.length; c++) {
      output[c].set(ch0);
    }
    return true;
  }
}

registerProcessor('f1-v6-combustion', F1V6CombustionProcessor);
`;

export function createCombustionWorkletBlobUrl(): string {
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}