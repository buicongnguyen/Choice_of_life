import type { CoreScores, ScoreId } from "../score-model";

export type SchoolGrade = "basic" | "good" | "excellent";
export type EducationSupportLevel = "none" | "some" | "strong";
export type EducationPhase =
  | "exam-preparation"
  | "exam"
  | "route-selection"
  | "qualified";

export type ExamPreparationChoiceId =
  | "education-prep-focused-study-v1"
  | "education-prep-balanced-routine-v1"
  | "education-prep-work-and-study-v1";

export type EducationRouteId =
  | "education-route-professional-v1"
  | "education-route-practical-v1"
  | "education-route-direct-work-v1"
  | "education-route-foundation-year-v1";

export type PrimaryEducationRouteId = Exclude<
  EducationRouteId,
  "education-route-foundation-year-v1"
>;

export type EducationCredentialId =
  | "credential-high-school-basic-v1"
  | "credential-high-school-good-v1"
  | "credential-high-school-excellent-v1"
  | "credential-foundation-year-v1"
  | "credential-professional-degree-v1"
  | "credential-practical-diploma-v1"
  | "credential-work-experience-v1"
  | "credential-professional-retraining-v1"
  | "credential-practical-retraining-v1"
  | "credential-direct-work-retraining-v1";

export type CareerQualificationId =
  | "career-medical-trainee-v1"
  | "career-engineer-v1"
  | "career-financial-analyst-v1"
  | "career-chef-v1"
  | "career-fitness-trainer-v1"
  | "career-nursing-assistant-v1"
  | "career-barista-v1"
  | "career-sales-associate-v1"
  | "career-entrepreneur-v1"
  | "career-laboratory-assistant-v1"
  | "career-community-assistant-v1";

export type EducationIntensity = "low" | "medium" | "high";

export interface EducationScoreEffect {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
}

export interface ExamPreparationChoice {
  readonly choiceId: ExamPreparationChoiceId;
  readonly label: string;
  readonly summary: string;
  readonly tradeoff: string;
  readonly studyPower: number;
  readonly durationMonths: number;
  readonly effects: readonly EducationScoreEffect[];
}

export interface EducationRouteDefinition {
  readonly routeId: EducationRouteId;
  readonly label: string;
  readonly summary: string;
  readonly durationMonths: number;
  readonly minimumGrade: SchoolGrade;
  readonly minimumEffectiveFunding: number;
  readonly credentialId: EducationCredentialId;
  readonly effects: readonly EducationScoreEffect[];
  readonly isRepairRoute: boolean;
}

export interface EducationCredential {
  readonly credentialId: EducationCredentialId;
  readonly kind:
    | "school"
    | "foundation"
    | "education"
    | "training"
    | "experience";
  readonly earnedAgeMonths: number;
  readonly sourceRouteId: EducationRouteId | null;
}

export interface CareerQualification {
  readonly qualificationId: CareerQualificationId;
  readonly jobId: string;
  readonly label: string;
  readonly summary: string;
  readonly routeId: EducationRouteId;
  readonly requiredAnyCredentialIds: readonly EducationCredentialId[];
  readonly minimumGrade: SchoolGrade;
  readonly income: EducationIntensity;
  readonly pressure: EducationIntensity;
  readonly purpose: EducationIntensity;
}

export interface EducationGradeResult {
  readonly academicScore: number;
  readonly baselineAcademicScore: number;
  readonly runnerContribution: number;
  readonly grade: SchoolGrade;
  readonly baselineGrade: SchoolGrade;
  readonly preparationChoiceId: ExamPreparationChoiceId;
}

export interface EducationRouteAvailability {
  readonly route: EducationRouteDefinition;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly effectiveFunding: number;
}

export interface EducationRouteRecord {
  readonly routeId: EducationRouteId;
  readonly startedAgeMonths: number;
  readonly completedAgeMonths: number;
  readonly credentialId: EducationCredentialId;
  readonly retraining: boolean;
}

export interface EducationEffectEntry {
  readonly effectId: string;
  readonly source:
    | "preparation"
    | "education-route"
    | "foundation-repair"
    | "retraining";
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly causedById: ExamPreparationChoiceId | EducationRouteId;
}

export interface EducationState {
  readonly schemaVersion: 1;
  readonly contentVersion: "education-runtime-v1";
  readonly runId: string;
  readonly phase: EducationPhase;
  readonly ageMonths: number;
  readonly scores: CoreScores;
  readonly supportLevel: EducationSupportLevel;
  readonly priorAchievement: number;
  readonly preparationChoiceId: ExamPreparationChoiceId | null;
  readonly gradeResult: EducationGradeResult | null;
  readonly credentials: readonly EducationCredential[];
  readonly routeHistory: readonly EducationRouteRecord[];
  readonly qualificationRouteId: EducationRouteId | null;
  readonly foundationCompleted: boolean;
  readonly effects: readonly EducationEffectEntry[];
}

export interface EducationSetup {
  readonly runId: string;
  readonly ageMonths?: number;
  readonly scores?: CoreScores;
  readonly supportLevel?: EducationSupportLevel;
  readonly priorAchievement?: number;
}

export interface EducationValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export interface CareerQualificationOption {
  readonly kind: "career";
  readonly qualification: CareerQualification;
}

export interface RetrainingOption {
  readonly kind: "retraining";
  readonly optionId: "education-retraining-option-v1";
  readonly label: "Retrain for a new path";
  readonly summary: string;
  readonly targetRouteIds: readonly PrimaryEducationRouteId[];
}

export type CareerPathOption = CareerQualificationOption | RetrainingOption;
