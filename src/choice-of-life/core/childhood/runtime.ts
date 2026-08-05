import { deepFreeze } from "../immutable";
import {
  applyScoreDelta,
  createCoreScores,
  type CoreScores,
} from "../score-model";
import {
  CHILDHOOD_CHOICE_CATALOG,
  CHILDHOOD_COMPANION_CATALOG,
  CHILDHOOD_FRIEND_CATALOG,
  CHILDHOOD_STAGE_BY_ID,
  CHILDHOOD_STAGE_DEFINITIONS,
} from "./content";
import type {
  ChildhoodAction,
  ChildhoodActiveChoice,
  ChildhoodCallback,
  ChildhoodChoiceDefinition,
  ChildhoodChoiceOption,
  ChildhoodChoiceRecord,
  ChildhoodCompanion,
  ChildhoodCompanionKind,
  ChildhoodEffectEntry,
  ChildhoodFriendIdentity,
  ChildhoodFriendRelationship,
  ChildhoodHandoff,
  ChildhoodInfluenceProfile,
  ChildhoodInfluenceSignalId,
  ChildhoodLaterStageId,
  ChildhoodMemory,
  ChildhoodScoreEffect,
  ChildhoodSetup,
  ChildhoodStageDefinition,
  ChildhoodStageId,
  ChildhoodStageProgress,
  ChildhoodStageSummary,
  ChildhoodState,
  ChildhoodStoryLogEntry,
} from "./types";

const DEFAULT_CHILDHOOD_SCORES: CoreScores = Object.freeze({
  health: 68,
  happiness: 64,
  money: 35,
});

const INFLUENCE_SIGNAL_IDS: readonly ChildhoodInfluenceSignalId[] =
  Object.freeze([
    "curiosity",
    "empathy",
    "creativity",
    "teamwork",
    "resilience",
    "independence",
    "patience",
    "confidence",
  ]);

function immutable<T>(value: T): T {
  return deepFreeze(value);
}

function seededNumber(seed: string, channel: string): number {
  let hash = 0x811c9dc5;
  const input = `${seed}:${channel}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return Math.imul(hash, 0x846ca68b) >>> 0;
}

function ageAtStageTick(
  definition: ChildhoodStageDefinition,
  tick: number,
): number {
  const boundedTick = Math.max(0, Math.min(definition.durationTicks, tick));
  const ageSpan = definition.endAgeMonths - definition.startAgeMonths;
  return (
    definition.startAgeMonths +
    Math.floor((ageSpan * boundedTick) / definition.durationTicks)
  );
}

function createStageProgress(
  definition: ChildhoodStageDefinition,
  stageIndex: number,
  entryScores: CoreScores,
): ChildhoodStageProgress {
  return Object.freeze({
    stageId: definition.stageId,
    stageIndex,
    activeTicks: 0,
    durationTicks: definition.durationTicks,
    ageMonths: definition.startAgeMonths,
    startAgeMonths: definition.startAgeMonths,
    endAgeMonths: definition.endAgeMonths,
    entryScores,
  });
}

function createFriendRoster(seed: string): readonly ChildhoodFriendRelationship[] {
  const heritageOffset = seededNumber(seed, "friend-heritage") % 2;
  const genderPattern = ["male", "female", "female", "male"] as const;
  return Object.freeze(
    CHILDHOOD_STAGE_DEFINITIONS.map((stage, stageIndex) => {
      const heritageStyleId =
        (stageIndex + heritageOffset) % 2 === 0 ? "asian" : "western";
      const gender = genderPattern[stageIndex];
      const candidates = CHILDHOOD_FRIEND_CATALOG.filter(
        (candidate) =>
          candidate.gender === gender &&
          candidate.appearance.heritageStyleId === heritageStyleId,
      );
      const person =
        candidates[
          seededNumber(seed, `friend:${stage.stageId}`) % candidates.length
        ]!;
      const identity: ChildhoodFriendIdentity = Object.freeze({
        ...person,
        introductionStageId: stage.stageId,
        ageMonthsAtIntroduction: ageAtStageTick(
          stage,
          stage.majorChoiceTick,
        ),
        sameStageAsPlayer: true as const,
      });
      return Object.freeze({
        person: identity,
        status: "awaiting-introduction" as const,
        closeness: 0,
        introducedAtTick: null,
        lastSharedMomentId: null,
      });
    }),
  );
}

function selectCompanion(
  seed: string,
  mode: ChildhoodSetup["companionMode"],
): ChildhoodCompanion | null {
  const resolvedMode = mode ?? "seeded";
  if (resolvedMode === "none") return null;
  let kind: ChildhoodCompanionKind;
  if (resolvedMode === "seeded") {
    const roll = seededNumber(seed, "companion-kind") % 4;
    if (roll === 0) return null;
    kind = roll === 1 ? "cat" : "dog";
  } else {
    kind = resolvedMode;
  }
  const candidates = CHILDHOOD_COMPANION_CATALOG.filter(
    (candidate) => candidate.kind === kind,
  );
  return candidates[seededNumber(seed, `companion:${kind}`) % candidates.length] ?? null;
}

function friendForStage(
  state: ChildhoodState,
  stageId: ChildhoodStageId,
): ChildhoodFriendRelationship {
  const friend = state.friends.find(
    (candidate) => candidate.person.introductionStageId === stageId,
  );
  if (friend === undefined) {
    throw new RangeError(`No childhood friend is assigned to ${stageId}`);
  }
  return friend;
}

function choiceForStage(stageId: ChildhoodStageId): ChildhoodChoiceDefinition {
  return CHILDHOOD_CHOICE_CATALOG[stageId];
}

function optionForChoice(
  choice: ChildhoodChoiceDefinition,
  optionId: string,
): ChildhoodChoiceOption {
  const option = choice.options.find(
    (candidate) => candidate.optionId === optionId,
  );
  if (option === undefined) {
    throw new RangeError(`Unknown option ${optionId} for ${choice.choiceId}`);
  }
  return option;
}

function updateFriend(
  state: ChildhoodState,
  personId: string,
  updater: (
    friend: ChildhoodFriendRelationship,
  ) => ChildhoodFriendRelationship,
): ChildhoodState {
  return immutable({
    ...state,
    friends: state.friends.map((friend) =>
      friend.person.personId === personId ? updater(friend) : friend,
    ),
  });
}

function appendStoryLog(
  state: ChildhoodState,
  entry: Omit<ChildhoodStoryLogEntry, "logId">,
): ChildhoodState {
  return immutable({
    ...state,
    storyLog: [
      ...state.storyLog,
      Object.freeze({
        ...entry,
        logId: `${state.runId}-childhood-log-${state.storyLog.length + 1}`,
      }),
    ],
  });
}

function introduceFriend(
  state: ChildhoodState,
  stageId: ChildhoodStageId,
): ChildhoodState {
  const relationship = friendForStage(state, stageId);
  if (relationship.status === "friend") return state;
  let next = updateFriend(state, relationship.person.personId, (friend) =>
    Object.freeze({
      ...friend,
      status: "friend" as const,
      introducedAtTick: state.simulationTick,
    }),
  );
  next = appendStoryLog(next, {
    stageId,
    kind: "friend-introduced",
    text: `${relationship.person.displayName} becomes part of this chapter.`,
    simulationTick: state.simulationTick,
  });
  return next;
}

function changeFriendCloseness(
  state: ChildhoodState,
  personId: string,
  delta: number,
  momentId: string,
): ChildhoodState {
  return updateFriend(state, personId, (friend) =>
    Object.freeze({
      ...friend,
      status: "friend" as const,
      closeness: Math.max(0, Math.min(100, friend.closeness + delta)),
      introducedAtTick: friend.introducedAtTick ?? state.simulationTick,
      lastSharedMomentId: momentId,
    }),
  );
}

function applyEffects(
  state: ChildhoodState,
  effects: readonly ChildhoodScoreEffect[],
  source: ChildhoodEffectEntry["source"],
  causedById: string,
  simulationTick: number,
): ChildhoodState {
  let scores = state.scores;
  const entries: ChildhoodEffectEntry[] = [];
  for (const [index, effect] of effects.entries()) {
    const change = applyScoreDelta(scores, effect.scoreId, effect.requestedDelta);
    scores = change.scores;
    entries.push(
      Object.freeze({
        effectId: `${state.runId}-childhood-effect-${state.effects.length + index + 1}`,
        source,
        scoreId: effect.scoreId,
        requestedDelta: effect.requestedDelta,
        actualDelta: change.actualDelta,
        before: change.before,
        after: change.after,
        causedById,
        simulationTick,
      }),
    );
  }
  return immutable({
    ...state,
    scores,
    effects: [...state.effects, ...entries],
  });
}

function resolveCallbacksForContext(
  state: ChildhoodState,
  stageId: ChildhoodLaterStageId,
  stageTick: number,
  simulationTick: number,
): ChildhoodState {
  let next = state;
  const due = state.callbacks
    .filter(
      (callback) =>
        callback.status === "scheduled" &&
        callback.dueStageId === stageId &&
        callback.dueStageTick <= stageTick,
    )
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));

  for (const callback of due) {
    next = applyEffects(
      next,
      callback.effects,
      "callback",
      callback.callbackId,
      simulationTick,
    );
    next = changeFriendCloseness(
      next,
      callback.friendPersonId,
      callback.relationshipDelta,
      callback.callbackId,
    );
    next = immutable({
      ...next,
      callbacks: next.callbacks.map((candidate) =>
        candidate.transactionId === callback.transactionId
          ? Object.freeze({
              ...candidate,
              status: "resolved" as const,
              resolvedAtSimulationTick: simulationTick,
            })
          : candidate,
      ),
    });
    next = appendStoryLog(next, {
      stageId,
      kind: "callback-resolved",
      text: callback.story,
      simulationTick,
    });
  }
  return next;
}

function hasResolvedStageChoice(
  state: ChildhoodState,
  stageId: ChildhoodStageId,
): boolean {
  return state.choices.some((record) => record.stageId === stageId);
}

function presentStageChoice(state: ChildhoodState): ChildhoodState {
  const choice = choiceForStage(state.stage.stageId);
  let next = introduceFriend(state, state.stage.stageId);
  const friend = friendForStage(next, state.stage.stageId);
  const transactionId = `${state.runId}:${choice.choiceId}`;
  const activeChoice: ChildhoodActiveChoice = Object.freeze({
    transactionId,
    choiceId: choice.choiceId,
    stageId: choice.stageId,
    friendPersonId: friend.person.personId,
    optionIds: Object.freeze([
      choice.options[0].optionId,
      choice.options[1].optionId,
      choice.options[2].optionId,
    ]) as readonly [string, string, string],
    presentedAtSimulationTick: next.simulationTick,
  });
  next = immutable({
    ...next,
    phase: "choice" as const,
    activeChoice,
  });
  return next;
}

function createStageSummary(state: ChildhoodState): ChildhoodStageSummary {
  const definition = CHILDHOOD_STAGE_BY_ID[state.stage.stageId];
  const choice = choiceForStage(state.stage.stageId);
  const record = state.choices.find(
    (candidate) => candidate.stageId === state.stage.stageId,
  );
  if (record === undefined) {
    throw new Error(`Cannot summarize ${state.stage.stageId} before its choice`);
  }
  const option = optionForChoice(choice, record.optionId);
  const friend = friendForStage(state, state.stage.stageId);
  const memoryIds = state.memories
    .filter((memory) => memory.stageId === state.stage.stageId)
    .map((memory) => memory.memoryId);
  const resolvedCallbackIds = state.callbacks
    .filter(
      (callback) =>
        callback.status === "resolved" &&
        callback.dueStageId === state.stage.stageId,
    )
    .map((callback) => callback.callbackId);
  return Object.freeze({
    summaryId: `${state.runId}:${state.stage.stageId}:summary`,
    stageId: state.stage.stageId,
    stageLabel: definition.label,
    startAgeMonths: definition.startAgeMonths,
    endAgeMonths: definition.endAgeMonths,
    friendPersonId: friend.person.personId,
    friendDisplayName: friend.person.displayName,
    selectedChoiceId: choice.choiceId,
    selectedOptionId: option.optionId,
    selectedOptionLabel: option.label,
    scoreDelta: Object.freeze({
      health: state.scores.health - state.stage.entryScores.health,
      happiness: state.scores.happiness - state.stage.entryScores.happiness,
      money: state.scores.money - state.stage.entryScores.money,
    }),
    memoryIds: Object.freeze(memoryIds),
    resolvedCallbackIds: Object.freeze(resolvedCallbackIds),
    nextEchoPreview: option.callback.title,
    narration: `${definition.label} closes with ${friend.person.givenName} remembered through “${option.memory.title}.”`,
  });
}

function finishCurrentStage(state: ChildhoodState): ChildhoodState {
  if (state.phase !== "active") return state;
  const summary = createStageSummary(state);
  let next: ChildhoodState = immutable({
    ...state,
    phase: "stage-summary" as const,
    summaries: [...state.summaries, summary],
  });
  next = appendStoryLog(next, {
    stageId: state.stage.stageId,
    kind: "stage-complete",
    text: summary.narration,
    simulationTick: state.simulationTick,
  });
  return next;
}

function stepChildhood(state: ChildhoodState): ChildhoodState {
  if (state.phase !== "active" || state.paused) return state;
  const definition = CHILDHOOD_STAGE_BY_ID[state.stage.stageId];
  const activeTicks = Math.min(
    definition.durationTicks,
    state.stage.activeTicks + 1,
  );
  const simulationTick = state.simulationTick + 1;
  let next = immutable({
    ...state,
    simulationTick,
    stage: Object.freeze({
      ...state.stage,
      activeTicks,
      ageMonths: ageAtStageTick(definition, activeTicks),
    }),
  });
  next = resolveCallbacksForContext(
    next,
    definition.stageId,
    activeTicks,
    simulationTick,
  );
  if (
    !hasResolvedStageChoice(next, definition.stageId) &&
    activeTicks >= definition.majorChoiceTick
  ) {
    return presentStageChoice(next);
  }
  if (activeTicks >= definition.durationTicks) {
    return finishCurrentStage(next);
  }
  return next;
}

export function createChildhoodState(setup: ChildhoodSetup): ChildhoodState {
  if (setup.runId.trim().length === 0) {
    throw new TypeError("Childhood runId must not be empty");
  }
  if (setup.runSeed.trim().length === 0) {
    throw new TypeError("Childhood runSeed must not be empty");
  }
  const scores = createCoreScores(setup.scores ?? DEFAULT_CHILDHOOD_SCORES);
  const firstStage = CHILDHOOD_STAGE_DEFINITIONS[0]!;
  return immutable({
    schemaVersion: 1 as const,
    contentVersion: "childhood-continuity-v1" as const,
    runId: setup.runId,
    runSeed: setup.runSeed,
    phase: "active" as const,
    paused: false,
    simulationTick: 0,
    scores,
    stage: createStageProgress(firstStage, 0, scores),
    friends: createFriendRoster(setup.runSeed),
    companion: selectCompanion(setup.runSeed, setup.companionMode),
    activeChoice: null,
    choices: Object.freeze([]),
    callbacks: Object.freeze([]),
    memories: Object.freeze([]),
    effects: Object.freeze([]),
    summaries: Object.freeze([]),
    storyLog: Object.freeze([]),
  });
}

export function advanceChildhood(
  state: ChildhoodState,
  ticks = 1,
): ChildhoodState {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new RangeError("Childhood advance ticks must be a non-negative integer");
  }
  let next = state;
  for (let count = 0; count < ticks; count += 1) {
    const stepped = stepChildhood(next);
    if (stepped === next) break;
    next = stepped;
    if (next.phase !== "active") break;
  }
  return next;
}

export function chooseChildhoodOption(
  state: ChildhoodState,
  optionId: string,
): ChildhoodState {
  if (state.phase !== "choice" || state.activeChoice === null) {
    throw new Error("No childhood choice is currently presenting");
  }
  const activeChoice = state.activeChoice;
  const choice = choiceForStage(activeChoice.stageId);
  const option = optionForChoice(choice, optionId);
  let next = applyEffects(
    state,
    option.effects,
    "choice",
    option.optionId,
    state.simulationTick,
  );
  next = changeFriendCloseness(
    next,
    activeChoice.friendPersonId,
    option.relationshipDelta,
    option.optionId,
  );

  const memoryId = `${activeChoice.transactionId}:memory:${option.optionId}`;
  const memory: ChildhoodMemory = Object.freeze({
    memoryId,
    stageId: activeChoice.stageId,
    title: option.memory.title,
    summary: option.memory.summary,
    kind: option.memory.kind,
    friendPersonId: activeChoice.friendPersonId,
    originChoiceId: activeChoice.choiceId,
    originOptionId: option.optionId,
    influenceSignals: Object.freeze([...option.memory.influenceSignals]),
    role: "influence-only" as const,
    adultIdentityLock: null,
  });
  const callbackTransactionId = `${activeChoice.transactionId}:callback:${option.callback.callbackId}`;
  const callback: ChildhoodCallback = Object.freeze({
    transactionId: callbackTransactionId,
    callbackId: option.callback.callbackId,
    status: "scheduled" as const,
    dueStageId: option.callback.dueStageId,
    dueStageTick: option.callback.dueStageTick,
    title: option.callback.title,
    story: option.callback.story,
    effects: Object.freeze([...option.callback.effects]),
    relationshipDelta: option.callback.relationshipDelta,
    friendPersonId: activeChoice.friendPersonId,
    originChoiceId: activeChoice.choiceId,
    originOptionId: option.optionId,
    scheduledAtSimulationTick: state.simulationTick,
    resolvedAtSimulationTick: null,
  });
  const choiceRecord: ChildhoodChoiceRecord = Object.freeze({
    transactionId: activeChoice.transactionId,
    choiceId: activeChoice.choiceId,
    optionId: option.optionId,
    stageId: activeChoice.stageId,
    friendPersonId: activeChoice.friendPersonId,
    memoryId,
    callbackTransactionId,
    resolvedAtSimulationTick: state.simulationTick,
  });

  next = immutable({
    ...next,
    phase: "active" as const,
    activeChoice: null,
    memories: [...next.memories, memory],
    callbacks: [...next.callbacks, callback],
    choices: [...next.choices, choiceRecord],
  });
  next = appendStoryLog(next, {
    stageId: activeChoice.stageId,
    kind: "choice-resolved",
    text: `${option.label}: ${option.memory.summary}`,
    simulationTick: state.simulationTick,
  });
  return next;
}

export function continueChildhoodStage(state: ChildhoodState): ChildhoodState {
  if (state.phase !== "stage-summary") {
    throw new Error("Childhood can continue only from a stage summary");
  }
  const nextStageIndex = state.stage.stageIndex + 1;
  if (nextStageIndex >= CHILDHOOD_STAGE_DEFINITIONS.length) {
    return immutable({
      ...state,
      phase: "complete" as const,
      stage: Object.freeze({
        ...state.stage,
        ageMonths: 168,
      }),
    });
  }
  const definition = CHILDHOOD_STAGE_DEFINITIONS[nextStageIndex]!;
  return immutable({
    ...state,
    phase: "active" as const,
    paused: false,
    activeChoice: null,
    stage: createStageProgress(definition, nextStageIndex, state.scores),
  });
}

export function resolveChildhoodCallbacksForStage(
  state: ChildhoodState,
  stageId: ChildhoodLaterStageId,
  stageTick: number,
  simulationTick = state.simulationTick,
): ChildhoodState {
  if (!Number.isInteger(stageTick) || stageTick < 0) {
    throw new RangeError("Callback stageTick must be a non-negative integer");
  }
  return resolveCallbacksForContext(
    state,
    stageId,
    stageTick,
    simulationTick,
  );
}

export function getCurrentChildhoodStage(
  state: ChildhoodState,
): ChildhoodStageDefinition {
  return CHILDHOOD_STAGE_BY_ID[state.stage.stageId];
}

export function getChildhoodFriendForStage(
  state: ChildhoodState,
  stageId: ChildhoodStageId = state.stage.stageId,
): ChildhoodFriendRelationship {
  return friendForStage(state, stageId);
}

export function getActiveChildhoodChoice(
  state: ChildhoodState,
): Readonly<{
  transaction: ChildhoodActiveChoice;
  definition: ChildhoodChoiceDefinition;
  friend: ChildhoodFriendIdentity;
  friendPrompt: string;
}> | null {
  if (state.activeChoice === null) return null;
  const definition = choiceForStage(state.activeChoice.stageId);
  const friend = friendForStage(state, state.activeChoice.stageId).person;
  return Object.freeze({
    transaction: state.activeChoice,
    definition,
    friend,
    friendPrompt: definition.friendPromptTemplate.replace(
      "{friend}",
      friend.givenName,
    ),
  });
}

export function getPendingChildhoodCallbacks(
  state: ChildhoodState,
  stageId?: ChildhoodLaterStageId,
): readonly ChildhoodCallback[] {
  return Object.freeze(
    state.callbacks.filter(
      (callback) =>
        callback.status === "scheduled" &&
        (stageId === undefined || callback.dueStageId === stageId),
    ),
  );
}

export function getChildhoodInfluenceProfile(
  state: ChildhoodState,
): ChildhoodInfluenceProfile {
  const signals = Object.fromEntries(
    INFLUENCE_SIGNAL_IDS.map((signalId) => [signalId, 0]),
  ) as Record<ChildhoodInfluenceSignalId, number>;
  for (const memory of state.memories) {
    for (const signal of memory.influenceSignals) {
      signals[signal.signalId] += signal.weight;
    }
  }
  const highest = Math.max(0, ...Object.values(signals));
  const strongestSignals =
    highest === 0
      ? []
      : INFLUENCE_SIGNAL_IDS.filter((signalId) => signals[signalId] === highest);
  return immutable({
    signals,
    strongestSignals,
    advisoryOnly: true as const,
    identityDirective: null,
    lockedCareerIds: [] as never[],
    lockedRelationshipIds: [] as never[],
  });
}

export function createChildhoodHandoff(
  state: ChildhoodState,
): ChildhoodHandoff {
  if (state.phase !== "complete") {
    throw new Error("Childhood handoff is available only after Middle School");
  }
  return immutable({
    handoffVersion: 1 as const,
    completed: true as const,
    runId: state.runId,
    ageMonths: 168 as const,
    scores: state.scores,
    friends: state.friends,
    companion: state.companion,
    memories: state.memories,
    pendingCallbacks: getPendingChildhoodCallbacks(state),
    summaries: state.summaries,
    influence: getChildhoodInfluenceProfile(state),
  });
}

export function reduceChildhood(
  state: ChildhoodState,
  action: ChildhoodAction,
): ChildhoodState {
  switch (action.type) {
    case "advance":
      return advanceChildhood(state, action.ticks ?? 1);
    case "choose":
      return chooseChildhoodOption(state, action.optionId);
    case "continue-stage":
      return continueChildhoodStage(state);
    case "set-paused":
      return immutable({ ...state, paused: action.paused });
  }
}
