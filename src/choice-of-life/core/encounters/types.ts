import type { CoreScores, ScoreId } from "../score-model";

export type EncounterImportance = "mandatory" | "optional";
export type EncounterKind =
  | "caregiver"
  | "friend"
  | "mentor"
  | "stranger"
  | "institution"
  | "self-reflection";

export type EncounterTransactionStatus =
  | "scheduled"
  | "presenting"
  | "resolved"
  | "skipped"
  | "expired"
  | "superseded";

export interface EncounterScoreEffectDefinition {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly categoryId: string;
}

export interface EncounterFactDefinition {
  readonly factId: string;
  readonly kind: "learning" | "care" | "community" | "autonomy" | "route";
  readonly valueId: string;
}

export interface EncounterMemoryDefinition {
  readonly memoryId: string;
  readonly kind: "milestone" | "relationship" | "challenge" | "joy";
  readonly summary: string;
}

export interface EncounterRelationshipChangeDefinition {
  readonly relationshipId: string;
  readonly personId: string;
  readonly kind:
    | "caregiver"
    | "friend"
    | "mentor"
    | "partner"
    | "colleague"
    | "community";
  readonly closenessDelta: number;
  readonly status?: "active" | "distant" | "ended";
}

export interface EncounterOutcomeDefinition {
  readonly effects?: readonly EncounterScoreEffectDefinition[];
  readonly facts?: readonly EncounterFactDefinition[];
  readonly memories?: readonly EncounterMemoryDefinition[];
  readonly relationships?: readonly EncounterRelationshipChangeDefinition[];
  readonly storyText?: string;
}

export interface EncounterCallbackDefinition extends EncounterOutcomeDefinition {
  readonly callbackId: string;
  readonly delayTicks: number;
  readonly dueStageId?: string;
  readonly label: string;
}

export interface EncounterOptionDefinition extends EncounterOutcomeDefinition {
  readonly optionId: string;
  readonly label: string;
  readonly description: string;
  readonly reactionText: string;
  readonly callbacks?: readonly EncounterCallbackDefinition[];
}

export interface EncounterDefinition {
  readonly encounterId: string;
  readonly kind: EncounterKind;
  readonly importance: EncounterImportance;
  readonly title: string;
  readonly prompt: string;
  readonly safeCorridorTicks: number;
  readonly options: readonly EncounterOptionDefinition[];
}

export interface EncounterCatalog {
  readonly catalogVersion: string;
  readonly encounters: Readonly<Record<string, EncounterDefinition>>;
}

export interface EncounterSafeCorridor {
  readonly stageId: string;
  readonly opensAtTick: number;
  readonly closesAtTick: number;
}

export interface EncounterScheduleRequest {
  readonly transactionId: string;
  readonly encounterId: string;
  readonly stageId: string;
  readonly opensAtTick: number;
  readonly closesAtTick?: number;
}

export interface EncounterAppliedEffect {
  readonly effectId: string;
  readonly source: "choice" | "callback" | "recovery";
  readonly categoryId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly originTransactionId: string;
  readonly originOptionId: string | null;
  readonly simulationTick: number;
}

export interface EncounterFact extends EncounterFactDefinition {
  readonly stageId: string;
  readonly originTransactionId: string;
  readonly originOptionId: string;
}

export interface EncounterMemory extends EncounterMemoryDefinition {
  readonly stageId: string;
  readonly originTransactionId: string;
  readonly originOptionId: string;
}

export interface EncounterRelationship {
  readonly relationshipId: string;
  readonly personId: string;
  readonly kind: EncounterRelationshipChangeDefinition["kind"];
  readonly closeness: number;
  readonly status: "active" | "distant" | "ended";
  readonly lastChangedByTransactionId: string;
}

export interface EncounterResolution {
  readonly resolutionId: string;
  readonly selectedOptionId: string;
  readonly appliedEffectIds: readonly string[];
  readonly factIds: readonly string[];
  readonly memoryIds: readonly string[];
  readonly relationshipIds: readonly string[];
  readonly scheduledCallbackIds: readonly string[];
  readonly reactionText: string;
  readonly resolvedTick: number;
}

export interface EncounterTransaction {
  readonly transactionId: string;
  readonly encounterId: string;
  readonly importance: EncounterImportance;
  readonly status: EncounterTransactionStatus;
  readonly corridor: EncounterSafeCorridor;
  readonly optionIds: readonly string[];
  readonly selectedOptionId: string | null;
  readonly presentedTick: number | null;
  readonly terminalTick: number | null;
  readonly resolution: EncounterResolution | null;
  readonly supersededByTransactionId: string | null;
  readonly statusText: string;
}

export type EncounterCallbackStatus = "scheduled" | "resolved" | "superseded";

export interface ScheduledEncounterCallback {
  readonly transactionId: string;
  readonly callbackId: string;
  readonly status: EncounterCallbackStatus;
  readonly label: string;
  readonly dueStageId: string;
  readonly dueTick: number;
  readonly originTransactionId: string;
  readonly originOptionId: string;
  readonly outcome: EncounterOutcomeDefinition;
  readonly resolvedTick: number | null;
  readonly supersededByTransactionId: string | null;
}

export interface EncounterStoryLogEntry {
  readonly entryId: string;
  readonly stageId: string;
  readonly simulationTick: number;
  readonly kind:
    | "encounter-presented"
    | "choice-resolved"
    | "encounter-skipped"
    | "encounter-expired"
    | "encounter-superseded"
    | "callback-resolved"
    | "recovery-offered"
    | "recovery-resolved";
  readonly text: string;
  readonly originTransactionId: string;
}

export type EncounterRecoveryStatus = "offered" | "accepted" | "dismissed";

export interface EncounterRecoveryHook {
  readonly recoveryId: string;
  readonly status: EncounterRecoveryStatus;
  readonly triggerScoreIds: readonly ScoreId[];
  readonly triggerSource: "choice" | "callback";
  readonly originTransactionId: string;
  readonly originOptionId: string | null;
  readonly stageId: string;
  readonly offeredTick: number;
  readonly resolvedTick: number | null;
  readonly scoreTarget: number;
  readonly preTriggerScores: CoreScores;
  readonly postTriggerScores: CoreScores;
  readonly appliedEffectIds: readonly string[];
}

export interface EncounterRecoveryPolicy {
  readonly triggerAtOrBelow: number;
  readonly recoverTo: number;
}

export interface EncounterEngineState {
  readonly schemaVersion: 1;
  readonly contentVersion: "encounter-engine-v1";
  readonly scores: CoreScores;
  readonly transactions: readonly EncounterTransaction[];
  readonly callbacks: readonly ScheduledEncounterCallback[];
  readonly effects: readonly EncounterAppliedEffect[];
  readonly facts: readonly EncounterFact[];
  readonly memories: readonly EncounterMemory[];
  readonly relationships: readonly EncounterRelationship[];
  readonly storyLog: readonly EncounterStoryLogEntry[];
  readonly recoveryHooks: readonly EncounterRecoveryHook[];
}

export interface EncounterClockContext {
  readonly stageId: string;
  readonly simulationTick: number;
}

export interface EncounterSafeCorridorStatus {
  readonly active: boolean;
  readonly shouldPauseWorld: boolean;
  readonly transactionId: string | null;
  readonly importance: EncounterImportance | null;
  readonly statusText: string | null;
}

export type EncounterEngineAction =
  | Readonly<{ type: "schedule"; request: EncounterScheduleRequest }>
  | Readonly<{ type: "advance"; context: EncounterClockContext }>
  | Readonly<{
      type: "resolve";
      transactionId: string;
      optionId: string;
      context: EncounterClockContext;
    }>
  | Readonly<{
      type: "skip";
      transactionId: string;
      context: EncounterClockContext;
    }>
  | Readonly<{
      type: "accept-recovery";
      recoveryId: string;
      context: EncounterClockContext;
    }>
  | Readonly<{
      type: "dismiss-recovery";
      recoveryId: string;
      context: EncounterClockContext;
    }>;
