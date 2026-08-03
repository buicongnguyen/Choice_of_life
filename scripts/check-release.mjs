import { readFile } from "node:fs/promises";
import path from "node:path";

const expectedCommit = (process.env.GITHUB_SHA || "local").toLowerCase();
if (
  expectedCommit !== "local" &&
  !/^[0-9a-f]{40}$/.test(expectedCommit)
) {
  throw new Error(`Expected release SHA is invalid: ${expectedCommit}`);
}

const packageJson = JSON.parse(
  await readFile(path.resolve("package.json"), "utf8")
);
const expectedRepository =
  process.env.GITHUB_REPOSITORY ||
  packageJson.repository?.full_name ||
  "buicongnguyen/Choice_of_life";

let release;
try {
  release = JSON.parse(
    await readFile(path.resolve("dist", "release.json"), "utf8")
  );
} catch (error) {
  throw new Error("Built release.json is missing or malformed", {
    cause: error,
  });
}

const failures = [];
if (release.commit !== expectedCommit) {
  failures.push(`commit ${release.commit} !== ${expectedCommit}`);
}
if (release.version !== String(packageJson.version)) {
  failures.push(`version ${release.version} !== ${packageJson.version}`);
}
if (release.repository !== expectedRepository) {
  failures.push(`repository ${release.repository} !== ${expectedRepository}`);
}
if (Object.keys(release).sort().join(",") !== "commit,repository,version") {
  failures.push("release.json contains an unexpected schema");
}

if (failures.length > 0) {
  throw new Error(`Release verification failed: ${failures.join("; ")}`);
}

console.log(`Verified built release ${release.commit}`);
