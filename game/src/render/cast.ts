import * as THREE from "three";

import { careerFor, has } from "../game/life";
import type { AgeKey, PersonId } from "../game/story/model";
import type { HairStyle, LifeState } from "../game/types";

export interface CharacterSpec {
  body: string;
  hair?: HairStyle | "balding";
  colours: Partial<Record<"Skin" | "Hair" | "Top" | "Bottom" | "Shoes" | "Accent", string>>;
  accessories?: string[];
  /** Uniform scale (children of the same age look alike otherwise). */
  scale?: number;
}

export const SKIN_TONES = ["#fcd5bd", "#f0b48a", "#d99560", "#b8743f", "#8a522c", "#5e3620"];
export const HAIR_COLOURS = ["#1c1515", "#4a2c1d", "#8a3a1c", "#c46a2c", "#e0b050", "#6b3fa0"];
export const FAVOURITE_COLOURS = ["#ff6b4a", "#12a5b8", "#ffb627", "#e8416f", "#5cc639", "#6b3fa0", "#3a6fc4", "#ff8a1f"];
export const HAIR_STYLES: HairStyle[] = ["short", "spiky", "buzz", "bob", "long", "ponytail", "pigtails", "bun", "curly"];

const GREY = new THREE.Color("#dcd8e2");

export function greyed(hex: string, amount: number): string {
  return "#" + new THREE.Color(hex).lerp(GREY, Math.max(0, Math.min(1, amount))).getHexString();
}

function shade(hex: string, lighten: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + lighten)));
  return "#" + c.getHexString();
}

/** Nearby skin tone: family members resemble the player without being identical. */
function relative(skin: string, step: number): string {
  const i = SKIN_TONES.indexOf(skin);
  if (i < 0) return shade(skin, -0.04 * step);
  return SKIN_TONES[Math.max(0, Math.min(SKIN_TONES.length - 1, i + step))];
}

/** The protagonist at a given age, in clothes that follow their life. */
export function playerSpec(s: LifeState, age: AgeKey, chapter: number): CharacterSpec {
  const { skin, hair, hairStyle, colour } = s.look;
  const grey = chapter >= 8 || chapter === 0 ? 0.92 : chapter === 7 ? (age === "elder" ? 0.85 : 0.55) : chapter === 6 ? 0.28 : 0;
  const colours = { Skin: skin, Hair: greyed(hair, grey), Top: colour };
  switch (age) {
    case "baby":
      return { body: "body_baby", colours: { ...colours, Accent: shade(colour, 0.18), Bottom: colour } };
    case "toddler":
      return { body: "body_toddler_overalls", hair: hairStyle, colours: { ...colours, Top: "#ffd84a", Bottom: colour, Shoes: "#ff6b4a" } };
    case "child":
      return { body: "body_child_tee", hair: hairStyle, colours: { ...colours, Bottom: "#23407a", Accent: "#ffd84a", Shoes: "#fffaf0" }, accessories: ["backpack"] };
    case "teen":
      return { body: "body_teen_hoodie", hair: hairStyle, colours: { ...colours, Bottom: "#3a6fc4", Accent: shade(colour, 0.2), Shoes: "#fffaf0" } };
    case "elder":
      return { body: "body_elder_cardigan", hair: hairStyle === "buzz" || hairStyle === "spiky" ? "short" : hairStyle, colours: { ...colours, Bottom: "#34323f", Accent: "#fff1d6", Shoes: "#7a4221" }, accessories: chapter >= 8 ? ["cane"] : [] };
    case "adult":
    default: {
      const career = careerFor(s);
      const storm = chapter === 6 ? ["umbrella"] : [];
      if (chapter <= 4 && !s.path) return { body: "body_adult_sweater", hair: hairStyle, colours: { ...colours, Bottom: "#34323f" } };
      if (career === "doctor" && chapter >= 5) return { body: "body_adult_scrubs", hair: hairStyle, colours: { ...colours, Bottom: colour, Accent: "#fffaf0", Shoes: "#fffaf0" }, accessories: ["stethoscope", ...storm] };
      if (career === "shipwright" || career === "boatwright") return { body: "body_adult_overalls", hair: hairStyle, colours: { ...colours, Top: shade(colour, 0.15), Bottom: "#23407a", Shoes: "#7a4221" }, accessories: storm };
      if (career === "journalist" || career === "marine biologist") return { body: "body_adult_jacket", hair: hairStyle, colours: { ...colours, Top: "#fffaf0", Accent: colour, Bottom: "#34323f", Shoes: "#7a4221" }, accessories: [...(chapter === 4 ? ["satchel"] : []), ...storm] };
      return { body: "body_adult_sweater", hair: hairStyle, colours: { ...colours, Bottom: "#34323f", Shoes: "#ff6b4a" }, accessories: [...(chapter === 4 ? ["satchel"] : []), ...storm] };
    }
  }
}

/** Everyone else, looking their age in the chapter they appear in. */
export function personSpec(id: PersonId, s: LifeState, chapter: number): CharacterSpec {
  const skin = s.look.skin;
  const hair = s.look.hair;
  const elderly = chapter >= 6;
  switch (id) {
    case "you":
      return playerSpec(s, chapter >= 7 ? "elder" : "adult", chapter);
    case "mom":
      if (elderly) return { body: "body_elder_dress", hair: "bun", colours: { Skin: skin, Hair: greyed(hair, 0.9), Top: "#e8416f", Accent: "#ffd84a", Shoes: "#7a4221" }, accessories: ["glasses"] };
      if (chapter <= 1) return { body: "body_adult_scrubs", hair: "bun", colours: { Skin: skin, Hair: hair, Top: "#12a5b8", Bottom: "#12a5b8", Accent: "#fffaf0", Shoes: "#fffaf0" } };
      return { body: "body_adult_dress", hair: "bun", colours: { Skin: skin, Hair: greyed(hair, chapter >= 4 ? 0.35 : 0), Top: "#e8416f", Accent: "#ffd84a", Shoes: "#ff6b4a" } };
    case "dad": {
      const dadSkin = relative(skin, 1);
      const dadHair = chapter >= 4 ? greyed("#5a3a26", chapter >= 6 ? 0.9 : 0.4) : "#5a3a26";
      if (elderly) return { body: "body_elder_cardigan", hair: "balding", colours: { Skin: dadSkin, Hair: dadHair, Top: "#ff8a1f", Bottom: "#23407a", Accent: "#fff1d6", Shoes: "#7a4221" }, accessories: ["beard", "glasses"] };
      return { body: "body_adult_overalls", hair: "buzz", colours: { Skin: dadSkin, Hair: dadHair, Top: "#ff6b4a", Bottom: "#23407a", Shoes: "#7a4221" }, accessories: ["beard", "cap"] };
    }
    case "nana":
      return { body: "body_elder_cardigan", hair: "bun", colours: { Skin: relative(skin, -1), Hair: "#ece8f2", Top: "#1f6fb2", Bottom: "#6b3fa0", Accent: "#fff1d6", Shoes: "#7a4221" }, accessories: ["glasses"] };
    case "juno": {
      const c = { Skin: "#e8b98f", Hair: "#1c1515" };
      if (chapter <= 2) return { body: "body_child_dress", hair: "pigtails", colours: { ...c, Top: "#e8416f", Accent: "#ffd84a", Shoes: "#fffaf0" } };
      if (chapter === 3) return { body: "body_teen_hoodie", hair: "ponytail", colours: { ...c, Top: "#ffb627", Bottom: "#23407a", Accent: "#ff6b4a", Shoes: "#fffaf0" } };
      if (chapter >= 7) return { body: "body_elder_dress", hair: "bun", colours: { ...c, Hair: greyed("#1c1515", 0.85), Top: "#12a5b8", Accent: "#ffd84a", Shoes: "#ff6b4a" }, accessories: ["glasses"] };
      if (chapter === 5) return { body: "body_adult_dress", hair: "long", colours: { ...c, Top: "#fffaf0", Accent: "#ffb627", Shoes: "#ffb627" } };
      return { body: "body_adult_jacket", hair: "ponytail", colours: { ...c, Top: "#fffaf0", Accent: "#6b3fa0", Bottom: "#34323f", Shoes: "#ff6b4a" } };
    }
    case "dex": {
      const c = { Skin: "#fcd5bd", Hair: "#e0b050" };
      if (chapter <= 3) return { body: "body_teen_varsity", hair: "spiky", colours: { ...c, Top: "#6b3fa0", Accent: "#fffaf0", Bottom: "#34323f", Shoes: "#f03a3a" } };
      if (chapter === 5) return { body: "body_adult_suit", hair: "short", colours: { ...c, Top: "#34323f", Bottom: "#34323f", Accent: "#ffb627", Shoes: "#1d1a2b" } };
      if (chapter === 6) return { body: "body_adult_sweater", hair: "short", colours: { ...c, Hair: greyed("#e0b050", 0.3), Top: "#7d7894", Bottom: "#34323f", Shoes: "#34323f" } };
      return { body: "body_elder_cardigan", hair: "balding", colours: { ...c, Hair: greyed("#e0b050", 0.8), Top: "#12a5b8", Bottom: "#34323f", Accent: "#fffaf0", Shoes: "#34323f" }, accessories: ["mustache"] };
    }
    case "okafor":
      if (chapter >= 7) return { body: "body_elder_dress", hair: "curly", colours: { Skin: "#5e3620", Hair: "#dcd8e2", Top: "#ffb627", Accent: "#12a5b8", Shoes: "#e8416f" }, accessories: ["glasses"] };
      return { body: "body_adult_dress", hair: "curly", colours: { Skin: "#5e3620", Hair: "#1c1515", Top: "#ffb627", Accent: "#12a5b8", Shoes: "#e8416f" }, accessories: ["glasses"] };
    case "hale":
      return { body: "body_adult_suit", hair: "balding", colours: { Skin: "#d99560", Hair: "#8a8494", Top: "#23407a", Bottom: "#23407a", Accent: "#f03a3a", Shoes: "#1d1a2b" }, accessories: ["mustache"] };
    case "sam":
      if (chapter >= 7) return { body: "body_elder_cardigan", hair: "bob", colours: { Skin: "#b8743f", Hair: greyed("#8a3a1c", 0.8), Top: "#5cc639", Bottom: "#34323f", Accent: "#fff1d6", Shoes: "#7a4221" } };
      return { body: "body_adult_sweater", hair: "bob", colours: { Skin: "#b8743f", Hair: "#8a3a1c", Top: "#5cc639", Bottom: "#34323f", Shoes: "#fffaf0" }, accessories: chapter === 4 ? ["umbrella"] : [] };
    case "lina":
      if (chapter >= 8) return { body: "body_teen_hoodie", hair: "pigtails", colours: { Skin: "#8a522c", Hair: "#2b1a14", Top: "#5cc639", Bottom: "#23407a", Accent: "#ffd84a", Shoes: "#fffaf0" } };
      return { body: "body_child_tee", hair: "pigtails", colours: { Skin: "#8a522c", Hair: "#2b1a14", Top: "#5cc639", Bottom: "#23407a", Accent: "#ffd84a", Shoes: "#ff6b4a" } };
    case "mika":
      if (chapter === 6) return { body: "body_teen_hoodie", hair: s.look.hairStyle, colours: { Skin: relative(skin, 1), Hair: hair, Top: "#ff8a1f", Bottom: "#23407a", Accent: "#ffd84a", Shoes: "#fffaf0" } };
      if (chapter >= 7) return { body: "body_adult_jacket", hair: s.look.hairStyle, colours: { Skin: relative(skin, 1), Hair: hair, Top: "#fffaf0", Accent: "#ff8a1f", Bottom: "#23407a", Shoes: "#fffaf0" } };
      return { body: "body_child_tee", hair: s.look.hairStyle, colours: { Skin: relative(skin, 1), Hair: hair, Top: "#ff8a1f", Bottom: "#23407a", Shoes: "#fffaf0" } };
    case "pip":
      return { body: "body_child_tee", hair: "curly", colours: { Skin: relative(skin, 1), Hair: hair, Top: "#ffd84a", Bottom: "#e8416f", Shoes: "#12a5b8" }, scale: 0.9 };
    case "ada":
      return { body: "body_adult_dress", hair: "ponytail", colours: { Skin: "#e8b98f", Hair: "#1c1515", Top: "#12a5b8", Accent: "#ffd84a", Shoes: "#fffaf0" } };
    case "doctor":
      return { body: "body_adult_scrubs", hair: "buzz", colours: { Skin: "#d99560", Hair: "#1c1515", Top: "#a78bfa", Bottom: "#a78bfa", Accent: "#fffaf0", Shoes: "#fffaf0" }, accessories: ["stethoscope"] };
    case "biscuit":
      return { body: "dog", colours: {}, scale: has(s, "biscuit") && chapter >= 4 ? 1.05 : 0.85 };
  }
}

export const DISPLAY_NAME: Record<PersonId, string> = {
  you: "You",
  mom: "Mom",
  dad: "Dad",
  nana: "Nana Pearl",
  juno: "Juno",
  dex: "Dex",
  okafor: "Ms Okafor",
  hale: "Director Hale",
  sam: "Sam",
  lina: "Lina",
  biscuit: "Biscuit",
  mika: "Mika",
  pip: "Pip",
  ada: "Ada",
  doctor: "Dr Achebe",
};

export const HEAD_ACCESSORIES = new Set(["glasses", "beard", "mustache", "sunhat", "cap", "bow"]);
export const SOCKETS: Record<string, string> = {
  backpack: "Back",
  satchel: "Back",
  cane: "HandR",
  umbrella: "HandR",
  stethoscope: "Chest",
};
