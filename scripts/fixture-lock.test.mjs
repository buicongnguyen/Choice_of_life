import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  evaluationSourceSha256,
  validateCommittedFixturePreregistration,
  validateActiveSuiteExecution,
  validateContentLock,
  validateContentLockCollection,
  validateContentLockSuiteEvidence,
  validateFixtureLocks,
  validateFixturePreregistration,
  validatePhase3PreregistrationFixture,
  validateRegistryObject,
  validateRunnerEvidence,
  validateRunnerFixture,
  verifyAdditiveLockManifests,
  verifyCorrectionLockManifest,
  verifyGitAdditiveManifestBundles,
  verifyGitLockedPaths,
  verifyHistoricalAdditiveManifestPaths,
  verifyHistoricalContentLockPaths,
  verifyLockManifest,
  verifyLockManifestChain,
} from "./fixture-lock.mjs";

const execFileAsync = promisify(execFile);

const registry = JSON.parse(
  await readFile(new URL("../docs/balance/fixture-registry-v1.json", import.meta.url), "utf8")
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function initialiseGitRepository(root) {
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Fixture Lock Test"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "fixture-lock@example.invalid"], { cwd: root });
}

async function commitAll(root, message) {
  await execFileAsync("git", ["add", "-A"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", message], { cwd: root });
}

async function copyDocsWithoutContentLocks(root) {
  await cp(new URL("../docs", import.meta.url), path.join(root, "docs"), { recursive: true });
  await rm(path.join(root, "docs", "balance", "locks"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "balance", "evaluation-results"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "balance", "runner-evaluation-results"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "balance", "runner-fixtures"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "balance", "runner-fixture-v1.schema.json"), { force: true });
  await rm(path.join(root, "docs", "balance", "newborn-fixtures"), { recursive: true, force: true });
  await rm(path.join(root, "docs", "balance", "newborn-fixture-v1.schema.json"), { force: true });
  for (let phase = 2; phase <= 11; phase += 1) {
    await rm(path.join(root, "docs", "phase-specs", `phase-${phase}.md`), { force: true });
    await rm(path.join(root, "docs", "phase-specs", `phase-${phase}-lock-manifest.json`), { force: true });
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validContentLock() {
  return {
    $schema: "../content-lock-v1.schema.json",
    schemaVersion: 1,
    lockId: "runner-lab-content-lock-v1",
    status: "locked",
    registry: {
      registryId: "choice-of-life-balance-v1",
      registrySha256: "103bab03ba62e1619f9e745164135e067d41563f87090222cd5cc65e89454af5",
      registrySchemaSha256: "77596ffc1367560dd0a01b6071c319021bccac84a52d3d7c8e86b9f39bc30d0e",
    },
    commitProtocol: {
      docsOnly: true,
      precedesContentEffectsAndTuning: true,
      lockCommitRecordedInPhaseReview: true,
      lockedInstanceIsByteImmutable: true,
    },
    content: {
      contentVersion: "runner-lab-v1",
      phaseId: "phase-2",
      stageIds: ["runner-lab-v1"],
      contextIds: ["runner-lab-context-v1"],
      patternIds: ["runner-lab-pattern-v1"],
      choiceIds: [],
      optionIds: [],
      callbackIds: [],
      careerOfferIds: [],
      evidenceIds: [],
      comparatorIds: [],
    },
    horizon: {
      horizonId: "playable-slice-v1",
      startStageId: "runner-lab-v1",
      endStageId: "runner-lab-v1",
      includedCallbackIds: [],
    },
    evaluation: {
      suiteIds: ["attribution-v1"],
      assertionIds: ["runner-share-bounds-v1", "decision-share-minimum-v1"],
      runnerPolicyIds: ["runner-manual-neutral-v1"],
      choicePolicyIds: [
        "choice-health-first-v1",
        "choice-happiness-first-v1",
        "choice-security-first-v1",
        "choice-balanced-v1",
        "choice-learning-v1",
        "choice-care-v1",
        "choice-community-v1",
        "choice-autonomy-v1",
      ],
      comparatorIds: [],
      narrativeGoalMappings: [],
      contentThresholds: [],
    },
    expectedDirectionalResults: [
      {
        id: "runner-lab-direction-v1",
        contextId: "runner-lab-context-v1",
        policyAId: "runner-manual-neutral-v1",
        policyBId: "choice-balanced-v1",
        assertionId: "runner-share-bounds-v1",
        comparator: "not-equal",
      },
    ],
    supersession: { supersedesLockId: null, reason: null, newlyRealizedCallbackIds: [] },
    review: {
      designReason: "Lock the runner laboratory evaluation before effect tuning.",
      observedFailureIsNotSoleReason: true,
      independentLogicReviewRequired: true,
      inclusivityReviewRequired: true,
    },
  };
}

function phase2ContentLock() {
  const lock = validContentLock();
  lock.lockId = "runner-laboratory-content-lock-v1";
  lock.content = {
    contentVersion: "phase-1-v1",
    phaseId: "phase-2",
    stageIds: ["runner-lab-v1"],
    contextIds: ["runner-laboratory-slice-v1"],
    patternIds: [
      "runner-lab-benefit-fork-v1",
      "runner-lab-risk-reward-v1",
      "runner-lab-avoid-only-v1",
      "runner-lab-quiet-window-v1",
    ],
    choiceIds: [],
    optionIds: [],
    callbackIds: [],
    careerOfferIds: [],
    evidenceIds: [
      "evidence-runner-reachability-v1",
      "evidence-runner-replay-v1",
      "evidence-runner-assist-v1",
      "evidence-runner-accessibility-v1",
      "evidence-runner-completion-fact-v1",
      "evidence-runner-completion-memory-v1",
      "evidence-runner-appearance-invariance-v1",
    ],
    comparatorIds: [],
  };
  lock.evaluation = {
    suiteIds: ["assist-parity-v1"],
    assertionIds: [
      "semantic-assist-effect-identity-v1",
      "automatic-assist-score-parity-v1",
      "assist-narrative-parity-v1",
    ],
    runnerPolicyIds: [
      "runner-manual-neutral-v1",
      "runner-semantic-assist-neutral-v1",
      "runner-automatic-assist-neutral-v1",
    ],
    choicePolicyIds: ["choice-balanced-v1"],
    comparatorIds: [],
    narrativeGoalMappings: [],
    contentThresholds: [
      {
        id: "runner-lab-semantic-effect-distance-max-v1",
        assertionId: "semantic-assist-effect-identity-v1",
        comparator: "=",
        value: { numerator: 0, denominator: 1 },
      },
      {
        id: "runner-lab-automatic-score-distance-max-v1",
        assertionId: "automatic-assist-score-parity-v1",
        comparator: "<=",
        value: { numerator: 3, denominator: 1 },
      },
      {
        id: "runner-lab-narrative-mismatch-max-v1",
        assertionId: "assist-narrative-parity-v1",
        comparator: "=",
        value: { numerator: 0, denominator: 1 },
      },
    ],
  };
  lock.expectedDirectionalResults = [
    {
      id: "runner-lab-semantic-manual-identity-v1",
      contextId: "runner-laboratory-slice-v1",
      policyAId: "runner-manual-neutral-v1",
      policyBId: "runner-semantic-assist-neutral-v1",
      assertionId: "semantic-assist-effect-identity-v1",
      comparator: "=",
    },
    {
      id: "runner-lab-automatic-manual-score-parity-v1",
      contextId: "runner-laboratory-slice-v1",
      policyAId: "runner-manual-neutral-v1",
      policyBId: "runner-automatic-assist-neutral-v1",
      assertionId: "automatic-assist-score-parity-v1",
      comparator: "<=",
    },
    {
      id: "runner-lab-automatic-manual-narrative-identity-v1",
      contextId: "runner-laboratory-slice-v1",
      policyAId: "runner-manual-neutral-v1",
      policyBId: "runner-automatic-assist-neutral-v1",
      assertionId: "assist-narrative-parity-v1",
      comparator: "=",
    },
  ];
  lock.review.designReason = "Lock the complete runner laboratory population and Assist gates before production tuning.";
  return lock;
}

function validRunnerFixture() {
  const assistAssertionIds = [
    "semantic-assist-effect-identity-v1",
    "automatic-assist-score-parity-v1",
    "assist-narrative-parity-v1",
  ];
  const groupCountsByAssertionId = {
    "runner-appearance-invariance-v1": { witnessSeedCount: 3, profileCount: 4, difficultyCount: 3, appearanceSelectionCount: 512 },
    "runner-completion-memory-parity-v1": { seedCount: 10000, profileCount: 4, difficultyCount: 3, pairedEntryCount: 120000 },
    "runner-simultaneous-contact-order-v1": { permutationCount: 6 },
    "runner-semantic-choice-and-reload-identity-v1": { decisionEntries: 1080, pauseGuardEntries: 4, totalEntries: 1084 },
    "runner-automatic-no-input-completion-v1": { seedCount: 10000, profileCount: 4, difficultyCount: 3, totalEntries: 120000 },
    "runner-reduced-motion-domain-identity-v1": { savedPreferenceEntries: 120000, osPreferenceEntries: 120000, totalEntries: 240000 },
    "runner-accessibility-browser-matrix-v1": { completionReflow: 40, presentation: 72, safeAreaOneHand: 8, focus: 10, announcements: 9, total: 139 },
  };
  const assertion = (assertionId, population) => ({
    assertionId,
    population,
    groupCounts: groupCountsByAssertionId[assertionId] ?? {},
  });
  const optionalKnownAnswers = [
    ["0000000000000000", "story", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1"]],
    ["0000000000000000", "normal", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1"]],
    ["0000000000000000", "challenge", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1", "7:avoid-secondary-hazard-v1", "8:risk-reward-secondary-v1"]],
    ["0000000000000001", "story", ["6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1"]],
    ["0000000000000001", "normal", ["5:risk-reward-secondary-v1", "6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1"]],
    ["0000000000000001", "challenge", ["3:risk-reward-secondary-v1", "5:risk-reward-secondary-v1", "6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1", "9:avoid-secondary-hazard-v1"]],
    ["000000000000270f", "story", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "7:risk-reward-secondary-v1"]],
    ["000000000000270f", "normal", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "4:risk-reward-secondary-v1", "7:risk-reward-secondary-v1"]],
    ["000000000000270f", "challenge", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "4:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1", "7:risk-reward-secondary-v1"]],
  ].map(([runSeed, difficulty, includedPatternGroups]) => ({ runSeed, difficulty, includedPatternGroups }));
  const spawnCursors = [
    {
      difficulty: "story",
      spawnTicks: [208, 458, 708, 958, 1208, 1458, 1708, 1958, 2208, 2458],
      nextSpawnDistancesMilli: [540800, 1190800, 1840800, 2490800, 3140800, 3790800, 4440800, 5090800, 5740800, 6390800],
    },
    {
      difficulty: "normal",
      spawnTicks: [218, 468, 718, 968, 1218, 1468, 1718, 1968, 2218, 2468],
      nextSpawnDistancesMilli: [654000, 1404000, 2154000, 2904000, 3654000, 4404000, 5154000, 5904000, 6654000, 7404000],
    },
    {
      difficulty: "challenge",
      spawnTicks: [218, 468, 718, 968, 1218, 1468, 1718, 1968, 2218, 2468],
      nextSpawnDistancesMilli: [741200, 1591200, 2441200, 3291200, 4141200, 4991200, 5841200, 6691200, 7541200, 8391200],
    },
  ];
  return {
    $schema: "../runner-fixture-v1.schema.json",
    schemaVersion: 1,
    fixtureId: "runner-laboratory-fixture-v1",
    status: "locked",
    phaseId: "phase-2",
    contentLockId: "runner-laboratory-content-lock-v1",
    runtimeContentVersion: "phase-1-v1",
    evaluatorId: "runner-laboratory-evaluator-v1",
    population: {
      seedSetId: "balance-seeds-0-9999-v1",
      start: 0,
      endInclusive: 9999,
      step: 1,
      count: 10000,
      firstEncodedSeed: "0000000000000000",
      lastEncodedSeed: "000000000000270f",
      profileIds: registry.startingProfiles.map(({ id }) => id),
      difficulties: [...registry.difficulties],
    },
    stage: {
      stageIds: ["runner-lab-v1"],
      patternIds: [
        "runner-lab-benefit-fork-v1",
        "runner-lab-risk-reward-v1",
        "runner-lab-avoid-only-v1",
        "runner-lab-quiet-window-v1",
      ],
      durationTicks: 3000,
      decisionWindowCount: 10,
      categoryCounts: [
        { patternId: "runner-lab-benefit-fork-v1", count: 4 },
        { patternId: "runner-lab-risk-reward-v1", count: 3 },
        { patternId: "runner-lab-avoid-only-v1", count: 2 },
        { patternId: "runner-lab-quiet-window-v1", count: 1 },
      ],
      rollingHorizonPatterns: 3,
      firstWindowAnchorTick: 300,
      windowAnchorSpacingTicks: 250,
      lastWindowAnchorTick: 2550,
      latestContactOffsetTicks: 18,
      latestPossibleContactTick: 2568,
      tickDurationMs: 20,
      standalonePractice: true,
    },
    generator: {
      algorithmId: "runner-laboratory-generator-v1",
      permutationAlgorithm: "pattern-entropy-decorate-sort-v1",
      permutationTokenDerivation: "pattern-entropy-fnv1a32-v1(runSeed,stageId,initialPatternIndex+copyOrdinal,sequence-order)",
      copyOrdinalDomain: "global-multiset-index-0-through-9",
      permutationRank: "uint32-ascending",
      permutationTieBreak: ["template-index-ascending", "copy-index-ascending"],
      permutationKnownAnswerTestsRequired: true,
      copyOrdinalMapping: [
        [0, 0, 0, "runner-lab-benefit-fork-v1"],
        [1, 0, 1, "runner-lab-benefit-fork-v1"],
        [2, 0, 2, "runner-lab-benefit-fork-v1"],
        [3, 0, 3, "runner-lab-benefit-fork-v1"],
        [4, 1, 0, "runner-lab-risk-reward-v1"],
        [5, 1, 1, "runner-lab-risk-reward-v1"],
        [6, 1, 2, "runner-lab-risk-reward-v1"],
        [7, 2, 0, "runner-lab-avoid-only-v1"],
        [8, 2, 1, "runner-lab-avoid-only-v1"],
        [9, 3, 0, "runner-lab-quiet-window-v1"],
      ].map(([copyOrdinal, templateIndex, copyIndex, patternId]) => ({ copyOrdinal, templateIndex, copyIndex, patternId })),
      knownAnswers: [
        {
          runSeed: "0000000000000000",
          course: [
            ["runner-lab-quiet-window-v1", 0], ["runner-lab-risk-reward-v1", 1],
            ["runner-lab-risk-reward-v1", 1], ["runner-lab-benefit-fork-v1", 0],
            ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 0],
            ["runner-lab-avoid-only-v1", 1], ["runner-lab-risk-reward-v1", 2],
            ["runner-lab-benefit-fork-v1", 2], ["runner-lab-benefit-fork-v1", 2],
          ].map(([patternId, rotation]) => ({ patternId, rotation })),
        },
        {
          runSeed: "0000000000000001",
          course: [
            ["runner-lab-benefit-fork-v1", 1], ["runner-lab-benefit-fork-v1", 0],
            ["runner-lab-risk-reward-v1", 0], ["runner-lab-quiet-window-v1", 0],
            ["runner-lab-risk-reward-v1", 2], ["runner-lab-risk-reward-v1", 1],
            ["runner-lab-avoid-only-v1", 2], ["runner-lab-benefit-fork-v1", 2],
            ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 2],
          ].map(([patternId, rotation]) => ({ patternId, rotation })),
        },
        {
          runSeed: "000000000000270f",
          course: [
            ["runner-lab-avoid-only-v1", 0], ["runner-lab-risk-reward-v1", 0],
            ["runner-lab-benefit-fork-v1", 1], ["runner-lab-risk-reward-v1", 2],
            ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 0],
            ["runner-lab-risk-reward-v1", 2], ["runner-lab-quiet-window-v1", 0],
            ["runner-lab-benefit-fork-v1", 2], ["runner-lab-benefit-fork-v1", 2],
          ].map(([patternId, rotation]) => ({ patternId, rotation })),
        },
      ],
      laneRotationSelection: "legal-rotations[floor(uint32-lane-rotation-times-length-div-2^32)]",
      deterministic: true,
      rerollAllowed: false,
      entropyInputs: ["runSeed", "stageId", "patternIndex", "entropyChannel"],
      entropyChannels: [
        "sequence-order",
        "lane-rotation",
        "optional-variant-risk-reward-secondary-v1",
        "optional-variant-avoid-secondary-hazard-v1",
      ],
      canonicalEntityOrder: ["patternIndex", "slotIndex", "instanceId"],
      coursePatternIndexStart: 1,
      initialPatternIndex: 0,
      initialResolvedThroughPatternIndex: 0,
      terminalPatternIndex: 11,
      spawnTickDerivation: "window-anchor-minus-difficulty-lead-ticks",
      newlySpawnedEntitiesAdvanceOnSpawnTick: false,
      spawnCursorSemantics: {
        nonterminalDistanceDerivation: "world-speed-milli-per-tick-times-next-spawn-tick",
        triggerPredicate: "simulation-tick-gte-next-spawn-tick-and-world-distance-gte-next-spawn-distance",
        triggerEvaluationBoundary: "post-transition-new-state-boundary-after-input-motion-tick-world-old-entity-advance-collision-and-terminalization-before-next-tick-input",
        cursorValuesByDifficulty: spawnCursors,
        immediateAppendOrder: [
          "append-canonical-pattern-entities",
          "set-pattern-index-to-greatest-appended-course-index",
          "set-next-spawn-tick-and-distance-to-following-cursor",
          "canonicalize-active-entities",
          "open-semantic-assist-prompt-and-add-pause-when-applicable",
          "save-durable-post-append-checkpoint",
        ],
        durableCheckpointSemantics: {
          countPerSpawnBoundary: 1,
          boundary: "after-applicable-semantic-prompt-is-derived-from-pending-marker-and-before-next-tick-input",
          reloadRule: "rederive-identical-semantic-prompt-from-persisted-pending-marker",
        },
        patternIndexSemantics: "greatest-appended-course-index-then-11-for-terminal-sentinel",
        resolvedThroughPatternIndexSemantics: "sentinel-0-at-entry-then-greatest-consecutive-course-pattern-with-marker-and-every-included-slot-terminal",
        resolvedThroughAdvanceBoundary: "after-canonical-terminal-resolution-of-that-pattern",
      },
      nextSpawnSentinel: {
        tick: 3001,
        distanceMilliByDifficulty: { story: 7802600, normal: 9003000, challenge: 10203400 },
        postLastPolicy: "retain-terminal-sentinel",
      },
      optionalInclusion: {
        appliesTo: "optional-group-id",
        tokenDerivation: "pattern-entropy-fnv1a32-v1(runSeed,stageId,patternIndex,optional-variant-then-group-id)",
        channelDerivation: "optional-variant-<optionalGroupId>",
        scale: 100,
        rule: "floor-uint32-times-100-div-2^32-strictly-less-than-optional-density",
        groupAtomic: true,
        knownAnswers: optionalKnownAnswers,
      },
      maxLiveInteractiveEntities: 24,
    },
    movement: {
      lanes: [0, 1, 2],
      laneCentersMilli: [0, 1000, 2000],
      tweenTicks: 11,
      bufferCapacity: 1,
      interpolationFormulaId: "source-plus-rounded-delta-times-elapsed-over-11-v1",
      movingCurrentLaneRule: "source-until-completion-then-target",
      laneRoleModuloMapping: {
        "rotation-origin": "rotation-mod-3",
        "rotation-next": "rotation-plus-1-mod-3",
        "rotation-previous": "rotation-plus-2-mod-3",
      },
      incomingStateClosure: {
        total: 107,
        idle: 7,
        bufferedIdle: 4,
        moving: 100,
        elapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        bufferedHandoffCompletionState: "idle-at-first-target",
        bufferedHandoffNextTickState: "moving-to-buffered-target-elapsed-1",
      },
    },
    warning: {
      baseReactionTicks: 38,
      requiredMoveFloors: [
        { requiredMoves: 0, minWarningTicks: 38 },
        { requiredMoves: 1, minWarningTicks: 50 },
        { requiredMoves: 2, minWarningTicks: 60 },
      ],
      leadTicks: { story: 92, normal: 82, challenge: 82 },
      remainingMotionComputation: "exact-from-visible-interpolation-and-buffer",
    },
    difficultyProfiles: [
      { difficulty: "story", worldSpeedMilliPerTick: 2600, optionalDensity: 50, variantId: "runner-lab-story-variant-v1", durationTicks: 3000 },
      { difficulty: "normal", worldSpeedMilliPerTick: 3000, optionalDensity: 75, variantId: "runner-lab-normal-variant-v1", durationTicks: 3000 },
      { difficulty: "challenge", worldSpeedMilliPerTick: 3400, optionalDensity: 100, variantId: "runner-lab-challenge-variant-v1", durationTicks: 3000 },
    ],
    collision: {
      coordinateSystem: "integer-fixed-point",
      playerXMilli: 180000,
      playerHalfWidthMilli: 18000,
      laneHalfWidthMilli: 300,
      entityWidthMilli: 34000,
      contactXRule: "closed-interval-overlap-v1",
      laneContactRule: "absolute-player-lane-position-minus-entity-lane-center-lte-lane-half-width",
      laneContactBoundary: "closed",
      contactTickMeaning: "first-closed-horizontal-overlap-and-earliest-full-contact-for-lane-aligned-player",
      firstHorizontalOverlapEntityCenterXMilli: 215000,
      spawnXDerivation: "215000-plus-world-speed-times-difficulty-lead-plus-contact-offset-ticks",
      playerGeometryInvariant: true,
      hitboxNarrowerThanVisual: true,
      contactResolution: "at-most-once",
      negativeContactProofRequired: true,
      invulnerabilityTicks: 25,
      invulnerabilityInterval: "[contactTick,contactTick+25)",
      contactEffectIdentity: {
        entityInstanceIdGrammar: "entity-<16-lowercase-hex>",
        effectIdDerivation: "effect-<same-16-lowercase-hex>",
        source: "runner",
        transactionId: null,
        causedByChoiceId: null,
        simulationTick: "authoritative-contact-tick",
      },
      invulnerabilityByMode: {
        manual: "negative-authoritative-contact-sets-half-open-interval-overlap-hazards-pass-without-effect-benefits-apply",
        "semantic-assist": "negative-authoritative-contact-sets-half-open-interval-overlap-hazards-pass-without-effect-benefits-apply",
        "automatic-assist": "all-contacts-pass-nonauthoritative-no-contact-effects-no-future-invulnerability",
      },
      recoveryNullFutureInvulnerabilityRule: {
        scope: {
          runStatus: "active",
          stageId: "runner-lab-v1",
          stagePhase: "active",
          recovery: null,
        },
        allowedOnlyWhen: "the-most-recent-negative-runner-effect-and-its-contacted-resolved-hazard-entity-prove-the-current-half-open-invulnerability-window",
        proof: {
          entityContentIds: ["runner-lab-clutter-hazard-v1", "runner-lab-pressure-hazard-v1"],
          entityKind: "hazard",
          effectCategoryId: "runner-hazard-v1",
          effectSource: "runner",
          effectSelectionRule: "greatest-simulation-tick-then-greatest-recent-ledger-index-among-negative-runner-effects",
          effectMustBeMostRecentNegativeRunnerEffect: true,
          entityContactStateAtResolution: "contacted",
          entityInstanceIdMustAppearInResolvedEntityIds: true,
          entityToEffectLink: "effectId-is-exactly-effect-prefix-plus-the-contacted-entity-instance-id-hex-suffix",
          actualDeltaRule: "strictly-negative",
          tickRule: "effect-simulation-tick-lte-current-tick-lt-effect-simulation-tick-plus-25",
          invulnerableUntilTickRule: "equals-effect-simulation-tick-plus-25",
        },
        phase1SemanticsOutsideScope: "unchanged-recovery-required-for-future-invulnerability",
      },
      simultaneousContactOrderWitness: {
        witnessType: "nonpersisted-production-collision-primitive-unit-witness",
        runSeed: "0000000000000000",
        difficulty: "challenge",
        stageId: "runner-lab-v1",
        tick: 500,
        startingScores: { health: 50, happiness: 50, money: 50 },
        generatedCoordinatePremise: {
          patternIndex: 8,
          patternId: "runner-lab-risk-reward-v1",
          rotation: 2,
          optionalGroupId: "risk-reward-secondary-v1",
          optionalGroupIncluded: true,
          slotZero: {
            slotIndex: 0,
            instanceId: "entity-1cd2eb9e83a7722e",
            lifecycle: "already-terminal-before-synthetic-candidate-batch",
          },
        },
        syntheticContactQualification: {
          productionSeam: "canonical-contact-candidate-resolution-v1",
          contactQualificationOverride: "fixture-only-bypass-x-lane-and-contact-timing-after-valid-coordinate-identity-check",
          persistedRunStateAllowed: false,
        },
        entities: [
          { patternIndex: 8, slotIndex: 1, instanceId: "entity-22ff92fcaa2e78c3", contentId: "runner-lab-clutter-hazard-v1" },
          { patternIndex: 8, slotIndex: 2, instanceId: "entity-e312494944488c11", contentId: "runner-lab-happiness-token-v1" },
          { patternIndex: 8, slotIndex: 3, instanceId: "entity-6e72eeaf4d10d1ad", contentId: "runner-lab-pressure-hazard-v1" },
        ],
        preexistingResolvedEntityIds: ["entity-1cd2eb9e83a7722e"],
        inputPermutationCount: 6,
        canonicalCoordinateOrder: ["patternIndex", "slotIndex", "instanceId"],
        expectedEffectOrder: [
          "effect-22ff92fcaa2e78c3",
          "effect-e312494944488c11",
        ],
        expectedSuppressedEntityIds: ["entity-6e72eeaf4d10d1ad"],
        expectedNewlyResolvedEntityIds: ["entity-22ff92fcaa2e78c3", "entity-6e72eeaf4d10d1ad", "entity-e312494944488c11"],
        expectedFinalResolvedEntityIds: [
          "entity-1cd2eb9e83a7722e", "entity-22ff92fcaa2e78c3", "entity-6e72eeaf4d10d1ad", "entity-e312494944488c11",
        ],
        expectedFinalScores: { health: 49, happiness: 51, money: 50 },
        expectedInvulnerableUntilTick: 525,
        allSixInputPermutationsMustMatchExpectedProjection: true,
        canonicalBatchResultHashRule: "sha256-of-closed-batch-result-projection-must-be-identical-across-all-six-input-permutations",
        equivalentFinalProjection: [
          "batchResultSha256", "scores", "effectIds", "newlyResolvedEntityIds", "finalResolvedEntityIds", "invulnerableUntilTick",
        ],
      },
      safeBoundary: {
        closedOverlapTravelMilli: 70000,
        firstSafeTickFormula: "window-anchor-plus-contact-offset-plus-floor-70000-div-world-speed-plus-1",
        maximumOffsetTicksByDifficulty: { story: 45, normal: 42, challenge: 39 },
        quietWindowSafeTick: "window-anchor-tick",
        contactedEntitiesTerminalizeImmediately: true,
        uncontactedEntitiesPassAtFirstSafeTick: true,
        terminalEntitiesRemovedAndIdsRecorded: "end-of-terminal-tick-canonical-order",
        manualDecisionMarkerPasses: "pattern-first-safe-tick-after-latest-included-slot-or-anchor-for-quiet",
      },
    },
    entityEffects: [
      { entityContentId: "runner-lab-health-token-v1", kind: "benefit", scoreId: "health", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
      { entityContentId: "runner-lab-happiness-token-v1", kind: "benefit", scoreId: "happiness", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
      { entityContentId: "runner-lab-money-token-v1", kind: "benefit", scoreId: "money", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
      { entityContentId: "runner-lab-clutter-hazard-v1", kind: "hazard", scoreId: "health", requestedDelta: -1, effectCategoryId: "runner-hazard-v1" },
      { entityContentId: "runner-lab-pressure-hazard-v1", kind: "hazard", scoreId: "happiness", requestedDelta: -1, effectCategoryId: "runner-hazard-v1" },
    ],
    patternTemplates: [
      {
        patternId: "runner-lab-benefit-fork-v1",
        category: "benefit-fork",
        occurrenceCount: 4,
        legalRotations: [0, 1, 2],
        slots: [
          { slotIndex: 0, entityContentId: "runner-lab-health-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
          { slotIndex: 1, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
          { slotIndex: 2, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
        ],
      },
      {
        patternId: "runner-lab-risk-reward-v1",
        category: "risk-reward",
        occurrenceCount: 3,
        legalRotations: [0, 1, 2],
        slots: [
          { slotIndex: 0, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
          { slotIndex: 1, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 18, optional: false, optionalGroupId: null },
          { slotIndex: 2, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
          { slotIndex: 3, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
        ],
      },
      {
        patternId: "runner-lab-avoid-only-v1",
        category: "avoid-only",
        occurrenceCount: 2,
        legalRotations: [0, 1, 2],
        slots: [
          { slotIndex: 0, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
          { slotIndex: 1, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "avoid-secondary-hazard-v1" },
        ],
      },
      {
        patternId: "runner-lab-quiet-window-v1",
        category: "quiet-window",
        occurrenceCount: 1,
        legalRotations: [0],
        slots: [],
      },
    ],
    markers: {
      initial: {
        contentId: "runner-lab-start-marker-v1",
        patternIndex: 0,
        representation: "resolved-id-sentinel",
        storedInActiveEntities: false,
        kind: "opportunity",
        slotIndex: 63,
        lane: 1,
        xMilli: 215000,
        widthMilli: 1,
        collisionParticipation: "none",
        instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
        resolvedEntityIdRecorded: true,
        acknowledgementRepresentation: "implicit-unresolved-by-id-absence-resolved-by-id-presence",
        lifecycle: "resolved-before-first-active-tick",
      },
      terminal: {
        contentId: "runner-lab-finish-marker-v1",
        patternIndex: 11,
        representation: "resolved-id-sentinel",
        storedInActiveEntities: false,
        kind: "opportunity",
        slotIndex: 63,
        lane: 1,
        xMilli: 215000,
        widthMilli: 1,
        collisionParticipation: "none",
        instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
        resolvedEntityIdRecorded: true,
        acknowledgementRepresentation: "implicit-unresolved-by-id-absence-resolved-by-id-presence",
        lifecycle: "resolves-on-terminal-active-tick",
      },
      decision: {
        contentId: "runner-lab-decision-marker-v1",
        representation: "runner-entity",
        kind: "opportunity",
        slotIndex: 63,
        lane: 1,
        widthMilli: 1,
        contactStateOnSpawn: "pending",
        collisionParticipation: "none",
        resolutionOwner: "assist-boundary",
        manualPassBoundary: "pattern-first-safe-tick-after-latest-included-slot-or-anchor-for-quiet",
        countPerPattern: 1,
        instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
        spawnXDerivation: "215000-plus-world-speed-times-difficulty-lead-ticks",
        resolvedEntityIdRecorded: true,
        terminalLifecycleByMode: {
          manual: "passed-at-window-safe-boundary",
          "automatic-assist": "pending-at-spawn-checkpoint-then-resolved-in-next-ordinary-tick-atomic-commit",
          "semantic-assist": "resolved-before-unpause-in-atomic-selection-commit",
        },
        semanticAcknowledgementLifecycle: "derive-from-retained-resolved-marker-id-until-next-marker-or-completion-memory",
      },
      resolvedEntityIdRetention: {
        policy: "retain-all-until-stage-completion",
        maximumIds: 40,
        compaction: "none",
        ordering: "lexicographic-ascending-after-every-mutation",
        codecRejectsNoncanonicalOrder: true,
        supports: ["invulnerability-owner-proof", "semantic-acknowledgement-derivation"],
      },
    },
    completion: {
      standalonePractice: true,
      terminalRunStatus: "completed",
      terminalStageStatus: "complete",
      stageSettlementApplied: true,
      terminalRunner: null,
      nextStageId: null,
      completionMemory: {
        memoryId: "memory-runner-laboratory-complete-v1",
        kind: "milestone",
        stageId: "runner-lab-v1",
        summary: "Completed the runner laboratory.",
        originChoiceId: null,
      },
      completionFact: {
        factId: "fact-runner-laboratory-complete-v1",
        kind: "learning",
        valueId: "value-runner-laboratory-practice-v1",
        originChoiceId: null,
      },
      automaticAssistContactEffectCount: 0,
      settlement: {
        appliedCountPerMode: 1,
        settlementId: "settlement-runner-laboratory-v1",
        tick: 3000,
        deterministic: true,
        idempotent: true,
        pendingSnapshot: {
          runStatus: "active",
          stagePhase: "settling",
          settlementStatus: "pending",
          startedTick: 3000,
          completedTick: null,
          runner: {
            present: true,
            patternIndex: 11,
            resolvedThroughPatternIndex: 11,
            activeEntities: [],
            finishMarkerResolvedIdPresent: true,
            finishMarkerEverActive: false,
          },
        },
        appliedSnapshot: {
          runStatus: "completed",
          stagePhase: "complete",
          settlementStatus: "applied",
          startedTick: 3000,
          completedTick: 3000,
          runner: null,
        },
        pendingCheckpointRequired: true,
        applicationTickDelta: 0,
        applicationMayResumeFromReload: true,
        transition: "separate-zero-tick-atomic-idempotent-apply-after-pending-checkpoint-or-reload",
        manual: { effectCount: 0 },
        "semantic-assist": { effectCount: 0 },
        "automatic-assist": {
          effectCountMinimum: 1,
          effectCountMaximum: 3,
          categoryId: "runner-lab-automatic-settlement-effect-v1",
          source: "system",
          transactionOwnedEffects: true,
          effectOrder: ["health", "happiness", "money"],
          zeroDeltaPolicy: "omit-effect",
          requestedDeltaDerivation: "neutral-manual-terminal-score-minus-automatic-pre-settlement-score",
          effectIdDerivation: {
            algorithmId: "settlement-score-id-format-v1",
            preimageFields: ["settlementId", "scoreId"],
            format: "effect-runner-laboratory-<scoreId>-v1",
            knownAnswers: [
              { scoreId: "health", effectId: "effect-runner-laboratory-health-v1" },
              { scoreId: "happiness", effectId: "effect-runner-laboratory-happiness-v1" },
              { scoreId: "money", effectId: "effect-runner-laboratory-money-v1" },
            ],
          },
          causedByChoiceId: null,
          simulationTick: 3000,
          nonemptyGuaranteedByAssertionId: "runner-automatic-settlement-idempotency-v1",
          nonemptyStructuralProof: {
            benefitForkCount: 4,
            benefitForkLaneCoverage: "all-three-lanes",
            neutralMinimumUtilityPerWindow: 0,
            aggregateRequestedDeltaSumMinimum: 4,
            conclusion: "at-least-one-nonzero-score-delta",
          },
        },
      },
      stateProjectionContract: {
        unchangedFromEntryThroughPendingAndApplied: {
          retainedSetupFields: [
            "schemaVersion", "contentVersion", "runId", "runSeed", "startingProfileId", "difficulty",
            "controlMode", "identity", "appearance", "accessibility",
          ],
          stageIdentity: { stageId: "runner-lab-v1", ageMonths: 0, durationTicks: 3000 },
          recovery: null,
          encounter: null,
          consequences: { pending: [], resolved: [], terminal: [] },
          storyAuxiliaryCollections: { credentials: [], relationships: [], conditions: [] },
        },
        commonPending: {
          simulationTick: 3000,
          activeTicks: 3000,
          worldDistanceMilliByDifficulty: { story: 7800000, normal: 9000000, challenge: 10200000 },
          runStatus: "active",
          stagePhase: "settling",
          settlementStatus: "pending",
          patternIndex: 11,
          resolvedThroughPatternIndex: 11,
          activeEntities: [],
          finishMarkerResolvedIdPresent: true,
          finishMarkerEverActive: false,
          storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
        },
        pendingByControlMode: {
          manual: { effectIds: [], transactionOwnedEffects: [] },
          "semantic-assist": { effectIds: [], transactionOwnedEffects: [] },
          "automatic-assist": {
            effectIdsAreReservedBeforeCheckpoint: true,
            exactOrderedNonzeroFutureEffectIdLists: [
              ["effect-runner-laboratory-health-v1"],
              ["effect-runner-laboratory-happiness-v1"],
              ["effect-runner-laboratory-money-v1"],
              ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1"],
              ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-money-v1"],
              ["effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"],
              ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"],
            ],
            order: ["health", "happiness", "money"],
            zeroDeltaEffectIdsOmitted: true,
            transactionOwnedEffects: [],
          },
        },
        commonApplied: {
          simulationTick: 3000,
          activeTicks: 3000,
          worldDistanceMilliByDifficulty: { story: 7800000, normal: 9000000, challenge: 10200000 },
          runStatus: "completed",
          stagePhase: "complete",
          settlementStatus: "applied",
          patternIndexBeforeRunnerRemoval: 11,
          resolvedThroughPatternIndexBeforeRunnerRemoval: 11,
          runner: null,
          activeEntitiesBeforeRunnerRemoval: [],
          finishMarkerResolvedIdPresentBeforeRunnerRemoval: true,
          finishMarkerEverActive: false,
          storyState: {
            facts: [{
              factId: "fact-runner-laboratory-complete-v1",
              kind: "learning",
              valueId: "value-runner-laboratory-practice-v1",
              originChoiceId: null,
            }],
            memories: [{
              memoryId: "memory-runner-laboratory-complete-v1",
              kind: "milestone",
              stageId: "runner-lab-v1",
              summary: "Completed the runner laboratory.",
              originChoiceId: null,
            }],
            credentials: [],
            relationships: [],
            conditions: [],
          },
        },
        appliedByControlMode: {
          manual: { effectIds: [], transactionOwnedEffects: [] },
          "semantic-assist": { effectIds: [], transactionOwnedEffects: [] },
          "automatic-assist": {
            effectIdsRule: "exactly-identical-to-pending-effectIds",
            transactionOwnedEffectsRule: "exactly-one-applied-effect-for-each-pending-effectId-in-the-same-order",
          },
        },
      },
    },
    assist: {
      modes: ["manual", "semantic-assist", "automatic-assist"],
      semanticTargetCompilesToAdjacentRequests: true,
      semanticPromptBoundary: "idle-null-buffer-only",
      promptOpenTickDerivation: "window-anchor-minus-difficulty-lead-ticks",
      semanticWaitingTickDelta: 0,
      semanticSelectionEnabledWhen: "semantic-prompt-is-sole-pause-reason",
      independentPauseSelectionBehavior: "reject-no-op-marker-pending-prompt-retained",
      neutralEvaluationCommandBoundaryByMode: {
        manual: "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
        "semantic-assist": "atomic-selection-step-at-prompt-open-tick",
        "automatic-assist": "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
      },
      rawLaneInputInSemanticAssist: {
        scope: "entire-mode",
        keyboard: "disabled",
        buttons: "disabled",
        swipe: "disabled",
      },
      targetStoredOutsideRunnerState: false,
      semanticSelectionCommit: {
        markerResolution: "resolve-before-logical-step",
        firstIntent: "one-adjacent-request-or-none-for-stay",
        logicalSteps: 1,
        secondIntent: "queue-same-direction-after-step-for-two-lane-target",
        commitMode: "single-atomic-state-and-save",
        resultingTickDelta: 1,
        twoLaneResult: "moving-elapsed-1-with-single-buffer",
        oneLaneResult: "moving-elapsed-1-with-null-buffer",
        stayResult: "idle-with-null-buffer",
        markerResolvedBeforeUnpause: true,
      },
      automaticDecisionCommit: {
        spawnCheckpoint: "decision-marker-pending-with-no-stored-target",
        targetDerivation: "recompute-neutral-manual-oracle-prefix-from-run-entry-through-current-marker",
        oracleEntryReconstruction: {
          source: "persisted-automatic-assist-entry-state",
          replaceControlModeWith: "manual",
          rederiveRunId: true,
          hashAlgorithm: "stateHashV1",
          liveAutomaticAssistHashAllowed: false,
        },
        oracleProjection: ["scores", "effects", "motion", "input-buffer", "resolved-entity-ids"],
        oraclePrefixStoredOutsideRunState: false,
        commitTick: "next-ordinary-active-tick",
        commitMode: "single-atomic-marker-motion-buffer-and-save",
        twoLaneResult: "moving-elapsed-1-with-single-buffer",
        oneLaneResult: "moving-elapsed-1-with-null-buffer",
        stayResult: "idle-with-null-buffer",
        resolvedMarkerWithUnsavedTargetAllowed: false,
      },
      automaticRequiresLaneInput: false,
      population: { seedCount: 10000, profileCount: 4, difficultyCount: 3, pairedEntryCount: 120000 },
      assertionIds: assistAssertionIds,
    },
    initialState: {
      schemaVersion: 1,
      contentVersion: "phase-1-v1",
      runIdDerivation: "canonical-from-retained-setup-fields-after-control-mode-selection",
      runStatus: "active",
      retainedSetupFields: [
        "runId", "runSeed", "startingProfileId", "difficulty", "controlMode", "identity", "appearance", "accessibility",
      ],
      reinitializedGameplayFields: [
        "runStatus", "scores", "effectLedger", "storyState", "stage", "runner", "recovery", "encounter", "consequences", "simulationTick",
      ],
      stage: {
        stageId: "runner-lab-v1",
        phase: "active",
        ageMonths: 0,
        activeTicks: 0,
        worldDistanceMilli: 0,
        durationTicks: 3000,
        settlement: null,
      },
      scoresByStartingProfile: registry.startingProfiles.map(({ id: startingProfileId, scores }) => ({ startingProfileId, scores })),
      scoreSelectionRule: "scores-equal-the-exact-selected-starting-profile-scores",
      effectLedger: {
        recent: [],
        totalsBySource: {
          runner: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
          choice: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
          callback: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
          settlement: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
          recovery: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
          system: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        },
      },
      storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
      recovery: null,
      encounter: null,
      consequences: { pending: [], resolved: [], terminal: [] },
      simulationTick: 0,
      runner: {
        motion: {
          kind: "idle",
          currentLane: 1,
          sourceLane: 1,
          targetLane: 1,
          elapsedTicks: 0,
          totalTicks: 11,
        },
        inputBuffer: null,
        spawnByDifficulty: spawnCursors.map(({ difficulty, spawnTicks, nextSpawnDistancesMilli }) => ({
          difficulty,
          patternIndex: 0,
          nextSpawnTick: spawnTicks[0],
          nextSpawnDistanceMilli: nextSpawnDistancesMilli[0],
          resolvedThroughPatternIndex: 0,
          resolvedEntityIds: [],
        })),
        activeEntities: [],
        invulnerableUntilTick: 0,
        userPaused: true,
      },
      invariants: {
        simulationTickEqualsStageActiveTicks: true,
        stageWorldDistanceEqualsDifficultySpeedTimesActiveTicks: true,
        initialSpeedRelationEvaluatesToZero: true,
        startMarkerResolvedIdPresent: false,
      },
    },
    startAction: {
      tickDelta: 0,
      activeTickDelta: 0,
      worldDistanceDeltaMilli: 0,
      insertStablePattern0Slot63ResolvedId: true,
      userPausedAfter: false,
    },
    logicalTickPipeline: [
      "accept-at-most-one-intent-and-advance-motion",
      "increment-simulation-tick-active-ticks-and-world-distance",
      "advance-only-entities-existing-before-this-step",
      "resolve-collisions-effects-and-invulnerability-in-canonical-order",
      "terminalize-or-pass-and-record-resolved-ids-in-canonical-order",
      "evaluate-spawn-trigger-at-post-transition-new-state-boundary-before-next-tick-input",
      "append-due-pattern-at-new-state-boundary-without-advancing-new-entities",
      "open-semantic-prompt-and-add-semantic-pause-after-append",
      "save-durable-post-append-checkpoint-containing-pattern-marker-and-applicable-prompt",
      "at-tick-3000-resolve-finish-set-terminal-cursors-create-pending-settlement-and-save-durable-checkpoint",
    ],
    replay: {
      tweenElapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      snapshotClosure: [
        { boundaryId: "start-action", occurrence: "once", positions: ["before", "after"] },
        { boundaryId: "idle-null-buffer", occurrence: "every-reachable-state", positions: ["at-state"] },
        { boundaryId: "moving-null-buffer", occurrence: "every-tween-elapsed-tick", positions: ["at-state"] },
        { boundaryId: "moving-full-buffer", occurrence: "every-tween-elapsed-tick-and-legal-buffer", positions: ["at-state"] },
        { boundaryId: "movement-completion", occurrence: "every-source-target-pair", positions: ["before", "after"] },
        { boundaryId: "buffer-handoff", occurrence: "every-legal-buffered-handoff", positions: ["before", "after"] },
        { boundaryId: "semantic-assist-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
        { boundaryId: "automatic-assist-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
        { boundaryId: "manual-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
        { boundaryId: "entity-contact", occurrence: "every-included-contacted-entity", positions: ["before", "after"] },
        { boundaryId: "safe-pass", occurrence: "every-included-uncontacted-entity-and-manual-marker", positions: ["before", "after"] },
        { boundaryId: "invulnerability-window", occurrence: "every-authoritative-negative-contact", positions: ["start", "last-protected-tick", "end"] },
        {
          boundaryId: "pause-reason",
          occurrence: "each-enumerated-reason",
          reasons: ["user", "semantic-assist", "visibility", "focus-interruption", "modal"],
          positions: ["pause", "resume"],
          firstResumedFrameTickDelta: 0,
        },
        { boundaryId: "pending-settlement-checkpoint", occurrence: "once-per-run", positions: ["durable-pending"] },
        { boundaryId: "applied-settlement", occurrence: "once-per-run", positions: ["after-apply", "completion"] },
      ],
      remainingSpawnIdComparisonCap: 50,
      futureEntityIdProjection: {
        startMarker: "include-unresolved-start-marker-id-before-start-and-omit-after-resolution",
        includedSlots: "include-every-unresolved-included-pattern-slot-id-in-canonical-coordinate-order",
        decisionMarkers: "include-every-unresolved-decision-marker-id",
        finishMarker: "include-unresolved-finish-marker-id-until-terminal-resolution",
        emissionOrder: ["patternIndex", "slotIndex", "instanceId"],
        remainingOnly: true,
        maximumIds: 50,
      },
      canonicalHashRequired: true,
      saveRoundTripRequired: true,
    },
    invariance: {
      appearanceGameplayProjectionInvariant: true,
      genderGameplayProjectionInvariant: true,
      appearanceWitnessSeeds: [0, 1, 9999],
      appearanceAxes: {
        gender: ["female", "male"],
        heritageStyleId: ["asian", "western", "black", "middle-eastern"],
        hairStyleId: ["short-soft", "wavy-bob", "curly-crown", "tied-back"],
        hairColorId: ["black", "dark-brown", "warm-brown", "silver"],
        clothingPaletteId: ["sunrise", "meadow", "ocean", "berry"],
        selectionCount: 512,
      },
      gameplayProjectionFields: [
        "pattern-ids-and-rotations", "optional-group-inclusion", "collision-geometry", "logical-command-trace",
        "contact-ticks-and-outcomes", "effect-ids-and-requested-and-actual-deltas", "completion-fact",
        "completion-memory", "settlement", "final-scores",
      ],
      excludedPresentationFields: ["runId", "identity", "appearance", "accessibility"],
      pauseTickDrift: 0,
    },
    accessibility: {
      semanticChoiceAndReloadIdentity: {
        profileCount: 4,
        difficultyCount: 3,
        structuralPatternRotationCases: [
          { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
          { patternId: "runner-lab-benefit-fork-v1", rotation: 1 },
          { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
          { patternId: "runner-lab-risk-reward-v1", rotation: 0 },
          { patternId: "runner-lab-risk-reward-v1", rotation: 1 },
          { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
          { patternId: "runner-lab-avoid-only-v1", rotation: 0 },
          { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
          { patternId: "runner-lab-avoid-only-v1", rotation: 2 },
          { patternId: "runner-lab-quiet-window-v1", rotation: 0 },
        ],
        sourceLanes: [0, 1, 2],
        targetLanes: [0, 1, 2],
        persistenceBranches: ["normal", "reload-before-selection", "reload-after-selection"],
        branchComparisonRule: "each-entry-compares-all-three-persistence-branches",
        populationFormula: "4-profiles-times-3-difficulties-times-10-structural-cases-times-3-source-lanes-times-3-target-lanes",
        decisionEntries: 1080,
        pauseGuardReasons: ["visibility", "focus-interruption", "user", "modal"],
        pauseGuardInvariants: [
          "selection-is-rejected",
          "decision-marker-remains-pending",
          "simulation-tick-active-ticks-and-world-distance-remain-stable",
          "motion-input-buffer-active-entities-and-resolved-ids-remain-stable",
          "resume-restores-the-identical-semantic-choice-and-first-resumed-frame-advances-zero-ticks",
        ],
        totalEntries: 1084,
        semanticPersistenceIdentityFields: [
          "decision-marker-id-and-contact-state", "simulationTick", "stage.activeTicks", "stage.worldDistanceMilli",
          "runner.motion", "runner.inputBuffer", "stateHashV1", "future-entity-ids", "contact-outcomes",
          "effect-ids-and-requested-and-actual-deltas", "completion-fact", "completion-memory",
        ],
        manualGameplayParityFields: [
          "simulationTick", "stage.activeTicks", "stage.worldDistanceMilli", "runner.motion", "runner.inputBuffer",
          "future-scoring-entity-ids-excluding-assist-markers", "scoring-contact-outcomes",
          "effect-ids-and-requested-and-actual-deltas", "scores", "completion-fact", "completion-memory",
        ],
        manualGameplayParityExcludedFields: [
          "controlMode", "runId", "stateHashV1", "assist-pause-reasons", "decision-marker-state",
          "future-decision-marker-ids",
        ],
      },
      automaticNoInputCompletion: {
        population: 120000,
        rawLaneInputCount: 0,
        semanticChoiceInputCount: 0,
        startActivationCount: 1,
        completionRequired: true,
        settlementAppliedCount: 1,
        completionFactCount: 1,
        completionMemoryCount: 1,
        requiredInteractiveControlsAfterStart: 0,
        pendingCheckpointReloadRequired: true,
        appliedCompletionReloadRequired: true,
        oracleSource: "reconstructed-manual-entry-stateHashV1",
      },
      reducedMotionDomainIdentity: {
        savedPreferenceEntries: 120000,
        osPreferenceEntries: 120000,
        totalEntries: 240000,
        effectivePreferenceTruthTable: [
          { savedReducedMotion: false, osReducedMotion: false, effectiveReducedMotion: false },
          { savedReducedMotion: false, osReducedMotion: true, effectiveReducedMotion: true },
          { savedReducedMotion: true, osReducedMotion: false, effectiveReducedMotion: true },
          { savedReducedMotion: true, osReducedMotion: true, effectiveReducedMotion: true },
        ],
        allowedDifferences: ["visual-interpolation-duration", "decorative-motion", "camera-motion"],
        requiredIdentity: [
          "stateHashV1", "logical-commands", "simulation-timing", "collision-timing", "contact-ticks-and-outcomes",
          "effect-ids-and-deltas", "scores", "completion-state", "completion-fact", "completion-memory",
        ],
      },
      browserMatrix: {
        groupCounts: { completionReflow: 40, presentation: 72, safeAreaOneHand: 8, focus: 10, announcements: 9, total: 139 },
        completionReflowMatrix: {
          paths: ["manual-keyboard", "manual-buttons", "manual-swipe", "semantic-assist", "automatic-assist"],
          viewports: [
            { width: 1280, height: 720 },
            { width: 800, height: 360 },
            { width: 360, height: 800 },
            { width: 320, height: 568 },
          ],
          textScalePercent: [100, 200],
          count: 40,
        },
        presentationMatrix: {
          viewports: [
            { width: 1280, height: 720 },
            { width: 800, height: 360 },
            { width: 360, height: 800 },
            { width: 320, height: 568 },
          ],
          textScalePercent: [100, 200],
          contrast: ["standard", "high", "forced-colors"],
          motionSource: ["normal", "saved-reduced", "os-reduced"],
          count: 72,
        },
        safeAreaOneHandMatrix: {
          mobileViewports: [{ width: 360, height: 800 }, { width: 320, height: 568 }],
          textScalePercent: [100, 200],
          reach: ["left", "right"],
          count: 8,
        },
        contrast: {
          normalTextMinimumRatio: "4.5:1",
          largeTextMinimumRatio: "4.5:1",
          nonTextMinimumRatio: "3:1",
          colorAloneConveysMeaning: false,
          redundantCues: ["label", "icon-or-shape", "outline-or-pattern", "color"],
          forcedColorsTreatmentRequired: true,
          nonTextSubjects: ["controls", "focus", "lane-boundaries", "meaningful-graphics"],
        },
        reflow: {
          horizontalPageScrollAllowedAt320CssPx: false,
          textClippingAllowedAt200Percent: false,
          controlsObscurePlayerAllowed: false,
          obscuredFocusAllowed: false,
          undersizedTargetsAllowed: false,
          intentionalVerticalDocumentScrollAt200Percent: true,
        },
        entryPresentation: {
          initiallyPaused: true,
          orientationTextVisible: true,
          startControlElement: "button",
          startControlNative: true,
        },
        semanticStructure: {
          persistentRunnerRegion: {
            element: "section",
            accessibleName: "Runner status",
            headingId: "runner-status-heading",
          },
          runnerStateSummary: {
            element: "dl",
            fields: ["mode", "lane", "motion", "pause"],
            eachFieldHasTermAndDescription: true,
          },
          scoreOutputs: {
            visibleCount: 3,
            scoreOrder: ["health", "happiness", "money"],
            eachHasAccessibleNameAndValue: true,
          },
          decisionPrompt: {
            element: "fieldset",
            nativeFieldsetRequired: true,
            legendRequired: true,
            untimed: true,
            laneOrder: [0, 1, 2],
            enabledChoiceRequiredForEveryVisuallyAvailableLane: true,
            eachChoiceExposes: ["lane", "benefit", "hazard", "urgency"],
            informationHorizon: "never-beyond-the-visual-warning-horizon",
            sourceProjection: "same-locked-pattern-warning-projection-as-visual-playfield",
            renderCaseAssertionId: "runner-semantic-choice-and-reload-identity-v1",
            renderCaseCount: 1080,
          },
          progress: {
            element: "progress",
            minimum: 0,
            maximum: 3000,
            valueSource: "stage.activeTicks",
            accessibleName: "Runner laboratory progress",
          },
          playfield: {
            accessibilityTree: "excluded",
            ariaHidden: true,
            focusableDescendantsAllowed: false,
            movingEntityAccessibilityNodesAllowed: false,
          },
          persistentStatus: { role: "status", politeness: "polite", atomic: true },
          pauseResumeControlVisible: true,
          completionRecapHeadingFocusRequired: true,
        },
        manualButtons: {
          commands: ["lane-up", "lane-down"],
          labelled: true,
          minimumTargetCssPx: 44,
        },
        focusTransitions: [
          { transitionId: "entry-to-start", expectedFocus: "start-button" },
          { transitionId: "start-to-persistent-runner", expectedFocus: "pause-button" },
          { transitionId: "semantic-prompt-open", expectedFocus: "first-enabled-semantic-choice" },
          { transitionId: "semantic-choice-submit", expectedFocus: "runner-status-heading" },
          { transitionId: "user-pause-resume", expectedFocus: "user-resume-button" },
          { transitionId: "visibility-pause-resume", expectedFocus: "visibility-resume-button" },
          { transitionId: "focus-interruption-resume", expectedFocus: "focus-resume-button" },
          { transitionId: "modal-open", expectedFocus: "first-enabled-modal-control", requirements: ["background-inert", "forward-tab-contained", "backward-tab-contained"] },
          { transitionId: "modal-close", expectedFocus: "modal-invoker" },
          { transitionId: "completion", expectedFocus: "completion-recap-heading" },
        ],
        focusRules: {
          visibleIndicatorRequired: true,
          logicalOrderRequired: true,
          modalTabContainmentRequired: true,
          nonmodalFocusTrapAllowed: false,
          focusRestoredAfterPrompt: true,
        },
        interruptionCoalescing: {
          hiddenThenBlur: {
            retainedPauseReasons: ["visibility"],
            focusInterruptionAdded: false,
            explicitResumeActivationsRequired: 1,
            firstResumedFrameLogicalTickDelta: 0,
          },
          visibleThenBlur: {
            retainedPauseReasons: ["focus-interruption"],
            explicitResumeActivationsRequired: 1,
            firstResumedFrameLogicalTickDelta: 0,
          },
        },
        touchAndPointer: {
          minimumTargetCssPx: 44,
          surface: "dedicated-play-surface-only",
          touchAction: "pan-x",
          maximumActivePointers: 1,
          additionalPointerPolicy: "cancel-active-sequence-and-ignore-until-all-pointers-release",
          pointerCaptureBoundary: "capture-accepted-primary-pointer",
          pointerCancelResult: "cancel-without-lane-request",
          pointerReleaseRule: "release-capture-on-pointerup-pointercancel-and-lostpointercapture",
          verticalSwipeThresholdCssPx: 24,
          verticalMagnitudeMustExceedHorizontal: true,
          verticalSwipeDirectionMapping: { negativeDeltaY: "lane-up", positiveDeltaY: "lane-down" },
          synthesizedClickPolicy: "suppress-the-follow-up-click-from-the-consumed-pointer-sequence",
          maximumIntentsPerPointerSequence: 1,
          preventDefaultBoundary: "only-after-a-valid-vertical-swipe-is-recognized",
          outsideSurfaceScrollSuppressionAllowed: false,
          surroundingPageScrollableAt200PercentText: true,
        },
        keyboardAndRemapping: {
          immutableBindings: [
            { command: "lane-up", eventCode: "ArrowUp", ariaKeyshortcutsToken: "ArrowUp", displayLabel: "Up arrow" },
            { command: "lane-down", eventCode: "ArrowDown", ariaKeyshortcutsToken: "ArrowDown", displayLabel: "Down arrow" },
          ],
          supplementalRemappableDefaults: [
            { command: "lane-up", eventCode: "KeyW", ariaKeyshortcutsToken: "W", displayLabel: "W" },
            { command: "lane-down", eventCode: "KeyS", ariaKeyshortcutsToken: "S", displayLabel: "S" },
          ],
          remappableCommandSet: ["lane-up", "lane-down"],
          duplicateBindingPolicy: "reject",
          rejectedRemapKeys: ["Tab", "Escape", "Enter", "Space", "modifier-chord", "browser-reserved", "system-reserved"],
          persistence: "bounded-in-memory-current-mounted-session-only",
          localStorageAllowed: false,
          sessionStorageAllowed: false,
          runStateStorageAllowed: false,
          gameplayHashAffected: false,
          reloadRule: "restore-supplemental-KeyW-KeyS-defaults",
          resetRule: "restore-supplemental-KeyW-KeyS-defaults",
          instructionsUpdateImmediately: true,
          ariaKeyshortcutsUpdateImmediately: true,
          preventDefaultBoundary: "only-when-keydown-produces-an-accepted-intent",
          ignoredInputContexts: [
            "input", "select", "contenteditable", "open-dialog", "before-start", "semantic-assist-entire-mode",
            "paused-by-independent-reason", "stage-settling", "run-completed",
          ],
        },
        liveRegions: {
          structure: [
            { regionId: "runner-status", role: "status", politeness: "polite", atomic: true },
            { regionId: "runner-alert", role: "alert", politeness: "assertive", atomic: true },
          ],
          announcementWitnesses: [
            "approach-warning-with-lane-and-time",
            "actual-benefit-contact-with-score-and-delta",
            "actual-hazard-contact-with-score-and-delta",
            "suppressed-hazard-contact-with-no-score-change",
            "clamped-effect-result-with-requested-and-actual-delta",
            "semantic-prompt-open-and-choice-confirmation",
            "pause-and-resume-with-reason",
            "actionable-error-with-recovery-action",
            "completion-with-singleton-fact-and-memory",
          ],
          progress: { maximumAnnouncementsPerSecond: 1, boundaryAnnouncementsRequired: true },
          laneOutput: { ariaLive: false, updates: ["movement-start", "movement-end"] },
          throttle: { minimumIntervalMs: 1000, duplicateSuppression: true, latestMessageWinsWithinInterval: true },
          batching: {
            unit: "once-per-warning-or-result-group",
            perTickAnnouncementsAllowed: false,
            perEntityAnnouncementsAllowed: false,
          },
          requiredContent: ["lane", "actual-post-clamp-delta", "resulting-score", "suppressed-hazard"],
          optionalAnnouncements: {
            mayBeDisabled: true,
            fallback: "essential-visible-and-focus-readable-status-remains",
            actionableErrorsRemainRoleAlert: true,
          },
        },
        reducedMotionPresentation: {
          effectiveRule: "saved-reduced-motion-or-os-prefers-reduced-motion",
          disabledEffects: [
            "parallax", "continuous-world-translation", "shake", "pulse", "particles", "spatial-tween-animation",
          ],
          laneSchematic: { ariaHidden: true, snapsWithoutAnimation: true },
          nonLiveMovementTextFields: ["source-lane", "target-lane", "idle-or-moving", "urgency"],
          nonLiveMovementTextBoundary: ["movement-start", "movement-end"],
          simulationDomainIdentityRequired: true,
          mediaListenerDisposalRequired: true,
        },
        safeAreaAndOneHand: {
          safeAreaInsetsRequired: ["top", "right", "bottom", "left"],
          portraitControlsReachableWithEitherHand: true,
          landscapeControlsReachableWithEitherHand: true,
          essentialControlRequiresTwoHands: false,
          laneControlsInOneCluster: true,
          clusterPlacements: ["left", "right"],
          controlsInCluster: ["lane-up", "lane-down"],
          settingsAndDialogCloseRestoresExactInvokerFocus: true,
          interruptionResumeTargetsRelevantControlOrDecisionHeading: true,
        },
        audioRedundancy: {
          audioRequiredForGameplay: false,
          everyAudioCueHasVisualEquivalent: true,
          everyAudioCueHasTextEquivalent: true,
          everyAudioCueHasIconOrShapeEquivalent: true,
          visibleWarningsCompleteWithAudioMuted: true,
        },
        nonvisualManualReview: {
          required: true,
          keyboardOnlyRequired: true,
          screenReaderRequired: true,
          screenReaderChoice: ["NVDA", "VoiceOver"],
          compatibleBrowsersByPlatform: {
            Windows: ["Chrome", "Edge", "Firefox"],
            macOS: ["Chrome", "Edge", "Firefox", "Safari"],
          },
          minimumScreenReadersReviewed: 1,
          actualAssistiveTechnologySessionRequired: true,
          nonvisualSemanticCompletionRequired: true,
          forcedColorsInspectionRequired: true,
          evidenceArtifactRequired: true,
          automatedChecksAloneSufficient: false,
        },
      },
    },
    assertions: [
      assertion("runner-generation-determinism-v1", 90000),
      assertion("runner-pattern-composition-v1", 90000),
      assertion("runner-laboratory-reachability-v1", 90000),
      assertion("runner-input-adjacency-v1", 321),
      assertion("runner-buffer-handoff-v1", 100),
      assertion("runner-contact-idempotency-v1", 90000),
      assertion("runner-invulnerability-ownership-v1", 90000),
      assertion("runner-entity-cap-v1", 90000),
      assertion("runner-nondepletion-v1", 120000),
      assertion("runner-laboratory-replay-v1", 120000),
      assertion("runner-automatic-settlement-idempotency-v1", 120000),
      assertion("runner-modality-identity-v1", 120000),
      assertion("runner-pause-drift-v1", 32),
      assertion("runner-appearance-invariance-v1", 18432),
      ...assistAssertionIds.map((assertionId) => assertion(assertionId, 120000)),
      assertion("runner-completion-memory-parity-v1", 120000),
      assertion("runner-simultaneous-contact-order-v1", 6),
      assertion("runner-semantic-choice-and-reload-identity-v1", 1084),
      assertion("runner-automatic-no-input-completion-v1", 120000),
      assertion("runner-reduced-motion-domain-identity-v1", 240000),
      assertion("runner-accessibility-browser-matrix-v1", 139),
    ],
    recomputationRequired: true,
  };
}

function closedLiteralNode(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      minItems: value.length,
      maxItems: value.length,
      prefixItems: value.map(closedLiteralNode),
      items: false,
    };
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    return {
      type: "object",
      additionalProperties: false,
      required: keys,
      properties: Object.fromEntries(keys.map((key) => [key, closedLiteralNode(value[key])])),
    };
  }
  return { const: value };
}

function closedLiteralSchema(
  value,
  {
    id = "https://choice-of-life.example/schemas/runner-fixture-v1.schema.json",
    title = "Choice of Life Runner Laboratory Fixture v1",
  } = {},
) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id,
    title,
    ...closedLiteralNode(value),
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePhase2Bundle(root, { fixture = validRunnerFixture(), contentLock = phase2ContentLock() } = {}) {
  const files = [
    ["docs/phase-specs/phase-2.md", "# Phase 2 runner laboratory\n"],
    ["docs/balance/locks/runner-laboratory-content-lock-v1.json", contentLock],
    ["docs/balance/runner-fixture-v1.schema.json", closedLiteralSchema(fixture)],
    ["docs/balance/runner-fixtures/runner-laboratory-fixture-v1.json", fixture],
  ];
  for (const [relative, value] of files) {
    const absolute = path.join(root, ...relative.split("/"));
    if (typeof value === "string") {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, value, "utf8");
    } else {
      await writeJson(absolute, value);
    }
  }
  const manifest = {
    schemaVersion: 1,
    manifestId: "phase-2-preregistration-lock-v1",
    phaseId: "phase-2",
    status: "locked",
    hashAlgorithm: "sha256",
    bytePolicy: "Repository-relative file bytes with LF enforced by docs/.gitattributes",
    files: await Promise.all(files.map(async ([relative]) => ({
      path: relative,
      sha256: sha256(await readFile(path.join(root, ...relative.split("/")))),
    }))),
  };
  await writeJson(path.join(root, "docs", "phase-specs", "phase-2-lock-manifest.json"), manifest);
  return { fixture, contentLock, manifest };
}

function phase3ContentLock() {
  // Structural preregistration test double only. Phase 3 gameplay/choice semantics
  // belong to the future locked bundle and its later implementation validator.
  const lock = phase2ContentLock();
  lock.lockId = "newborn-stage-content-lock-v1";
  lock.content.phaseId = "phase-3";
  lock.review.designReason = "Preregister the newborn stage fixture before implementation or tuning.";
  return lock;
}

function validPhase3Fixture() {
  return {
    schemaVersion: 1,
    fixtureId: "newborn-stage-fixture-v1",
    phaseId: "phase-3",
    contentLockId: "newborn-stage-content-lock-v1",
    contractStatus: "preregistered",
  };
}

async function writePhase3Bundle(
  root,
  { fixture = validPhase3Fixture(), contentLock = phase3ContentLock() } = {},
) {
  const files = [
    ["docs/phase-specs/phase-3.md", "# Phase 3 newborn stage\n"],
    ["docs/balance/locks/newborn-stage-content-lock-v1.json", contentLock],
    [
      "docs/balance/newborn-fixture-v1.schema.json",
      closedLiteralSchema(fixture, {
        id: "https://choice-of-life.example/schemas/newborn-fixture-v1.schema.json",
        title: "Choice of Life Newborn Stage Fixture v1",
      }),
    ],
    ["docs/balance/newborn-fixtures/newborn-stage-fixture-v1.json", fixture],
  ];
  for (const [relative, value] of files) {
    const absolute = path.join(root, ...relative.split("/"));
    if (typeof value === "string") {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, value, "utf8");
    } else {
      await writeJson(absolute, value);
    }
  }
  const phase2ManifestPath = path.join(root, "docs", "phase-specs", "phase-2-lock-manifest.json");
  const manifest = {
    schemaVersion: 1,
    manifestId: "phase-3-preregistration-lock-v1",
    phaseId: "phase-3",
    status: "locked",
    hashAlgorithm: "sha256",
    bytePolicy: "Repository-relative file bytes with LF enforced by docs/.gitattributes",
    predecessorManifestId: "phase-2-preregistration-lock-v1",
    predecessorManifestSha256: sha256(await readFile(phase2ManifestPath)),
    files: await Promise.all(files.map(async ([relative]) => ({
      path: relative,
      sha256: sha256(await readFile(path.join(root, ...relative.split("/")))),
    }))),
  };
  await writeJson(path.join(root, "docs", "phase-specs", "phase-3-lock-manifest.json"), manifest);
  return { fixture, contentLock, manifest };
}

function runnerManualReviewArtifactSha256(session) {
  return createHash("sha256").update(JSON.stringify({
    announcementWitnessCount: session.announcementWitnessCount,
    browser: session.browser,
    browserVersion: session.browserVersion,
    completedAtUtc: session.completedAtUtc,
    completionPathPassed: session.completionPathPassed,
    evaluatedSourceSha256: session.evaluatedSourceSha256,
    focusTransitionCount: session.focusTransitionCount,
    forcedColorsInspectionPassed: session.forcedColorsInspectionPassed,
    keyboardInspectionPassed: session.keyboardInspectionPassed,
    keyboardOnlyPassed: session.keyboardOnlyPassed,
    nonvisualSemanticCompletionPassed: session.nonvisualSemanticCompletionPassed,
    platform: session.platform,
    reviewerAttestation: session.reviewerAttestation,
    reviewerId: session.reviewerId,
    screenReader: session.screenReader,
    screenReaderVersion: session.screenReaderVersion,
    semanticDecisionPromptPassed: session.semanticDecisionPromptPassed,
    semanticStructurePassed: session.semanticStructurePassed,
    sessionId: session.sessionId,
  }), "utf8").digest("hex");
}

function validRunnerEvidence(fixture, evaluatedSourceSha256 = "a".repeat(64)) {
  const session = {
    sessionId: "runner-accessibility-manual-review-session-v1",
    reviewerId: "reviewer-accessibility-v1",
    reviewerAttestation: true,
    keyboardOnlyPassed: true,
    keyboardInspectionPassed: true,
    screenReader: "NVDA",
    screenReaderVersion: "2026.1",
    platform: "Windows",
    browser: "Firefox",
    browserVersion: "141",
    completedAtUtc: "2026-08-04T00:00:00Z",
    focusTransitionCount: 10,
    announcementWitnessCount: 9,
    semanticStructurePassed: true,
    semanticDecisionPromptPassed: true,
    nonvisualSemanticCompletionPassed: true,
    forcedColorsInspectionPassed: true,
    completionPathPassed: true,
    evaluatedSourceSha256,
  };
  const artifactSha256 = runnerManualReviewArtifactSha256(session);
  return {
    schemaVersion: 1,
    fixtureId: fixture.fixtureId,
    contentLockId: fixture.contentLockId,
    evaluatedSourceSha256,
    evaluatorId: fixture.evaluatorId,
    complete: true,
    manualReviewEvidence: {
      assertionId: "runner-accessibility-browser-matrix-v1",
      status: "complete",
      session,
      artifact: {
        artifactId: "runner-accessibility-manual-review-evidence-v1",
        format: "embedded-manual-review-session-v1",
        sha256: artifactSha256,
      },
    },
    assertionResults: fixture.assertions.map(({ assertionId, population, groupCounts }) => ({
      assertionId,
      status: "complete",
      passed: true,
      population,
      failureCount: 0,
      groupCounts,
    })),
  };
}

function completeAssistEvidenceReports(lock) {
  const suite = registry.evaluationSuites.find(({ id }) => id === "assist-parity-v1");
  if (!suite) throw new Error("Missing Assist parity suite fixture");
  const policyCellIds = [suite.manualPolicyId, suite.semanticAssistPolicyId, suite.automaticAssistPolicyId]
    .map((policyId) => `runner=${policyId}`);
  const runCount = registry.seedSet.count
    * registry.startingProfiles.length
    * registry.difficulties.length
    * lock.content.contextIds.length
    * policyCellIds.length;
  return [{
    suiteId: suite.id,
    status: "complete",
    seedSetId: registry.seedSet.id,
    seedCount: registry.seedSet.count,
    profileIds: registry.startingProfiles.map(({ id }) => id),
    difficulties: [...registry.difficulties],
    contextIds: [...lock.content.contextIds],
    policyCellIds,
    runCount,
    assertionResults: suite.assertionIds.map((assertionId) => ({
      assertionId,
      status: "complete",
      passed: true,
      runCount,
    })),
  }];
}

async function writeEvaluationSourceSkeleton(root) {
  for (const [relative, contents] of [
    ["CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md", "# Choice of Life implementation plan\n"],
    ["index.html", "<main id=\"app\"></main>\n"],
    ["package.json", "{}\n"],
    ["package-lock.json", "{}\n"],
    ["tsconfig.json", "{}\n"],
    ["tsconfig.choice-of-life-core.json", "{}\n"],
    ["tsconfig.runner-evaluator.json", "{}\n"],
    ["vite.config.ts", "export default {};\n"],
    ["src/main.ts", "export {};\n"],
  ]) {
    const absolute = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  }
}

async function writePhase2Evidence(root, fixture, contentLock, evaluatedSourceSha256) {
  await writeJson(
    path.join(
      root,
      "docs",
      "balance",
      "evaluation-results",
      `${contentLock.lockId}.json`,
    ),
    {
      schemaVersion: 1,
      lockId: contentLock.lockId,
      evaluationBatchId: "phase-2-evaluation-batch-v1",
      evaluatedSourceSha256,
      reports: completeAssistEvidenceReports(contentLock),
    },
  );
  await writeJson(
    path.join(
      root,
      "docs",
      "balance",
      "runner-evaluation-results",
      `${fixture.fixtureId}.json`,
    ),
    validRunnerEvidence(fixture, evaluatedSourceSha256),
  );
}

function completeEvidenceReports(lock) {
  const suite = registry.evaluationSuites.find(({ id }) => id === "attribution-v1");
  if (!suite) throw new Error("Missing attribution suite fixture");
  const runCount = registry.seedSet.count
    * registry.startingProfiles.length
    * registry.difficulties.length
    * lock.content.contextIds.length
    * suite.choicePolicies.length;
  return [{
    suiteId: suite.id,
    status: "complete",
    seedSetId: registry.seedSet.id,
    seedCount: registry.seedSet.count,
    profileIds: registry.startingProfiles.map(({ id }) => id),
    difficulties: [...registry.difficulties],
    contextIds: [...lock.content.contextIds],
    policyCellIds: suite.choicePolicies.map(
      (choicePolicyId) => `runner=${suite.runnerPolicyId};choice=${choicePolicyId}`
    ),
    runCount,
    assertionResults: suite.assertionIds.map((assertionId) => ({
      assertionId,
      status: "complete",
      passed: true,
      runCount,
    })),
  }];
}

describe("Phase 1 fixture locks", () => {
  it("verifies every immutable byte and the committed registry", async () => {
    await expect(verifyLockManifest()).resolves.toMatchObject({ status: "locked" });
    await expect(verifyCorrectionLockManifest()).resolves.toMatchObject({
      status: "locked",
      supplementsManifestId: "phase-1-preregistration-lock-v1",
    });
    const chain = await verifyLockManifestChain();
    expect(chain).toMatchObject({
      protectedPaths: expect.arrayContaining([
        "docs/save/run-state-v1-maximal.fixture.json",
        "docs/save/run-state-v1-maximal.fixture-correction-v2.json",
      ]),
    });
    const preregistrationBaseRevision = process.env.CHOICE_FIXTURE_TEST_PREREG_BASE_SHA?.trim() || null;
    const hasRunnerEvidence = await readFile(
      new URL("../docs/balance/runner-evaluation-results/runner-laboratory-fixture-v1.json", import.meta.url)
    ).then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    const validation = preregistrationBaseRevision !== null
      ? validateCommittedFixturePreregistration(process.cwd(), { baseRevision: preregistrationBaseRevision })
      : chain.additiveManifests > 0 && !hasRunnerEvidence
        ? validateFixturePreregistration()
        : validateFixtureLocks();
    await expect(validation).resolves.toMatchObject({
      manifests: chain.manifests.length,
      manifestFiles: chain.protectedPaths.length,
      additiveManifests: chain.additiveManifests,
      additiveManifestFiles: chain.additiveManifestFiles,
    });
  });

  it("rejects self-consistent edits to either pinned manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-manifest-lock-"));
    try {
      const base = JSON.parse(await readFile(new URL("../docs/phase-specs/phase-1-lock-manifest.json", import.meta.url), "utf8"));
      const changedBasePayload = Buffer.from("self-consistent but unauthorized base payload\n", "utf8");
      base.files.find(({ path: filePath }) => filePath === "docs/phase-specs/phase-1.md").sha256 = sha256(changedBasePayload);
      await mkdir(path.join(root, "docs", "phase-specs"), { recursive: true });
      await writeFile(path.join(root, "docs", "phase-specs", "phase-1.md"), changedBasePayload);
      await writeFile(path.join(root, "docs", "phase-specs", "phase-1-lock-manifest.json"), JSON.stringify(base, null, 2));
      await expect(verifyLockManifest(root)).rejects.toThrow(/base manifest hash/);

      const correction = JSON.parse(await readFile(
        new URL("../docs/phase-specs/phase-1-fixture-correction-v2-lock-manifest.json", import.meta.url),
        "utf8"
      ));
      const changedCorrectionPayload = Buffer.from("self-consistent but unauthorized correction payload\n", "utf8");
      correction.files.find(({ path: filePath }) => filePath.endsWith("phase-1-fixture-correction-v2.md")).sha256 =
        sha256(changedCorrectionPayload);
      await writeFile(path.join(root, "docs", "phase-specs", "phase-1-fixture-correction-v2.md"), changedCorrectionPayload);
      await writeFile(
        path.join(root, "docs", "phase-specs", "phase-1-fixture-correction-v2-lock-manifest.json"),
        JSON.stringify(correction, null, 2)
      );
      await expect(verifyCorrectionLockManifest(root)).rejects.toThrow(/correction manifest hash/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects edit-in-place history and deletion of an immutable content lock", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-content-lock-history-"));
    const lockPath = "docs/balance/locks/runner-lab-content-lock-v1.json";
    const absoluteLockPath = path.join(root, ...lockPath.split("/"));
    try {
      await initialiseGitRepository(root);
      await mkdir(path.dirname(absoluteLockPath), { recursive: true });
      const original = Buffer.from("{\"lockId\":\"runner-lab-content-lock-v1\"}\n", "utf8");
      await writeFile(absoluteLockPath, original);
      await commitAll(root, "docs: add immutable content lock");
      await expect(verifyGitLockedPaths(root, [{ path: lockPath, sha256: sha256(original) }])).resolves.toBeUndefined();
      await expect(verifyHistoricalContentLockPaths(root, [lockPath])).resolves.toEqual([lockPath]);

      await writeFile(absoluteLockPath, "{\"lockId\":\"edited-in-place-v1\"}\n", "utf8");
      await commitAll(root, "docs: illegally edit immutable content lock");
      await expect(verifyGitLockedPaths(root, [{ path: lockPath, sha256: sha256(original) }])).rejects.toThrow(
        /exactly one byte-creation commit/
      );

      await rm(absoluteLockPath);
      await commitAll(root, "docs: illegally delete immutable content lock");
      await expect(verifyHistoricalContentLockPaths(root, [])).rejects.toThrow(/historical content locks differ/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preregisters an uncommitted lock before strict history validation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-preregister-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await writePhase2Bundle(root);
      await expect(validateFixturePreregistration(root)).resolves.toMatchObject({ contentLocks: 1 });
      await expect(validateCommittedFixturePreregistration(root)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recognizes a new lock across follow-up commits and a synthetic merge by explicit base SHA", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-preregister-merge-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await initialiseGitRepository(root);
      await commitAll(root, "docs: establish immutable fixture baseline");
      const { stdout: baseOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const baseRevision = baseOutput.trim();
      const { stdout: branchOutput } = await execFileAsync("git", ["branch", "--show-current"], { cwd: root });
      const baseBranch = branchOutput.trim();

      await execFileAsync("git", ["checkout", "-b", "fixture-feature"], { cwd: root });
      await writePhase2Bundle(root);
      await commitAll(root, "docs: preregister runner lab lock");
      await writeFile(path.join(root, "docs/feature-follow-up.md"), "Follow-up review note.\n", "utf8");
      await commitAll(root, "docs: follow up on preregistration review");

      await execFileAsync("git", ["checkout", baseBranch], { cwd: root });
      await writeFile(path.join(root, "docs/base-follow-up.md"), "Base-side note.\n", "utf8");
      await commitAll(root, "docs: advance base branch");
      await execFileAsync("git", ["merge", "--no-ff", "fixture-feature", "-m", "test: synthetic pull request merge"], { cwd: root });

      await expect(validateCommittedFixturePreregistration(root, { baseRevision })).resolves.toMatchObject({
        contentLocks: 1,
      });
      await expect(validateCommittedFixturePreregistration(root)).rejects.toThrow(/evidence unavailable/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("keeps the lock CI command wired to post-commit history validation", async () => {
    const packageDocument = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(packageDocument.scripts["fixtures:validate-preregistration"]).toBe(
      "node scripts/validate-committed-fixture-preregistration.mjs"
    );
    const workflow = await readFile(new URL("../.github/workflows/validate-locks.yml", import.meta.url), "utf8");
    expect(workflow).toContain("run: npm run fixtures:validate-preregistration");
    expect(workflow).not.toContain("run: npm run fixtures:preregister");
    expect(workflow.match(/- "docs\/\*\*"/g)).toHaveLength(2);
    expect(workflow).toContain("CHOICE_LOCK_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}");
    expect(workflow).toContain("CHOICE_FIXTURE_TEST_PREREG_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}");
    expect(workflow.match(/- "scripts\/fixture-lock\.mjs"/g)).toHaveLength(2);
    expect(workflow).toContain(
      "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"
    );
    expect(workflow).toContain(
      "uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0"
    );
    expect(workflow).not.toMatch(/uses: actions\/(?:checkout|setup-node)@v\d+/);
    expect(workflow).toContain("node-version: 22.23.1");
  });

  it("rejects missing, unknown, and wrong-value registry fields", () => {
    const missing = clone(registry);
    delete missing.status;
    expect(() => validateRegistryObject(missing)).toThrow(/missing required property status/);

    const unknown = clone(registry);
    unknown.surprise = true;
    expect(() => validateRegistryObject(unknown)).toThrow(/unknown property surprise/);

    const wrong = clone(registry);
    wrong.status = "draft";
    expect(() => validateRegistryObject(wrong)).toThrow(/must equal "locked"|not locked/);
  });

  it("rejects broken weights, seed hashes, references, and protected profiles", () => {
    const weights = clone(registry);
    weights.numericGoals[0].weights.numerators[0] = 2;
    expect(() => validateRegistryObject(weights)).toThrow(/weight sum/);

    const seeds = clone(registry);
    seeds.seedSet.expandedSha256 = "0".repeat(64);
    expect(() => validateRegistryObject(seeds)).toThrow(/expandedSha256|seed SHA/);

    const reference = clone(registry);
    reference.evaluationSuites[0].assertionIds[0] = "missing-assertion-v1";
    expect(() => validateRegistryObject(reference)).toThrow(/suite assertion/);

    const protectedProfile = clone(registry);
    protectedProfile.profileRules.protectedTraitsMayNotSelectOrModifyProfile = false;
    expect(() => validateRegistryObject(protectedProfile)).toThrow(
      /protectedTraitsMayNotSelectOrModifyProfile|protected profile/
    );

    const derivedTraits = clone(registry);
    derivedTraits.profileRules.profileMayNotBeDerivedFrom = Array.from({ length: 8 }, (_, index) => `arbitrary${index}`);
    expect(() => validateRegistryObject(derivedTraits)).toThrow(/protected profile derivation dimensions/);

    const mechanicalTraits = clone(registry);
    mechanicalTraits.profileRules.forbiddenMechanicalDimensions = Array.from({ length: 8 }, (_, index) => `arbitrary${index}`);
    expect(() => validateRegistryObject(mechanicalTraits)).toThrow(/forbidden mechanical dimensions/);

    const threshold = clone(registry);
    threshold.assertions[0].lowerThresholdPath = "/metrics/missingThreshold";
    expect(() => validateRegistryObject(threshold)).toThrow(/threshold path contract|unresolved JSON pointer/);

    const wrongThresholdDomain = clone(registry);
    wrongThresholdDomain.assertions[0].lowerThresholdPath = "/metrics/normalizedScoreDistance";
    expect(() => validateRegistryObject(wrongThresholdDomain)).toThrow(/threshold path contract/);

    const wrongNumericThresholdLeaf = clone(registry);
    wrongNumericThresholdLeaf.assertions[0].lowerThresholdPath = "/metrics/assistPerScorePointTolerance";
    expect(() => validateRegistryObject(wrongNumericThresholdLeaf)).toThrow(/threshold path contract/);

    const nestedNumericThresholdLeaf = clone(registry);
    nestedNumericThresholdLeaf.assertions[0].lowerThresholdPath = "/metrics/normalizedScoreDistance/denominator";
    expect(() => validateRegistryObject(nestedNumericThresholdLeaf)).toThrow(/threshold path contract/);

    const nestedPolicy = clone(registry);
    nestedPolicy.evaluationSuites[1].decisionComparison.policyA = "missing-policy-v1";
    expect(() => validateRegistryObject(nestedPolicy)).toThrow(/suite policy/);

    const numericNarrativeGoal = clone(registry);
    numericNarrativeGoal.canonicalPolicies.find(({ id }) => id === "choice-health-first-v1").algorithm.goalId = "learning-v1";
    expect(() => validateRegistryObject(numericNarrativeGoal)).toThrow(/policy goal domain/);

    const suitePolicyDomain = clone(registry);
    suitePolicyDomain.evaluationSuites[0].runnerPolicyId = "choice-balanced-v1";
    expect(() => validateRegistryObject(suitePolicyDomain)).toThrow(/suite policy domain/);

    const continuationDomain = clone(registry);
    continuationDomain.continuation.runnerPolicyId = "choice-balanced-v1";
    continuationDomain.continuation.choicePolicyId = "runner-manual-neutral-v1";
    expect(() => validateRegistryObject(continuationDomain)).toThrow(/continuation runner domain/);

    const emptySuite = clone(registry);
    emptySuite.evaluationSuites[0].assertionIds = [];
    expect(() => validateRegistryObject(emptySuite)).toThrow(/array is too short|empty suite/);
  });

  it("validates content-lock domains and rejects valid-looking bad hashes/references", () => {
    const hashes = {
      registry: "103bab03ba62e1619f9e745164135e067d41563f87090222cd5cc65e89454af5",
      registrySchema: "77596ffc1367560dd0a01b6071c319021bccac84a52d3d7c8e86b9f39bc30d0e",
    };
    expect(() => validateContentLock(validContentLock(), registry, hashes)).not.toThrow();

    const badHash = validContentLock();
    badHash.registry.registrySha256 = "a".repeat(64);
    expect(() => validateContentLock(badHash, registry, hashes)).toThrow(/registry hash/);

    const badSchemaHash = validContentLock();
    badSchemaHash.registry.registrySchemaSha256 = "a".repeat(64);
    expect(() => validateContentLock(badSchemaHash, registry, hashes)).toThrow(/registry schema hash/);

    const badSuite = validContentLock();
    badSuite.evaluation.suiteIds = ["missing-suite-v1"];
    expect(() => validateContentLock(badSuite, registry, hashes)).toThrow(/evaluation suites unknown|wrong-domain/);

    const badAssertion = validContentLock();
    badAssertion.evaluation.assertionIds[0] = "missing-assertion-v1";
    expect(() => validateContentLock(badAssertion, registry, hashes)).toThrow(/evaluation assertions unknown|wrong-domain/);

    const badHorizon = validContentLock();
    badHorizon.horizon.horizonId = "missing-horizon-v1";
    expect(() => validateContentLock(badHorizon, registry, hashes)).toThrow(/content-lock horizon|schema .*\/horizon/);

    const badStage = validContentLock();
    badStage.content.patternIds.push("wrong-stage-v1");
    badStage.horizon.startStageId = "wrong-stage-v1";
    expect(() => validateContentLock(badStage, registry, hashes)).toThrow(/horizon startStageId/);

    const badContext = validContentLock();
    badContext.expectedDirectionalResults[0].contextId = "missing-context-v1";
    expect(() => validateContentLock(badContext, registry, hashes)).toThrow(/expected context/);

    const crossDomainContent = validContentLock();
    crossDomainContent.content.choiceIds = [crossDomainContent.content.patternIds[0]];
    expect(() => validateContentLock(crossDomainContent, registry, hashes)).toThrow(/content IDs collide across domains/);

    const badOption = validContentLock();
    badOption.content.choiceIds = ["choice-runner-lab-v1"];
    badOption.content.optionIds = ["option-runner-lab-v1"];
    badOption.horizon = {
      horizonId: "option-effect-v1",
      startStageId: "runner-lab-v1",
      endStageId: "runner-lab-v1",
      includedCallbackIds: [],
      optionIds: ["choice-runner-lab-v1"],
    };
    expect(() => validateContentLock(badOption, registry, hashes)).toThrow(/horizon options unknown|wrong-domain/);

    const narrativeBase = validContentLock();
    narrativeBase.content.choiceIds = ["choice-runner-lab-v1"];
    narrativeBase.content.optionIds = ["option-runner-lab-v1"];
    narrativeBase.content.evidenceIds = ["evidence-runner-lab-v1"];
    narrativeBase.evaluation.narrativeGoalMappings = [{
      optionId: "option-runner-lab-v1",
      goalIds: ["learning-v1"],
      qualifyingEvidenceIds: ["evidence-runner-lab-v1"],
    }];
    expect(() => validateContentLock(narrativeBase, registry, hashes)).not.toThrow();
    const badGoal = clone(narrativeBase);
    badGoal.evaluation.narrativeGoalMappings[0].goalIds = ["missing-goal-v1"];
    expect(() => validateContentLock(badGoal, registry, hashes)).toThrow(/narrative goals unknown|wrong-domain/);
    const badEvidence = clone(narrativeBase);
    badEvidence.evaluation.narrativeGoalMappings[0].qualifyingEvidenceIds = ["option-runner-lab-v1"];
    expect(() => validateContentLock(badEvidence, registry, hashes)).toThrow(/narrative evidence unknown|wrong-domain/);
    const badNarrativeOption = clone(narrativeBase);
    badNarrativeOption.evaluation.narrativeGoalMappings[0].optionId = "evidence-runner-lab-v1";
    expect(() => validateContentLock(badNarrativeOption, registry, hashes)).toThrow(/narrative option/);

    const badComparator = validContentLock();
    badComparator.content.comparatorIds = ["comparator-runner-lab-v1"];
    badComparator.evaluation.comparatorIds = ["runner-lab-context-v1"];
    expect(() => validateContentLock(badComparator, registry, hashes)).toThrow(/comparators unknown|wrong-domain/);

    const badCareer = validContentLock();
    badCareer.content.phaseId = "phase-6";
    badCareer.content.careerOfferIds = ["career-runner-lab-v1"];
    badCareer.horizon = {
      horizonId: "phase6-career-ending-v1",
      includedCallbackIds: [],
      careerOfferIds: ["runner-lab-pattern-v1"],
    };
    expect(() => validateContentLock(badCareer, registry, hashes)).toThrow(/horizon careers unknown|wrong-domain/);

    const badContentVersion = validContentLock();
    badContentVersion.content.contentVersion = "Phase 2";
    expect(() => validateContentLock(badContentVersion, registry, hashes)).toThrow(/contentVersion|content version/);

    const badPhaseVersion = validContentLock();
    badPhaseVersion.content.phaseId = "phase-12";
    expect(() => validateContentLock(badPhaseVersion, registry, hashes)).toThrow(/phaseId|phase ID/);

    const wrongPolicyDomain = validContentLock();
    wrongPolicyDomain.evaluation.runnerPolicyIds = ["choice-balanced-v1"];
    expect(() => validateContentLock(wrongPolicyDomain, registry, hashes)).toThrow(/wrong domain/);

    const badGoalRegistry = clone(registry);
    badGoalRegistry.canonicalPolicies[5].algorithm.goalId = "missing-goal-v1";
    expect(() => validateRegistryObject(badGoalRegistry)).toThrow(/policy goal/);

    const badMetricRegistry = clone(registry);
    badMetricRegistry.evaluationSuites[1].distanceMetric = "missingMetric";
    expect(() => validateRegistryObject(badMetricRegistry)).toThrow(/distanceMetric|must equal|suite metric/);

    const unknownNestedKey = validContentLock();
    unknownNestedKey.review.surprise = true;
    expect(() => validateContentLock(unknownNestedKey, registry, hashes)).toThrow(/unknown property surprise/);

    const incompleteSuite = validContentLock();
    incompleteSuite.evaluation.assertionIds = ["runner-share-bounds-v1"];
    expect(() => validateContentLock(incompleteSuite, registry, hashes)).toThrow(/suite assertion closure/);

    const missingSuitePolicy = validContentLock();
    missingSuitePolicy.evaluation.choicePolicyIds = ["choice-balanced-v1"];
    expect(() => validateContentLock(missingSuitePolicy, registry, hashes)).toThrow(/suite choice policy closure/);

    const badCallback = validContentLock();
    badCallback.horizon.includedCallbackIds = ["missing-callback-v1"];
    expect(() => validateContentLock(badCallback, registry, hashes)).toThrow(/horizon callbacks/);

    const wrongPhaseContent = validContentLock();
    wrongPhaseContent.content.phaseId = "phase-4";
    expect(() => validateContentLock(wrongPhaseContent, registry, hashes)).toThrow(/phase-applicable content/);

    const duplicateExpected = validContentLock();
    duplicateExpected.expectedDirectionalResults.push(clone(duplicateExpected.expectedDirectionalResults[0]));
    expect(() => validateContentLock(duplicateExpected, registry, hashes)).toThrow(/unique|duplicate/);

    const unknownSupersession = validContentLock();
    unknownSupersession.supersession = {
      supersedesLockId: "prior-runner-lock-v1",
      reason: "A new callback target materially changes the locked horizon.",
      newlyRealizedCallbackIds: [],
    };
    expect(() => validateContentLock(unknownSupersession, registry, hashes)).toThrow(/unknown superseded lock/);
  });

  it("rejects duplicate, cyclic, and callback-inconsistent content-lock lineages", () => {
    const hashes = {
      registry: "103bab03ba62e1619f9e745164135e067d41563f87090222cd5cc65e89454af5",
      registrySchema: "77596ffc1367560dd0a01b6071c319021bccac84a52d3d7c8e86b9f39bc30d0e",
    };
    const first = validContentLock();
    const second = clone(first);
    second.lockId = "runner-lab-content-lock-v2";
    second.content.contentVersion = "runner-lab-v2";
    second.content.callbackIds = ["runner-lab-callback-v1"];
    second.supersession = {
      supersedesLockId: first.lockId,
      reason: "A newly implemented callback changes the locked runner laboratory horizon.",
      newlyRealizedCallbackIds: ["runner-lab-callback-v1"],
    };
    const records = [
      { filename: `${first.lockId}.json`, lock: first },
      { filename: `${second.lockId}.json`, lock: second },
    ];
    expect(() => validateContentLockCollection(records, registry, hashes)).not.toThrow();

    const duplicate = [records[0], { filename: "duplicate-filename-v1.json", lock: clone(first) }];
    expect(() => validateContentLockCollection(duplicate, registry, hashes)).toThrow(/duplicate content lock ID/);

    const cycleFirst = clone(first);
    cycleFirst.supersession = {
      supersedesLockId: second.lockId,
      reason: "This deliberately invalid lineage points back to the successor lock.",
      newlyRealizedCallbackIds: [],
    };
    expect(() => validateContentLockCollection([
      { filename: `${cycleFirst.lockId}.json`, lock: cycleFirst },
      records[1],
    ], registry, hashes)).toThrow(/supersession cycle/);

    const missingCallbackDelta = clone(second);
    missingCallbackDelta.supersession.newlyRealizedCallbackIds = [];
    expect(() => validateContentLockCollection([
      records[0],
      { filename: `${missingCallbackDelta.lockId}.json`, lock: missingCallbackDelta },
    ], registry, hashes)).toThrow(/newly realized callback delta/);

    expect(() => validateContentLockCollection([
      { filename: "wrong-name-v1.json", lock: first },
    ], registry, hashes)).toThrow(/content lock filename/);

    expect(() => validateContentLockSuiteEvidence(records, registry, [])).toThrow(/evidence unavailable/);
    expect(() => validateContentLockSuiteEvidence(records, registry, [], {
      requireAll: false,
      allowMissingLockIds: new Set(records.map(({ lock }) => lock.lockId)),
    })).not.toThrow();
    expect(() => validateContentLockSuiteEvidence([], registry, [{
      filename: "unknown-content-lock-v1.json",
      schemaVersion: 1,
      lockId: "unknown-content-lock-v1",
      evaluationBatchId: "phase-3-evaluation-batch-v1",
      evaluatedSourceSha256: "a".repeat(64),
      reports: [],
    }])).toThrow(/unknown lock/);
    const lineageEvidence = records.map(({ lock }, index) => ({
      filename: `${lock.lockId}.json`,
      schemaVersion: 1,
      lockId: lock.lockId,
      evaluationBatchId: index === 0 ? "phase-3-evaluation-batch-v1" : "phase-3-evaluation-batch-v2",
      evaluatedSourceSha256: "a".repeat(64),
      reports: completeEvidenceReports(lock),
    }));
    expect(() => validateContentLockSuiteEvidence(records, registry, lineageEvidence, {
      requireAll: false,
      expectedSourceSha256: null,
    })).not.toThrow();
    expect(() => validateContentLockSuiteEvidence(records, registry, [lineageEvidence[0]], {
      requireAll: false,
      requireCommonBatch: false,
      allowMissingLockIds: new Set([second.lockId]),
    })).not.toThrow();
    expect(() => validateContentLockSuiteEvidence(records, registry, [], {
      requireAll: false,
      requireCommonBatch: false,
      allowMissingLockIds: new Set([second.lockId]),
    })).toThrow(new RegExp(`evidence unavailable for ${first.lockId}`));
    expect(() => validateContentLockSuiteEvidence(records, registry, lineageEvidence)).toThrow(/batch mismatch/);
    lineageEvidence[1].evaluationBatchId = lineageEvidence[0].evaluationBatchId;
    lineageEvidence[1].evaluatedSourceSha256 = "b".repeat(64);
    expect(() => validateContentLockSuiteEvidence(records, registry, lineageEvidence)).toThrow(/evaluated source batch mismatch/);
    lineageEvidence[1].evaluatedSourceSha256 = lineageEvidence[0].evaluatedSourceSha256;
    expect(() => validateContentLockSuiteEvidence(records, registry, lineageEvidence, {
      expectedSourceSha256: "b".repeat(64),
    })).toThrow(/evaluated source mismatch/);
  });

  it("binds suite evidence to deterministic source while excluding evidence output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-evaluation-source-"));
    try {
      for (const file of [
        "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md",
        "index.html",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.choice-of-life-core.json",
        "tsconfig.runner-evaluator.json",
        "vite.config.ts",
        "src/main.ts",
      ]) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), `${file}\n`, "utf8");
      }
      await mkdir(path.join(root, "src/choice-of-life/core"), { recursive: true });
      await mkdir(path.join(root, "scripts"), { recursive: true });
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 1;\n", "utf8");
      await writeFile(path.join(root, "scripts/evaluator.py"), "value = 1\n", "utf8");
      const initial = await evaluationSourceSha256(root);
      await writeFile(
        path.join(root, "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md"),
        "# Changed normative implementation plan\n",
        "utf8",
      );
      expect(await evaluationSourceSha256(root)).not.toBe(initial);
      await writeFile(
        path.join(root, "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md"),
        "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md\n",
        "utf8",
      );
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 1;\r\n", "utf8");
      await writeFile(path.join(root, "scripts/evaluator.py"), "value = 1\r\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await mkdir(path.join(root, "docs/balance/evaluation-results"), { recursive: true });
      await writeFile(path.join(root, "docs/balance/evaluation-results/result.json"), "{}\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await mkdir(path.join(root, "docs/balance/runner-evaluation-results"), { recursive: true });
      await writeFile(path.join(root, "docs/balance/runner-evaluation-results/result.json"), "{}\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await writeFile(path.join(root, "index.html"), "<main id=\"changed\"></main>\n", "utf8");
      expect(await evaluationSourceSha256(root)).not.toBe(initial);
      await writeFile(path.join(root, "index.html"), "index.html\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 2;\n", "utf8");
      expect(await evaluationSourceSha256(root)).not.toBe(initial);
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 1;\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await writeFile(path.join(root, "tsconfig.runner-evaluator.json"), "{\"strict\":false}\n", "utf8");
      expect(await evaluationSourceSha256(root)).not.toBe(initial);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("hard-fails unavailable, skipped, empty, or assertion-incomplete active suites", () => {
    const lock = validContentLock();
    const complete = completeEvidenceReports(lock);
    expect(() => validateActiveSuiteExecution(lock, registry, complete)).not.toThrow();
    expect(() => validateActiveSuiteExecution(lock, registry, [])).toThrow(/report count|unavailable/);
    for (const status of ["skipped", "unavailable"]) {
      const reports = clone(complete);
      reports[0].status = status;
      expect(() => validateActiveSuiteExecution(lock, registry, reports)).toThrow(/skipped\/unavailable/);
    }
    const noContexts = clone(complete);
    noContexts[0].contextIds = [];
    expect(() => validateActiveSuiteExecution(lock, registry, noContexts)).toThrow(/context closure/);
    const tooFewRuns = clone(complete);
    tooFewRuns[0].runCount -= 1;
    expect(() => validateActiveSuiteExecution(lock, registry, tooFewRuns)).toThrow(/run population/);
    const tooFewSeeds = clone(complete);
    tooFewSeeds[0].seedCount -= 1;
    expect(() => validateActiveSuiteExecution(lock, registry, tooFewSeeds)).toThrow(/seed population/);
    const noAssertions = clone(complete);
    noAssertions[0].assertionResults = [];
    expect(() => validateActiveSuiteExecution(lock, registry, noAssertions)).toThrow(/assertions|array/);
    const zeroAssertionRuns = clone(complete);
    zeroAssertionRuns[0].assertionResults[0].runCount = 0;
    expect(() => validateActiveSuiteExecution(lock, registry, zeroAssertionRuns)).toThrow(/assertion run population/);
    const failedAssertion = clone(complete);
    failedAssertion[0].assertionResults[0].passed = false;
    expect(() => validateActiveSuiteExecution(lock, registry, failedAssertion)).toThrow(/assertion failed/);
    const duplicatePolicyCell = clone(complete);
    duplicatePolicyCell[0].policyCellIds[1] = duplicatePolicyCell[0].policyCellIds[0];
    expect(() => validateActiveSuiteExecution(lock, registry, duplicatePolicyCell)).toThrow(/policy closure/);
  });
});

describe("additive phase manifests and preregistration fixtures", () => {
  it("keeps copied Phase 1 baselines isolated from worktree Phase 2 drafts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-baseline-isolation-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await expect(verifyAdditiveLockManifests(root)).resolves.toMatchObject({
        manifestCount: 0,
        fileCount: 0,
        records: [],
      });
      await expect(validateFixturePreregistration(root)).resolves.toMatchObject({
        manifests: 2,
        manifestFiles: 10,
        additiveManifests: 0,
        additiveManifestFiles: 0,
        contentLocks: 0,
        runnerFixtures: 0,
        runnerEvidence: 0,
        newbornFixtures: 0,
        newbornEvidence: 0,
      });
      await writeFile(path.join(root, "docs", "phase-specs", "phase-2.md"), "# orphan Phase 2\n", "utf8");
      await expect(validateFixturePreregistration(root)).rejects.toThrow(/requires docs\/phase-specs\/phase-2-lock-manifest\.json/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers exact Phase 2 and Phase 3 bundles while keeping Phase 3 preregistration evidence-free", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-bundle-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await writePhase2Bundle(root);
      await expect(verifyAdditiveLockManifests(root)).resolves.toMatchObject({
        manifestCount: 1,
        fileCount: 4,
        protectedPaths: expect.arrayContaining([
          "docs/phase-specs/phase-2.md",
          "docs/balance/locks/runner-laboratory-content-lock-v1.json",
          "docs/balance/runner-fixture-v1.schema.json",
          "docs/balance/runner-fixtures/runner-laboratory-fixture-v1.json",
        ]),
      });
      await expect(validateFixturePreregistration(root)).resolves.toMatchObject({
        manifests: 3,
        manifestFiles: 14,
        additiveManifests: 1,
        additiveManifestFiles: 4,
        contentLocks: 1,
        runnerFixtures: 1,
        runnerEvidence: 0,
      });

      await writePhase3Bundle(root);
      await expect(verifyAdditiveLockManifests(root)).resolves.toMatchObject({
        manifestCount: 2,
        fileCount: 8,
        protectedPaths: expect.arrayContaining([
          "docs/phase-specs/phase-3.md",
          "docs/balance/locks/newborn-stage-content-lock-v1.json",
          "docs/balance/newborn-fixture-v1.schema.json",
          "docs/balance/newborn-fixtures/newborn-stage-fixture-v1.json",
        ]),
      });
      await expect(validateFixturePreregistration(root)).resolves.toMatchObject({
        manifests: 4,
        manifestFiles: 18,
        additiveManifests: 2,
        additiveManifestFiles: 8,
        contentLocks: 2,
        runnerFixtures: 1,
        runnerEvidence: 0,
        newbornFixtures: 1,
        newbornEvidence: 0,
      });
      await expect(validateFixtureLocks(root, {
        requireSuiteEvidence: true,
        verifyHistory: false,
      })).rejects.toThrow(/Phase 3 implementation validator unavailable/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects additive manifest hash edits, missing/extra fields, and wrong Phase 2 membership", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-manifest-mutants-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await writePhase2Bundle(root);
      const manifestPath = path.join(root, "docs", "phase-specs", "phase-2-lock-manifest.json");
      const phasePath = path.join(root, "docs", "phase-specs", "phase-2.md");
      await writeFile(phasePath, "# silently retuned Phase 2\n", "utf8");
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/hash mismatch/);

      await writePhase2Bundle(root);
      const withExtra = JSON.parse(await readFile(manifestPath, "utf8"));
      withExtra.surprise = true;
      await writeJson(manifestPath, withExtra);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/keys .*surprise/);

      await writePhase2Bundle(root);
      const missing = JSON.parse(await readFile(manifestPath, "utf8"));
      delete missing.status;
      await writeJson(manifestPath, missing);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/keys .*status/);

      await writePhase2Bundle(root);
      const wrongId = JSON.parse(await readFile(manifestPath, "utf8"));
      wrongId.manifestId = "unrelated-but-valid-v1";
      await writeJson(manifestPath, wrongId);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/canonical ID/);

      await writePhase2Bundle(root);
      const incomplete = JSON.parse(await readFile(manifestPath, "utf8"));
      incomplete.files.pop();
      await writeJson(manifestPath, incomplete);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/Phase 2 manifest exact protected path set/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("pins the Phase 3 predecessor, exact bundle membership, structural IDs, and closed schema", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-structure-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await writePhase2Bundle(root);
      const { fixture, contentLock } = await writePhase3Bundle(root);
      const schemaPath = path.join(root, "docs", "balance", "newborn-fixture-v1.schema.json");
      const manifestPath = path.join(root, "docs", "phase-specs", "phase-3-lock-manifest.json");
      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      expect(() => validatePhase3PreregistrationFixture(fixture, schema, contentLock)).not.toThrow();
      const structurallyExtendedFixture = {
        ...validPhase3Fixture(),
        futureLockedContract: { opaqueUntilPhase3Lock: true },
      };
      expect(() => validatePhase3PreregistrationFixture(
        structurallyExtendedFixture,
        closedLiteralSchema(structurallyExtendedFixture, {
          id: "https://choice-of-life.example/schemas/newborn-fixture-v1.schema.json",
          title: "Choice of Life Newborn Stage Fixture v1",
        }),
        phase3ContentLock(),
      )).not.toThrow();

      const wrongPredecessorHash = JSON.parse(await readFile(manifestPath, "utf8"));
      wrongPredecessorHash.predecessorManifestSha256 = "0".repeat(64);
      await writeJson(manifestPath, wrongPredecessorHash);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/predecessor hash/);

      await writePhase3Bundle(root);
      const wrongPredecessorId = JSON.parse(await readFile(manifestPath, "utf8"));
      wrongPredecessorId.predecessorManifestId = "phase-1-preregistration-lock-v1";
      await writeJson(manifestPath, wrongPredecessorId);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/Phase 3 manifest predecessor ID/);

      await writePhase3Bundle(root);
      await rm(path.join(root, "docs", "phase-specs", "phase-2-lock-manifest.json"));
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/requires the registered Phase 2 predecessor/);
      await writePhase2Bundle(root);

      await writePhase3Bundle(root);
      await writeFile(path.join(root, "docs", "phase-specs", "phase-3.md"), "# mutated Phase 3\n", "utf8");
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/hash mismatch docs\/phase-specs\/phase-3\.md/);

      await writePhase3Bundle(root);
      const missingProtectedPath = JSON.parse(await readFile(manifestPath, "utf8"));
      missingProtectedPath.files.pop();
      await writeJson(manifestPath, missingProtectedPath);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/Phase 3 manifest exact protected path set/);

      await writePhase3Bundle(root);
      const extraPath = "docs/balance/newborn-fixtures/unregistered-extra.json";
      await writeJson(path.join(root, ...extraPath.split("/")), { fixtureId: "unregistered-extra-v1" });
      const extraProtectedPath = JSON.parse(await readFile(manifestPath, "utf8"));
      extraProtectedPath.files.push({
        path: extraPath,
        sha256: sha256(await readFile(path.join(root, ...extraPath.split("/")))),
      });
      await writeJson(manifestPath, extraProtectedPath);
      await expect(verifyAdditiveLockManifests(root)).rejects.toThrow(/Phase 3 manifest exact protected path set/);
      await rm(path.join(root, ...extraPath.split("/")));

      const wrongFixtureId = validPhase3Fixture();
      wrongFixtureId.fixtureId = "other-newborn-fixture-v1";
      await writePhase3Bundle(root, { fixture: wrongFixtureId });
      await expect(validateFixturePreregistration(root)).rejects.toThrow(/Phase 3 newborn fixture ID/);

      await writePhase3Bundle(root);
      const wrongSchemaId = JSON.parse(await readFile(schemaPath, "utf8"));
      wrongSchemaId.$id = "https://choice-of-life.example/schemas/other-newborn-v1.schema.json";
      await writeJson(schemaPath, wrongSchemaId);
      const selfConsistentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      selfConsistentManifest.files.find(({ path: filePath }) =>
        filePath === "docs/balance/newborn-fixture-v1.schema.json"
      ).sha256 = sha256(await readFile(schemaPath));
      await writeJson(manifestPath, selfConsistentManifest);
      await expect(validateFixturePreregistration(root)).rejects.toThrow(/Phase 3 newborn schema stable ID/);

      const openSchema = closedLiteralSchema(validPhase3Fixture(), {
        id: "https://choice-of-life.example/schemas/newborn-fixture-v1.schema.json",
        title: "Choice of Life Newborn Stage Fixture v1",
      });
      openSchema.additionalProperties = true;
      expect(() => validatePhase3PreregistrationFixture(
        validPhase3Fixture(),
        openSchema,
        phase3ContentLock(),
      )).toThrow(/permits additional properties/);

      const wrongContentLock = phase3ContentLock();
      wrongContentLock.lockId = "other-newborn-content-lock-v1";
      expect(() => validatePhase3PreregistrationFixture(
        validPhase3Fixture(),
        closedLiteralSchema(validPhase3Fixture(), {
          id: "https://choice-of-life.example/schemas/newborn-fixture-v1.schema.json",
          title: "Choice of Life Newborn Stage Fixture v1",
        }),
        wrongContentLock,
      )).toThrow(/Phase 3 newborn content lock ID/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects orphan Phase 3 files and any evidence before an implementation validator exists", async () => {
    const orphanRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-orphan-"));
    const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-evidence-"));
    try {
      await copyDocsWithoutContentLocks(orphanRoot);
      const orphanPath = path.join(orphanRoot, "docs", "balance", "newborn-fixture-v1.schema.json");
      await writeJson(orphanPath, { $schema: "https://json-schema.org/draft/2020-12/schema" });
      await expect(validateFixturePreregistration(orphanRoot)).rejects.toThrow(
        /unexpected Phase 3 newborn schema entries|newborn-fixture-v1\.schema\.json requires/
      );

      await copyDocsWithoutContentLocks(evidenceRoot);
      await writePhase2Bundle(evidenceRoot);
      await writePhase3Bundle(evidenceRoot);
      const unregisteredFixturePath = path.join(
        evidenceRoot,
        "docs",
        "balance",
        "newborn-fixtures",
        "unregistered-newborn-v1.json",
      );
      await writeJson(unregisteredFixturePath, { fixtureId: "unregistered-newborn-v1" });
      await expect(validateFixturePreregistration(evidenceRoot)).rejects.toThrow(
        /unexpected Phase 3 newborn fixture entries/
      );
      await rm(unregisteredFixturePath);
      await writeJson(
        path.join(
          evidenceRoot,
          "docs",
          "balance",
          "evaluation-results",
          "newborn-stage-content-lock-v1.json",
        ),
        {
          schemaVersion: 1,
          lockId: "newborn-stage-content-lock-v1",
          evaluationBatchId: "premature-newborn-evaluation-v1",
          evaluatedSourceSha256: "a".repeat(64),
          reports: [],
        },
      );
      await expect(validateFixturePreregistration(evidenceRoot)).rejects.toThrow(
        /Phase 3 evidence is premature until an implementation validator is registered/
      );
    } finally {
      await rm(orphanRoot, { recursive: true, force: true });
      await rm(evidenceRoot, { recursive: true, force: true });
    }
  });

  it("accepts a genuinely new Phase 3 docs-only bundle and rejects later byte edits or deletion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-history-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await initialiseGitRepository(root);
      await commitAll(root, "docs: establish Phase 1 baseline");
      const { stdout: baseOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const baseRevision = baseOutput.trim();
      await writePhase2Bundle(root);
      await commitAll(root, "docs: preregister Phase 2 runner bundle");
      await writePhase3Bundle(root);
      await commitAll(root, "docs: preregister Phase 3 newborn bundle");

      const additive = await verifyAdditiveLockManifests(root);
      await expect(verifyGitAdditiveManifestBundles(root, additive.records)).resolves.toBeUndefined();
      await expect(validateCommittedFixturePreregistration(root, { baseRevision })).resolves.toMatchObject({
        additiveManifests: 2,
        runnerFixtures: 1,
        runnerEvidence: 0,
        newbornFixtures: 1,
        newbornEvidence: 0,
      });

      await writeFile(path.join(root, "docs", "phase-3-follow-up.md"), "Follow-up review note.\n", "utf8");
      await commitAll(root, "docs: follow up after Phase 3 preregistration");
      await expect(validateCommittedFixturePreregistration(root, { baseRevision })).resolves.toMatchObject({
        newbornFixtures: 1,
        newbornEvidence: 0,
      });

      const manifestPath = path.join(root, "docs", "phase-specs", "phase-3-lock-manifest.json");
      const phasePath = path.join(root, "docs", "phase-specs", "phase-3.md");
      await writeFile(phasePath, "# self-consistent but edited Phase 3\n", "utf8");
      const editedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      editedManifest.files.find(({ path: filePath }) => filePath === "docs/phase-specs/phase-3.md").sha256 =
        sha256(await readFile(phasePath));
      await writeJson(manifestPath, editedManifest);
      const edited = await verifyAdditiveLockManifests(root);
      await expect(verifyGitAdditiveManifestBundles(root, edited.records)).rejects.toThrow(
        /creation blob differs|current bytes differ/
      );

      await rm(manifestPath);
      await expect(verifyHistoricalAdditiveManifestPaths(
        root,
        ["docs/phase-specs/phase-2-lock-manifest.json"],
      )).rejects.toThrow(/historical additive manifests differ/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("requires refreshed Phase 2 suite and runner evidence in the Phase 3 docs-only lock commit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-current-evidence-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await initialiseGitRepository(root);
      await commitAll(root, "docs: establish Phase 1 baseline");
      const { fixture, contentLock } = await writePhase2Bundle(root);
      await commitAll(root, "docs: preregister Phase 2 runner bundle");
      await writeEvaluationSourceSkeleton(root);
      await commitAll(root, "test: establish evaluated source skeleton");
      const phase2Digest = await evaluationSourceSha256(root);
      await writePhase2Evidence(root, fixture, contentLock, phase2Digest);
      await commitAll(root, "docs: record complete Phase 2 evidence");
      await expect(validateFixtureLocks(root)).resolves.toMatchObject({
        runnerFixtures: 1,
        runnerEvidence: 1,
      });
      const { stdout: baseOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const phase3BaseRevision = baseOutput.trim();

      await writePhase3Bundle(root);
      await expect(validateFixturePreregistration(root)).rejects.toThrow(/active suite evaluated source mismatch/);

      const currentDigest = await evaluationSourceSha256(root);
      const suiteEvidencePath = path.join(
        root,
        "docs",
        "balance",
        "evaluation-results",
        `${contentLock.lockId}.json`,
      );
      const runnerEvidencePath = path.join(
        root,
        "docs",
        "balance",
        "runner-evaluation-results",
        `${fixture.fixtureId}.json`,
      );
      const refreshedSuiteEvidence = JSON.parse(await readFile(suiteEvidencePath, "utf8"));
      refreshedSuiteEvidence.evaluatedSourceSha256 = currentDigest;
      await writeJson(suiteEvidencePath, refreshedSuiteEvidence);
      await expect(validateFixturePreregistration(root)).rejects.toThrow(/runner evidence evaluated source mismatch/);

      await writeJson(runnerEvidencePath, validRunnerEvidence(fixture, currentDigest));
      await commitAll(root, "docs: lock Phase 3 and refresh Phase 2 evidence");
      await expect(validateCommittedFixturePreregistration(root)).resolves.toMatchObject({
        runnerEvidence: 1,
        newbornFixtures: 1,
        newbornEvidence: 0,
      });
      await expect(validateCommittedFixturePreregistration(root, {
        baseRevision: phase3BaseRevision,
      })).resolves.toMatchObject({
        runnerFixtures: 1,
        runnerEvidence: 1,
        newbornFixtures: 1,
        newbornEvidence: 0,
      });
      const { stdout: changedPathsOutput } = await execFileAsync(
        "git",
        ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "HEAD"],
        { cwd: root },
      );
      expect(changedPathsOutput.trim().split(/\r?\n/).every((filePath) => filePath.startsWith("docs/"))).toBe(true);
      expect(changedPathsOutput).toContain("docs/balance/evaluation-results/runner-laboratory-content-lock-v1.json");
      expect(changedPathsOutput).toContain("docs/balance/runner-evaluation-results/runner-laboratory-fixture-v1.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects Phase 3 split creation commits and non-doc files in its creation commit", async () => {
    const splitRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-split-"));
    const mixedRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase3-mixed-"));
    try {
      await copyDocsWithoutContentLocks(splitRoot);
      await initialiseGitRepository(splitRoot);
      await commitAll(splitRoot, "docs: establish Phase 1 baseline");
      await writePhase2Bundle(splitRoot);
      await commitAll(splitRoot, "docs: preregister Phase 2 runner bundle");
      await writePhase3Bundle(splitRoot);
      const splitManifestPath = path.join(splitRoot, "docs", "phase-specs", "phase-3-lock-manifest.json");
      const splitManifestBytes = await readFile(splitManifestPath);
      await rm(splitManifestPath);
      await commitAll(splitRoot, "docs: create Phase 3 protected files separately");
      await writeFile(splitManifestPath, splitManifestBytes);
      await commitAll(splitRoot, "docs: create Phase 3 manifest too late");
      const split = await verifyAdditiveLockManifests(splitRoot);
      await expect(verifyGitAdditiveManifestBundles(splitRoot, split.records)).rejects.toThrow(
        /share one byte-creation commit/
      );

      await copyDocsWithoutContentLocks(mixedRoot);
      await initialiseGitRepository(mixedRoot);
      await commitAll(mixedRoot, "docs: establish Phase 1 baseline");
      await writePhase2Bundle(mixedRoot);
      await commitAll(mixedRoot, "docs: preregister Phase 2 runner bundle");
      await writePhase3Bundle(mixedRoot);
      await mkdir(path.join(mixedRoot, "src"), { recursive: true });
      await writeFile(path.join(mixedRoot, "src", "premature-newborn.ts"), "export const premature = true;\n", "utf8");
      await commitAll(mixedRoot, "feat: mix newborn code into preregistration");
      const mixed = await verifyAdditiveLockManifests(mixedRoot);
      await expect(verifyGitAdditiveManifestBundles(mixedRoot, mixed.records)).rejects.toThrow(/docs-only commit/);
    } finally {
      await rm(splitRoot, { recursive: true, force: true });
      await rm(mixedRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("enforces a closed runner schema and semantic registry/content linkage", () => {
    const fixture = validRunnerFixture();
    const lock = phase2ContentLock();
    const schema = closedLiteralSchema(fixture);
    expect(() => validateRunnerFixture(fixture, schema, lock, registry)).not.toThrow();

    const extra = clone(fixture);
    extra.generator.surprise = true;
    expect(() => validateRunnerFixture(extra, schema, lock, registry)).toThrow(/unknown property surprise/);

    const missing = clone(fixture);
    delete missing.completion.completionMemory;
    expect(() => validateRunnerFixture(missing, schema, lock, registry)).toThrow(/missing required property completionMemory/);

    const selfConsistentWrongPhase = clone(fixture);
    selfConsistentWrongPhase.phaseId = "phase-3";
    expect(() => validateRunnerFixture(
      selfConsistentWrongPhase,
      closedLiteralSchema(selfConsistentWrongPhase),
      lock,
      registry,
    )).toThrow(/runner fixture phase ID/);

    const wrongProfiles = clone(fixture);
    wrongProfiles.population.profileIds.pop();
    expect(() => validateRunnerFixture(
      wrongProfiles,
      closedLiteralSchema(wrongProfiles),
      lock,
      registry,
    )).toThrow(/starting profile closure/);

    const wrongPatterns = clone(fixture);
    wrongPatterns.stage.patternIds.reverse();
    expect(() => validateRunnerFixture(
      wrongPatterns,
      closedLiteralSchema(wrongPatterns),
      lock,
      registry,
    )).toThrow(/pattern ID closure/);

    const wrongRuntime = clone(fixture);
    wrongRuntime.runtimeContentVersion = "runner-laboratory-content-v1";
    expect(() => validateRunnerFixture(
      wrongRuntime,
      closedLiteralSchema(wrongRuntime),
      lock,
      registry,
    )).toThrow(/runtime content version/);

    const changedKnownAnswer = clone(fixture);
    changedKnownAnswer.generator.knownAnswers[0].course[0].rotation = 1;
    expect(() => validateRunnerFixture(
      changedKnownAnswer,
      closedLiteralSchema(changedKnownAnswer),
      lock,
      registry,
    )).toThrow(/runner fixture generator/);

    const openLaneBoundary = clone(fixture);
    openLaneBoundary.collision.laneContactBoundary = "open";
    expect(() => validateRunnerFixture(
      openLaneBoundary,
      closedLiteralSchema(openLaneBoundary),
      lock,
      registry,
    )).toThrow(/runner fixture collision/);

    const outOfStateSemanticTarget = clone(fixture);
    outOfStateSemanticTarget.assist.targetStoredOutsideRunnerState = true;
    expect(() => validateRunnerFixture(
      outOfStateSemanticTarget,
      closedLiteralSchema(outOfStateSemanticTarget),
      lock,
      registry,
    )).toThrow(/runner fixture assist/);
  });

  it("rejects omission of the four legal idle-buffer bridge states", () => {
    const fixture = validRunnerFixture();
    fixture.movement.incomingStateClosure.total = 103;
    fixture.movement.incomingStateClosure.idle = 3;
    delete fixture.movement.incomingStateClosure.bufferedIdle;
    fixture.assertions.find(({ assertionId }) => assertionId === "runner-input-adjacency-v1").population = 309;
    expect(() => validateRunnerFixture(
      fixture,
      closedLiteralSchema(fixture),
      phase2ContentLock(),
      registry,
    )).toThrow(/runner fixture movement/);
  });

  it("rejects every reviewed second-revision contract mutant", () => {
    const rejectMutant = (mutate, expectedMessage) => {
      const mutant = clone(validRunnerFixture());
      mutate(mutant);
      expect(() => validateRunnerFixture(
        mutant,
        closedLiteralSchema(mutant),
        phase2ContentLock(),
        registry,
      )).toThrow(expectedMessage);
    };

    rejectMutant((fixture) => {
      fixture.completion.completionMemory.id = fixture.completion.completionMemory.memoryId;
      delete fixture.completion.completionMemory.memoryId;
    }, /runner fixture completion/);
    rejectMutant((fixture) => { fixture.completion.completionFact.valueId = "value-wrong-v1"; }, /runner fixture completion/);
    rejectMutant((fixture) => { fixture.assist.modes[1] = "semantic"; }, /runner fixture assist/);
    rejectMutant((fixture) => { fixture.stage.tickDurationMs = 21; }, /tick duration/);
    rejectMutant((fixture) => {
      fixture.generator.spawnCursorSemantics.triggerEvaluationBoundary = "before-input";
    }, /runner fixture generator/);
    rejectMutant((fixture) => {
      fixture.generator.spawnCursorSemantics.immediateAppendOrder.reverse();
    }, /runner fixture generator/);
    rejectMutant((fixture) => { fixture.movement.movingCurrentLaneRule = "target-during-motion"; }, /runner fixture movement/);
    rejectMutant((fixture) => { fixture.initialState.runner.motion.currentLane = 0; }, /runner fixture initial state/);
    rejectMutant((fixture) => {
      fixture.completion.stateProjectionContract.pendingByControlMode.manual.effectIds.push("effect-forbidden-v1");
    }, /runner fixture completion/);
    rejectMutant((fixture) => {
      fixture.completion.stateProjectionContract.unchangedFromEntryThroughPendingAndApplied.stageIdentity.ageMonths = 1;
    }, /runner fixture completion/);
    rejectMutant((fixture) => {
      fixture.assist.automaticDecisionCommit.oracleEntryReconstruction.liveAutomaticAssistHashAllowed = true;
    }, /runner fixture assist/);
    rejectMutant((fixture) => { fixture.replay.snapshotClosure.pop(); }, /runner fixture replay/);
    rejectMutant((fixture) => {
      fixture.collision.recoveryNullFutureInvulnerabilityRule.scope.stageId = "newborn-v1";
    }, /runner fixture collision/);
    rejectMutant((fixture) => {
      fixture.collision.recoveryNullFutureInvulnerabilityRule.proof.effectMustBeMostRecentNegativeRunnerEffect = false;
    }, /runner fixture collision/);
    rejectMutant((fixture) => { fixture.generator.entropyChannels[2] = "optional-variant"; }, /runner fixture generator/);
    rejectMutant((fixture) => { fixture.collision.simultaneousContactOrderWitness.expectedEffectOrder.reverse(); }, /runner fixture collision/);
    rejectMutant((fixture) => {
      fixture.collision.simultaneousContactOrderWitness.equivalentFinalProjection.shift();
    }, /runner fixture collision/);
    rejectMutant((fixture) => {
      fixture.collision.simultaneousContactOrderWitness.syntheticContactQualification.persistedRunStateAllowed = true;
    }, /runner fixture collision/);
    rejectMutant((fixture) => {
      fixture.collision.simultaneousContactOrderWitness.syntheticContactQualification.contactQualificationOverride = "same-x-only";
    }, /runner fixture collision/);
    rejectMutant((fixture) => {
      fixture.invariance.appearanceAxes.hairStyleId.pop();
      fixture.invariance.appearanceAxes.selectionCount = 384;
    }, /runner fixture invariance/);
    rejectMutant((fixture) => {
      fixture.accessibility.semanticChoiceAndReloadIdentity.pauseGuardReasons[1] = "blur";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.semanticChoiceAndReloadIdentity.semanticPersistenceIdentityFields.pop();
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.semanticChoiceAndReloadIdentity.manualGameplayParityExcludedFields.pop();
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.automaticNoInputCompletion.startActivationCount = 0;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.touchAndPointer.touchAction = "none";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.touchAndPointer.maximumActivePointers = 2;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.keyboardAndRemapping.ignoredInputContexts.pop();
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.keyboardAndRemapping.persistence = "localStorage";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.keyboardAndRemapping.immutableBindings[0].eventCode = "KeyW";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.keyboardAndRemapping.supplementalRemappableDefaults[0].ariaKeyshortcutsToken = "KeyW";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.semanticStructure.playfield.ariaHidden = false;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.semanticStructure.runnerStateSummary.fields.pop();
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.semanticStructure.scoreOutputs.visibleCount = 2;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.semanticStructure.decisionPrompt.renderCaseCount = 1079;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.contrast.largeTextMinimumRatio = "3:1";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.focusTransitions[3].expectedFocus = "pause-button";
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.interruptionCoalescing.hiddenThenBlur.focusInterruptionAdded = true;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.nonvisualManualReview.required = false;
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.accessibility.browserMatrix.reducedMotionPresentation.disabledEffects.pop();
    }, /runner fixture accessibility/);
    rejectMutant((fixture) => {
      fixture.assertions.find(({ assertionId }) => assertionId === "runner-accessibility-browser-matrix-v1").groupCounts.focus = 9;
    }, /runner fixture assertions/);
    rejectMutant((fixture) => {
      fixture.assist.rawLaneInputInSemanticAssist.keyboard = "enabled";
    }, /runner fixture assist/);

    const fixture = validRunnerFixture();
    const wrongDraft = closedLiteralSchema(fixture);
    wrongDraft.$schema = "http://json-schema.org/draft-07/schema#";
    expect(() => validateRunnerFixture(fixture, wrongDraft, phase2ContentLock(), registry)).toThrow(/runner schema draft/);
    const wrongId = closedLiteralSchema(fixture);
    wrongId.$id = "https://choice-of-life.example/schemas/mutable.json";
    expect(() => validateRunnerFixture(fixture, wrongId, phase2ContentLock(), registry)).toThrow(/runner schema stable ID/);
    const wrongTitle = closedLiteralSchema(fixture);
    wrongTitle.title = "Runner fixture";
    expect(() => validateRunnerFixture(fixture, wrongTitle, phase2ContentLock(), registry)).toThrow(/runner schema title/);
    const incompleteEvidenceLock = phase2ContentLock();
    incompleteEvidenceLock.content.evidenceIds.pop();
    expect(() => validateRunnerFixture(
      fixture,
      closedLiteralSchema(fixture),
      incompleteEvidenceLock,
      registry,
    )).toThrow(/content-lock evidence ID closure/);
  });

  it("requires exact, current, complete runner evidence and assertion populations", () => {
    const fixture = validRunnerFixture();
    const digest = "b".repeat(64);
    const complete = validRunnerEvidence(fixture, digest);
    expect(() => validateRunnerEvidence(fixture, complete, digest)).not.toThrow();
    expect(() => validateRunnerEvidence(fixture, undefined, digest)).toThrow(/runner evidence must be an object/);

    const missingManualReview = clone(complete);
    delete missingManualReview.manualReviewEvidence;
    expect(() => validateRunnerEvidence(fixture, missingManualReview, digest)).toThrow(/keys/);

    const unattestedManualReview = clone(complete);
    unattestedManualReview.manualReviewEvidence.session.reviewerAttestation = false;
    expect(() => validateRunnerEvidence(fixture, unattestedManualReview, digest)).toThrow(/manual review attestation/);

    const anonymousManualReview = clone(complete);
    anonymousManualReview.manualReviewEvidence.session.reviewerId = "anonymous";
    expect(() => validateRunnerEvidence(fixture, anonymousManualReview, digest)).toThrow(/reviewer ID/);

    const unboundedVersion = clone(complete);
    unboundedVersion.manualReviewEvidence.session.browserVersion = "x".repeat(33);
    expect(() => validateRunnerEvidence(fixture, unboundedVersion, digest)).toThrow(/browser version/);

    const impossibleCompletionTime = clone(complete);
    impossibleCompletionTime.manualReviewEvidence.session.completedAtUtc = "2026-02-30T00:00:00Z";
    expect(() => validateRunnerEvidence(fixture, impossibleCompletionTime, digest))
      .toThrow(/review completion time/);

    const futureCompletionTime = clone(complete);
    futureCompletionTime.manualReviewEvidence.session.completedAtUtc = "2999-01-01T00:00:00Z";
    expect(() => validateRunnerEvidence(fixture, futureCompletionTime, digest))
      .toThrow(/review completion time/);

    const missingForcedColorsInspection = clone(complete);
    missingForcedColorsInspection.manualReviewEvidence.session.forcedColorsInspectionPassed = false;
    expect(() => validateRunnerEvidence(fixture, missingForcedColorsInspection, digest)).toThrow(/forced-colors inspection/);

    const missingSemanticPromptInspection = clone(complete);
    missingSemanticPromptInspection.manualReviewEvidence.session.semanticDecisionPromptPassed = false;
    expect(() => validateRunnerEvidence(fixture, missingSemanticPromptInspection, digest)).toThrow(/decision prompt review/);

    const impossibleBrowserPlatform = clone(complete);
    impossibleBrowserPlatform.manualReviewEvidence.session.browser = "Safari";
    impossibleBrowserPlatform.manualReviewEvidence.artifact.sha256 = runnerManualReviewArtifactSha256(
      impossibleBrowserPlatform.manualReviewEvidence.session,
    );
    expect(() => validateRunnerEvidence(fixture, impossibleBrowserPlatform, digest)).toThrow(/browser platform compatibility/);

    const mismatchedManualArtifact = clone(complete);
    mismatchedManualArtifact.manualReviewEvidence.artifact.sha256 = "d".repeat(64);
    expect(() => validateRunnerEvidence(fixture, mismatchedManualArtifact, digest)).toThrow(/manual review artifact mismatch/);

    const transplantedManualSession = clone(complete);
    transplantedManualSession.manualReviewEvidence.session.evaluatedSourceSha256 = "c".repeat(64);
    transplantedManualSession.manualReviewEvidence.artifact.sha256 = runnerManualReviewArtifactSha256(
      transplantedManualSession.manualReviewEvidence.session,
    );
    expect(() => validateRunnerEvidence(fixture, transplantedManualSession, digest))
      .toThrow(/manual review source binding/);

    const reboundWithoutReattestation = clone(complete);
    reboundWithoutReattestation.evaluatedSourceSha256 = "c".repeat(64);
    reboundWithoutReattestation.manualReviewEvidence.session.evaluatedSourceSha256 = "c".repeat(64);
    expect(() => validateRunnerEvidence(fixture, reboundWithoutReattestation, "c".repeat(64)))
      .toThrow(/manual review artifact mismatch/);

    const stale = clone(complete);
    stale.evaluatedSourceSha256 = "c".repeat(64);
    expect(() => validateRunnerEvidence(fixture, stale, digest)).toThrow(/evaluated source mismatch/);

    const partial = clone(complete);
    partial.assertionResults.pop();
    expect(() => validateRunnerEvidence(fixture, partial, digest)).toThrow(/assertion ID closure/);

    const wrongPopulation = clone(complete);
    wrongPopulation.assertionResults[0].population -= 1;
    expect(() => validateRunnerEvidence(fixture, wrongPopulation, digest)).toThrow(/assertion population/);

    const wrongFailureCount = clone(complete);
    wrongFailureCount.assertionResults[0].failureCount = 1;
    expect(() => validateRunnerEvidence(fixture, wrongFailureCount, digest)).toThrow(/assertion failure count/);

    const missingFailureCount = clone(complete);
    delete missingFailureCount.assertionResults[0].failureCount;
    expect(() => validateRunnerEvidence(fixture, missingFailureCount, digest)).toThrow(/keys/);

    const browserResultIndex = complete.assertionResults.findIndex(
      ({ assertionId }) => assertionId === "runner-accessibility-browser-matrix-v1",
    );
    const wrongGroupCounts = clone(complete);
    wrongGroupCounts.assertionResults[browserResultIndex].groupCounts.focus = 9;
    expect(() => validateRunnerEvidence(fixture, wrongGroupCounts, digest)).toThrow(/assertion group counts/);

    const missingGroupCounts = clone(complete);
    delete missingGroupCounts.assertionResults[browserResultIndex].groupCounts;
    expect(() => validateRunnerEvidence(fixture, missingGroupCounts, digest)).toThrow(/keys/);

    const incomplete = clone(complete);
    incomplete.complete = false;
    expect(() => validateRunnerEvidence(fixture, incomplete, digest)).toThrow(/evidence is incomplete/);

    const failed = clone(complete);
    failed.assertionResults[0].passed = false;
    expect(() => validateRunnerEvidence(fixture, failed, digest)).toThrow(/assertion failed/);

    const skipped = clone(complete);
    skipped.assertionResults[0].status = "skipped";
    expect(() => validateRunnerEvidence(fixture, skipped, digest)).toThrow(/assertion incomplete/);

    const extra = clone(complete);
    extra.note = "not part of the evidence contract";
    expect(() => validateRunnerEvidence(fixture, extra, digest)).toThrow(/keys .*note/);
  });

  it("requires the separate runner evidence file in strict validation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-strict-evidence-"));
    try {
      await copyDocsWithoutContentLocks(root);
      const { fixture, contentLock } = await writePhase2Bundle(root);
      await writeEvaluationSourceSkeleton(root);
      const digest = await evaluationSourceSha256(root);
      await writeJson(
        path.join(root, "docs", "balance", "evaluation-results", `${contentLock.lockId}.json`),
        {
          schemaVersion: 1,
          lockId: contentLock.lockId,
          evaluationBatchId: "phase-2-evaluation-batch-v1",
          evaluatedSourceSha256: digest,
          reports: completeAssistEvidenceReports(contentLock),
        },
      );
      await expect(validateFixtureLocks(root, { verifyHistory: false })).rejects.toThrow(
        /runner evidence unavailable/
      );
      await writeJson(
        path.join(root, "docs", "balance", "runner-evaluation-results", `${fixture.fixtureId}.json`),
        validRunnerEvidence(fixture, digest),
      );
      await expect(validateFixtureLocks(root, { verifyHistory: false })).resolves.toMatchObject({
        runnerFixtures: 1,
        runnerEvidence: 1,
      });

      const runnerEvidencePath = path.join(
        root,
        "docs",
        "balance",
        "runner-evaluation-results",
        `${fixture.fixtureId}.json`,
      );
      const wrongFailureCount = validRunnerEvidence(fixture, digest);
      wrongFailureCount.assertionResults[0].failureCount = 1;
      await writeJson(runnerEvidencePath, wrongFailureCount);
      await expect(validateFixtureLocks(root, { verifyHistory: false })).rejects.toThrow(/assertion failure count/);

      const incompleteManualReview = validRunnerEvidence(fixture, digest);
      incompleteManualReview.manualReviewEvidence.session.keyboardOnlyPassed = false;
      await writeJson(runnerEvidencePath, incompleteManualReview);
      await expect(validateFixtureLocks(root, { verifyHistory: false })).rejects.toThrow(/keyboard-only review/);

      const wrongGroupCounts = validRunnerEvidence(fixture, digest);
      const browserResult = wrongGroupCounts.assertionResults.find(
        ({ assertionId }) => assertionId === "runner-accessibility-browser-matrix-v1",
      );
      browserResult.groupCounts.announcements = 8;
      await writeJson(runnerEvidencePath, wrongGroupCounts);
      await expect(validateFixtureLocks(root, { verifyHistory: false })).rejects.toThrow(/assertion group counts/);

      const missingGroupCounts = validRunnerEvidence(fixture, digest);
      delete missingGroupCounts.assertionResults[0].groupCounts;
      await writeJson(runnerEvidencePath, missingGroupCounts);
      await expect(validateFixtureLocks(root, { verifyHistory: false })).rejects.toThrow(/keys/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("binds each additive manifest bundle to one immutable docs-only creation commit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-history-"));
    try {
      await copyDocsWithoutContentLocks(root);
      await initialiseGitRepository(root);
      await commitAll(root, "docs: establish Phase 1 baseline");
      const { stdout: baseOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const baseRevision = baseOutput.trim();
      const { stdout: baseBranchOutput } = await execFileAsync("git", ["branch", "--show-current"], { cwd: root });
      const baseBranch = baseBranchOutput.trim();
      await execFileAsync("git", ["checkout", "-b", "unrelated-base"], { cwd: root });
      await writeFile(path.join(root, "docs", "unrelated-base.md"), "Sibling base candidate.\n", "utf8");
      await commitAll(root, "docs: create unrelated base candidate");
      const { stdout: unrelatedOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const unrelatedRevision = unrelatedOutput.trim();
      await execFileAsync("git", ["checkout", baseBranch], { cwd: root });
      await writePhase2Bundle(root);
      await commitAll(root, "docs: preregister Phase 2 runner bundle");
      const additive = await verifyAdditiveLockManifests(root);
      await expect(verifyGitAdditiveManifestBundles(root, additive.records)).resolves.toBeUndefined();
      await expect(verifyHistoricalAdditiveManifestPaths(
        root,
        ["docs/phase-specs/phase-2-lock-manifest.json"],
      )).resolves.toEqual(["docs/phase-specs/phase-2-lock-manifest.json"]);
      await expect(validateCommittedFixturePreregistration(root, { baseRevision })).resolves.toMatchObject({
        runnerFixtures: 1,
        runnerEvidence: 0,
      });
      await expect(validateCommittedFixturePreregistration(root, { baseRevision: unrelatedRevision })).rejects.toThrow(
        /not an ancestor of HEAD/
      );
      await writeFile(path.join(root, "docs", "phase-2-follow-up.md"), "Follow-up review note.\n", "utf8");
      await commitAll(root, "docs: follow up after Phase 2 preregistration");
      await expect(validateCommittedFixturePreregistration(root)).rejects.toThrow(/evidence unavailable/);
      await expect(validateCommittedFixturePreregistration(root, { baseRevision })).resolves.toMatchObject({
        runnerFixtures: 1,
        runnerEvidence: 0,
      });

      const manifestPath = path.join(root, "docs", "phase-specs", "phase-2-lock-manifest.json");
      const phasePath = path.join(root, "docs", "phase-specs", "phase-2.md");
      await writeFile(phasePath, "# self-consistent but edited Phase 2\n", "utf8");
      const editedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      editedManifest.files.find(({ path: filePath }) => filePath === "docs/phase-specs/phase-2.md").sha256 =
        sha256(await readFile(phasePath));
      await writeJson(manifestPath, editedManifest);
      const edited = await verifyAdditiveLockManifests(root);
      await expect(verifyGitAdditiveManifestBundles(root, edited.records)).rejects.toThrow(/creation blob differs|current bytes differ/);

      await rm(manifestPath);
      await expect(verifyHistoricalAdditiveManifestPaths(root, [])).rejects.toThrow(/historical additive manifests differ/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects split creation commits and a bundle created with non-doc changes", async () => {
    const splitRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-split-"));
    const mixedRoot = await mkdtemp(path.join(os.tmpdir(), "choice-life-phase2-mixed-"));
    try {
      await copyDocsWithoutContentLocks(splitRoot);
      await initialiseGitRepository(splitRoot);
      await commitAll(splitRoot, "docs: establish Phase 1 baseline");
      await writePhase2Bundle(splitRoot);
      const manifestPath = path.join(splitRoot, "docs", "phase-specs", "phase-2-lock-manifest.json");
      const manifestBytes = await readFile(manifestPath);
      await rm(manifestPath);
      await commitAll(splitRoot, "docs: create protected files separately");
      await writeFile(manifestPath, manifestBytes);
      await commitAll(splitRoot, "docs: create manifest too late");
      const split = await verifyAdditiveLockManifests(splitRoot);
      await expect(verifyGitAdditiveManifestBundles(splitRoot, split.records)).rejects.toThrow(/share one byte-creation commit/);

      await copyDocsWithoutContentLocks(mixedRoot);
      await initialiseGitRepository(mixedRoot);
      await commitAll(mixedRoot, "docs: establish Phase 1 baseline");
      await writePhase2Bundle(mixedRoot);
      await mkdir(path.join(mixedRoot, "src"), { recursive: true });
      await writeFile(path.join(mixedRoot, "src", "premature-runner.ts"), "export const premature = true;\n", "utf8");
      await commitAll(mixedRoot, "feat: mix runner code into preregistration");
      const mixed = await verifyAdditiveLockManifests(mixedRoot);
      await expect(verifyGitAdditiveManifestBundles(mixedRoot, mixed.records)).rejects.toThrow(/docs-only commit/);
    } finally {
      await rm(splitRoot, { recursive: true, force: true });
      await rm(mixedRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
