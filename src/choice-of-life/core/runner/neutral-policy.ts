import {
  canonicalizeJson,
  type CanonicalJsonValue,
} from "../canonical-json";
import { isDeeplyFrozen as isDeepFrozen } from "../immutable";
import type {
  CoreScores,
  Lane,
  RunnerEntity,
  RunnerMotion,
  RunStateV1,
  ScoreId,
} from "../run-state";
import {
  SCORE_IDS,
} from "../run-state";
import {
  advanceAndResolveRunnerEntities,
  runnerPatternSafeBoundaryTick as productionRunnerPatternSafeBoundaryTick,
  type ContactOutcome,
} from "./collision-system";
import {
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
  RUNNER_LANES,
  stepLaneController,
  type LaneControllerState,
  type LaneDirection,
  type LaneIntent,
} from "./lane-controller";

export const RUNNER_NEUTRAL_POLICY_ID = "runner-current-pattern-neutral-v1";
export const RUNNER_NEUTRAL_UTILITY_DENOMINATOR = 3;
export const RUNNER_NEUTRAL_LANE_PRIORITY = Object.freeze([1, 0, 2] as const);

export interface CompiledNeutralLaneTarget {
  readonly sourceLane: Lane;
  readonly targetLane: Lane;
  readonly laneMoves: 0 | 1 | 2;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
}

export interface NeutralScoreDeltas {
  readonly health: number;
  readonly happiness: number;
  readonly money: number;
}

export interface NeutralContactProjection {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly simulationTick: number;
  readonly outcome: ContactOutcome;
  readonly effectId: string | null;
  readonly scoreId: ScoreId | null;
  readonly requestedDelta: number | null;
  readonly actualDelta: number | null;
}

export interface NeutralLaneProjection {
  readonly targetLane: Lane;
  readonly laneMoves: 0 | 1 | 2;
  readonly firstIntent: LaneIntent;
  readonly bufferedIntent: LaneDirection | null;
  readonly commitMotion: RunnerMotion;
  readonly commitInputBuffer: LaneDirection | null;
  readonly projectedTickCount: number;
  readonly safeBoundaryTick: number;
  readonly finalMotion: RunnerMotion;
  readonly finalInputBuffer: LaneDirection | null;
  readonly finalScores: CoreScores;
  readonly actualDeltas: NeutralScoreDeltas;
  readonly utilityNumerator: number;
  readonly utilityDenominator: typeof RUNNER_NEUTRAL_UTILITY_DENOMINATOR;
  readonly finalInvulnerableUntilTick: number;
  readonly effectIds: readonly string[];
  readonly passedEntityIds: readonly string[];
  readonly resolvedEntityIds: readonly string[];
  readonly contacts: readonly NeutralContactProjection[];
}

export interface RunnerNeutralPolicyResult {
  readonly policyId: typeof RUNNER_NEUTRAL_POLICY_ID;
  readonly patternIndex: number;
  readonly sourceLane: Lane;
  readonly safeBoundaryTick: number;
  readonly projections: readonly NeutralLaneProjection[];
  readonly chosenTargetLane: Lane;
  readonly chosenProjection: NeutralLaneProjection;
}

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner neutral policy: ${message}`);
  }
  throw new TypeError();
}

function canonical(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function runnerEntityProjection(
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
): RunnerEntity {
  return {
    instanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: entity.kind,
    patternIndex: entity.patternIndex,
    slotIndex: entity.slotIndex,
    lane: entity.lane,
    xMilli: entity.xMilli,
    widthMilli: entity.widthMilli,
    contactState: "pending",
  };
}

function priorResolvedEntityIds(
  course: ReturnType<typeof generateRunnerLaboratoryCourse>,
  patternIndex: number,
): readonly string[] {
  return Object.freeze([
    course.startMarker.instanceId,
    ...course.patterns
      .filter((pattern) => pattern.patternIndex < patternIndex)
      .flatMap((pattern) =>
        pattern.spawnEntities.map((entity) => entity.instanceId)),
  ].sort((left, right) => left.localeCompare(right)));
}

function assertCheckpoint(
  state: RunStateV1,
  suppliedPattern: RunnerLabGeneratedPattern,
): {
  readonly course: RunnerLabGeneratedCourse;
  readonly pattern: RunnerLabGeneratedPattern;
} {
  if (!isDeepFrozen(suppliedPattern)) {
    fail("generated pattern must be deeply immutable");
  }
  if (state.controlMode !== "manual") {
    fail("checkpoint must use Manual control mode");
  }
  if (
    state.runStatus !== "active" ||
    state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
    state.stage.phase !== "active" ||
    state.stage.durationTicks !== RUNNER_LABORATORY_STAGE_CONTRACT.durationTicks ||
    state.stage.settlement !== null ||
    state.recovery !== null ||
    state.encounter !== null
  ) {
    fail("checkpoint is not an active runner laboratory pattern boundary");
  }
  if (state.runner === null) fail("checkpoint must retain runner state");
  assertLaneControllerState({
    motion: state.runner.motion,
    inputBuffer: state.runner.inputBuffer,
  });
  if (state.runner.motion.kind !== "idle") {
    fail("checkpoint motion must be idle");
  }
  if (state.runner.inputBuffer !== null) {
    fail("checkpoint input buffer must be null");
  }
  if (state.runner.userPaused) {
    fail("canonical Manual checkpoint cannot retain a user pause");
  }

  const course = generateRunnerLaboratoryCourse(state.runSeed, state.difficulty);
  assertAuthenticRunnerLaboratoryCourse(
    course,
    state.runSeed,
    state.difficulty,
  );
  const expectedPattern = course.patterns[suppliedPattern.patternIndex - 1];
  if (
    expectedPattern === undefined ||
    canonical(suppliedPattern) !== canonical(expectedPattern)
  ) {
    fail("supplied pattern does not match the generated course");
  }
  if (
    state.simulationTick !== expectedPattern.spawnTick ||
    state.stage.activeTicks !== expectedPattern.spawnTick ||
    state.stage.worldDistanceMilli !== expectedPattern.spawnDistanceMilli
  ) {
    fail("checkpoint is not at the just-appended pattern tick and distance");
  }
  if (
    state.runner.spawn.patternIndex !== expectedPattern.patternIndex ||
    state.runner.spawn.resolvedThroughPatternIndex !==
      expectedPattern.patternIndex - 1 ||
    state.runner.spawn.nextSpawnTick !==
      expectedPattern.outgoingCursor.nextSpawnTick ||
    state.runner.spawn.nextSpawnDistanceMilli !==
      expectedPattern.outgoingCursor.nextSpawnDistanceMilli
  ) {
    fail("checkpoint spawn cursors do not match the current pattern");
  }

  const expectedResolvedIds = priorResolvedEntityIds(
    course,
    expectedPattern.patternIndex,
  );
  if (
    canonical(state.runner.spawn.resolvedEntityIds) !==
    canonical(expectedResolvedIds)
  ) {
    fail("checkpoint resolved ledger does not match the pattern prefix");
  }
  const markerMatches = state.runner.activeEntities.filter(
    (entity) =>
      entity.instanceId === expectedPattern.decisionMarker.instanceId &&
      entity.contentId === expectedPattern.decisionMarker.contentId &&
      entity.patternIndex === expectedPattern.patternIndex &&
      entity.slotIndex === expectedPattern.decisionMarker.slotIndex &&
      entity.contactState === "pending",
  );
  if (
    markerMatches.length !== 1 ||
    state.runner.spawn.resolvedEntityIds.includes(
      expectedPattern.decisionMarker.instanceId,
    )
  ) {
    fail("checkpoint decision marker is missing, wrong, or already resolved");
  }
  const expectedActiveEntities = expectedPattern.spawnEntities.map(
    runnerEntityProjection,
  );
  if (
    canonical(state.runner.activeEntities) !== canonical(expectedActiveEntities)
  ) {
    fail("checkpoint active entities do not match the just-appended pattern");
  }

  return Object.freeze({
    course,
    pattern: expectedPattern,
  });
}

export function compileNeutralLaneTarget(
  sourceLane: Lane,
  targetLane: Lane,
): CompiledNeutralLaneTarget {
  if (!RUNNER_LANES.includes(sourceLane) || !RUNNER_LANES.includes(targetLane)) {
    fail("compiled lanes must be 0, 1, or 2");
  }
  const difference = targetLane - sourceLane;
  const laneMoves = Math.abs(difference) as 0 | 1 | 2;
  const direction: LaneDirection | null =
    difference < 0 ? "up" : difference > 0 ? "down" : null;
  return Object.freeze({
    sourceLane,
    targetLane,
    laneMoves,
    firstIntent: direction,
    bufferedIntent: laneMoves === 2 ? direction : null,
  });
}

export function runnerPatternSafeBoundaryTick(
  pattern: RunnerLabGeneratedPattern,
  worldSpeedMilliPerTick: number,
): number {
  return productionRunnerPatternSafeBoundaryTick(
    pattern,
    worldSpeedMilliPerTick,
  );
}

function applyCompiledFirstStep(
  state: LaneControllerState,
  compilation: CompiledNeutralLaneTarget,
): LaneControllerState {
  const stepped = stepLaneController(state, compilation.firstIntent);
  if (compilation.bufferedIntent === null) return stepped;
  if (
    stepped.motion.kind !== "moving" ||
    stepped.motion.elapsedTicks !== 1 ||
    stepped.inputBuffer !== null ||
    adjacentLane(stepped.motion.targetLane, compilation.bufferedIntent) === null
  ) {
    fail("two-lane compilation did not produce a legal first tween");
  }
  const buffered = Object.freeze({
    motion: stepped.motion,
    inputBuffer: compilation.bufferedIntent,
  });
  assertLaneControllerState(buffered);
  return buffered;
}

function scoreDeltas(
  before: CoreScores,
  after: CoreScores,
): NeutralScoreDeltas {
  return Object.freeze({
    health: after.health - before.health,
    happiness: after.happiness - before.happiness,
    money: after.money - before.money,
  });
}

function projectTargetLane(
  checkpoint: RunStateV1,
  course: RunnerLabGeneratedCourse,
  pattern: RunnerLabGeneratedPattern,
  targetLane: Lane,
): NeutralLaneProjection {
  const runner = checkpoint.runner;
  if (runner === null || runner.motion.kind !== "idle") {
    fail("projection requires an idle runner checkpoint");
  }
  const compilation = compileNeutralLaneTarget(
    runner.motion.currentLane,
    targetLane,
  );
  const safeBoundaryTick = runnerPatternSafeBoundaryTick(
    pattern,
    course.worldSpeedMilliPerTick,
  );
  const firstState = applyCompiledFirstStep(
    { motion: runner.motion, inputBuffer: null },
    compilation,
  );
  let laneState = firstState;
  let scores = checkpoint.scores;
  let ledger = checkpoint.effectLedger;
  let invulnerableUntilTick = runner.invulnerableUntilTick;
  let activeEntities = runner.activeEntities;
  let resolvedEntityIds = runner.spawn.resolvedEntityIds;
  const effectIds: string[] = [];
  const passedEntityIds: string[] = [];
  const contacts: NeutralContactProjection[] = [];

  for (
    let tick = checkpoint.simulationTick + 1;
    tick <= safeBoundaryTick;
    tick += 1
  ) {
    if (tick > checkpoint.simulationTick + 1) {
      laneState = stepLaneController(laneState, null);
    }
    const transition = advanceAndResolveRunnerEntities({
      course,
      runSeed: checkpoint.runSeed,
      difficulty: checkpoint.difficulty,
      activeEntities,
      playerLanePositionMilli: lanePositionMilli(laneState),
      controlMode: "manual",
      simulationTick: tick,
      scores,
      ledger,
      invulnerableUntilTick,
      resolvedEntityIds,
    });
    scores = transition.scores;
    ledger = transition.ledger;
    invulnerableUntilTick = transition.invulnerableUntilTick;
    activeEntities = transition.activeEntities;
    resolvedEntityIds = transition.resolvedEntityIds;
    effectIds.push(...transition.effectIds);
    passedEntityIds.push(...transition.passedEntityIds);
    contacts.push(...transition.events.map((event) => Object.freeze({
      entityInstanceId: event.entityInstanceId,
      contentId: event.contentId,
      simulationTick: event.simulationTick,
      outcome: event.outcome,
      effectId: event.effect?.effectId ?? null,
      scoreId: event.effect?.scoreId ?? null,
      requestedDelta: event.effect?.requestedDelta ?? null,
      actualDelta: event.effect?.actualDelta ?? null,
    })));
  }

  if (
    activeEntities.length !== 0 ||
    laneState.motion.kind !== "idle" ||
    laneState.motion.currentLane !== targetLane ||
    laneState.inputBuffer !== null
  ) {
    fail("projection did not close at the target lane safe boundary");
  }
  const currentPatternIds = pattern.spawnEntities.map(
    (entity) => entity.instanceId,
  );
  if (
    currentPatternIds.some((instanceId) =>
      !resolvedEntityIds.includes(instanceId))
  ) {
    fail("projection did not terminalize every current-pattern entity");
  }

  const actualDeltas = scoreDeltas(checkpoint.scores, scores);
  const utilityNumerator = SCORE_IDS.reduce(
    (total, scoreId) => total + actualDeltas[scoreId],
    0,
  );
  return Object.freeze({
    targetLane,
    laneMoves: compilation.laneMoves,
    firstIntent: compilation.firstIntent,
    bufferedIntent: compilation.bufferedIntent,
    commitMotion: firstState.motion,
    commitInputBuffer: firstState.inputBuffer,
    projectedTickCount: safeBoundaryTick - checkpoint.simulationTick,
    safeBoundaryTick,
    finalMotion: laneState.motion,
    finalInputBuffer: laneState.inputBuffer,
    finalScores: scores,
    actualDeltas,
    utilityNumerator,
    utilityDenominator: RUNNER_NEUTRAL_UTILITY_DENOMINATOR,
    finalInvulnerableUntilTick: invulnerableUntilTick,
    effectIds: Object.freeze(effectIds),
    passedEntityIds: Object.freeze(passedEntityIds),
    resolvedEntityIds,
    contacts: Object.freeze(contacts),
  });
}

function priorityIndex(lane: Lane): number {
  return RUNNER_NEUTRAL_LANE_PRIORITY.indexOf(lane);
}

function compareNeutralCandidates(
  left: NeutralLaneProjection,
  right: NeutralLaneProjection,
): number {
  const leftNonnegative = left.utilityNumerator >= 0;
  const rightNonnegative = right.utilityNumerator >= 0;
  if (leftNonnegative !== rightNonnegative) return leftNonnegative ? -1 : 1;
  return (
    Math.abs(left.utilityNumerator) - Math.abs(right.utilityNumerator) ||
    left.laneMoves - right.laneMoves ||
    priorityIndex(left.targetLane) - priorityIndex(right.targetLane)
  );
}

/** Evaluates the exact balanced Manual neutral policy at one append checkpoint. */
export function evaluateRunnerNeutralPolicy(
  checkpoint: RunStateV1,
  suppliedPattern: RunnerLabGeneratedPattern,
): RunnerNeutralPolicyResult {
  const validated = assertCheckpoint(checkpoint, suppliedPattern);
  const runner = checkpoint.runner!;
  const sourceLane = runner.motion.currentLane;
  const projections = Object.freeze(
    RUNNER_LANES.map((targetLane) =>
      projectTargetLane(
        checkpoint,
        validated.course,
        validated.pattern,
        targetLane,
      )),
  );
  const stayProjection = projections.find(
    (projection) => projection.targetLane === sourceLane,
  )!;
  const chosenProjection = stayProjection.utilityNumerator >= 0
    ? stayProjection
    : [...projections].sort(compareNeutralCandidates)[0]!;
  return Object.freeze({
    policyId: RUNNER_NEUTRAL_POLICY_ID,
    patternIndex: validated.pattern.patternIndex,
    sourceLane,
    safeBoundaryTick: chosenProjection.safeBoundaryTick,
    projections,
    chosenTargetLane: chosenProjection.targetLane,
    chosenProjection,
  });
}
