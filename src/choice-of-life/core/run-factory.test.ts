import { describe, expect, it } from "vitest";

import { PHASE_1_CATALOG } from "./catalog";
import { createInitialRunState, deriveRunIdV1, type InitialRunSetup } from "./run-factory";
import { validateRunState } from "./run-state-codec";
import { stateHashV1 } from "./run-state-hash";

const setup: InitialRunSetup = {
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  controlMode: "manual",
  identity: { gender: "female" },
  appearance: {
    heritageStyleId: "asian",
    hairStyleId: "short-soft",
    hairColorId: "black",
    clothingPaletteId: "sunrise",
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    textScale: 100,
    screenReaderAnnouncements: true,
  },
};

describe("initial run factory", () => {
  it("creates a codec-valid shell state with a deterministic run ID and hash", () => {
    const first = createInitialRunState("000000000000002a", setup);
    const second = createInitialRunState("000000000000002a", setup);
    expect(first).toEqual(second);
    expect(first.runId).toMatch(/^run-[0-9a-f]{16}$/);
    expect(stateHashV1(first)).toBe(stateHashV1(second));
    expect(validateRunState(first, PHASE_1_CATALOG)).toEqual({ ok: true, state: first });
  });

  it("pins the v1 run-ID vector used by the immutable maximal fixture", () => {
    expect(deriveRunIdV1("000000000000002a", {
      startingProfileId: "steady-mix-v1",
      difficulty: "normal",
      controlMode: "semantic-assist",
      identity: { gender: "female" },
    })).toBe("run-971e8b4c204ab517");
  });

  it("maps every starting profile to only the three locked scores", () => {
    for (const startingProfileId of [
      "steady-mix-v1",
      "physical-head-start-v1",
      "emotional-head-start-v1",
      "resource-head-start-v1",
    ] as const) {
      const state = createInitialRunState("0000000000000001", { ...setup, startingProfileId });
      expect(Object.keys(state.scores)).toEqual(["health", "happiness", "money"]);
      expect(validateRunState(state, PHASE_1_CATALOG).ok).toBe(true);
    }
  });

  it("rejects every noncanonical seed form", () => {
    for (const seed of ["1", "000000000000000A", "000000000000000g", "00000000000000000"]) {
      expect(() => createInitialRunState(seed, setup)).toThrow(/16 lowercase hexadecimal/);
    }
  });

  it("rejects forged setup values before an invalid state can enter memory", () => {
    expect(() => createInitialRunState("0000000000000001", {
      ...setup,
      startingProfileId: "unknown-profile-v1",
    } as unknown as InitialRunSetup)).toThrow(/profile/);
    expect(() => createInitialRunState("0000000000000001", {
      ...setup,
      appearance: { ...setup.appearance, hairStyleId: "legacy-hair" },
    } as unknown as InitialRunSetup)).toThrow(/hair style/);
  });

  it("keeps accessibility settings outside run identity while persisting them", () => {
    const first = createInitialRunState("0000000000000001", setup);
    const accessible = createInitialRunState("0000000000000001", {
      ...setup,
      accessibility: { ...setup.accessibility, highContrast: true, textScale: 200 },
    });
    expect(accessible.runId).toBe(first.runId);
    expect(accessible.accessibility).toMatchObject({ highContrast: true, textScale: 200 });
  });

  it("keeps excluded cosmetic appearance outside run identity and gameplay hash", () => {
    const first = createInitialRunState("0000000000000001", setup);
    const cosmetic = createInitialRunState("0000000000000001", {
      ...setup,
      appearance: {
        heritageStyleId: "western",
        hairStyleId: "wavy-bob",
        hairColorId: "silver",
        clothingPaletteId: "berry",
      },
    });
    expect(cosmetic.runId).toBe(first.runId);
    expect(stateHashV1(cosmetic)).toBe(stateHashV1(first));
  });
});
