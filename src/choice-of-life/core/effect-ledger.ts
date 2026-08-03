import {
  applyScoreDelta,
  assertCoreScores,
  isScoreId,
  type CoreScores,
  type ScoreId,
} from "./score-model";

export const EFFECT_SOURCES = [
  "runner",
  "choice",
  "callback",
  "settlement",
  "recovery",
  "system",
] as const;

export type EffectSource = (typeof EFFECT_SOURCES)[number];

export interface EffectRequest {
  readonly effectId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly source: EffectSource;
  readonly categoryId: string;
  readonly causedByChoiceId: string | null;
  readonly transactionId: string | null;
  readonly simulationTick: number;
}

export interface AppliedEffect extends EffectRequest {
  readonly before: number;
  readonly after: number;
  readonly actualDelta: number;
}

export interface ScoreTotals {
  readonly healthPositive: number;
  readonly healthNegative: number;
  readonly happinessPositive: number;
  readonly happinessNegative: number;
  readonly moneyPositive: number;
  readonly moneyNegative: number;
}

export interface SourceTotals {
  readonly runner: ScoreTotals;
  readonly choice: ScoreTotals;
  readonly callback: ScoreTotals;
  readonly settlement: ScoreTotals;
  readonly recovery: ScoreTotals;
  readonly system: ScoreTotals;
}

export interface EffectLedger {
  readonly recent: readonly AppliedEffect[];
  readonly totalsBySource: SourceTotals;
}

export interface EffectApplication {
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly effect: AppliedEffect;
}

export const RECENT_EFFECT_LIMIT = 128;
export const EFFECT_DELTA_MIN = -100;
export const EFFECT_DELTA_MAX = 100;

const INSTANCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const CATALOG_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;

function zeroScoreTotals(): ScoreTotals {
  return Object.freeze({
    healthPositive: 0,
    healthNegative: 0,
    happinessPositive: 0,
    happinessNegative: 0,
    moneyPositive: 0,
    moneyNegative: 0,
  });
}

export function createEmptyEffectLedger(): EffectLedger {
  return Object.freeze({
    recent: Object.freeze([]),
    totalsBySource: Object.freeze({
      runner: zeroScoreTotals(),
      choice: zeroScoreTotals(),
      callback: zeroScoreTotals(),
      settlement: zeroScoreTotals(),
      recovery: zeroScoreTotals(),
      system: zeroScoreTotals(),
    }),
  });
}

function isEffectSource(value: string): value is EffectSource {
  return EFFECT_SOURCES.some((source) => source === value);
}

function assertSafeNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function assertIdentifier(
  value: string,
  pattern: RegExp,
  name: string,
): void {
  if (value.length > 64 || !pattern.test(value)) {
    throw new TypeError(`${name} is invalid`);
  }
}

function normalizeSource(request: EffectRequest): EffectSource {
  if (!isEffectSource(request.source)) {
    throw new TypeError("effect source is invalid");
  }

  if (request.source === "choice") {
    if (request.causedByChoiceId === null) {
      throw new TypeError("choice effects require a choice cause");
    }
    return "choice";
  }

  if (request.source === "callback" || request.source === "settlement") {
    return request.causedByChoiceId === null ? "system" : request.source;
  }

  if (request.causedByChoiceId !== null) {
    throw new TypeError(
      `${request.source} effects cannot have a choice cause`,
    );
  }
  return request.source;
}

function validateRequest(request: EffectRequest): EffectSource {
  assertIdentifier(request.effectId, INSTANCE_ID_PATTERN, "effect ID");
  if (!isScoreId(request.scoreId)) {
    throw new TypeError("score ID is invalid");
  }
  if (
    !Number.isInteger(request.requestedDelta) ||
    !Number.isFinite(request.requestedDelta)
  ) {
    throw new TypeError("requested delta must be a finite integer");
  }
  if (
    request.requestedDelta < EFFECT_DELTA_MIN ||
    request.requestedDelta > EFFECT_DELTA_MAX
  ) {
    throw new RangeError("requested delta must be between -100 and 100");
  }
  assertIdentifier(request.categoryId, CATALOG_ID_PATTERN, "category ID");
  if (request.causedByChoiceId !== null) {
    assertIdentifier(
      request.causedByChoiceId,
      CATALOG_ID_PATTERN,
      "choice cause ID",
    );
  }
  if (request.transactionId !== null) {
    assertIdentifier(
      request.transactionId,
      INSTANCE_ID_PATTERN,
      "transaction ID",
    );
  }
  assertSafeNonnegativeInteger(request.simulationTick, "simulation tick");
  return normalizeSource(request);
}

function safeAdd(total: number, amount: number): number {
  const next = total + amount;
  if (!Number.isSafeInteger(next)) {
    throw new RangeError("effect aggregate exceeds safe integer range");
  }
  return next;
}

function incrementScoreTotals(
  totals: ScoreTotals,
  scoreId: ScoreId,
  actualDelta: number,
): ScoreTotals {
  const positive = Math.max(0, actualDelta);
  const negative = Math.max(0, -actualDelta);
  return Object.freeze({
    healthPositive:
      scoreId === "health"
        ? safeAdd(totals.healthPositive, positive)
        : totals.healthPositive,
    healthNegative:
      scoreId === "health"
        ? safeAdd(totals.healthNegative, negative)
        : totals.healthNegative,
    happinessPositive:
      scoreId === "happiness"
        ? safeAdd(totals.happinessPositive, positive)
        : totals.happinessPositive,
    happinessNegative:
      scoreId === "happiness"
        ? safeAdd(totals.happinessNegative, negative)
        : totals.happinessNegative,
    moneyPositive:
      scoreId === "money"
        ? safeAdd(totals.moneyPositive, positive)
        : totals.moneyPositive,
    moneyNegative:
      scoreId === "money"
        ? safeAdd(totals.moneyNegative, negative)
        : totals.moneyNegative,
  });
}

function replaceSourceTotals(
  totals: SourceTotals,
  source: EffectSource,
  scoreId: ScoreId,
  actualDelta: number,
): SourceTotals {
  return Object.freeze({
    runner:
      source === "runner"
        ? incrementScoreTotals(totals.runner, scoreId, actualDelta)
        : totals.runner,
    choice:
      source === "choice"
        ? incrementScoreTotals(totals.choice, scoreId, actualDelta)
        : totals.choice,
    callback:
      source === "callback"
        ? incrementScoreTotals(totals.callback, scoreId, actualDelta)
        : totals.callback,
    settlement:
      source === "settlement"
        ? incrementScoreTotals(totals.settlement, scoreId, actualDelta)
        : totals.settlement,
    recovery:
      source === "recovery"
        ? incrementScoreTotals(totals.recovery, scoreId, actualDelta)
        : totals.recovery,
    system:
      source === "system"
        ? incrementScoreTotals(totals.system, scoreId, actualDelta)
        : totals.system,
  });
}

export function applyEffect(
  scores: CoreScores,
  ledger: EffectLedger,
  request: EffectRequest,
): EffectApplication {
  assertCoreScores(scores);
  const source = validateRequest(request);
  if (ledger.recent.some((effect) => effect.effectId === request.effectId)) {
    throw new TypeError(`duplicate recent effect ID: ${request.effectId}`);
  }
  const lastEffect = ledger.recent.at(-1);
  if (lastEffect !== undefined && request.simulationTick < lastEffect.simulationTick) {
    throw new TypeError("effect simulation tick precedes retained application history");
  }
  let lastScoreEffect: AppliedEffect | undefined;
  for (let index = ledger.recent.length - 1; index >= 0; index -= 1) {
    const candidate = ledger.recent[index];
    if (candidate?.scoreId === request.scoreId) {
      lastScoreEffect = candidate;
      break;
    }
  }
  if (lastScoreEffect !== undefined && lastScoreEffect.after !== scores[request.scoreId]) {
    throw new TypeError("current score does not continue retained effect history");
  }

  const scoreChange = applyScoreDelta(
    scores,
    request.scoreId,
    request.requestedDelta,
  );
  const effect = Object.freeze({
    effectId: request.effectId,
    scoreId: request.scoreId,
    requestedDelta: request.requestedDelta,
    source,
    categoryId: request.categoryId,
    causedByChoiceId: request.causedByChoiceId,
    transactionId: request.transactionId,
    before: scoreChange.before,
    after: scoreChange.after,
    actualDelta: scoreChange.actualDelta,
    simulationTick: request.simulationTick,
  });
  const recent = Object.freeze(
    [...ledger.recent, effect].slice(-RECENT_EFFECT_LIMIT),
  );
  const totalsBySource = replaceSourceTotals(
    ledger.totalsBySource,
    source,
    request.scoreId,
    scoreChange.actualDelta,
  );
  const nextLedger = Object.freeze({ recent, totalsBySource });

  return Object.freeze({
    scores: scoreChange.scores,
    ledger: nextLedger,
    effect,
  });
}
