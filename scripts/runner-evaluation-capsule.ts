import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  captureEvaluationSource,
  evaluationSourceSha256,
} from "./fixture-lock.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RUN_NONCE_PATTERN = /^[0-9a-f]{64}$/;
const AUXILIARY_DIRECTORY_PATHS = ["src", "public"] as const;
const VITE_ENVIRONMENT_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
] as const;

export const PREVIEW_PROVENANCE_PATH = "__runner-evaluator-provenance.json";
export const PREVIEW_PROVENANCE_ARTIFACT_ID =
  "runner-evaluator-preview-provenance-v1";

export interface CapturedPayloadFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
}

export interface RunnerEvaluationCapsule {
  readonly liveRoot: string;
  readonly capsuleRoot: string;
  readonly evaluatedSourceSha256: string;
  readonly buildInputsSha256: string;
}

export interface ImmutableDistPayload {
  readonly distPayloadSha256: string;
  readonly files: readonly CapturedPayloadFile[];
}

export interface RunnerPreviewProvenance {
  readonly schemaVersion: 1;
  readonly artifactId: typeof PREVIEW_PROVENANCE_ARTIFACT_ID;
  readonly evaluatedSourceSha256: string;
  readonly buildInputsSha256: string;
  readonly distPayloadSha256: string;
  readonly runNonce: string;
}

function fail(message: string): never {
  throw new TypeError(`runner evaluation capsule: ${message}`);
}

function normalizedRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function assertTemporaryPathOutsideRoot(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedRoot === resolvedCandidate || isPathInside(resolvedRoot, resolvedCandidate)) {
    fail("temporary resource must stay outside the evaluated source root");
  }
}

function assertSafeRelativePath(relativePath: string, label: string): void {
  if (
    relativePath.length === 0 || path.isAbsolute(relativePath) ||
    relativePath.includes("\\") || relativePath.includes("\0") ||
    relativePath.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail(`${label} contains an unsafe relative path: ${relativePath}`);
  }
}

function updateTreeDigest(
  digest: ReturnType<typeof createHash>,
  file: CapturedPayloadFile,
): void {
  assertSafeRelativePath(file.relativePath, "captured payload");
  digest.update(Buffer.from(
    `${file.relativePath}\0${file.bytes.byteLength}\0`,
    "utf8",
  ));
  digest.update(file.bytes);
  digest.update(Buffer.from("\0", "utf8"));
}

export function payloadTreeSha256(files: readonly CapturedPayloadFile[]): string {
  const ordered = [...files]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (new Set(ordered.map(({ relativePath }) => relativePath)).size !== ordered.length) {
    fail("captured payload contains duplicate paths");
  }
  const digest = createHash("sha256");
  for (const file of ordered) updateTreeDigest(digest, file);
  return digest.digest("hex");
}

async function captureDirectory(
  root: string,
  relativeDirectory: string,
  skipPaths: ReadonlySet<string> = new Set(),
): Promise<readonly CapturedPayloadFile[]> {
  const directoryPath = path.join(root, ...relativeDirectory.split("/"));
  const initialStat = await lstat(directoryPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (initialStat === null) return Object.freeze([]);
  if (initialStat.isSymbolicLink()) fail(`unsupported auxiliary symlink ${relativeDirectory}`);
  if (!initialStat.isDirectory()) fail(`auxiliary path is not a directory ${relativeDirectory}`);
  const files: CapturedPayloadFile[] = [];
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(root, ...relative.split("/")), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = normalizedRelativePath(path.posix.join(relative, entry.name));
      assertSafeRelativePath(childRelative, "auxiliary input");
      const childPath = path.join(root, ...childRelative.split("/"));
      const childStat = await lstat(childPath);
      if (childStat.isSymbolicLink()) fail(`unsupported auxiliary symlink ${childRelative}`);
      if (childStat.isDirectory()) {
        await walk(childRelative);
      } else if (childStat.isFile()) {
        if (!skipPaths.has(childRelative)) {
          files.push(Object.freeze({
            relativePath: childRelative,
            bytes: Buffer.from(await readFile(childPath)),
          }));
        }
      } else {
        fail(`unsupported auxiliary entry ${childRelative}`);
      }
    }
  }
  await walk(relativeDirectory);
  return Object.freeze(files);
}

async function captureOptionalRootFile(
  root: string,
  relativePath: string,
): Promise<CapturedPayloadFile | null> {
  const filePath = path.join(root, relativePath);
  const sourceStat = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (sourceStat === null) return null;
  if (sourceStat.isSymbolicLink()) fail(`unsupported auxiliary symlink ${relativePath}`);
  if (!sourceStat.isFile()) fail(`unsupported auxiliary entry ${relativePath}`);
  return Object.freeze({
    relativePath,
    bytes: Buffer.from(await readFile(filePath)),
  });
}

async function writeCapturedFiles(
  capsuleRoot: string,
  files: readonly CapturedPayloadFile[],
): Promise<void> {
  for (const file of files) {
    assertSafeRelativePath(file.relativePath, "capsule input");
    const destination = path.join(capsuleRoot, ...file.relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: "wx" });
  }
}

export interface RunnerBuildInputCapture {
  readonly evaluatedSourceSha256: string;
  readonly files: readonly CapturedPayloadFile[];
  readonly buildInputsSha256: string;
}

export async function captureRunnerBuildInputs(
  root: string,
): Promise<Readonly<RunnerBuildInputCapture>> {
  const resolvedRoot = await realpath(path.resolve(root));
  const sourceCapture = await captureEvaluationSource(resolvedRoot);
  const evaluatedFiles: CapturedPayloadFile[] = sourceCapture.files.map(
    (file: { readonly relativePath: string; readonly bytes: Uint8Array }) =>
      Object.freeze({
        relativePath: file.relativePath,
        bytes: Buffer.from(file.bytes),
      }),
  );
  const evaluatedPaths = new Set(evaluatedFiles.map(({ relativePath }) => relativePath));
  const auxiliaryFiles = (
    await Promise.all(AUXILIARY_DIRECTORY_PATHS.map((relativeDirectory) =>
      captureDirectory(resolvedRoot, relativeDirectory, evaluatedPaths)))
  ).flat();
  const environmentFiles = (await Promise.all(VITE_ENVIRONMENT_PATHS.map((relativePath) =>
    captureOptionalRootFile(resolvedRoot, relativePath))))
    .filter((file): file is CapturedPayloadFile => file !== null);
  const files = Object.freeze([
    ...evaluatedFiles,
    ...auxiliaryFiles,
    ...environmentFiles,
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
  return Object.freeze({
    evaluatedSourceSha256: sourceCapture.evaluatedSourceSha256,
    files,
    buildInputsSha256: payloadTreeSha256(files),
  });
}

export async function runnerBuildInputsSha256(root: string): Promise<string> {
  return (await captureRunnerBuildInputs(root)).buildInputsSha256;
}

export async function createRunnerEvaluationCapsule(
  liveRoot: string,
  temporaryParent = tmpdir(),
): Promise<RunnerEvaluationCapsule> {
  const resolvedLiveRoot = await realpath(path.resolve(liveRoot));
  const inputCapture = await captureRunnerBuildInputs(resolvedLiveRoot);
  const capsuleRoot = await mkdtemp(path.join(path.resolve(temporaryParent), "runner-evaluation-capsule-"));
  assertTemporaryPathOutsideRoot(resolvedLiveRoot, capsuleRoot);
  try {
    await writeCapturedFiles(capsuleRoot, inputCapture.files);
    const liveNodeModules = await realpath(path.join(resolvedLiveRoot, "node_modules"));
    await symlink(
      liveNodeModules,
      path.join(capsuleRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const capsuleDigest = await evaluationSourceSha256(capsuleRoot);
    if (capsuleDigest !== inputCapture.evaluatedSourceSha256) {
      fail("capsule evaluated-source digest differs from its single-read capture");
    }
    if (await runnerBuildInputsSha256(capsuleRoot) !== inputCapture.buildInputsSha256) {
      fail("capsule build-input digest differs from its single-read capture");
    }
    return Object.freeze({
      liveRoot: resolvedLiveRoot,
      capsuleRoot,
      evaluatedSourceSha256: inputCapture.evaluatedSourceSha256,
      buildInputsSha256: inputCapture.buildInputsSha256,
    });
  } catch (error) {
    await rm(capsuleRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function captureImmutableDist(
  distRoot: string,
): Promise<ImmutableDistPayload> {
  const resolvedDistRoot = path.resolve(distRoot);
  const distStat = await lstat(resolvedDistRoot).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") fail("production dist directory is missing");
    throw error;
  });
  if (distStat.isSymbolicLink()) fail("production dist directory must not be a symlink");
  if (!distStat.isDirectory()) fail("production dist path is not a directory");
  const files: CapturedPayloadFile[] = [];
  async function walk(relativeDirectory: string): Promise<void> {
    const directory = relativeDirectory === ""
      ? resolvedDistRoot
      : path.join(resolvedDistRoot, ...relativeDirectory.split("/"));
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeDirectory === ""
        ? entry.name
        : path.posix.join(relativeDirectory, entry.name);
      assertSafeRelativePath(relativePath, "dist payload");
      const absolutePath = path.join(resolvedDistRoot, ...relativePath.split("/"));
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) fail(`unsupported dist symlink ${relativePath}`);
      if (entryStat.isDirectory()) {
        await walk(relativePath);
      } else if (entryStat.isFile()) {
        files.push(Object.freeze({
          relativePath,
          bytes: Buffer.from(await readFile(absolutePath)),
        }));
      } else {
        fail(`unsupported dist entry ${relativePath}`);
      }
    }
  }
  await walk("");
  if (!files.some(({ relativePath }) => relativePath === "index.html")) {
    fail("production dist payload lacks index.html");
  }
  if (files.some(({ relativePath }) => relativePath === PREVIEW_PROVENANCE_PATH)) {
    fail(`production dist payload uses reserved path ${PREVIEW_PROVENANCE_PATH}`);
  }
  const ordered = Object.freeze(files
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
  return Object.freeze({
    distPayloadSha256: payloadTreeSha256(ordered),
    files: ordered,
  });
}

function assertSha256(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) fail(`${label} is not a lowercase SHA-256`);
}

export function createRunnerPreviewProvenance(values: Readonly<{
  evaluatedSourceSha256: string;
  buildInputsSha256: string;
  distPayloadSha256: string;
  runNonce: string;
}>): RunnerPreviewProvenance {
  assertSha256(values.evaluatedSourceSha256, "evaluated source digest");
  assertSha256(values.buildInputsSha256, "build-input digest");
  assertSha256(values.distPayloadSha256, "dist payload digest");
  if (!RUN_NONCE_PATTERN.test(values.runNonce)) fail("run nonce is malformed");
  return Object.freeze({
    schemaVersion: 1,
    artifactId: PREVIEW_PROVENANCE_ARTIFACT_ID,
    evaluatedSourceSha256: values.evaluatedSourceSha256,
    buildInputsSha256: values.buildInputsSha256,
    distPayloadSha256: values.distPayloadSha256,
    runNonce: values.runNonce,
  });
}

export function validateRunnerPreviewProvenance(
  value: unknown,
): RunnerPreviewProvenance {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("preview provenance must be an object");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "artifactId",
    "buildInputsSha256",
    "distPayloadSha256",
    "evaluatedSourceSha256",
    "runNonce",
    "schemaVersion",
  ];
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail("preview provenance has unexpected keys");
  }
  if (record.schemaVersion !== 1 || record.artifactId !== PREVIEW_PROVENANCE_ARTIFACT_ID) {
    fail("preview provenance identity is invalid");
  }
  if (
    typeof record.evaluatedSourceSha256 !== "string" ||
    typeof record.buildInputsSha256 !== "string" ||
    typeof record.distPayloadSha256 !== "string" ||
    typeof record.runNonce !== "string"
  ) {
    fail("preview provenance fields have invalid types");
  }
  return createRunnerPreviewProvenance({
    evaluatedSourceSha256: record.evaluatedSourceSha256,
    buildInputsSha256: record.buildInputsSha256,
    distPayloadSha256: record.distPayloadSha256,
    runNonce: record.runNonce,
  });
}

export function runnerPreviewProvenanceBytes(
  provenance: RunnerPreviewProvenance,
): string {
  const validated = validateRunnerPreviewProvenance(provenance);
  return `${JSON.stringify(validated)}\n`;
}

export function immutableRequestPath(rawUrl: string | undefined): string {
  if (rawUrl === undefined || !rawUrl.startsWith("/")) {
    fail("preview request target is not origin-form");
  }
  const rawPath = rawUrl.split(/[?#]/u, 1)[0]!;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    fail("preview request path has malformed encoding");
  }
  if (decoded.includes("\\") || decoded.includes("\0")) {
    fail("preview request path contains a forbidden character");
  }
  const segments = decoded.split("/").slice(1);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail("preview request path attempts traversal");
  }
  if (segments.some((segment, index) => segment.length === 0 && index !== segments.length - 1)) {
    fail("preview request path contains an empty segment");
  }
  const relativePath = segments.filter((segment) => segment.length > 0).join("/");
  return relativePath === "" ? "index.html" : relativePath;
}

function contentType(relativePath: string): string {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case ".css": return "text/css; charset=utf-8";
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

function sendBytes(
  response: ServerResponse,
  statusCode: number,
  type: string,
  bytes: Buffer,
  includeBody: boolean,
): void {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": String(bytes.byteLength),
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(includeBody ? bytes : undefined);
}

export function createImmutablePreviewHandler(
  payload: ImmutableDistPayload,
  provenance: RunnerPreviewProvenance,
): (request: IncomingMessage, response: ServerResponse) => void {
  const validatedProvenance = validateRunnerPreviewProvenance(provenance);
  if (payload.files.some(({ relativePath }) => relativePath === PREVIEW_PROVENANCE_PATH)) {
    fail(`immutable payload uses reserved path ${PREVIEW_PROVENANCE_PATH}`);
  }
  // Clone before validating so an exported/caller-owned Buffer can neither
  // race the digest check nor mutate bytes after the listener is announced.
  const ownedFiles = payload.files.map((file) => Object.freeze({
    relativePath: file.relativePath,
    bytes: Buffer.from(file.bytes),
  }));
  const ownedPayloadSha256 = payloadTreeSha256(ownedFiles);
  if (
    payload.distPayloadSha256 !== ownedPayloadSha256 ||
    ownedPayloadSha256 !== validatedProvenance.distPayloadSha256
  ) {
    fail("preview provenance does not match the immutable dist payload");
  }
  const files = new Map(ownedFiles.map((file) => [
    file.relativePath,
    file.bytes,
  ]));
  const provenanceBytes = Buffer.from(
    runnerPreviewProvenanceBytes(validatedProvenance),
    "utf8",
  );
  return (request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
      response.end();
      return;
    }
    let relativePath: string;
    try {
      relativePath = immutableRequestPath(request.url);
    } catch {
      sendBytes(
        response,
        400,
        "text/plain; charset=utf-8",
        Buffer.from("Bad request\n", "utf8"),
        method === "GET",
      );
      return;
    }
    if (relativePath === PREVIEW_PROVENANCE_PATH) {
      sendBytes(
        response,
        200,
        "application/json; charset=utf-8",
        provenanceBytes,
        method === "GET",
      );
      return;
    }
    const bytes = files.get(relativePath);
    if (bytes === undefined) {
      sendBytes(
        response,
        404,
        "text/plain; charset=utf-8",
        Buffer.from("Not found\n", "utf8"),
        method === "GET",
      );
      return;
    }
    sendBytes(response, 200, contentType(relativePath), bytes, method === "GET");
  };
}
