import type { CareerId, CareerSeason } from "../core/career";
import { avatarLook } from "../../sprites";
import { drawStorybookCharacter } from "../../storybook-characters";
import { drawStorybookPet } from "../../storybook-pets";
import {
  drawCareerOutfitCharacter,
  isCareerOutfitUniform,
  type CareerOutfitUniform,
} from "../../career-outfit-characters";
import {
  drawOccupationCharacter,
  type LegacyJobUniform,
} from "../../occupation-characters";
import type { HeritageStyle } from "../../types";

export type CharacterGender = "female" | "male";
export type CharacterHeritage = "asian" | "western" | "black" | "middle-eastern";
export type CharacterLifeStage =
  | "newborn"
  | "toddler"
  | "child"
  | "teen"
  | "young-adult"
  | "adult"
  | "middle-age"
  | "senior";
export type CharacterDirection = "front" | "back" | "left" | "right";
export type CharacterMotion = "idle" | "walk-a" | "walk-b" | "sit";
export type CharacterExpression =
  | "neutral"
  | "smile"
  | "talk"
  | "concerned"
  | "determined";

export type CharacterSkinToneId =
  | "porcelain-warm"
  | "peach"
  | "golden"
  | "tan"
  | "warm-brown"
  | "deep-brown";
export type CharacterHairColorId =
  | "black"
  | "dark-brown"
  | "warm-brown"
  | "auburn"
  | "silver";
export type CharacterHairStyleId =
  | "short-soft"
  | "wavy-bob"
  | "curly-crown"
  | "tied-back"
  | "twin-buns"
  | "high-ponytail"
  | "braided-pigtails"
  | "soft-bob-clip"
  | "side-part-crop"
  | "tousled-crop"
  | "curly-crop"
  | "soft-undercut"
  | "classic-bun"
  | "silver-wave";
export type CharacterFaceStyleId =
  | "soft-round"
  | "bright-round"
  | "gentle-oval"
  | "cheeky";
export type CharacterClothingPaletteId =
  | "sunrise"
  | "meadow"
  | "ocean"
  | "berry"
  | "coral-teal"
  | "mint-navy"
  | "sunflower-denim"
  | "rust-ocean";
export type CharacterDetailId =
  | "none"
  | "round-glasses"
  | "hair-clip"
  | "freckles"
  | "small-earrings"
  | "scarf"
  | "watch"
  | "friendship-pin";

export interface CharacterStageMetrics {
  /** Fixed outer box; direction and walk frames never change these dimensions. */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly scale: number;
  readonly headRatio: number;
  readonly footAnchorXPercent: 50;
  readonly footAnchorYPercent: 100;
}

export interface CharacterPalette {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly footwear: string;
}

export interface CharacterAppearance {
  readonly skinToneId: CharacterSkinToneId;
  readonly skinColor: string;
  readonly hairStyleId: CharacterHairStyleId;
  readonly hairColorId: CharacterHairColorId;
  readonly hairColor: string;
  readonly faceStyleId: CharacterFaceStyleId;
  readonly clothingPaletteId: CharacterClothingPaletteId;
  readonly clothingPalette: CharacterPalette;
  readonly detailId: CharacterDetailId;
}

export interface CharacterOutfitModel {
  readonly outfitId: string;
  readonly label: string;
  readonly season: CareerSeason;
  readonly roleClass: string;
  readonly topStyle: string;
  readonly bottomStyle: string;
  readonly footwearStyle: string;
  readonly accessory: string | null;
  readonly palette: CharacterPalette;
}

export interface CharacterClassMetadata {
  readonly rootClass: "col-character";
  readonly genderClass: string;
  readonly silhouetteClass: string;
  readonly heritageClass: string;
  readonly stageClass: string;
  readonly directionClass: string;
  readonly motionClass: string;
  readonly expressionClass: string;
  readonly hairClass: string;
  readonly outfitClass: string;
  readonly seasonClass: string;
  readonly className: string;
}

export interface CharacterModel {
  readonly characterId: string;
  readonly label: string;
  readonly gender: CharacterGender;
  readonly bodyPresentationId: "female-character" | "male-character";
  readonly heritage: CharacterHeritage;
  readonly lifeStage: CharacterLifeStage;
  readonly direction: CharacterDirection;
  readonly motion: CharacterMotion;
  readonly expression: CharacterExpression;
  readonly walkFrame: 0 | 1;
  readonly metrics: CharacterStageMetrics;
  readonly appearance: CharacterAppearance;
  readonly outfit: CharacterOutfitModel;
  readonly appearanceSignature: string;
  readonly classes: CharacterClassMetadata;
}

export interface CharacterAppearanceOverrides {
  readonly skinToneId?: CharacterSkinToneId;
  readonly hairStyleId?: CharacterHairStyleId;
  readonly hairColorId?: CharacterHairColorId;
  readonly faceStyleId?: CharacterFaceStyleId;
  readonly clothingPaletteId?: CharacterClothingPaletteId;
  readonly detailId?: CharacterDetailId;
}

export interface CharacterRequest {
  readonly characterId: string;
  readonly label: string;
  readonly gender: CharacterGender;
  readonly heritage: CharacterHeritage;
  readonly lifeStage: CharacterLifeStage;
  readonly direction?: CharacterDirection;
  readonly motion?: CharacterMotion;
  readonly expression?: CharacterExpression;
  readonly seed?: string | number;
  readonly appearance?: CharacterAppearanceOverrides;
  readonly jobId?: CareerId | null;
  readonly season?: CareerSeason;
}

export const CHARACTER_STAGE_METRICS: Readonly<
  Record<CharacterLifeStage, CharacterStageMetrics>
> = Object.freeze({
  newborn: Object.freeze({ widthPx: 46, heightPx: 48, scale: 0.62, headRatio: 0.44, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  toddler: Object.freeze({ widthPx: 50, heightPx: 62, scale: 0.72, headRatio: 0.39, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  child: Object.freeze({ widthPx: 56, heightPx: 78, scale: 0.84, headRatio: 0.34, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  teen: Object.freeze({ widthPx: 62, heightPx: 94, scale: 0.94, headRatio: 0.29, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  "young-adult": Object.freeze({ widthPx: 66, heightPx: 104, scale: 1, headRatio: 0.27, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  adult: Object.freeze({ widthPx: 66, heightPx: 104, scale: 1, headRatio: 0.27, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  "middle-age": Object.freeze({ widthPx: 66, heightPx: 104, scale: 1, headRatio: 0.27, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
  senior: Object.freeze({ widthPx: 64, heightPx: 101, scale: 0.98, headRatio: 0.28, footAnchorXPercent: 50, footAnchorYPercent: 100 }),
});

const SKIN_COLORS: Readonly<Record<CharacterSkinToneId, string>> = Object.freeze({
  "porcelain-warm": "#f7d8bf",
  peach: "#efbd99",
  golden: "#dca06d",
  tan: "#bd7d52",
  "warm-brown": "#8c5237",
  "deep-brown": "#5a3227",
});

const HAIR_COLORS: Readonly<Record<CharacterHairColorId, string>> = Object.freeze({
  black: "#231b1a",
  "dark-brown": "#3b2922",
  "warm-brown": "#6b412d",
  auburn: "#8a3f2a",
  silver: "#d8d3ce",
});

export const CHARACTER_CLOTHING_PALETTES: Readonly<
  Record<CharacterClothingPaletteId, CharacterPalette>
> = Object.freeze({
  sunrise: Object.freeze({ primary: "#ef704f", secondary: "#f6c64e", accent: "#fff3cf", footwear: "#31566a" }),
  meadow: Object.freeze({ primary: "#3f9f78", secondary: "#79c7a2", accent: "#fff1c9", footwear: "#31504a" }),
  ocean: Object.freeze({ primary: "#397fc0", secondary: "#70b7cf", accent: "#f7e7c4", footwear: "#273d65" }),
  berry: Object.freeze({ primary: "#a84e78", secondary: "#d98ba5", accent: "#ffe5ca", footwear: "#513650" }),
  "coral-teal": Object.freeze({ primary: "#ef765d", secondary: "#2f9e9a", accent: "#ffe1a8", footwear: "#31565d" }),
  "mint-navy": Object.freeze({ primary: "#79cbb0", secondary: "#294e76", accent: "#fff1c9", footwear: "#263d59" }),
  "sunflower-denim": Object.freeze({ primary: "#eabf3f", secondary: "#477bad", accent: "#fff2cf", footwear: "#584437" }),
  "rust-ocean": Object.freeze({ primary: "#ba5d43", secondary: "#347e96", accent: "#f8dda7", footwear: "#493a36" }),
});

function skinTones(
  ...tones: CharacterSkinToneId[]
): readonly CharacterSkinToneId[] {
  return Object.freeze(tones);
}

const HERITAGE_SKIN_TONES: Readonly<Record<CharacterHeritage, readonly CharacterSkinToneId[]>> =
  Object.freeze({
    asian: skinTones("porcelain-warm", "peach", "golden", "tan", "warm-brown"),
    western: skinTones("porcelain-warm", "peach", "golden", "tan", "warm-brown", "deep-brown"),
    black: skinTones("tan", "warm-brown", "deep-brown"),
    "middle-eastern": skinTones("peach", "golden", "tan", "warm-brown"),
  });

export const FEMALE_HAIR_STYLES: readonly CharacterHairStyleId[] = Object.freeze([
  "wavy-bob",
  "tied-back",
  "twin-buns",
  "high-ponytail",
  "braided-pigtails",
  "soft-bob-clip",
  "classic-bun",
  "silver-wave",
]);

export const MALE_HAIR_STYLES: readonly CharacterHairStyleId[] = Object.freeze([
  "short-soft",
  "curly-crown",
  "side-part-crop",
  "tousled-crop",
  "curly-crop",
  "soft-undercut",
  "silver-wave",
]);

const FACE_STYLES: readonly CharacterFaceStyleId[] = Object.freeze([
  "soft-round",
  "bright-round",
  "gentle-oval",
  "cheeky",
]);
const HAIR_COLOR_IDS: readonly CharacterHairColorId[] = Object.freeze([
  "black",
  "dark-brown",
  "warm-brown",
  "auburn",
  "silver",
]);
const YOUTH_HAIR_COLOR_IDS: readonly CharacterHairColorId[] = Object.freeze([
  "black",
  "dark-brown",
  "warm-brown",
  "auburn",
]);
const CLOTHING_PALETTE_IDS = Object.freeze(
  Object.keys(CHARACTER_CLOTHING_PALETTES) as CharacterClothingPaletteId[],
);
const DETAIL_IDS: readonly CharacterDetailId[] = Object.freeze([
  "none",
  "round-glasses",
  "hair-clip",
  "freckles",
  "small-earrings",
  "scarf",
  "watch",
  "friendship-pin",
]);

interface WardrobeParts {
  readonly label: string;
  readonly topStyle: string;
  readonly bottomStyle: string;
  readonly footwearStyle: string;
  readonly accessory: string | null;
  readonly palette: CharacterPalette;
}

export interface CharacterJobWardrobe {
  readonly standard: CharacterOutfitModel;
  readonly summer: CharacterOutfitModel;
}

function colors(primary: string, secondary: string, accent: string, footwear = "#3b3a3d"): CharacterPalette {
  return Object.freeze({ primary, secondary, accent, footwear });
}

function jobWardrobe(
  jobId: CareerId,
  standard: WardrobeParts,
  summer: WardrobeParts,
): CharacterJobWardrobe {
  const make = (season: CareerSeason, parts: WardrobeParts): CharacterOutfitModel =>
    Object.freeze({
      outfitId: `${jobId}-${season}-character-v1`,
      label: parts.label,
      season,
      roleClass: `col-outfit--${jobId}`,
      topStyle: parts.topStyle,
      bottomStyle: parts.bottomStyle,
      footwearStyle: parts.footwearStyle,
      accessory: parts.accessory,
      palette: parts.palette,
    });
  return Object.freeze({ standard: make("standard", standard), summer: make("summer", summer) });
}

const neutralShoe = "everyday-shoes";
export const CHARACTER_JOB_WARDROBES: Readonly<Record<CareerId, CharacterJobWardrobe>> =
  Object.freeze({
    teacher: jobWardrobe("teacher", { label: "Teacher cardigan", topStyle: "cardigan", bottomStyle: "smart-bottoms", footwearStyle: neutralShoe, accessory: "book-satchel", palette: colors("#cc6d55", "#3d7185", "#f4d69d") }, { label: "Summer teacher outfit", topStyle: "short-sleeve-blouse", bottomStyle: "light-smart-bottoms", footwearStyle: "summer-loafers", accessory: "book-satchel", palette: colors("#e38667", "#5f9a9a", "#fff0bf") }),
    chef: jobWardrobe("chef", { label: "Chef whites", topStyle: "chef-jacket", bottomStyle: "kitchen-trousers", footwearStyle: "kitchen-shoes", accessory: "chef-hat", palette: colors("#fff8e8", "#3c4854", "#d55343") }, { label: "Summer kitchen uniform", topStyle: "short-sleeve-chef-jacket", bottomStyle: "light-kitchen-trousers", footwearStyle: "kitchen-shoes", accessory: "apron", palette: colors("#fff8e8", "#486272", "#e16d51") }),
    barista: jobWardrobe("barista", { label: "Barista apron", topStyle: "rolled-overshirt", bottomStyle: "work-trousers", footwearStyle: neutralShoe, accessory: "cafe-apron", palette: colors("#6d4835", "#377c76", "#f0c27b") }, { label: "Summer cafe outfit", topStyle: "short-sleeve-tee", bottomStyle: "light-work-bottoms", footwearStyle: "canvas-shoes", accessory: "cafe-apron", palette: colors("#8b5a3c", "#55a39a", "#ffe0a0") }),
    athlete: jobWardrobe("athlete", { label: "Team tracksuit", topStyle: "track-jacket", bottomStyle: "track-pants", footwearStyle: "sport-trainers", accessory: "team-badge", palette: colors("#236eb5", "#f5b642", "#f7f7ef", "#25374c") }, { label: "Summer training kit", topStyle: "performance-tee", bottomStyle: "sport-shorts", footwearStyle: "sport-trainers", accessory: "headband", palette: colors("#2e82c7", "#f7c94e", "#fff7da", "#25374c") }),
    entrepreneur: jobWardrobe("entrepreneur", { label: "Founder smart casual", topStyle: "smart-jacket", bottomStyle: "tailored-bottoms", footwearStyle: "smart-shoes", accessory: "tablet", palette: colors("#345b7e", "#d77854", "#f5deaf") }, { label: "Summer founder outfit", topStyle: "open-collar-shirt", bottomStyle: "summer-tailored-bottoms", footwearStyle: "summer-loafers", accessory: "tablet", palette: colors("#4b7f9b", "#e48a5e", "#fff0c7") }),
    engineer: jobWardrobe("engineer", { label: "Engineering field jacket", topStyle: "utility-jacket", bottomStyle: "utility-trousers", footwearStyle: "safety-boots", accessory: "safety-glasses", palette: colors("#e59e32", "#405e6f", "#f6ebc9", "#493e37") }, { label: "Summer engineering kit", topStyle: "short-work-shirt", bottomStyle: "light-utility-trousers", footwearStyle: "safety-boots", accessory: "safety-glasses", palette: colors("#efb14b", "#53798c", "#fff0c5", "#493e37") }),
    "software-engineer": jobWardrobe("software-engineer", { label: "Software studio layers", topStyle: "soft-hoodie", bottomStyle: "comfortable-trousers", footwearStyle: "canvas-shoes", accessory: "laptop-bag", palette: colors("#5a6199", "#53a59c", "#f3d79f") }, { label: "Summer software outfit", topStyle: "tech-tee", bottomStyle: "smart-shorts", footwearStyle: "canvas-shoes", accessory: "laptop-bag", palette: colors("#7078b2", "#6bb8ac", "#ffe6aa") }),
    manager: jobWardrobe("manager", { label: "Manager blazer", topStyle: "office-blazer", bottomStyle: "tailored-bottoms", footwearStyle: "smart-shoes", accessory: "planner", palette: colors("#415d7b", "#a95367", "#f5dcb0") }, { label: "Summer manager outfit", topStyle: "short-office-shirt", bottomStyle: "summer-tailored-bottoms", footwearStyle: "summer-loafers", accessory: "planner", palette: colors("#5d7f9b", "#c56a78", "#ffedc9") }),
    "financial-analyst": jobWardrobe("financial-analyst", { label: "Analyst tailored suit", topStyle: "tailored-jacket", bottomStyle: "tailored-bottoms", footwearStyle: "smart-shoes", accessory: "portfolio", palette: colors("#2f4b68", "#8f654d", "#f4e0b8") }, { label: "Summer analyst outfit", topStyle: "light-office-shirt", bottomStyle: "summer-tailored-bottoms", footwearStyle: "summer-loafers", accessory: "portfolio", palette: colors("#496c8b", "#b07855", "#fff0ca") }),
    artist: jobWardrobe("artist", { label: "Artist smock", topStyle: "paint-smock", bottomStyle: "studio-trousers", footwearStyle: "canvas-shoes", accessory: "art-palette", palette: colors("#b55470", "#397f86", "#f4c84e") }, { label: "Summer studio outfit", topStyle: "loose-art-tee", bottomStyle: "studio-shorts", footwearStyle: "canvas-shoes", accessory: "art-palette", palette: colors("#cf6983", "#4b9da0", "#f8d55c") }),
    police: jobWardrobe("police", { label: "Police duty uniform", topStyle: "duty-jacket", bottomStyle: "duty-trousers", footwearStyle: "duty-boots", accessory: "police-cap", palette: colors("#294f76", "#24384c", "#d9b64d", "#202d39") }, { label: "Summer police uniform", topStyle: "short-sleeve-duty-shirt", bottomStyle: "light-duty-trousers", footwearStyle: "duty-boots", accessory: "police-cap", palette: colors("#376791", "#29455d", "#e8c55a", "#202d39") }),
    lawyer: jobWardrobe("lawyer", { label: "Lawyer court suit", topStyle: "court-jacket", bottomStyle: "tailored-bottoms", footwearStyle: "smart-shoes", accessory: "briefcase", palette: colors("#343c58", "#7f5364", "#f2dfbd") }, { label: "Summer legal outfit", topStyle: "light-court-shirt", bottomStyle: "summer-tailored-bottoms", footwearStyle: "summer-loafers", accessory: "briefcase", palette: colors("#515c78", "#a36d7e", "#fff0cb") }),
    ceo: jobWardrobe("ceo", { label: "Executive suit", topStyle: "executive-jacket", bottomStyle: "executive-bottoms", footwearStyle: "smart-shoes", accessory: "executive-watch", palette: colors("#243d5c", "#a15e48", "#efd19b") }, { label: "Summer executive outfit", topStyle: "light-executive-shirt", bottomStyle: "summer-tailored-bottoms", footwearStyle: "summer-loafers", accessory: "executive-watch", palette: colors("#3e6280", "#c17659", "#ffe7b5") }),
    doctor: jobWardrobe("doctor", { label: "Doctor coat", topStyle: "lab-coat", bottomStyle: "clinical-trousers", footwearStyle: "clinical-shoes", accessory: "stethoscope", palette: colors("#f9f8eb", "#4a92a0", "#d15f61", "#43565e") }, { label: "Summer doctor scrubs", topStyle: "short-sleeve-scrubs", bottomStyle: "light-clinical-trousers", footwearStyle: "clinical-shoes", accessory: "stethoscope", palette: colors("#e9f6ec", "#54a8a6", "#e2706f", "#43565e") }),
    nurse: jobWardrobe("nurse", { label: "Nurse scrub jacket", topStyle: "scrub-jacket", bottomStyle: "clinical-trousers", footwearStyle: "clinical-shoes", accessory: "care-badge", palette: colors("#68aaa1", "#edf7e9", "#e16f75", "#43565e") }, { label: "Summer nursing scrubs", topStyle: "short-sleeve-scrubs", bottomStyle: "light-clinical-trousers", footwearStyle: "clinical-shoes", accessory: "care-badge", palette: colors("#79beb1", "#f5f8e8", "#eb7f82", "#43565e") }),
    farmer: jobWardrobe("farmer", { label: "Farm workwear", topStyle: "work-jacket", bottomStyle: "work-overalls", footwearStyle: "work-boots", accessory: "straw-hat", palette: colors("#638253", "#ad6d3f", "#e4bd58", "#4f4032") }, { label: "Summer farm outfit", topStyle: "short-work-shirt", bottomStyle: "light-work-overalls", footwearStyle: "work-boots", accessory: "sun-hat", palette: colors("#78a064", "#c3804b", "#f0ce6a", "#4f4032") }),
    dancer: jobWardrobe("dancer", { label: "Dance warm-up layers", topStyle: "dance-cardigan", bottomStyle: "dance-bottoms", footwearStyle: "dance-shoes", accessory: "dance-ribbon", palette: colors("#9c587f", "#4c86a0", "#f2c777") }, { label: "Summer dance kit", topStyle: "dance-tee", bottomStyle: "dance-shorts", footwearStyle: "dance-shoes", accessory: "dance-ribbon", palette: colors("#bd6b92", "#62a1b6", "#f8d68b") }),
    "gym-trainer": jobWardrobe("gym-trainer", { label: "Trainer tracksuit", topStyle: "training-jacket", bottomStyle: "training-pants", footwearStyle: "sport-trainers", accessory: "coach-towel", palette: colors("#258c79", "#e25f4d", "#f7d462", "#2e4249") }, { label: "Summer trainer kit", topStyle: "training-tee", bottomStyle: "sport-shorts", footwearStyle: "sport-trainers", accessory: "coach-towel", palette: colors("#37a58f", "#ef735d", "#f9dd70", "#2e4249") }),
    army: jobWardrobe("army", { label: "Army field uniform", topStyle: "field-jacket", bottomStyle: "field-trousers", footwearStyle: "field-boots", accessory: "beret", palette: colors("#56684c", "#3e4c3d", "#b79a5e", "#393832") }, { label: "Summer army uniform", topStyle: "short-sleeve-field-shirt", bottomStyle: "light-field-trousers", footwearStyle: "field-boots", accessory: "beret", palette: colors("#6f805f", "#52604c", "#c7aa6b", "#393832") }),
  });

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function pick<T>(values: readonly T[], seed: string, salt: string): T {
  return values[stableHash(`${seed}:${salt}`) % values.length] as T;
}

function casualOutfit(
  paletteId: CharacterClothingPaletteId,
  season: CareerSeason,
): CharacterOutfitModel {
  const summer = season === "summer";
  return Object.freeze({
    outfitId: `casual-${paletteId}-${season}-v1`,
    label: summer ? "Summer casual outfit" : "Everyday casual outfit",
    season,
    roleClass: "col-outfit--casual",
    topStyle: summer ? "short-sleeve-casual" : "layered-casual",
    bottomStyle: summer ? "casual-shorts" : "casual-bottoms",
    footwearStyle: summer ? "canvas-shoes" : "everyday-shoes",
    accessory: null,
    palette: CHARACTER_CLOTHING_PALETTES[paletteId],
  });
}

export function resolveCharacterOutfit(
  jobId: CareerId | null | undefined,
  season: CareerSeason,
  casualPaletteId: CharacterClothingPaletteId = "ocean",
): CharacterOutfitModel {
  return jobId
    ? CHARACTER_JOB_WARDROBES[jobId][season]
    : casualOutfit(casualPaletteId, season);
}

function classMetadata(
  gender: CharacterGender,
  heritage: CharacterHeritage,
  stage: CharacterLifeStage,
  direction: CharacterDirection,
  motion: CharacterMotion,
  expression: CharacterExpression,
  hairStyleId: CharacterHairStyleId,
  outfit: CharacterOutfitModel,
): CharacterClassMetadata {
  const metadata = {
    rootClass: "col-character" as const,
    genderClass: `col-character--${gender}`,
    silhouetteClass: `col-character--${gender === "female" ? "feminine" : "masculine"}-silhouette`,
    heritageClass: `col-character--heritage-${heritage}`,
    stageClass: `col-character--stage-${stage}`,
    directionClass: `col-character--faces-${direction}`,
    motionClass: `col-character--${motion}`,
    expressionClass: `col-character--expression-${expression}`,
    hairClass: `col-character--hair-${hairStyleId}`,
    outfitClass: outfit.roleClass,
    seasonClass: `col-character--season-${outfit.season}`,
  };
  return Object.freeze({
    ...metadata,
    className: Object.values(metadata).join(" "),
  });
}

export function createCharacterModel(request: CharacterRequest): CharacterModel {
  const seed = String(request.seed ?? request.characterId);
  const allHairStyles = request.gender === "female" ? FEMALE_HAIR_STYLES : MALE_HAIR_STYLES;
  const ageSupportsSilver = request.lifeStage === "middle-age" || request.lifeStage === "senior";
  const hairStyles = ageSupportsSilver
    ? allHairStyles
    : allHairStyles.filter((styleId) => styleId !== "silver-wave");
  const hairColors = ageSupportsSilver ? HAIR_COLOR_IDS : YOUTH_HAIR_COLOR_IDS;
  const skinToneId = request.appearance?.skinToneId ?? pick(HERITAGE_SKIN_TONES[request.heritage], seed, "skin");
  const hairStyleId = request.appearance?.hairStyleId ?? pick(hairStyles, seed, "hair-style");
  const hairColorId = request.appearance?.hairColorId ?? pick(hairColors, seed, "hair-color");
  const faceStyleId = request.appearance?.faceStyleId ?? pick(FACE_STYLES, seed, "face");
  const clothingPaletteId = request.appearance?.clothingPaletteId ?? pick(CLOTHING_PALETTE_IDS, seed, "clothes");
  const detailId = request.appearance?.detailId ?? pick(DETAIL_IDS, seed, "detail");
  const direction = request.direction ?? "front";
  const motion = request.motion ?? "idle";
  const expression = request.expression ?? "neutral";
  const season = request.season ?? "standard";
  const outfit = resolveCharacterOutfit(request.jobId, season, clothingPaletteId);
  const appearance: CharacterAppearance = Object.freeze({
    skinToneId,
    skinColor: SKIN_COLORS[skinToneId],
    hairStyleId,
    hairColorId,
    hairColor: HAIR_COLORS[hairColorId],
    faceStyleId,
    clothingPaletteId,
    clothingPalette: CHARACTER_CLOTHING_PALETTES[clothingPaletteId],
    detailId,
  });
  const appearanceSignature = [
    request.gender,
    request.heritage,
    skinToneId,
    hairStyleId,
    hairColorId,
    faceStyleId,
    clothingPaletteId,
    detailId,
    outfit.outfitId,
  ].join(":");

  return Object.freeze({
    characterId: request.characterId,
    label: request.label,
    gender: request.gender,
    bodyPresentationId: request.gender === "female" ? "female-character" : "male-character",
    heritage: request.heritage,
    lifeStage: request.lifeStage,
    direction,
    motion,
    expression,
    walkFrame: motion === "walk-b" ? 1 : 0,
    metrics: CHARACTER_STAGE_METRICS[request.lifeStage],
    appearance,
    outfit,
    appearanceSignature,
    classes: classMetadata(request.gender, request.heritage, request.lifeStage, direction, motion, expression, hairStyleId, outfit),
  });
}

export function characterMotionAtTick(
  moving: boolean,
  direction: CharacterDirection,
  simulationTick: number,
  reducedMotion = false,
): Pick<CharacterRequest, "direction" | "motion"> {
  if (!moving || reducedMotion) return Object.freeze({ direction, motion: "idle" });
  const frame = Math.floor(Math.max(0, simulationTick) / 6) % 2;
  return Object.freeze({ direction, motion: frame === 0 ? "walk-a" : "walk-b" });
}

export function withCharacterState(
  model: CharacterModel,
  state: Readonly<{
    direction?: CharacterDirection;
    motion?: CharacterMotion;
    expression?: CharacterExpression;
  }>,
): CharacterModel {
  return createCharacterModel({
    characterId: model.characterId,
    label: model.label,
    gender: model.gender,
    heritage: model.heritage,
    lifeStage: model.lifeStage,
    direction: state.direction ?? model.direction,
    motion: state.motion ?? model.motion,
    expression: state.expression ?? model.expression,
    appearance: {
      skinToneId: model.appearance.skinToneId,
      hairStyleId: model.appearance.hairStyleId,
      hairColorId: model.appearance.hairColorId,
      faceStyleId: model.appearance.faceStyleId,
      clothingPaletteId: model.appearance.clothingPaletteId,
      detailId: model.appearance.detailId,
    },
    jobId: (Object.keys(CHARACTER_JOB_WARDROBES) as CareerId[]).find(
      (jobId) => CHARACTER_JOB_WARDROBES[jobId][model.outfit.season].outfitId === model.outfit.outfitId,
    ) ?? null,
    season: model.outfit.season,
  });
}

/** Creates visually distinct deterministic NPCs while preserving requested identity fields. */
export function createUniqueNpcCharacterModels(
  requests: readonly CharacterRequest[],
  occupiedSignatures: ReadonlySet<string> = new Set<string>(),
): readonly CharacterModel[] {
  const used = new Set(occupiedSignatures);
  return Object.freeze(requests.map((request, index) => {
    for (let attempt = 0; attempt < 2_048; attempt += 1) {
      const baseSeed = request.seed ?? request.characterId;
      const candidate = createCharacterModel({
        ...request,
        seed: `${baseSeed}:npc-${index}:variation-${attempt}`,
      });
      if (!used.has(candidate.appearanceSignature)) {
        used.add(candidate.appearanceSignature);
        return candidate;
      }
    }
    throw new Error(`Unable to create a unique appearance for ${request.characterId}`);
  }));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function characterStyle(model: CharacterModel): string {
  const { metrics, appearance, outfit } = model;
  return [
    `--col-character-width:${metrics.widthPx}px`,
    `--col-character-height:${metrics.heightPx}px`,
    `--col-character-scale:${metrics.scale}`,
    `--col-character-head-ratio:${metrics.headRatio}`,
    `--col-character-skin:${appearance.skinColor}`,
    `--col-character-hair:${appearance.hairColor}`,
    `--col-character-primary:${outfit.palette.primary}`,
    `--col-character-secondary:${outfit.palette.secondary}`,
    `--col-character-accent:${outfit.palette.accent}`,
    `--col-character-footwear:${outfit.palette.footwear}`,
  ].join(";");
}

/**
 * Compact semantic sprite markup. CSS may articulate limbs per walk frame, but
 * the fixed root box and bottom-centre foot anchor remain unchanged.
 */
export function renderCharacterMarkup(model: CharacterModel): string {
  const id = escapeHtml(model.characterId);
  const label = escapeHtml(model.label);
  const accessory = model.outfit.accessory
    ? `<span class="col-character__job-accessory col-character__job-accessory--${escapeHtml(model.outfit.accessory)}"></span>`
    : "";
  return `<span class="${model.classes.className}" data-character-id="${id}" data-gender="${model.gender}" data-body-presentation="${model.bodyPresentationId}" data-life-stage="${model.lifeStage}" data-direction="${model.direction}" data-motion="${model.motion}" data-expression="${model.expression}" data-foot-anchor="bottom-center" data-appearance-signature="${escapeHtml(model.appearanceSignature)}" role="img" aria-label="${label}" style="${characterStyle(model)}"><span class="col-character__shadow" aria-hidden="true"></span><span class="col-character__figure" aria-hidden="true"><span class="col-character__hair-back"></span><span class="col-character__head"><span class="col-character__ear col-character__ear--left"></span><span class="col-character__ear col-character__ear--right"></span><span class="col-character__hair"></span><span class="col-character__face"><span class="col-character__brow col-character__brow--left"></span><span class="col-character__brow col-character__brow--right"></span><span class="col-character__eye col-character__eye--left"></span><span class="col-character__eye col-character__eye--right"></span><span class="col-character__cheek col-character__cheek--left"></span><span class="col-character__cheek col-character__cheek--right"></span><span class="col-character__mouth"></span></span></span><span class="col-character__body"><span class="col-character__torso"></span><span class="col-character__arm col-character__arm--left"></span><span class="col-character__arm col-character__arm--right"></span><span class="col-character__bottoms"></span>${accessory}<span class="col-character__detail col-character__detail--${model.appearance.detailId}"></span></span><span class="col-character__leg col-character__leg--left"><span class="col-character__shoe"></span></span><span class="col-character__leg col-character__leg--right"><span class="col-character__shoe"></span></span></span></span>`;
}

const LIFE_STAGE_INDEX: Readonly<Record<CharacterLifeStage, number>> = Object.freeze({
  newborn: 0,
  toddler: 1,
  child: 3,
  teen: 5,
  "young-adult": 6,
  adult: 7,
  "middle-age": 9,
  senior: 11,
});

const CAREER_UNIFORM_BY_JOB: Readonly<Partial<Record<CareerId, CareerOutfitUniform>>> =
  Object.freeze({
    teacher: "teacher",
    chef: "chef",
    barista: "barista",
    athlete: "athlete",
    entrepreneur: "entrepreneur",
    engineer: "generalengineer",
    "software-engineer": "softwareengineer",
    manager: "manager",
    "financial-analyst": "analyst",
    artist: "artist",
    police: "police",
    lawyer: "lawyer",
    ceo: "ceo",
  });

const OCCUPATION_UNIFORM_BY_JOB: Readonly<Partial<Record<CareerId, LegacyJobUniform>>> =
  Object.freeze({
    doctor: "doctor",
    farmer: "farmer",
    dancer: "dancer",
    "gym-trainer": "trainer",
    army: "soldier",
  });

function atlasHeritage(heritage: CharacterHeritage): HeritageStyle {
  return heritage === "middle-eastern" ? "middleEastern" : heritage;
}

function modelJobId(model: CharacterModel): CareerId | null {
  return (Object.keys(CHARACTER_JOB_WARDROBES) as CareerId[]).find(
    (jobId) => CHARACTER_JOB_WARDROBES[jobId][model.outfit.season].outfitId === model.outfit.outfitId,
  ) ?? null;
}

function drawCharacterAtlas(canvas: HTMLCanvasElement, model: CharacterModel): boolean {
  const context = canvas.getContext("2d");
  if (context === null) return false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const heritage = atlasHeritage(model.heritage);
  const moving = model.motion === "walk-a" || model.motion === "walk-b";
  const phase = model.walkFrame === 0 ? 0 : Math.PI / 2;
  const size = Math.min(172, Math.max(92, model.metrics.heightPx * 1.5));
  const jobId = modelJobId(model);
  const careerUniform = jobId === null ? undefined : CAREER_UNIFORM_BY_JOB[jobId];
  if (
    careerUniform !== undefined
    && isCareerOutfitUniform(careerUniform)
    && drawCareerOutfitCharacter(
      context,
      canvas.width / 2,
      canvas.height - 7,
      careerUniform,
      heritage,
      model.gender,
      { facing: model.direction, moving, phase, season: model.outfit.season, size },
    )
  ) {
    return true;
  }
  const occupationUniform = jobId === null ? undefined : OCCUPATION_UNIFORM_BY_JOB[jobId];
  if (
    occupationUniform !== undefined
    && drawOccupationCharacter(
      context,
      canvas.width / 2,
      canvas.height - 7,
      occupationUniform,
      heritage,
      model.gender,
      { facing: model.direction, moving, phase, size },
    )
  ) {
    return true;
  }
  const look = avatarLook(
    LIFE_STAGE_INDEX[model.lifeStage],
    model.gender,
    heritage,
    stableHash(model.appearanceSignature) % 2 === 0 ? "classic" : "alternate",
  );
  return drawStorybookCharacter(
    context,
    canvas.width / 2,
    canvas.height - 7,
    look,
    phase,
    {
      moving,
      facing: model.direction,
      verticalBias: 0,
      pose: model.motion === "sit" ? "sit" : "stand",
    },
  );
}

export function createCharacterElement(
  document: Document,
  model: CharacterModel,
): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = renderCharacterMarkup(model);
  const element = template.content.firstElementChild;
  if (!element) throw new Error("Character markup did not create an element");
  const character = element as HTMLElement;
  const canvas = document.createElement("canvas");
  canvas.className = "col-character__atlas";
  canvas.width = 192;
  canvas.height = 192;
  canvas.setAttribute("aria-hidden", "true");
  character.append(canvas);
  const redraw = (): void => {
    character.classList.toggle("col-character--atlas-ready", drawCharacterAtlas(canvas, model));
  };
  redraw();
  const ownerWindow = document.defaultView;
  if (ownerWindow && !character.classList.contains("col-character--atlas-ready")) {
    const eventNames = [
      "plj:character-atlas-ready",
      "plj:career-outfit-atlas-ready",
      "plj:occupation-atlas-ready",
    ];
    // Atlas sheets load in several stages and each dispatches a ready event,
    // so keep listening until the frame this element needs has drawn.
    const onAtlasReady = (): void => {
      redraw();
      if (character.classList.contains("col-character--atlas-ready")) {
        for (const eventName of eventNames) {
          ownerWindow.removeEventListener(eventName, onAtlasReady);
        }
      }
    };
    for (const eventName of eventNames) {
      ownerWindow.addEventListener(eventName, onAtlasReady);
    }
  }
  return character;
}

export type CompanionKind = "cat" | "dog";
export type CompanionMotion = "idle" | "walk-a" | "walk-b" | "sit";
export type CompanionExpression = "neutral" | "happy" | "curious";
export type CompanionCoatId =
  | "ginger-tabby"
  | "tuxedo"
  | "silver-tabby"
  | "cream-cat"
  | "golden-dog"
  | "brown-white-dog"
  | "black-tan-dog"
  | "cream-dog";

export interface CompanionRequest {
  readonly companionId: string;
  readonly name: string;
  readonly kind: CompanionKind;
  readonly direction?: CharacterDirection;
  readonly motion?: CompanionMotion;
  readonly expression?: CompanionExpression;
  readonly coatId?: CompanionCoatId;
  readonly seed?: string | number;
}

export interface CompanionModel {
  readonly companionId: string;
  readonly name: string;
  readonly kind: CompanionKind;
  readonly direction: CharacterDirection;
  readonly motion: CompanionMotion;
  readonly expression: CompanionExpression;
  readonly coatId: CompanionCoatId;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly className: string;
}

const companionCoat = (primary: string, secondary: string): readonly [string, string] =>
  Object.freeze([primary, secondary] as const);

const COMPANION_COATS: Readonly<Record<CompanionCoatId, readonly [string, string]>> = Object.freeze({
  "ginger-tabby": companionCoat("#d9823f", "#f4c57d"),
  tuxedo: companionCoat("#343237", "#f5eee1"),
  "silver-tabby": companionCoat("#8d969e", "#d8d4c9"),
  "cream-cat": companionCoat("#e8cda2", "#fff1d5"),
  "golden-dog": companionCoat("#c98a48", "#f0c883"),
  "brown-white-dog": companionCoat("#875536", "#f3e3c7"),
  "black-tan-dog": companionCoat("#333238", "#bd7b49"),
  "cream-dog": companionCoat("#d9b985", "#f5e8cc"),
});
const CAT_COATS: readonly CompanionCoatId[] = Object.freeze(["ginger-tabby", "tuxedo", "silver-tabby", "cream-cat"]);
const DOG_COATS: readonly CompanionCoatId[] = Object.freeze(["golden-dog", "brown-white-dog", "black-tan-dog", "cream-dog"]);

export function createCompanionModel(request: CompanionRequest): CompanionModel {
  const seed = String(request.seed ?? request.companionId);
  const validCoats = request.kind === "cat" ? CAT_COATS : DOG_COATS;
  const requestedCoat = request.coatId;
  const coatId = requestedCoat && validCoats.includes(requestedCoat)
    ? requestedCoat
    : pick(validCoats, seed, "companion-coat");
  const [primaryColor, secondaryColor] = COMPANION_COATS[coatId];
  const direction = request.direction ?? "right";
  const motion = request.motion ?? "idle";
  const expression = request.expression ?? "neutral";
  return Object.freeze({
    companionId: request.companionId,
    name: request.name,
    kind: request.kind,
    direction,
    motion,
    expression,
    coatId,
    primaryColor,
    secondaryColor,
    className: [
      "col-companion",
      `col-companion--${request.kind}`,
      `col-companion--faces-${direction}`,
      `col-companion--${motion}`,
      `col-companion--expression-${expression}`,
      `col-companion--coat-${coatId}`,
    ].join(" "),
  });
}

export function renderCompanionMarkup(model: CompanionModel): string {
  return `<span class="${model.className}" data-companion-id="${escapeHtml(model.companionId)}" data-kind="${model.kind}" data-direction="${model.direction}" data-motion="${model.motion}" data-foot-anchor="bottom-center" role="img" aria-label="${escapeHtml(model.name)}, ${model.kind}" style="--col-companion-primary:${model.primaryColor};--col-companion-secondary:${model.secondaryColor}"><span class="col-companion__shadow" aria-hidden="true"></span><span class="col-companion__figure" aria-hidden="true"><span class="col-companion__tail"></span><span class="col-companion__body"></span><span class="col-companion__leg col-companion__leg--front"></span><span class="col-companion__leg col-companion__leg--back"></span><span class="col-companion__head"><span class="col-companion__ear col-companion__ear--left"></span><span class="col-companion__ear col-companion__ear--right"></span><span class="col-companion__eye col-companion__eye--left"></span><span class="col-companion__eye col-companion__eye--right"></span><span class="col-companion__muzzle"></span></span></span></span>`;
}

export function createCompanionElement(
  document: Document,
  model: CompanionModel,
): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = renderCompanionMarkup(model);
  const element = template.content.firstElementChild;
  if (!element) throw new Error("Companion markup did not create an element");
  const companion = element as HTMLElement;
  const canvas = document.createElement("canvas");
  canvas.className = "col-companion__atlas";
  canvas.width = 128;
  canvas.height = 128;
  canvas.setAttribute("aria-hidden", "true");
  companion.append(canvas);
  const redraw = (): void => {
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const ready = drawStorybookPet(context, canvas.width / 2, canvas.height - 5, model.kind, {
      facing: model.direction,
      moving: model.motion === "walk-a" || model.motion === "walk-b",
      phase: model.motion === "walk-b" ? Math.PI / 2 : 0,
      sitting: model.motion === "sit",
      shadow: true,
    });
    companion.classList.toggle("col-companion--atlas-ready", ready);
  };
  redraw();
  document.defaultView?.addEventListener("plj:pet-atlas-ready", redraw, { once: true });
  return companion;
}
