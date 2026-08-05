import type { AdultState } from "../core/adult";
import { deepFreeze } from "../core/immutable";
import {
  canCompleteLaterLife,
  createLaterLifeState,
  getCurrentLaterLifeChoice,
  getPresentingLaterLifeCallback,
  reduceLaterLife,
  type BiographyChapterInput,
  type BiographyPerson,
  type LaterCareerOptionId,
  type LaterLifeSetup,
  type LaterLifeState,
  type LegacyOptionId,
  type LifeDecisionRecord,
  type LifeFact,
  type RetirementOptionId,
  type SceneCallbackRecord,
} from "../core/later-life";
import type { CoreScores } from "../core/score-model";

const DEFAULT_RUN_ID = "later-life-session-v1";
const DEFAULT_RUN_SEED = "later-life-session-seed-v1";
const RELATIONSHIPS_START_AGE_MONTHS = 384;
const MIDLIFE_START_AGE_MONTHS = 480;
const ADULT_CYCLE_MONTHS = 48;

export interface LaterLifeChapterSessionOptions {
  /** A completed Adult chapter can supply the whole later-life handoff. */
  readonly adultHandoff?: AdultState;
  /** Explicit values take precedence over values derived from adultHandoff. */
  readonly runId?: string;
  readonly runSeed?: string;
  readonly ageMonths?: number;
  readonly scores?: CoreScores;
  readonly priorChapters?: readonly BiographyChapterInput[];
  readonly facts?: readonly LifeFact[];
  readonly people?: readonly BiographyPerson[];
  readonly decisions?: readonly LifeDecisionRecord[];
  readonly callbacks?: readonly SceneCallbackRecord[];
}

export type LaterLifeChapterSessionAction =
  | Readonly<{ type: "choose-later-career"; optionId: LaterCareerOptionId }>
  | Readonly<{ type: "choose-retirement"; optionId: RetirementOptionId }>
  | Readonly<{ type: "choose-legacy"; optionId: LegacyOptionId }>
  | Readonly<{ type: "acknowledge-callback" }>
  | Readonly<{ type: "complete-life" }>
  | Readonly<{ type: "request-new-life" }>;

export type LaterLifeChapterSessionResultStatus =
  | "applied"
  | "rejected"
  | "reset"
  | "new-life-ready";

export interface LaterLifeChapterSessionResult {
  readonly status: LaterLifeChapterSessionResultStatus;
  readonly state: LaterLifeState;
  readonly changed: boolean;
  readonly currentChoiceId: string | null;
  readonly callbackPending: boolean;
  readonly canComplete: boolean;
  readonly newLifeReady: boolean;
  readonly reason: string | null;
}

export interface LaterLifeChapterSession {
  getState(): LaterLifeState;
  dispatch(action: LaterLifeChapterSessionAction): LaterLifeChapterSessionResult;
  reset(): LaterLifeChapterSessionResult;
}

function readableId(value: string | null, fallback: string): string {
  if (value === null || value.trim().length === 0) return fallback;
  return value
    .replace(/-v\d+$/u, "")
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function adultStartAgeMonths(adult: AdultState): number {
  return Math.round(adult.ageYears * 12) - adult.cycleIndex * ADULT_CYCLE_MONTHS;
}

function adultEndAgeMonths(adult: AdultState): number {
  return Math.max(MIDLIFE_START_AGE_MONTHS, Math.round(adult.ageYears * 12));
}

function adultFactStage(source: AdultState["facts"][number]["source"]):
  | "relationships-home-v1"
  | "midlife-v1" {
  return source === "route" || source === "home" || source === "family"
    ? "relationships-home-v1"
    : "midlife-v1";
}

function adultFactKind(source: AdultState["facts"][number]["source"]): LifeFact["kind"] {
  if (source === "career") return "career";
  if (source === "caregiver" || source === "support") return "resilience";
  return "relationship";
}

function callbackDecisionForFact(adult: AdultState, factId: string): string | null {
  const callback = adult.callbacks.find(
    (candidate) =>
      candidate.decisionId !== null &&
      candidate.selectedOptionId !== null &&
      factId.includes(candidate.selectedOptionId),
  );
  return callback?.decisionId ?? null;
}

function adultFacts(adult: AdultState): readonly LifeFact[] {
  return deepFreeze(
    adult.facts.map((fact) => {
      const stageId = adultFactStage(fact.source);
      return {
        factId: fact.factId,
        kind: adultFactKind(fact.source),
        label: fact.label,
        value: fact.value,
        sourceStageId: stageId,
        causedByDecisionId:
          callbackDecisionForFact(adult, fact.factId) ??
          (stageId === "relationships-home-v1"
            ? "biography-home-choice-v1"
            : "biography-midlife-choice-v1"),
      };
    }),
  );
}

function biographyPerson(
  personId: string,
  name: string,
  role: string,
  relationship: BiographyPerson["relationship"],
  firstStageId: BiographyPerson["firstStageId"],
): BiographyPerson {
  return { personId, name, role, relationship, firstStageId };
}

function adultPeople(adult: AdultState): readonly BiographyPerson[] {
  const candidates: BiographyPerson[] = [];

  if (adult.partner !== null) {
    candidates.push(
      biographyPerson(
        adult.partner.personId,
        adult.partner.name,
        `${adult.partner.job.title}; ${adult.relationshipStatus} partner`,
        "partner",
        "relationships-home-v1",
      ),
    );
  }

  for (const child of adult.children) {
    candidates.push(
      biographyPerson(
        child.personId,
        child.name,
        "Child",
        "family",
        "relationships-home-v1",
      ),
    );
  }

  for (const caregiver of adult.caregivers) {
    candidates.push(
      biographyPerson(
        caregiver.personId,
        caregiver.name,
        `${readableId(caregiver.relationship, "Caregiver")}; ${caregiver.job.title}`,
        "family",
        "midlife-v1",
      ),
    );
  }

  for (const friend of adult.friends) {
    candidates.push(
      biographyPerson(
        friend.personId,
        friend.name,
        `${friend.job.title}; friend`,
        "friend",
        "relationships-home-v1",
      ),
    );
  }

  for (const member of adult.community) {
    candidates.push(
      biographyPerson(
        member.personId,
        member.name,
        `${member.job.title}; community member`,
        "community",
        "relationships-home-v1",
      ),
    );
  }

  const unique = new Map<string, BiographyPerson>();
  for (const person of candidates) {
    if (!unique.has(person.personId)) unique.set(person.personId, person);
  }
  return deepFreeze([...unique.values()]);
}

function callbackTitle(kind: AdultState["callbacks"][number]["kind"]): string {
  if (kind === "promotion") return "A career choice returns";
  if (kind === "caregiver") return "Care given and received";
  return "The support network answers";
}

function callbackPeople(adult: AdultState, kind: AdultState["callbacks"][number]["kind"]): readonly string[] {
  if (kind === "caregiver") return adult.caregivers.slice(0, 2).map((person) => person.personId);
  if (kind === "support") {
    return [...adult.friends, ...adult.community]
      .slice(0, 2)
      .map((person) => person.personId);
  }
  return [];
}

function adultCallbacks(adult: AdultState): readonly SceneCallbackRecord[] {
  const startAge = adultStartAgeMonths(adult);
  const endAge = adultEndAgeMonths(adult);
  return deepFreeze(
    adult.callbacks
      .filter(
        (callback) =>
          callback.status === "resolved" &&
          callback.decisionId !== null &&
          callback.selectedOptionId !== null,
      )
      .map((callback) => {
        const callbackAge = Math.min(
          endAge,
          Math.max(startAge, startAge + callback.dueCycle * ADULT_CYCLE_MONTHS),
        );
        return {
          callbackId: callback.callbackId,
          sceneId: `adult:${callback.kind}:callback-scene-v1`,
          stageId: "midlife-v1" as const,
          causedByDecisionId: callback.decisionId!,
          causedByOptionId: callback.selectedOptionId!,
          title: callbackTitle(callback.kind),
          text: callback.resultText ?? readableId(callback.selectedOptionId, "A remembered choice"),
          status: "resolved" as const,
          presentedAtAgeMonths: callbackAge,
          resolvedAtAgeMonths: callbackAge,
          namedPersonIds: callbackPeople(adult, callback.kind),
        };
      }),
  );
}

function adultDecisions(adult: AdultState): readonly LifeDecisionRecord[] {
  const facts = adultFacts(adult);
  const people = adultPeople(adult);
  const relationshipFactIds = facts
    .filter((fact) => fact.sourceStageId === "relationships-home-v1")
    .map((fact) => fact.factId);
  const midlifeFactIds = facts
    .filter((fact) => fact.sourceStageId === "midlife-v1")
    .map((fact) => fact.factId);
  const relationshipPeople = people
    .filter((person) => person.firstStageId === "relationships-home-v1")
    .map((person) => person.personId);
  const midlifePeople = people
    .filter((person) => person.firstStageId === "midlife-v1")
    .map((person) => person.personId);
  const lastResolvedCallback = [...adult.callbacks]
    .reverse()
    .find((callback) => callback.status === "resolved" && callback.decisionId !== null);

  const decisions: LifeDecisionRecord[] = [
    {
      decisionId: "biography-home-choice-v1",
      stageId: "relationships-home-v1",
      choiceTitle: "How to build a home life",
      optionId: adult.homeChoiceId ?? adult.routeId ?? "adult-route-open-v1",
      optionLabel: readableId(
        adult.homeChoiceId ?? adult.routeId,
        "Kept the adult path open",
      ),
      resultText: `A ${readableId(adult.routeId, "personal").toLowerCase()} route shaped home, family, and belonging.`,
      factIds: relationshipFactIds,
      personIds: relationshipPeople,
      callbackId: null,
    },
    {
      decisionId: "biography-midlife-choice-v1",
      stageId: "midlife-v1",
      choiceTitle: "What deserved care now",
      optionId: lastResolvedCallback?.selectedOptionId ?? `career-${adult.career.status}-v1`,
      optionLabel: lastResolvedCallback?.selectedOptionId === null || lastResolvedCallback === undefined
        ? `${readableId(adult.career.status, "Steady")} career`
        : readableId(lastResolvedCallback.selectedOptionId, "A midlife choice"),
      resultText:
        lastResolvedCallback?.resultText ??
        `${adult.career.job.title} and the people nearby shaped the midlife chapter.`,
      factIds: midlifeFactIds,
      personIds: midlifePeople,
      callbackId: lastResolvedCallback?.callbackId ?? null,
    },
  ];

  for (const callback of adult.callbacks) {
    if (
      callback.status !== "resolved" ||
      callback.decisionId === null ||
      callback.selectedOptionId === null ||
      decisions.some((decision) => decision.decisionId === callback.decisionId)
    ) {
      continue;
    }
    decisions.push({
      decisionId: callback.decisionId,
      stageId: "midlife-v1",
      choiceTitle: callbackTitle(callback.kind),
      optionId: callback.selectedOptionId,
      optionLabel: readableId(callback.selectedOptionId, "A midlife choice"),
      resultText: callback.resultText ?? "The choice remained part of the life story.",
      factIds: facts
        .filter((fact) => fact.causedByDecisionId === callback.decisionId)
        .map((fact) => fact.factId),
      personIds: callbackPeople(adult, callback.kind),
      callbackId: callback.callbackId,
    });
  }

  return deepFreeze(decisions);
}

function adultPriorChapters(adult: AdultState): readonly BiographyChapterInput[] {
  const ageEndMonths = adultEndAgeMonths(adult);
  const facts = adultFacts(adult);
  const people = adultPeople(adult);
  const callbacks = adultCallbacks(adult);
  const relationshipFacts = facts
    .filter((fact) => fact.sourceStageId === "relationships-home-v1")
    .map((fact) => fact.factId);
  const midlifeFacts = facts
    .filter((fact) => fact.sourceStageId === "midlife-v1")
    .map((fact) => fact.factId);
  const relationshipPeople = people
    .filter((person) => person.firstStageId === "relationships-home-v1")
    .map((person) => person.personId);
  const midlifePeople = people
    .filter((person) => person.firstStageId === "midlife-v1")
    .map((person) => person.personId);

  return deepFreeze([
    {
      stageId: "relationships-home-v1" as const,
      title: "Relationships and Home",
      ageStartMonths: RELATIONSHIPS_START_AGE_MONTHS,
      ageEndMonths: MIDLIFE_START_AGE_MONTHS,
      summary: `A ${readableId(adult.routeId, "personal").toLowerCase()} route made home through ${readableId(adult.homeChoiceId, "everyday choices").toLowerCase()}.`,
      majorDecisionId: "biography-home-choice-v1",
      majorChoiceLabel: readableId(adult.homeChoiceId ?? adult.routeId, "How to build a home life"),
      namedFactIds: relationshipFacts,
      namedPersonIds: relationshipPeople,
      callbackIds: [],
    },
    {
      stageId: "midlife-v1" as const,
      title: "Midlife",
      ageStartMonths: MIDLIFE_START_AGE_MONTHS,
      ageEndMonths,
      summary: `${adult.career.job.title}, changing responsibilities, and support from others carried life toward later career.`,
      majorDecisionId: "biography-midlife-choice-v1",
      majorChoiceLabel: `Balance a ${readableId(adult.career.status, "steady").toLowerCase()} career with care`,
      namedFactIds: midlifeFacts,
      namedPersonIds: midlifePeople,
      callbackIds: callbacks.map((callback) => callback.callbackId),
    },
  ]);
}

function canonicalSetup(options: LaterLifeChapterSessionOptions): LaterLifeSetup {
  const adult = options.adultHandoff;
  return deepFreeze({
    runId: options.runId ?? adult?.runId ?? DEFAULT_RUN_ID,
    runSeed: options.runSeed ?? adult?.runSeed ?? DEFAULT_RUN_SEED,
    ageMonths: options.ageMonths ?? (adult === undefined ? undefined : adultEndAgeMonths(adult)),
    scores: options.scores ?? adult?.scores,
    priorChapters:
      options.priorChapters ?? (adult === undefined ? undefined : adultPriorChapters(adult)),
    facts: options.facts ?? (adult === undefined ? undefined : adultFacts(adult)),
    people: options.people ?? (adult === undefined ? undefined : adultPeople(adult)),
    decisions:
      options.decisions ?? (adult === undefined ? undefined : adultDecisions(adult)),
    callbacks:
      options.callbacks ?? (adult === undefined ? undefined : adultCallbacks(adult)),
  });
}

function resultFor(
  status: LaterLifeChapterSessionResultStatus,
  state: LaterLifeState,
  changed: boolean,
  reason: string | null = null,
): LaterLifeChapterSessionResult {
  return deepFreeze({
    status,
    state,
    changed,
    currentChoiceId: getCurrentLaterLifeChoice(state)?.choiceId ?? null,
    callbackPending: getPresentingLaterLifeCallback(state) !== null,
    canComplete: canCompleteLaterLife(state),
    newLifeReady: state.phase === "complete" && state.biography !== null,
    reason,
  });
}

function rejectionReason(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The later-life action could not be applied.";
}

/**
 * Creates a deterministic, session-only adapter for the three final chapters.
 * No browser storage, timers, or navigation are owned by this object.
 */
export function createLaterLifeChapterSession(
  options: LaterLifeChapterSessionOptions = {},
): LaterLifeChapterSession {
  const setup = canonicalSetup(options);
  let state = createLaterLifeState(setup);

  return {
    getState(): LaterLifeState {
      return state;
    },

    dispatch(action: LaterLifeChapterSessionAction): LaterLifeChapterSessionResult {
      if (action.type === "request-new-life") {
        return state.phase === "complete" && state.biography !== null
          ? resultFor("new-life-ready", state, false)
          : resultFor(
              "rejected",
              state,
              false,
              "Finish the biography before beginning a new life.",
            );
      }

      try {
        const next = reduceLaterLife(state, action);
        const changed = next !== state;
        state = next;
        return resultFor("applied", state, changed);
      } catch (error) {
        return resultFor("rejected", state, false, rejectionReason(error));
      }
    },

    reset(): LaterLifeChapterSessionResult {
      state = createLaterLifeState(setup);
      return resultFor("reset", state, true);
    },
  };
}
