import type { Difficulty, Lane } from "../run-state";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_WARNING_CONTRACT,
} from "./contract";
import {
  enumerateIncomingLaneStates,
  laneControllerStateKey,
  lanePositionMilli,
  minimumTicksToIdleLane,
  RUNNER_LANE_CENTERS_MILLI,
  RUNNER_LANES,
  stepLaneController,
  type LaneControllerState,
  type LaneIntent,
} from "./lane-controller";

export const RUNNER_REACHABILITY_PATTERN_HORIZON =
  RUNNER_LABORATORY_STAGE_CONTRACT.rollingHorizonPatterns;
export const RUNNER_LANE_CONTACT_HALF_WIDTH_MILLI =
  RUNNER_LABORATORY_COLLISION_CONTRACT.laneHalfWidthMilli;
export const RUNNER_WARNING_BASE_REACTION_TICKS =
  RUNNER_LABORATORY_WARNING_CONTRACT.baseReactionTicks;
export const RUNNER_WARNING_MOVE_FLOORS = Object.freeze([
  RUNNER_LABORATORY_WARNING_CONTRACT.requiredMoveFloors[0].minWarningTicks,
  RUNNER_LABORATORY_WARNING_CONTRACT.requiredMoveFloors[1].minWarningTicks,
  RUNNER_LABORATORY_WARNING_CONTRACT.requiredMoveFloors[2].minWarningTicks,
] as const);
export const RUNNER_WARNING_LEAD_TICKS: Readonly<Record<Difficulty, number>> =
  Object.freeze({ ...RUNNER_LABORATORY_WARNING_CONTRACT.leadTicks });

const LANE_INTENTS: readonly LaneIntent[] = Object.freeze([null, "up", "down"]);
const DIFFICULTIES: readonly Difficulty[] = Object.freeze([
  "story",
  "normal",
  "challenge",
]);

export type AbstractLaneRequirementKind = "required-hazard" | "benefit";

/**
 * Catalog-independent projection of one lane-bound entity. `safeTick` is the
 * first tick at which an uncontacted entity is fully passed, so its overlap
 * interval is [contactTick, safeTick).
 */
export interface AbstractLaneRequirement {
  readonly kind: AbstractLaneRequirementKind;
  readonly lane: Lane;
  readonly contactTick: number;
  readonly safeTick: number;
}

/** A generated pattern projected to only the facts needed by the pure solver. */
export interface AbstractReachabilityPattern {
  readonly patternKey: string;
  readonly anchorTick: number;
  readonly safeBoundaryTick: number;
  readonly laneRequirements: readonly AbstractLaneRequirement[];
}

export interface ReachabilityFailureWitness {
  readonly incomingStateIndex: number;
  readonly incomingStateKey: string;
  readonly firstDeadTick: number;
  readonly activeRequiredHazardLanes: readonly Lane[];
  readonly activePatternKeys: readonly string[];
}

export interface ReachabilityValidationResult {
  readonly accepted: boolean;
  readonly incomingStateCount: number;
  readonly firstStepInputCaseCount: number;
  readonly patternCount: number;
  readonly startTick: number;
  readonly checkedThroughTick: number;
  readonly transitionCount: number;
  readonly minimumViableStateCount: number;
  readonly failures: readonly ReachabilityFailureWitness[];
}

export interface ReachabilityValidationOptions {
  readonly startTick: number;
  readonly minimumPatternHorizon?: number;
}

export const RUNNER_REACHABILITY_CACHE_LIMIT = 256;

export interface RunnerReachabilityCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
  readonly limit: number;
  readonly transitionGraphStateCount: number;
  readonly transitionGraphEdgeCount: number;
}

export interface WarningLeadWitness {
  readonly incomingStateKey: string;
  readonly targetLane: Lane;
  readonly movementTicks: number;
  readonly requiredWarningTicks: number;
}

export interface DifficultyWarningLeadResult {
  readonly difficulty: Difficulty;
  readonly leadTicks: number;
  readonly guardTicks: number;
  readonly sufficient: boolean;
}

export interface WarningContractResult {
  readonly incomingStateCount: number;
  readonly firstStepInputCaseCount: number;
  readonly maximumMovementTicks: number;
  readonly maximumRequiredWarningTicks: number;
  readonly maximumWitness: WarningLeadWitness;
  readonly difficulties: readonly DifficultyWarningLeadResult[];
  readonly passed: boolean;
}

function assertSafeTick(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertLane(value: number, name: string): asserts value is Lane {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new RangeError(`${name} must be lane 0, 1, or 2`);
  }
}

function validatePatternSequence(
  patterns: readonly AbstractReachabilityPattern[],
  startTick: number,
  minimumPatternHorizon: number,
): void {
  assertSafeTick(startTick, "reachability start tick");
  if (
    !Number.isSafeInteger(minimumPatternHorizon) ||
    minimumPatternHorizon < RUNNER_REACHABILITY_PATTERN_HORIZON
  ) {
    throw new RangeError("reachability horizon must cover at least three patterns");
  }
  if (patterns.length < minimumPatternHorizon) {
    throw new RangeError(
      `reachability proof needs at least ${minimumPatternHorizon} patterns`,
    );
  }

  let previousAnchor = -1;
  let previousSafeBoundary = startTick;
  for (const [patternIndex, pattern] of patterns.entries()) {
    if (pattern.patternKey.length === 0) {
      throw new TypeError(`pattern ${patternIndex} must have a nonempty key`);
    }
    assertSafeTick(pattern.anchorTick, `pattern ${pattern.patternKey} anchor`);
    assertSafeTick(
      pattern.safeBoundaryTick,
      `pattern ${pattern.patternKey} safe boundary`,
    );
    if (pattern.anchorTick <= previousAnchor) {
      throw new RangeError("pattern anchors must be strictly increasing");
    }
    if (pattern.anchorTick < previousSafeBoundary) {
      throw new RangeError("pattern overlap intervals must not overlap");
    }
    if (pattern.safeBoundaryTick < pattern.anchorTick) {
      throw new RangeError("pattern safe boundary cannot precede its anchor");
    }
    if (patternIndex === 0 && pattern.anchorTick < startTick) {
      throw new RangeError("first pattern cannot precede the proof start tick");
    }

    for (const [requirementIndex, requirement] of
      pattern.laneRequirements.entries()) {
      if (
        requirement.kind !== "required-hazard" &&
        requirement.kind !== "benefit"
      ) {
        throw new TypeError(
          `pattern ${pattern.patternKey} requirement ${requirementIndex} has an invalid kind`,
        );
      }
      assertLane(
        requirement.lane,
        `pattern ${pattern.patternKey} requirement ${requirementIndex} lane`,
      );
      assertSafeTick(
        requirement.contactTick,
        `pattern ${pattern.patternKey} requirement ${requirementIndex} contact tick`,
      );
      assertSafeTick(
        requirement.safeTick,
        `pattern ${pattern.patternKey} requirement ${requirementIndex} safe tick`,
      );
      if (requirement.contactTick < pattern.anchorTick) {
        throw new RangeError("requirement contact cannot precede its pattern anchor");
      }
      if (requirement.safeTick <= requirement.contactTick) {
        throw new RangeError("requirement safe tick must follow its contact tick");
      }
      if (requirement.safeTick > pattern.safeBoundaryTick) {
        throw new RangeError(
          "requirement safe tick cannot exceed its pattern safe boundary",
        );
      }
    }

    previousAnchor = pattern.anchorTick;
    previousSafeBoundary = pattern.safeBoundaryTick;
  }
}

interface ActiveRequiredHazard {
  readonly patternIndex: number;
  readonly lane: Lane;
}

function requiredHazardsAtTick(
  patterns: readonly AbstractReachabilityPattern[],
  tick: number,
): readonly ActiveRequiredHazard[] {
  const hazards: ActiveRequiredHazard[] = [];
  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const requirement of pattern.laneRequirements) {
      if (
        requirement.kind === "required-hazard" &&
        requirement.contactTick <= tick &&
        tick < requirement.safeTick
      ) {
        hazards.push({ patternIndex, lane: requirement.lane });
      }
    }
  }
  return hazards;
}

function contactsRequiredHazard(
  state: LaneControllerState,
  hazards: readonly ActiveRequiredHazard[],
): boolean {
  const playerLaneMilli = lanePositionMilli(state);
  return hazards.some(
    (hazard) =>
      Math.abs(
        playerLaneMilli - RUNNER_LANE_CENTERS_MILLI[hazard.lane],
      ) <= RUNNER_LANE_CONTACT_HALF_WIDTH_MILLI,
  );
}

function uniqueSortedLanes(
  hazards: readonly ActiveRequiredHazard[],
): readonly Lane[] {
  return RUNNER_LANES.filter((lane) =>
    hazards.some((hazard) => hazard.lane === lane),
  );
}

function uniqueSortedPatternIndexes(
  hazards: readonly ActiveRequiredHazard[],
): readonly number[] {
  return [...new Set(hazards.map((hazard) => hazard.patternIndex))]
    .sort((left, right) => left - right);
}

interface LaneTransitionGraph {
  readonly states: readonly LaneControllerState[];
  readonly stateKeys: readonly string[];
  readonly transitionsByStateIndex: readonly (readonly number[])[];
  readonly edgeCount: number;
}

function buildLaneTransitionGraph(): LaneTransitionGraph {
  const states = enumerateIncomingLaneStates();
  if (states.length !== 107) {
    throw new Error("runner reachability transition graph must contain 107 states");
  }
  const stateKeys = Object.freeze(states.map(laneControllerStateKey));
  const indexByKey = new Map(
    stateKeys.map((stateKey, stateIndex) => [stateKey, stateIndex]),
  );
  const transitionsByStateIndex = states.map((state) => {
    const uniqueNextIndexes = new Set<number>();
    for (const intent of LANE_INTENTS) {
      const nextStateKey = laneControllerStateKey(
        stepLaneController(state, intent),
      );
      const nextStateIndex = indexByKey.get(nextStateKey);
      if (nextStateIndex === undefined) {
        throw new Error("lane transition escaped the locked 107-state closure");
      }
      uniqueNextIndexes.add(nextStateIndex);
    }
    return Object.freeze([...uniqueNextIndexes]);
  });
  return Object.freeze({
    states,
    stateKeys,
    transitionsByStateIndex: Object.freeze(transitionsByStateIndex),
    edgeCount: transitionsByStateIndex.reduce(
      (total, transitions) => total + transitions.length,
      0,
    ),
  });
}

const LANE_TRANSITION_GRAPH = buildLaneTransitionGraph();

interface CachedReachabilityFailure {
  readonly incomingStateIndex: number;
  readonly firstDeadTickOffset: number;
  readonly activeRequiredHazardLanes: readonly Lane[];
  readonly activePatternIndexes: readonly number[];
}

interface CachedReachabilityCore {
  readonly accepted: boolean;
  readonly checkedThroughTickOffset: number;
  readonly transitionCount: number;
  readonly minimumViableStateCount: number;
  readonly failures: readonly CachedReachabilityFailure[];
}

const reachabilityCache = new Map<string, CachedReachabilityCore>();
let reachabilityCacheHits = 0;
let reachabilityCacheMisses = 0;
let reachabilityCacheEvictions = 0;

export function clearRunnerReachabilityCache(): void {
  reachabilityCache.clear();
  reachabilityCacheHits = 0;
  reachabilityCacheMisses = 0;
  reachabilityCacheEvictions = 0;
}

export function runnerReachabilityCacheStats(): RunnerReachabilityCacheStats {
  return Object.freeze({
    hits: reachabilityCacheHits,
    misses: reachabilityCacheMisses,
    evictions: reachabilityCacheEvictions,
    size: reachabilityCache.size,
    limit: RUNNER_REACHABILITY_CACHE_LIMIT,
    transitionGraphStateCount: LANE_TRANSITION_GRAPH.states.length,
    transitionGraphEdgeCount: LANE_TRANSITION_GRAPH.edgeCount,
  });
}

function structuralHorizonKey(
  patterns: readonly AbstractReachabilityPattern[],
  startTick: number,
): string {
  return patterns.map((pattern) => {
    const requirementTokens = pattern.laneRequirements
      .filter((requirement) => requirement.kind === "required-hazard")
      .map((requirement) => [
        "h",
        requirement.lane,
        requirement.contactTick - startTick,
        requirement.safeTick - startTick,
      ].join(","))
      .sort();
    return [
      pattern.anchorTick - startTick,
      pattern.safeBoundaryTick - startTick,
      requirementTokens.join("/"),
    ].join(":");
  }).join(";");
}

function cachedReachabilityCore(
  key: string,
): CachedReachabilityCore | undefined {
  const cached = reachabilityCache.get(key);
  if (cached === undefined) {
    reachabilityCacheMisses += 1;
    return undefined;
  }
  reachabilityCacheHits += 1;
  reachabilityCache.delete(key);
  reachabilityCache.set(key, cached);
  return cached;
}

function storeReachabilityCore(
  key: string,
  core: CachedReachabilityCore,
): void {
  if (reachabilityCache.size >= RUNNER_REACHABILITY_CACHE_LIMIT) {
    const oldestKey = reachabilityCache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      reachabilityCache.delete(oldestKey);
      reachabilityCacheEvictions += 1;
    }
  }
  reachabilityCache.set(key, core);
}

function populationCount(mask: bigint): number {
  let count = 0;
  let remaining = mask;
  while (remaining !== 0n) {
    remaining &= remaining - 1n;
    count += 1;
  }
  return count;
}

function setBitIndexes(mask: bigint): readonly number[] {
  const indexes: number[] = [];
  for (
    let stateIndex = 0;
    stateIndex < LANE_TRANSITION_GRAPH.states.length;
    stateIndex += 1
  ) {
    if ((mask & (1n << BigInt(stateIndex))) !== 0n) {
      indexes.push(stateIndex);
    }
  }
  return indexes;
}

function computeReachabilityCore(
  patterns: readonly AbstractReachabilityPattern[],
  startTick: number,
): CachedReachabilityCore {
  const { states, transitionsByStateIndex } = LANE_TRANSITION_GRAPH;
  const checkedThroughTick = patterns[patterns.length - 1]!.safeBoundaryTick;
  let transitionCount = 0;

  const finalHazards = requiredHazardsAtTick(patterns, checkedThroughTick);
  let viable = Uint8Array.from(states, (state) =>
    contactsRequiredHazard(state, finalHazards) ? 0 : 1);
  let minimumViableStateCount = viable.reduce(
    (count, isViable) => count + isViable,
    0,
  );

  for (let tick = checkedThroughTick; tick > startTick; tick -= 1) {
    const hazards = requiredHazardsAtTick(patterns, tick - 1);
    const previousViable = new Uint8Array(states.length);
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const state = states[stateIndex]!;
      if (contactsRequiredHazard(state, hazards)) continue;
      for (const nextStateIndex of transitionsByStateIndex[stateIndex]!) {
        transitionCount += 1;
        if (viable[nextStateIndex] === 1) {
          previousViable[stateIndex] = 1;
          break;
        }
      }
    }
    viable = previousViable;
    minimumViableStateCount = Math.min(
      minimumViableStateCount,
      viable.reduce((count, isViable) => count + isViable, 0),
    );
  }

  const failedStateIndexes: number[] = [];
  for (let stateIndex = 0; stateIndex < viable.length; stateIndex += 1) {
    if (viable[stateIndex] === 0) failedStateIndexes.push(stateIndex);
  }
  if (failedStateIndexes.length === 0) {
    return Object.freeze({
      accepted: true,
      checkedThroughTickOffset: checkedThroughTick - startTick,
      transitionCount,
      minimumViableStateCount,
      failures: Object.freeze([]),
    });
  }

  const failureTickOffsets = Array<number>(states.length).fill(-1);
  let frontierOriginMasks = Array<bigint>(states.length).fill(0n);
  let liveOrigins = 0n;
  const initialHazards = requiredHazardsAtTick(patterns, startTick);
  for (const incomingStateIndex of failedStateIndexes) {
    if (contactsRequiredHazard(states[incomingStateIndex]!, initialHazards)) {
      failureTickOffsets[incomingStateIndex] = 0;
      continue;
    }
    const originBit = 1n << BigInt(incomingStateIndex);
    frontierOriginMasks[incomingStateIndex] = originBit;
    liveOrigins |= originBit;
  }

  for (
    let tick = startTick + 1;
    tick <= checkedThroughTick && liveOrigins !== 0n;
    tick += 1
  ) {
    const hazards = requiredHazardsAtTick(patterns, tick);
    const safeNextState = Uint8Array.from(states, (state) =>
      contactsRequiredHazard(state, hazards) ? 0 : 1);
    const nextFrontierOriginMasks = Array<bigint>(states.length).fill(0n);
    for (
      let stateIndex = 0;
      stateIndex < frontierOriginMasks.length;
      stateIndex += 1
    ) {
      const originMask = frontierOriginMasks[stateIndex]!;
      if (originMask === 0n) continue;
      const transitions = transitionsByStateIndex[stateIndex]!;
      transitionCount += populationCount(originMask) * transitions.length;
      for (const nextStateIndex of transitions) {
        if (safeNextState[nextStateIndex] === 1) {
          nextFrontierOriginMasks[nextStateIndex] =
            nextFrontierOriginMasks[nextStateIndex]! | originMask;
        }
      }
    }
    let nextLiveOrigins = 0n;
    for (const originMask of nextFrontierOriginMasks) {
      nextLiveOrigins |= originMask;
    }
    const newlyDeadOrigins = liveOrigins & ~nextLiveOrigins;
    for (const incomingStateIndex of setBitIndexes(newlyDeadOrigins)) {
      failureTickOffsets[incomingStateIndex] = tick - startTick;
    }
    frontierOriginMasks = nextFrontierOriginMasks;
    liveOrigins = nextLiveOrigins;
  }
  if (liveOrigins !== 0n) {
    throw new Error("unreachable proof witnesses survived through the safe boundary");
  }

  const failures = failedStateIndexes.map((incomingStateIndex) => {
    const firstDeadTickOffset = failureTickOffsets[incomingStateIndex];
    if (firstDeadTickOffset === undefined || firstDeadTickOffset < 0) {
      throw new Error("unreachable proof witness lacks a first dead tick");
    }
    const activeHazards = requiredHazardsAtTick(
      patterns,
      startTick + firstDeadTickOffset,
    );
    return Object.freeze({
      incomingStateIndex,
      firstDeadTickOffset,
      activeRequiredHazardLanes: Object.freeze([
        ...uniqueSortedLanes(activeHazards),
      ]),
      activePatternIndexes: Object.freeze([
        ...uniqueSortedPatternIndexes(activeHazards),
      ]),
    });
  });
  return Object.freeze({
    accepted: false,
    checkedThroughTickOffset: checkedThroughTick - startTick,
    transitionCount,
    minimumViableStateCount,
    failures: Object.freeze(failures),
  });
}

function materializeReachabilityResult(
  patterns: readonly AbstractReachabilityPattern[],
  startTick: number,
  core: CachedReachabilityCore,
): ReachabilityValidationResult {
  const failures = core.failures.map((failure) => Object.freeze({
    incomingStateIndex: failure.incomingStateIndex,
    incomingStateKey:
      LANE_TRANSITION_GRAPH.stateKeys[failure.incomingStateIndex]!,
    firstDeadTick: startTick + failure.firstDeadTickOffset,
    activeRequiredHazardLanes: failure.activeRequiredHazardLanes,
    activePatternKeys: Object.freeze(
      failure.activePatternIndexes
        .map((patternIndex) => patterns[patternIndex]!.patternKey)
        .sort(),
    ),
  }));
  return Object.freeze({
    accepted: core.accepted,
    incomingStateCount: LANE_TRANSITION_GRAPH.states.length,
    firstStepInputCaseCount:
      LANE_TRANSITION_GRAPH.states.length * LANE_INTENTS.length,
    patternCount: patterns.length,
    startTick,
    checkedThroughTick: startTick + core.checkedThroughTickOffset,
    transitionCount: core.transitionCount,
    minimumViableStateCount: core.minimumViableStateCount,
    failures: Object.freeze(failures),
  });
}

/**
 * Explores null/up/down on every tick from every locked incoming state. A
 * pattern is accepted only when every incoming state has at least one trace
 * that avoids required hazards through the final supplied safe boundary.
 */
export function validateRunnerReachability(
  patterns: readonly AbstractReachabilityPattern[],
  options: ReachabilityValidationOptions,
): ReachabilityValidationResult {
  if (options === null || options === undefined ||
      !Object.hasOwn(options, "startTick")) {
    throw new TypeError("reachability start tick is required");
  }
  const startTick = options.startTick;
  const minimumPatternHorizon =
    options.minimumPatternHorizon ?? RUNNER_REACHABILITY_PATTERN_HORIZON;
  validatePatternSequence(patterns, startTick, minimumPatternHorizon);
  const cacheKey = structuralHorizonKey(patterns, startTick);
  let core = cachedReachabilityCore(cacheKey);
  if (core === undefined) {
    core = computeReachabilityCore(patterns, startTick);
    storeReachabilityCore(cacheKey, core);
  }
  return materializeReachabilityResult(patterns, startTick, core);
}

export function assertRunnerReachability(
  patterns: readonly AbstractReachabilityPattern[],
  options: ReachabilityValidationOptions,
): ReachabilityValidationResult {
  const result = validateRunnerReachability(patterns, options);
  if (!result.accepted) {
    const first = result.failures[0]!;
    throw new Error(
      `runner course is unreachable from ${first.incomingStateKey} at tick ${first.firstDeadTick}`,
    );
  }
  return result;
}

export function requiredWarningTicksForLane(
  state: LaneControllerState,
  targetLane: Lane,
): number {
  assertLane(targetLane, "warning target lane");
  const movementTicks = minimumTicksToIdleLane(state, targetLane);
  const laneDistance = Math.abs(state.motion.currentLane - targetLane);
  const idleDistanceFloor = RUNNER_WARNING_MOVE_FLOORS[laneDistance];
  if (idleDistanceFloor === undefined) {
    throw new RangeError("warning lane distance is outside the locked domain");
  }
  return Math.max(
    idleDistanceFloor,
    RUNNER_WARNING_BASE_REACTION_TICKS + movementTicks,
  );
}

/** Recomputes the exact 107-state warning envelope and per-difficulty guard. */
export function validateRunnerWarningContract(): WarningContractResult {
  const incomingStates = enumerateIncomingLaneStates();
  let maximumMovementTicks = -1;
  let maximumRequiredWarningTicks = -1;
  let maximumWitness: WarningLeadWitness | null = null;

  for (const state of incomingStates) {
    for (const targetLane of RUNNER_LANES) {
      const movementTicks = minimumTicksToIdleLane(state, targetLane);
      const requiredWarningTicks = requiredWarningTicksForLane(state, targetLane);
      if (
        requiredWarningTicks > maximumRequiredWarningTicks ||
        (requiredWarningTicks === maximumRequiredWarningTicks &&
          movementTicks > maximumMovementTicks)
      ) {
        maximumMovementTicks = movementTicks;
        maximumRequiredWarningTicks = requiredWarningTicks;
        maximumWitness = Object.freeze({
          incomingStateKey: laneControllerStateKey(state),
          targetLane,
          movementTicks,
          requiredWarningTicks,
        });
      } else {
        maximumMovementTicks = Math.max(maximumMovementTicks, movementTicks);
      }
    }
  }

  if (maximumWitness === null) {
    throw new Error("warning contract has no incoming-state witness");
  }

  const difficulties = DIFFICULTIES.map((difficulty) => {
    const leadTicks = RUNNER_WARNING_LEAD_TICKS[difficulty];
    const guardTicks = leadTicks - maximumRequiredWarningTicks;
    return Object.freeze({
      difficulty,
      leadTicks,
      guardTicks,
      sufficient: guardTicks >= 1,
    });
  });

  return Object.freeze({
    incomingStateCount: incomingStates.length,
    firstStepInputCaseCount: incomingStates.length * LANE_INTENTS.length,
    maximumMovementTicks,
    maximumRequiredWarningTicks,
    maximumWitness,
    difficulties: Object.freeze(difficulties),
    passed:
      incomingStates.length === 107 &&
      incomingStates.length * LANE_INTENTS.length === 321 &&
      maximumMovementTicks === 43 &&
      maximumRequiredWarningTicks === 81 &&
      difficulties.every((entry) => entry.sufficient),
  });
}
