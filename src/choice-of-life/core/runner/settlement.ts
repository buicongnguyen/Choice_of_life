import { applyEffect } from "../effect-ledger";
import { deepFreeze, isDeeplyFrozen } from "../immutable";
import { assertCoreScores, type CoreScores } from "../score-model";
import {
  SCORE_IDS,
  STARTING_PROFILE_SCORES,
  type RunStateV1,
  type ScoreId,
} from "../run-state";
import {
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
} from "./contract";
import {
  RUNNER_LAB_COURSE_PATTERN_COUNT,
  generateRunnerLaboratoryCourse,
} from "./course-generator";

export type AutomaticSettlementOracleScores = CoreScores | null;

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner laboratory settlement: ${message}`);
  }
  throw new TypeError();
}

function cloneStateTree<T>(value: T, seen = new Map<object, unknown>()): T {
  if (typeof value !== "object" || value === null) return value;
  const prior = seen.get(value);
  if (prior !== undefined) return prior as T;
  const clone: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    (clone as Record<string, unknown>)[key] = cloneStateTree(
      (value as Record<string, unknown>)[key],
      seen,
    );
  }
  return clone as T;
}

function immutableSnapshot<T>(value: T): T {
  return deepFreeze(cloneStateTree(value));
}

function sameScores(left: CoreScores, right: CoreScores): boolean {
  return SCORE_IDS.every((scoreId) => left[scoreId] === right[scoreId]);
}

function arrayEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function isZeroLedger(state: RunStateV1): boolean {
  return state.effectLedger.recent.length === 0 &&
    Object.values(state.effectLedger.totalsBySource).every((totals) =>
      Object.values(totals).every((value) => value === 0)
    );
}

function assertEmptyLaboratoryNarrative(state: RunStateV1): void {
  const story = state.storyState;
  if (
    story.facts.length !== 0 ||
    story.memories.length !== 0 ||
    story.credentials.length !== 0 ||
    story.relationships.length !== 0 ||
    story.conditions.length !== 0
  ) {
    fail("pending laboratory story state must be empty");
  }
  if (
    state.consequences.pending.length !== 0 ||
    state.consequences.resolved.length !== 0 ||
    state.consequences.terminal.length !== 0
  ) {
    fail("laboratory consequences must be empty");
  }
}

function assertCompletedLaboratoryNarrative(state: RunStateV1): void {
  const story = state.storyState;
  if (
    story.facts.length !== 1 ||
    story.facts[0]?.factId !== RUNNER_LABORATORY_COMPLETION_FACT.factId ||
    story.facts[0]?.kind !== RUNNER_LABORATORY_COMPLETION_FACT.kind ||
    story.facts[0]?.valueId !== RUNNER_LABORATORY_COMPLETION_FACT.valueId ||
    story.facts[0]?.originChoiceId !== null ||
    story.memories.length !== 1 ||
    story.memories[0]?.memoryId !== RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId ||
    story.memories[0]?.kind !== RUNNER_LABORATORY_COMPLETION_MEMORY.kind ||
    story.memories[0]?.stageId !== RUNNER_LABORATORY_COMPLETION_MEMORY.stageId ||
    story.memories[0]?.summary !== RUNNER_LABORATORY_COMPLETION_MEMORY.summary ||
    story.memories[0]?.originChoiceId !== null ||
    story.credentials.length !== 0 ||
    story.relationships.length !== 0 ||
    story.conditions.length !== 0
  ) {
    fail("applied laboratory story state is incomplete or duplicated");
  }
  if (
    state.consequences.pending.length !== 0 ||
    state.consequences.resolved.length !== 0 ||
    state.consequences.terminal.length !== 0
  ) {
    fail("laboratory consequences must be empty");
  }
}

function assertCommonTerminalProjection(state: RunStateV1): void {
  if (
    state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
    state.stage.ageMonths !== 0 ||
    state.stage.durationTicks !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks ||
    state.stage.activeTicks !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick ||
    state.simulationTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick
  ) {
    fail("state is not at the exact tick-3000 laboratory boundary");
  }
  const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
  if (state.stage.worldDistanceMilli !== course.worldSpeedMilliPerTick * state.stage.activeTicks) {
    fail("terminal world distance does not match difficulty speed");
  }
  if (state.recovery !== null || state.encounter !== null) {
    fail("settlement cannot overlap recovery or encounter state");
  }
}

function requireAutomaticOracle(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores,
): CoreScores | null {
  if (state.controlMode !== "automatic-assist") {
    if (oracleScores !== null) fail("only Automatic Assist accepts oracle scores");
    return null;
  }
  if (oracleScores === null) fail("Automatic Assist requires neutral Manual oracle scores");
  assertCoreScores(oracleScores);
  const startingScores = STARTING_PROFILE_SCORES[state.startingProfileId];
  if (sameScores(startingScores, oracleScores)) {
    fail("Automatic Assist oracle must reserve at least one nonzero effect");
  }
  return oracleScores;
}

function automaticEffectIds(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores,
): readonly string[] {
  const target = requireAutomaticOracle(state, oracleScores);
  if (target === null) return Object.freeze([]);
  const startingScores = STARTING_PROFILE_SCORES[state.startingProfileId];
  return Object.freeze(
    RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder.flatMap(
      (scoreId) => target[scoreId] === startingScores[scoreId]
        ? []
        : [RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId]],
    ),
  );
}

function assertAutomaticPreSettlementState(state: RunStateV1): void {
  if (state.controlMode !== "automatic-assist") return;
  if (!sameScores(state.scores, STARTING_PROFILE_SCORES[state.startingProfileId])) {
    fail("Automatic Assist contact simulation must not mutate scores");
  }
  if (!isZeroLedger(state)) {
    fail("Automatic Assist contact simulation must not own ledger effects");
  }
}

function assertNoReservedOrOwnedEffects(
  state: RunStateV1,
  effectIds: readonly string[],
): void {
  const reserved = new Set(effectIds);
  if (state.effectLedger.recent.some((effect) => reserved.has(effect.effectId))) {
    fail("pending effect IDs must be unapplied reservations");
  }
  if (
    state.effectLedger.recent.some(
      (effect) => effect.transactionId === RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
    )
  ) {
    fail("pending settlement already owns a partial or duplicate application");
  }
}

function assertPendingSnapshot(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores,
): readonly string[] {
  assertCommonTerminalProjection(state);
  assertEmptyLaboratoryNarrative(state);
  if (state.runStatus !== "active" || state.stage.phase !== "settling") {
    fail("settlement application requires an active:settling snapshot");
  }
  const settlement = state.stage.settlement;
  if (
    settlement === null ||
    settlement.settlementId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId ||
    settlement.status !== "pending" ||
    settlement.startedTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick ||
    settlement.completedTick !== null
  ) {
    fail("pending settlement record is missing or mismatched");
  }
  if (state.runner === null) fail("pending settlement must retain the runner");
  const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
  const expectedResolvedEntityIds = [...course.canonicalEntityIds]
    .sort((left, right) => left.localeCompare(right));
  if (
    state.runner.spawn.patternIndex !== RUNNER_LAB_COURSE_PATTERN_COUNT + 1 ||
    state.runner.spawn.resolvedThroughPatternIndex !== RUNNER_LAB_COURSE_PATTERN_COUNT + 1 ||
    state.runner.spawn.nextSpawnTick !== course.completedCursor.nextSpawnTick ||
    state.runner.spawn.nextSpawnDistanceMilli !== course.completedCursor.nextSpawnDistanceMilli ||
    state.runner.activeEntities.length !== 0 ||
    !arrayEqual(
      state.runner.spawn.resolvedEntityIds,
      expectedResolvedEntityIds,
    )
  ) {
    fail("pending runner does not own the exact resolved finish boundary");
  }
  const expectedEffectIds = automaticEffectIds(state, oracleScores);
  if (!arrayEqual(settlement.effectIds, expectedEffectIds)) {
    fail("pending settlement effect reservations do not match oracle deltas");
  }
  assertAutomaticPreSettlementState(state);
  assertNoReservedOrOwnedEffects(state, settlement.effectIds);
  return expectedEffectIds;
}

function assertAppliedSnapshot(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores,
): void {
  assertCommonTerminalProjection(state);
  assertCompletedLaboratoryNarrative(state);
  if (
    state.runStatus !== "completed" ||
    state.stage.phase !== "complete" ||
    state.runner !== null
  ) {
    fail("idempotent application requires a completed laboratory snapshot");
  }
  const settlement = state.stage.settlement;
  if (
    settlement === null ||
    settlement.settlementId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId ||
    settlement.status !== "applied" ||
    settlement.startedTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick ||
    settlement.completedTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick
  ) {
    fail("applied settlement record is missing or mismatched");
  }
  const expectedEffectIds = automaticEffectIds(state, oracleScores);
  if (!arrayEqual(settlement.effectIds, expectedEffectIds)) {
    fail("applied settlement effect IDs differ from their pending reservation");
  }
  const owned = state.effectLedger.recent.filter(
    (effect) => effect.transactionId === settlement.settlementId,
  );
  if (!arrayEqual(owned.map((effect) => effect.effectId), expectedEffectIds)) {
    fail("applied settlement owns a partial, mismatched, or duplicate effect set");
  }
  if (state.controlMode === "automatic-assist") {
    const target = requireAutomaticOracle(state, oracleScores);
    if (target === null || !sameScores(state.scores, target)) {
      fail("Automatic Assist final scores differ from the oracle");
    }
    const startingScores = STARTING_PROFILE_SCORES[state.startingProfileId];
    if (state.effectLedger.recent.length !== owned.length) {
      fail("Automatic Assist applied ledger contains non-settlement effects");
    }
    const nonSystemTotals = Object.entries(state.effectLedger.totalsBySource)
      .filter(([source]) => source !== "system")
      .flatMap(([, totals]) => Object.values(totals));
    if (nonSystemTotals.some((value) => value !== 0)) {
      fail("Automatic Assist applied ledger credits a non-system source");
    }
    const expectedSystemTotals = {
      healthPositive: Math.max(0, target.health - startingScores.health),
      healthNegative: Math.max(0, startingScores.health - target.health),
      happinessPositive: Math.max(0, target.happiness - startingScores.happiness),
      happinessNegative: Math.max(0, startingScores.happiness - target.happiness),
      moneyPositive: Math.max(0, target.money - startingScores.money),
      moneyNegative: Math.max(0, startingScores.money - target.money),
    };
    if (
      Object.entries(expectedSystemTotals).some(
        ([key, value]) =>
          state.effectLedger.totalsBySource.system[
            key as keyof typeof expectedSystemTotals
          ] !== value,
      )
    ) {
      fail("Automatic Assist system totals do not match settlement effects");
    }
    for (const effect of owned) {
      const scoreId = effect.scoreId;
      const expectedDelta = target[scoreId] - startingScores[scoreId];
      if (
        effect.effectId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId] ||
        effect.requestedDelta !== expectedDelta ||
        effect.actualDelta !== expectedDelta ||
        effect.before !== startingScores[scoreId] ||
        effect.after !== target[scoreId] ||
        effect.source !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.source ||
        effect.categoryId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectCategoryId ||
        effect.causedByChoiceId !== null ||
        effect.simulationTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick
      ) {
        fail("Automatic Assist owns a malformed settlement effect");
      }
    }
  } else if (owned.length !== 0) {
    fail("Manual and Semantic settlements cannot own effects");
  }
}

/**
 * Creates the durable settlement checkpoint after the ordinary tick-3000
 * simulation work has completed. The input is an intentionally transient
 * `active:active` terminal state; this function does not advance a logical tick.
 */
export function beginLabSettlement(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores = null,
): RunStateV1 {
  assertCommonTerminalProjection(state);
  assertEmptyLaboratoryNarrative(state);
  if (
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.stage.settlement !== null
  ) {
    fail("begin requires an unsettled active laboratory boundary");
  }
  if (state.runner === null) fail("begin requires runner state");
  const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
  const expectedResolvedEntityIds = course.canonicalEntityIds
    .filter((id) => id !== course.finishMarker.instanceId)
    .sort((left, right) => left.localeCompare(right));
  if (
    state.runner.spawn.patternIndex !== RUNNER_LAB_COURSE_PATTERN_COUNT ||
    state.runner.spawn.resolvedThroughPatternIndex !== RUNNER_LAB_COURSE_PATTERN_COUNT ||
    state.runner.spawn.nextSpawnTick !== course.terminalCursor.nextSpawnTick ||
    state.runner.spawn.nextSpawnDistanceMilli !== course.terminalCursor.nextSpawnDistanceMilli ||
    state.runner.activeEntities.length !== 0 ||
    !arrayEqual(
      state.runner.spawn.resolvedEntityIds,
      expectedResolvedEntityIds,
    )
  ) {
    fail("begin requires the exhausted course immediately before finish resolution");
  }
  assertAutomaticPreSettlementState(state);
  const effectIds = automaticEffectIds(state, oracleScores);
  assertNoReservedOrOwnedEffects(state, effectIds);
  const resolvedEntityIds = Object.freeze(
    [...state.runner.spawn.resolvedEntityIds, course.finishMarker.instanceId]
      .sort((left, right) => left.localeCompare(right)),
  );
  return immutableSnapshot({
    ...state,
    stage: Object.freeze({
      ...state.stage,
      phase: "settling" as const,
      settlement: Object.freeze({
        settlementId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
        status: "pending" as const,
        startedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
        completedTick: null,
        effectIds,
      }),
    }),
    runner: Object.freeze({
      ...state.runner,
      spawn: Object.freeze({
        ...state.runner.spawn,
        ...course.completedCursor,
        resolvedThroughPatternIndex: RUNNER_LAB_COURSE_PATTERN_COUNT + 1,
        resolvedEntityIds,
      }),
      activeEntities: Object.freeze([]),
    }),
  });
}

/** Applies (or validates and returns) the separate zero-tick lab settlement. */
export function applyLabSettlement(
  state: RunStateV1,
  oracleScores: AutomaticSettlementOracleScores = null,
): RunStateV1 {
  if (state.runStatus === "completed" || state.stage.phase === "complete") {
    assertAppliedSnapshot(state, oracleScores);
    return isDeeplyFrozen(state) ? state : immutableSnapshot(state);
  }
  const effectIds = assertPendingSnapshot(state, oracleScores);
  let scores = state.scores;
  let ledger = state.effectLedger;
  if (state.controlMode === "automatic-assist") {
    const target = requireAutomaticOracle(state, oracleScores);
    if (target === null) fail("Automatic Assist oracle is missing");
    const startingScores = STARTING_PROFILE_SCORES[state.startingProfileId];
    for (const scoreId of RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder) {
      const requestedDelta = target[scoreId] - startingScores[scoreId];
      if (requestedDelta === 0) continue;
      const application = applyEffect(scores, ledger, {
        effectId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId],
        scoreId: scoreId as ScoreId,
        requestedDelta,
        source: "settlement",
        categoryId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectCategoryId,
        causedByChoiceId: null,
        transactionId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
        simulationTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
      });
      scores = application.scores;
      ledger = application.ledger;
    }
  }
  const completed = immutableSnapshot({
    ...state,
    runStatus: "completed" as const,
    scores,
    effectLedger: ledger,
    storyState: Object.freeze({
      ...state.storyState,
      facts: Object.freeze([{ ...RUNNER_LABORATORY_COMPLETION_FACT }]),
      memories: Object.freeze([{ ...RUNNER_LABORATORY_COMPLETION_MEMORY }]),
    }),
    stage: Object.freeze({
      ...state.stage,
      phase: "complete" as const,
      settlement: Object.freeze({
        settlementId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
        status: "applied" as const,
        startedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
        completedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
        effectIds,
      }),
    }),
    runner: null,
  });
  assertAppliedSnapshot(completed, oracleScores);
  return completed;
}
