import type { PetKind } from "./types";

export type PetFacing = "front" | "left" | "back" | "right";
export type PetAnimationState = "idle" | "walkA" | "walkB" | "sit";

export interface StorybookPetFrame {
  column: number;
  row: number;
}

export interface StorybookPetMotion {
  facing?: PetFacing;
  moving?: boolean;
  phase?: number;
  sitting?: boolean;
}

export interface StorybookPetDrawOptions extends StorybookPetMotion {
  focused?: boolean;
  shadow?: boolean;
}

interface PetAtlasState {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readyPromise: Promise<void>;
}

export const PET_ATLAS_CELL_SIZE = 256;
export const PET_ATLAS_FOOT_ANCHOR = [128, 236] as const;

const PET_ATLAS_URLS: Record<PetKind, string> = {
  dog: new URL(
    "./assets/pets/pet-atlas-dog.png",
    import.meta.url
  ).href,
  cat: new URL(
    "./assets/pets/pet-atlas-cat.png",
    import.meta.url
  ).href,
};

const FACING_COLUMN: Record<PetFacing, number> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const ANIMATION_ROW: Record<PetAnimationState, number> = {
  idle: 0,
  walkA: 1,
  walkB: 2,
  sit: 3,
};

const PET_RENDER_SIZE: Record<PetKind, number> = {
  dog: 76,
  cat: 72,
};

const petAtlasCache = new Map<string, PetAtlasState>();

function petAnimationState(
  motion: StorybookPetMotion
): PetAnimationState {
  if (motion.sitting) return "sit";
  if (!motion.moving) return "idle";

  const phase = Number.isFinite(motion.phase) ? motion.phase ?? 0 : 0;
  const cycle = Math.PI * 2;
  const normalized = ((phase % cycle) + cycle) % cycle;
  return normalized < Math.PI ? "walkA" : "walkB";
}

/**
 * Resolve the exact cell in the 4×4 pet atlas.
 * Columns are front, left, back, right; rows are idle, walk A, walk B, sit.
 */
export function storybookPetFrame(
  motion: StorybookPetMotion = {}
): StorybookPetFrame {
  const facing = motion.facing ?? "front";
  const state = petAnimationState(motion);
  return {
    column: FACING_COLUMN[facing],
    row: ANIMATION_ROW[state],
  };
}

function atlasStateFor(
  kind: PetKind,
  retryFailed = false
): PetAtlasState | null {
  if (typeof Image === "undefined") return null;
  const url = PET_ATLAS_URLS[kind];
  const cached = petAtlasCache.get(url);
  if (cached && (!cached.failed || !retryFailed)) return cached;
  if (cached?.failed && retryFailed) petAtlasCache.delete(url);

  const image = new Image();
  image.decoding = "async";
  const state: PetAtlasState = {
    image,
    ready: false,
    failed: false,
    readyPromise: Promise.resolve(),
  };
  state.readyPromise = new Promise<void>((resolve) => {
    const finishReady = async (): Promise<void> => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch {
        // The load event and natural dimensions still make the image
        // drawable when an eager decode hint is rejected.
      }
      state.ready =
        image.naturalWidth === PET_ATLAS_CELL_SIZE * 4 &&
        image.naturalHeight === PET_ATLAS_CELL_SIZE * 4;
      state.failed = !state.ready;
      if (state.ready && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("plj:pet-atlas-ready", {
            detail: { kind },
          })
        );
      }
      resolve();
    };
    image.addEventListener("load", () => void finishReady(), {
      once: true,
    });
    image.addEventListener(
      "error",
      () => {
        state.failed = true;
        resolve();
      },
      { once: true }
    );
  });
  image.src = url;
  petAtlasCache.set(url, state);
  return state;
}

/**
 * Decode one species or both pet atlases. This explicit boundary retries a
 * previous failure; render calls keep failed entries cached so a missing
 * asset cannot be requested again on every animation frame.
 */
export async function warmStorybookPetAtlases(
  kind?: PetKind
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const kinds = kind ? [kind] : (["dog", "cat"] as const);
  const states = kinds
    .map((entry) => atlasStateFor(entry, true))
    .filter((state): state is PetAtlasState => state !== null);
  await Promise.all(states.map((state) => state.readyPromise));
  return states.every((state) => state.ready && !state.failed);
}

export function storybookPetAtlasUrl(kind: PetKind): string {
  return PET_ATLAS_URLS[kind];
}

function drawPetGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  size: number,
  focused: boolean
): void {
  ctx.save();
  ctx.fillStyle = "rgba(31, 24, 36, 0.10)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    footY + 1,
    size * 0.34,
    Math.max(3, size * 0.07),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.fillStyle = focused
    ? "rgba(31, 24, 36, 0.22)"
    : "rgba(31, 24, 36, 0.16)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    footY,
    size * 0.25,
    Math.max(2, size * 0.045),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

/**
 * Draw generated pet art with its source foot anchored at `(x, footY)`.
 * Returns false while loading or after failure so the procedural pet remains
 * an explicit fallback.
 */
export function drawStorybookPet(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  kind: PetKind,
  options: StorybookPetDrawOptions = {}
): boolean {
  const atlas = atlasStateFor(kind);
  if (!atlas || !atlas.ready || atlas.failed) return false;

  const frame = storybookPetFrame(options);
  const size =
    PET_RENDER_SIZE[kind] * (options.focused ? 1.08 : 1);
  const scale = size / PET_ATLAS_CELL_SIZE;

  if (options.shadow !== false) {
    drawPetGroundShadow(
      ctx,
      x,
      footY,
      size,
      !!options.focused
    );
  }

  ctx.save();
  ctx.translate(x, footY);
  const smoothing = ctx.imageSmoothingEnabled;
  const smoothingQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    atlas.image,
    frame.column * PET_ATLAS_CELL_SIZE,
    frame.row * PET_ATLAS_CELL_SIZE,
    PET_ATLAS_CELL_SIZE,
    PET_ATLAS_CELL_SIZE,
    -PET_ATLAS_FOOT_ANCHOR[0] * scale,
    -PET_ATLAS_FOOT_ANCHOR[1] * scale,
    size,
    size
  );
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = smoothingQuality;
  ctx.restore();
  return true;
}
