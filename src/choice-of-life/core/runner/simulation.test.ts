import { beforeAll, describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import {
  decodeRunState,
  encodeRunState,
} from "../run-state-codec";
import type {
  ControlMode,
  CoreScores,
  Lane,
  RunnerEntity,
  RunnerMotion,
  RunStateV1,
} from "../run-state";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "./contract";
import type {
  RunnerLabGeneratedCourse,
  RunnerLabGeneratedPattern,
} from "./course-generator";
import { clearRunnerReachabilityCache } from "./reachability-validator";
import { runnerPatternSafeBoundaryTick } from "./collision-system";
import {
  advanceRunnerLaboratory,
  chooseLane,
  createRunnerSimulationContext,
  startRunnerLaboratory,
  type RunnerSimulationContext,
  type RunnerSimulationStepInput,
} from "./simulation";

const RUN_SEED = "0000000000000001";
const SETUP = Object.freeze({
  startingProfileId: "steady-mix-v1" as const,
  difficulty: "story" as const,
  controlMode: "manual" as const,
  identity: { gender: "female" as const },
  appearance: {
    heritageStyleId: "asian" as const,
    hairStyleId: "tied-back" as const,
    hairColorId: "dark-brown" as const,
    clothingPaletteId: "meadow" as const,
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    textScale: 100 as const,
    screenReaderAnnouncements: true,
  },
});

let context: RunnerSimulationContext;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) =>
    isDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen));
}

function setupFor(controlMode: ControlMode) {
  return deepFreeze({ ...SETUP, controlMode });
}

function entry(controlMode: ControlMode): RunStateV1 {
  return createRunnerLaboratoryEntryState(
    RUN_SEED,
    setupFor(controlMode),
  );
}

function idleMotion(lane: Lane): RunnerMotion {
  return Object.freeze({
    kind: "idle" as const,
    currentLane: lane,
    sourceLane: lane,
    targetLane: lane,
    elapsedTicks: 0 as const,
    totalTicks: 11 as const,
  });
}

function generatedEntity(
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
  course: RunnerLabGeneratedCourse,
  simulationTick: number,
): RunnerEntity {
  const pattern = course.patterns[entity.patternIndex - 1]!;
  return Object.freeze({
    instanceId: entity.instanceId,
    contentId: entity.contentId,
    kind: entity.kind,
    patternIndex: entity.patternIndex,
    slotIndex: entity.slotIndex,
    lane: entity.lane,
    xMilli: entity.xMilli -
      course.worldSpeedMilliPerTick *
        (simulationTick - pattern.spawnTick),
    widthMilli: entity.widthMilli,
    contactState: "pending" as const,
  });
}

function resolvedPrefix(
  course: RunnerLabGeneratedCourse,
  patternCount: number,
): readonly string[] {
  return Object.freeze([
    course.startMarker.instanceId,
    ...course.patterns.slice(0, patternCount).flatMap((pattern) =>
      pattern.spawnEntities.map((entity) => entity.instanceId)),
  ].sort((left, right) => left.localeCompare(right)));
}

function activeState(
  controlMode: ControlMode,
  patternIndex: number,
  simulationTick: number,
  activeEntities: readonly RunnerEntity[],
  motion: RunnerMotion = idleMotion(1),
  inputBuffer: "up" | "down" | null = null,
  resolvedEntityIds: readonly string[] = resolvedPrefix(
    context.course,
    patternIndex - 1,
  ),
): RunStateV1 {
  const base = entry(controlMode);
  const pattern = context.course.patterns[patternIndex - 1]!;
  return deepFreeze({
    ...base,
    simulationTick,
    stage: {
      ...base.stage,
      activeTicks: simulationTick,
      worldDistanceMilli:
        simulationTick * context.course.worldSpeedMilliPerTick,
    },
    runner: {
      ...base.runner!,
      motion,
      inputBuffer,
      spawn: {
        ...pattern.outgoingCursor,
        resolvedThroughPatternIndex: patternIndex - 1,
        resolvedEntityIds,
      },
      activeEntities,
      userPaused: false,
    },
  });
}

function preSpawnState(
  controlMode: ControlMode,
  requestedPatternIndex: number,
): RunStateV1 {
  const base = entry(controlMode);
  const pattern = context.course.patterns[requestedPatternIndex - 1]!;
  const simulationTick = pattern.spawnTick - 1;
  return deepFreeze({
    ...base,
    simulationTick,
    stage: {
      ...base.stage,
      activeTicks: simulationTick,
      worldDistanceMilli:
        simulationTick * context.course.worldSpeedMilliPerTick,
    },
    runner: {
      ...base.runner!,
      motion: idleMotion(1),
      inputBuffer: null,
      spawn: {
        ...pattern.incomingCursor,
        resolvedThroughPatternIndex: requestedPatternIndex - 1,
        resolvedEntityIds: resolvedPrefix(
          context.course,
          requestedPatternIndex - 1,
        ),
      },
      activeEntities: [],
      userPaused: false,
    },
  });
}

function spawnCheckpoint(
  controlMode: ControlMode,
  sourceLane: Lane,
  patternIndex = 1,
): RunStateV1 {
  const pattern = context.course.patterns[patternIndex - 1]!;
  return activeState(
    controlMode,
    patternIndex,
    pattern.spawnTick,
    pattern.spawnEntities.map((entity) =>
      generatedEntity(entity, context.course, pattern.spawnTick)),
    idleMotion(sourceLane),
  );
}

function terminalActiveState(controlMode: ControlMode): RunStateV1 {
  const base = entry(controlMode);
  const simulationTick = 2999;
  return deepFreeze({
    ...base,
    simulationTick,
    stage: {
      ...base.stage,
      activeTicks: simulationTick,
      worldDistanceMilli:
        simulationTick * context.course.worldSpeedMilliPerTick,
    },
    runner: {
      ...base.runner!,
      motion: idleMotion(1),
      inputBuffer: null,
      spawn: {
        ...context.course.terminalCursor,
        resolvedThroughPatternIndex: 10,
        resolvedEntityIds: resolvedPrefix(context.course, 10),
      },
      activeEntities: [],
      userPaused: false,
    },
  });
}

function trustedTarget(
  targetLane: Lane,
): NonNullable<RunnerSimulationStepInput["automaticTarget"]> {
  return Object.freeze({ targetLane }) as NonNullable<
    RunnerSimulationStepInput["automaticTarget"]
  >;
}

function trustedScores(
  scores: CoreScores,
): NonNullable<RunnerSimulationStepInput["automaticScores"]> {
  return deepFreeze({ scores }) as NonNullable<
    RunnerSimulationStepInput["automaticScores"]
  >;
}

beforeAll(() => {
  clearRunnerReachabilityCache();
  context = createRunnerSimulationContext(RUN_SEED, "story");
});

describe("runner laboratory simulation", () => {
  it("builds one authentic immutable course context with explicit rolling certificates", () => {
    expect(isDeepFrozen(context)).toBe(true);
    expect(context.reachabilityCertificates).toHaveLength(10);
    expect(context.reachabilityCertificates[0]).toMatchObject({
      requestedAppendPatternIndex: 1,
      certifiedPatternIndexes: [1, 2, 3],
      certifiedStartTick: context.course.patterns[0]!.spawnTick,
      incomingStateCount: 107,
      firstStepInputCaseCount: 321,
    });
    expect(context.reachabilityCertificates[8]).toMatchObject({
      requestedAppendPatternIndex: 9,
      certifiedPatternIndexes: [8, 9, 10],
      certifiedStartTick: context.course.patterns[7]!.spawnTick,
    });
    expect(context.reachabilityCertificates[9]).toMatchObject({
      requestedAppendPatternIndex: 10,
      certifiedPatternIndexes: [8, 9, 10],
      certifiedStartTick: context.course.patterns[7]!.spawnTick,
    });

    const forged = Object.freeze({ ...context }) as RunnerSimulationContext;
    expect(() => startRunnerLaboratory(forged, entry("manual")))
      .toThrow(/context is not authentic/);
  });

  it("acknowledges Start at tick zero exactly once and never resumes through a second Start", () => {
    const initial = entry("manual");
    const started = startRunnerLaboratory(context, initial);

    expect(started).toMatchObject({
      previousTick: 0,
      currentTick: 0,
      tickDelta: 0,
      advanced: false,
      stateChanged: true,
      shouldPersist: true,
      checkpoint: "start",
      noOpReason: null,
    });
    expect(started.state.runner?.userPaused).toBe(false);
    expect(started.state.runner?.spawn.resolvedEntityIds).toEqual([
      context.course.startMarker.instanceId,
    ]);
    expect(isDeepFrozen(started)).toBe(true);

    const again = startRunnerLaboratory(context, started.state);
    expect(again.state).toBe(started.state);
    expect(again.noOpReason).toBe("start-already-acknowledged");
    expect(again.tickDelta).toBe(0);
    expect(again.stateChanged).toBe(false);
    expect(again.shouldPersist).toBe(false);
  });

  it("orders lane, clock, reachability, and append while leaving spawn-tick entities unadvanced", () => {
    const before = preSpawnState("manual", 1);
    const pattern = context.course.patterns[0]!;
    const result = advanceRunnerLaboratory(context, before, {
      laneIntent: "up",
    });

    expect(result.events.map((event) => event.type)).toEqual([
      "lane-stepped",
      "clock-advanced",
      "reachability-certified",
      "pattern-appended",
    ]);
    expect(result).toMatchObject({
      previousTick: pattern.spawnTick - 1,
      currentTick: pattern.spawnTick,
      tickDelta: 1,
      stateChanged: true,
      shouldPersist: true,
      checkpoint: "pattern",
    });
    expect(result.state.runner?.motion).toMatchObject({
      kind: "moving",
      sourceLane: 1,
      targetLane: 0,
      elapsedTicks: 1,
    });
    expect(result.state.runner?.spawn.patternIndex).toBe(1);
    expect(result.state.runner?.activeEntities.map((entity) => entity.xMilli))
      .toEqual(pattern.spawnEntities.map((entity) => entity.xMilli));
    expect(result.reachabilityCertificate?.certifiedPatternIndexes)
      .toEqual([1, 2, 3]);

    const next = advanceRunnerLaboratory(context, result.state);
    expect(next.state.runner?.activeEntities.map((entity) => entity.xMilli))
      .toEqual(pattern.spawnEntities.map((entity) =>
        entity.xMilli - context.course.worldSpeedMilliPerTick));
  });

  it("uses post-movement lane and post-increment tick for canonical contact resolution", () => {
    const pattern = context.course.patterns[0]!;
    expect(pattern.category).toBe("benefit-fork");
    const targetEntity = pattern.entities.find((entity) => entity.lane === 1)!;
    const simulationTick = pattern.anchorTick - 1;
    const moving: RunnerMotion = Object.freeze({
      kind: "moving" as const,
      currentLane: 0 as const,
      sourceLane: 0 as const,
      targetLane: 1 as const,
      elapsedTicks: 10,
      totalTicks: 11 as const,
    });
    const before = activeState(
      "manual",
      1,
      simulationTick,
      pattern.spawnEntities.map((entity) =>
        generatedEntity(entity, context.course, simulationTick)),
      moving,
    );
    const result = advanceRunnerLaboratory(context, before);
    const contact = result.events.find((event) =>
      event.type === "contact-resolved");
    const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID
      .get(targetEntity.contentId)!;

    expect(result.state.runner?.motion).toMatchObject({
      kind: "idle",
      currentLane: 1,
    });
    expect(contact).toMatchObject({
      type: "contact-resolved",
      contact: {
        entityInstanceId: targetEntity.instanceId,
        simulationTick: pattern.anchorTick,
        outcome: "benefit-applied",
      },
    });
    expect(result.state.scores[definition.scoreId]).toBe(
      before.scores[definition.scoreId] + 1,
    );
    expect(result.events.map((event) => event.type).slice(0, 3)).toEqual([
      "lane-stepped",
      "clock-advanced",
      "contact-resolved",
    ]);
  });

  it("advances resolvedThrough only after every slot and marker are terminal", () => {
    const pattern = context.course.patterns[0]!;
    const safeTick = runnerPatternSafeBoundaryTick(
      pattern,
      context.course.worldSpeedMilliPerTick,
    );
    let state = spawnCheckpoint("manual", 1);
    while (state.simulationTick < safeTick - 1) {
      state = advanceRunnerLaboratory(context, state).state;
    }
    expect(state.runner?.spawn.resolvedThroughPatternIndex).toBe(0);

    const terminal = advanceRunnerLaboratory(context, state);
    expect(terminal.currentTick).toBe(safeTick);
    expect(terminal.state.runner?.spawn.resolvedThroughPatternIndex).toBe(1);
    expect(terminal.events).toContainEqual(expect.objectContaining({
      type: "resolved-through-advanced",
      resolvedThroughPatternIndex: 1,
    }));
  });

  it("rejects reload shapes that expose pre-spawn patterns or post-safe active entities", () => {
    const pattern = context.course.patterns[0]!;
    const earlyTick = pattern.spawnTick - 1;
    const early = activeState(
      "manual",
      1,
      earlyTick,
      pattern.spawnEntities.map((entity) =>
        generatedEntity(entity, context.course, earlyTick)),
    );
    expect(() => advanceRunnerLaboratory(context, early))
      .toThrow(/pattern before its spawn boundary/);

    const safeTick = runnerPatternSafeBoundaryTick(
      pattern,
      context.course.worldSpeedMilliPerTick,
    );
    const late = activeState(
      "manual",
      1,
      safeTick,
      pattern.spawnEntities.map((entity) =>
        generatedEntity(entity, context.course, safeTick)),
    );
    expect(() => advanceRunnerLaboratory(context, late))
      .toThrow(/survived its exact terminal boundary/);
  });

  it("compiles every Semantic source/target pair into exact 0/1/2-lane persisted motion", () => {
    const pattern = context.course.patterns[0]!;
    for (const sourceLane of [0, 1, 2] as const) {
      for (const targetLane of [0, 1, 2] as const) {
        const before = spawnCheckpoint("semantic-assist", sourceLane);
        const result = chooseLane(context, before, targetLane, []);
        const distance = Math.abs(targetLane - sourceLane);

        expect(result.tickDelta).toBe(1);
        expect(result.currentTick).toBe(pattern.spawnTick + 1);
        expect(result.events[0]).toMatchObject({
          type: "decision-marker-resolved",
          targetLane,
        });
        expect(result.state.runner?.spawn.resolvedEntityIds)
          .toContain(pattern.decisionMarker.instanceId);
        expect(result.state.runner?.activeEntities.some((entity) =>
          entity.instanceId === pattern.decisionMarker.instanceId)).toBe(false);
        if (distance === 0) {
          expect(result.state.runner).toMatchObject({
            motion: { kind: "idle", currentLane: sourceLane },
            inputBuffer: null,
          });
        } else {
          const direction = targetLane < sourceLane ? "up" : "down";
          expect(result.state.runner?.motion).toMatchObject({
            kind: "moving",
            currentLane: sourceLane,
            sourceLane,
            targetLane: sourceLane + (direction === "up" ? -1 : 1),
            elapsedTicks: 1,
          });
          expect(result.state.runner?.inputBuffer).toBe(
            distance === 2 ? direction : null,
          );
        }
        expect(isDeepFrozen(result)).toBe(true);
      }
    }
  });

  it("keeps every independent Semantic pause guard atomic and marker-pending", () => {
    const before = spawnCheckpoint("semantic-assist", 1);
    const markerId = context.course.patterns[0]!.decisionMarker.instanceId;
    for (const reason of ["visibility", "focus", "user", "modal"] as const) {
      const result = chooseLane(context, before, 0, [reason]);
      expect(result.state).toBe(before);
      expect(result.noOpReason).toBe("independent-pause");
      expect(result.state.runner?.activeEntities.map((entity) => entity.instanceId))
        .toContain(markerId);
    }

    const userPaused = deepFreeze({
      ...before,
      runner: { ...before.runner!, userPaused: true },
    });
    expect(chooseLane(context, userPaused, 0).state).toBe(userPaused);
    expect(chooseLane(context, userPaused, 0).noOpReason)
      .toBe("independent-pause");
  });

  it("requires an idle/null-buffer Semantic checkpoint and stops Manual ticks for every pause", () => {
    const pattern = context.course.patterns[0]!;
    const activeEntities = pattern.spawnEntities.map((entity) =>
      generatedEntity(entity, context.course, pattern.spawnTick));
    const moving = activeState(
      "semantic-assist",
      1,
      pattern.spawnTick,
      activeEntities,
      Object.freeze({
        kind: "moving" as const,
        currentLane: 0 as const,
        sourceLane: 0 as const,
        targetLane: 1 as const,
        elapsedTicks: 5,
        totalTicks: 11 as const,
      }),
    );
    const buffered = activeState(
      "semantic-assist",
      1,
      pattern.spawnTick,
      activeEntities,
      idleMotion(1),
      "down",
    );
    expect(chooseLane(context, moving, 2)).toMatchObject({
      state: moving,
      noOpReason: "semantic-choice-not-ready",
    });
    expect(chooseLane(context, buffered, 2)).toMatchObject({
      state: buffered,
      noOpReason: "semantic-choice-not-ready",
    });

    const manual = startRunnerLaboratory(context, entry("manual")).state;
    expect(advanceRunnerLaboratory(context, manual, {
      laneIntent: "up",
      independentPauseReasons: ["visibility"],
    })).toMatchObject({ state: manual, noOpReason: "independent-pause" });
    const userPaused = deepFreeze({
      ...manual,
      runner: { ...manual.runner!, userPaused: true },
    });
    expect(advanceRunnerLaboratory(context, userPaused, {
      laneIntent: "up",
    })).toMatchObject({ state: userPaused, noOpReason: "user-paused" });
  });

  it("rejects raw Semantic lane input and blocks an ordinary tick at a pending prompt", () => {
    const before = spawnCheckpoint("semantic-assist", 1);
    const raw = advanceRunnerLaboratory(context, before, {
      laneIntent: "up",
    });
    expect(raw.state).toBe(before);
    expect(raw.noOpReason).toBe("raw-input-disabled");

    const waiting = advanceRunnerLaboratory(context, before);
    expect(waiting.state).toBe(before);
    expect(waiting.noOpReason).toBe("semantic-decision-pending");

    const decoded = decodeRunState(
      encodeRunState(before),
      RUNNER_LABORATORY_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind === "ready") {
      expect(chooseLane(context, decoded.state, 0).state)
        .toEqual(chooseLane(context, before, 0).state);
    }
  });

  it("reconstructs p9/p10 certificates from the authentic p8-p10 suffix after cache reset", () => {
    for (const patternIndex of [9, 10] as const) {
      const before = preSpawnState("manual", patternIndex);
      const first = advanceRunnerLaboratory(context, before);
      expect(first.reachabilityCertificate).toMatchObject({
        requestedAppendPatternIndex: patternIndex,
        certifiedPatternIndexes: [8, 9, 10],
        certifiedStartTick: context.course.patterns[7]!.spawnTick,
      });

      clearRunnerReachabilityCache();
      const reloadedContext = createRunnerSimulationContext(RUN_SEED, "story");
      const afterReload = advanceRunnerLaboratory(reloadedContext, before);
      expect(afterReload.reachabilityCertificate)
        .toEqual(first.reachabilityCertificate);
      expect(afterReload.state).toEqual(first.state);
    }
  });

  it("continues an encoded/decoded two-lane Semantic commit using only persisted motion and buffer", () => {
    const committed = chooseLane(
      context,
      spawnCheckpoint("semantic-assist", 0),
      2,
    );
    const decoded = decodeRunState(
      encodeRunState(committed.state),
      RUNNER_LABORATORY_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    expect(isDeepFrozen(decoded.state)).toBe(true);
    expect(decoded.state.runner).toMatchObject({
      motion: {
        kind: "moving",
        sourceLane: 0,
        targetLane: 1,
        elapsedTicks: 1,
      },
      inputBuffer: "down",
    });

    const reloadedContext = createRunnerSimulationContext(RUN_SEED, "story");
    const continued = advanceRunnerLaboratory(reloadedContext, decoded.state);
    expect(continued.state.runner).toMatchObject({
      motion: {
        kind: "moving",
        sourceLane: 0,
        targetLane: 1,
        elapsedTicks: 2,
      },
      inputBuffer: "down",
    });
  });

  it("commits only a privately branded Automatic target at a pending marker", () => {
    const before = spawnCheckpoint("automatic-assist", 0);
    expect(advanceRunnerLaboratory(context, before).noOpReason)
      .toBe("automatic-oracle-required");
    expect(advanceRunnerLaboratory(context, before, { laneIntent: "down" })
      .noOpReason).toBe("raw-input-disabled");

    const committed = advanceRunnerLaboratory(context, before, {
      automaticTarget: trustedTarget(2),
    });
    expect(committed.tickDelta).toBe(1);
    expect(committed.events[0]).toMatchObject({
      type: "decision-marker-resolved",
      controlMode: "automatic-assist",
      targetLane: 2,
    });
    expect(committed.state.runner).toMatchObject({
      motion: {
        kind: "moving",
        sourceLane: 0,
        targetLane: 1,
        elapsedTicks: 1,
      },
      inputBuffer: "down",
    });

    const ordinary = preSpawnState("automatic-assist", 1);
    const ignoredScores = advanceRunnerLaboratory(context, ordinary, {
      automaticScores: trustedScores({ health: 66, happiness: 60, money: 35 }),
    });
    expect(ignoredScores.state).toBe(ordinary);
    expect(ignoredScores.noOpReason).toBe("unexpected-automatic-oracle");
  });

  it("leaves Automatic contact scores, ledger, and invulnerability collision-owned and nonauthoritative", () => {
    const pattern = context.course.patterns[0]!;
    const targetEntity = pattern.entities.find((entity) => entity.lane === 1)!;
    const simulationTick = pattern.anchorTick - 1;
    const before = activeState(
      "automatic-assist",
      1,
      simulationTick,
      pattern.spawnEntities.map((entity) =>
        generatedEntity(entity, context.course, simulationTick)),
      idleMotion(1),
    );
    const result = advanceRunnerLaboratory(context, before, {
      automaticTarget: trustedTarget(1),
    });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "contact-resolved",
      contact: expect.objectContaining({
        entityInstanceId: targetEntity.instanceId,
        outcome: "automatic-pass",
      }),
    }));
    expect(result.state.scores).toEqual(before.scores);
    expect(result.state.effectLedger).toEqual(before.effectLedger);
    expect(result.state.runner?.invulnerableUntilTick).toBe(0);
  });

  it("creates the separate tick-3000 pending settlement with finish only and never appends p11", () => {
    const before = terminalActiveState("manual");
    const result = advanceRunnerLaboratory(context, before);

    expect(result).toMatchObject({
      previousTick: 2999,
      currentTick: 3000,
      tickDelta: 1,
      checkpoint: "settlement",
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "lane-stepped",
      "clock-advanced",
      "finish-sentinel-resolved",
      "settlement-pending",
    ]);
    expect(result.events.some((event) => event.type === "pattern-appended"))
      .toBe(false);
    expect(result.state).toMatchObject({
      runStatus: "active",
      simulationTick: 3000,
      stage: {
        phase: "settling",
        activeTicks: 3000,
        settlement: { status: "pending", startedTick: 3000 },
      },
      runner: {
        spawn: {
          patternIndex: 11,
          resolvedThroughPatternIndex: 11,
          nextSpawnTick: 3001,
        },
        activeEntities: [],
      },
    });
    expect(result.state.runner?.spawn.resolvedEntityIds)
      .toContain(context.course.finishMarker.instanceId);
    expect(isDeepFrozen(result)).toBe(true);
    const decoded = decodeRunState(
      encodeRunState(result.state),
      RUNNER_LABORATORY_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind === "ready") {
      expect(isDeepFrozen(decoded.state)).toBe(true);
      expect(decoded.state).toEqual(result.state);
    }
    expect(advanceRunnerLaboratory(context, result.state).noOpReason)
      .toBe("not-active");
  });

  it("requires the private Automatic score seam only on the terminal step", () => {
    const before = terminalActiveState("automatic-assist");
    const missing = advanceRunnerLaboratory(context, before);
    expect(missing.state).toBe(before);
    expect(missing.noOpReason).toBe("automatic-scores-required");

    const result = advanceRunnerLaboratory(context, before, {
      automaticScores: trustedScores({
        health: 66,
        happiness: 60,
        money: 35,
      }),
    });
    expect(result.checkpoint).toBe("settlement");
    expect(result.state.stage.settlement?.effectIds).toEqual([
      "effect-runner-laboratory-health-v1",
    ]);
    expect(result.state.scores).toEqual(before.scores);
    expect(result.state.effectLedger.recent).toEqual([]);
  });
});
