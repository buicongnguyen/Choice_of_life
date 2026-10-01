import { rng } from "../game/rng";
import { resolve, type ChapterDef, type PlaceId } from "../game/story/model";
import type { LifeState } from "../game/types";

/**
 * Gulls by the sea (pure simulation; GullView draws it). Perched gulls stand on the quay edge,
 * the sand or the cliff grass, look about and peck; when you run up, a group takes off one after
 * another and flies away from the lanes on its own side (quay gulls out over the water and out of
 * the bottom of the picture, back-verge gulls up over the roofs), never hovering over the lanes.
 * A few more circle high over the backdrop. Gulls that fly off don't come back: new ones wait
 * further along. With reduced motion they stay perched and none circle.
 */

type Spot = readonly [z0: number, z1: number, y: number];

/** Where gulls perch in each seaside place (depth range and ground height). */
export const PERCHES: Partial<Record<PlaceId, { spots: Spot[]; sky: Spot }>> = {
  harbour: { spots: [[5.85, 6.45, 0.11]], sky: [-12, -4, 7] },
  festival: { spots: [[5.85, 6.45, 0.11]], sky: [-12, -4, 7.5] },
  coast: { spots: [[-9, -4.2, -0.08], [3.3, 5.6, 0]], sky: [-22, -8, 6] },
  cliff: { spots: [[3.3, 5, 0], [-9, -4, -0.05]], sky: [-24, -8, 5.5] },
  dusk_cliff: { spots: [[3.3, 5, 0]], sky: [-24, -10, 6] },
};

export type GullMode = "perched" | "flying" | "circling" | "gone";

export interface Gull {
  mode: GullMode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  vx: number;
  vy: number;
  vz: number;
  /** 0 = wings folded, 1 = spread. */
  spread: number;
  /** Flapping phase (radians) and how hard (0 = gliding). */
  flap: number;
  flapping: number;
  head: number;
  headTarget: number;
  peck: number;
  /** Timer for the next head turn, peck or flap burst. */
  timer: number;
  /** Delay before taking off once startled (gulls in a group go one after another). */
  delay: number;
  /** Circling: centre (drifting towards ty, tz), radius and angular speed. */
  cx: number;
  cy: number;
  cz: number;
  ty: number;
  tz: number;
  radius: number;
  turn: number;
  angle: number;
  seed: number;
}

export interface FlockEvent {
  type: "takeoff";
  x: number;
  y: number;
  z: number;
  /** How many took off together. */
  count: number;
}

/** How close (ahead of and behind the runner, and to the side) a perched gull lets you get. */
export const STARTLE = { ahead: 6.5, behind: 1.5, side: 9 };
/** Gulls this close along the course take off together. */
const GROUP = 2.2;
const WINDOW = { behind: 30, ahead: 95 };

function makeGull(mode: GullMode, x: number, y: number, z: number, seed: number): Gull {
  const r = rng(seed);
  return {
    mode, x, y, z, yaw: r.range(-Math.PI, Math.PI), pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0,
    spread: mode === "perched" ? 0 : 1, flap: r.range(0, 6), flapping: 0, head: 0, headTarget: 0, peck: 0,
    timer: r.range(0.5, 3), delay: 0, cx: x, cy: y, cz: z, ty: y, tz: z, radius: r.range(5, 9), turn: (r.chance(0.5) ? 1 : -1) * r.range(0.3, 0.5),
    angle: r.range(0, Math.PI * 2), seed,
  };
}

/** Seeded perches for a chapter: small groups every 10-24 m in seaside places, sorted by x. */
export function planGulls(chapter: ChapterDef, s: LifeState): Gull[] {
  const out: Gull[] = [];
  const segments = resolve(chapter.places, s);
  segments.forEach((seg, i) => {
    const perch = PERCHES[seg.place];
    if (!perch) return;
    const x0 = i === 0 ? -20 : seg.from * chapter.length;
    const x1 = i === segments.length - 1 ? chapter.length + 60 : segments[i + 1].from * chapter.length;
    const r = rng(s.seed ^ 0x6011 ^ (chapter.index * 389) ^ (i * 53));
    for (let x = x0 + r.range(4, 14); x < x1; x += r.range(10, 24)) {
      const [z0, z1, y] = r.pick(perch.spots);
      const z = r.range(z0, z1);
      const group = r.int(1, 3);
      for (let g = 0; g < group; g++) {
        const gz = Math.min(z1, Math.max(z0, z + r.range(-0.5, 0.5)));
        out.push(makeGull("perched", x + g * r.range(0.5, 0.9), y, gz, (s.seed + out.length * 7919) | 0));
      }
    }
  });
  return out.sort((a, b) => a.x - b.x);
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Flock {
  /** Circling gulls for the place under the camera. */
  private circlers: Gull[] = [];
  private circleSky: PlaceId | null = null;
  private clock = 0;
  // Reused every frame (no per-frame allocation).
  private shown: Gull[] = [];
  private events: FlockEvent[] = [];
  private cluster: Gull[] = [];

  constructor(
    readonly perched: Gull[],
    private placeAt: (x: number) => PlaceId,
  ) {}

  /** Gulls near the camera that should be drawn (the array is reused; read it right away). */
  visible(cameraX: number): Gull[] {
    const lo = cameraX - WINDOW.behind;
    const hi = cameraX + WINDOW.ahead;
    const out = this.shown;
    out.length = 0;
    for (const g of this.perched) if (g.mode !== "gone" && g.x > lo && g.x < hi) out.push(g);
    for (const g of this.circlers) out.push(g);
    return out;
  }

  /** Moves every gull; `calm` (reduced motion) keeps them perched. Events array is reused. */
  update(dt: number, runner: { x: number; z: number; speed: number }, cameraX: number, calm = false): FlockEvent[] {
    this.clock += dt;
    const events = this.events;
    events.length = 0;
    const lo = cameraX - WINDOW.behind;
    const hi = cameraX + WINDOW.ahead;
    for (const g of this.perched) {
      if (g.mode === "gone" || g.x < lo - 30 || g.x > hi) continue;
      if (g.mode === "perched") {
        const dx = g.x - runner.x;
        if (g.delay > 0) {
          g.delay -= dt;
          if (g.delay <= 0) this.takeOff(g, runner);
        } else if (!calm && dx < STARTLE.ahead && dx > -STARTLE.behind && Math.abs(g.z - runner.z) < STARTLE.side) {
          events.push(this.startle(g, runner));
        } else this.idle(g, dt);
      } else if (g.mode === "flying") this.fly(g, dt, hi);
    }
    if (calm) this.circlers.length = 0;
    else this.updateCirclers(dt, cameraX);
    return events;
  }

  /**
   * One gull noticed you: its whole group (neighbours along the course on the same side) takes
   * off, nearest to you first and the rest a moment later, as one event.
   */
  private startle(g: Gull, runner: { x: number }): FlockEvent {
    const group = this.cluster;
    group.length = 0;
    for (const o of this.perched) {
      if (o.mode === "perched" && o.delay <= 0 && Math.abs(o.x - g.x) < GROUP && Math.sign(o.z) === Math.sign(g.z)) group.push(o);
    }
    group.sort((a, b) => Math.abs(a.x - runner.x) - Math.abs(b.x - runner.x));
    group.forEach((o, i) => (o.delay = i === 0 ? 0.0001 : 0.08 + i * 0.12 + rng(o.seed).range(0, 0.1)));
    return { type: "takeoff", x: g.x, y: g.y, z: g.z, count: group.length };
  }

  private idle(g: Gull, dt: number) {
    g.timer -= dt;
    if (g.timer <= 0) {
      const r = rng(g.seed + Math.floor(this.clock * 10));
      if (r.chance(0.3)) g.peck = 0.35;
      else g.headTarget = r.range(-0.9, 0.9);
      g.timer = r.range(0.8, 2.6);
    }
    g.head += (g.headTarget - g.head) * Math.min(1, dt * 8);
    g.peck = Math.max(0, g.peck - dt);
  }

  private takeOff(g: Gull, runner: { x: number; z: number; speed: number }) {
    const r = rng(g.seed ^ 0xf1);
    g.mode = "flying";
    g.flapping = 1;
    g.timer = r.range(1, 1.6);
    g.headTarget = 0;
    if (g.z > 0) {
      // In front of the lanes (the quay): out over the water, low, and out of the bottom of the
      // picture within a second or two, never back across the lanes.
      g.vx = runner.speed * r.range(0.7, 1) + r.range(0.5, 1.2);
      g.vy = r.range(1.2, 1.8);
      g.vz = r.range(2.6, 3.4);
    } else {
      // Behind the lanes: steeply up and away over the roofs.
      g.vx = runner.speed * r.range(0.9, 1.3) + r.range(0.5, 1.5);
      g.vy = r.range(3, 3.8);
      g.vz = -r.range(1.5, 2.5);
    }
  }

  private fly(g: Gull, dt: number, hi: number) {
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    // Climb hard at first (back-verge gulls keep climbing until above the roofs), then glide.
    const climb = g.z < 0 && g.y < 6 ? 2.5 : 0.4;
    g.vy += (climb - g.vy) * Math.min(1, dt * 0.8);
    g.spread = Math.min(1, g.spread + dt * 5);
    g.yaw += wrapAngle(Math.atan2(g.vx, g.vz) - g.yaw) * Math.min(1, dt * 6);
    g.pitch = -Math.min(0.5, g.vy * 0.15);
    g.head += (0 - g.head) * Math.min(1, dt * 8);
    this.wings(g, dt);
    if (g.y > 14 || g.z > 13 || g.x > hi + 20) g.mode = "gone";
  }

  /** Flap in bursts, glide in between. */
  private wings(g: Gull, dt: number) {
    g.timer -= dt;
    if (g.timer <= 0) {
      const r = rng(g.seed + Math.floor(this.clock * 7));
      g.flapping = g.flapping > 0.5 ? 0 : 1;
      g.timer = g.flapping ? r.range(0.6, 1.2) : r.range(1.5, 4);
    }
    g.flap += dt * 13 * Math.max(0.15, g.flapping);
  }

  private updateCirclers(dt: number, cameraX: number) {
    const place = this.placeAt(cameraX + 20);
    const perch = PERCHES[place];
    if (perch && this.circlers.length && this.circleSky !== place) {
      // From one seaside place to the next: the same gulls drift to the new sky, no popping.
      this.circleSky = place;
      const r = rng((Math.floor(cameraX) * 17) ^ 0x51);
      for (const g of this.circlers) {
        g.ty = perch.sky[2] + r.range(0, 3);
        g.tz = r.range(perch.sky[0], perch.sky[1]);
      }
    }
    if (!perch) {
      this.circleSky = null;
      this.circlers.length = 0;
    } else if (!this.circlers.length) {
      this.circleSky = place;
      const r = rng((Math.floor(cameraX) * 31) ^ 0x5ea);
      for (let i = 0; i < 3; i++) {
        const g = makeGull("circling", 0, 0, 0, (Math.floor(cameraX) + i * 104729) | 0);
        g.cx = cameraX + r.range(10, 70);
        g.cy = g.ty = perch.sky[2] + r.range(0, 3);
        g.cz = g.tz = r.range(perch.sky[0], perch.sky[1]);
        this.circlers.push(g);
      }
    }
    for (const g of this.circlers) {
      // Keep the circles near the camera: one that falls behind moves ahead.
      if (g.cx < cameraX - 35) g.cx += 110;
      g.cy += (g.ty - g.cy) * Math.min(1, dt * 0.5);
      g.cz += (g.tz - g.cz) * Math.min(1, dt * 0.5);
      g.angle += g.turn * dt;
      g.x = g.cx + Math.cos(g.angle) * g.radius;
      g.z = g.cz + Math.sin(g.angle) * g.radius * 0.6;
      g.y = g.cy + Math.sin(g.angle * 2) * 0.4;
      // Fly along the circle, banking into the turn.
      const vx = -Math.sin(g.angle) * g.turn;
      const vz = Math.cos(g.angle) * g.turn * 0.6;
      g.yaw = Math.atan2(vx, vz);
      g.roll = -Math.sign(g.turn) * 0.35;
      this.wings(g, dt);
    }
  }
}
