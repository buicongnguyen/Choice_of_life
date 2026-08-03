import type {
  Gender,
  HeritageStyle,
  Occupation,
} from "./types";
import {
  playerCareerUniform,
  type PlayerCareerUniform,
} from "./career-uniform";
import {
  lifeSeasonAt,
  type LifeSeason,
} from "./life-season";

export type OccupationSummerPolicy =
  | "casual"
  | "retain-workwear"
  | "illustrated-uniform";

/**
 * Every occupation must be classified explicitly. The runtime fallback for an
 * unknown future id is deliberately conservative, while the companion test
 * fails until that new id is added here.
 */
export const OCCUPATION_SUMMER_POLICY = {
  artist: "illustrated-uniform",
  dancer: "illustrated-uniform",
  farmer: "illustrated-uniform",
  barista: "illustrated-uniform",
  athlete: "illustrated-uniform",
  trainer: "illustrated-uniform",
  trades: "illustrated-uniform",
  soldier: "illustrated-uniform",
  police: "illustrated-uniform",
  chef: "illustrated-uniform",
  teacher: "illustrated-uniform",
  nurse: "illustrated-uniform",
  entrepreneur: "illustrated-uniform",
  jrdev: "illustrated-uniform",
  accountant: "illustrated-uniform",
  analyst: "illustrated-uniform",
  generalengineer: "illustrated-uniform",
  engineer: "illustrated-uniform",
  manager: "illustrated-uniform",
  lawyer: "illustrated-uniform",
  staffeng: "illustrated-uniform",
  doctor: "illustrated-uniform",
  ceo: "illustrated-uniform",
} as const satisfies Record<string, OccupationSummerPolicy>;

export type KnownOccupationId =
  keyof typeof OCCUPATION_SUMMER_POLICY;

export type PlayerBodyVariant =
  | {
      kind: "career-uniform";
      season: LifeSeason;
      careerUniform: PlayerCareerUniform;
    }
  | {
      kind: "summer-casual";
      season: "summer";
    }
  | {
      kind: "standard";
      season: LifeSeason | null;
    };

export interface PlayerBodyVariantInput {
  occupation: Occupation | null;
  stageId: string;
  age: number;
  gender: Gender;
  heritage: HeritageStyle;
}

export function occupationSummerPolicy(
  occupationId: string
): OccupationSummerPolicy | null {
  return Object.prototype.hasOwnProperty.call(
    OCCUPATION_SUMMER_POLICY,
    occupationId
  )
    ? OCCUPATION_SUMMER_POLICY[
        occupationId as KnownOccupationId
      ]
    : null;
}

/**
 * Select the player's complete body source without changing the saved gender
 * or heritage. Each custom atlas is a reviewed representative look for that
 * identity category, rather than the standard avatar's exact face and hair.
 *
 * Reviewed career art always wins during its supported chapters. Casual
 * summer art is then allowed only in summer: at work (Career) for explicitly
 * casual unillustrated jobs, and at home/off duty (Marriage and Middle Age)
 * for every unillustrated job. All other combinations use the standard
 * age-correct storybook body.
 */
export function playerBodyVariantAtAge({
  occupation,
  stageId,
  age,
  gender,
  heritage,
}: PlayerBodyVariantInput): PlayerBodyVariant {
  const season = lifeSeasonAt(stageId, age);
  const careerUniform = playerCareerUniform(
    occupation,
    stageId,
    gender,
    heritage
  );
  if (careerUniform && season) {
    return {
      kind: "career-uniform",
      season,
      careerUniform,
    };
  }

  if (
    season !== "summer" ||
    !occupation ||
    occupation.uniform
  ) {
    return { kind: "standard", season };
  }

  if (
    stageId === "marriage" ||
    stageId === "midlife" ||
    (stageId === "career" &&
      occupationSummerPolicy(occupation.id) === "casual")
  ) {
    return {
      kind: "summer-casual",
      season: "summer",
    };
  }

  return { kind: "standard", season };
}
