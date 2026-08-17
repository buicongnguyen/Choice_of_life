/**
 * Bundle ratchet gate.
 *
 * `check-bundle-budget.mjs` enforces the §13 release targets and currently fails
 * outright: the production build ships ~98 MiB against a 20 MiB target, and the
 * Phase 1 profile forbids PNG output entirely while the game now ships PNG
 * atlases. Gating deployment on that check would block every release; deleting
 * the check would hide the regression. Neither is acceptable.
 *
 * This gate takes the middle path the upgrade plan asks for (§13, §14 Phase 1,
 * §0 L5/L9): a recorded Phase 0 baseline that a build may match or improve on,
 * but never exceed. It fails on regression, reports the remaining distance to
 * each §13 target, and never silently passes a build that got worse.
 *
 * Replace this with the real budget once Phase 1 amends the profile and the
 * per-stage atlas work brings the measurements under target.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { auditBundleBudget, PHASE_1_BUDGET_PROFILE } from "./bundle-budget.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE_PATH = path.join(ROOT, "scripts", "bundle-baseline.json");

/** Measurements the ratchet tracks, with their §13 release targets. */
export const RATCHET_TARGETS = Object.freeze({
  totalBytes: 20_000_000,
  mainEntryJsBytes: 500_000,
  cssBytes: 200_000,
  criticalGzipBytes: 350_000,
  criticalBrotliBytes: 350_000,
  pngBytes: 0,
  pngFiles: 0,
});

export function comparisonRows(measured, baseline) {
  return Object.keys(RATCHET_TARGETS).map((key) => {
    const now = measured[key] ?? 0;
    const was = baseline.measurements[key] ?? 0;
    return {
      key,
      now,
      baseline: was,
      target: RATCHET_TARGETS[key],
      delta: now - was,
      regressed: now > was,
      meetsTarget: now <= RATCHET_TARGETS[key],
    };
  });
}

export async function measureDist(distDir) {
  const report = await auditBundleBudget({
    distDir,
    profile: PHASE_1_BUDGET_PROFILE,
  });
  // The profile bans PNG outright, so PNG weight never reaches `measurements`.
  // Recover it from the failure list, which names every offending file.
  const pngNames = report.failures
    .map((failure) => /^PNG output is forbidden in Phase 1: (.+)$/.exec(failure))
    .filter((match) => match !== null)
    .map((match) => match[1]);
  const pngSizes = await Promise.all(
    pngNames.map(async (name) => (await stat(path.join(distDir, name))).size),
  );
  return {
    totalBytes: report.totalBytes,
    mainEntryJsBytes: report.mainEntryJsBytes,
    cssBytes: report.cssBytes,
    criticalGzipBytes: report.criticalGzipBytes,
    criticalBrotliBytes: report.criticalBrotliBytes,
    pngFiles: pngNames.length,
    pngBytes: pngSizes.reduce((total, size) => total + size, 0),
  };
}

function formatRow(row) {
  const direction = row.delta === 0 ? "=" : row.delta > 0 ? "+" : "-";
  const status = row.meetsTarget
    ? "at target"
    : row.regressed
    ? "REGRESSED"
    : "over target";
  return `  ${row.key.padEnd(20)} ${String(row.now).padStart(10)}  ` +
    `(baseline ${row.baseline}, ${direction}${Math.abs(row.delta)}, ` +
    `target ${row.target}) ${status}`;
}

export async function runRatchet({ distDir, baselinePath } = {}) {
  const baseline = JSON.parse(
    await readFile(baselinePath ?? BASELINE_PATH, "utf8"),
  );
  const measured = await measureDist(distDir ?? path.join(ROOT, "dist"));
  const rows = comparisonRows(measured, baseline);
  const regressions = rows.filter((row) => row.regressed);
  const outstanding = rows.filter((row) => !row.meetsTarget);
  return { baseline, measured, rows, regressions, outstanding };
}

if (import.meta.filename === process.argv[1]) {
  const result = await runRatchet();
  console.log(`Bundle ratchet against baseline ${result.baseline.recordedAt}`);
  for (const row of result.rows) console.log(formatRow(row));
  if (result.outstanding.length > 0) {
    console.log(
      `\n${result.outstanding.length} measurement(s) still exceed the §13 target. ` +
        `These are accepted Phase 0 debt and are tracked, not hidden.`,
    );
  }
  if (result.regressions.length > 0) {
    throw new Error(
      `Bundle ratchet failed; these got worse than the recorded baseline: ${
        result.regressions
          .map((row) => `${row.key} ${row.baseline} -> ${row.now}`)
          .join("; ")
      }`,
    );
  }
  console.log("\nNo measurement regressed against the baseline.");
}
