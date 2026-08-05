import type { CoreScores, ScoreId } from "../score-model";

export const LIFE_STAGE_IDS = [
  "newborn-v1",
  "toddler-v1",
  "early-childhood-v1",
  "elementary-school-v1",
  "middle-school-v1",
  "education-v1",
  "first-career-v1",
  "relationships-home-v1",
  "midlife-v1",
  "later-career-v1",
  "retirement-v1",
  "legacy-v1",
] as const;

export type LifeStageId = (typeof LIFE_STAGE_IDS)[number];
export type LaterLifeStageId = Extract<
  LifeStageId,
  "later-career-v1" | "retirement-v1" | "legacy-v1"
>;

export type LaterLifePhase =
  | "later-career-choice"
  | "later-career-callback"
  | "retirement-choice"
  | "retirement-callback"
  | "legacy-choice"
  | "legacy-callback"
  | "ready-to-complete"
  | "complete";

export type LaterCareerOptionId =
  | "later-career-mentor-v1"
  | "later-career-lead-v1"
  | "later-career-rebalance-v1";

export type RetirementOptionId =
  | "retirement-now-v1"
  | "retirement-gradual-v1"
  | "retirement-later-v1";

export type LegacyOptionId =
  | "legacy-family-stories-v1"
  | "legacy-community-project-v1"
  | "legacy-lifelong-craft-v1";

export type LaterLifeOptionId =
  | LaterCareerOptionId
  | RetirementOptionId
  | LegacyOptionId;

export type RetirementTiming = "earlier" | "gradual" | "later";
export type LegacyRoute = "family" | "community" | "craft";
export type LifeFactKind =
  | "identity"
  | "education"
  | "career"
  | "relationship"
  | "retirement"
  | "legacy"
  | "resilience";

export interface LaterLifeScoreEffect {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
}

export interface LaterLifeChoiceOption<TOptionId extends LaterLifeOptionId = LaterLifeOptionId> {
  readonly optionId: TOptionId;
  readonly label: string;
  readonly summary: string;
  readonly tradeoff: string;
  readonly effects: readonly LaterLifeScoreEffect[];
  readonly ageAdvanceMonths: number;
  readonly factId: string;
  readonly factLabel: string;
  readonly callbackId: string;
  readonly callbackTitle: string;
  readonly callbackText: string;
  readonly resultText: string;
}

export interface LaterCareerChoiceOption extends LaterLifeChoiceOption<LaterCareerOptionId> {
  readonly direction: "mentor" | "lead" | "rebalance";
}

export interface RetirementChoiceOption extends LaterLifeChoiceOption<RetirementOptionId> {
  readonly timing: RetirementTiming;
}

export interface LegacyChoiceOption extends LaterLifeChoiceOption<LegacyOptionId> {
  readonly route: LegacyRoute;
}

export interface LaterLifeMajorChoice<TOption extends LaterLifeChoiceOption = LaterLifeChoiceOption> {
  readonly choiceId: string;
  readonly stageId: LaterLifeStageId;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly TOption[];
}

export interface LifeFact {
  readonly factId: string;
  readonly kind: LifeFactKind;
  readonly label: string;
  readonly value: string;
  readonly sourceStageId: LifeStageId;
  readonly causedByDecisionId: string | null;
}

export type BiographyRelationship =
  | "family"
  | "partner"
  | "friend"
  | "mentor"
  | "colleague"
  | "community";

export interface BiographyPerson {
  readonly personId: string;
  readonly name: string;
  readonly role: string;
  readonly relationship: BiographyRelationship;
  readonly firstStageId: LifeStageId;
}

export interface LaterLifeEffectEntry {
  readonly effectId: string;
  readonly stageId: LaterLifeStageId;
  readonly decisionId: string;
  readonly optionId: LaterLifeOptionId;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
}

export interface LifeDecisionRecord {
  readonly decisionId: string;
  readonly stageId: LifeStageId;
  readonly choiceTitle: string;
  readonly optionId: string;
  readonly optionLabel: string;
  readonly resultText: string;
  readonly factIds: readonly string[];
  readonly personIds: readonly string[];
  readonly callbackId: string | null;
}

export type SceneCallbackStatus = "presenting" | "resolved";

export interface SceneCallbackRecord {
  readonly callbackId: string;
  readonly sceneId: string;
  readonly stageId: LifeStageId;
  readonly causedByDecisionId: string;
  readonly causedByOptionId: string;
  readonly title: string;
  readonly text: string;
  readonly status: SceneCallbackStatus;
  readonly presentedAtAgeMonths: number;
  readonly resolvedAtAgeMonths: number | null;
  readonly namedPersonIds: readonly string[];
}

export interface BiographyChapterInput {
  readonly stageId: LifeStageId;
  readonly title: string;
  readonly ageStartMonths: number;
  readonly ageEndMonths: number;
  readonly summary: string;
  readonly majorDecisionId: string;
  readonly majorChoiceLabel: string;
  readonly namedFactIds?: readonly string[];
  readonly namedPersonIds?: readonly string[];
  readonly callbackIds?: readonly string[];
}

export interface BiographyChapter {
  readonly chapterNumber: number;
  readonly stageId: LifeStageId;
  readonly title: string;
  readonly ageStartMonths: number;
  readonly ageEndMonths: number;
  readonly summary: string;
  readonly majorDecisionId: string;
  readonly majorChoiceLabel: string;
  readonly namedFactIds: readonly string[];
  readonly namedPersonIds: readonly string[];
  readonly callbackIds: readonly string[];
}

export interface LaterLifeChapterRecord {
  readonly stageId: LaterLifeStageId;
  readonly title: string;
  readonly ageStartMonths: number;
  readonly ageEndMonths: number;
  readonly decisionId: string;
  readonly optionId: LaterLifeOptionId;
  readonly optionLabel: string;
  readonly resultText: string;
  readonly factId: string;
  readonly callbackId: string;
}

export type EndingTitleId =
  | "full-hearted-builder"
  | "beloved-storykeeper"
  | "community-light"
  | "steadfast-steward"
  | "curious-craftsperson"
  | "resilient-pathmaker"
  | "life-still-rippling";

export interface EndingTitle {
  readonly titleId: EndingTitleId;
  readonly title: string;
  readonly reason: string;
}

export interface EndingTitleContext {
  readonly scores: CoreScores;
  readonly facts: readonly LifeFact[];
  readonly people: readonly BiographyPerson[];
  readonly decisions: readonly LifeDecisionRecord[];
  readonly legacyRoute: LegacyRoute | null;
}

export type ScoreBand = "tender" | "steady" | "strong";

export interface BiographyScoreReflection {
  readonly scoreId: ScoreId;
  readonly label: string;
  readonly value: number;
  readonly band: ScoreBand;
  readonly reflection: string;
}

export interface BiographyBalanceProfile {
  readonly lowestScore: number;
  readonly highestScore: number;
  readonly spread: number;
  readonly balanced: boolean;
}

export interface FullBiography {
  readonly biographyId: "complete-life-biography-v1";
  readonly title: EndingTitle;
  readonly lifespanMonths: number;
  readonly chapters: readonly BiographyChapter[];
  readonly scoreReflections: readonly BiographyScoreReflection[];
  readonly balance: BiographyBalanceProfile;
  readonly importantFacts: readonly LifeFact[];
  readonly importantPeople: readonly BiographyPerson[];
  readonly importantDecisions: readonly LifeDecisionRecord[];
  readonly sceneCallbacks: readonly SceneCallbackRecord[];
  readonly closingNarrative: string;
}

export interface LaterLifeSetup {
  readonly runId: string;
  readonly runSeed: string;
  readonly ageMonths?: number;
  readonly scores?: CoreScores;
  readonly priorChapters?: readonly BiographyChapterInput[];
  readonly facts?: readonly LifeFact[];
  readonly people?: readonly BiographyPerson[];
  readonly decisions?: readonly LifeDecisionRecord[];
  readonly callbacks?: readonly SceneCallbackRecord[];
}

export interface LaterLifeState {
  readonly schemaVersion: 1;
  readonly contentVersion: "later-life-runtime-v1";
  readonly runId: string;
  readonly runSeed: string;
  readonly phase: LaterLifePhase;
  readonly currentStageId: LaterLifeStageId;
  readonly ageMonths: number;
  readonly scores: CoreScores;
  readonly retirementTiming: RetirementTiming | null;
  readonly legacyRoute: LegacyRoute | null;
  readonly priorChapters: readonly BiographyChapterInput[];
  readonly laterLifeChapters: readonly LaterLifeChapterRecord[];
  readonly facts: readonly LifeFact[];
  readonly people: readonly BiographyPerson[];
  readonly decisions: readonly LifeDecisionRecord[];
  readonly callbacks: readonly SceneCallbackRecord[];
  readonly effects: readonly LaterLifeEffectEntry[];
  readonly biography: FullBiography | null;
}

export type LaterLifeAction =
  | Readonly<{ type: "choose-later-career"; optionId: LaterCareerOptionId }>
  | Readonly<{ type: "choose-retirement"; optionId: RetirementOptionId }>
  | Readonly<{ type: "choose-legacy"; optionId: LegacyOptionId }>
  | Readonly<{ type: "acknowledge-callback" }>
  | Readonly<{ type: "complete-life" }>;
