import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRunnerLaboratoryEntryState } from "../src/choice-of-life/core/runner/contract";
import { generateRunnerLaboratoryCourse } from "../src/choice-of-life/core/runner/course-generator";
import {
  createRunnerModeEvaluationSupport,
  evaluateRunnerAuthenticatedModeProjection,
  evaluateRunnerForcedContinuation,
  evaluateRunnerNeutralReplay,
  type RunnerNeutralReplayTape,
} from "../src/choice-of-life/core/runner/evaluation-replay";

import {
  RUNNER_ASSERTION_FAMILIES,
  RUNNER_ASSERTION_IDS,
  RUNNER_LABORATORY_EVALUATOR_ID,
  RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
  RUNNER_SEMANTIC_PRESENTATION_CASE_POPULATION,
  aggregateRunnerShardRecords,
  atomicWriteCanonicalJson,
  canonicalEvidenceBytes,
  evaluateDeterministicGlobalRunnerAssertions,
  evaluateRunnerPausePowerSet,
  evaluateRunnerLaboratoryShard,
  forcedContinuationGameplayProjection,
  loadRunnerEvaluatorInputs,
  manualSessionSha256,
  publishCanonicalEvidencePair,
  validatesRunnerContactIdempotency,
  validatesModalityIdentity,
  validatesForcedContinuationGameplayIdentity,
  validatesReplayCodecCertificateForTest,
  validatesRunnerPauseCodecOccurrence,
  validatesRunnerSemanticPresentationWitness,
  validateManualReviewWrapper,
  type RunnerAssertionCounter,
  type RunnerAssertionSpec,
  type RunnerLaboratoryShardRecord,
} from "./runner-laboratory-evaluator";
import {
  createFixedStepDriver,
  RUNTIME_PAUSE_REASON_ORDER,
  type FixedStepDriver,
} from "../src/choice-of-life/platform/fixed-step-driver";
import { awaitRunnerShardCompletions } from "./runner-laboratory-evaluator-cli";

const ROOT = path.resolve(import.meta.dirname, "..");

function counters(checked: number): readonly RunnerAssertionCounter[] {
  return RUNNER_ASSERTION_IDS.map((assertionId) => ({
    assertionId,
    checked,
    failureCount: 0,
    failureWitnesses: [],
  }));
}

function specsFromCounters(
  values: readonly RunnerAssertionCounter[],
): readonly RunnerAssertionSpec[] {
  return values.map(({ assertionId, checked }) => ({
    assertionId,
    population: checked,
    groupCounts: {},
  }));
}

describe("runner laboratory evaluator", () => {
  it("rejects impossible and future manual-review instants before attestation hashing", () => {
    const wrapper = (completedAtUtc: string) => ({
      schemaVersion: 1,
      artifactId: "runner-accessibility-manual-review-wrapper-v1",
      evaluatedSourceSha256: "a".repeat(64),
      manualReviewEvidence: {
        assertionId: "runner-accessibility-browser-matrix-v1",
        status: "complete",
        session: {
          sessionId: "runner-accessibility-manual-review-session-v1",
          reviewerId: "reviewer-accessibility-v1",
          reviewerAttestation: true,
          keyboardOnlyPassed: true,
          keyboardInspectionPassed: true,
          screenReader: "NVDA",
          screenReaderVersion: "2026.1",
          platform: "Windows",
          browser: "Edge",
          browserVersion: "151",
          completedAtUtc,
          evaluatedSourceSha256: "a".repeat(64),
          focusTransitionCount: 10,
          announcementWitnessCount: 9,
          semanticStructurePassed: true,
          semanticDecisionPromptPassed: true,
          nonvisualSemanticCompletionPassed: true,
          forcedColorsInspectionPassed: true,
          completionPathPassed: true,
        },
        artifact: {
          artifactId: "runner-accessibility-manual-review-evidence-v1",
          format: "embedded-manual-review-session-v1",
          sha256: "b".repeat(64),
        },
      },
    });
    expect(() => validateManualReviewWrapper(
      wrapper("2026-02-30T00:00:00Z"),
      "a".repeat(64),
    )).toThrow(/metadata/);
    expect(() => validateManualReviewWrapper(
      wrapper("2999-01-01T00:00:00Z"),
      "a".repeat(64),
    )).toThrow(/metadata/);
  });

  it("binds the hashed manual-review session to the evaluated source", () => {
    const originalSource = "a".repeat(64);
    const currentSource = "c".repeat(64);
    const session = {
      sessionId: "runner-accessibility-manual-review-session-v1",
      reviewerId: "reviewer-accessibility-v1",
      reviewerAttestation: true,
      keyboardOnlyPassed: true,
      keyboardInspectionPassed: true,
      screenReader: "NVDA",
      screenReaderVersion: "2026.1",
      platform: "Windows",
      browser: "Edge",
      browserVersion: "151",
      completedAtUtc: "2026-08-04T00:00:00Z",
      evaluatedSourceSha256: originalSource,
      focusTransitionCount: 10,
      announcementWitnessCount: 9,
      semanticStructurePassed: true,
      semanticDecisionPromptPassed: true,
      nonvisualSemanticCompletionPassed: true,
      forcedColorsInspectionPassed: true,
      completionPathPassed: true,
    };
    const wrapper = {
      schemaVersion: 1,
      artifactId: "runner-accessibility-manual-review-wrapper-v1",
      evaluatedSourceSha256: originalSource,
      manualReviewEvidence: {
        assertionId: "runner-accessibility-browser-matrix-v1",
        status: "complete",
        session,
        artifact: {
          artifactId: "runner-accessibility-manual-review-evidence-v1",
          format: "embedded-manual-review-session-v1",
          sha256: manualSessionSha256(session),
        },
      },
    };
    expect(() => validateManualReviewWrapper(wrapper, originalSource)).not.toThrow();

    const transplanted = structuredClone(wrapper);
    transplanted.evaluatedSourceSha256 = currentSource;
    expect(() => validateManualReviewWrapper(transplanted, currentSource))
      .toThrow(/session source binding/);

    const reboundWithoutReattestation = structuredClone(wrapper);
    reboundWithoutReattestation.evaluatedSourceSha256 = currentSource;
    reboundWithoutReattestation.manualReviewEvidence.session.evaluatedSourceSha256 = currentSource;
    expect(() => validateManualReviewWrapper(reboundWithoutReattestation, currentSource))
      .toThrow(/embedded artifact digest/);

    const missingSessionBinding = structuredClone(wrapper) as any;
    delete missingSessionBinding.manualReviewEvidence.session.evaluatedSourceSha256;
    expect(() => validateManualReviewWrapper(missingSessionBinding, originalSource))
      .toThrow(/session keys differ/);
  });

  it("fails a shard set immediately when any worker exits unsuccessfully", async () => {
    const neverCompletes = new Promise<never>(() => undefined);
    await expect(awaitRunnerShardCompletions([
      Promise.resolve({ exitCode: 7, stdout: "", stderr: "bad shard" }),
      neverCompletes,
    ])).rejects.toThrow(/shard 0 exited 7: bad shard/);
  });

  it("evaluates the exact five-reason pause power set and rejects all-clear coupling", () => {
    const exact = evaluateRunnerPausePowerSet();
    expect(exact).toHaveLength(32);
    expect(exact.map(({ subsetKey }) => subsetKey)).toHaveLength(
      new Set(exact.map(({ subsetKey }) => subsetKey)).size,
    );
    expect(exact.every(({ passed }) => passed)).toBe(true);
    expect(exact.some(({ subsetKey }) => subsetKey === "semantic")).toBe(true);
    expect(exact.some(({ subsetKey }) =>
      subsetKey === RUNTIME_PAUSE_REASON_ORDER.join("+"))).toBe(true);
    let pauseRoundTrips = 0;
    let resumeRoundTrips = 0;
    for (const result of exact) {
      const activeReasons = result.subsetKey === "none"
        ? []
        : result.subsetKey.split("+");
      const expectedPerActiveReason = activeReasons.length === 0
        ? 0
        : Array.from(
            { length: activeReasons.length },
            (_, index) => index + 1,
          ).reduce((product, factor) => product * factor, 1);
      for (const reason of RUNTIME_PAUSE_REASON_ORDER) {
        const expected = activeReasons.includes(reason)
          ? expectedPerActiveReason
          : 0;
        expect(result.saveRoundTripOccurrenceCounts.pause[reason]).toBe(expected);
        expect(result.saveRoundTripOccurrenceCounts.resume[reason]).toBe(expected);
        pauseRoundTrips += result.saveRoundTripOccurrenceCounts.pause[reason];
        resumeRoundTrips += result.saveRoundTripOccurrenceCounts.resume[reason];
      }
    }
    expect(pauseRoundTrips).toBe(1_305);
    expect(resumeRoundTrips).toBe(1_305);

    const pausedEntry = createRunnerLaboratoryEntryState(
      "0000000000000000",
      {
        startingProfileId: "steady-mix-v1",
        difficulty: "story",
        controlMode: "manual",
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
      },
    );
    expect(validatesRunnerPauseCodecOccurrence(pausedEntry)).toBe(true);
    expect(validatesRunnerPauseCodecOccurrence(pausedEntry, (encoded) => {
      const mutant = JSON.parse(encoded) as {
        appearance: { hairColorId: string };
      };
      mutant.appearance.hairColorId = "silver";
      return JSON.stringify(mutant);
    })).toBe(false);

    const allClearMutant = (): FixedStepDriver => {
      const driver = createFixedStepDriver();
      return {
        advanceFrame: (timestamp) => driver.advanceFrame(timestamp),
        setPauseReason(reason, active) {
          if (active) {
            driver.setPauseReason(reason, true);
            return;
          }
          for (const candidate of RUNTIME_PAUSE_REASON_ORDER) {
            driver.setPauseReason(candidate, false);
          }
        },
        activePauseReasons: () => driver.activePauseReasons(),
        isPaused: () => driver.isPaused(),
        reset: () => driver.reset(),
      };
    };
    expect(evaluateRunnerPausePowerSet(allClearMutant).some(({ passed }) =>
      !passed)).toBe(true);
  });

  it("fails closed for adapter direction and timing mutants after production application", () => {
    const entry = createRunnerLaboratoryEntryState("0000000000000000", {
      startingProfileId: "steady-mix-v1",
      difficulty: "story",
      controlMode: "manual",
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
    });
    const tape = evaluateRunnerNeutralReplay(entry);
    const expected = evaluateRunnerAuthenticatedModeProjection(entry, tape);
    expect(validatesModalityIdentity(tape, entry, expected)).toBe(true);
    expect(validatesModalityIdentity(
      tape,
      entry,
      expected,
      (modality, commands) => modality !== "keyboard" || commands.length === 0
        ? commands
        : [{
            ...commands[0]!,
            intent: commands[0]!.intent === "up" ? "down" : "up",
          }, ...commands.slice(1)],
    )).toBe(false);
    expect(validatesModalityIdentity(
      tape,
      entry,
      expected,
      (modality, commands) => modality !== "button" || commands.length === 0
        ? commands
        : [{
            ...commands[0]!,
            simulationTick: commands[0]!.simulationTick + 1,
          }, ...commands.slice(1)],
    )).toBe(false);
  });

  it("rejects omitted and changed wire pairs through the evaluator replay gate", () => {
    const tape = evaluateRunnerNeutralReplay(createRunnerLaboratoryEntryState(
      "0000000000000000",
      {
        startingProfileId: "steady-mix-v1",
        difficulty: "story",
        controlMode: "manual",
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
      },
    ));
    expect(validatesReplayCodecCertificateForTest(tape)).toBe(true);
    expect(validatesReplayCodecCertificateForTest(
      tape,
      (pairs) => pairs.slice(1),
    )).toBe(false);
    expect(validatesReplayCodecCertificateForTest(
      tape,
      (pairs) => pairs.map((pair, index) => index === 17
        ? { ...pair, wireKey: "changedDurableKey" }
        : pair),
    )).toBe(false);
  }, 30_000);

  it("compares Semantic effect payloads without normalizing mode-owned ordinals", () => {
    const setup = {
      startingProfileId: "emotional-head-start-v1" as const,
      difficulty: "challenge" as const,
      controlMode: "manual" as const,
      identity: { gender: "female" as const },
      appearance: {
        heritageStyleId: "asian" as const,
        hairStyleId: "tied-back" as const,
        hairColorId: "dark-brown" as const,
        clothingPaletteId: "meadow" as const,
      },
      accessibility: {
        highContrast: false,
        reducedMotion: false,
        textScale: 100 as const,
        screenReaderAnnouncements: true,
      },
    };
    const manualEntry = createRunnerLaboratoryEntryState(
      "0000000000000001",
      setup,
    );
    const tape = evaluateRunnerNeutralReplay(manualEntry);
    const manual = evaluateRunnerAuthenticatedModeProjection(manualEntry, tape);
    const semantic = evaluateRunnerAuthenticatedModeProjection(
      createRunnerLaboratoryEntryState("0000000000000001", {
        ...setup,
        controlMode: "semantic-assist",
      }),
      tape,
    );
    expect(semantic.contacts.map(({ contact }) => contact)).toEqual(
      manual.contacts.map(({ contact }) => contact),
    );
    expect(semantic.effects.map(({ effect }) => effect)).toEqual(
      manual.effects.map(({ effect }) => effect),
    );
    expect(semantic.contacts.map(({ productionEventOrdinal }) =>
      productionEventOrdinal)).not.toEqual(
      manual.contacts.map(({ productionEventOrdinal }) =>
        productionEventOrdinal),
    );
  });

  it("renders the exact native Semantic projection and rejects DOM-content mutants", () => {
    expect(RUNNER_SEMANTIC_PRESENTATION_CASE_POPULATION).toBe(
      4 * 3 * 10 * 3 * 3,
    );
    const setup = {
      startingProfileId: "steady-mix-v1" as const,
      difficulty: "challenge" as const,
      controlMode: "manual" as const,
      identity: { gender: "female" as const },
      appearance: {
        heritageStyleId: "asian" as const,
        hairStyleId: "tied-back" as const,
        hairColorId: "dark-brown" as const,
        clothingPaletteId: "meadow" as const,
      },
      accessibility: {
        highContrast: false,
        reducedMotion: false,
        textScale: 100 as const,
        screenReaderAnnouncements: true,
      },
    };
    const manualEntry = createRunnerLaboratoryEntryState(
      "0000000000000001",
      setup,
    );
    const tape = evaluateRunnerNeutralReplay(manualEntry);
    const semanticEntry = createRunnerLaboratoryEntryState(
      "0000000000000001",
      { ...setup, controlMode: "semantic-assist" },
    );
    const manualSupport = createRunnerModeEvaluationSupport(manualEntry, tape);
    const support = createRunnerModeEvaluationSupport(semanticEntry, tape);
    const course = generateRunnerLaboratoryCourse(
      "0000000000000001",
      "challenge",
    );
    const patternIndex = course.patterns.findIndex(({ patternId }) =>
      patternId === "runner-lab-risk-reward-v1");
    expect(patternIndex).toBeGreaterThanOrEqual(0);
    const checkpoint = support.markerCheckpoints[patternIndex]!;

    expect(validatesRunnerSemanticPresentationWitness(
      checkpoint,
      course,
    )).toBe(true);
    expect(validatesRunnerSemanticPresentationWitness(
      checkpoint,
      course,
      ({ legend }) => {
        legend.textContent = "Hidden Semantic-only guidance";
      },
    )).toBe(false);
    expect(validatesRunnerSemanticPresentationWitness(
      checkpoint,
      course,
      ({ choices }) => {
        choices[0].button.setAttribute("aria-label", "Top lane");
      },
    )).toBe(false);
    expect(validatesRunnerSemanticPresentationWitness(
      checkpoint,
      course,
      ({ choices }) => {
        choices[1].button.textContent = "Middle lane";
      },
    )).toBe(false);

    const manualCheckpoint = manualSupport.markerCheckpoints[patternIndex]!;
    const forcedPatternIndex = patternIndex + 1;
    const semanticContinuation = evaluateRunnerForcedContinuation(
      checkpoint,
      forcedPatternIndex,
      2,
    );
    const manualContinuation = evaluateRunnerForcedContinuation(
      manualCheckpoint,
      forcedPatternIndex,
      2,
    );
    expect(forcedContinuationGameplayProjection(semanticContinuation)).toEqual(
      forcedContinuationGameplayProjection(manualContinuation),
    );
    expect(validatesForcedContinuationGameplayIdentity(
      semanticContinuation,
      manualContinuation,
    )).toBe(true);
    expect(validatesForcedContinuationGameplayIdentity(
      semanticContinuation,
      manualContinuation,
      (projection) => ({
        ...projection,
        tickProgression: {
          ...projection.tickProgression,
          ordinaryTickCount: projection.tickProgression.ordinaryTickCount + 1,
        },
      }),
    )).toBe(false);
    expect(validatesForcedContinuationGameplayIdentity(
      semanticContinuation,
      manualContinuation,
      (projection) => ({
        ...projection,
        tickProgression: {
          ...projection.tickProgression,
          gameplayHashDigest: "0".repeat(16),
        },
      }),
    )).toBe(false);
    expect(validatesForcedContinuationGameplayIdentity(
      semanticContinuation,
      manualContinuation,
      (projection) => ({
        ...projection,
        futureScoringEntityIds: projection.futureScoringEntityIds.slice(1),
      }),
    )).toBe(false);
    expect(validatesForcedContinuationGameplayIdentity(
      semanticContinuation,
      manualContinuation,
      (projection) => ({
        ...projection,
        terminalInputBuffer: "up",
      }),
    )).toBe(false);
  });

  it("rejects duplicate/contacted-pass/effect-ownership/tick-order mutants", () => {
    const entry = createRunnerLaboratoryEntryState("0000000000000000", {
      startingProfileId: "steady-mix-v1",
      difficulty: "story",
      controlMode: "manual",
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
    });
    const tape = evaluateRunnerNeutralReplay(entry);
    const course = generateRunnerLaboratoryCourse(entry.runSeed, entry.difficulty);
    expect(validatesRunnerContactIdempotency(tape, course)).toBe(true);
    const contact = tape.contacts[0];
    expect(contact).toBeDefined();
    const nextOrdinal = Math.max(
      ...tape.contacts.map(({ productionEventOrdinal }) => productionEventOrdinal),
      ...tape.passes.map(({ productionEventOrdinal }) => productionEventOrdinal),
    ) + 1;
    const duplicateContact = {
      ...tape,
      contacts: Object.freeze([
        ...tape.contacts,
        Object.freeze({ ...contact!, productionEventOrdinal: nextOrdinal }),
      ]),
    } as RunnerNeutralReplayTape;
    expect(validatesRunnerContactIdempotency(duplicateContact, course)).toBe(false);

    const contactedThenPassed = {
      ...tape,
      passes: Object.freeze([
        ...tape.passes,
        Object.freeze({
          productionEventOrdinal: nextOrdinal,
          simulationTick: contact!.contact.simulationTick,
          entityInstanceId: contact!.contact.entityInstanceId,
        }),
      ]),
    } as RunnerNeutralReplayTape;
    expect(validatesRunnerContactIdempotency(contactedThenPassed, course)).toBe(false);

    const exemplarEffect = tape.effects[0]?.effect;
    expect(exemplarEffect).toBeDefined();
    const orphanEffect = {
      ...tape,
      effects: Object.freeze(tape.effects.map((entry, index) => index === 0
        ? Object.freeze({
          productionEventOrdinal: entry.productionEventOrdinal,
          effect: Object.freeze({
            ...exemplarEffect!,
            requestedDelta: exemplarEffect!.requestedDelta + 1,
          }),
        })
        : entry)),
    } as RunnerNeutralReplayTape;
    expect(validatesRunnerContactIdempotency(orphanEffect, course)).toBe(false);

    const orderPair = tape.contacts.flatMap((contactEntry) =>
      tape.passes
        .filter((passEntry) =>
          passEntry.simulationTick !== contactEntry.contact.simulationTick)
        .map((passEntry) => ({ contactEntry, passEntry })))
      .find(({ contactEntry, passEntry }) => {
        const laterTickIsEarlierOrdinal =
          passEntry.simulationTick > contactEntry.contact.simulationTick
            ? passEntry.productionEventOrdinal < contactEntry.productionEventOrdinal
            : contactEntry.productionEventOrdinal < passEntry.productionEventOrdinal;
        return !laterTickIsEarlierOrdinal;
      });
    expect(orderPair).toBeDefined();
    const { contactEntry: orderedContact, passEntry: orderedPass } = orderPair!;
    const contactOrdinal = orderedContact.productionEventOrdinal;
    const passOrdinal = orderedPass.productionEventOrdinal;
    const interleavedTick = {
      ...tape,
      contacts: Object.freeze(tape.contacts.map((entry) =>
        entry === orderedContact
          ? Object.freeze({ ...entry, productionEventOrdinal: passOrdinal })
          : entry)),
      effects: Object.freeze(tape.effects.map((entry) =>
        entry.productionEventOrdinal === contactOrdinal
          ? Object.freeze({ ...entry, productionEventOrdinal: passOrdinal })
          : entry)),
      passes: Object.freeze(tape.passes.map((entry) =>
        entry === orderedPass
          ? Object.freeze({ ...entry, productionEventOrdinal: contactOrdinal })
          : entry)),
    } as RunnerNeutralReplayTape;
    expect(validatesRunnerContactIdempotency(interleavedTick, course)).toBe(false);
  });

  it("evaluates a bounded production seed without declarative pass flags", async () => {
    const inputs = await loadRunnerEvaluatorInputs(ROOT);
    const record = await evaluateRunnerLaboratoryShard({
      root: ROOT,
      inputs,
      shardIndex: 0,
      shardCount: 1,
      seedStart: 0,
      seedEndInclusive: 0,
      auxiliaryDomains: false,
    });
    expect(record.assertionCounters.map(({ assertionId }) => assertionId))
      .toEqual(RUNNER_ASSERTION_IDS);
    expect(record.assertionCounters.every(({ failureCount }) =>
      failureCount === 0)).toBe(true);
    expect(record.seedDigests).toHaveLength(1);
    expect(record.seedDigests[0]?.seed).toBe(0);
    expect(record.seedDigests[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const byId = new Map(record.assertionCounters.map((counter) =>
      [counter.assertionId, counter.checked]));
    expect(byId.get("runner-generation-determinism-v1")).toBe(9);
    expect(byId.get("runner-nondepletion-v1")).toBe(12);
    expect(byId.get("runner-reduced-motion-domain-identity-v1")).toBe(0);
  }, 30_000);

  it("closes the deterministic work and output for a representative 24-seed batch", async () => {
    const inputs = await loadRunnerEvaluatorInputs(ROOT);
    const record = await evaluateRunnerLaboratoryShard({
      root: ROOT,
      inputs,
      shardIndex: 0,
      shardCount: 1,
      seedStart: 0,
      seedEndInclusive: 23,
      auxiliaryDomains: false,
    });
    expect(record.seedDigests.map(({ seed }) => seed)).toEqual(
      Array.from({ length: 24 }, (_, seed) => seed),
    );
    expect(record.seedDigests.every(({ sha256 }) =>
      /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    expect(record.assertionCounters.every(({ failureCount }) =>
      failureCount === 0)).toBe(true);
  }, 360_000);

  it("produces the same canonical aggregate bytes for one and sixteen production shards", async () => {
    const inputs = await loadRunnerEvaluatorInputs(ROOT);
    const common = {
      root: ROOT,
      inputs,
      seedStart: 0,
      seedEndInclusive: 15,
      auxiliaryDomains: false,
    } as const;
    const [single, ...distributed] = await Promise.all([
      evaluateRunnerLaboratoryShard({ ...common, shardIndex: 0, shardCount: 1 }),
      ...Array.from({ length: 16 }, (_, shardIndex) =>
        evaluateRunnerLaboratoryShard({ ...common, shardIndex, shardCount: 16 })),
    ]);
    const global = counters(0);
    const specs = specsFromCounters(single.assertionCounters);
    const options = { seedStart: 0, seedEndInclusive: 15, seedStep: 1 };
    const one = aggregateRunnerShardRecords(
      [single], global, specs, inputs.evaluatedSourceSha256, options,
    );
    const sixteen = aggregateRunnerShardRecords(
      [...distributed].reverse(), global, specs, inputs.evaluatedSourceSha256, options,
    );
    expect(canonicalEvidenceBytes(sixteen)).toBe(canonicalEvidenceBytes(one));
  }, 360_000);

  it("fails closed for a negative witness in every assertion family", async () => {
    const inputs = await loadRunnerEvaluatorInputs(ROOT);
    const passingCounters = counters(1);
    const baseShard: RunnerLaboratoryShardRecord = {
      schemaVersion: RUNNER_LABORATORY_SHARD_SCHEMA_VERSION,
      evaluatorId: RUNNER_LABORATORY_EVALUATOR_ID,
      evaluatedSourceSha256: inputs.evaluatedSourceSha256,
      shardIndex: 0,
      shardCount: 1,
      seedStart: 0,
      seedEndInclusive: 0,
      seedStep: 1,
      assertionCounters: passingCounters,
      seedDigests: [{ seed: 0, sha256: "0".repeat(64) }],
    };
    const specs = specsFromCounters(passingCounters);
    const options = { seedStart: 0, seedEndInclusive: 0, seedStep: 1 };
    expect(() => aggregateRunnerShardRecords(
      [baseShard], counters(0), specs, inputs.evaluatedSourceSha256, options,
    )).not.toThrow();
    for (const [family, ids] of Object.entries(RUNNER_ASSERTION_FAMILIES)) {
      const mutantId = ids[0]!;
      const mutant: RunnerLaboratoryShardRecord = {
        ...baseShard,
        assertionCounters: passingCounters.map((counter) =>
          counter.assertionId === mutantId
            ? {
                ...counter,
                failureCount: 1,
                failureWitnesses: [{
                  witnessId: `mutant-${family}`,
                  message: `negative ${family} probe`,
                }],
              }
            : counter),
      };
      expect(() => aggregateRunnerShardRecords(
        [mutant], counters(0), specs, inputs.evaluatedSourceSha256, options,
      ), family).toThrow(mutantId);
    }
  });

  it("rolls back both staged evidence destinations after an injected first-publish failure", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "runner-evidence-pair-test-"));
    const first = path.join(directory, "a.json");
    const second = path.join(directory, "b.json");
    try {
      await atomicWriteCanonicalJson(first, { generation: "old-a" });
      await atomicWriteCanonicalJson(second, { generation: "old-b" });
      await expect(publishCanonicalEvidencePair([
        [first, { generation: "new-a" }],
        [second, { generation: "new-b" }],
      ], { failAfterFirstPublish: true })).rejects.toThrow(/injected/);
      expect(await readFile(first, "utf8"))
        .toBe(canonicalEvidenceBytes({ generation: "old-a" }));
      expect(await readFile(second, "utf8"))
        .toBe(canonicalEvidenceBytes({ generation: "old-b" }));
      expect((await readdir(directory)).sort()).toEqual(["a.json", "b.json"]);

      await publishCanonicalEvidencePair([
        [first, { generation: "new-a" }],
        [second, { generation: "new-b" }],
      ]);
      expect(await readFile(first, "utf8"))
        .toBe(canonicalEvidenceBytes({ generation: "new-a" }));
      expect(await readFile(second, "utf8"))
        .toBe(canonicalEvidenceBytes({ generation: "new-b" }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rolls back both evidence files when the source pin changes at either rename boundary", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "runner-evidence-source-race-"));
    const first = path.join(directory, "a.json");
    const second = path.join(directory, "b.json");
    try {
      for (const failAtCall of [4, 6]) {
        await atomicWriteCanonicalJson(first, { generation: "old-a" });
        await atomicWriteCanonicalJson(second, { generation: "old-b" });
        let guardCalls = 0;
        await expect(publishCanonicalEvidencePair([
          [first, { generation: "new-a" }],
          [second, { generation: "new-b" }],
        ], {
          assertCurrent: () => {
            guardCalls += 1;
            if (guardCalls === failAtCall) {
              throw new Error("injected evaluated-source race");
            }
          },
        })).rejects.toThrow(/source race/);
        expect(await readFile(first, "utf8"))
          .toBe(canonicalEvidenceBytes({ generation: "old-a" }));
        expect(await readFile(second, "utf8"))
          .toBe(canonicalEvidenceBytes({ generation: "old-b" }));
        expect((await readdir(directory)).sort()).toEqual(["a.json", "b.json"]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("closes every deterministic non-browser population exactly", async () => {
    const inputs = await loadRunnerEvaluatorInputs(ROOT);
    const counters = evaluateDeterministicGlobalRunnerAssertions(inputs);
    const byId = new Map(counters.map((counter) =>
      [counter.assertionId, counter]));
    expect(byId.get("runner-input-adjacency-v1"))
      .toMatchObject({ checked: 321, failureCount: 0 });
    expect(byId.get("runner-buffer-handoff-v1"))
      .toMatchObject({ checked: 100, failureCount: 0 });
    expect(byId.get("runner-pause-drift-v1"))
      .toMatchObject({ checked: 32, failureCount: 0 });
    expect(byId.get("runner-simultaneous-contact-order-v1"))
      .toMatchObject({ checked: 6, failureCount: 0 });
    expect(byId.get("runner-semantic-choice-and-reload-identity-v1"))
      .toMatchObject({ checked: 1084, failureCount: 0 });
    expect(byId.get("runner-accessibility-browser-matrix-v1"))
      .toMatchObject({ checked: 0, failureCount: 0 });
  }, 600_000);
});
