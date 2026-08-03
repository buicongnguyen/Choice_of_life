export const LOGICAL_TICK_MICROSECONDS = 20_000;
export const LOGICAL_TICK_MILLISECONDS = 20;
export const LANE_TWEEN_TICKS = 11;
export const MAX_FRAME_STEPS = 5;

export type StageClockPhase = "shell" | "active" | "settling" | "complete";

export interface StageClock {
  readonly phase: StageClockPhase;
  readonly activeTicks: number;
  readonly durationTicks: number;
}

function assertSafeNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function isStageClockPhase(value: string): value is StageClockPhase {
  return (
    value === "shell" ||
    value === "active" ||
    value === "settling" ||
    value === "complete"
  );
}

export function assertStageClock(clock: StageClock): void {
  if (!isStageClockPhase(clock.phase)) {
    throw new TypeError("stage clock phase is invalid");
  }
  assertSafeNonnegativeInteger(clock.activeTicks, "active ticks");
  assertSafeNonnegativeInteger(clock.durationTicks, "duration ticks");
  if (clock.phase === "shell" && clock.durationTicks !== 0) {
    throw new RangeError("shell stage clock must have zero duration ticks");
  }
  if (clock.phase !== "shell" && clock.durationTicks === 0) {
    throw new RangeError("playable stage clock must have positive duration ticks");
  }
  if (clock.activeTicks > clock.durationTicks) {
    throw new RangeError("active ticks cannot exceed duration ticks");
  }
  if (clock.phase === "shell" && clock.activeTicks !== 0) {
    throw new RangeError("shell stage clock must start at zero ticks");
  }
  if (
    (clock.phase === "settling" || clock.phase === "complete") &&
    clock.activeTicks !== clock.durationTicks
  ) {
    throw new RangeError(
      `${clock.phase} stage clock must be at its duration boundary`,
    );
  }
  if (clock.phase === "active" && clock.activeTicks >= clock.durationTicks) {
    throw new RangeError("active stage clock must be before its duration boundary");
  }
}

export function createStageClock(clock: StageClock): StageClock {
  assertStageClock(clock);
  return Object.freeze({
    phase: clock.phase,
    activeTicks: clock.activeTicks,
    durationTicks: clock.durationTicks,
  });
}

export function stepStageClock(clock: StageClock): StageClock {
  assertStageClock(clock);
  if (clock.phase !== "active") {
    return createStageClock(clock);
  }

  const activeTicks = clock.activeTicks + 1;
  if (!Number.isSafeInteger(activeTicks)) {
    throw new RangeError("active tick overflow");
  }
  return Object.freeze({
    phase: activeTicks === clock.durationTicks ? "settling" : "active",
    activeTicks,
    durationTicks: clock.durationTicks,
  });
}
