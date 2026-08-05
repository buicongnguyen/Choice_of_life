import { deepFreeze } from "../immutable";
import {
  applyScoreDelta,
  createCoreScores,
  type CoreScores,
  type ScoreId,
} from "../score-model";
import {
  NEWBORN_CAREGIVER_OPTIONS,
  NEWBORN_ENTITY_DEFINITIONS,
  NEWBORN_STAGE_CONTRACT,
} from "./contract";
import type {
  NewbornAction,
  NewbornCaregiverOption,
  NewbornCaregiverOptionId,
  NewbornEffectEntry,
  NewbornEffectSource,
  NewbornEntity,
  NewbornLane,
  NewbornRecoveryState,
  NewbornSetup,
  NewbornSourceAttribution,
  NewbornState,
} from "./types";

const DEFAULT_SCORES = Object.freeze({
  health: 65,
  happiness: 60,
  money: 35,
});

function immutable<T>(value: T): T {
  return deepFreeze(value);
}

function emptySourceTotals() {
  return Object.freeze({ health: 0, happiness: 0, money: 0 });
}

function createEmptyAttribution(): NewbornSourceAttribution {
  return Object.freeze({
    runner: emptySourceTotals(),
    choice: emptySourceTotals(),
    recovery: emptySourceTotals(),
    settlement: emptySourceTotals(),
  });
}

function assertSetup(setup: NewbornSetup): void {
  if (setup.runId.trim().length === 0) {
    throw new TypeError("Newborn runId must not be empty");
  }
  if (setup.runSeed.trim().length === 0) {
    throw new TypeError("Newborn runSeed must not be empty");
  }
}

function mixSeed(seed: string, index: number, channel: number): number {
  let hash = (0x811c9dc5 ^ channel) >>> 0;
  const input = `${seed}:${index}`;
  for (let cursor = 0; cursor < input.length; cursor += 1) {
    hash ^= input.charCodeAt(cursor);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return Math.imul(hash, 0x846ca68b) >>> 0;
}

function optionById(
  optionId: NewbornCaregiverOptionId,
): NewbornCaregiverOption {
  const option = NEWBORN_CAREGIVER_OPTIONS.find(
    (candidate) => candidate.optionId === optionId,
  );
  if (option === undefined) {
    throw new RangeError(`Unknown newborn caregiver option: ${optionId}`);
  }
  return option;
}

function entityDefinition(spawnIndex: number, seed: string) {
  const totalWeight = NEWBORN_ENTITY_DEFINITIONS.reduce(
    (total, definition) => total + definition.weight,
    0,
  );
  let choice = mixSeed(seed, spawnIndex, 0x454e5449) % totalWeight;
  for (const definition of NEWBORN_ENTITY_DEFINITIONS) {
    if (choice < definition.weight) return definition;
    choice -= definition.weight;
  }
  return NEWBORN_ENTITY_DEFINITIONS[0];
}

function nextLegalSpawnTick(tick: number): number {
  const { caregiverCorridorStartTick, caregiverCorridorEndTick } =
    NEWBORN_STAGE_CONTRACT;
  if (tick >= caregiverCorridorStartTick && tick < caregiverCorridorEndTick) {
    return caregiverCorridorEndTick;
  }
  return tick;
}

function spawnEntity(state: NewbornState): NewbornEntity {
  const definition = entityDefinition(state.world.spawnIndex, state.runSeed);
  const lane = (mixSeed(
    state.runSeed,
    state.world.spawnIndex,
    0x4c414e45,
  ) % 3) as NewbornLane;
  return Object.freeze({
    instanceId: `newborn-entity-${state.runId}-${state.world.spawnIndex
      .toString()
      .padStart(3, "0")}`,
    contentId: definition.contentId,
    kind: definition.kind,
    lane,
    xMilli: NEWBORN_STAGE_CONTRACT.entitySpawnXMilli,
    widthMilli: NEWBORN_STAGE_CONTRACT.entityWidthMilli,
    scoreId: definition.scoreId,
    scoreDelta: definition.scoreDelta,
    spawnIndex: state.world.spawnIndex,
  });
}

interface EffectProjection {
  readonly scores: CoreScores;
  readonly effects: readonly NewbornEffectEntry[];
  readonly attribution: NewbornSourceAttribution;
}

interface EffectRequest {
  readonly source: NewbornEffectSource;
  readonly categoryId: string;
  readonly scoreId: ScoreId;
  readonly requestedDelta: number;
  readonly choiceId: NewbornCaregiverOptionId | null;
  readonly entityId: string | null;
  readonly tick: number;
}

function applyAttributedEffect(
  projection: EffectProjection,
  request: EffectRequest,
): EffectProjection {
  const change = applyScoreDelta(
    projection.scores,
    request.scoreId,
    request.requestedDelta,
  );
  const sourceTotals = projection.attribution[request.source];
  const attribution = Object.freeze({
    ...projection.attribution,
    [request.source]: Object.freeze({
      ...sourceTotals,
      [request.scoreId]: sourceTotals[request.scoreId] + change.actualDelta,
    }),
  });
  const entry: NewbornEffectEntry = Object.freeze({
    effectId: `newborn-effect-${(projection.effects.length + 1)
      .toString()
      .padStart(4, "0")}`,
    source: request.source,
    categoryId: request.categoryId,
    scoreId: request.scoreId,
    requestedDelta: request.requestedDelta,
    actualDelta: change.actualDelta,
    before: change.before,
    after: change.after,
    causedByChoiceId: request.choiceId,
    causedByEntityId: request.entityId,
    simulationTick: request.tick,
  });
  return Object.freeze({
    scores: change.scores,
    effects: Object.freeze([...projection.effects, entry]),
    attribution,
  });
}

function tickPlayer(state: NewbornState) {
  if (state.player.moveTicksRemaining <= 1) {
    return Object.freeze({
      ...state.player,
      visualMotion: "seated" as const,
      crawlFrame: 0 as const,
      moveTicksRemaining: 0,
    });
  }
  const moveTicksRemaining = state.player.moveTicksRemaining - 1;
  return Object.freeze({
    ...state.player,
    visualMotion: "crawl" as const,
    crawlFrame: (Math.floor(moveTicksRemaining / 3) % 2) as 0 | 1,
    moveTicksRemaining,
  });
}

function enterCaregiverCorridor(state: NewbornState): NewbornState {
  const clearedIds = state.world.entities.map((entity) => entity.instanceId);
  return immutable({
    ...state,
    phase: "caregiver-choice" as const,
    player: Object.freeze({
      ...state.player,
      visualMotion: "seated" as const,
      crawlFrame: 0 as const,
      moveTicksRemaining: 0,
    }),
    world: Object.freeze({
      ...state.world,
      entities: Object.freeze([]),
      nextSpawnTick: nextLegalSpawnTick(state.world.nextSpawnTick),
      resolvedEntityIds: Object.freeze([
        ...state.world.resolvedEntityIds,
        ...clearedIds,
      ]),
    }),
    caregiver: Object.freeze({
      ...state.caregiver,
      status: "presenting" as const,
      presentedTick: state.clock.activeTicks,
    }),
  });
}

function stepCaregiverSafeCorridor(
  state: NewbornState,
  tick: number,
): NewbornState {
  const clearedIds = state.world.entities.map((entity) => entity.instanceId);
  return immutable({
    ...state,
    simulationTick: tick,
    player: tickPlayer(state),
    clock: Object.freeze({ ...state.clock, activeTicks: tick }),
    world: Object.freeze({
      ...state.world,
      distanceMilli:
        state.world.distanceMilli + state.world.speedMilliPerTick,
      entities: Object.freeze([]),
      nextSpawnTick: nextLegalSpawnTick(state.world.nextSpawnTick),
      resolvedEntityIds: Object.freeze([
        ...state.world.resolvedEntityIds,
        ...clearedIds,
      ]),
    }),
  });
}

function applyRecovery(
  projection: EffectProjection,
  recovery: NewbornRecoveryState,
  preTriggerScores: CoreScores,
  entityId: string,
  tick: number,
): Readonly<{ projection: EffectProjection; recovery: NewbornRecoveryState }> {
  let nextProjection = projection;
  const scoreIds = ["health", "happiness", "money"] as const;
  for (const scoreId of scoreIds) {
    if (projection.scores[scoreId] !== 0) continue;
    const target = Math.max(
      1,
      Math.min(NEWBORN_STAGE_CONTRACT.recoveryTarget, preTriggerScores[scoreId]),
    );
    nextProjection = applyAttributedEffect(nextProjection, {
      source: "recovery",
      categoryId: "newborn-bounded-recovery-v1",
      scoreId,
      requestedDelta: target,
      choiceId: null,
      entityId,
      tick,
    });
  }
  return Object.freeze({
    projection: nextProjection,
    recovery: Object.freeze({
      count: recovery.count + 1,
      lastTriggerEntityId: entityId,
      recoveryTarget: recovery.recoveryTarget,
      invulnerableUntilTick:
        tick + NEWBORN_STAGE_CONTRACT.recoveryInvulnerabilityTicks,
      cooldownUntilTick: tick + NEWBORN_STAGE_CONTRACT.recoveryCooldownTicks,
    }),
  });
}

function stepActive(state: NewbornState): NewbornState {
  if (state.phase !== "active" || state.clock.paused) return state;

  const tick = state.clock.activeTicks + 1;
  if (
    state.caregiver.status === "scheduled" &&
    tick >= NEWBORN_STAGE_CONTRACT.caregiverCorridorStartTick
  ) {
    const corridorState = stepCaregiverSafeCorridor(state, tick);
    return tick >= NEWBORN_STAGE_CONTRACT.caregiverPresentationTick
      ? enterCaregiverCorridor(corridorState)
      : corridorState;
  }

  let projection: EffectProjection = Object.freeze({
    scores: state.scores,
    effects: state.effects,
    attribution: state.attribution,
  });
  let recovery = state.recovery;
  let recoveredThisTick = false;
  const entities: NewbornEntity[] = [];
  const resolvedEntityIds = [...state.world.resolvedEntityIds];

  for (const entity of state.world.entities) {
    if (recoveredThisTick) {
      resolvedEntityIds.push(entity.instanceId);
      continue;
    }
    const moved = Object.freeze({
      ...entity,
      xMilli: entity.xMilli - state.world.speedMilliPerTick,
    });
    const contactDistance =
      NEWBORN_STAGE_CONTRACT.playerHalfWidthMilli + moved.widthMilli / 2;
    const contacted =
      moved.lane === state.player.lane &&
      Math.abs(moved.xMilli - NEWBORN_STAGE_CONTRACT.playerXMilli) <=
        contactDistance;
    const passed =
      moved.xMilli < NEWBORN_STAGE_CONTRACT.playerXMilli - contactDistance;

    if (!contacted && !passed) {
      entities.push(moved);
      continue;
    }
    resolvedEntityIds.push(moved.instanceId);
    if (passed) continue;
    if (
      moved.kind === "hazard" &&
      tick < recovery.invulnerableUntilTick
    ) {
      continue;
    }

    const preTriggerScores = projection.scores;
    projection = applyAttributedEffect(projection, {
      source: "runner",
      categoryId:
        moved.kind === "pickup"
          ? "newborn-runner-pickup-v1"
          : "newborn-runner-hazard-v1",
      scoreId: moved.scoreId,
      requestedDelta: moved.scoreDelta,
      choiceId: null,
      entityId: moved.instanceId,
      tick,
    });
    if (
      moved.kind === "hazard" &&
      (projection.scores.health === 0 ||
        projection.scores.happiness === 0 ||
        projection.scores.money === 0)
    ) {
      const result = applyRecovery(
        projection,
        recovery,
        preTriggerScores,
        moved.instanceId,
        tick,
      );
      projection = result.projection;
      recovery = result.recovery;
      recoveredThisTick = true;
    }
  }

  let spawnIndex = state.world.spawnIndex;
  let nextSpawnTick = state.world.nextSpawnTick;
  if (recoveredThisTick) {
    for (const entity of entities) resolvedEntityIds.push(entity.instanceId);
    entities.length = 0;
    nextSpawnTick = Math.max(
      nextSpawnTick,
      recovery.invulnerableUntilTick,
    );
  } else if (tick >= nextSpawnTick) {
    entities.push(spawnEntity(state));
    spawnIndex += 1;
    nextSpawnTick = nextLegalSpawnTick(
      nextSpawnTick + NEWBORN_STAGE_CONTRACT.spawnSpacingTicks,
    );
  }

  const reachedBoundary = tick >= state.clock.durationTicks;
  const nextState: NewbornState = immutable({
    ...state,
    phase: reachedBoundary ? ("settling" as const) : state.phase,
    simulationTick: tick,
    scores: projection.scores,
    effects: projection.effects,
    attribution: projection.attribution,
    recovery,
    player: tickPlayer(state),
    clock: Object.freeze({
      ...state.clock,
      activeTicks: Math.min(tick, state.clock.durationTicks),
    }),
    world: Object.freeze({
      ...state.world,
      distanceMilli:
        state.world.distanceMilli + state.world.speedMilliPerTick,
      entities: Object.freeze(entities),
      spawnIndex,
      nextSpawnTick,
      resolvedEntityIds: Object.freeze(resolvedEntityIds),
    }),
    settlement: reachedBoundary
      ? Object.freeze({
          settlementId: "newborn-settlement-v1" as const,
          status: "pending" as const,
          startedTick: tick,
          completedTick: null,
          factId: null,
          memoryId: null,
        })
      : state.settlement,
  });
  return nextState;
}

function movePlayer(
  state: NewbornState,
  direction: "up" | "down",
): NewbornState {
  if (state.phase !== "active" || state.clock.paused) return state;
  const requested = state.player.lane + (direction === "up" ? -1 : 1);
  const lane = Math.max(0, Math.min(2, requested)) as NewbornLane;
  if (lane === state.player.lane) return state;
  return immutable({
    ...state,
    player: Object.freeze({
      lane,
      visualMotion: "crawl" as const,
      crawlFrame: 1 as const,
      moveTicksRemaining: NEWBORN_STAGE_CONTRACT.moveAnimationTicks,
    }),
  });
}

export function createNewbornState(setup: NewbornSetup): NewbornState {
  assertSetup(setup);
  const difficulty = setup.difficulty ?? "normal";
  const scores = createCoreScores(setup.scores ?? DEFAULT_SCORES);
  const initialLane = setup.initialLane ?? 1;
  return immutable({
    schemaVersion: 1 as const,
    contentVersion: "newborn-runtime-v1" as const,
    stageId: "newborn-v1" as const,
    runId: setup.runId,
    runSeed: setup.runSeed,
    difficulty,
    phase: "active" as const,
    simulationTick: 0,
    scores,
    clock: Object.freeze({
      activeTicks: 0,
      durationTicks: NEWBORN_STAGE_CONTRACT.durationTicks,
      paused: false,
    }),
    world: Object.freeze({
      distanceMilli: 0,
      speedMilliPerTick: NEWBORN_STAGE_CONTRACT.speedMilliPerTick[difficulty],
      entities: Object.freeze([]),
      spawnIndex: 0,
      nextSpawnTick: NEWBORN_STAGE_CONTRACT.firstSpawnTick,
      resolvedEntityIds: Object.freeze([]),
    }),
    player: Object.freeze({
      lane: initialLane,
      visualMotion: "seated" as const,
      crawlFrame: 0 as const,
      moveTicksRemaining: 0,
    }),
    caregiver: Object.freeze({
      status: "scheduled" as const,
      transactionId: "newborn-caregiver-transaction-v1" as const,
      optionIds: Object.freeze(
        NEWBORN_CAREGIVER_OPTIONS.map((option) => option.optionId),
      ),
      selectedOptionId: null,
      presentedTick: null,
      resolvedTick: null,
    }),
    effects: Object.freeze([]),
    attribution: createEmptyAttribution(),
    recovery: Object.freeze({
      count: 0,
      lastTriggerEntityId: null,
      recoveryTarget: NEWBORN_STAGE_CONTRACT.recoveryTarget,
      invulnerableUntilTick: 0,
      cooldownUntilTick: 0,
    }),
    story: Object.freeze({
      facts: Object.freeze([]),
      memories: Object.freeze([]),
    }),
    settlement: null,
  });
}

export function advanceNewborn(
  state: NewbornState,
  ticks = 1,
): NewbornState {
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new RangeError("Newborn advance ticks must be a non-negative integer");
  }
  let next = state;
  for (let step = 0; step < ticks; step += 1) {
    const advanced = stepActive(next);
    if (advanced === next) break;
    next = advanced;
    if (next.phase !== "active") break;
  }
  return next;
}

export function chooseCaregiverOption(
  state: NewbornState,
  optionId: NewbornCaregiverOptionId,
): NewbornState {
  if (state.caregiver.status === "resolved") {
    if (state.caregiver.selectedOptionId === optionId) return state;
    throw new Error("The newborn caregiver transaction is already resolved");
  }
  if (
    state.phase !== "caregiver-choice" ||
    state.caregiver.status !== "presenting"
  ) {
    throw new Error("The newborn caregiver choice is not presenting");
  }

  const option = optionById(optionId);
  let projection: EffectProjection = Object.freeze({
    scores: state.scores,
    effects: state.effects,
    attribution: state.attribution,
  });
  for (const effect of option.effects) {
    projection = applyAttributedEffect(projection, {
      source: "choice",
      categoryId: "newborn-caregiver-choice-v1",
      scoreId: effect.scoreId,
      requestedDelta: effect.requestedDelta,
      choiceId: option.optionId,
      entityId: null,
      tick: state.clock.activeTicks,
    });
  }
  return immutable({
    ...state,
    phase: "active" as const,
    scores: projection.scores,
    effects: projection.effects,
    attribution: projection.attribution,
    world: Object.freeze({
      ...state.world,
      nextSpawnTick: Math.max(
        state.world.nextSpawnTick,
        NEWBORN_STAGE_CONTRACT.caregiverCorridorEndTick,
      ),
    }),
    caregiver: Object.freeze({
      ...state.caregiver,
      status: "resolved" as const,
      selectedOptionId: option.optionId,
      resolvedTick: state.clock.activeTicks,
    }),
  });
}

export function canSettleNewborn(state: NewbornState): boolean {
  return (
    state.phase === "settling" &&
    state.clock.activeTicks === state.clock.durationTicks &&
    state.caregiver.status === "resolved" &&
    state.caregiver.selectedOptionId !== null &&
    state.settlement?.status === "pending"
  );
}

export function settleNewborn(state: NewbornState): NewbornState {
  if (state.phase === "complete" && state.settlement?.status === "applied") {
    return state;
  }
  if (!canSettleNewborn(state)) {
    throw new Error("The newborn stage is not ready to settle");
  }
  const selectedOptionId = state.caregiver.selectedOptionId;
  if (selectedOptionId === null) {
    throw new Error("Newborn settlement requires a caregiver choice");
  }
  const option = optionById(selectedOptionId);
  return immutable({
    ...state,
    phase: "complete" as const,
    story: Object.freeze({
      facts: Object.freeze([
        Object.freeze({
          factId: "fact-newborn-caregiver-choice-v1" as const,
          kind: "care" as const,
          valueId: option.factValueId,
          originChoiceId: selectedOptionId,
        }),
      ]),
      memories: Object.freeze([
        Object.freeze({
          memoryId: "memory-newborn-caregiver-crossroads-v1" as const,
          kind: "relationship" as const,
          stageId: "newborn-v1" as const,
          summary: option.memorySummary,
          originChoiceId: selectedOptionId,
        }),
      ]),
    }),
    world: Object.freeze({ ...state.world, entities: Object.freeze([]) }),
    player: Object.freeze({
      ...state.player,
      visualMotion: "seated" as const,
      crawlFrame: 0 as const,
      moveTicksRemaining: 0,
    }),
    settlement: Object.freeze({
      settlementId: "newborn-settlement-v1" as const,
      status: "applied" as const,
      startedTick: state.settlement?.startedTick ?? state.clock.activeTicks,
      completedTick: state.clock.activeTicks,
      factId: "fact-newborn-caregiver-choice-v1" as const,
      memoryId: "memory-newborn-caregiver-crossroads-v1" as const,
    }),
  });
}

export function reduceNewborn(
  state: NewbornState,
  action: NewbornAction,
): NewbornState {
  switch (action.type) {
    case "move":
      return movePlayer(state, action.direction);
    case "set-paused":
      if (state.phase !== "active" || state.clock.paused === action.paused) {
        return state;
      }
      return immutable({
        ...state,
        clock: Object.freeze({ ...state.clock, paused: action.paused }),
      });
    case "advance":
      return advanceNewborn(state, action.ticks ?? 1);
    case "choose-caregiver":
      return chooseCaregiverOption(state, action.optionId);
    case "settle":
      return settleNewborn(state);
  }
}
