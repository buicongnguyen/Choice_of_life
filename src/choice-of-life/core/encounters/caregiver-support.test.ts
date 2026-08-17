import { describe, expect, it } from "vitest";

import {
  CAREGIVER_SUPPORT_THRESHOLDS,
  caregiverClosenessOutcomes,
} from "./catalog";

/**
 * The caregiver bond was mechanically inert: `educationSupportLevel` compared
 * closeness against 70 and 35 while the catalog's only caregiver deltas were 6
 * and 4, so every playthrough resolved to "none" and two of the three support
 * tiers were unreachable. These tests fail if the thresholds and the catalog
 * ever drift apart again.
 */
describe("caregiver support thresholds", () => {
  it("exposes the closeness totals a playthrough can actually reach", () => {
    // The three options of caregiver-comfort-v1: routine (0), play (+4), comfort (+6).
    expect(caregiverClosenessOutcomes()).toEqual([0, 4, 6]);
  });

  it("keeps every support tier reachable from the catalog", () => {
    const outcomes = caregiverClosenessOutcomes();
    const highest = Math.max(...outcomes);

    expect(
      CAREGIVER_SUPPORT_THRESHOLDS.strong,
      "no caregiver choice can reach the 'strong' threshold",
    ).toBeLessThanOrEqual(highest);
    expect(
      CAREGIVER_SUPPORT_THRESHOLDS.some,
      "no caregiver choice can reach the 'some' threshold",
    ).toBeLessThanOrEqual(highest);
    expect(CAREGIVER_SUPPORT_THRESHOLDS.some)
      .toBeLessThan(CAREGIVER_SUPPORT_THRESHOLDS.strong);

    // Every tier must be the outcome of at least one real choice, and every
    // choice must land on some tier — otherwise a player-visible decision has no
    // downstream meaning.
    const tierFor = (closeness: number): "strong" | "some" | "none" =>
      closeness >= CAREGIVER_SUPPORT_THRESHOLDS.strong
        ? "strong"
        : closeness >= CAREGIVER_SUPPORT_THRESHOLDS.some
        ? "some"
        : "none";
    expect(new Set(outcomes.map(tierFor))).toEqual(
      new Set(["none", "some", "strong"]),
    );
  });

  it("gives each caregiver option a distinct downstream tier", () => {
    const outcomes = caregiverClosenessOutcomes();
    const tiers = outcomes.map((closeness) =>
      closeness >= CAREGIVER_SUPPORT_THRESHOLDS.strong
        ? "strong"
        : closeness >= CAREGIVER_SUPPORT_THRESHOLDS.some
        ? "some"
        : "none"
    );
    expect(new Set(tiers).size).toBe(outcomes.length);
  });
});
