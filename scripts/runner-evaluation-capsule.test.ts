import { createServer, type Server } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evaluationSourceSha256 } from "./fixture-lock.mjs";
import {
  captureImmutableDist,
  createImmutablePreviewHandler,
  createRunnerEvaluationCapsule,
  createRunnerPreviewProvenance,
  immutableRequestPath,
  PREVIEW_PROVENANCE_PATH,
  runnerPreviewProvenanceBytes,
  validateRunnerPreviewProvenance,
} from "./runner-evaluation-capsule";
import {
  assertPinnedBuildInputs,
  assertPinnedEvaluatedSource,
} from "./runner-laboratory-evaluator-cli";

const TEMPORARY_DIRECTORIES = new Set<string>();

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  TEMPORARY_DIRECTORIES.add(directory);
  return directory;
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  TEMPORARY_DIRECTORIES.delete(directory);
  await rm(directory, { recursive: true, force: true });
}

afterEach(async () => {
  await Promise.all([...TEMPORARY_DIRECTORIES].map(removeTemporaryDirectory));
});

async function write(root: string, relativePath: string, bytes: string): Promise<void> {
  const destination = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, "utf8");
}

async function evaluationSkeleton(): Promise<string> {
  const root = await temporaryDirectory("runner-capsule-source-");
  const fixedFiles = [
    "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md",
    "index.html",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.choice-of-life-core.json",
    "tsconfig.runner-evaluator.json",
    "vite.config.ts",
    "src/main.ts",
  ];
  for (const relativePath of fixedFiles) await write(root, relativePath, `${relativePath}\n`);
  await write(root, "src/choice-of-life/model.ts", "export const model = 1;\n");
  await write(root, "src/legacy-production.ts", "export const legacy = true;\n");
  await write(root, "scripts/evaluator.ts", "export const evaluator = 1;\n");
  await write(root, "docs/balance/fixture.json", "{}\n");
  await write(root, "docs/phase-specs/phase.md", "# Phase\n");
  await write(root, "docs/save/schema.json", "{}\n");
  await write(root, "public/release.json", "{\"commit\":\"local\"}\n");
  await write(root, "public/favicon.svg", "<svg/>\n");
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  return root;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing test port");
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error === undefined ? resolve() : reject(error)));
}

describe("immutable runner evaluation capsule", () => {
  it("pins exact evaluated bytes while binding full production and public inputs", async () => {
    const root = await evaluationSkeleton();
    await write(root, "dist/index.html", "stale live dist must not be copied\n");
    const sourceDigest = await evaluationSourceSha256(root);
    const first = await createRunnerEvaluationCapsule(root);
    TEMPORARY_DIRECTORIES.add(first.capsuleRoot);
    expect(first.evaluatedSourceSha256).toBe(sourceDigest);
    expect(await evaluationSourceSha256(first.capsuleRoot)).toBe(sourceDigest);
    expect(await readFile(
      path.join(first.capsuleRoot, "src", "legacy-production.ts"),
      "utf8",
    )).toContain("legacy");
    expect(await readFile(
      path.join(first.capsuleRoot, "public", "favicon.svg"),
      "utf8",
    )).toBe("<svg/>\n");
    await expect(readFile(path.join(first.capsuleRoot, "dist", "index.html"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });

    await write(root, "public/favicon.svg", "<svg><title>changed</title></svg>\n");
    expect(await evaluationSourceSha256(root)).toBe(sourceDigest);
    const second = await createRunnerEvaluationCapsule(root);
    TEMPORARY_DIRECTORIES.add(second.capsuleRoot);
    expect(second.evaluatedSourceSha256).toBe(sourceDigest);
    expect(second.buildInputsSha256).not.toBe(first.buildInputsSha256);

    await write(root, "src/choice-of-life/model.ts", "export const model = 2;\n");
    expect(await evaluationSourceSha256(root)).not.toBe(sourceDigest);
    expect(await evaluationSourceSha256(first.capsuleRoot)).toBe(sourceDigest);
  });

  it("fails closed at deterministic source and public-input mutation boundaries", async () => {
    const root = await evaluationSkeleton();
    const capsule = await createRunnerEvaluationCapsule(root);
    TEMPORARY_DIRECTORIES.add(capsule.capsuleRoot);
    await expect(assertPinnedEvaluatedSource(
      root,
      capsule.evaluatedSourceSha256,
      "at test boundary",
    )).resolves.toBeUndefined();
    await expect(assertPinnedBuildInputs(
      root,
      capsule.buildInputsSha256,
      "at test boundary",
    )).resolves.toBeUndefined();

    await write(root, "public/favicon.svg", "<svg><title>raced</title></svg>\n");
    await expect(assertPinnedEvaluatedSource(
      root,
      capsule.evaluatedSourceSha256,
      "after public race",
    )).resolves.toBeUndefined();
    await expect(assertPinnedBuildInputs(
      root,
      capsule.buildInputsSha256,
      "after public race",
    )).rejects.toThrow(/build inputs differ/);

    await write(root, "src/choice-of-life/model.ts", "export const model = 3;\n");
    await expect(assertPinnedEvaluatedSource(
      root,
      capsule.evaluatedSourceSha256,
      "after source race",
    )).rejects.toThrow(/evaluated source differs/);
  });

  it("rejects auxiliary symlinks instead of following bytes outside the source root", async () => {
    const root = await evaluationSkeleton();
    const target = await temporaryDirectory("runner-capsule-link-target-");
    await write(target, "escape.txt", "outside\n");
    await symlink(
      target,
      path.join(root, "public", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(createRunnerEvaluationCapsule(root)).rejects.toThrow(/symlink/);
  });

  it("serves listener-owned immutable bytes and exact nonce-bound provenance", async () => {
    const root = await temporaryDirectory("runner-immutable-dist-");
    const dist = path.join(root, "dist");
    await write(dist, "index.html", "<script src=\"./assets/app.js\"></script>\n");
    await write(dist, "assets/app.js", "globalThis.version = 'captured';\n");
    const payload = await captureImmutableDist(dist);
    const provenance = createRunnerPreviewProvenance({
      evaluatedSourceSha256: "a".repeat(64),
      buildInputsSha256: "b".repeat(64),
      distPayloadSha256: payload.distPayloadSha256,
      runNonce: "c".repeat(64),
    });
    const server = createServer(createImmutablePreviewHandler(payload, provenance));
    const port = await listen(server);
    try {
      await write(dist, "assets/app.js", "globalThis.version = 'mutated-on-disk';\n");
      const exposedBuffer = payload.files.find(({ relativePath }) =>
        relativePath === "assets/app.js")!.bytes;
      exposedBuffer.fill(0x78);

      const asset = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
      expect(await asset.text()).toBe("globalThis.version = 'captured';\n");
      const proof = await fetch(
        `http://127.0.0.1:${port}/${PREVIEW_PROVENANCE_PATH}`,
      );
      expect(await proof.text()).toBe(runnerPreviewProvenanceBytes(provenance));
      expect(proof.headers.get("cache-control")).toBe("no-store");
    } finally {
      await close(server);
    }
  });

  it("rejects a reserved provenance file and a forged caller-supplied dist digest", async () => {
    const root = await temporaryDirectory("runner-reserved-dist-");
    const dist = path.join(root, "dist");
    await write(dist, "index.html", "<main>valid</main>\n");
    await write(dist, PREVIEW_PROVENANCE_PATH, "{\"forged\":true}\n");
    await expect(captureImmutableDist(dist)).rejects.toThrow(/reserved path/);

    const forgedPayload = {
      distPayloadSha256: "a".repeat(64),
      files: [{ relativePath: "index.html", bytes: Buffer.from("different\n") }],
    } as const;
    const forgedProvenance = createRunnerPreviewProvenance({
      evaluatedSourceSha256: "b".repeat(64),
      buildInputsSha256: "c".repeat(64),
      distPayloadSha256: forgedPayload.distPayloadSha256,
      runNonce: "d".repeat(64),
    });
    expect(() => createImmutablePreviewHandler(forgedPayload, forgedProvenance))
      .toThrow(/does not match/);
  });

  it("rejects traversal, malformed encodings, and provenance schema drift", () => {
    expect(() => immutableRequestPath("/%2e%2e/secret.txt")).toThrow(/traversal/);
    expect(() => immutableRequestPath("/..%2fsecret.txt")).toThrow(/traversal/);
    expect(() => immutableRequestPath("/%zz")).toThrow(/encoding/);
    expect(() => immutableRequestPath("/folder\\secret.txt")).toThrow(/forbidden/);

    const valid = createRunnerPreviewProvenance({
      evaluatedSourceSha256: "a".repeat(64),
      buildInputsSha256: "b".repeat(64),
      distPayloadSha256: "c".repeat(64),
      runNonce: "d".repeat(64),
    });
    expect(validateRunnerPreviewProvenance(valid)).toEqual(valid);
    expect(() => validateRunnerPreviewProvenance({ ...valid, extra: true }))
      .toThrow(/unexpected keys/);
    expect(() => validateRunnerPreviewProvenance({
      ...valid,
      distPayloadSha256: "f".repeat(63),
    })).toThrow(/SHA-256/);
  });
});
