import { fnv1a64Hex } from "./canonical-json";

export const CHOICE_OF_LIFE_REPOSITORY = "buicongnguyen/Choice_of_life" as const;
export const CHOICE_OF_LIFE_PAGES_BASE_PATH = "/Choice_of_life/" as const;
export const CHOICE_OF_LIFE_PAGES_URL =
  "https://buicongnguyen.github.io/Choice_of_life/" as const;
export const RELEASE_MANIFEST_FILENAME = "release.json" as const;

export interface ReleaseManifest {
  readonly commit: "local" | string;
  readonly repository: string;
  readonly version: string;
}

export type ReleaseManifestDecodeResult =
  | { readonly kind: "ready"; readonly release: ReleaseManifest }
  | { readonly kind: "invalid"; readonly reason: "malformed-json" | "invalid-manifest" };

const COMMIT_PATTERN = /^(?:local|[0-9a-f]{40})$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isBoundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

export function parseReleaseManifest(value: unknown): ReleaseManifest | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ["commit", "repository", "version"])) {
    return null;
  }
  const commit = value["commit"];
  const repository = value["repository"];
  const version = value["version"];
  if (
    typeof commit !== "string" || !COMMIT_PATTERN.test(commit)
    || typeof repository !== "string" || !REPOSITORY_PATTERN.test(repository)
    || typeof version !== "string" || !VERSION_PATTERN.test(version)
  ) {
    return null;
  }
  return Object.freeze({ commit, repository, version });
}

export function decodeReleaseManifest(source: string): ReleaseManifestDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return { kind: "invalid", reason: "malformed-json" };
  }
  const release = parseReleaseManifest(parsed);
  return release === null
    ? { kind: "invalid", reason: "invalid-manifest" }
    : { kind: "ready", release };
}

/** Normalizes a GitHub Pages project base without accepting query/hash data. */
export function normalizePagesBasePath(basePath = CHOICE_OF_LIFE_PAGES_BASE_PATH): string {
  const pathOnly = basePath.split(/[?#]/, 1)[0]?.trim() ?? "";
  const segments = pathOnly.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return CHOICE_OF_LIFE_PAGES_BASE_PATH;
  }
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

/** Joins a trusted project-relative file name to the normalized Pages base. */
export function pagesPath(
  relativePath = "",
  basePath = CHOICE_OF_LIFE_PAGES_BASE_PATH,
): string {
  const normalizedBase = normalizePagesBasePath(basePath);
  const pathOnly = relativePath.split(/[?#]/, 1)[0] ?? "";
  const segments = pathOnly.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.some((segment) => segment === "..")) return normalizedBase;
  return `${normalizedBase}${segments.join("/")}`;
}

export function releaseManifestPath(basePath = CHOICE_OF_LIFE_PAGES_BASE_PATH): string {
  return pagesPath(RELEASE_MANIFEST_FILENAME, basePath);
}

export const SAVE_ENVELOPE_VERSION = 1 as const;
export const DEFAULT_SAVE_ENVELOPE_MAX_UTF8_BYTES = 128 * 1024;

export interface SaveEnvelopeV1<TPayload = unknown> {
  readonly envelopeVersion: typeof SAVE_ENVELOPE_VERSION;
  readonly schemaVersion: number;
  readonly contentVersion: string;
  readonly savedAt: string;
  readonly release: ReleaseManifest | null;
  readonly payload: TPayload;
}

export type SaveQuarantineCode =
  | "oversized"
  | "malformed-json"
  | "invalid-envelope"
  | "unsupported-envelope"
  | "future-schema"
  | "migration-missing"
  | "migration-failed"
  | "unsupported-content"
  | "invalid-payload";

/**
 * Metadata only: callers retain the source text under its original key. This
 * module deliberately owns no storage port and therefore cannot destroy data.
 */
export interface SaveQuarantineMetadata {
  readonly kind: "quarantined";
  readonly code: SaveQuarantineCode;
  readonly sourceDigest: string;
  readonly sourceUtf8Bytes: number;
  readonly observedEnvelopeVersion: number | null;
  readonly observedSchemaVersion: number | null;
  readonly observedContentVersion: string | null;
  readonly sourceDisposition: "retain-original";
}

export interface SaveEnvelopeMigration {
  readonly fromSchemaVersion: number;
  readonly toSchemaVersion: number;
  readonly toContentVersion?: string;
  migrate(payload: unknown): unknown;
}

export interface DecodeSaveEnvelopeOptions<TPayload> {
  readonly targetSchemaVersion: number;
  readonly targetContentVersion: string;
  readonly migrations?: readonly SaveEnvelopeMigration[];
  readonly maximumUtf8Bytes?: number;
  readonly validatePayload: (payload: unknown) => payload is TPayload;
}

export type SaveEnvelopeDecodeResult<TPayload> =
  | {
      readonly kind: "ready";
      readonly envelope: SaveEnvelopeV1<TPayload>;
      readonly migratedFromSchemaVersion: number | null;
    }
  | SaveQuarantineMetadata;

export interface CreateSaveEnvelopeOptions {
  readonly schemaVersion: number;
  readonly contentVersion: string;
  readonly savedAt: string;
  readonly release?: ReleaseManifest | null;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function readableNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function readableContentVersion(value: unknown): string | null {
  return isBoundedString(value, 128) ? value : null;
}

function quarantine(
  source: string,
  code: SaveQuarantineCode,
  parsed?: unknown,
): SaveQuarantineMetadata {
  const record = isPlainObject(parsed) ? parsed : null;
  return Object.freeze({
    kind: "quarantined",
    code,
    sourceDigest: fnv1a64Hex(source),
    sourceUtf8Bytes: utf8ByteLength(source),
    observedEnvelopeVersion: readableNonNegativeInteger(record?.["envelopeVersion"]),
    observedSchemaVersion: readableNonNegativeInteger(record?.["schemaVersion"]),
    observedContentVersion: readableContentVersion(record?.["contentVersion"]),
    sourceDisposition: "retain-original",
  });
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1]!;
}

function parsedEnvelope(value: unknown): SaveEnvelopeV1<unknown> | null {
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, [
      "contentVersion",
      "envelopeVersion",
      "payload",
      "release",
      "savedAt",
      "schemaVersion",
    ])
    || value["envelopeVersion"] !== SAVE_ENVELOPE_VERSION
    || readableNonNegativeInteger(value["schemaVersion"]) === null
    || readableContentVersion(value["contentVersion"]) === null
    || !isIsoTimestamp(value["savedAt"])
  ) {
    return null;
  }
  const release = value["release"] === null ? null : parseReleaseManifest(value["release"]);
  if (value["release"] !== null && release === null) return null;
  return {
    envelopeVersion: SAVE_ENVELOPE_VERSION,
    schemaVersion: value["schemaVersion"] as number,
    contentVersion: value["contentVersion"] as string,
    savedAt: value["savedAt"],
    release,
    payload: value["payload"],
  };
}

function detachedJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function createSaveEnvelope<TPayload>(
  payload: TPayload,
  options: CreateSaveEnvelopeOptions,
): SaveEnvelopeV1<TPayload> {
  if (
    !Number.isSafeInteger(options.schemaVersion) || options.schemaVersion < 0
    || !isBoundedString(options.contentVersion, 128)
  ) {
    throw new TypeError("Save envelope version metadata is invalid");
  }
  const savedAt = options.savedAt;
  if (!isIsoTimestamp(savedAt)) throw new TypeError("Save envelope timestamp is invalid");
  const release = options.release ?? null;
  if (release !== null && parseReleaseManifest(release) === null) {
    throw new TypeError("Save envelope release metadata is invalid");
  }
  return Object.freeze({
    "envelopeVersion": SAVE_ENVELOPE_VERSION,
    "schemaVersion": options.schemaVersion,
    "contentVersion": options.contentVersion,
    "savedAt": savedAt,
    "release": release,
    "payload": payload,
  });
}

export function decodeSaveEnvelope<TPayload>(
  source: string,
  options: DecodeSaveEnvelopeOptions<TPayload>,
): SaveEnvelopeDecodeResult<TPayload> {
  const sourceBytes = utf8ByteLength(source);
  const maximumBytes = options.maximumUtf8Bytes ?? DEFAULT_SAVE_ENVELOPE_MAX_UTF8_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || sourceBytes > maximumBytes) {
    return quarantine(source, "oversized");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return quarantine(source, "malformed-json");
  }
  if (!isPlainObject(parsed)) return quarantine(source, "invalid-envelope", parsed);
  if (parsed["envelopeVersion"] !== SAVE_ENVELOPE_VERSION) {
    return quarantine(source, "unsupported-envelope", parsed);
  }
  const envelope = parsedEnvelope(parsed);
  if (envelope === null) return quarantine(source, "invalid-envelope", parsed);
  if (
    !Number.isSafeInteger(options.targetSchemaVersion)
    || options.targetSchemaVersion < 0
    || !isBoundedString(options.targetContentVersion, 128)
  ) {
    return quarantine(source, "invalid-envelope", parsed);
  }
  if (envelope.schemaVersion > options.targetSchemaVersion) {
    return quarantine(source, "future-schema", parsed);
  }

  const migrations = new Map<number, SaveEnvelopeMigration>();
  for (const migration of options.migrations ?? []) {
    if (
      !Number.isSafeInteger(migration.fromSchemaVersion)
      || migration.fromSchemaVersion < 0
      || migration.toSchemaVersion !== migration.fromSchemaVersion + 1
      || migrations.has(migration.fromSchemaVersion)
    ) {
      return quarantine(source, "migration-failed", parsed);
    }
    migrations.set(migration.fromSchemaVersion, migration);
  }

  const migratedFromSchemaVersion = envelope.schemaVersion === options.targetSchemaVersion
    ? null
    : envelope.schemaVersion;
  let schemaVersion = envelope.schemaVersion;
  let contentVersion = envelope.contentVersion;
  let payload = envelope.payload;
  try {
    while (schemaVersion < options.targetSchemaVersion) {
      const migration = migrations.get(schemaVersion);
      if (migration === undefined) return quarantine(source, "migration-missing", parsed);
      payload = detachedJsonValue(migration.migrate(detachedJsonValue(payload)));
      schemaVersion = migration.toSchemaVersion;
      contentVersion = migration.toContentVersion ?? contentVersion;
    }
  } catch {
    return quarantine(source, "migration-failed", parsed);
  }
  if (contentVersion !== options.targetContentVersion) {
    return quarantine(source, "unsupported-content", parsed);
  }

  let validPayload = false;
  try {
    validPayload = options.validatePayload(payload);
  } catch {
    validPayload = false;
  }
  if (!validPayload) return quarantine(source, "invalid-payload", parsed);

  return {
    kind: "ready",
    envelope: Object.freeze({
      "envelopeVersion": SAVE_ENVELOPE_VERSION,
      "schemaVersion": schemaVersion,
      "contentVersion": contentVersion,
      "savedAt": envelope.savedAt,
      "release": envelope.release,
      "payload": payload as TPayload,
    }),
    migratedFromSchemaVersion,
  };
}
