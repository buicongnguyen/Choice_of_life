import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  fnv1a64Hex,
  type CanonicalJsonValue,
} from "./canonical-json";

function referenceFnv1a64Hex(text: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  const updateByte = (byte: number): void => {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  };
  for (const symbol of text) {
    const rawCodePoint = symbol.codePointAt(0);
    if (rawCodePoint === undefined) throw new TypeError("missing code point");
    const codePoint = rawCodePoint >= 0xd800 && rawCodePoint <= 0xdfff
      ? 0xfffd
      : rawCodePoint;
    if (codePoint <= 0x7f) {
      updateByte(codePoint);
    } else if (codePoint <= 0x7ff) {
      updateByte(0xc0 | (codePoint >>> 6));
      updateByte(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      updateByte(0xe0 | (codePoint >>> 12));
      updateByte(0x80 | ((codePoint >>> 6) & 0x3f));
      updateByte(0x80 | (codePoint & 0x3f));
    } else {
      updateByte(0xf0 | (codePoint >>> 18));
      updateByte(0x80 | ((codePoint >>> 12) & 0x3f));
      updateByte(0x80 | ((codePoint >>> 6) & 0x3f));
      updateByte(0x80 | (codePoint & 0x3f));
    }
  }
  return hash.toString(16).padStart(16, "0");
}

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

  it("is exactly equivalent to the BigInt reference across UTF-8 boundaries", () => {
    const boundaryCodePoints = [
      0x00,
      0x7f,
      0x80,
      0x7ff,
      0x800,
      0xd7ff,
      0xe000,
      0xffff,
      0x10000,
      0x10ffff,
    ];
    const candidates = [
      "",
      "plain ASCII 0123456789",
      boundaryCodePoints.map((value) => String.fromCodePoint(value)).join(""),
      "\ud800",
      "\udfff",
      "before\ud800middle\udfffafter",
      "A😀한글éΩ中Z",
      "runner-state:".repeat(4_096),
    ];
    let randomState = 0x9e3779b9;
    for (let sample = 0; sample < 32; sample += 1) {
      let value = "";
      for (let index = 0; index < 64; index += 1) {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        const codePoint = (randomState >>> 0) % 0x110000;
        value += codePoint >= 0xd800 && codePoint <= 0xdfff
          ? String.fromCharCode(codePoint)
          : String.fromCodePoint(codePoint);
      }
      candidates.push(value);
    }
    for (const value of candidates) {
      expect(fnv1a64Hex(value)).toBe(referenceFnv1a64Hex(value));
    }
  });
});
