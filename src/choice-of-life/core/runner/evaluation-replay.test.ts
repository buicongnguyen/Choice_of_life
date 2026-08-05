import { describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import { initialRunSetupFromStateV1 } from "../run-factory";
import { decodeRunState, encodeRunState } from "../run-state-codec";
import { stateHashV1 } from "../run-state-hash";
import { RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID } from "../run-state-wire";
import type {
  ControlMode,
  Difficulty,
  RunStateV1,
  StartingProfileId,
} from "../run-state";
import { createRunnerLaboratoryEntryState } from "./contract";
import { RUNNER_INVULNERABILITY_TICKS } from "./collision-system";
import {
  advanceAutomaticRunnerLaboratory,
  applyAutomaticLabSettlement,
  createAutomaticOracleTrace,
  startAutomaticRunnerLaboratory,
} from "./automatic-oracle";
import {
  createRunnerModeEvaluationSupport,
  evaluateRunnerAuthenticatedManualCommandProjection,
  evaluateRunnerAuthenticatedModeProjection,
  evaluateRunnerForcedContinuation,
  evaluateRunnerNeutralReplay,
  isAuthenticRunnerForcedContinuationReplay,
  isAuthenticRunnerModeProjection,
  isAuthenticRunnerNeutralReplayTape,
  verifyRunnerReplayCanonicalDataTreeEqualityForTest,
  verifyRunnerReplayContinuationClosureForTest,
  verifyRunnerReplayClosureOccurrenceForTest,
  verifyRunnerReplayExactDuplicateForTest,
  verifyRunnerReplayInductiveOccurrenceForTest,
  type RunnerNeutralReplayContact,
  type RunnerNeutralReplayEffect,
  type RunnerNeutralReplayInvulnerabilityWitness,
  type RunnerNeutralReplayMaximumLiveEntities,
  type RunnerNeutralReplayPass,
  type RunnerNeutralReplayTarget,
  type RunnerModeCandidateDriver,
} from "./evaluation-replay";
import { compileNeutralLaneTarget, evaluateRunnerNeutralPolicy } from "./neutral-policy";
import { applyLabSettlement } from "./settlement";
import {
  advanceRunnerLaboratory,
  chooseLane,
  createRunnerSimulationContext,
  startRunnerLaboratory,
} from "./simulation";

const DIFFICULTIES = Object.freeze([
  "story",
  "normal",
  "challenge",
] as const satisfies readonly Difficulty[]);
const PROFILES = Object.freeze([
  "steady-mix-v1",
  "physical-head-start-v1",
  "emotional-head-start-v1",
  "resource-head-start-v1",
] as const satisfies readonly StartingProfileId[]);
const CONTROL_MODES = Object.freeze([
  "manual",
  "semantic-assist",
  "automatic-assist",
] as const satisfies readonly ControlMode[]);
const WITNESS_SEEDS = Object.freeze([0, 1, 0x270f]);
const PARITY_CASES = Object.freeze(WITNESS_SEEDS.flatMap((seed, index) =>
  PROFILES.map((profile) => ({
    seed,
    difficulty: DIFFICULTIES[index]!,
    profile,
  }))));

function seedHex(seed: number): string {
  return seed.toString(16).padStart(16, "0");
}

function entry(
  seed: number,
  difficulty: Difficulty,
  startingProfileId: StartingProfileId,
  controlMode: ControlMode = "manual",
): RunStateV1 {
  return createRunnerLaboratoryEntryState(seedHex(seed), {
    startingProfileId,
    difficulty,
    controlMode,
    identity: { gender: "female" },
    appearance: {
      heritageStyleId: "asian",
      hairStyleId: "tied-back",
      hairColorId: "dark-brown",
      clothingPaletteId: "meadow",
    },
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      textScale: 100,
      screenReaderAnnouncements: true,
    },
  });
}

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

interface ProductionWitness {
  readonly startHash: string;
  readonly patternHashes: readonly string[];
  readonly pending: RunStateV1;
  readonly completed: RunStateV1;
  readonly targets: readonly RunnerNeutralReplayTarget[];
  readonly contacts: readonly RunnerNeutralReplayContact[];
  readonly effects: readonly RunnerNeutralReplayEffect[];
  readonly passes: readonly RunnerNeutralReplayPass[];
  readonly invulnerabilityWitnesses: readonly RunnerNeutralReplayInvulnerabilityWitness[];
  readonly maximumLiveEntities: RunnerNeutralReplayMaximumLiveEntities;
  readonly productionEventCount: number;
}

interface ReplayClosureOccurrenceWitnesses {
  readonly movingBuffered: RunStateV1;
  readonly contact: RunStateV1;
  readonly invulnerable: RunStateV1;
}

function replayClosureOccurrenceWitnesses(
  entryState: RunStateV1,
): ReplayClosureOccurrenceWitnesses {
  const context = createRunnerSimulationContext(
    entryState.runSeed,
    entryState.difficulty,
  );
  let current = startRunnerLaboratory(context, entryState).state;
  let nextPatternOffset = 0;
  let queuedIntent: "up" | "down" | null = null;
  let movingBuffered: RunStateV1 | null = null;
  let contact: RunStateV1 | null = null;
  let invulnerable: RunStateV1 | null = null;
  while (
    current.stage.phase === "active" &&
    (movingBuffered === null || contact === null || invulnerable === null)
  ) {
    const runner = current.runner;
    if (runner === null) throw new Error("closure witness lost runner state");
    let laneIntent: "up" | "down" | null = null;
    const nextPattern = context.course.patterns[nextPatternOffset];
    if (
      nextPattern !== undefined &&
      current.simulationTick === nextPattern.spawnTick &&
      runner.spawn.patternIndex === nextPattern.patternIndex
    ) {
      const decision = evaluateRunnerNeutralPolicy(current, nextPattern);
      const compilation = compileNeutralLaneTarget(
        decision.sourceLane,
        decision.chosenTargetLane,
      );
      if (nextPatternOffset === 0) {
        // Exercise the production one-slot buffer with a legal center→top→center
        // command pair, independent of whether this seed's neutral target needs it.
        laneIntent = "up";
        queuedIntent = "down";
      } else {
        laneIntent = compilation.firstIntent;
        queuedIntent = compilation.bufferedIntent;
      }
      nextPatternOffset += 1;
    } else if (queuedIntent !== null) {
      laneIntent = queuedIntent;
      queuedIntent = null;
    }
    const result = advanceRunnerLaboratory(context, current, { laneIntent });
    current = result.state;
    if (
      movingBuffered === null && current.runner?.motion.kind === "moving" &&
      current.runner.inputBuffer !== null
    ) {
      movingBuffered = current;
    }
    if (
      contact === null &&
      result.events.some(({ type }) => type === "contact-resolved")
    ) {
      contact = current;
    }
    if (
      invulnerable === null && current.runner !== null &&
      current.runner.invulnerableUntilTick > current.simulationTick
    ) {
      invulnerable = current;
    }
  }
  if (
    movingBuffered === null || contact === null || invulnerable === null
  ) {
    throw new Error(
      "closure witness course lacks a required occurrence state " +
        `(moving=${movingBuffered !== null}, contact=${contact !== null}, ` +
        `invulnerable=${invulnerable !== null})`,
    );
  }
  return { movingBuffered, contact, invulnerable };
}

function fullProductionWitness(entryState: RunStateV1): ProductionWitness {
  const context = createRunnerSimulationContext(
    entryState.runSeed,
    entryState.difficulty,
  );
  const automaticTrace = entryState.controlMode === "automatic-assist"
    ? createAutomaticOracleTrace(entryState)
    : null;
  const manualOracle = entryState.controlMode !== "manual"
    ? evaluateRunnerNeutralReplay(entry(
        Number.parseInt(entryState.runSeed, 16),
        entryState.difficulty,
        entryState.startingProfileId,
        "manual",
      ))
    : null;
  const started = automaticTrace === null
    ? startRunnerLaboratory(context, entryState)
    : startAutomaticRunnerLaboratory(context, entryState, automaticTrace);
  let current = started.state;
  let productionEventCount = started.events.length;
  const startHash = stateHashV1(current);
  const patternHashes: string[] = [];
  const targets: RunnerNeutralReplayTarget[] = [];
  const contacts: RunnerNeutralReplayContact[] = [];
  const effects: RunnerNeutralReplayEffect[] = [];
  const passes: RunnerNeutralReplayPass[] = [];
  const invulnerabilityWitnesses: RunnerNeutralReplayInvulnerabilityWitness[] = [];
  let maximumLiveEntities: RunnerNeutralReplayMaximumLiveEntities = {
    count: 0,
    firstWitnessTick: 0,
    entityInstanceIds: [],
  };
  let queuedIntent: "up" | "down" | null = null;

  while (current.stage.phase === "active") {
    const runner = current.runner;
    if (runner === null) throw new Error("production replay lost runner");
    let laneIntent: "up" | "down" | null = null;
    const nextPattern = context.course.patterns[targets.length];
    if (
      nextPattern !== undefined &&
      current.simulationTick === nextPattern.spawnTick &&
      runner.spawn.patternIndex === nextPattern.patternIndex
    ) {
      const decision = entryState.controlMode === "manual"
        ? evaluateRunnerNeutralPolicy(current, nextPattern)
        : null;
      const oracleTarget = entryState.controlMode !== "manual"
        ? manualOracle!.targets[nextPattern.patternIndex - 1]!
        : null;
      const sourceLane = decision?.sourceLane ?? oracleTarget!.sourceLane;
      const chosenTargetLane = decision?.chosenTargetLane ?? oracleTarget!.targetLane;
      const compilation = compileNeutralLaneTarget(sourceLane, chosenTargetLane);
      targets.push({
        patternIndex: nextPattern.patternIndex,
        simulationTick: current.simulationTick,
        selectedBeforeProductionEventOrdinal: productionEventCount,
        sourceLane,
        targetLane: chosenTargetLane,
        firstIntent: compilation.firstIntent,
        bufferedIntent: compilation.bufferedIntent,
        safeBoundaryTick: decision?.chosenProjection.safeBoundaryTick ?? oracleTarget!.safeBoundaryTick,
        utilityNumerator: decision?.chosenProjection.utilityNumerator ?? oracleTarget!.utilityNumerator,
      });
      if (entryState.controlMode === "manual") {
        laneIntent = compilation.firstIntent;
        queuedIntent = compilation.bufferedIntent;
      }
    } else if (queuedIntent !== null) {
      laneIntent = queuedIntent;
      queuedIntent = null;
    }

    const beforeUntilTick = runner.invulnerableUntilTick;
    let witnessedUntilTick = beforeUntilTick;
    const result = entryState.controlMode === "semantic-assist" &&
        nextPattern !== undefined &&
        current.simulationTick === nextPattern.spawnTick &&
        runner.spawn.patternIndex === nextPattern.patternIndex
      ? chooseLane(context, current, targets.at(-1)!.targetLane)
      : automaticTrace !== null
        ? advanceAutomaticRunnerLaboratory(context, current, automaticTrace)
        : advanceRunnerLaboratory(context, current, { laneIntent });
    let appendedPatternIndex: number | null = null;
    for (const event of result.events) {
      const productionEventOrdinal = productionEventCount;
      productionEventCount += 1;
      if (event.type === "contact-resolved") {
        contacts.push({ productionEventOrdinal, contact: event.contact });
        if (event.contact.effect !== null) {
          effects.push({
            productionEventOrdinal,
            effect: event.contact.effect,
          });
        }
        if (
          event.contact.outcome === "hazard-applied" ||
          event.contact.outcome === "hazard-suppressed"
        ) {
          const afterUntilTick = event.contact.outcome === "hazard-applied"
            ? event.contact.simulationTick + RUNNER_INVULNERABILITY_TICKS
            : witnessedUntilTick;
          invulnerabilityWitnesses.push({
            productionEventOrdinal,
            simulationTick: event.contact.simulationTick,
            entityInstanceId: event.contact.entityInstanceId,
            outcome: event.contact.outcome,
            beforeUntilTick: witnessedUntilTick,
            afterUntilTick,
          });
          witnessedUntilTick = afterUntilTick;
        }
      } else if (event.type === "entity-passed") {
        passes.push({
          productionEventOrdinal,
          simulationTick: event.simulationTick,
          entityInstanceId: event.entityInstanceId,
        });
      } else if (event.type === "pattern-appended") {
        appendedPatternIndex = event.patternIndex;
      }
    }
    current = result.state;
    if (current.runner !== null) {
      expect(current.runner.invulnerableUntilTick).toBe(witnessedUntilTick);
      if (
        current.runner.activeEntities.length > maximumLiveEntities.count
      ) {
        maximumLiveEntities = {
          count: current.runner.activeEntities.length,
          firstWitnessTick: current.simulationTick,
          entityInstanceIds: current.runner.activeEntities.map((entity) =>
            entity.instanceId),
        };
      }
    }
    if (appendedPatternIndex !== null) {
      patternHashes.push(stateHashV1(current));
    }
  }

  const pending = current;
  const completed = automaticTrace === null
    ? applyLabSettlement(pending, null)
    : applyAutomaticLabSettlement(pending, automaticTrace);
  return deepFreeze({
    startHash,
    patternHashes,
    pending,
    completed,
    targets,
    contacts,
    effects,
    passes,
    invulnerabilityWitnesses,
    maximumLiveEntities,
    productionEventCount,
  });
}

describe("fast neutral evaluation replay", () => {
  it("compares decoded futures as exact canonical data trees", () => {
    const left = { nested: [null, { a: 1, b: "two" }], enabled: true };
    const rightNested = Object.create(null) as Record<string, unknown>;
    rightNested.b = "two";
    rightNested.a = 1;
    const right = Object.create(null) as Record<string, unknown>;
    right.enabled = true;
    right.nested = [null, rightNested];
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(left, right))
      .toBe(true);

    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      { value: 1 },
      { value: "1" },
    )).toBe(false);
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      { value: 1 },
      { other: 1 },
    )).toBe(false);
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(NaN, NaN))
      .toBe(false);
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(1.5, 1.5))
      .toBe(false);
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      undefined,
      undefined,
    )).toBe(false);
    // Deliberately stricter than JSON's -0 normalization; valid run states do
    // not contain -0, so this can reject only a forged decoded future.
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(-0, 0))
      .toBe(false);

    const sparse = new Array(2);
    sparse[1] = "value";
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      sparse,
      [undefined, "value"],
    )).toBe(false);
    const extraArray = [1] as Array<number> & { named?: number };
    extraArray.named = 2;
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(extraArray, [1]))
      .toBe(false);
    const symbolObject = { value: 1 } as Record<PropertyKey, unknown>;
    symbolObject[Symbol("hidden")] = 2;
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      symbolObject,
      { value: 1 },
    )).toBe(false);
    const hiddenObject = { value: 1 };
    Object.defineProperty(hiddenObject, "hidden", { value: 2 });
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      hiddenObject,
      { value: 1 },
    )).toBe(false);
    let getterCalls = 0;
    const accessorObject = {};
    Object.defineProperty(accessorObject, "value", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 1;
      },
    });
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      accessorObject,
      { value: 1 },
    )).toBe(false);
    expect(getterCalls).toBe(0);
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      new Date(0),
      {},
    )).toBe(false);
    const leftCycle: Record<string, unknown> = {};
    const rightCycle: Record<string, unknown> = {};
    leftCycle.self = leftCycle;
    rightCycle.self = rightCycle;
    expect(verifyRunnerReplayCanonicalDataTreeEqualityForTest(
      leftCycle,
      rightCycle,
    )).toBe(false);
  });

  it("fails closed for candidate motion, buffer, contact, finish, and settlement mutants", () => {
    const semanticEntry = entry(
      0,
      "story",
      "steady-mix-v1",
      "semantic-assist",
    );
    const structural = evaluateRunnerNeutralReplay(
      entry(0, "story", "steady-mix-v1", "manual"),
    );
    const support = createRunnerModeEvaluationSupport(
      semanticEntry,
      structural,
    );
    const driver = Object.freeze({
      start: (context, state) => startRunnerLaboratory(context, state),
      marker: (context, checkpoint, target) => {
        const result = chooseLane(context, checkpoint, target.targetLane);
        return Object.freeze({ first: result, committed: result });
      },
      finish: (context, state) =>
        advanceRunnerLaboratory(context, state, { laneIntent: null }),
      complete: (state) => applyLabSettlement(state, null),
    } satisfies RunnerModeCandidateDriver);
    const wrongMotion = (result: ReturnType<RunnerModeCandidateDriver["marker"]>) => {
      const runner = result.committed.state.runner!;
      const forgedState = deepFreeze({
        ...result.committed.state,
        runner: {
          ...runner,
          motion: {
            kind: "idle" as const,
            currentLane: runner.motion.sourceLane,
            sourceLane: runner.motion.sourceLane,
            targetLane: runner.motion.sourceLane,
            elapsedTicks: 0 as const,
            totalTicks: runner.motion.totalTicks,
          },
          inputBuffer: "down" as const,
        },
      });
      const forged = deepFreeze({ ...result.committed, state: forgedState });
      return Object.freeze({ first: forged, committed: forged });
    };
    expect(() => support.executeCandidate(driver, {
      markerResult: (result, patternIndex) =>
        patternIndex === 1 ? wrongMotion(result) : result,
    })).toThrow(/motion|buffer|candidate/);

    let omitted = false;
    expect(() => support.executeCandidate(driver, {
      contactCandidates: (candidates) => {
        if (!omitted && candidates.length > 0) {
          omitted = true;
          return [];
        }
        return candidates;
      },
    })).toThrow(/contact\/pass\/finish occurrence/);

    let duplicated = false;
    expect(() => support.executeCandidate(driver, {
      contactCandidates: (candidates) => {
        if (!duplicated && candidates.length > 0) {
          duplicated = true;
          return [...candidates, candidates[0]!];
        }
        return candidates;
      },
    })).toThrow(/contact\/pass\/finish occurrence/);

    expect(() => support.executeCandidate(driver, {
      finishResult: (result) => deepFreeze({
        ...result,
        state: {
          ...result.state,
          stage: { ...result.state.stage, phase: "active", settlement: null },
        },
      }),
    })).toThrow(/finish\/settlement/);

    expect(() => support.executeCandidate(driver, {
      completedState: (state) => deepFreeze({
        ...state,
        storyState: { ...state.storyState, facts: [] },
      }),
    })).toThrow(/settlement|contact\/pass\/finish occurrence/);

    let corruptedNonEventTick = false;
    expect(() => support.executeCandidate(driver, {
      ordinaryTick: (simulationTick, _index, isNonEventTick) => {
        if (!corruptedNonEventTick && isNonEventTick) {
          corruptedNonEventTick = true;
          return simulationTick + 1;
        }
        return simulationTick;
      },
    })).toThrow(/non-event tick/);
    expect(corruptedNonEventTick).toBe(true);

    let skippedNonEventCollisionStage = false;
    expect(() => support.executeCandidate(driver, {
      ordinaryStageExecuted: (stage, _simulationTick, isNonEventTick) => {
        if (
          !skippedNonEventCollisionStage && isNonEventTick &&
          stage === "collisionAdvanceAndResolve"
        ) {
          skippedNonEventCollisionStage = true;
          return false;
        }
        return true;
      },
    })).toThrow(/skipped a production stage/);
    expect(skippedNonEventCollisionStage).toBe(true);

    expect(() => support.executeCandidate(driver, {
      exactProfileStartingScores: (scores) => ({
        ...scores,
        health: scores.health + 1,
      }),
    })).toThrow(/starting-profile scores/);
  }, 30_000);

  it("authenticates exact Manual and Semantic tuples through all production boundaries", () => {
    const manualEntry = entry(0, "normal", "physical-head-start-v1", "manual");
    const structural = evaluateRunnerNeutralReplay(manualEntry);
    const manual = evaluateRunnerAuthenticatedModeProjection(
      manualEntry,
      structural,
    );
    const semantic = evaluateRunnerAuthenticatedModeProjection(
      entry(0, "normal", "physical-head-start-v1", "semantic-assist"),
      structural,
    );
    expect(isAuthenticRunnerModeProjection(manual)).toBe(true);
    expect(isAuthenticRunnerModeProjection(semantic)).toBe(true);
    expect(manual.markerTransitions).toHaveLength(10);
    expect(semantic.markerTransitions).toHaveLength(10);
    expect(manual.markerTransitions.every((transition) =>
      transition.decisionMarkerEventCount === 0)).toBe(true);
    expect(semantic.markerTransitions.every((transition) =>
      transition.decisionMarkerEventCount === 1)).toBe(true);
    expect(manual.contacts).toEqual(structural.contacts);
    expect(manual.effects).toEqual(structural.effects);
    expect(manual.pendingState).toEqual(structural.pendingBoundary.state);
    expect(manual.completedState).toEqual(structural.completedBoundary.state);
    expect(semantic.contacts).toEqual(manual.contacts);
    expect(semantic.effects).toEqual(manual.effects);
    expect(semantic.terminalScores).toEqual(manual.terminalScores);
    expect(semantic.semanticChoiceCount).toBe(10);
    expect(manual.startEventCount).toBe(1);
    expect([manual, semantic].every((projection) =>
      projection.settlementBeginCount === 1 &&
      projection.settlementApplyCount === 1 &&
      projection.completionFactIds.length === 1 &&
      projection.completionMemoryIds.length === 1)).toBe(true);
    expect(manual.ordinaryStepLift.ordinaryTickCount).toBe(3_000);
    expect(manual.ordinaryStepLift.referencedSourceProductionTickCount)
      .toBe(3_000);
    expect(manual.ordinaryStepLift.referencedDecodedProductionTickCount)
      .toBe(3_000);
    expect(
      manual.ordinaryStepLift.exactProfileDirectProductionTickCount +
        manual.ordinaryStepLift.exactProfileTheoremLiftedTickCount,
    ).toBe(3_000);
    expect(manual.ordinaryStepLift.nonEventOrdinaryTickCount)
      .toBeGreaterThan(0);
    expect(Object.values(manual.ordinaryStepLift.stageEvaluationCounts))
      .toEqual([3_000, 3_000, 3_000, 3_000, 3_000, 3_000, 3_000, 1]);
    expect(manual.ordinaryStepLift.exactProfileCodecBoundaryCount).toBe(14);
    expect(semantic.ordinaryStepLift.structuralTickDigest)
      .toBe(manual.ordinaryStepLift.structuralTickDigest);

    expect(() => evaluateRunnerAuthenticatedModeProjection(
      entry(1, "normal", "physical-head-start-v1", "manual"),
      structural,
    )).toThrow(/exact authenticated structural tape/);
    expect(() => evaluateRunnerAuthenticatedModeProjection(
      manualEntry,
      deepFreeze({ ...structural }),
    )).toThrow(/exact authenticated structural tape/);
  }, 30_000);

  it("reuses only structural geometry across profiles and reproduces the exact profile run", () => {
    const structural = evaluateRunnerNeutralReplay(
      entry(1, "normal", "steady-mix-v1", "manual"),
    );
    const exactEntry = entry(
      1,
      "normal",
      "emotional-head-start-v1",
      "manual",
    );
    const exact = evaluateRunnerAuthenticatedModeProjection(
      exactEntry,
      structural,
    );
    const fullExact = evaluateRunnerNeutralReplay(exactEntry);
    expect(exact.contacts).toEqual(fullExact.contacts);
    expect(exact.effects).toEqual(fullExact.effects);
    expect(exact.terminalScores).toEqual(fullExact.terminalScores);
    expect(exact.pendingState).toEqual(fullExact.pendingBoundary.state);
    expect(exact.completedState).toEqual(fullExact.completedBoundary.state);
  }, 30_000);

  it("executes presentation variants without changing their exact gameplay projection", () => {
    const baseEntry = entry(1, "challenge", "resource-head-start-v1", "manual");
    const structural = evaluateRunnerNeutralReplay(baseEntry);
    const base = evaluateRunnerAuthenticatedModeProjection(baseEntry, structural);
    const setup = initialRunSetupFromStateV1(baseEntry, "manual");
    const reducedEntry = createRunnerLaboratoryEntryState(baseEntry.runSeed, {
      ...setup,
      accessibility: { ...setup.accessibility, reducedMotion: true },
    });
    const appearanceEntry = createRunnerLaboratoryEntryState(baseEntry.runSeed, {
      ...setup,
      identity: { gender: "male" },
      appearance: {
        heritageStyleId: "western",
        hairStyleId: "curly-crown",
        hairColorId: "silver",
        clothingPaletteId: "berry",
      },
    });
    const reduced = evaluateRunnerAuthenticatedModeProjection(
      reducedEntry,
      structural,
    );
    const appearance = evaluateRunnerAuthenticatedModeProjection(
      appearanceEntry,
      structural,
    );
    const gameplay = (projection: typeof base) => ({
      markers: projection.markerTransitions.map((transition) => ({
        patternIndex: transition.patternIndex,
        simulationTick: transition.simulationTick,
        sourceLane: transition.sourceLane,
        targetLane: transition.targetLane,
        firstIntent: transition.firstIntent,
        bufferedIntent: transition.bufferedIntent,
        motion: transition.motion,
        inputBuffer: transition.inputBuffer,
      })),
      contacts: projection.contacts,
      effects: projection.effects,
      scores: projection.terminalScores,
      motion: projection.terminalMotion,
      buffer: projection.terminalInputBuffer,
      resolved: projection.terminalResolvedEntityIds,
      facts: projection.completionFactIds,
      memories: projection.completionMemoryIds,
      settlement: projection.settlementEffectIds,
    });
    expect(gameplay(reduced)).toEqual(gameplay(base));
    expect(gameplay(appearance)).toEqual(gameplay(base));
    expect(reduced.pendingStateHash).toBe(base.pendingStateHash);
    expect(reduced.completedStateHash).toBe(base.completedStateHash);
    expect(appearanceEntry.runId).not.toBe(baseEntry.runId);
    expect(isAuthenticRunnerModeProjection(reduced)).toBe(true);
    expect(isAuthenticRunnerModeProjection(appearance)).toBe(true);
  });

  it("rejects adapter timing mutants and exposes direction mutants in state hashes", () => {
    const manualEntry = entry(0, "story", "steady-mix-v1", "manual");
    const structural = evaluateRunnerNeutralReplay(manualEntry);
    const base = evaluateRunnerAuthenticatedModeProjection(manualEntry, structural);
    const commands = structural.targets.flatMap((target) => [
      ...(target.firstIntent === null ? [] : [{
        patternIndex: target.patternIndex,
        simulationTick: target.simulationTick + 1,
        ordinal: 0 as const,
        intent: target.firstIntent,
      }]),
      ...(target.bufferedIntent === null ? [] : [{
        patternIndex: target.patternIndex,
        simulationTick: target.simulationTick + 2,
        ordinal: 1 as const,
        intent: target.bufferedIntent,
      }]),
    ]);
    const exact = evaluateRunnerAuthenticatedManualCommandProjection(
      base,
      commands,
    );
    expect(exact.markerTransitions.map((transition) =>
      transition.afterCommitStateHash)).toEqual(base.markerTransitions.map(
      (transition) => transition.afterCommitStateHash,
    ));
    const first = commands[0]!;
    const wrongDirection = [
      { ...first, intent: first.intent === "up" ? "down" as const : "up" as const },
      ...commands.slice(1),
    ];
    expect(() => evaluateRunnerAuthenticatedManualCommandProjection(
      base,
      wrongDirection,
    )).toThrow(/direction\/timing/);
    expect(() => evaluateRunnerAuthenticatedManualCommandProjection(base, [
      { ...first, simulationTick: first.simulationTick + 1 },
      ...commands.slice(1),
    ])).toThrow(/direction\/timing/);
  });

  it("authenticates mode-aware Semantic and Automatic replay provenance", () => {
    const manual = evaluateRunnerNeutralReplay(
      entry(0, "normal", "steady-mix-v1", "manual"),
    );
    const semantic = evaluateRunnerNeutralReplay(
      entry(0, "normal", "steady-mix-v1", "semantic-assist"),
    );
    const automatic = evaluateRunnerNeutralReplay(
      entry(0, "normal", "steady-mix-v1", "automatic-assist"),
    );
    expect(semantic.effects).toEqual(manual.effects);
    expect(semantic.terminalScores).toEqual(manual.terminalScores);
    expect(automatic.terminalScores).toEqual(manual.terminalScores);
    expect(automatic.rawLaneInputCount).toBe(0);
    expect(automatic.semanticChoiceCount).toBe(0);
    expect(automatic.automaticDecisionCount).toBe(10);
    expect(semantic.semanticChoiceCount).toBe(10);
    expect([manual, semantic, automatic].every((tape) =>
      tape.replayClosure.failureCount === 0 &&
      tape.settlementBeginCount === 1 &&
      tape.settlementApplyCount === 1 &&
      tape.decisionProvenance.length === 10)).toBe(true);
  }, 30_000);

  it.each(PARITY_CASES)(
    "matches full production simulation for seed=$seed difficulty=$difficulty profile=$profile",
    ({ seed, difficulty, profile }) => {
      for (const controlMode of CONTROL_MODES) {
        const entryState = entry(seed, difficulty, profile, controlMode);
        const fast = evaluateRunnerNeutralReplay(entryState);
        const production = fullProductionWitness(entryState);

        expect(fast.startBoundary.stateHash).toBe(production.startHash);
        expect(fast.patternBoundaries.map((item) => item.stateHash))
          .toEqual(production.patternHashes);
        expect(fast.targets).toEqual(production.targets);
        expect(fast.contacts).toEqual(production.contacts);
        expect(fast.effects).toEqual(production.effects);
        expect(fast.passes).toEqual(production.passes);
        expect(fast.invulnerabilityWitnesses)
          .toEqual(production.invulnerabilityWitnesses);
        expect(fast.maximumLiveEntities)
          .toEqual(production.maximumLiveEntities);
        expect(fast.terminalScores).toEqual(production.completed.scores);
        expect(fast.terminalMotion)
          .toEqual(production.pending.runner?.motion);
        expect(fast.terminalInputBuffer)
          .toBe(production.pending.runner?.inputBuffer);
        expect(fast.terminalResolvedEntityIds)
          .toEqual(production.pending.runner?.spawn.resolvedEntityIds);
        expect(fast.pendingBoundary.stateHash)
          .toBe(stateHashV1(production.pending));
        expect(fast.pendingBoundary.state.stage.settlement)
          .toEqual(production.pending.stage.settlement);
        expect(fast.completedBoundary.stateHash)
          .toBe(stateHashV1(production.completed));
        expect(fast.completedBoundary.state.stage.settlement)
          .toEqual(production.completed.stage.settlement);
        expect(fast.completionFactIds)
          .toEqual(production.completed.storyState.facts.map((fact) =>
            fact.factId));
        expect(fast.completionMemoryIds)
          .toEqual(production.completed.storyState.memories.map((memory) =>
            memory.memoryId));
        expect(fast.productionEventCount)
          .toBe(production.productionEventCount);
        expect(fast.evaluatedProfileInvariant.terminalScores)
          .toEqual(production.completed.scores);
        expect(fast.evaluatedProfileInvariant.effectReplayedTerminalScores)
          .toEqual(production.completed.scores);
      }
    },
    30_000,
  );

  it("provides codec-ready canonical continuation boundaries", () => {
    const tape = evaluateRunnerNeutralReplay(
      entry(1, "normal", "steady-mix-v1"),
    );
    const boundaries = [
      tape.startBoundary,
      ...tape.patternBoundaries,
      tape.pendingBoundary,
      tape.completedBoundary,
    ];
    expect(boundaries).toHaveLength(13);
    for (const item of boundaries) {
      const decoded = decodeRunState(
        encodeRunState(item.state),
        RUNNER_LABORATORY_CATALOG,
      );
      if (decoded.kind !== "ready") {
        throw new Error(
          `${item.kind}:${item.patternIndex ?? "terminal"}:${JSON.stringify(decoded)}`,
        );
      }
      expect(decoded, `${item.kind}:${item.patternIndex ?? "terminal"}`)
        .toMatchObject({ kind: "ready" });
      expect(stateHashV1(decoded.state)).toBe(item.stateHash);
      expect(decoded.state).toEqual(item.state);
    }
    const closure = tape.replayClosure;
    expect(closure.checkedBoundaryCount).toBeGreaterThan(0);
    expect(closure.codecReadyCount).toBe(closure.checkedBoundaryCount);
    expect(closure.directCodecDecodeCount).toBeGreaterThan(0);
    expect(closure.directCodecDiscriminantCount).toBeGreaterThan(0);
    expect(closure.directCodecDecodeCount)
      .toBeGreaterThanOrEqual(closure.directCodecDiscriminantCount);
    expect(closure.mandatoryDirectReloadCoverageCount).toBeGreaterThan(0);
    expect(closure.inductivelyCertifiedCodecReadyCount).toBeGreaterThan(0);
    expect(
      closure.directCodecDecodeCount +
        closure.inductivelyCertifiedCodecReadyCount,
    ).toBe(closure.checkedBoundaryCount);
    expect(closure.directSaveInvariantCount)
      .toBeGreaterThanOrEqual(closure.directCodecDecodeCount);
    expect(closure.inductivelyCertifiedSaveInvariantCount)
      .toBeGreaterThan(0);
    expect(
      closure.directSaveInvariantCount +
        closure.inductivelyCertifiedSaveInvariantCount,
    ).toBe(closure.checkedBoundaryCount);
    expect(closure.wireBijectionCertificateId)
      .toBe(RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID);
    expect(closure.wireBijectionKeyCount).toBe(137);
    expect(closure.wireBijectionPairDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(closure.wireBijectionRecursiveInverseDigest)
      .toMatch(/^[0-9a-f]{16}$/);
    expect(closure.wireIdentityTransferCount)
      .toBe(closure.checkedBoundaryCount);
    expect(closure.canonicalEqualityCount).toBe(closure.checkedBoundaryCount);
    expect(closure.stateHashEqualityCount).toBe(closure.checkedBoundaryCount);
    expect(closure.saveInvariantCount).toBe(closure.checkedBoundaryCount);
    expect(closure.continuationCertificateCount)
      .toBe(closure.checkedBoundaryCount);
    expect(closure.failureCount).toBe(0);
    expect(closure.stateHashDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(closure.continuationCertificateDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(
      closure.kindCounts["idle-null-buffer"] +
        closure.kindCounts["moving-null-buffer"] +
        closure.kindCounts["moving-full-buffer"],
    ).toBe(3_000);
    expect(closure.kindCounts["user-pause"]).toBe(1);
    expect(closure.kindCounts["user-resume"]).toBe(1);
  }, 30_000);

  it("rejects executed future-state, logical-tick, and stable-ID mutants", () => {
    const tape = evaluateRunnerNeutralReplay(
      entry(1, "normal", "steady-mix-v1"),
    );
    let changedState = false;
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      decodedFutureState: (state) => {
        if (changedState) return state;
        changedState = true;
        return deepFreeze({
          ...state,
          scores: {
            ...state.scores,
            health: state.scores.health === 0 ? 1 : state.scores.health - 1,
          },
        });
      },
    })).toBe(false);

    let changedLaterSameShapeValue = false;
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      decodedSourceState: (state, sourceState) => {
        if (
          changedLaterSameShapeValue || sourceState.simulationTick < 1_000 ||
          state.runner === null
        ) {
          return state;
        }
        changedLaterSameShapeValue = true;
        return deepFreeze({
          ...state,
          runner: {
            ...state.runner,
            spawn: {
              ...state.runner.spawn,
              nextSpawnTick: state.runner.spawn.nextSpawnTick + 1,
            },
          },
        });
      },
    })).toBe(false);
    expect(changedLaterSameShapeValue).toBe(true);

    let changedTick = false;
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      decodedFutureTick: (simulationTick) => {
        if (changedTick) return simulationTick;
        changedTick = true;
        return simulationTick + 1;
      },
    })).toBe(false);

    let changedIds = false;
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      decodedFutureEntityIds: (instanceIds) => {
        if (changedIds) return instanceIds;
        changedIds = true;
        return [...instanceIds, "entity-mutant-0000000000000000"];
      },
    })).toBe(false);

    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      wireBijectionPairs: (pairs) => pairs.slice(1),
    })).toBe(false);
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      wireBijectionPairs: (pairs) => pairs.map((pair, index) =>
        index === 17 ? { ...pair, wireKey: "changedDurableKey" } : pair),
    })).toBe(false);
    expect(verifyRunnerReplayContinuationClosureForTest(tape, {
      decodedUserPauseState: (state) => deepFreeze({
        ...state,
        runner: {
          ...state.runner!,
          userPaused: false,
        },
      }),
    })).toBe(false);
  }, 30_000);

  it("rejects moving-buffer, contact-ledger, and invulnerability codec mutants", () => {
    const witnesses = replayClosureOccurrenceWitnesses(
      entry(1, "normal", "steady-mix-v1"),
    );
    expect(verifyRunnerReplayClosureOccurrenceForTest(witnesses.movingBuffered))
      .toBe(true);
    expect(verifyRunnerReplayClosureOccurrenceForTest(witnesses.contact))
      .toBe(true);
    expect(verifyRunnerReplayClosureOccurrenceForTest(witnesses.invulnerable))
      .toBe(true);

    expect(verifyRunnerReplayExactDuplicateForTest(
      witnesses.movingBuffered,
      witnesses.movingBuffered,
    )).toBe(true);
    const cosmeticHashCollision = deepFreeze({
      ...witnesses.movingBuffered,
      appearance: {
        ...witnesses.movingBuffered.appearance,
        clothingPaletteId:
          witnesses.movingBuffered.appearance.clothingPaletteId === "berry"
            ? "ocean"
            : "berry",
      },
    } satisfies RunStateV1);
    expect(stateHashV1(cosmeticHashCollision))
      .toBe(stateHashV1(witnesses.movingBuffered));
    expect(encodeRunState(cosmeticHashCollision))
      .not.toBe(encodeRunState(witnesses.movingBuffered));
    expect(verifyRunnerReplayExactDuplicateForTest(
      witnesses.movingBuffered,
      cosmeticHashCollision,
    )).toBe(false);

    expect(verifyRunnerReplayInductiveOccurrenceForTest(
      witnesses.movingBuffered,
    )).toBe(true);
    const sameShapeInvalidCursor = deepFreeze({
      ...witnesses.movingBuffered,
      runner: {
        ...witnesses.movingBuffered.runner!,
        spawn: {
          ...witnesses.movingBuffered.runner!.spawn,
          nextSpawnTick: witnesses.movingBuffered.simulationTick,
        },
      },
    } satisfies RunStateV1);
    expect(verifyRunnerReplayInductiveOccurrenceForTest(
      sameShapeInvalidCursor,
    )).toBe(false);

    const movingRunner = witnesses.movingBuffered.runner!;
    const wrongMovingBuffer = deepFreeze({
      ...witnesses.movingBuffered,
      runner: {
        ...movingRunner,
        inputBuffer: "left" as unknown as "up",
      },
    } satisfies RunStateV1);
    expect(verifyRunnerReplayClosureOccurrenceForTest(wrongMovingBuffer))
      .toBe(false);

    const contactRunner = witnesses.contact.runner!;
    const wrongContactLedger = deepFreeze({
      ...witnesses.contact,
      runner: {
        ...contactRunner,
        spawn: {
          ...contactRunner.spawn,
          resolvedEntityIds: contactRunner.spawn.resolvedEntityIds.slice(1),
        },
      },
    } satisfies RunStateV1);
    expect(verifyRunnerReplayClosureOccurrenceForTest(wrongContactLedger))
      .toBe(false);

    const invulnerableRunner = witnesses.invulnerable.runner!;
    const wrongInvulnerability = deepFreeze({
      ...witnesses.invulnerable,
      runner: {
        ...invulnerableRunner,
        invulnerableUntilTick: invulnerableRunner.invulnerableUntilTick + 1,
      },
    } satisfies RunStateV1);
    expect(verifyRunnerReplayClosureOccurrenceForTest(wrongInvulnerability))
      .toBe(false);
  });

  it("continues authenticated Manual and Semantic checkpoints through the production replay seam", () => {
    for (const controlMode of ["manual", "semantic-assist"] as const) {
      const tape = evaluateRunnerNeutralReplay(
        entry(1, "normal", "steady-mix-v1", controlMode),
      );
      for (const patternIndex of [1, 5, 10]) {
        const checkpoint = tape.patternBoundaries[patternIndex - 1]?.state;
        const target = tape.targets[patternIndex - 1]?.targetLane;
        if (checkpoint === undefined || target === undefined) {
          throw new Error(`missing continuation witness ${controlMode}/${patternIndex}`);
        }
        const continuation = evaluateRunnerForcedContinuation(
          checkpoint,
          patternIndex,
          target,
        );
        expect(isAuthenticRunnerForcedContinuationReplay(continuation)).toBe(true);
        expect(continuation.completedState).toEqual(tape.completedBoundary.state);
        expect(continuation.completedStateHash).toBe(tape.completedBoundary.stateHash);
        expect(continuation.terminalScores).toEqual(tape.terminalScores);
      }
    }
  }, 30_000);

  it("normalizes Manual queued intent to the truthful Semantic effective-buffer trace", () => {
    const manualTape = evaluateRunnerNeutralReplay(
      entry(1, "challenge", "steady-mix-v1", "manual"),
    );
    const semanticTape = evaluateRunnerNeutralReplay(
      entry(1, "challenge", "steady-mix-v1", "semantic-assist"),
    );
    const witnessIndex = manualTape.patternBoundaries.findIndex((boundary) => {
      const lane = boundary.state.runner?.motion.currentLane;
      return lane === 0 || lane === 2;
    });
    expect(witnessIndex).toBeGreaterThanOrEqual(0);
    const manualCheckpoint = manualTape.patternBoundaries[witnessIndex]!.state;
    const semanticCheckpoint = semanticTape.patternBoundaries[witnessIndex]!.state;
    const sourceLane = manualCheckpoint.runner!.motion.currentLane;
    const forcedTarget = sourceLane === 0 ? 2 : 0;
    const manual = evaluateRunnerForcedContinuation(
      manualCheckpoint,
      witnessIndex + 1,
      forcedTarget,
    );
    const semantic = evaluateRunnerForcedContinuation(
      semanticCheckpoint,
      witnessIndex + 1,
      forcedTarget,
    );
    expect(semantic.tickProgression.gameplayHashDigest)
      .toBe(manual.tickProgression.gameplayHashDigest);
    expect(semantic.tickProgression.stateHashDigest)
      .not.toBe(manual.tickProgression.stateHashDigest);
    expect(semantic.tickProgression.ordinaryTickCount)
      .toBe(manual.tickProgression.ordinaryTickCount);
    expect(semantic.terminalMotion).toEqual(manual.terminalMotion);
    expect(semantic.terminalInputBuffer).toBe(manual.terminalInputBuffer);
    expect(semantic.futureScoringEntityIds)
      .toEqual(manual.futureScoringEntityIds);
  }, 30_000);

  it("rejects mutable or forged entries and never authenticates copied tapes", () => {
    const canonicalEntry = entry(0, "story", "steady-mix-v1");
    expect(() => evaluateRunnerNeutralReplay({ ...canonicalEntry }))
      .toThrow(/deeply immutable/);
    expect(() => evaluateRunnerNeutralReplay(deepFreeze({ ...canonicalEntry })))
      .toThrow(/exact canonical laboratory entry/);
    const forgedEntry = deepFreeze({
      ...canonicalEntry,
      scores: {
        ...canonicalEntry.scores,
        health: canonicalEntry.scores.health + 1,
      },
    });
    expect(() => evaluateRunnerNeutralReplay(forgedEntry))
      .toThrow(/exact canonical laboratory entry/);

    const tape = evaluateRunnerNeutralReplay(canonicalEntry);
    expect(isAuthenticRunnerNeutralReplayTape(tape)).toBe(true);
    expect(Object.isFrozen(tape)).toBe(true);
    expect(Object.isFrozen(tape.targets)).toBe(true);
    expect(() => (tape.targets as RunnerNeutralReplayTarget[]).push(
      tape.targets[0]!,
    )).toThrow();
    expect(isAuthenticRunnerNeutralReplayTape({ ...tape })).toBe(false);
  });

  it("reports representative replay timing as a non-normative diagnostic", () => {
    const cases = DIFFICULTIES.flatMap((difficulty) =>
      PROFILES.map((profile) => entry(0x270f, difficulty, profile)));
    evaluateRunnerNeutralReplay(cases[0]!);
    const startedAt = performance.now();
    for (const entryState of cases) evaluateRunnerNeutralReplay(entryState);
    const elapsedMilliseconds = performance.now() - startedAt;
    const millisecondsPerReplay = elapsedMilliseconds / cases.length;
    const projectedTwoWorkerEvaluatorMinutes =
      millisecondsPerReplay * 30_000 / 2 / 60_000;
    console.info("neutral replay performance", {
      caseCount: cases.length,
      elapsedMilliseconds,
      millisecondsPerReplay,
      projectedTwoWorkerEvaluatorMinutes,
    });
    expect(cases).toHaveLength(12);
    expect(Number.isFinite(elapsedMilliseconds)).toBe(true);
    expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(projectedTwoWorkerEvaluatorMinutes)).toBe(true);
    expect(projectedTwoWorkerEvaluatorMinutes).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
