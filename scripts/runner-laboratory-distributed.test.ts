import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isDeeplyFrozen } from "../src/choice-of-life/core/immutable";

import {
  RUNNER_ASSERTION_IDS,
  RUNNER_LABORATORY_EVALUATOR_ID,
  RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
  atomicWriteCanonicalJson,
  type RunnerEvaluatorInputs,
  type RunnerLaboratoryShardRecord,
} from "./runner-laboratory-evaluator";
import {
  RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME,
  RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID,
  RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID,
  RUNNER_DISTRIBUTED_PLAN_DIGEST_FILE_NAME,
  RUNNER_DISTRIBUTED_PLAN_FILE_NAME,
  assertClosedPlanArtifactDirectory,
  assertExpectedRunnerDistributedPlanSha256,
  canonicalArtifactSha256,
  createRunnerDistributedGroupManifest,
  createRunnerDistributedPlan,
  distributedGroupArtifactName,
  distributedShardFileName,
  readRunnerDistributedPlan,
  sha256Bytes,
  shardIndicesForDistributedGroup,
  validateDownloadedRunnerShardArtifacts,
  validateRunnerDistributedAggregateResult,
  validateRunnerDistributedGroupManifest,
  validateRunnerDistributedPlan,
  validateRunnerDistributedShardOwnership,
  type RunnerDistributedPlan,
} from "./runner-laboratory-distributed";

const SOURCE_SHA = "a".repeat(64);
const BUILD_SHA = "b".repeat(64);
const GIT_SHA = "c".repeat(40);

function fakeInputs(seedEndInclusive = 31): RunnerEvaluatorInputs {
  return {
    fixture: {
      fixtureId: "runner-laboratory-fixture-v1",
      contentLockId: "runner-laboratory-content-lock-v1",
      population: { start: 0, endInclusive: seedEndInclusive, step: 1 },
    },
    fixtureSchema: {},
    contentLock: {},
    registry: {},
    assertionSpecs: [],
    evaluatedSourceSha256: SOURCE_SHA,
  };
}

function plan(seedEndInclusive = 31): RunnerDistributedPlan {
  return createRunnerDistributedPlan({
    inputs: fakeInputs(seedEndInclusive),
    gitCommitSha: GIT_SHA,
    buildInputsSha256: BUILD_SHA,
    groupCount: 4,
    workersPerGroup: 4,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  });
}

function recordFor(planValue: RunnerDistributedPlan, shardIndex: number): RunnerLaboratoryShardRecord {
  const seedDigests = Array.from(
    { length: planValue.seedEndInclusive - planValue.seedStart + 1 },
    (_, ordinal) => planValue.seedStart + ordinal * planValue.seedStep,
  ).filter((_, ordinal) => ordinal % planValue.shardCount === shardIndex)
    .map((seed) => ({ seed, sha256: sha256Bytes(`seed:${seed}`) }));
  return {
    schemaVersion: RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
    evaluatorId: RUNNER_LABORATORY_EVALUATOR_ID,
    evaluatedSourceSha256: planValue.evaluatedSourceSha256,
    shardIndex,
    shardCount: planValue.shardCount,
    seedStart: planValue.seedStart,
    seedEndInclusive: planValue.seedEndInclusive,
    seedStep: planValue.seedStep,
    assertionCounters: RUNNER_ASSERTION_IDS.map((assertionId) => ({
      assertionId,
      checked: 0,
      failureCount: 0,
      failureWitnesses: [],
    })),
    seedDigests,
  };
}

async function writePlanArtifact(directory: string, planValue: RunnerDistributedPlan) {
  const planPath = path.join(directory, RUNNER_DISTRIBUTED_PLAN_FILE_NAME);
  const digestPath = path.join(directory, RUNNER_DISTRIBUTED_PLAN_DIGEST_FILE_NAME);
  await atomicWriteCanonicalJson(planPath, planValue);
  const planSha256 = canonicalArtifactSha256(planValue);
  await writeFile(digestPath, `${planSha256}\n`, "utf8");
  return { planPath, digestPath, planSha256 };
}

async function writeDownloadedArtifactTree(
  shardRoot: string,
  planValue: RunnerDistributedPlan,
  planSha256: string,
): Promise<void> {
  await mkdir(shardRoot, { recursive: true });
  for (let groupIndex = 0; groupIndex < planValue.groupCount; groupIndex += 1) {
    const groupDirectory = path.join(
      shardRoot,
      distributedGroupArtifactName(planValue, groupIndex),
    );
    await mkdir(groupDirectory);
    for (const shardIndex of shardIndicesForDistributedGroup(planValue, groupIndex)) {
      await atomicWriteCanonicalJson(
        path.join(groupDirectory, distributedShardFileName(shardIndex, planValue.shardCount)),
        recordFor(planValue, shardIndex),
      );
    }
    const manifest = await createRunnerDistributedGroupManifest({
      plan: planValue,
      planSha256,
      groupIndex,
      outputDirectory: groupDirectory,
    });
    await atomicWriteCanonicalJson(
      path.join(groupDirectory, RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME),
      manifest,
    );
  }
}

describe("distributed runner evaluator artifacts", () => {
  it("locks the production 4x4 strided assignment table and separate plan digest", async () => {
    const planValue = plan();
    expect(planValue.shardCount).toBe(16);
    expect(planValue.assignments.map(({ shardIndices }) => shardIndices)).toEqual([
      [0, 4, 8, 12],
      [1, 5, 9, 13],
      [2, 6, 10, 14],
      [3, 7, 11, 15],
    ]);
    const directory = await mkdtemp(path.join(tmpdir(), "runner-plan-artifact-test-"));
    try {
      const artifact = await writePlanArtifact(directory, planValue);
      await expect(assertClosedPlanArtifactDirectory(
        artifact.planPath,
        artifact.digestPath,
      )).resolves.toBeUndefined();
      const loaded = await readRunnerDistributedPlan(artifact.planPath, artifact.digestPath);
      expect(loaded.plan).toEqual(planValue);
      expect(loaded.planSha256).toBe(artifact.planSha256);
      expect(isDeeplyFrozen(loaded.plan)).toBe(true);
      expect(() => assertExpectedRunnerDistributedPlanSha256(
        loaded.planSha256,
        loaded.planSha256,
      )).not.toThrow();
      expect(() => assertExpectedRunnerDistributedPlanSha256(
        loaded.planSha256,
        "d".repeat(64),
      )).toThrow(/separately transported/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("deep-freezes loaded plan, group-manifest, and aggregate-result graphs", () => {
    const planValue = validateRunnerDistributedPlan(JSON.parse(JSON.stringify(plan())));
    const planSha256 = canonicalArtifactSha256(planValue);
    const group = validateRunnerDistributedGroupManifest({
      schemaVersion: 1,
      artifactId: RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID,
      planSha256,
      gitCommitSha: planValue.gitCommitSha,
      evaluatedSourceSha256: planValue.evaluatedSourceSha256,
      buildInputsSha256: planValue.buildInputsSha256,
      groupIndex: 0,
      groupCount: 4,
      workersPerGroup: 4,
      shardCount: 16,
      shards: [0, 4, 8, 12].map((shardIndex) => ({
        fileName: distributedShardFileName(shardIndex, 16),
        shardIndex,
        sha256: sha256Bytes(`shard:${shardIndex}`),
        seedCount: 2,
      })),
    }, planValue, planSha256);
    const result = validateRunnerDistributedAggregateResult({
      schemaVersion: 1,
      artifactId: RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID,
      planSha256,
      gitCommitSha: planValue.gitCommitSha,
      evaluatedSourceSha256: planValue.evaluatedSourceSha256,
      buildInputsSha256: planValue.buildInputsSha256,
      distPayloadSha256: "e".repeat(64),
      populationSha256: "f".repeat(64),
      seedCount: 32,
      shardCount: 16,
    }, planValue, planSha256);
    expect(isDeeplyFrozen(planValue)).toBe(true);
    expect(isDeeplyFrozen(group)).toBe(true);
    expect(isDeeplyFrozen(result)).toBe(true);
    expect(() => {
      (group.shards as Array<{ seedCount: number }>)[0]!.seedCount = 99;
    }).toThrow(TypeError);
  });

  it("rejects assignment, runtime-key, and noncanonical plan mutants", async () => {
    const valid = plan();
    expect(() => validateRunnerDistributedPlan({
      ...valid,
      assignments: valid.assignments.map((assignment, index) =>
        index === 0 ? { ...assignment, shardIndices: [0, 1, 2, 3] } : assignment),
    })).toThrow(/strided topology/);
    expect(() => validateRunnerDistributedPlan({
      ...valid,
      runtime: { ...valid.runtime, unexpected: true },
    })).toThrow(/keys/);

    const directory = await mkdtemp(path.join(tmpdir(), "runner-plan-canonical-test-"));
    try {
      const artifact = await writePlanArtifact(directory, valid);
      await writeFile(artifact.planPath, JSON.stringify(valid, null, 2), "utf8");
      await expect(readRunnerDistributedPlan(
        artifact.planPath,
        artifact.digestPath,
      )).rejects.toThrow(/not canonical/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("loads the exact 16-shard closure once and isolates aggregation records from later file mutation", async () => {
    const planValue = plan();
    const planSha256 = canonicalArtifactSha256(planValue);
    const root = await mkdtemp(path.join(tmpdir(), "runner-shard-tree-test-"));
    try {
      await writeDownloadedArtifactTree(root, planValue, planSha256);
      const loaded = await validateDownloadedRunnerShardArtifacts({
        shardRoot: root,
        plan: planValue,
        planSha256,
      });
      expect(loaded.shardPaths).toHaveLength(16);
      expect(loaded.shardRecords.map(({ shardIndex }) => shardIndex)).toEqual(
        Array.from({ length: 16 }, (_, index) => index),
      );
      const firstSeedBefore = loaded.shardRecords[0]!.seedDigests[0]!.seed;
      await writeFile(loaded.shardPaths[0]!, "tampered after immutable load\n", "utf8");
      expect(loaded.shardRecords[0]!.seedDigests[0]!.seed).toBe(firstSeedBefore);
      expect(Object.isFrozen(loaded.shardRecords[0]!.seedDigests)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed on extra, missing, tampered, symlink, and special shard entries", async () => {
    const mutants = ["extra", "missing", "tampered", "symlink", "special"] as const;
    for (const mutant of mutants) {
      const planValue = plan();
      const planSha256 = canonicalArtifactSha256(planValue);
      const root = await mkdtemp(path.join(tmpdir(), `runner-shard-${mutant}-test-`));
      const outside = `${root}-outside-shard.json`;
      try {
        await writeDownloadedArtifactTree(root, planValue, planSha256);
        const groupDirectory = path.join(root, distributedGroupArtifactName(planValue, 0));
        const shardPath = path.join(
          groupDirectory,
          distributedShardFileName(0, planValue.shardCount),
        );
        if (mutant === "extra") {
          await writeFile(path.join(groupDirectory, "unexpected.json"), "{}\n");
        } else if (mutant === "missing") {
          await rm(shardPath);
        } else if (mutant === "tampered") {
          const bytes = await readFile(shardPath, "utf8");
          await writeFile(shardPath, bytes.replace(SOURCE_SHA, "f".repeat(64)), "utf8");
        } else if (mutant === "symlink") {
          await writeFile(outside, await readFile(shardPath));
          await rm(shardPath);
          await symlink(outside, shardPath, "file");
        } else {
          await rm(shardPath);
          await mkdir(shardPath);
        }
        await expect(validateDownloadedRunnerShardArtifacts({
          shardRoot: root,
          plan: planValue,
          planSha256,
        }), mutant).rejects.toThrow();
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { force: true });
      }
    }
  });

  it("rejects a missing or unexpected group directory before reading shard payloads", async () => {
    const planValue = plan();
    const planSha256 = canonicalArtifactSha256(planValue);
    const root = await mkdtemp(path.join(tmpdir(), "runner-shard-group-closure-test-"));
    try {
      await writeDownloadedArtifactTree(root, planValue, planSha256);
      await rm(path.join(root, distributedGroupArtifactName(planValue, 2)), {
        recursive: true,
        force: true,
      });
      await expect(validateDownloadedRunnerShardArtifacts({
        shardRoot: root,
        plan: planValue,
        planSha256,
      })).rejects.toThrow(/missing, duplicate, or extra/);
      await mkdir(path.join(root, "runner-shards-unexpected-group"));
      await expect(validateDownloadedRunnerShardArtifacts({
        shardRoot: root,
        plan: planValue,
        planSha256,
      })).rejects.toThrow(/missing, duplicate, or extra/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects source, topology, shard-index, and seed-ownership mutants even with recomputed bytes", () => {
    const planValue = plan();
    const valid = recordFor(planValue, 0);
    expect(() => validateRunnerDistributedShardOwnership(valid, planValue, 0)).not.toThrow();
    for (const mutant of [
      { ...valid, evaluatedSourceSha256: "f".repeat(64) },
      { ...valid, shardCount: 15 },
      { ...valid, shardIndex: 1 },
      { ...valid, seedDigests: valid.seedDigests.slice(1) },
      { ...valid, seedDigests: [...valid.seedDigests, valid.seedDigests[0]!] },
    ]) {
      expect(() => validateRunnerDistributedShardOwnership(
        mutant as RunnerLaboratoryShardRecord,
        planValue,
        0,
      )).toThrow();
    }
  });
});
