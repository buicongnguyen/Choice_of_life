import { addFlags, applyEffects, bond, has, pendingRecoveries, RECOVERY_LEVEL } from "../life";
import type { Effects, LifeState, ScoreKey } from "../types";
import { CHAPTERS, FINALE } from "./chapters";
import { activeEncounters } from "./encounters";
import { resolve, type EncounterDef, type Line, type OptionDef } from "./model";

export const STAR_BONUS = 1;

export interface OptionView {
  option: OptionDef;
  id: string;
  label: string;
  detail: string;
  effects: Effects;
  hint?: string;
  because?: string;
  locked?: string;
  star: boolean;
}

export function isStarred(option: OptionDef, s: LifeState): boolean {
  if (!option.star) return false;
  if (typeof option.star === "function") return option.star(s);
  const heart = s.dream ?? s.spark;
  return !!heart && option.star.includes(heart);
}

export function optionViews(encounter: EncounterDef, s: LifeState): OptionView[] {
  return encounter.options
    .filter((o) => !o.when || o.when(s))
    .map((o) => {
      const effects = resolve(o.effects, s);
      return {
        option: o,
        id: o.id,
        label: resolve(o.label, s),
        detail: resolve(o.detail, s),
        effects,
        hint: o.hint ? resolve(o.hint, s) : undefined,
        because: o.because ? resolve(o.because, s) || undefined : undefined,
        locked: o.lock?.(s) ?? undefined,
        star: isStarred(o, s),
      };
    });
}

export interface ChoiceOutcome {
  delta: Record<ScoreKey, number>;
  lines: Line[];
  star: boolean;
}

/** Applies a choice (idempotent per encounter) and returns what happened. */
export function choose(s: LifeState, encounter: EncounterDef, optionId: string): ChoiceOutcome {
  if (s.resolved.includes(encounter.id)) throw new Error(`Encounter ${encounter.id} already resolved`);
  const view = optionViews(encounter, s).find((v) => v.id === optionId);
  if (!view) throw new Error(`Option ${optionId} is not available in ${encounter.id}`);
  if (view.locked) throw new Error(`Option ${optionId} is locked: ${view.locked}`);
  const effects: Effects = { ...view.effects };
  if (view.star) effects.happiness = (effects.happiness ?? 0) + STAR_BONUS;
  const kind = encounter.kind === "event" ? "event" : "choice";
  const delta = applyEffects(s, effects, kind);
  s.resolved.push(encounter.id);
  if (encounter.kind !== "event") {
    s.choices.push({ chapter: s.chapter, encounter: encounter.id, option: optionId, memory: effects.memory });
  }
  const lines = [...resolve(view.option.result, s), ...(encounter.after ? resolve(encounter.after, s) : [])];
  return { delta, lines, star: view.star };
}

export function nextEncounter(s: LifeState): EncounterDef | undefined {
  return activeEncounters(s).find((e) => !s.resolved.includes(e.id));
}

/** What your work years add to financial security as a chapter begins. */
export function incomeFor(s: LifeState, index: number): number {
  if (index === 5) {
    if (has(s, "own_venture")) return 3;
    if (s.path === "shop") return 4;
    return 6;
  }
  if (index === 6) return has(s, "northport") || has(s, "top") ? 7 : 4;
  if (index === 7) return has(s, "top") || has(s, "northport") ? 6 : 4;
  return 0;
}

/** Enter a chapter: ageing drift and work income apply once, on entry. */
export function startChapter(s: LifeState, index: number): Record<ScoreKey, number> {
  s.chapter = index;
  s.resolved = [];
  const drift = CHAPTERS[index].drift ?? {};
  return applyEffects(s, { ...drift, money: (drift.money ?? 0) + incomeFor(s, index) }, "event");
}

/** Deterministic consequences resolved when a chapter closes. */
export function closeChapter(s: LifeState): string[] {
  const chapter = CHAPTERS[s.chapter];
  if (s.chapter === 6 && !has(s, "saved_light") && !has(s, "own_light") && bond(s, "juno") >= 9) {
    addFlags(s, ["juno_saved_light"]);
    s.memories.push({ chapter: 6, kind: "event", text: "Juno saved the lighthouse with a megaphone and a website." });
  }
  if (s.chapter === 3) addFlags(s, ["light_dark"]);
  // Losses the story narrates at a chapter's close cost something too.
  if (s.chapter === 4 && has(s, "biscuit")) applyEffects(s, { happiness: -4, memory: "Biscuit's goodbye." }, "event");
  if (s.chapter === 7) applyEffects(s, { happiness: -5, memory: "The year Mom and Dad went, eight months apart." }, "event");
  return chapter.outro ? resolve(chapter.outro, s) : [];
}

export function advance(s: LifeState): number {
  const next = Math.min(FINALE, s.chapter + 1);
  if (s.chapter === FINALE) s.finished = true;
  return next;
}

// --------------------------------------------------------------------------- recovery
export interface Recovery {
  score: ScoreKey;
  title: string;
  text: string;
  rescuer: string;
}

function rescuerFor(s: LifeState, score: ScoreKey): string {
  const partner = has(s, "partner") ? "Sam" : null;
  const juno = bond(s, "juno") >= 7 && s.chapter >= 4 ? "Juno" : null;
  const parent = s.chapter < 7 ? (score === "money" ? "Dad" : "Mom") : null;
  if (s.chapter <= 3) return score === "money" ? "Dad" : "Mom";
  return partner ?? juno ?? parent ?? "Your neighbour, Mrs Achebe";
}

/** A score at zero is never game over: someone steps in once per chapter. */
export function recover(s: LifeState): Recovery | undefined {
  const score = pendingRecoveries(s)[0];
  if (!score) return undefined;
  const who = rescuerFor(s, score);
  s.recoveries.push(`${s.chapter}:${score}`);
  const text = {
    health: `You collapse halfway through an ordinary day. ${who} gets you to a doctor, then to bed, then to a sensible routine. It takes a month.`,
    happiness: `Everything goes grey for a while. ${who} turns up with terrible snacks and refuses to leave until you laugh.`,
    money: `The account hits zero. ${who} lends you money they don't really have, and won't take it back.`,
  }[score];
  const title = { health: "Running on Empty", happiness: "Grey Days", money: "Broke" }[score];
  s.scores[score] = RECOVERY_LEVEL;
  const side: Effects = score === "health" ? { money: -4 } : score === "happiness" ? { health: -2 } : { happiness: -3 };
  applyEffects(s, { ...side, memory: `${title}: ${who} stepped in.` }, "recovery");
  return { score, title, text, rescuer: who };
}

// --------------------------------------------------------------------------- collectibles
export function collectKeepsake(s: LifeState, index: number): string | undefined {
  const text = CHAPTERS[s.chapter].keepsakes[index];
  const id = `${s.chapter}:${index}`;
  if (!text || s.keepsakes.includes(id)) return undefined;
  s.keepsakes.push(id);
  applyEffects(s, { happiness: 3, memory: text }, "keepsake");
  return text;
}

export const JUNO_LETTERS = [
  "Brightwater has a thousand people on every street and not one of them knows about the tide pools.",
  "My new school has a machine that sells soup. SOUP. In a CAN. From a MACHINE.",
  "Mum says I have to stop signing my letters “your prisoner”. Love, your prisoner.",
  "I saw the sea from the top of the car park. It's the wrong colour here. Tell yours I said hi.",
  "Enclosed: one pressed flower and one terrible drawing of you. Keep both.",
  "I got a job! It's terrible! I love it!",
  "Don't you dare stop writing when you're famous.",
  "Still counting down to seventy. It's a lot of years. I'm very patient. (I'm not.)",
];

export function collectLetter(s: LifeState): string {
  const text = JUNO_LETTERS[s.stats.letters % JUNO_LETTERS.length];
  s.stats.letters += 1;
  applyEffects(s, { happiness: 2, bonds: { juno: s.stats.letters % 4 === 0 ? 1 : 0 } }, "letter");
  if (s.stats.letters === 1) s.memories.push({ chapter: s.chapter, kind: "letter", text: `Juno's first letter: “${text}”` });
  return text;
}

/** Small good things add up: every sixth pickup of a kind is worth one point. */
export const PICKUPS_PER_POINT = 6;
export const HAZARD_COST = 2;

export function runnerPickup(s: LifeState, score: ScoreKey): { delta: Record<ScoreKey, number>; meter: number } {
  s.stats.pickups += 1;
  const meter = (s.meters[score] ?? 0) + 1;
  if (meter >= PICKUPS_PER_POINT) {
    s.meters[score] = 0;
    return { delta: applyEffects(s, { [score]: 1 }, "event"), meter: PICKUPS_PER_POINT };
  }
  s.meters[score] = meter;
  return { delta: { health: 0, happiness: 0, money: 0 }, meter };
}

export function runnerHit(s: LifeState, score: ScoreKey) {
  s.stats.bumps += 1;
  return applyEffects(s, { [score]: -HAZARD_COST }, "event");
}

export function runnerStreak(s: LifeState, count: number) {
  s.stats.bestStreak = Math.max(s.stats.bestStreak, count);
  const lowest = (["health", "happiness", "money"] as ScoreKey[]).reduce((a, b) => (s.scores[b] < s.scores[a] ? b : a));
  return applyEffects(s, { [lowest]: 1 }, "event");
}
