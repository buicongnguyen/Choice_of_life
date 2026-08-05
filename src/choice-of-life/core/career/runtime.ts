import { deepFreeze } from "../immutable";
import {
  applyScoreDelta,
  createCoreScores,
  type CoreScores,
  type ScoreId,
} from "../score-model";
import {
  DEFAULT_CAREER_CATALOG,
  getCareerDefinition,
} from "./catalog";
import { createCareerProvisionalEnding } from "./ending";
import type {
  CareerAction,
  CareerCallbackRecord,
  CareerCatalog,
  CareerCredentialId,
  CareerDecisionOption,
  CareerDefinition,
  CareerEffectEntry,
  CareerEffectRequest,
  CareerEffectSource,
  CareerId,
  CareerOffer,
  CareerOfferRequest,
  CareerOfferSet,
  CareerOutfitVariant,
  CareerPendingDecision,
  CareerPerson,
  CareerPressureDecision,
  CareerPressureOptionId,
  CareerQualificationPath,
  CareerQualificationProfile,
  CareerRetrainingOffer,
  CareerSchoolGrade,
  CareerSetup,
  CareerState,
  DoctorEmergencyDecision,
  DoctorEmergencyOptionId,
} from "./types";

const CYCLE_MONTHS = 4;
const CAREER_STAGE_CYCLES = 3;
const COLLEAGUE_NAMES = [
  "Mina",
  "Noah",
  "Asha",
  "Leo",
  "Hana",
  "Mateo",
  "Nia",
  "Eli",
] as const;

const GRADE_RANK: Readonly<Record<CareerSchoolGrade, number>> = {
  basic: 0,
  good: 1,
  excellent: 2,
};

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

function unique<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function normalizedAge(ageYears: number): number {
  return Math.round(ageYears * 12) / 12;
}

function normalizeProfile(
  profile: CareerQualificationProfile,
): CareerQualificationProfile {
  if (!Number.isFinite(profile.ageYears) || profile.ageYears < 14) {
    throw new RangeError("Career ageYears must be a finite number of at least 14");
  }
  return immutable({
    ...profile,
    ageYears: normalizedAge(profile.ageYears),
    credentials: unique(profile.credentials),
    experienceTags: unique(profile.experienceTags),
  });
}

function pathMatches(
  path: CareerQualificationPath,
  profile: CareerQualificationProfile,
  scores: CoreScores,
): boolean {
  const credentials = new Set(profile.credentials);
  const experience = new Set(profile.experienceTags);
  if (
    path.minimumGrade !== undefined &&
    GRADE_RANK[profile.grade] < GRADE_RANK[path.minimumGrade]
  ) {
    return false;
  }
  if (path.minimumMoney !== undefined && scores.money < path.minimumMoney) {
    return false;
  }
  if (
    path.allowedRoutes !== undefined &&
    !path.allowedRoutes.includes(profile.route)
  ) {
    return false;
  }
  if (
    path.allCredentials !== undefined &&
    !path.allCredentials.every((credential) => credentials.has(credential))
  ) {
    return false;
  }
  if (
    path.anyCredentials !== undefined &&
    !path.anyCredentials.some((credential) => credentials.has(credential))
  ) {
    return false;
  }
  if (
    path.allExperienceTags !== undefined &&
    !path.allExperienceTags.every((tag) => experience.has(tag))
  ) {
    return false;
  }
  if (
    path.anyExperienceTags !== undefined &&
    !path.anyExperienceTags.some((tag) => experience.has(tag))
  ) {
    return false;
  }
  return true;
}

function pathSpecificity(path: CareerQualificationPath): number {
  return (
    (path.allCredentials?.length ?? 0) * 4 +
    (path.anyCredentials?.length ?? 0) * 3 +
    (path.allExperienceTags?.length ?? 0) * 2 +
    (path.anyExperienceTags?.length ?? 0) +
    (path.minimumGrade === undefined ? 0 : 1) +
    (path.minimumMoney === undefined ? 0 : 1) +
    (path.allowedRoutes === undefined ? 0 : 1)
  );
}

export function findCareerQualificationPath(
  definition: CareerDefinition,
  profile: CareerQualificationProfile,
  scores: CoreScores,
): CareerQualificationPath | null {
  return (
    definition.qualificationPaths
      .filter((path) => pathMatches(path, profile, scores))
      .sort((left, right) => pathSpecificity(right) - pathSpecificity(left))[0] ??
    null
  );
}

export function isCareerQualified(
  careerId: CareerId,
  profile: CareerQualificationProfile,
  scores: CoreScores,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): boolean {
  return (
    findCareerQualificationPath(
      getCareerDefinition(careerId, catalog),
      profile,
      scores,
    ) !== null
  );
}

export function listQualifiedCareers(
  profile: CareerQualificationProfile,
  scores: CoreScores,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): readonly CareerDefinition[] {
  return Object.freeze(
    catalog.orderedCareerIds
      .map((careerId) => catalog.careers[careerId])
      .filter(
        (definition) =>
          findCareerQualificationPath(definition, profile, scores) !== null,
      ),
  );
}

function entryStatus(
  definition: CareerDefinition,
  profile: CareerQualificationProfile,
): "entry" | "trainee" | "qualified" {
  if (definition.careerId === "doctor") {
    return profile.credentials.includes("medical-residency")
      ? "qualified"
      : "trainee";
  }
  const hasFormalRequirement = definition.qualificationPaths.some(
    (path) =>
      (path.allCredentials?.length ?? 0) > 0 ||
      (path.anyCredentials?.length ?? 0) > 0,
  );
  return hasFormalRequirement ? "qualified" : "entry";
}

function toCareerOffer(
  definition: CareerDefinition,
  path: CareerQualificationPath,
  round: number,
  profile: CareerQualificationProfile,
): CareerOffer {
  const status = entryStatus(definition, profile);
  return immutable({
    offerId: `career-offer-${round}-${definition.careerId}`,
    kind: "career" as const,
    careerId: definition.careerId,
    title: definition.title,
    roleTitle:
      status === "qualified"
        ? definition.qualifiedRoleTitle
        : definition.entryRoleTitle,
    summary: definition.summary,
    entryStatus: status,
    qualificationPathId: path.pathId,
    qualificationLabel: path.label,
    labels: definition.labels,
    outfitPreview: definition.outfits,
  });
}

function selectRetrainingOffer(
  request: CareerOfferRequest,
  catalog: CareerCatalog,
  round: number,
): CareerRetrainingOffer {
  const candidates = catalog.orderedCareerIds
    .map((careerId) => catalog.careers[careerId])
    .filter(
      (definition) =>
        definition.retraining !== null &&
        findCareerQualificationPath(
          definition,
          request.profile,
          request.scores,
        ) === null,
    )
    .sort(
      (left, right) =>
        stableHash(`${request.runSeed}:retrain:${round}:${left.careerId}`) -
        stableHash(`${request.runSeed}:retrain:${round}:${right.careerId}`),
    );
  const target = candidates[0] ?? catalog.careers.teacher;
  const program = target.retraining ?? {
    programId: "career-refresh-v1",
    title: "Broaden your professional skills",
    description: "Take a short supported placement before reviewing your options again.",
    durationMonths: 6,
    costMoneyDelta: -3,
    grantsCredentials: [] as readonly CareerCredentialId[],
  };
  return immutable({
    offerId: `career-retraining-${round}-${target.careerId}`,
    kind: "retraining" as const,
    targetCareerId: target.careerId,
    targetTitle: target.title,
    title: program.title,
    description: program.description,
    durationMonths: program.durationMonths,
    costMoneyDelta: program.costMoneyDelta,
    grantsCredentials: program.grantsCredentials,
  });
}

export function createCareerOfferSet(
  request: CareerOfferRequest,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerOfferSet {
  if (request.runSeed.trim().length === 0) {
    throw new TypeError("Career offer runSeed must not be empty");
  }
  const round = request.offerRound ?? 0;
  const requestedCount =
    request.offerCount ??
    ((2 + (stableHash(`${request.runSeed}:offer-count:${round}`) % 2)) as 2 | 3);
  const qualified = listQualifiedCareers(
    request.profile,
    request.scores,
    catalog,
  );
  if (qualified.length < 2) {
    throw new Error("A career offer set requires at least two qualified careers");
  }

  const ranked = [...qualified].sort(
    (left, right) =>
      stableHash(`${request.runSeed}:offer:${round}:${left.careerId}`) -
      stableHash(`${request.runSeed}:offer:${round}:${right.careerId}`),
  );
  if (request.priorityCareerId !== undefined) {
    const priorityIndex = ranked.findIndex(
      (definition) => definition.careerId === request.priorityCareerId,
    );
    if (priorityIndex > 0) {
      const [priority] = ranked.splice(priorityIndex, 1);
      ranked.unshift(priority);
    }
  }

  const count = Math.min(requestedCount, ranked.length);
  const careerOffers = ranked.slice(0, count).map((definition) => {
    const path = findCareerQualificationPath(
      definition,
      request.profile,
      request.scores,
    );
    if (path === null) {
      throw new Error(`Career ${definition.careerId} lost qualification during offer creation`);
    }
    return toCareerOffer(definition, path, round, request.profile);
  });

  return immutable({
    offerRound: round,
    careerOffers,
    retrainingOffer: selectRetrainingOffer(request, catalog, round),
  });
}

function assertSetup(setup: CareerSetup): void {
  if (setup.runId.trim().length === 0) {
    throw new TypeError("Career runId must not be empty");
  }
  if (setup.runSeed.trim().length === 0) {
    throw new TypeError("Career runSeed must not be empty");
  }
}

export function createCareerState(
  setup: CareerSetup,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerState {
  assertSetup(setup);
  const profile = normalizeProfile(setup.profile);
  const scores = createCoreScores(setup.scores);
  return immutable({
    schemaVersion: 1 as const,
    contentVersion: "career-runtime-v1" as const,
    stageId: "first-career-v1" as const,
    runId: setup.runId,
    runSeed: setup.runSeed,
    phase: "offers" as const,
    season: setup.season ?? "standard",
    scores,
    profile,
    offerSet: createCareerOfferSet(
      {
        runSeed: setup.runSeed,
        profile,
        scores,
        offerCount: setup.offerCount,
      },
      catalog,
    ),
    selectedRole: null,
    pendingDecision: null,
    effects: [],
    settlements: [],
    callbacks: [],
    facts: [...(setup.facts ?? [])],
    people: [...(setup.people ?? [])],
    story: [],
    ending: null,
  });
}

function deterministicColleague(
  state: CareerState,
  definition: CareerDefinition,
): CareerPerson {
  const index =
    stableHash(`${state.runSeed}:colleague:${definition.careerId}`) %
    COLLEAGUE_NAMES.length;
  return immutable({
    personId: `career-colleague-${definition.careerId}-v1`,
    name: COLLEAGUE_NAMES[index],
    role: definition.pressureStory.supportRole,
    relationship: "colleague" as const,
  });
}

export function chooseCareerOffer(
  state: CareerState,
  offerId: string,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerState {
  if (state.phase !== "offers") {
    throw new Error("A career can only be chosen while offers are open");
  }
  const offer = state.offerSet.careerOffers.find(
    (candidate) => candidate.offerId === offerId,
  );
  if (offer === undefined) {
    throw new RangeError(`Unknown or unavailable career offer: ${offerId}`);
  }
  const definition = getCareerDefinition(offer.careerId, catalog);
  const colleague = deterministicColleague(state, definition);
  const people = state.people.some(
    (person) => person.personId === colleague.personId,
  )
    ? state.people
    : [...state.people, colleague];

  return immutable({
    ...state,
    phase: "active" as const,
    selectedRole: {
      careerId: offer.careerId,
      roleTitle: offer.roleTitle,
      status: offer.entryStatus,
      selectedOfferId: offer.offerId,
      selectedQualificationPathId: offer.qualificationPathId,
      startedAgeYears: state.profile.ageYears,
      cyclesCompleted: 0,
      monthsCompleted: 0,
    },
    facts: [
      ...state.facts,
      {
        factId: `fact-career-selected-${offer.careerId}-v1`,
        label: "First career",
        value: `${offer.title} via ${offer.qualificationLabel}`,
        source: "career" as const,
      },
    ],
    people,
    story: [
      ...state.story,
      {
        eventId: `career-selected-${offer.careerId}-v1`,
        kind: "career-selected" as const,
        cycleIndex: 0,
        text: `You began work as ${offer.roleTitle}.`,
      },
    ],
  });
}

interface EffectProjection {
  readonly scores: CoreScores;
  readonly effects: readonly CareerEffectEntry[];
  readonly appliedEffectIds: readonly string[];
}

function applyEffects(
  scores: CoreScores,
  effects: readonly CareerEffectEntry[],
  requests: readonly CareerEffectRequest[],
  source: CareerEffectSource,
  cycleIndex: number,
  causedByDecisionId: string | null,
): EffectProjection {
  let nextScores = scores;
  const nextEffects = [...effects];
  const appliedEffectIds: string[] = [];

  for (const request of requests) {
    const change = applyScoreDelta(
      nextScores,
      request.scoreId,
      request.requestedDelta,
    );
    const effectId = `career-effect-${(nextEffects.length + 1)
      .toString()
      .padStart(4, "0")}`;
    nextEffects.push({
      effectId,
      source,
      categoryId: request.categoryId,
      scoreId: request.scoreId,
      requestedDelta: request.requestedDelta,
      actualDelta: change.actualDelta,
      before: change.before,
      after: change.after,
      cycleIndex,
      causedByDecisionId,
    });
    appliedEffectIds.push(effectId);
    nextScores = change.scores;
  }

  return immutable({
    scores: nextScores,
    effects: nextEffects,
    appliedEffectIds,
  });
}

export function chooseCareerRetraining(
  state: CareerState,
  offerId: string,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerState {
  if (state.phase !== "offers") {
    throw new Error("Retraining can only be chosen while offers are open");
  }
  const offer = state.offerSet.retrainingOffer;
  if (offer.offerId !== offerId) {
    throw new RangeError(`Unknown or unavailable retraining offer: ${offerId}`);
  }
  const projection = applyEffects(
    state.scores,
    state.effects,
    [
      {
        scoreId: "money",
        requestedDelta: offer.costMoneyDelta,
        categoryId: "career-retraining-cost-v1",
      },
    ],
    "retraining",
    0,
    offer.offerId,
  );
  const profile = normalizeProfile({
    ...state.profile,
    ageYears: state.profile.ageYears + offer.durationMonths / 12,
    credentials: unique([
      ...state.profile.credentials,
      ...offer.grantsCredentials,
    ]),
  });
  const offerRound = state.offerSet.offerRound + 1;
  const offerSet = createCareerOfferSet(
    {
      runSeed: state.runSeed,
      profile,
      scores: projection.scores,
      offerRound,
      priorityCareerId: offer.targetCareerId,
    },
    catalog,
  );

  return immutable({
    ...state,
    scores: projection.scores,
    profile,
    offerSet,
    effects: projection.effects,
    facts: [
      ...state.facts,
      {
        factId: `fact-retraining-${offerRound}-${offer.targetCareerId}`,
        label: "Retraining",
        value: `${offer.title} (${offer.durationMonths} months)`,
        source: "retraining" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `retraining-complete-${offerRound}`,
        kind: "retraining-complete" as const,
        cycleIndex: 0,
        text: `You completed ${offer.title.toLowerCase()} and opened new qualified routes.`,
      },
    ],
  });
}

function pressureOptions(
  definition: CareerDefinition,
): readonly CareerDecisionOption<CareerPressureOptionId>[] {
  const pressure = definition.labels.pressure.level;
  const income = definition.labels.income.level;
  return immutable([
    {
      optionId: "push-through" as const,
      label: "Push through the deadline",
      description: "Protect momentum and income, accepting a heavier wellbeing cost.",
      effects: [
        { scoreId: "money" as const, requestedDelta: Math.max(2, income), categoryId: "career-extra-output-v1" },
        { scoreId: "health" as const, requestedDelta: -(pressure + 1), categoryId: "career-overwork-v1" },
        { scoreId: "happiness" as const, requestedDelta: -Math.max(1, pressure - 1), categoryId: "career-overwork-v1" },
      ],
      factLabel: "Chose to push through a demanding period",
      resultText: "The work moved forward, but your body and mood carried the cost.",
    },
    {
      optionId: "set-boundary" as const,
      label: "Set a clear boundary",
      description: "Protect recovery while accepting a smaller financial gain.",
      effects: [
        { scoreId: "money" as const, requestedDelta: -2, categoryId: "career-boundary-cost-v1" },
        { scoreId: "health" as const, requestedDelta: 4, categoryId: "career-boundary-v1" },
        { scoreId: "happiness" as const, requestedDelta: 3, categoryId: "career-boundary-v1" },
      ],
      factLabel: "Protected a healthy work boundary",
      resultText: "The schedule changed, leaving more energy for the life around work.",
    },
    {
      optionId: "seek-support" as const,
      label: "Ask the team for support",
      description: "Share responsibility and strengthen connection, with a small short-term cost.",
      effects: [
        { scoreId: "money" as const, requestedDelta: -1, categoryId: "career-support-time-v1" },
        { scoreId: "health" as const, requestedDelta: 2, categoryId: "career-shared-load-v1" },
        { scoreId: "happiness" as const, requestedDelta: 4, categoryId: "career-shared-load-v1" },
      ],
      factLabel: "Shared pressure with a trusted colleague",
      resultText: "The work became a shared problem, and the team felt closer.",
    },
  ]);
}

export function createCareerPressureDecision(
  definition: CareerDefinition,
  cycleIndex: number,
): CareerPressureDecision {
  return immutable({
    kind: "pressure" as const,
    decisionId: `career-pressure-${definition.careerId}-${cycleIndex}`,
    callbackId: definition.pressureStory.callbackId,
    cycleIndex,
    title: definition.pressureStory.title,
    prompt: definition.pressureStory.prompt,
    options: pressureOptions(definition),
  });
}

export function createDoctorEmergencyDecision(
  cycleIndex = 1,
): DoctorEmergencyDecision {
  return immutable({
    kind: "doctor-emergency" as const,
    decisionId: "doctor-emergency-shift-v1" as const,
    callbackId: "doctor-emergency-shift-callback-v1" as const,
    cycleIndex,
    title: "An emergency shift",
    prompt: "The hospital needs one more clinician overnight. How do you respond during residency?",
    options: [
      {
        optionId: "lead-emergency-shift" as const,
        label: "Lead the emergency shift",
        description: "Gain experience and income while accepting substantial fatigue.",
        effects: [
          { scoreId: "money" as const, requestedDelta: 7, categoryId: "doctor-emergency-pay-v1" },
          { scoreId: "health" as const, requestedDelta: -6, categoryId: "doctor-emergency-fatigue-v1" },
          { scoreId: "happiness" as const, requestedDelta: -3, categoryId: "doctor-emergency-fatigue-v1" },
        ],
        factLabel: "Led a difficult emergency shift",
        resultText: "You gained confidence and responsibility, then felt the weight of the night.",
      },
      {
        optionId: "share-emergency-shift" as const,
        label: "Share the shift",
        description: "Coordinate with another resident and divide both learning and fatigue.",
        effects: [
          { scoreId: "money" as const, requestedDelta: 3, categoryId: "doctor-shared-shift-pay-v1" },
          { scoreId: "health" as const, requestedDelta: -2, categoryId: "doctor-shared-shift-v1" },
          { scoreId: "happiness" as const, requestedDelta: 3, categoryId: "doctor-shared-shift-v1" },
        ],
        factLabel: "Shared an emergency shift with a colleague",
        resultText: "Teamwork protected the patients and kept the night manageable.",
      },
      {
        optionId: "protect-recovery-time" as const,
        label: "Protect recovery time",
        description: "Decline the extra pay and return rested for the next scheduled shift.",
        effects: [
          { scoreId: "money" as const, requestedDelta: -2, categoryId: "doctor-declined-shift-v1" },
          { scoreId: "health" as const, requestedDelta: 5, categoryId: "doctor-recovery-v1" },
          { scoreId: "happiness" as const, requestedDelta: 2, categoryId: "doctor-recovery-v1" },
        ],
        factLabel: "Protected recovery during residency",
        resultText: "Rest restored your focus for the patients already in your care.",
      },
    ],
  });
}

function variableIncomeDelta(state: CareerState, careerId: CareerId, cycle: number): number {
  if (!["entrepreneur", "athlete", "artist", "farmer"].includes(careerId)) {
    return 0;
  }
  const outcomes = [-2, 0, 3] as const;
  return outcomes[stableHash(`${state.runSeed}:income:${careerId}:${cycle}`) % outcomes.length];
}

function hasResolvedCallback(state: CareerState, callbackId: string): boolean {
  return state.callbacks.some(
    (callback) =>
      callback.callbackId === callbackId && callback.status === "resolved",
  );
}

function presentingCallback(decision: CareerPendingDecision): CareerCallbackRecord {
  return immutable({
    callbackId: decision.callbackId,
    kind: decision.kind,
    status: "presenting" as const,
    cycleIndex: decision.cycleIndex,
    decisionId: decision.decisionId,
    selectedOptionId: null,
    resultText: null,
  });
}

export function settleCareerCycle(
  state: CareerState,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerState {
  if (state.phase !== "active" || state.selectedRole === null) {
    throw new Error("A career cycle can only settle while a selected career is active");
  }
  const definition = getCareerDefinition(state.selectedRole.careerId, catalog);
  const cycleIndex = state.selectedRole.cyclesCompleted + 1;
  const grossIncome =
    definition.economy.salaryMoneyDelta +
    variableIncomeDelta(state, definition.careerId, cycleIndex);
  const moneyBefore = state.scores.money;
  let projection = applyEffects(
    state.scores,
    state.effects,
    [{ scoreId: "money", requestedDelta: grossIncome, categoryId: `${definition.careerId}-salary-v1` }],
    "salary",
    cycleIndex,
    null,
  );
  const salaryIds = projection.appliedEffectIds;
  projection = applyEffects(
    projection.scores,
    projection.effects,
    [{ scoreId: "money", requestedDelta: definition.economy.recurringCostMoneyDelta, categoryId: "career-living-cost-v1" }],
    "cost",
    cycleIndex,
    null,
  );
  const costIds = projection.appliedEffectIds;
  const wellbeingRequests: CareerEffectRequest[] = [];
  if (definition.economy.healthDelta !== 0) {
    wellbeingRequests.push({ scoreId: "health", requestedDelta: definition.economy.healthDelta, categoryId: `${definition.careerId}-health-rhythm-v1` });
  }
  if (definition.economy.happinessDelta !== 0) {
    wellbeingRequests.push({ scoreId: "happiness", requestedDelta: definition.economy.happinessDelta, categoryId: `${definition.careerId}-purpose-rhythm-v1` });
  }
  projection = applyEffects(
    projection.scores,
    projection.effects,
    wellbeingRequests,
    "career-wellbeing",
    cycleIndex,
    null,
  );
  const wellbeingIds = projection.appliedEffectIds;

  let profile = normalizeProfile({
    ...state.profile,
    ageYears: state.profile.ageYears + CYCLE_MONTHS / 12,
  });
  let selectedRole = {
    ...state.selectedRole,
    cyclesCompleted: cycleIndex,
    monthsCompleted: state.selectedRole.monthsCompleted + CYCLE_MONTHS,
  };
  let facts = [...state.facts];
  let story = [
    ...state.story,
    {
      eventId: `career-cycle-settled-${cycleIndex}`,
      kind: "cycle-settled" as const,
      cycleIndex,
      text: `${definition.title} cycle ${cycleIndex} settled salary, costs, and wellbeing together.`,
    },
  ];

  if (
    definition.careerId === "doctor" &&
    selectedRole.status === "trainee" &&
    cycleIndex >= CAREER_STAGE_CYCLES &&
    hasResolvedCallback(state, "doctor-emergency-shift-callback-v1")
  ) {
    profile = normalizeProfile({
      ...profile,
      credentials: unique([
        ...profile.credentials,
        "medical-residency" as const,
      ]),
    });
    selectedRole = {
      ...selectedRole,
      roleTitle: definition.qualifiedRoleTitle,
      status: "qualified" as const,
    };
    facts = [
      ...facts,
      {
        factId: "fact-doctor-qualified-v1",
        label: "Medical qualification",
        value: "Completed residency and became a qualified doctor",
        source: "career" as const,
      },
    ];
    story = [
      ...story,
      {
        eventId: "doctor-qualified-v1",
        kind: "qualification-earned" as const,
        cycleIndex,
        text: "You completed residency and became a qualified doctor.",
      },
    ];
  }

  const settlement = {
    settlementId: `career-settlement-${cycleIndex}`,
    cycleIndex,
    months: CYCLE_MONTHS,
    grossIncomeRequested: grossIncome,
    recurringCostRequested: definition.economy.recurringCostMoneyDelta,
    netMoneyActual: projection.scores.money - moneyBefore,
    appliedEffectIds: [...salaryIds, ...costIds, ...wellbeingIds],
    summary: `Income ${grossIncome >= 0 ? "+" : ""}${grossIncome}, costs ${definition.economy.recurringCostMoneyDelta}; financial security is now ${projection.scores.money}.`,
  };

  let phase: CareerState["phase"] =
    cycleIndex >= CAREER_STAGE_CYCLES ? "settling" : "active";
  let pendingDecision: CareerPendingDecision | null = null;
  let callbacks = [...state.callbacks];
  if (
    definition.careerId === "doctor" &&
    selectedRole.status === "trainee" &&
    cycleIndex === 1 &&
    !hasResolvedCallback(state, "doctor-emergency-shift-callback-v1")
  ) {
    pendingDecision = createDoctorEmergencyDecision(cycleIndex);
    callbacks = [...callbacks, presentingCallback(pendingDecision)];
    phase = "doctor-emergency-choice";
  } else if (
    cycleIndex === 2 &&
    !hasResolvedCallback(state, definition.pressureStory.callbackId)
  ) {
    pendingDecision = createCareerPressureDecision(definition, cycleIndex);
    callbacks = [...callbacks, presentingCallback(pendingDecision)];
    phase = "pressure-choice";
  }

  return immutable({
    ...state,
    phase,
    scores: projection.scores,
    profile,
    selectedRole,
    pendingDecision,
    effects: projection.effects,
    settlements: [...state.settlements, settlement],
    callbacks,
    facts,
    story,
  });
}

function resolveDecision<TOptionId extends string>(
  state: CareerState,
  expectedKind: CareerPendingDecision["kind"],
  optionId: TOptionId,
  source: "pressure-callback" | "doctor-emergency",
): CareerState {
  const decision = state.pendingDecision;
  if (decision === null || decision.kind !== expectedKind) {
    throw new Error(`No ${expectedKind} decision is currently active`);
  }
  const option = decision.options.find(
    (candidate) => candidate.optionId === optionId,
  );
  if (option === undefined) {
    throw new RangeError(`Unknown ${expectedKind} option: ${optionId}`);
  }
  const projection = applyEffects(
    state.scores,
    state.effects,
    option.effects,
    source,
    decision.cycleIndex,
    decision.decisionId,
  );
  const callbacks = state.callbacks.map((callback) =>
    callback.decisionId === decision.decisionId
      ? {
          ...callback,
          status: "resolved" as const,
          selectedOptionId: option.optionId,
          resultText: option.resultText,
        }
      : callback,
  );

  return immutable({
    ...state,
    phase: "active" as const,
    scores: projection.scores,
    pendingDecision: null,
    effects: projection.effects,
    callbacks,
    facts: [
      ...state.facts,
      {
        factId: `fact-${decision.decisionId}-${option.optionId}`,
        label: expectedKind === "doctor-emergency" ? "Emergency shift choice" : "Work pressure choice",
        value: option.factLabel,
        source: "callback" as const,
      },
    ],
    story: [
      ...state.story,
      {
        eventId: `callback-resolved-${decision.decisionId}`,
        kind: "callback-resolved" as const,
        cycleIndex: decision.cycleIndex,
        text: option.resultText,
      },
    ],
  });
}

export function resolveCareerPressure(
  state: CareerState,
  optionId: CareerPressureOptionId,
): CareerState {
  if (state.phase !== "pressure-choice") {
    throw new Error("A pressure choice can only resolve during its choice phase");
  }
  return resolveDecision(state, "pressure", optionId, "pressure-callback");
}

export function resolveDoctorEmergencyShift(
  state: CareerState,
  optionId: DoctorEmergencyOptionId,
): CareerState {
  if (state.phase !== "doctor-emergency-choice") {
    throw new Error("The emergency shift can only resolve during its choice phase");
  }
  return resolveDecision(
    state,
    "doctor-emergency",
    optionId,
    "doctor-emergency",
  );
}

export function setCareerSeason(
  state: CareerState,
  season: CareerState["season"],
): CareerState {
  return state.season === season ? state : immutable({ ...state, season });
}

export function currentCareerOutfit(
  state: CareerState,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerOutfitVariant | null {
  if (state.selectedRole === null) return null;
  return getCareerDefinition(state.selectedRole.careerId, catalog).outfits[
    state.season
  ];
}

export function canCompleteCareer(state: CareerState): boolean {
  return (
    state.phase === "settling" &&
    state.selectedRole !== null &&
    state.selectedRole.cyclesCompleted >= CAREER_STAGE_CYCLES &&
    state.pendingDecision === null
  );
}

export function completeCareer(state: CareerState): CareerState {
  if (!canCompleteCareer(state)) {
    throw new Error("Career stage cannot complete before all cycles and decisions settle");
  }
  const prepared = immutable({
    ...state,
    phase: "complete" as const,
    story: [
      ...state.story,
      {
        eventId: "first-career-complete-v1",
        kind: "career-complete" as const,
        cycleIndex: state.selectedRole?.cyclesCompleted ?? 0,
        text: "Your first career chapter reached a natural pause.",
      },
    ],
    ending: null,
  });
  return immutable({
    ...prepared,
    ending: createCareerProvisionalEnding(prepared),
  });
}

export function reduceCareer(
  state: CareerState,
  action: CareerAction,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerState {
  switch (action.type) {
    case "choose-career":
      return chooseCareerOffer(state, action.offerId, catalog);
    case "choose-retraining":
      return chooseCareerRetraining(state, action.offerId, catalog);
    case "settle-cycle":
      return settleCareerCycle(state, catalog);
    case "resolve-pressure":
      return resolveCareerPressure(state, action.optionId);
    case "resolve-doctor-emergency":
      return resolveDoctorEmergencyShift(state, action.optionId);
    case "set-season":
      return setCareerSeason(state, action.season);
    case "complete":
      return completeCareer(state);
  }
}

export function scoreDeltaByCareerSource(
  state: CareerState,
  source: CareerEffectSource,
): Readonly<Record<ScoreId, number>> {
  const totals: Record<ScoreId, number> = {
    health: 0,
    happiness: 0,
    money: 0,
  };
  for (const effect of state.effects) {
    if (effect.source === source) {
      totals[effect.scoreId] += effect.actualDelta;
    }
  }
  return immutable(totals);
}
