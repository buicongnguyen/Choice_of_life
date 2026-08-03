import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

const LOCKED_LIMITS = Object.freeze({
  totalBytes: 20_000_000,
  mainEntryJsBytes: 180_000,
  cssBytes: 30_000,
  criticalGzipBytes: 350_000,
  criticalBrotliBytes: 350_000,
});

export const PHASE_1_BUDGET_PROFILE = Object.freeze({
  id: "phase-1",
  limits: LOCKED_LIMITS,
});

const PROFILE_KEYS = Object.freeze(["id", "limits"]);
const LIMIT_KEYS = Object.freeze(Object.keys(LOCKED_LIMITS).sort());
const REQUIRED_ARTIFACTS = Object.freeze([
  ".vite/manifest.json",
  "favicon.svg",
  "index.html",
  "release.json",
]);
const EXECUTABLE_EXTENSION = /\.(?:js|mjs|cjs)$/i;

function isExecutableFile(file) {
  return EXECUTABLE_EXTENSION.test(file);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sameKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function validateBudgetProfile(profile) {
  const failures = [];
  if (!sameKeys(profile, PROFILE_KEYS)) {
    failures.push("budget profile must contain exactly id and limits");
  }
  if (!isPlainObject(profile)) return failures;

  if (profile.id !== "phase-1") {
    failures.push(
      `active budget profile must be phase-1, received ${String(profile.id)}`
    );
  }
  if (!sameKeys(profile.limits, LIMIT_KEYS)) {
    failures.push(
      `budget limits must contain exactly: ${LIMIT_KEYS.join(", ")}`
    );
    return uniqueSorted(failures);
  }

  for (const key of LIMIT_KEYS) {
    const value = profile.limits[key];
    if (!Number.isSafeInteger(value) || value <= 0) {
      failures.push(`${key} must be a positive safe integer`);
    } else if (value > LOCKED_LIMITS[key]) {
      failures.push(
        `${key} ${value} exceeds the locked Phase 1 ceiling ${LOCKED_LIMITS[key]}`
      );
    }
  }
  return uniqueSorted(failures);
}

export function evaluateBudgetMeasurements(measurements, profile) {
  const failures = validateBudgetProfile(profile);
  const limits = isPlainObject(profile?.limits)
    ? profile.limits
    : LOCKED_LIMITS;

  for (const key of LIMIT_KEYS) {
    const measured = measurements?.[key];
    const limit = limits[key];
    if (!Number.isSafeInteger(measured) || measured < 0) {
      failures.push(`${key} measurement must be a non-negative safe integer`);
    } else if (Number.isSafeInteger(limit) && measured > limit) {
      failures.push(`${key} ${measured} exceeds ${limit}`);
    }
  }
  return uniqueSorted(failures);
}

function normalizeArtifactPath(value, label, failures) {
  if (typeof value !== "string" || value.trim().length === 0) {
    failures.push(`${label} must be a non-empty path string`);
    return null;
  }

  let candidate = value.trim();
  if (
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(candidate) ||
    candidate.startsWith("//")
  ) {
    failures.push(`${label} must resolve inside dist: ${value}`);
    return null;
  }
  if (candidate.includes("\\") || candidate.includes("?") || candidate.includes("#")) {
    failures.push(`${label} uses an unsupported path form: ${value}`);
    return null;
  }

  while (candidate.startsWith("./")) candidate = candidate.slice(2);
  while (candidate.startsWith("/")) candidate = candidate.slice(1);
  const normalized = path.posix.normalize(candidate);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    failures.push(`${label} escapes dist: ${value}`);
    return null;
  }
  return normalized;
}

async function collectArtifactFiles(distDir, failures) {
  const files = new Map();

  async function visit(directory, relativeDirectory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const detail = error && typeof error === "object" && "code" in error
        ? ` (${error.code})`
        : "";
      failures.push(
        `cannot read artifact directory ${relativeDirectory || "."}${detail}`
      );
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        try {
          files.set(relative, await readFile(absolute));
        } catch (error) {
          const detail = error && typeof error === "object" && "code" in error
            ? ` (${error.code})`
            : "";
          failures.push(`cannot read emitted file ${relative}${detail}`);
        }
      } else {
        failures.push(`unsupported emitted filesystem entry: ${relative}`);
      }
    }
  }

  await visit(distDir, "");
  return files;
}

function parseAttributes(tag) {
  const attributes = new Map();
  const duplicates = [];
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const opening = tag.match(/^<\s*[^\s/>]+/);
  attributePattern.lastIndex = opening ? opening[0].length : 0;
  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if (attributes.has(name)) duplicates.push(name);
    attributes.set(name, {
      value: match[2] ?? match[3] ?? match[4] ?? "",
      hasValue: match[2] !== undefined || match[3] !== undefined || match[4] !== undefined,
      quoted: match[2] !== undefined || match[3] !== undefined,
    });
  }
  return { attributes, duplicates };
}

function parseIndexReferences(indexHtml, failures) {
  const moduleScripts = [];
  const modulePreloads = [];
  const stylesheets = [];
  const withoutComments = indexHtml.replace(/<!--[\s\S]*?-->/g, "");
  const scriptBodies = new Map();

  for (const match of withoutComments.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    scriptBodies.set(match.index, match[1]);
  }

  for (const match of withoutComments.matchAll(/<([A-Za-z][\w:-]*)\b[^<>]*>/g)) {
    const tagName = match[1].toLowerCase();
    const { attributes, duplicates } = parseAttributes(match[0]);
    for (const duplicate of duplicates) {
      failures.push(`index.html has duplicate ${duplicate} attribute on <${tagName}>`);
    }
    for (const [name, attribute] of attributes) {
      if (name === "style") {
        failures.push(`index.html inline style attribute is forbidden on <${tagName}>`);
      }
      if (name.startsWith("on")) {
        failures.push(`index.html inline event handler ${name} is forbidden on <${tagName}>`);
      }
      if (/^\s*javascript:/i.test(attribute.value)) {
        failures.push(`index.html executable javascript: URL is forbidden on <${tagName}>`);
      }
      if (name === "srcdoc") failures.push("index.html iframe srcdoc is forbidden");
    }

    if (tagName === "style") failures.push("index.html inline <style> is forbidden");
    if (tagName === "base") failures.push("index.html <base> is forbidden");
    if (attributes.has("srcset")) failures.push(`index.html <${tagName}> srcset is forbidden`);
    if (
      tagName === "meta" &&
      attributes.get("http-equiv")?.value.toLowerCase() === "refresh"
    ) {
      failures.push("index.html meta refresh is forbidden");
    }

    const requireQuoted = (name) => {
      const attribute = attributes.get(name);
      if (!attribute) return null;
      if (!attribute.hasValue || attribute.value.length === 0) {
        failures.push(`index.html <${tagName}> ${name} must have a value`);
        return null;
      }
      if (!attribute.quoted) failures.push(`index.html <${tagName}> ${name} must be quoted`);
      return attribute.value;
    };

    if (tagName === "script") {
      const type = attributes.get("type");
      if (type && !type.quoted) failures.push("index.html <script> type must be quoted");
      const isModule = type?.value.toLowerCase() === "module";
      if (!isModule) failures.push("index.html classic or untyped script is forbidden");
      const source = requireQuoted("src");
      if (!source) {
        failures.push("index.html inline script is forbidden");
      } else if (isModule) {
        const normalized = normalizeArtifactPath(
          source,
          "index.html module script",
          failures
        );
        if (normalized) moduleScripts.push(normalized);
      }
      if ((scriptBodies.get(match.index) ?? "").trim().length > 0) {
        failures.push("index.html inline script body is forbidden");
      }
    } else if (tagName === "link") {
      const rel = attributes.get("rel");
      if (rel && !rel.quoted) failures.push("index.html <link> rel must be quoted");
      const relationships = (rel?.value ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const href = requireQuoted("href");
      if (!href) continue;
      if (relationships.includes("icon") && href.replace(/^\.\//, "") === "favicon.svg") {
        if (relationships.length === 1) continue;
        failures.push("index.html favicon link must use only rel=icon");
      }
      if (!relationships.includes("modulepreload") && !relationships.includes("stylesheet")) {
        failures.push(`index.html unexpected link dependency: ${href}`);
        continue;
      }
      const normalized = normalizeArtifactPath(href, "index.html link", failures);
      if (!normalized) continue;
      if (relationships.includes("modulepreload")) modulePreloads.push(normalized);
      if (relationships.includes("stylesheet")) stylesheets.push(normalized);
    } else if (["img", "source", "input", "image", "use", "audio", "video", "track", "iframe", "embed", "object"].includes(tagName)) {
      for (const name of ["src", "href", "xlink:href", "poster", "data", "srcset"]) {
        const dependency = requireQuoted(name);
        if (dependency) failures.push(`index.html unexpected <${tagName}> dependency: ${dependency}`);
      }
    } else if (tagName === "base") {
      requireQuoted("href");
    }
  }

  return {
    moduleScripts: [...moduleScripts].sort(),
    modulePreloads: uniqueSorted(modulePreloads),
    stylesheets: uniqueSorted(stylesheets),
  };
}

function createManifestReader(manifest, failures) {
  const cache = new Map();

  function readStringArray(record, key, recordKey) {
    if (record[key] === undefined) return [];
    if (!Array.isArray(record[key])) {
      failures.push(`manifest ${recordKey}.${key} must be an array`);
      return [];
    }
    const values = [];
    for (const value of record[key]) {
      if (typeof value !== "string" || value.length === 0) {
        failures.push(`manifest ${recordKey}.${key} must contain only strings`);
      } else {
        values.push(value);
      }
    }
    return values;
  }

  return function readRecord(recordKey) {
    if (cache.has(recordKey)) return cache.get(recordKey);
    const record = manifest[recordKey];
    if (!isPlainObject(record)) {
      failures.push(`manifest record is missing or invalid: ${recordKey}`);
      cache.set(recordKey, null);
      return null;
    }

    const file = normalizeArtifactPath(
      record.file,
      `manifest ${recordKey}.file`,
      failures
    );
    const css = readStringArray(record, "css", recordKey)
      .map((value) =>
        normalizeArtifactPath(value, `manifest ${recordKey}.css`, failures)
      )
      .filter(Boolean);
    const assets = readStringArray(record, "assets", recordKey)
      .map((value) =>
        normalizeArtifactPath(value, `manifest ${recordKey}.assets`, failures)
      )
      .filter(Boolean);
    const imports = readStringArray(record, "imports", recordKey);
    const dynamicImports = readStringArray(record, "dynamicImports", recordKey);

    for (const cssFile of css) {
      if (!cssFile.toLowerCase().endsWith(".css")) {
        failures.push(`manifest CSS reference is not a CSS file: ${cssFile}`);
      }
    }
    for (const asset of assets) {
      if (/\.(?:css|js|mjs|cjs|html?)$/i.test(asset)) {
        failures.push(`manifest hides executable/style output as an asset: ${asset}`);
      }
    }

    const parsed = { file, css, assets, imports, dynamicImports, source: record };
    cache.set(recordKey, parsed);
    return parsed;
  };
}

function traverseManifest({ manifest, readRecord, roots, includeDynamic, failures }) {
  const records = new Set();
  const emittedFiles = new Set();
  const jsFiles = new Set();
  const cssFiles = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const recordKey = queue.shift();
    if (records.has(recordKey)) continue;
    records.add(recordKey);
    if (!Object.hasOwn(manifest, recordKey)) {
      failures.push(`manifest dependency is missing: ${recordKey}`);
      continue;
    }
    const record = readRecord(recordKey);
    if (!record) continue;

    if (record.file) {
      emittedFiles.add(record.file);
      if (isExecutableFile(record.file)) jsFiles.add(record.file);
      if (record.file.toLowerCase().endsWith(".css")) cssFiles.add(record.file);
      if (!isExecutableFile(record.file)) {
        failures.push(`manifest module output is not executable: ${record.file}`);
      }
    }
    for (const cssFile of record.css) {
      emittedFiles.add(cssFile);
      cssFiles.add(cssFile);
    }
    for (const asset of record.assets) emittedFiles.add(asset);
    queue.push(...record.imports);
    if (includeDynamic) queue.push(...record.dynamicImports);
  }

  return { records, emittedFiles, jsFiles, cssFiles };
}

function compressCriticalFiles(criticalFiles, files, failures) {
  let gzipBytes = 0;
  let brotliBytes = 0;

  for (const file of [...criticalFiles].sort()) {
    const contents = files.get(file);
    if (!contents) {
      failures.push(`critical file is missing: ${file}`);
      continue;
    }
    gzipBytes += gzipSync(contents, { level: 9, mtime: 0 }).byteLength;
    brotliBytes += brotliCompressSync(contents, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_LGWIN]: 22,
      },
    }).byteLength;
  }

  return { gzipBytes, brotliBytes };
}

function sumBytes(fileNames, files, failures, label) {
  let total = 0;
  for (const file of fileNames) {
    const contents = files.get(file);
    if (!contents) {
      failures.push(`${label} file is missing: ${file}`);
    } else {
      total += contents.byteLength;
    }
  }
  return total;
}

export async function auditBundleBudget({
  distDir,
  profile = PHASE_1_BUDGET_PROFILE,
} = {}) {
  const failures = validateBudgetProfile(profile);
  const resolvedDist = path.resolve(distDir ?? "dist");
  const files = await collectArtifactFiles(resolvedDist, failures);
  const fileNames = [...files.keys()].sort();

  for (const required of REQUIRED_ARTIFACTS) {
    if (!files.has(required)) failures.push(`required emitted file is missing: ${required}`);
  }
  for (const file of fileNames) {
    if (path.posix.basename(file).toLowerCase() === "avatar-preview.html") {
      failures.push(`preview HTML is forbidden in Phase 1: ${file}`);
    }
    if (file.toLowerCase().endsWith(".png")) {
      failures.push(`PNG output is forbidden in Phase 1: ${file}`);
    }
    if (file.toLowerCase().endsWith(".html") && file !== "index.html") {
      failures.push(`additional HTML output is forbidden in Phase 1: ${file}`);
    }
  }

  let manifest = null;
  const manifestContents = files.get(".vite/manifest.json");
  if (manifestContents) {
    try {
      manifest = JSON.parse(manifestContents.toString("utf8"));
      if (!isPlainObject(manifest)) {
        failures.push("Vite manifest must contain a JSON object");
        manifest = null;
      }
    } catch {
      failures.push("Vite manifest contains malformed JSON");
    }
  }

  let indexHtml = "";
  const indexContents = files.get("index.html");
  if (indexContents) indexHtml = indexContents.toString("utf8");
  const indexReferences = parseIndexReferences(indexHtml, failures);
  for (const file of fileNames.filter((candidate) => candidate.endsWith(".html") && candidate !== "index.html")) {
    parseIndexReferences(files.get(file).toString("utf8"), failures);
  }

  let staticClosure = {
    records: new Set(),
    emittedFiles: new Set(),
    jsFiles: new Set(),
    cssFiles: new Set(),
  };
  let completeClosure = staticClosure;
  let entryFile = null;

  if (manifest) {
    const entryKeys = Object.entries(manifest)
      .filter(([, record]) => isPlainObject(record) && record.isEntry === true)
      .map(([key]) => key)
      .sort();
    if (entryKeys.length !== 1 || entryKeys[0] !== "index.html") {
      failures.push(
        `Vite manifest must expose index.html as its sole entry; found ${entryKeys.join(", ") || "none"}`
      );
    }

    const entryRecord = manifest["index.html"];
    if (!isPlainObject(entryRecord) || entryRecord.isEntry !== true) {
      failures.push("Vite manifest is missing the index.html entry record");
    } else {
      if (entryRecord.src !== "index.html") {
        failures.push("Vite manifest index entry must have src index.html");
      }
      const readRecord = createManifestReader(manifest, failures);
      const parsedEntry = readRecord("index.html");
      entryFile = parsedEntry?.file ?? null;
      if (entryFile && !isExecutableFile(entryFile)) {
        failures.push(`main entry output must be JavaScript: ${entryFile}`);
      }
      staticClosure = traverseManifest({
        manifest,
        readRecord,
        roots: ["index.html"],
        includeDynamic: false,
        failures,
      });
      completeClosure = traverseManifest({
        manifest,
        readRecord,
        roots: ["index.html"],
        includeDynamic: true,
        failures,
      });
    }
  }

  if (indexReferences.moduleScripts.length !== 1) {
    failures.push(
      `index.html must contain exactly one module script, found ${indexReferences.moduleScripts.length}`
    );
  }
  if (
    entryFile &&
    (indexReferences.moduleScripts.length !== 1 ||
      indexReferences.moduleScripts[0] !== entryFile)
  ) {
    failures.push(
      `index.html module script must match manifest entry ${entryFile}`
    );
  }
  for (const preload of indexReferences.modulePreloads) {
    if (!staticClosure.jsFiles.has(preload)) {
      failures.push(`modulepreload is outside the initial static graph: ${preload}`);
    }
  }
  for (const stylesheet of indexReferences.stylesheets) {
    if (!staticClosure.cssFiles.has(stylesheet)) {
      failures.push(`stylesheet is outside the manifest CSS closure: ${stylesheet}`);
    }
  }

  const expectedInventory = new Set(REQUIRED_ARTIFACTS);
  for (const file of completeClosure.emittedFiles) expectedInventory.add(file);
  const unexpectedFiles = fileNames.filter((file) => !expectedInventory.has(file));
  const missingFiles = [...expectedInventory]
    .filter((file) => !files.has(file))
    .sort();
  for (const file of unexpectedFiles) failures.push(`unexpected emitted file: ${file}`);
  for (const file of missingFiles) failures.push(`manifest output is missing: ${file}`);

  for (const file of expectedInventory) {
    if (isExecutableFile(file) && !completeClosure.jsFiles.has(file)) {
      failures.push(`JavaScript output is outside the main-entry graph: ${file}`);
    }
    if (file.toLowerCase().endsWith(".css") && !completeClosure.cssFiles.has(file)) {
      failures.push(`CSS output is outside the main-entry graph: ${file}`);
    }
  }

  const criticalFiles = new Set(["index.html"]);
  for (const file of staticClosure.jsFiles) criticalFiles.add(file);
  for (const file of staticClosure.cssFiles) criticalFiles.add(file);
  for (const file of indexReferences.modulePreloads) criticalFiles.add(file);
  for (const file of indexReferences.stylesheets) criticalFiles.add(file);

  const totalBytes = [...files.values()].reduce(
    (total, contents) => total + contents.byteLength,
    0
  );
  const mainEntryFiles = [...completeClosure.jsFiles].sort();
  const mainEntryJsBytes = sumBytes(
    mainEntryFiles,
    files,
    failures,
    "main-entry JavaScript"
  );
  const cssFiles = fileNames.filter((file) => file.toLowerCase().endsWith(".css"));
  const cssBytes = sumBytes(cssFiles, files, failures, "CSS");
  const compressed = compressCriticalFiles(criticalFiles, files, failures);
  const measurements = {
    totalBytes,
    mainEntryJsBytes,
    cssBytes,
    criticalGzipBytes: compressed.gzipBytes,
    criticalBrotliBytes: compressed.brotliBytes,
  };
  failures.push(...evaluateBudgetMeasurements(measurements, profile));

  const finalFailures = uniqueSorted(failures);
  return {
    ok: finalFailures.length === 0,
    profile: profile?.id ?? null,
    files: fileNames.length,
    ...measurements,
    mainEntryFiles,
    cssFiles,
    criticalFiles: [...criticalFiles].sort(),
    unexpectedFiles,
    missingFiles,
    limits: profile?.limits ?? null,
    compression: {
      gzip: { level: 9, mtime: 0, aggregation: "per-file" },
      brotli: { mode: "text", quality: 11, lgwin: 22, aggregation: "per-file" },
    },
    failures: finalFailures,
  };
}

export async function assertBundleBudget(options) {
  const report = await auditBundleBudget(options);
  if (!report.ok) {
    const error = new Error(`Bundle budget failed: ${report.failures.join("; ")}`);
    error.report = report;
    throw error;
  }
  return report;
}
