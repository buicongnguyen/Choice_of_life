// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { LaneIntent } from "../core/runner/lane-controller";
import {
  mountRunnerInputDom,
  type RunnerInputDomAdapter,
  type RunnerInputDomMountOptions,
} from "./runner-input-dom";
import type { RunnerInputGate } from "./runner-input";

const OPEN_GATE: RunnerInputGate = Object.freeze({
  started: true,
  controlMode: "manual",
  pauseReasons: Object.freeze([]),
  dialogOpen: false,
  runStatus: "active",
  stagePhase: "active",
});

const mountedAdapters: RunnerInputDomAdapter[] = [];

afterEach(() => {
  for (const adapter of mountedAdapters.splice(0)) adapter.dispose();
  document.body.replaceChildren();
});

interface Fixture {
  readonly root: HTMLElement;
  readonly surface: HTMLElement;
  readonly up: HTMLButtonElement;
  readonly down: HTMLButtonElement;
}

function fixture(): Fixture {
  const root = document.createElement("section");
  const surface = document.createElement("div");
  const up = document.createElement("button");
  const down = document.createElement("button");
  up.type = "button";
  down.type = "button";
  up.textContent = "Move up";
  down.textContent = "Move down";
  root.append(surface, up, down);
  document.body.append(root);
  return { root, surface, up, down };
}

function mount(
  dom: Fixture,
  gate: () => RunnerInputGate,
  accept: (intent: Exclude<LaneIntent, null>) => void,
  overrides: Partial<RunnerInputDomMountOptions> = {},
): RunnerInputDomAdapter {
  const adapter = mountRunnerInputDom({
    root: dom.root,
    playSurface: dom.surface,
    laneUpButton: dom.up,
    laneDownButton: dom.down,
    window,
    document,
    gate,
    accept: (intent) => {
      accept(intent);
      return true;
    },
    onEscape: () => false,
    ...overrides,
  });
  mountedAdapters.push(adapter);
  return adapter;
}

function keydown(
  code: string,
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    key: code,
  });
  target.dispatchEvent(event);
  return event;
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  overrides: Partial<Pick<PointerEvent, "isPrimary" | "button">> = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: overrides.isPrimary ?? true },
    button: { value: overrides.button ?? 0 },
  });
  return event;
}

function click(target: EventTarget): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function captureSpies(surface: HTMLElement) {
  let captured: number | null = null;
  const setPointerCapture = vi.fn((pointerId: number) => {
    captured = pointerId;
  });
  const hasPointerCapture = vi.fn((pointerId: number) =>
    captured === pointerId);
  const releasePointerCapture = vi.fn((pointerId: number) => {
    if (captured === pointerId) captured = null;
  });
  Object.assign(surface, {
    setPointerCapture,
    hasPointerCapture,
    releasePointerCapture,
  });
  return { setPointerCapture, hasPointerCapture, releasePointerCapture };
}

describe("runner DOM input adapter", () => {
  it("mounts keyboard and native-button parity and blocks both at the gate", () => {
    const dom = fixture();
    const intents: string[] = [];
    let gate = OPEN_GATE;
    mount(dom, () => gate, (intent) => intents.push(intent));

    const upKey = keydown("ArrowUp");
    expect(upKey.defaultPrevented).toBe(true);
    const downClick = click(dom.down);
    expect(downClick.defaultPrevented).toBe(true);
    expect(intents).toEqual(["up", "down"]);

    gate = { ...OPEN_GATE, dialogOpen: true };
    const blockedKey = keydown("ArrowDown");
    const blockedClick = click(dom.up);
    expect(blockedKey.defaultPrevented).toBe(false);
    expect(blockedClick.defaultPrevented).toBe(false);
    expect(intents).toEqual(["up", "down"]);
  });

  it("leaves keyboard, button, and swipe defaults untouched when the session rejects the intent", () => {
    const dom = fixture();
    const capture = captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, () => undefined, {
      accept: () => false,
    });

    expect(keydown("ArrowUp").defaultPrevented).toBe(false);
    expect(click(dom.down).defaultPrevented).toBe(false);

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 19, 100, 100));
    const rejectedMove = pointerEvent("pointermove", 19, 100, 70);
    window.dispatchEvent(rejectedMove);
    window.dispatchEvent(pointerEvent("pointerup", 19, 100, 70));
    expect(rejectedMove.defaultPrevented).toBe(false);
    expect(click(dom.surface).defaultPrevented).toBe(false);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(19);
  });

  it("ignores editable keyboard and interactive pointer contexts", () => {
    const dom = fixture();
    const editable = document.createElement("div");
    const editableChild = document.createElement("span");
    editable.setAttribute("contenteditable", "true");
    editable.append(editableChild);
    dom.surface.append(editable);
    const nestedButton = document.createElement("button");
    const buttonChild = document.createElement("span");
    nestedButton.append(buttonChild);
    dom.surface.append(nestedButton);
    const intents: string[] = [];
    const capture = captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    expect(keydown("ArrowUp", editableChild).defaultPrevented).toBe(false);
    expect(keydown("ArrowDown", buttonChild).defaultPrevented).toBe(true);
    editableChild.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0));
    window.dispatchEvent(pointerEvent("pointermove", 1, 0, -30));
    buttonChild.dispatchEvent(pointerEvent("pointerdown", 2, 0, 0));
    window.dispatchEvent(pointerEvent("pointermove", 2, 0, 30));

    expect(capture.setPointerCapture).not.toHaveBeenCalled();
    expect(intents).toEqual(["down"]);
  });

  it("retains Arrow gameplay input while the persistent Pause button is focused", () => {
    const dom = fixture();
    const pause = document.createElement("button");
    pause.type = "button";
    pause.textContent = "Pause";
    dom.root.append(pause);
    const intents: string[] = [];
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    pause.focus();
    expect(document.activeElement).toBe(pause);
    const event = keydown("ArrowUp", pause);
    expect(event.defaultPrevented).toBe(true);
    expect(intents).toEqual(["up"]);
  });

  it("uses Escape to request persisted user pause only when no modal consumes it", () => {
    const dom = fixture();
    let gate = OPEN_GATE;
    const pause = vi.fn(() => true);
    mount(dom, () => gate, () => undefined, { onEscape: pause });

    const accepted = keydown("Escape");
    expect(accepted.defaultPrevented).toBe(true);
    expect(pause).toHaveBeenCalledOnce();

    gate = { ...OPEN_GATE, dialogOpen: true };
    const modalEscape = keydown("Escape");
    expect(modalEscape.defaultPrevented).toBe(false);
    expect(pause).toHaveBeenCalledOnce();

    gate = OPEN_GATE;
    pause.mockReturnValue(false);
    const rejected = keydown("Escape");
    expect(rejected.defaultPrevented).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("captures one primary swipe, emits once, releases, and suppresses one click", () => {
    const dom = fixture();
    const intents: string[] = [];
    const capture = captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 7, 100, 100));
    const move = pointerEvent("pointermove", 7, 105, 76);
    window.dispatchEvent(move);
    window.dispatchEvent(pointerEvent("pointermove", 7, 105, 50));
    window.dispatchEvent(pointerEvent("pointerup", 7, 105, 50));

    expect(move.defaultPrevented).toBe(true);
    expect(intents).toEqual(["up"]);
    expect(capture.setPointerCapture).toHaveBeenCalledOnce();
    expect(capture.setPointerCapture).toHaveBeenCalledWith(7);
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);

    const synthesized = click(dom.surface);
    expect(synthesized.defaultPrevented).toBe(true);
    expect(intents).toEqual(["up"]);
    click(dom.down);
    expect(intents).toEqual(["up", "down"]);
  });

  it("cancels pointercancel and lost capture without allowing later movement", () => {
    for (const cancellation of ["pointercancel", "lostpointercapture"] as const) {
      const dom = fixture();
      const intents: string[] = [];
      const capture = captureSpies(dom.surface);
      const adapter = mount(
        dom,
        () => OPEN_GATE,
        (intent) => intents.push(intent),
      );

      dom.surface.dispatchEvent(pointerEvent("pointerdown", 3, 0, 0));
      const target = cancellation === "lostpointercapture" ? dom.surface : window;
      target.dispatchEvent(pointerEvent(cancellation, 3, 0, 0));
      window.dispatchEvent(pointerEvent("pointermove", 3, 0, -40));
      expect(intents).toEqual([]);
      expect(click(dom.surface).defaultPrevented).toBe(true);
      expect(intents).toEqual([]);
      click(dom.up);
      expect(intents).toEqual(["up"]);
      if (cancellation === "pointercancel") {
        expect(capture.releasePointerCapture).toHaveBeenCalledWith(3);
      } else {
        expect(capture.releasePointerCapture).not.toHaveBeenCalled();
      }

      adapter.dispose();
      dom.root.remove();
    }
  });

  it("permanently cancels at a blocked boundary, including pointerup", () => {
    const dom = fixture();
    const intents: string[] = [];
    const capture = captureSpies(dom.surface);
    let gate = OPEN_GATE;
    const adapter = mount(dom, () => gate, (intent) => intents.push(intent));

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 11, 0, 0));
    gate = { ...OPEN_GATE, pauseReasons: ["modal"] };
    adapter.syncGate();
    gate = OPEN_GATE;
    window.dispatchEvent(pointerEvent("pointermove", 11, 0, -40));
    expect(intents).toEqual([]);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(11);
    expect(click(dom.surface).defaultPrevented).toBe(true);
    window.dispatchEvent(pointerEvent("pointerup", 11, 0, -40));

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 12, 0, 0));
    gate = { ...OPEN_GATE, dialogOpen: true };
    window.dispatchEvent(pointerEvent("pointerup", 12, 0, 0));
    gate = OPEN_GATE;
    window.dispatchEvent(pointerEvent("pointermove", 12, 0, -40));
    expect(intents).toEqual([]);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(12);
  });

  it("cancels an active swipe when a second pointer starts outside the surface", () => {
    const dom = fixture();
    const outside = document.createElement("div");
    outside.textContent = "Outside the runner";
    document.body.append(outside);
    const intents: string[] = [];
    const capture = captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 51, 0, 0));
    outside.dispatchEvent(pointerEvent(
      "pointerdown",
      52,
      10,
      10,
      { isPrimary: false },
    ));
    window.dispatchEvent(pointerEvent("pointermove", 51, 0, -40));
    window.dispatchEvent(pointerEvent("pointermove", 52, 10, -40));

    expect(intents).toEqual([]);
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(51);
    expect(click(dom.surface).defaultPrevented).toBe(true);
  });

  it("blocks every new pointer until all physically held multitouch pointers release", () => {
    const dom = fixture();
    const outside = document.createElement("div");
    document.body.append(outside);
    const intents: string[] = [];
    captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 61, 0, 0));
    outside.dispatchEvent(pointerEvent(
      "pointerdown",
      62,
      5,
      5,
      { isPrimary: false },
    ));
    window.dispatchEvent(pointerEvent("pointerup", 61, 0, 0));

    // Pointer 62 is still physically held. A third pointer must not be able to
    // become the new primary sequence, even after the original primary ended.
    dom.surface.dispatchEvent(pointerEvent("pointerdown", 63, 0, 0));
    window.dispatchEvent(pointerEvent("pointermove", 63, 0, -50));
    window.dispatchEvent(pointerEvent("pointerup", 63, 0, -50));
    expect(intents).toEqual([]);

    // Releasing only pointer 62 closes the lock. A wholly new sequence works.
    window.dispatchEvent(pointerEvent("pointerup", 62, 5, 5));
    dom.surface.dispatchEvent(pointerEvent("pointerdown", 64, 0, 0));
    window.dispatchEvent(pointerEvent("pointermove", 64, 0, -50));
    window.dispatchEvent(pointerEvent("pointerup", 64, 0, -50));
    expect(intents).toEqual(["up"]);
  });

  it("updates remap metadata immediately and restores defaults on reset", () => {
    const dom = fixture();
    const intents: string[] = [];
    const snapshots: string[] = [];
    const adapter = mount(
      dom,
      () => OPEN_GATE,
      (intent) => intents.push(intent),
      {
        onBindingsChanged: (snapshot) =>
          snapshots.push(snapshot.instructions["lane-up"]),
      },
    );

    expect(dom.up.getAttribute("aria-keyshortcuts")).toBe("ArrowUp W");
    expect(adapter.remap("lane-up", { code: "KeyI", key: "i" }).ok)
      .toBe(true);
    expect(dom.up.getAttribute("aria-keyshortcuts")).toBe("ArrowUp I");
    expect(keydown("KeyW").defaultPrevented).toBe(false);
    expect(keydown("KeyI").defaultPrevented).toBe(true);
    expect(intents).toEqual(["up"]);

    adapter.resetBindings();
    expect(dom.up.getAttribute("aria-keyshortcuts")).toBe("ArrowUp W");
    expect(keydown("KeyW").defaultPrevented).toBe(true);
    expect(intents).toEqual(["up", "up"]);
    expect(snapshots).toEqual([
      "Up arrow or W",
      "Up arrow or I",
      "Up arrow or W",
    ]);
  });

  it("disposes idempotently, releases capture, restores DOM, and can remount", () => {
    const dom = fixture();
    dom.up.setAttribute("aria-keyshortcuts", "PageUp");
    dom.surface.style.setProperty("touch-action", "pan-y", "important");
    const intents: string[] = [];
    const capture = captureSpies(dom.surface);
    const adapter = mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));
    expect(dom.surface.style.getPropertyValue("touch-action")).toBe("pan-x");
    expect(dom.surface.style.getPropertyPriority("touch-action")).toBe("");
    dom.surface.dispatchEvent(pointerEvent("pointerdown", 21, 0, 0));

    adapter.dispose();
    adapter.dispose();
    expect(capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(dom.up.getAttribute("aria-keyshortcuts")).toBe("PageUp");
    expect(dom.down.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(dom.surface.style.getPropertyValue("touch-action")).toBe("pan-y");
    expect(dom.surface.style.getPropertyPriority("touch-action")).toBe("important");
    expect(() => adapter.remap("lane-up", { code: "KeyI", key: "i" }))
      .toThrow(/disposed/);
    keydown("ArrowUp");
    click(dom.down);
    dom.surface.dispatchEvent(pointerEvent("pointerdown", 22, 0, 0));
    window.dispatchEvent(pointerEvent("pointermove", 22, 0, -40));
    expect(intents).toEqual([]);

    const remounted = mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));
    expect(dom.surface.style.getPropertyValue("touch-action")).toBe("pan-x");
    expect(dom.surface.style.getPropertyPriority("touch-action")).toBe("");
    expect(keydown("ArrowUp").defaultPrevented).toBe(true);
    expect(intents).toEqual(["up"]);
    remounted.dispose();
    expect(dom.surface.style.getPropertyValue("touch-action")).toBe("pan-y");
    expect(dom.surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it("fails a capture safely and suppresses the canceled sequence click", () => {
    const dom = fixture();
    const intents: string[] = [];
    const releasePointerCapture = vi.fn();
    Object.assign(dom.surface, {
      setPointerCapture: vi.fn(() => {
        throw new Error("capture unavailable");
      }),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture,
    });
    mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));

    expect(() => dom.surface.dispatchEvent(
      pointerEvent("pointerdown", 31, 0, 0),
    )).not.toThrow();
    window.dispatchEvent(pointerEvent("pointermove", 31, 0, -40));
    expect(intents).toEqual([]);
    expect(releasePointerCapture).not.toHaveBeenCalled();
    expect(click(dom.surface).defaultPrevented).toBe(true);
    expect(intents).toEqual([]);
  });

  it("preserves a canceled swipe suppression across sibling control clicks", () => {
    const dom = fixture();
    const resume = document.createElement("button");
    resume.type = "button";
    resume.textContent = "Resume";
    dom.root.append(resume);
    const resumeClicks = vi.fn();
    resume.addEventListener("click", resumeClicks);
    captureSpies(dom.surface);
    mount(dom, () => OPEN_GATE, () => undefined);

    dom.surface.dispatchEvent(pointerEvent("pointerdown", 41, 0, 0));
    window.dispatchEvent(pointerEvent("pointercancel", 41, 0, 0));

    const resumeClick = click(resume);
    expect(resumeClick.defaultPrevented).toBe(false);
    expect(resumeClicks).toHaveBeenCalledOnce();

    const synthesizedSurfaceClick = click(dom.surface);
    expect(synthesizedSurfaceClick.defaultPrevented).toBe(true);
    const laterSurfaceClick = click(dom.surface);
    expect(laterSurfaceClick.defaultPrevented).toBe(false);
  });

  it("rolls back listeners, attributes, and ownership when mounting throws", () => {
    const dom = fixture();
    dom.up.setAttribute("aria-keyshortcuts", "PageUp");
    dom.surface.style.setProperty("touch-action", "pan-y");
    expect(() => mountRunnerInputDom({
      root: dom.root,
      playSurface: dom.surface,
      laneUpButton: dom.up,
      laneDownButton: dom.down,
      window,
      document,
      gate: () => OPEN_GATE,
      accept: () => true,
      onBindingsChanged: () => {
        throw new Error("consumer failed");
      },
    })).toThrow(/consumer failed/);
    expect(dom.up.getAttribute("aria-keyshortcuts")).toBe("PageUp");
    expect(dom.down.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(dom.surface.style.getPropertyValue("touch-action")).toBe("pan-y");

    const intents: string[] = [];
    const adapter = mount(dom, () => OPEN_GATE, (intent) => intents.push(intent));
    keydown("ArrowUp");
    expect(intents).toEqual(["up"]);
    adapter.dispose();
  });

  it("requires labelled native lane buttons", () => {
    const dom = fixture();
    const notAButton = document.createElement("div");
    notAButton.textContent = "Move up";
    dom.up.replaceWith(notAButton);
    expect(() => mountRunnerInputDom({
      root: dom.root,
      playSurface: dom.surface,
      laneUpButton: notAButton as unknown as HTMLButtonElement,
      laneDownButton: dom.down,
      window,
      document,
      gate: () => OPEN_GATE,
      accept: () => true,
    })).toThrow(/native HTML buttons/);

    const unlabeled = fixture();
    unlabeled.up.textContent = "";
    expect(() => mountRunnerInputDom({
      root: unlabeled.root,
      playSurface: unlabeled.surface,
      laneUpButton: unlabeled.up,
      laneDownButton: unlabeled.down,
      window,
      document,
      gate: () => OPEN_GATE,
      accept: () => true,
    })).toThrow(/accessible labels/);
  });

  it("rejects duplicate root or window ownership until the owner disposes", () => {
    const first = fixture();
    const firstAdapter = mount(first, () => OPEN_GATE, () => undefined);
    expect(() => mountRunnerInputDom({
      root: first.root,
      playSurface: first.surface,
      laneUpButton: first.up,
      laneDownButton: first.down,
      window,
      document,
      gate: () => OPEN_GATE,
      accept: () => true,
    })).toThrow(/root already owns/);

    const second = fixture();
    expect(() => mountRunnerInputDom({
      root: second.root,
      playSurface: second.surface,
      laneUpButton: second.up,
      laneDownButton: second.down,
      window,
      document,
      gate: () => OPEN_GATE,
      accept: () => true,
    })).toThrow(/window already owns/);

    firstAdapter.dispose();
    const secondAdapter = mount(
      second,
      () => OPEN_GATE,
      () => undefined,
    );
    secondAdapter.dispose();
  });
});
