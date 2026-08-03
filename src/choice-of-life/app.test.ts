// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { mountChoiceOfLife } from "./app";
import type {
  ChoiceOfLifeShellPort,
  ReadyRun,
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
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const match = [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
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
});
