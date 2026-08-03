import { describe, expect, it } from "vitest";

import lockedRegistry from "../../../docs/balance/fixture-registry-v1.json";
import { STARTING_PROFILE_SCORES } from "../core/run-state";
import { DEFAULT_SETUP, STARTING_PROFILES } from "./model";

describe("locked starting-profile conformance", () => {
  it("keeps registry, core save state, and setup preview scores identical", () => {
    const lockedScores = Object.fromEntries(
      lockedRegistry.startingProfiles.map((profile) => [profile.id, profile.scores]),
    );
    expect(STARTING_PROFILE_SCORES).toEqual(lockedScores);
    expect(STARTING_PROFILES).toEqual(lockedRegistry.startingProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
      scores: profile.scores,
    })));
    expect(DEFAULT_SETUP.startingProfileId).toBe(lockedRegistry.defaultStartingProfileId);
  });
});
