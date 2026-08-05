import { describe, expect, it } from "vitest";

import schema from "../../../docs/save/run-state-v1.schema.json";
import {
  decodeRunState,
  encodeRunState,
} from "./run-state-codec";
import {
  createMaximalRunStateFixture,
  createSyntheticV0Fixture,
  RUN_STATE_CONTRACT_FIXTURE_CATALOG,
} from "./run-state-fixtures";
import { stateHashV1 } from "./run-state-hash";
import {
  certifyRunStateWireBijectionV1,
  fromRunStateWireValue,
  RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID,
  RUN_STATE_WIRE_KEYS_V1,
  toRunStateWireValue,
} from "./run-state-wire";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaObjectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => schemaObjectKeys(item, output));
    return output;
  }
  if (!isRecord(value)) return output;
  if (value.type === "object" && isRecord(value.properties)) {
    Object.keys(value.properties).forEach((key) => output.add(key));
  }
  Object.values(value).forEach((item) => schemaObjectKeys(item, output));
  return output;
}

function allObjectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => allObjectKeys(item, output));
    return output;
  }
  if (!isRecord(value)) return output;
  Object.entries(value).forEach(([key, item]) => {
    output.add(key);
    allObjectKeys(item, output);
  });
  return output;
}

describe("RunStateV1 durable wire-key adapter", () => {
  it("executes and mutation-tests the complete production bijection certificate", () => {
    const certificate = certifyRunStateWireBijectionV1();
    expect(certificate).toEqual({
      certificateId: RUN_STATE_WIRE_BIJECTION_CERTIFICATE_ID,
      keyCount: 137,
      pairDigest: expect.stringMatching(/^[0-9a-f]{16}$/),
      recursiveInverseDigest: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(Object.isFrozen(certificate)).toBe(true);
    expect(certifyRunStateWireBijectionV1()).toBe(certificate);
    expect(certifyRunStateWireBijectionV1((pairs) => pairs.map((pair) => ({
      ...pair,
    })))).toEqual(certificate);

    expect(() => certifyRunStateWireBijectionV1((pairs) =>
      pairs.slice(1))).toThrow(/exactly 137 pairs/);
    expect(() => certifyRunStateWireBijectionV1((pairs) => pairs.map(
      (pair, index) => index === 17
        ? { ...pair, wireKey: "changedDurableKey" }
        : pair,
    ))).toThrow(/pair 17 changed/);
    expect(() => certifyRunStateWireBijectionV1((pairs) => pairs.map(
      (pair, index) => index === 23
        ? { ...pair, internalKey: pairs[22]!.internalKey }
        : pair,
    ))).toThrow(/pair 23 changed|duplicate key/);
  });

  it("covers exactly the persisted object-property closure in the immutable schema", () => {
    expect([...RUN_STATE_WIRE_KEYS_V1].sort()).toEqual(
      [...schemaObjectKeys(schema)].sort(),
    );
    expect(new Set(RUN_STATE_WIRE_KEYS_V1).size).toBe(137);
  });

  it("clones without mutation, preserves identity sharing, and uses safe null prototypes", () => {
    const state = createMaximalRunStateFixture();
    const before = JSON.stringify(state);
    const shared = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(shared, "health", {
      value: 1,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const graph = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(graph, {
      scores: { value: shared, enumerable: true },
      targetScores: { value: shared, enumerable: true },
    });

    const translatedGraph = toRunStateWireValue(graph) as Record<string, unknown>;
    expect(translatedGraph).not.toBe(graph);
    expect(Object.getPrototypeOf(translatedGraph)).toBeNull();
    expect(translatedGraph.scores).toBe(translatedGraph.targetScores);

    const wire = toRunStateWireValue(state);
    const restored = fromRunStateWireValue(wire);
    expect(wire).not.toBe(state);
    expect(Object.getPrototypeOf(wire)).toBeNull();
    expect(restored).toEqual(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("emits only exact durable schema keys and preserves the golden state hash", () => {
    const state = createMaximalRunStateFixture();
    const expectedHash = stateHashV1(state);
    const encoded = encodeRunState(state);
    const raw = JSON.parse(encoded) as Record<string, unknown>;

    expect(Object.keys(raw).sort()).toEqual([
      "accessibility", "appearance", "consequences", "contentVersion",
      "controlMode", "difficulty", "effectLedger", "encounter", "identity",
      "recovery", "runId", "runner", "runSeed", "runStatus", "schemaVersion",
      "scores", "simulationTick", "stage", "startingProfileId", "storyState",
    ].sort());
    expect([...allObjectKeys(raw)].every((key) =>
      RUN_STATE_WIRE_KEYS_V1.includes(key as never))).toBe(true);

    const decoded = decodeRunState(encoded, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    expect(stateHashV1(decoded.state)).toBe(expectedHash);
    expect(encodeRunState(decoded.state)).toBe(encoded);
  });

  it("migrates legacy wire keys and round-trips the maximal corpus", () => {
    const legacy = createSyntheticV0Fixture();
    const migrated = decodeRunState(
      JSON.stringify(legacy),
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
    );
    expect(migrated).toMatchObject({ kind: "ready", migratedFrom: 0 });
    if (migrated.kind !== "ready") return;
    expect(decodeRunState(
      encodeRunState(migrated.state),
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
    )).toEqual({ kind: "ready", state: migrated.state, migratedFrom: null });
  });

  it("rejects unknown/accessor/symbol shapes and cannot pollute prototypes", () => {
    const raw = JSON.parse(encodeRunState(createMaximalRunStateFixture())) as
      Record<string, unknown>;
    Object.defineProperty(raw, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(decodeRunState(
      JSON.stringify(raw),
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
    )).toMatchObject({ kind: "invalid", code: "invalid-structure" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const malicious = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    const detached = fromRunStateWireValue(malicious) as Record<string, unknown>;
    expect(Object.getPrototypeOf(detached)).toBeNull();
    expect(Object.hasOwn(detached, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "schemaVersion", {
      get: () => 1,
      enumerable: true,
    });
    expect(() => fromRunStateWireValue(accessor)).toThrow(/data properties/);
    const symbol = Object.create(null) as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = true;
    expect(() => fromRunStateWireValue(symbol)).toThrow(/symbol keys/);
  });
});
