import type {
  Gender,
  HeritageStyle,
  JobUniform,
  Occupation,
} from "./types";

export type CareerUniformHeritage = Extract<
  HeritageStyle,
  "western" | "asian"
>;

export interface PlayerCareerUniform {
  uniform: JobUniform;
  gender: Gender;
  heritage: CareerUniformHeritage;
}

/**
 * A selected work outfit stays on during the three working-adult chapters.
 * Senior and Retirement return to the age-correct elder character art.
 */
export const PLAYER_CAREER_UNIFORM_STAGE_IDS = [
  "career",
  "marriage",
  "midlife",
] as const;

const PLAYER_CAREER_UNIFORM_STAGES = new Set<string>(
  PLAYER_CAREER_UNIFORM_STAGE_IDS
);

export function playerCareerUniform(
  occupation: Occupation | null,
  stageId: string,
  gender: Gender,
  heritage: HeritageStyle
): PlayerCareerUniform | null {
  if (
    !occupation?.uniform ||
    !PLAYER_CAREER_UNIFORM_STAGES.has(stageId) ||
    (heritage !== "western" && heritage !== "asian")
  ) {
    return null;
  }
  return {
    uniform: occupation.uniform,
    gender,
    heritage,
  };
}
