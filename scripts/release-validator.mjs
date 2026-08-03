import { readFile } from "node:fs/promises";

export const RELEASE_KEYS = Object.freeze(["commit", "repository", "version"]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function uniqueFailures(failures) {
  return [...new Set(failures)];
}

export function validateRelease(release, expectations) {
  const failures = [];
  const { commit, repository, version } = expectations ?? {};

  if (commit !== "local" && (typeof commit !== "string" || !SHA_PATTERN.test(commit))) {
    failures.push("expected commit must be \"local\" or a lowercase 40-character SHA");
  }
  if (typeof repository !== "string" || !REPOSITORY_PATTERN.test(repository)) {
    failures.push("expected repository must use the owner/repository form");
  }
  if (typeof version !== "string" || version.length === 0) {
    failures.push("expected version must be a non-empty string");
  }

  if (!isPlainObject(release)) {
    failures.push("release.json must contain a JSON object");
    return uniqueFailures(failures);
  }

  const actualKeys = Object.keys(release).sort();
  if (
    actualKeys.length !== RELEASE_KEYS.length ||
    actualKeys.some((key, index) => key !== RELEASE_KEYS[index])
  ) {
    failures.push(
      `release.json must contain exactly these keys: ${RELEASE_KEYS.join(", ")}`
    );
  }

  if (typeof release.commit !== "string") {
    failures.push("release.json commit must be a string");
  } else {
    if (release.commit !== "local" && !SHA_PATTERN.test(release.commit)) {
      failures.push(
        "release.json commit must be \"local\" or a lowercase 40-character SHA"
      );
    }
    if (typeof commit === "string" && release.commit !== commit) {
      failures.push(`release.json commit ${release.commit} does not match ${commit}`);
    }
  }

  if (typeof release.repository !== "string") {
    failures.push("release.json repository must be a string");
  } else if (
    typeof repository === "string" &&
    release.repository !== repository
  ) {
    failures.push(
      `release.json repository ${release.repository} does not match ${repository}`
    );
  }

  if (typeof release.version !== "string") {
    failures.push("release.json version must be a string");
  } else if (typeof version === "string" && release.version !== version) {
    failures.push(`release.json version ${release.version} does not match ${version}`);
  }

  return uniqueFailures(failures);
}

export async function auditReleaseFile({
  releasePath,
  expectedCommit,
  expectedRepository,
  expectedVersion,
}) {
  const expectations = {
    commit: expectedCommit,
    repository: expectedRepository,
    version: expectedVersion,
  };
  let source;

  try {
    source = await readFile(releasePath, "utf8");
  } catch (error) {
    const detail = error && typeof error === "object" && "code" in error
      ? ` (${error.code})`
      : "";
    return {
      ok: false,
      release: null,
      failures: [`release.json is missing or unreadable${detail}`],
    };
  }

  let release;
  try {
    release = JSON.parse(source);
  } catch {
    return {
      ok: false,
      release: null,
      failures: ["release.json contains malformed JSON"],
    };
  }

  const failures = validateRelease(release, expectations);
  return {
    ok: failures.length === 0,
    release,
    failures,
  };
}

export async function assertReleaseFile(options) {
  const result = await auditReleaseFile(options);
  if (!result.ok) {
    const error = new Error(
      `Release verification failed: ${result.failures.join("; ")}`
    );
    error.result = result;
    throw error;
  }
  return result;
}
