import type { CareerId, CareerOutfitMetadata, CareerOutfitVariant } from "../career";
import type { CoreScores, ScoreId } from "../score-model";

export type AdultGender = "female" | "male";
export type AdultAttraction = "women" | "men" | "any" | "none";
export type AdultCulture =
  | "east-asian"
  | "south-asian"
  | "western"
  | "african-diaspora"
  | "latin";
export type AdultSeason = "standard" | "summer";
export type AdultRouteId = "partnered" | "single-friends" | "community";
export type AdultRelationshipStatus = "single" | "partnered" | "married";
export type AdultChapter =
  | "relationships-home"
  | "midlife"
  | "later-career-ready";
export type AdultPhase =
  | "route-choice"
  | "partner-choice"
  | "commitment-choice"
  | "home-choice"
  | "family-choice"
  | "active"
  | "callback"
  | "settling"
  | "complete";

export type AdultHomeChoiceId =
  | "make-shared-home"
  | "keep-independent-homes"
  | "friend-household"
  | "independent-home"
  | "community-household"
  | "neighborhood-root";

export type AdultCommitmentChoiceId = "marry" | "stay-partnered";

export type AdultFamilyPlanId =
  | "no-children"
  | "one-child"
  | "two-children"
  | "undecided";

export type AdultCallbackKind = "promotion" | "caregiver" | "support";
export type AdultCallbackStatus = "scheduled" | "presenting" | "resolved";
export type AdultDecisionOptionId =
  | "accept-promotion"
  | "negotiate-promotion"
  | "decline-promotion"
  | "take-care-leave"
  | "share-care"
  | "hire-care-help"
  | "ask-inner-circle"
  | "join-support-network"
  | "manage-alone";

export type AdultCareerStatus = "active" | "reduced-hours" | "interrupted";
export type AdultCaregiverCondition = "independent" | "needs-support" | "frail";
export type AdultNpcRole =
  | "spouse-candidate"
  | "partner"
  | "friend"
  | "community-member"
  | "caregiver"
  | "colleague";

export type AdultJobId = CareerId;

export interface AdultAppearance {
  readonly skinTone: string;
  readonly hairStyle: string;
  readonly hairColor: string;
  readonly bodyBuild: "slim" | "average" | "athletic" | "broad";
  readonly accessory: string | null;
}

export interface AdultJobMetadata {
  readonly jobId: AdultJobId;
  readonly title: string;
  readonly roleTitle: string;
  readonly outfits: CareerOutfitMetadata;
}

export interface AdultNpcProfile {
  readonly personId: string;
  readonly name: string;
  readonly gender: AdultGender;
  readonly culture: AdultCulture;
  readonly ageYears: number;
  readonly role: AdultNpcRole;
  readonly job: AdultJobMetadata;
  readonly appearance: AdultAppearance;
}

export interface AdultCaregiverState {
  readonly personId: string;
  readonly name: string;
  readonly relationship: "mother" | "father" | "guardian";
  readonly role: "caregiver";
  readonly gender: AdultGender;
  readonly culture: AdultCulture;
  readonly ageYears: number;
  readonly condition: AdultCaregiverCondition;
  readonly retired: boolean;
  readonly job: AdultJobMetadata;
  readonly appearance: AdultAppearance;
}

export interface AdultChildState {
  readonly personId: string;
  readonly name: string;
  readonly gender: AdultGender;
  readonly ageYears: number;
}

export interface AdultPlayerProfile {
  readonly name: string;
  readonly gender: AdultGender;
  readonly attraction: AdultAttraction;
  readonly culture: AdultCulture;
  readonly jobId: AdultJobId;
}

export interface AdultPlayerSetup {
  readonly name: string;
  readonly gender: AdultGender;
  readonly attraction?: AdultAttraction;
  readonly culture: AdultCulture;
  readonly jobId: AdultJobId;
}

export interface AdultCareerState {
  readonly job: AdultJobMetadata;
  readonly level: 1 | 2 | 3;
  readonly status: AdultCareerStatus;
  readonly interruptionMonthsRemaining: number;
  readonly interruptions: readonly AdultCareerInterruption[];
}

export interface AdultCareerInterruption {
  readonly interruptionId: string;
  readonly startedCycle: number;
  readonly durationMonths: number;
  readonly reason: "caregiving" | "family" | "recovery";
}

export interface AdultScoreEffectRequest {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
}

export type AdultEffectSource =
  | "home-choice"
  | "family-choice"
  | "adult-cycle"
  | "promotion-callback"
  | "caregiver-callback"
  | "support-callback";

export interface AdultEffectEntry extends AdultScoreEffectRequest {
  readonly effectId: string;
  readonly source: AdultEffectSource;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly cycleIndex: number;
  readonly causedByDecisionId: string | null;
}

export interface AdultDecisionOption {
  readonly optionId: AdultDecisionOptionId;
  readonly label: string;
  readonly description: string;
  readonly effects: readonly AdultScoreEffectRequest[];
  readonly resultText: string;
}

export interface AdultPendingDecision {
  readonly decisionId: string;
  readonly callbackId: string;
  readonly kind: AdultCallbackKind;
  readonly cycleIndex: number;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly AdultDecisionOption[];
}

export interface AdultCallbackRecord {
  readonly callbackId: string;
  readonly kind: AdultCallbackKind;
  readonly dueCycle: number;
  readonly status: AdultCallbackStatus;
  readonly decisionId: string | null;
  readonly selectedOptionId: AdultDecisionOptionId | null;
  readonly resultText: string | null;
}

export interface AdultSettlement {
  readonly settlementId: string;
  readonly cycleIndex: number;
  readonly ageYears: number;
  readonly chapter: AdultChapter;
  readonly appliedEffectIds: readonly string[];
  readonly summary: string;
}

export interface AdultFact {
  readonly factId: string;
  readonly label: string;
  readonly value: string;
  readonly source: "route" | "home" | "family" | "career" | "caregiver" | "support";
}

export interface AdultStoryEvent {
  readonly eventId: string;
  readonly kind:
    | "route-chosen"
    | "partner-chosen"
    | "commitment-chosen"
    | "home-chosen"
    | "family-plan-chosen"
    | "cycle-settled"
    | "callback-presented"
    | "callback-resolved"
    | "later-career-ready";
  readonly cycleIndex: number;
  readonly text: string;
}

export interface AdultState {
  readonly schemaVersion: 1;
  readonly contentVersion: "adult-life-runtime-v1";
  readonly stageId: "relationships-home-midlife-v1";
  readonly runId: string;
  readonly runSeed: string;
  readonly phase: AdultPhase;
  readonly chapter: AdultChapter;
  readonly cycleIndex: number;
  readonly ageYears: number;
  readonly season: AdultSeason;
  readonly scores: CoreScores;
  readonly player: AdultPlayerSetup;
  readonly routeId: AdultRouteId | null;
  readonly relationshipStatus: AdultRelationshipStatus;
  readonly partnerCandidates: readonly AdultNpcProfile[];
  readonly partner: AdultNpcProfile | null;
  readonly commitmentChoiceId: AdultCommitmentChoiceId | null;
  readonly homeChoiceId: AdultHomeChoiceId | null;
  readonly familyPlanId: AdultFamilyPlanId | null;
  readonly children: readonly AdultChildState[];
  readonly caregivers: readonly AdultCaregiverState[];
  readonly friends: readonly AdultNpcProfile[];
  readonly community: readonly AdultNpcProfile[];
  readonly career: AdultCareerState;
  readonly callbacks: readonly AdultCallbackRecord[];
  readonly pendingDecision: AdultPendingDecision | null;
  readonly effects: readonly AdultEffectEntry[];
  readonly settlements: readonly AdultSettlement[];
  readonly facts: readonly AdultFact[];
  readonly story: readonly AdultStoryEvent[];
  readonly nextStageId: "later-career-v1" | null;
}

export interface AdultSetup {
  readonly runId: string;
  readonly runSeed: string;
  readonly scores: CoreScores;
  readonly player: AdultPlayerProfile;
  readonly ageYears?: number;
  readonly season?: AdultSeason;
  readonly caregivers?: readonly AdultCaregiverState[];
  readonly facts?: readonly AdultFact[];
}

export interface PartnerCandidateRequest {
  readonly runSeed: string;
  readonly playerGender: AdultGender;
  readonly attraction?: AdultAttraction;
  readonly playerAgeYears?: number;
  readonly count?: 2 | 3 | 4 | 5;
}

export type AdultAction =
  | Readonly<{ type: "choose-route"; routeId: AdultRouteId }>
  | Readonly<{ type: "choose-partner"; personId: string }>
  | Readonly<{ type: "skip-partnering" }>
  | Readonly<{
      type: "choose-commitment";
      choiceId: AdultCommitmentChoiceId;
    }>
  | Readonly<{ type: "choose-home"; choiceId: AdultHomeChoiceId }>
  | Readonly<{ type: "choose-family-plan"; planId: AdultFamilyPlanId }>
  | Readonly<{ type: "settle-cycle" }>
  | Readonly<{ type: "resolve-callback"; optionId: AdultDecisionOptionId }>
  | Readonly<{ type: "set-season"; season: AdultSeason }>
  | Readonly<{ type: "advance-to-later-career" }>;

export type AdultOutfitVariant = CareerOutfitVariant;
