import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalReleaseWorkerCount,
  defaultReleaseWorkerCount,
  parseRunnerEvaluatorCliArgument,
  productionBuildEnvironment,
  runPinnedProductionBuild,
  RUNNER_RELEASE_WORKER_LIMIT,
} from "./runner-laboratory-evaluator-cli";
import { parseRunnerDistributedCliArgument } from "./runner-laboratory-distributed-cli";
import { createRunnerEvaluationCapsule } from "./runner-evaluation-capsule";

describe("runner evaluator release worker policy", () => {
  it("isolates production builds from inherited Vite development state", () => {
    for (const inheritedNodeEnvironment of [undefined, "development", "test"]) {
      const inherited = {
        KEEP_ME: "yes",
        ...(inheritedNodeEnvironment === undefined ? {} : { node_env: inheritedNodeEnvironment }),
        Vite_User_Node_Env: "development",
        VITE_UNRECORDED_BUILD_FLAG: "host-dependent",
      };
      const snapshot = structuredClone(inherited);
      const environment = productionBuildEnvironment(inherited);
      expect(environment).toMatchObject({ KEEP_ME: "yes", NODE_ENV: "production" });
      expect(Object.keys(environment).filter((key) => key.toUpperCase() === "NODE_ENV"))
        .toEqual(["NODE_ENV"]);
      expect(Object.keys(environment).some((key) =>
        key.toUpperCase().startsWith("VITE_"))).toBe(false);
      expect(inherited).toEqual(snapshot);
      expect(Object.isFrozen(environment)).toBe(true);
    }
  });

  it("pins the real child Vite build and rejects an unguarded development environment", async () => {
    const root = process.cwd();
    const capsule = await createRunnerEvaluationCapsule(root);
    try {
      const hostileEnvironment = {
        ...productionBuildEnvironment(process.env),
        NODE_ENV: "development",
        VITE_USER_NODE_ENV: "development",
        VITE_UNRECORDED_BUILD_FLAG: "host-dependent",
      };
      const rejected = spawnSync(process.execPath, [
        path.join(root, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--mode",
        "production",
      ], {
        cwd: capsule.capsuleRoot,
        encoding: "utf8",
        env: hostileEnvironment,
        timeout: 30_000,
        windowsHide: true,
      });
      expect(rejected.status).not.toBe(0);
      expect(`${rejected.stdout}${rejected.stderr}`)
        .toMatch(/requires build mode production with DEV=false and PROD=true/);

      const payload = await runPinnedProductionBuild(
        root,
        capsule.capsuleRoot,
        capsule.evaluatedSourceSha256,
        capsule.buildInputsSha256,
        hostileEnvironment,
      );
      const javaScript = payload.files.filter(({ relativePath }) =>
        relativePath.startsWith("assets/index-") && relativePath.endsWith(".js"));
      expect(javaScript).toHaveLength(1);
      expect(javaScript[0]!.bytes.length).toBeLessThanOrEqual(180_000);
      const productionSource = javaScript[0]!.bytes.toString("utf8");
      for (const developmentSentinel of [
        "Runner laboratory saves cannot contain credentials",
        "rolling reachability proof must contain three authentic patterns",
        "runner simulation:",
      ]) expect(productionSource).not.toContain(developmentSentinel);
    } finally {
      await rm(capsule.capsuleRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it("uses available workers from one through four and caps larger hosts", () => {
    expect(RUNNER_RELEASE_WORKER_LIMIT).toBe(4);
    expect(defaultReleaseWorkerCount(1)).toBe(1);
    expect(defaultReleaseWorkerCount(2)).toBe(2);
    expect(defaultReleaseWorkerCount(4)).toBe(4);
    expect(defaultReleaseWorkerCount(8)).toBe(4);
  });

  it("fails safe to one worker for a zero-capacity injected witness", () => {
    expect(defaultReleaseWorkerCount(0)).toBe(1);
    expect(defaultReleaseWorkerCount(Number.NaN)).toBe(1);
    expect(defaultReleaseWorkerCount(Number.POSITIVE_INFINITY)).toBe(1);
    expect(defaultReleaseWorkerCount(3.5)).toBe(1);
  });

  it("caps canonical explicit generate/validate workers at the release limit", () => {
    expect(canonicalReleaseWorkerCount(undefined, 8)).toBe(4);
    expect(canonicalReleaseWorkerCount("1", 8)).toBe(1);
    expect(canonicalReleaseWorkerCount("4", 8)).toBe(4);
    for (const invalid of ["0", "5", "1.5", "NaN", "Infinity"]) {
      expect(() => canonicalReleaseWorkerCount(invalid, 8), invalid)
        .toThrow(/canonical --workers.*1 through 4/);
    }
  });

  it("distinguishes an absent optional flag from malformed or duplicate explicit flags", () => {
    for (const parse of [
      parseRunnerEvaluatorCliArgument,
      parseRunnerDistributedCliArgument,
    ]) {
      expect(parse(["node", "cli"], "--workers", false)).toBeUndefined();
      expect(parse(["node", "cli", "--workers", "4"], "--workers", false)).toBe("4");
      expect(() => parse(["node", "cli", "--workers"], "--workers", false))
        .toThrow(/present without a value/);
      expect(() => parse(
        ["node", "cli", "--workers", "--mode", "validate"],
        "--workers",
        false,
      )).toThrow(/present without a value/);
      expect(() => parse(
        ["node", "cli", "--workers", "2", "--workers", "4"],
        "--workers",
        false,
      )).toThrow(/duplicate/);
    }
  });
});
