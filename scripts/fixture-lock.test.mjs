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
  validateRegistryObject,
  verifyCorrectionLockManifest,
  verifyGitLockedPaths,
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
    await expect(verifyLockManifestChain()).resolves.toMatchObject({
      protectedPaths: expect.arrayContaining([
        "docs/save/run-state-v1-maximal.fixture.json",
        "docs/save/run-state-v1-maximal.fixture-correction-v2.json",
      ]),
    });
    const preregistrationBaseRevision = process.env.CHOICE_FIXTURE_TEST_PREREG_BASE_SHA?.trim() || null;
    const validation = preregistrationBaseRevision === null
      ? validateFixtureLocks()
      : validateCommittedFixturePreregistration(process.cwd(), { baseRevision: preregistrationBaseRevision });
    await expect(validation).resolves.toMatchObject({ manifests: 2, manifestFiles: 10 });
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
      const lock = validContentLock();
      const lockPath = path.join(root, "docs/balance/locks", `${lock.lockId}.json`);
      await mkdir(path.dirname(lockPath), { recursive: true });
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
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
      const lock = validContentLock();
      const lockPath = path.join(root, "docs/balance/locks", `${lock.lockId}.json`);
      await mkdir(path.dirname(lockPath), { recursive: true });
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
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
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.choice-of-life-core.json",
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
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 1;\r\n", "utf8");
      await writeFile(path.join(root, "scripts/evaluator.py"), "value = 1\r\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await mkdir(path.join(root, "docs/balance/evaluation-results"), { recursive: true });
      await writeFile(path.join(root, "docs/balance/evaluation-results/result.json"), "{}\n", "utf8");
      expect(await evaluationSourceSha256(root)).toBe(initial);
      await writeFile(path.join(root, "src/choice-of-life/core/model.ts"), "export const model = 2;\n", "utf8");
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
