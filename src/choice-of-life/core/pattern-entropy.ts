export const PATTERN_ENTROPY_VERSION = "pattern-entropy-fnv1a32-v1" as const;

export type RunSeed = string;
export type PatternChannel = string;

export interface PatternKey {
  readonly runSeed: RunSeed;
  readonly stageId: string;
  readonly patternIndex: number;
}

export interface PatternEntropy {
  uint32(channel: PatternChannel): number;
  integer(
    channel: PatternChannel,
    min: number,
    maxExclusive: number,
  ): number;
  weightedIndex(
    channel: PatternChannel,
    integerWeights: readonly number[],
  ): number;
}

const RUN_SEED_PATTERN = /^[0-9a-f]{16}$/;
const STAGE_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const CHANNEL_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const UINT32_RANGE = 0x1_0000_0000;

function assertPatternKey(key: PatternKey): void {
  if (!RUN_SEED_PATTERN.test(key.runSeed)) {
    throw new TypeError("run seed must be exactly 16 lowercase hexadecimal characters");
  }
  if (!STAGE_ID_PATTERN.test(key.stageId) || key.stageId.length > 64) {
    throw new TypeError("stage ID is invalid");
  }
  if (!Number.isSafeInteger(key.patternIndex) || key.patternIndex < 0) {
    throw new TypeError("pattern index must be a non-negative safe integer");
  }
}

function assertChannel(channel: PatternChannel): void {
  if (!CHANNEL_PATTERN.test(channel)) {
    throw new TypeError("pattern channel is invalid");
  }
}

function lengthPrefixed(value: string): string {
  return `${value.length}:${value}`;
}

// Versioned ASCII, length-prefixed coordinates avoid concatenation ambiguity.
// FNV-1a32 supplies the base hash and the fixed Murmur3 finalizer improves bit
// diffusion. Range selection uses exact BigInt multiply-high, never floats.
function entropyMaterial(key: PatternKey, channel: PatternChannel): string {
  return [
    PATTERN_ENTROPY_VERSION,
    key.runSeed,
    key.stageId,
    String(key.patternIndex),
    channel,
  ]
    .map(lengthPrefixed)
    .join("|");
}

function fnv1a32Ascii(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const byte = text.charCodeAt(index);
    if (byte > 0x7f) {
      throw new TypeError("pattern entropy material must be ASCII");
    }
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function assertIntegerRange(min: number, maxExclusive: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxExclusive)) {
    throw new TypeError("integer bounds must be safe integers");
  }
  if (maxExclusive <= min) {
    throw new RangeError("maxExclusive must be greater than min");
  }
  const span = maxExclusive - min;
  if (!Number.isSafeInteger(span) || span > UINT32_RANGE) {
    throw new RangeError("integer range must not exceed 2^32 values");
  }
  return span;
}

function scaleUint32(value: number, span: number): number {
  return Number((BigInt(value) * BigInt(span)) >> 32n);
}

export function createPatternEntropy(key: PatternKey): PatternEntropy {
  assertPatternKey(key);
  const stableKey = Object.freeze({
    runSeed: key.runSeed,
    stageId: key.stageId,
    patternIndex: key.patternIndex,
  });

  const uint32 = (channel: PatternChannel): number => {
    assertChannel(channel);
    return fnv1a32Ascii(entropyMaterial(stableKey, channel));
  };

  const integer = (
    channel: PatternChannel,
    min: number,
    maxExclusive: number,
  ): number => {
    const span = assertIntegerRange(min, maxExclusive);
    const result = min + scaleUint32(uint32(channel), span);
    if (!Number.isSafeInteger(result)) {
      throw new RangeError("scaled integer exceeds safe integer range");
    }
    return result;
  };

  const weightedIndex = (
    channel: PatternChannel,
    integerWeights: readonly number[],
  ): number => {
    if (integerWeights.length === 0) {
      throw new RangeError("integer weights cannot be empty");
    }

    let total = 0;
    for (const weight of integerWeights) {
      if (!Number.isSafeInteger(weight) || weight < 0) {
        throw new TypeError("weights must be non-negative safe integers");
      }
      total += weight;
      if (!Number.isSafeInteger(total) || total > UINT32_RANGE) {
        throw new RangeError("weight total must not exceed 2^32");
      }
    }
    if (total === 0) {
      throw new RangeError("at least one weight must be positive");
    }

    const selection = integer(channel, 0, total);
    let cumulative = 0;
    for (let index = 0; index < integerWeights.length; index += 1) {
      cumulative += integerWeights[index] ?? 0;
      if (selection < cumulative) {
        return index;
      }
    }
    throw new RangeError("weighted selection did not resolve");
  };

  return Object.freeze({ uint32, integer, weightedIndex });
}
