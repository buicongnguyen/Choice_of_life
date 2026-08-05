// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import type { RunStateV1 } from "../core/run-state";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "../core/runner/contract";
import { applyLabSettlement } from "../core/runner/settlement";
import {
  advanceRunnerLaboratory,
  chooseLane,
  createRunnerSimulationContext,
  startRunnerLaboratory,
  type RunnerSimulationContext,
  type RunnerSimulationResult,
} from "../core/runner/simulation";
import type { RunnerSession } from "../platform/runner-session";
import { createRunnerKeyboardBindings } from "../platform/runner-input";
import type { RunnerInputDomAdapter } from "../platform/runner-input-dom";
import {
  mountRunnerView,
  type RunnerView,
  type RunnerViewBindingController,
  type RunnerViewCharacterToken,
  type RunnerViewSessionPort,
  type RunnerViewSessionSnapshot,
  type RunnerViewVisualOptions,
} from "./runner-view";

const runnerCss = readFileSync("src/choice-of-life/style.css", "utf8");
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);
const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "innerWidth",
);

const RUN_SEED = "0000000000000001";
const CHARACTER: RunnerViewCharacterToken = Object.freeze({
  bodySet: "feminine",
  artSet: "asian",
  hairShape: "short-soft",
  hairTone: "black",
  clothingTone: "sunrise",
});
const VISUALS: RunnerViewVisualOptions = Object.freeze({
  contrastMode: "standard",
  motionReduced: false,
  textScaleMultiplier: 1,
  announceOptional: true,
});

function setup(controlMode: RunStateV1["controlMode"]) {
  return Object.freeze({
    startingProfileId: "steady-mix-v1" as const,
    difficulty: "normal" as const,
    controlMode,
    identity: Object.freeze({ gender: "female" as const }),
    appearance: Object.freeze({
      heritageStyleId: "asian" as const,
      hairStyleId: "short-soft" as const,
      hairColorId: "black" as const,
      clothingPaletteId: "sunrise" as const,
    }),
    accessibility: Object.freeze({
      highContrast: false,
      reducedMotion: false,
      textScale: 100 as const,
      screenReaderAnnouncements: true,
    }),
  });
}

function run(
  controlMode: RunStateV1["controlMode"] = "manual",
): {
  readonly context: RunnerSimulationContext;
  readonly entry: RunStateV1;
  readonly started: RunStateV1;
  readonly startResult: RunnerSimulationResult;
} {
  const context = createRunnerSimulationContext(RUN_SEED, "normal");
  const entry = createRunnerLaboratoryEntryState(
    RUN_SEED,
    setup(controlMode),
  );
  const startResult = startRunnerLaboratory(context, entry);
  return { context, entry, started: startResult.state, startResult };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function occurrenceCount(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

interface SnapshotOptions {
  readonly started?: boolean;
  readonly status?: RunnerViewSessionSnapshot["status"];
  readonly pauseReasons?: RunnerViewSessionSnapshot["pauseReasons"];
  readonly events?: RunnerViewSessionSnapshot["events"];
  readonly notice?: RunnerViewSessionSnapshot["notice"];
}

function snapshot(
  state: RunStateV1,
  options: SnapshotOptions = {},
): RunnerViewSessionSnapshot {
  const complete = state.runStatus === "completed" ||
    state.stage.phase === "complete";
  return deepFreeze({
    state,
    status: options.status ?? (complete ? "completed" : "running"),
    started: options.started ?? true,
    queuedLaneIntent: null,
    pauseReasons: options.pauseReasons ?? [],
    events: options.events ?? [],
    notice: options.notice ?? null,
    droppedLogicalSteps: 0,
  });
}

class FakeSession implements RunnerViewSessionPort {
  readonly listeners = new Set<(
    snapshot: RunnerViewSessionSnapshot,
  ) => void>();
  startCalls = 0;
  chooseCalls: number[] = [];
  pauseCalls: boolean[] = [];
  modalCalls: boolean[] = [];
  presentationFaultCalls: string[] = [];
  allowModalTransition = true;
  modalTransitionHook: ((active: boolean) => boolean) | null = null;
  resumeCalls: string[] = [];
  unsubscribeCalls = 0;
  onStart: (() => RunnerViewSessionSnapshot | null) | null = null;
  onChoose: ((lane: 0 | 1 | 2) => RunnerViewSessionSnapshot | null) | null = null;
  current: RunnerViewSessionSnapshot;

  constructor(initial: RunnerViewSessionSnapshot) {
    this.current = initial;
  }

  getSnapshot(): RunnerViewSessionSnapshot {
    return this.current;
  }

  subscribe(listener: (next: RunnerViewSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribeCalls += 1;
      this.listeners.delete(listener);
    };
  }

  emit(next: RunnerViewSessionSnapshot): void {
    this.current = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  start(): boolean {
    this.startCalls += 1;
    const next = this.onStart?.() ?? null;
    if (next === null) return false;
    this.emit(next);
    return true;
  }

  chooseLane(lane: 0 | 1 | 2): boolean {
    this.chooseCalls.push(lane);
    const next = this.onChoose?.(lane) ?? null;
    if (next === null) return false;
    this.emit(next);
    return true;
  }

  setUserPaused(active: boolean): boolean {
    this.pauseCalls.push(active);
    const runner = this.current.state.runner;
    if (runner === null || runner.userPaused === active) return false;
    const state = deepFreeze({
      ...this.current.state,
      runner: { ...runner, userPaused: active },
    });
    const pauseReasons = active
      ? [...this.current.pauseReasons.filter((reason) => reason !== "user"), "user" as const]
      : this.current.pauseReasons.filter((reason) => reason !== "user");
    this.emit(snapshot(state, {
      status: pauseReasons.length === 0 ? "running" : "paused",
      pauseReasons,
      events: [{ type: "user-pause-changed", active }],
    }));
    return true;
  }

  setModalOpen(active: boolean): boolean {
    this.modalCalls.push(active);
    if (!(this.modalTransitionHook?.(active) ?? this.allowModalTransition)) {
      return false;
    }
    const hasModal = this.current.pauseReasons.includes("modal");
    if (hasModal === active) return true;
    const pauseReasons = active
      ? [...this.current.pauseReasons, "modal" as const]
      : this.current.pauseReasons.filter((reason) => reason !== "modal");
    this.emit(snapshot(this.current.state, {
      status: pauseReasons.length === 0 ? "running" : "paused",
      pauseReasons,
      events: [{ type: "runtime-pause-changed", pauseReasons }],
      notice: this.current.notice,
    }));
    return true;
  }

  reportPresentationFault(message: string): boolean {
    this.presentationFaultCalls.push(message);
    if (this.current.status === "faulted" || this.current.status === "disposed") {
      return false;
    }
    this.emit(snapshot(this.current.state, {
      status: "faulted",
      pauseReasons: this.current.pauseReasons,
      events: [],
      notice: { tone: "error", message },
    }));
    return true;
  }

  resumeInterruption(reason: "visibility" | "focus-interruption"): boolean {
    this.resumeCalls.push(reason);
    if (!this.current.pauseReasons.includes(reason)) return false;
    const pauseReasons = this.current.pauseReasons.filter((item) => item !== reason);
    this.emit(snapshot(this.current.state, {
      started: this.current.started,
      status: pauseReasons.length === 0
        ? (this.current.started ? "running" : "awaiting-start")
        : "paused",
      pauseReasons,
      events: [{ type: "runtime-pause-changed", pauseReasons }],
    }));
    return true;
  }
}

function compatiblePort(session: RunnerSession): RunnerViewSessionPort {
  return session;
}
void compatiblePort;

function compatibleBindingController(
  adapter: RunnerInputDomAdapter,
): RunnerViewBindingController {
  return adapter;
}
void compatibleBindingController;

function createBindingController(): RunnerViewBindingController {
  const bindings = createRunnerKeyboardBindings();
  const controller: RunnerViewBindingController = {
    snapshot: () => bindings.snapshot(),
    remap: (command: "lane-up" | "lane-down", key) =>
      bindings.remap(command, key),
    resetBindings: () => bindings.reset(),
  };
  return Object.freeze(controller);
}

function createMotionPreference(initialMatches: boolean): Readonly<{
  query: MediaQueryList;
  setMatches(matches: boolean): void;
}> {
  const target = new EventTarget();
  let matches = initialMatches;
  Object.defineProperties(target, {
    matches: { configurable: true, get: () => matches },
    media: {
      configurable: true,
      value: "(prefers-reduced-motion: reduce)",
    },
    onchange: { configurable: true, writable: true, value: null },
  });
  return Object.freeze({
    query: target as MediaQueryList,
    setMatches(next: boolean): void {
      matches = next;
      target.dispatchEvent(new Event("change"));
    },
  });
}

const views: RunnerView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.useRealTimers();
  if (originalMatchMediaDescriptor === undefined) {
    Reflect.deleteProperty(window, "matchMedia");
  } else {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
  }
  if (originalInnerWidthDescriptor !== undefined) {
    Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
  }
});

function mount(
  session: FakeSession,
  context: RunnerSimulationContext,
  overrides: Partial<{
    characterToken: RunnerViewCharacterToken;
    visualOptions: RunnerViewVisualOptions;
    onPracticeAgain: () => void;
    onReturnToTitle: () => void;
  }> = {},
): { readonly root: HTMLElement; readonly view: RunnerView } {
  const root = document.createElement("main");
  root.className = "choice-life-root";
  document.body.append(root);
  const view = mountRunnerView({
    dom: document,
    root,
    session,
    course: context.course,
    characterToken: overrides.characterToken ?? CHARACTER,
    visualOptions: overrides.visualOptions ?? VISUALS,
    onPracticeAgain: overrides.onPracticeAgain ?? (() => undefined),
    onReturnToTitle: overrides.onReturnToTitle ?? (() => undefined),
  });
  views.push(view);
  return { root, view };
}

function semanticCheckpoint(): {
  readonly context: RunnerSimulationContext;
  readonly state: RunStateV1;
} {
  const base = run("semantic-assist");
  let state = base.started;
  while (state.runner?.spawn.patternIndex === 0) {
    const result = advanceRunnerLaboratory(base.context, state);
    if (!result.stateChanged) throw new Error("Semantic checkpoint stalled");
    state = result.state;
  }
  return { context: base.context, state };
}

function completedManualRun(): {
  readonly context: RunnerSimulationContext;
  readonly state: RunStateV1;
} {
  const base = run("manual");
  let state = base.started;
  while (state.stage.phase === "active") {
    const result = advanceRunnerLaboratory(base.context, state);
    if (!result.stateChanged) throw new Error("Manual completion stalled");
    state = result.state;
  }
  return { context: base.context, state: applyLabSettlement(state, null) };
}

describe("long-lived runner view", () => {
  it("creates the persistent semantic structure, starts natively, and exposes input plumbing", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.entry, {
      started: false,
      status: "awaiting-start",
    }));
    session.onStart = () => snapshot(base.started, {
      events: base.startResult.events,
    });
    const { root, view } = mount(session, base.context);
    const section = view.section;
    const status = section.querySelector<HTMLElement>("[data-runner-live-status]")!;
    const alert = section.querySelector<HTMLElement>("[data-runner-live-alert]")!;
    const nonLive = section.querySelector<HTMLElement>(
      "[data-runner-nonlive-status]",
    )!;
    const bindingFeedback = section.querySelector<HTMLElement>(
      "[data-runner-binding-feedback]",
    )!;
    const bindingError = section.querySelector<HTMLElement>(
      "[data-runner-binding-error]",
    )!;

    expect(section.tagName).toBe("SECTION");
    expect(section.getAttribute("aria-labelledby")).toBe("runner-status-heading");
    const statusHeading = section.querySelector<HTMLElement>("#runner-status-heading")!;
    expect(statusHeading.getAttribute("tabindex")).toBe("-1");
    expect(statusHeading.tabIndex).toBe(-1);
    expect(section.querySelector("[data-runner-orientation]")?.textContent)
      .toContain("right to left");
    expect(document.activeElement?.id).toBe("runner-start-button");
    expect(section.querySelectorAll("dl dt")).toHaveLength(4);
    expect(section.querySelectorAll("dl dd")).toHaveLength(4);
    expect(section.querySelector("progress")?.getAttribute("data-runner-progress"))
      .not.toBeNull();
    expect(section.querySelector<HTMLLabelElement>(".col-runner-progress label")?.htmlFor)
      .toBe("runner-laboratory-progress");
    expect(section.querySelector(".col-runner-scores")?.getAttribute("role"))
      .toBe("group");
    expect(section.querySelectorAll("output")).toHaveLength(3);
    expect([...section.querySelectorAll("output")].map((item) => item.textContent))
      .toEqual(["65", "60", "35"]);
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(section.querySelectorAll("[role='status'], [role='alert']"))
      .toHaveLength(2);
    expect(section.querySelectorAll("[aria-live='polite'], [aria-live='assertive']"))
      .toHaveLength(2);
    expect(nonLive.getAttribute("aria-live")).toBe("off");
    expect(nonLive.getAttribute("tabindex")).toBe("0");
    expect(nonLive.tabIndex).toBe(0);
    expect(nonLive.textContent).toContain("Source lane:");
    for (const dialogMessage of [bindingFeedback, bindingError]) {
      expect(dialogMessage.hasAttribute("role")).toBe(false);
      expect(dialogMessage.hasAttribute("aria-live")).toBe(false);
      expect(dialogMessage.hasAttribute("aria-atomic")).toBe(false);
    }
    expect(view.playSurface.getAttribute("aria-hidden")).toBe("true");
    expect(view.playSurface.querySelectorAll("button, [tabindex]")).toHaveLength(0);
    expect(view.getInputGateSnapshot().started).toBe(false);
    expect(view.laneUpButton.textContent).toBe("Up");
    expect(view.laneUpButton.getAttribute("aria-label")).toBe("Move up");
    expect(view.laneDownButton.textContent).toBe("Down");
    expect(view.laneDownButton.getAttribute("aria-label")).toBe("Move down");

    view.updateBindings({
      instructions: { "lane-up": "Up arrow or I", "lane-down": "Down arrow or K" },
      ariaKeyshortcuts: { "lane-up": "ArrowUp I", "lane-down": "ArrowDown K" },
    });
    expect(view.laneUpButton.getAttribute("aria-keyshortcuts")).toBe("ArrowUp I");
    expect(section.querySelector("[data-runner-binding-instructions]")?.textContent)
      .toContain("Up arrow or I");
    view.updateVisualOptions({
      contrastMode: "high",
      motionReduced: true,
      textScaleMultiplier: 2,
      announceOptional: false,
    });
    expect(section.dataset.contrast).toBe("high");
    expect(section.dataset.motionReduced).toBe("true");
    expect(section.getAttribute("data-text-scale")).toBe("2");
    expect(section.style.getPropertyValue("--col-runner-text-scale")).toBe("2");

    const start = section.querySelector<HTMLButtonElement>("#runner-start-button")!;
    start.click();
    expect(session.startCalls).toBe(1);
    expect(root.firstElementChild).toBe(section);
    expect(view.section).toBe(section);
    expect(section.querySelector("[data-runner-live-status]")).toBe(status);
    expect(section.querySelector("[data-runner-live-alert]")).toBe(alert);
    expect(document.activeElement?.id).toBe("runner-user-pause-button");
    expect(view.getInputGateSnapshot()).toMatchObject({
      started: true,
      controlMode: "manual",
      pauseReasons: [],
      dialogOpen: false,
      runStatus: "active",
      stagePhase: "active",
    });
    const placement = section.querySelector<HTMLButtonElement>(
      "[data-runner-control-placement]",
    )!;
    const cluster = section.querySelector<HTMLElement>(
      "[data-runner-control-cluster]",
    )!;
    expect(cluster.dataset.runnerControlCluster).toBe("right");
    expect(placement.textContent).toContain("left side");
    placement.click();
    expect(cluster.dataset.runnerControlCluster).toBe("left");
    expect(cluster.classList.contains("col-runner-controls--left")).toBe(true);
    expect(section.classList.contains("col-runner-view--controls-left")).toBe(true);
    expect(placement.textContent).toContain("right side");
  });

  it("focuses without preventScroll and deterministically reveals managed targets at 200% text", () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      const base = run("manual");
      const session = new FakeSession(snapshot(base.entry, {
        started: false,
        status: "awaiting-start",
      }));
      session.onStart = () => snapshot(base.started, {
        events: base.startResult.events,
      });
      const { view } = mount(session, base.context, {
        visualOptions: {
          ...VISUALS,
          motionReduced: true,
          textScaleMultiplier: 2,
        },
      });

      expect(focus.mock.calls.length).toBeGreaterThan(0);
      expect(focus.mock.calls.every((parameters) => parameters.length === 0))
        .toBe(true);
      expect(scrollIntoView).toHaveBeenLastCalledWith({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      expect(scrollIntoView.mock.instances.at(-1)).toBe(
        view.section.querySelector("#runner-start-button"),
      );

      scrollIntoView.mockClear();
      view.section.querySelector<HTMLButtonElement>("#runner-start-button")?.click();
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      expect(scrollIntoView.mock.instances[0]).toBe(
        view.section.querySelector("#runner-user-pause-button"),
      );
    } finally {
      focus.mockRestore();
      if (originalScrollIntoView === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          originalScrollIntoView,
        );
      }
    }
  });

  it("reasserts persistent runner focus after native activation and Escape timing", async () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.entry, {
      started: false,
      status: "awaiting-start",
    }));
    session.onStart = () => snapshot(base.started, {
      events: base.startResult.events,
    });
    const { view } = mount(session, base.context, {
      visualOptions: {
        ...VISUALS,
        textScaleMultiplier: 2,
      },
    });
    const start = view.section.querySelector<HTMLButtonElement>(
      "#runner-start-button",
    )!;
    const pause = view.section.querySelector<HTMLButtonElement>(
      "#runner-user-pause-button",
    )!;
    document.body.tabIndex = -1;
    try {
      await Promise.resolve();
      start.click();
      document.body.focus();
      expect(document.activeElement).toBe(document.body);
      await Promise.resolve();
      expect(document.activeElement).toBe(pause);

      expect(session.setUserPaused(true)).toBe(true);
      document.body.focus();
      expect(document.activeElement).toBe(document.body);
      await Promise.resolve();
      expect(document.activeElement).toBe(pause);
      expect(pause.textContent).toBe("Resume");
    } finally {
      document.body.removeAttribute("tabindex");
    }
  });

  it("updates keyed visuals without replacing roots and throttles ordinary progress", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const { root, view } = mount(session, base.context);
    const section = view.section;
    const status = section.querySelector<HTMLElement>("[data-runner-live-status]")!;
    const progress = section.querySelector<HTMLProgressElement>("progress")!;
    const player = section.querySelector<HTMLElement>("[data-runner-player]")!;
    const initialStatus = status.textContent;
    let state = base.started;
    let result: RunnerSimulationResult | null = null;

    for (let tick = 1; tick <= 49; tick += 1) {
      result = advanceRunnerLaboratory(base.context, state);
      state = result.state;
    }
    session.emit(snapshot(state, { events: result!.events }));
    expect(progress.value).toBe(0);
    expect(status.textContent).toBe(initialStatus);

    result = advanceRunnerLaboratory(base.context, state);
    state = result.state;
    session.emit(snapshot(state, { events: result.events }));
    expect(progress.value).toBe(50);
    expect(status.textContent).toBe(initialStatus);

    result = advanceRunnerLaboratory(base.context, state, { laneIntent: "up" });
    state = result.state;
    session.emit(snapshot(state, { events: result.events }));
    expect(progress.value).toBe(51);
    expect(section.querySelector("[data-runner-player]")).toBe(player);
    expect(section.querySelector("[data-runner-summary='motion']")?.textContent)
      .toContain("Moving");

    while (state.runner?.activeEntities.length === 0) {
      result = advanceRunnerLaboratory(base.context, state);
      if (!result.stateChanged) throw new Error("Entity spawn stalled");
      state = result.state;
    }
    session.emit(snapshot(state, { events: result!.events }));
    const entityId = state.runner!.activeEntities[0]!.instanceId;
    const entity = section.querySelector<HTMLElement>(
      `[data-runner-entity-id='${entityId}']`,
    )!;
    result = advanceRunnerLaboratory(base.context, state);
    state = result.state;
    session.emit(snapshot(state, { events: result.events }));
    expect(section.querySelector(`[data-runner-entity-id='${entityId}']`))
      .toBe(entity);
    expect(root.firstElementChild).toBe(section);
    expect(section.querySelector("[data-runner-live-status]")).toBe(status);
    expect(section.querySelectorAll("output")).toHaveLength(3);
  });

  it("updates the focusable non-live summary only at warning and motion boundaries without lane chatter", () => {
    const base = run("manual");
    let state = base.started;
    while (state.runner?.spawn.patternIndex === 0) {
      const result = advanceRunnerLaboratory(base.context, state);
      if (!result.stateChanged) throw new Error("Warning boundary stalled");
      state = result.state;
    }
    const session = new FakeSession(snapshot(state));
    const { view } = mount(session, base.context, {
      visualOptions: {
        ...VISUALS,
        motionReduced: true,
        announceOptional: false,
      },
    });
    const nonLive = view.section.querySelector<HTMLElement>(
      "[data-runner-nonlive-status]",
    )!;
    const liveStatus = view.section.querySelector<HTMLElement>(
      "[data-runner-live-status]",
    )!;
    const observer = new window.MutationObserver(() => undefined);
    observer.observe(nonLive, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    expect(nonLive.textContent).toContain(
      "Source lane: Middle lane. Target lane: Middle lane. State: idle.",
    );
    expect(nonLive.textContent).toContain("Warning group:");
    expect(nonLive.textContent).toContain("Urgency:");
    const initialSummary = nonLive.textContent;
    const initialLiveStatus = liveStatus.textContent;

    const ordinaryTick = advanceRunnerLaboratory(base.context, state);
    state = ordinaryTick.state;
    session.emit(snapshot(state, { events: ordinaryTick.events }));
    expect(nonLive.textContent).toBe(initialSummary);
    expect(observer.takeRecords()).toHaveLength(0);

    const movementStart = advanceRunnerLaboratory(base.context, state, {
      laneIntent: "up",
    });
    state = movementStart.state;
    expect(movementStart.events.every((event) =>
      event.type === "clock-advanced" || event.type === "lane-stepped"))
      .toBe(true);
    session.emit(snapshot(state, { events: movementStart.events }));
    expect(nonLive.textContent).toContain(
      "Source lane: Middle lane. Target lane: Top lane. State: moving.",
    );
    expect(observer.takeRecords()).toHaveLength(1);
    expect(liveStatus.textContent).toBe(initialLiveStatus);

    const movingTick = advanceRunnerLaboratory(base.context, state);
    state = movingTick.state;
    const movingSummary = nonLive.textContent;
    session.emit(snapshot(state, { events: movingTick.events }));
    expect(nonLive.textContent).toBe(movingSummary);
    expect(observer.takeRecords()).toHaveLength(0);
    expect(liveStatus.textContent).toBe(initialLiveStatus);

    let arrival: RunnerSimulationResult | null = null;
    while (state.runner?.motion.kind !== "idle") {
      arrival = advanceRunnerLaboratory(base.context, state);
      if (!arrival.stateChanged) throw new Error("Lane arrival stalled");
      state = arrival.state;
    }
    session.emit(snapshot(state, { events: arrival?.events ?? [] }));
    expect(nonLive.textContent).toContain(
      "Source lane: Top lane. Target lane: Top lane. State: idle.",
    );
    expect(observer.takeRecords()).toHaveLength(1);
    expect(liveStatus.textContent).toBe(initialLiveStatus);
    observer.disconnect();
  });

  it("uses one warning aggregate for visual labels and stable Semantic choices", () => {
    const checkpoint = semanticCheckpoint();
    const session = new FakeSession(snapshot(checkpoint.state, {
      status: "paused",
      pauseReasons: ["semantic"],
    }));
    session.onChoose = (lane) => {
      const result = chooseLane(checkpoint.context, session.current.state, lane);
      return result.stateChanged
        ? snapshot(result.state, { events: result.events })
        : null;
    };
    const { view } = mount(session, checkpoint.context);
    const fieldset = view.section.querySelector<HTMLFieldSetElement>(
      "fieldset[data-runner-semantic]",
    )!;
    const choices = [...fieldset.querySelectorAll<HTMLButtonElement>(
      "[data-runner-semantic-lane]",
    )];
    const warnings = [...view.section.querySelectorAll<HTMLElement>(
      "[data-runner-warning-lane]",
    )];

    expect(fieldset.hidden).toBe(false);
    expect(fieldset.querySelector("legend")?.textContent).toContain("untimed");
    expect(choices).toHaveLength(3);
    expect(choices.every((choice) => !choice.disabled)).toBe(true);
    expect(warnings.map((warning) => warning.dataset.warningLabel))
      .toEqual(choices.map((choice) => choice.getAttribute("aria-label")));
    expect(document.activeElement).toBe(choices[0]);

    const firstChoice = choices[0]!;
    session.emit(snapshot(checkpoint.state, {
      status: "paused",
      pauseReasons: ["semantic"],
      events: [{
        type: "presentation-state-refreshed",
        simulationTick: checkpoint.state.simulationTick,
      }],
    }));
    expect(fieldset.querySelector("[data-runner-semantic-lane='0']"))
      .toBe(firstChoice);
    expect(document.activeElement).toBe(firstChoice);

    firstChoice.click();
    expect(session.chooseCalls).toEqual([0]);
    expect(fieldset.hidden).toBe(true);
    expect(document.activeElement?.id).toBe("runner-status-heading");
  });

  it("removes stale entry and Semantic controls from every session fault", () => {
    const checkpoint = semanticCheckpoint();
    const semanticSession = new FakeSession(snapshot(checkpoint.state, {
      status: "paused",
      pauseReasons: ["semantic"],
    }));
    const semanticMount = mount(semanticSession, checkpoint.context);
    const fieldset = semanticMount.view.section.querySelector<HTMLFieldSetElement>(
      "fieldset[data-runner-semantic]",
    )!;
    const choices = [...fieldset.querySelectorAll<HTMLButtonElement>(
      "[data-runner-semantic-lane]",
    )];
    expect(fieldset.hidden).toBe(false);
    expect(choices.every((choice) => !choice.disabled)).toBe(true);

    semanticSession.emit(snapshot(checkpoint.state, {
      status: "faulted",
      pauseReasons: ["semantic"],
      notice: { tone: "error", message: "Semantic runner recovery is required." },
    }));
    expect(fieldset.hidden).toBe(true);
    expect(choices.every((choice) => choice.disabled)).toBe(true);
    expect(semanticMount.view.getInputGateSnapshot().started).toBe(false);
    expect(document.activeElement).toBe(semanticMount.view.section.querySelector(
      "[data-runner-fault-return-title]",
    ));

    const manual = run("manual");
    const entrySession = new FakeSession(snapshot(manual.entry, {
      started: false,
      status: "faulted",
      notice: { tone: "error", message: "Entry recovery is required." },
    }));
    const entryMount = mount(entrySession, manual.context);
    expect(entryMount.view.section.querySelector<HTMLElement>("[data-runner-entry]")?.hidden)
      .toBe(true);
    expect(entryMount.view.section.querySelector<HTMLButtonElement>("#runner-start-button")?.disabled)
      .toBe(true);
    expect(entryMount.view.getInputGateSnapshot().started).toBe(false);
    expect(document.activeElement).toBe(entryMount.view.section.querySelector(
      "[data-runner-fault-return-title]",
    ));
  });

  it("keeps user and sticky interruption resumes distinct with return-time focus", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const { view } = mount(session, base.context);
    const pause = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-user-pause]",
    )!;
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const focus = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='focus-interruption']",
    )!;

    pause.click();
    expect(session.pauseCalls).toEqual([true]);
    expect(pause.textContent).toBe("Resume");
    expect(pause.getAttribute("data-runner-resume")).toBe("user");
    expect(document.activeElement).toBe(pause);
    pause.click();
    expect(session.pauseCalls).toEqual([true, false]);
    expect(pause.textContent).toBe("Pause");
    expect(pause.hasAttribute("data-runner-resume")).toBe(false);

    session.emit(snapshot(session.current.state, {
      status: "paused",
      pauseReasons: ["visibility"],
      events: [{ type: "runtime-pause-changed", pauseReasons: ["visibility"] }],
    }));
    expect(visibility.hidden).toBe(false);
    expect(focus.hidden).toBe(true);
    pause.focus();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.activeElement).toBe(visibility);
    visibility.click();
    expect(session.resumeCalls).toEqual(["visibility"]);
    expect(document.activeElement).toBe(pause);

    session.emit(snapshot(session.current.state, {
      status: "paused",
      pauseReasons: ["focus-interruption"],
      events: [{
        type: "runtime-pause-changed",
        pauseReasons: ["focus-interruption"],
      }],
    }));
    expect(focus.hidden).toBe(false);
    expect(visibility.hidden).toBe(true);
    pause.focus();
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(focus);
    focus.click();
    expect(session.resumeCalls).toEqual([
      "visibility",
      "focus-interruption",
    ]);
    expect(document.activeElement).toBe(pause);
  });

  it("returns focus to Start when an interruption closes before the run starts", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.entry, {
      started: false,
      status: "paused",
      pauseReasons: ["visibility"],
    }));
    const { view } = mount(session, base.context);
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const start = view.section.querySelector<HTMLButtonElement>(
      "#runner-start-button",
    )!;
    const pause = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-user-pause]",
    )!;

    expect(document.activeElement).toBe(visibility);
    visibility.click();

    expect(session.resumeCalls).toEqual(["visibility"]);
    expect(session.current.started).toBe(false);
    expect(session.current.status).toBe("awaiting-start");
    expect(start.disabled).toBe(false);
    expect(pause.hidden).toBe(true);
    expect(document.activeElement).toBe(start);
  });

  it("moves focus through stacked visibility and focus resumes in either clear order", () => {
    const orders = [
      ["visibility", "focus-interruption"],
      ["focus-interruption", "visibility"],
    ] as const;

    for (const [first, remaining] of orders) {
      const base = run("manual");
      const session = new FakeSession(snapshot(base.started, {
        status: "paused",
        pauseReasons: ["visibility", "focus-interruption"],
      }));
      const { view } = mount(session, base.context);
      const controls: Readonly<Record<
        "visibility" | "focus-interruption",
        HTMLButtonElement
      >> = {
        visibility: view.section.querySelector<HTMLButtonElement>(
          "[data-runner-resume='visibility']",
        )!,
        "focus-interruption": view.section.querySelector<HTMLButtonElement>(
          "[data-runner-resume='focus-interruption']",
        )!,
      };
      const pause = view.section.querySelector<HTMLButtonElement>(
        "[data-runner-user-pause]",
      )!;

      controls[first].click();
      expect(session.resumeCalls).toEqual([first]);
      expect(controls[first].hidden).toBe(true);
      expect(controls[remaining].hidden).toBe(false);
      expect(controls[remaining].disabled).toBe(false);
      expect(document.activeElement).toBe(controls[remaining]);

      controls[remaining].click();
      expect(session.resumeCalls).toEqual([first, remaining]);
      expect(pause.hidden).toBe(false);
      expect(pause.disabled).toBe(false);
      expect(document.activeElement).toBe(pause);
    }
  });

  it("restores focus to the active user Resume after an interruption closes", () => {
    const base = run("manual");
    if (base.started.runner === null) throw new Error("Started runner is missing");
    const userPausedState = deepFreeze({
      ...base.started,
      runner: { ...base.started.runner, userPaused: true },
    });
    const session = new FakeSession(snapshot(userPausedState, {
      status: "paused",
      pauseReasons: ["visibility", "user"],
    }));
    const { view } = mount(session, base.context);
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const pause = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-user-pause]",
    )!;

    visibility.click();

    expect(pause.textContent).toBe("Resume");
    expect(pause.getAttribute("data-runner-resume")).toBe("user");
    expect(pause.hidden).toBe(false);
    expect(pause.disabled).toBe(false);
    expect(document.activeElement).toBe(pause);
  });

  it("restores focus to an enabled Semantic choice after an interruption closes", () => {
    const checkpoint = semanticCheckpoint();
    const session = new FakeSession(snapshot(checkpoint.state, {
      status: "paused",
      pauseReasons: ["visibility", "semantic"],
    }));
    const { view } = mount(session, checkpoint.context);
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const choice = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-semantic-lane='0']",
    )!;

    expect(choice.disabled).toBe(true);
    visibility.click();

    expect(choice.closest<HTMLFieldSetElement>("fieldset")?.hidden).toBe(false);
    expect(choice.disabled).toBe(false);
    expect(document.activeElement).toBe(choice);
  });

  it("uses stable focus targets when an interrupted run settles or completes", () => {
    const base = run("manual");
    const completed = completedManualRun();
    const session = new FakeSession(snapshot(base.started, {
      status: "paused",
      pauseReasons: ["visibility"],
    }));
    const { view } = mount(session, base.context);
    const pause = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-user-pause]",
    )!;
    const heading = view.section.querySelector<HTMLElement>(
      "#runner-status-heading",
    )!;

    session.emit(snapshot(base.started, {
      status: "settling",
      pauseReasons: [],
      events: [{ type: "runtime-pause-changed", pauseReasons: [] }],
    }));

    expect(pause.hidden).toBe(false);
    expect(pause.disabled).toBe(true);
    expect(document.activeElement).toBe(heading);

    session.emit(snapshot(completed.state, {
      status: "completed",
      pauseReasons: [],
      events: [{
        type: "settlement-applied",
        simulationTick: completed.state.simulationTick,
      }],
    }));

    const completionHeading = view.section.querySelector<HTMLElement>(
      "#runner-completion-heading",
    )!;
    expect(pause.hidden).toBe(true);
    expect(document.activeElement).toBe(completionHeading);
  });

  it("keeps retained interruption controls inert and recap focus stable at completion", () => {
    const completed = completedManualRun();
    const session = new FakeSession(snapshot(completed.state, {
      status: "completed",
      pauseReasons: ["visibility", "focus-interruption"],
    }));
    const { view } = mount(session, completed.context);
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const focus = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='focus-interruption']",
    )!;
    const recap = view.section.querySelector<HTMLElement>(
      "#runner-completion-heading",
    )!;

    expect(visibility.hidden).toBe(true);
    expect(visibility.disabled).toBe(true);
    expect(focus.hidden).toBe(true);
    expect(focus.disabled).toBe(true);
    expect(document.activeElement).toBe(recap);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.activeElement).toBe(recap);
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(recap);

    session.emit(snapshot(completed.state, {
      status: "completed",
      pauseReasons: ["focus-interruption"],
      events: [{
        type: "runtime-pause-changed",
        pauseReasons: ["focus-interruption"],
      }],
    }));
    expect(document.activeElement).toBe(recap);

    session.emit(snapshot(completed.state, {
      status: "completed",
      pauseReasons: [],
      events: [{ type: "runtime-pause-changed", pauseReasons: [] }],
    }));
    expect(document.activeElement).toBe(recap);
  });

  it("does not steal terminal-action focus when no matching interruption remains", () => {
    const completed = completedManualRun();
    const session = new FakeSession(snapshot(completed.state, {
      status: "completed",
      pauseReasons: [],
    }));
    const { view } = mount(session, completed.context);
    const practiceAgain = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-practice-again]",
    )!;

    practiceAgain.focus();
    expect(document.activeElement).toBe(practiceAgain);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.activeElement).toBe(practiceAgain);
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(practiceAgain);
  });

  it("hides stale interruption resumes and preserves recovery focus after a fault", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started, {
      status: "paused",
      pauseReasons: ["visibility", "focus-interruption"],
    }));
    const { view } = mount(session, base.context);
    const visibility = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='visibility']",
    )!;
    const focus = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-resume='focus-interruption']",
    )!;
    const recovery = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-fault-return-title]",
    )!;
    const heading = view.section.querySelector<HTMLElement>(
      "#runner-status-heading",
    )!;

    session.emit(snapshot(base.started, {
      status: "faulted",
      pauseReasons: ["visibility", "focus-interruption"],
      notice: { tone: "error", message: "A recoverable runner fault occurred." },
    }));

    expect(visibility.hidden).toBe(true);
    expect(visibility.disabled).toBe(true);
    expect(focus.hidden).toBe(true);
    expect(focus.disabled).toBe(true);
    expect(recovery.hidden).toBe(false);
    expect(recovery.disabled).toBe(false);
    expect(document.activeElement).toBe(recovery);

    heading.focus();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.activeElement).toBe(recovery);
    heading.focus();
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(recovery);

    session.emit(snapshot(base.started, {
      status: "faulted",
      pauseReasons: [],
      events: [{ type: "runtime-pause-changed", pauseReasons: [] }],
      notice: { tone: "error", message: "A recoverable runner fault occurred." },
    }));
    expect(document.activeElement).toBe(recovery);
  });

  it("remaps supplemental keys in a contained native dialog and resets immediately", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const controller = createBindingController();
    const { view } = mount(session, base.context);
    view.attachBindingController(controller);
    const configure = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    const dialog = view.section.querySelector<HTMLDialogElement>(
      "dialog[data-runner-binding-dialog]",
    )!;
    const background = view.section.querySelector<HTMLElement>(
      "[data-runner-modal-background]",
    )!;
    const remapUp = dialog.querySelector<HTMLButtonElement>(
      "[data-runner-remap='lane-up']",
    )!;
    const remapDown = dialog.querySelector<HTMLButtonElement>(
      "[data-runner-remap='lane-down']",
    )!;
    const reset = dialog.querySelector<HTMLButtonElement>(
      "[data-runner-reset-bindings]",
    )!;
    const close = dialog.querySelector<HTMLButtonElement>(
      "[data-runner-close-bindings]",
    )!;
    const error = dialog.querySelector<HTMLElement>(
      "[data-runner-binding-error]",
    )!;
    const feedback = dialog.querySelector<HTMLElement>(
      "[data-runner-binding-feedback]",
    )!;

    expect(configure.disabled).toBe(false);
    expect(view.section.querySelectorAll("[role='status'], [role='alert']"))
      .toHaveLength(2);
    expect(feedback.hasAttribute("role")).toBe(false);
    expect(error.hasAttribute("role")).toBe(false);
    expect(remapUp.getAttribute("aria-describedby")).toContain(feedback.id);
    expect(remapUp.getAttribute("aria-describedby")).toContain(error.id);
    expect(remapDown.getAttribute("aria-describedby")).toBe(
      remapUp.getAttribute("aria-describedby"),
    );
    configure.focus();
    configure.click();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(background.hasAttribute("inert")).toBe(true);
    expect(session.modalCalls).toEqual([true]);
    expect(session.current.pauseReasons).toContain("modal");
    expect(view.getInputGateSnapshot().dialogOpen).toBe(true);
    expect(document.activeElement).toBe(remapUp);

    remapUp.click();
    remapUp.dispatchEvent(new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      bubbles: true,
      cancelable: true,
    }));
    expect(dialog.querySelector("[data-runner-binding-value='lane-up']")?.textContent)
      .toBe("I");
    expect(view.laneUpButton.getAttribute("aria-keyshortcuts")).toBe("ArrowUp I");
    expect(view.section.querySelector("[data-runner-binding-instructions]")?.textContent)
      .toContain("Up arrow or I");

    remapDown.click();
    remapDown.dispatchEvent(new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      bubbles: true,
      cancelable: true,
    }));
    expect(error.textContent).toContain("already assigned");
    expect(dialog.querySelector("[data-runner-binding-value='lane-down']")?.textContent)
      .toBe("S");
    remapDown.dispatchEvent(new KeyboardEvent("keydown", {
      key: "j",
      code: "KeyJ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(error.textContent).toContain("Modifier combinations");
    remapDown.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    expect(error.textContent).toContain("cannot be supplemental controls");
    remapDown.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      bubbles: true,
      cancelable: true,
    }));
    expect(dialog.querySelector("[data-runner-binding-value='lane-down']")?.textContent)
      .toBe("K");
    expect(view.laneDownButton.getAttribute("aria-keyshortcuts")).toBe("ArrowDown K");

    reset.click();
    expect(dialog.querySelector("[data-runner-binding-value='lane-up']")?.textContent)
      .toBe("W");
    expect(dialog.querySelector("[data-runner-binding-value='lane-down']")?.textContent)
      .toBe("S");
    expect(view.laneUpButton.getAttribute("aria-keyshortcuts")).toBe("ArrowUp W");
    expect(view.laneDownButton.getAttribute("aria-keyshortcuts")).toBe("ArrowDown S");

    close.focus();
    close.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(remapUp);
    remapUp.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(dialog.open).toBe(false);
    expect(background.hasAttribute("inert")).toBe(false);
    expect(session.modalCalls).toEqual([true, false]);
    expect(document.activeElement).toBe(configure);
  });

  it("preserves browser and system key behavior until a remap is accepted", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const { view } = mount(session, base.context);
    view.attachBindingController(createBindingController());
    const configure = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    const dialog = view.section.querySelector<HTMLDialogElement>(
      "dialog[data-runner-binding-dialog]",
    )!;
    const remapUp = dialog.querySelector<HTMLButtonElement>(
      "[data-runner-remap='lane-up']",
    )!;
    const error = dialog.querySelector<HTMLElement>(
      "[data-runner-binding-error]",
    )!;
    const bubbledCodes: string[] = [];
    view.section.addEventListener("keydown", (event) => {
      bubbledCodes.push((event as KeyboardEvent).code);
    });
    const dispatchRemap = (
      init: KeyboardEventInit & Pick<KeyboardEventInit, "code" | "key">,
    ): KeyboardEvent => {
      const event = new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      remapUp.dispatchEvent(event);
      return event;
    };

    configure.click();
    remapUp.click();

    const controlLocation = dispatchRemap({
      key: "l",
      code: "KeyL",
      ctrlKey: true,
    });
    expect(controlLocation.defaultPrevented).toBe(false);
    expect(bubbledCodes).toEqual(["KeyL"]);
    expect(error.textContent).toContain("Modifier combinations");
    expect(remapUp.getAttribute("aria-pressed")).toBe("true");

    const focusTraversal = dispatchRemap({ key: "F6", code: "F6" });
    expect(focusTraversal.defaultPrevented).toBe(false);
    expect(bubbledCodes).toEqual(["KeyL", "F6"]);
    expect(error.textContent).toContain("cannot be supplemental controls");
    expect(remapUp.getAttribute("aria-pressed")).toBe("true");

    const arrowNavigation = dispatchRemap({
      key: "ArrowLeft",
      code: "ArrowLeft",
    });
    expect(arrowNavigation.defaultPrevented).toBe(false);
    expect(bubbledCodes).toEqual(["KeyL", "F6", "ArrowLeft"]);
    expect(error.textContent).toContain("cannot be supplemental controls");
    expect(remapUp.getAttribute("aria-pressed")).toBe("true");

    const duplicate = dispatchRemap({ key: "s", code: "KeyS" });
    expect(duplicate.defaultPrevented).toBe(false);
    expect(bubbledCodes).toEqual(["KeyL", "F6", "ArrowLeft", "KeyS"]);
    expect(error.textContent).toContain("already assigned");
    expect(remapUp.getAttribute("aria-pressed")).toBe("true");
    expect(dialog.querySelector("[data-runner-binding-value='lane-up']")?.textContent)
      .toBe("W");

    const accepted = dispatchRemap({ key: "j", code: "KeyJ" });
    expect(accepted.defaultPrevented).toBe(true);
    expect(bubbledCodes).toEqual(["KeyL", "F6", "ArrowLeft", "KeyS"]);
    expect(remapUp.getAttribute("aria-pressed")).toBe("false");
    expect(dialog.querySelector("[data-runner-binding-value='lane-up']")?.textContent)
      .toBe("J");
  });

  it("tears down an open binding dialog locally when the session becomes terminal", () => {
    for (const status of ["faulted", "disposed"] as const) {
      const base = run("manual");
      const session = new FakeSession(snapshot(base.started));
      const { view } = mount(session, base.context);
      view.attachBindingController(createBindingController());
      const configure = view.section.querySelector<HTMLButtonElement>(
        "[data-runner-configure-bindings]",
      )!;
      const dialog = view.section.querySelector<HTMLDialogElement>(
        "[data-runner-binding-dialog]",
      )!;
      const background = view.section.querySelector<HTMLElement>(
        "[data-runner-modal-background]",
      )!;
      const remapUp = view.section.querySelector<HTMLButtonElement>(
        "[data-runner-remap='lane-up']",
      )!;
      configure.click();
      expect(dialog.open).toBe(true);
      expect(background.hasAttribute("inert")).toBe(true);
      expect(session.modalCalls).toEqual([true]);
      remapUp.click();
      expect(remapUp.getAttribute("aria-pressed")).toBe("true");
      expect(remapUp.dataset.capturing).toBe("true");

      session.emit(snapshot(base.started, {
        status,
        pauseReasons: ["modal"],
        notice: status === "faulted"
          ? { tone: "error", message: "Binding recovery is required." }
          : null,
      }));
      expect(dialog.open).toBe(false);
      expect(background.hasAttribute("inert")).toBe(false);
      expect(session.modalCalls).toEqual([true]);
      expect(remapUp.getAttribute("aria-pressed")).toBe("false");
      expect(remapUp.dataset.capturing).toBe("false");
      expect(view.getInputGateSnapshot().started).toBe(false);
      if (status === "faulted") {
        expect(document.activeElement).toBe(view.section.querySelector(
          "[data-runner-fault-return-title]",
        ));
      }
    }
  });

  it("keeps remaps mount-local and restores W/S with a fresh binding controller", () => {
    const base = run("manual");
    const firstSession = new FakeSession(snapshot(base.started));
    const first = mount(firstSession, base.context);
    const firstController = createBindingController();
    first.view.attachBindingController(firstController);
    const firstConfigure = first.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    firstConfigure.click();
    const firstRemap = first.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-remap='lane-up']",
    )!;
    firstRemap.click();
    firstRemap.dispatchEvent(new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      bubbles: true,
      cancelable: true,
    }));
    expect(firstController.snapshot().instructions["lane-up"])
      .toBe("Up arrow or I");
    first.view.dispose();

    const secondSession = new FakeSession(snapshot(base.started));
    const second = mount(secondSession, base.context);
    const secondController = createBindingController();
    second.view.attachBindingController(secondController);
    expect(secondController.snapshot().instructions).toEqual({
      "lane-up": "Up arrow or W",
      "lane-down": "Down arrow or S",
    });
    expect(second.view.laneUpButton.getAttribute("aria-keyshortcuts"))
      .toBe("ArrowUp W");
  });

  it("rolls back a rejected modal open and keeps a rejected close safely paused", () => {
    const base = run("manual");
    const rejectedOpenSession = new FakeSession(snapshot(base.started));
    rejectedOpenSession.allowModalTransition = false;
    const rejectedOpen = mount(rejectedOpenSession, base.context);
    rejectedOpen.view.attachBindingController(createBindingController());
    const rejectedInvoker = rejectedOpen.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    const rejectedDialog = rejectedOpen.view.section.querySelector<HTMLDialogElement>(
      "[data-runner-binding-dialog]",
    )!;
    rejectedInvoker.focus();
    rejectedInvoker.click();
    expect(rejectedDialog.open).toBe(false);
    expect(rejectedOpen.view.getInputGateSnapshot().dialogOpen).toBe(false);
    expect(rejectedOpenSession.current.pauseReasons).not.toContain("modal");
    expect(rejectedOpen.view.section.querySelector(
      "[data-runner-modal-background]",
    )?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(rejectedInvoker);
    expect(rejectedOpen.view.section.querySelector(
      "[data-runner-live-alert]",
    )?.textContent).toContain("could not pause");

    const rejectedCloseSession = new FakeSession(snapshot(base.started));
    const returnToTitle = vi.fn();
    const rejectedClose = mount(rejectedCloseSession, base.context, {
      onReturnToTitle: returnToTitle,
    });
    rejectedClose.view.attachBindingController(createBindingController());
    const closeInvoker = rejectedClose.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    const closeDialog = rejectedClose.view.section.querySelector<HTMLDialogElement>(
      "[data-runner-binding-dialog]",
    )!;
    const closeButton = closeDialog.querySelector<HTMLButtonElement>(
      "[data-runner-close-bindings]",
    )!;
    closeInvoker.click();
    expect(rejectedCloseSession.current.pauseReasons).toContain("modal");
    rejectedCloseSession.allowModalTransition = false;
    closeButton.click();
    expect(closeDialog.open).toBe(true);
    expect(rejectedClose.view.getInputGateSnapshot().dialogOpen).toBe(true);
    expect(rejectedCloseSession.current.pauseReasons).toContain("modal");
    expect(document.activeElement).toBe(closeButton);
    expect(closeDialog.querySelector("[data-runner-binding-error]")?.textContent)
      .toContain("could not safely close");
    const recovery = closeDialog.querySelector<HTMLButtonElement>(
      "[data-runner-binding-return-title]",
    )!;
    expect(recovery.disabled).toBe(false);
    recovery.click();
    expect(closeDialog.open).toBe(false);
    expect(rejectedClose.view.section.querySelector(
      "[data-runner-modal-background]",
    )?.hasAttribute("inert")).toBe(false);
    expect(returnToTitle).toHaveBeenCalledOnce();
    expect(rejectedCloseSession.current.pauseReasons).toContain("modal");

    closeInvoker.click();
    expect(closeDialog.open).toBe(false);
    rejectedCloseSession.allowModalTransition = true;
    rejectedCloseSession.setModalOpen(false);
  });

  it("blocks remapping at completion and provides focused fault recovery", () => {
    const base = run("manual");
    const completed = completedManualRun();
    const completedSession = new FakeSession(snapshot(completed.state, {
      status: "completed",
    }));
    const completedMount = mount(completedSession, base.context);
    completedMount.view.attachBindingController(createBindingController());
    const completedConfigure = completedMount.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    expect(completedConfigure.disabled).toBe(true);
    completedConfigure.click();
    expect(completedSession.modalCalls).toEqual([]);
    expect(completedMount.view.section.querySelector<HTMLDialogElement>("dialog")?.open)
      .toBe(false);
    expect(completedMount.view.section.querySelector(
      "[data-runner-completion-summary]",
    )?.textContent).toContain("do not affect your life journey");

    const faultSession = new FakeSession(snapshot(base.started, {
      status: "faulted",
      notice: {
        tone: "error",
        message: "The runner encountered a recoverable problem.",
      },
    }));
    const returnToTitle = vi.fn();
    const faultMount = mount(faultSession, base.context, {
      onReturnToTitle: returnToTitle,
    });
    faultMount.view.attachBindingController(createBindingController());
    const faultConfigure = faultMount.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-configure-bindings]",
    )!;
    const recovery = faultMount.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-fault-return-title]",
    )!;
    const laneCluster = faultMount.view.section.querySelector<HTMLElement>(
      "[data-runner-control-cluster]",
    )!;
    const controlPlacement = faultMount.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-control-placement]",
    )!;
    expect(faultConfigure.disabled).toBe(true);
    expect(faultMount.view.laneUpButton.disabled).toBe(true);
    expect(faultMount.view.laneDownButton.disabled).toBe(true);
    expect(laneCluster.hidden).toBe(true);
    expect(controlPlacement.hidden).toBe(true);
    expect(controlPlacement.disabled).toBe(true);
    faultConfigure.click();
    expect(faultSession.modalCalls).toEqual([]);
    expect(recovery.hidden).toBe(false);
    expect(document.activeElement).toBe(recovery);
    expect(faultMount.view.section.querySelector("[role='alert']")?.textContent)
      .toContain("recoverable problem");
    recovery.click();
    expect(returnToTitle).toHaveBeenCalledOnce();
  });

  it("turns a post-mount model exception into one persistent non-recursive session fault", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const returnToTitle = vi.fn();
    const { view } = mount(session, base.context, { onReturnToTitle: returnToTitle });
    const invalidState = deepFreeze({
      ...base.started,
      runSeed: "ffffffffffffffff",
    }) as RunStateV1;

    expect(() => session.emit(snapshot(invalidState))).not.toThrow();
    expect(session.presentationFaultCalls).toEqual([
      "The runner display could not be updated safely. The runner stopped. Return to the title to begin a safe new session.",
    ]);
    expect(session.current.status).toBe("faulted");
    expect(view.section.dataset.status).toBe("faulted");
    expect(view.laneUpButton.disabled).toBe(true);
    expect(view.laneDownButton.disabled).toBe(true);
    expect(view.getInputGateSnapshot()).toMatchObject({
      started: false,
      pauseReasons: ["presentation-fault"],
    });
    const alert = view.section.querySelector<HTMLElement>(
      "[data-runner-live-alert]",
    )!;
    const recovery = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-fault-return-title]",
    )!;
    expect(alert.textContent).toContain("display could not be updated safely");
    expect(recovery.disabled).toBe(false);
    expect(document.activeElement).toBe(recovery);

    session.emit(snapshot(base.started));
    expect(view.section.dataset.status).toBe("faulted");
    expect(alert.textContent).toContain("display could not be updated safely");
    expect(session.presentationFaultCalls).toHaveLength(1);
    expect(view.getInputGateSnapshot().started).toBe(false);
    recovery.click();
    expect(returnToTitle).toHaveBeenCalledOnce();
  });

  it("faults instead of narrating a forged completed fact or memory", () => {
    const base = run("manual");
    const completed = completedManualRun();
    const forgedCompletions: readonly RunStateV1[] = [
      deepFreeze({
        ...completed.state,
        storyState: {
          ...completed.state.storyState,
          facts: [
            ...completed.state.storyState.facts,
            RUNNER_LABORATORY_COMPLETION_FACT,
          ],
        },
      }),
      deepFreeze({
        ...completed.state,
        storyState: {
          ...completed.state.storyState,
          memories: [{
            ...RUNNER_LABORATORY_COMPLETION_MEMORY,
            summary: "A forged completion summary.",
          }],
        },
      }),
    ];

    for (const forgedCompletion of forgedCompletions) {
      const session = new FakeSession(snapshot(forgedCompletion));
      let mounted: ReturnType<typeof mount> | null = null;
      expect(() => {
        mounted = mount(session, base.context);
      }).not.toThrow();
      const view = mounted!.view;
      expect(session.presentationFaultCalls).toEqual([
        "The runner display could not be updated safely. The runner stopped. Return to the title to begin a safe new session.",
      ]);
      expect(view.section.dataset.status).toBe("faulted");
      expect(view.section.querySelector<HTMLElement>("[data-runner-completion]")?.hidden)
        .toBe(true);
      expect(view.section.querySelector("[data-runner-completion-summary]")?.textContent)
        .not.toContain(RUNNER_LABORATORY_COMPLETION_MEMORY.summary);
      expect(view.section.querySelector("[data-runner-live-alert]")?.textContent)
        .toContain("display could not be updated safely");
      expect(document.activeElement).toBe(view.section.querySelector(
        "[data-runner-fault-return-title]",
      ));
    }
  });

  it("focuses a completion recap and invokes both terminal callbacks", () => {
    const base = run("manual");
    const completed = completedManualRun();
    const session = new FakeSession(snapshot(base.started));
    const practice = vi.fn();
    const title = vi.fn();
    const { view } = mount(session, base.context, {
      onPracticeAgain: practice,
      onReturnToTitle: title,
    });
    session.emit(snapshot(completed.state, {
      status: "completed",
      events: [{
        type: "settlement-applied",
        simulationTick: completed.state.simulationTick,
      }],
    }));

    const recap = view.section.querySelector<HTMLElement>(
      "#runner-completion-heading",
    )!;
    expect(document.activeElement).toBe(recap);
    const completionPanel = view.section.querySelector<HTMLElement>(
      "[data-runner-completion]",
    )!;
    const summary = view.section.querySelector<HTMLElement>(
      "[data-runner-completion-summary]",
    )?.textContent ?? "";
    const liveStatus = view.section.querySelector<HTMLElement>(
      "[data-runner-live-status]",
    )?.textContent ?? "";
    expect(completionPanel.hidden).toBe(false);
    expect(completionPanel.dataset.runnerCompletionFactId).toBe(
      RUNNER_LABORATORY_COMPLETION_FACT.factId,
    );
    expect(completionPanel.dataset.runnerCompletionMemoryId).toBe(
      RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId,
    );
    for (const message of [summary, liveStatus]) {
      expect(message).toContain("one learning fact");
      expect(message).toContain("one milestone memory");
      expect(message).toContain(RUNNER_LABORATORY_COMPLETION_FACT.valueId);
      expect(message).toContain(RUNNER_LABORATORY_COMPLETION_MEMORY.summary);
      expect(message).toContain("These practice scores do not affect your life journey.");
      expect(occurrenceCount(
        message,
        RUNNER_LABORATORY_COMPLETION_FACT.factId,
      )).toBe(1);
      expect(occurrenceCount(
        message,
        RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId,
      )).toBe(1);
    }
    expect(completed.state.storyState.facts).toEqual([
      RUNNER_LABORATORY_COMPLETION_FACT,
    ]);
    expect(completed.state.storyState.memories).toEqual([
      RUNNER_LABORATORY_COMPLETION_MEMORY,
    ]);
    expect(view.section.querySelector<HTMLProgressElement>("progress")?.value)
      .toBe(3000);
    expect(view.section.querySelectorAll("output")).toHaveLength(3);
    view.section.querySelector<HTMLButtonElement>("[data-runner-practice-again]")
      ?.click();
    view.section.querySelector<HTMLButtonElement>("[data-runner-return-title]")
      ?.click();
    expect(practice).toHaveBeenCalledOnce();
    expect(title).toHaveBeenCalledOnce();
  });

  it("batches contact results, keeps clock ticks out of live status, and disposes", () => {
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const practice = vi.fn();
    const { root, view } = mount(session, base.context, {
      onPracticeAgain: practice,
    });
    const status = view.section.querySelector<HTMLElement>(
      "[data-runner-live-status]",
    )!;
    let state = base.started;
    let contactResult: RunnerSimulationResult | null = null;
    while (contactResult === null) {
      const result = advanceRunnerLaboratory(base.context, state);
      if (!result.stateChanged) throw new Error("Contact trace stalled");
      state = result.state;
      if (result.events.some((event) => event.type === "contact-resolved")) {
        contactResult = result;
      }
    }
    session.emit(snapshot(state, { events: contactResult.events }));
    expect(status.textContent).toMatch(
      /(Health|Happiness|Financial security).*(increased|decreased|did not change).*to \d+/,
    );
    const contactMessage = status.textContent;
    const next = advanceRunnerLaboratory(base.context, state);
    session.emit(snapshot(next.state, { events: next.events }));
    expect(status.textContent).toBe(contactMessage);

    const section = view.section;
    const oldPractice = section.querySelector<HTMLButtonElement>(
      "[data-runner-practice-again]",
    )!;
    view.dispose();
    view.dispose();
    expect(session.unsubscribeCalls).toBe(1);
    expect(section.isConnected).toBe(false);
    expect(root.childElementCount).toBe(0);
    session.emit(snapshot(next.state));
    oldPractice.click();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(practice).not.toHaveBeenCalled();
  });

  it("announces authentic applied, suppressed, and clamped contacts with lane and result", () => {
    const base = run("manual");
    const entities = base.context.course.patterns.flatMap((pattern) =>
      pattern.entities);
    const benefit = entities.find((entity) => entity.kind === "benefit")!;
    const hazard = entities.find((entity) => entity.kind === "hazard")!;
    const benefitDefinition =
      RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
        benefit.contentId,
      )!;
    const hazardDefinition =
      RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
        hazard.contentId,
      )!;
    const laneLabels = ["Top lane", "Middle lane", "Bottom lane"] as const;

    const appliedAfter = base.started.scores[benefitDefinition.scoreId] + 1;
    const appliedState = deepFreeze({
      ...base.started,
      scores: {
        ...base.started.scores,
        [benefitDefinition.scoreId]: appliedAfter,
      },
    });
    const appliedSession = new FakeSession(snapshot(base.started));
    const applied = mount(appliedSession, base.context);
    appliedSession.emit(snapshot(appliedState, {
      events: [{
        type: "contact-resolved",
        contact: {
          entityInstanceId: benefit.instanceId,
          contentId: benefit.contentId,
          simulationTick: benefit.contactTick,
          outcome: "benefit-applied",
          effect: {
            effectId: "runner-test-applied-v1",
            scoreId: benefitDefinition.scoreId,
            requestedDelta: 1,
            actualDelta: 1,
            before: appliedAfter - 1,
            after: appliedAfter,
            source: "runner",
            categoryId: benefitDefinition.categoryId,
            causedByChoiceId: null,
            transactionId: null,
            simulationTick: benefit.contactTick,
          },
        },
      }],
    }));
    const appliedText = applied.view.section.querySelector(
      "[data-runner-live-status]",
    )?.textContent ?? "";
    expect(appliedText).toContain(`${laneLabels[benefit.lane]}:`);
    expect(appliedText).toContain(`increased by 1 to ${appliedAfter}`);
    applied.view.dispose();

    const suppressedSession = new FakeSession(snapshot(base.started));
    const suppressed = mount(suppressedSession, base.context);
    suppressedSession.emit(snapshot(base.started, {
      events: [{
        type: "contact-resolved",
        contact: {
          entityInstanceId: hazard.instanceId,
          contentId: hazard.contentId,
          simulationTick: hazard.contactTick,
          outcome: "hazard-suppressed",
          effect: null,
        },
      }],
    }));
    const suppressedText = suppressed.view.section.querySelector(
      "[data-runner-live-status]",
    )?.textContent ?? "";
    expect(suppressedText).toContain(`${laneLabels[hazard.lane]}:`);
    expect(suppressedText).toContain(
      `changed by 0 and remains ${base.started.scores[hazardDefinition.scoreId]}`,
    );
    suppressed.view.dispose();

    const clampedState = deepFreeze({
      ...base.started,
      scores: {
        ...base.started.scores,
        [benefitDefinition.scoreId]: 100,
      },
    });
    const clampedSession = new FakeSession(snapshot(base.started));
    const clampedReturnToTitle = vi.fn();
    const clamped = mount(clampedSession, base.context, {
      onReturnToTitle: clampedReturnToTitle,
    });
    clampedSession.emit(snapshot(clampedState, {
      events: [{
        type: "contact-resolved",
        contact: {
          entityInstanceId: benefit.instanceId,
          contentId: benefit.contentId,
          simulationTick: benefit.contactTick,
          outcome: "benefit-applied",
          effect: {
            effectId: "runner-test-clamped-v1",
            scoreId: benefitDefinition.scoreId,
            requestedDelta: 1,
            actualDelta: 0,
            before: 100,
            after: 100,
            source: "runner",
            categoryId: benefitDefinition.categoryId,
            causedByChoiceId: null,
            transactionId: null,
            simulationTick: benefit.contactTick,
          },
        },
      }],
    }));
    const clampedText = clamped.view.section.querySelector(
      "[data-runner-live-status]",
    )?.textContent ?? "";
    expect(clampedText).toContain(`${laneLabels[benefit.lane]}:`);
    expect(clampedText).toContain("did not change to 100");
    expect(clampedText).toContain("Requested +1");
    clampedSession.emit(snapshot(clampedState, {
      events: [{
        type: "contact-resolved",
        contact: {
          entityInstanceId: "entity-ffffffffffffffff",
          contentId: benefit.contentId,
          simulationTick: benefit.contactTick,
          outcome: "benefit-applied",
          effect: {
            effectId: "runner-test-unverified-v1",
            scoreId: benefitDefinition.scoreId,
            requestedDelta: 1,
            actualDelta: 1,
            before: 99,
            after: 100,
            source: "runner",
            categoryId: benefitDefinition.categoryId,
            causedByChoiceId: null,
            transactionId: null,
            simulationTick: benefit.contactTick,
          },
        },
      }],
    }));
    const faultMessage = clamped.view.section.querySelector(
      "[data-runner-live-alert]",
    )?.textContent ?? "";
    const faultPanel = clamped.view.section.querySelector<HTMLElement>(
      "[data-runner-fault]",
    )!;
    const faultSummary = clamped.view.section.querySelector<HTMLElement>(
      "[data-runner-fault-summary]",
    )!;
    const recovery = clamped.view.section.querySelector<HTMLButtonElement>(
      "[data-runner-fault-return-title]",
    )!;
    expect(faultMessage).toContain("could not be verified");
    expect(clampedSession.presentationFaultCalls).toEqual([faultMessage]);
    expect(clampedSession.current.status).toBe("faulted");
    expect(clamped.view.section.dataset.status).toBe("faulted");
    expect(faultPanel.hidden).toBe(false);
    expect(faultSummary.textContent).toBe(faultMessage);
    expect(document.activeElement).toBe(recovery);
    expect(clamped.view.getInputGateSnapshot()).toMatchObject({
      started: false,
      pauseReasons: ["presentation-fault"],
    });

    clampedSession.emit(snapshot(clampedState));
    expect(clamped.view.section.dataset.status).toBe("faulted");
    expect(faultPanel.hidden).toBe(false);
    expect(faultSummary.textContent).toBe(faultMessage);
    expect(clamped.view.section.querySelector(
      "[data-runner-live-alert]",
    )?.textContent).toBe(faultMessage);
    expect(clampedSession.presentationFaultCalls).toEqual([faultMessage]);
    expect(clamped.view.getInputGateSnapshot().started).toBe(false);
    recovery.click();
    expect(clampedReturnToTitle).toHaveBeenCalledOnce();
  });

  it("rate-limits polite status, keeps the latest rapid message, and cancels disposal flushes", () => {
    vi.useFakeTimers();
    const base = run("manual");
    const session = new FakeSession(snapshot(base.entry, {
      started: false,
      status: "awaiting-start",
    }));
    session.onStart = () => snapshot(base.started, {
      events: base.startResult.events,
    });
    const { view } = mount(session, base.context);
    const status = view.section.querySelector<HTMLElement>(
      "[data-runner-live-status]",
    )!;
    const start = view.section.querySelector<HTMLButtonElement>(
      "#runner-start-button",
    )!;
    const pause = view.section.querySelector<HTMLButtonElement>(
      "[data-runner-user-pause]",
    )!;
    expect(status.textContent).toContain("Runner ready");

    start.click();
    pause.click();
    expect(status.textContent).toContain("Runner ready");
    vi.advanceTimersByTime(999);
    expect(status.textContent).toContain("Runner ready");
    vi.advanceTimersByTime(1);
    expect(status.textContent).toContain("paused by you");
    const firstBoundaryText = status.textContent;

    session.emit(snapshot(session.current.state, {
      status: "paused",
      pauseReasons: ["user"],
      events: [{ type: "user-pause-changed", active: true }],
    }));
    expect(status.textContent).toBe(firstBoundaryText);
    expect(vi.getTimerCount()).toBe(0);

    pause.click();
    session.emit(snapshot(session.current.state, {
      status: "paused",
      pauseReasons: ["visibility"],
      events: [{
        type: "runtime-pause-changed",
        pauseReasons: ["visibility"],
      }],
    }));
    vi.advanceTimersByTime(999);
    expect(status.textContent).toBe(firstBoundaryText);
    vi.advanceTimersByTime(1);
    expect(status.textContent).toContain("page hidden");
    expect(status.textContent).not.toBe("Runner resumed.");

    const beforeDispose = status.textContent;
    session.resumeInterruption("visibility");
    view.dispose();
    vi.advanceTimersByTime(1000);
    expect(status.textContent).toBe(beforeDispose);
  });

  it("combines saved and live OS reduced-motion preferences and disposes the media listener", () => {
    const preference = createMotionPreference(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => preference.query,
    });
    const base = run("manual");
    const session = new FakeSession(snapshot(base.started));
    const { view } = mount(session, base.context, {
      visualOptions: {
        ...VISUALS,
        motionReduced: false,
      },
    });

    expect(view.section.dataset.motionReduced).toBe("true");
    preference.setMatches(false);
    expect(view.section.dataset.motionReduced).toBe("false");
    view.updateVisualOptions({ ...VISUALS, motionReduced: true });
    expect(view.section.dataset.motionReduced).toBe("true");
    preference.setMatches(true);
    preference.setMatches(false);
    expect(view.section.dataset.motionReduced).toBe("true");
    view.updateVisualOptions({ ...VISUALS, motionReduced: false });
    expect(view.section.dataset.motionReduced).toBe("false");
    const section = view.section;
    view.dispose();
    preference.setMatches(true);
    expect(section.dataset.motionReduced).toBe("false");
  });

  it("keeps one fixed player footprint across matrix viewports, identities, and text scales", () => {
    const style = document.createElement("style");
    style.textContent = runnerCss;
    document.head.append(style);
    const base = run("manual");
    const tokens: readonly RunnerViewCharacterToken[] = [
      CHARACTER,
      Object.freeze({
        bodySet: "masculine",
        artSet: "western",
        hairShape: "curly-crown",
        hairTone: "warm-brown",
        clothingTone: "ocean",
      }),
    ];
    const sizes = new Set<string>();
    for (const width of [1280, 800, 360, 320]) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      for (const characterToken of tokens) {
        for (const textScaleMultiplier of [1, 2] as const) {
          const session = new FakeSession(snapshot(base.started));
          const { view } = mount(session, base.context, {
            characterToken,
            visualOptions: { ...VISUALS, textScaleMultiplier },
          });
          const player = view.section.querySelector<HTMLElement>(
            "[data-runner-player]",
          )!;
          const computed = window.getComputedStyle(player);
          sizes.add(`${computed.inlineSize}x${computed.blockSize}`);
          expect(player.dataset.footAnchor).toBe("bottom-center");
          view.dispose();
        }
      }
    }
    expect([...sizes]).toEqual(["48pxx66px"]);
  });

  it("separates warning cards from the fixed play surface while preserving 3:1 lane boundaries", () => {
    const playRule = runnerCss.match(
      /\.col-runner-play-surface\s*\{([^}]+)\}/s,
    )?.[1] ?? "";
    const warningRule = runnerCss.match(
      /\.col-runner-warning-lane\s*\{([^}]+)\}/s,
    )?.[1] ?? "";
    expect(playRule).toMatch(
      /block-size:\s*clamp\(28rem,\s*50vw,\s*30rem\)/,
    );
    const warningLayerRule = runnerCss.match(
      /\.col-runner-warning-layer\s*\{([^}]+)\}/s,
    )?.[1] ?? "";
    expect(warningLayerRule).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(warningLayerRule).not.toMatch(/position:\s*absolute|z-index/);
    expect(warningRule).not.toMatch(/inline-size:\s*min\(46%,\s*24rem\)/);

    const playerHeight = 66;
    const playerWidth = 48;
    const rem = 16;
    for (const viewportWidth of [320, 360, 800, 1280]) {
      const playHeight = Math.max(
        28 * rem,
        Math.min(viewportWidth * 0.5, 30 * rem),
      );
      const topLaneFoot = playHeight / 6;
      expect(topLaneFoot - playerHeight, `${viewportWidth}px top escape`)
        .toBeGreaterThanOrEqual(0);

      expect(playerWidth).toBeLessThan(viewportWidth);
    }

    for (const [scale, heightRem] of [["1.25", 36], ["1.5", 44], ["2", 52]] as const) {
      expect(runnerCss).toMatch(new RegExp(
        `\\.col-runner-view\\[data-text-scale="${scale}"\\] \\.col-runner-play-surface\\s*\\{[^}]*block-size:\\s*${heightRem}rem`,
        "s",
      ));
      expect(heightRem * rem / 6 - playerHeight).toBeGreaterThanOrEqual(0);
    }
    expect(52 * rem / 3).toBeGreaterThan(250);

    const backgrounds = [
      [184, 225, 232],
      [154, 201, 142],
      [111, 166, 111],
      [76, 133, 87],
    ] as const;
    const boundary = [16, 24, 32] as const;
    const luminance = (color: readonly number[]): number => color
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) =>
        sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    for (const background of backgrounds) {
      const boundaryContrast = (
        luminance(background) + 0.05
      ) / (
        luminance(boundary) + 0.05
      );
      expect(boundaryContrast, background.join(",")).toBeGreaterThanOrEqual(3);
    }
    expect(runnerCss).toMatch(
      /border-block-end:\s*4px solid var\(--col-runner-halo-outer\)/,
    );
    expect(runnerCss).toMatch(
      /repeating-linear-gradient\([\s\S]*?var\(--col-runner-halo-inner\)[\s\S]*?var\(--col-runner-halo-outer\)/,
    );

    const base = run("manual");
    const { view } = mount(new FakeSession(snapshot(base.started)), base.context);
    const warningLayer = view.section.querySelector<HTMLElement>(
      "[data-runner-warning-layer]",
    )!;
    expect(warningLayer.getAttribute("aria-hidden")).toBe("true");
    expect(view.playSurface.contains(warningLayer)).toBe(false);
    expect(warningLayer.parentElement).toBe(view.playSurface.parentElement);
    expect(view.playSurface.contains(view.laneUpButton)).toBe(false);
    expect(view.playSurface.contains(view.laneDownButton)).toBe(false);
  });

  it("ships scoped responsive, safe-area, contrast, and motion CSS", () => {
    expect(runnerCss).toContain(".col-runner-play-surface");
    expect(runnerCss).toContain("touch-action: pan-x");
    expect(runnerCss).toContain("min-block-size: 44px");
    expect(runnerCss).toContain("env(safe-area-inset-left, 0px)");
    expect(runnerCss).toContain(".col-runner-controls--left");
    expect(runnerCss).toContain(".col-runner-controls--right");
    expect(runnerCss).toContain("@media (forced-colors: active)");
    expect(runnerCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(runnerCss).toContain("@media (max-width: 30rem)");
    expect(runnerCss).toContain("font-size: 0.82em");
    expect(runnerCss).toContain(
      "padding-inline-end: calc(var(--col-shell-pad-inline) + env(safe-area-inset-right, 0px))",
    );
    expect(runnerCss).toContain(".col-runner-binding-dialog .col-button");
    expect(runnerCss).toContain("inline-size: 48px");
    expect(runnerCss).toContain("block-size: 66px");
    expect(runnerCss).toContain(".col-runner-nonlive-status");
    expect(runnerCss).toContain("data-text-scale=\"2\"");
    expect(runnerCss).not.toMatch(/\.col-runner-player\s*\{[^}]*\b(?:v[wh]|clamp\()/s);
    expect(runnerCss).not.toMatch(/\/\*[\s\S]*?\*\//);
  });
});
