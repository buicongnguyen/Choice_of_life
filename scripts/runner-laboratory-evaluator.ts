import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalizeJson, type CanonicalJsonValue } from "../src/choice-of-life/core/canonical-json";
import { RUNNER_LABORATORY_CATALOG } from "../src/choice-of-life/core/catalog";
import {
  deriveRunIdFromStateV1,
  type InitialRunSetup,
} from "../src/choice-of-life/core/run-factory";
import { decodeRunState, encodeRunState } from "../src/choice-of-life/core/run-state-codec";
import { stateHashV1 } from "../src/choice-of-life/core/run-state-hash";
import {
  certifyRunStateWireBijectionV1,
  RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID,
  type RunStateWireBijectionPairMutator,
} from "../src/choice-of-life/core/run-state-wire";
import { LOGICAL_TICK_MILLISECONDS } from "../src/choice-of-life/core/stage-clock";
import {
  SCORE_IDS,
  STARTING_PROFILE_SCORES,
  zeroSourceTotals,
  type ControlMode,
  type CoreScores,
  type Difficulty,
  type EffectLedger,
  type Lane,
  type RunnerEntity,
  type RunStateV1,
  type StartingProfileId,
} from "../src/choice-of-life/core/run-state";
import {
  effectIdForRunnerEntity,
  resolveCanonicalContactCandidates,
  runnerPatternSafeBoundaryTick,
  RUNNER_INVULNERABILITY_TICKS,
  type ContactCandidate,
} from "../src/choice-of-life/core/runner/collision-system";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_COLLISION_CONTRACT,
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_GENERATOR_CONTRACT,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "../src/choice-of-life/core/runner/contract";
import {
  generateRunnerLaboratoryCourse,
  isAuthenticRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
} from "../src/choice-of-life/core/runner/course-generator";
import {
  evaluateRunnerAuthenticatedModeProjection,
  evaluateRunnerAuthenticatedManualCommandProjection,
  createRunnerModeEvaluationSupport,
  evaluateRunnerForcedContinuation,
  evaluateRunnerNeutralReplay,
  effectiveRunnerMotionReduced,
  isAuthenticRunnerForcedContinuationReplay,
  isAuthenticRunnerModeProjection,
  isAuthenticRunnerNeutralReplayTape,
  type RunnerAuthenticatedModeProjection,
  type RunnerAuthenticatedManualCommand,
  type RunnerForcedContinuationReplay,
  type RunnerNeutralReplayTape,
} from "../src/choice-of-life/core/runner/evaluation-replay";
import {
  evaluateAutomaticAuthenticatedModeProjection,
  isAuthenticAutomaticModeProjection,
  type RunnerAutomaticAuthenticatedProjection,
} from "../src/choice-of-life/core/runner/automatic-oracle";
import {
  adjacentLane,
  enumerateIncomingLaneStates,
  laneControllerStateKey,
  stepLaneController,
  type LaneControllerState,
  type LaneDirection,
  type LaneIntent,
} from "../src/choice-of-life/core/runner/lane-controller";
import {
  assertRunnerReachability,
  type AbstractReachabilityPattern,
} from "../src/choice-of-life/core/runner/reachability-validator";
import {
  chooseLane,
  createRunnerSimulationContext,
  type RunnerIndependentPauseReason,
} from "../src/choice-of-life/core/runner/simulation";
import {
  createFixedStepDriver,
  RUNTIME_PAUSE_REASON_ORDER,
  type FixedStepDriver,
  type RuntimePauseReason,
} from "../src/choice-of-life/platform/fixed-step-driver";
import {
  createRunnerKeyboardBindings,
  createRunnerSwipeRecognizer,
  handleRunnerKeydown,
  requestRunnerButtonIntent,
  type RunnerInputGate,
} from "../src/choice-of-life/platform/runner-input";
import {
  createRunnerPresentationModel,
  type RunnerLaneWarning,
} from "../src/choice-of-life/presentation/runner-model";
import {
  createRunnerSemanticFieldsetElements,
  renderRunnerSemanticFieldset,
  type RunnerSemanticFieldsetElements,
  type RunnerSemanticFieldsetRenderProjection,
} from "../src/choice-of-life/presentation/runner-view";
import {
  evaluationSourceSha256,
  validateActiveSuiteExecution,
  validateRunnerEvidence,
  validateRunnerFixture,
} from "./fixture-lock.mjs";
import {
  executeRunnerBrowserMatrix,
  validateRunnerBrowserMatrixArtifact,
  type RunnerBrowserMatrixArtifact,
} from "./runner-browser-matrix";
import {
  PREVIEW_PROVENANCE_PATH,
  runnerBuildInputsSha256,
  runnerPreviewProvenanceBytes,
  validateRunnerPreviewProvenance,
  type RunnerPreviewProvenance,
} from "./runner-evaluation-capsule";

export const RUNNER_LABORATORY_EVALUATOR_ID =
  "runner-laboratory-evaluator-v1" as const;
export const RUNNER_LABORATORY_SHARD_SCHEMA_VERSION = 1 as const;
export const RUNNER_LABORATORY_MANUAL_WRAPPER_ID =
  "runner-accessibility-manual-review-wrapper-v1" as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const MAX_FAILURE_WITNESSES = 32;

export const RUNNER_SEMANTIC_PRESENTATION_CASE_POPULATION = 1_080 as const;

export const RUNNER_ASSERTION_IDS = Object.freeze([
  "runner-generation-determinism-v1",
  "runner-pattern-composition-v1",
  "runner-laboratory-reachability-v1",
  "runner-input-adjacency-v1",
  "runner-buffer-handoff-v1",
  "runner-contact-idempotency-v1",
  "runner-invulnerability-ownership-v1",
  "runner-entity-cap-v1",
  "runner-nondepletion-v1",
  "runner-laboratory-replay-v1",
  "runner-automatic-settlement-idempotency-v1",
  "runner-modality-identity-v1",
  "runner-pause-drift-v1",
  "runner-appearance-invariance-v1",
  "semantic-assist-effect-identity-v1",
  "automatic-assist-score-parity-v1",
  "assist-narrative-parity-v1",
  "runner-completion-memory-parity-v1",
  "runner-simultaneous-contact-order-v1",
  "runner-semantic-choice-and-reload-identity-v1",
  "runner-automatic-no-input-completion-v1",
  "runner-reduced-motion-domain-identity-v1",
  "runner-accessibility-browser-matrix-v1",
] as const);

export type RunnerAssertionId = (typeof RUNNER_ASSERTION_IDS)[number];

export const RUNNER_ASSERTION_FAMILIES = Object.freeze({
  generation: Object.freeze([
    "runner-generation-determinism-v1",
    "runner-pattern-composition-v1",
    "runner-laboratory-reachability-v1",
  ]),
  input: Object.freeze([
    "runner-input-adjacency-v1",
    "runner-buffer-handoff-v1",
  ]),
  contact: Object.freeze([
    "runner-contact-idempotency-v1",
    "runner-invulnerability-ownership-v1",
    "runner-entity-cap-v1",
  ]),
  replay: Object.freeze([
    "runner-nondepletion-v1",
    "runner-laboratory-replay-v1",
    "runner-automatic-settlement-idempotency-v1",
    "runner-modality-identity-v1",
  ]),
  pause: Object.freeze(["runner-pause-drift-v1"]),
  appearance: Object.freeze(["runner-appearance-invariance-v1"]),
  assist: Object.freeze([
    "semantic-assist-effect-identity-v1",
    "automatic-assist-score-parity-v1",
    "assist-narrative-parity-v1",
    "runner-completion-memory-parity-v1",
    "runner-automatic-no-input-completion-v1",
  ]),
  permutation: Object.freeze(["runner-simultaneous-contact-order-v1"]),
  semantic: Object.freeze(["runner-semantic-choice-and-reload-identity-v1"]),
  reducedMotion: Object.freeze(["runner-reduced-motion-domain-identity-v1"]),
  browser: Object.freeze(["runner-accessibility-browser-matrix-v1"]),
} as const satisfies Readonly<Record<string, readonly RunnerAssertionId[]>>);

export type RunnerAssertionFamily = keyof typeof RUNNER_ASSERTION_FAMILIES;

export interface RunnerAssertionSpec {
  readonly assertionId: RunnerAssertionId;
  readonly population: number;
  readonly groupCounts: Readonly<Record<string, number>>;
}

export interface RunnerFailureWitness {
  readonly witnessId: string;
  readonly message: string;
}

export interface RunnerAssertionCounter {
  readonly assertionId: RunnerAssertionId;
  readonly checked: number;
  readonly failureCount: number;
  readonly failureWitnesses: readonly RunnerFailureWitness[];
}

interface MutableCounter {
  assertionId: RunnerAssertionId;
  checked: number;
  failureCount: number;
  failureWitnesses: RunnerFailureWitness[];
}

export interface RunnerSeedDigest {
  readonly seed: number;
  readonly sha256: string;
}

export interface RunnerLaboratoryShardRecord {
  readonly schemaVersion: typeof RUNNER_LABORATORY_SHARD_SCHEMA_VERSION;
  readonly evaluatorId: typeof RUNNER_LABORATORY_EVALUATOR_ID;
  readonly evaluatedSourceSha256: string;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly seedStart: number;
  readonly seedEndInclusive: number;
  readonly seedStep: number;
  readonly assertionCounters: readonly RunnerAssertionCounter[];
  readonly seedDigests: readonly RunnerSeedDigest[];
}

export interface RunnerCanonicalAggregate {
  readonly evaluatedSourceSha256: string;
  readonly assertionCounters: readonly RunnerAssertionCounter[];
  readonly seedDigests: readonly RunnerSeedDigest[];
  readonly populationSha256: string;
}

export interface RunnerEvaluatorInputs {
  readonly fixture: any;
  readonly fixtureSchema: any;
  readonly contentLock: any;
  readonly registry: any;
  readonly assertionSpecs: readonly RunnerAssertionSpec[];
  readonly evaluatedSourceSha256: string;
}

export interface RunnerShardEvaluationOptions {
  readonly root: string;
  readonly inputs: RunnerEvaluatorInputs;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly seedStart?: number;
  readonly seedEndInclusive?: number;
  /** Unit tests may disable the costly auxiliary domains; evidence mode may not. */
  readonly auxiliaryDomains?: boolean;
}

export interface ManualReviewWrapper {
  readonly schemaVersion: 1;
  readonly artifactId: typeof RUNNER_LABORATORY_MANUAL_WRAPPER_ID;
  readonly evaluatedSourceSha256: string;
  readonly manualReviewEvidence: any;
}

function fail(message: string): never {
  throw new Error(`runner laboratory evaluator: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys differ: ${actual.join(",")}`);
  }
}

function canonical(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function exactArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return canonical(left) === canonical(right);
}

function seedHex(seed: number): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    fail(`seed is outside the uint32 domain: ${seed}`);
  }
  return seed.toString(16).padStart(16, "0");
}

function defaultSetup(
  startingProfileId: StartingProfileId,
  difficulty: Difficulty,
  controlMode: ControlMode = "manual",
): InitialRunSetup {
  return {
    startingProfileId,
    difficulty,
    controlMode,
    identity: { gender: "female" },
    appearance: {
      heritageStyleId: "asian",
      hairStyleId: "tied-back",
      hairColorId: "dark-brown",
      clothingPaletteId: "meadow",
    },
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      textScale: 100,
      screenReaderAnnouncements: true,
    },
  };
}

function newCounterMap(): Map<RunnerAssertionId, MutableCounter> {
  return new Map(
    RUNNER_ASSERTION_IDS.map((assertionId) => [
      assertionId,
      { assertionId, checked: 0, failureCount: 0, failureWitnesses: [] },
    ]),
  );
}

export function recordAssertionCheck(
  counters: Map<RunnerAssertionId, MutableCounter>,
  assertionId: RunnerAssertionId,
  passed: boolean,
  witnessId: string,
  message: string,
  multiplicity = 1,
): void {
  if (!Number.isInteger(multiplicity) || multiplicity <= 0) {
    fail("assertion multiplicity must be a positive integer");
  }
  const counter = counters.get(assertionId);
  if (counter === undefined) fail(`unknown assertion ${assertionId}`);
  counter.checked += multiplicity;
  if (passed) return;
  counter.failureCount += multiplicity;
  counter.failureWitnesses.push({ witnessId, message });
  counter.failureWitnesses.sort((left, right) =>
    left.witnessId.localeCompare(right.witnessId) ||
    left.message.localeCompare(right.message));
  if (counter.failureWitnesses.length > MAX_FAILURE_WITNESSES) {
    counter.failureWitnesses.length = MAX_FAILURE_WITNESSES;
  }
}

function freezeCounters(
  counters: Map<RunnerAssertionId, MutableCounter>,
): readonly RunnerAssertionCounter[] {
  return Object.freeze(
    RUNNER_ASSERTION_IDS.map((assertionId) => {
      const counter = counters.get(assertionId)!;
      return deepFreeze({
        assertionId,
        checked: counter.checked,
        failureCount: counter.failureCount,
        failureWitnesses: [...counter.failureWitnesses].sort((left, right) =>
          left.witnessId.localeCompare(right.witnessId) ||
          left.message.localeCompare(right.message)),
      });
    }),
  );
}

function parseAssertionSpecs(fixture: any): readonly RunnerAssertionSpec[] {
  if (!Array.isArray(fixture?.assertions)) fail("fixture assertions are missing");
  const actualIds = fixture.assertions.map((item: any) => item?.assertionId);
  if (!exactArray(actualIds, RUNNER_ASSERTION_IDS)) {
    fail("fixture assertion closure or order differs from the locked 23 assertions");
  }
  return deepFreeze(fixture.assertions.map((item: any) => {
    assertExactKeys(item, ["assertionId", "population", "groupCounts"], `fixture assertion ${item?.assertionId}`);
    const assertionId = item.assertionId;
    const population = item.population;
    const groupCounts = item.groupCounts;
    if (typeof assertionId !== "string" || !Number.isInteger(population) || (population as number) <= 0) {
      fail(`fixture assertion population is invalid: ${String(assertionId)}`);
    }
    if (!isObject(groupCounts)) fail(`fixture group counts are invalid: ${assertionId}`);
    for (const [key, count] of Object.entries(groupCounts)) {
      if (!ID_PATTERN.test(`${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}-v1`) ||
          !Number.isInteger(count) || (count as number) < 0) {
        fail(`fixture group count is invalid: ${assertionId}/${key}`);
      }
    }
    return {
      assertionId: assertionId as RunnerAssertionId,
      population: population as number,
      groupCounts: { ...groupCounts } as Record<string, number>,
    };
  }));
}

export async function loadRunnerEvaluatorInputs(
  root = process.cwd(),
): Promise<RunnerEvaluatorInputs> {
  const paths = {
    fixture: path.join(root, "docs", "balance", "runner-fixtures", "runner-laboratory-fixture-v1.json"),
    fixtureSchema: path.join(root, "docs", "balance", "runner-fixture-v1.schema.json"),
    contentLock: path.join(root, "docs", "balance", "locks", "runner-laboratory-content-lock-v1.json"),
    registry: path.join(root, "docs", "balance", "fixture-registry-v1.json"),
  };
  const [fixture, fixtureSchema, contentLock, registry] = await Promise.all(
    Object.values(paths).map(async (filePath) =>
      JSON.parse(await readFile(filePath, "utf8"))),
  );
  validateRunnerFixture(fixture, fixtureSchema, contentLock, registry);
  if (
    fixture.evaluatorId !== RUNNER_LABORATORY_EVALUATOR_ID ||
    fixture.recomputationRequired !== true
  ) {
    fail("fixture does not require this production recomputation evaluator");
  }
  const assertionSpecs = parseAssertionSpecs(fixture);
  const evaluatedSourceDigest = await evaluationSourceSha256(root);
  if (!SHA256_PATTERN.test(evaluatedSourceDigest)) fail("evaluation source digest is malformed");
  return deepFreeze({
    fixture,
    fixtureSchema,
    contentLock,
    registry,
    assertionSpecs,
    evaluatedSourceSha256: evaluatedSourceDigest,
  });
}

function replayBoundaries(tape: RunnerNeutralReplayTape) {
  return [
    tape.startBoundary,
    ...tape.patternBoundaries,
    tape.pendingBoundary,
    tape.completedBoundary,
  ];
}

function validatesReplayCodec(
  tape: RunnerNeutralReplayTape,
  wireBijectionPairMutator?: RunStateWireBijectionPairMutator,
): boolean {
  if (!isAuthenticRunnerNeutralReplayTape(tape)) return false;
  const wireBijection = certifyRunStateWireBijectionV1(
    wireBijectionPairMutator,
  );
  const boundaries = replayBoundaries(tape);
  if (boundaries.length !== 13) return false;
  const durableCheckpointsPass = boundaries.every((boundary) =>
    /^[0-9a-f]{16}$/.test(boundary.stateHash) &&
    boundary.simulationTick === boundary.state.simulationTick &&
    Object.isFrozen(boundary) && Object.isFrozen(boundary.state));
  const counts = tape.replayClosure.kindCounts;
  const laneMoves = tape.targets.reduce(
    (total, target) => total + Math.abs(target.targetLane - target.sourceLane),
    0,
  );
  const twoLaneMoves = tape.targets.filter((target) =>
    Math.abs(target.targetLane - target.sourceLane) === 2).length;
  const appliedHazards = tape.contacts.filter(({ contact }) =>
    contact.outcome === "hazard-applied").length;
  const expectedMovingFull = tape.controlMode === "manual"
    ? twoLaneMoves * 9
    : twoLaneMoves * 10;
  const expectedMovingNull = laneMoves * 10 - expectedMovingFull;
  const expectedModeKinds = {
    manual: ["manual-marker-before", "manual-marker-after"],
    "semantic-assist": ["semantic-marker-before", "semantic-marker-after"],
    "automatic-assist": ["automatic-marker-before", "automatic-marker-after"],
  } as const;
  const activeKinds = expectedModeKinds[tape.controlMode];
  const inactiveKinds = [
    "manual-marker-before", "manual-marker-after",
    "semantic-marker-before", "semantic-marker-after",
    "automatic-marker-before", "automatic-marker-after",
  ].filter((kind) => !activeKinds.includes(kind as never)) as (keyof typeof counts)[];
  return durableCheckpointsPass &&
    tape.replayClosure.failureCount === 0 &&
    tape.replayClosure.checkedBoundaryCount === Object.values(counts)
      .reduce((total, count) => total + count, 0) &&
    tape.replayClosure.codecReadyCount === tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.directCodecDecodeCount > 0 &&
    tape.replayClosure.directCodecDiscriminantCount > 0 &&
    tape.replayClosure.directCodecDecodeCount >=
      tape.replayClosure.directCodecDiscriminantCount &&
    tape.replayClosure.mandatoryDirectReloadCoverageCount > 0 &&
    tape.replayClosure.inductivelyCertifiedCodecReadyCount > 0 &&
    tape.replayClosure.directCodecDecodeCount +
        tape.replayClosure.inductivelyCertifiedCodecReadyCount ===
      tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.directSaveInvariantCount > 0 &&
    tape.replayClosure.inductivelyCertifiedSaveInvariantCount > 0 &&
    tape.replayClosure.directSaveInvariantCount +
        tape.replayClosure.inductivelyCertifiedSaveInvariantCount ===
      tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.wireBijectionCertificateId ===
      RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID &&
    tape.replayClosure.wireBijectionCertificateId ===
      wireBijection.certificateId &&
    tape.replayClosure.wireBijectionKeyCount === wireBijection.keyCount &&
    tape.replayClosure.wireBijectionPairDigest === wireBijection.pairDigest &&
    tape.replayClosure.wireBijectionRecursiveInverseDigest ===
      wireBijection.recursiveInverseDigest &&
    tape.replayClosure.wireIdentityTransferCount ===
      tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.canonicalEqualityCount === tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.stateHashEqualityCount === tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.saveInvariantCount === tape.replayClosure.checkedBoundaryCount &&
    tape.replayClosure.continuationCertificateCount ===
      tape.replayClosure.checkedBoundaryCount &&
    /^[0-9a-f]{16}$/.test(tape.replayClosure.stateHashDigest) &&
    /^[0-9a-f]{16}$/.test(tape.replayClosure.continuationCertificateDigest) &&
    counts["start-before"] === 1 && counts["start-after"] === 1 &&
    counts["idle-null-buffer"] >= 1 &&
    counts["moving-null-buffer"] === expectedMovingNull &&
    counts["moving-full-buffer"] === expectedMovingFull &&
    counts["movement-completion-before"] === laneMoves &&
    counts["movement-completion-after"] === laneMoves &&
    counts["buffer-handoff-before"] === twoLaneMoves &&
    counts["buffer-handoff-after"] === twoLaneMoves &&
    counts[activeKinds[0]] === 10 && counts[activeKinds[1]] === 10 &&
    inactiveKinds.every((kind) => counts[kind] === 0) &&
    counts["user-pause"] === 1 && counts["user-resume"] === 1 &&
    counts["contact-before"] === tape.contacts.length &&
    counts["contact-after"] === tape.contacts.length &&
    counts["safe-pass-before"] === tape.passes.length &&
    counts["safe-pass-after"] === tape.passes.length &&
    counts["invulnerability-start"] === appliedHazards &&
    counts["invulnerability-last-protected"] === appliedHazards &&
    counts["invulnerability-end"] === appliedHazards &&
    counts["settlement-pending"] === 1 &&
    counts["settlement-completed"] === 1;
}

/** @internal Mutation-test seam for the evaluator's replay-certificate gate. */
export function validatesReplayCodecCertificateForTest(
  tape: RunnerNeutralReplayTape,
  wireBijectionPairMutator?: RunStateWireBijectionPairMutator,
): boolean {
  try {
    return validatesReplayCodec(tape, wireBijectionPairMutator);
  } catch {
    return false;
  }
}

function expectedPatternCounts(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const copy of RUNNER_LABORATORY_GENERATOR_CONTRACT.copyOrdinalMapping) {
    counts.set(copy.patternId, (counts.get(copy.patternId) ?? 0) + 1);
  }
  return counts;
}

function validatesPatternComposition(course: RunnerLabGeneratedCourse): boolean {
  const counts = new Map<string, number>();
  const entityIds = new Set<string>();
  let valid = course.patterns.length === 10;
  for (const [index, pattern] of course.patterns.entries()) {
    counts.set(pattern.patternId, (counts.get(pattern.patternId) ?? 0) + 1);
    valid &&= pattern.patternIndex === index + 1;
    valid &&= pattern.rotation === 0 || pattern.rotation === 1 || pattern.rotation === 2;
    valid &&= new Set(pattern.includedOptionalGroupIds).size === pattern.includedOptionalGroupIds.length;
    for (const entity of pattern.spawnEntities) {
      valid &&= !entityIds.has(entity.instanceId);
      entityIds.add(entity.instanceId);
    }
  }
  valid &&= canonical([...counts.entries()].sort()) ===
    canonical([...expectedPatternCounts().entries()].sort());
  valid &&= new Set(course.canonicalEntityIds).size === course.canonicalEntityIds.length;
  return valid;
}

interface CachedReachabilityProof {
  readonly incomingStateCount: number;
  readonly firstStepInputCaseCount: number;
  readonly minimumViableStateCount: number;
  readonly checkedThroughTick: number;
}

const NORMALIZED_REACHABILITY_PROOFS = new Map<string, CachedReachabilityProof>();

function normalizedReachabilityWindow(
  course: RunnerLabGeneratedCourse,
  requestedPatternIndex: number,
): readonly AbstractReachabilityPattern[] {
  const proofStartIndex = Math.min(requestedPatternIndex, 8);
  const patterns = course.patterns.slice(proofStartIndex - 1, proofStartIndex + 2);
  if (patterns.length !== 3) fail("rolling reachability window is not three patterns");
  const originTick = patterns[0]!.spawnTick;
  const safeOffsetTicks = Math.floor(
    RUNNER_LABORATORY_COLLISION_CONTRACT.safeClosedOverlapTravelMilli /
      course.worldSpeedMilliPerTick,
  ) + 1;
  return deepFreeze(patterns.map((pattern) => ({
    patternKey: `${pattern.patternId}/${pattern.rotation}`,
    anchorTick: pattern.anchorTick - originTick,
    safeBoundaryTick: runnerPatternSafeBoundaryTick(
      pattern,
      course.worldSpeedMilliPerTick,
    ) - originTick,
    // Benefits never constrain viability. Omitting them preserves the exact
    // transition graph while making the cache key independent of optional
    // presentation/reward groups.
    laneRequirements: pattern.entities
      .filter((entity) => entity.kind === "hazard")
      .map((entity) => ({
        kind: "required-hazard" as const,
        lane: entity.lane,
        contactTick: entity.contactTick - originTick,
        safeTick: entity.contactTick + safeOffsetTicks - originTick,
      })),
  })));
}

function validatesReachability(course: RunnerLabGeneratedCourse): boolean {
  for (let requestedPatternIndex = 1;
       requestedPatternIndex <= course.patterns.length;
       requestedPatternIndex += 1) {
    const patterns = normalizedReachabilityWindow(course, requestedPatternIndex);
    const key = canonical({
      difficulty: course.difficulty,
      worldSpeedMilliPerTick: course.worldSpeedMilliPerTick,
      patterns,
    });
    let proof = NORMALIZED_REACHABILITY_PROOFS.get(key);
    if (proof === undefined) {
      const productionProof = assertRunnerReachability(patterns, { startTick: 0 });
      proof = deepFreeze({
        incomingStateCount: productionProof.incomingStateCount,
        firstStepInputCaseCount: productionProof.firstStepInputCaseCount,
        minimumViableStateCount: productionProof.minimumViableStateCount,
        checkedThroughTick: productionProof.checkedThroughTick,
      });
      NORMALIZED_REACHABILITY_PROOFS.set(key, proof);
    }
    if (
      proof.incomingStateCount !== 107 ||
      proof.firstStepInputCaseCount !== 321 ||
      proof.minimumViableStateCount <= 0 ||
      proof.checkedThroughTick < 0
    ) return false;
  }
  return true;
}

function scoringEntityAtContact(
  course: RunnerLabGeneratedCourse,
  entityInstanceId: string,
  simulationTick: number,
): RunnerEntity | null {
  for (const pattern of course.patterns) {
    const generated = pattern.entities.find((candidate) =>
      candidate.instanceId === entityInstanceId);
    if (generated === undefined) continue;
    return Object.freeze({
      instanceId: generated.instanceId,
      contentId: generated.contentId,
      kind: generated.kind,
      patternIndex: generated.patternIndex,
      slotIndex: generated.slotIndex,
      lane: generated.lane,
      xMilli: generated.xMilli - course.worldSpeedMilliPerTick *
        (simulationTick - pattern.spawnTick),
      widthMilli: generated.widthMilli,
      contactState: "pending" as const,
    });
  }
  return null;
}

function sortedUniqueIds(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Proves that every production contact owns exactly one resolution slot, that
 * contact and pass paths form an exact terminal partition, and that replaying
 * each contact against its persisted post-contact state is a strict no-op.
 * Exported solely so focused mutant tests can exercise the evidence predicate.
 */
export function validatesRunnerContactIdempotency(
  tape: RunnerNeutralReplayTape,
  course: RunnerLabGeneratedCourse,
): boolean {
  const contactedIds = tape.contacts.map(({ contact }) => contact.entityInstanceId);
  const passedIds = tape.passes.map(({ entityInstanceId }) => entityInstanceId);
  const effectIds = tape.effects.map(({ effect }) => effect.effectId);
  const contactSet = new Set(contactedIds);
  const passSet = new Set(passedIds);
  const productionOrdinals = [
    ...tape.contacts.map(({ productionEventOrdinal }) => productionEventOrdinal),
    ...tape.passes.map(({ productionEventOrdinal }) => productionEventOrdinal),
  ];
  const contactOwnedEffects = tape.contacts.flatMap(({
    productionEventOrdinal,
    contact,
  }) => contact.effect === null
    ? []
    : [Object.freeze({ productionEventOrdinal, effect: contact.effect })]);
  if (
    tape.runSeed !== course.runSeed ||
    tape.difficulty !== course.difficulty ||
    new Set(contactedIds).size !== contactedIds.length ||
    new Set(passedIds).size !== passedIds.length ||
    new Set(effectIds).size !== effectIds.length ||
    new Set(productionOrdinals).size !== productionOrdinals.length ||
    canonical(tape.effects) !== canonical(contactOwnedEffects) ||
    contactedIds.some((entityId) => passSet.has(entityId)) ||
    passedIds.some((entityId) => contactSet.has(entityId)) ||
    tape.effects.some(({ effect }) => !contactedIds.some((entityId) =>
      effect.effectId === effectIdForRunnerEntity(entityId)))
  ) return false;

  const terminalPartition = sortedUniqueIds([
    course.startMarker.instanceId,
    course.finishMarker.instanceId,
    ...contactedIds,
    ...passedIds,
  ]);
  const canonicalCourseIds = sortedUniqueIds(course.canonicalEntityIds);
  if (
    terminalPartition.length !==
      2 + contactedIds.length + passedIds.length ||
    !exactArray(terminalPartition, canonicalCourseIds) ||
    !exactArray(tape.terminalResolvedEntityIds, canonicalCourseIds) ||
    tape.terminalResolvedEntityIds.length !== canonicalCourseIds.length
  ) return false;

  type ProductionResolution =
    | Readonly<{ kind: "contact"; productionEventOrdinal: number; index: number }>
    | Readonly<{ kind: "pass"; productionEventOrdinal: number; index: number }>;
  const stream: ProductionResolution[] = [
    ...tape.contacts.map(({ productionEventOrdinal }, index) => ({
      kind: "contact" as const,
      productionEventOrdinal,
      index,
    })),
    ...tape.passes.map(({ productionEventOrdinal }, index) => ({
      kind: "pass" as const,
      productionEventOrdinal,
      index,
    })),
  ].sort((left, right) => left.productionEventOrdinal - right.productionEventOrdinal);

  let scores: CoreScores = Object.freeze({
    ...STARTING_PROFILE_SCORES[tape.startingProfileId],
  });
  let ledger: EffectLedger = Object.freeze({
    recent: Object.freeze([]),
    totalsBySource: zeroSourceTotals(),
  });
  let invulnerableUntilTick = 0;
  let resolvedEntityIds: readonly string[] = Object.freeze([
    course.startMarker.instanceId,
  ]);
  let streamIndex = 0;
  let priorProductionTick = -1;
  while (streamIndex < stream.length) {
    const firstItem = stream[streamIndex]!;
    const productionTick = firstItem.kind === "contact"
      ? tape.contacts[firstItem.index]?.contact.simulationTick
      : tape.passes[firstItem.index]?.simulationTick;
    if (
      productionTick === undefined ||
      productionTick < priorProductionTick
    ) return false;
    const tickItems: ProductionResolution[] = [];
    let groupEnd = streamIndex;
    while (groupEnd < stream.length) {
      const candidateItem = stream[groupEnd]!;
      const candidateTick = candidateItem.kind === "contact"
        ? tape.contacts[candidateItem.index]?.contact.simulationTick
        : tape.passes[candidateItem.index]?.simulationTick;
      if (candidateTick !== productionTick) break;
      tickItems.push(candidateItem);
      groupEnd += 1;
    }
    let observedPass = false;
    for (const tickItem of tickItems) {
      if (tickItem.kind === "pass") {
        observedPass = true;
      } else if (observedPass) {
        return false;
      }
    }
    const groupedContacts = tickItems
      .filter((item): item is Extract<ProductionResolution, { kind: "contact" }> =>
        item.kind === "contact")
      .map(({ index }) => tape.contacts[index]!);
    const groupedPasses = tickItems
      .filter((item): item is Extract<ProductionResolution, { kind: "pass" }> =>
        item.kind === "pass")
      .map(({ index }) => tape.passes[index]!);
    if (!exactArray(
      groupedPasses.map(({ entityInstanceId }) => entityInstanceId),
      [...groupedPasses]
        .map(({ entityInstanceId }) => entityInstanceId)
        .sort((left, right) => left.localeCompare(right)),
    )) return false;
    const candidates: ContactCandidate[] = [];
    for (const { contact } of groupedContacts) {
      const entity = scoringEntityAtContact(
        course,
        contact.entityInstanceId,
        contact.simulationTick,
      );
      if (entity === null) return false;
      candidates.push(Object.freeze({ entity }));
    }
    const resolution = candidates.length === 0
      ? null
      : resolveCanonicalContactCandidates({
        course,
        runSeed: tape.runSeed,
        difficulty: tape.difficulty,
        candidates,
        controlMode: tape.controlMode,
        simulationTick: productionTick,
        scores,
        ledger,
        invulnerableUntilTick,
        resolvedEntityIds,
      });
    const expectedEffects = groupedContacts.flatMap(({ productionEventOrdinal }) =>
      tape.effects
        .filter((effect) => effect.productionEventOrdinal === productionEventOrdinal)
        .map(({ effect }) => effect.effectId));
    if (
      resolution !== null && (
        !exactArray(resolution.events, groupedContacts.map(({ contact }) => contact)) ||
        !exactArray(resolution.effectIds, expectedEffects)
      ) ||
      resolution === null && expectedEffects.length !== 0
    ) return false;

    const postContactScores = resolution?.scores ?? scores;
    const postContactLedger = resolution?.ledger ?? ledger;
    const postContactInvulnerability = resolution?.invulnerableUntilTick ??
      invulnerableUntilTick;
    const contactResolvedIds = resolution?.resolvedEntityIds ?? resolvedEntityIds;
    if (groupedPasses.some(({ entityInstanceId }) =>
      contactResolvedIds.includes(entityInstanceId) ||
      !canonicalCourseIds.includes(entityInstanceId))) return false;
    const persistedPostTickResolvedIds = Object.freeze(sortedUniqueIds([
      ...contactResolvedIds,
      ...groupedPasses.map(({ entityInstanceId }) => entityInstanceId),
    ]));

    for (const candidate of candidates) {
      const repeated = resolveCanonicalContactCandidates({
        course,
        runSeed: tape.runSeed,
        difficulty: tape.difficulty,
        candidates: [candidate],
        controlMode: tape.controlMode,
        simulationTick: productionTick,
        scores: postContactScores,
        ledger: postContactLedger,
        invulnerableUntilTick: postContactInvulnerability,
        resolvedEntityIds: persistedPostTickResolvedIds,
      });
      const repeatedEvent = repeated.events[0];
      if (
        repeated.events.length !== 1 ||
        repeatedEvent?.entityInstanceId !== candidate.entity.instanceId ||
        repeatedEvent.outcome !== "already-resolved" ||
        repeatedEvent.effect !== null ||
        repeated.newlyResolvedEntityIds.length !== 0 ||
        repeated.effectIds.length !== 0 ||
        canonical(repeated.scores) !== canonical(postContactScores) ||
        canonical(repeated.ledger) !== canonical(postContactLedger) ||
        repeated.invulnerableUntilTick !== postContactInvulnerability ||
        !exactArray(repeated.resolvedEntityIds, persistedPostTickResolvedIds)
      ) return false;
    }
    scores = postContactScores;
    ledger = postContactLedger;
    invulnerableUntilTick = postContactInvulnerability;
    resolvedEntityIds = persistedPostTickResolvedIds;
    priorProductionTick = productionTick;
    streamIndex = groupEnd;
  }

  return canonical(scores) === canonical(tape.terminalScores) &&
    exactArray(
      sortedUniqueIds([...resolvedEntityIds, course.finishMarker.instanceId]),
      canonicalCourseIds,
    );
}

function validatesInvulnerability(
  tape: RunnerNeutralReplayTape,
  course: RunnerLabGeneratedCourse,
): boolean {
  const kindById = new Map(course.patterns.flatMap((pattern) => pattern.entities)
    .map((entity) => [entity.instanceId, entity.kind]));
  return tape.invulnerabilityWitnesses.every((witness) => {
    if (kindById.get(witness.entityInstanceId) !== "hazard") return false;
    if (witness.outcome === "hazard-applied") {
      return witness.afterUntilTick === witness.simulationTick + RUNNER_INVULNERABILITY_TICKS &&
        witness.afterUntilTick > witness.beforeUntilTick;
    }
    return witness.simulationTick < witness.beforeUntilTick &&
      witness.afterUntilTick === witness.beforeUntilTick;
  });
}

function authenticInvulnerabilityPrimitiveWitness(
  course: RunnerLabGeneratedCourse,
  laneWitness: Lane,
): boolean {
  const hazards = course.patterns.flatMap((pattern) => pattern.entities)
    .filter((entity) => entity.kind === "hazard");
  const benefits = course.patterns.flatMap((pattern) => pattern.entities)
    .filter((entity) => entity.kind === "benefit");
  if (hazards.length < 3 || benefits.length < 1) return false;
  const rotatedHazards = [...hazards.slice(laneWitness), ...hazards.slice(0, laneWitness)];
  const [firstHazard, protectedHazard, expiredHazard] = rotatedHazards;
  const benefit = benefits[laneWitness % benefits.length];
  if (!firstHazard || !protectedHazard || !expiredHazard || !benefit) return false;
  const tick = 500;
  const resolve = (
    entity: typeof firstHazard,
    simulationTick: number,
    previous: ReturnType<typeof resolveCanonicalContactCandidates> | null,
  ) => resolveCanonicalContactCandidates({
    course,
    runSeed: course.runSeed,
    difficulty: course.difficulty,
    candidates: [{ entity }],
    controlMode: "manual",
    simulationTick,
    scores: previous?.scores ?? { health: 50, happiness: 50, money: 50 },
    ledger: previous?.ledger ?? { recent: [], totalsBySource: zeroSourceTotals() },
    invulnerableUntilTick: previous?.invulnerableUntilTick ?? 0,
    resolvedEntityIds: previous?.resolvedEntityIds ?? [],
  });
  const applied = resolve(firstHazard, tick, null);
  const duringBenefit = resolve(benefit, tick + 1, applied);
  const protectedResult = resolve(protectedHazard, tick + RUNNER_INVULNERABILITY_TICKS - 1, duringBenefit);
  const expiredResult = resolve(expiredHazard, tick + RUNNER_INVULNERABILITY_TICKS, protectedResult);
  const effectOwners = new Set([firstHazard.instanceId, benefit.instanceId, expiredHazard.instanceId]
    .map((entityId) => `effect-${entityId.slice("entity-".length)}`));
  return applied.events[0]?.outcome === "hazard-applied" &&
    duringBenefit.events[0]?.outcome === "benefit-applied" &&
    duringBenefit.invulnerableUntilTick === tick + RUNNER_INVULNERABILITY_TICKS &&
    protectedResult.events[0]?.outcome === "hazard-suppressed" &&
    protectedResult.effectIds.length === 0 &&
    protectedResult.invulnerableUntilTick === tick + RUNNER_INVULNERABILITY_TICKS &&
    expiredResult.events[0]?.outcome === "hazard-applied" &&
    expiredResult.invulnerableUntilTick === tick + RUNNER_INVULNERABILITY_TICKS * 2 &&
    expiredResult.ledger.recent.every((effect) => effectOwners.has(effect.effectId));
}

function scoreDistance(left: CoreScores, right: CoreScores): number {
  return Math.max(...SCORE_IDS.map((scoreId) => Math.abs(left[scoreId] - right[scoreId])));
}

type TimedLaneCommand = RunnerAuthenticatedManualCommand;

function targetIntentTrace(tape: RunnerNeutralReplayTape): readonly TimedLaneCommand[] {
  const trace: TimedLaneCommand[] = [];
  for (const target of tape.targets) {
    if (target.firstIntent !== null) trace.push({
      patternIndex: target.patternIndex,
      simulationTick: target.simulationTick + 1,
      ordinal: 0,
      intent: target.firstIntent,
    });
    if (target.bufferedIntent !== null) trace.push({
      patternIndex: target.patternIndex,
      simulationTick: target.simulationTick + 2,
      ordinal: 1,
      intent: target.bufferedIntent,
    });
  }
  return trace;
}

function productionInputTrace(
  modality: "keyboard" | "button" | "swipe",
  expected: readonly TimedLaneCommand[],
): readonly TimedLaneCommand[] {
  const accepted: TimedLaneCommand[] = [];
  const gate: RunnerInputGate = {
    started: true,
    controlMode: "manual",
    pauseReasons: [],
    dialogOpen: false,
    runStatus: "active",
    stagePhase: "active",
  };
  if (modality === "keyboard") {
    const bindings = createRunnerKeyboardBindings();
    for (const command of expected) {
      let prevented = false;
      const handled = handleRunnerKeydown({
        code: command.intent === "up" ? "ArrowUp" : "ArrowDown",
        key: command.intent === "up" ? "ArrowUp" : "ArrowDown",
        repeat: false,
        preventDefault: () => { prevented = true; },
      }, bindings, gate, (acceptedIntent) => {
        accepted.push({ ...command, intent: acceptedIntent });
        return true;
      });
      if (!handled || !prevented) return [];
    }
  } else if (modality === "button") {
    for (const command of expected) {
      const acceptedClick = requestRunnerButtonIntent(
        command.intent === "up" ? "lane-up" : "lane-down",
        gate,
        (acceptedIntent) => {
          accepted.push({ ...command, intent: acceptedIntent });
          return true;
        },
      );
      if (!acceptedClick) return [];
    }
  } else {
    for (const command of expected) {
      const recognizer = createRunnerSwipeRecognizer(
        () => gate,
        (acceptedIntent) => {
          accepted.push({ ...command, intent: acceptedIntent });
          return true;
        },
      );
      const event = (clientY: number) => ({
        pointerId: 1,
        clientX: 0,
        clientY,
        isPrimary: true,
        button: 0,
        preventDefault() {},
      });
      recognizer.pointerDown(event(0));
      const result = recognizer.pointerMove(event(command.intent === "up" ? -25 : 25));
      recognizer.pointerUp({ pointerId: 1 });
      if (!result.consumed || result.acceptedIntent !== command.intent) return [];
    }
  }
  return accepted;
}

export function validatesModalityIdentity(
  tape: RunnerNeutralReplayTape,
  entryState: RunStateV1,
  expectedProjection: RunnerAuthenticatedModeProjection,
  mutateCommands?: (
    modality: "keyboard" | "button" | "swipe",
    commands: readonly TimedLaneCommand[],
  ) => readonly TimedLaneCommand[],
): boolean {
  const expected = targetIntentTrace(tape);
  if (
    entryState.controlMode !== "manual" ||
    !isAuthenticRunnerModeProjection(expectedProjection) ||
    entryState.runSeed !== expectedProjection.runSeed ||
    entryState.difficulty !== expectedProjection.difficulty ||
    entryState.startingProfileId !== expectedProjection.startingProfileId
  ) return false;
  try {
    return (["keyboard", "button", "swipe"] as const).every((modality) => {
      const emitted = productionInputTrace(modality, expected);
      const commands = mutateCommands?.(modality, emitted) ?? emitted;
      if (!exactArray(emitted, expected)) return false;
      const projection = evaluateRunnerAuthenticatedManualCommandProjection(
        expectedProjection,
        commands,
      );
      return isAuthenticRunnerModeProjection(projection) &&
        projection !== expectedProjection &&
        projection.contacts !== expectedProjection.contacts &&
        projection.effects !== expectedProjection.effects &&
        projection.passes !== expectedProjection.passes &&
        projection.pendingState !== expectedProjection.pendingState &&
        projection.completedState !== expectedProjection.completedState &&
        sameAuthenticatedGameplay(projection, expectedProjection, true) &&
        canonical(projection.pendingState) ===
          canonical(expectedProjection.pendingState) &&
        canonical(projection.completedState) ===
          canonical(expectedProjection.completedState);
    });
  } catch {
    return false;
  }
}

function validatesCompletionNarrative(state: RunStateV1): boolean {
  return state.runStatus === "completed" && state.stage.phase === "complete" &&
    state.storyState.facts.length === 1 &&
    state.storyState.facts[0]?.factId === RUNNER_LABORATORY_COMPLETION_FACT.factId &&
    state.storyState.memories.length === 1 &&
    state.storyState.memories[0]?.memoryId === RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId;
}

function profileHasGlobalNoSaturationMargin(
  course: RunnerLabGeneratedCourse,
  profile: StartingProfileId,
): boolean {
  const positive: Record<keyof CoreScores, number> = {
    health: 0,
    happiness: 0,
    money: 0,
  };
  const negative: Record<keyof CoreScores, number> = {
    health: 0,
    happiness: 0,
    money: 0,
  };
  for (const entity of course.patterns.flatMap((pattern) => pattern.entities)) {
    const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
      entity.contentId,
    );
    if (definition === undefined) continue;
    if (definition.requestedDelta > 0) {
      positive[definition.scoreId] += definition.requestedDelta;
    } else {
      negative[definition.scoreId] += definition.requestedDelta;
    }
  }
  const starting = STARTING_PROFILE_SCORES[profile];
  return SCORE_IDS.every((scoreId) =>
    starting[scoreId] + negative[scoreId] >= 0 &&
    starting[scoreId] + positive[scoreId] <= 100);
}

const REPLAY_CODEC_RESULTS = new WeakMap<object, boolean>();

function cachedReplayCodecValidation(tape: RunnerNeutralReplayTape): boolean {
  const prior = REPLAY_CODEC_RESULTS.get(tape);
  if (prior !== undefined) return prior;
  const result = validatesReplayCodec(tape);
  REPLAY_CODEC_RESULTS.set(tape, result);
  return result;
}

function profileEntryCodecIdentity(
  seed: number,
  difficulty: Difficulty,
  profile: StartingProfileId,
): boolean {
  const state = createRunnerLaboratoryEntryState(
    seedHex(seed),
    defaultSetup(profile, difficulty),
  );
  const encoded = encodeRunState(state);
  const decoded = decodeRunState(encoded, RUNNER_LABORATORY_CATALOG);
  return decoded.kind === "ready" && decoded.migratedFrom === null &&
    encodeRunState(decoded.state) === encoded &&
    stateHashV1(decoded.state) === stateHashV1(state) &&
    canonical(decoded.state) === canonical(state);
}

type AuthenticatedEvaluationProjection =
  | RunnerAuthenticatedModeProjection
  | RunnerAutomaticAuthenticatedProjection;

interface AuthenticatedModeBundle {
  readonly manual: RunnerAuthenticatedModeProjection;
  readonly semantic: RunnerAuthenticatedModeProjection;
  readonly automatic: RunnerAutomaticAuthenticatedProjection;
}

function projectionStateIdentity(
  projection: AuthenticatedEvaluationProjection,
): boolean {
  return Object.isFrozen(projection.pendingState) &&
    Object.isFrozen(projection.completedState) &&
    /^[0-9a-f]{16}$/.test(projection.pendingStateHash) &&
    /^[0-9a-f]{16}$/.test(projection.completedStateHash) &&
    projection.pendingState.runStatus === "active" &&
    projection.pendingState.stage.phase === "settling" &&
    projection.completedState.runStatus === "completed" &&
    projection.completedState.stage.phase === "complete";
}

function contactGeometry(
  projection: AuthenticatedEvaluationProjection,
): unknown {
  return projection.contacts.map(({ contact }) => ({
    entityInstanceId: contact.entityInstanceId,
    contentId: contact.contentId,
    simulationTick: contact.simulationTick,
  }));
}

function sameAuthenticatedGameplay(
  left: RunnerAuthenticatedModeProjection,
  right: RunnerAuthenticatedModeProjection,
  includeCanonicalStateHashes: boolean,
): boolean {
  return left.markerTransitions.length === right.markerTransitions.length &&
    left.markerTransitions.every((transition, index) => {
      const other = right.markerTransitions[index];
      return other !== undefined &&
        transition.patternIndex === other.patternIndex &&
        transition.markerInstanceId === other.markerInstanceId &&
        transition.simulationTick === other.simulationTick &&
        transition.sourceLane === other.sourceLane &&
        transition.targetLane === other.targetLane &&
        transition.firstIntent === other.firstIntent &&
        transition.bufferedIntent === other.bufferedIntent &&
        transition.inputBuffer === other.inputBuffer &&
        canonical(transition.motion) === canonical(other.motion) &&
        exactArray(transition.eventTypes, other.eventTypes) &&
        transition.decisionMarkerEventCount ===
          other.decisionMarkerEventCount &&
        transition.reloadRoundTripVerified ===
          other.reloadRoundTripVerified &&
        transition.acceptedRawInputCount === other.acceptedRawInputCount &&
        (!includeCanonicalStateHashes ||
          (transition.beforeStateHash === other.beforeStateHash &&
            transition.afterFirstStateHash === other.afterFirstStateHash &&
            transition.afterCommitStateHash === other.afterCommitStateHash));
    }) &&
    canonical(left.contacts) === canonical(right.contacts) &&
    canonical(left.effects) === canonical(right.effects) &&
    canonical(left.passes) === canonical(right.passes) &&
    canonical(left.terminalScores) === canonical(right.terminalScores) &&
    canonical(left.terminalMotion) === canonical(right.terminalMotion) &&
    left.terminalInputBuffer === right.terminalInputBuffer &&
    exactArray(left.terminalResolvedEntityIds, right.terminalResolvedEntityIds) &&
    exactArray(left.completionFactIds, right.completionFactIds) &&
    exactArray(left.completionMemoryIds, right.completionMemoryIds) &&
    exactArray(left.settlementEffectIds, right.settlementEffectIds) &&
    left.startEventCount === right.startEventCount &&
    left.rawLaneInputCount === right.rawLaneInputCount &&
    left.semanticChoiceCount === right.semanticChoiceCount &&
    left.automaticDecisionCount === right.automaticDecisionCount &&
    left.settlementBeginCount === right.settlementBeginCount &&
    left.settlementApplyCount === right.settlementApplyCount &&
    (!includeCanonicalStateHashes ||
      (left.pendingStateHash === right.pendingStateHash &&
        left.completedStateHash === right.completedStateHash));
}

function exactCompletionIds(
  projection: AuthenticatedEvaluationProjection,
): boolean {
  return exactArray(
    projection.completionFactIds,
    [RUNNER_LABORATORY_COMPLETION_FACT.factId],
  ) && exactArray(
    projection.completionMemoryIds,
    [RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId],
  ) && validatesCompletionNarrative(projection.completedState);
}

function evaluateAuthenticatedModeBundle(
  seed: number,
  difficulty: Difficulty,
  profile: StartingProfileId,
  structuralTape: RunnerNeutralReplayTape,
): AuthenticatedModeBundle {
  const setup = defaultSetup(profile, difficulty);
  const manual = evaluateRunnerAuthenticatedModeProjection(
    createRunnerLaboratoryEntryState(seedHex(seed), setup),
    structuralTape,
  );
  const semantic = evaluateRunnerAuthenticatedModeProjection(
    createRunnerLaboratoryEntryState(seedHex(seed), {
      ...setup,
      controlMode: "semantic-assist",
    }),
    structuralTape,
  );
  const automaticEntry = createRunnerLaboratoryEntryState(seedHex(seed), {
    ...setup,
    controlMode: "automatic-assist",
  });
  const automaticSupport = createRunnerModeEvaluationSupport(
    automaticEntry,
    structuralTape,
  );
  const automatic = evaluateAutomaticAuthenticatedModeProjection(
    automaticEntry,
    structuralTape,
    manual,
    automaticSupport,
  );
  return deepFreeze({ manual, semantic, automatic });
}

function validateAuthenticatedBaseEntry(
  counters: Map<RunnerAssertionId, MutableCounter>,
  seed: number,
  difficulty: Difficulty,
  profile: StartingProfileId,
  structuralTape: RunnerNeutralReplayTape,
  course: RunnerLabGeneratedCourse,
): AuthenticatedModeBundle {
  const witness = `${seedHex(seed)}/${profile}/${difficulty}`;
  const bundle = evaluateAuthenticatedModeBundle(
    seed,
    difficulty,
    profile,
    structuralTape,
  );
  const { manual, semantic, automatic } = bundle;
  const structuralModeDerivation =
    isAuthenticRunnerNeutralReplayTape(structuralTape) &&
    isAuthenticRunnerModeProjection(manual) &&
    isAuthenticRunnerModeProjection(semantic) &&
    isAuthenticAutomaticModeProjection(automatic) &&
    structuralTape.controlMode === "manual" &&
    structuralTape.targets.length === course.patterns.length &&
    structuralTape.decisionProvenance.length === course.patterns.length &&
    structuralTape.decisionProvenance.every((item) =>
      item.controlMode === "manual" && item.markerResolution === "safe-pass") &&
    profileHasGlobalNoSaturationMargin(course, profile);
  const manualExpectedRawCount = structuralTape.targets.reduce((count, target) =>
    count + (target.firstIntent === null ? 0 : 1) +
      (target.bufferedIntent === null ? 0 : 1), 0);
  const modeExecution =
    [manual, semantic, automatic].every((projection) =>
      projection.startEventCount === 1 &&
      projection.markerTransitions.length === 10 &&
      projection.settlementBeginCount === 1 &&
      projection.settlementApplyCount === 1) &&
    manual.rawLaneInputCount === manualExpectedRawCount &&
    manual.semanticChoiceCount === 0 &&
    manual.automaticDecisionCount === 0 &&
    semantic.rawLaneInputCount === 0 &&
    semantic.semanticChoiceCount === 10 &&
    semantic.automaticDecisionCount === 0 &&
    automatic.rawLaneInputCount === 0 &&
    automatic.semanticChoiceCount === 0 &&
    automatic.automaticDecisionCount === 10 &&
    manual.markerTransitions.every((item) =>
      item.decisionMarkerEventCount === 0 &&
      !item.reloadRoundTripVerified) &&
    semantic.markerTransitions.every((item) =>
      item.decisionMarkerEventCount === 1) &&
    semantic.markerTransitions.filter((item) =>
      item.reloadRoundTripVerified).length === 1 &&
    automatic.markerTransitions.every((item) =>
      item.decisionMarkerEventCount === 1 &&
      !item.reloadRoundTripVerified) &&
    canonical(manual.terminalMotion) === canonical(semantic.terminalMotion) &&
    canonical(manual.terminalMotion) === canonical(automatic.terminalMotion) &&
    manual.terminalInputBuffer === semantic.terminalInputBuffer &&
    manual.terminalInputBuffer === automatic.terminalInputBuffer &&
    exactArray(
      manual.terminalResolvedEntityIds,
      semantic.terminalResolvedEntityIds,
    ) && exactArray(
      manual.terminalResolvedEntityIds,
      automatic.terminalResolvedEntityIds,
    );
  const contactAndEffectIdentity =
    manual.contacts.length > 0 && manual.effects.length > 0 &&
    canonical(manual.contacts.map(({ contact }) => contact)) ===
      canonical(semantic.contacts.map(({ contact }) => contact)) &&
    canonical(manual.effects.map(({ effect }) => effect)) ===
      canonical(semantic.effects.map(({ effect }) => effect)) &&
    canonical(contactGeometry(manual)) === canonical(contactGeometry(automatic)) &&
    automatic.contacts.every(({ contact }) =>
      contact.outcome === "automatic-pass" && contact.effect === null) &&
    automatic.effects.length === 0;
  const scoreIdentity =
    canonical(manual.terminalScores) === canonical(semantic.terminalScores) &&
    scoreDistance(manual.terminalScores, automatic.terminalScores) <= 3;
  const completionIdentity = [manual, semantic, automatic].every(
    exactCompletionIds,
  ) && canonical(manual.completionFactIds) ===
      canonical(semantic.completionFactIds) &&
    canonical(manual.completionFactIds) ===
      canonical(automatic.completionFactIds) &&
    canonical(manual.completionMemoryIds) ===
      canonical(semantic.completionMemoryIds) &&
    canonical(manual.completionMemoryIds) ===
      canonical(automatic.completionMemoryIds);
  recordAssertionCheck(counters, "runner-nondepletion-v1",
    structuralModeDerivation && SCORE_IDS.every((scoreId) =>
      [manual, semantic, automatic].every((projection) =>
        projection.terminalScores[scoreId] > 0)), witness,
    "one or more authenticated terminal scores depleted");
  recordAssertionCheck(counters, "runner-laboratory-replay-v1",
    structuralModeDerivation && modeExecution &&
      cachedReplayCodecValidation(structuralTape) &&
      [manual, semantic, automatic].every(projectionStateIdentity) &&
      profileEntryCodecIdentity(seed, difficulty, profile), witness,
    "authenticated mode replay or boundary failed save/hash round-trip");
  recordAssertionCheck(counters, "runner-automatic-settlement-idempotency-v1",
    structuralModeDerivation && modeExecution && completionIdentity &&
      automatic.settlementEffectIds.length > 0, witness,
    "production Automatic settlement contract is not exact/idempotent");
  recordAssertionCheck(counters, "runner-modality-identity-v1",
    structuralModeDerivation && validatesModalityIdentity(
      structuralTape,
      createRunnerLaboratoryEntryState(
        seedHex(seed),
        defaultSetup(profile, difficulty),
      ),
      manual,
    ), witness,
    "keyboard, button, and swipe production continuations differ");
  recordAssertionCheck(counters, "semantic-assist-effect-identity-v1",
    structuralModeDerivation && modeExecution && contactAndEffectIdentity,
    witness, "Semantic production contacts/effects differ from Manual");
  recordAssertionCheck(counters, "automatic-assist-score-parity-v1",
    structuralModeDerivation && modeExecution && scoreIdentity, witness,
    "Automatic production score projection exceeds the locked threshold");
  recordAssertionCheck(counters, "assist-narrative-parity-v1",
    structuralModeDerivation && completionIdentity, witness,
    "Assist completion fact differs from Manual");
  recordAssertionCheck(counters, "runner-completion-memory-parity-v1",
    structuralModeDerivation && completionIdentity, witness,
    "completion memory is absent, duplicated, or mode-dependent");
  recordAssertionCheck(counters, "runner-automatic-no-input-completion-v1",
    structuralModeDerivation && modeExecution && completionIdentity &&
      contactAndEffectIdentity && scoreIdentity,
    witness,
    "no-input Automatic production completion contract is incomplete");
  return bundle;
}

function validateCourseDomains(
  counters: Map<RunnerAssertionId, MutableCounter>,
  seed: number,
  difficulty: Difficulty,
  course: RunnerLabGeneratedCourse,
  representativeTape: RunnerNeutralReplayTape,
): void {
  const witness = `${seedHex(seed)}/${difficulty}`;
  const second = generateRunnerLaboratoryCourse(seedHex(seed), difficulty);
  const deterministic = isAuthenticRunnerLaboratoryCourse(course, seedHex(seed), difficulty) &&
    isAuthenticRunnerLaboratoryCourse(second, seedHex(seed), difficulty) &&
    canonical(course) === canonical(second);
  const composition = validatesPatternComposition(course);
  const reachability = validatesReachability(course);
  const idleLaneStates = enumerateIncomingLaneStates().filter((state) =>
    state.motion.kind === "idle" && state.inputBuffer === null);
  const contact = validatesRunnerContactIdempotency(representativeTape, course);
  const cap = representativeTape.maximumLiveEntities.count <=
    RUNNER_LABORATORY_GENERATOR_CONTRACT.maxLiveInteractiveEntities;
  for (const lane of [0, 1, 2] as const) {
    const laneWitness = `${witness}/incoming-lane-${lane}`;
    const laneCovered = idleLaneStates.some((state) =>
      state.motion.kind === "idle" && state.motion.currentLane === lane) &&
      reachability;
    const invulnerability = validatesInvulnerability(representativeTape, course) &&
      authenticInvulnerabilityPrimitiveWitness(course, lane);
    recordAssertionCheck(counters, "runner-generation-determinism-v1", deterministic,
      laneWitness, "course generation differed across identical production calls");
    recordAssertionCheck(counters, "runner-pattern-composition-v1", composition,
      laneWitness, "course pattern multiset or canonical identity is invalid");
    recordAssertionCheck(counters, "runner-laboratory-reachability-v1", laneCovered,
      laneWitness, "rolling production reachability certificate does not cover this idle lane");
    recordAssertionCheck(counters, "runner-contact-idempotency-v1", contact,
      laneWitness, "contact/effect/resolution identity is not at-most-once");
    recordAssertionCheck(counters, "runner-invulnerability-ownership-v1", invulnerability,
      laneWitness, "hazard invulnerability ownership is malformed");
    recordAssertionCheck(counters, "runner-entity-cap-v1", cap,
      laneWitness, "live interactive entity cap was exceeded");
  }
}

function validateReducedMotionDomains(
  counters: Map<RunnerAssertionId, MutableCounter>,
  seed: number,
  setup: InitialRunSetup,
  structuralTape: RunnerNeutralReplayTape,
  baseProjection: RunnerAuthenticatedModeProjection,
): void {
  const witness = `${seedHex(seed)}/${setup.startingProfileId}/${setup.difficulty}`;
  const baseEntry = createRunnerLaboratoryEntryState(seedHex(seed), setup);
  const reducedEntry = createRunnerLaboratoryEntryState(seedHex(seed), {
    ...setup,
    accessibility: { ...setup.accessibility, reducedMotion: true },
  });
  const savedProjection = evaluateRunnerAuthenticatedModeProjection(
    reducedEntry,
    structuralTape,
  );
  const savedPass = effectiveRunnerMotionReduced(true, false) &&
    isAuthenticRunnerModeProjection(savedProjection) &&
    savedProjection !== baseProjection &&
    reducedEntry.runId === baseEntry.runId &&
    stateHashV1(reducedEntry) === stateHashV1(baseEntry) &&
    sameAuthenticatedGameplay(savedProjection, baseProjection, true);
  recordAssertionCheck(counters, "runner-reduced-motion-domain-identity-v1",
    savedPass, `${witness}/saved`, "saved reduced-motion preference changed gameplay", 1);

  const truthTable = [
    [false, false, false],
    [false, true, true],
    [true, false, true],
    [true, true, true],
  ] as const;
  const truthTablePass = truthTable.every(([saved, os, expected]) =>
    effectiveRunnerMotionReduced(saved, os) === expected);
  // OS preference is intentionally presentation-only, but the exact tuple is
  // still independently executed through every production marker/settlement.
  const osProjection = evaluateRunnerAuthenticatedModeProjection(
    baseEntry,
    structuralTape,
  );
  const osPass = truthTablePass &&
    effectiveRunnerMotionReduced(false, true) &&
    isAuthenticRunnerModeProjection(osProjection) &&
    osProjection !== baseProjection &&
    !Object.hasOwn(baseEntry.accessibility, "osPrefersReducedMotion") &&
    osProjection.pendingStateHash === baseProjection.pendingStateHash &&
    osProjection.completedStateHash === baseProjection.completedStateHash &&
    sameAuthenticatedGameplay(osProjection, baseProjection, true);
  recordAssertionCheck(counters, "runner-reduced-motion-domain-identity-v1",
    osPass, `${witness}/os`, "OS reduced-motion projection changed the simulation domain", 1);
}

const APPEARANCE_AXES = deepFreeze({
  gender: ["female", "male"] as const,
  heritageStyleId: ["asian", "western", "black", "middle-eastern"] as const,
  hairStyleId: ["short-soft", "wavy-bob", "curly-crown", "tied-back"] as const,
  hairColorId: ["black", "dark-brown", "warm-brown", "silver"] as const,
  clothingPaletteId: ["sunrise", "meadow", "ocean", "berry"] as const,
});

function appearanceSetups(base: InitialRunSetup): readonly InitialRunSetup[] {
  const setups: InitialRunSetup[] = [];
  for (const gender of APPEARANCE_AXES.gender) {
    for (const heritageStyleId of APPEARANCE_AXES.heritageStyleId) {
      for (const hairStyleId of APPEARANCE_AXES.hairStyleId) {
        for (const hairColorId of APPEARANCE_AXES.hairColorId) {
          for (const clothingPaletteId of APPEARANCE_AXES.clothingPaletteId) {
            setups.push({
              ...base,
              identity: { gender },
              appearance: { heritageStyleId, hairStyleId, hairColorId, clothingPaletteId },
            });
          }
        }
      }
    }
  }
  if (setups.length !== 512) fail("appearance Cartesian product is not 512");
  return setups;
}

function validateAppearanceDomain(
  counters: Map<RunnerAssertionId, MutableCounter>,
  seed: number,
  baseSetup: InitialRunSetup,
  structuralTape: RunnerNeutralReplayTape,
  baseProjection: RunnerAuthenticatedModeProjection,
): void {
  const baseEntry = createRunnerLaboratoryEntryState(seedHex(seed), baseSetup);
  const maleSetup: InitialRunSetup = {
    ...baseSetup,
    identity: { gender: "male" },
  };
  const maleEntry = createRunnerLaboratoryEntryState(seedHex(seed), maleSetup);
  for (const [index, appearanceSetup] of appearanceSetups(baseSetup).entries()) {
    const appearanceEntry = createRunnerLaboratoryEntryState(seedHex(seed), appearanceSetup);
    const appearanceProjection = evaluateRunnerAuthenticatedModeProjection(
      appearanceEntry,
      structuralTape,
    );
    const genderChanged = appearanceSetup.identity.gender !== baseSetup.identity.gender;
    const sameGenderRepresentative = genderChanged ? maleEntry : baseEntry;
    const identityHashProof = genderChanged
      ? appearanceEntry.runId !== baseEntry.runId &&
        stateHashV1(appearanceEntry) !== stateHashV1(baseEntry)
      : appearanceEntry.runId === baseEntry.runId &&
        stateHashV1(appearanceEntry) === stateHashV1(baseEntry);
    const cosmeticHashProof = appearanceEntry.runId === sameGenderRepresentative.runId &&
      stateHashV1(appearanceEntry) === stateHashV1(sameGenderRepresentative);
    recordAssertionCheck(counters, "runner-appearance-invariance-v1",
      isAuthenticRunnerModeProjection(appearanceProjection) &&
        appearanceProjection !== baseProjection &&
        identityHashProof && cosmeticHashProof &&
        sameAuthenticatedGameplay(
          appearanceProjection,
          baseProjection,
          false,
        ),
      `${seedHex(seed)}/${baseSetup.startingProfileId}/${baseSetup.difficulty}/appearance-${index}`,
      "cosmetics changed identity/hash or gender failed to change identity/hash without changing gameplay");
  }
}

function seedDigest(seed: number, projections: readonly unknown[]): RunnerSeedDigest {
  const sorted = [...projections]
    .sort((left, right) => canonical(left).localeCompare(canonical(right)));
  return deepFreeze({ seed, sha256: sha256(canonical(sorted)) });
}

export async function evaluateRunnerLaboratoryShard(
  options: RunnerShardEvaluationOptions,
): Promise<RunnerLaboratoryShardRecord> {
  const { inputs } = options;
  const fixturePopulation = inputs.fixture.population;
  const seedStart = options.seedStart ?? fixturePopulation.start;
  const seedEndInclusive = options.seedEndInclusive ?? fixturePopulation.endInclusive;
  const auxiliaryDomains = options.auxiliaryDomains ?? true;
  if (
    !Number.isInteger(options.shardCount) || options.shardCount <= 0 ||
    !Number.isInteger(options.shardIndex) || options.shardIndex < 0 ||
    options.shardIndex >= options.shardCount ||
    !Number.isInteger(seedStart) || !Number.isInteger(seedEndInclusive) ||
    seedStart < fixturePopulation.start || seedEndInclusive > fixturePopulation.endInclusive ||
    seedStart > seedEndInclusive
  ) {
    fail("invalid shard or seed range");
  }
  if (auxiliaryDomains &&
      (seedStart !== fixturePopulation.start || seedEndInclusive !== fixturePopulation.endInclusive)) {
    fail("evidence shards must evaluate the entire locked seed domain");
  }

  const profiles = inputs.registry.startingProfiles.map(({ id }: any) => id) as StartingProfileId[];
  const difficulties = [...inputs.registry.difficulties] as Difficulty[];
  const counters = newCounterMap();
  const digests: RunnerSeedDigest[] = [];
  for (let seed = seedStart; seed <= seedEndInclusive; seed += fixturePopulation.step) {
    if ((seed - fixturePopulation.start) % options.shardCount !== options.shardIndex) continue;
    const projectionsForSeed: unknown[] = [];
    for (const difficulty of difficulties) {
      const representativeProfile = profiles[0];
      if (representativeProfile === undefined) fail("locked profile closure is empty");
      const representativeSetup = defaultSetup(representativeProfile, difficulty);
      const representativeTape = evaluateRunnerNeutralReplay(
        createRunnerLaboratoryEntryState(seedHex(seed), representativeSetup),
      );
      if (!isAuthenticRunnerNeutralReplayTape(representativeTape)) {
        fail(`production replay rejected the representative tape at ${seedHex(seed)}/${difficulty}`);
      }
      const course = generateRunnerLaboratoryCourse(seedHex(seed), difficulty);
      for (const profile of profiles) {
        const setup = defaultSetup(profile, difficulty);
        const bundle = validateAuthenticatedBaseEntry(
          counters,
          seed,
          difficulty,
          profile,
          representativeTape,
          course,
        );
        if (auxiliaryDomains) {
          validateReducedMotionDomains(
            counters,
            seed,
            setup,
            representativeTape,
            bundle.manual,
          );
        }
        if (auxiliaryDomains && [0, 1, 9999].includes(seed)) {
          validateAppearanceDomain(
            counters,
            seed,
            setup,
            representativeTape,
            bundle.manual,
          );
        }
        for (const controlMode of [
          "manual",
          "semantic-assist",
          "automatic-assist",
        ] as const) {
          const projection = controlMode === "manual"
            ? bundle.manual
            : controlMode === "semantic-assist"
              ? bundle.semantic
              : bundle.automatic;
          projectionsForSeed.push({
            controlMode,
            difficulty,
            startingProfileId: profile,
            canonicalEntryHash: projection.canonicalEntryHash,
            startEventCount: projection.startEventCount,
            markerTransitions: projection.markerTransitions.map((transition) => ({
              patternIndex: transition.patternIndex,
              markerInstanceId: transition.markerInstanceId,
              simulationTick: transition.simulationTick,
              sourceLane: transition.sourceLane,
              targetLane: transition.targetLane,
              firstIntent: transition.firstIntent,
              bufferedIntent: transition.bufferedIntent,
              beforeStateHash: transition.beforeStateHash,
              afterFirstStateHash: transition.afterFirstStateHash,
              afterCommitStateHash: transition.afterCommitStateHash,
              decisionMarkerEventCount: transition.decisionMarkerEventCount,
              acceptedRawInputCount: transition.acceptedRawInputCount,
              reloadRoundTripVerified: transition.reloadRoundTripVerified,
              motion: transition.motion,
              inputBuffer: transition.inputBuffer,
              eventTypes: transition.eventTypes,
            })),
            terminalScores: projection.terminalScores,
            effectIds: projection.effects.map(({ effect }) => effect.effectId),
            course: representativeTape.course,
            targets: representativeTape.targets,
            contacts: projection.contacts,
            pendingStateHash: projection.pendingStateHash,
            completedStateHash: projection.completedStateHash,
            completionFactIds: projection.completionFactIds,
            completionMemoryIds: projection.completionMemoryIds,
            rawLaneInputCount: projection.rawLaneInputCount,
            semanticChoiceCount: projection.semanticChoiceCount,
            automaticDecisionCount: projection.automaticDecisionCount,
          });
        }
      }
      validateCourseDomains(
        counters,
        seed,
        difficulty,
        course,
        representativeTape,
      );
    }
    digests.push(seedDigest(seed, projectionsForSeed));
  }

  return deepFreeze({
    schemaVersion: RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
    evaluatorId: RUNNER_LABORATORY_EVALUATOR_ID,
    evaluatedSourceSha256: inputs.evaluatedSourceSha256,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    seedStart,
    seedEndInclusive,
    seedStep: fixturePopulation.step,
    assertionCounters: freezeCounters(counters),
    seedDigests: digests,
  });
}

function validatesInputTransition(
  incoming: LaneControllerState,
  request: LaneIntent,
  outgoing: LaneControllerState,
): boolean {
  const before = incoming.motion;
  const after = outgoing.motion;
  if (before.kind === "idle") {
    const committed = incoming.inputBuffer ?? request;
    const target = committed === null
      ? null
      : adjacentLane(before.currentLane, committed);
    if (target === null) {
      return after.kind === "idle" &&
        after.currentLane === before.currentLane &&
        outgoing.inputBuffer === null;
    }
    return after.kind === "moving" &&
      after.sourceLane === before.currentLane &&
      after.targetLane === target &&
      after.elapsedTicks === 1 &&
      outgoing.inputBuffer === null;
  }

  const legalRequest = request !== null &&
    adjacentLane(before.targetLane, request) !== null;
  const expectedBuffer = incoming.inputBuffer ?? (legalRequest ? request : null);
  if (before.elapsedTicks === before.totalTicks - 1) {
    return after.kind === "idle" &&
      after.currentLane === before.targetLane &&
      outgoing.inputBuffer === expectedBuffer;
  }
  return after.kind === "moving" &&
    after.sourceLane === before.sourceLane &&
    after.targetLane === before.targetLane &&
    after.elapsedTicks === before.elapsedTicks + 1 &&
    outgoing.inputBuffer === expectedBuffer;
}

function validatesBufferHandoff(incoming: LaneControllerState): boolean {
  if (incoming.motion.kind !== "moving") return false;
  let current = incoming;
  while (current.motion.kind === "moving") {
    current = stepLaneController(current, null);
  }
  const committed = current.inputBuffer;
  const after = stepLaneController(current, null);
  if (committed === null) {
    return after.motion.kind === "idle" &&
      after.motion.currentLane === current.motion.currentLane &&
      after.inputBuffer === null;
  }
  const target = adjacentLane(current.motion.currentLane, committed);
  return target !== null &&
    after.motion.kind === "moving" &&
    after.motion.sourceLane === current.motion.currentLane &&
    after.motion.targetLane === target &&
    after.motion.elapsedTicks === 1 &&
    after.inputBuffer === null;
}

function evaluateInputClosure(
  counters: Map<RunnerAssertionId, MutableCounter>,
): void {
  const states = enumerateIncomingLaneStates();
  if (states.length !== 107 || new Set(states.map(laneControllerStateKey)).size !== 107) {
    fail("production incoming lane closure is not exactly 107 unique states");
  }
  for (const state of states) {
    for (const request of [null, "up", "down"] as const) {
      const outgoing = stepLaneController(state, request);
      recordAssertionCheck(
        counters,
        "runner-input-adjacency-v1",
        validatesInputTransition(state, request, outgoing),
        `${laneControllerStateKey(state)}/${request ?? "none"}`,
        "lane transition violated adjacency or one-step timing",
      );
    }
  }
  const moving = states.filter((state) => state.motion.kind === "moving");
  if (moving.length !== 100) fail("production moving-state closure is not exactly 100");
  for (const state of moving) {
    recordAssertionCheck(
      counters,
      "runner-buffer-handoff-v1",
      validatesBufferHandoff(state),
      laneControllerStateKey(state),
      "buffer was lost, duplicated, or started before the next logical step",
    );
  }
}

export interface RunnerPausePowerSetResult {
  readonly subsetKey: string;
  readonly passed: boolean;
  readonly saveRoundTripOccurrenceCounts: Readonly<{
    readonly pause: Readonly<Record<RuntimePauseReason, number>>;
    readonly resume: Readonly<Record<RuntimePauseReason, number>>;
  }>;
}

export type RunnerPauseDriverFactory = () => FixedStepDriver;

export type RunnerPauseEncodedStateMutator = (
  encodedState: string,
) => string;

interface RunnerPauseCodecStates {
  readonly paused: RunStateV1;
  readonly resumed: RunStateV1;
}

let cachedRunnerPauseCodecStates: RunnerPauseCodecStates | undefined;

function runnerPauseCodecStates(): RunnerPauseCodecStates {
  if (cachedRunnerPauseCodecStates !== undefined) {
    return cachedRunnerPauseCodecStates;
  }
  const tape = evaluateRunnerNeutralReplay(createRunnerLaboratoryEntryState(
    seedHex(0),
    defaultSetup("steady-mix-v1", "story"),
  ));
  const resumed = tape.startBoundary.state;
  const resumedRunner = resumed.runner;
  if (
    tape.replayClosure.kindCounts["user-pause"] !== 1 ||
    tape.replayClosure.kindCounts["user-resume"] !== 1 ||
    resumedRunner === null ||
    resumedRunner.userPaused
  ) {
    fail("production replay lacks exact persisted user pause/resume witnesses");
  }
  const paused = deepFreeze({
    ...resumed,
    runner: {
      ...resumedRunner,
      userPaused: true,
    },
  } satisfies RunStateV1);
  const states = deepFreeze({
    paused,
    resumed,
  } satisfies RunnerPauseCodecStates);
  cachedRunnerPauseCodecStates = states;
  return states;
}

/** Exact production codec identity used at each pause/resume occurrence. */
export function validatesRunnerPauseCodecOccurrence(
  state: RunStateV1,
  mutateEncodedState?: RunnerPauseEncodedStateMutator,
): boolean {
  try {
    const sourceEncoded = encodeRunState(state);
    const decoded = decodeRunState(
      mutateEncodedState?.(sourceEncoded) ?? sourceEncoded,
      RUNNER_LABORATORY_CATALOG,
    );
    return decoded.kind === "ready" && decoded.migratedFrom === null &&
      encodeRunState(decoded.state) === sourceEncoded &&
      canonical(decoded.state) === canonical(state) &&
      stateHashV1(decoded.state) === stateHashV1(state);
  } catch {
    return false;
  }
}

function zeroPauseReasonCounts(): Record<RuntimePauseReason, number> {
  return Object.fromEntries(RUNTIME_PAUSE_REASON_ORDER.map((reason) =>
    [reason, 0])) as Record<RuntimePauseReason, number>;
}

function runtimePauseReasonSubsets(): readonly (readonly RuntimePauseReason[])[] {
  return Object.freeze(Array.from({ length: 2 ** RUNTIME_PAUSE_REASON_ORDER.length },
    (_, mask) => Object.freeze(RUNTIME_PAUSE_REASON_ORDER.filter((_, index) =>
      (mask & (1 << index)) !== 0))));
}

function zeroFrame(result: ReturnType<FixedStepDriver["advanceFrame"]>): boolean {
  return result.logicalSteps === 0 && result.droppedLogicalSteps === 0;
}

/** Exact 2^5 pause-reason closure used by the locked 32-case assertion. */
export function evaluateRunnerPausePowerSet(
  createDriver: RunnerPauseDriverFactory = createFixedStepDriver,
): readonly RunnerPausePowerSetResult[] {
  const codecStates = runnerPauseCodecStates();
  const elapsedMilliseconds = [0, 1, 19, 20, 21, 100, 1_000, 10_000] as const;
  return deepFreeze(runtimePauseReasonSubsets().map((subset) => {
    const subsetKey = subset.length === 0 ? "none" : subset.join("+");
    const pauseCounts = zeroPauseReasonCounts();
    const resumeCounts = zeroPauseReasonCounts();
    if (subset.length === 0) {
      const driver = createDriver();
      const first = driver.advanceFrame(1_000);
      const partial = driver.advanceFrame(1_019);
      const ordinary = driver.advanceFrame(1_020);
      return {
        subsetKey,
        passed: zeroFrame(first) && zeroFrame(partial) &&
          ordinary.logicalSteps === 1 && ordinary.droppedLogicalSteps === 0 &&
          driver.activePauseReasons().length === 0,
        saveRoundTripOccurrenceCounts: {
          pause: pauseCounts,
          resume: resumeCounts,
        },
      };
    }

    let passed = true;
    for (const clearOrder of permutations(subset)) {
      const driver = createDriver();
      let timestamp = 1_000;
      passed &&= zeroFrame(driver.advanceFrame(timestamp));
      timestamp += 19;
      passed &&= zeroFrame(driver.advanceFrame(timestamp));

      const active = new Set<RuntimePauseReason>();
      for (const reason of subset) {
        driver.setPauseReason(reason, true);
        active.add(reason);
        pauseCounts[reason] += 1;
        passed &&= validatesRunnerPauseCodecOccurrence(
          active.has("user") ? codecStates.paused : codecStates.resumed,
        );
        timestamp += 10_000;
        passed &&= zeroFrame(driver.advanceFrame(timestamp));
        passed &&= exactArray(
          driver.activePauseReasons(),
          RUNTIME_PAUSE_REASON_ORDER.filter((candidate) => active.has(candidate)),
        );
      }
      for (const elapsed of elapsedMilliseconds) {
        timestamp += elapsed;
        passed &&= zeroFrame(driver.advanceFrame(timestamp));
      }

      for (const reason of clearOrder) {
        driver.setPauseReason(reason, false);
        active.delete(reason);
        resumeCounts[reason] += 1;
        passed &&= validatesRunnerPauseCodecOccurrence(
          active.has("user") ? codecStates.paused : codecStates.resumed,
        );
        timestamp += 10_000;
        passed &&= zeroFrame(driver.advanceFrame(timestamp));
        passed &&= exactArray(
          driver.activePauseReasons(),
          RUNTIME_PAUSE_REASON_ORDER.filter((candidate) => active.has(candidate)),
        );
      }
      timestamp += 20;
      const ordinary = driver.advanceFrame(timestamp);
      passed &&= ordinary.logicalSteps === 1 &&
        ordinary.droppedLogicalSteps === 0 &&
        driver.activePauseReasons().length === 0;
    }
    return {
      subsetKey,
      passed,
      saveRoundTripOccurrenceCounts: {
        pause: pauseCounts,
        resume: resumeCounts,
      },
    };
  }));
}

function evaluatePauseClosure(
  counters: Map<RunnerAssertionId, MutableCounter>,
): void {
  for (const result of evaluateRunnerPausePowerSet()) {
    recordAssertionCheck(
      counters,
      "runner-pause-drift-v1",
      result.passed,
      result.subsetKey,
      "pause-reason power set drifted, cleared another reason, or caught up",
    );
  }
}

function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
  if (values.length <= 1) return [values];
  const output: T[][] = [];
  for (const [index, value] of values.entries()) {
    const remaining = values.filter((_, candidateIndex) => candidateIndex !== index);
    for (const suffix of permutations(remaining)) output.push([value, ...suffix]);
  }
  return output;
}

function evaluateSimultaneousPermutationClosure(
  counters: Map<RunnerAssertionId, MutableCounter>,
  fixture: any,
): void {
  const witness = fixture.collision.simultaneousContactOrderWitness;
  const course = generateRunnerLaboratoryCourse(witness.runSeed, witness.difficulty);
  const generatedById = new Map(
    course.patterns.flatMap((pattern) => pattern.entities)
      .map((entity) => [entity.instanceId, entity]),
  );
  const candidates = witness.entities.map((fixtureEntity: any) => {
    const generated = generatedById.get(fixtureEntity.instanceId);
    if (generated === undefined) fail(`simultaneous witness entity is absent: ${fixtureEntity.instanceId}`);
    return { entity: { ...generated, contactState: "pending" as const } };
  }) as readonly ContactCandidate[];
  const results = permutations(candidates);
  if (results.length !== 6) fail("three-candidate permutation closure is not six");
  let expectedHash: string | null = null;
  for (const [index, ordering] of results.entries()) {
    const result = resolveCanonicalContactCandidates({
      course,
      runSeed: witness.runSeed,
      difficulty: witness.difficulty,
      candidates: ordering,
      controlMode: "manual",
      simulationTick: witness.tick,
      scores: witness.startingScores,
      ledger: { recent: [], totalsBySource: zeroSourceTotals() },
      invulnerableUntilTick: 0,
      resolvedEntityIds: witness.preexistingResolvedEntityIds,
    });
    const suppressed = result.events
      .filter(({ outcome }) => outcome === "hazard-suppressed")
      .map(({ entityInstanceId }) => entityInstanceId);
    const projection = {
      scores: result.scores,
      effectIds: result.effectIds,
      newlyResolvedEntityIds: result.newlyResolvedEntityIds,
      resolvedEntityIds: result.resolvedEntityIds,
      invulnerableUntilTick: result.invulnerableUntilTick,
    };
    const projectionHash = sha256(canonical(projection));
    expectedHash ??= projectionHash;
    const passed = projectionHash === expectedHash &&
      exactArray(result.effectIds, witness.expectedEffectOrder) &&
      exactArray(suppressed, witness.expectedSuppressedEntityIds) &&
      exactArray(result.newlyResolvedEntityIds, witness.expectedNewlyResolvedEntityIds) &&
      exactArray(result.resolvedEntityIds, witness.expectedFinalResolvedEntityIds) &&
      canonical(result.scores) === canonical(witness.expectedFinalScores) &&
      result.invulnerableUntilTick === witness.expectedInvulnerableUntilTick;
    recordAssertionCheck(
      counters,
      "runner-simultaneous-contact-order-v1",
      passed,
      `permutation-${index}`,
      "canonical simultaneous-contact result changed with input order",
    );
  }
}

interface StructuralWitness {
  readonly seed: number;
  readonly patternIndex: number;
  readonly patternId: string;
  readonly rotation: Lane;
}

function structuralWitnesses(fixture: any): readonly StructuralWitness[] {
  const cases = fixture.accessibility.semanticChoiceAndReloadIdentity
    .structuralPatternRotationCases as readonly { patternId: string; rotation: Lane }[];
  const needed = new Map(cases.map((item) => [`${item.patternId}/${item.rotation}`, item]));
  const found = new Map<string, StructuralWitness>();
  for (let seed = fixture.population.start;
       seed <= fixture.population.endInclusive && found.size < needed.size;
       seed += fixture.population.step) {
    const course = generateRunnerLaboratoryCourse(seedHex(seed), "normal");
    for (const pattern of course.patterns) {
      const key = `${pattern.patternId}/${pattern.rotation}`;
      if (needed.has(key) && !found.has(key)) {
        found.set(key, {
          seed,
          patternIndex: pattern.patternIndex,
          patternId: pattern.patternId,
          rotation: pattern.rotation,
        });
      }
    }
  }
  const ordered = cases.map(({ patternId, rotation }) => found.get(`${patternId}/${rotation}`));
  if (ordered.some((item) => item === undefined)) fail("semantic structural witness closure is unreachable");
  return ordered as readonly StructuralWitness[];
}

function semanticBoundaryState(
  boundary: RunStateV1,
  sourceLane: Lane,
): RunStateV1 {
  if (boundary.runner === null) fail("semantic boundary lacks runner state");
  const converted = {
    ...boundary,
    controlMode: "semantic-assist" as const,
    runner: {
      ...boundary.runner,
      motion: {
        kind: "idle" as const,
        currentLane: sourceLane,
        sourceLane,
        targetLane: sourceLane,
        elapsedTicks: 0 as const,
        totalTicks: 11 as const,
      },
      inputBuffer: null,
      userPaused: false,
    },
  };
  return deepFreeze({
    ...converted,
    runId: deriveRunIdFromStateV1(converted, "semantic-assist"),
  });
}

function expectedSemanticMotion(sourceLane: Lane, targetLane: Lane): unknown {
  if (sourceLane === targetLane) {
    return {
      motion: {
        kind: "idle", currentLane: sourceLane, sourceLane, targetLane: sourceLane,
        elapsedTicks: 0, totalTicks: 11,
      },
      inputBuffer: null,
    };
  }
  const direction: LaneDirection = targetLane < sourceLane ? "up" : "down";
  const firstTarget = adjacentLane(sourceLane, direction);
  if (firstTarget === null) fail("semantic target cannot compile to an adjacent first step");
  return {
    motion: {
      kind: "moving", currentLane: sourceLane, sourceLane, targetLane: firstTarget,
      elapsedTicks: 1, totalTicks: 11,
    },
    inputBuffer: Math.abs(targetLane - sourceLane) === 2 ? direction : null,
  };
}

function manualBoundaryState(
  boundary: RunStateV1,
  sourceLane: Lane,
): RunStateV1 {
  if (boundary.runner === null) fail("manual boundary lacks runner state");
  return deepFreeze({
    ...boundary,
    runner: {
      ...boundary.runner,
      motion: {
        kind: "idle" as const,
        currentLane: sourceLane,
        sourceLane,
        targetLane: sourceLane,
        elapsedTicks: 0,
        totalTicks: 11,
      },
      inputBuffer: null,
      userPaused: false,
    },
  });
}

interface RunnerSemanticRenderHarness {
  readonly elements: RunnerSemanticFieldsetElements;
  close(): void;
}

export type RunnerSemanticRenderMutator = (
  projection: RunnerSemanticFieldsetRenderProjection,
) => void;

function createRunnerSemanticRenderHarness(): RunnerSemanticRenderHarness {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("jsdom") as Readonly<{
    JSDOM: new (html: string) => Readonly<{
      window: Readonly<{
        document: Document;
        close(): void;
      }>;
    }>;
  }>;
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const elements = createRunnerSemanticFieldsetElements(dom.window.document);
  dom.window.document.body.append(elements.fieldset);
  return Object.freeze({
    elements,
    close: () => dom.window.close(),
  });
}

function semanticChoiceText(warning: RunnerLaneWarning): string {
  return `${warning.laneLabel} — Benefit: ${warning.benefitText}; Hazard: ${warning.hazardText}; ${warning.urgencyText}`;
}

function sortedStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function validatesRunnerSemanticPresentationWithHarness(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  harness: RunnerSemanticRenderHarness,
  mutate?: RunnerSemanticRenderMutator,
): boolean {
  const model = createRunnerPresentationModel(state, course);
  const decision = model?.semanticDecision ?? null;
  if (model === null || decision === null || state.runner === null) return false;
  const rendered = renderRunnerSemanticFieldset(harness.elements, model, false);
  if (rendered === null) return false;
  mutate?.(rendered);

  const { fieldset, legend, choices } = harness.elements;
  const pattern = course.patterns[model.warning.patternIndex - 1];
  if (pattern === undefined) return false;
  const activeEntityIds = new Set(state.runner.activeEntities.map(({ instanceId }) =>
    instanceId));
  const nativeStructure =
    fieldset.tagName === "FIELDSET" &&
    fieldset.getAttribute("data-runner-semantic") === "" &&
    fieldset.hidden === false &&
    legend.tagName === "LEGEND" && legend.parentElement === fieldset &&
    legend.textContent === decision.legend &&
    fieldset.children.length === 4 && fieldset.children[0] === legend &&
    fieldset.querySelectorAll("button[data-runner-semantic-lane]").length === 3 &&
    fieldset.dataset.patternIndex === String(decision.patternIndex);
  const sharedProvenance =
    decision.warning === model.warning &&
    decision.choices === model.warning.lanes &&
    rendered.warning === model.warning &&
    rendered.patternIndex === model.warning.patternIndex &&
    rendered.fieldset === fieldset && rendered.legend === legend;
  if (!nativeStructure || !sharedProvenance) return false;

  return ([0, 1, 2] as const).every((lane) => {
    const warning = model.warning.lanes[lane];
    const projectedChoice = rendered.choices[lane];
    const choice = choices[lane];
    const expectedEntities = pattern.entities.filter((entity) =>
      entity.lane === lane && activeEntityIds.has(entity.instanceId));
    const expectedBenefitIds = sortedStrings(expectedEntities
      .filter(({ kind }) => kind === "benefit")
      .map(({ instanceId }) => instanceId));
    const expectedHazardIds = sortedStrings(expectedEntities
      .filter(({ kind }) => kind === "hazard")
      .map(({ instanceId }) => instanceId));
    const expectedUrgencyTicks = expectedEntities.length === 0
      ? Math.max(0, pattern.anchorTick - state.simulationTick)
      : Math.min(...expectedEntities.map(({ contactTick }) =>
          Math.max(0, contactTick - state.simulationTick)));
    const expectedAccessibleLabel =
      `${warning.laneLabel}. Benefit: ${warning.benefitText}. Hazard: ${warning.hazardText}. Urgency: ${warning.urgencyText}.`;
    return projectedChoice.lane === lane &&
      projectedChoice.warning === warning && projectedChoice.button === choice &&
      choice.tagName === "BUTTON" && choice.type === "button" &&
      choice.parentElement === fieldset && choice.disabled === false &&
      choice.dataset.runnerSemanticLane === String(lane) &&
      choice.dataset.warningLabel === warning.accessibleLabel &&
      choice.getAttribute("aria-label") === warning.accessibleLabel &&
      choice.textContent === semanticChoiceText(warning) &&
      warning.accessibleLabel === expectedAccessibleLabel &&
      exactArray(
        sortedStrings(warning.benefits.map(({ entityInstanceId }) =>
          entityInstanceId)),
        expectedBenefitIds,
      ) &&
      exactArray(
        sortedStrings(warning.hazards.map(({ entityInstanceId }) =>
          entityInstanceId)),
        expectedHazardIds,
      ) &&
      warning.urgencyTicks === expectedUrgencyTicks &&
      warning.urgencyMilliseconds ===
        expectedUrgencyTicks * LOGICAL_TICK_MILLISECONDS;
  });
}

/**
 * Focused seam for deliberately corrupting the real production-native
 * fieldset in evaluator tests. Production closure reuses one harness for all
 * 1,080 cases instead of constructing a parallel representation.
 */
export function validatesRunnerSemanticPresentationWitness(
  state: RunStateV1,
  course: RunnerLabGeneratedCourse,
  mutate?: RunnerSemanticRenderMutator,
): boolean {
  const harness = createRunnerSemanticRenderHarness();
  try {
    return validatesRunnerSemanticPresentationWithHarness(
      state,
      course,
      harness,
      mutate,
    );
  } catch {
    return false;
  } finally {
    harness.close();
  }
}

export interface RunnerForcedContinuationGameplayProjection {
  readonly tickProgression: Readonly<{
    readonly startSimulationTick: number;
    readonly endSimulationTick: number;
    readonly ordinaryTickCount: number;
    readonly gameplayHashDigest: string;
  }>;
  readonly terminalMotion: RunnerForcedContinuationReplay["terminalMotion"];
  readonly terminalInputBuffer:
    RunnerForcedContinuationReplay["terminalInputBuffer"];
  readonly futureScoringEntityIds: readonly string[];
  readonly contacts: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly scores: CoreScores;
  readonly stage: RunStateV1["stage"];
  readonly storyState: RunStateV1["storyState"];
  readonly completionFactIds: readonly string[];
  readonly completionMemoryIds: readonly string[];
}

export type RunnerForcedContinuationGameplayProjectionMutator = (
  projection: RunnerForcedContinuationGameplayProjection,
) => unknown;

export function forcedContinuationGameplayProjection(
  trace: RunnerForcedContinuationReplay,
): RunnerForcedContinuationGameplayProjection {
  return deepFreeze({
    tickProgression: {
      startSimulationTick: trace.tickProgression.startSimulationTick,
      endSimulationTick: trace.tickProgression.endSimulationTick,
      ordinaryTickCount: trace.tickProgression.ordinaryTickCount,
      gameplayHashDigest: trace.tickProgression.gameplayHashDigest,
    },
    terminalMotion: trace.terminalMotion,
    terminalInputBuffer: trace.terminalInputBuffer,
    futureScoringEntityIds: trace.futureScoringEntityIds,
    contacts: trace.contacts.map(({ contact }) => contact),
    effects: trace.effects.map(({ effect }) => effect),
    scores: trace.terminalScores,
    stage: trace.completedState.stage,
    storyState: trace.completedState.storyState,
    completionFactIds: trace.completionFactIds,
    completionMemoryIds: trace.completionMemoryIds,
  });
}

export function validatesForcedContinuationGameplayIdentity(
  semantic: RunnerForcedContinuationReplay,
  manual: RunnerForcedContinuationReplay,
  mutateSemanticProjection?: RunnerForcedContinuationGameplayProjectionMutator,
): boolean {
  if (
    !isAuthenticRunnerForcedContinuationReplay(semantic) ||
    !isAuthenticRunnerForcedContinuationReplay(manual) ||
    semantic.controlMode !== "semantic-assist" || manual.controlMode !== "manual" ||
    semantic.runSeed !== manual.runSeed ||
    semantic.difficulty !== manual.difficulty ||
    semantic.startingProfileId !== manual.startingProfileId ||
    semantic.forcedPatternIndex !== manual.forcedPatternIndex ||
    semantic.forcedTargetLane !== manual.forcedTargetLane
  ) return false;
  const semanticProjection = forcedContinuationGameplayProjection(semantic);
  const candidate = mutateSemanticProjection?.(semanticProjection) ??
    semanticProjection;
  return canonical(candidate) === canonical(
    forcedContinuationGameplayProjection(manual),
  );
}

function evaluateSemanticClosure(
  counters: Map<RunnerAssertionId, MutableCounter>,
  inputs: RunnerEvaluatorInputs,
): void {
  const profiles = inputs.registry.startingProfiles.map(({ id }: any) => id) as StartingProfileId[];
  const difficulties = inputs.registry.difficulties as Difficulty[];
  const sources = inputs.fixture.accessibility.semanticChoiceAndReloadIdentity.sourceLanes as Lane[];
  const targets = inputs.fixture.accessibility.semanticChoiceAndReloadIdentity.targetLanes as Lane[];
  const cache = new Map<string, RunnerNeutralReplayTape>();
  const structural = structuralWitnesses(inputs.fixture);

  const representativeProfile = profiles[0];
  if (representativeProfile === undefined) fail("semantic profile closure is empty");
  const renderHarness = createRunnerSemanticRenderHarness();
  let semanticPresentationCases = 0;
  try {
  for (const difficulty of difficulties) {
    for (const witness of structural) {
      const key = `${witness.seed}/${representativeProfile}/${difficulty}`;
      let tape = cache.get(key);
      if (tape === undefined) {
        tape = evaluateRunnerNeutralReplay(createRunnerLaboratoryEntryState(
          seedHex(witness.seed), defaultSetup(representativeProfile, difficulty),
        ));
        cache.set(key, tape);
      }
      for (const profile of profiles) {
        const manualEntry = createRunnerLaboratoryEntryState(
          seedHex(witness.seed),
          defaultSetup(profile, difficulty),
        );
        const semanticEntry = createRunnerLaboratoryEntryState(
          seedHex(witness.seed),
          {
            ...defaultSetup(profile, difficulty),
            controlMode: "semantic-assist",
          },
        );
        const manualSupport = createRunnerModeEvaluationSupport(
          manualEntry,
          tape,
        );
        const semanticSupport = createRunnerModeEvaluationSupport(
          semanticEntry,
          tape,
        );
        const manualBoundary =
          manualSupport.markerCheckpoints[witness.patternIndex - 1];
        const semanticBoundary =
          semanticSupport.markerCheckpoints[witness.patternIndex - 1];
        if (manualBoundary === undefined || semanticBoundary === undefined) {
          fail("semantic exact-profile witness lacks its marker checkpoint");
        }
        const context = semanticSupport.context;
        for (const sourceLane of sources) {
          for (const targetLane of targets) {
            const initial = semanticBoundaryState(semanticBoundary, sourceLane);
            const semanticPresentationIdentity =
              validatesRunnerSemanticPresentationWithHarness(
                initial,
                context.course,
                renderHarness,
              );
            semanticPresentationCases += 1;
            const normal = chooseLane(context, initial, targetLane);
            const beforeReload = decodeRunState(
              encodeRunState(initial),
              RUNNER_LABORATORY_CATALOG,
            );
            const reloadedResult = beforeReload.kind === "ready"
              ? chooseLane(context, beforeReload.state, targetLane)
              : null;
            const afterReload = normal.stateChanged
              ? decodeRunState(
                  encodeRunState(normal.state),
                  RUNNER_LABORATORY_CATALOG,
                )
              : null;
            const expected = expectedSemanticMotion(sourceLane, targetLane);
            const runner = normal.state.runner;
            const branchEntryIdentity = normal.stateChanged &&
              normal.tickDelta === 1 && normal.noOpReason === null &&
              runner !== null &&
              canonical({
                motion: runner.motion,
                inputBuffer: runner.inputBuffer,
              }) === canonical(expected) &&
              reloadedResult !== null && reloadedResult.stateChanged &&
              canonical(reloadedResult.state) === canonical(normal.state) &&
              afterReload?.kind === "ready" &&
              canonical(afterReload.state) === canonical(normal.state);
            // The three exact-profile branches are identical at the first
            // post-choice tick, so one authenticated full continuation proves
            // their shared deterministic suffix without copying another
            // profile's scores, contacts, effects, fact, or memory.
            const semanticContinuation = evaluateRunnerForcedContinuation(
              initial,
              witness.patternIndex,
              targetLane,
            );
            const manualEquivalent = evaluateRunnerForcedContinuation(
              manualBoundaryState(manualBoundary, sourceLane),
              witness.patternIndex,
              targetLane,
            );
            const manualGameplayIdentity =
              validatesForcedContinuationGameplayIdentity(
                semanticContinuation,
                manualEquivalent,
              );
            recordAssertionCheck(
              counters,
              "runner-semantic-choice-and-reload-identity-v1",
              semanticPresentationIdentity && branchEntryIdentity &&
                manualGameplayIdentity,
              `${profile}/${difficulty}/${witness.patternId}/${witness.rotation}/${sourceLane}/${targetLane}`,
              "semantic native fieldset, choice continuation, reload-state identity, or Manual gameplay parity differs",
            );
          }
        }
      }
    }
  }
  } finally {
    renderHarness.close();
  }
  if (
    semanticPresentationCases !==
      RUNNER_SEMANTIC_PRESENTATION_CASE_POPULATION
  ) {
    fail(
      `semantic presentation closure checked ${semanticPresentationCases}; expected ${RUNNER_SEMANTIC_PRESENTATION_CASE_POPULATION}`,
    );
  }

  const firstWitness = structural[0]!;
  const firstProfile = profiles[0]!;
  const firstDifficulty = difficulties[0]!;
  const baseTape = evaluateRunnerNeutralReplay(createRunnerLaboratoryEntryState(
    seedHex(firstWitness.seed), defaultSetup(firstProfile, firstDifficulty),
  ));
  const baseBoundary = baseTape.patternBoundaries[firstWitness.patternIndex - 1]?.state;
  if (baseBoundary === undefined) fail("semantic pause witness boundary is absent");
  const context = createRunnerSimulationContext(seedHex(firstWitness.seed), firstDifficulty);
  const base = semanticBoundaryState(baseBoundary, 1);
  const pauseCases = [
    { fixtureReason: "visibility", independent: ["visibility"] as RunnerIndependentPauseReason[], user: false },
    { fixtureReason: "focus-interruption", independent: ["focus"] as RunnerIndependentPauseReason[], user: false },
    { fixtureReason: "user", independent: [] as RunnerIndependentPauseReason[], user: true },
    { fixtureReason: "modal", independent: ["modal"] as RunnerIndependentPauseReason[], user: false },
  ] as const;
  for (const pauseCase of pauseCases) {
    if (base.runner === null) fail("semantic pause base lost runner state");
    const paused = pauseCase.user
      ? deepFreeze({ ...base, runner: { ...base.runner, userPaused: true } })
      : base;
    const result = chooseLane(context, paused, 1, pauseCase.independent);
    const driver = createFixedStepDriver();
    driver.advanceFrame(0);
    driver.setPauseReason(
      pauseCase.fixtureReason === "focus-interruption"
        ? "focus-interruption"
        : pauseCase.fixtureReason as "visibility" | "user" | "modal",
      true,
    );
    driver.advanceFrame(500);
    driver.setPauseReason(
      pauseCase.fixtureReason === "focus-interruption"
        ? "focus-interruption"
        : pauseCase.fixtureReason as "visibility" | "user" | "modal",
      false,
    );
    const firstResumed = driver.advanceFrame(520);
    recordAssertionCheck(
      counters,
      "runner-semantic-choice-and-reload-identity-v1",
      !result.stateChanged && result.tickDelta === 0 &&
        stateHashV1(result.state) === stateHashV1(paused) &&
        firstResumed.logicalSteps === 0 && firstResumed.droppedLogicalSteps === 0,
      `pause-guard/${pauseCase.fixtureReason}`,
      "independent pause allowed a semantic commit or resume drift",
    );
  }
}

export function manualSessionSha256(session: Record<string, unknown>): string {
  const preimage = {
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
  };
  return sha256(JSON.stringify(preimage));
}

export function validateManualReviewWrapper(
  wrapper: unknown,
  evaluatedSourceDigest: string,
): ManualReviewWrapper {
  assertExactKeys(
    wrapper,
    ["schemaVersion", "artifactId", "evaluatedSourceSha256", "manualReviewEvidence"],
    "manual review wrapper",
  );
  if (
    wrapper.schemaVersion !== 1 ||
    wrapper.artifactId !== RUNNER_LABORATORY_MANUAL_WRAPPER_ID ||
    wrapper.evaluatedSourceSha256 !== evaluatedSourceDigest
  ) {
    fail("manual review wrapper identity or source binding is invalid");
  }
  const evidence = wrapper.manualReviewEvidence;
  assertExactKeys(evidence, ["assertionId", "status", "session", "artifact"], "manual review evidence");
  if (evidence.assertionId !== "runner-accessibility-browser-matrix-v1" || evidence.status !== "complete") {
    fail("manual review evidence is incomplete or attached to the wrong assertion");
  }
  const session = evidence.session;
  assertExactKeys(session, [
    "sessionId", "reviewerId", "reviewerAttestation", "keyboardOnlyPassed",
    "keyboardInspectionPassed", "screenReader", "screenReaderVersion", "platform",
    "browser", "browserVersion", "completedAtUtc", "evaluatedSourceSha256", "focusTransitionCount",
    "announcementWitnessCount", "semanticStructurePassed", "semanticDecisionPromptPassed",
    "nonvisualSemanticCompletionPassed", "forcedColorsInspectionPassed", "completionPathPassed",
  ], "manual review session");
  const requiredTrue = [
    "reviewerAttestation", "keyboardOnlyPassed", "keyboardInspectionPassed",
    "semanticStructurePassed", "semanticDecisionPromptPassed",
    "nonvisualSemanticCompletionPassed", "forcedColorsInspectionPassed", "completionPathPassed",
  ];
  if (requiredTrue.some((key) => session[key] !== true)) {
    fail("manual review session contains an unattested or failed requirement");
  }
  if (session.evaluatedSourceSha256 !== wrapper.evaluatedSourceSha256) {
    fail("manual review session source binding is invalid");
  }
  const completedAtText = String(session.completedAtUtc);
  const completedAtMilliseconds = Date.parse(completedAtText);
  const completedAtIsCanonical = Number.isFinite(completedAtMilliseconds) &&
    new Date(completedAtMilliseconds).toISOString().replace(".000Z", "Z") === completedAtText;
  if (
    typeof session.sessionId !== "string" || !ID_PATTERN.test(session.sessionId) ||
    typeof session.reviewerId !== "string" || !ID_PATTERN.test(session.reviewerId) ||
    session.reviewerId === "anonymous" ||
    typeof session.screenReaderVersion !== "string" || session.screenReaderVersion.length < 1 || session.screenReaderVersion.length > 32 ||
    typeof session.browserVersion !== "string" || session.browserVersion.length < 1 || session.browserVersion.length > 32 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(completedAtText) ||
    !completedAtIsCanonical || completedAtMilliseconds > Date.now() ||
    session.focusTransitionCount !== 10 || session.announcementWitnessCount !== 9
  ) {
    fail("manual review session metadata or locked witness counts are invalid");
  }
  const validPair =
    (session.screenReader === "NVDA" && session.platform === "Windows" &&
      ["Chrome", "Edge", "Firefox"].includes(String(session.browser))) ||
    (session.screenReader === "VoiceOver" && session.platform === "macOS" &&
      ["Chrome", "Edge", "Firefox", "Safari"].includes(String(session.browser)));
  if (!validPair) fail("manual review assistive-technology/platform/browser tuple is unsupported");
  const manualArtifact = evidence.artifact;
  assertExactKeys(manualArtifact, ["artifactId", "format", "sha256"], "manual review embedded artifact");
  if (
    typeof manualArtifact.artifactId !== "string" || !ID_PATTERN.test(manualArtifact.artifactId) ||
    manualArtifact.format !== "embedded-manual-review-session-v1" ||
    manualArtifact.sha256 !== manualSessionSha256(session)
  ) {
    fail("manual review embedded artifact digest or identity is invalid");
  }
  return wrapper as unknown as ManualReviewWrapper;
}

function evaluateDeterministicGlobalDomains(
  counters: Map<RunnerAssertionId, MutableCounter>,
  inputs: RunnerEvaluatorInputs,
): void {
  evaluateInputClosure(counters);
  evaluatePauseClosure(counters);
  evaluateSimultaneousPermutationClosure(counters, inputs.fixture);
  evaluateSemanticClosure(counters, inputs);
}

export function evaluateDeterministicGlobalRunnerAssertions(
  inputs: RunnerEvaluatorInputs,
): readonly RunnerAssertionCounter[] {
  const counters = newCounterMap();
  evaluateDeterministicGlobalDomains(counters, inputs);
  return freezeCounters(counters);
}

export function evaluateGlobalRunnerAssertions(
  inputs: RunnerEvaluatorInputs,
  browserArtifact: RunnerBrowserMatrixArtifact,
): readonly RunnerAssertionCounter[] {
  const counters = newCounterMap();
  evaluateDeterministicGlobalDomains(counters, inputs);
  const validatedBrowser = validateRunnerBrowserMatrixArtifact(
    browserArtifact,
    inputs.fixture,
    inputs.evaluatedSourceSha256,
  );
  for (const cell of validatedBrowser.artifact.cells) {
    recordAssertionCheck(
      counters,
      "runner-accessibility-browser-matrix-v1",
      true,
      String(cell.cellId),
      "browser matrix measurement did not satisfy its threshold",
    );
  }
  return freezeCounters(counters);
}

function validateCounterClosure(
  counters: readonly RunnerAssertionCounter[],
  label: string,
): void {
  if (!Array.isArray(counters) || counters.length !== RUNNER_ASSERTION_IDS.length) {
    fail(`${label} does not contain exactly 23 assertion counters`);
  }
  for (const [index, expectedId] of RUNNER_ASSERTION_IDS.entries()) {
    const counter = counters[index];
    if (counter === undefined) fail(`${label}/${expectedId} counter is absent`);
    const rawCounter: unknown = counter;
    assertExactKeys(
      rawCounter,
      ["assertionId", "checked", "failureCount", "failureWitnesses"],
      `${label}/${expectedId}`,
    );
    if (
      counter.assertionId !== expectedId ||
      !Number.isInteger(counter.checked) || counter.checked < 0 ||
      !Number.isInteger(counter.failureCount) || counter.failureCount < 0 ||
      counter.failureCount > counter.checked ||
      !Array.isArray(counter.failureWitnesses) ||
      counter.failureWitnesses.length > MAX_FAILURE_WITNESSES
    ) {
      fail(`${label}/${expectedId} counter is malformed`);
    }
    const canonicalWitnesses = [...counter.failureWitnesses]
      .sort((left, right) =>
        left.witnessId.localeCompare(right.witnessId) || left.message.localeCompare(right.message));
    for (const witness of counter.failureWitnesses) {
      const rawWitness: unknown = witness;
      assertExactKeys(rawWitness, ["witnessId", "message"], `${label}/${expectedId} failure witness`);
      if (typeof witness.witnessId !== "string" || typeof witness.message !== "string") {
        fail(`${label}/${expectedId} failure witness is malformed`);
      }
    }
    if (canonical(counter.failureWitnesses) !== canonical(canonicalWitnesses)) {
      fail(`${label}/${expectedId} failure witnesses are not canonical`);
    }
    if (counter.failureCount === 0 && counter.failureWitnesses.length !== 0) {
      fail(`${label}/${expectedId} has witnesses without failures`);
    }
    if (counter.failureCount > 0 && counter.failureWitnesses.length === 0) {
      fail(`${label}/${expectedId} has failures without a witness`);
    }
  }
}

export function validateRunnerLaboratoryShardRecord(
  shard: RunnerLaboratoryShardRecord,
  evaluatedSourceDigest: string,
): void {
  assertExactKeys(shard, [
    "schemaVersion", "evaluatorId", "evaluatedSourceSha256", "shardIndex",
    "shardCount", "seedStart", "seedEndInclusive", "seedStep",
    "assertionCounters", "seedDigests",
  ], `shard ${shard?.shardIndex}`);
  if (
    shard.schemaVersion !== RUNNER_LABORATORY_SHARD_SCHEMA_VERSION ||
    shard.evaluatorId !== RUNNER_LABORATORY_EVALUATOR_ID ||
    shard.evaluatedSourceSha256 !== evaluatedSourceDigest ||
    !Number.isInteger(shard.shardCount) || shard.shardCount <= 0 ||
    !Number.isInteger(shard.shardIndex) || shard.shardIndex < 0 || shard.shardIndex >= shard.shardCount ||
    !Number.isInteger(shard.seedStart) || !Number.isInteger(shard.seedEndInclusive) ||
    !Number.isInteger(shard.seedStep) || shard.seedStep <= 0
  ) {
    fail(`shard ${shard?.shardIndex} identity, source, or topology is malformed`);
  }
  validateCounterClosure(shard.assertionCounters, `shard ${shard.shardIndex}`);
  if (!Array.isArray(shard.seedDigests)) fail(`shard ${shard.shardIndex} seed digests are absent`);
  const ordered = [...shard.seedDigests].sort((left, right) => left.seed - right.seed);
  if (canonical(ordered) !== canonical(shard.seedDigests)) {
    fail(`shard ${shard.shardIndex} seed digests are not canonical`);
  }
  for (const digest of shard.seedDigests) {
    const rawDigest: unknown = digest;
    assertExactKeys(rawDigest, ["seed", "sha256"], `shard ${shard.shardIndex} seed digest`);
    if (!Number.isInteger(digest.seed) || !SHA256_PATTERN.test(digest.sha256)) {
      fail(`shard ${shard.shardIndex} contains a malformed seed digest`);
    }
  }
}

export interface AggregateOptions {
  readonly seedStart: number;
  readonly seedEndInclusive: number;
  readonly seedStep: number;
}

export function aggregateRunnerShardRecords(
  shards: readonly RunnerLaboratoryShardRecord[],
  globalCounters: readonly RunnerAssertionCounter[],
  assertionSpecs: readonly RunnerAssertionSpec[],
  evaluatedSourceDigest: string,
  options: AggregateOptions,
): RunnerCanonicalAggregate {
  if (!Array.isArray(shards) || shards.length === 0) fail("no evaluator shards were supplied");
  if (!SHA256_PATTERN.test(evaluatedSourceDigest)) fail("aggregate source digest is malformed");
  validateCounterClosure(globalCounters, "global assertions");
  const shardCount = shards[0]!.shardCount;
  if (shards.length !== shardCount) fail("shard set is incomplete");
  for (const shard of shards) {
    validateRunnerLaboratoryShardRecord(shard, evaluatedSourceDigest);
  }
  const indices = [...shards].map(({ shardIndex }) => shardIndex).sort((left, right) => left - right);
  if (!exactArray(indices, Array.from({ length: shardCount }, (_, index) => index))) {
    fail("shard index closure is incomplete or duplicated");
  }
  if (shards.some((shard) =>
    shard.shardCount !== shardCount ||
    shard.seedStart !== options.seedStart ||
    shard.seedEndInclusive !== options.seedEndInclusive ||
    shard.seedStep !== options.seedStep)) {
    fail("shards disagree about their topology or seed domain");
  }

  const expectedSeeds: number[] = [];
  for (let seed = options.seedStart; seed <= options.seedEndInclusive; seed += options.seedStep) {
    expectedSeeds.push(seed);
  }
  const seedDigests = shards.flatMap(({ seedDigests: values }) => values)
    .sort((left, right) => left.seed - right.seed);
  if (!exactArray(seedDigests.map(({ seed }) => seed), expectedSeeds)) {
    fail("seed digest closure is missing, duplicated, or unexpected");
  }

  const merged = newCounterMap();
  for (const target of merged.values()) {
    target.checked = 0;
    target.failureCount = 0;
    target.failureWitnesses.length = 0;
  }
  const sources = [...shards.map(({ assertionCounters }) => assertionCounters), globalCounters];
  for (const source of sources) {
    for (const counter of source) {
      const target = merged.get(counter.assertionId)!;
      target.checked += counter.checked;
      target.failureCount += counter.failureCount;
      target.failureWitnesses.push(...counter.failureWitnesses);
      target.failureWitnesses.sort((left, right) =>
        left.witnessId.localeCompare(right.witnessId) || left.message.localeCompare(right.message));
      if (target.failureWitnesses.length > MAX_FAILURE_WITNESSES) {
        target.failureWitnesses.length = MAX_FAILURE_WITNESSES;
      }
    }
  }
  const mergedCounters = freezeCounters(merged);
  if (assertionSpecs.length !== RUNNER_ASSERTION_IDS.length) {
    fail("aggregate assertion specification closure is not exactly 23");
  }
  for (const [index, spec] of assertionSpecs.entries()) {
    if (spec.assertionId !== RUNNER_ASSERTION_IDS[index]) {
      fail("aggregate assertion specification order differs from the fixture");
    }
    const counter = mergedCounters[index]!;
    if (counter.checked !== spec.population) {
      fail(`${spec.assertionId} population ${counter.checked} differs from locked ${spec.population}`);
    }
    if (counter.failureCount !== 0) {
      const first = counter.failureWitnesses[0];
      fail(`${spec.assertionId} failed ${counter.failureCount} checks${first ? `; ${first.witnessId}: ${first.message}` : ""}`);
    }
  }
  return deepFreeze({
    evaluatedSourceSha256: evaluatedSourceDigest,
    assertionCounters: mergedCounters,
    seedDigests,
    populationSha256: sha256(canonical({
      evaluatedSourceSha256: evaluatedSourceDigest,
      assertionCounters: mergedCounters,
      seedDigests,
    })),
  });
}

export interface BuiltEvidence {
  readonly runnerEvidence: any;
  readonly activeSuiteEvidence: any;
}

export function buildRunnerLaboratoryEvidence(
  inputs: RunnerEvaluatorInputs,
  aggregate: RunnerCanonicalAggregate,
  manualReviewWrapper: ManualReviewWrapper,
): BuiltEvidence {
  if (aggregate.evaluatedSourceSha256 !== inputs.evaluatedSourceSha256) {
    fail("aggregate was evaluated against a different source tree");
  }
  const byId = new Map(aggregate.assertionCounters.map((counter) => [counter.assertionId, counter]));
  const runnerEvidence = {
    schemaVersion: 1,
    fixtureId: inputs.fixture.fixtureId,
    contentLockId: inputs.fixture.contentLockId,
    evaluatedSourceSha256: inputs.evaluatedSourceSha256,
    evaluatorId: RUNNER_LABORATORY_EVALUATOR_ID,
    complete: true,
    manualReviewEvidence: manualReviewWrapper.manualReviewEvidence,
    assertionResults: inputs.assertionSpecs.map((spec) => {
      const counter = byId.get(spec.assertionId);
      if (counter === undefined || counter.checked !== spec.population || counter.failureCount !== 0) {
        fail(`cannot build evidence from incomplete assertion ${spec.assertionId}`);
      }
      return {
        assertionId: spec.assertionId,
        status: "complete",
        passed: true,
        population: counter.checked,
        failureCount: counter.failureCount,
        groupCounts: { ...spec.groupCounts },
      };
    }),
  };

  const suite = inputs.registry.evaluationSuites.find(({ id }: any) => id === "assist-parity-v1");
  if (suite === undefined) fail("active Assist parity suite is missing from the registry");
  const policyCellIds = [suite.manualPolicyId, suite.semanticAssistPolicyId, suite.automaticAssistPolicyId]
    .map((policyId) => `runner=${policyId}`);
  const pairedPopulation = inputs.fixture.assist.population.pairedEntryCount;
  const runCount = pairedPopulation * policyCellIds.length * inputs.contentLock.content.contextIds.length;
  const activeAssertionResults = suite.assertionIds.map((assertionId: RunnerAssertionId) => {
    const counter = byId.get(assertionId);
    if (counter === undefined || counter.checked !== pairedPopulation || counter.failureCount !== 0) {
      fail(`active Assist projection is incomplete: ${assertionId}`);
    }
    return {
      assertionId,
      status: "complete",
      passed: true,
      runCount,
    };
  });
  const reports = [{
    suiteId: suite.id,
    status: "complete",
    seedSetId: inputs.registry.seedSet.id,
    seedCount: inputs.registry.seedSet.count,
    profileIds: inputs.registry.startingProfiles.map(({ id }: any) => id),
    difficulties: [...inputs.registry.difficulties],
    contextIds: [...inputs.contentLock.content.contextIds],
    policyCellIds,
    runCount,
    assertionResults: activeAssertionResults,
  }];
  validateActiveSuiteExecution(inputs.contentLock, inputs.registry, reports);
  const activeSuiteEvidence = {
    schemaVersion: 1,
    lockId: inputs.contentLock.lockId,
    evaluationBatchId: `runner-evaluation-${inputs.evaluatedSourceSha256.slice(0, 16)}-v1`,
    evaluatedSourceSha256: inputs.evaluatedSourceSha256,
    reports,
  };
  validateRunnerEvidence(
    inputs.fixture,
    runnerEvidence,
    inputs.evaluatedSourceSha256,
  );
  return deepFreeze({ runnerEvidence, activeSuiteEvidence });
}

export function canonicalEvidenceBytes(value: unknown): string {
  return `${canonical(value)}\n`;
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function assertShardDirectoryOutsideEvaluatedSource(
  root: string,
  shardDirectory: string,
): void {
  const resolvedRoot = path.resolve(root);
  const resolvedShard = path.resolve(shardDirectory);
  if (resolvedRoot === resolvedShard || isPathInside(resolvedRoot, resolvedShard)) {
    fail("temporary shard directory must be outside the evaluated source tree");
  }
}

export async function atomicWriteCanonicalJson(
  destination: string,
  value: unknown,
): Promise<void> {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporary, canonicalEvidenceBytes(value), { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export interface CanonicalEvidencePublicationOptions {
  /** Test-only failure seam used to prove rollback after the first publish. */
  readonly failAfterFirstPublish?: boolean;
  /**
   * Revalidates the pinned source/provenance at every transactional boundary.
   * A handled rejection after either rename enters the same rollback path as
   * an I/O failure. The two destination renames are not crash-atomic: an
   * abnormal process or host termination between them can leave mixed
   * generations, which downstream pair/provenance validation must reject.
   */
  readonly assertCurrent?: () => void | Promise<void>;
}

export async function publishCanonicalEvidencePair(
  outputs: readonly [
    readonly [filePath: string, value: unknown],
    readonly [filePath: string, value: unknown],
  ],
  options: CanonicalEvidencePublicationOptions = {},
): Promise<void> {
  await options.assertCurrent?.();
  const ordered = [...outputs]
    .map(([filePath, value]) => ({
      filePath: path.resolve(filePath),
      bytes: canonicalEvidenceBytes(value),
    }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
  if (ordered[0]!.filePath === ordered[1]!.filePath) {
    fail("evidence pair destinations must be distinct");
  }
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const staged: Array<(typeof ordered)[number] & {
    stagedPath: string;
    priorBytes: string | null;
  }> = [];
  try {
    for (const [index, item] of ordered.entries()) {
      await mkdir(path.dirname(item.filePath), { recursive: true });
      const priorBytes = await readFile(item.filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      const stagedPath = path.join(
        path.dirname(item.filePath),
        `.${path.basename(item.filePath)}.${token}.${index}.stage`,
      );
      await writeFile(stagedPath, item.bytes, { encoding: "utf8", flag: "wx" });
      staged.push({ ...item, stagedPath, priorBytes });
    }
  } catch (error) {
    await Promise.all(staged.map(({ stagedPath }) => rm(stagedPath, { force: true })));
    throw error;
  }
  const published: typeof staged = [];
  try {
    await options.assertCurrent?.();
    for (const item of staged) {
      await options.assertCurrent?.();
      await rename(item.stagedPath, item.filePath);
      published.push(item);
      if (options.failAfterFirstPublish === true && published.length === 1) {
        throw new Error("injected evidence publication failure");
      }
      await options.assertCurrent?.();
    }
  } catch (error) {
    for (const item of [...published].reverse()) {
      if (item.priorBytes === null) {
        await rm(item.filePath, { force: true });
      } else {
        const rollbackPath = `${item.stagedPath}.rollback`;
        await writeFile(rollbackPath, item.priorBytes, { encoding: "utf8", flag: "wx" });
        await rename(rollbackPath, item.filePath);
      }
    }
    throw error;
  } finally {
    await Promise.all(staged.map(({ stagedPath }) =>
      rm(stagedPath, { force: true })));
  }
}

export async function readRunnerShardRecord(filePath: string): Promise<RunnerLaboratoryShardRecord> {
  const sourceStat = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail(`shard artifact is missing: ${filePath}`);
    throw error;
  });
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    fail(`shard artifact must be a regular non-symlink file: ${filePath}`);
  }
  return parseRunnerShardRecordBytes(
    await readFile(filePath),
    filePath,
  );
}

export function parseRunnerShardRecordBytes(
  bytes: string | Buffer,
  label = "runner shard artifact",
): RunnerLaboratoryShardRecord {
  const text = typeof bytes === "string" ? bytes : bytes.toString("utf8");
  const value = JSON.parse(text) as RunnerLaboratoryShardRecord;
  if (text !== canonicalEvidenceBytes(value)) {
    fail(`shard artifact is not canonical JSON: ${label}`);
  }
  return deepFreeze(value);
}

export type EvidenceMode = "generate" | "validate";

export interface AggregateEvidenceOptions {
  /** Immutable capsule root used by every evaluator/browser input read. */
  readonly root: string;
  /** Live checkout that owns committed evidence and must still match the pin. */
  readonly publicationRoot: string;
  readonly expectedEvaluatedSourceSha256: string;
  readonly previewProvenance: RunnerPreviewProvenance;
  readonly mode: EvidenceMode;
  readonly shardPaths?: readonly string[];
  /** Immutable single-read records used by the distributed artifact loader. */
  readonly shardRecords?: readonly RunnerLaboratoryShardRecord[];
  readonly browserBaseUrl: string;
  readonly manualReviewWrapperPath?: string;
  readonly runnerEvidencePath?: string;
  readonly activeSuiteEvidencePath?: string;
}

export async function aggregateRunnerLaboratoryEvidence(
  options: AggregateEvidenceOptions,
): Promise<BuiltEvidence & { readonly aggregate: RunnerCanonicalAggregate }> {
  const publicationRoot = path.resolve(options.publicationRoot);
  const expectedSourceSha256 = options.expectedEvaluatedSourceSha256;
  const previewProvenance = validateRunnerPreviewProvenance(options.previewProvenance);
  if (
    previewProvenance.evaluatedSourceSha256 !== expectedSourceSha256 ||
    !/^[0-9a-f]{64}$/.test(expectedSourceSha256)
  ) {
    fail("managed preview provenance is not bound to the explicit evaluated-source pin");
  }
  const inputs = await loadRunnerEvaluatorInputs(options.root);
  if (inputs.evaluatedSourceSha256 !== expectedSourceSha256) {
    fail("aggregate inputs differ from the explicit evaluated-source pin");
  }
  const assertManagedRunCurrent = async (): Promise<void> => {
    const [
      evaluationDigest,
      publicationDigest,
      evaluationBuildInputsDigest,
      publicationBuildInputsDigest,
      response,
    ] = await Promise.all([
      evaluationSourceSha256(options.root),
      evaluationSourceSha256(publicationRoot),
      runnerBuildInputsSha256(options.root),
      runnerBuildInputsSha256(publicationRoot),
      fetch(new URL(PREVIEW_PROVENANCE_PATH, options.browserBaseUrl), {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      }),
    ]);
    if (evaluationDigest !== expectedSourceSha256) {
      fail("immutable evaluation capsule changed during aggregation");
    }
    if (publicationDigest !== expectedSourceSha256) {
      fail("live evaluated source changed during aggregation");
    }
    if (
      evaluationBuildInputsDigest !== previewProvenance.buildInputsSha256 ||
      publicationBuildInputsDigest !== previewProvenance.buildInputsSha256
    ) {
      fail("production build inputs changed during aggregation");
    }
    if (!response.ok || await response.text() !== runnerPreviewProvenanceBytes(previewProvenance)) {
      fail("managed preview no longer serves the pinned source/dist provenance");
    }
  };
  await assertManagedRunCurrent();
  const hasShardPaths = options.shardPaths !== undefined;
  const hasShardRecords = options.shardRecords !== undefined;
  if (hasShardPaths === hasShardRecords) {
    fail("aggregate requires exactly one shard input form");
  }
  if (options.shardPaths !== undefined) {
    if (options.shardPaths.length === 0) fail("aggregate requires at least one shard path");
    for (const shardPath of options.shardPaths) {
      assertShardDirectoryOutsideEvaluatedSource(options.root, path.dirname(shardPath));
      assertShardDirectoryOutsideEvaluatedSource(publicationRoot, path.dirname(shardPath));
    }
  } else if (options.shardRecords!.length === 0) {
    fail("aggregate requires at least one immutable shard record");
  }
  const runnerEvidencePath = options.runnerEvidencePath ?? path.join(
    publicationRoot, "docs", "balance", "runner-evaluation-results", `${inputs.fixture.fixtureId}.json`,
  );
  const activeSuiteEvidencePath = options.activeSuiteEvidencePath ?? path.join(
    publicationRoot, "docs", "balance", "evaluation-results", `${inputs.contentLock.lockId}.json`,
  );
  if (options.mode === "generate" && options.manualReviewWrapperPath === undefined) {
    fail("generate mode requires an external temporary manual-review wrapper");
  }
  if (options.manualReviewWrapperPath !== undefined) {
    assertShardDirectoryOutsideEvaluatedSource(
      options.root,
      path.dirname(options.manualReviewWrapperPath),
    );
    assertShardDirectoryOutsideEvaluatedSource(
      publicationRoot,
      path.dirname(options.manualReviewWrapperPath),
    );
  }
  const manualReviewPromise = options.manualReviewWrapperPath !== undefined
    ? readFile(options.manualReviewWrapperPath, "utf8").then(JSON.parse)
    : readFile(runnerEvidencePath, "utf8").then((text) => {
        const committed = JSON.parse(text);
        return {
          schemaVersion: 1,
          artifactId: RUNNER_LABORATORY_MANUAL_WRAPPER_ID,
          evaluatedSourceSha256: inputs.evaluatedSourceSha256,
          manualReviewEvidence: committed.manualReviewEvidence,
        };
      });
  const browserTemporaryDirectory = await mkdtemp(path.join(tmpdir(), "runner-browser-matrix-"));
  try {
    const browserArtifactPath = path.join(browserTemporaryDirectory, "matrix.json");
    const [shards, browserArtifact, manualRaw] = await Promise.all([
      options.shardRecords === undefined
        ? Promise.all(options.shardPaths!.map(readRunnerShardRecord))
        : Promise.resolve(options.shardRecords),
      executeRunnerBrowserMatrix({
        root: options.root,
        baseUrl: options.browserBaseUrl,
        evaluatedSourceSha256: inputs.evaluatedSourceSha256,
        managedLocalPreview: true,
        outputPath: browserArtifactPath,
      }),
      manualReviewPromise,
    ]).catch((error) => {
      fail(`required shard/browser/manual artifact is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });
    await assertManagedRunCurrent();
    const browserArtifactValidation = validateRunnerBrowserMatrixArtifact(
      browserArtifact,
      inputs.fixture,
      inputs.evaluatedSourceSha256,
    );
    const manualReviewWrapper = validateManualReviewWrapper(
      manualRaw,
      inputs.evaluatedSourceSha256,
    );
    const globalCounters = evaluateGlobalRunnerAssertions(
      inputs,
      browserArtifactValidation.artifact,
    );
    const aggregate = aggregateRunnerShardRecords(
      shards,
      globalCounters,
      inputs.assertionSpecs,
      inputs.evaluatedSourceSha256,
      {
        seedStart: inputs.fixture.population.start,
        seedEndInclusive: inputs.fixture.population.endInclusive,
        seedStep: inputs.fixture.population.step,
      },
    );
    const evidence = buildRunnerLaboratoryEvidence(inputs, aggregate, manualReviewWrapper);
    const outputs = [
      [runnerEvidencePath, evidence.runnerEvidence],
      [activeSuiteEvidencePath, evidence.activeSuiteEvidence],
    ] as const;
    if (options.mode === "validate") {
      for (const [filePath, value] of outputs) {
        await assertManagedRunCurrent();
        const committed = await readFile(filePath, "utf8").catch((error) => {
          fail(`committed canonical evidence is missing: ${error instanceof Error ? error.message : String(error)}`);
        });
        if (committed !== canonicalEvidenceBytes(value)) {
          fail(`committed evidence bytes differ from recomputation: ${filePath}`);
        }
        await assertManagedRunCurrent();
      }
    } else if (options.mode === "generate") {
      // Every check, fixture validator, artifact validator, and evidence validator
      // has completed before either destination is touched.
      await publishCanonicalEvidencePair(outputs, {
        assertCurrent: assertManagedRunCurrent,
      });
    } else {
      fail(`unsupported evidence mode: ${String(options.mode)}`);
    }
    // Generate mode already performs its final guard inside the publication
    // transaction, where a failure can still roll both destinations back.
    // A second guard after that transaction would be unable to roll back and
    // would turn an ordinary subsequent source edit into a partial failure.
    if (options.mode === "validate") await assertManagedRunCurrent();
    return deepFreeze({ ...evidence, aggregate });
  } finally {
    await rm(browserTemporaryDirectory, { recursive: true, force: true });
  }
}
