// Checks the small living things in the running game: ground scatter, gulls (perched, taking off,
// circling), footprints and ripples, footsteps, and that none of it throws. Optional screenshots.
//   GAME_URL=http://localhost:4412/ node game/tests/ambient-check.mjs [outDir]
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
// chapter, label, run to x, what must be there
const cases = [
  ["1", "garden", 200, { scatter: ["tiny_flowers", "tiny_tuft"], steps: true }],
  ["2", "harbour", 60, { scatter: ["tiny_weeds"], gulls: true, steps: true }],
  ["3", "coast road", 70, { scatter: ["tiny_tuft", "tiny_shell"], gulls: true }],
  ["6", "storm", 70, { scatter: ["tiny_leaf"], prints: true, ripples: true, steps: true }],
  ["7", "festival", 60, { scatter: ["tiny_petals"], gulls: true, steps: true }],
  ["8", "cliff (finale)", 30, { scatter: ["tiny_tuft"], prints: true, steps: true }],
];
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
let failures = 0;
const check = (ok, what) => {
  if (!ok) failures++;
  return ok ? "ok " : "FAIL";
};
for (const [chapter, label, at, want] of cases) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?qa=1&auto=1&speed=3&start=${chapter}&flags=biscuit`);
  await page.waitForFunction((x) => window.__COL__ && window.__COL__.mode() === "run" && window.__COL__.x() > x, at, { timeout: 180000 }).catch(() => errors.push(`never reached x ${at}`));
  await page.evaluate(() => (window.__COL__.timeScale = 1));
  // Sample for a few seconds: gulls need time to be startled, prints need steps.
  const seen = { scatter: {}, gulls: { perched: 0, flying: 0, circling: 0 }, prints: 0, ripples: 0, steps0: null, steps: 0 };
  for (let i = 0; i < 12; i++) {
    const a = await page.evaluate(() => window.__COL__.ambient());
    if (a) {
      for (const [k, v] of Object.entries(a.scatter)) seen.scatter[k] = Math.max(seen.scatter[k] ?? 0, v);
      for (const k of ["perched", "flying", "circling"]) seen.gulls[k] = Math.max(seen.gulls[k], a.gulls[k] ?? 0);
      seen.prints = Math.max(seen.prints, a.marks.prints);
      seen.ripples = Math.max(seen.ripples, a.marks.ripples);
      seen.steps0 ??= a.steps;
      seen.steps = a.steps - seen.steps0;
    }
    if (i === 6 && out) await page.screenshot({ path: `${out}/ambient-${chapter}.png` });
    await page.waitForTimeout(400);
  }
  const lines = [];
  for (const m of want.scatter ?? []) lines.push(`${check((seen.scatter[m] ?? 0) > 0, m)} ${m} ×${seen.scatter[m] ?? 0}`);
  if (want.gulls) lines.push(`${check(seen.gulls.perched + seen.gulls.flying + seen.gulls.circling > 0, "gulls")} gulls ${JSON.stringify(seen.gulls)}`);
  if (want.prints) lines.push(`${check(seen.prints > 0, "prints")} prints ${seen.prints}`);
  if (want.ripples) lines.push(`${check(seen.ripples > 0, "ripples")} ripples ${seen.ripples}`);
  if (want.steps) lines.push(`${check(seen.steps > 0, "steps")} footsteps ${seen.steps}`);
  lines.push(`${check(errors.length === 0, "errors")} page errors ${errors.length ? errors.join(" | ") : "none"}`);
  console.log(`${label}\n  ${lines.join("\n  ")}`);
  await page.close();
}
await browser.close();
console.log(failures ? `${failures} checks failed` : "all ambient checks pass");
process.exit(failures ? 1 : 0);
