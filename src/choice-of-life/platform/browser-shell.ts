import { RUNNER_LABORATORY_CATALOG } from "../core/catalog";
import { deepFreeze } from "../core/immutable";
import { createInitialRunState } from "../core/run-factory";
import { createNewbornState, reduceNewborn, type NewbornState } from "../core/newborn/index";
import {
  CAREGIVER_SUPPORT_THRESHOLDS,
  DEFAULT_ENCOUNTER_CATALOG,
  canLeaveEncounterStage,
  createEncounterEngineState,
  getEncounterSafeCorridorStatus,
  reduceEncounterEngine,
  scheduleEncounter,
} from "../core/encounters/index";
import {
  chooseExamPreparation,
  createEducationState,
  resolveEducationExam,
  retrainEducation,
  selectEducationRoute,
  type EducationState,
  type EducationSupportLevel,
} from "../core/education/index";
import {
  createCareerState,
  reduceCareer,
  type CareerCredentialId,
  type CareerEducationRoute,
  type CareerExperienceTag,
  type CareerFact,
  type CareerState,
} from "../core/career/index";
import {
  createChildhoodState,
  reduceChildhood,
} from "../core/childhood/index";
import type { AdultState } from "../core/adult/index";
import { createRunnerLaboratoryEntryState, RUNNER_LABORATORY_STAGE_ID } from "../core/runner/contract";
import type { SeedPort } from "../core/seed-port";
import { STARTING_PROFILE_SCORES, type RunStateV1, type StartingProfileId } from "../core/run-state";
import { stateHashV1 } from "../core/run-state-hash";
import type {
  BrowserDependencies,
  AdultChapterActionResult,
  AdultChapterShellPort,
  CareerChapterActionResult,
  CareerChapterShellPort,
  ChildhoodChapterActionResult,
  ChildhoodChapterShellPort,
  ChildhoodChapterState,
  ChoiceOfLifeShellPort,
  EducationChapterAction,
  EducationChapterActionResult,
  EducationChapterShellPort,
  EncounterChapterAction,
  EncounterChapterActionResult,
  EncounterChapterShellPort,
  EncounterChapterState,
  LaterLifeChapterAction,
  LaterLifeChapterActionResult,
  LaterLifeChapterShellPort,
  NewbornActionResult,
  NewbornShellPort,
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
import {
  ENCOUNTER_CHAPTER_DURATION_TICKS,
  ENCOUNTER_CHAPTER_STAGE_ID,
} from "../core/shell-contracts";
import { createSaveStore, type LoadResult, type SaveStore } from "../persistence/save-store";
import type { StoragePort } from "../persistence/storage-port";
import { createBrowserSeedPort, createBrowserStoragePort } from "./browser-ports";
import {
  createAdultChapterSession,
  type AdultChapterSession,
} from "./adult-session";
import {
  createLaterLifeChapterSession,
  type LaterLifeChapterSession,
} from "./later-life-session";

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

export interface BrowserShellPort extends ChoiceOfLifeShellPort, RunnerLaboratoryShellPort, NewbornShellPort, EncounterChapterShellPort, ChildhoodChapterShellPort, EducationChapterShellPort, CareerChapterShellPort, AdultChapterShellPort, LaterLifeChapterShellPort {
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

const ENCOUNTER_RECOVERY_POLICY = Object.freeze({
  triggerAtOrBelow: 45,
  recoverTo: 50,
});

function educationSupportLevel(state: EncounterChapterState): EducationSupportLevel {
  const caregiverCloseness = state.engine.relationships
    .filter((relationship) => relationship.kind === "caregiver")
    .reduce((highest, relationship) => Math.max(highest, relationship.closeness), 0);
  if (caregiverCloseness >= CAREGIVER_SUPPORT_THRESHOLDS.strong) return "strong";
  if (caregiverCloseness >= CAREGIVER_SUPPORT_THRESHOLDS.some) return "some";
  return "none";
}

function priorEducationAchievement(state: EncounterChapterState): number {
  const wellbeing = Math.round(
    state.engine.scores.health * 0.35 + state.engine.scores.happiness * 0.45,
  );
  const rememberedStudy = state.engine.memories.some((memory) =>
    memory.summary.toLocaleLowerCase().includes("study"),
  );
  return Math.max(35, Math.min(88, wellbeing + (rememberedStudy ? 8 : 0)));
}

function deterministicExamPerformance(runSeed: string, choiceId: string): number {
  let hash = 2_166_136_261;
  const input = `${runSeed}:education-exam:${choiceId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return 45 + ((hash >>> 0) % 36);
}

function careerEducationRoute(state: EducationState): CareerEducationRoute {
  switch (state.qualificationRouteId) {
    case "education-route-professional-v1":
      return "professional";
    case "education-route-practical-v1":
      return "practical";
    case "education-route-direct-work-v1":
      return "direct-work";
    default:
      return "foundation";
  }
}

function careerCredentials(state: EducationState): readonly CareerCredentialId[] {
  const credentials: CareerCredentialId[] = ["high-school-diploma"];
  const route = careerEducationRoute(state);
  if (route === "professional") {
    credentials.push(
      "bachelor-general",
      "engineering-degree",
      "finance-degree",
      "computer-science-degree",
      "business-degree",
    );
    if (state.gradeResult?.grade === "excellent") {
      credentials.push("medical-degree");
    }
  } else if (route === "practical") {
    credentials.push(
      "culinary-certificate",
      "nursing-license",
      "fitness-certification",
      "agriculture-training",
    );
  } else if (route === "direct-work") {
    credentials.push("software-portfolio", "arts-portfolio");
  }
  return Object.freeze(credentials);
}

function careerExperience(state: EducationState): readonly CareerExperienceTag[] {
  switch (careerEducationRoute(state)) {
    case "professional":
      return Object.freeze(["technology", "teamwork"]);
    case "practical":
      return Object.freeze(["caregiving", "customer-service", "physical-training", "teamwork"]);
    case "direct-work":
      return Object.freeze(["customer-service", "small-business", "creative-practice"]);
    default:
      return Object.freeze(["community-service", "teamwork"]);
  }
}

function careerHandoffFacts(state: EducationState): readonly CareerFact[] {
  const routeLabel = careerEducationRoute(state).replace("-", " ");
  return Object.freeze([
    {
      factId: "fact-education-route-v1",
      label: "Education route",
      value: routeLabel,
      source: "prior-life",
    },
    {
      factId: "fact-school-grade-v1",
      label: "School result",
      value: state.gradeResult?.grade ?? "basic",
      source: "prior-life",
    },
  ]);
}

function createEncounterChapterState(
  runId: string,
  scores: RunStateV1["scores"],
): EncounterChapterState {
  let engine = createEncounterEngineState(scores);
  for (const request of [
    {
      transactionId: `${runId}:encounter:caregiver`,
      encounterId: "caregiver-comfort-v1",
      stageId: ENCOUNTER_CHAPTER_STAGE_ID,
      opensAtTick: 5,
      closesAtTick: 45,
    },
    {
      transactionId: `${runId}:encounter:playground`,
      encounterId: "playground-sharing-v1",
      stageId: ENCOUNTER_CHAPTER_STAGE_ID,
      opensAtTick: 55,
      closesAtTick: 110,
    },
    {
      transactionId: `${runId}:encounter:study`,
      encounterId: "study-or-rest-v1",
      stageId: ENCOUNTER_CHAPTER_STAGE_ID,
      opensAtTick: 120,
      closesAtTick: 250,
    },
  ] as const) {
    engine = scheduleEncounter(engine, DEFAULT_ENCOUNTER_CATALOG, request);
  }
  return Object.freeze({
    schemaVersion: 1,
    contentVersion: "encounter-chapter-v1",
    runId,
    stageId: ENCOUNTER_CHAPTER_STAGE_ID,
    phase: "active",
    simulationTick: 0,
    durationTicks: ENCOUNTER_CHAPTER_DURATION_TICKS,
    engine,
  });
}

function encounterChapterWith(
  state: EncounterChapterState,
  engine: EncounterChapterState["engine"],
  simulationTick = state.simulationTick,
): EncounterChapterState {
  const unresolvedRecovery = engine.recoveryHooks.some(
    (hook) => hook.status === "offered",
  );
  const phase = simulationTick >= state.durationTicks
    && canLeaveEncounterStage(engine, state.stageId)
    && !getEncounterSafeCorridorStatus(engine).active
    && !unresolvedRecovery
    ? "complete"
    : "active";
  return Object.freeze({ ...state, engine, simulationTick, phase });
}

export function createBrowserShellPort(options: BrowserShellOptions): BrowserShellPort {
  const store: SaveStore = createSaveStore(options.storage, RUNNER_LABORATORY_CATALOG);
  const initialLoad = store.load();
  let currentState = initialLoad.kind === "ready" ? initialLoad.state : initialLoad.kind === "unavailable" ? initialLoad.state : null;
  // Kept separate from RunStateV1 until the versioned save schema has a
  // newborn payload. This prevents an unvalidated Phase-3 shape from leaking
  // into durable saves while still supporting the complete stage in-session.
  let newbornState: NewbornState | null = null;
  let encounterState: EncounterChapterState | null = null;
  let childhoodState: ChildhoodChapterState | null = null;
  let educationState: EducationState | null = null;
  let careerState: CareerState | null = null;
  let adultSession: AdultChapterSession | null = null;
  let laterLifeSession: LaterLifeChapterSession | null = null;
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
      newbornState = null;
      encounterState = null;
      childhoodState = null;
      educationState = null;
      careerState = null;
      adultSession = null;
      laterLifeSession = null;
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
    currentNewbornState(): NewbornState | null {
      return newbornState;
    },
    enterNewborn(): NewbornActionResult {
      if (currentState === null) {
        return {
          kind: "invalid",
          notice: warning("Create a life before starting the newborn stage."),
        };
      }
      if (newbornState !== null && newbornState.runId === currentState.runId) {
        return { kind: "ready", state: newbornState, ...(notice ? { notice } : {}) };
      }
      try {
        newbornState = createNewbornState({
          runId: currentState.runId,
          runSeed: currentState.runSeed,
          difficulty: currentState.difficulty,
          scores: { ...STARTING_PROFILE_SCORES[currentState.startingProfileId] },
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("The newborn stage could not be created. Your saved life was not changed."),
        };
      }
      notice = {
        tone: "status",
        message: "Newborn progress is active for this browser session; your life setup remains safely saved.",
      };
      publish();
      return { kind: "ready", state: newbornState, notice };
    },
    dispatchNewborn(action): NewbornActionResult {
      if (newbornState === null) {
        return {
          kind: "invalid",
          notice: warning("Start the newborn stage before making newborn choices."),
        };
      }
      try {
        newbornState = reduceNewborn(newbornState, action);
      } catch {
        return {
          kind: "invalid",
          notice: warning("That newborn action could not be applied. Your latest stage state was kept."),
        };
      }
      publish();
      return { kind: "ready", state: newbornState };
    },
    currentEncounterState(): EncounterChapterState | null {
      return encounterState;
    },
    enterEncounters(): EncounterChapterActionResult {
      if (currentState === null) {
        return {
          kind: "invalid",
          notice: warning("Create a life before opening encounters and consequences."),
        };
      }
      if (newbornState === null || newbornState.phase !== "complete") {
        return {
          kind: "invalid",
          notice: warning("Complete the newborn chapter before continuing to life encounters."),
        };
      }
      if (encounterState !== null && encounterState.runId === currentState.runId) {
        return { kind: "ready", state: encounterState, ...(notice ? { notice } : {}) };
      }
      try {
        encounterState = createEncounterChapterState(
          currentState.runId,
          newbornState.scores,
        );
      } catch {
        return {
          kind: "invalid",
          notice: warning("The encounter chapter could not be created. Your newborn result is still available."),
        };
      }
      notice = {
        tone: "status",
        message: "Encounters are active for this browser session. Each decision is applied once.",
      };
      publish();
      return { kind: "ready", state: encounterState, notice };
    },
    dispatchEncounter(action: EncounterChapterAction): EncounterChapterActionResult {
      if (encounterState === null) {
        return {
          kind: "invalid",
          notice: warning("Open encounters and consequences before making a choice."),
        };
      }
      if (encounterState.phase === "complete") {
        return { kind: "ready", state: encounterState };
      }
      try {
        const context = {
          stageId: encounterState.stageId,
          simulationTick: encounterState.simulationTick,
        };
        let engine = encounterState.engine;
        let simulationTick = encounterState.simulationTick;
        if (action.type === "advance") {
          const recoveryPending = engine.recoveryHooks.some(
            (hook) => hook.status === "offered",
          );
          if (!getEncounterSafeCorridorStatus(engine).shouldPauseWorld && !recoveryPending) {
            const ticks = Math.max(1, Math.min(25, Math.trunc(action.ticks ?? 1)));
            simulationTick = Math.min(
              encounterState.durationTicks,
              encounterState.simulationTick + ticks,
            );
            engine = reduceEncounterEngine(
              engine,
              DEFAULT_ENCOUNTER_CATALOG,
              {
                type: "advance",
                context: { ...context, simulationTick },
              },
              ENCOUNTER_RECOVERY_POLICY,
            );
          }
        } else if (action.type === "choose") {
          engine = reduceEncounterEngine(
            engine,
            DEFAULT_ENCOUNTER_CATALOG,
            {
              type: "resolve",
              transactionId: action.transactionId,
              optionId: action.optionId,
              context,
            },
            ENCOUNTER_RECOVERY_POLICY,
          );
        } else if (action.type === "skip") {
          engine = reduceEncounterEngine(
            engine,
            DEFAULT_ENCOUNTER_CATALOG,
            { type: "skip", transactionId: action.transactionId, context },
            ENCOUNTER_RECOVERY_POLICY,
          );
        } else if (action.type === "accept-recovery") {
          engine = reduceEncounterEngine(
            engine,
            DEFAULT_ENCOUNTER_CATALOG,
            { type: "accept-recovery", recoveryId: action.recoveryId, context },
            ENCOUNTER_RECOVERY_POLICY,
          );
        } else {
          engine = reduceEncounterEngine(
            engine,
            DEFAULT_ENCOUNTER_CATALOG,
            { type: "dismiss-recovery", recoveryId: action.recoveryId, context },
            ENCOUNTER_RECOVERY_POLICY,
          );
        }
        encounterState = encounterChapterWith(
          encounterState,
          engine,
          simulationTick,
        );
      } catch {
        return {
          kind: "invalid",
          notice: warning("That encounter action could not be applied. Your latest chapter state was kept."),
        };
      }
      publish();
      return { kind: "ready", state: encounterState };
    },
    currentChildhoodState(): ChildhoodChapterState | null {
      return childhoodState;
    },
    enterChildhood(): ChildhoodChapterActionResult {
      if (
        currentState === null ||
        encounterState === null ||
        encounterState.phase !== "complete"
      ) {
        return {
          kind: "invalid",
          notice: warning("Complete encounters and consequences before starting childhood."),
        };
      }
      if (
        childhoodState !== null &&
        childhoodState.childhood.runId === currentState.runId
      ) {
        return { kind: "ready", state: childhoodState, ...(notice ? { notice } : {}) };
      }
      try {
        const childhood = createChildhoodState({
          runId: currentState.runId,
          runSeed: currentState.runSeed,
          scores: encounterState.engine.scores,
          companionMode: "seeded",
        });
        childhoodState = Object.freeze({
          childhood,
          player: Object.freeze({
            startingProfileId: currentState.startingProfileId,
            difficulty: currentState.difficulty,
            controlMode: currentState.controlMode,
            gender: currentState.identity.gender,
            appearance: Object.freeze({ ...currentState.appearance }),
          }),
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("Childhood could not begin. Your completed encounters are unchanged."),
        };
      }
      notice = {
        tone: "status",
        message: "Childhood is active for this browser session, with your earlier scores and player profile carried forward.",
      };
      publish();
      return { kind: "ready", state: childhoodState, notice };
    },
    dispatchChildhood(action): ChildhoodChapterActionResult {
      if (childhoodState === null) {
        return {
          kind: "invalid",
          notice: warning("Start childhood before making this choice."),
        };
      }
      try {
        childhoodState = Object.freeze({
          ...childhoodState,
          childhood: reduceChildhood(childhoodState.childhood, action),
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("That childhood action is not available. Your latest childhood state was kept."),
        };
      }
      publish();
      return { kind: "ready", state: childhoodState };
    },
    currentEducationState(): EducationState | null {
      return educationState;
    },
    enterEducation(): EducationChapterActionResult {
      if (
        currentState === null ||
        encounterState === null ||
        encounterState.phase !== "complete" ||
        childhoodState === null ||
        childhoodState.childhood.phase !== "complete"
      ) {
        return {
          kind: "invalid",
          notice: warning("Complete childhood before starting education."),
        };
      }
      if (educationState !== null && educationState.runId === currentState.runId) {
        return { kind: "ready", state: educationState, ...(notice ? { notice } : {}) };
      }
      try {
        educationState = createEducationState({
          runId: currentState.runId,
          ageMonths: 198,
          scores: childhoodState.childhood.scores,
          supportLevel: educationSupportLevel(encounterState),
          priorAchievement: priorEducationAchievement(encounterState),
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("Education could not begin. Your completed encounters are unchanged."),
        };
      }
      notice = {
        tone: "status",
        message: "High school and education are active for this browser session.",
      };
      publish();
      return { kind: "ready", state: educationState, notice };
    },
    dispatchEducation(action: EducationChapterAction): EducationChapterActionResult {
      if (educationState === null || currentState === null) {
        return {
          kind: "invalid",
          notice: warning("Start high school and education before making this choice."),
        };
      }
      try {
        if (action.type === "choose-preparation") {
          educationState = chooseExamPreparation(educationState, action.choiceId);
        } else if (action.type === "reveal-grade") {
          const choiceId = educationState.preparationChoiceId;
          if (choiceId === null) throw new Error("Exam preparation has not been chosen");
          educationState = resolveEducationExam(
            educationState,
            deterministicExamPerformance(currentState.runSeed, choiceId),
          );
        } else if (action.type === "select-route") {
          educationState = selectEducationRoute(educationState, action.routeId);
        } else {
          educationState = retrainEducation(educationState, action.routeId);
        }
      } catch {
        return {
          kind: "invalid",
          notice: warning("That education choice is not available. Your latest result was kept."),
        };
      }
      publish();
      return { kind: "ready", state: educationState };
    },
    currentCareerState(): CareerState | null {
      return careerState;
    },
    enterCareer(): CareerChapterActionResult {
      if (
        currentState === null ||
        educationState === null ||
        educationState.phase !== "qualified"
      ) {
        return {
          kind: "invalid",
          notice: warning("Complete education before opening your first career chapter."),
        };
      }
      if (careerState !== null && careerState.runId === currentState.runId) {
        return { kind: "ready", state: careerState, ...(notice ? { notice } : {}) };
      }
      try {
        careerState = createCareerState({
          runId: currentState.runId,
          runSeed: currentState.runSeed,
          scores: educationState.scores,
          profile: {
            ageYears: educationState.ageMonths / 12,
            grade: educationState.gradeResult?.grade ?? "basic",
            route: careerEducationRoute(educationState),
            credentials: careerCredentials(educationState),
            experienceTags: careerExperience(educationState),
          },
          facts: careerHandoffFacts(educationState),
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("Career offers could not be prepared. Your education result is unchanged."),
        };
      }
      notice = {
        tone: "status",
        message: "Your first career chapter is active for this browser session.",
      };
      publish();
      return { kind: "ready", state: careerState, notice };
    },
    dispatchCareer(action): CareerChapterActionResult {
      if (careerState === null) {
        return {
          kind: "invalid",
          notice: warning("Open your first career chapter before making a career choice."),
        };
      }
      try {
        careerState = reduceCareer(careerState, action);
      } catch {
        return {
          kind: "invalid",
          notice: warning("That career action is not available. Your latest career state was kept."),
        };
      }
      publish();
      return { kind: "ready", state: careerState };
    },
    currentAdultState(): AdultState | null {
      return adultSession?.getState() ?? null;
    },
    enterAdult(): AdultChapterActionResult {
      if (
        currentState === null ||
        careerState === null ||
        careerState.phase !== "complete"
      ) {
        return {
          kind: "invalid",
          notice: warning("Complete your first career chapter before starting adult life."),
        };
      }
      if (adultSession !== null && adultSession.getState().runId === currentState.runId) {
        return { kind: "ready", state: adultSession.getState(), ...(notice ? { notice } : {}) };
      }
      try {
        adultSession = createAdultChapterSession({
          run: {
            runId: currentState.runId,
            runSeed: currentState.runSeed,
            scores: careerState.scores,
            identity: { gender: currentState.identity.gender },
            appearance: { heritageStyleId: currentState.appearance.heritageStyleId },
          },
          player: {
            gender: currentState.identity.gender,
            appearance: { heritageStyleId: currentState.appearance.heritageStyleId },
          },
          career: careerState,
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("Adult life could not begin. Your completed career is unchanged."),
        };
      }
      notice = {
        tone: "status",
        message: "Relationships, home, and midlife are active for this browser session.",
      };
      publish();
      return { kind: "ready", state: adultSession.getState(), notice };
    },
    dispatchAdult(action): AdultChapterActionResult {
      if (adultSession === null) {
        return {
          kind: "invalid",
          notice: warning("Start adult life before making this choice."),
        };
      }
      const result = adultSession.dispatch(action);
      if (result.kind === "invalid") {
        return { kind: "invalid", notice: warning(result.message) };
      }
      publish();
      return { kind: "ready", state: result.state };
    },
    currentLaterLifeState() {
      return laterLifeSession?.getState() ?? null;
    },
    enterLaterLife(): LaterLifeChapterActionResult {
      if (
        currentState === null ||
        adultSession === null ||
        adultSession.getState().phase !== "complete"
      ) {
        return {
          kind: "invalid",
          notice: warning("Complete relationships, home, and midlife before opening the final chapters."),
        };
      }
      if (
        laterLifeSession !== null &&
        laterLifeSession.getState().runId === currentState.runId
      ) {
        return {
          kind: "ready",
          state: laterLifeSession.getState(),
          ...(notice ? { notice } : {}),
        };
      }
      try {
        laterLifeSession = createLaterLifeChapterSession({
          adultHandoff: adultSession.getState(),
        });
      } catch {
        return {
          kind: "invalid",
          notice: warning("The final chapters could not begin. Your completed adult life is unchanged."),
        };
      }
      notice = {
        tone: "status",
        message: "Later career, retirement, legacy, and your complete biography are active for this browser session.",
      };
      publish();
      return { kind: "ready", state: laterLifeSession.getState(), notice };
    },
    dispatchLaterLife(action: LaterLifeChapterAction): LaterLifeChapterActionResult {
      if (laterLifeSession === null) {
        return {
          kind: "invalid",
          notice: warning("Open the final chapters before making this choice."),
        };
      }
      const result = laterLifeSession.dispatch(action);
      if (result.status === "rejected") {
        return {
          kind: "invalid",
          notice: warning(result.reason ?? "That final-chapter action is not available."),
        };
      }
      publish();
      if (result.status === "new-life-ready") {
        return { kind: "new-life-ready", state: result.state };
      }
      return { kind: "ready", state: result.state };
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
    newborn: shell,
    encounters: shell,
    childhood: shell,
    education: shell,
    career: shell,
    adult: shell,
    laterLife: shell,
  };
}
