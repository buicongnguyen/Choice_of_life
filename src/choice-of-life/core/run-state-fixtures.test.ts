import { describe, expect, it } from "vitest";
import lockedCorpus from "../../../docs/save/run-state-v1-fixture-corpus.json";
import lockedMaximal from "../../../docs/save/run-state-v1-maximal.fixture.json";
import lockedCorrection from "../../../docs/save/run-state-v1-maximal.fixture-correction-v2.json";
import { PHASE_1_CATALOG, RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "./catalog";
import { decodeRunState, encodeRunState, validateRunState } from "./run-state-codec";
import {
  createCompletedRunStateFixture,
  createMaximalRunStateFixture,
  createRunStateFixtureCorpus,
  createSettlingRunStateFixture,
  createShellRunStateFixture,
  createUnresolvedRecoveryFixture,
} from "./run-state-fixtures";
import type { RunStateV1 } from "./run-state";

function values<T>(items: readonly T[]): Set<T> {
  return new Set(items);
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function applyLockedCorrection(base: unknown): unknown {
  const result = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  expect(lockedCorrection.supersedesArtifactSha256).toBe("0b3d40e3af2aa2d2dae600d4907524a5346fa7509f973780d927330bccfbe4ec");
  expect(lockedCorrection.operations.map((operation) => `${operation.op}:${operation.path}`)).toEqual([
    "replace:/effectLedger/recent",
    "replace:/recovery/preTriggerScores/happiness",
    "replace:/recovery/targetScores/happiness",
  ]);
  for (const operation of lockedCorrection.operations) {
    const segments = operation.path.split("/").slice(1).map(decodePointerSegment);
    const key = segments.pop();
    if (key === undefined) throw new Error("Correction cannot replace the root");
    let parent: unknown = result;
    for (const segment of segments) {
      if (typeof parent !== "object" || parent === null || !(segment in parent)) {
        throw new Error(`Correction path does not exist: ${operation.path}`);
      }
      parent = (parent as Record<string, unknown>)[segment];
    }
    if (typeof parent !== "object" || parent === null || !(key in parent)) {
      throw new Error(`Correction target does not exist: ${operation.path}`);
    }
    (parent as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(operation.value)) as unknown;
  }
  return result;
}

interface PointerHit {
  readonly pointer: string;
  readonly value: unknown;
}

function expandPointer(value: unknown, pattern: string): readonly PointerHit[] {
  const segments = pattern.split("/").slice(1).map(decodePointerSegment);
  const visit = (current: unknown, index: number, concrete: readonly string[]): readonly PointerHit[] => {
    if (index === segments.length) return [{ pointer: `/${concrete.join("/")}`, value: current }];
    const segment = segments[index];
    if (segment === "*") {
      if (!Array.isArray(current)) return [];
      return current.flatMap((item, itemIndex) => visit(item, index + 1, [...concrete, String(itemIndex)]));
    }
    if (typeof current !== "object" || current === null || segment === undefined || !(segment in current)) return [];
    return visit((current as Record<string, unknown>)[segment], index + 1, [...concrete, segment]);
  };
  return visit(value, 0, []);
}

function branchLabel(value: unknown, expected: readonly string[]): string {
  if (value === null) return "null";
  if (typeof value === "object") return "populated";
  if (typeof value === "number") return "tick";
  if (typeof value !== "string") return String(value);
  if (expected.includes(value)) return value;
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/.test(value)) return "catalog-id";
  if (/^[a-z][a-z0-9-]{0,63}$/.test(value)) return "instance-id";
  return value;
}

describe("run-state v1 locked branch corpus", () => {
  it("derives the typed maximal fixture from the additive locked correction", () => {
    const corrected = applyLockedCorrection(lockedMaximal);
    expect(createMaximalRunStateFixture()).toEqual(corrected);
    expect(validateRunState(lockedMaximal, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
    });
    expect(validateRunState(corrected, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: corrected });
    expect(validateRunState(corrected, PHASE_1_CATALOG)).toMatchObject({ ok: false, code: "invalid-catalog" });
  });

  it("round-trips every typed fixture through the strict codec", () => {
    const corpus = createRunStateFixtureCorpus();
    expect(new Set(corpus.map((fixture) => fixture.id)).size).toBe(corpus.length);
    for (const fixture of corpus) {
      expect(decodeRunState(encodeRunState(fixture.state), RUN_STATE_CONTRACT_FIXTURE_CATALOG), fixture.id).toEqual({
        kind: "ready",
        state: fixture.state,
        migratedFrom: null,
      });
    }
  });

  it("witnesses every required nullable and discriminated branch", () => {
    const states = createRunStateFixtureCorpus().map((fixture) => fixture.state);
    expect(values(states.map((state) => state.runStatus))).toEqual(new Set(["setup", "active", "completed"]));
    expect(values(states.map((state) => state.stage.phase))).toEqual(new Set(["shell", "active", "settling", "complete"]));
    expect(values(states.flatMap((state) => state.stage.settlement === null ? [] : [state.stage.settlement.status]))).toEqual(new Set(["pending", "applied", "cancelled"]));
    expect(values(states.flatMap((state) => state.runner === null ? [] : [state.runner.motion.kind]))).toEqual(new Set(["idle", "moving"]));
    expect(values(states.flatMap((state) => state.runner === null ? [] : [state.runner.inputBuffer]))).toEqual(new Set([null, "up", "down"]));
    expect(values(states.flatMap((state) => state.recovery === null ? [] : [state.recovery.status]))).toEqual(new Set(["offered", "accepted", "cooldown"]));
    expect(values(states.flatMap((state) => state.encounter === null ? [] : [state.encounter.phase]))).toEqual(new Set(["presenting", "option-selected", "resolving", "resolved"]));
    expect(values(states.flatMap((state) => state.consequences.resolved.map((item) => item.status)))).toEqual(new Set(["resolved", "presented"]));
    expect(values(states.flatMap((state) => state.consequences.terminal.map((item) => item.status)))).toEqual(new Set(["complete", "expired", "superseded"]));

    const originChoices = states.flatMap((state) => [
      ...state.storyState.facts.map((item) => item.originChoiceId),
      ...state.storyState.memories.map((item) => item.originChoiceId),
      ...state.storyState.conditions.map((item) => item.originChoiceId),
    ]);
    expect(originChoices).toContain(null);
    expect(originChoices.some((value) => value !== null)).toBe(true);
    expect(states.flatMap((state) => state.storyState.conditions.map((item) => item.expiresTick))).toContain(null);
  });

  it("mechanically executes every locked RFC6901 wildcard branch requirement", () => {
    const states = createRunStateFixtureCorpus().map((fixture) => fixture.state);
    for (const [pattern, expected] of Object.entries(lockedCorpus.requiredBranchesByPointerPattern)) {
      const hits = states.flatMap((state) => expandPointer(state, pattern));
      expect(hits.length, `${pattern} must expand at least once`).toBeGreaterThan(0);
      expect(new Set(hits.map((hit) => branchLabel(hit.value, expected))), pattern).toEqual(new Set(expected));
      expect(new Set(hits.map((hit) => hit.pointer)).size, `${pattern} concrete pointers`).toBeGreaterThan(0);
    }
  });

  it("mechanically executes every locked valid and invalid status pair", () => {
    const corpus = createRunStateFixtureCorpus();
    const valid = new Set(corpus.map(({ state }) => `${state.runStatus}: ${state.stage.phase}`));
    expect(valid).toEqual(new Set(lockedCorpus.requiredValidStatusPairs));
    const byPhase = new Map(corpus.map(({ state }) => [state.stage.phase, state]));
    for (const pair of lockedCorpus.requiredInvalidStatusPairs) {
      const [runStatus, phase] = pair.split(": ");
      const base = byPhase.get(phase as RunStateV1["stage"]["phase"]);
      expect(base, `fixture for ${phase}`).toBeDefined();
      if (base === undefined) continue;
      const mutant = { ...base, runStatus } as unknown as RunStateV1;
      expect(validateRunState(mutant, RUN_STATE_CONTRACT_FIXTURE_CATALOG), pair).toMatchObject({
        ok: false,
        code: "invalid-semantics",
      });
    }
  });

  it("maps and executes every locked transaction-combination case", () => {
    const maximal = createMaximalRunStateFixture();
    const presenting = createRunStateFixtureCorpus().find((fixture) => fixture.id === "active-presenting-expired-null-origins")?.state;
    const offered = createUnresolvedRecoveryFixture("offered");
    const accepted = createUnresolvedRecoveryFixture("accepted");
    const settling = createSettlingRunStateFixture();
    expect(presenting).toBeDefined();
    if (presenting === undefined) return;
    const valid = new Map<string, readonly RunStateV1[]>([
      ["active stage + null recovery + encounter", [presenting]],
      ["active stage + resolved cooldown recovery + encounter", [maximal]],
      ["active stage + offered or accepted recovery + null encounter", [offered, accepted]],
      ["settling stage + null recovery + null encounter", [settling]],
    ]);
    const invalid = new Map<string, RunStateV1>([
      ["active stage + offered recovery + encounter", { ...offered, encounter: maximal.encounter }],
      ["active stage + accepted recovery + encounter", { ...accepted, encounter: maximal.encounter }],
      ["settling stage + any recovery", { ...settling, recovery: maximal.recovery }],
      ["settling stage + any encounter", { ...settling, encounter: maximal.encounter }],
    ]);
    expect(new Set(valid.keys())).toEqual(new Set(lockedCorpus.requiredTransactionCombinations.valid));
    expect(new Set(invalid.keys())).toEqual(new Set(lockedCorpus.requiredTransactionCombinations.invalid));
    for (const [label, states] of valid) {
      for (const state of states) expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG), label).toEqual({ ok: true, state });
    }
    for (const [label, state] of invalid) {
      expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG), label).toMatchObject({ ok: false, code: "invalid-semantics" });
    }
  });

  it("rejects every forbidden run/stage pair", () => {
    const shell = createShellRunStateFixture();
    const active = createMaximalRunStateFixture();
    const completed = createCompletedRunStateFixture();
    const settling = createSettlingRunStateFixture();
    const invalid: readonly RunStateV1[] = [
      { ...active, runStatus: "setup" },
      { ...completed, runStatus: "setup" },
      { ...shell, runStatus: "active" },
      { ...active, runStatus: "completed" },
      { ...settling, runStatus: "completed" },
    ];
    for (const state of invalid) {
      expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-semantics",
        path: "/stage/phase",
      });
    }
  });

  it("rejects unresolved recovery with an encounter and settling transactions", () => {
    const maximal = createMaximalRunStateFixture();
    const offered = createUnresolvedRecoveryFixture("offered");
    const accepted = createUnresolvedRecoveryFixture("accepted");
    const settling = createSettlingRunStateFixture();
    const invalid: readonly RunStateV1[] = [
      { ...offered, encounter: maximal.encounter },
      { ...accepted, encounter: maximal.encounter },
      { ...settling, recovery: maximal.recovery },
      { ...settling, encounter: maximal.encounter },
    ];
    for (const state of invalid) {
      expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-semantics" });
    }
  });
});
