import { describe, expect, it } from "vitest";

import { deriveEntityInstanceIdV1 } from "../instance-id";
import type { Difficulty, Lane } from "../run-state";
import {
  RUNNER_LABORATORY_DIFFICULTY_CONTRACTS,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_PATTERN_TEMPLATES,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "./contract";
import type { RunnerScoringDefinition } from "./collision-system";
import {
  assertAuthenticRunnerLaboratoryCourse,
  generateRunnerLaboratoryCourse,
  isAuthenticRunnerLaboratoryCourse,
  RUNNER_LAB_COURSE_PATTERN_COUNT,
  RUNNER_LAB_DECISION_MARKER_ID,
  RUNNER_LAB_DIFFICULTY_PARAMETERS,
  RUNNER_LAB_FINISH_MARKER_ID,
  RUNNER_LAB_PATTERN_COPIES,
  RUNNER_LAB_PATTERN_TEMPLATES,
  RUNNER_LAB_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LAB_STAGE_ID,
  RUNNER_LAB_START_MARKER_ID,
  RUNNER_LAB_TERMINAL_PATTERN_INDEX,
  RUNNER_LAB_TERMINAL_SPAWN_TICK,
  type RunnerLabGeneratedCourse,
  type RunnerLabPatternId,
} from "./course-generator";

const COLLISION_SCORING_DEFINITIONS: ReadonlyMap<
  string,
  RunnerScoringDefinition
> = RUNNER_LAB_SCORING_DEFINITIONS_BY_CONTENT_ID;

interface CourseKnownAnswer {
  readonly runSeed: string;
  readonly course: readonly {
    readonly patternId: RunnerLabPatternId;
    readonly rotation: Lane;
  }[];
}

const COURSE_KNOWN_ANSWERS: readonly CourseKnownAnswer[] = [
  {
    runSeed: "0000000000000000",
    course: [
      { patternId: "runner-lab-quiet-window-v1", rotation: 0 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 1 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 1 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
      { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
      { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
    ],
  },
  {
    runSeed: "0000000000000001",
    course: [
      { patternId: "runner-lab-benefit-fork-v1", rotation: 1 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 0 },
      { patternId: "runner-lab-quiet-window-v1", rotation: 0 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 1 },
      { patternId: "runner-lab-avoid-only-v1", rotation: 2 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
      { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
    ],
  },
  {
    runSeed: "000000000000270f",
    course: [
      { patternId: "runner-lab-avoid-only-v1", rotation: 0 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 0 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 1 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
      { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
      { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
      { patternId: "runner-lab-quiet-window-v1", rotation: 0 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
      { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
    ],
  },
];

const OPTIONAL_KNOWN_ANSWERS: readonly {
  readonly runSeed: string;
  readonly difficulty: Difficulty;
  readonly includedPatternGroups: readonly string[];
}[] = [
  {
    runSeed: "0000000000000000",
    difficulty: "story",
    includedPatternGroups: [
      "2:risk-reward-secondary-v1",
      "3:risk-reward-secondary-v1",
      "5:avoid-secondary-hazard-v1",
    ],
  },
  {
    runSeed: "0000000000000000",
    difficulty: "normal",
    includedPatternGroups: [
      "2:risk-reward-secondary-v1",
      "3:risk-reward-secondary-v1",
      "5:avoid-secondary-hazard-v1",
    ],
  },
  {
    runSeed: "0000000000000000",
    difficulty: "challenge",
    includedPatternGroups: [
      "2:risk-reward-secondary-v1",
      "3:risk-reward-secondary-v1",
      "5:avoid-secondary-hazard-v1",
      "7:avoid-secondary-hazard-v1",
      "8:risk-reward-secondary-v1",
    ],
  },
  {
    runSeed: "0000000000000001",
    difficulty: "story",
    includedPatternGroups: [
      "6:risk-reward-secondary-v1",
      "7:avoid-secondary-hazard-v1",
    ],
  },
  {
    runSeed: "0000000000000001",
    difficulty: "normal",
    includedPatternGroups: [
      "5:risk-reward-secondary-v1",
      "6:risk-reward-secondary-v1",
      "7:avoid-secondary-hazard-v1",
    ],
  },
  {
    runSeed: "0000000000000001",
    difficulty: "challenge",
    includedPatternGroups: [
      "3:risk-reward-secondary-v1",
      "5:risk-reward-secondary-v1",
      "6:risk-reward-secondary-v1",
      "7:avoid-secondary-hazard-v1",
      "9:avoid-secondary-hazard-v1",
    ],
  },
  {
    runSeed: "000000000000270f",
    difficulty: "story",
    includedPatternGroups: [
      "1:avoid-secondary-hazard-v1",
      "2:risk-reward-secondary-v1",
      "7:risk-reward-secondary-v1",
    ],
  },
  {
    runSeed: "000000000000270f",
    difficulty: "normal",
    includedPatternGroups: [
      "1:avoid-secondary-hazard-v1",
      "2:risk-reward-secondary-v1",
      "4:risk-reward-secondary-v1",
      "7:risk-reward-secondary-v1",
    ],
  },
  {
    runSeed: "000000000000270f",
    difficulty: "challenge",
    includedPatternGroups: [
      "1:avoid-secondary-hazard-v1",
      "2:risk-reward-secondary-v1",
      "4:risk-reward-secondary-v1",
      "5:avoid-secondary-hazard-v1",
      "7:risk-reward-secondary-v1",
    ],
  },
];

const EXPECTED_CURSOR_VALUES: Readonly<
  Record<
    Difficulty,
    Readonly<{
      spawnTicks: readonly number[];
      nextSpawnDistancesMilli: readonly number[];
      sentinelDistanceMilli: number;
    }>
  >
> = {
  story: {
    spawnTicks: [208, 458, 708, 958, 1_208, 1_458, 1_708, 1_958, 2_208, 2_458],
    nextSpawnDistancesMilli: [
      540_800, 1_190_800, 1_840_800, 2_490_800, 3_140_800,
      3_790_800, 4_440_800, 5_090_800, 5_740_800, 6_390_800,
    ],
    sentinelDistanceMilli: 7_802_600,
  },
  normal: {
    spawnTicks: [218, 468, 718, 968, 1_218, 1_468, 1_718, 1_968, 2_218, 2_468],
    nextSpawnDistancesMilli: [
      654_000, 1_404_000, 2_154_000, 2_904_000, 3_654_000,
      4_404_000, 5_154_000, 5_904_000, 6_654_000, 7_404_000,
    ],
    sentinelDistanceMilli: 9_003_000,
  },
  challenge: {
    spawnTicks: [218, 468, 718, 968, 1_218, 1_468, 1_718, 1_968, 2_218, 2_468],
    nextSpawnDistancesMilli: [
      741_200, 1_591_200, 2_441_200, 3_291_200, 4_141_200,
      4_991_200, 5_841_200, 6_691_200, 7_541_200, 8_391_200,
    ],
    sentinelDistanceMilli: 10_203_400,
  },
};

function categoryCounts(course: RunnerLabGeneratedCourse): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pattern of course.patterns) {
    counts[pattern.category] = (counts[pattern.category] ?? 0) + 1;
  }
  return counts;
}

function assertCoordinateClosure(course: RunnerLabGeneratedCourse): void {
  const parameters = RUNNER_LAB_DIFFICULTY_PARAMETERS[course.difficulty];
  const expectedCursors = EXPECTED_CURSOR_VALUES[course.difficulty];
  if (course.patterns.length !== RUNNER_LAB_COURSE_PATTERN_COUNT) {
    throw new Error("course pattern count drifted");
  }
  const counts = categoryCounts(course);
  if (
    counts["benefit-fork"] !== 4 ||
    counts["risk-reward"] !== 3 ||
    counts["avoid-only"] !== 2 ||
    counts["quiet-window"] !== 1
  ) {
    throw new Error("course category multiset drifted");
  }

  const instanceIds = new Set<string>();
  const expectedCanonicalIds: string[] = [];
  const recordInstanceId = (instanceId: string): void => {
    if (!/^entity-[0-9a-f]{16}$/.test(instanceId)) {
      throw new Error(`invalid entity instance ID: ${instanceId}`);
    }
    if (instanceIds.has(instanceId)) {
      throw new Error(`duplicate entity instance ID: ${instanceId}`);
    }
    instanceIds.add(instanceId);
    expectedCanonicalIds.push(instanceId);
  };

  recordInstanceId(course.startMarker.instanceId);
  if (
    course.startMarker.instanceId !==
    deriveEntityInstanceIdV1({
      runSeed: course.runSeed,
      stageId: RUNNER_LAB_STAGE_ID,
      patternIndex: 0,
      slotIndex: 63,
      contentId: RUNNER_LAB_START_MARKER_ID,
    }) ||
    course.startMarker.representation !== "resolved-id-sentinel" ||
    course.startMarker.storedInActiveEntities !== false
  ) {
    throw new Error("start marker ID drifted");
  }

  for (let arrayIndex = 0; arrayIndex < course.patterns.length; arrayIndex += 1) {
    const pattern = course.patterns[arrayIndex];
    if (pattern === undefined) throw new Error("missing generated pattern");
    const patternIndex = arrayIndex + 1;
    const template = RUNNER_LAB_PATTERN_TEMPLATES[pattern.templateIndex];
    if (template === undefined) throw new Error("missing pattern template");
    if (
      pattern.patternIndex !== patternIndex ||
      pattern.patternId !== template.patternId ||
      pattern.anchorTick !== 300 + arrayIndex * 250 ||
      pattern.spawnTick !== expectedCursors.spawnTicks[arrayIndex] ||
      pattern.spawnDistanceMilli !==
        expectedCursors.nextSpawnDistancesMilli[arrayIndex]
    ) {
      throw new Error(`pattern ${patternIndex} coordinate drifted`);
    }
    if (
      pattern.incomingCursor.patternIndex !== patternIndex - 1 ||
      pattern.incomingCursor.nextSpawnTick !== pattern.spawnTick ||
      pattern.incomingCursor.nextSpawnDistanceMilli !== pattern.spawnDistanceMilli ||
      pattern.outgoingCursor.patternIndex !== patternIndex
    ) {
      throw new Error(`pattern ${patternIndex} cursor drifted`);
    }
    const nextSpawnTick =
      patternIndex === 10
        ? RUNNER_LAB_TERMINAL_SPAWN_TICK
        : expectedCursors.spawnTicks[arrayIndex + 1];
    const nextSpawnDistance =
      patternIndex === 10
        ? expectedCursors.sentinelDistanceMilli
        : expectedCursors.nextSpawnDistancesMilli[arrayIndex + 1];
    if (
      pattern.outgoingCursor.nextSpawnTick !== nextSpawnTick ||
      pattern.outgoingCursor.nextSpawnDistanceMilli !== nextSpawnDistance
    ) {
      throw new Error(`pattern ${patternIndex} outgoing cursor drifted`);
    }

    const expectedSlots = template.slots.filter(
      (slot) =>
        !slot.optional ||
        (slot.optionalGroupId !== null &&
          pattern.includedOptionalGroupIds.includes(slot.optionalGroupId)),
    );
    if (pattern.entities.length !== expectedSlots.length) {
      throw new Error(`pattern ${patternIndex} slot count drifted`);
    }
    if (pattern.spawnEntities.length !== pattern.entities.length + 1) {
      throw new Error(`pattern ${patternIndex} marker count drifted`);
    }

    for (let slotArrayIndex = 0; slotArrayIndex < expectedSlots.length; slotArrayIndex += 1) {
      const slot = expectedSlots[slotArrayIndex];
      const entity = pattern.entities[slotArrayIndex];
      if (slot === undefined || entity === undefined) {
        throw new Error(`pattern ${patternIndex} missing slot`);
      }
      const expectedLane =
        slot.laneRole === "rotation-origin"
          ? pattern.rotation
          : slot.laneRole === "rotation-next"
            ? ((pattern.rotation + 1) % 3) as Lane
            : ((pattern.rotation + 2) % 3) as Lane;
      if (
        entity.slotIndex !== slot.slotIndex ||
        entity.contentId !== slot.entityContentId ||
        entity.kind !==
          RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
            slot.entityContentId,
          )?.kind ||
        entity.lane !== expectedLane ||
        entity.contactTick !== pattern.anchorTick + slot.contactOffsetTicks ||
        entity.xMilli !==
          215_000 +
            parameters.worldSpeedMilliPerTick *
              (parameters.leadTicks + slot.contactOffsetTicks) ||
        entity.widthMilli !== 34_000 ||
        entity.contactState !== "pending"
      ) {
        throw new Error(`pattern ${patternIndex} slot ${slot.slotIndex} drifted`);
      }
      const expectedId = deriveEntityInstanceIdV1({
        runSeed: course.runSeed,
        stageId: RUNNER_LAB_STAGE_ID,
        patternIndex,
        slotIndex: slot.slotIndex,
        contentId: slot.entityContentId,
      });
      if (entity.instanceId !== expectedId) {
        throw new Error(`pattern ${patternIndex} slot ID drifted`);
      }
      recordInstanceId(entity.instanceId);
    }

    const marker = pattern.decisionMarker;
    if (
      marker !== pattern.spawnEntities.at(-1) ||
      marker.patternIndex !== patternIndex ||
      marker.slotIndex !== 63 ||
      marker.lane !== 1 ||
      marker.xMilli !==
        215_000 + parameters.worldSpeedMilliPerTick * parameters.leadTicks ||
      marker.widthMilli !== 1 ||
      marker.collisionParticipation !== "none" ||
      marker.representation !== "runner-entity" ||
      marker.storedInActiveEntities !== true ||
      marker.contactState !== "pending" ||
      marker.instanceId !==
        deriveEntityInstanceIdV1({
          runSeed: course.runSeed,
          stageId: RUNNER_LAB_STAGE_ID,
          patternIndex,
          slotIndex: 63,
          contentId: RUNNER_LAB_DECISION_MARKER_ID,
        })
    ) {
      throw new Error(`pattern ${patternIndex} decision marker drifted`);
    }
    recordInstanceId(marker.instanceId);
  }

  if (
    course.finishMarker.patternIndex !== RUNNER_LAB_TERMINAL_PATTERN_INDEX ||
    course.finishMarker.instanceId !==
      deriveEntityInstanceIdV1({
        runSeed: course.runSeed,
        stageId: RUNNER_LAB_STAGE_ID,
        patternIndex: RUNNER_LAB_TERMINAL_PATTERN_INDEX,
        slotIndex: 63,
        contentId: RUNNER_LAB_FINISH_MARKER_ID,
      }) ||
    course.finishMarker.representation !== "resolved-id-sentinel" ||
    course.finishMarker.storedInActiveEntities !== false
  ) {
    throw new Error("finish marker ID drifted");
  }
  recordInstanceId(course.finishMarker.instanceId);

  if (
    course.terminalCursor.patternIndex !== 10 ||
    course.terminalCursor.nextSpawnTick !== RUNNER_LAB_TERMINAL_SPAWN_TICK ||
    course.terminalCursor.nextSpawnDistanceMilli !==
      expectedCursors.sentinelDistanceMilli ||
    course.completedCursor.patternIndex !== RUNNER_LAB_TERMINAL_PATTERN_INDEX ||
    course.completedCursor.nextSpawnTick !== RUNNER_LAB_TERMINAL_SPAWN_TICK ||
    course.completedCursor.nextSpawnDistanceMilli !==
      expectedCursors.sentinelDistanceMilli
  ) {
    throw new Error("terminal cursor drifted");
  }
  if (
    course.canonicalEntityIds.length !== instanceIds.size ||
    course.canonicalEntityIds.some((id) => !instanceIds.has(id)) ||
    course.canonicalEntityIds.some(
      (id, index) => id !== expectedCanonicalIds[index],
    )
  ) {
    throw new Error("canonical entity ID closure drifted");
  }
}

describe("runner laboratory course generator", () => {
  it("accepts only branded generator output with the exact run identity", () => {
    const runSeed = "0000000000000000";
    const course = generateRunnerLaboratoryCourse(runSeed, "normal");

    expect(isAuthenticRunnerLaboratoryCourse(course, runSeed, "normal")).toBe(
      true,
    );
    expect(
      isAuthenticRunnerLaboratoryCourse(
        course,
        "0000000000000001",
        "normal",
      ),
    ).toBe(false);
    expect(isAuthenticRunnerLaboratoryCourse(course, runSeed, "story")).toBe(
      false,
    );
    expect(() =>
      assertAuthenticRunnerLaboratoryCourse(course, runSeed, "normal"),
    ).not.toThrow();

    const frozenForgery = Object.freeze({ ...course });
    expect(Object.isFrozen(frozenForgery)).toBe(true);
    expect(
      isAuthenticRunnerLaboratoryCourse(frozenForgery, runSeed, "normal"),
    ).toBe(false);
    expect(() =>
      assertAuthenticRunnerLaboratoryCourse(
        frozenForgery,
        runSeed,
        "normal",
      ),
    ).toThrow("Runner laboratory course identity is not authentic");
    expect(isAuthenticRunnerLaboratoryCourse(null, runSeed, "normal")).toBe(
      false,
    );
  });

  it("derives every catalog view from the frozen contract and fits collision input", () => {
    expect(RUNNER_LAB_SCORING_DEFINITIONS_BY_CONTENT_ID).toBe(
      RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
    );
    expect(RUNNER_LAB_PATTERN_COPIES).toBe(
      RUNNER_LABORATORY_GENERATOR_CONTRACT.copyOrdinalMapping,
    );
    for (const template of RUNNER_LAB_PATTERN_TEMPLATES) {
      expect({
        patternId: template.patternId,
        category: template.category,
        occurrenceCount: template.occurrenceCount,
        legalRotations: template.legalRotations,
        slots: template.slots,
      }).toEqual(RUNNER_LABORATORY_PATTERN_TEMPLATES[template.templateIndex]);
    }
    for (const difficulty of RUNNER_LABORATORY_DIFFICULTY_CONTRACTS) {
      expect(RUNNER_LAB_DIFFICULTY_PARAMETERS[difficulty.difficulty]).toBe(
        difficulty,
      );
    }

    const course = generateRunnerLaboratoryCourse(
      "0000000000000000",
      "challenge",
    );
    for (const entity of course.patterns.flatMap((pattern) => pattern.entities)) {
      const definition = COLLISION_SCORING_DEFINITIONS.get(entity.contentId);
      expect(definition).toMatchObject({
        contentId: entity.contentId,
        kind: entity.kind,
      });
    }
    expect(COLLISION_SCORING_DEFINITIONS.size).toBe(5);
  });

  it("pins the locked 4/3/2/1 copy-ordinal catalog", () => {
    expect(
      RUNNER_LAB_PATTERN_COPIES.map(
        ({ copyOrdinal, templateIndex, copyIndex, patternId }) => ({
          copyOrdinal,
          templateIndex,
          copyIndex,
          patternId,
        }),
      ),
    ).toEqual([
      { copyOrdinal: 0, templateIndex: 0, copyIndex: 0, patternId: "runner-lab-benefit-fork-v1" },
      { copyOrdinal: 1, templateIndex: 0, copyIndex: 1, patternId: "runner-lab-benefit-fork-v1" },
      { copyOrdinal: 2, templateIndex: 0, copyIndex: 2, patternId: "runner-lab-benefit-fork-v1" },
      { copyOrdinal: 3, templateIndex: 0, copyIndex: 3, patternId: "runner-lab-benefit-fork-v1" },
      { copyOrdinal: 4, templateIndex: 1, copyIndex: 0, patternId: "runner-lab-risk-reward-v1" },
      { copyOrdinal: 5, templateIndex: 1, copyIndex: 1, patternId: "runner-lab-risk-reward-v1" },
      { copyOrdinal: 6, templateIndex: 1, copyIndex: 2, patternId: "runner-lab-risk-reward-v1" },
      { copyOrdinal: 7, templateIndex: 2, copyIndex: 0, patternId: "runner-lab-avoid-only-v1" },
      { copyOrdinal: 8, templateIndex: 2, copyIndex: 1, patternId: "runner-lab-avoid-only-v1" },
      { copyOrdinal: 9, templateIndex: 3, copyIndex: 0, patternId: "runner-lab-quiet-window-v1" },
    ]);
  });

  it.each(COURSE_KNOWN_ANSWERS)(
    "matches the locked permutation and rotations for $runSeed",
    ({ runSeed, course: expectedCourse }) => {
      for (const difficulty of ["story", "normal", "challenge"] as const) {
        const course = generateRunnerLaboratoryCourse(runSeed, difficulty);
        expect(
          course.patterns.map(({ patternId, rotation }) => ({
            patternId,
            rotation,
          })),
        ).toEqual(expectedCourse);
      }
    },
  );

  it.each(OPTIONAL_KNOWN_ANSWERS)(
    "matches optional-group inclusion for $runSeed/$difficulty",
    ({ runSeed, difficulty, includedPatternGroups }) => {
      expect(
        generateRunnerLaboratoryCourse(runSeed, difficulty)
          .includedOptionalGroupKeys,
      ).toEqual(includedPatternGroups);
    },
  );

  it("pins the collision witness to real generated coordinate IDs", () => {
    const pattern = generateRunnerLaboratoryCourse(
      "0000000000000000",
      "challenge",
    ).patterns[7];
    expect(pattern).toMatchObject({
      patternIndex: 8,
      patternId: "runner-lab-risk-reward-v1",
      rotation: 2,
      includedOptionalGroupIds: ["risk-reward-secondary-v1"],
    });
    expect(
      pattern?.spawnEntities.map(({ slotIndex, instanceId, contentId }) => ({
        slotIndex,
        instanceId,
        contentId,
      })),
    ).toEqual([
      {
        slotIndex: 0,
        instanceId: "entity-1cd2eb9e83a7722e",
        contentId: "runner-lab-money-token-v1",
      },
      {
        slotIndex: 1,
        instanceId: "entity-22ff92fcaa2e78c3",
        contentId: "runner-lab-clutter-hazard-v1",
      },
      {
        slotIndex: 2,
        instanceId: "entity-e312494944488c11",
        contentId: "runner-lab-happiness-token-v1",
      },
      {
        slotIndex: 3,
        instanceId: "entity-6e72eeaf4d10d1ad",
        contentId: "runner-lab-pressure-hazard-v1",
      },
      {
        slotIndex: 63,
        instanceId: "entity-7e355d74d61f6ff6",
        contentId: "runner-lab-decision-marker-v1",
      },
    ]);
  });

  it("pins every difficulty cursor and fixed-point spawn coordinate", () => {
    for (const difficulty of ["story", "normal", "challenge"] as const) {
      const course = generateRunnerLaboratoryCourse(
        "0000000000000000",
        difficulty,
      );
      expect(course.patterns.map((pattern) => pattern.spawnTick)).toEqual(
        EXPECTED_CURSOR_VALUES[difficulty].spawnTicks,
      );
      expect(
        course.patterns.map((pattern) => pattern.spawnDistanceMilli),
      ).toEqual(EXPECTED_CURSOR_VALUES[difficulty].nextSpawnDistancesMilli);
      expect(course.terminalCursor).toEqual({
        patternIndex: 10,
        nextSpawnTick: RUNNER_LAB_TERMINAL_SPAWN_TICK,
        nextSpawnDistanceMilli:
          EXPECTED_CURSOR_VALUES[difficulty].sentinelDistanceMilli,
      });
      assertCoordinateClosure(course);
    }
  });

  it("closes categories, slots, cursors, lanes, geometry, and IDs over all 10,000 locked seeds", () => {
    for (let seedNumber = 0; seedNumber <= 9_999; seedNumber += 1) {
      const runSeed = seedNumber.toString(16).padStart(16, "0");
      for (const difficulty of ["story", "normal", "challenge"] as const) {
        assertCoordinateClosure(
          generateRunnerLaboratoryCourse(runSeed, difficulty),
        );
      }
    }
  }, 60_000);

  it("is repeatable, independent of difficulty for sequence/rotation, and immutable", () => {
    for (const knownAnswer of COURSE_KNOWN_ANSWERS) {
      const story = generateRunnerLaboratoryCourse(
        knownAnswer.runSeed,
        "story",
      );
      const repeat = generateRunnerLaboratoryCourse(
        knownAnswer.runSeed,
        "story",
      );
      const challenge = generateRunnerLaboratoryCourse(
        knownAnswer.runSeed,
        "challenge",
      );
      expect(repeat).toEqual(story);
      expect(
        challenge.patterns.map(({ patternId, rotation, copyOrdinal }) => ({
          patternId,
          rotation,
          copyOrdinal,
        })),
      ).toEqual(
        story.patterns.map(({ patternId, rotation, copyOrdinal }) => ({
          patternId,
          rotation,
          copyOrdinal,
        })),
      );
      expect(Object.isFrozen(story)).toBe(true);
      expect(Object.isFrozen(story.patterns)).toBe(true);
      expect(Object.isFrozen(story.patterns[0]?.spawnEntities)).toBe(true);
    }
  });

  it("rejects malformed seeds and unsupported runtime difficulty values", () => {
    expect(() => generateRunnerLaboratoryCourse("0", "normal")).toThrow(
      "16 lowercase hexadecimal",
    );
    expect(() =>
      generateRunnerLaboratoryCourse(
        "0000000000000000",
        "impossible" as Difficulty,
      ),
    ).toThrow("Unsupported runner laboratory difficulty");
  });
});
