import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";

import { deepFreeze } from "../src/choice-of-life/core/immutable";

import {
  RUNNER_LABORATORY_EVALUATOR_ID,
  RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
  canonicalEvidenceBytes,
  parseRunnerShardRecordBytes,
  validateRunnerLaboratoryShardRecord,
  type RunnerEvaluatorInputs,
  type RunnerLaboratoryShardRecord,
} from "./runner-laboratory-evaluator";

export const RUNNER_DISTRIBUTED_PLAN_ARTIFACT_ID =
  "runner-distributed-evaluation-plan-v1" as const;
export const RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID =
  "runner-distributed-shard-group-v1" as const;
export const RUNNER_DISTRIBUTED_PLAN_SCHEMA_VERSION = 1 as const;
export const RUNNER_DISTRIBUTED_GROUP_SCHEMA_VERSION = 1 as const;
export const RUNNER_DISTRIBUTED_PLAN_FILE_NAME =
  "runner-distributed-plan-v1.json" as const;
export const RUNNER_DISTRIBUTED_PLAN_DIGEST_FILE_NAME =
  "runner-distributed-plan-v1.sha256" as const;
export const RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME =
  "runner-distributed-group-manifest-v1.json" as const;
export const RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID =
  "runner-distributed-aggregate-result-v1" as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAX_PLAN_BYTES = 256 * 1024;
const MAX_GROUP_MANIFEST_BYTES = 256 * 1024;
const MAX_SHARD_BYTES = 16 * 1024 * 1024;

export interface RunnerDistributedRuntimeIdentity {
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
}

export interface RunnerDistributedGroupAssignment {
  readonly groupIndex: number;
  readonly shardIndices: readonly number[];
}

export interface RunnerDistributedPlan {
  readonly schemaVersion: typeof RUNNER_DISTRIBUTED_PLAN_SCHEMA_VERSION;
  readonly artifactId: typeof RUNNER_DISTRIBUTED_PLAN_ARTIFACT_ID;
  readonly evaluatorId: typeof RUNNER_LABORATORY_EVALUATOR_ID;
  readonly fixtureId: string;
  readonly contentLockId: string;
  readonly gitCommitSha: string;
  readonly evaluatedSourceSha256: string;
  readonly buildInputsSha256: string;
  readonly runtime: RunnerDistributedRuntimeIdentity;
  readonly seedStart: number;
  readonly seedEndInclusive: number;
  readonly seedStep: number;
  readonly groupCount: number;
  readonly workersPerGroup: number;
  readonly shardCount: number;
  readonly assignments: readonly RunnerDistributedGroupAssignment[];
}

export interface RunnerDistributedShardManifestEntry {
  readonly fileName: string;
  readonly shardIndex: number;
  readonly sha256: string;
  readonly seedCount: number;
}

export interface RunnerDistributedGroupManifest {
  readonly schemaVersion: typeof RUNNER_DISTRIBUTED_GROUP_SCHEMA_VERSION;
  readonly artifactId: typeof RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID;
  readonly planSha256: string;
  readonly gitCommitSha: string;
  readonly evaluatedSourceSha256: string;
  readonly buildInputsSha256: string;
  readonly groupIndex: number;
  readonly groupCount: number;
  readonly workersPerGroup: number;
  readonly shardCount: number;
  readonly shards: readonly RunnerDistributedShardManifestEntry[];
}

export interface RunnerDistributedAggregateResult {
  readonly schemaVersion: 1;
  readonly artifactId: typeof RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID;
  readonly planSha256: string;
  readonly gitCommitSha: string;
  readonly evaluatedSourceSha256: string;
  readonly buildInputsSha256: string;
  readonly distPayloadSha256: string;
  readonly populationSha256: string;
  readonly seedCount: number;
  readonly shardCount: number;
}

function fail(message: string): never {
  throw new TypeError(`runner distributed evaluator: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys differ from the closed schema`);
  }
}

function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail(`${label} must be a positive safe integer`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256`);
  }
}

export function sha256Bytes(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalArtifactSha256(value: unknown): string {
  return sha256Bytes(canonicalEvidenceBytes(value));
}

export function distributedPlanDigestBytes(plan: RunnerDistributedPlan): string {
  return `${canonicalArtifactSha256(plan)}\n`;
}

export function assertExpectedRunnerDistributedPlanSha256(
  actual: string,
  separatelyTransportedExpected: string,
): void {
  assertSha256(actual, "canonical plan digest");
  assertSha256(separatelyTransportedExpected, "separately transported plan digest");
  if (actual !== separatelyTransportedExpected) {
    fail("canonical plan digest differs from the separately transported expected digest");
  }
}

function expectedAssignments(
  groupCount: number,
  workersPerGroup: number,
): readonly RunnerDistributedGroupAssignment[] {
  return Object.freeze(Array.from({ length: groupCount }, (_, groupIndex) =>
    Object.freeze({
      groupIndex,
      // Striding prevents all special/low-numbered seeds from landing on a
      // single matrix job while preserving the evaluator's global modulo rule.
      shardIndices: Object.freeze(Array.from(
        { length: workersPerGroup },
        (_, workerIndex) => groupIndex + workerIndex * groupCount,
      )),
    })));
}

export function createRunnerDistributedPlan(options: Readonly<{
  inputs: RunnerEvaluatorInputs;
  gitCommitSha: string;
  buildInputsSha256: string;
  groupCount: number;
  workersPerGroup: number;
  runtime?: RunnerDistributedRuntimeIdentity;
}>): RunnerDistributedPlan {
  if (!GIT_COMMIT_PATTERN.test(options.gitCommitSha)) {
    fail("git commit pin must be a lowercase 40-character SHA");
  }
  assertSha256(options.inputs.evaluatedSourceSha256, "evaluated-source pin");
  assertSha256(options.buildInputsSha256, "build-input pin");
  assertPositiveSafeInteger(options.groupCount, "group count");
  assertPositiveSafeInteger(options.workersPerGroup, "workers per group");
  const shardCount = options.groupCount * options.workersPerGroup;
  if (!Number.isSafeInteger(shardCount) || shardCount > 64) {
    fail("total distributed shard count must be at most 64");
  }
  const fixture = options.inputs.fixture as {
    fixtureId?: unknown;
    contentLockId?: unknown;
    population?: { start?: unknown; endInclusive?: unknown; step?: unknown };
  };
  if (
    typeof fixture.fixtureId !== "string" ||
    typeof fixture.contentLockId !== "string" ||
    !Number.isSafeInteger(fixture.population?.start) ||
    !Number.isSafeInteger(fixture.population?.endInclusive) ||
    !Number.isSafeInteger(fixture.population?.step) ||
    (fixture.population!.step as number) < 1 ||
    (fixture.population!.start as number) < 0 ||
    (fixture.population!.endInclusive as number) < (fixture.population!.start as number)
  ) {
    fail("locked runner fixture has an invalid identity or seed population");
  }
  const runtime = options.runtime ?? {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  };
  return validateRunnerDistributedPlan({
    schemaVersion: RUNNER_DISTRIBUTED_PLAN_SCHEMA_VERSION,
    artifactId: RUNNER_DISTRIBUTED_PLAN_ARTIFACT_ID,
    evaluatorId: RUNNER_LABORATORY_EVALUATOR_ID,
    fixtureId: fixture.fixtureId,
    contentLockId: fixture.contentLockId,
    gitCommitSha: options.gitCommitSha,
    evaluatedSourceSha256: options.inputs.evaluatedSourceSha256,
    buildInputsSha256: options.buildInputsSha256,
    runtime,
    seedStart: fixture.population!.start as number,
    seedEndInclusive: fixture.population!.endInclusive as number,
    seedStep: fixture.population!.step as number,
    groupCount: options.groupCount,
    workersPerGroup: options.workersPerGroup,
    shardCount,
    assignments: expectedAssignments(options.groupCount, options.workersPerGroup),
  });
}

export function validateRunnerDistributedPlan(value: unknown): RunnerDistributedPlan {
  assertExactKeys(value, [
    "schemaVersion", "artifactId", "evaluatorId", "fixtureId", "contentLockId",
    "gitCommitSha", "evaluatedSourceSha256", "buildInputsSha256", "runtime",
    "seedStart", "seedEndInclusive", "seedStep", "groupCount",
    "workersPerGroup", "shardCount", "assignments",
  ], "distributed plan");
  if (
    value.schemaVersion !== RUNNER_DISTRIBUTED_PLAN_SCHEMA_VERSION ||
    value.artifactId !== RUNNER_DISTRIBUTED_PLAN_ARTIFACT_ID ||
    value.evaluatorId !== RUNNER_LABORATORY_EVALUATOR_ID ||
    typeof value.fixtureId !== "string" || value.fixtureId.length === 0 ||
    typeof value.contentLockId !== "string" || value.contentLockId.length === 0 ||
    typeof value.gitCommitSha !== "string" || !GIT_COMMIT_PATTERN.test(value.gitCommitSha)
  ) {
    fail("distributed plan identity is malformed");
  }
  assertSha256(value.evaluatedSourceSha256, "plan evaluated-source pin");
  assertSha256(value.buildInputsSha256, "plan build-input pin");
  assertExactKeys(value.runtime, ["nodeVersion", "platform", "architecture"], "plan runtime");
  if (
    typeof value.runtime.nodeVersion !== "string" || !/^v[0-9]+\.[0-9]+\.[0-9]+/.test(value.runtime.nodeVersion) ||
    typeof value.runtime.platform !== "string" || value.runtime.platform.length === 0 ||
    typeof value.runtime.architecture !== "string" || value.runtime.architecture.length === 0
  ) {
    fail("distributed plan runtime identity is malformed");
  }
  assertPositiveSafeInteger(value.seedStep, "plan seed step");
  assertPositiveSafeInteger(value.groupCount, "plan group count");
  assertPositiveSafeInteger(value.workersPerGroup, "plan workers per group");
  assertPositiveSafeInteger(value.shardCount, "plan shard count");
  if (
    !Number.isSafeInteger(value.seedStart) || (value.seedStart as number) < 0 ||
    !Number.isSafeInteger(value.seedEndInclusive) ||
    (value.seedEndInclusive as number) < (value.seedStart as number) ||
    value.shardCount !== (value.groupCount as number) * (value.workersPerGroup as number) ||
    (value.shardCount as number) > 64 ||
    !Array.isArray(value.assignments) || value.assignments.length !== value.groupCount
  ) {
    fail("distributed plan topology or seed domain is malformed");
  }
  const expected = expectedAssignments(value.groupCount as number, value.workersPerGroup as number);
  for (const [position, assignment] of value.assignments.entries()) {
    assertExactKeys(assignment, ["groupIndex", "shardIndices"], `plan group ${position}`);
    if (
      assignment.groupIndex !== expected[position]!.groupIndex ||
      !Array.isArray(assignment.shardIndices) ||
      assignment.shardIndices.length !== expected[position]!.shardIndices.length ||
      assignment.shardIndices.some((index, indexPosition) =>
        index !== expected[position]!.shardIndices[indexPosition])
    ) {
      fail("distributed plan assignment table is not the canonical strided topology");
    }
  }
  return deepFreeze(value as unknown as RunnerDistributedPlan);
}

async function readCanonicalRegularJson(
  filePath: string,
  maxBytes: number,
  label: string,
): Promise<unknown> {
  const stat = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail(`${label} is missing`);
    throw error;
  });
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  if (stat.size < 2 || stat.size > maxBytes) fail(`${label} size is outside its bound`);
  const bytes = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    fail(`${label} is not JSON`);
  }
  if (bytes !== canonicalEvidenceBytes(parsed)) fail(`${label} is not canonical JSON`);
  return parsed;
}

export async function readRunnerDistributedPlan(
  planPath: string,
  digestPath: string,
): Promise<Readonly<{ plan: RunnerDistributedPlan; planSha256: string }>> {
  const plan = validateRunnerDistributedPlan(await readCanonicalRegularJson(
    planPath,
    MAX_PLAN_BYTES,
    "distributed plan artifact",
  ));
  const digestStat = await lstat(digestPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail("distributed plan digest artifact is missing");
    throw error;
  });
  if (digestStat.isSymbolicLink() || !digestStat.isFile() || digestStat.size !== 65) {
    fail("distributed plan digest must be a 65-byte regular non-symlink file");
  }
  const digestBytes = await readFile(digestPath, "utf8");
  const planSha256 = canonicalArtifactSha256(plan);
  if (digestBytes !== `${planSha256}\n`) {
    fail("separately transported plan digest differs from canonical plan bytes");
  }
  return Object.freeze({ plan, planSha256 });
}

export function assertRunnerDistributedRuntime(plan: RunnerDistributedPlan): void {
  if (
    plan.runtime.nodeVersion !== process.version ||
    plan.runtime.platform !== process.platform ||
    plan.runtime.architecture !== process.arch
  ) {
    fail(
      `runtime differs from plan: expected ${plan.runtime.nodeVersion}/` +
      `${plan.runtime.platform}/${plan.runtime.architecture}, received ` +
      `${process.version}/${process.platform}/${process.arch}`,
    );
  }
}

export function distributedShardFileName(
  shardIndex: number,
  shardCount: number,
): string {
  if (
    !Number.isSafeInteger(shardIndex) || !Number.isSafeInteger(shardCount) ||
    shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount
  ) {
    fail("cannot name an invalid distributed shard");
  }
  const width = Math.max(2, String(shardCount - 1).length);
  return `shard-${String(shardIndex).padStart(width, "0")}-of-${shardCount}.json`;
}

export function distributedGroupArtifactName(
  plan: RunnerDistributedPlan,
  groupIndex: number,
): string {
  if (!Number.isSafeInteger(groupIndex) || groupIndex < 0 || groupIndex >= plan.groupCount) {
    fail("group artifact index is outside the plan");
  }
  return `runner-shards-${plan.gitCommitSha}-group-${groupIndex}`;
}

export function shardIndicesForDistributedGroup(
  plan: RunnerDistributedPlan,
  groupIndex: number,
): readonly number[] {
  const assignment = plan.assignments[groupIndex];
  if (assignment === undefined || assignment.groupIndex !== groupIndex) {
    fail("requested group is absent from the canonical plan");
  }
  return assignment.shardIndices;
}

function expectedSeedsForShard(
  plan: RunnerDistributedPlan,
  shardIndex: number,
): readonly number[] {
  const seeds: number[] = [];
  let ordinal = 0;
  for (
    let seed = plan.seedStart;
    seed <= plan.seedEndInclusive;
    seed += plan.seedStep, ordinal += 1
  ) {
    if (ordinal % plan.shardCount === shardIndex) seeds.push(seed);
  }
  return seeds;
}

export function validateRunnerDistributedShardOwnership(
  record: RunnerLaboratoryShardRecord,
  plan: RunnerDistributedPlan,
  expectedShardIndex: number,
): void {
  validateRunnerLaboratoryShardRecord(record, plan.evaluatedSourceSha256);
  if (
    record.schemaVersion !== RUNNER_LABORATORY_SHARD_SCHEMA_VERSION ||
    record.evaluatorId !== plan.evaluatorId ||
    record.shardIndex !== expectedShardIndex ||
    record.shardCount !== plan.shardCount ||
    record.seedStart !== plan.seedStart ||
    record.seedEndInclusive !== plan.seedEndInclusive ||
    record.seedStep !== plan.seedStep
  ) {
    fail(`shard ${expectedShardIndex} differs from the distributed plan topology`);
  }
  const expectedSeeds = expectedSeedsForShard(plan, expectedShardIndex);
  if (
    record.seedDigests.length !== expectedSeeds.length ||
    record.seedDigests.some(({ seed }, position) => seed !== expectedSeeds[position])
  ) {
    fail(`shard ${expectedShardIndex} seed ownership is missing, duplicated, or unexpected`);
  }
}

async function assertClosedDirectory(
  directory: string,
  expectedNames: readonly string[],
  label: string,
): Promise<void> {
  const rootStat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail(`${label} directory is missing`);
    throw error;
  });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`${label} must be a regular non-symlink directory`);
  }
  const names = (await readdir(directory)).sort();
  const expected = [...expectedNames].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    fail(`${label} contains missing, duplicate, or extra entries`);
  }
}

export async function createRunnerDistributedGroupManifest(options: Readonly<{
  plan: RunnerDistributedPlan;
  planSha256: string;
  groupIndex: number;
  outputDirectory: string;
}>): Promise<RunnerDistributedGroupManifest> {
  assertSha256(options.planSha256, "group plan digest");
  const shardIndices = shardIndicesForDistributedGroup(options.plan, options.groupIndex);
  const fileNames = shardIndices.map((index) =>
    distributedShardFileName(index, options.plan.shardCount));
  await assertClosedDirectory(options.outputDirectory, fileNames, "completed shard group");
  const shards: RunnerDistributedShardManifestEntry[] = [];
  for (const [position, shardIndex] of shardIndices.entries()) {
    const fileName = fileNames[position]!;
    const filePath = path.join(options.outputDirectory, fileName);
    const fileStat = await lstat(filePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile() || fileStat.size > MAX_SHARD_BYTES) {
      fail(`shard ${shardIndex} is not a bounded regular non-symlink file`);
    }
    const bytes = await readFile(filePath);
    const record = parseRunnerShardRecordBytes(bytes, filePath);
    validateRunnerDistributedShardOwnership(record, options.plan, shardIndex);
    shards.push(Object.freeze({
      fileName,
      shardIndex,
      sha256: sha256Bytes(bytes),
      seedCount: record.seedDigests.length,
    }));
  }
  return validateRunnerDistributedGroupManifest({
    schemaVersion: RUNNER_DISTRIBUTED_GROUP_SCHEMA_VERSION,
    artifactId: RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID,
    planSha256: options.planSha256,
    gitCommitSha: options.plan.gitCommitSha,
    evaluatedSourceSha256: options.plan.evaluatedSourceSha256,
    buildInputsSha256: options.plan.buildInputsSha256,
    groupIndex: options.groupIndex,
    groupCount: options.plan.groupCount,
    workersPerGroup: options.plan.workersPerGroup,
    shardCount: options.plan.shardCount,
    shards,
  }, options.plan);
}

export function validateRunnerDistributedGroupManifest(
  value: unknown,
  plan: RunnerDistributedPlan,
  expectedPlanSha256?: string,
): RunnerDistributedGroupManifest {
  assertExactKeys(value, [
    "schemaVersion", "artifactId", "planSha256", "gitCommitSha",
    "evaluatedSourceSha256", "buildInputsSha256", "groupIndex", "groupCount",
    "workersPerGroup", "shardCount", "shards",
  ], "distributed group manifest");
  if (
    value.schemaVersion !== RUNNER_DISTRIBUTED_GROUP_SCHEMA_VERSION ||
    value.artifactId !== RUNNER_DISTRIBUTED_GROUP_ARTIFACT_ID
  ) {
    fail("distributed group manifest identity is malformed");
  }
  assertSha256(value.planSha256, "group manifest plan digest");
  if (
    (expectedPlanSha256 !== undefined && value.planSha256 !== expectedPlanSha256) ||
    value.gitCommitSha !== plan.gitCommitSha ||
    value.evaluatedSourceSha256 !== plan.evaluatedSourceSha256 ||
    value.buildInputsSha256 !== plan.buildInputsSha256 ||
    value.groupCount !== plan.groupCount ||
    value.workersPerGroup !== plan.workersPerGroup ||
    value.shardCount !== plan.shardCount ||
    !Number.isSafeInteger(value.groupIndex) || (value.groupIndex as number) < 0 ||
    (value.groupIndex as number) >= plan.groupCount ||
    !Array.isArray(value.shards) || value.shards.length !== plan.workersPerGroup
  ) {
    fail("distributed group manifest differs from its plan");
  }
  const expectedIndices = shardIndicesForDistributedGroup(plan, value.groupIndex as number);
  for (const [position, entry] of value.shards.entries()) {
    assertExactKeys(entry, ["fileName", "shardIndex", "sha256", "seedCount"],
      `group shard ${position}`);
    assertSha256(entry.sha256, `group shard ${position} digest`);
    const expectedIndex = expectedIndices[position]!;
    if (
      entry.shardIndex !== expectedIndex ||
      entry.fileName !== distributedShardFileName(expectedIndex, plan.shardCount) ||
      !Number.isSafeInteger(entry.seedCount) || (entry.seedCount as number) < 0
    ) {
      fail("distributed group shard manifest is not canonical for its assignment");
    }
  }
  return deepFreeze(value as unknown as RunnerDistributedGroupManifest);
}

export interface ValidatedRunnerDistributedShardArtifacts {
  readonly shardPaths: readonly string[];
  /** Parsed from the same immutable byte buffers used for manifest hashing. */
  readonly shardRecords: readonly RunnerLaboratoryShardRecord[];
}

export async function validateDownloadedRunnerShardArtifacts(options: Readonly<{
  shardRoot: string;
  plan: RunnerDistributedPlan;
  planSha256: string;
}>): Promise<ValidatedRunnerDistributedShardArtifacts> {
  const groupNames = Array.from({ length: options.plan.groupCount }, (_, groupIndex) =>
    distributedGroupArtifactName(options.plan, groupIndex));
  await assertClosedDirectory(options.shardRoot, groupNames, "downloaded shard root");
  const allShardPaths: string[] = [];
  const allShardRecords: RunnerLaboratoryShardRecord[] = [];
  for (let groupIndex = 0; groupIndex < options.plan.groupCount; groupIndex += 1) {
    const groupDirectory = path.join(options.shardRoot, groupNames[groupIndex]!);
    const expectedIndices = shardIndicesForDistributedGroup(options.plan, groupIndex);
    const expectedFileNames = expectedIndices.map((index) =>
      distributedShardFileName(index, options.plan.shardCount));
    await assertClosedDirectory(
      groupDirectory,
      [...expectedFileNames, RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME],
      `downloaded shard group ${groupIndex}`,
    );
    const manifest = validateRunnerDistributedGroupManifest(
      await readCanonicalRegularJson(
        path.join(groupDirectory, RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME),
        MAX_GROUP_MANIFEST_BYTES,
        `group ${groupIndex} manifest`,
      ),
      options.plan,
      options.planSha256,
    );
    if (manifest.groupIndex !== groupIndex) {
      fail(`downloaded group ${groupIndex} carries a different group index`);
    }
    for (const entry of manifest.shards) {
      const shardPath = path.join(groupDirectory, entry.fileName);
      const stat = await lstat(shardPath);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SHARD_BYTES) {
        fail(`downloaded shard ${entry.shardIndex} is not a bounded regular file`);
      }
      const bytes = await readFile(shardPath);
      if (sha256Bytes(bytes) !== entry.sha256) {
        fail(`downloaded shard ${entry.shardIndex} digest differs from its group manifest`);
      }
      const record = parseRunnerShardRecordBytes(bytes, shardPath);
      validateRunnerDistributedShardOwnership(record, options.plan, entry.shardIndex);
      if (record.seedDigests.length !== entry.seedCount) {
        fail(`downloaded shard ${entry.shardIndex} seed count differs from its manifest`);
      }
      allShardPaths.push(shardPath);
      allShardRecords.push(record);
    }
  }
  const ordered = [...allShardPaths].sort((left, right) => {
    const leftName = path.basename(left);
    const rightName = path.basename(right);
    return leftName.localeCompare(rightName);
  });
  if (ordered.length !== options.plan.shardCount) {
    fail("downloaded global shard closure is incomplete");
  }
  const recordsByIndex = new Map(allShardRecords.map((record) => [record.shardIndex, record]));
  const orderedRecords = Array.from(
    { length: options.plan.shardCount },
    (_, shardIndex) => recordsByIndex.get(shardIndex),
  );
  if (orderedRecords.some((record) => record === undefined)) {
    fail("downloaded immutable shard-record closure is incomplete");
  }
  return Object.freeze({
    shardPaths: Object.freeze(ordered),
    shardRecords: Object.freeze(orderedRecords as RunnerLaboratoryShardRecord[]),
  });
}

export async function assertClosedPlanArtifactDirectory(
  planPath: string,
  digestPath: string,
): Promise<void> {
  const parent = path.dirname(path.resolve(planPath));
  if (parent !== path.dirname(path.resolve(digestPath))) {
    fail("plan and separately transported digest must share one artifact directory");
  }
  await assertClosedDirectory(
    parent,
    [path.basename(planPath), path.basename(digestPath)],
    "downloaded plan artifact",
  );
}

export function validateRunnerDistributedAggregateResult(
  value: unknown,
  plan: RunnerDistributedPlan,
  planSha256: string,
): RunnerDistributedAggregateResult {
  assertExactKeys(value, [
    "schemaVersion", "artifactId", "planSha256", "gitCommitSha",
    "evaluatedSourceSha256", "buildInputsSha256", "distPayloadSha256",
    "populationSha256", "seedCount", "shardCount",
  ], "distributed aggregate result");
  assertSha256(value.planSha256, "aggregate result plan digest");
  assertSha256(value.distPayloadSha256, "aggregate result dist digest");
  assertSha256(value.populationSha256, "aggregate result population digest");
  const expectedSeedCount = Math.floor(
    (plan.seedEndInclusive - plan.seedStart) / plan.seedStep,
  ) + 1;
  if (
    value.schemaVersion !== 1 ||
    value.artifactId !== RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID ||
    value.planSha256 !== planSha256 ||
    value.gitCommitSha !== plan.gitCommitSha ||
    value.evaluatedSourceSha256 !== plan.evaluatedSourceSha256 ||
    value.buildInputsSha256 !== plan.buildInputsSha256 ||
    value.seedCount !== expectedSeedCount ||
    value.shardCount !== plan.shardCount
  ) {
    fail("distributed aggregate result differs from its exact plan");
  }
  return deepFreeze(value as unknown as RunnerDistributedAggregateResult);
}

export async function readRunnerDistributedAggregateResult(
  filePath: string,
  plan: RunnerDistributedPlan,
  planSha256: string,
): Promise<RunnerDistributedAggregateResult> {
  return validateRunnerDistributedAggregateResult(
    await readCanonicalRegularJson(
      filePath,
      MAX_GROUP_MANIFEST_BYTES,
      "distributed aggregate result",
    ),
    plan,
    planSha256,
  );
}
