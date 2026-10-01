import { describe, expect, it } from "vitest";

import { CHAPTERS } from "../game/story/chapters";
import { resolve } from "../game/story/model";
import { createLife } from "../game/life";
import { Flock, PERCHES, planGulls, STARTLE, type Gull } from "./flock";
import { Governor, makeGovernor } from "./governor";
import { LANE_CLEAR, planScatter, SCATTER } from "./scatter";

const look = { skin: "#f0b48a", hair: "#4a2c1d", hairStyle: "short" as const, colour: "#12a5b8" };
const life = (seed = 7) => createLife({ name: "Kai", pronoun: "they", look, seed });

describe("ground scatter", () => {
  it("never puts anything on the lanes", () => {
    for (const chapter of CHAPTERS) {
      for (const [model, items] of planScatter(chapter, life())) {
        for (const it of items) expect(Math.abs(it.z), `${chapter.id} ${model} at x ${it.x.toFixed(1)}`).toBeGreaterThanOrEqual(LANE_CLEAR);
      }
    }
  });

  it("is the same every time for the same life, and different for another", () => {
    const chapter = CHAPTERS[2];
    const a = planScatter(chapter, life(7));
    const b = planScatter(chapter, life(7));
    const c = planScatter(chapter, life(8));
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect([...a.entries()]).not.toEqual([...c.entries()]);
  });

  it("battery saver thins the same plan instead of making a new one", () => {
    for (const chapter of CHAPTERS) {
      const full = planScatter(chapter, life(), 1);
      const thin = planScatter(chapter, life(), 0.55);
      for (const [model, items] of thin) {
        const all = full.get(model)!;
        const key = (p: { x: number; z: number }) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
        const keys = new Set(all.map(key));
        for (const it of items) expect(keys.has(key(it))).toBe(true);
        if (all.length > 100) expect(items.length / all.length).toBeGreaterThan(0.4);
        if (all.length > 100) expect(items.length / all.length).toBeLessThan(0.7);
      }
    }
  });

  it("puts roughly the planned amount in each place, sorted along the course", () => {
    const chapter = CHAPTERS.find((c) => resolve(c.places, life()).some((s) => s.place === "cliff" || s.place === "dusk_cliff"))!;
    const plan = planScatter(chapter, life());
    const tufts = plan.get("tiny_tuft")!;
    expect(tufts.length).toBeGreaterThan(100);
    for (let i = 1; i < tufts.length; i++) expect(tufts[i].x).toBeGreaterThanOrEqual(tufts[i - 1].x);
    // Every kind used somewhere is a tiny_ model (built by art/sets/tiny.py).
    for (const kinds of Object.values(SCATTER)) for (const k of kinds ?? []) expect(k.model.startsWith("tiny_")).toBe(true);
  });
});

describe("gulls", () => {
  const harbourChapter = CHAPTERS.find((c) => resolve(c.places, life()).some((s) => s.place === "harbour"))!;

  it("perch only by the sea, the same way every time", () => {
    const a = planGulls(harbourChapter, life());
    expect(a.length).toBeGreaterThan(5);
    expect(planGulls(harbourChapter, life())).toEqual(a);
    const inland = CHAPTERS.filter((c) => resolve(c.places, life()).every((s) => !PERCHES[s.place]));
    for (const c of inland) expect(planGulls(c, life())).toEqual([]);
    for (const g of a) expect(Math.abs(g.z)).toBeGreaterThan(LANE_CLEAR);
  });

  function run(gulls: Gull[], from: number, to: number, speed = 3.4) {
    const flock = new Flock(gulls, () => "harbour");
    const events = [];
    for (let x = from; x < to; x += speed / 60) events.push(...flock.update(1 / 60, { x, z: 0, speed }, x - 5));
    return { flock, events };
  }

  it("take off when you run up to them, then fly up and away", () => {
    const gull = planGulls(harbourChapter, life())[0];
    gull.z = 2.5 + STARTLE.side / 2;
    const { events } = run([gull], gull.x - 20, gull.x - STARTLE.ahead + 0.5);
    expect(events.length).toBe(1);
    // A little later it is airborne and climbing; much later it has gone.
    const later = run([gull], gull.x - STARTLE.ahead + 0.5, gull.x - STARTLE.ahead + 2);
    expect(gull.mode).toBe("flying");
    expect(gull.y).toBeGreaterThan(0.3);
    void later;
    run([gull], gull.x, gull.x + 200);
    expect(gull.mode).toBe("gone");
  });

  it("stay put while you are far away or behind them", () => {
    const gull = planGulls(harbourChapter, life())[0];
    run([gull], gull.x - 60, gull.x - STARTLE.ahead - 1);
    expect(gull.mode).toBe("perched");
  });

  it("a group you run up to takes off together, one after another, as one event", () => {
    const g0 = planGulls(harbourChapter, life())[0];
    const group = [0, 0.6, 1.2].map((dx, i) => ({ ...g0, x: g0.x + dx, seed: g0.seed + i }));
    const { events } = run(group, g0.x - 20, g0.x - 2);
    expect(events.length).toBe(1);
    expect(events[0].count).toBe(3);
    for (const g of group) expect(g.mode).toBe("flying");
  });

  it("quay gulls notice you from the far lane and fly out over the water, never across the lanes", () => {
    const gull = { ...planGulls(harbourChapter, life())[0], z: 6.3 };
    const flock = new Flock([gull], () => "harbour");
    let crossed = false;
    for (let x = gull.x - 20; x < gull.x + 10; x += 3.4 / 60) {
      flock.update(1 / 60, { x, z: -1.9, speed: 3.4 }, x - 5);
      if (gull.mode === "flying" && Math.abs(gull.z) < LANE_CLEAR) crossed = true;
    }
    expect(gull.mode).not.toBe("perched");
    expect(crossed).toBe(false);
  });

  it("gulls behind the lanes climb up and away over the roofs", () => {
    const gull = { ...planGulls(harbourChapter, life())[0], z: -4.5, y: 0 };
    const flock = new Flock([gull], () => "coast");
    for (let x = gull.x - 10, t = 0; t < 3; x += 3.4 / 60, t += 1 / 60) flock.update(1 / 60, { x, z: 0, speed: 3.4 }, x - 5);
    expect(gull.z).toBeLessThan(-4.5);
    expect(gull.y).toBeGreaterThan(4);
  });

  it("with reduced motion they stay perched and none circle", () => {
    const gull = planGulls(harbourChapter, life())[0];
    const flock = new Flock([gull], () => "harbour");
    for (let x = gull.x - 20; x < gull.x + 5; x += 0.1) expect(flock.update(1 / 60, { x, z: gull.z, speed: 3 }, x - 5, true)).toEqual([]);
    expect(gull.mode).toBe("perched");
    expect(flock.visible(gull.x).filter((g) => g.mode === "circling").length).toBe(0);
  });

  it("circling gulls drift on from one seaside place to the next instead of popping", () => {
    const flock = new Flock([], (x) => (x < 100 ? "harbour" : "festival"));
    flock.update(1 / 60, { x: 0, z: 0, speed: 3 }, 0);
    const first = [...flock.visible(0)];
    for (let x = 0; x < 160; x += 0.5) flock.update(1 / 60, { x, z: 0, speed: 3 }, x);
    expect(flock.visible(160)).toEqual(first);
  });

  it("circle overhead by the sea, and nowhere else", () => {
    const seaside = new Flock([], () => "harbour");
    seaside.update(1 / 60, { x: 0, z: 0, speed: 3 }, 0);
    expect(seaside.visible(0).filter((g) => g.mode === "circling").length).toBe(3);
    const city = new Flock([], () => "city");
    city.update(1 / 60, { x: 0, z: 0, speed: 3 }, 0);
    expect(city.visible(0).length).toBe(0);
    // Circles keep up with the camera.
    for (let x = 0; x < 300; x += 1) seaside.update(1 / 60, { x, z: 0, speed: 3 }, x);
    for (const g of seaside.visible(300)) expect(g.x).toBeGreaterThan(300 - 50);
  });
});

describe("quality governor", () => {
  const feed = (g: Governor, fps: number, seconds: number, cpu = 12) => {
    const changes = [];
    for (let i = 0; i < Math.round(fps * seconds); i++) {
      const c = g.sample(1 / fps, cpu);
      if (c) changes.push(c);
    }
    return changes;
  };

  it("lowers resolution to 1.25, then drops bloom, then lowers resolution to the floor", () => {
    const g = new Governor(2, 1, 2, true);
    expect(feed(g, 30, 7)).toEqual(["ratio", "ratio", "ratio"]);
    expect(g.ratio).toBe(1.25);
    expect(g.post).toBe(true);
    // Bloom, once dropped, stays off: it takes four slow seconds, not two.
    expect(feed(g, 30, 2.1)).toEqual([]);
    expect(feed(g, 30, 2.1)).toEqual(["post"]);
    feed(g, 30, 20);
    expect(g.ratio).toBe(1);
  });

  it("raises resolution after a run of smooth seconds, up to the cap", () => {
    const g = new Governor(2, 1, 1, false);
    feed(g, 60, 60);
    expect(g.ratio).toBe(2);
  });

  it("never flips between a size that is too slow and one that is fine", () => {
    // This device manages 60 fps at 1.25x but only 44 fps at 1.5x.
    const g = new Governor(2, 1, 1.5, true);
    const ratios = new Set<number>();
    for (let t = 0; t < 120; t += 1 / 30) {
      const fps = g.ratio > 1.3 ? 44 : 60;
      g.sample(1 / fps, 10);
      if (t > 10) ratios.add(g.ratio);
    }
    expect([...ratios]).toEqual([1.25]);
    // Bloom was kept: lowering the resolution was enough.
    expect(g.post).toBe(true);
  });

  it("ignores the first seconds of a new scene, then may try one step higher", () => {
    const g = new Governor(2, 1, 2, true);
    feed(g, 30, 5);
    expect(g.ratio).toBe(1.5);
    g.settle(3);
    expect(feed(g, 20, 2.9)).toEqual([]);
    feed(g, 60, 20);
    expect(g.ratio).toBe(1.75);
  });

  it("leaves a capped 30 fps display alone, and ignores hitches and hidden-tab gaps", () => {
    const capped = new Governor(2, 1, 2, true);
    expect(feed(capped, 30, 20, 4)).toEqual([]);
    const g = new Governor(2, 1, 2, true);
    for (let i = 0; i < 20; i++) expect(g.sample(1.5)).toBeNull();
    expect(g.ratio).toBe(2);
  });

  it("starts phones softer, and battery saver lower without bloom", () => {
    expect(makeGovernor("high", 3, true).ratio).toBe(1.5);
    expect(makeGovernor("high", 3, false).ratio).toBe(2);
    expect(makeGovernor("high", 1, true).ratio).toBe(1);
    const low = makeGovernor("low", 3, true);
    expect(low.ratio).toBe(1.25);
    expect(low.post).toBe(false);
  });
});
