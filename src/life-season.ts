import { STAGES } from "./stages";

export const LIFE_SEASONS = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

export type LifeSeason = (typeof LIFE_SEASONS)[number];

export const SEASONAL_LIFE_STAGE_IDS = [
  "career",
  "marriage",
  "midlife",
] as const;

export type SeasonalLifeStageId =
  (typeof SEASONAL_LIFE_STAGE_IDS)[number];

const SEASONAL_STAGE_IDS = new Set<string>(
  SEASONAL_LIFE_STAGE_IDS
);

/**
 * Return progress through a supported working-adult chapter.
 *
 * The result is derived only from the persisted age and immutable stage
 * bounds, so saving, resuming, and rewinding to the same age always select the
 * same season. Ages outside a chapter are clamped to its nearest endpoint.
 */
export function normalizedSeasonalChapterProgress(
  stageId: string,
  age: number
): number | null {
  if (!SEASONAL_STAGE_IDS.has(stageId)) return null;
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  if (!stage) return null;

  const chapterAge = Number.isFinite(age) ? age : stage.ageStart;
  const duration = stage.ageEnd - stage.ageStart;
  if (duration <= 0) return 0;
  return Math.max(
    0,
    Math.min(1, (chapterAge - stage.ageStart) / duration)
  );
}

/**
 * Select one of four equal chapter quarters:
 * spring, summer, autumn, then winter. The exact halfway checkpoint remains
 * Summer so every supported life speed, including 4×, visibly reaches the
 * requested warm-weather wardrobe instead of jumping from Spring to Autumn.
 *
 * No season is exposed through University, or after Middle Age. An age at or
 * beyond a supported chapter's end remains winter rather than wrapping.
 */
export function lifeSeasonAt(
  stageId: string,
  age: number
): LifeSeason | null {
  const progress = normalizedSeasonalChapterProgress(
    stageId,
    age
  );
  if (progress === null) return null;
  if (progress < 0.25) return "spring";
  if (progress <= 0.5) return "summer";
  if (progress < 0.75) return "autumn";
  return "winter";
}
