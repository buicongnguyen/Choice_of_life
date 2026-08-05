import type { LaneIntent } from "../core/runner/lane-controller";
import type { ControlMode, RunStateV1 } from "../core/run-state";

export type RunnerInputCommand = "lane-up" | "lane-down";

export interface RunnerInputGate {
  readonly started: boolean;
  readonly controlMode: ControlMode;
  readonly pauseReasons: readonly string[];
  readonly dialogOpen: boolean;
  readonly runStatus: RunStateV1["runStatus"];
  readonly stagePhase: RunStateV1["stage"]["phase"];
}

export interface RunnerKeyboardBinding {
  readonly command: RunnerInputCommand;
  readonly eventCode: string;
  readonly ariaKeyshortcutsToken: string;
  readonly displayLabel: string;
  readonly immutable: boolean;
}

export interface RunnerKeyboardBindingSnapshot {
  readonly bindings: readonly RunnerKeyboardBinding[];
  readonly instructions: Readonly<Record<RunnerInputCommand, string>>;
  readonly ariaKeyshortcuts: Readonly<Record<RunnerInputCommand, string>>;
}

export interface RunnerRemapKey {
  readonly code: string;
  readonly key: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

export type RunnerRemapResult =
  | Readonly<{ ok: true; snapshot: RunnerKeyboardBindingSnapshot }>
  | Readonly<{
      ok: false;
      reason: "reserved" | "modifier-chord" | "duplicate";
      snapshot: RunnerKeyboardBindingSnapshot;
    }>;

export interface RunnerKeyboardBindings {
  snapshot(): RunnerKeyboardBindingSnapshot;
  commandForCode(code: string): RunnerInputCommand | null;
  remap(command: RunnerInputCommand, key: RunnerRemapKey): RunnerRemapResult;
  reset(): RunnerKeyboardBindingSnapshot;
}

export interface RunnerKeydownLike extends RunnerRemapKey {
  readonly repeat: boolean;
  readonly isComposing?: boolean;
  readonly defaultPrevented?: boolean;
  readonly target?: EventTarget | null;
  composedPath?(): readonly EventTarget[];
  preventDefault(): void;
}

export interface RunnerSwipePointerLike {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly isPrimary: boolean;
  readonly button: number;
  preventDefault(): void;
}

export interface RunnerSwipeResult {
  readonly acceptedIntent: LaneIntent;
  readonly consumed: boolean;
  readonly suppressNextClick: boolean;
}

export interface RunnerSwipeRecognizer {
  pointerDown(event: RunnerSwipePointerLike): RunnerSwipeResult;
  pointerMove(event: RunnerSwipePointerLike): RunnerSwipeResult;
  pointerUp(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult;
  pointerCancel(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult;
  lostPointerCapture(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult;
  consumeSynthesizedClick(): boolean;
  reset(): void;
}

export const RUNNER_SWIPE_THRESHOLD_CSS_PX = 24;

const COMMAND_ORDER = ["lane-up", "lane-down"] as const;
const IMMUTABLE_BINDINGS = Object.freeze([
  Object.freeze({
    command: "lane-up" as const,
    eventCode: "ArrowUp",
    ariaKeyshortcutsToken: "ArrowUp",
    displayLabel: "Up arrow",
    immutable: true,
  }),
  Object.freeze({
    command: "lane-down" as const,
    eventCode: "ArrowDown",
    ariaKeyshortcutsToken: "ArrowDown",
    displayLabel: "Down arrow",
    immutable: true,
  }),
]);
const DEFAULT_SUPPLEMENTAL = Object.freeze({
  "lane-up": Object.freeze({
    command: "lane-up" as const,
    eventCode: "KeyW",
    ariaKeyshortcutsToken: "W",
    displayLabel: "W",
    immutable: false,
  }),
  "lane-down": Object.freeze({
    command: "lane-down" as const,
    eventCode: "KeyS",
    ariaKeyshortcutsToken: "S",
    displayLabel: "S",
    immutable: false,
  }),
});

function commandIntent(command: RunnerInputCommand): Exclude<LaneIntent, null> {
  return command === "lane-up" ? "up" : "down";
}

export function runnerInputGateAllowsIntent(gate: RunnerInputGate): boolean {
  return gate.started &&
    gate.controlMode === "manual" &&
    gate.pauseReasons.length === 0 &&
    !gate.dialogOpen &&
    gate.runStatus === "active" &&
    gate.stagePhase === "active";
}

function cloneBinding(binding: RunnerKeyboardBinding): RunnerKeyboardBinding {
  return Object.freeze({ ...binding });
}

function bindingSnapshot(
  supplemental: Readonly<Record<RunnerInputCommand, RunnerKeyboardBinding>>,
): RunnerKeyboardBindingSnapshot {
  const bindings = Object.freeze([
    ...IMMUTABLE_BINDINGS.map(cloneBinding),
    ...COMMAND_ORDER.map((command) => cloneBinding(supplemental[command])),
  ]);
  const instructions = Object.freeze(Object.fromEntries(COMMAND_ORDER.map((command) => {
    const immutable = IMMUTABLE_BINDINGS.find((binding) => binding.command === command)!;
    return [command, `${immutable.displayLabel} or ${supplemental[command].displayLabel}`];
  }))) as Readonly<Record<RunnerInputCommand, string>>;
  const ariaKeyshortcuts = Object.freeze(Object.fromEntries(COMMAND_ORDER.map((command) => {
    const immutable = IMMUTABLE_BINDINGS.find((binding) => binding.command === command)!;
    return [
      command,
      `${immutable.ariaKeyshortcutsToken} ${supplemental[command].ariaKeyshortcutsToken}`,
    ];
  }))) as Readonly<Record<RunnerInputCommand, string>>;
  return Object.freeze({ bindings, instructions, ariaKeyshortcuts });
}

function supplementalBinding(command: RunnerInputCommand, key: RunnerRemapKey): RunnerKeyboardBinding {
  const displayLabel = key.code.startsWith("Key")
    ? key.code.slice(3)
    : key.code.slice(5);
  return Object.freeze({
    command,
    eventCode: key.code,
    ariaKeyshortcutsToken: displayLabel,
    displayLabel,
    immutable: false,
  });
}

function isAllowedSupplementalCode(code: string): boolean {
  return /^(?:Key[A-Z]|Digit[0-9])$/.test(code);
}

export function createRunnerKeyboardBindings(): RunnerKeyboardBindings {
  let supplemental: Record<RunnerInputCommand, RunnerKeyboardBinding> = {
    "lane-up": DEFAULT_SUPPLEMENTAL["lane-up"],
    "lane-down": DEFAULT_SUPPLEMENTAL["lane-down"],
  };

  const currentSnapshot = (): RunnerKeyboardBindingSnapshot =>
    bindingSnapshot(supplemental);

  return Object.freeze({
    snapshot: currentSnapshot,
    commandForCode(code: string): RunnerInputCommand | null {
      const binding = currentSnapshot().bindings.find((candidate) =>
        candidate.eventCode === code);
      return binding?.command ?? null;
    },
    remap(command: RunnerInputCommand, key: RunnerRemapKey): RunnerRemapResult {
      if (!COMMAND_ORDER.includes(command)) {
        throw new TypeError("runner command is unsupported");
      }
      if (key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) {
        return Object.freeze({
          ok: false as const,
          reason: "modifier-chord" as const,
          snapshot: currentSnapshot(),
        });
      }
      if (!isAllowedSupplementalCode(key.code)) {
        return Object.freeze({
          ok: false as const,
          reason: "reserved" as const,
          snapshot: currentSnapshot(),
        });
      }
      if (currentSnapshot().bindings.some((binding) => binding.eventCode === key.code)) {
        return Object.freeze({
          ok: false as const,
          reason: "duplicate" as const,
          snapshot: currentSnapshot(),
        });
      }
      supplemental = {
        ...supplemental,
        [command]: supplementalBinding(command, key),
      };
      return Object.freeze({ ok: true as const, snapshot: currentSnapshot() });
    },
    reset(): RunnerKeyboardBindingSnapshot {
      supplemental = {
        "lane-up": DEFAULT_SUPPLEMENTAL["lane-up"],
        "lane-down": DEFAULT_SUPPLEMENTAL["lane-down"],
      };
      return currentSnapshot();
    },
  });
}

const TEXT_CONTROL_SELECTOR = "input, select, textarea";
const EDITABLE_SELECTOR = "[contenteditable]:not([contenteditable='false'])";

type TextInputCandidate = EventTarget & {
  readonly isContentEditable?: boolean;
  matches?: (selector: string) => boolean;
  closest?: (selector: string) => unknown | null;
};

function candidateConsumesTextInput(target: EventTarget | null | undefined): boolean {
  const candidate = target as TextInputCandidate | null | undefined;
  if (!candidate) return false;
  if (
    (typeof candidate.matches === "function" && candidate.matches(TEXT_CONTROL_SELECTOR)) ||
    (typeof candidate.closest === "function" && candidate.closest(TEXT_CONTROL_SELECTOR) !== null)
  ) {
    return true;
  }
  if (typeof candidate.isContentEditable === "boolean") {
    return candidate.isContentEditable;
  }
  return (
    (typeof candidate.matches === "function" && candidate.matches(EDITABLE_SELECTOR)) ||
    (typeof candidate.closest === "function" && candidate.closest(EDITABLE_SELECTOR) !== null)
  );
}

function targetConsumesTextInput(event: RunnerKeydownLike): boolean {
  if (candidateConsumesTextInput(event.target)) return true;
  if (typeof event.composedPath !== "function") return false;
  return event.composedPath().some(candidateConsumesTextInput);
}

/** Handles one key boundary and calls preventDefault only for an accepted intent. */
export function handleRunnerKeydown(
  event: RunnerKeydownLike,
  bindings: RunnerKeyboardBindings,
  gate: RunnerInputGate,
  accept: (intent: Exclude<LaneIntent, null>) => boolean,
): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    targetConsumesTextInput(event) ||
    !runnerInputGateAllowsIntent(gate)
  ) {
    return false;
  }
  const command = bindings.commandForCode(event.code);
  if (command === null) return false;
  if (!accept(commandIntent(command))) return false;
  event.preventDefault();
  return true;
}

function swipeResult(
  acceptedIntent: LaneIntent = null,
  consumed = false,
  suppressNextClick = false,
): RunnerSwipeResult {
  return Object.freeze({ acceptedIntent, consumed, suppressNextClick });
}

/**
 * Pure one-pointer recognizer for the dedicated play surface. Platform glue
 * owns pointer capture; this state machine owns cancellation and intent count.
 */
export function createRunnerSwipeRecognizer(
  gate: () => RunnerInputGate,
  accept: (intent: Exclude<LaneIntent, null>) => boolean,
): RunnerSwipeRecognizer {
  const downPointers = new Set<number>();
  let active: { pointerId: number; startX: number; startY: number } | null = null;
  let ignoreUntilAllReleased = false;
  let suppressClick = false;

  const finish = (pointerId: number): RunnerSwipeResult => {
    downPointers.delete(pointerId);
    if (active?.pointerId === pointerId) active = null;
    if (downPointers.size === 0) ignoreUntilAllReleased = false;
    return swipeResult(null, false, suppressClick);
  };

  return Object.freeze({
    pointerDown(event: RunnerSwipePointerLike): RunnerSwipeResult {
      downPointers.add(event.pointerId);
      if (
        ignoreUntilAllReleased ||
        active !== null ||
        downPointers.size > 1
      ) {
        active = null;
        ignoreUntilAllReleased = true;
        return swipeResult();
      }
      if (!event.isPrimary || event.button !== 0) return swipeResult();
      if (!runnerInputGateAllowsIntent(gate())) {
        ignoreUntilAllReleased = true;
        return swipeResult();
      }
      active = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      return swipeResult();
    },
    pointerMove(event: RunnerSwipePointerLike): RunnerSwipeResult {
      if (
        ignoreUntilAllReleased ||
        active === null ||
        active.pointerId !== event.pointerId
      ) return swipeResult();
      if (!runnerInputGateAllowsIntent(gate())) {
        active = null;
        ignoreUntilAllReleased = true;
        return swipeResult();
      }
      const deltaX = event.clientX - active.startX;
      const deltaY = event.clientY - active.startY;
      if (
        Math.abs(deltaY) < RUNNER_SWIPE_THRESHOLD_CSS_PX ||
        Math.abs(deltaY) <= Math.abs(deltaX)
      ) return swipeResult();
      const intent = deltaY < 0 ? "up" : "down";
      active = null;
      if (!accept(intent)) return swipeResult();
      event.preventDefault();
      suppressClick = true;
      return swipeResult(intent, true, true);
    },
    pointerUp(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult {
      return finish(event.pointerId);
    },
    pointerCancel(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult {
      return finish(event.pointerId);
    },
    lostPointerCapture(event: Pick<RunnerSwipePointerLike, "pointerId">): RunnerSwipeResult {
      return finish(event.pointerId);
    },
    consumeSynthesizedClick(): boolean {
      if (!suppressClick) return false;
      suppressClick = false;
      return true;
    },
    reset(): void {
      downPointers.clear();
      active = null;
      ignoreUntilAllReleased = false;
      suppressClick = false;
    },
  });
}

export function requestRunnerButtonIntent(
  command: RunnerInputCommand,
  gate: RunnerInputGate,
  accept: (intent: Exclude<LaneIntent, null>) => boolean,
): boolean {
  if (!runnerInputGateAllowsIntent(gate)) return false;
  if (!COMMAND_ORDER.includes(command)) throw new TypeError("runner command is unsupported");
  return accept(commandIntent(command));
}
