import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract for the Pages deploy workflow.
 *
 * The previous version of this file asserted a four-job distributed pipeline
 * with sharded runner evaluation, Playwright browser installs, and plan-digest
 * transport. That pipeline was never built: at the commit that introduced these
 * tests the workflow was already the simple build-and-deploy it remained. Since
 * no CI ran the test suite, three permanently failing tests sat on `main`
 * unnoticed.
 *
 * These assertions now describe the workflow that exists and the property that
 * actually matters: nothing reaches production without passing verification
 * first.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "deploy-pages.yml");
const ACTION_PINS = Object.freeze({
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  setupNode: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
  configurePages: "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0",
  uploadPages: "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0",
  deployPages: "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0",
});

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

describe("Pages deploy workflow contract", () => {
  it("pins the exact release commit in every job that checks out code", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    // verify and build both check out; deploy consumes the uploaded artifact.
    expect(occurrences(source, /ref: \$\{\{ github\.sha \}\}/g)).toBe(2);
    expect(occurrences(source, /persist-credentials: false/g)).toBe(2);
    expect(occurrences(source, /node-version: 22\.23\.1/g)).toBe(2);
    expect(source.split(ACTION_PINS.checkout).length - 1).toBe(2);
    expect(source.split(ACTION_PINS.setupNode).length - 1).toBe(2);
    expect(occurrences(source, /npm run release:stamp/g)).toBe(2);
  });

  it("runs every verification gate before anything is built or uploaded", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    const verifyIndex = source.indexOf("verify:");
    const buildIndex = source.indexOf("\n  build:");
    const deployIndex = source.indexOf("\n  deploy:");
    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(verifyIndex);
    expect(deployIndex).toBeGreaterThan(buildIndex);

    // Build waits for verification; deploy waits for build. This ordering is the
    // whole point of the workflow.
    expect(source).toMatch(/\n {2}build:\n\s+needs: verify/);
    expect(source).toMatch(/\n {2}deploy:\n\s+needs: build/);

    // The browser the runner matrix test drives must be installed before the
    // suite runs, or that test fails in CI while passing locally.
    const browserInstallIndex = source.indexOf(
      "npx --no-install playwright install --with-deps chromium",
    );
    expect(browserInstallIndex).toBeGreaterThan(verifyIndex);
    expect(browserInstallIndex).toBeLessThan(source.indexOf("run: npm run test:ci"));

    for (const gate of [
      "run: npm run check",
      "run: npm run check:core",
      "run: npm run boundaries",
      "run: npm run test:ci",
    ]) {
      const gateIndex = source.indexOf(gate);
      expect(gateIndex, gate).toBeGreaterThan(verifyIndex);
      expect(gateIndex, `${gate} must run in verify, before build`)
        .toBeLessThan(buildIndex);
    }
  });

  it("verifies the built release and blocks bundle regressions before upload", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    const buildStepIndex = source.indexOf("run: npm run build");
    const releaseVerifyIndex = source.indexOf("run: npm run release:verify");
    const ratchetIndex = source.indexOf("run: npm run budget:ratchet");
    const pagesUploadIndex = source.indexOf(`uses: ${ACTION_PINS.uploadPages}`);
    expect(buildStepIndex).toBeGreaterThan(0);
    expect(releaseVerifyIndex).toBeGreaterThan(buildStepIndex);
    expect(ratchetIndex).toBeGreaterThan(buildStepIndex);
    expect(pagesUploadIndex).toBeGreaterThan(ratchetIndex);
    expect(source).toContain(`uses: ${ACTION_PINS.configurePages}`);
    expect(source).toContain(`uses: ${ACTION_PINS.deployPages}`);
  });

  it("allows exactly the two triaged test exceptions, and no more", async () => {
    // The deploy runs `test:ci`, which is the full suite minus two tests that
    // PHASE_0_BASELINE.md records as accepted exceptions awaiting an owner
    // decision. Widening that list must be a deliberate, reviewed act, so it is
    // pinned here rather than left to drift.
    const packageDocument = JSON.parse(
      await readFile(path.join(ROOT, "package.json"), "utf8"),
    );
    const ci = packageDocument.scripts["test:ci"];
    expect(ci, "test:ci script is missing").toBeTypeOf("string");

    const alwaysExcluded = [
      "src/choice-of-life/core/runner/evaluation-replay.test.ts",
      "scripts/runner-laboratory-evaluator.test.ts",
    ];
    const triagedExceptions = [
      "scripts/fixture-lock.test.mjs",
      "scripts/runner-laboratory-evaluator-cli.test.ts",
    ];
    const excluded = [...ci.matchAll(/--exclude (\S+)/g)].map((m) => m[1]);
    // The two always-excluded files are re-run separately by the same script.
    for (const file of alwaysExcluded) {
      expect(excluded, file).toContain(file);
      expect(ci, `${file} must still be run separately`).toContain(`vitest run ${file}`);
    }
    const exceptions = excluded.filter((file) => !alwaysExcluded.includes(file));
    expect(exceptions.sort(), "the triaged exception list changed")
      .toEqual([...triagedExceptions].sort());

    // Each exception must be documented where the decision is recorded.
    const baseline = await readFile(path.join(ROOT, "PHASE_0_BASELINE.md"), "utf8");
    for (const file of triagedExceptions) {
      expect(baseline, `${file} is excluded but undocumented`)
        .toContain(path.basename(file));
    }
  });

  it("keeps every action pinned to a full commit SHA and every job bounded", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    const usesLines = source.split("\n").filter((line) => line.trimStart().startsWith("uses:"));
    expect(usesLines.length).toBeGreaterThan(0);
    expect(usesLines.every((line) => /@[0-9a-f]{40}(?:\s+#\s+v[0-9.]+)?$/.test(line.trim())))
      .toBe(true);
    const timeouts = [...source.matchAll(/timeout-minutes: (\d+)/g)]
      .map((match) => Number(match[1]));
    expect(timeouts).toHaveLength(3);
    expect(timeouts.every((minutes) => minutes > 0 && minutes < 360)).toBe(true);
    // A failure must stop the pipeline, never be swallowed into a green deploy.
    expect(source).not.toContain("continue-on-error");
    expect(source).not.toMatch(/if:\s*\$\{\{\s*always\(\)/);
  });
});
