import { describe, expect, it } from "vitest";

import {
  CLOTHING_PALETTES,
  CONTROL_MODES,
  DEFAULT_SETUP,
  GENDERS,
  HAIR_COLORS,
  HAIR_STYLES,
  HERITAGE_STYLES,
  STARTING_PROFILES,
  cloneSetup,
  getScorePreview,
  getStartingProfile,
} from "./model";

describe("Phase 1 shell model", () => {
  it("exposes exactly the three permanent score preview labels in canonical order", () => {
    expect(getScorePreview("steady-mix-v1")).toEqual([
      { id: "health", label: "Health", value: 65 },
      { id: "happiness", label: "Happiness", value: 60 },
      { id: "money", label: "Financial security", value: 35 },
    ]);
  });

  it("keeps every locked starting profile in the 0..100 score range", () => {
    expect(Object.isFrozen(STARTING_PROFILES)).toBe(true);
    expect(STARTING_PROFILES.map((profile) => profile.id)).toEqual([
      "steady-mix-v1",
      "physical-head-start-v1",
      "emotional-head-start-v1",
      "resource-head-start-v1",
    ]);
    for (const profile of STARTING_PROFILES) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.scores)).toBe(true);
      expect(Object.keys(profile.scores)).toEqual(["health", "happiness", "money"]);
      for (const value of Object.values(profile.scores)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("copies setup drafts without sharing nested appearance state", () => {
    expect(Object.isFrozen(DEFAULT_SETUP)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETUP.appearance)).toBe(true);
    const draft = cloneSetup(DEFAULT_SETUP);
    expect(draft).toEqual(DEFAULT_SETUP);
    expect(draft).not.toBe(DEFAULT_SETUP);
    expect(draft.appearance).not.toBe(DEFAULT_SETUP.appearance);
  });

  it("keeps female and male character sets separate and exposes every cosmetic selector", () => {
    expect(GENDERS.map(({ id }) => id)).toEqual(["female", "male"]);
    expect(CONTROL_MODES.map(({ id }) => id)).toEqual(["manual", "semantic-assist", "automatic-assist"]);
    expect(HERITAGE_STYLES).toHaveLength(4);
    expect(HAIR_STYLES).toHaveLength(4);
    expect(HAIR_COLORS).toHaveLength(4);
    expect(CLOTHING_PALETTES).toHaveLength(4);
  });

  it("describes every regional art family as identity-neutral and mechanics-neutral", () => {
    expect(HERITAGE_STYLES.map(({ label }) => label)).toEqual([
      "Art set A · East Asian-inspired",
      "Art set B · Euro-American-inspired",
      "Art set C · African-diaspora-inspired",
      "Art set D · West Asian-inspired",
    ]);
    for (const style of HERITAGE_STYLES) {
      expect(style.description).toMatch(/does not assert identity or nationality/i);
      expect(style.description).toMatch(/never affects mechanics/i);
    }
  });

  it("rejects profile identifiers outside the locked registry", () => {
    expect(() => getStartingProfile("missing-v1" as never)).toThrow("Unknown starting profile");
  });
});
