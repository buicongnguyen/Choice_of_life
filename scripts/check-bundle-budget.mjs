import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { extractRelativeJsImports } from "./bundle-graph.mjs";

const distDir = path.resolve("dist");

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const files = await collectFiles(distDir);
const measured = [];
for (const file of files) {
  const info = await stat(file);
  measured.push({
    file: path.relative(distDir, file).replaceAll("\\", "/"),
    bytes: info.size,
  });
}

const totalBytes = measured.reduce((sum, file) => sum + file.bytes, 0);
const largestFile = measured.reduce(
  (largest, file) => (file.bytes > largest.bytes ? file : largest),
  { file: "", bytes: 0 }
);
const measuredByFile = new Map(measured.map((file) => [file.file, file]));
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
const entrySources = [
  ...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/gi),
].map((match) => match[1].replace(/^(?:\.\/|\/)/, ""));

if (entrySources.length === 0) {
  throw new Error("Bundle budget failed: dist/index.html has no JavaScript entry");
}

const entryClosure = new Set();
const queue = [...entrySources];
while (queue.length > 0) {
  const current = queue.shift();
  if (entryClosure.has(current)) continue;
  const measuredFile = measuredByFile.get(current);
  if (!measuredFile) {
    throw new Error(`Bundle budget failed: missing entry asset ${current}`);
  }
  entryClosure.add(current);
  const source = await readFile(path.join(distDir, current), "utf8");
  const imports = extractRelativeJsImports(source).map((specifier) =>
    path
      .relative(
        distDir,
        path.resolve(path.dirname(path.join(distDir, current)), specifier)
      )
      .replaceAll("\\", "/")
  );
  queue.push(...imports);
}

const mainEntryJsBytes = [...entryClosure].reduce(
  (sum, file) => sum + measuredByFile.get(file).bytes,
  0
);
const cssBytes = measured
  .filter(({ file }) => file.endsWith(".css"))
  .reduce((sum, file) => sum + file.bytes, 0);

// Phase 0A baseline limits. Later phases ratchet these down; they must never
// silently move upward to accommodate a regression.
const limits = {
  totalBytes: 105 * 1024 * 1024,
  // Honest Phase 0A baseline for the complete entry graph, including its
  // statically and dynamically imported modules. Phase 1 ratchets this to
  // 180 KiB after the legacy preview/runtime is removed from production.
  mainEntryJsBytes: 450 * 1024,
  cssBytes: 50 * 1024,
  largestFileBytes: 5 * 1024 * 1024,
};

const failures = [];
if (totalBytes > limits.totalBytes) {
  failures.push(`artifact ${totalBytes} > ${limits.totalBytes}`);
}
if (mainEntryJsBytes > limits.mainEntryJsBytes) {
  failures.push(
    `main entry JS ${mainEntryJsBytes} > ${limits.mainEntryJsBytes}`
  );
}
if (cssBytes > limits.cssBytes) {
  failures.push(`CSS ${cssBytes} > ${limits.cssBytes}`);
}
if (largestFile.bytes > limits.largestFileBytes) {
  failures.push(
    `largest file ${largestFile.file} (${largestFile.bytes}) > ${limits.largestFileBytes}`
  );
}

console.log(
  JSON.stringify(
    {
      files: measured.length,
      totalBytes,
      mainEntryJsBytes,
      mainEntryFiles: [...entryClosure].sort(),
      cssBytes,
      largestFile,
      limits,
    },
    null,
    2
  )
);

if (failures.length > 0) {
  throw new Error(`Bundle budget failed: ${failures.join("; ")}`);
}
