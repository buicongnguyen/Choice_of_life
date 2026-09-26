// Screenshot helper for art review: node game/tests/shot.mjs <url-path> <out.png> [width height wait-ms]
import { chromium } from "playwright";
const [path, out, w = "1280", h = "720", wait = "2500"] = process.argv.slice(2);
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text()); });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(base + path);
await page.waitForFunction(() => window.__viewerReady || window.__COL__?.ready, null, { timeout: 60000 }).catch(() => console.log("not ready"));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
