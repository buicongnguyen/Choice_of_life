// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  createStagePlayerAvatar,
  playerIdentitySeed,
  type StagePlayerCharacter,
} from "./stage-player-avatar";
import type { CharacterLifeStage } from "./character-system";

/** The life stages the app actually renders the player avatar for. */
const RENDERED_STAGES: readonly CharacterLifeStage[] = [
  "toddler",
  "child",
  "teen",
  "young-adult",
  "adult",
  "middle-age",
  "senior",
];

/** Exactly what `app.playerCharacterForStage()` supplies: no skin/face/detail. */
const PLAYER: StagePlayerCharacter = {
  gender: "female",
  heritage: "asian",
  appearance: {
    hairStyleId: "short-soft",
    hairColorId: "black",
    clothingPaletteId: "sunrise",
  },
};

function renderedIdentity(lifeStage: CharacterLifeStage): {
  signature: string;
  detailClass: string;
} {
  const wrapper = createStagePlayerAvatar(
    document,
    PLAYER,
    lifeStage,
    "test-avatar",
  );
  const figure = wrapper.querySelector<HTMLElement>("[data-appearance-signature]");
  if (figure === null) throw new Error("avatar rendered no character figure");
  const detail = wrapper.querySelector<HTMLElement>("[class*='col-character__detail--']");
  return {
    signature: figure.dataset.appearanceSignature ?? "",
    detailClass: detail?.className ?? "",
  };
}

describe("stage player avatar identity", () => {
  it("keeps one identity across every life stage it is rendered for", () => {
    // Setup only chooses hair style, hair colour and clothing, so skin tone,
    // face style and accessory are seed-derived. The seed previously contained
    // the life stage, which re-rolled all three on every chapter screen and made
    // the player look like a different person each stage.
    const identities = RENDERED_STAGES.map(renderedIdentity);
    const [first] = identities;
    expect(first).toBeDefined();
    for (const [index, identity] of identities.entries()) {
      expect(identity.signature, `${RENDERED_STAGES[index]} appearance signature`)
        .toBe(first!.signature);
      expect(identity.detailClass, `${RENDERED_STAGES[index]} accessory`)
        .toBe(first!.detailClass);
    }
  });

  it("still varies the identity between different player setups", () => {
    // Stability must not collapse every player onto one face.
    const seeds = new Set([
      playerIdentitySeed("female", "asian", PLAYER.appearance),
      playerIdentitySeed("male", "asian", PLAYER.appearance),
      playerIdentitySeed("female", "western", PLAYER.appearance),
      playerIdentitySeed("female", "asian", {
        ...PLAYER.appearance,
        hairColorId: "silver",
      }),
    ]);
    expect(seeds.size).toBe(4);
  });

  it("derives the identity seed without reference to the life stage", () => {
    const seed = playerIdentitySeed("female", "asian", PLAYER.appearance);
    for (const stage of RENDERED_STAGES) {
      expect(seed).not.toContain(stage);
    }
  });

  it("still reports the requested life stage on the wrapper and figure", () => {
    // The identity is stage-independent; the body and pose are not.
    for (const stage of RENDERED_STAGES) {
      const wrapper = createStagePlayerAvatar(document, PLAYER, stage, "test-avatar");
      expect(wrapper.dataset.playerAvatar).toBe(stage);
      const figure = wrapper.querySelector<HTMLElement>("[data-life-stage]");
      expect(figure?.dataset.lifeStage).toBe(stage);
    }
  });
});
