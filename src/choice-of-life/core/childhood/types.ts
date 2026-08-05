import type { CoreScores, ScoreId } from "../score-model";

export type ChildhoodStageId =
  | "toddler-v1"
  | "early-childhood-v1"
  | "elementary-school-v1"
  | "middle-school-v1";

export type ChildhoodLaterStageId = ChildhoodStageId | "high-school-v1";

export type ChildhoodPhase =
  | "active"
  | "choice"
  | "stage-summary"
  | "complete";

export type ChildhoodGender = "female" | "male";
export type ChildhoodHeritageStyle = "asian" | "western";
export type ChildhoodCompanionKind = "cat" | "dog";
export type ChildhoodCompanionMode =
  | ChildhoodCompanionKind
  | "none"
  | "seeded";

export type ChildhoodInfluenceSignalId =
  | "curiosity"
  | "empathy"
  | "creativity"
  | "teamwork"
  | "resilience"
  | "independence"
  | "patience"
  | "confidence";

export interface ChildhoodScoreEffect {
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
}

export interface ChildhoodStageDefinition {
  readonly stageId: ChildhoodStageId;
  readonly label: string;
  readonly summary: string;
  readonly startAgeMonths: number;
  readonly endAgeMonths: number;
  readonly durationTicks: number;
  readonly majorChoiceTick: number;
  readonly settingId:
    | "family-playroom"
    | "neighborhood-preschool"
    | "elementary-campus"
    | "middle-school-campus";
}

export interface ChildhoodAppearance {
  readonly heritageStyleId: ChildhoodHeritageStyle;
  readonly skinToneId:
    | "porcelain-warm"
    | "peach"
    | "golden"
    | "tan"
    | "warm-brown"
    | "deep-brown";
  readonly hairStyleId:
    | "twin-buns"
    | "soft-bob-clip"
    | "high-ponytail"
    | "braided-pigtails"
    | "side-part-crop"
    | "tousled-crop"
    | "curly-crop"
    | "soft-undercut";
  readonly hairColorId: "black" | "dark-brown" | "warm-brown" | "auburn";
  readonly clothingStyleId:
    | "pinafore-layer"
    | "cardigan-skirt"
    | "bright-overalls"
    | "sporty-shorts"
    | "hoodie-chinos"
    | "striped-dress"
    | "denim-jacket"
    | "knit-vest-trousers";
  readonly clothingPaletteId:
    | "coral-teal"
    | "berry-cream"
    | "sunflower-denim"
    | "mint-navy"
    | "sky-caramel"
    | "lavender-plum"
    | "rust-ocean"
    | "forest-sand";
  readonly shoeStyleId:
    | "velcro-sneakers"
    | "canvas-sneakers"
    | "ankle-boots"
    | "sport-trainers";
  readonly bagStyleId:
    | "none"
    | "mini-backpack"
    | "school-backpack"
    | "crossbody-satchel";
  readonly accessoryId:
    | "star-hairclip"
    | "round-glasses"
    | "sun-cap"
    | "friendship-bracelet"
    | "leaf-pin"
    | "none";
  /** Keeps female and male character art mapped to an unambiguous body base. */
  readonly bodyPresentationId: "girl-child" | "boy-child";
  /** Stable key used by presentation code to avoid accidental duplicate looks. */
  readonly appearanceSignature: string;
}

export interface ChildhoodFriendCatalogEntry {
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly displayName: string;
  readonly gender: ChildhoodGender;
  readonly pronouns: "she-her" | "he-him";
  readonly appearance: ChildhoodAppearance;
}

export interface ChildhoodFriendIdentity
  extends ChildhoodFriendCatalogEntry {
  readonly introductionStageId: ChildhoodStageId;
  readonly ageMonthsAtIntroduction: number;
  readonly sameStageAsPlayer: true;
}

export interface ChildhoodFriendRelationship {
  readonly person: ChildhoodFriendIdentity;
  readonly status: "awaiting-introduction" | "friend";
  readonly closeness: number;
  readonly introducedAtTick: number | null;
  readonly lastSharedMomentId: string | null;
}

export interface ChildhoodCompanion {
  readonly companionId: string;
  readonly kind: ChildhoodCompanionKind;
  readonly name: string;
  readonly coatId:
    | "ginger-tabby"
    | "tuxedo"
    | "cream-point"
    | "golden"
    | "black-tan"
    | "white-caramel";
  readonly accessoryId: "teal-collar" | "coral-bandana" | "yellow-bow";
  readonly personalityId: "gentle" | "playful" | "curious";
}

export interface ChildhoodInfluenceSignal {
  readonly signalId: ChildhoodInfluenceSignalId;
  readonly weight: 1 | 2;
}

export interface ChildhoodMemoryDefinition {
  readonly title: string;
  readonly summary: string;
  readonly kind: "friendship" | "learning" | "courage" | "joy";
  readonly influenceSignals: readonly ChildhoodInfluenceSignal[];
}

export interface ChildhoodCallbackDefinition {
  readonly callbackId: string;
  readonly dueStageId: ChildhoodLaterStageId;
  readonly dueStageTick: number;
  readonly title: string;
  readonly story: string;
  readonly effects: readonly ChildhoodScoreEffect[];
  readonly relationshipDelta: number;
}

export interface ChildhoodChoiceOption {
  readonly optionId: string;
  readonly label: string;
  readonly description: string;
  readonly consequencePreview: string;
  readonly effects: readonly ChildhoodScoreEffect[];
  readonly relationshipDelta: number;
  readonly memory: ChildhoodMemoryDefinition;
  readonly callback: ChildhoodCallbackDefinition;
}

export interface ChildhoodChoiceDefinition {
  readonly choiceId: string;
  readonly stageId: ChildhoodStageId;
  readonly title: string;
  readonly prompt: string;
  readonly friendPromptTemplate: string;
  readonly options: readonly [
    ChildhoodChoiceOption,
    ChildhoodChoiceOption,
    ChildhoodChoiceOption,
  ];
}

export interface ChildhoodStageProgress {
  readonly stageId: ChildhoodStageId;
  readonly stageIndex: number;
  readonly activeTicks: number;
  readonly durationTicks: number;
  readonly ageMonths: number;
  readonly startAgeMonths: number;
  readonly endAgeMonths: number;
  readonly entryScores: CoreScores;
}

export interface ChildhoodActiveChoice {
  readonly transactionId: string;
  readonly choiceId: string;
  readonly stageId: ChildhoodStageId;
  readonly friendPersonId: string;
  readonly optionIds: readonly [string, string, string];
  readonly presentedAtSimulationTick: number;
}

export interface ChildhoodChoiceRecord {
  readonly transactionId: string;
  readonly choiceId: string;
  readonly optionId: string;
  readonly stageId: ChildhoodStageId;
  readonly friendPersonId: string;
  readonly memoryId: string;
  readonly callbackTransactionId: string;
  readonly resolvedAtSimulationTick: number;
}

export interface ChildhoodMemory {
  readonly memoryId: string;
  readonly stageId: ChildhoodStageId;
  readonly title: string;
  readonly summary: string;
  readonly kind: ChildhoodMemoryDefinition["kind"];
  readonly friendPersonId: string;
  readonly originChoiceId: string;
  readonly originOptionId: string;
  readonly influenceSignals: readonly ChildhoodInfluenceSignal[];
  readonly role: "influence-only";
  readonly adultIdentityLock: null;
}

export interface ChildhoodCallback {
  readonly transactionId: string;
  readonly callbackId: string;
  readonly status: "scheduled" | "resolved";
  readonly dueStageId: ChildhoodLaterStageId;
  readonly dueStageTick: number;
  readonly title: string;
  readonly story: string;
  readonly effects: readonly ChildhoodScoreEffect[];
  readonly relationshipDelta: number;
  readonly friendPersonId: string;
  readonly originChoiceId: string;
  readonly originOptionId: string;
  readonly scheduledAtSimulationTick: number;
  readonly resolvedAtSimulationTick: number | null;
}

export interface ChildhoodEffectEntry {
  readonly effectId: string;
  readonly source: "choice" | "callback";
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly causedById: string;
  readonly simulationTick: number;
}

export interface ChildhoodStoryLogEntry {
  readonly logId: string;
  readonly stageId: ChildhoodLaterStageId;
  readonly kind:
    | "friend-introduced"
    | "choice-resolved"
    | "callback-resolved"
    | "stage-complete";
  readonly text: string;
  readonly simulationTick: number;
}

export interface ChildhoodScoreDeltaTotals {
  readonly health: number;
  readonly happiness: number;
  readonly money: number;
}

export interface ChildhoodStageSummary {
  readonly summaryId: string;
  readonly stageId: ChildhoodStageId;
  readonly stageLabel: string;
  readonly startAgeMonths: number;
  readonly endAgeMonths: number;
  readonly friendPersonId: string;
  readonly friendDisplayName: string;
  readonly selectedChoiceId: string;
  readonly selectedOptionId: string;
  readonly selectedOptionLabel: string;
  readonly scoreDelta: ChildhoodScoreDeltaTotals;
  readonly memoryIds: readonly string[];
  readonly resolvedCallbackIds: readonly string[];
  readonly nextEchoPreview: string;
  readonly narration: string;
}

export interface ChildhoodInfluenceProfile {
  readonly signals: Readonly<Record<ChildhoodInfluenceSignalId, number>>;
  readonly strongestSignals: readonly ChildhoodInfluenceSignalId[];
  readonly advisoryOnly: true;
  readonly identityDirective: null;
  readonly lockedCareerIds: readonly never[];
  readonly lockedRelationshipIds: readonly never[];
}

export interface ChildhoodState {
  readonly schemaVersion: 1;
  readonly contentVersion: "childhood-continuity-v1";
  readonly runId: string;
  readonly runSeed: string;
  readonly phase: ChildhoodPhase;
  readonly paused: boolean;
  readonly simulationTick: number;
  readonly scores: CoreScores;
  readonly stage: ChildhoodStageProgress;
  readonly friends: readonly ChildhoodFriendRelationship[];
  readonly companion: ChildhoodCompanion | null;
  readonly activeChoice: ChildhoodActiveChoice | null;
  readonly choices: readonly ChildhoodChoiceRecord[];
  readonly callbacks: readonly ChildhoodCallback[];
  readonly memories: readonly ChildhoodMemory[];
  readonly effects: readonly ChildhoodEffectEntry[];
  readonly summaries: readonly ChildhoodStageSummary[];
  readonly storyLog: readonly ChildhoodStoryLogEntry[];
}

export interface ChildhoodSetup {
  readonly runId: string;
  readonly runSeed: string;
  readonly scores?: CoreScores;
  readonly companionMode?: ChildhoodCompanionMode;
}

export interface ChildhoodHandoff {
  readonly handoffVersion: 1;
  readonly completed: true;
  readonly runId: string;
  readonly ageMonths: 168;
  readonly scores: CoreScores;
  readonly friends: readonly ChildhoodFriendRelationship[];
  readonly companion: ChildhoodCompanion | null;
  readonly memories: readonly ChildhoodMemory[];
  readonly pendingCallbacks: readonly ChildhoodCallback[];
  readonly summaries: readonly ChildhoodStageSummary[];
  readonly influence: ChildhoodInfluenceProfile;
}

export type ChildhoodAction =
  | Readonly<{ type: "advance"; ticks?: number }>
  | Readonly<{ type: "choose"; optionId: string }>
  | Readonly<{ type: "continue-stage" }>
  | Readonly<{ type: "set-paused"; paused: boolean }>;
