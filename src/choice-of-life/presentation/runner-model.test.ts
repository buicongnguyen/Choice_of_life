import { describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../core/catalog";
import {
  decodeRunState,
  encodeRunState,
} from "../core/run-state-codec";
import { createRunnerLaboratoryEntryState } from "../core/runner/contract";
import {
  createRunnerSimulationContext,
  startRunnerLaboratory,
  advanceRunnerLaboratory,
  chooseLane,
} from "../core/runner/simulation";
import type { Difficulty, RunStateV1 } from "../core/run-state";
import { createRunnerPresentationModel } from "./runner-model";

const SETUP = Object.freeze({
  startingProfileId: "steady-mix-v1" as const,
  difficulty: "normal" as const,
  controlMode: "semantic-assist" as const,
  identity: Object.freeze({ gender: "female" as const }),
  appearance: Object.freeze({
    heritageStyleId: "asian" as const,
    hairStyleId: "short-soft" as const,
    hairColorId: "black" as const,
    clothingPaletteId: "sunrise" as const,
  }),
  accessibility: Object.freeze({
    highContrast: false,
    reducedMotion: false,
    textScale: 100 as const,
    screenReaderAnnouncements: true,
  }),
});

function firstCheckpoint(
  runSeed: string,
  difficulty: Difficulty = "normal",
): { state: RunStateV1; context: ReturnType<typeof createRunnerSimulationContext> } {
  const setup = { ...SETUP, difficulty };
  const context = createRunnerSimulationContext(runSeed, difficulty);
  let state = startRunnerLaboratory(
    context,
    createRunnerLaboratoryEntryState(runSeed, setup),
  ).state;
  while (state.runner?.spawn.patternIndex === 0) {
    const result = advanceRunnerLaboratory(context, state);
    if (!result.stateChanged) throw new Error("checkpoint did not advance");
    state = result.state;
  }
  return { state, context };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) =>
    isDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen));
}

function semanticCheckpointForPattern(
  runSeed: string,
  difficulty: Difficulty,
  patternId: string,
): ReturnType<typeof firstCheckpoint> {
  const checkpoint = firstCheckpoint(runSeed, difficulty);
  let { state } = checkpoint;
  const { context } = checkpoint;
  while (true) {
    const pattern = context.course.patterns[state.runner!.spawn.patternIndex - 1]!;
    if (pattern.patternId === patternId) return { state, context };
    const patternIndex = pattern.patternIndex;
    state = chooseLane(
      context,
      state,
      state.runner!.motion.currentLane,
    ).state;
    while (state.runner!.spawn.patternIndex === patternIndex) {
      const result = advanceRunnerLaboratory(context, state);
      if (!result.advanced) {
        throw new Error(`failed to reach the next Semantic checkpoint: ${result.noOpReason}`);
      }
      state = result.state;
    }
  }
}

describe("runner presentation projection", () => {
  it("shares one exact immutable warning object across playfield and Semantic choices", () => {
    const { state, context } = firstCheckpoint("0000000000000001");
    const model = createRunnerPresentationModel(state, context.course);
    const warning = model?.warning;
    const prompt = model?.semanticDecision;
    expect(model).not.toBeNull();
    expect(prompt).not.toBeNull();
    expect(prompt?.warning).toBe(warning);
    expect(prompt?.choices).toBe(warning?.lanes);
    expect(prompt?.choices.map((choice) => choice.lane)).toEqual([0, 1, 2]);
    expect(prompt?.choices.every((choice) =>
      choice.accessibleLabel.includes("Benefit:") &&
      choice.accessibleLabel.includes("Hazard:") &&
      choice.accessibleLabel.includes("Urgency:"))).toBe(true);
    expect(isDeepFrozen(model)).toBe(true);
  });

  it("projects exact score deltas and numerical urgency from generated entities", () => {
    const { state, context } = firstCheckpoint("0000000000000001", "challenge");
    const pattern = context.course.patterns[0]!;
    const projection = createRunnerPresentationModel(state, context.course)!.warning;
    const projectedItems = projection.lanes.flatMap((lane) => [
      ...lane.benefits,
      ...lane.hazards,
    ]);
    expect(projectedItems.map((item) => item.entityInstanceId).sort()).toEqual(
      pattern.entities.map((entity) => entity.instanceId).sort(),
    );
    for (const item of projectedItems) {
      const generated = pattern.entities.find((entity) =>
        entity.instanceId === item.entityInstanceId)!;
      expect(item.contactTick).toBe(generated.contactTick);
      expect(item.ticksUntilContact).toBe(generated.contactTick - state.simulationTick);
      expect(item.millisecondsUntilContact).toBe(item.ticksUntilContact * 20);
      expect(item.requestedDelta).toBe(item.kind === "benefit" ? 1 : -1);
    }
  });

  it("describes quiet windows without inventing hidden future information", () => {
    const { state, context } = firstCheckpoint("0000000000000000", "story");
    expect(context.course.patterns[0]?.patternId).toBe("runner-lab-quiet-window-v1");
    const model = createRunnerPresentationModel(state, context.course)!;
    const projection = model.warning;
    expect(projection.lanes.every((lane) =>
      lane.benefits.length === 0 &&
      lane.hazards.length === 0 &&
      lane.benefitText === "No benefit" &&
      lane.hazardText === "No hazard")).toBe(true);
    expect(projection.lanes.every((lane) =>
      lane.urgencyTicks === projection.anchorTick - state.simulationTick)).toBe(true);
    expect(model.semanticDecision?.warning).toBe(projection);
  });

  it("removes resolved items and recomputes urgency from authentic active entities", () => {
    const { state: checkpoint, context } = semanticCheckpointForPattern(
      "0000000000000001",
      "challenge",
      "runner-lab-risk-reward-v1",
    );
    const pattern = context.course.patterns[checkpoint.runner!.spawn.patternIndex - 1]!;
    const immediate = pattern.entities.find((entity) =>
      entity.lane === pattern.rotation && entity.contactOffsetTicks === 0)!;
    const delayed = pattern.entities.find((entity) =>
      entity.lane === pattern.rotation && entity.contactOffsetTicks === 18)!;
    let state = chooseLane(context, checkpoint, pattern.rotation).state;
    while (state.simulationTick < pattern.anchorTick) {
      const result = advanceRunnerLaboratory(context, state);
      if (!result.advanced) throw new Error(`risk-reward trace stalled: ${result.noOpReason}`);
      state = result.state;
    }

    expect(state.runner!.spawn.resolvedEntityIds).toContain(immediate.instanceId);
    expect(state.runner!.activeEntities.map((entity) => entity.instanceId))
      .toContain(delayed.instanceId);
    const model = createRunnerPresentationModel(state, context.course)!;
    const originLane = model.warning.lanes[pattern.rotation];
    expect(originLane.benefits.map((item) => item.entityInstanceId))
      .not.toContain(immediate.instanceId);
    expect(originLane.hazards.map((item) => item.entityInstanceId))
      .toEqual([delayed.instanceId]);
    expect(originLane.urgencyTicks).toBe(18);
    expect(model.semanticDecision).toBeNull();
  });

  it("recreates an identical shared projection after a valid save round trip", () => {
    const { state, context } = firstCheckpoint("0000000000000001", "normal");
    const before = createRunnerPresentationModel(state, context.course)!;
    const decoded = decodeRunState(
      encodeRunState(state),
      RUNNER_LABORATORY_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    const reloadedContext = createRunnerSimulationContext(
      decoded.state.runSeed,
      decoded.state.difficulty,
    );
    const after = createRunnerPresentationModel(
      decoded.state,
      reloadedContext.course,
    )!;
    expect(after).toEqual(before);
    expect(after.semanticDecision?.warning).toBe(after.warning);
    expect(after.semanticDecision?.choices).toBe(after.warning.lanes);
    expect(isDeepFrozen(decoded.state)).toBe(true);
    expect(isDeepFrozen(after)).toBe(true);
  });

  it("rejects forged markers, spawn cursors, and active geometry", () => {
    const { state, context } = firstCheckpoint("0000000000000001", "challenge");
    const forgedMarker = deepFreeze({
      ...state,
      runner: {
        ...state.runner!,
        activeEntities: state.runner!.activeEntities.map((entity) =>
          entity.kind === "opportunity"
            ? { ...entity, instanceId: "entity-ffffffffffffffff" }
            : entity),
      },
    });
    expect(() => createRunnerPresentationModel(forgedMarker, context.course))
      .toThrow(/authentic course|unresolved spawned course entity/i);

    const forgedCursor = deepFreeze({
      ...state,
      runner: {
        ...state.runner!,
        spawn: {
          ...state.runner!.spawn,
          nextSpawnTick: state.runner!.spawn.nextSpawnTick + 1,
        },
      },
    });
    expect(() => createRunnerPresentationModel(forgedCursor, context.course))
      .toThrow(/spawn cursor/i);

    const forgedGeometry = deepFreeze({
      ...state,
      runner: {
        ...state.runner!,
        activeEntities: state.runner!.activeEntities.map((entity, index) =>
          index === 0 ? { ...entity, xMilli: entity.xMilli + 1 } : entity),
      },
    });
    expect(() => createRunnerPresentationModel(forgedGeometry, context.course))
      .toThrow(/timeline projection/i);
  });

  it("withholds the prompt outside Semantic, after acknowledgment, and after the safe boundary", () => {
    const { state, context } = firstCheckpoint("0000000000000001");
    const manual = deepFreeze({
      ...state,
      controlMode: "manual" as const,
    });
    // Control mode participates in the run ID, so a forged mode is rejected
    // instead of being allowed to manufacture a presentation boundary.
    expect(() => createRunnerPresentationModel(manual, context.course)).toThrow();

    const acknowledged = chooseLane(
      context,
      state,
      state.runner!.motion.currentLane,
    ).state;
    const afterChoice = createRunnerPresentationModel(acknowledged, context.course);
    expect(afterChoice?.semanticDecision).toBeNull();

    let atBoundary = acknowledged;
    const boundary = createRunnerPresentationModel(state, context.course)!
      .warning.safeBoundaryTick;
    while (atBoundary.simulationTick < boundary) {
      const result = advanceRunnerLaboratory(context, atBoundary);
      if (!result.advanced) throw new Error(`safe-boundary trace stalled: ${result.noOpReason}`);
      atBoundary = result.state;
    }
    expect(createRunnerPresentationModel(atBoundary, context.course)).toBeNull();
  });
});
