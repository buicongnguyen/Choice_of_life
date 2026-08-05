import { describe, expect, it } from "vitest";

import { createEmptyEffectLedger } from "../effect-ledger";
import type { CoreScores, RunnerEntity } from "../run-state";
import {
  RUNNER_INVULNERABILITY_TICKS,
  advanceAndResolveRunnerEntities,
  effectIdForRunnerEntity,
  resolveCanonicalContactCandidates,
  runnerEntityHorizontallyOverlapsPlayer,
  runnerEntityLaneOverlapsPlayer,
  runnerPatternSafeBoundaryTick,
  type ContactCandidate,
} from "./collision-system";
import {
  generateRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedPattern,
} from "./course-generator";

const RUN_SEED = "0000000000000000";
const DIFFICULTY = "challenge" as const;
const COURSE = generateRunnerLaboratoryCourse(RUN_SEED, DIFFICULTY);

function frozenScores(
  health = 50,
  happiness = 50,
  money = 50,
): CoreScores {
  return Object.freeze({ health, happiness, money });
}

function runnerEntity(
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
  xMilli = entity.xMilli,
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

function activeBeforeTick(
  course: RunnerLabGeneratedCourse,
  pattern: RunnerLabGeneratedPattern,
  entity: RunnerLabGeneratedPattern["spawnEntities"][number],
  simulationTick: number,
): RunnerEntity {
  return runnerEntity(
    entity,
    entity.xMilli -
      course.worldSpeedMilliPerTick *
        (simulationTick - 1 - pattern.spawnTick),
  );
}

const witnessPattern = COURSE.patterns[7]!;
const witnessEntities = [1, 2, 3].map((slotIndex) => {
  const entity = witnessPattern.entities.find(
    (candidate) => candidate.slotIndex === slotIndex,
  );
  if (entity === undefined) throw new Error(`missing witness slot ${slotIndex}`);
  return entity;
});
const witnessCandidates: readonly ContactCandidate[] = witnessEntities.map(
  (entity) => Object.freeze({ entity: runnerEntity(entity) }),
);
const preexistingWitnessId = witnessPattern.entities.find(
  (entity) => entity.slotIndex === 0,
)!.instanceId;

function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidateIndex) => candidateIndex !== index))
      .map((tail) => [value, ...tail]));
}

function contactInput(
  candidates: readonly ContactCandidate[],
  overrides: Partial<Parameters<typeof resolveCanonicalContactCandidates>[0]> = {},
): Parameters<typeof resolveCanonicalContactCandidates>[0] {
  return {
    course: COURSE,
    runSeed: RUN_SEED,
    difficulty: DIFFICULTY,
    candidates,
    controlMode: "manual",
    simulationTick: 500,
    scores: frozenScores(),
    ledger: createEmptyEffectLedger(),
    invulnerableUntilTick: 0,
    resolvedEntityIds: [],
    ...overrides,
  };
}

describe("runner collision system", () => {
  it("uses the locked closed horizontal and lane boundaries", () => {
    expect(runnerEntityHorizontallyOverlapsPlayer(215_000)).toBe(true);
    expect(runnerEntityHorizontallyOverlapsPlayer(215_001)).toBe(false);
    expect(runnerEntityHorizontallyOverlapsPlayer(145_000)).toBe(true);
    expect(runnerEntityHorizontallyOverlapsPlayer(144_999)).toBe(false);
    expect(runnerEntityLaneOverlapsPlayer(1, 1_300)).toBe(true);
    expect(runnerEntityLaneOverlapsPlayer(1, 1_301)).toBe(false);
  });

  it("derives effect IDs from the exact entity suffix", () => {
    expect(effectIdForRunnerEntity("entity-22ff92fcaa2e78c3"))
      .toBe("effect-22ff92fcaa2e78c3");
    expect(() => effectIdForRunnerEntity("entity-wrong"))
      .toThrow(/entity ID/);
  });

  it("reproduces the six-permutation locked collision witness with exact effects", () => {
    const projections = permutations(witnessCandidates).map((candidates) => {
      const result = resolveCanonicalContactCandidates(contactInput(candidates, {
        resolvedEntityIds: [preexistingWitnessId],
      }));
      return {
        scores: result.scores,
        effects: result.events.flatMap((event) => event.effect ?? []),
        effectIds: result.effectIds,
        newlyResolvedEntityIds: result.newlyResolvedEntityIds,
        resolvedEntityIds: result.resolvedEntityIds,
        invulnerableUntilTick: result.invulnerableUntilTick,
        outcomes: result.events.map(({ outcome }) => outcome),
      };
    });
    expect(new Set(projections.map((projection) => JSON.stringify(projection))).size).toBe(1);
    expect(projections[0]).toMatchObject({
      scores: { health: 49, happiness: 51, money: 50 },
      effectIds: ["effect-22ff92fcaa2e78c3", "effect-e312494944488c11"],
      newlyResolvedEntityIds: [
        "entity-22ff92fcaa2e78c3",
        "entity-6e72eeaf4d10d1ad",
        "entity-e312494944488c11",
      ],
      resolvedEntityIds: [
        "entity-1cd2eb9e83a7722e",
        "entity-22ff92fcaa2e78c3",
        "entity-6e72eeaf4d10d1ad",
        "entity-e312494944488c11",
      ],
      invulnerableUntilTick: 500 + RUNNER_INVULNERABILITY_TICKS,
      outcomes: ["hazard-applied", "benefit-applied", "hazard-suppressed"],
    });
    expect(projections[0]?.effects).toEqual([
      expect.objectContaining({
        source: "runner",
        categoryId: "runner-hazard-v1",
        transactionId: null,
        causedByChoiceId: null,
        simulationTick: 500,
      }),
      expect.objectContaining({
        source: "runner",
        categoryId: "runner-benefit-v1",
        transactionId: null,
        causedByChoiceId: null,
        simulationTick: 500,
      }),
    ]);
  });

  it("keeps benefits authoritative during invulnerability and Automatic contacts nonauthoritative", () => {
    const benefit = witnessCandidates[1]!;
    const semantic = resolveCanonicalContactCandidates(contactInput([benefit], {
      controlMode: "semantic-assist",
      simulationTick: 510,
      invulnerableUntilTick: 525,
    }));
    expect(semantic.scores.happiness).toBe(51);
    expect(semantic.effectIds).toEqual(["effect-e312494944488c11"]);

    const automatic = resolveCanonicalContactCandidates(contactInput(witnessCandidates, {
      controlMode: "automatic-assist",
    }));
    expect(automatic.scores).toEqual({ health: 50, happiness: 50, money: 50 });
    expect(automatic.effectIds).toEqual([]);
    expect(automatic.invulnerableUntilTick).toBe(0);
    expect(automatic.events.every(({ outcome }) => outcome === "automatic-pass")).toBe(true);
  });

  it("uses the exact half-open hazard interval at T+24 and T+25", () => {
    const hazards = COURSE.patterns.flatMap((pattern) => pattern.entities)
      .filter((entity) => entity.kind === "hazard")
      .slice(0, 3)
      .map((entity) => Object.freeze({ entity: runnerEntity(entity) }));
    expect(hazards).toHaveLength(3);
    const first = resolveCanonicalContactCandidates(contactInput([hazards[0]!], {
      simulationTick: 100,
    }));
    const protectedResult = resolveCanonicalContactCandidates(contactInput([hazards[1]!], {
      simulationTick: 124,
      scores: first.scores,
      ledger: first.ledger,
      invulnerableUntilTick: first.invulnerableUntilTick,
      resolvedEntityIds: first.resolvedEntityIds,
    }));
    expect(protectedResult.events[0]?.outcome).toBe("hazard-suppressed");
    const boundary = resolveCanonicalContactCandidates(contactInput([hazards[2]!], {
      simulationTick: 125,
      scores: protectedResult.scores,
      ledger: protectedResult.ledger,
      invulnerableUntilTick: protectedResult.invulnerableUntilTick,
      resolvedEntityIds: protectedResult.resolvedEntityIds,
    }));
    expect(boundary.events[0]?.outcome).toBe("hazard-applied");
    expect(boundary.invulnerableUntilTick).toBe(150);
  });

  it("accepts decoded mutable records without mutation and returns immutable output", () => {
    const scores = JSON.parse(JSON.stringify(frozenScores())) as CoreScores;
    const ledger = JSON.parse(JSON.stringify(createEmptyEffectLedger())) as ReturnType<typeof createEmptyEffectLedger>;
    const before = JSON.stringify({ scores, ledger });
    const result = resolveCanonicalContactCandidates(contactInput([witnessCandidates[1]!], {
      scores,
      ledger,
    }));
    expect(JSON.stringify({ scores, ledger })).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.scores)).toBe(true);
    expect(Object.isFrozen(result.ledger)).toBe(true);
    expect(Object.isFrozen(result.ledger.recent)).toBe(true);
    expect(Object.isFrozen(result.ledger.totalsBySource.system)).toBe(true);
  });

  it("advances authentic old entities and passes only beyond the closed hull", () => {
    const pattern = COURSE.patterns.find((candidate) => candidate.entities.length > 0)!;
    const generated = pattern.entities[0]!;
    const safeTick = generated.contactTick + Math.floor(70_000 / COURSE.worldSpeedMilliPerTick) + 1;
    const beforeSafe = safeTick - 1;
    const first = advanceAndResolveRunnerEntities({
      course: COURSE,
      runSeed: RUN_SEED,
      difficulty: DIFFICULTY,
      activeEntities: [activeBeforeTick(COURSE, pattern, generated, beforeSafe)],
      playerLanePositionMilli: generated.lane === 0 ? 2_000 : 0,
      controlMode: "manual",
      simulationTick: beforeSafe,
      scores: frozenScores(),
      ledger: createEmptyEffectLedger(),
      invulnerableUntilTick: 0,
      resolvedEntityIds: [],
    });
    expect(first.activeEntities).toHaveLength(1);
    expect(first.passedEntityIds).toEqual([]);

    const second = advanceAndResolveRunnerEntities({
      course: COURSE,
      runSeed: RUN_SEED,
      difficulty: DIFFICULTY,
      activeEntities: first.activeEntities,
      playerLanePositionMilli: generated.lane === 0 ? 2_000 : 0,
      controlMode: "manual",
      simulationTick: safeTick,
      scores: first.scores,
      ledger: first.ledger,
      invulnerableUntilTick: first.invulnerableUntilTick,
      resolvedEntityIds: first.resolvedEntityIds,
    });
    expect(second.activeEntities).toEqual([]);
    expect(second.passedEntityIds).toEqual([generated.instanceId]);
  });

  it("rejects off-by-one prior X geometry and spawn-tick advancement", () => {
    const pattern = COURSE.patterns.find(
      (candidate) => candidate.entities.length > 0,
    )!;
    const generated = pattern.entities[0]!;
    const firstAdvanceTick = pattern.spawnTick + 1;
    const authenticPrior = activeBeforeTick(
      COURSE,
      pattern,
      generated,
      firstAdvanceTick,
    );
    const common = {
      course: COURSE,
      runSeed: RUN_SEED,
      difficulty: DIFFICULTY,
      playerLanePositionMilli: generated.lane === 0 ? 2_000 : 0,
      controlMode: "manual" as const,
      scores: frozenScores(),
      ledger: createEmptyEffectLedger(),
      invulnerableUntilTick: 0,
      resolvedEntityIds: [],
    };

    expect(() =>
      advanceAndResolveRunnerEntities({
        ...common,
        activeEntities: [
          Object.freeze({
            ...authenticPrior,
            xMilli: authenticPrior.xMilli + 1,
          }),
        ],
        simulationTick: firstAdvanceTick,
      }),
    ).toThrow(/authentic course timeline/);

    expect(() =>
      advanceAndResolveRunnerEntities({
        ...common,
        activeEntities: [runnerEntity(generated)],
        simulationTick: pattern.spawnTick,
      }),
    ).toThrow(/does not precede this logical tick/);
  });

  it("terminalizes quiet and delayed markers only at exact authentic safe boundaries", () => {
    for (const pattern of [
      COURSE.patterns.find((candidate) => candidate.category === "quiet-window")!,
      COURSE.patterns.find((candidate) => candidate.category === "risk-reward")!,
    ]) {
      const safeTick = runnerPatternSafeBoundaryTick(pattern, COURSE.worldSpeedMilliPerTick);
      const first = advanceAndResolveRunnerEntities({
        course: COURSE,
        runSeed: RUN_SEED,
        difficulty: DIFFICULTY,
        activeEntities: [activeBeforeTick(COURSE, pattern, pattern.decisionMarker, safeTick - 1)],
        playerLanePositionMilli: 1_000,
        controlMode: "manual",
        simulationTick: safeTick - 1,
        scores: frozenScores(),
        ledger: createEmptyEffectLedger(),
        invulnerableUntilTick: 0,
        resolvedEntityIds: [],
      });
      expect(first.activeEntities).toHaveLength(1);
      const second = advanceAndResolveRunnerEntities({
        course: COURSE,
        runSeed: RUN_SEED,
        difficulty: DIFFICULTY,
        activeEntities: first.activeEntities,
        playerLanePositionMilli: 1_000,
        controlMode: "manual",
        simulationTick: safeTick,
        scores: first.scores,
        ledger: first.ledger,
        invulnerableUntilTick: first.invulnerableUntilTick,
        resolvedEntityIds: first.resolvedEntityIds,
      });
      expect(second.activeEntities).toEqual([]);
      expect(second.resolvedEntityIds).toEqual([pattern.decisionMarker.instanceId]);
    }
  });

  it("rejects frozen course forgeries and genuine IDs with forged geometry", () => {
    const forgedCourse = Object.freeze({ ...COURSE });
    expect(() => resolveCanonicalContactCandidates({
      ...contactInput([]),
      course: forgedCourse,
    })).toThrow(/authentic/);

    const genuine = witnessCandidates[0]!;
    const forged: ContactCandidate = {
      entity: { ...genuine.entity, lane: genuine.entity.lane === 0 ? 1 : 0 },
    };
    expect(() => resolveCanonicalContactCandidates(contactInput([forged])))
      .toThrow(/geometry/);

    const pattern = COURSE.patterns.find((candidate) => candidate.entities.length > 0)!;
    const generated = pattern.entities[0]!;
    const tick = pattern.spawnTick + 1;
    const wrongX = {
      ...activeBeforeTick(COURSE, pattern, generated, tick),
      xMilli: generated.xMilli + 1,
    };
    expect(() => advanceAndResolveRunnerEntities({
      course: COURSE,
      runSeed: RUN_SEED,
      difficulty: DIFFICULTY,
      activeEntities: [wrongX],
      playerLanePositionMilli: 2_000,
      controlMode: "manual",
      simulationTick: tick,
      scores: frozenScores(),
      ledger: createEmptyEffectLedger(),
      invulnerableUntilTick: 0,
      resolvedEntityIds: [],
    })).toThrow(/timeline/);
  });

  it("enforces the exact resolved-ID cap at 40/41", () => {
    const allIds = [...COURSE.canonicalEntityIds].sort((left, right) => left.localeCompare(right));
    expect(allIds).toHaveLength(40);
    const atCap = resolveCanonicalContactCandidates(contactInput([], {
      resolvedEntityIds: allIds,
    }));
    expect(atCap.resolvedEntityIds).toHaveLength(40);
    expect(() => resolveCanonicalContactCandidates(contactInput([], {
      resolvedEntityIds: [...allIds, "entity-0000000000000000"].sort(),
    }))).toThrow(/cap/);
  });
});
