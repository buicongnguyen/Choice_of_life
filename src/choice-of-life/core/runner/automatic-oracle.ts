import {
  canonicalizeJson,
  fnv1a64Hex,
  type CanonicalJsonValue,
} from "../canonical-json";
import { deepFreeze, isDeeplyFrozen as isDeepFrozen } from "../immutable";
import {
  deriveRunIdFromStateV1,
  initialRunSetupFromStateV1,
  retainedRunIdentityTokenV1,
} from "../run-factory";
import { stateHashV1 } from "../run-state-hash";
import type {
  AppliedEffect,
  CoreScores,
  Lane,
  RunnerMotion,
  RunStateV1,
  ScoreId,
  StartingProfileId,
} from "../run-state";
import { SCORE_IDS, STARTING_PROFILE_SCORES } from "../run-state";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_STAGE_ID,
} from "./contract";
import {
  compileNeutralLaneTarget,
  evaluateRunnerNeutralPolicy,
  RUNNER_NEUTRAL_POLICY_ID,
} from "./neutral-policy";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  startRunnerLaboratory,
  type RunnerIndependentPauseReason,
  type RunnerSimulationContext,
  type RunnerSimulationEvent,
  type RunnerSimulationResult,
  type RunnerSimulationStepInput,
} from "./simulation";
import {
  applyLabSettlement,
  beginLabSettlement,
} from "./settlement";
import type {
  RunnerAuthenticatedMarkerTransition,
  RunnerAuthenticatedModeProjection,
  RunnerModeCandidateDriver,
  RunnerModeCandidateExecution,
  RunnerModeCandidateMutationProbe,
  RunnerModeEvaluationSupport,
  RunnerNeutralReplayContact,
  RunnerNeutralReplayEffect,
  RunnerNeutralReplayPass,
  RunnerNeutralReplayTape,
} from "./evaluation-replay";
import {
  assertIndependentAutomaticCandidateEvaluation,
  deriveIndependentAutomaticOracleEvaluation,
  type IndependentAutomaticCandidateObservation,
  type IndependentAutomaticOracleEvaluation,
} from "./independent-automatic-oracle";
import {
  hasAuthenticRunnerModeEvaluationSupport,
  hasAuthenticRunnerModeProjection,
} from "./evaluation-authentication";

export const RUNNER_AUTOMATIC_ORACLE_ID =
  "runner-automatic-assist-neutral-v1";
export const RUNNER_AUTOMATIC_TRACE_VERSION =
  "runner-automatic-neutral-manual-trace-v1";
export const RUNNER_AUTOMATIC_AUTHENTICATED_PROJECTION_ID =
  "runner-automatic-authenticated-mode-projection-v1" as const;

export interface AutomaticOraclePatternTarget {
  readonly patternIndex: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: "up" | "down" | null;
  readonly bufferedIntent: "up" | "down" | null;
}

export interface AutomaticOracleContactProjection {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly simulationTick: number;
  readonly outcome:
    | "benefit-applied"
    | "hazard-applied"
    | "hazard-suppressed";
  readonly effectId: string | null;
  readonly scoreId: ScoreId | null;
  readonly requestedDelta: number | null;
  readonly actualDelta: number | null;
}

export interface AutomaticOracleEffectProjection {
  readonly effectId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly source: AppliedEffect["source"];
  readonly categoryId: string;
  readonly causedByChoiceId: string | null;
  readonly transactionId: string | null;
  readonly simulationTick: number;
}

export interface AutomaticOracleTrace {
  readonly traceVersion: typeof RUNNER_AUTOMATIC_TRACE_VERSION;
  readonly policyId: typeof RUNNER_AUTOMATIC_ORACLE_ID;
  readonly manualPolicyId: typeof RUNNER_NEUTRAL_POLICY_ID;
  readonly runSeed: string;
  readonly difficulty: RunStateV1["difficulty"];
  readonly startingProfileId: StartingProfileId;
  readonly retainedIdentityToken: string;
  readonly manualRunId: string;
  readonly stageEntryStateHash: string;
  readonly patternTargets: readonly AutomaticOraclePatternTarget[];
  readonly contacts: readonly AutomaticOracleContactProjection[];
  readonly effects: readonly AutomaticOracleEffectProjection[];
  readonly terminalScores: CoreScores;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: "up" | "down" | null;
  readonly terminalResolvedEntityIds: readonly string[];
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
  readonly manualPendingStateHash: string;
  readonly manualCompletedStateHash: string;
}

/**
 * Evaluator-only result produced by exercising the public Automatic wrappers
 * at Start, every decision marker, and both settlement boundaries.
 */
export interface RunnerAutomaticAuthenticatedProjection {
  readonly projectionId: typeof RUNNER_AUTOMATIC_AUTHENTICATED_PROJECTION_ID;
  readonly canonicalEntryHash: string;
  readonly controlMode: "automatic-assist";
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
  readonly terminalInputBuffer: "up" | "down" | null;
  readonly terminalResolvedEntityIds: readonly string[];
  readonly pendingState: RunStateV1;
  readonly pendingStateHash: string;
  readonly completedState: RunStateV1;
  readonly completedStateHash: string;
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
  readonly settlementEffectIds: readonly string[];
  readonly rawLaneInputCount: 0;
  readonly semanticChoiceCount: 0;
  readonly automaticDecisionCount: 10;
  readonly settlementBeginCount: 1;
  readonly settlementApplyCount: 1;
}

/** @internal Negative-test seam; evidence evaluation never supplies it. */
export interface AutomaticEvaluationMutationProbe {
  readonly terminalScores?: (scores: CoreScores) => CoreScores;
  readonly contacts?: (
    contacts: readonly AutomaticOracleContactProjection[],
  ) => readonly AutomaticOracleContactProjection[];
  readonly candidate?: RunnerModeCandidateMutationProbe;
  /**
   * @internal Simulates a common-mode shared-plan/contact observation defect.
   * The locked independent oracle is intentionally not passed to this seam.
   */
  readonly commonModeCandidateObservation?: (
    observation: IndependentAutomaticCandidateObservation,
  ) => IndependentAutomaticCandidateObservation;
}

const AUTHENTIC_AUTOMATIC_ORACLE_TRACES = new WeakSet<object>();
const SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES = new WeakSet<object>();
const AUTHENTIC_AUTOMATIC_MODE_PROJECTIONS = new WeakSet<object>();
const SPARSE_EVALUATION_AUTOMATIC_SUPPORTS = new WeakMap<object, Readonly<{
  support: RunnerModeEvaluationSupport;
  execution: RunnerModeCandidateExecution;
  expectedPending: RunStateV1;
  expectedCompleted: RunStateV1;
}>>();

interface AutomaticOracleCheckpointTape {
  readonly entryStateHash: string;
  readonly startedStateHash: string;
  /** Index is the exact active simulation tick; tick zero is the started state. */
  readonly activeStateHashes: readonly string[];
  readonly terminalTransientStateHash: string;
  readonly pendingStateHash: string;
  readonly completedStateHash: string;
}

const AUTOMATIC_ORACLE_CHECKPOINT_TAPES = new WeakMap<
  object,
  AutomaticOracleCheckpointTape
>();

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner automatic oracle: ${message}`);
  }
  throw new TypeError();
}

function canonical(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function automaticCheckpointHash(state: RunStateV1): string {
  if (
    state.runner !== null &&
    typeof state.runner.userPaused !== "boolean"
  ) {
    fail("runner user-pause flag must be boolean");
  }
  if (
    state.runner === null ||
    !state.runner.userPaused ||
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.simulationTick > 2999 ||
    state.runner.spawn.resolvedEntityIds.length === 0
  ) {
    return stateHashV1(state);
  }
  // User pause is the only persisted gameplay toggle that may legitimately
  // differ from the deterministic replay at an otherwise exact checkpoint.
  return stateHashV1(deepFreeze({
    ...state,
    runner: {
      ...state.runner,
      userPaused: false,
    },
  }));
}

function expectedRunId(
  state: RunStateV1,
  controlMode: "manual" | "automatic-assist",
): string {
  return deriveRunIdFromStateV1(state, controlMode);
}

function assertAutomaticIdentity(state: RunStateV1): void {
  if (!isDeepFrozen(state)) fail("live Automatic state must be deeply immutable");
  if (state.controlMode !== "automatic-assist") {
    fail("wrapper accepts Automatic Assist states only");
  }
  if (
    state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
    (state.runStatus !== "active" && state.runStatus !== "completed")
  ) {
    fail("wrapper accepts runner laboratory states only");
  }
  if (state.runId !== expectedRunId(state, "automatic-assist")) {
    fail("live Automatic run ID does not match retained identity");
  }
}

function manualEntryFromAutomatic(state: RunStateV1): RunStateV1 {
  assertAutomaticIdentity(state);
  const manualEntry = createRunnerLaboratoryEntryState(
    state.runSeed,
    initialRunSetupFromStateV1(state, "manual"),
  );
  const manualRunId = expectedRunId(state, "manual");
  if (
    manualEntry.controlMode !== "manual" ||
    manualEntry.runId !== manualRunId
  ) {
    fail("Manual oracle entry reconstruction changed run identity");
  }
  return manualEntry;
}

function automaticEntryFromState(state: RunStateV1): RunStateV1 {
  const automaticEntry = createRunnerLaboratoryEntryState(
    state.runSeed,
    initialRunSetupFromStateV1(state, "automatic-assist"),
  );
  if (automaticEntry.runId !== expectedRunId(state, "automatic-assist")) {
    fail("Automatic replay entry reconstruction changed run identity");
  }
  return automaticEntry;
}

function contactProjection(
  event: Extract<RunnerSimulationEvent, { type: "contact-resolved" }>,
): AutomaticOracleContactProjection {
  const contact = event.contact;
  if (contact.outcome === "automatic-pass" ||
      contact.outcome === "non-scoring-resolved" ||
      contact.outcome === "already-resolved") {
    fail("Manual oracle emitted a nonauthoritative contact outcome");
  }
  return deepFreeze({
    entityInstanceId: contact.entityInstanceId,
    contentId: contact.contentId,
    simulationTick: contact.simulationTick,
    outcome: contact.outcome,
    effectId: contact.effect?.effectId ?? null,
    scoreId: contact.effect?.scoreId ?? null,
    requestedDelta: contact.effect?.requestedDelta ?? null,
    actualDelta: contact.effect?.actualDelta ?? null,
  });
}

function effectProjection(effect: AppliedEffect): AutomaticOracleEffectProjection {
  return deepFreeze({
    effectId: effect.effectId,
    scoreId: effect.scoreId,
    requestedDelta: effect.requestedDelta,
    actualDelta: effect.actualDelta,
    before: effect.before,
    after: effect.after,
    source: effect.source,
    categoryId: effect.categoryId,
    causedByChoiceId: effect.causedByChoiceId,
    transactionId: effect.transactionId,
    simulationTick: effect.simulationTick,
  });
}

function manualNeutralTrace(state: RunStateV1): Omit<
  AutomaticOracleTrace,
  | "traceVersion"
  | "policyId"
  | "manualPolicyId"
  | "runSeed"
  | "difficulty"
  | "startingProfileId"
  | "retainedIdentityToken"
  | "manualRunId"
  | "stageEntryStateHash"
> {
  const context = createRunnerSimulationContext(
    state.runSeed,
    state.difficulty,
  );
  let current = startRunnerLaboratory(context, state).state;
  const patternTargets: AutomaticOraclePatternTarget[] = [];
  const contacts: AutomaticOracleContactProjection[] = [];
  let queuedIntent: "up" | "down" | null = null;

  while (current.stage.phase === "active") {
    const runner = current.runner;
    if (runner === null) fail("Manual oracle lost runner before settlement");
    let laneIntent: "up" | "down" | null = null;
    const nextPattern = context.course.patterns[patternTargets.length];
    if (
      nextPattern !== undefined &&
      current.simulationTick === nextPattern.spawnTick &&
      runner.spawn.patternIndex === nextPattern.patternIndex
    ) {
      if (
        queuedIntent !== null ||
        runner.motion.kind !== "idle" ||
        runner.inputBuffer !== null
      ) {
        fail("Manual neutral policy reached a non-idle append checkpoint");
      }
      const decision = evaluateRunnerNeutralPolicy(current, nextPattern);
      const compilation = compileNeutralLaneTarget(
        decision.sourceLane,
        decision.chosenTargetLane,
      );
      patternTargets.push(deepFreeze({
        patternIndex: nextPattern.patternIndex,
        sourceLane: decision.sourceLane,
        targetLane: decision.chosenTargetLane,
        firstIntent: compilation.firstIntent,
        bufferedIntent: compilation.bufferedIntent,
      }));
      laneIntent = compilation.firstIntent;
      queuedIntent = compilation.bufferedIntent;
    } else if (queuedIntent !== null) {
      laneIntent = queuedIntent;
      queuedIntent = null;
    }

    const result = advanceRunnerLaboratory(context, current, { laneIntent });
    if (!result.stateChanged || result.tickDelta !== 1) {
      fail("Manual neutral trace failed to advance exactly one ordinary tick");
    }
    for (const event of result.events) {
      if (event.type === "contact-resolved") {
        contacts.push(contactProjection(event));
      }
    }
    current = result.state;
  }

  if (
    current.stage.phase !== "settling" ||
    current.stage.settlement?.status !== "pending" ||
    current.simulationTick !== 3000 ||
    current.runner === null ||
    patternTargets.length !== context.course.patterns.length
  ) {
    fail("Manual neutral trace did not stop at the durable pending boundary");
  }
  const terminalScores = deepFreeze({ ...current.scores });
  const startingScores = STARTING_PROFILE_SCORES[current.startingProfileId];
  if (SCORE_IDS.every((scoreId) =>
    terminalScores[scoreId] === startingScores[scoreId])) {
    fail("Manual neutral trace must reserve at least one Automatic delta");
  }
  const completed = applyLabSettlement(current, null);
  return deepFreeze({
    patternTargets,
    contacts,
    effects: current.effectLedger.recent.map(effectProjection),
    terminalScores,
    terminalMotion: current.runner.motion,
    terminalInputBuffer: current.runner.inputBuffer,
    terminalResolvedEntityIds: [...current.runner.spawn.resolvedEntityIds],
    completionFactIds: completed.storyState.facts.map((fact) => fact.factId),
    completionMemoryIds: completed.storyState.memories.map((memory) =>
      memory.memoryId),
    manualPendingStateHash: stateHashV1(current),
    manualCompletedStateHash: stateHashV1(completed),
  });
}

/** Rebuilds the exact neutral Manual oracle from retained Automatic identity. */
export function createAutomaticOracleTrace(
  liveAutomaticState: RunStateV1,
): AutomaticOracleTrace {
  const manualEntry = manualEntryFromAutomatic(liveAutomaticState);
  const stageEntryStateHash = stateHashV1(manualEntry);
  const trace = deepFreeze({
    traceVersion:
      RUNNER_AUTOMATIC_TRACE_VERSION as typeof RUNNER_AUTOMATIC_TRACE_VERSION,
    policyId: RUNNER_AUTOMATIC_ORACLE_ID as typeof RUNNER_AUTOMATIC_ORACLE_ID,
    manualPolicyId: RUNNER_NEUTRAL_POLICY_ID as typeof RUNNER_NEUTRAL_POLICY_ID,
    runSeed: liveAutomaticState.runSeed,
    difficulty: liveAutomaticState.difficulty,
    startingProfileId: liveAutomaticState.startingProfileId,
    retainedIdentityToken: retainedRunIdentityTokenV1(liveAutomaticState),
    manualRunId: manualEntry.runId,
    stageEntryStateHash,
    ...manualNeutralTrace(manualEntry),
  });
  const tape = buildAutomaticCheckpointTape(
    automaticEntryFromState(liveAutomaticState),
    trace,
  );
  AUTHENTIC_AUTOMATIC_ORACLE_TRACES.add(trace);
  AUTOMATIC_ORACLE_CHECKPOINT_TAPES.set(trace, tape);
  assertTraceForState(trace, liveAutomaticState);
  return trace;
}

export function isAuthenticAutomaticOracleTrace(
  value: unknown,
): value is AutomaticOracleTrace {
  return typeof value === "object" &&
    value !== null &&
    AUTHENTIC_AUTOMATIC_ORACLE_TRACES.has(value) &&
    isDeepFrozen(value);
}

function assertTraceForState(
  trace: AutomaticOracleTrace,
  state: RunStateV1,
): void {
  assertAutomaticIdentity(state);
  if (!isAuthenticAutomaticOracleTrace(trace)) {
    fail("trace identity is not authentic");
  }
  if (
    trace.traceVersion !== RUNNER_AUTOMATIC_TRACE_VERSION ||
    trace.policyId !== RUNNER_AUTOMATIC_ORACLE_ID ||
    trace.manualPolicyId !== RUNNER_NEUTRAL_POLICY_ID ||
    trace.runSeed !== state.runSeed ||
    trace.difficulty !== state.difficulty ||
    trace.startingProfileId !== state.startingProfileId ||
    trace.retainedIdentityToken !== retainedRunIdentityTokenV1(state) ||
    trace.manualRunId !== expectedRunId(state, "manual") ||
    trace.patternTargets.length !== 10
  ) {
    fail("trace does not match live Automatic run identity");
  }
  const tape = AUTOMATIC_ORACLE_CHECKPOINT_TAPES.get(trace);
  if (tape === undefined) fail("trace lacks its private checkpoint tape");
  const actualHash = automaticCheckpointHash(state);
  const expectedHashes = expectedAutomaticCheckpointHashes(
    state,
    tape,
    SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES.has(trace),
  );
  if (!expectedHashes.includes(actualHash)) {
    fail("live Automatic checkpoint differs from the canonical oracle replay");
  }
}

function automaticTargetInput(
  targetLane: Lane,
): NonNullable<RunnerSimulationStepInput["automaticTarget"]> {
  // This is the sole production bridge into simulation's opaque target seam.
  return Object.freeze({ targetLane }) as NonNullable<
    RunnerSimulationStepInput["automaticTarget"]
  >;
}

function automaticScoresInput(
  scores: CoreScores,
): NonNullable<RunnerSimulationStepInput["automaticScores"]> {
  // This is the sole production bridge into simulation's opaque score seam.
  return deepFreeze({ scores: { ...scores } }) as NonNullable<
    RunnerSimulationStepInput["automaticScores"]
  >;
}

function expectedAutomaticCheckpointHashes(
  state: RunStateV1,
  tape: AutomaticOracleCheckpointTape,
  sparseEvaluationTrace = false,
): readonly string[] {
  if (
    state.runStatus === "completed" &&
    state.stage.phase === "complete"
  ) {
    return [tape.completedStateHash];
  }
  if (
    state.runStatus === "active" &&
    state.stage.phase === "settling"
  ) {
    return [tape.pendingStateHash];
  }
  if (
    state.runStatus !== "active" ||
    state.stage.phase !== "active"
  ) {
    return [];
  }
  if (state.simulationTick === 0) {
    return [tape.entryStateHash, tape.startedStateHash];
  }
  if (state.simulationTick === 3000) {
    return [tape.terminalTransientStateHash];
  }
  const activeHash = tape.activeStateHashes[state.simulationTick];
  // An evaluator trace is intentionally unusable as an ordinary session
  // oracle. Only its ten populated decision checkpoints are capabilities.
  if (sparseEvaluationTrace && activeHash === undefined) return [];
  return activeHash === undefined ? [] : [activeHash];
}

function terminalTransientFromPending(
  pending: RunStateV1,
  context: RunnerSimulationContext,
): RunStateV1 {
  if (
    pending.runStatus !== "active" ||
    pending.stage.phase !== "settling" ||
    pending.runner === null
  ) {
    fail("Automatic replay did not produce a pending terminal checkpoint");
  }
  const resolvedEntityIds = pending.runner.spawn.resolvedEntityIds
    .filter((entityId) => entityId !== context.course.finishMarker.instanceId);
  return deepFreeze({
    ...pending,
    stage: {
      ...pending.stage,
      phase: "active" as const,
      settlement: null,
    },
    runner: {
      ...pending.runner,
      spawn: {
        ...pending.runner.spawn,
        ...context.course.terminalCursor,
        resolvedThroughPatternIndex: context.course.patterns.length,
        resolvedEntityIds,
      },
    },
  });
}

function buildAutomaticCheckpointTape(
  automaticEntry: RunStateV1,
  trace: AutomaticOracleTrace,
): AutomaticOracleCheckpointTape {
  const context = createRunnerSimulationContext(
    automaticEntry.runSeed,
    automaticEntry.difficulty,
  );
  const entryStateHash = automaticCheckpointHash(automaticEntry);
  let current = startRunnerLaboratory(context, automaticEntry).state;
  const startedStateHash = automaticCheckpointHash(current);
  const activeStateHashes: string[] = [startedStateHash];

  while (current.stage.phase === "active") {
    const patternIndex = currentPendingPatternIndex(current);
    let targetLane: Lane | null = null;
    if (patternIndex !== null) {
      const target = trace.patternTargets[patternIndex - 1];
      if (target === undefined || target.patternIndex !== patternIndex) {
        fail("Automatic replay trace lacks a pending pattern target");
      }
      targetLane = target.targetLane;
    }
    const terminal = current.simulationTick === 2999;
    const result = advanceRunnerLaboratory(context, current, {
      laneIntent: null,
      automaticTarget: targetLane === null
        ? null
        : automaticTargetInput(targetLane),
      automaticScores: terminal
        ? automaticScoresInput(trace.terminalScores)
        : null,
    });
    if (!result.stateChanged || result.tickDelta !== 1) {
      fail(`Automatic canonical replay stalled at tick ${current.simulationTick}`);
    }
    current = result.state;
    if (current.stage.phase === "active") {
      if (current.simulationTick !== activeStateHashes.length) {
        fail("Automatic canonical replay skipped an active checkpoint");
      }
      activeStateHashes.push(automaticCheckpointHash(current));
    }
  }

  if (
    current.runStatus !== "active" ||
    current.stage.phase !== "settling" ||
    current.stage.settlement?.status !== "pending" ||
    current.simulationTick !== 3000 ||
    activeStateHashes.length !== 3000
  ) {
    fail("Automatic canonical replay missed the durable pending checkpoint");
  }
  const terminalTransient = terminalTransientFromPending(current, context);
  const reproducedPending = beginLabSettlement(
    terminalTransient,
    trace.terminalScores,
  );
  if (canonical(reproducedPending) !== canonical(current)) {
    fail("Automatic terminal transient does not reproduce the pending checkpoint");
  }
  const completed = applyLabSettlement(current, trace.terminalScores);
  return deepFreeze({
    entryStateHash,
    startedStateHash,
    activeStateHashes,
    terminalTransientStateHash: automaticCheckpointHash(terminalTransient),
    pendingStateHash: automaticCheckpointHash(current),
    completedStateHash: automaticCheckpointHash(completed),
  });
}

function currentPendingPatternIndex(state: RunStateV1): number | null {
  const runner = state.runner;
  if (runner === null) return null;
  const markers = runner.activeEntities.filter((entity) =>
    entity.kind === "opportunity" &&
    entity.contentId === "runner-lab-decision-marker-v1" &&
    !runner.spawn.resolvedEntityIds.includes(entity.instanceId));
  if (markers.length > 1) fail("live Automatic state has multiple pending markers");
  return markers[0]?.patternIndex ?? null;
}

/** Starts only an identity-matched Automatic run; the trace is never returned. */
export function startAutomaticRunnerLaboratory(
  context: RunnerSimulationContext,
  state: RunStateV1,
  trace: AutomaticOracleTrace,
  independentPauseReasons: readonly RunnerIndependentPauseReason[] = [],
): RunnerSimulationResult {
  assertTraceForState(trace, state);
  if (
    SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES.has(trace) &&
    state.runner?.spawn.resolvedEntityIds.includes(
      context.course.startMarker.instanceId,
    )
  ) {
    fail("sparse evaluation trace accepts Start only at the entry boundary");
  }
  return startRunnerLaboratory(context, state, independentPauseReasons);
}

/**
 * Supplies the exact target at a pending marker and the exact terminal scores
 * at tick 2999. No caller can provide lane input or score magnitudes.
 */
export function advanceAutomaticRunnerLaboratory(
  context: RunnerSimulationContext,
  state: RunStateV1,
  trace: AutomaticOracleTrace,
  independentPauseReasons: readonly RunnerIndependentPauseReason[] = [],
): RunnerSimulationResult {
  assertTraceForState(trace, state);
  const patternIndex = currentPendingPatternIndex(state);
  if (
    SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES.has(trace) &&
    patternIndex === null
  ) {
    fail("sparse evaluation trace accepts only decision-marker advancement");
  }
  let targetLane: Lane | null = null;
  if (patternIndex !== null) {
    const target = trace.patternTargets[patternIndex - 1];
    if (target === undefined || target.patternIndex !== patternIndex) {
      fail("trace lacks the live pending pattern target");
    }
    targetLane = target.targetLane;
  }
  const terminal = state.simulationTick === 2999;
  return advanceRunnerLaboratory(context, state, {
    laneIntent: null,
    independentPauseReasons,
    automaticTarget: targetLane === null
      ? null
      : automaticTargetInput(targetLane),
    automaticScores: terminal
      ? automaticScoresInput(trace.terminalScores)
      : null,
  });
}

/** Creates the pending Automatic settlement from an exact transient tick-3000 state. */
export function beginAutomaticLabSettlement(
  state: RunStateV1,
  trace: AutomaticOracleTrace,
): RunStateV1 {
  assertTraceForState(trace, state);
  return beginLabSettlement(state, trace.terminalScores);
}

/** Applies one exact identity-matched Automatic settlement. */
export function applyAutomaticLabSettlement(
  state: RunStateV1,
  trace: AutomaticOracleTrace,
): RunStateV1 {
  assertTraceForState(trace, state);
  return applyLabSettlement(state, trace.terminalScores);
}

/** Reload path: recompute the nonpersisted trace, then apply its exact scores. */
export function applyAutomaticLabSettlementAfterReload(
  state: RunStateV1,
): RunStateV1 {
  const trace = createAutomaticOracleTrace(state);
  return applyAutomaticLabSettlement(state, trace);
}

function evaluationContactProjection(
  contact: RunnerNeutralReplayContact["contact"],
): AutomaticOracleContactProjection {
  if (
    contact.outcome === "automatic-pass" ||
    contact.outcome === "non-scoring-resolved" ||
    contact.outcome === "already-resolved"
  ) {
    fail("evaluation Manual oracle contains a nonauthoritative contact outcome");
  }
  return deepFreeze({
    entityInstanceId: contact.entityInstanceId,
    contentId: contact.contentId,
    simulationTick: contact.simulationTick,
    outcome: contact.outcome,
    effectId: contact.effect?.effectId ?? null,
    scoreId: contact.effect?.scoreId ?? null,
    requestedDelta: contact.effect?.requestedDelta ?? null,
    actualDelta: contact.effect?.actualDelta ?? null,
  });
}

function independentManualTerminalStates(
  automaticEntry: RunStateV1,
  execution: RunnerModeCandidateExecution,
  oracle: IndependentAutomaticOracleEvaluation,
  context: RunnerSimulationContext,
): Readonly<{ pending: RunStateV1; completed: RunStateV1 }> {
  const manualEntry = manualEntryFromAutomatic(automaticEntry);
  const automaticPreFinish = execution.preFinishState;
  if (automaticPreFinish.runner === null || manualEntry.runner === null) {
    fail("independent Manual terminal reconstruction lost runner state");
  }
  const manualPreFinish = deepFreeze({
    ...manualEntry,
    runStatus: automaticPreFinish.runStatus,
    controlMode: "manual" as const,
    scores: oracle.terminalScores,
    effectLedger: oracle.terminalLedger,
    stage: automaticPreFinish.stage,
    runner: {
      ...automaticPreFinish.runner,
      invulnerableUntilTick: oracle.terminalInvulnerableUntilTick,
    },
    recovery: automaticPreFinish.recovery,
    encounter: automaticPreFinish.encounter,
    simulationTick: automaticPreFinish.simulationTick,
  } satisfies RunStateV1);
  const terminal = advanceRunnerLaboratory(context, manualPreFinish, {
    laneIntent: null,
  });
  if (
    !terminal.stateChanged || terminal.tickDelta !== 1 ||
    terminal.state.stage.phase !== "settling"
  ) {
    fail("independent Manual oracle failed its production finish tick");
  }
  const completed = applyLabSettlement(terminal.state, null);
  return deepFreeze({ pending: terminal.state, completed });
}

function authenticateManualProjectionComparator(
  automaticEntry: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  manualProjection: RunnerAuthenticatedModeProjection,
  oracle: IndependentAutomaticOracleEvaluation,
  manualTerminal: Readonly<{ pending: RunStateV1; completed: RunStateV1 }>,
): void {
  const manualEntry = manualEntryFromAutomatic(automaticEntry);
  if (
    !hasAuthenticRunnerModeProjection(manualProjection) ||
    !Object.isFrozen(manualProjection) ||
    manualProjection.controlMode !== "manual" ||
    manualProjection.runSeed !== automaticEntry.runSeed ||
    manualProjection.difficulty !== automaticEntry.difficulty ||
    manualProjection.startingProfileId !== automaticEntry.startingProfileId ||
    manualProjection.canonicalEntryHash !== fnv1a64Hex(canonical(manualEntry)) ||
    manualProjection.markerTransitions.length !== structuralTape.targets.length
  ) {
    fail("sparse Automatic trace lacks its exact authenticated Manual projection");
  }
  for (const [index, transition] of manualProjection.markerTransitions.entries()) {
    const target = structuralTape.targets[index];
    if (
      target === undefined ||
      transition.patternIndex !== target.patternIndex ||
      transition.simulationTick !== target.simulationTick ||
      transition.sourceLane !== target.sourceLane ||
      transition.targetLane !== target.targetLane ||
      transition.firstIntent !== target.firstIntent ||
      transition.bufferedIntent !== target.bufferedIntent
    ) {
      fail("Manual projection marker differs from the structural replay target");
    }
  }
  const comparatorContacts = manualProjection.contacts.map(({ contact }) =>
    evaluationContactProjection(contact));
  const comparatorEffects = manualProjection.effects.map(({ effect }) =>
    effectProjection(effect));
  const checks = {
    contacts: canonical(comparatorContacts) === canonical(oracle.contacts),
    effects: canonical(comparatorEffects) === canonical(oracle.effects),
    scores: canonical(manualProjection.terminalScores) ===
      canonical(oracle.terminalScores),
    motion: canonical(manualProjection.terminalMotion) ===
      canonical(oracle.terminalMotion),
    buffer: manualProjection.terminalInputBuffer === oracle.terminalInputBuffer,
    pending: manualProjection.pendingStateHash ===
      stateHashV1(manualTerminal.pending),
    completed: manualProjection.completedStateHash ===
      stateHashV1(manualTerminal.completed),
  };
  if (
    !Object.values(checks).every(Boolean)
  ) {
    fail(
      "Manual comparator differs from the independently derived Automatic " +
        `oracle (${JSON.stringify(checks)}, pendingParts=${JSON.stringify({
          stage: canonical(manualProjection.pendingState.stage) ===
            canonical(manualTerminal.pending.stage),
          runner: canonical(manualProjection.pendingState.runner) ===
            canonical(manualTerminal.pending.runner),
          scores: canonical(manualProjection.pendingState.scores) ===
            canonical(manualTerminal.pending.scores),
          ledger: canonical(manualProjection.pendingState.effectLedger) ===
            canonical(manualTerminal.pending.effectLedger),
          envelope: manualProjection.pendingState.runId ===
              manualTerminal.pending.runId &&
            manualProjection.pendingState.controlMode ===
              manualTerminal.pending.controlMode,
        })})`,
    );
  }
}

function buildSparseEvaluationTrace(
  automaticEntry: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  oracle: IndependentAutomaticOracleEvaluation,
  manualTerminal: Readonly<{ pending: RunStateV1; completed: RunStateV1 }>,
  execution: RunnerModeCandidateExecution,
): {
  readonly trace: AutomaticOracleTrace;
  readonly expectedPending: RunStateV1;
  readonly expectedCompleted: RunStateV1;
} {
  const manualEntry = manualEntryFromAutomatic(automaticEntry);
  const trace = deepFreeze({
    traceVersion:
      RUNNER_AUTOMATIC_TRACE_VERSION as typeof RUNNER_AUTOMATIC_TRACE_VERSION,
    policyId: RUNNER_AUTOMATIC_ORACLE_ID as typeof RUNNER_AUTOMATIC_ORACLE_ID,
    manualPolicyId: RUNNER_NEUTRAL_POLICY_ID as typeof RUNNER_NEUTRAL_POLICY_ID,
    runSeed: automaticEntry.runSeed,
    difficulty: automaticEntry.difficulty,
    startingProfileId: automaticEntry.startingProfileId,
    retainedIdentityToken: retainedRunIdentityTokenV1(automaticEntry),
    manualRunId: manualEntry.runId,
    stageEntryStateHash: stateHashV1(manualEntry),
    patternTargets: structuralTape.targets.map((target) => deepFreeze({
      patternIndex: target.patternIndex,
      sourceLane: target.sourceLane,
      targetLane: target.targetLane,
      firstIntent: target.firstIntent,
      bufferedIntent: target.bufferedIntent,
    })),
    contacts: [...oracle.contacts],
    effects: [...oracle.effects],
    terminalScores: { ...oracle.terminalScores },
    terminalMotion: oracle.terminalMotion,
    terminalInputBuffer: oracle.terminalInputBuffer,
    terminalResolvedEntityIds: [
      ...(manualTerminal.pending.runner?.spawn.resolvedEntityIds ?? []),
    ],
    completionFactIds: manualTerminal.completed.storyState.facts.map(
      ({ factId }) => factId,
    ),
    completionMemoryIds: manualTerminal.completed.storyState.memories.map(
      ({ memoryId }) => memoryId,
    ),
    manualPendingStateHash: stateHashV1(manualTerminal.pending),
    manualCompletedStateHash: stateHashV1(manualTerminal.completed),
  } satisfies AutomaticOracleTrace);

  const expectedPending = execution.pendingState;
  const expectedCompleted = execution.completedState;
  const terminalTransientState = terminalTransientFromPending(
    expectedPending,
    createRunnerSimulationContext(
      automaticEntry.runSeed,
      automaticEntry.difficulty,
    ),
  );
  const activeStateHashes = new Array<string>(3000);
  activeStateHashes[0] = automaticCheckpointHash(execution.startedState);
  for (const checkpoint of execution.markerCheckpoints) {
    if (
      checkpoint.simulationTick <= 0 ||
      checkpoint.simulationTick >= activeStateHashes.length ||
      activeStateHashes[checkpoint.simulationTick] !== undefined
    ) {
      fail("sparse Automatic marker checkpoint timing is invalid or duplicated");
    }
    activeStateHashes[checkpoint.simulationTick] =
      automaticCheckpointHash(checkpoint);
  }
  const tape = deepFreeze({
    entryStateHash: automaticCheckpointHash(automaticEntry),
    startedStateHash: automaticCheckpointHash(execution.startedState),
    activeStateHashes,
    terminalTransientStateHash: automaticCheckpointHash(terminalTransientState),
    pendingStateHash: automaticCheckpointHash(expectedPending),
    completedStateHash: automaticCheckpointHash(expectedCompleted),
  } satisfies AutomaticOracleCheckpointTape);
  AUTHENTIC_AUTOMATIC_ORACLE_TRACES.add(trace);
  SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES.add(trace);
  AUTOMATIC_ORACLE_CHECKPOINT_TAPES.set(trace, tape);
  return { trace, expectedPending, expectedCompleted };
}

/**
 * Executes an exact Automatic tuple without replaying 3,000 interstitial
 * ticks. The private trace accepts only entry/Start, the ten authenticated
 * marker checkpoints, terminal transient, pending, and completed states.
 */
export function evaluateAutomaticAuthenticatedModeProjection(
  automaticEntry: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  manualProjection: RunnerAuthenticatedModeProjection,
  automaticSupport: RunnerModeEvaluationSupport,
  mutationProbe?: AutomaticEvaluationMutationProbe,
): RunnerAutomaticAuthenticatedProjection {
  const trace = createAutomaticEvaluationOracleTrace(
    automaticEntry,
    structuralTape,
    manualProjection,
    automaticSupport,
    mutationProbe,
  );
  const retained = SPARSE_EVALUATION_AUTOMATIC_SUPPORTS.get(trace);
  if (retained === undefined) {
    fail("sparse Automatic trace lost its private evaluation support");
  }
  const { support, execution } = retained;
  const built = retained;
  try {
    if (
      execution.markerTransitions.length !== 10 ||
      execution.startedState.runner === null ||
      execution.preFinishState.runner === null
    ) {
      fail("sparse Automatic projection lost its continuous candidate chain");
    }
    if (
      execution.contacts.length === 0 ||
      execution.contacts.some(({ contact }) =>
        contact.outcome !== "automatic-pass" || contact.effect !== null) ||
      execution.effects.length !== 0
    ) {
      fail("Automatic contact projection applied a scoring effect");
    }
    const pending = execution.pendingState;
    const completed = execution.completedState;
    const reapplied = applyAutomaticLabSettlement(completed, trace);
    if (
      canonical(pending) !== canonical(built.expectedPending) ||
      canonical(completed) !== canonical(built.expectedCompleted) ||
      canonical(reapplied) !== canonical(completed) ||
      canonical(completed.scores) !== canonical(manualProjection.terminalScores)
    ) {
      fail("sparse Automatic settlement differs or is not idempotent");
    }
    const projection = Object.freeze({
      projectionId: RUNNER_AUTOMATIC_AUTHENTICATED_PROJECTION_ID,
      canonicalEntryHash: support.canonicalEntryHash,
      controlMode: "automatic-assist" as const,
      runSeed: automaticEntry.runSeed,
      difficulty: automaticEntry.difficulty,
      startingProfileId: automaticEntry.startingProfileId,
      startEventCount: 1 as const,
      markerTransitions: execution.markerTransitions,
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
      rawLaneInputCount: 0 as const,
      semanticChoiceCount: 0 as const,
      automaticDecisionCount: 10 as const,
      settlementBeginCount: 1 as const,
      settlementApplyCount: 1 as const,
    } satisfies RunnerAutomaticAuthenticatedProjection);
    AUTHENTIC_AUTOMATIC_MODE_PROJECTIONS.add(projection);
    return projection;
  } catch (error) {
    AUTHENTIC_AUTOMATIC_ORACLE_TRACES.delete(trace);
    SPARSE_EVALUATION_AUTOMATIC_ORACLE_TRACES.delete(trace);
    AUTOMATIC_ORACLE_CHECKPOINT_TAPES.delete(trace);
    SPARSE_EVALUATION_AUTOMATIC_SUPPORTS.delete(trace);
    throw error;
  }
}

/** @internal Exact evaluator-only trace capability; ordinary ticks fail closed. */
export function createAutomaticEvaluationOracleTrace(
  automaticEntry: RunStateV1,
  structuralTape: RunnerNeutralReplayTape,
  manualProjection: RunnerAuthenticatedModeProjection,
  support: RunnerModeEvaluationSupport,
  mutationProbe?: AutomaticEvaluationMutationProbe,
): AutomaticOracleTrace {
  assertAutomaticIdentity(automaticEntry);
  if (
    !hasAuthenticRunnerModeEvaluationSupport(support) ||
    !Object.isFrozen(support) ||
    support.entryState !== automaticEntry ||
    support.structuralTape !== structuralTape ||
    support.canonicalEntryHash !== fnv1a64Hex(canonical(automaticEntry))
  ) {
    fail("sparse Automatic trace lacks its exact authenticated mode support");
  }
  const derivedOracle = deriveIndependentAutomaticOracleEvaluation(
    automaticEntry,
    support.context.course,
    structuralTape.targets,
  );
  const oracle = deepFreeze({
    ...derivedOracle,
    terminalScores: mutationProbe?.terminalScores?.(
      derivedOracle.terminalScores,
    ) ?? derivedOracle.terminalScores,
    contacts: mutationProbe?.contacts?.(derivedOracle.contacts) ??
      derivedOracle.contacts,
  } satisfies IndependentAutomaticOracleEvaluation);
  const automaticDriver: RunnerModeCandidateDriver = Object.freeze({
    start: (context: RunnerSimulationContext, state: RunStateV1) =>
      startRunnerLaboratory(context, state),
    marker: (
      context: RunnerSimulationContext,
      checkpoint: RunStateV1,
      target: RunnerNeutralReplayTape["targets"][number],
    ) => {
      const result = advanceRunnerLaboratory(context, checkpoint, {
        laneIntent: null,
        automaticTarget: automaticTargetInput(target.targetLane),
      });
      return Object.freeze({ first: result, committed: result });
    },
    finish: (context: RunnerSimulationContext, preFinishState: RunStateV1) =>
      advanceRunnerLaboratory(context, preFinishState, {
        laneIntent: null,
        automaticScores: automaticScoresInput(oracle.terminalScores),
      }),
    complete: (pendingState: RunStateV1) =>
      applyLabSettlement(pendingState, oracle.terminalScores),
  });
  const execution = support.executeCandidate(
    automaticDriver,
    mutationProbe?.candidate,
  );
  const canonicalObservation = deepFreeze({
    markerTransitions: execution.markerTransitions.map((transition) => ({
      patternIndex: transition.patternIndex,
      simulationTick: transition.simulationTick,
      sourceLane: transition.sourceLane,
      targetLane: transition.targetLane,
      firstIntent: transition.firstIntent,
      bufferedIntent: transition.bufferedIntent,
      motion: transition.motion,
      inputBuffer: transition.inputBuffer,
    })),
    contacts: execution.contacts.map(({ contact }) => contact),
    passes: execution.passes.map((pass) => ({
      entityInstanceId: pass.entityInstanceId,
      simulationTick: pass.simulationTick,
    })),
    preFinishState: execution.preFinishState,
    pendingState: execution.pendingState,
    completedState: execution.completedState,
  } satisfies IndependentAutomaticCandidateObservation);
  const comparedObservation =
    mutationProbe?.commonModeCandidateObservation?.(canonicalObservation) ??
    canonicalObservation;
  assertIndependentAutomaticCandidateEvaluation(
    automaticEntry,
    oracle,
    comparedObservation,
  );
  const manualTerminal = independentManualTerminalStates(
    automaticEntry,
    execution,
    oracle,
    support.context,
  );
  authenticateManualProjectionComparator(
    automaticEntry,
    structuralTape,
    manualProjection,
    oracle,
    manualTerminal,
  );
  const built = buildSparseEvaluationTrace(
    automaticEntry,
    structuralTape,
    oracle,
    manualTerminal,
    execution,
  );
  const { trace } = built;
  SPARSE_EVALUATION_AUTOMATIC_SUPPORTS.set(trace, deepFreeze({
    support,
    execution,
    expectedPending: built.expectedPending,
    expectedCompleted: built.expectedCompleted,
  }));
  return trace;
}

export function isAuthenticAutomaticModeProjection(
  value: unknown,
): value is RunnerAutomaticAuthenticatedProjection {
  return typeof value === "object" && value !== null &&
    AUTHENTIC_AUTOMATIC_MODE_PROJECTIONS.has(value) && Object.isFrozen(value);
}
