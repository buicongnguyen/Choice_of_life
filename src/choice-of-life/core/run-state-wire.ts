import { fnv1a64Hex } from "./canonical-json";

/**
 * Durable RunStateV1 JSON uses the immutable schema names even when production
 * minification shortens the in-memory property names. Every left-hand key in
 * this sentinel is deliberately unquoted so Terser may rewrite it; the paired
 * durable string is data and therefore remains the wire spelling.
 */
const INTERNAL_KEYS = Object.keys({
  accessibility: 0,
  acknowledgmentId: 0,
  activeEntities: 0,
  activeTicks: 0,
  actualDelta: 0,
  after: 0,
  ageMonths: 0,
  appearance: 0,
  appliedEffectIds: 0,
  before: 0,
  callback: 0,
  categoryId: 0,
  causedByChoiceId: 0,
  choice: 0,
  closeness: 0,
  clothingPaletteId: 0,
  completedTick: 0,
  conditionId: 0,
  conditions: 0,
  consequenceId: 0,
  consequences: 0,
  contactState: 0,
  contentId: 0,
  contentVersion: 0,
  controlMode: 0,
  cooldownUntilTick: 0,
  credentialId: 0,
  credentials: 0,
  currentLane: 0,
  difficulty: 0,
  dueStageId: 0,
  dueTick: 0,
  durationTicks: 0,
  earnedStageId: 0,
  effectId: 0,
  effectIds: 0,
  effectLedger: 0,
  elapsedTicks: 0,
  encounter: 0,
  encounterId: 0,
  expiresTick: 0,
  factId: 0,
  factResultIds: 0,
  facts: 0,
  gender: 0,
  hairColorId: 0,
  hairStyleId: 0,
  happiness: 0,
  happinessNegative: 0,
  happinessPositive: 0,
  health: 0,
  healthNegative: 0,
  healthPositive: 0,
  heritageStyleId: 0,
  highContrast: 0,
  identity: 0,
  inputBuffer: 0,
  instanceId: 0,
  invulnerableUntilTick: 0,
  kind: 0,
  lane: 0,
  level: 0,
  memories: 0,
  memoryId: 0,
  money: 0,
  moneyNegative: 0,
  moneyPositive: 0,
  motion: 0,
  nextSpawnDistanceMilli: 0,
  nextSpawnTick: 0,
  optionIds: 0,
  originChoiceId: 0,
  patternIndex: 0,
  pending: 0,
  personId: 0,
  phase: 0,
  presentationPhase: 0,
  presentedTick: 0,
  preTriggerScores: 0,
  recent: 0,
  recovery: 0,
  recoveryTarget: 0,
  reducedMotion: 0,
  relationshipId: 0,
  relationshipResultIds: 0,
  relationships: 0,
  requestedDelta: 0,
  resolution: 0,
  resolutionTransactionId: 0,
  resolved: 0,
  resolvedEntityIds: 0,
  resolvedThroughPatternIndex: 0,
  resolvedTick: 0,
  resolveTick: 0,
  resultTextInputIds: 0,
  runId: 0,
  runner: 0,
  runSeed: 0,
  runStatus: 0,
  scheduledConsequenceTransactionIds: 0,
  schemaVersion: 0,
  scoreId: 0,
  scores: 0,
  screenReaderAnnouncements: 0,
  selectedOptionId: 0,
  settlement: 0,
  settlementId: 0,
  severity: 0,
  simulationTick: 0,
  slotIndex: 0,
  source: 0,
  sourceLane: 0,
  spawn: 0,
  stage: 0,
  stageId: 0,
  startedTick: 0,
  startingProfileId: 0,
  status: 0,
  storyState: 0,
  summary: 0,
  supersededByTransactionId: 0,
  system: 0,
  targetLane: 0,
  targetScores: 0,
  terminal: 0,
  terminalReasonId: 0,
  terminalTick: 0,
  textScale: 0,
  totalsBySource: 0,
  totalTicks: 0,
  transactionId: 0,
  triggerEntityInstanceId: 0,
  userPaused: 0,
  valueId: 0,
  widthMilli: 0,
  worldDistanceMilli: 0,
  xMilli: 0,
});

export const RUN_STATE_WIRE_KEYS_V1 = Object.freeze([
  "accessibility",
  "acknowledgmentId",
  "activeEntities",
  "activeTicks",
  "actualDelta",
  "after",
  "ageMonths",
  "appearance",
  "appliedEffectIds",
  "before",
  "callback",
  "categoryId",
  "causedByChoiceId",
  "choice",
  "closeness",
  "clothingPaletteId",
  "completedTick",
  "conditionId",
  "conditions",
  "consequenceId",
  "consequences",
  "contactState",
  "contentId",
  "contentVersion",
  "controlMode",
  "cooldownUntilTick",
  "credentialId",
  "credentials",
  "currentLane",
  "difficulty",
  "dueStageId",
  "dueTick",
  "durationTicks",
  "earnedStageId",
  "effectId",
  "effectIds",
  "effectLedger",
  "elapsedTicks",
  "encounter",
  "encounterId",
  "expiresTick",
  "factId",
  "factResultIds",
  "facts",
  "gender",
  "hairColorId",
  "hairStyleId",
  "happiness",
  "happinessNegative",
  "happinessPositive",
  "health",
  "healthNegative",
  "healthPositive",
  "heritageStyleId",
  "highContrast",
  "identity",
  "inputBuffer",
  "instanceId",
  "invulnerableUntilTick",
  "kind",
  "lane",
  "level",
  "memories",
  "memoryId",
  "money",
  "moneyNegative",
  "moneyPositive",
  "motion",
  "nextSpawnDistanceMilli",
  "nextSpawnTick",
  "optionIds",
  "originChoiceId",
  "patternIndex",
  "pending",
  "personId",
  "phase",
  "presentationPhase",
  "presentedTick",
  "preTriggerScores",
  "recent",
  "recovery",
  "recoveryTarget",
  "reducedMotion",
  "relationshipId",
  "relationshipResultIds",
  "relationships",
  "requestedDelta",
  "resolution",
  "resolutionTransactionId",
  "resolved",
  "resolvedEntityIds",
  "resolvedThroughPatternIndex",
  "resolvedTick",
  "resolveTick",
  "resultTextInputIds",
  "runId",
  "runner",
  "runSeed",
  "runStatus",
  "scheduledConsequenceTransactionIds",
  "schemaVersion",
  "scoreId",
  "scores",
  "screenReaderAnnouncements",
  "selectedOptionId",
  "settlement",
  "settlementId",
  "severity",
  "simulationTick",
  "slotIndex",
  "source",
  "sourceLane",
  "spawn",
  "stage",
  "stageId",
  "startedTick",
  "startingProfileId",
  "status",
  "storyState",
  "summary",
  "supersededByTransactionId",
  "system",
  "targetLane",
  "targetScores",
  "terminal",
  "terminalReasonId",
  "terminalTick",
  "textScale",
  "totalsBySource",
  "totalTicks",
  "transactionId",
  "triggerEntityInstanceId",
  "userPaused",
  "valueId",
  "widthMilli",
  "worldDistanceMilli",
  "xMilli",
] as const);

export const RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID =
  "run-state-wire-bijection-certificate-v1" as const;

export interface RunStateWireBijectionPairV1 {
  readonly ordinal: number;
  readonly internalKey: string;
  readonly wireKey: string;
}

export interface RunStateWireBijectionCertificateV1 {
  readonly certificateId:
    typeof RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID;
  readonly keyCount: number;
  /** Stable across property-mangled builds because it hashes ordinal+wire key. */
  readonly pairDigest: string;
  /** Stable digest of the recursively translated durable witness tree. */
  readonly recursiveInverseDigest: string;
}

/** @internal Negative-test seam. Production callers must omit this argument. */
export type RunStateWireBijectionPairMutator = (
  pairs: readonly RunStateWireBijectionPairV1[],
) => readonly RunStateWireBijectionPairV1[];

const internalToWire = new Map<string, string>();
const wireToInternal = new Map<string, string>();
const internalKeySet = new Set(INTERNAL_KEYS);

if (INTERNAL_KEYS.length !== RUN_STATE_WIRE_KEYS_V1.length) {
  throw new TypeError("RunStateV1 wire-key sentinel is incomplete");
}
for (let index = 0; index < INTERNAL_KEYS.length; index += 1) {
  const internal = INTERNAL_KEYS[index]!;
  const wire = RUN_STATE_WIRE_KEYS_V1[index]!;
  if (internalToWire.has(internal) || wireToInternal.has(wire)) {
    throw new TypeError("RunStateV1 wire-key map contains a collision");
  }
  internalToWire.set(internal, wire);
  wireToInternal.set(wire, internal);
}

type TranslationDirection = "to-wire" | "from-wire";

function translatedKey(key: string, direction: TranslationDirection): string {
  const translated = direction === "to-wire"
    ? internalToWire.get(key)
    : wireToInternal.get(key);
  if (translated !== undefined) return translated;
  // A hostile durable key must never masquerade as a minified in-memory key.
  if (direction === "from-wire" && internalKeySet.has(key)) {
    throw new TypeError("Durable RunStateV1 contains an internal-only key");
  }
  return key;
}

function defineData(target: object, key: string, value: unknown): void {
  if (Object.hasOwn(target, key)) {
    throw new TypeError("RunStateV1 key translation produced a collision");
  }
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function translate(
  value: unknown,
  direction: TranslationDirection,
  seen: Map<object, unknown>,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  const prior = seen.get(value);
  if (prior !== undefined) return prior;
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("RunStateV1 arrays must be dense data arrays");
      }
      output.push(translate(descriptor.value, direction, seen));
    }
    return output;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("RunStateV1 translation requires plain objects");
  }
  const output = Object.create(null) as Record<string, unknown>;
  seen.set(value, output);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError("RunStateV1 translation rejects symbol keys");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError("RunStateV1 translation requires enumerable data properties");
    }
    defineData(
      output,
      translatedKey(key, direction),
      translate(descriptor.value, direction, seen),
    );
  }
  return output;
}

/** Returns a detached null-prototype tree with immutable schema key names. */
export function toRunStateWireValue(value: unknown): unknown {
  return translate(value, "to-wire", new Map());
}

/** Returns a detached null-prototype tree using this build's runtime keys. */
export function fromRunStateWireValue(value: unknown): unknown {
  return translate(value, "from-wire", new Map());
}

const RUN_STATE_WIRE_KEY_COUNT_V1 = 137;
let productionBijectionCertificate:
  RunStateWireBijectionCertificateV1 | undefined;

function pairWitnesses(): readonly RunStateWireBijectionPairV1[] {
  return Object.freeze(INTERNAL_KEYS.map((internalKey, ordinal) =>
    Object.freeze({
      ordinal,
      internalKey,
      wireKey: RUN_STATE_WIRE_KEYS_V1[ordinal]!,
    })));
}

function enumerableDataValue(
  value: object,
  key: PropertyKey,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined || !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    throw new TypeError(`${label} must contain enumerable data properties`);
  }
  return descriptor.value;
}

function exactDataTreeEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null
  ) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (
      leftKeys.length !== rightKeys.length ||
      leftKeys.some((key, index) => key !== rightKeys[index])
    ) return false;
    return leftKeys.every((key) => key === "length" || exactDataTreeEqual(
      enumerableDataValue(left, key, "recursive source array"),
      enumerableDataValue(right, key, "recursive restored array"),
    ));
  }
  if (
    (Object.getPrototypeOf(left) !== Object.prototype &&
      Object.getPrototypeOf(left) !== null) ||
    Object.getPrototypeOf(right) !== null
  ) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  ) return false;
  return leftKeys.every((key) => exactDataTreeEqual(
    enumerableDataValue(left, key, "recursive source object"),
    enumerableDataValue(right, key, "recursive restored object"),
  ));
}

function recursivePairProbe(
  pairs: readonly RunStateWireBijectionPairV1[],
): readonly unknown[] {
  const leaves = pairs.map(({ ordinal, internalKey }) => {
    const leaf = Object.create(null) as Record<string, unknown>;
    defineData(leaf, internalKey, `pair-value-${ordinal}`);
    return leaf;
  });
  const first = Object.create(null) as Record<string, unknown>;
  const second = Object.create(null) as Record<string, unknown>;
  const third = Object.create(null) as Record<string, unknown>;
  defineData(first, pairs[0]!.internalKey, leaves.slice(0, 46));
  defineData(second, pairs[1]!.internalKey, [
    leaves.slice(46, 92),
    Object.freeze(["dense-array-sentinel", 137, true, null]),
  ]);
  defineData(third, pairs[2]!.internalKey, leaves.slice(92));
  return Object.freeze([first, Object.freeze([second, third])]);
}

/**
 * Executes the production RunStateV1 key-bijection theorem. The stable digest
 * intentionally excludes internal spellings, which property mangling may
 * change, while the executable pair checks still prove each runtime spelling
 * maps to its exact immutable durable key and back.
 */
export function certifyRunStateWireBijectionV1(
  mutatePairs?: RunStateWireBijectionPairMutator,
): RunStateWireBijectionCertificateV1 {
  if (mutatePairs === undefined && productionBijectionCertificate !== undefined) {
    return productionBijectionCertificate;
  }
  const actualPairs = pairWitnesses();
  const pairs = mutatePairs?.(actualPairs) ?? actualPairs;
  if (
    INTERNAL_KEYS.length !== RUN_STATE_WIRE_KEY_COUNT_V1 ||
    RUN_STATE_WIRE_KEYS_V1.length !== RUN_STATE_WIRE_KEY_COUNT_V1 ||
    pairs.length !== RUN_STATE_WIRE_KEY_COUNT_V1
  ) {
    throw new TypeError("RunStateV1 wire bijection must contain exactly 137 pairs");
  }
  const internalKeys = new Set<string>();
  const wireKeys = new Set<string>();
  pairs.forEach((pair, ordinal) => {
    if (
      pair.ordinal !== ordinal ||
      pair.internalKey !== INTERNAL_KEYS[ordinal] ||
      pair.wireKey !== RUN_STATE_WIRE_KEYS_V1[ordinal]
    ) {
      throw new TypeError(`RunStateV1 wire bijection pair ${ordinal} changed`);
    }
    if (internalKeys.has(pair.internalKey) || wireKeys.has(pair.wireKey)) {
      throw new TypeError("RunStateV1 wire bijection contains a duplicate key");
    }
    internalKeys.add(pair.internalKey);
    wireKeys.add(pair.wireKey);
  });

  const flatProbe = Object.create(null) as Record<string, unknown>;
  pairs.forEach(({ ordinal, internalKey }) => {
    defineData(flatProbe, internalKey, `pair-value-${ordinal}`);
  });
  const flatWire = toRunStateWireValue(flatProbe);
  if (typeof flatWire !== "object" || flatWire === null || Array.isArray(flatWire)) {
    throw new TypeError("RunStateV1 wire bijection flat witness is not an object");
  }
  const flatWireKeys = Reflect.ownKeys(flatWire);
  if (
    flatWireKeys.length !== pairs.length ||
    pairs.some(({ ordinal, wireKey }) =>
      flatWireKeys[ordinal] !== wireKey ||
      enumerableDataValue(flatWire, wireKey, "flat wire witness") !==
        `pair-value-${ordinal}`)
  ) {
    throw new TypeError("RunStateV1 wire bijection changed an exact pair mapping");
  }
  const flatRestored = fromRunStateWireValue(flatWire);
  if (!exactDataTreeEqual(flatProbe, flatRestored)) {
    throw new TypeError("RunStateV1 wire bijection flat inverse changed data");
  }

  const recursiveProbe = recursivePairProbe(pairs);
  const recursiveWire = toRunStateWireValue(recursiveProbe);
  const recursiveRestored = fromRunStateWireValue(recursiveWire);
  if (!exactDataTreeEqual(recursiveProbe, recursiveRestored)) {
    throw new TypeError("RunStateV1 wire bijection recursive inverse changed data");
  }
  const certificate = Object.freeze({
    certificateId: RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID,
    keyCount: pairs.length,
    pairDigest: fnv1a64Hex(pairs.map(({ ordinal, wireKey }) =>
      `${ordinal}\0${wireKey}`).join("\n")),
    recursiveInverseDigest: fnv1a64Hex(JSON.stringify(recursiveWire)),
  });
  if (mutatePairs === undefined) productionBijectionCertificate = certificate;
  return certificate;
}
