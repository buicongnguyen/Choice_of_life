import { describe, expect, it } from "vitest";
import {
  EMPTY_PARENT_CAREERS,
  normalizeParentCareerIds,
  parentOccupation,
  parentProfessionSpec,
  type ParentCareerIds,
} from "./parent-careers";

describe("parent career data", () => {
  it("normalizes independent known occupation ids", () => {
    expect(
      normalizeParentCareerIds({
        mother: "teacher",
        father: "engineer",
      })
    ).toEqual({
      mother: "teacher",
      father: "engineer",
    });
  });

  it("safely removes missing, malformed, and retired ids", () => {
    expect(normalizeParentCareerIds(undefined)).toEqual(
      EMPTY_PARENT_CAREERS
    );
    expect(normalizeParentCareerIds("teacher")).toEqual(
      EMPTY_PARENT_CAREERS
    );
    expect(
      normalizeParentCareerIds({
        mother: "retired-job",
        father: 42,
      })
    ).toEqual(EMPTY_PARENT_CAREERS);
    expect(
      normalizeParentCareerIds({
        mother: "teacher",
        father: "retired-job",
      })
    ).toEqual({
      mother: "teacher",
      father: null,
    });
  });

  it("looks up each parent without crossing their ids", () => {
    const ids: ParentCareerIds = {
      mother: "artist",
      father: "police",
    };
    expect(parentOccupation("mother", ids)?.name).toBe("Artist");
    expect(parentOccupation("father", ids)?.name).toBe(
      "Police Officer"
    );
    expect(
      parentOccupation("mother", {
        mother: null,
        father: "police",
      })
    ).toBeNull();
  });

  it("routes exact mother and father genders independently of player data", () => {
    const ids: ParentCareerIds = {
      mother: "teacher",
      father: "engineer",
    };
    expect(
      parentProfessionSpec("mother", ids, "asian")
    ).toEqual({
      id: "teacher",
      uniform: "teacher",
      gender: "female",
      heritage: "asian",
    });
    expect(
      parentProfessionSpec("father", ids, "western")
    ).toEqual({
      id: "engineer",
      uniform: "softwareengineer",
      gender: "male",
      heritage: "western",
    });
  });

  it("preserves supported heritage and never borrows unsupported art", () => {
    const ids: ParentCareerIds = {
      mother: "analyst",
      father: "generalengineer",
    };
    for (const heritage of ["western", "asian"] as const) {
      expect(
        parentProfessionSpec("mother", ids, heritage)?.heritage
      ).toBe(heritage);
      expect(
        parentProfessionSpec("father", ids, heritage)?.heritage
      ).toBe(heritage);
    }
    for (const heritage of [
      "middleEastern",
      "black",
    ] as const) {
      expect(
        parentProfessionSpec("mother", ids, heritage)
      ).toBeNull();
      expect(
        parentProfessionSpec("father", ids, heritage)
      ).toBeNull();
    }
  });

  it("returns no visual profession when a parent has no selected job", () => {
    expect(
      parentProfessionSpec(
        "mother",
        EMPTY_PARENT_CAREERS,
        "asian"
      )
    ).toBeNull();
    expect(
      parentProfessionSpec(
        "father",
        EMPTY_PARENT_CAREERS,
        "western"
      )
    ).toBeNull();
  });
});
