// Measures foot slip in the running game: while a foot (a crawling baby's knee, Biscuit's paw) is
// on the floor its world position must not move. Reports slip = planted speed / ground speed as the
// median over planted frames (and the 90th percentile, which catches touchdowns and lane-change turns).
//   GAME_URL=http://localhost:4412/ node game/tests/gait-probe.mjs
import { chromium } from "playwright";
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const cases = [
  ["1", "crawling baby", 30], ["1", "toddler", 150], ["2", "child run", 60],
  ["5", "adult run", 60], ["7", "elder walk", 260],
];
let worst = 0;
for (const [chapter, label, at] of cases) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${base}?qa=1&auto=1&speed=4&start=${chapter}&flags=biscuit`);
  await page.waitForFunction((x) => window.__COL__ && window.__COL__.mode() === "run" && window.__COL__.x() > x, at, { timeout: 120000 });
  await page.evaluate(() => (window.__COL__.timeScale = 1));
  const samples = await page.evaluate(() => new Promise((done) => {
    const out = [];
    const tick = (now) => {
      out.push({ t: now / 1000, ...window.__COL__.feet(), mode: window.__COL__.mode() });
      if (out.length < 300) requestAnimationFrame(tick);
      else done(out);
    };
    requestAnimationFrame(tick);
  }));
  const slip = (key) => {
    const rows = samples.filter((s) => s[key] && s.mode === "run" && s.speed > 1);
    if (rows.length < 20) return null;
    const floor = Math.min(...rows.map((r) => r[key].y));
    const down = (r) => r[key].y < floor + 0.0015;
    const slips = [];
    let planted = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (down(b)) planted++;
      // Planted in both frames: the contact should not have moved at all. Skip stalled frames
      // (the game clamps long frames, so they can't be compared with wall-clock time).
      const dt = b.t - a.t;
      if (!down(a) || !down(b) || dt <= 0 || dt > 1 / 30) continue;
      slips.push(Math.abs(b[key].x - a[key].x) / dt / b.speed);
    }
    if (slips.length < 10) return null;
    slips.sort((x, y) => x - y);
    const speed = rows.reduce((s, r) => s + r.speed, 0) / rows.length;
    const at = (q) => slips[Math.min(slips.length - 1, Math.floor(q * slips.length))];
    return { speed, slip: at(0.5), p90: at(0.9), planted: planted / rows.length };
  };
  const p = slip("player");
  const d = slip("dog");
  if (p) worst = Math.max(worst, p.slip);
  if (d) worst = Math.max(worst, d.slip);
  const pct = (v) => `${Math.round(v * 100)}%`;
  console.log(`${label.padEnd(14)} ground ${p?.speed.toFixed(2)} m/s  planted slip ${p ? `${pct(p.slip)} (p90 ${pct(p.p90)}, down ${pct(p.planted)} of frames)` : "-"}` +
    (d ? `   Biscuit paw slip ${pct(d.slip)} (p90 ${pct(d.p90)}, down ${pct(d.planted)})` : ""));
  await page.close();
}
await browser.close();
console.log(`worst median slip ${Math.round(worst * 100)}%`);
process.exit(worst > 0.05 ? 1 : 0);
