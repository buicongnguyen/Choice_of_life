export {
  LATER_CAREER_CHOICE,
  LATER_LIFE_CHOICES,
  LEGACY_CHOICE,
  RETIREMENT_CHOICE,
} from "./content";

export {
  assembleFullBiography,
  createDefaultPriorChapters,
  deriveLifeEndingTitle,
  mergePriorBiographyChapters,
} from "./biography";

export {
  acknowledgeLaterLifeCallback,
  canCompleteLaterLife,
  chooseLaterCareerDirection,
  chooseLegacyRoute,
  chooseRetirementTiming,
  completeLaterLife,
  createLaterLifeState,
  getCurrentLaterLifeChoice,
  getPresentingLaterLifeCallback,
  reduceLaterLife,
  selectLaterLifeOption,
} from "./runtime";

export { LIFE_STAGE_IDS } from "./types";

export type {
  BiographyBalanceProfile,
  BiographyChapter,
  BiographyChapterInput,
  BiographyPerson,
  BiographyRelationship,
  BiographyScoreReflection,
  EndingTitle,
  EndingTitleContext,
  EndingTitleId,
  FullBiography,
  LaterCareerChoiceOption,
  LaterCareerOptionId,
  LaterLifeAction,
  LaterLifeChapterRecord,
  LaterLifeChoiceOption,
  LaterLifeEffectEntry,
  LaterLifeMajorChoice,
  LaterLifeOptionId,
  LaterLifePhase,
  LaterLifeScoreEffect,
  LaterLifeSetup,
  LaterLifeStageId,
  LaterLifeState,
  LegacyChoiceOption,
  LegacyOptionId,
  LegacyRoute,
  LifeDecisionRecord,
  LifeFact,
  LifeFactKind,
  LifeStageId,
  RetirementChoiceOption,
  RetirementOptionId,
  RetirementTiming,
  SceneCallbackRecord,
  SceneCallbackStatus,
  ScoreBand,
} from "./types";
