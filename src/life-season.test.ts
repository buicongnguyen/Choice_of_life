import { describe, expect, it } from "vitest";
import { STAGES } from "./stages";
import {
  LIFE_SPEEDS,
  chapterAgeStep,
} from "./life-rules";
import {
  LIFE_SEASONS,
  SEASONAL_LIFE_STAGE_IDS,
  lifeSeasonAt,
  normalizedSeasonalChapterProgress,
} from "./life-season";

describe("adult life seasons", () => {
  it("has no season through University or after Middle Age", () => {
    for (const stage of STAGES) {
      const seasonal = SEASONAL_LIFE_STAGE_IDS.includes(
        stage.id as (typeof SEASONAL_LIFE_STAGE_IDS)[number]
      );
      expect(lifeSeasonAt(stage.id, stage.ageStart)).toBe(
        seasonal ? "spring" : null
      );
    }
  });

  it.each([
    ["career", 22, 24, 26.000001, 28, 30],
    ["marriage", 30, 31.5, 33.000001, 34.5, 36],
    ["midlife", 36, 40.75, 45.500001, 50.25, 55],
  ] as const)(
    "divides %s into four equal seasonal quarters",
    (stageId, start, summer, autumn, winter, end) => {
      expect(lifeSeasonAt(stageId, start)).toBe("spring");
      expect(lifeSeasonAt(stageId, summer)).toBe("summer");
      expect(lifeSeasonAt(stageId, autumn)).toBe("autumn");
      expect(lifeSeasonAt(stageId, winter)).toBe("winter");
      expect(lifeSeasonAt(stageId, end)).toBe("winter");
    }
  );

  it("keeps the exact halfway checkpoint in Summer", () => {
    const epsilon = 0.000001;
    expect(lifeSeasonAt("career", 24 - epsilon)).toBe(
      "spring"
    );
    expect(lifeSeasonAt("career", 24)).toBe("summer");
    expect(lifeSeasonAt("career", 26 - epsilon)).toBe(
      "summer"
    );
    expect(lifeSeasonAt("career", 26)).toBe("summer");
    expect(lifeSeasonAt("career", 26 + epsilon)).toBe(
      "autumn"
    );
    expect(lifeSeasonAt("career", 28 - epsilon)).toBe(
      "autumn"
    );
    expect(lifeSeasonAt("career", 28)).toBe("winter");
  });

  it("makes Summer reachable at every supported life speed", () => {
    for (const stageId of SEASONAL_LIFE_STAGE_IDS) {
      const stage = STAGES.find(
        (candidate) => candidate.id === stageId
      );
      expect(stage).toBeDefined();
      if (!stage) continue;

      for (const speed of LIFE_SPEEDS) {
        const step =
          chapterAgeStep(stage.ageStart, stage.ageEnd) *
          speed;
        const seasons: Array<
          ReturnType<typeof lifeSeasonAt>
        > = [];
        for (
          let age = stage.ageStart;
          age < stage.ageEnd;
          age += step
        ) {
          seasons.push(lifeSeasonAt(stage.id, age));
        }
        expect(
          seasons,
          `${stage.id} at ${speed}×`
        ).toContain("summer");
      }
    }
  });

  it("clamps ages outside a supported chapter", () => {
    expect(normalizedSeasonalChapterProgress("career", -20)).toBe(
      0
    );
    expect(normalizedSeasonalChapterProgress("career", 200)).toBe(
      1
    );
    expect(lifeSeasonAt("career", -20)).toBe("spring");
    expect(lifeSeasonAt("career", 200)).toBe("winter");
    expect(lifeSeasonAt("career", Number.NaN)).toBe("spring");
  });

  it("is deterministic from persisted stage and age alone", () => {
    const persisted = JSON.parse(
      JSON.stringify({ stageId: "midlife", age: 44.125 })
    ) as { stageId: string; age: number };
    const first = lifeSeasonAt(
      persisted.stageId,
      persisted.age
    );
    expect(first).toBe("summer");
    for (let i = 0; i < 20; i += 1) {
      expect(
        lifeSeasonAt(persisted.stageId, persisted.age)
      ).toBe(first);
    }
    expect(LIFE_SEASONS).toEqual([
      "spring",
      "summer",
      "autumn",
      "winter",
    ]);
  });
});
