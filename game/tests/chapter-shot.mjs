// Captures a chapter mid-run for art review: node game/tests/chapter-shot.mjs <chapter> <out.png> [x] [extra query]
import { chromium } from "playwright";
const [chapter, out, at = "120", extra = ""] = process.argv.slice(2);
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.goto(`${base}?qa=1&auto=1&speed=${process.env.SPEED ?? 3}&start=${chapter}${extra}`);
await page.waitForFunction((x) => window.__COL__ && window.__COL__.x() > Number(x) && window.__COL__.mode() === "run", at, { timeout: 120000 }).catch(() => console.log("did not reach x", at));
await page.evaluate(() => (window.__COL__.timeScale = 0.0001));
await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
await page.screenshot({ path: out });
await browser.close();
