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

/** One honest line per score that's very low or very high, for the chapter summary. */
export function statusLines(s: LifeState): string[] {
  const lines: string[] = [];
  const { health, happiness, money } = s.scores;
  // Only promise what the next chapter can deliver: the last one before the lighthouse has no choices ahead.
  const more = s.chapter < 7;
  const noticed = s.chapter === 3 || s.chapter === 4;
  if (health < 30) lines.push(more ? "Your body is keeping score. Look after it next chapter." : "Your body is tired. It has carried you a long way.");
  else if (health > 78) lines.push("You feel strong. Stairs are nothing.");
  if (happiness < 30) lines.push(noticed ? "The days have been grey. Someone will notice, if you let them." : "The days have been grey. Be gentle with yourself.");
  else if (happiness > 80) lines.push("You catch yourself humming.");
  if (money < 20) lines.push(more ? "Money is tight. Some choices will cost more than you can pay." : "Money was tight. It mattered less than you feared.");
  else if (money > 80) lines.push("For once, the bills aren't the worry.");
  return lines;
}

/** How things stand with the people who matter, for the journal. */
export function peopleSoFar(s: LifeState): { name: string; hearts: number; note: string }[] {
  const hearts = (b: number) => (b <= 0 ? 0 : b <= 3 ? 1 : b <= 7 ? 2 : b <= 11 ? 3 : 4);
  const out: { name: string; hearts: number; note: string }[] = [];
  const nearby = has(s, "parents_with_us") ? "Living with you, and the football arguments." : s.path === "shop" && s.chapter >= 4 ? "Just down the lane." : "Always at the end of the phone.";
  out.push({ name: "Mom and Dad", hearts: Math.max(1, hearts(s.bonds.family)), note: s.chapter >= 8 ? "Gone, and not gone." : has(s, "moved_home") ? "You came home for them." : s.chapter <= 3 ? "Home." : nearby });
  if (s.chapter >= 2) out.push({ name: "Nana Pearl", hearts: 3, note: has(s, "nana_gone") ? "Her light went out. You still hear her stories." : "Keeper of the light." });
  if (s.chapter >= 2 && s.resolved.concat(s.choices.map((c) => c.encounter)).includes("new-kid")) {
    out.push({ name: "Juno", hearts: hearts(s.bonds.juno), note: s.bonds.juno >= 9 ? "Your oldest friend. The promise holds." : s.bonds.juno >= 5 ? "Further away than you'd like." : "You've drifted. It isn't too late." });
  }
  if (has(s, "biscuit")) out.push({ name: "Biscuit", hearts: 3, note: s.chapter >= 5 ? "Gone. You still look for him at the door." : "One ear up, one ear down. Fetches everything." });
  if (s.chapter >= 3 && s.choices.some((c) => c.encounter === "the-answers")) {
    out.push({ name: "Dex", hearts: hearts(s.bonds.dex), note: has(s, "forgave_dex") ? "Forgiven." : s.bonds.dex < 0 ? "Some roads don't cross back." : "Still selling something." });
  }
  if (has(s, "mentor")) out.push({ name: "Ms Okafor", hearts: Math.max(1, hearts(s.bonds.okafor)), note: "Saw you bend the straight lines." });
  if (s.chapter >= 4 && has(s, "met_sam")) out.push({ name: "Sam", hearts: has(s, "sam_left") ? 0 : Math.max(1, hearts(s.bonds.sam)), note: has(s, "partner") ? (has(s, "kids") ? "Your partner, and Mika's other parent." : "Your partner.") : "The one under the small umbrella." });
  return out;
}

export function nextEncounter(s: LifeState): EncounterDef | undefined {
  return activeEncounters(s).find((e) => !s.resolved.includes(e.id));
}

/** What your work years add to financial security as a chapter begins. */
export function incomeFor(s: LifeState, index: number): number {
  if (index === 5) return s.path === "shop" ? 4 : 6;
  if (index === 6) return has(s, "northport") || has(s, "top") ? 7 : has(s, "own_venture") ? 5 : 4;
  if (index === 7) return has(s, "top") || has(s, "northport") ? 6 : 4;
  return 0;
}

/** Enter a chapter: ageing drift and work income apply once, on entry. */
export function startChapter(s: LifeState, index: number): Record<ScoreKey, number> {
  s.chapter = index;
  s.resolved = [];
  s.progress = undefined;
  const drift = CHAPTERS[index].drift ?? {};
  const delta = applyEffects(s, { ...drift, money: (drift.money ?? 0) + incomeFor(s, index) }, "event");
  s.started = index;
  if (s.chapterStart) s.previousStart = { ...s.chapterStart };
  s.chapterStart = { ...s.scores };
  return delta;
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
  // After Mom's stroke (chapter 6) it's Dad who comes; by chapter 7 they are both gone.
  const momAble = s.chapter < 6 || (s.chapter === 6 && !s.resolved.includes("the-call"));
  const parent = s.chapter < 7 ? (score === "money" || !momAble ? "Dad" : "Mom") : null;
  if (s.chapter <= 3) return score === "money" ? "Dad" : "Mom";
  return partner ?? juno ?? parent ?? "Mrs Achebe from next door";
}

/** A score at zero is never game over: someone steps in once per chapter. */
export function recover(s: LifeState): Recovery | undefined {
  const score = pendingRecoveries(s)[0];
  if (!score) return undefined;
  const who = rescuerFor(s, score);
  s.recoveries.push(`${s.chapter}:${score}`);
  const child = s.chapter <= 3;
  const text = (
    child
      ? {
          health: `You come down with something nasty and spend a week in bed. ${who} reads to you every night until you're better.`,
          happiness: `A bad week, the kind that feels like a year. ${who} lets you stay up late on the harbour wall until you feel like yourself again.`,
          money: `Your piggy bank is empty and the school trip is on Friday. ${who} quietly pays for it and never mentions it again.`,
        }
      : {
          health: `You collapse halfway through an ordinary day. ${who} gets you to a doctor, then to bed, then to a sensible routine. It takes a month.`,
          happiness: `Everything goes grey for a while. ${who} turns up with terrible snacks and refuses to leave until you laugh.`,
          money: `The account hits zero. ${who} lends you money from a jar marked RAINY DAY, and won't take it back.`,
        }
  )[score];
  const title = { health: "Running on Empty", happiness: "Grey Days", money: "Broke" }[score];
  s.scores[score] = RECOVERY_LEVEL;
  const side: Effects = score === "health" ? { money: -4 } : score === "happiness" ? { health: -2 } : { happiness: -3 };
  applyEffects(s, { ...side, memory: `${title}: ${who} stepped in.` }, "recovery");
  return { score, title, text, rescuer: who };
}

// --------------------------------------------------------------------------- collectibles
/** A keepsake lifts whichever score needs it most (a memory is what gets you through). */
export function collectKeepsake(s: LifeState, index: number): { text: string; score: ScoreKey } | undefined {
  const text = CHAPTERS[s.chapter].keepsakes[index];
  const id = `${s.chapter}:${index}`;
  if (!text || s.keepsakes.includes(id)) return undefined;
  s.keepsakes.push(id);
  const score = lowestScore(s);
  applyEffects(s, { [score]: 1, memory: text }, "keepsake");
  return { text, score };
}

export function lowestScore(s: LifeState): ScoreKey {
  return (["health", "happiness", "money"] as ScoreKey[]).reduce((a, b) => (s.scores[b] < s.scores[a] ? b : a));
}

/** Four letters in chapter 3 (school years) and four in chapter 4 (the city), by position. */
export const JUNO_LETTERS: Record<number, string[]> = {
  3: [
    "Brightwater has a thousand people on every street and not one of them knows about the tide pools.",
    "My new school has a machine that sells soup. SOUP. In a CAN. From a MACHINE.",
    "Mum says I have to stop signing my letters “your prisoner”. Love, your prisoner.",
    "Enclosed: one pressed flower and one terrible drawing of you. Keep both.",
  ],
  4: [
    "I got a fourth job! It's terrible! I love it!",
    "I saw the sea from the top of the car park. It's the wrong colour here. Tell yours I said hi.",
    "Don't you dare stop writing when you're famous.",
    "Still counting down to seventy. It's a lot of years. I'm very patient. (I'm not.)",
  ],
};

export function collectLetter(s: LifeState, slot: number): string {
  const list = JUNO_LETTERS[s.chapter] ?? JUNO_LETTERS[3];
  const text = list[Math.max(0, Math.min(list.length - 1, slot))];
  s.stats.letters += 1;
  applyEffects(s, { happiness: 1, bonds: { juno: s.stats.letters % 4 === 0 ? 1 : 0 } }, "letter");
  if (s.stats.letters === 1) s.memories.push({ chapter: s.chapter, kind: "letter", text: `Juno's first letter: “${text}”` });
  return text;
}

/** Letters stop once Juno is living on your sofa (she's right there). */
export function lettersActive(s: LifeState): boolean {
  return has(s, "letters") && !has(s, "juno_sofa");
}

/** Small good things add up: every seventh pickup of a kind is worth one point. */
export const PICKUPS_PER_POINT = 7;
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

/** Low hazards (you could have jumped) sting a little; tall ones (you had to dodge) cost more. */
export function hazardCost(kind: "low" | "tall"): number {
  return kind === "tall" ? HAZARD_COST : 1;
}

export function runnerHit(s: LifeState, score: ScoreKey, kind: "low" | "tall" = "tall") {
  s.stats.bumps += 1;
  return applyEffects(s, { [score]: -hazardCost(kind) }, "event");
}

export function runnerStreak(s: LifeState, count: number) {
  s.stats.bestStreak = Math.max(s.stats.bestStreak, count);
  return applyEffects(s, { [lowestScore(s)]: 1 }, "event");
}
