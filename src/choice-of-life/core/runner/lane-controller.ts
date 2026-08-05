import type {
  IdleMotion,
  Lane,
  MovingMotion,
  RunnerMotion,
} from "../run-state";
import { RUNNER_LABORATORY_MOVEMENT_CONTRACT } from "./contract";

export const RUNNER_LANES = RUNNER_LABORATORY_MOVEMENT_CONTRACT.lanes;
export const RUNNER_LANE_CENTERS_MILLI =
  RUNNER_LABORATORY_MOVEMENT_CONTRACT.laneCentersMilli;
export const RUNNER_LANE_TWEEN_TICKS =
  RUNNER_LABORATORY_MOVEMENT_CONTRACT.tweenTicks;

export type LaneDirection = "up" | "down";
export type LaneIntent = LaneDirection | null;

export interface LaneControllerState {
  readonly motion: RunnerMotion;
  readonly inputBuffer: LaneIntent;
}

const LANE_INTENTS: readonly LaneIntent[] = [null, "up", "down"];

function isLane(value: number): value is Lane {
  return value === 0 || value === 1 || value === 2;
}

function assertLane(value: number, name: string): asserts value is Lane {
  if (!isLane(value)) {
    throw new RangeError(`${name} must be lane 0, 1, or 2`);
  }
}

function assertDirection(
  value: LaneIntent,
  name: string,
): asserts value is LaneIntent {
  if (value !== null && value !== "up" && value !== "down") {
    throw new TypeError(`${name} must be up, down, or null`);
  }
}

export function adjacentLane(
  lane: Lane,
  direction: LaneDirection,
): Lane | null {
  const target = direction === "up" ? lane - 1 : lane + 1;
  return isLane(target) ? target : null;
}

function idleMotion(lane: Lane): IdleMotion {
  return Object.freeze({
    kind: "idle",
    currentLane: lane,
    sourceLane: lane,
    targetLane: lane,
    elapsedTicks: 0,
    totalTicks: RUNNER_LANE_TWEEN_TICKS,
  });
}

function movingMotion(
  sourceLane: Lane,
  targetLane: Lane,
  elapsedTicks: number,
): MovingMotion {
  return Object.freeze({
    kind: "moving",
    currentLane: sourceLane,
    sourceLane,
    targetLane,
    elapsedTicks,
    totalTicks: RUNNER_LANE_TWEEN_TICKS,
  });
}

function freezeState(
  motion: RunnerMotion,
  inputBuffer: LaneIntent,
): LaneControllerState {
  return Object.freeze({ motion, inputBuffer });
}

export function assertLaneControllerState(
  state: LaneControllerState,
): void {
  assertDirection(state.inputBuffer, "input buffer");
  const { motion } = state;
  if (motion.kind !== "idle" && motion.kind !== "moving") {
    throw new TypeError("motion kind must be idle or moving");
  }
  assertLane(motion.currentLane, "current lane");
  assertLane(motion.sourceLane, "source lane");
  assertLane(motion.targetLane, "target lane");
  if (motion.totalTicks !== RUNNER_LANE_TWEEN_TICKS) {
    throw new RangeError("lane tween must last exactly 11 ticks");
  }

  if (motion.kind === "idle") {
    if (
      motion.elapsedTicks !== 0 ||
      motion.currentLane !== motion.sourceLane ||
      motion.currentLane !== motion.targetLane
    ) {
      throw new RangeError("idle motion must use one lane at elapsed tick zero");
    }
    if (
      state.inputBuffer !== null &&
      adjacentLane(motion.currentLane, state.inputBuffer) === null
    ) {
      throw new RangeError("idle handoff buffer must lead to an adjacent lane");
    }
    return;
  }

  if (
    !Number.isInteger(motion.elapsedTicks) ||
    motion.elapsedTicks < 1 ||
    motion.elapsedTicks >= RUNNER_LANE_TWEEN_TICKS
  ) {
    throw new RangeError("moving elapsed ticks must be in the range 1 through 10");
  }
  if (Math.abs(motion.sourceLane - motion.targetLane) !== 1) {
    throw new RangeError("moving motion must cross exactly one adjacent lane");
  }
  if (motion.currentLane !== motion.sourceLane) {
    throw new RangeError("moving current lane must remain the source lane");
  }
  if (
    state.inputBuffer !== null &&
    adjacentLane(motion.targetLane, state.inputBuffer) === null
  ) {
    throw new RangeError("moving buffer must be legal from the current target");
  }
}

function beginMove(
  sourceLane: Lane,
  direction: LaneDirection,
): LaneControllerState {
  const targetLane = adjacentLane(sourceLane, direction);
  if (targetLane === null) {
    return freezeState(idleMotion(sourceLane), null);
  }
  return freezeState(movingMotion(sourceLane, targetLane, 1), null);
}

/**
 * Applies one logical lane step. A completed tween may retain one committed
 * handoff, but that handoff cannot start until the following logical step.
 */
export function stepLaneController(
  state: LaneControllerState,
  request: LaneIntent,
): LaneControllerState {
  assertLaneControllerState(state);
  assertDirection(request, "lane request");

  const { motion } = state;
  if (motion.kind === "idle") {
    if (state.inputBuffer !== null) {
      return beginMove(motion.currentLane, state.inputBuffer);
    }
    if (request === null) {
      return freezeState(idleMotion(motion.currentLane), null);
    }
    return beginMove(motion.currentLane, request);
  }

  let nextBuffer = state.inputBuffer;
  if (
    nextBuffer === null &&
    request !== null &&
    adjacentLane(motion.targetLane, request) !== null
  ) {
    nextBuffer = request;
  }

  const elapsedTicks = motion.elapsedTicks + 1;
  if (elapsedTicks === RUNNER_LANE_TWEEN_TICKS) {
    return freezeState(idleMotion(motion.targetLane), nextBuffer);
  }
  return freezeState(
    movingMotion(motion.sourceLane, motion.targetLane, elapsedTicks),
    nextBuffer,
  );
}

export function lanePositionMilli(state: LaneControllerState): number {
  assertLaneControllerState(state);
  const { motion } = state;
  if (motion.kind === "idle") {
    return RUNNER_LANE_CENTERS_MILLI[motion.currentLane];
  }

  return Math.round(
    ((motion.sourceLane * (RUNNER_LANE_TWEEN_TICKS - motion.elapsedTicks) +
      motion.targetLane * motion.elapsedTicks) *
      1_000) /
      RUNNER_LANE_TWEEN_TICKS,
  );
}

export function laneControllerStateKey(state: LaneControllerState): string {
  assertLaneControllerState(state);
  const { motion } = state;
  return [
    motion.kind,
    motion.currentLane,
    motion.sourceLane,
    motion.targetLane,
    motion.elapsedTicks,
    state.inputBuffer ?? "none",
  ].join(":");
}

function legalDirectionsFrom(lane: Lane): readonly LaneDirection[] {
  return LANE_INTENTS.filter(
    (intent): intent is LaneDirection =>
      intent !== null && adjacentLane(lane, intent) !== null,
  );
}

/** Enumerates the exact Phase 2 append-time closure: 7 idle + 100 moving. */
export function enumerateIncomingLaneStates(): readonly LaneControllerState[] {
  const states: LaneControllerState[] = [];

  for (const lane of RUNNER_LANES) {
    states.push(freezeState(idleMotion(lane), null));
    for (const direction of legalDirectionsFrom(lane)) {
      states.push(freezeState(idleMotion(lane), direction));
    }
  }

  const directedTweens: readonly (readonly [Lane, Lane])[] = [
    [0, 1],
    [1, 0],
    [1, 2],
    [2, 1],
  ];
  for (const [sourceLane, targetLane] of directedTweens) {
    const buffers: readonly LaneIntent[] = [
      null,
      ...legalDirectionsFrom(targetLane),
    ];
    for (
      let elapsedTicks = 1;
      elapsedTicks < RUNNER_LANE_TWEEN_TICKS;
      elapsedTicks += 1
    ) {
      for (const inputBuffer of buffers) {
        states.push(
          freezeState(
            movingMotion(sourceLane, targetLane, elapsedTicks),
            inputBuffer,
          ),
        );
      }
    }
  }

  return Object.freeze(states);
}

/**
 * Finds the exact shortest logical time to arrive idle at a lane after honoring
 * any already-committed tween and one-slot handoff.
 */
export function minimumTicksToIdleLane(
  initialState: LaneControllerState,
  targetLane: Lane,
): number {
  assertLaneControllerState(initialState);
  assertLane(targetLane, "target lane");

  const isGoal = (state: LaneControllerState): boolean =>
    state.motion.kind === "idle" &&
    state.motion.currentLane === targetLane &&
    state.inputBuffer === null;
  if (isGoal(initialState)) return 0;

  let frontier = new Map<string, LaneControllerState>([
    [laneControllerStateKey(initialState), initialState],
  ]);
  const visited = new Set(frontier.keys());
  for (let elapsed = 1; frontier.size > 0; elapsed += 1) {
    const next = new Map<string, LaneControllerState>();
    for (const state of frontier.values()) {
      for (const intent of LANE_INTENTS) {
        const candidate = stepLaneController(state, intent);
        if (isGoal(candidate)) return elapsed;
        const key = laneControllerStateKey(candidate);
        if (!visited.has(key)) {
          visited.add(key);
          next.set(key, candidate);
        }
      }
    }
    frontier = next;
  }

  throw new Error(`lane ${targetLane} is unreachable`);
}
