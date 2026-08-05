import { mkdtemp, rm } from "node:fs/promises";
import {
  arch,
  availableParallelism,
  cpus,
  platform,
  release,
  tmpdir,
} from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  RUNNER_ASSERTION_IDS,
  aggregateRunnerShardRecords,
  assertShardDirectoryOutsideEvaluatedSource,
  evaluateDeterministicGlobalRunnerAssertions,
  loadRunnerEvaluatorInputs,
  readRunnerShardRecord,
  type RunnerAssertionSpec,
} from "./runner-laboratory-evaluator";
import {
  installSignalCleanup,
  runShardProcesses,
} from "./runner-laboratory-evaluator-cli";

const WORKER_COUNT = 2;
const WARMUP_SEED_END = 3;
const REPRESENTATIVE_SEED_END = 23;
const SAMPLE_COUNT = 3;
const FULL_POPULATION_SEED_COUNT = 10_000;

function fail(message: string): never {
  throw new TypeError(`runner laboratory benchmark: ${message}`);
}

async function timedCoordinatorRun(
  root: string,
  seedEndInclusive: number,
): Promise<Readonly<{
  timings: Readonly<{
    workerShardMilliseconds: number;
    shardReadMilliseconds: number;
    inputLoadMilliseconds: number;
    globalAssertionMilliseconds: number;
    aggregationMilliseconds: number;
    closureCheckMilliseconds: number;
    fixedCoordinatorMilliseconds: number;
    totalMilliseconds: number;
  }>;
  evaluatedSourceSha256: string;
  populationSha256: string;
}>> {
  const shardDirectory = await mkdtemp(path.join(tmpdir(), "runner-evaluator-benchmark-"));
  assertShardDirectoryOutsideEvaluatedSource(root, shardDirectory);
  try {
    const startedAt = performance.now();
    const workerStartedAt = performance.now();
    const shardPaths = await runShardProcesses(
      root,
      shardDirectory,
      WORKER_COUNT,
      { seedStart: 0, seedEndInclusive, auxiliaryDomains: false },
    );
    const workerShardMilliseconds = performance.now() - workerStartedAt;
    const shardReadStartedAt = performance.now();
    const records = await Promise.all(shardPaths.map(readRunnerShardRecord));
    const shardReadMilliseconds = performance.now() - shardReadStartedAt;
    const inputLoadStartedAt = performance.now();
    const inputs = await loadRunnerEvaluatorInputs(root);
    const inputLoadMilliseconds = performance.now() - inputLoadStartedAt;
    const globalAssertionStartedAt = performance.now();
    const globalCounters = evaluateDeterministicGlobalRunnerAssertions(inputs);
    const globalAssertionMilliseconds = performance.now() - globalAssertionStartedAt;
    const aggregationStartedAt = performance.now();
    const populationById = new Map(RUNNER_ASSERTION_IDS.map((assertionId) => [
      assertionId,
      globalCounters.find((counter) => counter.assertionId === assertionId)?.checked ?? 0,
    ]));
    for (const record of records) {
      for (const counter of record.assertionCounters) {
        populationById.set(
          counter.assertionId,
          populationById.get(counter.assertionId)! + counter.checked,
        );
      }
    }
    const boundedSpecs: readonly RunnerAssertionSpec[] = RUNNER_ASSERTION_IDS.map(
      (assertionId) => ({
        assertionId,
        population: populationById.get(assertionId)!,
        groupCounts: {},
      }),
    );
    const aggregate = aggregateRunnerShardRecords(
      records,
      globalCounters,
      boundedSpecs,
      inputs.evaluatedSourceSha256,
      { seedStart: 0, seedEndInclusive, seedStep: 1 },
    );
    const aggregationMilliseconds = performance.now() - aggregationStartedAt;
    const closureCheckStartedAt = performance.now();
    const actualSeeds = aggregate.seedDigests.map(({ seed }) => seed);
    const expectedSeeds = Array.from(
      { length: seedEndInclusive + 1 },
      (_, seed) => seed,
    );
    if (
      JSON.stringify(actualSeeds) !== JSON.stringify(expectedSeeds) ||
      records.some((record) =>
        record.evaluatedSourceSha256 !== inputs.evaluatedSourceSha256 ||
        record.assertionCounters.some(({ failureCount }) => failureCount !== 0)) ||
      aggregate.assertionCounters.some(({ failureCount }) => failureCount !== 0)
    ) {
      fail("two-worker coordinator output did not close deterministically");
    }
    const closureCheckMilliseconds = performance.now() - closureCheckStartedAt;
    const fixedCoordinatorMilliseconds =
      shardReadMilliseconds + inputLoadMilliseconds +
      globalAssertionMilliseconds + aggregationMilliseconds +
      closureCheckMilliseconds;
    return Object.freeze({
      timings: Object.freeze({
        workerShardMilliseconds,
        shardReadMilliseconds,
        inputLoadMilliseconds,
        globalAssertionMilliseconds,
        aggregationMilliseconds,
        closureCheckMilliseconds,
        fixedCoordinatorMilliseconds,
        totalMilliseconds: performance.now() - startedAt,
      }),
      evaluatedSourceSha256: inputs.evaluatedSourceSha256,
      populationSha256: aggregate.populationSha256,
    });
  } finally {
    await rm(shardDirectory, { recursive: true, force: true });
  }
}

export function projectFullPopulationMilliseconds(
  representativeMilliseconds: number,
  representativeSeedCount: number,
): number {
  if (
    !Number.isFinite(representativeMilliseconds) || representativeMilliseconds < 0 ||
    !Number.isSafeInteger(representativeSeedCount) || representativeSeedCount < 1
  ) {
    fail("projection inputs must be a nonnegative duration and positive seed count");
  }
  // This deliberately includes per-sample worker startup and is therefore a
  // conservative linear projection rather than an optimistic fitted slope.
  return representativeMilliseconds *
    (FULL_POPULATION_SEED_COUNT / representativeSeedCount);
}

export async function runRunnerLaboratoryBenchmark(): Promise<void> {
  installSignalCleanup();
  const rootIndex = process.argv.indexOf("--project-root");
  const rootArgument = rootIndex < 0 ? undefined : process.argv[rootIndex + 1];
  if (rootArgument === undefined || rootArgument.startsWith("--")) {
    fail("missing --project-root");
  }
  const root = path.resolve(rootArgument);
  const warmup = await timedCoordinatorRun(root, WARMUP_SEED_END);
  const sampleRuns: Array<Awaited<ReturnType<typeof timedCoordinatorRun>>> = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    sampleRuns.push(await timedCoordinatorRun(root, REPRESENTATIVE_SEED_END));
  }
  if (sampleRuns.some(({ evaluatedSourceSha256 }) =>
    evaluatedSourceSha256 !== warmup.evaluatedSourceSha256)) {
    fail("evaluated source changed between benchmark samples");
  }
  if (sampleRuns.some(({ populationSha256 }) =>
    populationSha256 !== sampleRuns[0]?.populationSha256)) {
    fail("benchmark samples did not produce byte-identical aggregate populations");
  }
  const representativeSeedCount = REPRESENTATIVE_SEED_END + 1;
  const scalableSamples = sampleRuns.map(({ timings }) =>
    timings.workerShardMilliseconds);
  const fixedCoordinatorSamples = sampleRuns.map(({ timings }) =>
    timings.fixedCoordinatorMilliseconds);
  const totalSamples = sampleRuns.map(({ timings }) => timings.totalMilliseconds);
  const maximumScalableMilliseconds = Math.max(...scalableSamples);
  const maximumFixedCoordinatorMilliseconds = Math.max(...fixedCoordinatorSamples);
  const projectedFullPopulationMilliseconds = projectFullPopulationMilliseconds(
    maximumScalableMilliseconds,
    representativeSeedCount,
  );
  const result = {
    benchmarkId: "runner-two-worker-phase-benchmark-v2",
    evaluatedSourceSha256: warmup.evaluatedSourceSha256,
    populationSha256: sampleRuns[0]!.populationSha256,
    environment: {
      nodeVersion: process.version,
      platform: platform(),
      release: release(),
      architecture: arch(),
      availableParallelism: availableParallelism(),
      cpuModel: cpus()[0]?.model ?? "unknown",
    },
    workerCount: WORKER_COUNT,
    warmupSeedCount: WARMUP_SEED_END + 1,
    representativeSeedCount,
    fullPopulationSeedCount: FULL_POPULATION_SEED_COUNT,
    sampleCount: SAMPLE_COUNT,
    domain: {
      measured: "base-gameplay-only",
      auxiliaryDomainsMeasured: false,
      fullReleaseEvaluatorAlsoIncludes: [
        "saved-and-os-reduced-motion-pairs",
        "appearance-invariance-witness-seeds",
        "browser-matrix",
      ],
    },
    timingGate: null,
    samples: sampleRuns.map(({ timings }) => Object.fromEntries(
      Object.entries(timings).map(([key, value]) => [key, Math.round(value)]),
    )),
    maximumObservedScalableMilliseconds: Math.round(maximumScalableMilliseconds),
    maximumObservedFixedCoordinatorMilliseconds:
      Math.round(maximumFixedCoordinatorMilliseconds),
    maximumObservedTotalMilliseconds: Math.round(Math.max(...totalSamples)),
    projectedBaseGameplayOnlyMilliseconds:
      Math.round(projectedFullPopulationMilliseconds),
    correctnessPassed: true,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedByPath = process.argv.slice(1).some((value) => {
  try {
    return import.meta.url === pathToFileURL(path.resolve(value)).href;
  } catch {
    return false;
  }
});
if (invokedByPath || process.argv.includes("--run-benchmark")) {
  runRunnerLaboratoryBenchmark().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
