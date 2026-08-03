import { describe, expect, it } from "vitest";
import {
  CAREER_OUTFIT_GENDERS,
  CAREER_OUTFIT_HERITAGES,
  CAREER_OUTFIT_PACKS,
  CAREER_OUTFIT_SEASONS,
  CAREER_OUTFIT_UNIFORMS,
  careerOutfitAtlasUrl,
  careerOutfitCharacterFrame,
  careerOutfitHeritage,
  isCareerOutfitUniform,
  type CareerOutfitFacing,
  type CareerOutfitPack,
  type CareerOutfitUniform,
} from "./career-outfit-characters";
import {
  JOB_UNIFORMS,
  isJobUniform,
  jobArtHeritage,
  jobCharacterFrame,
  jobUniformHasSummer,
} from "./job-characters";
import {
  OCCUPATION_UNIFORMS,
  type LegacyJobUniform,
} from "./occupation-characters";
import type {
  Gender,
  HeritageStyle,
} from "./types";

const PACKS = {
  service: [
    "teacher",
    "chef",
    "barista",
    "athlete",
    "artist",
  ],
  technical: [
    "generalengineer",
    "softwareengineer",
    "police",
    "entrepreneur",
  ],
  leadership: [
    "manager",
    "analyst",
    "lawyer",
    "ceo",
  ],
} as const satisfies Record<
  CareerOutfitPack,
  readonly CareerOutfitUniform[]
>;

const FACINGS = [
  "front",
  "left",
  "back",
  "right",
] as const satisfies readonly CareerOutfitFacing[];
const SUPPORTED_HERITAGES = [
  "western",
  "asian",
] as const;
const GENDERS = ["male", "female"] as const;
const SEASONS = ["standard", "summer"] as const;
const UNSUPPORTED_HERITAGES = [
  "middleEastern",
  "black",
] as const satisfies readonly HeritageStyle[];

describe("career outfit runtime contract", () => {
  it("maps each requested uniform exactly once into the fixed pack row", () => {
    const flattened = Object.values(PACKS).flat();
    expect(flattened).toHaveLength(13);
    expect(new Set(flattened).size).toBe(flattened.length);
    expect(CAREER_OUTFIT_UNIFORMS).toEqual(flattened);
    expect(CAREER_OUTFIT_PACKS).toEqual([
      "service",
      "technical",
      "leadership",
    ]);
    expect(CAREER_OUTFIT_HERITAGES).toEqual(
      SUPPORTED_HERITAGES
    );
    expect(CAREER_OUTFIT_GENDERS).toEqual(GENDERS);
    expect(CAREER_OUTFIT_SEASONS).toEqual(SEASONS);

    for (const uniform of flattened) {
      expect(isCareerOutfitUniform(uniform)).toBe(true);
      expect(
        flattened.filter((candidate) => candidate === uniform)
      ).toHaveLength(1);
    }
    expect(isCareerOutfitUniform("doctor")).toBe(false);
    expect(isCareerOutfitUniform("not-a-job")).toBe(false);
  });

  it("resolves every season, identity, direction, and motion frame", () => {
    for (const [pack, uniforms] of Object.entries(PACKS) as [
      CareerOutfitPack,
      readonly CareerOutfitUniform[],
    ][]) {
      for (const [row, uniform] of uniforms.entries()) {
        for (const season of SEASONS) {
          for (const heritage of SUPPORTED_HERITAGES) {
            for (const gender of GENDERS) {
              for (const [
                facingColumn,
                facing,
              ] of FACINGS.entries()) {
                expect(
                  careerOutfitCharacterFrame(
                    uniform,
                    heritage,
                    gender,
                    {
                      season,
                      facing,
                      moving: false,
                      phase: 1,
                    }
                  )
                ).toEqual({
                  atlasKey: `${pack}-${season}-${heritage}-${gender}`,
                  pack,
                  row,
                  column: facingColumn,
                  ageBand: "adult",
                  season,
                });
                expect(
                  careerOutfitCharacterFrame(
                    uniform,
                    heritage,
                    gender,
                    {
                      season,
                      facing,
                      moving: true,
                      phase: 2,
                    }
                  )
                ).toEqual({
                  atlasKey: `${pack}-${season}-${heritage}-${gender}`,
                  pack,
                  row,
                  column: facingColumn + 4,
                  ageBand: "adult",
                  season,
                });
              }

              const filename =
                `career-outfit-atlas-${pack}-${season}-` +
                `${heritage}-${gender}.png`;
              expect(
                careerOutfitAtlasUrl(
                  uniform,
                  heritage,
                  gender,
                  season
                )
              ).toContain(filename);
            }
          }
        }
      }
    }
  });

  it("returns null for unsupported art heritage instead of borrowing an identity", () => {
    for (const heritage of UNSUPPORTED_HERITAGES) {
      expect(careerOutfitHeritage(heritage)).toBeNull();
      expect(jobArtHeritage(heritage)).toBeNull();
      for (const uniform of CAREER_OUTFIT_UNIFORMS) {
        for (const gender of GENDERS) {
          expect(
            careerOutfitCharacterFrame(
              uniform,
              heritage,
              gender
            )
          ).toBeNull();
          expect(
            jobCharacterFrame(uniform, heritage, gender)
          ).toBeNull();
        }
      }
    }
  });
});

describe("job character facade compatibility", () => {
  it("keeps all five legacy uniforms available through the facade", () => {
    expect(OCCUPATION_UNIFORMS).toEqual([
      "doctor",
      "trainer",
      "dancer",
      "soldier",
      "farmer",
    ]);
    expect(JOB_UNIFORMS).toEqual([
      ...OCCUPATION_UNIFORMS,
      ...CAREER_OUTFIT_UNIFORMS,
    ]);

    for (const uniform of OCCUPATION_UNIFORMS) {
      expect(isJobUniform(uniform)).toBe(true);
      expect(jobUniformHasSummer(uniform)).toBe(false);
      for (const heritage of SUPPORTED_HERITAGES) {
        for (const gender of GENDERS) {
          const frame = jobCharacterFrame(
            uniform,
            heritage,
            gender,
            {
              season: "summer",
              facing: "right",
              moving: true,
              phase: 2,
            }
          );
          expect(frame).toMatchObject({
            source: "legacy",
            atlasKey: `${uniform}-${heritage}-${gender}`,
            column: 7,
          });
        }
      }
    }
  });

  it("routes every new uniform to career art with dedicated summer support", () => {
    for (const uniform of CAREER_OUTFIT_UNIFORMS) {
      expect(isJobUniform(uniform)).toBe(true);
      expect(jobUniformHasSummer(uniform)).toBe(true);
      const frame = jobCharacterFrame(
        uniform,
        "asian",
        "female",
        {
          season: "summer",
          facing: "left",
          moving: true,
          phase: 2,
        }
      );
      expect(frame).toMatchObject({
        source: "career-outfit",
        season: "summer",
        column: 5,
      });
    }
    expect(isJobUniform("not-a-job")).toBe(false);
  });

  it("does not reinterpret legacy uniforms as career uniforms", () => {
    for (const uniform of OCCUPATION_UNIFORMS) {
      expect(
        isCareerOutfitUniform(uniform as LegacyJobUniform)
      ).toBe(false);
      for (const heritage of UNSUPPORTED_HERITAGES) {
        for (const gender of GENDERS) {
          expect(
            jobCharacterFrame(uniform, heritage, gender)
          ).toBeNull();
        }
      }
    }
  });
});
