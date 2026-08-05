import { describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import { applyEffect } from "../effect-ledger";
import {
  decodeRunState,
  encodeRunState,
  validateRunState,
} from "../run-state-codec";
import type {
  ControlMode,
  RunStateV1,
  RunnerEntity,
} from "../run-state";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
} from "./contract";
import {
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedEntity,
  type RunnerLabGeneratedPattern,
} from "./course-generator";
import {
  assertRunnerLaboratorySaveInvariants,
  provesRunnerLaboratoryFutureInvulnerability,
  verifyRunnerLaboratoryAutomaticOracleEquality,
  type RunnerLaboratoryNeutralOracleInput,
} from "./save-invariants";
import { applyLabSettlement, beginLabSettlement } from "./settlement";

const RUN_SEED = "0000000000000001";
const AUTOMATIC_ORACLE = Object.freeze({
  health: 67,
  happiness: 59,
  money: 38,
});

function entry(controlMode: ControlMode): RunStateV1 {
  return createRunnerLaboratoryEntryState(RUN_SEED, {
    startingProfileId: "steady-mix-v1",
    difficulty: "normal",
    controlMode,
    identity: { gender: "female" },
    appearance: {
      heritageStyleId: "asian",
      hairStyleId: "tied-back",
      hairColorId: "black",
      clothingPaletteId: "berry",
    },
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      textScale: 100,
      screenReaderAnnouncements: false,
    },
  });
}

function courseFor(state: RunStateV1): RunnerLabGeneratedCourse {
  return generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
}

function startState(controlMode: ControlMode = "manual"): RunStateV1 {
  const base = entry(controlMode);
  const course = courseFor(base);
  if (base.runner === null) throw new Error("entry runner missing");
  return {
    ...base,
    runner: {
      ...base.runner,
      spawn: {
        ...base.runner.spawn,
        resolvedEntityIds: [course.startMarker.instanceId],
      },
      userPaused: false,
    },
  };
}

type SpawnedEntity =
  | RunnerLabGeneratedEntity
  | RunnerLabGeneratedPattern["decisionMarker"];

function projectedEntity(
  course: RunnerLabGeneratedCourse,
  generated: SpawnedEntity,
  simulationTick: number,
): RunnerEntity {
  const pattern = course.patterns[generated.patternIndex - 1];
  if (pattern === undefined) throw new Error("pattern missing");
  return {
    instanceId: generated.instanceId,
    contentId: generated.contentId,
    kind: generated.kind,
    patternIndex: generated.patternIndex,
    slotIndex: generated.slotIndex,
    lane: generated.lane,
    xMilli: generated.xMilli -
      course.worldSpeedMilliPerTick * (simulationTick - pattern.spawnTick),
    widthMilli: generated.widthMilli,
    contactState: "pending",
  };
}

function atTick(
  state: RunStateV1,
  tick: number,
  runner: NonNullable<RunStateV1["runner"]>,
): RunStateV1 {
  const course = courseFor(state);
  return {
    ...state,
    simulationTick: tick,
    stage: {
      ...state.stage,
      activeTicks: tick,
      worldDistanceMilli: course.worldSpeedMilliPerTick * tick,
    },
    runner,
  };
}

function resolvedBeforePattern(
  course: RunnerLabGeneratedCourse,
  patternIndex: number,
): string[] {
  return [
    course.startMarker.instanceId,
    ...course.patterns
      .filter((pattern) => pattern.patternIndex < patternIndex)
      .flatMap((pattern) => pattern.spawnEntities.map((entity) => entity.instanceId)),
  ].sort((left, right) => left.localeCompare(right));
}

function contactState(
  contentKind: "benefit" | "hazard",
): RunStateV1 {
  const base = startState("manual");
  const course = courseFor(base);
  const pattern = contentKind === "benefit"
    ? course.patterns[0]
    : course.patterns.find((candidate) =>
      candidate.entities.some((entity) => entity.kind === "hazard"));
  if (pattern === undefined) throw new Error("contact pattern missing");
  const generated = pattern.entities.find((entity) =>
    entity.kind === contentKind);
  if (generated === undefined) throw new Error("contact entity missing");
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
    generated.contentId,
  );
  if (definition === undefined || base.runner === null) {
    throw new Error("contact definition missing");
  }
  const tick = generated.contactTick;
  const application = applyEffect(base.scores, base.effectLedger, {
    effectId: `effect-${generated.instanceId.slice("entity-".length)}`,
    scoreId: definition.scoreId,
    requestedDelta: definition.requestedDelta,
    source: "runner",
    categoryId: definition.categoryId,
    causedByChoiceId: null,
    transactionId: null,
    simulationTick: tick,
  });
  const resolvedEntityIds = [
    ...resolvedBeforePattern(course, pattern.patternIndex),
    generated.instanceId,
  ].sort((left, right) => left.localeCompare(right));
  return atTick({
    ...base,
    scores: application.scores,
    effectLedger: application.ledger,
  }, tick, {
    ...base.runner,
    spawn: {
      ...pattern.outgoingCursor,
      resolvedThroughPatternIndex: pattern.patternIndex - 1,
      resolvedEntityIds,
    },
    activeEntities: pattern.spawnEntities
      .filter((entity) => entity.instanceId !== generated.instanceId)
      .map((entity) => projectedEntity(course, entity as SpawnedEntity, tick)),
    invulnerableUntilTick: generated.kind === "hazard"
      ? tick + RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks
      : 0,
  });
}

function suppressedHazardState(): RunStateV1 {
  const base = startState("manual");
  const course = courseFor(base);
  const pattern = course.patterns.find((candidate) => {
    const hazards = candidate.entities.filter((entity) => entity.kind === "hazard");
    return hazards.length >= 2 && hazards[0]?.contactTick === hazards[1]?.contactTick;
  });
  if (pattern === undefined || base.runner === null) {
    throw new Error("two-hazard fixture missing");
  }
  const hazards = pattern.entities.filter((entity) => entity.kind === "hazard");
  const first = hazards[0];
  const second = hazards[1];
  if (first === undefined || second === undefined) throw new Error("hazards missing");
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
    first.contentId,
  );
  if (definition === undefined) throw new Error("hazard definition missing");
  const tick = first.contactTick;
  const application = applyEffect(base.scores, base.effectLedger, {
    effectId: `effect-${first.instanceId.slice("entity-".length)}`,
    scoreId: definition.scoreId,
    requestedDelta: definition.requestedDelta,
    source: "runner",
    categoryId: definition.categoryId,
    causedByChoiceId: null,
    transactionId: null,
    simulationTick: tick,
  });
  return atTick({
    ...base,
    scores: application.scores,
    effectLedger: application.ledger,
  }, tick, {
    ...base.runner,
    spawn: {
      ...pattern.outgoingCursor,
      resolvedThroughPatternIndex: pattern.patternIndex - 1,
      resolvedEntityIds: [
        ...resolvedBeforePattern(course, pattern.patternIndex),
        first.instanceId,
        second.instanceId,
      ].sort((left, right) => left.localeCompare(right)),
    },
    activeEntities: pattern.spawnEntities
      .filter((entity) =>
        entity.instanceId !== first.instanceId &&
        entity.instanceId !== second.instanceId)
      .map((entity) => projectedEntity(course, entity as SpawnedEntity, tick)),
    invulnerableUntilTick: tick +
      RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks,
  });
}

function reversedSameTickContactState(): RunStateV1 {
  const base = startState("manual");
  const course = courseFor(base);
  const pattern = course.patterns[0];
  if (pattern === undefined || base.runner === null) throw new Error("pattern missing");
  const first = pattern.entities[0];
  const second = pattern.entities[1];
  if (first === undefined || second === undefined) throw new Error("benefits missing");
  let scores = base.scores;
  let ledger = base.effectLedger;
  for (const entity of [second, first]) {
    const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
      entity.contentId,
    );
    if (definition === undefined) throw new Error("definition missing");
    const application = applyEffect(scores, ledger, {
      effectId: `effect-${entity.instanceId.slice("entity-".length)}`,
      scoreId: definition.scoreId,
      requestedDelta: definition.requestedDelta,
      source: "runner",
      categoryId: definition.categoryId,
      causedByChoiceId: null,
      transactionId: null,
      simulationTick: entity.contactTick,
    });
    scores = application.scores;
    ledger = application.ledger;
  }
  const tick = first.contactTick;
  return atTick({ ...base, scores, effectLedger: ledger }, tick, {
    ...base.runner,
    spawn: {
      ...pattern.outgoingCursor,
      resolvedThroughPatternIndex: 0,
      resolvedEntityIds: [
        course.startMarker.instanceId,
        first.instanceId,
        second.instanceId,
      ].sort((left, right) => left.localeCompare(right)),
    },
    activeEntities: pattern.spawnEntities
      .filter((entity) =>
        entity.instanceId !== first.instanceId &&
        entity.instanceId !== second.instanceId)
      .map((entity) => projectedEntity(course, entity as SpawnedEntity, tick)),
  });
}

function passState(controlMode: ControlMode = "manual"): RunStateV1 {
  const base = startState(controlMode);
  const course = courseFor(base);
  const pattern = course.patterns[0];
  if (pattern === undefined || base.runner === null) throw new Error("pattern missing");
  const overlapTicks = Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
      course.worldSpeedMilliPerTick,
  );
  const tick = Math.max(
    pattern.anchorTick,
    ...pattern.entities.map((entity) => entity.contactTick + overlapTicks + 1),
  );
  return atTick(base, tick, {
    ...base.runner,
    spawn: {
      ...pattern.outgoingCursor,
      resolvedThroughPatternIndex: 1,
      resolvedEntityIds: [
        course.startMarker.instanceId,
        ...pattern.spawnEntities.map((entity) => entity.instanceId),
      ].sort((left, right) => left.localeCompare(right)),
    },
    activeEntities: [],
  });
}

function earlyAssistDecisionState(
  controlMode: "semantic-assist" | "automatic-assist",
): RunStateV1 {
  const base = startState(controlMode);
  const course = courseFor(base);
  const pattern = course.patterns[0];
  if (pattern === undefined || base.runner === null) throw new Error("pattern missing");
  const tick = pattern.spawnTick + 1;
  return atTick(base, tick, {
    ...base.runner,
    spawn: {
      ...pattern.outgoingCursor,
      resolvedThroughPatternIndex: 0,
      resolvedEntityIds: [
        course.startMarker.instanceId,
        pattern.decisionMarker.instanceId,
      ].sort((left, right) => left.localeCompare(right)),
    },
    activeEntities: pattern.entities.map((entity) =>
      projectedEntity(course, entity, tick)),
  });
}

function terminalBoundary(controlMode: ControlMode): RunStateV1 {
  const base = startState(controlMode);
  const course = courseFor(base);
  if (base.runner === null) throw new Error("runner missing");
  return {
    ...base,
    simulationTick: 3_000,
    stage: {
      ...base.stage,
      activeTicks: 3_000,
      worldDistanceMilli: course.worldSpeedMilliPerTick * 3_000,
    },
    runner: {
      ...base.runner,
      spawn: {
        ...course.terminalCursor,
        resolvedThroughPatternIndex: 10,
        resolvedEntityIds: course.canonicalEntityIds
          .filter((id) => id !== course.finishMarker.instanceId)
          .sort((left, right) => left.localeCompare(right)),
      },
      activeEntities: [],
    },
  };
}

function roundTrip(state: RunStateV1): RunStateV1 {
  const decoded = decodeRunState(
    encodeRunState(state),
    RUNNER_LABORATORY_CATALOG,
  );
  expect(decoded.kind).toBe("ready");
  if (decoded.kind !== "ready") throw new Error("round trip rejected");
  return decoded.state;
}

function expectInvalid(state: RunStateV1, path?: string): void {
  const result = validateRunState(state, RUNNER_LABORATORY_CATALOG);
  expect(result.ok).toBe(false);
  if (!result.ok && path !== undefined) expect(result.path).toBe(path);
}

describe("runner laboratory save trust boundary", () => {
  it("round trips entry, start, mid-tween, contact, pass, and future-invulnerability snapshots", () => {
    const started = startState();
    if (started.runner === null) throw new Error("runner missing");
    const midTween = atTick(started, 5, {
      ...started.runner,
      motion: {
        kind: "moving",
        currentLane: 1,
        sourceLane: 1,
        targetLane: 0,
        elapsedTicks: 5,
        totalTicks: 11,
      },
      inputBuffer: "down",
    });
    const benefit = contactState("benefit");
    const hazard = contactState("hazard");

    for (const state of [
      entry("manual"),
      started,
      midTween,
      benefit,
      passState(),
      hazard,
      suppressedHazardState(),
    ]) {
      expect(roundTrip(state)).toEqual(state);
    }
    expect(provesRunnerLaboratoryFutureInvulnerability(hazard)).toBe(true);
  });

  it("accepts the post-choice decision-marker lifecycle for Semantic and Automatic modes", () => {
    expect(roundTrip(earlyAssistDecisionState("semantic-assist"))).toEqual(
      earlyAssistDecisionState("semantic-assist"),
    );
    expect(roundTrip(earlyAssistDecisionState("automatic-assist"))).toEqual(
      earlyAssistDecisionState("automatic-assist"),
    );
  });

  it("round trips exact pending and applied settlements in all control families", () => {
    const manualPending = beginLabSettlement(terminalBoundary("manual"));
    const manualApplied = applyLabSettlement(manualPending);
    const automaticPending = beginLabSettlement(
      terminalBoundary("automatic-assist"),
      AUTOMATIC_ORACLE,
    );
    const automaticApplied = applyLabSettlement(
      automaticPending,
      AUTOMATIC_ORACLE,
    );

    for (const state of [manualPending, manualApplied, automaticPending, automaticApplied]) {
      expect(roundTrip(state)).toEqual(state);
    }
    expect(verifyRunnerLaboratoryAutomaticOracleEquality(
      automaticPending,
      () => AUTOMATIC_ORACLE,
    )).toBe(true);
    expect(verifyRunnerLaboratoryAutomaticOracleEquality(
      automaticApplied,
      () => AUTOMATIC_ORACLE,
    )).toBe(true);
    expect(verifyRunnerLaboratoryAutomaticOracleEquality(
      automaticApplied,
      () => ({ ...AUTOMATIC_ORACLE, money: AUTOMATIC_ORACLE.money + 1 }),
    )).toBe(false);

    const capture: { input: RunnerLaboratoryNeutralOracleInput | null } = {
      input: null,
    };
    expect(verifyRunnerLaboratoryAutomaticOracleEquality(
      automaticPending,
      (input) => {
        capture.input = input;
        return AUTOMATIC_ORACLE;
      },
    )).toBe(true);
    const capturedInput = capture.input as RunnerLaboratoryNeutralOracleInput;
    expect(capturedInput).toMatchObject({
      contentVersion: automaticPending.contentVersion,
      runSeed: automaticPending.runSeed,
      liveAutomaticRunId: automaticPending.runId,
      identity: automaticPending.identity,
      appearance: automaticPending.appearance,
      accessibility: automaticPending.accessibility,
    });
    expect(capturedInput.reconstructedManualRunId).toBe(
      startState("manual").runId,
    );
  });

  it("rejects projection, cursor, geometry, ordering, and lifecycle mutations", () => {
    const base = contactState("benefit");
    if (base.runner === null) throw new Error("runner missing");
    const first = base.runner.activeEntities[0];
    const second = base.runner.activeEntities[1];
    if (first === undefined || second === undefined) throw new Error("active fixtures missing");
    const mutations: readonly RunStateV1[] = [
      { ...base, stage: { ...base.stage, activeTicks: base.stage.activeTicks - 1 } },
      { ...base, stage: { ...base.stage, worldDistanceMilli: base.stage.worldDistanceMilli + 1 } },
      { ...base, stage: { ...base.stage, ageMonths: 1 } },
      {
        ...base,
        runner: {
          ...base.runner,
          motion: {
            kind: "moving",
            currentLane: 0,
            sourceLane: 1,
            targetLane: 0,
            elapsedTicks: 1,
            totalTicks: 11,
          },
        },
      },
      {
        ...base,
        runner: {
          ...base.runner,
          motion: {
            kind: "moving",
            currentLane: 1,
            sourceLane: 1,
            targetLane: 0,
            elapsedTicks: 1,
            totalTicks: 11,
          },
          inputBuffer: "up",
        },
      },
      { ...base, runner: { ...base.runner, spawn: { ...base.runner.spawn, nextSpawnTick: base.runner.spawn.nextSpawnTick + 1 } } },
      { ...base, runner: { ...base.runner, activeEntities: [second, first, ...base.runner.activeEntities.slice(2)] } },
      { ...base, runner: { ...base.runner, activeEntities: [{ ...first, xMilli: first.xMilli + 1 }, ...base.runner.activeEntities.slice(1)] } },
      { ...base, runner: { ...base.runner, activeEntities: [{ ...first, contactState: "passed" }, ...base.runner.activeEntities.slice(1)] } },
      { ...base, runner: { ...base.runner, spawn: { ...base.runner.spawn, resolvedThroughPatternIndex: base.runner.spawn.resolvedThroughPatternIndex + 1 } } },
    ];
    for (const mutation of mutations) expectInvalid(mutation);

    const preAppend = startState();
    const course = courseFor(preAppend);
    if (preAppend.runner === null) throw new Error("runner missing");
    const preAppendRunner = preAppend.runner;
    expect(() => assertRunnerLaboratorySaveInvariants(atTick(
      preAppend,
      course.initialCursor.nextSpawnTick,
      preAppendRunner,
    ))).toThrow(/append checkpoint/);
  });

  it("rejects active-list overflow and duplicate instance IDs", () => {
    const base = contactState("benefit");
    if (base.runner === null) throw new Error("runner missing");
    const first = base.runner.activeEntities[0];
    if (first === undefined) throw new Error("active fixture missing");
    const runner = base.runner;
    expectInvalid({
      ...base,
      runner: {
        ...base.runner,
        activeEntities: [...base.runner.activeEntities, first],
      },
    });
    expect(() => assertRunnerLaboratorySaveInvariants({
      ...base,
      runner: {
        ...runner,
        activeEntities: Array.from({ length: 25 }, (_, index) => ({
          ...first,
          instanceId: `entity-${index.toString(16).padStart(16, "0")}`,
          slotIndex: index,
        })),
      },
    })).toThrow(/locked laboratory cap/);
  });

  it("rejects early Manual decision resolution but accepts the assist boundary", () => {
    const assist = earlyAssistDecisionState("semantic-assist");
    const manual = {
      ...assist,
      controlMode: "manual" as const,
    };
    // Re-derive runId through an authentic Manual start fixture while retaining
    // the deliberately early decision-marker resolution.
    const manualIdentity = startState("manual");
    expectInvalid({ ...manual, runId: manualIdentity.runId });
    expect(validateRunState(assist, RUNNER_LABORATORY_CATALOG).ok).toBe(true);
  });

  it("requires actual negative damage and the latest tick/index hazard for future invulnerability", () => {
    const hazard = contactState("hazard");
    const last = hazard.effectLedger.recent.at(-1);
    if (hazard.runner === null || last === undefined) throw new Error("hazard fixture missing");
    const noDamage = {
      ...hazard,
      scores: { ...hazard.scores, [last.scoreId]: last.before },
      effectLedger: {
        recent: [{ ...last, after: last.before, actualDelta: 0 }],
        totalsBySource: {
          ...hazard.effectLedger.totalsBySource,
          runner: {
            ...hazard.effectLedger.totalsBySource.runner,
            [`${last.scoreId}Negative`]: 0,
          },
        },
      },
    } as RunStateV1;
    expect(provesRunnerLaboratoryFutureInvulnerability(noDamage)).toBe(false);
    expectInvalid(noDamage);
    expect(provesRunnerLaboratoryFutureInvulnerability({
      ...hazard,
      runStatus: "completed",
    })).toBe(false);
    expect(provesRunnerLaboratoryFutureInvulnerability({
      ...hazard,
      stage: { ...hazard.stage, phase: "settling" },
    })).toBe(false);

    expectInvalid({
      ...hazard,
      runner: {
        ...hazard.runner,
        invulnerableUntilTick: hazard.runner.invulnerableUntilTick + 1,
      },
    }, "/runner/invulnerableUntilTick");
  });

  it("rejects early effect-free benefits, clamped contacts, and noncanonical same-tick effects", () => {
    const benefit = contactState("benefit");
    const pristine = entry("manual");
    expectInvalid({
      ...benefit,
      scores: pristine.scores,
      effectLedger: pristine.effectLedger,
    });

    const effect = benefit.effectLedger.recent[0];
    if (effect === undefined) throw new Error("benefit effect missing");
    expect(() => assertRunnerLaboratorySaveInvariants({
      ...benefit,
      scores: { ...benefit.scores, [effect.scoreId]: effect.before },
      effectLedger: {
        recent: [{ ...effect, after: effect.before, actualDelta: 0 }],
        totalsBySource: pristine.effectLedger.totalsBySource,
      },
    })).toThrow(/exact unclamped delta/);

    expectInvalid(reversedSameTickContactState());
  });

  it("rejects forged effects, non-course ledgers, nonempty narratives, and settlement mutants", () => {
    const contact = contactState("benefit");
    const effect = contact.effectLedger.recent[0];
    if (effect === undefined || contact.runner === null) throw new Error("contact fixture missing");
    expectInvalid({
      ...contact,
      effectLedger: {
        ...contact.effectLedger,
        recent: [{ ...effect, categoryId: "runner-hazard-v1" }],
      },
    });
    expectInvalid({
      ...contact,
      runner: {
        ...contact.runner,
        spawn: {
          ...contact.runner.spawn,
          resolvedEntityIds: [...contact.runner.spawn.resolvedEntityIds, "entity-ffffffffffffffff"].sort(),
        },
      },
    });
    expectInvalid({
      ...contact,
      storyState: {
        ...contact.storyState,
        conditions: [{
          conditionId: "runner-lab-health-token-v1",
          kind: "health",
          severity: 1,
          startedTick: 0,
          expiresTick: null,
          originChoiceId: null,
        }],
      },
    });

    const pending = beginLabSettlement(
      terminalBoundary("automatic-assist"),
      AUTOMATIC_ORACLE,
    );
    if (pending.stage.settlement === null) throw new Error("settlement missing");
    expectInvalid({
      ...pending,
      stage: {
        ...pending.stage,
        settlement: {
          ...pending.stage.settlement,
          effectIds: [
            RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds.money,
            RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds.health,
          ],
        },
      },
    });
  });
});
