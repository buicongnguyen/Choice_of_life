import { describe, expect, it } from "vitest";
import { OCCUPATIONS } from "./occupations";
import {
  OCCUPATION_SUMMER_POLICY,
  occupationSummerPolicy,
  playerBodyVariantAtAge,
} from "./player-body-variant";
import type {
  Gender,
  HeritageStyle,
  Occupation,
} from "./types";

const occupation = (id: string): Occupation => {
  const found = OCCUPATIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing test occupation: ${id}`);
  return found;
};

const unillustratedOccupation = (): Occupation => ({
  ...occupation("artist"),
  id: "future-unillustrated",
  uniform: undefined,
});

const at = (
  job: Occupation | null,
  stageId: string,
  age: number,
  gender: Gender = "female",
  heritage: HeritageStyle = "asian"
) =>
  playerBodyVariantAtAge({
    occupation: job,
    stageId,
    age,
    gender,
    heritage,
  });

describe("exhaustive occupation summer policy", () => {
  it("classifies every exact occupation id and no stale ids", () => {
    expect(Object.keys(OCCUPATION_SUMMER_POLICY).sort()).toEqual(
      OCCUPATIONS.map((job) => job.id).sort()
    );
    for (const job of OCCUPATIONS) {
      expect(occupationSummerPolicy(job.id)).not.toBeNull();
    }
    expect(occupationSummerPolicy("future-job")).toBeNull();
  });

  it("keeps illustrated policy in sync with reviewed uniforms", () => {
    for (const job of OCCUPATIONS) {
      expect(
        OCCUPATION_SUMMER_POLICY[
          job.id as keyof typeof OCCUPATION_SUMMER_POLICY
        ] === "illustrated-uniform"
      ).toBe(Boolean(job.uniform));
    }
  });
});

describe("player body variant selection", () => {
  it("always gives reviewed career art precedence through Middle Age", () => {
    const illustrated = OCCUPATIONS.filter((job) => job.uniform);
    for (const stage of [
      ["career", [22, 24, 26.000001, 28]],
      ["marriage", [30, 31.5, 33.000001, 34.5]],
      ["midlife", [36, 40.75, 45.500001, 50.25]],
    ] as const) {
      for (const [seasonIndex, age] of stage[1].entries()) {
        for (const job of illustrated) {
          expect(at(job, stage[0], age)).toEqual({
            kind: "career-uniform",
            season: [
              "spring",
              "summer",
              "autumn",
              "winter",
            ][seasonIndex],
            careerUniform: {
              uniform: job.uniform,
              gender: "female",
              heritage: "asian",
            },
          });
        }
      }
    }
  });

  it("routes every catalog job through reviewed workwear in Career summer", () => {
    for (const job of OCCUPATIONS) {
      expect(at(job, "career", 24).kind).toBe(
        "career-uniform"
      );
    }
  });

  it("keeps a safe generic summer path for a future unillustrated job", () => {
    const job = unillustratedOccupation();
    expect(at(job, "marriage", 31.5)).toEqual({
      kind: "summer-casual",
      season: "summer",
    });
    expect(at(job, "midlife", 40.75)).toEqual({
      kind: "summer-casual",
      season: "summer",
    });
  });

  it("does not replace an illustrated job with generic summer casual", () => {
    const artist = occupation("artist");
    for (const age of [22, 24, 26, 26.000001, 28]) {
      expect(at(artist, "career", age).kind).toBe(
        "career-uniform"
      );
    }
  });

  it("uses the standard body through University and after Middle Age", () => {
    const artist = occupation("artist");
    for (const [stageId, age] of [
      ["university", 20],
      ["senior", 60],
      ["retirement", 74],
    ] as const) {
      expect(at(artist, stageId, age)).toEqual({
        kind: "standard",
        season: null,
      });
    }
  });

  it("does not borrow illustrated career art or summer art for unsupported heritage", () => {
    const doctor = occupation("doctor");
    for (const heritage of [
      "black",
      "middleEastern",
    ] as const) {
      expect(
        at(doctor, "career", 24, "male", heritage)
      ).toEqual({
        kind: "standard",
        season: "summer",
      });
    }
  });

  it("keeps exact gender and heritage in the winning career body", () => {
    const doctor = occupation("doctor");
    for (const gender of ["male", "female"] as const) {
      for (const heritage of ["western", "asian"] as const) {
        expect(
          at(doctor, "midlife", 40.75, gender, heritage)
        ).toEqual({
          kind: "career-uniform",
          season: "summer",
          careerUniform: {
            uniform: "doctor",
            gender,
            heritage,
          },
        });
      }
    }
  });

  it("keeps a standard body when no occupation has been selected", () => {
    expect(at(null, "marriage", 31.5)).toEqual({
      kind: "standard",
      season: "summer",
    });
  });
});
