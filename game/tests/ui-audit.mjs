// Captures every UI screen at phone and desktop sizes for design review.
//   GAME_URL=http://localhost:4412/ node game/tests/ui-audit.mjs <outDir> [sizes]
// sizes: comma list of WxH (default 390x844,360x640,844x390,1280x720).
import { mkdirSync } from "node:fs";

import { chromium } from "playwright";

const out = process.argv[2];
const sizes = (process.argv[3] ?? "390x844,360x640,844x390,1280x720").split(",").map((s) => s.split("x").map(Number));
const base = process.env.GAME_URL ?? "http://localhost:4412/";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const problems = [];

/** Every visible element inside #ui must stay on screen, and text must not overflow its box. */
async function layoutCheck(page, label) {
  const issues = await page.evaluate(() => {
    const out = [];
    const vw = innerWidth;
    const vh = innerHeight;
    for (const el of document.querySelectorAll("#ui button, #ui .line, #ui .card, #ui .panel, #ui .score, #ui input, #ui h1, #ui h2")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      const scrollParent = el.closest(".book, .create, .panel, .summary .panel, .letter, .cards");
      const clipped = (!scrollParent && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)) || (scrollParent && (() => { const p = scrollParent.getBoundingClientRect(); return p.left < -1 || p.right > vw + 1 || p.top < -1 || p.bottom > vh + 1; })());
      if (clipped) out.push(`off-screen ${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "auto") out.push(`text overflow ${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      if (el.tagName === "BUTTON" && (r.height < 40 || r.width < 40)) out.push(`small touch target "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  for (const i of issues) problems.push(`${label}: ${i}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  await layoutCheck(page, name);
}

for (const [w, h] of sizes) {
  try {
    await captureSize(w, h);
  } catch (error) {
    problems.push(`${w}x${h}: capture stopped: ${String(error.message).split(String.fromCharCode(10))[0]}`);
  }
}

async function captureSize(w, h) {
  const tag = `${w}x${h}`;
  const touch = w < 900;
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  page.on("pageerror", (e) => problems.push(`${tag} pageerror ${e.message}`));
  await page.goto(`${base}?qa=1`);
  await page.waitForFunction(() => window.__COL__?.ready, null, { timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.waitForTimeout(1800);
  await shot(page, `${tag}-01-title`);
  await page.click("[data-qa=new]");
  await page.waitForSelector("[data-qa=begin]");
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-02-create`);
  await page.evaluate(() => document.querySelector(".create .sheet-body")?.scrollTo(0, 9999));
  await page.waitForTimeout(300);
  await shot(page, `${tag}-02b-create-bottom`);
  await page.click("[data-qa=begin]");
  await page.waitForSelector("[data-qa=chapter-card]", { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, `${tag}-03-chapter-card`);
  await page.click("[data-qa=chapter-card] button");
  await page.waitForSelector("[data-qa=line]", { timeout: 60000 });
  await page.waitForTimeout(600);
  await shot(page, `${tag}-04-prologue-line`);
  // Skip to chapter 1 gameplay via QA jump in a fresh page.
  await page.goto(`${base}?qa=1&start=2&speed=1`);
  await page.waitForSelector("[data-qa=chapter-card]", { timeout: 90000 });
  await page.waitForTimeout(500); // the card ignores taps for its first moments (carried-over input)
  await page.click("[data-qa=chapter-card] button");
  await page.waitForFunction(() => window.__COL__.mode() === "run" && window.__COL__.x() > 12, null, { timeout: 90000 });
  await page.waitForTimeout(400);
  await shot(page, `${tag}-05-hud`);
  // Pause (settings) and journal.
  await page.evaluate(() => document.querySelector(".hud .icon-btn")?.click());
  await page.waitForSelector(".pause-modal");
  await page.waitForTimeout(500);
  await shot(page, `${tag}-06-pause`);
  await page.click("[data-qa=journal]");
  await page.waitForTimeout(500);
  await shot(page, `${tag}-07-journal`);
  await page.click(".journal-modal .sheet-actions .btn");
  await page.click(".pause-modal [data-qa=resume]");
  // Speed to the first encounter and capture a line and the choice cards.
  await page.evaluate(() => (window.__COL__.timeScale = 4));
  await page.waitForSelector("[data-qa=line]", { timeout: 90000 });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-08-dialogue`);
  for (let i = 0; i < 12 && !(await page.$(".choices .card")); i++) {
    await page.click("[data-qa=line]").catch(() => {});
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(600);
  await shot(page, `${tag}-09-choices`);
  await browser.contexts()[0]?.close?.();
  // Finale letter and book via the finale jump.
  const fin = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  await fin.goto(`${base}?qa=1&speed=3&start=8&flags=partner,kids,met_sam,saved_light,nana_story,lina_kite`);
  await fin.waitForSelector("[data-qa=chapter-card]", { timeout: 90000 });
  await fin.waitForTimeout(500);
  await fin.click("[data-qa=chapter-card] button");
  for (let i = 0; i < 400 && !(await fin.$("[data-qa=letter]")); i++) {
    await fin.click("[data-qa=line]").catch(() => {});
    await fin.waitForTimeout(220);
  }
  await fin.waitForTimeout(900);
  await shot(fin, `${tag}-10-letter`);
  await fin.click("[data-qa=letter] .actions button");
  await fin.waitForSelector("[data-qa=book]", { timeout: 20000 });
  await fin.waitForTimeout(1200);
  await shot(fin, `${tag}-11-book`);
  await fin.close();
  await page.close();
  console.log("captured", tag);
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no layout problems found");
