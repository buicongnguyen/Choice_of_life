import { describe, expect, it } from "vitest";

import fixture from "../../../../docs/balance/runner-fixtures/runner-laboratory-fixture-v1.json";
import { RUNNER_LABORATORY_CATALOG } from "../catalog";
import { validateRunState } from "../run-state-codec";
import type { Difficulty } from "../run-state";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_CONTRACT,
  RUNNER_LABORATORY_CONTROL_MODES,
  RUNNER_LABORATORY_DIFFICULTY_CONTRACTS,
  RUNNER_LABORATORY_EFFECT_CATEGORY_IDS,
  RUNNER_LABORATORY_ENTRY_STATE_CONTRACT,
  RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION,
  RUNNER_LABORATORY_ENTITY_EFFECTS,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_MARKERS,
  RUNNER_LABORATORY_MARKER_IDS,
  RUNNER_LABORATORY_MOVEMENT_CONTRACT,
  RUNNER_LABORATORY_PATTERN_IDS,
  RUNNER_LABORATORY_PATTERN_TEMPLATES,
  RUNNER_LABORATORY_SCORING_ENTITY_IDS,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
  RUNNER_LABORATORY_SETTLEMENT_CONTRACT,
  RUNNER_LABORATORY_STAGE_CONTRACT,
  RUNNER_LABORATORY_STAGE_ID,
  RUNNER_LABORATORY_WARNING_CONTRACT,
} from "./contract";

describe("runner laboratory immutable runtime contract", () => {
  it("projects the locked stage identity, timing, composition, and generator coordinates", () => {
    expect(RUNNER_LABORATORY_STAGE_ID).toBe(fixture.stage.stageIds[0]);
    expect(RUNNER_LABORATORY_CONTROL_MODES).toEqual(fixture.assist.modes);
    expect(RUNNER_LABORATORY_PATTERN_IDS).toEqual(fixture.stage.patternIds);
    expect(RUNNER_LABORATORY_STAGE_CONTRACT).toEqual({
      durationTicks: fixture.stage.durationTicks,
      tickDurationMs: fixture.stage.tickDurationMs,
      decisionWindowCount: fixture.stage.decisionWindowCount,
      firstWindowAnchorTick: fixture.stage.firstWindowAnchorTick,
      windowAnchorSpacingTicks: fixture.stage.windowAnchorSpacingTicks,
      lastWindowAnchorTick: fixture.stage.lastWindowAnchorTick,
      windowAnchorTicks: Array.from(
        { length: fixture.stage.decisionWindowCount },
        (_, index) => fixture.stage.firstWindowAnchorTick + (index * fixture.stage.windowAnchorSpacingTicks),
      ),
      categoryCounts: fixture.stage.categoryCounts,
      rollingHorizonPatterns: fixture.stage.rollingHorizonPatterns,
      latestContactOffsetTicks: fixture.stage.latestContactOffsetTicks,
      latestPossibleContactTick: fixture.stage.latestPossibleContactTick,
      standalonePractice: fixture.stage.standalonePractice,
    });
    expect(RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorTicks.at(-1)).toBe(
      fixture.stage.lastWindowAnchorTick,
    );

    expect(RUNNER_LABORATORY_GENERATOR_CONTRACT).toMatchObject({
      algorithmId: fixture.generator.algorithmId,
      permutationAlgorithm: fixture.generator.permutationAlgorithm,
      copyOrdinalMapping: fixture.generator.copyOrdinalMapping,
      deterministic: fixture.generator.deterministic,
      rerollAllowed: fixture.generator.rerollAllowed,
      canonicalEntityOrder: fixture.generator.canonicalEntityOrder,
      coursePatternIndexStart: fixture.generator.coursePatternIndexStart,
      initialPatternIndex: fixture.generator.initialPatternIndex,
      initialResolvedThroughPatternIndex: fixture.generator.initialResolvedThroughPatternIndex,
      terminalPatternIndex: fixture.generator.terminalPatternIndex,
      terminalSpawnTick: fixture.generator.nextSpawnSentinel.tick,
      newlySpawnedEntitiesAdvanceOnSpawnTick: fixture.generator.newlySpawnedEntitiesAdvanceOnSpawnTick,
      maxLiveInteractiveEntities: fixture.generator.maxLiveInteractiveEntities,
      maxResolvedEntityIds: fixture.markers.resolvedEntityIdRetention.maximumIds,
    });
    expect([
      RUNNER_LABORATORY_GENERATOR_CONTRACT.permutationEntropyChannel,
      RUNNER_LABORATORY_GENERATOR_CONTRACT.laneRotationEntropyChannel,
      ...RUNNER_LABORATORY_GENERATOR_CONTRACT.optionalEntropyChannels,
    ]).toEqual(fixture.generator.entropyChannels);
  });

  it("projects every locked difficulty, cursor, warning, motion, and collision scalar", () => {
    const cursorByDifficulty = new Map(
      fixture.generator.spawnCursorSemantics.cursorValuesByDifficulty.map((cursor) => [cursor.difficulty, cursor]),
    );
    const expectedDifficultyContracts = fixture.difficultyProfiles.map((profile) => {
      const difficulty = profile.difficulty as Difficulty;
      const cursor = cursorByDifficulty.get(difficulty);
      if (cursor === undefined) throw new Error(`Missing fixture cursor for ${difficulty}`);
      return {
        ...profile,
        leadTicks: fixture.warning.leadTicks[difficulty],
        firstSpawnTick: cursor.spawnTicks[0],
        firstSpawnDistanceMilli: cursor.nextSpawnDistancesMilli[0],
        terminalSpawnDistanceMilli: fixture.generator.nextSpawnSentinel.distanceMilliByDifficulty[difficulty],
      };
    });
    expect(RUNNER_LABORATORY_DIFFICULTY_CONTRACTS).toEqual(expectedDifficultyContracts);
    expect(RUNNER_LABORATORY_WARNING_CONTRACT).toEqual({
      baseReactionTicks: fixture.warning.baseReactionTicks,
      requiredMoveFloors: fixture.warning.requiredMoveFloors,
      leadTicks: fixture.warning.leadTicks,
    });
    expect(RUNNER_LABORATORY_MOVEMENT_CONTRACT).toEqual({
      lanes: fixture.movement.lanes,
      laneCentersMilli: fixture.movement.laneCentersMilli,
      tweenTicks: fixture.movement.tweenTicks,
      bufferCapacity: fixture.movement.bufferCapacity,
      interpolationFormulaId: fixture.movement.interpolationFormulaId,
      movingCurrentLaneRule: fixture.movement.movingCurrentLaneRule,
      incomingStateClosure: {
        total: fixture.movement.incomingStateClosure.total,
        idle: fixture.movement.incomingStateClosure.idle,
        bufferedIdle: fixture.movement.incomingStateClosure.bufferedIdle,
        moving: fixture.movement.incomingStateClosure.moving,
        elapsedTicks: fixture.movement.incomingStateClosure.elapsedTicks,
      },
    });
    expect(RUNNER_LABORATORY_COLLISION_CONTRACT).toEqual({
      coordinateSystem: fixture.collision.coordinateSystem,
      playerXMilli: fixture.collision.playerXMilli,
      playerHalfWidthMilli: fixture.collision.playerHalfWidthMilli,
      laneHalfWidthMilli: fixture.collision.laneHalfWidthMilli,
      entityWidthMilli: fixture.collision.entityWidthMilli,
      firstHorizontalOverlapEntityCenterXMilli: fixture.collision.firstHorizontalOverlapEntityCenterXMilli,
      contactXRule: fixture.collision.contactXRule,
      laneContactBoundary: fixture.collision.laneContactBoundary,
      contactEffectSource: fixture.collision.contactEffectIdentity.source,
      contactEffectTransactionId: fixture.collision.contactEffectIdentity.transactionId,
      contactEffectChoiceCauseId: fixture.collision.contactEffectIdentity.causedByChoiceId,
      invulnerabilityTicks: fixture.collision.invulnerabilityTicks,
      safeClosedOverlapTravelMilli: fixture.collision.safeBoundary.closedOverlapTravelMilli,
      maximumSafeOffsetTicks: fixture.collision.safeBoundary.maximumOffsetTicksByDifficulty,
    });
    expect(RUNNER_LABORATORY_ENTRY_STATE_STATIC_PROJECTION).toEqual({
      runStatus: fixture.initialState.runStatus,
      stage: fixture.initialState.stage,
      simulationTick: fixture.initialState.simulationTick,
      runner: {
        motion: fixture.initialState.runner.motion,
        inputBuffer: fixture.initialState.runner.inputBuffer,
        activeEntities: fixture.initialState.runner.activeEntities,
        invulnerableUntilTick: fixture.initialState.runner.invulnerableUntilTick,
        userPaused: fixture.initialState.runner.userPaused,
      },
      recovery: fixture.initialState.recovery,
      encounter: fixture.initialState.encounter,
    });
    expect(RUNNER_LABORATORY_ENTRY_STATE_CONTRACT).toEqual(
      fixture.initialState,
    );
  });

  it("projects the five scoring entities and all four pattern templates without reinterpretation", () => {
    expect(RUNNER_LABORATORY_SCORING_ENTITY_IDS).toEqual(
      fixture.entityEffects.map((effect) => effect.entityContentId),
    );
    expect(RUNNER_LABORATORY_ENTITY_EFFECTS).toEqual(fixture.entityEffects);
    expect(RUNNER_LABORATORY_PATTERN_TEMPLATES).toEqual(fixture.patternTemplates);
  });

  it("projects marker identities plus the exact completion fact, memory, and settlement IDs", () => {
    expect(RUNNER_LABORATORY_MARKER_IDS).toEqual([
      fixture.markers.initial.contentId,
      fixture.markers.decision.contentId,
      fixture.markers.terminal.contentId,
    ]);
    expect(RUNNER_LABORATORY_MARKERS.initial).toEqual({
      contentId: fixture.markers.initial.contentId,
      patternIndex: fixture.markers.initial.patternIndex,
      representation: fixture.markers.initial.representation,
      kind: fixture.markers.initial.kind,
      slotIndex: fixture.markers.initial.slotIndex,
      lane: fixture.markers.initial.lane,
      xMilli: fixture.markers.initial.xMilli,
      widthMilli: fixture.markers.initial.widthMilli,
      collisionParticipation: fixture.markers.initial.collisionParticipation,
      storedInActiveEntities: fixture.markers.initial.storedInActiveEntities,
    });
    expect(RUNNER_LABORATORY_MARKERS.decision).toEqual({
      contentId: fixture.markers.decision.contentId,
      representation: fixture.markers.decision.representation,
      kind: fixture.markers.decision.kind,
      slotIndex: fixture.markers.decision.slotIndex,
      lane: fixture.markers.decision.lane,
      widthMilli: fixture.markers.decision.widthMilli,
      collisionParticipation: fixture.markers.decision.collisionParticipation,
      countPerPattern: fixture.markers.decision.countPerPattern,
      contactStateOnSpawn: fixture.markers.decision.contactStateOnSpawn,
      storedInActiveEntities: true,
    });
    expect(RUNNER_LABORATORY_MARKERS.terminal).toEqual({
      contentId: fixture.markers.terminal.contentId,
      patternIndex: fixture.markers.terminal.patternIndex,
      representation: fixture.markers.terminal.representation,
      kind: fixture.markers.terminal.kind,
      slotIndex: fixture.markers.terminal.slotIndex,
      lane: fixture.markers.terminal.lane,
      xMilli: fixture.markers.terminal.xMilli,
      widthMilli: fixture.markers.terminal.widthMilli,
      collisionParticipation: fixture.markers.terminal.collisionParticipation,
      storedInActiveEntities: fixture.markers.terminal.storedInActiveEntities,
    });

    expect(RUNNER_LABORATORY_COMPLETION_FACT).toEqual(fixture.completion.completionFact);
    expect(RUNNER_LABORATORY_COMPLETION_MEMORY).toEqual(fixture.completion.completionMemory);
    expect(RUNNER_LABORATORY_EFFECT_CATEGORY_IDS).toEqual([
      fixture.entityEffects[0]?.effectCategoryId,
      fixture.entityEffects[3]?.effectCategoryId,
      fixture.completion.settlement["automatic-assist"].categoryId,
    ]);
    expect(RUNNER_LABORATORY_SETTLEMENT_CONTRACT).toEqual({
      settlementId: fixture.completion.settlement.settlementId,
      tick: fixture.completion.settlement.tick,
      source: fixture.completion.settlement["automatic-assist"].source,
      automaticEffectCategoryId: fixture.completion.settlement["automatic-assist"].categoryId,
      automaticEffectOrder: fixture.completion.settlement["automatic-assist"].effectOrder,
      automaticEffectIds: Object.fromEntries(
        fixture.completion.settlement["automatic-assist"].effectIdDerivation.knownAnswers.map(
          ({ scoreId, effectId }) => [scoreId, effectId],
        ),
      ),
      zeroDeltaPolicy: fixture.completion.settlement["automatic-assist"].zeroDeltaPolicy,
    });
  });

  it("deep-freezes the complete contract graph and its canonical scoring adapter", () => {
    for (const value of [
      RUNNER_LABORATORY_CONTRACT,
      RUNNER_LABORATORY_CONTRACT.ids,
      RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorTicks,
      RUNNER_LABORATORY_STAGE_CONTRACT.categoryCounts[0],
      RUNNER_LABORATORY_PATTERN_TEMPLATES,
      RUNNER_LABORATORY_PATTERN_TEMPLATES[1]?.slots[2],
      RUNNER_LABORATORY_ENTRY_STATE_CONTRACT,
      RUNNER_LABORATORY_ENTRY_STATE_CONTRACT.effectLedger.totalsBySource.runner,
      RUNNER_LABORATORY_COMPLETION_FACT,
      RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
      RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
        "runner-lab-health-token-v1",
      ),
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }

    expect(() => {
      (RUNNER_LABORATORY_STAGE_CONTRACT.windowAnchorTicks as unknown as number[])[0] = 0;
    }).toThrow(TypeError);
    expect(() => {
      (RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID as unknown as Map<string, unknown>)
        .set("runner-lab-forged-v1", {});
    }).toThrow(TypeError);
  });

  it("creates the exact frozen entry state and validates it with only production IDs", () => {
    const state = createRunnerLaboratoryEntryState(
      "000000000000002a",
      {
        startingProfileId: "physical-head-start-v1",
        difficulty: "challenge",
        controlMode: "semantic-assist",
        identity: { gender: "female" },
        appearance: {
          heritageStyleId: "asian",
          hairStyleId: "tied-back",
          hairColorId: "black",
          clothingPaletteId: "berry",
        },
        accessibility: {
          highContrast: true,
          reducedMotion: true,
          textScale: 150,
          screenReaderAnnouncements: true,
        },
      },
    );

    expect(state).toMatchObject({
      runStatus: "active",
      difficulty: "challenge",
      controlMode: "semantic-assist",
      startingProfileId: "physical-head-start-v1",
      scores: { health: 69, happiness: 57, money: 34 },
      stage: RUNNER_LABORATORY_ENTRY_STATE_CONTRACT.stage,
      runner: {
        spawn: {
          patternIndex: 0,
          nextSpawnTick: 218,
          nextSpawnDistanceMilli: 741200,
          resolvedThroughPatternIndex: 0,
          resolvedEntityIds: [],
        },
      },
    });
    expect(Object.isFrozen(state.runner?.spawn.resolvedEntityIds)).toBe(true);
    expect(validateRunState(state, RUNNER_LABORATORY_CATALOG)).toEqual({
      ok: true,
      state,
    });
  });
});
