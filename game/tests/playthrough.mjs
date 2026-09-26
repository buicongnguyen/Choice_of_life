// Plays a whole life in a real browser with the QA autopilot and captures each chapter.
//
//   GAME_URL=http://localhost:4412/ node game/tests/playthrough.mjs [policy] [seed]
//
// Env: SHOTS=<dir> to save captures, SPEED (sim time scale, default 6), GPU=1 to use the GPU,
// TIMEOUT (seconds, default 900). Exits non-zero on page errors or if the life doesn't finish.
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const policy = process.argv[2] ?? "mixed";
const seed = process.argv[3] ?? "7";
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const shots = process.env.SHOTS;
const speed = process.env.SPEED ?? "6";
const timeout = Number(process.env.TIMEOUT ?? 900) * 1000;
if (shots) mkdirSync(shots, { recursive: true });

const args = process.env.GPU === "1" ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const started = Date.now();
await page.goto(`${base}?qa=1&auto=1&speed=${speed}&policy=${policy}&seed=${seed}`);
await page.waitForFunction(() => window.__COL__?.ready, null, { timeout: 90000 });
if (shots) await page.screenshot({ path: path.join(shots, "00-title.png") });
await page.click("[data-qa=new]");
await page.waitForSelector("[data-qa=begin]");
await page.waitForTimeout(800);
if (shots) await page.screenshot({ path: path.join(shots, "01-create.png") });
await page.click("[data-qa=begin]");

const captured = new Set();
let last = "";
let fps = [];
for (;;) {
  if (Date.now() - started > timeout) {
    errors.push("timeout: the life did not finish");
    break;
  }
  const info = await page.evaluate(() => {
    const q = window.__COL__;
    const life = q.life();
    return {
      mode: q.mode(),
      chapter: q.chapter(),
      x: q.x(),
      finished: q.events.includes("finished"),
      scores: life ? life.scores : null,
      events: q.events.length,
      story: !!document.querySelector("[data-qa=story] .choices, [data-qa=story] .line"),
    };
  });
  const key = `${info.chapter}:${info.mode}`;
  if (key !== last) {
    console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] chapter ${info.chapter} ${info.mode} x=${info.x.toFixed(0)} scores=${JSON.stringify(info.scores)}`);
    last = key;
  }
  const shot = async (name) => {
    if (!shots || captured.has(name)) return;
    captured.add(name);
    await page.screenshot({ path: path.join(shots, `${name}.png`) });
  };
  if (info.mode === "run" && info.x > 60) await shot(`ch${info.chapter}-run`);
  if (info.mode === "story" && info.story) await shot(`ch${info.chapter}-story`);
  if (info.finished) {
    await page.waitForSelector("[data-qa=book]", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    await shot("99-book");
    break;
  }
  if (fps.length < 3 && info.mode === "run") {
    fps.push(await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })));
  }
  await page.waitForTimeout(400);
}

const result = await page.evaluate(() => {
  const q = window.__COL__;
  const ev = q.events;
  return {
    choices: ev.filter((e) => e.startsWith("choice:")),
    hits: ev.filter((e) => e.startsWith("hit:")).length,
    pickups: ev.filter((e) => e.startsWith("pickup:")).length,
    keepsakes: ev.filter((e) => e === "keepsake").length,
    finished: ev.includes("finished"),
    book: document.querySelector("[data-qa=book] h1")?.textContent ?? null,
  };
});
console.log(JSON.stringify({ policy, seed, fps, ...result, errors }, null, 1));
await browser.close();
process.exit(errors.length || !result.finished ? 1 : 0);
