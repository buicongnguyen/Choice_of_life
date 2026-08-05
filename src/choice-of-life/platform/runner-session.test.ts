import { describe, expect, it, vi } from "vitest";

import type {
  RunnerLaboratoryCommitResult,
  RunnerLaboratoryShellPort,
} from "../core/shell-contracts";
import type { ControlMode, RunStateV1 } from "../core/run-state";
import { createRunnerLaboratoryEntryState } from "../core/runner/contract";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  startRunnerLaboratory,
} from "../core/runner/simulation";
import {
  createRunnerSession,
  type RunnerSession,
  type RunnerSessionAnimationFramePort,
  type RunnerSessionClockPort,
} from "./runner-session";
import type { VisibilityTarget } from "./frame-lifecycle";

const RUN_SEED = "0000000000000001";
const SETUP = Object.freeze({
  startingProfileId: "steady-mix-v1" as const,
  difficulty: "story" as const,
  controlMode: "manual" as const,
  identity: { gender: "female" as const },
  appearance: {
    heritageStyleId: "asian" as const,
    hairStyleId: "tied-back" as const,
    hairColorId: "dark-brown" as const,
    clothingPaletteId: "meadow" as const,
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    textScale: 100 as const,
    screenReaderAnnouncements: true,
  },
});

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) =>
    isDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen));
}

function entry(controlMode: ControlMode): RunStateV1 {
  return createRunnerLaboratoryEntryState(RUN_SEED, deepFreeze({
    ...SETUP,
    controlMode,
  }));
}

interface SaveRecord {
  readonly simulationTick: number;
  readonly stagePhase: RunStateV1["stage"]["phase"];
  readonly runStatus: RunStateV1["runStatus"];
  readonly userPaused: boolean | null;
}

class FakeRunnerShell implements RunnerLaboratoryShellPort {
  readonly saves: SaveRecord[] = [];
  current: RunStateV1;
  nextSaveKind: "saved" | "unavailable" | "invalid" = "saved";
  currentMissing = false;

  constructor(state: RunStateV1) {
    this.current = state;
  }

  currentRunState(): RunStateV1 | null {
    return this.currentMissing ? null : this.current;
  }

  dropCurrent(): void {
    this.currentMissing = true;
  }

  enterRunnerLaboratory(): never {
    throw new Error("not used by an entered session");
  }

  restartRunnerLaboratory(): never {
    throw new Error("not used by an active session");
  }

  saveRunnerLaboratoryState(state: RunStateV1): RunnerLaboratoryCommitResult {
    const kind = this.nextSaveKind;
    this.nextSaveKind = "saved";
    if (kind === "invalid") {
      return {
        kind: "invalid",
        notice: { tone: "warning", message: "Rejected checkpoint." },
      };
    }
    this.current = state;
    this.saves.push(Object.freeze({
      simulationTick: state.simulationTick,
      stagePhase: state.stage.phase,
      runStatus: state.runStatus,
      userPaused: state.runner?.userPaused ?? null,
    }));
    return kind === "unavailable"
      ? {
          kind: "unavailable",
          state,
          notice: { tone: "warning", message: "Session-only checkpoint." },
        }
      : { kind: "saved", state };
  }

  replacePresentation(): void {
    this.current = deepFreeze({
      ...this.current,
      appearance: {
        ...this.current.appearance,
        hairStyleId: "wavy-bob" as const,
        clothingPaletteId: "ocean" as const,
      },
      accessibility: {
        ...this.current.accessibility,
        highContrast: true,
        textScale: 125 as const,
      },
    });
  }
}

class FakeClock implements RunnerSessionClockPort {
  now = 0;

  nowMilliseconds(): number {
    return this.now;
  }
}

class FakeAnimationFrame implements RunnerSessionAnimationFramePort {
  readonly callbacks = new Map<number, () => void>();
  readonly cancelled: number[] = [];
  maxPending = 0;
  #nextHandle = 1;

  constructor(private readonly clock: FakeClock) {}

  requestAnimationFrame(callback: () => void): number {
    const handle = this.#nextHandle++;
    this.callbacks.set(handle, callback);
    this.maxPending = Math.max(this.maxPending, this.callbacks.size);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  fireAt(timestampMilliseconds: number): void {
    if (this.callbacks.size !== 1) {
      throw new Error(`expected one pending frame, received ${this.callbacks.size}`);
    }
    const [handle, callback] = this.callbacks.entries().next().value as [number, () => void];
    this.callbacks.delete(handle);
    this.clock.now = timestampMilliseconds;
    callback();
  }
}

class FakeVisibilityTarget extends EventTarget implements VisibilityTarget {
  visibilityState: "visible" | "hidden" = "visible";

  setVisibility(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

class FakeFocusTarget extends EventTarget {
  focused = true;

  loseFocus(): void {
    this.focused = false;
    this.dispatchEvent(new Event("blur"));
  }

  gainFocus(): void {
    this.focused = true;
    this.dispatchEvent(new Event("focus"));
  }
}

interface Harness {
  readonly shell: FakeRunnerShell;
  readonly clock: FakeClock;
  readonly animationFrame: FakeAnimationFrame;
  readonly visibility: FakeVisibilityTarget;
  readonly focus: FakeFocusTarget;
  readonly session: RunnerSession;
}

function createHarness(state: RunStateV1): Harness {
  const shell = new FakeRunnerShell(state);
  const clock = new FakeClock();
  const animationFrame = new FakeAnimationFrame(clock);
  const visibility = new FakeVisibilityTarget();
  const focus = new FakeFocusTarget();
  const session = createRunnerSession({
    shell,
    clock,
    animationFrame,
    lifecycle: {
      visibilityTarget: visibility,
      focusTarget: focus,
      isFocused: () => focus.focused,
    },
  });
  return { shell, clock, animationFrame, visibility, focus, session };
}

function semanticMarkerState(): RunStateV1 {
  const initial = entry("semantic-assist");
  const context = createRunnerSimulationContext(initial.runSeed, initial.difficulty);
  let state = startRunnerLaboratory(context, initial).state;
  for (let safety = 0; safety < 1_000; safety += 1) {
    const result = advanceRunnerLaboratory(context, state);
    if (result.noOpReason === "semantic-decision-pending") return state;
    state = result.state;
  }
  throw new Error("Semantic marker did not open");
}

describe("runner session", () => {
  it("persists zero-tick Start and consumes at most one queued Manual intent per logical tick", () => {
    const harness = createHarness(entry("manual"));
    const { session, shell, animationFrame } = harness;
    const snapshots: ReturnType<RunnerSession["getSnapshot"]>[] = [];
    session.subscribe((snapshot) => snapshots.push(snapshot));

    expect(session.getSnapshot()).toMatchObject({
      status: "awaiting-start",
      started: false,
      pauseReasons: ["user"],
    });
    expect(isDeepFrozen(session.getSnapshot())).toBe(true);
    expect(session.requestLaneIntent("up")).toBe(false);
    animationFrame.fireAt(0);
    expect(session.getSnapshot().state.simulationTick).toBe(0);

    expect(session.start()).toBe(true);
    expect(shell.saves).toEqual([{
      simulationTick: 0,
      stagePhase: "active",
      runStatus: "active",
      userPaused: false,
    }]);
    expect(session.getSnapshot().events.map((event) => event.type))
      .toEqual(["start-acknowledged"]);

    expect(session.requestLaneIntent("up")).toBe(true);
    expect(session.requestLaneIntent("down")).toBe(false);
    animationFrame.fireAt(100);
    expect(session.getSnapshot().state.simulationTick).toBe(0);
    animationFrame.fireAt(120);
    expect(session.getSnapshot().state.simulationTick).toBe(1);
    expect(session.getSnapshot().state.runner?.motion).toMatchObject({
      kind: "moving",
      sourceLane: 1,
      targetLane: 0,
      elapsedTicks: 1,
    });

    expect(session.requestLaneIntent("down")).toBe(true);
    expect(session.requestLaneIntent("up")).toBe(false);
    animationFrame.fireAt(220);
    const requests = session.getSnapshot().events.flatMap((event) =>
      event.type === "lane-stepped" ? [event.request] : []);
    expect(requests).toEqual(["down", null, null, null, null]);
    expect(session.getSnapshot().state.simulationTick).toBe(6);
    expect(shell.saves).toHaveLength(7);
    expect(animationFrame.maxPending).toBe(1);
    expect(snapshots.every((candidate) => isDeepFrozen(candidate))).toBe(true);
    session.dispose();
  });

  it.each([
    "hidden-then-blur",
    "blur-then-hidden",
  ] as const)("coalesces one %s tab-hide interruption and persists only the user pause toggle", (order) => {
    const harness = createHarness(entry("manual"));
    const { session, shell, animationFrame, visibility, focus } = harness;
    expect(session.start()).toBe(true);

    if (order === "hidden-then-blur") {
      visibility.setVisibility("hidden");
      focus.loseFocus();
    } else {
      focus.loseFocus();
      visibility.setVisibility("hidden");
    }
    animationFrame.fireAt(0);
    expect(session.getSnapshot().pauseReasons).toEqual(["visibility"]);
    expect(shell.saves).toHaveLength(1);

    visibility.setVisibility("visible");
    expect(session.resumeInterruption("visibility")).toBe(false);
    focus.gainFocus();
    expect(session.resumeInterruption("focus-interruption")).toBe(false);
    expect(session.resumeInterruption("visibility")).toBe(true);
    expect(session.getSnapshot().pauseReasons).toEqual([]);
    expect(shell.saves).toHaveLength(1);

    expect(session.setUserPaused(true)).toBe(true);
    expect(session.setModalOpen(true)).toBe(true);
    expect(session.getSnapshot().pauseReasons).toEqual(["user", "modal"]);
    expect(shell.current.runner?.userPaused).toBe(true);
    expect(shell.saves).toHaveLength(2);
    expect(session.setUserPaused(false)).toBe(true);
    expect(session.getSnapshot().pauseReasons).toEqual(["modal"]);
    expect(shell.current.runner?.userPaused).toBe(false);
    expect(shell.saves).toHaveLength(3);
    expect(session.setModalOpen(false)).toBe(true);

    animationFrame.fireAt(20);
    expect(session.getSnapshot().state.simulationTick).toBe(0);
    animationFrame.fireAt(40);
    expect(session.getSnapshot().state.simulationTick).toBe(1);
    session.dispose();
  });

  it("holds a Semantic marker as a runtime pause and commits one atomic choice", () => {
    const before = semanticMarkerState();
    const harness = createHarness(before);
    const { session, shell } = harness;
    const marker = before.runner?.activeEntities.find((entity) =>
      entity.kind === "opportunity");
    expect(marker).toBeDefined();
    expect(session.getSnapshot().pauseReasons).toEqual(["semantic"]);

    expect(session.setModalOpen(true)).toBe(true);
    expect(session.chooseLane(1)).toBe(false);
    expect(shell.saves).toHaveLength(0);
    expect(session.getSnapshot().state.runner?.activeEntities)
      .toContainEqual(marker);

    expect(session.setModalOpen(false)).toBe(true);
    expect(session.chooseLane(1)).toBe(true);
    expect(shell.saves).toHaveLength(1);
    expect(session.getSnapshot().state.simulationTick)
      .toBe(before.simulationTick + 1);
    expect(session.getSnapshot().state.runner?.spawn.resolvedEntityIds)
      .toContain(marker?.instanceId);
    expect(session.getSnapshot().pauseReasons).toEqual([]);
    expect(session.getSnapshot().events.map((event) => event.type)).toEqual([
      "decision-marker-resolved",
      "lane-stepped",
      "clock-advanced",
    ]);
    session.dispose();
  });

  it("acknowledges modal idempotence, clears input, and detects a reentrant close", () => {
    const harness = createHarness(entry("manual"));
    const { session } = harness;
    expect(session.start()).toBe(true);
    expect(session.requestLaneIntent("down")).toBe(true);
    const delivered: ReturnType<RunnerSession["getSnapshot"]>[] = [];
    const unsubscribe = session.subscribe((next) => delivered.push(next));

    expect(session.setModalOpen(true)).toBe(true);
    expect(session.getSnapshot().queuedLaneIntent).toBeNull();
    expect(session.getSnapshot().pauseReasons).toContain("modal");
    const afterOpen = delivered.length;
    expect(session.setModalOpen(true)).toBe(true);
    expect(delivered).toHaveLength(afterOpen);
    expect(session.setModalOpen(false)).toBe(true);
    const afterClose = delivered.length;
    expect(session.setModalOpen(false)).toBe(true);
    expect(delivered).toHaveLength(afterClose);

    let closeReentered = false;
    let reentrantCloseResult: boolean | null = null;
    const stopRace = session.subscribe((next) => {
      if (!closeReentered && next.pauseReasons.includes("modal")) {
        closeReentered = true;
        reentrantCloseResult = session.setModalOpen(false);
      }
    });
    expect(session.setModalOpen(true)).toBe(false);
    expect(closeReentered).toBe(true);
    expect(reentrantCloseResult).toBe(true);
    expect(session.getSnapshot().pauseReasons).not.toContain("modal");
    stopRace();
    expect(() => session.setModalOpen("open" as never)).toThrow(/boolean/);

    unsubscribe();
    session.dispose();
    expect(session.setModalOpen(true)).toBe(false);
  });

  it("routes Automatic decisions only through the authenticated oracle wrapper", () => {
    const harness = createHarness(entry("automatic-assist"));
    const { session, shell, animationFrame } = harness;
    expect(session.start()).toBe(true);
    expect(session.requestLaneIntent("up")).toBe(false);
    expect(session.chooseLane(0)).toBe(false);

    shell.replacePresentation();
    expect(session.refreshPresentationState()).toBe(true);
    expect(session.getSnapshot().state.simulationTick).toBe(0);

    animationFrame.fireAt(0);
    let automaticDecision = false;
    for (let tick = 1; tick <= 1_000 && !automaticDecision; tick += 1) {
      animationFrame.fireAt(tick * 20);
      automaticDecision = session.getSnapshot().events.some((event) =>
        event.type === "decision-marker-resolved" &&
        event.controlMode === "automatic-assist");
    }
    expect(automaticDecision).toBe(true);
    expect(session.getSnapshot().state.controlMode).toBe("automatic-assist");
    session.dispose();
  });

  it("saves tick 3000 pending and applies settlement on the next separate frame", () => {
    const harness = createHarness(entry("manual"));
    const { session, shell, animationFrame } = harness;
    expect(session.start()).toBe(true);
    animationFrame.fireAt(0);

    for (let frame = 1; frame <= 600; frame += 1) {
      animationFrame.fireAt(frame * 100);
    }
    expect(session.getSnapshot().state).toMatchObject({
      runStatus: "active",
      simulationTick: 3000,
      stage: { phase: "settling", settlement: { status: "pending" } },
    });
    expect(session.getSnapshot().events.map((event) => event.type))
      .toContain("settlement-pending");
    expect(shell.saves).toHaveLength(3_001);
    expect(shell.saves.at(-1)).toMatchObject({
      simulationTick: 3000,
      stagePhase: "settling",
      runStatus: "active",
    });
    expect(animationFrame.callbacks.size).toBe(1);

    animationFrame.fireAt(60_020);
    expect(session.getSnapshot().state).toMatchObject({
      runStatus: "completed",
      simulationTick: 3000,
      stage: { phase: "complete", settlement: { status: "applied" } },
      runner: null,
    });
    expect(session.getSnapshot().events.map((event) => event.type))
      .toEqual(["settlement-applied"]);
    expect(shell.saves).toHaveLength(3_002);
    expect(animationFrame.callbacks.size).toBe(0);
    expect(animationFrame.maxPending).toBe(1);
    session.dispose();
  });

  it("merges presentation-only changes without resetting simulation and disposes cleanly", () => {
    const harness = createHarness(entry("manual"));
    const { session, shell, animationFrame, visibility, focus } = harness;
    const delivered: ReturnType<RunnerSession["getSnapshot"]>[] = [];
    const unsubscribe = session.subscribe((snapshot) => delivered.push(snapshot));
    expect(session.start()).toBe(true);
    animationFrame.fireAt(0);
    animationFrame.fireAt(20);
    const before = session.getSnapshot().state;

    shell.replacePresentation();
    expect(session.refreshPresentationState()).toBe(true);
    expect(session.getSnapshot().state.simulationTick).toBe(before.simulationTick);
    expect(session.getSnapshot().state.runner).toEqual(before.runner);
    expect(session.getSnapshot().state.appearance).toMatchObject({
      hairStyleId: "wavy-bob",
      clothingPaletteId: "ocean",
    });
    expect(session.getSnapshot().state.accessibility).toMatchObject({
      highContrast: true,
      textScale: 125,
    });

    shell.nextSaveKind = "unavailable";
    animationFrame.fireAt(40);
    expect(session.getSnapshot().state.simulationTick).toBe(2);
    expect(session.getSnapshot().notice).toEqual({
      tone: "warning",
      message: "Session-only checkpoint.",
    });
    expect(isDeepFrozen(session.getSnapshot().notice)).toBe(true);
    expect(isDeepFrozen(session.getSnapshot().events)).toBe(true);

    const beforeDispose = delivered.length;
    session.dispose();
    expect(session.getSnapshot().status).toBe("disposed");
    expect(animationFrame.callbacks.size).toBe(0);
    expect(animationFrame.cancelled).toHaveLength(1);
    visibility.setVisibility("hidden");
    focus.loseFocus();
    expect(delivered).toHaveLength(beforeDispose + 1);
    unsubscribe();
  });

  it("faults instead of resurrecting a run removed from the shell", () => {
    const harness = createHarness(entry("manual"));
    const { session, shell, animationFrame } = harness;
    expect(session.start()).toBe(true);
    shell.dropCurrent();

    expect(session.refreshPresentationState()).toBe(false);
    expect(session.getSnapshot()).toMatchObject({
      status: "faulted",
      notice: {
        tone: "error",
        message: "The active runner changed outside this session.",
      },
    });
    expect(animationFrame.callbacks.size).toBe(0);
    expect(animationFrame.cancelled).toHaveLength(1);
    expect(session.setModalOpen(true)).toBe(false);
    session.dispose();
  });

  it("stops without a gameplay mutation when presentation integrity fails", () => {
    const { session, shell, animationFrame } = createHarness(entry("manual"));
    expect(session.start()).toBe(true);
    const before = session.getSnapshot().state;
    const saveCount = shell.saves.length;

    expect(session.reportPresentationFault(
      "The runner warning could not be verified. Return to the title.",
    )).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      status: "faulted",
      notice: {
        tone: "error",
        message: "The runner warning could not be verified. Return to the title.",
      },
    });
    expect(session.getSnapshot().state).toBe(before);
    expect(shell.saves).toHaveLength(saveCount);
    expect(animationFrame.callbacks.size).toBe(0);
    expect(animationFrame.cancelled).toHaveLength(1);
    expect(session.reportPresentationFault("A second fault.")).toBe(false);
    expect(() => session.reportPresentationFault("   ")).toThrow(/invalid/);
    session.dispose();
  });

  it("transactionally removes an initial subscriber that throws", () => {
    const harness = createHarness(entry("manual"));
    const { session } = harness;
    const failure = new Error("presentation subscriber failed");
    const throwing = vi.fn(() => {
      throw failure;
    });

    expect(() => session.subscribe(throwing)).toThrow(failure);
    expect(throwing).toHaveBeenCalledOnce();
    expect(session.start()).toBe(true);
    expect(throwing).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe("running");
    session.dispose();
  });
});
