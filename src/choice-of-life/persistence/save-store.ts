import { fnv1a64Hex } from "../core/canonical-json";
import type { CatalogRegistry } from "../core/catalog";
import {
  decodeRunState,
  encodeRunState,
  truncateUtf8,
  utf8ByteLength,
  validateRunState,
  type DecodeErrorCode,
} from "../core/run-state-codec";
import type { RunStateV1 } from "../core/run-state";
import type { StoragePort } from "./storage-port";

export const ACTIVE_RUN_STORAGE_KEY = "choice-of-life-v1-active-run";
export const QUARANTINE_STORAGE_KEY = "choice-of-life-v1-quarantine";
export const QUARANTINE_EXCERPT_MAX_UTF8_BYTES = 16 * 1024;
export const QUARANTINE_RECORD_MAX_UTF8_BYTES = 20 * 1024;

export interface QuarantineRecordV1 {
  readonly version: 1;
  readonly code: DecodeErrorCode;
  readonly schemaVersion: number | null;
  readonly contentVersion: string | null;
  readonly originalUtf8Length: number;
  readonly digest: string;
  readonly rawExcerpt: string;
}

export type LoadResult =
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly state: RunStateV1; readonly migrated: boolean }
  | { readonly kind: "quarantined"; readonly code: DecodeErrorCode }
  | { readonly kind: "unavailable"; readonly operation: "read" | "write" | "remove"; readonly state: RunStateV1 | null };

export type SaveResult =
  | { readonly kind: "saved" }
  | { readonly kind: "invalid"; readonly path: string }
  | { readonly kind: "unavailable"; readonly operation: "write"; readonly state: RunStateV1 };

export type RemoveResult =
  | { readonly kind: "removed" }
  | { readonly kind: "unavailable"; readonly operation: "remove" };

export interface SaveStore {
  load(): LoadResult;
  save(state: RunStateV1): SaveResult;
  removeActive(): RemoveResult;
}

function parseQuarantineRecord(text: string | null): QuarantineRecordV1 | null {
  if (text === null) return null;
  if (utf8ByteLength(text) > QUARANTINE_RECORD_MAX_UTF8_BYTES) return null;
  try {
    const value = JSON.parse(text) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).sort().join("|") !== "code|contentVersion|digest|originalUtf8Length|rawExcerpt|schemaVersion|version" ||
      !("version" in value) || value.version !== 1 ||
      !("digest" in value) || typeof value.digest !== "string" || !/^[0-9a-f]{16}$/.test(value.digest) ||
      !("code" in value) || typeof value.code !== "string" ||
      ![
        "oversized", "malformed-json", "invalid-root", "unsupported-schema", "unsupported-content",
        "invalid-structure", "invalid-catalog", "invalid-semantics", "migration-failed",
      ].includes(value.code) ||
      !("schemaVersion" in value) || !(value.schemaVersion === null || (typeof value.schemaVersion === "number" && Number.isSafeInteger(value.schemaVersion) && value.schemaVersion >= 0)) ||
      !("contentVersion" in value) || !(value.contentVersion === null || isBoundedScalarString(value.contentVersion, 256)) ||
      !("originalUtf8Length" in value) || typeof value.originalUtf8Length !== "number" || !Number.isSafeInteger(value.originalUtf8Length) || value.originalUtf8Length < 0 ||
      !("rawExcerpt" in value) || !isBoundedScalarString(value.rawExcerpt, QUARANTINE_EXCERPT_MAX_UTF8_BYTES)
      || utf8ByteLength(value.rawExcerpt) > QUARANTINE_EXCERPT_MAX_UTF8_BYTES
    ) return null;
    return value as QuarantineRecordV1;
  } catch {
    return null;
  }
}

function isBoundedScalarString(value: unknown, maximumScalars: number): value is string {
  if (typeof value !== "string") return false;
  let scalars = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
    scalars += 1;
    if (scalars > maximumScalars) return false;
  }
  return true;
}

function normalizeScalarString(value: string): string {
  let normalized = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        normalized += value.slice(index, index + 2);
        index += 1;
      } else {
        normalized += "\ufffd";
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      normalized += "\ufffd";
    } else {
      normalized += value.slice(index, index + 1);
    }
  }
  return normalized;
}

function quarantineRecord(text: string, result: Extract<ReturnType<typeof decodeRunState>, { kind: "invalid" }>): QuarantineRecordV1 {
  const scalarText = normalizeScalarString(text);
  const truncatedContentVersion = result.contentVersion === null ? null : truncateUtf8(result.contentVersion, 256);
  const base = {
    version: 1,
    code: result.code,
    schemaVersion: result.schemaVersion !== null && Number.isSafeInteger(result.schemaVersion) && result.schemaVersion >= 0
      ? result.schemaVersion
      : null,
    contentVersion: isBoundedScalarString(truncatedContentVersion, 256) ? truncatedContentVersion : null,
    originalUtf8Length: utf8ByteLength(text),
    digest: fnv1a64Hex(text),
  } as const;
  let lower = 0;
  let upper = QUARANTINE_EXCERPT_MAX_UTF8_BYTES;
  let rawExcerpt = "";
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = truncateUtf8(scalarText, middle);
    const record = { ...base, rawExcerpt: candidate };
    if (utf8ByteLength(JSON.stringify(record)) <= QUARANTINE_RECORD_MAX_UTF8_BYTES) {
      rawExcerpt = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return { ...base, rawExcerpt };
}

export function createSaveStore(storage: StoragePort, catalogs: CatalogRegistry): SaveStore {
  let quarantineWriteFailureDigest: string | null = null;
  return {
    load(): LoadResult {
      let activeText: string | null;
      try {
        activeText = storage.getItem(ACTIVE_RUN_STORAGE_KEY);
      } catch {
        return { kind: "unavailable", operation: "read", state: null };
      }
      if (activeText === null) return { kind: "empty" };

      const digest = fnv1a64Hex(activeText);
      if (quarantineWriteFailureDigest === digest) return { kind: "unavailable", operation: "write", state: null };
      let priorQuarantine: QuarantineRecordV1 | null;
      try {
        priorQuarantine = parseQuarantineRecord(storage.getItem(QUARANTINE_STORAGE_KEY));
      } catch {
        return { kind: "unavailable", operation: "read", state: null };
      }
      if (priorQuarantine?.digest === digest) return { kind: "quarantined", code: priorQuarantine.code };

      const decoded = decodeRunState(activeText, catalogs);
      if (decoded.kind === "invalid") {
        const record = quarantineRecord(activeText, decoded);
        try {
          storage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(record));
        } catch {
          quarantineWriteFailureDigest = digest;
          return { kind: "unavailable", operation: "write", state: null };
        }
        try {
          storage.removeItem(ACTIVE_RUN_STORAGE_KEY);
        } catch {
          return { kind: "unavailable", operation: "remove", state: null };
        }
        return { kind: "quarantined", code: decoded.code };
      }

      if (decoded.migratedFrom !== null) {
        let encoded: string;
        try {
          encoded = encodeRunState(decoded.state);
        } catch {
          return { kind: "unavailable", operation: "write", state: decoded.state };
        }
        try {
          storage.setItem(ACTIVE_RUN_STORAGE_KEY, encoded);
        } catch {
          return { kind: "unavailable", operation: "write", state: decoded.state };
        }
      }
      return { kind: "ready", state: decoded.state, migrated: decoded.migratedFrom !== null };
    },

    save(state: RunStateV1): SaveResult {
      const validation = validateRunState(state, catalogs);
      if (!validation.ok) return { kind: "invalid", path: validation.path };
      let encoded: string;
      try {
        encoded = encodeRunState(validation.state);
      } catch {
        return { kind: "invalid", path: "/" };
      }
      try {
        storage.setItem(ACTIVE_RUN_STORAGE_KEY, encoded);
      } catch {
        return { kind: "unavailable", operation: "write", state };
      }
      return { kind: "saved" };
    },

    removeActive(): RemoveResult {
      try {
        storage.removeItem(ACTIVE_RUN_STORAGE_KEY);
      } catch {
        return { kind: "unavailable", operation: "remove" };
      }
      return { kind: "removed" };
    },
  };
}
