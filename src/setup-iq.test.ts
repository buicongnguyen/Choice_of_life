import { describe, expect, it } from "vitest";
import { OCCUPATIONS } from "./occupations";
import {
  normalizeStartingIq,
  startingIqPlan,
} from "./setup-iq";

describe("advanced starting IQ", () => {
  it("treats an empty or invalid choice as automatic", () => {
    expect(normalizeStartingIq("")).toBeNull();
    expect(normalizeStartingIq(null)).toBeNull();
    expect(normalizeStartingIq("not-a-score")).toBeNull();
    expect(normalizeStartingIq(Number.NaN)).toBeNull();
    expect(
      normalizeStartingIq(Number.POSITIVE_INFINITY)
    ).toBeNull();
  });

  it("normalizes custom scores to the live 40–160 IQ range", () => {
    expect(normalizeStartingIq(40)).toBe(40);
    expect(normalizeStartingIq(160)).toBe(160);
    expect(normalizeStartingIq("39")).toBe(40);
    expect(normalizeStartingIq("127.6")).toBe(128);
    expect(normalizeStartingIq(170)).toBe(160);
  });

  it("preserves the balanced newborn default in automatic mode", () => {
    expect(startingIqPlan(0, 118, null)).toEqual({
      currentIq: 60,
      iqCeiling: 118,
      customized: false,
    });
  });

  it("uses an age-appropriate IQ when starting in a later chapter", () => {
    expect(startingIqPlan(18, 112, null)).toEqual({
      currentIq: 112,
      iqCeiling: 112,
      customized: false,
    });
    expect(startingIqPlan(70, 100, null)).toEqual({
      currentIq: 93,
      iqCeiling: 100,
      customized: false,
    });
  });

  it("keeps a custom testing score as the current and lifelong target", () => {
    expect(startingIqPlan(18, 82, 150)).toEqual({
      currentIq: 150,
      iqCeiling: 150,
      customized: true,
    });
    expect(
      OCCUPATIONS.every(
        (occupation) => occupation.minIq <= 150
      )
    ).toBe(true);
    expect(
      OCCUPATIONS.some(
        (occupation) => occupation.minIq > 149
      )
    ).toBe(true);
    expect(
      Math.max(
        ...OCCUPATIONS.map(
          (occupation) => occupation.minIq
        )
      )
    ).toBe(150);
    expect(startingIqPlan(22, 80, 160)).toEqual({
      currentIq: 160,
      iqCeiling: 160,
      customized: true,
    });
  });
});
