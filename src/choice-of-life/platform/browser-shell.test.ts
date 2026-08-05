import { describe, expect, it } from "vitest";

import { stateHashV1 } from "../core/run-state-hash";
import { decodeRunState } from "../core/run-state-codec";
import { PHASE_1_CATALOG, RUNNER_LABORATORY_CATALOG } from "../core/catalog";
import type { RunStateV1 } from "../core/run-state";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  startRunnerLaboratory,
} from "../core/runner/simulation";
import { applyLabSettlement } from "../core/runner/settlement";
import { ACTIVE_RUN_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "../persistence/save-store";
import type { StoragePort } from "../persistence/storage-port";
import { DEFAULT_SETUP } from "../presentation/model";
import { createBrowserShellPort } from "./browser-shell";

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  failWrites = false;

  getItem(key: string): string | null {
    this.calls.push(`get:${key}`);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.calls.push(`set:${key}`);
    if (this.failWrites) throw new Error("quota");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.calls.push(`remove:${key}`);
    this.values.delete(key);
  }
}

const seed = { nextSeed: () => "000000000000002a" as const };

function finishManualLaboratory(entry: RunStateV1): RunStateV1 {
  const context = createRunnerSimulationContext(entry.runSeed, entry.difficulty);
  let state = startRunnerLaboratory(context, entry).state;
  while (state.simulationTick < 3000) {
    const result = advanceRunnerLaboratory(context, state);
    expect(result.advanced).toBe(true);
    state = result.state;
  }
  return applyLabSettlement(state);
}

describe("browser shell port", () => {
  it("creates, saves, reloads, and resumes the exact deterministic state hash", () => {
    const storage = new MemoryStorage();
    const first = createBrowserShellPort({ storage, seed });
    expect(first.getSnapshot().canContinue).toBe(false);
    expect(first.startNewLife(DEFAULT_SETUP).kind).toBe("ready");
    const firstHash = first.currentStateHash();
    expect(firstHash).toMatch(/^[0-9a-f]{16}$/);

    const encoded = storage.values.get(ACTIVE_RUN_STORAGE_KEY);
    expect(encoded).toBeDefined();
    const decoded = decodeRunState(encoded ?? "", PHASE_1_CATALOG);
    expect(decoded.kind).toBe("ready");
    if (decoded.kind === "ready") expect(stateHashV1(decoded.state)).toBe(firstHash);

    const resumed = createBrowserShellPort({ storage, seed });
    expect(resumed.currentStateHash()).toBe(firstHash);
    expect(resumed.continueLife()).toMatchObject({ kind: "ready" });
    expect(resumed.currentStateHash()).toBe(firstHash);
  });

  it("keeps a new run usable in memory when writes fail", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const shell = createBrowserShellPort({ storage, seed });
    const result = shell.startNewLife(DEFAULT_SETUP);
    expect(result).toMatchObject({ kind: "ready", notice: { tone: "warning" } });
    expect(shell.getSnapshot()).toMatchObject({ canContinue: true, notice: { tone: "warning" } });
  });

  it("quarantines corrupt data and never touches a copied-v5 key", () => {
    const storage = new MemoryStorage();
    storage.values.set(ACTIVE_RUN_STORAGE_KEY, "{bad json");
    storage.values.set("choice-of-life-v1-active-life", "sentinel");
    const shell = createBrowserShellPort({ storage, seed });
    expect(shell.getSnapshot()).toMatchObject({ canContinue: false, notice: { tone: "warning" } });
    expect(storage.values.has(QUARANTINE_STORAGE_KEY)).toBe(true);
    expect(storage.values.get("choice-of-life-v1-active-life")).toBe("sentinel");
    expect(storage.calls.some((call) => call.includes("active-life"))).toBe(false);
  });

  it("stores settings with an active run and publishes one update per mutation", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    let updates = 0;
    const unsubscribe = shell.subscribe(() => { updates += 1; });
    expect(shell.saveSettings({
      highContrast: true,
      reducedMotion: true,
      textScale: 200,
      screenReaderAnnouncements: true,
    })).toMatchObject({ kind: "saved" });
    expect(shell.getSnapshot().settings).toMatchObject({ highContrast: true, textScale: 200 });
    expect(updates).toBe(1);
    unsubscribe();
    shell.saveSettings(shell.getSnapshot().settings);
    expect(updates).toBe(1);
  });

  it("rejects forged runtime settings without changing the active state", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    const beforeHash = shell.currentStateHash();
    const beforeSettings = shell.getSnapshot().settings;
    const result = shell.saveSettings({
      highContrast: true,
      reducedMotion: false,
      textScale: 999,
      screenReaderAnnouncements: false,
    } as never);
    expect(result).toMatchObject({ kind: "invalid", notice: { tone: "warning" } });
    expect(shell.getSnapshot().settings).toEqual(beforeSettings);
    expect(shell.currentStateHash()).toBe(beforeHash);
  });

  it("enters, checkpoints, and reloads the exact immutable runner state", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);

    const entered = shell.enterRunnerLaboratory();
    expect(entered).toMatchObject({
      kind: "ready",
      state: {
        runStatus: "active",
        simulationTick: 0,
        stage: { stageId: "runner-lab-v1", phase: "active" },
        runner: { userPaused: true },
      },
    });
    if (entered.kind !== "ready") throw new Error("runner entry failed");
    expect(Object.isFrozen(entered.state)).toBe(true);
    expect(Object.isFrozen(entered.state.runner)).toBe(true);

    const context = createRunnerSimulationContext(entered.state.runSeed, entered.state.difficulty);
    const started = startRunnerLaboratory(context, entered.state).state;
    expect(shell.saveRunnerLaboratoryState(started)).toMatchObject({ kind: "saved" });

    const persisted = storage.values.get(ACTIVE_RUN_STORAGE_KEY);
    const decoded = decodeRunState(persisted ?? "", RUNNER_LABORATORY_CATALOG);
    expect(decoded.kind).toBe("ready");
    if (decoded.kind === "ready") expect(stateHashV1(decoded.state)).toBe(stateHashV1(started));

    const reloaded = createBrowserShellPort({ storage, seed });
    const continued = reloaded.enterRunnerLaboratory();
    expect(continued.kind).toBe("ready");
    if (continued.kind === "ready") expect(stateHashV1(continued.state)).toBe(stateHashV1(started));
  });

  it("keeps a runner entry playable in memory when checkpoint storage is unavailable", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    const entered = shell.enterRunnerLaboratory();
    expect(entered).toMatchObject({ kind: "ready", notice: { tone: "warning" } });
    expect(shell.currentRunState()?.stage.stageId).toBe("runner-lab-v1");
  });

  it("rejects cross-life runner checkpoints without replacing the active life", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    const entered = shell.enterRunnerLaboratory();
    if (entered.kind !== "ready") throw new Error("runner entry failed");
    const beforeHash = shell.currentStateHash();
    const forged = { ...entered.state, runId: "run-ffffffffffffffff" } as RunStateV1;

    expect(shell.saveRunnerLaboratoryState(forged)).toMatchObject({
      kind: "invalid",
      notice: { tone: "warning" },
    });
    expect(shell.currentStateHash()).toBe(beforeHash);
  });

  it("keeps active runner settings deeply immutable", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    expect(shell.enterRunnerLaboratory().kind).toBe("ready");

    expect(shell.saveSettings({
      highContrast: true,
      reducedMotion: true,
      textScale: 150,
      screenReaderAnnouncements: false,
    })).toMatchObject({ kind: "saved" });
    const current = shell.currentRunState();
    expect(current).not.toBeNull();
    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current?.accessibility)).toBe(true);
  });

  it("restarts only a completed runner laboratory and restores the exact entry projection", () => {
    const storage = new MemoryStorage();
    const shell = createBrowserShellPort({ storage, seed });
    shell.startNewLife(DEFAULT_SETUP);
    const entered = shell.enterRunnerLaboratory();
    if (entered.kind !== "ready") throw new Error("runner entry failed");
    expect(shell.restartRunnerLaboratory()).toMatchObject({ kind: "invalid" });

    const completed = finishManualLaboratory(entered.state);
    expect(shell.saveRunnerLaboratoryState(completed)).toMatchObject({ kind: "saved" });
    const restarted = shell.restartRunnerLaboratory();
    expect(restarted).toMatchObject({
      kind: "ready",
      state: {
        runStatus: "active",
        simulationTick: 0,
        scores: entered.state.scores,
        runner: { userPaused: true, activeEntities: [] },
      },
    });
    if (restarted.kind === "ready") {
      expect(restarted.state.runId).toBe(entered.state.runId);
      expect(restarted.state.stage.settlement).toBeNull();
      expect(restarted.state.storyState.facts).toEqual([]);
    }
  });
});
