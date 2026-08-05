export type AudioCueId =
  | "pickup-positive"
  | "pickup-negative"
  | "choice-open"
  | "choice-confirm"
  | "lane-change"
  | "collision"
  | "recovery"
  | "stage-complete"
  | "notification";

export type AudioCueTone =
  | "positive"
  | "caution"
  | "danger"
  | "decision"
  | "movement"
  | "celebration"
  | "neutral";

export interface AudioCueVisualEquivalent {
  readonly tone: AudioCueTone;
  readonly symbol: string;
  readonly label: string;
  readonly announcement: string;
  /** Stable class for a non-audio flash, pulse, or status-chip equivalent. */
  readonly eventClass: string;
}

export interface AudioCueNote {
  readonly delayMs: number;
  readonly durationMs: number;
  readonly frequencyHz: number;
  readonly endFrequencyHz?: number;
  readonly waveform: OscillatorType;
  readonly gain: number;
}

export interface AudioCueDefinition {
  readonly cueId: AudioCueId;
  readonly visual: AudioCueVisualEquivalent;
  readonly notes: readonly AudioCueNote[];
}

export type AudioCueStatus =
  | "disabled"
  | "unsupported"
  | "locked"
  | "ready"
  | "disposed";

export type AudioCueSilentReason =
  | "disabled"
  | "unsupported"
  | "locked"
  | "disposed"
  | "playback-error"
  | null;

export interface AudioCueEvent {
  readonly cueId: AudioCueId;
  readonly visual: AudioCueVisualEquivalent;
  readonly audioPlayed: boolean;
  readonly silentReason: AudioCueSilentReason;
  readonly emittedAtMs: number;
}

export interface AudioCueManagerOptions {
  /** Audio is opt-in even when the browser supports WebAudio. */
  readonly enabled?: boolean;
  readonly volume?: number;
  readonly contextFactory?: () => AudioContext;
  readonly now?: () => number;
  /** Receives every cue, including visual-only fallbacks. */
  readonly onCue?: (event: AudioCueEvent) => void;
}

export interface AudioCueManager {
  readonly enabled: boolean;
  readonly status: AudioCueStatus;
  readonly volume: number;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  /** Call from a click/key handler after the player has opted into sound. */
  unlock(): Promise<AudioCueStatus>;
  /** Enables and unlocks in one user-gesture-safe operation. */
  enableFromUserGesture(): Promise<AudioCueStatus>;
  play(cueId: AudioCueId): AudioCueEvent;
  dispose(): Promise<void>;
}

function visual(
  tone: AudioCueTone,
  symbol: string,
  label: string,
  announcement: string,
): AudioCueVisualEquivalent {
  return Object.freeze({
    tone,
    symbol,
    label,
    announcement,
    eventClass: `col-cue-${tone}`,
  });
}

function note(
  frequencyHz: number,
  durationMs: number,
  delayMs = 0,
  waveform: OscillatorType = "sine",
  gain = 0.28,
  endFrequencyHz?: number,
): AudioCueNote {
  return Object.freeze({
    delayMs,
    durationMs,
    frequencyHz,
    endFrequencyHz,
    waveform,
    gain,
  });
}

export const AUDIO_CUE_DEFINITIONS: Readonly<Record<AudioCueId, AudioCueDefinition>> =
  Object.freeze({
    "pickup-positive": Object.freeze({
      cueId: "pickup-positive",
      visual: visual("positive", "+", "Helpful item", "Helpful item collected."),
      notes: Object.freeze([note(523, 80), note(659, 110, 72)]),
    }),
    "pickup-negative": Object.freeze({
      cueId: "pickup-negative",
      visual: visual("caution", "!", "Costly item", "A costly item was collected."),
      notes: Object.freeze([note(247, 120, 0, "triangle", 0.22, 196)]),
    }),
    "choice-open": Object.freeze({
      cueId: "choice-open",
      visual: visual("decision", "?", "Choice available", "A new choice is available."),
      notes: Object.freeze([note(392, 75), note(494, 85, 68)]),
    }),
    "choice-confirm": Object.freeze({
      cueId: "choice-confirm",
      visual: visual("decision", "✓", "Choice confirmed", "Choice confirmed."),
      notes: Object.freeze([note(440, 65), note(587, 105, 58)]),
    }),
    "lane-change": Object.freeze({
      cueId: "lane-change",
      visual: visual("movement", "↕", "Lane changed", "Moved to another lane."),
      notes: Object.freeze([note(330, 45, 0, "sine", 0.12, 370)]),
    }),
    collision: Object.freeze({
      cueId: "collision",
      visual: visual("danger", "×", "Hazard hit", "A hazard was hit."),
      notes: Object.freeze([
        note(180, 105, 0, "square", 0.2, 120),
        note(110, 95, 72, "triangle", 0.15),
      ]),
    }),
    recovery: Object.freeze({
      cueId: "recovery",
      visual: visual("positive", "♥", "Recovery", "Recovery support is available."),
      notes: Object.freeze([note(349, 90), note(440, 90, 80), note(523, 125, 160)]),
    }),
    "stage-complete": Object.freeze({
      cueId: "stage-complete",
      visual: visual("celebration", "★", "Stage complete", "Life stage complete."),
      notes: Object.freeze([
        note(392, 100),
        note(523, 110, 90),
        note(659, 165, 188),
      ]),
    }),
    notification: Object.freeze({
      cueId: "notification",
      visual: visual("neutral", "•", "Update", "New game update."),
      notes: Object.freeze([note(440, 70, 0, "sine", 0.16)]),
    }),
  });

export function getAudioCueDefinition(cueId: AudioCueId): AudioCueDefinition {
  return AUDIO_CUE_DEFINITIONS[cueId];
}

export function getAudioCueVisualEquivalent(
  cueId: AudioCueId,
): AudioCueVisualEquivalent {
  return AUDIO_CUE_DEFINITIONS[cueId].visual;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.45;
  return Math.max(0, Math.min(1, value));
}

function browserAudioContextFactory(): (() => AudioContext) | null {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
  return Constructor ? () => new Constructor() : null;
}

function scheduleDefinition(
  context: AudioContext,
  definition: AudioCueDefinition,
  masterVolume: number,
): void {
  const baseTime = context.currentTime + 0.008;
  for (const sound of definition.notes) {
    const begins = baseTime + sound.delayMs / 1_000;
    const ends = begins + sound.durationMs / 1_000;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = sound.waveform;
    oscillator.frequency.setValueAtTime(sound.frequencyHz, begins);
    if (sound.endFrequencyHz !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, sound.endFrequencyHz),
        ends,
      );
    }

    const peak = Math.max(0.0001, sound.gain * masterVolume);
    envelope.gain.setValueAtTime(0.0001, begins);
    envelope.gain.exponentialRampToValueAtTime(peak, begins + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, ends);

    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(begins);
    oscillator.stop(ends + 0.015);
  }
}

/**
 * Creates an opt-in cue player. Every `play` call emits the same visual event
 * metadata, so muted, unsupported, and locked browsers retain equivalent game
 * feedback without throwing or attempting autoplay.
 */
export function createAudioCueManager(
  options: AudioCueManagerOptions = {},
): AudioCueManager {
  let enabled = options.enabled === true;
  let volume = clampVolume(options.volume ?? 0.45);
  let context: AudioContext | null = null;
  let unsupported = false;
  let disposed = false;
  const now = options.now ?? (() => Date.now());
  const factory = options.contextFactory ?? browserAudioContextFactory();

  const status = (): AudioCueStatus => {
    if (disposed) return "disposed";
    if (!enabled) return "disabled";
    if (unsupported || !factory) return "unsupported";
    return context?.state === "running" ? "ready" : "locked";
  };

  const emit = (
    cueId: AudioCueId,
    audioPlayed: boolean,
    silentReason: AudioCueSilentReason,
  ): AudioCueEvent => {
    const event = Object.freeze({
      cueId,
      visual: getAudioCueVisualEquivalent(cueId),
      audioPlayed,
      silentReason,
      emittedAtMs: now(),
    });
    options.onCue?.(event);
    return event;
  };

  const manager: AudioCueManager = {
    get enabled() {
      return enabled;
    },
    get status() {
      return status();
    },
    get volume() {
      return volume;
    },
    setEnabled(nextEnabled: boolean): void {
      if (disposed) return;
      enabled = nextEnabled;
    },
    setVolume(nextVolume: number): void {
      volume = clampVolume(nextVolume);
    },
    async unlock(): Promise<AudioCueStatus> {
      if (disposed || !enabled) return status();
      if (!factory) {
        unsupported = true;
        return status();
      }
      try {
        context ??= factory();
        if (context.state === "suspended") await context.resume();
      } catch {
        unsupported = true;
      }
      return status();
    },
    async enableFromUserGesture(): Promise<AudioCueStatus> {
      if (!disposed) enabled = true;
      return manager.unlock();
    },
    play(cueId: AudioCueId): AudioCueEvent {
      const currentStatus = status();
      if (currentStatus !== "ready" || !context) {
        return emit(
          cueId,
          false,
          currentStatus === "ready" ? "locked" : currentStatus,
        );
      }
      try {
        scheduleDefinition(context, getAudioCueDefinition(cueId), volume);
        return emit(cueId, true, null);
      } catch {
        return emit(cueId, false, "playback-error");
      }
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      enabled = false;
      const closing = context;
      context = null;
      if (closing && closing.state !== "closed") {
        try {
          await closing.close();
        } catch {
          // Disposing audio is best-effort and must never stop game teardown.
        }
      }
    },
  };

  return manager;
}
