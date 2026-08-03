import {
  drawCareerOutfitCharacter,
  CAREER_OUTFIT_UNIFORMS,
  careerOutfitAtlasUrl,
  careerOutfitCharacterFrame,
  careerOutfitHeritage,
  isCareerOutfitUniform,
  warmCareerOutfitAtlases,
  type CareerOutfitDrawOptions,
  type CareerOutfitFrame,
  type CareerOutfitHeritage,
  type CareerOutfitSeason,
  type CareerOutfitUniform,
} from "./career-outfit-characters";
import {
  drawOccupationCharacter,
  OCCUPATION_UNIFORMS,
  occupationCharacterAtlasUrl,
  occupationCharacterFrame,
  occupationHeritage,
  warmOccupationCharacterAtlases,
  type OccupationCharacterDrawOptions,
  type OccupationCharacterFrame,
  type OccupationHeritage,
} from "./occupation-characters";
import type {
  Gender,
  HeritageStyle,
  JobUniform,
} from "./types";

export const JOB_UNIFORMS = [
  ...OCCUPATION_UNIFORMS,
  ...CAREER_OUTFIT_UNIFORMS,
] as const satisfies readonly JobUniform[];

export type JobArtSeason = CareerOutfitSeason;
export type JobArtHeritage =
  | OccupationHeritage
  | CareerOutfitHeritage;
export type JobCharacterFrame =
  | ({ source: "legacy" } & OccupationCharacterFrame)
  | ({ source: "career-outfit" } & CareerOutfitFrame);

export interface JobCharacterDrawOptions
  extends OccupationCharacterDrawOptions {
  season?: JobArtSeason;
}

export function isJobUniform(
  value: string
): value is JobUniform {
  return JOB_UNIFORMS.includes(value as JobUniform);
}

export function jobArtHeritage(
  heritage: HeritageStyle
): JobArtHeritage | null {
  return (
    careerOutfitHeritage(heritage) ??
    occupationHeritage(heritage)
  );
}

export function jobUniformHasSummer(
  uniform: JobUniform
): boolean {
  return isCareerOutfitUniform(uniform);
}

export function jobCharacterFrame(
  uniform: JobUniform,
  heritage: HeritageStyle,
  gender: Gender,
  options: CareerOutfitDrawOptions = {}
): JobCharacterFrame | null {
  if (isCareerOutfitUniform(uniform)) {
    const frame = careerOutfitCharacterFrame(
      uniform,
      heritage,
      gender,
      options
    );
    return frame
      ? { source: "career-outfit", ...frame }
      : null;
  }
  const frame = occupationCharacterFrame(
    uniform,
    heritage,
    gender,
    options
  );
  return frame ? { source: "legacy", ...frame } : null;
}

export function drawJobCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  uniform: JobUniform,
  heritage: HeritageStyle,
  gender: Gender,
  options: JobCharacterDrawOptions = {}
): boolean {
  if (isCareerOutfitUniform(uniform)) {
    return drawCareerOutfitCharacter(
      ctx,
      x,
      footY,
      uniform,
      heritage,
      gender,
      options
    );
  }
  return drawOccupationCharacter(
    ctx,
    x,
    footY,
    uniform,
    heritage,
    gender,
    options
  );
}

export async function warmJobCharacterAtlases(
  heritage?: HeritageStyle,
  gender?: Gender,
  uniform?: JobUniform,
  season: JobArtSeason = "standard"
): Promise<boolean> {
  if (uniform) {
    return isCareerOutfitUniform(uniform)
      ? warmCareerOutfitAtlases(
          heritage,
          gender,
          uniform,
          season
        )
      : warmOccupationCharacterAtlases(
          heritage,
          gender,
          uniform
        );
  }

  const [legacyReady, careerReady] = await Promise.all([
    warmOccupationCharacterAtlases(heritage, gender),
    warmCareerOutfitAtlases(
      heritage,
      gender,
      undefined,
      season
    ),
  ]);
  return legacyReady && careerReady;
}

export function jobCharacterAtlasUrl(
  uniform: JobUniform,
  heritage: JobArtHeritage,
  gender: Gender,
  season: JobArtSeason = "standard"
): string {
  return isCareerOutfitUniform(uniform)
    ? careerOutfitAtlasUrl(
        uniform as CareerOutfitUniform,
        heritage as CareerOutfitHeritage,
        gender,
        season
      )
    : occupationCharacterAtlasUrl(
        uniform,
        heritage as OccupationHeritage,
        gender
      );
}
