import { describe, expect, it } from "vitest";

import {
  createStageClock,
  LANE_TWEEN_TICKS,
  LOGICAL_TICK_MICROSECONDS,
  LOGICAL_TICK_MILLISECONDS,
  MAX_FRAME_STEPS,
  stepStageClock,
} from "./stage-clock";

describe("stage clock", () => {
  it("locks the exact fixed-step constants", () => {
    expect(LOGICAL_TICK_MICROSECONDS).toBe(20_000);
    expect(LOGICAL_TICK_MILLISECONDS).toBe(20);
    expect(LANE_TWEEN_TICKS * LOGICAL_TICK_MILLISECONDS).toBe(220);
    expect(MAX_FRAME_STEPS).toBe(5);
  });

  it("advances exactly one logical tick without mutating input", () => {
    const clock = createStageClock({
      phase: "active",
      activeTicks: 4,
      durationTicks: 10,
    });
    const next = stepStageClock(clock);
    expect(next).toEqual({
      phase: "active",
      activeTicks: 5,
      durationTicks: 10,
    });
    expect(clock.activeTicks).toBe(4);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("enters settling exactly at the duration boundary", () => {
    expect(
      stepStageClock({
        phase: "active",
        activeTicks: 9,
        durationTicks: 10,
      }),
    ).toEqual({ phase: "settling", activeTicks: 10, durationTicks: 10 });
  });

  it.each(["shell", "settling", "complete"] as const)(
    "does not advance a %s clock",
    (phase) => {
      const activeTicks = phase === "shell" ? 0 : 10;
      const durationTicks = phase === "shell" ? 0 : 10;
      expect(stepStageClock({ phase, activeTicks, durationTicks })).toEqual({
        phase,
        activeTicks,
        durationTicks,
      });
    },
  );

  it("rejects invalid ticks and impossible phase combinations", () => {
    expect(() =>
      stepStageClock({ phase: "active", activeTicks: -1, durationTicks: 10 }),
    ).toThrow();
    expect(() =>
      stepStageClock({ phase: "active", activeTicks: 10, durationTicks: 10 }),
    ).toThrow("before");
    expect(() =>
      stepStageClock({ phase: "settling", activeTicks: 9, durationTicks: 10 }),
    ).toThrow("duration boundary");
    expect(() =>
      stepStageClock({ phase: "shell", activeTicks: 0, durationTicks: 10 }),
    ).toThrow("zero duration");
  });
});
