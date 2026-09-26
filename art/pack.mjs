// Compress the raw Blender exports in art/.raw into public/models with gltfpack
// (meshopt + quantisation) while keeping node names, material names and extras,
// which are the runtime contract. Updates the byte sizes in the manifest.
//
//   node art/pack.mjs [name ...]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const raw = path.join(root, "art", ".raw");
const out = path.join(root, "public", "models");
const cli = path.join(root, "node_modules", "gltfpack", "cli.js");
const manifestPath = path.join(out, "manifest.json");

const only = new Set(process.argv.slice(2));
// Assemble the manifest from the per-asset sidecars written by art/build.py.
const manifest = {};
for (const file of readdirSync(raw).filter((f) => f.endsWith(".json"))) {
  manifest[file.slice(0, -5)] = JSON.parse(readFileSync(path.join(raw, file), "utf8"));
}
let packed = 0;
for (const file of readdirSync(raw).filter((f) => f.endsWith(".glb"))) {
  const name = file.slice(0, -4);
  if (only.size && !only.has(name) && !only.has(manifest[name]?.group)) continue;
  const target = path.join(out, file);
  if (!only.size && existsSync(target) && statSync(target).mtimeMs > statSync(path.join(raw, file)).mtimeMs) continue;
  execFileSync(process.execPath, [cli, "-i", path.join(raw, file), "-o", target, "-cc", "-kn", "-km", "-ke"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  packed += 1;
}
for (const name of Object.keys(manifest)) {
  const target = path.join(out, name + ".glb");
  if (existsSync(target)) manifest[name].bytes = statSync(target).size;
  else delete manifest[name];
}
const sorted = Object.fromEntries(Object.keys(manifest).sort().map((key) => [key, manifest[key]]));
writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + "\n");
const total = Object.values(manifest).reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`packed ${packed} models; ${Object.keys(manifest).length} in manifest, ${(total / 1e6).toFixed(2)} MB total`);
