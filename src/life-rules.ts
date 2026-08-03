export const ACTIONS_PER_CHAPTER = 8;

export const LIFE_SPEEDS = [0.5, 1, 2, 4] as const;

export const ECONOMIC_BACKGROUNDS = [
  { id: "modest", label: "Modest", description: "A tighter start where small earnings matter.", money: 25000 },
  { id: "comfortable", label: "Comfortable", description: "A balanced start for a first life.", money: 75000 },
  { id: "affluent", label: "Affluent", description: "More freedom, but money cannot solve every problem.", money: 250000 },
] as const;

export type EconomicBackgroundId = typeof ECONOMIC_BACKGROUNDS[number]["id"];

export function chapterAgeStep(ageStart: number, ageEnd: number, speed = 1): number {
  return Math.max(0.08, Math.min(2.5, (ageEnd - ageStart) / ACTIONS_PER_CHAPTER)) * speed;
}

export function backgroundMoney(id: string): number {
  return ECONOMIC_BACKGROUNDS.find((item) => item.id === id)?.money ?? ECONOMIC_BACKGROUNDS[1].money;
}

/** Stable individual variation avoids a gender-determined death date. */
export function partnerLifeAge(partnerId: string): number {
  let hash = 2166136261;
  for (const char of partnerId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 74 + ((hash >>> 0) % 15);
}
