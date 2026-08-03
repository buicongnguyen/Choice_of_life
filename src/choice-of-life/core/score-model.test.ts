import { describe, expect, it } from "vitest";

import {
  applyScoreDelta,
  createCoreScores,
  SCORE_IDS,
  type CoreScores,
} from "./score-model";

describe("three-score model", () => {
  it("has exactly the locked serialized score keys", () => {
    const scores = createCoreScores({
      health: 60,
      happiness: 55,
      money: 40,
    });
    expect(SCORE_IDS).toEqual(["health", "happiness", "money"]);
    expect(Object.keys(scores)).toEqual(["health", "happiness", "money"]);
    expect(Object.isFrozen(scores)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 101])(
    "rejects invalid score value %s",
    (health) => {
      expect(() =>
        createCoreScores({ health, happiness: 50, money: 50 }),
      ).toThrow();
    },
  );

  it("rejects runtime score objects with additional keys", () => {
    const scores = {
      health: 50,
      happiness: 50,
      money: 50,
      iq: 100,
    } as CoreScores;
    expect(() => createCoreScores(scores)).toThrow("exactly");
  });

  it("applies helpful and harmful deltas without mutating the input", () => {
    const scores = createCoreScores({
      health: 50,
      happiness: 50,
      money: 50,
    });
    const helpful = applyScoreDelta(scores, "health", 12);
    const harmful = applyScoreDelta(scores, "money", -9);

    expect(helpful).toMatchObject({ before: 50, after: 62, actualDelta: 12 });
    expect(harmful).toMatchObject({ before: 50, after: 41, actualDelta: -9 });
    expect(scores).toEqual({ health: 50, happiness: 50, money: 50 });
    expect(Object.isFrozen(helpful)).toBe(true);
    expect(Object.isFrozen(helpful.scores)).toBe(true);
  });

  it("clamps only at score boundaries and reports the actual delta", () => {
    const scores = createCoreScores({
      health: 96,
      happiness: 3,
      money: 50,
    });
    expect(applyScoreDelta(scores, "health", 10)).toMatchObject({
      before: 96,
      after: 100,
      actualDelta: 4,
    });
    expect(applyScoreDelta(scores, "happiness", -10)).toMatchObject({
      before: 3,
      after: 0,
      actualDelta: -3,
    });
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, 0.25])(
    "rejects invalid delta %s",
    (delta) => {
      const scores = createCoreScores({
        health: 50,
        happiness: 50,
        money: 50,
      });
      expect(() => applyScoreDelta(scores, "health", delta)).toThrow(
        "finite integer",
      );
    },
  );
});
