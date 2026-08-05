import {
  canonicalizeJson,
  fnv1a64Hex,
  type CanonicalJsonValue,
} from "../canonical-json";
import {
  initialRunSetupFromStateV1,
} from "../run-factory";
import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import { decodeRunState, encodeRunState } from "../run-state-codec";
import { canonicalRunStateIdentityV1, stateHashV1 } from "../run-state-hash";
import {
  certifyRunStateWireBijectionV1,
  RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID,
  type RunStateWireBijectionPairMutator,
} from "../run-state-wire";
import { assertCoreScores } from "../score-model";
import {
  SCORE_IDS,
  type AppliedEffect,
  type CoreScores,
  type ControlMode,
  type EffectLedger,
  type Lane,
  type RunnerEntity,
  type RunnerMotion,
  type RunStateV1,
  type ScoreId,
  type SpawnState,
  type StartingProfileId,
} from "../run-state";
import {
  compareRunnerEntityCoordinates,
  resolveCanonicalContactCandidates,
  runnerEntityHorizontallyOverlapsPlayer,
  runnerEntityLaneOverlapsPlayer,
  RUNNER_ENTITY_WIDTH_MILLI,
  RUNNER_INVULNERABILITY_TICKS,
  RUNNER_PLAYER_HALF_WIDTH_MILLI,
  RUNNER_PLAYER_X_MILLI,
  runnerPatternSafeBoundaryTick,
  type ContactCandidate,
  type ContactEvent,
} from "./collision-system";
import {
  createRunnerLaboratoryEntryState,
  isAuthenticRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
} from "./contract";
import {
  assertAuthenticRunnerLaboratoryCourse,
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedPattern,
} from "./course-generator";
import {
  adjacentLane,
  assertLaneControllerState,
  laneControllerStateKey,
  lanePositionMilli,
  RUNNER_LANE_TWEEN_TICKS,
  RUNNER_LANES,
  stepLaneController,
  type LaneControllerState,
  type LaneDirection,
  type LaneIntent,
} from "./lane-controller";
import {
  compileNeutralLaneTarget,
  RUNNER_NEUTRAL_LANE_PRIORITY,
  RUNNER_NEUTRAL_POLICY_ID,
} from "./neutral-policy";
import { applyLabSettlement, beginLabSettlement } from "./settlement";
import {
  hasAuthenticRunnerModeEvaluationSupport,
  hasAuthenticRunnerModeProjection,
  registerAuthenticRunnerModeEvaluationSupport,
  registerAuthenticRunnerModeProjection,
} from "./evaluation-authentication";
import {
  assertRunnerLaboratorySaveInvariants,
  assertRunnerLaboratorySaveInvariantsForCourse,
} from "./save-invariants";
import {
  advanceRunnerLaboratory,
  chooseLane,
  createRunnerSimulationContext,
  startRunnerLaboratory,
  type RunnerSimulationContext,
  type RunnerSimulationEvent,
  type RunnerSimulationResult,
} from "./simulation";

export const RUNNER_NEUTRAL_REPLAY_ID =
  "runner-neutral-evaluation-replay-v1" as const;
export const RUNNER_AUTHENTICATED_MODE_PROJECTION_ID =
  "runner-authenticated-mode-projection-v1" as const;
export const RUNNER_MODE_EVALUATION_SUPPORT_ID =
  "runner-mode-evaluation-support-v1" as const;
export const RUNNER_EXACT_PROFILE_ORDINARY_STEP_LIFT_ID =
  "runner-exact-profile-ordinary-step-lift-v1" as const;

/** Presentation-only OR boundary; neither source is accepted by simulation. */
export function effectiveRunnerMotionReduced(
  savedReducedMotion: boolean,
  osPrefersReducedMotion: boolean,
): boolean {
  if (
    typeof savedReducedMotion !== "boolean" ||
    typeof osPrefersReducedMotion !== "boolean"
  ) {
    throw new TypeError("runner reduced-motion sources must be boolean");
  }
  return savedReducedMotion || osPrefersReducedMotion;
}

export interface RunnerNeutralReplayBoundary {
  readonly kind:
    | "start"
    | "pattern"
    | "settlement-pending"
    | "settlement-completed";
  readonly patternIndex: number | null;
  readonly simulationTick: number;
  /** Number of production simulation events emitted through this boundary. */
  readonly productionEventCount: number;
  readonly stateHash: string;
  /** A codec-ready canonical continuation snapshot. */
  readonly state: RunStateV1;
}

export type RunnerNeutralReplayClosureKind =
  | "start-before"
  | "start-after"
  | "idle-null-buffer"
  | "moving-null-buffer"
  | "moving-full-buffer"
  | "movement-completion-before"
  | "movement-completion-after"
  | "buffer-handoff-before"
  | "buffer-handoff-after"
  | "manual-marker-before"
  | "manual-marker-after"
  | "semantic-marker-before"
  | "semantic-marker-after"
  | "automatic-marker-before"
  | "automatic-marker-after"
  | "user-pause"
  | "user-resume"
  | "contact-before"
  | "contact-after"
  | "safe-pass-before"
  | "safe-pass-after"
  | "invulnerability-start"
  | "invulnerability-last-protected"
  | "invulnerability-end"
  | "settlement-pending"
  | "settlement-completed";

export interface RunnerNeutralReplayClosureSummary {
  readonly checkedBoundaryCount: number;
  readonly codecReadyCount: number;
  /** Full public decoder executions over unique exact canonical states. */
  readonly directCodecDecodeCount: number;
  readonly directCodecDiscriminantCount: number;
  readonly mandatoryDirectReloadCoverageCount: number;
  /** Codec identities transferred by the locked wire bijection theorem. */
  readonly inductivelyCertifiedCodecReadyCount: number;
  readonly directSaveInvariantCount: number;
  readonly inductivelyCertifiedSaveInvariantCount: number;
  readonly wireBijectionCertificateId:
    typeof RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID;
  readonly wireBijectionKeyCount: number;
  readonly wireBijectionPairDigest: string;
  readonly wireBijectionRecursiveInverseDigest: string;
  readonly wireIdentityTransferCount: number;
  readonly canonicalEqualityCount: number;
  readonly stateHashEqualityCount: number;
  readonly saveInvariantCount: number;
  readonly continuationCertificateCount: number;
  readonly failureCount: number;
  readonly kindCounts: Readonly<Record<RunnerNeutralReplayClosureKind, number>>;
  readonly stateHashDigest: string;
  readonly continuationCertificateDigest: string;
  readonly productionStageEvaluationCounts:
    RunnerOrdinaryStepStageEvaluationCounts;
}

export type RunnerOrdinaryStepStageName =
  | "laneStep"
  | "clockAdvance"
  | "collisionAdvanceAndResolve"
  | "resolvedThroughProjection"
  | "duePatternAppendCheck"
  | "inputBufferCommitCheck"
  | "settlementBeginCheck";

export interface RunnerOrdinaryStepStageEvaluationCounts {
  readonly laneStep: number;
  readonly clockAdvance: number;
  readonly collisionAdvanceAndResolve: number;
  readonly resolvedThroughProjection: number;
  readonly duePatternAppendCheck: number;
  readonly inputBufferCommitCheck: number;
  readonly settlementBeginCheck: number;
  readonly settlementBeginMutation: number;
}

/** @internal Negative-test seam; never used by the evidence evaluator. */
export interface RunnerReplayContinuationMutationProbe {
  readonly wireBijectionPairs?: RunStateWireBijectionPairMutator;
  readonly decodedUserPauseState?: (state: RunStateV1) => RunStateV1;
  readonly decodedSourceState?: (
    state: RunStateV1,
    sourceState: RunStateV1,
  ) => RunStateV1;
  readonly decodedFutureState?: (
    state: RunStateV1,
    sourceState: RunStateV1,
  ) => RunStateV1;
  readonly decodedFutureTick?: (
    simulationTick: number,
    sourceState: RunStateV1,
  ) => number;
  readonly decodedFutureEntityIds?: (
    instanceIds: readonly string[],
    sourceState: RunStateV1,
  ) => readonly string[];
}

export interface RunnerNeutralReplayDecisionProvenance {
  readonly patternIndex: number;
  readonly markerInstanceId: string;
  readonly controlMode: ControlMode;
  readonly simulationTick: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly markerResolution: "safe-pass" | "atomic-semantic-choice" | "automatic-oracle";
  readonly manualOracleCompletedStateHash: string | null;
}

export interface RunnerNeutralReplayTarget {
  readonly patternIndex: number;
  readonly simulationTick: number;
  /** The next production event ordinal when the policy made its selection. */
  readonly selectedBeforeProductionEventOrdinal: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly safeBoundaryTick: number;
  readonly utilityNumerator: number;
}

export interface RunnerNeutralReplayContact {
  readonly productionEventOrdinal: number;
  readonly contact: ContactEvent;
}

export interface RunnerNeutralReplayEffect {
  readonly productionEventOrdinal: number;
  readonly effect: AppliedEffect;
}

export interface RunnerNeutralReplayPass {
  readonly productionEventOrdinal: number;
  readonly simulationTick: number;
  readonly entityInstanceId: string;
}

export interface RunnerNeutralReplayInvulnerabilityWitness {
  readonly productionEventOrdinal: number;
  readonly simulationTick: number;
  readonly entityInstanceId: string;
  readonly outcome: "hazard-applied" | "hazard-suppressed";
  readonly beforeUntilTick: number;
  readonly afterUntilTick: number;
}

export interface RunnerNeutralReplayMaximumLiveEntities {
  readonly count: number;
  readonly firstWitnessTick: number;
  readonly entityInstanceIds: readonly string[];
}

export interface RunnerNeutralReplayProfileInvariant {
  readonly startingProfileId: StartingProfileId;
  readonly startingScores: CoreScores;
  readonly requestedDeltaTotals: CoreScores;
  readonly actualDeltaTotals: CoreScores;
  /** Scores reconstructed solely by folding the production effects in order. */
  readonly effectReplayedTerminalScores: CoreScores;
  readonly terminalScores: CoreScores;
  readonly productionEffectCount: number;
}

export interface RunnerNeutralReplayCourseProjection {
  readonly worldSpeedMilliPerTick: number;
  readonly includedOptionalGroupKeys: readonly string[];
  readonly patterns: readonly Readonly<{
    patternIndex: number;
    patternId: RunnerLabGeneratedPattern["patternId"];
    rotation: Lane;
    spawnTick: number;
    includedOptionalGroupIds: RunnerLabGeneratedPattern["includedOptionalGroupIds"];
    entityInstanceIds: readonly string[];
  }>[];
}

export interface RunnerNeutralReplayTape {
  readonly replayId: typeof RUNNER_NEUTRAL_REPLAY_ID;
  readonly policyId: typeof RUNNER_NEUTRAL_POLICY_ID;
  readonly controlMode: ControlMode;
  readonly runSeed: string;
  readonly difficulty: RunStateV1["difficulty"];
  readonly startingProfileId: StartingProfileId;
  readonly course: RunnerNeutralReplayCourseProjection;
  readonly startBoundary: RunnerNeutralReplayBoundary;
  readonly patternBoundaries: readonly RunnerNeutralReplayBoundary[];
  readonly pendingBoundary: RunnerNeutralReplayBoundary;
  readonly completedBoundary: RunnerNeutralReplayBoundary;
  readonly targets: readonly RunnerNeutralReplayTarget[];
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly passes: readonly RunnerNeutralReplayPass[];
  readonly invulnerabilityWitnesses: readonly RunnerNeutralReplayInvulnerabilityWitness[];
  readonly maximumLiveEntities: RunnerNeutralReplayMaximumLiveEntities;
  readonly spawnedEntityIds: readonly string[];
  readonly terminalResolvedEntityIds: readonly string[];
  readonly terminalScores: CoreScores;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: LaneDirection | null;
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
  readonly evaluatedProfileInvariant: RunnerNeutralReplayProfileInvariant;
  readonly rawLaneInputCount: number;
  readonly semanticChoiceCount: number;
  readonly automaticDecisionCount: number;
  readonly settlementBeginCount: 1;
  readonly settlementApplyCount: 1;
  readonly settlementEffectIds: readonly string[];
  readonly decisionProvenance: readonly RunnerNeutralReplayDecisionProvenance[];
  readonly replayClosure: RunnerNeutralReplayClosureSummary;
  readonly productionEventCount: number;
}

export interface RunnerForcedContinuationReplay {
  readonly replayId: "runner-forced-continuation-replay-v1";
  readonly controlMode: "manual" | "semantic-assist";
  readonly runSeed: string;
  readonly difficulty: RunStateV1["difficulty"];
  readonly startingProfileId: StartingProfileId;
  readonly forcedPatternIndex: number;
  readonly forcedTargetLane: Lane;
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly tickProgression: Readonly<{
    readonly startSimulationTick: number;
    readonly endSimulationTick: typeof RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
    readonly ordinaryTickCount: number;
    /** Identity/mode-bound digest of every produced continuation tick. */
    readonly stateHashDigest: string;
    /** Decision-marker/buffer-neutral digest for cross-mode gameplay parity. */
    readonly gameplayHashDigest: string;
  }>;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: LaneDirection | null;
  /** Ordered unresolved scoring IDs at the caller-supplied checkpoint. */
  readonly futureScoringEntityIds: readonly string[];
  readonly terminalScores: CoreScores;
  readonly completedState: RunStateV1;
  readonly completedStateHash: string;
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
}

export interface RunnerAuthenticatedMarkerTransition {
  readonly patternIndex: number;
  readonly markerInstanceId: string;
  readonly simulationTick: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly beforeStateHash: string;
  readonly afterFirstStateHash: string;
  readonly afterCommitStateHash: string;
  readonly reloadedBeforeStateHash: string;
  readonly reloadedAfterStateHash: string;
  readonly reloadRoundTripVerified: boolean;
  readonly decisionMarkerEventCount: number;
  readonly acceptedRawInputCount: number;
  readonly motion: RunnerMotion;
  readonly inputBuffer: LaneDirection | null;
  readonly eventTypes: readonly RunnerSimulationEvent["type"][];
}

/** Adapter-emitted Manual command at its exact production application tick. */
export interface RunnerAuthenticatedManualCommand {
  readonly patternIndex: number;
  readonly simulationTick: number;
  readonly ordinal: 0 | 1;
  readonly intent: LaneDirection;
}

export interface RunnerAuthenticatedModeProjection {
  readonly projectionId: typeof RUNNER_AUTHENTICATED_MODE_PROJECTION_ID;
  readonly structuralReplayId: typeof RUNNER_NEUTRAL_REPLAY_ID;
  readonly canonicalEntryHash: string;
  readonly controlMode: "manual" | "semantic-assist";
  readonly runSeed: string;
  readonly difficulty: RunStateV1["difficulty"];
  readonly startingProfileId: StartingProfileId;
  readonly startEventCount: 1;
  readonly markerTransitions: readonly RunnerAuthenticatedMarkerTransition[];
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly passes: readonly RunnerNeutralReplayPass[];
  readonly terminalScores: CoreScores;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: LaneDirection | null;
  readonly terminalResolvedEntityIds: readonly string[];
  readonly pendingState: RunStateV1;
  readonly pendingStateHash: string;
  readonly completedState: RunStateV1;
  readonly completedStateHash: string;
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
  readonly settlementEffectIds: readonly string[];
  readonly rawLaneInputCount: number;
  readonly semanticChoiceCount: number;
  readonly automaticDecisionCount: 0;
  readonly settlementBeginCount: 1;
  readonly settlementApplyCount: 1;
  readonly ordinaryStepLift: RunnerExactProfileOrdinaryStepLift;
}

export interface RunnerExactProfileOrdinaryStepLift {
  readonly liftId: typeof RUNNER_EXACT_PROFILE_ORDINARY_STEP_LIFT_ID;
  readonly canonicalEntryHash: string;
  readonly startingProfileId: StartingProfileId;
  readonly startingScores: CoreScores;
  readonly productionKernelScope: "one-authentic-structural-tape-per-seed-difficulty";
  readonly referencedSourceProductionTickCount: 3_000;
  readonly referencedDecodedProductionTickCount: 3_000;
  readonly exactProfileDirectProductionTickCount: number;
  readonly exactProfileTheoremLiftedTickCount: number;
  readonly ordinaryTickCount: 3_000;
  readonly nonEventOrdinaryTickCount: number;
  readonly stageEvaluationCounts: Readonly<{
    readonly laneStep: 3_000;
    readonly clockAdvance: 3_000;
    readonly collisionAdvanceAndResolve: 3_000;
    readonly resolvedThroughProjection: 3_000;
    readonly duePatternAppendCheck: 3_000;
    readonly inputBufferCommitCheck: 3_000;
    readonly settlementBeginCheck: 3_000;
    readonly settlementBeginMutation: 1;
  }>;
  readonly exactProfileCodecBoundaryCount: number;
  readonly exactProfileUnclampedEffectCount: number;
  readonly commandGeometryIndependent: true;
  readonly structuralTickDigest: string;
  readonly exactProfileCodecBoundaryDigest: string;
  readonly profileLiftDigest: string;
}

/**
 * Evaluator-only production seams. The candidate engine owns all state between
 * these calls; a driver may only select the real reducer used at Start, a
 * decision marker, and the terminal tick.
 */
export interface RunnerModeCandidateDriver {
  readonly start: (
    context: RunnerSimulationContext,
    entryState: RunStateV1,
  ) => RunnerSimulationResult;
  readonly marker: (
    context: RunnerSimulationContext,
    checkpoint: RunStateV1,
    target: RunnerNeutralReplayTarget,
  ) => Readonly<{
    readonly first: RunnerSimulationResult;
    readonly committed: RunnerSimulationResult;
  }>;
  readonly finish: (
    context: RunnerSimulationContext,
    preFinishState: RunStateV1,
  ) => RunnerSimulationResult;
  readonly complete: (pendingState: RunStateV1) => RunStateV1;
}

/** A complete candidate-owned Start-to-settlement execution. */
export interface RunnerModeCandidateExecution {
  readonly startedState: RunStateV1;
  readonly markerCheckpoints: readonly RunStateV1[];
  readonly markerTransitions: readonly RunnerAuthenticatedMarkerTransition[];
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly passes: readonly RunnerNeutralReplayPass[];
  readonly preFinishState: RunStateV1;
  readonly pendingState: RunStateV1;
  readonly completedState: RunStateV1;
  readonly productionEventCount: number;
  readonly ordinaryStepLift: RunnerExactProfileOrdinaryStepLift;
}

export interface RunnerModeGeometryEvent {
  readonly simulationTick: number;
  readonly laneState: LaneControllerState;
  readonly contactCandidates: readonly ContactCandidate[];
  readonly scoringPassEntityIds: readonly string[];
}

export interface RunnerModeGeometryWindow {
  readonly patternIndex: number;
  readonly manualCommittedTick: number;
  readonly manualCommittedLaneState: LaneControllerState;
  readonly assistCommittedTick: number;
  readonly assistCommittedLaneState: LaneControllerState;
  readonly events: readonly RunnerModeGeometryEvent[];
  readonly safeBoundaryTick: number;
  readonly terminalLaneState: LaneControllerState;
}

/** Shared immutable geometry only; it contains no mode result or score state. */
export interface RunnerModeGeometryPlan {
  readonly windows: readonly RunnerModeGeometryWindow[];
  readonly contactOccurrenceDigest: string;
  readonly scoringPassOccurrenceDigest: string;
}

/** @internal Negative-test seam; never used by the evidence evaluator. */
export interface RunnerModeCandidateMutationProbe {
  readonly markerResult?: (
    result: Readonly<{
      readonly first: RunnerSimulationResult;
      readonly committed: RunnerSimulationResult;
    }>,
    patternIndex: number,
  ) => Readonly<{
    readonly first: RunnerSimulationResult;
    readonly committed: RunnerSimulationResult;
  }>;
  readonly contactCandidates?: (
    candidates: readonly ContactCandidate[],
    simulationTick: number,
    patternIndex: number,
  ) => readonly ContactCandidate[];
  readonly preFinishState?: (state: RunStateV1) => RunStateV1;
  readonly finishResult?: (result: RunnerSimulationResult) => RunnerSimulationResult;
  readonly completedState?: (state: RunStateV1) => RunStateV1;
  readonly ordinaryTick?: (
    simulationTick: number,
    ordinaryTickIndex: number,
    isNonEventTick: boolean,
  ) => number;
  readonly exactProfileStartingScores?: (
    scores: CoreScores,
    startingProfileId: StartingProfileId,
  ) => CoreScores;
  readonly ordinaryStageExecuted?: (
    stage: RunnerOrdinaryStepStageName,
    simulationTick: number,
    isNonEventTick: boolean,
  ) => boolean;
}

/**
 * Immutable evaluator-only capability. Automatic Assist accepts this support
 * only after its WeakSet provenance and exact entry/tape binding are checked.
 */
export interface RunnerModeEvaluationSupport {
  readonly supportId: typeof RUNNER_MODE_EVALUATION_SUPPORT_ID;
  readonly canonicalEntryHash: string;
  readonly entryState: RunStateV1;
  readonly structuralTape: RunnerNeutralReplayTape;
  readonly context: RunnerSimulationContext;
  readonly geometryPlan: RunnerModeGeometryPlan;
  /** Present for Manual/Semantic; Automatic supplies its opaque driver later. */
  readonly defaultExecution: RunnerModeCandidateExecution | null;
  readonly startedState: RunStateV1 | null;
  readonly markerCheckpoints: readonly RunStateV1[];
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly passes: readonly RunnerNeutralReplayPass[];
  readonly terminalTransientState: RunStateV1 | null;
  readonly executeCandidate: (
    driver: RunnerModeCandidateDriver,
    mutationProbe?: RunnerModeCandidateMutationProbe,
  ) => RunnerModeCandidateExecution;
}

interface AuthenticEvaluationContext {
  readonly replayId: typeof RUNNER_NEUTRAL_REPLAY_ID;
  readonly entry: RunStateV1;
  readonly course: RunnerLabGeneratedCourse;
}

interface InductiveReplayState {
  readonly simulationTick: number;
  readonly worldDistanceMilli: number;
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly motion: RunnerMotion;
  readonly inputBuffer: LaneDirection | null;
  readonly spawn: SpawnState;
  readonly activeEntities: readonly RunnerEntity[];
  readonly invulnerableUntilTick: number;
}

interface NeutralProjection {
  readonly targetLane: Lane;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly safeBoundaryTick: number;
  readonly utilityNumerator: number;
  readonly laneMoves: 0 | 1 | 2;
}

interface AuthenticEntityDelta {
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly invulnerableUntilTick: number;
  readonly newlyResolvedEntityIds: readonly string[];
  readonly resolvedEntityIds: readonly string[];
  readonly activeEntities: readonly RunnerEntity[];
  readonly passedEntityIds: readonly string[];
  readonly events: readonly ContactEvent[];
}

interface ReplayRecorder {
  readonly context: AuthenticEvaluationContext;
  nextProductionEventOrdinal: number;
  readonly contacts: RunnerNeutralReplayContact[];
  readonly effects: RunnerNeutralReplayEffect[];
  readonly passes: RunnerNeutralReplayPass[];
  readonly invulnerabilityWitnesses: RunnerNeutralReplayInvulnerabilityWitness[];
  maximumLiveEntities: RunnerNeutralReplayMaximumLiveEntities;
  readonly replayClosure: MutableReplayClosure;
}

interface MutableReplayClosure {
  checkedBoundaryCount: number;
  codecReadyCount: number;
  directCodecDecodeCount: number;
  inductivelyCertifiedCodecReadyCount: number;
  directSaveInvariantCount: number;
  inductivelyCertifiedSaveInvariantCount: number;
  wireIdentityTransferCount: number;
  canonicalEqualityCount: number;
  stateHashEqualityCount: number;
  saveInvariantCount: number;
  failureCount: number;
  readonly kindCounts: Record<RunnerNeutralReplayClosureKind, number>;
  readonly occurrences: ReplayClosureOccurrence[];
  readonly continuationStates: Map<string, ReplayClosureContinuationState>;
  readonly stateHashes: WeakMap<object, string>;
  readonly executedTransitions: Map<string, ReplayClosureExecutedTransition>;
  readonly directCodecBasisKeys: Set<string>;
  readonly userPauseResumeStateHashes: Map<string, string>;
}

type ReplayContinuationCommand =
  | Readonly<{ readonly kind: "acknowledge-start" }>
  | Readonly<{
      readonly kind: "advance";
      readonly laneIntent: LaneIntent;
      readonly bufferAfterStep: LaneDirection | null;
      readonly assistPatternIndex: number | null;
      readonly assistTargetLane: Lane | null;
    }>
  | Readonly<{ readonly kind: "apply-settlement" }>;

interface ReplayClosureExecutedTransition {
  readonly sourceStateHash: string;
  readonly sourceSimulationTick: number;
  readonly futureStateHash: string;
  readonly futureSimulationTick: number;
  readonly command: ReplayContinuationCommand;
}

interface ReplayClosureContinuationState {
  readonly stateHash: string;
  readonly canonicalHash: string;
  readonly fullCanonicalIdentity: string;
  readonly encoded: string;
  readonly sourceState: RunStateV1;
  readonly decodedState: RunStateV1;
  readonly directlyDecoded: boolean;
}

interface ReplayClosureOccurrence {
  readonly occurrenceIndex: number;
  readonly kind: RunnerNeutralReplayClosureKind;
  readonly simulationTick: number;
  readonly lifecycleRank: number;
  readonly resolvedEntityIds: readonly string[];
  readonly effectIds: readonly string[];
  readonly motionKey: string | null;
  readonly userPaused: boolean | null;
  readonly stateHash: string;
  readonly canonicalHash: string;
}

interface ReplayClosureVerificationInput {
  readonly context: AuthenticEvaluationContext;
  readonly closure: MutableReplayClosure;
  readonly durableBoundaries: readonly RunnerNeutralReplayBoundary[];
  readonly decisionProvenance: readonly RunnerNeutralReplayDecisionProvenance[];
  readonly automaticSettlementScores: CoreScores | null;
}

interface StructuralOrdinaryStepProof {
  readonly ordinaryTickCount: 3_000;
  readonly nonEventTickNumbers: readonly number[];
  readonly structuralTickDigest: string;
}

interface ReplayContinuationCertificateResult {
  readonly certificatesByStateHash: ReadonlyMap<string, string>;
  readonly productionStageEvaluationCounts:
    RunnerOrdinaryStepStageEvaluationCounts;
}

const AUTHENTIC_EVALUATION_CONTEXTS = new WeakSet<object>();
const AUTHENTIC_INDUCTIVE_STATES = new WeakSet<object>();
const AUTHENTIC_REPLAY_TAPES = new WeakSet<object>();
const AUTHENTIC_FORCED_CONTINUATION_REPLAYS = new WeakSet<object>();
const AUTHENTIC_MODE_PROJECTION_SUPPORTS = new WeakMap<
  object,
  RunnerModeEvaluationSupport
>();
const PRODUCTION_SIMULATION_CONTEXTS = new WeakMap<object, RunnerSimulationContext>();
const MODE_GEOMETRY_PLANS = new WeakMap<object, RunnerModeGeometryPlan>();
const REPLAY_CLOSURE_VERIFICATION_INPUTS = new WeakMap<
  object,
  ReplayClosureVerificationInput
>();
const STRUCTURAL_ORDINARY_STEP_PROOFS = new WeakMap<
  object,
  StructuralOrdinaryStepProof
>();

function fail(message: string): never {
  throw new TypeError(`runner neutral evaluation replay: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isDeeplyFrozen(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) =>
    isDeeplyFrozen((value as Record<PropertyKey, unknown>)[key], seen));
}

function canonical(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function sameCanonicalDataTree(
  left: unknown,
  right: unknown,
  leftAncestors = new WeakSet<object>(),
  rightAncestors = new WeakSet<object>(),
): boolean {
  if (
    typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null
  ) {
    const validPrimitive = (value: unknown): boolean =>
      value === null || typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value) &&
        Number.isInteger(value));
    return validPrimitive(left) && validPrimitive(right) &&
      Object.is(left, right);
  }
  if (leftAncestors.has(left) || rightAncestors.has(right)) return false;
  leftAncestors.add(left);
  rightAncestors.add(right);
  try {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) return false;
      if (left.length !== right.length) return false;
      if (
        Object.getOwnPropertySymbols(left).length !== 0 ||
        Object.getOwnPropertySymbols(right).length !== 0 ||
        Reflect.ownKeys(left).length !== left.length + 1 ||
        Reflect.ownKeys(right).length !== right.length + 1
      ) {
        return false;
      }
      for (let index = 0; index < left.length; index += 1) {
        const leftDescriptor = Object.getOwnPropertyDescriptor(
          left,
          String(index),
        );
        const rightDescriptor = Object.getOwnPropertyDescriptor(
          right,
          String(index),
        );
        if (
          leftDescriptor === undefined || rightDescriptor === undefined ||
          !leftDescriptor.enumerable || !rightDescriptor.enumerable ||
          !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
          !sameCanonicalDataTree(
            leftDescriptor.value,
            rightDescriptor.value,
            leftAncestors,
            rightAncestors,
          )
        ) {
          return false;
        }
      }
      return true;
    }

    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);
    if (
      (leftPrototype !== Object.prototype && leftPrototype !== null) ||
      (rightPrototype !== Object.prototype && rightPrototype !== null) ||
      Object.getOwnPropertySymbols(left).length !== 0 ||
      Object.getOwnPropertySymbols(right).length !== 0
    ) {
      return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (
      leftKeys.length !== rightKeys.length ||
      Reflect.ownKeys(left).length !== leftKeys.length ||
      Reflect.ownKeys(right).length !== rightKeys.length
    ) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.hasOwn(right, key)) return false;
      const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
      const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
      if (
        leftDescriptor === undefined || rightDescriptor === undefined ||
        !leftDescriptor.enumerable || !rightDescriptor.enumerable ||
        !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
        leftDescriptor.value === undefined || rightDescriptor.value === undefined ||
        !sameCanonicalDataTree(
          leftDescriptor.value,
          rightDescriptor.value,
          leftAncestors,
          rightAncestors,
        )
      ) {
        return false;
      }
    }
    return true;
  } finally {
    leftAncestors.delete(left);
    rightAncestors.delete(right);
  }
}

/** @internal Adversarial test seam for decoded-future exact equality. */
export function verifyRunnerReplayCanonicalDataTreeEqualityForTest(
  left: unknown,
  right: unknown,
): boolean {
  return sameCanonicalDataTree(left, right);
}

function sameScores(left: CoreScores, right: CoreScores): boolean {
  return SCORE_IDS.every((scoreId) => left[scoreId] === right[scoreId]);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right)),
  );
}

function authenticateCanonicalEntry(entry: RunStateV1): void {
  if (!Object.isFrozen(entry)) fail("entry state must be deeply immutable");
  if (!isAuthenticRunnerLaboratoryEntryState(entry)) {
    fail("entry state is not the exact canonical laboratory entry");
  }
}

function authenticateEntry(entry: RunStateV1): AuthenticEvaluationContext {
  authenticateCanonicalEntry(entry);
  const course = generateRunnerLaboratoryCourse(
    entry.runSeed,
    entry.difficulty,
  );
  assertAuthenticRunnerLaboratoryCourse(
    course,
    entry.runSeed,
    entry.difficulty,
  );
  const context = Object.freeze({
    replayId: RUNNER_NEUTRAL_REPLAY_ID,
    entry,
    course,
  });
  AUTHENTIC_EVALUATION_CONTEXTS.add(context);
  return context;
}

function assertContext(
  context: AuthenticEvaluationContext,
): RunnerLabGeneratedCourse {
  if (!AUTHENTIC_EVALUATION_CONTEXTS.has(context)) {
    fail("evaluation context is not authentic");
  }
  assertAuthenticRunnerLaboratoryCourse(
    context.course,
    context.entry.runSeed,
    context.entry.difficulty,
  );
  return context.course;
}

/** @internal Exact hash witnesses for the partitioned full canonical identity. */
export function runnerReplayFullCanonicalIdentityHashesForTest(
  state: RunStateV1,
): Readonly<{ readonly stateHash: string; readonly canonicalHash: string }> {
  const { gameplayCanonicalJson, fullCanonicalIdentity } =
    canonicalRunStateIdentityV1(state);
  return Object.freeze({
    stateHash: fnv1a64Hex(gameplayCanonicalJson),
    canonicalHash: fnv1a64Hex(fullCanonicalIdentity),
  });
}

function cursorForPatternIndex(
  course: RunnerLabGeneratedCourse,
  patternIndex: number,
): RunnerLabGeneratedCourse["initialCursor"] {
  if (patternIndex === 0) return course.initialCursor;
  const pattern = course.patterns[patternIndex - 1];
  if (pattern === undefined) fail("spawn pattern index is outside the course");
  return pattern.outgoingCursor;
}

function resolvedThroughPatternIndex(
  course: RunnerLabGeneratedCourse,
  appendedPatternIndex: number,
  resolvedEntityIds: readonly string[],
): number {
  const resolved = new Set(resolvedEntityIds);
  let through = 0;
  for (const pattern of course.patterns.slice(0, appendedPatternIndex)) {
    if (!pattern.spawnEntities.every((entity) =>
      resolved.has(entity.instanceId))) {
      break;
    }
    through = pattern.patternIndex;
  }
  return through;
}

function initialInductiveState(
  context: AuthenticEvaluationContext,
): InductiveReplayState {
  const course = assertContext(context);
  const runner = context.entry.runner;
  if (runner === null) fail("entry state lacks its runner projection");
  const state = Object.freeze({
    simulationTick: 0,
    worldDistanceMilli: 0,
    scores: context.entry.scores,
    ledger: context.entry.effectLedger,
    motion: runner.motion,
    inputBuffer: runner.inputBuffer,
    spawn: Object.freeze({
      ...runner.spawn,
      resolvedEntityIds: Object.freeze([course.startMarker.instanceId]),
    }),
    activeEntities: runner.activeEntities,
    invulnerableUntilTick: runner.invulnerableUntilTick,
  });
  AUTHENTIC_INDUCTIVE_STATES.add(state);
  return state;
}

function assertInductiveState(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
): void {
  if (
    !AUTHENTIC_EVALUATION_CONTEXTS.has(context) ||
    !AUTHENTIC_INDUCTIVE_STATES.has(state)
  ) {
    fail("replay state lacks its private inductive provenance");
  }
}

function brandNextState(
  context: AuthenticEvaluationContext,
  previous: InductiveReplayState,
  candidate: InductiveReplayState,
): InductiveReplayState {
  assertInductiveState(context, previous);
  const course = assertContext(context);
  if (
    candidate.simulationTick !== previous.simulationTick + 1 ||
    candidate.simulationTick > RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks ||
    candidate.worldDistanceMilli !==
      candidate.simulationTick * course.worldSpeedMilliPerTick
  ) {
    fail("logical clock delta is not the exact one-tick production delta");
  }
  assertCoreScores(candidate.scores);
  assertLaneControllerState({
    motion: candidate.motion,
    inputBuffer: candidate.inputBuffer,
  });
  if (
    !Number.isSafeInteger(candidate.invulnerableUntilTick) ||
    candidate.invulnerableUntilTick < 0 ||
    candidate.activeEntities.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities ||
    candidate.spawn.resolvedEntityIds.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds
  ) {
    fail("runner delta exceeds a locked numeric or entity boundary");
  }
  const priorCursor = cursorForPatternIndex(
    course,
    previous.spawn.patternIndex,
  );
  const due = candidate.simulationTick === priorCursor.nextSpawnTick;
  const expectedPatternIndex = previous.spawn.patternIndex + (due ? 1 : 0);
  if (candidate.spawn.patternIndex !== expectedPatternIndex) {
    fail("spawn pattern index did not follow its exact one-tick cursor delta");
  }
  const expectedCursor = cursorForPatternIndex(course, expectedPatternIndex);
  const expectedResolvedThrough =
    candidate.spawn.resolvedEntityIds === previous.spawn.resolvedEntityIds
      ? previous.spawn.resolvedThroughPatternIndex
      : resolvedThroughPatternIndex(
          course,
          expectedPatternIndex,
          candidate.spawn.resolvedEntityIds,
        );
  if (
    candidate.spawn.nextSpawnTick !== expectedCursor.nextSpawnTick ||
    candidate.spawn.nextSpawnDistanceMilli !==
      expectedCursor.nextSpawnDistanceMilli ||
    candidate.spawn.resolvedThroughPatternIndex !==
      expectedResolvedThrough
  ) {
    fail("spawn cursor or resolved-through delta is not authentic");
  }
  if (
    !Object.isFrozen(candidate.activeEntities) ||
    !Object.isFrozen(candidate.spawn) ||
    !Object.isFrozen(candidate.spawn.resolvedEntityIds)
  ) {
    fail("production entity delta must remain immutable");
  }
  const branded = Object.freeze(candidate);
  AUTHENTIC_INDUCTIVE_STATES.add(branded);
  return branded;
}

function brandSameTickState(
  context: AuthenticEvaluationContext,
  previous: InductiveReplayState,
  candidate: InductiveReplayState,
): InductiveReplayState {
  assertInductiveState(context, previous);
  if (
    candidate.simulationTick !== previous.simulationTick ||
    candidate.worldDistanceMilli !== previous.worldDistanceMilli ||
    !sameScores(candidate.scores, previous.scores) ||
    canonical(candidate.ledger) !== canonical(previous.ledger) ||
    candidate.invulnerableUntilTick !== previous.invulnerableUntilTick ||
    candidate.spawn.patternIndex !== previous.spawn.patternIndex ||
    candidate.spawn.nextSpawnTick !== previous.spawn.nextSpawnTick ||
    candidate.spawn.nextSpawnDistanceMilli !== previous.spawn.nextSpawnDistanceMilli
  ) {
    fail("same-tick Assist commit changed non-marker simulation state");
  }
  assertLaneControllerState({
    motion: candidate.motion,
    inputBuffer: candidate.inputBuffer,
  });
  const branded = Object.freeze(candidate);
  AUTHENTIC_INDUCTIVE_STATES.add(branded);
  return branded;
}

function commitAssistDecisionMarker(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
  pattern: RunnerLabGeneratedPattern,
  recorder: ReplayRecorder,
): InductiveReplayState {
  assertInductiveState(context, state);
  if (context.entry.controlMode === "manual") {
    fail("Manual replay cannot atomically commit an Assist marker");
  }
  const markerIndex = state.activeEntities.findIndex((entity) =>
    entity.instanceId === pattern.decisionMarker.instanceId);
  if (markerIndex < 0 || state.spawn.resolvedEntityIds.includes(pattern.decisionMarker.instanceId)) {
    fail("Assist decision marker is absent or already resolved");
  }
  const activeEntities = Object.freeze(
    state.activeEntities.filter((_, index) => index !== markerIndex),
  );
  const resolvedEntityIds = sortedUnique([
    ...state.spawn.resolvedEntityIds,
    pattern.decisionMarker.instanceId,
  ]);
  allocateEvent(recorder);
  return brandSameTickState(context, state, {
    ...state,
    spawn: Object.freeze({
      ...state.spawn,
      resolvedThroughPatternIndex: resolvedThroughPatternIndex(
        assertContext(context),
        state.spawn.patternIndex,
        resolvedEntityIds,
      ),
      resolvedEntityIds,
    }),
    activeEntities,
  });
}

function materializeActiveState(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
): RunStateV1 {
  assertInductiveState(context, state);
  const entryRunner = context.entry.runner;
  if (entryRunner === null) fail("entry runner disappeared");
  return deepFreeze({
    ...context.entry,
    runStatus: "active" as const,
    scores: state.scores,
    effectLedger: state.ledger,
    simulationTick: state.simulationTick,
    stage: {
      ...context.entry.stage,
      phase: "active" as const,
      activeTicks: state.simulationTick,
      worldDistanceMilli: state.worldDistanceMilli,
      settlement: null,
    },
    runner: {
      ...entryRunner,
      motion: state.motion,
      inputBuffer: state.inputBuffer,
      spawn: state.spawn,
      activeEntities: state.activeEntities,
      invulnerableUntilTick: state.invulnerableUntilTick,
      userPaused: false,
    },
  });
}

function boundary(
  kind: RunnerNeutralReplayBoundary["kind"],
  patternIndex: number | null,
  productionEventCount: number,
  state: RunStateV1,
): RunnerNeutralReplayBoundary {
  return Object.freeze({
    kind,
    patternIndex,
    simulationTick: state.simulationTick,
    productionEventCount,
    stateHash: stateHashV1(state),
    state,
  });
}

const REPLAY_CLOSURE_KINDS = Object.freeze([
  "start-before",
  "start-after",
  "idle-null-buffer",
  "moving-null-buffer",
  "moving-full-buffer",
  "movement-completion-before",
  "movement-completion-after",
  "buffer-handoff-before",
  "buffer-handoff-after",
  "manual-marker-before",
  "manual-marker-after",
  "semantic-marker-before",
  "semantic-marker-after",
  "automatic-marker-before",
  "automatic-marker-after",
  "user-pause",
  "user-resume",
  "contact-before",
  "contact-after",
  "safe-pass-before",
  "safe-pass-after",
  "invulnerability-start",
  "invulnerability-last-protected",
  "invulnerability-end",
  "settlement-pending",
  "settlement-completed",
] as const satisfies readonly RunnerNeutralReplayClosureKind[]);

function createReplayClosure(): MutableReplayClosure {
  return {
    checkedBoundaryCount: 0,
    codecReadyCount: 0,
    directCodecDecodeCount: 0,
    inductivelyCertifiedCodecReadyCount: 0,
    directSaveInvariantCount: 0,
    inductivelyCertifiedSaveInvariantCount: 0,
    wireIdentityTransferCount: 0,
    canonicalEqualityCount: 0,
    stateHashEqualityCount: 0,
    saveInvariantCount: 0,
    failureCount: 0,
    kindCounts: Object.fromEntries(
      REPLAY_CLOSURE_KINDS.map((kind) => [kind, 0]),
    ) as Record<RunnerNeutralReplayClosureKind, number>,
    occurrences: [],
    continuationStates: new Map<string, ReplayClosureContinuationState>(),
    stateHashes: new WeakMap<object, string>(),
    executedTransitions: new Map<string, ReplayClosureExecutedTransition>(),
    directCodecBasisKeys: new Set<string>(),
    userPauseResumeStateHashes: new Map<string, string>(),
  };
}

function replayClosureLifecycleRank(state: RunStateV1): number {
  if (state.runStatus === "completed") return 2;
  return state.stage.phase === "settling" ? 1 : 0;
}

/**
 * Semantic branch/value-shape basis for the public decoder and laboratory
 * invariant checker. Scalar progression is intentionally omitted: every
 * unique state still runs the exact invariant, encoder, and state hash below.
 */
function replayClosureCodecDiscriminantKey(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): string {
  const runner = state.runner;
  const settlement = state.stage.settlement;
  let latestNegativeEffectId: string | null = null;
  for (const effect of state.effectLedger.recent) {
    if (effect.source === "runner" && effect.actualDelta < 0) {
      latestNegativeEffectId = effect.effectId;
    }
  }
  const invulnerabilityPhase = runner === null ||
      runner.invulnerableUntilTick === 0
    ? "none"
    : runner.invulnerableUntilTick === state.simulationTick +
        RUNNER_INVULNERABILITY_TICKS
      ? "start"
      : runner.invulnerableUntilTick > state.simulationTick + 1
        ? "protected-middle"
        : runner.invulnerableUntilTick === state.simulationTick + 1
          ? "last-protected"
          : runner.invulnerableUntilTick === state.simulationTick
            ? "end"
            : "expired";
  return canonical({
    runSeed: state.runSeed,
    controlMode: state.controlMode,
    difficulty: state.difficulty,
    startingProfileId: state.startingProfileId,
    lifecycle: {
      runStatus: state.runStatus,
      stagePhase: state.stage.phase,
      settlement: settlement === null
        ? null
        : {
            status: settlement.status,
            completedTickIsNull: settlement.completedTick === null,
            effectIds: settlement.effectIds,
          },
      runner: runner === null ? "absent" : "present",
      factsShape: state.storyState.facts.length,
      memoriesShape: state.storyState.memories.length,
    },
    scores: state.scores,
    runner: runner === null
      ? null
      : {
          userPaused: runner.userPaused,
          laneControllerStateKey: laneControllerStateKey({
            motion: runner.motion,
            inputBuffer: runner.inputBuffer,
          }),
          spawn: {
            patternIndex: runner.spawn.patternIndex,
            resolvedThroughPatternIndex:
              runner.spawn.resolvedThroughPatternIndex,
            cursorLifecycle: runner.spawn.patternIndex === 0
              ? "initial"
              : runner.spawn.patternIndex <= course.patterns.length
                ? `pattern-${runner.spawn.patternIndex}`
                : "terminal",
            startResolved: runner.spawn.resolvedEntityIds.includes(
              course.startMarker.instanceId,
            ),
            finishResolved: runner.spawn.resolvedEntityIds.includes(
              course.finishMarker.instanceId,
            ),
            resolvedEntityIds: runner.spawn.resolvedEntityIds,
          },
          activeEntities: runner.activeEntities.map((entity) => ({
            instanceId: entity.instanceId,
            kind: entity.kind,
            contentId: entity.contentId,
            patternIndex: entity.patternIndex,
            slotIndex: entity.slotIndex,
            lane: entity.lane,
            widthMilli: entity.widthMilli,
            contactState: entity.contactState,
          })),
          invulnerability: {
            latestNegativeEffectId,
            phase: invulnerabilityPhase,
          },
        },
    ledger: {
      recent: state.effectLedger.recent,
      totalsBySource: state.effectLedger.totalsBySource,
    },
    narrative: {
      storyState: state.storyState,
      encounter: state.encounter === null ? "null" : "present",
      recovery: state.recovery === null ? "null" : "present",
      consequences: {
        pending: state.consequences.pending.length,
        resolved: state.consequences.resolved.length,
        terminal: state.consequences.terminal.length,
      },
    },
  });
}

function replayClosureKindRequiresDirectReload(
  kind: RunnerNeutralReplayClosureKind,
): boolean {
  return kind !== "idle-null-buffer" &&
    kind !== "moving-null-buffer" &&
    kind !== "moving-full-buffer";
}

function certifyReplayClosureOccurrence(
  recorder: ReplayRecorder,
  kind: RunnerNeutralReplayClosureKind,
  state: RunStateV1,
): ReplayClosureOccurrence {
  const closure = recorder.replayClosure;
  try {
    const encoded = encodeRunState(state);
    const {
      gameplayCanonicalJson: gameplayCanonical,
      fullCanonicalIdentity: sourceCanonical,
    } = canonicalRunStateIdentityV1(state);
    // This is the exact stateHashV1 definition, sharing the already-produced
    // canonical projection instead of traversing the state a second time.
    const sourceStateHash = fnv1a64Hex(gameplayCanonical);
    const canonicalHash = fnv1a64Hex(sourceCanonical);
    const priorContinuationState = closure.continuationStates.get(
      sourceStateHash,
    );
    let decodedState: RunStateV1;
    if (priorContinuationState === undefined) {
      assertRunnerLaboratorySaveInvariantsForCourse(
        state,
        recorder.context.course,
      );
      closure.directSaveInvariantCount += 1;
      const basisKey = replayClosureCodecDiscriminantKey(
        state,
        recorder.context.course,
      );
      const requiresDirectReload = replayClosureKindRequiresDirectReload(kind) ||
        !closure.directCodecBasisKeys.has(basisKey);
      let directlyDecoded = false;
      if (requiresDirectReload) {
        const decoded = decodeRunState(encoded, RUNNER_LABORATORY_CATALOG, {
          runnerLaboratoryCourse: recorder.context.course,
        });
        if (decoded.kind !== "ready" || decoded.migratedFrom !== null) {
          fail(`replay closure ${kind} is not codec-ready`);
        }
        const decodedEncoded = encodeRunState(decoded.state);
        const decodedCanonical = canonicalRunStateIdentityV1(
          decoded.state,
        ).fullCanonicalIdentity;
        if (
          decodedEncoded !== encoded ||
          decodedCanonical !== sourceCanonical
        ) {
          fail(`replay closure ${kind} changed across canonical codec round-trip`);
        }
        // The structure-validated RunStateV1 wire adapter is a closed,
        // collision-free bijection over all locked keys. Exact wire equality
        // therefore transfers canonical and stateHashV1 identity to decoded.
        decodedState = decoded.state;
        directlyDecoded = true;
        closure.directCodecBasisKeys.add(basisKey);
        closure.directCodecDecodeCount += 1;
      } else {
        decodedState = state;
        closure.inductivelyCertifiedCodecReadyCount += 1;
      }
      closure.continuationStates.set(sourceStateHash, Object.freeze({
        stateHash: sourceStateHash,
        canonicalHash,
        fullCanonicalIdentity: sourceCanonical,
        encoded,
        sourceState: state,
        decodedState,
        directlyDecoded,
      }));
    } else {
      if (
        priorContinuationState.encoded !== encoded ||
        priorContinuationState.fullCanonicalIdentity !== sourceCanonical ||
        priorContinuationState.canonicalHash !== canonicalHash
      ) {
        fail(`replay closure ${kind} state hash collision changed exact state`);
      }
      if (
        replayClosureKindRequiresDirectReload(kind) &&
        !priorContinuationState.directlyDecoded
      ) {
        const decoded = decodeRunState(encoded, RUNNER_LABORATORY_CATALOG, {
          runnerLaboratoryCourse: recorder.context.course,
        });
        if (
          decoded.kind !== "ready" || decoded.migratedFrom !== null ||
          encodeRunState(decoded.state) !== encoded ||
          canonicalRunStateIdentityV1(decoded.state).fullCanonicalIdentity !==
            sourceCanonical
        ) {
          fail(`replay closure ${kind} failed its mandatory direct reload`);
        }
        decodedState = decoded.state;
        closure.directCodecDecodeCount += 1;
        closure.continuationStates.set(sourceStateHash, Object.freeze({
          ...priorContinuationState,
          decodedState,
          directlyDecoded: true,
        }));
      } else {
        decodedState = priorContinuationState.decodedState;
        closure.inductivelyCertifiedCodecReadyCount += 1;
      }
      closure.inductivelyCertifiedSaveInvariantCount += 1;
    }
    closure.wireIdentityTransferCount += 1;
    closure.codecReadyCount += 1;
    closure.canonicalEqualityCount += 1;
    closure.stateHashEqualityCount += 1;
    closure.saveInvariantCount = closure.directSaveInvariantCount +
      closure.inductivelyCertifiedSaveInvariantCount;
    closure.stateHashes.set(state, sourceStateHash);
    closure.stateHashes.set(decodedState, sourceStateHash);
    const runner = decodedState.runner;
    return Object.freeze({
      occurrenceIndex: closure.occurrences.length,
      kind,
      simulationTick: decodedState.simulationTick,
      lifecycleRank: replayClosureLifecycleRank(decodedState),
      resolvedEntityIds: Object.freeze([
        ...(runner?.spawn.resolvedEntityIds ?? []),
      ]),
      effectIds: Object.freeze(decodedState.effectLedger.recent.map(
        ({ effectId }) => effectId,
      )),
      motionKey: runner === null
        ? null
        : laneControllerStateKey({
            motion: runner.motion,
            inputBuffer: runner.inputBuffer,
          }),
      userPaused: runner?.userPaused ?? null,
      stateHash: sourceStateHash,
      canonicalHash,
    });
  } catch (error) {
    closure.failureCount += 1;
    throw error;
  }
}

function recordReplayBoundary(
  recorder: ReplayRecorder,
  kind: RunnerNeutralReplayClosureKind,
  state: RunStateV1 | (() => RunStateV1),
): void {
  const materialized = typeof state === "function" ? state() : state;
  const occurrence = certifyReplayClosureOccurrence(recorder, kind, materialized);
  recorder.replayClosure.occurrences.push(occurrence);
  recorder.replayClosure.checkedBoundaryCount += 1;
  recorder.replayClosure.kindCounts[kind] += 1;
}

/** @internal Mutation-test seam for the exact occurrence codec certificate. */
export function verifyRunnerReplayClosureOccurrenceForTest(
  state: RunStateV1,
): boolean {
  try {
    const course = generateRunnerLaboratoryCourse(
      state.runSeed,
      state.difficulty,
    );
    assertAuthenticRunnerLaboratoryCourse(
      course,
      state.runSeed,
      state.difficulty,
    );
    const context: AuthenticEvaluationContext = Object.freeze({
      replayId: RUNNER_NEUTRAL_REPLAY_ID,
      entry: state,
      course,
    });
    const recorder: ReplayRecorder = {
      context,
      nextProductionEventOrdinal: 0,
      contacts: [],
      effects: [],
      passes: [],
      invulnerabilityWitnesses: [],
      maximumLiveEntities: Object.freeze({
        count: state.runner?.activeEntities.length ?? 0,
        firstWitnessTick: state.simulationTick,
        entityInstanceIds: Object.freeze(
          state.runner?.activeEntities.map(({ instanceId }) => instanceId) ?? [],
        ),
      }),
      replayClosure: createReplayClosure(),
    };
    certifyReplayClosureOccurrence(recorder, "idle-null-buffer", state);
    return recorder.replayClosure.codecReadyCount === 1 &&
      recorder.replayClosure.canonicalEqualityCount === 1 &&
      recorder.replayClosure.stateHashEqualityCount === 1 &&
      recorder.replayClosure.saveInvariantCount === 1 &&
      recorder.replayClosure.failureCount === 0;
  } catch {
    return false;
  }
}

/** @internal Mutation-test seam for exact-duplicate certificate reuse. */
export function verifyRunnerReplayExactDuplicateForTest(
  sourceState: RunStateV1,
  duplicateState: RunStateV1,
): boolean {
  try {
    const course = generateRunnerLaboratoryCourse(
      sourceState.runSeed,
      sourceState.difficulty,
    );
    assertAuthenticRunnerLaboratoryCourse(
      course,
      sourceState.runSeed,
      sourceState.difficulty,
    );
    const context: AuthenticEvaluationContext = Object.freeze({
      replayId: RUNNER_NEUTRAL_REPLAY_ID,
      entry: sourceState,
      course,
    });
    const recorder = replayContinuationRecorder(context);
    certifyReplayClosureOccurrence(recorder, "idle-null-buffer", sourceState);
    certifyReplayClosureOccurrence(recorder, "idle-null-buffer", duplicateState);
    const closure = recorder.replayClosure;
    return closure.codecReadyCount === 2 &&
      closure.directCodecDecodeCount === 1 &&
      closure.inductivelyCertifiedCodecReadyCount === 1 &&
      closure.directSaveInvariantCount === 1 &&
      closure.inductivelyCertifiedSaveInvariantCount === 1 &&
      closure.wireIdentityTransferCount === 2 &&
      closure.canonicalEqualityCount === 2 &&
      closure.stateHashEqualityCount === 2 &&
      closure.saveInvariantCount === 2 &&
      closure.failureCount === 0;
  } catch {
    return false;
  }
}

/** @internal Mutation-test seam for a non-basis unique occurrence. */
export function verifyRunnerReplayInductiveOccurrenceForTest(
  state: RunStateV1,
): boolean {
  try {
    const course = generateRunnerLaboratoryCourse(
      state.runSeed,
      state.difficulty,
    );
    assertAuthenticRunnerLaboratoryCourse(
      course,
      state.runSeed,
      state.difficulty,
    );
    const context: AuthenticEvaluationContext = Object.freeze({
      replayId: RUNNER_NEUTRAL_REPLAY_ID,
      entry: state,
      course,
    });
    const recorder = replayContinuationRecorder(context);
    recorder.replayClosure.directCodecBasisKeys.add(
      replayClosureCodecDiscriminantKey(state, course),
    );
    const runner = state.runner;
    const kind: RunnerNeutralReplayClosureKind = runner?.motion.kind === "idle"
      ? "idle-null-buffer"
      : runner?.inputBuffer === null
        ? "moving-null-buffer"
        : "moving-full-buffer";
    certifyReplayClosureOccurrence(recorder, kind, state);
    const closure = recorder.replayClosure;
    return closure.codecReadyCount === 1 &&
      closure.directCodecDecodeCount === 0 &&
      closure.inductivelyCertifiedCodecReadyCount === 1 &&
      closure.directSaveInvariantCount === 1 &&
      closure.inductivelyCertifiedSaveInvariantCount === 0 &&
      closure.wireIdentityTransferCount === 1 &&
      closure.failureCount === 0;
  } catch {
    return false;
  }
}

function recordStructuralLaneBoundary(
  context: AuthenticEvaluationContext,
  recorder: ReplayRecorder,
  state: InductiveReplayState,
  materialized: RunStateV1 | null = null,
): void {
  recordReplayBoundary(
    recorder,
    state.motion.kind === "idle"
      ? "idle-null-buffer"
      : state.inputBuffer === null
        ? "moving-null-buffer"
        : "moving-full-buffer",
    materialized ?? (() => materializeActiveState(context, state)),
  );
}

function recordExecutedReplayTransition(
  closure: MutableReplayClosure,
  sourceState: RunStateV1,
  futureState: RunStateV1,
  command: ReplayContinuationCommand,
): void {
  const sourceStateHash = closure.stateHashes.get(sourceState);
  const futureStateHash = closure.stateHashes.get(futureState);
  if (sourceStateHash === undefined || futureStateHash === undefined) {
    fail("executed replay transition lacks a per-occurrence codec witness");
  }
  const transition = Object.freeze({
    sourceStateHash,
    sourceSimulationTick: sourceState.simulationTick,
    futureStateHash,
    futureSimulationTick: futureState.simulationTick,
    command,
  });
  const prior = closure.executedTransitions.get(sourceStateHash);
  if (prior !== undefined && canonical(prior) !== canonical(transition)) {
    fail("one replay state produced two different authenticated futures");
  }
  closure.executedTransitions.set(sourceStateHash, prior ?? transition);
}

const REPLAY_REMAINING_ENTITY_ID_COMPARISON_CAP = 50;

interface ReplayContinuationCommandSchedule {
  readonly firstByTick: ReadonlyMap<number, RunnerNeutralReplayDecisionProvenance>;
  readonly bufferedByTick: ReadonlyMap<number, RunnerNeutralReplayDecisionProvenance>;
}

function replayContinuationCommandSchedule(
  decisionProvenance: readonly RunnerNeutralReplayDecisionProvenance[],
): ReplayContinuationCommandSchedule {
  const firstByTick = new Map<number, RunnerNeutralReplayDecisionProvenance>();
  const bufferedByTick = new Map<number, RunnerNeutralReplayDecisionProvenance>();
  for (const decision of decisionProvenance) {
    if (firstByTick.has(decision.simulationTick)) {
      fail("replay continuation has two authenticated commands at one marker tick");
    }
    firstByTick.set(decision.simulationTick, decision);
    if (decision.controlMode === "manual" && decision.bufferedIntent !== null) {
      const bufferedTick = decision.simulationTick + 1;
      if (bufferedByTick.has(bufferedTick)) {
        fail("replay continuation has two authenticated buffered commands at one tick");
      }
      bufferedByTick.set(bufferedTick, decision);
    }
  }
  return Object.freeze({ firstByTick, bufferedByTick });
}

function expectedReplayContinuationCommand(
  state: RunStateV1,
  schedule: ReplayContinuationCommandSchedule,
  course: RunnerLabGeneratedCourse,
): ReplayContinuationCommand | null {
  if (state.runStatus === "completed") return null;
  if (state.stage.phase === "settling") {
    return Object.freeze({ kind: "apply-settlement" as const });
  }
  const runner = state.runner;
  if (runner === null) fail("active replay continuation lost its runner state");
  if (!runner.spawn.resolvedEntityIds.includes(course.startMarker.instanceId)) {
    return Object.freeze({ kind: "acknowledge-start" as const });
  }
  const markerDecision = schedule.firstByTick.get(state.simulationTick);
  if (markerDecision !== undefined) {
    if (
      markerDecision.controlMode !== state.controlMode ||
      markerDecision.patternIndex !== runner.spawn.patternIndex
    ) {
      fail("replay continuation marker command does not match its saved state");
    }
    return Object.freeze({
      kind: "advance" as const,
      laneIntent: markerDecision.firstIntent,
      bufferAfterStep: state.controlMode === "manual"
        ? null
        : markerDecision.bufferedIntent,
      assistPatternIndex: state.controlMode === "manual"
        ? null
        : markerDecision.patternIndex,
      assistTargetLane: state.controlMode === "manual"
        ? null
        : markerDecision.targetLane,
    });
  }
  const bufferedDecision = state.controlMode === "manual"
    ? schedule.bufferedByTick.get(state.simulationTick)
    : undefined;
  return Object.freeze({
    kind: "advance" as const,
    laneIntent: bufferedDecision?.bufferedIntent ?? null,
    bufferAfterStep: null,
    assistPatternIndex: null,
    assistTargetLane: null,
  });
}

function replayContinuationRecorder(
  context: AuthenticEvaluationContext,
): ReplayRecorder {
  return {
    context,
    nextProductionEventOrdinal: 0,
    contacts: [],
    effects: [],
    passes: [],
    invulnerabilityWitnesses: [],
    maximumLiveEntities: Object.freeze({
      count: 0,
      firstWitnessTick: 0,
      entityInstanceIds: Object.freeze([]),
    }),
    replayClosure: createReplayClosure(),
  };
}

function resetReplayContinuationRecorder(recorder: ReplayRecorder): void {
  recorder.nextProductionEventOrdinal = 0;
  recorder.contacts.length = 0;
  recorder.effects.length = 0;
  recorder.passes.length = 0;
  recorder.invulnerabilityWitnesses.length = 0;
}

function inductiveReplayStateFromSnapshot(
  context: AuthenticEvaluationContext,
  state: RunStateV1,
): InductiveReplayState {
  if (
    state.runStatus !== "active" || state.stage.phase !== "active" ||
    state.stage.settlement !== null || state.runner === null
  ) {
    fail("replay continuation cannot induct a non-active snapshot");
  }
  const runner = state.runner;
  const inductive = Object.freeze({
    simulationTick: state.simulationTick,
    worldDistanceMilli: state.stage.worldDistanceMilli,
    scores: state.scores,
    ledger: state.effectLedger,
    motion: runner.motion,
    inputBuffer: runner.inputBuffer,
    spawn: runner.spawn,
    activeEntities: runner.activeEntities,
    invulnerableUntilTick: runner.invulnerableUntilTick,
  });
  AUTHENTIC_INDUCTIVE_STATES.add(inductive);
  assertInductiveState(context, inductive);
  return inductive;
}

function acknowledgeReplayContinuationStart(
  context: AuthenticEvaluationContext,
  state: RunStateV1,
): RunStateV1 {
  const course = assertContext(context);
  if (
    state.runStatus !== "active" || state.stage.phase !== "active" ||
    state.runner === null || state.simulationTick !== 0 ||
    state.runner.spawn.resolvedEntityIds.includes(course.startMarker.instanceId)
  ) {
    fail("replay continuation Start command is not applicable");
  }
  return deepFreeze({
    ...state,
    runner: {
      ...state.runner,
      spawn: {
        ...state.runner.spawn,
        resolvedEntityIds: sortedUnique([
          ...state.runner.spawn.resolvedEntityIds,
          course.startMarker.instanceId,
        ]),
      },
      userPaused: false,
    },
  });
}

function remainingReplayEntityIds(
  course: RunnerLabGeneratedCourse,
  state: RunStateV1,
): readonly string[] {
  if (state.runStatus === "completed") return Object.freeze([]);
  if (state.runner === null) {
    fail("non-completed replay continuation lost its resolved-ID ledger");
  }
  const resolved = new Set(state.runner.spawn.resolvedEntityIds);
  return Object.freeze(course.canonicalEntityIds
    .filter((instanceId) => !resolved.has(instanceId))
    .slice(0, REPLAY_REMAINING_ENTITY_ID_COMPARISON_CAP));
}

function executePrivateReplayContinuationCommand(
  context: AuthenticEvaluationContext,
  state: RunStateV1,
  command: ReplayContinuationCommand,
  automaticSettlementScores: CoreScores | null,
  recorder: ReplayRecorder,
): RunStateV1 {
  resetReplayContinuationRecorder(recorder);
  if (command.kind === "apply-settlement") {
    if (state.runStatus === "completed" || state.stage.phase !== "settling") {
      fail("replay continuation settlement command is not applicable");
    }
    return applyLabSettlement(state, automaticSettlementScores);
  }
  const course = assertContext(context);
  if (command.kind === "acknowledge-start") {
    return acknowledgeReplayContinuationStart(context, state);
  }

  let inductive = inductiveReplayStateFromSnapshot(context, state);
  if (command.assistPatternIndex !== null) {
    if (state.controlMode === "manual") {
      fail("manual replay continuation cannot execute an Assist marker command");
    }
    const pattern = course.patterns[command.assistPatternIndex - 1];
    if (pattern === undefined || pattern.spawnTick !== state.simulationTick) {
      fail("replay continuation Assist command lost its generated marker");
    }
    inductive = commitAssistDecisionMarker(
      context,
      inductive,
      pattern,
      recorder,
    );
  }

  const advanced = advanceOneTick(
    context,
    inductive,
    command.laneIntent,
    recorder,
    command.bufferAfterStep,
  ).state;
  const activeNext = materializeActiveState(context, advanced);
  if (advanced.simulationTick !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks) {
    return activeNext;
  }
  return beginLabSettlement(activeNext, automaticSettlementScores);
}

/**
 * Executes one captured continuation through the public production reducer.
 * Automatic Assist retains its private authenticated oracle path: the public
 * reducer deliberately accepts only an unforgeable oracle capability owned by
 * the Automatic evaluator.
 */
function executeProductionReplayContinuationCommand(
  context: AuthenticEvaluationContext,
  simulationContext: RunnerSimulationContext,
  state: RunStateV1,
  command: ReplayContinuationCommand,
  automaticSettlementScores: CoreScores | null,
  privateRecorder: ReplayRecorder,
): RunStateV1 {
  if (state.controlMode === "automatic-assist") {
    return executePrivateReplayContinuationCommand(
      context,
      state,
      command,
      automaticSettlementScores,
      privateRecorder,
    );
  }
  if (command.kind === "apply-settlement") {
    if (state.runStatus === "completed" || state.stage.phase !== "settling") {
      fail("production replay settlement command is not applicable");
    }
    return applyLabSettlement(state, null);
  }
  if (command.kind === "acknowledge-start") {
    const started = startRunnerLaboratory(simulationContext, state);
    if (
      !started.stateChanged || started.tickDelta !== 0 ||
      started.events.length !== 1 ||
      started.events[0]?.type !== "start-acknowledged"
    ) {
      fail("production replay Start command did not acknowledge exactly once");
    }
    return started.state;
  }

  let result: RunnerSimulationResult;
  if (command.assistPatternIndex !== null) {
    if (
      state.controlMode !== "semantic-assist" ||
      command.assistTargetLane === null
    ) {
      fail("production replay Assist command lacks its Semantic target");
    }
    result = chooseLane(
      simulationContext,
      state,
      command.assistTargetLane,
    );
  } else {
    if (command.assistTargetLane !== null) {
      fail("production replay ordinary command unexpectedly carries a target");
    }
    result = advanceRunnerLaboratory(simulationContext, state, {
      laneIntent: command.laneIntent,
    });
  }
  if (
    !result.stateChanged || result.tickDelta !== 1 ||
    result.previousTick !== state.simulationTick ||
    result.currentTick !== state.simulationTick + 1
  ) {
    fail("production replay command did not execute one public ordinary step");
  }
  return result.state;
}

function executedReplayContinuationCertificates(
  input: ReplayClosureVerificationInput,
  mutationProbe?: RunnerReplayContinuationMutationProbe,
): ReplayContinuationCertificateResult {
  const { context, closure, automaticSettlementScores } = input;
  const course = assertContext(context);
  const schedule = replayContinuationCommandSchedule(input.decisionProvenance);
  const privateRecorder = replayContinuationRecorder(context);
  const simulationContext = createRunnerSimulationContext(
    context.entry.runSeed,
    context.entry.difficulty,
  );
  if (canonical(courseProjection(simulationContext.course)) !== canonical(
    courseProjection(course),
  )) {
    fail("production continuation context changed its authenticated course");
  }
  const certificatesByStateHash = new Map<string, string>();
  const productionStageEvaluationCounts = {
    laneStep: 0,
    clockAdvance: 0,
    collisionAdvanceAndResolve: 0,
    resolvedThroughProjection: 0,
    duePatternAppendCheck: 0,
    inputBufferCommitCheck: 0,
    settlementBeginCheck: 0,
    settlementBeginMutation: 0,
  };
  const orderedStates: ReplayClosureContinuationState[] = [];
  const orderedTransitions: ReplayClosureExecutedTransition[] = [];
  const visitedStateHashes = new Set<string>();
  let stateHash = closure.stateHashes.get(context.entry) ??
    stateHashV1(context.entry);

  // Follow only the future hash captured from the actually executed source
  // transition. Insertion order, tick sorting, and inferred adjacency are not
  // accepted as evidence of a composable suffix.
  while (true) {
    if (visitedStateHashes.has(stateHash)) {
      fail("executed replay continuation contains a transition cycle");
    }
    const record = closure.continuationStates.get(stateHash);
    if (record === undefined) {
      fail("executed replay continuation points outside its codec states");
    }
    visitedStateHashes.add(stateHash);
    orderedStates.push(record);
    if (record.sourceState.runStatus === "completed") break;
    const transition = closure.executedTransitions.get(stateHash);
    if (transition === undefined || transition.sourceStateHash !== stateHash) {
      fail("executed replay continuation chain lacks its captured source edge");
    }
    orderedTransitions.push(transition);
    stateHash = transition.futureStateHash;
    if (orderedStates.length > closure.continuationStates.size) {
      fail("executed replay continuation exceeded its finite codec state set");
    }
  }
  const userPauseStateHashes = new Set(
    closure.userPauseResumeStateHashes.keys(),
  );
  if (
    visitedStateHashes.size + userPauseStateHashes.size !==
      closure.continuationStates.size ||
    [...userPauseStateHashes].some((hash) => visitedStateHashes.has(hash)) ||
    [...closure.userPauseResumeStateHashes.values()].some((hash) =>
      !visitedStateHashes.has(hash)) ||
    orderedTransitions.length + 1 !== orderedStates.length ||
    closure.executedTransitions.size !== orderedTransitions.length
  ) {
    fail("codec continuation states do not form one exact executed chain");
  }

  let decodedChainState = orderedStates[0]?.decodedState;
  if (decodedChainState === undefined || !orderedStates[0]?.directlyDecoded) {
    fail("executed replay continuation lacks a direct decoded Start basis");
  }
  for (let index = 0; index < orderedStates.length; index += 1) {
    const record = orderedStates[index]!;
    const sourceState = record.sourceState;
    if (record.directlyDecoded) decodedChainState = record.decodedState;
    const decodedState = decodedChainState;
    const sourceRemainingIds = remainingReplayEntityIds(course, sourceState);
    const decodedRemainingIds = mutationProbe?.decodedFutureEntityIds?.(
      remainingReplayEntityIds(course, decodedState),
      sourceState,
    ) ?? remainingReplayEntityIds(course, decodedState);
    if (canonical(sourceRemainingIds) !== canonical(decodedRemainingIds)) {
      fail("replay continuation future stable entity-ID suffix changed after decode");
    }

    if (sourceState.runStatus === "completed") {
      if (closure.executedTransitions.has(record.stateHash)) {
        fail("completed replay continuation unexpectedly owns a future transition");
      }
      continue;
    }

    const transition = orderedTransitions[index];
    const expectedCommand = expectedReplayContinuationCommand(
      sourceState,
      schedule,
      course,
    );
    if (
      transition === undefined || expectedCommand === null ||
      canonical(transition.command) !== canonical(expectedCommand)
    ) {
      fail("replay continuation lacks its exact authenticated source transition");
    }
    const decodedExecutionSource = mutationProbe?.decodedSourceState?.(
      decodedState,
      sourceState,
    ) ?? decodedState;
    const decodedStep = executeProductionReplayContinuationCommand(
      context,
      simulationContext,
      decodedExecutionSource,
      transition.command,
      automaticSettlementScores,
      privateRecorder,
    );
    if (transition.command.kind === "advance") {
      // A successful public ordinary reducer result can only be returned after
      // ordinaryStep has executed these seven ordered stages. Count the actual
      // accepted decoded edge here, rather than declaring 3,000 afterward.
      productionStageEvaluationCounts.laneStep += 1;
      productionStageEvaluationCounts.clockAdvance += 1;
      productionStageEvaluationCounts.collisionAdvanceAndResolve += 1;
      productionStageEvaluationCounts.resolvedThroughProjection += 1;
      productionStageEvaluationCounts.duePatternAppendCheck += 1;
      productionStageEvaluationCounts.inputBufferCommitCheck += 1;
      productionStageEvaluationCounts.settlementBeginCheck += 1;
      if (
        decodedStep.stage.phase === "settling" &&
        decodedStep.stage.settlement?.status === "pending"
      ) {
        productionStageEvaluationCounts.settlementBeginMutation += 1;
      }
    }
    const decodedFutureState = mutationProbe?.decodedFutureState?.(
      decodedStep,
      sourceState,
    ) ?? decodedStep;
    const decodedFutureTick = mutationProbe?.decodedFutureTick?.(
      decodedFutureState.simulationTick,
      sourceState,
    ) ?? decodedFutureState.simulationTick;
    if (transition.futureSimulationTick !== decodedFutureTick) {
      fail("replay continuation future command or logical tick changed after decode");
    }
    const futureRecord = closure.continuationStates.get(
      transition.futureStateHash,
    );
    if (futureRecord === undefined) {
      fail("executed source transition lacks its future codec occurrence");
    }
    if (!sameCanonicalDataTree(decodedFutureState, futureRecord.sourceState)) {
      fail("replay continuation future state changed after production decode");
    }
    const sourceFutureState = futureRecord.sourceState;
    const sourceFutureIds = remainingReplayEntityIds(course, sourceFutureState);
    const decodedFutureIds = mutationProbe?.decodedFutureEntityIds?.(
      remainingReplayEntityIds(course, decodedFutureState),
      sourceState,
    ) ?? remainingReplayEntityIds(course, decodedFutureState);
    if (canonical(sourceFutureIds) !== canonical(decodedFutureIds)) {
      fail("replay continuation future source/decoded entity-ID suffix differs");
    }
    decodedChainState = decodedFutureState;
  }

  // Compose the already-verified adjacent source/decoded edges backward. This
  // phase hashes one constant-size edge per state; it never replays a suffix.
  for (let index = orderedStates.length - 1; index >= 0; index -= 1) {
    const record = orderedStates[index]!;
    const sourceRemainingIds = remainingReplayEntityIds(
      course,
      record.sourceState,
    );
    if (record.sourceState.runStatus === "completed") {
      certificatesByStateHash.set(record.stateHash, fnv1a64Hex(canonical({
        sourceStateHash: record.stateHash,
        sourceSimulationTick: record.sourceState.simulationTick,
        commandKind: "completed-terminal",
        remainingEntityIds: sourceRemainingIds,
        futureStateHash: null,
        futureCertificate: null,
      })));
      continue;
    }
    const transition = orderedTransitions[index];
    if (transition === undefined) {
      fail("verified continuation edge disappeared before composition");
    }
    const futureCertificate = certificatesByStateHash.get(
      transition.futureStateHash,
    );
    if (futureCertificate === undefined) {
      fail("replay continuation did not join its captured verified future");
    }
    const futureRecord = orderedStates[index + 1];
    const futureState = futureRecord?.sourceState;
    if (
      futureState === undefined ||
      futureRecord?.stateHash !== transition.futureStateHash
    ) {
      fail("compositional continuation edge lost captured adjacency");
    }
    certificatesByStateHash.set(record.stateHash, fnv1a64Hex(canonical({
      sourceStateHash: record.stateHash,
      sourceSimulationTick: record.sourceState.simulationTick,
      command: transition.command,
      remainingEntityIds: sourceRemainingIds,
      futureStateHash: transition.futureStateHash,
      futureSimulationTick: transition.futureSimulationTick,
      futureRemainingEntityIds: remainingReplayEntityIds(course, futureState),
      futureCertificate,
    })));
  }
  for (const [pausedStateHash, resumedStateHash] of
    closure.userPauseResumeStateHashes) {
    const pausedRecord = closure.continuationStates.get(pausedStateHash);
    const resumedRecord = closure.continuationStates.get(resumedStateHash);
    const resumedCertificate = certificatesByStateHash.get(resumedStateHash);
    if (
      pausedRecord === undefined || resumedRecord === undefined ||
      resumedCertificate === undefined || !pausedRecord.directlyDecoded
    ) {
      fail("persisted user-pause branch lacks direct/resumed codec evidence");
    }
    const decodedPaused = mutationProbe?.decodedUserPauseState?.(
      pausedRecord.decodedState,
    ) ?? pausedRecord.decodedState;
    if (
      decodedPaused.runner === null || !decodedPaused.runner.userPaused ||
      resumedRecord.sourceState.runner === null ||
      resumedRecord.sourceState.runner.userPaused ||
      decodedPaused.simulationTick !== resumedRecord.sourceState.simulationTick
    ) {
      fail("persisted user-pause branch changed its exact pause/resume state");
    }
    const decodedResumed = deepFreeze({
      ...decodedPaused,
      runner: {
        ...decodedPaused.runner,
        userPaused: false,
      },
    } satisfies RunStateV1);
    if (!sameCanonicalDataTree(decodedResumed, resumedRecord.sourceState)) {
      fail("persisted user-pause resume did not rejoin the decoded main chain");
    }
    certificatesByStateHash.set(pausedStateHash, fnv1a64Hex(canonical({
      sourceStateHash: pausedStateHash,
      sourceSimulationTick: pausedRecord.sourceState.simulationTick,
      commandKind: "resume-persisted-user-pause",
      remainingEntityIds: remainingReplayEntityIds(
        course,
        pausedRecord.sourceState,
      ),
      futureStateHash: resumedStateHash,
      futureSimulationTick: resumedRecord.sourceState.simulationTick,
      futureCertificate: resumedCertificate,
    })));
  }
  return Object.freeze({
    certificatesByStateHash,
    productionStageEvaluationCounts: Object.freeze({
      ...productionStageEvaluationCounts,
    }),
  });
}

function replayClosureSummary(
  input: ReplayClosureVerificationInput,
  mutationProbe?: RunnerReplayContinuationMutationProbe,
): RunnerNeutralReplayClosureSummary {
  const { closure, durableBoundaries } = input;
  const expectedCount = closure.checkedBoundaryCount;
  const wireBijection = certifyRunStateWireBijectionV1(
    mutationProbe?.wireBijectionPairs,
  );
  if (
    closure.occurrences.length !== expectedCount ||
    closure.codecReadyCount !== expectedCount ||
    closure.directCodecDecodeCount +
        closure.inductivelyCertifiedCodecReadyCount !== expectedCount ||
    closure.canonicalEqualityCount !== expectedCount ||
    closure.stateHashEqualityCount !== expectedCount ||
    closure.directSaveInvariantCount +
        closure.inductivelyCertifiedSaveInvariantCount !== expectedCount ||
    closure.saveInvariantCount !== expectedCount ||
    closure.wireIdentityTransferCount !== expectedCount ||
    wireBijection.certificateId !== RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID ||
    wireBijection.keyCount !== 137 ||
    closure.kindCounts["user-pause"] !== 1 ||
    closure.kindCounts["user-resume"] !== 1 ||
    closure.userPauseResumeStateHashes.size !== 1
  ) {
    fail("replay closure did not certify every recorded occurrence");
  }
  for (const occurrence of closure.occurrences) {
    const continuationState = closure.continuationStates.get(occurrence.stateHash);
    if (
      continuationState === undefined ||
      continuationState.canonicalHash !== occurrence.canonicalHash
    ) {
      fail("replay closure occurrence lost its canonical continuation state");
    }
    if (
      replayClosureKindRequiresDirectReload(occurrence.kind) &&
      !continuationState.directlyDecoded
    ) {
      fail("mandatory replay boundary lacks an exact direct reload witness");
    }
  }
  const mandatoryDirectReloadCoverageCount = closure.occurrences.filter(
    (occurrence) => replayClosureKindRequiresDirectReload(occurrence.kind),
  ).length;
  const certificateResult = executedReplayContinuationCertificates(
    input,
    mutationProbe,
  );
  const { certificatesByStateHash, productionStageEvaluationCounts } =
    certificateResult;
  const duration = RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
  if (
    productionStageEvaluationCounts.laneStep !== duration ||
    productionStageEvaluationCounts.clockAdvance !== duration ||
    productionStageEvaluationCounts.collisionAdvanceAndResolve !== duration ||
    productionStageEvaluationCounts.resolvedThroughProjection !== duration ||
    productionStageEvaluationCounts.duePatternAppendCheck !== duration ||
    productionStageEvaluationCounts.inputBufferCommitCheck !== duration ||
    productionStageEvaluationCounts.settlementBeginCheck !== duration ||
    productionStageEvaluationCounts.settlementBeginMutation !== 1
  ) {
    fail("decoded production chain did not execute every ordinary-step stage");
  }
  const continuationCertificateDigest = fnv1a64Hex(canonical(
    closure.occurrences.map((occurrence) => ({
      occurrenceIndex: occurrence.occurrenceIndex,
      kind: occurrence.kind,
      stateHash: occurrence.stateHash,
      continuationCertificate: certificatesByStateHash.get(
        occurrence.stateHash,
      ) ?? fail("replay closure occurrence lacks an executed continuation"),
    })),
  ));
  return deepFreeze({
    checkedBoundaryCount: expectedCount,
    codecReadyCount: closure.codecReadyCount,
    directCodecDecodeCount: closure.directCodecDecodeCount,
    directCodecDiscriminantCount: closure.directCodecBasisKeys.size,
    mandatoryDirectReloadCoverageCount,
    inductivelyCertifiedCodecReadyCount:
      closure.inductivelyCertifiedCodecReadyCount,
    directSaveInvariantCount: closure.directSaveInvariantCount,
    inductivelyCertifiedSaveInvariantCount:
      closure.inductivelyCertifiedSaveInvariantCount,
    wireBijectionCertificateId: wireBijection.certificateId,
    wireBijectionKeyCount: wireBijection.keyCount,
    wireBijectionPairDigest: wireBijection.pairDigest,
    wireBijectionRecursiveInverseDigest:
      wireBijection.recursiveInverseDigest,
    wireIdentityTransferCount: closure.wireIdentityTransferCount,
    canonicalEqualityCount: closure.canonicalEqualityCount,
    stateHashEqualityCount: closure.stateHashEqualityCount,
    saveInvariantCount: closure.saveInvariantCount,
    continuationCertificateCount: closure.occurrences.length,
    failureCount: closure.failureCount,
    kindCounts: { ...closure.kindCounts },
    stateHashDigest: fnv1a64Hex(canonical({
      kindCounts: closure.kindCounts,
      occurrences: closure.occurrences.map((occurrence) => ({
        occurrenceIndex: occurrence.occurrenceIndex,
        kind: occurrence.kind,
        stateHash: occurrence.stateHash,
        canonicalHash: occurrence.canonicalHash,
      })),
      durableStateHashes: durableBoundaries.map((item) => item.stateHash),
    })),
    continuationCertificateDigest,
    productionStageEvaluationCounts,
  });
}

function generatedEntityProjection(
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
): RunnerEntity {
  return Object.freeze({
    instanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: entity.kind,
    patternIndex: entity.patternIndex,
    slotIndex: entity.slotIndex,
    lane: entity.lane,
    xMilli: entity.xMilli,
    widthMilli: entity.widthMilli,
    contactState: "pending" as const,
  });
}

/**
 * Inductive movement wrapper around the production overlap and canonical
 * contact resolver. It still visits every live entity on every logical tick,
 * but avoids asking the resolver to revalidate an empty candidate set.
 */
function advanceAuthenticEntities(
  context: AuthenticEvaluationContext,
  activeEntities: readonly RunnerEntity[],
  playerLanePositionMilli: number,
  simulationTick: number,
  scores: CoreScores,
  ledger: EffectLedger,
  invulnerableUntilTick: number,
  resolvedEntityIds: readonly string[],
): AuthenticEntityDelta {
  const course = assertContext(context);
  if (
    !Number.isSafeInteger(simulationTick) ||
    simulationTick <= 0 ||
    activeEntities.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities
  ) {
    fail("entity movement delta is outside the locked tick or live cap");
  }
  const candidates: ContactCandidate[] = [];
  const passedEntityIds: string[] = [];
  const retained: RunnerEntity[] = [];
  const playerLeftBoundary =
    RUNNER_PLAYER_X_MILLI -
    RUNNER_PLAYER_HALF_WIDTH_MILLI -
    RUNNER_ENTITY_WIDTH_MILLI / 2;

  for (const prior of activeEntities) {
    const entity = Object.freeze({
      ...prior,
      xMilli: prior.xMilli - course.worldSpeedMilliPerTick,
    });
    if (!Number.isSafeInteger(entity.xMilli)) {
      fail("entity movement produced an unsafe coordinate");
    }
    const overlaps = runnerEntityHorizontallyOverlapsPlayer(entity.xMilli) &&
      runnerEntityLaneOverlapsPlayer(
        entity.lane,
        playerLanePositionMilli,
      );
    if (entity.kind !== "opportunity" && overlaps) {
      candidates.push(Object.freeze({ entity }));
      continue;
    }
    if (entity.kind === "opportunity") {
      const pattern = course.patterns[entity.patternIndex - 1];
      if (
        pattern === undefined ||
        entity.instanceId !== pattern.decisionMarker.instanceId ||
        entity.contentId !== pattern.decisionMarker.contentId
      ) {
        fail("inductive decision marker lost authentic course identity");
      }
      if (
        simulationTick >= runnerPatternSafeBoundaryTick(
          pattern,
          course.worldSpeedMilliPerTick,
        )
      ) {
        passedEntityIds.push(entity.instanceId);
      } else {
        retained.push(entity);
      }
      continue;
    }
    if (entity.xMilli < playerLeftBoundary) {
      passedEntityIds.push(entity.instanceId);
    } else {
      retained.push(entity);
    }
  }

  const contacts = candidates.length === 0
    ? Object.freeze({
        scores,
        ledger,
        invulnerableUntilTick,
        newlyResolvedEntityIds: Object.freeze([]),
        resolvedEntityIds,
        events: Object.freeze([]),
      })
    : resolveCanonicalContactCandidates({
        course,
        runSeed: context.entry.runSeed,
        difficulty: context.entry.difficulty,
        candidates,
        controlMode: context.entry.controlMode,
        simulationTick,
        scores,
        ledger,
        invulnerableUntilTick,
        resolvedEntityIds,
      });
  const orderedPasses = Object.freeze([...passedEntityIds].sort());
  const allResolved = orderedPasses.length === 0
    ? contacts.resolvedEntityIds
    : sortedUnique([
        ...contacts.resolvedEntityIds,
        ...orderedPasses,
      ]);
  if (
    allResolved.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds ||
    retained.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities
  ) {
    fail("entity movement exceeded a locked retained or resolved cap");
  }
  return Object.freeze({
    scores: contacts.scores,
    ledger: contacts.ledger,
    invulnerableUntilTick: contacts.invulnerableUntilTick,
    newlyResolvedEntityIds: contacts.newlyResolvedEntityIds,
    resolvedEntityIds: allResolved,
    activeEntities: Object.freeze(retained),
    passedEntityIds: orderedPasses,
    events: contacts.events,
  });
}

function projectionFirstLaneState(
  state: InductiveReplayState,
  targetLane: Lane,
): {
  readonly laneState: LaneControllerState;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly laneMoves: 0 | 1 | 2;
} {
  const compilation = compileNeutralLaneTarget(
    state.motion.kind === "idle"
      ? state.motion.currentLane
      : state.motion.targetLane,
    targetLane,
  );
  const first = stepLaneController(
    { motion: state.motion, inputBuffer: state.inputBuffer },
    compilation.firstIntent,
  );
  if (compilation.bufferedIntent === null) {
    return Object.freeze({
      laneState: first,
      firstIntent: compilation.firstIntent,
      bufferedIntent: null,
      laneMoves: compilation.laneMoves,
    });
  }
  if (
    first.motion.kind !== "moving" ||
    first.motion.elapsedTicks !== 1 ||
    first.inputBuffer !== null ||
    adjacentLane(
      first.motion.targetLane,
      compilation.bufferedIntent,
    ) === null
  ) {
    fail("two-lane neutral projection did not compile to a legal tween");
  }
  const buffered = Object.freeze({
    motion: first.motion,
    inputBuffer: compilation.bufferedIntent,
  });
  assertLaneControllerState(buffered);
  return Object.freeze({
    laneState: buffered,
    firstIntent: compilation.firstIntent,
    bufferedIntent: compilation.bufferedIntent,
    laneMoves: compilation.laneMoves,
  });
}

function projectNeutralLane(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
  pattern: RunnerLabGeneratedPattern,
  targetLane: Lane,
): NeutralProjection {
  assertInductiveState(context, state);
  const course = assertContext(context);
  if (
    state.motion.kind !== "idle" ||
    state.inputBuffer !== null ||
    state.simulationTick !== pattern.spawnTick ||
    state.spawn.patternIndex !== pattern.patternIndex
  ) {
    fail("neutral policy requires an idle authentic pattern boundary");
  }
  const first = projectionFirstLaneState(state, targetLane);
  const safeBoundaryTick = runnerPatternSafeBoundaryTick(
    pattern,
    course.worldSpeedMilliPerTick,
  );
  let laneState = first.laneState;
  let scores = state.scores;
  let ledger = state.ledger;
  let invulnerableUntilTick = state.invulnerableUntilTick;
  let activeEntities = state.activeEntities;
  let resolvedEntityIds = state.spawn.resolvedEntityIds;

  for (
    let tick = state.simulationTick + 1;
    tick <= safeBoundaryTick;
    tick += 1
  ) {
    if (tick > state.simulationTick + 1) {
      laneState = stepLaneController(laneState, null);
    }
    const collision = advanceAuthenticEntities(
      context,
      activeEntities,
      lanePositionMilli(laneState),
      tick,
      scores,
      ledger,
      invulnerableUntilTick,
      resolvedEntityIds,
    );
    scores = collision.scores;
    ledger = collision.ledger;
    invulnerableUntilTick = collision.invulnerableUntilTick;
    activeEntities = collision.activeEntities;
    resolvedEntityIds = collision.resolvedEntityIds;
  }

  if (
    activeEntities.length !== 0 ||
    laneState.motion.kind !== "idle" ||
    laneState.motion.currentLane !== targetLane ||
    laneState.inputBuffer !== null ||
    pattern.spawnEntities.some((entity) =>
      !resolvedEntityIds.includes(entity.instanceId))
  ) {
    fail("neutral projection did not close at its exact safe boundary");
  }
  return Object.freeze({
    targetLane,
    firstIntent: first.firstIntent,
    bufferedIntent: first.bufferedIntent,
    laneMoves: first.laneMoves,
    safeBoundaryTick,
    utilityNumerator: SCORE_IDS.reduce(
      (total, scoreId) =>
        total + scores[scoreId] - state.scores[scoreId],
      0,
    ),
  });
}

function priorityIndex(lane: Lane): number {
  return RUNNER_NEUTRAL_LANE_PRIORITY.indexOf(lane);
}

function compareNeutralProjection(
  left: NeutralProjection,
  right: NeutralProjection,
): number {
  const leftNonnegative = left.utilityNumerator >= 0;
  const rightNonnegative = right.utilityNumerator >= 0;
  if (leftNonnegative !== rightNonnegative) return leftNonnegative ? -1 : 1;
  return (
    Math.abs(left.utilityNumerator) - Math.abs(right.utilityNumerator) ||
    left.laneMoves - right.laneMoves ||
    priorityIndex(left.targetLane) - priorityIndex(right.targetLane)
  );
}

function evaluateNeutralTarget(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
  pattern: RunnerLabGeneratedPattern,
): NeutralProjection {
  const sourceLane = state.motion.kind === "idle"
    ? state.motion.currentLane
    : fail("neutral target source must be idle");
  const projections = RUNNER_LANES.map((targetLane) =>
    projectNeutralLane(context, state, pattern, targetLane));
  const stay = projections.find((projection) =>
    projection.targetLane === sourceLane);
  if (stay === undefined) fail("neutral stay-lane projection is missing");
  return stay.utilityNumerator >= 0
    ? stay
    : [...projections].sort(compareNeutralProjection)[0]!;
}

function allocateEvent(recorder: ReplayRecorder): number {
  const ordinal = recorder.nextProductionEventOrdinal;
  recorder.nextProductionEventOrdinal += 1;
  return ordinal;
}

function updateMaximumLiveEntities(
  recorder: ReplayRecorder,
  state: InductiveReplayState,
): void {
  if (state.activeEntities.length <= recorder.maximumLiveEntities.count) return;
  recorder.maximumLiveEntities = Object.freeze({
    count: state.activeEntities.length,
    firstWitnessTick: state.simulationTick,
    entityInstanceIds: Object.freeze(
      state.activeEntities.map((entity) => entity.instanceId),
    ),
  });
}

function recordCollisionEvents(
  recorder: ReplayRecorder,
  simulationTick: number,
  beforeUntilTick: number,
  collision: AuthenticEntityDelta,
): void {
  let witnessedUntilTick = beforeUntilTick;
  for (const contact of collision.events) {
    const productionEventOrdinal = allocateEvent(recorder);
    recorder.contacts.push(Object.freeze({
      productionEventOrdinal,
      contact,
    }));
    if (contact.effect !== null) {
      recorder.effects.push(Object.freeze({
        productionEventOrdinal,
        effect: contact.effect,
      }));
    }
    if (
      contact.outcome === "hazard-applied" ||
      contact.outcome === "hazard-suppressed"
    ) {
      const afterUntilTick = contact.outcome === "hazard-applied"
        ? simulationTick + RUNNER_INVULNERABILITY_TICKS
        : witnessedUntilTick;
      recorder.invulnerabilityWitnesses.push(Object.freeze({
        productionEventOrdinal,
        simulationTick,
        entityInstanceId: contact.entityInstanceId,
        outcome: contact.outcome,
        beforeUntilTick: witnessedUntilTick,
        afterUntilTick,
      }));
      witnessedUntilTick = afterUntilTick;
    }
  }
  if (witnessedUntilTick !== collision.invulnerableUntilTick) {
    fail("invulnerability delta does not match ordered production contacts");
  }
  for (const entityInstanceId of collision.passedEntityIds) {
    recorder.passes.push(Object.freeze({
      productionEventOrdinal: allocateEvent(recorder),
      simulationTick,
      entityInstanceId,
    }));
  }
}

function advanceOneTick(
  context: AuthenticEvaluationContext,
  state: InductiveReplayState,
  laneIntent: LaneIntent,
  recorder: ReplayRecorder,
  bufferAfterStep: LaneDirection | null = null,
): {
  readonly state: InductiveReplayState;
  readonly appendedPattern: RunnerLabGeneratedPattern | null;
} {
  assertInductiveState(context, state);
  const course = assertContext(context);
  let lane = stepLaneController(
    { motion: state.motion, inputBuffer: state.inputBuffer },
    laneIntent,
  );
  if (bufferAfterStep !== null) {
    if (
      lane.motion.kind !== "moving" ||
      lane.motion.elapsedTicks !== 1 ||
      lane.inputBuffer !== null ||
      adjacentLane(lane.motion.targetLane, bufferAfterStep) === null
    ) {
      fail("Assist atomic buffer cannot follow the production first step");
    }
    lane = Object.freeze({
      motion: lane.motion,
      inputBuffer: bufferAfterStep,
    });
    assertLaneControllerState(lane);
  }
  const nextTick = state.simulationTick + 1;
  const nextDistance = state.worldDistanceMilli +
    course.worldSpeedMilliPerTick;
  // Every production ordinary step emits lane then clock before contact work.
  allocateEvent(recorder);
  allocateEvent(recorder);

  let scores = state.scores;
  let ledger = state.ledger;
  let invulnerableUntilTick = state.invulnerableUntilTick;
  let activeEntities = state.activeEntities;
  let resolvedEntityIds = state.spawn.resolvedEntityIds;
  let resolvedThrough = state.spawn.resolvedThroughPatternIndex;
  if (activeEntities.length > 0) {
    const collision = advanceAuthenticEntities(
      context,
      activeEntities,
      lanePositionMilli(lane),
      nextTick,
      scores,
      ledger,
      invulnerableUntilTick,
      resolvedEntityIds,
    );
    recordCollisionEvents(
      recorder,
      nextTick,
      invulnerableUntilTick,
      collision,
    );
    scores = collision.scores;
    ledger = collision.ledger;
    invulnerableUntilTick = collision.invulnerableUntilTick;
    activeEntities = collision.activeEntities;
    resolvedEntityIds = collision.resolvedEntityIds;
  }
  const nextThrough = resolvedThroughPatternIndex(
    course,
    state.spawn.patternIndex,
    resolvedEntityIds,
  );
  if (nextThrough !== resolvedThrough) {
    resolvedThrough = nextThrough;
    allocateEvent(recorder);
  }

  let spawn: SpawnState = Object.freeze({
    ...state.spawn,
    resolvedThroughPatternIndex: resolvedThrough,
    resolvedEntityIds,
  });
  let appendedPattern: RunnerLabGeneratedPattern | null = null;
  const tickDue = nextTick === state.spawn.nextSpawnTick;
  const distanceDue = nextDistance === state.spawn.nextSpawnDistanceMilli;
  if (tickDue !== distanceDue) {
    fail("tick and distance spawn triggers diverged");
  }
  if (tickDue) {
    appendedPattern = course.patterns[state.spawn.patternIndex] ?? null;
    if (
      appendedPattern === null ||
      appendedPattern.patternIndex !== state.spawn.patternIndex + 1 ||
      appendedPattern.spawnTick !== nextTick ||
      appendedPattern.spawnDistanceMilli !== nextDistance
    ) {
      fail("due pattern does not match the authentic course cursor");
    }
    activeEntities = Object.freeze([
      ...activeEntities,
      ...appendedPattern.spawnEntities.map(generatedEntityProjection),
    ].sort(compareRunnerEntityCoordinates));
    spawn = Object.freeze({
      ...spawn,
      ...appendedPattern.outgoingCursor,
    });
    // Production emits reachability-certified then pattern-appended.
    allocateEvent(recorder);
    allocateEvent(recorder);
  }
  if (bufferAfterStep !== null) {
    // Production emits lane-buffer-queued after the ordinary step/append seam.
    allocateEvent(recorder);
  }

  const candidate = brandNextState(context, state, {
    simulationTick: nextTick,
    worldDistanceMilli: nextDistance,
    scores,
    ledger,
    motion: lane.motion,
    inputBuffer: lane.inputBuffer,
    spawn,
    activeEntities,
    invulnerableUntilTick,
  });
  updateMaximumLiveEntities(recorder, candidate);
  return Object.freeze({ state: candidate, appendedPattern });
}

function profileInvariant(
  entry: RunStateV1,
  effects: readonly AppliedEffect[],
  terminalScores: CoreScores,
): RunnerNeutralReplayProfileInvariant {
  let replayed: CoreScores = Object.freeze({ ...entry.scores });
  const requested: Record<ScoreId, number> = {
    health: 0,
    happiness: 0,
    money: 0,
  };
  const actual: Record<ScoreId, number> = {
    health: 0,
    happiness: 0,
    money: 0,
  };
  for (const effect of effects) {
    if (
      effect.before !== replayed[effect.scoreId] ||
      effect.after - effect.before !== effect.actualDelta
    ) {
      fail("production effect sequence cannot reconstruct its score chain");
    }
    requested[effect.scoreId] += effect.requestedDelta;
    actual[effect.scoreId] += effect.actualDelta;
    replayed = Object.freeze({
      ...replayed,
      [effect.scoreId]: effect.after,
    });
  }
  if (!sameScores(replayed, terminalScores)) {
    fail("production effects do not reconstruct terminal scores");
  }
  return deepFreeze({
    startingProfileId: entry.startingProfileId,
    startingScores: { ...entry.scores },
    requestedDeltaTotals: { ...requested },
    actualDeltaTotals: { ...actual },
    effectReplayedTerminalScores: { ...replayed },
    terminalScores: { ...terminalScores },
    productionEffectCount: effects.length,
  });
}

function courseProjection(
  course: RunnerLabGeneratedCourse,
): RunnerNeutralReplayCourseProjection {
  return deepFreeze({
    worldSpeedMilliPerTick: course.worldSpeedMilliPerTick,
    includedOptionalGroupKeys: [...course.includedOptionalGroupKeys],
    patterns: course.patterns.map((pattern) => ({
      patternIndex: pattern.patternIndex,
      patternId: pattern.patternId,
      rotation: pattern.rotation,
      spawnTick: pattern.spawnTick,
      includedOptionalGroupIds: [...pattern.includedOptionalGroupIds],
      entityInstanceIds: pattern.spawnEntities.map((entity) =>
        entity.instanceId),
    })),
  });
}

interface MutableModeCandidateState {
  simulationTick: number;
  scores: CoreScores;
  ledger: EffectLedger;
  motion: RunnerMotion;
  inputBuffer: LaneDirection | null;
  invulnerableUntilTick: number;
  resolvedEntityIds: readonly string[];
  nextProductionEventOrdinal: number;
  readonly contacts: RunnerNeutralReplayContact[];
  readonly effects: RunnerNeutralReplayEffect[];
  readonly passes: RunnerNeutralReplayPass[];
}

function simulationContextForTape(
  tape: RunnerNeutralReplayTape,
): RunnerSimulationContext {
  const cached = PRODUCTION_SIMULATION_CONTEXTS.get(tape);
  if (cached !== undefined) return cached;
  const context = createRunnerSimulationContext(tape.runSeed, tape.difficulty);
  if (canonical(courseProjection(context.course)) !== canonical(tape.course)) {
    fail("mode evaluation course differs from the authenticated replay course");
  }
  PRODUCTION_SIMULATION_CONTEXTS.set(tape, context);
  return context;
}

function replayContinuationCommandSignature(
  command: ReplayContinuationCommand,
): string {
  if (command.kind !== "advance") return command.kind;
  return [
    command.kind,
    command.laneIntent ?? "null",
    command.bufferAfterStep ?? "null",
    command.assistPatternIndex ?? "null",
    command.assistTargetLane ?? "null",
  ].join(":");
}

function structuralOrdinaryStepProof(
  tape: RunnerNeutralReplayTape,
): StructuralOrdinaryStepProof {
  const cached = STRUCTURAL_ORDINARY_STEP_PROOFS.get(tape);
  if (cached !== undefined) return cached;
  const input = REPLAY_CLOSURE_VERIFICATION_INPUTS.get(tape);
  if (input === undefined || tape.controlMode !== "manual") {
    fail("ordinary-step lift lacks its authentic Manual structural chain");
  }
  const { closure, context } = input;
  let stateHash = closure.stateHashes.get(context.entry) ??
    stateHashV1(context.entry);
  const visited = new Set<string>();
  const advanceEdgeSignatures: string[] = [];
  const nonEventTickNumbers: number[] = [];
  let expectedTick = 1;
  while (true) {
    if (visited.has(stateHash)) {
      fail("ordinary-step structural chain contains a cycle");
    }
    visited.add(stateHash);
    const record = closure.continuationStates.get(stateHash);
    if (record === undefined) {
      fail("ordinary-step structural chain lost a codec state");
    }
    if (record.sourceState.runStatus === "completed") break;
    const transition = closure.executedTransitions.get(stateHash);
    if (transition === undefined) {
      fail("ordinary-step structural chain lost an executed transition");
    }
    if (transition.command.kind === "advance") {
      if (
        transition.futureSimulationTick !== expectedTick ||
        transition.sourceSimulationTick !== expectedTick - 1
      ) {
        fail("ordinary-step structural chain skipped or duplicated a tick");
      }
      const future = closure.continuationStates.get(
        transition.futureStateHash,
      )?.sourceState;
      if (future === undefined) {
        fail("ordinary-step structural edge lacks its actual future state");
      }
      const source = record.sourceState;
      const sourceRunner = source.runner;
      const futureRunner = future.runner;
      if (
        sourceRunner !== null && futureRunner !== null &&
        transition.command.laneIntent === null &&
        transition.command.bufferAfterStep === null &&
        transition.command.assistPatternIndex === null &&
        sourceRunner.spawn.patternIndex === futureRunner.spawn.patternIndex &&
        sourceRunner.spawn.resolvedEntityIds.length ===
          futureRunner.spawn.resolvedEntityIds.length &&
        source.effectLedger.recent.length === future.effectLedger.recent.length &&
        sameScores(source.scores, future.scores)
      ) {
        nonEventTickNumbers.push(expectedTick);
      }
      advanceEdgeSignatures.push([
        expectedTick,
        transition.sourceStateHash,
        transition.futureStateHash,
        replayContinuationCommandSignature(transition.command),
      ].join("|"));
      expectedTick += 1;
    }
    stateHash = transition.futureStateHash;
  }
  if (
    expectedTick !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks + 1 ||
    advanceEdgeSignatures.length !==
      RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks ||
    nonEventTickNumbers.length === 0
  ) {
    fail("ordinary-step structural proof did not cover all 3,000 ticks");
  }
  const proof = deepFreeze({
    ordinaryTickCount: 3_000 as const,
    nonEventTickNumbers,
    structuralTickDigest: fnv1a64Hex(advanceEdgeSignatures.join("\n")),
  } satisfies StructuralOrdinaryStepProof);
  STRUCTURAL_ORDINARY_STEP_PROOFS.set(tape, proof);
  return proof;
}

function exactProfileCodecBoundaryProof(
  states: readonly RunStateV1[],
  context: RunnerSimulationContext,
): Readonly<{ count: number; digest: string }> {
  const encodedHashes: string[] = [];
  for (const state of states) {
    const encoded = encodeRunState(state);
    const decoded = decodeRunState(encoded, RUNNER_LABORATORY_CATALOG, {
      runnerLaboratoryCourse: context.course,
    });
    if (
      decoded.kind !== "ready" || decoded.migratedFrom !== null ||
      encodeRunState(decoded.state) !== encoded
    ) {
      fail("exact-profile codec boundary changed across production reload");
    }
    encodedHashes.push(fnv1a64Hex(encoded));
  }
  return Object.freeze({
    count: states.length,
    digest: fnv1a64Hex(encodedHashes.join("|")),
  });
}

function exactProfileOrdinaryStepLift(
  entryState: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  context: RunnerSimulationContext,
  startedState: RunStateV1,
  markerCheckpoints: readonly RunStateV1[],
  markerTransitions: readonly RunnerAuthenticatedMarkerTransition[],
  effects: readonly RunnerNeutralReplayEffect[],
  pendingState: RunStateV1,
  completedState: RunStateV1,
  mutationProbe: RunnerModeCandidateMutationProbe | undefined,
): RunnerExactProfileOrdinaryStepLift {
  const structural = structuralOrdinaryStepProof(structuralTape);
  const productionStages =
    structuralTape.replayClosure.productionStageEvaluationCounts;
  const ordinaryStageNames = Object.freeze([
    "laneStep",
    "clockAdvance",
    "collisionAdvanceAndResolve",
    "resolvedThroughProjection",
    "duePatternAppendCheck",
    "inputBufferCommitCheck",
    "settlementBeginCheck",
  ] as const satisfies readonly RunnerOrdinaryStepStageName[]);
  if (
    ordinaryStageNames.some((stage) =>
      productionStages[stage] !== structural.ordinaryTickCount) ||
    productionStages.settlementBeginMutation !== 1
  ) {
    fail("ordinary-step lift lacks actual decoded production stage coverage");
  }
  if (mutationProbe?.ordinaryTick !== undefined) {
    const nonEventTicks = new Set(structural.nonEventTickNumbers);
    for (
      let index = 0;
      index < RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
      index += 1
    ) {
      const expectedTick = index + 1;
      if (
        mutationProbe.ordinaryTick(
          expectedTick,
          index,
          nonEventTicks.has(expectedTick),
        ) !== expectedTick
      ) {
        fail("ordinary-step lift skipped or corrupted a non-event tick");
      }
    }
  }
  if (mutationProbe?.ordinaryStageExecuted !== undefined) {
    const nonEventTicks = new Set(structural.nonEventTickNumbers);
    for (
      let index = 0;
      index < RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
      index += 1
    ) {
      const simulationTick = index + 1;
      for (const stage of ordinaryStageNames) {
        if (!mutationProbe.ordinaryStageExecuted(
          stage,
          simulationTick,
          nonEventTicks.has(simulationTick),
        )) {
          fail("ordinary-step lift skipped a production stage on an ordinary tick");
        }
      }
    }
  }
  const assertedStartingScores = mutationProbe?.exactProfileStartingScores?.(
    entryState.scores,
    entryState.startingProfileId,
  ) ?? entryState.scores;
  if (!sameScores(assertedStartingScores, entryState.scores)) {
    fail("ordinary-step lift changed its exact starting-profile scores");
  }
  let replayedScores = Object.freeze({ ...assertedStartingScores });
  for (const { effect } of effects) {
    if (
      effect.actualDelta !== effect.requestedDelta ||
      replayedScores[effect.scoreId] !== effect.before
    ) {
      fail("ordinary-step lift encountered saturation or a broken score chain");
    }
    replayedScores = Object.freeze({
      ...replayedScores,
      [effect.scoreId]: effect.after,
    });
  }
  if (!sameScores(replayedScores, pendingState.scores)) {
    fail("ordinary-step lift did not reconstruct the exact pre-settlement scores");
  }
  const codec = exactProfileCodecBoundaryProof([
    entryState,
    startedState,
    ...markerCheckpoints,
    pendingState,
    completedState,
  ], context);
  const exactProfileDirectProductionTickCount =
    1 + markerTransitions.reduce((count, transition) =>
      count + 1 + (entryState.controlMode === "manual" &&
          transition.bufferedIntent !== null
        ? 1
        : 0), 0);
  if (
    exactProfileDirectProductionTickCount <= 0 ||
    exactProfileDirectProductionTickCount > structural.ordinaryTickCount
  ) {
    fail("ordinary-step lift has an impossible direct production tick count");
  }
  const exactProfileTheoremLiftedTickCount =
    structural.ordinaryTickCount - exactProfileDirectProductionTickCount;
  const canonicalEntryHash = fnv1a64Hex(canonical(entryState));
  const profileLiftDigest = fnv1a64Hex(canonical({
    canonicalEntryHash,
    startingProfileId: entryState.startingProfileId,
    startingScores: assertedStartingScores,
    structuralTickDigest: structural.structuralTickDigest,
    exactProfileDirectProductionTickCount,
    exactProfileTheoremLiftedTickCount,
    exactProfileCodecBoundaryDigest: codec.digest,
    effects: effects.map(({ effect }) => ({
      effectId: effect.effectId,
      simulationTick: effect.simulationTick,
      scoreId: effect.scoreId,
      requestedDelta: effect.requestedDelta,
      actualDelta: effect.actualDelta,
      before: effect.before,
      after: effect.after,
    })),
    terminalScores: completedState.scores,
  }));
  return deepFreeze({
    liftId: RUNNER_EXACT_PROFILE_ORDINARY_STEP_LIFT_ID,
    canonicalEntryHash,
    startingProfileId: entryState.startingProfileId,
    startingScores: { ...entryState.scores },
    productionKernelScope:
      "one-authentic-structural-tape-per-seed-difficulty" as const,
    referencedSourceProductionTickCount: 3_000 as const,
    referencedDecodedProductionTickCount: 3_000 as const,
    exactProfileDirectProductionTickCount,
    exactProfileTheoremLiftedTickCount,
    ordinaryTickCount: 3_000 as const,
    nonEventOrdinaryTickCount: structural.nonEventTickNumbers.length,
    stageEvaluationCounts: {
      laneStep: productionStages.laneStep as 3_000,
      clockAdvance: productionStages.clockAdvance as 3_000,
      collisionAdvanceAndResolve:
        productionStages.collisionAdvanceAndResolve as 3_000,
      resolvedThroughProjection:
        productionStages.resolvedThroughProjection as 3_000,
      duePatternAppendCheck: productionStages.duePatternAppendCheck as 3_000,
      inputBufferCommitCheck:
        productionStages.inputBufferCommitCheck as 3_000,
      settlementBeginCheck: productionStages.settlementBeginCheck as 3_000,
      settlementBeginMutation: productionStages.settlementBeginMutation as 1,
    },
    exactProfileCodecBoundaryCount: codec.count,
    exactProfileUnclampedEffectCount: effects.length,
    commandGeometryIndependent: true as const,
    structuralTickDigest: structural.structuralTickDigest,
    exactProfileCodecBoundaryDigest: codec.digest,
    profileLiftDigest,
  } satisfies RunnerExactProfileOrdinaryStepLift);
}

function candidateEntityAtTick(
  pattern: RunnerLabGeneratedPattern,
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
  simulationTick: number,
  worldSpeedMilliPerTick: number,
): RunnerEntity {
  return Object.freeze({
    instanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: entity.kind,
    patternIndex: entity.patternIndex,
    slotIndex: entity.slotIndex,
    lane: entity.lane,
    xMilli: entity.xMilli - worldSpeedMilliPerTick *
      (simulationTick - pattern.spawnTick),
    widthMilli: entity.widthMilli,
    contactState: "pending" as const,
  });
}

function cloneLaneState(state: LaneControllerState): LaneControllerState {
  return Object.freeze({
    motion: Object.freeze({ ...state.motion }),
    inputBuffer: state.inputBuffer,
  });
}

function geometryPlanForTape(
  tape: RunnerNeutralReplayTape,
  context: RunnerSimulationContext,
): RunnerModeGeometryPlan {
  const cached = MODE_GEOMETRY_PLANS.get(tape);
  if (cached !== undefined) return cached;
  let lane: LaneControllerState = Object.freeze({
    motion: Object.freeze({
      kind: "idle" as const,
      currentLane: 1 as const,
      sourceLane: 1 as const,
      targetLane: 1 as const,
      elapsedTicks: 0 as const,
      totalTicks: RUNNER_LANE_TWEEN_TICKS,
    }),
    inputBuffer: null,
  });
  const windows: RunnerModeGeometryWindow[] = [];
  const contactOccurrence: Array<Readonly<{
    entityInstanceId: string;
    simulationTick: number;
  }>> = [];
  const scoringPassOccurrence: Array<Readonly<{
    entityInstanceId: string;
    simulationTick: number;
  }>> = [];
  const playerLeftBoundary = RUNNER_PLAYER_X_MILLI -
    RUNNER_PLAYER_HALF_WIDTH_MILLI - RUNNER_ENTITY_WIDTH_MILLI / 2;

  for (const [patternOffset, pattern] of context.course.patterns.entries()) {
    const target = tape.targets[patternOffset];
    if (
      target === undefined || target.patternIndex !== pattern.patternIndex ||
      target.simulationTick !== pattern.spawnTick ||
      lane.motion.kind !== "idle" || lane.inputBuffer !== null ||
      lane.motion.currentLane !== target.sourceLane
    ) {
      fail("geometry plan target chain is malformed");
    }
    const manualFirst = stepLaneController(lane, target.firstIntent);
    const assistFirst = target.bufferedIntent === null
      ? manualFirst
      : Object.freeze({
          motion: manualFirst.motion,
          inputBuffer: target.bufferedIntent,
        });
    const manualCommitted = target.bufferedIntent === null
      ? manualFirst
      : stepLaneController(manualFirst, target.bufferedIntent);
    const manualCommittedTick = pattern.spawnTick +
      (target.bufferedIntent === null ? 1 : 2);
    const assistCommittedTick = pattern.spawnTick + 1;
    lane = assistFirst;
    const resolved = new Set<string>();
    const events: RunnerModeGeometryEvent[] = [];
    const safeBoundaryTick = runnerPatternSafeBoundaryTick(
      pattern,
      context.course.worldSpeedMilliPerTick,
    );
    for (
      let simulationTick = pattern.spawnTick + 1;
      simulationTick <= safeBoundaryTick;
      simulationTick += 1
    ) {
      if (simulationTick > pattern.spawnTick + 1) {
        lane = stepLaneController(lane, null);
      }
      const pending = pattern.entities
        .filter((entity) => !resolved.has(entity.instanceId))
        .map((entity) => candidateEntityAtTick(
          pattern,
          entity,
          simulationTick,
          context.course.worldSpeedMilliPerTick,
        ));
      const contactCandidates = pending
        .filter((entity) =>
          runnerEntityHorizontallyOverlapsPlayer(entity.xMilli) &&
          runnerEntityLaneOverlapsPlayer(entity.lane, lanePositionMilli(lane)))
        .map((entity) => Object.freeze({ entity } satisfies ContactCandidate))
        .sort((left, right) =>
          compareRunnerEntityCoordinates(left.entity, right.entity));
      for (const { entity } of contactCandidates) {
        resolved.add(entity.instanceId);
        contactOccurrence.push(Object.freeze({
          entityInstanceId: entity.instanceId,
          simulationTick,
        }));
      }
      const scoringPassEntityIds = pending
        .filter((entity) =>
          !resolved.has(entity.instanceId) &&
          entity.xMilli < playerLeftBoundary)
        .map((entity) => entity.instanceId)
        .sort();
      for (const entityInstanceId of scoringPassEntityIds) {
        resolved.add(entityInstanceId);
        scoringPassOccurrence.push(Object.freeze({
          entityInstanceId,
          simulationTick,
        }));
      }
      if (
        contactCandidates.length > 0 || scoringPassEntityIds.length > 0 ||
        simulationTick === safeBoundaryTick
      ) {
        events.push(deepFreeze({
          simulationTick,
          laneState: cloneLaneState(lane),
          contactCandidates,
          scoringPassEntityIds,
        }));
      }
    }
    if (
      resolved.size !== pattern.entities.length ||
      lane.motion.kind !== "idle" || lane.inputBuffer !== null ||
      lane.motion.currentLane !== target.targetLane
    ) {
      fail("geometry plan did not close a generated scoring window");
    }
    windows.push(deepFreeze({
      patternIndex: pattern.patternIndex,
      manualCommittedTick,
      manualCommittedLaneState: cloneLaneState(manualCommitted),
      assistCommittedTick,
      assistCommittedLaneState: cloneLaneState(assistFirst),
      events,
      safeBoundaryTick,
      terminalLaneState: cloneLaneState(lane),
    }));
  }
  const plan = deepFreeze({
    windows,
    contactOccurrenceDigest: fnv1a64Hex(canonical(contactOccurrence)),
    scoringPassOccurrenceDigest: fnv1a64Hex(canonical(scoringPassOccurrence)),
  } satisfies RunnerModeGeometryPlan);
  const expectedContacts = tape.contacts.map(({ contact }) => ({
    entityInstanceId: contact.entityInstanceId,
    simulationTick: contact.simulationTick,
  }));
  const decisionIds = new Set(context.course.patterns.map((pattern) =>
    pattern.decisionMarker.instanceId));
  const expectedScoringPasses = tape.passes
    .filter(({ entityInstanceId }) => !decisionIds.has(entityInstanceId))
    .map(({ entityInstanceId, simulationTick }) => ({
      entityInstanceId,
      simulationTick,
    }));
  if (
    plan.contactOccurrenceDigest !==
      fnv1a64Hex(canonical(expectedContacts)) ||
    plan.scoringPassOccurrenceDigest !==
      fnv1a64Hex(canonical(expectedScoringPasses))
  ) {
    fail("geometry plan occurrence differs from the authenticated expectations");
  }
  MODE_GEOMETRY_PLANS.set(tape, plan);
  return plan;
}

function appendedPatternCountAtTick(
  course: RunnerLabGeneratedCourse,
  simulationTick: number,
): number {
  let count = 0;
  for (const pattern of course.patterns) {
    if (pattern.spawnTick > simulationTick) break;
    count += 1;
  }
  return count;
}

function candidateActiveEntities(
  course: RunnerLabGeneratedCourse,
  simulationTick: number,
  resolvedEntityIds: readonly string[],
): readonly RunnerEntity[] {
  const resolved = new Set(resolvedEntityIds);
  const appended = appendedPatternCountAtTick(course, simulationTick);
  return Object.freeze(course.patterns.slice(0, appended)
    .flatMap((pattern) => pattern.spawnEntities.map((entity) =>
      Object.freeze({ pattern, entity })))
    .filter(({ entity }) => !resolved.has(entity.instanceId))
    .map(({ pattern, entity }) => candidateEntityAtTick(
      pattern,
      entity,
      simulationTick,
      course.worldSpeedMilliPerTick,
    ))
    .sort(compareRunnerEntityCoordinates));
}

function materializeModeCandidateState(
  entryState: RunStateV1,
  context: RunnerSimulationContext,
  candidate: MutableModeCandidateState,
): RunStateV1 {
  const entryRunner = entryState.runner;
  if (entryRunner === null) fail("mode candidate entry lost runner state");
  const patternIndex = appendedPatternCountAtTick(
    context.course,
    candidate.simulationTick,
  );
  const cursor = patternIndex === 0
    ? context.course.initialCursor
    : context.course.patterns[patternIndex - 1]!.outgoingCursor;
  return deepFreeze({
    ...entryState,
    runStatus: "active" as const,
    scores: candidate.scores,
    effectLedger: candidate.ledger,
    simulationTick: candidate.simulationTick,
    stage: {
      ...entryState.stage,
      phase: "active" as const,
      activeTicks: candidate.simulationTick,
      worldDistanceMilli:
        candidate.simulationTick * context.course.worldSpeedMilliPerTick,
      settlement: null,
    },
    runner: {
      ...entryRunner,
      motion: candidate.motion,
      inputBuffer: candidate.inputBuffer,
      spawn: {
        ...cursor,
        resolvedThroughPatternIndex: resolvedThroughPatternIndex(
          context.course,
          patternIndex,
          candidate.resolvedEntityIds,
        ),
        resolvedEntityIds: candidate.resolvedEntityIds,
      },
      activeEntities: candidateActiveEntities(
        context.course,
        candidate.simulationTick,
        candidate.resolvedEntityIds,
      ),
      invulnerableUntilTick: candidate.invulnerableUntilTick,
      userPaused: false,
    },
  } satisfies RunStateV1);
}

function adoptCandidateResult(
  candidate: MutableModeCandidateState,
  result: RunnerSimulationResult,
): void {
  if (
    !result.stateChanged || result.tickDelta !== 1 ||
    result.state.runner === null ||
    result.previousTick !== candidate.simulationTick ||
    result.currentTick !== candidate.simulationTick + 1
  ) {
    fail("mode candidate reducer did not advance exactly one production tick");
  }
  for (const event of result.events) {
    const productionEventOrdinal = candidate.nextProductionEventOrdinal;
    candidate.nextProductionEventOrdinal += 1;
    if (event.type === "contact-resolved") {
      candidate.contacts.push(Object.freeze({
        productionEventOrdinal,
        contact: event.contact,
      }));
      if (event.contact.effect !== null) {
        candidate.effects.push(Object.freeze({
          productionEventOrdinal,
          effect: event.contact.effect,
        }));
      }
    } else if (event.type === "entity-passed") {
      candidate.passes.push(Object.freeze({
        productionEventOrdinal,
        simulationTick: event.simulationTick,
        entityInstanceId: event.entityInstanceId,
      }));
    }
  }
  candidate.simulationTick = result.state.simulationTick;
  candidate.scores = result.state.scores;
  candidate.ledger = result.state.effectLedger;
  candidate.motion = result.state.runner.motion;
  candidate.inputBuffer = result.state.runner.inputBuffer;
  candidate.invulnerableUntilTick =
    result.state.runner.invulnerableUntilTick;
  candidate.resolvedEntityIds =
    result.state.runner.spawn.resolvedEntityIds;
}

function progressCandidateThroughGeometryWindow(
  entryState: RunStateV1,
  context: RunnerSimulationContext,
  pattern: RunnerLabGeneratedPattern,
  window: RunnerModeGeometryWindow,
  candidate: MutableModeCandidateState,
  mutationProbe: RunnerModeCandidateMutationProbe | undefined,
): void {
  const committedTick = entryState.controlMode === "manual"
    ? window.manualCommittedTick
    : window.assistCommittedTick;
  const committedLaneState = entryState.controlMode === "manual"
    ? window.manualCommittedLaneState
    : window.assistCommittedLaneState;
  if (
    window.patternIndex !== pattern.patternIndex ||
    candidate.simulationTick !== committedTick ||
    canonical({
      motion: candidate.motion,
      inputBuffer: candidate.inputBuffer,
    }) !== canonical(committedLaneState)
  ) {
    fail("mode candidate marker state differs from its generated geometry window");
  }

  for (const event of window.events) {
    if (event.simulationTick <= candidate.simulationTick) continue;
    const priorThrough = resolvedThroughPatternIndex(
      context.course,
      pattern.patternIndex,
      candidate.resolvedEntityIds,
    );
    const elapsed = event.simulationTick - candidate.simulationTick;
    candidate.nextProductionEventOrdinal += elapsed * 2;
    const lane = cloneLaneState(event.laneState);
    candidate.motion = lane.motion;
    candidate.inputBuffer = lane.inputBuffer;
    const derivedCandidates = event.contactCandidates.filter(({ entity }) =>
      !candidate.resolvedEntityIds.includes(entity.instanceId));
    const candidates = mutationProbe?.contactCandidates?.(
      derivedCandidates,
      event.simulationTick,
      pattern.patternIndex,
    ) ?? derivedCandidates;

    if (candidates.length > 0) {
      const resolution = resolveCanonicalContactCandidates({
        course: context.course,
        runSeed: entryState.runSeed,
        difficulty: entryState.difficulty,
        candidates,
        controlMode: entryState.controlMode,
        simulationTick: event.simulationTick,
        scores: candidate.scores,
        ledger: candidate.ledger,
        invulnerableUntilTick: candidate.invulnerableUntilTick,
        resolvedEntityIds: candidate.resolvedEntityIds,
      });
      for (const contact of resolution.events) {
        const productionEventOrdinal = candidate.nextProductionEventOrdinal;
        candidate.nextProductionEventOrdinal += 1;
        candidate.contacts.push(Object.freeze({
          productionEventOrdinal,
          contact,
        }));
        if (contact.effect !== null) {
          candidate.effects.push(Object.freeze({
            productionEventOrdinal,
            effect: contact.effect,
          }));
        }
      }
      candidate.scores = resolution.scores;
      candidate.ledger = resolution.ledger;
      candidate.invulnerableUntilTick = resolution.invulnerableUntilTick;
      candidate.resolvedEntityIds = resolution.resolvedEntityIds;
    }

    const afterContacts = new Set(candidate.resolvedEntityIds);
    const passedEntityIds = event.scoringPassEntityIds
      .filter((entityInstanceId) => !afterContacts.has(entityInstanceId));
    if (
      !afterContacts.has(pattern.decisionMarker.instanceId) &&
      event.simulationTick === window.safeBoundaryTick
    ) {
      passedEntityIds.push(pattern.decisionMarker.instanceId);
    }
    for (const entityInstanceId of [...passedEntityIds].sort()) {
      candidate.passes.push(Object.freeze({
        productionEventOrdinal: candidate.nextProductionEventOrdinal,
        simulationTick: event.simulationTick,
        entityInstanceId,
      }));
      candidate.nextProductionEventOrdinal += 1;
    }
    candidate.resolvedEntityIds = sortedUnique([
      ...candidate.resolvedEntityIds,
      ...passedEntityIds,
    ]);
    const nextThrough = resolvedThroughPatternIndex(
      context.course,
      pattern.patternIndex,
      candidate.resolvedEntityIds,
    );
    if (nextThrough !== priorThrough) {
      candidate.nextProductionEventOrdinal += 1;
    }
    candidate.simulationTick = event.simulationTick;
  }
  const active = candidateActiveEntities(
    context.course,
    candidate.simulationTick,
    candidate.resolvedEntityIds,
  );
  if (
    candidate.simulationTick !== window.safeBoundaryTick ||
    canonical({
      motion: candidate.motion,
      inputBuffer: candidate.inputBuffer,
    }) !== canonical(window.terminalLaneState) ||
    active.some((entity) => entity.patternIndex <= pattern.patternIndex) ||
    candidate.motion.kind !== "idle" || candidate.inputBuffer !== null
  ) {
    fail(
      "mode candidate contact/pass/finish occurrence did not close its " +
        "generated pattern independently",
    );
  }
}

function jumpCandidateToPatternBoundary(
  context: RunnerSimulationContext,
  pattern: RunnerLabGeneratedPattern,
  candidate: MutableModeCandidateState,
): void {
  if (
    candidate.simulationTick > pattern.spawnTick ||
    candidate.motion.kind !== "idle" || candidate.inputBuffer !== null ||
    candidateActiveEntities(
      context.course,
      candidate.simulationTick,
      candidate.resolvedEntityIds,
    ).length !== 0
  ) {
    fail("mode candidate cannot skip a nonempty interstitial segment");
  }
  const elapsed = pattern.spawnTick - candidate.simulationTick;
  candidate.nextProductionEventOrdinal += elapsed * 2;
  // The boundary tick appends exactly one reachability certificate and pattern.
  candidate.nextProductionEventOrdinal += 2;
  candidate.simulationTick = pattern.spawnTick;
}

function recordModeMarkerTransition(
  entryState: RunStateV1,
  checkpoint: RunStateV1,
  target: RunnerNeutralReplayTarget,
  pattern: RunnerLabGeneratedPattern,
  first: RunnerSimulationResult,
  committed: RunnerSimulationResult,
): RunnerAuthenticatedMarkerTransition {
  if (checkpoint.runner === null || committed.state.runner === null) {
    fail("mode marker transition lost its runner state");
  }
  const decisionMarkerEvents = first.events.filter((event): event is Extract<
    RunnerSimulationEvent,
    { type: "decision-marker-resolved" }
  > => event.type === "decision-marker-resolved");
  const expectedDecisionCount = entryState.controlMode === "manual" ? 0 : 1;
  if (
    decisionMarkerEvents.length !== expectedDecisionCount ||
    decisionMarkerEvents.some((event) =>
      event.entityInstanceId !== pattern.decisionMarker.instanceId ||
      event.targetLane !== target.targetLane ||
      event.controlMode !== entryState.controlMode)
  ) {
    fail("mode marker emitted the wrong production decision event");
  }
  const beforeStateHash = stateHashV1(checkpoint);
  const afterFirstStateHash = stateHashV1(first.state);
  const afterCommitStateHash = stateHashV1(committed.state);
  let reloadedBeforeStateHash = beforeStateHash;
  let reloadedAfterStateHash = afterCommitStateHash;
  let reloadRoundTripVerified = false;
  if (entryState.controlMode === "semantic-assist" && pattern.patternIndex === 1) {
    const beforeReload = decodedReplayState(checkpoint);
    const afterReload = decodedReplayState(committed.state);
    reloadedBeforeStateHash = stateHashV1(beforeReload);
    reloadedAfterStateHash = stateHashV1(afterReload);
    reloadRoundTripVerified =
      reloadedBeforeStateHash === beforeStateHash &&
      reloadedAfterStateHash === afterCommitStateHash;
    if (!reloadRoundTripVerified) {
      fail("Semantic marker changed across reload-before or reload-after");
    }
  }
  return deepFreeze({
    patternIndex: pattern.patternIndex,
    markerInstanceId: pattern.decisionMarker.instanceId,
    simulationTick: checkpoint.simulationTick,
    sourceLane: target.sourceLane,
    targetLane: target.targetLane,
    firstIntent: target.firstIntent,
    bufferedIntent: target.bufferedIntent,
    beforeStateHash,
    afterFirstStateHash,
    afterCommitStateHash,
    reloadedBeforeStateHash,
    reloadedAfterStateHash,
    reloadRoundTripVerified,
    decisionMarkerEventCount: decisionMarkerEvents.length,
    acceptedRawInputCount: entryState.controlMode === "manual"
      ? [target.firstIntent, target.bufferedIntent]
        .filter((intent) => intent !== null).length
      : 0,
    motion: committed.state.runner.motion,
    inputBuffer: committed.state.runner.inputBuffer,
    eventTypes: committed === first
      ? first.events.map(({ type }) => type)
      : [...first.events, ...committed.events].map(({ type }) => type),
  });
}

function executeModeCandidate(
  entryState: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  context: RunnerSimulationContext,
  geometryPlan: RunnerModeGeometryPlan,
  driver: RunnerModeCandidateDriver,
  mutationProbe?: RunnerModeCandidateMutationProbe,
): RunnerModeCandidateExecution {
  const started = driver.start(context, entryState);
  if (
    !started.stateChanged || started.tickDelta !== 0 ||
    started.events.length !== 1 ||
    started.events[0]?.type !== "start-acknowledged" ||
    started.state.runner === null
  ) {
    fail("mode candidate did not execute exactly one production Start event");
  }
  const candidate: MutableModeCandidateState = {
    simulationTick: 0,
    scores: started.state.scores,
    ledger: started.state.effectLedger,
    motion: started.state.runner.motion,
    inputBuffer: started.state.runner.inputBuffer,
    invulnerableUntilTick: started.state.runner.invulnerableUntilTick,
    resolvedEntityIds: started.state.runner.spawn.resolvedEntityIds,
    nextProductionEventOrdinal: 1,
    contacts: [],
    effects: [],
    passes: [],
  };
  const markerCheckpoints: RunStateV1[] = [];
  const markerTransitions: RunnerAuthenticatedMarkerTransition[] = [];

  for (const [index, pattern] of context.course.patterns.entries()) {
    const target = structuralTape.targets[index];
    const geometryWindow = geometryPlan.windows[index];
    if (
      target === undefined || target.patternIndex !== pattern.patternIndex ||
      geometryWindow === undefined ||
      geometryWindow.patternIndex !== pattern.patternIndex ||
      target.simulationTick !== pattern.spawnTick ||
      target.safeBoundaryTick !== runnerPatternSafeBoundaryTick(
        pattern,
        context.course.worldSpeedMilliPerTick,
      )
    ) {
      fail("mode candidate target is not bound to generated geometry");
    }
    jumpCandidateToPatternBoundary(context, pattern, candidate);
    const checkpoint = materializeModeCandidateState(
      entryState,
      context,
      candidate,
    );
    if (
      checkpoint.runner === null || checkpoint.runner.motion.kind !== "idle" ||
      checkpoint.runner.inputBuffer !== null ||
      checkpoint.runner.motion.currentLane !== target.sourceLane
    ) {
      fail("mode candidate carried the wrong motion or input buffer to a marker");
    }
    markerCheckpoints.push(checkpoint);
    const productionReduction = driver.marker(context, checkpoint, target);
    const reduction = mutationProbe?.markerResult?.(
      productionReduction,
      pattern.patternIndex,
    ) ?? productionReduction;
    adoptCandidateResult(candidate, reduction.first);
    if (reduction.committed !== reduction.first) {
      adoptCandidateResult(candidate, reduction.committed);
    }
    const transition = recordModeMarkerTransition(
      entryState,
      checkpoint,
      target,
      pattern,
      reduction.first,
      reduction.committed,
    );
    if (
      canonical(transition.motion) !== canonical(candidate.motion) ||
      transition.inputBuffer !== candidate.inputBuffer
    ) {
      fail("mode candidate marker transition did not carry reducer motion");
    }
    markerTransitions.push(transition);
    progressCandidateThroughGeometryWindow(
      entryState,
      context,
      pattern,
      geometryWindow,
      candidate,
      mutationProbe,
    );
  }

  if (
    candidate.simulationTick > 2999 ||
    candidate.motion.kind !== "idle" || candidate.inputBuffer !== null ||
    candidateActiveEntities(
      context.course,
      candidate.simulationTick,
      candidate.resolvedEntityIds,
    ).length !== 0
  ) {
    fail("mode candidate cannot enter its terminal interstitial segment");
  }
  candidate.nextProductionEventOrdinal +=
    (2999 - candidate.simulationTick) * 2;
  candidate.simulationTick = 2999;
  const canonicalPreFinishState = materializeModeCandidateState(
    entryState,
    context,
    candidate,
  );
  const preFinishState = mutationProbe?.preFinishState?.(
    canonicalPreFinishState,
  ) ?? canonicalPreFinishState;
  const productionFinished = driver.finish(context, preFinishState);
  const finished = mutationProbe?.finishResult?.(productionFinished) ??
    productionFinished;
  adoptCandidateResult(candidate, finished);
  if (
    finished.state.runStatus !== "active" ||
    finished.state.stage.phase !== "settling" ||
    finished.state.stage.settlement?.status !== "pending" ||
    finished.state.simulationTick !== 3000 ||
    finished.events.filter((event) =>
      event.type === "finish-sentinel-resolved").length !== 1 ||
    finished.events.filter((event) => event.type === "settlement-pending").length !== 1
  ) {
    fail("mode candidate did not execute the production finish/settlement tick");
  }
  const pendingState = finished.state;
  const canonicalCompletedState = driver.complete(pendingState);
  const completedState = mutationProbe?.completedState?.(
    canonicalCompletedState,
  ) ?? canonicalCompletedState;
  const reapplied = driver.complete(completedState);
  if (
    completedState.runStatus !== "completed" ||
    completedState.stage.phase !== "complete" ||
    canonical(reapplied) !== canonical(completedState)
  ) {
    fail("mode candidate settlement application is incomplete or non-idempotent");
  }
  const expectedContactOccurrence = structuralTape.contacts.map(({ contact }) =>
    Object.freeze({
      entityInstanceId: contact.entityInstanceId,
      contentId: contact.contentId,
      simulationTick: contact.simulationTick,
    }));
  const candidateContactOccurrence = candidate.contacts.map(({ contact }) =>
    Object.freeze({
      entityInstanceId: contact.entityInstanceId,
      contentId: contact.contentId,
      simulationTick: contact.simulationTick,
    }));
  const decisionMarkerIds = new Set(context.course.patterns.map((pattern) =>
    pattern.decisionMarker.instanceId));
  const expectedPassOccurrence = structuralTape.passes
    .filter((pass) => entryState.controlMode === "manual" ||
      !decisionMarkerIds.has(pass.entityInstanceId))
    .map((pass) =>
    Object.freeze({
      entityInstanceId: pass.entityInstanceId,
      simulationTick: pass.simulationTick,
    }));
  const candidatePassOccurrence = candidate.passes.map((pass) =>
    Object.freeze({
      entityInstanceId: pass.entityInstanceId,
      simulationTick: pass.simulationTick,
    }));
  const contactIds = candidate.contacts.map(({ contact }) =>
    contact.entityInstanceId);
  const passIds = candidate.passes.map(({ entityInstanceId }) =>
    entityInstanceId);
  const expectedTerminalIds = context.course.patterns.flatMap((pattern) =>
    pattern.spawnEntities.map((entity) => entity.instanceId));
  const contactOccurrenceMatches =
    canonical(candidateContactOccurrence) === canonical(expectedContactOccurrence);
  const passOccurrenceMatches =
    canonical(candidatePassOccurrence) === canonical(expectedPassOccurrence);
  const terminalResolvedMatches =
    canonical(pendingState.runner?.spawn.resolvedEntityIds ?? []) ===
      canonical(structuralTape.terminalResolvedEntityIds);
  if (
    !contactOccurrenceMatches || !passOccurrenceMatches ||
    new Set(contactIds).size !== contactIds.length ||
    new Set(passIds).size !== passIds.length ||
    contactIds.some((id) => passIds.includes(id)) ||
    canonical(sortedUnique([
      ...contactIds,
      ...passIds,
      ...(entryState.controlMode === "manual"
        ? []
        : markerTransitions.map(({ markerInstanceId }) => markerInstanceId)),
    ])) !==
      canonical(sortedUnique(expectedTerminalIds)) ||
    !terminalResolvedMatches ||
    canonical(completedState.storyState.facts.map(({ factId }) => factId)) !==
      canonical(structuralTape.completionFactIds) ||
    canonical(completedState.storyState.memories.map(({ memoryId }) => memoryId)) !==
      canonical(structuralTape.completionMemoryIds)
  ) {
    fail(
      "mode candidate contact/pass/finish occurrence differs from generated " +
        `expectations (contact=${contactOccurrenceMatches}, ` +
        `pass=${passOccurrenceMatches}, terminal=${terminalResolvedMatches})`,
    );
  }
  if (
    entryState.controlMode === "automatic-assist" &&
    (candidate.effects.length !== 0 || candidate.contacts.some(({ contact }) =>
      contact.outcome !== "automatic-pass" || contact.effect !== null))
  ) {
    fail("Automatic candidate applied a scoring contact result");
  }
  const ordinaryStepLift = exactProfileOrdinaryStepLift(
    entryState,
    structuralTape,
    context,
    started.state,
    markerCheckpoints,
    markerTransitions,
    candidate.effects,
    pendingState,
    completedState,
    mutationProbe,
  );
  return deepFreeze({
    startedState: started.state,
    markerCheckpoints,
    markerTransitions,
    contacts: candidate.contacts,
    effects: candidate.effects,
    passes: candidate.passes,
    preFinishState,
    pendingState,
    completedState,
    productionEventCount: candidate.nextProductionEventOrdinal,
    ordinaryStepLift,
  });
}

function manualOrSemanticDriver(
  entryState: RunStateV1,
  manualCommands: readonly RunnerAuthenticatedManualCommand[] | null,
): Readonly<{
  readonly driver: RunnerModeCandidateDriver;
  readonly assertAllCommandsConsumed: () => void;
}> {
  const mode = entryState.controlMode;
  if (mode !== "manual" && mode !== "semantic-assist") {
    fail("Manual/Semantic driver received Automatic Assist");
  }
  if (mode === "semantic-assist" && manualCommands !== null) {
    fail("Semantic candidate cannot accept adapter lane commands");
  }
  let consumedManualCommandCount = 0;
  const driver: RunnerModeCandidateDriver = Object.freeze({
    start: (context: RunnerSimulationContext, state: RunStateV1) =>
      startRunnerLaboratory(context, state),
    marker: (
      context: RunnerSimulationContext,
      checkpoint: RunStateV1,
      target: RunnerNeutralReplayTarget,
    ) => {
      if (mode === "semantic-assist") {
        const result = chooseLane(context, checkpoint, target.targetLane);
        return Object.freeze({ first: result, committed: result });
      }
      const commands = manualCommands === null
        ? null
        : manualCommands.filter((command) =>
            command.patternIndex === target.patternIndex);
      const expectedIntents = [target.firstIntent, target.bufferedIntent]
        .filter((intent): intent is LaneDirection => intent !== null);
      if (
        commands !== null &&
        (commands.length !== expectedIntents.length ||
          commands.some((command, commandIndex) =>
            command.ordinal !== commandIndex ||
            command.simulationTick !== target.simulationTick +
              command.ordinal + 1 ||
            command.intent !== expectedIntents[commandIndex]))
      ) {
        fail("adapter command direction/timing is not a canonical marker input");
      }
      consumedManualCommandCount += commands?.length ?? 0;
      const firstIntent = commands === null
        ? target.firstIntent
        : commands[0]?.intent ?? null;
      const bufferedIntent = commands === null
        ? target.bufferedIntent
        : commands[1]?.intent ?? null;
      const first = advanceRunnerLaboratory(context, checkpoint, {
        laneIntent: firstIntent,
      });
      const committed = bufferedIntent === null
        ? first
        : advanceRunnerLaboratory(context, first.state, {
            laneIntent: bufferedIntent,
          });
      return Object.freeze({ first, committed });
    },
    finish: (context: RunnerSimulationContext, preFinishState: RunStateV1) =>
      advanceRunnerLaboratory(context, preFinishState, { laneIntent: null }),
    complete: (pendingState: RunStateV1) =>
      applyLabSettlement(pendingState, null),
  });
  return Object.freeze({
    driver,
    assertAllCommandsConsumed: () => {
      if (
        manualCommands !== null &&
        consumedManualCommandCount !== manualCommands.length
      ) {
        fail("adapter command trace contains an unknown or duplicate pattern");
      }
    },
  });
}

/** @internal Evaluator capability; not an ordinary gameplay entry point. */
export function createRunnerModeEvaluationSupport(
  entryState: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
): RunnerModeEvaluationSupport {
  authenticateCanonicalEntry(entryState);
  if (
    !isAuthenticRunnerNeutralReplayTape(structuralTape) ||
    structuralTape.controlMode !== "manual" ||
    structuralTape.runSeed !== entryState.runSeed ||
    structuralTape.difficulty !== entryState.difficulty ||
    structuralTape.patternBoundaries.length !== 10 ||
    structuralTape.targets.length !== 10
  ) {
    fail("mode evaluation support lacks its exact authenticated structural tape");
  }
  const context = simulationContextForTape(structuralTape);
  const geometryPlan = geometryPlanForTape(structuralTape, context);
  const executeCandidate = Object.freeze((
    driver: RunnerModeCandidateDriver,
    mutationProbe?: RunnerModeCandidateMutationProbe,
  ) => executeModeCandidate(
    entryState,
    structuralTape,
    context,
    geometryPlan,
    driver,
    mutationProbe,
  ));
  const base = entryState.controlMode === "automatic-assist"
    ? null
    : manualOrSemanticDriver(entryState, null);
  const defaultExecution = base === null
    ? null
    : executeCandidate(base.driver);
  base?.assertAllCommandsConsumed();
  const support = Object.freeze({
    supportId: RUNNER_MODE_EVALUATION_SUPPORT_ID,
    canonicalEntryHash: fnv1a64Hex(canonical(entryState)),
    entryState,
    structuralTape,
    context,
    geometryPlan,
    defaultExecution,
    startedState: defaultExecution?.startedState ?? null,
    markerCheckpoints: defaultExecution?.markerCheckpoints ?? Object.freeze([]),
    contacts: defaultExecution?.contacts ?? Object.freeze([]),
    effects: defaultExecution?.effects ?? Object.freeze([]),
    passes: defaultExecution?.passes ?? Object.freeze([]),
    terminalTransientState: defaultExecution?.preFinishState ?? null,
    executeCandidate,
  } satisfies RunnerModeEvaluationSupport);
  registerAuthenticRunnerModeEvaluationSupport(support);
  return support;
}

export function isAuthenticRunnerModeEvaluationSupport(
  value: unknown,
): value is RunnerModeEvaluationSupport {
  return typeof value === "object" && value !== null &&
    hasAuthenticRunnerModeEvaluationSupport(value) && Object.isFrozen(value);
}

function decodedReplayState(state: RunStateV1): RunStateV1 {
  const decoded = decodeRunState(encodeRunState(state), RUNNER_LABORATORY_CATALOG);
  if (decoded.kind !== "ready") fail("mode marker checkpoint failed canonical reload");
  return decoded.state;
}

/**
 * Independently evaluates every production marker, contact, and settlement for
 * one exact Manual or Semantic entry while reusing only a branded structural
 * course tape for the 3,000 empty/interstitial ticks.
 */
export function evaluateRunnerAuthenticatedModeProjection(
  entryState: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  manualCommands: readonly RunnerAuthenticatedManualCommand[] | null = null,
): RunnerAuthenticatedModeProjection {
  if (
    entryState.controlMode !== "manual" &&
    entryState.controlMode !== "semantic-assist"
  ) {
    fail("Automatic Assist requires its opaque production oracle projection");
  }
  const support = createRunnerModeEvaluationSupport(entryState, structuralTape);
  const configured = manualOrSemanticDriver(
    entryState,
    manualCommands,
  );
  const execution = manualCommands === null && support.defaultExecution !== null
    ? support.defaultExecution
    : support.executeCandidate(configured.driver);
  configured.assertAllCommandsConsumed();
  const markerTransitions = execution.markerTransitions;
  const pending = execution.pendingState;
  const completed = execution.completedState;
  if (execution.preFinishState.runner === null || pending.runner === null) {
    fail("mode candidate terminal execution lost runner state");
  }
  const rawLaneInputCount = markerTransitions.reduce((sum, transition) =>
    sum + transition.acceptedRawInputCount, 0);
  const projection = Object.freeze({
    projectionId: RUNNER_AUTHENTICATED_MODE_PROJECTION_ID,
    structuralReplayId: RUNNER_NEUTRAL_REPLAY_ID,
    canonicalEntryHash: support.canonicalEntryHash,
    controlMode: entryState.controlMode,
    runSeed: entryState.runSeed,
    difficulty: entryState.difficulty,
    startingProfileId: entryState.startingProfileId,
    startEventCount: 1 as const,
    markerTransitions,
    contacts: execution.contacts,
    effects: execution.effects,
    passes: execution.passes,
    terminalScores: Object.freeze({ ...completed.scores }),
    terminalMotion: execution.preFinishState.runner.motion,
    terminalInputBuffer: execution.preFinishState.runner.inputBuffer,
    terminalResolvedEntityIds: Object.freeze([
      ...pending.runner!.spawn.resolvedEntityIds,
    ]),
    pendingState: pending,
    pendingStateHash: stateHashV1(pending),
    completedState: completed,
    completedStateHash: stateHashV1(completed),
    completionFactIds: Object.freeze(
      completed.storyState.facts.map(({ factId }) => factId),
    ),
    completionMemoryIds: Object.freeze(
      completed.storyState.memories.map(({ memoryId }) => memoryId),
    ),
    settlementEffectIds: Object.freeze([
      ...(completed.stage.settlement?.effectIds ?? []),
    ]),
    rawLaneInputCount: entryState.controlMode === "manual"
      ? rawLaneInputCount
      : 0,
    semanticChoiceCount: entryState.controlMode === "semantic-assist"
      ? markerTransitions.length
      : 0,
    automaticDecisionCount: 0 as const,
    settlementBeginCount: 1 as const,
    settlementApplyCount: 1 as const,
    ordinaryStepLift: execution.ordinaryStepLift,
  } satisfies RunnerAuthenticatedModeProjection);
  registerAuthenticRunnerModeProjection(projection);
  AUTHENTIC_MODE_PROJECTION_SUPPORTS.set(projection, support);
  return projection;
}

/**
 * Reuses one already-authenticated exact Manual tuple continuation while
 * independently applying one adapter's commands at all ten production marker
 * boundaries. No cross-mode result is accepted or reused.
 */
export function evaluateRunnerAuthenticatedManualCommandProjection(
  expectedManualProjection: RunnerAuthenticatedModeProjection,
  manualCommands: readonly RunnerAuthenticatedManualCommand[],
): RunnerAuthenticatedModeProjection {
  if (
    !isAuthenticRunnerModeProjection(expectedManualProjection) ||
    expectedManualProjection.controlMode !== "manual"
  ) {
    fail("adapter projection requires an authentic exact Manual projection");
  }
  const support = AUTHENTIC_MODE_PROJECTION_SUPPORTS.get(
    expectedManualProjection,
  );
  if (
    support === undefined ||
    !isAuthenticRunnerModeEvaluationSupport(support) ||
    support.canonicalEntryHash !== expectedManualProjection.canonicalEntryHash
  ) {
    fail("adapter projection lost its exact tuple support");
  }
  const configured = manualOrSemanticDriver(
    support.entryState,
    manualCommands,
  );
  const execution = support.executeCandidate(configured.driver);
  configured.assertAllCommandsConsumed();
  const markerTransitions = execution.markerTransitions;
  if (
    markerTransitions.length !==
      expectedManualProjection.markerTransitions.length ||
    markerTransitions.some((transition, index) => {
      const expected = expectedManualProjection.markerTransitions[index];
      return expected === undefined ||
        transition.patternIndex !== expected.patternIndex ||
        transition.markerInstanceId !== expected.markerInstanceId ||
        transition.beforeStateHash !== expected.beforeStateHash ||
        transition.afterFirstStateHash !== expected.afterFirstStateHash ||
        transition.afterCommitStateHash !== expected.afterCommitStateHash ||
        transition.inputBuffer !== expected.inputBuffer ||
        canonical(transition.motion) !== canonical(expected.motion);
    })
  ) {
    fail("adapter production continuation differs from its exact Manual tuple");
  }
  if (
    canonical(execution.contacts) !== canonical(expectedManualProjection.contacts) ||
    canonical(execution.effects) !== canonical(expectedManualProjection.effects) ||
    canonical(execution.passes) !== canonical(expectedManualProjection.passes) ||
    canonical(execution.pendingState) !==
      canonical(expectedManualProjection.pendingState) ||
    canonical(execution.completedState) !==
      canonical(expectedManualProjection.completedState)
  ) {
    fail("adapter production continuation changed contact/pass/settlement state");
  }
  const projection = Object.freeze({
    ...expectedManualProjection,
    markerTransitions,
    contacts: execution.contacts,
    effects: execution.effects,
    passes: execution.passes,
    terminalScores: Object.freeze({ ...execution.completedState.scores }),
    terminalMotion: execution.preFinishState.runner!.motion,
    terminalInputBuffer: execution.preFinishState.runner!.inputBuffer,
    terminalResolvedEntityIds: Object.freeze([
      ...execution.pendingState.runner!.spawn.resolvedEntityIds,
    ]),
    pendingState: execution.pendingState,
    pendingStateHash: stateHashV1(execution.pendingState),
    completedState: execution.completedState,
    completedStateHash: stateHashV1(execution.completedState),
    rawLaneInputCount: markerTransitions.reduce((sum, transition) =>
      sum + transition.acceptedRawInputCount, 0),
    ordinaryStepLift: execution.ordinaryStepLift,
  } satisfies RunnerAuthenticatedModeProjection);
  registerAuthenticRunnerModeProjection(projection);
  AUTHENTIC_MODE_PROJECTION_SUPPORTS.set(projection, support);
  return projection;
}

export function isAuthenticRunnerModeProjection(
  value: unknown,
): value is RunnerAuthenticatedModeProjection {
  return typeof value === "object" && value !== null &&
    hasAuthenticRunnerModeProjection(value) && Object.isFrozen(value);
}

let lastManualOracle:
  | Readonly<{ key: string; tape: RunnerNeutralReplayTape }>
  | null = null;

function exactManualEntry(entryState: RunStateV1): RunStateV1 {
  return createRunnerLaboratoryEntryState(
    entryState.runSeed,
    initialRunSetupFromStateV1(entryState, "manual"),
  );
}

function modeMarkerKinds(controlMode: ControlMode): readonly [
  RunnerNeutralReplayClosureKind,
  RunnerNeutralReplayClosureKind,
] {
  if (controlMode === "manual") return ["manual-marker-before", "manual-marker-after"];
  if (controlMode === "semantic-assist") return ["semantic-marker-before", "semantic-marker-after"];
  return ["automatic-marker-before", "automatic-marker-after"];
}

function evaluateRunnerNeutralReplayInternal(
  entryState: RunStateV1,
  manualOracle: RunnerNeutralReplayTape | null,
): RunnerNeutralReplayTape {
  const context = authenticateEntry(entryState);
  const course = assertContext(context);
  if (
    entryState.controlMode === "automatic-assist" &&
    (manualOracle === null ||
      !isAuthenticRunnerNeutralReplayTape(manualOracle) ||
      manualOracle.controlMode !== "manual" ||
      manualOracle.runSeed !== entryState.runSeed ||
      manualOracle.difficulty !== entryState.difficulty ||
      manualOracle.startingProfileId !== entryState.startingProfileId)
  ) {
    fail("Automatic replay lacks its private authenticated Manual oracle");
  }
  let state = initialInductiveState(context);
  const recorder: ReplayRecorder = {
    context,
    nextProductionEventOrdinal: 0,
    contacts: [],
    effects: [],
    passes: [],
    invulnerabilityWitnesses: [],
    maximumLiveEntities: Object.freeze({
      count: 0,
      firstWitnessTick: 0,
      entityInstanceIds: Object.freeze([]),
    }),
    replayClosure: createReplayClosure(),
  };
  recordReplayBoundary(recorder, "start-before", entryState);
  // The production zero-tick Start acknowledgement is first.
  allocateEvent(recorder);
  const materializedStart = materializeActiveState(context, state);
  const startBoundary = boundary(
    "start",
    null,
    recorder.nextProductionEventOrdinal,
    materializedStart,
  );
  recordReplayBoundary(recorder, "start-after", materializedStart);
  recordStructuralLaneBoundary(context, recorder, state, materializedStart);
  recordExecutedReplayTransition(
    recorder.replayClosure,
    entryState,
    materializedStart,
    Object.freeze({ kind: "acknowledge-start" as const }),
  );
  const persistedUserPause = deepFreeze({
    ...materializedStart,
    runner: {
      ...materializedStart.runner!,
      userPaused: true,
    },
  } satisfies RunStateV1);
  recordReplayBoundary(recorder, "user-pause", persistedUserPause);
  recordReplayBoundary(recorder, "user-resume", materializedStart);
  const pausedStateHash = recorder.replayClosure.stateHashes.get(
    persistedUserPause,
  );
  const resumedStateHash = recorder.replayClosure.stateHashes.get(
    materializedStart,
  );
  if (pausedStateHash === undefined || resumedStateHash === undefined) {
    fail("persisted user-pause branch lacks exact codec state hashes");
  }
  recorder.replayClosure.userPauseResumeStateHashes.set(
    pausedStateHash,
    resumedStateHash,
  );
  let lastReplayState = materializedStart;
  let terminalReplayCommand: ReplayContinuationCommand | null = null;
  const patternBoundaries: RunnerNeutralReplayBoundary[] = [];
  const targets: RunnerNeutralReplayTarget[] = [];
  const decisionProvenance: RunnerNeutralReplayDecisionProvenance[] = [];
  let queuedIntent: LaneDirection | null = null;
  let rawLaneInputCount = 0;
  let semanticChoiceCount = 0;
  let automaticDecisionCount = 0;
  const decisionMarkerIds = new Set(course.patterns.map((pattern) =>
    pattern.decisionMarker.instanceId));

  while (
    state.simulationTick < RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks
  ) {
    let laneIntent: LaneIntent = null;
    let bufferAfterStep: LaneDirection | null = null;
    let assistMarkerBeforeRecorded = false;
    let assistMarkerAfterKind: RunnerNeutralReplayClosureKind | null = null;
    let assistPatternIndex: number | null = null;
    let assistTargetLane: Lane | null = null;
    const nextPattern = course.patterns[targets.length];
    if (
      nextPattern !== undefined &&
      state.simulationTick === nextPattern.spawnTick &&
      state.spawn.patternIndex === nextPattern.patternIndex
    ) {
      if (
        queuedIntent !== null ||
        state.motion.kind !== "idle" ||
        state.inputBuffer !== null
      ) {
        fail("neutral policy reached a non-idle pattern boundary");
      }
      let decision: NeutralProjection;
      if (entryState.controlMode === "automatic-assist") {
        const oracleTarget = manualOracle!.targets[nextPattern.patternIndex - 1];
        if (
          oracleTarget === undefined ||
          oracleTarget.patternIndex !== nextPattern.patternIndex ||
          oracleTarget.simulationTick !== state.simulationTick ||
          oracleTarget.sourceLane !== state.motion.currentLane
        ) {
          fail("neutral Assist oracle target differs from the live authentic marker");
        }
        decision = Object.freeze({
          targetLane: oracleTarget.targetLane,
          firstIntent: oracleTarget.firstIntent,
          bufferedIntent: oracleTarget.bufferedIntent,
          laneMoves: Math.abs(oracleTarget.targetLane - oracleTarget.sourceLane) as 0 | 1 | 2,
          safeBoundaryTick: oracleTarget.safeBoundaryTick,
          utilityNumerator: oracleTarget.utilityNumerator,
        });
      } else {
        decision = evaluateNeutralTarget(context, state, nextPattern);
      }
      targets.push(Object.freeze({
        patternIndex: nextPattern.patternIndex,
        simulationTick: state.simulationTick,
        selectedBeforeProductionEventOrdinal:
          recorder.nextProductionEventOrdinal,
        sourceLane: state.motion.currentLane,
        targetLane: decision.targetLane,
        firstIntent: decision.firstIntent,
        bufferedIntent: decision.bufferedIntent,
        safeBoundaryTick: decision.safeBoundaryTick,
        utilityNumerator: decision.utilityNumerator,
      }));
      laneIntent = decision.firstIntent;
      decisionProvenance.push(Object.freeze({
        patternIndex: nextPattern.patternIndex,
        markerInstanceId: nextPattern.decisionMarker.instanceId,
        controlMode: entryState.controlMode,
        simulationTick: state.simulationTick,
        sourceLane: state.motion.currentLane,
        targetLane: decision.targetLane,
        firstIntent: decision.firstIntent,
        bufferedIntent: decision.bufferedIntent,
        markerResolution: entryState.controlMode === "manual"
          ? "safe-pass"
          : entryState.controlMode === "semantic-assist"
            ? "atomic-semantic-choice"
            : "automatic-oracle",
        manualOracleCompletedStateHash: entryState.controlMode === "automatic-assist"
          ? manualOracle!.completedBoundary.stateHash
          : null,
      }));
      if (entryState.controlMode === "manual") {
        queuedIntent = decision.bufferedIntent;
        if (decision.firstIntent !== null) rawLaneInputCount += 1;
      } else {
        const [beforeKind, afterKind] = modeMarkerKinds(entryState.controlMode);
        const assistMarkerBeforeState = state;
        recordReplayBoundary(
          recorder,
          beforeKind,
          () => materializeActiveState(context, assistMarkerBeforeState),
        );
        assistMarkerBeforeRecorded = true;
        state = commitAssistDecisionMarker(context, state, nextPattern, recorder);
        bufferAfterStep = decision.bufferedIntent;
        assistPatternIndex = nextPattern.patternIndex;
        assistTargetLane = decision.targetLane;
        assistMarkerAfterKind = afterKind;
        if (entryState.controlMode === "semantic-assist") semanticChoiceCount += 1;
        else automaticDecisionCount += 1;
      }
    } else if (queuedIntent !== null) {
      laneIntent = queuedIntent;
      queuedIntent = null;
      rawLaneInputCount += 1;
    }

    const beforeState = state;
    let beforeMaterialized: RunStateV1 | null = null;
    const materializeBefore = (): RunStateV1 => {
      beforeMaterialized ??= materializeActiveState(context, beforeState);
      return beforeMaterialized;
    };
    const contactCountBefore = recorder.contacts.length;
    const passCountBefore = recorder.passes.length;
    const advanced = advanceOneTick(
      context,
      state,
      laneIntent,
      recorder,
      bufferAfterStep,
    );
    state = advanced.state;
    const canPersistActive = state.simulationTick <
      RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks;
    let afterMaterialized: RunStateV1 | null = null;
    const materializeAfter = (): RunStateV1 => {
      if (!canPersistActive) fail("terminal tick cannot be persisted as active");
      afterMaterialized ??= materializeActiveState(context, state);
      return afterMaterialized;
    };
    if (assistMarkerAfterKind !== null) {
      if (!assistMarkerBeforeRecorded || !canPersistActive) {
        fail("Assist marker closure lacks an atomic before/after boundary");
      }
      recordReplayBoundary(recorder, assistMarkerAfterKind, materializeAfter);
    }

    if (canPersistActive) {
      if (beforeState.motion.kind === "moving" && state.motion.kind === "idle") {
        recordReplayBoundary(recorder, "movement-completion-before", materializeBefore);
        recordReplayBoundary(recorder, "movement-completion-after", materializeAfter);
      }
      if (
        beforeState.motion.kind === "idle" &&
        beforeState.inputBuffer !== null &&
        state.motion.kind === "moving"
      ) {
        recordReplayBoundary(recorder, "buffer-handoff-before", materializeBefore);
        recordReplayBoundary(recorder, "buffer-handoff-after", materializeAfter);
      }
      const persistedAfter = materializeAfter();
      recordStructuralLaneBoundary(context, recorder, state, persistedAfter);
      const replayCommand = Object.freeze({
        kind: "advance" as const,
        laneIntent,
        bufferAfterStep,
        assistPatternIndex,
        assistTargetLane,
      });
      recordExecutedReplayTransition(
        recorder.replayClosure,
        lastReplayState,
        persistedAfter,
        replayCommand,
      );
      lastReplayState = persistedAfter;

      const newContacts = recorder.contacts.slice(contactCountBefore);
      for (const contact of newContacts) {
        recordReplayBoundary(recorder, "contact-before", materializeBefore);
        recordReplayBoundary(recorder, "contact-after", materializeAfter);
        if (contact.contact.outcome === "hazard-applied") {
          recordReplayBoundary(recorder, "invulnerability-start", materializeAfter);
        }
      }
      const newPasses = recorder.passes.slice(passCountBefore);
      for (const pass of newPasses) {
        recordReplayBoundary(recorder, "safe-pass-before", materializeBefore);
        recordReplayBoundary(recorder, "safe-pass-after", materializeAfter);
        if (entryState.controlMode === "manual" && decisionMarkerIds.has(pass.entityInstanceId)) {
          recordReplayBoundary(recorder, "manual-marker-before", materializeBefore);
          recordReplayBoundary(recorder, "manual-marker-after", materializeAfter);
        }
      }
      if (
        state.invulnerableUntilTick > 0 &&
        state.simulationTick === state.invulnerableUntilTick - 1
      ) {
        recordReplayBoundary(recorder, "invulnerability-last-protected", materializeAfter);
      }
      if (
        state.invulnerableUntilTick > 0 &&
        state.simulationTick === state.invulnerableUntilTick
      ) {
        recordReplayBoundary(recorder, "invulnerability-end", materializeAfter);
      }
    } else {
      terminalReplayCommand = Object.freeze({
        kind: "advance" as const,
        laneIntent,
        bufferAfterStep,
        assistPatternIndex,
        assistTargetLane,
      });
    }
    if (advanced.appendedPattern !== null) {
      patternBoundaries.push(boundary(
        "pattern",
        advanced.appendedPattern.patternIndex,
        recorder.nextProductionEventOrdinal,
        materializeActiveState(context, state),
      ));
    }
  }

  if (
    targets.length !== course.patterns.length ||
    patternBoundaries.length !== course.patterns.length ||
    queuedIntent !== null ||
    state.spawn.patternIndex !== course.patterns.length ||
    state.activeEntities.length !== 0
  ) {
    fail("neutral replay did not exhaust all ten authentic patterns");
  }
  const activeTerminal = materializeActiveState(context, state);
  const oracleScores = entryState.controlMode === "automatic-assist"
    ? manualOracle!.terminalScores
    : null;
  const pending = beginLabSettlement(activeTerminal, oracleScores);
  // Finish sentinel then settlement-pending are the final ordinary-step events.
  allocateEvent(recorder);
  allocateEvent(recorder);
  const pendingBoundary = boundary(
    "settlement-pending",
    null,
    recorder.nextProductionEventOrdinal,
    pending,
  );
  recordReplayBoundary(recorder, "settlement-pending", pending);
  if (terminalReplayCommand === null) {
    fail("terminal replay tick lacks its authenticated continuation command");
  }
  recordExecutedReplayTransition(
    recorder.replayClosure,
    lastReplayState,
    pending,
    terminalReplayCommand,
  );
  const completed = applyLabSettlement(pending, oracleScores);
  const completedBoundary = boundary(
    "settlement-completed",
    null,
    recorder.nextProductionEventOrdinal,
    completed,
  );
  recordReplayBoundary(recorder, "settlement-completed", completed);
  recordExecutedReplayTransition(
    recorder.replayClosure,
    pending,
    completed,
    Object.freeze({ kind: "apply-settlement" as const }),
  );
  const pendingRunner = pending.runner;
  if (pendingRunner === null) fail("pending settlement lost its runner state");
  const contactLedgerEffects = pending.effectLedger.recent
    .filter((effect) => effect.source === "runner");
  if (
    recorder.effects.length !== contactLedgerEffects.length ||
    recorder.effects.some((ordered, index) =>
      ordered.effect.effectId !== contactLedgerEffects[index]?.effectId)
  ) {
    fail("ordered effect tape differs from the production ledger");
  }
  const replayClosureInput: ReplayClosureVerificationInput = Object.freeze({
    context,
    closure: recorder.replayClosure,
    durableBoundaries: Object.freeze([
      startBoundary,
      ...patternBoundaries,
      pendingBoundary,
      completedBoundary,
    ]),
    decisionProvenance: Object.freeze([...decisionProvenance]),
    automaticSettlementScores: oracleScores === null
      ? null
      : Object.freeze({ ...oracleScores }),
  });
  const replayClosure = replayClosureSummary(replayClosureInput);

  const tape = deepFreeze({
    replayId: RUNNER_NEUTRAL_REPLAY_ID,
    policyId: RUNNER_NEUTRAL_POLICY_ID,
    controlMode: entryState.controlMode,
    runSeed: entryState.runSeed,
    difficulty: entryState.difficulty,
    startingProfileId: entryState.startingProfileId,
    course: courseProjection(course),
    startBoundary,
    patternBoundaries,
    pendingBoundary,
    completedBoundary,
    targets,
    contacts: recorder.contacts,
    effects: recorder.effects,
    passes: recorder.passes,
    invulnerabilityWitnesses: recorder.invulnerabilityWitnesses,
    maximumLiveEntities: recorder.maximumLiveEntities,
    spawnedEntityIds: course.patterns.flatMap((pattern) =>
      pattern.spawnEntities.map((entity) => entity.instanceId)),
    terminalResolvedEntityIds: [...pendingRunner.spawn.resolvedEntityIds],
    terminalScores: { ...completed.scores },
    terminalMotion: pendingRunner.motion,
    terminalInputBuffer: pendingRunner.inputBuffer,
    completionFactIds: completed.storyState.facts.map((fact) => fact.factId),
    completionMemoryIds: completed.storyState.memories.map((memory) =>
      memory.memoryId),
    evaluatedProfileInvariant: profileInvariant(
      entryState,
      completed.effectLedger.recent,
      completed.scores,
    ),
    rawLaneInputCount,
    semanticChoiceCount,
    automaticDecisionCount,
    settlementBeginCount: 1,
    settlementApplyCount: 1,
    settlementEffectIds: [...(completed.stage.settlement?.effectIds ?? [])],
    decisionProvenance,
    replayClosure,
    productionEventCount: recorder.nextProductionEventOrdinal,
  } satisfies RunnerNeutralReplayTape);
  AUTHENTIC_REPLAY_TAPES.add(tape);
  REPLAY_CLOSURE_VERIFICATION_INPUTS.set(tape, replayClosureInput);
  return tape;
}

function continuationContextAndState(checkpoint: RunStateV1): Readonly<{
  context: AuthenticEvaluationContext;
  state: InductiveReplayState;
}> {
  if (!isDeeplyFrozen(checkpoint)) fail("continuation checkpoint must be deeply immutable");
  if (
    checkpoint.controlMode !== "manual" &&
    checkpoint.controlMode !== "semantic-assist"
  ) {
    fail("forced continuation supports only Manual and Semantic checkpoints");
  }
  assertRunnerLaboratorySaveInvariants(checkpoint);
  if (
    checkpoint.runStatus !== "active" ||
    checkpoint.stage.phase !== "active" ||
    checkpoint.runner === null ||
    checkpoint.runner.motion.kind !== "idle" ||
    checkpoint.runner.inputBuffer !== null
  ) {
    fail("forced continuation requires an idle active laboratory checkpoint");
  }
  const entry = createRunnerLaboratoryEntryState(
    checkpoint.runSeed,
    initialRunSetupFromStateV1(checkpoint, checkpoint.controlMode),
  );
  const course = generateRunnerLaboratoryCourse(
    checkpoint.runSeed,
    checkpoint.difficulty,
  );
  const context = Object.freeze({
    replayId: RUNNER_NEUTRAL_REPLAY_ID,
    entry,
    course,
  });
  AUTHENTIC_EVALUATION_CONTEXTS.add(context);
  const runner = checkpoint.runner;
  const state = Object.freeze({
    simulationTick: checkpoint.simulationTick,
    worldDistanceMilli: checkpoint.stage.worldDistanceMilli,
    scores: checkpoint.scores,
    ledger: checkpoint.effectLedger,
    motion: runner.motion,
    inputBuffer: runner.inputBuffer,
    spawn: runner.spawn,
    activeEntities: runner.activeEntities,
    invulnerableUntilTick: runner.invulnerableUntilTick,
  });
  AUTHENTIC_INDUCTIVE_STATES.add(state);
  return Object.freeze({ context, state });
}

function forcedContinuationTickSignature(
  state: InductiveReplayState,
  scoringEntityIds: ReadonlySet<string>,
  includeModeTransientState: boolean,
  projectedInputBuffer: LaneDirection | null,
  projectedResolvedThroughPatternIndex: number,
): string {
  const scoringResolvedIds = state.spawn.resolvedEntityIds.filter((id) =>
    scoringEntityIds.has(id));
  const active = state.activeEntities
    .filter((entity) =>
      includeModeTransientState || scoringEntityIds.has(entity.instanceId))
    .map((entity) => [
      entity.instanceId,
      entity.contentId,
      entity.kind,
      entity.lane,
      entity.xMilli,
      entity.contactState,
    ].join(":"))
    .join(",");
  const motion = state.motion;
  return [
    state.simulationTick,
    state.worldDistanceMilli,
    state.scores.health,
    state.scores.happiness,
    state.scores.money,
    motion.kind,
    motion.currentLane,
    motion.sourceLane,
    motion.targetLane,
    motion.elapsedTicks,
    motion.totalTicks,
    projectedInputBuffer ?? "null",
    state.spawn.patternIndex,
    state.spawn.nextSpawnTick,
    state.spawn.nextSpawnDistanceMilli,
    projectedResolvedThroughPatternIndex,
    (includeModeTransientState
      ? state.spawn.resolvedEntityIds
      : scoringResolvedIds).join(","),
    active,
    state.invulnerableUntilTick,
    state.ledger.recent.map((effect) => [
      effect.effectId,
      effect.scoreId,
      effect.before,
      effect.after,
      effect.actualDelta,
    ].join(":")).join(","),
  ].join("|");
}

function forcedContinuationScoringResolvedThrough(
  course: RunnerLabGeneratedCourse,
  resolvedEntityIds: readonly string[],
): number {
  const resolved = new Set(resolvedEntityIds);
  let through = 0;
  for (const pattern of course.patterns) {
    if (!pattern.entities.every((entity) => resolved.has(entity.instanceId))) {
      break;
    }
    through = pattern.patternIndex;
  }
  return through;
}

/**
 * Fast production-authenticated continuation used by the exhaustive Semantic
 * reload matrix. It starts from a save-valid pattern boundary, applies one
 * caller-selected lane target, then uses the same private neutral-policy and
 * one-tick collision/settlement path as the full replay.
 */
export function evaluateRunnerForcedContinuation(
  checkpoint: RunStateV1,
  forcedPatternIndex: number,
  forcedTargetLane: Lane,
): RunnerForcedContinuationReplay {
  if (
    checkpoint.controlMode !== "manual" &&
    checkpoint.controlMode !== "semantic-assist"
  ) {
    fail("forced continuation supports only Manual and Semantic checkpoints");
  }
  const controlMode = checkpoint.controlMode;
  const authenticated = continuationContextAndState(checkpoint);
  const { context } = authenticated;
  const course = assertContext(context);
  let state = authenticated.state;
  const forcedPattern = course.patterns[forcedPatternIndex - 1];
  if (
    forcedPattern === undefined ||
    forcedPattern.patternIndex !== state.spawn.patternIndex ||
    forcedPattern.spawnTick !== state.simulationTick ||
    !RUNNER_LANES.includes(forcedTargetLane)
  ) {
    fail("forced continuation pattern or target does not match the checkpoint");
  }
  const recorder: ReplayRecorder = {
    context,
    nextProductionEventOrdinal: 0,
    contacts: [],
    effects: [],
    passes: [],
    invulnerabilityWitnesses: [],
    maximumLiveEntities: Object.freeze({
      count: state.activeEntities.length,
      firstWitnessTick: state.simulationTick,
      entityInstanceIds: Object.freeze(state.activeEntities.map((entity) =>
        entity.instanceId)),
    }),
    replayClosure: createReplayClosure(),
  };
  let decisionPatternIndex = forcedPatternIndex;
  let forcedDecisionPending = true;
  let queuedIntent: LaneDirection | null = null;
  const scoringEntityIds = new Set(course.patterns.flatMap((pattern) =>
    pattern.entities.map((entity) => entity.instanceId)));
  const checkpointResolvedIds = new Set(state.spawn.resolvedEntityIds);
  const futureScoringEntityIds = Object.freeze(course.patterns.flatMap(
    (pattern) => pattern.entities.map((entity) => entity.instanceId),
  ).filter((instanceId) => !checkpointResolvedIds.has(instanceId)));
  const continuationStartTick = state.simulationTick;
  const exactTickSignatures: string[] = [];
  const gameplayTickSignatures: string[] = [];

  while (state.simulationTick < RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks) {
    let laneIntent: LaneIntent = null;
    let bufferAfterStep: LaneDirection | null = null;
    const pattern = course.patterns[decisionPatternIndex - 1];
    if (
      pattern !== undefined &&
      state.simulationTick === pattern.spawnTick &&
      state.spawn.patternIndex === pattern.patternIndex
    ) {
      if (state.motion.kind !== "idle" || state.inputBuffer !== null || queuedIntent !== null) {
        fail("forced continuation reached a non-idle decision boundary");
      }
      const decision = forcedDecisionPending
        ? projectNeutralLane(context, state, pattern, forcedTargetLane)
        : evaluateNeutralTarget(context, state, pattern);
      laneIntent = decision.firstIntent;
      if (controlMode === "manual") {
        queuedIntent = decision.bufferedIntent;
      } else {
        state = commitAssistDecisionMarker(context, state, pattern, recorder);
        bufferAfterStep = decision.bufferedIntent;
      }
      forcedDecisionPending = false;
      decisionPatternIndex += 1;
    } else if (queuedIntent !== null) {
      laneIntent = queuedIntent;
      queuedIntent = null;
    }
    state = advanceOneTick(
      context,
      state,
      laneIntent,
      recorder,
      bufferAfterStep,
    ).state;
    exactTickSignatures.push(forcedContinuationTickSignature(
      state,
      scoringEntityIds,
      true,
      state.inputBuffer,
      state.spawn.resolvedThroughPatternIndex,
    ));
    gameplayTickSignatures.push(forcedContinuationTickSignature(
      state,
      scoringEntityIds,
      false,
      state.inputBuffer ?? queuedIntent,
      forcedContinuationScoringResolvedThrough(
        course,
        state.spawn.resolvedEntityIds,
      ),
    ));
  }

  if (
    forcedDecisionPending ||
    decisionPatternIndex !== course.patterns.length + 1 ||
    queuedIntent !== null ||
    state.activeEntities.length !== 0
  ) {
    fail("forced continuation did not exhaust its authentic course suffix");
  }
  const activeTerminal = materializeActiveState(context, state);
  const pending = beginLabSettlement(activeTerminal, null);
  const completed = applyLabSettlement(pending, null);
  const replay = deepFreeze({
    replayId: "runner-forced-continuation-replay-v1" as const,
    controlMode,
    runSeed: checkpoint.runSeed,
    difficulty: checkpoint.difficulty,
    startingProfileId: checkpoint.startingProfileId,
    forcedPatternIndex,
    forcedTargetLane,
    contacts: recorder.contacts,
    effects: recorder.effects,
    tickProgression: {
      startSimulationTick: continuationStartTick,
      endSimulationTick: RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks,
      ordinaryTickCount:
        RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks - continuationStartTick,
      stateHashDigest: fnv1a64Hex([
        checkpoint.runId,
        controlMode,
        checkpoint.startingProfileId,
        ...exactTickSignatures,
      ].join("\n")),
      gameplayHashDigest: fnv1a64Hex(gameplayTickSignatures.join("\n")),
    },
    terminalMotion: activeTerminal.runner!.motion,
    terminalInputBuffer: activeTerminal.runner!.inputBuffer,
    futureScoringEntityIds,
    terminalScores: { ...completed.scores },
    completedState: completed,
    completedStateHash: stateHashV1(completed),
    completionFactIds: completed.storyState.facts.map(({ factId }) => factId),
    completionMemoryIds: completed.storyState.memories.map(({ memoryId }) =>
      memoryId),
  } satisfies RunnerForcedContinuationReplay);
  AUTHENTIC_FORCED_CONTINUATION_REPLAYS.add(replay);
  return replay;
}

export function isAuthenticRunnerForcedContinuationReplay(
  value: unknown,
): value is RunnerForcedContinuationReplay {
  return typeof value === "object" && value !== null &&
    AUTHENTIC_FORCED_CONTINUATION_REPLAYS.has(value) &&
    isDeeplyFrozen(value);
}


/**
 * Runs the exact neutral policy for an exact canonical entry in any locked
 * control mode. Targets and Automatic scores never cross the public API: the
 * module privately reconstructs and authenticates the Manual oracle.
 */
export function evaluateRunnerNeutralReplay(
  entryState: RunStateV1,
): RunnerNeutralReplayTape {
  if (entryState.controlMode !== "automatic-assist") {
    const tape = evaluateRunnerNeutralReplayInternal(entryState, null);
    if (entryState.controlMode === "manual") {
      lastManualOracle = Object.freeze({
        key: canonical(entryState),
        tape,
      });
    }
    return tape;
  }
  const manualEntry = exactManualEntry(entryState);
  const manualKey = canonical(manualEntry);
  const manualTape = lastManualOracle?.key === manualKey
    ? lastManualOracle.tape
    : evaluateRunnerNeutralReplayInternal(manualEntry, null);
  if (!isAuthenticRunnerNeutralReplayTape(manualTape)) {
    fail("private Manual oracle replay is not authentic");
  }
  lastManualOracle = Object.freeze({ key: manualKey, tape: manualTape });
  return evaluateRunnerNeutralReplayInternal(entryState, manualTape);
}

export function isAuthenticRunnerNeutralReplayTape(
  value: unknown,
): value is RunnerNeutralReplayTape {
  return typeof value === "object" &&
    value !== null &&
    AUTHENTIC_REPLAY_TAPES.has(value) &&
    isDeeplyFrozen(value);
}

/** @internal Re-runs the executed continuation closure through mutation seams. */
export function verifyRunnerReplayContinuationClosureForTest(
  tape: RunnerNeutralReplayTape,
  mutationProbe?: RunnerReplayContinuationMutationProbe,
): boolean {
  if (!isAuthenticRunnerNeutralReplayTape(tape)) return false;
  const input = REPLAY_CLOSURE_VERIFICATION_INPUTS.get(tape);
  if (input === undefined) return false;
  try {
    const summary = replayClosureSummary(input, mutationProbe);
    return summary.failureCount === 0 &&
      summary.continuationCertificateCount === summary.checkedBoundaryCount;
  } catch {
    return false;
  }
}
