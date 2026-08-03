import type { StatKey } from "./types";
import { STAT_KEYS, STAT_META } from "./stats";

// ---------------------------------------------------------------------------
// Builds the DOM around the canvas: the top HUD (five meters + age), the bottom
// focus panel, on-screen touch controls, and an overlay layer used for the
// title screen, the marriage partner picker and the ending. The engine reads
// and writes these refs directly.
// ---------------------------------------------------------------------------

export interface UIRefs {
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stageLabel: HTMLElement;
  ageLabel: HTMLElement;
  leLabel: HTMLElement;
  moneyLabel: HTMLElement;
  bars: Record<StatKey, { fill: HTMLElement; val: HTMLElement }>;
  weightBar: { fill: HTMLElement; val: HTMLElement };
  subBars: Record<"muscle" | "nutrition" | "mental", { fill: HTMLElement; val: HTMLElement }>;
  warn: HTMLElement;
  focusPanel: HTMLElement;
  hint: HTMLElement;
  timeTravel: HTMLElement;
  profileBtn: HTMLElement;
  settingsBtn: HTMLElement;
  skipBtn: HTMLElement;
  themeBtn: HTMLElement;
  touchWrap: HTMLElement;
  stick: HTMLElement;
  stickKnob: HTMLElement;
  inventoryWrap: HTMLElement;
  inventoryTrack: HTMLElement;
  collectBtn: HTMLElement;
  overlay: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function createUI(mount: HTMLElement): UIRefs {
  mount.innerHTML = "";
  const frame = el("div", "plj-frame");

  // --- top HUD --------------------------------------------------------------
  const hud = el("div", "plj-hud");
  const topRow = el("div", "plj-hud-top");
  const stageLabel = el("span", "plj-stage", "👶 Newborn");
  const rightWrap = el("span", "plj-hud-right");
  const moneyLabel = el("span", "plj-money", "💰 $0");
  const ageWrap = el("span", "plj-age");
  const ageLabel = el("span", "plj-age-num", "0");
  const leLabel = el("span", "plj-le", "");
  ageWrap.append(document.createTextNode("Age "), ageLabel, leLabel);
  const themeBtn = el("button", "plj-theme-btn", "🌙");
  themeBtn.title = "Toggle day / night theme";
  rightWrap.append(moneyLabel, ageWrap, themeBtn);
  topRow.append(stageLabel, rightWrap);

  const barsRow = el("div", "plj-bars");
  const bars = {} as Record<StatKey, { fill: HTMLElement; val: HTMLElement }>;
  for (const k of STAT_KEYS) {
    const meta = STAT_META[k];
    const item = el("div", "plj-bar");
    item.title = meta.label;
    const icon = el("span", "plj-bar-icon", meta.icon);
    const track = el("div", "plj-bar-track");
    const fill = el("div", "plj-bar-fill");
    fill.style.background = meta.color;
    const val = el("span", "plj-bar-val", "0");
    track.append(fill);
    item.append(icon, track, val);
    barsRow.append(item);
    bars[k] = { fill, val };
  }
  // 6th meter: body weight (colour shows healthy/over/under, not "more is better")
  const wItem = el("div", "plj-bar");
  wItem.title = "Weight";
  const wIcon = el("span", "plj-bar-icon", "⚖️");
  const wTrack = el("div", "plj-bar-track");
  const wFill = el("div", "plj-bar-fill");
  const wVal = el("span", "plj-bar-val", "50");
  wTrack.append(wFill);
  wItem.append(wIcon, wTrack, wVal);
  barsRow.append(wItem);
  const weightBar = { fill: wFill, val: wVal };

  // the three pillars that COMPOSE Health, shown as a smaller sub-row
  const subRow = el("div", "plj-subbars");
  const subBars = {} as Record<"muscle" | "nutrition" | "mental", { fill: HTMLElement; val: HTMLElement }>;
  const subMeta: [keyof typeof subBars, string, string, string][] = [
    ["muscle", "💪", "Muscle", "#ff8a5d"],
    ["nutrition", "🥗", "Nutrition", "#7ed957"],
    ["mental", "🧘", "Mental", "#b08cff"],
  ];
  for (const [key, icon, label, color] of subMeta) {
    const item = el("div", "plj-subbar");
    item.title = label + " — a pillar of your Health";
    const ic = el("span", "plj-subbar-icon", icon);
    const track = el("div", "plj-subbar-track");
    const fill = el("div", "plj-subbar-fill");
    fill.style.background = color;
    const val = el("span", "plj-subbar-val", "0");
    track.append(fill);
    item.append(ic, track, val);
    subRow.append(item);
    subBars[key] = { fill, val };
  }
  hud.append(topRow, barsRow, subRow);

  // --- canvas ---------------------------------------------------------------
  const stage = el("div", "plj-stage-wrap");
  const canvas = el("canvas", "plj-canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "The current life chapter. Use arrow keys or WASD to move around the room.");
  // Supersample: draw in a 640x700 coordinate space but back it with a 2× pixel
  // buffer, then let the browser downscale it smoothly — crisp, anti-aliased art
  // at a fraction of the fill cost (a 4× buffer made the bigger room lag).
  // supersample to the display's pixel density (1 on standard screens, 2 on retina)
  const SS = Math.min(2, Math.max(1, Math.ceil((typeof window !== "undefined" && window.devicePixelRatio) || 1)));
  canvas.width = 640 * SS;
  canvas.height = 1000 * SS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SS, SS);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const warn = el("div", "plj-warn", "⚠️ Your health is failing!");
  const hint = el("div", "plj-hint");
  const timeTravel = el("button", "plj-timetravel", "⏳");
  timeTravel.title = "Time travel (T)";
  timeTravel.setAttribute("aria-label", timeTravel.title);
  const profileBtn = el("button", "plj-profile-btn", "💼");
  profileBtn.title = "Career profile (P)";
  profileBtn.setAttribute("aria-label", profileBtn.title);
  const skipBtn = el("button", "plj-corner-btn plj-skip-btn", "⏭");
  skipBtn.title = "Skip this chapter";
  skipBtn.setAttribute("aria-label", skipBtn.title);
  const settingsBtn = el("button", "plj-corner-btn plj-settings-btn", "⚙️");
  settingsBtn.title = "Settings";
  settingsBtn.setAttribute("aria-label", settingsBtn.title);
  stage.append(canvas, warn, hint, timeTravel, profileBtn, skipBtn, settingsBtn);

  // --- bottom focus panel ---------------------------------------------------
  const focusPanel = el(
    "div",
    "plj-focus is-hidden",
    ""
  );

  // --- touch controls -------------------------------------------------------
  const touchWrap = el("div", "plj-touch");
  // an analog thumb-stick (drag in any direction) — works with touch AND mouse
  const stick = el("div", "plj-stick");
  stick.dataset.engaged = "false";
  const stickKnob = el("div", "plj-stick-knob");
  const stickHint = el("span", "plj-stick-hint", "move");
  stick.append(stickKnob, stickHint);
  const inventoryWrap = el("div", "plj-inventory");
  inventoryWrap.title = "Swipe left/right to select. Swipe up to eat food, or near a person to give.";
  const inventoryTrack = el("div", "plj-inventory-track");
  inventoryWrap.append(inventoryTrack);
  // a Collect / interact button — walk up to a person (or a desk/gate) and press
  // it to interact; the result shows as a banner up in the sky
  const collectBtn = el("button", "plj-collect-btn", "<span class='plj-collect-ic'>🤝</span><span class='plj-collect-lbl'>Collect</span>");
  collectBtn.title = "Collect / interact (or press SPACE)";
  collectBtn.setAttribute("aria-label", collectBtn.title);
  touchWrap.append(stick, inventoryWrap, collectBtn);
  // the touch controls live INSIDE the stage so they overlay the canvas (thumbs
  // on the game), keeping everything on one mobile screen with no page scroll
  stage.append(touchWrap);

  // --- overlay --------------------------------------------------------------
  const overlay = el("div", "plj-overlay");

  frame.append(hud, stage, focusPanel, overlay);
  mount.append(frame);

  return {
    frame,
    canvas,
    ctx,
    stageLabel,
    ageLabel,
    leLabel,
    moneyLabel,
    bars,
    weightBar,
    subBars,
    warn,
    focusPanel,
    hint,
    timeTravel,
    profileBtn,
    settingsBtn,
    skipBtn,
    themeBtn,
    touchWrap,
    stick,
    stickKnob,
    inventoryWrap,
    inventoryTrack,
    collectBtn,
    overlay,
  };
}
