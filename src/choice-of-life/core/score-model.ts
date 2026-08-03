export const SCORE_IDS = ["health", "happiness", "money"] as const;

export type ScoreId = (typeof SCORE_IDS)[number];

export interface CoreScores {
  readonly health: number;
  readonly happiness: number;
  readonly money: number;
}

export interface ScoreChange {
  readonly scores: CoreScores;
  readonly scoreId: ScoreId;
  readonly before: number;
  readonly after: number;
  readonly actualDelta: number;
}

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

function assertInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError(`${name} must be a finite integer`);
  }
}

export function isScoreId(value: string): value is ScoreId {
  return value === "health" || value === "happiness" || value === "money";
}

export function assertScoreValue(value: number, name = "score"): void {
  assertInteger(value, name);
  if (value < SCORE_MIN || value > SCORE_MAX) {
    throw new RangeError(`${name} must be between 0 and 100`);
  }
}

export function assertCoreScores(scores: CoreScores): void {
  const keys = Object.keys(scores);
  if (
    keys.length !== SCORE_IDS.length ||
    keys.some((key) => !isScoreId(key)) ||
    Object.getOwnPropertySymbols(scores).length > 0
  ) {
    throw new TypeError(
      "CoreScores must contain exactly health, happiness, and money",
    );
  }
  assertScoreValue(scores.health, "health");
  assertScoreValue(scores.happiness, "happiness");
  assertScoreValue(scores.money, "money");
}

export function createCoreScores(scores: CoreScores): CoreScores {
  assertCoreScores(scores);
  return Object.freeze({
    health: scores.health,
    happiness: scores.happiness,
    money: scores.money,
  });
}

export function clampScore(value: number): number {
  assertInteger(value, "score result");
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

export function scoreValue(scores: CoreScores, scoreId: ScoreId): number {
  assertCoreScores(scores);
  return scores[scoreId];
}

export function applyScoreDelta(
  scores: CoreScores,
  scoreId: ScoreId,
  requestedDelta: number,
): ScoreChange {
  assertCoreScores(scores);
  assertInteger(requestedDelta, "requested delta");

  const before = scores[scoreId];
  const after = clampScore(before + requestedDelta);
  const nextScores = Object.freeze({
    health: scoreId === "health" ? after : scores.health,
    happiness: scoreId === "happiness" ? after : scores.happiness,
    money: scoreId === "money" ? after : scores.money,
  });

  return Object.freeze({
    scores: nextScores,
    scoreId,
    before,
    after,
    actualDelta: after - before,
  });
}
