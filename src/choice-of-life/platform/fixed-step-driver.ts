import { LOGICAL_TICK_MICROSECONDS, MAX_FRAME_STEPS } from "../core/stage-clock";

export type RuntimePauseReason = "visibility" | "blur" | "user" | "modal";

export interface FixedStepFrameResult {
  readonly logicalSteps: number;
  readonly droppedLogicalSteps: number;
}

export interface FixedStepDriver {
  advanceFrame(timestampMilliseconds: number): FixedStepFrameResult;
  setPauseReason(reason: RuntimePauseReason, active: boolean): void;
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
      const changed = active ? !pauseReasons.has(reason) : pauseReasons.has(reason);
      if (!changed) return;
      if (active) pauseReasons.add(reason);
      else pauseReasons.delete(reason);
      resetClock();
    },
    isPaused(): boolean {
      return pauseReasons.size > 0;
    },
    reset: resetClock,
  };
}
