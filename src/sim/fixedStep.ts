export const PHYSICS_HZ = 180;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
export const MAX_PHYSICS_STEPS = 18; // Covers 100 ms (10 FPS), including software rendering; bounds stall recovery.

/** Scalar accumulator: no allocations per frame, with explicit discarded-time accounting. */
export class FixedStepClock {
  private remainder = 0;
  droppedSeconds = 0;
  totalSteps = 0;
  advance(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    const available = this.remainder + seconds;
    const fullSteps = Math.floor((available + 1e-12) / PHYSICS_DT);
    const steps = Math.min(MAX_PHYSICS_STEPS, fullSteps);
    this.droppedSeconds += Math.max(0, fullSteps - steps) * PHYSICS_DT;
    this.remainder = Math.max(0, available - fullSteps * PHYSICS_DT);
    this.totalSteps += steps;
    return steps;
  }
  get alpha(): number { return Math.min(1, this.remainder / PHYSICS_DT); }
}
