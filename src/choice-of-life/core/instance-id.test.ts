import { describe, expect, it } from "vitest";

import { deriveEntityInstanceIdV1, type EntityInstanceCoordinates } from "./instance-id";

const coordinates: EntityInstanceCoordinates = {
  runSeed: "000000000000002a",
  stageId: "runner-lab-v1",
  patternIndex: 7,
  slotIndex: 0,
  contentId: "runner-contract-hazard-v1",
};

describe("deterministic entity instance IDs", () => {
  it("pins the versioned known-answer vector and grammar", () => {
    expect(deriveEntityInstanceIdV1(coordinates)).toBe("entity-37e369c950b38e79");
    expect(deriveEntityInstanceIdV1(coordinates)).toMatch(/^entity-[0-9a-f]{16}$/);
  });

  it("is sensitive to every saved coordinate and independent of call order", () => {
    const baseline = deriveEntityInstanceIdV1(coordinates);
    const variants: readonly EntityInstanceCoordinates[] = [
      { ...coordinates, runSeed: "000000000000002b" },
      { ...coordinates, stageId: "newborn-v1" },
      { ...coordinates, patternIndex: 8 },
      { ...coordinates, slotIndex: 1 },
      { ...coordinates, contentId: "runner-contract-benefit-v1" },
    ];
    expect(new Set(variants.map(deriveEntityInstanceIdV1)).size).toBe(variants.length);
    expect(variants.map(deriveEntityInstanceIdV1)).not.toContain(baseline);
    expect(deriveEntityInstanceIdV1(coordinates)).toBe(baseline);
  });

  it("rejects malformed or unbounded coordinates", () => {
    expect(() => deriveEntityInstanceIdV1({ ...coordinates, runSeed: "2a" })).toThrow();
    expect(() => deriveEntityInstanceIdV1({ ...coordinates, patternIndex: -1 })).toThrow();
    expect(() => deriveEntityInstanceIdV1({ ...coordinates, slotIndex: 64 })).toThrow();
    expect(() => deriveEntityInstanceIdV1({ ...coordinates, contentId: "legacy" })).toThrow();
  });
});
