import type { ControlMode, RunStateV1 } from "./run-state";

export const PLAYER_PREFERENCES_SCHEMA_VERSION = 1 as const;
export const PLAYER_PREFERENCES_STORAGE_KEY = "choice-of-life-v1-player-preferences" as const;

export type PlayerTextScale = 100 | 125 | 150 | 200;
export type PlayerAssistMode = Extract<
  ControlMode,
  "manual" | "semantic-assist" | "automatic-assist"
>;

/**
 * Player-owned presentation and input choices. None of these values affect
 * story rewards, career eligibility, or difficulty.
 */
export interface PlayerPreferences {
  readonly schemaVersion: typeof PLAYER_PREFERENCES_SCHEMA_VERSION;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly textScale: PlayerTextScale;
  readonly screenReaderAnnouncements: boolean;
  readonly assistMode: PlayerAssistMode;
  /** Audio remains off until the player explicitly opts in. */
  readonly audioCuesEnabled: boolean;
}

export type PlayerPreferencePatch = Partial<
  Omit<PlayerPreferences, "schemaVersion">
>;

export interface PlayerPreferencePresentation {
  readonly attributes: Readonly<{
    "data-reduced-motion": "true" | "false";
    "data-contrast": "high" | "standard";
    "data-text-scale": `${PlayerTextScale}`;
    "data-assist-mode": PlayerAssistMode;
  }>;
  readonly rootFontScale: number;
  readonly announcements: "polite" | "off";
  readonly motionDurationMultiplier: 0 | 1;
}

export interface PreferenceStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface PlayerPreferenceStore {
  load(): PlayerPreferences;
  save(preferences: PlayerPreferences): PlayerPreferences;
  update(patch: PlayerPreferencePatch): PlayerPreferences;
  reset(): PlayerPreferences;
}

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = Object.freeze({
  schemaVersion: PLAYER_PREFERENCES_SCHEMA_VERSION,
  reducedMotion: false,
  highContrast: false,
  textScale: 100,
  screenReaderAnnouncements: true,
  assistMode: "manual",
  audioCuesEnabled: false,
});

export const PLAYER_TEXT_SCALES: readonly PlayerTextScale[] = Object.freeze([
  100,
  125,
  150,
  200,
]);

export const PLAYER_ASSIST_MODES: readonly PlayerAssistMode[] = Object.freeze([
  "manual",
  "semantic-assist",
  "automatic-assist",
]);

export const PLAYER_ASSIST_MODE_LABELS: Readonly<Record<PlayerAssistMode, string>> =
  Object.freeze({
    manual: "Manual runner",
    "semantic-assist": "Semantic Assist",
    "automatic-assist": "Automatic Assist",
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextScale(value: unknown): value is PlayerTextScale {
  return value === 100 || value === 125 || value === 150 || value === 200;
}

export function isPlayerAssistMode(value: unknown): value is PlayerAssistMode {
  return (
    value === "manual" ||
    value === "semantic-assist" ||
    value === "automatic-assist"
  );
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Converts unknown or older preference data into a complete current value.
 * Unsupported values fall back independently, so one damaged field does not
 * discard the player's other choices.
 */
export function normalizePlayerPreferences(
  value: unknown,
  fallback: PlayerPreferences = DEFAULT_PLAYER_PREFERENCES,
): PlayerPreferences {
  if (!isRecord(value)) return Object.freeze({ ...fallback });

  return Object.freeze({
    schemaVersion: PLAYER_PREFERENCES_SCHEMA_VERSION,
    reducedMotion: booleanOr(value.reducedMotion, fallback.reducedMotion),
    highContrast: booleanOr(value.highContrast, fallback.highContrast),
    textScale: isTextScale(value.textScale) ? value.textScale : fallback.textScale,
    screenReaderAnnouncements: booleanOr(
      value.screenReaderAnnouncements,
      fallback.screenReaderAnnouncements,
    ),
    assistMode: isPlayerAssistMode(value.assistMode)
      ? value.assistMode
      : fallback.assistMode,
    audioCuesEnabled: booleanOr(
      value.audioCuesEnabled,
      fallback.audioCuesEnabled,
    ),
  });
}

export function mergePlayerPreferences(
  current: PlayerPreferences,
  patch: PlayerPreferencePatch,
): PlayerPreferences {
  return normalizePlayerPreferences({ ...current, ...patch }, current);
}

export function decodePlayerPreferences(
  text: string | null | undefined,
  fallback: PlayerPreferences = DEFAULT_PLAYER_PREFERENCES,
): PlayerPreferences {
  if (!text || text.length > 16_384) return Object.freeze({ ...fallback });
  try {
    return normalizePlayerPreferences(JSON.parse(text) as unknown, fallback);
  } catch {
    return Object.freeze({ ...fallback });
  }
}

export function encodePlayerPreferences(preferences: PlayerPreferences): string {
  return JSON.stringify(normalizePlayerPreferences(preferences));
}

export function preferencesFromRunState(
  run: Pick<RunStateV1, "accessibility" | "controlMode">,
  audioCuesEnabled = false,
): PlayerPreferences {
  return normalizePlayerPreferences({
    ...run.accessibility,
    assistMode: run.controlMode,
    audioCuesEnabled,
  });
}

export function accessibilityFromPreferences(
  preferences: PlayerPreferences,
): RunStateV1["accessibility"] {
  const normalized = normalizePlayerPreferences(preferences);
  return Object.freeze({
    highContrast: normalized.highContrast,
    reducedMotion: normalized.reducedMotion,
    textScale: normalized.textScale,
    screenReaderAnnouncements: normalized.screenReaderAnnouncements,
  });
}

export function controlModeFromPreferences(
  preferences: PlayerPreferences,
): PlayerAssistMode {
  return normalizePlayerPreferences(preferences).assistMode;
}

export function usesAssist(preferences: PlayerPreferences): boolean {
  return normalizePlayerPreferences(preferences).assistMode !== "manual";
}

export function usesAutomaticAssist(preferences: PlayerPreferences): boolean {
  return normalizePlayerPreferences(preferences).assistMode === "automatic-assist";
}

/** Metadata for a DOM adapter; the pure core never writes to the document. */
export function playerPreferencePresentation(
  preferences: PlayerPreferences,
): PlayerPreferencePresentation {
  const normalized = normalizePlayerPreferences(preferences);
  return Object.freeze({
    attributes: Object.freeze({
      "data-reduced-motion": normalized.reducedMotion ? "true" : "false",
      "data-contrast": normalized.highContrast ? "high" : "standard",
      "data-text-scale": String(normalized.textScale) as `${PlayerTextScale}`,
      "data-assist-mode": normalized.assistMode,
    }),
    rootFontScale: normalized.textScale / 100,
    announcements: normalized.screenReaderAnnouncements ? "polite" : "off",
    motionDurationMultiplier: normalized.reducedMotion ? 0 : 1,
  });
}

/**
 * Small persistence adapter that always keeps a usable in-memory value when
 * storage is blocked (private mode, quota, permissions, or server rendering).
 */
export function createPlayerPreferenceStore(
  storage: PreferenceStoragePort | null | undefined,
  storageKey = PLAYER_PREFERENCES_STORAGE_KEY,
): PlayerPreferenceStore {
  let current = Object.freeze({ ...DEFAULT_PLAYER_PREFERENCES });

  const load = (): PlayerPreferences => {
    if (!storage) return current;
    try {
      current = decodePlayerPreferences(storage.getItem(storageKey), current);
    } catch {
      // Keep the last usable in-memory preferences.
    }
    return current;
  };

  const save = (preferences: PlayerPreferences): PlayerPreferences => {
    current = normalizePlayerPreferences(preferences, current);
    if (storage) {
      try {
        storage.setItem(storageKey, encodePlayerPreferences(current));
      } catch {
        // Preferences still apply for this session when persistence is blocked.
      }
    }
    return current;
  };

  return Object.freeze({
    load,
    save,
    update: (patch: PlayerPreferencePatch) => save(mergePlayerPreferences(current, patch)),
    reset: () => {
      current = Object.freeze({ ...DEFAULT_PLAYER_PREFERENCES });
      if (storage?.removeItem) {
        try {
          storage.removeItem(storageKey);
        } catch {
          // Reset remains effective in memory.
        }
      } else if (storage) {
        try {
          storage.setItem(storageKey, encodePlayerPreferences(current));
        } catch {
          // Reset remains effective in memory.
        }
      }
      return current;
    },
  });
}
