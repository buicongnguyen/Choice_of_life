import { describe, expect, it } from "vitest";

import { generateCourse, unsafeRows, type Course } from "./course";
import { createLife, has } from "./life";
import { Runner, STEP } from "./runner";
import { deserialise, serialise } from "./save";
import { CHAPTERS, FINALE, PLAYABLE } from "./story/chapters";
import { activeEncounters, ENCOUNTERS } from "./story/encounters";
import { book, finale, lifeTitle } from "./story/ending";
import { advance, choose, closeChapter, nextEncounter, optionViews, recover, startChapter } from "./story/flow";
import { resolve } from "./story/model";
import type { LifeState } from "./types";

const look = { skin: "#f0b48a", hair: "#4a2c1d", hairStyle: "short" as const, colour: "#12a5b8" };
const newLife = (seed = 7) => createLife({ name: "Kai", pronoun: "they", look, seed });

type Picker = (s: LifeState, options: ReturnType<typeof optionViews>, encounterId: string) => string;

/** Plays every chapter's story with a choice policy (no runner), returning the final life. */
function playStory(pick: Picker, seed = 7): LifeState {
  const s = newLife(seed);
  for (let chapter = 0; chapter <= FINALE; chapter++) {
    startChapter(s, chapter);
    let guard = 0;
    for (let e = nextEncounter(s); e; e = nextEncounter(s)) {
      const options = optionViews(e, s).filter((o) => !o.locked);
      expect(options.length, `${e.id} has a choosable option`).toBeGreaterThan(0);
      choose(s, e, pick(s, options, e.id));
      if (++guard > 20) throw new Error("encounter loop");
    }
    closeChapter(s);
    if (chapter === FINALE) advance(s);
  }
  return s;
}

const first: Picker = (_s, o) => o[0].id;
const last: Picker = (_s, o) => o[o.length - 1].id;
const warm: Picker = (_s, o) => {
  const prefer = ["kite", "home", "rebuild", "key", "study", "stay", "shop", "sofa", "share", "summer", "own", "warn", "family", "toast", "people", "juno", "room", "walks", "campaign", "story", "garden", "sail", "forgive", "thanks"];
  return (o.find((x) => prefer.includes(x.id)) ?? o[0]).id;
};

describe("story content", () => {
  it("every encounter belongs to a real chapter and has well-formed options", () => {
    const ids = new Set<string>();
    for (const e of ENCOUNTERS) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(CHAPTERS[e.chapter]).toBeTruthy();
      expect(e.at).toBeGreaterThan(0);
      expect(e.at).toBeLessThan(1);
      expect(e.options.length).toBeGreaterThan(0);
      expect(e.options.length).toBeLessThanOrEqual(4);
      if (e.kind !== "event") expect(e.prompt, e.id).toBeTruthy();
    }
  });

  it("encounters in a chapter are far enough apart for the runner to breathe", () => {
    for (const c of CHAPTERS) {
      const s = newLife();
      const ats = [...new Set(activeEncounters(s, c.index).map((e) => e.at))].sort();
      for (let i = 1; i < ats.length; i++) expect((ats[i] - ats[i - 1]) * c.length).toBeGreaterThan(80);
    }
  });

  it("choices are trade-offs, not free wins, in every chapter", () => {
    for (const c of PLAYABLE) {
      const choices = ENCOUNTERS.filter((e) => e.chapter === c && e.kind !== "event");
      const withCost = choices.flatMap((e) =>
        e.options.filter((o) => {
          const fx = resolve(o.effects, newLife());
          return (fx.health ?? 0) < 0 || (fx.happiness ?? 0) < 0 || (fx.money ?? 0) < 0 || (fx.bonds && Object.values(fx.bonds).some((v) => (v ?? 0) < 0));
        }),
      );
      if (c >= 2) expect(withCost.length, `chapter ${c} has costly options`).toBeGreaterThan(0);
    }
  });
});

describe("whole lives", () => {
  for (const [name, policy] of [
    ["first options", first],
    ["last options", last],
    ["warm options", warm],
  ] as const) {
    it(`finishes a life taking ${name}`, () => {
      const s = playStory(policy);
      expect(s.finished).toBe(true);
      expect(s.dream).toBeTruthy();
      expect(s.path).toBeTruthy();
      const end = finale(s);
      expect(end.scene.length).toBeGreaterThan(3);
      expect(end.letter.at(-1)).toBe("Nana Pearl");
      const b = book(s);
      expect(b.title).toBe(lifeTitle(s));
      expect(b.chapters).toHaveLength(7);
      for (const key of ["health", "happiness", "money"] as const) {
        expect(s.scores[key]).toBeGreaterThanOrEqual(0);
        expect(s.scores[key]).toBeLessThanOrEqual(100);
      }
    });
  }

  it("a devoted friendship brings Juno to the lighthouse first", () => {
    const s = playStory(warm);
    expect(s.bonds.juno).toBeGreaterThanOrEqual(9);
    expect(finale(s).juno).toBe("waiting");
    expect(finale(s).scene.some((l) => l.text === "You're late.")).toBe(true);
  });

  it("a neglected friendship sends Juno's granddaughter with a letter", () => {
    const s = playStory((_st, o) => {
      const avoid = ["kite", "tidepools", "ghost", "key", "letters", "sofa", "plan", "toast", "video", "thanks", "ticket", "juno"];
      return (o.find((x) => !avoid.includes(x.id)) ?? o[0]).id;
    });
    expect(finale(s).juno).toBe("letter");
    expect(finale(s).company).toContain("ada");
  });

  it("keeping Nana company pays off in her letter and with Lina", () => {
    const s = playStory(warm);
    expect(has(s, "nana_story")).toBe(true);
    expect(finale(s).letter.join(" ")).toContain("storm of '71");
    expect(s.choices.some((c) => c.encounter === "linas-kite" && c.option === "story")).toBe(true);
  });

  it("saving the lighthouse lights the final scene", () => {
    expect(finale(playStory(warm)).lit).toBe(true);
    const dark = playStory((st, o, id) => (id === "save-the-light" ? "let-go" : first(st, o, id)));
    expect(finale(dark).lit).toBe(has(dark, "juno_saved_light"));
  });

  it("the buy option is locked until you can afford it", () => {
    const s = newLife();
    startChapter(s, 6);
    s.scores.money = 20;
    const save = ENCOUNTERS.find((e) => e.id === "save-the-light")!;
    expect(optionViews(save, s).find((o) => o.id === "buy")?.locked).toBeTruthy();
    s.scores.money = 60;
    expect(optionViews(save, s).find((o) => o.id === "buy")?.locked).toBeFalsy();
  });

  it("an encounter can only be answered once", () => {
    const s = newLife();
    startChapter(s, 1);
    const e = nextEncounter(s)!;
    choose(s, e, e.options[0].id);
    expect(() => choose(s, e, e.options[0].id)).toThrow();
  });

  it("zero is never game over: someone steps in once per chapter", () => {
    const s = newLife();
    startChapter(s, 5);
    s.scores.health = 0;
    const r = recover(s);
    expect(r?.score).toBe("health");
    expect(s.scores.health).toBe(30);
    s.scores.health = 0;
    expect(recover(s)).toBeUndefined();
  });

  it("saves round-trip and reject foreign data", () => {
    const s = playStory(first);
    expect(deserialise(serialise(s))).toEqual(s);
    expect(deserialise('{"version":1}')).toBeNull();
    expect(deserialise("not json")).toBeNull();
  });
});

describe("courses", () => {
  const chapterCourse = (index: number, seed: number, assist: LifeState["assist"] = "standard"): Course => {
    const s = newLife(seed);
    s.assist = assist;
    s.flags = ["letters"];
    return generateCourse(CHAPTERS[index], activeEncounters(s, index), s);
  };

  it("always leaves a free lane, for every chapter, seed and assist level", () => {
    for (const index of PLAYABLE) {
      for (const seed of [1, 2, 3, 99, 12345]) {
        for (const assist of ["relaxed", "standard", "brisk"] as const) {
          expect(unsafeRows(chapterCourse(index, seed, assist)), `ch${index} seed ${seed} ${assist}`).toEqual([]);
        }
      }
    }
  });

  it("keeps the approach to every encounter clear of hazards", () => {
    for (const index of PLAYABLE) {
      const course = chapterCourse(index, 5);
      for (const mark of course.encounters) {
        const near = course.spawns.filter((s) => s.kind === "hazard" && s.x > mark.x - 40 && s.x < mark.x + 15);
        expect(near, `ch${index} ${mark.id}`).toEqual([]);
      }
    }
  });

  it("places three keepsakes per playable chapter", () => {
    for (const index of PLAYABLE) {
      expect(chapterCourse(index, 3).spawns.filter((s) => s.kind === "keepsake")).toHaveLength(3);
    }
  });

  it("is reproducible from the seed", () => {
    expect(chapterCourse(2, 42)).toEqual(chapterCourse(2, 42));
    expect(chapterCourse(2, 42)).not.toEqual(chapterCourse(2, 43));
  });
});

describe("runner", () => {
  /** A simple autopilot: stays in the lane with no hazard ahead. */
  function drive(course: Course, speed: number) {
    const runner = new Runner(course, { speed, magnet: false, shield: false });
    let hits = 0;
    let pickups = 0;
    for (let t = 0; t < 400 && runner.x < course.length - 5; t += STEP) {
      const ahead = course.spawns.filter((s) => s.kind === "hazard" && s.x > runner.x - 1 && s.x < runner.x + 7);
      const blockedLanes = new Set(ahead.map((s) => s.lane));
      let laneStep: -1 | 1 | undefined;
      if (blockedLanes.has(runner.lane)) {
        const free = [0, 1, 2].filter((l) => !blockedLanes.has(l as 0));
        const target = free.sort((a, b) => Math.abs(a - runner.lane) - Math.abs(b - runner.lane))[0];
        if (target !== undefined && target !== runner.lane) laneStep = target < runner.lane ? -1 : 1;
      }
      for (const ev of runner.step({ laneStep })) {
        if (ev.type === "hit") hits++;
        if (ev.type === "pickup") pickups++;
      }
    }
    return { runner, hits, pickups };
  }

  it("a careful runner can finish every chapter without a single hit", () => {
    for (const index of PLAYABLE) {
      const s = newLife(11);
      const course = generateCourse(CHAPTERS[index], [], s);
      const { hits, runner } = drive(course, CHAPTERS[index].speed * 1.15);
      expect(runner.x, `ch${index} finished`).toBeGreaterThan(course.length - 6);
      expect(hits, `ch${index} hits`).toBe(0);
    }
  });

  it("running straight through the middle lane gets hit, and stays on course", () => {
    const course = generateCourse(CHAPTERS[2], [], newLife(4));
    const runner = new Runner(course, { speed: 7, magnet: false, shield: false });
    let hits = 0;
    for (let t = 0; t < 200 && runner.x < course.length - 5; t += STEP) {
      hits += runner.step({}).filter((e) => e.type === "hit").length;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("jumping clears low hazards but not tall ones", () => {
    const low = { model: "x", kind: "low" as const, score: "health" as const, label: "x" };
    const tall = { ...low, kind: "tall" as const };
    const course: Course = {
      chapter: 1,
      length: 60,
      encounters: [],
      gusts: [],
      spawns: [
        { id: 0, kind: "hazard", x: 12, lane: 1, y: 0, hazard: low },
        { id: 1, kind: "hazard", x: 30, lane: 1, y: 0, hazard: tall },
      ],
    };
    const runner = new Runner(course, { speed: 8, magnet: false, shield: false });
    runner.speed = 8;
    const events: string[] = [];
    for (let t = 0; t < 8 && runner.x < 50; t += STEP) {
      const jump = (runner.x > 10.2 && runner.x < 10.5) || (runner.x > 28.2 && runner.x < 28.5);
      events.push(...runner.step({ jump }).map((e) => e.type));
    }
    expect(events.filter((e) => e === "hit")).toHaveLength(1);
  });

  it("the shield absorbs a hit and then needs to recharge", () => {
    const low = { model: "x", kind: "tall" as const, score: "health" as const, label: "x" };
    const course: Course = {
      chapter: 5,
      length: 60,
      encounters: [],
      gusts: [],
      spawns: [
        { id: 0, kind: "hazard", x: 10, lane: 1, y: 0, hazard: low },
        { id: 1, kind: "hazard", x: 25, lane: 1, y: 0, hazard: low },
      ],
    };
    const runner = new Runner(course, { speed: 8, magnet: false, shield: true });
    const events: string[] = [];
    for (let t = 0; t < 10 && runner.x < 50; t += STEP) events.push(...runner.step({}).map((e) => e.type));
    expect(events).toContain("shielded");
    expect(events).toContain("hit");
  });

  it("comes to rest exactly at an encounter", () => {
    const course: Course = { chapter: 2, length: 200, encounters: [], gusts: [], spawns: [] };
    const runner = new Runner(course, { speed: 9, magnet: false, shield: false });
    runner.stopAt = 80;
    let arrived = false;
    for (let t = 0; t < 30 && !arrived; t += STEP) arrived = runner.step({}).some((e) => e.type === "arrived");
    expect(arrived).toBe(true);
    expect(runner.x).toBe(80);
    expect(runner.speed).toBe(0);
  });
});
