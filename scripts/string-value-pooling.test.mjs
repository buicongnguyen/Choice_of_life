import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";

import {
  createRepeatedStringValuePoolingPlugin,
  poolRepeatedStringValues,
} from "./string-value-pooling.mjs";

const FORCE_POOL = Object.freeze({
  minimumEstimatedSavings: 0,
  minimumOccurrences: 2,
  minimumStringLength: 1,
});

function evaluateScript(source) {
  return Function(source)();
}

describe("audited repeated expression string-value pooling", () => {
  it("preserves Unicode, escapes, lone surrogates, and primitive string values", () => {
    const source = String.raw`
      const values = [
        "caf\u00e9-very-long-value", "café-very-long-value",
        "emoji-\ud83d\ude80-very-long", "emoji-🚀-very-long",
        "lone-\ud800-surrogate-long", "lone-\ud800-surrogate-long",
        "line-\u2028-separator-long", "line-\u2028-separator-long",
      ];
      return values.map((value) => [typeof value, value, value.length]);
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(evaluateScript(transformed.code)).toEqual(evaluateScript(source));
    expect(transformed.code).toContain("\\u2028");
  });

  it("leaves directive prologues and every template form untouched", () => {
    const source = `"use strict";
      function read(value) {
        "use strict";
        return [
          "ordinary-repeated-value-long", "ordinary-repeated-value-long",
          \`template-repeated-value-long\`,
          tag\`tagged-repeated-value-long\`,
        ];
      }
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code.startsWith('"use strict";const ')).toBe(true);
    expect(transformed.code.match(/"use strict"/g)).toHaveLength(2);
    expect(transformed.code).toContain("`template-repeated-value-long`");
    expect(transformed.code).toContain("tag`tagged-repeated-value-long`");
    expect(() => evaluateScript(transformed.code)).not.toThrow();
  });

  it("safely terminates one semicolonless directive before insertion", () => {
    const source = `"use strict"\n` +
      `const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];\n` +
      `return values.join("|");`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code.startsWith(
      `"use strict";const __choiceOfLifeString0=`,
    )).toBe(true);
    expect(evaluateScript(transformed.code)).toBe(evaluateScript(source));
  });

  it("safely terminates multiple semicolonless directives", () => {
    const source = `"use strict"\n"choice mode"\n` +
      `const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];\n` +
      `return values.length;`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code.startsWith(
      `"use strict"\n"choice mode";const __choiceOfLifeString0=`,
    )).toBe(true);
    expect(evaluateScript(transformed.code)).toBe(evaluateScript(source));
  });

  it("inserts before a directive's trailing line comment without commenting out the pool", () => {
    const source = `"use strict" // retained directive comment\n` +
      `const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];\n` +
      `return values[0];`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code).toContain(
      `;const __choiceOfLifeString0="ordinary-repeated-value-long"; // retained directive comment`,
    );
    expect(evaluateScript(transformed.code)).toBe(evaluateScript(source));
  });

  it("safely inserts after a hashbang and semicolonless directive", () => {
    const source = `#!/usr/bin/env node\n"use strict"\n` +
      `const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];\n` +
      `globalThis.result = values.join("|");`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code.startsWith(
      `#!/usr/bin/env node\n"use strict";const __choiceOfLifeString0=`,
    )).toBe(true);
    const originalContext = {};
    const transformedContext = {};
    runInNewContext(source, originalContext);
    runInNewContext(transformed.code, transformedContext);
    expect(transformedContext.result).toBe(originalContext.result);
  });

  it("never rewrites static, re-export, or dynamic-import specifiers", () => {
    const source = `
      import alpha from "module-specifier-repeated-long";
      export { alpha } from "module-specifier-repeated-long";
      const loadA = () => import("dynamic-specifier-repeated-long");
      const loadB = () => import("dynamic-specifier-repeated-long");
      const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.code.match(/"module-specifier-repeated-long"/g))
      .toHaveLength(2);
    expect(transformed.code.match(/"dynamic-specifier-repeated-long"/g))
      .toHaveLength(2);
  });

  it("preserves noncomputed object, class, destructuring, and __proto__ keys", () => {
    const source = `
      const a = {
        "__proto__": null,
        "property-key-repeated-long": 1,
        value: "ordinary-repeated-value-long",
      };
      const b = {
        "__proto__": null,
        "property-key-repeated-long": 2,
        value: "ordinary-repeated-value-long",
      };
      class Example {
        "property-key-repeated-long"() { return 3; }
      }
      const { "property-key-repeated-long": selected } = b;
      return [Object.getPrototypeOf(a), Object.keys(a), selected, new Example()["property-key-repeated-long"]()];
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.code.match(/"__proto__"/g)).toHaveLength(2);
    expect(transformed.code.match(/"property-key-repeated-long"/g).length)
      .toBeGreaterThanOrEqual(4);
    expect(evaluateScript(transformed.code)).toEqual(evaluateScript(source));
  });

  it("leaves JSX attributes and JSX-owned strings untouched", () => {
    const source = `
      const first = <div title="jsx-repeated-value-long">{"jsx-repeated-value-long"}</div>;
      const second = <div title="jsx-repeated-value-long">{"jsx-repeated-value-long"}</div>;
      const ordinary = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.code.match(/jsx-repeated-value-long/g)).toHaveLength(4);
  });

  it("does not move network, worker, navigation, or timer-code strings", () => {
    const source = `
      fetch("boundary-repeated-value-long"); fetch("boundary-repeated-value-long");
      new Worker("worker-repeated-value-long"); new Worker("worker-repeated-value-long");
      location.assign("navigation-repeated-value-long"); location.assign("navigation-repeated-value-long");
      window["location"]["replace"]("computed-navigation-repeated-long");
      window["location"]["replace"]("computed-navigation-repeated-long");
      setTimeout("timer-repeated-value-long", 1); setTimeout("timer-repeated-value-long", 1);
      const ordinary = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    for (const value of [
      "boundary-repeated-value-long",
      "worker-repeated-value-long",
      "navigation-repeated-value-long",
      "computed-navigation-repeated-long",
      "timer-repeated-value-long",
    ]) {
      expect(transformed.code.match(new RegExp(value, "g"))).toHaveLength(2);
    }
  });

  it("does not mistake ordinary assign or string replacement for navigation", () => {
    const source = `
      const first = "replace-repeated-value-long".replace("replace-repeated-value-long", "ordinary-repeated-value-long");
      const second = "replace-repeated-value-long".replace("replace-repeated-value-long", "ordinary-repeated-value-long");
      Object.assign({}, { value: "assign-repeated-value-long" });
      Object.assign({}, { value: "assign-repeated-value-long" });
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.pooledValueCount).toBeGreaterThanOrEqual(3);
  });

  it("disables the complete chunk when direct eval could observe injected bindings", () => {
    const source = `
      const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];
      const observed = ((eval))("typeof __choiceOfLifeString0");
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed).toEqual({
      changed: false,
      code: source,
      estimatedIdentifierBytes: null,
      estimatedSavings: 0,
      pooledOccurrenceCount: 0,
      pooledValueCount: 0,
      skipReason: "direct-eval",
    });
  });

  it("still pools around an explicitly indirect eval", () => {
    const source = `
      const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];
      const observed = (0, eval)("typeof __choiceOfLifeString0");
    `;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.skipReason).toBeNull();
  });

  it("is deterministic, collision-safe, and pools only profitable groups by default", () => {
    const source = `
      const __choiceOfLifeString0 = 7;
      return [
        "a-default-profitable-repeated-string", "a-default-profitable-repeated-string", "a-default-profitable-repeated-string",
        "x", "x", "x",
      ];
    `;
    const first = poolRepeatedStringValues(source);
    const second = poolRepeatedStringValues(source);
    expect(first).toEqual(second);
    expect(first.code).toContain("__choiceOfLifeString1");
    expect(first.code.match(/"x"/g)).toHaveLength(3);
    expect(first.estimatedSavings).toBeGreaterThan(0);
    expect(first.estimatedIdentifierBytes).toBe(2);
  });

  it("uses a two-byte allowance for hundreds of pool bindings", () => {
    const values = Array.from({ length: 400 }, (_, index) => {
      const value = `ordinary-repeated-value-${index.toString().padStart(4, "0")}-long`;
      return `${JSON.stringify(value)},${JSON.stringify(value)}`;
    }).join(",");
    const transformed = poolRepeatedStringValues(`const values=[${values}];`, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.pooledValueCount).toBe(400);
    expect(transformed.estimatedIdentifierBytes).toBe(2);
  });

  it("escalates to a three-byte allowance when the over-counted namespace exceeds its floor", () => {
    const declarations = Array.from(
      { length: 1_450 },
      (_, index) => `const occupiedSymbol${index}=0;`,
    ).join("");
    const source = declarations +
      `const values=["ordinary-repeated-value-long-enough-for-three-bytes","ordinary-repeated-value-long-enough-for-three-bytes"];`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(true);
    expect(transformed.estimatedIdentifierBytes).toBe(3);
  });

  it("rejects a group that is profitable only under an optimistic one-byte name", () => {
    const source = `const values=["abcd","abcd"];`;
    const transformed = poolRepeatedStringValues(source, FORCE_POOL);
    expect(transformed.changed).toBe(false);
    expect(transformed.estimatedIdentifierBytes).toBe(2);
    expect(transformed.code).toBe(source);
  });

  it("fails closed for malformed source and invalid policy options", () => {
    expect(() => poolRepeatedStringValues("const = ;")).toThrow(/parse/i);
    expect(() => poolRepeatedStringValues("", { minimumOccurrences: 1 }))
      .toThrow(/minimumOccurrences/i);
    expect(() => poolRepeatedStringValues("", { identifierPrefix: "bad-name" }))
      .toThrow(/identifierPrefix/i);
    expect(() => poolRepeatedStringValues("", { minimumOccurences: 2 }))
      .toThrow(/unknown option/i);
  });

  it("exposes a build-only, pre-Terser ES-module Rollup hook", () => {
    const plugin = createRepeatedStringValuePoolingPlugin(FORCE_POOL);
    expect(plugin).toMatchObject({
      name: "choice-of-life-repeated-string-value-pooling",
      apply: "build",
      enforce: "pre",
      renderChunk: { order: "pre" },
    });
    const transformed = plugin.renderChunk.handler(
      `export const values = ["ordinary-repeated-value-long", "ordinary-repeated-value-long"];`,
      {},
      { format: "es" },
    );
    expect(transformed.code).toContain("__choiceOfLifeString0");
    expect(() => plugin.renderChunk.handler("", {}, { format: "iife" }))
      .toThrow(/ES-module output/);
    expect(() => plugin.renderChunk.handler("", {}, {
      format: "es",
      sourcemap: true,
    })).toThrow(/source maps/i);
  });
});
