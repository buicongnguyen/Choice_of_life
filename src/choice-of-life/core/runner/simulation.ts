import { assertCoreScores } from "../score-model";
import { deepFreeze, isDeeplyFrozen as isDeepFrozen } from "../immutable";
import type {
  CoreScores,
  Difficulty,
  Lane,
  RunnerEntity,
  RunnerMotion,
  RunnerState,
  RunStateV1,
} from "../run-state";
import {
  advanceAndResolveRunnerEntities,
  compareRunnerEntityCoordinates,
  runnerPatternSafeBoundaryTick,
  type ContactEvent,
} from "./collision-system";
import {
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
} from "./contract";
import {
  assertAuthenticRunnerLaboratoryCourse,
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedPattern,
} from "./course-generator";
import {
  adjacentLane,
  assertLaneControllerState,
  lanePositionMilli,
  stepLaneController,
  type LaneDirection,
  type LaneIntent,
} from "./lane-controller";
import { compileNeutralLaneTarget } from "./neutral-policy";
import {
  assertRunnerReachability,
  type AbstractReachabilityPattern,
} from "./reachability-validator";
import {
  beginLabSettlement,
  type AutomaticSettlementOracleScores,
} from "./settlement";

export const RUNNER_SIMULATION_ID = "runner-laboratory-simulation-v1";
export const RUNNER_REACHABILITY_CERTIFICATE_ID =
  "runner-authentic-rolling-reachability-v1";

export type RunnerIndependentPauseReason =
  | "visibility"
  | "focus"
  | "user"
  | "modal";

export type RunnerSimulationCheckpoint =
  | "unchanged"
  | "start"
  | "tick"
  | "pattern"
  | "settlement";

export type RunnerSimulationNoOpReason =
  | "not-active"
  | "start-pending"
  | "start-already-acknowledged"
  | "user-paused"
  | "independent-pause"
  | "raw-input-disabled"
  | "semantic-decision-pending"
  | "semantic-choice-not-applicable"
  | "semantic-choice-not-ready"
  | "automatic-oracle-required"
  | "automatic-decision-not-ready"
  | "automatic-scores-required"
  | "unexpected-automatic-oracle";

export interface RunnerReachabilityCertificate {
  readonly certificateId: typeof RUNNER_REACHABILITY_CERTIFICATE_ID;
  readonly requestedAppendPatternIndex: number;
  readonly certifiedPatternIndexes: readonly [number, number, number];
  readonly certifiedStartTick: number;
  readonly checkedThroughTick: number;
  readonly incomingStateCount: number;
  readonly firstStepInputCaseCount: number;
  readonly minimumViableStateCount: number;
  readonly coverageBasis: "all-107-incoming-states-at-certified-start";
}

export interface RunnerSimulationContext {
  readonly simulationId: typeof RUNNER_SIMULATION_ID;
  readonly runSeed: string;
  readonly difficulty: Difficulty;
  readonly course: RunnerLabGeneratedCourse;
  readonly reachabilityCertificates: readonly RunnerReachabilityCertificate[];
}

declare const TRUSTED_AUTOMATIC_TARGET_BRAND: unique symbol;
declare const TRUSTED_AUTOMATIC_SCORES_BRAND: unique symbol;

/**
 * This type is deliberately unconstructable from this module. The later
 * automatic evaluator owns provenance and may pass its branded value here.
 */
type TrustedAutomaticOracleTarget = Readonly<{
  targetLane: Lane;
  [TRUSTED_AUTOMATIC_TARGET_BRAND]: "trusted-automatic-target";
}>;

/** See `TrustedAutomaticOracleTarget`; settlement score provenance is external. */
type TrustedAutomaticOracleScores = Readonly<{
  scores: CoreScores;
  [TRUSTED_AUTOMATIC_SCORES_BRAND]: "trusted-automatic-scores";
}>;

export interface RunnerSimulationStepInput {
  readonly laneIntent?: LaneIntent;
  readonly independentPauseReasons?: readonly RunnerIndependentPauseReason[];
  readonly automaticTarget?: TrustedAutomaticOracleTarget | null;
  readonly automaticScores?: TrustedAutomaticOracleScores | null;
}

export type RunnerSimulationEvent =
  | Readonly<{
      type: "start-acknowledged";
      simulationTick: 0;
      entityInstanceId: string;
    }>
  | Readonly<{
      type: "decision-marker-resolved";
      simulationTick: number;
      entityInstanceId: string;
      controlMode: "semantic-assist" | "automatic-assist";
      targetLane: Lane;
    }>
  | Readonly<{
      type: "lane-stepped";
      simulationTick: number;
      request: LaneIntent;
      motion: RunnerMotion;
      inputBuffer: LaneDirection | null;
    }>
  | Readonly<{
      type: "clock-advanced";
      simulationTick: number;
      activeTicks: number;
      worldDistanceMilli: number;
    }>
  | Readonly<{
      type: "contact-resolved";
      contact: ContactEvent;
    }>
  | Readonly<{
      type: "entity-passed";
      simulationTick: number;
      entityInstanceId: string;
    }>
  | Readonly<{
      type: "resolved-through-advanced";
      simulationTick: number;
      resolvedThroughPatternIndex: number;
    }>
  | Readonly<{
      type: "reachability-certified";
      simulationTick: number;
      certificate: RunnerReachabilityCertificate;
    }>
  | Readonly<{
      type: "pattern-appended";
      simulationTick: number;
      patternIndex: number;
      entityInstanceIds: readonly string[];
    }>
  | Readonly<{
      type: "lane-buffer-queued";
      simulationTick: number;
      direction: LaneDirection;
    }>
  | Readonly<{
      type: "finish-sentinel-resolved";
      simulationTick: 3000;
      entityInstanceId: string;
    }>
  | Readonly<{
      type: "settlement-pending";
      simulationTick: 3000;
      settlementId: string;
      effectIds: readonly string[];
    }>
  | Readonly<{
      type: "no-op";
      simulationTick: number;
      reason: RunnerSimulationNoOpReason;
      independentPauseReasons: readonly RunnerIndependentPauseReason[];
    }>;

export interface RunnerSimulationResult {
  readonly state: RunStateV1;
  readonly previousTick: number;
  readonly currentTick: number;
  readonly tickDelta: 0 | 1;
  /** True only when an ordinary logical tick advanced. */
  readonly advanced: boolean;
  /** Distinguishes the zero-tick Start mutation from a true no-op. */
  readonly stateChanged: boolean;
  /** Runtime/replay must durably save every result carrying this flag. */
  readonly shouldPersist: boolean;
  readonly acceptedLaneIntent: LaneIntent;
  readonly noOpReason: RunnerSimulationNoOpReason | null;
  readonly checkpoint: RunnerSimulationCheckpoint;
  readonly reachabilityCertificate: RunnerReachabilityCertificate | null;
  readonly events: readonly RunnerSimulationEvent[];
}

const AUTHENTIC_SIMULATION_CONTEXTS = new WeakSet<object>();
const PAUSE_REASON_ORDER = [
  "visibility",
  "focus",
  "user",
  "modal",
] as const satisfies readonly RunnerIndependentPauseReason[];

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner simulation: ${message}`);
  }
  throw new TypeError();
}

function assertLane(value: number, name: string): asserts value is Lane {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new RangeError(`${name} must be lane 0, 1, or 2`);
  }
}

function assertLaneIntent(value: unknown): asserts value is LaneIntent {
  if (value !== null && value !== "up" && value !== "down") {
    fail("lane intent must be up, down, or null");
  }
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right)),
  );
}

function canonicalPauseReasons(
  reasons: readonly RunnerIndependentPauseReason[] | undefined,
): readonly RunnerIndependentPauseReason[] {
  if (reasons === undefined) return Object.freeze([]);
  if (!Array.isArray(reasons)) fail("pause reasons must be an array");
  const reasonSet = new Set<RunnerIndependentPauseReason>();
  for (const reason of reasons) {
    if (!PAUSE_REASON_ORDER.includes(reason)) {
      fail("independent pause reason is unsupported");
    }
    reasonSet.add(reason);
  }
  return Object.freeze(
    PAUSE_REASON_ORDER.filter((reason) => reasonSet.has(reason)),
  );
}

function generatedEntityProjection(
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
  xMilli: number = entity.xMilli,
): RunnerEntity {
  return Object.freeze({
    instanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: entity.kind,
    patternIndex: entity.patternIndex,
    slotIndex: entity.slotIndex,
    lane: entity.lane,
    xMilli,
    widthMilli: entity.widthMilli,
    contactState: "pending" as const,
  });
}

function abstractPattern(
  pattern: RunnerLabGeneratedPattern,
  worldSpeedMilliPerTick: number,
): AbstractReachabilityPattern {
  const safeOffsetTicks = Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
      worldSpeedMilliPerTick,
  ) + 1;
  return deepFreeze({
    patternKey: `${pattern.patternIndex}:${pattern.patternId}`,
    anchorTick: pattern.anchorTick,
    safeBoundaryTick: runnerPatternSafeBoundaryTick(
      pattern,
      worldSpeedMilliPerTick,
    ),
    laneRequirements: pattern.entities.map((entity) => ({
      kind: entity.kind === "hazard" ? "required-hazard" as const : "benefit" as const,
      lane: entity.lane,
      contactTick: entity.contactTick,
      safeTick: entity.contactTick + safeOffsetTicks,
    })),
  });
}

function certificateForPattern(
  course: RunnerLabGeneratedCourse,
  requestedPatternIndex: number,
): RunnerReachabilityCertificate {
  const proofStartIndex = Math.min(requestedPatternIndex, 8);
  const proofPatterns = course.patterns.slice(
    proofStartIndex - 1,
    proofStartIndex + 2,
  );
  if (proofPatterns.length !== 3) {
    fail("rolling reachability proof must contain three authentic patterns");
  }
  const certifiedPatternIndexes = Object.freeze([
    proofPatterns[0]!.patternIndex,
    proofPatterns[1]!.patternIndex,
    proofPatterns[2]!.patternIndex,
  ]) as readonly [number, number, number];
  const certifiedStartTick = proofPatterns[0]!.spawnTick;
  const proof = assertRunnerReachability(
    proofPatterns.map((pattern) =>
      abstractPattern(pattern, course.worldSpeedMilliPerTick)),
    { startTick: certifiedStartTick },
  );
  return deepFreeze({
    certificateId: RUNNER_REACHABILITY_CERTIFICATE_ID,
    requestedAppendPatternIndex: requestedPatternIndex,
    certifiedPatternIndexes,
    certifiedStartTick,
    checkedThroughTick: proof.checkedThroughTick,
    incomingStateCount: proof.incomingStateCount,
    firstStepInputCaseCount: proof.firstStepInputCaseCount,
    minimumViableStateCount: proof.minimumViableStateCount,
    coverageBasis: "all-107-incoming-states-at-certified-start" as const,
  });
}

/** Creates one immutable deterministic course/proof context per mount or reload. */
export function createRunnerSimulationContext(
  runSeed: string,
  difficulty: Difficulty,
): RunnerSimulationContext {
  const course = generateRunnerLaboratoryCourse(runSeed, difficulty);
  assertAuthenticRunnerLaboratoryCourse(course, runSeed, difficulty);
  const context = deepFreeze({
    simulationId: RUNNER_SIMULATION_ID as typeof RUNNER_SIMULATION_ID,
    runSeed,
    difficulty,
    course,
    reachabilityCertificates: course.patterns.map((pattern) =>
      certificateForPattern(course, pattern.patternIndex)),
  });
  AUTHENTIC_SIMULATION_CONTEXTS.add(context);
  return context;
}

function assertContext(
  context: RunnerSimulationContext,
  state: RunStateV1,
): RunnerLabGeneratedCourse {
  if (!AUTHENTIC_SIMULATION_CONTEXTS.has(context)) {
    fail("simulation context is not authentic");
  }
  if (!isDeepFrozen(context) || !isDeepFrozen(state)) {
    fail("context and state must be deeply immutable");
  }
  if (
    context.simulationId !== RUNNER_SIMULATION_ID ||
    context.runSeed !== state.runSeed ||
    context.difficulty !== state.difficulty
  ) {
    fail("simulation context does not match state seed and difficulty");
  }
  assertAuthenticRunnerLaboratoryCourse(
    context.course,
    state.runSeed,
    state.difficulty,
  );
  if (state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID) {
    fail("state is not the runner laboratory");
  }
  return context.course;
}

function expectedCursor(
  course: RunnerLabGeneratedCourse,
  patternIndex: number,
): RunnerLabGeneratedPattern["outgoingCursor"] {
  if (patternIndex === 0) return course.initialCursor;
  const pattern = course.patterns[patternIndex - 1];
  if (pattern === undefined) fail("spawn pattern index is outside the course");
  return pattern.outgoingCursor;
}

function resolvedThroughPatternIndex(
  course: RunnerLabGeneratedCourse,
  appendedPatternIndex: number,
  resolvedEntityIds: readonly string[],
): number {
  const resolved = new Set(resolvedEntityIds);
  let through = 0;
  for (const pattern of course.patterns.slice(0, appendedPatternIndex)) {
    if (!pattern.spawnEntities.every((entity) => resolved.has(entity.instanceId))) {
      break;
    }
    through = pattern.patternIndex;
  }
  return through;
}

function sameEntityShape(
  actual: RunnerEntity,
  expected: RunnerLabGeneratedPattern["spawnEntities"][number],
  expectedXMilli: number,
): boolean {
  return (
    actual.instanceId === expected.instanceId &&
    actual.contentId === expected.contentId &&
    actual.kind === expected.kind &&
    actual.patternIndex === expected.patternIndex &&
    actual.slotIndex === expected.slotIndex &&
    actual.lane === expected.lane &&
    actual.xMilli === expectedXMilli &&
    actual.widthMilli === expected.widthMilli &&
    actual.contactState === "pending"
  );
}

function assertCanonicalActiveBoundary(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
): RunnerState {
  if (
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.stage.settlement !== null ||
    state.runner === null
  ) {
    fail("ordinary simulation requires an active laboratory state");
  }
  if (
    state.stage.ageMonths !== 0 ||
    state.stage.durationTicks !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks ||
    state.recovery !== null ||
    state.encounter !== null
  ) {
    fail("active laboratory envelope is malformed");
  }
  if (
    state.simulationTick !== state.stage.activeTicks ||
    state.stage.worldDistanceMilli !==
      state.simulationTick * course.worldSpeedMilliPerTick ||
    state.simulationTick < 0 ||
    state.simulationTick >= RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks
  ) {
    fail("active laboratory clock or distance is malformed");
  }
  assertLaneControllerState({
    motion: state.runner.motion,
    inputBuffer: state.runner.inputBuffer,
  });

  const spawn = state.runner.spawn;
  if (
    !Number.isInteger(spawn.patternIndex) ||
    spawn.patternIndex < 0 ||
    spawn.patternIndex > course.patterns.length
  ) {
    fail("spawn pattern index is outside the authentic course");
  }
  const cursor = expectedCursor(course, spawn.patternIndex);
  if (
    spawn.nextSpawnTick !== cursor.nextSpawnTick ||
    spawn.nextSpawnDistanceMilli !== cursor.nextSpawnDistanceMilli
  ) {
    fail("spawn cursor differs from the authentic course");
  }
  if (
    state.simulationTick >= spawn.nextSpawnTick ||
    state.stage.worldDistanceMilli >= spawn.nextSpawnDistanceMilli
  ) {
    fail("durable state crossed a due spawn boundary without appending");
  }
  const lastAppendedPattern = course.patterns[spawn.patternIndex - 1];
  if (
    lastAppendedPattern !== undefined &&
    lastAppendedPattern.spawnTick > state.simulationTick
  ) {
    fail("durable state contains a pattern before its spawn boundary");
  }

  // Saves cross the untrusted boundary through run-state-codec, which applies
  // the exhaustive course projection. Reducer-owned states are then frozen and
  // paired with the WeakSet-authenticated context above. Keep the inexpensive
  // active envelope, lane closure, exact cursor, and due-append checks in every
  // production tick; retain the redundant full timeline/ledger rescan in DEV
  // and evaluator builds where it remains valuable as an implementation
  // assertion. The collision step below still authenticates every live entity,
  // and appendDuePattern still performs the locked three-pattern proof.
  if (!import.meta.env.DEV) return state.runner;

  const resolvedIds = spawn.resolvedEntityIds;
  const canonicalResolved = sortedUnique(resolvedIds);
  if (
    canonicalResolved.length !== resolvedIds.length ||
    canonicalResolved.some((id, index) => id !== resolvedIds[index]) ||
    resolvedIds.length > RUNNER_LABORATORY_GENERATOR_CONTRACT.maxResolvedEntityIds
  ) {
    fail("resolved entity IDs are noncanonical or exceed the cap");
  }
  if (
    state.runner.activeEntities.length >
      RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities ||
    state.runner.activeEntities.some((entity, index, entities) =>
      index > 0 &&
      compareRunnerEntityCoordinates(entities[index - 1]!, entity) >= 0)
  ) {
    fail("active entities are noncanonical or exceed the cap");
  }

  const expectedSpawnEntities = course.patterns
    .slice(0, spawn.patternIndex)
    .flatMap((pattern) => pattern.spawnEntities);
  const expectedById = new Map(
    expectedSpawnEntities.map((entity) => [entity.instanceId, entity]),
  );
  const activeIds = new Set<string>();
  for (const entity of state.runner.activeEntities) {
    if (activeIds.has(entity.instanceId) || resolvedIds.includes(entity.instanceId)) {
      fail("active entity is duplicated or already resolved");
    }
    activeIds.add(entity.instanceId);
    const expected = expectedById.get(entity.instanceId);
    const pattern = course.patterns[entity.patternIndex - 1];
    if (expected === undefined || pattern === undefined) {
      fail("active entity is outside the appended authentic course prefix");
    }
    const expectedXMilli = expected.xMilli -
      course.worldSpeedMilliPerTick *
        (state.simulationTick - pattern.spawnTick);
    if (!sameEntityShape(entity, expected, expectedXMilli)) {
      fail("active entity differs from its authentic timeline coordinate");
    }
    const safeTerminalTick = expected.kind === "opportunity"
      ? runnerPatternSafeBoundaryTick(
          pattern,
          course.worldSpeedMilliPerTick,
        )
      : expected.contactTick + Math.floor(
          RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
            course.worldSpeedMilliPerTick,
        ) + 1;
    if (state.simulationTick >= safeTerminalTick) {
      fail("active entity survived its exact terminal boundary");
    }
  }

  const allowedResolvedIds = new Set([
    course.startMarker.instanceId,
    ...expectedSpawnEntities.map((entity) => entity.instanceId),
  ]);
  if (resolvedIds.some((id) => !allowedResolvedIds.has(id))) {
    fail("resolved entity is outside the appended authentic course prefix");
  }
  for (const resolvedId of resolvedIds) {
    if (resolvedId === course.startMarker.instanceId) continue;
    const expected = expectedById.get(resolvedId);
    const pattern = expected === undefined
      ? undefined
      : course.patterns[expected.patternIndex - 1];
    if (expected === undefined || pattern === undefined) {
      fail("resolved entity lacks an authentic appended coordinate");
    }
    const earliestTerminalTick = expected.kind === "opportunity"
      ? pattern.spawnTick + 1
      : expected.contactTick;
    if (state.simulationTick < earliestTerminalTick) {
      fail("resolved entity precedes its earliest terminal boundary");
    }
  }
  for (const entity of expectedSpawnEntities) {
    if (!activeIds.has(entity.instanceId) && !resolvedIds.includes(entity.instanceId)) {
      fail("appended entity is neither active nor terminal");
    }
  }

  const startResolved = resolvedIds.includes(course.startMarker.instanceId);
  if (
    !startResolved &&
    (state.simulationTick !== 0 || spawn.patternIndex !== 0 || !state.runner.userPaused)
  ) {
    fail("unresolved Start sentinel is outside its exact entry boundary");
  }
  const exactResolvedThrough = resolvedThroughPatternIndex(
    course,
    spawn.patternIndex,
    resolvedIds,
  );
  if (spawn.resolvedThroughPatternIndex !== exactResolvedThrough) {
    fail("resolvedThroughPatternIndex is not the exact consecutive prefix");
  }
  return state.runner;
}

function pendingDecisionMarker(
  runner: RunnerState,
  course: RunnerLabGeneratedCourse,
): RunnerEntity | null {
  const markers = runner.activeEntities.filter((entity) =>
    entity.kind === "opportunity");
  if (markers.length > 1) fail("multiple decision markers are active");
  if (markers.length === 0) return null;
  const marker = markers[0]!;
  const expected = course.patterns[marker.patternIndex - 1]?.decisionMarker;
  if (
    expected === undefined ||
    marker.instanceId !== expected.instanceId ||
    marker.contentId !== expected.contentId ||
    runner.spawn.resolvedEntityIds.includes(marker.instanceId)
  ) {
    fail("pending decision marker is not authentic");
  }
  return marker;
}

function noOpResult(
  state: RunStateV1,
  reason: RunnerSimulationNoOpReason,
  pauseReasons: readonly RunnerIndependentPauseReason[] = Object.freeze([]),
): RunnerSimulationResult {
  return deepFreeze({
    state,
    previousTick: state.simulationTick,
    currentTick: state.simulationTick,
    tickDelta: 0 as const,
    advanced: false,
    stateChanged: false,
    shouldPersist: false,
    acceptedLaneIntent: null,
    noOpReason: reason,
    checkpoint: "unchanged" as const,
    reachabilityCertificate: null,
    events: [{
      type: "no-op" as const,
      simulationTick: state.simulationTick,
      reason,
      independentPauseReasons: pauseReasons,
    }],
  });
}

function decisionResolvedState(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  marker: RunnerEntity,
): RunStateV1 {
  const runner = state.runner!;
  const resolvedEntityIds = sortedUnique([
    ...runner.spawn.resolvedEntityIds,
    marker.instanceId,
  ]);
  const activeEntities = Object.freeze(
    runner.activeEntities.filter((entity) =>
      entity.instanceId !== marker.instanceId),
  );
  return deepFreeze({
    ...state,
    runner: {
      ...runner,
      spawn: {
        ...runner.spawn,
        resolvedThroughPatternIndex: resolvedThroughPatternIndex(
          course,
          runner.spawn.patternIndex,
          resolvedEntityIds,
        ),
        resolvedEntityIds,
      },
      activeEntities,
    },
  });
}

interface OrdinaryStepOptions {
  readonly laneIntent: LaneIntent;
  readonly prefixEvents?: readonly RunnerSimulationEvent[];
  readonly bufferAfterStep?: LaneDirection | null;
  readonly automaticSettlementScores?: AutomaticSettlementOracleScores;
}

function appendDuePattern(
  context: RunnerSimulationContext,
  course: RunnerLabGeneratedCourse,
  state: RunStateV1,
  events: RunnerSimulationEvent[],
): {
  readonly state: RunStateV1;
  readonly certificate: RunnerReachabilityCertificate | null;
  readonly appended: boolean;
} {
  const runner = state.runner!;
  const tickDue = state.simulationTick >= runner.spawn.nextSpawnTick;
  const distanceDue =
    state.stage.worldDistanceMilli >= runner.spawn.nextSpawnDistanceMilli;
  if (tickDue !== distanceDue) {
    fail("tick and distance spawn triggers diverged");
  }
  if (!tickDue) {
    return Object.freeze({ state, certificate: null, appended: false });
  }
  if (runner.spawn.patternIndex >= course.patterns.length) {
    fail("ordinary simulation attempted the terminal tick-3001 sentinel");
  }
  const pattern = course.patterns[runner.spawn.patternIndex]!;
  if (
    pattern.patternIndex !== runner.spawn.patternIndex + 1 ||
    pattern.spawnTick !== state.simulationTick ||
    pattern.spawnDistanceMilli !== state.stage.worldDistanceMilli ||
    pattern.incomingCursor.patternIndex !== runner.spawn.patternIndex ||
    pattern.incomingCursor.nextSpawnTick !== runner.spawn.nextSpawnTick ||
    pattern.incomingCursor.nextSpawnDistanceMilli !==
      runner.spawn.nextSpawnDistanceMilli
  ) {
    fail("due pattern does not match the exact post-transition boundary");
  }
  const certificate = context.reachabilityCertificates[pattern.patternIndex - 1];
  if (
    certificate === undefined ||
    certificate.requestedAppendPatternIndex !== pattern.patternIndex ||
    certificate.incomingStateCount !== 107 ||
    certificate.firstStepInputCaseCount !== 321
  ) {
    fail("due pattern lacks its authentic rolling reachability certificate");
  }

  const activeEntities = Object.freeze([
    ...runner.activeEntities,
    ...pattern.spawnEntities.map((entity) => generatedEntityProjection(entity)),
  ].sort(compareRunnerEntityCoordinates));
  if (
    activeEntities.length >
    RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities
  ) {
    fail("pattern append exceeds the active entity cap");
  }
  if (
    (state.controlMode === "semantic-assist" ||
      state.controlMode === "automatic-assist") &&
    (runner.motion.kind !== "idle" || runner.inputBuffer !== null)
  ) {
    fail("Assist pattern checkpoint must be idle with a null buffer");
  }
  const appended = deepFreeze({
    ...state,
    runner: {
      ...runner,
      spawn: {
        ...runner.spawn,
        ...pattern.outgoingCursor,
      },
      activeEntities,
    },
  });
  events.push(deepFreeze({
    type: "reachability-certified" as const,
    simulationTick: state.simulationTick,
    certificate,
  }));
  events.push(deepFreeze({
    type: "pattern-appended" as const,
    simulationTick: state.simulationTick,
    patternIndex: pattern.patternIndex,
    entityInstanceIds: pattern.spawnEntities.map((entity) => entity.instanceId),
  }));
  return Object.freeze({ state: appended, certificate, appended: true });
}

function ordinaryStep(
  context: RunnerSimulationContext,
  state: RunStateV1,
  options: OrdinaryStepOptions,
): RunnerSimulationResult {
  const course = context.course;
  const runner = state.runner!;
  const lane = stepLaneController({
    motion: runner.motion,
    inputBuffer: runner.inputBuffer,
  }, options.laneIntent);
  const nextTick = state.simulationTick + 1;
  if (nextTick > RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks) {
    fail("ordinary simulation cannot advance beyond tick 3000");
  }
  const nextDistance = state.stage.worldDistanceMilli +
    course.worldSpeedMilliPerTick;
  const events: RunnerSimulationEvent[] = [
    ...(options.prefixEvents ?? []),
    deepFreeze({
      type: "lane-stepped" as const,
      simulationTick: nextTick,
      request: options.laneIntent,
      motion: lane.motion,
      inputBuffer: lane.inputBuffer,
    }),
    deepFreeze({
      type: "clock-advanced" as const,
      simulationTick: nextTick,
      activeTicks: nextTick,
      worldDistanceMilli: nextDistance,
    }),
  ];
  const collision = advanceAndResolveRunnerEntities({
    course,
    runSeed: state.runSeed,
    difficulty: state.difficulty,
    activeEntities: runner.activeEntities,
    playerLanePositionMilli: lanePositionMilli(lane),
    controlMode: state.controlMode,
    simulationTick: nextTick,
    scores: state.scores,
    ledger: state.effectLedger,
    invulnerableUntilTick: runner.invulnerableUntilTick,
    resolvedEntityIds: runner.spawn.resolvedEntityIds,
  });
  events.push(...collision.events.map((contact) => deepFreeze({
    type: "contact-resolved" as const,
    contact,
  })));
  events.push(...collision.passedEntityIds.map((entityInstanceId) =>
    deepFreeze({
      type: "entity-passed" as const,
      simulationTick: nextTick,
      entityInstanceId,
    })));

  const through = resolvedThroughPatternIndex(
    course,
    runner.spawn.patternIndex,
    collision.resolvedEntityIds,
  );
  if (through !== runner.spawn.resolvedThroughPatternIndex) {
    events.push(deepFreeze({
      type: "resolved-through-advanced" as const,
      simulationTick: nextTick,
      resolvedThroughPatternIndex: through,
    }));
  }
  let nextState: RunStateV1 = deepFreeze({
    ...state,
    scores: collision.scores,
    effectLedger: collision.ledger,
    simulationTick: nextTick,
    stage: {
      ...state.stage,
      activeTicks: nextTick,
      worldDistanceMilli: nextDistance,
    },
    runner: {
      ...runner,
      motion: lane.motion,
      inputBuffer: lane.inputBuffer,
      spawn: {
        ...runner.spawn,
        resolvedThroughPatternIndex: through,
        resolvedEntityIds: collision.resolvedEntityIds,
      },
      activeEntities: collision.activeEntities,
      invulnerableUntilTick: collision.invulnerableUntilTick,
    },
  });

  const append = appendDuePattern(context, course, nextState, events);
  nextState = append.state;
  if (options.bufferAfterStep !== undefined && options.bufferAfterStep !== null) {
    if (append.appended) {
      fail("a target commit cannot cross into a second decision checkpoint");
    }
    const nextRunner = nextState.runner!;
    if (
      nextRunner.motion.kind !== "moving" ||
      nextRunner.motion.elapsedTicks !== 1 ||
      nextRunner.inputBuffer !== null ||
      adjacentLane(nextRunner.motion.targetLane, options.bufferAfterStep) === null
    ) {
      fail("two-lane target did not produce a legal first tween");
    }
    nextState = deepFreeze({
      ...nextState,
      runner: {
        ...nextRunner,
        inputBuffer: options.bufferAfterStep,
      },
    });
    events.push(deepFreeze({
      type: "lane-buffer-queued" as const,
      simulationTick: nextTick,
      direction: options.bufferAfterStep,
    }));
  }

  let checkpoint: RunnerSimulationCheckpoint = append.appended
    ? "pattern"
    : "tick";
  if (nextTick === RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks) {
    nextState = beginLabSettlement(
      nextState,
      options.automaticSettlementScores ?? null,
    );
    const settlement = nextState.stage.settlement!;
    events.push(deepFreeze({
      type: "finish-sentinel-resolved" as const,
      simulationTick: 3000 as const,
      entityInstanceId: course.finishMarker.instanceId,
    }));
    events.push(deepFreeze({
      type: "settlement-pending" as const,
      simulationTick: 3000 as const,
      settlementId: settlement.settlementId,
      effectIds: settlement.effectIds,
    }));
    checkpoint = "settlement";
  }

  return deepFreeze({
    state: nextState,
    previousTick: state.simulationTick,
    currentTick: nextState.simulationTick,
    tickDelta: 1 as const,
    advanced: true,
    stateChanged: true,
    shouldPersist: true,
    acceptedLaneIntent: options.laneIntent,
    noOpReason: null,
    checkpoint,
    reachabilityCertificate: append.certificate,
    events,
  });
}

/** Resolves the zero-tick implicit Start sentinel exactly once. */
export function startRunnerLaboratory(
  context: RunnerSimulationContext,
  state: RunStateV1,
  independentPauseReasons: readonly RunnerIndependentPauseReason[] = [],
): RunnerSimulationResult {
  const course = assertContext(context, state);
  const runner = assertCanonicalActiveBoundary(state, course);
  const pauseReasons = canonicalPauseReasons(independentPauseReasons)
    .filter((reason) => reason !== "user");
  if (pauseReasons.length > 0) {
    return noOpResult(state, "independent-pause", Object.freeze(pauseReasons));
  }
  if (runner.spawn.resolvedEntityIds.includes(course.startMarker.instanceId)) {
    return noOpResult(state, "start-already-acknowledged");
  }
  const resolvedEntityIds = sortedUnique([
    ...runner.spawn.resolvedEntityIds,
    course.startMarker.instanceId,
  ]);
  const nextState = deepFreeze({
    ...state,
    runner: {
      ...runner,
      spawn: {
        ...runner.spawn,
        resolvedEntityIds,
      },
      userPaused: false,
    },
  });
  return deepFreeze({
    state: nextState,
    previousTick: 0,
    currentTick: 0,
    tickDelta: 0 as const,
    advanced: false,
    stateChanged: true,
    shouldPersist: true,
    acceptedLaneIntent: null,
    noOpReason: null,
    checkpoint: "start" as const,
    reachabilityCertificate: null,
    events: [{
      type: "start-acknowledged" as const,
      simulationTick: 0 as const,
      entityInstanceId: course.startMarker.instanceId,
    }],
  });
}

function prepareDecisionCommit(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  marker: RunnerEntity,
  targetLane: Lane,
  controlMode: "semantic-assist" | "automatic-assist",
): {
  readonly state: RunStateV1;
  readonly laneIntent: LaneIntent;
  readonly bufferAfterStep: LaneDirection | null;
  readonly event: RunnerSimulationEvent;
} {
  const runner = state.runner!;
  const compilation = compileNeutralLaneTarget(
    runner.motion.currentLane,
    targetLane,
  );
  return deepFreeze({
    state: decisionResolvedState(state, course, marker),
    laneIntent: compilation.firstIntent,
    bufferAfterStep: compilation.bufferedIntent,
    event: {
      type: "decision-marker-resolved" as const,
      simulationTick: state.simulationTick,
      entityInstanceId: marker.instanceId,
      controlMode,
      targetLane,
    },
  });
}

/** Executes one ordinary logical step, or returns an explicit immutable no-op. */
export function advanceRunnerLaboratory(
  context: RunnerSimulationContext,
  state: RunStateV1,
  input: RunnerSimulationStepInput = {},
): RunnerSimulationResult {
  const course = assertContext(context, state);
  if (
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.stage.settlement !== null ||
    state.runner === null
  ) {
    return noOpResult(state, "not-active");
  }
  const runner = assertCanonicalActiveBoundary(state, course);
  const laneIntent = input.laneIntent ?? null;
  assertLaneIntent(laneIntent);
  const pauseReasons = canonicalPauseReasons(input.independentPauseReasons);
  if (!runner.spawn.resolvedEntityIds.includes(course.startMarker.instanceId)) {
    return noOpResult(state, "start-pending", pauseReasons);
  }
  if (runner.userPaused) {
    return noOpResult(state, "user-paused", pauseReasons);
  }
  if (pauseReasons.length > 0) {
    return noOpResult(state, "independent-pause", pauseReasons);
  }

  const automaticTarget = input.automaticTarget ?? null;
  const automaticScores = input.automaticScores ?? null;
  if (automaticTarget !== null) {
    assertLane(automaticTarget.targetLane, "automatic oracle target");
  }
  if (automaticScores !== null) {
    assertCoreScores(automaticScores.scores);
  }
  const marker = pendingDecisionMarker(runner, course);

  if (state.controlMode === "manual") {
    if (automaticTarget !== null || automaticScores !== null) {
      return noOpResult(state, "unexpected-automatic-oracle");
    }
    return ordinaryStep(context, state, { laneIntent });
  }

  if (laneIntent !== null) {
    return noOpResult(state, "raw-input-disabled");
  }
  if (state.controlMode === "semantic-assist") {
    if (automaticTarget !== null || automaticScores !== null) {
      return noOpResult(state, "unexpected-automatic-oracle");
    }
    if (marker !== null) {
      return noOpResult(state, "semantic-decision-pending");
    }
    return ordinaryStep(context, state, { laneIntent: null });
  }

  const isTerminalStep =
    state.simulationTick ===
      RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks - 1;
  if (automaticScores !== null && !isTerminalStep) {
    return noOpResult(state, "unexpected-automatic-oracle");
  }

  if (marker !== null) {
    if (automaticTarget === null) {
      return noOpResult(state, "automatic-oracle-required");
    }
    if (runner.motion.kind !== "idle" || runner.inputBuffer !== null) {
      return noOpResult(state, "automatic-decision-not-ready");
    }
    const commit = prepareDecisionCommit(
      state,
      course,
      marker,
      automaticTarget.targetLane,
      "automatic-assist",
    );
    return ordinaryStep(context, commit.state, {
      laneIntent: commit.laneIntent,
      bufferAfterStep: commit.bufferAfterStep,
      prefixEvents: [commit.event],
      automaticSettlementScores: automaticScores?.scores ?? null,
    });
  }
  if (automaticTarget !== null) {
    return noOpResult(state, "unexpected-automatic-oracle");
  }
  if (
    isTerminalStep &&
    automaticScores === null
  ) {
    return noOpResult(state, "automatic-scores-required");
  }
  return ordinaryStep(context, state, {
    laneIntent: null,
    automaticSettlementScores: automaticScores?.scores ?? null,
  });
}

/**
 * Atomically acknowledges one Semantic marker and compiles a target into one
 * ordinary adjacent step plus, only for a two-lane target, one same-direction
 * persisted buffer.
 */
export function chooseLane(
  context: RunnerSimulationContext,
  state: RunStateV1,
  targetLane: Lane,
  independentPauseReasons: readonly RunnerIndependentPauseReason[] = [],
): RunnerSimulationResult {
  assertLane(targetLane, "Semantic target");
  const course = assertContext(context, state);
  if (
    state.runStatus !== "active" ||
    state.stage.phase !== "active" ||
    state.stage.settlement !== null ||
    state.runner === null
  ) {
    return noOpResult(state, "semantic-choice-not-applicable");
  }
  const runner = assertCanonicalActiveBoundary(state, course);
  if (state.controlMode !== "semantic-assist") {
    return noOpResult(state, "semantic-choice-not-applicable");
  }
  const pauseReasons = canonicalPauseReasons(independentPauseReasons);
  if (runner.userPaused || pauseReasons.length > 0) {
    return noOpResult(state, "independent-pause", pauseReasons);
  }
  const marker = pendingDecisionMarker(runner, course);
  if (
    marker === null ||
    runner.motion.kind !== "idle" ||
    runner.inputBuffer !== null
  ) {
    return noOpResult(state, "semantic-choice-not-ready");
  }
  const commit = prepareDecisionCommit(
    state,
    course,
    marker,
    targetLane,
    "semantic-assist",
  );
  return ordinaryStep(context, commit.state, {
    laneIntent: commit.laneIntent,
    bufferAfterStep: commit.bufferAfterStep,
    prefixEvents: [commit.event],
    automaticSettlementScores: null,
  });
}
