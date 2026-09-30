// Balance probe (not a test): plays whole lives with the real course and runner.
//   npx vite-node game/src/game/balance.probe.ts
import { APPROACH, END_CLEAR, generateCourse, type Lane } from "./course";
import { createLife } from "./life";
import { rng } from "./rng";
import { Runner, STEP } from "./runner";
import { CHAPTERS, FINALE, stageAt, stageSpeed } from "./story/chapters";
import { activeEncounters } from "./story/encounters";
import { lifeTitle } from "./story/ending";
import {
  advance,
  choose,
  closeChapter,
  collectKeepsake,
  collectLetter,
  lettersActive,
  optionViews,
  recover,
  runnerHit,
  runnerPickup,
  runnerStreak,
  startChapter,
} from "./story/flow";
import type { LifeState, ScoreKey } from "./types";

type RunStyle = "skilled" | "casual" | "idle";
/** Scores seen on arrival at each scene that has a score-gated option (LOCKS=1 prints them). */
const LOCKED_SCENES = ["nanas-last-summer", "the-fork", "dex-idea", "junos-wedding", "the-call", "save-the-light", "last-shift", "someone-notices-4", "someone-notices-5"];
const seen: Record<string, Record<RunStyle, number[][]>> = {};
let noticeCount: Record<RunStyle, number> = { skilled: 0, casual: 0, idle: 0 };
const look = { skin: "#f0b48a", hair: "#4a2c1d", hairStyle: "short" as const, colour: "#12a5b8" };

function play(seed: number, style: RunStyle, choiceSeed: number): LifeState {
  const s = createLife({ name: "Kai", pronoun: "they", look, seed });
  const pickRng = rng(choiceSeed);
  const steer = rng(seed * 31 + 7);
  // A casual runner simply doesn't notice some hazards.
  const unnoticed = new Set<number>();
  for (let index = 0; index <= FINALE; index++) {
    startChapter(s, index);
    while (recover(s));
    const chapter = CHAPTERS[index];
    const encounters = activeEncounters(s, index);
    const course = generateCourse(chapter, encounters, s);
    const pace = (x: number) => stageSpeed(chapter, stageAt(chapter, x / chapter.length), s.assist);
    const runner = new Runner(course, { speed: pace(0), magnet: false, shield: false, letters: lettersActive(s) }, 0);
    let pending: string | null = null;
    if (style === "casual") for (const sp of course.spawns) if (sp.kind === "hazard" && steer.next() < 0.2) unnoticed.add(sp.id);
    for (let t = 0; t < 3000 && runner.x < chapter.length - END_CLEAR * 0.5; t += STEP) {
      const next = course.encounters.find((m) => !s.resolved.includes(m.id) && activeEncounters(s, index).some((e) => e.id === m.id));
      if (next && !pending && runner.x > next.x - APPROACH && runner.stopAt === null) {
        runner.autopilotLane = 1;
        runner.stopAt = next.x - 2.6;
        pending = next.id;
      }
      if (runner.cruise > 0 && runner.stopAt === null && Math.abs(runner.cruise - pace(runner.x)) > 0.01) runner.setOptions({ speed: pace(runner.x) });
      let input: { laneStep?: -1 | 1; jump?: boolean } = {};
      if (runner.autopilotLane === null && style !== "idle") {
        const attentive = true;
        const ahead = course.spawns.filter((sp) => sp.kind === "hazard" && !unnoticed.has(sp.id) && sp.x > runner.x - 0.8 && sp.x < runner.x + Math.max(6, runner.speed * 0.8) && !runner.isCollected(sp.id));
        const blocked = new Set(ahead.map((sp) => sp.lane));
        if (attentive && blocked.has(runner.lane)) {
          const free = ([0, 1, 2] as Lane[]).filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - runner.lane) - Math.abs(b - runner.lane));
          if (free.length) input = { laneStep: free[0] < runner.lane ? -1 : 1 };
        } else if (style === "skilled") {
          const k = course.spawns.find((sp) => sp.kind === "keepsake" && !runner.isCollected(sp.id) && sp.x > runner.x && sp.x < runner.x + 12);
          if (k && k.lane !== runner.lane && !blocked.has(k.lane)) input = { laneStep: k.lane < runner.lane ? -1 : 1 };
          const low = ahead.find((sp) => sp.lane === runner.lane && sp.hazard?.kind === "low" && sp.x - runner.x <= runner.jumpLead() + 0.05);
          if (k && k.lane === runner.lane && low && !runner.airborne) input = { jump: true };
        }
      }
      for (const ev of runner.step(input)) {
        if (ev.type === "pickup") runnerPickup(s, ev.spawn.score ?? "happiness");
        else if (ev.type === "hit") runnerHit(s, ev.spawn.hazard!.score, ev.spawn.hazard!.kind);
        else if (ev.type === "streak") runnerStreak(s, ev.count);
        else if (ev.type === "keepsake") collectKeepsake(s, ev.spawn.index ?? 0);
        else if (ev.type === "letter") collectLetter(s, ev.spawn.index ?? 0);
        else if (ev.type === "arrived" && pending) {
          const enc = activeEncounters(s, index).find((e) => e.id === pending)!;
          if (LOCKED_SCENES.includes(enc.id)) ((seen[enc.id] ??= { skilled: [], casual: [], idle: [] })[style]).push([s.scores.health, s.scores.happiness, s.scores.money]);
          if (enc.id.startsWith("someone-notices")) noticeCount[style]++;
          const open = optionViews(enc, s).filter((o) => !o.locked);
          choose(s, enc, enc.kind === "event" ? "continue" : open[Math.floor(pickRng.next() * open.length)].id);
          runner.setOptions({ letters: lettersActive(s) });
          runner.autopilotLane = null;
          runner.setOptions({ speed: pace(runner.x) });
          pending = null;
        }
        while (recover(s));
      }
    }
    closeChapter(s);
    while (recover(s));
    if (index === FINALE) advance(s);
  }
  return s;
}

const stats = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return `${mean.toFixed(0)}±${sd.toFixed(0)} [${Math.min(...xs)}..${Math.max(...xs)}]`;
};

for (const style of ["skilled", "casual", "idle"] as RunStyle[]) {
  const finals: Record<ScoreKey, number[]> = { health: [], happiness: [], money: [] };
  const titles = new Map<string, number>();
  for (let i = 0; i < 40; i++) {
    const s = play(100 + i, style, 900 + i);
    for (const k of ["health", "happiness", "money"] as ScoreKey[]) finals[k].push(s.scores[k]);
    const t = lifeTitle(s);
    titles.set(t, (titles.get(t) ?? 0) + 1);
  }
  console.log(style.padEnd(8), "health", stats(finals.health), " happiness", stats(finals.happiness), " money", stats(finals.money));
  console.log("         titles:", [...titles.entries()].map(([t, n]) => `${t} ${n}`).join(" · "));
}

if (process.env.LOCKS) {
  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  for (const [id, byStyle] of Object.entries(seen)) {
    const cells = (Object.entries(byStyle) as [RunStyle, number[][]][])
      .filter(([, v]) => v.length)
      .map(([style, v]) => `${style}: n=${v.length} H p10/50 ${pct(v.map((x) => x[0]), 0.1)}/${pct(v.map((x) => x[0]), 0.5)} M p10/50 ${pct(v.map((x) => x[2]), 0.1)}/${pct(v.map((x) => x[2]), 0.5)}`);
    console.log(id.padEnd(20), cells.join(" | "));
  }
  console.log("someone-notices fired (of 80 chances per style):", JSON.stringify(noticeCount));
}
