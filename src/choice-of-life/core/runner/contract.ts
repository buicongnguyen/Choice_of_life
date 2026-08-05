import { createInitialRunState, type InitialRunSetup } from "../run-factory";
import { deepFreeze } from "../immutable";
import {
  RUN_STATE_CONTENT_VERSION,
  RUN_STATE_SCHEMA_VERSION,
  STARTING_PROFILE_SCORES,
  zeroSourceTotals,
  ControlMode,
  Difficulty,
  EffectSource,
  RunStateV1,
  ScoreId,
  StoryFact,
  StoryMemory,
} from "../run-state";

class ImmutableReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: ReadonlyMap<K, V>;

  constructor(entries: readonly (readonly [K, V])[]) {
    this.#values = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: K): V | undefined {
    return this.#values.get(key);
  }

  has(key: K): boolean {
    return this.#values.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#values.entries();
  }

  keys(): MapIterator<K> {
    return this.#values.keys();
  }

  values(): MapIterator<V> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#values) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

export const RUNNER_LABORATORY_STAGE_ID = "runner-lab-v1" as const;

export const RUNNER_LABORATORY_CONTROL_MODES = [
  "manual",
  "semantic-assist",
  "automatic-assist",
] as const satisfies readonly ControlMode[];

export const RUNNER_LABORATORY_PATTERN_IDS = [
  "runner-lab-benefit-fork-v1",
  "runner-lab-risk-reward-v1",
  "runner-lab-avoid-only-v1",
  "runner-lab-quiet-window-v1",
] as const;

export type RunnerLaboratoryPatternId =
  (typeof RUNNER_LABORATORY_PATTERN_IDS)[number];

export const RUNNER_LABORATORY_SCORING_ENTITY_IDS = [
  "runner-lab-health-token-v1",
  "runner-lab-happiness-token-v1",
  "runner-lab-money-token-v1",
  "runner-lab-clutter-hazard-v1",
  "runner-lab-pressure-hazard-v1",
] as const;

export type RunnerLaboratoryScoringEntityId =
  (typeof RUNNER_LABORATORY_SCORING_ENTITY_IDS)[number];

export const RUNNER_LABORATORY_MARKER_IDS = [
  "runner-lab-start-marker-v1",
  "runner-lab-decision-marker-v1",
  "runner-lab-finish-marker-v1",
] as const;

export type RunnerLaboratoryMarkerId =
  (typeof RUNNER_LABORATORY_MARKER_IDS)[number];

export const RUNNER_LABORATORY_EFFECT_CATEGORY_IDS = [
  "runner-benefit-v1",
  "runner-hazard-v1",
  "runner-lab-automatic-settlement-effect-v1",
] as const;

export type RunnerLaboratoryEffectCategoryId =
  (typeof RUNNER_LABORATORY_EFFECT_CATEGORY_IDS)[number];

export type RunnerLaboratoryEntityKind = "benefit" | "hazard";
export type RunnerLaboratoryLaneRole =
  | "rotation-origin"
  | "rotation-next"
  | "rotation-previous";
export type RunnerLaboratoryOptionalGroupId =
  | "risk-reward-secondary-v1"
  | "avoid-secondary-hazard-v1";
export type RunnerLaboratoryPatternCategory =
  | "benefit-fork"
  | "risk-reward"
  | "avoid-only"
  | "quiet-window";

export interface RunnerLaboratoryEntityEffectContract {
  readonly entityContentId: RunnerLaboratoryScoringEntityId;
  readonly kind: RunnerLaboratoryEntityKind;
  readonly scoreId: ScoreId;
  readonly requestedDelta: -1 | 1;
  readonly effectCategoryId: Extract<
    RunnerLaboratoryEffectCategoryId,
    "runner-benefit-v1" | "runner-hazard-v1"
  >;
}

export interface RunnerLaboratoryScoringDefinition {
  readonly contentId: RunnerLaboratoryScoringEntityId;
  readonly kind: RunnerLaboratoryEntityKind;
  readonly scoreId: ScoreId;
  readonly requestedDelta: -1 | 1;
  readonly categoryId: Extract<
    RunnerLaboratoryEffectCategoryId,
    "runner-benefit-v1" | "runner-hazard-v1"
  >;
}

export interface RunnerLaboratoryPatternSlotContract {
  readonly slotIndex: number;
  readonly entityContentId: RunnerLaboratoryScoringEntityId;
  readonly laneRole: RunnerLaboratoryLaneRole;
  readonly contactOffsetTicks: 0 | 18;
  readonly optional: boolean;
  readonly optionalGroupId: RunnerLaboratoryOptionalGroupId | null;
}

export interface RunnerLaboratoryPatternContract {
  readonly patternId: RunnerLaboratoryPatternId;
  readonly category: RunnerLaboratoryPatternCategory;
  readonly occurrenceCount: 1 | 2 | 3 | 4;
  readonly legalRotations: readonly (0 | 1 | 2)[];
  readonly slots: readonly RunnerLaboratoryPatternSlotContract[];
}

export interface RunnerLaboratoryDifficultyContract {
  readonly difficulty: Difficulty;
  readonly worldSpeedMilliPerTick: number;
  readonly optionalDensity: 50 | 75 | 100;
  readonly variantId:
    | "runner-lab-story-variant-v1"
    | "runner-lab-normal-variant-v1"
    | "runner-lab-challenge-variant-v1";
  readonly durationTicks: 3000;
  readonly leadTicks: 82 | 92;
  readonly firstSpawnTick: 208 | 218;
  readonly firstSpawnDistanceMilli: 540800 | 654000 | 741200;
  readonly terminalSpawnDistanceMilli: 7802600 | 9003000 | 10203400;
}

export const RUNNER_LABORATORY_STAGE_CONTRACT = {
  durationTicks: 3000,
  tickDurationMs: 20,
  decisionWindowCount: 10,
  firstWindowAnchorTick: 300,
  windowAnchorSpacingTicks: 250,
  lastWindowAnchorTick: 2550,
  windowAnchorTicks: [300, 550, 800, 1050, 1300, 1550, 1800, 2050, 2300, 2550],
  categoryCounts: [
    { patternId: "runner-lab-benefit-fork-v1", count: 4 },
    { patternId: "runner-lab-risk-reward-v1", count: 3 },
    { patternId: "runner-lab-avoid-only-v1", count: 2 },
    { patternId: "runner-lab-quiet-window-v1", count: 1 },
  ],
  rollingHorizonPatterns: 3,
  latestContactOffsetTicks: 18,
  latestPossibleContactTick: 2568,
  standalonePractice: true,
} as const;

export const RUNNER_LABORATORY_GENERATOR_CONTRACT = {
  algorithmId: "runner-laboratory-generator-v1",
  permutationAlgorithm: "pattern-entropy-decorate-sort-v1",
  permutationEntropyChannel: "sequence-order",
  laneRotationEntropyChannel: "lane-rotation",
  optionalEntropyChannelPrefix: "optional-variant-",
  optionalEntropyScale: 100,
  optionalEntropyChannels: [
    "optional-variant-risk-reward-secondary-v1",
    "optional-variant-avoid-secondary-hazard-v1",
  ],
  copyOrdinalMapping: [
    { copyOrdinal: 0, templateIndex: 0, copyIndex: 0, patternId: "runner-lab-benefit-fork-v1" },
    { copyOrdinal: 1, templateIndex: 0, copyIndex: 1, patternId: "runner-lab-benefit-fork-v1" },
    { copyOrdinal: 2, templateIndex: 0, copyIndex: 2, patternId: "runner-lab-benefit-fork-v1" },
    { copyOrdinal: 3, templateIndex: 0, copyIndex: 3, patternId: "runner-lab-benefit-fork-v1" },
    { copyOrdinal: 4, templateIndex: 1, copyIndex: 0, patternId: "runner-lab-risk-reward-v1" },
    { copyOrdinal: 5, templateIndex: 1, copyIndex: 1, patternId: "runner-lab-risk-reward-v1" },
    { copyOrdinal: 6, templateIndex: 1, copyIndex: 2, patternId: "runner-lab-risk-reward-v1" },
    { copyOrdinal: 7, templateIndex: 2, copyIndex: 0, patternId: "runner-lab-avoid-only-v1" },
    { copyOrdinal: 8, templateIndex: 2, copyIndex: 1, patternId: "runner-lab-avoid-only-v1" },
    { copyOrdinal: 9, templateIndex: 3, copyIndex: 0, patternId: "runner-lab-quiet-window-v1" },
  ],
  deterministic: true,
  rerollAllowed: false,
  canonicalEntityOrder: ["patternIndex", "slotIndex", "instanceId"],
  coursePatternIndexStart: 1,
  initialPatternIndex: 0,
  initialResolvedThroughPatternIndex: 0,
  terminalPatternIndex: 11,
  terminalSpawnTick: 3001,
  newlySpawnedEntitiesAdvanceOnSpawnTick: false,
  maxLiveInteractiveEntities: 24,
  maxResolvedEntityIds: 40,
} as const;

export const RUNNER_LABORATORY_MOVEMENT_CONTRACT = {
  lanes: [0, 1, 2],
  laneCentersMilli: [0, 1000, 2000],
  tweenTicks: 11,
  bufferCapacity: 1,
  interpolationFormulaId: "source-plus-rounded-delta-times-elapsed-over-11-v1",
  movingCurrentLaneRule: "source-until-completion-then-target",
  incomingStateClosure: {
    total: 107,
    idle: 7,
    bufferedIdle: 4,
    moving: 100,
    elapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
} as const;

export const RUNNER_LABORATORY_WARNING_CONTRACT = {
  baseReactionTicks: 38,
  requiredMoveFloors: [
    { requiredMoves: 0, minWarningTicks: 38 },
    { requiredMoves: 1, minWarningTicks: 50 },
    { requiredMoves: 2, minWarningTicks: 60 },
  ],
  leadTicks: {
    story: 92,
    normal: 82,
    challenge: 82,
  },
} as const;

export const RUNNER_LABORATORY_DIFFICULTY_CONTRACTS = [
  {
    difficulty: "story",
    worldSpeedMilliPerTick: 2600,
    optionalDensity: 50,
    variantId: "runner-lab-story-variant-v1",
    durationTicks: 3000,
    leadTicks: 92,
    firstSpawnTick: 208,
    firstSpawnDistanceMilli: 540800,
    terminalSpawnDistanceMilli: 7802600,
  },
  {
    difficulty: "normal",
    worldSpeedMilliPerTick: 3000,
    optionalDensity: 75,
    variantId: "runner-lab-normal-variant-v1",
    durationTicks: 3000,
    leadTicks: 82,
    firstSpawnTick: 218,
    firstSpawnDistanceMilli: 654000,
    terminalSpawnDistanceMilli: 9003000,
  },
  {
    difficulty: "challenge",
    worldSpeedMilliPerTick: 3400,
    optionalDensity: 100,
    variantId: "runner-lab-challenge-variant-v1",
    durationTicks: 3000,
    leadTicks: 82,
    firstSpawnTick: 218,
    firstSpawnDistanceMilli: 741200,
    terminalSpawnDistanceMilli: 10203400,
  },
] as const satisfies readonly RunnerLaboratoryDifficultyContract[];

export const RUNNER_LABORATORY_COLLISION_CONTRACT = {
  coordinateSystem: "integer-fixed-point",
  playerXMilli: 180000,
  playerHalfWidthMilli: 18000,
  laneHalfWidthMilli: 300,
  entityWidthMilli: 34000,
  firstHorizontalOverlapEntityCenterXMilli: 215000,
  contactXRule: "closed-interval-overlap-v1",
  laneContactBoundary: "closed",
  contactEffectSource: "runner",
  contactEffectTransactionId: null,
  contactEffectChoiceCauseId: null,
  invulnerabilityTicks: 25,
  safeClosedOverlapTravelMilli: 70000,
  maximumSafeOffsetTicks: {
    story: 45,
    normal: 42,
    challenge: 39,
  },
} as const;

export const RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION = {
  runStatus: "active",
  stage: {
    stageId: RUNNER_LABORATORY_STAGE_ID,
    phase: "active",
    ageMonths: 0,
    activeTicks: 0,
    worldDistanceMilli: 0,
    durationTicks: 3000,
    settlement: null,
  },
  simulationTick: 0,
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
    activeEntities: [],
    invulnerableUntilTick: 0,
    userPaused: true,
  },
  recovery: null,
  encounter: null,
} as const;

export const RUNNER_LABORATORY_ENTRY_STATE_CONTRACT = {
  schemaVersion: RUN_STATE_SCHEMA_VERSION,
  contentVersion: RUN_STATE_CONTENT_VERSION,
  runIdDerivation:
    "canonical-from-retained-setup-fields-after-control-mode-selection",
  runStatus: "active",
  retainedSetupFields: [
    "runId",
    "runSeed",
    "startingProfileId",
    "difficulty",
    "controlMode",
    "identity",
    "appearance",
    "accessibility",
  ],
  reinitializedGameplayFields: [
    "runStatus",
    "scores",
    "effectLedger",
    "storyState",
    "stage",
    "runner",
    "recovery",
    "encounter",
    "consequences",
    "simulationTick",
  ],
  stage: RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION.stage,
  scoresByStartingProfile: [
    {
      startingProfileId: "steady-mix-v1",
      scores: STARTING_PROFILE_SCORES["steady-mix-v1"],
    },
    {
      startingProfileId: "physical-head-start-v1",
      scores: STARTING_PROFILE_SCORES["physical-head-start-v1"],
    },
    {
      startingProfileId: "emotional-head-start-v1",
      scores: STARTING_PROFILE_SCORES["emotional-head-start-v1"],
    },
    {
      startingProfileId: "resource-head-start-v1",
      scores: STARTING_PROFILE_SCORES["resource-head-start-v1"],
    },
  ],
  scoreSelectionRule:
    "scores-equal-the-exact-selected-starting-profile-scores",
  effectLedger: {
    recent: [],
    totalsBySource: zeroSourceTotals(),
  },
  storyState: {
    facts: [],
    memories: [],
    credentials: [],
    relationships: [],
    conditions: [],
  },
  recovery: null,
  encounter: null,
  consequences: {
    pending: [],
    resolved: [],
    terminal: [],
  },
  simulationTick: 0,
  runner: {
    motion: RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION.runner.motion,
    inputBuffer: null,
    spawnByDifficulty: RUNNER_LABORATORY_DIFFICULTY_CONTRACTS.map(
      (difficulty) => ({
        difficulty: difficulty.difficulty,
        patternIndex: RUNNER_LABORATORY_GENERATOR_CONTRACT.initialPatternIndex,
        nextSpawnTick: difficulty.firstSpawnTick,
        nextSpawnDistanceMilli: difficulty.firstSpawnDistanceMilli,
        resolvedThroughPatternIndex:
          RUNNER_LABORATORY_GENERATOR_CONTRACT.initialResolvedThroughPatternIndex,
        resolvedEntityIds: [],
      }),
    ),
    activeEntities: [],
    invulnerableUntilTick: 0,
    userPaused: true,
  },
  invariants: {
    simulationTickEqualsStageActiveTicks: true,
    stageWorldDistanceEqualsDifficultySpeedTimesActiveTicks: true,
    initialSpeedRelationEvaluatesToZero: true,
    startMarkerResolvedIdPresent: false,
  },
} as const;

const AUTHENTIC_RUNNER_LABORATORY_ENTRY_STATES = new WeakSet<object>();

export function createRunnerLaboratoryEntryState(
  runSeed: string,
  setup: InitialRunSetup,
): RunStateV1 {
  const initial = createInitialRunState(runSeed, setup);
  const spawn = RUNNER_LABORATORY_ENTRY_STATE_CONTRACT.runner.spawnByDifficulty
    .find((candidate) => candidate.difficulty === initial.difficulty);
  if (spawn === undefined) {
    throw new TypeError("Runner laboratory difficulty is unsupported");
  }

  const state = deepFreeze({
    ...initial,
    runStatus: "active",
    scores: { ...STARTING_PROFILE_SCORES[initial.startingProfileId] },
    effectLedger: {
      recent: [],
      totalsBySource: zeroSourceTotals(),
    },
    storyState: {
      facts: [],
      memories: [],
      credentials: [],
      relationships: [],
      conditions: [],
    },
    stage: { ...RUNNER_LABORATORY_ENTRY_STATE_CONTRACT.stage },
    runner: {
      motion: { ...RUNNER_LABORATORY_ENTRY_STATE_CONTRACT.runner.motion },
      inputBuffer: null,
      spawn: {
        patternIndex: spawn.patternIndex,
        nextSpawnTick: spawn.nextSpawnTick,
        nextSpawnDistanceMilli: spawn.nextSpawnDistanceMilli,
        resolvedThroughPatternIndex: spawn.resolvedThroughPatternIndex,
        resolvedEntityIds: [],
      },
      activeEntities: [],
      invulnerableUntilTick: 0,
      userPaused: true,
    },
    recovery: null,
    encounter: null,
    consequences: {
      pending: [],
      resolved: [],
      terminal: [],
    },
    simulationTick: 0,
  } satisfies RunStateV1);
  AUTHENTIC_RUNNER_LABORATORY_ENTRY_STATES.add(state);
  return state;
}

/**
 * Evaluator-only provenance check. A structurally identical copy is not an
 * authentic laboratory entry: callers must use the canonical entry factory.
 */
export function isAuthenticRunnerLaboratoryEntryState(
  value: unknown,
): value is RunStateV1 {
  return typeof value === "object" && value !== null &&
    AUTHENTIC_RUNNER_LABORATORY_ENTRY_STATES.has(value);
}

export const RUNNER_LABORATORY_ENTITY_EFFECTS = [
  {
    entityContentId: "runner-lab-health-token-v1",
    kind: "benefit",
    scoreId: "health",
    requestedDelta: 1,
    effectCategoryId: "runner-benefit-v1",
  },
  {
    entityContentId: "runner-lab-happiness-token-v1",
    kind: "benefit",
    scoreId: "happiness",
    requestedDelta: 1,
    effectCategoryId: "runner-benefit-v1",
  },
  {
    entityContentId: "runner-lab-money-token-v1",
    kind: "benefit",
    scoreId: "money",
    requestedDelta: 1,
    effectCategoryId: "runner-benefit-v1",
  },
  {
    entityContentId: "runner-lab-clutter-hazard-v1",
    kind: "hazard",
    scoreId: "health",
    requestedDelta: -1,
    effectCategoryId: "runner-hazard-v1",
  },
  {
    entityContentId: "runner-lab-pressure-hazard-v1",
    kind: "hazard",
    scoreId: "happiness",
    requestedDelta: -1,
    effectCategoryId: "runner-hazard-v1",
  },
] as const satisfies readonly RunnerLaboratoryEntityEffectContract[];

export const RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID: ReadonlyMap<
  string,
  RunnerLaboratoryScoringDefinition
> = new ImmutableReadonlyMap(
  RUNNER_LABORATORY_ENTITY_EFFECTS.map((effect) => [
    effect.entityContentId,
    deepFreeze({
      contentId: effect.entityContentId,
      kind: effect.kind,
      scoreId: effect.scoreId,
      requestedDelta: effect.requestedDelta,
      categoryId: effect.effectCategoryId,
    }),
  ] as const),
);

export const RUNNER_LABORATORY_PATTERN_TEMPLATES = [
  {
    patternId: "runner-lab-benefit-fork-v1",
    category: "benefit-fork",
    occurrenceCount: 4,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-health-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 2, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
    ],
  },
  {
    patternId: "runner-lab-risk-reward-v1",
    category: "risk-reward",
    occurrenceCount: 3,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 18, optional: false, optionalGroupId: null },
      { slotIndex: 2, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
      { slotIndex: 3, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
    ],
  },
  {
    patternId: "runner-lab-avoid-only-v1",
    category: "avoid-only",
    occurrenceCount: 2,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "avoid-secondary-hazard-v1" },
    ],
  },
  {
    patternId: "runner-lab-quiet-window-v1",
    category: "quiet-window",
    occurrenceCount: 1,
    legalRotations: [0],
    slots: [],
  },
] as const satisfies readonly RunnerLaboratoryPatternContract[];

export const RUNNER_LABORATORY_MARKERS = {
  initial: {
    contentId: "runner-lab-start-marker-v1",
    patternIndex: 0,
    representation: "resolved-id-sentinel",
    kind: "opportunity",
    slotIndex: 63,
    lane: 1,
    xMilli: 215000,
    widthMilli: 1,
    collisionParticipation: "none",
    storedInActiveEntities: false,
  },
  decision: {
    contentId: "runner-lab-decision-marker-v1",
    representation: "runner-entity",
    kind: "opportunity",
    slotIndex: 63,
    lane: 1,
    widthMilli: 1,
    collisionParticipation: "none",
    countPerPattern: 1,
    contactStateOnSpawn: "pending",
    storedInActiveEntities: true,
  },
  terminal: {
    contentId: "runner-lab-finish-marker-v1",
    patternIndex: 11,
    representation: "resolved-id-sentinel",
    kind: "opportunity",
    slotIndex: 63,
    lane: 1,
    xMilli: 215000,
    widthMilli: 1,
    collisionParticipation: "none",
    storedInActiveEntities: false,
  },
} as const;

export const RUNNER_LABORATORY_COMPLETION_FACT = {
  factId: "fact-runner-laboratory-complete-v1",
  kind: "learning",
  valueId: "value-runner-laboratory-practice-v1",
  originChoiceId: null,
} as const satisfies StoryFact;

export const RUNNER_LABORATORY_COMPLETION_MEMORY = {
  memoryId: "memory-runner-laboratory-complete-v1",
  kind: "milestone",
  stageId: RUNNER_LABORATORY_STAGE_ID,
  summary: "Completed the runner laboratory.",
  originChoiceId: null,
} as const satisfies StoryMemory;

export const RUNNER_LABORATORY_SETTLEMENT_CONTRACT = {
  settlementId: "settlement-runner-laboratory-v1",
  tick: 3000,
  source: "system" as EffectSource,
  automaticEffectCategoryId: "runner-lab-automatic-settlement-effect-v1",
  automaticEffectOrder: ["health", "happiness", "money"],
  automaticEffectIds: {
    health: "effect-runner-laboratory-health-v1",
    happiness: "effect-runner-laboratory-happiness-v1",
    money: "effect-runner-laboratory-money-v1",
  },
  zeroDeltaPolicy: "omit-effect",
} as const;

export const RUNNER_LABORATORY_CONTRACT = deepFreeze({
  stageId: RUNNER_LABORATORY_STAGE_ID,
  ids: {
    patterns: RUNNER_LABORATORY_PATTERN_IDS,
    scoringEntities: RUNNER_LABORATORY_SCORING_ENTITY_IDS,
    markers: RUNNER_LABORATORY_MARKER_IDS,
    effectCategories: RUNNER_LABORATORY_EFFECT_CATEGORY_IDS,
  },
  controlModes: RUNNER_LABORATORY_CONTROL_MODES,
  stage: RUNNER_LABORATORY_STAGE_CONTRACT,
  generator: RUNNER_LABORATORY_GENERATOR_CONTRACT,
  movement: RUNNER_LABORATORY_MOVEMENT_CONTRACT,
  warning: RUNNER_LABORATORY_WARNING_CONTRACT,
  difficultyProfiles: RUNNER_LABORATORY_DIFFICULTY_CONTRACTS,
  collision: RUNNER_LABORATORY_COLLISION_CONTRACT,
  entryStateStaticProjection:
    RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION,
  entryState: RUNNER_LABORATORY_ENTRY_STATE_CONTRACT,
  entityEffects: RUNNER_LABORATORY_ENTITY_EFFECTS,
  scoringDefinitionsByContentId:
    RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  patternTemplates: RUNNER_LABORATORY_PATTERN_TEMPLATES,
  markers: RUNNER_LABORATORY_MARKERS,
  completionFact: RUNNER_LABORATORY_COMPLETION_FACT,
  completionMemory: RUNNER_LABORATORY_COMPLETION_MEMORY,
  settlement: RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
} as const);
