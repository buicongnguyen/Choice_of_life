import type { StatKey, Stats } from "./types";

// ---------------------------------------------------------------------------
// Stat model + the research-grounded relationships between indices.
// See DESIGN.md "Balance model" for the sources behind these numbers.
//
// The four meters are Health, Happiness, Fun (all 0..100) and IQ (the "smarts"
// key, on a 40..160 scale). MONEY is NOT a meter — it's a real dollar amount
// tracked separately by the engine and can grow without limit.
// ---------------------------------------------------------------------------

export const STAT_KEYS: StatKey[] = ["health", "happiness", "fun", "smarts"];

export const STAT_META: Record<
  StatKey,
  { label: string; icon: string; color: string }
> = {
  health: { label: "Health", icon: "❤️", color: "#ff5d6c" },
  happiness: { label: "Happy", icon: "😊", color: "#ffd23f" },
  fun: { label: "Fun", icon: "🎉", color: "#ff8fd0" },
  smarts: { label: "IQ", icon: "🧠", color: "#5db8ff" },
};

// IQ scale: mean 100, SD 15, gifted 130+, game range 40..160; a newborn ~60.
export const IQ_MIN = 40;
export const IQ_MAX = 160;
export const IQ_START = 60;

/** Everyone starts here. Healthy-ish, happy, playful, with a newborn's IQ of 60. */
export const START_STATS: Stats = {
  health: 72,
  happiness: 68,
  fun: 62,
  smarts: IQ_START,
};

/** Money is a real dollar amount; you start with nothing. */
export const START_MONEY = 0;

// --- Health as a composite --------------------------------------------------
// Health isn't a single thing you "top up" — it's a COMPOSITE of three pillars,
// each 0..100, that you build through different choices:
//   • 💪 Muscle    — fitness/strength: gym, sports, exercise, active play
//   • 🥗 Nutrition — what you eat: veggies & balanced meals up, junk food down
//   • 🧘 Mental    — mental wellbeing: time with family & friends, and happiness
// The overall Health score can exceed 100 (cap 120) when all three are excellent
// — a robust, well-rounded body and mind. A newborn starts cared-for and loved.
export const HEALTH_MAX = 120;
export const START_MUSCLE = 64;
export const START_NUTRITION = 70;
export const START_MENTAL = 80;

export const BASE_LIFE_EXPECTANCY = 85;

/** Clamp a 0..100 meter (health / happiness / fun). */
export function clampStat(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Clamp the IQ meter to its 40..160 range. */
export function clampIq(v: number): number {
  return Math.max(IQ_MIN, Math.min(IQ_MAX, v));
}

export function applyEffects(stats: Stats, effects: Partial<Stats>): Stats {
  const next: Stats = { ...stats };
  for (const k of STAT_KEYS) {
    const d = effects[k];
    if (d === undefined) continue;
    next[k] = k === "smarts" ? clampIq(next[k] + d) : clampStat(next[k] + d);
  }
  return next;
}

// --- IQ growth --------------------------------------------------------------
// IQ is measured relative to age peers, so a person's level is fairly stable —
// but RAW ability grows through childhood/adolescence. So the game lets IQ rise
// toward an age-appropriate CEILING and never jump far in one action: gains slow
// as you approach the ceiling (you can't make a toddler a genius), and each
// action moves IQ by at most a few points.

/**
 * Fraction of adult cognitive capacity realised at a given age (0..1). Brain
 * maturity grows fast in childhood, plateaus 18-50, gently declines after.
 * A person's IQ each year ≈ their lifelong ceiling × ageMaturity(age).
 */
export function ageMaturity(age: number): number {
  const pts: [number, number][] = [
    [0, 0.55], [1, 0.62], [2, 0.70], [4, 0.80], [6, 0.88], [9, 0.93],
    [12, 0.96], [15, 0.99], [18, 1.0], [50, 1.0], [60, 0.97], [70, 0.93],
    [80, 0.85], [95, 0.72],
  ];
  if (age <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i][0]) {
      const [a0, m0] = pts[i - 1];
      const [a1, m1] = pts[i];
      return m0 + (m1 - m0) * ((age - a0) / (a1 - a0));
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Damp a raw IQ delta from a SINGLE action so IQ never jumps: a big study
 * delta (+10) becomes ~+2, junk a small minus. The age-band drift (engine,
 * each stage) does the rest, keeping IQ near the age-appropriate average.
 */
export function dampIqGain(delta: number): number {
  return Math.max(-1.5, Math.min(2, delta * 0.22));
}

// --- Money & happiness ------------------------------------------------------
/**
 * Money -> happiness with diminishing returns (Kahneman & Killingsworth, 2023):
 * emotional wellbeing rises with the LOG of income. Returns a per-transition
 * nudge from about -4 (broke) to about +3 (very rich), flattening at the top.
 */
export function moneyHappinessBias(money: number): number {
  const norm = Math.max(0, Math.min(1, (Math.log10(Math.max(1, money)) - 2.5) / 4));
  return Math.round((norm * 7 - 4) * 10) / 10;
}

// --- Life expectancy --------------------------------------------------------
/**
 * Life expectancy from the running averages of Health, Happiness and IQ.
 * ~90% of longevity is lifestyle (Harvard / blue-zones); social/positive mood
 * and education add years too. A balanced, thriving life can reach the verified
 * human cap (~120). Floor 45, cap 120.
 */
export function lifeExpectancy(avgHealth: number, avgHappiness: number, avgIq: number): number {
  avgIq = clampIq(avgIq);
  let le =
    50 +
    0.46 * clampStat(avgHealth) +
    0.14 * clampStat(avgHappiness) +
    0.06 * Math.max(0, avgIq - 85);
  // a steady, well-rounded life (strong on all three) earns a few extra years
  if (avgHealth >= 80 && avgHappiness >= 75 && avgIq >= 115) le += 6;
  return Math.round(Math.max(45, Math.min(120, le)));
}

/**
 * How much high, steady stats DISCOUNT the money cost (and strain) of an
 * activity — a fit, happy, sharp person gets more out of life for less. Up to
 * ~25% off when Health, Happiness and IQ are all excellent.
 */
export function activityDiscount(s: Stats): number {
  const d =
    0.002 * Math.max(0, s.health - 60) +
    0.002 * Math.max(0, s.happiness - 60) +
    0.0015 * Math.max(0, s.smarts - 100);
  return Math.max(0.65, 1 - d);
}

// --- Verdicts & formatting --------------------------------------------------
/** Qualitative verdict for a 0..100 stat. */
export function verdict(value: number): "poor" | "ok" | "good" | "great" {
  if (value < 30) return "poor";
  if (value < 55) return "ok";
  if (value < 78) return "good";
  return "great";
}

/** Verdict for IQ (40..160 scale). */
export function iqVerdict(iq: number): "poor" | "ok" | "good" | "great" {
  if (iq < 85) return "poor";
  if (iq < 100) return "ok";
  if (iq < 125) return "good";
  return "great";
}

/** Verdict for lifetime money (dollars). */
export function moneyVerdict(money: number): "poor" | "ok" | "good" | "great" {
  if (money < 20000) return "poor";
  if (money < 150000) return "ok";
  if (money < 600000) return "good";
  return "great";
}

/** Compact dollar formatting: $940, $12k, $1.3M, $2B. */
export function formatMoney(m: number): string {
  const neg = m < 0;
  const a = Math.abs(Math.round(m));
  const sign = neg ? "-$" : "$";
  // 1 decimal below 10× a unit, none above (e.g. $1.3M, $12M). The tier
  // thresholds sit at 999,500 / 999,500,000 so a value that would ROUND up to
  // "1000k" / "1000M" promotes to the next unit ("$1.0M" / "$1.0B") instead.
  const fmt = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
  let s: string;
  if (a >= 9.995e8) s = fmt(a / 1e9) + "B";
  else if (a >= 9.995e5) s = fmt(a / 1e6) + "M";
  else if (a >= 1e4) s = Math.round(a / 1e3) + "k";
  else s = a.toLocaleString("en-US");
  return sign + s;
}

// --- Body weight ------------------------------------------------------------
// Weight is a 0..100 index (think normalised body mass). ~50 is ideal; junk
// food pushes it up, healthy food and exercise bring it down. Drifting out of
// the healthy band quietly costs you health — so it feeds back into longevity.

export const START_WEIGHT = 50;
export const WEIGHT_IDEAL_LOW = 40;
export const WEIGHT_IDEAL_HIGH = 64;

export type WeightStatus = "underweight" | "healthy" | "overweight" | "obese";

export function weightStatus(w: number): WeightStatus {
  if (w < WEIGHT_IDEAL_LOW - 12) return "underweight";
  if (w <= WEIGHT_IDEAL_HIGH) return "healthy";
  if (w <= WEIGHT_IDEAL_HIGH + 18) return "overweight";
  return "obese";
}

export function weightColor(w: number): string {
  switch (weightStatus(w)) {
    case "healthy": return "#3ddc84";
    case "overweight": return "#ffb74d";
    case "underweight": return "#7fc9ff";
    case "obese": return "#ff5d6c";
  }
}

/** Extra per-action muscle drain when weight is outside the healthy band. */
export function weightHealthDrain(w: number): number {
  if (w > WEIGHT_IDEAL_HIGH) return (w - WEIGHT_IDEAL_HIGH) * 0.06;
  if (w < WEIGHT_IDEAL_LOW) return (WEIGHT_IDEAL_LOW - w) * 0.05;
  return 0;
}

/**
 * Compose the overall Health score from its three pillars (muscle / nutrition /
 * mental, each 0..100) plus a balance bonus and a weight penalty. Result 0..120:
 * being strong on ALL three pushes health above 100 (exceptional), while letting
 * any pillar collapse (no exercise, junk diet, or loneliness) drags it down.
 */
export function composeHealth(muscle: number, nutrition: number, mental: number, weight: number): number {
  const balance = muscle >= 70 && nutrition >= 70 && mental >= 70 ? 12 : 0;
  const ws = weightStatus(weight);
  const wPen = ws === "obese" ? 15 : ws === "overweight" ? 7 : ws === "underweight" ? 8 : 0;
  const h = 0.34 * muscle + 0.3 * nutrition + 0.36 * mental + balance - wPen;
  return Math.round(Math.max(0, Math.min(HEALTH_MAX, h)));
}

// --- Cross-effects between meters ------------------------------------------
// Per-action knock-on effects that wire the meters together, so no stat lives
// in a vacuum (applied every action in addition to the option's own effects).

export interface CrossFx {
  health: number;
  happiness: number;
}

export function crossEffects(s: Stats, money: number): CrossFx {
  let health = 0;
  let happiness = 0;
  // poverty is stressful — being broke wears down body and mind
  if (money < 3000) {
    health -= 0.3;
    happiness -= 0.45;
  }
  // poor health drags your mood down the sicker you are
  if (s.health < 40) happiness -= (40 - s.health) * 0.012;
  // a joyless life (no fun) quietly erodes happiness
  if (s.fun < 25) happiness -= 0.3;
  // being smart helps you look after yourself — a small protective effect
  health += s.smarts * 0.001;
  // being very wealthy buys comfort, security, better care
  if (money > 1000000) health += 0.1;
  return { health, happiness };
}
