import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { assertPinnedGitCheckout } from "./runner-laboratory-distributed-cli";

const execFileAsync = promisify(execFile);
const TEMPORARY_DIRECTORIES = new Set<string>();

async function write(root: string, relativePath: string, bytes: string): Promise<void> {
  const destination = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, "utf8");
}

async function git(root: string, ...arguments_: string[]): Promise<string> {
  return (await execFileAsync("git", arguments_, {
    cwd: root,
    windowsHide: true,
  })).stdout.trim();
}

async function exactRelease(root: string, commit: string): Promise<void> {
  await write(root, "public/release.json", `${JSON.stringify({
    commit,
    version: "0.2.0",
    repository: "buicongnguyen/Choice_of_life",
  }, null, 2)}\n`);
}

async function pinnedRepository(): Promise<Readonly<{ root: string; commit: string }>> {
  const root = await mkdtemp(path.join(tmpdir(), "runner-distributed-git-test-"));
  TEMPORARY_DIRECTORIES.add(root);
  const fixedFiles = [
    "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md",
    "index.html",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.choice-of-life-core.json",
    "tsconfig.runner-evaluator.json",
    "vite.config.ts",
    "src/main.ts",
  ];
  for (const relativePath of fixedFiles) await write(root, relativePath, `${relativePath}\n`);
  await write(root, "package.json", `${JSON.stringify({
    name: "choice-of-life",
    version: "0.2.0",
    repository: { full_name: "buicongnguyen/Choice_of_life" },
  })}\n`);
  await write(root, "src/choice-of-life/model.ts", "export const model = 1;\n");
  await write(root, "scripts/evaluator.ts", "export const evaluator = 1;\n");
  await write(root, "docs/balance/fixture.json", "{}\n");
  await write(root, "docs/balance/evaluation-results/evidence.json", "{}\n");
  await write(root, "docs/balance/runner-evaluation-results/evidence.json", "{}\n");
  await write(root, "docs/phase-specs/phase.md", "# Phase\n");
  await write(root, "docs/save/schema.json", "{}\n");
  await write(root, "public/release.json", "{}\n");
  await write(root, "public/favicon.svg", "<svg/>\n");
  await write(
    root,
    ".gitignore",
    ".env.local\ndocs/balance/evaluation-results/ignored-*.json\nnode_modules/\ndist/\n",
  );
  await write(root, ".gitattributes", "*.txt text eol=lf\n");
  await write(root, "tracked-nonbuild.txt", "raw LF bytes\n");
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Runner Provenance Test");
  await git(root, "config", "user.email", "runner-provenance@example.invalid");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "test fixture");
  const commit = await git(root, "rev-parse", "HEAD");
  await exactRelease(root, commit);
  return Object.freeze({ root, commit });
}

afterEach(async () => {
  await Promise.all([...TEMPORARY_DIRECTORIES].map(async (directory) => {
    TEMPORARY_DIRECTORIES.delete(directory);
    await rm(directory, { recursive: true, force: true });
  }));
});

const NO_GITHUB_ENVIRONMENT = Object.freeze({
  githubSha: null,
  githubRepository: null,
});

describe("distributed checkout-to-HEAD provenance", () => {
  it("allows only the exact deterministic release stamp over an otherwise exact HEAD", async () => {
    const { root, commit } = await pinnedRepository();
    await expect(assertPinnedGitCheckout(
      root,
      commit,
      NO_GITHUB_ENVIRONMENT,
    )).resolves.toBeUndefined();
  });

  it("rejects tracked source, staged source, and excluded evidence mutations", async () => {
    for (const mutation of [
      ["src/choice-of-life/model.ts", "export const model = 2;\n", false],
      ["scripts/evaluator.ts", "export const evaluator = 2;\n", true],
      ["docs/balance/evaluation-results/evidence.json", "{\"changed\":true}\n", false],
    ] as const) {
      const { root, commit } = await pinnedRepository();
      await write(root, mutation[0], mutation[1]);
      if (mutation[2]) await git(root, "add", mutation[0]);
      await expect(assertPinnedGitCheckout(
        root,
        commit,
        NO_GITHUB_ENVIRONMENT,
      )).rejects.toThrow(mutation[2]
        ? /tracked index differs/
        : /tracked worktree or index differs/);
    }
  });

  it("rejects staged-only index drift after the worktree bytes are restored to HEAD", async () => {
    const { root, commit } = await pinnedRepository();
    await write(root, "scripts/evaluator.ts", "export const evaluator = 2;\n");
    await git(root, "add", "scripts/evaluator.ts");
    await write(root, "scripts/evaluator.ts", "export const evaluator = 1;\n");
    expect(await git(root, "diff", "--name-only", "HEAD", "--", "scripts/evaluator.ts"))
      .toBe("");
    await expect(assertPinnedGitCheckout(
      root,
      commit,
      NO_GITHUB_ENVIRONMENT,
    )).rejects.toThrow(/tracked index differs from HEAD/);
  });

  it("rejects evaluated untracked files and captured ignored environment files", async () => {
    for (const relativePath of ["scripts/untracked.ts", ".env.local"] as const) {
      const { root, commit } = await pinnedRepository();
      await write(root, relativePath, "UNTRACKED_BUILD_INPUT=1\n");
      await expect(assertPinnedGitCheckout(
        root,
        commit,
        NO_GITHUB_ENVIRONMENT,
      )).rejects.toThrow(relativePath === ".env.local" ? /untracked, special/ : /untracked repository inputs/);
    }
  });

  it("rejects ignored untracked evidence despite evidence digest-cycle exclusion", async () => {
    const { root, commit } = await pinnedRepository();
    await write(
      root,
      "docs/balance/evaluation-results/ignored-forged.json",
      "{\"forged\":true}\n",
    );
    await expect(assertPinnedGitCheckout(
      root,
      commit,
      NO_GITHUB_ENVIRONMENT,
    )).rejects.toThrow(/ignored untracked evidence inputs/);
  });

  it("rejects raw CRLF drift that Git text normalization reports as clean", async () => {
    const { root, commit } = await pinnedRepository();
    await write(root, "tracked-nonbuild.txt", "raw LF bytes\r\n");
    expect(await git(root, "diff", "--name-only", "HEAD", "--", "tracked-nonbuild.txt"))
      .toBe("");
    await expect(assertPinnedGitCheckout(
      root,
      commit,
      NO_GITHUB_ENVIRONMENT,
    )).rejects.toThrow(/raw tracked worktree bytes differ from HEAD/);
  });

  it("rejects forged release bytes and GitHub SHA/repository identity drift", async () => {
    const { root, commit } = await pinnedRepository();
    await write(root, "public/release.json", "{\"commit\":\"forged\"}\n");
    await expect(assertPinnedGitCheckout(
      root,
      commit,
      NO_GITHUB_ENVIRONMENT,
    )).rejects.toThrow(/exact deterministic release stamp/);

    await exactRelease(root, commit);
    await expect(assertPinnedGitCheckout(root, commit, {
      githubSha: "f".repeat(40),
      githubRepository: "buicongnguyen/Choice_of_life",
    })).rejects.toThrow(/GITHUB_SHA differs/);
    await expect(assertPinnedGitCheckout(root, commit, {
      githubSha: commit,
      githubRepository: "someone/forged-repository",
    })).rejects.toThrow(/repository identity/);
  });
});
