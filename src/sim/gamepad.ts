import type { ControlInputs } from './types';

export interface RawGamepadButton {
  pressed: boolean;
  value: number;
}

export interface RawGamepadState {
  id: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly RawGamepadButton[];
}

export interface GamepadEdgeState {
  drsPrev: boolean;
  cameraPrev: boolean;
  pausePrev: boolean;
  racingLinePrev: boolean;
}

export interface GamepadMappedResult {
  inputs: ControlInputs;
  cameraCycleJustPressed: boolean;
  pauseJustPressed: boolean;
  racingLineToggleJustPressed: boolean;
  anyActiveInput: boolean;
}

export function createGamepadEdgeState(): GamepadEdgeState {
  return {
    drsPrev: false,
    cameraPrev: false,
    pausePrev: false,
    racingLinePrev: false,
  };
}

/**
 * Applies symmetric inner deadzone and smooth non-linear response curve
 * so analog thumbsticks have fine precision on straights and full lock in hairpins.
 */
export function applySteeringCurve(rawAxis: number, deadzone = 0.08): number {
  const absVal = Math.abs(rawAxis);
  if (absVal <= deadzone) return 0;
  const norm = Math.min(1, (absVal - deadzone) / (1 - deadzone));
  const curved = Math.pow(norm, 1.35);
  return -Math.sign(rawAxis) * curved;
}

function btnVal(buttons: readonly RawGamepadButton[], index: number): number {
  const b = buttons[index];
  if (!b) return 0;
  if (typeof b.value === 'number' && b.value > 0) return Math.min(1, b.value);
  return b.pressed ? 1 : 0;
}

function btnPressed(buttons: readonly RawGamepadButton[], index: number): boolean {
  const b = buttons[index];
  return Boolean(b && (b.pressed || (b.value ?? 0) > 0.5));
}

/**
 * Pure deterministic mapper from Standard Web Gamepad API state to F1 ControlInputs + utility edge actions.
 * Layout (Xbox / PlayStation / Generic XInput Standard):
 * - Left Stick X / D-Pad Left-Right: Steering
 * - RT (7) or A/Cross (0): Throttle
 * - LT (6) or X/Square (2): Brake / Reverse
 * - B/Circle (1) or LB (4): ERS Boost
 * - Y/Triangle (3) or RB (5): Toggle DRS
 * - Select/View (8): Cycle Camera
 * - Start/Menu (9): Pause / Resume
 * - D-Pad Up (12): Toggle Dashed Racing Line
 */
export function mapGamepadState(
  pad: RawGamepadState,
  edge: GamepadEdgeState,
): GamepadMappedResult {
  const stickSteer = applySteeringCurve(pad.axes[0] ?? 0, 0.08);
  const dpadLeft = btnPressed(pad.buttons, 14) ? 1 : 0;
  const dpadRight = btnPressed(pad.buttons, 15) ? 1 : 0;
  const dpadSteer = dpadLeft - dpadRight;
  const steer = Math.abs(dpadSteer) > Math.abs(stickSteer) ? dpadSteer : stickSteer;

  const rt = btnVal(pad.buttons, 7);
  const aBtn = btnPressed(pad.buttons, 0) ? 1 : 0;
  const throttle = Math.max(rt, aBtn);

  const lt = btnVal(pad.buttons, 6);
  const xBtn = btnPressed(pad.buttons, 2) ? 1 : 0;
  const brake = Math.max(lt, xBtn);

  const ersBoost = btnPressed(pad.buttons, 1) || btnPressed(pad.buttons, 4);

  const drsNow = btnPressed(pad.buttons, 3) || btnPressed(pad.buttons, 5);
  const drsToggleJustPressed = drsNow && !edge.drsPrev;
  edge.drsPrev = drsNow;

  const camNow = btnPressed(pad.buttons, 8);
  const cameraCycleJustPressed = camNow && !edge.cameraPrev;
  edge.cameraPrev = camNow;

  const pauseNow = btnPressed(pad.buttons, 9);
  const pauseJustPressed = pauseNow && !edge.pausePrev;
  edge.pausePrev = pauseNow;

  const lineNow = btnPressed(pad.buttons, 12);
  const racingLineToggleJustPressed = lineNow && !edge.racingLinePrev;
  edge.racingLinePrev = lineNow;

  const anyActiveInput =
    Math.abs(steer) > 0.01 ||
    throttle > 0.05 ||
    brake > 0.05 ||
    ersBoost ||
    drsToggleJustPressed ||
    cameraCycleJustPressed ||
    pauseJustPressed ||
    racingLineToggleJustPressed;

  return {
    inputs: {
      throttle,
      brake,
      steer,
      ersBoost,
      drsToggleJustPressed,
    },
    cameraCycleJustPressed,
    pauseJustPressed,
    racingLineToggleJustPressed,
    anyActiveInput,
  };
}
