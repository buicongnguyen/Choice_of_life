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

export function createStagePlayerAvatar(
  document: Document,
  player: StagePlayerCharacter | undefined,
  lifeStage: CharacterLifeStage,
  className: string,
  options: Readonly<{ jobId?: CareerId; season?: CareerSeason }> = {},
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `${className} col-polish-actor col-polish-actor--character col-stage-player-avatar`;
  wrapper.dataset.playerAvatar = lifeStage;
  wrapper.setAttribute("aria-label", "Your character");
  wrapper.append(createCharacterElement(document, createCharacterModel({
    characterId: `stage-player-${lifeStage}`,
    label: "Your character",
    gender: player?.gender ?? "female",
    heritage: player?.heritage ?? "asian",
    lifeStage,
    direction: "right",
    motion: "idle",
    expression: "smile",
    seed: `choice-of-life-player-${lifeStage}`,
    appearance: player?.appearance,
    jobId: options.jobId,
    season: options.season,
  })));
  return wrapper;
}
