// Shared vocabulary for the pure game logic. Nothing in src/game imports the DOM or Three.js.

export type ScoreKey = "health" | "happiness" | "money";
export type Scores = Record<ScoreKey, number>;
export const SCORE_KEYS: readonly ScoreKey[] = ["health", "happiness", "money"];

/** People whose relationship with you is tracked. */
export type BondKey = "juno" | "family" | "sam" | "dex" | "okafor";
export const BOND_KEYS: readonly BondKey[] = ["juno", "family", "sam", "dex", "okafor"];

export type Dream = "healer" | "maker" | "storyteller" | "explorer";
export const DREAMS: readonly Dream[] = ["healer", "maker", "storyteller", "explorer"];

export type LifePath = "uni" | "apprentice" | "shop" | "travel";
export type Career =
  | "doctor"
  | "engineer"
  | "journalist"
  | "marine biologist"
  | "shipwright"
  | "boatwright"
  | "travel writer";

export type Pronoun = "she" | "he" | "they";
export type Assist = "relaxed" | "standard" | "brisk";

export type HairStyle =
  | "short"
  | "spiky"
  | "buzz"
  | "bob"
  | "long"
  | "ponytail"
  | "pigtails"
  | "bun"
  | "curly";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Favourite colour: drives the protagonist's clothes across every age. */
  colour: string;
}

/** Everything a choice, event, pickup or recovery can change. */
export interface Effects {
  health?: number;
  happiness?: number;
  money?: number;
  bonds?: Partial<Record<BondKey, number>>;
  flags?: string[];
  spark?: Dream;
  dream?: Dream;
  path?: LifePath;
  memory?: string;
}

export type MemoryKind = "choice" | "event" | "keepsake" | "recovery" | "letter";
export interface Memory {
  chapter: number;
  kind: MemoryKind;
  text: string;
}

export interface ChoiceRecord {
  chapter: number;
  encounter: string;
  option: string;
  /** The line this choice left in the journal, if any. */
  memory?: string;
}

export interface RunStats {
  pickups: number;
  bumps: number;
  jumps: number;
  letters: number;
  bestStreak: number;
}

export interface LifeState {
  version: 2;
  seed: number;
  name: string;
  pronoun: Pronoun;
  look: Look;
  assist: Assist;
  scores: Scores;
  bonds: Record<BondKey, number>;
  /** Sorted, unique story facts. */
  flags: string[];
  spark?: Dream;
  dream?: Dream;
  path?: LifePath;
  /** Index into CHAPTERS. */
  chapter: number;
  /** Encounters resolved in the current chapter (for resuming mid-chapter). */
  resolved: string[];
  choices: ChoiceRecord[];
  memories: Memory[];
  keepsakes: string[];
  /** `${chapter}:${score}` for recoveries already used. */
  recoveries: string[];
  stats: RunStats;
  /** Pickups collected toward the next point, per score. */
  meters: Record<ScoreKey, number>;
  /** The chapter whose entry effects (drift, income) have been applied, and the scores then. */
  started?: number;
  chapterStart?: Scores;
  /** Where the runner was at the last mid-chapter save, and what it had already taken. */
  progress?: { chapter: number; x: number; collected: number[] };
  finished: boolean;
}
