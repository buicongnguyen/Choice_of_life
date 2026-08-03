export const RUN_STATE_SCHEMA_VERSION = 1 as const;
export const RUN_STATE_CONTENT_VERSION = "phase-1-v1" as const;
export const RUN_STATE_MAX_UTF8_BYTES = 99_999;

export type ScoreId = "health" | "happiness" | "money";
export type EffectSource =
  | "runner"
  | "choice"
  | "callback"
  | "settlement"
  | "recovery"
  | "system";
export type Difficulty = "story" | "normal" | "challenge";
export type ControlMode = "manual" | "semantic-assist" | "automatic-assist";
export type StartingProfileId =
  | "steady-mix-v1"
  | "physical-head-start-v1"
  | "emotional-head-start-v1"
  | "resource-head-start-v1";
export type CatalogId = string;
export type InstanceId = string;
export type LogicalTick = number;
export type Lane = 0 | 1 | 2;

export interface CoreScores {
  readonly health: number;
  readonly happiness: number;
  readonly money: number;
}

export interface ScoreTotals {
  readonly healthPositive: number;
  readonly healthNegative: number;
  readonly happinessPositive: number;
  readonly happinessNegative: number;
  readonly moneyPositive: number;
  readonly moneyNegative: number;
}

export type SourceTotals = Readonly<Record<EffectSource, ScoreTotals>>;

export interface AppliedEffect {
  readonly effectId: InstanceId;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly source: EffectSource;
  readonly categoryId: CatalogId;
  readonly causedByChoiceId: CatalogId | null;
  readonly transactionId: InstanceId | null;
  readonly before: number;
  readonly after: number;
  readonly actualDelta: number;
  readonly simulationTick: LogicalTick;
}

export interface EffectLedger {
  readonly recent: readonly AppliedEffect[];
  readonly totalsBySource: SourceTotals;
}

export interface StoryFact {
  readonly factId: CatalogId;
  readonly kind: "learning" | "care" | "community" | "autonomy" | "route";
  readonly valueId: CatalogId;
  readonly originChoiceId: CatalogId | null;
}

export interface StoryMemory {
  readonly memoryId: CatalogId;
  readonly kind: "milestone" | "relationship" | "challenge" | "joy";
  readonly stageId: CatalogId;
  readonly summary: string;
  readonly originChoiceId: CatalogId | null;
}

export interface Credential {
  readonly credentialId: CatalogId;
  readonly kind: "education" | "training" | "license" | "experience";
  readonly level: number;
  readonly earnedStageId: CatalogId;
}

export interface Relationship {
  readonly relationshipId: InstanceId;
  readonly personId: CatalogId;
  readonly kind: "caregiver" | "friend" | "mentor" | "partner" | "colleague" | "community";
  readonly closeness: number;
  readonly status: "active" | "distant" | "ended";
}

export interface Condition {
  readonly conditionId: CatalogId;
  readonly kind: "support" | "stress" | "health" | "opportunity" | "constraint";
  readonly severity: number;
  readonly startedTick: LogicalTick;
  readonly expiresTick: LogicalTick | null;
  readonly originChoiceId: CatalogId | null;
}

export interface StoryState {
  readonly facts: readonly StoryFact[];
  readonly memories: readonly StoryMemory[];
  readonly credentials: readonly Credential[];
  readonly relationships: readonly Relationship[];
  readonly conditions: readonly Condition[];
}

export interface Settlement {
  readonly settlementId: InstanceId;
  readonly status: "pending" | "applied" | "cancelled";
  readonly startedTick: LogicalTick;
  readonly completedTick: LogicalTick | null;
  readonly effectIds: readonly InstanceId[];
}

export interface StageState {
  readonly stageId: CatalogId;
  readonly phase: "shell" | "active" | "settling" | "complete";
  readonly ageMonths: number;
  readonly activeTicks: LogicalTick;
  readonly worldDistanceMilli: number;
  readonly durationTicks: number;
  readonly settlement: Settlement | null;
}

export interface IdleMotion {
  readonly kind: "idle";
  readonly currentLane: Lane;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly elapsedTicks: 0;
  readonly totalTicks: 11;
}

export interface MovingMotion {
  readonly kind: "moving";
  readonly currentLane: Lane;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly elapsedTicks: number;
  readonly totalTicks: 11;
}

export type RunnerMotion = IdleMotion | MovingMotion;

export interface RunnerEntity {
  readonly instanceId: InstanceId;
  readonly contentId: CatalogId;
  readonly kind: "benefit" | "hazard" | "narrative" | "opportunity";
  readonly patternIndex: number;
  readonly slotIndex: number;
  readonly lane: Lane;
  readonly xMilli: number;
  readonly widthMilli: number;
  readonly contactState: "pending" | "contacted" | "passed";
}

export interface SpawnState {
  readonly patternIndex: number;
  readonly nextSpawnDistanceMilli: number;
  readonly nextSpawnTick: LogicalTick;
  readonly resolvedThroughPatternIndex: number;
  readonly resolvedEntityIds: readonly InstanceId[];
}

export interface RunnerState {
  readonly motion: RunnerMotion;
  readonly inputBuffer: "up" | "down" | null;
  readonly spawn: SpawnState;
  readonly activeEntities: readonly RunnerEntity[];
  readonly invulnerableUntilTick: LogicalTick;
  readonly userPaused: boolean;
}

export interface RecoveryState {
  readonly transactionId: InstanceId;
  readonly status: "offered" | "accepted" | "cooldown";
  readonly triggerEntityInstanceId: InstanceId;
  readonly preTriggerScores: CoreScores;
  readonly recoveryTarget: number;
  readonly targetScores: CoreScores;
  readonly startedTick: LogicalTick;
  readonly resolveTick: LogicalTick;
  readonly invulnerableUntilTick: LogicalTick;
  readonly cooldownUntilTick: LogicalTick;
}

export interface ResolutionRecord {
  readonly selectedOptionId: CatalogId;
  readonly appliedEffectIds: readonly InstanceId[];
  readonly factResultIds: readonly CatalogId[];
  readonly relationshipResultIds: readonly InstanceId[];
  readonly scheduledConsequenceTransactionIds: readonly InstanceId[];
  readonly resultTextInputIds: readonly CatalogId[];
  readonly resolvedTick: LogicalTick;
}

export interface EncounterState {
  readonly transactionId: InstanceId;
  readonly encounterId: CatalogId;
  readonly kind: "caregiver" | "friend" | "mentor" | "stranger" | "institution" | "self-reflection";
  readonly phase: "presenting" | "option-selected" | "resolving" | "resolved";
  readonly optionIds: readonly CatalogId[];
  readonly selectedOptionId: CatalogId | null;
  readonly resolutionTransactionId: InstanceId | null;
  readonly presentationPhase: "prompt" | "choices" | "reaction" | "summary";
}

export interface PendingConsequence {
  readonly transactionId: InstanceId;
  readonly consequenceId: CatalogId;
  readonly status: "pending";
  readonly causedByChoiceId: CatalogId | null;
  readonly dueStageId: CatalogId;
  readonly dueTick: LogicalTick;
  readonly effectIds: readonly InstanceId[];
}

export interface ResolvedConsequence {
  readonly transactionId: InstanceId;
  readonly consequenceId: CatalogId;
  readonly status: "resolved" | "presented";
  readonly causedByChoiceId: CatalogId | null;
  readonly resolution: ResolutionRecord;
  readonly presentedTick: LogicalTick | null;
}

interface TerminalConsequenceBase {
  readonly transactionId: InstanceId;
  readonly consequenceId: CatalogId;
  readonly causedByChoiceId: CatalogId | null;
  readonly terminalTick: LogicalTick;
  readonly terminalReasonId: CatalogId;
  readonly acknowledgmentId: CatalogId | null;
}

export interface CompleteConsequence extends TerminalConsequenceBase {
  readonly status: "complete";
  readonly resolution: ResolutionRecord;
  readonly presentedTick: LogicalTick;
  readonly supersededByTransactionId: null;
}

export interface ExpiredConsequence extends TerminalConsequenceBase {
  readonly status: "expired";
  readonly resolution: null;
  readonly supersededByTransactionId: null;
  readonly acknowledgmentId: CatalogId;
}

export interface SupersededConsequence extends TerminalConsequenceBase {
  readonly status: "superseded";
  readonly resolution: null;
  readonly supersededByTransactionId: InstanceId;
  readonly acknowledgmentId: CatalogId;
}

export type TerminalConsequence = CompleteConsequence | ExpiredConsequence | SupersededConsequence;

export interface ConsequenceState {
  readonly pending: readonly PendingConsequence[];
  readonly resolved: readonly ResolvedConsequence[];
  readonly terminal: readonly TerminalConsequence[];
}

export interface RunStateV1 {
  readonly schemaVersion: typeof RUN_STATE_SCHEMA_VERSION;
  readonly contentVersion: typeof RUN_STATE_CONTENT_VERSION;
  readonly runId: string;
  readonly runSeed: string;
  readonly runStatus: "setup" | "active" | "completed";
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly identity: Readonly<{ gender: "female" | "male" }>;
  readonly appearance: Readonly<{
    heritageStyleId: "asian" | "western" | "black" | "middle-eastern";
    hairStyleId: "short-soft" | "wavy-bob" | "curly-crown" | "tied-back";
    hairColorId: "black" | "dark-brown" | "warm-brown" | "silver";
    clothingPaletteId: "sunrise" | "meadow" | "ocean" | "berry";
  }>;
  readonly accessibility: Readonly<{
    highContrast: boolean;
    reducedMotion: boolean;
    textScale: 100 | 125 | 150 | 200;
    screenReaderAnnouncements: boolean;
  }>;
  readonly startingProfileId: StartingProfileId;
  readonly scores: CoreScores;
  readonly effectLedger: EffectLedger;
  readonly storyState: StoryState;
  readonly stage: StageState;
  readonly runner: RunnerState | null;
  readonly recovery: RecoveryState | null;
  readonly encounter: EncounterState | null;
  readonly consequences: ConsequenceState;
  readonly simulationTick: LogicalTick;
}

export const STARTING_PROFILE_SCORES: Readonly<Record<StartingProfileId, CoreScores>> = Object.freeze({
  "steady-mix-v1": Object.freeze({ health: 65, happiness: 60, money: 35 }),
  "physical-head-start-v1": Object.freeze({ health: 69, happiness: 57, money: 34 }),
  "emotional-head-start-v1": Object.freeze({ health: 63, happiness: 66, money: 31 }),
  "resource-head-start-v1": Object.freeze({ health: 61, happiness: 57, money: 42 }),
});

export const SCORE_IDS = ["health", "happiness", "money"] as const;
export const EFFECT_SOURCES = ["runner", "choice", "callback", "settlement", "recovery", "system"] as const;

export function zeroScoreTotals(): ScoreTotals {
  return {
    healthPositive: 0,
    healthNegative: 0,
    happinessPositive: 0,
    happinessNegative: 0,
    moneyPositive: 0,
    moneyNegative: 0,
  };
}

export function zeroSourceTotals(): SourceTotals {
  return {
    runner: zeroScoreTotals(),
    choice: zeroScoreTotals(),
    callback: zeroScoreTotals(),
    settlement: zeroScoreTotals(),
    recovery: zeroScoreTotals(),
    system: zeroScoreTotals(),
  };
}
