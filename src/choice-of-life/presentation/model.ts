import {
  STARTING_PROFILE_SCORES,
  type ControlMode,
  type CoreScores,
  type Difficulty,
  type ScoreId,
  type StartingProfileId,
} from "../core/run-state";
import type {
  ClothingPaletteId,
  Gender,
  HairColorId,
  HairStyleId,
  HeritageStyleId,
  SetupSelection,
  VisualSettings,
} from "../core/shell-contracts";

export type { ControlMode, CoreScores, Difficulty, ScoreId, StartingProfileId } from "../core/run-state";
export type {
  AppearanceSelection,
  ClothingPaletteId,
  Gender,
  HairColorId,
  HairStyleId,
  HeritageStyleId,
  SetupSelection,
  TextScale,
  VisualSettings,
} from "../core/shell-contracts";

export interface StartingProfile {
  readonly id: StartingProfileId;
  readonly label: string;
  readonly description: string;
  readonly scores: CoreScores;
}

export interface ChoiceOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly description: string;
}

export interface ScorePreviewItem {
  readonly id: ScoreId;
  readonly label: "Health" | "Happiness" | "Financial security";
  readonly value: number;
}

export const STARTING_PROFILES: readonly StartingProfile[] = Object.freeze([
  Object.freeze({
    id: "steady-mix-v1",
    label: "Steady mix",
    description: "A broadly balanced starting context.",
    scores: Object.freeze({ ...STARTING_PROFILE_SCORES["steady-mix-v1"] }),
  }),
  Object.freeze({
    id: "physical-head-start-v1",
    label: "Physical head start",
    description: "Physical wellbeing starts a little higher; this is a temporary score emphasis, not a judgment about caregivers or family worth.",
    scores: Object.freeze({ ...STARTING_PROFILE_SCORES["physical-head-start-v1"] }),
  }),
  Object.freeze({
    id: "emotional-head-start-v1",
    label: "Emotional head start",
    description: "Happiness starts a little higher; this is a temporary score emphasis, not a judgment about caregivers or family worth.",
    scores: Object.freeze({ ...STARTING_PROFILE_SCORES["emotional-head-start-v1"] }),
  }),
  Object.freeze({
    id: "resource-head-start-v1",
    label: "Resource head start",
    description: "Financial security starts a little higher; this is a temporary score emphasis, not a judgment about caregivers or family worth.",
    scores: Object.freeze({ ...STARTING_PROFILE_SCORES["resource-head-start-v1"] }),
  }),
]);

export const DIFFICULTIES: readonly ChoiceOption<Difficulty>[] = [
  { id: "story", label: "Easy", description: "Slow-moving items, fewer hazards, and more recovery time." },
  { id: "normal", label: "Medium", description: "Items move faster with a balanced number of hazards." },
  { id: "challenge", label: "Difficult", description: "The fastest item speed and the busiest hazard patterns." },
] as const;

export const CONTROL_MODES: readonly ChoiceOption<ControlMode>[] = [
  { id: "manual", label: "Manual runner", description: "Use the friendly four-way pad, arrow keys, or WASD controls." },
  { id: "semantic-assist", label: "Semantic Assist", description: "Choose the same lane decisions from untimed, descriptive controls." },
  { id: "automatic-assist", label: "Automatic Assist", description: "The neutral runner trace is handled for you while story choices remain yours." },
] as const;

export const GENDERS: readonly ChoiceOption<Gender>[] = [
  { id: "female", label: "Female", description: "Use the female character set." },
  { id: "male", label: "Male", description: "Use the male character set." },
] as const;

export const HERITAGE_STYLES: readonly ChoiceOption<HeritageStyleId>[] = [
  { id: "asian", label: "Art set A · East Asian-inspired", description: "Visual art only; it does not assert identity or nationality and never affects mechanics." },
  { id: "western", label: "Art set B · Euro-American-inspired", description: "Visual art only; it does not assert identity or nationality and never affects mechanics." },
  { id: "black", label: "Art set C · African-diaspora-inspired", description: "Visual art only; it does not assert identity or nationality and never affects mechanics." },
  { id: "middle-eastern", label: "Art set D · West Asian-inspired", description: "Visual art only; it does not assert identity or nationality and never affects mechanics." },
] as const;

export const HAIR_STYLES: readonly ChoiceOption<HairStyleId>[] = [
  { id: "short-soft", label: "Short and soft", description: "A neat short style." },
  { id: "wavy-bob", label: "Wavy bob", description: "A soft, wavy shape." },
  { id: "curly-crown", label: "Curly crown", description: "A rounded curly style." },
  { id: "tied-back", label: "Tied back", description: "Hair gathered away from the face." },
] as const;

export const HAIR_COLORS: readonly ChoiceOption<HairColorId>[] = [
  { id: "black", label: "Black", description: "Black hair." },
  { id: "dark-brown", label: "Dark brown", description: "Dark brown hair." },
  { id: "warm-brown", label: "Warm brown", description: "Warm brown hair." },
  { id: "silver", label: "Silver", description: "Silver hair." },
] as const;

export const CLOTHING_PALETTES: readonly ChoiceOption<ClothingPaletteId>[] = [
  { id: "sunrise", label: "Sunrise", description: "Warm orange and gold clothing." },
  { id: "meadow", label: "Meadow", description: "Fresh green and teal clothing." },
  { id: "ocean", label: "Ocean", description: "Blue and navy clothing." },
  { id: "berry", label: "Berry", description: "Berry and plum clothing." },
] as const;

export const DEFAULT_SETTINGS: VisualSettings = Object.freeze({
  highContrast: false,
  reducedMotion: false,
  textScale: 100,
  screenReaderAnnouncements: true,
});

export const DEFAULT_SETUP: SetupSelection = Object.freeze({
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  controlMode: "manual",
  gender: "female",
  appearance: Object.freeze({
    heritageStyleId: "asian",
    hairStyleId: "short-soft",
    hairColorId: "black",
    clothingPaletteId: "sunrise",
  }),
});

export function getStartingProfile(id: StartingProfileId): StartingProfile {
  const profile = STARTING_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new Error(`Unknown starting profile: ${id}`);
  }
  return profile;
}

export function getScorePreview(profileId: StartingProfileId): readonly ScorePreviewItem[] {
  const { scores } = getStartingProfile(profileId);
  return [
    { id: "health", label: "Health", value: scores.health },
    { id: "happiness", label: "Happiness", value: scores.happiness },
    { id: "money", label: "Financial security", value: scores.money },
  ];
}

export function cloneSetup(selection: SetupSelection = DEFAULT_SETUP): SetupSelection {
  return { ...selection, appearance: { ...selection.appearance } };
}

export function cloneSettings(settings: VisualSettings = DEFAULT_SETTINGS): VisualSettings {
  // Must project, not spread. Callers pass the wider `PlayerPreferences` (which
  // is assignable to `VisualSettings`, so the compiler is happy), and a bare
  // spread carried `schemaVersion`, `assistMode`, and `audioCuesEnabled`
  // through. `browser-shell.copyValidSettings` requires *exactly* these four
  // keys, so every extra key made `saveSettings` return `kind: "invalid"` and
  // republish the previous settings — accessibility changes silently reverted.
  return {
    highContrast: settings.highContrast,
    reducedMotion: settings.reducedMotion,
    screenReaderAnnouncements: settings.screenReaderAnnouncements,
    textScale: settings.textScale,
  };
}
