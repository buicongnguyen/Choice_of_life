import type {
  CareerQualification,
  EducationCredentialId,
  EducationRouteDefinition,
  EducationRouteId,
  ExamPreparationChoice,
  ExamPreparationChoiceId,
  PrimaryEducationRouteId,
  RetrainingOption,
  SchoolGrade,
} from "./types";

export const SCHOOL_GRADE_ORDER: Readonly<Record<SchoolGrade, number>> =
  Object.freeze({ basic: 0, good: 1, excellent: 2 });

function credentialIds(
  ...ids: EducationCredentialId[]
): readonly EducationCredentialId[] {
  return Object.freeze(ids);
}

export const EXAM_PREPARATION_CHOICES: Readonly<
  Record<ExamPreparationChoiceId, ExamPreparationChoice>
> = Object.freeze({
  "education-prep-focused-study-v1": Object.freeze({
    choiceId: "education-prep-focused-study-v1",
    label: "Study with full focus",
    summary: "Put the exam first and build the strongest academic preparation.",
    tradeoff: "Best study progress, but less rest and free time.",
    studyPower: 20,
    durationMonths: 8,
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -6 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: -5 }),
      Object.freeze({ scoreId: "money", requestedDelta: -3 }),
    ]),
  }),
  "education-prep-balanced-routine-v1": Object.freeze({
    choiceId: "education-prep-balanced-routine-v1",
    label: "Keep a balanced routine",
    summary: "Study consistently while protecting sleep, friends, and exercise.",
    tradeoff: "Steady preparation with a smaller academic boost.",
    studyPower: 13,
    durationMonths: 7,
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: 3 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: 4 }),
      Object.freeze({ scoreId: "money", requestedDelta: -5 }),
    ]),
  }),
  "education-prep-work-and-study-v1": Object.freeze({
    choiceId: "education-prep-work-and-study-v1",
    label: "Work while studying",
    summary: "Take paid shifts and prepare around a busy schedule.",
    tradeoff: "Improves financial security, but leaves less energy for revision.",
    studyPower: 8,
    durationMonths: 9,
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -4 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: -2 }),
      Object.freeze({ scoreId: "money", requestedDelta: 10 }),
    ]),
  }),
});

export const EDUCATION_ROUTES: Readonly<
  Record<EducationRouteId, EducationRouteDefinition>
> = Object.freeze({
  "education-route-professional-v1": Object.freeze({
    routeId: "education-route-professional-v1",
    label: "Professional study",
    summary: "Build the degree foundation for medicine, engineering, or finance.",
    durationMonths: 48,
    minimumGrade: "good",
    minimumEffectiveFunding: 45,
    credentialId: "credential-professional-degree-v1",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -5 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: 3 }),
      Object.freeze({ scoreId: "money", requestedDelta: -28 }),
    ]),
    isRepairRoute: false,
  }),
  "education-route-practical-v1": Object.freeze({
    routeId: "education-route-practical-v1",
    label: "Practical training",
    summary: "Learn a hands-on profession through focused training and placement.",
    durationMonths: 24,
    minimumGrade: "basic",
    minimumEffectiveFunding: 15,
    credentialId: "credential-practical-diploma-v1",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -2 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: 5 }),
      Object.freeze({ scoreId: "money", requestedDelta: -14 }),
    ]),
    isRepairRoute: false,
  }),
  "education-route-direct-work-v1": Object.freeze({
    routeId: "education-route-direct-work-v1",
    label: "Start working directly",
    summary: "Build real experience, contacts, and income straight away.",
    durationMonths: 18,
    minimumGrade: "basic",
    minimumEffectiveFunding: 0,
    credentialId: "credential-work-experience-v1",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -4 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: -1 }),
      Object.freeze({ scoreId: "money", requestedDelta: 20 }),
    ]),
    isRepairRoute: false,
  }),
  "education-route-foundation-year-v1": Object.freeze({
    routeId: "education-route-foundation-year-v1",
    label: "Take a foundation year",
    summary: "Repair the grade gap, explore fields, and reopen study routes.",
    durationMonths: 12,
    minimumGrade: "basic",
    minimumEffectiveFunding: 0,
    credentialId: "credential-foundation-year-v1",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: -1 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: 4 }),
      Object.freeze({ scoreId: "money", requestedDelta: -8 }),
    ]),
    isRepairRoute: true,
  }),
});

export const CAREER_QUALIFICATIONS: readonly CareerQualification[] =
  Object.freeze([
    Object.freeze({ qualificationId: "career-medical-trainee-v1", jobId: "medical-trainee", label: "Medical trainee", summary: "Begin supervised clinical training before full qualification.", routeId: "education-route-professional-v1", requiredAnyCredentialIds: credentialIds("credential-professional-degree-v1", "credential-professional-retraining-v1"), minimumGrade: "excellent", income: "medium", pressure: "high", purpose: "high" }),
    Object.freeze({ qualificationId: "career-engineer-v1", jobId: "engineer", label: "Junior engineer", summary: "Solve practical problems in a supervised engineering role.", routeId: "education-route-professional-v1", requiredAnyCredentialIds: credentialIds("credential-professional-degree-v1", "credential-professional-retraining-v1"), minimumGrade: "good", income: "high", pressure: "medium", purpose: "medium" }),
    Object.freeze({ qualificationId: "career-financial-analyst-v1", jobId: "financial-analyst", label: "Financial analyst", summary: "Turn evidence and numbers into business decisions.", routeId: "education-route-professional-v1", requiredAnyCredentialIds: credentialIds("credential-professional-degree-v1", "credential-professional-retraining-v1"), minimumGrade: "good", income: "high", pressure: "high", purpose: "medium" }),
    Object.freeze({ qualificationId: "career-chef-v1", jobId: "chef", label: "Commis chef", summary: "Grow through a fast, creative professional kitchen.", routeId: "education-route-practical-v1", requiredAnyCredentialIds: credentialIds("credential-practical-diploma-v1", "credential-practical-retraining-v1"), minimumGrade: "basic", income: "medium", pressure: "high", purpose: "high" }),
    Object.freeze({ qualificationId: "career-fitness-trainer-v1", jobId: "fitness-trainer", label: "Fitness trainer", summary: "Coach healthy movement and confidence with practical skills.", routeId: "education-route-practical-v1", requiredAnyCredentialIds: credentialIds("credential-practical-diploma-v1", "credential-practical-retraining-v1"), minimumGrade: "basic", income: "medium", pressure: "medium", purpose: "high" }),
    Object.freeze({ qualificationId: "career-nursing-assistant-v1", jobId: "nursing-assistant", label: "Nursing assistant", summary: "Support patients and a clinical team through direct care.", routeId: "education-route-practical-v1", requiredAnyCredentialIds: credentialIds("credential-practical-diploma-v1", "credential-practical-retraining-v1"), minimumGrade: "basic", income: "medium", pressure: "high", purpose: "high" }),
    Object.freeze({ qualificationId: "career-barista-v1", jobId: "barista", label: "Barista", summary: "Build hospitality skills and a familiar place for customers.", routeId: "education-route-direct-work-v1", requiredAnyCredentialIds: credentialIds("credential-work-experience-v1", "credential-direct-work-retraining-v1"), minimumGrade: "basic", income: "low", pressure: "medium", purpose: "medium" }),
    Object.freeze({ qualificationId: "career-sales-associate-v1", jobId: "sales-associate", label: "Sales associate", summary: "Learn customers, communication, and the rhythm of a business.", routeId: "education-route-direct-work-v1", requiredAnyCredentialIds: credentialIds("credential-work-experience-v1", "credential-direct-work-retraining-v1"), minimumGrade: "basic", income: "medium", pressure: "medium", purpose: "low" }),
    Object.freeze({ qualificationId: "career-entrepreneur-v1", jobId: "entrepreneur", label: "Small-business founder", summary: "Risk your growing experience on a small independent venture.", routeId: "education-route-direct-work-v1", requiredAnyCredentialIds: credentialIds("credential-work-experience-v1", "credential-direct-work-retraining-v1"), minimumGrade: "basic", income: "high", pressure: "high", purpose: "high" }),
    Object.freeze({ qualificationId: "career-laboratory-assistant-v1", jobId: "laboratory-assistant", label: "Laboratory assistant", summary: "Use foundation skills in an entry-level technical support role.", routeId: "education-route-foundation-year-v1", requiredAnyCredentialIds: credentialIds("credential-foundation-year-v1"), minimumGrade: "good", income: "low", pressure: "medium", purpose: "medium" }),
    Object.freeze({ qualificationId: "career-community-assistant-v1", jobId: "community-assistant", label: "Community assistant", summary: "Help coordinate services while deciding on a longer-term path.", routeId: "education-route-foundation-year-v1", requiredAnyCredentialIds: credentialIds("credential-foundation-year-v1"), minimumGrade: "basic", income: "low", pressure: "low", purpose: "high" }),
  ]);

export const RETRAINING_OPTION: RetrainingOption = Object.freeze({
  kind: "retraining",
  optionId: "education-retraining-option-v1",
  label: "Retrain for a new path",
  summary: "Invest more time and money to qualify through a different route.",
  targetRouteIds: Object.freeze(["education-route-professional-v1", "education-route-practical-v1", "education-route-direct-work-v1"] as const),
});

export const RETRAINING_DURATION_MONTHS: Readonly<Record<PrimaryEducationRouteId, number>> = Object.freeze({
  "education-route-professional-v1": 30,
  "education-route-practical-v1": 16,
  "education-route-direct-work-v1": 10,
});

export const RETRAINING_CREDENTIALS: Readonly<Record<PrimaryEducationRouteId, EducationCredentialId>> = Object.freeze({
  "education-route-professional-v1": "credential-professional-retraining-v1",
  "education-route-practical-v1": "credential-practical-retraining-v1",
  "education-route-direct-work-v1": "credential-direct-work-retraining-v1",
});

export const RETRAINING_EFFECTS = Object.freeze({
  "education-route-professional-v1": Object.freeze([
    Object.freeze({ scoreId: "health" as const, requestedDelta: -4 }),
    Object.freeze({ scoreId: "happiness" as const, requestedDelta: -2 }),
    Object.freeze({ scoreId: "money" as const, requestedDelta: -22 }),
  ]),
  "education-route-practical-v1": Object.freeze([
    Object.freeze({ scoreId: "health" as const, requestedDelta: -2 }),
    Object.freeze({ scoreId: "happiness" as const, requestedDelta: 3 }),
    Object.freeze({ scoreId: "money" as const, requestedDelta: -12 }),
  ]),
  "education-route-direct-work-v1": Object.freeze([
    Object.freeze({ scoreId: "health" as const, requestedDelta: -2 }),
    Object.freeze({ scoreId: "happiness" as const, requestedDelta: 1 }),
    Object.freeze({ scoreId: "money" as const, requestedDelta: 8 }),
  ]),
});
