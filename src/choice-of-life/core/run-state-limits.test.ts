import { describe, expect, it } from "vitest";

import { RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "./catalog";
import { validateRunState } from "./run-state-codec";
import { createMaximalRunStateFixture } from "./run-state-fixtures";
import type { ResolvedConsequence, RunStateV1, TerminalConsequence } from "./run-state";

function expectValid(state: RunStateV1): void {
  expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state });
}

function pendingLimitState(count: number): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const template = base.consequences.pending[0];
  if (template === undefined) throw new Error("Missing pending fixture");
  return {
    ...base,
    consequences: {
      ...base.consequences,
      pending: Array.from({ length: count }, (_, index) => index === 0 ? template : {
        ...template,
        transactionId: `pending-limit-${index.toString().padStart(2, "0")}`,
        causedByChoiceId: null,
        dueTick: 5_000 + index,
        effectIds: [],
      }),
    },
  };
}

function resolvedLimitState(count: number): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const template = base.consequences.resolved[0];
  if (template === undefined) throw new Error("Missing resolved fixture");
  const extra = (index: number): ResolvedConsequence => ({
    ...template,
    transactionId: `resolved-limit-${index.toString().padStart(2, "0")}`,
    resolution: {
      ...template.resolution,
      appliedEffectIds: [],
      factResultIds: [],
      relationshipResultIds: [],
      scheduledConsequenceTransactionIds: [],
      resultTextInputIds: [],
    },
  });
  return {
    ...base,
    consequences: {
      ...base.consequences,
      resolved: Array.from({ length: count }, (_, index) => index === 0 ? template : extra(index)),
    },
  };
}

function terminalLimitState(count: number): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const terminal = (index: number): TerminalConsequence => ({
    transactionId: `terminal-limit-${index.toString().padStart(3, "0")}`,
    consequenceId: "consequence-replaced-support-v1",
    status: "expired",
    causedByChoiceId: null,
    resolution: null,
    terminalTick: 4_210,
    terminalReasonId: "reason-merged-into-support-v1",
    supersededByTransactionId: null,
    acknowledgmentId: "acknowledgment-support-recap-v1",
  });
  return {
    ...base,
    consequences: { ...base.consequences, terminal: Array.from({ length: count }, (_, index) => terminal(index)) },
  };
}

describe("run-state v1 exact structural limits", () => {
  it("accepts collection maxima and rejects each maximum plus one", () => {
    for (const [accepted, rejected, path] of [
      [pendingLimitState(64), pendingLimitState(65), "/consequences/pending"],
      [resolvedLimitState(64), resolvedLimitState(65), "/consequences/resolved"],
      [terminalLimitState(128), terminalLimitState(129), "/consequences/terminal"],
    ] as const) {
      expectValid(accepted);
      expect(validateRunState(rejected, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-structure",
        path,
      });
    }

    const base = createMaximalRunStateFixture();
    if (base.runner === null) throw new Error("Missing runner fixture");
    const withResolvedIds = (count: number): RunStateV1 => ({
      ...base,
      runner: {
        ...base.runner!,
        spawn: {
          ...base.runner!.spawn,
          resolvedEntityIds: Array.from({ length: count }, (_, index) => `resolved-limit-${index.toString().padStart(2, "0")}`),
        },
      },
    });
    expectValid(withResolvedIds(64));
    expect(validateRunState(withResolvedIds(65), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/runner/spawn/resolvedEntityIds",
    });
  });

  it("accepts a 64-scalar instance ID and rejects 65", () => {
    const base = createMaximalRunStateFixture();
    const relationship = base.storyState.relationships[0];
    const resolved = base.consequences.resolved[0];
    if (relationship === undefined || resolved === undefined) throw new Error("Missing relationship fixture");
    const withId = (id: string): RunStateV1 => ({
      ...base,
      storyState: {
        ...base.storyState,
        relationships: [{ ...relationship, relationshipId: id }],
      },
      consequences: {
        ...base.consequences,
        resolved: [{
          ...resolved,
          resolution: { ...resolved.resolution, relationshipResultIds: [id] },
        }],
      },
    });
    expectValid(withId("r".repeat(64)));
    expect(validateRunState(withId("r".repeat(65)), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/storyState/relationships/0/relationshipId",
    });
  });

  it("accepts both lane extremes and rejects negative and above-range lanes", () => {
    const base = createMaximalRunStateFixture();
    if (base.runner === null) throw new Error("Missing runner fixture");
    const withLane = (lane: number): RunStateV1 => ({
      ...base,
      runner: {
        ...base.runner!,
        motion: {
          kind: "idle",
          currentLane: lane as 0,
          sourceLane: lane as 0,
          targetLane: lane as 0,
          elapsedTicks: 0,
          totalTicks: 11,
        },
      },
    });
    expectValid(withLane(0));
    expectValid(withLane(2));
    for (const lane of [-1, 3]) {
      expect(validateRunState(withLane(lane), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-structure",
        path: "/runner/motion/currentLane",
      });
    }
  });

  it("accepts the safe-integer due-tick bounds and rejects every invalid numeric class", () => {
    const base = createMaximalRunStateFixture();
    const pending = base.consequences.pending[0];
    if (pending === undefined) throw new Error("Missing pending fixture");
    const withDueTick = (dueTick: number): RunStateV1 => ({
      ...base,
      consequences: {
        ...base.consequences,
        pending: [{ ...pending, dueTick }],
      },
    });
    expectValid(withDueTick(pending.dueTick));
    expectValid(withDueTick(Number.MAX_SAFE_INTEGER));
    for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateRunState(withDueTick(value), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-structure",
        path: "/consequences/pending/0/dueTick",
      });
    }
  });
});
