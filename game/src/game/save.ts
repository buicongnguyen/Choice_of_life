import { SCORE_KEYS, type LifeState } from "./types";

/** New namespace: the 1.x saves (choice-of-life-v1-*) are left untouched. */
export const SAVE_KEY = "choice-of-life-2:life";
export const PREFS_KEY = "choice-of-life-2:prefs";

export interface Prefs {
  volume: number;
  music: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  quality: "high" | "low";
}

export const DEFAULT_PREFS: Prefs = { volume: 0.7, music: true, reducedMotion: false, largeText: false, quality: "high" };

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function serialise(state: LifeState): string {
  return JSON.stringify(state);
}

/** Returns a valid life or null; never throws on corrupt or foreign data. */
export function deserialise(raw: string | null): LifeState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<LifeState>;
    if (data?.version !== 2 || typeof data.name !== "string" || typeof data.chapter !== "number") return null;
    if (!data.scores || !SCORE_KEYS.every((k) => typeof data.scores![k] === "number")) return null;
    if (!Array.isArray(data.flags) || !Array.isArray(data.choices) || !Array.isArray(data.resolved)) return null;
    return data as LifeState;
  } catch {
    return null;
  }
}

export function saveLife(state: LifeState, store: Store | null = storage()): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serialise(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLife(store: Store | null = storage()): LifeState | null {
  if (!store) return null;
  try {
    return deserialise(store.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function clearLife(store: Store | null = storage()) {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function loadPrefs(store: Store | null = storage()): Prefs {
  try {
    const raw = store?.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs, store: Store | null = storage()) {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}
