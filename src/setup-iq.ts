import {
  IQ_START,
  ageMaturity,
  clampIq,
} from "./stats";

export interface StartingIqPlan {
  currentIq: number;
  iqCeiling: number;
  customized: boolean;
}

/**
 * Empty/invalid setup values mean "automatic". Numeric values are kept inside
 * the same 40–160 range used by the live IQ meter.
 */
export function normalizeStartingIq(
  value: string | number | null | undefined
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.round(clampIq(parsed))
    : null;
}

/**
 * Normal lives keep the newborn IQ of 60. When a player starts in a later
 * chapter, automatic mode gives them the age-appropriate expression of their
 * rolled lifelong potential instead of incorrectly leaving them at newborn IQ.
 *
 * A custom score is an explicit sandbox/testing choice, so it becomes both the
 * current IQ and the lifelong target. That prevents a deliberately high test
 * score from immediately drifting back toward a random lower ceiling.
 */
export function startingIqPlan(
  ageStart: number,
  rolledCeiling: number,
  override: number | null
): StartingIqPlan {
  const custom = normalizeStartingIq(override);
  if (custom !== null) {
    return {
      currentIq: custom,
      iqCeiling: custom,
      customized: true,
    };
  }

  const iqCeiling = Math.round(clampIq(rolledCeiling));
  return {
    currentIq:
      ageStart <= 0
        ? IQ_START
        : Math.round(
            clampIq(iqCeiling * ageMaturity(ageStart))
          ),
    iqCeiling,
    customized: false,
  };
}
