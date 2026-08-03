import summerAnchorManifest from "./assets/summer/summer-anchors.json";
import {
  atlasUsesMotionFrame,
  atlasWalkBob,
} from "./character-motion";
import type { Gender, HeritageStyle } from "./types";

export type SummerFacing = "front" | "left" | "back" | "right";
export type SummerAtlasKey = `${HeritageStyle}-${Gender}`;
export type SummerGroundAnchor = readonly [x: number, y: number];

export interface SummerCharacterMotion {
  facing?: SummerFacing;
  moving?: boolean;
  phase?: number;
}

export interface SummerCharacterDrawOptions
  extends SummerCharacterMotion {
  size?: number;
  shadow?: boolean;
}

export interface SummerCharacterFrame {
  atlasKey: SummerAtlasKey;
  column: number;
}

interface SummerAnchorManifest {
  version: 1;
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  heritages: readonly HeritageStyle[];
  genders: readonly Gender[];
  rows: readonly ["neutral", "motion"];
  sourceColumns: readonly [
    "front",
    "screenLeft",
    "back",
    "screenRight",
  ];
  columns: readonly [
    "frontNeutral",
    "screenLeftNeutral",
    "backNeutral",
    "screenRightNeutral",
    "frontMotion",
    "screenLeftMotion",
    "backMotion",
    "screenRightMotion",
  ];
  atlases: Record<
    SummerAtlasKey,
    readonly SummerGroundAnchor[]
  >;
}

interface AtlasState {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readyPromise: Promise<void>;
}

export const SUMMER_ATLAS_CELL_SIZE = 256;
export const SUMMER_ATLAS_COLUMNS = 8;
export const SUMMER_HERITAGES = [
  "western",
  "asian",
  "middleEastern",
  "black",
] as const satisfies readonly HeritageStyle[];
export const SUMMER_GENDERS = [
  "male",
  "female",
] as const satisfies readonly Gender[];

const ANCHORS =
  summerAnchorManifest as unknown as SummerAnchorManifest;
const FACING_COLUMN: Record<SummerFacing, number> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const SUMMER_ATLAS_URLS: Record<
  HeritageStyle,
  Record<Gender, string>
> = {
  western: {
    male: new URL(
      "./assets/summer/summer-atlas-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/summer/summer-atlas-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/summer/summer-atlas-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/summer/summer-atlas-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/summer/summer-atlas-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/summer/summer-atlas-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/summer/summer-atlas-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/summer/summer-atlas-black-female.png",
      import.meta.url
    ).href,
  },
};

const atlasCache = new Map<string, AtlasState>();

export function summerCharacterFrame(
  heritage: HeritageStyle,
  gender: Gender,
  motion: SummerCharacterMotion = {}
): SummerCharacterFrame {
  const facing = motion.facing ?? "front";
  const phase = Number.isFinite(motion.phase)
    ? motion.phase ?? 0
    : 0;
  const useMotion =
    !!motion.moving && atlasUsesMotionFrame(phase);
  return {
    atlasKey: `${heritage}-${gender}`,
    column: FACING_COLUMN[facing] + (useMotion ? 4 : 0),
  };
}

export function summerCharacterGroundAnchor(
  frame: SummerCharacterFrame
): SummerGroundAnchor | null {
  return ANCHORS.atlases[frame.atlasKey]?.[frame.column] ?? null;
}

export function summerCharacterAtlasUrl(
  heritage: HeritageStyle,
  gender: Gender
): string {
  return SUMMER_ATLAS_URLS[heritage][gender];
}

function atlasStateFor(
  heritage: HeritageStyle,
  gender: Gender,
  retryFailed = false
): AtlasState | null {
  if (typeof Image === "undefined") return null;
  const url = SUMMER_ATLAS_URLS[heritage][gender];
  const cached = atlasCache.get(url);
  if (cached && (!cached.failed || !retryFailed)) return cached;
  if (cached?.failed && retryFailed) atlasCache.delete(url);

  const image = new Image();
  image.decoding = "async";
  const state: AtlasState = {
    image,
    ready: false,
    failed: false,
    readyPromise: Promise.resolve(),
  };
  state.readyPromise = new Promise<void>((resolve) => {
    const markReady = async (): Promise<void> => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch {
        // A loaded PNG remains drawable when eager decode is unavailable.
      }
      state.ready =
        image.naturalWidth ===
          SUMMER_ATLAS_CELL_SIZE * SUMMER_ATLAS_COLUMNS &&
        image.naturalHeight === SUMMER_ATLAS_CELL_SIZE;
      state.failed = !state.ready;
      if (state.ready && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("plj:summer-atlas-ready", {
            detail: { heritage, gender },
          })
        );
      }
      resolve();
    };
    image.addEventListener("load", () => void markReady(), {
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
  atlasCache.set(url, state);
  return state;
}

/**
 * Decode one exact summer identity, a heritage pair, or the complete set.
 * Supplying an identity keeps gameplay memory use to a single 2048×256 PNG.
 */
export async function warmSummerCharacterAtlases(
  heritage?: HeritageStyle,
  gender?: Gender
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const heritages = heritage ? [heritage] : [...SUMMER_HERITAGES];
  const genders = gender ? [gender] : [...SUMMER_GENDERS];
  const states: AtlasState[] = [];

  for (const selectedHeritage of heritages) {
    for (const selectedGender of genders) {
      const state = atlasStateFor(
        selectedHeritage,
        selectedGender,
        true
      );
      if (state) states.push(state);
    }
  }
  await Promise.all(states.map((state) => state.readyPromise));
  return states.every((state) => state.ready && !state.failed);
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  size: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(31, 24, 36, 0.13)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    footY + 1,
    size * 0.24,
    Math.max(2.5, size * 0.035),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

/**
 * Draw one grounded summer figure. False means its atlas has not decoded or
 * failed validation, allowing the caller to keep the existing avatar visible.
 */
export function drawSummerCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  heritage: HeritageStyle,
  gender: Gender,
  options: SummerCharacterDrawOptions = {}
): boolean {
  const frame = summerCharacterFrame(heritage, gender, options);
  const atlas = atlasStateFor(heritage, gender);
  if (!atlas || !atlas.ready || atlas.failed) return false;
  const anchor = summerCharacterGroundAnchor(frame);
  if (!anchor) return false;

  const size = options.size ?? 142;
  const scale = size / SUMMER_ATLAS_CELL_SIZE;
  const phase = Number.isFinite(options.phase)
    ? options.phase ?? 0
    : 0;
  const bob = options.moving ? atlasWalkBob(phase, size) : 0;
  if (options.shadow !== false) {
    drawGroundShadow(ctx, x, footY, size);
  }

  ctx.save();
  ctx.translate(x, footY - bob);
  const smoothing = ctx.imageSmoothingEnabled;
  const smoothingQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    atlas.image,
    frame.column * SUMMER_ATLAS_CELL_SIZE,
    0,
    SUMMER_ATLAS_CELL_SIZE,
    SUMMER_ATLAS_CELL_SIZE,
    -anchor[0] * scale,
    -anchor[1] * scale,
    size,
    size
  );
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = smoothingQuality;
  ctx.restore();
  return true;
}
