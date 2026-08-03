import { describe, expect, it } from "vitest";
import { PARTNERS } from "./partners";
import { STAGES } from "./stages";

describe("life-stage content", () => {
  it("keeps chronological stages and unique option ids within each chapter", () => {
    expect(STAGES).toHaveLength(12);
    STAGES.forEach((stage, index) => {
      expect(stage.ageEnd).toBeGreaterThan(stage.ageStart);
      if (index > 0) expect(stage.ageStart).toBe(STAGES[index - 1].ageEnd);
      expect(new Set(stage.options.map((option) => option.id)).size).toBe(stage.options.length);
    });
  });

  it("gives every chapter both connection and non-social activity", () => {
    for (const stage of STAGES) {
      expect(stage.options.some((option) => option.person || option.category === "social")).toBe(true);
      expect(stage.options.some((option) => !option.person && option.category !== "social")).toBe(true);
    }
  });

  it("does not gate relationships by body, intelligence, or wealth", () => {
    expect(PARTNERS.every((partner) => partner.requires === undefined)).toBe(true);
  });
});
