import type { CoreScores, ScoreId } from "../score-model";

export type CareerId =
  | "teacher"
  | "chef"
  | "barista"
  | "athlete"
  | "entrepreneur"
  | "engineer"
  | "software-engineer"
  | "manager"
  | "financial-analyst"
  | "artist"
  | "police"
  | "lawyer"
  | "ceo"
  | "doctor"
  | "nurse"
  | "farmer"
  | "dancer"
  | "gym-trainer"
  | "army";

export type CareerCredentialId =
  | "high-school-diploma"
  | "bachelor-general"
  | "education-degree"
  | "culinary-certificate"
  | "competitive-sport-record"
  | "engineering-degree"
  | "software-portfolio"
  | "computer-science-degree"
  | "business-degree"
  | "management-experience"
  | "finance-degree"
  | "arts-portfolio"
  | "police-academy"
  | "law-degree"
  | "executive-experience"
  | "medical-degree"
  | "medical-residency"
  | "nursing-license"
  | "agriculture-training"
  | "dance-training"
  | "fitness-certification"
  | "military-training";

export type CareerExperienceTag =
  | "caregiving"
  | "community-service"
  | "customer-service"
  | "creative-practice"
  | "leadership"
  | "physical-training"
  | "small-business"
  | "technology"
  | "teamwork";

export type CareerEducationRoute =
  | "professional"
  | "practical"
  | "direct-work"
  | "foundation";

export type CareerSchoolGrade = "basic" | "good" | "excellent";
export type CareerSeason = "standard" | "summer";
export type CareerRoleStatus = "entry" | "trainee" | "qualified";
export type CareerPhase =
  | "offers"
  | "active"
  | "pressure-choice"
  | "doctor-emergency-choice"
  | "settling"
  | "complete";

export interface CareerQualificationProfile {
  readonly ageYears: number;
  readonly grade: CareerSchoolGrade;
  readonly route: CareerEducationRoute;
  readonly credentials: readonly CareerCredentialId[];
  readonly experienceTags: readonly CareerExperienceTag[];
}

export interface CareerQualificationPath {
  readonly pathId: string;
  readonly label: string;
  readonly minimumGrade?: CareerSchoolGrade;
  readonly minimumMoney?: number;
  readonly allowedRoutes?: readonly CareerEducationRoute[];
  readonly allCredentials?: readonly CareerCredentialId[];
  readonly anyCredentials?: readonly CareerCredentialId[];
  readonly allExperienceTags?: readonly CareerExperienceTag[];
  readonly anyExperienceTags?: readonly CareerExperienceTag[];
}

export interface CareerSignal {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly label: string;
}

export interface CareerLabels {
  readonly income: CareerSignal;
  readonly pressure: CareerSignal;
  readonly purposeAutonomy: CareerSignal;
}

export interface CareerEconomy {
  /** Score-space income added once per four-month settlement cycle. */
  readonly salaryMoneyDelta: number;
  /** Score-space living/work costs deducted in the same atomic settlement. */
  readonly recurringCostMoneyDelta: number;
  readonly healthDelta: number;
  readonly happinessDelta: number;
}

export interface CareerOutfitVariant {
  readonly outfitId: string;
  readonly label: string;
  readonly season: CareerSeason;
  readonly top: string;
  readonly bottoms: string;
  readonly footwear: string;
  readonly accessories: readonly string[];
  readonly palette: readonly [string, string, string];
  readonly sleeveStyle: "sleeveless" | "short" | "rolled" | "long";
}

export interface CareerOutfitMetadata {
  readonly standard: CareerOutfitVariant;
  readonly summer: CareerOutfitVariant;
}

export interface CareerRetrainingDefinition {
  readonly programId: string;
  readonly title: string;
  readonly description: string;
  readonly durationMonths: number;
  readonly costMoneyDelta: number;
  readonly grantsCredentials: readonly CareerCredentialId[];
}

export interface CareerPressureStory {
  readonly callbackId: string;
  readonly title: string;
  readonly prompt: string;
  readonly supportRole: string;
}

export interface CareerDefinition {
  readonly careerId: CareerId;
  readonly title: string;
  readonly entryRoleTitle: string;
  readonly qualifiedRoleTitle: string;
  readonly summary: string;
  readonly labels: CareerLabels;
  readonly economy: CareerEconomy;
  /** Any one path is sufficient. An empty path is an intentionally open entry. */
  readonly qualificationPaths: readonly CareerQualificationPath[];
  readonly retraining: CareerRetrainingDefinition | null;
  readonly pressureStory: CareerPressureStory;
  readonly outfits: CareerOutfitMetadata;
}

export interface CareerCatalog {
  readonly catalogVersion: "career-catalog-v1";
  readonly careers: Readonly<Record<CareerId, CareerDefinition>>;
  readonly orderedCareerIds: readonly CareerId[];
}

export interface CareerOffer {
  readonly offerId: string;
  readonly kind: "career";
  readonly careerId: CareerId;
  readonly title: string;
  readonly roleTitle: string;
  readonly summary: string;
  readonly entryStatus: CareerRoleStatus;
  readonly qualificationPathId: string;
  readonly qualificationLabel: string;
  readonly labels: CareerLabels;
  readonly outfitPreview: CareerOutfitMetadata;
}

export interface CareerRetrainingOffer {
  readonly offerId: string;
  readonly kind: "retraining";
  readonly targetCareerId: CareerId;
  readonly targetTitle: string;
  readonly title: string;
  readonly description: string;
  readonly durationMonths: number;
  readonly costMoneyDelta: number;
  readonly grantsCredentials: readonly CareerCredentialId[];
}

export interface CareerOfferSet {
  readonly offerRound: number;
  readonly careerOffers: readonly CareerOffer[];
  readonly retrainingOffer: CareerRetrainingOffer;
}

export interface CareerSelectedRole {
  readonly careerId: CareerId;
  readonly roleTitle: string;
  readonly status: CareerRoleStatus;
  readonly selectedOfferId: string;
  readonly selectedQualificationPathId: string;
  readonly startedAgeYears: number;
  readonly cyclesCompleted: number;
  readonly monthsCompleted: number;
}

export type CareerEffectSource =
  | "salary"
  | "cost"
  | "career-wellbeing"
  | "pressure-callback"
  | "doctor-emergency"
  | "retraining";

export interface CareerEffectRequest {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly categoryId: string;
}

export interface CareerEffectEntry extends CareerEffectRequest {
  readonly effectId: string;
  readonly source: CareerEffectSource;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly cycleIndex: number;
  readonly causedByDecisionId: string | null;
}

export interface CareerSettlement {
  readonly settlementId: string;
  readonly cycleIndex: number;
  readonly months: number;
  readonly grossIncomeRequested: number;
  readonly recurringCostRequested: number;
  readonly netMoneyActual: number;
  readonly appliedEffectIds: readonly string[];
  readonly summary: string;
}

export type CareerPressureOptionId =
  | "push-through"
  | "set-boundary"
  | "seek-support";

export type DoctorEmergencyOptionId =
  | "lead-emergency-shift"
  | "share-emergency-shift"
  | "protect-recovery-time";

export interface CareerDecisionOption<TOptionId extends string = string> {
  readonly optionId: TOptionId;
  readonly label: string;
  readonly description: string;
  readonly effects: readonly CareerEffectRequest[];
  readonly factLabel: string;
  readonly resultText: string;
}

export interface CareerPressureDecision {
  readonly kind: "pressure";
  readonly decisionId: string;
  readonly callbackId: string;
  readonly cycleIndex: number;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly CareerDecisionOption<CareerPressureOptionId>[];
}

export interface DoctorEmergencyDecision {
  readonly kind: "doctor-emergency";
  readonly decisionId: "doctor-emergency-shift-v1";
  readonly callbackId: "doctor-emergency-shift-callback-v1";
  readonly cycleIndex: number;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly CareerDecisionOption<DoctorEmergencyOptionId>[];
}

export type CareerPendingDecision =
  | CareerPressureDecision
  | DoctorEmergencyDecision;

export interface CareerCallbackRecord {
  readonly callbackId: string;
  readonly kind: "pressure" | "doctor-emergency";
  readonly status: "presenting" | "resolved";
  readonly cycleIndex: number;
  readonly decisionId: string;
  readonly selectedOptionId: string | null;
  readonly resultText: string | null;
}

export interface CareerFact {
  readonly factId: string;
  readonly label: string;
  readonly value: string;
  readonly source: "prior-life" | "career" | "retraining" | "callback";
}

export interface CareerPerson {
  readonly personId: string;
  readonly name: string;
  readonly role: string;
  readonly relationship: "family" | "friend" | "mentor" | "colleague";
}

export interface CareerStoryEvent {
  readonly eventId: string;
  readonly kind:
    | "career-selected"
    | "retraining-complete"
    | "cycle-settled"
    | "callback-resolved"
    | "qualification-earned"
    | "career-complete";
  readonly cycleIndex: number;
  readonly text: string;
}

export type FinancialSecurityOutcome = "fragile" | "steady" | "secure";
export type OverallSuccessOutcome =
  | "thriving"
  | "purpose-led"
  | "secure-but-strained"
  | "resilient"
  | "still-building";

export interface CareerEndingScoreLine {
  readonly scoreId: ScoreId;
  readonly label: string;
  readonly value: number;
  readonly reflection: string;
}

export interface CareerProvisionalEnding {
  readonly endingId: "first-career-provisional-ending-v1";
  readonly title: string;
  readonly financialSecurity: FinancialSecurityOutcome;
  readonly overallSuccess: OverallSuccessOutcome;
  readonly headline: string;
  readonly narrative: string;
  readonly scoreLines: readonly CareerEndingScoreLine[];
  readonly namedFacts: readonly string[];
  readonly namedPeople: readonly string[];
}

export interface CareerState {
  readonly schemaVersion: 1;
  readonly contentVersion: "career-runtime-v1";
  readonly stageId: "first-career-v1";
  readonly runId: string;
  readonly runSeed: string;
  readonly phase: CareerPhase;
  readonly season: CareerSeason;
  readonly scores: CoreScores;
  readonly profile: CareerQualificationProfile;
  readonly offerSet: CareerOfferSet;
  readonly selectedRole: CareerSelectedRole | null;
  readonly pendingDecision: CareerPendingDecision | null;
  readonly effects: readonly CareerEffectEntry[];
  readonly settlements: readonly CareerSettlement[];
  readonly callbacks: readonly CareerCallbackRecord[];
  readonly facts: readonly CareerFact[];
  readonly people: readonly CareerPerson[];
  readonly story: readonly CareerStoryEvent[];
  readonly ending: CareerProvisionalEnding | null;
}

export interface CareerSetup {
  readonly runId: string;
  readonly runSeed: string;
  readonly scores: CoreScores;
  readonly profile: CareerQualificationProfile;
  readonly facts?: readonly CareerFact[];
  readonly people?: readonly CareerPerson[];
  readonly season?: CareerSeason;
  readonly offerCount?: 2 | 3;
}

export interface CareerOfferRequest {
  readonly runSeed: string;
  readonly profile: CareerQualificationProfile;
  readonly scores: CoreScores;
  readonly offerRound?: number;
  readonly offerCount?: 2 | 3;
  readonly priorityCareerId?: CareerId;
}

export type CareerAction =
  | Readonly<{ type: "choose-career"; offerId: string }>
  | Readonly<{ type: "choose-retraining"; offerId: string }>
  | Readonly<{ type: "settle-cycle" }>
  | Readonly<{
      type: "resolve-pressure";
      optionId: CareerPressureOptionId;
    }>
  | Readonly<{
      type: "resolve-doctor-emergency";
      optionId: DoctorEmergencyOptionId;
    }>
  | Readonly<{ type: "set-season"; season: CareerSeason }>
  | Readonly<{ type: "complete" }>;
