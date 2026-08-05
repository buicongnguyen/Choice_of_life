import { deepFreeze } from "../immutable";
import type {
  AppliedEffect,
  CoreScores,
  EffectLedger,
  Lane,
  RunnerMotion,
  RunStateV1,
  ScoreId,
} from "../run-state";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_DIFFICULTY_CONTRACTS,
  RUNNER_LABORATORY_ENTITY_EFFECTS,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_MARKERS,
  RUNNER_LABORATORY_MOVEMENT_CONTRACT,
  RUNNER_LABORATORY_PATTERN_TEMPLATES,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
} from "./contract";
import type {
  RunnerLabGeneratedCourse,
  RunnerLabGeneratedEntity,
  RunnerLabGeneratedPattern,
} from "./course-generator";

/**
 * This module is evaluator-only. It deliberately does not import the
 * production geometry plan, lane controller, overlap helpers, contact
 * resolver, simulation reducer, or settlement implementation. Its arithmetic
 * is a second implementation of the immutable Phase 2 integer contracts.
 */

export interface IndependentAutomaticTargetInput {
  readonly patternIndex: number;
  readonly simulationTick: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: "up" | "down" | null;
  readonly bufferedIntent: "up" | "down" | null;
  readonly safeBoundaryTick: number;
  readonly utilityNumerator: number;
}

export interface IndependentAutomaticContactProjection {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly simulationTick: number;
  readonly outcome:
    | "benefit-applied"
    | "hazard-applied"
    | "hazard-suppressed";
  readonly effectId: string | null;
  readonly scoreId: ScoreId | null;
  readonly requestedDelta: number | null;
  readonly actualDelta: number | null;
}

export interface IndependentAutomaticEffectProjection {
  readonly effectId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly before: number;
  readonly after: number;
  readonly source: AppliedEffect["source"];
  readonly categoryId: string;
  readonly causedByChoiceId: string | null;
  readonly transactionId: string | null;
  readonly simulationTick: number;
}

export interface IndependentAutomaticContactGeometry {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly patternIndex: number;
  readonly slotIndex: number;
  readonly lane: Lane;
  readonly simulationTick: number;
  readonly entityXMilli: number;
  readonly playerLanePositionMilli: number;
}

export interface IndependentAutomaticPassGeometry {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly patternIndex: number;
  readonly slotIndex: number;
  readonly lane: Lane;
  readonly simulationTick: number;
  readonly entityXMilli: number;
  readonly playerLanePositionMilli: number;
}

export interface IndependentAutomaticPatternGeometry {
  readonly patternIndex: number;
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: "up" | "down" | null;
  readonly bufferedIntent: "up" | "down" | null;
  readonly committedTick: number;
  readonly committedMotion: RunnerMotion;
  readonly committedInputBuffer: "up" | "down" | null;
  readonly safeBoundaryTick: number;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: "up" | "down" | null;
}

export interface IndependentAutomaticOracleEvaluation {
  readonly patternGeometry: readonly IndependentAutomaticPatternGeometry[];
  readonly contactGeometry: readonly IndependentAutomaticContactGeometry[];
  readonly passGeometry: readonly IndependentAutomaticPassGeometry[];
  readonly contacts: readonly IndependentAutomaticContactProjection[];
  readonly effects: readonly IndependentAutomaticEffectProjection[];
  readonly terminalScores: CoreScores;
  readonly terminalLedger: EffectLedger;
  /** Manual neutral contact ownership retained for Manual terminal replay. */
  readonly terminalInvulnerableUntilTick: number;
  /** Automatic contacts are nonauthoritative and retain this exact value. */
  readonly automaticTerminalInvulnerableUntilTick: number;
  readonly terminalMotion: RunnerMotion;
  readonly terminalInputBuffer: "up" | "down" | null;
  /** Start, all decision markers, and every scoring entity; no finish marker. */
  readonly terminalResolvedEntityIds: readonly string[];
  readonly settlementEffectIds: readonly string[];
  readonly settlementEffects: readonly IndependentAutomaticEffectProjection[];
  readonly completedLedger: EffectLedger;
  readonly finishMarkerInstanceId: string;
}

export interface IndependentAutomaticCandidateObservation {
  readonly markerTransitions: readonly Readonly<{
    readonly patternIndex: number;
    readonly simulationTick: number;
    readonly sourceLane: Lane;
    readonly targetLane: Lane;
    readonly firstIntent: "up" | "down" | null;
    readonly bufferedIntent: "up" | "down" | null;
    readonly motion: RunnerMotion;
    readonly inputBuffer: "up" | "down" | null;
  }>[];
  readonly contacts: readonly Readonly<{
    readonly entityInstanceId: string;
    readonly contentId: string;
    readonly simulationTick: number;
    readonly outcome: string;
    readonly effect: AppliedEffect | null;
  }>[];
  readonly passes: readonly Readonly<{
    readonly entityInstanceId: string;
    readonly simulationTick: number;
  }>[];
  readonly preFinishState: RunStateV1;
  readonly pendingState: RunStateV1;
  readonly completedState: RunStateV1;
}

interface IndependentLaneState {
  readonly motion: RunnerMotion;
  readonly inputBuffer: "up" | "down" | null;
}

function fail(message: string): never {
  throw new TypeError(`independent Automatic oracle: ${message}`);
}

/**
 * Evaluator-owned, fail-closed structural comparison. It compares exact own
 * key populations, primitive representations, array order, and alias shape;
 * no production canonicalization or serialization code participates.
 */
interface IndependentComparisonMemo {
  readonly leftToRight: WeakMap<object, object>;
  readonly rightToLeft: WeakMap<object, object>;
}

function same(
  left: unknown,
  right: unknown,
  memo: IndependentComparisonMemo = {
    leftToRight: new WeakMap<object, object>(),
    rightToLeft: new WeakMap<object, object>(),
  },
): boolean {
  const leftIsObject = typeof left === "object" && left !== null;
  const rightIsObject = typeof right === "object" && right !== null;
  if (!leftIsObject || !rightIsObject) return Object.is(left, right);
  const priorRight = memo.leftToRight.get(left);
  if (priorRight !== undefined) return priorRight === right;
  const priorLeft = memo.rightToLeft.get(right);
  if (priorLeft !== undefined) return priorLeft === left;
  // Register even an identical-reference pair before returning. Otherwise a
  // later shared-vs-copy edge can evade the bidirectional topology check.
  memo.leftToRight.set(left, right);
  memo.rightToLeft.set(right, left);
  if (Object.is(left, right)) return true;
  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  const expectedPrototype = leftIsArray ? Array.prototype : Object.prototype;
  if (
    Object.getPrototypeOf(left) !== expectedPrototype ||
    Object.getPrototypeOf(right) !== expectedPrototype
  ) {
    return false;
  }
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    Object.hasOwn(right, key) &&
    same(
      (left as Record<PropertyKey, unknown>)[key],
      (right as Record<PropertyKey, unknown>)[key],
      memo,
    ));
}

/** @internal Direct topology regression seam; never used by evaluation. */
export function independentExactStructuralEqualForTest(
  left: unknown,
  right: unknown,
): boolean {
  return same(left, right);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right)),
  );
}

const INDEPENDENT_PATTERN_ENTROPY_VERSION =
  "pattern-entropy-fnv1a32-v1" as const;
const INDEPENDENT_ENTITY_INSTANCE_VERSION = "entity-instance-v1" as const;
const INDEPENDENT_FNV1A64_OFFSET = 0xcbf29ce484222325n;
const INDEPENDENT_FNV1A64_PRIME = 0x100000001b3n;
const INDEPENDENT_FNV1A64_MASK = 0xffffffffffffffffn;

function lengthPrefixed(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * Evaluator-owned reimplementation of the locked pattern entropy algorithm.
 * It intentionally does not call the production entropy factory.
 */
function independentEntropyUint32(
  runSeed: string,
  patternIndex: number,
  channel: string,
): number {
  const material = [
    INDEPENDENT_PATTERN_ENTROPY_VERSION,
    runSeed,
    RUNNER_LABORATORY_STAGE_ID,
    String(patternIndex),
    channel,
  ].map(lengthPrefixed).join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    const byte = material.charCodeAt(index);
    if (byte > 0x7f) fail("entropy material is not ASCII");
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function independentEntropyInteger(
  runSeed: string,
  patternIndex: number,
  channel: string,
  maxExclusive: number,
): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    fail("entropy range is not a positive safe integer");
  }
  return Number(
    (BigInt(independentEntropyUint32(runSeed, patternIndex, channel)) *
      BigInt(maxExclusive)) >> 32n,
  );
}

function independentFnv1a64HexAscii(value: string): string {
  let hash = INDEPENDENT_FNV1A64_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    const byte = value.charCodeAt(index);
    if (byte > 0x7f) fail("entity identity payload is not ASCII");
    hash ^= BigInt(byte);
    hash = (hash * INDEPENDENT_FNV1A64_PRIME) & INDEPENDENT_FNV1A64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function serializeAsciiJsonString(value: string): string {
  let serialized = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) fail("entity identity coordinate is not ASCII");
    switch (code) {
      case 0x08:
        serialized += "\\b";
        break;
      case 0x09:
        serialized += "\\t";
        break;
      case 0x0a:
        serialized += "\\n";
        break;
      case 0x0c:
        serialized += "\\f";
        break;
      case 0x0d:
        serialized += "\\r";
        break;
      case 0x22:
        serialized += '\\"';
        break;
      case 0x5c:
        serialized += "\\\\";
        break;
      default:
        serialized += code < 0x20
          ? `\\u${code.toString(16).padStart(4, "0")}`
          : String.fromCharCode(code);
    }
  }
  return `${serialized}"`;
}

function serializeIdentityInteger(value: number, coordinate: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`entity identity ${coordinate} is not a non-negative safe integer`);
  }
  return String(value);
}

/**
 * Local exact serializer for the six locked stable-ID coordinates. Key order,
 * numeric representation, string escaping, and coordinate presence are fixed
 * here rather than delegated to the production canonical JSON implementation.
 */
function serializeIndependentEntityIdentity(
  runSeed: string,
  patternIndex: number,
  slotIndex: number,
  contentId: string,
): string {
  if (!/^[0-9a-f]{16}$/.test(runSeed)) {
    fail("entity identity run seed is not exact lowercase hexadecimal");
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/.test(contentId)) {
    fail("entity identity content ID is not canonical ASCII");
  }
  return "{" +
    `"contentId":${serializeAsciiJsonString(contentId)},` +
    `"patternIndex":${serializeIdentityInteger(patternIndex, "pattern index")},` +
    `"runSeed":${serializeAsciiJsonString(runSeed)},` +
    `"slotIndex":${serializeIdentityInteger(slotIndex, "slot index")},` +
    `"stageId":${serializeAsciiJsonString(RUNNER_LABORATORY_STAGE_ID)},` +
    `"version":${serializeAsciiJsonString(INDEPENDENT_ENTITY_INSTANCE_VERSION)}` +
    "}";
}

/** Evaluator-owned reimplementation of the locked stable entity ID. */
function independentEntityInstanceId(
  runSeed: string,
  patternIndex: number,
  slotIndex: number,
  contentId: string,
): string {
  const payload = serializeIndependentEntityIdentity(
    runSeed,
    patternIndex,
    slotIndex,
    contentId,
  );
  return `entity-${independentFnv1a64HexAscii(payload)}`;
}

function independentAnchorTick(patternIndex: number): number {
  return RUNNER_LABORATORY_STAGE_CONTRACT.firstWindowAnchorTick +
    (patternIndex - 1) *
      RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorSpacingTicks;
}

function independentCursor(
  worldSpeedMilliPerTick: number,
  leadTicks: number,
  currentPatternIndex: number,
): Readonly<{
  patternIndex: number;
  nextSpawnTick: number;
  nextSpawnDistanceMilli: number;
}> {
  const nextSpawnTick = currentPatternIndex ===
      RUNNER_LABORATORY_STAGE_CONTRACT.decisionWindowCount
    ? RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalSpawnTick
    : independentAnchorTick(currentPatternIndex + 1) - leadTicks;
  return Object.freeze({
    patternIndex: currentPatternIndex,
    nextSpawnTick,
    nextSpawnDistanceMilli: worldSpeedMilliPerTick * nextSpawnTick,
  });
}

function independentMarker(
  runSeed: string,
  patternIndex: number,
  contentId: string,
  xMilli: number,
  representation: "runner-entity" | "resolved-id-sentinel",
  storedInActiveEntities: boolean,
): Readonly<Record<string, unknown>> {
  const marker: Record<string, unknown> = {
    instanceId: independentEntityInstanceId(
      runSeed,
      patternIndex,
      RUNNER_LABORATORY_MARKERS.decision.slotIndex,
      contentId,
    ),
    contentId,
    kind: RUNNER_LABORATORY_MARKERS.decision.kind,
    patternIndex,
    slotIndex: RUNNER_LABORATORY_MARKERS.decision.slotIndex,
    lane: RUNNER_LABORATORY_MARKERS.decision.lane,
    xMilli,
    widthMilli: RUNNER_LABORATORY_MARKERS.decision.widthMilli,
    collisionParticipation:
      RUNNER_LABORATORY_MARKERS.decision.collisionParticipation,
    representation,
    storedInActiveEntities,
  };
  if (storedInActiveEntities) {
    marker.contactState =
      RUNNER_LABORATORY_MARKERS.decision.contactStateOnSpawn;
  }
  return Object.freeze(marker);
}

/**
 * Reconstructs every generated course field from the locked constants, seed,
 * and difficulty. No production generator, entropy, or ID helper participates.
 */
function deriveIndependentLockedCourse(
  entry: RunStateV1,
  difficulty: (typeof RUNNER_LABORATORY_DIFFICULTY_CONTRACTS)[number],
): Readonly<Record<string, unknown>> {
  if (
    RUNNER_LABORATORY_GENERATOR_CONTRACT.algorithmId !==
      "runner-laboratory-generator-v1" ||
    RUNNER_LABORATORY_GENERATOR_CONTRACT.permutationAlgorithm !==
      "pattern-entropy-decorate-sort-v1"
  ) {
    fail("generator algorithm lock is unsupported");
  }
  const copies = RUNNER_LABORATORY_GENERATOR_CONTRACT.copyOrdinalMapping
    .map((copy) => Object.freeze({
      ...copy,
      permutationToken: independentEntropyUint32(
        entry.runSeed,
        RUNNER_LABORATORY_GENERATOR_CONTRACT.initialPatternIndex +
          copy.copyOrdinal,
        RUNNER_LABORATORY_GENERATOR_CONTRACT.permutationEntropyChannel,
      ),
    }))
    .sort((left, right) =>
      left.permutationToken - right.permutationToken ||
      left.templateIndex - right.templateIndex ||
      left.copyIndex - right.copyIndex);
  const patterns = copies.map((copy, offset) => {
    const patternIndex = offset + 1;
    const template = RUNNER_LABORATORY_PATTERN_TEMPLATES[copy.templateIndex];
    if (template === undefined || template.patternId !== copy.patternId) {
      fail("copy ordinal mapping does not resolve its locked template");
    }
    const rotations = template.legalRotations as readonly Lane[];
    const rotation = rotations[independentEntropyInteger(
      entry.runSeed,
      patternIndex,
      RUNNER_LABORATORY_GENERATOR_CONTRACT.laneRotationEntropyChannel,
      rotations.length,
    )];
    if (rotation === undefined) fail("independent rotation did not resolve");
    const optionalGroups: string[] = [];
    for (const slot of template.slots) {
      if (
        slot.optionalGroupId !== null &&
        !optionalGroups.includes(slot.optionalGroupId)
      ) {
        optionalGroups.push(slot.optionalGroupId);
      }
    }
    const includedOptionalGroupIds = optionalGroups.filter((groupId) =>
      independentEntropyInteger(
        entry.runSeed,
        patternIndex,
        `${RUNNER_LABORATORY_GENERATOR_CONTRACT.optionalEntropyChannelPrefix}${groupId}`,
        RUNNER_LABORATORY_GENERATOR_CONTRACT.optionalEntropyScale,
      ) < difficulty.optionalDensity);
    const anchorTick = independentAnchorTick(patternIndex);
    const spawnTick = anchorTick - difficulty.leadTicks;
    const entities = template.slots
      .filter((slot) =>
        !slot.optional ||
        (slot.optionalGroupId !== null &&
          includedOptionalGroupIds.includes(slot.optionalGroupId)))
      .map((slot) => {
        const definition = RUNNER_LABORATORY_ENTITY_EFFECTS.find(
          (candidate) => candidate.entityContentId === slot.entityContentId,
        );
        if (definition === undefined) {
          fail("template entity lacks its locked scoring definition");
        }
        return Object.freeze({
          instanceId: independentEntityInstanceId(
            entry.runSeed,
            patternIndex,
            slot.slotIndex,
            slot.entityContentId,
          ),
          contentId: slot.entityContentId,
          kind: definition.kind,
          patternIndex,
          slotIndex: slot.slotIndex,
          lane: laneForRole(slot.laneRole, rotation),
          xMilli:
            RUNNER_LABORATORY_COLLISION_CONTRACT
              .firstHorizontalOverlapEntityCenterXMilli +
            difficulty.worldSpeedMilliPerTick *
              (difficulty.leadTicks + slot.contactOffsetTicks),
          widthMilli: RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli,
          contactTick: anchorTick + slot.contactOffsetTicks,
          contactOffsetTicks: slot.contactOffsetTicks,
          optionalGroupId: slot.optionalGroupId,
          contactState: "pending",
        });
      });
    const decisionMarker = independentMarker(
      entry.runSeed,
      patternIndex,
      RUNNER_LABORATORY_MARKERS.decision.contentId,
      RUNNER_LABORATORY_COLLISION_CONTRACT
          .firstHorizontalOverlapEntityCenterXMilli +
        difficulty.worldSpeedMilliPerTick * difficulty.leadTicks,
      RUNNER_LABORATORY_MARKERS.decision.representation,
      RUNNER_LABORATORY_MARKERS.decision.storedInActiveEntities,
    );
    return Object.freeze({
      patternIndex,
      patternId: template.patternId,
      category: template.category,
      templateIndex: copy.templateIndex,
      copyIndex: copy.copyIndex,
      copyOrdinal: copy.copyOrdinal,
      permutationToken: copy.permutationToken,
      rotation,
      anchorTick,
      spawnTick,
      spawnDistanceMilli: difficulty.worldSpeedMilliPerTick * spawnTick,
      incomingCursor: independentCursor(
        difficulty.worldSpeedMilliPerTick,
        difficulty.leadTicks,
        patternIndex - 1,
      ),
      outgoingCursor: independentCursor(
        difficulty.worldSpeedMilliPerTick,
        difficulty.leadTicks,
        patternIndex,
      ),
      includedOptionalGroupIds: Object.freeze(includedOptionalGroupIds),
      entities: Object.freeze(entities),
      decisionMarker,
      spawnEntities: Object.freeze([...entities, decisionMarker]),
    });
  });
  const startMarker = independentMarker(
    entry.runSeed,
    RUNNER_LABORATORY_MARKERS.initial.patternIndex,
    RUNNER_LABORATORY_MARKERS.initial.contentId,
    RUNNER_LABORATORY_MARKERS.initial.xMilli,
    RUNNER_LABORATORY_MARKERS.initial.representation,
    RUNNER_LABORATORY_MARKERS.initial.storedInActiveEntities,
  );
  const finishMarker = independentMarker(
    entry.runSeed,
    RUNNER_LABORATORY_MARKERS.terminal.patternIndex,
    RUNNER_LABORATORY_MARKERS.terminal.contentId,
    RUNNER_LABORATORY_MARKERS.terminal.xMilli,
    RUNNER_LABORATORY_MARKERS.terminal.representation,
    RUNNER_LABORATORY_MARKERS.terminal.storedInActiveEntities,
  );
  const terminalCursor = independentCursor(
    difficulty.worldSpeedMilliPerTick,
    difficulty.leadTicks,
    RUNNER_LABORATORY_STAGE_CONTRACT.decisionWindowCount,
  );
  const coordinates = [
    startMarker,
    ...patterns.flatMap((pattern) => pattern.spawnEntities),
    finishMarker,
  ].sort((left, right) => {
    const leftPattern = left.patternIndex as number;
    const rightPattern = right.patternIndex as number;
    const leftSlot = left.slotIndex as number;
    const rightSlot = right.slotIndex as number;
    const leftId = left.instanceId as string;
    const rightId = right.instanceId as string;
    return leftPattern - rightPattern || leftSlot - rightSlot ||
      (leftId < rightId ? -1 : leftId > rightId ? 1 : 0);
  });
  return Object.freeze({
    generatorId: RUNNER_LABORATORY_GENERATOR_CONTRACT.algorithmId,
    runSeed: entry.runSeed,
    stageId: RUNNER_LABORATORY_STAGE_ID,
    difficulty: entry.difficulty,
    worldSpeedMilliPerTick: difficulty.worldSpeedMilliPerTick,
    initialCursor: independentCursor(
      difficulty.worldSpeedMilliPerTick,
      difficulty.leadTicks,
      RUNNER_LABORATORY_GENERATOR_CONTRACT.initialPatternIndex,
    ),
    terminalCursor,
    completedCursor: Object.freeze({
      ...terminalCursor,
      patternIndex: RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalPatternIndex,
    }),
    startMarker,
    finishMarker,
    patterns: Object.freeze(patterns),
    includedOptionalGroupKeys: Object.freeze(patterns.flatMap((pattern) =>
      pattern.includedOptionalGroupIds.map((groupId) =>
        `${pattern.patternIndex}:${groupId}`))),
    canonicalEntityIds: Object.freeze(coordinates.map((coordinate) =>
      coordinate.instanceId)),
  });
}

function idleMotion(lane: Lane): RunnerMotion {
  return Object.freeze({
    kind: "idle" as const,
    currentLane: lane,
    sourceLane: lane,
    targetLane: lane,
    elapsedTicks: 0 as const,
    totalTicks: RUNNER_LABORATORY_MOVEMENT_CONTRACT.tweenTicks,
  });
}

function movingMotion(
  sourceLane: Lane,
  targetLane: Lane,
  elapsedTicks: number,
): RunnerMotion {
  return Object.freeze({
    kind: "moving" as const,
    currentLane: sourceLane,
    sourceLane,
    targetLane,
    elapsedTicks,
    totalTicks: RUNNER_LABORATORY_MOVEMENT_CONTRACT.tweenTicks,
  });
}

function adjacentLane(
  lane: Lane,
  direction: "up" | "down",
): Lane | null {
  const candidate = direction === "up" ? lane - 1 : lane + 1;
  return candidate === 0 || candidate === 1 || candidate === 2
    ? candidate
    : null;
}

function beginMove(
  sourceLane: Lane,
  direction: "up" | "down",
): IndependentLaneState {
  const targetLane = adjacentLane(sourceLane, direction);
  return targetLane === null
    ? Object.freeze({ motion: idleMotion(sourceLane), inputBuffer: null })
    : Object.freeze({
        motion: movingMotion(sourceLane, targetLane, 1),
        inputBuffer: null,
      });
}

/** Independent implementation of the locked 11-tick one-buffer machine. */
function stepLane(
  state: IndependentLaneState,
  request: "up" | "down" | null,
): IndependentLaneState {
  const { motion } = state;
  if (motion.kind === "idle") {
    if (state.inputBuffer !== null) {
      return beginMove(motion.currentLane, state.inputBuffer);
    }
    return request === null
      ? Object.freeze({
          motion: idleMotion(motion.currentLane),
          inputBuffer: null,
        })
      : beginMove(motion.currentLane, request);
  }

  let nextBuffer = state.inputBuffer;
  if (
    nextBuffer === null && request !== null &&
    adjacentLane(motion.targetLane, request) !== null
  ) {
    nextBuffer = request;
  }
  const elapsedTicks = motion.elapsedTicks + 1;
  if (elapsedTicks === RUNNER_LABORATORY_MOVEMENT_CONTRACT.tweenTicks) {
    return Object.freeze({
      motion: idleMotion(motion.targetLane),
      inputBuffer: nextBuffer,
    });
  }
  return Object.freeze({
    motion: movingMotion(
      motion.sourceLane,
      motion.targetLane,
      elapsedTicks,
    ),
    inputBuffer: nextBuffer,
  });
}

function independentLanePositionMilli(state: IndependentLaneState): number {
  const { motion } = state;
  if (motion.kind === "idle") {
    return RUNNER_LABORATORY_MOVEMENT_CONTRACT.laneCentersMilli[
      motion.currentLane
    ];
  }
  const tweenTicks = RUNNER_LABORATORY_MOVEMENT_CONTRACT.tweenTicks;
  return Math.round(
    ((motion.sourceLane * (tweenTicks - motion.elapsedTicks) +
      motion.targetLane * motion.elapsedTicks) * 1_000) /
      tweenTicks,
  );
}

function compileTarget(
  sourceLane: Lane,
  targetLane: Lane,
): Readonly<{
  firstIntent: "up" | "down" | null;
  bufferedIntent: "up" | "down" | null;
}> {
  if (sourceLane === targetLane) {
    return Object.freeze({ firstIntent: null, bufferedIntent: null });
  }
  const direction = targetLane < sourceLane ? "up" : "down";
  return Object.freeze({
    firstIntent: direction,
    bufferedIntent: Math.abs(targetLane - sourceLane) === 2
      ? direction
      : null,
  });
}

function laneForRole(
  role: (typeof RUNNER_LABORATORY_PATTERN_TEMPLATES)[number]["slots"][number]["laneRole"],
  rotation: Lane,
): Lane {
  if (role === "rotation-origin") return rotation;
  if (role === "rotation-next") return ((rotation + 1) % 3) as Lane;
  return ((rotation + 2) % 3) as Lane;
}

function difficultyContract(course: RunnerLabGeneratedCourse) {
  const contract = RUNNER_LABORATORY_DIFFICULTY_CONTRACTS.find(
    (candidate) => candidate.difficulty === course.difficulty,
  );
  if (
    contract === undefined ||
    contract.worldSpeedMilliPerTick !== course.worldSpeedMilliPerTick ||
    contract.durationTicks !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks
  ) {
    fail("course speed or duration differs from its locked difficulty");
  }
  return contract;
}

function assertEntityTemplate(
  pattern: RunnerLabGeneratedPattern,
  entity: RunnerLabGeneratedEntity,
  expectedSlot: (typeof RUNNER_LABORATORY_PATTERN_TEMPLATES)[number]["slots"][number],
  speed: number,
  leadTicks: number,
): void {
  const definition = RUNNER_LABORATORY_ENTITY_EFFECTS.find(
    (candidate) => candidate.entityContentId === expectedSlot.entityContentId,
  );
  const expectedXMilli =
    RUNNER_LABORATORY_COLLISION_CONTRACT.firstHorizontalOverlapEntityCenterXMilli +
    speed * (leadTicks + expectedSlot.contactOffsetTicks);
  if (
    definition === undefined ||
    entity.contentId !== expectedSlot.entityContentId ||
    entity.kind !== definition.kind ||
    entity.patternIndex !== pattern.patternIndex ||
    entity.slotIndex !== expectedSlot.slotIndex ||
    entity.lane !== laneForRole(expectedSlot.laneRole, pattern.rotation) ||
    entity.xMilli !== expectedXMilli ||
    entity.widthMilli !== RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli ||
    entity.contactTick !== pattern.anchorTick + expectedSlot.contactOffsetTicks ||
    entity.contactOffsetTicks !== expectedSlot.contactOffsetTicks ||
    entity.optionalGroupId !== expectedSlot.optionalGroupId ||
    entity.contactState !== "pending" ||
    !/^entity-[0-9a-f]{16}$/.test(entity.instanceId)
  ) {
    fail(
      `pattern ${pattern.patternIndex} slot ${expectedSlot.slotIndex} ` +
        "differs from the locked template integers",
    );
  }
}

function assertLockedCourseIntegers(
  entry: RunStateV1,
  course: RunnerLabGeneratedCourse,
): void {
  const difficulty = difficultyContract(course);
  const independentlyDerivedCourse = deriveIndependentLockedCourse(
    entry,
    difficulty,
  );
  if (!same(course, independentlyDerivedCourse)) {
    fail(
      "course differs from the independent locked seed/permutation/rotation/" +
        "optional/cursor/entity-ID derivation",
    );
  }
  if (
    entry.controlMode !== "automatic-assist" ||
    entry.runSeed !== course.runSeed ||
    entry.difficulty !== course.difficulty ||
    entry.runner === null ||
    entry.runner.invulnerableUntilTick !== 0 ||
    course.patterns.length !== RUNNER_LABORATORY_STAGE_CONTRACT.decisionWindowCount ||
    course.initialCursor.patternIndex !==
      RUNNER_LABORATORY_GENERATOR_CONTRACT.initialPatternIndex ||
    course.initialCursor.nextSpawnTick !== difficulty.firstSpawnTick ||
    course.initialCursor.nextSpawnDistanceMilli !==
      difficulty.firstSpawnDistanceMilli ||
    course.terminalCursor.patternIndex !==
      RUNNER_LABORATORY_STAGE_CONTRACT.decisionWindowCount ||
    course.terminalCursor.nextSpawnTick !==
      RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalSpawnTick ||
    course.terminalCursor.nextSpawnDistanceMilli !==
      difficulty.terminalSpawnDistanceMilli ||
    course.completedCursor.patternIndex !==
      RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalPatternIndex ||
    course.completedCursor.nextSpawnTick !==
      RUNNER_LABORATORY_GENERATOR_CONTRACT.terminalSpawnTick ||
    course.completedCursor.nextSpawnDistanceMilli !==
      difficulty.terminalSpawnDistanceMilli ||
    course.startMarker.contentId !== RUNNER_LABORATORY_MARKERS.initial.contentId ||
    course.startMarker.patternIndex !==
      RUNNER_LABORATORY_MARKERS.initial.patternIndex ||
    course.startMarker.slotIndex !== RUNNER_LABORATORY_MARKERS.initial.slotIndex ||
    course.startMarker.lane !== RUNNER_LABORATORY_MARKERS.initial.lane ||
    course.startMarker.xMilli !== RUNNER_LABORATORY_MARKERS.initial.xMilli ||
    course.startMarker.widthMilli !== RUNNER_LABORATORY_MARKERS.initial.widthMilli ||
    course.startMarker.kind !== RUNNER_LABORATORY_MARKERS.initial.kind ||
    course.startMarker.representation !==
      RUNNER_LABORATORY_MARKERS.initial.representation ||
    course.startMarker.storedInActiveEntities !==
      RUNNER_LABORATORY_MARKERS.initial.storedInActiveEntities ||
    course.startMarker.collisionParticipation !==
      RUNNER_LABORATORY_MARKERS.initial.collisionParticipation ||
    Object.hasOwn(course.startMarker, "contactState") ||
    course.finishMarker.contentId !== RUNNER_LABORATORY_MARKERS.terminal.contentId ||
    course.finishMarker.patternIndex !==
      RUNNER_LABORATORY_MARKERS.terminal.patternIndex ||
    course.finishMarker.slotIndex !== RUNNER_LABORATORY_MARKERS.terminal.slotIndex ||
    course.finishMarker.lane !== RUNNER_LABORATORY_MARKERS.terminal.lane ||
    course.finishMarker.xMilli !== RUNNER_LABORATORY_MARKERS.terminal.xMilli ||
    course.finishMarker.widthMilli !== RUNNER_LABORATORY_MARKERS.terminal.widthMilli ||
    course.finishMarker.kind !== RUNNER_LABORATORY_MARKERS.terminal.kind ||
    course.finishMarker.representation !==
      RUNNER_LABORATORY_MARKERS.terminal.representation ||
    course.finishMarker.storedInActiveEntities !==
      RUNNER_LABORATORY_MARKERS.terminal.storedInActiveEntities ||
    course.finishMarker.collisionParticipation !==
      RUNNER_LABORATORY_MARKERS.terminal.collisionParticipation ||
    Object.hasOwn(course.finishMarker, "contactState") ||
    !/^entity-[0-9a-f]{16}$/.test(course.startMarker.instanceId) ||
    !/^entity-[0-9a-f]{16}$/.test(course.finishMarker.instanceId)
  ) {
    fail("entry/course identity differs from the locked laboratory contract");
  }
  const seenIds = new Set<string>([
    course.startMarker.instanceId,
    course.finishMarker.instanceId,
  ]);
  for (const [offset, pattern] of course.patterns.entries()) {
    const patternIndex = offset + 1;
    const templateIndex = RUNNER_LABORATORY_PATTERN_TEMPLATES.findIndex(
      (template) => template.patternId === pattern.patternId,
    );
    const template = RUNNER_LABORATORY_PATTERN_TEMPLATES[templateIndex];
    const expectedAnchor =
      RUNNER_LABORATORY_STAGE_CONTRACT.firstWindowAnchorTick +
      offset * RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorSpacingTicks;
    if (
      template === undefined ||
      pattern.patternIndex !== patternIndex ||
      pattern.templateIndex !== templateIndex ||
      pattern.category !== template.category ||
      !(template.legalRotations as readonly Lane[]).includes(pattern.rotation) ||
      pattern.anchorTick !== expectedAnchor ||
      pattern.spawnTick !== expectedAnchor - difficulty.leadTicks ||
      pattern.spawnDistanceMilli !==
        pattern.spawnTick * course.worldSpeedMilliPerTick
    ) {
      fail(`pattern ${patternIndex} differs from its locked template timing`);
    }
    const includedGroups = new Set(pattern.includedOptionalGroupIds);
    const allowedGroups = new Set(template.slots.flatMap((slot) =>
      slot.optionalGroupId === null ? [] : [slot.optionalGroupId]));
    if (
      includedGroups.size !== pattern.includedOptionalGroupIds.length ||
      pattern.includedOptionalGroupIds.some((groupId) =>
        !allowedGroups.has(groupId))
    ) {
      fail(`pattern ${patternIndex} has an unknown or repeated optional group`);
    }
    const expectedSlots = template.slots.filter((slot) =>
      !slot.optional ||
      (slot.optionalGroupId !== null && includedGroups.has(slot.optionalGroupId))
    );
    if (expectedSlots.length !== pattern.entities.length) {
      fail(`pattern ${patternIndex} entity count differs from its locked template`);
    }
    for (const [entityOffset, expectedSlot] of expectedSlots.entries()) {
      const entity = pattern.entities[entityOffset];
      if (entity === undefined) {
        fail(`pattern ${patternIndex} lacks a locked scoring slot`);
      }
      assertEntityTemplate(
        pattern,
        entity,
        expectedSlot,
        course.worldSpeedMilliPerTick,
        difficulty.leadTicks,
      );
      if (seenIds.has(entity.instanceId)) {
        fail("course repeats a stable entity instance ID");
      }
      seenIds.add(entity.instanceId);
    }
    const marker = pattern.decisionMarker;
    const expectedMarkerX =
      RUNNER_LABORATORY_COLLISION_CONTRACT.firstHorizontalOverlapEntityCenterXMilli +
      course.worldSpeedMilliPerTick * difficulty.leadTicks;
    if (
      marker.contentId !== RUNNER_LABORATORY_MARKERS.decision.contentId ||
      marker.patternIndex !== patternIndex ||
      marker.slotIndex !== RUNNER_LABORATORY_MARKERS.decision.slotIndex ||
      marker.lane !== RUNNER_LABORATORY_MARKERS.decision.lane ||
      marker.xMilli !== expectedMarkerX ||
      marker.widthMilli !== RUNNER_LABORATORY_MARKERS.decision.widthMilli ||
      marker.kind !== RUNNER_LABORATORY_MARKERS.decision.kind ||
      marker.representation !== RUNNER_LABORATORY_MARKERS.decision.representation ||
      marker.storedInActiveEntities !==
        RUNNER_LABORATORY_MARKERS.decision.storedInActiveEntities ||
      marker.collisionParticipation !==
        RUNNER_LABORATORY_MARKERS.decision.collisionParticipation ||
      marker.contactState !== "pending" ||
      !/^entity-[0-9a-f]{16}$/.test(marker.instanceId) ||
      pattern.spawnEntities.length !== pattern.entities.length + 1 ||
      pattern.spawnEntities.slice(0, -1).some((spawned, entityIndex) =>
        spawned.instanceId !== pattern.entities[entityIndex]?.instanceId) ||
      pattern.spawnEntities.at(-1)?.instanceId !== marker.instanceId ||
      seenIds.has(marker.instanceId)
    ) {
      fail(`pattern ${patternIndex} decision marker differs from its lock`);
    }
    seenIds.add(marker.instanceId);
  }
  const expectedCanonicalIds = [
    course.startMarker,
    ...course.patterns.flatMap((pattern) => pattern.spawnEntities),
    course.finishMarker,
  ].sort((left, right) =>
    left.patternIndex - right.patternIndex ||
    left.slotIndex - right.slotIndex ||
    left.instanceId.localeCompare(right.instanceId))
    .map(({ instanceId }) => instanceId);
  const expectedOptionalGroupKeys = course.patterns.flatMap((pattern) =>
    pattern.includedOptionalGroupIds.map((groupId) =>
      `${pattern.patternIndex}:${groupId}`));
  if (
    RUNNER_LABORATORY_STAGE_CONTRACT.categoryCounts.some((expected) =>
      course.patterns.filter((pattern) =>
        pattern.patternId === expected.patternId).length !== expected.count) ||
    seenIds.size !== course.canonicalEntityIds.length ||
    course.canonicalEntityIds.some((instanceId) => !seenIds.has(instanceId)) ||
    !same(course.canonicalEntityIds, expectedCanonicalIds) ||
    !same(course.includedOptionalGroupKeys, expectedOptionalGroupKeys)
  ) {
    fail("course canonical IDs or optional groups differ from the lock");
  }
}

function safeBoundaryTick(
  pattern: RunnerLabGeneratedPattern,
  speed: number,
): number {
  if (pattern.entities.length === 0) return pattern.anchorTick;
  const overlapTicks = Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli / speed,
  );
  return Math.max(...pattern.entities.map((entity) =>
    entity.contactTick + overlapTicks + 1));
}

function entityXAtTick(
  pattern: RunnerLabGeneratedPattern,
  entity: RunnerLabGeneratedEntity,
  simulationTick: number,
  speed: number,
): number {
  return entity.xMilli - speed * (simulationTick - pattern.spawnTick);
}

function overlapsPlayer(
  entity: RunnerLabGeneratedEntity,
  entityXMilli: number,
  playerLanePositionMilli: number,
): boolean {
  const horizontalLimit =
    RUNNER_LABORATORY_COLLISION_CONTRACT.playerHalfWidthMilli +
    RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli / 2;
  const laneCenter =
    RUNNER_LABORATORY_MOVEMENT_CONTRACT.laneCentersMilli[entity.lane];
  return Math.abs(
    entityXMilli - RUNNER_LABORATORY_COLLISION_CONTRACT.playerXMilli,
  ) <= horizontalLimit &&
    Math.abs(playerLanePositionMilli - laneCenter) <=
      RUNNER_LABORATORY_COLLISION_CONTRACT.laneHalfWidthMilli;
}

function effectIdForEntity(instanceId: string): string {
  const match = /^entity-([0-9a-f]{16})$/.exec(instanceId);
  if (match === null) fail("contact entity lacks its stable 16-hex suffix");
  return `effect-${match[1]}`;
}

function effectProjection(
  effect: AppliedEffect,
): IndependentAutomaticEffectProjection {
  return Object.freeze({ ...effect });
}

function incrementTotals(
  ledger: EffectLedger,
  source: "runner" | "system",
  scoreId: ScoreId,
  actualDelta: number,
): EffectLedger["totalsBySource"] {
  const prior = ledger.totalsBySource[source];
  const positiveKey = `${scoreId}Positive` as const;
  const negativeKey = `${scoreId}Negative` as const;
  return Object.freeze({
    ...ledger.totalsBySource,
    [source]: Object.freeze({
      ...prior,
      [positiveKey]: prior[positiveKey] + Math.max(0, actualDelta),
      [negativeKey]: prior[negativeKey] + Math.max(0, -actualDelta),
    }),
  });
}

function applyIndependentEffect(
  scores: CoreScores,
  ledger: EffectLedger,
  input: Readonly<{
    effectId: string;
    scoreId: ScoreId;
    requestedDelta: number;
    source: "runner" | "system";
    categoryId: string;
    transactionId: string | null;
    simulationTick: number;
  }>,
): Readonly<{
  scores: CoreScores;
  ledger: EffectLedger;
  effect: AppliedEffect;
}> {
  if (ledger.recent.some((effect) => effect.effectId === input.effectId)) {
    fail("independent effect fold encountered a duplicate effect ID");
  }
  const before = scores[input.scoreId];
  const after = Math.max(0, Math.min(100, before + input.requestedDelta));
  const actualDelta = after - before;
  const nextScores = Object.freeze({
    health: input.scoreId === "health" ? after : scores.health,
    happiness: input.scoreId === "happiness" ? after : scores.happiness,
    money: input.scoreId === "money" ? after : scores.money,
  });
  const effect = Object.freeze({
    ...input,
    causedByChoiceId: null,
    before,
    after,
    actualDelta,
  } satisfies AppliedEffect);
  const nextLedger = Object.freeze({
    recent: Object.freeze([...ledger.recent, effect]),
    totalsBySource: incrementTotals(
      ledger,
      input.source,
      input.scoreId,
      actualDelta,
    ),
  });
  return Object.freeze({ scores: nextScores, ledger: nextLedger, effect });
}

interface IndependentLaneProjection {
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly firstIntent: "up" | "down" | null;
  readonly bufferedIntent: "up" | "down" | null;
  readonly safeBoundaryTick: number;
  readonly committedMotion: RunnerMotion;
  readonly committedInputBuffer: "up" | "down" | null;
  readonly terminalLane: IndependentLaneState;
  readonly scores: CoreScores;
  readonly ledger: EffectLedger;
  readonly invulnerableUntilTick: number;
  readonly utilityNumerator: number;
  readonly resolvedEntityIds: readonly string[];
  readonly contactGeometry: readonly IndependentAutomaticContactGeometry[];
  readonly passGeometry: readonly IndependentAutomaticPassGeometry[];
  readonly contacts: readonly IndependentAutomaticContactProjection[];
  readonly effects: readonly IndependentAutomaticEffectProjection[];
}

/** Projects exactly one lane from the same immutable pattern checkpoint. */
function projectIndependentLane(
  pattern: RunnerLabGeneratedPattern,
  speed: number,
  sourceLaneState: IndependentLaneState,
  targetLane: Lane,
  checkpointScores: CoreScores,
  checkpointLedger: EffectLedger,
  checkpointInvulnerableUntilTick: number,
): IndependentLaneProjection {
  if (
    sourceLaneState.motion.kind !== "idle" ||
    sourceLaneState.inputBuffer !== null
  ) {
    fail("neutral projection checkpoint is not idle");
  }
  const sourceLane = sourceLaneState.motion.currentLane;
  const compiled = compileTarget(sourceLane, targetLane);
  const boundaryTick = safeBoundaryTick(pattern, speed);
  const first = stepLane(sourceLaneState, compiled.firstIntent);
  let lane: IndependentLaneState = Object.freeze({
    motion: first.motion,
    inputBuffer: compiled.bufferedIntent,
  });
  const committedMotion = lane.motion;
  const committedInputBuffer = lane.inputBuffer;
  let scores = checkpointScores;
  let ledger = checkpointLedger;
  let invulnerableUntilTick = checkpointInvulnerableUntilTick;
  const locallyResolved = new Set<string>();
  const contactGeometry: IndependentAutomaticContactGeometry[] = [];
  const passGeometry: IndependentAutomaticPassGeometry[] = [];
  const contacts: IndependentAutomaticContactProjection[] = [];
  const effects: IndependentAutomaticEffectProjection[] = [];
  const playerLeftBoundary =
    RUNNER_LABORATORY_COLLISION_CONTRACT.playerXMilli -
    RUNNER_LABORATORY_COLLISION_CONTRACT.playerHalfWidthMilli -
    RUNNER_LABORATORY_COLLISION_CONTRACT.entityWidthMilli / 2;

  for (
    let simulationTick = pattern.spawnTick + 1;
    simulationTick <= boundaryTick;
    simulationTick += 1
  ) {
    if (simulationTick > pattern.spawnTick + 1) {
      lane = stepLane(lane, null);
    }
    const playerLanePositionMilli = independentLanePositionMilli(lane);
    const pending = pattern.entities.filter((entity) =>
      !locallyResolved.has(entity.instanceId));
    const colliding = pending
      .map((entity) => Object.freeze({
        entity,
        xMilli: entityXAtTick(pattern, entity, simulationTick, speed),
      }))
      .filter(({ entity, xMilli }) =>
        overlapsPlayer(entity, xMilli, playerLanePositionMilli))
      .sort((left, right) =>
        left.entity.patternIndex - right.entity.patternIndex ||
        left.entity.slotIndex - right.entity.slotIndex ||
        left.entity.instanceId.localeCompare(right.entity.instanceId));

    for (const { entity, xMilli } of colliding) {
      locallyResolved.add(entity.instanceId);
      contactGeometry.push(Object.freeze({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        patternIndex: entity.patternIndex,
        slotIndex: entity.slotIndex,
        lane: entity.lane,
        simulationTick,
        entityXMilli: xMilli,
        playerLanePositionMilli,
      }));
      const definition = RUNNER_LABORATORY_ENTITY_EFFECTS.find(
        (candidate) => candidate.entityContentId === entity.contentId,
      );
      if (definition === undefined || definition.kind !== entity.kind) {
        fail("contact lacks its locked scoring definition");
      }
      if (
        definition.kind === "hazard" &&
        simulationTick < invulnerableUntilTick
      ) {
        contacts.push(Object.freeze({
          entityInstanceId: entity.instanceId,
          contentId: entity.contentId,
          simulationTick,
          outcome: "hazard-suppressed" as const,
          effectId: null,
          scoreId: null,
          requestedDelta: null,
          actualDelta: null,
        }));
        continue;
      }
      const application = applyIndependentEffect(scores, ledger, {
        effectId: effectIdForEntity(entity.instanceId),
        scoreId: definition.scoreId,
        requestedDelta: definition.requestedDelta,
        source: RUNNER_LABORATORY_COLLISION_CONTRACT.contactEffectSource,
        categoryId: definition.effectCategoryId,
        transactionId:
          RUNNER_LABORATORY_COLLISION_CONTRACT.contactEffectTransactionId,
        simulationTick,
      });
      scores = application.scores;
      ledger = application.ledger;
      effects.push(effectProjection(application.effect));
      if (definition.kind === "hazard") {
        invulnerableUntilTick = simulationTick +
          RUNNER_LABORATORY_COLLISION_CONTRACT.invulnerabilityTicks;
      }
      contacts.push(Object.freeze({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        simulationTick,
        outcome: definition.kind === "hazard"
          ? "hazard-applied" as const
          : "benefit-applied" as const,
        effectId: application.effect.effectId,
        scoreId: application.effect.scoreId,
        requestedDelta: application.effect.requestedDelta,
        actualDelta: application.effect.actualDelta,
      }));
    }

    const newlyPassed = pending
      .filter((entity) => !locallyResolved.has(entity.instanceId))
      .map((entity) => Object.freeze({
        entity,
        xMilli: entityXAtTick(pattern, entity, simulationTick, speed),
      }))
      .filter(({ xMilli }) => xMilli < playerLeftBoundary)
      .sort((left, right) =>
        left.entity.instanceId.localeCompare(right.entity.instanceId));
    for (const { entity, xMilli } of newlyPassed) {
      locallyResolved.add(entity.instanceId);
      passGeometry.push(Object.freeze({
        entityInstanceId: entity.instanceId,
        contentId: entity.contentId,
        patternIndex: entity.patternIndex,
        slotIndex: entity.slotIndex,
        lane: entity.lane,
        simulationTick,
        entityXMilli: xMilli,
        playerLanePositionMilli,
      }));
    }
  }
  if (
    locallyResolved.size !== pattern.entities.length ||
    lane.motion.kind !== "idle" ||
    lane.inputBuffer !== null ||
    lane.motion.currentLane !== targetLane
  ) {
    fail(`pattern ${pattern.patternIndex} lane projection did not close`);
  }
  const utilityNumerator =
    scores.health - checkpointScores.health +
    scores.happiness - checkpointScores.happiness +
    scores.money - checkpointScores.money;
  return deepFreeze({
    sourceLane,
    targetLane,
    firstIntent: compiled.firstIntent,
    bufferedIntent: compiled.bufferedIntent,
    safeBoundaryTick: boundaryTick,
    committedMotion,
    committedInputBuffer,
    terminalLane: lane,
    scores,
    ledger,
    invulnerableUntilTick,
    utilityNumerator,
    resolvedEntityIds: [...locallyResolved],
    contactGeometry,
    passGeometry,
    contacts,
    effects,
  });
}

const INDEPENDENT_NEUTRAL_LANE_PRIORITY = Object.freeze([1, 0, 2] as const);

function independentNeutralPriorityIndex(lane: Lane): number {
  return INDEPENDENT_NEUTRAL_LANE_PRIORITY.indexOf(lane);
}

function compareIndependentNeutralCandidates(
  left: IndependentLaneProjection,
  right: IndependentLaneProjection,
): number {
  const leftNonnegative = left.utilityNumerator >= 0;
  const rightNonnegative = right.utilityNumerator >= 0;
  if (leftNonnegative !== rightNonnegative) return leftNonnegative ? -1 : 1;
  return Math.abs(left.utilityNumerator) - Math.abs(right.utilityNumerator) ||
    Math.abs(left.targetLane - left.sourceLane) -
      Math.abs(right.targetLane - right.sourceLane) ||
    independentNeutralPriorityIndex(left.targetLane) -
      independentNeutralPriorityIndex(right.targetLane);
}

function chooseIndependentNeutralProjection(
  projections: readonly IndependentLaneProjection[],
  sourceLane: Lane,
): IndependentLaneProjection {
  const stay = projections.find((projection) =>
    projection.targetLane === sourceLane);
  if (stay === undefined || projections.length !== 3) {
    fail("neutral policy lacks its three lane projections");
  }
  return stay.utilityNumerator >= 0
    ? stay
    : [...projections].sort(compareIndependentNeutralCandidates)[0]!;
}

function expectedSettlement(
  entry: RunStateV1,
  terminalScores: CoreScores,
): Readonly<{
  effectIds: readonly string[];
  effects: readonly IndependentAutomaticEffectProjection[];
  ledger: EffectLedger;
}> {
  if (RUNNER_LABORATORY_SETTLEMENT_CONTRACT.source !== "system") {
    fail("Automatic settlement source differs from its locked system owner");
  }
  let scores = entry.scores;
  let ledger = entry.effectLedger;
  const effects: IndependentAutomaticEffectProjection[] = [];
  for (const scoreId of RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectOrder) {
    const requestedDelta = terminalScores[scoreId] - scores[scoreId];
    if (requestedDelta === 0) continue;
    const application = applyIndependentEffect(scores, ledger, {
      effectId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectIds[scoreId],
      scoreId,
      requestedDelta,
      source: "system",
      categoryId:
        RUNNER_LABORATORY_SETTLEMENT_CONTRACT.automaticEffectCategoryId,
      transactionId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
      simulationTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
    });
    scores = application.scores;
    ledger = application.ledger;
    effects.push(effectProjection(application.effect));
  }
  if (!same(scores, terminalScores) || effects.length === 0) {
    fail("independent Automatic settlement does not reach a nonzero target");
  }
  return deepFreeze({
    effectIds: effects.map(({ effectId }) => effectId),
    effects,
    ledger,
  });
}

/**
 * Derives the neutral Manual target, geometry, contact, and score oracle from
 * locked integers. Supplied targets are comparison inputs, never authorities;
 * the candidate geometry plan is never consumed.
 */
export function deriveIndependentAutomaticOracleEvaluation(
  entry: RunStateV1,
  course: RunnerLabGeneratedCourse,
  targets: readonly IndependentAutomaticTargetInput[],
): IndependentAutomaticOracleEvaluation {
  assertLockedCourseIntegers(entry, course);
  if (entry.runner === null || targets.length !== course.patterns.length) {
    fail("entry or target population is incomplete");
  }
  let lane: IndependentLaneState = Object.freeze({
    motion: Object.freeze({ ...entry.runner.motion }),
    inputBuffer: entry.runner.inputBuffer,
  });
  let scores = entry.scores;
  let ledger = entry.effectLedger;
  let invulnerableUntilTick = entry.runner.invulnerableUntilTick;
  const resolvedIds = new Set<string>([course.startMarker.instanceId]);
  const patternGeometry: IndependentAutomaticPatternGeometry[] = [];
  const contactGeometry: IndependentAutomaticContactGeometry[] = [];
  const passGeometry: IndependentAutomaticPassGeometry[] = [];
  const contacts: IndependentAutomaticContactProjection[] = [];
  const effects: IndependentAutomaticEffectProjection[] = [];

  for (const [offset, pattern] of course.patterns.entries()) {
    const target = targets[offset];
    if (
      lane.motion.kind !== "idle" ||
      lane.inputBuffer !== null ||
      target === undefined
    ) {
      fail(`pattern ${pattern.patternIndex} target chain is malformed`);
    }
    const projections = ([0, 1, 2] as const).map((candidateLane) =>
      projectIndependentLane(
        pattern,
        course.worldSpeedMilliPerTick,
        lane,
        candidateLane,
        scores,
        ledger,
        invulnerableUntilTick,
      ));
    const chosen = chooseIndependentNeutralProjection(
      projections,
      lane.motion.currentLane,
    );
    if (
      target.patternIndex !== pattern.patternIndex ||
      target.simulationTick !== pattern.spawnTick ||
      target.sourceLane !== chosen.sourceLane ||
      target.targetLane !== chosen.targetLane ||
      target.firstIntent !== chosen.firstIntent ||
      target.bufferedIntent !== chosen.bufferedIntent ||
      target.safeBoundaryTick !== chosen.safeBoundaryTick ||
      target.utilityNumerator !== chosen.utilityNumerator
    ) {
      fail(
        `pattern ${pattern.patternIndex} target differs from the independent ` +
          "neutral stay/utility/move/priority selection",
      );
    }
    resolvedIds.add(pattern.decisionMarker.instanceId);
    chosen.resolvedEntityIds.forEach((instanceId) =>
      resolvedIds.add(instanceId));
    contactGeometry.push(...chosen.contactGeometry);
    passGeometry.push(...chosen.passGeometry);
    contacts.push(...chosen.contacts);
    effects.push(...chosen.effects);
    lane = chosen.terminalLane;
    scores = chosen.scores;
    ledger = chosen.ledger;
    invulnerableUntilTick = chosen.invulnerableUntilTick;
    patternGeometry.push(deepFreeze({
      patternIndex: pattern.patternIndex,
      sourceLane: chosen.sourceLane,
      targetLane: chosen.targetLane,
      firstIntent: chosen.firstIntent,
      bufferedIntent: chosen.bufferedIntent,
      committedTick: pattern.spawnTick + 1,
      committedMotion: chosen.committedMotion,
      committedInputBuffer: chosen.committedInputBuffer,
      safeBoundaryTick: chosen.safeBoundaryTick,
      terminalMotion: lane.motion,
      terminalInputBuffer: lane.inputBuffer,
    }));
  }

  if (
    resolvedIds.size > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds ||
    contacts.length + passGeometry.length !==
      course.patterns.reduce((sum, pattern) => sum + pattern.entities.length, 0)
  ) {
    fail("independent contact/pass partition is incomplete or exceeds its cap");
  }
  const settlement = expectedSettlement(entry, scores);
  return deepFreeze({
    patternGeometry,
    contactGeometry,
    passGeometry,
    contacts,
    effects,
    terminalScores: scores,
    terminalLedger: ledger,
    terminalInvulnerableUntilTick: invulnerableUntilTick,
    automaticTerminalInvulnerableUntilTick:
      entry.runner.invulnerableUntilTick,
    terminalMotion: lane.motion,
    terminalInputBuffer: lane.inputBuffer,
    terminalResolvedEntityIds: sortedUnique([...resolvedIds]),
    settlementEffectIds: settlement.effectIds,
    settlementEffects: settlement.effects,
    completedLedger: settlement.ledger,
    finishMarkerInstanceId: course.finishMarker.instanceId,
  } satisfies IndependentAutomaticOracleEvaluation);
}

/**
 * Exact comparison seam used for every authenticated Automatic base entry.
 * The observation is intentionally independent of the legacy/shared plan.
 */
export function assertIndependentAutomaticCandidateEvaluation(
  entry: RunStateV1,
  oracle: IndependentAutomaticOracleEvaluation,
  observation: IndependentAutomaticCandidateObservation,
): void {
  const expectedContacts = oracle.contactGeometry.map((contact) => ({
    entityInstanceId: contact.entityInstanceId,
    contentId: contact.contentId,
    simulationTick: contact.simulationTick,
    outcome: "automatic-pass",
    effect: null,
  }));
  const expectedPasses = oracle.passGeometry.map((pass) => ({
    entityInstanceId: pass.entityInstanceId,
    simulationTick: pass.simulationTick,
  }));
  const markerMatches =
    observation.markerTransitions.length === oracle.patternGeometry.length &&
    observation.markerTransitions.every((transition, index) => {
      const expected = oracle.patternGeometry[index];
      return expected !== undefined &&
        transition.patternIndex === expected.patternIndex &&
        transition.simulationTick === expected.committedTick - 1 &&
        transition.sourceLane === expected.sourceLane &&
        transition.targetLane === expected.targetLane &&
        transition.firstIntent === expected.firstIntent &&
        transition.bufferedIntent === expected.bufferedIntent &&
        same(transition.motion, expected.committedMotion) &&
        transition.inputBuffer === expected.committedInputBuffer;
    });
  const preFinish = observation.preFinishState;
  const preRunner = preFinish.runner;
  const preFinishMatches =
    preRunner !== null && preFinish.simulationTick === 2999 &&
    preFinish.runStatus === "active" && preFinish.stage.phase === "active" &&
    same(preFinish.scores, entry.scores) &&
    same(preFinish.effectLedger, entry.effectLedger) &&
    same(preRunner.motion, oracle.terminalMotion) &&
    preRunner.inputBuffer === oracle.terminalInputBuffer &&
    preRunner.invulnerableUntilTick ===
      oracle.automaticTerminalInvulnerableUntilTick &&
    preRunner.activeEntities.length === 0 &&
    same(
      preRunner.spawn.resolvedEntityIds,
      oracle.terminalResolvedEntityIds,
    );
  const pending = observation.pendingState;
  const pendingRunner = pending.runner;
  const pendingSettlement = pending.stage.settlement;
  const expectedPendingResolvedIds = sortedUnique([
    ...oracle.terminalResolvedEntityIds,
    oracle.finishMarkerInstanceId,
  ]);
  const pendingSettlementMatches = same(pendingSettlement, {
    settlementId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
    status: "pending",
    startedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
    completedTick: null,
    effectIds: oracle.settlementEffectIds,
  });
  const pendingMatches =
    pendingRunner !== null && pending.simulationTick === 3000 &&
    pending.runStatus === "active" && pending.stage.phase === "settling" &&
    pendingSettlementMatches &&
    same(pending.scores, entry.scores) &&
    same(pending.effectLedger, entry.effectLedger) &&
    same(pendingRunner.spawn.resolvedEntityIds, expectedPendingResolvedIds) &&
    same(pendingRunner.motion, oracle.terminalMotion) &&
    pendingRunner.inputBuffer === oracle.terminalInputBuffer &&
    pendingRunner.activeEntities.length === 0 &&
    pendingRunner.invulnerableUntilTick ===
      oracle.automaticTerminalInvulnerableUntilTick;
  const completed = observation.completedState;
  const completedSettlement = completed.stage.settlement;
  const completedParts = Object.freeze({
    lifecycle: completed.simulationTick === 3000 &&
      completed.runStatus === "completed" &&
      completed.stage.phase === "complete" && completed.runner === null,
    settlement: same(completedSettlement, {
      settlementId: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.settlementId,
      status: "applied",
      startedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
      completedTick: RUNNER_LABORATORY_SETTLEMENT_CONTRACT.tick,
      effectIds: oracle.settlementEffectIds,
    }),
    scores: same(completed.scores, oracle.terminalScores),
    ledger: same(completed.effectLedger, oracle.completedLedger),
    effects: same(completed.effectLedger.recent, oracle.settlementEffects),
  });
  const completedMatches = Object.values(completedParts).every(Boolean);
  const checks = Object.freeze({
    markers: markerMatches,
    contacts: same(observation.contacts, expectedContacts),
    passes: same(observation.passes, expectedPasses),
    preFinish: preFinishMatches,
    pending: pendingMatches,
    completed: completedMatches,
  });
  if (!Object.values(checks).every(Boolean)) {
    fail(
      "candidate differs from locked independent geometry/contact/settlement " +
        `${JSON.stringify(checks)} completed=${JSON.stringify(completedParts)}`,
    );
  }
}
