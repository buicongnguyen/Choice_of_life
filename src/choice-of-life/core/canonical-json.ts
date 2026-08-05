export const CANONICAL_JSON_VERSION = "canonical-json-v1" as const;
export const FNV1A64_VERSION = "fnv1a64-v1" as const;

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

const FNV1A_64_OFFSET_HIGH = 0xcbf29ce4;
const FNV1A_64_OFFSET_LOW = 0x84222325;
const FNV1A_64_PRIME_LOW = 0x1b3;
const UINT32_MODULUS = 0x1_0000_0000;

function unsupportedValue(value: never): never {
  throw new TypeError(`Unsupported canonical JSON value: ${String(value)}`);
}

function canonicalize(
  value: CanonicalJsonValue,
  ancestors: Set<object>,
): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new TypeError("Canonical JSON numbers must be finite integers");
      }
      return JSON.stringify(value);
    case "object":
      break;
    default:
      return unsupportedValue(value);
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain cycles");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const arrayKeys = Object.keys(value);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError("Canonical JSON arrays cannot be sparse");
        }
      }
      if (arrayKeys.length !== value.length) {
        throw new TypeError(
          "Canonical JSON arrays cannot have enumerable named properties",
        );
      }

      return `[${value
        .map((entry) => canonicalize(entry, ancestors))
        .join(",")}]`;
    }

    const objectValue = value as Readonly<
      Record<string, CanonicalJsonValue>
    >;
    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON objects must be plain objects");
    }
    if (Object.getOwnPropertySymbols(objectValue).length > 0) {
      throw new TypeError("Canonical JSON objects cannot have symbol keys");
    }

    const entries = Object.keys(objectValue)
      .sort()
      .map((key) => {
        const entry = objectValue[key];
        if (entry === undefined) {
          throw new TypeError("Canonical JSON object values cannot be undefined");
        }
        return `${JSON.stringify(key)}:${canonicalize(entry, ancestors)}`;
      });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: CanonicalJsonValue): string {
  return canonicalize(value, new Set<object>());
}

export function fnv1a64Hex(text: string): string {
  let high = FNV1A_64_OFFSET_HIGH;
  let low = FNV1A_64_OFFSET_LOW;
  const updateByte = (byte: number): void => {
    low = (low ^ byte) >>> 0;
    // 0x100000001b3 = 2^40 + 0x1b3. Splitting the unsigned
    // 64-bit value into high/low words makes the exact modulo-2^64
    // multiplication browser-safe without one BigInt allocation per byte.
    const lowProduct = low * FNV1A_64_PRIME_LOW;
    const carry = Math.floor(lowProduct / UINT32_MODULUS);
    high = (
      Math.imul(high, FNV1A_64_PRIME_LOW) +
      carry +
      ((low << 8) >>> 0)
    ) >>> 0;
    low = lowProduct >>> 0;
  };
  for (const symbol of text) {
    const rawCodePoint = symbol.codePointAt(0);
    if (rawCodePoint === undefined) {
      throw new TypeError("Unable to read string code point");
    }
    const codePoint =
      rawCodePoint >= 0xd800 && rawCodePoint <= 0xdfff
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
  return `${high.toString(16).padStart(8, "0")}${
    low.toString(16).padStart(8, "0")
  }`;
}

export const canonicalJson = canonicalizeJson;
export const fnv1a64 = fnv1a64Hex;
