import type {
  Gender,
  HeritageStyle,
  JobUniform,
  LifeOption,
  ProfessionNpcSpec,
  Stats,
} from "./types";

type ProfessionHeritage = Extract<
  HeritageStyle,
  "western" | "asian"
>;

interface ProfessionRole {
  id: string;
  label: string;
  icon: string;
  uniform: JobUniform;
  desc: string;
  effects: Partial<Stats>;
}

export interface ProfessionNpc extends ProfessionNpcSpec {
  label: string;
  icon: string;
  desc: string;
  effects: Partial<Stats>;
}

export type ProfessionVisualIdentity = Pick<
  ProfessionNpcSpec,
  "uniform" | "gender" | "heritage"
>;

export type ReservedProfessionVisuals =
  | ProfessionVisualIdentity
  | readonly ProfessionVisualIdentity[]
  | ReadonlySet<ProfessionVisualIdentity>;

export function sameProfessionVisual(
  left: ProfessionVisualIdentity,
  right: ProfessionVisualIdentity
): boolean {
  return (
    left.uniform === right.uniform &&
    left.gender === right.gender &&
    left.heritage === right.heritage
  );
}

/**
 * The nurse uses the reviewed medical-scrubs character sheet shared with the
 * doctor. Its label, interaction copy, gender, and heritage remain independent.
 */
export const PROFESSION_ROLES: readonly ProfessionRole[] = [
  {
    id: "doctor",
    label: "Doctor",
    icon: "🩺",
    uniform: "doctor",
    desc: "Meet a doctor between rounds and hear what caring for patients is really like.",
    effects: { health: 4, smarts: 2, happiness: 1 },
  },
  {
    id: "nurse",
    label: "Nurse",
    icon: "🩹",
    uniform: "doctor",
    desc: "Chat with a nurse whose skill and kindness keep a busy ward moving.",
    effects: { health: 4, happiness: 3 },
  },
  {
    id: "trainer",
    label: "Gym trainer",
    icon: "🏋️",
    uniform: "trainer",
    desc: "Meet a gym trainer who makes strength and confidence feel achievable.",
    effects: { health: 6, happiness: 2, fun: 2 },
  },
  {
    id: "dancer",
    label: "Dancer",
    icon: "🩰",
    uniform: "dancer",
    desc: "Talk with a professional dancer about practice, courage, and life on stage.",
    effects: { health: 3, happiness: 3, fun: 5 },
  },
  {
    id: "soldier",
    label: "Army soldier",
    icon: "🪖",
    uniform: "soldier",
    desc: "Meet a soldier and learn how discipline and teamwork shape a working life.",
    effects: { health: 4, smarts: 2, happiness: 1 },
  },
  {
    id: "farmer",
    label: "Farmer",
    icon: "🌾",
    uniform: "farmer",
    desc: "Meet a farmer who works with the seasons and grows food for the community.",
    effects: { health: 4, happiness: 3, fun: 2 },
  },
  {
    id: "teacher",
    label: "Teacher",
    icon: "📚",
    uniform: "teacher",
    desc: "Talk with a teacher who helps every student find a way to learn.",
    effects: { smarts: 4, happiness: 3 },
  },
  {
    id: "chef",
    label: "Chef",
    icon: "🍳",
    uniform: "chef",
    desc: "Meet a chef who turns careful preparation into food people remember.",
    effects: { happiness: 3, fun: 3, health: 2 },
  },
  {
    id: "barista",
    label: "Barista",
    icon: "☕",
    uniform: "barista",
    desc: "Chat with a barista who knows the craft, pace, and people behind a welcoming café.",
    effects: { happiness: 3, fun: 3 },
  },
  {
    id: "athlete",
    label: "Athlete",
    icon: "🏅",
    uniform: "athlete",
    desc: "Meet an athlete who builds performance through patient training and recovery.",
    effects: { health: 6, fun: 3 },
  },
  {
    id: "entrepreneur",
    label: "Entrepreneur",
    icon: "🚀",
    uniform: "entrepreneur",
    desc: "Talk with an entrepreneur about turning an idea into a responsible business.",
    effects: { smarts: 3, happiness: 2, fun: 2 },
  },
  {
    id: "generalengineer",
    label: "Engineer",
    icon: "⚙️",
    uniform: "generalengineer",
    desc: "Meet an engineer who designs practical systems and solves physical-world problems.",
    effects: { smarts: 5, happiness: 1 },
  },
  {
    id: "softwareengineer",
    label: "Software Engineer",
    icon: "💻",
    uniform: "softwareengineer",
    desc: "Meet a software engineer who turns careful reasoning into useful digital tools.",
    effects: { smarts: 5, fun: 2 },
  },
  {
    id: "manager",
    label: "Manager",
    icon: "📈",
    uniform: "manager",
    desc: "Talk with a manager who helps a team coordinate, improve, and do its best work.",
    effects: { happiness: 2, smarts: 3 },
  },
  {
    id: "analyst",
    label: "Financial Analyst",
    icon: "📊",
    uniform: "analyst",
    desc: "Meet a financial analyst who studies evidence before making a recommendation.",
    effects: { smarts: 5, happiness: 1 },
  },
  {
    id: "artist",
    label: "Artist",
    icon: "🎨",
    uniform: "artist",
    desc: "Talk with an artist who makes a living through observation, practice, and imagination.",
    effects: { happiness: 4, fun: 5 },
  },
  {
    id: "police",
    label: "Police Officer",
    icon: "🛡️",
    uniform: "police",
    desc: "Meet a police officer who serves the community through calm judgment and responsibility.",
    effects: { health: 3, smarts: 2, happiness: 1 },
  },
  {
    id: "lawyer",
    label: "Lawyer",
    icon: "⚖️",
    uniform: "lawyer",
    desc: "Talk with a lawyer who prepares carefully and advocates clearly for other people.",
    effects: { smarts: 5, happiness: 1 },
  },
  {
    id: "ceo",
    label: "CEO",
    icon: "👔",
    uniform: "ceo",
    desc: "Meet a CEO who balances long-term direction with responsibility for a whole organization.",
    effects: { smarts: 4, happiness: 2 },
  },
] as const;

export const PROFESSION_NPC_STAGE_IDS = [
  "career",
  "marriage",
  "midlife",
  "senior",
  "retirement",
] as const;

const PROFESSION_NPC_STAGES = new Set<string>(
  PROFESSION_NPC_STAGE_IDS
);
const PROFESSION_HERITAGES: readonly ProfessionHeritage[] = [
  "western",
  "asian",
];
const PROFESSION_GENDERS: readonly Gender[] = [
  "male",
  "female",
];

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stageHasProfessionNpcs(stageId: string): boolean {
  return PROFESSION_NPC_STAGES.has(stageId);
}

function visualKey(visual: ProfessionVisualIdentity): string {
  return `${visual.uniform}:${visual.gender}:${visual.heritage}`;
}

function reservedVisualList(
  reserved:
    | ReservedProfessionVisuals
    | undefined
): readonly ProfessionVisualIdentity[] {
  if (!reserved) return [];
  if (Array.isArray(reserved)) return reserved;
  if (reserved instanceof Set) return [...reserved];
  return [reserved as ProfessionVisualIdentity];
}

/**
 * Pick a stable random-looking adult cast. Rebuilding the room, rotating the
 * device, saving, or rewinding cannot change the people for that life chapter.
 * A single reserved player identity remains accepted for compatibility; a
 * readonly array/set can additionally reserve both parents. If all four
 * gender/heritage bodies for a uniform are reserved, that role is skipped
 * rather than returning a pixel-identical person.
 */
export function professionNpcsForStage(
  lifeSeed: string,
  stageId: string,
  count = 3,
  reservedVisuals?: ReservedProfessionVisuals
): ProfessionNpc[] {
  if (!stageHasProfessionNpcs(stageId) || count <= 0) return [];
  const ordered = [...PROFESSION_ROLES].sort((a, b) => {
    const aRank = stableHash(
      `${lifeSeed}:${stageId}:profession-order:${a.id}`
    );
    const bRank = stableHash(
      `${lifeSeed}:${stageId}:profession-order:${b.id}`
    );
    return aRank - bRank || a.id.localeCompare(b.id);
  });
  const requestedCount = Math.min(
    Math.floor(count),
    ordered.length
  );
  const firstGender =
    stableHash(`${lifeSeed}:${stageId}:profession-gender`) % 2;
  const firstHeritage =
    stableHash(`${lifeSeed}:${stageId}:profession-heritage`) % 2;
  const usedVisuals = new Set<string>(
    reservedVisualList(reservedVisuals).map(visualKey)
  );
  const selected: ProfessionNpc[] = [];

  for (const role of ordered) {
    if (selected.length >= requestedCount) break;
    const index = selected.length;
    for (let variant = 0; variant < 4; variant += 1) {
      const candidateGender =
        PROFESSION_GENDERS[
          (firstGender + index + Math.floor(variant / 2)) % 2
        ];
      const candidateHeritage =
        PROFESSION_HERITAGES[
          (firstHeritage + index + variant) % 2
        ];
      const candidateVisualKey =
        `${role.uniform}:${candidateGender}:${candidateHeritage}`;
      if (!usedVisuals.has(candidateVisualKey)) {
        usedVisuals.add(candidateVisualKey);
        selected.push({
          ...role,
          gender: candidateGender,
          heritage: candidateHeritage,
        });
        break;
      }
    }
  }

  return selected;
}

export function professionLifeOptions(
  lifeSeed: string,
  stageId: string,
  count = 3,
  reservedVisuals?: ReservedProfessionVisuals
): LifeOption[] {
  return professionNpcsForStage(
    lifeSeed,
    stageId,
    count,
    reservedVisuals
  ).map((profession) => ({
      id: `profession-${stageId}-${profession.id}`,
      label: profession.label,
      icon: profession.icon,
      person:
        profession.gender === "female"
          ? "coworker"
          : "gymBuddy",
      professionNpc: {
        id: profession.id,
        uniform: profession.uniform,
        gender: profession.gender,
        heritage: profession.heritage,
      },
      desc: profession.desc,
      category: "social",
      effects: profession.effects,
      storyTag: `profession_${profession.id}`,
    }));
}
