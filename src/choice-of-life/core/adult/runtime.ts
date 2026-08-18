import { deepFreeze } from "../immutable";
import {
  applyScoreDelta,
  createCoreScores,
  type CoreScores,
  type ScoreId,
} from "../score-model";
import {
  ADULT_CALLBACK_DEFINITIONS,
  ADULT_JOB_CATALOG,
  ADULT_ROUTE_DEFINITIONS,
  adultAppearanceAt,
  defaultAttractionForGender,
  getAdultJob,
  listAdultNames,
  type AdultCallbackDefinition,
} from "./content";
import type {
  AdultAction,
  AdultAttraction,
  AdultCallbackKind,
  AdultCallbackRecord,
  AdultCaregiverState,
  AdultCareerState,
  AdultCommitmentChoiceId,
  AdultDecisionOptionId,
  AdultEffectEntry,
  AdultEffectSource,
  AdultFamilyPlanId,
  AdultGender,
  AdultHomeChoiceId,
  AdultJobId,
  AdultNpcProfile,
  AdultNpcRole,
  AdultOutfitVariant,
  AdultPendingDecision,
  AdultRouteId,
  AdultScoreEffectRequest,
  AdultSeason,
  AdultSetup,
  AdultState,
  PartnerCandidateRequest,
} from "./types";

export const ADULT_CYCLE_MONTHS = 24;
export const ADULT_STAGE_CYCLES = 6;

function immutable<T>(value: T): T {
  return deepFreeze(value);
}

function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return Math.imul(hash, 0x846ca68b) >>> 0;
}

function normalizeAge(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears < 18) {
    throw new RangeError("Adult ageYears must be a finite number of at least 18");
  }
  return Math.round(ageYears * 12) / 12;
}

function roleNpc(
  runSeed: string,
  role: AdultNpcRole,
  index: number,
  ageYears: number,
  attraction: AdultAttraction = "any",
): AdultNpcProfile {
  const names = listAdultNames(attraction);
  if (names.length === 0) {
    throw new Error(`Cannot generate a ${role} for attraction '${attraction}'`);
  }
  const nameOffset = stableHash(`${runSeed}:${role}:names`) % names.length;
  const record = names[(nameOffset + index * 5) % names.length]!;
  const jobs = Object.keys(ADULT_JOB_CATALOG) as AdultJobId[];
  const jobOffset = stableHash(`${runSeed}:${role}:jobs`) % jobs.length;
  const jobId = jobs[(jobOffset + index * 7) % jobs.length]!;
  const appearanceIndex = stableHash(`${runSeed}:${role}:${record.name}:${index}`);
  return immutable({
    personId: `${role}-${record.gender}-${record.name.toLowerCase()}-${appearanceIndex.toString(36)}`,
    name: record.name,
    gender: record.gender,
    culture: record.culture,
    ageYears: normalizeAge(Math.max(18, ageYears + ((appearanceIndex % 5) - 2))),
    role,
    job: getAdultJob(jobId),
    appearance: adultAppearanceAt(appearanceIndex, record.gender),
  });
}

export function generatePartnerCandidates(
  request: PartnerCandidateRequest,
): readonly AdultNpcProfile[] {
  const attraction =
    request.attraction ?? defaultAttractionForGender(request.playerGender);
  const names = listAdultNames(attraction);
  if (names.length === 0) return immutable([]);
  const count = Math.min(request.count ?? 4, names.length);
  const playerAgeYears = normalizeAge(request.playerAgeYears ?? 28);
  const candidates: AdultNpcProfile[] = [];
  const usedNames = new Set<string>();
  let cursor = 0;
  while (candidates.length < count && cursor < names.length * 2) {
    const candidate = roleNpc(
      request.runSeed,
      "spouse-candidate",
      cursor,
      playerAgeYears,
      attraction,
    );
    cursor += 1;
    if (usedNames.has(candidate.name)) continue;
    usedNames.add(candidate.name);
    candidates.push(candidate);
  }
  return immutable(candidates);
}

function socialGroup(
  runSeed: string,
  role: "friend" | "community-member",
  ageYears: number,
  count: number,
): readonly AdultNpcProfile[] {
  return immutable(
    Array.from({ length: count }, (_, index) =>
      roleNpc(`${runSeed}:${role}`, role, index, ageYears, "any"),
    ),
  );
}

function conditionForAge(ageYears: number): AdultCaregiverState["condition"] {
  if (ageYears >= 78) return "frail";
  if (ageYears >= 67) return "needs-support";
  return "independent";
}

export function createDefaultCaregivers(
  runSeed: string,
  playerAgeYears = 28,
): readonly AdultCaregiverState[] {
  const motherNpc = roleNpc(`${runSeed}:mother`, "caregiver", 0, playerAgeYears + 29, "women");
  const fatherNpc = roleNpc(`${runSeed}:father`, "caregiver", 0, playerAgeYears + 31, "men");
  return immutable([
    {
      ...motherNpc,
      role: "caregiver" as const,
      relationship: "mother" as const,
      condition: conditionForAge(motherNpc.ageYears),
      retired: motherNpc.ageYears >= 66,
    },
    {
      ...fatherNpc,
      role: "caregiver" as const,
      relationship: "father" as const,
      condition: conditionForAge(fatherNpc.ageYears),
      retired: fatherNpc.ageYears >= 66,
    },
  ]);
}

function scheduledCallbacks(): readonly AdultCallbackRecord[] {
  return immutable(
    ADULT_CALLBACK_DEFINITIONS.map((definition) => ({
      callbackId: definition.callbackId,
      kind: definition.kind,
      dueCycle: definition.dueCycle,
      status: "scheduled" as const,
      decisionId: null,
      selectedOptionId: null,
      resultText: null,
    })),
  );
}

function createCareerState(jobId: AdultJobId): AdultCareerState {
  return immutable({
    job: getAdultJob(jobId),
    level: 1 as const,
    status: "active" as const,
    interruptionMonthsRemaining: 0,
    interruptions: [],
  });
}

export function createAdultState(setup: AdultSetup): AdultState {
  if (typeof setup.runId !== "string" || setup.runId.trim().length === 0) {
    throw new TypeError("Adult runId must be a non-empty string");
  }
  if (typeof setup.runSeed !== "string" || setup.runSeed.trim().length === 0) {
    throw new TypeError("Adult runSeed must be a non-empty string");
  }
  if (setup.player.gender !== "female" && setup.player.gender !== "male") {
    throw new TypeError("Adult player gender must be female or male");
  }
  if (setup.season !== undefined && setup.season !== "standard" && setup.season !== "summer") {
    throw new TypeError("Adult season must be standard or summer");
  }
  const ageYears = normalizeAge(setup.ageYears ?? 28);
  const player = immutable({
    ...setup.player,
    attraction:
      setup.player.attraction ?? defaultAttractionForGender(setup.player.gender),
  });
  return immutable({
    schemaVersion: 1 as const,
    contentVersion: "adult-life-runtime-v1" as const,
    stageId: "relationships-home-midlife-v1" as const,
    runId: setup.runId,
    runSeed: setup.runSeed,
    phase: "route-choice" as const,
    chapter: "relationships-home" as const,
    cycleIndex: 0,
    ageYears,
    season: setup.season ?? "standard",
    scores: createCoreScores(setup.scores),
    player,
    routeId: null,
    relationshipStatus: "single" as const,
    partnerCandidates: [],
    partner: null,
    commitmentChoiceId: null,
    homeChoiceId: null,
    familyPlanId: null,
    children: [],
    caregivers:
      setup.caregivers === undefined
        ? createDefaultCaregivers(setup.runSeed, ageYears)
        : immutable([...setup.caregivers]),
    friends: socialGroup(setup.runSeed, "friend", ageYears, 4),
    community: socialGroup(setup.runSeed, "community-member", ageYears, 4),
    career: createCareerState(player.jobId),
    callbacks: scheduledCallbacks(),
    pendingDecision: null,
    effects: [],
    settlements: [],
    facts: immutable([...(setup.facts ?? [])]),
    story: [],
    nextStageId: null,
  });
}

export function chooseAdultRoute(
  state: AdultState,
  routeId: AdultRouteId,
): AdultState {
  if (state.phase !== "route-choice") {
    throw new Error("Adult route can only be chosen at the route choice");
  }
  const definition = ADULT_ROUTE_DEFINITIONS[routeId];
  // Without this an unknown id reached `definition.label` below and threw a raw
  // "Cannot read properties of undefined" TypeError, which the shell then showed
  // to the player verbatim as a notice. Every sibling stage rejects an unknown
  // route by name; this one did not.
  if (definition === undefined) {
    throw new RangeError(`Unknown adult route: ${routeId}`);
  }
  const candidates =
    routeId === "partnered"
      ? generatePartnerCandidates({
          runSeed: state.runSeed,
          playerGender: state.player.gender,
          ...(state.player.attraction === undefined
            ? {}
            : { attraction: state.player.attraction }),
          playerAgeYears: state.ageYears,
          count: 4,
        })
      : [];
  if (routeId === "partnered" && candidates.length === 0) {
    throw new Error("The partnered route needs at least one attraction-compatible candidate");
  }
  return immutable({
    ...state,
    phase: routeId === "partnered" ? ("partner-choice" as const) : ("home-choice" as const),
    routeId,
    partnerCandidates: candidates,
    facts: [
      ...state.facts,
      {
        factId: `adult-route-${routeId}-v1`,
        label: "Adult life route",
        value: definition.label,
        source: "route" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-route-${routeId}-v1`,
        kind: "route-chosen" as const,
        cycleIndex: 0,
        text: definition.summary,
      },
    ],
  });
}

export function chooseAdultPartner(
  state: AdultState,
  personId: string,
): AdultState {
  if (state.phase !== "partner-choice" || state.routeId !== "partnered") {
    throw new Error("A partner can only be chosen on the partnered route");
  }
  const candidate = state.partnerCandidates.find((person) => person.personId === personId);
  if (candidate === undefined) {
    throw new RangeError(`Unknown spouse candidate: ${personId}`);
  }
  const partner = immutable({ ...candidate, role: "partner" as const });
  return immutable({
    ...state,
    phase: "commitment-choice" as const,
    relationshipStatus: "partnered" as const,
    partner,
    facts: [
      ...state.facts,
      {
        factId: `adult-partner-${partner.personId}`,
        label: "Partner",
        value: `${partner.name}, ${partner.job.title}`,
        source: "route" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-partner-chosen-${partner.personId}`,
        kind: "partner-chosen" as const,
        cycleIndex: 0,
        text: `You and ${partner.name} chose to build a relationship without rushing the next decision.`,
      },
    ],
  });
}

export function skipAdultPartnering(state: AdultState): AdultState {
  if (state.phase !== "partner-choice") {
    throw new Error("Partnering can only be skipped while candidates are available");
  }
  return immutable({
    ...state,
    phase: "home-choice" as const,
    routeId: "single-friends" as const,
    relationshipStatus: "single" as const,
    partnerCandidates: [],
    partner: null,
    facts: [
      ...state.facts,
      {
        factId: "adult-route-single-after-dating-v1",
        label: "Relationship choice",
        value: "Chose a single life supported by friends",
        source: "route" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: "adult-partnering-skipped-v1",
        kind: "route-chosen" as const,
        cycleIndex: 0,
        text: "You left the dating chapter open and invested in friendship and your own direction.",
      },
    ],
  });
}

export function chooseAdultCommitment(
  state: AdultState,
  choiceId: AdultCommitmentChoiceId,
): AdultState {
  if (state.phase !== "commitment-choice" || state.partner === null) {
    throw new Error("Commitment can only be chosen after selecting a partner");
  }
  const married = choiceId === "marry";
  const value = married
    ? `Married ${state.partner.name}`
    : `Stayed partnered with ${state.partner.name}`;
  return immutable({
    ...state,
    phase: "home-choice" as const,
    commitmentChoiceId: choiceId,
    relationshipStatus: married ? ("married" as const) : ("partnered" as const),
    facts: [
      ...state.facts,
      {
        factId: `adult-commitment-${choiceId}-v1`,
        label: "Commitment",
        value,
        source: "route" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-commitment-${choiceId}-v1`,
        kind: "commitment-chosen" as const,
        cycleIndex: 0,
        text: married
          ? `You and ${state.partner.name} chose marriage.`
          : `You and ${state.partner.name} chose partnership without marriage.`,
      },
    ],
  });
}

export function availableAdultHomeChoices(
  state: AdultState,
): readonly AdultHomeChoiceId[] {
  if (state.routeId === null) return immutable([]);
  return ADULT_ROUTE_DEFINITIONS[state.routeId].homeChoices;
}

function projectEffects(
  scores: CoreScores,
  previous: readonly AdultEffectEntry[],
  requests: readonly AdultScoreEffectRequest[],
  source: AdultEffectSource,
  cycleIndex: number,
  causedByDecisionId: string | null,
): Readonly<{
  scores: CoreScores;
  effects: readonly AdultEffectEntry[];
  appliedEffectIds: readonly string[];
}> {
  let current = scores;
  const additions: AdultEffectEntry[] = [];
  for (const [requestIndex, request] of requests.entries()) {
    const change = applyScoreDelta(current, request.scoreId, request.requestedDelta);
    const effectId = `adult:${source}:${cycleIndex}:${causedByDecisionId ?? "routine"}:${previous.length + requestIndex}`;
    additions.push({
      effectId,
      source,
      scoreId: request.scoreId,
      requestedDelta: request.requestedDelta,
      actualDelta: change.actualDelta,
      before: change.before,
      after: change.after,
      cycleIndex,
      causedByDecisionId,
    });
    current = change.scores;
  }
  return immutable({
    scores: current,
    effects: [...previous, ...additions],
    appliedEffectIds: additions.map((effect) => effect.effectId),
  });
}

const HOME_EFFECTS: Readonly<Record<AdultHomeChoiceId, readonly AdultScoreEffectRequest[]>> =
  immutable<Readonly<Record<AdultHomeChoiceId, readonly AdultScoreEffectRequest[]>>>({
    "make-shared-home": [
      { scoreId: "money", requestedDelta: -5 },
      { scoreId: "happiness", requestedDelta: 5 },
    ],
    "keep-independent-homes": [
      { scoreId: "money", requestedDelta: -2 },
      { scoreId: "health", requestedDelta: 2 },
      { scoreId: "happiness", requestedDelta: 2 },
    ],
    "friend-household": [
      { scoreId: "money", requestedDelta: 2 },
      { scoreId: "happiness", requestedDelta: 4 },
    ],
    "independent-home": [
      { scoreId: "money", requestedDelta: -2 },
      { scoreId: "health", requestedDelta: 3 },
      { scoreId: "happiness", requestedDelta: 1 },
    ],
    "community-household": [
      { scoreId: "money", requestedDelta: 1 },
      { scoreId: "health", requestedDelta: 2 },
      { scoreId: "happiness", requestedDelta: 4 },
    ],
    "neighborhood-root": [
      { scoreId: "money", requestedDelta: -3 },
      { scoreId: "health", requestedDelta: 2 },
      { scoreId: "happiness", requestedDelta: 3 },
    ],
  });

export function chooseAdultHome(
  state: AdultState,
  choiceId: AdultHomeChoiceId,
): AdultState {
  if (state.phase !== "home-choice" || state.routeId === null) {
    throw new Error("A home can only be chosen after an adult route");
  }
  if (!availableAdultHomeChoices(state).includes(choiceId)) {
    throw new RangeError(`Home choice '${choiceId}' is not available for route '${state.routeId}'`);
  }
  const projection = projectEffects(
    state.scores,
    state.effects,
    HOME_EFFECTS[choiceId],
    "home-choice",
    0,
    choiceId,
  );
  return immutable({
    ...state,
    phase: "family-choice" as const,
    homeChoiceId: choiceId,
    scores: projection.scores,
    effects: projection.effects,
    facts: [
      ...state.facts,
      {
        factId: `adult-home-${choiceId}-v1`,
        label: "Home",
        value: choiceId.replaceAll("-", " "),
        source: "home" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-home-${choiceId}-v1`,
        kind: "home-chosen" as const,
        cycleIndex: 0,
        text: "Your home became a deliberate part of the life you were building.",
      },
    ],
  });
}

function createChildren(
  state: AdultState,
  count: number,
): AdultState["children"] {
  const names = ["Ari", "Mina", "Sam", "Kai", "Lina", "Theo"] as const;
  return immutable(
    Array.from({ length: count }, (_, index) => {
      const hash = stableHash(`${state.runSeed}:child:${index}`);
      return {
        personId: `child-${index + 1}-${hash.toString(36)}`,
        name: names[hash % names.length]!,
        gender: (hash % 2 === 0 ? "female" : "male") as AdultGender,
        ageYears: 0,
      };
    }),
  );
}

const FAMILY_EFFECTS: Readonly<Record<AdultFamilyPlanId, readonly AdultScoreEffectRequest[]>> =
  immutable<Readonly<Record<AdultFamilyPlanId, readonly AdultScoreEffectRequest[]>>>({
    "no-children": [
      { scoreId: "health", requestedDelta: 2 },
      { scoreId: "money", requestedDelta: 2 },
    ],
    "one-child": [
      { scoreId: "money", requestedDelta: -5 },
      { scoreId: "health", requestedDelta: -1 },
      { scoreId: "happiness", requestedDelta: 5 },
    ],
    "two-children": [
      { scoreId: "money", requestedDelta: -8 },
      { scoreId: "health", requestedDelta: -2 },
      { scoreId: "happiness", requestedDelta: 7 },
    ],
    undecided: [{ scoreId: "happiness", requestedDelta: 1 }],
  });

export function chooseAdultFamilyPlan(
  state: AdultState,
  planId: AdultFamilyPlanId,
): AdultState {
  if (state.phase !== "family-choice") {
    throw new Error("A family plan can only be chosen after the home decision");
  }
  const projection = projectEffects(
    state.scores,
    state.effects,
    FAMILY_EFFECTS[planId],
    "family-choice",
    0,
    planId,
  );
  const childCount = planId === "one-child" ? 1 : planId === "two-children" ? 2 : 0;
  return immutable({
    ...state,
    phase: "active" as const,
    familyPlanId: planId,
    children: createChildren(state, childCount),
    scores: projection.scores,
    effects: projection.effects,
    facts: [
      ...state.facts,
      {
        factId: `adult-family-${planId}-v1`,
        label: "Family plan",
        value: planId.replaceAll("-", " "),
        source: "family" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-family-${planId}-v1`,
        kind: "family-plan-chosen" as const,
        cycleIndex: 0,
        text: "You made a family choice that matched this chapter, knowing life could still change.",
      },
    ],
  });
}

function ageCaregivers(
  caregivers: readonly AdultCaregiverState[],
): readonly AdultCaregiverState[] {
  return immutable(
    caregivers.map((caregiver) => {
      const ageYears = Math.round((caregiver.ageYears + ADULT_CYCLE_MONTHS / 12) * 12) / 12;
      return {
        ...caregiver,
        ageYears,
        condition: conditionForAge(ageYears),
        retired: caregiver.retired || ageYears >= 66,
      };
    }),
  );
}

function ageChildren(children: AdultState["children"]): AdultState["children"] {
  return immutable(
    children.map((child) => ({
      ...child,
      ageYears: Math.round((child.ageYears + ADULT_CYCLE_MONTHS / 12) * 12) / 12,
    })),
  );
}

function cycleEffects(state: AdultState): readonly AdultScoreEffectRequest[] {
  const incomeByLevel = [0, 6, 9, 12] as const;
  const statusFactor =
    state.career.status === "active" ? 1 : state.career.status === "reduced-hours" ? 0.6 : 0.15;
  const income = Math.round(incomeByLevel[state.career.level] * statusFactor);
  const childCost = state.children.length * -2;
  const routeHappiness =
    state.routeId === "partnered" ? 2 : state.routeId === "single-friends" ? 2 : 3;
  return immutable([
    { scoreId: "money", requestedDelta: income - 4 + childCost },
    { scoreId: "health", requestedDelta: state.career.level >= 3 ? -2 : -1 },
    { scoreId: "happiness", requestedDelta: routeHappiness },
  ]);
}

function progressCareerAfterCycle(career: AdultCareerState): AdultCareerState {
  if (career.status !== "interrupted") return career;
  const remaining = Math.max(0, career.interruptionMonthsRemaining - ADULT_CYCLE_MONTHS);
  return immutable({
    ...career,
    status: remaining === 0 ? ("active" as const) : career.status,
    interruptionMonthsRemaining: remaining,
  });
}

function callbackDefinition(kind: AdultCallbackKind): AdultCallbackDefinition {
  const definition = ADULT_CALLBACK_DEFINITIONS.find((item) => item.kind === kind);
  if (definition === undefined) throw new Error(`Missing adult callback definition: ${kind}`);
  return definition;
}

function presentDueCallback(
  callbacks: readonly AdultCallbackRecord[],
  cycleIndex: number,
): Readonly<{
  callbacks: readonly AdultCallbackRecord[];
  decision: AdultPendingDecision | null;
}> {
  const due = callbacks.find(
    (callback) => callback.status === "scheduled" && callback.dueCycle <= cycleIndex,
  );
  if (due === undefined) return immutable({ callbacks, decision: null });
  const definition = callbackDefinition(due.kind);
  const decision: AdultPendingDecision = immutable({
    decisionId: `adult-${definition.kind}-decision-cycle-${cycleIndex}-v1`,
    callbackId: definition.callbackId,
    kind: definition.kind,
    cycleIndex,
    title: definition.title,
    prompt: definition.prompt,
    options: definition.options,
  });
  return immutable({
    callbacks: callbacks.map((callback) =>
      callback.callbackId === due.callbackId
        ? { ...callback, status: "presenting" as const, decisionId: decision.decisionId }
        : callback,
    ),
    decision,
  });
}

export function settleAdultCycle(state: AdultState): AdultState {
  if (state.phase !== "active") {
    throw new Error("An adult cycle can only settle while adult life is active");
  }
  if (state.cycleIndex >= ADULT_STAGE_CYCLES) {
    throw new Error("All adult-life cycles are already settled");
  }
  const cycleIndex = state.cycleIndex + 1;
  const projection = projectEffects(
    state.scores,
    state.effects,
    cycleEffects(state),
    "adult-cycle",
    cycleIndex,
    null,
  );
  const ageYears = Math.round((state.ageYears + ADULT_CYCLE_MONTHS / 12) * 12) / 12;
  const chapter = cycleIndex >= 4 ? ("midlife" as const) : ("relationships-home" as const);
  const callback = presentDueCallback(state.callbacks, cycleIndex);
  const phase =
    callback.decision !== null
      ? ("callback" as const)
      : cycleIndex >= ADULT_STAGE_CYCLES
        ? ("settling" as const)
        : ("active" as const);
  const settlement = immutable({
    settlementId: `adult-settlement-${cycleIndex}-v1`,
    cycleIndex,
    ageYears,
    chapter,
    appliedEffectIds: projection.appliedEffectIds,
    summary: `Age ${ageYears}: work, home, and wellbeing moved forward together.`,
  });
  return immutable({
    ...state,
    phase,
    chapter,
    cycleIndex,
    ageYears,
    scores: projection.scores,
    caregivers: ageCaregivers(state.caregivers),
    children: ageChildren(state.children),
    career: progressCareerAfterCycle(state.career),
    callbacks: callback.callbacks,
    pendingDecision: callback.decision,
    effects: projection.effects,
    settlements: [...state.settlements, settlement],
    story: [
      ...state.story,
      {
        eventId: `adult-cycle-settled-${cycleIndex}-v1`,
        kind: "cycle-settled" as const,
        cycleIndex,
        text: settlement.summary,
      },
      ...(callback.decision === null
        ? []
        : [
            {
              eventId: `adult-callback-presented-${callback.decision.callbackId}`,
              kind: "callback-presented" as const,
              cycleIndex,
              text: callback.decision.prompt,
            },
          ]),
    ],
  });
}

function careerAfterCallback(
  career: AdultCareerState,
  optionId: AdultDecisionOptionId,
  cycleIndex: number,
): AdultCareerState {
  if (optionId === "accept-promotion" || optionId === "negotiate-promotion") {
    return immutable({
      ...career,
      level: Math.min(3, career.level + 1) as AdultCareerState["level"],
    });
  }
  if (optionId === "take-care-leave") {
    return immutable({
      ...career,
      status: "interrupted" as const,
      interruptionMonthsRemaining: 12,
      interruptions: [
        ...career.interruptions,
        {
          interruptionId: `adult-caregiving-interruption-${cycleIndex}-v1`,
          startedCycle: cycleIndex,
          durationMonths: 12,
          reason: "caregiving" as const,
        },
      ],
    });
  }
  if (optionId === "share-care") {
    return immutable({
      ...career,
      status: "reduced-hours" as const,
      interruptionMonthsRemaining: 0,
    });
  }
  if (optionId === "hire-care-help") {
    return immutable({
      ...career,
      status: "active" as const,
      interruptionMonthsRemaining: 0,
    });
  }
  return career;
}

function sourceForCallback(kind: AdultCallbackKind): AdultEffectSource {
  if (kind === "promotion") return "promotion-callback";
  if (kind === "caregiver") return "caregiver-callback";
  return "support-callback";
}

export function resolveAdultCallback(
  state: AdultState,
  optionId: AdultDecisionOptionId,
): AdultState {
  if (state.phase !== "callback" || state.pendingDecision === null) {
    throw new Error("No adult-life callback is currently active");
  }
  const decision = state.pendingDecision;
  const option = decision.options.find((candidate) => candidate.optionId === optionId);
  if (option === undefined) {
    throw new RangeError(`Option '${optionId}' does not belong to callback '${decision.callbackId}'`);
  }
  const projection = projectEffects(
    state.scores,
    state.effects,
    option.effects,
    sourceForCallback(decision.kind),
    decision.cycleIndex,
    decision.decisionId,
  );
  const callbacks = state.callbacks.map((callback) =>
    callback.callbackId === decision.callbackId
      ? {
          ...callback,
          status: "resolved" as const,
          selectedOptionId: option.optionId,
          resultText: option.resultText,
        }
      : callback,
  );
  const factSource =
    decision.kind === "promotion"
      ? ("career" as const)
      : decision.kind === "caregiver"
        ? ("caregiver" as const)
        : ("support" as const);
  return immutable({
    ...state,
    phase: state.cycleIndex >= ADULT_STAGE_CYCLES ? ("settling" as const) : ("active" as const),
    scores: projection.scores,
    career: careerAfterCallback(state.career, optionId, decision.cycleIndex),
    callbacks,
    pendingDecision: null,
    effects: projection.effects,
    facts: [
      ...state.facts,
      {
        factId: `adult-callback-${decision.kind}-${optionId}-v1`,
        label: decision.title,
        value: option.label,
        source: factSource,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `adult-callback-resolved-${decision.callbackId}`,
        kind: "callback-resolved" as const,
        cycleIndex: decision.cycleIndex,
        text: option.resultText,
      },
    ],
  });
}

export function setAdultSeason(
  state: AdultState,
  season: AdultSeason,
): AdultState {
  if (season !== "standard" && season !== "summer") {
    throw new TypeError("Adult season must be standard or summer");
  }
  return state.season === season ? state : immutable({ ...state, season });
}

export function currentAdultOutfit(state: AdultState): AdultOutfitVariant {
  return state.career.job.outfits[state.season];
}

export function currentAdultNpcOutfit(
  npc: Pick<AdultNpcProfile, "job"> | Pick<AdultCaregiverState, "job">,
  season: AdultSeason,
): AdultOutfitVariant {
  return npc.job.outfits[season];
}

export function canAdvanceAdultToLaterCareer(state: AdultState): boolean {
  return (
    state.phase === "settling" &&
    state.cycleIndex >= ADULT_STAGE_CYCLES &&
    state.pendingDecision === null &&
    state.callbacks.every((callback) => callback.status === "resolved")
  );
}

export function advanceAdultToLaterCareer(state: AdultState): AdultState {
  if (!canAdvanceAdultToLaterCareer(state)) {
    throw new Error("Adult life cannot advance until every cycle and scheduled callback is settled");
  }
  return immutable({
    ...state,
    phase: "complete" as const,
    chapter: "later-career-ready" as const,
    nextStageId: "later-career-v1" as const,
    story: [
      ...state.story,
      {
        eventId: "adult-later-career-ready-v1",
        kind: "later-career-ready" as const,
        cycleIndex: state.cycleIndex,
        text: "Every adult route now continues into Later Career with its relationships and decisions intact.",
      },
    ],
  });
}

export function reduceAdult(
  state: AdultState,
  action: AdultAction,
): AdultState {
  switch (action.type) {
    case "choose-route":
      return chooseAdultRoute(state, action.routeId);
    case "choose-partner":
      return chooseAdultPartner(state, action.personId);
    case "skip-partnering":
      return skipAdultPartnering(state);
    case "choose-commitment":
      return chooseAdultCommitment(state, action.choiceId);
    case "choose-home":
      return chooseAdultHome(state, action.choiceId);
    case "choose-family-plan":
      return chooseAdultFamilyPlan(state, action.planId);
    case "settle-cycle":
      return settleAdultCycle(state);
    case "resolve-callback":
      return resolveAdultCallback(state, action.optionId);
    case "set-season":
      return setAdultSeason(state, action.season);
    case "advance-to-later-career":
      return advanceAdultToLaterCareer(state);
      default:
      // An exhaustive switch with no default returned `undefined` for any action
      // outside the union. Sessions assign that straight back to their state, so
      // one unrecognised action silently bricked the chapter and every later call
      // failed with "Cannot read properties of undefined". Fail loudly instead;
      // the shell already turns a throw into a clean player-facing notice.
      throw new TypeError(
        `Unsupported adult action: ${String((action as { type?: unknown }).type)}`,
      );
}
}

export function scoreDeltaByAdultSource(
  state: AdultState,
  source: AdultEffectSource,
): Readonly<Record<ScoreId, number>> {
  const totals: Record<ScoreId, number> = { health: 0, happiness: 0, money: 0 };
  for (const effect of state.effects) {
    if (effect.source === source) totals[effect.scoreId] += effect.actualDelta;
  }
  return immutable(totals);
}
