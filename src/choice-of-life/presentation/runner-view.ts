import type { ShellNotice } from "../core/shell-contracts";
import { LOGICAL_TICK_MILLISECONDS } from "../core/stage-clock";
import type {
  ControlMode,
  CoreScores,
  Lane,
  RunStateV1,
  RunnerEntity,
  RunnerMotion,
  ScoreId,
} from "../core/run-state";
import {
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "../core/runner/contract";
import {
  assertAuthenticRunnerLaboratoryCourse,
  type RunnerLabGeneratedCourse,
  type RunnerLabGeneratedEntity,
} from "../core/runner/course-generator";
import {
  lanePositionMilli as runnerLanePositionMilli,
  type LaneDirection,
} from "../core/runner/lane-controller";
import type { RunnerSimulationEvent } from "../core/runner/simulation";
import { createElement } from "./elements";
import {
  createCharacterElement,
  createCharacterModel,
} from "./character-system";
import { drawEventItem, drawRunnerToken, type RunnerTokenKind } from "../../sprites";
import { createV5RoomBackdrop } from "./v5-room-backdrop";
import "./polish.css";
import {
  createRunnerPresentationModel,
  RUNNER_LANE_LABELS,
  RUNNER_SCORE_LABELS,
  type RunnerLaneWarning,
  type RunnerPatternWarningProjection,
  type RunnerPresentationModel,
} from "./runner-model";

export type RunnerViewPauseReason =
  | "visibility"
  | "focus-interruption"
  | "user"
  | "modal"
  | "semantic";

export type RunnerViewSessionStatus =
  | "awaiting-start"
  | "running"
  | "paused"
  | "settling"
  | "completed"
  | "faulted"
  | "disposed";

export type RunnerViewSessionEvent =
  | RunnerSimulationEvent
  | Readonly<{
      type: "runtime-pause-changed";
      pauseReasons: readonly RunnerViewPauseReason[];
    }>
  | Readonly<{
      type: "user-pause-changed";
      active: boolean;
    }>
  | Readonly<{
      type: "settlement-applied";
      simulationTick: number;
    }>
  | Readonly<{
      type: "presentation-state-refreshed";
      simulationTick: number;
    }>;

/**
 * Presentation-owned subset of the platform session. The platform's
 * `RunnerSession` satisfies this structurally; this module never imports it.
 */
export interface RunnerViewSessionSnapshot {
  readonly state: RunStateV1;
  readonly status: RunnerViewSessionStatus;
  readonly started: boolean;
  readonly queuedLaneIntent: LaneDirection | null;
  readonly pauseReasons: readonly RunnerViewPauseReason[];
  readonly events: readonly RunnerViewSessionEvent[];
  readonly notice: ShellNotice | null;
  readonly droppedLogicalSteps: number;
}

export interface RunnerViewSessionPort {
  getSnapshot(): RunnerViewSessionSnapshot;
  subscribe(
    listener: (snapshot: RunnerViewSessionSnapshot) => void,
  ): () => void;
  start(): boolean;
  chooseLane(targetLane: Lane): boolean;
  setUserPaused(active: boolean): boolean;
  setModalOpen(active: boolean): boolean;
  reportPresentationFault(message: string): boolean;
  resumeInterruption(
    reason: "visibility" | "focus-interruption",
  ): boolean;
}

export type RunnerViewInputCommand = "lane-up" | "lane-down";

export interface RunnerViewBindingSnapshot {
  readonly instructions: Readonly<Record<
    RunnerViewInputCommand,
    string
  >>;
  readonly ariaKeyshortcuts: Readonly<Record<
    RunnerViewInputCommand,
    string
  >>;
}

export interface RunnerViewKeyboardBinding {
  readonly command: RunnerViewInputCommand;
  readonly eventCode: string;
  readonly ariaKeyshortcutsToken: string;
  readonly displayLabel: string;
  readonly immutable: boolean;
}

export interface RunnerViewBindingControllerSnapshot
  extends RunnerViewBindingSnapshot {
  readonly bindings: readonly RunnerViewKeyboardBinding[];
}

export interface RunnerViewRemapKey {
  readonly code: string;
  readonly key: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

export type RunnerViewRemapResult =
  | Readonly<{
      ok: true;
      snapshot: RunnerViewBindingControllerSnapshot;
    }>
  | Readonly<{
      ok: false;
      reason: "reserved" | "modifier-chord" | "duplicate";
      snapshot: RunnerViewBindingControllerSnapshot;
    }>;

export interface RunnerViewBindingController {
  snapshot(): RunnerViewBindingControllerSnapshot;
  remap(
    command: RunnerViewInputCommand,
    key: RunnerViewRemapKey,
  ): RunnerViewRemapResult;
  resetBindings(): RunnerViewBindingControllerSnapshot;
}

export interface RunnerViewCharacterToken {
  readonly bodySet: "feminine" | "masculine";
  readonly artSet: "asian" | "western" | "black" | "middle-eastern";
  readonly hairShape: "short-soft" | "wavy-bob" | "curly-crown" | "tied-back";
  readonly hairTone: "black" | "dark-brown" | "warm-brown" | "silver";
  readonly clothingTone: "sunrise" | "meadow" | "ocean" | "berry";
}

export interface RunnerViewVisualOptions {
  readonly contrastMode: "standard" | "high";
  readonly motionReduced: boolean;
  readonly textScaleMultiplier: 1 | 1.25 | 1.5 | 2;
  readonly announceOptional: boolean;
}

export interface RunnerViewInputGateSnapshot {
  readonly started: boolean;
  readonly controlMode: ControlMode;
  readonly pauseReasons: readonly string[];
  readonly dialogOpen: boolean;
  readonly runStatus: RunStateV1["runStatus"];
  readonly stagePhase: RunStateV1["stage"]["phase"];
}

export interface RunnerViewMountOptions {
  readonly dom: Document;
  readonly root: HTMLElement;
  readonly session: RunnerViewSessionPort;
  readonly course: RunnerLabGeneratedCourse;
  readonly characterToken: RunnerViewCharacterToken;
  readonly visualOptions: RunnerViewVisualOptions;
  readonly onPracticeAgain: () => void;
  readonly onReturnToTitle: () => void;
  readonly controlClusterPlacement?: "left" | "right";
}

export interface RunnerView {
  readonly section: HTMLElement;
  readonly playSurface: HTMLElement;
  readonly laneUpButton: HTMLButtonElement;
  readonly laneDownButton: HTMLButtonElement;
  getInputGateSnapshot(): RunnerViewInputGateSnapshot;
  attachBindingController(controller: RunnerViewBindingController): void;
  updateBindings(snapshot: RunnerViewBindingSnapshot): void;
  updateVisualOptions(options: RunnerViewVisualOptions): void;
  dispose(): void;
}

const SCORE_ORDER = ["health", "happiness", "money"] as const;
const LANES = [0, 1, 2] as const;
const PROGRESS_TICKS_PER_SECOND = 1000 / LOGICAL_TICK_MILLISECONDS;
const STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS = 1000;
const PRACTICE_DISCLAIMER =
  "These practice scores do not affect your life journey.";
const DEFAULT_FAULT_SUMMARY =
  "The runner stopped before completion. Return to the title to begin a safe new session.";
const UNEXPECTED_PRESENTATION_FAULT =
  "The runner display could not be updated safely. The runner stopped. Return to the title to begin a safe new session.";
const BINDING_CLOSE_ERROR =
  "The runner could not safely close control settings. Keep this dialog open and return to the title if the problem continues.";
const BINDING_OPEN_ERROR =
  "Control settings could not pause the runner safely. Try opening settings again or return to the title.";
const DEFAULT_BINDINGS: RunnerViewBindingSnapshot = Object.freeze({
  instructions: Object.freeze({
    "lane-up": "Up arrow or W",
    "lane-down": "Down arrow or S",
  }),
  ariaKeyshortcuts: Object.freeze({
    "lane-up": "ArrowUp W",
    "lane-down": "ArrowDown S",
  }),
});

const MODE_LABELS = Object.freeze({
  manual: "Manual",
  "semantic-assist": "Semantic Assist",
  "automatic-assist": "Automatic Assist",
} as const satisfies Readonly<Record<ControlMode, string>>);

const PAUSE_LABELS = Object.freeze({
  visibility: "page hidden",
  "focus-interruption": "window focus interrupted",
  user: "paused by you",
  modal: "dialog open",
  semantic: "waiting for a lane choice",
} as const satisfies Readonly<Record<RunnerViewPauseReason, string>>);

const INPUT_COMMAND_LABELS = Object.freeze({
  "lane-up": "Move up",
  "lane-down": "Move down",
} as const satisfies Readonly<Record<RunnerViewInputCommand, string>>);

const REMAP_FAILURE_MESSAGES = Object.freeze({
  reserved: "Use one letter or number. Tab, Escape, Enter, Space, arrows, and browser or system keys cannot be supplemental controls.",
  "modifier-chord": "Modifier combinations cannot be supplemental controls. Press one letter or number without Shift, Control, Alt, or Meta.",
  duplicate: "That key is already assigned. Choose a different letter or number.",
} as const satisfies Readonly<Record<
  Exclude<RunnerViewRemapResult, { readonly ok: true }>["reason"],
  string
>>);

const SCORE_ENTITY_SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  "runner-lab-health-token-v1": "+",
  "runner-lab-happiness-token-v1": "★",
  "runner-lab-money-token-v1": "$",
  "runner-lab-clutter-hazard-v1": "!",
  "runner-lab-pressure-hazard-v1": "!",
  "runner-lab-decision-marker-v1": "◆",
});

function fail(message: string): never {
  if (import.meta.env.DEV) {
    throw new TypeError(`runner view: ${message}`);
  }
  throw new TypeError();
}

function validateCharacterToken(token: RunnerViewCharacterToken): void {
  if (token.bodySet !== "feminine" && token.bodySet !== "masculine") {
    fail("character body set is unsupported");
  }
  if (!["asian", "western", "black", "middle-eastern"].includes(token.artSet)) {
    fail("character art set is unsupported");
  }
  if (!["short-soft", "wavy-bob", "curly-crown", "tied-back"].includes(token.hairShape)) {
    fail("character hair shape is unsupported");
  }
  if (!["black", "dark-brown", "warm-brown", "silver"].includes(token.hairTone)) {
    fail("character hair tone is unsupported");
  }
  if (!["sunrise", "meadow", "ocean", "berry"].includes(token.clothingTone)) {
    fail("character clothing tone is unsupported");
  }
}

function validateVisualOptions(options: RunnerViewVisualOptions): void {
  if (options.contrastMode !== "standard" && options.contrastMode !== "high") {
    fail("visual contrast mode is unsupported");
  }
  if (
    typeof options.motionReduced !== "boolean" ||
    typeof options.announceOptional !== "boolean"
  ) {
    fail("visual motion and announcement options must be boolean");
  }
  if (![1, 1.25, 1.5, 2].includes(options.textScaleMultiplier)) {
    fail("visual text scale multiplier is unsupported");
  }
}

function button(
  document: Document,
  text: string,
  className = "col-button",
): HTMLButtonElement {
  const element = createElement(document, "button", { className, text });
  element.type = "button";
  return element;
}

function summaryField(
  document: Document,
  termText: string,
  key: string,
): { readonly wrapper: HTMLDivElement; readonly value: HTMLElement } {
  const wrapper = createElement(document, "div", {
    className: "col-runner-summary-field",
  });
  const term = createElement(document, "dt", { text: termText });
  const value = createElement(document, "dd", {
    attributes: { "data-runner-summary": key },
  });
  wrapper.append(term, value);
  return { wrapper, value };
}

function setText(element: Node, text: string): boolean {
  if (element.textContent === text) return false;
  element.textContent = text;
  return true;
}

export interface RunnerSemanticFieldsetElements {
  readonly fieldset: HTMLFieldSetElement;
  readonly legend: HTMLLegendElement;
  readonly choices: readonly [
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
  ];
}

export interface RunnerSemanticChoiceRenderProjection {
  readonly lane: Lane;
  readonly warning: RunnerLaneWarning;
  readonly button: HTMLButtonElement;
}

export interface RunnerSemanticFieldsetRenderProjection {
  readonly decisionMarkerInstanceId: string;
  readonly patternIndex: number;
  readonly warning: RunnerPatternWarningProjection;
  readonly fieldset: HTMLFieldSetElement;
  readonly legend: HTMLLegendElement;
  readonly choices: readonly [
    RunnerSemanticChoiceRenderProjection,
    RunnerSemanticChoiceRenderProjection,
    RunnerSemanticChoiceRenderProjection,
  ];
}

/**
 * Creates the exact native controls used by the production Semantic lane
 * prompt. The evaluator also uses this factory so its exhaustive render proof
 * cannot drift to a parallel hidden representation.
 */
export function createRunnerSemanticFieldsetElements(
  document: Document,
): RunnerSemanticFieldsetElements {
  const fieldset = createElement(document, "fieldset", {
    className: "col-runner-semantic",
    attributes: { "data-runner-semantic": "" },
  });
  const legend = createElement(document, "legend");
  const choices = LANES.map((lane) => {
    const choice = button(
      document,
      RUNNER_LANE_LABELS[lane],
      "col-button col-runner-semantic-choice",
    );
    choice.setAttribute("data-runner-semantic-lane", String(lane));
    return choice;
  }) as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
  fieldset.append(legend, ...choices);
  return Object.freeze({
    fieldset,
    legend,
    choices: Object.freeze(choices),
  });
}

/**
 * Renders the production fieldset from the same warning object read by the
 * visual playfield. Reference checks deliberately fail closed if a caller ever
 * introduces a second Semantic-only warning source.
 */
export function renderRunnerSemanticFieldset(
  elements: RunnerSemanticFieldsetElements,
  model: RunnerPresentationModel | null,
  independentlyPaused: boolean,
): RunnerSemanticFieldsetRenderProjection | null {
  const decision = model?.semanticDecision ?? null;
  if (decision === null) {
    elements.fieldset.hidden = true;
    for (const choice of elements.choices) choice.disabled = true;
    return null;
  }
  if (
    model === null || decision.warning !== model.warning ||
    decision.choices !== model.warning.lanes
  ) {
    fail("Semantic fieldset is not bound to the visual warning projection");
  }

  elements.fieldset.hidden = false;
  elements.fieldset.dataset.patternIndex = String(decision.patternIndex);
  setText(elements.legend, decision.legend);
  const choices = LANES.map((lane) => {
    const warning = decision.choices[lane];
    const choice = elements.choices[lane];
    choice.disabled = independentlyPaused;
    choice.dataset.warningLabel = warning.accessibleLabel;
    choice.setAttribute("aria-label", warning.accessibleLabel);
    setText(
      choice,
      `${warning.laneLabel} — Benefit: ${warning.benefitText}; Hazard: ${warning.hazardText}; ${warning.urgencyText}`,
    );
    return Object.freeze({ lane, warning, button: choice });
  }) as [
    RunnerSemanticChoiceRenderProjection,
    RunnerSemanticChoiceRenderProjection,
    RunnerSemanticChoiceRenderProjection,
  ];
  return Object.freeze({
    decisionMarkerInstanceId: decision.decisionMarkerInstanceId,
    patternIndex: decision.patternIndex,
    warning: decision.warning,
    fieldset: elements.fieldset,
    legend: elements.legend,
    choices: Object.freeze(choices),
  });
}

function focusImmediately(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden) return false;
  if ((element as HTMLElement & { readonly disabled?: boolean }).disabled === true) {
    return false;
  }
  try {
    element.focus();
  } catch {
    return false;
  }
  if (element.ownerDocument.activeElement !== element) return false;
  try {
    element.scrollIntoView({
      "behavior": "auto",
      "block": "nearest",
      "inline": "nearest",
    });
  } catch {
    // Older engines may focus correctly without supporting scroll options.
  }
  return true;
}

function focusSafely(element: HTMLElement): void {
  if (!focusImmediately(element)) return;
  element.ownerDocument.defaultView?.queueMicrotask(() => {
    focusImmediately(element);
  });
}

function lanePositionPercent(positionMilli: number): string {
  return `${16.667 + (positionMilli / 2000) * 66.666}%`;
}

function motionKey(motion: RunnerMotion): string {
  return motion.kind === "idle"
    ? `idle:${motion.currentLane}`
    : `moving:${motion.sourceLane}:${motion.targetLane}`;
}

function laneSummary(motion: RunnerMotion): string {
  if (motion.kind === "idle") return RUNNER_LANE_LABELS[motion.currentLane];
  return `${RUNNER_LANE_LABELS[motion.sourceLane]} toward ${RUNNER_LANE_LABELS[motion.targetLane]}`;
}

function motionSummary(motion: RunnerMotion): string {
  return motion.kind === "idle"
    ? "Idle"
    : `Moving to ${RUNNER_LANE_LABELS[motion.targetLane]}`;
}

function nonLiveRunnerSummary(
  state: RunStateV1,
  model: RunnerPresentationModel | null,
): string {
  const motion = state.runner?.motion;
  if (motion === undefined) {
    return "Movement unavailable. No active warning. Urgency unavailable.";
  }
  const sourceLane = motion.kind === "idle"
    ? motion.currentLane
    : motion.sourceLane;
  const targetLane = motion.kind === "idle"
    ? motion.currentLane
    : motion.targetLane;
  const movement =
    `Source lane: ${RUNNER_LANE_LABELS[sourceLane]}. ` +
    `Target lane: ${RUNNER_LANE_LABELS[targetLane]}. ` +
    `State: ${motion.kind === "idle" ? "idle" : "moving"}.`;
  if (model === null) {
    return `${movement} No active warning. Urgency unavailable.`;
  }
  return `${movement} Warning group: ${model.warning.lanes
    .map((lane) => lane.accessibleLabel)
    .join(" ")}`;
}

function nonLiveBoundaryKey(
  state: RunStateV1,
  model: RunnerPresentationModel | null,
): string {
  const motion = state.runner?.motion;
  return `${motion === undefined ? "none" : motionKey(motion)}|${
    model?.warning.patternIndex ?? "none"
  }`;
}

function completionSummaryText(state: RunStateV1): string {
  const fact = RUNNER_LABORATORY_COMPLETION_FACT;
  const memory = RUNNER_LABORATORY_COMPLETION_MEMORY;
  const actualFact = state.storyState.facts[0];
  const actualMemory = state.storyState.memories[0];
  if (
    state.storyState.facts.length !== 1 ||
    actualFact?.factId !== fact.factId ||
    actualFact.kind !== fact.kind ||
    actualFact.valueId !== fact.valueId ||
    actualFact.originChoiceId !== fact.originChoiceId ||
    state.storyState.memories.length !== 1 ||
    actualMemory?.memoryId !== memory.memoryId ||
    actualMemory.kind !== memory.kind ||
    actualMemory.stageId !== memory.stageId ||
    actualMemory.summary !== memory.summary ||
    actualMemory.originChoiceId !== memory.originChoiceId
  ) {
    fail("completed runner narrative is missing or does not match its locked fact and memory");
  }
  return `Runner laboratory complete: one learning fact (${fact.factId}: ${fact.valueId}) and one milestone memory (${memory.memoryId}: ${memory.summary}) were recorded. Practice scores: Health ${state.scores.health}, Happiness ${state.scores.happiness}, Financial security ${state.scores.money}. ${PRACTICE_DISCLAIMER}`;
}

function pauseSummary(reasons: readonly RunnerViewPauseReason[]): string {
  return reasons.length === 0
    ? "Not paused"
    : reasons.map((reason) => PAUSE_LABELS[reason]).join(", ");
}

function scoreDeltaText(
  event: Extract<RunnerSimulationEvent, { type: "contact-resolved" }>,
  generatedEntity: RunnerLabGeneratedEntity | undefined,
  scores: CoreScores,
): Readonly<{ readonly message: string | null; readonly error: string | null }> {
  const { contact } = event;
  if (
    contact.outcome !== "hazard-suppressed" &&
    contact.outcome !== "benefit-applied" &&
    contact.outcome !== "hazard-applied"
  ) return Object.freeze({ message: null, error: null });
  if (
    generatedEntity === undefined ||
    generatedEntity.contentId !== contact.contentId ||
    (contact.outcome === "benefit-applied" && generatedEntity.kind !== "benefit") ||
    (contact.outcome !== "benefit-applied" && generatedEntity.kind !== "hazard")
  ) {
    return Object.freeze({
      message: null,
      error: "A runner score result could not be verified against the active course. Return to the title before continuing.",
    });
  }
  const lanePrefix = `${RUNNER_LANE_LABELS[generatedEntity.lane]}: `;
  if (contact.outcome === "hazard-suppressed") {
    const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(
      contact.contentId,
    );
    if (definition === undefined) {
      return Object.freeze({
        message: null,
        error: "A suppressed runner hazard had no authentic score definition. Return to the title before continuing.",
      });
    }
    const score = scores[definition.scoreId];
    return Object.freeze({
      message: `${lanePrefix}${RUNNER_SCORE_LABELS[definition.scoreId]} changed by 0 and remains ${score} because the hazard was suppressed.`,
      error: null,
    });
  }
  const effect = contact.effect;
  if (effect === null) {
    return Object.freeze({
      message: null,
      error: "An applied runner score result was missing its effect. Return to the title before continuing.",
    });
  }
  const direction = effect.actualDelta > 0
    ? `increased by ${effect.actualDelta}`
    : effect.actualDelta < 0
      ? `decreased by ${-effect.actualDelta}`
      : "did not change";
  const clamp = effect.actualDelta === effect.requestedDelta
    ? ""
    : ` Requested ${effect.requestedDelta > 0 ? "+" : ""}${effect.requestedDelta}; the limit changed the actual result.`;
  return Object.freeze({
    message: `${lanePrefix}${RUNNER_SCORE_LABELS[effect.scoreId]} ${direction} to ${effect.after}.${clamp}`,
    error: null,
  });
}

function warningAnnouncement(model: RunnerPresentationModel): string {
  return `Choice ahead. ${model.warning.lanes
    .map((lane) => lane.accessibleLabel)
    .join(" ")}`;
}

function hasProgressBoundary(events: readonly RunnerViewSessionEvent[]): boolean {
  return events.some((event) => {
    if (
      event.type === "clock-advanced" ||
      event.type === "presentation-state-refreshed" ||
      event.type === "lane-stepped"
    ) return false;
    return true;
  });
}

function entitySymbol(entity: RunnerEntity): string {
  return SCORE_ENTITY_SYMBOLS[entity.contentId] ??
    (entity.kind === "benefit" ? "+" : entity.kind === "hazard" ? "!" : "◆");
}

const ENTITY_TOKEN_KINDS: Readonly<Record<string, RunnerTokenKind>> = Object.freeze({
  "runner-lab-health-token-v1": "health",
  "runner-lab-happiness-token-v1": "happiness",
  "runner-lab-money-token-v1": "money",
  "runner-lab-clutter-hazard-v1": "hazard",
  "runner-lab-pressure-hazard-v1": "hazard",
  "runner-lab-decision-marker-v1": "decision",
});

function entityTokenKind(entity: RunnerEntity): RunnerTokenKind {
  return ENTITY_TOKEN_KINDS[entity.contentId] ??
    (entity.kind === "benefit" ? "health" : entity.kind === "hazard" ? "hazard" : "decision");
}

function isCompleted(snapshot: RunnerViewSessionSnapshot): boolean {
  return snapshot.status === "completed" ||
    snapshot.state.runStatus === "completed" ||
    snapshot.state.stage.phase === "complete";
}

export function mountRunnerView(options: RunnerViewMountOptions): RunnerView {
  const {
    root,
    session,
    course,
    characterToken,
    visualOptions: initialVisualOptions,
    onPracticeAgain,
    onReturnToTitle,
    controlClusterPlacement = "right",
  } = options;
  const document = options.dom;
  const ownerWindow = document.defaultView;
  const cleanup: Array<() => void> = [];
  if (ownerWindow === null) fail("supplied document must have an owner window");
  const motionPreference = typeof ownerWindow.matchMedia === "function"
    ? ownerWindow.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  if (root.ownerDocument !== document) {
    fail("root and supplied document must share one DOM");
  }
  if (controlClusterPlacement !== "left" && controlClusterPlacement !== "right") {
    fail("control cluster placement must be left or right");
  }
  validateCharacterToken(characterToken);
  validateVisualOptions(initialVisualOptions);
  const stableCharacterToken: RunnerViewCharacterToken = Object.freeze({
    ...characterToken,
  });
  const initialSnapshot = session.getSnapshot();
  assertAuthenticRunnerLaboratoryCourse(
    course,
    initialSnapshot.state.runSeed,
    initialSnapshot.state.difficulty,
  );
  const generatedEntitiesById = new Map<string, RunnerLabGeneratedEntity>(
    course.patterns.flatMap((pattern) =>
      pattern.entities.map((entity) => [entity.instanceId, entity] as const)),
  );

  const section = createElement(document, "section", {
    className:
      `col-runner-view col-runner-view--controls-${controlClusterPlacement}`,
    attributes: {
      "aria-labelledby": "runner-status-heading",
      "data-runner-view": "",
    },
  });
  const heading = createElement(document, "h2", {
    text: "Runner status",
    attributes: { "id": "runner-status-heading", "tabindex": "-1" },
  });

  const entryPanel = createElement(document, "div", {
    className: "col-runner-entry",
    attributes: { "data-runner-entry": "" },
  });
  const orientation = createElement(document, "p", {
    text: "Time moves from right to left. Use the four-way movement pad: move up or down to catch helpful items and avoid hazards, and move left or right to choose a comfortable approach position.",
    attributes: { "data-runner-orientation": "" },
  });
  const startButton = button(document, "Start runner", "col-button col-button--primary");
  startButton.id = "runner-start-button";
  entryPanel.append(orientation, startButton);

  const summary = createElement(document, "dl", {
    className: "col-runner-summary",
    attributes: { "aria-label": "Current runner state" },
  });
  const modeField = summaryField(document, "Mode", "mode");
  const laneField = summaryField(document, "Lane", "lane");
  const motionField = summaryField(document, "Motion", "motion");
  const pauseField = summaryField(document, "Pause", "pause");
  summary.append(
    modeField.wrapper,
    laneField.wrapper,
    motionField.wrapper,
    pauseField.wrapper,
  );
  const nonLiveStatus = createElement(document, "p", {
    className: "col-runner-nonlive-status",
    attributes: {
      "tabindex": "0",
      "aria-live": "off",
      "data-runner-nonlive-status": "",
    },
  });

  const progressWrap = createElement(document, "div", {
    className: "col-runner-progress",
  });
  const progressLabel = createElement(document, "label", {
    text: "Runner laboratory progress",
    attributes: { "for": "runner-laboratory-progress" },
  });
  const progress = createElement(document, "progress", {
    attributes: {
      "id": "runner-laboratory-progress",
      "data-runner-progress": "",
    },
  });
  progressWrap.append(progressLabel, progress);

  const scores = createElement(document, "div", {
    className: "col-runner-scores",
    attributes: { "aria-label": "Life scores", "role": "group" },
  });
  const scoreOutputs = new Map<ScoreId, HTMLOutputElement>();
  for (const scoreId of SCORE_ORDER) {
    const card = createElement(document, "div", {
      className: "col-runner-score",
      attributes: { "data-runner-score": scoreId },
    });
    const label = createElement(document, "span", {
      className: "col-runner-score-label",
      text: RUNNER_SCORE_LABELS[scoreId],
    });
    const output = createElement(document, "output", {
      className: "col-runner-score-value",
      attributes: { "data-runner-score-output": scoreId },
    });
    scoreOutputs.set(scoreId, output);
    const bar = createElement(document, "span", {
      className: "col-runner-score-bar",
      attributes: { "aria-hidden": "true" },
    });
    bar.append(createElement(document, "span", {
      className: "col-runner-score-bar-fill",
    }));
    card.append(label, output, bar);
    scores.append(card);
  }

  const playSurface = createElement(document, "div", {
    className: "col-runner-play-surface",
    attributes: {
      "aria-hidden": "true",
      "data-runner-play-surface": "",
    },
  });
  const visualFrame = createElement(document, "div", {
    className: "col-runner-visual-frame",
  });
  const world = createElement(document, "div", {
    className: "col-runner-world",
  });
  const roomBackdrop = createV5RoomBackdrop(document, "playroom", "park");
  cleanup.push(() => roomBackdrop.dispose());
  const farLayer = createElement(document, "div", {
    className: "col-runner-world-layer col-runner-world-layer--far",
    attributes: { "data-runner-scroll-layer": "far" },
  });
  const nearLayer = createElement(document, "div", {
    className: "col-runner-world-layer col-runner-world-layer--near",
    attributes: { "data-runner-scroll-layer": "near" },
  });
  const laneLayer = createElement(document, "div", {
    className: "col-runner-lanes",
  });
  for (const lane of LANES) {
    laneLayer.append(createElement(document, "div", {
      className: "col-runner-lane",
      attributes: { "data-runner-lane": String(lane) },
    }));
  }
  const warningLayer = createElement(document, "div", {
    className: "col-runner-warning-layer",
    attributes: {
      "aria-hidden": "true",
      "data-runner-warning-layer": "",
    },
  });
  const warningNodes = LANES.map((lane) => createElement(document, "div", {
    className: "col-runner-warning-lane",
    attributes: { "data-runner-warning-lane": String(lane) },
  })) as [HTMLDivElement, HTMLDivElement, HTMLDivElement];
  warningLayer.append(...warningNodes);
  const entityField = createElement(document, "div", {
    className: "col-runner-entity-field",
  });
  const player = createElement(document, "div", {
    className: "col-runner-player",
    text: "●",
    attributes: {
      "data-runner-player": "",
      "data-foot-anchor": "bottom-center",
    },
  });
  player.dataset.bodySet = stableCharacterToken.bodySet;
  player.dataset.artSet = stableCharacterToken.artSet;
  player.dataset.hairShape = stableCharacterToken.hairShape;
  player.dataset.hairTone = stableCharacterToken.hairTone;
  player.dataset.clothingTone = stableCharacterToken.clothingTone;
  const figure = createElement(document, "span", {
    className: "col-runner-player__figure",
    attributes: { "aria-hidden": "true" },
  });
  for (const frame of ["walk-a", "walk-b"] as const) {
    const actorWrap = createElement(document, "span", {
      className: [
        "col-polish-actor",
        "col-polish-actor--character",
        "col-runner-player__frame",
        `col-runner-player__frame--${frame}`,
      ].join(" "),
    });
    actorWrap.append(createCharacterElement(document, createCharacterModel({
      characterId: `runner-player-${frame}`,
      label: "Runner",
      gender: stableCharacterToken.bodySet === "feminine" ? "female" : "male",
      heritage: stableCharacterToken.artSet,
      lifeStage: "young-adult",
      direction: "right",
      motion: frame,
      seed: "runner-player",
      appearance: {
        hairStyleId: stableCharacterToken.hairShape,
        hairColorId: stableCharacterToken.hairTone,
        clothingPaletteId: stableCharacterToken.clothingTone,
      },
    })));
    figure.append(actorWrap);
  }
  player.append(figure);
  player.classList.add("col-runner-player--figure");
  world.append(roomBackdrop.canvas, farLayer, nearLayer, laneLayer, entityField, player);
  playSurface.append(world);
  visualFrame.append(warningLayer, playSurface, progressWrap, scores);

  const controlArea = createElement(document, "div", {
    className: "col-runner-control-area",
  });
  const bindingInstructions = createElement(document, "p", {
    className: "col-runner-binding-instructions",
    attributes: { "data-runner-binding-instructions": "" },
  });
  const laneCluster = createElement(document, "div", {
    className:
      `col-runner-controls col-runner-controls--${controlClusterPlacement}`,
    attributes: { "data-runner-control-cluster": controlClusterPlacement },
  });
  const laneUpButton = button(
    document,
    "▲",
    "col-button col-runner-lane-button col-icon-button col-icon-button--up",
  );
  const laneDownButton = button(
    document,
    "▼",
    "col-button col-runner-lane-button col-icon-button col-icon-button--down",
  );
  laneUpButton.setAttribute("aria-label", "Move up");
  laneDownButton.setAttribute("aria-label", "Move down");
  laneUpButton.setAttribute("data-runner-lane-command", "lane-up");
  laneDownButton.setAttribute("data-runner-lane-command", "lane-down");
  const moveLeftButton = button(
    document,
    "◀",
    "col-button col-runner-lane-button col-runner-horizontal-button col-icon-button col-icon-button--left",
  );
  const moveRightButton = button(
    document,
    "▶",
    "col-button col-runner-lane-button col-runner-horizontal-button col-icon-button col-icon-button--right",
  );
  moveLeftButton.setAttribute("aria-label", "Move left");
  moveRightButton.setAttribute("aria-label", "Move right");
  moveLeftButton.setAttribute("aria-keyshortcuts", "ArrowLeft A");
  moveRightButton.setAttribute("aria-keyshortcuts", "ArrowRight D");
  moveLeftButton.dataset.runnerHorizontalCommand = "left";
  moveRightButton.dataset.runnerHorizontalCommand = "right";
  laneCluster.append(laneUpButton, moveLeftButton, moveRightButton, laneDownButton);
  const controlPlacementButton = button(
    document,
    controlClusterPlacement === "right"
      ? "Move lane controls to left side"
      : "Move lane controls to right side",
    "col-button col-button--quiet col-runner-control-placement",
  );
  controlPlacementButton.setAttribute("data-runner-control-placement", controlClusterPlacement);
  const pauseButton = button(
    document,
    "Pause",
    "col-button col-button--quiet col-icon-button col-icon-button--pause",
  );
  pauseButton.id = "runner-user-pause-button";
  pauseButton.setAttribute("data-runner-user-pause", "");
  const configureBindingsButton = button(
    document,
    "Configure supplemental keys",
    "col-button col-button--quiet col-runner-configure-bindings col-icon-button col-icon-button--settings",
  );
  configureBindingsButton.setAttribute("data-runner-configure-bindings", "");
  configureBindingsButton.disabled = true;
  controlArea.append(
    bindingInstructions,
    controlPlacementButton,
  );
  visualFrame.append(laneCluster, pauseButton, configureBindingsButton);

  const interruptionControls = createElement(document, "div", {
    className: "col-runner-interruptions",
    attributes: { "data-runner-interruptions": "" },
  });
  const visibilityResume = button(
    document,
    "Resume after returning to this page",
    "col-button col-button--primary",
  );
  visibilityResume.id = "runner-visibility-resume-button";
  visibilityResume.setAttribute("data-runner-resume", "visibility");
  const focusResume = button(
    document,
    "Resume after focus interruption",
    "col-button col-button--primary",
  );
  focusResume.id = "runner-focus-resume-button";
  focusResume.setAttribute("data-runner-resume", "focus-interruption");
  interruptionControls.append(visibilityResume, focusResume);

  const semanticElements = createRunnerSemanticFieldsetElements(document);
  const semanticFieldset = semanticElements.fieldset;
  const semanticChoices = semanticElements.choices;

  const statusRegion = createElement(document, "p", {
    className: "col-runner-live col-runner-live--status",
    attributes: {
      "role": "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-runner-live-status": "",
    },
  });
  const alertRegion = createElement(document, "p", {
    className: "col-runner-live col-runner-live--alert",
    attributes: {
      "role": "alert",
      "aria-live": "assertive",
      "aria-atomic": "true",
      "data-runner-live-alert": "",
    },
  });

  const completion = createElement(document, "div", {
    className: "col-runner-completion",
    attributes: {
      "data-runner-completion": "",
      "data-runner-completion-fact-id": RUNNER_LABORATORY_COMPLETION_FACT.factId,
      "data-runner-completion-memory-id": RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId,
    },
  });
  const completionHeading = createElement(document, "h3", {
    text: "Runner laboratory complete",
    attributes: { "id": "runner-completion-heading", "tabindex": "-1" },
  });
  const completionSummary = createElement(document, "p", {
    attributes: { "data-runner-completion-summary": "" },
  });
  const completionActions = createElement(document, "div", {
    className: "col-runner-completion-actions",
  });
  const practiceAgainButton = button(document, "Practice again", "col-button col-button--primary");
  const returnTitleButton = button(document, "Return to title", "col-button");
  practiceAgainButton.setAttribute("data-runner-practice-again", "");
  returnTitleButton.setAttribute("data-runner-return-title", "");
  completionActions.append(practiceAgainButton, returnTitleButton);
  completion.append(completionHeading, completionSummary, completionActions);

  const faultPanel = createElement(document, "div", {
    className: "col-runner-fault",
    attributes: { "data-runner-fault": "" },
  });
  const faultHeading = createElement(document, "h3", {
    text: "Runner needs attention",
    attributes: { "id": "runner-fault-heading", "tabindex": "-1" },
  });
  const faultSummary = createElement(document, "p", {
    text: DEFAULT_FAULT_SUMMARY,
    attributes: { "data-runner-fault-summary": "" },
  });
  const faultReturnTitleButton = button(
    document,
    "Return to title",
    "col-button col-button--primary",
  );
  faultReturnTitleButton.setAttribute("data-runner-fault-return-title", "");
  faultPanel.append(faultHeading, faultSummary, faultReturnTitleButton);

  const bindingDialog = createElement(document, "dialog", {
    className: "col-runner-binding-dialog",
    attributes: {
      "aria-labelledby": "runner-binding-dialog-heading",
      "aria-describedby": "runner-binding-dialog-description",
      "aria-modal": "true",
      "data-runner-binding-dialog": "",
    },
  });
  const bindingDialogHeading = createElement(document, "h3", {
    text: "Configure supplemental keys",
    attributes: { "id": "runner-binding-dialog-heading", "tabindex": "-1" },
  });
  const bindingDialogDescription = createElement(document, "p", {
    text: "Arrow Up and Arrow Down always work. Choose a supplemental control, then press one letter or number.",
    attributes: { "id": "runner-binding-dialog-description" },
  });
  const bindingRows = createElement(document, "div", {
    className: "col-runner-binding-rows",
  });
  const bindingUpValue = createElement(document, "kbd", {
    attributes: { "data-runner-binding-value": "lane-up" },
  });
  const bindingDownValue = createElement(document, "kbd", {
    attributes: { "data-runner-binding-value": "lane-down" },
  });
  const remapUpButton = button(document, "Change up key", "col-button");
  const remapDownButton = button(document, "Change down key", "col-button");
  remapUpButton.setAttribute("data-runner-remap", "lane-up");
  remapDownButton.setAttribute("data-runner-remap", "lane-down");
  const upRow = createElement(document, "div", {
    className: "col-runner-binding-row",
  });
  const upLabel = createElement(document, "span", { text: "Move up" });
  upRow.append(upLabel, bindingUpValue, remapUpButton);
  const downRow = createElement(document, "div", {
    className: "col-runner-binding-row",
  });
  const downLabel = createElement(document, "span", { text: "Move down" });
  downRow.append(downLabel, bindingDownValue, remapDownButton);
  bindingRows.append(upRow, downRow);
  const bindingDialogFeedback = createElement(document, "p", {
    className: "col-runner-binding-feedback",
    attributes: {
      "id": "runner-binding-dialog-feedback",
      "data-runner-binding-feedback": "",
    },
  });
  const bindingDialogError = createElement(document, "p", {
    className: "col-runner-binding-error",
    attributes: {
      "id": "runner-binding-dialog-error",
      "data-runner-binding-error": "",
    },
  });
  const bindingDescriptions =
    "runner-binding-dialog-feedback runner-binding-dialog-error";
  remapUpButton.setAttribute("aria-describedby", bindingDescriptions);
  remapDownButton.setAttribute("aria-describedby", bindingDescriptions);
  const bindingDialogActions = createElement(document, "div", {
    className: "col-runner-binding-actions",
  });
  const resetBindingsButton = button(document, "Reset to W and S", "col-button");
  const bindingReturnTitleButton = button(document, "Return to title", "col-button");
  const closeBindingDialogButton = button(document, "Close", "col-button col-button--primary");
  resetBindingsButton.setAttribute("data-runner-reset-bindings", "");
  bindingReturnTitleButton.setAttribute("data-runner-binding-return-title", "");
  closeBindingDialogButton.setAttribute("data-runner-close-bindings", "");
  bindingDialogActions.append(
    resetBindingsButton,
    bindingReturnTitleButton,
    closeBindingDialogButton,
  );
  bindingDialog.append(
    bindingDialogHeading,
    bindingDialogDescription,
    bindingRows,
    bindingDialogFeedback,
    bindingDialogError,
    bindingDialogActions,
  );

  const content = createElement(document, "div", {
    className: "col-runner-content",
    attributes: { "data-runner-modal-background": "" },
  });

  content.append(
    heading,
    entryPanel,
    summary,
    nonLiveStatus,
    visualFrame,
    controlArea,
    interruptionControls,
    semanticFieldset,
    statusRegion,
    alertRegion,
    completion,
    faultPanel,
  );
  section.append(content, bindingDialog);
  root.append(section);

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    cleanup.push(() => target.removeEventListener(type, listener));
  };

  let disposed = false;
  let currentSnapshot: RunnerViewSessionSnapshot | null = null;
  let unsubscribe = (): void => undefined;
  let lastProgressTicks: number | null = null;
  let lastProgressPhase: RunStateV1["stage"]["phase"] | null = null;
  let lastProgressStarted: boolean | null = null;
  let lastMotionKey = "";
  let lastNonLiveBoundaryKey = "";
  let semanticMarkerId: string | null = null;
  let lastStatusText = "";
  let pendingStatusText: string | null = null;
  let statusTimer: number | null = null;
  let lastStatusWriteTime: number | null = null;
  let lastAlertText = "";
  let bindingController: RunnerViewBindingController | null = null;
  let bindingDialogOpen = false;
  let bindingDialogInvoker: HTMLElement | null = null;
  let pendingRemapCommand: RunnerViewInputCommand | null = null;
  let horizontalPosition = 1;
  // Mirrors the presentation refresh's input gate. Without it this helper reset
  // `disabled` from position alone and re-enabled the horizontal buttons while
  // input was closed, until the next refresh happened to correct them.
  let horizontalInputOpen = false;
  const applyHorizontalPosition = (next: number): void => {
    horizontalPosition = Math.max(0, Math.min(2, next));
    player.style.setProperty("--col-runner-player-x", `${[32, 36, 40][horizontalPosition]}%`);
    player.dataset.horizontalPosition = ["left", "center", "right"][horizontalPosition];
    moveLeftButton.disabled = !horizontalInputOpen || horizontalPosition === 0;
    moveRightButton.disabled = !horizontalInputOpen || horizontalPosition === 2;
  };
  let presentationFault: string | null = null;
  let presentationFaultReportAttempted = false;
  let activeControlClusterPlacement: "left" | "right" = controlClusterPlacement;
  let activeVisualOptions: RunnerViewVisualOptions = Object.freeze({
    ...initialVisualOptions,
  });
  const entityElements = new Map<string, HTMLElement>();

  const clearStatusTimer = (): void => {
    if (statusTimer === null) return;
    ownerWindow.clearTimeout(statusTimer);
    statusTimer = null;
  };

  const writeStatus = (message: string, now: number): void => {
    lastStatusText = message;
    lastStatusWriteTime = now;
    statusRegion.textContent = message;
  };

  const flushPendingStatus = (): void => {
    statusTimer = null;
    if (disposed || pendingStatusText === null) return;
    const now = ownerWindow.performance.now();
    const elapsed = lastStatusWriteTime === null
      ? STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS
      : now - lastStatusWriteTime;
    if (elapsed < STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS) {
      statusTimer = ownerWindow.setTimeout(
        flushPendingStatus,
        STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS - elapsed,
      );
      return;
    }
    const message = pendingStatusText;
    pendingStatusText = null;
    if (message !== lastStatusText) writeStatus(message, now);
  };

  const setStatus = (message: string): void => {
    if (message === "" || disposed) return;
    const now = ownerWindow.performance.now();
    if (lastStatusWriteTime === null) {
      writeStatus(message, now);
      return;
    }
    if (message === lastStatusText) {
      pendingStatusText = null;
      clearStatusTimer();
      return;
    }
    if (message === pendingStatusText) return;
    pendingStatusText = message;
    const elapsed = now - lastStatusWriteTime;
    if (elapsed >= STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS) {
      clearStatusTimer();
      flushPendingStatus();
      return;
    }
    if (statusTimer === null) {
      statusTimer = ownerWindow.setTimeout(
        flushPendingStatus,
        STATUS_ANNOUNCEMENT_INTERVAL_MILLISECONDS - elapsed,
      );
    }
  };

  const setAlert = (message: string): void => {
    if (message === lastAlertText) return;
    lastAlertText = message;
    alertRegion.textContent = message;
  };

  const renderPersistentPresentationFault = (): void => {
    const message = presentationFault ?? UNEXPECTED_PRESENTATION_FAULT;
    const safely = (action: () => void): void => {
      try {
        action();
      } catch {
        // Fault recovery must remain non-recursive even if one DOM operation fails.
      }
    };
    safely(() => {
      pendingStatusText = null;
      clearStatusTimer();
    });
    safely(() => {
      bindingDialogOpen = false;
      bindingDialogInvoker = null;
      pendingRemapCommand = null;
      content.removeAttribute("inert");
      if (bindingDialog.open) {
        if (typeof bindingDialog.close === "function") bindingDialog.close();
        else bindingDialog.removeAttribute("open");
      }
    });
    safely(() => {
      section.dataset.status = "faulted";
      entryPanel.hidden = true;
      startButton.disabled = true;
      laneCluster.hidden = true;
      bindingInstructions.hidden = true;
      laneUpButton.disabled = true;
      laneDownButton.disabled = true;
      controlPlacementButton.hidden = true;
      controlPlacementButton.disabled = true;
      pauseButton.hidden = true;
      pauseButton.disabled = true;
      configureBindingsButton.disabled = true;
      visibilityResume.hidden = true;
      focusResume.hidden = true;
      semanticFieldset.hidden = true;
      for (const choice of semanticChoices) choice.disabled = true;
      completion.hidden = true;
      faultPanel.hidden = false;
      faultReturnTitleButton.disabled = false;
    });
    safely(() => setText(faultSummary, message));
    safely(() => setAlert(message));
    safely(() => focusSafely(faultReturnTitleButton));
  };

  const enterPersistentPresentationFault = (message: string): void => {
    if (disposed) return;
    if (presentationFault === null) presentationFault = message;
    renderPersistentPresentationFault();
    if (!presentationFaultReportAttempted) {
      presentationFaultReportAttempted = true;
      try {
        session.reportPresentationFault(presentationFault);
      } catch {
        // The local gate and recovery UI remain authoritative for this view.
      }
    }
    renderPersistentPresentationFault();
  };

  const setBindingFeedback = (message: string): void => {
    setText(bindingDialogFeedback, message);
    setStatus(message);
  };

  const setBindingError = (message: string): void => {
    setText(bindingDialogError, message);
    setAlert(message);
  };

  const updateBindings = (snapshot: RunnerViewBindingSnapshot): void => {
    if (disposed) return;
    const up = snapshot.instructions["lane-up"];
    const down = snapshot.instructions["lane-down"];
    const upShortcuts = snapshot.ariaKeyshortcuts["lane-up"];
    const downShortcuts = snapshot.ariaKeyshortcuts["lane-down"];
    if (
      typeof up !== "string" ||
      typeof down !== "string" ||
      typeof upShortcuts !== "string" ||
      typeof downShortcuts !== "string" ||
      up.trim().length === 0 ||
      down.trim().length === 0 ||
      upShortcuts.trim().length === 0 ||
      downShortcuts.trim().length === 0
    ) {
      fail("binding instructions must describe both lane commands");
    }
    laneUpButton.setAttribute(
      "aria-keyshortcuts",
      upShortcuts,
    );
    laneDownButton.setAttribute(
      "aria-keyshortcuts",
      downShortcuts,
    );
    setText(
      bindingInstructions,
      `Move up: ${up}. Move down: ${down}. Move left: Left Arrow or A. Move right: Right Arrow or D. You can also swipe vertically on the play surface.`,
    );
  };

  const supplementalBinding = (
    snapshot: RunnerViewBindingControllerSnapshot,
    command: RunnerViewInputCommand,
  ): RunnerViewKeyboardBinding => {
    const matches = snapshot.bindings.filter((binding) =>
      binding.command === command && !binding.immutable);
    if (matches.length !== 1) {
      fail(`binding controller must expose one supplemental ${command} key`);
    }
    const binding = matches[0]!;
    if (
      typeof binding.eventCode !== "string" ||
      typeof binding.displayLabel !== "string" ||
      typeof binding.ariaKeyshortcutsToken !== "string" ||
      binding.displayLabel.trim().length === 0
    ) {
      fail(`binding controller exposed an invalid ${command} key`);
    }
    return binding;
  };

  const applyBindingControllerSnapshot = (
    snapshot: RunnerViewBindingControllerSnapshot,
  ): void => {
    const upBinding = supplementalBinding(snapshot, "lane-up");
    const downBinding = supplementalBinding(snapshot, "lane-down");
    updateBindings(snapshot);
    setText(bindingUpValue, upBinding.displayLabel);
    bindingUpValue.setAttribute(
      "aria-label",
      `Move up supplemental key: ${upBinding.displayLabel}`,
    );
    setText(bindingDownValue, downBinding.displayLabel);
    bindingDownValue.setAttribute(
      "aria-label",
      `Move down supplemental key: ${downBinding.displayLabel}`,
    );
  };

  const updateVisualOptions = (next: RunnerViewVisualOptions): void => {
    if (disposed) return;
    validateVisualOptions(next);
    activeVisualOptions = Object.freeze({ ...next });
    section.dataset.contrast = activeVisualOptions.contrastMode;
    section.dataset.motionReduced = String(
      activeVisualOptions.motionReduced || motionPreference?.matches === true,
    );
    section.setAttribute(
      "data-text-scale",
      String(activeVisualOptions.textScaleMultiplier),
    );
    section.style.setProperty(
      "--col-runner-text-scale",
      String(activeVisualOptions.textScaleMultiplier),
    );
  };

  const onMotionPreferenceChange = (): void => {
    if (disposed) return;
    section.dataset.motionReduced = String(
      activeVisualOptions.motionReduced || motionPreference?.matches === true,
    );
  };

  const updateConfigureBindingsAvailability = (
    snapshot: RunnerViewSessionSnapshot | null,
  ): void => {
    const terminal = snapshot !== null && (
      snapshot.status === "faulted" ||
      snapshot.status === "disposed" ||
      isCompleted(snapshot) ||
      presentationFault !== null
    );
    configureBindingsButton.hidden = snapshot?.state.controlMode !== "manual";
    configureBindingsButton.disabled = bindingController === null ||
      terminal ||
      snapshot?.pauseReasons.includes("modal") === true ||
      bindingDialogOpen;
  };

  const applyControlClusterPlacement = (placement: "left" | "right"): void => {
    activeControlClusterPlacement = placement;
    section.classList.toggle("col-runner-view--controls-left", placement === "left");
    section.classList.toggle("col-runner-view--controls-right", placement === "right");
    laneCluster.classList.toggle("col-runner-controls--left", placement === "left");
    laneCluster.classList.toggle("col-runner-controls--right", placement === "right");
    laneCluster.dataset.runnerControlCluster = placement;
    controlPlacementButton.dataset.runnerControlPlacement = placement;
    setText(
      controlPlacementButton,
      placement === "right"
        ? "Move lane controls to left side"
        : "Move lane controls to right side",
    );
  };

  const dialogControls = (): readonly HTMLButtonElement[] => [
    remapUpButton,
    remapDownButton,
    resetBindingsButton,
    bindingReturnTitleButton,
    closeBindingDialogButton,
  ].filter((control) => !control.hidden && !control.disabled);

  const setPendingRemap = (command: RunnerViewInputCommand | null): void => {
    pendingRemapCommand = command;
    remapUpButton.setAttribute(
      "aria-pressed",
      String(command === "lane-up"),
    );
    remapDownButton.setAttribute(
      "aria-pressed",
      String(command === "lane-down"),
    );
    remapUpButton.dataset.capturing = String(command === "lane-up");
    remapDownButton.dataset.capturing = String(command === "lane-down");
  };

  const closeBindingDialog = (
    restoreInvoker = true,
    clearModalPause = true,
  ): boolean => {
    if (!bindingDialogOpen) return true;
    if (clearModalPause) {
      try {
        if (!session.setModalOpen(false)) {
          setBindingError(BINDING_CLOSE_ERROR);
          focusSafely(closeBindingDialogButton);
          return false;
        }
      } catch {
        setBindingError(BINDING_CLOSE_ERROR);
        focusSafely(closeBindingDialogButton);
        return false;
      }
    }
    bindingDialogOpen = false;
    setPendingRemap(null);
    content.removeAttribute("inert");
    const invoker = bindingDialogInvoker;
    bindingDialogInvoker = null;
    if (bindingDialog.open) {
      if (typeof bindingDialog.close === "function") bindingDialog.close();
      else bindingDialog.removeAttribute("open");
    }
    updateConfigureBindingsAvailability(currentSnapshot);
    if (restoreInvoker && invoker !== null) focusSafely(invoker);
    return true;
  };

  const leaveBindingDialogForTitle = (): void => {
    if (!bindingDialogOpen) return;
    bindingDialogOpen = false;
    setPendingRemap(null);
    content.removeAttribute("inert");
    bindingDialogInvoker = null;
    if (bindingDialog.open) {
      if (typeof bindingDialog.close === "function") bindingDialog.close();
      else bindingDialog.removeAttribute("open");
    }
    updateConfigureBindingsAvailability(currentSnapshot);
    onReturnToTitle();
  };

  const openBindingDialog = (invoker: HTMLElement): void => {
    const snapshot = currentSnapshot;
    if (
      disposed ||
      bindingDialogOpen ||
      bindingController === null ||
      snapshot === null ||
      snapshot.state.controlMode !== "manual" ||
      snapshot.status === "faulted" ||
      snapshot.status === "disposed" ||
      snapshot.pauseReasons.includes("modal") ||
      isCompleted(snapshot)
    ) {
      return;
    }
    applyBindingControllerSnapshot(bindingController.snapshot());
    bindingDialogInvoker = invoker;
    setBindingFeedback(
      "Choose Change up key or Change down key, then press one letter or number.",
    );
    setBindingError("");
    setPendingRemap(null);
    bindingDialogOpen = true;
    content.setAttribute("inert", "");
    try {
      if (typeof bindingDialog.showModal === "function") {
        bindingDialog.showModal();
      } else {
        bindingDialog.setAttribute("open", "");
      }
      updateConfigureBindingsAvailability(snapshot);
      if (!session.setModalOpen(true)) {
        closeBindingDialog(true, false);
        setAlert(BINDING_OPEN_ERROR);
        return;
      }
    } catch {
      closeBindingDialog(true, false);
      setAlert(BINDING_OPEN_ERROR);
      return;
    }
    const firstControl = dialogControls()[0];
    if (firstControl !== undefined) focusSafely(firstControl);
  };

  const beginRemap = (command: RunnerViewInputCommand): void => {
    if (!bindingDialogOpen || bindingController === null) return;
    setPendingRemap(command);
    setBindingError("");
    setBindingFeedback(
      `${INPUT_COMMAND_LABELS[command]} is waiting for one letter or number.`,
    );
    focusSafely(command === "lane-up" ? remapUpButton : remapDownButton);
  };

  const handleRemapKey = (event: KeyboardEvent): void => {
    const command = pendingRemapCommand;
    const controller = bindingController;
    if (command === null || controller === null) return;
    const result = controller.remap(command, {
      code: event.code,
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
    if (result.ok) {
      event.preventDefault();
      event.stopPropagation();
    }
    applyBindingControllerSnapshot(result.snapshot);
    if (!result.ok) {
      setBindingError(REMAP_FAILURE_MESSAGES[result.reason]);
      setBindingFeedback(
        `${INPUT_COMMAND_LABELS[command]} is still waiting for another key.`,
      );
      return;
    }
    const binding = supplementalBinding(result.snapshot, command);
    setPendingRemap(null);
    setBindingError("");
    setBindingFeedback(
      `${INPUT_COMMAND_LABELS[command]} supplemental key changed to ${binding.displayLabel}.`,
    );
    focusSafely(command === "lane-up" ? remapUpButton : remapDownButton);
  };

  const attachBindingController = (
    controller: RunnerViewBindingController,
  ): void => {
    if (disposed) fail("cannot attach bindings after disposal");
    if (
      typeof controller?.snapshot !== "function" ||
      typeof controller.remap !== "function" ||
      typeof controller.resetBindings !== "function"
    ) {
      fail("binding controller is incomplete");
    }
    if (bindingController !== null && bindingController !== controller) {
      fail("a binding controller is already attached");
    }
    const nextSnapshot = controller.snapshot();
    applyBindingControllerSnapshot(nextSnapshot);
    bindingController = controller;
    updateConfigureBindingsAvailability(currentSnapshot);
  };

  const updateNonLiveStatus = (
    state: RunStateV1,
    model: RunnerPresentationModel | null,
  ): void => {
    const boundaryKey = nonLiveBoundaryKey(state, model);
    if (boundaryKey === lastNonLiveBoundaryKey) return;
    lastNonLiveBoundaryKey = boundaryKey;
    setText(nonLiveStatus, nonLiveRunnerSummary(state, model));
  };

  const updateProgress = (
    next: RunnerViewSessionSnapshot,
    previous: RunnerViewSessionSnapshot | null,
  ): void => {
    const ticks = next.state.stage.activeTicks;
    const phase = next.state.stage.phase;
    const previousMotion = previous?.state.runner?.motion ?? null;
    const nextMotion = next.state.runner?.motion ?? null;
    const movementBoundary = previousMotion !== null &&
      nextMotion !== null &&
      motionKey(previousMotion) !== motionKey(nextMotion);
    const boundary = previous === null ||
      next.started !== lastProgressStarted ||
      phase !== lastProgressPhase ||
      next.status === "completed" ||
      ticks === 0 ||
      ticks === next.state.stage.durationTicks ||
      movementBoundary ||
      hasProgressBoundary(next.events);
    const elapsed = lastProgressTicks === null
      ? Number.POSITIVE_INFINITY
      : ticks >= lastProgressTicks
        ? ticks - lastProgressTicks
        : lastProgressTicks - ticks;
    progress.max = next.state.stage.durationTicks;
    if (!boundary && elapsed < PROGRESS_TICKS_PER_SECOND) return;
    if (progress.value !== ticks) progress.value = ticks;
    progress.setAttribute(
      "aria-valuetext",
      `${ticks} of ${next.state.stage.durationTicks} active ticks`,
    );
    lastProgressTicks = ticks;
    lastProgressPhase = phase;
    lastProgressStarted = next.started;
  };

  const updateScores = (state: RunStateV1): void => {
    for (const scoreId of SCORE_ORDER) {
      const output = scoreOutputs.get(scoreId)!;
      const value = state.scores[scoreId];
      setText(output, String(value));
      output.closest(".col-runner-score")?.setAttribute(
        "style",
        `--col-runner-score-fill:${Math.max(0, Math.min(100, value))}%`,
      );
      output.setAttribute(
        "aria-label",
        `${RUNNER_SCORE_LABELS[scoreId]}: ${value} out of 100`,
      );
    }
  };

  const updatePlayerAndWorld = (state: RunStateV1): void => {
    const runner = state.runner;
    if (runner === null) {
      player.hidden = true;
      entityField.replaceChildren();
      entityElements.clear();
      return;
    }
    player.hidden = false;
    const motion = runner.motion;
    const currentPosition = runnerLanePositionMilli({
      motion,
      inputBuffer: runner.inputBuffer,
    });
    player.style.setProperty(
      "--col-runner-lane-y",
      lanePositionPercent(currentPosition),
    );
    player.style.setProperty(
      "--col-runner-target-lane-y",
      lanePositionPercent(motion.targetLane * 1000),
    );
    player.dataset.motion = motion.kind;
    player.dataset.currentLane = String(motion.currentLane);
    player.dataset.targetLane = String(motion.targetLane);
    const scrollPercent = -((state.stage.worldDistanceMilli % 500000) / 5000);
    farLayer.style.setProperty(
      "--col-runner-world-offset",
      `${scrollPercent * 0.35}%`,
    );
    nearLayer.style.setProperty(
      "--col-runner-world-offset",
      `${scrollPercent}%`,
    );

    const activeIds = new Set(runner.activeEntities.map((entity) => entity.instanceId));
    for (const [instanceId, element] of entityElements) {
      if (activeIds.has(instanceId)) continue;
      element.remove();
      entityElements.delete(instanceId);
    }
    for (const entity of runner.activeEntities) {
      let element = entityElements.get(entity.instanceId);
      if (element === undefined) {
        element = createElement(document, "div", {
          className: `col-runner-entity col-runner-entity--${entity.kind}`,
          text: entitySymbol(entity),
          attributes: {
            "data-runner-entity-id": entity.instanceId,
            "data-runner-entity-kind": entity.kind,
            "data-runner-content-id": entity.contentId,
          },
        });
        const tokenCanvas = document.createElement("canvas");
        tokenCanvas.width = 104;
        tokenCanvas.height = 104;
        tokenCanvas.className = "col-runner-entity__art";
        tokenCanvas.setAttribute("aria-hidden", "true");
        const tokenContext = tokenCanvas.getContext("2d");
        if (tokenContext !== null) {
          const tokenKind = entityTokenKind(entity);
          const item = entity.kind === "opportunity"
            ? { id: "contest", emoji: "?", label: "Choice" }
            : entity.contentId.includes("health")
            ? { id: "apple", emoji: "♥", label: "Health" }
            : entity.contentId.includes("happiness")
              ? { id: "toy", emoji: "★", label: "Happy" }
              : entity.contentId.includes("money")
                ? { id: "coin", emoji: "$", label: "Money" }
                : entity.contentId.includes("pressure")
                  ? { id: "noise", emoji: "!", label: "Stress" }
                  : { id: "spill", emoji: "!", label: "Clutter" };
          drawEventItem(
            tokenContext,
            52,
            96,
            item.id,
            item.emoji,
            item.label,
            tokenKind !== "hazard",
            false,
            0,
          );
          element.append(tokenCanvas);
          element.classList.add("col-runner-entity--art");
        }
        entityElements.set(entity.instanceId, element);
      }
      const rawXPercent = entity.xMilli / 5000;
      const xPercent = rawXPercent < -20
        ? -20
        : rawXPercent > 120
          ? 120
          : rawXPercent;
      element.style.setProperty("--col-runner-entity-x", `${xPercent}%`);
      element.style.setProperty(
        "--col-runner-entity-y",
        lanePositionPercent(entity.lane * 1000),
      );
      element.dataset.contactState = entity.contactState;
      entityField.append(element);
    }
  };

  const updateWarningsAndSemantic = (
    model: RunnerPresentationModel | null,
    snapshot: RunnerViewSessionSnapshot,
  ): { readonly previousMarker: string | null; readonly nextMarker: string | null } => {
    const previousMarker = semanticMarkerId;
    if (model === null) {
      warningLayer.hidden = true;
      semanticFieldset.hidden = true;
      semanticMarkerId = null;
      return { previousMarker, nextMarker: null };
    }

    warningLayer.hidden = false;
    warningLayer.dataset.patternIndex = String(model.warning.patternIndex);
    for (const lane of LANES) {
      const warning = model.warning.lanes[lane];
      const node = warningNodes[lane];
      node.dataset.warningLabel = warning.accessibleLabel;
      setText(
        node,
        `${warning.laneLabel}: ${warning.benefitText}; ${warning.hazardText}; ${warning.urgencyText}`,
      );
    }

    const independentlyPaused = snapshot.pauseReasons.some((reason) =>
      reason !== "semantic");
    const rendered = renderRunnerSemanticFieldset(
      semanticElements,
      model,
      independentlyPaused,
    );
    if (rendered === null) {
      semanticMarkerId = null;
      return { previousMarker, nextMarker: null };
    }
    semanticMarkerId = rendered.decisionMarkerInstanceId;
    return { previousMarker, nextMarker: semanticMarkerId };
  };

  const buildStatusMessage = (
    snapshot: RunnerViewSessionSnapshot,
    previous: RunnerViewSessionSnapshot | null,
    model: RunnerPresentationModel | null,
    completionMessage: string | null,
    semanticTransition: {
      readonly previousMarker: string | null;
      readonly nextMarker: string | null;
    },
  ): Readonly<{
    readonly message: string | null;
    readonly contactError: string | null;
  }> => {
    if (previous === null) {
      if (isCompleted(snapshot)) {
        return Object.freeze({
          message: completionMessage ?? "Runner laboratory complete.",
          contactError: null,
        });
      }
      if (!snapshot.started) {
        return Object.freeze({
          message: "Runner ready. Review the orientation, then press Start runner.",
          contactError: null,
        });
      }
    }
    const messages: string[] = [];
    const optional = activeVisualOptions.announceOptional;
    const contacts: string[] = [];
    let contactError: string | null = null;
    for (const event of snapshot.events) {
      if (event.type !== "contact-resolved") continue;
      const result = scoreDeltaText(
        event,
        generatedEntitiesById.get(event.contact.entityInstanceId),
        snapshot.state.scores,
      );
      if (result.message !== null) contacts.push(result.message);
      if (result.error !== null) contactError = result.error;
    }
    if (optional && contacts.length > 0) messages.push(contacts.join(" "));

    if (snapshot.events.some((event) => event.type === "start-acknowledged")) {
      messages.push("Runner started.");
    }
    if (
      optional &&
      model !== null &&
      snapshot.events.some((event) => event.type === "pattern-appended")
    ) {
      messages.push(warningAnnouncement(model));
    }
    if (optional) {
      const decision = snapshot.events.find((event) =>
        event.type === "decision-marker-resolved");
      if (decision?.type === "decision-marker-resolved") {
        messages.push(`Lane choice confirmed: ${RUNNER_LANE_LABELS[decision.targetLane]}.`);
      }
      if (
        semanticTransition.nextMarker !== null &&
        semanticTransition.nextMarker !== semanticTransition.previousMarker &&
        model?.semanticDecision !== null
      ) {
        messages.push("Lane choice ready. This decision is untimed.");
      }
    }
    if (snapshot.events.some((event) =>
      event.type === "runtime-pause-changed" ||
      event.type === "user-pause-changed")) {
      messages.push(snapshot.pauseReasons.length === 0
        ? "Runner resumed."
        : `Runner paused: ${pauseSummary(snapshot.pauseReasons)}.`);
    }
    if (snapshot.notice?.tone !== "error") {
      if (snapshot.notice !== null) messages.push(snapshot.notice.message);
    }
    if (isCompleted(snapshot) && !isCompleted(previous ?? snapshot)) {
      messages.push(completionMessage ?? "Runner laboratory complete.");
    }
    return Object.freeze({
      message: messages.length === 0 ? null : messages.join(" "),
      contactError,
    });
  };

  const focusRunnerTerminalTarget = (
    snapshot: RunnerViewSessionSnapshot,
  ): boolean => {
    if (presentationFault !== null || snapshot.status === "faulted") {
      if (!faultPanel.hidden && !faultReturnTitleButton.hidden &&
        !faultReturnTitleButton.disabled) {
        focusSafely(faultReturnTitleButton);
      } else {
        focusSafely(heading);
      }
      return true;
    }
    if (isCompleted(snapshot)) {
      focusSafely(completion.hidden ? heading : completionHeading);
      return true;
    }
    return false;
  };

  const focusRunnerRestorationTarget = (
    snapshot: RunnerViewSessionSnapshot,
  ): void => {
    const interruptionTarget = [visibilityResume, focusResume].find((control) =>
      !control.hidden && !control.disabled);
    if (interruptionTarget !== undefined) {
      focusSafely(interruptionTarget);
      return;
    }

    const semanticTarget = semanticFieldset.hidden
      ? undefined
      : semanticChoices.find((choice) => !choice.hidden && !choice.disabled);
    if (semanticTarget !== undefined) {
      focusSafely(semanticTarget);
      return;
    }

    if (
      !snapshot.started && !entryPanel.hidden &&
      !startButton.hidden && !startButton.disabled
    ) {
      focusSafely(startButton);
      return;
    }

    if (!pauseButton.hidden && !pauseButton.disabled) {
      focusSafely(pauseButton);
      return;
    }

    focusSafely(heading.hidden ? nonLiveStatus : heading);
  };

  const updateFocus = (
    snapshot: RunnerViewSessionSnapshot,
    previous: RunnerViewSessionSnapshot | null,
    semanticTransition: {
      readonly previousMarker: string | null;
      readonly nextMarker: string | null;
    },
  ): void => {
    if (previous === null) return;
    if (focusRunnerTerminalTarget(snapshot)) {
      return;
    }
    const visibilityOpened = !previous.pauseReasons.includes("visibility") &&
      snapshot.pauseReasons.includes("visibility");
    const focusOpened = !previous.pauseReasons.includes("focus-interruption") &&
      snapshot.pauseReasons.includes("focus-interruption");
    if (visibilityOpened) {
      focusSafely(visibilityResume);
      return;
    }
    if (focusOpened) {
      focusSafely(focusResume);
      return;
    }
    const interruptionClosed = (
      previous.pauseReasons.includes("visibility") &&
      !snapshot.pauseReasons.includes("visibility")
    ) || (
      previous.pauseReasons.includes("focus-interruption") &&
      !snapshot.pauseReasons.includes("focus-interruption")
    );
    if (interruptionClosed) {
      focusRunnerRestorationTarget(snapshot);
      return;
    }
    const userOpened = previous.state.runner?.userPaused !== true &&
      snapshot.state.runner?.userPaused === true;
    if (userOpened) {
      focusSafely(pauseButton);
      return;
    }
    if (
      semanticTransition.nextMarker !== null &&
      semanticTransition.nextMarker !== semanticTransition.previousMarker &&
      !semanticChoices[0].disabled
    ) {
      focusSafely(semanticChoices[0]);
      return;
    }
    if (!previous.started && snapshot.started) {
      focusSafely(pauseButton);
      return;
    }
    const userClosed = previous.state.runner?.userPaused === true &&
      snapshot.state.runner?.userPaused !== true;
    if (userClosed) {
      focusRunnerRestorationTarget(snapshot);
      return;
    }
    if (
      semanticTransition.previousMarker !== null &&
      semanticTransition.nextMarker === null
    ) {
      focusSafely(heading);
    }
  };

  const renderSnapshot = (snapshot: RunnerViewSessionSnapshot): void => {
    if (disposed || snapshot === currentSnapshot) return;
    const previous = currentSnapshot;
    const state = snapshot.state;
    const model = createRunnerPresentationModel(state, course);

    section.dataset.controlMode = state.controlMode;
    setText(modeField.value, MODE_LABELS[state.controlMode]);
    setText(pauseField.value, pauseSummary(snapshot.pauseReasons));
    const runner = state.runner;
    if (runner !== null) {
      const nextMotionKey = motionKey(runner.motion);
      if (nextMotionKey !== lastMotionKey) {
        lastMotionKey = nextMotionKey;
        setText(laneField.value, laneSummary(runner.motion));
        setText(motionField.value, motionSummary(runner.motion));
      }
    } else {
      lastMotionKey = "none";
      setText(laneField.value, "No lane");
      setText(motionField.value, "Unavailable");
    }

    updateProgress(snapshot, previous);
    updateScores(state);
    updatePlayerAndWorld(state);
    const semanticTransition = updateWarningsAndSemantic(model, snapshot);
    updateNonLiveStatus(state, model);

    const complete = isCompleted(snapshot);
    const completionMessage = complete ? completionSummaryText(state) : null;
    const statusUpdate = buildStatusMessage(
      snapshot,
      previous,
      model,
      completionMessage,
      semanticTransition,
    );
    const openedPresentationFault = statusUpdate.contactError !== null &&
      presentationFault === null;
    if (openedPresentationFault) presentationFault = statusUpdate.contactError;
    const locallyFaulted = presentationFault !== null;
    section.dataset.status = locallyFaulted ? "faulted" : snapshot.status;

    const terminal = complete || snapshot.status === "faulted" ||
      snapshot.status === "disposed" || locallyFaulted;
    if (
      terminal &&
      (bindingDialogOpen || bindingDialog.open || content.hasAttribute("inert"))
    ) {
      bindingDialogOpen = false;
      bindingDialogInvoker = null;
      setPendingRemap(null);
      content.removeAttribute("inert");
      if (bindingDialog.open) {
        if (typeof bindingDialog.close === "function") bindingDialog.close();
        else bindingDialog.removeAttribute("open");
      }
    }
    entryPanel.hidden = snapshot.started || terminal;
    startButton.disabled = snapshot.status !== "awaiting-start" || locallyFaulted;
    const inputOpen = snapshot.started &&
      snapshot.status === "running" &&
      state.controlMode === "manual" &&
      snapshot.pauseReasons.length === 0 &&
      state.runStatus === "active" &&
      state.stage.phase === "active" &&
      !locallyFaulted;
    laneCluster.hidden = state.controlMode !== "manual" || !snapshot.started || terminal;
    bindingInstructions.hidden = laneCluster.hidden;
    controlPlacementButton.hidden = laneCluster.hidden;
    controlPlacementButton.disabled = bindingDialogOpen || terminal;
    laneUpButton.disabled = !inputOpen;
    laneDownButton.disabled = !inputOpen;
    horizontalInputOpen = inputOpen;
    moveLeftButton.disabled = !inputOpen || horizontalPosition === 0;
    moveRightButton.disabled = !inputOpen || horizontalPosition === 2;
    pauseButton.hidden = !snapshot.started || terminal;
    const userPaused = state.runner?.userPaused === true;
    setText(pauseButton, userPaused ? "Resume" : "Pause");
    pauseButton.setAttribute("aria-pressed", String(userPaused));
    if (userPaused) pauseButton.setAttribute("data-runner-resume", "user");
    else pauseButton.removeAttribute("data-runner-resume");
    pauseButton.disabled = snapshot.status === "settling";
    visibilityResume.hidden = terminal || !snapshot.pauseReasons.includes("visibility");
    visibilityResume.disabled = terminal;
    focusResume.hidden = terminal || !snapshot.pauseReasons.includes("focus-interruption");
    focusResume.disabled = terminal;
    if (terminal) {
      semanticFieldset.hidden = true;
      for (const choice of semanticChoices) choice.disabled = true;
    }

    completion.hidden = !complete || locallyFaulted;
    if (completionMessage !== null) setText(completionSummary, completionMessage);
    faultPanel.hidden = snapshot.status !== "faulted" && !locallyFaulted;
    setText(faultSummary, presentationFault ?? DEFAULT_FAULT_SUMMARY);
    updateConfigureBindingsAvailability(snapshot);

    if (statusUpdate.message !== null) setStatus(statusUpdate.message);
    const error = presentationFault ?? (
      snapshot.status === "faulted" || snapshot.notice?.tone === "error"
      ? snapshot.notice?.message ??
        "The runner stopped because of an error. Return to the title and try again."
      : ""
    );
    setAlert(error);
    updateFocus(snapshot, previous, semanticTransition);
    currentSnapshot = snapshot;
    if (openedPresentationFault && presentationFault !== null) {
      enterPersistentPresentationFault(presentationFault);
    }
  };

  const consumeSnapshot = (snapshot: RunnerViewSessionSnapshot): void => {
    if (disposed) return;
    if (presentationFault !== null) {
      renderPersistentPresentationFault();
      return;
    }
    try {
      renderSnapshot(snapshot);
    } catch {
      enterPersistentPresentationFault(UNEXPECTED_PRESENTATION_FAULT);
    }
  };

  listen(startButton, "click", () => {
    if (!session.start()) {
      setAlert("The runner could not start. Review the current status and try again.");
      return;
    }
    consumeSnapshot(session.getSnapshot());
  });
  listen(pauseButton, "click", () => {
    const active = currentSnapshot?.state.runner?.userPaused === true;
    if (!session.setUserPaused(!active)) {
      setAlert("The pause state could not be changed. Review the current interruption controls.");
      return;
    }
    consumeSnapshot(session.getSnapshot());
  });
  listen(moveLeftButton, "click", () => applyHorizontalPosition(horizontalPosition - 1));
  listen(moveRightButton, "click", () => applyHorizontalPosition(horizontalPosition + 1));
  listen(ownerWindow, "keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    const target = keyboardEvent.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    // Modifier combinations belong to the browser and the operating system:
    // Alt+ArrowLeft is Back, and Cmd/Ctrl+Arrow moves the caret or switches
    // workspaces. Never claim them.
    if (
      keyboardEvent.altKey || keyboardEvent.ctrlKey ||
      keyboardEvent.metaKey || keyboardEvent.shiftKey
    ) {
      return;
    }
    // The binding dialog captures its own keys for remapping. Without this the
    // window listener also fires, so one ArrowLeft both fails a remap and moves
    // the player behind the open dialog.
    if (bindingDialogOpen) return;
    const horizontalButton = keyboardEvent.code === "ArrowLeft" ||
        keyboardEvent.code === "KeyA"
      ? moveLeftButton
      : keyboardEvent.code === "ArrowRight" || keyboardEvent.code === "KeyD"
      ? moveRightButton
      : null;
    if (horizontalButton === null) return;
    // Only consume the key when the press is actually accepted. Preventing the
    // default first meant a paused, unstarted, or already-at-the-edge runner
    // still swallowed the arrow key and broke browser scrolling.
    if (horizontalButton.disabled) return;
    keyboardEvent.preventDefault();
    horizontalButton.click();
  });
  listen(controlPlacementButton, "click", () => {
    if (controlPlacementButton.hidden || controlPlacementButton.disabled) return;
    applyControlClusterPlacement(
      activeControlClusterPlacement === "right" ? "left" : "right",
    );
  });
  listen(visibilityResume, "click", () => {
    if (!session.resumeInterruption("visibility")) {
      setAlert("The visibility interruption is no longer waiting for Resume.");
      return;
    }
    consumeSnapshot(session.getSnapshot());
  });
  listen(focusResume, "click", () => {
    if (!session.resumeInterruption("focus-interruption")) {
      setAlert("The focus interruption is no longer waiting for Resume.");
      return;
    }
    consumeSnapshot(session.getSnapshot());
  });
  listen(configureBindingsButton, "click", (event) => {
    openBindingDialog(event.currentTarget as HTMLElement);
  });
  listen(remapUpButton, "click", () => beginRemap("lane-up"));
  listen(remapDownButton, "click", () => beginRemap("lane-down"));
  listen(resetBindingsButton, "click", () => {
    if (!bindingDialogOpen || bindingController === null) return;
    const resetSnapshot = bindingController.resetBindings();
    applyBindingControllerSnapshot(resetSnapshot);
    setPendingRemap(null);
    setBindingError("");
    setBindingFeedback("Default supplemental keys restored: W for up and S for down.");
    focusSafely(resetBindingsButton);
  });
  listen(closeBindingDialogButton, "click", () => closeBindingDialog());
  listen(bindingReturnTitleButton, "click", leaveBindingDialogForTitle);
  listen(bindingDialog, "cancel", (event) => {
    event.preventDefault();
    closeBindingDialog();
  });
  listen(bindingDialog, "close", () => {
    if (bindingDialogOpen) closeBindingDialog();
  });
  listen(bindingDialog, "keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      closeBindingDialog();
      return;
    }
    if (keyboardEvent.key === "Tab") {
      const controls = dialogControls();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (first === undefined || last === undefined) {
        keyboardEvent.preventDefault();
        focusSafely(bindingDialogHeading);
        return;
      }
      const active = document.activeElement;
      if (
        keyboardEvent.shiftKey &&
        (active === first || !bindingDialog.contains(active))
      ) {
        keyboardEvent.preventDefault();
        focusSafely(last);
      } else if (
        !keyboardEvent.shiftKey &&
        (active === last || !bindingDialog.contains(active))
      ) {
        keyboardEvent.preventDefault();
        focusSafely(first);
      }
      return;
    }
    handleRemapKey(keyboardEvent);
  });
  for (const lane of LANES) {
    listen(semanticChoices[lane], "click", () => {
      if (!session.chooseLane(lane)) {
        setAlert("That lane choice is no longer available. Review the current runner status.");
        focusSafely(heading);
        return;
      }
      consumeSnapshot(session.getSnapshot());
    });
  }
  listen(practiceAgainButton, "click", () => onPracticeAgain());
  listen(returnTitleButton, "click", () => onReturnToTitle());
  listen(faultReturnTitleButton, "click", () => onReturnToTitle());
  listen(document, "visibilitychange", () => {
    const snapshot = currentSnapshot;
    if (disposed || snapshot === null) return;
    if (
      document.visibilityState !== "visible" ||
      !snapshot.pauseReasons.includes("visibility")
    ) return;
    if (focusRunnerTerminalTarget(snapshot)) return;
    if (!visibilityResume.hidden && !visibilityResume.disabled) {
      focusSafely(visibilityResume);
    }
  });
  listen(ownerWindow, "focus", () => {
    const snapshot = currentSnapshot;
    if (disposed || snapshot === null) return;
    if (!snapshot.pauseReasons.includes("focus-interruption")) return;
    if (focusRunnerTerminalTarget(snapshot)) return;
    if (!focusResume.hidden && !focusResume.disabled) {
      focusSafely(focusResume);
    }
  });
  if (motionPreference !== null) {
    if (typeof motionPreference.addEventListener === "function") {
      listen(motionPreference, "change", onMotionPreferenceChange);
    } else {
      const legacyPreference = motionPreference as MediaQueryList & {
        addListener(listener: () => void): void;
        removeListener(listener: () => void): void;
      };
      legacyPreference.addListener(onMotionPreferenceChange);
      cleanup.push(() => legacyPreference.removeListener(onMotionPreferenceChange));
    }
  }

  updateBindings(DEFAULT_BINDINGS);
  applyHorizontalPosition(1);
  updateVisualOptions(initialVisualOptions);
  try {
    consumeSnapshot(initialSnapshot);
    unsubscribe = session.subscribe(consumeSnapshot);
  } catch (error) {
    disposed = true;
    for (const remove of cleanup.splice(0).reverse()) remove();
    section.remove();
    throw error;
  }

  if (!focusRunnerTerminalTarget(initialSnapshot)) {
    focusRunnerRestorationTarget(initialSnapshot);
  }

  return Object.freeze({
    section,
    playSurface,
    laneUpButton,
    laneDownButton,
    getInputGateSnapshot(): RunnerViewInputGateSnapshot {
      const snapshot = currentSnapshot ?? initialSnapshot;
      return Object.freeze({
        started: !disposed && presentationFault === null &&
          snapshot.status !== "faulted" && snapshot.status !== "disposed" &&
          snapshot.status !== "completed" && snapshot.started,
        controlMode: snapshot.state.controlMode,
        pauseReasons: Object.freeze(
          disposed
            ? ["view-disposed"]
            : presentationFault === null
              ? [...snapshot.pauseReasons]
              : [...snapshot.pauseReasons, "presentation-fault"],
        ),
        dialogOpen: bindingDialogOpen || snapshot.pauseReasons.includes("modal"),
        runStatus: snapshot.state.runStatus,
        stagePhase: snapshot.state.stage.phase,
      });
    },
    attachBindingController,
    updateBindings,
    updateVisualOptions,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pendingStatusText = null;
      clearStatusTimer();
      if (bindingDialogOpen) {
        bindingDialogOpen = false;
        setPendingRemap(null);
        content.removeAttribute("inert");
        if (bindingDialog.open) {
          if (typeof bindingDialog.close === "function") bindingDialog.close();
          else bindingDialog.removeAttribute("open");
        }
        try {
          session.setModalOpen(false);
        } catch {
          // Remaining owned resources must still be released.
        }
      }
      try {
        unsubscribe();
      } catch {
        // Presentation disposal still removes every owned DOM listener.
      }
      for (const remove of cleanup.splice(0).reverse()) remove();
      entityElements.clear();
      section.remove();
    },
  });
}
