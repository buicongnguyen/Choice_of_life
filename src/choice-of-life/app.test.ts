// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { mountChoiceOfLife } from "./app";
import { createRunnerLaboratoryEntryState } from "./core/runner/contract";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  startRunnerLaboratory,
} from "./core/runner/simulation";
import { applyLabSettlement } from "./core/runner/settlement";
import type { RunStateV1 } from "./core/run-state";
import type {
  ChoiceOfLifeShellPort,
  ReadyRun,
  RunnerLaboratoryActionResult,
  RunnerLaboratoryCommitResult,
  RunnerLaboratoryShellPort,
  RunActionResult,
  SettingsActionResult,
  ShellSnapshot,
} from "./presentation/contracts";
import { DEFAULT_SETTINGS, type SetupSelection, type VisualSettings } from "./presentation/model";

const READY_RUN: ReadyRun = {
  runId: "run-0000000000000001",
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  controlMode: "manual",
  scores: { health: 65, happiness: 60, money: 35 },
};

const RUNNER_ENTRY = createRunnerLaboratoryEntryState("0000000000000001", {
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  controlMode: "manual",
  identity: { gender: "female" },
  appearance: {
    heritageStyleId: "asian",
    hairStyleId: "tied-back",
    hairColorId: "dark-brown",
    clothingPaletteId: "meadow",
  },
  accessibility: DEFAULT_SETTINGS,
});

let cachedCompletedRunner: RunStateV1 | null = null;

function completedRunnerState(): RunStateV1 {
  if (cachedCompletedRunner !== null) return cachedCompletedRunner;
  const context = createRunnerSimulationContext(
    RUNNER_ENTRY.runSeed,
    RUNNER_ENTRY.difficulty,
  );
  let state = startRunnerLaboratory(context, RUNNER_ENTRY).state;
  while (state.stage.phase === "active") {
    const result = advanceRunnerLaboratory(context, state);
    if (!result.stateChanged) throw new Error("runner completion fixture stalled");
    state = result.state;
  }
  cachedCompletedRunner = applyLabSettlement(state, null);
  return cachedCompletedRunner;
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  return {
    promise: new Promise<T>((done, fail) => {
      resolve = done;
      reject = fail;
    }),
    resolve,
    reject,
  };
}

class FakeShell implements ChoiceOfLifeShellPort {
  snapshot: ShellSnapshot = { canContinue: false, savedRun: null, settings: DEFAULT_SETTINGS, notice: null };
  readonly listeners = new Set<() => void>();
  readonly startNewLife = vi.fn<(selection: SetupSelection) => RunActionResult | Promise<RunActionResult>>(() => ({ kind: "ready", run: READY_RUN }));
  readonly continueLife = vi.fn<() => RunActionResult | Promise<RunActionResult>>(() => ({ kind: "ready", run: READY_RUN }));
  readonly saveSettings = vi.fn<(settings: VisualSettings) => SettingsActionResult | Promise<SettingsActionResult>>((settings) => ({ kind: "saved", settings }));
  subscribeCount = 0;
  unsubscribeCount = 0;

  getSnapshot(): ShellSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.subscribeCount += 1;
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribeCount += 1;
      this.listeners.delete(listener);
    };
  }

  publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

class FakeRunnerCapability implements RunnerLaboratoryShellPort {
  state: RunStateV1;
  beforeEnter: (() => void) | null = null;
  beforeRestart: (() => void) | null = null;
  beforeSave: (() => void) | null = null;
  readonly enterRunnerLaboratory = vi.fn<() => RunnerLaboratoryActionResult>();
  readonly restartRunnerLaboratory = vi.fn<() => RunnerLaboratoryActionResult>();
  readonly savedStates: RunStateV1[] = [];

  constructor(initialState: RunStateV1 = RUNNER_ENTRY) {
    this.state = initialState;
    this.enterRunnerLaboratory.mockImplementation(() => {
      this.beforeEnter?.();
      return {
        kind: "ready",
        state: this.state,
      };
    });
    this.restartRunnerLaboratory.mockImplementation(() => {
      this.beforeRestart?.();
      if (this.state.runStatus !== "completed") {
        return {
          kind: "invalid",
          notice: { tone: "warning", message: "Finish the current practice first." },
        };
      }
      this.state = createRunnerLaboratoryEntryState(this.state.runSeed, {
        startingProfileId: this.state.startingProfileId,
        difficulty: this.state.difficulty,
        controlMode: this.state.controlMode,
        identity: { ...this.state.identity },
        appearance: { ...this.state.appearance },
        accessibility: { ...this.state.accessibility },
      });
      return { kind: "ready", state: this.state };
    });
  }

  currentRunState(): RunStateV1 {
    return this.state;
  }

  saveRunnerLaboratoryState(state: RunStateV1): RunnerLaboratoryCommitResult {
    this.state = state;
    this.savedStates.push(state);
    this.beforeSave?.();
    return { kind: "saved", state };
  }

  replaceSettings(settings: VisualSettings): void {
    this.state = {
      ...this.state,
      accessibility: { ...settings },
    };
  }
}

function installAnimationFrameHarness(): {
  readonly callbacks: Map<number, FrameRequestCallback>;
  step(now: number): void;
  restore(): void;
} {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  let now = 0;
  const request = vi.spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
  const cancel = vi.spyOn(window, "cancelAnimationFrame")
    .mockImplementation((handle) => {
      callbacks.delete(handle);
    });
  const clock = vi.spyOn(window.performance, "now")
    .mockImplementation(() => now);
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  return {
    callbacks,
    step(nextNow: number): void {
      now = nextNow;
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (next === undefined) throw new Error("Missing animation frame callback");
      callbacks.delete(next[0]);
      next[1](nextNow);
    },
    restore(): void {
      request.mockRestore();
      cancel.mockRestore();
      clock.mockRestore();
      focus.mockRestore();
    },
  };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const match = [...root.querySelectorAll("button")].find((item) =>
    (item.getAttribute("aria-label") ?? item.textContent ?? "").trim() === name);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return match;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return root;
}

describe("Choice of Life DOM application", () => {
  it("renders semantic controls and moves focus to each screen heading", async () => {
    const root = createRoot();
    const shell = new FakeShell();
    const app = mountChoiceOfLife(root, { shell });

    expect(root.querySelector("main[aria-labelledby='choice-life-title']")).not.toBeNull();
    expect(root.querySelector("h1")?.textContent).toBe("Choice of Life");
    expect(button(root, "New life").type).toBe("button");
    button(root, "New life").click();
    const setupHeading = root.querySelector<HTMLElement>("#setup-heading");
    expect(document.activeElement).toBe(setupHeading);
    expect(setupHeading?.tabIndex).toBe(-1);
    expect(root.querySelectorAll("input[type='radio']").length).toBeGreaterThan(0);
    expect(root.querySelectorAll("select").length).toBe(4);

    button(root, "Create this life").click();
    await Promise.resolve();
    expect(shell.startNewLife).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(root.querySelector("#ready-heading"));
    button(root, "Return to title").click();
    expect(document.activeElement).toBe(root.querySelector("#title-actions-heading"));
    app.dispose();
  });

  it("enters the settings dialog and restores its opener on cancel/Escape", () => {
    const root = createRoot();
    const shell = new FakeShell();
    const app = mountChoiceOfLife(root, { shell });
    const opener = button(root, "Settings");
    opener.focus();
    opener.click();
    const dialog = root.querySelector("dialog");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("settings-heading");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.dataset.dialogMode).toBe("fallback");
    expect(root.querySelector(".col-dialog-fallback-backdrop")).not.toBeNull();
    expect(root.querySelector("header")?.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector("section")?.getAttribute("aria-hidden")).toBe("true");

    const first = root.querySelector<HTMLInputElement>("#setting-contrast");
    const last = button(root, "Save settings");
    expect(document.activeElement).toBe(first);
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);

    root.querySelector<HTMLElement>("#choice-life-settings-title")?.focus();
    expect(document.activeElement).toBe(first);
    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector(".col-dialog-fallback-backdrop")).toBeNull();
    expect(root.querySelector("header")?.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(root.querySelector("#choice-life-settings-title"));

    button(root, "Settings").click();
    button(root, "Cancel").click();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-settings-title"));
    app.dispose();
  });

  it("keeps focus anchored for deferred run actions and focuses rejected-action errors", async () => {
    const root = createRoot();
    const shell = new FakeShell();
    const pendingStart = deferred<RunActionResult>();
    shell.startNewLife.mockImplementation(() => pendingStart.promise);
    const app = mountChoiceOfLife(root, { shell });

    button(root, "New life").click();
    const create = button(root, "Create this life");
    create.focus();
    create.click();
    const pendingStatus = root.querySelector<HTMLElement>("#choice-life-pending-status");
    expect(pendingStatus?.textContent).toBe("Creating life…");
    expect(document.activeElement).toBe(pendingStatus);
    expect(root.querySelector("main")?.getAttribute("aria-busy")).toBe("true");

    pendingStart.resolve({ kind: "ready", run: READY_RUN });
    await pendingStart.promise;
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("#ready-heading"));

    button(root, "Return to title").click();
    button(root, "New life").click();
    const rejectedStart = deferred<RunActionResult>();
    shell.startNewLife.mockImplementation(() => rejectedStart.promise);
    button(root, "Create this life").click();
    rejectedStart.reject(new Error("network unavailable"));
    await expect(rejectedStart.promise).rejects.toThrow("network unavailable");
    await Promise.resolve();
    const error = root.querySelector<HTMLElement>("#choice-life-notice");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(error);
    app.dispose();
  });

  it("keeps focus anchored for deferred continue and settings operations", async () => {
    const root = createRoot();
    const shell = new FakeShell();
    shell.snapshot = {
      canContinue: true,
      savedRun: {
        runId: READY_RUN.runId,
        label: "Steady mix",
        startingProfileId: READY_RUN.startingProfileId,
        difficulty: READY_RUN.difficulty,
        controlMode: READY_RUN.controlMode,
      },
      settings: DEFAULT_SETTINGS,
      notice: null,
    };
    const pendingContinue = deferred<RunActionResult>();
    shell.continueLife.mockImplementation(() => pendingContinue.promise);
    const app = mountChoiceOfLife(root, { shell });

    const continueButton = button(root, "Continue life");
    continueButton.focus();
    continueButton.click();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-pending-status"));
    pendingContinue.resolve({ kind: "ready", run: READY_RUN });
    await pendingContinue.promise;
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("#ready-heading"));

    const pendingSettings = deferred<{ kind: "saved"; settings: VisualSettings }>();
    shell.saveSettings.mockImplementation(() => pendingSettings.promise);
    button(root, "Settings").click();
    button(root, "Save settings").click();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-pending-status"));
    pendingSettings.resolve({ kind: "saved", settings: DEFAULT_SETTINGS });
    await pendingSettings.promise;
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-settings-ready"));

    const rejectedSettings = deferred<{ kind: "saved"; settings: VisualSettings }>();
    shell.saveSettings.mockImplementation(() => rejectedSettings.promise);
    button(root, "Settings").click();
    button(root, "Save settings").click();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-pending-status"));
    rejectedSettings.reject(new Error("quota"));
    await expect(rejectedSettings.promise).rejects.toThrow("quota");
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("#choice-life-settings-ready"));
    expect(root.querySelector("#choice-life-notice")?.getAttribute("role")).toBe("alert");
    app.dispose();
  });

  it("honors announcement opt-out and renders exactly the canonical three-score UI", () => {
    const root = createRoot();
    const shell = new FakeShell();
    shell.snapshot = {
      ...shell.snapshot,
      settings: { ...DEFAULT_SETTINGS, screenReaderAnnouncements: false },
    };
    const app = mountChoiceOfLife(root, { shell });

    button(root, "New life").click();
    expect(root.querySelector("[data-profile-description]")?.getAttribute("aria-live")).toBe("off");
    const scoreCards = [...root.querySelectorAll<HTMLElement>("[data-score-id]")];
    expect(scoreCards.map((item) => item.dataset.scoreId)).toEqual(["health", "happiness", "money"]);
    expect([...root.querySelectorAll("output")].map((item) => item.getAttribute("aria-live"))).toEqual([
      "off",
      "off",
      "off",
    ]);
    expect(root.textContent).not.toMatch(/\b(?:Fun|IQ|Weight|mental|muscle|bank)\b/i);

    const physical = root.querySelector<HTMLInputElement>("input[value='physical-head-start-v1']");
    if (!physical) throw new Error("Missing physical starting profile");
    physical.checked = true;
    physical.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector("[data-score-value='health']")?.getAttribute("aria-label")).toBe("Health: 69 out of 100");
    expect(root.querySelector("[data-score-value='health']")?.getAttribute("aria-live")).toBe("off");
    app.dispose();
  });

  it("applies persisted contrast, reduced-motion, and 200% text settings to the shell", () => {
    const root = createRoot();
    const shell = new FakeShell();
    shell.snapshot = {
      ...shell.snapshot,
      settings: {
        highContrast: true,
        reducedMotion: true,
        textScale: 200,
        screenReaderAnnouncements: true,
      },
    };
    const app = mountChoiceOfLife(root, { shell });

    expect(root.dataset.contrast).toBe("high");
    expect(root.dataset.reducedMotion).toBe("true");
    expect(root.style.getPropertyValue("--col-text-scale")).toBe("2");
    button(root, "New life").click();
    expect([...root.querySelectorAll("output")].every((item) => item.getAttribute("aria-live") === "polite")).toBe(true);
    app.dispose();
  });

  it("restores fallback-dialog suppression and removes its focus guard on disposal", () => {
    const root = createRoot();
    const outside = document.createElement("button");
    outside.textContent = "Outside app";
    outside.setAttribute("aria-hidden", "false");
    outside.style.pointerEvents = "auto";
    document.body.append(outside);
    const shell = new FakeShell();
    const app = mountChoiceOfLife(root, { shell });

    button(root, "Settings").click();
    expect(outside.getAttribute("aria-hidden")).toBe("true");
    expect(outside.inert).toBe(true);
    expect(outside.style.pointerEvents).toBe("none");
    app.dispose();

    expect(outside.getAttribute("aria-hidden")).toBe("false");
    expect(outside.inert).toBe(false);
    expect(outside.style.pointerEvents).toBe("auto");
    outside.focus();
    expect(document.activeElement).toBe(outside);
  });

  it("mounts, disposes, and remounts with one live response path", () => {
    const root = createRoot();
    const firstShell = new FakeShell();
    const secondShell = new FakeShell();
    const first = mountChoiceOfLife(root, { shell: firstShell });
    const second = mountChoiceOfLife(root, { shell: secondShell });

    expect(firstShell.subscribeCount).toBe(1);
    expect(firstShell.unsubscribeCount).toBe(1);
    expect(firstShell.listeners.size).toBe(0);
    button(root, "New life").click();
    button(root, "Create this life").click();
    expect(firstShell.startNewLife).not.toHaveBeenCalled();
    expect(secondShell.startNewLife).toHaveBeenCalledTimes(1);

    first.dispose();
    second.dispose();
    second.dispose();
    expect(secondShell.unsubscribeCount).toBe(1);
    expect(secondShell.listeners.size).toBe(0);
    expect(root.childElementCount).toBe(0);
    expect(root.classList.contains("choice-life-root")).toBe(false);
  });

  it("ignores an async completion after disposal", async () => {
    const root = createRoot();
    const shell = new FakeShell();
    const pending = deferred<RunActionResult>();
    shell.startNewLife.mockImplementation(() => pending.promise);
    const app = mountChoiceOfLife(root, { shell });
    button(root, "New life").click();
    button(root, "Create this life").click();
    app.dispose();
    pending.resolve({ kind: "ready", run: READY_RUN });
    await pending.promise;
    await Promise.resolve();
    expect(root.childElementCount).toBe(0);
    expect(shell.unsubscribeCount).toBe(1);
  });

  it("mounts one deterministic runner tree and updates ticks without replacing the root", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    const runner = new FakeRunnerCapability();
    runner.beforeSave = () => shell.publish();
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "New life").click();
      button(root, "Create this life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();

      expect(runner.enterRunnerLaboratory).toHaveBeenCalledOnce();
      const section = root.querySelector<HTMLElement>("[data-runner-view]");
      const status = root.querySelector<HTMLElement>("[data-runner-live-status]");
      const player = root.querySelector<HTMLElement>("[data-runner-player]");
      if (!section || !status || !player) throw new Error("Runner view did not mount");
      expect(player.dataset).toMatchObject({
        bodySet: "feminine",
        artSet: "asian",
        hairShape: "tied-back",
        hairTone: "dark-brown",
        clothingTone: "meadow",
      });
      const replaceChildren = vi.spyOn(root, "replaceChildren");

      button(root, "Start runner").click();
      animation.step(0);
      animation.step(20);

      expect(runner.state.simulationTick).toBe(1);
      expect(root.querySelector("[data-runner-view]")).toBe(section);
      expect(root.querySelector("[data-runner-live-status]")).toBe(status);
      expect(replaceChildren).not.toHaveBeenCalled();
      replaceChildren.mockRestore();

      app.dispose();
      app = null;
      expect(animation.callbacks.size).toBe(0);
      expect(root.childElementCount).toBe(0);
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("persists Escape pause, focuses Resume, and resumes with zero catch-up", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    const runner = new FakeRunnerCapability();
    runner.beforeSave = () => shell.publish();
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "New life").click();
      button(root, "Create this life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();
      button(root, "Start runner").click();
      animation.step(0);
      animation.step(20);
      expect(runner.state.simulationTick).toBe(1);

      const escape = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
        code: "Escape",
      });
      window.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(runner.state.runner?.userPaused).toBe(true);
      const resume = root.querySelector<HTMLButtonElement>(
        "[data-runner-resume='user']",
      );
      expect(resume?.textContent).toBe("Resume");
      expect(document.activeElement).toBe(resume);

      animation.step(2_000);
      expect(runner.state.simulationTick).toBe(1);
      resume?.click();
      animation.step(2_020);
      expect(runner.state.simulationTick).toBe(1);
      animation.step(2_040);
      expect(runner.state.simulationTick).toBe(2);
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("refreshes runner display settings in place without committing gameplay", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    const runner = new FakeRunnerCapability();
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "New life").click();
      button(root, "Create this life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();

      const section = root.querySelector<HTMLElement>("[data-runner-view]");
      if (!section) throw new Error("Runner view did not mount");
      const replaceChildren = vi.spyOn(root, "replaceChildren");
      const saveCount = runner.savedStates.length;
      const tick = runner.state.simulationTick;
      const settings: VisualSettings = {
        highContrast: true,
        reducedMotion: true,
        textScale: 200,
        screenReaderAnnouncements: false,
      };
      shell.snapshot = { ...shell.snapshot, settings };
      runner.replaceSettings(settings);
      shell.publish();

      expect(root.querySelector("[data-runner-view]")).toBe(section);
      expect(section.dataset.contrast).toBe("high");
      expect(section.dataset.motionReduced).toBe("true");
      expect(section.style.getPropertyValue("--col-runner-text-scale")).toBe("2");
      expect(root.dataset.contrast).toBe("high");
      expect(root.dataset.reducedMotion).toBe("true");
      expect(runner.state.simulationTick).toBe(tick);
      expect(runner.savedStates).toHaveLength(saveCount);
      expect(replaceChildren).not.toHaveBeenCalled();
      replaceChildren.mockRestore();
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("rolls back a partial runner mount and releases ownership for a clean retry", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    const otherEntry = createRunnerLaboratoryEntryState("0000000000000002", {
      startingProfileId: "steady-mix-v1",
      difficulty: "normal",
      controlMode: "manual",
      identity: { gender: "female" },
      appearance: { ...RUNNER_ENTRY.appearance },
      accessibility: DEFAULT_SETTINGS,
    });
    const runner = new FakeRunnerCapability(otherEntry);
    runner.enterRunnerLaboratory.mockReturnValue({
      kind: "ready",
      state: RUNNER_ENTRY,
    });
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "New life").click();
      button(root, "Create this life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();

      expect(root.querySelector("[data-runner-view]")).toBeNull();
      expect(root.querySelector("#choice-life-notice")?.getAttribute("role"))
        .toBe("alert");
      expect(root.querySelector("#choice-life-notice")?.textContent).toContain(
        "Your latest runner checkpoint was kept",
      );
      expect(animation.callbacks.size).toBe(0);

      runner.enterRunnerLaboratory.mockImplementation(() => ({
        kind: "ready",
        state: runner.state,
      }));
      button(root, "Open runner laboratory").click();
      expect(root.querySelector("[data-runner-view]")).not.toBeNull();
      expect(animation.callbacks.size).toBe(1);
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("shares one remapping controller and restores W/S after an app remount", async () => {
    const animation = installAnimationFrameHarness();
    const shell = new FakeShell();
    const runner = new FakeRunnerCapability();
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      const firstRoot = createRoot();
      app = mountChoiceOfLife(firstRoot, { shell, runner });
      button(firstRoot, "New life").click();
      button(firstRoot, "Create this life").click();
      await Promise.resolve();
      button(firstRoot, "Open runner laboratory").click();

      const configure = button(firstRoot, "Configure supplemental keys");
      expect(configure.disabled).toBe(false);
      configure.click();
      const dialog = firstRoot.querySelector<HTMLDialogElement>(
        "[data-runner-binding-dialog]",
      );
      if (!dialog) throw new Error("Binding dialog did not mount");
      button(firstRoot, "Change up key").click();
      dialog.dispatchEvent(new KeyboardEvent("keydown", {
        key: "i",
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      }));
      button(firstRoot, "Close").click();
      expect(button(firstRoot, "Move up").getAttribute("aria-keyshortcuts"))
        .toBe("ArrowUp I");
      const firstSurface = firstRoot.querySelector<HTMLElement>(
        "[data-runner-play-surface]",
      );
      expect(firstSurface?.style.getPropertyValue("touch-action")).toBe("pan-x");

      app.dispose();
      app = null;
      expect(firstSurface?.style.getPropertyValue("touch-action")).toBe("");
      expect(animation.callbacks.size).toBe(0);

      const secondRoot = createRoot();
      app = mountChoiceOfLife(secondRoot, { shell, runner });
      button(secondRoot, "New life").click();
      button(secondRoot, "Create this life").click();
      await Promise.resolve();
      button(secondRoot, "Open runner laboratory").click();
      expect(button(secondRoot, "Move up").getAttribute("aria-keyshortcuts"))
        .toBe("ArrowUp W");
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("opens a continued completed run at its recap and returns to the title", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    shell.snapshot = {
      canContinue: true,
      savedRun: {
        runId: READY_RUN.runId,
        label: "Steady mix",
        startingProfileId: READY_RUN.startingProfileId,
        difficulty: READY_RUN.difficulty,
        controlMode: READY_RUN.controlMode,
      },
      settings: DEFAULT_SETTINGS,
      notice: null,
    };
    const runner = new FakeRunnerCapability(completedRunnerState());
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "Continue life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();

      const completion = root.querySelector<HTMLElement>("[data-runner-completion]");
      expect(completion?.hidden).toBe(false);
      expect(root.querySelector("#runner-completion-heading")?.textContent)
        .toBe("Runner laboratory complete");
      expect(document.activeElement).toBe(root.querySelector("#runner-completion-heading"));
      expect(root.querySelector("[data-runner-completion-summary]")?.textContent)
        .toMatch(/Practice scores: Health \d+, Happiness \d+, Financial security \d+\..*do not affect/i);
      expect(animation.callbacks.size).toBe(0);

      button(root, "Return to title").click();
      expect(root.querySelector("[data-runner-view]")).toBeNull();
      expect(document.activeElement).toBe(root.querySelector("#title-actions-heading"));
    } finally {
      app?.dispose();
      animation.restore();
    }
  });

  it("restarts completed practice with a fresh current-session input mount", async () => {
    const animation = installAnimationFrameHarness();
    const root = createRoot();
    const shell = new FakeShell();
    const runner = new FakeRunnerCapability(completedRunnerState());
    runner.beforeEnter = () => shell.publish();
    runner.beforeRestart = () => shell.publish();
    let app: ReturnType<typeof mountChoiceOfLife> | null = null;
    try {
      app = mountChoiceOfLife(root, { shell, runner });
      button(root, "New life").click();
      button(root, "Create this life").click();
      await Promise.resolve();
      button(root, "Open runner laboratory").click();
      const completedSection = root.querySelector("[data-runner-view]");

      button(root, "Practice again").click();

      expect(runner.restartRunnerLaboratory).toHaveBeenCalledOnce();
      expect(root.querySelector("[data-runner-view]")).not.toBe(completedSection);
      expect(root.querySelector<HTMLElement>("[data-runner-entry]")?.hidden).toBe(false);
      expect(document.activeElement).toBe(root.querySelector("#runner-start-button"));
      expect(animation.callbacks.size).toBe(1);
      expect(runner.state.simulationTick).toBe(0);
      expect(runner.state.runner?.userPaused).toBe(true);
    } finally {
      app?.dispose();
      animation.restore();
    }
  });
});
