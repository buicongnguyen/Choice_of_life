import { RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "./catalog";
import { deriveRunIdV1 } from "./run-factory";
import type { RunStateV0 } from "./run-state-codec";
import {
  RUN_STATE_CONTENT_VERSION,
  RUN_STATE_SCHEMA_VERSION,
  STARTING_PROFILE_SCORES,
  zeroSourceTotals,
  type ResolvedConsequence,
  type RunStateV1,
  type RunnerEntity,
  type TerminalConsequence,
} from "./run-state";

export { RUN_STATE_CONTRACT_FIXTURE_CATALOG };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createShellRunStateFixture(): RunStateV1 {
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    contentVersion: RUN_STATE_CONTENT_VERSION,
    runId: deriveRunIdV1("0000000000000001", {
      startingProfileId: "steady-mix-v1",
      difficulty: "normal",
      controlMode: "manual",
      identity: { gender: "female" },
    }),
    runSeed: "0000000000000001",
    runStatus: "setup",
    difficulty: "normal",
    controlMode: "manual",
    identity: { gender: "female" },
    appearance: {
      heritageStyleId: "asian",
      hairStyleId: "short-soft",
      hairColorId: "black",
      clothingPaletteId: "sunrise",
    },
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      textScale: 100,
      screenReaderAnnouncements: false,
    },
    startingProfileId: "steady-mix-v1",
    scores: { ...STARTING_PROFILE_SCORES["steady-mix-v1"] },
    effectLedger: { recent: [], totalsBySource: zeroSourceTotals() },
    storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
    stage: {
      stageId: "setup-shell-v1",
      phase: "shell",
      ageMonths: 0,
      activeTicks: 0,
      worldDistanceMilli: 0,
      durationTicks: 0,
      settlement: null,
    },
    runner: null,
    recovery: null,
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
    simulationTick: 0,
  };
}

export function createMaximalRunStateFixture(): RunStateV1 {
  return clone(MAXIMAL_RUN_STATE_FIXTURE);
}

export function createSyntheticV0Fixture(): RunStateV0 {
  const current = createShellRunStateFixture();
  const { screenReaderAnnouncements: _removed, ...accessibility } = current.accessibility;
  return {
    ...current,
    schemaVersion: 0,
    accessibility,
  };
}

export function createEntityLimitFixture(entityCount: number): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const entities: RunnerEntity[] = Array.from({ length: entityCount }, (_, index) => ({
    instanceId: `entity-limit-${index.toString().padStart(2, "0")}`,
    contentId: index % 2 === 0 ? "runner-contract-benefit-v1" : "runner-contract-hazard-v1",
    kind: index % 2 === 0 ? "benefit" : "hazard",
    patternIndex: 7,
    slotIndex: index % 64,
    lane: (index % 3) as 0 | 1 | 2,
    xMilli: 850_000 + index * 1_000,
    widthMilli: 30_000,
    contactState: "pending",
  }));
  return {
    ...base,
    recovery: null,
    encounter: null,
    runner: base.runner === null ? null : { ...base.runner, activeEntities: entities },
  };
}

export interface NamedRunStateFixture {
  readonly id: string;
  readonly state: RunStateV1;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Fixture invariant missing: ${label}`);
  return value;
}

export function createUnresolvedRecoveryFixture(status: "offered" | "accepted"): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const runner = required(base.runner, "runner");
  const recovery = required(base.recovery, "recovery");
  return {
    ...base,
    scores: { ...base.scores, health: 0, happiness: 59 },
    effectLedger: {
      recent: base.effectLedger.recent.filter((effect) => effect.simulationTick <= recovery.startedTick),
      totalsBySource: {
        ...base.effectLedger.totalsBySource,
        choice: { ...base.effectLedger.totalsBySource.choice, happinessPositive: 0 },
        recovery: { ...base.effectLedger.totalsBySource.recovery, healthPositive: 0 },
      },
    },
    storyState: {
      ...base.storyState,
      facts: [],
      memories: [],
      conditions: [],
    },
    runner: { ...runner, invulnerableUntilTick: 4350 },
    recovery: {
      ...recovery,
      status,
      resolveTick: 4300,
      invulnerableUntilTick: 4350,
    },
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
  };
}

function createPreResolutionEncounterBase(): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const choiceEffect = required(
    base.effectLedger.recent.find((effect) => effect.transactionId === "consequence-tx-0001"),
    "choice effect",
  );
  return {
    ...base,
    scores: {
      ...base.scores,
      [choiceEffect.scoreId]: base.scores[choiceEffect.scoreId] - choiceEffect.actualDelta,
    },
    effectLedger: {
      recent: base.effectLedger.recent.filter((effect) => effect.transactionId !== "consequence-tx-0001"),
      totalsBySource: {
        ...base.effectLedger.totalsBySource,
        choice: {
          ...base.effectLedger.totalsBySource.choice,
          happinessPositive:
            base.effectLedger.totalsBySource.choice.happinessPositive - choiceEffect.actualDelta,
        },
      },
    },
    recovery: null,
    consequences: { pending: [], resolved: [], terminal: [] },
  };
}

export function createPresentingEncounterFixture(): RunStateV1 {
  const base = createPreResolutionEncounterBase();
  const runner = required(base.runner, "runner");
  const encounter = required(base.encounter, "encounter");
  const terminal: TerminalConsequence = {
    transactionId: "consequence-tx-0003",
    consequenceId: "consequence-replaced-support-v1",
    status: "expired",
    causedByChoiceId: null,
    resolution: null,
    terminalTick: 4210,
    terminalReasonId: "reason-merged-into-support-v1",
    supersededByTransactionId: null,
    acknowledgmentId: "acknowledgment-support-recap-v1",
  };
  return {
    ...base,
    storyState: {
      ...base.storyState,
      facts: base.storyState.facts.map((fact) => ({ ...fact, originChoiceId: null })),
      memories: base.storyState.memories.map((memory) => ({ ...memory, originChoiceId: null })),
      conditions: base.storyState.conditions.map((condition) => ({ ...condition, expiresTick: null, originChoiceId: null })),
    },
    runner: {
      ...runner,
      motion: { kind: "idle", currentLane: 1, sourceLane: 1, targetLane: 1, elapsedTicks: 0, totalTicks: 11 },
      inputBuffer: null,
    },
    recovery: null,
    encounter: {
      ...encounter,
      phase: "presenting",
      selectedOptionId: null,
      resolutionTransactionId: null,
      presentationPhase: "prompt",
    },
    consequences: { ...base.consequences, terminal: [terminal] },
  };
}

export function createSelectingEncounterFixture(phase: "option-selected" | "resolving"): RunStateV1 {
  const base = createPreResolutionEncounterBase();
  const runner = required(base.runner, "runner");
  const encounter = required(base.encounter, "encounter");
  return {
    ...base,
    runner: { ...runner, inputBuffer: phase === "option-selected" ? "down" : null },
    encounter: {
      ...encounter,
      phase,
      resolutionTransactionId: null,
      presentationPhase: "choices",
    },
  };
}

export function createUnpresentedResolutionFixture(): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const resolved = required(base.consequences.resolved[0], "resolved consequence");
  const unpresented: ResolvedConsequence = { ...resolved, status: "resolved", presentedTick: null };
  return { ...base, consequences: { ...base.consequences, resolved: [unpresented] } };
}

export function createSettlingRunStateFixture(): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const runner = required(base.runner, "runner");
  return {
    ...base,
    simulationTick: base.stage.durationTicks,
    stage: {
      ...base.stage,
      phase: "settling",
      activeTicks: base.stage.durationTicks,
      settlement: {
        settlementId: "settlement-runner-lab-0001",
        status: "pending",
        startedTick: base.simulationTick,
        completedTick: null,
        effectIds: [],
      },
    },
    runner: {
      ...runner,
      spawn: { ...runner.spawn, nextSpawnTick: base.stage.durationTicks + 100 },
    },
    recovery: null,
    encounter: null,
  };
}

export function createCompletedRunStateFixture(): RunStateV1 {
  const base = createShellRunStateFixture();
  return {
    ...base,
    runStatus: "completed",
    simulationTick: 1,
    stage: {
      ...base.stage,
      stageId: "runner-lab-v1",
      phase: "complete",
      activeTicks: 1,
      durationTicks: 1,
      settlement: {
        settlementId: "settlement-complete-0001",
        status: "applied",
        startedTick: 0,
        completedTick: 1,
        effectIds: [],
      },
    },
  };
}

export function createCancelledSettlementFixture(): RunStateV1 {
  const base = createMaximalRunStateFixture();
  return {
    ...base,
    stage: {
      ...base.stage,
      settlement: {
        settlementId: "settlement-cancelled-0001",
        status: "cancelled",
        startedTick: 4200,
        completedTick: 4210,
        effectIds: [],
      },
    },
  };
}

export function createCompletedConsequenceFixture(): RunStateV1 {
  const base = createMaximalRunStateFixture();
  const terminal: TerminalConsequence = {
    transactionId: "consequence-tx-0003",
    consequenceId: "consequence-replaced-support-v1",
    status: "complete",
    causedByChoiceId: null,
    resolution: {
      selectedOptionId: "option-try-alone-v1",
      appliedEffectIds: [],
      factResultIds: [],
      relationshipResultIds: [],
      scheduledConsequenceTransactionIds: [],
      resultTextInputIds: [],
      resolvedTick: 4180,
    },
    presentedTick: 4190,
    terminalTick: 4210,
    terminalReasonId: "reason-merged-into-support-v1",
    supersededByTransactionId: null,
    acknowledgmentId: null,
  };
  return { ...base, consequences: { ...base.consequences, terminal: [terminal] } };
}

export function createRunStateFixtureCorpus(): readonly NamedRunStateFixture[] {
  return [
    { id: "setup-shell", state: createShellRunStateFixture() },
    { id: "active-maximal", state: createMaximalRunStateFixture() },
    { id: "active-presenting-expired-null-origins", state: createPresentingEncounterFixture() },
    { id: "active-option-selected", state: createSelectingEncounterFixture("option-selected") },
    { id: "active-resolving", state: createSelectingEncounterFixture("resolving") },
    { id: "active-resolved-unpresented", state: createUnpresentedResolutionFixture() },
    { id: "active-recovery-offered", state: createUnresolvedRecoveryFixture("offered") },
    { id: "active-recovery-accepted", state: createUnresolvedRecoveryFixture("accepted") },
    { id: "active-cancelled-settlement", state: createCancelledSettlementFixture() },
    { id: "active-complete-consequence", state: createCompletedConsequenceFixture() },
    { id: "active-settling", state: createSettlingRunStateFixture() },
    { id: "completed-stage", state: createCompletedRunStateFixture() },
  ];
}

const MAXIMAL_RUN_STATE_FIXTURE: RunStateV1 = {
  schemaVersion: 1,
  contentVersion: "phase-1-v1",
  runId: "run-971e8b4c204ab517",
  runSeed: "000000000000002a",
  runStatus: "active",
  difficulty: "normal",
  controlMode: "semantic-assist",
  identity: { gender: "female" },
  appearance: {
    heritageStyleId: "asian",
    hairStyleId: "tied-back",
    hairColorId: "dark-brown",
    clothingPaletteId: "meadow",
  },
  accessibility: {
    highContrast: true,
    reducedMotion: true,
    textScale: 150,
    screenReaderAnnouncements: true,
  },
  startingProfileId: "steady-mix-v1",
  scores: { health: 5, happiness: 63, money: 36 },
  effectLedger: {
    recent: [
      {
        effectId: "effect-runner-0002",
        scoreId: "health",
        requestedDelta: -10,
        source: "runner",
        categoryId: "hazard-depletion-v1",
        causedByChoiceId: null,
        transactionId: null,
        before: 5,
        after: 0,
        actualDelta: -5,
        simulationTick: 4100,
      },
      {
        effectId: "effect-recovery-0003",
        scoreId: "health",
        requestedDelta: 5,
        source: "recovery",
        categoryId: "recovery-bounded-v1",
        causedByChoiceId: null,
        transactionId: "recovery-tx-0001",
        before: 0,
        after: 5,
        actualDelta: 5,
        simulationTick: 4115,
      },
      {
        effectId: "effect-choice-0001",
        scoreId: "happiness",
        requestedDelta: 4,
        source: "choice",
        categoryId: "choice-practice-v1",
        causedByChoiceId: "choice-ask-for-help-v1",
        transactionId: "consequence-tx-0001",
        before: 59,
        after: 63,
        actualDelta: 4,
        simulationTick: 4200,
      },
    ],
    totalsBySource: {
      runner: { healthPositive: 0, healthNegative: 65, happinessPositive: 1, happinessNegative: 2, moneyPositive: 0, moneyNegative: 0 },
      choice: { healthPositive: 0, healthNegative: 0, happinessPositive: 4, happinessNegative: 0, moneyPositive: 1, moneyNegative: 0 },
      callback: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
      settlement: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
      recovery: { healthPositive: 5, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
      system: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
    },
  },
  storyState: {
    facts: [{ factId: "fact-asked-for-help-v1", kind: "care", valueId: "value-trust-support-v1", originChoiceId: "choice-ask-for-help-v1" }],
    memories: [{ memoryId: "memory-first-support-v1", kind: "relationship", stageId: "runner-lab-v1", summary: "You practiced asking for support.", originChoiceId: "choice-ask-for-help-v1" }],
    credentials: [{ credentialId: "credential-practice-v1", kind: "training", level: 1, earnedStageId: "runner-lab-v1" }],
    relationships: [{ relationshipId: "relationship-caregiver-0001", personId: "person-caregiver-a-v1", kind: "caregiver", closeness: 72, status: "active" }],
    conditions: [{ conditionId: "condition-supported-v1", kind: "support", severity: 2, startedTick: 4200, expiresTick: 5200, originChoiceId: "choice-ask-for-help-v1" }],
  },
  stage: {
    stageId: "runner-lab-v1",
    phase: "active",
    ageMonths: 216,
    activeTicks: 4000,
    worldDistanceMilli: 845_000,
    durationTicks: 4500,
    settlement: null,
  },
  runner: {
    motion: { kind: "moving", currentLane: 1, sourceLane: 1, targetLane: 2, elapsedTicks: 4, totalTicks: 11 },
    inputBuffer: "up",
    spawn: {
      patternIndex: 7,
      nextSpawnDistanceMilli: 870_000,
      nextSpawnTick: 4300,
      resolvedThroughPatternIndex: 6,
      resolvedEntityIds: ["entity-pattern-7-slot-2"],
    },
    activeEntities: [
      { instanceId: "entity-pattern-7-slot-0", contentId: "runner-contract-hazard-v1", kind: "hazard", patternIndex: 7, slotIndex: 0, lane: 0, xMilli: 852_000, widthMilli: 36_000, contactState: "contacted" },
      { instanceId: "entity-pattern-7-slot-1", contentId: "runner-contract-benefit-v1", kind: "benefit", patternIndex: 7, slotIndex: 1, lane: 2, xMilli: 866_000, widthMilli: 34_000, contactState: "pending" },
    ],
    invulnerableUntilTick: 4140,
    userPaused: false,
  },
  recovery: {
    transactionId: "recovery-tx-0001",
    status: "cooldown",
    triggerEntityInstanceId: "entity-pattern-7-slot-0",
    preTriggerScores: { health: 5, happiness: 59, money: 36 },
    recoveryTarget: 8,
    targetScores: { health: 5, happiness: 59, money: 36 },
    startedTick: 4100,
    resolveTick: 4115,
    invulnerableUntilTick: 4140,
    cooldownUntilTick: 4500,
  },
  encounter: {
    transactionId: "consequence-tx-0001",
    encounterId: "encounter-practice-help-v1",
    kind: "caregiver",
    phase: "resolved",
    optionIds: ["option-ask-for-help-v1", "option-try-alone-v1"],
    selectedOptionId: "option-ask-for-help-v1",
    resolutionTransactionId: "consequence-tx-0001",
    presentationPhase: "reaction",
  },
  consequences: {
    pending: [{
      transactionId: "consequence-tx-0002",
      consequenceId: "consequence-support-callback-v1",
      status: "pending",
      causedByChoiceId: "choice-ask-for-help-v1",
      dueStageId: "newborn-v1",
      dueTick: 5000,
      effectIds: ["effect-callback-0004"],
    }],
    resolved: [{
      transactionId: "consequence-tx-0001",
      consequenceId: "consequence-practice-result-v1",
      status: "presented",
      causedByChoiceId: "choice-ask-for-help-v1",
      resolution: {
        selectedOptionId: "option-ask-for-help-v1",
        appliedEffectIds: ["effect-choice-0001"],
        factResultIds: ["fact-asked-for-help-v1"],
        relationshipResultIds: ["relationship-caregiver-0001"],
        scheduledConsequenceTransactionIds: ["consequence-tx-0002"],
        resultTextInputIds: ["text-input-support-v1"],
        resolvedTick: 4200,
      },
      presentedTick: 4210,
    }],
    terminal: [{
      transactionId: "consequence-tx-0003",
      consequenceId: "consequence-replaced-support-v1",
      status: "superseded",
      causedByChoiceId: "choice-ask-for-help-v1",
      resolution: null,
      terminalTick: 4210,
      terminalReasonId: "reason-merged-into-support-v1",
      supersededByTransactionId: "consequence-tx-0002",
      acknowledgmentId: "acknowledgment-support-recap-v1",
    }],
  },
  simulationTick: 4242,
};
