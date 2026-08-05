import type {
  ControlMode,
  CoreScores,
  Difficulty,
  RunStateV1,
  StartingProfileId,
} from "./run-state";
import type { NewbornAction, NewbornState } from "./newborn/index";
import type { EncounterEngineState } from "./encounters/index";
import type {
  EducationRouteId,
  EducationState,
  ExamPreparationChoiceId,
  PrimaryEducationRouteId,
} from "./education/index";
import type { CareerAction, CareerState } from "./career/index";
import type { AdultAction, AdultState } from "./adult/index";
import type { ChildhoodAction, ChildhoodState } from "./childhood/index";

export type Gender = RunStateV1["identity"]["gender"];
export type AppearanceSelection = RunStateV1["appearance"];
export type HeritageStyleId = AppearanceSelection["heritageStyleId"];
export type HairStyleId = AppearanceSelection["hairStyleId"];
export type HairColorId = AppearanceSelection["hairColorId"];
export type ClothingPaletteId = AppearanceSelection["clothingPaletteId"];
export type VisualSettings = RunStateV1["accessibility"];
export type TextScale = VisualSettings["textScale"];

export interface SetupSelection {
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly gender: Gender;
  readonly appearance: AppearanceSelection;
}

export type MaybePromise<T> = T | Promise<T>;

export interface ShellNotice {
  readonly tone: "status" | "warning" | "error";
  readonly message: string;
}

export interface SavedRunSummary {
  readonly runId: string;
  readonly label: string;
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
}

export interface ReadyRun {
  readonly runId: string;
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly scores: CoreScores;
}

export interface ShellSnapshot {
  readonly canContinue: boolean;
  readonly savedRun: SavedRunSummary | null;
  readonly settings: VisualSettings;
  readonly notice: ShellNotice | null;
}

export type RunActionResult =
  | { readonly kind: "ready"; readonly run: ReadyRun; readonly notice?: ShellNotice }
  | { readonly kind: "unavailable"; readonly notice: ShellNotice }
  | { readonly kind: "invalid-save"; readonly notice: ShellNotice };

export type SettingsActionResult =
  | { readonly kind: "saved"; readonly settings: VisualSettings; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly settings: VisualSettings; readonly notice: ShellNotice }
  | { readonly kind: "unavailable"; readonly settings: VisualSettings; readonly notice: ShellNotice };

export type RunnerLaboratoryActionResult =
  | { readonly kind: "ready"; readonly state: RunStateV1; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type RunnerLaboratoryCommitResult =
  | { readonly kind: "saved"; readonly state: RunStateV1 }
  | { readonly kind: "unavailable"; readonly state: RunStateV1; readonly notice: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type NewbornActionResult =
  | { readonly kind: "ready"; readonly state: NewbornState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export const ENCOUNTER_CHAPTER_STAGE_ID = "encounters-and-consequences-v1" as const;
export const ENCOUNTER_CHAPTER_DURATION_TICKS = 350;

export type EncounterChapterPhase = "active" | "complete";

export interface EncounterChapterState {
  readonly schemaVersion: 1;
  readonly contentVersion: "encounter-chapter-v1";
  readonly runId: string;
  readonly stageId: typeof ENCOUNTER_CHAPTER_STAGE_ID;
  readonly phase: EncounterChapterPhase;
  readonly simulationTick: number;
  readonly durationTicks: number;
  readonly engine: EncounterEngineState;
}

export type EncounterChapterAction =
  | Readonly<{ type: "advance"; ticks?: number }>
  | Readonly<{ type: "choose"; transactionId: string; optionId: string }>
  | Readonly<{ type: "skip"; transactionId: string }>
  | Readonly<{ type: "accept-recovery"; recoveryId: string }>
  | Readonly<{ type: "dismiss-recovery"; recoveryId: string }>;

export type EncounterChapterActionResult =
  | { readonly kind: "ready"; readonly state: EncounterChapterState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type EducationChapterAction =
  | Readonly<{ type: "choose-preparation"; choiceId: ExamPreparationChoiceId }>
  | Readonly<{ type: "reveal-grade" }>
  | Readonly<{ type: "select-route"; routeId: EducationRouteId }>
  | Readonly<{ type: "retrain"; routeId: PrimaryEducationRouteId }>;

export type EducationChapterActionResult =
  | { readonly kind: "ready"; readonly state: EducationState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type CareerChapterActionResult =
  | { readonly kind: "ready"; readonly state: CareerState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type CareerChapterAction = CareerAction;

export type AdultChapterActionResult =
  | { readonly kind: "ready"; readonly state: AdultState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

export type AdultChapterAction = AdultAction;

export interface ChildhoodPlayerProfile {
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly gender: Gender;
  readonly appearance: AppearanceSelection;
}

export interface ChildhoodChapterState {
  readonly childhood: ChildhoodState;
  readonly player: ChildhoodPlayerProfile;
}

export type ChildhoodChapterActionResult =
  | { readonly kind: "ready"; readonly state: ChildhoodChapterState; readonly notice?: ShellNotice }
  | { readonly kind: "invalid"; readonly notice: ShellNotice };

/**
 * Phase-3 runtime capability. Newborn progress is deliberately session-scoped
 * until it can be incorporated into the versioned run save without weakening
 * the existing save validator.
 */
export interface NewbornShellPort {
  currentNewbornState(): NewbornState | null;
  enterNewborn(): NewbornActionResult;
  dispatchNewborn(action: NewbornAction): NewbornActionResult;
}

/** Phase-4 session runtime built on the reusable encounter engine. */
export interface EncounterChapterShellPort {
  currentEncounterState(): EncounterChapterState | null;
  enterEncounters(): EncounterChapterActionResult;
  dispatchEncounter(action: EncounterChapterAction): EncounterChapterActionResult;
}

/** Phase-7 toddler-through-middle-school runtime, kept session-scoped for now. */
export interface ChildhoodChapterShellPort {
  currentChildhoodState(): ChildhoodChapterState | null;
  enterChildhood(): ChildhoodChapterActionResult;
  dispatchChildhood(action: ChildhoodAction): ChildhoodChapterActionResult;
}

/** Phase-5 high-school and education runtime, kept session-scoped for now. */
export interface EducationChapterShellPort {
  currentEducationState(): EducationState | null;
  enterEducation(): EducationChapterActionResult;
  dispatchEducation(action: EducationChapterAction): EducationChapterActionResult;
}

/** Phase-6 first-career runtime, kept session-scoped until the save schema grows. */
export interface CareerChapterShellPort {
  currentCareerState(): CareerState | null;
  enterCareer(): CareerChapterActionResult;
  dispatchCareer(action: CareerAction): CareerChapterActionResult;
}

/** Phase-8 relationships, home, and midlife runtime, kept session-scoped for now. */
export interface AdultChapterShellPort {
  currentAdultState(): AdultState | null;
  enterAdult(): AdultChapterActionResult;
  dispatchAdult(action: AdultAction): AdultChapterActionResult;
}

export interface RunnerLaboratoryShellPort {
  currentRunState(): RunStateV1 | null;
  enterRunnerLaboratory(): RunnerLaboratoryActionResult;
  restartRunnerLaboratory(): RunnerLaboratoryActionResult;
  saveRunnerLaboratoryState(state: RunStateV1): RunnerLaboratoryCommitResult;
}

export interface ChoiceOfLifeShellPort {
  getSnapshot(): ShellSnapshot;
  subscribe(listener: () => void): () => void;
  startNewLife(selection: SetupSelection): MaybePromise<RunActionResult>;
  continueLife(): MaybePromise<RunActionResult>;
  saveSettings(settings: VisualSettings): MaybePromise<SettingsActionResult>;
}

export interface BrowserDependencies {
  readonly shell: ChoiceOfLifeShellPort;
  /** Phase-2 runtime capability; optional so the Phase-1 shell remains embeddable. */
  readonly runner?: RunnerLaboratoryShellPort;
  /** Phase-3 actual-life capability; optional for older embedded shells. */
  readonly newborn?: NewbornShellPort;
  /** Phase-4 encounters-and-consequences capability. */
  readonly encounters?: EncounterChapterShellPort;
  /** Phase-7 toddler-through-middle-school capability. */
  readonly childhood?: ChildhoodChapterShellPort;
  /** Phase-5 high-school and education capability. */
  readonly education?: EducationChapterShellPort;
  /** Phase-6 first-career capability. */
  readonly career?: CareerChapterShellPort;
  /** Phase-8 relationships, home, and midlife capability. */
  readonly adult?: AdultChapterShellPort;
}
