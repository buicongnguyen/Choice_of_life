import { LOGICAL_TICK_MICROSECONDS, MAX_FRAME_STEPS } from "../core/stage-clock";

export const RUNTIME_PAUSE_REASON_ORDER = Object.freeze([
  "visibility",
  "focus-interruption",
  "user",
  "modal",
  "semantic",
] as const);

export type RuntimePauseReason =
  (typeof RUNTIME_PAUSE_REASON_ORDER)[number];

export interface FixedStepFrameResult {
  readonly logicalSteps: number;
  readonly droppedLogicalSteps: number;
}

export interface FixedStepDriver {
  advanceFrame(timestampMilliseconds: number): FixedStepFrameResult;
  setPauseReason(reason: RuntimePauseReason, active: boolean): void;
  activePauseReasons(): readonly RuntimePauseReason[];
  isPaused(): boolean;
  reset(): void;
}

const FLOATING_POINT_TOLERANCE_MICROSECONDS = 1e-7;

export function createFixedStepDriver(): FixedStepDriver {
  const pauseReasons = new Set<RuntimePauseReason>();
  let previousTimestampMilliseconds: number | null = null;
  let accumulatorMicroseconds = 0;

  const resetClock = (): void => {
    previousTimestampMilliseconds = null;
    accumulatorMicroseconds = 0;
  };

  return {
    advanceFrame(timestampMilliseconds: number): FixedStepFrameResult {
      if (!Number.isFinite(timestampMilliseconds) || timestampMilliseconds < 0) {
        throw new TypeError("Frame timestamp must be a finite non-negative number");
      }
      if (pauseReasons.size > 0) {
        previousTimestampMilliseconds = timestampMilliseconds;
        accumulatorMicroseconds = 0;
        return { logicalSteps: 0, droppedLogicalSteps: 0 };
      }
      if (previousTimestampMilliseconds === null || timestampMilliseconds < previousTimestampMilliseconds) {
        previousTimestampMilliseconds = timestampMilliseconds;
        accumulatorMicroseconds = 0;
        return { logicalSteps: 0, droppedLogicalSteps: 0 };
      }
      const elapsedMicroseconds = (timestampMilliseconds - previousTimestampMilliseconds) * 1_000;
      previousTimestampMilliseconds = timestampMilliseconds;
      accumulatorMicroseconds += elapsedMicroseconds;
      const availableSteps = Math.floor(
        (accumulatorMicroseconds + FLOATING_POINT_TOLERANCE_MICROSECONDS) /
          LOGICAL_TICK_MICROSECONDS,
      );
      const logicalSteps = Math.min(availableSteps, MAX_FRAME_STEPS);
      const droppedLogicalSteps = Math.max(0, availableSteps - logicalSteps);
      if (droppedLogicalSteps > 0) {
        accumulatorMicroseconds %= LOGICAL_TICK_MICROSECONDS;
      } else {
        accumulatorMicroseconds -= logicalSteps * LOGICAL_TICK_MICROSECONDS;
      }
      if (Math.abs(accumulatorMicroseconds) < FLOATING_POINT_TOLERANCE_MICROSECONDS) {
        accumulatorMicroseconds = 0;
      }
      return { logicalSteps, droppedLogicalSteps };
    },
    setPauseReason(reason: RuntimePauseReason, active: boolean): void {
      if (!RUNTIME_PAUSE_REASON_ORDER.includes(reason)) {
        throw new TypeError("Runtime pause reason is unsupported");
      }
      if (typeof active !== "boolean") {
        throw new TypeError("Runtime pause state must be a boolean");
      }
      const changed = active ? !pauseReasons.has(reason) : pauseReasons.has(reason);
      if (!changed) return;
      if (active) pauseReasons.add(reason);
      else pauseReasons.delete(reason);
      resetClock();
    },
    activePauseReasons(): readonly RuntimePauseReason[] {
      return Object.freeze(
        RUNTIME_PAUSE_REASON_ORDER.filter((reason) =>
          pauseReasons.has(reason)),
      );
    },
    isPaused(): boolean {
      return pauseReasons.size > 0;
    },
    reset: resetClock,
  };
}
