// Frame rate and renderer cost on a phone-like setup: a 390x844 portrait screen at 3x pixel
// density with the CPU slowed 4x, playing a few busy stretches with the autopilot.
//   GAME_URL=http://localhost:4412/ node game/tests/perf-probe.mjs [q=low]
import { chromium } from "playwright";
const base = process.env.GAME_URL ?? "http://localhost:4412/";
const extra = process.argv.slice(2).map((a) => `&${a}`).join("");
const throttle = Number(process.env.CPU ?? 4);
const cases = [
  ["2", "harbour (child run)", 80],
  ["3", "coast road (bike)", 80],
  ["6", "storm (adult run)", 80],
  ["7", "festival (walk)", 80],
];
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const rows = [];
for (const [chapter, label, at] of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?qa=1&auto=1&speed=4&start=${chapter}&flags=biscuit${extra}`);
  await page.waitForFunction((x) => window.__COL__ && window.__COL__.mode() === "run" && window.__COL__.x() > x, at, { timeout: 180000 });
  await page.evaluate(() => (window.__COL__.timeScale = 1));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  // Let the throttled page settle (and any automatic quality changes happen) before measuring.
  await page.waitForTimeout(4000);
  const result = await page.evaluate(() => new Promise((done) => {
    const times = [];
    const costs = [];
    let last = performance.now();
    const start = last;
    const tick = (now) => {
      times.push(now - last);
      last = now;
      // The hook walks the scene; sample it every 10th frame so it barely disturbs the timing.
      if (window.__COL__.perf && times.length % 10 === 0) costs.push(window.__COL__.perf());
      if (now - start < 6000) requestAnimationFrame(tick);
      else done({ times, costs, mode: window.__COL__.mode() });
    };
    requestAnimationFrame(tick);
  }));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const t = result.times.slice(1).sort((a, b) => a - b);
  const mean = t.reduce((s, v) => s + v, 0) / t.length;
  const p95 = t[Math.floor(t.length * 0.95)];
  const mid = (key) => {
    const v = result.costs.map((c) => c[key]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : NaN;
  };
  const row = { label, fps: 1000 / mean, p95, calls: mid("calls"), triangles: mid("triangles"), pixelRatio: mid("pixelRatio"), cpu: mid("cpu"), errors: errors.length, meshes: result.costs.at(-1)?.meshes };
  rows.push(row);
  console.log(`${label.padEnd(22)} ${row.fps.toFixed(1).padStart(5)} fps  p95 ${row.p95.toFixed(1).padStart(5)} ms  cpu ${row.cpu?.toFixed?.(1) ?? "?"} ms  ${String(row.calls).padStart(4)} draws  ${String(Math.round(row.triangles / 1000)).padStart(4)}k tris  ×${row.pixelRatio?.toFixed?.(2) ?? "?"}${errors.length ? `  ${errors.length} page errors: ${errors[0]}` : ""}`);
  if (process.env.BREAKDOWN && row.meshes) console.log(`   visible meshes: ${JSON.stringify(row.meshes)}`);
  await context.close();
}
await browser.close();
const worst = Math.min(...rows.map((r) => r.fps));
console.log(`slowest ${worst.toFixed(1)} fps (CPU ×${throttle})`);
process.exit(rows.some((r) => r.errors) ? 1 : 0);
