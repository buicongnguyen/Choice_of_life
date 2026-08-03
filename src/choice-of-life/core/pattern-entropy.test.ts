import { describe, expect, it } from "vitest";

import {
  createPatternEntropy,
  PATTERN_ENTROPY_VERSION,
  type PatternKey,
} from "./pattern-entropy";

const KNOWN_VECTORS: readonly {
  readonly key: PatternKey;
  readonly lane: number;
  readonly content: number;
  readonly ranged: number;
  readonly weighted: number;
}[] = [
  {
    key: {
      runSeed: "0000000000000000",
      stageId: "newborn-v1",
      patternIndex: 0,
    },
    lane: 3_351_755_706,
    content: 2_846_857_740,
    ranged: 5,
    weighted: 2,
  },
  {
    key: {
      runSeed: "000000000000002a",
      stageId: "runner-lab-v1",
      patternIndex: 7,
    },
    lane: 558_926_260,
    content: 1_403_148_842,
    ranged: -2,
    weighted: 2,
  },
  {
    key: {
      runSeed: "ffffffffffffffff",
      stageId: "elder-v2",
      patternIndex: Number.MAX_SAFE_INTEGER,
    },
    lane: 1_111_737_770,
    content: 1_022_030_233,
    ranged: -1,
    weighted: 1,
  },
];

describe("pattern entropy", () => {
  it("pins the versioned integer-only known-answer vectors", () => {
    expect(PATTERN_ENTROPY_VERSION).toBe("pattern-entropy-fnv1a32-v1");
    for (const vector of KNOWN_VECTORS) {
      const entropy = createPatternEntropy(vector.key);
      expect(entropy.uint32("lane")).toBe(vector.lane);
      expect(entropy.uint32("content")).toBe(vector.content);
      expect(entropy.integer("lane", -3, 8)).toBe(vector.ranged);
      expect(entropy.weightedIndex("content", [0, 2, 5, 1])).toBe(
        vector.weighted,
      );
    }
  });

  it("is stateless and independent of channel call order", () => {
    const key: PatternKey = {
      runSeed: "000000000000002a",
      stageId: "runner-lab-v1",
      patternIndex: 7,
    };
    const first = createPatternEntropy(key);
    const laneBefore = first.uint32("lane");
    const content = first.uint32("content");
    const laneAfter = first.uint32("lane");

    const second = createPatternEntropy(key);
    expect(second.uint32("content")).toBe(content);
    expect(second.uint32("lane")).toBe(laneBefore);
    expect(laneAfter).toBe(laneBefore);
  });

  it("copies its key so caller mutation cannot change later outputs", () => {
    const key = {
      runSeed: "000000000000002a",
      stageId: "runner-lab-v1",
      patternIndex: 7,
    };
    const entropy = createPatternEntropy(key);
    const expected = entropy.uint32("lane");
    key.runSeed = "000000000000002b";
    key.stageId = "newborn-v1";
    key.patternIndex = 8;
    expect(entropy.uint32("lane")).toBe(expected);
  });

  it("separates seed, stage, pattern, and named channel coordinates", () => {
    const base = createPatternEntropy({
      runSeed: "0000000000000001",
      stageId: "newborn-v1",
      patternIndex: 1,
    }).uint32("lane");
    const variants = [
      createPatternEntropy({
        runSeed: "0000000000000002",
        stageId: "newborn-v1",
        patternIndex: 1,
      }).uint32("lane"),
      createPatternEntropy({
        runSeed: "0000000000000001",
        stageId: "child-v1",
        patternIndex: 1,
      }).uint32("lane"),
      createPatternEntropy({
        runSeed: "0000000000000001",
        stageId: "newborn-v1",
        patternIndex: 2,
      }).uint32("lane"),
      createPatternEntropy({
        runSeed: "0000000000000001",
        stageId: "newborn-v1",
        patternIndex: 1,
      }).uint32("content"),
    ];
    expect(new Set([base, ...variants]).size).toBe(5);
  });

  it("keeps bounded integers inside a half-open range", () => {
    for (let index = 0; index < 100; index += 1) {
      const value = createPatternEntropy({
        runSeed: index.toString(16).padStart(16, "0"),
        stageId: "newborn-v1",
        patternIndex: index,
      }).integer("lane", -11, 13);
      expect(value).toBeGreaterThanOrEqual(-11);
      expect(value).toBeLessThan(13);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never selects zero-weight entries", () => {
    for (let index = 0; index < 100; index += 1) {
      const selected = createPatternEntropy({
        runSeed: index.toString(16).padStart(16, "0"),
        stageId: "newborn-v1",
        patternIndex: index,
      }).weightedIndex("content", [0, 3, 0]);
      expect(selected).toBe(1);
    }
  });

  it.each([
    "0",
    "000000000000000A",
    "00000000000000000",
    "gggggggggggggggg",
  ])("rejects invalid run seed %s", (runSeed) => {
    expect(() =>
      createPatternEntropy({
        runSeed,
        stageId: "newborn-v1",
        patternIndex: 0,
      }),
    ).toThrow("16 lowercase hexadecimal");
  });

  it("rejects invalid indexes, channels, ranges, and weights", () => {
    expect(() =>
      createPatternEntropy({
        runSeed: "0000000000000000",
        stageId: "newborn-v1",
        patternIndex: -1,
      }),
    ).toThrow("pattern index");

    const entropy = createPatternEntropy({
      runSeed: "0000000000000000",
      stageId: "newborn-v1",
      patternIndex: 0,
    });
    expect(() => entropy.uint32("not valid")).toThrow("channel");
    expect(() => entropy.integer("lane", 2, 2)).toThrow("greater");
    expect(() => entropy.integer("lane", 0.5, 2)).toThrow("safe integers");
    expect(() => entropy.weightedIndex("lane", [])).toThrow("empty");
    expect(() => entropy.weightedIndex("lane", [0, 0])).toThrow("positive");
    expect(() => entropy.weightedIndex("lane", [1, -1])).toThrow(
      "non-negative",
    );
  });
});
