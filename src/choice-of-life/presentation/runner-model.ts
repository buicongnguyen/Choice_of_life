import { LOGICAL_TICK_MILLISECONDS } from "../core/stage-clock";
import type { Lane, RunStateV1, ScoreId } from "../core/run-state";
import { runIdMatchesRetainedIdentityV1 } from "../core/run-factory";
import {
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LABORATORY_STAGE_ID,
} from "../core/runner/contract";
import { runnerPatternSafeBoundaryTick } from "../core/runner/collision-system";
import {
  assertAuthenticRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedEntity,
  type RunnerLabGeneratedPattern,
} from "../core/runner/course-generator";
import { assertRunnerLaboratorySaveInvariants } from "../core/runner/save-invariants";

export const RUNNER_LANE_LABELS = Object.freeze({
  0: "Top lane",
  1: "Middle lane",
  2: "Bottom lane",
} as const satisfies Readonly<Record<Lane, string>>);

export const RUNNER_SCORE_LABELS = Object.freeze({
  health: "Health",
  happiness: "Happiness",
  money: "Financial security",
} as const satisfies Readonly<Record<ScoreId, string>>);

export interface RunnerWarningItem {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly kind: "benefit" | "hazard";
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly contactTick: number;
  readonly ticksUntilContact: number;
  readonly millisecondsUntilContact: number;
  readonly meaningText: string;
}

export interface RunnerLaneWarning {
  readonly lane: Lane;
  readonly laneLabel: string;
  readonly benefits: readonly RunnerWarningItem[];
  readonly hazards: readonly RunnerWarningItem[];
  readonly urgencyTicks: number;
  readonly urgencyMilliseconds: number;
  readonly benefitText: string;
  readonly hazardText: string;
  readonly urgencyText: string;
  readonly accessibleLabel: string;
}

export interface RunnerPatternWarningProjection {
  readonly projectionId: "runner-pattern-warning-projection-v1";
  readonly patternIndex: number;
  readonly patternId: string;
  readonly anchorTick: number;
  readonly safeBoundaryTick: number;
  readonly observedAtTick: number;
  readonly lanes: readonly [RunnerLaneWarning, RunnerLaneWarning, RunnerLaneWarning];
}

export interface RunnerSemanticDecisionModel {
  readonly promptId: "runner-semantic-lane-choice-v1";
  readonly legend: string;
  readonly decisionMarkerInstanceId: string;
  readonly patternIndex: number;
  /** The visual playfield and fieldset intentionally share this exact object. */
  readonly warning: RunnerPatternWarningProjection;
  readonly choices: readonly [RunnerLaneWarning, RunnerLaneWarning, RunnerLaneWarning];
}

/**
 * One render-bound source for both the visual warning layer and its optional
 * Semantic fieldset. Consumers must not derive those two views separately.
 */
export interface RunnerPresentationModel {
  readonly presentationId: "runner-presentation-model-v1";
  readonly warning: RunnerPatternWarningProjection;
  readonly semanticDecision: RunnerSemanticDecisionModel | null;
}

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner presentation: ${message}`);
  }
  throw new TypeError();
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function warningItem(
  entity: RunnerLabGeneratedEntity,
  simulationTick: number,
): RunnerWarningItem {
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
    entity.contentId,
  );
  if (definition === undefined || definition.kind !== entity.kind) {
    fail("generated warning entity lacks an exact scoring definition");
  }
  const ticksUntilContact = Math.max(0, entity.contactTick - simulationTick);
  const sign = definition.requestedDelta > 0 ? "+" : "−";
  return deepFreeze({
    entityInstanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: definition.kind,
    scoreId: definition.scoreId,
    requestedDelta: definition.requestedDelta,
    contactTick: entity.contactTick,
    ticksUntilContact,
    millisecondsUntilContact: ticksUntilContact * LOGICAL_TICK_MILLISECONDS,
    meaningText:
      `${RUNNER_SCORE_LABELS[definition.scoreId]} ${sign}${Math.abs(definition.requestedDelta)}`,
  });
}

function joinedMeaning(items: readonly RunnerWarningItem[], empty: string): string {
  return items.length === 0
    ? empty
    : items.map((item) => item.meaningText).join(", ");
}

function laneWarning(
  lane: Lane,
  entities: readonly RunnerLabGeneratedEntity[],
  simulationTick: number,
  anchorTick: number,
): RunnerLaneWarning {
  const items = entities
    .filter((entity) => entity.lane === lane)
    .map((entity) => warningItem(entity, simulationTick));
  const benefits = Object.freeze(items.filter((item) => item.kind === "benefit"));
  const hazards = Object.freeze(items.filter((item) => item.kind === "hazard"));
  const urgencyTicks = items.length === 0
    ? Math.max(0, anchorTick - simulationTick)
    : Math.min(...items.map((item) => item.ticksUntilContact));
  const urgencyMilliseconds = urgencyTicks * LOGICAL_TICK_MILLISECONDS;
  const benefitText = joinedMeaning(benefits, "No benefit");
  const hazardText = joinedMeaning(hazards, "No hazard");
  const urgencyText = urgencyTicks === 0
    ? "At the decision line now"
    : `${urgencyTicks} ticks (${urgencyMilliseconds} ms) to the nearest event`;
  const laneLabel = RUNNER_LANE_LABELS[lane];
  return deepFreeze({
    lane,
    laneLabel,
    benefits,
    hazards,
    urgencyTicks,
    urgencyMilliseconds,
    benefitText,
    hazardText,
    urgencyText,
    accessibleLabel:
      `${laneLabel}. Benefit: ${benefitText}. Hazard: ${hazardText}. Urgency: ${urgencyText}.`,
  });
}

interface CurrentPatternPresentationSource {
  readonly pattern: RunnerLabGeneratedPattern;
  readonly activeScoringEntities: readonly RunnerLabGeneratedEntity[];
}

function currentPatternPresentationSource(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): CurrentPatternPresentationSource | null {
  assertAuthenticRunnerLaboratoryCourse(course, state.runSeed, state.difficulty);
  if (
    state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
    state.stage.phase !== "active" ||
    state.runner === null
  ) {
    return null;
  }

  // Presentation is a trust boundary too: a decoded state may be a fresh
  // object, but its entire active prefix must still be the authentic course
  // projection before any visual or nonvisual information is exposed.
  assertRunnerLaboratorySaveInvariants(state);
  if (!runIdMatchesRetainedIdentityV1(state)) {
    fail("run ID does not match the deterministic runner setup");
  }

  const patternIndex = state.runner.spawn.patternIndex;
  const pattern = course.patterns[patternIndex - 1];
  if (pattern === undefined || state.simulationTick < pattern.spawnTick) return null;
  const safeBoundaryTick = runnerPatternSafeBoundaryTick(
    pattern,
    course.worldSpeedMilliPerTick,
  );
  if (state.simulationTick >= safeBoundaryTick) return null;

  const generatedById = new Map(
    pattern.entities.map((entity) => [entity.instanceId, entity] as const),
  );
  const activeScoringEntities = state.runner.activeEntities.flatMap((entity) => {
    if (entity.kind === "opportunity" || entity.patternIndex !== patternIndex) {
      return [];
    }
    const generated = generatedById.get(entity.instanceId);
    if (generated === undefined) {
      fail("active scoring entity is outside the authentic current pattern");
    }
    return [generated];
  });

  // A nonquiet pattern with no remaining scoring entity has no visual warning
  // horizon left. Quiet windows intentionally retain their marker/anchor model.
  if (pattern.entities.length > 0 && activeScoringEntities.length === 0) {
    return null;
  }
  return deepFreeze({
    pattern,
    activeScoringEntities: Object.freeze(activeScoringEntities),
  });
}

function createPatternWarningProjection(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  source: CurrentPatternPresentationSource,
): RunnerPatternWarningProjection {
  const { pattern, activeScoringEntities } = source;
  const safeBoundaryTick = runnerPatternSafeBoundaryTick(
    pattern,
    course.worldSpeedMilliPerTick,
  );
  const lanes = Object.freeze([
    laneWarning(0, activeScoringEntities, state.simulationTick, pattern.anchorTick),
    laneWarning(1, activeScoringEntities, state.simulationTick, pattern.anchorTick),
    laneWarning(2, activeScoringEntities, state.simulationTick, pattern.anchorTick),
  ]) as readonly [RunnerLaneWarning, RunnerLaneWarning, RunnerLaneWarning];
  return deepFreeze({
    projectionId: "runner-pattern-warning-projection-v1" as const,
    patternIndex: pattern.patternIndex,
    patternId: pattern.patternId,
    anchorTick: pattern.anchorTick,
    safeBoundaryTick,
    observedAtTick: state.simulationTick,
    lanes,
  });
}

function createSemanticDecisionModel(
  state: RunStateV1,
  source: CurrentPatternPresentationSource,
  warning: RunnerPatternWarningProjection,
): RunnerSemanticDecisionModel | null {
  if (
    state.controlMode !== "semantic-assist" ||
    state.runner === null ||
    state.runner.motion.kind !== "idle" ||
    state.runner.inputBuffer !== null
  ) return null;
  const expectedMarker = source.pattern.decisionMarker;
  const markers = state.runner.activeEntities.filter((entity) =>
    entity.instanceId === expectedMarker.instanceId &&
    entity.contentId === expectedMarker.contentId &&
    entity.kind === expectedMarker.kind &&
    entity.patternIndex === expectedMarker.patternIndex &&
    entity.slotIndex === expectedMarker.slotIndex &&
    entity.lane === expectedMarker.lane &&
    entity.widthMilli === expectedMarker.widthMilli &&
    entity.contactState === "pending" &&
    !state.runner!.spawn.resolvedEntityIds.includes(entity.instanceId));
  if (markers.length === 0) return null;
  if (markers.length !== 1) fail("Semantic checkpoint has multiple decision markers");
  return deepFreeze({
    promptId: "runner-semantic-lane-choice-v1" as const,
    legend: "Choose a lane. This decision is untimed.",
    decisionMarkerInstanceId: markers[0]!.instanceId,
    patternIndex: warning.patternIndex,
    warning,
    choices: warning.lanes,
  });
}

/**
 * Builds the latest authentic current-pattern presentation once. The playfield
 * reads `warning`; the Semantic fieldset reads `semanticDecision`, whose
 * `warning` and `choices` retain exact reference identity with that same source.
 */
export function createRunnerPresentationModel(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): RunnerPresentationModel | null {
  const source = currentPatternPresentationSource(state, course);
  if (source === null) return null;
  const warning = createPatternWarningProjection(state, course, source);
  const semanticDecision = createSemanticDecisionModel(state, source, warning);
  return deepFreeze({
    presentationId: "runner-presentation-model-v1" as const,
    warning,
    semanticDecision,
  });
}
