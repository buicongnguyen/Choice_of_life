import { describe, expect, it } from "vitest";

import type { Lane } from "../run-state";
import {
  adjacentLane,
  assertLaneControllerState,
  enumerateIncomingLaneStates,
  laneControllerStateKey,
  lanePositionMilli,
  minimumTicksToIdleLane,
  RUNNER_LANES,
  stepLaneController,
  type LaneControllerState,
  type LaneDirection,
  type LaneIntent,
} from "./lane-controller";

const INTENTS: readonly LaneIntent[] = [null, "up", "down"];

function idle(lane: Lane, inputBuffer: LaneDirection | null = null): LaneControllerState {
  return {
    motion: {
      kind: "idle",
      currentLane: lane,
      sourceLane: lane,
      targetLane: lane,
      elapsedTicks: 0,
      totalTicks: 11,
    },
    inputBuffer,
  };
}

describe("runner lane controller", () => {
  it("locks exactly three lanes and adjacent boundary behavior", () => {
    expect(RUNNER_LANES).toEqual([0, 1, 2]);
    expect(adjacentLane(0, "up")).toBeNull();
    expect(adjacentLane(0, "down")).toBe(1);
    expect(adjacentLane(1, "up")).toBe(0);
    expect(adjacentLane(1, "down")).toBe(2);
    expect(adjacentLane(2, "up")).toBe(1);
    expect(adjacentLane(2, "down")).toBeNull();
  });

  it.each([
    [0, "down", 1],
    [1, "up", 0],
    [1, "down", 2],
    [2, "up", 1],
  ] as const)(
    "interpolates the complete 11-tick tween from lane %i %s to %i",
    (sourceLane, direction, targetLane) => {
      let state = idle(sourceLane);
      for (let tick = 1; tick <= 11; tick += 1) {
        state = stepLaneController(state, tick === 1 ? direction : null);
        if (tick < 11) {
          expect(state.motion).toMatchObject({
            kind: "moving",
            currentLane: sourceLane,
            sourceLane,
            targetLane,
            elapsedTicks: tick,
            totalTicks: 11,
          });
          expect(lanePositionMilli(state)).toBe(
            Math.round(
              ((sourceLane * (11 - tick) + targetLane * tick) * 1_000) / 11,
            ),
          );
        } else {
          expect(state).toEqual(idle(targetLane));
          expect(lanePositionMilli(state)).toBe(targetLane * 1_000);
        }
      }
    },
  );

  it("retains one legal buffer, ignores later requests, and separates completion from handoff", () => {
    let state = stepLaneController(idle(0), "down");
    expect(state.motion).toMatchObject({ kind: "moving", elapsedTicks: 1, targetLane: 1 });

    state = stepLaneController(state, "down");
    expect(state.inputBuffer).toBe("down");
    state = stepLaneController(state, "up");
    expect(state.inputBuffer).toBe("down");

    while (state.motion.kind === "moving") {
      state = stepLaneController(state, "up");
    }
    expect(state).toEqual(idle(1, "down"));
    expect(lanePositionMilli(state)).toBe(1_000);

    const handoff = stepLaneController(state, "up");
    expect(handoff).toEqual({
      motion: {
        kind: "moving",
        currentLane: 1,
        sourceLane: 1,
        targetLane: 2,
        elapsedTicks: 1,
        totalTicks: 11,
      },
      inputBuffer: null,
    });
  });

  it("never accepts an instant two-lane move or an invalid boundary request", () => {
    expect(stepLaneController(idle(0), "up")).toEqual(idle(0));
    expect(stepLaneController(idle(2), "down")).toEqual(idle(2));

    let state = stepLaneController(idle(0), "down");
    expect(state.motion.targetLane).toBe(1);
    state = stepLaneController(state, "down");
    expect(state.motion.targetLane).toBe(1);
    expect(state.inputBuffer).toBe("down");
  });

  it("enumerates the exact 107-state incoming closure", () => {
    const states = enumerateIncomingLaneStates();
    const idleStates = states.filter((state) => state.motion.kind === "idle");
    const movingStates = states.filter((state) => state.motion.kind === "moving");

    expect(states).toHaveLength(107);
    expect(new Set(states.map(laneControllerStateKey))).toHaveProperty("size", 107);
    expect(idleStates).toHaveLength(7);
    expect(idleStates.filter((state) => state.inputBuffer !== null)).toHaveLength(4);
    expect(movingStates).toHaveLength(100);
    expect(
      new Set(
        movingStates.map((state) =>
          state.motion.kind === "moving" ? state.motion.elapsedTicks : -1,
        ),
      ),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    for (const state of states) expect(() => assertLaneControllerState(state)).not.toThrow();
  });

  it("runs all locked 321 incoming-state/input cases through the same reducer", () => {
    let caseCount = 0;
    for (const state of enumerateIncomingLaneStates()) {
      for (const intent of INTENTS) {
        const next = stepLaneController(state, intent);
        expect(() => assertLaneControllerState(next)).not.toThrow();
        if (next.motion.kind === "moving") {
          expect(next.motion.currentLane).toBe(next.motion.sourceLane);
          expect(Math.abs(next.motion.targetLane - next.motion.sourceLane)).toBe(1);
        }
        caseCount += 1;
      }
    }
    expect(caseCount).toBe(321);
  });

  it("honors committed motion when computing shortest arrival time", () => {
    const closure = enumerateIncomingLaneStates();
    let maximum = -1;
    let witness: LaneControllerState | null = null;
    for (const state of closure) {
      for (const targetLane of RUNNER_LANES) {
        const ticks = minimumTicksToIdleLane(state, targetLane);
        if (ticks > maximum) {
          maximum = ticks;
          witness = state;
        }
      }
    }

    expect(maximum).toBe(43);
    expect(witness).not.toBeNull();
    expect(minimumTicksToIdleLane(idle(0), 0)).toBe(0);
    expect(minimumTicksToIdleLane(idle(0), 1)).toBe(11);
    expect(minimumTicksToIdleLane(idle(0), 2)).toBe(22);
  });

  it("rejects the target-lane moving form excluded by the Phase 2 closure", () => {
    expect(() =>
      assertLaneControllerState({
        motion: {
          kind: "moving",
          currentLane: 1,
          sourceLane: 0,
          targetLane: 1,
          elapsedTicks: 5,
          totalTicks: 11,
        },
        inputBuffer: null,
      }),
    ).toThrow("source lane");
  });

  it("rejects an unknown motion discriminator instead of treating it as moving", () => {
    expect(() => assertLaneControllerState({
      motion: {
        kind: "teleport",
        currentLane: 0,
        sourceLane: 0,
        targetLane: 1,
        elapsedTicks: 1,
        totalTicks: 11,
      },
      inputBuffer: null,
    } as unknown as LaneControllerState)).toThrow(/motion kind/);
  });
});
