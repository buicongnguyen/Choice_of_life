import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
  LifeOption,
  OptionCategory,
  Stats,
} from "./types";

// ---------------------------------------------------------------------------
// Biography mode: turn the game into a tool for telling a REAL life story.
// A Biography reuses the twelve life chapters (newborn → retirement) but lets
// the author rename each chapter and fill it with custom "moments" — the things
// that actually happened — which become the walk-up stations when you replay it.
// You can author one by hand, or RECORD a normal playthrough and save it. Stored
// in localStorage so families can keep and re-live them.
// ---------------------------------------------------------------------------

/** One authored chapter: an optional custom title + the moments that happened. */
export interface BioChapter {
  title?: string;
  moments: LifeOption[];
}

export interface Biography {
  id: string;
  /** The person this life belongs to. */
  name: string;
  gender: Gender;
  heritage: HeritageStyle;
  appearance: CharacterAppearanceId;
  /** A subtitle, e.g. "My grandfather · 1938–2016". */
  subtitle: string;
  /** Custom chapters keyed by the default stage id (newborn, toddler, …). */
  chapters: Record<string, BioChapter>;
  createdAt: number;
}

const KEY = "choice-of-life-v1-biographies";

/**
 * Coerce one loaded biography into a guaranteed-valid shape. localStorage is
 * untrusted (entries can be hand-edited, imported/shared between people, or left
 * over from an older schema), so every consumer — bioMomentCount, the replay path
 * and the author view — must be able to assume `chapters` is a plain object and
 * every `chapter.moments` is an array of objects, or they throw uncaught. Field
 * values are still HTML-escaped at the render sinks; this only fixes the SHAPE.
 */
function normalizeBio(b: unknown): Biography | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const srcChapters =
    o.chapters && typeof o.chapters === "object" && !Array.isArray(o.chapters)
      ? (o.chapters as Record<string, unknown>)
      : {};
  const chapters: Record<string, BioChapter> = {};
  for (const k of Object.keys(srcChapters)) {
    const c = srcChapters[k] as Record<string, unknown> | null;
    const moments =
      c && Array.isArray(c.moments)
        ? (c.moments.filter((m) => m && typeof m === "object") as LifeOption[])
        : [];
    chapters[k] = { ...(c && typeof c.title === "string" ? { title: c.title } : {}), moments };
  }
  const heritage: HeritageStyle =
    o.heritage === "asian" ||
    o.heritage === "middleEastern" ||
    o.heritage === "black"
      ? o.heritage
      : "western";
  return {
    id: String(o.id ?? ""),
    name: String(o.name ?? ""),
    gender: o.gender === "female" ? "female" : "male",
    heritage,
    appearance:
      o.appearance === "alternate" ? "alternate" : "classic",
    subtitle: String(o.subtitle ?? ""),
    chapters,
    createdAt: Number(o.createdAt) || 0,
  };
}

export function listBios(): Biography[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeBio).filter((b): b is Biography => b !== null);
  } catch {
    return [];
  }
}

export function saveBio(b: Biography): void {
  const all = listBios().filter((x) => x.id !== b.id);
  all.unshift(b);
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
  } catch {
    /* storage full / unavailable — fail quietly */
  }
}

export function deleteBio(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listBios().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
}

export function getBio(id: string): Biography | null {
  return listBios().find((x) => x.id === id) ?? null;
}

/** Whether a biography has any authored content (so empty drafts can be hidden). */
export function bioMomentCount(b: Biography): number {
  return Object.values(b.chapters).reduce((n, c) => n + c.moments.length, 0);
}

/**
 * The "vibe" presets the author picks from for each moment. They set the icon,
 * the meter effects and any money change — the author just adds the words.
 */
export interface MomentPreset {
  key: string;
  label: string;
  emoji: string;
  category: OptionCategory;
  effects: Partial<Stats>;
  earn?: number;
}

export const MOMENT_PRESETS: MomentPreset[] = [
  { key: "joy", label: "A joyful time", emoji: "😊", category: "fun", effects: { happiness: 10, fun: 6 } },
  { key: "health", label: "Fit & active", emoji: "💪", category: "health", effects: { health: 10 } },
  { key: "learn", label: "Learned / studied", emoji: "🧠", category: "smarts", effects: { smarts: 4, happiness: 2 } },
  { key: "love", label: "Family & friends", emoji: "❤️", category: "social", effects: { happiness: 9, health: 3 } },
  { key: "milestone", label: "A proud milestone", emoji: "🏆", category: "special", effects: { happiness: 8, smarts: 2 } },
  { key: "hardship", label: "A hard time", emoji: "🌧️", category: "special", effects: { happiness: -8, health: -5 } },
  { key: "earn", label: "Earned money", emoji: "💰", category: "wealth", effects: { happiness: 2 }, earn: 25000 },
  { key: "loss", label: "A costly time", emoji: "💸", category: "wealth", effects: { happiness: -4 }, earn: -12000 },
  { key: "memory", label: "Just a memory", emoji: "📌", category: "special", effects: {} },
];

export function presetByKey(key: string): MomentPreset {
  return MOMENT_PRESETS.find((p) => p.key === key) ?? MOMENT_PRESETS[MOMENT_PRESETS.length - 1];
}

/** Build a moment (a replayable station) from a preset + the author's words. */
export function makeMoment(idSeed: string, text: string, presetKey: string): LifeOption {
  const p = presetByKey(presetKey);
  const label = text.length > 16 ? text.slice(0, 15).trimEnd() + "…" : text || p.label;
  return {
    id: "bm_" + idSeed,
    label,
    icon: p.emoji,
    desc: text || p.label,
    category: p.category,
    effects: { ...p.effects },
    ...(p.earn ? { earn: p.earn } : {}),
    storyTag: "bio_moment",
  };
}

/** A fresh, empty biography draft. */
export function newBiography(idSeed: string, gender: Gender = "male"): Biography {
  return {
    id: "bio_" + idSeed,
    name: "",
    gender,
    heritage: "western",
    appearance: "classic",
    subtitle: "",
    chapters: {},
    createdAt: 0,
  };
}
