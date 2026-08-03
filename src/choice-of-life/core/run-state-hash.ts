import { canonicalizeJson, fnv1a64Hex, type CanonicalJsonValue } from "./canonical-json";
import type { RunStateV1 } from "./run-state";

export const RUN_STATE_HASH_VERSION = "state-hash-v1" as const;

const EXCLUDED_APPEARANCE_KEYS = ["hairStyleId", "hairColorId", "clothingPaletteId", "heritageStyleId"] as const;
const EXCLUDED_ACCESSIBILITY_KEYS = ["highContrast", "reducedMotion", "textScale", "screenReaderAnnouncements"] as const;

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
  const projection = toCanonicalValue(state);
  const root = mutableObject(projection, "/");
  const appearanceValue = root["appearance"];
  const accessibilityValue = root["accessibility"];
  if (appearanceValue === undefined || accessibilityValue === undefined) throw new TypeError("Run-state projection lacks cosmetic sections");
  const appearance = mutableObject(appearanceValue, "/appearance");
  const accessibility = mutableObject(accessibilityValue, "/accessibility");
  for (const key of EXCLUDED_APPEARANCE_KEYS) delete appearance[key];
  for (const key of EXCLUDED_ACCESSIBILITY_KEYS) delete accessibility[key];
  return projection;
}

export function canonicalRunStateJsonV1(state: RunStateV1): string {
  return canonicalizeJson(canonicalRunStateProjectionV1(state));
}

export function stateHashV1(state: RunStateV1): string {
  return fnv1a64Hex(canonicalRunStateJsonV1(state));
}
