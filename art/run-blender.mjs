// Run the Blender asset build headless, then pack the results.
//   node art/run-blender.mjs [group|name ...]
// Blender is found from $BLENDER, then the portable copy used on the author's machine.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const candidates = [
  process.env.BLENDER,
  path.resolve(root, "..", "Game_simple", ".tools", "blender-4.5.9-windows-x64", "blender.exe"),
  "blender",
].filter(Boolean);
const blender = candidates.find((c) => c === "blender" || existsSync(c));
const args = process.argv.slice(2);
execFileSync(blender, ["--background", "--factory-startup", "--python", path.join(root, "art", "build.py"), "--", ...args], {
  stdio: "inherit",
});
execFileSync(process.execPath, [path.join(root, "art", "pack.mjs"), ...args], { stdio: "inherit" });
