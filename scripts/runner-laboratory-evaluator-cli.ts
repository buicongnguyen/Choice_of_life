import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  aggregateRunnerLaboratoryEvidence,
  assertShardDirectoryOutsideEvaluatedSource,
  atomicWriteCanonicalJson,
  evaluateRunnerLaboratoryShard,
  loadRunnerEvaluatorInputs,
  readRunnerShardRecord,
  type EvidenceMode,
} from "./runner-laboratory-evaluator";
import {
  captureImmutableDist,
  createImmutablePreviewHandler,
  createRunnerEvaluationCapsule,
  createRunnerPreviewProvenance,
  PREVIEW_PROVENANCE_PATH,
  runnerBuildInputsSha256,
  runnerPreviewProvenanceBytes,
  type ImmutableDistPayload,
  type RunnerPreviewProvenance,
} from "./runner-evaluation-capsule";
import { evaluationSourceSha256 } from "./fixture-lock.mjs";

const ACTIVE_CHILDREN = new Set<ChildProcess>();
const ACTIVE_TEMPORARY_DIRECTORIES = new Set<string>();
const PREVIEW_READY_EVENT = "runner-evaluator-preview-ready-v1" as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const RUNNER_RELEASE_WORKER_LIMIT = 4;

export function productionBuildEnvironment(
  inheritedEnvironment: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(inheritedEnvironment)
    .filter(([key]) => {
      const normalized = key.toUpperCase();
      return normalized !== "NODE_ENV" && !normalized.startsWith("VITE_");
    }));
  return Object.freeze({ ...environment, NODE_ENV: "production" });
}

export function defaultReleaseWorkerCount(
  availableWorkerCount = availableParallelism(),
): number {
  if (!Number.isSafeInteger(availableWorkerCount) || availableWorkerCount < 1) {
    return 1;
  }
  return Math.min(
    RUNNER_RELEASE_WORKER_LIMIT,
    availableWorkerCount,
  );
}

export function canonicalReleaseWorkerCount(
  explicitWorkerCount: string | undefined,
  availableWorkerCount = availableParallelism(),
): number {
  if (explicitWorkerCount === undefined) {
    return defaultReleaseWorkerCount(availableWorkerCount);
  }
  const workerCount = Number(explicitWorkerCount);
  if (
    !Number.isSafeInteger(workerCount) || workerCount < 1 ||
    workerCount > RUNNER_RELEASE_WORKER_LIMIT
  ) {
    fail(`canonical --workers must be an integer from 1 through ${RUNNER_RELEASE_WORKER_LIMIT}`);
  }
  return workerCount;
}

function tracked(child: ChildProcess): ChildProcess {
  ACTIVE_CHILDREN.add(child);
  child.once("exit", () => ACTIVE_CHILDREN.delete(child));
  child.once("error", () => ACTIVE_CHILDREN.delete(child));
  return child;
}

function waitForChildExit(child: ChildProcess, timeoutMilliseconds: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMilliseconds);
    child.once("exit", onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let exitPromise = waitForChildExit(child, 5_000);
  child.kill();
  if (await exitPromise) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  exitPromise = waitForChildExit(child, 1_000);
  child.kill("SIGKILL");
  if (!await exitPromise && child.exitCode === null && child.signalCode === null) {
    fail(`child process ${child.pid ?? "unknown"} did not terminate`);
  }
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      ACTIVE_TEMPORARY_DIRECTORIES.delete(directory);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  throw lastError;
}

/**
 * Registers a temporary directory with the evaluator's signal cleanup. The
 * distributed coordinator creates its immutable capsule outside this module,
 * so it must explicitly transfer cleanup ownership before starting children.
 */
export function registerRunnerEvaluatorTemporaryDirectory(directory: string): void {
  ACTIVE_TEMPORARY_DIRECTORIES.add(path.resolve(directory));
}

export async function removeRunnerEvaluatorTemporaryDirectory(
  directory: string,
): Promise<void> {
  await removeTemporaryDirectory(path.resolve(directory));
}

export function installSignalCleanup(): void {
  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    process.once(signal, () => {
      // Windows may retain open handles to capsule files until vite-node and
      // preview children have exited. Always close processes before removal.
      void Promise.all([...ACTIVE_CHILDREN].map(terminateChild))
        .then(() => Promise.all(
          [...ACTIVE_TEMPORARY_DIRECTORIES].map(removeTemporaryDirectory),
        ))
        .catch(() => undefined)
        .finally(() => process.exit(exitCode));
    });
  }
}

function fail(message: string): never {
  throw new TypeError(`runner laboratory evaluator CLI: ${message}`);
}

export function parseRunnerEvaluatorCliArgument(
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
  return parseRunnerEvaluatorCliArgument(process.argv, name, required);
}

function integerArgument(name: string): number {
  const raw = argument(name)!;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail(`${name} must be a safe integer`);
  return value;
}

function digestArgument(name: string): string {
  const value = argument(name)!;
  if (!SHA256_PATTERN.test(value)) fail(`${name} must be a lowercase SHA-256`);
  return value;
}

function evidenceMode(): EvidenceMode {
  const value = argument("--mode");
  if (value !== "generate" && value !== "validate") {
    fail("--mode must be generate or validate");
  }
  return value;
}

export async function assertPinnedEvaluatedSource(
  root: string,
  expectedSha256: string,
  phase: string,
): Promise<void> {
  if (!SHA256_PATTERN.test(expectedSha256)) fail("expected source digest is malformed");
  const actualSha256 = await evaluationSourceSha256(root);
  if (actualSha256 !== expectedSha256) {
    fail(`evaluated source differs ${phase}: expected ${expectedSha256}, received ${actualSha256}`);
  }
}

export async function assertPinnedBuildInputs(
  root: string,
  expectedSha256: string,
  phase: string,
): Promise<void> {
  if (!SHA256_PATTERN.test(expectedSha256)) fail("expected build-input digest is malformed");
  const actualSha256 = await runnerBuildInputsSha256(root);
  if (actualSha256 !== expectedSha256) {
    fail(`production build inputs differ ${phase}: expected ${expectedSha256}, received ${actualSha256}`);
  }
}

async function workerMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const expectedSourceSha256 = digestArgument("--expected-source-sha256");
  const outputPath = path.resolve(argument("--output")!);
  const shardIndex = integerArgument("--shard-index");
  const shardCount = integerArgument("--shard-count");
  const seedStartRaw = argument("--seed-start", false);
  const seedEndRaw = argument("--seed-end", false);
  const auxiliaryRaw = argument("--auxiliary-domains", false);
  if (auxiliaryRaw !== undefined && auxiliaryRaw !== "true" && auxiliaryRaw !== "false") {
    fail("--auxiliary-domains must be true or false");
  }
  assertShardDirectoryOutsideEvaluatedSource(root, path.dirname(outputPath));
  await assertPinnedEvaluatedSource(root, expectedSourceSha256, "before shard evaluation");
  const inputs = await loadRunnerEvaluatorInputs(root);
  if (inputs.evaluatedSourceSha256 !== expectedSourceSha256) {
    fail("worker inputs are not bound to the expected evaluated source");
  }
  const record = await evaluateRunnerLaboratoryShard({
    root,
    inputs,
    shardIndex,
    shardCount,
    ...(seedStartRaw === undefined ? {} : { seedStart: Number(seedStartRaw) }),
    ...(seedEndRaw === undefined ? {} : { seedEndInclusive: Number(seedEndRaw) }),
    ...(auxiliaryRaw === undefined
      ? {}
      : { auxiliaryDomains: auxiliaryRaw === "true" }),
  });
  await assertPinnedEvaluatedSource(root, expectedSourceSha256, "after shard evaluation");
  await atomicWriteCanonicalJson(outputPath, record);
  process.stdout.write(`${JSON.stringify({
    shardIndex,
    shardCount,
    seedCount: record.seedDigests.length,
    evaluatedSourceSha256: expectedSourceSha256,
    outputPath,
  })}\n`);
}

async function listenOnLoopback(port: number, handler: ReturnType<typeof createImmutablePreviewHandler>): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function previewWorkerMain(): Promise<void> {
  const root = path.resolve(argument("--project-root")!);
  const expectedSourceSha256 = digestArgument("--expected-source-sha256");
  const buildInputsSha256 = digestArgument("--build-inputs-sha256");
  const expectedDistPayloadSha256 = digestArgument("--dist-payload-sha256");
  const runNonce = digestArgument("--run-nonce");
  const port = integerArgument("--preview-port");
  if (port < 1024 || port > 65_535) {
    fail("--preview-port must be an integer from 1024 through 65535");
  }
  await assertPinnedEvaluatedSource(root, expectedSourceSha256, "before preview capture");
  const payload = await captureImmutableDist(path.join(root, "dist"));
  if (payload.distPayloadSha256 !== expectedDistPayloadSha256) {
    fail("preview worker captured different dist bytes than the coordinator");
  }
  const provenance = createRunnerPreviewProvenance({
    evaluatedSourceSha256: expectedSourceSha256,
    buildInputsSha256,
    distPayloadSha256: payload.distPayloadSha256,
    runNonce,
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await listenOnLoopback(port, createImmutablePreviewHandler(payload, provenance));
  process.stdout.write(`${JSON.stringify({
    event: PREVIEW_READY_EVENT,
    baseUrl,
    provenance,
  })}\n`);
  // The HTTP listener owns immutable Buffers captured before this ready event
  // and keeps this exact child alive until the coordinator terminates it.
}

export interface ChildResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function awaitRunnerShardCompletions(
  completions: readonly Promise<ChildResult>[],
): Promise<readonly ChildResult[]> {
  return Promise.all(completions.map(async (completion, shardIndex) => {
    const result = await completion;
    if (result.exitCode !== 0) {
      fail(
        `shard ${shardIndex} exited ${result.exitCode}: ` +
        `${result.stderr || result.stdout}`,
      );
    }
    return result;
  }));
}

function collectChild(child: ChildProcess): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({
      exitCode: code ?? (signal === null ? 1 : 128),
      stdout,
      stderr,
    }));
  });
}

export async function runPinnedProductionBuild(
  toolRoot: string,
  evaluationRoot: string,
  expectedSourceSha256: string,
  expectedBuildInputsSha256: string,
  inheritedEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
): Promise<ImmutableDistPayload> {
  await assertPinnedEvaluatedSource(
    evaluationRoot,
    expectedSourceSha256,
    "before production build",
  );
  await assertPinnedBuildInputs(
    evaluationRoot,
    expectedBuildInputsSha256,
    "before production build",
  );
  const commands = [
    [path.join(toolRoot, "node_modules", "typescript", "bin", "tsc")],
    [
      path.join(toolRoot, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--mode",
      "production",
    ],
  ] as const;
  const environment = productionBuildEnvironment(inheritedEnvironment);
  for (const command of commands) {
    const result = await collectChild(tracked(spawn(process.execPath, command, {
      cwd: evaluationRoot,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })));
    if (result.exitCode !== 0) {
      fail(`production build failed: ${result.stderr || result.stdout}`);
    }
    await assertPinnedEvaluatedSource(
      evaluationRoot,
      expectedSourceSha256,
      "during production build",
    );
    await assertPinnedBuildInputs(
      evaluationRoot,
      expectedBuildInputsSha256,
      "during production build",
    );
  }
  return captureImmutableDist(path.join(evaluationRoot, "dist"));
}

export interface ManagedPreview {
  readonly baseUrl: string;
  readonly child: ChildProcess;
  readonly provenance: RunnerPreviewProvenance;
}

export async function startManagedPreview(
  evaluationRoot: string,
  toolRoot: string,
  port: number,
  expectedSourceSha256: string,
  buildInputsSha256: string,
  runNonce: string,
): Promise<ManagedPreview> {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    fail("--preview-port must be an integer from 1024 through 65535");
  }
  const payload = await runPinnedProductionBuild(
    toolRoot,
    evaluationRoot,
    expectedSourceSha256,
    buildInputsSha256,
  );
  const provenance = createRunnerPreviewProvenance({
    evaluatedSourceSha256: expectedSourceSha256,
    buildInputsSha256,
    distPayloadSha256: payload.distPayloadSha256,
    runNonce,
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  const viteNodePath = path.join(toolRoot, "node_modules", "vite-node", "vite-node.mjs");
  const cliPath = path.join(
    evaluationRoot,
    "scripts",
    "runner-laboratory-evaluator-cli.ts",
  );
  const child = tracked(spawn(process.execPath, [
    viteNodePath,
    cliPath,
    "preview-worker",
    "--project-root", evaluationRoot,
    "--preview-port", String(port),
    "--expected-source-sha256", expectedSourceSha256,
    "--build-inputs-sha256", buildInputsSha256,
    "--dist-payload-sha256", payload.distPayloadSha256,
    "--run-nonce", runNonce,
  ], {
    cwd: evaluationRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }));
  let previewOutput = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { previewOutput += chunk; });
  child.stderr?.on("data", (chunk: string) => { previewOutput += chunk; });
  let previewSpawnError: string | null = null;
  child.once("error", (error) => {
    previewSpawnError = error instanceof Error ? error.message : String(error);
  });
  const readyMarker = JSON.stringify({
    event: PREVIEW_READY_EVENT,
    baseUrl,
    provenance,
  });
  const expectedProvenanceBytes = runnerPreviewProvenanceBytes(provenance);
  const expectedIndexBytes = payload.files.find(({ relativePath }) =>
    relativePath === "index.html")!.bytes;
  let lastError = "preview did not become ready";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (previewSpawnError !== null) {
      fail(`production preview failed to spawn: ${previewSpawnError}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`production preview exited before readiness (${child.exitCode ?? child.signalCode}): ${previewOutput}`);
    }
    try {
      const [provenanceResponse, indexResponse] = await Promise.all([
        fetch(`${baseUrl}${PREVIEW_PROVENANCE_PATH}`, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(1_000),
        }),
        fetch(baseUrl, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(1_000),
        }),
      ]);
      const [provenanceBytes, indexBytes] = await Promise.all([
        provenanceResponse.text(),
        indexResponse.arrayBuffer(),
      ]);
      const announcedBySpawnedProcess = previewOutput.includes(readyMarker);
      if (
        provenanceResponse.ok && indexResponse.ok && announcedBySpawnedProcess &&
        provenanceBytes === expectedProvenanceBytes &&
        Buffer.compare(Buffer.from(indexBytes), expectedIndexBytes) === 0 &&
        child.exitCode === null && child.signalCode === null
      ) {
        return Object.freeze({ baseUrl, child, provenance });
      }
      lastError = provenanceResponse.ok && indexResponse.ok
        ? "HTTP endpoint did not prove the expected child/source/dist provenance"
        : `preview returned HTTP ${provenanceResponse.status}/${indexResponse.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  await terminateChild(child);
  fail(`production preview readiness timed out: ${lastError}; child output: ${previewOutput}`);
}

export async function stopManagedPreview(child: ChildProcess | null): Promise<void> {
  if (child !== null) await terminateChild(child);
}

export interface RunnerShardExecutionContext {
  readonly toolRoot?: string;
  readonly cliPath?: string;
  readonly expectedSourceSha256?: string;
}

export interface RunnerShardProcessAssignment {
  readonly shardIndex: number;
  readonly outputPath: string;
}

export async function runShardIndexProcesses(
  root: string,
  assignments: readonly RunnerShardProcessAssignment[],
  shardCount: number,
  boundedDomain?: Readonly<{
    seedStart: number;
    seedEndInclusive: number;
    auxiliaryDomains: boolean;
  }>,
  context: RunnerShardExecutionContext = {},
): Promise<readonly string[]> {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1 || shardCount > 64) {
    fail("shard count must be an integer from 1 through 64");
  }
  if (assignments.length < 1 || assignments.length > 64) {
    fail("shard assignment count must be an integer from 1 through 64");
  }
  const indices = assignments.map(({ shardIndex }) => shardIndex);
  if (
    new Set(indices).size !== indices.length ||
    indices.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= shardCount)
  ) {
    fail("shard assignments contain an invalid or duplicate global index");
  }
  const outputPaths = assignments.map(({ outputPath }) => path.resolve(outputPath));
  if (new Set(outputPaths).size !== outputPaths.length) {
    fail("shard assignments contain duplicate output paths");
  }
  for (const outputPath of outputPaths) {
    assertShardDirectoryOutsideEvaluatedSource(root, path.dirname(outputPath));
  }
  const expectedSourceSha256 = context.expectedSourceSha256 ??
    await evaluationSourceSha256(root);
  await assertPinnedEvaluatedSource(root, expectedSourceSha256, "before shard spawn");
  const toolRoot = path.resolve(context.toolRoot ?? root);
  const viteNodePath = path.join(toolRoot, "node_modules", "vite-node", "vite-node.mjs");
  const cliPath = path.resolve(context.cliPath ??
    path.join(root, "scripts", "runner-laboratory-evaluator-cli.ts"));
  const children: ChildProcess[] = [];
  try {
    const completions = assignments.map(({ outputPath, shardIndex }) => {
      const child = tracked(spawn(process.execPath, [
        viteNodePath,
        cliPath,
        "worker",
        "--project-root", root,
        "--expected-source-sha256", expectedSourceSha256,
        "--shard-index", String(shardIndex),
        "--shard-count", String(shardCount),
        "--output", path.resolve(outputPath),
        ...(boundedDomain === undefined
          ? []
          : [
              "--seed-start", String(boundedDomain.seedStart),
              "--seed-end", String(boundedDomain.seedEndInclusive),
              "--auxiliary-domains", String(boundedDomain.auxiliaryDomains),
            ]),
      ], {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }));
      children.push(child);
      return collectChild(child);
    });
    await awaitRunnerShardCompletions(completions);
    await assertPinnedEvaluatedSource(root, expectedSourceSha256, "after shard completion");
    return Object.freeze(outputPaths);
  } catch (error) {
    await Promise.all(children.map(terminateChild));
    throw error;
  }
}

export async function runShardProcesses(
  root: string,
  shardDirectory: string,
  workerCount: number,
  boundedDomain?: Readonly<{
    seedStart: number;
    seedEndInclusive: number;
    auxiliaryDomains: boolean;
  }>,
  context: RunnerShardExecutionContext = {},
): Promise<readonly string[]> {
  if (!Number.isSafeInteger(workerCount) || workerCount < 1 || workerCount > 64) {
    fail("--workers must be an integer from 1 through 64");
  }
  const shardPaths = Array.from({ length: workerCount }, (_, shardIndex) =>
    path.join(shardDirectory, `shard-${shardIndex}-of-${workerCount}.json`));
  return runShardIndexProcesses(
    root,
    shardPaths.map((outputPath, shardIndex) => ({ shardIndex, outputPath })),
    workerCount,
    boundedDomain,
    context,
  );
}

function pinnedRunArguments(): Readonly<{
  evaluationRoot: string;
  publicationRoot: string;
  toolRoot: string;
  expectedSourceSha256: string;
  buildInputsSha256: string;
  runNonce: string;
}> {
  return Object.freeze({
    evaluationRoot: path.resolve(argument("--project-root")!),
    publicationRoot: path.resolve(argument("--publication-root")!),
    toolRoot: path.resolve(argument("--tool-root")!),
    expectedSourceSha256: digestArgument("--expected-source-sha256"),
    buildInputsSha256: digestArgument("--build-inputs-sha256"),
    runNonce: digestArgument("--run-nonce"),
  });
}

async function pinnedCoordinatorMain(): Promise<void> {
  const {
    evaluationRoot,
    publicationRoot,
    toolRoot,
    expectedSourceSha256,
    buildInputsSha256,
    runNonce,
  } = pinnedRunArguments();
  const workersRaw = argument("--workers", false);
  const workerCount = canonicalReleaseWorkerCount(workersRaw);
  const mode = evidenceMode();
  if (argument("--browser-base-url", false) !== undefined) {
    fail("canonical generate/validate does not accept --browser-base-url; use the managed local preview");
  }
  const manualReviewWrapper = argument("--manual-review-wrapper", false);
  if (mode === "generate" && manualReviewWrapper === undefined) {
    fail("generate mode requires --manual-review-wrapper from a temporary external artifact");
  }
  const runnerEvidence = argument("--runner-evidence", false);
  const activeSuiteEvidence = argument("--active-suite-evidence", false);
  await assertPinnedEvaluatedSource(evaluationRoot, expectedSourceSha256, "at coordinator entry");
  await assertPinnedEvaluatedSource(publicationRoot, expectedSourceSha256, "at live-root entry");
  await assertPinnedBuildInputs(evaluationRoot, buildInputsSha256, "at coordinator entry");
  await assertPinnedBuildInputs(publicationRoot, buildInputsSha256, "at live-root entry");
  const shardDirectory = await mkdtemp(path.join(tmpdir(), "runner-evaluator-shards-"));
  ACTIVE_TEMPORARY_DIRECTORIES.add(shardDirectory);
  assertShardDirectoryOutsideEvaluatedSource(evaluationRoot, shardDirectory);
  let managedPreview: ChildProcess | null = null;
  try {
    const preview = await startManagedPreview(
      evaluationRoot,
      toolRoot,
      Number(argument("--preview-port", false) ?? "4178"),
      expectedSourceSha256,
      buildInputsSha256,
      runNonce,
    );
    managedPreview = preview.child;
    const shardPaths = await runShardProcesses(
      evaluationRoot,
      shardDirectory,
      workerCount,
      undefined,
      {
        toolRoot,
        cliPath: path.join(evaluationRoot, "scripts", "runner-laboratory-evaluator-cli.ts"),
        expectedSourceSha256,
      },
    );
    const result = await aggregateRunnerLaboratoryEvidence({
      root: evaluationRoot,
      publicationRoot,
      expectedEvaluatedSourceSha256: expectedSourceSha256,
      previewProvenance: preview.provenance,
      mode,
      shardPaths,
      browserBaseUrl: preview.baseUrl,
      ...(manualReviewWrapper === undefined
        ? {}
        : { manualReviewWrapperPath: path.resolve(manualReviewWrapper) }),
      ...(runnerEvidence === undefined
        ? {}
        : { runnerEvidencePath: path.resolve(runnerEvidence) }),
      ...(activeSuiteEvidence === undefined
        ? {}
        : { activeSuiteEvidencePath: path.resolve(activeSuiteEvidence) }),
    });
    process.stdout.write(`${JSON.stringify({
      evaluatorId: "runner-laboratory-evaluator-v1",
      mode,
      workerCount,
      evaluatedSourceSha256: result.aggregate.evaluatedSourceSha256,
      buildInputsSha256,
      distPayloadSha256: preview.provenance.distPayloadSha256,
      populationSha256: result.aggregate.populationSha256,
      seedCount: result.aggregate.seedDigests.length,
      assertionCount: result.aggregate.assertionCounters.length,
    })}\n`);
  } finally {
    try {
      await stopManagedPreview(managedPreview);
    } finally {
      await removeTemporaryDirectory(shardDirectory);
    }
  }
}

async function pinnedSmokeMain(): Promise<void> {
  const {
    evaluationRoot,
    publicationRoot,
    toolRoot,
    expectedSourceSha256,
    buildInputsSha256,
    runNonce,
  } = pinnedRunArguments();
  const workersRaw = argument("--workers", false);
  const workerCount = workersRaw === undefined
    ? defaultReleaseWorkerCount()
    : Number(workersRaw);
  const seedStart = Number(argument("--seed-start", false) ?? "0");
  const seedEndInclusive = Number(argument("--seed-end", false) ?? "3");
  if (
    !Number.isSafeInteger(seedStart) || !Number.isSafeInteger(seedEndInclusive) ||
    seedStart < 0 || seedEndInclusive < seedStart ||
    seedEndInclusive - seedStart + 1 > 100
  ) {
    fail("smoke seed range must contain 1 through 100 nonnegative seeds");
  }
  const shardDirectory = await mkdtemp(path.join(tmpdir(), "runner-evaluator-smoke-"));
  ACTIVE_TEMPORARY_DIRECTORIES.add(shardDirectory);
  assertShardDirectoryOutsideEvaluatedSource(evaluationRoot, shardDirectory);
  const externalBrowserBaseUrl = argument("--browser-base-url", false);
  let managedPreview: ChildProcess | null = null;
  try {
    let browserBaseUrl = externalBrowserBaseUrl;
    let previewProvenance: RunnerPreviewProvenance | null = null;
    if (browserBaseUrl === undefined) {
      const preview = await startManagedPreview(
        evaluationRoot,
        toolRoot,
        Number(argument("--preview-port", false) ?? "4178"),
        expectedSourceSha256,
        buildInputsSha256,
        runNonce,
      );
      managedPreview = preview.child;
      browserBaseUrl = preview.baseUrl;
      previewProvenance = preview.provenance;
    }
    const health = await fetch(browserBaseUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!health.ok) fail(`smoke preview returned HTTP ${health.status}`);
    await health.arrayBuffer();
    const shardPaths = await runShardProcesses(
      evaluationRoot,
      shardDirectory,
      workerCount,
      { seedStart, seedEndInclusive, auxiliaryDomains: false },
      {
        toolRoot,
        cliPath: path.join(evaluationRoot, "scripts", "runner-laboratory-evaluator-cli.ts"),
        expectedSourceSha256,
      },
    );
    const inputs = await loadRunnerEvaluatorInputs(evaluationRoot);
    const shards = await Promise.all(shardPaths.map(readRunnerShardRecord));
    const seeds = shards.flatMap((shard) => shard.seedDigests.map(({ seed }) => seed))
      .sort((left, right) => left - right);
    const expectedSeeds = Array.from(
      { length: seedEndInclusive - seedStart + 1 },
      (_, index) => seedStart + index,
    );
    if (
      JSON.stringify(seeds) !== JSON.stringify(expectedSeeds) ||
      shards.some((shard) =>
        shard.evaluatedSourceSha256 !== expectedSourceSha256 ||
        shard.assertionCounters.some(({ failureCount }) => failureCount !== 0))
    ) {
      fail("bounded OS-process shard smoke did not close deterministically");
    }
    await assertPinnedEvaluatedSource(
      publicationRoot,
      expectedSourceSha256,
      "before smoke completion",
    );
    await assertPinnedBuildInputs(
      evaluationRoot,
      buildInputsSha256,
      "before smoke completion",
    );
    await assertPinnedBuildInputs(
      publicationRoot,
      buildInputsSha256,
      "before smoke completion",
    );
    process.stdout.write(`${JSON.stringify({
      evaluatorId: "runner-laboratory-evaluator-v1",
      smoke: true,
      workerCount,
      seedStart,
      seedEndInclusive,
      evaluatedSourceSha256: inputs.evaluatedSourceSha256,
      previewBinding: previewProvenance === null ? "external-unverified" : previewProvenance,
      previewBaseUrl: browserBaseUrl,
    })}\n`);
  } finally {
    try {
      await stopManagedPreview(managedPreview);
    } finally {
      await removeTemporaryDirectory(shardDirectory);
    }
  }
}

function forwardedArgument(name: string, pathValue = false): readonly string[] {
  const value = argument(name, false);
  if (value === undefined) return [];
  return [name, pathValue ? path.resolve(value) : value];
}

async function launchPinned(command: "pinned-run" | "pinned-smoke"): Promise<void> {
  const liveRoot = path.resolve(argument("--project-root")!);
  const capsule = await createRunnerEvaluationCapsule(liveRoot);
  ACTIVE_TEMPORARY_DIRECTORIES.add(capsule.capsuleRoot);
  const runNonce = randomBytes(32).toString("hex");
  const forwarded = command === "pinned-run"
    ? [
        ...forwardedArgument("--mode"),
        ...forwardedArgument("--workers"),
        ...forwardedArgument("--preview-port"),
        ...forwardedArgument("--manual-review-wrapper", true),
        ...forwardedArgument("--runner-evidence", true),
        ...forwardedArgument("--active-suite-evidence", true),
      ]
    : [
        ...forwardedArgument("--workers"),
        ...forwardedArgument("--preview-port"),
        ...forwardedArgument("--seed-start"),
        ...forwardedArgument("--seed-end"),
        ...forwardedArgument("--browser-base-url"),
      ];
  try {
    const viteNodePath = path.join(liveRoot, "node_modules", "vite-node", "vite-node.mjs");
    const capsuleCliPath = path.join(
      capsule.capsuleRoot,
      "scripts",
      "runner-laboratory-evaluator-cli.ts",
    );
    const result = await collectChild(tracked(spawn(process.execPath, [
      viteNodePath,
      capsuleCliPath,
      command,
      "--project-root", capsule.capsuleRoot,
      "--publication-root", liveRoot,
      "--tool-root", liveRoot,
      "--expected-source-sha256", capsule.evaluatedSourceSha256,
      "--build-inputs-sha256", capsule.buildInputsSha256,
      "--run-nonce", runNonce,
      ...forwarded,
    ], {
      cwd: capsule.capsuleRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })));
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    if (result.exitCode !== 0) {
      fail(`pinned evaluator coordinator exited ${result.exitCode}`);
    }
  } finally {
    await removeTemporaryDirectory(capsule.capsuleRoot);
  }
}

async function main(): Promise<void> {
  const command = process.argv.find((value) =>
    value === "run" || value === "smoke" || value === "pinned-run" ||
    value === "pinned-smoke" || value === "worker" || value === "preview-worker");
  if (command === "preview-worker") {
    await previewWorkerMain();
    return;
  }
  if (command === "worker") {
    await workerMain();
    return;
  }
  if (command === "pinned-run") {
    await pinnedCoordinatorMain();
    return;
  }
  if (command === "pinned-smoke") {
    await pinnedSmokeMain();
    return;
  }
  if (command === "run") {
    await launchPinned("pinned-run");
    return;
  }
  if (command === "smoke") {
    await launchPinned("pinned-smoke");
    return;
  }
  fail("first argument must be run or smoke");
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
    value === "run" || value === "smoke" || value === "pinned-run" ||
    value === "pinned-smoke" || value === "worker" || value === "preview-worker")
);
if (invoked) {
  installSignalCleanup();
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
