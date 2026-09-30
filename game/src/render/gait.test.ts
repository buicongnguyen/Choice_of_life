import { describe, expect, it } from "vitest";

import { CHAPTERS, stageSpeed } from "../game/story/chapters";
import { contactAt, gaitParams, solveGait, type Gait, type Limb } from "./gait";

/** Hip pivot heights of the Blender bodies (measured from the GLBs' LegL/LegFL joints). */
const LEGS: Record<string, number> = { toddler: 0.21, child: 0.305, teen: 0.415, adult: 0.46, elder: 0.42, dog: 0.28 };
const legs = (L: number): Limb[] => [
  { phase: 0, forward: 0, down: L },
  { phase: 0.5, forward: 0, down: L },
];
/** The crawling baby plants its knees (ahead of the hips) and hands, diagonally paired. */
const BABY: Limb[] = [
  { phase: 0, forward: 0.07, down: 0.165 },
  { phase: 0.5, forward: 0.07, down: 0.165 },
  { phase: 0.5, forward: 0.04, down: 0.19 },
  { phase: 0, forward: 0.04, down: 0.19 },
];
/** Biscuit trots: diagonal pairs of paws together. */
const DOG: Limb[] = [0, 0.5, 0.5, 0].map((phase) => ({ phase, forward: 0, down: LEGS.dog }));
const GAIT_FOR: Record<string, Gait> = { crawl: "crawl", toddle: "toddle", run: "run", walk: "walk" };

/** Moves a rig along the floor for a few strides and reports what its contacts did. */
function simulate(gait: Gait, speed: number, limbs: Limb[]) {
  const reach = Math.hypot(limbs[0].forward, limbs[0].down);
  const g = gaitParams(gait, speed, reach);
  // Two stride cycles in fine steps.
  const N = 800;
  const dt = 1 / (N * g.freq);
  let slip = 0;
  let deepest = 0;
  let hover = 0;
  let pop = 0;
  let dip = 0;
  let shortest = 1;
  let prev: { x: number; y: number; stance: boolean }[] = [];
  let prevBody = 0;
  for (let k = 0; k <= 2 * N; k++) {
    const cycle = k / N;
    const t = k * dt;
    const pose = solveGait(cycle, g, limbs);
    const now = limbs.map((l, i) => {
      const { angle, stretch } = pose.limbs[i];
      const a = Math.atan2(l.forward, l.down) - angle;
      const len = stretch * Math.hypot(l.forward, l.down);
      shortest = Math.min(shortest, stretch);
      return {
        x: speed * t + len * Math.sin(a),
        y: l.down + pose.body - len * Math.cos(a),
        stance: contactAt(cycle + l.phase, g).stance,
      };
    });
    now.forEach((c, i) => {
      deepest = Math.min(deepest, c.y);
      if (c.stance) hover = Math.max(hover, c.y);
      // A contact planted in both samples must not have moved.
      if (c.stance && prev[i]?.stance) slip = Math.max(slip, Math.abs(c.x - prev[i].x) / dt);
    });
    // Largest single-step change of body height: a pop shows up as a jump, a bob does not.
    if (t > 0) pop = Math.max(pop, Math.abs(pose.body - prevBody));
    dip = Math.min(dip, pose.body);
    prev = now;
    prevBody = pose.body;
  }
  const size = Math.max(...limbs.map((l) => l.down));
  return { g, slip: slip / speed, deepest, hover, pop: pop / size, bob: -dip / size, shortest };
}

function expectGrounded(r: ReturnType<typeof simulate>, label: string) {
  expect(r.slip, `${label}: planted foot slides`).toBeLessThan(0.01);
  expect(r.deepest, `${label}: a foot went through the floor`).toBeGreaterThan(-1e-4);
  expect(r.hover, `${label}: a planted foot hovers`).toBeLessThan(1e-4);
  // The body moves smoothly (no pop when a foot lands) and bobs only a little.
  expect(r.pop, `${label}: body pops`).toBeLessThan(0.01);
  expect(r.bob, `${label}: body bobs too much`).toBeLessThan(0.22);
  expect(r.shortest, `${label}: limb squashed`).toBeGreaterThan(0.6);
}

describe("gait", () => {
  it("planted feet stay still on the floor at every stage's speed", () => {
    for (const chapter of CHAPTERS) {
      for (const stage of chapter.stages) {
        if (stage.mode === "bike") continue;
        for (const assist of ["relaxed", "standard", "brisk"] as const) {
          const v = stageSpeed(chapter, stage, assist);
          const rig = stage.mode === "crawl" ? BABY : legs(LEGS[stage.age]);
          expectGrounded(simulate(GAIT_FOR[stage.mode], v, rig), `${chapter.id} ${stage.age} ${stage.mode} ${assist} ${v.toFixed(2)} m/s`);
        }
      }
    }
  });

  it("Biscuit's four paws stay planted too", () => {
    for (const v of [1, 2, 3.2, 4, 5.5]) expectGrounded(simulate("dog", v, DOG), `dog ${v} m/s`);
  });

  it("feet land and lift off without moving over the ground", () => {
    for (const [gait, v, L] of [["run", 4.5, LEGS.adult], ["walk", 2.6, LEGS.elder], ["toddle", 2.4, LEGS.toddler], ["dog", 5, LEGS.dog]] as const) {
      const g = gaitParams(gait, v, L);
      const e = 1e-4;
      // World speed of a foot = ground speed + its speed relative to the hip (cycle units → m/s).
      const world = (p: number) => v + ((contactAt(p + e, g).x - contactAt(p - e, g).x) / (2 * e)) * g.freq;
      for (const p of [g.duty, 1]) {
        expect(Math.abs(world(p - 3 * e)) / v, `${gait} just before ${p}`).toBeLessThan(0.02);
        expect(Math.abs(world(p + 3 * e)) / v, `${gait} just after ${p}`).toBeLessThan(0.02);
      }
    }
  });

  it("slower means shorter steps, and standing still means no stepping", () => {
    expect(gaitParams("run", 1, LEGS.adult).reach).toBeLessThan(gaitParams("run", 4, LEGS.adult).reach);
    expect(gaitParams("run", 0, LEGS.adult).freq).toBe(0);
    const still = solveGait(0.3, gaitParams("run", 0, LEGS.adult), legs(LEGS.adult));
    expect(still.body).toBe(0);
    for (const l of still.limbs) expect(l).toEqual({ angle: 0, stretch: 1 });
  });
});
