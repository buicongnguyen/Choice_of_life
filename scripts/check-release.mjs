import { readFile } from "node:fs/promises";
import path from "node:path";

import { assertReleaseFile } from "./release-validator.mjs";

const expectedCommit = (process.env.GITHUB_SHA || "local").toLowerCase();
const packageJson = JSON.parse(
  await readFile(path.resolve("package.json"), "utf8")
);
const expectedRepository =
  process.env.GITHUB_REPOSITORY ||
  packageJson.repository?.full_name ||
  "buicongnguyen/Choice_of_life";

const result = await assertReleaseFile({
  releasePath: path.resolve("dist", "release.json"),
  expectedCommit,
  expectedRepository,
  expectedVersion: String(packageJson.version),
});

console.log(`Verified built release ${result.release.commit}`);
