import { deriveEntityInstanceIdV1 } from "../instance-id";
import { createPatternEntropy } from "../pattern-entropy";
import type { Difficulty, Lane } from "../run-state";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_DIFFICULTY_CONTRACTS,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_MARKERS,
  RUNNER_LABORATORY_PATTERN_TEMPLATES,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
  type RunnerLaboratoryLaneRole,
  type RunnerLaboratoryOptionalGroupId,
  type RunnerLaboratoryPatternCategory,
  type RunnerLaboratoryPatternId,
  type RunnerLaboratoryPatternSlotContract,
  type RunnerLaboratoryScoringDefinition,
  type RunnerLaboratoryScoringEntityId,
} from "./contract";

export const RUNNER_LAB_GENERATOR_ID =
  RUNNER_LABORATORY_GENERATOR_CONTRACT.algorithmId;
export const RUNNER_LAB_STAGE_ID = RUNNER_LABORATORY_STAGE_ID;
export const RUNNER_LAB_START_MARKER_ID =
  RUNNER_LABORATORY_MARKERS.initial.contentId;
export const RUNNER_LAB_DECISION_MARKER_ID =
  RUNNER_LABORATORY_MARKERS.decision.contentId;
export const RUNNER_LAB_FINISH_MARKER_ID =
  RUNNER_LABORATORY_MARKERS.terminal.contentId;

export const RUNNER_LAB_COURSE_PATTERN_COUNT =
  RUNNER_LABORATORY_STAGE_CONTRACT.decisionWindowCount;
export const RUNNER_LAB_INITIAL_PATTERN_INDEX =
  RUNNER_LABORATORY_GENERATOR_CONTRACT.initialPatternIndex;
export const RUNNER_LAB_TERMINAL_PATTERN_INDEX =
  RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalPatternIndex;
export const RUNNER_LAB_DURATION_TICKS =
  RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
export const RUNNER_LAB_TERMINAL_SPAWN_TICK =
  RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalSpawnTick;

const FIRST_WINDOW_ANCHOR_TICK =
  RUNNER_LABORATORY_STAGE_CONTRACT.firstWindowAnchorTick;
const WINDOW_ANCHOR_SPACING_TICKS =
  RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorSpacingTicks;
const FIRST_HORIZONTAL_OVERLAP_X_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.firstHorizontalOverlapEntityCenterXMilli;
const ENTITY_WIDTH_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli;
const MARKER_WIDTH_MILLI = RUNNER_LABORATORY_MARKERS.decision.widthMilli;
const MARKER_SLOT_INDEX = RUNNER_LABORATORY_MARKERS.decision.slotIndex;

export type RunnerLabPatternId = RunnerLaboratoryPatternId;
export type RunnerLabPatternCategory = RunnerLaboratoryPatternCategory;
export type RunnerLabEntityContentId = RunnerLaboratoryScoringEntityId;
export type RunnerLabOptionalGroupId = RunnerLaboratoryOptionalGroupId;
export type RunnerLabLaneRole = RunnerLaboratoryLaneRole;
export type RunnerLabEntityDefinition = RunnerLaboratoryScoringDefinition;
export type RunnerLabPatternSlot = RunnerLaboratoryPatternSlotContract;

export interface RunnerLabPatternTemplate {
  readonly templateIndex: number;
  readonly patternId: RunnerLabPatternId;
  readonly category: RunnerLabPatternCategory;
  readonly occurrenceCount: number;
  readonly legalRotations: readonly Lane[];
  readonly slots: readonly RunnerLabPatternSlot[];
}

export interface RunnerLabPatternCopy {
  readonly copyOrdinal: number;
  readonly templateIndex: number;
  readonly copyIndex: number;
  readonly patternId: RunnerLabPatternId;
}

export interface RunnerLabDifficultyParameters {
  readonly difficulty: Difficulty;
  readonly worldSpeedMilliPerTick: number;
  readonly optionalDensity: number;
  readonly leadTicks: number;
  readonly variantId:
    | "runner-lab-story-variant-v1"
    | "runner-lab-normal-variant-v1"
    | "runner-lab-challenge-variant-v1";
}

export interface RunnerLabSpawnCursor {
  readonly patternIndex: number;
  readonly nextSpawnTick: number;
  readonly nextSpawnDistanceMilli: number;
}

export interface RunnerLabGeneratedEntity {
  readonly instanceId: string;
  readonly contentId: RunnerLabEntityContentId;
  readonly kind: "benefit" | "hazard";
  readonly patternIndex: number;
  readonly slotIndex: number;
  readonly lane: Lane;
  readonly xMilli: number;
  readonly widthMilli: typeof ENTITY_WIDTH_MILLI;
  readonly contactTick: number;
  readonly contactOffsetTicks: number;
  readonly optionalGroupId: RunnerLabOptionalGroupId | null;
  readonly contactState: "pending";
}

interface RunnerLabGeneratedMarkerBase {
  readonly instanceId: string;
  readonly kind: "opportunity";
  readonly patternIndex: number;
  readonly slotIndex: typeof MARKER_SLOT_INDEX;
  readonly lane: 1;
  readonly xMilli: number;
  readonly widthMilli: typeof MARKER_WIDTH_MILLI;
  readonly collisionParticipation: "none";
}

export interface RunnerLabGeneratedDecisionMarker
  extends RunnerLabGeneratedMarkerBase {
  readonly contentId: typeof RUNNER_LAB_DECISION_MARKER_ID;
  readonly representation: "runner-entity";
  readonly storedInActiveEntities: true;
  readonly contactState: "pending";
}

export interface RunnerLabGeneratedSentinelMarker
  extends RunnerLabGeneratedMarkerBase {
  readonly contentId:
    | typeof RUNNER_LAB_START_MARKER_ID
    | typeof RUNNER_LAB_FINISH_MARKER_ID;
  readonly representation: "resolved-id-sentinel";
  readonly storedInActiveEntities: false;
}

export type RunnerLabGeneratedMarker =
  | RunnerLabGeneratedDecisionMarker
  | RunnerLabGeneratedSentinelMarker;

export interface RunnerLabGeneratedPattern {
  readonly patternIndex: number;
  readonly patternId: RunnerLabPatternId;
  readonly category: RunnerLabPatternCategory;
  readonly templateIndex: number;
  readonly copyIndex: number;
  readonly copyOrdinal: number;
  readonly permutationToken: number;
  readonly rotation: Lane;
  readonly anchorTick: number;
  readonly spawnTick: number;
  readonly spawnDistanceMilli: number;
  readonly incomingCursor: RunnerLabSpawnCursor;
  readonly outgoingCursor: RunnerLabSpawnCursor;
  readonly includedOptionalGroupIds: readonly RunnerLabOptionalGroupId[];
  readonly entities: readonly RunnerLabGeneratedEntity[];
  readonly decisionMarker: RunnerLabGeneratedDecisionMarker;
  readonly spawnEntities: readonly (
    | RunnerLabGeneratedEntity
    | RunnerLabGeneratedMarker
  )[];
}

export interface RunnerLabGeneratedCourse {
  readonly generatorId: typeof RUNNER_LAB_GENERATOR_ID;
  readonly runSeed: string;
  readonly stageId: typeof RUNNER_LAB_STAGE_ID;
  readonly difficulty: Difficulty;
  readonly worldSpeedMilliPerTick: number;
  readonly initialCursor: RunnerLabSpawnCursor;
  readonly terminalCursor: RunnerLabSpawnCursor;
  readonly completedCursor: RunnerLabSpawnCursor;
  readonly startMarker: RunnerLabGeneratedSentinelMarker;
  readonly finishMarker: RunnerLabGeneratedSentinelMarker;
  readonly patterns: readonly RunnerLabGeneratedPattern[];
  readonly includedOptionalGroupKeys: readonly string[];
  readonly canonicalEntityIds: readonly string[];
}

const AUTHENTIC_RUNNER_LABORATORY_COURSES = new WeakSet<object>();

export function isAuthenticRunnerLaboratoryCourse(
  value: unknown,
  runSeed: string,
  difficulty: Difficulty,
): value is RunnerLabGeneratedCourse {
  if (typeof value !== "object" || value === null) return false;
  if (!AUTHENTIC_RUNNER_LABORATORY_COURSES.has(value)) return false;
  const course = value as RunnerLabGeneratedCourse;
  return (
    course.runSeed === runSeed &&
    course.difficulty === difficulty &&
    course.stageId === RUNNER_LAB_STAGE_ID
  );
}

export function assertAuthenticRunnerLaboratoryCourse(
  value: unknown,
  runSeed: string,
  difficulty: Difficulty,
): asserts value is RunnerLabGeneratedCourse {
  if (!isAuthenticRunnerLaboratoryCourse(value, runSeed, difficulty)) {
    throw new TypeError("Runner laboratory course identity is not authentic");
  }
}

function frozenArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export const RUNNER_LAB_SCORING_DEFINITIONS_BY_CONTENT_ID =
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID;

export const RUNNER_LAB_PATTERN_TEMPLATES: readonly RunnerLabPatternTemplate[] =
  frozenArray(
    RUNNER_LABORATORY_PATTERN_TEMPLATES.map((template, templateIndex) =>
      Object.freeze({ ...template, templateIndex })),
  );

export const RUNNER_LAB_PATTERN_COPIES: readonly RunnerLabPatternCopy[] =
  RUNNER_LABORATORY_GENERATOR_CONTRACT.copyOrdinalMapping;

function lockedDifficultyParameters(
  difficulty: Difficulty,
): RunnerLabDifficultyParameters {
  const parameters = RUNNER_LABORATORY_DIFFICULTY_CONTRACTS.find(
    (candidate) => candidate.difficulty === difficulty,
  );
  if (parameters === undefined) {
    throw new TypeError(`Unsupported runner laboratory difficulty: ${difficulty}`);
  }
  return parameters;
}

export const RUNNER_LAB_DIFFICULTY_PARAMETERS: Readonly<
  Record<Difficulty, RunnerLabDifficultyParameters>
> = Object.freeze({
  story: lockedDifficultyParameters("story"),
  normal: lockedDifficultyParameters("normal"),
  challenge: lockedDifficultyParameters("challenge"),
});

function difficultyParameters(
  difficulty: Difficulty,
): RunnerLabDifficultyParameters {
  const parameters = RUNNER_LAB_DIFFICULTY_PARAMETERS[difficulty];
  if (parameters === undefined) {
    throw new TypeError(`Unsupported runner laboratory difficulty: ${String(difficulty)}`);
  }
  return parameters;
}

function patternTemplate(templateIndex: number): RunnerLabPatternTemplate {
  const template = RUNNER_LAB_PATTERN_TEMPLATES[templateIndex];
  if (template === undefined || template.templateIndex !== templateIndex) {
    throw new RangeError(`Missing runner laboratory template ${templateIndex}`);
  }
  return template;
}

function scoringDefinition(
  contentId: RunnerLabEntityContentId,
): RunnerLabEntityDefinition {
  const definition = RUNNER_LAB_SCORING_DEFINITIONS_BY_CONTENT_ID.get(contentId);
  if (definition === undefined) {
    throw new RangeError(`Missing runner laboratory entity ${contentId}`);
  }
  return definition;
}

function laneForRole(role: RunnerLabLaneRole, rotation: Lane): Lane {
  switch (role) {
    case "rotation-origin":
      return rotation;
    case "rotation-next":
      return ((rotation + 1) % 3) as Lane;
    case "rotation-previous":
      return ((rotation + 2) % 3) as Lane;
  }
}

function anchorTick(patternIndex: number): number {
  return (
    FIRST_WINDOW_ANCHOR_TICK +
    (patternIndex - 1) * WINDOW_ANCHOR_SPACING_TICKS
  );
}

function cursorForNextPattern(
  parameters: RunnerLabDifficultyParameters,
  currentPatternIndex: number,
): RunnerLabSpawnCursor {
  if (currentPatternIndex < 0 || currentPatternIndex > RUNNER_LAB_COURSE_PATTERN_COUNT) {
    throw new RangeError("Runner laboratory cursor pattern index is out of range");
  }
  if (currentPatternIndex === RUNNER_LAB_COURSE_PATTERN_COUNT) {
    return Object.freeze({
      patternIndex: currentPatternIndex,
      nextSpawnTick: RUNNER_LAB_TERMINAL_SPAWN_TICK,
      nextSpawnDistanceMilli:
        parameters.worldSpeedMilliPerTick * RUNNER_LAB_TERMINAL_SPAWN_TICK,
    });
  }
  const nextPatternIndex = currentPatternIndex + 1;
  const nextSpawnTick = anchorTick(nextPatternIndex) - parameters.leadTicks;
  return Object.freeze({
    patternIndex: currentPatternIndex,
    nextSpawnTick,
    nextSpawnDistanceMilli:
      parameters.worldSpeedMilliPerTick * nextSpawnTick,
  });
}

function markerCoordinates(
  runSeed: string,
  patternIndex: number,
  contentId: RunnerLabGeneratedMarker["contentId"],
  xMilli: number,
): RunnerLabGeneratedMarkerBase & {
  readonly contentId: RunnerLabGeneratedMarker["contentId"];
} {
  return {
    instanceId: deriveEntityInstanceIdV1({
      runSeed,
      stageId: RUNNER_LAB_STAGE_ID,
      patternIndex,
      slotIndex: MARKER_SLOT_INDEX,
      contentId,
    }),
    contentId,
    kind: RUNNER_LABORATORY_MARKERS.decision.kind,
    patternIndex,
    slotIndex: MARKER_SLOT_INDEX,
    lane: RUNNER_LABORATORY_MARKERS.decision.lane,
    xMilli,
    widthMilli: MARKER_WIDTH_MILLI,
    collisionParticipation:
      RUNNER_LABORATORY_MARKERS.decision.collisionParticipation,
  };
}

function deriveDecisionMarker(
  runSeed: string,
  patternIndex: number,
  xMilli: number,
): RunnerLabGeneratedDecisionMarker {
  return Object.freeze({
    ...markerCoordinates(
      runSeed,
      patternIndex,
      RUNNER_LAB_DECISION_MARKER_ID,
      xMilli,
    ),
    contentId: RUNNER_LAB_DECISION_MARKER_ID,
    representation: RUNNER_LABORATORY_MARKERS.decision.representation,
    storedInActiveEntities:
      RUNNER_LABORATORY_MARKERS.decision.storedInActiveEntities,
    contactState: RUNNER_LABORATORY_MARKERS.decision.contactStateOnSpawn,
  });
}

function deriveSentinelMarker(
  runSeed: string,
  patternIndex: 0 | typeof RUNNER_LAB_TERMINAL_PATTERN_INDEX,
  contentId:
    | typeof RUNNER_LAB_START_MARKER_ID
    | typeof RUNNER_LAB_FINISH_MARKER_ID,
): RunnerLabGeneratedSentinelMarker {
  const markerContract = contentId === RUNNER_LAB_START_MARKER_ID
    ? RUNNER_LABORATORY_MARKERS.initial
    : RUNNER_LABORATORY_MARKERS.terminal;
  return Object.freeze({
    ...markerCoordinates(
      runSeed,
      patternIndex,
      contentId,
      FIRST_HORIZONTAL_OVERLAP_X_MILLI,
    ),
    contentId,
    representation: markerContract.representation,
    storedInActiveEntities: markerContract.storedInActiveEntities,
  });
}

function optionalGroups(
  template: RunnerLabPatternTemplate,
): readonly RunnerLabOptionalGroupId[] {
  const groups: RunnerLabOptionalGroupId[] = [];
  for (const slot of template.slots) {
    if (
      slot.optionalGroupId !== null &&
      !groups.includes(slot.optionalGroupId)
    ) {
      groups.push(slot.optionalGroupId);
    }
  }
  return frozenArray(groups);
}

function includeOptionalGroup(
  runSeed: string,
  patternIndex: number,
  optionalGroupId: RunnerLabOptionalGroupId,
  optionalDensity: number,
): boolean {
  const entropy = createPatternEntropy({
    runSeed,
    stageId: RUNNER_LAB_STAGE_ID,
    patternIndex,
  });
  return (
    entropy.integer(
      `${RUNNER_LABORATORY_GENERATOR_CONTRACT.optionalEntropyChannelPrefix}${optionalGroupId}`,
      0,
      RUNNER_LABORATORY_GENERATOR_CONTRACT.optionalEntropyScale,
    ) <
    optionalDensity
  );
}

interface DecoratedPatternCopy extends RunnerLabPatternCopy {
  readonly permutationToken: number;
}

function permutedPatternCopies(
  runSeed: string,
): readonly DecoratedPatternCopy[] {
  return RUNNER_LAB_PATTERN_COPIES.map((copy) =>
    Object.freeze({
      ...copy,
      permutationToken: createPatternEntropy({
        runSeed,
        stageId: RUNNER_LAB_STAGE_ID,
        patternIndex:
          RUNNER_LAB_INITIAL_PATTERN_INDEX + copy.copyOrdinal,
      }).uint32(RUNNER_LABORATORY_GENERATOR_CONTRACT.permutationEntropyChannel),
    }),
  ).sort(
    (left, right) =>
      left.permutationToken - right.permutationToken ||
      left.templateIndex - right.templateIndex ||
      left.copyIndex - right.copyIndex,
  );
}

function generatePattern(
  runSeed: string,
  parameters: RunnerLabDifficultyParameters,
  copy: DecoratedPatternCopy,
  patternIndex: number,
): RunnerLabGeneratedPattern {
  const template = patternTemplate(copy.templateIndex);
  const entropy = createPatternEntropy({
    runSeed,
    stageId: RUNNER_LAB_STAGE_ID,
    patternIndex,
  });
  const rotation = template.legalRotations[
    entropy.integer(
      RUNNER_LABORATORY_GENERATOR_CONTRACT.laneRotationEntropyChannel,
      0,
      template.legalRotations.length,
    )
  ];
  if (rotation === undefined) {
    throw new RangeError("Runner laboratory rotation did not resolve");
  }

  const includedOptionalGroupIds = optionalGroups(template).filter((groupId) =>
    includeOptionalGroup(
      runSeed,
      patternIndex,
      groupId,
      parameters.optionalDensity,
    ),
  );
  const patternAnchorTick = anchorTick(patternIndex);
  const spawnTick = patternAnchorTick - parameters.leadTicks;
  const spawnDistanceMilli = parameters.worldSpeedMilliPerTick * spawnTick;
  const entities = template.slots
    .filter(
      (slot) =>
        !slot.optional ||
        (slot.optionalGroupId !== null &&
          includedOptionalGroupIds.includes(slot.optionalGroupId)),
    )
    .map((slot): RunnerLabGeneratedEntity => {
      const definition = scoringDefinition(slot.entityContentId);
      return Object.freeze({
        instanceId: deriveEntityInstanceIdV1({
          runSeed,
          stageId: RUNNER_LAB_STAGE_ID,
          patternIndex,
          slotIndex: slot.slotIndex,
          contentId: slot.entityContentId,
        }),
        contentId: slot.entityContentId,
        kind: definition.kind,
        patternIndex,
        slotIndex: slot.slotIndex,
        lane: laneForRole(slot.laneRole, rotation),
        xMilli:
          FIRST_HORIZONTAL_OVERLAP_X_MILLI +
          parameters.worldSpeedMilliPerTick *
            (parameters.leadTicks + slot.contactOffsetTicks),
        widthMilli: ENTITY_WIDTH_MILLI,
        contactTick: patternAnchorTick + slot.contactOffsetTicks,
        contactOffsetTicks: slot.contactOffsetTicks,
        optionalGroupId: slot.optionalGroupId,
        contactState: "pending",
      });
    });
  const decisionMarker = deriveDecisionMarker(
    runSeed,
    patternIndex,
    FIRST_HORIZONTAL_OVERLAP_X_MILLI +
      parameters.worldSpeedMilliPerTick * parameters.leadTicks,
  );
  const incomingCursor = cursorForNextPattern(parameters, patternIndex - 1);
  const outgoingCursor = cursorForNextPattern(parameters, patternIndex);

  return Object.freeze({
    patternIndex,
    patternId: template.patternId,
    category: template.category,
    templateIndex: copy.templateIndex,
    copyIndex: copy.copyIndex,
    copyOrdinal: copy.copyOrdinal,
    permutationToken: copy.permutationToken,
    rotation,
    anchorTick: patternAnchorTick,
    spawnTick,
    spawnDistanceMilli,
    incomingCursor,
    outgoingCursor,
    includedOptionalGroupIds: frozenArray(includedOptionalGroupIds),
    entities: frozenArray(entities),
    decisionMarker,
    spawnEntities: frozenArray([...entities, decisionMarker]),
  });
}

function canonicalIds(
  startMarker: RunnerLabGeneratedMarker,
  patterns: readonly RunnerLabGeneratedPattern[],
  finishMarker: RunnerLabGeneratedMarker,
): readonly string[] {
  const coordinates = [
    startMarker,
    ...patterns.flatMap((pattern) => pattern.spawnEntities),
    finishMarker,
  ];
  coordinates.sort(
    (left, right) =>
      left.patternIndex - right.patternIndex ||
      left.slotIndex - right.slotIndex ||
      (left.instanceId < right.instanceId
        ? -1
        : left.instanceId > right.instanceId
          ? 1
          : 0),
  );
  return frozenArray(coordinates.map((entity) => entity.instanceId));
}

export function generateRunnerLaboratoryCourse(
  runSeed: string,
  difficulty: Difficulty,
): RunnerLabGeneratedCourse {
  const parameters = difficultyParameters(difficulty);
  const patterns = permutedPatternCopies(runSeed).map((copy, index) =>
    generatePattern(runSeed, parameters, copy, index + 1),
  );
  const startMarker = deriveSentinelMarker(
    runSeed,
    RUNNER_LAB_INITIAL_PATTERN_INDEX,
    RUNNER_LAB_START_MARKER_ID,
  );
  const finishMarker = deriveSentinelMarker(
    runSeed,
    RUNNER_LAB_TERMINAL_PATTERN_INDEX,
    RUNNER_LAB_FINISH_MARKER_ID,
  );
  const initialCursor = cursorForNextPattern(parameters, 0);
  const terminalCursor = cursorForNextPattern(
    parameters,
    RUNNER_LAB_COURSE_PATTERN_COUNT,
  );
  const includedOptionalGroupKeys = patterns.flatMap((pattern) =>
    pattern.includedOptionalGroupIds.map(
      (groupId) => `${pattern.patternIndex}:${groupId}`,
    ),
  );

  const course: RunnerLabGeneratedCourse = Object.freeze({
    generatorId: RUNNER_LAB_GENERATOR_ID,
    runSeed,
    stageId: RUNNER_LAB_STAGE_ID,
    difficulty,
    worldSpeedMilliPerTick: parameters.worldSpeedMilliPerTick,
    initialCursor,
    terminalCursor,
    completedCursor: Object.freeze({
      ...terminalCursor,
      patternIndex: RUNNER_LAB_TERMINAL_PATTERN_INDEX,
    }),
    startMarker,
    finishMarker,
    patterns: frozenArray(patterns),
    includedOptionalGroupKeys: frozenArray(includedOptionalGroupKeys),
    canonicalEntityIds: canonicalIds(startMarker, patterns, finishMarker),
  });
  AUTHENTIC_RUNNER_LABORATORY_COURSES.add(course);
  return course;
}
