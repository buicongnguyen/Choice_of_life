/**
 * Automatic quality: keeps the game smooth on whatever device it runs on. On phones the cost is
 * mostly pixels (resolution) and full-screen passes (bloom), so when frames run slow the governor
 * lowers the drawing resolution step by step down to BEFORE_POST (still sharp on dense phone
 * screens), then turns bloom off, then lowers resolution to the floor.
 *
 * It never climbs back to a resolution that already proved too slow (no flip-flopping between two
 * sizes); each new scene may try one step higher again. The first seconds of a scene (loading,
 * shader compiles) are ignored, and a steady 30 fps with little work per frame is taken for a
 * capped display (battery saver), not a slow device. Bloom stays off once dropped.
 */

export const SLOW_FPS = 45;
export const FAST_FPS = 57;
/** Seconds in a row before acting (bloom, once dropped, stays off, so it needs more evidence). */
const SLOW_SECONDS = 2;
const POST_SECONDS = 4;
const FAST_SECONDS = 5;
/** Resolution goes down to here before bloom is given up. */
const BEFORE_POST = 1.25;
const STEP = 0.25;
/** Phones start here on High: their screens are dense, and pixels are what they pay for. */
const PHONE_START = 1.5;

export type GovernorChange = "ratio" | "post" | null;

export class Governor {
  ratio: number;
  post: boolean;
  fps = 0;
  /** The highest resolution that hasn't proved too slow in this scene. */
  private ceiling: number;
  private frames = 0;
  private elapsed = 0;
  private cpu = 0;
  private slow = 0;
  private fast = 0;
  /** Seconds left before measurements count again. */
  private hold = 0;

  constructor(
    /** Highest resolution allowed (device pixel ratio cap). */
    readonly max: number,
    /** Lowest resolution it may go down to. */
    readonly min: number,
    start: number,
    post: boolean,
  ) {
    this.ratio = Math.min(max, Math.max(min, start));
    this.post = post;
    this.ceiling = max;
  }

  /** Forget the current second (menus, story scenes, paused): only gameplay is measured. */
  idle() {
    this.frames = 0;
    this.elapsed = 0;
    this.cpu = 0;
    this.slow = 0;
    this.fast = 0;
  }

  /** A new scene started: ignore its first `seconds`, and allow one step back up. */
  settle(seconds = 3) {
    this.idle();
    this.hold = seconds;
    this.ceiling = Math.min(this.max, this.ceiling + STEP);
  }

  /** Feed each frame's real duration (s) and its main-thread work (ms). Returns what changed. */
  sample(dt: number, cpuMs = 0): GovernorChange {
    // A long gap is a hidden tab or a load hitch, not the device's pace: start the second over.
    if (dt > 0.25 || dt <= 0) {
      this.frames = 0;
      this.elapsed = 0;
      this.cpu = 0;
      return null;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      return null;
    }
    this.frames++;
    this.elapsed += dt;
    this.cpu += cpuMs;
    if (this.elapsed < 1) return null;
    this.fps = this.frames / this.elapsed;
    const work = this.cpu / this.frames;
    this.frames = 0;
    this.elapsed = 0;
    this.cpu = 0;
    const capped = this.fps > 27 && this.fps < 33 && work > 0 && work < 8;
    if (this.fps < SLOW_FPS && !capped) {
      this.fast = 0;
      const atPost = this.post && this.ratio <= BEFORE_POST + 1e-6;
      if (++this.slow < (atPost ? POST_SECONDS : SLOW_SECONDS)) return null;
      this.slow = 0;
      if (this.lower(BEFORE_POST)) return "ratio";
      if (this.post) {
        this.post = false;
        return "post";
      }
      return this.lower(this.min) ? "ratio" : null;
    }
    this.slow = 0;
    const top = Math.min(this.max, this.ceiling);
    if (this.fps > FAST_FPS && this.ratio < top - 1e-6) {
      if (++this.fast < FAST_SECONDS) return null;
      this.fast = 0;
      this.ratio = Math.min(top, this.ratio + STEP);
      return "ratio";
    }
    this.fast = 0;
    return null;
  }

  private lower(floor: number): boolean {
    if (this.ratio <= floor + 1e-6) return false;
    this.ratio = Math.max(floor, this.ratio - STEP);
    // This resolution was too slow; don't climb back above where we are now.
    this.ceiling = this.ratio;
    return true;
  }
}

/**
 * The governor for a quality setting. High allows up to 2x resolution with bloom and may drop to
 * 1x; Low (battery saver) caps at 1.25x without bloom and may drop to 0.75x.
 */
export function makeGovernor(
  quality: "high" | "low",
  dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
): Governor {
  const high = quality === "high";
  const max = Math.min(dpr, high ? 2 : 1.25);
  const min = Math.min(dpr, high ? 1 : 0.75);
  return new Governor(max, min, high && coarse ? Math.min(max, PHONE_START) : max, high);
}
