import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "deploy-pages.yml");
const ACTION_PINS = Object.freeze({
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  setupNode: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
  uploadArtifact: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
  downloadArtifact: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1",
  configurePages: "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0",
  uploadPages: "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0",
  deployPages: "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0",
});

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

describe("distributed Pages workflow contract", () => {
  it("pins the exact release in every computational job and closes the 4x4 DAG", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    expect(occurrences(source, /ref: \$\{\{ github\.sha \}\}/g)).toBe(3);
    expect(occurrences(source, /persist-credentials: false/g)).toBe(3);
    expect(occurrences(source, /node-version: 22\.23\.1/g)).toBe(3);
    expect(source.split(ACTION_PINS.checkout).length - 1).toBe(3);
    expect(source.split(ACTION_PINS.setupNode).length - 1).toBe(3);
    expect(occurrences(source, /npm run release:stamp/g)).toBe(3);
    expect(source).toContain("fail-fast: false");
    expect(source).toContain("max-parallel: 4");
    expect(source).toContain("group: [0, 1, 2, 3]");
    expect(source).toContain("--groups 4");
    expect(source).toContain("--workers-per-group 4");
    expect(source).toMatch(/aggregate-build:\n\s+needs:\n\s+- preflight\n\s+- runner-shards/);
    expect(source).toMatch(
      /aggregate-build:[\s\S]*?permissions:\n\s+contents: read\n\s+pages: read\n\s+steps:/,
    );
    expect(source).toMatch(/deploy:\n\s+needs: aggregate-build/);
    expect(source).not.toContain("continue-on-error");
    expect(source).not.toMatch(/if:\s*\$\{\{\s*always\(\)/);
  });

  it("uses immutable current artifact actions, explicit downloads, and independent plan-digest transport", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    const usesLines = source.split("\n").filter((line) => line.trimStart().startsWith("uses:"));
    expect(usesLines.every((line) => /@[0-9a-f]{40}(?:\s+#\s+v[0-9.]+)?$/.test(line.trim())))
      .toBe(true);
    expect(source.split(ACTION_PINS.uploadArtifact).length - 1).toBe(2);
    // Two exact plan downloads plus four explicit, independently named groups.
    expect(source.split(ACTION_PINS.downloadArtifact).length - 1).toBe(6);
    for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
      expect(source).toContain(`name: runner-shards-\${{ github.sha }}-group-${groupIndex}`);
      expect(source).toContain(
        `path: \${{ runner.temp }}/runner-distributed-shards/runner-shards-\${{ github.sha }}-group-${groupIndex}`,
      );
    }
    expect(source).toContain("plan_sha256: ${{ steps.plan-digest.outputs.value }}");
    expect(occurrences(source, /needs\.preflight\.outputs\.plan_sha256/g)).toBe(3);
    expect(source).toContain("--expected-plan-sha256");
    expect(source).toContain("runner-distributed-plan-v1.sha256");
  });

  it("keeps all bounded jobs below six hours and verifies exact tested bytes before Pages upload", async () => {
    const source = await readFile(WORKFLOW_PATH, "utf8");
    expect([...source.matchAll(/timeout-minutes: (\d+)/g)].map((match) => Number(match[1])))
      .toEqual([45, 240, 180, 15]);
    const aggregateIndex = source.indexOf("distributed-aggregate \\");
    const preflightJobIndex = source.indexOf("preflight:");
    const aggregateJobIndex = source.indexOf("aggregate-build:");
    const preflightInstallIndex = source.indexOf("run: npm ci", preflightJobIndex);
    const aggregateInstallIndex = source.indexOf("run: npm ci", aggregateJobIndex);
    const browserInstallCommand = "npx --no-install playwright install --with-deps chromium";
    const preflightBrowserInstallIndex = source.indexOf(browserInstallCommand, preflightInstallIndex);
    const aggregateBrowserInstallIndex = source.indexOf(browserInstallCommand, aggregateInstallIndex);
    const preflightVerifyIndex = source.indexOf("npm run verify:checks", preflightJobIndex);
    const postRunnerIndex = source.indexOf("npm run verify:post-runner");
    const exactDistIndex = source.indexOf("distributed-verify-dist \\");
    const pagesUploadIndex = source.indexOf(`uses: ${ACTION_PINS.uploadPages}`);
    expect(aggregateIndex).toBeGreaterThan(0);
    expect(occurrences(source, /npx --no-install playwright install --with-deps chromium/g)).toBe(2);
    expect(preflightBrowserInstallIndex).toBeGreaterThan(preflightInstallIndex);
    expect(preflightBrowserInstallIndex).toBeLessThan(preflightVerifyIndex);
    expect(aggregateBrowserInstallIndex).toBeGreaterThan(aggregateInstallIndex);
    expect(aggregateBrowserInstallIndex).toBeLessThan(aggregateIndex);
    expect(postRunnerIndex).toBeGreaterThan(aggregateIndex);
    expect(exactDistIndex).toBeGreaterThan(postRunnerIndex);
    expect(pagesUploadIndex).toBeGreaterThan(exactDistIndex);
    expect(source).toContain(`uses: ${ACTION_PINS.configurePages}`);
    expect(source).toContain(`uses: ${ACTION_PINS.deployPages}`);
  });
});
