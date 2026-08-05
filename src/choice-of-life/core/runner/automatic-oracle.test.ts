import { beforeAll, describe, expect, it } from "vitest";

import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import {
  deriveRunIdV1,
  retainedRunIdentityTokenV1,
} from "../run-factory";
import {
  decodeRunState,
  encodeRunState,
} from "../run-state-codec";
import { stateHashV1 } from "../run-state-hash";
import type {
  ControlMode,
  CoreScores,
  Lane,
  RunStateV1,
} from "../run-state";
import { STARTING_PROFILE_SCORES } from "../run-state";
import { createRunnerLaboratoryEntryState } from "./contract";
import {
  advanceAutomaticRunnerLaboratory,
  applyAutomaticLabSettlement,
  applyAutomaticLabSettlementAfterReload,
  beginAutomaticLabSettlement,
  createAutomaticEvaluationOracleTrace,
  createAutomaticOracleTrace,
  evaluateAutomaticAuthenticatedModeProjection,
  isAuthenticAutomaticModeProjection,
  isAuthenticAutomaticOracleTrace,
  startAutomaticRunnerLaboratory,
  type AutomaticOracleTrace,
} from "./automatic-oracle";
import {
  createRunnerModeEvaluationSupport,
  evaluateRunnerAuthenticatedModeProjection,
  evaluateRunnerNeutralReplay,
} from "./evaluation-replay";
import {
  deriveIndependentAutomaticOracleEvaluation,
  independentExactStructuralEqualForTest,
} from "./independent-automatic-oracle";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  type RunnerSimulationContext,
  type RunnerSimulationStepInput,
} from "./simulation";

const RUN_SEED = "0000000000000001";
const SETUP = Object.freeze({
  startingProfileId: "steady-mix-v1" as const,
  difficulty: "story" as const,
  controlMode: "automatic-assist" as const,
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

function faultyIdentityHash(payload: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= BigInt(payload.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `entity-${hash.toString(16).padStart(16, "0")}`;
}

function faultyCoordinateEntityId(
  entity: Readonly<{
    contentId: string;
    patternIndex: number;
    slotIndex: number;
  }>,
  defect: "omit-slot" | "stringify-pattern",
): string {
  const patternIndex = defect === "stringify-pattern"
    ? `"${entity.patternIndex}"`
    : String(entity.patternIndex);
  const slotCoordinate = defect === "omit-slot"
    ? ""
    : `,"slotIndex":${entity.slotIndex}`;
  return faultyIdentityHash(
    `{"contentId":"${entity.contentId}","patternIndex":${patternIndex},` +
      `"runSeed":"${RUN_SEED}"${slotCoordinate},` +
      '"stageId":"runner-lab-v1","version":"entity-instance-v1"}',
  );
}

function courseWithFirstEntityId(
  course: RunnerSimulationContext["course"],
  instanceId: string,
): RunnerSimulationContext["course"] {
  const originalId = course.patterns[0]!.entities[0]!.instanceId;
  return deepFreeze({
    ...course,
    patterns: course.patterns.map((pattern, patternIndex) => patternIndex !== 0
      ? pattern
      : {
          ...pattern,
          entities: pattern.entities.map((entity, entityIndex) =>
            entityIndex === 0 ? { ...entity, instanceId } : entity),
          spawnEntities: pattern.spawnEntities.map((entity) =>
            entity.instanceId === originalId
              ? { ...entity, instanceId }
              : entity),
        }),
    canonicalEntityIds: course.canonicalEntityIds.map((candidate) =>
      candidate === originalId ? instanceId : candidate),
  }) as RunnerSimulationContext["course"];
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

function entry(
  controlMode: ControlMode = "automatic-assist",
  runSeed = RUN_SEED,
): RunStateV1 {
  return createRunnerLaboratoryEntryState(
    runSeed,
    setupFor(controlMode),
  );
}

function resolvedPrefix(context: RunnerSimulationContext): readonly string[] {
  return Object.freeze([
    context.course.startMarker.instanceId,
    ...context.course.patterns.flatMap((pattern) =>
      pattern.spawnEntities.map((entity) => entity.instanceId)),
  ].sort((left, right) => left.localeCompare(right)));
}

function automaticTerminalTransient(
  automaticEntry: RunStateV1,
  context: RunnerSimulationContext,
  trace: AutomaticOracleTrace,
): RunStateV1 {
  return deepFreeze({
    ...automaticEntry,
    simulationTick: 3000,
    stage: {
      ...automaticEntry.stage,
      activeTicks: 3000,
      worldDistanceMilli: context.course.worldSpeedMilliPerTick * 3000,
    },
    runner: {
      ...automaticEntry.runner!,
      motion: trace.terminalMotion,
      inputBuffer: trace.terminalInputBuffer,
      spawn: {
        ...context.course.terminalCursor,
        resolvedThroughPatternIndex: 10,
        resolvedEntityIds: resolvedPrefix(context),
      },
      activeEntities: [],
      userPaused: false,
    },
  });
}

interface AutomaticRunEvidence {
  readonly pending: RunStateV1;
  readonly firstMarker: RunStateV1;
  readonly firstPostMarker: RunStateV1;
  readonly midTween: RunStateV1;
  readonly tick2999: RunStateV1;
  readonly targetEvents: readonly { patternIndex: number; targetLane: number }[];
  readonly contacts: readonly {
    entityInstanceId: string;
    simulationTick: number;
    outcome: string;
  }[];
}

function runAutomaticToPending(
  context: RunnerSimulationContext,
  automaticEntry: RunStateV1,
  trace: AutomaticOracleTrace,
): AutomaticRunEvidence {
  let state = startAutomaticRunnerLaboratory(
    context,
    automaticEntry,
    trace,
  ).state;
  const targetEvents: { patternIndex: number; targetLane: number }[] = [];
  const contacts: {
    entityInstanceId: string;
    simulationTick: number;
    outcome: string;
  }[] = [];
  let firstMarker: RunStateV1 | null = null;
  let firstPostMarker: RunStateV1 | null = null;
  let midTween: RunStateV1 | null = null;
  let tick2999: RunStateV1 | null = null;
  while (state.stage.phase === "active") {
    if (
      firstMarker === null &&
      state.runner?.activeEntities.some((entity) =>
        entity.kind === "opportunity" &&
        entity.contentId === "runner-lab-decision-marker-v1")
    ) {
      firstMarker = state;
    }
    if (state.simulationTick === 2999) tick2999 = state;
    const result = advanceAutomaticRunnerLaboratory(context, state, trace);
    if (!result.stateChanged || result.tickDelta !== 1) {
      throw new Error(`Automatic oracle stalled at tick ${state.simulationTick}`);
    }
    for (const event of result.events) {
      if (event.type === "decision-marker-resolved") {
        targetEvents.push({
          patternIndex: state.runner!.spawn.patternIndex,
          targetLane: event.targetLane,
        });
        if (firstPostMarker === null) firstPostMarker = result.state;
      }
      if (event.type === "contact-resolved") {
        contacts.push({
          entityInstanceId: event.contact.entityInstanceId,
          simulationTick: event.contact.simulationTick,
          outcome: event.contact.outcome,
        });
      }
    }
    if (
      midTween === null &&
      result.state.runner?.motion.kind === "moving" &&
      result.state.runner.motion.elapsedTicks > 0 &&
      result.state.runner.motion.elapsedTicks <
        result.state.runner.motion.totalTicks
    ) {
      midTween = result.state;
    }
    state = result.state;
  }
  if (
    firstMarker === null ||
    firstPostMarker === null ||
    midTween === null ||
    tick2999 === null
  ) {
    throw new Error("Automatic evidence missed a required checkpoint");
  }
  return deepFreeze({
    pending: state,
    firstMarker,
    firstPostMarker,
    midTween,
    tick2999,
    targetEvents,
    contacts,
  });
}

function rawAutomaticTarget(
  targetLane: Lane,
): NonNullable<RunnerSimulationStepInput["automaticTarget"]> {
  return Object.freeze({ targetLane }) as NonNullable<
    RunnerSimulationStepInput["automaticTarget"]
  >;
}

function reloadReady(state: RunStateV1): RunStateV1 {
  const decoded = decodeRunState(
    encodeRunState(state),
    RUNNER_LABORATORY_CATALOG,
  );
  if (decoded.kind !== "ready") {
    throw new Error(`Expected reload-ready state, received ${decoded.kind}`);
  }
  return decoded.state;
}

function differentScoresWithSameReservationSubset(
  trace: AutomaticOracleTrace,
): CoreScores {
  const starting = STARTING_PROFILE_SCORES[trace.startingProfileId];
  const replacement = { ...starting };
  for (const scoreId of ["health", "happiness", "money"] as const) {
    if (trace.terminalScores[scoreId] === starting[scoreId]) continue;
    const candidate = [
      starting[scoreId] + 1,
      starting[scoreId] - 1,
      starting[scoreId] + 2,
      starting[scoreId] - 2,
    ].find((value) =>
      value >= 0 &&
      value <= 100 &&
      value !== trace.terminalScores[scoreId]);
    if (candidate === undefined) throw new Error("no alternate score candidate");
    replacement[scoreId] = candidate;
  }
  return Object.freeze(replacement);
}

let context: RunnerSimulationContext;
let automaticEntry: RunStateV1;
let trace: AutomaticOracleTrace;
let evidence: AutomaticRunEvidence;
let completed: RunStateV1;

beforeAll(() => {
  automaticEntry = entry();
  context = createRunnerSimulationContext(RUN_SEED, "story");
  trace = createAutomaticOracleTrace(automaticEntry);
  evidence = runAutomaticToPending(context, automaticEntry, trace);
  completed = applyAutomaticLabSettlement(evidence.pending, trace);
});

describe("Automatic neutral-Manual oracle", () => {
  it("compares shared aliases and cyclic object topology bidirectionally", () => {
    const shared = deepFreeze({ value: 1 });
    const sharedCopy = deepFreeze({ value: 1 });
    const sharedTopology = deepFreeze({ a: shared, b: shared });
    const sharedAndCopyTopology = deepFreeze({ a: shared, b: sharedCopy });
    expect(independentExactStructuralEqualForTest(
      sharedTopology,
      sharedAndCopyTopology,
    )).toBe(false);
    expect(independentExactStructuralEqualForTest(
      sharedAndCopyTopology,
      sharedTopology,
    )).toBe(false);
    const equivalentShared = deepFreeze({ value: 1 });
    expect(independentExactStructuralEqualForTest(
      sharedTopology,
      deepFreeze({ a: equivalentShared, b: equivalentShared }),
    )).toBe(true);

    const cycleLeft: Record<string, unknown> = { kind: "cycle" };
    cycleLeft.self = cycleLeft;
    const cycleRight: Record<string, unknown> = { kind: "cycle" };
    cycleRight.self = cycleRight;
    deepFreeze(cycleLeft);
    deepFreeze(cycleRight);
    expect(independentExactStructuralEqualForTest(
      cycleLeft,
      cycleRight,
    )).toBe(true);

    const expandedRoot: Record<string, unknown> = { kind: "cycle" };
    const expandedCopy: Record<string, unknown> = { kind: "cycle" };
    expandedRoot.self = expandedCopy;
    expandedCopy.self = expandedCopy;
    deepFreeze(expandedRoot);
    expect(independentExactStructuralEqualForTest(
      cycleLeft,
      expandedRoot,
    )).toBe(false);
    expect(independentExactStructuralEqualForTest(
      expandedRoot,
      cycleLeft,
    )).toBe(false);
  });

  it("executes the sparse evaluator trace at all ten markers and rejects ordinary advancement", () => {
    const manualEntry = entry("manual");
    const structural = evaluateRunnerNeutralReplay(manualEntry);
    const manualProjection = evaluateRunnerAuthenticatedModeProjection(
      manualEntry,
      structural,
    );
    const automaticSupport = createRunnerModeEvaluationSupport(
      automaticEntry,
      structural,
    );
    const commonModeCourseMutant = deepFreeze({
      ...automaticSupport.context.course,
      patterns: automaticSupport.context.course.patterns.map(
        (pattern, patternOffset) => patternOffset !== 0
          ? pattern
          : {
              ...pattern,
              entities: pattern.entities.map((entity, entityOffset) =>
                entityOffset !== 0
                  ? entity
                  : {
                      ...entity,
                      xMilli: entity.xMilli +
                        automaticSupport.context.course.worldSpeedMilliPerTick,
                    }),
              spawnEntities: pattern.spawnEntities.map(
                (entity, entityOffset) => entityOffset !== 0
                  ? entity
                  : {
                      ...entity,
                      xMilli: entity.xMilli +
                        automaticSupport.context.course.worldSpeedMilliPerTick,
                    },
              ),
            },
      ),
    }) as typeof automaticSupport.context.course;
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      commonModeCourseMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const sentinelContactStateMutant = deepFreeze({
      ...automaticSupport.context.course,
      startMarker: {
        ...automaticSupport.context.course.startMarker,
        contactState: "pending",
      },
    }) as unknown as typeof automaticSupport.context.course;
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      sentinelContactStateMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const decisionMarkerIdMutant = deepFreeze({
      ...automaticSupport.context.course,
      patterns: automaticSupport.context.course.patterns.map(
        (pattern, patternOffset) => patternOffset !== 0
          ? pattern
          : {
              ...pattern,
              decisionMarker: {
                ...pattern.decisionMarker,
                instanceId: "entity-not-a-stable-suffix",
              },
              spawnEntities: pattern.spawnEntities.map((entity) =>
                entity.instanceId !== pattern.decisionMarker.instanceId
                  ? entity
                  : {
                      ...entity,
                      instanceId: "entity-not-a-stable-suffix",
                    }),
            },
      ),
    }) as typeof automaticSupport.context.course;
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      decisionMarkerIdMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const firstScoringEntity =
      automaticSupport.context.course.patterns[0]!.entities[0]!;
    const omittedCoordinateCourseMutant = courseWithFirstEntityId(
      automaticSupport.context.course,
      faultyCoordinateEntityId(firstScoringEntity, "omit-slot"),
    );
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      omittedCoordinateCourseMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const normalizedCoordinateCourseMutant = courseWithFirstEntityId(
      automaticSupport.context.course,
      faultyCoordinateEntityId(firstScoringEntity, "stringify-pattern"),
    );
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      normalizedCoordinateCourseMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const rotatablePatternOffset = automaticSupport.context.course.patterns
      .findIndex((pattern) => pattern.patternId !==
        "runner-lab-quiet-window-v1");
    const rotatablePattern = automaticSupport.context.course.patterns[
      rotatablePatternOffset
    ]!;
    const alternateRotation = ((rotatablePattern.rotation + 1) % 3) as Lane;
    const rotationDelta =
      (alternateRotation - rotatablePattern.rotation + 3) % 3;
    const legalWrongRotationMutant = deepFreeze({
      ...automaticSupport.context.course,
      patterns: automaticSupport.context.course.patterns.map(
        (pattern, patternOffset) => patternOffset !== rotatablePatternOffset
          ? pattern
          : {
              ...pattern,
              rotation: alternateRotation,
              entities: pattern.entities.map((entity) => ({
                ...entity,
                lane: ((entity.lane + rotationDelta) % 3) as Lane,
              })),
              spawnEntities: pattern.spawnEntities.map((entity) =>
                entity.instanceId === pattern.decisionMarker.instanceId
                  ? entity
                  : {
                      ...entity,
                      lane: ((entity.lane + rotationDelta) % 3) as Lane,
                    }),
            },
      ),
    }) as typeof automaticSupport.context.course;
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      legalWrongRotationMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const wrongPermutationTokens = [
      automaticSupport.context.course.patterns[1]!.permutationToken,
      automaticSupport.context.course.patterns[0]!.permutationToken,
    ] as const;
    const legalWrongPermutationMutant = deepFreeze({
      ...automaticSupport.context.course,
      patterns: automaticSupport.context.course.patterns.map(
        (pattern, patternOffset) => patternOffset > 1
          ? pattern
          : {
              ...pattern,
              permutationToken: wrongPermutationTokens[patternOffset]!,
            },
      ),
    }) as typeof automaticSupport.context.course;
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      legalWrongPermutationMutant,
      structural.targets,
    )).toThrow(/independent locked seed/);
    const firstTarget = structural.targets[0]!;
    const wrongTargetLane = ([0, 1, 2] as const).find((candidate) =>
      candidate !== firstTarget.targetLane)!;
    const wrongTargetDirection = wrongTargetLane < firstTarget.sourceLane
      ? "up" as const
      : wrongTargetLane > firstTarget.sourceLane
        ? "down" as const
        : null;
    const validShapedWrongTarget = structural.targets.map((target, index) =>
      index !== 0
        ? target
        : deepFreeze({
            ...target,
            targetLane: wrongTargetLane,
            firstIntent: wrongTargetDirection,
            bufferedIntent:
              Math.abs(wrongTargetLane - firstTarget.sourceLane) === 2
                ? wrongTargetDirection
                : null,
          }));
    expect(() => deriveIndependentAutomaticOracleEvaluation(
      automaticEntry,
      automaticSupport.context.course,
      validShapedWrongTarget,
    )).toThrow(/independent neutral stay\/utility\/move\/priority selection/);
    const projection = evaluateAutomaticAuthenticatedModeProjection(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
    );
    expect(isDeepFrozen(automaticSupport)).toBe(true);
    expect(isDeepFrozen(manualProjection)).toBe(true);
    expect(isDeepFrozen(projection)).toBe(true);
    expect(isAuthenticAutomaticModeProjection(projection)).toBe(true);
    expect(projection).toMatchObject({
      startEventCount: 1,
      rawLaneInputCount: 0,
      semanticChoiceCount: 0,
      automaticDecisionCount: 10,
      settlementBeginCount: 1,
      settlementApplyCount: 1,
    });
    expect(projection.markerTransitions).toHaveLength(10);
    expect(projection.markerTransitions.every((transition) =>
      transition.decisionMarkerEventCount === 1)).toBe(true);
    expect(projection.contacts.length).toBeGreaterThan(0);
    expect(projection.contacts.every(({ contact }) =>
      contact.outcome === "automatic-pass" && contact.effect === null)).toBe(true);
    expect(projection.effects).toEqual([]);
    expect(projection.terminalScores).toEqual(manualProjection.terminalScores);
    expect(projection.completionFactIds).toHaveLength(1);
    expect(projection.completionMemoryIds).toHaveLength(1);

    const sparseTrace = createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
    );
    const sparseStarted = startAutomaticRunnerLaboratory(
      context,
      automaticEntry,
      sparseTrace,
    ).state;
    expect(() => advanceAutomaticRunnerLaboratory(
      context,
      sparseStarted,
      sparseTrace,
    )).toThrow(/accepts only decision-marker advancement/);

    const copiedProjection = deepFreeze({
      ...manualProjection,
      effects: [],
    }) as typeof manualProjection;
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      copiedProjection,
      automaticSupport,
    )).toThrow(/exact authenticated Manual projection/);
    expect(() => createAutomaticEvaluationOracleTrace(
      entry("automatic-assist", "0000000000000000"),
      structural,
      manualProjection,
      automaticSupport,
    )).toThrow(/exact authenticated mode support/);
    const otherProfileAutomatic = createRunnerLaboratoryEntryState(RUN_SEED, {
      ...setupFor("automatic-assist"),
      startingProfileId: "physical-head-start-v1",
    });
    expect(() => createAutomaticEvaluationOracleTrace(
      otherProfileAutomatic,
      structural,
      manualProjection,
      automaticSupport,
    )).toThrow(/exact authenticated mode support/);
    const timingMutant = deepFreeze({
      ...structural,
      targets: structural.targets.map((target, index) => index === 0
        ? { ...target, simulationTick: target.simulationTick + 1 }
        : target),
    }) as typeof structural;
    expect(() => createRunnerModeEvaluationSupport(
      automaticEntry,
      timingMutant,
    )).toThrow(/exact authenticated structural tape/);

    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        terminalScores: (scores) => ({
          ...scores,
          health: scores.health + 1,
        }),
      },
    )).toThrow(/independent(?:ly derived)? Automatic oracle/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      { contacts: (contacts) => contacts.slice(1) },
    )).toThrow(/independent(?:ly derived)? Automatic oracle/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        // Models the legacy shared geometry plan and candidate agreeing on the
        // same one-tick-late closed-overlap defect. The independent integer
        // oracle must still reject their common-mode contact observation.
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          contacts: observation.contacts.map((contact, index) => index === 0
            ? {
                ...contact,
                simulationTick: contact.simulationTick + 1,
              }
            : contact),
        }),
      },
    )).toThrow(/independent Automatic oracle:.*contacts/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          passes: observation.passes.slice(1),
        }),
      },
    )).toThrow(/independent Automatic oracle:.*passes/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          passes: observation.passes.map((pass, index) => index === 0
            ? { ...pass, simulationTick: pass.simulationTick + 1 }
            : pass),
        }),
      },
    )).toThrow(/independent Automatic oracle:.*passes/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          pendingState: {
            ...observation.pendingState,
            runner: {
              ...observation.pendingState.runner!,
              invulnerableUntilTick:
                observation.pendingState.runner!.invulnerableUntilTick + 1,
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*pending/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          pendingState: {
            ...observation.pendingState,
            stage: {
              ...observation.pendingState.stage,
              settlement: {
                ...observation.pendingState.stage.settlement!,
                settlementId: "settlement-runner-laboratory-mutant-v1",
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*pending/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          pendingState: {
            ...observation.pendingState,
            stage: {
              ...observation.pendingState.stage,
              settlement: {
                ...observation.pendingState.stage.settlement!,
                startedTick:
                  observation.pendingState.stage.settlement!.startedTick + 1,
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*pending/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          pendingState: {
            ...observation.pendingState,
            stage: {
              ...observation.pendingState.stage,
              settlement: {
                ...observation.pendingState.stage.settlement!,
                completedTick: 3000,
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*pending/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            stage: {
              ...observation.completedState.stage,
              settlement: {
                ...observation.completedState.stage.settlement!,
                settlementId: "settlement-runner-laboratory-mutant-v1",
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            stage: {
              ...observation.completedState.stage,
              settlement: {
                ...observation.completedState.stage.settlement!,
                startedTick:
                  observation.completedState.stage.settlement!.startedTick + 1,
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            stage: {
              ...observation.completedState.stage,
              settlement: {
                ...observation.completedState.stage.settlement!,
                completedTick:
                  observation.completedState.stage.settlement!.completedTick! +
                  1,
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            stage: {
              ...observation.completedState.stage,
              settlement: {
                ...observation.completedState.stage.settlement!,
                effectIds: [
                  ...observation.completedState.stage.settlement!.effectIds,
                ].reverse(),
              },
            },
            effectLedger: {
              ...observation.completedState.effectLedger,
              recent: [
                ...observation.completedState.effectLedger.recent,
              ].reverse(),
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            effectLedger: {
              ...observation.completedState.effectLedger,
              recent: observation.completedState.effectLedger.recent.map(
                (effect, index) => index === 0
                  ? { ...effect, categoryId: "runner-benefit-v1" as const }
                  : effect,
              ),
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            effectLedger: {
              ...observation.completedState.effectLedger,
              recent: observation.completedState.effectLedger.recent.map(
                (effect, index) => index === 0
                  ? { ...effect, transactionId: null }
                  : effect,
              ),
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          completedState: {
            ...observation.completedState,
            effectLedger: {
              ...observation.completedState.effectLedger,
              totalsBySource: {
                ...observation.completedState.effectLedger.totalsBySource,
                system: {
                  ...observation.completedState.effectLedger.totalsBySource
                    .system,
                  healthPositive:
                    observation.completedState.effectLedger.totalsBySource
                      .system.healthPositive + 1,
                },
              },
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*completed/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        commonModeCandidateObservation: (observation) => deepFreeze({
          ...observation,
          pendingState: {
            ...observation.pendingState,
            runner: {
              ...observation.pendingState.runner!,
              inputBuffer: "up" as const,
            },
          },
        }),
      },
    )).toThrow(/independent Automatic oracle:.*pending/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        candidate: {
          markerResult: (result) => {
            const runner = result.committed.state.runner!;
            if (runner.motion.kind !== "moving") return result;
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
              },
            });
            const forged = deepFreeze({
              ...result.committed,
              state: forgedState,
            });
            return Object.freeze({ first: forged, committed: forged });
          },
        },
      },
    )).toThrow(/motion|candidate/);
    expect(() => createAutomaticEvaluationOracleTrace(
      automaticEntry,
      structural,
      manualProjection,
      automaticSupport,
      {
        candidate: {
          finishResult: (result) => deepFreeze({
            ...result,
            state: {
              ...result.state,
              stage: {
                ...result.state.stage,
                phase: "active",
                settlement: null,
              },
            },
          }),
        },
      },
    )).toThrow(/finish\/settlement/);
  }, 30_000);

  it("reconstructs the exact Manual entry identity, hash, and deeply frozen trace", () => {
    const manualEntry = entry("manual");
    const expectedManualRunId = deriveRunIdV1(RUN_SEED, {
      startingProfileId: SETUP.startingProfileId,
      difficulty: SETUP.difficulty,
      controlMode: "manual",
      identity: SETUP.identity,
    });

    expect(trace).toMatchObject({
      runSeed: RUN_SEED,
      difficulty: "story",
      startingProfileId: "steady-mix-v1",
      retainedIdentityToken: retainedRunIdentityTokenV1(automaticEntry),
      manualRunId: expectedManualRunId,
      stageEntryStateHash: stateHashV1(manualEntry),
    });
    expect(trace.patternTargets.map((target) => target.patternIndex))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(trace.effects.map((effect) => effect.effectId)).toEqual(
      trace.contacts.flatMap((contact) =>
        contact.effectId === null ? [] : [contact.effectId]),
    );
    expect(trace.effects.every((effect) =>
      effect.source === "runner" &&
      effect.causedByChoiceId === null &&
      effect.transactionId === null &&
      (effect.categoryId === "runner-benefit-v1" ||
        effect.categoryId === "runner-hazard-v1")
    )).toBe(true);
    expect(isAuthenticAutomaticOracleTrace(trace)).toBe(true);
    expect(isDeepFrozen(trace)).toBe(true);
  });

  it("uses every exact target and reproduces Manual contact coordinates without Automatic effects", () => {
    expect(evidence.targetEvents).toEqual(
      trace.patternTargets.map((target) => ({
        patternIndex: target.patternIndex,
        targetLane: target.targetLane,
      })),
    );
    expect(evidence.contacts.map(({ entityInstanceId, simulationTick }) => ({
      entityInstanceId,
      simulationTick,
    }))).toEqual(trace.contacts.map(({ entityInstanceId, simulationTick }) => ({
      entityInstanceId,
      simulationTick,
    })));
    expect(evidence.contacts.every((contact) =>
      contact.outcome === "automatic-pass")).toBe(true);
    expect(evidence.pending.scores).toEqual(
      STARTING_PROFILE_SCORES[automaticEntry.startingProfileId],
    );
    expect(evidence.pending.effectLedger.recent).toEqual([]);
    expect(evidence.pending.runner?.invulnerableUntilTick).toBe(0);
  });

  it("rejects a reload-ready wrong target immediately after marker resolution", () => {
    const expectedTarget = trace.patternTargets[0]!.targetLane;
    const wrongTarget = ([0, 1, 2] as const)
      .find((lane) => lane !== expectedTarget)!;
    const wrongPostMarker = advanceRunnerLaboratory(
      context,
      evidence.firstMarker,
      {
        laneIntent: null,
        automaticTarget: rawAutomaticTarget(wrongTarget),
      },
    ).state;
    const reloadedWrong = reloadReady(wrongPostMarker);

    expect(reloadedWrong.runner?.spawn.resolvedEntityIds).toContain(
      context.course.patterns[0]!.decisionMarker.instanceId,
    );
    expect(() => advanceAutomaticRunnerLaboratory(
      context,
      reloadedWrong,
      trace,
    )).toThrow(/checkpoint differs from the canonical oracle replay/);
    expect(() => createAutomaticOracleTrace(reloadedWrong))
      .toThrow(/checkpoint differs from the canonical oracle replay/);
  });

  it("rejects an arbitrary reload-ready mid-tween state and wrong resolved ledger", () => {
    const motion = evidence.midTween.runner!.motion;
    if (motion.kind !== "moving") throw new Error("Expected moving evidence");
    const alteredElapsed = motion.elapsedTicks === 1 ? 2 : 1;
    const arbitraryTween = deepFreeze({
      ...evidence.midTween,
      runner: {
        ...evidence.midTween.runner!,
        motion: { ...motion, elapsedTicks: alteredElapsed },
      },
    });
    const reloadedTween = reloadReady(arbitraryTween);
    expect(() => advanceAutomaticRunnerLaboratory(
      context,
      reloadedTween,
      trace,
    )).toThrow(/checkpoint differs from the canonical oracle replay/);

    const wrongLedger = deepFreeze({
      ...evidence.pending,
      runner: {
        ...evidence.pending.runner!,
        spawn: {
          ...evidence.pending.runner!.spawn,
          resolvedEntityIds:
            evidence.pending.runner!.spawn.resolvedEntityIds.slice(1),
        },
      },
    });
    expect(() => applyAutomaticLabSettlement(wrongLedger, trace))
      .toThrow(/checkpoint differs from the canonical oracle replay/);
  });

  it("authenticates tick 2999, pending, and completed checkpoints exactly", () => {
    const reloadedTick2999 = reloadReady(evidence.tick2999);
    const rebuiltAtTick2999 = createAutomaticOracleTrace(reloadedTick2999);
    expect(advanceAutomaticRunnerLaboratory(
      context,
      reloadedTick2999,
      rebuiltAtTick2999,
    ).state).toEqual(evidence.pending);
    expect(applyAutomaticLabSettlement(evidence.pending, trace))
      .toEqual(completed);
    expect(applyAutomaticLabSettlement(completed, trace)).toBe(completed);

    const alteredPendingPause = deepFreeze({
      ...evidence.pending,
      runner: { ...evidence.pending.runner!, userPaused: true },
    });
    expect(() => applyAutomaticLabSettlement(alteredPendingPause, trace))
      .toThrow(/checkpoint differs from the canonical oracle replay/);

    const alteredCompleted = deepFreeze({
      ...completed,
      scores: {
        ...completed.scores,
        money: completed.scores.money === 100
          ? 99
          : completed.scores.money + 1,
      },
    });
    expect(() => applyAutomaticLabSettlement(alteredCompleted, trace))
      .toThrow(/checkpoint differs from the canonical oracle replay/);

    const reloadedCompleted = reloadReady(completed);
    const rebuiltAtCompletion = createAutomaticOracleTrace(reloadedCompleted);
    expect(applyAutomaticLabSettlement(
      reloadedCompleted,
      rebuiltAtCompletion,
    )).toEqual(completed);
  });

  it("normalizes only a reload-ready pause on an exact started active checkpoint", () => {
    const pausedTween = reloadReady(deepFreeze({
      ...evidence.midTween,
      runner: { ...evidence.midTween.runner!, userPaused: true },
    }));
    const pausedTweenResult = advanceAutomaticRunnerLaboratory(
      context,
      pausedTween,
      trace,
    );
    expect(pausedTweenResult.state).toBe(pausedTween);
    expect(pausedTweenResult.noOpReason).toBe("user-paused");
    expect(pausedTweenResult.shouldPersist).toBe(false);

    const pausedMarker = reloadReady(deepFreeze({
      ...evidence.firstMarker,
      runner: { ...evidence.firstMarker.runner!, userPaused: true },
    }));
    const pausedMarkerResult = advanceAutomaticRunnerLaboratory(
      context,
      pausedMarker,
      trace,
    );
    expect(pausedMarkerResult.state).toBe(pausedMarker);
    expect(pausedMarkerResult.noOpReason).toBe("user-paused");
    expect(pausedMarker.runner?.activeEntities.map((entity) => entity.instanceId))
      .toContain(context.course.patterns[0]!.decisionMarker.instanceId);

    const resumedMarker = deepFreeze({
      ...pausedMarker,
      runner: { ...pausedMarker.runner!, userPaused: false },
    });
    expect(resumedMarker).toEqual(evidence.firstMarker);
    expect(advanceAutomaticRunnerLaboratory(
      context,
      resumedMarker,
      trace,
    ).state).toEqual(evidence.firstPostMarker);

    const moving = pausedTween.runner!.motion;
    if (moving.kind !== "moving") throw new Error("Expected paused tween");
    const pausePlusMutation = deepFreeze({
      ...pausedTween,
      runner: {
        ...pausedTween.runner!,
        motion: {
          ...moving,
          elapsedTicks: moving.elapsedTicks === 1 ? 2 : 1,
        },
      },
    });
    expect(() => advanceAutomaticRunnerLaboratory(
      context,
      pausePlusMutation,
      trace,
    )).toThrow(/checkpoint differs from the canonical oracle replay/);
  });

  it("does not normalize pre-Start, pending, or non-boolean pause forgeries", () => {
    const preStartUnpaused = deepFreeze({
      ...automaticEntry,
      runner: { ...automaticEntry.runner!, userPaused: false },
    });
    expect(() => startAutomaticRunnerLaboratory(
      context,
      preStartUnpaused,
      trace,
    )).toThrow(/checkpoint differs from the canonical oracle replay/);

    const truthyPause = deepFreeze({
      ...evidence.midTween,
      runner: { ...evidence.midTween.runner!, userPaused: "yes" },
    }) as unknown as RunStateV1;
    expect(() => advanceAutomaticRunnerLaboratory(
      context,
      truthyPause,
      trace,
    )).toThrow(/user-pause flag must be boolean/);
  });

  it("reserves and applies only the trace's exact terminal scores, fact, and memory", () => {
    const starting = STARTING_PROFILE_SCORES[trace.startingProfileId];
    const changedScores = (["health", "happiness", "money"] as const)
      .filter((scoreId) => trace.terminalScores[scoreId] !== starting[scoreId]);

    expect(evidence.pending).toMatchObject({
      runStatus: "active",
      simulationTick: 3000,
      stage: { phase: "settling", settlement: { status: "pending" } },
    });
    expect(evidence.pending.stage.settlement?.effectIds).toHaveLength(
      changedScores.length,
    );
    expect(completed.scores).toEqual(trace.terminalScores);
    expect(completed.storyState.facts.map((fact) => fact.factId))
      .toEqual(trace.completionFactIds);
    expect(completed.storyState.memories.map((memory) => memory.memoryId))
      .toEqual(trace.completionMemoryIds);
    expect(applyAutomaticLabSettlement(completed, trace)).toBe(completed);
    expect(JSON.stringify(evidence.pending)).not.toContain(
      trace.stageEntryStateHash,
    );
    expect(JSON.stringify(evidence.pending)).not.toContain(trace.policyId);
  });

  it("rebuilds the nonpersisted trace after reload and produces the identical completion", () => {
    const decoded = decodeRunState(
      encodeRunState(evidence.pending),
      RUNNER_LABORATORY_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;

    const rebuilt = createAutomaticOracleTrace(decoded.state);
    expect(rebuilt).not.toBe(trace);
    expect(rebuilt).toEqual(trace);
    expect(isAuthenticAutomaticOracleTrace(rebuilt)).toBe(true);
    expect(applyAutomaticLabSettlementAfterReload(decoded.state))
      .toEqual(completed);
  });

  it("rejects copied, cast, mutated-magnitude, and other-run traces", () => {
    const copied = deepFreeze({ ...trace }) as AutomaticOracleTrace;
    expect(isAuthenticAutomaticOracleTrace(copied)).toBe(false);
    expect(() => startAutomaticRunnerLaboratory(
      context,
      automaticEntry,
      copied,
    )).toThrow(/trace identity is not authentic/);

    const alternateScores = differentScoresWithSameReservationSubset(trace);
    const altered = deepFreeze({
      ...trace,
      terminalScores: alternateScores,
    }) as AutomaticOracleTrace;
    expect(() => applyAutomaticLabSettlement(evidence.pending, altered))
      .toThrow(/trace identity is not authentic/);
    expect(evidence.pending.scores).toEqual(
      STARTING_PROFILE_SCORES[trace.startingProfileId],
    );

    const otherEntry = entry("automatic-assist", "0000000000000000");
    const otherTrace = createAutomaticOracleTrace(otherEntry);
    expect(() => startAutomaticRunnerLaboratory(
      context,
      automaticEntry,
      otherTrace,
    )).toThrow(/does not match live Automatic run identity/);
  });

  it("creates the same pending checkpoint through the exact transient settlement wrapper", () => {
    const transient = automaticTerminalTransient(
      automaticEntry,
      context,
      trace,
    );
    const pending = beginAutomaticLabSettlement(transient, trace);
    expect(pending).toEqual(evidence.pending);
    expect(isDeepFrozen(pending)).toBe(true);
  });

  it("does not consume a target while an independent pause remains", () => {
    let state = startAutomaticRunnerLaboratory(
      context,
      automaticEntry,
      trace,
    ).state;
    while (state.runner?.spawn.patternIndex === 0) {
      state = advanceAutomaticRunnerLaboratory(context, state, trace).state;
    }
    const markerId = context.course.patterns[0]!.decisionMarker.instanceId;
    const paused = advanceAutomaticRunnerLaboratory(
      context,
      state,
      trace,
      ["visibility"],
    );
    expect(paused.state).toBe(state);
    expect(paused.shouldPersist).toBe(false);
    expect(paused.state.runner?.activeEntities.map((entity) => entity.instanceId))
      .toContain(markerId);
  });
});
