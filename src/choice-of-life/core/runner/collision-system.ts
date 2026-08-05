import {
  applyEffect,
  type AppliedEffect,
  type EffectLedger,
} from "../effect-ledger";
import type {
  ControlMode,
  CoreScores,
  Difficulty,
  RunnerEntity,
  ScoreId,
} from "../run-state";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_MOVEMENT_CONTRACT,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "./contract";
import {
  assertAuthenticRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedEntity,
  type RunnerLabGeneratedPattern,
} from "./course-generator";

export const RUNNER_PLAYER_X_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.playerXMilli;
export const RUNNER_PLAYER_HALF_WIDTH_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.playerHalfWidthMilli;
export const RUNNER_ENTITY_WIDTH_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli;
export const RUNNER_LANE_HALF_WIDTH_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.laneHalfWidthMilli;
export const RUNNER_INVULNERABILITY_TICKS =
  RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks;
export const RUNNER_LANE_CENTERS_MILLI =
  RUNNER_LABORATORY_MOVEMENT_CONTRACT.laneCentersMilli;

const ENTITY_ID = /^entity-([0-9a-f]{16})$/;

export interface RunnerScoringDefinition {
  readonly contentId: string;
  readonly kind: "benefit" | "hazard";
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly categoryId: string;
}

export interface ContactCandidate {
  readonly entity: RunnerEntity;
}

export type ContactOutcome =
  | "benefit-applied"
  | "hazard-applied"
  | "hazard-suppressed"
  | "automatic-pass"
  | "non-scoring-resolved"
  | "already-resolved";

export interface ContactEvent {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly simulationTick: number;
  readonly outcome: ContactOutcome;
  readonly effect: AppliedEffect | null;
}

export interface ContactResolutionInput {
  readonly course: RunnerLabGeneratedCourse;
  readonly runSeed: string;
  readonly difficulty: Difficulty;
  readonly candidates: readonly ContactCandidate[];
  readonly controlMode: ControlMode;
  readonly simulationTick: number;
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly invulnerableUntilTick: number;
  readonly resolvedEntityIds: readonly string[];
}

export interface ContactResolutionResult {
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly invulnerableUntilTick: number;
  readonly newlyResolvedEntityIds: readonly string[];
  readonly resolvedEntityIds: readonly string[];
  readonly effectIds: readonly string[];
  readonly events: readonly ContactEvent[];
}

export interface EntityAdvanceInput extends Omit<ContactResolutionInput, "candidates"> {
  readonly activeEntities: readonly RunnerEntity[];
  readonly playerLanePositionMilli: number;
}

export interface EntityAdvanceResult extends ContactResolutionResult {
  readonly activeEntities: readonly RunnerEntity[];
  readonly passedEntityIds: readonly string[];
}

function assertSafeNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

export function compareRunnerEntityCoordinates(
  left: Pick<RunnerEntity, "patternIndex" | "slotIndex" | "instanceId">,
  right: Pick<RunnerEntity, "patternIndex" | "slotIndex" | "instanceId">,
): number {
  return (
    left.patternIndex - right.patternIndex ||
    left.slotIndex - right.slotIndex ||
    left.instanceId.localeCompare(right.instanceId)
  );
}

export function effectIdForRunnerEntity(instanceId: string): string {
  const match = ENTITY_ID.exec(instanceId);
  if (match === null) throw new TypeError("runner entity ID is invalid");
  return `effect-${match[1]}`;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function freezeEvent(event: ContactEvent): ContactEvent {
  return Object.freeze(event);
}

function immutableScores(scores: CoreScores): CoreScores {
  return Object.isFrozen(scores)
    ? scores
    : Object.freeze({
      health: scores.health,
      happiness: scores.happiness,
      money: scores.money,
    });
}

function ledgerIsDeeplyFrozen(ledger: EffectLedger): boolean {
  return Object.isFrozen(ledger) &&
    Object.isFrozen(ledger.recent) &&
    ledger.recent.every((effect) => Object.isFrozen(effect)) &&
    Object.isFrozen(ledger.totalsBySource) &&
    Object.values(ledger.totalsBySource).every((totals) => Object.isFrozen(totals));
}

function immutableLedger(ledger: EffectLedger): EffectLedger {
  if (ledgerIsDeeplyFrozen(ledger)) return ledger;
  const totalsBySource = Object.freeze(Object.fromEntries(
    Object.entries(ledger.totalsBySource).map(([source, totals]) => [
      source,
      Object.freeze({ ...totals }),
    ]),
  )) as EffectLedger["totalsBySource"];
  return Object.freeze({
    recent: Object.freeze(ledger.recent.map((effect) => Object.freeze({ ...effect }))),
    totalsBySource,
  });
}

function generatedScoringEntity(
  course: RunnerLabGeneratedCourse,
  entity: RunnerEntity,
): RunnerLabGeneratedEntity {
  const pattern = course.patterns[entity.patternIndex - 1];
  const expected = pattern?.entities.find(
    (candidate) => candidate.instanceId === entity.instanceId,
  );
  if (expected === undefined) {
    throw new TypeError("runner scoring entity is not part of the authentic course");
  }
  if (
    entity.contentId !== expected.contentId ||
    entity.kind !== expected.kind ||
    entity.patternIndex !== expected.patternIndex ||
    entity.slotIndex !== expected.slotIndex ||
    entity.lane !== expected.lane ||
    entity.widthMilli !== expected.widthMilli
  ) {
    throw new TypeError("runner scoring entity geometry differs from the authentic course");
  }
  return expected;
}

function generatedDecisionMarker(
  course: RunnerLabGeneratedCourse,
  entity: RunnerEntity,
): RunnerLabGeneratedPattern["decisionMarker"] {
  const expected = course.patterns[entity.patternIndex - 1]?.decisionMarker;
  if (
    expected === undefined ||
    entity.instanceId !== expected.instanceId ||
    entity.contentId !== expected.contentId ||
    entity.kind !== expected.kind ||
    entity.patternIndex !== expected.patternIndex ||
    entity.slotIndex !== expected.slotIndex ||
    entity.lane !== expected.lane ||
    entity.widthMilli !== expected.widthMilli
  ) {
    throw new TypeError("runner decision marker differs from the authentic course");
  }
  return expected;
}

function scoringDefinitionFor(entity: RunnerEntity): RunnerScoringDefinition {
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
    entity.contentId as never,
  );
  if (definition === undefined) {
    throw new TypeError("runner scoring entity lacks its locked definition");
  }
  return definition;
}

function assertCandidate(
  candidate: ContactCandidate,
  course: RunnerLabGeneratedCourse,
): RunnerScoringDefinition {
  if (candidate.entity.contactState !== "pending") {
    throw new TypeError("contact candidates must be pending");
  }
  generatedScoringEntity(course, candidate.entity);
  const definition = scoringDefinitionFor(candidate.entity);
  if (definition.kind !== candidate.entity.kind) {
    throw new TypeError("locked contact definition does not match its entity");
  }
  return definition;
}

function assertResolvedLedger(
  resolvedEntityIds: readonly string[],
  course: RunnerLabGeneratedCourse,
): void {
  if (resolvedEntityIds.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds) {
    throw new RangeError("resolved runner entity count exceeds the locked laboratory cap");
  }
  const expected = [...new Set(resolvedEntityIds)].sort((left, right) => left.localeCompare(right));
  if (
    expected.length !== resolvedEntityIds.length ||
    expected.some((id, index) => id !== resolvedEntityIds[index])
  ) {
    throw new TypeError("resolved runner entity IDs must be unique and canonical");
  }
  const courseIds = new Set(course.canonicalEntityIds);
  if (resolvedEntityIds.some((id) => !courseIds.has(id))) {
    throw new TypeError("resolved runner entity ID is outside the authentic course");
  }
}

export function resolveCanonicalContactCandidates(
  input: ContactResolutionInput,
): ContactResolutionResult {
  assertAuthenticRunnerLaboratoryCourse(input.course, input.runSeed, input.difficulty);
  assertSafeNonnegativeInteger(input.simulationTick, "simulation tick");
  assertSafeNonnegativeInteger(input.invulnerableUntilTick, "invulnerability tick");
  assertResolvedLedger(input.resolvedEntityIds, input.course);
  const canonical = [...input.candidates].sort((left, right) =>
    compareRunnerEntityCoordinates(left.entity, right.entity));
  const definitions = new Map(
    canonical.map((candidate) => [candidate.entity.instanceId, assertCandidate(candidate, input.course)]),
  );

  let scores = immutableScores(input.scores);
  let ledger = immutableLedger(input.ledger);
  let invulnerableUntilTick = input.invulnerableUntilTick;
  const priorResolved = new Set(input.resolvedEntityIds);
  const newlyResolved: string[] = [];
  const newlyResolvedSet = new Set<string>();
  const effectIds: string[] = [];
  const events: ContactEvent[] = [];

  for (const candidate of canonical) {
    const { entity } = candidate;
    const definition = definitions.get(entity.instanceId);
    if (definition === undefined) {
      throw new TypeError("locked contact definition lookup failed");
    }
    if (priorResolved.has(entity.instanceId) || newlyResolvedSet.has(entity.instanceId)) {
      events.push(freezeEvent({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        simulationTick: input.simulationTick,
        outcome: "already-resolved",
        effect: null,
      }));
      continue;
    }
    newlyResolved.push(entity.instanceId);
    newlyResolvedSet.add(entity.instanceId);

    if (input.controlMode === "automatic-assist") {
      events.push(freezeEvent({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        simulationTick: input.simulationTick,
        outcome: "automatic-pass",
        effect: null,
      }));
      continue;
    }
    if (
      definition.kind === "hazard" &&
      input.simulationTick < invulnerableUntilTick
    ) {
      events.push(freezeEvent({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        simulationTick: input.simulationTick,
        outcome: "hazard-suppressed",
        effect: null,
      }));
      continue;
    }

    const application = applyEffect(scores, ledger, {
      effectId: effectIdForRunnerEntity(entity.instanceId),
      scoreId: definition.scoreId,
      requestedDelta: definition.requestedDelta,
      source: "runner",
      categoryId: definition.categoryId,
      causedByChoiceId: null,
      transactionId: null,
      simulationTick: input.simulationTick,
    });
    scores = application.scores;
    ledger = application.ledger;
    effectIds.push(application.effect.effectId);
    if (definition.kind === "hazard") {
      invulnerableUntilTick = input.simulationTick + RUNNER_INVULNERABILITY_TICKS;
    }
    events.push(freezeEvent({
      entityInstanceId: entity.instanceId,
      contentId: entity.contentId,
      simulationTick: input.simulationTick,
      outcome: definition.kind === "hazard" ? "hazard-applied" : "benefit-applied",
      effect: application.effect,
    }));
  }

  const resolvedEntityIds = sortedUnique([
    ...input.resolvedEntityIds,
    ...newlyResolved,
  ]);
  if (resolvedEntityIds.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds) {
    throw new RangeError("resolved runner entity count exceeds the locked laboratory cap");
  }

  return Object.freeze({
    scores,
    ledger,
    invulnerableUntilTick,
    newlyResolvedEntityIds: Object.freeze([...newlyResolved].sort()),
    resolvedEntityIds,
    effectIds: Object.freeze(effectIds),
    events: Object.freeze(events),
  });
}

export function runnerEntityHorizontallyOverlapsPlayer(entityXMilli: number): boolean {
  if (!Number.isSafeInteger(entityXMilli)) {
    throw new TypeError("entity X must be a safe integer");
  }
  const entityHalfWidth = RUNNER_ENTITY_WIDTH_MILLI / 2;
  return Math.abs(entityXMilli - RUNNER_PLAYER_X_MILLI) <=
    RUNNER_PLAYER_HALF_WIDTH_MILLI + entityHalfWidth;
}

export function runnerEntityLaneOverlapsPlayer(
  entityLane: RunnerEntity["lane"],
  playerLanePositionMilli: number,
): boolean {
  if (!Number.isSafeInteger(playerLanePositionMilli)) {
    throw new TypeError("player lane position must be a safe integer");
  }
  return Math.abs(
    playerLanePositionMilli - RUNNER_LANE_CENTERS_MILLI[entityLane],
  ) <= RUNNER_LANE_HALF_WIDTH_MILLI;
}

export function runnerPatternSafeBoundaryTick(
  pattern: RunnerLabGeneratedPattern,
  worldSpeedMilliPerTick: number,
): number {
  if (!Number.isSafeInteger(worldSpeedMilliPerTick) || worldSpeedMilliPerTick <= 0) {
    throw new TypeError("world speed must be a positive safe integer");
  }
  if (pattern.entities.length === 0) return pattern.anchorTick;
  const overlapTicks = Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
      worldSpeedMilliPerTick,
  );
  return Math.max(...pattern.entities.map(
    (entity) => entity.contactTick + overlapTicks + 1,
  ));
}

function assertActiveEntityAtPriorTick(
  entity: RunnerEntity,
  input: EntityAdvanceInput,
): RunnerLabGeneratedEntity | RunnerLabGeneratedPattern["decisionMarker"] {
  const pattern = input.course.patterns[entity.patternIndex - 1];
  if (pattern === undefined || input.simulationTick <= pattern.spawnTick) {
    throw new TypeError("active runner entity does not precede this logical tick");
  }
  const expected = entity.kind === "opportunity"
    ? generatedDecisionMarker(input.course, entity)
    : generatedScoringEntity(input.course, entity);
  const expectedXMilli = expected.xMilli -
    input.course.worldSpeedMilliPerTick *
      (input.simulationTick - 1 - pattern.spawnTick);
  if (entity.xMilli !== expectedXMilli) {
    throw new TypeError("active runner entity X differs from the authentic course timeline");
  }
  return expected;
}

export function advanceAndResolveRunnerEntities(
  input: EntityAdvanceInput,
): EntityAdvanceResult {
  assertAuthenticRunnerLaboratoryCourse(input.course, input.runSeed, input.difficulty);
  assertSafeNonnegativeInteger(input.simulationTick, "simulation tick");
  assertResolvedLedger(input.resolvedEntityIds, input.course);
  if (input.activeEntities.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities) {
    throw new RangeError("active runner entity count exceeds the locked laboratory cap");
  }
  const priorResolved = new Set(input.resolvedEntityIds);
  const moved = [...input.activeEntities]
    .sort(compareRunnerEntityCoordinates)
    .map((entity) => Object.freeze({
      ...entity,
      xMilli: entity.xMilli - input.course.worldSpeedMilliPerTick,
    }));
  const candidates: ContactCandidate[] = [];
  const passedEntityIds: string[] = [];
  const retained: RunnerEntity[] = [];
  const playerLeftBoundary =
    RUNNER_PLAYER_X_MILLI - RUNNER_PLAYER_HALF_WIDTH_MILLI - RUNNER_ENTITY_WIDTH_MILLI / 2;

  for (const entity of moved) {
    const expected = assertActiveEntityAtPriorTick(
      Object.freeze({
        ...entity,
        xMilli: entity.xMilli + input.course.worldSpeedMilliPerTick,
      }),
      input,
    );
    if (priorResolved.has(entity.instanceId)) {
      throw new TypeError("active runner entity is already resolved");
    }
    if (entity.contactState !== "pending") {
      throw new TypeError("active laboratory entities must remain pending until terminalized");
    }
    const overlaps = runnerEntityHorizontallyOverlapsPlayer(entity.xMilli) &&
      runnerEntityLaneOverlapsPlayer(entity.lane, input.playerLanePositionMilli);
    if (entity.kind !== "opportunity" && overlaps) {
      candidates.push({ entity });
      continue;
    }
    if (entity.kind === "opportunity") {
      const pattern = input.course.patterns[entity.patternIndex - 1];
      if (pattern === undefined || expected.instanceId !== pattern.decisionMarker.instanceId) {
        throw new TypeError("decision marker pattern authority is missing");
      }
      const safeTick = runnerPatternSafeBoundaryTick(
        pattern,
        input.course.worldSpeedMilliPerTick,
      );
      if (input.simulationTick >= safeTick) {
        passedEntityIds.push(entity.instanceId);
        continue;
      }
      retained.push(entity);
      continue;
    }
    if (entity.contactState === "pending" && entity.xMilli < playerLeftBoundary) {
      passedEntityIds.push(entity.instanceId);
      continue;
    }
    retained.push(entity);
  }

  const contacts = resolveCanonicalContactCandidates({
    course: input.course,
    runSeed: input.runSeed,
    difficulty: input.difficulty,
    candidates,
    controlMode: input.controlMode,
    simulationTick: input.simulationTick,
    scores: input.scores,
    ledger: input.ledger,
    invulnerableUntilTick: input.invulnerableUntilTick,
    resolvedEntityIds: input.resolvedEntityIds,
  });
  const allResolved = sortedUnique([
    ...contacts.resolvedEntityIds,
    ...passedEntityIds,
  ]);
  if (allResolved.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds) {
    throw new RangeError("resolved runner entity count exceeds the locked laboratory cap");
  }
  if (retained.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities) {
    throw new RangeError("retained runner entity count exceeds the locked laboratory cap");
  }

  return Object.freeze({
    ...contacts,
    resolvedEntityIds: allResolved,
    activeEntities: Object.freeze(retained),
    passedEntityIds: Object.freeze([...passedEntityIds].sort()),
  });
}
