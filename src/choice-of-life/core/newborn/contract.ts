import type {
  NewbornCaregiverOption,
  NewbornDifficulty,
  NewbornEntityContentId,
} from "./types";

export const NEWBORN_STAGE_CONTRACT = Object.freeze({
  stageId: "newborn-v1" as const,
  durationTicks: 2_400,
  tickDurationMs: 20,
  lanes: Object.freeze([0, 1, 2] as const),
  playerXMilli: 180_000,
  playerHalfWidthMilli: 18_000,
  entitySpawnXMilli: 760_000,
  entityWidthMilli: 36_000,
  firstSpawnTick: 90,
  spawnSpacingTicks: 86,
  caregiverCorridorStartTick: 1_080,
  caregiverPresentationTick: 1_160,
  caregiverCorridorEndTick: 1_260,
  moveAnimationTicks: 10,
  recoveryTarget: 12,
  recoveryInvulnerabilityTicks: 80,
  recoveryCooldownTicks: 180,
  speedMilliPerTick: Object.freeze({
    story: 2_400,
    normal: 2_800,
    challenge: 3_200,
  } satisfies Readonly<Record<NewbornDifficulty, number>>),
});

export const NEWBORN_CAREGIVER_OPTIONS = Object.freeze([
  Object.freeze({
    optionId: "newborn-option-warm-cuddle-v1",
    label: "Stay for a warm cuddle",
    description: "Feel safe and happy with calm, close comfort.",
    goalId: "comfort",
    effects: Object.freeze([
      Object.freeze({ scoreId: "happiness", requestedDelta: 6 }),
      Object.freeze({ scoreId: "health", requestedDelta: 1 }),
    ]),
    factValueId: "newborn-value-felt-safe-v1",
    memorySummary: "A caregiver made time for a warm, reassuring cuddle.",
  }),
  Object.freeze({
    optionId: "newborn-option-gentle-play-v1",
    label: "Explore a gentle game",
    description: "Build curiosity through safe movement and shared play.",
    goalId: "curiosity",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: 3 }),
      Object.freeze({ scoreId: "happiness", requestedDelta: 3 }),
    ]),
    factValueId: "newborn-value-explored-together-v1",
    memorySummary: "A caregiver encouraged a first playful exploration.",
  }),
  Object.freeze({
    optionId: "newborn-option-steady-routine-v1",
    label: "Choose a steady routine",
    description: "Rest, nourishment, and planning make the home feel secure.",
    goalId: "stability",
    effects: Object.freeze([
      Object.freeze({ scoreId: "health", requestedDelta: 4 }),
      Object.freeze({ scoreId: "money", requestedDelta: 2 }),
    ]),
    factValueId: "newborn-value-steady-care-v1",
    memorySummary: "A dependable care routine gave the family a steady start.",
  }),
] as const satisfies readonly NewbornCaregiverOption[]);

export const NEWBORN_ENTITY_DEFINITIONS = Object.freeze([
  Object.freeze({
    contentId: "newborn-pickup-milk-v1",
    kind: "pickup" as const,
    scoreId: "health" as const,
    scoreDelta: 4,
    weight: 4,
  }),
  Object.freeze({
    contentId: "newborn-pickup-rattle-v1",
    kind: "pickup" as const,
    scoreId: "happiness" as const,
    scoreDelta: 4,
    weight: 4,
  }),
  Object.freeze({
    contentId: "newborn-pickup-nest-egg-v1",
    kind: "pickup" as const,
    scoreId: "money" as const,
    scoreDelta: 3,
    weight: 3,
  }),
  Object.freeze({
    contentId: "newborn-hazard-spill-v1",
    kind: "hazard" as const,
    scoreId: "health" as const,
    scoreDelta: -5,
    weight: 3,
  }),
  Object.freeze({
    contentId: "newborn-hazard-noise-v1",
    kind: "hazard" as const,
    scoreId: "happiness" as const,
    scoreDelta: -4,
    weight: 3,
  }),
  Object.freeze({
    contentId: "newborn-hazard-cost-v1",
    kind: "hazard" as const,
    scoreId: "money" as const,
    scoreDelta: -3,
    weight: 2,
  }),
] as const satisfies readonly Readonly<{
  contentId: NewbornEntityContentId;
  kind: "pickup" | "hazard";
  scoreId: "health" | "happiness" | "money";
  scoreDelta: number;
  weight: number;
}>[]);
