import occupationAnchorManifest from "./assets/occupations/occupation-anchors.json";
import {
  atlasUsesMotionFrame,
  atlasWalkBob,
} from "./character-motion";
import type {
  Gender,
  HeritageStyle,
  JobUniform,
} from "./types";

export type OccupationFacing = "front" | "left" | "back" | "right";
export type OccupationHeritage = Extract<
  HeritageStyle,
  "western" | "asian"
>;
export type OccupationAgeBand = "adult" | "middleAge";
export type LegacyJobUniform = Extract<
  JobUniform,
  "doctor" | "trainer" | "dancer" | "soldier" | "farmer"
>;

export interface OccupationCharacterFrame {
  atlasKey: `${LegacyJobUniform}-${OccupationHeritage}-${Gender}`;
  ageBand: OccupationAgeBand;
  column: number;
}

export interface OccupationCharacterMotion {
  facing?: OccupationFacing;
  moving?: boolean;
  phase?: number;
}

export interface OccupationCharacterDrawOptions
  extends OccupationCharacterMotion {
  size?: number;
  shadow?: boolean;
}

type OccupationAtlasKey =
  OccupationCharacterFrame["atlasKey"];
type GroundAnchor = readonly [x: number, y: number];

interface OccupationAnchorManifest {
  version: 1;
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  jobs: readonly LegacyJobUniform[];
  ageBands: Record<LegacyJobUniform, OccupationAgeBand>;
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
  atlases: Record<OccupationAtlasKey, readonly GroundAnchor[]>;
}

interface AtlasState {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readyPromise: Promise<void>;
}

export const OCCUPATION_ATLAS_CELL_SIZE = 256;
export const OCCUPATION_UNIFORMS = [
  "doctor",
  "trainer",
  "dancer",
  "soldier",
  "farmer",
] as const satisfies readonly LegacyJobUniform[];
export const OCCUPATION_HERITAGES = [
  "western",
  "asian",
] as const satisfies readonly OccupationHeritage[];

const ANCHORS =
  occupationAnchorManifest as unknown as OccupationAnchorManifest;
const FACING_COLUMN: Record<OccupationFacing, number> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const JOB_ATLAS_URLS: Record<
  LegacyJobUniform,
  Record<OccupationHeritage, Record<Gender, string>>
> = {
  doctor: {
    western: {
      male: new URL(
        "./assets/occupations/occupation-atlas-doctor-western-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-doctor-western-female.png",
        import.meta.url
      ).href,
    },
    asian: {
      male: new URL(
        "./assets/occupations/occupation-atlas-doctor-asian-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-doctor-asian-female.png",
        import.meta.url
      ).href,
    },
  },
  trainer: {
    western: {
      male: new URL(
        "./assets/occupations/occupation-atlas-trainer-western-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-trainer-western-female.png",
        import.meta.url
      ).href,
    },
    asian: {
      male: new URL(
        "./assets/occupations/occupation-atlas-trainer-asian-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-trainer-asian-female.png",
        import.meta.url
      ).href,
    },
  },
  dancer: {
    western: {
      male: new URL(
        "./assets/occupations/occupation-atlas-dancer-western-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-dancer-western-female.png",
        import.meta.url
      ).href,
    },
    asian: {
      male: new URL(
        "./assets/occupations/occupation-atlas-dancer-asian-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-dancer-asian-female.png",
        import.meta.url
      ).href,
    },
  },
  soldier: {
    western: {
      male: new URL(
        "./assets/occupations/occupation-atlas-soldier-western-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-soldier-western-female.png",
        import.meta.url
      ).href,
    },
    asian: {
      male: new URL(
        "./assets/occupations/occupation-atlas-soldier-asian-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-soldier-asian-female.png",
        import.meta.url
      ).href,
    },
  },
  farmer: {
    western: {
      male: new URL(
        "./assets/occupations/occupation-atlas-farmer-western-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-farmer-western-female.png",
        import.meta.url
      ).href,
    },
    asian: {
      male: new URL(
        "./assets/occupations/occupation-atlas-farmer-asian-male.png",
        import.meta.url
      ).href,
      female: new URL(
        "./assets/occupations/occupation-atlas-farmer-asian-female.png",
        import.meta.url
      ).href,
    },
  },
};

const atlasCache = new Map<string, AtlasState>();

export function occupationHeritage(
  heritage: HeritageStyle
): OccupationHeritage | null {
  return heritage === "western" || heritage === "asian"
    ? heritage
    : null;
}

export function occupationCharacterFrame(
  uniform: LegacyJobUniform,
  heritage: HeritageStyle,
  gender: Gender,
  motion: OccupationCharacterMotion = {}
): OccupationCharacterFrame | null {
  const supportedHeritage = occupationHeritage(heritage);
  if (!supportedHeritage) return null;
  const facing = motion.facing ?? "front";
  const phase = Number.isFinite(motion.phase)
    ? motion.phase ?? 0
    : 0;
  const useMotion =
    !!motion.moving && atlasUsesMotionFrame(phase);
  return {
    atlasKey: `${uniform}-${supportedHeritage}-${gender}`,
    ageBand: ANCHORS.ageBands[uniform],
    column: FACING_COLUMN[facing] + (useMotion ? 4 : 0),
  };
}

function atlasStateFor(
  uniform: LegacyJobUniform,
  heritage: OccupationHeritage,
  gender: Gender,
  retryFailed = false
): AtlasState | null {
  if (typeof Image === "undefined") return null;
  const url = JOB_ATLAS_URLS[uniform][heritage][gender];
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
        if (typeof image.decode === "function") {
          await Promise.race([
            image.decode(),
            new Promise<void>((resolveTimeout) => {
              setTimeout(resolveTimeout, 2000);
            }),
          ]);
        }
      } catch {
        // A loaded PNG remains drawable if eager decode is unavailable.
      }
      state.ready =
        image.naturalWidth === OCCUPATION_ATLAS_CELL_SIZE * 8 &&
        image.naturalHeight === OCCUPATION_ATLAS_CELL_SIZE;
      state.failed = !state.ready;
      if (state.ready && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("plj:occupation-atlas-ready", {
            detail: { uniform, heritage, gender },
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

export async function warmOccupationCharacterAtlases(
  heritage?: HeritageStyle,
  gender?: Gender,
  uniform?: LegacyJobUniform
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const heritages = heritage
    ? [occupationHeritage(heritage)].filter(
        (value): value is OccupationHeritage => value !== null
      )
    : [...OCCUPATION_HERITAGES];
  if (heritage && heritages.length === 0) return true;
  const genders = gender
    ? [gender]
    : (["male", "female"] as const);
  const uniforms = uniform
    ? [uniform]
    : [...OCCUPATION_UNIFORMS];
  const states: AtlasState[] = [];

  for (const selectedHeritage of heritages) {
    for (const selectedGender of genders) {
      for (const selectedUniform of uniforms) {
        const state = atlasStateFor(
          selectedUniform,
          selectedHeritage,
          selectedGender,
          true
        );
        if (state) states.push(state);
      }
    }
  }
  await Promise.all(states.map((state) => state.readyPromise));
  return states.every((state) => state.ready && !state.failed);
}

export function occupationCharacterAtlasUrl(
  uniform: LegacyJobUniform,
  heritage: OccupationHeritage,
  gender: Gender
): string {
  return JOB_ATLAS_URLS[uniform][heritage][gender];
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
 * Draw a reviewed occupation representative at a grounded canvas position.
 * False means the heritage is unsupported or its atlas is still unavailable.
 */
export function drawOccupationCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  uniform: LegacyJobUniform,
  heritage: HeritageStyle,
  gender: Gender,
  options: OccupationCharacterDrawOptions = {}
): boolean {
  const frame = occupationCharacterFrame(
    uniform,
    heritage,
    gender,
    options
  );
  const supportedHeritage = occupationHeritage(heritage);
  if (!frame || !supportedHeritage) return false;
  const atlas = atlasStateFor(
    uniform,
    supportedHeritage,
    gender
  );
  if (!atlas || !atlas.ready || atlas.failed) return false;
  const anchor = ANCHORS.atlases[frame.atlasKey]?.[frame.column];
  if (!anchor) return false;

  const size = options.size ?? 142;
  const scale = size / OCCUPATION_ATLAS_CELL_SIZE;
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
    frame.column * OCCUPATION_ATLAS_CELL_SIZE,
    0,
    OCCUPATION_ATLAS_CELL_SIZE,
    OCCUPATION_ATLAS_CELL_SIZE,
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
