import {
  applyScoreDelta,
  createCoreScores,
  type CoreScores,
  type ScoreId,
} from "../score-model";
import { getEncounterDefinition } from "./catalog";
import type {
  EncounterAppliedEffect,
  EncounterCatalog,
  EncounterClockContext,
  EncounterDefinition,
  EncounterEngineAction,
  EncounterEngineState,
  EncounterFact,
  EncounterMemory,
  EncounterOptionDefinition,
  EncounterOutcomeDefinition,
  EncounterRecoveryHook,
  EncounterRecoveryPolicy,
  EncounterRelationship,
  EncounterResolution,
  EncounterSafeCorridorStatus,
  EncounterScheduleRequest,
  EncounterStoryLogEntry,
  EncounterTransaction,
  ScheduledEncounterCallback,
} from "./types";

export const DEFAULT_ENCOUNTER_RECOVERY_POLICY: EncounterRecoveryPolicy =
  Object.freeze({ triggerAtOrBelow: 0, recoverTo: 10 });

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function immutableState(state: EncounterEngineState): EncounterEngineState {
  return Object.freeze({
    ...state,
    scores: Object.freeze({ ...state.scores }),
    transactions: freezeArray(state.transactions),
    callbacks: freezeArray(state.callbacks),
    effects: freezeArray(state.effects),
    facts: freezeArray(state.facts),
    memories: freezeArray(state.memories),
    relationships: freezeArray(state.relationships),
    storyLog: freezeArray(state.storyLog),
    recoveryHooks: freezeArray(state.recoveryHooks),
  });
}

function assertTick(tick: number, name = "simulation tick"): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function transactionIndex(
  state: EncounterEngineState,
  transactionId: string,
): number {
  return state.transactions.findIndex(
    (transaction) => transaction.transactionId === transactionId,
  );
}

function transactionById(
  state: EncounterEngineState,
  transactionId: string,
): EncounterTransaction {
  const transaction = state.transactions.find(
    (candidate) => candidate.transactionId === transactionId,
  );
  if (transaction === undefined) {
    throw new RangeError(`Unknown encounter transaction: ${transactionId}`);
  }
  return transaction;
}

function replaceTransaction(
  state: EncounterEngineState,
  transaction: EncounterTransaction,
): EncounterEngineState {
  const index = transactionIndex(state, transaction.transactionId);
  if (index < 0) throw new RangeError("Encounter transaction is missing");
  const transactions = [...state.transactions];
  transactions[index] = Object.freeze(transaction);
  return immutableState({ ...state, transactions });
}

function makeLogEntry(
  state: EncounterEngineState,
  context: EncounterClockContext,
  kind: EncounterStoryLogEntry["kind"],
  text: string,
  originTransactionId: string,
): EncounterStoryLogEntry {
  return Object.freeze({
    entryId: `${originTransactionId}:log:${kind}:${state.storyLog.length}`,
    stageId: context.stageId,
    simulationTick: context.simulationTick,
    kind,
    text,
    originTransactionId,
  });
}

function appendLog(
  state: EncounterEngineState,
  context: EncounterClockContext,
  kind: EncounterStoryLogEntry["kind"],
  text: string,
  originTransactionId: string,
): EncounterEngineState {
  return immutableState({
    ...state,
    storyLog: [
      ...state.storyLog,
      makeLogEntry(state, context, kind, text, originTransactionId),
    ],
  });
}

export function createEncounterEngineState(
  scores: CoreScores,
): EncounterEngineState {
  return immutableState({
    schemaVersion: 1,
    contentVersion: "encounter-engine-v1",
    scores: createCoreScores(scores),
    transactions: [],
    callbacks: [],
    effects: [],
    facts: [],
    memories: [],
    relationships: [],
    storyLog: [],
    recoveryHooks: [],
  });
}

export function scheduleEncounter(
  state: EncounterEngineState,
  catalog: EncounterCatalog,
  request: EncounterScheduleRequest,
): EncounterEngineState {
  assertTick(request.opensAtTick, "corridor opening tick");
  const definition = getEncounterDefinition(catalog, request.encounterId);
  const closesAtTick =
    request.closesAtTick ?? request.opensAtTick + definition.safeCorridorTicks;
  assertTick(closesAtTick, "corridor closing tick");
  if (closesAtTick < request.opensAtTick) {
    throw new RangeError("Encounter corridor cannot close before it opens");
  }

  const existing = state.transactions.find(
    (candidate) => candidate.transactionId === request.transactionId,
  );
  if (existing !== undefined) {
    const sameRequest =
      existing.encounterId === request.encounterId &&
      existing.corridor.stageId === request.stageId &&
      existing.corridor.opensAtTick === request.opensAtTick &&
      existing.corridor.closesAtTick === closesAtTick;
    if (sameRequest) return state;
    throw new Error(`Transaction ID already used: ${request.transactionId}`);
  }

  const transaction: EncounterTransaction = Object.freeze({
    transactionId: request.transactionId,
    encounterId: definition.encounterId,
    importance: definition.importance,
    status: "scheduled",
    corridor: Object.freeze({
      stageId: request.stageId,
      opensAtTick: request.opensAtTick,
      closesAtTick,
    }),
    optionIds: Object.freeze(
      definition.options.map((option) => option.optionId),
    ),
    selectedOptionId: null,
    presentedTick: null,
    terminalTick: null,
    resolution: null,
    supersededByTransactionId: null,
    statusText:
      definition.importance === "mandatory"
        ? "A required life choice is scheduled."
        : "An optional life moment is scheduled.",
  });
  return immutableState({
    ...state,
    transactions: [...state.transactions, transaction],
  });
}

function presentTransaction(
  state: EncounterEngineState,
  definition: EncounterDefinition,
  transaction: EncounterTransaction,
  context: EncounterClockContext,
): EncounterEngineState {
  const presented = Object.freeze({
    ...transaction,
    status: "presenting" as const,
    presentedTick: context.simulationTick,
    statusText:
      definition.importance === "mandatory"
        ? "Required choice — the world is paused safely."
        : "Optional choice — choose or continue your journey.",
  });
  return appendLog(
    replaceTransaction(state, presented),
    context,
    "encounter-presented",
    definition.title,
    transaction.transactionId,
  );
}

export function supersedeEncounter(
  state: EncounterEngineState,
  transactionId: string,
  supersededByTransactionId: string,
  context: EncounterClockContext,
): EncounterEngineState {
  assertTick(context.simulationTick);
  if (transactionId === supersededByTransactionId) {
    throw new Error("An encounter cannot supersede itself");
  }
  const transaction = transactionById(state, transactionId);
  if (transaction.status === "superseded") {
    if (transaction.supersededByTransactionId === supersededByTransactionId) {
      return state;
    }
    throw new Error("Encounter was already superseded by another transaction");
  }
  if (
    transaction.status === "resolved" ||
    transaction.status === "skipped" ||
    transaction.status === "expired"
  ) {
    return state;
  }
  const superseded = Object.freeze({
    ...transaction,
    status: "superseded" as const,
    terminalTick: context.simulationTick,
    supersededByTransactionId,
    statusText: `Superseded by ${supersededByTransactionId}.`,
  });
  return appendLog(
    replaceTransaction(state, superseded),
    context,
    "encounter-superseded",
    superseded.statusText,
    transactionId,
  );
}

function expireOptionalEncounters(
  state: EncounterEngineState,
  context: EncounterClockContext,
): EncounterEngineState {
  let next = state;
  const expiring = state.transactions.filter(
    (transaction) =>
      transaction.importance === "optional" &&
      transaction.corridor.stageId === context.stageId &&
      context.simulationTick > transaction.corridor.closesAtTick &&
      (transaction.status === "scheduled" ||
        transaction.status === "presenting"),
  );
  for (const transaction of expiring) {
    const expired = Object.freeze({
      ...transaction,
      status: "expired" as const,
      terminalTick: context.simulationTick,
      statusText: "This optional moment passed, and the journey continued.",
    });
    next = appendLog(
      replaceTransaction(next, expired),
      context,
      "encounter-expired",
      expired.statusText,
      transaction.transactionId,
    );
  }
  return next;
}

function dueScheduledTransactions(
  state: EncounterEngineState,
  context: EncounterClockContext,
): readonly EncounterTransaction[] {
  return state.transactions
    .filter(
      (transaction) =>
        transaction.status === "scheduled" &&
        transaction.corridor.stageId === context.stageId &&
        transaction.corridor.opensAtTick <= context.simulationTick,
    )
    .sort((left, right) => {
      if (left.importance !== right.importance) {
        return left.importance === "mandatory" ? -1 : 1;
      }
      if (left.corridor.opensAtTick !== right.corridor.opensAtTick) {
        return left.corridor.opensAtTick - right.corridor.opensAtTick;
      }
      return left.transactionId.localeCompare(right.transactionId);
    });
}

export function advanceEncounterEngine(
  state: EncounterEngineState,
  catalog: EncounterCatalog,
  context: EncounterClockContext,
  recoveryPolicy = DEFAULT_ENCOUNTER_RECOVERY_POLICY,
): EncounterEngineState {
  assertTick(context.simulationTick);
  let next = expireOptionalEncounters(state, context);
  next = resolveDueEncounterCallbacks(next, context, recoveryPolicy);

  const candidates = dueScheduledTransactions(next, context);
  const candidate = candidates[0];
  if (candidate === undefined) return next;
  const presenting = next.transactions.find(
    (transaction) => transaction.status === "presenting",
  );
  if (presenting !== undefined) {
    if (
      presenting.importance === "optional" &&
      candidate.importance === "mandatory"
    ) {
      next = supersedeEncounter(
        next,
        presenting.transactionId,
        candidate.transactionId,
        context,
      );
    } else {
      return next;
    }
  }
  return presentTransaction(
    next,
    getEncounterDefinition(catalog, candidate.encounterId),
    transactionById(next, candidate.transactionId),
    context,
  );
}

interface OutcomeResult {
  readonly state: EncounterEngineState;
  readonly effectIds: readonly string[];
  readonly factIds: readonly string[];
  readonly memoryIds: readonly string[];
  readonly relationshipIds: readonly string[];
}

function upsertRelationship(
  relationships: readonly EncounterRelationship[],
  change: NonNullable<EncounterOutcomeDefinition["relationships"]>[number],
  originTransactionId: string,
): readonly EncounterRelationship[] {
  const index = relationships.findIndex(
    (relationship) => relationship.relationshipId === change.relationshipId,
  );
  if (index < 0) {
    return [
      ...relationships,
      Object.freeze({
        relationshipId: change.relationshipId,
        personId: change.personId,
        kind: change.kind,
        closeness: Math.max(0, Math.min(100, change.closenessDelta)),
        status: change.status ?? "active",
        lastChangedByTransactionId: originTransactionId,
      }),
    ];
  }
  const current = relationships[index];
  if (current === undefined) return relationships;
  const updated: EncounterRelationship = Object.freeze({
    ...current,
    closeness: Math.max(
      0,
      Math.min(100, current.closeness + change.closenessDelta),
    ),
    status: change.status ?? current.status,
    lastChangedByTransactionId: originTransactionId,
  });
  const next = [...relationships];
  next[index] = updated;
  return next;
}

function maybeOfferRecovery(
  state: EncounterEngineState,
  source: "choice" | "callback",
  originTransactionId: string,
  originOptionId: string | null,
  preTriggerScores: CoreScores,
  context: EncounterClockContext,
  policy: EncounterRecoveryPolicy,
): EncounterEngineState {
  const scoreIds = (["health", "happiness", "money"] as const).filter(
    (scoreId) => state.scores[scoreId] <= policy.triggerAtOrBelow,
  );
  if (scoreIds.length === 0) return state;
  const recoveryId = `${originTransactionId}:recovery`;
  if (
    state.recoveryHooks.some((recovery) => recovery.recoveryId === recoveryId)
  ) {
    return state;
  }
  const hook: EncounterRecoveryHook = Object.freeze({
    recoveryId,
    status: "offered",
    triggerScoreIds: Object.freeze(scoreIds),
    triggerSource: source,
    originTransactionId,
    originOptionId,
    stageId: context.stageId,
    offeredTick: context.simulationTick,
    resolvedTick: null,
    scoreTarget: policy.recoverTo,
    preTriggerScores: Object.freeze({ ...preTriggerScores }),
    postTriggerScores: Object.freeze({ ...state.scores }),
    appliedEffectIds: Object.freeze([]),
  });
  return appendLog(
    immutableState({
      ...state,
      recoveryHooks: [...state.recoveryHooks, hook],
    }),
    context,
    "recovery-offered",
    "Support is available before the journey continues.",
    originTransactionId,
  );
}

function applyOutcome(
  state: EncounterEngineState,
  outcome: EncounterOutcomeDefinition,
  source: "choice" | "callback",
  originTransactionId: string,
  originOptionId: string | null,
  context: EncounterClockContext,
  recoveryPolicy: EncounterRecoveryPolicy,
): OutcomeResult {
  let scores = state.scores;
  const preTriggerScores = scores;
  const effects = [...state.effects];
  const effectIds: string[] = [];
  for (const [index, effect] of (outcome.effects ?? []).entries()) {
    const change = applyScoreDelta(
      scores,
      effect.scoreId,
      effect.requestedDelta,
    );
    const effectId = `${originTransactionId}:effect:${source}:${index}`;
    effects.push(
      Object.freeze({
        effectId,
        source,
        categoryId: effect.categoryId,
        scoreId: effect.scoreId,
        requestedDelta: effect.requestedDelta,
        actualDelta: change.actualDelta,
        before: change.before,
        after: change.after,
        originTransactionId,
        originOptionId,
        simulationTick: context.simulationTick,
      }),
    );
    effectIds.push(effectId);
    scores = change.scores;
  }

  const factIds: string[] = [];
  const facts = [...state.facts];
  for (const fact of outcome.facts ?? []) {
    const entry: EncounterFact = Object.freeze({
      ...fact,
      stageId: context.stageId,
      originTransactionId,
      originOptionId: originOptionId ?? "callback-v1",
    });
    facts.push(entry);
    factIds.push(entry.factId);
  }

  const memoryIds: string[] = [];
  const memories = [...state.memories];
  for (const memory of outcome.memories ?? []) {
    const entry: EncounterMemory = Object.freeze({
      ...memory,
      stageId: context.stageId,
      originTransactionId,
      originOptionId: originOptionId ?? "callback-v1",
    });
    memories.push(entry);
    memoryIds.push(entry.memoryId);
  }

  const relationshipIds: string[] = [];
  let relationships = state.relationships;
  for (const relationship of outcome.relationships ?? []) {
    relationships = upsertRelationship(
      relationships,
      relationship,
      originTransactionId,
    );
    relationshipIds.push(relationship.relationshipId);
  }

  let next = immutableState({
    ...state,
    scores,
    effects,
    facts,
    memories,
    relationships,
  });
  next = maybeOfferRecovery(
    next,
    source,
    originTransactionId,
    originOptionId,
    preTriggerScores,
    context,
    recoveryPolicy,
  );
  return Object.freeze({
    state: next,
    effectIds: Object.freeze(effectIds),
    factIds: Object.freeze(factIds),
    memoryIds: Object.freeze(memoryIds),
    relationshipIds: Object.freeze(relationshipIds),
  });
}

function scheduleOptionCallbacks(
  state: EncounterEngineState,
  transaction: EncounterTransaction,
  option: EncounterOptionDefinition,
  context: EncounterClockContext,
): Readonly<{
  state: EncounterEngineState;
  callbackTransactionIds: readonly string[];
}> {
  const callbacks = [...state.callbacks];
  const callbackTransactionIds: string[] = [];
  for (const callback of option.callbacks ?? []) {
    const transactionId = `${transaction.transactionId}:callback:${callback.callbackId}`;
    if (
      callbacks.some((candidate) => candidate.transactionId === transactionId)
    ) {
      callbackTransactionIds.push(transactionId);
      continue;
    }
    callbacks.push(
      Object.freeze({
        transactionId,
        callbackId: callback.callbackId,
        status: "scheduled",
        label: callback.label,
        dueStageId: callback.dueStageId ?? context.stageId,
        dueTick: context.simulationTick + callback.delayTicks,
        originTransactionId: transaction.transactionId,
        originOptionId: option.optionId,
        outcome: Object.freeze({
          effects: Object.freeze([...(callback.effects ?? [])]),
          facts: Object.freeze([...(callback.facts ?? [])]),
          memories: Object.freeze([...(callback.memories ?? [])]),
          relationships: Object.freeze([...(callback.relationships ?? [])]),
          storyText: callback.storyText,
        }),
        resolvedTick: null,
        supersededByTransactionId: null,
      }),
    );
    callbackTransactionIds.push(transactionId);
  }
  return Object.freeze({
    state: immutableState({ ...state, callbacks }),
    callbackTransactionIds: Object.freeze(callbackTransactionIds),
  });
}

export function resolveEncounter(
  state: EncounterEngineState,
  catalog: EncounterCatalog,
  transactionId: string,
  optionId: string,
  context: EncounterClockContext,
  recoveryPolicy = DEFAULT_ENCOUNTER_RECOVERY_POLICY,
): EncounterEngineState {
  assertTick(context.simulationTick);
  const transaction = transactionById(state, transactionId);
  if (transaction.status === "resolved") {
    if (transaction.selectedOptionId === optionId) return state;
    throw new Error("Encounter already resolved with another option");
  }
  if (transaction.status !== "presenting") {
    throw new Error("Encounter is not currently presenting");
  }
  const definition = getEncounterDefinition(catalog, transaction.encounterId);
  const option = definition.options.find(
    (candidate) => candidate.optionId === optionId,
  );
  if (option === undefined) {
    throw new RangeError(`Unknown option ${optionId} for ${definition.encounterId}`);
  }

  const outcome = applyOutcome(
    state,
    option,
    "choice",
    transactionId,
    optionId,
    context,
    recoveryPolicy,
  );
  const scheduled = scheduleOptionCallbacks(
    outcome.state,
    transaction,
    option,
    context,
  );
  const resolution: EncounterResolution = Object.freeze({
    resolutionId: `${transactionId}:resolution`,
    selectedOptionId: optionId,
    appliedEffectIds: outcome.effectIds,
    factIds: outcome.factIds,
    memoryIds: outcome.memoryIds,
    relationshipIds: outcome.relationshipIds,
    scheduledCallbackIds: scheduled.callbackTransactionIds,
    reactionText: option.reactionText,
    resolvedTick: context.simulationTick,
  });
  const resolved: EncounterTransaction = Object.freeze({
    ...transaction,
    status: "resolved",
    selectedOptionId: optionId,
    terminalTick: context.simulationTick,
    resolution,
    statusText: option.reactionText,
  });
  let next = replaceTransaction(scheduled.state, resolved);
  next = appendLog(
    next,
    context,
    "choice-resolved",
    option.storyText ?? option.reactionText,
    transactionId,
  );
  return next;
}

export function skipOptionalEncounter(
  state: EncounterEngineState,
  transactionId: string,
  context: EncounterClockContext,
): EncounterEngineState {
  assertTick(context.simulationTick);
  const transaction = transactionById(state, transactionId);
  if (transaction.status === "skipped") return state;
  if (transaction.importance === "mandatory") {
    throw new Error("Mandatory encounters cannot be skipped");
  }
  if (
    transaction.status !== "scheduled" &&
    transaction.status !== "presenting"
  ) {
    throw new Error("Optional encounter is no longer available");
  }
  const skipped: EncounterTransaction = Object.freeze({
    ...transaction,
    status: "skipped",
    terminalTick: context.simulationTick,
    statusText: "You let this optional moment pass.",
  });
  return appendLog(
    replaceTransaction(state, skipped),
    context,
    "encounter-skipped",
    skipped.statusText,
    transactionId,
  );
}

export function resolveDueEncounterCallbacks(
  state: EncounterEngineState,
  context: EncounterClockContext,
  recoveryPolicy = DEFAULT_ENCOUNTER_RECOVERY_POLICY,
): EncounterEngineState {
  assertTick(context.simulationTick);
  let next = state;
  const due = state.callbacks
    .filter(
      (callback) =>
        callback.status === "scheduled" &&
        callback.dueStageId === context.stageId &&
        callback.dueTick <= context.simulationTick,
    )
    .sort((left, right) =>
      left.dueTick !== right.dueTick
        ? left.dueTick - right.dueTick
        : left.transactionId.localeCompare(right.transactionId),
    );

  for (const callback of due) {
    const current = next.callbacks.find(
      (candidate) => candidate.transactionId === callback.transactionId,
    );
    if (current?.status !== "scheduled") continue;
    const outcome = applyOutcome(
      next,
      callback.outcome,
      "callback",
      callback.transactionId,
      callback.originOptionId,
      context,
      recoveryPolicy,
    );
    const callbacks = outcome.state.callbacks.map((candidate) =>
      candidate.transactionId === callback.transactionId
        ? Object.freeze({
            ...candidate,
            status: "resolved" as const,
            resolvedTick: context.simulationTick,
          })
        : candidate,
    );
    next = immutableState({ ...outcome.state, callbacks });
    next = appendLog(
      next,
      context,
      "callback-resolved",
      callback.outcome.storyText ?? callback.label,
      callback.transactionId,
    );
  }
  return next;
}

export function supersedeEncounterCallback(
  state: EncounterEngineState,
  callbackTransactionId: string,
  supersededByTransactionId: string,
  context: EncounterClockContext,
): EncounterEngineState {
  const callback = state.callbacks.find(
    (candidate) => candidate.transactionId === callbackTransactionId,
  );
  if (callback === undefined) {
    throw new RangeError(`Unknown callback transaction: ${callbackTransactionId}`);
  }
  if (callback.status === "superseded") {
    if (callback.supersededByTransactionId === supersededByTransactionId) {
      return state;
    }
    throw new Error("Callback was already superseded by another transaction");
  }
  if (callback.status === "resolved") return state;
  const callbacks = state.callbacks.map((candidate) =>
    candidate.transactionId === callbackTransactionId
      ? Object.freeze({
          ...candidate,
          status: "superseded" as const,
          resolvedTick: context.simulationTick,
          supersededByTransactionId,
        })
      : candidate,
  );
  return immutableState({ ...state, callbacks });
}

function recoveryById(
  state: EncounterEngineState,
  recoveryId: string,
): EncounterRecoveryHook {
  const recovery = state.recoveryHooks.find(
    (candidate) => candidate.recoveryId === recoveryId,
  );
  if (recovery === undefined) {
    throw new RangeError(`Unknown recovery hook: ${recoveryId}`);
  }
  return recovery;
}

export function acceptEncounterRecovery(
  state: EncounterEngineState,
  recoveryId: string,
  context: EncounterClockContext,
): EncounterEngineState {
  assertTick(context.simulationTick);
  const recovery = recoveryById(state, recoveryId);
  if (recovery.status === "accepted") return state;
  if (recovery.status !== "offered") {
    throw new Error("Recovery offer is no longer available");
  }
  let scores = state.scores;
  const effects = [...state.effects];
  const appliedEffectIds: string[] = [];
  for (const [index, scoreId] of recovery.triggerScoreIds.entries()) {
    const requestedDelta = Math.max(0, recovery.scoreTarget - scores[scoreId]);
    const change = applyScoreDelta(scores, scoreId, requestedDelta);
    const effectId = `${recoveryId}:effect:recovery:${index}`;
    const effect: EncounterAppliedEffect = Object.freeze({
      effectId,
      source: "recovery",
      categoryId: "bounded-recovery-v1",
      scoreId,
      requestedDelta,
      actualDelta: change.actualDelta,
      before: change.before,
      after: change.after,
      originTransactionId: recovery.originTransactionId,
      originOptionId: recovery.originOptionId,
      simulationTick: context.simulationTick,
    });
    effects.push(effect);
    appliedEffectIds.push(effectId);
    scores = change.scores;
  }
  const recoveryHooks = state.recoveryHooks.map((candidate) =>
    candidate.recoveryId === recoveryId
      ? Object.freeze({
          ...candidate,
          status: "accepted" as const,
          resolvedTick: context.simulationTick,
          appliedEffectIds: Object.freeze(appliedEffectIds),
        })
      : candidate,
  );
  return appendLog(
    immutableState({ ...state, scores, effects, recoveryHooks }),
    context,
    "recovery-resolved",
    "Support helped the journey return to a stable path.",
    recovery.originTransactionId,
  );
}

export function dismissEncounterRecovery(
  state: EncounterEngineState,
  recoveryId: string,
  context: EncounterClockContext,
): EncounterEngineState {
  assertTick(context.simulationTick);
  const recovery = recoveryById(state, recoveryId);
  if (recovery.status === "dismissed") return state;
  if (recovery.status !== "offered") {
    throw new Error("Recovery offer is no longer available");
  }
  const recoveryHooks = state.recoveryHooks.map((candidate) =>
    candidate.recoveryId === recoveryId
      ? Object.freeze({
          ...candidate,
          status: "dismissed" as const,
          resolvedTick: context.simulationTick,
        })
      : candidate,
  );
  return appendLog(
    immutableState({ ...state, recoveryHooks }),
    context,
    "recovery-resolved",
    "You chose to continue without the recovery support.",
    recovery.originTransactionId,
  );
}

export function getPresentingEncounter(
  state: EncounterEngineState,
  catalog: EncounterCatalog,
): Readonly<{
  transaction: EncounterTransaction;
  definition: EncounterDefinition;
}> | null {
  const transaction = state.transactions.find(
    (candidate) => candidate.status === "presenting",
  );
  if (transaction === undefined) return null;
  return Object.freeze({
    transaction,
    definition: getEncounterDefinition(catalog, transaction.encounterId),
  });
}

export function getEncounterSafeCorridorStatus(
  state: EncounterEngineState,
): EncounterSafeCorridorStatus {
  const transaction = state.transactions.find(
    (candidate) => candidate.status === "presenting",
  );
  if (transaction === undefined) {
    return Object.freeze({
      active: false,
      shouldPauseWorld: false,
      transactionId: null,
      importance: null,
      statusText: null,
    });
  }
  return Object.freeze({
    active: true,
    shouldPauseWorld: true,
    transactionId: transaction.transactionId,
    importance: transaction.importance,
    statusText: transaction.statusText,
  });
}

export function canLeaveEncounterStage(
  state: EncounterEngineState,
  stageId: string,
): boolean {
  return !state.transactions.some(
    (transaction) =>
      transaction.importance === "mandatory" &&
      transaction.corridor.stageId === stageId &&
      (transaction.status === "scheduled" ||
        transaction.status === "presenting"),
  );
}

export function reduceEncounterEngine(
  state: EncounterEngineState,
  catalog: EncounterCatalog,
  action: EncounterEngineAction,
  recoveryPolicy = DEFAULT_ENCOUNTER_RECOVERY_POLICY,
): EncounterEngineState {
  switch (action.type) {
    case "schedule":
      return scheduleEncounter(state, catalog, action.request);
    case "advance":
      return advanceEncounterEngine(
        state,
        catalog,
        action.context,
        recoveryPolicy,
      );
    case "resolve":
      return resolveEncounter(
        state,
        catalog,
        action.transactionId,
        action.optionId,
        action.context,
        recoveryPolicy,
      );
    case "skip":
      return skipOptionalEncounter(
        state,
        action.transactionId,
        action.context,
      );
    case "accept-recovery":
      return acceptEncounterRecovery(
        state,
        action.recoveryId,
        action.context,
      );
    case "dismiss-recovery":
      return dismissEncounterRecovery(
        state,
        action.recoveryId,
        action.context,
      );
  }
}

export function encounterScore(
  state: EncounterEngineState,
  scoreId: ScoreId,
): number {
  return state.scores[scoreId];
}
