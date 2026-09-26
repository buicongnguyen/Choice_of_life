// Plays the finale by hand (clicking through lines) and captures the scene, letter and book.
import { chromium } from "playwright";
const [outDir, flags = "biscuit,letters,partner,kids,met_sam,saved_light,nana_story,gave_key,lina_kite,forgave_dex"] = process.argv.slice(2);
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${base}?qa=1&speed=3&start=8&flags=${flags}`);
await page.waitForSelector("[data-qa=chapter-card]", { timeout: 60000 });
await page.screenshot({ path: `${outDir}/f0-card.png` });
await page.click("[data-qa=chapter-card] button");
let n = 0;
for (let i = 0; i < 400; i++) {
  if (await page.$("[data-qa=letter]")) break;
  const line = await page.$("[data-qa=line]");
  if (line) {
    if (n === 3 || n === 7) await page.screenshot({ path: `${outDir}/f1-scene-${n}.png` });
    n++;
    await line.click().catch(() => {});
  }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/f2-letter.png` });
await page.click("[data-qa=letter] .actions button");
await page.waitForSelector("[data-qa=book]", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/f3-book.png` });
await page.evaluate(() => document.querySelector(".book").scrollTo(0, 99999));
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/f4-book-end.png` });
await browser.close();
