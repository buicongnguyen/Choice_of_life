import { describe, expect, it } from "vitest";
import path from "node:path";

import { minify } from "terser";

import {
  assertPropertyMangleProductionGraph,
  comparePropertyMangleProductionGraph,
  createAuditedPropertyMangleOptions,
  createPropertyManglePolicy,
} from "./property-mangle-policy.mjs";

const policy = createPropertyManglePolicy();

describe("production property-mangle policy", () => {
  it("follows the production browser graph", () => {
    expect(policy.sourceFiles).toContain("src/main.ts");
    expect(policy.sourceFiles).toContain("src/choice-of-life/app.ts");
    expect(policy.sourceFiles).toContain(
      "src/choice-of-life/core/run-state-wire.ts",
    );
    expect(policy.sourceFiles.some((file) => file.endsWith(".test.ts"))).toBe(false);
    expect(policy.sourceFiles.some((file) => file.endsWith(".css"))).toBe(false);
    expect(policy.sourceFiles).not.toContain(
      "src/choice-of-life/core/runner/evaluation-replay.ts",
    );
    expect(policy.sourceFiles).toEqual([...policy.sourceFiles].sort());
  });

  it("excludes dynamic and browser-reflected keys", () => {
    const safe = new Set(policy.safeNames);
    expect(policy.dynamicSemanticNames).toEqual([
      "health", "happiness", "money",
      "runner", "choice", "callback", "settlement", "recovery", "system",
      "healthPositive", "healthNegative",
      "happinessPositive", "happinessNegative",
      "moneyPositive", "moneyNegative",
    ]);
    expect(policy.semanticAttributeNames).toEqual([
      "for", "id", "max", "min", "role", "tabindex",
    ]);
    for (const name of [
      ...policy.dynamicSemanticNames,
      ...policy.semanticAttributeNames,
      "story",
      "normal",
      "challenge",
      ...policy.datasetNames,
    ]) {
      expect(safe.has(name), name).toBe(false);
      expect(policy.pattern.test(name), name).toBe(false);
    }
  });

  it("pins imported JSON manifest properties used by V5 asset loaders", () => {
    expect(policy.jsonManifestFiles).toEqual([
      "src/assets/career-outfits/career-outfit-anchors.json",
      "src/assets/characters/character-anchors.json",
      "src/assets/characters/character-appearance-alternate-anchors.json",
      "src/assets/characters/character-frame-metrics.json",
      "src/assets/characters/character-motion-anchors.json",
      "src/assets/characters/character-stage-expansion-anchors.json",
      "src/assets/occupations/occupation-anchors.json",
      "src/assets/summer/summer-anchors.json",
    ]);
    for (const name of [
      "ageBands", "atlases", "cellSize", "families", "pack", "packs",
      "rows", "uniforms",
    ]) {
      expect(policy.jsonManifestNames).toContain(name);
      expect(policy.reflectedNames).toContain(name);
      expect(policy.safeNames).not.toContain(name);
      expect(policy.pattern.test(name), name).toBe(false);
    }
  });

  it("pins quarantine and durable save-wire boundaries", () => {
    expect(policy.quarantineWireNames).toEqual([
      "version", "code", "schemaVersion", "contentVersion",
      "originalUtf8Length", "digest", "rawExcerpt",
    ]);
    expect(policy.runStateWireNames).toHaveLength(137);
    expect(new Set(policy.runStateWireNames).size).toBe(137);
    for (const name of policy.quarantineWireNames) {
      expect(policy.reflectedNames).toContain(name);
      expect(policy.safeNames).not.toContain(name);
      expect(policy.pattern.test(name), name).toBe(false);
    }
    for (const name of [
      "schemaVersion", "contentVersion", "runId", "runner", "settlement",
    ]) {
      expect(policy.runStateWireNames).toContain(name);
    }
  });

  it("keeps wire-adapted internal state fields eligible", () => {
    for (const name of [
      "activeEntities",
      "worldDistanceMilli",
      "resolvedEntityIds",
      "invulnerableUntilTick",
    ]) {
      expect(policy.safeNames.includes(name), name).toBe(true);
      expect(policy.pattern.test(name), name).toBe(true);
    }
  });

  it("produces sorted, unique, disjoint output", () => {
    expect(policy.candidateNames).toEqual(
      [...new Set(policy.candidateNames)].sort(),
    );
    expect(policy.safeNames).toEqual([...new Set(policy.safeNames)].sort());
    const reflected = new Set(policy.reflectedNames);
    for (const name of policy.safeNames) {
      expect(policy.candidateNames).toContain(name);
      expect(reflected.has(name), name).toBe(false);
    }
  });

  it("fails closed on omitted or extra first-party production modules", () => {
    const moduleIds = policy.sourceFiles.map((file) =>
      path.resolve(process.cwd(), file));
    expect(assertPropertyMangleProductionGraph(process.cwd(), moduleIds))
      .toMatchObject({
        missingFromPolicy: [],
        absentFromRollupGraph: [],
        emittedMissingFromPolicy: [],
      });

    const withoutApp = moduleIds.filter((file) =>
      !file.endsWith(path.join("choice-of-life", "app.ts")));
    expect(comparePropertyMangleProductionGraph(process.cwd(), withoutApp))
      .toMatchObject({ absentFromRollupGraph: ["src/choice-of-life/app.ts"] });
    expect(() => assertPropertyMangleProductionGraph(process.cwd(), [
      ...moduleIds,
      path.resolve(process.cwd(), "src/unreviewed-runtime.ts"),
    ])).toThrow(/Missing from policy: src\/unreviewed-runtime\.ts/);
    expect(() => assertPropertyMangleProductionGraph(
      process.cwd(),
      moduleIds,
      [...moduleIds, path.resolve(process.cwd(), "src/unreviewed-output.ts")],
    )).toThrow(/Emitted but missing from policy: src\/unreviewed-output\.ts/);

    const withoutAuthenticationOutput = moduleIds.filter((file) =>
      !file.endsWith(path.join("runner", "evaluation-authentication.ts")));
    expect(assertPropertyMangleProductionGraph(
      process.cwd(),
      moduleIds,
      withoutAuthenticationOutput,
    ).treeShakenSourceFiles).toEqual([
      "src/choice-of-life/core/runner/evaluation-authentication.ts",
    ]);
  });

  it("proves the exact Terser property-mangle safety contract", async () => {
    const propertyOptions = createAuditedPropertyMangleOptions();
    expect(propertyOptions).toEqual({
      regex: policy.pattern,
      keep_quoted: "strict",
      builtins: false,
    });
    const resultKey = "__choiceOfLifePropertyMangleContractV1";
    const source = `
      globalThis.${resultKey} = (() => {
        const runtime = { activeEntities: [1], worldDistanceMilli: 2 };
        runtime.activeEntities.push(runtime.worldDistanceMilli);
        const calls = [];
        const browserApi = {
          addEventListener(type) { calls.push(type); },
          scrollIntoView(options) { calls.push(options.block); },
          setAttribute(name, value) { calls.push(name + "=" + value); },
        };
        browserApi.addEventListener("click");
        browserApi.scrollIntoView({ block: "nearest" });
        browserApi.setAttribute("tabindex", "0");
        const dataDescriptor = {
          value: 1,
          enumerable: true,
          configurable: true,
          writable: true,
        };
        const dataTarget = {};
        Object.defineProperty(dataTarget, "answer", dataDescriptor);
        dataTarget.answer = 2;
        let stored = 3;
        const accessorDescriptor = {
          enumerable: true,
          configurable: true,
          get() { return stored; },
          set(next) { stored = next; calls.push("set=" + String(next)); },
        };
        const accessorTarget = {};
        Object.defineProperty(accessorTarget, "score", accessorDescriptor);
        accessorTarget.score = 4;
        const view = { attributes: { "tabindex": "-1", "aria-live": "polite" } };
        return JSON.stringify([
          Object.keys(runtime).sort(),
          Object.keys(browserApi).sort(),
          Object.keys(dataDescriptor).sort(),
          Object.keys(accessorDescriptor).sort(),
          Object.keys(view.attributes).sort(),
          calls,
          [
            dataTarget.answer,
            accessorTarget.score,
            Object.keys(dataTarget),
            Object.keys(accessorTarget),
          ],
        ]);
      })();
    `;
    const minified = await minify(source, {
      compress: { passes: 3 },
      mangle: {
        module: true,
        toplevel: true,
        properties: propertyOptions,
      },
      format: { comments: false },
    });
    expect(minified.code).toBeTypeOf("string");
    let payload;
    try {
      Function(minified.code)();
      payload = JSON.parse(globalThis[resultKey]);
    } finally {
      Reflect.deleteProperty(globalThis, resultKey);
    }

    expect(payload[0]).toHaveLength(2);
    expect(payload[0]).not.toContain("activeEntities");
    expect(payload[0]).not.toContain("worldDistanceMilli");
    expect(payload[1]).toEqual([
      "addEventListener", "scrollIntoView", "setAttribute",
    ]);
    expect(payload[2]).toEqual([
      "configurable", "enumerable", "value", "writable",
    ]);
    expect(payload[3]).toEqual([
      "configurable", "enumerable", "get", "set",
    ]);
    expect(payload[4]).toEqual(["aria-live", "tabindex"]);
    expect(payload[5]).toEqual([
      "click", "nearest", "tabindex=0", "set=4",
    ]);
    expect(payload[6]).toEqual([2, 4, ["answer"], ["score"]]);
  });
});
