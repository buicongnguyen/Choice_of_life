import type {
  CuteCharacterLook,
  CuteCharacterMotion,
  CuteFacing,
} from "./cute-characters";
import groundAnchorManifest from "./assets/characters/character-anchors.json";
import expansionGroundAnchorManifest from "./assets/characters/character-stage-expansion-anchors.json";
import motionGroundAnchorManifest from "./assets/characters/character-motion-anchors.json";
import alternateGroundAnchorManifest from "./assets/characters/character-appearance-alternate-anchors.json";
import frameMetricsManifest from "./assets/characters/character-frame-metrics.json";
import {
  atlasUsesMotionFrame,
  atlasWalkBob,
} from "./character-motion";
import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
} from "./types";

export type StorybookAgeBand =
  | "baby"
  | "child"
  | "earlyTeen"
  | "teen"
  | "youngAdult"
  | "adult"
  | "middleAge"
  | "elder";
export type StorybookStaticAtlasFamily = "base" | "expansion";
export type StorybookAtlasFamily =
  | StorybookStaticAtlasFamily
  | "motionBase"
  | "motionExpansion"
  | "alternate";

export interface StorybookFrame {
  atlasKey: `${HeritageStyle}-${Gender}`;
  atlasFamily: StorybookAtlasFamily;
  appearance: CharacterAppearanceId;
  ageBand: StorybookAgeBand;
  row: number;
  column: number;
}

export type StorybookGroundAnchor = readonly [x: number, y: number];

export interface StorybookFrameDrawGeometry {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

interface StorybookAnchorManifest {
  version: 1;
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  atlases: Record<
    StorybookFrame["atlasKey"],
    readonly (readonly StorybookGroundAnchor[])[]
  >;
}

interface StorybookMotionAnchorManifest {
  version: 1;
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  columns: readonly [
    "frontStep",
    "screenLeftStep",
    "backStep",
    "screenRightStep",
    "floorSeatedFront",
  ];
  families: Record<
    StorybookStaticAtlasFamily,
    {
      rows: readonly StorybookAgeBand[];
      atlases: Record<
        StorybookFrame["atlasKey"],
        readonly (readonly StorybookGroundAnchor[])[]
      >;
    }
  >;
}

interface StorybookAlternateAnchorManifest {
  version: 1;
  appearance: "alternate";
  cellSize: number;
  anchorSpace: "source-cell-pixels";
  rows: readonly StorybookAgeBand[];
  columns: readonly [
    "frontNeutral",
    "screenLeftNeutral",
    "backNeutral",
    "screenRightNeutral",
    "frontMotion",
    "screenLeftMotion",
    "backMotion",
    "screenRightMotion",
    "floorSeatedFront",
  ];
  atlases: Record<
    StorybookFrame["atlasKey"],
    readonly (readonly StorybookGroundAnchor[])[]
  >;
}

interface StorybookFrameMetricFamily {
  rows: readonly StorybookAgeBand[];
  columns: number;
  directionalColumns: number;
  atlases: Record<
    StorybookFrame["atlasKey"],
    readonly (readonly number[])[]
  >;
}

interface StorybookFrameMetricsManifest {
  version: 1;
  cellSize: number;
  alphaThreshold: number;
  directionalTargetVisibleHeight: number;
  families: Record<
    StorybookAtlasFamily,
    StorybookFrameMetricFamily
  >;
}

const STORYBOOK_ANCHORS =
  groundAnchorManifest as unknown as StorybookAnchorManifest;
const EXPANSION_STORYBOOK_ANCHORS =
  expansionGroundAnchorManifest as unknown as StorybookAnchorManifest;
const MOTION_STORYBOOK_ANCHORS =
  motionGroundAnchorManifest as unknown as StorybookMotionAnchorManifest;
const ALTERNATE_STORYBOOK_ANCHORS =
  alternateGroundAnchorManifest as unknown as StorybookAlternateAnchorManifest;
const STORYBOOK_FRAME_METRICS =
  frameMetricsManifest as unknown as StorybookFrameMetricsManifest;
const CELL_SIZE = STORYBOOK_ANCHORS.cellSize;
const STORYBOOK_VISUAL_SCALE = 1.15;
const MAX_FRAME_SCALE_CORRECTION = 1.1;

// Runtime atlases are normalized by the build script to the unambiguous order
// front, screen-left, back, screen-right, regardless of the source sheet's
// illustration-view convention.
const FACING_COLUMN: Record<CuteFacing, number> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const AGE_FRAME: Record<
  StorybookAgeBand,
  { atlasFamily: StorybookStaticAtlasFamily; row: number }
> = {
  baby: { atlasFamily: "base", row: 0 },
  child: { atlasFamily: "base", row: 1 },
  earlyTeen: { atlasFamily: "expansion", row: 0 },
  teen: { atlasFamily: "base", row: 2 },
  youngAdult: { atlasFamily: "expansion", row: 1 },
  adult: { atlasFamily: "base", row: 3 },
  middleAge: { atlasFamily: "expansion", row: 2 },
  elder: { atlasFamily: "base", row: 4 },
};

const ALTERNATE_AGE_ROW: Record<StorybookAgeBand, number> = {
  baby: 0,
  child: 1,
  earlyTeen: 2,
  teen: 3,
  youngAdult: 4,
  adult: 5,
  middleAge: 6,
  elder: 7,
};

const BASE_ATLAS_URLS: Record<HeritageStyle, Record<Gender, string>> = {
  western: {
    male: new URL(
      "./assets/characters/character-atlas-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-atlas-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/characters/character-atlas-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-atlas-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/characters/character-atlas-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-atlas-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/characters/character-atlas-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-atlas-black-female.png",
      import.meta.url
    ).href,
  },
};

const EXPANSION_ATLAS_URLS: Record<
  HeritageStyle,
  Record<Gender, string>
> = {
  western: {
    male: new URL(
      "./assets/characters/character-stage-expansion-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-stage-expansion-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/characters/character-stage-expansion-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-stage-expansion-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/characters/character-stage-expansion-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-stage-expansion-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/characters/character-stage-expansion-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-stage-expansion-black-female.png",
      import.meta.url
    ).href,
  },
};

const MOTION_BASE_ATLAS_URLS: Record<
  HeritageStyle,
  Record<Gender, string>
> = {
  western: {
    male: new URL(
      "./assets/characters/character-motion-base-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-base-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/characters/character-motion-base-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-base-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/characters/character-motion-base-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-base-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/characters/character-motion-base-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-base-black-female.png",
      import.meta.url
    ).href,
  },
};

const MOTION_EXPANSION_ATLAS_URLS: Record<
  HeritageStyle,
  Record<Gender, string>
> = {
  western: {
    male: new URL(
      "./assets/characters/character-motion-expansion-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-expansion-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/characters/character-motion-expansion-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-expansion-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/characters/character-motion-expansion-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-expansion-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/characters/character-motion-expansion-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-motion-expansion-black-female.png",
      import.meta.url
    ).href,
  },
};

const ALTERNATE_ATLAS_URLS: Record<
  HeritageStyle,
  Record<Gender, string>
> = {
  western: {
    male: new URL(
      "./assets/characters/character-appearance-alternate-western-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-appearance-alternate-western-female.png",
      import.meta.url
    ).href,
  },
  asian: {
    male: new URL(
      "./assets/characters/character-appearance-alternate-asian-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-appearance-alternate-asian-female.png",
      import.meta.url
    ).href,
  },
  middleEastern: {
    male: new URL(
      "./assets/characters/character-appearance-alternate-middleEastern-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-appearance-alternate-middleEastern-female.png",
      import.meta.url
    ).href,
  },
  black: {
    male: new URL(
      "./assets/characters/character-appearance-alternate-black-male.png",
      import.meta.url
    ).href,
    female: new URL(
      "./assets/characters/character-appearance-alternate-black-female.png",
      import.meta.url
    ).href,
  },
};

const ATLAS_URLS: Record<
  StorybookAtlasFamily,
  Record<HeritageStyle, Record<Gender, string>>
> = {
  base: BASE_ATLAS_URLS,
  expansion: EXPANSION_ATLAS_URLS,
  motionBase: MOTION_BASE_ATLAS_URLS,
  motionExpansion: MOTION_EXPANSION_ATLAS_URLS,
  alternate: ALTERNATE_ATLAS_URLS,
};

interface AtlasState {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readyPromise: Promise<void>;
}

const atlasCache = new Map<string, AtlasState>();

const LIFE_STAGE_AGE_BANDS: readonly StorybookAgeBand[] = [
  "baby",
  "child",
  "child",
  "child",
  "earlyTeen",
  "teen",
  "youngAdult",
  "adult",
  "adult",
  "middleAge",
  "elder",
  "elder",
];

export function storybookAgeBand(look: CuteCharacterLook): StorybookAgeBand {
  if (
    look.lifeStageIndex !== undefined &&
    Number.isInteger(look.lifeStageIndex)
  ) {
    const stage = Math.max(
      0,
      Math.min(LIFE_STAGE_AGE_BANDS.length - 1, look.lifeStageIndex)
    );
    return LIFE_STAGE_AGE_BANDS[stage];
  }
  if (look.baby) return "baby";
  if (look.elder) return "elder";
  if (look.child) return look.heightPx >= 106 ? "earlyTeen" : "child";
  if (look.heightPx <= 116) return "teen";
  if (look.heightPx <= 124) return "youngAdult";
  if (look.heightPx <= 126) return "middleAge";
  return "adult";
}

export function storybookVisualHeight(look: CuteCharacterLook): number {
  return look.heightPx * STORYBOOK_VISUAL_SCALE;
}

export function storybookFrameForLook(
  look: CuteCharacterLook,
  facing: CuteFacing
): StorybookFrame {
  const ageBand = storybookAgeBand(look);
  const appearance: CharacterAppearanceId =
    look.appearance === "alternate" ? "alternate" : "classic";
  if (appearance === "alternate") {
    return {
      atlasKey: `${look.heritage}-${look.gender}`,
      atlasFamily: "alternate",
      appearance,
      ageBand,
      row: ALTERNATE_AGE_ROW[ageBand],
      column: FACING_COLUMN[facing],
    };
  }
  const ageFrame = AGE_FRAME[ageBand];
  return {
    atlasKey: `${look.heritage}-${look.gender}`,
    atlasFamily: ageFrame.atlasFamily,
    appearance,
    ageBand,
    row: ageFrame.row,
    column: FACING_COLUMN[facing],
  };
}

function motionAtlasFamily(
  atlasFamily: StorybookStaticAtlasFamily
): StorybookAtlasFamily {
  return atlasFamily === "base" ? "motionBase" : "motionExpansion";
}

function staticAtlasFamily(
  atlasFamily: StorybookAtlasFamily
): StorybookStaticAtlasFamily {
  return atlasFamily === "expansion" ||
    atlasFamily === "motionExpansion"
    ? "expansion"
    : "base";
}

/** The generated step pose occupies the positive half of each walk cycle. */
export function storybookUsesMotionFrame(walkPhase: number): boolean {
  return atlasUsesMotionFrame(walkPhase);
}

/**
 * Resolve the exact static, motion, or seated cell for a gameplay frame.
 * Moving characters alternate their reviewed neutral pose with a visibly
 * different generated step/crawl pose. Seated art is always front-facing.
 */
export function storybookAnimationFrameForLook(
  look: CuteCharacterLook,
  motion: CuteCharacterMotion,
  walkPhase: number
): StorybookFrame {
  const neutral = storybookFrameForLook(look, motion.facing);
  const seated =
    motion.pose === "sit" ||
    (look.baby && !motion.moving && motion.pose !== "stand");
  if (neutral.atlasFamily === "alternate") {
    if (seated) return { ...neutral, column: 8 };
    if (motion.moving && storybookUsesMotionFrame(walkPhase)) {
      return { ...neutral, column: neutral.column + 4 };
    }
    return neutral;
  }
  if (seated) {
    return {
      ...neutral,
      atlasFamily: motionAtlasFamily(
        neutral.atlasFamily as StorybookStaticAtlasFamily
      ),
      column: 4,
    };
  }
  if (motion.moving && storybookUsesMotionFrame(walkPhase)) {
    return {
      ...neutral,
      atlasFamily: motionAtlasFamily(
        neutral.atlasFamily as StorybookStaticAtlasFamily
      ),
    };
  }
  return neutral;
}

export function storybookGroundAnchorForFrame(
  frame: StorybookFrame
): StorybookGroundAnchor | null {
  if (frame.atlasFamily === "alternate") {
    return (
      ALTERNATE_STORYBOOK_ANCHORS.atlases[frame.atlasKey]?.[
        frame.row
      ]?.[frame.column] ?? null
    );
  }
  if (
    frame.atlasFamily === "motionBase" ||
    frame.atlasFamily === "motionExpansion"
  ) {
    const family = staticAtlasFamily(frame.atlasFamily);
    return (
      MOTION_STORYBOOK_ANCHORS.families[family].atlases[
        frame.atlasKey
      ]?.[frame.row]?.[frame.column] ?? null
    );
  }
  const anchors =
    frame.atlasFamily === "expansion"
      ? EXPANSION_STORYBOOK_ANCHORS
      : STORYBOOK_ANCHORS;
  return anchors.atlases[frame.atlasKey]?.[frame.row]?.[
    frame.column
  ] ?? null;
}

function storybookFrameIsSeated(frame: StorybookFrame): boolean {
  return (
    ((frame.atlasFamily === "motionBase" ||
      frame.atlasFamily === "motionExpansion") &&
      frame.column === 4) ||
    (frame.atlasFamily === "alternate" && frame.column === 8)
  );
}

export function storybookFrameVisibleHeight(
  frame: StorybookFrame
): number | null {
  const family =
    STORYBOOK_FRAME_METRICS.families[frame.atlasFamily];
  if (!family || family.rows[frame.row] !== frame.ageBand) {
    return null;
  }
  return (
    family.atlases[frame.atlasKey]?.[frame.row]?.[
      frame.column
    ] ?? null
  );
}

/**
 * Preserve a wide crawl pose's authored aspect ratio while giving every
 * directional frame the same visible stature. The largest reviewed correction
 * is 1.079×; the safety cap prevents malformed metadata from exploding a draw.
 */
export function storybookFrameScale(
  frame: StorybookFrame
): number {
  if (storybookFrameIsSeated(frame)) return 1;
  const visibleHeight = storybookFrameVisibleHeight(frame);
  if (!visibleHeight || visibleHeight <= 0) return 1;
  const correction =
    STORYBOOK_FRAME_METRICS.directionalTargetVisibleHeight /
    visibleHeight;
  return Number.isFinite(correction) &&
    correction >= 1 &&
    correction <= MAX_FRAME_SCALE_CORRECTION
    ? correction
    : 1;
}

/**
 * Resolve the exact destination rectangle used by the renderer. Keeping this
 * calculation shared and testable guarantees that size correction is uniform
 * on both axes and that the reviewed ground anchor remains fixed in the world.
 */
export function storybookFrameDrawGeometry(
  frame: StorybookFrame,
  visualHeight: number,
  anchor: StorybookGroundAnchor
): StorybookFrameDrawGeometry {
  const destinationSize =
    visualHeight * storybookFrameScale(frame);
  const sourceScale = destinationSize / CELL_SIZE;
  return {
    width: destinationSize,
    height: destinationSize,
    offsetX: -anchor[0] * sourceScale,
    offsetY: -anchor[1] * sourceScale,
  };
}

function atlasStateFor(
  atlasFamily: StorybookAtlasFamily,
  heritage: HeritageStyle,
  gender: Gender,
  retryFailed = false
): AtlasState | null {
  if (typeof Image === "undefined") return null;
  const url = ATLAS_URLS[atlasFamily][heritage][gender];
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
          await image.decode();
        }
      } catch {
        // A loaded image remains drawable when an eager decode hint is
        // unsupported or rejected by the browser.
      }
      state.ready = image.naturalWidth > 0;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("plj:character-atlas-ready")
        );
      }
      resolve();
    };
    image.addEventListener(
      "load",
      () => {
        void markReady();
      },
      { once: true }
    );
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

async function warmStorybookAtlasFamilies(
  selectedHeritage: HeritageStyle | undefined,
  atlasFamilies: readonly StorybookAtlasFamily[]
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const states: AtlasState[] = [];
  const heritages = selectedHeritage
    ? [selectedHeritage]
    : (Object.keys(BASE_ATLAS_URLS) as HeritageStyle[]);
  for (const heritage of heritages) {
    for (const atlasFamily of atlasFamilies) {
      for (const gender of ["male", "female"] as const) {
        // Warming is an explicit load/retry boundary. Render calls keep failed
        // states cached so a missing URL cannot be requested every frame.
        const state = atlasStateFor(
          atlasFamily,
          heritage,
          gender,
          true
        );
        if (state) states.push(state);
      }
    }
  }
  await Promise.all(states.map((state) => state.readyPromise));
  return states.every((state) => state.ready && !state.failed);
}

/** Decode just the four neutral setup-card images for one heritage. */
export async function warmStorybookSetupAtlases(
  selectedHeritage: HeritageStyle
): Promise<boolean> {
  return warmStorybookAtlasFamilies(selectedHeritage, [
    "base",
    "alternate",
  ]);
}

/**
 * Decode neutral, movement, seated, and alternate gender pairs.
 * False means at least one requested runtime asset failed to load.
 */
export async function warmStorybookCharacterAtlases(
  selectedHeritage?: HeritageStyle
): Promise<boolean> {
  return warmStorybookAtlasFamilies(selectedHeritage, [
    "base",
    "expansion",
    "motionBase",
    "motionExpansion",
    "alternate",
  ]);
}

/**
 * Decode only the exact neutral atlas families needed by visible NPC or friend
 * portraits. This avoids downloading every motion sheet for every heritage.
 */
export async function warmStorybookPortraits(
  looks: readonly CuteCharacterLook[]
): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const states = new Map<string, AtlasState>();
  for (const look of looks) {
    const frame = storybookFrameForLook(look, "front");
    const key = `${frame.atlasFamily}:${look.heritage}:${look.gender}`;
    if (states.has(key)) continue;
    const state = atlasStateFor(
      frame.atlasFamily,
      look.heritage,
      look.gender,
      true
    );
    if (state) states.set(key, state);
  }
  await Promise.all(
    [...states.values()].map((state) => state.readyPromise)
  );
  return [...states.values()].every(
    (state) => state.ready && !state.failed
  );
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  height: number,
  baby: boolean
): void {
  ctx.save();
  const radiusX = height * (baby ? 0.42 : 0.24);
  const radiusY = Math.max(2.5, height * 0.035);
  // A broad soft lobe survives busy scenery; the tighter core makes the exact
  // foot contact unambiguous on every procedural floor.
  ctx.fillStyle = "rgba(31, 24, 36, 0.10)";
  ctx.beginPath();
  ctx.ellipse(
    cx,
    footY + 2,
    radiusX * 1.16,
    radiusY * 1.65,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.fillStyle = baby
    ? "rgba(31, 24, 36, 0.21)"
    : "rgba(31, 24, 36, 0.25)";
  ctx.beginPath();
  ctx.ellipse(
    cx,
    footY + 1,
    radiusX * 0.84,
    radiusY,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the generated storybook atlas and return true when it was available.
 * A false result lets the caller use the procedural renderer as an explicit
 * loading/error fallback.
 */
export function drawStorybookCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  walkPhase: number,
  motion: CuteCharacterMotion
): boolean {
  let frame = storybookAnimationFrameForLook(
    look,
    motion,
    walkPhase
  );
  let atlas = atlasStateFor(
    frame.atlasFamily,
    look.heritage,
    look.gender
  );
  const requestedMotion =
    frame.atlasFamily === "motionBase" ||
    frame.atlasFamily === "motionExpansion" ||
    (frame.atlasFamily === "alternate" && frame.column >= 4);

  // Keep the generated identity on screen while a companion sheet decodes.
  // Entry/resume normally awaits every selected-heritage sheet, but this path
  // prevents an abrupt switch to a different procedural character on slow
  // devices or after an individual motion-image failure.
  if (requestedMotion && (!atlas || !atlas.ready || atlas.failed)) {
    frame = storybookFrameForLook(look, motion.facing);
    atlas = atlasStateFor(
      frame.atlasFamily,
      look.heritage,
      look.gender
    );
  }
  if (!atlas || !atlas.ready || atlas.failed) return false;
  const anchor = storybookGroundAnchorForFrame(frame);
  if (!anchor) return false;

  const visualHeight = storybookVisualHeight(look);
  const geometry = storybookFrameDrawGeometry(
    frame,
    visualHeight,
    anchor
  );
  // Square normalized cells preserve the reviewed proportions, including the
  // naturally wider crawl and floor-seated silhouettes.
  const seated = storybookFrameIsSeated(frame);
  const bob = seated
    ? 0
    : motion.moving
    ? atlasWalkBob(walkPhase, visualHeight)
    : Math.sin(walkPhase * 0.7) *
      Math.max(0.35, visualHeight * 0.004);
  drawGroundShadow(ctx, cx, footY, visualHeight, look.baby);

  ctx.save();
  ctx.translate(cx, footY - bob);
  const smoothing = ctx.imageSmoothingEnabled;
  const smoothingQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    atlas.image,
    frame.column * CELL_SIZE,
    frame.row * CELL_SIZE,
    CELL_SIZE,
    CELL_SIZE,
    geometry.offsetX,
    geometry.offsetY,
    geometry.width,
    geometry.height
  );
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = smoothingQuality;
  ctx.restore();
  return true;
}

if (typeof window !== "undefined") {
  // The title uses the default neutral pair. Motion companions wait for the
  // selected-character entry/resume flow, avoiding an unnecessary 20 MiB
  // decoded Western motion set when another heritage is chosen.
  void warmStorybookAtlasFamilies("western", ["base", "expansion"]);
}
