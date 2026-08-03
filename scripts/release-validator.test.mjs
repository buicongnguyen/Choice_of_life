import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  auditReleaseFile,
  validateRelease,
} from "./release-validator.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const EXPECTATIONS = Object.freeze({
  commit: COMMIT,
  repository: "buicongnguyen/Choice_of_life",
  version: "1.0.0",
});
const VALID_RELEASE = Object.freeze({
  commit: COMMIT,
  version: "1.0.0",
  repository: "buicongnguyen/Choice_of_life",
});

describe("release validator", () => {
  let directory;
  let releasePath;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "choice-release-"));
    releasePath = path.join(directory, "release.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function audit() {
    return auditReleaseFile({
      releasePath,
      expectedCommit: EXPECTATIONS.commit,
      expectedRepository: EXPECTATIONS.repository,
      expectedVersion: EXPECTATIONS.version,
    });
  }

  it("accepts the exact release schema and expected values", async () => {
    await writeFile(releasePath, JSON.stringify(VALID_RELEASE), "utf8");

    await expect(audit()).resolves.toMatchObject({
      ok: true,
      failures: [],
      release: VALID_RELEASE,
    });
  });

  it("rejects a missing release file", async () => {
    const result = await audit();

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/missing or unreadable/i);
  });

  it("rejects malformed release JSON", async () => {
    await writeFile(releasePath, "{not-json", "utf8");

    const result = await audit();
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("release.json contains malformed JSON");
  });

  it.each([
    ["commit", "ffffffffffffffffffffffffffffffffffffffff", /commit .* does not match/],
    ["version", "2.0.0", /version .* does not match/],
    ["repository", "someone/else", /repository .* does not match/],
  ])("rejects a wrong %s", async (field, value, message) => {
    await writeFile(
      releasePath,
      JSON.stringify({ ...VALID_RELEASE, [field]: value }),
      "utf8"
    );

    const result = await audit();
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(message);
  });

  it("rejects an unexpected property", () => {
    const failures = validateRelease(
      { ...VALID_RELEASE, deployedAt: "tomorrow" },
      EXPECTATIONS
    );

    expect(failures.join(" ")).toMatch(/exactly these keys/i);
  });

  it("rejects a missing property", () => {
    const { repository: _repository, ...incomplete } = VALID_RELEASE;

    const failures = validateRelease(incomplete, EXPECTATIONS);
    expect(failures.join(" ")).toMatch(/exactly these keys/i);
    expect(failures.join(" ")).toMatch(/repository must be a string/i);
  });

  it.each([null, [], "release", 7])(
    "rejects a non-object release payload: %j",
    (release) => {
      expect(validateRelease(release, EXPECTATIONS)).toContain(
        "release.json must contain a JSON object"
      );
    }
  );

  it("rejects uppercase and malformed expected commit values", () => {
    const failures = validateRelease(VALID_RELEASE, {
      ...EXPECTATIONS,
      commit: COMMIT.toUpperCase(),
    });

    expect(failures.join(" ")).toMatch(/expected commit/i);
  });
});
