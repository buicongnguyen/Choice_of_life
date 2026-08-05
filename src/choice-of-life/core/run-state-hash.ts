import { canonicalizeJson, fnv1a64Hex, type CanonicalJsonValue } from "./canonical-json";
import type { RunStateV1 } from "./run-state";
import { toRunStateWireValue } from "./run-state-wire";

export const RUN_STATE_HASH_VERSION = "state-hash-v1" as const;

export const RUN_STATE_HASH_EXCLUDED_APPEARANCE_KEYS_V1 = Object.freeze([
  "hairStyleId",
  "hairColorId",
  "clothingPaletteId",
  "heritageStyleId",
] as const);
export const RUN_STATE_HASH_EXCLUDED_ACCESSIBILITY_KEYS_V1 = Object.freeze([
  "highContrast",
  "reducedMotion",
  "textScale",
  "screenReaderAnnouncements",
] as const);
export const RUN_STATE_FULL_CANONICAL_IDENTITY_VERSION =
  "run-state-full-canonical-identity-v1" as const;

function toCanonicalValue(value: unknown, path = ""): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new TypeError(`Non-canonical number at ${path || "/"}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => toCanonicalValue(item, `${path}/${index}`));
  if (typeof value !== "object") throw new TypeError(`Unsupported state value at ${path || "/"}`);
  const output: Record<string, CanonicalJsonValue> = {};
  for (const [key, item] of Object.entries(value)) output[key] = toCanonicalValue(item, `${path}/${key}`);
  return output;
}

function mutableObject(value: CanonicalJsonValue, path: string): Record<string, CanonicalJsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`Expected object at ${path}`);
  return value as Record<string, CanonicalJsonValue>;
}

export function canonicalRunStateProjectionV1(state: RunStateV1): CanonicalJsonValue {
  const projection = toCanonicalValue(toRunStateWireValue(state));
  const root = mutableObject(projection, "/");
  const appearanceValue = root["appearance"];
  const accessibilityValue = root["accessibility"];
  if (appearanceValue === undefined || accessibilityValue === undefined) throw new TypeError("Run-state projection lacks cosmetic sections");
  const appearance = mutableObject(appearanceValue, "/appearance");
  const accessibility = mutableObject(accessibilityValue, "/accessibility");
  for (const key of RUN_STATE_HASH_EXCLUDED_APPEARANCE_KEYS_V1) {
    delete appearance[key];
  }
  for (const key of RUN_STATE_HASH_EXCLUDED_ACCESSIBILITY_KEYS_V1) {
    delete accessibility[key];
  }
  return projection;
}

export function canonicalRunStateJsonV1(state: RunStateV1): string {
  return canonicalizeJson(canonicalRunStateProjectionV1(state));
}

export interface RunStateCanonicalIdentityV1 {
  readonly gameplayCanonicalJson: string;
  /**
   * Collision-free identity string, not raw full-state JSON. The first
   * component contains every nonexcluded state value; the second restores the
   * complete appearance/accessibility objects that own exactly the exclusions
   * above. Canonical JSON escapes U+0000, so literal separators are injective.
   */
  readonly fullCanonicalIdentity: string;
}

export function canonicalRunStateIdentityV1(
  state: RunStateV1,
): RunStateCanonicalIdentityV1 {
  const gameplayCanonicalJson = canonicalRunStateJsonV1(state);
  const protectedPresentationCanonicalJson = canonicalizeJson(
    toCanonicalValue({
      appearance: state.appearance,
      accessibility: state.accessibility,
    }),
  );
  return Object.freeze({
    gameplayCanonicalJson,
    fullCanonicalIdentity: `${RUN_STATE_FULL_CANONICAL_IDENTITY_VERSION}\0${
      gameplayCanonicalJson
    }\0${protectedPresentationCanonicalJson}`,
  });
}

export function stateHashV1(state: RunStateV1): string {
  return fnv1a64Hex(canonicalRunStateJsonV1(state));
}
