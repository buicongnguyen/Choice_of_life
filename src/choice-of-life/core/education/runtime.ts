import {
  applyScoreDelta,
  assertCoreScores,
  createCoreScores,
  type CoreScores,
} from "../score-model";
import {
  CAREER_QUALIFICATIONS,
  EDUCATION_ROUTES,
  EXAM_PREPARATION_CHOICES,
  RETRAINING_CREDENTIALS,
  RETRAINING_DURATION_MONTHS,
  RETRAINING_EFFECTS,
  RETRAINING_OPTION,
  SCHOOL_GRADE_ORDER,
} from "./content";
import type {
  CareerPathOption,
  CareerQualification,
  CareerQualificationId,
  EducationCredential,
  EducationCredentialId,
  EducationEffectEntry,
  EducationGradeResult,
  EducationRouteAvailability,
  EducationRouteId,
  EducationRouteRecord,
  EducationScoreEffect,
  EducationSetup,
  EducationState,
  EducationSupportLevel,
  EducationValidationResult,
  ExamPreparationChoiceId,
  PrimaryEducationRouteId,
  RetrainingOption,
  SchoolGrade,
} from "./types";

const DEFAULT_SCORES: CoreScores = Object.freeze({
  health: 70,
  happiness: 70,
  money: 50,
});

const EDUCATION_CREDENTIAL_IDS: readonly EducationCredentialId[] =
  Object.freeze([
    "credential-high-school-basic-v1",
    "credential-high-school-good-v1",
    "credential-high-school-excellent-v1",
    "credential-foundation-year-v1",
    "credential-professional-degree-v1",
    "credential-practical-diploma-v1",
    "credential-work-experience-v1",
    "credential-professional-retraining-v1",
    "credential-practical-retraining-v1",
    "credential-direct-work-retraining-v1",
  ]);

const SUPPORT_ACADEMIC_BONUS: Readonly<
  Record<EducationSupportLevel, number>
> = Object.freeze({ none: 0, some: 4, strong: 8 });

const SUPPORT_FUNDING_BONUS: Readonly<
  Record<EducationSupportLevel, number>
> = Object.freeze({ none: 0, some: 15, strong: 30 });

const GRADE_MINIMUM_SCORE: Readonly<Record<SchoolGrade, number>> =
  Object.freeze({ basic: 0, good: 55, excellent: 78 });

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
}

function clampAcademicScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gradeForScore(score: number): SchoolGrade {
  if (score >= GRADE_MINIMUM_SCORE.excellent) return "excellent";
  if (score >= GRADE_MINIMUM_SCORE.good) return "good";
  return "basic";
}

function improveGrade(grade: SchoolGrade): SchoolGrade {
  if (grade === "basic") return "good";
  return "excellent";
}

function highSchoolCredentialId(grade: SchoolGrade): EducationCredentialId {
  if (grade === "excellent") return "credential-high-school-excellent-v1";
  if (grade === "good") return "credential-high-school-good-v1";
  return "credential-high-school-basic-v1";
}

function credentialKind(
  credentialId: EducationCredentialId,
): EducationCredential["kind"] {
  if (credentialId.startsWith("credential-high-school")) return "school";
  if (credentialId === "credential-foundation-year-v1") return "foundation";
  if (
    credentialId === "credential-work-experience-v1" ||
    credentialId === "credential-direct-work-retraining-v1"
  ) {
    return "experience";
  }
  if (
    credentialId === "credential-practical-diploma-v1" ||
    credentialId === "credential-practical-retraining-v1"
  ) {
    return "training";
  }
  return "education";
}

function createCredential(
  credentialId: EducationCredentialId,
  earnedAgeMonths: number,
  sourceRouteId: EducationRouteId | null,
): EducationCredential {
  return Object.freeze({
    credentialId,
    kind: credentialKind(credentialId),
    earnedAgeMonths,
    sourceRouteId,
  });
}

function withCredential(
  credentials: readonly EducationCredential[],
  credential: EducationCredential,
): readonly EducationCredential[] {
  return Object.freeze([
    ...credentials.filter(
      (existing) => existing.credentialId !== credential.credentialId,
    ),
    credential,
  ]);
}

function applyEducationEffects(
  state: EducationState,
  effects: readonly EducationScoreEffect[],
  source: EducationEffectEntry["source"],
  causedById: ExamPreparationChoiceId | EducationRouteId,
): Pick<EducationState, "scores" | "effects"> {
  let scores = state.scores;
  const entries: EducationEffectEntry[] = [];

  for (const [index, effect] of effects.entries()) {
    const change = applyScoreDelta(scores, effect.scoreId, effect.requestedDelta);
    scores = change.scores;
    entries.push(
      Object.freeze({
        effectId: `${state.runId}-education-effect-${state.effects.length + index + 1}`,
        source,
        scoreId: effect.scoreId,
        requestedDelta: effect.requestedDelta,
        actualDelta: change.actualDelta,
        before: change.before,
        after: change.after,
        causedById,
      }),
    );
  }

  return Object.freeze({
    scores,
    effects: Object.freeze([...state.effects, ...entries]),
  });
}

function requirePhase(state: EducationState, expected: EducationState["phase"]): void {
  if (state.phase !== expected) {
    throw new Error(`Education phase must be ${expected}; received ${state.phase}`);
  }
}

function requireExamResult(state: EducationState): EducationGradeResult {
  if (state.gradeResult === null) {
    throw new Error("The education exam must be resolved before choosing a route");
  }
  return state.gradeResult;
}

export function createEducationState(setup: EducationSetup): EducationState {
  if (typeof setup.runId !== "string" || setup.runId.trim().length === 0) {
    throw new TypeError("runId must be a non-empty string");
  }

  const ageMonths = setup.ageMonths ?? 198;
  const priorAchievement = setup.priorAchievement ?? 60;
  const supportLevel = setup.supportLevel ?? "some";
  const scores = createCoreScores(setup.scores ?? DEFAULT_SCORES);

  assertIntegerInRange(ageMonths, 144, 360, "ageMonths");
  assertIntegerInRange(priorAchievement, 0, 100, "priorAchievement");
  if (!(supportLevel in SUPPORT_ACADEMIC_BONUS)) {
    throw new TypeError("supportLevel must be none, some, or strong");
  }

  return Object.freeze({
    schemaVersion: 1,
    contentVersion: "education-runtime-v1",
    runId: setup.runId.trim(),
    phase: "exam-preparation",
    ageMonths,
    scores,
    supportLevel,
    priorAchievement,
    preparationChoiceId: null,
    gradeResult: null,
    credentials: Object.freeze([]),
    routeHistory: Object.freeze([]),
    qualificationRouteId: null,
    foundationCompleted: false,
    effects: Object.freeze([]),
  });
}

export function chooseExamPreparation(
  state: EducationState,
  choiceId: ExamPreparationChoiceId,
): EducationState {
  requirePhase(state, "exam-preparation");
  const choice = EXAM_PREPARATION_CHOICES[choiceId];
  if (!choice) throw new RangeError(`Unknown exam preparation choice: ${choiceId}`);

  const applied = applyEducationEffects(
    state,
    choice.effects,
    "preparation",
    choiceId,
  );
  return Object.freeze({
    ...state,
    phase: "exam",
    ageMonths: state.ageMonths + choice.durationMonths,
    scores: applied.scores,
    effects: applied.effects,
    preparationChoiceId: choiceId,
  });
}

export function resolveEducationExam(
  state: EducationState,
  runnerPerformance: number,
): EducationState {
  requirePhase(state, "exam");
  assertIntegerInRange(runnerPerformance, 0, 100, "runnerPerformance");
  if (state.preparationChoiceId === null) {
    throw new Error("Exam preparation choice is missing");
  }

  const choice = EXAM_PREPARATION_CHOICES[state.preparationChoiceId];
  const baselineAcademicScore = clampAcademicScore(
    state.priorAchievement * 0.72 +
      choice.studyPower +
      SUPPORT_ACADEMIC_BONUS[state.supportLevel],
  );
  const runnerContribution = Math.max(
    -5,
    Math.min(5, Math.round((runnerPerformance - 50) / 10)),
  );
  const academicScore = clampAcademicScore(
    baselineAcademicScore + runnerContribution,
  );
  const grade = gradeForScore(academicScore);
  const gradeResult: EducationGradeResult = Object.freeze({
    academicScore,
    baselineAcademicScore,
    runnerContribution,
    grade,
    baselineGrade: gradeForScore(baselineAcademicScore),
    preparationChoiceId: state.preparationChoiceId,
  });
  const credential = createCredential(
    highSchoolCredentialId(grade),
    state.ageMonths,
    null,
  );

  return Object.freeze({
    ...state,
    phase: "route-selection",
    gradeResult,
    credentials: withCredential(
      state.credentials.filter(
        (existing) => !existing.credentialId.startsWith("credential-high-school"),
      ),
      credential,
    ),
  });
}

export function effectiveEducationFunding(state: EducationState): number {
  return state.scores.money + SUPPORT_FUNDING_BONUS[state.supportLevel];
}

export function hasEducationCredential(
  state: Pick<EducationState, "credentials">,
  credentialId: EducationCredentialId,
): boolean {
  return state.credentials.some(
    (credential) => credential.credentialId === credentialId,
  );
}

export function validateEducationRoute(
  state: EducationState,
  routeId: EducationRouteId,
): EducationRouteAvailability {
  const route = EDUCATION_ROUTES[routeId];
  if (!route) throw new RangeError(`Unknown education route: ${routeId}`);

  const reasons: string[] = [];
  const result = state.gradeResult;
  const effectiveFunding = effectiveEducationFunding(state);
  if (result === null) {
    reasons.push("Complete the exam before selecting an education route.");
  } else if (
    SCHOOL_GRADE_ORDER[result.grade] < SCHOOL_GRADE_ORDER[route.minimumGrade]
  ) {
    reasons.push(`This route requires a ${route.minimumGrade} grade.`);
  }
  if (effectiveFunding < route.minimumEffectiveFunding) {
    reasons.push(
      `This route needs ${route.minimumEffectiveFunding} effective funding; ${effectiveFunding} is available.`,
    );
  }
  if (route.isRepairRoute && state.foundationCompleted) {
    reasons.push("The foundation year has already been completed.");
  }
  if (
    !route.isRepairRoute &&
    state.routeHistory.some(
      (record) => record.routeId === routeId && !record.retraining,
    )
  ) {
    reasons.push("This education route has already been completed.");
  }

  return Object.freeze({
    route,
    eligible: reasons.length === 0,
    reasons: Object.freeze(reasons),
    effectiveFunding,
  });
}

export function getEducationRouteOptions(
  state: EducationState,
): readonly EducationRouteAvailability[] {
  return Object.freeze(
    (Object.keys(EDUCATION_ROUTES) as EducationRouteId[]).map((routeId) =>
      validateEducationRoute(state, routeId),
    ),
  );
}

export function selectEducationRoute(
  state: EducationState,
  routeId: EducationRouteId,
): EducationState {
  requirePhase(state, "route-selection");
  const availability = validateEducationRoute(state, routeId);
  if (!availability.eligible) {
    throw new Error(availability.reasons.join(" "));
  }

  const route = availability.route;
  const startedAgeMonths = state.ageMonths;
  const completedAgeMonths = startedAgeMonths + route.durationMonths;
  const source = route.isRepairRoute
    ? "foundation-repair"
    : "education-route";
  const applied = applyEducationEffects(state, route.effects, source, routeId);
  const credential = createCredential(
    route.credentialId,
    completedAgeMonths,
    routeId,
  );
  const routeRecord: EducationRouteRecord = Object.freeze({
    routeId,
    startedAgeMonths,
    completedAgeMonths,
    credentialId: credential.credentialId,
    retraining: false,
  });

  if (route.isRepairRoute) {
    const previousResult = requireExamResult(state);
    const repairedGrade = improveGrade(previousResult.grade);
    const repairedScore = Math.max(
      previousResult.academicScore,
      GRADE_MINIMUM_SCORE[repairedGrade],
    );
    const gradeResult: EducationGradeResult = Object.freeze({
      ...previousResult,
      academicScore: repairedScore,
      baselineAcademicScore: Math.max(
        previousResult.baselineAcademicScore,
        GRADE_MINIMUM_SCORE[repairedGrade],
      ),
      grade: repairedGrade,
      baselineGrade: repairedGrade,
    });
    const repairedSchoolCredential = createCredential(
      highSchoolCredentialId(repairedGrade),
      completedAgeMonths,
      routeId,
    );

    return Object.freeze({
      ...state,
      phase: "route-selection",
      ageMonths: completedAgeMonths,
      scores: applied.scores,
      effects: applied.effects,
      gradeResult,
      credentials: withCredential(
        withCredential(
          state.credentials.filter(
            (existing) =>
              !existing.credentialId.startsWith("credential-high-school"),
          ),
          repairedSchoolCredential,
        ),
        credential,
      ),
      routeHistory: Object.freeze([...state.routeHistory, routeRecord]),
      qualificationRouteId: routeId,
      foundationCompleted: true,
    });
  }

  return Object.freeze({
    ...state,
    phase: "qualified",
    ageMonths: completedAgeMonths,
    scores: applied.scores,
    effects: applied.effects,
    credentials: withCredential(state.credentials, credential),
    routeHistory: Object.freeze([...state.routeHistory, routeRecord]),
    qualificationRouteId: routeId,
  });
}

export function getCareerQualification(
  qualificationId: CareerQualificationId,
): CareerQualification {
  const qualification = CAREER_QUALIFICATIONS.find(
    (candidate) => candidate.qualificationId === qualificationId,
  );
  if (!qualification) {
    throw new RangeError(`Unknown career qualification: ${qualificationId}`);
  }
  return qualification;
}

export function isQualifiedForCareer(
  state: EducationState,
  qualificationId: CareerQualificationId,
): boolean {
  if (state.gradeResult === null) return false;
  const qualification = getCareerQualification(qualificationId);
  return (
    SCHOOL_GRADE_ORDER[state.gradeResult.grade] >=
      SCHOOL_GRADE_ORDER[qualification.minimumGrade] &&
    qualification.requiredAnyCredentialIds.some((credentialId) =>
      hasEducationCredential(state, credentialId),
    )
  );
}

export function getCareerQualifications(
  state: EducationState,
  routeId: EducationRouteId | null = state.qualificationRouteId,
): readonly CareerQualification[] {
  if (routeId === null) return Object.freeze([]);
  return Object.freeze(
    CAREER_QUALIFICATIONS.filter(
      (qualification) =>
        qualification.routeId === routeId &&
        isQualifiedForCareer(state, qualification.qualificationId),
    ),
  );
}

function retrainingTargetIds(
  state: EducationState,
): readonly PrimaryEducationRouteId[] {
  const grade = state.gradeResult?.grade ?? "basic";
  return Object.freeze(
    RETRAINING_OPTION.targetRouteIds.filter((routeId) => {
      if (routeId === state.qualificationRouteId) return false;
      if (routeId === "education-route-professional-v1") {
        return (
          SCHOOL_GRADE_ORDER[grade] >= SCHOOL_GRADE_ORDER.good ||
          state.foundationCompleted
        );
      }
      return true;
    }),
  );
}

export function getRetrainingOption(state: EducationState): RetrainingOption {
  return Object.freeze({
    ...RETRAINING_OPTION,
    targetRouteIds: retrainingTargetIds(state),
  });
}

export function getCareerPathOptions(
  state: EducationState,
): readonly CareerPathOption[] {
  const careers = getCareerQualifications(state).map(
    (qualification) =>
      Object.freeze({ kind: "career" as const, qualification }),
  );
  return Object.freeze([...careers, getRetrainingOption(state)]);
}

export function retrainEducation(
  state: EducationState,
  targetRouteId: PrimaryEducationRouteId,
): EducationState {
  if (state.phase !== "qualified" || state.qualificationRouteId === null) {
    throw new Error("Complete an education route before retraining");
  }
  if (!retrainingTargetIds(state).includes(targetRouteId)) {
    throw new Error("That retraining path is not available from the current route");
  }

  const startedAgeMonths = state.ageMonths;
  const completedAgeMonths =
    startedAgeMonths + RETRAINING_DURATION_MONTHS[targetRouteId];
  const credentialId = RETRAINING_CREDENTIALS[targetRouteId];
  const applied = applyEducationEffects(
    state,
    RETRAINING_EFFECTS[targetRouteId],
    "retraining",
    targetRouteId,
  );
  const credential = createCredential(
    credentialId,
    completedAgeMonths,
    targetRouteId,
  );
  const routeRecord: EducationRouteRecord = Object.freeze({
    routeId: targetRouteId,
    startedAgeMonths,
    completedAgeMonths,
    credentialId,
    retraining: true,
  });

  return Object.freeze({
    ...state,
    phase: "qualified",
    ageMonths: completedAgeMonths,
    scores: applied.scores,
    effects: applied.effects,
    credentials: withCredential(state.credentials, credential),
    routeHistory: Object.freeze([...state.routeHistory, routeRecord]),
    qualificationRouteId: targetRouteId,
  });
}

export function validateEducationCredential(
  credential: EducationCredential,
  currentAgeMonths?: number,
): EducationValidationResult {
  const issues: string[] = [];
  if (!EDUCATION_CREDENTIAL_IDS.includes(credential.credentialId)) {
    issues.push("Unknown credential ID.");
  }
  if (!Number.isInteger(credential.earnedAgeMonths) || credential.earnedAgeMonths < 0) {
    issues.push("Credential age must be a non-negative integer.");
  }
  if (
    currentAgeMonths !== undefined &&
    credential.earnedAgeMonths > currentAgeMonths
  ) {
    issues.push("Credential cannot be earned after the current age.");
  }
  if (
    credential.credentialId.startsWith("credential-high-school") &&
    credential.kind !== "school"
  ) {
    issues.push("High-school credentials must use the school kind.");
  }
  if (
    credential.credentialId === "credential-foundation-year-v1" &&
    credential.sourceRouteId !== "education-route-foundation-year-v1"
  ) {
    issues.push("Foundation credential must come from the foundation route.");
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function validateEducationState(
  state: EducationState,
): EducationValidationResult {
  const issues: string[] = [];
  if (state.schemaVersion !== 1 || state.contentVersion !== "education-runtime-v1") {
    issues.push("Unsupported education state version.");
  }
  if (typeof state.runId !== "string" || state.runId.trim().length === 0) {
    issues.push("runId must be a non-empty string.");
  }
  if (!Number.isInteger(state.ageMonths) || state.ageMonths < 144) {
    issues.push("ageMonths must be an integer of at least 144.");
  }
  if (
    !Number.isInteger(state.priorAchievement) ||
    state.priorAchievement < 0 ||
    state.priorAchievement > 100
  ) {
    issues.push("priorAchievement must be an integer from 0 to 100.");
  }
  try {
    assertCoreScores(state.scores);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Invalid core scores.");
  }
  if (!(state.supportLevel in SUPPORT_ACADEMIC_BONUS)) {
    issues.push("Unknown support level.");
  }
  if (state.phase === "exam-preparation" && state.preparationChoiceId !== null) {
    issues.push("Preparation cannot be selected before the exam phase.");
  }
  if (
    (state.phase === "route-selection" || state.phase === "qualified") &&
    state.gradeResult === null
  ) {
    issues.push("A resolved grade is required after the exam.");
  }
  if (state.gradeResult !== null) {
    if (gradeForScore(state.gradeResult.academicScore) !== state.gradeResult.grade) {
      issues.push("Grade does not match the academic score.");
    }
    if (state.gradeResult.preparationChoiceId !== state.preparationChoiceId) {
      issues.push("Grade result does not match the preparation choice.");
    }
  }

  const credentialIds = new Set<EducationCredentialId>();
  for (const credential of state.credentials) {
    if (credentialIds.has(credential.credentialId)) {
      issues.push(`Duplicate credential: ${credential.credentialId}.`);
    }
    credentialIds.add(credential.credentialId);
    issues.push(
      ...validateEducationCredential(credential, state.ageMonths).issues.map(
        (issue) => `${credential.credentialId}: ${issue}`,
      ),
    );
  }

  let latestCompletedAge = 0;
  for (const record of state.routeHistory) {
    if (
      !Number.isInteger(record.startedAgeMonths) ||
      !Number.isInteger(record.completedAgeMonths) ||
      record.completedAgeMonths <= record.startedAgeMonths ||
      record.startedAgeMonths < latestCompletedAge ||
      record.completedAgeMonths > state.ageMonths
    ) {
      issues.push(`Route age sequence is invalid for ${record.routeId}.`);
    }
    if (!credentialIds.has(record.credentialId)) {
      issues.push(`Route ${record.routeId} is missing credential ${record.credentialId}.`);
    }
    latestCompletedAge = Math.max(latestCompletedAge, record.completedAgeMonths);
  }
  if (
    state.foundationCompleted !==
    credentialIds.has("credential-foundation-year-v1")
  ) {
    issues.push("Foundation completion does not match its credential.");
  }
  if (
    state.qualificationRouteId !== null &&
    getCareerQualifications(state, state.qualificationRouteId).length === 0
  ) {
    issues.push("Qualification route has no credential-valid career outcome.");
  }

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}
