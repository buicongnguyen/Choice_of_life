import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  aggregateRunnerLaboratoryEvidence,
  assertShardDirectoryOutsideEvaluatedSource,
  atomicWriteCanonicalJson,
  loadRunnerEvaluatorInputs,
} from "./runner-laboratory-evaluator";
import {
  assertPinnedBuildInputs,
  assertPinnedEvaluatedSource,
  installSignalCleanup,
  registerRunnerEvaluatorTemporaryDirectory,
  removeRunnerEvaluatorTemporaryDirectory,
  runShardIndexProcesses,
  startManagedPreview,
  stopManagedPreview,
} from "./runner-laboratory-evaluator-cli";
import {
  captureImmutableDist,
  captureRunnerBuildInputs,
  createRunnerEvaluationCapsule,
  runnerBuildInputsSha256,
} from "./runner-evaluation-capsule";
import {
  RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID,
  RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME,
  RUNNER_DISTRIBUTED_PLAN_DIGEST_FILE_NAME,
  RUNNER_DISTRIBUTED_PLAN_FILE_NAME,
  assertClosedPlanArtifactDirectory,
  assertExpectedRunnerDistributedPlanSha256,
  assertRunnerDistributedRuntime,
  canonicalArtifactSha256,
  createRunnerDistributedGroupManifest,
  createRunnerDistributedPlan,
  distributedShardFileName,
  readRunnerDistributedAggregateResult,
  readRunnerDistributedPlan,
  shardIndicesForDistributedGroup,
  validateDownloadedRunnerShardArtifacts,
  validateRunnerDistributedAggregateResult,
  type RunnerDistributedPlan,
} from "./runner-laboratory-distributed";

const execFileAsync = promisify(execFile);
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function fail(message: string): never {
  throw new TypeError(`runner distributed evaluator CLI: ${message}`);
}

export function parseRunnerDistributedCliArgument(
  arguments_: readonly string[],
  name: string,
  required = true,
): string | undefined {
  const indices = arguments_.flatMap((value, index) => value === name ? [index] : []);
  if (indices.length === 0) {
    if (required) fail(`missing ${name}`);
    return undefined;
  }
  if (indices.length !== 1) fail(`duplicate ${name}`);
  const value = arguments_[indices[0]! + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`${name} is present without a value`);
  }
  return value;
}

function argument(name: string, required = true): string | undefined {
  return parseRunnerDistributedCliArgument(process.argv, name, required);
}

function integerArgument(name: string): number {
  const value = Number(argument(name));
  if (!Number.isSafeInteger(value)) fail(`${name} must be a safe integer`);
  return value;
}

function expectedGitShaArgument(): string {
  const value = argument("--git-sha")!.toLowerCase();
  if (!GIT_COMMIT_PATTERN.test(value)) {
    fail("--git-sha must be a lowercase 40-character commit SHA");
  }
  return value;
}

function expectedPlanSha256Argument(): string {
  const value = argument("--expected-plan-sha256")!;
  if (!/^[0-9a-f]{64}$/.test(value)) {
    fail("--expected-plan-sha256 must be a lowercase SHA-256");
  }
  return value;
}

function assertProductionTopology(plan: RunnerDistributedPlan): void {
  if (
    plan.groupCount !== 4 || plan.workersPerGroup !== 4 || plan.shardCount !== 16 ||
    plan.seedStart !== 0 || plan.seedEndInclusive !== 9_999 || plan.seedStep !== 1
  ) {
    fail("production distributed evaluation requires 4x4 shards over exact seeds 0..9999 step 1");
  }
}

interface PinnedGitEnvironment {
  readonly githubSha: string | null;
  readonly githubRepository: string | null;
}

function gitBuffer(root: string, arguments_: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile("git", [...arguments_], {
      cwd: root,
      windowsHide: true,
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(Buffer.from(stdout));
    });
  });
}

function gitTreeEntries(bytes: Buffer): ReadonlyMap<string, Readonly<{
  mode: string;
  objectType: string;
  objectSha: string;
}>> {
  const entries = new Map<string, Readonly<{
    mode: string;
    objectType: string;
    objectSha: string;
  }>>();
  for (const record of bytes.toString("utf8").split("\0")) {
    if (record.length === 0) continue;
    const tab = record.indexOf("\t");
    if (tab <= 0) fail("git tree emitted a malformed record");
    const [mode, objectType, objectSha] = record.slice(0, tab).split(" ");
    const relativePath = record.slice(tab + 1);
    if (
      mode === undefined || objectType === undefined || objectSha === undefined ||
      relativePath.length === 0 || entries.has(relativePath)
    ) {
      fail("git tree identity is malformed or duplicated");
    }
    entries.set(relativePath, Object.freeze({ mode, objectType, objectSha }));
  }
  return entries;
}

function gitBlobSha256OrSha1(bytes: Buffer, objectFormat: string): string {
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    fail(`unsupported git object format ${objectFormat}`);
  }
  const digest = createHash(objectFormat);
  digest.update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"));
  digest.update(bytes);
  return digest.digest("hex");
}

function expectedReleaseBytes(
  packageBytes: Buffer,
  expectedGitSha: string,
  githubRepository: string | null,
): Buffer {
  let packageJson: {
    version?: unknown;
    repository?: { full_name?: unknown };
  };
  try {
    packageJson = JSON.parse(packageBytes.toString("utf8"));
  } catch {
    fail("captured package.json is not valid JSON");
  }
  const repository = packageJson.repository?.full_name;
  if (
    typeof packageJson.version !== "string" || packageJson.version.length === 0 ||
    typeof repository !== "string" || repository.length === 0
  ) {
    fail("captured package.json lacks exact version/repository identity");
  }
  if (githubRepository !== null && githubRepository !== repository) {
    fail(`GITHUB_REPOSITORY differs from package repository identity: ${githubRepository}`);
  }
  return Buffer.from(`${JSON.stringify({
    commit: expectedGitSha,
    version: packageJson.version,
    repository,
  }, null, 2)}\n`, "utf8");
}

export async function assertPinnedGitCheckout(
  root: string,
  expectedGitSha: string,
  environment: PinnedGitEnvironment = {
    githubSha: process.env.GITHUB_SHA?.toLowerCase() ?? null,
    githubRepository: process.env.GITHUB_REPOSITORY ?? null,
  },
): Promise<void> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    windowsHide: true,
  });
  const actual = stdout.trim().toLowerCase();
  if (actual !== expectedGitSha) {
    fail(`checkout HEAD differs from --git-sha: expected ${expectedGitSha}, received ${actual}`);
  }
  if (environment.githubSha !== null && environment.githubSha.toLowerCase() !== expectedGitSha) {
    fail(`GITHUB_SHA differs from --git-sha: expected ${expectedGitSha}, received ${environment.githubSha}`);
  }

  try {
    await execFileAsync("git", [
      "diff", "--cached", "--quiet", "--no-ext-diff", "HEAD", "--",
    ], { cwd: root, windowsHide: true });
  } catch {
    fail("tracked index differs from HEAD");
  }
  try {
    await execFileAsync("git", [
      "diff", "--quiet", "--no-ext-diff", "HEAD", "--", ".",
      ":(exclude)public/release.json",
    ], { cwd: root, windowsHide: true });
  } catch {
    fail("tracked worktree or index differs from HEAD outside public/release.json");
  }
  const untracked = (await gitBuffer(root, [
    "ls-files", "--others", "--exclude-standard", "-z",
  ])).toString("utf8").split("\0").filter((value) => value.length > 0);
  if (untracked.length > 0) {
    fail(`checkout contains untracked repository inputs: ${untracked.slice(0, 4).join(",")}`);
  }
  const ignoredEvidence = (await gitBuffer(root, [
    "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--",
    "docs/balance/evaluation-results",
    "docs/balance/runner-evaluation-results",
  ])).toString("utf8").split("\0").filter((value) => value.length > 0);
  if (ignoredEvidence.length > 0) {
    fail(`checkout contains ignored untracked evidence inputs: ${ignoredEvidence.slice(0, 4).join(",")}`);
  }

  const capture = await captureRunnerBuildInputs(root);
  const objectFormat = (await execFileAsync(
    "git",
    ["rev-parse", "--show-object-format"],
    { cwd: root, windowsHide: true },
  )).stdout.trim();
  const tree = gitTreeEntries(await gitBuffer(root, [
    "ls-tree", "-rz", "--full-tree", "HEAD",
  ]));
  const indexedPaths = (await gitBuffer(root, ["ls-files", "-z"]))
    .toString("utf8").split("\0").filter((value) => value.length > 0).sort();
  const headPaths = [...tree.keys()].sort();
  if (
    indexedPaths.length !== headPaths.length ||
    indexedPaths.some((value, index) => value !== headPaths[index])
  ) {
    fail("tracked index path closure differs from the exact HEAD tree");
  }

  // Git's ordinary diff applies clean filters and newline normalization. The
  // release proof instead binds every raw worktree byte to its HEAD blob and
  // checks regular-file/mode identity. This also covers evidence deliberately
  // excluded from the cyclic evaluated-source digest and workflow/docs inputs
  // outside the production build capture.
  for (const [relativePath, treeEntry] of tree) {
    if (
      treeEntry.objectType !== "blob" ||
      (treeEntry.mode !== "100644" && treeEntry.mode !== "100755")
    ) {
      fail(`tracked HEAD input is special, a symlink, or a submodule: ${relativePath}`);
    }
    const trackedPath = path.join(root, ...relativePath.split("/"));
    const trackedStat = await lstat(trackedPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") fail(`tracked worktree input is missing: ${relativePath}`);
      throw error;
    });
    if (trackedStat.isSymbolicLink() || !trackedStat.isFile()) {
      fail(`tracked worktree input is not a regular file: ${relativePath}`);
    }
    const expectedExecutable = treeEntry.mode === "100755";
    const actualExecutable = (trackedStat.mode & 0o111) !== 0;
    if (process.platform !== "win32" && actualExecutable !== expectedExecutable) {
      fail(`tracked worktree mode differs from HEAD: ${relativePath}`);
    }
    if (relativePath !== "public/release.json") {
      const worktreeBytes = await readFile(trackedPath);
      if (gitBlobSha256OrSha1(worktreeBytes, objectFormat) !== treeEntry.objectSha) {
        fail(`raw tracked worktree bytes differ from HEAD: ${relativePath}`);
      }
    }
  }

  const capturedPaths = new Set<string>();
  for (const file of capture.files) {
    if (capturedPaths.has(file.relativePath)) {
      fail(`captured build input is duplicated: ${file.relativePath}`);
    }
    capturedPaths.add(file.relativePath);
    const treeEntry = tree.get(file.relativePath);
    if (treeEntry === undefined) {
      fail(`captured build input is untracked, special, or a symlink: ${file.relativePath}`);
    }
    if (
      file.relativePath !== "public/release.json" &&
      gitBlobSha256OrSha1(file.bytes, objectFormat) !== treeEntry.objectSha
    ) {
      fail(`single-read captured build bytes differ from HEAD: ${file.relativePath}`);
    }
  }
  const packageFile = capture.files.find(({ relativePath }) => relativePath === "package.json");
  const releaseFile = capture.files.find(({ relativePath }) =>
    relativePath === "public/release.json");
  if (packageFile === undefined || releaseFile === undefined) {
    fail("captured build inputs lack package.json or public/release.json");
  }
  const releaseExpected = expectedReleaseBytes(
    packageFile.bytes,
    expectedGitSha,
    environment.githubRepository,
  );
  if (Buffer.compare(releaseFile.bytes, releaseExpected) !== 0) {
    fail("public/release.json is not the exact deterministic release stamp");
  }
}

async function ensureEmptyExternalDirectory(root: string, directory: string): Promise<void> {
  assertShardDirectoryOutsideEvaluatedSource(root, directory);
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("output directory must be a regular non-symlink directory");
  }
  if ((await readdir(directory)).length !== 0) {
    fail("output directory must be empty before publication");
  }
}

async function assertPlanMatchesCheckout(
  root: string,
  plan: RunnerDistributedPlan,
  expectedGitSha: string,
  phase: string,
): Promise<void> {
  if (plan.gitCommitSha !== expectedGitSha) {
    fail(`plan git commit differs ${phase}`);
  }
  assertRunnerDistributedRuntime(plan);
  await assertPinnedGitCheckout(root, expectedGitSha);
  await assertPinnedEvaluatedSource(root, plan.evaluatedSourceSha256, phase);
  await assertPinnedBuildInputs(root, plan.buildInputsSha256, phase);
  const inputs = await loadRunnerEvaluatorInputs(root);
  const population = inputs.fixture.population;
  if (
    inputs.evaluatedSourceSha256 !== plan.evaluatedSourceSha256 ||
    inputs.fixture.fixtureId !== plan.fixtureId ||
    inputs.fixture.contentLockId !== plan.contentLockId ||
    population?.start !== plan.seedStart ||
    population?.endInclusive !== plan.seedEndInclusive ||
    population?.step !== plan.seedStep
  ) {
    fail(`locked evaluator inputs differ from the distributed plan ${phase}`);
  }
}

async function withPinnedCapsule<T>(
  liveRoot: string,
  plan: RunnerDistributedPlan,
  callback: (capsuleRoot: string) => Promise<T>,
): Promise<T> {
  const capsule = await createRunnerEvaluationCapsule(liveRoot);
  registerRunnerEvaluatorTemporaryDirectory(capsule.capsuleRoot);
  try {
    if (
      capsule.evaluatedSourceSha256 !== plan.evaluatedSourceSha256 ||
      capsule.buildInputsSha256 !== plan.buildInputsSha256
    ) {
      fail("single-read immutable capsule differs from the distributed plan");
    }
    await assertPinnedEvaluatedSource(
      capsule.capsuleRoot,
      plan.evaluatedSourceSha256,
      "at distributed capsule entry",
    );
    await assertPinnedBuildInputs(
      capsule.capsuleRoot,
      plan.buildInputsSha256,
      "at distributed capsule entry",
    );
    return await callback(capsule.capsuleRoot);
  } finally {
    await removeRunnerEvaluatorTemporaryDirectory(capsule.capsuleRoot);
  }
}

async function distributedPlanMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const outputPath = path.resolve(argument("--output")!);
  const expectedGitSha = expectedGitShaArgument();
  const groupCount = integerArgument("--groups");
  const workersPerGroup = integerArgument("--workers-per-group");
  if (groupCount !== 4 || workersPerGroup !== 4) {
    fail("distributed-plan production topology must be exactly --groups 4 --workers-per-group 4");
  }
  if (path.basename(outputPath) !== RUNNER_DISTRIBUTED_PLAN_FILE_NAME) {
    fail(`--output must end in ${RUNNER_DISTRIBUTED_PLAN_FILE_NAME}`);
  }
  const outputDirectory = path.dirname(outputPath);
  await ensureEmptyExternalDirectory(root, outputDirectory);
  await assertPinnedGitCheckout(root, expectedGitSha);
  const liveSourceSha256 = (await loadRunnerEvaluatorInputs(root)).evaluatedSourceSha256;
  const liveBuildInputsSha256 = await runnerBuildInputsSha256(root);
  const provisionalPlan = await withPinnedCapsule(root, createRunnerDistributedPlan({
    inputs: await loadRunnerEvaluatorInputs(root),
    gitCommitSha: expectedGitSha,
    buildInputsSha256: liveBuildInputsSha256,
    groupCount,
    workersPerGroup,
  }), async (capsuleRoot) => {
    const inputs = await loadRunnerEvaluatorInputs(capsuleRoot);
    if (inputs.evaluatedSourceSha256 !== liveSourceSha256) {
      fail("live and capsule evaluator inputs differ while creating the plan");
    }
    return createRunnerDistributedPlan({
      inputs,
      gitCommitSha: expectedGitSha,
      buildInputsSha256: liveBuildInputsSha256,
      groupCount,
      workersPerGroup,
    });
  });
  await assertPlanMatchesCheckout(root, provisionalPlan, expectedGitSha, "before plan publication");
  const digestPath = path.join(outputDirectory, RUNNER_DISTRIBUTED_PLAN_DIGEST_FILE_NAME);
  assertProductionTopology(provisionalPlan);
  await atomicWriteCanonicalJson(outputPath, provisionalPlan);
  const planSha256 = canonicalArtifactSha256(provisionalPlan);
  await writeFile(digestPath, `${planSha256}\n`, { encoding: "utf8", flag: "wx" });
  await assertClosedPlanArtifactDirectory(outputPath, digestPath);
  const reread = await readRunnerDistributedPlan(outputPath, digestPath);
  process.stdout.write(`${JSON.stringify({
    command: "distributed-plan",
    gitCommitSha: expectedGitSha,
    evaluatedSourceSha256: reread.plan.evaluatedSourceSha256,
    buildInputsSha256: reread.plan.buildInputsSha256,
    planSha256: reread.planSha256,
    shardCount: reread.plan.shardCount,
  })}\n`);
}

async function loadPinnedPlanFromArguments(root: string): Promise<Readonly<{
  plan: RunnerDistributedPlan;
  planSha256: string;
  expectedGitSha: string;
}>> {
  const planPath = path.resolve(argument("--plan")!);
  const digestPath = path.resolve(argument("--plan-sha256-file")!);
  const expectedGitSha = expectedGitShaArgument();
  const expectedPlanSha256 = expectedPlanSha256Argument();
  await assertClosedPlanArtifactDirectory(planPath, digestPath);
  const { plan, planSha256 } = await readRunnerDistributedPlan(planPath, digestPath);
  assertExpectedRunnerDistributedPlanSha256(planSha256, expectedPlanSha256);
  assertProductionTopology(plan);
  await assertPlanMatchesCheckout(root, plan, expectedGitSha, "while accepting the plan artifact");
  return Object.freeze({ plan, planSha256, expectedGitSha });
}

async function distributedShardMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const outputDirectory = path.resolve(argument("--output-directory")!);
  const groupIndex = integerArgument("--group-index");
  const { plan, planSha256, expectedGitSha } = await loadPinnedPlanFromArguments(root);
  const shardIndices = shardIndicesForDistributedGroup(plan, groupIndex);
  await ensureEmptyExternalDirectory(root, outputDirectory);
  await withPinnedCapsule(root, plan, async (capsuleRoot) => {
    const assignments = shardIndices.map((shardIndex) => ({
      shardIndex,
      outputPath: path.join(
        outputDirectory,
        distributedShardFileName(shardIndex, plan.shardCount),
      ),
    }));
    await runShardIndexProcesses(
      capsuleRoot,
      assignments,
      plan.shardCount,
      undefined,
      {
        toolRoot: root,
        cliPath: path.join(capsuleRoot, "scripts", "runner-laboratory-evaluator-cli.ts"),
        expectedSourceSha256: plan.evaluatedSourceSha256,
      },
    );
    await assertPinnedEvaluatedSource(
      capsuleRoot,
      plan.evaluatedSourceSha256,
      "after distributed shard group",
    );
    const manifest = await createRunnerDistributedGroupManifest({
      plan,
      planSha256,
      groupIndex,
      outputDirectory,
    });
    await atomicWriteCanonicalJson(
      path.join(outputDirectory, RUNNER_DISTRIBUTED_GROUP_MANIFEST_FILE_NAME),
      manifest,
    );
  });
  await assertPlanMatchesCheckout(root, plan, expectedGitSha, "after shard artifact publication");
  process.stdout.write(`${JSON.stringify({
    command: "distributed-shard",
    groupIndex,
    shardIndices,
    shardCount: plan.shardCount,
    planSha256,
  })}\n`);
}

async function distributedAggregateMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const shardRoot = path.resolve(argument("--shard-root")!);
  const resultOutput = path.resolve(argument("--result-output")!);
  const mode = argument("--mode")!;
  if (mode !== "validate") fail("distributed CI aggregation only supports --mode validate");
  assertShardDirectoryOutsideEvaluatedSource(root, shardRoot);
  assertShardDirectoryOutsideEvaluatedSource(root, path.dirname(resultOutput));
  const { plan, planSha256, expectedGitSha } = await loadPinnedPlanFromArguments(root);
  const shardArtifacts = await validateDownloadedRunnerShardArtifacts({
    shardRoot,
    plan,
    planSha256,
  });
  const resultHolder: {
    value: ReturnType<typeof validateRunnerDistributedAggregateResult> | null;
  } = { value: null };
  await withPinnedCapsule(root, plan, async (capsuleRoot) => {
    const preview = await startManagedPreview(
      capsuleRoot,
      root,
      Number(argument("--preview-port", false) ?? "4178"),
      plan.evaluatedSourceSha256,
      plan.buildInputsSha256,
      randomBytes(32).toString("hex"),
    );
    try {
      const result = await aggregateRunnerLaboratoryEvidence({
        root: capsuleRoot,
        publicationRoot: root,
        expectedEvaluatedSourceSha256: plan.evaluatedSourceSha256,
        previewProvenance: preview.provenance,
        mode: "validate",
        shardRecords: shardArtifacts.shardRecords,
        browserBaseUrl: preview.baseUrl,
      });
      resultHolder.value = validateRunnerDistributedAggregateResult({
        schemaVersion: 1,
        artifactId: RUNNER_DISTRIBUTED_AGGREGATE_RESULT_ARTIFACT_ID,
        planSha256,
        gitCommitSha: plan.gitCommitSha,
        evaluatedSourceSha256: plan.evaluatedSourceSha256,
        buildInputsSha256: plan.buildInputsSha256,
        distPayloadSha256: preview.provenance.distPayloadSha256,
        populationSha256: result.aggregate.populationSha256,
        seedCount: result.aggregate.seedDigests.length,
        shardCount: plan.shardCount,
      }, plan, planSha256);
      await atomicWriteCanonicalJson(resultOutput, resultHolder.value);
    } finally {
      await stopManagedPreview(preview.child);
    }
  });
  const resultSummary = resultHolder.value;
  if (resultSummary === null) fail("distributed aggregate result was not produced");
  await assertPlanMatchesCheckout(root, plan, expectedGitSha, "after distributed aggregation");
  process.stdout.write(`${JSON.stringify({ command: "distributed-aggregate", ...resultSummary })}\n`);
}

async function distributedVerifyDistMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const resultPath = path.resolve(argument("--result")!);
  const { plan, planSha256, expectedGitSha } = await loadPinnedPlanFromArguments(root);
  const result = await readRunnerDistributedAggregateResult(resultPath, plan, planSha256);
  const payload = await captureImmutableDist(path.join(root, "dist"));
  if (payload.distPayloadSha256 !== result.distPayloadSha256) {
    fail(
      `final deployable dist differs from the browser-tested immutable payload: ` +
      `expected ${result.distPayloadSha256}, received ${payload.distPayloadSha256}`,
    );
  }
  await assertPlanMatchesCheckout(root, plan, expectedGitSha, "after final dist identity check");
  process.stdout.write(`${JSON.stringify({
    command: "distributed-verify-dist",
    distPayloadSha256: payload.distPayloadSha256,
    planSha256,
  })}\n`);
}

async function main(): Promise<void> {
  const command = process.argv.find((value) =>
    value === "distributed-plan" || value === "distributed-shard" ||
    value === "distributed-aggregate" || value === "distributed-verify-dist");
  if (command === "distributed-plan") return distributedPlanMain();
  if (command === "distributed-shard") return distributedShardMain();
  if (command === "distributed-aggregate") return distributedAggregateMain();
  if (command === "distributed-verify-dist") return distributedVerifyDistMain();
  fail("command must be distributed-plan, distributed-shard, distributed-aggregate, or distributed-verify-dist");
}

const invokedByPath = process.argv.slice(1).some((value) => {
  try {
    return import.meta.url === pathToFileURL(path.resolve(value)).href;
  } catch {
    return false;
  }
});
const invoked = invokedByPath || (
  path.basename(process.argv[1] ?? "").startsWith("vite-node") &&
  process.argv.some((value) =>
    value === "distributed-plan" || value === "distributed-shard" ||
    value === "distributed-aggregate" || value === "distributed-verify-dist")
);
if (invoked) {
  installSignalCleanup();
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
