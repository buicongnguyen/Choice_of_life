import type { LaneIntent } from "../core/runner/lane-controller";
import {
  createRunnerKeyboardBindings,
  createRunnerSwipeRecognizer,
  handleRunnerKeydown,
  requestRunnerButtonIntent,
  runnerInputGateAllowsIntent,
  type RunnerInputCommand,
  type RunnerInputGate,
  type RunnerKeyboardBindingSnapshot,
  type RunnerKeyboardBindings,
  type RunnerRemapKey,
  type RunnerRemapResult,
  type RunnerSwipeResult,
} from "./runner-input";

export interface RunnerInputDomMountOptions {
  readonly root: HTMLElement;
  readonly playSurface: HTMLElement;
  readonly laneUpButton: HTMLButtonElement;
  readonly laneDownButton: HTMLButtonElement;
  readonly window: Window;
  readonly document: Document;
  readonly gate: () => RunnerInputGate;
  readonly accept: (intent: Exclude<LaneIntent, null>) => boolean;
  /** Escape pauses the active runner when no modal has already consumed it. */
  readonly onEscape?: () => boolean;
  readonly onBindingsChanged?: (
    snapshot: RunnerKeyboardBindingSnapshot,
  ) => void;
}

export interface RunnerInputDomAdapter {
  snapshot(): RunnerKeyboardBindingSnapshot;
  remap(command: RunnerInputCommand, key: RunnerRemapKey): RunnerRemapResult;
  resetBindings(): RunnerKeyboardBindingSnapshot;
  /** Call after any gate transition so an in-flight pointer cannot resume. */
  syncGate(): void;
  dispose(): void;
}

const ACTIVE_ROOTS = new WeakMap<object, object>();
const ACTIVE_WINDOWS = new WeakMap<object, object>();

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
].join(", ");

type InteractiveCandidate = EventTarget & {
  closest?: (selector: string) => Element | null;
  readonly isContentEditable?: boolean;
};

type PointerCaptureSurface = HTMLElement & {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
};

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner DOM input: ${message}`);
  }
  throw new TypeError();
}

function eventPath(event: Event): readonly EventTarget[] {
  return typeof event.composedPath === "function"
    ? event.composedPath()
    : event.target === null
      ? []
      : [event.target];
}

function comesFromInteractiveContext(event: Event): boolean {
  return eventPath(event).some((target) => {
    const candidate = target as InteractiveCandidate;
    if (candidate.isContentEditable === true) return true;
    return typeof candidate.closest === "function" &&
      candidate.closest(INTERACTIVE_SELECTOR) !== null;
  });
}

function hasAccessibleButtonLabel(
  button: HTMLButtonElement,
  suppliedDocument: Document,
): boolean {
  if ((button.getAttribute("aria-label") ?? "").trim().length > 0) return true;
  const labelledBy = (button.getAttribute("aria-labelledby") ?? "")
    .trim()
    .split(/\s+/)
    .filter((id) => id.length > 0);
  if (labelledBy.some((id) =>
    (suppliedDocument.getElementById(id)?.textContent ?? "").trim().length > 0)) {
    return true;
  }
  return (button.textContent ?? "").trim().length > 0;
}

function isNativeButton(
  element: HTMLElement,
  suppliedDocument: Document,
): element is HTMLButtonElement {
  const nativeButtonPrototype = Object.getPrototypeOf(
    suppliedDocument.createElement("button"),
  ) as object;
  return element.localName === "button" &&
    nativeButtonPrototype.isPrototypeOf(element);
}

function assertMountElements(options: RunnerInputDomMountOptions): void {
  const {
    root,
    playSurface,
    laneUpButton,
    laneDownButton,
    window: suppliedWindow,
    document: suppliedDocument,
  } = options;
  if (
    suppliedDocument.defaultView !== suppliedWindow ||
    root.ownerDocument !== suppliedDocument ||
    playSurface.ownerDocument !== suppliedDocument ||
    laneUpButton.ownerDocument !== suppliedDocument ||
    laneDownButton.ownerDocument !== suppliedDocument
  ) {
    fail("window, document, root, surface, and buttons must share one DOM");
  }
  if (
    !isNativeButton(laneUpButton, suppliedDocument) ||
    !isNativeButton(laneDownButton, suppliedDocument)
  ) {
    fail("lane controls must be native HTML buttons");
  }
  if (
    !hasAccessibleButtonLabel(laneUpButton, suppliedDocument) ||
    !hasAccessibleButtonLabel(laneDownButton, suppliedDocument)
  ) {
    fail("lane buttons must have accessible labels");
  }
  if (
    !root.contains(playSurface) ||
    !root.contains(laneUpButton) ||
    !root.contains(laneDownButton)
  ) {
    fail("surface and lane buttons must be descendants of the supplied root");
  }
  if (
    laneUpButton === laneDownButton ||
    playSurface === laneUpButton ||
    playSurface === laneDownButton
  ) {
    fail("surface and lane buttons must be distinct elements");
  }
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  original: string | null,
): void {
  if (original === null) element.removeAttribute(name);
  else element.setAttribute(name, original);
}

/**
 * Mounts one scoped runner input owner. It never reads ambient globals and
 * refuses a second owner for the same root or window until disposal.
 */
export function mountRunnerInputDom(
  options: RunnerInputDomMountOptions,
): RunnerInputDomAdapter {
  assertMountElements(options);
  const {
    root,
    playSurface,
    laneUpButton,
    laneDownButton,
    window: suppliedWindow,
    gate,
    accept,
    onEscape,
    onBindingsChanged,
  } = options;
  if (ACTIVE_ROOTS.has(root)) fail("root already owns a runner input adapter");
  if (ACTIVE_WINDOWS.has(suppliedWindow)) {
    fail("window already owns a runner input adapter");
  }

  const ownership = Object.freeze({});
  ACTIVE_ROOTS.set(root, ownership);
  ACTIVE_WINDOWS.set(suppliedWindow, ownership);

  const bindings = createRunnerKeyboardBindings();
  const originalUpShortcuts = laneUpButton.getAttribute("aria-keyshortcuts");
  const originalDownShortcuts = laneDownButton.getAttribute("aria-keyshortcuts");
  const originalTouchAction = playSurface.style.getPropertyValue("touch-action");
  const originalTouchActionPriority =
    playSurface.style.getPropertyPriority("touch-action");
  const surface = playSurface as PointerCaptureSurface;
  let disposed = false;
  let pointerId: number | null = null;
  let captureHeld = false;
  let suppressCanceledSequenceClick = false;
  let blockPointersUntilAllReleased = false;
  const physicallyHeldPointerIds = new Set<number>();
  const globallyHandledPointerDowns = new WeakSet<Event>();

  const publishBindings = (
    snapshot: RunnerKeyboardBindingSnapshot,
  ): RunnerKeyboardBindingSnapshot => {
    laneUpButton.setAttribute(
      "aria-keyshortcuts",
      snapshot.ariaKeyshortcuts["lane-up"],
    );
    laneDownButton.setAttribute(
      "aria-keyshortcuts",
      snapshot.ariaKeyshortcuts["lane-down"],
    );
    onBindingsChanged?.(snapshot);
    return snapshot;
  };

  const safelyReleaseCapture = (releasedPointerId: number): void => {
    if (!captureHeld || typeof surface.releasePointerCapture !== "function") {
      captureHeld = false;
      return;
    }
    try {
      if (
        typeof surface.hasPointerCapture !== "function" ||
        surface.hasPointerCapture(releasedPointerId)
      ) {
        surface.releasePointerCapture(releasedPointerId);
      }
    } catch {
      // Losing capture races with pointercancel/lostpointercapture in browsers.
    } finally {
      captureHeld = false;
    }
  };

  const armClickSuppression = (result: RunnerSwipeResult): void => {
    if (result.suppressNextClick) suppressCanceledSequenceClick = true;
  };

  const cancelPointer = (suppressClick: boolean): void => {
    if (pointerId === null) return;
    const canceledPointerId = pointerId;
    pointerId = null;
    const result = recognizer.pointerCancel({ pointerId: canceledPointerId });
    armClickSuppression(result);
    if (suppressClick) {
      suppressCanceledSequenceClick = true;
      if (physicallyHeldPointerIds.has(canceledPointerId)) {
        blockPointersUntilAllReleased = true;
      }
    }
    safelyReleaseCapture(canceledPointerId);
  };

  const recognizer = createRunnerSwipeRecognizer(gate, accept);

  const syncGate = (): void => {
    if (!runnerInputGateAllowsIntent(gate())) cancelPointer(true);
  };

  const onKeydown = (event: Event): void => {
    if (disposed) return;
    syncGate();
    const keyboardEvent = event as KeyboardEvent;
    const inputGate = gate();
    if (keyboardEvent.key === "Escape" || keyboardEvent.code === "Escape") {
      if (
        !keyboardEvent.defaultPrevented &&
        !keyboardEvent.repeat &&
        !inputGate.dialogOpen &&
        onEscape?.() === true
      ) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
      }
      return;
    }
    handleRunnerKeydown(
      keyboardEvent,
      bindings,
      inputGate,
      accept,
    );
  };

  const cancelForAdditionalPointer = (pointerEvent: PointerEvent): void => {
    physicallyHeldPointerIds.add(pointerEvent.pointerId);
    recognizer.pointerDown(pointerEvent);
    blockPointersUntilAllReleased = true;
    suppressCanceledSequenceClick = true;
    if (pointerId !== null) {
      const capturedPointerId = pointerId;
      pointerId = null;
      safelyReleaseCapture(capturedPointerId);
    }
  };

  const onWindowPointerDownCapture = (event: Event): void => {
    if (disposed) return;
    const pointerEvent = event as PointerEvent;
    if (
      pointerId === null &&
      !blockPointersUntilAllReleased
    ) {
      return;
    }
    if (pointerEvent.pointerId === pointerId) return;
    globallyHandledPointerDowns.add(event);
    cancelForAdditionalPointer(pointerEvent);
  };

  const onButtonClick = (command: RunnerInputCommand) => (event: Event): void => {
    if (disposed || event.defaultPrevented) return;
    syncGate();
    if (requestRunnerButtonIntent(command, gate(), accept)) {
      event.preventDefault();
    }
  };
  const onUpButtonClick = onButtonClick("lane-up");
  const onDownButtonClick = onButtonClick("lane-down");

  const onRootClickCapture = (event: Event): void => {
    if (disposed) return;
    // A synthesized click belongs to the pointer sequence only when it lands
    // on the dedicated surface. Never consume or suppress a sibling control's
    // legitimate click (for example, the Resume button that opened the gate).
    if (!eventPath(event).includes(playSurface)) return;
    const pureSuppression = recognizer.consumeSynthesizedClick();
    if (!suppressCanceledSequenceClick && !pureSuppression) return;
    suppressCanceledSequenceClick = false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  };

  const onPointerDown = (event: Event): void => {
    if (disposed) return;
    if (globallyHandledPointerDowns.has(event)) return;
    const pointerEvent = event as PointerEvent;
    if (pointerId !== null) {
      // Let the pure recognizer observe the second pointer, then close both
      // sides of the sequence so neither can become active after release.
      cancelForAdditionalPointer(pointerEvent);
      return;
    }
    if (
      !pointerEvent.isPrimary ||
      pointerEvent.button !== 0 ||
      comesFromInteractiveContext(event)
    ) {
      return;
    }

    physicallyHeldPointerIds.add(pointerEvent.pointerId);
    if (blockPointersUntilAllReleased) {
      globallyHandledPointerDowns.add(event);
      cancelForAdditionalPointer(pointerEvent);
      return;
    }

    const result = recognizer.pointerDown(pointerEvent);
    armClickSuppression(result);
    if (!runnerInputGateAllowsIntent(gate())) {
      recognizer.pointerCancel({ pointerId: pointerEvent.pointerId });
      return;
    }
    pointerId = pointerEvent.pointerId;
    if (typeof surface.setPointerCapture === "function") {
      try {
        surface.setPointerCapture(pointerId);
        captureHeld = true;
      } catch {
        cancelPointer(true);
      }
    }
  };

  const onPointerMove = (event: Event): void => {
    if (disposed) return;
    const pointerEvent = event as PointerEvent;
    if (pointerId !== pointerEvent.pointerId) return;
    if (!runnerInputGateAllowsIntent(gate())) {
      cancelPointer(true);
      return;
    }
    armClickSuppression(recognizer.pointerMove(pointerEvent));
  };

  const onPointerUp = (event: Event): void => {
    if (disposed) return;
    const pointerEvent = event as PointerEvent;
    physicallyHeldPointerIds.delete(pointerEvent.pointerId);
    if (pointerId === pointerEvent.pointerId) {
      if (!runnerInputGateAllowsIntent(gate())) {
        cancelPointer(true);
      } else {
        const releasedPointerId = pointerId;
        pointerId = null;
        armClickSuppression(recognizer.pointerUp({ pointerId: releasedPointerId }));
        safelyReleaseCapture(releasedPointerId);
      }
    } else {
      armClickSuppression(recognizer.pointerUp({
        pointerId: pointerEvent.pointerId,
      }));
    }
    if (physicallyHeldPointerIds.size === 0) {
      blockPointersUntilAllReleased = false;
    }
  };

  const onPointerCancel = (event: Event): void => {
    if (disposed) return;
    const pointerEvent = event as PointerEvent;
    physicallyHeldPointerIds.delete(pointerEvent.pointerId);
    if (pointerId === pointerEvent.pointerId) {
      cancelPointer(true);
    } else {
      armClickSuppression(recognizer.pointerCancel({
        pointerId: pointerEvent.pointerId,
      }));
    }
    if (physicallyHeldPointerIds.size === 0) {
      blockPointersUntilAllReleased = false;
    }
  };

  const onLostPointerCapture = (event: Event): void => {
    if (disposed) return;
    const pointerEvent = event as PointerEvent;
    if (pointerId !== pointerEvent.pointerId) return;
    pointerId = null;
    captureHeld = false;
    blockPointersUntilAllReleased = true;
    armClickSuppression(recognizer.lostPointerCapture({
      pointerId: pointerEvent.pointerId,
    }));
    suppressCanceledSequenceClick = true;
  };

  const removeListeners = (): void => {
    suppliedWindow.removeEventListener("keydown", onKeydown);
    suppliedWindow.removeEventListener(
      "pointerdown",
      onWindowPointerDownCapture,
      true,
    );
    suppliedWindow.removeEventListener("pointermove", onPointerMove);
    suppliedWindow.removeEventListener("pointerup", onPointerUp);
    suppliedWindow.removeEventListener("pointercancel", onPointerCancel);
    playSurface.removeEventListener("pointerdown", onPointerDown);
    playSurface.removeEventListener("lostpointercapture", onLostPointerCapture);
    root.removeEventListener("click", onRootClickCapture, true);
    laneUpButton.removeEventListener("click", onUpButtonClick);
    laneDownButton.removeEventListener("click", onDownButtonClick);
  };

  const restoreDomAndOwnership = (): void => {
    restoreAttribute(laneUpButton, "aria-keyshortcuts", originalUpShortcuts);
    restoreAttribute(laneDownButton, "aria-keyshortcuts", originalDownShortcuts);
    if (originalTouchAction.length === 0) {
      playSurface.style.removeProperty("touch-action");
    } else {
      playSurface.style.setProperty(
        "touch-action",
        originalTouchAction,
        originalTouchActionPriority,
      );
    }
    if (ACTIVE_ROOTS.get(root) === ownership) ACTIVE_ROOTS.delete(root);
    if (ACTIVE_WINDOWS.get(suppliedWindow) === ownership) {
      ACTIVE_WINDOWS.delete(suppliedWindow);
    }
  };

  try {
    playSurface.style.setProperty("touch-action", "pan-x");
    suppliedWindow.addEventListener("keydown", onKeydown);
    suppliedWindow.addEventListener(
      "pointerdown",
      onWindowPointerDownCapture,
      true,
    );
    suppliedWindow.addEventListener("pointermove", onPointerMove, {
      passive: false,
    });
    suppliedWindow.addEventListener("pointerup", onPointerUp);
    suppliedWindow.addEventListener("pointercancel", onPointerCancel);
    playSurface.addEventListener("pointerdown", onPointerDown);
    playSurface.addEventListener("lostpointercapture", onLostPointerCapture);
    root.addEventListener("click", onRootClickCapture, true);
    laneUpButton.addEventListener("click", onUpButtonClick);
    laneDownButton.addEventListener("click", onDownButtonClick);
    publishBindings(bindings.snapshot());
  } catch (error) {
    disposed = true;
    removeListeners();
    recognizer.reset();
    restoreDomAndOwnership();
    throw error;
  }

  const requireMounted = (): void => {
    if (disposed) fail("adapter is disposed");
  };

  const adapter: RunnerInputDomAdapter = Object.freeze({
    snapshot(): RunnerKeyboardBindingSnapshot {
      return bindings.snapshot();
    },
    remap(command: RunnerInputCommand, key: RunnerRemapKey): RunnerRemapResult {
      requireMounted();
      const result = bindings.remap(command, key);
      if (result.ok) publishBindings(result.snapshot);
      return result;
    },
    resetBindings(): RunnerKeyboardBindingSnapshot {
      requireMounted();
      return publishBindings(bindings.reset());
    },
    syncGate(): void {
      if (disposed) return;
      syncGate();
    },
    dispose(): void {
      if (disposed) return;
      cancelPointer(false);
      disposed = true;
      removeListeners();
      recognizer.reset();
      physicallyHeldPointerIds.clear();
      blockPointersUntilAllReleased = false;
      restoreDomAndOwnership();
    },
  });

  return adapter;
}
