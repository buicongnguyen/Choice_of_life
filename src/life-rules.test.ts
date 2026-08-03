import { describe, expect, it } from "vitest";
import { ACTIONS_PER_CHAPTER, backgroundMoney, chapterAgeStep, partnerLifeAge } from "./life-rules";

describe("v5 pacing", () => {
  it("budgets about eight actions per ordinary chapter", () => {
    expect(chapterAgeStep(22, 30)).toBe(1);
    expect((30 - 22) / chapterAgeStep(22, 30)).toBe(ACTIONS_PER_CHAPTER);
  });

  it("scales only by supported player speed", () => {
    expect(chapterAgeStep(14, 18, 2)).toBe(1);
  });
});

describe("v5 starting backgrounds", () => {
  it("uses the balanced default for unknown values", () => {
    expect(backgroundMoney("unknown")).toBe(75000);
  });
});

describe("life-event variation", () => {
  it("is stable and remains in a humane late-life range", () => {
    const age = partnerLifeAge("maya");
    expect(partnerLifeAge("maya")).toBe(age);
    expect(age).toBeGreaterThanOrEqual(74);
    expect(age).toBeLessThanOrEqual(88);
  });
});
