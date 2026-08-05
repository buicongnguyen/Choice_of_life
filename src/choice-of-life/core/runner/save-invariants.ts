import {
  EFFECT_SOURCES,
  SCORE_IDS,
  STARTING_PROFILE_SCORES,
  type AppliedEffect,
  type CoreScores,
  type EffectSource,
  type RunStateV1,
  type ScoreId,
  type ScoreTotals,
} from "../run-state";
import {
  deriveRunIdFromStateV1,
  retainedProtectedRunSetupV1,
} from "../run-factory";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
} from "./contract";
import {
  compareRunnerEntityCoordinates,
  effectIdForRunnerEntity,
  runnerPatternSafeBoundaryTick,
} from "./collision-system";
import {
  assertAuthenticRunnerLaboratoryCourse,
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedEntity,
  type RunnerLabGeneratedPattern,
} from "./course-generator";
import { assertLaneControllerState } from "./lane-controller";

export class RunnerLaboratorySaveInvariantError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    // Keep actionable invariant prose in development/tests. Production
    // consumers expose the invariant path, not these internal diagnostics, so
    // the production build can safely erase the redundant strings.
    super(import.meta.env.DEV ? message : "");
    this.name = "RunnerLaboratorySaveInvariantError";
    this.path = path;
  }
}

export interface RunnerLaboratoryNeutralOracleInput {
  readonly contentVersion: RunStateV1["contentVersion"];
  readonly runSeed: string;
  readonly difficulty: RunStateV1["difficulty"];
  readonly startingProfileId: RunStateV1["startingProfileId"];
  readonly liveAutomaticRunId: string;
  readonly reconstructedManualRunId: string;
  readonly identity: RunStateV1["identity"];
  readonly appearance: RunStateV1["appearance"];
  readonly accessibility: RunStateV1["accessibility"];
}

/**
 * This hook deliberately names recomputation as the source of truth. The save
 * codec can prove that an Automatic settlement is structurally coherent, but
 * it cannot prove that its target came from the neutral Manual oracle until a
 * deterministic recomputer is supplied by the simulation layer.
 */
export type RunnerLaboratoryNeutralOracleRecomputer = (
  input: RunnerLaboratoryNeutralOracleInput,
) => CoreScores;

type GeneratedActiveEntity =
  | RunnerLabGeneratedEntity
  | RunnerLabGeneratedPattern["decisionMarker"];

const TOTAL_KEYS = [
  "healthPositive",
  "healthNegative",
  "happinessPositive",
  "happinessNegative",
  "moneyPositive",
  "moneyNegative",
] as const satisfies readonly (keyof ScoreTotals)[];

function invalid(path: string, message: string): never {
  if (import.meta.env.DEV) {
    throw new RunnerLaboratorySaveInvariantError(path, message);
  }
  throw new RunnerLaboratorySaveInvariantError(path, "");
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameScores(left: CoreScores, right: CoreScores): boolean {
  return SCORE_IDS.every((scoreId) => left[scoreId] === right[scoreId]);
}

function allEmpty(state: RunStateV1): boolean {
  return state.storyState.credentials.length === 0 &&
    state.storyState.relationships.length === 0 &&
    state.storyState.conditions.length === 0 &&
    state.consequences.pending.length === 0 &&
    state.consequences.resolved.length === 0 &&
    state.consequences.terminal.length === 0 &&
    state.recovery === null &&
    state.encounter === null;
}

function assertNarrativeProjection(state: RunStateV1): void {
  if (!allEmpty(state)) {
    invalid(
      "/storyState",
      "Runner laboratory saves cannot contain credentials, relationships, conditions, consequences, recovery, or encounters",
    );
  }

  const applied = state.runStatus === "completed";
  if (!applied) {
    if (state.storyState.facts.length !== 0) {
      invalid("/storyState/facts", "Unsettled laboratory facts must be empty");
    }
    if (state.storyState.memories.length !== 0) {
      invalid("/storyState/memories", "Unsettled laboratory memories must be empty");
    }
    return;
  }

  const fact = state.storyState.facts[0];
  if (
    state.storyState.facts.length !== 1 ||
    fact?.factId !== RUNNER_LABORATORY_COMPLETION_FACT.factId ||
    fact.kind !== RUNNER_LABORATORY_COMPLETION_FACT.kind ||
    fact.valueId !== RUNNER_LABORATORY_COMPLETION_FACT.valueId ||
    fact.originChoiceId !== RUNNER_LABORATORY_COMPLETION_FACT.originChoiceId
  ) {
    invalid("/storyState/facts", "Completed laboratory save requires its exact singleton completion fact");
  }
  const memory = state.storyState.memories[0];
  if (
    state.storyState.memories.length !== 1 ||
    memory?.memoryId !== RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId ||
    memory.kind !== RUNNER_LABORATORY_COMPLETION_MEMORY.kind ||
    memory.stageId !== RUNNER_LABORATORY_COMPLETION_MEMORY.stageId ||
    memory.summary !== RUNNER_LABORATORY_COMPLETION_MEMORY.summary ||
    memory.originChoiceId !== RUNNER_LABORATORY_COMPLETION_MEMORY.originChoiceId
  ) {
    invalid("/storyState/memories", "Completed laboratory save requires its exact singleton completion memory");
  }
}

function assertStageProjection(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): "active" | "pending" | "applied" {
  if (state.stage.ageMonths !== 0) {
    invalid("/stage/ageMonths", "Runner laboratory age is fixed at zero months");
  }
  if (state.stage.durationTicks !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks) {
    invalid("/stage/durationTicks", "Runner laboratory duration differs from its contract");
  }
  if (
    state.simulationTick !== state.stage.activeTicks ||
    state.simulationTick < 0 ||
    state.simulationTick > RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks
  ) {
    invalid("/stage/activeTicks", "Laboratory active time must equal its bounded simulation tick");
  }
  if (
    state.stage.worldDistanceMilli !==
      course.worldSpeedMilliPerTick * state.simulationTick
  ) {
    invalid("/stage/worldDistanceMilli", "Laboratory distance must equal speed multiplied by active ticks");
  }

  if (state.simulationTick < RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick) {
    if (
      state.runStatus !== "active" ||
      state.stage.phase !== "active" ||
      state.stage.settlement !== null ||
      state.runner === null
    ) {
      invalid("/stage", "A pre-boundary laboratory save must be active with no settlement");
    }
    return "active";
  }

  const settlement = state.stage.settlement;
  if (
    settlement === null ||
    settlement.settlementId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId ||
    settlement.startedTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick
  ) {
    invalid("/stage/settlement", "The tick-3000 laboratory boundary requires its exact settlement identity");
  }
  if (state.runStatus === "active") {
    if (
      state.stage.phase !== "settling" ||
      settlement.status !== "pending" ||
      settlement.completedTick !== null ||
      state.runner === null
    ) {
      invalid("/stage/settlement", "Pending laboratory settlement shape is not exact");
    }
    return "pending";
  }
  if (
    state.runStatus !== "completed" ||
    state.stage.phase !== "complete" ||
    settlement.status !== "applied" ||
    settlement.completedTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick ||
    state.runner !== null
  ) {
    invalid("/stage/settlement", "Applied laboratory settlement shape is not exact");
  }
  return "applied";
}

function zeroTotals(): Record<EffectSource, Record<keyof ScoreTotals, number>> {
  return Object.fromEntries(EFFECT_SOURCES.map((source) => [
    source,
    Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0])),
  ])) as Record<EffectSource, Record<keyof ScoreTotals, number>>;
}

function assertExactLedgerTotals(state: RunStateV1): void {
  const expected = zeroTotals();
  for (const effect of state.effectLedger.recent) {
    const suffix = effect.actualDelta >= 0 ? "Positive" : "Negative";
    const key = `${effect.scoreId}${suffix}` as keyof ScoreTotals;
    expected[effect.source][key] += Math.abs(effect.actualDelta);
  }
  for (const source of EFFECT_SOURCES) {
    for (const key of TOTAL_KEYS) {
      if (state.effectLedger.totalsBySource[source][key] !== expected[source][key]) {
        invalid(
          `/effectLedger/totalsBySource/${source}/${key}`,
          "Laboratory lifetime totals must exactly equal its fully retained effect history",
        );
      }
    }
  }
}

function generatedEntitiesById(
  course: RunnerLabGeneratedCourse,
): ReadonlyMap<string, RunnerLabGeneratedEntity> {
  return new Map(course.patterns.flatMap((pattern) =>
    pattern.entities.map((entity) => [entity.instanceId, entity] as const)));
}

function scoringEffectForEntity(
  effect: AppliedEffect,
  entitiesById: ReadonlyMap<string, RunnerLabGeneratedEntity>,
): RunnerLabGeneratedEntity | null {
  if (!/^effect-[0-9a-f]{16}$/.test(effect.effectId)) return null;
  const entity = entitiesById.get(`entity-${effect.effectId.slice("effect-".length)}`);
  if (entity === undefined) return null;
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
    entity.contentId,
  );
  if (
    definition === undefined ||
    effect.effectId !== effectIdForRunnerEntity(entity.instanceId) ||
    effect.scoreId !== definition.scoreId ||
    effect.requestedDelta !== definition.requestedDelta ||
    effect.categoryId !== definition.categoryId ||
    effect.source !== "runner" ||
    effect.causedByChoiceId !== null ||
    effect.transactionId !== null
  ) {
    return null;
  }
  return entity;
}

function scoringEntitySafeTick(
  entity: RunnerLabGeneratedEntity,
  course: RunnerLabGeneratedCourse,
): number {
  return entity.contactTick + Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
      course.worldSpeedMilliPerTick,
  ) + 1;
}

function assertRunnerEffects(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): ReadonlyMap<string, RunnerLabGeneratedEntity> {
  const entitiesById = generatedEntitiesById(course);
  let previousTick = -1;
  let previousEntity: RunnerLabGeneratedEntity | null = null;
  for (let index = 0; index < state.effectLedger.recent.length; index += 1) {
    const effect = state.effectLedger.recent[index];
    if (effect === undefined) continue;
    const entity = scoringEffectForEntity(effect, entitiesById);
    if (entity === null) {
      invalid(
        `/effectLedger/recent/${index}`,
        "Manual and Semantic laboratory effects must exactly link to an authentic scoring entity",
      );
    }
    if (effect.actualDelta !== effect.requestedDelta) {
      invalid(
        `/effectLedger/recent/${index}/actualDelta`,
        "Every locked laboratory contact must apply its exact unclamped delta",
      );
    }
    if (
      effect.simulationTick === previousTick &&
      previousEntity !== null &&
      compareRunnerEntityCoordinates(previousEntity, entity) >= 0
    ) {
      invalid(
        `/effectLedger/recent/${index}`,
        "Same-tick runner effects must retain canonical entity order",
      );
    }
    const safeTick = scoringEntitySafeTick(entity, course);
    if (
      effect.simulationTick < entity.contactTick ||
      effect.simulationTick >= safeTick
    ) {
      invalid(
        `/effectLedger/recent/${index}/simulationTick`,
        "Runner effect tick is outside the entity's exact closed-overlap lifetime",
      );
    }
    previousTick = effect.simulationTick;
    previousEntity = entity;
  }
  return entitiesById;
}

function hasAuthenticSuppressionProof(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  suppressed: RunnerLabGeneratedEntity,
  entitiesById: ReadonlyMap<string, RunnerLabGeneratedEntity>,
): boolean {
  const suppressedSafeTick = scoringEntitySafeTick(suppressed, course);
  return state.effectLedger.recent.some((effect) => {
    if (effect.source !== "runner" || effect.actualDelta >= 0) return false;
    const priorHazard = scoringEffectForEntity(effect, entitiesById);
    if (priorHazard === null || priorHazard.kind !== "hazard") return false;
    const possibleSuppressionTick = Math.max(
      suppressed.contactTick,
      effect.simulationTick,
    );
    const endExclusive = Math.min(
      suppressedSafeTick,
      state.simulationTick + 1,
      effect.simulationTick +
        RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks,
    );
    if (possibleSuppressionTick >= endExclusive) return false;
    return possibleSuppressionTick > effect.simulationTick ||
      compareRunnerEntityCoordinates(priorHazard, suppressed) < 0;
  });
}

function fixedAutomaticEffectIds(): readonly string[] {
  return RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder.map(
    (scoreId) => RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId],
  );
}

function assertOrderedAutomaticReservations(effectIds: readonly string[]): void {
  const fixed = fixedAutomaticEffectIds();
  if (
    effectIds.length < 1 ||
    effectIds.length > fixed.length ||
    effectIds.some((effectId) => !fixed.includes(effectId)) ||
    !sameStringArray(effectIds, fixed.filter((effectId) => effectIds.includes(effectId)))
  ) {
    invalid(
      "/stage/settlement/effectIds",
      "Automatic settlement reservations must be a nonempty ordered subset of the fixed score effects",
    );
  }
}

function assertAutomaticProjection(
  state: RunStateV1,
  lifecycle: "active" | "pending" | "applied",
): void {
  const starting = STARTING_PROFILE_SCORES[state.startingProfileId];
  const settlementEffectIds = state.stage.settlement?.effectIds ?? [];
  if (lifecycle !== "applied") {
    if (!sameScores(state.scores, starting)) {
      invalid("/scores", "Automatic contact simulation must preserve starting scores");
    }
    if (state.effectLedger.recent.length !== 0) {
      invalid("/effectLedger/recent", "Automatic contact simulation must not apply contact effects");
    }
    if (lifecycle === "pending") {
      assertOrderedAutomaticReservations(settlementEffectIds);
    }
    return;
  }

  assertOrderedAutomaticReservations(settlementEffectIds);
  if (
    state.effectLedger.recent.length !== settlementEffectIds.length ||
    !sameStringArray(
      state.effectLedger.recent.map((effect) => effect.effectId),
      settlementEffectIds,
    )
  ) {
    invalid("/effectLedger/recent", "Applied Automatic ledger must exactly realize its reserved effects in order");
  }
  const touched = new Set<ScoreId>();
  state.effectLedger.recent.forEach((effect, index) => {
    const scoreId = RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder
      .find((candidate) =>
        RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[candidate] ===
          effect.effectId);
    if (
      scoreId === undefined ||
      effect.scoreId !== scoreId ||
      effect.requestedDelta === 0 ||
      effect.requestedDelta !== effect.actualDelta ||
      effect.before !== starting[scoreId] ||
      effect.after !== state.scores[scoreId] ||
      effect.source !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.source ||
      effect.categoryId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectCategoryId ||
      effect.causedByChoiceId !== null ||
      effect.transactionId !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId ||
      effect.simulationTick !== RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick
    ) {
      invalid(
        `/effectLedger/recent/${index}`,
        "Applied Automatic settlement effect differs from its exact structural projection",
      );
    }
    touched.add(scoreId);
  });
  for (const scoreId of SCORE_IDS) {
    if (!touched.has(scoreId) && state.scores[scoreId] !== starting[scoreId]) {
      invalid(`/scores/${scoreId}`, "Unreserved Automatic score differs from its starting value");
    }
  }
}

function assertManualOrSemanticProjection(
  state: RunStateV1,
  lifecycle: "active" | "pending" | "applied",
  course: RunnerLabGeneratedCourse,
): ReadonlyMap<string, RunnerLabGeneratedEntity> {
  if (lifecycle !== "active" && (state.stage.settlement?.effectIds.length ?? 0) !== 0) {
    invalid(
      "/stage/settlement/effectIds",
      "Manual and Semantic laboratory settlements cannot reserve or own effects",
    );
  }
  return assertRunnerEffects(state, course);
}

function expectedCursor(
  course: RunnerLabGeneratedCourse,
  patternIndex: number,
): RunnerLabGeneratedCourse["initialCursor"] {
  if (patternIndex === 0) return course.initialCursor;
  if (patternIndex === RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalPatternIndex) {
    return course.completedCursor;
  }
  const pattern = course.patterns[patternIndex - 1];
  if (pattern === undefined) {
    invalid("/runner/spawn/patternIndex", "Runner spawn index is outside the authentic course");
  }
  return pattern.outgoingCursor;
}

function exactEntityProjection(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  expected: GeneratedActiveEntity,
): Readonly<{
  instanceId: string;
  contentId: string;
  kind: GeneratedActiveEntity["kind"];
  patternIndex: number;
  slotIndex: number;
  lane: GeneratedActiveEntity["lane"];
  xMilli: number;
  widthMilli: number;
  contactState: "pending";
}> {
  const pattern = course.patterns[expected.patternIndex - 1];
  if (pattern === undefined) {
    invalid("/runner/activeEntities", "Active entity pattern is outside the authentic course");
  }
  return {
    instanceId: expected.instanceId,
    contentId: expected.contentId,
    kind: expected.kind,
    patternIndex: expected.patternIndex,
    slotIndex: expected.slotIndex,
    lane: expected.lane,
    xMilli: expected.xMilli -
      course.worldSpeedMilliPerTick * (state.simulationTick - pattern.spawnTick),
    widthMilli: expected.widthMilli,
    contactState: "pending",
  };
}

function assertRunnerProjection(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  lifecycle: "active" | "pending",
  scoringEntitiesById: ReadonlyMap<string, RunnerLabGeneratedEntity>,
): void {
  const runner = state.runner;
  if (runner === null) invalid("/runner", "Active laboratory lifecycle requires runner state");
  try {
    assertLaneControllerState({
      motion: runner.motion,
      inputBuffer: runner.inputBuffer,
    });
  } catch {
    invalid("/runner/motion", "Runner motion and one-slot buffer are outside the exact lane-state closure");
  }

  const patternIndex = runner.spawn.patternIndex;
  const terminalIndex = RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalPatternIndex;
  if (
    patternIndex < 0 ||
    patternIndex > terminalIndex ||
    (lifecycle === "active" && patternIndex === terminalIndex) ||
    (lifecycle === "pending" && patternIndex !== terminalIndex)
  ) {
    invalid("/runner/spawn/patternIndex", "Spawn index does not match the laboratory lifecycle");
  }
  const cursor = expectedCursor(course, patternIndex);
  if (
    runner.spawn.nextSpawnTick !== cursor.nextSpawnTick ||
    runner.spawn.nextSpawnDistanceMilli !== cursor.nextSpawnDistanceMilli
  ) {
    invalid("/runner/spawn", "Runner spawn cursor is not the exact authenticated course cursor");
  }
  if (state.simulationTick >= cursor.nextSpawnTick) {
    invalid("/runner/spawn", "Runner save cannot remain before an append checkpoint at or after its next spawn tick");
  }
  if (patternIndex > 0) {
    const latestPattern = course.patterns[Math.min(patternIndex, course.patterns.length) - 1];
    if (latestPattern !== undefined && state.simulationTick < latestPattern.spawnTick) {
      invalid("/runner/spawn/patternIndex", "Runner claims a pattern before its authentic spawn tick");
    }
  }

  const resolved = runner.spawn.resolvedEntityIds;
  if (resolved.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds) {
    invalid("/runner/spawn/resolvedEntityIds", "Resolved entity ledger exceeds the laboratory cap");
  }
  const sortedResolved = [...new Set(resolved)].sort((left, right) => left.localeCompare(right));
  if (!sameStringArray(resolved, sortedResolved)) {
    invalid("/runner/spawn/resolvedEntityIds", "Resolved entity IDs must be sorted and unique");
  }
  const courseIds = new Set(course.canonicalEntityIds);
  if (resolved.some((id) => !courseIds.has(id))) {
    invalid("/runner/spawn/resolvedEntityIds", "Resolved entity ID is not owned by the authentic course");
  }
  const resolvedSet = new Set(resolved);

  const active = runner.activeEntities;
  if (active.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities) {
    invalid("/runner/activeEntities", "Active entity list exceeds the locked laboratory cap");
  }
  if (new Set(active.map((entity) => entity.instanceId)).size !== active.length) {
    invalid("/runner/activeEntities", "Active entity instance IDs must be unique");
  }
  const canonicalActive = [...active].sort(compareRunnerEntityCoordinates);
  if (active.some((entity, index) =>
    entity.instanceId !== canonicalActive[index]?.instanceId)) {
    invalid("/runner/activeEntities", "Active entities must use canonical pattern/slot/ID order");
  }
  const expectedActiveById = new Map<string, GeneratedActiveEntity>(
    course.patterns.flatMap((pattern) =>
      [...pattern.entities, pattern.decisionMarker]
        .map((entity) => [entity.instanceId, entity] as const)),
  );
  const activeIds = new Set<string>();
  active.forEach((entity, index) => {
    const expected = expectedActiveById.get(entity.instanceId);
    if (
      expected === undefined ||
      expected.patternIndex > patternIndex ||
      resolvedSet.has(entity.instanceId)
    ) {
      invalid(`/runner/activeEntities/${index}`, "Active entity is not an unresolved spawned course entity");
    }
    const projection = exactEntityProjection(state, course, expected);
    if (
      entity.instanceId !== projection.instanceId ||
      entity.contentId !== projection.contentId ||
      entity.kind !== projection.kind ||
      entity.patternIndex !== projection.patternIndex ||
      entity.slotIndex !== projection.slotIndex ||
      entity.lane !== projection.lane ||
      entity.xMilli !== projection.xMilli ||
      entity.widthMilli !== projection.widthMilli ||
      entity.contactState !== projection.contactState
    ) {
      invalid(`/runner/activeEntities/${index}`, "Active entity differs from its exact course timeline projection");
    }
    const pattern = course.patterns[expected.patternIndex - 1]!;
    const safeTick = expected.kind === "opportunity"
      ? runnerPatternSafeBoundaryTick(pattern, course.worldSpeedMilliPerTick)
      : scoringEntitySafeTick(expected as RunnerLabGeneratedEntity, course);
    if (state.simulationTick >= safeTick) {
      invalid(`/runner/activeEntities/${index}`, "Active entity survived beyond its exact terminal tick");
    }
    activeIds.add(entity.instanceId);
  });

  const startResolved = resolvedSet.has(course.startMarker.instanceId);
  if (!startResolved) {
    const initialMotion = RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION.runner.motion;
    if (
      state.simulationTick !== 0 ||
      patternIndex !== 0 ||
      resolved.length !== 0 ||
      active.length !== 0 ||
      !runner.userPaused ||
      runner.inputBuffer !== null ||
      runner.invulnerableUntilTick !== 0 ||
      runner.motion.kind !== initialMotion.kind ||
      runner.motion.currentLane !== initialMotion.currentLane ||
      runner.motion.sourceLane !== initialMotion.sourceLane ||
      runner.motion.targetLane !== initialMotion.targetLane ||
      runner.motion.elapsedTicks !== initialMotion.elapsedTicks ||
      runner.motion.totalTicks !== initialMotion.totalTicks
    ) {
      invalid("/runner/spawn/resolvedEntityIds", "An unresolved start marker is valid only in the exact paused entry snapshot");
    }
  }

  for (const pattern of course.patterns) {
    const spawned = pattern.patternIndex <= patternIndex;
    for (const generated of pattern.spawnEntities) {
      const isActive = activeIds.has(generated.instanceId);
      const isResolved = resolvedSet.has(generated.instanceId);
      if (spawned ? isActive === isResolved : isActive || isResolved) {
        invalid(
          "/runner/spawn/resolvedEntityIds",
          spawned
            ? "Every spawned entity must be exactly one of active or resolved"
            : "Unspawned course entities cannot be active or resolved",
        );
      }
      if (!isResolved) continue;
      const earliestResolutionTick = generated.kind === "opportunity"
        ? state.controlMode === "manual"
          ? runnerPatternSafeBoundaryTick(pattern, course.worldSpeedMilliPerTick)
          : pattern.spawnTick + 1
        : (generated as RunnerLabGeneratedEntity).contactTick;
      if (state.simulationTick < earliestResolutionTick) {
        invalid("/runner/spawn/resolvedEntityIds", "Entity resolved before its earliest authentic terminal tick");
      }
      if (
        generated.kind !== "opportunity" &&
        state.controlMode !== "automatic-assist" &&
        state.simulationTick <
          scoringEntitySafeTick(generated as RunnerLabGeneratedEntity, course)
      ) {
        const scoringEntity = generated as RunnerLabGeneratedEntity;
        const linkedEffect = state.effectLedger.recent.some((effect) =>
          effect.effectId === effectIdForRunnerEntity(scoringEntity.instanceId));
        const suppressed = scoringEntity.kind === "hazard" &&
          hasAuthenticSuppressionProof(
            state,
            course,
            scoringEntity,
            scoringEntitiesById,
          );
        if (!linkedEffect && !suppressed) {
          invalid(
            "/runner/spawn/resolvedEntityIds",
            "Early Manual or Semantic scoring resolution lacks an authentic contact effect or prior-hazard suppression proof",
          );
        }
      }
    }
  }

  const finishResolved = resolvedSet.has(course.finishMarker.instanceId);
  if (finishResolved !== (patternIndex === terminalIndex)) {
    invalid("/runner/spawn/resolvedEntityIds", "Finish marker lifecycle does not match the settlement boundary");
  }
  if (patternIndex === terminalIndex && !startResolved) {
    invalid("/runner/spawn/resolvedEntityIds", "Completed course is missing its start marker");
  }

  let resolvedThrough = 0;
  for (const pattern of course.patterns) {
    if (
      pattern.patternIndex <= patternIndex &&
      pattern.spawnEntities.every((entity) => resolvedSet.has(entity.instanceId))
    ) {
      if (resolvedThrough === pattern.patternIndex - 1) {
        resolvedThrough = pattern.patternIndex;
      }
    } else {
      break;
    }
  }
  if (
    patternIndex === terminalIndex &&
    resolvedThrough === course.patterns.length &&
    finishResolved
  ) {
    resolvedThrough = terminalIndex;
  }
  if (runner.spawn.resolvedThroughPatternIndex !== resolvedThrough) {
    invalid("/runner/spawn/resolvedThroughPatternIndex", "Resolved-through cursor is not the exact consecutive course prefix");
  }

  for (const effect of state.effectLedger.recent) {
    if (effect.source !== "runner") continue;
    const entity = scoringEffectForEntity(effect, scoringEntitiesById);
    if (entity === null || !resolvedSet.has(entity.instanceId)) {
      invalid("/effectLedger/recent", "Runner effect does not own a resolved authentic entity");
    }
  }

  const hazardEffects = state.effectLedger.recent.filter((effect) =>
    effect.source === "runner" && effect.actualDelta < 0);
  const expectedInvulnerability = state.controlMode === "automatic-assist" || hazardEffects.length === 0
    ? 0
    : hazardEffects[hazardEffects.length - 1]!.simulationTick +
      RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks;
  if (runner.invulnerableUntilTick !== expectedInvulnerability) {
    invalid("/runner/invulnerableUntilTick", "Runner invulnerability does not derive from the most recent authentic hazard effect");
  }
}

/**
 * Proves the sole Phase-2 exception to Phase-1's recovery-owned future
 * invulnerability rule. It is intentionally false outside an active Manual or
 * Semantic runner-laboratory snapshot.
 */
export function provesRunnerLaboratoryFutureInvulnerability(
  state: RunStateV1,
): boolean {
  if (
    state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.runner === null ||
    state.recovery !== null ||
    state.controlMode === "automatic-assist" ||
    state.runner.invulnerableUntilTick <= state.simulationTick
  ) {
    return false;
  }
  try {
    const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
    assertAuthenticRunnerLaboratoryCourse(course, state.runSeed, state.difficulty);
    const entitiesById = generatedEntitiesById(course);
    // Recent effects are in nondecreasing tick order. Reverse traversal is the
    // exact latest-by-(simulationTick, applicationIndex) selection required
    // when multiple canonical contacts occur on one tick.
    const hazard = [...state.effectLedger.recent].reverse().find((effect) =>
      effect.source === "runner" && effect.actualDelta < 0);
    if (hazard === undefined) return false;
    const entity = scoringEffectForEntity(hazard, entitiesById);
    return entity !== null &&
      entity.kind === "hazard" &&
      state.runner.spawn.resolvedEntityIds.includes(entity.instanceId) &&
      hazard.simulationTick <= state.simulationTick &&
      state.simulationTick < hazard.simulationTick +
        RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks &&
      state.runner.invulnerableUntilTick === hazard.simulationTick +
        RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks;
  } catch {
    return false;
  }
}

function assertRunnerLaboratorySaveInvariantsAgainstCourse(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): void {
  if (state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID) {
    invalid("/stage/stageId", "Runner laboratory invariants require the runner laboratory stage");
  }
  const lifecycle = assertStageProjection(state, course);
  assertNarrativeProjection(state);

  const entitiesById = state.controlMode === "automatic-assist"
    ? generatedEntitiesById(course)
    : assertManualOrSemanticProjection(state, lifecycle, course);
  if (state.controlMode === "automatic-assist") {
    assertAutomaticProjection(state, lifecycle);
  }
  assertExactLedgerTotals(state);

  if (lifecycle !== "applied") {
    assertRunnerProjection(state, course, lifecycle, entitiesById);
  }
}

/**
 * Validates a runner save against an already-authenticated production course.
 * Evaluator codec proofs use this path to avoid regenerating the same course
 * for every recorded continuation occurrence.
 */
export function assertRunnerLaboratorySaveInvariantsForCourse(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): void {
  assertAuthenticRunnerLaboratoryCourse(
    course,
    state.runSeed,
    state.difficulty,
  );
  assertRunnerLaboratorySaveInvariantsAgainstCourse(state, course);
}

export function assertRunnerLaboratorySaveInvariants(state: RunStateV1): void {
  const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
  assertAuthenticRunnerLaboratoryCourse(course, state.runSeed, state.difficulty);
  assertRunnerLaboratorySaveInvariantsAgainstCourse(state, course);
}

/**
 * Performs the oracle equality check that structural save validation cannot.
 * The callback must deterministically replay the neutral Manual policy; this
 * function never treats save-authored target scores as oracle provenance.
 */
export function verifyRunnerLaboratoryAutomaticOracleEquality(
  state: RunStateV1,
  recomputeNeutralManualOracle: RunnerLaboratoryNeutralOracleRecomputer,
): boolean {
  try {
    assertRunnerLaboratorySaveInvariants(state);
    if (
      state.controlMode !== "automatic-assist" ||
      state.stage.settlement === null
    ) {
      return false;
    }
    const oracle = recomputeNeutralManualOracle(Object.freeze({
      contentVersion: state.contentVersion,
      runSeed: state.runSeed,
      difficulty: state.difficulty,
      startingProfileId: state.startingProfileId,
      liveAutomaticRunId: state.runId,
      reconstructedManualRunId: deriveRunIdFromStateV1(state, "manual"),
      ...retainedProtectedRunSetupV1(state),
    }));
    if (
      !SCORE_IDS.every((scoreId) =>
        Number.isInteger(oracle[scoreId]) &&
        oracle[scoreId] >= 0 &&
        oracle[scoreId] <= 100)
    ) {
      return false;
    }
    const starting = STARTING_PROFILE_SCORES[state.startingProfileId];
    const expectedIds = RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder
      .flatMap((scoreId) => oracle[scoreId] === starting[scoreId]
        ? []
        : [RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId]]);
    if (!sameStringArray(state.stage.settlement.effectIds, expectedIds)) {
      return false;
    }
    if (state.stage.settlement.status === "pending") return true;
    return sameScores(state.scores, oracle) &&
      state.effectLedger.recent.every((effect) =>
        effect.requestedDelta === oracle[effect.scoreId] - starting[effect.scoreId]);
  } catch {
    return false;
  }
}
