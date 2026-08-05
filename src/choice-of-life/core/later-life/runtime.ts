import { deepFreeze } from "../immutable";
import { applyScoreDelta, createCoreScores, type CoreScores } from "../score-model";
import { assembleFullBiography, mergePriorBiographyChapters } from "./biography";
import {
  LATER_CAREER_CHOICE,
  LEGACY_CHOICE,
  RETIREMENT_CHOICE,
} from "./content";
import type {
  BiographyPerson,
  LaterCareerChoiceOption,
  LaterCareerOptionId,
  LaterLifeAction,
  LaterLifeChapterRecord,
  LaterLifeChoiceOption,
  LaterLifeEffectEntry,
  LaterLifeMajorChoice,
  LaterLifeOptionId,
  LaterLifePhase,
  LaterLifeSetup,
  LaterLifeStageId,
  LaterLifeState,
  LegacyChoiceOption,
  LegacyOptionId,
  LegacyRoute,
  LifeDecisionRecord,
  LifeFact,
  RetirementChoiceOption,
  RetirementOptionId,
  RetirementTiming,
  SceneCallbackRecord,
} from "./types";

const DEFAULT_LATER_LIFE_SCORES: CoreScores = Object.freeze({
  health: 58,
  happiness: 58,
  money: 55,
});

const NAME_POOLS = deepFreeze({
  colleague: ["Ari", "Mina", "Noah", "Lea", "Kai", "Sofia"],
  friend: ["Robin", "Jules", "Emi", "Mateo", "Nora", "Jun"],
  community: ["Samira", "Daniel", "Priya", "Leo", "Hana", "Amara"],
});

function stableIndex(seed: string, salt: string, length: number): number {
  let hash = 2166136261;
  const value = `${seed}:${salt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function generatedPersonFor(
  state: LaterLifeState,
  stageId: LaterLifeStageId,
  optionId: LaterLifeOptionId,
): BiographyPerson {
  const isCommunity = optionId === "legacy-community-project-v1";
  const isFriend =
    optionId === "later-career-rebalance-v1" ||
    optionId === "retirement-now-v1" ||
    optionId === "legacy-family-stories-v1";
  const poolId = isCommunity ? "community" : isFriend ? "friend" : "colleague";
  const pool = NAME_POOLS[poolId];
  const name = pool[stableIndex(state.runSeed, optionId, pool.length)];
  const role = isCommunity
    ? "Community organizer"
    : isFriend
      ? "Longtime friend"
      : optionId === "later-career-mentor-v1"
        ? "Younger colleague"
        : optionId === "legacy-lifelong-craft-v1"
          ? "Learner"
          : "Colleague";
  const relationship = isCommunity ? "community" : isFriend ? "friend" : "colleague";
  return deepFreeze({
    personId: `person-${optionId}`,
    name,
    role,
    relationship,
    firstStageId: stageId,
  });
}

function addPersonOnce(
  people: readonly BiographyPerson[],
  person: BiographyPerson,
): readonly BiographyPerson[] {
  return people.some((candidate) => candidate.personId === person.personId)
    ? people
    : [...people, person];
}

function choiceForPhase(
  phase: LaterLifePhase,
): LaterLifeMajorChoice | null {
  if (phase === "later-career-choice") return LATER_CAREER_CHOICE;
  if (phase === "retirement-choice") return RETIREMENT_CHOICE;
  if (phase === "legacy-choice") return LEGACY_CHOICE;
  return null;
}

export function getCurrentLaterLifeChoice(
  state: LaterLifeState,
): LaterLifeMajorChoice | null {
  return choiceForPhase(state.phase);
}

export function getPresentingLaterLifeCallback(
  state: LaterLifeState,
): SceneCallbackRecord | null {
  for (let index = state.callbacks.length - 1; index >= 0; index -= 1) {
    const callback = state.callbacks[index];
    if (callback.status === "presenting") return callback;
  }
  return null;
}

function findOption<TOption extends LaterLifeChoiceOption>(
  choice: LaterLifeMajorChoice<TOption>,
  optionId: string,
): TOption {
  const option = choice.options.find((candidate) => candidate.optionId === optionId);
  if (option === undefined) {
    throw new RangeError(`Unknown option ${optionId} for ${choice.choiceId}`);
  }
  return option;
}

function assertPhase(state: LaterLifeState, expected: LaterLifePhase): void {
  if (state.phase !== expected) {
    throw new Error(`Expected later-life phase ${expected}, received ${state.phase}`);
  }
}

function applyChoiceEffects(
  scores: CoreScores,
  stageId: LaterLifeStageId,
  decisionId: string,
  option: LaterLifeChoiceOption,
): Readonly<{ scores: CoreScores; entries: readonly LaterLifeEffectEntry[] }> {
  let nextScores = scores;
  const entries: LaterLifeEffectEntry[] = [];
  option.effects.forEach((effect, index) => {
    const change = applyScoreDelta(nextScores, effect.scoreId, effect.requestedDelta);
    entries.push({
      effectId: `${decisionId}:effect-${index + 1}`,
      stageId,
      decisionId,
      optionId: option.optionId,
      scoreId: effect.scoreId,
      requestedDelta: effect.requestedDelta,
      actualDelta: change.actualDelta,
      before: change.before,
      after: change.after,
    });
    nextScores = change.scores;
  });
  return deepFreeze({ scores: nextScores, entries });
}

function retirementTimingFor(
  optionId: LaterLifeOptionId,
  current: RetirementTiming | null,
): RetirementTiming | null {
  if (optionId === "retirement-now-v1") return "earlier";
  if (optionId === "retirement-gradual-v1") return "gradual";
  if (optionId === "retirement-later-v1") return "later";
  return current;
}

function legacyRouteFor(
  optionId: LaterLifeOptionId,
  current: LegacyRoute | null,
): LegacyRoute | null {
  if (optionId === "legacy-family-stories-v1") return "family";
  if (optionId === "legacy-community-project-v1") return "community";
  if (optionId === "legacy-lifelong-craft-v1") return "craft";
  return current;
}

function commitMajorChoice(
  state: LaterLifeState,
  expectedPhase: LaterLifePhase,
  callbackPhase: LaterLifePhase,
  stageId: LaterLifeStageId,
  stageTitle: string,
  choice: LaterLifeMajorChoice,
  option: LaterLifeChoiceOption,
): LaterLifeState {
  assertPhase(state, expectedPhase);
  if (state.decisions.some((decision) => decision.decisionId === choice.choiceId)) {
    throw new Error(`${choice.choiceId} has already been resolved`);
  }

  const ageStartMonths = state.ageMonths;
  const ageEndMonths = ageStartMonths + option.ageAdvanceMonths;
  const applied = applyChoiceEffects(
    state.scores,
    stageId,
    choice.choiceId,
    option,
  );
  const generatedPerson = generatedPersonFor(state, stageId, option.optionId);
  const people = addPersonOnce(state.people, generatedPerson);
  const namedPersonIds = [
    generatedPerson.personId,
    ...state.people.slice(0, 1).map((person) => person.personId),
  ].filter((personId, index, all) => all.indexOf(personId) === index);
  const fact: LifeFact = {
    factId: option.factId,
    kind:
      stageId === "later-career-v1"
        ? "career"
        : stageId === "retirement-v1"
          ? "retirement"
          : "legacy",
    label: option.factLabel,
    value: option.resultText,
    sourceStageId: stageId,
    causedByDecisionId: choice.choiceId,
  };
  const decision: LifeDecisionRecord = {
    decisionId: choice.choiceId,
    stageId,
    choiceTitle: choice.title,
    optionId: option.optionId,
    optionLabel: option.label,
    resultText: option.resultText,
    factIds: [option.factId],
    personIds: namedPersonIds,
    callbackId: option.callbackId,
  };
  const callback: SceneCallbackRecord = {
    callbackId: option.callbackId,
    sceneId: `${stageId}:callback-scene-v1`,
    stageId,
    causedByDecisionId: choice.choiceId,
    causedByOptionId: option.optionId,
    title: option.callbackTitle,
    text: option.callbackText,
    status: "presenting",
    presentedAtAgeMonths: ageEndMonths,
    resolvedAtAgeMonths: null,
    namedPersonIds,
  };
  const chapter: LaterLifeChapterRecord = {
    stageId,
    title: stageTitle,
    ageStartMonths,
    ageEndMonths,
    decisionId: choice.choiceId,
    optionId: option.optionId,
    optionLabel: option.label,
    resultText: option.resultText,
    factId: option.factId,
    callbackId: option.callbackId,
  };

  return deepFreeze({
    ...state,
    phase: callbackPhase,
    currentStageId: stageId,
    ageMonths: ageEndMonths,
    scores: applied.scores,
    retirementTiming: retirementTimingFor(option.optionId, state.retirementTiming),
    legacyRoute: legacyRouteFor(option.optionId, state.legacyRoute),
    laterLifeChapters: [...state.laterLifeChapters, chapter],
    facts: [...state.facts, fact],
    people,
    decisions: [...state.decisions, decision],
    callbacks: [...state.callbacks, callback],
    effects: [...state.effects, ...applied.entries],
  });
}

export function createLaterLifeState(setup: LaterLifeSetup): LaterLifeState {
  const ageMonths = setup.ageMonths ?? 672;
  if (!Number.isInteger(ageMonths) || ageMonths < 480) {
    throw new RangeError("Later life must begin at an integer age of at least 480 months");
  }
  if (setup.runId.trim().length === 0 || setup.runSeed.trim().length === 0) {
    throw new TypeError("runId and runSeed are required");
  }

  return deepFreeze({
    schemaVersion: 1 as const,
    contentVersion: "later-life-runtime-v1" as const,
    runId: setup.runId,
    runSeed: setup.runSeed,
    phase: "later-career-choice" as const,
    currentStageId: "later-career-v1" as const,
    ageMonths,
    scores: createCoreScores(setup.scores ?? DEFAULT_LATER_LIFE_SCORES),
    retirementTiming: null,
    legacyRoute: null,
    priorChapters: mergePriorBiographyChapters(setup.priorChapters, ageMonths),
    laterLifeChapters: [],
    facts: [...(setup.facts ?? [])],
    people: [...(setup.people ?? [])],
    decisions: [...(setup.decisions ?? [])],
    callbacks: [...(setup.callbacks ?? [])],
    effects: [],
    biography: null,
  });
}

export function chooseLaterCareerDirection(
  state: LaterLifeState,
  optionId: LaterCareerOptionId,
): LaterLifeState {
  const option = findOption(LATER_CAREER_CHOICE, optionId);
  return commitMajorChoice(
    state,
    "later-career-choice",
    "later-career-callback",
    "later-career-v1",
    "Later Career",
    LATER_CAREER_CHOICE,
    option,
  );
}

export function chooseRetirementTiming(
  state: LaterLifeState,
  optionId: RetirementOptionId,
): LaterLifeState {
  const option = findOption(RETIREMENT_CHOICE, optionId);
  return commitMajorChoice(
    state,
    "retirement-choice",
    "retirement-callback",
    "retirement-v1",
    "Retirement",
    RETIREMENT_CHOICE,
    option,
  );
}

export function chooseLegacyRoute(
  state: LaterLifeState,
  optionId: LegacyOptionId,
): LaterLifeState {
  const option = findOption(LEGACY_CHOICE, optionId);
  return commitMajorChoice(
    state,
    "legacy-choice",
    "legacy-callback",
    "legacy-v1",
    "Legacy",
    LEGACY_CHOICE,
    option,
  );
}

function phaseAfterCallback(phase: LaterLifePhase): Readonly<{
  phase: LaterLifePhase;
  currentStageId: LaterLifeStageId;
}> {
  if (phase === "later-career-callback") {
    return { phase: "retirement-choice", currentStageId: "retirement-v1" };
  }
  if (phase === "retirement-callback") {
    return { phase: "legacy-choice", currentStageId: "legacy-v1" };
  }
  if (phase === "legacy-callback") {
    return { phase: "ready-to-complete", currentStageId: "legacy-v1" };
  }
  throw new Error(`No callback can be acknowledged during ${phase}`);
}

export function acknowledgeLaterLifeCallback(state: LaterLifeState): LaterLifeState {
  const presenting = getPresentingLaterLifeCallback(state);
  if (presenting === null) {
    throw new Error("There is no presenting later-life callback");
  }
  const next = phaseAfterCallback(state.phase);
  const callbacks = state.callbacks.map((callback) =>
    callback.callbackId === presenting.callbackId
      ? {
          ...callback,
          status: "resolved" as const,
          resolvedAtAgeMonths: state.ageMonths,
        }
      : callback,
  );
  return deepFreeze({
    ...state,
    ...next,
    callbacks,
  });
}

export function canCompleteLaterLife(state: LaterLifeState): boolean {
  return (
    state.phase === "ready-to-complete" &&
    state.laterLifeChapters.length === 3 &&
    state.retirementTiming !== null &&
    state.legacyRoute !== null &&
    !state.callbacks.some((callback) => callback.status === "presenting")
  );
}

export function completeLaterLife(state: LaterLifeState): LaterLifeState {
  if (!canCompleteLaterLife(state)) {
    throw new Error("Later life is not ready to complete");
  }
  const biography = assembleFullBiography(state);
  return deepFreeze({
    ...state,
    phase: "complete" as const,
    biography,
  });
}

export function selectLaterLifeOption(
  state: LaterLifeState,
  optionId: LaterLifeOptionId,
): LaterLifeState {
  if (state.phase === "later-career-choice") {
    return chooseLaterCareerDirection(state, optionId as LaterCareerOptionId);
  }
  if (state.phase === "retirement-choice") {
    return chooseRetirementTiming(state, optionId as RetirementOptionId);
  }
  if (state.phase === "legacy-choice") {
    return chooseLegacyRoute(state, optionId as LegacyOptionId);
  }
  throw new Error(`No later-life option can be selected during ${state.phase}`);
}

export function reduceLaterLife(
  state: LaterLifeState,
  action: LaterLifeAction,
): LaterLifeState {
  switch (action.type) {
    case "choose-later-career":
      return chooseLaterCareerDirection(state, action.optionId);
    case "choose-retirement":
      return chooseRetirementTiming(state, action.optionId);
    case "choose-legacy":
      return chooseLegacyRoute(state, action.optionId);
    case "acknowledge-callback":
      return acknowledgeLaterLifeCallback(state);
    case "complete-life":
      return completeLaterLife(state);
  }
}

export type {
  LaterCareerChoiceOption,
  LegacyChoiceOption,
  RetirementChoiceOption,
};
