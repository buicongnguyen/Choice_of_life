import { describe, expect, it } from "vitest";

import { stepStageClock, type StageClock } from "../core/stage-clock";
import { RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "../core/catalog";
import { decodeRunState, encodeRunState } from "../core/run-state-codec";
import { createMaximalRunStateFixture } from "../core/run-state-fixtures";
import { stateHashV1 } from "../core/run-state-hash";
import type { RunStateV1 } from "../core/run-state";
import { createFixedStepDriver, type RuntimePauseReason } from "./fixed-step-driver";

function runAtRate(hertz: 50 | 60 | 120, durationMilliseconds = 1_200): StageClock {
  const driver = createFixedStepDriver();
  let clock: StageClock = { phase: "active", activeTicks: 0, durationTicks: 1_000 };
  const frames = (durationMilliseconds * hertz) / 1_000;
  for (let frame = 0; frame <= frames; frame += 1) {
    const result = driver.advanceFrame((frame * 1_000) / hertz);
    for (let step = 0; step < result.logicalSteps; step += 1) clock = stepStageClock(clock);
  }
  return clock;
}

describe("fixed-step browser driver", () => {
  it("produces identical logical state at 50, 60, and 120 Hz", () => {
    const states = [runAtRate(50), runAtRate(60), runAtRate(120)];
    expect(states).toEqual([
      { phase: "active", activeTicks: 60, durationTicks: 1_000 },
      { phase: "active", activeTicks: 60, durationTicks: 1_000 },
      { phase: "active", activeTicks: 60, durationTicks: 1_000 },
    ]);
  });

  it("runs at most five steps and drops long-frame backlog", () => {
    const driver = createFixedStepDriver();
    expect(driver.advanceFrame(0)).toEqual({ logicalSteps: 0, droppedLogicalSteps: 0 });
    expect(driver.advanceFrame(1_000)).toEqual({ logicalSteps: 5, droppedLogicalSteps: 45 });
    expect(driver.advanceFrame(1_020)).toEqual({ logicalSteps: 1, droppedLogicalSteps: 0 });
  });

  it("tracks independent pause reasons and resets on every transition", () => {
    const driver = createFixedStepDriver();
    driver.advanceFrame(0);
    expect(driver.advanceFrame(19).logicalSteps).toBe(0);
    driver.setPauseReason("blur", true);
    expect(driver.advanceFrame(1_000).logicalSteps).toBe(0);
    driver.setPauseReason("modal", true);
    driver.setPauseReason("blur", false);
    expect(driver.isPaused()).toBe(true);
    expect(driver.advanceFrame(2_000).logicalSteps).toBe(0);
    driver.setPauseReason("modal", false);
    expect(driver.isPaused()).toBe(false);
    expect(driver.advanceFrame(3_000).logicalSteps).toBe(0);
    expect(driver.advanceFrame(3_020).logicalSteps).toBe(1);
  });

  it("keeps independently created drivers isolated", () => {
    const first = createFixedStepDriver();
    const second = createFixedStepDriver();
    first.advanceFrame(0);
    second.advanceFrame(0);
    expect(first.advanceFrame(100)).toEqual({ logicalSteps: 5, droppedLogicalSteps: 0 });
    expect(second.advanceFrame(20)).toEqual({ logicalSteps: 1, droppedLogicalSteps: 0 });
  });

  it("replays the same seed, snapshot, and ordered inputs across separate drivers", () => {
    interface TraceState {
      readonly seed: string;
      readonly snapshot: string;
      readonly tick: number;
      readonly lane: 0 | 1 | 2;
      readonly inputCursor: number;
      readonly acceptedInputs: readonly string[];
    }
    const inputs = [
      { tick: 1, direction: "up" as const },
      { tick: 3, direction: "up" as const },
      { tick: 5, direction: "down" as const },
      { tick: 7, direction: "down" as const },
    ];
    const initial = (): TraceState => ({
      seed: "000000000000002a",
      snapshot: "runner-lab-entry-v1",
      tick: 0,
      lane: 1,
      inputCursor: 0,
      acceptedInputs: [],
    });
    const advance = (state: TraceState, steps: number): TraceState => {
      let next = state;
      for (let step = 0; step < steps; step += 1) {
        const tick = next.tick + 1;
        let lane = next.lane;
        let inputCursor = next.inputCursor;
        const acceptedInputs = [...next.acceptedInputs];
        const input = inputs[inputCursor];
        if (input?.tick === tick) {
          lane = Math.max(0, Math.min(2, lane + (input.direction === "up" ? 1 : -1))) as 0 | 1 | 2;
          acceptedInputs.push(`${tick}:${input.direction}:${lane}`);
          inputCursor += 1;
        }
        next = { ...next, tick, lane, inputCursor, acceptedInputs };
      }
      return next;
    };
    const replay = (driver: ReturnType<typeof createFixedStepDriver>): TraceState => {
      let state = initial();
      for (const timestamp of [0, 20, 40, 60, 80, 100, 120, 140, 160]) {
        state = advance(state, driver.advanceFrame(timestamp).logicalSteps);
      }
      return state;
    };
    const first = replay(createFixedStepDriver());
    const second = replay(createFixedStepDriver());
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      seed: "000000000000002a",
      snapshot: "runner-lab-entry-v1",
      tick: 8,
      lane: 0,
      inputCursor: inputs.length,
    });
    expect(first.acceptedInputs).toEqual(["1:up:2", "3:up:2", "5:down:1", "7:down:0"]);
    const stateFromTrace = (trace: TraceState): RunStateV1 => {
      const base = createMaximalRunStateFixture();
      if (base.runner === null) throw new Error("Missing runner fixture");
      return {
        ...base,
        simulationTick: base.simulationTick + trace.tick,
        stage: { ...base.stage, activeTicks: base.stage.activeTicks + trace.tick },
        runner: {
          ...base.runner,
          motion: {
            kind: "idle",
            currentLane: trace.lane,
            sourceLane: trace.lane,
            targetLane: trace.lane,
            elapsedTicks: 0,
            totalTicks: 11,
          },
          inputBuffer: null,
        },
      };
    };
    const firstRunState = stateFromTrace(first);
    const secondRunState = stateFromTrace(second);
    expect(stateHashV1(firstRunState)).toBe(stateHashV1(secondRunState));
    expect(decodeRunState(encodeRunState(firstRunState), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ kind: "ready" });
  });

  it("continues identically after an encode/decode boundary", () => {
    const advanceState = (state: RunStateV1, steps: number): RunStateV1 => ({
      ...state,
      simulationTick: state.simulationTick + steps,
      stage: { ...state.stage, activeTicks: state.stage.activeTicks + steps },
    });
    const runFrame = (state: RunStateV1, driver: ReturnType<typeof createFixedStepDriver>, timestamp: number): RunStateV1 =>
      advanceState(state, driver.advanceFrame(timestamp).logicalSteps);

    const uninterruptedDriver = createFixedStepDriver();
    let uninterrupted = createMaximalRunStateFixture();
    uninterrupted = runFrame(uninterrupted, uninterruptedDriver, 0);
    uninterrupted = runFrame(uninterrupted, uninterruptedDriver, 100);
    uninterrupted = runFrame(uninterrupted, uninterruptedDriver, 200);

    const firstDriver = createFixedStepDriver();
    let resumed = createMaximalRunStateFixture();
    resumed = runFrame(resumed, firstDriver, 0);
    resumed = runFrame(resumed, firstDriver, 100);
    const decoded = decodeRunState(encodeRunState(resumed), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    resumed = decoded.state;
    const secondDriver = createFixedStepDriver();
    resumed = runFrame(resumed, secondDriver, 100);
    resumed = runFrame(resumed, secondDriver, 200);

    expect(resumed).toEqual(uninterrupted);
    expect(stateHashV1(resumed)).toBe(stateHashV1(uninterrupted));
  });

  it.each(["visibility", "blur", "user", "modal"] as const)(
    "treats %s as its own pause reason",
    (reason: RuntimePauseReason) => {
      const driver = createFixedStepDriver();
      driver.setPauseReason(reason, true);
      expect(driver.isPaused()).toBe(true);
      driver.setPauseReason(reason, false);
      expect(driver.isPaused()).toBe(false);
    },
  );

  it("rejects invalid timestamps and safely resets a backward clock", () => {
    const driver = createFixedStepDriver();
    expect(() => driver.advanceFrame(Number.NaN)).toThrow(/finite/);
    expect(() => driver.advanceFrame(-1)).toThrow(/non-negative/);
    driver.advanceFrame(100);
    expect(driver.advanceFrame(50)).toEqual({ logicalSteps: 0, droppedLogicalSteps: 0 });
    expect(driver.advanceFrame(70)).toEqual({ logicalSteps: 1, droppedLogicalSteps: 0 });
  });
});
