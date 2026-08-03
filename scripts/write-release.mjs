import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const requested = process.env.GITHUB_SHA || process.argv[2] || "local";
if (requested !== "local" && !/^[0-9a-f]{40}$/i.test(requested)) {
  throw new Error(`Release commit must be a 40-character SHA or "local": ${requested}`);
}

const packageJson = JSON.parse(
  await readFile(path.resolve("package.json"), "utf8")
);
const release = {
  commit: requested.toLowerCase(),
  version: String(packageJson.version),
  repository:
    process.env.GITHUB_REPOSITORY ||
    packageJson.repository?.full_name ||
    "buicongnguyen/Choice_of_life",
};

const publicDir = path.resolve("public");
await mkdir(publicDir, { recursive: true });
await writeFile(
  path.join(publicDir, "release.json"),
  `${JSON.stringify(release, null, 2)}\n`,
  "utf8"
);

console.log(`Stamped Choice of Life release ${release.commit}`);
