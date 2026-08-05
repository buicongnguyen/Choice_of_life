import { describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import { createInitialRunState } from "../run-factory";
import { decodeRunState, encodeRunState } from "../run-state-codec";
import type { ControlMode, RunStateV1 } from "../run-state";
import {
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
} from "./contract";
import { generateRunnerLaboratoryCourse } from "./course-generator";
import { applyLabSettlement, beginLabSettlement } from "./settlement";

const AUTOMATIC_ORACLE = Object.freeze({
  health: 67,
  happiness: 60,
  money: 34,
});

function isDeeplyFrozen(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) =>
    isDeeplyFrozen((value as Record<PropertyKey, unknown>)[key], seen),
  );
}

function terminalBoundary(controlMode: ControlMode): RunStateV1 {
  const initial = createInitialRunState("0123456789abcdef", {
    startingProfileId: "steady-mix-v1",
    difficulty: "normal",
    controlMode,
    identity: { gender: "female" },
    appearance: {
      heritageStyleId: "asian",
      hairStyleId: "tied-back",
      hairColorId: "dark-brown",
      clothingPaletteId: "meadow",
    },
    accessibility: {
      highContrast: true,
      reducedMotion: true,
      textScale: 150,
      screenReaderAnnouncements: true,
    },
  });
  const course = generateRunnerLaboratoryCourse(initial.runSeed, initial.difficulty);
  const resolvedEntityIds = course.canonicalEntityIds
    .filter((id) => id !== course.finishMarker.instanceId)
    .sort((left, right) => left.localeCompare(right));
  return {
    ...initial,
    runStatus: "active",
    stage: {
      stageId: "runner-lab-v1",
      phase: "active",
      ageMonths: 0,
      activeTicks: 3000,
      worldDistanceMilli: 9_000_000,
      durationTicks: 3000,
      settlement: null,
    },
    runner: {
      motion: {
        kind: "idle",
        currentLane: 1,
        sourceLane: 1,
        targetLane: 1,
        elapsedTicks: 0,
        totalTicks: 11,
      },
      inputBuffer: null,
      spawn: {
        ...course.terminalCursor,
        resolvedThroughPatternIndex: 10,
        resolvedEntityIds,
      },
      activeEntities: [],
      invulnerableUntilTick: 0,
      userPaused: false,
    },
    simulationTick: 3000,
  };
}

function reload(state: RunStateV1): RunStateV1 {
  const result = decodeRunState(encodeRunState(state), RUNNER_LABORATORY_CATALOG);
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") throw new Error(`reload failed: ${result.code}`);
  return result.state;
}

describe("runner laboratory settlement", () => {
  it.each(["manual", "semantic-assist"] as const)(
    "creates and applies an effect-free %s settlement at a separate zero-tick boundary",
    (controlMode) => {
      const before = terminalBoundary(controlMode);
      const pending = beginLabSettlement(before);

      expect(before.stage.phase).toBe("active");
      expect(before.stage.settlement).toBeNull();
      expect(pending).toMatchObject({
        runStatus: "active",
        simulationTick: 3000,
        stage: {
          phase: "settling",
          activeTicks: 3000,
          worldDistanceMilli: 9_000_000,
          settlement: {
            settlementId: "settlement-runner-laboratory-v1",
            status: "pending",
            startedTick: 3000,
            completedTick: null,
            effectIds: [],
          },
        },
      });
      expect(pending.runner?.activeEntities).toEqual([]);
      expect(pending.runner?.spawn).toMatchObject({
        patternIndex: 11,
        resolvedThroughPatternIndex: 11,
        nextSpawnTick: 3001,
        nextSpawnDistanceMilli: 9_003_000,
      });
      expect(pending.runner?.spawn.resolvedEntityIds).toContain(
        generateRunnerLaboratoryCourse(before.runSeed, before.difficulty).finishMarker.instanceId,
      );

      const applied = applyLabSettlement(reload(pending));
      expect(applied).toMatchObject({
        runStatus: "completed",
        simulationTick: 3000,
        stage: {
          phase: "complete",
          activeTicks: 3000,
          settlement: {
            status: "applied",
            startedTick: 3000,
            completedTick: 3000,
            effectIds: [],
          },
        },
        runner: null,
      });
      expect(applied.scores).toEqual(before.scores);
      expect(applied.effectLedger).toEqual(before.effectLedger);
      expect(applied.storyState.facts).toEqual([RUNNER_LABORATORY_COMPLETION_FACT]);
      expect(applied.storyState.memories).toEqual([RUNNER_LABORATORY_COMPLETION_MEMORY]);
      const reloadedApplied = reload(applied);
      expect(applyLabSettlement(reloadedApplied)).toBe(reloadedApplied);
      expect(applyLabSettlement(applied)).toBe(applied);
    },
  );

  it("does not mutate mutable inputs and recursively freezes direct and reloaded snapshots", () => {
    const before = terminalBoundary("manual");
    const beforeText = JSON.stringify(before);
    expect(Object.isFrozen(before)).toBe(false);
    expect(Object.isFrozen(before.stage)).toBe(false);

    const pending = beginLabSettlement(before);
    expect(JSON.stringify(before)).toBe(beforeText);
    expect(Object.isFrozen(before.stage)).toBe(false);
    expect(isDeeplyFrozen(pending)).toBe(true);

    const mutablePending = JSON.parse(JSON.stringify(pending)) as RunStateV1;
    const mutablePendingText = JSON.stringify(mutablePending);
    expect(Object.isFrozen(mutablePending)).toBe(false);
    expect(Object.isFrozen(mutablePending.stage)).toBe(false);
    const directlyApplied = applyLabSettlement(mutablePending);
    expect(JSON.stringify(mutablePending)).toBe(mutablePendingText);
    expect(Object.isFrozen(mutablePending.stage)).toBe(false);
    expect(isDeeplyFrozen(directlyApplied)).toBe(true);
    expect(Object.isFrozen(directlyApplied.storyState.facts[0])).toBe(true);
    expect(Object.isFrozen(directlyApplied.storyState.memories[0])).toBe(true);

    const mutableApplied = JSON.parse(
      JSON.stringify(directlyApplied),
    ) as RunStateV1;
    const mutableAppliedText = JSON.stringify(mutableApplied);
    const immutableIdempotentResult = applyLabSettlement(mutableApplied);
    expect(JSON.stringify(mutableApplied)).toBe(mutableAppliedText);
    expect(immutableIdempotentResult).not.toBe(mutableApplied);
    expect(isDeeplyFrozen(immutableIdempotentResult)).toBe(true);

    const reloadedPending = reload(pending);
    expect(isDeeplyFrozen(reloadedPending)).toBe(true);
    const reloadedApplied = applyLabSettlement(reloadedPending);
    expect(isDeeplyFrozen(reloadedApplied)).toBe(true);
    expect(applyLabSettlement(reloadedApplied)).toBe(reloadedApplied);
  });

  it("reserves Automatic IDs before applying exact system-owned oracle deltas in score order", () => {
    const before = terminalBoundary("automatic-assist");
    const pending = beginLabSettlement(before, AUTOMATIC_ORACLE);

    expect(pending.stage.settlement?.effectIds).toEqual([
      "effect-runner-laboratory-health-v1",
      "effect-runner-laboratory-money-v1",
    ]);
    expect(pending.effectLedger.recent).toEqual([]);
    expect(pending.scores).toEqual(before.scores);
    expect(pending.storyState.facts).toEqual([]);
    expect(pending.storyState.memories).toEqual([]);

    const reloadedPending = reload(pending);
    const applied = applyLabSettlement(reloadedPending, AUTOMATIC_ORACLE);
    expect(applied.scores).toEqual(AUTOMATIC_ORACLE);
    expect(applied.stage.settlement?.effectIds).toEqual(
      pending.stage.settlement?.effectIds,
    );
    expect(applied.effectLedger.recent).toEqual([
      expect.objectContaining({
        effectId: "effect-runner-laboratory-health-v1",
        scoreId: "health",
        requestedDelta: 2,
        source: "system",
        categoryId: "runner-lab-automatic-settlement-effect-v1",
        causedByChoiceId: null,
        transactionId: "settlement-runner-laboratory-v1",
        before: 65,
        after: 67,
        actualDelta: 2,
        simulationTick: 3000,
      }),
      expect.objectContaining({
        effectId: "effect-runner-laboratory-money-v1",
        scoreId: "money",
        requestedDelta: -1,
        source: "system",
        transactionId: "settlement-runner-laboratory-v1",
        before: 35,
        after: 34,
        actualDelta: -1,
        simulationTick: 3000,
      }),
    ]);
    expect(applied.effectLedger.totalsBySource.system).toMatchObject({
      healthPositive: 2,
      moneyNegative: 1,
    });
    const reloadedApplied = reload(applied);
    expect(applyLabSettlement(reloadedApplied, AUTOMATIC_ORACLE)).toBe(reloadedApplied);
  });

  it("omits zero-delta IDs and supports every nonempty ordered reservation subset", () => {
    const starting = terminalBoundary("automatic-assist").scores;
    const cases = [
      { target: { ...starting, health: starting.health + 1 }, ids: ["effect-runner-laboratory-health-v1"] },
      { target: { ...starting, happiness: starting.happiness + 1 }, ids: ["effect-runner-laboratory-happiness-v1"] },
      { target: { ...starting, money: starting.money + 1 }, ids: ["effect-runner-laboratory-money-v1"] },
      { target: { ...starting, health: starting.health + 1, happiness: starting.happiness + 1 }, ids: ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1"] },
      { target: { ...starting, health: starting.health + 1, money: starting.money + 1 }, ids: ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-money-v1"] },
      { target: { ...starting, happiness: starting.happiness + 1, money: starting.money + 1 }, ids: ["effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"] },
      { target: { health: starting.health + 1, happiness: starting.happiness + 1, money: starting.money + 1 }, ids: ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"] },
    ] as const;
    for (const fixture of cases) {
      expect(
        beginLabSettlement(terminalBoundary("automatic-assist"), fixture.target)
          .stage.settlement?.effectIds,
      ).toEqual(fixture.ids);
    }
  });

  it("rejects missing/mismatched oracle data and malformed terminal boundaries", () => {
    const automatic = terminalBoundary("automatic-assist");
    expect(() => beginLabSettlement(automatic)).toThrow(/requires neutral Manual oracle/);
    expect(() => beginLabSettlement(automatic, automatic.scores)).toThrow(/at least one nonzero/);
    expect(() => beginLabSettlement(terminalBoundary("manual"), AUTOMATIC_ORACLE)).toThrow(
      /only Automatic Assist/,
    );
    expect(() => beginLabSettlement({
      ...terminalBoundary("manual"),
      simulationTick: 2999,
    })).toThrow(/tick-3000/);
    const incompleteLedger = terminalBoundary("manual");
    expect(() => beginLabSettlement({
      ...incompleteLedger,
      runner: {
        ...incompleteLedger.runner!,
        spawn: {
          ...incompleteLedger.runner!.spawn,
          resolvedEntityIds: incompleteLedger.runner!.spawn.resolvedEntityIds.slice(1),
        },
      },
    })).toThrow(/exhausted course/);
    expect(() => beginLabSettlement({
      ...terminalBoundary("manual"),
      runner: {
        ...terminalBoundary("manual").runner!,
        activeEntities: [{
          instanceId: "entity-0000000000000001",
          contentId: "runner-lab-health-token-v1",
          kind: "benefit",
          patternIndex: 10,
          slotIndex: 0,
          lane: 1,
          xMilli: 215000,
          widthMilli: 34000,
          contactState: "pending",
        }],
      },
    })).toThrow(/exhausted course/);
  });

  it("rejects partial, mismatched, and duplicate application evidence", () => {
    const pending = beginLabSettlement(
      terminalBoundary("automatic-assist"),
      AUTOMATIC_ORACLE,
    );
    expect(() => applyLabSettlement({
      ...pending,
      stage: {
        ...pending.stage,
        settlement: {
          ...pending.stage.settlement!,
          effectIds: ["effect-runner-laboratory-money-v1"],
        },
      },
    }, AUTOMATIC_ORACLE)).toThrow(/do not match oracle deltas/);

    const duplicateOwned = {
      ...pending,
      effectLedger: {
        ...pending.effectLedger,
        recent: [{
          effectId: "effect-runner-laboratory-health-v1",
          scoreId: "health" as const,
          requestedDelta: 2,
          source: "system" as const,
          categoryId: "runner-lab-automatic-settlement-effect-v1",
          causedByChoiceId: null,
          transactionId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
          before: 65,
          after: 67,
          actualDelta: 2,
          simulationTick: 3000,
        }],
      },
    };
    expect(() => applyLabSettlement(duplicateOwned, AUTOMATIC_ORACLE)).toThrow(
      /must not own ledger effects|unapplied reservations|partial or duplicate/,
    );

    const applied = applyLabSettlement(pending, AUTOMATIC_ORACLE);
    expect(() => applyLabSettlement({
      ...applied,
      storyState: {
        ...applied.storyState,
        facts: [...applied.storyState.facts, RUNNER_LABORATORY_COMPLETION_FACT],
      },
    }, AUTOMATIC_ORACLE)).toThrow(/incomplete or duplicated/);
    expect(() => applyLabSettlement({
      ...applied,
      effectLedger: {
        ...applied.effectLedger,
        recent: applied.effectLedger.recent.slice(1),
      },
    }, AUTOMATIC_ORACLE)).toThrow(/partial, mismatched, or duplicate/);
    const extraUnownedEffect = {
      ...applied.effectLedger.recent[0]!,
      effectId: "effect-unowned-extra",
      transactionId: null,
    };
    expect(() => applyLabSettlement({
      ...applied,
      effectLedger: {
        ...applied.effectLedger,
        recent: [...applied.effectLedger.recent, extraUnownedEffect],
      },
    }, AUTOMATIC_ORACLE)).toThrow(/non-settlement effects/);
    expect(() => applyLabSettlement({
      ...applied,
      effectLedger: {
        ...applied.effectLedger,
        totalsBySource: {
          ...applied.effectLedger.totalsBySource,
          system: {
            ...applied.effectLedger.totalsBySource.system,
            healthPositive:
              applied.effectLedger.totalsBySource.system.healthPositive + 1,
          },
        },
      },
    }, AUTOMATIC_ORACLE)).toThrow(/system totals/);
  });
});
