import type { CatalogDomain, CatalogRegistry } from "./catalog";
import { deepFreeze as deepFreezeDecodedState } from "./immutable";
import {
  fromRunStateWireValue,
  toRunStateWireValue,
} from "./run-state-wire";
import {
  EFFECT_SOURCES,
  RUN_STATE_CONTENT_VERSION,
  RUN_STATE_MAX_UTF8_BYTES,
  RUN_STATE_SCHEMA_VERSION,
  SCORE_IDS,
  STARTING_PROFILE_SCORES,
  type AppliedEffect,
  type EffectSource,
  type ResolutionRecord,
  type RunStateV1,
  type ScoreId,
} from "./run-state";
import { deriveRunIdV1 } from "./run-factory";
import { deriveEntityInstanceIdV1 } from "./instance-id";
import { RUNNER_LABORATORY_STAGE_ID } from "./runner/contract";
import {
  assertRunnerLaboratorySaveInvariants,
  assertRunnerLaboratorySaveInvariantsForCourse,
  provesRunnerLaboratoryFutureInvulnerability,
  RunnerLaboratorySaveInvariantError,
} from "./runner/save-invariants";
import type { RunnerLabGeneratedCourse } from "./runner/course-generator";

export type DecodeErrorCode =
  | "oversized"
  | "malformed-json"
  | "invalid-root"
  | "unsupported-schema"
  | "unsupported-content"
  | "invalid-structure"
  | "invalid-catalog"
  | "invalid-semantics"
  | "migration-failed";

export type DecodeResult =
  | { readonly kind: "ready"; readonly state: RunStateV1; readonly migratedFrom: 0 | null }
  | {
      readonly kind: "invalid";
      readonly code: DecodeErrorCode;
      readonly schemaVersion: number | null;
      readonly contentVersion: string | null;
    };

export type RunStateValidationResult =
  | { readonly ok: true; readonly state: RunStateV1 }
  | { readonly ok: false; readonly code: "invalid-structure" | "invalid-catalog" | "invalid-semantics"; readonly path: string };

export interface RunStateV0 extends Omit<RunStateV1, "schemaVersion" | "accessibility"> {
  readonly schemaVersion: 0;
  readonly accessibility: Omit<RunStateV1["accessibility"], "screenReaderAnnouncements">;
}

export class RunStateEncodeError extends Error {
  readonly code: "oversized" | "not-serializable";

  constructor(code: "oversized" | "not-serializable", message: string) {
    super(message);
    this.name = "RunStateEncodeError";
    this.code = code;
  }
}

class ValidationFailure extends Error {
  readonly code: "invalid-structure" | "invalid-catalog" | "invalid-semantics";
  readonly path: string;

  constructor(code: ValidationFailure["code"], path: string, message: string) {
    // The public validation contract is the stable code/path pair. Detailed
    // prose is useful while developing and in the test suite, but retaining
    // every diagnostic in the production bundle duplicates that contract at
    // considerable cost. Vite folds this branch and Terser drops the unused
    // message arguments in production builds.
    super(import.meta.env.DEV ? message : "");
    this.code = code;
    this.path = path;
  }
}

const SAFE_INTEGER_MAX = Number.MAX_SAFE_INTEGER;
const CATALOG_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const INSTANCE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const RUN_ID = /^run-[0-9a-f]{16}$/;
const RUN_SEED = /^[0-9a-f]{16}$/;

// These sentinels deliberately use unquoted properties. Property-mangled
// production builds therefore derive this build's internal field spelling,
// while the wire adapter remains responsible for the durable JSON spelling.
const ROOT_KEYS = Object.keys({
  schemaVersion: 0,
  contentVersion: 0,
  runId: 0,
  runSeed: 0,
  runStatus: 0,
  difficulty: 0,
  controlMode: 0,
  identity: 0,
  appearance: 0,
  accessibility: 0,
  startingProfileId: 0,
  scores: 0,
  effectLedger: 0,
  storyState: 0,
  stage: 0,
  runner: 0,
  recovery: 0,
  encounter: 0,
  consequences: 0,
  simulationTick: 0,
});
const TERMINAL_STATUS_KEY = Object.keys({ status: 0 })[0]!;

function fail(code: ValidationFailure["code"], path: string, message: string): never {
  if (import.meta.env.DEV) throw new ValidationFailure(code, path, message);
  throw new ValidationFailure(code, path, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectAt(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)) fail("invalid-structure", path, "Expected a plain object");
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    fail("invalid-structure", path, "Symbol keys are not serializable state");
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid-structure", path, "Object keys do not match the locked schema");
  }
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail("invalid-structure", `${path}/${key}`, "State fields must be enumerable data properties");
    }
  }
  return value;
}

function arrayAt(value: unknown, path: string, maxItems: number, minItems = 0): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    fail("invalid-structure", path, `Expected ${minItems}..${maxItems} array items`);
  }
  const expectedKeys = new Set([...Array.from({ length: value.length }, (_, index) => String(index)), "length"]);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key)) ||
    ownKeys.length !== expectedKeys.size
  ) {
    fail("invalid-structure", path, "Array must be dense and contain no named or symbol properties");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail("invalid-structure", `${path}/${index}`, "Array items must be enumerable data properties");
    }
  }
  return value;
}

function stringAt(value: unknown, path: string, maxLength?: number, minLength = 0): string {
  if (typeof value !== "string") {
    fail("invalid-structure", path, "Expected a bounded Unicode-scalar string");
  }
  let scalarLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail("invalid-structure", path, "String contains an unpaired high surrogate");
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail("invalid-structure", path, "String contains an unpaired low surrogate");
    }
    scalarLength += 1;
  }
  if (scalarLength < minLength || (maxLength !== undefined && scalarLength > maxLength)) {
    fail("invalid-structure", path, "Expected a bounded string");
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("invalid-structure", path, "Expected a boolean");
  return value;
}

function integerAt(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < minimum || value > maximum) {
    fail("invalid-structure", path, "Expected an integer in range");
  }
  return value;
}

function enumAt<T extends string | number>(value: unknown, path: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) fail("invalid-structure", path, "Unexpected discriminator");
  return value as T;
}

function catalogIdAt(value: unknown, path: string): string {
  const id = stringAt(value, path, 64, 1);
  if (!CATALOG_ID.test(id)) fail("invalid-structure", path, "Invalid catalog ID");
  return id;
}

function nullableCatalogIdAt(value: unknown, path: string): string | null {
  return value === null ? null : catalogIdAt(value, path);
}

function instanceIdAt(value: unknown, path: string): string {
  const id = stringAt(value, path, 64, 1);
  if (!INSTANCE_ID.test(id)) fail("invalid-structure", path, "Invalid instance ID");
  return id;
}

function uniqueStrings(items: readonly unknown[], path: string, validator: (value: unknown, path: string) => string): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const id = validator(item, `${path}/${index}`);
    if (seen.has(id)) fail("invalid-structure", `${path}/${index}`, "Duplicate ID");
    seen.add(id);
  });
}

const CATALOG_RULE = 0 as const;
const INSTANCE_RULE = 1 as const;
const BOOLEAN_RULE = 2 as const;
const INTEGER_RULE = 3 as const;
const ENUM_RULE = 4 as const;
const STRING_RULE = 5 as const;
const OBJECT_RULE = 6 as const;
const ARRAY_RULE = 7 as const;
const NULLABLE_RULE = 8 as const;

type StructureRule =
  | typeof CATALOG_RULE
  | typeof INSTANCE_RULE
  | typeof BOOLEAN_RULE
  | readonly [typeof INTEGER_RULE, number, number]
  | readonly [typeof ENUM_RULE, readonly (string | number)[]]
  | readonly [typeof STRING_RULE, number, number]
  | readonly [typeof OBJECT_RULE, Readonly<Record<string, StructureRule>>]
  | readonly [typeof ARRAY_RULE, number, number, StructureRule, boolean?]
  | readonly [typeof NULLABLE_RULE, StructureRule];

const integerRule = (minimum: number, maximum = SAFE_INTEGER_MAX): StructureRule =>
  [INTEGER_RULE, minimum, maximum];
const enumRule = (choices: readonly (string | number)[]): StructureRule =>
  [ENUM_RULE, choices];
const objectRule = (fields: Readonly<Record<string, StructureRule>>): StructureRule =>
  [OBJECT_RULE, fields];
const arrayRule = (
  maximum: number,
  item: StructureRule,
  minimum = 0,
  unique = false,
): StructureRule => [ARRAY_RULE, maximum, minimum, item, unique];
const nullableRule = (rule: StructureRule): StructureRule => [NULLABLE_RULE, rule];

function validateRule(value: unknown, path: string, rule: StructureRule): void {
  if (rule === CATALOG_RULE) {
    catalogIdAt(value, path);
    return;
  }
  if (rule === INSTANCE_RULE) {
    instanceIdAt(value, path);
    return;
  }
  if (rule === BOOLEAN_RULE) {
    booleanAt(value, path);
    return;
  }
  switch (rule[0]) {
    case INTEGER_RULE:
      integerAt(value, path, rule[1], rule[2]);
      return;
    case ENUM_RULE:
      enumAt(value, path, rule[1]);
      return;
    case STRING_RULE:
      stringAt(value, path, rule[1], rule[2]);
      return;
    case OBJECT_RULE: {
      const fields = rule[1];
      const record = objectAt(value, path, Object.keys(fields));
      for (const key of Object.keys(fields)) {
        validateRule(record[key], `${path}/${key}`, fields[key]!);
      }
      return;
    }
    case ARRAY_RULE: {
      const items = arrayAt(value, path, rule[1], rule[2]);
      if (rule[4]) {
        const itemRule = rule[3];
        uniqueStrings(
          items,
          path,
          itemRule === CATALOG_RULE ? catalogIdAt : instanceIdAt,
        );
      } else {
        items.forEach((item, index) =>
          validateRule(item, `${path}/${index}`, rule[3]));
      }
      return;
    }
    case NULLABLE_RULE:
      if (value !== null) validateRule(value, path, rule[1]);
  }
}

const TICK_RULE = integerRule(0);
const SCORE_RULE = objectRule({
  health: integerRule(0, 100),
  happiness: integerRule(0, 100),
  money: integerRule(0, 100),
});
const SCORE_TOTAL_RULE = objectRule({
  healthPositive: TICK_RULE,
  healthNegative: TICK_RULE,
  happinessPositive: TICK_RULE,
  happinessNegative: TICK_RULE,
  moneyPositive: TICK_RULE,
  moneyNegative: TICK_RULE,
});
const UNIQUE_CATALOGS = arrayRule(64, CATALOG_RULE, 0, true);
const UNIQUE_INSTANCES = arrayRule(64, INSTANCE_RULE, 0, true);
const RESOLUTION_RULE = objectRule({
  selectedOptionId: CATALOG_RULE,
  appliedEffectIds: UNIQUE_INSTANCES,
  factResultIds: UNIQUE_CATALOGS,
  relationshipResultIds: UNIQUE_INSTANCES,
  scheduledConsequenceTransactionIds: UNIQUE_INSTANCES,
  resultTextInputIds: UNIQUE_CATALOGS,
  resolvedTick: TICK_RULE,
});

function validateScores(value: unknown, path: string): void {
  validateRule(value, path, SCORE_RULE);
}

function validateEffectLedger(value: unknown, path: string): void {
  const appliedEffect = objectRule({
    effectId: INSTANCE_RULE,
    scoreId: enumRule(SCORE_IDS),
    requestedDelta: integerRule(-100, 100),
    source: enumRule(EFFECT_SOURCES),
    categoryId: CATALOG_RULE,
    causedByChoiceId: nullableRule(CATALOG_RULE),
    transactionId: nullableRule(INSTANCE_RULE),
    before: integerRule(0, 100),
    after: integerRule(0, 100),
    actualDelta: integerRule(-100, 100),
    simulationTick: TICK_RULE,
  });
  validateRule(value, path, objectRule({
    recent: arrayRule(128, appliedEffect),
    totalsBySource: objectRule(Object.fromEntries(
      EFFECT_SOURCES.map((source) => [source, SCORE_TOTAL_RULE]),
    )),
  }));
}

function validateStoryState(value: unknown, path: string): void {
  validateRule(value, path, objectRule({
    facts: arrayRule(256, objectRule({
      factId: CATALOG_RULE,
      kind: enumRule(["learning", "care", "community", "autonomy", "route"]),
      valueId: CATALOG_RULE,
      originChoiceId: nullableRule(CATALOG_RULE),
    })),
    memories: arrayRule(128, objectRule({
      memoryId: CATALOG_RULE,
      kind: enumRule(["milestone", "relationship", "challenge", "joy"]),
      stageId: CATALOG_RULE,
      summary: [STRING_RULE, 256, 1],
      originChoiceId: nullableRule(CATALOG_RULE),
    })),
    credentials: arrayRule(64, objectRule({
      credentialId: CATALOG_RULE,
      kind: enumRule(["education", "training", "license", "experience"]),
      level: integerRule(0, 10),
      earnedStageId: CATALOG_RULE,
    })),
    relationships: arrayRule(128, objectRule({
      relationshipId: INSTANCE_RULE,
      personId: CATALOG_RULE,
      kind: enumRule(["caregiver", "friend", "mentor", "partner", "colleague", "community"]),
      closeness: integerRule(0, 100),
      status: enumRule(["active", "distant", "ended"]),
    })),
    conditions: arrayRule(64, objectRule({
      conditionId: CATALOG_RULE,
      kind: enumRule(["support", "stress", "health", "opportunity", "constraint"]),
      severity: integerRule(1, 5),
      startedTick: TICK_RULE,
      expiresTick: nullableRule(TICK_RULE),
      originChoiceId: nullableRule(CATALOG_RULE),
    })),
  }));
}

const SETTLEMENT_RULE = objectRule({
  settlementId: INSTANCE_RULE,
  status: enumRule(["pending", "applied", "cancelled"]),
  startedTick: TICK_RULE,
  completedTick: nullableRule(TICK_RULE),
  effectIds: UNIQUE_INSTANCES,
});

function validateStage(value: unknown, path: string): void {
  validateRule(value, path, objectRule({
    stageId: CATALOG_RULE,
    phase: enumRule(["shell", "active", "settling", "complete"]),
    ageMonths: integerRule(0, 1800),
    activeTicks: TICK_RULE,
    worldDistanceMilli: TICK_RULE,
    durationTicks: TICK_RULE,
    settlement: nullableRule(SETTLEMENT_RULE),
  }));
}

function validateRunner(value: unknown, path: string): void {
  const runnerRule = objectRule({
    motion: objectRule({
      kind: enumRule(["idle", "moving"]),
      currentLane: integerRule(0, 2),
      sourceLane: integerRule(0, 2),
      targetLane: integerRule(0, 2),
      elapsedTicks: integerRule(0, 10),
      totalTicks: enumRule([11]),
    }),
    inputBuffer: nullableRule(enumRule(["up", "down"])),
    spawn: objectRule({
      patternIndex: TICK_RULE,
      nextSpawnDistanceMilli: TICK_RULE,
      nextSpawnTick: TICK_RULE,
      resolvedThroughPatternIndex: TICK_RULE,
      resolvedEntityIds: UNIQUE_INSTANCES,
    }),
    activeEntities: arrayRule(64, objectRule({
      instanceId: INSTANCE_RULE,
      contentId: CATALOG_RULE,
      kind: enumRule(["benefit", "hazard", "narrative", "opportunity"]),
      patternIndex: TICK_RULE,
      slotIndex: integerRule(0, 63),
      lane: integerRule(0, 2),
      xMilli: TICK_RULE,
      widthMilli: integerRule(1, 1_000_000),
      contactState: enumRule(["pending", "contacted", "passed"]),
    })),
    invulnerableUntilTick: TICK_RULE,
    userPaused: BOOLEAN_RULE,
  });
  validateRule(value, path, runnerRule);
  const runner = value as Record<string, unknown>;
  const motion = runner.motion as Record<string, unknown>;
  if (
    (motion.kind === "idle" && motion.elapsedTicks !== 0) ||
    (motion.kind === "moving" && (motion.elapsedTicks as number) < 1)
  ) {
    fail("invalid-structure", `${path}/motion/elapsedTicks`, "Lane tween elapsed tick is invalid");
  }
}

function validateRecovery(value: unknown, path: string): void {
  validateRule(value, path, objectRule({
    transactionId: INSTANCE_RULE,
    status: enumRule(["offered", "accepted", "cooldown"]),
    triggerEntityInstanceId: INSTANCE_RULE,
    preTriggerScores: SCORE_RULE,
    recoveryTarget: integerRule(1, 100),
    targetScores: SCORE_RULE,
    startedTick: TICK_RULE,
    resolveTick: TICK_RULE,
    invulnerableUntilTick: TICK_RULE,
    cooldownUntilTick: TICK_RULE,
  }));
}

function validateResolution(value: unknown, path: string): void {
  validateRule(value, path, RESOLUTION_RULE);
}

function validateEncounter(value: unknown, path: string): void {
  validateRule(value, path, objectRule({
    transactionId: INSTANCE_RULE,
    encounterId: CATALOG_RULE,
    kind: enumRule(["caregiver", "friend", "mentor", "stranger", "institution", "self-reflection"]),
    phase: enumRule(["presenting", "option-selected", "resolving", "resolved"]),
    optionIds: arrayRule(4, CATALOG_RULE, 2, true),
    selectedOptionId: nullableRule(CATALOG_RULE),
    resolutionTransactionId: nullableRule(INSTANCE_RULE),
    presentationPhase: enumRule(["prompt", "choices", "reaction", "summary"]),
  }));
}

function validatePendingConsequence(value: unknown, path: string): void {
  validateRule(value, path, objectRule({
    transactionId: INSTANCE_RULE,
    consequenceId: CATALOG_RULE,
    status: enumRule(["pending"]),
    causedByChoiceId: nullableRule(CATALOG_RULE),
    dueStageId: CATALOG_RULE,
    dueTick: TICK_RULE,
    effectIds: UNIQUE_INSTANCES,
  }));
}

function validateResolvedConsequence(value: unknown, path: string): void {
  const rule = objectRule({
    transactionId: INSTANCE_RULE,
    consequenceId: CATALOG_RULE,
    status: enumRule(["resolved", "presented"]),
    causedByChoiceId: nullableRule(CATALOG_RULE),
    resolution: RESOLUTION_RULE,
    presentedTick: nullableRule(TICK_RULE),
  });
  validateRule(value, path, rule);
  const consequence = value as Record<string, unknown>;
  if (
    (consequence.status === "resolved" && consequence.presentedTick !== null) ||
    (consequence.status === "presented" && consequence.presentedTick === null)
  ) {
    fail("invalid-structure", `${path}/presentedTick`, "Consequence presentation tick is invalid");
  }
}

function validateTerminalConsequence(value: unknown, path: string): void {
  if (!isPlainObject(value)) fail("invalid-structure", path, "Expected terminal consequence");
  const statusDescriptor = Object.getOwnPropertyDescriptor(
    value,
    TERMINAL_STATUS_KEY,
  );
  if (statusDescriptor === undefined || !statusDescriptor.enumerable || !("value" in statusDescriptor)) {
    fail("invalid-structure", `${path}/status`, "Terminal status must be an enumerable data property");
  }
  const status = enumAt(statusDescriptor.value, `${path}/status`, ["complete", "expired", "superseded"] as const);
  if (status === "complete") {
    const consequence = objectAt(
      value,
      path,
      Object.keys({
        transactionId: 0,
        consequenceId: 0,
        status: 0,
        causedByChoiceId: 0,
        resolution: 0,
        presentedTick: 0,
        terminalTick: 0,
        terminalReasonId: 0,
        supersededByTransactionId: 0,
        acknowledgmentId: 0,
      }),
    );
    instanceIdAt(consequence.transactionId, `${path}/transactionId`);
    catalogIdAt(consequence.consequenceId, `${path}/consequenceId`);
    nullableCatalogIdAt(consequence.causedByChoiceId, `${path}/causedByChoiceId`);
    validateResolution(consequence.resolution, `${path}/resolution`);
    integerAt(consequence.presentedTick, `${path}/presentedTick`, 0, SAFE_INTEGER_MAX);
    integerAt(consequence.terminalTick, `${path}/terminalTick`, 0, SAFE_INTEGER_MAX);
    catalogIdAt(consequence.terminalReasonId, `${path}/terminalReasonId`);
    if (consequence.supersededByTransactionId !== null) fail("invalid-structure", `${path}/supersededByTransactionId`, "Complete consequence has no replacement");
    nullableCatalogIdAt(consequence.acknowledgmentId, `${path}/acknowledgmentId`);
    return;
  }
  const consequence = objectAt(
    value,
    path,
    Object.keys({
      transactionId: 0,
      consequenceId: 0,
      status: 0,
      causedByChoiceId: 0,
      resolution: 0,
      terminalTick: 0,
      terminalReasonId: 0,
      supersededByTransactionId: 0,
      acknowledgmentId: 0,
    }),
  );
  instanceIdAt(consequence.transactionId, `${path}/transactionId`);
  catalogIdAt(consequence.consequenceId, `${path}/consequenceId`);
  nullableCatalogIdAt(consequence.causedByChoiceId, `${path}/causedByChoiceId`);
  if (consequence.resolution !== null) fail("invalid-structure", `${path}/resolution`, "Terminal path has no resolution");
  integerAt(consequence.terminalTick, `${path}/terminalTick`, 0, SAFE_INTEGER_MAX);
  catalogIdAt(consequence.terminalReasonId, `${path}/terminalReasonId`);
  if (status === "expired") {
    if (consequence.supersededByTransactionId !== null) fail("invalid-structure", `${path}/supersededByTransactionId`, "Expired consequence has no replacement");
  } else {
    instanceIdAt(consequence.supersededByTransactionId, `${path}/supersededByTransactionId`);
  }
  catalogIdAt(consequence.acknowledgmentId, `${path}/acknowledgmentId`);
}

function validateConsequenceState(value: unknown, path: string): void {
  const state = objectAt(
    value,
    path,
    Object.keys({ pending: 0, resolved: 0, terminal: 0 }),
  );
  arrayAt(state.pending, `${path}/pending`, 64).forEach((item, index) => validatePendingConsequence(item, `${path}/pending/${index}`));
  arrayAt(state.resolved, `${path}/resolved`, 64).forEach((item, index) => validateResolvedConsequence(item, `${path}/resolved/${index}`));
  arrayAt(state.terminal, `${path}/terminal`, 128).forEach((item, index) => validateTerminalConsequence(item, `${path}/terminal/${index}`));
}

function validateStructure(value: unknown): RunStateV1 {
  const root = objectAt(value, "", ROOT_KEYS);
  if (root.schemaVersion !== RUN_STATE_SCHEMA_VERSION) fail("invalid-structure", "/schemaVersion", "Wrong schema version");
  if (root.contentVersion !== RUN_STATE_CONTENT_VERSION) fail("invalid-structure", "/contentVersion", "Wrong content version");
  const runId = stringAt(root.runId, "/runId", 20, 20);
  if (!RUN_ID.test(runId)) fail("invalid-structure", "/runId", "Invalid run ID");
  const runSeed = stringAt(root.runSeed, "/runSeed", 16, 16);
  if (!RUN_SEED.test(runSeed)) fail("invalid-structure", "/runSeed", "Invalid run seed");
  enumAt(root.runStatus, "/runStatus", ["setup", "active", "completed"] as const);
  enumAt(root.difficulty, "/difficulty", ["story", "normal", "challenge"] as const);
  enumAt(root.controlMode, "/controlMode", ["manual", "semantic-assist", "automatic-assist"] as const);
  const identity = objectAt(
    root.identity,
    "/identity",
    Object.keys({ gender: 0 }),
  );
  enumAt(identity.gender, "/identity/gender", ["female", "male"] as const);
  const appearance = objectAt(
    root.appearance,
    "/appearance",
    Object.keys({
      heritageStyleId: 0,
      hairStyleId: 0,
      hairColorId: 0,
      clothingPaletteId: 0,
    }),
  );
  enumAt(appearance.heritageStyleId, "/appearance/heritageStyleId", ["asian", "western", "black", "middle-eastern"] as const);
  enumAt(appearance.hairStyleId, "/appearance/hairStyleId", ["short-soft", "wavy-bob", "curly-crown", "tied-back"] as const);
  enumAt(appearance.hairColorId, "/appearance/hairColorId", ["black", "dark-brown", "warm-brown", "silver"] as const);
  enumAt(appearance.clothingPaletteId, "/appearance/clothingPaletteId", ["sunrise", "meadow", "ocean", "berry"] as const);
  const accessibility = objectAt(
    root.accessibility,
    "/accessibility",
    Object.keys({
      highContrast: 0,
      reducedMotion: 0,
      textScale: 0,
      screenReaderAnnouncements: 0,
    }),
  );
  booleanAt(accessibility.highContrast, "/accessibility/highContrast");
  booleanAt(accessibility.reducedMotion, "/accessibility/reducedMotion");
  enumAt(accessibility.textScale, "/accessibility/textScale", [100, 125, 150, 200] as const);
  booleanAt(accessibility.screenReaderAnnouncements, "/accessibility/screenReaderAnnouncements");
  enumAt(root.startingProfileId, "/startingProfileId", ["steady-mix-v1", "physical-head-start-v1", "emotional-head-start-v1", "resource-head-start-v1"] as const);
  validateScores(root.scores, "/scores");
  validateEffectLedger(root.effectLedger, "/effectLedger");
  validateStoryState(root.storyState, "/storyState");
  validateStage(root.stage, "/stage");
  if (root.runner !== null) validateRunner(root.runner, "/runner");
  if (root.recovery !== null) validateRecovery(root.recovery, "/recovery");
  if (root.encounter !== null) validateEncounter(root.encounter, "/encounter");
  validateConsequenceState(root.consequences, "/consequences");
  integerAt(root.simulationTick, "/simulationTick", 0, SAFE_INTEGER_MAX);
  return value as RunStateV1;
}

function requireCatalog(catalogs: CatalogRegistry, domain: CatalogDomain, id: string, path: string): void {
  if (!catalogs.has(domain, id)) fail("invalid-catalog", path, `Unknown ${domain} ID`);
}

function requireCatalogKind(
  catalogs: CatalogRegistry,
  domain: CatalogDomain,
  id: string,
  kind: string,
  path: string,
): void {
  requireCatalog(catalogs, domain, id, path);
  const metadata = catalogs.metadata(domain, id);
  if (metadata?.kind !== kind) fail("invalid-catalog", path, `${domain} ID has the wrong discriminator`);
}

function requireUnique(ids: readonly string[], path: string): void {
  if (new Set(ids).size !== ids.length) fail("invalid-semantics", path, "IDs must be unique");
}

function validateChoiceCause(catalogs: CatalogRegistry, id: string | null, path: string): void {
  if (id !== null) requireCatalog(catalogs, "choice", id, path);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function totalDelta(state: RunStateV1, score: ScoreId): number {
  const positive = `${score}Positive` as const;
  const negative = `${score}Negative` as const;
  let delta = 0;
  for (const source of EFFECT_SOURCES) {
    delta += state.effectLedger.totalsBySource[source][positive] - state.effectLedger.totalsBySource[source][negative];
    if (!Number.isSafeInteger(delta)) fail("invalid-semantics", "/effectLedger/totalsBySource", "Aggregate overflow");
  }
  return delta;
}

function validateResolutionSemantics(
  state: RunStateV1,
  catalogs: CatalogRegistry,
  transactionId: string,
  causedByChoiceId: string | null,
  resolution: ResolutionRecord,
  allTransactionIds: ReadonlySet<string>,
  path: string,
): void {
  requireCatalog(catalogs, "option", resolution.selectedOptionId, `${path}/selectedOptionId`);
  const selectedChoiceId = catalogs.metadata("option", resolution.selectedOptionId)?.choiceId ?? null;
  if (causedByChoiceId !== null && (selectedChoiceId === null || selectedChoiceId !== causedByChoiceId)) {
    fail("invalid-semantics", `${path}/selectedOptionId`, "Selected option does not match the transaction choice cause");
  }
  if (resolution.resolvedTick > state.simulationTick) fail("invalid-semantics", `${path}/resolvedTick`, "Resolution is in the future");
  const effects = new Map(state.effectLedger.recent.map((effect) => [effect.effectId, effect]));
  const retentionFloorTick = state.effectLedger.recent.length === 128
    ? Math.min(...state.effectLedger.recent.map((effect) => effect.simulationTick))
    : null;
  for (const effectId of resolution.appliedEffectIds) {
    const effect = effects.get(effectId);
    if (effect === undefined) {
      if (retentionFloorTick === null || resolution.resolvedTick > retentionFloorTick) {
        fail("invalid-semantics", `${path}/appliedEffectIds`, "Owned effect is missing before the ledger retention boundary");
      }
      continue;
    }
    if (
      effect.transactionId !== transactionId ||
      effect.causedByChoiceId !== causedByChoiceId ||
      effect.simulationTick !== resolution.resolvedTick
    ) {
      fail("invalid-semantics", `${path}/appliedEffectIds`, "Owned effect has inconsistent transaction, cause, or resolution tick");
    }
  }
  const listedEffectIds = new Set(resolution.appliedEffectIds);
  for (const effect of state.effectLedger.recent) {
    if (effect.transactionId !== transactionId) continue;
    if (
      !listedEffectIds.has(effect.effectId) ||
      effect.causedByChoiceId !== causedByChoiceId ||
      effect.simulationTick !== resolution.resolvedTick
    ) {
      fail("invalid-semantics", `${path}/appliedEffectIds`, "Retained transaction effects must exactly match the resolution");
    }
  }
  const facts = new Map(state.storyState.facts.map((fact) => [fact.factId, fact]));
  resolution.factResultIds.forEach((id) => {
    const fact = facts.get(id);
    if (fact === undefined) fail("invalid-semantics", `${path}/factResultIds`, "Resolution fact is missing");
    if (fact.originChoiceId !== causedByChoiceId) {
      fail("invalid-semantics", `${path}/factResultIds`, "Resolution fact does not match the transaction choice cause");
    }
  });
  const relationshipIds = new Set(state.storyState.relationships.map((relationship) => relationship.relationshipId));
  resolution.relationshipResultIds.forEach((id) => {
    if (!relationshipIds.has(id)) fail("invalid-semantics", `${path}/relationshipResultIds`, "Resolution relationship is missing");
  });
  resolution.scheduledConsequenceTransactionIds.forEach((id) => {
    if (!allTransactionIds.has(id)) fail("invalid-semantics", `${path}/scheduledConsequenceTransactionIds`, "Scheduled transaction is missing");
  });
  resolution.resultTextInputIds.forEach((id) => requireCatalog(catalogs, "text-input", id, `${path}/resultTextInputIds`));
}

function validateCatalogAndSemantics(
  state: RunStateV1,
  catalogs: CatalogRegistry,
  runnerLaboratoryCourse?: RunnerLabGeneratedCourse,
): void {
  if (catalogs.contentVersion !== state.contentVersion) fail("invalid-catalog", "/contentVersion", "Catalog content version mismatch");
  const validatesRunnerLaboratory =
    catalogs.hasCapability("runner-laboratory-v1") &&
    state.stage.stageId === RUNNER_LABORATORY_STAGE_ID;
  const expectedRunId = deriveRunIdV1(state.runSeed, {
    startingProfileId: state.startingProfileId,
    difficulty: state.difficulty,
    controlMode: state.controlMode,
    identity: state.identity,
  });
  if (state.runId !== expectedRunId) fail("invalid-semantics", "/runId", "Run ID does not match deterministic setup identity");
  requireCatalog(catalogs, "stage", state.stage.stageId, "/stage/stageId");

  const effectIds: string[] = [];
  const recentById = new Map<string, AppliedEffect>();
  const recentMagnitude = new Map<string, number>();
  const claimedEffectOwners = new Map<string, string>();
  const claimEffectIds = (ids: readonly string[], owner: string, path: string): void => {
    ids.forEach((id) => {
      const existing = claimedEffectOwners.get(id);
      if (existing !== undefined) {
        fail("invalid-semantics", path, `Effect ID is claimed by both ${existing} and ${owner}`);
      }
      claimedEffectOwners.set(id, owner);
    });
  };
  const latestScoreAfter = new Map<ScoreId, number>();
  let previousEffectTick = -1;
  state.effectLedger.recent.forEach((effect, index) => {
    const path = `/effectLedger/recent/${index}`;
    effectIds.push(effect.effectId);
    recentById.set(effect.effectId, effect);
    if (effect.simulationTick < previousEffectTick) {
      fail("invalid-semantics", `${path}/simulationTick`, "Recent effects are not in application order");
    }
    previousEffectTick = effect.simulationTick;
    const priorAfter = latestScoreAfter.get(effect.scoreId);
    if (priorAfter !== undefined && effect.before !== priorAfter) {
      fail("invalid-semantics", path, "Retained effects do not form a continuous score history");
    }
    latestScoreAfter.set(effect.scoreId, effect.after);
    requireCatalog(catalogs, "effect-category", effect.categoryId, `${path}/categoryId`);
    if (!(catalogs.metadata("effect-category", effect.categoryId)?.allowedEffectSources?.includes(effect.source) ?? false)) {
      fail("invalid-catalog", `${path}/categoryId`, "Effect category does not allow this source");
    }
    validateChoiceCause(catalogs, effect.causedByChoiceId, `${path}/causedByChoiceId`);
    if (effect.source === "choice" && effect.causedByChoiceId === null) fail("invalid-semantics", `${path}/causedByChoiceId`, "Choice effect requires a cause");
    if ((effect.source === "callback" || effect.source === "settlement") && effect.causedByChoiceId === null) {
      fail("invalid-semantics", `${path}/source`, "Unattributed callback/settlement must have been reclassified as system");
    }
    if ((effect.source === "runner" || effect.source === "system" || effect.source === "recovery") && effect.causedByChoiceId !== null) {
      fail("invalid-semantics", `${path}/causedByChoiceId`, "This source cannot carry a choice cause");
    }
    const expectedAfter = clampScore(effect.before + effect.requestedDelta);
    if (effect.after !== expectedAfter || effect.actualDelta !== effect.after - effect.before) {
      fail("invalid-semantics", path, "Effect arithmetic does not reconcile");
    }
    if (effect.simulationTick > state.simulationTick) fail("invalid-semantics", `${path}/simulationTick`, "Effect is in the future");
    const direction = effect.actualDelta >= 0 ? "Positive" : "Negative";
    const key = `${effect.source}:${effect.scoreId}${direction}`;
    recentMagnitude.set(key, (recentMagnitude.get(key) ?? 0) + Math.abs(effect.actualDelta));
  });
  requireUnique(effectIds, "/effectLedger/recent/*/effectId");
  for (const [scoreId, after] of latestScoreAfter) {
    if (state.scores[scoreId] !== after) {
      fail("invalid-semantics", `/scores/${scoreId}`, "Current score differs from the latest retained effect");
    }
  }
  for (const [key, magnitude] of recentMagnitude) {
    const [source, totalKey] = key.split(":") as [EffectSource, keyof RunStateV1["effectLedger"]["totalsBySource"][EffectSource]];
    if (magnitude > state.effectLedger.totalsBySource[source][totalKey]) {
      fail("invalid-semantics", "/effectLedger/totalsBySource", "Lifetime totals are below recent effects");
    }
  }
  const starting = STARTING_PROFILE_SCORES[state.startingProfileId];
  for (const score of SCORE_IDS) {
    if (starting[score] + totalDelta(state, score) !== state.scores[score]) {
      fail("invalid-semantics", `/scores/${score}`, "Lifetime ledger does not reconcile the score");
    }
  }

  const factIds: string[] = [];
  state.storyState.facts.forEach((fact, index) => {
    factIds.push(fact.factId);
    requireCatalogKind(catalogs, "fact", fact.factId, fact.kind, `/storyState/facts/${index}/factId`);
    requireCatalog(catalogs, "value", fact.valueId, `/storyState/facts/${index}/valueId`);
    validateChoiceCause(catalogs, fact.originChoiceId, `/storyState/facts/${index}/originChoiceId`);
  });
  requireUnique(factIds, "/storyState/facts/*/factId");
  const memoryIds: string[] = [];
  state.storyState.memories.forEach((memory, index) => {
    memoryIds.push(memory.memoryId);
    requireCatalogKind(catalogs, "memory", memory.memoryId, memory.kind, `/storyState/memories/${index}/memoryId`);
    requireCatalog(catalogs, "stage", memory.stageId, `/storyState/memories/${index}/stageId`);
    validateChoiceCause(catalogs, memory.originChoiceId, `/storyState/memories/${index}/originChoiceId`);
  });
  requireUnique(memoryIds, "/storyState/memories/*/memoryId");
  const credentialIds: string[] = [];
  state.storyState.credentials.forEach((credential, index) => {
    credentialIds.push(credential.credentialId);
    requireCatalogKind(catalogs, "credential", credential.credentialId, credential.kind, `/storyState/credentials/${index}/credentialId`);
    requireCatalog(catalogs, "stage", credential.earnedStageId, `/storyState/credentials/${index}/earnedStageId`);
  });
  requireUnique(credentialIds, "/storyState/credentials/*/credentialId");
  const relationshipIds: string[] = [];
  state.storyState.relationships.forEach((relationship, index) => {
    relationshipIds.push(relationship.relationshipId);
    requireCatalog(catalogs, "person", relationship.personId, `/storyState/relationships/${index}/personId`);
  });
  requireUnique(relationshipIds, "/storyState/relationships/*/relationshipId");
  const conditionIds: string[] = [];
  state.storyState.conditions.forEach((condition, index) => {
    conditionIds.push(condition.conditionId);
    requireCatalogKind(catalogs, "condition", condition.conditionId, condition.kind, `/storyState/conditions/${index}/conditionId`);
    validateChoiceCause(catalogs, condition.originChoiceId, `/storyState/conditions/${index}/originChoiceId`);
    if (condition.expiresTick !== null && condition.expiresTick < condition.startedTick) {
      fail("invalid-semantics", `/storyState/conditions/${index}/expiresTick`, "Condition expires before it starts");
    }
    if (condition.startedTick > state.simulationTick) {
      fail("invalid-semantics", `/storyState/conditions/${index}/startedTick`, "Condition starts in the future");
    }
  });
  requireUnique(conditionIds, "/storyState/conditions/*/conditionId");

  const combination = `${state.runStatus}:${state.stage.phase}`;
  if (!["setup:shell", "active:active", "active:settling", "completed:complete"].includes(combination)) {
    fail("invalid-semantics", "/stage/phase", "Invalid run/stage status pair");
  }
  if (state.stage.phase === "shell") {
    if (
      state.stage.stageId !== "setup-shell-v1" ||
      state.stage.ageMonths !== 0 ||
      state.stage.activeTicks !== 0 ||
      state.stage.worldDistanceMilli !== 0 ||
      state.stage.durationTicks !== 0 ||
      state.stage.settlement !== null ||
      state.runner !== null ||
      state.recovery !== null ||
      state.encounter !== null ||
      state.simulationTick !== 0 ||
      state.effectLedger.recent.length !== 0 ||
      state.storyState.facts.length !== 0 ||
      state.storyState.memories.length !== 0 ||
      state.storyState.credentials.length !== 0 ||
      state.storyState.relationships.length !== 0 ||
      state.storyState.conditions.length !== 0 ||
      state.consequences.pending.length !== 0 ||
      state.consequences.resolved.length !== 0 ||
      state.consequences.terminal.length !== 0 ||
      SCORE_IDS.some((score) => state.scores[score] !== STARTING_PROFILE_SCORES[state.startingProfileId][score]) ||
      EFFECT_SOURCES.some((source) => Object.values(state.effectLedger.totalsBySource[source]).some((value) => value !== 0))
    ) {
      fail("invalid-semantics", "/stage", "Setup shell must be a pristine starting snapshot");
    }
  } else if (state.stage.phase === "active") {
    if (
      state.stage.durationTicks <= 0 ||
      state.stage.activeTicks >= state.stage.durationTicks ||
      state.runner === null ||
      (state.stage.settlement !== null && state.stage.settlement.status !== "cancelled")
    ) {
      fail("invalid-semantics", "/stage", "Active stage is incomplete");
    }
  } else if (state.stage.phase === "settling") {
    if (
      state.stage.durationTicks <= 0 ||
      state.stage.activeTicks !== state.stage.durationTicks ||
      state.runner === null ||
      state.stage.settlement?.status !== "pending" ||
      state.recovery !== null ||
      state.encounter !== null
    ) {
      fail("invalid-semantics", "/stage", "Settling excludes recovery/encounter and requires pending settlement");
    }
  } else if (
    state.stage.durationTicks <= 0 ||
    state.stage.activeTicks !== state.stage.durationTicks ||
    state.runner !== null ||
    state.recovery !== null ||
    state.encounter !== null ||
    state.stage.settlement?.status !== "applied"
  ) {
    fail("invalid-semantics", "/stage", "Complete stage requires an applied settlement and no active transaction");
  }
  if (state.stage.settlement !== null) {
    const settlement = state.stage.settlement;
    const owned = state.effectLedger.recent.filter((effect) => effect.transactionId === settlement.settlementId);
    if (settlement.status === "pending" ? settlement.completedTick !== null : settlement.completedTick === null || settlement.completedTick < settlement.startedTick) {
      fail("invalid-semantics", "/stage/settlement/completedTick", "Settlement tick/status mismatch");
    }
    if (
      settlement.startedTick > state.simulationTick ||
      (settlement.completedTick !== null && settlement.completedTick > state.simulationTick)
    ) {
      fail("invalid-semantics", "/stage/settlement", "Settlement ticks cannot be in the future");
    }
    if (settlement.status === "cancelled") {
      if (settlement.effectIds.length !== 0 || owned.length !== 0) {
        fail("invalid-semantics", "/stage/settlement/effectIds", "Cancelled settlement cannot own effects");
      }
    } else {
      claimEffectIds(settlement.effectIds, settlement.settlementId, "/stage/settlement/effectIds");
      if (settlement.status === "pending") {
        if (owned.length !== 0 || settlement.effectIds.some((id) => recentById.has(id))) {
          fail("invalid-semantics", "/stage/settlement/effectIds", "Pending settlement effects must be unapplied reservations");
        }
      } else {
        const completedTick = settlement.completedTick;
        if (completedTick === null) fail("invalid-semantics", "/stage/settlement/completedTick", "Applied settlement lacks completion tick");
        const retentionFloorTick = state.effectLedger.recent.length === 128
          ? Math.min(...state.effectLedger.recent.map((effect) => effect.simulationTick))
          : null;
        settlement.effectIds.forEach((id) => {
          const effect = recentById.get(id);
          if (effect === undefined) {
            if (retentionFloorTick === null || completedTick > retentionFloorTick) {
              fail("invalid-semantics", "/stage/settlement/effectIds", "Applied settlement effect is missing before the retention boundary");
            }
          } else if (
            (effect.source !== "settlement" && effect.source !== "system") ||
            effect.transactionId !== settlement.settlementId ||
            effect.simulationTick !== completedTick
          ) {
            fail("invalid-semantics", "/stage/settlement/effectIds", "Applied settlement effect has inconsistent ownership");
          }
        });
        const listed = new Set(settlement.effectIds);
        if (owned.some((effect) => (effect.source !== "settlement" && effect.source !== "system") || effect.simulationTick !== completedTick || !listed.has(effect.effectId))) {
          fail("invalid-semantics", "/stage/settlement/effectIds", "Retained settlement effects do not exactly match the settlement record");
        }
      }
    }
  }
  if (state.stage.activeTicks > state.simulationTick) {
    fail("invalid-semantics", "/stage/activeTicks", "Stage active time cannot exceed simulation time");
  }

  if (state.runner !== null) {
    const { motion, spawn } = state.runner;
    if (motion.kind === "idle") {
      if (motion.currentLane !== motion.sourceLane || motion.currentLane !== motion.targetLane) fail("invalid-semantics", "/runner/motion", "Idle lanes differ");
    } else if (Math.abs(motion.sourceLane - motion.targetLane) !== 1 || (motion.currentLane !== motion.sourceLane && motion.currentLane !== motion.targetLane)) {
      fail("invalid-semantics", "/runner/motion", "Moving lane is not one adjacent transition");
    }
    if (spawn.resolvedThroughPatternIndex > spawn.patternIndex || spawn.nextSpawnDistanceMilli <= state.stage.worldDistanceMilli || spawn.nextSpawnTick <= state.simulationTick) {
      fail("invalid-semantics", "/runner/spawn", "Spawn cursor is not ahead of current state");
    }
    const activeIds = state.runner.activeEntities.map((entity) => entity.instanceId);
    requireUnique(activeIds, "/runner/activeEntities/*/instanceId");
    const activeCoordinates = state.runner.activeEntities.map(
      (entity) => `${entity.patternIndex}:${entity.slotIndex}`,
    );
    requireUnique(activeCoordinates, "/runner/activeEntities/*/(patternIndex,slotIndex)");
    const resolvedIds = new Set(spawn.resolvedEntityIds);
    if (
      catalogs.entityInstanceIdPolicy === "stable-coordinate-v1" &&
      spawn.resolvedEntityIds.some((id) => !/^entity-[0-9a-f]{16}$/.test(id))
    ) {
      fail("invalid-semantics", "/runner/spawn/resolvedEntityIds", "Resolved entity IDs do not use the stable-ID grammar");
    }
    state.runner.activeEntities.forEach((entity, index) => {
      requireCatalogKind(catalogs, "entity", entity.contentId, entity.kind, `/runner/activeEntities/${index}/contentId`);
      if (catalogs.entityInstanceIdPolicy === "stable-coordinate-v1") {
        const expectedInstanceId = deriveEntityInstanceIdV1({
          runSeed: state.runSeed,
          stageId: state.stage.stageId,
          patternIndex: entity.patternIndex,
          slotIndex: entity.slotIndex,
          contentId: entity.contentId,
        });
        if (entity.instanceId !== expectedInstanceId) {
          fail("invalid-semantics", `/runner/activeEntities/${index}/instanceId`, "Entity ID does not match stable coordinates");
        }
      }
      if (
        entity.patternIndex <= spawn.resolvedThroughPatternIndex ||
        entity.patternIndex > spawn.patternIndex ||
        resolvedIds.has(entity.instanceId)
      ) {
        fail("invalid-semantics", `/runner/activeEntities/${index}`, "Entity conflicts with spawn cursor/resolution ledger");
      }
    });
  }

  if (state.recovery !== null) {
    if (state.runner === null) fail("invalid-semantics", "/recovery", "Recovery requires runner state");
    const recovery = state.recovery;
    if (!(recovery.startedTick <= state.simulationTick && recovery.startedTick <= recovery.resolveTick && recovery.resolveTick <= recovery.invulnerableUntilTick && recovery.invulnerableUntilTick <= recovery.cooldownUntilTick)) {
      fail("invalid-semantics", "/recovery", "Recovery ticks are out of order");
    }
    if (state.runner.invulnerableUntilTick !== recovery.invulnerableUntilTick) fail("invalid-semantics", "/recovery/invulnerableUntilTick", "Runner invulnerability differs");
    if ((recovery.status === "offered" || recovery.status === "accepted") ? state.simulationTick >= recovery.resolveTick : state.simulationTick < recovery.resolveTick || state.simulationTick >= recovery.cooldownUntilTick) {
      fail("invalid-semantics", "/recovery/status", "Recovery status/tick mismatch");
    }
    if (
      recovery.status === "cooldown"
      && (
        SCORE_IDS.some((score) => state.scores[score] === 0)
        || state.effectLedger.recent.some((effect) =>
          effect.simulationTick > recovery.startedTick && effect.before > 0 && effect.after === 0
        )
      )
    ) {
      fail("invalid-semantics", "/recovery/status", "A new depletion during cooldown requires a new recovery transaction");
    }
    const triggerEntity = state.runner.activeEntities.find((entity) => entity.instanceId === recovery.triggerEntityInstanceId);
    if (recovery.status === "offered" || recovery.status === "accepted") {
      if (
        triggerEntity === undefined
        || triggerEntity.kind !== "hazard"
        || triggerEntity.contactState !== "contacted"
      ) {
        fail("invalid-semantics", "/recovery/triggerEntityInstanceId", "Unresolved recovery must identify its active contacted hazard");
      }
    } else if (
      triggerEntity === undefined
      && !state.runner.spawn.resolvedEntityIds.includes(recovery.triggerEntityInstanceId)
    ) {
      fail("invalid-semantics", "/recovery/triggerEntityInstanceId", "Cooldown recovery must retain its trigger as active or resolved");
    } else if (
      triggerEntity !== undefined
      && (triggerEntity.kind !== "hazard" || triggerEntity.contactState !== "contacted")
    ) {
      fail("invalid-semantics", "/recovery/triggerEntityInstanceId", "Active cooldown trigger must remain a contacted hazard");
    }
    const atomicGroups: Array<{ start: number; effects: AppliedEffect[]; depleted: Set<ScoreId> }> = [];
    for (let index = 0; index < state.effectLedger.recent.length; index += 1) {
      const effect = state.effectLedger.recent[index];
      if (effect?.source !== "runner" || effect.simulationTick !== recovery.startedTick) continue;
      const effects: AppliedEffect[] = [];
      for (let cursor = index; cursor < state.effectLedger.recent.length; cursor += 1) {
        const candidate = state.effectLedger.recent[cursor];
        if (candidate?.source !== "runner" || candidate.simulationTick !== recovery.startedTick) break;
        effects.push(candidate);
      }
      const snapshot: Record<ScoreId, number> = { ...state.scores };
      for (let cursor = state.effectLedger.recent.length - 1; cursor >= index; cursor -= 1) {
        const laterEffect = state.effectLedger.recent[cursor];
        if (laterEffect !== undefined) snapshot[laterEffect.scoreId] = laterEffect.before;
      }
      if (!SCORE_IDS.every((score) => snapshot[score] === recovery.preTriggerScores[score])) continue;
      const finalScores: Record<ScoreId, number> = { ...snapshot };
      let continuous = true;
      for (const candidate of effects) {
        if (candidate.before !== finalScores[candidate.scoreId]) {
          continuous = false;
          break;
        }
        finalScores[candidate.scoreId] = candidate.after;
      }
      if (!continuous) continue;
      const depleted = new Set(SCORE_IDS.filter((score) => snapshot[score] > 0 && finalScores[score] === 0));
      if (
        depleted.size > 0
        && SCORE_IDS.every((score) => depleted.has(score) || finalScores[score] === snapshot[score])
      ) {
        atomicGroups.push({ start: index, effects, depleted });
      }
    }
    const matchingGroups = atomicGroups;
    if (matchingGroups.length === 0) {
      fail("invalid-semantics", "/recovery/preTriggerScores", "Recovery lacks an exact depletion snapshot");
    }
    // A preceding clamped/no-op runner effect can yield the same snapshot. The
    // greatest start is the minimal suffix and therefore excludes semantically
    // irrelevant prior effects while preserving every meaningful depletion.
    const triggerGroup = matchingGroups.at(-1);
    if (triggerGroup === undefined) fail("invalid-semantics", "/recovery/preTriggerScores", "Recovery trigger is missing");
    const effectsAfterTrigger = state.effectLedger.recent.slice(
      triggerGroup.start + triggerGroup.effects.length
    );
    if (
      (recovery.status === "offered" || recovery.status === "accepted")
      && effectsAfterTrigger.length !== 0
    ) {
      fail("invalid-semantics", "/recovery/status", "Unresolved recovery must freeze effects after its atomic trigger");
    }
    const depleted = triggerGroup.depleted;
    const ownedRecoveryEffects = state.effectLedger.recent.filter((effect) => effect.transactionId === recovery.transactionId);
    if (recovery.status === "offered" || recovery.status === "accepted") {
      if (ownedRecoveryEffects.length !== 0) {
        fail("invalid-semantics", "/recovery/transactionId", "Unresolved recovery already owns applied effects");
      }
    } else if (ownedRecoveryEffects.length !== depleted.size) {
      fail("invalid-semantics", "/recovery/transactionId", "Cooldown recovery must own exactly its depleted-score restorations");
    }
    if (
      recovery.status === "cooldown"
      && effectsAfterTrigger.some((effect) =>
        effect.simulationTick < recovery.resolveTick
        || (
          effect.simulationTick === recovery.resolveTick
          && (effect.source !== "recovery" || effect.transactionId !== recovery.transactionId)
        )
      )
    ) {
      fail("invalid-semantics", "/recovery/status", "Resolved recovery must preserve an atomic freeze through its owned restoration");
    }
    for (const score of SCORE_IDS) {
      const expected = depleted.has(score) ? Math.max(1, Math.min(recovery.recoveryTarget, recovery.preTriggerScores[score])) : recovery.preTriggerScores[score];
      if (recovery.targetScores[score] !== expected) fail("invalid-semantics", `/recovery/targetScores/${score}`, "Recovery restoration rule mismatch");
      if (
        !depleted.has(score)
        && (recovery.status === "offered" || recovery.status === "accepted")
        && state.scores[score] !== recovery.preTriggerScores[score]
      ) {
        fail("invalid-semantics", `/recovery/preTriggerScores/${score}`, "Non-depleted score differs from the recovery snapshot");
      }
      if ((recovery.status === "offered" || recovery.status === "accepted") && depleted.has(score) && state.scores[score] !== 0) {
        fail("invalid-semantics", `/scores/${score}`, "Unresolved depleted score must remain zero");
      }
      if (recovery.status === "cooldown" && depleted.has(score)) {
        const restorations = ownedRecoveryEffects.filter((effect) =>
          effect.source === "recovery"
          && effect.scoreId === score
          && effect.simulationTick === recovery.resolveTick
          && effect.before === 0
          && effect.after === expected
          && effect.actualDelta === expected
        );
        if (restorations.length !== 1) {
          fail("invalid-semantics", `/recovery/targetScores/${score}`, "Resolved recovery lacks its authoritative restoration effect");
        }
      }
    }
    if (ownedRecoveryEffects.some((effect) => !depleted.has(effect.scoreId) || effect.source !== "recovery")) {
      fail("invalid-semantics", "/recovery/transactionId", "Recovery owns an effect outside its exact restoration set");
    }
    claimEffectIds(
      ownedRecoveryEffects.map((effect) => effect.effectId),
      recovery.transactionId,
      "/recovery/transactionId",
    );
  } else if (
    state.runner !== null &&
    state.runner.invulnerableUntilTick > state.simulationTick &&
    !(
      validatesRunnerLaboratory &&
      provesRunnerLaboratoryFutureInvulnerability(state)
    )
  ) {
    fail("invalid-semantics", "/runner/invulnerableUntilTick", "Invulnerability lacks an owning recovery transaction or an authentic laboratory hazard proof");
  }

  const pendingIds = state.consequences.pending.map((item) => item.transactionId);
  const resolvedIds = state.consequences.resolved.map((item) => item.transactionId);
  const terminalIds = state.consequences.terminal.map((item) => item.transactionId);
  requireUnique(pendingIds, "/consequences/pending/*/transactionId");
  requireUnique(resolvedIds, "/consequences/resolved/*/transactionId");
  requireUnique(terminalIds, "/consequences/terminal/*/transactionId");
  const allIds = [...pendingIds, ...resolvedIds, ...terminalIds];
  requireUnique(allIds, "/consequences/*/transactionId");
  const allIdSet = new Set(allIds);
  const recoveryTransactionId = state.recovery?.transactionId ?? null;
  const settlementTransactionId = state.stage.settlement?.settlementId ?? null;
  if (
    (recoveryTransactionId !== null && (allIdSet.has(recoveryTransactionId) || recoveryTransactionId === settlementTransactionId)) ||
    (settlementTransactionId !== null && allIdSet.has(settlementTransactionId)) ||
    (state.encounter !== null && (state.encounter.transactionId === recoveryTransactionId || state.encounter.transactionId === settlementTransactionId))
  ) {
    fail("invalid-semantics", "/consequences", "Logical transaction IDs have ambiguous owners");
  }
  const creationTicks = new Map<string, number>();
  const creationOwners = new Map<string, string>();
  const creationCauses = new Map<string, string | null>();
  const graph = new Map<string, string[]>();

  const recordCreationTicks = (
    resolution: ResolutionRecord,
    owner: string,
    causedByChoiceId: string | null,
    path: string,
  ): void => {
    resolution.scheduledConsequenceTransactionIds.forEach((id) => {
      const existingOwner = creationOwners.get(id);
      if (existingOwner !== undefined) {
        fail("invalid-semantics", path, `Scheduled transaction already has creator ${existingOwner}`);
      }
      creationOwners.set(id, owner);
      creationTicks.set(id, resolution.resolvedTick);
      creationCauses.set(id, causedByChoiceId);
    });
  };
  state.consequences.resolved.forEach((item, index) => recordCreationTicks(
    item.resolution,
    item.transactionId,
    item.causedByChoiceId,
    `/consequences/resolved/${index}/resolution/scheduledConsequenceTransactionIds`,
  ));
  state.consequences.terminal.forEach((item, index) => {
    if (item.status === "complete") recordCreationTicks(
      item.resolution,
      item.transactionId,
      item.causedByChoiceId,
      `/consequences/terminal/${index}/resolution/scheduledConsequenceTransactionIds`,
    );
  });

  state.consequences.pending.forEach((item, index) => {
    requireCatalog(catalogs, "consequence", item.consequenceId, `/consequences/pending/${index}/consequenceId`);
    requireCatalog(catalogs, "stage", item.dueStageId, `/consequences/pending/${index}/dueStageId`);
    validateChoiceCause(catalogs, item.causedByChoiceId, `/consequences/pending/${index}/causedByChoiceId`);
    const creationTick = creationTicks.get(item.transactionId);
    if (creationTick !== undefined && item.dueTick < creationTick) {
      fail("invalid-semantics", `/consequences/pending/${index}/dueTick`, "Pending consequence predates its creation");
    }
    if (creationCauses.has(item.transactionId) && creationCauses.get(item.transactionId) !== item.causedByChoiceId) {
      fail("invalid-semantics", `/consequences/pending/${index}/causedByChoiceId`, "Scheduled consequence changed its choice cause");
    }
    claimEffectIds(item.effectIds, item.transactionId, `/consequences/pending/${index}/effectIds`);
    if (item.effectIds.some((id) => recentById.has(id))) {
      fail("invalid-semantics", `/consequences/pending/${index}/effectIds`, "Pending consequence reuses an applied effect ID");
    }
  });
  state.consequences.resolved.forEach((item, index) => {
    const path = `/consequences/resolved/${index}`;
    requireCatalog(catalogs, "consequence", item.consequenceId, `${path}/consequenceId`);
    validateChoiceCause(catalogs, item.causedByChoiceId, `${path}/causedByChoiceId`);
    if (item.resolution.resolvedTick > state.simulationTick || (item.status === "presented" && (item.presentedTick === null || item.presentedTick < item.resolution.resolvedTick || item.presentedTick > state.simulationTick))) {
      fail("invalid-semantics", path, "Resolved consequence ticks are inconsistent");
    }
    const creationTick = creationTicks.get(item.transactionId);
    if (creationTick !== undefined && item.resolution.resolvedTick < creationTick) {
      fail("invalid-semantics", `${path}/resolution/resolvedTick`, "Resolved consequence predates its creation");
    }
    if (creationCauses.has(item.transactionId) && creationCauses.get(item.transactionId) !== item.causedByChoiceId) {
      fail("invalid-semantics", `${path}/causedByChoiceId`, "Resolved consequence changed its choice cause");
    }
    claimEffectIds(item.resolution.appliedEffectIds, item.transactionId, `${path}/resolution/appliedEffectIds`);
    validateResolutionSemantics(state, catalogs, item.transactionId, item.causedByChoiceId, item.resolution, allIdSet, `${path}/resolution`);
    graph.set(item.transactionId, [...item.resolution.scheduledConsequenceTransactionIds]);
  });
  state.consequences.terminal.forEach((item, index) => {
    const path = `/consequences/terminal/${index}`;
    requireCatalog(catalogs, "consequence", item.consequenceId, `${path}/consequenceId`);
    requireCatalog(catalogs, "terminal-reason", item.terminalReasonId, `${path}/terminalReasonId`);
    if (!(catalogs.metadata("terminal-reason", item.terminalReasonId)?.allowedTerminalStatuses?.includes(item.status) ?? false)) {
      fail("invalid-catalog", `${path}/terminalReasonId`, "Terminal reason does not allow this status");
    }
    validateChoiceCause(catalogs, item.causedByChoiceId, `${path}/causedByChoiceId`);
    if (item.acknowledgmentId !== null) requireCatalog(catalogs, "acknowledgment", item.acknowledgmentId, `${path}/acknowledgmentId`);
    if (item.terminalTick > state.simulationTick) fail("invalid-semantics", `${path}/terminalTick`, "Terminal consequence is in the future");
    const creationTick = creationTicks.get(item.transactionId);
    if (creationTick !== undefined && item.terminalTick < creationTick) {
      fail("invalid-semantics", `${path}/terminalTick`, "Terminal consequence predates its creation");
    }
    if (creationCauses.has(item.transactionId) && creationCauses.get(item.transactionId) !== item.causedByChoiceId) {
      fail("invalid-semantics", `${path}/causedByChoiceId`, "Terminal consequence changed its choice cause");
    }
    if (item.status === "complete") {
      if (creationTick !== undefined && item.resolution.resolvedTick < creationTick) {
        fail("invalid-semantics", `${path}/resolution/resolvedTick`, "Complete consequence resolved before its creation");
      }
      claimEffectIds(item.resolution.appliedEffectIds, item.transactionId, `${path}/resolution/appliedEffectIds`);
      if (item.presentedTick < item.resolution.resolvedTick || item.terminalTick < item.presentedTick) fail("invalid-semantics", path, "Complete transition ticks are out of order");
      validateResolutionSemantics(state, catalogs, item.transactionId, item.causedByChoiceId, item.resolution, allIdSet, `${path}/resolution`);
      graph.set(item.transactionId, [...item.resolution.scheduledConsequenceTransactionIds]);
    } else if (item.status === "superseded") {
      if (!allIdSet.has(item.supersededByTransactionId)) fail("invalid-semantics", `${path}/supersededByTransactionId`, "Replacement transaction is missing");
      const created = creationTicks.get(item.supersededByTransactionId);
      if (created === undefined) fail("invalid-semantics", `${path}/supersededByTransactionId`, "Replacement lacks an authoritative creation record");
      if (created > item.terminalTick) fail("invalid-semantics", `${path}/terminalTick`, "Replacement was created after supersession");
      graph.set(item.transactionId, [item.supersededByTransactionId]);
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail("invalid-semantics", "/consequences", "Consequence graph contains a cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  allIds.forEach(visit);

  if (state.encounter !== null) {
    const encounter = state.encounter;
    const matchingTransactions = [
      ...state.consequences.pending,
      ...state.consequences.resolved,
      ...state.consequences.terminal,
    ].filter((item) => item.transactionId === encounter.transactionId);
    requireCatalogKind(catalogs, "encounter", encounter.encounterId, encounter.kind, "/encounter/encounterId");
    const optionChoiceIds = new Set<string>();
    encounter.optionIds.forEach((id, index) => {
      const path = `/encounter/optionIds/${index}`;
      requireCatalog(catalogs, "option", id, path);
      const metadata = catalogs.metadata("option", id);
      if (metadata?.encounterId !== encounter.encounterId || metadata.choiceId === null) {
        fail("invalid-catalog", path, "Option does not belong to this encounter and choice");
      }
      optionChoiceIds.add(metadata.choiceId);
    });
    if (optionChoiceIds.size !== 1) fail("invalid-catalog", "/encounter/optionIds", "Encounter options span multiple choices");
    if (encounter.selectedOptionId !== null && !encounter.optionIds.includes(encounter.selectedOptionId)) fail("invalid-semantics", "/encounter/selectedOptionId", "Selected option is unavailable");
    if (state.recovery !== null && state.recovery.status !== "cooldown") fail("invalid-semantics", "/encounter", "Encounter excludes unresolved recovery");
    if (encounter.phase === "presenting") {
      if (encounter.selectedOptionId !== null || encounter.resolutionTransactionId !== null || matchingTransactions.length !== 0) {
        fail("invalid-semantics", "/encounter", "Presenting encounter has a premature result");
      }
    } else if (encounter.phase === "option-selected" || encounter.phase === "resolving") {
      if (encounter.selectedOptionId === null || encounter.resolutionTransactionId !== null || matchingTransactions.length !== 0) {
        fail("invalid-semantics", "/encounter", "Encounter selection has a premature resolution");
      }
    } else {
      if (encounter.selectedOptionId === null || encounter.resolutionTransactionId === null || encounter.transactionId !== encounter.resolutionTransactionId) {
        fail("invalid-semantics", "/encounter", "Resolved encounter lacks a sole authoritative transaction");
      }
      const matching = state.consequences.resolved.filter((item) => item.transactionId === encounter.resolutionTransactionId);
      const selectedChoiceId = catalogs.metadata("option", encounter.selectedOptionId)?.choiceId ?? null;
      if (
        matchingTransactions.length !== 1 ||
        matching.length !== 1 ||
        matching[0]?.resolution.selectedOptionId !== encounter.selectedOptionId ||
        selectedChoiceId === null ||
        matching[0]?.causedByChoiceId !== selectedChoiceId
      ) {
        fail("invalid-semantics", "/encounter/resolutionTransactionId", "Encounter does not reference exactly one matching resolution");
      }
    }
  }
  const liveEffectOwnerIds = new Set(allIds);
  if (recoveryTransactionId !== null) liveEffectOwnerIds.add(recoveryTransactionId);
  if (settlementTransactionId !== null) liveEffectOwnerIds.add(settlementTransactionId);
  if (state.encounter !== null) liveEffectOwnerIds.add(state.encounter.transactionId);
  state.effectLedger.recent.forEach((effect, index) => {
    if (
      effect.transactionId === null
      && ["choice", "callback", "settlement", "recovery"].includes(effect.source)
    ) {
      fail(
        "invalid-semantics",
        `/effectLedger/recent/${index}/transactionId`,
        "Transactional effect source requires an authoritative owner",
      );
    }
    const claimedOwner = claimedEffectOwners.get(effect.effectId);
    if (effect.source === "runner" && effect.transactionId !== null) {
      fail(
        "invalid-semantics",
        `/effectLedger/recent/${index}/transactionId`,
        "Runner effects cannot claim a transaction",
      );
    }
    if (
      effect.transactionId !== null
      && liveEffectOwnerIds.has(effect.transactionId)
      && claimedOwner !== effect.transactionId
    ) {
      fail(
        "invalid-semantics",
        `/effectLedger/recent/${index}/transactionId`,
        "Retained effect transaction lacks exactly one authoritative owner",
      );
    }
  });

  if (validatesRunnerLaboratory) {
    try {
      if (runnerLaboratoryCourse === undefined) {
        assertRunnerLaboratorySaveInvariants(state);
      } else {
        assertRunnerLaboratorySaveInvariantsForCourse(
          state,
          runnerLaboratoryCourse,
        );
      }
    } catch (error) {
      if (error instanceof RunnerLaboratorySaveInvariantError) {
        fail("invalid-semantics", error.path, error.message);
      }
      throw error;
    }
  }
}

export interface RunStateValidationOptions {
  readonly runnerLaboratoryCourse?: RunnerLabGeneratedCourse;
}

export function validateRunState(
  value: unknown,
  catalogs: CatalogRegistry,
  options?: RunStateValidationOptions,
): RunStateValidationResult {
  try {
    const state = validateStructure(value);
    validateCatalogAndSemantics(
      state,
      catalogs,
      options?.runnerLaboratoryCourse,
    );
    return { ok: true, state };
  } catch (error) {
    if (error instanceof ValidationFailure) return { ok: false, code: error.code, path: error.path };
    throw error;
  }
}

function readableMetadata(value: unknown): { schemaVersion: number | null; contentVersion: string | null } {
  if (!isPlainObject(value)) return { schemaVersion: null, contentVersion: null };
  // These quoted lookups intentionally address the durable JSON spelling,
  // before the wire adapter converts keys to this build's runtime names.
  const schemaVersion = value["schemaVersion"];
  const contentVersion = value["contentVersion"];
  return {
    schemaVersion: typeof schemaVersion === "number" && Number.isFinite(schemaVersion) ? schemaVersion : null,
    contentVersion: typeof contentVersion === "string" ? contentVersion : null,
  };
}

export interface RunStateMigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(value: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

export type RunStateMigrationResult =
  | { readonly ok: true; readonly value: Record<string, unknown>; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly reason: "invalid-version" | "missing-step" | "step-failed" };

export function migrateRunStateValue(
  value: Record<string, unknown>,
  targetVersion: number,
  steps: readonly RunStateMigrationStep[],
): RunStateMigrationResult {
  if (
    !Number.isSafeInteger(value.schemaVersion)
    || (value.schemaVersion as number) < 0
    || !Number.isSafeInteger(targetVersion)
    || targetVersion < 0
  ) {
    return { ok: false, reason: "invalid-version" };
  }
  const sourceVersion = value.schemaVersion as number;
  if (sourceVersion > targetVersion) return { ok: false, reason: "invalid-version" };
  const bySource = new Map<number, RunStateMigrationStep>();
  for (const step of steps) {
    if (
      !Number.isSafeInteger(step.fromVersion) ||
      step.fromVersion < 0 ||
      !Number.isSafeInteger(step.toVersion) ||
      step.toVersion < 0 ||
      step.toVersion !== step.fromVersion + 1 ||
      bySource.has(step.fromVersion)
    ) {
      return { ok: false, reason: "invalid-version" };
    }
    bySource.set(step.fromVersion, step);
  }
  let candidate: Record<string, unknown>;
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown;
    if (!isPlainObject(cloned)) return { ok: false, reason: "step-failed" };
    candidate = cloned;
  } catch {
    return { ok: false, reason: "step-failed" };
  }
  let currentVersion = sourceVersion;
  try {
    while (currentVersion < targetVersion) {
      const step = bySource.get(currentVersion);
      if (step === undefined) return { ok: false, reason: "missing-step" };
      const stepInput = JSON.parse(JSON.stringify(candidate)) as unknown;
      if (!isPlainObject(stepInput)) return { ok: false, reason: "step-failed" };
      const migrated = step.migrate(stepInput);
      if (!isPlainObject(migrated) || migrated.schemaVersion !== step.toVersion) {
        return { ok: false, reason: "step-failed" };
      }
      const cloned = JSON.parse(JSON.stringify(migrated)) as unknown;
      if (!isPlainObject(cloned)) return { ok: false, reason: "step-failed" };
      candidate = cloned;
      currentVersion = step.toVersion;
    }
  } catch {
    return { ok: false, reason: "step-failed" };
  }
  return { ok: true, value: candidate, migratedFrom: sourceVersion === targetVersion ? null : sourceVersion };
}

function migrateV0(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const accessibility = objectAt(
    value.accessibility,
    "/accessibility",
    Object.keys({ highContrast: 0, reducedMotion: 0, textScale: 0 }),
  );
  return {
    ...value,
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    accessibility: { ...accessibility, screenReaderAnnouncements: false },
  };
}

export const RUN_STATE_MIGRATIONS: readonly RunStateMigrationStep[] = Object.freeze([
  Object.freeze({ fromVersion: 0, toVersion: 1, migrate: migrateV0 }),
]);

export function decodeRunState(
  text: string,
  catalogs: CatalogRegistry,
  options?: RunStateValidationOptions,
): DecodeResult {
  const byteLength = utf8ByteLength(text);
  if (byteLength > RUN_STATE_MAX_UTF8_BYTES) {
    return { kind: "invalid", code: "oversized", schemaVersion: null, contentVersion: null };
  }
  let wireValue: unknown;
  try {
    wireValue = JSON.parse(text) as unknown;
  } catch {
    return { kind: "invalid", code: "malformed-json", schemaVersion: null, contentVersion: null };
  }
  if (!isPlainObject(wireValue)) return { kind: "invalid", code: "invalid-root", schemaVersion: null, contentVersion: null };
  const metadata = readableMetadata(wireValue);
  if (metadata.schemaVersion !== 0 && metadata.schemaVersion !== RUN_STATE_SCHEMA_VERSION) {
    return { kind: "invalid", code: "unsupported-schema", ...metadata };
  }
  if (metadata.contentVersion !== RUN_STATE_CONTENT_VERSION) {
    return { kind: "invalid", code: "unsupported-content", ...metadata };
  }
  let parsed: unknown;
  try {
    parsed = fromRunStateWireValue(wireValue);
  } catch {
    return { kind: "invalid", code: "invalid-structure", ...metadata };
  }
  if (!isPlainObject(parsed)) {
    return { kind: "invalid", code: "invalid-root", ...metadata };
  }
  const migration = migrateRunStateValue(parsed, RUN_STATE_SCHEMA_VERSION, RUN_STATE_MIGRATIONS);
  if (!migration.ok) return { kind: "invalid", code: "migration-failed", ...metadata };
  const candidate: unknown = migration.value;
  const migratedFrom = migration.migratedFrom as 0 | null;
  const validation = validateRunState(candidate, catalogs, options);
  if (!validation.ok) return { kind: "invalid", code: validation.code, ...metadata };
  return {
    kind: "ready",
    state: deepFreezeDecodedState(validation.state),
    migratedFrom,
  };
}

export function encodeRunState(state: RunStateV1): string {
  let text: string;
  try {
    // Reject forged in-memory shapes before translating them. Catalog and
    // semantic validation remain the save-store boundary's responsibility.
    validateStructure(state);
    text = JSON.stringify(toRunStateWireValue(state));
  } catch (error) {
    throw new RunStateEncodeError("not-serializable", error instanceof Error ? error.message : "State is not serializable");
  }
  if (utf8ByteLength(text) > RUN_STATE_MAX_UTF8_BYTES) throw new RunStateEncodeError("oversized", "Encoded run state exceeds 99,999 UTF-8 bytes");
  return text;
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function truncateUtf8(text: string, maximumBytes: number): string {
  if (maximumBytes <= 0) return "";
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const size = utf8ByteLength(character);
    if (bytes + size > maximumBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}
