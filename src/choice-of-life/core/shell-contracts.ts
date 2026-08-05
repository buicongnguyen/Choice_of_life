import type {
  ControlMode,
  CoreScores,
  Difficulty,
  RunStateV1,
  StartingProfileId,
} from "./run-state";

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
}
