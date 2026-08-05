import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build as esbuild } from "esbuild";
import { minify } from "terser";
import { describe, expect, it } from "vitest";

import { createAuditedPropertyMangleOptions } from "./property-mangle-policy.mjs";
import { poolRepeatedStringValues } from "./string-value-pooling.mjs";

const REPOSITORY_ROOT = process.cwd();

const CROSS_BUILD_HARNESS = String.raw`
import {
  decodeRunState,
  encodeRunState,
} from "./src/choice-of-life/core/run-state-codec.ts";
import {
  createCompletedRunStateFixture,
  createMaximalRunStateFixture,
  createSelectingEncounterFixture,
  createSettlingRunStateFixture,
  createSyntheticV0Fixture,
  createUnresolvedRecoveryFixture,
  RUN_STATE_CONTRACT_FIXTURE_CATALOG,
} from "./src/choice-of-life/core/run-state-fixtures.ts";
import { stateHashV1 } from "./src/choice-of-life/core/run-state-hash.ts";
import { toRunStateWireValue } from "./src/choice-of-life/core/run-state-wire.ts";
import {
  ACTIVE_RUN_STORAGE_KEY,
  createSaveStore,
  QUARANTINE_STORAGE_KEY,
} from "./src/choice-of-life/persistence/save-store.ts";

function encodedCorpus() {
  return [
    ["maximal", encodeRunState(createMaximalRunStateFixture())],
    ["v0", JSON.stringify(toRunStateWireValue(createSyntheticV0Fixture()))],
    ["pending", encodeRunState(createSelectingEncounterFixture("option-selected"))],
    ["settling", encodeRunState(createSettlingRunStateFixture())],
    ["complete", encodeRunState(createCompletedRunStateFixture())],
    ["recovery", encodeRunState(createUnresolvedRecoveryFixture("offered"))],
  ];
}

function memoryStorage(initialEntries) {
  const values = new Map(initialEntries);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

export function emitCorpus() {
  return JSON.stringify(encodedCorpus());
}

export function acceptCorpus(serialized) {
  const records = JSON.parse(serialized);
  return JSON.stringify(records.map(([id, text]) => {
    const decoded = decodeRunState(text, RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    if (decoded.kind !== "ready") return [id, decoded.kind, decoded.code];
    return [
      id,
      decoded.kind,
      decoded.migratedFrom,
      stateHashV1(decoded.state),
      encodeRunState(decoded.state),
    ];
  }));
}

export function createQuarantine(rawText) {
  const storage = memoryStorage([[ACTIVE_RUN_STORAGE_KEY, rawText]]);
  const result = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load();
  return JSON.stringify([
    result.kind,
    result.kind === "quarantined" ? result.code : null,
    storage.getItem(QUARANTINE_STORAGE_KEY),
    storage.getItem(ACTIVE_RUN_STORAGE_KEY),
  ]);
}

export function consumeQuarantine(rawText, quarantineText) {
  const storage = memoryStorage([
    [ACTIVE_RUN_STORAGE_KEY, rawText],
    [QUARANTINE_STORAGE_KEY, quarantineText],
  ]);
  const result = createSaveStore(storage, RUN_STATE_CONTRACT_FIXTURE_CATALOG).load();
  return JSON.stringify([
    result.kind,
    result.kind === "quarantined" ? result.code : null,
    storage.getItem(QUARANTINE_STORAGE_KEY),
    storage.getItem(ACTIVE_RUN_STORAGE_KEY),
  ]);
}
`;

async function buildHarness(propertyOptions, poolStrings = false) {
  const bundled = await esbuild({
    stdin: {
      contents: CROSS_BUILD_HARNESS,
      loader: "ts",
      resolveDir: REPOSITORY_ROOT,
      sourcefile: "property-mangle-cross-build-entry.ts",
    },
    bundle: true,
    define: { "import.meta.env.DEV": "false" },
    format: "esm",
    platform: "node",
    target: "es2022",
    treeShaking: true,
    write: false,
  });
  const source = bundled.outputFiles[0]?.text;
  if (source === undefined) throw new TypeError("Cross-build harness emitted no JavaScript");
  const pooling = poolStrings ? poolRepeatedStringValues(source) : null;
  if (poolStrings && pooling?.changed !== true) {
    throw new TypeError("Cross-build harness did not exercise string pooling");
  }
  const output = await minify(pooling?.code ?? source, {
    compress: { passes: 3 },
    mangle: {
      module: true,
      toplevel: true,
      ...(propertyOptions === null ? {} : { properties: propertyOptions }),
    },
    format: { comments: false },
    module: true,
  });
  if (output.code === undefined) throw new TypeError("Terser emitted no JavaScript");
  return output.code;
}

async function importBuild(directory, name, code) {
  const filename = path.join(directory, `${name}.mjs`);
  await fs.writeFile(filename, code, "utf8");
  return import(`${pathToFileURL(filename).href}?build=${name}`);
}

describe("property-mangled durable persistence compatibility", () => {
  it("round-trips old↔mangled saves and quarantine records", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "choice-property-mangle-"));
    const normalizedTemp = path.resolve(os.tmpdir()) + path.sep;
    expect(path.resolve(tempRoot).startsWith(normalizedTemp)).toBe(true);
    try {
      const propertyOptions = createAuditedPropertyMangleOptions(
        REPOSITORY_ROOT,
      );
      const [oldCode, mangledCode] = await Promise.all([
        buildHarness(null),
        buildHarness(propertyOptions, true),
      ]);
      const [oldBuild, mangledBuild] = await Promise.all([
        importBuild(tempRoot, "old", oldCode),
        importBuild(tempRoot, "mangled", mangledCode),
      ]);

      const oldCorpus = oldBuild.emitCorpus();
      const mangledCorpus = mangledBuild.emitCorpus();
      expect(mangledCorpus).toBe(oldCorpus);

      const oldToMangled = JSON.parse(mangledBuild.acceptCorpus(oldCorpus));
      const mangledToOld = JSON.parse(oldBuild.acceptCorpus(mangledCorpus));
      expect(oldToMangled).toEqual(mangledToOld);
      expect(oldToMangled.map((record) => record[0])).toEqual([
        "maximal", "v0", "pending", "settling", "complete", "recovery",
      ]);
      expect(oldToMangled.every((record) => record[1] === "ready")).toBe(true);
      expect(oldToMangled.find((record) => record[0] === "v0")?.[2]).toBe(0);
      expect(oldToMangled
        .filter((record) => record[0] !== "v0")
        .every((record) => record[2] === null)).toBe(true);

      const hostileSave = JSON.stringify({
        schemaVersion: 1,
        contentVersion: "phase-1-v1",
        unexpected: true,
      });
      const oldQuarantine = JSON.parse(oldBuild.createQuarantine(hostileSave));
      const mangledQuarantine = JSON.parse(
        mangledBuild.createQuarantine(hostileSave),
      );
      expect(mangledQuarantine).toEqual(oldQuarantine);
      expect(oldQuarantine.slice(0, 2)).toEqual([
        "quarantined", "invalid-structure",
      ]);
      expect(oldQuarantine[3]).toBeNull();
      const record = JSON.parse(oldQuarantine[2]);
      expect(Object.keys(record)).toEqual([
        "version", "code", "schemaVersion", "contentVersion",
        "originalUtf8Length", "digest", "rawExcerpt",
      ]);

      expect(JSON.parse(mangledBuild.consumeQuarantine(
        hostileSave,
        oldQuarantine[2],
      ))).toEqual([
        "quarantined", "invalid-structure", oldQuarantine[2], hostileSave,
      ]);
      expect(JSON.parse(oldBuild.consumeQuarantine(
        hostileSave,
        mangledQuarantine[2],
      ))).toEqual([
        "quarantined", "invalid-structure", mangledQuarantine[2], hostileSave,
      ]);
    } finally {
      if (path.resolve(tempRoot).startsWith(normalizedTemp)) {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  }, 120_000);
});
