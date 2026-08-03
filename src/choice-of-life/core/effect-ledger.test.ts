import { describe, expect, it } from "vitest";

import {
  applyEffect,
  createEmptyEffectLedger,
  RECENT_EFFECT_LIMIT,
  type EffectRequest,
} from "./effect-ledger";
import { createCoreScores } from "./score-model";

function request(
  overrides: Partial<EffectRequest> = {},
): EffectRequest {
  return {
    effectId: "effect-test-1",
    scoreId: "health",
    requestedDelta: 10,
    source: "runner",
    categoryId: "runner-benefit-v1",
    causedByChoiceId: null,
    transactionId: null,
    simulationTick: 1,
    ...overrides,
  };
}

describe("effect ledger", () => {
  it("immutably applies an effect, clamps it, and stores actual magnitude", () => {
    const scores = createCoreScores({
      health: 96,
      happiness: 50,
      money: 50,
    });
    const ledger = createEmptyEffectLedger();
    const result = applyEffect(scores, ledger, request());

    expect(result.scores.health).toBe(100);
    expect(result.effect).toMatchObject({
      before: 96,
      after: 100,
      requestedDelta: 10,
      actualDelta: 4,
    });
    expect(result.ledger.totalsBySource.runner.healthPositive).toBe(4);
    expect(scores.health).toBe(96);
    expect(ledger.recent).toHaveLength(0);
    expect(Object.isFrozen(result.effect)).toBe(true);
    expect(Object.isFrozen(result.ledger.recent)).toBe(true);
  });

  it("records harmful effects as positive negative-magnitude totals", () => {
    const result = applyEffect(
      createCoreScores({ health: 3, happiness: 50, money: 50 }),
      createEmptyEffectLedger(),
      request({ requestedDelta: -10 }),
    );
    expect(result.effect.actualDelta).toBe(-3);
    expect(result.ledger.totalsBySource.runner.healthNegative).toBe(3);
  });

  it("requires attribution for choice effects", () => {
    expect(() =>
      applyEffect(
        createCoreScores({ health: 50, happiness: 50, money: 50 }),
        createEmptyEffectLedger(),
        request({ source: "choice", causedByChoiceId: null }),
      ),
    ).toThrow("require a choice cause");
  });

  it.each(["runner", "system", "recovery"] as const)(
    "rejects choice attribution on %s effects",
    (source) => {
      expect(() =>
        applyEffect(
          createCoreScores({ health: 50, happiness: 50, money: 50 }),
          createEmptyEffectLedger(),
          request({
            source,
            causedByChoiceId: "choice-test-v1",
          }),
        ),
      ).toThrow("cannot have a choice cause");
    },
  );

  it.each(["callback", "settlement"] as const)(
    "reclassifies an unattributed %s effect as system",
    (source) => {
      const result = applyEffect(
        createCoreScores({ health: 50, happiness: 50, money: 50 }),
        createEmptyEffectLedger(),
        request({ source, causedByChoiceId: null }),
      );
      expect(result.effect.source).toBe("system");
      expect(result.ledger.totalsBySource.system.healthPositive).toBe(10);
      expect(result.ledger.totalsBySource[source].healthPositive).toBe(0);
    },
  );

  it("retains attributed callback and settlement sources", () => {
    const scores = createCoreScores({ health: 50, happiness: 50, money: 50 });
    const callback = applyEffect(
      scores,
      createEmptyEffectLedger(),
      request({
        source: "callback",
        causedByChoiceId: "choice-test-v1",
      }),
    );
    expect(callback.effect.source).toBe("callback");
    expect(callback.ledger.totalsBySource.callback.healthPositive).toBe(10);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -101, 101])(
    "rejects invalid requested delta %s",
    (requestedDelta) => {
      expect(() =>
        applyEffect(
          createCoreScores({ health: 50, happiness: 50, money: 50 }),
          createEmptyEffectLedger(),
          request({ requestedDelta }),
        ),
      ).toThrow();
    },
  );

  it("keeps only the 128 most recent entries while preserving totals", () => {
    let scores = createCoreScores({ health: 50, happiness: 50, money: 50 });
    let ledger = createEmptyEffectLedger();

    for (let index = 0; index < RECENT_EFFECT_LIMIT + 1; index += 1) {
      const result = applyEffect(
        scores,
        ledger,
        request({
          effectId: `effect-test-${index + 1}`,
          requestedDelta: index % 2 === 0 ? 1 : -1,
          simulationTick: index,
        }),
      );
      scores = result.scores;
      ledger = result.ledger;
    }

    expect(ledger.recent).toHaveLength(RECENT_EFFECT_LIMIT);
    expect(ledger.recent[0]?.effectId).toBe("effect-test-2");
    expect(ledger.totalsBySource.runner.healthPositive).toBe(65);
    expect(ledger.totalsBySource.runner.healthNegative).toBe(64);
  });

  it("rejects a duplicate effect ID still present in the bounded ledger", () => {
    const first = applyEffect(
      createCoreScores({ health: 50, happiness: 50, money: 50 }),
      createEmptyEffectLedger(),
      request(),
    );
    expect(() => applyEffect(first.scores, first.ledger, request())).toThrow(
      "duplicate",
    );
  });

  it("rejects effects that move backward in application time or break a retained score chain", () => {
    const first = applyEffect(
      createCoreScores({ health: 50, happiness: 50, money: 50 }),
      createEmptyEffectLedger(),
      request({ simulationTick: 10 }),
    );
    expect(() => applyEffect(first.scores, first.ledger, request({
      effectId: "effect-earlier",
      simulationTick: 9,
    }))).toThrow(/precedes retained application history/);
    expect(() => applyEffect({ ...first.scores, health: 80 }, first.ledger, request({
      effectId: "effect-broken-chain",
      simulationTick: 11,
    }))).toThrow(/continue retained effect history/);
  });
});
