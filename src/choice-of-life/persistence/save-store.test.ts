import { describe, expect, it } from "vitest";
import {
  RUN_STATE_CONTRACT_ENTRIES,
  RUN_STATE_CONTRACT_FIXTURE_CATALOG,
  createCatalogRegistry,
} from "../core/catalog";
import { decodeRunState, encodeRunState, utf8ByteLength } from "../core/run-state-codec";
import { createMaximalRunStateFixture, createSyntheticV0Fixture } from "../core/run-state-fixtures";
import {
  ACTIVE_RUN_STORAGE_KEY,
  QUARANTINE_EXCERPT_MAX_UTF8_BYTES,
  QUARANTINE_RECORD_MAX_UTF8_BYTES,
  QUARANTINE_STORAGE_KEY,
  createSaveStore,
  type QuarantineRecordV1,
} from "./save-store";
import type { StoragePort } from "./storage-port";

class RecordingStorage implements StoragePort {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  failGet = false;
  failSetKey: string | null = null;
  failRemoveKey: string | null = null;

  getItem(key: string): string | null {
    this.calls.push(`get:${key}`);
    if (this.failGet) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.calls.push(`set:${key}`);
    if (this.failSetKey === key) throw new Error("write unavailable");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.calls.push(`remove:${key}`);
    if (this.failRemoveKey === key) throw new Error("remove unavailable");
    this.values.delete(key);
  }
}

describe("injected save store", () => {
  it("saves and loads a validated current run using only the active/quarantine keys", () => {
    const storage = new RecordingStorage();
    const v5Sentinels = [
      "choice-of-life-v1-active-life",
      "choice-of-life-v1-biographies",
      "choice-of-life-v1-local-funnel",
      "choice-of-life-v1-sound",
      "choice-of-life-v1-guide-seen",
      "choice-of-life-v1-theme",
    ] as const;
    v5Sentinels.forEach((key) => storage.values.set(key, `sentinel:${key}`));
    const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    const state = createMaximalRunStateFixture();

    expect(store.save(state)).toEqual({ kind: "saved" });
    expect(store.load()).toEqual({ kind: "ready", state, migrated: false });
    v5Sentinels.forEach((key) => expect(storage.values.get(key)).toBe(`sentinel:${key}`));
    expect(new Set(storage.calls.map((call) => call.split(":").slice(1).join(":")))).toEqual(
      new Set([ACTIVE_RUN_STORAGE_KEY, QUARANTINE_STORAGE_KEY]),
    );
  });

  it("writes quarantine before removing invalid active data", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "{not-json");
    const result = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load();
    expect(result).toEqual({ kind: "quarantined", code: "malformed-json" });
    expect(storage.calls.indexOf(`set:${QUARANTINE_STORAGE_KEY}`)).toBeLessThan(storage.calls.indexOf(`remove:${ACTIVE_RUN_STORAGE_KEY}`));
    expect(storage.values.has(ACTIVE_RUN_STORAGE_KEY)).toBe(false);
    const quarantine = JSON.parse(storage.values.get(QUARANTINE_STORAGE_KEY) ?? "") as QuarantineRecordV1;
    expect(quarantine.code).toBe("malformed-json");
    expect(utf8ByteLength(quarantine.rawExcerpt)).toBeLessThanOrEqual(QUARANTINE_EXCERPT_MAX_UTF8_BYTES);
  });

  it("bounds the final escaped quarantine record, not only its raw excerpt", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "\u0000".repeat(10_000));
    expect(createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load()).toEqual({
      kind: "quarantined",
      code: "malformed-json",
    });
    const encoded = storage.values.get(QUARANTINE_STORAGE_KEY) ?? "";
    expect(utf8ByteLength(encoded)).toBeLessThanOrEqual(QUARANTINE_RECORD_MAX_UTF8_BYTES);
    const record = JSON.parse(encoded) as QuarantineRecordV1;
    expect(utf8ByteLength(record.rawExcerpt)).toBeLessThan(QUARANTINE_EXCERPT_MAX_UTF8_BYTES);
  });

  it("leaves active data intact when quarantine cannot be written", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "bad");
    storage.failSetKey = QUARANTINE_STORAGE_KEY;
    const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(store.load()).toEqual({
      kind: "unavailable",
      operation: "write",
      state: null,
    });
    expect(storage.values.get(ACTIVE_RUN_STORAGE_KEY)).toBe("bad");
    expect(storage.calls).not.toContain(`remove:${ACTIVE_RUN_STORAGE_KEY}`);
    const failedWrites = storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length;
    expect(store.load()).toEqual({ kind: "unavailable", operation: "write", state: null });
    expect(storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length).toBe(failedWrites);
  });

  it("uses a matching quarantine digest to suppress repeat parsing after remove failure", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "bad");
    storage.failRemoveKey = ACTIVE_RUN_STORAGE_KEY;
    const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(store.load()).toMatchObject({ kind: "unavailable", operation: "remove" });
    const writesAfterFirst = storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length;
    expect(store.load()).toEqual({ kind: "quarantined", code: "malformed-json" });
    expect(storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length).toBe(writesAfterFirst);
  });

  it("normalizes lone surrogates and suppresses every repeated quarantine side effect", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "\ud800");
    storage.failRemoveKey = ACTIVE_RUN_STORAGE_KEY;
    const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(store.load()).toEqual({ kind: "unavailable", operation: "remove", state: null });
    const encoded = storage.values.get(QUARANTINE_STORAGE_KEY) ?? "";
    const record = JSON.parse(encoded) as QuarantineRecordV1;
    expect(record.rawExcerpt).toBe("\ufffd");
    const writes = storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length;
    const removals = storage.calls.filter((call) => call === `remove:${ACTIVE_RUN_STORAGE_KEY}`).length;
    expect(store.load()).toEqual({ kind: "quarantined", code: "malformed-json" });
    expect(storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`)).toHaveLength(writes);
    expect(storage.calls.filter((call) => call === `remove:${ACTIVE_RUN_STORAGE_KEY}`)).toHaveLength(removals);
    expect(storage.values.get(QUARANTINE_STORAGE_KEY)).toBe(encoded);
  });

  it("sanitizes hostile metadata so a remove failure is suppressed on the next load", () => {
    const inputs = [
      JSON.stringify({ schemaVersion: -1, contentVersion: "phase-1-v1" }),
      '{"schemaVersion":1,"contentVersion":"\\ud800"}',
    ];
    for (const [index, input] of inputs.entries()) {
      const storage = new RecordingStorage();
      storage.values.set(ACTIVE_RUN_STORAGE_KEY, input);
      storage.failRemoveKey = ACTIVE_RUN_STORAGE_KEY;
      const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
      expect(store.load()).toMatchObject({ kind: "unavailable", operation: "remove" });
      const record = JSON.parse(storage.values.get(QUARANTINE_STORAGE_KEY) ?? "") as QuarantineRecordV1;
      expect(record.schemaVersion === null || (Number.isSafeInteger(record.schemaVersion) && record.schemaVersion >= 0)).toBe(true);
      expect(record.contentVersion).toBe(index === 0 ? "phase-1-v1" : null);
      const writes = storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`).length;
      expect(store.load()).toMatchObject({ kind: "quarantined" });
      expect(storage.calls.filter((call) => call === `set:${QUARANTINE_STORAGE_KEY}`)).toHaveLength(writes);
    }
  });

  it("keeps the original v0 value when migration persistence fails", () => {
    const storage = new RecordingStorage();
    const original = JSON.stringify(createSyntheticV0Fixture());
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, original);
    storage.failSetKey = ACTIVE_RUN_STORAGE_KEY;
    const result = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load();
    expect(result).toMatchObject({ kind: "unavailable", operation: "write" });
    expect(result.kind === "unavailable" && result.state?.schemaVersion).toBe(1);
    expect(storage.values.get(ACTIVE_RUN_STORAGE_KEY)).toBe(original);
  });

  it("commits a valid migration and is idempotent on the next load", () => {
    const storage = new RecordingStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(createSyntheticV0Fixture()));
    const store = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(store.load()).toMatchObject({ kind: "ready", migrated: true });
    expect(store.load()).toMatchObject({ kind: "ready", migrated: false });
  });

  it("catches storage reads/removals and preserves an in-memory save on write failure", () => {
    const readFailure = new RecordingStorage();
    readFailure.failGet = true;
    expect(createSaveStore(readFailure, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load()).toEqual({ kind: "unavailable", operation: "read", state: null });

    const writeFailure = new RecordingStorage();
    writeFailure.failSetKey = ACTIVE_RUN_STORAGE_KEY;
    const state = createMaximalRunStateFixture();
    expect(createSaveStore(writeFailure, RUN_STATE_CONTRACT_FIXTURE_CATALOG).save(state)).toEqual({ kind: "unavailable", operation: "write", state });

    const removeFailure = new RecordingStorage();
    removeFailure.values.set(ACTIVE_RUN_STORAGE_KEY, encodeRunState(state));
    removeFailure.failRemoveKey = ACTIVE_RUN_STORAGE_KEY;
    expect(createSaveStore(removeFailure, RUN_STATE_CONTRACT_FIXTURE_CATALOG).removeActive()).toEqual({ kind: "unavailable", operation: "remove" });
  });

  it("rejects oversized or malformed quarantine metadata before trusting its digest", () => {
    const invalidRecords: readonly string[] = [
      "x".repeat(QUARANTINE_RECORD_MAX_UTF8_BYTES + 1),
      JSON.stringify({
        version: 1,
        code: "malformed-json",
        schemaVersion: Number.MAX_SAFE_INTEGER + 1,
        contentVersion: null,
        originalUtf8Length: 3,
        digest: "d70ee7510761e69d",
        rawExcerpt: "bad",
      }),
      JSON.stringify({
        version: 1,
        code: "malformed-json",
        schemaVersion: null,
        contentVersion: "x".repeat(257),
        originalUtf8Length: 3,
        digest: "d70ee7510761e69d",
        rawExcerpt: "bad",
      }),
      JSON.stringify({
        version: 1,
        code: "malformed-json",
        schemaVersion: null,
        contentVersion: "\ud800",
        originalUtf8Length: 3,
        digest: "d70ee7510761e69d",
        rawExcerpt: "bad",
      }),
    ];
    for (const prior of invalidRecords) {
      const storage = new RecordingStorage();
      storage.values.set(ACTIVE_RUN_STORAGE_KEY, "bad");
      storage.values.set(QUARANTINE_STORAGE_KEY, prior);
      expect(createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load()).toEqual({
        kind: "quarantined",
        code: "malformed-json",
      });
      expect(storage.values.has(ACTIVE_RUN_STORAGE_KEY)).toBe(false);
      expect(storage.calls).toContain(`set:${QUARANTINE_STORAGE_KEY}`);
    }
  });

  it("never stores a sparse state that would change shape after JSON serialization", () => {
    const storage = new RecordingStorage();
    const base = createMaximalRunStateFixture();
    const sparse = new Array(1) as typeof base.storyState.memories;
    const forged = { ...base, storyState: { ...base.storyState, memories: sparse } };
    expect(createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).save(forged)).toMatchObject({
      kind: "invalid",
      path: "/storyState/memories",
    });
    expect(storage.values.has(ACTIVE_RUN_STORAGE_KEY)).toBe(false);
  });

  it("round trips the largest valid 256-scalar memory corpus below the exact UTF-8 save cap", () => {
    const memoryEntries = Array.from({ length: 128 }, (_, index) => ({
      id: `memory-near-limit-${index.toString().padStart(3, "0")}-v1`,
      kind: "relationship",
    }));
    const catalog = createCatalogRegistry(
      { ...RUN_STATE_CONTRACT_ENTRIES, memory: memoryEntries },
      { entityInstanceIdPolicy: "contract-fixture-v1" },
    );
    const base = createMaximalRunStateFixture();
    const makeState = (count: number) => ({
      ...base,
      storyState: {
        ...base.storyState,
        memories: memoryEntries.slice(0, count).map((entry) => ({
          memoryId: entry.id,
          kind: "relationship" as const,
          stageId: "runner-lab-v1",
          summary: "🙂".repeat(256),
          originChoiceId: "choice-ask-for-help-v1",
        })),
      },
    });
    let lower = 0;
    let upper = 128;
    let largest = 0;
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      try {
        encodeRunState(makeState(middle));
        largest = middle;
        lower = middle + 1;
      } catch {
        upper = middle - 1;
      }
    }
    expect(largest).toBeGreaterThan(0);
    expect(largest).toBeLessThan(128);
    const state = makeState(largest);
    const encoded = encodeRunState(state);
    expect(utf8ByteLength(encoded)).toBeGreaterThan(95_000);
    expect(utf8ByteLength(encoded)).toBeLessThanOrEqual(99_999);
    expect(() => encodeRunState(makeState(largest + 1))).toThrow(/99,999/);
    expect(decodeRunState(encoded, catalog)).toEqual({ kind: "ready", state, migratedFrom: null });

    const storage = new RecordingStorage();
    const store = createSaveStore(storage, catalog);
    expect(store.save(state)).toEqual({ kind: "saved" });
    expect(store.load()).toEqual({ kind: "ready", state, migrated: false });
    expect(storage.values.get(ACTIVE_RUN_STORAGE_KEY)).toBe(encoded);
  });
});
