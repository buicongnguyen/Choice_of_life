import type {
  EncounterCatalog,
  EncounterDefinition,
} from "./types";

function freezeDefinition(definition: EncounterDefinition): EncounterDefinition {
  return Object.freeze({
    ...definition,
    options: Object.freeze(
      definition.options.map((option) =>
        Object.freeze({
          ...option,
          effects: Object.freeze([...(option.effects ?? [])]),
          facts: Object.freeze([...(option.facts ?? [])]),
          memories: Object.freeze([...(option.memories ?? [])]),
          relationships: Object.freeze([...(option.relationships ?? [])]),
          callbacks: Object.freeze(
            (option.callbacks ?? []).map((callback) =>
              Object.freeze({
                ...callback,
                effects: Object.freeze([...(callback.effects ?? [])]),
                facts: Object.freeze([...(callback.facts ?? [])]),
                memories: Object.freeze([...(callback.memories ?? [])]),
                relationships: Object.freeze([
                  ...(callback.relationships ?? []),
                ]),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

export function createEncounterCatalog(
  definitions: readonly EncounterDefinition[],
  catalogVersion = "encounter-catalog-v1",
): EncounterCatalog {
  const encounters: Record<string, EncounterDefinition> = {};
  for (const definition of definitions) {
    if (encounters[definition.encounterId] !== undefined) {
      throw new Error(`Duplicate encounter ID: ${definition.encounterId}`);
    }
    encounters[definition.encounterId] = freezeDefinition(definition);
  }
  return Object.freeze({
    catalogVersion,
    encounters: Object.freeze(encounters),
  });
}

export function getEncounterDefinition(
  catalog: EncounterCatalog,
  encounterId: string,
): EncounterDefinition {
  const definition = catalog.encounters[encounterId];
  if (definition === undefined) {
    throw new RangeError(`Unknown encounter: ${encounterId}`);
  }
  return definition;
}

const DEFAULT_DEFINITIONS = [
  {
    encounterId: "caregiver-comfort-v1",
    kind: "caregiver",
    importance: "mandatory",
    title: "A familiar face",
    prompt: "Someone who cares for you notices what you need. What do you do?",
    safeCorridorTicks: 120,
    options: [
      {
        optionId: "ask-for-comfort-v1",
        label: "Ask for comfort",
        description: "Let them know that closeness would help.",
        reactionText: "You feel heard, safe, and a little braver.",
        effects: [
          { scoreId: "happiness", requestedDelta: 6, categoryId: "care-v1" },
          { scoreId: "health", requestedDelta: 2, categoryId: "care-v1" },
        ],
        facts: [{ factId: "asked-for-support-v1", kind: "care", valueId: "open-to-support-v1" }],
        memories: [{ memoryId: "comfort-was-near-v1", kind: "relationship", summary: "A caregiver made space for comfort." }],
        relationships: [{ relationshipId: "primary-caregiver-v1", personId: "primary-caregiver-v1", kind: "caregiver", closenessDelta: 6 }],
        storyText: "You asked for comfort and your caregiver stayed close.",
      },
      {
        optionId: "play-together-v1",
        label: "Play together",
        description: "Turn the moment into shared discovery.",
        reactionText: "A little game brings energy and laughter.",
        effects: [
          { scoreId: "health", requestedDelta: 4, categoryId: "shared-play-v1" },
          { scoreId: "happiness", requestedDelta: 4, categoryId: "shared-play-v1" },
        ],
        facts: [{ factId: "shared-play-v1", kind: "learning", valueId: "curious-together-v1" }],
        relationships: [{ relationshipId: "primary-caregiver-v1", personId: "primary-caregiver-v1", kind: "caregiver", closenessDelta: 4 }],
        storyText: "You explored the moment through a gentle game.",
      },
      {
        optionId: "settle-into-routine-v1",
        label: "Follow the routine",
        description: "Choose a calm meal-and-rest rhythm.",
        reactionText: "The dependable rhythm makes the day feel steady.",
        effects: [
          { scoreId: "health", requestedDelta: 5, categoryId: "steady-routine-v1" },
          { scoreId: "money", requestedDelta: 2, categoryId: "steady-routine-v1" },
        ],
        facts: [{ factId: "trusted-routine-v1", kind: "care", valueId: "steady-home-v1" }],
        storyText: "A dependable routine gave the household a steady day.",
      },
    ],
  },
  {
    encounterId: "playground-sharing-v1",
    kind: "friend",
    importance: "optional",
    title: "Room for one more",
    prompt: "Another child watches the game from nearby. How do you respond?",
    safeCorridorTicks: 100,
    options: [
      {
        optionId: "invite-them-v1",
        label: "Invite them in",
        description: "Make room and explain the game.",
        reactionText: "The game becomes noisier, kinder, and more fun.",
        effects: [{ scoreId: "happiness", requestedDelta: 6, categoryId: "friendship-v1" }],
        facts: [{ factId: "welcomed-new-friend-v1", kind: "community", valueId: "inclusive-v1" }],
        relationships: [{ relationshipId: "playground-friend-v1", personId: "playground-friend-v1", kind: "friend", closenessDelta: 8 }],
        storyText: "You invited someone new into the game.",
      },
      {
        optionId: "offer-next-turn-v1",
        label: "Offer the next turn",
        description: "Finish this round, then hand over your place.",
        reactionText: "A clear promise makes sharing feel fair.",
        effects: [
          { scoreId: "happiness", requestedDelta: 3, categoryId: "friendship-v1" },
          { scoreId: "money", requestedDelta: 1, categoryId: "resource-sharing-v1" },
        ],
        relationships: [{ relationshipId: "playground-friend-v1", personId: "playground-friend-v1", kind: "friend", closenessDelta: 4 }],
        storyText: "You found a fair way to take turns.",
      },
      {
        optionId: "keep-playing-v1",
        label: "Keep playing",
        description: "Stay focused on the game you already started.",
        reactionText: "You keep your momentum, though the moment passes.",
        effects: [{ scoreId: "health", requestedDelta: 3, categoryId: "active-play-v1" }],
        storyText: "You kept playing and the possible friendship passed by.",
      },
    ],
  },
  {
    encounterId: "study-or-rest-v1",
    kind: "self-reflection",
    importance: "mandatory",
    title: "The exam week choice",
    prompt: "The exam is close and your energy is limited. What balance do you choose?",
    safeCorridorTicks: 140,
    options: [
      {
        optionId: "study-hard-v1",
        label: "Study hard",
        description: "Push for a stronger grade at the cost of rest.",
        reactionText: "Your preparation grows, and so does the pressure.",
        effects: [
          { scoreId: "money", requestedDelta: 7, categoryId: "education-investment-v1" },
          { scoreId: "health", requestedDelta: -4, categoryId: "exam-stress-v1" },
          { scoreId: "happiness", requestedDelta: -2, categoryId: "exam-stress-v1" },
        ],
        facts: [{ factId: "exam-prepared-v1", kind: "learning", valueId: "worked-hard-v1" }],
        callbacks: [{
          callbackId: "exam-result-v1",
          delayTicks: 220,
          label: "Exam result",
          effects: [{ scoreId: "happiness", requestedDelta: 5, categoryId: "exam-result-v1" }],
          memories: [{ memoryId: "hard-work-paid-off-v1", kind: "milestone", summary: "Focused study led to a result you were proud of." }],
          storyText: "The result arrived: your preparation paid off.",
        }],
        storyText: "You chose an intense study week.",
      },
      {
        optionId: "balanced-plan-v1",
        label: "Make a balanced plan",
        description: "Study consistently and protect sleep.",
        reactionText: "The plan feels sustainable and clear.",
        effects: [
          { scoreId: "money", requestedDelta: 4, categoryId: "education-investment-v1" },
          { scoreId: "health", requestedDelta: 3, categoryId: "healthy-routine-v1" },
          { scoreId: "happiness", requestedDelta: 2, categoryId: "healthy-routine-v1" },
        ],
        facts: [{ factId: "balanced-study-v1", kind: "learning", valueId: "sustainable-effort-v1" }],
        storyText: "You made room for both preparation and rest.",
      },
      {
        optionId: "take-a-break-v1",
        label: "Take a real break",
        description: "Recover now and accept a less certain result.",
        reactionText: "Your body relaxes, even if the exam remains uncertain.",
        effects: [
          { scoreId: "health", requestedDelta: 6, categoryId: "recovery-v1" },
          { scoreId: "happiness", requestedDelta: 5, categoryId: "recovery-v1" },
          { scoreId: "money", requestedDelta: -3, categoryId: "education-tradeoff-v1" },
        ],
        storyText: "You chose recovery over one last study push.",
      },
    ],
  },
] as const satisfies readonly EncounterDefinition[];

export const DEFAULT_ENCOUNTER_CATALOG = createEncounterCatalog(
  DEFAULT_DEFINITIONS,
  "default-life-encounters-v1",
);

/**
 * Caregiver-closeness thresholds for downstream education support.
 *
 * These live beside the catalog because the catalog's `closenessDelta` values
 * are what make them reachable. They previously lived in `browser-shell.ts` as
 * 70 and 35, while the only caregiver deltas here are +6 and +4 — so every
 * playthrough resolved to "none" and the caregiver bond had no mechanical
 * effect at all.
 *
 * `some` is set to 4 so that *either* way of engaging with the caregiver earns
 * support, and following the routine does not. That is a trade-off: engagement
 * buys education support (+4 academic, +15 funding), the routine buys immediate
 * health and money.
 *
 * `strong` is deliberately set above what one encounter can produce. An earlier
 * revision mapped it to 6, which made the three options a strict education
 * ladder (65 / 50 / 37 effective funding from a 35-money start) — it ranked
 * "ask for comfort" above "play together", which §8.3 treats as equally valid,
 * and it punished the money-minded routine hardest on money. Reaching `strong`
 * should require sustained closeness across several caregiver encounters, which
 * this catalog does not yet contain. It is therefore unreachable *by design and
 * on record*, not by accident — see `caregiver-support.test.ts`, which fails if
 * that stops being true without this comment being updated.
 *
 * Rebalance these together with the catalog deltas, never independently.
 */
export const CAREGIVER_SUPPORT_THRESHOLDS = Object.freeze({
  /** Two engaged caregiver encounters' worth; no single option can reach it. */
  strong: 12,
  some: 4,
});

/** Every caregiver closeness total a single playthrough can actually reach. */
export function caregiverClosenessOutcomes(
  definitions: readonly EncounterDefinition[] = DEFAULT_DEFINITIONS,
): readonly number[] {
  const totals = new Set<number>([0]);
  for (const definition of definitions) {
    if (definition.kind !== "caregiver") continue;
    for (const option of definition.options) {
      for (const change of option.relationships ?? []) {
        if (change.kind !== "caregiver") continue;
        totals.add(Math.max(0, Math.min(100, change.closenessDelta)));
      }
    }
  }
  return [...totals].sort((first, second) => first - second);
}
