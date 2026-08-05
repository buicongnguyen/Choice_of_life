import type { CoreScores, ScoreId } from "../score-model";

export type NewbornLane = 0 | 1 | 2;
export type NewbornDifficulty = "story" | "normal" | "challenge";
export type NewbornPhase =
  | "active"
  | "caregiver-choice"
  | "settling"
  | "complete";

export type NewbornCaregiverOptionId =
  | "newborn-option-warm-cuddle-v1"
  | "newborn-option-gentle-play-v1"
  | "newborn-option-steady-routine-v1";

export type NewbornEntityContentId =
  | "newborn-pickup-milk-v1"
  | "newborn-pickup-rattle-v1"
  | "newborn-pickup-nest-egg-v1"
  | "newborn-hazard-spill-v1"
  | "newborn-hazard-noise-v1"
  | "newborn-hazard-cost-v1";

export type NewbornEffectSource =
  | "runner"
  | "choice"
  | "recovery"
  | "settlement";

export interface NewbornScoreDelta {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
}

export interface NewbornCaregiverOption {
  readonly optionId: NewbornCaregiverOptionId;
  readonly label: string;
  readonly description: string;
  readonly goalId: "comfort" | "curiosity" | "stability";
  readonly effects: readonly NewbornScoreDelta[];
  readonly factValueId:
    | "newborn-value-felt-safe-v1"
    | "newborn-value-explored-together-v1"
    | "newborn-value-steady-care-v1";
  readonly memorySummary: string;
}

export interface NewbornEffectEntry {
  readonly effectId: string;
  readonly source: NewbornEffectSource;
  readonly categoryId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly causedByChoiceId: NewbornCaregiverOptionId | null;
  readonly causedByEntityId: string | null;
  readonly simulationTick: number;
}

export interface NewbornSourceScoreTotals {
  readonly health: number;
  readonly happiness: number;
  readonly money: number;
}

export type NewbornSourceAttribution = Readonly<
  Record<NewbornEffectSource, NewbornSourceScoreTotals>
>;

export interface NewbornEntity {
  readonly instanceId: string;
  readonly contentId: NewbornEntityContentId;
  readonly kind: "pickup" | "hazard";
  readonly lane: NewbornLane;
  readonly xMilli: number;
  readonly widthMilli: number;
  readonly scoreId: ScoreId;
  readonly scoreDelta: number;
  readonly spawnIndex: number;
}

export interface NewbornPlayerState {
  readonly lane: NewbornLane;
  readonly visualMotion: "seated" | "crawl";
  readonly crawlFrame: 0 | 1;
  readonly moveTicksRemaining: number;
}

export interface NewbornClockState {
  readonly activeTicks: number;
  readonly durationTicks: number;
  readonly paused: boolean;
}

export interface NewbornWorldState {
  readonly distanceMilli: number;
  readonly speedMilliPerTick: number;
  readonly entities: readonly NewbornEntity[];
  readonly spawnIndex: number;
  readonly nextSpawnTick: number;
  readonly resolvedEntityIds: readonly string[];
}

export interface NewbornCaregiverState {
  readonly status: "scheduled" | "presenting" | "resolved";
  readonly transactionId: "newborn-caregiver-transaction-v1";
  readonly optionIds: readonly NewbornCaregiverOptionId[];
  readonly selectedOptionId: NewbornCaregiverOptionId | null;
  readonly presentedTick: number | null;
  readonly resolvedTick: number | null;
}

export interface NewbornRecoveryState {
  readonly count: number;
  readonly lastTriggerEntityId: string | null;
  readonly recoveryTarget: number;
  readonly invulnerableUntilTick: number;
  readonly cooldownUntilTick: number;
}

export interface NewbornFact {
  readonly factId: "fact-newborn-caregiver-choice-v1";
  readonly kind: "care";
  readonly valueId: NewbornCaregiverOption["factValueId"];
  readonly originChoiceId: NewbornCaregiverOptionId;
}

export interface NewbornMemory {
  readonly memoryId: "memory-newborn-caregiver-crossroads-v1";
  readonly kind: "relationship";
  readonly stageId: "newborn-v1";
  readonly summary: string;
  readonly originChoiceId: NewbornCaregiverOptionId;
}

export interface NewbornStoryState {
  readonly facts: readonly NewbornFact[];
  readonly memories: readonly NewbornMemory[];
}

export interface NewbornSettlementState {
  readonly settlementId: "newborn-settlement-v1";
  readonly status: "pending" | "applied";
  readonly startedTick: number;
  readonly completedTick: number | null;
  readonly factId: "fact-newborn-caregiver-choice-v1" | null;
  readonly memoryId: "memory-newborn-caregiver-crossroads-v1" | null;
}

export interface NewbornState {
  readonly schemaVersion: 1;
  readonly contentVersion: "newborn-runtime-v1";
  readonly stageId: "newborn-v1";
  readonly runId: string;
  readonly runSeed: string;
  readonly difficulty: NewbornDifficulty;
  readonly phase: NewbornPhase;
  readonly simulationTick: number;
  readonly scores: CoreScores;
  readonly clock: NewbornClockState;
  readonly world: NewbornWorldState;
  readonly player: NewbornPlayerState;
  readonly caregiver: NewbornCaregiverState;
  readonly effects: readonly NewbornEffectEntry[];
  readonly attribution: NewbornSourceAttribution;
  readonly recovery: NewbornRecoveryState;
  readonly story: NewbornStoryState;
  readonly settlement: NewbornSettlementState | null;
}

export interface NewbornSetup {
  readonly runId: string;
  readonly runSeed: string;
  readonly difficulty?: NewbornDifficulty;
  readonly scores?: CoreScores;
  readonly initialLane?: NewbornLane;
}

export type NewbornAction =
  | Readonly<{ type: "move"; direction: "up" | "down" }>
  | Readonly<{ type: "set-paused"; paused: boolean }>
  | Readonly<{ type: "advance"; ticks?: number }>
  | Readonly<{
      type: "choose-caregiver";
      optionId: NewbornCaregiverOptionId;
    }>
  | Readonly<{ type: "settle" }>;
