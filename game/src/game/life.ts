import {
  BOND_KEYS,
  SCORE_KEYS,
  type Assist,
  type BondKey,
  type Career,
  type Effects,
  type LifeState,
  type Look,
  type MemoryKind,
  type Pronoun,
  type ScoreKey,
} from "./types";

export const START_SCORES = { health: 60, happiness: 60, money: 40 } as const;
export const RECOVERY_LEVEL = 30;

export interface NewLife {
  name: string;
  pronoun: Pronoun;
  look: Look;
  assist?: Assist;
  seed?: number;
}

export function createLife(input: NewLife): LifeState {
  return {
    version: 2,
    seed: (input.seed ?? Date.now()) >>> 0,
    name: cleanName(input.name),
    pronoun: input.pronoun,
    look: { ...input.look },
    assist: input.assist ?? "standard",
    scores: { ...START_SCORES },
    bonds: { juno: 0, family: 0, sam: 0, dex: 0, okafor: 0 },
    flags: [],
    chapter: 0,
    resolved: [],
    choices: [],
    memories: [],
    keepsakes: [],
    recoveries: [],
    stats: { pickups: 0, bumps: 0, jumps: 0, letters: 0, bestStreak: 0 },
    meters: { health: 0, happiness: 0, money: 0 },
    finished: false,
  };
}

export function cleanName(name: string): string {
  const trimmed = name.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  return trimmed || "Kai";
}

export const clampScore = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function has(state: LifeState, flag: string): boolean {
  return state.flags.includes(flag);
}

export function addFlags(state: LifeState, flags: readonly string[]): void {
  const set = new Set(state.flags);
  for (const f of flags) set.add(f);
  state.flags = [...set].sort();
}

/** Applies effects in place and returns the actual score deltas after clamping. */
export function applyEffects(
  state: LifeState,
  effects: Effects,
  memoryKind: MemoryKind = "choice",
): Record<ScoreKey, number> {
  const delta = { health: 0, happiness: 0, money: 0 };
  for (const key of SCORE_KEYS) {
    const change = effects[key];
    if (!change) continue;
    const before = state.scores[key];
    state.scores[key] = clampScore(before + change);
    delta[key] = state.scores[key] - before;
  }
  if (effects.bonds) {
    for (const key of BOND_KEYS) {
      const change = effects.bonds[key];
      if (change) state.bonds[key] += change;
    }
  }
  if (effects.flags?.length) addFlags(state, effects.flags);
  if (effects.spark) state.spark = effects.spark;
  if (effects.dream) state.dream = effects.dream;
  if (effects.path) state.path = effects.path;
  if (effects.memory) state.memories.push({ chapter: state.chapter, kind: memoryKind, text: effects.memory });
  return delta;
}

/** Scores that just hit zero and have not been rescued in this chapter yet. */
export function pendingRecoveries(state: LifeState): ScoreKey[] {
  return SCORE_KEYS.filter(
    (key) => state.scores[key] <= 0 && !state.recoveries.includes(`${state.chapter}:${key}`),
  );
}

export function careerFor(state: Pick<LifeState, "path" | "dream">): Career | undefined {
  switch (state.path) {
    case "apprentice":
      return "shipwright";
    case "shop":
      return "boatwright";
    case "travel":
      return "travel writer";
    case "uni":
      return (
        { healer: "doctor", maker: "engineer", storyteller: "journalist", explorer: "marine biologist" } as const
      )[state.dream ?? "healer"];
    default:
      return undefined;
  }
}

/** Does the career answer the dream the eleven-year-old put in the tin? */
export function careerMatchesDream(state: Pick<LifeState, "path" | "dream">): boolean {
  const career = careerFor(state);
  if (!career || !state.dream) return false;
  const matches: Record<string, Career[]> = {
    healer: ["doctor"],
    maker: ["engineer", "shipwright", "boatwright"],
    storyteller: ["journalist", "travel writer"],
    explorer: ["marine biologist", "travel writer"],
  };
  return matches[state.dream].includes(career);
}

export type LightState = "lit" | "dark";

export function lighthouseLit(state: LifeState): boolean {
  return has(state, "saved_light") || has(state, "own_light") || has(state, "juno_saved_light");
}

export function bond(state: LifeState, key: BondKey): number {
  return state.bonds[key];
}

// --------------------------------------------------------------------------- text
export function pronouns(p: Pronoun) {
  return {
    she: { subj: "she", obj: "her", poss: "her", self: "herself", kid: "girl", grown: "woman" },
    he: { subj: "he", obj: "him", poss: "his", self: "himself", kid: "boy", grown: "man" },
    they: { subj: "they", obj: "them", poss: "their", self: "themself", kid: "kid", grown: "person" },
  }[p];
}

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
