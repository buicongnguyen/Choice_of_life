// Browser regressions from the 2.0 review:
//  1. Quit mid-chapter and Continue: nothing already collected is collected again.
//  2. Holding Space through dialogue never picks a life choice by itself.
//  3. The prologue can't be paused/quit (it's a cutscene).
//   GAME_URL=http://localhost:4412/ node game/tests/regressions.mjs
import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://localhost:4412/";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};

// ---------------------------------------------------------------- 1. resume
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?qa=1&auto=1&speed=6&policy=warm&seed=5`);
  await page.waitForFunction(() => window.__COL__?.ready);
  await page.evaluate(() => localStorage.clear());
  await page.click("[data-qa=new]");
  await page.click("[data-qa=begin]");
  // Run into chapter 2, past its first encounter, then pause and quit.
  await page.waitForFunction(() => window.__COL__.chapter() === 2 && window.__COL__.x() > 220 && window.__COL__.mode() === "run", null, { timeout: 180000 });
  await page.evaluate(() => (window.__COL__.timeScale = 1));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".pause-modal");
  const before = await page.evaluate(() => ({ ...window.__COL__.life().stats, x: window.__COL__.x(), scores: { ...window.__COL__.life().scores } }));
  await page.click(".pause-modal button:has-text(\"Save and return to title\")");
  await page.waitForSelector("[data-qa=continue]", { timeout: 60000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("choice-of-life-2:life")));
  check(saved.progress?.chapter === 2 && Math.abs(saved.progress.x - before.x) < 1, `save records the runner position (${saved.progress?.x?.toFixed(1)} vs ${before.x.toFixed(1)})`);
  await page.click("[data-qa=continue]");
  await page.waitForFunction(() => window.__COL__.mode() === "run" && window.__COL__.chapter() === 2, null, { timeout: 60000 });
  const after = await page.evaluate(() => ({ ...window.__COL__.life().stats, x: window.__COL__.x() }));
  check(after.x >= before.x - 0.5, `continue starts where you left (${after.x.toFixed(1)} ≥ ${before.x.toFixed(1)})`);
  await page.evaluate(() => (window.__COL__.timeScale = 0.0001));
  check(after.pickups === before.pickups, `no pickups re-collected on continue (${after.pickups} = ${before.pickups})`);
  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await page.close();
}

// ---------------------------------------------------------------- 2. held Space
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}?qa=1&start=1&speed=4`);
  await page.waitForSelector("[data-qa=chapter-card]", { timeout: 60000 });
  await page.waitForTimeout(500); // the card ignores taps for its first moments
  await page.click("[data-qa=chapter-card] button");
  await page.waitForSelector("[data-qa=line]", { timeout: 120000 });
  // Mash Space every 60 ms for 3 seconds: dialogue advances, but the cards must wait for a deliberate press.
  const started = Date.now();
  let sawCards = false;
  while (Date.now() - started < 3000) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(60);
    if (await page.$(".choices .card")) {
      sawCards = true;
      break;
    }
  }
  const choseEarly = await page.evaluate(() => window.__COL__.life().choices.length);
  check(sawCards, "choice cards appeared");
  check(choseEarly === 0, `mashing Space didn't pick a choice (${choseEarly} choices made)`);
  await page.close();
}

// ---------------------------------------------------------------- 3. prologue is a cutscene
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}?qa=1&start=0&speed=1`);
  await page.waitForSelector("[data-qa=chapter-card]", { timeout: 60000 });
  await page.waitForTimeout(500); // the card ignores taps for its first moments
  await page.click("[data-qa=chapter-card] button");
  await page.waitForSelector("[data-qa=line]", { timeout: 60000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check(!(await page.$(".pause-modal")), "Esc does not open the pause menu during the prologue");
  await page.close();
}

// ---------------------------------------------------------------- 4. a save from an older course layout
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?qa=1`);
  await page.waitForFunction(() => window.__COL__?.ready);
  // A chapter 2 save whose position lies beyond the current (shorter) chapter and has no layout key.
  await page.evaluate(() => {
    const life = {
      version: 2, seed: 9, name: "Kai", pronoun: "they", assist: "standard",
      look: { skin: "#f0b48a", hair: "#4a2c1d", hairStyle: "short", colour: "#12a5b8" },
      scores: { health: 60, happiness: 60, money: 40 }, bonds: { juno: 2, family: 3, sam: 0, dex: 0, okafor: 0 },
      flags: ["kite_fixed"], spark: "maker", chapter: 2, resolved: ["new-kid"], choices: [], memories: [], keepsakes: [], recoveries: [],
      stats: { pickups: 0, bumps: 0, jumps: 0, letters: 0, bestStreak: 0 }, meters: { health: 0, happiness: 0, money: 0 },
      started: 2, chapterStart: { health: 60, happiness: 60, money: 40 }, progress: { chapter: 2, x: 600, collected: [1, 2, 3] }, finished: false,
    };
    localStorage.setItem("choice-of-life-2:life", JSON.stringify(life));
  });
  await page.reload();
  await page.waitForFunction(() => window.__COL__?.ready);
  await page.click("[data-qa=continue]");
  await page.waitForSelector("[data-qa=chapter-card]", { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.click("[data-qa=chapter-card] button");
  await page.waitForFunction(() => window.__COL__.mode() === "run", null, { timeout: 60000 });
  const state = await page.evaluate(() => ({ chapter: window.__COL__.chapter(), x: window.__COL__.x() }));
  check(state.chapter === 2 && state.x < 200, `an out-of-date save resumes before the next unplayed scene (chapter ${state.chapter}, x ${state.x.toFixed(0)})`);
  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await page.close();
}

await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : "all regressions pass");
process.exit(failures.length ? 1 : 0);
