import { describe, expect, it } from "vitest";

import type {
  CoreScores,
  Lane,
  RunnerEntity,
  RunStateV1,
} from "../run-state";
import { createRunnerLaboratoryEntryState } from "./contract";
import {
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedPattern,
} from "./course-generator";
import {
  compileNeutralLaneTarget,
  evaluateRunnerNeutralPolicy,
  RUNNER_NEUTRAL_LANE_PRIORITY,
} from "./neutral-policy";

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

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function entityProjection(
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

interface CheckpointOptions {
  readonly scores?: CoreScores;
}

function checkpoint(
  runSeed: string,
  difficulty: "story" | "normal" | "challenge",
  patternIndex: number,
  currentLane: Lane,
  options: CheckpointOptions = {},
): { readonly state: RunStateV1; readonly pattern: RunnerLabGeneratedPattern } {
  const setup = { ...SETUP, difficulty };
  const entry = createRunnerLaboratoryEntryState(runSeed, setup);
  const course = generateRunnerLaboratoryCourse(runSeed, difficulty);
  const pattern = course.patterns[patternIndex - 1];
  if (pattern === undefined) throw new Error("test pattern is missing");
  const resolvedEntityIds = [
    course.startMarker.instanceId,
    ...course.patterns
      .filter((candidate) => candidate.patternIndex < patternIndex)
      .flatMap((candidate) =>
        candidate.spawnEntities.map((entity) => entity.instanceId)),
  ].sort((left, right) => left.localeCompare(right));
  const state: RunStateV1 = {
    ...entry,
    scores: options.scores ?? entry.scores,
    stage: {
      ...entry.stage,
      activeTicks: pattern.spawnTick,
      worldDistanceMilli: pattern.spawnDistanceMilli,
    },
    runner: {
      motion: {
        kind: "idle",
        currentLane,
        sourceLane: currentLane,
        targetLane: currentLane,
        elapsedTicks: 0,
        totalTicks: 11,
      },
      inputBuffer: null,
      spawn: {
        ...pattern.outgoingCursor,
        resolvedThroughPatternIndex: patternIndex - 1,
        resolvedEntityIds,
      },
      activeEntities: pattern.spawnEntities.map(entityProjection),
      invulnerableUntilTick: 0,
      userPaused: false,
    },
    simulationTick: pattern.spawnTick,
  };
  return deepFreeze({ state, pattern });
}

describe("runner current-pattern neutral policy", () => {
  it("compiles stay, adjacent, and two-lane targets without a teleport", () => {
    expect(compileNeutralLaneTarget(1, 1)).toEqual({
      sourceLane: 1,
      targetLane: 1,
      laneMoves: 0,
      firstIntent: null,
      bufferedIntent: null,
    });
    expect(compileNeutralLaneTarget(1, 2)).toEqual({
      sourceLane: 1,
      targetLane: 2,
      laneMoves: 1,
      firstIntent: "down",
      bufferedIntent: null,
    });
    expect(compileNeutralLaneTarget(2, 0)).toEqual({
      sourceLane: 2,
      targetLane: 0,
      laneMoves: 2,
      firstIntent: "up",
      bufferedIntent: "up",
    });
  });

  it("uses actual post-clamp utility and stays when current-lane utility is zero", () => {
    const fixture = checkpoint(
      "0000000000000001",
      "story",
      1,
      1,
      { scores: { health: 100, happiness: 60, money: 35 } },
    );
    expect(fixture.pattern).toMatchObject({
      category: "benefit-fork",
      rotation: 1,
    });
    const result = evaluateRunnerNeutralPolicy(fixture.state, fixture.pattern);
    const stay = result.projections.find((projection) => projection.targetLane === 1)!;

    expect(stay.actualDeltas).toEqual({ health: 0, happiness: 0, money: 0 });
    expect(stay.utilityNumerator).toBe(0);
    expect(stay.contacts).toEqual([
      expect.objectContaining({
        outcome: "benefit-applied",
        scoreId: "health",
        requestedDelta: 1,
        actualDelta: 0,
      }),
    ]);
    expect(result.chosenTargetLane).toBe(1);
    expect(
      result.projections.filter((projection) => projection.targetLane !== 1)
        .every((projection) => projection.utilityNumerator === 1),
    ).toBe(true);
  });

  it("projects hazards and benefits, then compiles the selected two-lane target", () => {
    const fixture = checkpoint(
      "0000000000000001",
      "challenge",
      3,
      2,
    );
    expect(fixture.pattern).toMatchObject({
      category: "risk-reward",
      rotation: 0,
    });
    expect(fixture.pattern.entities).toHaveLength(4);

    const result = evaluateRunnerNeutralPolicy(fixture.state, fixture.pattern);
    const laneZero = result.projections.find((projection) => projection.targetLane === 0)!;
    const laneOne = result.projections.find((projection) => projection.targetLane === 1)!;
    const laneTwo = result.projections.find((projection) => projection.targetLane === 2)!;

    expect(laneTwo.actualDeltas).toEqual({ health: 0, happiness: -1, money: 0 });
    expect(laneTwo.utilityNumerator).toBe(-1);
    expect(laneOne.actualDeltas).toEqual({ health: 0, happiness: 1, money: 0 });
    expect(laneOne.utilityNumerator).toBe(1);
    expect(laneZero.actualDeltas).toEqual({ health: -1, happiness: 0, money: 1 });
    expect(laneZero.utilityNumerator).toBe(0);
    expect(laneZero.contacts.map((contact) => contact.outcome)).toEqual([
      "benefit-applied",
      "hazard-applied",
    ]);
    expect(laneZero.finalInvulnerableUntilTick).toBe(
      fixture.pattern.anchorTick + 18 + 25,
    );
    expect(laneZero).toMatchObject({
      laneMoves: 2,
      firstIntent: "up",
      bufferedIntent: "up",
      commitMotion: {
        kind: "moving",
        currentLane: 2,
        sourceLane: 2,
        targetLane: 1,
        elapsedTicks: 1,
      },
      commitInputBuffer: "up",
      finalMotion: { kind: "idle", currentLane: 0 },
      finalInputBuffer: null,
    });
    expect(result.chosenTargetLane).toBe(0);
  });

  it("uses fewest moves then lane priority [1,0,2] for an exact utility tie", () => {
    const fixture = checkpoint(
      "0000000000000001",
      "story",
      9,
      1,
    );
    expect(fixture.pattern).toMatchObject({
      category: "avoid-only",
      rotation: 1,
    });
    expect(fixture.pattern.entities).toHaveLength(1);

    const result = evaluateRunnerNeutralPolicy(fixture.state, fixture.pattern);
    expect(RUNNER_NEUTRAL_LANE_PRIORITY).toEqual([1, 0, 2]);
    expect(
      result.projections.map((projection) => ({
        lane: projection.targetLane,
        utility: projection.utilityNumerator,
        moves: projection.laneMoves,
      })),
    ).toEqual([
      { lane: 0, utility: 0, moves: 1 },
      { lane: 1, utility: -1, moves: 0 },
      { lane: 2, utility: 0, moves: 1 },
    ]);
    expect(result.chosenTargetLane).toBe(0);
  });

  it("is deterministic and deeply immutable", () => {
    const fixture = checkpoint(
      "0000000000000001",
      "challenge",
      3,
      2,
    );
    const first = evaluateRunnerNeutralPolicy(fixture.state, fixture.pattern);
    const second = evaluateRunnerNeutralPolicy(fixture.state, fixture.pattern);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.projections)).toBe(true);
    expect(first.projections.every(Object.isFrozen)).toBe(true);
    expect(first.projections.every((projection) =>
      Object.isFrozen(projection.contacts) &&
      Object.isFrozen(projection.actualDeltas) &&
      Object.isFrozen(projection.finalScores))).toBe(true);
    expect(Object.isFrozen(RUNNER_NEUTRAL_LANE_PRIORITY)).toBe(true);
  });

  it("accepts mutable reload-shaped input without mutation and rejects invalid checkpoints", () => {
    const fixture = checkpoint(
      "0000000000000001",
      "story",
      1,
      1,
    );
    const mutableReloadShape = JSON.parse(JSON.stringify(fixture.state));
    const before = JSON.stringify(mutableReloadShape);
    expect(evaluateRunnerNeutralPolicy(
      mutableReloadShape,
      fixture.pattern,
    ).chosenTargetLane).toBeTypeOf("number");
    expect(JSON.stringify(mutableReloadShape)).toBe(before);
    expect(() => evaluateRunnerNeutralPolicy(deepFreeze({
      ...fixture.state,
      controlMode: "automatic-assist" as const,
    }), fixture.pattern)).toThrow(/Manual/);
    expect(() => evaluateRunnerNeutralPolicy(deepFreeze({
      ...fixture.state,
      runner: {
        ...fixture.state.runner!,
        motion: {
          kind: "moving" as const,
          currentLane: 1 as const,
          sourceLane: 1 as const,
          targetLane: 2 as const,
          elapsedTicks: 1,
          totalTicks: 11 as const,
        },
      },
    }), fixture.pattern)).toThrow(/idle/);
    expect(() => evaluateRunnerNeutralPolicy(deepFreeze({
      ...fixture.state,
      runner: { ...fixture.state.runner!, inputBuffer: "up" as const },
    }), fixture.pattern)).toThrow(/buffer/);

    const wrongMarkerState = deepFreeze({
      ...fixture.state,
      runner: {
        ...fixture.state.runner!,
        activeEntities: fixture.state.runner!.activeEntities.slice(0, -1),
      },
    });
    expect(() => evaluateRunnerNeutralPolicy(
      wrongMarkerState,
      fixture.pattern,
    )).toThrow(/marker/);
    const course = generateRunnerLaboratoryCourse(
      fixture.state.runSeed,
      fixture.state.difficulty,
    );
    expect(() => evaluateRunnerNeutralPolicy(
      fixture.state,
      course.patterns[1]!,
    )).toThrow(/does not match|tick and distance/);
  });
});
