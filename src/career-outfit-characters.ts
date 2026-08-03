import careerOutfitManifest from "./assets/career-outfits/career-outfit-anchors.json";
import {
  atlasUsesMotionFrame,
  atlasWalkBob,
} from "./character-motion";
import type {
  Gender,
  HeritageStyle,
  JobUniform,
} from "./types";

export type CareerOutfitFacing =
  | "front"
  | "left"
  | "back"
  | "right";
export type CareerOutfitHeritage = Extract<
  HeritageStyle,
  "western" | "asian"
>;
export type CareerOutfitSeason = "standard" | "summer";
export type CareerOutfitPack =
  | "service"
  | "technical"
  | "leadership";
export type CareerOutfitAgeBand = "adult";

export const CAREER_OUTFIT_UNIFORMS = [
  "teacher",
  "chef",
  "barista",
  "athlete",
  "artist",
  "generalengineer",
  "softwareengineer",
  "police",
  "entrepreneur",
  "manager",
  "analyst",
  "lawyer",
  "ceo",
] as const satisfies readonly JobUniform[];

export type CareerOutfitUniform =
  (typeof CAREER_OUTFIT_UNIFORMS)[number];

export const CAREER_OUTFIT_HERITAGES = [
  "western",
  "asian",
] as const satisfies readonly CareerOutfitHeritage[];
export const CAREER_OUTFIT_GENDERS = [
  "male",
  "female",
] as const satisfies readonly Gender[];
export const CAREER_OUTFIT_SEASONS = [
  "standard",
  "summer",
] as const satisfies readonly CareerOutfitSeason[];
export const CAREER_OUTFIT_PACKS = [
  "service",
  "technical",
  "leadership",
] as const satisfies readonly CareerOutfitPack[];

export const CAREER_OUTFIT_CELL_SIZE = 256;

type GroundAnchor = readonly [x: number, y: number];
type CareerOutfitAtlasKey =
  `${CareerOutfitPack}-${CareerOutfitSeason}-${CareerOutfitHeritage}-${Gender}`;

interface UniformManifestEntry {
  pack: CareerOutfitPack;
  row: number;
  ageBand: CareerOutfitAgeBand;
  summer: true;
}

interface AtlasManifestEntry {
  file: string;
  rows: readonly (readonly GroundAnchor[])[];
}

interface CareerOutfitManifest {
  version: 1;
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  packs: Record<CareerOutfitPack, readonly CareerOutfitUniform[]>;
  heritages: readonly CareerOutfitHeritage[];
  genders: readonly Gender[];
  seasons: readonly CareerOutfitSeason[];
  poses: readonly ["neutral", "motion"];
  sourceColumns: readonly [
    "front",
    "left",
    "back",
    "right",
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
  uniforms: Record<CareerOutfitUniform, UniformManifestEntry>;
  atlases: Record<CareerOutfitAtlasKey, AtlasManifestEntry>;
}

interface AtlasState {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readyPromise: Promise<void>;
}

export interface CareerOutfitMotion {
  facing?: CareerOutfitFacing;
  moving?: boolean;
  phase?: number;
}

export interface CareerOutfitDrawOptions
  extends CareerOutfitMotion {
  season?: CareerOutfitSeason;
  size?: number;
  shadow?: boolean;
}

export interface CareerOutfitFrame {
  atlasKey: CareerOutfitAtlasKey;
  pack: CareerOutfitPack;
  row: number;
  column: number;
  ageBand: CareerOutfitAgeBand;
  season: CareerOutfitSeason;
}

const MANIFEST =
  careerOutfitManifest as unknown as CareerOutfitManifest;
const FACING_COLUMN: Record<CareerOutfitFacing, number> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const atlasUrl = (
  pack: CareerOutfitPack,
  season: CareerOutfitSeason,
  heritage: CareerOutfitHeritage,
  gender: Gender
): string =>
  new URL(
    `./assets/career-outfits/career-outfit-atlas-${pack}-${season}-${heritage}-${gender}.png`,
    import.meta.url
  ).href;

const atlasCache = new Map<string, AtlasState>();

export function isCareerOutfitUniform(
  value: string
): value is CareerOutfitUniform {
  return CAREER_OUTFIT_UNIFORMS.includes(
    value as CareerOutfitUniform
  );
}

export function careerOutfitHeritage(
  heritage: HeritageStyle
): CareerOutfitHeritage | null {
  return heritage === "western" || heritage === "asian"
    ? heritage
    : null;
}

export function careerOutfitCharacterFrame(
  uniform: CareerOutfitUniform,
  heritage: HeritageStyle,
  gender: Gender,
  options: CareerOutfitMotion & {
    season?: CareerOutfitSeason;
  } = {}
): CareerOutfitFrame | null {
  const supportedHeritage = careerOutfitHeritage(heritage);
  if (!supportedHeritage) return null;
  const entry = MANIFEST.uniforms[uniform];
  if (!entry) return null;
  const season = options.season ?? "standard";
  const facing = options.facing ?? "front";
  const phase = Number.isFinite(options.phase)
    ? options.phase ?? 0
    : 0;
  const useMotion =
    !!options.moving && atlasUsesMotionFrame(phase);
  return {
    atlasKey: `${entry.pack}-${season}-${supportedHeritage}-${gender}`,
    pack: entry.pack,
    row: entry.row,
    column: FACING_COLUMN[facing] + (useMotion ? 4 : 0),
    ageBand: entry.ageBand,
    season,
  };
}

function atlasStateFor(
  pack: CareerOutfitPack,
  season: CareerOutfitSeason,
  heritage: CareerOutfitHeritage,
  gender: Gender,
  retryFailed = false
): AtlasState | null {
  if (typeof Image === "undefined") return null;
  const url = atlasUrl(pack, season, heritage, gender);
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
        // A loaded PNG remains drawable if eager decode is unavailable.
      }
      const expectedRows = MANIFEST.packs[pack].length;
      state.ready =
        image.naturalWidth === CAREER_OUTFIT_CELL_SIZE * 8 &&
        image.naturalHeight ===
          CAREER_OUTFIT_CELL_SIZE * expectedRows;
      state.failed = !state.ready;
      if (state.ready && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("plj:career-outfit-atlas-ready", {
            detail: {
              pack,
              season,
              heritage,
              gender,
            },
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

export async function warmCareerOutfitAtlases(
  heritage?: HeritageStyle,
  gender?: Gender,
  uniform?: CareerOutfitUniform,
  season: CareerOutfitSeason = "standard"
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const heritages = heritage
    ? [careerOutfitHeritage(heritage)].filter(
        (value): value is CareerOutfitHeritage =>
          value !== null
      )
    : [...CAREER_OUTFIT_HERITAGES];
  if (heritage && heritages.length === 0) return true;
  const genders = gender
    ? [gender]
    : [...CAREER_OUTFIT_GENDERS];
  const packs = uniform
    ? [MANIFEST.uniforms[uniform].pack]
    : [...CAREER_OUTFIT_PACKS];
  const states: AtlasState[] = [];

  for (const selectedHeritage of heritages) {
    for (const selectedGender of genders) {
      for (const pack of new Set(packs)) {
        const state = atlasStateFor(
          pack,
          season,
          selectedHeritage,
          selectedGender,
          true
        );
        if (state) states.push(state);
      }
    }
  }
  await Promise.all(
    states.map((state) => state.readyPromise)
  );
  return states.every(
    (state) => state.ready && !state.failed
  );
}

export function careerOutfitAtlasUrl(
  uniform: CareerOutfitUniform,
  heritage: CareerOutfitHeritage,
  gender: Gender,
  season: CareerOutfitSeason = "standard"
): string {
  return atlasUrl(
    MANIFEST.uniforms[uniform].pack,
    season,
    heritage,
    gender
  );
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

export function drawCareerOutfitCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  uniform: CareerOutfitUniform,
  heritage: HeritageStyle,
  gender: Gender,
  options: CareerOutfitDrawOptions = {}
): boolean {
  const frame = careerOutfitCharacterFrame(
    uniform,
    heritage,
    gender,
    options
  );
  const supportedHeritage = careerOutfitHeritage(heritage);
  if (!frame || !supportedHeritage) return false;
  const atlas = atlasStateFor(
    frame.pack,
    frame.season,
    supportedHeritage,
    gender
  );
  if (!atlas || !atlas.ready || atlas.failed) return false;
  const anchor =
    MANIFEST.atlases[frame.atlasKey]?.rows[frame.row]?.[
      frame.column
    ];
  if (!anchor) return false;

  const size = options.size ?? 142;
  const scale = size / CAREER_OUTFIT_CELL_SIZE;
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
    frame.column * CAREER_OUTFIT_CELL_SIZE,
    frame.row * CAREER_OUTFIT_CELL_SIZE,
    CAREER_OUTFIT_CELL_SIZE,
    CAREER_OUTFIT_CELL_SIZE,
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
