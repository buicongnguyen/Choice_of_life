import { describe, expect, it } from "vitest";

import type { LaneIntent } from "../core/runner/lane-controller";
import {
  RUNNER_SWIPE_THRESHOLD_CSS_PX,
  createRunnerKeyboardBindings,
  createRunnerSwipeRecognizer,
  handleRunnerKeydown,
  requestRunnerButtonIntent,
  runnerInputGateAllowsIntent,
  type RunnerInputGate,
  type RunnerKeydownLike,
  type RunnerSwipePointerLike,
} from "./runner-input";

const OPEN_GATE: RunnerInputGate = Object.freeze({
  started: true,
  controlMode: "manual",
  pauseReasons: Object.freeze([]),
  dialogOpen: false,
  runStatus: "active",
  stagePhase: "active",
});

function keyEvent(overrides: Partial<RunnerKeydownLike> = {}): RunnerKeydownLike & { prevented: boolean } {
  const event = {
    code: "ArrowUp",
    key: "ArrowUp",
    repeat: false,
    prevented: false,
    preventDefault(): void { event.prevented = true; },
    ...overrides,
  };
  return event;
}

function pointer(
  pointerId: number,
  clientX: number,
  clientY: number,
  overrides: Partial<RunnerSwipePointerLike> = {},
): RunnerSwipePointerLike & { prevented: boolean } {
  const event = {
    pointerId,
    clientX,
    clientY,
    isPrimary: true,
    button: 0,
    prevented: false,
    preventDefault(): void { event.prevented = true; },
    ...overrides,
  };
  return event;
}

function acceptInto(intents: string[]) {
  return (intent: Exclude<LaneIntent, null>): boolean => {
    intents.push(intent);
    return true;
  };
}

describe("runner input adapters", () => {
  it("keeps arrows immutable, remaps only one in-memory supplemental key, and resets defaults", () => {
    const bindings = createRunnerKeyboardBindings();
    expect(bindings.snapshot()).toMatchObject({
      instructions: { "lane-up": "Up arrow or W", "lane-down": "Down arrow or S" },
      ariaKeyshortcuts: { "lane-up": "ArrowUp W", "lane-down": "ArrowDown S" },
    });
    expect(bindings.remap("lane-up", { code: "KeyI", key: "i" })).toMatchObject({
      ok: true,
      snapshot: {
        instructions: { "lane-up": "Up arrow or I" },
        ariaKeyshortcuts: { "lane-up": "ArrowUp I" },
      },
    });
    expect(bindings.commandForCode("ArrowUp")).toBe("lane-up");
    expect(bindings.commandForCode("KeyW")).toBeNull();
    expect(bindings.commandForCode("KeyI")).toBe("lane-up");
    expect(bindings.reset().instructions["lane-up"]).toBe("Up arrow or W");
  });

  it.each([
    [{ code: "Tab", key: "Tab" }, "reserved"],
    [{ code: "Escape", key: "Escape" }, "reserved"],
    [{ code: "Enter", key: "Enter" }, "reserved"],
    [{ code: "Space", key: " " }, "reserved"],
    [{ code: "ArrowDown", key: "ArrowDown" }, "reserved"],
    [{ code: "KeyS", key: "s" }, "duplicate"],
    [{ code: "KeyI", key: "i", ctrlKey: true }, "modifier-chord"],
  ] as const)("rejects unsafe or duplicate remap %#", (candidate, reason) => {
    const bindings = createRunnerKeyboardBindings();
    expect(bindings.remap("lane-up", candidate)).toMatchObject({ ok: false, reason });
    expect(bindings.snapshot().instructions["lane-up"]).toBe("Up arrow or W");
  });

  it("unifies keyboard and native-button domain intents and prevents only accepted keys", () => {
    const bindings = createRunnerKeyboardBindings();
    const intents: string[] = [];
    const accepted = keyEvent();
    expect(handleRunnerKeydown(accepted, bindings, OPEN_GATE, acceptInto(intents))).toBe(true);
    expect(accepted.prevented).toBe(true);
    expect(requestRunnerButtonIntent("lane-down", OPEN_GATE, acceptInto(intents))).toBe(true);
    expect(intents).toEqual(["up", "down"]);

    for (const blocked of [
      keyEvent({ repeat: true }),
      keyEvent({ ctrlKey: true }),
      keyEvent({ shiftKey: true }),
      keyEvent({ code: "KeyQ", key: "q" }),
    ]) {
      expect(handleRunnerKeydown(blocked, bindings, OPEN_GATE, () => true)).toBe(false);
      expect(blocked.prevented).toBe(false);
    }

    const textInput = keyEvent({
      target: { matches: () => true } as unknown as EventTarget,
    });
    expect(handleRunnerKeydown(textInput, bindings, OPEN_GATE, () => true)).toBe(false);
    expect(textInput.prevented).toBe(false);

    const queueRejected = keyEvent();
    expect(handleRunnerKeydown(
      queueRejected,
      bindings,
      OPEN_GATE,
      () => false,
    )).toBe(false);
    expect(queueRejected.prevented).toBe(false);
    expect(requestRunnerButtonIntent(
      "lane-up",
      OPEN_GATE,
      () => false,
    )).toBe(false);
  });

  it("ignores keys from inherited and composed-path editable content", () => {
    const bindings = createRunnerKeyboardBindings();
    const intents: string[] = [];
    const editableAncestor = {};
    const inheritedEditable = keyEvent({
      target: {
        matches: () => false,
        closest: (selector: string) => selector.includes("contenteditable")
          ? editableAncestor
          : null,
      } as unknown as EventTarget,
    });
    expect(handleRunnerKeydown(
      inheritedEditable,
      bindings,
      OPEN_GATE,
      acceptInto(intents),
    )).toBe(false);
    expect(inheritedEditable.prevented).toBe(false);

    const inheritedEditableState = keyEvent({
      target: {
        matches: () => false,
        isContentEditable: true,
      } as unknown as EventTarget,
    });
    expect(handleRunnerKeydown(
      inheritedEditableState,
      bindings,
      OPEN_GATE,
      acceptInto(intents),
    )).toBe(false);
    expect(inheritedEditableState.prevented).toBe(false);

    const shadowChild = { matches: () => false } as unknown as EventTarget;
    const editableHost = {
      matches: (selector: string) => selector.includes("contenteditable"),
    } as unknown as EventTarget;
    const composedEditable = keyEvent({
      target: shadowChild,
      composedPath: () => [shadowChild, editableHost],
    });
    expect(handleRunnerKeydown(
      composedEditable,
      bindings,
      OPEN_GATE,
      acceptInto(intents),
    )).toBe(false);
    expect(composedEditable.prevented).toBe(false);
    expect(intents).toEqual([]);
  });

  it("blocks every locked non-gameplay context", () => {
    const variants: RunnerInputGate[] = [
      { ...OPEN_GATE, started: false },
      { ...OPEN_GATE, controlMode: "semantic-assist" },
      { ...OPEN_GATE, controlMode: "automatic-assist" },
      { ...OPEN_GATE, pauseReasons: ["visibility"] },
      { ...OPEN_GATE, dialogOpen: true },
      { ...OPEN_GATE, stagePhase: "settling" },
      { ...OPEN_GATE, stagePhase: "complete", runStatus: "completed" },
    ];
    for (const gate of variants) expect(runnerInputGateAllowsIntent(gate)).toBe(false);
    expect(runnerInputGateAllowsIntent(OPEN_GATE)).toBe(true);
  });

  it("recognizes one dominant 24px vertical swipe and suppresses one synthesized click", () => {
    const intents: string[] = [];
    const recognizer = createRunnerSwipeRecognizer(
      () => OPEN_GATE,
      acceptInto(intents),
    );
    recognizer.pointerDown(pointer(1, 100, 100));
    const short = pointer(1, 100, 100 - RUNNER_SWIPE_THRESHOLD_CSS_PX + 1);
    expect(recognizer.pointerMove(short).consumed).toBe(false);
    expect(short.prevented).toBe(false);
    const valid = pointer(1, 105, 100 - RUNNER_SWIPE_THRESHOLD_CSS_PX);
    expect(recognizer.pointerMove(valid)).toMatchObject({
      acceptedIntent: "up",
      consumed: true,
      suppressNextClick: true,
    });
    expect(valid.prevented).toBe(true);
    expect(intents).toEqual(["up"]);
    expect(recognizer.pointerMove(pointer(1, 105, 40)).consumed).toBe(false);
    recognizer.pointerUp({ pointerId: 1 });
    expect(recognizer.consumeSynthesizedClick()).toBe(true);
    expect(recognizer.consumeSynthesizedClick()).toBe(false);
  });

  it("does not consume horizontal, cancelled, lost-capture, disabled, or multi-pointer sequences", () => {
    const intents: string[] = [];
    let gate = OPEN_GATE;
    const recognizer = createRunnerSwipeRecognizer(
      () => gate,
      acceptInto(intents),
    );
    recognizer.pointerDown(pointer(1, 0, 0));
    expect(recognizer.pointerMove(pointer(1, 30, 24)).consumed).toBe(false);
    recognizer.pointerCancel({ pointerId: 1 });

    gate = { ...OPEN_GATE, pauseReasons: ["modal"] };
    recognizer.pointerDown(pointer(2, 0, 0));
    const disabled = pointer(2, 0, 30);
    expect(recognizer.pointerMove(disabled).consumed).toBe(false);
    expect(disabled.prevented).toBe(false);
    recognizer.lostPointerCapture({ pointerId: 2 });

    gate = OPEN_GATE;
    recognizer.pointerDown(pointer(3, 0, 0));
    recognizer.pointerDown(pointer(4, 0, 0));
    expect(recognizer.pointerMove(pointer(3, 0, -30)).consumed).toBe(false);
    recognizer.pointerUp({ pointerId: 3 });
    expect(recognizer.pointerMove(pointer(4, 0, 30)).consumed).toBe(false);
    recognizer.pointerUp({ pointerId: 4 });
    expect(intents).toEqual([]);
  });

  it("permanently cancels a swipe sequence that begins or moves while input is blocked", () => {
    const intents: string[] = [];
    let gate: RunnerInputGate = { ...OPEN_GATE, pauseReasons: ["modal"] };
    const recognizer = createRunnerSwipeRecognizer(
      () => gate,
      acceptInto(intents),
    );

    recognizer.pointerDown(pointer(1, 0, 0));
    gate = OPEN_GATE;
    expect(recognizer.pointerMove(pointer(1, 0, -30)).consumed).toBe(false);
    recognizer.pointerUp({ pointerId: 1 });

    recognizer.pointerDown(pointer(2, 0, 0));
    gate = { ...OPEN_GATE, pauseReasons: ["user"] };
    expect(recognizer.pointerMove(pointer(2, 0, -10)).consumed).toBe(false);
    gate = OPEN_GATE;
    expect(recognizer.pointerMove(pointer(2, 0, -30)).consumed).toBe(false);
    recognizer.pointerUp({ pointerId: 2 });

    expect(intents).toEqual([]);
  });
});
