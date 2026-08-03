export type CharacterFacing = "front" | "left" | "back" | "right";

/**
 * Generated atlases contain one neutral and one step pose per direction.
 * The engine already advances its walk phase at a gameplay-friendly rate, so
 * applying another multiplier makes the two images flicker like a pendulum.
 */
export const ATLAS_WALK_PHASE_SCALE = 1;
export const ATLAS_WALK_BOB_RATIO = 0.003;
export const ATLAS_WALK_MIN_BOB = 0.35;

export const MOVE_START_MAGNITUDE = 0.16;
export const MOVE_STOP_MAGNITUDE = 0.08;
export const FACING_AXIS_HYSTERESIS = 0.12;
export const FACING_COMPONENT_THRESHOLD = 0.18;

function finitePhase(phase: number): number {
  return Number.isFinite(phase) ? phase : 0;
}

export function atlasWalkSignal(phase: number): number {
  return Math.sin(finitePhase(phase) * ATLAS_WALK_PHASE_SCALE);
}

export function atlasUsesMotionFrame(phase: number): boolean {
  return atlasWalkSignal(phase) > 0;
}

export function atlasWalkBob(phase: number, visualSize: number): number {
  const safeSize =
    Number.isFinite(visualSize) && visualSize > 0 ? visualSize : 0;
  return (
    Math.abs(atlasWalkSignal(phase)) *
    Math.max(ATLAS_WALK_MIN_BOB, safeSize * ATLAS_WALK_BOB_RATIO)
  );
}

/**
 * Separate engage/release thresholds stop a resting thumb from rapidly
 * toggling the neutral and step frames at the edge of the joystick dead zone.
 */
export function movementIsActive(
  magnitude: number,
  wasMoving: boolean
): boolean {
  if (!Number.isFinite(magnitude)) return false;
  return magnitude >
    (wasMoving ? MOVE_STOP_MAGNITUDE : MOVE_START_MAGNITUDE);
}

/**
 * Keep the current facing axis until the other axis clearly dominates.
 * This prevents tiny diagonal joystick changes from swapping independently
 * drawn left/right and front/back atlas cells on consecutive frames.
 */
export function stableFacingForVector(
  current: CharacterFacing,
  x: number,
  y: number
): CharacterFacing {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return current;
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  const currentIsHorizontal =
    current === "left" || current === "right";

  if (currentIsHorizontal) {
    if (
      vertical >= FACING_COMPONENT_THRESHOLD &&
      vertical > horizontal + FACING_AXIS_HYSTERESIS
    ) {
      return y < 0 ? "back" : "front";
    }
    if (horizontal >= FACING_COMPONENT_THRESHOLD) {
      return x < 0 ? "left" : "right";
    }
  } else {
    if (
      horizontal >= FACING_COMPONENT_THRESHOLD &&
      horizontal > vertical + FACING_AXIS_HYSTERESIS
    ) {
      return x < 0 ? "left" : "right";
    }
    if (vertical >= FACING_COMPONENT_THRESHOLD) {
      return y < 0 ? "back" : "front";
    }
  }

  return current;
}
