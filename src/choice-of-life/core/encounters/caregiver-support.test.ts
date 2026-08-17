import { describe, expect, it } from "vitest";

import {
  CAREGIVER_SUPPORT_THRESHOLDS,
  caregiverClosenessOutcomes,
  DEFAULT_ENCOUNTER_CATALOG,
  getEncounterDefinition,
} from "./catalog";

/**
 * The caregiver bond was mechanically inert: `educationSupportLevel` compared
 * closeness against 70 and 35 while the catalog's only caregiver deltas were +6
 * and +4, so every playthrough resolved to "none".
 *
 * These tests guard the fix *and* the shape of the fix. An earlier revision
 * mapped `strong` to 6, which made the three caregiver options a strict
 * education-access ladder and ranked one emotional choice above another. The
 * dominance and parity tests below exist to catch that class of mistake, not
 * just an unreachable threshold.
 */

/** Downstream bonus tables in core/education/runtime.ts, mirrored for assertions. */
const FUNDING_BONUS = { none: 0, some: 15, strong: 30 } as const;
const ACADEMIC_BONUS = { none: 0, some: 4, strong: 8 } as const;

type Tier = "none" | "some" | "strong";

function tierFor(closeness: number): Tier {
  if (closeness >= CAREGIVER_SUPPORT_THRESHOLDS.strong) return "strong";
  if (closeness >= CAREGIVER_SUPPORT_THRESHOLDS.some) return "some";
  return "none";
}

function caregiverOptions() {
  const definition = getEncounterDefinition(
    DEFAULT_ENCOUNTER_CATALOG,
    "caregiver-comfort-v1",
  );
  return definition.options.map((option) => {
    const closeness = (option.relationships ?? [])
      .filter((change) => change.kind === "caregiver")
      .reduce((total, change) => total + change.closenessDelta, 0);
    const scoreDelta = (scoreId: "health" | "happiness" | "money"): number =>
      (option.effects ?? [])
        .filter((effect) => effect.scoreId === scoreId)
        .reduce((total, effect) => total + effect.requestedDelta, 0);
    const tier = tierFor(closeness);
    return {
      optionId: option.optionId,
      closeness,
      tier,
      health: scoreDelta("health"),
      happiness: scoreDelta("happiness"),
      // Education eligibility compares money plus the support funding bonus, so
      // that sum is the axis a player actually feels.
      effectiveMoney: scoreDelta("money") + FUNDING_BONUS[tier],
      academic: ACADEMIC_BONUS[tier],
    };
  });
}

describe("caregiver support thresholds", () => {
  it("exposes the closeness totals a playthrough can actually reach", () => {
    expect(caregiverClosenessOutcomes()).toEqual([0, 4, 6]);
  });

  it("makes the caregiver bond matter at all", () => {
    // The original defect: every option resolved to "none".
    const tiers = caregiverOptions().map((option) => option.tier);
    expect(tiers).toContain("none");
    expect(tiers.filter((tier) => tier !== "none").length).toBeGreaterThan(0);
  });

  it("rewards either way of engaging with the caregiver equally", () => {
    // §8.3: caregiving routes are "viable lives rather than better/worse moral
    // ranks". Asking for comfort must not outrank playing together.
    const engaged = caregiverOptions().filter((option) => option.closeness > 0);
    expect(engaged.length).toBeGreaterThan(1);
    expect(new Set(engaged.map((option) => option.tier)).size).toBe(1);
  });

  it("keeps no caregiver option dominant on every axis", () => {
    // The axes a player weighs: health, happiness, money-for-education, and
    // academic readiness. A dominant option would make the choice fake.
    const options = caregiverOptions();
    for (const candidate of options) {
      const others = options.filter((option) => option !== candidate);
      const dominates = others.every((other) =>
        candidate.health >= other.health &&
        candidate.happiness >= other.happiness &&
        candidate.effectiveMoney >= other.effectiveMoney &&
        candidate.academic >= other.academic
      );
      expect(dominates, `${candidate.optionId} dominates every other option`)
        .toBe(false);
    }
  });

  it("does not punish the money-minded option hardest on money", () => {
    // The 6/4 mapping gave the routine option (+2 money) the *worst* effective
    // funding by 28 points, inverting the incentive it is written to express.
    const options = caregiverOptions();
    const spread = Math.max(...options.map((option) => option.effectiveMoney)) -
      Math.min(...options.map((option) => option.effectiveMoney));
    expect(spread).toBeLessThanOrEqual(FUNDING_BONUS.some);
  });

  it("documents 'strong' as awaiting more caregiver content", () => {
    // Not an accident. Reaching `strong` should take sustained closeness across
    // several encounters; this catalog has one. If new caregiver content makes
    // it reachable, update the comment on CAREGIVER_SUPPORT_THRESHOLDS.
    const highest = Math.max(...caregiverClosenessOutcomes());
    expect(CAREGIVER_SUPPORT_THRESHOLDS.strong).toBeGreaterThan(highest);
    expect(CAREGIVER_SUPPORT_THRESHOLDS.some).toBeLessThanOrEqual(highest);
    expect(CAREGIVER_SUPPORT_THRESHOLDS.some)
      .toBeLessThan(CAREGIVER_SUPPORT_THRESHOLDS.strong);
  });
});
