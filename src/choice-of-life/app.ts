import "./style.css";

import { generateRunnerLaboratoryCourse } from "./core/runner/course-generator";
import {
  NEWBORN_STAGE_CONTRACT,
  type NewbornAction,
  type NewbornState,
} from "./core/newborn/index";
import type { RunStateV1 } from "./core/run-state";
import type {
  EncounterChapterAction,
  EncounterChapterState,
} from "./core/shell-contracts";
import { createBrowserDependencies } from "./platform/browser-shell";
import { createBrowserRunnerSession } from "./platform/browser-runner-session";
import { CleanupBag } from "./platform/lifecycle";
import {
  mountRunnerInputDom,
  type RunnerInputDomAdapter,
} from "./platform/runner-input-dom";
import type { RunnerSession } from "./platform/runner-session";
import type {
  BrowserDependencies,
  ChoiceOfLifeShellPort,
  ReadyRun,
  RunActionResult,
  SettingsActionResult,
  ShellNotice,
  ShellSnapshot,
} from "./presentation/contracts";
import { appendText, createElement, createScorePreview, scoreItemsFromScores } from "./presentation/elements";
import {
  CLOTHING_PALETTES,
  CONTROL_MODES,
  DEFAULT_SETTINGS,
  DEFAULT_SETUP,
  DIFFICULTIES,
  GENDERS,
  HAIR_COLORS,
  HAIR_STYLES,
  HERITAGE_STYLES,
  STARTING_PROFILES,
  cloneSettings,
  cloneSetup,
  getScorePreview,
  getStartingProfile,
  type AppearanceSelection,
  type ChoiceOption,
  type ControlMode,
  type Difficulty,
  type Gender,
  type SetupSelection,
  type StartingProfileId,
  type TextScale,
  type VisualSettings,
} from "./presentation/model";
import {
  mountRunnerView,
  type RunnerView,
  type RunnerViewCharacterToken,
  type RunnerViewVisualOptions,
} from "./presentation/runner-view";
import { mountNewbornView, type NewbornView } from "./presentation/newborn-view";
import { mountEncounterView, type EncounterView } from "./presentation/encounter-view";

export type { BrowserDependencies, ChoiceOfLifeShellPort } from "./presentation/contracts";
export type { SetupSelection, VisualSettings } from "./presentation/model";

export interface ChoiceOfLifeApp {
  dispose(): void;
}

export function mountChoiceOfLifeInBrowser(root: HTMLElement): ChoiceOfLifeApp {
  return mountChoiceOfLife(root, createBrowserDependencies());
}

type Screen = "title" | "setup" | "ready" | "newborn" | "encounters" | "runner";

interface LocalState {
  screen: Screen;
  setup: SetupSelection;
  readyRun: ReadyRun | null;
  settings: VisualSettings;
  settingsOpen: boolean;
  pending: "start" | "continue" | "settings" | null;
  notice: ShellNotice | null;
}

interface MountedRunner {
  readonly session: RunnerSession;
  readonly view: RunnerView;
  readonly input: RunnerInputDomAdapter;
  readonly unsubscribeInputGate: () => void;
}

interface MountedNewborn {
  readonly view: NewbornView;
  readonly stopClock: () => void;
}

interface MountedEncounter {
  readonly view: EncounterView;
  readonly stopClock: () => void;
}

const mountedRoots = new WeakMap<HTMLElement, ChoiceOfLifeApp>();
const PENDING_STATUS_ID = "choice-life-pending-status";
const NOTICE_ID = "choice-life-notice";
const NEWBORN_TICK_INTERVAL_MS = 100;
const NEWBORN_TICKS_PER_INTERVAL = Math.max(
  1,
  Math.round(NEWBORN_TICK_INTERVAL_MS / NEWBORN_STAGE_CONTRACT.tickDurationMs),
);
const ENCOUNTER_TICK_INTERVAL_MS = 250;
const ENCOUNTER_TICKS_PER_INTERVAL = 5;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function safeSnapshot(port: ChoiceOfLifeShellPort): ShellSnapshot {
  try {
    return port.getSnapshot();
  } catch {
    return {
      canContinue: false,
      savedRun: null,
      settings: DEFAULT_SETTINGS,
      notice: {
        tone: "warning",
        message: "Saved data is unavailable right now. You can still begin a life in this session.",
      },
    };
  }
}

function errorNotice(message: string): ShellNotice {
  return { tone: "error", message };
}

function cloneAppearance(appearance: AppearanceSelection): AppearanceSelection {
  return { ...appearance };
}

function runnerCharacterToken(state: RunStateV1): RunnerViewCharacterToken {
  return Object.freeze({
    bodySet: state.identity.gender === "female" ? "feminine" : "masculine",
    artSet: state.appearance.heritageStyleId,
    hairShape: state.appearance.hairStyleId,
    hairTone: state.appearance.hairColorId,
    clothingTone: state.appearance.clothingPaletteId,
  });
}

function runnerVisualOptions(settings: VisualSettings): RunnerViewVisualOptions {
  const textScaleMultiplier = ({
    100: 1,
    125: 1.25,
    150: 1.5,
    200: 2,
  } as const)[settings.textScale];
  return Object.freeze({
    contrastMode: settings.highContrast ? "high" : "standard",
    motionReduced: settings.reducedMotion,
    textScaleMultiplier,
    announceOptional: settings.screenReaderAnnouncements,
  });
}

export function mountChoiceOfLife(root: HTMLElement, dependencies: BrowserDependencies): ChoiceOfLifeApp {
  mountedRoots.get(root)?.dispose();

  const document = root.ownerDocument;
  const lifetime = new CleanupBag();
  let renderLifetime = new CleanupBag();
  let disposed = false;
  let operationVersion = 0;
  let settingsOpenerId: string | null = null;
  let focusAfterRenderId: string | null = null;
  let mountedRunner: MountedRunner | null = null;
  let mountedNewborn: MountedNewborn | null = null;
  let mountedEncounter: MountedEncounter | null = null;
  let newbornActionInProgress = false;
  let encounterActionInProgress = false;
  let runnerActionInProgress = false;
  let runnerCommitInProgress = false;
  let snapshot = safeSnapshot(dependencies.shell);
  const state: LocalState = {
    screen: "title",
    setup: cloneSetup(),
    readyRun: null,
    settings: cloneSettings(snapshot.settings),
    settingsOpen: false,
    pending: null,
    notice: null,
  };

  root.classList.add("choice-life-root");

  const listen = <T extends EventTarget>(
    target: T,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void => renderLifetime.listen(target, type, listener);

  const applySettings = (): void => {
    root.dataset.contrast = state.settings.highContrast ? "high" : "standard";
    root.dataset.reducedMotion = state.settings.reducedMotion ? "true" : "false";
    root.style.setProperty("--col-text-scale", String(state.settings.textScale / 100));
  };

  const renderNotice = (parent: HTMLElement): void => {
    const notice = state.notice ?? snapshot.notice;
    if (!notice) {
      return;
    }
    const shouldAnnounce = state.settings.screenReaderAnnouncements || notice.tone === "error";
    parent.append(
      createElement(document, "p", {
        className: `col-notice col-notice--${notice.tone}`,
        text: notice.message,
        attributes: {
          "id": NOTICE_ID,
          "role": shouldAnnounce ? (notice.tone === "error" ? "alert" : "status") : "note",
          "aria-live": shouldAnnounce ? (notice.tone === "error" ? "assertive" : "polite") : "off",
        },
      }),
    );
  };

  const renderPendingStatus = (parent: HTMLElement): void => {
    if (!state.pending) {
      return;
    }
    const message = state.pending === "start"
      ? "Creating life…"
      : state.pending === "continue"
        ? "Continuing life…"
        : "Saving settings…";
    const shouldAnnounce = state.settings.screenReaderAnnouncements;
    parent.append(
      createElement(document, "p", {
        className: "col-pending-status",
        text: message,
        attributes: {
          "id": PENDING_STATUS_ID,
          "tabindex": "-1",
          "role": shouldAnnounce ? "status" : "note",
          "aria-live": shouldAnnounce ? "polite" : "off",
          "aria-atomic": "true",
        },
      }),
    );
  };

  const setScreen = (screen: Screen): void => {
    if (state.pending) {
      return;
    }
    if (state.screen === "runner" && screen !== "runner") {
      disposeMountedRunner();
      snapshot = safeSnapshot(dependencies.shell);
      state.settings = cloneSettings(snapshot.settings);
    }
    if (state.screen === "newborn" && screen !== "newborn") {
      disposeMountedNewborn();
      snapshot = safeSnapshot(dependencies.shell);
      state.settings = cloneSettings(snapshot.settings);
    }
    if (state.screen === "encounters" && screen !== "encounters") {
      disposeMountedEncounter();
      snapshot = safeSnapshot(dependencies.shell);
      state.settings = cloneSettings(snapshot.settings);
    }
    state.screen = screen;
    state.notice = null;
    focusAfterRenderId = screen === "title"
      ? "title-actions-heading"
      : screen === "setup"
        ? "setup-heading"
        : screen === "ready"
          ? "ready-heading"
          : screen === "newborn"
            ? "newborn-stage-heading"
            : screen === "encounters"
              ? "encounter-stage-heading"
              : "runner-status-heading";
    render();
  };

  const createButton = (label: string, className = "col-button"): HTMLButtonElement => {
    const button = createElement(document, "button", { className, text: label });
    button.type = "button";
    return button;
  };

  const openSettings = (opener: HTMLElement): void => {
    settingsOpenerId = opener.id;
    state.settings = cloneSettings(snapshot.settings);
    state.settingsOpen = true;
    render();
  };

  const closeSettings = (): void => {
    const restoreId = settingsOpenerId;
    settingsOpenerId = null;
    state.settingsOpen = false;
    render();
    restoreSettingsFocus(restoreId);
  };

  const completeRunAction = (result: RunActionResult): void => {
    state.pending = null;
    state.notice = result.notice ?? null;
    if (result.kind === "ready") {
      state.readyRun = result.run;
      state.screen = "ready";
      focusAfterRenderId = "ready-heading";
    } else {
      state.screen = "title";
      focusAfterRenderId = "title-actions-heading";
    }
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    render();
  };

  const performRunAction = async (
    kind: "start" | "continue",
    action: () => ReturnType<ChoiceOfLifeShellPort["startNewLife"]>,
  ): Promise<void> => {
    if (state.pending || disposed) {
      return;
    }
    const version = ++operationVersion;
    state.pending = kind;
    state.notice = null;
    focusAfterRenderId = PENDING_STATUS_ID;
    render();
    try {
      const result = await action();
      if (!disposed && version === operationVersion) {
        completeRunAction(result);
      }
    } catch {
      if (!disposed && version === operationVersion) {
        state.pending = null;
        state.notice = errorNotice("That action could not be completed. Your existing saved life was not changed.");
        focusAfterRenderId = NOTICE_ID;
        render();
      }
    }
  };

  const createSettingsButton = (): HTMLButtonElement => {
    const button = createButton("Settings", "col-button col-button--quiet");
    button.id = `choice-life-settings-${state.screen}`;
    button.disabled = state.pending !== null;
    button.setAttribute("aria-haspopup", "dialog");
    listen(button, "click", () => openSettings(button));
    return button;
  };

  const renderHeader = (main: HTMLElement): void => {
    const header = createElement(document, "header", { className: "col-header" });
    const eyebrow = createElement(document, "p", { className: "col-eyebrow", text: "A life shaped by small choices" });
    const title = createElement(document, "h1", { text: "Choice of Life", attributes: { "id": "choice-life-title" } });
    const subtitle = createElement(document, "p", {
      className: "col-subtitle",
      text: "Move through time, care for what matters, and see how decisions echo forward.",
    });
    header.append(eyebrow, title, subtitle);
    main.append(header);
  };

  const renderTitle = (main: HTMLElement): void => {
    const panel = createElement(document, "section", {
      className: "col-panel col-title-panel",
      attributes: { "aria-labelledby": "title-actions-heading" },
    });
    panel.append(createElement(document, "h2", { text: "Begin your journey", attributes: { "id": "title-actions-heading" } }));
    panel.append(
      createElement(document, "p", {
        text: "There is no single perfect life. Health, happiness, and financial security create different possibilities—not a moral ranking.",
      }),
    );

    if (snapshot.savedRun) {
      const saved = createElement(document, "p", { className: "col-saved-summary" });
      appendText(document, saved, `Saved life: ${snapshot.savedRun.label}.`);
      panel.append(saved);
    }

    const actions = createElement(document, "div", { className: "col-actions" });
    const newButton = createButton("New life", "col-button col-button--primary");
    newButton.disabled = state.pending !== null;
    listen(newButton, "click", () => setScreen("setup"));
    actions.append(newButton);

    if (snapshot.canContinue) {
      const continueButton = createButton(state.pending === "continue" ? "Continuing…" : "Continue life");
      continueButton.disabled = state.pending !== null;
      listen(continueButton, "click", () => {
        void performRunAction("continue", () => dependencies.shell.continueLife());
      });
      actions.append(continueButton);
    }
    actions.append(createSettingsButton());
    panel.append(actions);
    renderPendingStatus(panel);
    renderNotice(panel);
    main.append(panel);
  };

  const appendRadioCards = <T extends string>(
    fieldset: HTMLFieldSetElement,
    name: string,
    options: readonly ChoiceOption<T>[],
    selected: T,
    onChange: (value: T) => void,
  ): void => {
    const list = createElement(document, "div", { className: "col-option-grid" });
    for (const option of options) {
      const label = createElement(document, "label", { className: "col-option-card" });
      const input = createElement(document, "input");
      input.type = "radio";
      input.name = name;
      input.value = option.id;
      input.checked = option.id === selected;
      const copy = createElement(document, "span", { className: "col-option-copy" });
      copy.append(
        createElement(document, "strong", { text: option.label }),
        createElement(document, "span", { text: option.description }),
      );
      label.append(input, copy);
      listen(input, "change", () => {
        if (input.checked) {
          onChange(option.id);
        }
      });
      list.append(label);
    }
    fieldset.append(list);
  };

  const createSelect = <T extends string>(
    id: string,
    labelText: string,
    options: readonly ChoiceOption<T>[],
    selected: T,
    onChange: (value: T) => void,
  ): HTMLElement => {
    const wrapper = createElement(document, "div", { className: "col-field" });
    const label = createElement(document, "label", { text: labelText, attributes: { "for": id } });
    const select = createElement(document, "select", { attributes: { id } });
    for (const option of options) {
      const item = createElement(document, "option", { text: option.label });
      item.value = option.id;
      item.selected = option.id === selected;
      select.append(item);
    }
    listen(select, "change", () => onChange(select.value as T));
    wrapper.append(label, select);
    return wrapper;
  };

  const updateProfilePreview = (profileId: StartingProfileId): void => {
    const profile = getStartingProfile(profileId);
    const description = root.querySelector<HTMLElement>("[data-profile-description]");
    if (description) {
      description.textContent = profile.description;
    }
    for (const item of getScorePreview(profileId)) {
      const output = root.querySelector<HTMLOutputElement>(`[data-score-value="${item.id}"]`);
      const meter = root.querySelector<HTMLMeterElement>(`[data-score-meter="${item.id}"]`);
      if (output) {
        output.value = String(item.value);
        output.textContent = String(item.value);
        output.setAttribute("aria-label", `${item.label}: ${item.value} out of 100`);
      }
      if (meter) {
        meter.value = item.value;
      }
    }
  };

  const renderSetup = (main: HTMLElement): void => {
    const panel = createElement(document, "section", {
      className: "col-panel",
      attributes: { "aria-labelledby": "setup-heading" },
    });
    panel.append(createElement(document, "h2", { text: "Set up this life", attributes: { "id": "setup-heading" } }));
    panel.append(
      createElement(document, "p", {
        className: "col-supporting-copy",
        text: "These choices set context, controls, and character art. Art sets do not assert identity or nationality and never change opportunities or scores.",
      }),
    );

    const form = createElement(document, "form", { className: "col-setup-form" });
    form.noValidate = true;

    const contextFieldset = createElement(document, "fieldset");
    contextFieldset.append(createElement(document, "legend", { text: "Starting context" }));
    appendRadioCards(contextFieldset, "starting-profile", STARTING_PROFILES.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
    })), state.setup.startingProfileId, (value) => {
      state.setup = { ...state.setup, startingProfileId: value };
      updateProfilePreview(value);
    });
    const selectedProfile = getStartingProfile(state.setup.startingProfileId);
    contextFieldset.append(
      createElement(document, "p", {
        className: "col-profile-description",
        text: selectedProfile.description,
        attributes: {
          "data-profile-description": "",
          "aria-live": state.settings.screenReaderAnnouncements ? "polite" : "off",
        },
      }),
      createScorePreview(
        document,
        getScorePreview(state.setup.startingProfileId),
        "col-score-grid",
        state.settings.screenReaderAnnouncements,
      ),
    );

    const difficultyFieldset = createElement(document, "fieldset");
    difficultyFieldset.append(createElement(document, "legend", { text: "Difficulty" }));
    appendRadioCards(difficultyFieldset, "difficulty", DIFFICULTIES, state.setup.difficulty, (value: Difficulty) => {
      state.setup = { ...state.setup, difficulty: value };
    });

    const controlsFieldset = createElement(document, "fieldset");
    controlsFieldset.append(createElement(document, "legend", { text: "Runner controls" }));
    appendRadioCards(controlsFieldset, "control-mode", CONTROL_MODES, state.setup.controlMode, (value: ControlMode) => {
      state.setup = { ...state.setup, controlMode: value };
    });

    const genderFieldset = createElement(document, "fieldset");
    genderFieldset.append(createElement(document, "legend", { text: "Character set" }));
    appendRadioCards(genderFieldset, "gender", GENDERS, state.setup.gender, (value: Gender) => {
      state.setup = { ...state.setup, gender: value };
    });

    const appearanceFieldset = createElement(document, "fieldset");
    appearanceFieldset.append(createElement(document, "legend", { text: "Cosmetic appearance" }));
    const appearanceGrid = createElement(document, "div", { className: "col-select-grid" });
    appearanceGrid.append(
      createSelect("heritage-style", "Character-art set", HERITAGE_STYLES, state.setup.appearance.heritageStyleId, (value) => {
        state.setup = { ...state.setup, appearance: { ...cloneAppearance(state.setup.appearance), heritageStyleId: value } };
      }),
      createSelect("hair-style", "Hair style", HAIR_STYLES, state.setup.appearance.hairStyleId, (value) => {
        state.setup = { ...state.setup, appearance: { ...cloneAppearance(state.setup.appearance), hairStyleId: value } };
      }),
      createSelect("hair-color", "Hair color", HAIR_COLORS, state.setup.appearance.hairColorId, (value) => {
        state.setup = { ...state.setup, appearance: { ...cloneAppearance(state.setup.appearance), hairColorId: value } };
      }),
      createSelect("clothing-palette", "Clothing colors", CLOTHING_PALETTES, state.setup.appearance.clothingPaletteId, (value) => {
        state.setup = { ...state.setup, appearance: { ...cloneAppearance(state.setup.appearance), clothingPaletteId: value } };
      }),
    );
    appearanceFieldset.append(appearanceGrid);

    const actions = createElement(document, "div", { className: "col-actions col-actions--between" });
    const back = createButton("Back", "col-button col-button--quiet");
    back.disabled = state.pending !== null;
    listen(back, "click", () => setScreen("title"));
    const start = createElement(document, "button", {
      className: "col-button col-button--primary",
      text: state.pending === "start" ? "Creating life…" : "Create this life",
    });
    start.type = "submit";
    start.disabled = state.pending !== null;
    actions.append(back, createSettingsButton(), start);

    form.append(contextFieldset, difficultyFieldset, controlsFieldset, genderFieldset, appearanceFieldset, actions);
    listen(form, "submit", (event) => {
      event.preventDefault();
      const selection = cloneSetup(state.setup);
      void performRunAction("start", () => dependencies.shell.startNewLife(selection));
    });
    panel.append(form);
    renderPendingStatus(panel);
    renderNotice(panel);
    main.append(panel);
  };

  const renderReady = (main: HTMLElement): void => {
    const panel = createElement(document, "section", {
      className: "col-panel col-ready-panel",
      attributes: { "aria-labelledby": "ready-heading" },
    });
    panel.append(
      createElement(document, "p", { className: "col-success-mark", text: "Ready" }),
      createElement(document, "h2", { text: "Your life is ready", attributes: { "id": "ready-heading" } }),
      createElement(document, "p", {
        text: "The deterministic starting state is saved. Begin the actual newborn stage, or open the runner laboratory as optional practice.",
      }),
    );
    if (state.readyRun) {
      const profile = getStartingProfile(state.readyRun.startingProfileId);
      panel.append(
        createElement(document, "p", {
          className: "col-run-summary",
          text: `${profile.label} · ${state.readyRun.difficulty} difficulty · ${state.readyRun.controlMode}`,
        }),
        createScorePreview(
          document,
          scoreItemsFromScores(state.readyRun.scores),
          "col-score-grid col-score-grid--ready",
          state.settings.screenReaderAnnouncements,
        ),
      );
    }
    const actions = createElement(document, "div", { className: "col-actions" });
    if (dependencies.newborn) {
      const newbornProgress = dependencies.newborn.currentNewbornState();
      const newbornButton = createButton(
        newbornProgress?.phase === "complete"
          ? "Review newborn recap"
          : newbornProgress
            ? "Continue newborn stage"
            : "Start newborn stage",
        newbornProgress?.phase === "complete"
          ? "col-button col-button--quiet"
          : "col-button col-button--primary",
      );
      newbornButton.setAttribute("data-newborn-enter", "");
      newbornButton.disabled = state.pending !== null;
      listen(newbornButton, "click", enterNewborn);
      actions.append(newbornButton);
      if (newbornProgress?.phase === "complete" && dependencies.encounters) {
        const encounterProgress = dependencies.encounters.currentEncounterState();
        const encounterButton = createButton(
          encounterProgress?.phase === "complete"
            ? "Review encounters & consequences"
            : encounterProgress
              ? "Continue encounters & consequences"
              : "Continue to encounters",
          "col-button col-button--primary",
        );
        encounterButton.setAttribute("data-encounter-enter", "");
        encounterButton.disabled = state.pending !== null;
        listen(encounterButton, "click", enterEncounters);
        actions.append(encounterButton);
      }
    }
    if (dependencies.runner) {
      const runnerButton = createButton(
        "Open runner laboratory (practice)",
        "col-button col-button--quiet",
      );
      runnerButton.setAttribute("data-runner-enter", "");
      runnerButton.disabled = state.pending !== null;
      listen(runnerButton, "click", enterRunnerLaboratory);
      actions.append(runnerButton);
    }
    const titleButton = createButton("Return to title");
    titleButton.disabled = state.pending !== null;
    listen(titleButton, "click", () => setScreen("title"));
    actions.append(titleButton, createSettingsButton());
    panel.append(actions);
    renderPendingStatus(panel);
    renderNotice(panel);
    main.append(panel);
  };

  function disposeMountedNewborn(): void {
    const runtime = mountedNewborn;
    mountedNewborn = null;
    if (runtime === null) return;
    try {
      runtime.stopClock();
    } finally {
      runtime.view.dispose();
    }
  }

  function newbornActionFailure(notice: ShellNotice): void {
    disposeMountedNewborn();
    state.screen = "ready";
    state.notice = notice;
    focusAfterRenderId = NOTICE_ID;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    render();
  }

  function dispatchNewborn(action: NewbornAction): void {
    if (
      disposed || newbornActionInProgress ||
      dependencies.newborn === undefined || mountedNewborn === null
    ) return;
    newbornActionInProgress = true;
    let result: ReturnType<typeof dependencies.newborn.dispatchNewborn>;
    try {
      result = dependencies.newborn.dispatchNewborn(action);
    } catch {
      newbornActionInProgress = false;
      newbornActionFailure(errorNotice(
        "The newborn stage could not apply that action. Your saved life was not changed.",
      ));
      return;
    }
    newbornActionInProgress = false;
    if (result.kind === "invalid") {
      newbornActionFailure(result.notice);
      return;
    }
    state.notice = result.notice ?? null;
    mountedNewborn?.view.render(result.state);
    if (result.state.phase === "complete") {
      mountedNewborn?.stopClock();
    }
  }

  function mountEnteredNewborn(
    enteredState: NewbornState,
    enteredNotice: ShellNotice | null,
  ): void {
    disposeMountedRunner();
    disposeMountedNewborn();
    disposeMountedEncounter();
    renderLifetime.dispose();
    renderLifetime = new CleanupBag();
    state.screen = "newborn";
    state.notice = enteredNotice;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    applySettings();

    const main = createElement(document, "main", {
      className: "col-shell col-newborn-shell",
      attributes: {
        "aria-labelledby": "choice-life-title",
        "aria-busy": "false",
      },
    });
    renderHeader(main);
    renderNotice(main);
    const newbornHost = createElement(document, "div", {
      className: "col-newborn-host",
      attributes: { "data-newborn-host": "" },
    });
    main.append(newbornHost);
    root.replaceChildren(main);

    let view: NewbornView | null = null;
    let clockId: number | null = null;
    const ownerWindow = document.defaultView;
    const stopClock = (): void => {
      if (clockId !== null && ownerWindow !== null) {
        ownerWindow.clearInterval(clockId);
        clockId = null;
      }
    };
    try {
      view = mountNewbornView(newbornHost, {
        dispatch: dispatchNewborn,
        onContinue: continueFromNewborn,
        onReturnToTitle: returnFromNewbornToTitle,
      });
      mountedNewborn = Object.freeze({ view, stopClock });
      view.render(enteredState);
      root.querySelector<HTMLElement>("#newborn-stage-heading")?.focus();
      if (ownerWindow !== null && enteredState.phase !== "complete") {
        clockId = ownerWindow.setInterval(() => {
          if (document.visibilityState !== "hidden") {
            dispatchNewborn({ type: "advance", ticks: NEWBORN_TICKS_PER_INTERVAL });
          }
        }, NEWBORN_TICK_INTERVAL_MS);
      }
    } catch {
      stopClock();
      view?.dispose();
      newbornActionFailure(errorNotice(
        "The newborn room could not be displayed. Return to the title and continue your life to retry.",
      ));
    }
  }

  function enterNewborn(): void {
    if (disposed || newbornActionInProgress || dependencies.newborn === undefined) {
      return;
    }
    newbornActionInProgress = true;
    let result: ReturnType<typeof dependencies.newborn.enterNewborn>;
    try {
      result = dependencies.newborn.enterNewborn();
    } catch {
      newbornActionInProgress = false;
      newbornActionFailure(errorNotice(
        "The newborn stage could not be opened. Your saved life was not changed.",
      ));
      return;
    }
    newbornActionInProgress = false;
    if (result.kind === "invalid") {
      newbornActionFailure(result.notice);
      return;
    }
    mountEnteredNewborn(result.state, result.notice ?? null);
  }

  function continueFromNewborn(): void {
    if (disposed) return;
    if (dependencies.encounters !== undefined) {
      enterEncounters();
      return;
    }
    disposeMountedNewborn();
    state.screen = "ready";
    state.notice = {
      tone: "status",
      message: "The newborn chapter is complete. Your result is ready for the next life stage.",
    };
    focusAfterRenderId = NOTICE_ID;
    render();
  }

  function returnFromNewbornToTitle(): void {
    if (disposed) return;
    setScreen("title");
  }

  function disposeMountedEncounter(): void {
    const runtime = mountedEncounter;
    mountedEncounter = null;
    if (runtime === null) return;
    try {
      runtime.stopClock();
    } finally {
      runtime.view.dispose();
    }
  }

  function encounterActionFailure(notice: ShellNotice): void {
    disposeMountedEncounter();
    state.screen = "ready";
    state.notice = notice;
    focusAfterRenderId = NOTICE_ID;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    render();
  }

  function dispatchEncounter(action: EncounterChapterAction): void {
    if (
      disposed || encounterActionInProgress ||
      dependencies.encounters === undefined || mountedEncounter === null
    ) return;
    encounterActionInProgress = true;
    let result: ReturnType<typeof dependencies.encounters.dispatchEncounter>;
    try {
      result = dependencies.encounters.dispatchEncounter(action);
    } catch {
      encounterActionInProgress = false;
      encounterActionFailure(errorNotice(
        "That life choice could not be applied. Your completed newborn chapter is unchanged.",
      ));
      return;
    }
    encounterActionInProgress = false;
    if (result.kind === "invalid") {
      encounterActionFailure(result.notice);
      return;
    }
    state.notice = result.notice ?? null;
    mountedEncounter?.view.render(result.state);
    if (result.state.phase === "complete") {
      mountedEncounter?.stopClock();
    }
  }

  function mountEnteredEncounters(
    enteredState: EncounterChapterState,
    enteredNotice: ShellNotice | null,
  ): void {
    disposeMountedRunner();
    disposeMountedNewborn();
    disposeMountedEncounter();
    renderLifetime.dispose();
    renderLifetime = new CleanupBag();
    state.screen = "encounters";
    state.notice = enteredNotice;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    applySettings();

    const main = createElement(document, "main", {
      className: "col-shell col-encounter-shell",
      attributes: {
        "aria-labelledby": "choice-life-title",
        "aria-busy": "false",
      },
    });
    renderHeader(main);
    renderNotice(main);
    const encounterHost = createElement(document, "div", {
      className: "col-encounter-host",
      attributes: { "data-encounter-host": "" },
    });
    main.append(encounterHost);
    root.replaceChildren(main);

    let view: EncounterView | null = null;
    let clockId: number | null = null;
    const ownerWindow = document.defaultView;
    const stopClock = (): void => {
      if (clockId !== null && ownerWindow !== null) {
        ownerWindow.clearInterval(clockId);
        clockId = null;
      }
    };
    try {
      view = mountEncounterView(encounterHost, {
        dispatch: dispatchEncounter,
        onContinueToEducation: continueFromEncounters,
        onReturnToReady: returnFromEncountersToReady,
      });
      mountedEncounter = Object.freeze({ view, stopClock });
      view.render(enteredState);
      root.querySelector<HTMLElement>("#encounter-stage-heading")?.focus();
      if (ownerWindow !== null && enteredState.phase !== "complete") {
        clockId = ownerWindow.setInterval(() => {
          if (document.visibilityState !== "hidden") {
            dispatchEncounter({ type: "advance", ticks: ENCOUNTER_TICKS_PER_INTERVAL });
          }
        }, ENCOUNTER_TICK_INTERVAL_MS);
      }
    } catch {
      stopClock();
      view?.dispose();
      encounterActionFailure(errorNotice(
        "Encounters and consequences could not be displayed. Your newborn result is still available.",
      ));
    }
  }

  function enterEncounters(): void {
    if (disposed || encounterActionInProgress || dependencies.encounters === undefined) {
      return;
    }
    encounterActionInProgress = true;
    let result: ReturnType<typeof dependencies.encounters.enterEncounters>;
    try {
      result = dependencies.encounters.enterEncounters();
    } catch {
      encounterActionInProgress = false;
      encounterActionFailure(errorNotice(
        "Encounters and consequences could not be opened. Your newborn result is unchanged.",
      ));
      return;
    }
    encounterActionInProgress = false;
    if (result.kind === "invalid") {
      encounterActionFailure(result.notice);
      return;
    }
    mountEnteredEncounters(result.state, result.notice ?? null);
  }

  function continueFromEncounters(): void {
    if (disposed) return;
    disposeMountedEncounter();
    state.screen = "ready";
    state.notice = {
      tone: "status",
      message: "Encounters and consequences are complete. Education can now begin with these facts, memories, and relationships.",
    };
    focusAfterRenderId = NOTICE_ID;
    render();
  }

  function returnFromEncountersToReady(): void {
    if (disposed) return;
    setScreen("ready");
  }

  function disposeRunnerParts(
    input: RunnerInputDomAdapter | null,
    view: RunnerView | null,
    session: RunnerSession | null,
  ): void {
    try {
      input?.dispose();
    } finally {
      try {
        view?.dispose();
      } finally {
        session?.dispose();
      }
    }
  }

  function disposeMountedRunner(): void {
    const runtime = mountedRunner;
    mountedRunner = null;
    if (runtime === null) return;
    try {
      runtime.unsubscribeInputGate();
    } finally {
      disposeRunnerParts(runtime.input, runtime.view, runtime.session);
    }
  }

  function runnerActionFailure(notice: ShellNotice): void {
    disposeMountedRunner();
    state.screen = "ready";
    state.notice = notice;
    focusAfterRenderId = NOTICE_ID;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(snapshot.settings);
    render();
  }

  function mountEnteredRunner(
    enteredState: RunStateV1,
    enteredNotice: ShellNotice | null,
  ): void {
    disposeMountedRunner();
    disposeMountedEncounter();
    renderLifetime.dispose();
    renderLifetime = new CleanupBag();
    state.screen = "runner";
    state.notice = enteredNotice;
    snapshot = safeSnapshot(dependencies.shell);
    state.settings = cloneSettings(enteredState.accessibility);
    applySettings();

    const main = createElement(document, "main", {
      className: "col-shell col-runner-shell",
      attributes: {
        "aria-labelledby": "choice-life-title",
        "aria-busy": "false",
      },
    });
    renderHeader(main);
    renderNotice(main);
    const runnerHost = createElement(document, "div", {
      className: "col-runner-host",
      attributes: { "data-runner-host": "" },
    });
    main.append(runnerHost);
    root.replaceChildren(main);

    let session: RunnerSession | null = null;
    let view: RunnerView | null = null;
    let input: RunnerInputDomAdapter | null = null;
    let unsubscribeInputGate = (): void => undefined;
    try {
      const runnerShell = dependencies.runner;
      if (runnerShell === undefined) {
        throw new TypeError("runner capability is unavailable");
      }
      const ownerWindow = document.defaultView;
      if (ownerWindow === null) {
        throw new TypeError("runner document has no owning window");
      }
      const course = generateRunnerLaboratoryCourse(
        enteredState.runSeed,
        enteredState.difficulty,
      );
      const sessionShell = {
        currentRunState: () => runnerShell.currentRunState(),
        enterRunnerLaboratory: () => runnerShell.enterRunnerLaboratory(),
        restartRunnerLaboratory: () => runnerShell.restartRunnerLaboratory(),
        saveRunnerLaboratoryState: (candidate: RunStateV1) => {
          runnerCommitInProgress = true;
          try {
            return runnerShell.saveRunnerLaboratoryState(candidate);
          } finally {
            runnerCommitInProgress = false;
          }
        },
      };
      session = createBrowserRunnerSession(sessionShell, document);
      view = mountRunnerView({
        dom: document,
        root: runnerHost,
        session,
        course,
        characterToken: runnerCharacterToken(enteredState),
        visualOptions: runnerVisualOptions(state.settings),
        onPracticeAgain: practiceRunnerAgain,
        onReturnToTitle: returnFromRunnerToTitle,
      });
      input = mountRunnerInputDom({
        root: view.section,
        playSurface: view.playSurface,
        laneUpButton: view.laneUpButton,
        laneDownButton: view.laneDownButton,
        window: ownerWindow,
        document,
        gate: view.getInputGateSnapshot,
        accept: (intent) => session?.requestLaneIntent(intent) ?? false,
        onEscape: () => session?.setUserPaused(true) === true,
        onBindingsChanged: view.updateBindings,
      });
      view.attachBindingController(input);
      const mountedInput = input;
      unsubscribeInputGate = session.subscribe(() => mountedInput.syncGate());
      mountedRunner = Object.freeze({
        session,
        view,
        input,
        unsubscribeInputGate,
      });
    } catch {
      try {
        unsubscribeInputGate();
      } finally {
        disposeRunnerParts(input, view, session);
      }
      runnerActionFailure(errorNotice(
        "The runner laboratory could not be displayed. Your latest runner checkpoint was kept; return to the title and continue your life to retry.",
      ));
    }
  }

  function enterRunnerLaboratory(): void {
    if (disposed || runnerActionInProgress || dependencies.runner === undefined) {
      return;
    }
    runnerActionInProgress = true;
    let result: ReturnType<typeof dependencies.runner.enterRunnerLaboratory>;
    try {
      result = dependencies.runner.enterRunnerLaboratory();
    } catch {
      runnerActionInProgress = false;
      runnerActionFailure(errorNotice(
        "The runner laboratory could not be opened. Your saved life was not changed.",
      ));
      return;
    }
    runnerActionInProgress = false;
    if (result.kind === "invalid") {
      runnerActionFailure(result.notice);
      return;
    }
    mountEnteredRunner(result.state, result.notice ?? null);
  }

  function practiceRunnerAgain(): void {
    if (disposed || runnerActionInProgress || dependencies.runner === undefined) {
      return;
    }
    runnerActionInProgress = true;
    let result: ReturnType<typeof dependencies.runner.restartRunnerLaboratory>;
    try {
      result = dependencies.runner.restartRunnerLaboratory();
    } catch {
      runnerActionInProgress = false;
      runnerActionFailure(errorNotice(
        "The runner laboratory could not be restarted. Return to the title and continue your saved life.",
      ));
      return;
    }
    runnerActionInProgress = false;
    if (result.kind === "invalid") {
      runnerActionFailure(result.notice);
      return;
    }
    mountEnteredRunner(result.state, result.notice ?? null);
  }

  function returnFromRunnerToTitle(): void {
    if (disposed) return;
    setScreen("title");
  }

  const restoreSettingsFocus = (id: string | null): void => {
    if (!id) {
      return;
    }
    root.querySelector<HTMLElement>(`#${id}`)?.focus();
  };

  const openRenderedDialog = (dialog: HTMLDialogElement): void => {
    if (typeof dialog.showModal === "function") {
      dialog.dataset.dialogMode = "native";
      dialog.showModal();
    } else {
      dialog.dataset.dialogMode = "fallback";
      dialog.setAttribute("open", "");
      const backdrop = createElement(document, "div", {
        className: "col-dialog-fallback-backdrop",
        attributes: { "aria-hidden": "true" },
      });
      dialog.before(backdrop);
      renderLifetime.add(() => backdrop.remove());
      const suppressed: Array<{
        readonly element: HTMLElement;
        readonly ariaHidden: string | null;
        readonly inert: boolean;
        readonly inertAttribute: boolean;
        readonly pointerEvents: string;
      }> = [];
      let branch: HTMLElement = dialog;
      while (branch.parentElement) {
        const parent = branch.parentElement;
        for (const sibling of parent.children) {
          if (sibling === branch || sibling === backdrop || !(sibling instanceof HTMLElement)) {
            continue;
          }
          suppressed.push({
            element: sibling,
            ariaHidden: sibling.getAttribute("aria-hidden"),
            inert: Boolean(sibling.inert),
            inertAttribute: sibling.hasAttribute("inert"),
            pointerEvents: sibling.style.pointerEvents,
          });
          sibling.setAttribute("aria-hidden", "true");
          sibling.setAttribute("inert", "");
          sibling.inert = true;
          sibling.style.pointerEvents = "none";
        }
        branch = parent;
        if (parent === document.body) {
          break;
        }
      }
      renderLifetime.add(() => {
        for (const prior of suppressed) {
          if (prior.ariaHidden === null) {
            prior.element.removeAttribute("aria-hidden");
          } else {
            prior.element.setAttribute("aria-hidden", prior.ariaHidden);
          }
          if (prior.inertAttribute) {
            prior.element.setAttribute("inert", "");
          } else {
            prior.element.removeAttribute("inert");
          }
          prior.element.inert = prior.inert;
          prior.element.style.pointerEvents = prior.pointerEvents;
        }
      });

      const focusable = (): HTMLElement[] => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      listen(dialog, "keydown", (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape") {
          keyboardEvent.preventDefault();
          closeSettings();
          return;
        }
        if (keyboardEvent.key !== "Tab") {
          return;
        }
        const candidates = focusable();
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        if (!first || !last) {
          keyboardEvent.preventDefault();
          dialog.focus();
          return;
        }
        if (keyboardEvent.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          keyboardEvent.preventDefault();
          last.focus();
        } else if (!keyboardEvent.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          keyboardEvent.preventDefault();
          first.focus();
        }
      });
      listen(document, "focusin", () => {
        if (!dialog.contains(document.activeElement)) {
          (focusable()[0] ?? dialog).focus();
        }
      });
    }
    const firstControl = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (firstControl) {
      firstControl.focus();
    } else {
      dialog.tabIndex = -1;
      dialog.focus();
    }
  };

  const renderSettingsDialog = (main: HTMLElement): HTMLDialogElement => {
    const dialog = createElement(document, "dialog", {
      className: "col-dialog",
      attributes: { "aria-labelledby": "settings-heading", "aria-modal": "true" },
    });
    const form = createElement(document, "form", { className: "col-settings-form" });
    form.noValidate = true;
    form.append(
      createElement(document, "h2", { text: "Settings", attributes: { "id": "settings-heading" } }),
      createElement(document, "p", { text: "Display settings never change the outcome of a life." }),
    );

    const checkbox = (id: string, labelText: string, checked: boolean): HTMLInputElement => {
      const label = createElement(document, "label", { className: "col-check-row", attributes: { "for": id } });
      const input = createElement(document, "input", { attributes: { id } });
      input.type = "checkbox";
      input.checked = checked;
      label.append(input, createElement(document, "span", { text: labelText }));
      form.append(label);
      return input;
    };

    const contrast = checkbox("setting-contrast", "High contrast", state.settings.highContrast);
    const reducedMotion = checkbox("setting-motion", "Reduce motion", state.settings.reducedMotion);
    const announcements = checkbox(
      "setting-announcements",
      "Screen-reader status announcements",
      state.settings.screenReaderAnnouncements,
    );
    const scaleField = createElement(document, "div", { className: "col-field" });
    const scaleLabel = createElement(document, "label", { text: "Text size", attributes: { "for": "setting-text-scale" } });
    const scale = createElement(document, "select", { attributes: { "id": "setting-text-scale" } });
    for (const value of [100, 125, 150, 200] as const) {
      const option = createElement(document, "option", { text: `${value}%` });
      option.value = String(value);
      option.selected = value === state.settings.textScale;
      scale.append(option);
    }
    scaleField.append(scaleLabel, scale);
    form.append(scaleField);

    const actions = createElement(document, "div", { className: "col-actions col-actions--end" });
    const cancel = createButton("Cancel", "col-button col-button--quiet");
    const save = createElement(document, "button", {
      className: "col-button col-button--primary",
      text: state.pending === "settings" ? "Saving…" : "Save settings",
    });
    save.type = "submit";
    save.disabled = state.pending !== null;
    actions.append(cancel, save);
    form.append(actions);
    dialog.append(form);
    main.append(dialog);

    listen(cancel, "click", closeSettings);
    listen(dialog, "cancel", (event) => {
      event.preventDefault();
      closeSettings();
    });
    listen(form, "submit", (event) => {
      event.preventDefault();
      if (state.pending) {
        return;
      }
      const nextSettings: VisualSettings = {
        highContrast: contrast.checked,
        reducedMotion: reducedMotion.checked,
        textScale: Number(scale.value) as TextScale,
        screenReaderAnnouncements: announcements.checked,
      };
      const version = ++operationVersion;
      const restoreId = settingsOpenerId;
      settingsOpenerId = null;
      state.settingsOpen = false;
      state.settings = cloneSettings(nextSettings);
      state.pending = "settings";
      focusAfterRenderId = PENDING_STATUS_ID;
      applySettings();
      render();
      const handleFailure = (): void => {
        if (disposed || version !== operationVersion) {
          return;
        }
        state.pending = null;
        state.notice = errorNotice("Settings could not be saved. They remain active for this session.");
        focusAfterRenderId = restoreId ?? NOTICE_ID;
        render();
      };
      let request: ReturnType<ChoiceOfLifeShellPort["saveSettings"]>;
      try {
        request = dependencies.shell.saveSettings(nextSettings);
      } catch {
        handleFailure();
        return;
      }
      void Promise.resolve(request)
        .then((result: SettingsActionResult) => {
          if (disposed || version !== operationVersion) {
            return;
          }
          state.pending = null;
          state.settings = cloneSettings(result.settings);
          state.notice = result.notice ?? null;
          snapshot = safeSnapshot(dependencies.shell);
          focusAfterRenderId = restoreId;
          render();
        })
        .catch(handleFailure);
    });
    return dialog;
  };

  function render(): void {
    if (disposed) {
      return;
    }
    if (state.screen === "newborn" && mountedNewborn !== null) {
      applySettings();
      const currentNewborn = dependencies.newborn?.currentNewbornState() ?? null;
      if (currentNewborn !== null) {
        mountedNewborn.view.render(currentNewborn);
      }
      return;
    }
    if (state.screen === "encounters" && mountedEncounter !== null) {
      applySettings();
      const currentEncounter = dependencies.encounters?.currentEncounterState() ?? null;
      if (currentEncounter !== null) {
        mountedEncounter.view.render(currentEncounter);
      }
      return;
    }
    if (state.screen === "runner" && mountedRunner !== null) {
      applySettings();
      mountedRunner.view.updateVisualOptions(runnerVisualOptions(
        mountedRunner.session.getSnapshot().state.accessibility,
      ));
      mountedRunner.input.syncGate();
      return;
    }
    renderLifetime.dispose();
    renderLifetime = new CleanupBag();
    applySettings();

    const main = createElement(document, "main", {
      className: "col-shell",
      attributes: { "aria-labelledby": "choice-life-title", "aria-busy": state.pending ? "true" : "false" },
    });
    renderHeader(main);
    if (state.screen === "title") {
      renderTitle(main);
    } else if (state.screen === "setup") {
      renderSetup(main);
    } else if (state.screen === "ready") {
      renderReady(main);
    }
    const settingsDialog = state.settingsOpen ? renderSettingsDialog(main) : null;
    root.replaceChildren(main);
    if (settingsDialog) {
      openRenderedDialog(settingsDialog);
    } else {
      const targetId = focusAfterRenderId ?? (state.pending ? PENDING_STATUS_ID : null);
      focusAfterRenderId = null;
      const target = targetId ? root.querySelector<HTMLElement>(`#${targetId}`) : null;
      if (target) {
        if (!target.matches(FOCUSABLE_SELECTOR)) {
          target.tabIndex = -1;
        }
        target.focus();
      }
    }
  }

  const unsubscribe = dependencies.shell.subscribe(() => {
    if (disposed) {
      return;
    }
    snapshot = safeSnapshot(dependencies.shell);
    if (state.pending !== "settings") {
      state.settings = cloneSettings(snapshot.settings);
    }
    if (runnerActionInProgress || runnerCommitInProgress || encounterActionInProgress) {
      applySettings();
      return;
    }
    if (mountedRunner !== null) {
      mountedRunner.session.refreshPresentationState();
      applySettings();
      mountedRunner.view.updateVisualOptions(runnerVisualOptions(
        mountedRunner.session.getSnapshot().state.accessibility,
      ));
      mountedRunner.input.syncGate();
      return;
    }
    if (mountedEncounter !== null) {
      const currentEncounter = dependencies.encounters?.currentEncounterState() ?? null;
      if (currentEncounter !== null) {
        mountedEncounter.view.render(currentEncounter);
      }
      applySettings();
      return;
    }
    render();
  });
  lifetime.add(unsubscribe);

  const app: ChoiceOfLifeApp = {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      operationVersion += 1;
      disposeMountedNewborn();
      disposeMountedEncounter();
      disposeMountedRunner();
      renderLifetime.dispose();
      lifetime.dispose();
      root.replaceChildren();
      root.classList.remove("choice-life-root");
      delete root.dataset.contrast;
      delete root.dataset.reducedMotion;
      root.style.removeProperty("--col-text-scale");
      if (mountedRoots.get(root) === app) {
        mountedRoots.delete(root);
      }
    },
  };

  mountedRoots.set(root, app);
  render();
  return app;
}
