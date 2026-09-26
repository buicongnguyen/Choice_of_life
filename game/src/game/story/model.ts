import type { Dream, Effects, LifeState, ScoreKey } from "../types";

export type PersonId =
  | "you"
  | "mom"
  | "dad"
  | "nana"
  | "juno"
  | "dex"
  | "okafor"
  | "hale"
  | "sam"
  | "lina"
  | "biscuit"
  | "mika"
  | "pip"
  | "ada"
  | "doctor";

export interface Line {
  who: PersonId | "narrator";
  text: string;
}

/** Most story text can depend on the life so far. */
export type Dyn<T> = T | ((s: LifeState) => T);
export const resolve = <T>(value: Dyn<T>, s: LifeState): T =>
  typeof value === "function" ? (value as (s: LifeState) => T)(s) : value;

export interface OptionDef {
  id: string;
  label: Dyn<string>;
  detail: Dyn<string>;
  effects: Dyn<Effects>;
  /** What happens next, shown after choosing. */
  result: Dyn<Line[]>;
  /** A fair, qualitative hint about the future. */
  hint?: Dyn<string>;
  /** Hidden unless true (earned options, like Juno's help). */
  when?: (s: LifeState) => boolean;
  /** Visible but disabled with this reason. */
  lock?: (s: LifeState) => string | null;
  /** Names the earlier choice that made this option possible. */
  because?: Dyn<string>;
  /** Marked ★ when it matches your spark (before ch. 2's tin) or your dream. */
  star?: readonly Dream[] | ((s: LifeState) => boolean);
}

export type EncounterKind = "choice" | "event" | "keystone";

export interface EncounterDef {
  id: string;
  chapter: number;
  /** Position along the chapter course, 0..1. */
  at: number;
  kind: EncounterKind;
  title: Dyn<string>;
  /** Who stands in the lane to meet you, and who else is in the shot. */
  speaker: Dyn<PersonId | null>;
  cast?: Dyn<PersonId[]>;
  when?: (s: LifeState) => boolean;
  lines: Dyn<Line[]>;
  prompt?: Dyn<string>;
  options: OptionDef[];
  /** Shown after whichever option was taken. */
  after?: Dyn<Line[]>;
}

export type PlaceId =
  | "home"
  | "garden"
  | "harbour"
  | "cliff"
  | "coast"
  | "station"
  | "city"
  | "storm_city"
  | "storm_harbour"
  | "festival"
  | "dusk_cliff";

export type SkyId = "morning" | "noon" | "golden" | "city_morning" | "city_noon" | "storm" | "sunset" | "dusk";
export type AgeKey = "baby" | "toddler" | "child" | "teen" | "adult" | "elder";
export type MoveMode = "crawl" | "toddle" | "run" | "bike" | "walk";

export interface HazardDef {
  model: string;
  kind: "low" | "tall";
  score: ScoreKey;
  label: string;
}

export interface StageDef {
  from: number;
  age: AgeKey;
  mode: MoveMode;
}

export interface ChapterDef {
  index: number;
  id: string;
  number: string;
  title: string;
  ages: [number, number];
  subtitle: Dyn<string>;
  intro: Dyn<string>;
  length: number;
  speed: number;
  places: Dyn<{ from: number; place: PlaceId }[]>;
  sky: SkyId;
  stages: StageDef[];
  hazards: HazardDef[];
  /** Hazard rows per 100 m at the standard assist level. */
  density: number;
  keepsakes: [string, string, string];
  letters?: boolean;
  wind?: boolean;
  drift?: Partial<Record<ScoreKey, number>>;
  music: string;
  /** Narration after the last encounter (deaths, fates, time passing). */
  outro?: Dyn<string[]>;
}
