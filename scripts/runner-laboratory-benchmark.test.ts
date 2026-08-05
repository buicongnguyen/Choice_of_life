import { describe, expect, it } from "vitest";

import { projectFullPopulationMilliseconds } from "./runner-laboratory-benchmark";

describe("runner laboratory phase benchmark", () => {
  it("conservatively projects the representative two-worker shard phase", () => {
    expect(projectFullPopulationMilliseconds(12_000, 24)).toBe(5_000_000);
  });

  it("rejects invalid projection inputs", () => {
    expect(() => projectFullPopulationMilliseconds(-1, 24)).toThrow(/projection inputs/);
    expect(() => projectFullPopulationMilliseconds(1, 0)).toThrow(/projection inputs/);
  });
});
