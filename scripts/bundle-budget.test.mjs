import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  auditBundleBudget,
  evaluateBudgetMeasurements,
  PHASE_1_BUDGET_PROFILE,
  validateBudgetProfile,
} from "./bundle-budget.mjs";

const MANIFEST = Object.freeze({
  "index.html": {
    file: "assets/index.js",
    name: "index",
    src: "index.html",
    isEntry: true,
    imports: ["_static.js"],
    dynamicImports: ["src/lazy.js"],
    css: ["assets/index.css"],
  },
  "_static.js": {
    file: "assets/static.js",
    css: ["assets/static.css"],
    assets: ["assets/font.woff2"],
  },
  "src/lazy.js": {
    file: "assets/lazy.js",
    css: ["assets/lazy.css"],
  },
});

const INDEX_HTML = `<!doctype html>
<html>
  <head>
    <link rel="icon" href="./favicon.svg">
    <link rel="stylesheet" href="./assets/index.css">
    <link rel="modulepreload" href="./assets/static.js">
  </head>
  <body><script type="module" crossorigin src="./assets/index.js"></script></body>
</html>
`;

describe("Phase 1 bundle budget", () => {
  let distDir;

  async function put(relative, contents) {
    const absolute = path.join(distDir, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }

  async function writeValidArtifact() {
    await Promise.all([
      put("index.html", INDEX_HTML),
      put("favicon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"),
      put("release.json", "{\"commit\":\"local\",\"version\":\"1.0.0\",\"repository\":\"owner/repo\"}\n"),
      put(".vite/manifest.json", JSON.stringify(MANIFEST)),
      put("assets/index.js", "import './static.js'; import('./lazy.js');\n"),
      put("assets/static.js", "export const ready=true;\n"),
      put("assets/lazy.js", "export const lazy=true;\n"),
      put("assets/index.css", "body{margin:0}\n"),
      put("assets/static.css", ".shell{display:block}\n"),
      put("assets/lazy.css", ".lazy{display:none}\n"),
      put("assets/font.woff2", Buffer.from([0, 1, 2, 3])),
    ]);
  }

  beforeEach(async () => {
    distDir = await mkdtemp(path.join(tmpdir(), "choice-budget-"));
    await writeValidArtifact();
  });

  afterEach(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  it("measures the manifest static and dynamic closures", async () => {
    const report = await auditBundleBudget({ distDir });

    expect(report.ok, report.failures.join("\n")).toBe(true);
    expect(report.profile).toBe("phase-1");
    expect(report.mainEntryFiles).toEqual([
      "assets/index.js",
      "assets/lazy.js",
      "assets/static.js",
    ]);
    expect(report.criticalFiles).toEqual([
      "assets/index.css",
      "assets/index.js",
      "assets/static.css",
      "assets/static.js",
      "index.html",
    ]);
    expect(report.criticalFiles).not.toContain("assets/lazy.js");
  });

  it("counts .mjs and .cjs chunks as executable members of the entry graph", async () => {
    const manifest = structuredClone(MANIFEST);
    manifest["_static.js"].file = "assets/static.mjs";
    manifest["src/lazy.js"].file = "assets/lazy.cjs";
    await Promise.all([
      rm(path.join(distDir, "assets", "static.js")),
      rm(path.join(distDir, "assets", "lazy.js")),
    ]);
    await Promise.all([
      put(".vite/manifest.json", JSON.stringify(manifest)),
      put("index.html", INDEX_HTML.replace("assets/static.js", "assets/static.mjs")),
      put("assets/static.mjs", "export const ready=true;\n"),
      put("assets/lazy.cjs", "exports.lazy=true;\n"),
    ]);

    const report = await auditBundleBudget({ distDir });
    expect(report.ok, report.failures.join("\n")).toBe(true);
    expect(report.mainEntryFiles).toEqual([
      "assets/index.js",
      "assets/lazy.cjs",
      "assets/static.mjs",
    ]);
    expect(report.mainEntryJsBytes).toBeGreaterThan(0);
  });

  it("compresses each critical file independently with the locked settings", async () => {
    const report = await auditBundleBudget({ distDir });
    const criticalContents = await Promise.all(
      report.criticalFiles.map((file) =>
        import("node:fs/promises").then(({ readFile }) =>
          readFile(path.join(distDir, ...file.split("/")))
        )
      )
    );
    const expectedGzip = criticalContents.reduce(
      (total, contents) => total + gzipSync(contents, { level: 9, mtime: 0 }).byteLength,
      0
    );
    const expectedBrotli = criticalContents.reduce(
      (total, contents) =>
        total +
        brotliCompressSync(contents, {
          params: {
            [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
            [zlibConstants.BROTLI_PARAM_LGWIN]: 22,
          },
        }).byteLength,
      0
    );

    expect(report.criticalGzipBytes).toBe(expectedGzip);
    expect(report.criticalBrotliBytes).toBe(expectedBrotli);
    expect(report.compression.gzip.aggregation).toBe("per-file");
    expect(report.compression.brotli.aggregation).toBe("per-file");
  });

  it("rejects the stale Phase 0A profile and its relaxed limits", async () => {
    const stale = {
      id: "phase-0a",
      limits: {
        totalBytes: 105 * 1024 * 1024,
        mainEntryJsBytes: 450 * 1024,
        cssBytes: 50 * 1024,
        criticalGzipBytes: 500_000,
        criticalBrotliBytes: 500_000,
      },
    };

    const report = await auditBundleBudget({ distDir, profile: stale });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/must be phase-1/i);
    expect(report.failures.join(" ")).toMatch(/locked Phase 1 ceiling/i);
  });

  it("locks every Phase 1 ceiling", () => {
    expect(validateBudgetProfile(PHASE_1_BUDGET_PROFILE)).toEqual([]);
    const atLimit = { ...PHASE_1_BUDGET_PROFILE.limits };
    expect(
      evaluateBudgetMeasurements(atLimit, PHASE_1_BUDGET_PROFILE)
    ).toEqual([]);

    for (const key of Object.keys(atLimit)) {
      const failures = evaluateBudgetMeasurements(
        { ...atLimit, [key]: atLimit[key] + 1 },
        PHASE_1_BUDGET_PROFILE
      );
      expect(failures.join(" "), key).toContain(`${key} ${atLimit[key] + 1}`);
    }
  });

  it.each([
    ["avatar-preview.html", "<!doctype html>", /preview HTML is forbidden/i],
    ["assets/player.PNG", Buffer.from([1]), /PNG output is forbidden/i],
    ["assets/orphan.txt", "orphan", /unexpected emitted file/i],
  ])("rejects unexpected inventory file %s", async (file, contents, message) => {
    await put(file, contents);

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(message);
  });

  it.each(["assets/hidden.mjs", "assets/hidden.cjs", "assets/hidden.html"])(
    "rejects executable output hidden in a manifest asset field: %s",
    async (asset) => {
      const manifest = structuredClone(MANIFEST);
      manifest["_static.js"].assets = [asset];
      await put(".vite/manifest.json", JSON.stringify(manifest));
      await put(asset, "executable");

      const report = await auditBundleBudget({ distDir });
      expect(report.ok).toBe(false);
      expect(report.failures.join(" ")).toMatch(/hides executable\/style output as an asset/i);
    }
  );

  it("rejects a non-executable file masquerading as a manifest module", async () => {
    const manifest = structuredClone(MANIFEST);
    manifest["src/lazy.js"].file = "assets/lazy.txt";
    await rm(path.join(distDir, "assets", "lazy.js"));
    await Promise.all([
      put(".vite/manifest.json", JSON.stringify(manifest)),
      put("assets/lazy.txt", "not executable"),
    ]);

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      "manifest module output is not executable: assets/lazy.txt"
    );
  });

  it.each([
    [INDEX_HTML.replace("</body>", "<script>alert(1)</script></body>"), /inline script|classic or untyped/i],
    [INDEX_HTML.replace("</body>", '<script src="./assets/index.js"></script></body>'), /classic or untyped/i],
    [INDEX_HTML.replace('src="./assets/index.js"', "src=./assets/index.js"), /src must be quoted/i],
    [INDEX_HTML.replace('></script>', '>alert(1)</script>'), /inline script body/i],
    [INDEX_HTML.replace("<body>", '<body onclick="legacy()">'), /inline event handler/i],
    [INDEX_HTML.replace("<body>", '<body style="background:red">'), /inline style attribute/i],
    [INDEX_HTML.replace("<head>", '<head><base href="/legacy/">'), /<base> is forbidden/i],
    [INDEX_HTML.replace("<body>", '<body><img srcset="legacy.png 1x">'), /srcset is forbidden/i],
    [INDEX_HTML.replace("<body>", '<body><a href="javascript:legacy()">bad</a>'), /javascript: URL is forbidden/i],
    [INDEX_HTML.replace("<body>", '<body><iframe srcdoc="legacy"></iframe>'), /srcdoc is forbidden/i],
    [INDEX_HTML.replace("<body>", '<body><svg><use href="data:image/svg+xml,legacy"></use></svg>'), /unexpected <use> dependency/i],
  ])("rejects executable or dependency-smuggling HTML", async (html, expected) => {
    await put("index.html", html);
    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(expected);
  });

  it("inspects executable content in every emitted HTML file", async () => {
    await put("legacy.html", "<script>legacy()</script>");
    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/additional HTML output is forbidden/i);
    expect(report.failures.join(" ")).toMatch(/inline script|classic or untyped/i);
  });

  it("counts duplicate identical module script tags instead of deduplicating them", async () => {
    await put(
      "index.html",
      INDEX_HTML.replace(
        "</body>",
        '<script type="module" src="./assets/index.js"></script></body>'
      )
    );
    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      "index.html must contain exactly one module script, found 2"
    );
  });

  it("rejects a favicon link with a mixed stylesheet relationship", async () => {
    await put(
      "index.html",
      INDEX_HTML.replace('rel="icon"', 'rel="icon stylesheet"')
    );
    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      "index.html favicon link must use only rel=icon"
    );
  });

  it("rejects an emitted file missing from the manifest closure", async () => {
    await rm(path.join(distDir, "assets", "lazy.js"));

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/manifest output is missing: assets\/lazy\.js/i);
  });

  it("rejects a missing Vite manifest", async () => {
    await rm(path.join(distDir, ".vite", "manifest.json"));

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/manifest\.json/i);
  });

  it("rejects a malformed Vite manifest", async () => {
    await put(".vite/manifest.json", "{not-json");

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures).toContain("Vite manifest contains malformed JSON");
  });

  it("rejects a second production entry", async () => {
    await put(
      ".vite/manifest.json",
      JSON.stringify({
        ...MANIFEST,
        "avatar-preview.html": {
          file: "assets/preview.js",
          src: "avatar-preview.html",
          isEntry: true,
        },
      })
    );
    await put("assets/preview.js", "console.log('preview')\n");

    const report = await auditBundleBudget({ distDir });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/sole entry/i);
  });
});
