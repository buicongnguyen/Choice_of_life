import {
  DEFAULT_PLAYER_PREFERENCES,
  PLAYER_ASSIST_MODE_LABELS,
  PLAYER_ASSIST_MODES,
  PLAYER_TEXT_SCALES,
  mergePlayerPreferences,
  normalizePlayerPreferences,
  playerPreferencePresentation,
  type PlayerAssistMode,
  type PlayerPreferencePatch,
  type PlayerPreferences,
  type PlayerTextScale,
} from "../core/player-preferences";
import {
  createCharacterElement,
  createCompanionElement,
  type CharacterModel,
  type CompanionModel,
} from "./character-system";
import "./polish.css";

type PreferencesAudioStatus =
  | "disabled"
  | "unsupported"
  | "locked"
  | "ready"
  | "disposed";

interface PreferencesAudioManager {
  readonly status: PreferencesAudioStatus;
  setEnabled(enabled: boolean): void;
  enableFromUserGesture(): Promise<PreferencesAudioStatus>;
  play(cueId: "choice-confirm" | "notification"): unknown;
}

export interface PreferencesPanelCallbacks {
  readonly onPreferencesChange?: (
    preferences: PlayerPreferences,
    patch: PlayerPreferencePatch,
  ) => void;
  readonly onAudioStatusChange?: (status: PreferencesAudioStatus) => void;
  readonly onAnnouncement?: (message: string) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface PreferencesPanelOptions extends PreferencesPanelCallbacks {
  readonly preferences?: PlayerPreferences;
  readonly audioManager: PreferencesAudioManager;
  /** Preferences are reflected here so every life-stage view inherits them. */
  readonly presentationRoot?: HTMLElement;
  readonly title?: string;
  readonly initiallyOpen?: boolean;
}

export interface PreferencesPanel {
  readonly element: HTMLElement;
  readonly audioManager: PreferencesAudioManager;
  getPreferences(): PlayerPreferences;
  render(preferences: PlayerPreferences): void;
  setOpen(open: boolean): void;
  announce(message: string): void;
  dispose(): void;
}

export type PolishedLifeSceneTheme =
  | "nursery"
  | "school"
  | "campus"
  | "home"
  | "city"
  | "park"
  | "countryside";

export interface PolishedLifeSceneOptions {
  readonly theme?: PolishedLifeSceneTheme;
  readonly label?: string;
  readonly animated?: boolean;
}

export interface PolishedActorPlacement {
  /** Horizontal location inside the scene, clamped to 0–100. */
  readonly xPercent?: number;
  /** Small vertical adjustment while preserving the bottom-centre foot anchor. */
  readonly groundOffsetPx?: number;
  readonly scale?: number;
  readonly depth?: "back" | "middle" | "front";
}

const ASSIST_DESCRIPTIONS: Readonly<Record<PlayerAssistMode, string>> =
  Object.freeze({
    manual: "You choose every lane and action.",
    "semantic-assist": "Marks helpful and risky choices while you stay in control.",
    "automatic-assist": "Steers around hazards when a safe move is available.",
  });

let panelSequence = 0;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function labelText(
  document: Document,
  title: string,
  detail: string,
): HTMLSpanElement {
  const copy = document.createElement("span");
  copy.className = "col-preferences__label-copy";

  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = detail;
  copy.append(strong, small);
  return copy;
}

function makeSwitch(
  document: Document,
  key: keyof PlayerPreferencePatch,
  title: string,
  detail: string,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "col-preferences__switch-row";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.preferenceKey = key;
  input.className = "col-preferences__native-switch";

  const visual = document.createElement("span");
  visual.className = "col-preferences__switch";
  visual.setAttribute("aria-hidden", "true");

  label.append(input, visual, labelText(document, title, detail));
  return label;
}

function makeSection(
  document: Document,
  title: string,
  description: string,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "col-preferences__group";
  const legend = document.createElement("legend");
  legend.textContent = title;
  const intro = document.createElement("p");
  intro.className = "col-preferences__group-copy";
  intro.textContent = description;
  fieldset.append(legend, intro);
  return fieldset;
}

/** Applies presentation-only preferences without changing game or score state. */
export function applyPlayerPreferences(
  root: HTMLElement,
  preferences: PlayerPreferences,
): PlayerPreferences {
  const normalized = normalizePlayerPreferences(preferences);
  const presentation = playerPreferencePresentation(normalized);
  for (const [name, value] of Object.entries(presentation.attributes)) {
    root.setAttribute(name, value);
  }
  root.style.setProperty("--col-text-scale", String(presentation.rootFontScale));
  root.style.setProperty(
    "--col-motion-duration-multiplier",
    String(presentation.motionDurationMultiplier),
  );
  return normalized;
}

export function createPolishedLifeSceneElement(
  document: Document,
  options: PolishedLifeSceneOptions = {},
): HTMLElement {
  const scene = document.createElement("div");
  scene.className = "col-polish-life-scene";
  scene.dataset.sceneTheme = options.theme ?? "home";
  scene.dataset.animated = options.animated === false ? "false" : "true";
  scene.setAttribute("role", "img");
  scene.setAttribute(
    "aria-label",
    options.label ?? "A warm place along the journey of life",
  );

  const sky = document.createElement("span");
  sky.className = "col-polish-life-scene__sky";
  sky.setAttribute("aria-hidden", "true");
  const distance = document.createElement("span");
  distance.className = "col-polish-life-scene__distance";
  distance.setAttribute("aria-hidden", "true");
  const scenery = document.createElement("span");
  scenery.className = "col-polish-life-scene__scenery";
  scenery.setAttribute("aria-hidden", "true");
  const ground = document.createElement("span");
  ground.className = "col-polish-life-scene__ground";
  ground.setAttribute("aria-hidden", "true");
  const cast = document.createElement("span");
  cast.className = "col-polish-life-scene__cast";
  scene.append(sky, distance, scenery, ground, cast);
  return scene;
}

function placeActor(
  wrapper: HTMLElement,
  placement: PolishedActorPlacement,
): HTMLElement {
  wrapper.dataset.depth = placement.depth ?? "middle";
  wrapper.style.setProperty(
    "--col-polish-actor-x",
    `${clamp(placement.xPercent ?? 50, 0, 100)}%`,
  );
  wrapper.style.setProperty(
    "--col-polish-ground-offset",
    `${clamp(placement.groundOffsetPx ?? 0, -24, 80)}px`,
  );
  wrapper.style.setProperty(
    "--col-polish-actor-scale",
    String(clamp(placement.scale ?? 1, 0.5, 1.6)),
  );
  return wrapper;
}

export function createPolishedCharacterActor(
  document: Document,
  model: CharacterModel,
  placement: PolishedActorPlacement = {},
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "col-polish-actor col-polish-actor--character";
  wrapper.dataset.actorId = model.characterId;
  wrapper.append(createCharacterElement(document, model));
  return placeActor(wrapper, placement);
}

export function createPolishedCompanionActor(
  document: Document,
  model: CompanionModel,
  placement: PolishedActorPlacement = {},
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "col-polish-actor col-polish-actor--pet";
  wrapper.dataset.actorId = model.companionId;
  wrapper.append(createCompanionElement(document, model));
  return placeActor(wrapper, placement);
}

export function mountPreferencesPanel(
  container: HTMLElement,
  options: PreferencesPanelOptions,
): PreferencesPanel {
  const document = container.ownerDocument;
  const panelId = `col-preferences-${panelSequence += 1}`;
  let disposed = false;
  let current = normalizePlayerPreferences(
    options.preferences ?? DEFAULT_PLAYER_PREFERENCES,
  );
  const presentationRoot = options.presentationRoot ?? container;
  const audioManager = options.audioManager;
  let announcementTimer: number | undefined;

  const section = document.createElement("section");
  section.className = "col-preferences-panel";
  section.setAttribute("aria-labelledby", `${panelId}-title`);

  const header = document.createElement("div");
  header.className = "col-preferences__header";
  const headingWrap = document.createElement("div");
  const kicker = document.createElement("span");
  kicker.className = "col-preferences__kicker";
  kicker.textContent = "Play your way";
  const heading = document.createElement("h2");
  heading.id = `${panelId}-title`;
  heading.textContent = options.title ?? "Comfort & assistance";
  headingWrap.append(kicker, heading);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "col-preferences__toggle";
  toggle.setAttribute("aria-controls", `${panelId}-body`);
  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Settings";
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "col-preferences__toggle-icon";
  toggleIcon.setAttribute("aria-hidden", "true");
  toggleIcon.textContent = "⌄";
  toggle.append(toggleLabel, toggleIcon);
  header.append(headingWrap, toggle);

  const body = document.createElement("div");
  body.id = `${panelId}-body`;
  body.className = "col-preferences__body";

  const visualGroup = makeSection(
    document,
    "Display",
    "Change presentation without changing the challenge or rewards.",
  );
  visualGroup.append(
    makeSwitch(
      document,
      "reducedMotion",
      "Reduced motion",
      "Stops decorative movement and softens transitions.",
    ),
    makeSwitch(
      document,
      "highContrast",
      "High contrast",
      "Uses stronger edges and clearer foreground colours.",
    ),
  );

  const scaleLabel = document.createElement("label");
  scaleLabel.className = "col-preferences__select-row";
  scaleLabel.append(
    labelText(document, "Text size", "Choose from 100% to 200%."),
  );
  const scaleSelect = document.createElement("select");
  scaleSelect.dataset.preferenceKey = "textScale";
  scaleSelect.setAttribute("aria-label", "Text size");
  for (const scale of PLAYER_TEXT_SCALES) {
    const option = document.createElement("option");
    option.value = String(scale);
    option.textContent = `${scale}%`;
    scaleSelect.append(option);
  }
  scaleLabel.append(scaleSelect);
  visualGroup.append(scaleLabel);

  const assistGroup = makeSection(
    document,
    "Runner assistance",
    "Assistance is a presentation and control choice; it never changes the story score.",
  );
  const assistGrid = document.createElement("div");
  assistGrid.className = "col-preferences__assist-grid";
  for (const mode of PLAYER_ASSIST_MODES) {
    const label = document.createElement("label");
    label.className = "col-preferences__assist-card";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `${panelId}-assist-mode`;
    radio.value = mode;
    radio.dataset.preferenceKey = "assistMode";
    label.append(
      radio,
      labelText(
        document,
        PLAYER_ASSIST_MODE_LABELS[mode],
        ASSIST_DESCRIPTIONS[mode],
      ),
    );
    assistGrid.append(label);
  }
  assistGroup.append(assistGrid);

  const sensesGroup = makeSection(
    document,
    "Feedback",
    "Important events always keep a visible equivalent, even when sound is off.",
  );
  sensesGroup.append(
    makeSwitch(
      document,
      "screenReaderAnnouncements",
      "Screen-reader announcements",
      "Reads choices, score changes, and stage updates.",
    ),
    makeSwitch(
      document,
      "audioCuesEnabled",
      "Audio cues",
      "Off by default. Turn on to enable short nonverbal cues.",
    ),
  );

  const footer = document.createElement("div");
  footer.className = "col-preferences__footer";
  const status = document.createElement("p");
  status.className = "col-preferences__status";
  status.setAttribute("role", "status");
  status.textContent = "Preferences apply immediately.";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "col-preferences__reset";
  reset.dataset.preferenceAction = "reset";
  reset.textContent = "Reset";
  footer.append(status, reset);

  const liveRegion = document.createElement("p");
  liveRegion.className = "col-preferences__live-region";
  liveRegion.setAttribute("aria-atomic", "true");
  body.append(visualGroup, assistGroup, sensesGroup, footer, liveRegion);
  section.append(header, body);
  container.append(section);

  const syncControls = (): void => {
    for (const control of section.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-preference-key]")) {
      const key = control.dataset.preferenceKey;
      if (key === "textScale" && control instanceof HTMLSelectElement) {
        control.value = String(current.textScale);
      } else if (key === "assistMode" && control instanceof HTMLInputElement) {
        control.checked = control.value === current.assistMode;
      } else if (control instanceof HTMLInputElement && control.type === "checkbox") {
        control.checked = Boolean(current[key as keyof PlayerPreferences]);
      }
    }
    const presentation = playerPreferencePresentation(current);
    liveRegion.setAttribute("aria-live", presentation.announcements);
    section.dataset.audioStatus = audioManager.status;
  };

  const announce = (message: string): void => {
    if (disposed || !message) return;
    status.textContent = message;
    options.onAnnouncement?.(message);
    if (!current.screenReaderAnnouncements) return;
    liveRegion.textContent = "";
    if (announcementTimer !== undefined) document.defaultView?.clearTimeout(announcementTimer);
    announcementTimer = document.defaultView?.setTimeout(() => {
      announcementTimer = undefined;
      if (!disposed && current.screenReaderAnnouncements) {
        liveRegion.textContent = message;
      }
    }, 0);
  };

  const render = (preferences: PlayerPreferences): void => {
    current = applyPlayerPreferences(presentationRoot, preferences);
    audioManager.setEnabled(current.audioCuesEnabled);
    syncControls();
  };

  const commit = (
    patch: PlayerPreferencePatch,
    message: string,
    playConfirmation = true,
  ): void => {
    current = mergePlayerPreferences(current, patch);
    applyPlayerPreferences(presentationRoot, current);
    syncControls();
    options.onPreferencesChange?.(current, patch);
    announce(message);
    if (playConfirmation && current.audioCuesEnabled) {
      audioManager.play("choice-confirm");
    }
  };

  const setOpen = (open: boolean): void => {
    body.hidden = !open;
    section.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", String(open));
    options.onOpenChange?.(open);
  };

  const onToggle = (): void => {
    setOpen(body.hidden);
  };

  const onChange = (event: Event): void => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      return;
    }
    const key = control.dataset.preferenceKey;
    if (!key) return;

    if (key === "textScale") {
      const textScale = Number(control.value) as PlayerTextScale;
      commit({ textScale }, `Text size set to ${textScale}%.`);
      return;
    }
    if (key === "assistMode") {
      const assistMode = control.value as PlayerAssistMode;
      commit(
        { assistMode },
        `${PLAYER_ASSIST_MODE_LABELS[assistMode]} selected.`,
      );
      return;
    }
    if (key === "audioCuesEnabled") {
      if (!(control instanceof HTMLInputElement)) return;
      const enabled = control.checked;
      commit(
        { audioCuesEnabled: enabled },
        enabled ? "Turning on audio cues…" : "Audio cues turned off.",
        false,
      );
      if (!enabled) {
        audioManager.setEnabled(false);
        section.dataset.audioStatus = audioManager.status;
        options.onAudioStatusChange?.(audioManager.status);
        return;
      }
      void audioManager.enableFromUserGesture().then((audioStatus) => {
        if (disposed) return;
        section.dataset.audioStatus = audioStatus;
        options.onAudioStatusChange?.(audioStatus);
        if (audioStatus === "ready") {
          audioManager.play("notification");
          announce("Audio cues are on.");
        } else if (audioStatus === "unsupported") {
          announce("Audio is unavailable here; visual cues remain on.");
        } else {
          announce("Audio is waiting for browser permission; visual cues remain on.");
        }
      });
      return;
    }
    if (
      key === "reducedMotion" ||
      key === "highContrast" ||
      key === "screenReaderAnnouncements"
    ) {
      if (!(control instanceof HTMLInputElement)) return;
      commit(
        { [key]: control.checked },
        `${labelTextForKey(key)} ${control.checked ? "on" : "off"}.`,
      );
    }
  };

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-preference-action="reset"]')) {
      const resetPreferences = normalizePlayerPreferences(DEFAULT_PLAYER_PREFERENCES);
      const patch: PlayerPreferencePatch = {
        reducedMotion: resetPreferences.reducedMotion,
        highContrast: resetPreferences.highContrast,
        textScale: resetPreferences.textScale,
        screenReaderAnnouncements: resetPreferences.screenReaderAnnouncements,
        assistMode: resetPreferences.assistMode,
        audioCuesEnabled: resetPreferences.audioCuesEnabled,
      };
      audioManager.setEnabled(false);
      commit(patch, "Preferences reset to defaults.", false);
    }
  };

  toggle.addEventListener("click", onToggle);
  body.addEventListener("change", onChange);
  body.addEventListener("click", onClick);
  render(current);
  setOpen(options.initiallyOpen ?? false);

  return Object.freeze({
    element: section,
    audioManager,
    getPreferences: () => current,
    render,
    setOpen,
    announce,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      toggle.removeEventListener("click", onToggle);
      body.removeEventListener("change", onChange);
      body.removeEventListener("click", onClick);
      if (announcementTimer !== undefined) document.defaultView?.clearTimeout(announcementTimer);
      section.remove();
    },
  });
}

function labelTextForKey(
  key: "reducedMotion" | "highContrast" | "screenReaderAnnouncements",
): string {
  switch (key) {
    case "reducedMotion":
      return "Reduced motion";
    case "highContrast":
      return "High contrast";
    case "screenReaderAnnouncements":
      return "Screen-reader announcements";
  }
}
