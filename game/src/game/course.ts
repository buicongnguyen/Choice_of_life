import { rng, type Rng } from "./rng";
import type { ChapterDef, EncounterDef, HazardDef } from "./story/model";
import type { Assist, LifeState, ScoreKey } from "./types";

export type Lane = 0 | 1 | 2;
/** Lane 0 is the far lane (top of the screen), 2 the near lane. */
export const LANE_Z = [-1.9, 0, 1.9] as const;
export const LANES: readonly Lane[] = [0, 1, 2];

export type SpawnKind = "pickup" | "hazard" | "keepsake" | "letter";

export interface Spawn {
  id: number;
  kind: SpawnKind;
  x: number;
  lane: Lane;
  /** Height of the item's centre above the ground (pickups arc over low hazards). */
  y: number;
  score?: ScoreKey;
  hazard?: HazardDef;
  /** Keepsake index 0..2 within the chapter. */
  index?: number;
}

export interface EncounterMark {
  id: string;
  x: number;
}

export interface Course {
  chapter: number;
  length: number;
  spawns: Spawn[];
  encounters: EncounterMark[];
  /** Wind gust positions (chapter 6). */
  gusts: number[];
}

export const HAZARD_HALF_LENGTH = 0.55;
export const START_CLEAR = 26;
export const END_CLEAR = 22;
/** Encounters clear the lane this far before and after the person. */
export const ZONE_BEFORE = 42;
export const ZONE_AFTER = 16;

const ASSIST_DENSITY: Record<Assist, number> = { relaxed: 0.6, standard: 1, brisk: 1.3 };

export function encounterX(chapter: ChapterDef, e: EncounterDef): number {
  return Math.round(e.at * chapter.length);
}

export function generateCourse(chapter: ChapterDef, encounters: EncounterDef[], life: LifeState): Course {
  const r = rng(life.seed ^ Math.imul(chapter.index + 1, 0x9e3779b1));
  const spawns: Spawn[] = [];
  let id = 0;
  const add = (s: Omit<Spawn, "id">) => spawns.push({ ...s, id: id++ });
  const marks = encounters.map((e) => ({ id: e.id, x: encounterX(chapter, e) }));
  const blocked = (x: number) =>
    x < START_CLEAR ||
    x > chapter.length - END_CLEAR ||
    marks.some((m) => x > m.x - ZONE_BEFORE && x < m.x + ZONE_AFTER);

  const course: Course = { chapter: chapter.index, length: chapter.length, spawns, encounters: marks, gusts: [] };
  if (!chapter.hazards.length) {
    // Walking chapters (prologue, finale): a gentle trail of lanterns-as-stars only.
    for (let x = START_CLEAR; x < chapter.length - END_CLEAR; x += 9) {
      if (!blocked(x)) add({ kind: "pickup", x, lane: 1, y: 0.7, score: "happiness" });
    }
    return course;
  }

  const lows = chapter.hazards.filter((h) => h.kind === "low");
  const talls = chapter.hazards.filter((h) => h.kind === "tall");
  const anyHazard = () => r.pick(chapter.hazards);
  const scoreCycle: ScoreKey[] = ["health", "happiness", "money"];
  let scoreTurn = r.int(0, 2);
  const nextScore = () => scoreCycle[scoreTurn++ % 3];

  const trail = (x: number, lane: Lane, count: number, step = 2.2) => {
    const score = nextScore();
    for (let i = 0; i < count; i++) {
      const px = x + i * step;
      if (!blocked(px)) add({ kind: "pickup", x: px, lane, y: 0.62, score });
    }
  };
  const arc = (x: number, lane: Lane) => {
    const score = nextScore();
    for (let i = -2; i <= 2; i++) {
      add({ kind: "pickup", x: x + i * 1.1, lane, y: 0.9 + (1 - (i * i) / 4) * 0.75, score });
    }
  };
  const hazard = (x: number, lane: Lane, def: HazardDef) => add({ kind: "hazard", x, lane, y: 0, hazard: def });
  const otherLanes = (lane: Lane) => LANES.filter((l) => l !== lane);

  const density = (chapter.density * ASSIST_DENSITY[life.assist]) / 100;
  const spacing = 1 / Math.max(density, 0.001);
  // Keepsake and letter positions are chosen first so the pattern loop can leave room.
  const keepsakeXs = [0.27, 0.56, 0.79].map((f) => freeX(f * chapter.length, blocked));
  // Letters are laid out whenever a chapter can have them; the runner only lets you collect
  // them once you've promised to write (which can happen earlier in the same chapter).
  const letters = chapter.letters ? [0.24, 0.46, 0.64, 0.86].map((f) => freeX(f * chapter.length, blocked)) : [];
  const reserved = [...keepsakeXs, ...letters];
  const nearReserved = (x: number) => reserved.some((rx) => Math.abs(rx - x) < 9);

  let x = START_CLEAR + 6;
  while (x < chapter.length - END_CLEAR) {
    if (blocked(x) || nearReserved(x)) {
      x += 3;
      continue;
    }
    const pattern = r.next();
    const lane = r.int(0, 2) as Lane;
    if (pattern < 0.3) {
      // One hazard; a pickup trail in another lane.
      hazard(x, lane, anyHazard());
      trail(x - 2, r.pick(otherLanes(lane)), 3);
    } else if (pattern < 0.55) {
      // Two hazards; the free lane carries the reward.
      const free = lane;
      const [a, b] = otherLanes(free);
      hazard(x, a, anyHazard());
      hazard(x, b, anyHazard());
      trail(x - 3, free, 3);
    } else if (pattern < 0.78 && lows.length) {
      // A low hazard with a jump arc of pickups over it.
      hazard(x, lane, r.pick(lows));
      arc(x, lane);
    } else {
      // A weave: two hazards in different lanes, staggered.
      const second = r.pick(otherLanes(lane));
      hazard(x, lane, talls.length && r.chance(0.6) ? r.pick(talls) : anyHazard());
      if (!blocked(x + 8) && !nearReserved(x + 8)) hazard(x + 8, second, anyHazard());
      trail(x + 2, LANES.find((l) => l !== lane && l !== second)!, 3);
    }
    x += spacing * r.range(0.75, 1.25);
    // Loose pickups between rows keep every lane worth visiting.
    if (r.chance(0.35)) {
      const px = x - spacing * 0.5;
      if (!blocked(px) && !nearReserved(px)) trail(px, r.int(0, 2) as Lane, r.int(2, 4));
    }
  }

  keepsakeXs.forEach((kx, index) => placeKeepsake(r, kx, index, lows, talls, chapter, hazard, add));
  for (const lx of letters) add({ kind: "letter", x: lx, lane: r.int(0, 2) as Lane, y: 0.75 });

  if (chapter.wind) {
    for (let gx = START_CLEAR + 40; gx < chapter.length - END_CLEAR; gx += r.range(55, 85)) {
      if (!blocked(gx)) course.gusts.push(Math.round(gx));
    }
  }
  spawns.sort((a, b) => a.x - b.x || a.lane - b.lane);
  return course;
}

/** Keepsakes float above a low hazard (jump to reach), beside a tall one; the third lane stays free. */
function placeKeepsake(
  r: Rng,
  x: number,
  index: number,
  lows: HazardDef[],
  talls: HazardDef[],
  chapter: ChapterDef,
  hazard: (x: number, lane: Lane, def: HazardDef) => void,
  add: (s: Omit<Spawn, "id">) => void,
) {
  const lane = r.int(0, 2) as Lane;
  const low = lows.length ? r.pick(lows) : undefined;
  if (low) hazard(x, lane, low);
  const others = LANES.filter((l) => l !== lane);
  const guard = talls.length ? r.pick(talls) : r.pick(chapter.hazards);
  hazard(x, r.pick(others), guard);
  add({ kind: "keepsake", x, lane, y: low ? 1.35 : 0.8, index });
}

function freeX(x: number, blocked: (x: number) => boolean): number {
  for (let d = 0; d < 200; d += 4) {
    if (!blocked(x + d)) return Math.round(x + d);
    if (!blocked(x - d)) return Math.round(x - d);
  }
  return Math.round(x);
}

/**
 * Every stretch of track must leave at least one lane free of hazards, so the
 * course can always be finished without jumping and without being hit.
 */
export function unsafeRows(course: Course): number[] {
  const hazards = course.spawns.filter((s) => s.kind === "hazard");
  const bad: number[] = [];
  for (const h of hazards) {
    const lanes = new Set(
      hazards.filter((o) => Math.abs(o.x - h.x) < HAZARD_HALF_LENGTH * 2 + 0.2).map((o) => o.lane),
    );
    if (lanes.size >= 3) bad.push(h.x);
  }
  return bad;
}
