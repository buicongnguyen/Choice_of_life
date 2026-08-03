import { describe, expect, it } from "vitest";

import { STARTING_PROFILE_SCORES } from "./run-state";

describe("locked starting-profile runtime immutability", () => {
  it("deep-freezes the registry and every nested score record", () => {
    expect(Object.isFrozen(STARTING_PROFILE_SCORES)).toBe(true);
    for (const scores of Object.values(STARTING_PROFILE_SCORES)) {
      expect(Object.isFrozen(scores)).toBe(true);
    }
    const before = STARTING_PROFILE_SCORES["steady-mix-v1"].health;
    expect(() => {
      (STARTING_PROFILE_SCORES["steady-mix-v1"] as { health: number }).health = 1;
    }).toThrow(TypeError);
    expect(STARTING_PROFILE_SCORES["steady-mix-v1"].health).toBe(before);
  });
});
