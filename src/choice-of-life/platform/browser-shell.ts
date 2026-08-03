import { PHASE_1_CATALOG } from "../core/catalog";
import { createInitialRunState } from "../core/run-factory";
import type { SeedPort } from "../core/seed-port";
import type { RunStateV1, StartingProfileId } from "../core/run-state";
import { stateHashV1 } from "../core/run-state-hash";
import type {
  BrowserDependencies,
  ChoiceOfLifeShellPort,
  ReadyRun,
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
  if (keys.join(",") !== "highContrast,reducedMotion,screenReaderAnnouncements,textScale") return null;
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

export interface BrowserShellPort extends ChoiceOfLifeShellPort {
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
  const store: SaveStore = createSaveStore(options.storage, PHASE_1_CATALOG);
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
      const candidateState: RunStateV1 = { ...currentState, accessibility: { ...validatedSettings } };
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
  };
}

export function createBrowserDependencies(): BrowserDependencies {
  return {
    shell: createBrowserShellPort({
      storage: createBrowserStoragePort(),
      seed: createBrowserSeedPort(),
    }),
  };
}
