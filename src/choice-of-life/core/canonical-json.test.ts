import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  fnv1a64Hex,
  type CanonicalJsonValue,
} from "./canonical-json";

describe("canonicalizeJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(
      canonicalizeJson({
        zebra: 2,
        alpha: [{ z: 3, a: 1 }, true, null, "life"],
      }),
    ).toBe(
      '{"alpha":[{"a":1,"z":3},true,null,"life"],"zebra":2}',
    );
  });

  it("is independent of property insertion order", () => {
    const first: CanonicalJsonValue = { b: 2, a: 1 };
    const second: CanonicalJsonValue = { a: 1, b: 2 };
    expect(canonicalizeJson(first)).toBe(canonicalizeJson(second));
  });

  it("uses JSON escaping and normalizes negative zero", () => {
    expect(canonicalizeJson({ text: "line\n\"quote\"", zero: -0 })).toBe(
      '{"text":"line\\n\\\"quote\\\"","zero":0}',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects unsupported number %s",
    (value) => {
      expect(() => canonicalizeJson(value)).toThrow(
        "finite integers",
      );
    },
  );

  it("rejects sparse arrays, cycles, and unsupported values", () => {
    const sparse = new Array<CanonicalJsonValue>(2);
    sparse[1] = 1;
    expect(() => canonicalizeJson(sparse)).toThrow("sparse");

    const cyclic: { self?: CanonicalJsonValue } = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow("cycles");

    expect(() => canonicalizeJson(undefined as never)).toThrow(
      "Unsupported",
    );
  });
});

describe("fnv1a64Hex", () => {
  it.each([
    ["", "cbf29ce484222325"],
    ["a", "af63dc4c8601ec8c"],
    ["hello", "a430d84680aabd0b"],
    ["foobar", "85944171f73967e8"],
  ])("matches the FNV-1a64 known vector for %j", (text, expected) => {
    expect(fnv1a64Hex(text)).toBe(expected);
  });

  it("hashes Unicode as UTF-8 bytes", () => {
    expect(fnv1a64Hex("😀")).toBe("feff073875020288");
  });
});
