import { RUNNER_LABORATORY_CATALOG } from "../core/catalog";
import { deepFreeze } from "../core/immutable";
import { createInitialRunState } from "../core/run-factory";
import { createRunnerLaboratoryEntryState, RUNNER_LABORATORY_STAGE_ID } from "../core/runner/contract";
import type { SeedPort } from "../core/seed-port";
import type { RunStateV1, StartingProfileId } from "../core/run-state";
import { stateHashV1 } from "../core/run-state-hash";
import type {
  BrowserDependencies,
  ChoiceOfLifeShellPort,
  ReadyRun,
  RunnerLaboratoryActionResult,
  RunnerLaboratoryCommitResult,
  RunnerLaboratoryShellPort,
  RunActionResult,
  SavedRunSummary,
  SettingsActionResult,
  ShellNotice,
  ShellSnapshot,
  SetupSelection,
  VisualSettings,
} from "../core/shell-contracts";
import { createSaveStore, type LoadResult, type SaveStore } from "../persistence/save-store";
import type { StoragePort } from "../persistence/storage-port";
import { createBrowserSeedPort, createBrowserStoragePort } from "./browser-ports";

const DEFAULT_SETTINGS: VisualSettings = {
  highContrast: false,
  reducedMotion: false,
  textScale: 100,
  screenReaderAnnouncements: true,
};

const PROFILE_LABELS: Readonly<Record<StartingProfileId, string>> = {
  "steady-mix-v1": "Steady mix",
  "physical-head-start-v1": "Physical head start",
  "emotional-head-start-v1": "Emotional head start",
  "resource-head-start-v1": "Resource head start",
};

function copyValidSettings(value: unknown): VisualSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = Object.keys({
    highContrast: 0,
    reducedMotion: 0,
    screenReaderAnnouncements: 0,
    textScale: 0,
  }).sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) return null;
  if (
    typeof record.highContrast !== "boolean"
    || typeof record.reducedMotion !== "boolean"
    || typeof record.screenReaderAnnouncements !== "boolean"
    || !([100, 125, 150, 200] as const).includes(record.textScale as 100)
  ) {
    return null;
  }
  return {
    highContrast: record.highContrast,
    reducedMotion: record.reducedMotion,
    textScale: record.textScale as VisualSettings["textScale"],
    screenReaderAnnouncements: record.screenReaderAnnouncements,
  };
}

export interface BrowserShellPort extends ChoiceOfLifeShellPort, RunnerLaboratoryShellPort {
  startNewLife(selection: SetupSelection): RunActionResult;
  continueLife(): RunActionResult;
  saveSettings(settings: VisualSettings): SettingsActionResult;
  currentStateHash(): string | null;
}

export interface BrowserShellOptions {
  readonly storage: StoragePort;
  readonly seed: SeedPort;
}

function warning(message: string): ShellNotice {
  return { tone: "warning", message };
}

function readyRun(state: RunStateV1): ReadyRun {
  return {
    runId: state.runId,
    startingProfileId: state.startingProfileId,
    difficulty: state.difficulty,
    controlMode: state.controlMode,
    scores: { ...state.scores },
  };
}

function savedRun(state: RunStateV1): SavedRunSummary {
  return {
    runId: state.runId,
    label: PROFILE_LABELS[state.startingProfileId],
    startingProfileId: state.startingProfileId,
    difficulty: state.difficulty,
    controlMode: state.controlMode,
  };
}

function noticeForLoad(result: LoadResult): ShellNotice | null {
  switch (result.kind) {
    case "empty":
    case "ready":
      return result.kind === "ready" && result.migrated
        ? { tone: "status", message: "Your saved life was updated to the current format." }
        : null;
    case "quarantined":
      return warning("An incompatible saved life was set aside safely. You can begin a new life.");
    case "unavailable":
      return warning("Saved data is unavailable. You can still play in this browser session.");
  }
}

export function createBrowserShellPort(options: BrowserShellOptions): BrowserShellPort {
  const store: SaveStore = createSaveStore(options.storage, RUNNER_LABORATORY_CATALOG);
  const initialLoad = store.load();
  let currentState = initialLoad.kind === "ready" ? initialLoad.state : initialLoad.kind === "unavailable" ? initialLoad.state : null;
  let settings: VisualSettings = currentState ? { ...currentState.accessibility } : { ...DEFAULT_SETTINGS };
  let notice = noticeForLoad(initialLoad);
  const listeners = new Set<() => void>();

  const publish = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const snapshot = (): ShellSnapshot => ({
    canContinue: currentState !== null,
    savedRun: currentState ? savedRun(currentState) : null,
    settings: { ...settings },
    notice,
  });

  const unavailableRun = (message: string): RunActionResult => {
    notice = warning(message);
    publish();
    return { kind: "unavailable", notice };
  };

  const runnerNotice = (message: string): ShellNotice => warning(message);

  const runnerEntry = (source: RunStateV1): RunStateV1 =>
    createRunnerLaboratoryEntryState(source.runSeed, {
      startingProfileId: source.startingProfileId,
      difficulty: source.difficulty,
      controlMode: source.controlMode,
      identity: { ...source.identity },
      appearance: { ...source.appearance },
      accessibility: { ...source.accessibility },
    });

  const saveRunnerEntry = (entry: RunStateV1): RunnerLaboratoryActionResult => {
    const result = store.save(entry);
    if (result.kind === "invalid") {
      const rejected = runnerNotice("The runner laboratory failed validation and was not opened.");
      notice = rejected;
      publish();
      return { kind: "invalid", notice: rejected };
    }
    currentState = entry;
    if (result.kind === "unavailable") {
      const unavailable = runnerNotice(
        "Saving is unavailable. The runner laboratory remains playable for this browser session.",
      );
      notice = unavailable;
      publish();
      return { kind: "ready", state: entry, notice: unavailable };
    }
    notice = null;
    publish();
    return { kind: "ready", state: entry };
  };

  const sameRunnerIdentity = (left: RunStateV1, right: RunStateV1): boolean =>
    left.runId === right.runId &&
    left.runSeed === right.runSeed &&
    left.contentVersion === right.contentVersion &&
    left.difficulty === right.difficulty &&
    left.controlMode === right.controlMode &&
    left.startingProfileId === right.startingProfileId &&
    left.identity.gender === right.identity.gender &&
    left.appearance.heritageStyleId === right.appearance.heritageStyleId &&
    left.appearance.hairStyleId === right.appearance.hairStyleId &&
    left.appearance.hairColorId === right.appearance.hairColorId &&
    left.appearance.clothingPaletteId === right.appearance.clothingPaletteId;

  return {
    getSnapshot: snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    startNewLife(selection: SetupSelection): RunActionResult {
      let state: RunStateV1;
      try {
        state = createInitialRunState(options.seed.nextSeed(), {
          startingProfileId: selection.startingProfileId,
          difficulty: selection.difficulty,
          controlMode: selection.controlMode,
          identity: { gender: selection.gender },
          appearance: { ...selection.appearance },
          accessibility: { ...settings },
        });
      } catch {
        return unavailableRun("A secure run seed could not be created. Please try again.");
      }
      const result = store.save(state);
      if (result.kind === "invalid") {
        notice = warning("The new life failed validation and was not started.");
        publish();
        return { kind: "invalid-save", notice };
      }
      currentState = state;
      if (result.kind === "saved") {
        notice = null;
      } else if (result.kind === "unavailable") {
        notice = warning("Saving is unavailable. This life remains playable for this browser session.");
      }
      publish();
      return { kind: "ready", run: readyRun(state), ...(notice ? { notice } : {}) };
    },
    continueLife(): RunActionResult {
      if (!currentState) {
        notice = warning("There is no compatible saved life to continue.");
        publish();
        return { kind: "invalid-save", notice };
      }
      return { kind: "ready", run: readyRun(currentState), ...(notice ? { notice } : {}) };
    },
    saveSettings(nextSettings: VisualSettings): SettingsActionResult {
      const validatedSettings = copyValidSettings(nextSettings);
      if (validatedSettings === null) {
        notice = warning("Those settings were invalid and were not applied.");
        publish();
        return { kind: "invalid", settings: { ...settings }, notice };
      }
      if (!currentState) {
        settings = validatedSettings;
        notice = {
          tone: "status",
          message: "Settings are active now and will be stored when you create a life.",
        };
        publish();
        return { kind: "saved", settings: { ...settings }, notice };
      }
      const candidateState = deepFreeze<RunStateV1>({
        ...currentState,
        accessibility: { ...validatedSettings },
      });
      const result = store.save(candidateState);
      if (result.kind === "invalid") {
        notice = warning("Those settings were rejected and were not applied.");
        publish();
        return { kind: "invalid", settings: { ...settings }, notice };
      }
      settings = validatedSettings;
      currentState = candidateState;
      if (result.kind === "saved") {
        notice = null;
        publish();
        return { kind: "saved", settings: { ...settings } };
      }
      notice = warning("Settings are active for this session, but saved storage is unavailable.");
      publish();
      return { kind: "unavailable", settings: { ...settings }, notice };
    },
    currentStateHash(): string | null {
      return currentState ? stateHashV1(currentState) : null;
    },
    currentRunState(): RunStateV1 | null {
      return currentState;
    },
    enterRunnerLaboratory(): RunnerLaboratoryActionResult {
      if (currentState === null) {
        return { kind: "invalid", notice: runnerNotice("Create a life before opening the runner laboratory.") };
      }
      if (currentState.stage.stageId === RUNNER_LABORATORY_STAGE_ID) {
        return { kind: "ready", state: currentState, ...(notice ? { notice } : {}) };
      }
      if (
        currentState.runStatus !== "setup" ||
        currentState.stage.stageId !== "setup-shell-v1"
      ) {
        return { kind: "invalid", notice: runnerNotice("This saved life cannot enter the runner laboratory.") };
      }
      return saveRunnerEntry(runnerEntry(currentState));
    },
    restartRunnerLaboratory(): RunnerLaboratoryActionResult {
      if (
        currentState === null ||
        currentState.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
        currentState.runStatus !== "completed"
      ) {
        return { kind: "invalid", notice: runnerNotice("Finish the current practice run before starting it again.") };
      }
      return saveRunnerEntry(runnerEntry(currentState));
    },
    saveRunnerLaboratoryState(state: RunStateV1): RunnerLaboratoryCommitResult {
      if (
        currentState === null ||
        state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID ||
        !sameRunnerIdentity(currentState, state)
      ) {
        return {
          kind: "invalid",
          notice: runnerNotice("The runner checkpoint did not match the active life and was not saved."),
        };
      }
      const result = store.save(state);
      if (result.kind === "invalid") {
        return {
          kind: "invalid",
          notice: runnerNotice("The runner checkpoint failed validation and was not saved."),
        };
      }
      currentState = state;
      if (result.kind === "unavailable") {
        return {
          kind: "unavailable",
          state,
          notice: runnerNotice("Saving is unavailable. This checkpoint remains active for the browser session."),
        };
      }
      return { kind: "saved", state };
    },
  };
}

export function createBrowserDependencies(): BrowserDependencies {
  const shell = createBrowserShellPort({
    storage: createBrowserStoragePort(),
    seed: createBrowserSeedPort(),
  });
  return {
    shell,
    runner: shell,
  };
}
