import type { CareerId, CareerSeason } from "../core/career";
import {
  createCharacterElement,
  createCharacterModel,
  type CharacterAppearanceOverrides,
  type CharacterGender,
  type CharacterHeritage,
  type CharacterLifeStage,
} from "./character-system";

export interface StagePlayerCharacter {
  readonly gender: CharacterGender;
  readonly heritage: CharacterHeritage;
  readonly appearance?: CharacterAppearanceOverrides;
}

/**
 * Stable per-life identity seed. Deliberately excludes the life stage so the
 * player keeps one face, skin tone and accessory from Newborn to Legacy.
 */
export function playerIdentitySeed(
  gender: CharacterGender,
  heritage: CharacterHeritage,
  appearance: CharacterAppearanceOverrides | undefined,
): string {
  return [
    "choice-of-life-player",
    gender,
    heritage,
    appearance?.skinToneId ?? "skin-derived",
    appearance?.hairStyleId ?? "hair-derived",
    appearance?.hairColorId ?? "hair-color-derived",
    appearance?.faceStyleId ?? "face-derived",
    appearance?.clothingPaletteId ?? "clothes-derived",
    appearance?.detailId ?? "detail-derived",
  ].join("-");
}

export function createStagePlayerAvatar(
  document: Document,
  player: StagePlayerCharacter | undefined,
  lifeStage: CharacterLifeStage,
  className: string,
  options: Readonly<{ jobId?: CareerId; season?: CareerSeason }> = {},
): HTMLElement {
  const gender = player?.gender ?? "female";
  const heritage = player?.heritage ?? "asian";
  const appearance = player?.appearance;
  const wrapper = document.createElement("div");
  wrapper.className = `${className} col-polish-actor col-polish-actor--character col-stage-player-avatar`;
  wrapper.dataset.playerAvatar = lifeStage;
  wrapper.setAttribute("aria-label", "Your character");
  wrapper.append(createCharacterElement(document, createCharacterModel({
    characterId: `stage-player-${lifeStage}`,
    label: "Your character",
    gender,
    heritage,
    lifeStage,
    direction: "right",
    motion: "idle",
    expression: "smile",
    // The identity seed must not contain the life stage. createCharacterModel
    // derives skinToneId, faceStyleId and detailId from the seed whenever
    // `appearance` omits them, and setup only chooses hair style, hair colour
    // and clothing — so a stage-varying seed re-rolled the player's skin tone,
    // face and accessory on every chapter screen. Deriving it from the chosen
    // identity keeps one person across the whole life while still giving
    // different setups different faces.
    seed: playerIdentitySeed(gender, heritage, appearance),
    appearance,
    jobId: options.jobId,
    season: options.season,
  })));
  return wrapper;
}
