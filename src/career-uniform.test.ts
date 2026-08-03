import { describe, expect, it } from "vitest";
import {
  PLAYER_CAREER_UNIFORM_STAGE_IDS,
  playerCareerUniform,
} from "./career-uniform";
import { OCCUPATIONS } from "./occupations";
import type { Occupation } from "./types";

describe("selected player career uniform", () => {
  const doctor = OCCUPATIONS.find(
    (occupation) => occupation.id === "doctor"
  )!;
  const artist = OCCUPATIONS.find(
    (occupation) => occupation.id === "artist"
  )!;
  const unillustrated: Occupation = {
    ...artist,
    id: "future-unillustrated",
    uniform: undefined,
  };

  it("is active from Career through Middle Age, inclusive", () => {
    expect(PLAYER_CAREER_UNIFORM_STAGE_IDS).toEqual([
      "career",
      "marriage",
      "midlife",
    ]);
    for (const stageId of [
      "career",
      "marriage",
      "midlife",
    ]) {
      expect(
        playerCareerUniform(
          doctor,
          stageId,
          "female",
          "asian"
        )
      ).toEqual({
        uniform: "doctor",
        gender: "female",
        heritage: "asian",
      });
    }
    for (const stageId of [
      "university",
      "senior",
      "retirement",
    ]) {
      expect(
        playerCareerUniform(
          doctor,
          stageId,
          "female",
          "asian"
        )
      ).toBeNull();
    }
  });

  it("routes every reviewed job through both exact genders and heritages", () => {
    const reviewed = OCCUPATIONS.filter(
      (occupation) => occupation.uniform
    );
    expect(reviewed).toHaveLength(OCCUPATIONS.length);

    for (const occupation of reviewed) {
      for (const gender of ["male", "female"] as const) {
        for (const heritage of [
          "western",
          "asian",
        ] as const) {
          expect(
            playerCareerUniform(
              occupation,
              "career",
              gender,
              heritage
            )
          ).toEqual({
            uniform: occupation.uniform,
            gender,
            heritage,
          });
        }
      }
    }
  });

  it("keeps a normal avatar for careers without reviewed outfit art", () => {
    expect(
      playerCareerUniform(
        unillustrated,
        "career",
        "female",
        "asian"
      )
    ).toBeNull();
    expect(
      playerCareerUniform(
        null,
        "career",
        "male",
        "western"
      )
    ).toBeNull();
  });

  it("updates immediately when the selected occupation changes", () => {
    const dancer = OCCUPATIONS.find(
      (occupation) => occupation.id === "dancer"
    )!;
    expect(
      playerCareerUniform(
        doctor,
        "midlife",
        "female",
        "western"
      )?.uniform
    ).toBe("doctor");
    expect(
      playerCareerUniform(
        dancer,
        "midlife",
        "female",
        "western"
      )?.uniform
    ).toBe("dancer");
    expect(
      playerCareerUniform(
        unillustrated,
        "midlife",
        "female",
        "western"
      )
    ).toBeNull();
  });

  it("uses the reviewed medical sheet for both Doctor and Nurse", () => {
    const nurse = OCCUPATIONS.find(
      (occupation) => occupation.id === "nurse"
    )!;
    expect(
      playerCareerUniform(
        nurse,
        "career",
        "male",
        "western"
      )
    ).toEqual({
      uniform: "doctor",
      gender: "male",
      heritage: "western",
    });
  });

  it("never changes unsupported heritage to borrow another character", () => {
    for (const heritage of [
      "black",
      "middleEastern",
    ] as const) {
      expect(
        playerCareerUniform(
          doctor,
          "midlife",
          "male",
          heritage
        )
      ).toBeNull();
    }
  });
});
