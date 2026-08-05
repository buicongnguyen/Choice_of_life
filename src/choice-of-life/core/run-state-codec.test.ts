import { describe, expect, it, vi } from "vitest";
import {
  PHASE_1_CATALOG,
  RUN_STATE_CONTRACT_ENTRIES,
  RUN_STATE_CONTRACT_FIXTURE_CATALOG,
  STRICT_RUN_STATE_CONTRACT_CATALOG,
  createCatalogRegistry,
} from "./catalog";
import type { RunStateV1 } from "./run-state";
import { deriveEntityInstanceIdV1 } from "./instance-id";
import {
  decodeRunState,
  encodeRunState,
  migrateRunStateValue,
  RUN_STATE_MIGRATIONS,
  utf8ByteLength,
  validateRunState,
} from "./run-state-codec";
import {
  createEntityLimitFixture,
  createCompletedRunStateFixture,
  createMaximalRunStateFixture,
  createUnresolvedRecoveryFixture,
  createSelectingEncounterFixture,
  createSettlingRunStateFixture,
  createShellRunStateFixture,
  createSyntheticV0Fixture,
} from "./run-state-fixtures";

function mutableJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("run-state v1 codec", () => {
  it("accepts the locked maximal shape only with the immutable fixture catalog", () => {
    const fixture = createMaximalRunStateFixture();
    expect(validateRunState(fixture, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: fixture });
    expect(validateRunState(fixture, PHASE_1_CATALOG)).toMatchObject({ ok: false, code: "invalid-catalog" });
    expect(validateRunState(fixture, STRICT_RUN_STATE_CONTRACT_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/runner/spawn/resolvedEntityIds",
    });
  });

  it("accepts deterministic active and resolved entity IDs under the strict production policy", () => {
    const base = createMaximalRunStateFixture();
    expect(base.runner).not.toBeNull();
    expect(base.recovery).not.toBeNull();
    if (base.runner === null || base.recovery === null) return;
    const activeEntities = base.runner.activeEntities.map((entity) => ({
      ...entity,
      instanceId: deriveEntityInstanceIdV1({
        runSeed: base.runSeed,
        stageId: base.stage.stageId,
        patternIndex: entity.patternIndex,
        slotIndex: entity.slotIndex,
        contentId: entity.contentId,
      }),
    }));
    const resolvedId = deriveEntityInstanceIdV1({
      runSeed: base.runSeed,
      stageId: base.stage.stageId,
      patternIndex: base.runner.spawn.patternIndex,
      slotIndex: 2,
      contentId: "runner-contract-benefit-v1",
    });
    const stable: RunStateV1 = {
      ...base,
      runner: {
        ...base.runner,
        activeEntities,
        spawn: { ...base.runner.spawn, resolvedEntityIds: [resolvedId] },
      },
      recovery: { ...base.recovery, triggerEntityInstanceId: activeEntities[0]!.instanceId },
    };
    expect(validateRunState(stable, STRICT_RUN_STATE_CONTRACT_CATALOG)).toEqual({ ok: true, state: stable });
  });

  it("round trips a valid full envelope", () => {
    const fixture = createMaximalRunStateFixture();
    const decoded = decodeRunState(encodeRunState(fixture), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(decoded).toEqual({ kind: "ready", state: fixture, migratedFrom: null });
    expect(decoded.kind === "ready" && Object.isFrozen(decoded.state)).toBe(true);
    expect(decoded.kind === "ready" && Object.isFrozen(decoded.state.effectLedger.recent)).toBe(true);
    expect(decoded.kind === "ready" && Object.isFrozen(decoded.state.runner?.spawn.resolvedEntityIds)).toBe(true);
  });

  it("deep-freezes only decoded ready states and leaves validation callers untouched", () => {
    const callerOwned = JSON.parse(
      JSON.stringify(createMaximalRunStateFixture()),
    ) as RunStateV1;
    const validation = validateRunState(
      callerOwned,
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
    );
    expect(validation).toEqual({ ok: true, state: callerOwned });
    expect(Object.isFrozen(callerOwned)).toBe(false);
    expect(Object.isFrozen(callerOwned.effectLedger)).toBe(false);

    const decoded = decodeRunState(
      encodeRunState(callerOwned),
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
    );
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    expect(Object.isFrozen(decoded.state)).toBe(true);
    expect(Object.isFrozen(decoded.state.storyState.memories)).toBe(true);
    expect(Object.isFrozen(decoded.state.consequences.terminal[0])).toBe(true);
  });

  it("rejects a regex-valid run ID that does not match seed and mechanical setup", () => {
    const tampered = { ...createMaximalRunStateFixture(), runId: "run-0000000000000000" };
    expect(validateRunState(tampered, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/runId",
    });
  });

  it("rejects unknown keys and invalid effect arithmetic", () => {
    const extra = mutableJson(createShellRunStateFixture());
    extra.legacyScore = 10;
    expect(decodeRunState(JSON.stringify(extra), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      kind: "invalid",
      code: "invalid-structure",
    });

    const arithmetic = mutableJson(createMaximalRunStateFixture());
    const ledger = arithmetic.effectLedger as { recent: Array<Record<string, unknown>> };
    ledger.recent[0]!.actualDelta = 3;
    expect(validateRunState(arithmetic, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/effectLedger/recent/0",
    });
  });

  it("rejects sparse arrays, hidden/symbol fields, and terminal accessors without invoking them", () => {
    const base = createMaximalRunStateFixture();
    const sparse = new Array(1) as typeof base.storyState.memories;
    expect(validateRunState({ ...base, storyState: { ...base.storyState, memories: sparse } }, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/storyState/memories",
    });

    const hidden = createShellRunStateFixture() as RunStateV1 & { hidden?: number };
    Object.defineProperty(hidden, "hidden", { value: 1, enumerable: false });
    expect(validateRunState(hidden, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
    const symbolState = createShellRunStateFixture() as RunStateV1 & Record<symbol, unknown>;
    symbolState[Symbol("hidden")] = true;
    expect(validateRunState(symbolState, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });

    const accessor = createMaximalRunStateFixture();
    const terminal = { ...accessor.consequences.terminal[0] } as Record<string, unknown>;
    const getter = vi.fn(() => "superseded");
    Object.defineProperty(terminal, "status", { enumerable: true, get: getter });
    const forged = {
      ...accessor,
      consequences: { ...accessor.consequences, terminal: [terminal] },
    };
    expect(validateRunState(forged, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/consequences/terminal/0/status",
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects catalog IDs paired with the wrong locked discriminator", () => {
    const entity = createMaximalRunStateFixture();
    const runner = entity.runner;
    expect(runner).not.toBeNull();
    if (runner === null) return;
    const firstEntity = runner.activeEntities[0];
    expect(firstEntity).toBeDefined();
    if (firstEntity === undefined) return;
    const wrongEntity: RunStateV1 = {
      ...entity,
      runner: {
        ...runner,
        activeEntities: [{ ...firstEntity, kind: "benefit" }, ...runner.activeEntities.slice(1)],
      },
    };
    expect(validateRunState(wrongEntity, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-catalog",
      path: "/runner/activeEntities/0/contentId",
    });

    const wrongEncounter = createMaximalRunStateFixture();
    expect(wrongEncounter.encounter).not.toBeNull();
    if (wrongEncounter.encounter === null) return;
    const mismatched: RunStateV1 = {
      ...wrongEncounter,
      encounter: { ...wrongEncounter.encounter, kind: "friend" },
    };
    expect(validateRunState(mismatched, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-catalog",
      path: "/encounter/encounterId",
    });
  });

  it("rejects duplicate active pattern-slot coordinates even when instance IDs differ", () => {
    const base = createMaximalRunStateFixture();
    expect(base.runner).not.toBeNull();
    if (base.runner === null) return;
    const first = base.runner.activeEntities[0];
    const second = base.runner.activeEntities[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    const duplicate: RunStateV1 = {
      ...base,
      recovery: null,
      runner: {
        ...base.runner,
        activeEntities: [first, { ...second, patternIndex: first.patternIndex, slotIndex: first.slotIndex }],
      },
    };
    expect(validateRunState(duplicate, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/runner/activeEntities/*/(patternIndex,slotIndex)",
    });
  });

  it("rejects active entities from a pattern already covered by the compact resolution cursor", () => {
    const base = createMaximalRunStateFixture();
    expect(base.runner).not.toBeNull();
    if (base.runner === null) return;
    const first = base.runner.activeEntities[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const stale: RunStateV1 = {
      ...base,
      recovery: null,
      runner: {
        ...base.runner,
        activeEntities: [{ ...first, patternIndex: base.runner.spawn.resolvedThroughPatternIndex }],
      },
    };
    expect(validateRunState(stale, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/runner/activeEntities/0",
    });
  });

  it("enforces attribution cause nullability", () => {
    const fixture = mutableJson(createMaximalRunStateFixture());
    const ledger = fixture.effectLedger as { recent: Array<Record<string, unknown>> };
    ledger.recent[1]!.causedByChoiceId = "choice-ask-for-help-v1";
    expect(validateRunState(fixture, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/effectLedger/recent/1/causedByChoiceId",
    });
  });

  it("accepts exactly 64 active entities and rejects 65", () => {
    expect(validateRunState(createEntityLimitFixture(64), RUN_STATE_CONTRACT_FIXTURE_CATALOG).ok).toBe(true);
    expect(validateRunState(createEntityLimitFixture(65), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/runner/activeEntities",
    });
  });

  it("round trips the exact 64-entity boundary under stable production IDs", () => {
    const fixture = createEntityLimitFixture(64);
    expect(fixture.runner).not.toBeNull();
    if (fixture.runner === null) return;
    const stable: RunStateV1 = {
      ...fixture,
      runner: {
        ...fixture.runner,
        spawn: { ...fixture.runner.spawn, resolvedEntityIds: [] },
        activeEntities: fixture.runner.activeEntities.map((entity) => ({
          ...entity,
          instanceId: deriveEntityInstanceIdV1({
            runSeed: fixture.runSeed,
            stageId: fixture.stage.stageId,
            patternIndex: entity.patternIndex,
            slotIndex: entity.slotIndex,
            contentId: entity.contentId,
          }),
        })),
      },
    };
    expect(validateRunState(stable, STRICT_RUN_STATE_CONTRACT_CATALOG)).toEqual({ ok: true, state: stable });
    const encoded = encodeRunState(stable);
    expect(utf8ByteLength(encoded)).toBeLessThanOrEqual(99_999);
    expect(decodeRunState(encoded, STRICT_RUN_STATE_CONTRACT_CATALOG)).toEqual({
      kind: "ready",
      state: stable,
      migratedFrom: null,
    });
    const tooMany: RunStateV1 = {
      ...stable,
      runner: { ...stable.runner!, activeEntities: [...stable.runner!.activeEntities, stable.runner!.activeEntities[0]!] },
    };
    expect(validateRunState(tooMany, STRICT_RUN_STATE_CONTRACT_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-structure",
      path: "/runner/activeEntities",
    });
    expect(createCatalogRegistry(RUN_STATE_CONTRACT_ENTRIES).entityInstanceIdPolicy).toBe("stable-coordinate-v1");
  });

  it("migrates the real v0 envelope exactly once", () => {
    const v0 = createSyntheticV0Fixture();
    const first = decodeRunState(JSON.stringify(v0), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(first).toMatchObject({ kind: "ready", migratedFrom: 0 });
    if (first.kind !== "ready") throw new Error("Expected v0 migration");
    expect(first.state.accessibility.screenReaderAnnouncements).toBe(false);
    expect(decodeRunState(encodeRunState(first.state), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      kind: "ready",
      state: first.state,
      migratedFrom: null,
    });
  });

  it("applies registered migrations sequentially and rejects missing or invalid steps", () => {
    const source = { schemaVersion: 0, value: "start" };
    const steps = [
      { fromVersion: 0, toVersion: 1, migrate: (value: Readonly<Record<string, unknown>>) => ({ ...value, schemaVersion: 1, first: true }) },
      { fromVersion: 1, toVersion: 2, migrate: (value: Readonly<Record<string, unknown>>) => ({ ...value, schemaVersion: 2, second: true }) },
    ] as const;
    expect(migrateRunStateValue(source, 2, steps)).toEqual({
      ok: true,
      value: { schemaVersion: 2, value: "start", first: true, second: true },
      migratedFrom: 0,
    });
    expect(migrateRunStateValue(source, 2, [steps[0]])).toEqual({ ok: false, reason: "missing-step" });
    expect(migrateRunStateValue(source, 1, [
      { fromVersion: 0, toVersion: 1, migrate: (value) => ({ ...value, schemaVersion: 0 }) },
    ])).toEqual({ ok: false, reason: "step-failed" });
    expect(migrateRunStateValue({ schemaVersion: 1, value: "current" }, 1, steps)).toEqual({
      ok: true,
      value: { schemaVersion: 1, value: "current" },
      migratedFrom: null,
    });
    expect(migrateRunStateValue(source, 1, [{
      fromVersion: 0,
      toVersion: 1,
      migrate: () => { throw new Error("broken migration"); },
    }])).toEqual({ ok: false, reason: "step-failed" });
    expect(migrateRunStateValue({ schemaVersion: -1 }, 1, steps)).toEqual({ ok: false, reason: "invalid-version" });
    expect(migrateRunStateValue(source, -1, steps)).toEqual({ ok: false, reason: "invalid-version" });
    expect(migrateRunStateValue(source, Number.MAX_SAFE_INTEGER + 1, steps)).toEqual({ ok: false, reason: "invalid-version" });
    expect(migrateRunStateValue(source, 1, [{
      fromVersion: Number.MAX_SAFE_INTEGER,
      toVersion: Number.MAX_SAFE_INTEGER + 1,
      migrate: (value) => ({ ...value }),
    }])).toEqual({ ok: false, reason: "invalid-version" });
  });

  it("migrates deterministically without mutating the source text or object", () => {
    const source = createSyntheticV0Fixture();
    const before = JSON.stringify(source);
    const direct = migrateRunStateValue(mutableJson(source), 1, RUN_STATE_MIGRATIONS);
    expect(direct).toMatchObject({ ok: true, migratedFrom: 0 });
    const first = decodeRunState(before, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    const second = decodeRunState(before, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(first).toEqual(second);
    expect(JSON.stringify(source)).toBe(before);
    expect(first.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") return;
    expect(encodeRunState(first.state)).toBe(encodeRunState(second.state));

    const hostileSource: Record<string, unknown> = { schemaVersion: 0, nested: { value: "original" } };
    const hostileBefore = JSON.stringify(hostileSource);
    expect(migrateRunStateValue(hostileSource, 1, [{
      fromVersion: 0,
      toVersion: 1,
      migrate: (value) => {
        (value.nested as Record<string, unknown>).value = "mutated";
        (value as Record<string, unknown>).schemaVersion = 99;
        throw new Error("hostile migration");
      },
    }])).toEqual({ ok: false, reason: "step-failed" });
    expect(JSON.stringify(hostileSource)).toBe(hostileBefore);
  });

  it("accepts astral text as one scalar and rejects isolated UTF-16 surrogates", () => {
    const astral = createMaximalRunStateFixture();
    const memory = astral.storyState.memories[0];
    expect(memory).toBeDefined();
    if (memory === undefined) return;
    const accepted: RunStateV1 = {
      ...astral,
      storyState: { ...astral.storyState, memories: [{ ...memory, summary: "🙂" }] },
    };
    expect(validateRunState(accepted, RUN_STATE_CONTRACT_FIXTURE_CATALOG).ok).toBe(true);
    for (const summary of ["\ud800", "\udc00"]) {
      const invalid: RunStateV1 = {
        ...accepted,
        storyState: { ...accepted.storyState, memories: [{ ...memory, summary }] },
      };
      expect(validateRunState(invalid, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-structure",
        path: "/storyState/memories/0/summary",
      });
    }
  });

  it("rejects future schema/content and oversized input before parsing", () => {
    const futureSchema = mutableJson(createShellRunStateFixture());
    futureSchema.schemaVersion = 2;
    expect(decodeRunState(JSON.stringify(futureSchema), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ kind: "invalid", code: "unsupported-schema" });

    const futureContent = mutableJson(createShellRunStateFixture());
    futureContent.contentVersion = "phase-2-v1";
    expect(decodeRunState(JSON.stringify(futureContent), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ kind: "invalid", code: "unsupported-content" });

    const oversized = "{" + "x".repeat(100_000);
    expect(utf8ByteLength(oversized)).toBeGreaterThan(99_999);
    expect(decodeRunState(oversized, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ kind: "invalid", code: "oversized" });
  });

  it("directly rejects every named malformed, root, bound, duplicate, lane, and discriminator class", () => {
    expect(decodeRunState("{", RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ kind: "invalid", code: "malformed-json" });
    for (const root of [null, [], 1, "state"]) {
      expect(decodeRunState(JSON.stringify(root), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        kind: "invalid",
        code: "invalid-root",
      });
    }
    const oldSchema = mutableJson(createShellRunStateFixture());
    oldSchema.schemaVersion = -1;
    expect(decodeRunState(JSON.stringify(oldSchema), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      kind: "invalid",
      code: "unsupported-schema",
    });

    const duplicateId = createMaximalRunStateFixture();
    expect(duplicateId.runner).not.toBeNull();
    if (duplicateId.runner === null) return;
    const duplicateEntities: RunStateV1 = {
      ...duplicateId,
      runner: {
        ...duplicateId.runner,
        activeEntities: [
          duplicateId.runner.activeEntities[0]!,
          { ...duplicateId.runner.activeEntities[1]!, instanceId: duplicateId.runner.activeEntities[0]!.instanceId },
        ],
      },
    };
    expect(validateRunState(duplicateEntities, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/runner/activeEntities/*/instanceId",
    });

    const invalidLane = mutableJson(createMaximalRunStateFixture());
    ((invalidLane.runner as Record<string, unknown>).motion as Record<string, unknown>).currentLane = 3;
    expect(validateRunState(invalidLane, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
    const invalidDiscriminator = mutableJson(createMaximalRunStateFixture());
    (invalidDiscriminator.stage as Record<string, unknown>).phase = "future";
    expect(validateRunState(invalidDiscriminator, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
    for (const invalidTick of [Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateRunState({ ...createMaximalRunStateFixture(), simulationTick: invalidTick }, RUN_STATE_CONTRACT_FIXTURE_CATALOG))
        .toMatchObject({ ok: false, code: "invalid-structure", path: "/simulationTick" });
    }

    const longText = mutableJson(createMaximalRunStateFixture());
    const memories = (longText.storyState as { memories: Array<Record<string, unknown>> }).memories;
    memories[0]!.summary = "a".repeat(257);
    expect(validateRunState(longText, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
    const tooManyEffects = mutableJson(createMaximalRunStateFixture());
    (tooManyEffects.effectLedger as { recent: unknown[] }).recent = Array.from({ length: 129 }, () => ({}));
    expect(validateRunState(tooManyEffects, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
    const tooManyPending = mutableJson(createMaximalRunStateFixture());
    (tooManyPending.consequences as { pending: unknown[] }).pending = Array.from({ length: 65 }, () => ({}));
    expect(validateRunState(tooManyPending, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({ ok: false, code: "invalid-structure" });
  });

  it("rejects conflicting encounter ownership and consequence cycles", () => {
    const owner = mutableJson(createMaximalRunStateFixture());
    const encounter = owner.encounter as Record<string, unknown>;
    encounter.transactionId = "different-transaction";
    expect(validateRunState(owner, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/encounter",
    });

    const cycle = mutableJson(createMaximalRunStateFixture());
    const consequences = cycle.consequences as { pending: Array<Record<string, unknown>>; terminal: Array<Record<string, unknown>> };
    consequences.terminal[0]!.supersededByTransactionId = "consequence-tx-0003";
    expect(decodeRunState(JSON.stringify(cycle), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      kind: "invalid",
      code: "invalid-semantics",
    });
  });

  it("rejects a consequence resolution before the encounter reaches resolved", () => {
    const resolvedState = createMaximalRunStateFixture();
    const encounter = resolvedState.encounter;
    expect(encounter).not.toBeNull();
    if (encounter === null) return;
    const premature: RunStateV1 = {
      ...resolvedState,
      encounter: { ...encounter, phase: "option-selected", resolutionTransactionId: null },
    };
    expect(validateRunState(premature, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/encounter",
    });
  });

  it("preserves the selected option's immutable choice attribution", () => {
    const forged = createMaximalRunStateFixture();
    const effectIndex = forged.effectLedger.recent.findIndex((candidate) => candidate.transactionId === "consequence-tx-0001");
    const effect = forged.effectLedger.recent[effectIndex];
    const resolved = forged.consequences.resolved[0];
    expect(effect).toBeDefined();
    expect(resolved).toBeDefined();
    if (effect === undefined || resolved === undefined) return;
    const state: RunStateV1 = {
      ...forged,
      effectLedger: {
        recent: forged.effectLedger.recent.map((candidate, index) => index === effectIndex
          ? { ...effect, source: "system" as const, causedByChoiceId: null }
          : candidate),
        totalsBySource: {
          ...forged.effectLedger.totalsBySource,
          choice: { ...forged.effectLedger.totalsBySource.choice, happinessPositive: 0 },
          system: { ...forged.effectLedger.totalsBySource.system, happinessPositive: 4 },
        },
      },
      consequences: {
        ...forged.consequences,
        pending: forged.consequences.pending.map((item) => ({ ...item, causedByChoiceId: null })),
        resolved: [{ ...resolved, causedByChoiceId: null }],
      },
      storyState: {
        ...forged.storyState,
        facts: forged.storyState.facts.map((fact) => ({ ...fact, originChoiceId: null })),
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/encounter/resolutionTransactionId",
    });

    const wrongValidChoice: RunStateV1 = {
      ...forged,
      consequences: {
        ...forged.consequences,
        resolved: [{
          ...resolved,
          resolution: { ...resolved.resolution, selectedOptionId: "option-other-v1" },
        }],
      },
    };
    expect(validateRunState(wrongValidChoice, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/consequences/resolved/0/resolution/selectedOptionId",
    });
  });

  it("requires cooldown restoration to be owned by the recovery transaction", () => {
    const wrongOwner = mutableJson(createMaximalRunStateFixture());
    const ledger = wrongOwner.effectLedger as { recent: Array<Record<string, unknown>> };
    const restoration = ledger.recent.find((effect) => effect.source === "recovery");
    expect(restoration).toBeDefined();
    if (restoration === undefined) return;
    restoration.transactionId = "recovery-tx-wrong-owner";

    expect(validateRunState(wrongOwner, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/transactionId",
    });
  });

  it("allows a resolved cooldown trigger to leave the active safe corridor", () => {
    const base = createMaximalRunStateFixture();
    expect(base.recovery).not.toBeNull();
    if (base.recovery === null) return;
    const triggerId = base.recovery.triggerEntityInstanceId;
    const state: RunStateV1 = {
      ...base,
      runner: base.runner === null ? null : {
        ...base.runner,
        activeEntities: base.runner.activeEntities.filter(({ instanceId }) => instanceId !== triggerId),
        spawn: {
          ...base.runner.spawn,
          resolvedEntityIds: [...base.runner.spawn.resolvedEntityIds, triggerId].sort(),
        },
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: true,
      state,
    });
  });

  it("requires genuine depletion and an exact unresolved recovery snapshot", () => {
    const zeroDelta = mutableJson(createUnresolvedRecoveryFixture("offered"));
    const zeroLedger = zeroDelta.effectLedger as { recent: Array<Record<string, unknown>> };
    const trigger = zeroLedger.recent.find((effect) => effect.source === "runner");
    const zeroRecovery = zeroDelta.recovery as { preTriggerScores: Record<string, number>; targetScores: Record<string, number> };
    expect(trigger).toBeDefined();
    if (trigger === undefined) return;
    Object.assign(trigger, { requestedDelta: 0, before: 0, after: 0, actualDelta: 0 });
    zeroRecovery.preTriggerScores.health = 0;
    zeroRecovery.targetScores.health = 1;
    expect(validateRunState(zeroDelta, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/preTriggerScores",
    });

    const staleSnapshot = createUnresolvedRecoveryFixture("accepted");
    expect(staleSnapshot.recovery).not.toBeNull();
    if (staleSnapshot.recovery === null) return;
    const forged: RunStateV1 = {
      ...staleSnapshot,
      recovery: {
        ...staleSnapshot.recovery,
        preTriggerScores: { ...staleSnapshot.recovery.preTriggerScores, happiness: 64 },
        targetScores: { ...staleSnapshot.recovery.targetScores, happiness: 64 },
      },
    };
    expect(validateRunState(forged, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/preTriggerScores",
    });
  });

  it("freezes all effects after an unresolved recovery trigger", () => {
    const base = createUnresolvedRecoveryFixture("offered");
    const state: RunStateV1 = {
      ...base,
      effectLedger: {
        recent: [
          ...base.effectLedger.recent,
          {
            effectId: "effect-during-recovery-support-0001",
            scoreId: "health",
            requestedDelta: 5,
            source: "system",
            categoryId: "choice-practice-v1",
            causedByChoiceId: null,
            transactionId: null,
            before: 0,
            after: 5,
            actualDelta: 5,
            simulationTick: 4_101,
          },
          {
            effectId: "effect-during-recovery-hazard-0002",
            scoreId: "health",
            requestedDelta: -5,
            source: "runner",
            categoryId: "hazard-depletion-v1",
            causedByChoiceId: null,
            transactionId: null,
            before: 5,
            after: 0,
            actualDelta: -5,
            simulationTick: 4_102,
          },
        ],
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          runner: {
            ...base.effectLedger.totalsBySource.runner,
            healthNegative: base.effectLedger.totalsBySource.runner.healthNegative + 5,
          },
          system: {
            ...base.effectLedger.totalsBySource.system,
            healthPositive: 5,
          },
        },
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/status",
    });
  });

  it("requires a new recovery transaction when cooldown play depletes another score", () => {
    const base = createMaximalRunStateFixture();
    const state: RunStateV1 = {
      ...base,
      scores: { ...base.scores, health: 0 },
      effectLedger: {
        recent: [
          ...base.effectLedger.recent,
          {
            effectId: "effect-cooldown-depletion-0001",
            scoreId: "health",
            requestedDelta: -5,
            source: "runner",
            categoryId: "hazard-depletion-v1",
            causedByChoiceId: null,
            transactionId: null,
            before: 5,
            after: 0,
            actualDelta: -5,
            simulationTick: base.simulationTick,
          },
        ],
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          runner: {
            ...base.effectLedger.totalsBySource.runner,
            healthNegative: base.effectLedger.totalsBySource.runner.healthNegative + 5,
          },
        },
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/status",
    });
  });

  it("preserves the historical atomic freeze until cooldown restoration resolves", () => {
    const base = createMaximalRunStateFixture();
    const recent = [...base.effectLedger.recent];
    recent.splice(1, 0, {
      effectId: "effect-during-recovery-window-0001",
      scoreId: "money",
      requestedDelta: 1,
      source: "system",
      categoryId: "choice-practice-v1",
      causedByChoiceId: null,
      transactionId: null,
      before: base.scores.money,
      after: base.scores.money + 1,
      actualDelta: 1,
      simulationTick: 4_105,
    });
    const state: RunStateV1 = {
      ...base,
      scores: { ...base.scores, money: base.scores.money + 1 },
      effectLedger: {
        recent,
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          system: {
            ...base.effectLedger.totalsBySource.system,
            moneyPositive: base.effectLedger.totalsBySource.system.moneyPositive + 1,
          },
        },
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/status",
    });
  });

  it("reconstructs the minimal same-tick atomic recovery suffix", () => {
    const base = createMaximalRunStateFixture();
    const priorContact = {
      effectId: "effect-runner-prior-contact-0001",
      scoreId: "happiness" as const,
      requestedDelta: 1,
      source: "runner" as const,
      categoryId: "hazard-depletion-v1",
      causedByChoiceId: null,
      transactionId: null,
      before: 58,
      after: 59,
      actualDelta: 1,
      simulationTick: 4100,
    };
    const withPriorContact: RunStateV1 = {
      ...base,
      effectLedger: { ...base.effectLedger, recent: [priorContact, ...base.effectLedger.recent] },
    };
    expect(validateRunState(withPriorContact, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: true,
      state: withPriorContact,
    });

    const noOpContact = { ...priorContact, effectId: "effect-runner-prior-noop-0001", requestedDelta: 0, before: 59, actualDelta: 0 };
    const withPriorNoOp: RunStateV1 = {
      ...base,
      effectLedger: { ...base.effectLedger, recent: [noOpContact, ...base.effectLedger.recent] },
    };
    expect(validateRunState(withPriorNoOp, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: true,
      state: withPriorNoOp,
    });
  });

  it("recovers every score depleted by one atomic contact and rejects partial non-depleted damage", () => {
    const base = createUnresolvedRecoveryFixture("offered");
    const trigger = base.effectLedger.recent[0];
    expect(trigger).toBeDefined();
    expect(base.recovery).not.toBeNull();
    if (trigger === undefined || base.recovery === null) return;
    const healthPartial = {
      ...trigger,
      effectId: "effect-runner-health-partial-0001",
      requestedDelta: -3,
      before: 5,
      after: 2,
      actualDelta: -3,
    };
    const healthDepletion = {
      ...trigger,
      effectId: "effect-runner-health-depletion-0001",
      before: 2,
      actualDelta: -2,
    };
    const happinessDepletion = {
      ...trigger,
      effectId: "effect-runner-happiness-depletion-0001",
      scoreId: "happiness" as const,
      requestedDelta: -59,
      before: 59,
      after: 0,
      actualDelta: -59,
    };
    const multiScore: RunStateV1 = {
      ...base,
      scores: { ...base.scores, happiness: 0 },
      effectLedger: {
        recent: [healthPartial, healthDepletion, happinessDepletion],
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          runner: { ...base.effectLedger.totalsBySource.runner, happinessNegative: 61 },
        },
      },
      recovery: {
        ...base.recovery,
        targetScores: { ...base.recovery.targetScores, happiness: 8 },
      },
    };
    expect(validateRunState(multiScore, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: multiScore });

    const partialHappiness = {
      ...happinessDepletion,
      effectId: "effect-runner-happiness-partial-0001",
      requestedDelta: -1,
      after: 58,
      actualDelta: -1,
    };
    const partialDamage: RunStateV1 = {
      ...base,
      scores: { ...base.scores, happiness: 58 },
      effectLedger: {
        recent: [trigger, partialHappiness],
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          runner: { ...base.effectLedger.totalsBySource.runner, happinessNegative: 3 },
        },
      },
    };
    expect(validateRunState(partialDamage, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/recovery/preTriggerScores",
    });
  });

  it("does not invent an all-positive recovery precondition absent from the v1 contract", () => {
    const base = createUnresolvedRecoveryFixture("accepted");
    expect(base.recovery).not.toBeNull();
    if (base.recovery === null) return;
    const alreadyDepleted: RunStateV1 = {
      ...base,
      scores: { ...base.scores, happiness: 0 },
      effectLedger: {
        ...base.effectLedger,
        totalsBySource: {
          ...base.effectLedger.totalsBySource,
          runner: { ...base.effectLedger.totalsBySource.runner, happinessNegative: 61 },
        },
      },
      recovery: {
        ...base.recovery,
        preTriggerScores: { ...base.recovery.preTriggerScores, happiness: 0 },
        targetScores: { ...base.recovery.targetScores, happiness: 0 },
      },
    };
    expect(validateRunState(alreadyDepleted, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      ok: true,
      state: alreadyDepleted,
    });
  });

  it("enforces the exact stage-clock boundary for every stage phase", () => {
    const shell = createShellRunStateFixture();
    const active = createMaximalRunStateFixture();
    const settling = createSettlingRunStateFixture();
    const complete = createCompletedRunStateFixture();
    const invalid: readonly RunStateV1[] = [
      { ...shell, stage: { ...shell.stage, activeTicks: 1 } },
      { ...shell, stage: { ...shell.stage, durationTicks: 1 } },
      { ...active, stage: { ...active.stage, activeTicks: active.stage.durationTicks } },
      { ...settling, stage: { ...settling.stage, activeTicks: settling.stage.durationTicks - 1 } },
      { ...complete, stage: { ...complete.stage, activeTicks: complete.stage.durationTicks - 1 } },
    ];
    for (const state of invalid) {
      expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
        ok: false,
        code: "invalid-semantics",
        path: "/stage",
      });
    }
  });

  it("rejects stage and settlement clocks that are ahead of simulation time", () => {
    const active = createMaximalRunStateFixture();
    expect(validateRunState({
      ...active,
      stage: { ...active.stage, activeTicks: active.simulationTick + 1 },
    }, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/stage/activeTicks",
    });
    const complete = createCompletedRunStateFixture();
    expect(complete.stage.settlement).not.toBeNull();
    if (complete.stage.settlement === null) return;
    expect(validateRunState({
      ...complete,
      stage: {
        ...complete.stage,
        settlement: { ...complete.stage.settlement, completedTick: complete.simulationTick + 1 },
      },
    }, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/stage/settlement",
    });
  });

  it("accepts a replacement scheduled by retained complete history independent of terminal order", () => {
    const base = createMaximalRunStateFixture();
    const resolved = base.consequences.resolved[0];
    const superseded = base.consequences.terminal[0];
    expect(resolved).toBeDefined();
    expect(superseded?.status).toBe("superseded");
    if (resolved === undefined || superseded?.status !== "superseded") return;
    const retained = {
      transactionId: resolved.transactionId,
      consequenceId: resolved.consequenceId,
      status: "complete" as const,
      causedByChoiceId: resolved.causedByChoiceId,
      resolution: resolved.resolution,
      presentedTick: resolved.presentedTick ?? resolved.resolution.resolvedTick,
      terminalTick: (resolved.presentedTick ?? resolved.resolution.resolvedTick) + 1,
      terminalReasonId: "reason-complete-v1",
      supersededByTransactionId: null,
      acknowledgmentId: null,
    };
    const history: RunStateV1 = {
      ...base,
      encounter: null,
      consequences: {
        ...base.consequences,
        resolved: [],
        terminal: [superseded, retained],
      },
    };
    expect(validateRunState(history, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: history });
  });

  it("keeps old consequence resolutions valid after their effects age out of the bounded ledger", () => {
    const base = createMaximalRunStateFixture();
    const laterEffects = Array.from({ length: 128 }, (_, index) => ({
      effectId: `effect-later-${index.toString().padStart(3, "0")}`,
      scoreId: "health" as const,
      requestedDelta: 0,
      source: "system" as const,
      categoryId: "choice-practice-v1",
      causedByChoiceId: null,
      transactionId: null,
      before: base.scores.health,
      after: base.scores.health,
      actualDelta: 0,
      simulationTick: 4_300 + index,
    }));
    const aged: RunStateV1 = {
      ...base,
      simulationTick: 4_500,
      effectLedger: { ...base.effectLedger, recent: laterEffects },
      recovery: null,
      runner: base.runner === null ? null : {
        ...base.runner,
        spawn: { ...base.runner.spawn, nextSpawnTick: 4_600 },
      },
    };
    expect(validateRunState(aged, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: aged });
    expect(decodeRunState(encodeRunState(aged), RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({
      kind: "ready",
      state: aged,
      migratedFrom: null,
    });
  });

  it("allows an owned effect evicted at an ambiguous same-tick retention boundary", () => {
    const base = createMaximalRunStateFixture();
    const sameTickEffects = Array.from({ length: 128 }, (_, index) => ({
      effectId: `effect-boundary-${index.toString().padStart(3, "0")}`,
      scoreId: "health" as const,
      requestedDelta: 0,
      source: "system" as const,
      categoryId: "choice-practice-v1",
      causedByChoiceId: null,
      transactionId: null,
      before: base.scores.health,
      after: base.scores.health,
      actualDelta: 0,
      simulationTick: 4_200,
    }));
    const boundary: RunStateV1 = {
      ...base,
      effectLedger: { ...base.effectLedger, recent: sameTickEffects },
      recovery: null,
    };
    expect(validateRunState(boundary, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state: boundary });
  });

  it("rejects missing unaged resolution effects and cause-ownership corruption", () => {
    const missing = mutableJson(createMaximalRunStateFixture());
    const missingConsequences = missing.consequences as { resolved: Array<Record<string, unknown>> };
    const missingResolution = missingConsequences.resolved[0]!.resolution as Record<string, unknown>;
    missingResolution.appliedEffectIds = ["effect-missing-0001"];
    expect(validateRunState(missing, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/consequences/resolved/0/resolution/appliedEffectIds",
    });

    const wrongCause = mutableJson(createMaximalRunStateFixture());
    const wrongConsequences = wrongCause.consequences as { pending: Array<Record<string, unknown>>; resolved: Array<Record<string, unknown>> };
    wrongConsequences.pending[0]!.causedByChoiceId = "choice-other-v1";
    wrongConsequences.resolved[0]!.causedByChoiceId = "choice-other-v1";
    const wrongResolution = wrongConsequences.resolved[0]!.resolution as Record<string, unknown>;
    wrongResolution.selectedOptionId = "option-other-v1";
    const wrongStory = wrongCause.storyState as { facts: Array<Record<string, unknown>> };
    wrongStory.facts[0]!.originChoiceId = "choice-other-v1";
    expect(validateRunState(wrongCause, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/consequences/resolved/0/resolution/appliedEffectIds",
    });
  });

  it("rejects a retained transaction effect omitted from its authoritative resolution", () => {
    const base = createMaximalRunStateFixture();
    const original = base.effectLedger.recent.find((effect) => effect.transactionId === "consequence-tx-0001");
    expect(original).toBeDefined();
    if (original === undefined) return;
    const extra = { ...original, effectId: "effect-choice-extra-0001", requestedDelta: 0, before: 63, after: 63, actualDelta: 0 };
    const state: RunStateV1 = {
      ...base,
      effectLedger: { ...base.effectLedger, recent: [...base.effectLedger.recent, extra] },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/consequences/resolved/0/resolution/appliedEffectIds",
    });
  });

  it("rejects a retained effect with an orphan transaction ID", () => {
    const state = mutableJson(createMaximalRunStateFixture());
    const ledger = state.effectLedger as { recent: Array<Record<string, unknown>> };
    ledger.recent[0]!.transactionId = "orphan-tx-0001";
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/effectLedger/recent/0/transactionId",
    });
  });

  it("keeps typed recovery history saveable after cooldown ownership retires", () => {
    const base = createMaximalRunStateFixture();
    expect(base.recovery).not.toBeNull();
    expect(base.runner).not.toBeNull();
    if (base.recovery === null || base.runner === null) return;
    const state: RunStateV1 = {
      ...base,
      simulationTick: base.recovery.cooldownUntilTick,
      recovery: null,
      runner: {
        ...base.runner,
        spawn: {
          ...base.runner.spawn,
          nextSpawnTick: base.recovery.cooldownUntilTick + 100,
        },
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state });
  });

  it("keeps a reclassified prior-stage settlement effect saveable on the next stage", () => {
    const base = createMaximalRunStateFixture();
    const historicalSettlement = {
      effectId: "effect-prior-settlement-0001",
      scoreId: "money" as const,
      requestedDelta: 0,
      source: "system" as const,
      categoryId: "choice-practice-v1",
      causedByChoiceId: null,
      transactionId: "stage-close-0001",
      before: base.scores.money,
      after: base.scores.money,
      actualDelta: 0,
      simulationTick: base.simulationTick,
    };
    const state: RunStateV1 = {
      ...base,
      effectLedger: {
        ...base.effectLedger,
        recent: [...base.effectLedger.recent, historicalSettlement],
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toEqual({ ok: true, state });
    const orphanedSystem: RunStateV1 = {
      ...state,
      effectLedger: {
        ...state.effectLedger,
        recent: state.effectLedger.recent.map((effect) =>
          effect.effectId === historicalSettlement.effectId
            ? { ...effect, transactionId: "consequence-tx-0002" }
            : effect
        ),
      },
    };
    expect(validateRunState(orphanedSystem, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      path: "/effectLedger/recent/3/transactionId",
    });
  });

  it("rejects a transactional effect whose transaction ID is null", () => {
    const base = createMaximalRunStateFixture();
    const state: RunStateV1 = {
      ...base,
      effectLedger: {
        ...base.effectLedger,
        recent: [
          ...base.effectLedger.recent,
          {
            effectId: "effect-choice-unowned-0001",
            scoreId: "happiness",
            requestedDelta: 0,
            source: "choice",
            categoryId: "choice-practice-v1",
            causedByChoiceId: "choice-ask-for-help-v1",
            transactionId: null,
            before: base.scores.happiness,
            after: base.scores.happiness,
            actualDelta: 0,
            simulationTick: base.simulationTick,
          },
        ],
      },
    };
    expect(validateRunState(state, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      code: "invalid-semantics",
      path: "/effectLedger/recent/3/transactionId",
    });
  });

  it("rejects future conditions and unowned runner invulnerability", () => {
    const base = createMaximalRunStateFixture();
    const condition = base.storyState.conditions[0];
    expect(condition).toBeDefined();
    if (condition === undefined) return;
    const futureCondition: RunStateV1 = {
      ...base,
      storyState: { ...base.storyState, conditions: [{ ...condition, startedTick: base.simulationTick + 1, expiresTick: null }] },
    };
    expect(validateRunState(futureCondition, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      path: "/storyState/conditions/0/startedTick",
    });
    expect(base.runner).not.toBeNull();
    if (base.runner === null) return;
    const unowned: RunStateV1 = {
      ...base,
      recovery: null,
      runner: { ...base.runner, invulnerableUntilTick: base.simulationTick + 100 },
    };
    expect(validateRunState(unowned, RUN_STATE_CONTRACT_FIXTURE_CATALOG)).toMatchObject({
      ok: false,
      path: "/runner/invulnerableUntilTick",
    });
  });
});
