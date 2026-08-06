import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
  HouseTier,
  PersonKind,
  PetKind,
  RoomTheme,
  SceneKind,
  UpperSceneKind,
  VehicleTier,
} from "./types";
import { drawCuteCharacter } from "./cute-characters";
import {
  drawStorybookCharacter,
  storybookVisualHeight,
} from "./storybook-characters";
import {
  drawStorybookPet,
  type PetFacing,
} from "./storybook-pets";
import { isSameStagePeerKind } from "./friends";
import {
  npcRoleStyle,
  type CharacterExpression,
  type NpcRoleCue,
} from "./character-interactions";

// ---------------------------------------------------------------------------
// All drawing. The canvas is supersampled (see ui.ts) and rendered smoothly, so
// characters are drawn with curves + gradients to look like real people, with
// age-correct proportions (a newborn is a big-headed little baby; proportions
// mature gradually into an adult and then an elder). Rooms/props use simple
// rects (px) which the supersampling anti-aliases.
// ---------------------------------------------------------------------------

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));
}

function colorParts(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }
  const rgb = c.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    return [
      Math.max(0, Math.min(255, Number(rgb[1]))),
      Math.max(0, Math.min(255, Number(rgb[2]))),
      Math.max(0, Math.min(255, Number(rgb[3]))),
    ];
  }
  return null;
}

function shade(color: string, amt = 24): string {
  const parts = colorParts(color);
  if (!parts) return color;
  const [baseR, baseG, baseB] = parts;
  const r = Math.max(0, baseR - amt);
  const g = Math.max(0, baseG - amt);
  const b = Math.max(0, baseB - amt);
  return `rgb(${r},${g},${b})`;
}
function tint(color: string, amt = 24): string {
  const parts = colorParts(color);
  if (!parts) return color;
  const [baseR, baseG, baseB] = parts;
  const r = Math.min(255, baseR + amt);
  const g = Math.min(255, baseG + amt);
  const b = Math.min(255, baseB + amt);
  return `rgb(${r},${g},${b})`;
}

function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hgrad(ctx: CanvasRenderingContext2D, x: number, w: number, color: string, light = 18, dark = 20): CanvasGradient {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, tint(color, light));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

// Strong pixel-game line work: darker outlines make tiny characters read clearly.
const OUTLINE = "rgba(32,22,28,0.92)";
const OUTLINE_W = 1.75;

/** A rounded, tapered body segment from (topW @ topY) to (botW @ botY). */
function taper(ctx: CanvasRenderingContext2D, cx: number, topY: number, topW: number, botY: number, botW: number, fill: string | CanvasGradient): void {
  const rt = Math.min(topW * 0.3, 6);
  const rb = Math.min(botW * 0.32, 7);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2 + rt, topY);
  ctx.lineTo(cx + topW / 2 - rt, topY);
  ctx.quadraticCurveTo(cx + topW / 2, topY, cx + topW / 2, topY + rt);
  ctx.lineTo(cx + botW / 2, botY - rb);
  ctx.quadraticCurveTo(cx + botW / 2, botY, cx + botW / 2 - rb, botY);
  ctx.lineTo(cx - botW / 2 + rb, botY);
  ctx.quadraticCurveTo(cx - botW / 2, botY, cx - botW / 2, botY - rb);
  ctx.lineTo(cx - topW / 2, topY + rt);
  ctx.quadraticCurveTo(cx - topW / 2, topY, cx - topW / 2 + rt, topY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

/** Hides the dark seam where two limb segments meet, and reads as the joint
 *  itself. It must sit FLUSH INSIDE the limb: the old 0.66/0.72 radii were
 *  wider than the limb, so every knee and elbow bulged out as a dark knob. */
function jointCover(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  ellipse(ctx, x, y, w * 0.49, w * 0.5, color);
  // kneecap catches the light from above, with a soft crease beneath it —
  // both kept faint, or the joints read as bright bands taped across the limb
  ctx.save();
  ctx.globalAlpha = 0.26;
  ellipse(ctx, x - w * 0.1, y - w * 0.12, w * 0.24, w * 0.17, tint(color, 18));
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = shade(color, 18);
  ctx.lineWidth = Math.max(0.6, w * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.24, y + w * 0.17);
  ctx.quadraticCurveTo(x, y + w * 0.26, x + w * 0.24, y + w * 0.17);
  ctx.stroke();
  ctx.restore();
}

/** A limb that CHANGES THICKNESS along its length. Real arms and legs are
 *  thick at the joint they hang from and narrow toward the far end — constant
 *  width capsules are what made the old figures read as pipe-cleaner sticks. */
function taperedLimb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w1: number, w2: number, color: string, outline = OUTLINE): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const th = Math.atan2(ny, nx);
  const r1 = w1 / 2;
  const r2 = w2 / 2;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
  ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
  ctx.arc(x2, y2, r2, th, th - Math.PI, true);
  ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
  ctx.arc(x1, y1, r1, th + Math.PI, th, true);
  ctx.closePath();
  // light on the left, shadow on the right, across the limb's own axis
  const g = ctx.createLinearGradient(x1 + nx * r1, y1 + ny * r1, x1 - nx * r1, y1 - ny * r1);
  g.addColorStop(0, tint(color, 16));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, 22));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = OUTLINE_W;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Softer contour for a limb that overlaps the body it belongs to. At full
 *  outline weight the near arm in profile stops reading as part of the figure
 *  and starts reading as a separate object laid on top of the torso. */
const INNER_OUTLINE = "rgba(32,22,28,0.5)";

/** Front-view torso silhouette with real landmarks: the neck sits in a sloped
 *  trapezius, the deltoids are the widest point, the sides pull in to the
 *  waist and the pelvis flares back out. A plain trapezoid reads as a box. */
function humanTorso(
  ctx: CanvasRenderingContext2D,
  cx: number,
  neckY: number,
  neckHalf: number,
  shoulderY: number,
  shoulderHalf: number,
  waistY: number,
  waistHalf: number,
  bust: number,
  fill: string | CanvasGradient,
  female = false
): void {
  const drop = shoulderY - neckY;
  const run = waistY - shoulderY;
  // The side of the torso is an S, not a straight bevel: it swells over the
  // ribcage (further out again on a woman, for the bust) and then curves back
  // IN above the waist. A single quadratic bowed outward the whole way down,
  // which is what made every woman read as a straight-sided man.
  const chestHalf = shoulderHalf * (female ? 1.02 + bust : 0.98 + bust);
  // how far inside the chest→waist line the lower control point sits
  const nip = female ? 0.82 : 0.99;
  const side = (s: number): void => {
    ctx.bezierCurveTo(
      cx + s * chestHalf,
      shoulderY + run * (female ? 0.22 : 0.3),
      cx + s * waistHalf * nip,
      waistY - run * (female ? 0.3 : 0.24),
      cx + s * waistHalf,
      waistY
    );
  };
  // a woman's shoulder line is softer and more sloped than a man's square one
  const trap = female ? 0.68 : 0.76;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, neckY);
  ctx.quadraticCurveTo(cx - shoulderHalf * trap, neckY + drop * (female ? 0.36 : 0.28), cx - shoulderHalf, shoulderY);
  side(-1);
  ctx.quadraticCurveTo(cx, waistY + run * 0.09, cx + waistHalf, waistY);
  ctx.bezierCurveTo(
    cx + waistHalf * nip,
    waistY - run * (female ? 0.3 : 0.24),
    cx + chestHalf,
    shoulderY + run * (female ? 0.22 : 0.3),
    cx + shoulderHalf,
    shoulderY
  );
  ctx.quadraticCurveTo(cx + shoulderHalf * trap, neckY + drop * (female ? 0.36 : 0.28), cx + neckHalf, neckY);
  ctx.quadraticCurveTo(cx, neckY - drop * 0.22, cx - neckHalf, neckY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** The pelvis: waist at the top, flaring out to the hips and rounding under.
 *  This is the piece that gives a woman hips and a man a straight seat. */
function pelvis(ctx: CanvasRenderingContext2D, cx: number, waistY: number, waistHalf: number, hipY: number, hipHalf: number, fill: string | CanvasGradient): void {
  const h = hipY - waistY;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - waistHalf, waistY);
  ctx.quadraticCurveTo(cx - hipHalf, waistY + h * 0.44, cx - hipHalf * 0.94, hipY - h * 0.1);
  ctx.quadraticCurveTo(cx - hipHalf * 0.86, hipY, cx - hipHalf * 0.5, hipY);
  ctx.lineTo(cx + hipHalf * 0.5, hipY);
  ctx.quadraticCurveTo(cx + hipHalf * 0.86, hipY, cx + hipHalf * 0.94, hipY - h * 0.1);
  ctx.quadraticCurveTo(cx + hipHalf, waistY + h * 0.44, cx + waistHalf, waistY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

/** The neck as a real column: roughly a third of head width, flaring at the
 *  base into the trapezius rather than butt-jointing onto the shoulder line.
 *  Drawn with an outline so it separates from both the head and the collar. */
function neckColumn(ctx: CanvasRenderingContext2D, cx: number, topY: number, botY: number, topW: number, skin: string, back = false): void {
  const h = botY - topY;
  const botW = topW * 1.55; // the trapezius spread where the neck meets the body
  const g = ctx.createLinearGradient(cx - botW / 2, 0, cx + botW / 2, 0);
  g.addColorStop(0, shade(skin, back ? 10 : 16));
  g.addColorStop(0.45, shade(skin, back ? 2 : 8));
  g.addColorStop(1, shade(skin, back ? 26 : 30));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, topY);
  ctx.quadraticCurveTo(cx - topW * 0.54, topY + h * 0.55, cx - botW / 2, botY);
  ctx.lineTo(cx + botW / 2, botY);
  ctx.quadraticCurveTo(cx + topW * 0.54, topY + h * 0.55, cx + topW / 2, topY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.9, OUTLINE_W * 0.7);
  ctx.stroke();
  // the two sternocleidomastoid cords in front, or the nape groove behind
  ctx.save();
  ctx.globalAlpha = back ? 0.3 : 0.22;
  ctx.strokeStyle = shade(skin, 34);
  ctx.lineWidth = Math.max(0.6, topW * 0.13);
  ctx.lineCap = "round";
  if (back) {
    ctx.beginPath();
    ctx.moveTo(cx, topY + h * 0.15);
    ctx.lineTo(cx, botY - h * 0.15);
    ctx.stroke();
  } else {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * topW * 0.3, topY + h * 0.1);
      ctx.lineTo(cx + s * topW * 0.46, botY - h * 0.1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A walking cane: a slim shaft with a crook handle, gripped at the top by the
 *  hand at (handX, handY) and planted on the ground at groundY. The old version
 *  was a `limb()` as thick as a forearm, floating beside the leg. */
function cane(ctx: CanvasRenderingContext2D, handX: number, handY: number, groundY: number, tipX: number, H: number): void {
  const shaft = Math.max(1.2, H * 0.013);
  const wood = "#8a6636";
  const topY = handY - H * 0.03; // the handle rises above the grip
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // shaft, from just under the handle down to the tip
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = shaft + OUTLINE_W * 1.4;
  ctx.beginPath();
  ctx.moveTo(handX, topY);
  ctx.lineTo(tipX, groundY);
  ctx.stroke();
  ctx.strokeStyle = wood;
  ctx.lineWidth = shaft;
  ctx.beginPath();
  ctx.moveTo(handX, topY);
  ctx.lineTo(tipX, groundY);
  ctx.stroke();
  // crook handle curling forward over the hand
  const hook = H * 0.022;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = shaft + OUTLINE_W * 1.4;
  ctx.beginPath();
  ctx.moveTo(handX, topY);
  ctx.quadraticCurveTo(handX - hook * 1.3, topY - hook * 1.1, handX - hook * 1.5, topY + hook * 0.35);
  ctx.stroke();
  ctx.strokeStyle = wood;
  ctx.lineWidth = shaft;
  ctx.beginPath();
  ctx.moveTo(handX, topY);
  ctx.quadraticCurveTo(handX - hook * 1.3, topY - hook * 1.1, handX - hook * 1.5, topY + hook * 0.35);
  ctx.stroke();
  // rubber ferrule on the ground
  ctx.strokeStyle = "#2a2430";
  ctx.lineWidth = shaft * 1.5;
  ctx.beginPath();
  ctx.moveTo(tipX, groundY - H * 0.012);
  ctx.lineTo(tipX, groundY);
  ctx.stroke();
  // a highlight down the shaft so it reads as turned wood
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = tint(wood, 40);
  ctx.lineWidth = Math.max(0.5, shaft * 0.3);
  ctx.beginPath();
  ctx.moveTo(handX - shaft * 0.22, topY + H * 0.02);
  ctx.lineTo(tipX - shaft * 0.22, groundY - H * 0.02);
  ctx.stroke();
  ctx.restore();
}

/** A rounded limb (capsule): outline, fill, then cell shadow + highlight. */
function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + OUTLINE_W * 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = shade(color, 16);
  ctx.lineWidth = w * 0.34;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.22, y1);
  ctx.lineTo(x2 + w * 0.22, y2);
  ctx.stroke();
  ctx.strokeStyle = tint(color, 18);
  ctx.lineWidth = w * 0.28;
  ctx.beginPath();
  ctx.moveTo(x1 - w * 0.24, y1);
  ctx.lineTo(x2 - w * 0.24, y2);
  ctx.stroke();
}

function sideShoe(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, length: number, height: number, fill: string | CanvasGradient): void {
  const heelX = x - dir * length * 0.42;
  const toeX = x + dir * length * 0.58;
  const soleY = y + height * 0.42;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(heelX, y - height * 0.18);
  ctx.quadraticCurveTo(x - dir * length * 0.1, y - height * 0.62, x + dir * length * 0.36, y - height * 0.5);
  ctx.quadraticCurveTo(toeX, y - height * 0.34, toeX, y + height * 0.02);
  ctx.quadraticCurveTo(toeX - dir * length * 0.1, y + height * 0.42, x - dir * length * 0.12, y + height * 0.42);
  ctx.quadraticCurveTo(heelX - dir * length * 0.04, y + height * 0.32, heelX, y - height * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(0.75, height * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(heelX + dir * length * 0.12, y - height * 0.16);
  ctx.quadraticCurveTo(x + dir * length * 0.08, y - height * 0.38, toeX - dir * length * 0.16, y - height * 0.18);
  ctx.stroke();
  // a light sole band — dark-on-dark detail was invisible on near-black shoes
  ctx.strokeStyle = "rgba(238,231,218,0.85)";
  ctx.lineWidth = Math.max(1, height * 0.24);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(heelX + dir * length * 0.02, soleY);
  ctx.lineTo(toeX - dir * length * 0.06, soleY);
  ctx.stroke();
  // toe cap
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(toeX - dir * length * 0.12, y - height * 0.05, length * 0.13, height * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = Math.max(0.7, height * 0.11);
  ctx.beginPath();
  ctx.moveTo(toeX - dir * length * 0.2, y - height * 0.18);
  ctx.lineTo(toeX - dir * length * 0.03, y + height * 0.12);
  ctx.stroke();
}

function frontShoe(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, width: number, height: number, fill: string | CanvasGradient): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir * 0.08);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-width * 0.42, -height * 0.3);
  ctx.quadraticCurveTo(-width * 0.16, -height * 0.62, width * 0.22, -height * 0.5);
  ctx.quadraticCurveTo(width * 0.58, -height * 0.34, width * 0.62, height * 0.08);
  ctx.quadraticCurveTo(width * 0.5, height * 0.52, -width * 0.08, height * 0.56);
  ctx.quadraticCurveTo(-width * 0.54, height * 0.5, -width * 0.48, height * 0.06);
  ctx.quadraticCurveTo(-width * 0.52, -height * 0.18, -width * 0.42, -height * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  // light sole band (readable on dark leather)
  ctx.strokeStyle = "rgba(238,231,218,0.85)";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, height * 0.22);
  ctx.beginPath();
  ctx.moveTo(-width * 0.36, height * 0.5);
  ctx.lineTo(width * 0.46, height * 0.46);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = Math.max(0.7, height * 0.12);
  ctx.beginPath();
  ctx.moveTo(-width * 0.16, -height * 0.32);
  ctx.quadraticCurveTo(width * 0.1, -height * 0.44, width * 0.34, -height * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(0.65, height * 0.1);
  ctx.beginPath();
  ctx.moveTo(width * 0.26, -height * 0.18);
  ctx.lineTo(width * 0.5, height * 0.08);
  ctx.stroke();
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, skin: string, dir = 1, angle = 0): void {
  const skinD = shade(skin, 18);
  const skinL = tint(skin, 12);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(dir, 1);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.42, -ry * 0.18);
  ctx.quadraticCurveTo(-rx * 0.7, ry * 0.02, -rx * 0.48, ry * 0.28);
  ctx.quadraticCurveTo(-rx * 0.24, ry * 0.62, rx * 0.2, ry * 0.56);
  ctx.quadraticCurveTo(rx * 0.62, ry * 0.52, rx * 0.66, ry * 0.1);
  ctx.quadraticCurveTo(rx * 0.64, -ry * 0.25, rx * 0.34, -ry * 0.38);
  ctx.quadraticCurveTo(-rx * 0.08, -ry * 0.48, -rx * 0.42, -ry * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.8, OUTLINE_W * 0.72);
  ctx.stroke();

  // Thumb: drawn as its own lobe so the hand no longer reads as a plain oval.
  ctx.fillStyle = skinD;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.54, ry * 0.12, rx * 0.24, ry * 0.2, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.65, OUTLINE_W * 0.48);
  ctx.stroke();

  // Four short finger separations, visible even when the character is tiny.
  ctx.strokeStyle = skinD;
  ctx.lineWidth = Math.max(0.9, rx * 0.11);
  ctx.lineCap = "round";
  for (const fx of [-0.14, 0.06, 0.25, 0.43]) {
    ctx.beginPath();
    ctx.moveTo(rx * fx, ry * 0.08);
    ctx.lineTo(rx * (fx - 0.04), ry * 0.48);
    ctx.stroke();
  }
  ctx.fillStyle = skinL;
  ctx.beginPath();
  ctx.ellipse(rx * 0.16, -ry * 0.12, rx * 0.26, ry * 0.11, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(95,54,45,0.22)";
  ctx.lineWidth = Math.max(0.55, rx * 0.055);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.2, ry * 0.18);
  ctx.quadraticCurveTo(rx * 0.08, ry * 0.33, rx * 0.34, ry * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawEar(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, skin: string, shadeSide = false): void {
  const fill = shadeSide ? shade(skin, 18) : skin;
  ellipse(ctx, x, y, rx, ry, fill);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.8, OUTLINE_W * 0.65);
  ctx.stroke();
  ctx.strokeStyle = shade(skin, 26);
  ctx.lineWidth = Math.max(0.7, rx * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.18, y - ry * 0.24);
  ctx.quadraticCurveTo(x + rx * 0.28, y, x - rx * 0.02, y + ry * 0.32);
  ctx.stroke();
}

type HairPiece = (ctx: CanvasRenderingContext2D) => void;

/**
 * Draws several hair shapes as ONE united region.
 *
 * Hair is built from separate pieces — crown cap, fringe, side blocks, nape,
 * long curtain — and stroking each one individually left a dark seam wherever
 * two pieces met, so the hair read as a pile of parts rather than one mass.
 * Here every piece is stroked first and every piece is then filled on top, so
 * the strokes survive only along the outer silhouette and vanish between
 * overlapping pieces. All pieces share one fill, so no colour break either.
 *
 * Pieces MUST overlap; shapes that merely touch will still show their seam.
 */
function hairRegion(ctx: CanvasRenderingContext2D, pieces: HairPiece[], fill: string): void {
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const piece of pieces) {
    ctx.beginPath();
    piece(ctx);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  for (const piece of pieces) {
    ctx.beginPath();
    piece(ctx);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrontHeadShape(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, skin: string, look: AvatarLook): void {
  const child = look.child;
  const female = look.gender === "female";
  // Skull shape is one of the strongest gender cues there is: a man carries a
  // wide square jaw and a broad chin, a woman a narrow jaw tapering to a soft
  // pointed chin. One shared outline made every face read male.
  const cheek = female ? 0.45 : 0.48;
  const jaw = child ? 0.3 : female ? 0.22 : 0.3;
  const chinW = child ? 0.12 : female ? 0.07 : 0.14;
  const chinY = child ? 0.52 : female ? 0.55 : 0.5;
  const hg = ctx.createRadialGradient(hcx - hw * 0.18, hcy - hh * 0.23, hw * 0.15, hcx, hcy, hw * 0.72);
  hg.addColorStop(0, tint(skin, 10));
  hg.addColorStop(0.68, skin);
  hg.addColorStop(1, shade(skin, 8));
  drawEar(ctx, hcx - hw * (cheek + 0.03), hcy + hh * 0.04, hw * 0.09, hh * 0.115, skin);
  drawEar(ctx, hcx + hw * (cheek + 0.03), hcy + hh * 0.04, hw * 0.09, hh * 0.115, skin, true);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(hcx - hw * cheek, hcy - hh * 0.09);
  ctx.quadraticCurveTo(hcx - hw * (cheek + 0.03), hcy - hh * 0.36, hcx - hw * 0.26, hcy - hh * 0.49);
  ctx.quadraticCurveTo(hcx, hcy - hh * 0.58, hcx + hw * 0.26, hcy - hh * 0.49);
  ctx.quadraticCurveTo(hcx + hw * (cheek + 0.03), hcy - hh * 0.36, hcx + hw * cheek, hcy - hh * 0.09);
  ctx.quadraticCurveTo(hcx + hw * (cheek + 0.01), hcy + hh * 0.22, hcx + hw * jaw, hcy + hh * 0.4);
  ctx.quadraticCurveTo(hcx + hw * chinW * 1.5, hcy + hh * (chinY - 0.02), hcx, hcy + hh * chinY);
  ctx.quadraticCurveTo(hcx - hw * chinW * 1.5, hcy + hh * (chinY - 0.02), hcx - hw * jaw, hcy + hh * 0.4);
  ctx.quadraticCurveTo(hcx - hw * (cheek + 0.01), hcy + hh * 0.22, hcx - hw * cheek, hcy - hh * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,70,58,0.22)";
  ctx.lineWidth = Math.max(0.8, hw * 0.018);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.26, hcy + hh * 0.36);
  ctx.quadraticCurveTo(hcx, hcy + hh * 0.5, hcx + hw * 0.26, hcy + hh * 0.36);
  ctx.stroke();
}

function drawBabyProfileHeadShape(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, r: number, skin: string, dir: number): void {
  const hg = ctx.createRadialGradient(hcx - dir * r * 0.25, hcy - r * 0.3, r * 0.18, hcx, hcy, r * 1.05);
  hg.addColorStop(0, tint(skin, 16));
  hg.addColorStop(0.65, skin);
  hg.addColorStop(1, shade(skin, 14));
  drawEar(ctx, hcx - dir * r * 0.92, hcy + r * 0.08, r * 0.13, r * 0.18, skin, true);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(hcx - dir * r * 0.75, hcy + r * 0.06);
  ctx.quadraticCurveTo(hcx - dir * r * 0.66, hcy - r * 0.76, hcx - dir * r * 0.05, hcy - r * 0.96);
  ctx.quadraticCurveTo(hcx + dir * r * 0.73, hcy - r * 0.88, hcx + dir * r * 0.88, hcy - r * 0.18);
  ctx.quadraticCurveTo(hcx + dir * r * 1.12, hcy - r * 0.04, hcx + dir * r * 0.86, hcy + r * 0.14);
  ctx.quadraticCurveTo(hcx + dir * r * 0.72, hcy + r * 0.48, hcx + dir * r * 0.18, hcy + r * 0.72);
  ctx.quadraticCurveTo(hcx - dir * r * 0.5, hcy + r * 0.68, hcx - dir * r * 0.75, hcy + r * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

function drawBabyBackHeadShape(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, r: number, skin: string): void {
  const hg = ctx.createRadialGradient(hcx - r * 0.18, hcy - r * 0.28, r * 0.18, hcx, hcy, r * 1.05);
  hg.addColorStop(0, tint(skin, 12));
  hg.addColorStop(0.65, skin);
  hg.addColorStop(1, shade(skin, 14));
  drawEar(ctx, hcx - r * 0.86, hcy + r * 0.04, r * 0.12, r * 0.17, skin, true);
  drawEar(ctx, hcx + r * 0.86, hcy + r * 0.04, r * 0.12, r * 0.17, skin, true);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(hcx - r * 0.78, hcy + r * 0.04);
  ctx.quadraticCurveTo(hcx - r * 0.72, hcy - r * 0.82, hcx, hcy - r * 0.96);
  ctx.quadraticCurveTo(hcx + r * 0.72, hcy - r * 0.82, hcx + r * 0.78, hcy + r * 0.04);
  ctx.quadraticCurveTo(hcx + r * 0.72, hcy + r * 0.58, hcx, hcy + r * 0.74);
  ctx.quadraticCurveTo(hcx - r * 0.72, hcy + r * 0.58, hcx - r * 0.78, hcy + r * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,70,58,0.2)";
  ctx.lineWidth = Math.max(0.8, r * 0.035);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hcx - r * 0.22, hcy + r * 0.52);
  ctx.quadraticCurveTo(hcx, hcy + r * 0.64, hcx + r * 0.22, hcy + r * 0.52);
  ctx.stroke();
}

// ===========================================================================
// Look + age profile
// ===========================================================================

export interface AvatarLook {
  /** Exact v5 life-stage profile used to select generated storybook art. */
  lifeStageIndex: number;
  appearance: CharacterAppearanceId;
  heightPx: number;
  headRatio: number;
  chub: number;
  baby: boolean;
  child: boolean;
  elder: boolean;
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun";
  hairTexture: "straight" | "wavy" | "coily";
  shirt: string;
  pants: string;
  shoes: string;
  gender: Gender;
  heritage: HeritageStyle;
  outfitStyle: "western" | "asian" | "middleEastern" | "africanDiaspora";
  skirt: boolean;
  mature: boolean;
  iris?: string; // eye colour — set from the heritage palette (falls back to blue)
}

export type AvatarFacing = "front" | "left" | "right" | "back";

interface Breadths {
  shoulder: number;
  waist: number;
  hip: number;
  /** 0 = small child, 1 = fully grown — also drives how adult the shape reads. */
  maturity: number;
}

/**
 * Shoulder / waist / hip breadths as fractions of STATURE, which is how real
 * bodies are proportioned. Deriving them from head width (the old approach) is
 * what gave big-headed children linebacker shoulders and left women with no
 * hips: anthropometric biacromial breadth is ~24% of height for a man, ~21%
 * for a woman and ~20% for a child, while hip breadth goes the other way —
 * widest on women, narrowest on men.
 *
 * Maturity is inferred from the head ratio (children carry proportionally
 * bigger heads), so teenagers blend smoothly from the child tube shape into
 * their adult silhouette without any extra per-stage bookkeeping.
 */
function bodyBreadths(look: AvatarLook): Breadths {
  const H = look.heightPx;
  const female = look.gender === "female";
  const maturity = Math.max(0, Math.min(1, (0.30 - look.headRatio) / (0.30 - 0.158)));
  const mix = (child: number, adult: number): number => child + (adult - child) * maturity;
  // children are straight-sided: narrow shoulders, barely any waist, narrow hips
  const shoulder = mix(0.196, female ? 0.207 : 0.245);
  const waist = mix(0.166, female ? 0.133 : 0.176) + look.chub * 0.05;
  const hip = mix(0.174, female ? 0.234 : 0.188) + look.chub * 0.028;
  // age rounds the shoulders in and softens the middle
  const stoopy = look.elder ? 0.94 : 1;
  return { shoulder: H * shoulder * stoopy, waist: H * waist, hip: H * hip, maturity };
}

export interface AvatarMotion {
  moving: boolean;
  facing: AvatarFacing;
  verticalBias: number;
  pose?: "stand" | "sit";
}

const IDLE_MOTION: AvatarMotion = { moving: false, facing: "front", verticalBias: 0 };

function motionFrom(motion: AvatarMotion | boolean): AvatarMotion {
  return typeof motion === "boolean" ? { ...IDLE_MOTION, moving: motion } : motion;
}

interface BodyProfile {
  heightPx: number;
  headRatio: number;
  chub: number;
  baby: boolean;
  child: boolean;
  elder: boolean;
}

// V5's compact chibi scale. The overall height stays modest in the 640×1000
// room while the head grows to roughly a third of stature on adults. Children
// and babies are progressively rounder, and elders settle back into a softer,
// slightly larger-head silhouette.
const STAGE_PROFILES: BodyProfile[] = [
  { heightPx: 72, headRatio: 0.54, chub: 1.0, baby: true, child: true, elder: false }, // newborn crawl
  { heightPx: 80, headRatio: 0.48, chub: 0.62, baby: false, child: true, elder: false }, // toddler
  { heightPx: 88, headRatio: 0.44, chub: 0.52, baby: false, child: true, elder: false }, // early childhood
  { heightPx: 96, headRatio: 0.41, chub: 0.44, baby: false, child: true, elder: false }, // elementary
  { heightPx: 106, headRatio: 0.38, chub: 0.34, baby: false, child: true, elder: false }, // middle school
  { heightPx: 116, headRatio: 0.35, chub: 0.28, baby: false, child: false, elder: false }, // high school
  { heightPx: 124, headRatio: 0.33, chub: 0.24, baby: false, child: false, elder: false }, // university
  { heightPx: 128, headRatio: 0.32, chub: 0.22, baby: false, child: false, elder: false }, // career (~3.1 heads)
  { heightPx: 128, headRatio: 0.32, chub: 0.24, baby: false, child: false, elder: false }, // marriage
  { heightPx: 126, headRatio: 0.325, chub: 0.3, baby: false, child: false, elder: false }, // midlife
  { heightPx: 120, headRatio: 0.35, chub: 0.36, baby: false, child: false, elder: true }, // senior
  { heightPx: 116, headRatio: 0.37, chub: 0.4, baby: false, child: false, elder: true }, // retirement
];

interface HeritagePalette {
  skin: string;
  hair: string;
  elderHair: string;
  iris: string;
  texture: AvatarLook["hairTexture"];
  shirtsM: string[];
  shirtsF: string[];
  skirts: string[];
  pants: string[];
  shoes: string;
  outfitStyle: AvatarLook["outfitStyle"];
}

const HERITAGE_PALETTES: Record<HeritageStyle, HeritagePalette> = {
  western: {
    skin: "#ffd0a8",
    hair: "#3a2a1e",
    elderHair: "#e4e4ec",
    iris: "#3b6f9d",
    texture: "wavy",
    shirtsM: ["#4aa3ff", "#45c46a", "#ffb934", "#6d7dff", "#1fc7b6", "#ff7f50", "#2d95ff", "#42c98f"],
    shirtsF: ["#ff6eb5", "#ff8cd3", "#ad7cff", "#ff6f91", "#79a6ff", "#ff70c7", "#e56bd6", "#ff7aa8"],
    skirts: ["#f7f2ff", "#ff9ec0", "#8cc9ff", "#ffd36e", "#9a6ac4", "#f07ca8", "#b7e28a", "#ffffff"],
    pants: ["#2d4f9c", "#243d68", "#33405a"],
    shoes: "#3a2a35",
    outfitStyle: "western",
  },
  asian: {
    skin: "#f1bd8e",
    hair: "#221916",
    elderHair: "#d7d8dc",
    iris: "#4a3526",
    texture: "straight",
    shirtsM: ["#d83b3b", "#1f9aa0", "#274f8f", "#f0b540", "#46a86b", "#6f63c7", "#d86b3d", "#2d95ff"],
    shirtsF: ["#e84c65", "#ff9f43", "#16a6a0", "#b75adf", "#f6c85f", "#ef7b95", "#4da3ff", "#8acb88"],
    skirts: ["#fff0c9", "#e84c65", "#86d6d2", "#f7d76b", "#6f63c7", "#ffffff", "#ffb6a8", "#2f8a70"],
    pants: ["#20385f", "#31496f", "#27384a"],
    shoes: "#24242f",
    outfitStyle: "asian",
  },
  middleEastern: {
    skin: "#d39a70",
    hair: "#241914",
    elderHair: "#d0d0d2",
    iris: "#4a3526",
    texture: "wavy",
    shirtsM: ["#f7ead2", "#f2f2e8", "#1f6f75", "#d9a441", "#5b6db5", "#6c4a2e", "#2f8a7c", "#d8c090"],
    shirtsF: ["#1d2b45", "#2c7a79", "#6b4ea0", "#d7a84c", "#8f2f52", "#f4dfc5", "#446b8e", "#b85c38"],
    skirts: ["#1d2b45", "#2c7a79", "#6b4ea0", "#f4dfc5", "#8f2f52", "#d7a84c", "#446b8e", "#ffffff"],
    pants: ["#32283f", "#243642", "#f2eadc"],
    shoes: "#2a2022",
    outfitStyle: "middleEastern",
  },
  black: {
    skin: "#7a4a32",
    hair: "#17120f",
    elderHair: "#c8c8c5",
    iris: "#33231a",
    texture: "coily",
    shirtsM: ["#ffcf33", "#e63946", "#118a5b", "#2760a8", "#f47c20", "#8a4bd6", "#13b5b1", "#f2efe4"],
    shirtsF: ["#f25f5c", "#ffcf33", "#18a999", "#7b4dff", "#f77f00", "#2ec4b6", "#e94f8a", "#fff2a8"],
    skirts: ["#ffcf33", "#e63946", "#118a5b", "#2760a8", "#f47c20", "#7b4dff", "#ffffff", "#2ec4b6"],
    pants: ["#1d2d50", "#2c2a3d", "#173b34"],
    shoes: "#1d1720",
    outfitStyle: "africanDiaspora",
  },
};

const SKIRTS_F = ["#f7f2ff", "#ff9ec0", "#8cc9ff", "#ffd36e", "#9a6ac4", "#f07ca8", "#b7e28a", "#ffffff"];

function heritagePalette(heritage: HeritageStyle = "western"): HeritagePalette {
  return HERITAGE_PALETTES[heritage] ?? HERITAGE_PALETTES.western;
}

function pick<T>(items: T[], i: number): T {
  return items[Math.abs(i) % items.length];
}

export function avatarLook(
  stageIndex: number,
  gender: Gender = "male",
  heritage: HeritageStyle = "western",
  appearance: CharacterAppearanceId = "classic"
): AvatarLook {
  const i = Math.max(0, Math.min(STAGE_PROFILES.length - 1, stageIndex));
  const p = STAGE_PROFILES[i];
  const female = gender === "female";
  const palette = heritagePalette(heritage);
  const hair = p.elder
    ? palette.elderHair
    : p.child
      ? tint(palette.hair, heritage === "western" ? 54 : heritage === "asian" ? 20 : 34)
      : female
        ? tint(palette.hair, heritage === "black" ? 10 : 28)
        : palette.hair;
  const shirts = female ? palette.shirtsF : palette.shirtsM;
  const skirtSet = heritage === "western" ? SKIRTS_F : palette.skirts;
  const pantsSet = heritage === "western" ? ["#2d4f9c", "#243d68", "#33405a"] : palette.pants;
  return {
    ...p,
    lifeStageIndex: i,
    appearance,
    skin: palette.skin,
    hair,
    hairTexture: palette.texture,
    hairStyle: female ? (p.elder ? "bun" : "long") : "short",
    shirt: pick(shirts, i),
    pants: female ? pick(skirtSet, i) : pick(pantsSet, i + (i >= 7 ? 1 : 0)),
    shoes: female ? (heritage === "western" ? "#f04d8e" : palette.shoes) : palette.shoes,
    gender,
    heritage,
    outfitStyle: palette.outfitStyle,
    skirt: female && i >= 3 && !p.baby,
    mature: female && i >= 6,
    iris: palette.iris,
  };
}

const PERSON_PROFILE: Record<
  | "newborn"
  | "toddler"
  | "child"
  | "earlyTeen"
  | "teen"
  | "youngAdult"
  | "adult"
  | "middleAge"
  | "elder",
  number
> = {
  newborn: 0,
  toddler: 1,
  child: 2,
  earlyTeen: 4,
  teen: 5,
  youngAdult: 6,
  adult: 7,
  middleAge: 9,
  elder: 11,
};

export function personLook(
  kind: PersonKind,
  playerGender: Gender,
  stageIndex?: number,
  heritage: HeritageStyle = "western",
  appearance: CharacterAppearanceId = "classic",
  genderOverride?: Gender
): AvatarLook {
  const opp: Gender = playerGender === "female" ? "male" : "female";
  const spouseGender = genderOverride ?? opp;
  type Spec = { g: Gender; age: keyof typeof PERSON_PROFILE; hair: string; shirt: string };
  const map: Record<PersonKind, Spec> = {
    mother: { g: "female", age: "adult", hair: "#6a4327", shirt: "#ff9ec0" },
    father: { g: "male", age: "adult", hair: "#3a2a1e", shirt: "#5f93cf" },
    grandma: { g: "female", age: "elder", hair: "#e4e4ec", shirt: "#c9a6d6" },
    grandpa: { g: "male", age: "elder", hair: "#cdced6", shirt: "#8fa0ab" },
    babySibling: { g: "male", age: "newborn", hair: "#824d22", shirt: "#78baff" },
    sibling: { g: "male", age: "child", hair: "#824d22", shirt: "#69c06a" },
    playmate: { g: "female", age: "child", hair: "#8a5a2e", shirt: "#ffd23f" },
    studyFriend: { g: "male", age: "teen", hair: "#3a2a1e", shirt: "#5aa3df" },
    bestFriend: { g: "female", age: "teen", hair: "#6a4327", shirt: "#8fdf6b" },
    crush: { g: opp, age: "teen", hair: opp === "female" ? "#6a4327" : "#3a2a1e", shirt: opp === "female" ? "#ff8fd0" : "#7f9cff" },
    smokerFriend: { g: "male", age: "teen", hair: "#6a4327", shirt: "#8aa7c9" },
    gangster: { g: "male", age: "teen", hair: "#2f241d", shirt: "#6f62d8" },
    playboy: { g: "male", age: "teen", hair: "#7a421f", shirt: "#ff6f9f" },
    roommate: { g: "male", age: "youngAdult", hair: "#2a2a1e", shirt: "#dd865a" },
    coworker: { g: "female", age: "adult", hair: "#3a2a1e", shirt: "#54b3a6" },
    boss: { g: "male", age: "middleAge", hair: "#2a2a2a", shirt: "#4a5562" },
    gymBuddy: { g: "male", age: "adult", hair: "#2a2018", shirt: "#ff6b6b" },
    spouse: { g: spouseGender, age: "adult", hair: spouseGender === "female" ? "#6a4327" : "#3a2a1e", shirt: spouseGender === "female" ? "#ff9ec0" : "#5f93cf" },
    baby: { g: playerGender, age: "newborn", hair: "#824d22", shirt: "#78baff" },
    child: { g: "male", age: "child", hair: "#824d22", shirt: "#ffd23f" },
    grandkid: { g: "female", age: "child", hair: "#8a5a2e", shirt: "#8fdf6b" },
    oldFriend: { g: "male", age: "elder", hair: "#cdced6", shirt: "#9c8cff" },
  };
  const s = map[kind];
  const female = s.g === "female";
  const palette = heritagePalette(heritage);
  let profileIndex = PERSON_PROFILE[s.age];
  if (stageIndex !== undefined) {
    if (
      stageIndex >= 1 &&
      stageIndex <= 6 &&
      isSameStagePeerKind(kind)
    ) {
      profileIndex = stageIndex;
    }
    if (kind === "sibling") {
      if (stageIndex === 0) profileIndex = 2;
      else if (stageIndex === 1) profileIndex = 0;
      else if (stageIndex === 2) profileIndex = 1;
      else if (stageIndex <= 3) profileIndex = 3;
      else if (stageIndex === 4) profileIndex = 4;
      else if (stageIndex === 5) profileIndex = 5;
      else if (stageIndex === 6) profileIndex = 6;
      else if (stageIndex <= 8) profileIndex = 7;
      else if (stageIndex === 9) profileIndex = 9;
      else profileIndex = 10;
    }
    if (kind === "mother" || kind === "father") {
      profileIndex = stageIndex >= 9 ? 10 : stageIndex >= 6 ? 9 : 7;
    }
    if (kind === "spouse") {
      profileIndex = stageIndex >= 10 ? 10 : stageIndex >= 9 ? 9 : 7;
    }
    if (kind === "child") profileIndex = stageIndex >= 9 ? 3 : 2;
    if (kind === "grandkid") profileIndex = stageIndex >= 11 ? 2 : 1;
    if ((kind === "smokerFriend" || kind === "gangster" || kind === "playboy") && stageIndex >= 6) profileIndex = 6;
  }
  const p = STAGE_PROFILES[profileIndex];
  const ageAwareHair = kind === "spouse" && p.elder
    ? palette.elderHair
    : kind === "child" || kind === "grandkid"
      ? tint(palette.hair, heritage === "asian" ? 20 : 34)
      : p.elder
        ? palette.elderHair
        : kind === "smokerFriend" || kind === "gangster" || kind === "playboy"
          ? shade(palette.hair, 4)
          : palette.hair;
  const localShirt = kind === "smokerFriend" || kind === "gangster" || kind === "playboy"
    ? s.shirt
    : female
      ? pick(palette.shirtsF, profileIndex + kind.length)
      : pick(palette.shirtsM, profileIndex + kind.length);
  const skirtSet = heritage === "western" ? SKIRTS_F : palette.skirts;
  const pantsSet = heritage === "western" ? ["#33405a", "#243d68", "#2d4f9c"] : palette.pants;
  return {
    ...p,
    lifeStageIndex: profileIndex,
    appearance,
    skin: palette.skin,
    hair: ageAwareHair,
    hairTexture: palette.texture,
    hairStyle: female ? (p.elder ? "bun" : "long") : "short",
    shirt: localShirt,
    pants: female ? pick(skirtSet, profileIndex + kind.length) : pick(pantsSet, profileIndex + kind.length),
    shoes: female ? (heritage === "western" ? "#c25b8e" : palette.shoes) : palette.shoes,
    gender: s.g,
    heritage,
    outfitStyle: palette.outfitStyle,
    skirt: female && !p.baby,
    mature: female && profileIndex >= 6,
    iris: palette.iris,
  };
}

// ===========================================================================
// Character rendering
// ===========================================================================

export function drawInteractionExpression(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: AvatarLook,
  walkPhase: number,
  motion: AvatarMotion,
  expression: CharacterExpression
): void {
  if (expression === "neutral" || motion.facing === "back") return;

  const height = storybookVisualHeight(look);
  const seated =
    motion.pose === "sit" ||
    (look.baby && !motion.moving && motion.pose !== "stand");
  const headX = cx + (look.baby && !seated ? height * 0.1 : 0);
  const headY =
    footY -
    height *
      (seated ? 0.78 : look.baby ? 0.62 : 0.81);
  const sideSign = motion.facing === "left" ? -1 : 1;
  const cueX = headX + sideSign * height * 0.24;
  const cueY = headY - height * 0.02;
  const radius = Math.max(3, Math.min(5.5, height * 0.035));
  const lineWidth = Math.max(
    1.25,
    Math.min(2, height * 0.012)
  );
  const pulse =
    0.92 +
    0.08 * Math.sin(walkPhase * 5.5);

  ctx.save();
  ctx.translate(cueX, cueY);
  ctx.scale(pulse, pulse);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "rgba(24,20,38,0.82)";
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(0.8, lineWidth * 0.65);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (expression === "smile") {
    ctx.strokeStyle = "#ffd56f";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.72, -radius * 0.1);
    ctx.quadraticCurveTo(
      0,
      radius * 0.78,
      radius * 0.72,
      -radius * 0.1
    );
    ctx.stroke();
    ctx.fillStyle = "#ff8ba1";
    ctx.beginPath();
    ctx.arc(
      radius * 0.92,
      -radius * 0.9,
      Math.max(1, radius * 0.3),
      0,
      Math.PI * 2
    );
    ctx.fill();
  } else if (expression === "talk") {
    const dotR = Math.max(0.8, radius * 0.22);
    for (let i = 0; i < 3; i += 1) {
      const dotPulse =
        0.65 +
        0.35 *
          Math.max(0, Math.sin(walkPhase * 6.5 - i * 0.8));
      ctx.fillStyle = `rgba(255,255,255,${dotPulse})`;
      ctx.beginPath();
      ctx.arc(
        (i - 1) * dotR * 2.5,
        0,
        dotR,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else {
    ctx.strokeStyle =
      expression === "stern" ? "#ff697b" : "#b9c7db";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    if (expression === "stern") {
      ctx.moveTo(-radius * 0.75, radius * 0.35);
      ctx.quadraticCurveTo(
        0,
        -radius * 0.5,
        radius * 0.75,
        radius * 0.35
      );
    } else {
      ctx.moveTo(-radius * 0.7, 0);
      ctx.lineTo(radius * 0.7, radius * 0.16);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawNpcRoleCue(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: AvatarLook,
  cue: NpcRoleCue,
  t: number
): void {
  if (cue === "none") return;
  const height = storybookVisualHeight(look);
  const eyeY = footY - height * 0.755;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (cue === "riskyCrowd") {
    const lensW = Math.max(3.2, height * 0.044);
    const lensH = Math.max(1.8, height * 0.021);
    const gap = Math.max(1.3, height * 0.011);
    ctx.fillStyle = "rgba(18,21,29,0.94)";
    ctx.strokeStyle = "#713743";
    ctx.lineWidth = Math.max(0.9, height * 0.008);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(
        cx + side * (gap + lensW * 0.9),
        eyeY,
        lensW,
        lensH,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1d28";
    ctx.beginPath();
    ctx.moveTo(cx - gap, eyeY);
    ctx.lineTo(cx + gap, eyeY);
    ctx.stroke();

    // A small warning chevron is a role cue, not a culture-coded costume.
    const badgeX = cx + height * 0.18;
    const badgeY = footY - height * 0.48;
    ctx.fillStyle = "rgba(190,50,67,0.92)";
    ctx.beginPath();
    ctx.moveTo(badgeX, badgeY - height * 0.026);
    ctx.lineTo(badgeX + height * 0.023, badgeY);
    ctx.lineTo(badgeX, badgeY + height * 0.026);
    ctx.lineTo(badgeX - height * 0.023, badgeY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff1d8";
    ctx.font = `bold ${Math.max(5, height * 0.044)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", badgeX, badgeY + 0.5);
  } else if (cue === "smokePressure") {
    const x = cx + height * 0.16;
    const y = footY - height * 0.62;
    ctx.strokeStyle = "rgba(203,209,218,0.82)";
    ctx.lineWidth = Math.max(1.2, height * 0.011);
    for (let i = 0; i < 2; i += 1) {
      const drift = Math.sin(t * 2.2 + i) * height * 0.008;
      ctx.beginPath();
      ctx.moveTo(x + i * height * 0.022, y);
      ctx.bezierCurveTo(
        x - height * 0.02 + drift,
        y - height * 0.035,
        x + height * 0.028 + drift,
        y - height * 0.07,
        x + drift,
        y - height * 0.105
      );
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(190,198,209,0.58)";
    for (let i = 0; i < 3; i += 1) {
      const drift =
        Math.sin(t * 1.8 + i * 0.9) * height * 0.01;
      ctx.beginPath();
      ctx.arc(
        x + drift + i * height * 0.012,
        y - height * (0.04 + i * 0.032),
        Math.max(1.2, height * (0.012 + i * 0.002)),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else {
    const chestY = footY - height * 0.44;
    ctx.strokeStyle = "#f1c45a";
    ctx.lineWidth = Math.max(1, height * 0.01);
    ctx.beginPath();
    ctx.arc(cx, chestY, height * 0.07, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    const sparkleX = cx + height * 0.16;
    const sparkleY =
      footY - height * 0.64 + Math.sin(t * 3) * height * 0.008;
    ctx.fillStyle = "#ffd66b";
    ctx.font = `${Math.max(7, height * 0.07)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", sparkleX, sparkleY);
  }
  ctx.restore();
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: AvatarLook,
  walkPhase: number,
  motionInput: AvatarMotion | boolean,
  expression: CharacterExpression = "neutral"
): void {
  const motion = motionFrom(motionInput);
  if (!drawStorybookCharacter(ctx, cx, footY, look, walkPhase, motion)) {
    drawCuteCharacter(ctx, cx, footY, look, walkPhase, motion);
  }
  drawInteractionExpression(
    ctx,
    cx,
    footY,
    look,
    walkPhase,
    motion,
    expression
  );
}

/** Kept as an unexported rollback reference while v5's renderer is reviewed.
 * Rollup removes this legacy branch from the production bundle. */
function drawLegacyCharacter(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motionInput: AvatarMotion | boolean): void {
  const motion = motionFrom(motionInput);
  if (look.baby) drawBaby(ctx, cx, footY, look, walkPhase, motion);
  else if (motion.pose === "sit") drawSeated(ctx, cx, footY, look, walkPhase);
  else drawStanding(ctx, cx, footY, look, walkPhase, motion);
}

function groundShadow(ctx: CanvasRenderingContext2D, cx: number, footY: number, rx: number): void {
  // A soft radial pool exactly under the feet — grounds the figure in the room.
  // (An earlier version was a hard dark ellipse that read as a blob IN FRONT of
  // people; this one is wide, thin, low-alpha and fades to nothing at the rim.)
  const r = Math.max(8, rx);
  const g = ctx.createRadialGradient(cx, footY, r * 0.1, cx, footY, r);
  g.addColorStop(0, "rgba(10,7,16,0.34)");
  g.addColorStop(0.65, "rgba(10,7,16,0.16)");
  g.addColorStop(1, "rgba(10,7,16,0)");
  ctx.save();
  ctx.translate(0, footY);
  ctx.scale(1, 0.22);
  ctx.translate(0, -footY);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, footY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStanding(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  if (motion.facing === "back") {
    drawBackStanding(ctx, cx, footY, look, walkPhase, motion);
    return;
  }
  if (motion.facing !== "front") {
    drawSideStanding(ctx, cx, footY, look, walkPhase, motion);
    return;
  }
  const female = look.gender === "female";
  const swing = motion.moving ? Math.sin(walkPhase) : 0;
  const bob = motion.moving ? Math.abs(Math.sin(walkPhase)) * H * 0.012 : Math.sin(walkPhase * 0.5) * H * 0.006;
  const stoop = look.elder ? H * 0.045 : 0;
  const baseY = footY - bob;

  // Realistic pixel-body build: smaller head, real neck, shaped torso, long legs.
  const headH = H * look.headRatio;
  // head width : height is ~0.72 on adults, rounder on children — the old
  // 0.76 gave everyone a slightly squat, wide skull
  const headW = headH * (look.child ? 0.79 : 0.72) * (1 + look.chub * 0.05);
  const neckH = headH * (look.child ? 0.22 : 0.25); // short, natural neck
  const torsoH = (H - headH - neckH) * (look.child ? 0.46 : 0.44); // legs a touch shorter — real torso:leg ratio
  const legH = Math.max(H * 0.22, H - headH - neckH - torsoH);
  const build = bodyBreadths(look);
  const shoulderW = build.shoulder;
  const waistW = build.waist;
  const hipW = build.hip;
  // Limbs taper: thigh → knee → ankle, upper arm → elbow → wrist.
  const thighW = H * (0.076 + look.chub * 0.022);
  const kneeW = thighW * 0.72;
  const ankleW = thighW * 0.5;
  const upperArmW = H * (0.05 + look.chub * 0.014);
  const elbowW = upperArmW * 0.8;
  const wristW = upperArmW * 0.56;
  const legW = thighW; // kept for the cane and other callers below
  // Foot length is ~15% of stature; seen head-on a shoe is only ~40% as wide
  // as it is long, so the front and side views derive from one number.
  const footLen = H * 0.15;

  const hipY = baseY - legH;
  const torsoTopY = hipY - torsoH + stoop;
  // waist is ~70% down the torso; the pelvis fills the rest to the hip line
  const waistY = torsoTopY + torsoH * 0.7;
  const shoulderY = torsoTopY + torsoH * 0.1;
  const neckTopY = torsoTopY - neckH + stoop * 0.5;
  const headCx = cx + stoop * 0.5;
  const headCy = neckTopY - headH / 2 + headH * 0.09;
  // a mature woman's chest widens the ribcage silhouette, not just its shading
  const bust = female && look.mature ? (look.elder ? 0.07 : 0.13) : 0;

  const skin = look.skin;
  const skinD = shade(skin, 20);

  groundShadow(ctx, cx, footY, shoulderW * 0.62);

  // long hair is the very BACK layer — drawn before the whole body so it sits
  // behind the torso, neck and head (a girl's hair falls behind her, never over
  // the face nor in front of the chest)
  drawBackHair(ctx, headCx, headCy, headW, headH, look);

  // --- legs ----------------------------------------------------------------
  const stride = swing * H * 0.082;
  const lift = Math.abs(swing) * H * 0.034;
  // Real gait rotates the pelvis and the shoulder girdle in OPPOSITE
  // directions: the hip drops on the swinging side while the shoulders tilt
  // the other way. Without it the walk reads as a torso sliding on two sticks.
  const hipTilt = swing * H * 0.008;
  const shoulderTilt = -hipTilt * 0.75;
  const drawLegPair = (): void => {
    const shoeH = H * 0.03;
    const ly = baseY - shoeH;
    const kneeY = hipY + legH * 0.47;
    const leftLift = swing > 0 ? lift : 0;
    const rightLift = swing < 0 ? lift : 0;
    // Real legs leave the pelvis at the femur heads and CONVERGE toward the
    // knees and ankles — parallel tubes a hip apart is what made the old
    // figures look like they were standing astride.
    const hipSpread = hipW * 0.24;
    const kneeSpread = hipW * 0.17;
    const ankleSpread = hipW * 0.15;
    // bare legs show below a skirt hem — painting them in the skirt colour is
    // what gave every girl solid white or pink legs
    const legFill = look.skirt ? look.skin : look.pants;
    for (const side of [-1, 1] as const) {
      const liftY = (side < 0 ? leftLift : rightLift);
      const hipX = cx + side * hipSpread;
      const kneeX = cx + side * kneeSpread + side * stride * 0.34;
      const footX = cx + side * ankleSpread + side * stride;
      const kY = kneeY - liftY * 0.38;
      // thigh: thick at the hip, narrowing into the knee
      taperedLimb(ctx, hipX, hipY - thighW * 0.25 + side * hipTilt, kneeX, kY, thighW, kneeW, shade(legFill, 4));
      // calf: bulges just under the knee, then narrows hard into the ankle
      taperedLimb(ctx, kneeX, kY, footX, ly - liftY, kneeW * 1.02, ankleW, legFill);
      jointCover(ctx, kneeX, kY, kneeW, legFill);
      frontShoe(ctx, footX + side * ankleW * 0.14, ly - liftY + shoeH * 0.5, side, footLen * 0.42, shoeH * 2.0, hgrad(ctx, footX - ankleW, footLen * 0.4, look.shoes));
    }
  };
  drawLegPair();

  // --- arms: hang naturally AT THE SIDES of the body (not over the shirt) ---
  // Anchored at the shoulder corners and falling just outside the torso taper,
  // with the hands resting beside the hips — a real relaxed stance. The torso
  // is painted after, so the arms' inner edges tuck behind the body.
  const aSwing = swing * H * 0.062; // arms counter-swing the legs (contralateral)
  // Landmarks, not guesses: the shoulder joint sits INSIDE the deltoid so the
  // upper arm overlaps the ribcage, the elbow lands at the natural waist, and
  // relaxed fingertips reach mid-thigh. The old arms floated clear of the body
  // and stopped at the hip, which is what made them read as detached sticks.
  // Measured against real segment lengths (upper arm ~0.186 of stature,
  // forearm ~0.146, fingertips reaching ~0.38 of stature off the floor). The
  // elbow was sitting a full head too low, which is what stretched the arms.
  const armPitY = shoulderY + upperArmW * 0.15;
  const elbowY = waistY - torsoH * 0.06;
  // Adults reach mid-thigh; children's arms are proportionally shorter against
  // stature, so the hand target rides up toward the upper thigh as maturity
  // falls. Anchoring purely to torso landmarks under-shot on small children.
  const handY = hipY + legH * (0.055 + build.maturity * 0.055);
  // real hand length is ~10.8% of stature; a relaxed hand is foreshortened, so
  // ~7.5% is the honest drawn size
  const handR = H * 0.075;
  const leftShoulderX = cx - shoulderW * 0.4;
  const rightShoulderX = cx + shoulderW * 0.4;
  const leftElbowX = cx - (waistW * 0.5 + elbowW * 0.3) + aSwing * 0.45;
  const rightElbowX = cx + (waistW * 0.5 + elbowW * 0.3) - aSwing * 0.45;
  const leftHandX = cx - (hipW * 0.44 + wristW * 0.3) + aSwing;
  const rightHandX = cx + (hipW * 0.44 + wristW * 0.3) - aSwing;
  // The arms are painted LAST (see drawArms below) so they sit in front of the
  // torso instead of being swallowed by it — a relaxed arm is visible against
  // the body, not buried behind it.
  const drawArms = (): void => {
    taperedLimb(ctx, leftShoulderX, armPitY - shoulderTilt, leftElbowX, elbowY, upperArmW, elbowW, shade(look.shirt, 10));
    taperedLimb(ctx, leftElbowX, elbowY, leftHandX, handY, elbowW, wristW, shade(look.shirt, 4));
    taperedLimb(ctx, rightShoulderX, armPitY + shoulderTilt, rightElbowX, elbowY, upperArmW, elbowW, shade(look.shirt, 10));
    taperedLimb(ctx, rightElbowX, elbowY, rightHandX, handY, elbowW, wristW, shade(look.shirt, 4));
    // elbow covers — the forearm's outline crossed the upper arm as a dark band
    jointCover(ctx, leftElbowX, elbowY, elbowW, shade(look.shirt, 4));
    jointCover(ctx, rightElbowX, elbowY, elbowW, shade(look.shirt, 4));
    // sleeve cuffs where the wrist meets the hand
    ellipse(ctx, leftHandX, handY - wristW * 0.95, wristW * 0.62, wristW * 0.32, tint(look.shirt, 22));
    ellipse(ctx, rightHandX, handY - wristW * 0.95, wristW * 0.62, wristW * 0.32, tint(look.shirt, 22));
    drawHand(ctx, leftHandX, handY, handR * 0.62, handR * 0.76, skin, -1, -0.08);
    drawHand(ctx, rightHandX, handY, handR * 0.62, handR * 0.76, skin, 1, 0.08);
  };

  // --- skirt or lower body -------------------------------------------------
  if (look.skirt) {
    const skirtHemY = hipY + H * (look.child ? 0.035 : look.elder ? 0.095 : (look.pants === "#ffffff" || look.pants === "#f7f2ff") ? 0.085 : 0.065);
    // the skirt still has to sit ON hips: the waist is nipped, it flares over
    // the pelvis and only then falls away to the hem
    const flare = hipW * 0.72;
    ctx.fillStyle = hgrad(ctx, cx - flare, flare * 2, look.pants);
    ctx.beginPath();
    ctx.moveTo(cx - waistW * 0.48, waistY);
    ctx.quadraticCurveTo(cx - hipW * 0.54, hipY - (hipY - waistY) * 0.1, cx - flare, skirtHemY);
    ctx.quadraticCurveTo(cx, skirtHemY + hipW * 0.14, cx + flare, skirtHemY);
    ctx.quadraticCurveTo(cx + hipW * 0.54, hipY - (hipY - waistY) * 0.1, cx + waistW * 0.48, waistY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  } else {
    pelvis(ctx, cx, waistY, waistW * 0.5, hipY + thighW * 0.14, hipW * 0.5, hgrad(ctx, cx - hipW / 2, hipW, look.pants));
    // trousers: repaint the legs over the block — its outlined bottom hem
    // crossing the thighs was what read as a skirt on men
    drawLegPair();
  }

  // --- neck ----------------------------------------------------------------
  // Drawn BEFORE the torso and BEFORE the head, so the shirt hides where it
  // enters the body and the skull hides where it enters the head. Painted last
  // it looked like a separate tube stuck on the front of the chest.
  neckColumn(ctx, cx, neckTopY - headH * 0.16, torsoTopY + headH * 0.16, headW * 0.34, skin);

  // --- torso ---------------------------------------------------------------
  humanTorso(ctx, cx, torsoTopY, headW * 0.3, shoulderY, shoulderW * 0.5, waistY, waistW * 0.5, bust, hgrad(ctx, cx - shoulderW / 2, shoulderW, look.shirt, 22, 22), female && build.maturity > 0.55);
  // soft fabric folds so the shirt reads as cloth, not plastic
  ctx.strokeStyle = "rgba(24,16,24,0.13)";
  ctx.lineWidth = Math.max(1, shoulderW * 0.03);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - waistW * 0.3, torsoTopY + torsoH * 0.4);
  ctx.quadraticCurveTo(cx - waistW * 0.16, torsoTopY + torsoH * 0.52, cx - waistW * 0.24, torsoTopY + torsoH * 0.63);
  ctx.moveTo(cx + waistW * 0.28, torsoTopY + torsoH * 0.44);
  ctx.quadraticCurveTo(cx + waistW * 0.14, torsoTopY + torsoH * 0.55, cx + waistW * 0.2, torsoTopY + torsoH * 0.64);
  ctx.stroke();
  drawOutfitDetails(ctx, cx, torsoTopY, torsoH, shoulderW, waistW, hipW, headH, look);
  drawArms();
  // collar
  ellipse(ctx, cx, torsoTopY + headH * 0.07, headW * 0.24, headH * 0.09, skinD);

  // the hollow of the throat, sitting just above the neckline of the shirt
  ctx.save();
  ctx.globalAlpha = 0.26;
  ellipse(ctx, cx, torsoTopY - headH * 0.02, headW * 0.1, headH * 0.04, shade(skin, 34));
  ctx.restore();

  // --- head: cheekbones, ears and a small chin instead of a plain oval ------
  drawFrontHeadShape(ctx, headCx, headCy, headW, headH, skin, look);

  drawHair(ctx, headCx, headCy, headW, headH, look);
  drawFace(ctx, headCx, headCy, headW, headH, look);

  if (look.elder) {
    // cane
    cane(ctx, rightHandX, handY, footY, cx + shoulderW * 0.62, H);
  }
}

function drawSeated(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number): void {
  const H = look.heightPx;
  const female = look.gender === "female";
  const bob = Math.sin(walkPhase * 0.7) * H * 0.004;
  const baseY = footY - bob;

  const headH = H * look.headRatio;
  // head width : height is ~0.72 on adults, rounder on children — the old
  // 0.76 gave everyone a slightly squat, wide skull
  const headW = headH * (look.child ? 0.79 : 0.72) * (1 + look.chub * 0.05);
  const neckH = headH * (look.child ? 0.2 : 0.25);
  const torsoH = H * (look.child ? 0.27 : 0.29);
  const shoulderW = headW * (female ? 1.13 : 1.22) + look.chub * headW * 0.06;
  const waistW = shoulderW * (female ? 0.7 : 0.76);
  const hipW = shoulderW * (female ? 1.05 : 0.9);
  const legW = H * (0.052 + look.chub * 0.016);
  const armW = H * (0.039 + look.chub * 0.01);
  const skin = look.skin;
  const skinD = shade(skin, 20);

  const seatY = baseY - H * 0.18;
  const lapY = baseY - H * 0.13;
  const torsoTopY = seatY - torsoH;
  const neckTopY = torsoTopY - neckH + H * 0.012;
  const headCx = cx;
  const headCy = neckTopY - headH / 2 + headH * 0.09;

  groundShadow(ctx, cx, footY, shoulderW * 0.62);
  ellipse(ctx, cx, baseY - H * 0.035, hipW * 0.78, H * 0.045, "rgba(48,34,42,0.18)");

  // Folded legs: thighs sit sideways, calves bend down, feet stay grounded.
  const kneeY = baseY - H * 0.105;
  const footBaseY = baseY - H * 0.025;
  for (const side of [-1, 1] as const) {
    const hipX = cx + side * hipW * 0.18;
    const kneeX = cx + side * hipW * 0.68;
    const footX = cx + side * hipW * 0.54;
    limb(ctx, hipX, seatY + H * 0.025, kneeX, kneeY, legW, shade(look.pants, side < 0 ? 8 : 2));
    limb(ctx, kneeX, kneeY, footX, footBaseY, legW * 0.92, look.pants);
    frontShoe(ctx, footX + side * legW * 0.18, footBaseY + H * 0.014, side, legW * 2.25, H * 0.064, hgrad(ctx, footX - legW, legW * 2, look.shoes));
  }

  if (look.skirt) {
    taper(ctx, cx, torsoTopY + torsoH * 0.63, waistW * 0.95, lapY + H * 0.03, hipW * 1.35, hgrad(ctx, cx - hipW * 0.68, hipW * 1.36, look.pants));
  } else {
    taper(ctx, cx, torsoTopY + torsoH * 0.66, waistW, lapY + H * 0.02, hipW * 1.05, hgrad(ctx, cx - hipW * 0.52, hipW * 1.04, look.pants));
  }

  drawBackHair(ctx, headCx, headCy, headW, headH, look);
  taper(ctx, cx, torsoTopY, shoulderW, torsoTopY + torsoH * 0.72, waistW, hgrad(ctx, cx - shoulderW / 2, shoulderW, look.shirt, 22, 22));
  drawOutfitDetails(ctx, cx, torsoTopY, torsoH, shoulderW, waistW, hipW, headH, look);
  ellipse(ctx, cx, torsoTopY + headH * 0.07, headW * 0.3, headH * 0.11, skinD);

  // Relaxed arms and open palms on knees/floor, as if the adult came down to the baby.
  const shoulderY = torsoTopY + headH * 0.13;
  const elbowY = torsoTopY + torsoH * 0.6;
  const handY = baseY - H * 0.135;
  for (const side of [-1, 1] as const) {
    const shoulderX = cx + side * shoulderW * 0.35;
    const elbowX = cx + side * shoulderW * 0.48;
    const handX = cx + side * hipW * 0.46;
    limb(ctx, shoulderX, shoulderY, elbowX, elbowY, armW, shade(look.shirt, 8));
    limb(ctx, elbowX, elbowY, handX, handY, armW * 0.9, look.shirt);
    drawHand(ctx, handX, handY + H * 0.004, armW * 0.8, armW * 0.68, skin, side, side * 0.15);
  }

  ctx.fillStyle = skinD;
  ctx.fillRect(cx - neckH * 0.38, torsoTopY - neckH + 1, neckH * 0.76, neckH + headH * 0.1);
  ellipse(ctx, cx, neckTopY + neckH * 0.28, neckH * 0.48, neckH * 0.36, skin);

  drawFrontHeadShape(ctx, headCx, headCy, headW, headH, skin, look);
  drawHair(ctx, headCx, headCy, headW, headH, look);
  drawFace(ctx, headCx, headCy, headW, headH, look);
}

function drawOutfitDetails(
  ctx: CanvasRenderingContext2D,
  cx: number,
  torsoTopY: number,
  torsoH: number,
  shoulderW: number,
  waistW: number,
  hipW: number,
  headH: number,
  look: AvatarLook
): void {
  const chestY = torsoTopY + torsoH * 0.24;
  const hemY = torsoTopY + torsoH * 0.7; // the waistline the torso now ends on
  const detail = "rgba(34,22,28,0.35)";
  const shirtL = tint(look.shirt, 30);
  const shirtD = shade(look.shirt, 28);

  // Pixel-game collar and placket details make the tiny torso read as clothing.
  if (!look.child) {
    ctx.fillStyle = look.elder ? "#f4f0e6" : "#fff7e0";
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW * 0.22, torsoTopY + headH * 0.05);
    ctx.lineTo(cx - shoulderW * 0.02, chestY + headH * 0.02);
    ctx.lineTo(cx - shoulderW * 0.02, torsoTopY + headH * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + shoulderW * 0.22, torsoTopY + headH * 0.05);
    ctx.lineTo(cx + shoulderW * 0.02, chestY + headH * 0.02);
    ctx.lineTo(cx + shoulderW * 0.02, torsoTopY + headH * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = detail;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = shirtD;
    ctx.lineWidth = Math.max(1.2, shoulderW * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx, torsoTopY + headH * 0.18);
    ctx.lineTo(cx, hemY - 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, cx + shoulderW * 0.06, chestY + i * torsoH * 0.13, Math.max(1.2, shoulderW * 0.025), Math.max(1.2, shoulderW * 0.025), "#ffe9a8");
    }
  } else {
    ctx.strokeStyle = shirtL;
    ctx.lineWidth = Math.max(1.4, shoulderW * 0.045);
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW * 0.22, chestY);
    ctx.lineTo(cx + shoulderW * 0.22, chestY + torsoH * 0.04);
    ctx.stroke();
    ellipse(ctx, cx, chestY + torsoH * 0.18, shoulderW * 0.09, shoulderW * 0.09, "#ffe867");
  }

  drawHeritageOutfitDetails(ctx, cx, torsoTopY, torsoH, shoulderW, waistW, hipW, headH, look);

  if (look.gender === "female" && look.mature) {
    // a real bust with VOLUME: radially-lit shapes in the shirt colour plus a
    // soft shadow beneath — the old faint tint patch read as a flat male chest
    const bustY = torsoTopY + torsoH * (look.elder ? 0.36 : 0.33);
    const bustRx = shoulderW * (look.elder ? 0.115 : 0.16);
    const bustRy = torsoH * (look.elder ? 0.085 : 0.12);
    const bustGap = shoulderW * 0.145;
    for (const sgn of [-1, 1]) {
      const bx = cx + sgn * bustGap;
      // under-shadow first, so the shape visibly lifts off the torso
      ctx.save();
      ctx.globalAlpha = 0.4;
      ellipse(ctx, bx, bustY + bustRy * 0.5, bustRx * 0.94, bustRy * 0.62, shade(look.shirt, 32));
      ctx.restore();
      const bg = ctx.createRadialGradient(bx - bustRx * 0.28, bustY - bustRy * 0.35, bustRx * 0.12, bx, bustY, bustRx * 1.12);
      bg.addColorStop(0, tint(look.shirt, look.elder ? 16 : 30));
      bg.addColorStop(0.7, tint(look.shirt, 6));
      bg.addColorStop(1, shade(look.shirt, 14));
      ellipse(ctx, bx, bustY, bustRx, bustRy, bg);
    }
    // the centre line between the shapes
    ctx.strokeStyle = shade(look.shirt, 30);
    ctx.lineWidth = Math.max(1, shoulderW * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, bustY - bustRy * 0.3);
    ctx.lineTo(cx, bustY + bustRy * 0.55);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, shoulderW * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW * 0.34, torsoTopY + torsoH * 0.12);
  ctx.lineTo(cx - waistW * 0.32, hemY - 2);
  ctx.stroke();

  ctx.strokeStyle = look.skirt ? shade(look.pants, 30) : shade(look.pants, 18);
  ctx.lineWidth = Math.max(1.5, hipW * 0.04);
  ctx.beginPath();
  ctx.moveTo(cx - hipW * 0.42, hemY + 1);
  ctx.lineTo(cx + hipW * 0.42, hemY + 1);
  ctx.stroke();
  // grown men in trousers get a belt buckle on that waistline
  if (!look.skirt && look.gender === "male" && look.mature) {
    ellipse(ctx, cx, hemY + 1, hipW * 0.055, hipW * 0.05, "#d9b24a");
    ellipse(ctx, cx, hemY + 1, hipW * 0.026, hipW * 0.023, shade("#d9b24a", 32));
  }
}

function drawHeritageOutfitDetails(
  ctx: CanvasRenderingContext2D,
  cx: number,
  torsoTopY: number,
  torsoH: number,
  shoulderW: number,
  waistW: number,
  hipW: number,
  headH: number,
  look: AvatarLook
): void {
  if (look.outfitStyle === "western") return;

  const top = torsoTopY + headH * 0.06;
  const hem = torsoTopY + torsoH * 0.66;
  ctx.save();
  ctx.lineCap = "round";

  if (look.outfitStyle === "asian") {
    const trim = "#ffd85f";
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(1, shoulderW * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW * 0.2, top);
    ctx.quadraticCurveTo(cx - shoulderW * 0.06, torsoTopY + torsoH * 0.22, cx - waistW * 0.18, hem - 2);
    ctx.moveTo(cx + shoulderW * 0.2, top);
    ctx.quadraticCurveTo(cx + shoulderW * 0.06, torsoTopY + torsoH * 0.22, cx + waistW * 0.18, hem - 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,216,95,0.75)";
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, cx, torsoTopY + torsoH * (0.24 + i * 0.13), shoulderW * 0.025, shoulderW * 0.025, trim);
    }
  } else if (look.outfitStyle === "middleEastern") {
    const trim = "#f2cf7a";
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(1.2, shoulderW * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, hem - 1);
    ctx.moveTo(cx - shoulderW * 0.2, top + torsoH * 0.02);
    ctx.quadraticCurveTo(cx, top + torsoH * 0.18, cx + shoulderW * 0.2, top + torsoH * 0.02);
    ctx.stroke();
    ctx.strokeStyle = "rgba(242,207,122,0.55)";
    ctx.lineWidth = Math.max(0.9, shoulderW * 0.02);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * shoulderW * 0.34, torsoTopY + torsoH * 0.14);
      ctx.lineTo(cx + side * waistW * 0.34, hem - 1);
      ctx.stroke();
    }
  } else if (look.outfitStyle === "africanDiaspora") {
    const colors = ["#ffcf33", "#e63946", "#118a5b", "#2ec4b6"];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const y = torsoTopY + torsoH * (0.18 + i * 0.115);
      ctx.fillRect(cx - shoulderW * 0.34 + i * shoulderW * 0.035, y, shoulderW * 0.68, Math.max(1.2, torsoH * 0.018));
    }
    for (let i = 0; i < 5; i++) {
      const x = cx - shoulderW * 0.26 + i * shoulderW * 0.13;
      const y = torsoTopY + torsoH * (0.28 + (i % 2) * 0.18);
      ctx.fillStyle = colors[(i + 1) % colors.length];
      ctx.beginPath();
      ctx.moveTo(x, y - torsoH * 0.035);
      ctx.lineTo(x + shoulderW * 0.045, y + torsoH * 0.035);
      ctx.lineTo(x - shoulderW * 0.045, y + torsoH * 0.035);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
  if (look.outfitStyle === "middleEastern" && !look.child && !look.baby) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = tint(look.shirt, 20);
    ctx.fillRect(cx - waistW * 0.44, hem - 1, waistW * 0.88, Math.max(2, torsoH * 0.06));
    ctx.restore();
  } else if (look.outfitStyle === "africanDiaspora" && look.skirt) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = "#ffcf33";
    ctx.lineWidth = Math.max(1, hipW * 0.022);
    ctx.beginPath();
    ctx.moveTo(cx - hipW * 0.42, hem + torsoH * 0.03);
    ctx.lineTo(cx + hipW * 0.42, hem + torsoH * 0.03);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSideStanding(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  const dir = motion.facing === "left" ? -1 : 1;
  const female = look.gender === "female";
  const swing = motion.moving ? Math.sin(walkPhase) : 0;
  const bob = motion.moving ? Math.abs(Math.sin(walkPhase)) * H * 0.012 : Math.sin(walkPhase * 0.5) * H * 0.006;
  const lean = motion.moving ? dir * H * 0.018 : 0;
  const stoop = look.elder ? H * 0.045 : 0;
  const baseY = footY - bob;

  const headH = H * look.headRatio;
  // head width : height is ~0.72 on adults, rounder on children — the old
  // 0.76 gave everyone a slightly squat, wide skull
  const headW = headH * (look.child ? 0.79 : 0.72) * (1 + look.chub * 0.05);
  const neckH = headH * (look.child ? 0.22 : 0.25); // short, natural neck
  const torsoH = (H - headH - neckH) * (look.child ? 0.46 : 0.44); // legs a touch shorter — real torso:leg ratio
  const legH = Math.max(H * 0.22, H - headH - neckH - torsoH);
  const build = bodyBreadths(look);
  const shoulderW = build.shoulder;
  const waistW = build.waist;
  const hipW = build.hip;
  // A profile is defined by DEPTHS, not by scaled-down front widths. Real
  // front-to-back depth runs ~12% of stature at the chest, pinches at the
  // waist and swells again over the seat — deriving all three from one
  // shoulder number is what flattened the old side view into a plank.
  const sideShoulderW = H * (0.118 + look.chub * 0.03) + (female && look.mature ? H * 0.008 : 0);
  const sideWaistW = H * (0.094 + look.chub * 0.045);
  const sideHipW = H * (female ? 0.134 : 0.124) + look.chub * H * 0.03;
  const thighW = H * (0.076 + look.chub * 0.022);
  const kneeW = thighW * 0.72;
  const ankleW = thighW * 0.5;
  const upperArmW = H * (0.05 + look.chub * 0.014);
  const elbowW = upperArmW * 0.8;
  const wristW = upperArmW * 0.56;
  const legW = thighW;
  const armW = upperArmW;
  const footLen = H * 0.15;
  const hipY = baseY - legH;
  const torsoTopY = hipY - torsoH + stoop;
  const neckTopY = torsoTopY - neckH + stoop * 0.5;
  // head rides nearly ABOVE the torso — a big forward offset made everyone
  // look hunched with a long craned neck
  const headCx = cx + dir * H * 0.016 + lean * 0.55 + stoop * 0.5;
  const headCy = neckTopY - headH / 2 + headH * 0.17; // jaw overlaps the neck — no floating head
  const torsoCx = cx + dir * H * 0.02 + lean * 0.18;
  const shoulderY = torsoTopY + torsoH * 0.1 + upperArmW * 0.15;
  const handY = hipY + legH * 0.11;
  const elbowY = torsoTopY + torsoH * 0.64;
  const stride = swing * H * 0.108;
  const lift = Math.abs(swing) * H * 0.034;
  const footBaseY = baseY - H * 0.03;

  groundShadow(ctx, cx, footY, shoulderW * 0.42);
  drawSideBackHair(ctx, headCx, headCy, headW, headH, look, dir);

  // The FAR arm is drawn first, so the torso occludes it. In a true profile
  // the far arm is hidden by the body and only swings into view mid-stride —
  // drawing it on top left a stray limb pasted across everyone's back.
  const farElbowX = cx - dir * sideShoulderW * 0.26 + dir * stride * 0.28;
  const farHandX = cx - dir * sideShoulderW * 0.2 + dir * stride * 0.46;
  taperedLimb(ctx, cx - dir * sideShoulderW * 0.06, shoulderY, farElbowX, elbowY, upperArmW * 0.9, elbowW * 0.9, shade(look.shirt, 22));
  taperedLimb(ctx, farElbowX, elbowY, farHandX, handY, elbowW * 0.9, wristW * 0.9, shade(look.shirt, 16));
  jointCover(ctx, farElbowX, elbowY, elbowW * 0.88, shade(look.shirt, 16));
  drawHand(ctx, farHandX, handY, wristW * 1.2, wristW * 1.45, shade(look.skin, 22), -dir, -dir * 0.08);

  const farFootX = cx - dir * (sideHipW * 0.2 + stride * 0.58);
  const nearFootX = cx + dir * (sideHipW * 0.2 + stride);
  // lift phase is tied to the stride, NOT the facing — otherwise walking left
  // lifted the wrong foot (front-of-stride instead of back-of-stride)
  const farLift = swing > 0 ? lift : 0;
  const nearLift = swing < 0 ? lift : 0;
  const kneeY = hipY + legH * 0.5;
  const legFill = look.skirt ? look.skin : look.pants;
  const farKneeX = cx - dir * sideHipW * 0.13 - dir * stride * 0.2;
  const farKneeY = kneeY - farLift * 0.25;
  taperedLimb(ctx, cx - dir * sideHipW * 0.08, hipY - thighW * 0.2, farKneeX, farKneeY, thighW * 0.94, kneeW * 0.92, shade(legFill, 30));
  taperedLimb(ctx, farKneeX, farKneeY, farFootX, footBaseY - farLift, kneeW * 0.94, ankleW * 0.94, shade(legFill, 26));
  jointCover(ctx, farKneeX, farKneeY, kneeW * 0.9, shade(legFill, 26));
  sideShoe(ctx, farFootX + dir * footLen * 0.06, footBaseY - farLift + H * 0.017, dir, footLen * 0.94, H * 0.046, hgrad(ctx, farFootX - ankleW, footLen * 0.5, shade(look.shoes, 26)));

  if (look.skirt) {
    const skirtHemY = hipY + H * (look.child ? 0.035 : look.elder ? 0.095 : (look.pants === "#ffffff" || look.pants === "#f7f2ff") ? 0.085 : 0.065);
    taper(ctx, cx, torsoTopY + torsoH * 0.64, sideWaistW * 1.1, skirtHemY, sideHipW * 1.42, hgrad(ctx, cx - sideHipW * 0.7, sideHipW * 1.4, look.pants));
  } else {
    // Trousers in profile: the seat is the widest part of the lower body and
    // it sits BEHIND the waist — a symmetric block gave everyone a flat back.
    const waistY = torsoTopY + torsoH * 0.66;
    const seatY = hipY + H * 0.012;
    const front = dir * sideWaistW * 0.44;
    const back = -dir * sideHipW * 0.56;
    ctx.fillStyle = hgrad(ctx, cx - sideHipW * 0.6, sideHipW * 1.2, look.pants);
    ctx.beginPath();
    ctx.moveTo(cx + front, waistY);
    ctx.quadraticCurveTo(cx + dir * sideHipW * 0.46, hipY - (hipY - waistY) * 0.35, cx + dir * sideHipW * 0.4, seatY);
    ctx.lineTo(cx + back * 0.86, seatY);
    ctx.quadraticCurveTo(cx + back * 1.06, hipY - (hipY - waistY) * 0.34, cx - dir * sideWaistW * 0.46, waistY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
    // repaint the far thigh over the block so no hem line crosses it
    taperedLimb(ctx, cx - dir * sideHipW * 0.08, hipY - thighW * 0.2, farKneeX, farKneeY, thighW * 0.94, kneeW * 0.92, shade(look.pants, 30));
    // ...and re-cover the knee the repaint just crossed
    jointCover(ctx, farKneeX, farKneeY, kneeW * 0.9, shade(look.pants, 26));
  }
  // Neck BEFORE the torso and the head, so both junctions are hidden. In
  // profile it also rakes forward: the cervical spine leans, it is not vertical.
  {
    const neckTopX = headCx - dir * headW * 0.1;
    const neckBotX = torsoCx + dir * sideShoulderW * 0.06;
    const w = headW * 0.34;
    const topY = neckTopY - headH * 0.16;
    const botY = torsoTopY + headH * 0.18;
    const h = botY - topY;
    const g = ctx.createLinearGradient(neckBotX - w, 0, neckBotX + w, 0);
    g.addColorStop(0, shade(look.skin, dir > 0 ? 26 : 8));
    g.addColorStop(0.5, shade(look.skin, 12));
    g.addColorStop(1, shade(look.skin, dir > 0 ? 8 : 26));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(neckTopX - dir * w * 0.5, topY);
    ctx.quadraticCurveTo(neckBotX - dir * w * 0.62, topY + h * 0.6, neckBotX - dir * w * 0.7, botY);
    ctx.lineTo(neckBotX + dir * w * 0.86, botY);
    ctx.quadraticCurveTo(neckTopX + dir * w * 0.6, topY + h * 0.5, neckTopX + dir * w * 0.5, topY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(0.9, OUTLINE_W * 0.7);
    ctx.stroke();
  }

  // Anatomy-shaped profile torso (was a straight trapezoid): the ribcage
  // pushes the CHEST FORWARD, the back bows out under the shoulder blades and
  // tucks in at the lumbar — the S-line that makes a side view read human.
  {
    const waistY = torsoTopY + torsoH * 0.66;
    const wF = torsoCx + dir * sideWaistW * 0.5;
    const wB = torsoCx - dir * sideWaistW * 0.5;
    const sTopF = torsoCx + dir * sideShoulderW * 0.46;
    const sTopB = torsoCx - dir * sideShoulderW * 0.5;
    ctx.fillStyle = hgrad(ctx, torsoCx - sideShoulderW * 0.62, sideShoulderW * 1.24, look.shirt, 22, 22);
    ctx.beginPath();
    // Shoulder line in profile: the trapezius rises toward the neck root, then
    // the deltoid rolls forward and down. A flat dome across the top was what
    // made the profile read as a plank with a head on it.
    ctx.moveTo(sTopB, torsoTopY + torsoH * 0.075);
    ctx.quadraticCurveTo(torsoCx - dir * sideShoulderW * 0.26, torsoTopY - torsoH * 0.03, torsoCx + dir * sideShoulderW * 0.02, torsoTopY - torsoH * 0.005);
    ctx.quadraticCurveTo(torsoCx + dir * sideShoulderW * 0.3, torsoTopY + torsoH * 0.005, sTopF, torsoTopY + torsoH * 0.065);
    if (female && look.mature) {
      // The bust belongs to the torso OUTLINE, not to a lobe stuck on the
      // front: the chest swells out below the collarbone and the line runs
      // back in under it to the waist. Drawn separately it read as a satchel.
      // the swell belongs to the upper-middle third of the torso and is back on
      // the ribcage well above the waist — carried lower it read as a stomach
      const swell = sideShoulderW * (look.elder ? 0.68 : 0.84);
      ctx.bezierCurveTo(
        torsoCx + dir * swell,
        torsoTopY + torsoH * (look.elder ? 0.26 : 0.22),
        torsoCx + dir * swell * 0.8,
        torsoTopY + torsoH * 0.36,
        torsoCx + dir * sideWaistW * 0.56,
        torsoTopY + torsoH * 0.45
      );
      ctx.quadraticCurveTo(torsoCx + dir * sideWaistW * 0.48, torsoTopY + torsoH * 0.56, wF, waistY);
    } else {
      ctx.quadraticCurveTo(torsoCx + dir * sideShoulderW * 0.66, torsoTopY + torsoH * 0.24, wF, waistY);
    }
    ctx.lineTo(wB, waistY);
    ctx.quadraticCurveTo(torsoCx - dir * sideWaistW * 0.42, torsoTopY + torsoH * 0.48, torsoCx - dir * sideShoulderW * 0.56, torsoTopY + torsoH * 0.28);
    ctx.quadraticCurveTo(torsoCx - dir * sideShoulderW * 0.66, torsoTopY + torsoH * 0.1, sTopB, torsoTopY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  }
  if (female && look.mature) {
    // shading only — the silhouette itself now carries the bust (see above)
    const bustY = torsoTopY + torsoH * (look.elder ? 0.36 : 0.32);
    const frontX = torsoCx + dir * sideShoulderW * 0.42;
    const depth = sideShoulderW * (look.elder ? 0.2 : 0.3);
    const half = torsoH * (look.elder ? 0.09 : 0.115);
    ctx.save();
    ctx.globalAlpha = 0.4;
    ellipse(ctx, frontX + dir * depth * 0.45, bustY - half * 0.3, depth * 0.4, half * 0.42, tint(look.shirt, 26));
    ctx.globalAlpha = 0.3;
    // the crease beneath the bust
    ctx.strokeStyle = shade(look.shirt, 30);
    ctx.lineWidth = Math.max(0.8, sideShoulderW * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(frontX + dir * depth * 0.75, bustY + half * 0.9);
    ctx.quadraticCurveTo(frontX + dir * depth * 0.3, bustY + half * 1.2, frontX - dir * depth * 0.1, bustY + half * 1.05);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = Math.max(1, H * 0.012);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(torsoCx + dir * sideShoulderW * 0.2, torsoTopY + torsoH * 0.13);
  ctx.quadraticCurveTo(torsoCx + dir * sideWaistW * 0.34, torsoTopY + torsoH * 0.38, torsoCx + dir * sideWaistW * 0.18, torsoTopY + torsoH * 0.66);
  ctx.stroke();
  if (!look.child) {
    // a short collar hugging the base of the neck. Run down to a third of the
    // torso it read as a white slash painted across the shoulder.
    ctx.fillStyle = look.elder ? "#f4f0e6" : "#fff7e0";
    ctx.beginPath();
    ctx.moveTo(torsoCx + dir * sideShoulderW * 0.3, torsoTopY + torsoH * 0.01);
    ctx.quadraticCurveTo(torsoCx + dir * sideShoulderW * 0.16, torsoTopY + torsoH * 0.05, torsoCx + dir * sideShoulderW * 0.06, torsoTopY + torsoH * 0.11);
    ctx.lineTo(torsoCx + dir * sideShoulderW * 0.2, torsoTopY + torsoH * 0.13);
    ctx.quadraticCurveTo(torsoCx + dir * sideShoulderW * 0.3, torsoTopY + torsoH * 0.07, torsoCx + dir * sideShoulderW * 0.36, torsoTopY + torsoH * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(0.7, OUTLINE_W * 0.5);
    ctx.stroke();
    ctx.restore();
  }
  drawSideHeritageOutfitDetails(ctx, torsoCx, torsoTopY, torsoH, sideShoulderW, sideWaistW, headH, look, dir);

  const nearKneeX = cx + dir * sideHipW * 0.16 + dir * stride * 0.28;
  const nearKneeY = kneeY - nearLift * 0.28;
  taperedLimb(ctx, cx + dir * sideHipW * 0.07, hipY - thighW * 0.2, nearKneeX, nearKneeY, thighW, kneeW, legFill);
  taperedLimb(ctx, nearKneeX, nearKneeY, nearFootX, footBaseY - nearLift, kneeW * 1.02, ankleW, legFill);
  jointCover(ctx, nearKneeX, nearKneeY, kneeW, legFill);
  sideShoe(ctx, nearFootX + dir * footLen * 0.08, footBaseY - nearLift + H * 0.017, dir, footLen, H * 0.05, hgrad(ctx, nearFootX - ankleW, footLen * 0.5, look.shoes));
  if (look.skirt) {
    // a skirt hangs over BOTH legs — repaint it above the near thigh so only
    // the leg below the hem shows
    const hem2 = hipY + H * (look.child ? 0.035 : look.elder ? 0.095 : (look.pants === "#ffffff" || look.pants === "#f7f2ff") ? 0.085 : 0.065);
    taper(ctx, cx, torsoTopY + torsoH * 0.64, sideWaistW * 1.1, hem2, sideHipW * 1.42, hgrad(ctx, cx - sideHipW * 0.7, sideHipW * 1.4, look.pants));
  }

  // ...and the near arm swings BACK while the near leg strides forward.
  // It hangs on the VIEWER'S side of the ribcage, so it sits forward of the
  // body's mid-line — drawn down the centre it read as a handle bolted to the
  // torso rather than an arm beside it.
  const nearElbowX = cx + dir * sideShoulderW * 0.2 - dir * stride * 0.3;
  const nearHandX = cx + dir * sideShoulderW * 0.14 - dir * stride * 0.5;
  // the near arm is nudged a shade off the torso colour so it doesn't dissolve
  // into the shirt it hangs in front of
  // the shoulder end is a DELTOID — wider than the arm below it and seated
  // at the shoulder corner. A constant-width arm capped with a round arch
  // above the shoulder line read as a handle bolted to the chest.
  taperedLimb(ctx, cx + dir * sideShoulderW * 0.22, shoulderY + upperArmW * 0.45, nearElbowX, elbowY, upperArmW * 1.3, elbowW, tint(look.shirt, 8), INNER_OUTLINE);
  taperedLimb(ctx, nearElbowX, elbowY, nearHandX, handY, elbowW, wristW, tint(look.shirt, 12), INNER_OUTLINE);
  // a small deltoid crease where the arm meets the shoulder. The old version
  // was a big tinted disc that read as a ball strapped to the chest — the
  // tapered arm already provides the rounded shoulder cap.
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = shade(look.shirt, 26);
  ctx.lineWidth = Math.max(0.7, upperArmW * 0.1);
  ctx.beginPath();
  ctx.arc(cx + dir * sideShoulderW * 0.14, shoulderY + upperArmW * 0.1, upperArmW * 0.5, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.restore();
  // must match the forearm's own colour, or the cover shows as a pale disc
  jointCover(ctx, nearElbowX, elbowY, elbowW, tint(look.shirt, 12));
  ellipse(ctx, nearHandX, handY - wristW * 0.9, wristW * 0.6, wristW * 0.32, tint(look.shirt, 22));
  drawHand(ctx, nearHandX, handY, wristW * 1.32, wristW * 1.6, look.skin, dir, dir * 0.12);

  drawSideHead(ctx, headCx, headCy, headW, headH, look, dir);

  if (look.elder) {
    cane(ctx, nearHandX, handY, footY, cx + dir * shoulderW * 0.46, H);
  }
}

function drawSideHeritageOutfitDetails(
  ctx: CanvasRenderingContext2D,
  torsoCx: number,
  torsoTopY: number,
  torsoH: number,
  sideShoulderW: number,
  sideWaistW: number,
  headH: number,
  look: AvatarLook,
  dir: number
): void {
  if (look.outfitStyle === "western") return;
  const top = torsoTopY + headH * 0.08;
  const hem = torsoTopY + torsoH * 0.66;
  ctx.save();
  ctx.lineCap = "round";
  if (look.outfitStyle === "asian") {
    ctx.strokeStyle = "#ffd85f";
    ctx.lineWidth = Math.max(1, sideShoulderW * 0.06);
    ctx.beginPath();
    ctx.moveTo(torsoCx + dir * sideShoulderW * 0.18, top);
    ctx.quadraticCurveTo(torsoCx + dir * sideWaistW * 0.24, torsoTopY + torsoH * 0.33, torsoCx + dir * sideWaistW * 0.1, hem - 2);
    ctx.stroke();
  } else if (look.outfitStyle === "middleEastern") {
    ctx.strokeStyle = "#f2cf7a";
    ctx.lineWidth = Math.max(1, sideShoulderW * 0.065);
    ctx.beginPath();
    ctx.moveTo(torsoCx + dir * sideShoulderW * 0.04, top);
    ctx.lineTo(torsoCx + dir * sideWaistW * 0.04, hem - 1);
    ctx.stroke();
  } else if (look.outfitStyle === "africanDiaspora") {
    const colors = ["#ffcf33", "#e63946", "#118a5b"];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      const y = torsoTopY + torsoH * (0.22 + i * 0.14);
      ctx.fillRect(torsoCx - sideShoulderW * 0.22, y, sideShoulderW * 0.44, Math.max(1.1, torsoH * 0.018));
    }
  }
  ctx.restore();
}

function drawBackStanding(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  const female = look.gender === "female";
  const swing = motion.moving ? Math.sin(walkPhase) : 0;
  const bob = motion.moving ? Math.abs(Math.sin(walkPhase)) * H * 0.012 : Math.sin(walkPhase * 0.5) * H * 0.006;
  const stoop = look.elder ? H * 0.035 : 0;
  const baseY = footY - bob;
  const headH = H * look.headRatio;
  // head width : height is ~0.72 on adults, rounder on children — the old
  // 0.76 gave everyone a slightly squat, wide skull
  const headW = headH * (look.child ? 0.79 : 0.72) * (1 + look.chub * 0.05);
  const neckH = headH * (look.child ? 0.22 : 0.25); // short, natural neck
  const torsoH = (H - headH - neckH) * (look.child ? 0.46 : 0.44); // legs a touch shorter — real torso:leg ratio
  const legH = Math.max(H * 0.22, H - headH - neckH - torsoH);
  const build = bodyBreadths(look);
  const shoulderW = build.shoulder;
  const waistW = build.waist;
  const hipW = build.hip;
  const thighW = H * (0.076 + look.chub * 0.022);
  const kneeW = thighW * 0.72;
  const ankleW = thighW * 0.5;
  const upperArmW = H * (0.05 + look.chub * 0.014);
  const elbowW = upperArmW * 0.8;
  const wristW = upperArmW * 0.56;
  const legW = thighW;
  const armW = upperArmW;
  const footLen = H * 0.15;
  const legFill = look.skirt ? look.skin : look.pants;
  const hipY = baseY - legH;
  const torsoTopY = hipY - torsoH + stoop;
  const waistY = torsoTopY + torsoH * 0.7;
  const shoulderY2 = torsoTopY + torsoH * 0.1;
  const neckTopY = torsoTopY - neckH + stoop * 0.5;
  const headCx = cx;
  const headCy = neckTopY - headH / 2 + headH * 0.09;
  const stride = swing * H * 0.068;
  const lift = Math.abs(swing) * H * 0.032;
  const hipTilt = swing * H * 0.008;
  const shoulderTilt = -hipTilt * 0.75;
  const shoeY = baseY - H * 0.03;
  const kneeY = hipY + legH * 0.5;

  groundShadow(ctx, cx, footY, shoulderW * 0.48);

  // legs converge from the femur heads toward the ankles, matching the front view
  const drawBackLegs = (): void => {
    for (const side of [-1, 1] as const) {
      const lifted = side < 0 ? swing > 0 : swing < 0;
      const liftY = lifted ? lift : 0;
      const hipX = cx + side * hipW * 0.24;
      const kneeX = cx + side * hipW * 0.17 + side * stride * 0.22;
      const footX = cx + side * hipW * 0.15 + side * stride * 0.62;
      const kY = kneeY - liftY * 0.3;
      taperedLimb(ctx, hipX, hipY - thighW * 0.25 + side * hipTilt, kneeX, kY, thighW, kneeW, shade(legFill, 5));
      taperedLimb(ctx, kneeX, kY, footX, shoeY - liftY, kneeW * 1.02, ankleW, legFill);
      jointCover(ctx, kneeX, kY, kneeW, legFill);
      frontShoe(ctx, footX + side * ankleW * 0.12, shoeY + H * 0.016 - liftY, side, footLen * 0.42, H * 0.056, hgrad(ctx, footX - ankleW, footLen * 0.4, look.shoes));
    }
  };
  drawBackLegs();

  if (look.skirt) {
    const skirtHemY = hipY + H * (look.child ? 0.035 : look.elder ? 0.095 : (look.pants === "#ffffff" || look.pants === "#f7f2ff") ? 0.085 : 0.065);
    const flare = hipW * 0.7;
    ctx.fillStyle = hgrad(ctx, cx - flare, flare * 2, look.pants);
    ctx.beginPath();
    ctx.moveTo(cx - waistW * 0.48, waistY);
    ctx.quadraticCurveTo(cx - hipW * 0.54, hipY - (hipY - waistY) * 0.1, cx - flare, skirtHemY);
    ctx.quadraticCurveTo(cx, skirtHemY + hipW * 0.12, cx + flare, skirtHemY);
    ctx.quadraticCurveTo(cx + hipW * 0.54, hipY - (hipY - waistY) * 0.1, cx + waistW * 0.48, waistY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  } else {
    pelvis(ctx, cx, waistY, waistW * 0.5, hipY + thighW * 0.14, hipW * 0.5, hgrad(ctx, cx - hipW / 2, hipW, look.pants));
    // trousers: repaint the legs over the block so no hem crosses them
    drawBackLegs();
  }
  // neck first — the shirt hides its base, the skull hides its top
  neckColumn(ctx, cx, neckTopY - headH * 0.16, torsoTopY + headH * 0.16, headW * 0.34, look.skin, true);
  humanTorso(ctx, cx, torsoTopY, headW * 0.3, shoulderY2, shoulderW * 0.5, waistY, waistW * 0.5, 0, hgrad(ctx, cx - shoulderW / 2, shoulderW, look.shirt, 20, 24), female && build.maturity > 0.55);

  const shoulderY = shoulderY2 + upperArmW * 0.15;
  const elbowY = waistY - torsoH * 0.06;
  const handY = hipY + legH * 0.11;
  // arms hang at the sides (matching the front view) — hands beside the hips
  const backElbowX = (s: number): number => cx + s * (waistW * 0.5 + elbowW * 0.3) - s * stride * 0.22;
  const backHandX = (s: number): number => cx + s * (hipW * 0.44 + wristW * 0.3) - s * stride * 0.45;
  for (const s of [-1, 1] as const) {
    taperedLimb(ctx, cx + s * shoulderW * 0.4, shoulderY + s * shoulderTilt, backElbowX(s), elbowY, upperArmW, elbowW, shade(look.shirt, 8));
    taperedLimb(ctx, backElbowX(s), elbowY, backHandX(s), handY, elbowW, wristW, look.shirt);
    jointCover(ctx, backElbowX(s), elbowY, elbowW, look.shirt);
    ellipse(ctx, backHandX(s), handY - wristW * 0.95, wristW * 0.62, wristW * 0.32, tint(look.shirt, 22));
    drawHand(ctx, backHandX(s), handY, wristW * 1.3, wristW * 1.58, look.skin, s, s * 0.06);
  }

  drawBackHead(ctx, headCx, headCy, headW, headH, look);

  if (look.elder) {
    cane(ctx, backHandX(1), handY, footY, cx + shoulderW * 0.64, H);
  }
}

function drawBackHead(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  const top = hcy - hh / 2;
  const hair = look.hair;
  const hairD = shade(hair, 22);
  const hairL = tint(hair, 28);
  const skin = look.skin;
  const skinD = shade(skin, 18);
  const stroke = (): void => {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  };

  // The cranium is at its WIDEST seen from behind (the parietal bones), so the
  // back of the head is marginally broader than the front view — it used to be
  // drawn narrower, which made everyone look pin-headed from behind.
  const bw = hw * 1.02;

  const longHair = look.hairStyle === "long";

  // Skull: a real cranium, widest at mid-height, curving in at the occiput to
  // the nape. Ears sit on its sides — long hair covers them from behind.
  if (!longHair) {
    drawEar(ctx, hcx - bw * 0.49, hcy + hh * 0.06, hw * 0.085, hh * 0.11, skin, true);
    drawEar(ctx, hcx + bw * 0.49, hcy + hh * 0.06, hw * 0.085, hh * 0.11, skin, true);
  }
  const sg = ctx.createRadialGradient(hcx - bw * 0.16, hcy - hh * 0.2, bw * 0.12, hcx, hcy, bw * 0.7);
  sg.addColorStop(0, tint(skin, 6));
  sg.addColorStop(0.7, skin);
  sg.addColorStop(1, shade(skin, 12));
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(hcx - bw * 0.48, hcy - hh * 0.04);
  ctx.quadraticCurveTo(hcx - bw * 0.5, hcy - hh * 0.42, hcx - bw * 0.24, hcy - hh * 0.52);
  ctx.quadraticCurveTo(hcx, hcy - hh * 0.58, hcx + bw * 0.24, hcy - hh * 0.52);
  ctx.quadraticCurveTo(hcx + bw * 0.5, hcy - hh * 0.42, hcx + bw * 0.48, hcy - hh * 0.04);
  ctx.quadraticCurveTo(hcx + bw * 0.44, hcy + hh * 0.26, hcx + bw * 0.2, hcy + hh * 0.42);
  ctx.quadraticCurveTo(hcx, hcy + hh * 0.5, hcx - bw * 0.2, hcy + hh * 0.42);
  ctx.quadraticCurveTo(hcx - bw * 0.44, hcy + hh * 0.26, hcx - bw * 0.48, hcy - hh * 0.04);
  ctx.closePath();
  ctx.fill();
  stroke();

  // Crown cap. On short hair it stops at the nape hairline; on long hair it
  // runs lower so it OVERLAPS the curtain below and the two merge into one mass.
  const capPiece: HairPiece = (c) => {
    c.moveTo(hcx - bw * 0.5, hcy + hh * 0.16);
    c.quadraticCurveTo(hcx - bw * 0.56, top - hh * 0.1, hcx, top - hh * 0.16);
    c.quadraticCurveTo(hcx + bw * 0.56, top - hh * 0.1, hcx + bw * 0.5, hcy + hh * 0.16);
    if (longHair) {
      c.quadraticCurveTo(hcx + bw * 0.4, hcy + hh * 0.6, hcx, hcy + hh * 0.66);
      c.quadraticCurveTo(hcx - bw * 0.4, hcy + hh * 0.6, hcx - bw * 0.5, hcy + hh * 0.16);
    } else {
      // nape hairline: a shallow V, higher at the sides than in the middle
      c.quadraticCurveTo(hcx + bw * 0.34, hcy + hh * 0.34, hcx + bw * 0.12, hcy + hh * 0.3);
      c.quadraticCurveTo(hcx, hcy + hh * 0.36, hcx - bw * 0.12, hcy + hh * 0.3);
      c.quadraticCurveTo(hcx - bw * 0.34, hcy + hh * 0.34, hcx - bw * 0.5, hcy + hh * 0.16);
    }
    c.closePath();
  };

  // Long hair: narrows to skull width at the crown, spreads past the shoulders,
  // uneven hem. Its top starts ABOVE the cap's lower edge so the two overlap —
  // drawn as a detached curtain, a bare strip of neck showed between them.
  const curtainPiece: HairPiece = (c) => {
    c.moveTo(hcx - bw * 0.44, top + hh * 0.1);
    c.quadraticCurveTo(hcx - bw * 0.78, hcy + hh * 0.4, hcx - bw * 0.62, hcy + hh * 1.0);
    // uneven hem, cut left → right with a lower centre tail
    c.quadraticCurveTo(hcx - bw * 0.56, hcy + hh * 1.24, hcx - bw * 0.3, hcy + hh * 1.28);
    c.quadraticCurveTo(hcx - bw * 0.12, hcy + hh * 1.46, hcx + bw * 0.06, hcy + hh * 1.44);
    c.quadraticCurveTo(hcx + bw * 0.26, hcy + hh * 1.34, hcx + bw * 0.36, hcy + hh * 1.2);
    c.quadraticCurveTo(hcx + bw * 0.58, hcy + hh * 1.16, hcx + bw * 0.62, hcy + hh * 1.0);
    c.quadraticCurveTo(hcx + bw * 0.78, hcy + hh * 0.4, hcx + bw * 0.44, top + hh * 0.1);
    c.closePath();
  };

  hairRegion(ctx, longHair ? [curtainPiece, capPiece] : [capPiece], hair);

  if (longHair) {
    // two tonal bands so the curtain has depth instead of reading flat. Kept
    // close to the base colour — a big tone jump reads as a second wig.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = shade(hair, 26);
    ctx.beginPath();
    ctx.moveTo(hcx + bw * 0.1, hcy + hh * 0.15);
    ctx.quadraticCurveTo(hcx + bw * 0.5, hcy + hh * 0.6, hcx + bw * 0.4, hcy + hh * 1.2);
    ctx.quadraticCurveTo(hcx + bw * 0.2, hcy + hh * 0.7, hcx + bw * 0.1, hcy + hh * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = tint(hair, 28);
    ctx.beginPath();
    ctx.moveTo(hcx - bw * 0.26, hcy + hh * 0.1);
    ctx.quadraticCurveTo(hcx - bw * 0.56, hcy + hh * 0.6, hcx - bw * 0.46, hcy + hh * 1.1);
    ctx.quadraticCurveTo(hcx - bw * 0.34, hcy + hh * 0.6, hcx - bw * 0.26, hcy + hh * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // hair falling from the crown — kept faint and fanned, or the three hard
  // vertical lines read as seams in a wig
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = hairD;
  ctx.lineWidth = Math.max(0.8, hw * 0.026);
  ctx.lineCap = "round";
  for (const x of [-0.3, -0.12, 0.12, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(hcx + hw * x * 0.5, top + hh * 0.0);
    ctx.quadraticCurveTo(hcx + hw * (x * 0.9), hcy + hh * 0.1, hcx + hw * (x * 1.05), hcy + hh * 0.26);
    ctx.stroke();
  }
  ctx.restore();

  if (!look.elder) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ellipse(ctx, hcx - hw * 0.1, top + hh * 0.03, hw * 0.28, hh * 0.065, hairL);
    ctx.restore();
  }
  drawHairTexture(ctx, hcx, hcy, hw, hh, look);

  if (look.hairStyle === "bun") {
    ellipse(ctx, hcx, top - hh * 0.12, hw * 0.27, hh * 0.22, hair);
    ctx.beginPath();
    ctx.ellipse(hcx, top - hh * 0.12, hw * 0.27, hh * 0.22, 0, 0, Math.PI * 2);
    stroke();
  }
}

function drawSideBackHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook, dir: number): void {
  if (look.hairStyle !== "long") return;
  const top = hcy - hh / 2;
  ctx.fillStyle = shade(look.hair, 24);
  ctx.beginPath();
  ctx.moveTo(hcx - dir * hw * 0.28, top + hh * 0.08);
  ctx.quadraticCurveTo(hcx - dir * hw * 0.7, hcy + hh * 0.26, hcx - dir * hw * 0.58, hcy + hh * 0.82);
  ctx.quadraticCurveTo(hcx - dir * hw * 0.5, hcy + hh * 1.1, hcx - dir * hw * 0.2, hcy + hh * 1.16);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.16, hcy + hh * 1.04, hcx + dir * hw * 0.28, hcy + hh * 0.5);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.34, top + hh * 0.22, hcx - dir * hw * 0.28, top + hh * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

function drawHairTexture(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook, dir = 0): void {
  if (look.elder) return;
  const top = hcy - hh / 2;
  // strands stay strictly WITHIN the hair cap — long ones used to spill down
  // over the forehead and cheeks and read as scratches on the face
  if (look.hairTexture === "straight") {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = tint(look.hair, 24);
    ctx.lineWidth = Math.max(0.8, hw * 0.018);
    ctx.lineCap = "round";
    for (const x of [-0.22, 0, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(hcx + hw * x, top + hh * 0.0);
      ctx.lineTo(hcx + hw * (x * 0.9), top + hh * 0.09);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (look.hairTexture === "wavy") {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = tint(look.hair, 22);
    ctx.lineWidth = Math.max(0.9, hw * 0.02);
    ctx.lineCap = "round";
    for (const x of [-0.28, -0.08, 0.12, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(hcx + hw * x, top + hh * 0.0);
      ctx.quadraticCurveTo(hcx + hw * (x + 0.05), top + hh * 0.05, hcx + hw * (x - 0.02), top + hh * 0.09);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (look.hairTexture !== "coily") return;

  const points = [
    [-0.42, 0.24], [-0.32, 0.08], [-0.18, -0.02], [0, -0.04], [0.18, -0.02], [0.32, 0.08], [0.42, 0.24],
    [-0.36, 0.36], [-0.12, 0.18], [0.12, 0.18], [0.36, 0.36],
  ];
  ctx.save();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < points.length; i++) {
    const [px0, py0] = points[i];
    const sideShift = dir ? dir * Math.abs(px0) * 0.32 : 0;
    const x = hcx + hw * (px0 + sideShift);
    const y = top + hh * py0;
    const fill = i % 3 === 0 ? tint(look.hair, 12) : i % 2 === 0 ? look.hair : shade(look.hair, 8);
    ellipse(ctx, x, y, hw * 0.095, hh * 0.07, fill);
  }
  ctx.restore();
}

function drawSideHead(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook, dir: number): void {
  const skin = look.skin;
  const skinD = shade(skin, 20);
  const top = hcy - hh / 2;
  const hair = look.hair;
  const hairL = tint(hair, 28);
  const headRx = hw * 0.58; // skulls are DEEPER than wide in profile
  const headRy = hh * 0.5;
  const bx = (f: number): number => hcx + dir * headRx * f;
  const by = (f: number): number => hcy + headRy * f;
  const hg = ctx.createRadialGradient(hcx - dir * hw * 0.12, hcy - hh * 0.2, hw * 0.12, hcx, hcy, hw * 0.68);
  hg.addColorStop(0, tint(skin, 10));
  hg.addColorStop(0.7, skin);
  hg.addColorStop(1, shade(skin, 8));

  ctx.fillStyle = hg;
  ctx.beginPath();
  // A real profile is a sequence of landmarks — forehead, brow, nose bridge,
  // nose tip, the notch under it, lips, then the chin — not one smooth arc
  // with a bump. Without them a side view just reads as an egg.
  ctx.moveTo(bx(-0.78), by(0.05));
  ctx.quadraticCurveTo(bx(-0.8), by(-0.72), bx(0.02), by(-0.99)); // crown
  ctx.quadraticCurveTo(bx(0.7), by(-0.88), bx(0.72), by(-0.3)); // forehead
  ctx.quadraticCurveTo(bx(0.62), by(-0.2), bx(0.66), by(-0.1)); // brow into the bridge
  ctx.quadraticCurveTo(bx(0.96), by(-0.02), bx(0.9), by(0.1)); // nose tip
  ctx.quadraticCurveTo(bx(0.84), by(0.15), bx(0.66), by(0.16)); // notch under the nose
  ctx.quadraticCurveTo(bx(0.74), by(0.24), bx(0.68), by(0.32)); // lips
  ctx.quadraticCurveTo(bx(0.62), by(0.37), bx(0.7), by(0.46)); // chin
  ctx.quadraticCurveTo(bx(0.6), by(0.62), bx(0.28), by(0.67)); // under the chin
  ctx.quadraticCurveTo(bx(-0.4), by(0.64), bx(-0.78), by(0.05)); // jawline back to the ear
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,70,58,0.24)";
  ctx.lineWidth = Math.max(0.8, hw * 0.018);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hcx + dir * hw * 0.19, hcy + hh * 0.39);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.36, hcy + hh * 0.52, hcx + dir * hw * 0.1, hcy + hh * 0.68);
  ctx.stroke();
  // a real ear ON the head, just behind centre (it used to hang off the very
  // back of the skull like a knob)
  // a modest ear at jaw height — long hair covers it entirely
  if (look.hairStyle !== "long") {
    drawEar(ctx, hcx - dir * hw * 0.18, hcy + hh * 0.07, hw * 0.07, hh * 0.095, skin);
  }

  // Compact cap and bangs: enough to show direction without hiding the face.
  // The cap follows the skull, then a SIDE-SWEPT FRINGE falls forward over the
  // forehead and tapers back toward the temple — real hair covers the brow at
  // the front and lifts at the part. A cap that stopped level with the hairline
  // left a bald forehead; one drawn lower sat across the eyes like a helmet.
  const sideCap: HairPiece = (c) => {
    c.moveTo(bx(-0.88), by(-0.04));
    c.quadraticCurveTo(bx(-0.86), by(-1.08), bx(0.02), by(-1.1));
    c.quadraticCurveTo(bx(0.62), by(-1.02), bx(0.72), by(-0.5));
    // fringe: down the forehead to just above the brow, with a soft point
    c.quadraticCurveTo(bx(0.78), by(-0.32), bx(0.66), by(-0.22));
    c.quadraticCurveTo(bx(0.52), by(-0.44), bx(0.22), by(-0.46));
    c.quadraticCurveTo(bx(-0.16), by(-0.44), bx(-0.42), by(-0.3));
    c.quadraticCurveTo(bx(-0.7), by(-0.18), bx(-0.88), by(-0.04));
    c.closePath();
  };

  // hair continues down the BACK of the skull to the nape — the crown-only cap
  // left bare skin behind the ear, which read as a swim cap
  // covers the whole occiput down to the nape and stops just behind the ear,
  // the way a real short hairline runs — the old narrow wedge left a bare
  // patch of scalp between the cap and the neck
  const sideNape: HairPiece = (c) => {
    c.moveTo(bx(-0.88), by(-0.16));
    c.quadraticCurveTo(bx(-0.94), by(0.28), bx(-0.6), by(0.52));
    c.quadraticCurveTo(bx(-0.5), by(0.46), bx(-0.46), by(0.3));
    c.quadraticCurveTo(bx(-0.44), by(0.04), bx(-0.3), by(-0.16));
    c.quadraticCurveTo(bx(-0.52), by(-0.36), bx(-0.88), by(-0.16));
    c.closePath();
  };

  // one soft fringe sweep hugging the temple (pointed locks stuck off the crown
  // like a bow once shortened — a single smooth sweep reads as a real hairline).
  // Adults only: on small child/elder heads it detaches and floats.
  const sweepLen = look.hairStyle === "long" ? 0.16 : 0.07;
  const sideSweep: HairPiece = (c) => {
    c.moveTo(bx(0.26), by(-0.62));
    c.quadraticCurveTo(bx(0.64), by(-0.54), bx(0.6), by(-(0.38 - sweepLen)));
    c.quadraticCurveTo(bx(0.48), by(-(0.32 - sweepLen * 0.4)), bx(0.36), by(-(0.44 - sweepLen * 0.4)));
    c.quadraticCurveTo(bx(0.24), by(-0.52), bx(0.26), by(-0.62));
    c.closePath();
  };

  // cap, nape and temple sweep drawn as ONE region, so no seam or tone break
  // shows where the pieces meet
  const sidePieces: HairPiece[] = [sideCap];
  if (look.hairStyle !== "long") sidePieces.push(sideNape);
  if (!look.child && !look.elder) sidePieces.push(sideSweep);
  hairRegion(ctx, sidePieces, hair);

  if (!look.elder) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ellipse(ctx, hcx - dir * hw * 0.03, top + hh * 0.01, hw * 0.22, hh * 0.055, hairL);
    ctx.restore();
  }
  drawHairTexture(ctx, hcx - dir * hw * 0.04, hcy, hw * 0.92, hh, look, dir);
  if (look.hairStyle === "bun") {
    ellipse(ctx, hcx - dir * hw * 0.38, top - hh * 0.06, hw * 0.22, hh * 0.18, hair);
    ctx.beginPath();
    ctx.ellipse(hcx - dir * hw * 0.38, top - hh * 0.06, hw * 0.22, hh * 0.18, 0, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  }

  // Every feature below is placed in the SAME landmark space as the silhouette
  // above (bx/by), so it is guaranteed to sit inside the skull. The old code
  // positioned them in raw hw/hh fractions, which is why the eye, nose and
  // mouth floated off the front of the face.
  const eyeR = hw * (look.child ? 0.1 : 0.082);
  const eyeX = bx(0.4);
  const eyeY = by(look.child ? -0.02 : -0.05);

  // In profile you see the eye edge-on: a narrow wedge, widest at the back,
  // tapering to the tear duct at the front. A round eyeball reads as a sticker.
  ctx.fillStyle = "#fff8ee";
  ctx.beginPath();
  ctx.moveTo(eyeX + dir * eyeR * 0.95, eyeY + eyeR * 0.1);
  ctx.quadraticCurveTo(eyeX, eyeY - eyeR * 1.05, eyeX - dir * eyeR * 0.85, eyeY - eyeR * 0.2);
  ctx.quadraticCurveTo(eyeX - dir * eyeR * 0.5, eyeY + eyeR * 0.85, eyeX + dir * eyeR * 0.95, eyeY + eyeR * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ellipse(ctx, eyeX + dir * eyeR * 0.3, eyeY + eyeR * 0.02, eyeR * 0.62, eyeR * 0.78, look.elder ? "#6b6b74" : (look.iris ?? "#4a3526"));
  ellipse(ctx, eyeX + dir * eyeR * 0.38, eyeY + eyeR * 0.06, eyeR * 0.3, eyeR * 0.42, "#1b1622");
  ctx.restore();
  // upper lid, heavier at the front where the lashes are
  const femaleFace = look.gender === "female";
  ctx.strokeStyle = femaleFace ? "rgba(36,20,24,0.92)" : "rgba(52,32,30,0.8)";
  ctx.lineWidth = Math.max(0.9, eyeR * (femaleFace ? 0.34 : 0.2));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(eyeX + dir * eyeR * 0.95, eyeY + eyeR * 0.08);
  ctx.quadraticCurveTo(eyeX, eyeY - eyeR * 1.05, eyeX - dir * eyeR * 0.85, eyeY - eyeR * 0.22);
  ctx.stroke();
  if (femaleFace && !look.elder) {
    // in profile the lashes are at their most visible — they sweep FORWARD off
    // the front corner of the eye
    ctx.strokeStyle = "rgba(30,18,22,0.88)";
    for (const [x0, y0, x1, y1] of [
      [0.85, -0.35, 1.6, -0.72],
      [0.95, -0.1, 1.75, -0.34],
      [0.9, 0.12, 1.62, 0.06],
    ]) {
      ctx.lineWidth = Math.max(0.8, eyeR * 0.16);
      ctx.beginPath();
      ctx.moveTo(eyeX + dir * eyeR * x0, eyeY + eyeR * y0);
      ctx.quadraticCurveTo(eyeX + dir * eyeR * (x0 + x1) * 0.5, eyeY + eyeR * (y0 + y1) * 0.42, eyeX + dir * eyeR * x1, eyeY + eyeR * y1);
      ctx.stroke();
    }
  }
  // brow, following the brow ridge of the silhouette
  ctx.strokeStyle = shade(hair, 10);
  ctx.lineWidth = hw * 0.032;
  ctx.beginPath();
  ctx.moveTo(bx(0.56), by(-0.24));
  ctx.quadraticCurveTo(bx(0.34), by(-0.34), bx(0.06), by(-0.26));
  ctx.stroke();

  // nostril + the crease where the nose meets the cheek — the protruding nose
  // itself is already part of the head outline
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = skinD;
  ctx.lineWidth = Math.max(0.8, hw * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx(0.74), by(0.12));
  ctx.lineTo(bx(0.62), by(0.13));
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(0.7, hw * 0.02);
  ctx.beginPath();
  ctx.moveTo(bx(0.58), by(0.14));
  ctx.quadraticCurveTo(bx(0.48), by(0.24), bx(0.5), by(0.32));
  ctx.stroke();
  ctx.restore();

  // mouth: tucked just behind the lip landmark, above the chin
  ctx.strokeStyle = look.gender === "female" ? "#d9707f" : "#bb6a62";
  ctx.lineWidth = hw * (look.child ? 0.045 : 0.034);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx(0.64), by(0.31));
  ctx.quadraticCurveTo(bx(0.48), by(0.35), bx(0.32), by(0.31));
  ctx.stroke();
  if (femaleFace && !look.elder) {
    // a fuller lower lip, so the profile reads female too
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = hw * 0.026;
    ctx.beginPath();
    ctx.moveTo(bx(0.62), by(0.355));
    ctx.quadraticCurveTo(bx(0.5), by(0.4), bx(0.36), by(0.355));
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,140,160,0.16)";
  ctx.beginPath();
  ctx.ellipse(bx(0.26), by(0.12), hw * 0.08, hh * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.elder) {
    ctx.strokeStyle = "rgba(70,70,80,0.9)";
    ctx.lineWidth = hw * 0.035;
    ctx.beginPath();
    ctx.ellipse(eyeX + dir * eyeR * 0.1, eyeY, eyeR * 1.5, eyeR * 1.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeX - dir * eyeR * 1.4, eyeY);
    ctx.lineTo(bx(-0.2), by(0.02));
    ctx.stroke();
  }
}

/** The long-hair layer that flows behind the head — drawn BEFORE the head. */
function drawBackHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  if (look.hairStyle !== "long") return;
  const top = hcy - hh / 2;
  // Kept close to the cap colour — 22 shades darker made the back layer read
  // as a separate wig where it met the crown.
  ctx.fillStyle = shade(look.hair, 8);
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.42, top + hh * 0.16);
  // left: poof out past the cheek (only the narrow neck is in front here, so this
  // is the clearly-visible part) then fall as a long curtain down behind the body
  ctx.quadraticCurveTo(hcx - hw * 0.7, hcy + hh * 0.45, hcx - hw * 0.66, hcy + hh * 0.92);
  ctx.quadraticCurveTo(hcx - hw * 0.62, hcy + hh * 1.28, hcx - hw * 0.42, hcy + hh * 1.42);
  // inner hem scoops up under the chin (this stretch sits behind the torso)
  ctx.quadraticCurveTo(hcx, hcy + hh * 1.22, hcx + hw * 0.42, hcy + hh * 1.42);
  // right curtain back up to the crown
  ctx.quadraticCurveTo(hcx + hw * 0.62, hcy + hh * 1.28, hcx + hw * 0.66, hcy + hh * 0.92);
  ctx.quadraticCurveTo(hcx + hw * 0.7, hcy + hh * 0.45, hcx + hw * 0.42, top + hh * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  // gentle inner strands give the curtain flow — it read as a flat slab before
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = shade(look.hair, 30);
  ctx.lineWidth = Math.max(0.9, hw * 0.03);
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hcx + s * hw * 0.52, hcy + hh * 0.3);
    ctx.quadraticCurveTo(hcx + s * hw * 0.62, hcy + hh * 0.75, hcx + s * hw * 0.5, hcy + hh * 1.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hcx + s * hw * 0.44, hcy + hh * 0.45);
    ctx.quadraticCurveTo(hcx + s * hw * 0.5, hcy + hh * 0.85, hcx + s * hw * 0.42, hcy + hh * 1.24);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  const hair = look.hair;
  const hairD = shade(hair, 22);
  const hairL = tint(hair, 30);
  const top = hcy - hh / 2;
  const longHair = look.hairStyle === "long";
  const stroke = (): void => { ctx.strokeStyle = OUTLINE; ctx.lineWidth = OUTLINE_W; ctx.stroke(); };
  // NOTE: the long-hair back layer is drawn earlier, BEHIND the head (drawBackHair),
  // so it never paints over the face.

  const fr = longHair ? 0.3 : 0.19; // fringe depth below the crown

  // main hair cap with volume above the crown
  const capPiece: HairPiece = (c) => {
    c.moveTo(hcx - hw * 0.52, top + hh * 0.42);
    c.quadraticCurveTo(hcx - hw * 0.56, top - hh * 0.18, hcx, top - hh * 0.2);
    c.quadraticCurveTo(hcx + hw * 0.56, top - hh * 0.18, hcx + hw * 0.52, top + hh * 0.42);
    c.quadraticCurveTo(hcx + hw * 0.24, top + hh * 0.12, hcx, top + hh * 0.16);
    c.quadraticCurveTo(hcx - hw * 0.24, top + hh * 0.12, hcx - hw * 0.52, top + hh * 0.42);
    c.closePath();
  };

  // fringe over the forehead — ONE soft scalloped band (the old per-lock teeth
  // read as dark spikes hanging over the face). A single silhouette outline,
  // gentle waves along the lower edge, and a natural side part.
  const fringePiece: HairPiece = (c) => {
    c.moveTo(hcx - hw * 0.47, top + hh * 0.34);
    c.quadraticCurveTo(hcx - hw * 0.5, top + hh * 0.02, hcx - hw * 0.18, top - hh * 0.01);
    c.quadraticCurveTo(hcx, top - hh * 0.02, hcx + hw * 0.18, top - hh * 0.01);
    c.quadraticCurveTo(hcx + hw * 0.5, top + hh * 0.02, hcx + hw * 0.47, top + hh * 0.34);
    // Lower edge, right → left: a SIDE-SWEPT diagonal, low over one brow and
    // lifting to the part on the other side. A level edge across the forehead is
    // what made the fringe read as a headband glued to the head.
    c.quadraticCurveTo(hcx + hw * 0.42, top + hh * (fr + 0.13), hcx + hw * 0.28, top + hh * (fr + 0.11));
    c.quadraticCurveTo(hcx + hw * 0.14, top + hh * (fr + 0.09), hcx + hw * 0.0, top + hh * (fr + 0.02));
    c.quadraticCurveTo(hcx - hw * 0.14, top + hh * (fr - 0.05), hcx - hw * 0.28, top + hh * (fr - 0.09));
    c.quadraticCurveTo(hcx - hw * 0.4, top + hh * (fr - 0.11), hcx - hw * 0.47, top + hh * 0.34);
    c.closePath();
  };

  // temple blocks beside the eyes. Long cheek-side blocks read as a beard on
  // the small male sprites, so boys/men stay clean-shaven.
  const templePiece = (s: number): HairPiece => (c) => {
    c.moveTo(hcx + s * hw * 0.43, top + hh * 0.26);
    c.quadraticCurveTo(hcx + s * hw * 0.57, top + hh * 0.35, hcx + s * hw * 0.5, top + hh * 0.5);
    c.lineTo(hcx + s * hw * 0.4, top + hh * 0.49);
    c.quadraticCurveTo(hcx + s * hw * 0.45, top + hh * 0.36, hcx + s * hw * 0.34, top + hh * 0.28);
    c.closePath();
  };

  // Every piece drawn as ONE region so no seam or colour break shows between
  // the cap, the fringe and the temple blocks.
  const pieces: HairPiece[] = [capPiece];
  if (!look.elder) pieces.push(fringePiece);
  if (!longHair) pieces.push(templePiece(-1), templePiece(1));
  hairRegion(ctx, pieces, hair);

  if (!look.elder) {
  // the part, and a faint under-edge shadow for depth
  ctx.strokeStyle = shade(hair, 34);
  ctx.lineWidth = Math.max(0.8, hw * 0.025);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.2, top - hh * 0.01);
  ctx.quadraticCurveTo(hcx - hw * 0.3, top + hh * (fr * 0.5), hcx - hw * 0.36, top + hh * (fr - 0.02));
  ctx.stroke();
  ctx.strokeStyle = `rgba(20,12,10,0.18)`;
  ctx.lineWidth = Math.max(0.8, hw * 0.02);
  ctx.beginPath();
  ctx.moveTo(hcx + hw * 0.26, top + hh * (fr + 0.09));
  ctx.quadraticCurveTo(hcx + hw * 0.1, top + hh * (fr + 0.05), hcx - hw * 0.02, top + hh * fr);
  ctx.stroke();
  }

  // glossy highlight band across the crown
  if (!look.elder) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hairL;
    ctx.beginPath();
    ctx.ellipse(hcx - hw * 0.05, top + hh * 0.02, hw * 0.33, hh * 0.08, -0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawHairTexture(ctx, hcx, hcy, hw, hh, look);

  if (look.hairStyle === "bun") {
    ellipse(ctx, hcx, top - hh * 0.16, hw * 0.27, hh * 0.23, hair);
    ctx.beginPath();
    ctx.ellipse(hcx, top - hh * 0.16, hw * 0.27, hh * 0.23, 0, 0, Math.PI * 2);
    stroke();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  const big = look.child;
  const female = look.gender === "female";
  const iris = look.elder ? "#6b6b74" : (look.iris ?? "#3b6f9d");
  const lip = female ? "#d9707f" : "#8c5c52";
  const skinD = shade(look.skin, 26);
  // women read as women partly through bigger, rounder eyes set slightly wider
  const eyeR = hw * (big ? 0.13 : female ? 0.108 : 0.09);
  const eyeY = hcy + hh * (big ? 0.055 : 0.025);
  const eyeDX = hw * (big ? 0.24 : female ? 0.225 : 0.215);
  const hairD = shade(look.hair, 10);

  for (const s of [-1, 1]) {
    const ex = hcx + s * eyeDX;
    // a woman's eye is rounder and taller, a man's narrower and more almond
    const eyeRy = eyeR * (big ? 1.24 : female ? 1.22 : 0.98);
    ellipse(ctx, ex, eyeY, eyeR * 1.0, eyeRy, "#fff8ee");
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR * 1.0, eyeRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(44,28,30,0.65)";
    ctx.lineWidth = Math.max(0.8, eyeR * 0.18);
    ctx.stroke();
    ellipse(ctx, ex, eyeY + eyeR * 0.18, eyeR * 0.66, eyeR * 0.84, iris);
    ellipse(ctx, ex + s * eyeR * 0.12, eyeY + eyeR * 0.18, eyeR * 0.32, eyeR * 0.58, shade(iris, 38));
    ellipse(ctx, ex, eyeY + eyeR * 0.22, eyeR * 0.34, eyeR * 0.43, "#1b1622");
    ellipse(ctx, ex - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.22, eyeR * 0.22, "#ffffff");
    // upper lid: a woman's is a thick dark lash-line, a man's a thin crease
    ctx.strokeStyle = female ? "rgba(38,22,26,0.92)" : "rgba(58,36,32,0.72)";
    ctx.lineWidth = Math.max(0.9, eyeR * (female ? 0.34 : 0.15));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeR * 0.02, eyeR * 1.0, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    // the faintest lower-lid hint completes the eye without hardening it
    ctx.strokeStyle = "rgba(140,90,80,0.3)";
    ctx.lineWidth = Math.max(0.7, eyeR * 0.09);
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeR * 0.18, eyeR * 1.0, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    // brow — a woman's is thinner, higher and more arched; a man's is heavier,
    // flatter and sits closer to the eye
    ctx.strokeStyle = hairD;
    ctx.save();
    ctx.globalAlpha = female ? 0.82 : 0.92;
    ctx.lineWidth = hw * (female ? 0.019 : 0.031);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (female) {
      ctx.moveTo(ex - s * eyeR * 1.15, eyeY - eyeR * 1.6);
      ctx.quadraticCurveTo(ex + s * eyeR * 0.2, eyeY - eyeR * (look.elder ? 1.8 : 2.15), ex + s * eyeR * 1.15, eyeY - eyeR * 1.45);
    } else {
      ctx.moveTo(ex - eyeR * 1.05, eyeY - eyeR * 1.42);
      ctx.quadraticCurveTo(ex, eyeY - eyeR * (look.elder ? 1.4 : 1.66), ex + eyeR * 1.05, eyeY - eyeR * 1.46);
    }
    ctx.stroke();
    ctx.restore();
    if (female && !look.elder) {
      // splayed outer lashes — the single clearest "this is a woman" signal at
      // this size, so they fan out rather than sitting as two stray ticks
      ctx.strokeStyle = "rgba(34,20,24,0.85)";
      ctx.lineCap = "round";
      const lashes: [number, number, number][] = [
        [0.72, 1.32, 0.62],
        [0.95, 1.62, 0.9],
        [1.08, 1.78, 1.24],
      ];
      for (const [x0, x1, spread] of lashes) {
        ctx.lineWidth = Math.max(0.85, eyeR * 0.15);
        ctx.beginPath();
        ctx.moveTo(ex + s * eyeR * x0, eyeY - eyeR * spread * 0.52);
        ctx.quadraticCurveTo(
          ex + s * eyeR * (x0 + x1) * 0.5,
          eyeY - eyeR * spread * 0.95,
          ex + s * eyeR * x1,
          eyeY - eyeR * spread * 1.12
        );
        ctx.stroke();
      }
      // a soft lid shadow above the lash line reads as eyeshadow
      ctx.save();
      ctx.globalAlpha = 0.22;
      ellipse(ctx, ex, eyeY - eyeR * 0.95, eyeR * 1.0, eyeR * 0.42, "#7d4a6b");
      ctx.restore();
    }
  }
  // nose — one soft curved side-line with a hint of nostril shadow (the old
  // hard 3-point hook read as a drawn-on beak)
  // a woman's nose is smaller and drawn more faintly than a man's
  ctx.save();
  ctx.globalAlpha = female ? 0.5 : 0.78;
  ctx.strokeStyle = skinD;
  ctx.lineWidth = hw * (female ? 0.02 : 0.028);
  ctx.lineCap = "round";
  // Canonical face layout: with the eye line at the middle of the head, the
  // base of the nose falls ~42% of the way from the eyes to the chin and the
  // mouth ~62%. Everything used to be bunched into the top half of the face,
  // which is what left the lips sitting up under the nose.
  const noseLen = female ? 0.2 : 0.215;
  ctx.beginPath();
  ctx.moveTo(hcx + hw * 0.012, eyeY + eyeR * 0.6);
  ctx.quadraticCurveTo(hcx + hw * 0.034, eyeY + hh * noseLen * 0.75, hcx + hw * 0.018, eyeY + hh * noseLen);
  ctx.stroke();
  ctx.globalAlpha = female ? 0.3 : 0.45;
  ctx.lineWidth = hw * 0.02;
  ctx.beginPath();
  ctx.arc(hcx - hw * 0.012, eyeY + hh * (noseLen + 0.01), hw * (female ? 0.026 : 0.032), Math.PI * 0.15, Math.PI * 0.9);
  ctx.stroke();
  ctx.restore();
  // mouth — two-tone lips: a smile line plus a soft lower-lip fill
  const mouthY = eyeY + hh * (big ? 0.24 : female ? 0.27 : 0.285);
  if (female && !big) {
    // a proper pair of lips — a cupid's bow on top, a full lower lip below.
    // A bare smile-arc is what left the women looking like the men.
    const lw = hw * 0.2;
    ctx.fillStyle = lip;
    ctx.beginPath();
    ctx.moveTo(hcx - lw, mouthY);
    ctx.quadraticCurveTo(hcx - lw * 0.5, mouthY - hh * 0.032, hcx, mouthY - hh * 0.012);
    ctx.quadraticCurveTo(hcx + lw * 0.5, mouthY - hh * 0.032, hcx + lw, mouthY);
    ctx.quadraticCurveTo(hcx + lw * 0.55, mouthY + hh * 0.062, hcx, mouthY + hh * 0.066);
    ctx.quadraticCurveTo(hcx - lw * 0.55, mouthY + hh * 0.062, hcx - lw, mouthY);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = shade(lip, 40);
    ctx.lineWidth = Math.max(0.7, hw * 0.016);
    ctx.beginPath();
    ctx.moveTo(hcx - lw * 0.92, mouthY + hh * 0.002);
    ctx.quadraticCurveTo(hcx, mouthY + hh * 0.016, hcx + lw * 0.92, mouthY + hh * 0.002);
    ctx.stroke();
    ctx.restore();
    // gloss highlight on the lower lip
    ctx.save();
    ctx.globalAlpha = 0.5;
    ellipse(ctx, hcx, mouthY + hh * 0.036, lw * 0.34, hh * 0.013, tint(lip, 60));
    ctx.restore();
  } else {
    ctx.strokeStyle = shade(lip, 18);
    ctx.lineWidth = hw * (big ? 0.05 : 0.046);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(hcx, mouthY, hw * (big ? 0.19 : 0.22), 0.24 * Math.PI, 0.76 * Math.PI);
    ctx.stroke();
    // lower lip catches the light just under the smile line
    ctx.save();
    ctx.globalAlpha = 0.4;
    ellipse(ctx, hcx, mouthY + hw * 0.225, hw * 0.1, hh * (big ? 0.035 : 0.028), tint(lip, 34));
    ctx.restore();
  }
  // these two belong to the drawn-arc mouth only — over the shaped female lips
  // they read as a scar and a stray tooth
  if (!female || big) {
    ctx.strokeStyle = "rgba(85,45,48,0.35)";
    ctx.lineWidth = Math.max(0.8, hw * 0.014);
    ctx.beginPath();
    ctx.moveTo(hcx - hw * 0.12, mouthY - hh * 0.018);
    ctx.quadraticCurveTo(hcx, mouthY - hh * 0.005, hcx + hw * 0.12, mouthY - hh * 0.018);
    ctx.stroke();
    if (big) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = Math.max(0.8, hw * 0.013);
      ctx.beginPath();
      ctx.moveTo(hcx - hw * 0.05, mouthY + hw * 0.21);
      ctx.lineTo(hcx + hw * 0.05, mouthY + hw * 0.21);
      ctx.stroke();
    }
  }
  // blush
  if (look.gender === "female" || look.child) {
    ctx.fillStyle = `rgba(255,115,145,${look.gender === "female" ? 0.34 : 0.16})`;
    ctx.beginPath();
    ctx.ellipse(hcx - hw * 0.3, eyeY + hh * 0.12, hw * 0.11, hh * 0.07, 0, 0, Math.PI * 2);
    ctx.ellipse(hcx + hw * 0.3, eyeY + hh * 0.12, hw * 0.11, hh * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // elder details
  if (look.elder) {
    ctx.strokeStyle = "rgba(120,95,80,0.4)";
    ctx.lineWidth = hw * 0.03;
    ctx.beginPath();
    ctx.moveTo(hcx - hw * 0.32, hcy - hh * 0.18);
    ctx.lineTo(hcx + hw * 0.32, hcy - hh * 0.2);
    ctx.stroke();
    // glasses
    ctx.strokeStyle = "rgba(70,70,80,0.9)";
    ctx.lineWidth = hw * 0.04;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hcx + s * eyeDX, eyeY, eyeR * 1.5, eyeR * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(hcx - eyeDX + eyeR * 1.4, eyeY);
    ctx.lineTo(hcx + eyeDX - eyeR * 1.4, eyeY);
    ctx.stroke();
  }
}

function drawBaby(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  if (motion.facing === "back") {
    drawCrawlingBabyBack(ctx, cx, footY, look, walkPhase);
    return;
  }
  drawCrawlingBaby(ctx, cx, footY, look, walkPhase, motion);
}

function drawCrawlingBaby(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  const dir = motion.facing === "left" ? -1 : motion.facing === "right" ? 1 : 1;
  const step = Math.sin(walkPhase);
  const counter = Math.cos(walkPhase);
  const bob = Math.abs(counter) * H * 0.012;
  const skin = look.skin;
  const skinD = shade(skin, 16);
  const onesie = look.shirt;
  const bodyCx = cx - dir * H * 0.04;
  const bodyCy = footY - H * 0.19 - bob;
  const bodyRx = H * 0.3;
  const bodyRy = H * 0.16;
  const headR = H * 0.255;
  const headCx = cx + dir * H * 0.22;
  const headCy = footY - H * 0.37 - bob * 0.35;
  const limbW = H * 0.052;

  groundShadow(ctx, cx, footY, bodyRx * 1.15);

  // Alternating far/near crawl limbs. Hands and knees touch the floor in turn.
  const handReach = H * 0.13;
  const kneeReach = H * 0.11;
  const farArmX = bodyCx - dir * bodyRx * 0.15 - dir * step * handReach * 0.55;
  const nearArmX = bodyCx + dir * bodyRx * 0.28 + dir * step * handReach;
  const farKneeX = bodyCx - dir * bodyRx * 0.42 + dir * step * kneeReach;
  const nearKneeX = bodyCx + dir * bodyRx * 0.08 - dir * step * kneeReach * 0.8;
  const handY = footY - H * 0.045;
  const kneeY = footY - H * 0.035;
  limb(ctx, bodyCx - dir * bodyRx * 0.35, bodyCy - bodyRy * 0.05, farArmX, handY, limbW * 0.92, shade(onesie, 10));
  drawHand(ctx, farArmX, handY + H * 0.006, H * 0.048, H * 0.031, skinD, -dir, -dir * 0.05);
  limb(ctx, bodyCx + dir * bodyRx * 0.2, bodyCy + bodyRy * 0.45, farKneeX, kneeY, limbW, shade(onesie, 12));
  ellipse(ctx, farKneeX, kneeY + H * 0.006, H * 0.046, H * 0.028, skinD);

  limb(ctx, bodyCx + dir * bodyRx * 0.18, bodyCy - bodyRy * 0.12, nearArmX, handY - Math.max(0, counter) * H * 0.018, limbW, onesie);
  drawHand(ctx, nearArmX, handY + H * 0.006 - Math.max(0, counter) * H * 0.018, H * 0.052, H * 0.034, skin, dir, dir * 0.06);
  limb(ctx, bodyCx - dir * bodyRx * 0.12, bodyCy + bodyRy * 0.46, nearKneeX, kneeY - Math.max(0, -counter) * H * 0.018, limbW, onesie);
  ellipse(ctx, nearKneeX, kneeY + H * 0.006 - Math.max(0, -counter) * H * 0.018, H * 0.047, H * 0.029, skin);

  const bg = ctx.createRadialGradient(bodyCx - bodyRx * 0.35, bodyCy - bodyRy * 0.55, bodyRx * 0.16, bodyCx, bodyCy, bodyRx * 1.1);
  bg.addColorStop(0, tint(onesie, 18));
  bg.addColorStop(1, shade(onesie, 16));
  ellipse(ctx, bodyCx, bodyCy, bodyRx, bodyRy, bg);
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = H * 0.014;
  ctx.beginPath();
  ctx.moveTo(bodyCx - dir * bodyRx * 0.45, bodyCy + bodyRy * 0.1);
  ctx.quadraticCurveTo(bodyCx, bodyCy + bodyRy * 0.28, bodyCx + dir * bodyRx * 0.42, bodyCy + bodyRy * 0.06);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = H * 0.011;
  ctx.beginPath();
  ctx.moveTo(bodyCx - dir * bodyRx * 0.18, bodyCy - bodyRy * 0.78);
  ctx.quadraticCurveTo(bodyCx + dir * bodyRx * 0.12, bodyCy - bodyRy * 0.52, bodyCx + dir * bodyRx * 0.42, bodyCy - bodyRy * 0.28);
  ctx.stroke();

  ellipse(ctx, bodyCx + dir * bodyRx * 0.55, bodyCy - bodyRy * 0.22, H * 0.055, H * 0.05, skinD);

  const frontHandX = headCx + dir * headR * 0.36 + dir * step * H * 0.03;
  const frontHandY = handY - Math.max(0, counter) * H * 0.012;
  limb(ctx, bodyCx + dir * bodyRx * 0.42, bodyCy - bodyRy * 0.06, frontHandX, frontHandY, limbW * 0.9, tint(onesie, 4));
  drawHand(ctx, frontHandX, frontHandY + H * 0.006, H * 0.054, H * 0.034, skin, dir, dir * 0.1);
  const frontKneeX = bodyCx - dir * bodyRx * 0.46 - dir * step * H * 0.028;
  const frontKneeY = kneeY - Math.max(0, -counter) * H * 0.012;
  limb(ctx, bodyCx - dir * bodyRx * 0.18, bodyCy + bodyRy * 0.5, frontKneeX, frontKneeY, limbW * 0.95, shade(onesie, 6));
  ellipse(ctx, frontKneeX - dir * H * 0.018, frontKneeY + H * 0.006, H * 0.047, H * 0.029, skinD);

  drawBabyProfileHeadShape(ctx, headCx, headCy, headR, skin, dir);

  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(headCx - dir * headR * 0.04, headCy - headR * 0.72, headR * 0.48, headR * 0.2, 0, Math.PI, 0);
  ctx.fill();
  ellipse(ctx, headCx + dir * headR * 0.05, headCy - headR * 0.86, headR * 0.16, headR * 0.13, look.hair);
  drawHairTexture(ctx, headCx, headCy - headR * 0.18, headR * 1.25, headR * 1.1, look, dir);
  if (look.gender === "female") ellipse(ctx, headCx + dir * headR * 0.54, headCy - headR * 0.5, headR * 0.14, headR * 0.1, "#ff7ab0");

  const eyeR = headR * 0.18;
  const eyeX = headCx + dir * headR * 0.28;
  const eyeY = headCy + headR * 0.04;
  ellipse(ctx, eyeX, eyeY, eyeR, eyeR * 1.12, "#ffffff");
  ellipse(ctx, eyeX + dir * eyeR * 0.08, eyeY + eyeR * 0.18, eyeR * 0.62, eyeR * 0.78, "#3a2a22");
  ellipse(ctx, eyeX - dir * eyeR * 0.24, eyeY - eyeR * 0.28, eyeR * 0.26, eyeR * 0.26, "#ffffff");
  ctx.strokeStyle = skinD;
  ctx.lineWidth = headR * 0.045;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(headCx + dir * headR * 0.45, eyeY + headR * 0.12);
  ctx.lineTo(headCx + dir * headR * 0.55, eyeY + headR * 0.18);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,140,160,0.38)";
  ctx.beginPath();
  ctx.ellipse(headCx + dir * headR * 0.45, eyeY + headR * 0.2, headR * 0.14, headR * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cc7a72";
  ctx.lineWidth = headR * 0.06;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(headCx + dir * headR * 0.16, eyeY + headR * 0.27);
  ctx.quadraticCurveTo(headCx + dir * headR * 0.3, eyeY + headR * 0.35, headCx + dir * headR * 0.44, eyeY + headR * 0.26);
  ctx.stroke();
}

function drawCrawlingBabyBack(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number): void {
  const H = look.heightPx;
  const step = Math.sin(walkPhase);
  const bob = Math.abs(Math.cos(walkPhase)) * H * 0.01;
  const onesie = look.shirt;
  const skin = look.skin;
  const bodyCx = cx;
  const bodyCy = footY - H * 0.11 - bob;
  const bodyRx = H * 0.32;
  const bodyRy = H * 0.17;
  const headR = H * 0.25;
  const headCx = cx;
  const headCy = footY - H * 0.35 - bob * 0.35;
  const limbW = H * 0.056;
  const handY = footY - H * 0.045;
  const kneeY = footY - H * 0.035;

  groundShadow(ctx, cx, footY, bodyRx * 1.1);

  for (const s of [-1, 1]) {
    const handX = bodyCx + s * (bodyRx * 0.62 + step * H * 0.035);
    const kneeX = bodyCx + s * (bodyRx * 0.32 - step * H * 0.03);
    limb(ctx, bodyCx + s * bodyRx * 0.28, bodyCy - bodyRy * 0.04, handX, handY, limbW, onesie);
    drawHand(ctx, handX, handY + H * 0.006, H * 0.048, H * 0.031, skin, s, s * 0.05);
    limb(ctx, bodyCx + s * bodyRx * 0.18, bodyCy + bodyRy * 0.48, kneeX, kneeY, limbW, shade(onesie, 8));
    ellipse(ctx, kneeX, kneeY + H * 0.006, H * 0.044, H * 0.027, skin);
  }

  const bg = ctx.createRadialGradient(bodyCx - bodyRx * 0.2, bodyCy - bodyRy * 0.55, bodyRx * 0.16, bodyCx, bodyCy, bodyRx * 1.1);
  bg.addColorStop(0, tint(onesie, 18));
  bg.addColorStop(1, shade(onesie, 16));
  ellipse(ctx, bodyCx, bodyCy, bodyRx, bodyRy, bg);
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = H * 0.011;
  ctx.beginPath();
  ctx.moveTo(bodyCx - bodyRx * 0.45, bodyCy + bodyRy * 0.05);
  ctx.quadraticCurveTo(bodyCx, bodyCy + bodyRy * 0.24, bodyCx + bodyRx * 0.45, bodyCy + bodyRy * 0.05);
  ctx.stroke();
  for (const s of [-1, 1]) {
    drawHand(ctx, bodyCx + s * bodyRx * 0.55, handY + H * 0.006, H * 0.047, H * 0.03, skin, s, s * 0.04);
    ellipse(ctx, bodyCx + s * bodyRx * 0.31, kneeY + H * 0.006, H * 0.043, H * 0.027, shade(skin, 12));
  }

  drawBabyBackHeadShape(ctx, headCx, headCy, headR, skin);

  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.moveTo(headCx - headR * 0.78, headCy - headR * 0.08);
  ctx.quadraticCurveTo(headCx - headR * 0.72, headCy - headR * 0.86, headCx, headCy - headR * 0.9);
  ctx.quadraticCurveTo(headCx + headR * 0.72, headCy - headR * 0.86, headCx + headR * 0.78, headCy - headR * 0.08);
  ctx.quadraticCurveTo(headCx + headR * 0.42, headCy + headR * 0.18, headCx, headCy + headR * 0.12);
  ctx.quadraticCurveTo(headCx - headR * 0.42, headCy + headR * 0.18, headCx - headR * 0.78, headCy - headR * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ctx.strokeStyle = shade(look.hair, 20);
  ctx.lineWidth = Math.max(1, headR * 0.06);
  ctx.beginPath();
  ctx.moveTo(headCx - headR * 0.22, headCy - headR * 0.74);
  ctx.quadraticCurveTo(headCx - headR * 0.14, headCy - headR * 0.26, headCx - headR * 0.26, headCy + headR * 0.08);
  ctx.moveTo(headCx + headR * 0.18, headCy - headR * 0.74);
  ctx.quadraticCurveTo(headCx + headR * 0.1, headCy - headR * 0.24, headCx + headR * 0.24, headCy + headR * 0.08);
  ctx.stroke();
  drawHairTexture(ctx, headCx, headCy - headR * 0.16, headR * 1.28, headR * 1.1, look);
  ellipse(ctx, headCx, headCy - headR * 0.86, headR * 0.16, headR * 0.13, look.hair);
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: AvatarLook,
  walkPhase: number,
  motion: AvatarMotion,
  expression: CharacterExpression = "neutral"
): void {
  drawCharacter(
    ctx,
    cx,
    footY,
    look,
    walkPhase,
    motion,
    expression
  );
}

const PERSON_LABEL: Record<PersonKind, string> = {
  mother: "Mum", father: "Dad", grandma: "Grandma", grandpa: "Grandpa",
  babySibling: "Baby sibling", sibling: "Sibling", playmate: "Playmate", studyFriend: "Study pal", bestFriend: "Best friend",
  crush: "Crush", smokerFriend: "Smoker friend", gangster: "Gangster", playboy: "Playboy",
  roommate: "Roommate", coworker: "Coworker", boss: "Boss",
  gymBuddy: "Gym buddy", spouse: "Spouse", baby: "Newborn baby", child: "Your child", grandkid: "Grandkid", oldFriend: "Old friend",
};

export interface PersonDrawOptions {
  seated?: boolean;
  appearance?: CharacterAppearanceId;
  expression?: CharacterExpression;
  /** Preserve a selected spouse's authored gender, including legacy saves. */
  gender?: Gender;
}

/** Shared focus ring and readable name plate for generic and uniformed people. */
export function drawCharacterNamePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  visualHeight: number,
  label: string,
  focused: boolean,
  used: boolean,
  t: number,
  color = "rgba(255,255,255,0.9)"
): void {
  if (focused) {
    ctx.fillStyle = `rgba(255,235,170,${0.2 + 0.12 * Math.sin(t * 6)})`;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      footY + 1,
      visualHeight * 0.28,
      5,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  const labelY = Math.max(14, footY - visualHeight - 10);
  drawNamePlate(
    ctx,
    cx,
    labelY,
    label,
    focused ? "#ffe9a8" : color
  );
  if (used) {
    ctx.fillStyle = "#3ddc84";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("♥", cx, Math.max(22, labelY + 8));
  }
}

export function drawPerson(ctx: CanvasRenderingContext2D, cx: number, footY: number, kind: PersonKind, playerGender: Gender, label: string, focused: boolean, used: boolean, t: number, stageIndex?: number, heritage: HeritageStyle = "western", options: PersonDrawOptions = {}): void {
  const look = personLook(
    kind,
    playerGender,
    stageIndex,
    heritage,
    options.appearance,
    options.gender
  );
  const seated = !!options.seated;
  ctx.save();
  if (used) ctx.globalAlpha = 0.5;
  drawCharacter(
    ctx,
    cx,
    footY - (focused ? 1 : 0),
    look,
    t * 1.4,
    {
      moving: false,
      facing: "front",
      verticalBias: 0,
      pose: seated ? "sit" : undefined,
    },
    options.expression
  );
  ctx.restore();
  const role = npcRoleStyle(kind);
  drawNpcRoleCue(ctx, cx, footY, look, role.cue, t);
  const name = label || PERSON_LABEL[kind];
  const roleColor =
    role.disposition === "hostile"
      ? "#ff9aa8"
      : role.disposition === "risky"
        ? "#ffd078"
        : "rgba(255,255,255,0.9)";
  drawCharacterNamePlate(
    ctx,
    cx,
    footY,
    storybookVisualHeight(look) * (seated ? 0.78 : 1),
    name,
    focused,
    used,
    t,
    roleColor
  );
}

function drawNamePlate(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string, color: string): void {
  ctx.font = "10px 'Trebuchet MS', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(18,12,30,0.82)";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - 7, w, 14, 4);
    ctx.fill();
  } else ctx.fillRect(cx - w / 2, y - 7, w, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, y);
}

// ===========================================================================
// Scenery (rooms) + gate — simple rects, anti-aliased by the supersampling
// ===========================================================================

export interface RoomDecor {
  scene: SceneKind;
  upperScene: UpperSceneKind;
  atHome: boolean;
  homeQuality: number;
  splitY: number;
  ownedVehicles: Pick<VehicleTier, "id" | "name">[];
  ownedHome: Pick<HouseTier, "id" | "name" | "quality"> | null;
}

export function drawRoom(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, H: number, floorY: number, doorActive: boolean, t: number, decor: RoomDecor): void {
  const splitY = Math.round(decor.splitY);
  drawTopSky(ctx, W, floorY, t);
  drawSocialArea(ctx, W, floorY, splitY, t, decor.upperScene);
  drawFamilyArea(ctx, decor.scene, theme, W, splitY, H, t);
  drawOwnedVehicles(ctx, W, splitY, decor.ownedVehicles, t);
  drawOwnedHomeExterior(ctx, W, splitY, decor.ownedHome);
  if (decor.atHome && decor.homeQuality > 0) {
    drawHomeQuality(
      ctx,
      theme,
      W,
      splitY + 70,
      decor.homeQuality
    );
  }
  drawZoneDivider(ctx, W, splitY);
  drawDoor(ctx, theme, W, H, splitY, doorActive, t);
}

function drawOwnedVehicles(ctx: CanvasRenderingContext2D, W: number, splitY: number, vehicles: Pick<VehicleTier, "id" | "name">[], t: number): void {
  if (vehicles.length === 0) return;
  const shown = vehicles.slice(0, 4);
  const baseY = Math.max(124, splitY - 22);
  const left = 22;
  const stripW = Math.min(W - 176, 46 + shown.length * 58);
  px(ctx, left, baseY - 9, stripW, 20, "rgba(44,68,76,0.68)");
  px(ctx, left, baseY + 8, stripW, 3, "rgba(255,255,255,0.42)");
  for (let x = left + 14; x < left + stripW - 10; x += 36) px(ctx, x, baseY + 1, 18, 3, "rgba(255,218,114,0.64)");
  shown.forEach((v, i) => drawOwnedVehicle(ctx, left + 36 + i * 58, baseY + 3, v.id, t + i * 0.6));
}

function drawOwnedVehicle(ctx: CanvasRenderingContext2D, cx: number, groundY: number, id: string, t: number): void {
  ellipse(ctx, cx, groundY + 10, id === "bicycle" || id === "motorbike" ? 24 : 31, 5, "rgba(18,14,22,0.22)");
  if (id === "bicycle") {
    const spin = Math.sin(t * 2) * 0.6;
    strokeCircle(ctx, cx - 17, groundY + 3, 9, "#263546", 2.2);
    strokeCircle(ctx, cx + 17, groundY + 3, 9, "#263546", 2.2);
    ctx.strokeStyle = "#ffd76b";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 17, groundY + 3);
    ctx.lineTo(cx - 2, groundY - 9 + spin);
    ctx.lineTo(cx + 17, groundY + 3);
    ctx.lineTo(cx - 5, groundY + 3);
    ctx.lineTo(cx - 17, groundY + 3);
    ctx.moveTo(cx - 2, groundY - 9 + spin);
    ctx.lineTo(cx + 7, groundY - 16);
    ctx.moveTo(cx + 10, groundY - 16);
    ctx.lineTo(cx + 18, groundY - 14);
    ctx.stroke();
    px(ctx, cx - 7, groundY - 16, 12, 3, "#2f2634");
    return;
  }
  if (id === "motorbike") {
    strokeCircle(ctx, cx - 20, groundY + 4, 9, "#242936", 2.4);
    strokeCircle(ctx, cx + 20, groundY + 4, 9, "#242936", 2.4);
    limb(ctx, cx - 14, groundY, cx + 12, groundY - 8, 7, "#1e2532");
    ellipse(ctx, cx + 4, groundY - 10, 18, 8, "#ff9b35");
    px(ctx, cx - 6, groundY - 17, 18, 5, "#3d4658");
    limb(ctx, cx + 16, groundY - 8, cx + 25, groundY - 18, 3.2, "#354052");
    return;
  }
  const sporty = id === "sportscar";
  const body = sporty ? "#e9485a" : "#4aa3ff";
  const roof = sporty ? "#ffd15c" : "#2e5f8e";
  const w = sporty ? 58 : 52;
  const h = sporty ? 17 : 22;
  px(ctx, cx - w / 2, groundY - h, w, h, shade(body, 8));
  px(ctx, cx - w / 2 + 6, groundY - h - 4, w - 12, h, body);
  if (sporty) {
    px(ctx, cx + w / 2 - 5, groundY - h - 10, 12, 5, shade(body, 18));
    px(ctx, cx - 10, groundY - h - 13, 26, 10, roof);
  } else {
    px(ctx, cx - 14, groundY - h - 14, 30, 14, roof);
  }
  px(ctx, cx - 8, groundY - h - 10, 10, 8, "#bdefff");
  px(ctx, cx + 5, groundY - h - 10, 10, 8, "#92d8ff");
  ellipse(ctx, cx - w * 0.3, groundY + 1, 7, 7, "#222631");
  ellipse(ctx, cx + w * 0.3, groundY + 1, 7, 7, "#222631");
  ellipse(ctx, cx - w * 0.3, groundY + 1, 3.2, 3.2, "#8894a1");
  ellipse(ctx, cx + w * 0.3, groundY + 1, 3.2, 3.2, "#8894a1");
}

function strokeCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, w: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawOwnedHomeExterior(ctx: CanvasRenderingContext2D, W: number, splitY: number, home: Pick<HouseTier, "id" | "name" | "quality"> | null): void {
  if (!home) return;
  const x = 22;
  const y = splitY + 15;
  const w = 126;
  const h = 58;
  px(ctx, x - 4, y - 4, w + 8, h + 8, "rgba(36,26,32,0.24)");
  px(ctx, x, y, w, h, "#bfeaff");
  px(ctx, x, y + h - 20, w, 20, "#7fcf74");
  px(ctx, x, y + h - 2, w, 2, "#5c9b55");
  if (home.id === "studio" || home.id === "condo") drawApartmentExterior(ctx, x + 20, y + 6, home.quality);
  else drawHouseExterior(ctx, x + 18, y + 8, home.quality, home.id === "villa");
  px(ctx, x + w - 34, y + h - 24, 20, 8, "#6ba85e");
  ellipse(ctx, x + w - 24, y + h - 31, 13, 12, "#4bb366");
  ellipse(ctx, x + w - 12, y + h - 29, 10, 9, "#62c87a");
}

function drawApartmentExterior(ctx: CanvasRenderingContext2D, x: number, y: number, quality: number): void {
  const floors = quality >= 2 ? 3 : 2;
  const col = quality >= 2 ? "#8faac5" : "#8f8f98";
  px(ctx, x, y + (3 - floors) * 9, 52, floors * 14 + 12, col);
  px(ctx, x - 3, y + (3 - floors) * 9 - 4, 58, 5, shade(col, 20));
  for (let r = 0; r < floors; r++) {
    for (let c = 0; c < 3; c++) px(ctx, x + 7 + c * 14, y + 7 + r * 14 + (3 - floors) * 9, 7, 7, "#d8f3ff");
  }
  px(ctx, x + 22, y + floors * 14 + 4 + (3 - floors) * 9, 10, 13, "#3d3a45");
}

function drawHouseExterior(ctx: CanvasRenderingContext2D, x: number, y: number, quality: number, villa: boolean): void {
  const body = villa ? "#f5ecd2" : quality >= 4 ? "#ffe1a8" : "#f0c58f";
  const roof = villa ? "#e0b84e" : quality >= 4 ? "#c24f62" : "#9c5a45";
  const w = villa ? 76 : quality >= 4 ? 68 : 58;
  const h = villa ? 35 : 31;
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 18);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w + 4, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(42,30,32,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  px(ctx, x, y + 18, w, h, body);
  px(ctx, x + 9, y + 27, 12, 11, "#bdefff");
  px(ctx, x + w - 22, y + 27, 12, 11, "#bdefff");
  px(ctx, x + w / 2 - 6, y + 34, 12, 19, "#6b493d");
  if (villa) {
    for (let c = 0; c < 4; c++) px(ctx, x + 8 + c * 15, y + 20, 4, h + 1, "#d6c393");
    px(ctx, x - 7, y + h + 20, w + 14, 4, "#d6c393");
  }
}

function drawTopSky(ctx: CanvasRenderingContext2D, W: number, bottom: number, t: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, bottom);
  sky.addColorStop(0, "#77c8ff");
  sky.addColorStop(1, "#ccefff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, bottom);
  px(ctx, 0, bottom - 4, W, 4, "#a6e2ff");
  const cloudShift = (t * 7) % 160;
  for (const [x0, y, s] of [[68, 28, 0.7], [292, 18, 0.55], [514, 34, 0.62]] as const) {
    const x = ((x0 + cloudShift) % (W + 100)) - 50;
    ellipse(ctx, x, y, 22 * s, 7 * s, "rgba(255,255,255,0.82)");
    ellipse(ctx, x + 18 * s, y + 4 * s, 24 * s, 8 * s, "rgba(255,255,255,0.74)");
    ellipse(ctx, x - 16 * s, y + 4 * s, 14 * s, 5 * s, "rgba(255,255,255,0.70)");
  }
}

function drawPixelTrim(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string): void {
  const cell = 4;
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      px(ctx, x + xx, y + yy, cell, cell, ((xx / cell + yy / cell) % 2 === 0) ? a : b);
    }
  }
}

function window2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sky: string): void {
  px(ctx, x - 3, y - 3, w + 6, h + 6, "#6a5a3a");
  px(ctx, x, y, w, h, sky);
  px(ctx, x + w / 2 - 1, y, 2, h, "#6a5a3a");
  px(ctx, x, y + h / 2 - 1, w, 2, "#6a5a3a");
}

function drawPixelTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, scale = 1, variant = 0): void {
  const trunkH = 42 * scale;
  const trunkW = 10 * scale;
  const leafA = variant % 2 ? "#42b96f" : "#35a969";
  const leafB = variant % 2 ? "#68d57b" : "#55c96f";
  const leafC = variant % 3 ? "#2e8d58" : "#2f9a61";
  ctx.save();
  ellipse(ctx, x + 2 * scale, groundY + 3 * scale, 27 * scale, 6 * scale, "rgba(33,72,40,0.24)");
  px(ctx, x - trunkW / 2 - 1, groundY - trunkH, trunkW + 2, trunkH + 3 * scale, "#5c3b26");
  px(ctx, x - trunkW / 2 + 2 * scale, groundY - trunkH + 4 * scale, trunkW * 0.36, trunkH - 4 * scale, "#8a5a35");
  px(ctx, x - trunkW / 2 - 7 * scale, groundY - 3 * scale, 13 * scale, 3 * scale, "#5c3b26");
  px(ctx, x + trunkW / 2 - 2 * scale, groundY - 4 * scale, 13 * scale, 3 * scale, "#5c3b26");

  ctx.strokeStyle = "#5c3b26";
  ctx.lineWidth = Math.max(2, 4 * scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, groundY - trunkH + 9 * scale);
  ctx.lineTo(x - 19 * scale, groundY - trunkH - 11 * scale);
  ctx.moveTo(x + 1 * scale, groundY - trunkH + 4 * scale);
  ctx.lineTo(x + 20 * scale, groundY - trunkH - 15 * scale);
  ctx.moveTo(x, groundY - trunkH - 5 * scale);
  ctx.lineTo(x + 4 * scale, groundY - trunkH - 28 * scale);
  ctx.stroke();

  const top = groundY - trunkH - 20 * scale;
  const blobs = [
    [-18, 8, 20, 17, leafC],
    [0, -6, 25, 20, leafA],
    [21, 7, 21, 18, leafB],
    [-4, 15, 28, 18, leafB],
    [11, -18, 18, 14, leafC],
  ] as const;
  for (const [dx, dy, rx, ry, color] of blobs) {
    ellipse(ctx, x + dx * scale, top + dy * scale, rx * scale, ry * scale, color);
  }
  for (const [dx, dy] of [[-16, -1], [10, -15], [23, 8], [-1, 17]] as const) {
    px(ctx, x + dx * scale, top + dy * scale, 7 * scale, 3 * scale, "rgba(235,255,206,0.42)");
  }
  ctx.restore();
}

function drawFlowerPatch(ctx: CanvasRenderingContext2D, x: number, y: number, count = 5): void {
  for (let i = 0; i < count; i++) {
    const px0 = x + i * 15;
    const c = ["#ff7ab0", "#ffd23f", "#7fd0ff", "#ffffff"][i % 4];
    px(ctx, px0, y + 5, 2, 7, "#3f8d4f");
    ellipse(ctx, px0 + 1, y + 3, 4, 3, c);
  }
}

function drawSocialArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number, scene: UpperSceneKind): void {
  switch (scene) {
    case "amusementPark":
      drawAmusementParkArea(ctx, W, top, bottom, t);
      return;
    case "schoolIndoor":
      drawSchoolIndoorArea(ctx, W, top, bottom, false);
      return;
    case "schoolOutdoor":
      drawSchoolOutdoorArea(ctx, W, top, bottom, t, false);
      return;
    case "campusIndoor":
      drawSchoolIndoorArea(ctx, W, top, bottom, true);
      return;
    case "campusOutdoor":
      drawSchoolOutdoorArea(ctx, W, top, bottom, t, true);
      return;
    case "officeIndoor":
      drawOfficeIndoorArea(ctx, W, top, bottom, t);
      return;
    case "officeOutdoor":
      drawOfficeOutdoorArea(ctx, W, top, bottom, t);
      return;
    case "mountain":
      drawMountainArea(ctx, W, top, bottom, t);
      return;
    case "beach":
      drawBeachArea(ctx, W, top, bottom, t);
      return;
    case "ship":
      drawShipDeckArea(ctx, W, top, bottom, t);
      return;
    case "flowerField":
      drawFlowerFieldArea(ctx, W, top, bottom, t);
      return;
    case "park":
    default:
      drawOutdoorParkArea(ctx, W, top, bottom, t);
  }
}

function drawOutdoorParkArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  const horizon = Math.round(Math.min(top + 48, bottom - 122));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#8fd0ff");
  sky.addColorStop(1, "#d9f4ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  px(ctx, 0, top, W, 3, "#5ca9d6");
  const cloudShift = (t * 9) % 160;
  for (const [x0, y, s] of [[42, top + 24, 0.82], [240, top + 18, 0.62], [410, top + 34, 0.72], [585, top + 22, 0.58]] as const) {
    const x = ((x0 + cloudShift) % (W + 120)) - 80;
    ellipse(ctx, x, y, 22 * s, 8 * s, "rgba(255,255,255,0.86)");
    ellipse(ctx, x + 20 * s, y + 4 * s, 26 * s, 9 * s, "rgba(255,255,255,0.80)");
    ellipse(ctx, x - 18 * s, y + 5 * s, 16 * s, 6 * s, "rgba(255,255,255,0.76)");
  }
  ellipse(ctx, W - 70, top + 24, 18, 18, "#ffe27a");

  const ground = ctx.createLinearGradient(0, horizon, 0, bottom);
  ground.addColorStop(0, "#a5df86");
  ground.addColorStop(0.48, "#74c979");
  ground.addColorStop(1, "#5bb56e");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  px(ctx, 0, horizon - 3, W, 8, "#8ed17f");
  px(ctx, 0, horizon + 8, W, 3, "rgba(255,255,255,0.22)");
  for (let x = 24; x < W; x += 76) {
    drawPixelTree(ctx, x + 5, horizon + 25 + (x % 3) * 5, 0.72, x);
  }
  drawFlowerPatch(ctx, 226, horizon + 56, 7);
  drawFlowerPatch(ctx, W - 314, horizon + 76, 6);

  if (bottom - horizon > 170) {
    const pondX = 106;
    const pondY = Math.round(horizon + (bottom - horizon) * 0.46);
    ellipse(ctx, pondX, pondY, 86, 28, "#6ec8e8");
    ellipse(ctx, pondX - 16, pondY - 4, 54, 12, "rgba(255,255,255,0.28)");
    px(ctx, pondX - 92, pondY + 22, 178, 5, "#4d9c65");
    for (let x = pondX - 72; x < pondX + 82; x += 28) px(ctx, x, pondY + 18, 14, 7, "#7cc46b");

    const swingX = W - 166;
    const swingY = Math.round(horizon + (bottom - horizon) * 0.28);
    px(ctx, swingX, swingY, 5, 80, "#7a5a44");
    px(ctx, swingX + 72, swingY, 5, 80, "#7a5a44");
    px(ctx, swingX - 10, swingY, 96, 5, "#7a5a44");
    px(ctx, swingX + 27, swingY + 5, 3, 54, "#3f5168");
    px(ctx, swingX + 49, swingY + 5, 3, 54, "#3f5168");
    px(ctx, swingX + 24, swingY + 58, 32, 7, "#f2b24c");
  }

  for (let x = 18; x < W; x += 38) {
    const y = horizon + 18 + ((x / 38) % 4) * 29;
    if (y < bottom - 68) px(ctx, x, y, 10, 3, "rgba(58,118,66,0.25)");
  }

  const pathTop = Math.max(horizon + 72, bottom - 58);
  const path = ctx.createLinearGradient(0, pathTop, 0, bottom);
  path.addColorStop(0, "#eacb8f");
  path.addColorStop(1, "#c39b62");
  ctx.fillStyle = path;
  ctx.fillRect(0, pathTop, W, bottom - pathTop);
  px(ctx, 0, pathTop, W, 4, "#e7d69a");
  for (let x = -20; x < W; x += 54) px(ctx, x, pathTop + Math.max(16, (bottom - pathTop) * 0.52), 28, 4, "rgba(255,255,255,0.30)");
}

function drawAmusementParkArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  const horizon = Math.round(Math.min(top + 54, bottom - 128));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#9bd8ff");
  sky.addColorStop(1, "#e8f9ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  px(ctx, 0, top, W, 3, "#65b2dc");
  ellipse(ctx, W - 58, top + 24, 17, 17, "#ffe27a");
  const cloudShift = (t * 7) % 180;
  for (const [x0, y, s] of [[70, top + 24, 0.65], [270, top + 20, 0.58], [480, top + 34, 0.72]] as const) {
    const x = ((x0 + cloudShift) % (W + 120)) - 70;
    ellipse(ctx, x, y, 20 * s, 7 * s, "rgba(255,255,255,0.84)");
    ellipse(ctx, x + 18 * s, y + 4 * s, 24 * s, 8 * s, "rgba(255,255,255,0.78)");
  }

  const ground = ctx.createLinearGradient(0, horizon, 0, bottom);
  ground.addColorStop(0, "#b7e883");
  ground.addColorStop(0.48, "#77ce74");
  ground.addColorStop(0.49, "#f2cf7f");
  ground.addColorStop(1, "#d99b5e");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  px(ctx, 0, horizon - 3, W, 8, "#8ed17f");

  drawPixelTree(ctx, 42, horizon + 48, 0.68, 4);
  drawPixelTree(ctx, W - 42, horizon + 54, 0.62, 5);
  drawFerrisWheel(ctx, 154, Math.min(bottom - 78, horizon + 102), Math.min(54, Math.max(38, (bottom - horizon) * 0.21)), t);
  drawCarousel(ctx, W - 166, Math.min(bottom - 46, horizon + 130), t);
  drawTicketBooth(ctx, Math.round(W * 0.48), Math.min(bottom - 48, horizon + 136));
  drawFlowerPatch(ctx, 260, Math.min(bottom - 52, horizon + 118), 6);
  drawBalloonStand(ctx, W - 62, Math.min(bottom - 78, horizon + 96), t);
}

function drawFerrisWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = "#6b5c88";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) {
    const a = t * 0.18 + (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  limb(ctx, cx - r * 0.42, cy + r * 0.9, cx, cy, 5, "#756b91");
  limb(ctx, cx + r * 0.42, cy + r * 0.9, cx, cy, 5, "#756b91");
  px(ctx, cx - r * 0.52, cy + r * 0.94, r * 1.04, 5, "#5f5378");
  for (let i = 0; i < 6; i++) {
    const a = t * 0.18 + (Math.PI * 2 * i) / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const c = ["#ff6f91", "#ffd23f", "#74d6ff"][i % 3];
    px(ctx, x - 6, y + 4, 12, 8, "#3d334f");
    px(ctx, x - 5, y + 3, 10, 7, c);
  }
  ctx.restore();
}

function drawCarousel(ctx: CanvasRenderingContext2D, cx: number, groundY: number, t: number): void {
  ellipse(ctx, cx, groundY + 6, 62, 10, "rgba(80,45,40,0.24)");
  px(ctx, cx - 54, groundY - 10, 108, 18, "#e85d75");
  px(ctx, cx - 48, groundY - 16, 96, 8, "#ffd23f");
  ctx.fillStyle = "#ff8a54";
  ctx.beginPath();
  ctx.moveTo(cx - 62, groundY - 18);
  ctx.lineTo(cx, groundY - 66);
  ctx.lineTo(cx + 62, groundY - 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7a3f5a";
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    const px0 = cx + i * 22;
    px(ctx, px0, groundY - 54, 2, 44, "#f7e8a5");
    const bob = Math.sin(t * 4 + i) * 2;
    ellipse(ctx, px0 + 5, groundY - 24 + bob, 9, 5, "#ffffff");
    ellipse(ctx, px0 + 12, groundY - 29 + bob, 4, 4, "#ffffff");
    px(ctx, px0 - 4, groundY - 19 + bob, 15, 4, "#8f6bd8");
  }
}

function drawTicketBooth(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
  px(ctx, x - 38, groundY - 58, 76, 58, "#73c7df");
  px(ctx, x - 44, groundY - 70, 88, 14, "#ff6f91");
  px(ctx, x - 34, groundY - 52, 28, 24, "#fff1be");
  px(ctx, x + 12, groundY - 44, 16, 44, "#4e4660");
  ctx.fillStyle = "#fff8df";
  ctx.font = "bold 9px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TICKETS", x, groundY - 61);
}

function drawBalloonStand(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  px(ctx, x - 6, y + 12, 12, 34, "#7a5537");
  px(ctx, x - 24, y + 42, 48, 8, "#dca85c");
  for (let i = 0; i < 5; i++) {
    const bx = x - 24 + i * 12;
    const by = y - 4 - (i % 2) * 11 + Math.sin(t * 2 + i) * 1.5;
    limb(ctx, x, y + 12, bx, by + 9, 1.1, "rgba(80,60,80,0.55)");
    ellipse(ctx, bx, by, 7, 9, ["#ff6f91", "#ffd23f", "#74d6ff", "#8ff0a4", "#ad7cff"][i]);
  }
}

function drawMountainArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  // sky band scales with the area height so the peaks read even in short zones
  const horizon = Math.round(top + Math.max(36, Math.min(84, (bottom - top) * 0.4)));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#8fd0ff");
  sky.addColorStop(1, "#e6f6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  ellipse(ctx, 64, top + 22, 15, 15, "#fff2b0");
  // far hazy ridge
  ctx.fillStyle = "#8aa8c8";
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(W * 0.12, top + 40);
  ctx.lineTo(W * 0.3, horizon - 12);
  ctx.lineTo(W * 0.5, top + 34);
  ctx.lineTo(W * 0.72, horizon - 10);
  ctx.lineTo(W * 0.88, top + 44);
  ctx.lineTo(W, horizon);
  ctx.closePath();
  ctx.fill();
  // near peaks with snow caps
  for (const [pk, py] of [[W * 0.18, top + 6], [W * 0.46, top + 0], [W * 0.74, top + 10], [W * 0.95, top + 16]] as const) {
    ctx.fillStyle = "#5f7ba0";
    ctx.beginPath();
    ctx.moveTo(pk - W * 0.18, horizon);
    ctx.lineTo(pk, py);
    ctx.lineTo(pk + W * 0.18, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6fbff";
    ctx.beginPath();
    ctx.moveTo(pk - W * 0.045, py + 24);
    ctx.lineTo(pk, py);
    ctx.lineTo(pk + W * 0.045, py + 24);
    ctx.lineTo(pk + W * 0.02, py + 18);
    ctx.lineTo(pk - W * 0.012, py + 25);
    ctx.closePath();
    ctx.fill();
  }
  // alpine meadow
  const ground = ctx.createLinearGradient(0, horizon, 0, bottom);
  ground.addColorStop(0, "#9ed989");
  ground.addColorStop(1, "#5faf6d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  px(ctx, 0, horizon - 2, W, 5, "#b9e6a0");
  for (let x = 30; x < W; x += 92) drawPixelTree(ctx, x, horizon + 30 + (x % 3) * 7, 0.8, x);
  drawFlowerPatch(ctx, 90, horizon + 62, 5);
  // a small wooden cabin
  const cx0 = W - 158;
  const cy0 = horizon + 44;
  px(ctx, cx0, cy0, 74, 40, "#8a6a4a");
  px(ctx, cx0 + 8, cy0 + 14, 16, 26, "#5d4530");
  px(ctx, cx0 + 44, cy0 + 12, 18, 14, "#cfe8f2");
  ctx.fillStyle = "#6d4f36";
  ctx.beginPath();
  ctx.moveTo(cx0 - 8, cy0);
  ctx.lineTo(cx0 + 37, cy0 - 24);
  ctx.lineTo(cx0 + 82, cy0);
  ctx.closePath();
  ctx.fill();
  // drifting birds
  ctx.strokeStyle = "rgba(40,60,80,0.6)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const bx = ((t * 14 + i * 150) % (W + 60)) - 30;
    const by = top + 24 + i * 12 + Math.sin(t * 2 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.quadraticCurveTo(bx - 2, by - 4, bx, by);
    ctx.quadraticCurveTo(bx + 2, by - 4, bx + 5, by);
    ctx.stroke();
  }
}

function drawBeachArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  // bands scale with the area height — the sea must survive short zones
  const seaTop = Math.round(top + Math.max(20, Math.min(42, (bottom - top) * 0.16)));
  const sandTop = Math.round(Math.max(seaTop + 30, top + Math.min(110, (bottom - top) * 0.5))); // sand starts before the walkable band — nobody stands on water
  const sky = ctx.createLinearGradient(0, top, 0, seaTop);
  sky.addColorStop(0, "#7fd4f2");
  sky.addColorStop(1, "#eafaff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, seaTop - top);
  ellipse(ctx, W - 70, top + 20, 16, 16, "#ffe27a");
  // open sea
  const sea = ctx.createLinearGradient(0, seaTop, 0, sandTop);
  sea.addColorStop(0, "#2f9fd8");
  sea.addColorStop(1, "#6cc7ea");
  ctx.fillStyle = sea;
  ctx.fillRect(0, seaTop, W, sandTop - seaTop);
  // a little sailboat drifting by
  const sbx = ((t * 9) % (W + 140)) - 70;
  const sby = seaTop + 20;
  ctx.fillStyle = "#7a4c2e";
  ctx.beginPath();
  ctx.moveTo(sbx - 16, sby + 8);
  ctx.lineTo(sbx + 16, sby + 8);
  ctx.lineTo(sbx + 10, sby + 15);
  ctx.lineTo(sbx - 10, sby + 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(sbx, sby + 6);
  ctx.lineTo(sbx, sby - 16);
  ctx.lineTo(sbx + 13, sby + 4);
  ctx.closePath();
  ctx.fill();
  // animated wave glints
  for (let r = 0; r < 3; r++) {
    const wy = seaTop + 16 + r * 20;
    for (let x = -30; x < W; x += 46) {
      const shift = Math.sin(t * 1.6 + r) * 8;
      px(ctx, x + shift + r * 12, wy, 20, 2, "rgba(255,255,255,0.35)");
    }
  }
  // sand with a foam edge
  const sand = ctx.createLinearGradient(0, sandTop, 0, bottom);
  sand.addColorStop(0, "#f7e3b0");
  sand.addColorStop(1, "#e3c084");
  ctx.fillStyle = sand;
  ctx.fillRect(0, sandTop, W, bottom - sandTop);
  for (let x = -20; x < W; x += 34) {
    const foamShift = Math.sin(t * 1.8 + x * 0.05) * 3;
    px(ctx, x, sandTop + foamShift, 26, 4, "rgba(255,255,255,0.75)");
  }
  // beach umbrella + ball + starfish
  const ux = 96;
  const uy = sandTop + 34;
  px(ctx, ux - 2, uy - 26, 4, 52, "#8a6a4a");
  ctx.fillStyle = "#ff6f7d";
  ctx.beginPath();
  ctx.arc(ux, uy - 24, 34, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff4f5";
  for (const a0 of [Math.PI * 1.16, Math.PI * 1.52, Math.PI * 1.88] as const) {
    ctx.beginPath();
    ctx.moveTo(ux, uy - 24);
    ctx.arc(ux, uy - 24, 34, a0, a0 + Math.PI * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ellipse(ctx, ux + 52, uy + 20, 11, 11, "#ffd23f");
  ellipse(ctx, ux + 48, uy + 17, 5, 5, "#ff6f7d");
  ellipse(ctx, W - 120, bottom - 26, 7, 7, "#ff9a62");
  // gulls
  ctx.strokeStyle = "rgba(70,90,110,0.65)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const gx = ((t * 18 + i * 220) % (W + 60)) - 30;
    const gy = top + 18 + i * 10 + Math.sin(t * 2.4 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(gx - 5, gy);
    ctx.quadraticCurveTo(gx - 2, gy - 4, gx, gy);
    ctx.quadraticCurveTo(gx + 2, gy - 4, gx + 5, gy);
    ctx.stroke();
  }
}

function drawShipDeckArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  // Sky and sea live ONLY in the thin non-walkable strip at the top — the deck
  // fills the entire playable area so people walk on planks, never on water.
  const h = bottom - top;
  const horizon = Math.round(top + Math.max(18, Math.min(34, h * 0.14)));
  const railY = Math.round(top + Math.max(76, Math.min(106, h * 0.24)));
  const deckTop = railY + 12;
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#8ed2f5");
  sky.addColorStop(1, "#e8f8ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  ellipse(ctx, 70, top + 18, 14, 14, "#ffe27a");
  // ocean all around — we are ON the ship
  const sea = ctx.createLinearGradient(0, horizon, 0, deckTop);
  sea.addColorStop(0, "#2c93cf");
  sea.addColorStop(1, "#57b7e4");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, W, deckTop - horizon);
  px(ctx, 0, horizon, W, 2, "rgba(255,255,255,0.5)");
  for (let r = 0; r < 3; r++) {
    const wy = horizon + 12 + r * 16;
    for (let x = -30; x < W; x += 52) {
      const shift = Math.sin(t * 1.5 + r * 1.3) * 9;
      px(ctx, x + shift + r * 14, wy, 22, 2, "rgba(255,255,255,0.3)");
    }
  }
  // a distant island
  ellipse(ctx, W - 130, horizon + 8, 34, 8, "#5e8f6a");
  // white railing between the sea and the deck
  px(ctx, 0, railY, W, 4, "#f4f7fb");
  px(ctx, 0, railY + 12, W, 3, "#e2e9f2");
  for (let x = 10; x < W; x += 42) px(ctx, x, railY, 4, 26, "#eef2f8");
  // lifebuoy on the railing
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ff6f5a";
  ctx.beginPath();
  ctx.arc(W * 0.32, railY + 8, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 7;
  for (const a0 of [0.3, 1.87, 3.44, 5.01] as const) {
    ctx.beginPath();
    ctx.arc(W * 0.32, railY + 8, 12, a0, a0 + 0.5);
    ctx.stroke();
  }
  // warm wooden deck planks
  const deck = ctx.createLinearGradient(0, deckTop, 0, bottom);
  deck.addColorStop(0, "#c89b66");
  deck.addColorStop(1, "#a97e4e");
  ctx.fillStyle = deck;
  ctx.fillRect(0, deckTop, W, bottom - deckTop);
  px(ctx, 0, deckTop, W, 3, "#e0b87e");
  for (let yy = deckTop + 16; yy < bottom; yy += 18) px(ctx, 0, yy, W, 2, "rgba(90,60,30,0.28)");
  for (let x = 40; x < W; x += 120) px(ctx, x, deckTop + 4, 2, bottom - deckTop - 4, "rgba(90,60,30,0.18)");
  // big red-and-white funnel with drifting smoke
  const fx = W - 96;
  px(ctx, fx, deckTop - 74, 46, 52, "#e8574b");
  px(ctx, fx, deckTop - 74, 46, 12, "#2c3346");
  px(ctx, fx - 3, deckTop - 24, 52, 6, "#c94436");
  for (let i = 0; i < 3; i++) {
    // Math.abs keeps the drift/radius valid even if a caller rewinds time
    const drift = Math.abs((t * 12 + i * 34) % 90);
    const sx = fx + 22 + drift * 0.9;
    const sy = deckTop - 84 - drift * 0.5;
    const sr = 6 + drift * 0.1;
    ellipse(ctx, sx, sy, sr, sr * 0.75, "rgba(240,244,250,0.5)");
  }
  // mast with a flapping flag
  px(ctx, 26, deckTop - 88, 4, 66, "#7c6248");
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.moveTo(30, deckTop - 86);
  ctx.quadraticCurveTo(58 + Math.sin(t * 5) * 5, deckTop - 82, 30, deckTop - 72);
  ctx.closePath();
  ctx.fill();
}

function drawFlowerFieldArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  const horizon = Math.round(top + Math.max(30, Math.min(60, (bottom - top) * 0.26)));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#a5ddff");
  sky.addColorStop(1, "#f2fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  ellipse(ctx, W - 66, top + 20, 15, 15, "#ffe27a");
  const cloudShift = (t * 6) % 200;
  for (const [x0, y, sc] of [[90, top + 20, 0.6], [330, top + 30, 0.72]] as const) {
    const x = ((x0 + cloudShift) % (W + 120)) - 70;
    ellipse(ctx, x, y, 20 * sc, 7 * sc, "rgba(255,255,255,0.85)");
    ellipse(ctx, x + 18 * sc, y + 4 * sc, 24 * sc, 8 * sc, "rgba(255,255,255,0.8)");
  }
  // rolling meadow
  const ground = ctx.createLinearGradient(0, horizon, 0, bottom);
  ground.addColorStop(0, "#b4e393");
  ground.addColorStop(1, "#7cc776");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  ellipse(ctx, W * 0.25, horizon + 6, W * 0.3, 14, "#c4eda2");
  ellipse(ctx, W * 0.75, horizon + 10, W * 0.32, 16, "#aede8f");
  // ranks upon ranks of tulips in alternating colours
  const colors = ["#ff6f9f", "#ffd23f", "#b98cff", "#ff8c5a", "#ff5d6c", "#fff2f5"];
  const rows = Math.max(3, Math.floor((bottom - horizon - 40) / 34));
  for (let r = 0; r < rows; r++) {
    const fy = horizon + 30 + r * 34;
    if (fy > bottom - 12) break;
    const sway = Math.sin(t * 1.4 + r) * 2;
    for (let x = 14 + (r % 2) * 13; x < W; x += 26) {
      const c = colors[(r + Math.floor(x / 26)) % colors.length];
      px(ctx, x, fy, 2, 10, "#4d9c55");
      ellipse(ctx, x + 1 + sway, fy - 3, 4.5, 5.5, c);
      ellipse(ctx, x + 1 + sway, fy - 5, 2.2, 2.6, "rgba(255,255,255,0.35)");
    }
  }
  // butterflies
  for (let i = 0; i < 3; i++) {
    const bx = W * 0.2 + ((t * 22 + i * 170) % (W * 0.7));
    const by = horizon + 34 + Math.sin(t * 3 + i * 2) * 14;
    const flap = Math.abs(Math.sin(t * 10 + i));
    ctx.fillStyle = ["#ffd23f", "#ff9ec0", "#9fd8ff"][i];
    ellipse(ctx, bx - 3 * flap, by, 3.4 * flap + 0.8, 4, ["#ffd23f", "#ff9ec0", "#9fd8ff"][i]);
    ellipse(ctx, bx + 3 * flap, by, 3.4 * flap + 0.8, 4, ["#ffd23f", "#ff9ec0", "#9fd8ff"][i]);
    px(ctx, bx - 0.8, by - 4, 1.6, 8, "#4a3a30");
  }
}

function drawSchoolIndoorArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, campus: boolean): void {
  const wallBottom = Math.round(top + Math.min(126, Math.max(88, (bottom - top) * 0.36)));
  const wallTop = campus ? "#c7ecbd" : "#b9e8ff";
  const wallBottomCol = campus ? "#91d584" : "#87cfff";
  const floorTop = campus ? "#d7c487" : "#dba96c";
  const floorBottom = campus ? "#9ec98b" : "#b98552";
  const wall = ctx.createLinearGradient(0, top, 0, wallBottom);
  wall.addColorStop(0, wallTop);
  wall.addColorStop(1, wallBottomCol);
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, W, wallBottom - top);
  drawPixelTrim(ctx, 0, top + 14, W, 8, tint(wallTop, 16), shade(wallBottomCol, 8));
  const floor = ctx.createLinearGradient(0, wallBottom, 0, bottom);
  floor.addColorStop(0, floorTop);
  floor.addColorStop(1, floorBottom);
  ctx.fillStyle = floor;
  ctx.fillRect(0, wallBottom, W, bottom - wallBottom);
  for (let y = wallBottom + 24; y < bottom; y += 46) px(ctx, 0, y, W, 2, "rgba(255,255,255,0.22)");
  for (let x = 24; x < W; x += 58) px(ctx, x, wallBottom, 2, bottom - wallBottom, "rgba(90,70,42,0.16)");

  if (campus) {
    px(ctx, 46, top + 18, 152, 62, "#6f4896");
    px(ctx, 54, top + 26, 136, 46, "#f2e4ae");
    ctx.fillStyle = "#6f4896";
    ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LECTURE", 122, top + 46);
    ctx.fillText("HALL", 122, top + 64);
    for (let x = W - 210; x < W - 38; x += 24) {
      px(ctx, x, wallBottom - 58, 16, 50, "#6a4b8a");
      px(ctx, x + 3, wallBottom - 52, 10, 36, "#f6d66d");
    }
    for (let x = 80; x < W - 92; x += 126) {
      px(ctx, x, bottom - 70, 76, 18, "#7d6547");
      px(ctx, x + 12, bottom - 52, 6, 28, "#5a4734");
      px(ctx, x + 58, bottom - 52, 6, 28, "#5a4734");
    }
    return;
  }

  px(ctx, 54, top + 18, 196, 64, "#284733");
  px(ctx, 50, top + 14, 204, 6, "#74583d");
  ctx.fillStyle = "rgba(244,244,225,0.92)";
  ctx.font = "13px 'Trebuchet MS', monospace";
  ctx.textAlign = "left";
  ctx.fillText("SCIENCE  MATH", 74, top + 44);
  ctx.fillText("TEAM PRACTICE", 74, top + 66);
  for (let i = 0; i < 5; i++) {
    const lx = W - 188 + i * 31;
    px(ctx, lx, top + 24, 24, 78, i % 2 ? "#4d7eb2" : "#3f6fa5");
    px(ctx, lx + 8, top + 58, 8, 3, "#dbe8ff");
  }
  for (let x = 74; x < W - 92; x += 116) {
    px(ctx, x, bottom - 70, 68, 18, "#9a744c");
    px(ctx, x + 9, bottom - 52, 6, 28, "#6a4b32");
    px(ctx, x + 54, bottom - 52, 6, 28, "#6a4b32");
  }
}

function drawSchoolOutdoorArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number, campus: boolean): void {
  const horizon = Math.round(Math.min(top + 56, bottom - 128));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#87d5ff");
  sky.addColorStop(1, "#d7f5ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  ellipse(ctx, W - 64, top + 26, 17, 17, "#ffe27a");
  const cloudShift = (t * 8) % 170;
  for (const [x0, y, s] of [[72, top + 24, 0.7], [310, top + 30, 0.54]] as const) {
    const x = ((x0 + cloudShift) % (W + 120)) - 60;
    ellipse(ctx, x, y, 20 * s, 7 * s, "rgba(255,255,255,0.82)");
    ellipse(ctx, x + 18 * s, y + 4 * s, 24 * s, 8 * s, "rgba(255,255,255,0.76)");
  }

  if (campus) {
    px(ctx, 20, horizon - 30, 150, 30, "#8a65a8");
    px(ctx, 48, horizon - 54, 94, 24, "#9b73bc");
    for (let x = 38; x < 152; x += 28) px(ctx, x, horizon - 22, 16, 18, "#f7e3a8");
  } else {
    px(ctx, 24, horizon - 34, 164, 34, "#658bc0");
    px(ctx, 44, horizon - 54, 124, 20, "#739bd0");
    for (let x = 42; x < 174; x += 28) px(ctx, x, horizon - 25, 14, 16, "#dcecff");
  }

  const grass = ctx.createLinearGradient(0, horizon, 0, bottom);
  grass.addColorStop(0, campus ? "#b4e38b" : "#9fdb76");
  grass.addColorStop(1, campus ? "#65b66c" : "#59a95f");
  ctx.fillStyle = grass;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  px(ctx, 0, horizon - 3, W, 8, "#8ed17f");
  const courtY = Math.round(horizon + (bottom - horizon) * 0.34);
  const courtH = Math.max(74, Math.min(132, bottom - courtY - 48));
  px(ctx, W - 258, courtY, 210, courtH, campus ? "#73b7cf" : "#da8f5f");
  px(ctx, W - 248, courtY + 10, 190, courtH - 20, "rgba(255,255,255,0.16)");
  px(ctx, W - 154, courtY, 3, courtH, "rgba(255,255,255,0.58)");
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.58)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(W - 152, courtY + courtH / 2, 38, 22, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  px(ctx, W - 70, courtY + 20, 8, 42, "#4e5d69");
  px(ctx, W - 86, courtY + 18, 32, 4, "#4e5d69");
  drawPixelTree(ctx, 34, horizon + 48, 0.58, campus ? 9 : 8);
  drawPixelTree(ctx, W - 28, horizon + 52, 0.5, campus ? 11 : 10);
  px(ctx, 38, bottom - 62, 214, 34, campus ? "#d8c078" : "#c35f5f");
  for (let x = 48; x < 244; x += 38) px(ctx, x, bottom - 52, 22, 4, "rgba(255,255,255,0.58)");
}

function drawOfficeIndoorArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  const wallBottom = Math.round(top + Math.min(136, Math.max(96, (bottom - top) * 0.34)));
  const wall = ctx.createLinearGradient(0, top, 0, wallBottom);
  wall.addColorStop(0, "#a5dfcf");
  wall.addColorStop(1, "#69b896");
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, W, wallBottom - top);
  drawPixelTrim(ctx, 0, top + 16, W, 8, "#c4eee0", "#61ad91");
  const floor = ctx.createLinearGradient(0, wallBottom, 0, bottom);
  floor.addColorStop(0, "#9fc9d8");
  floor.addColorStop(1, "#6da5bd");
  ctx.fillStyle = floor;
  ctx.fillRect(0, wallBottom, W, bottom - wallBottom);
  for (let x = 0; x < W; x += 40) px(ctx, x, wallBottom, 2, bottom - wallBottom, "rgba(255,255,255,0.18)");

  window2(ctx, 44, top + 20, 148, 68, "#9ed8ff");
  for (let i = 0; i < 7; i++) px(ctx, 54 + i * 19, top + 75 - (i % 4) * 10, 13, 11 + (i % 4) * 10, "#46647c");
  px(ctx, W - 164, top + 22, 88, 44, "#315b66");
  ctx.fillStyle = "#dff6f2";
  ctx.font = "12px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TEAM", W - 120, top + 42);
  ctx.fillText("GOALS", W - 120, top + 58);

  for (let i = 0; i < 3; i++) {
    const deskX = 76 + i * 168;
    px(ctx, deskX, bottom - 88, 112, 24, "#8b6a4a");
    px(ctx, deskX + 30, bottom - 118, 46, 30, "#232635");
    const screenX = deskX + 35;
    const screenY = bottom - 113;
    px(ctx, screenX, screenY, 36, 20, "#183b56");
    // Tiny moving dashboards make the established office feel occupied without
    // changing its layout or introducing perspective-heavy scenery.
    for (let bar = 0; bar < 4; bar++) {
      const barHeight =
        3 +
        ((bar * 5 + i * 4 + Math.floor(t * 1.4)) % 11);
      px(
        ctx,
        screenX + 4 + bar * 7,
        screenY + 17 - barHeight,
        4,
        barHeight,
        bar % 2 ? "#7cf0cf" : "#6cd7ff"
      );
    }
    px(
      ctx,
      screenX + 3 + ((t * 8 + i * 9) % 28),
      screenY + 2,
      5,
      2,
      "rgba(255,255,255,0.72)"
    );
    ellipse(ctx, deskX + 92, bottom - 94, 5, 4, "#f4eee0");
    px(ctx, deskX + 96, bottom - 96, 3, 5, "#d8c8ad");
    px(ctx, deskX + 16, bottom - 64, 8, 36, "#624a35");
    px(ctx, deskX + 88, bottom - 64, 8, 36, "#624a35");
  }
  // One small plant softens the office while remaining safely behind the lane.
  px(ctx, W - 45, wallBottom - 30, 7, 25, "#517052");
  ellipse(ctx, W - 49, wallBottom - 35, 10, 7, "#4fb676");
  ellipse(ctx, W - 37, wallBottom - 42, 9, 8, "#68c987");
  px(ctx, W - 57, wallBottom - 9, 26, 9, "#c98255");
}

function drawOfficeOutdoorArea(ctx: CanvasRenderingContext2D, W: number, top: number, bottom: number, t: number): void {
  const horizon = Math.round(Math.min(top + 62, bottom - 136));
  const sky = ctx.createLinearGradient(0, top, 0, horizon);
  sky.addColorStop(0, "#8ed7ff");
  sky.addColorStop(1, "#dcf6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, W, horizon - top);
  const cloudShift = (t * 7) % 170;
  for (const [x0, y, s] of [[116, top + 26, 0.62], [360, top + 20, 0.52]] as const) {
    const x = ((x0 + cloudShift) % (W + 110)) - 60;
    ellipse(ctx, x, y, 24 * s, 8 * s, "rgba(255,255,255,0.82)");
    ellipse(ctx, x + 22 * s, y + 5 * s, 26 * s, 9 * s, "rgba(255,255,255,0.76)");
  }
  for (let i = 0; i < 6; i++) {
    const bw = 46 + (i % 3) * 18;
    const bh = 58 + (i % 4) * 22;
    const bx = 22 + i * 94;
    px(ctx, bx, horizon - bh, bw, bh, i % 2 ? "#486a8b" : "#385b7b");
    for (let y = horizon - bh + 12; y < horizon - 8; y += 18) {
      for (let x = bx + 8; x < bx + bw - 8; x += 16) px(ctx, x, y, 7, 8, "rgba(200,236,255,0.45)");
    }
  }
  const plaza = ctx.createLinearGradient(0, horizon, 0, bottom);
  plaza.addColorStop(0, "#b8d988");
  plaza.addColorStop(0.42, "#85c77d");
  plaza.addColorStop(0.43, "#d6c097");
  plaza.addColorStop(1, "#b49168");
  ctx.fillStyle = plaza;
  ctx.fillRect(0, horizon, W, bottom - horizon);
  px(ctx, 0, Math.round(horizon + (bottom - horizon) * 0.42), W, 5, "#e8d59b");
  for (let x = 44; x < W; x += 116) {
    drawPixelTree(ctx, x + 4, horizon + 62, 0.68, x);
  }
  drawFlowerPatch(ctx, 72, horizon + 112, 5);
  px(ctx, W - 178, bottom - 98, 116, 54, "#f6f0da");
  px(ctx, W - 178, bottom - 108, 116, 12, "#37a5c7");
  ctx.fillStyle = "#37515c";
  ctx.font = "12px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("COFFEE", W - 120, bottom - 76);
  px(ctx, W - 74, bottom - 44, 28, 10, "#35323a");
}

function drawFamilyArea(ctx: CanvasRenderingContext2D, scene: SceneKind, theme: RoomTheme, W: number, top: number, H: number, t: number): void {
  const wallBottom = top + 74;
  const wall = scene === "sunset" ? "#f2b082" : tint(theme.wall, 10);
  const floor = scene === "sunset" ? "#b48763" : theme.floor;
  const wallG = ctx.createLinearGradient(0, top, 0, wallBottom);
  wallG.addColorStop(0, tint(wall, 10));
  wallG.addColorStop(1, wall);
  ctx.fillStyle = wallG;
  ctx.fillRect(0, top, W, wallBottom - top);
  drawPixelTrim(ctx, 0, top + 14, W, 8, tint(wall, 26), shade(wall, 10));
  const floorG = ctx.createLinearGradient(0, wallBottom, 0, H);
  floorG.addColorStop(0, tint(floor, 8));
  floorG.addColorStop(1, shade(floor, 14));
  ctx.fillStyle = floorG;
  ctx.fillRect(0, wallBottom, W, H - wallBottom);
  ctx.fillStyle = shade(floor, 20);
  for (let x = 0; x < W; x += 42) ctx.fillRect(x, wallBottom, 2, H - wallBottom);
  px(ctx, 0, wallBottom, W, 3, shade(floor, 22));

  switch (scene) {
    case "nursery": {
      window2(ctx, 58, top + 18, 72, 44, "#bfe6ff");
      px(ctx, W - 164, wallBottom - 48, 96, 36, "#b58a62");
      for (let i = 0; i < 4; i++) px(ctx, W - 154 + i * 21, wallBottom - 41, 12, 26, "#d2a47c");
      px(ctx, 210, wallBottom - 22, 58, 18, "#9ad0ff");
      px(ctx, 222, wallBottom - 46, 34, 30, "#fff2c6");
      break;
    }
    case "playroom": {
      window2(ctx, 58, top + 18, 72, 44, "#bfe6ff");
      px(ctx, W - 178, wallBottom - 50, 126, 42, "#8a6ad6");
      for (let i = 0; i < 8; i++) px(ctx, W - 168 + i * 14, wallBottom - 42 + (i % 2) * 14, 10, 10, ["#ffd23f", "#ff8fd0", "#7fd0ff", "#9be36b"][i % 4]);
      ellipse(ctx, 170 + Math.sin(t * 2) * 4, wallBottom - 8, 11, 11, "#ff6b6b");
      break;
    }
    case "school": {
      px(ctx, 56, top + 14, 190, 54, "#26402f");
      px(ctx, 52, top + 10, 198, 5, "#6a5a3a");
      ctx.fillStyle = "rgba(235,235,220,0.9)";
      ctx.font = "12px 'Trebuchet MS', monospace";
      ctx.textAlign = "left";
      ctx.fillText("A B C  1 2 3", 74, top + 36);
      ctx.fillText("2 + 2 = 4", 74, top + 56);
      for (let i = 0; i < 4; i++) px(ctx, 92 + i * 92, wallBottom - 18, 54, 14, "#9a7a4a");
      break;
    }
    case "campus": {
      window2(ctx, 54, top + 14, 116, 54, "#a9d4ff");
      px(ctx, W - 178, top + 16, 116, 24, "#7a3f9e");
      ctx.fillStyle = "#ffe9a8";
      ctx.font = "12px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("UNIVERSITY", W - 120, top + 34);
      for (let i = 0; i < 8; i++) px(ctx, W - 170 + i * 13, wallBottom - 44 + (i % 2) * 18, 10, 34, ["#ff6b6b", "#6bd0ff", "#9be36b", "#ffd23f"][i % 4]);
      break;
    }
    case "office": {
      window2(ctx, 54, top + 13, 140, 56, "#8fb8e6");
      for (let i = 0; i < 6; i++) px(ctx, 62 + i * 22, top + 63 - (i % 3) * 12, 16, 12 + (i % 3) * 12, "#41506a");
      for (let i = 0; i < 3; i++) {
        const deskX = W - 240 + i * 74;
        px(ctx, deskX, wallBottom - 24, 58, 18, "#8b6a4a");
        px(ctx, deskX + 15, wallBottom - 44, 28, 18, "#222");
        px(ctx, deskX + 18, wallBottom - 41, 22, 12, "#183b56");
        const activity =
          3 + ((i * 4 + Math.floor(t * 1.5)) % 8);
        px(ctx, deskX + 21, wallBottom - 31 - activity, 4, activity, "#6cd7ff");
        px(ctx, deskX + 28, wallBottom - 35, 4, 6, "#7cf0cf");
        px(ctx, deskX + 35, wallBottom - 38, 3, 9, "#ffd36e");
      }
      break;
    }
    case "home": {
      window2(ctx, 60, top + 15, 90, 52, "#bfe0ff");
      px(ctx, W - 218, wallBottom - 34, 132, 26, "#9a5a6a");
      px(ctx, W - 218, wallBottom - 46, 132, 14, "#b06a7a");
      px(ctx, 100, top + 30, 72, 36, "#1c1c24");
      px(ctx, 104, top + 34, 64, 28, "#263f62");
      const tvShift = (t * 10) % 54;
      px(ctx, 108 + tvShift, top + 38, 7, 3, "#ffd36e");
      px(ctx, 110, top + 52, 16, 6, "#65c98a");
      px(ctx, 128, top + 46, 12, 12, "#f08a68");
      px(ctx, 142, top + 50, 20, 8, "#73b9e8");
      break;
    }
    case "sunset": {
      const sky = ctx.createLinearGradient(0, top, 0, wallBottom);
      sky.addColorStop(0, "#ffd6a8");
      sky.addColorStop(0.65, "#ff9e7a");
      sky.addColorStop(1, "#c46a8e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, wallBottom - top);
      ellipse(ctx, 130, top + 45, 16, 16, "#ffe9b0");
      for (let x = 24; x < W; x += 86) px(ctx, x, wallBottom - 28, 40, 28, "#6b5a4b");
      break;
    }
  }
}

function drawZoneDivider(ctx: CanvasRenderingContext2D, W: number, y: number): void {
  px(ctx, 0, y - 8, W, 8, "#365a63");
  px(ctx, 0, y, W, 5, "#f4d67a");
  px(ctx, 0, y + 5, W, 5, "#7a5537");
  for (let x = 18; x < W; x += 48) px(ctx, x, y - 5, 24, 3, "rgba(255,255,255,0.40)");
}

function drawScene(ctx: CanvasRenderingContext2D, scene: SceneKind, theme: RoomTheme, W: number, floorY: number, t: number): void {
  switch (scene) {
    case "nursery": {
      window2(ctx, 70, 36, 78, 56, "#bfe6ff");
      const mx = W * 0.62;
      px(ctx, mx - 26, 12, 52, 3, "#caa6e0");
      const sway = Math.sin(t * 1.5) * 2;
      for (const [dx, col] of [[-22, "#ff9ec0"], [0, "#9ad0ff"], [22, "#b6e3a0"]] as const) {
        px(ctx, mx + dx + sway, 15, 3, 9, "#caa6e0");
        ellipse(ctx, mx + dx + sway + 1.5, 28, 6, 5, col);
      }
      for (let i = 0; i < 3; i++) px(ctx, W - 150 + i * 18, floorY - 16, 15, 15, ["#ff9ec0", "#9ad0ff", "#b6e3a0"][i]);
      break;
    }
    case "playroom": {
      window2(ctx, 60, 34, 74, 52, "#bfe6ff");
      px(ctx, W - 168, 40, 120, 60, shade(theme.wall, 18));
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) px(ctx, W - 160 + c * 28, 48 + r * 28, 18, 18, ["#ffd23f", "#ff8fd0", "#7fd0ff", "#9be36b"][(r + c) % 4]);
      ellipse(ctx, 150, floorY - 8, 9, 9, "#ff6b6b");
      break;
    }
    case "school": {
      px(ctx, 64, 26, 220, 86, "#26402f");
      px(ctx, 60, 22, 228, 6, "#6a5a3a");
      ctx.fillStyle = "rgba(235,235,220,0.9)";
      ctx.font = "13px 'Trebuchet MS', monospace";
      ctx.textAlign = "left";
      ctx.fillText("A B C  1 2 3", 78, 56);
      ctx.fillText("2 + 2 = 4", 78, 80);
      px(ctx, 250, 104, 26, 4, "#caa37a");
      px(ctx, W - 150, 30, 26, 26, "#e8e8ee");
      px(ctx, W - 138, 34, 2, 11, "#333");
      px(ctx, W - 138, 42, 8, 2, "#333");
      for (let i = 0; i < 4; i++) px(ctx, W - 110 + i * 26, 70, 22, 50, i % 2 ? "#5a7a9e" : "#4a6a8e");
      for (let i = 0; i < 3; i++) px(ctx, 80 + i * 80, floorY - 18, 46, 16, "#9a7a4a");
      break;
    }
    case "campus": {
      window2(ctx, 60, 30, 120, 70, "#a9d4ff");
      px(ctx, W - 180, 28, 110, 26, "#7a3f9e");
      ctx.fillStyle = "#ffe9a8";
      ctx.font = "12px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("UNIVERSITY", W - 125, 45);
      px(ctx, W - 150, 64, 96, 56, shade(theme.wall, 16));
      for (let i = 0; i < 8; i++) px(ctx, W - 146 + i * 11, 70 + (i % 2) * 26, 8, 24, ["#ff6b6b", "#6bd0ff", "#9be36b", "#ffd23f"][i % 4]);
      break;
    }
    case "office": {
      window2(ctx, 56, 26, 150, 78, "#8fb8e6");
      for (let i = 0; i < 6; i++) px(ctx, 64 + i * 24, 90 - (i % 3) * 18, 18, 16 + (i % 3) * 18, "#41506a");
      px(ctx, W - 150, 30, 24, 24, "#e8e8ee");
      px(ctx, W - 120, 66, 22, 54, "#9fd6e8");
      px(ctx, W - 96, 78, 6, 42, "#cfe6ee");
      px(ctx, 96, floorY - 26, 60, 18, "#6a7886");
      px(ctx, 110, floorY - 44, 30, 20, "#222");
      px(ctx, 113, floorY - 41, 24, 14, "#5fd0ff");
      break;
    }
    case "home": {
      window2(ctx, 58, 30, 90, 60, "#bfe0ff");
      px(ctx, W - 200, floorY - 34, 120, 26, "#9a5a6a");
      px(ctx, W - 200, floorY - 46, 120, 14, "#b06a7a");
      px(ctx, W - 204, floorY - 44, 12, 36, "#b06a7a");
      px(ctx, W - 92, floorY - 44, 12, 36, "#b06a7a");
      px(ctx, 92, 60, 70, 44, "#1c1c24");
      px(ctx, 96, 64, 62, 36, "#3a4a6a");
      px(ctx, 120, 104, 14, 8, "#1c1c24");
      break;
    }
    case "sunset": {
      px(ctx, 54, 24, 150, 92, "#6a4a5e");
      const grd = ctx.createLinearGradient(0, 24, 0, 116);
      grd.addColorStop(0, "#ffd6a8");
      grd.addColorStop(0.6, "#ff9e7a");
      grd.addColorStop(1, "#c46a8e");
      ctx.fillStyle = grd;
      ctx.fillRect(58, 28, 142, 84);
      ellipse(ctx, 130, 78, 12, 12, "#ffe9b0");
      px(ctx, 58, 96, 142, 16, "#9e6a8a");
      break;
    }
  }
}

function drawHomeQuality(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, floorY: number, q: number): void {
  if (q === 1) {
    for (const [x, y] of [[210, 40], [W - 230, 60], [320, 90]] as const) {
      const c = "rgba(0,0,0,0.30)";
      px(ctx, x, y, 2, 10, c); px(ctx, x + 2, y + 8, 2, 8, c); px(ctx, x - 2, y + 14, 2, 9, c); px(ctx, x + 3, y + 20, 2, 8, c);
    }
    return;
  }
  const paintings = Math.min(q, 4);
  for (let i = 0; i < paintings; i++) {
    const fx = 220 + i * 48;
    px(ctx, fx, 30, 34, 28, "#5a4632");
    px(ctx, fx + 4, 34, 26, 20, theme.accent);
    px(ctx, fx + 4, 45, 26, 9, shade(theme.accent, 26));
  }
  if (q >= 3) drawPlant(ctx, 24, floorY);
  if (q >= 4) {
    px(ctx, 0, 0, W, 5, "#ffd76b");
    drawPlant(ctx, W - 40, floorY);
  }
  if (q >= 5) {
    // luxury villa: a second gold band and a little hanging chandelier
    px(ctx, 0, 6, W, 2, "#ffe9a8");
    const cx = W * 0.5;
    px(ctx, cx - 1, 8, 2, 12, "#caa44a");
    ellipse(ctx, cx, 22, 12, 6, "#ffe27a");
    ellipse(ctx, cx, 22, 7, 4, "#fff4c2");
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, floorY: number): void {
  px(ctx, x, floorY - 10, 16, 10, "#9e6b3f");
  ellipse(ctx, x + 8, floorY - 24, 9, 12, "#3f9e5a");
  ellipse(ctx, x + 8, floorY - 30, 5, 6, "#4fb56b");
}

function drawDoor(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, H: number, gateY: number, doorActive: boolean, t: number): void {
  const r = 29;
  const cx = W - 42;
  const cy = Math.round(Math.max(120 + r, Math.min(H - r - 14, gateY)));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + r + 5, r * 0.9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f1b2f";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = doorActive ? tint(theme.accent, 18) : theme.wallShade;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.stroke();

  const g = ctx.createRadialGradient(cx - 8, cy - 9, 4, cx, cy, r);
  g.addColorStop(0, doorActive ? "#ffffff" : "#5d5268");
  g.addColorStop(0.2, doorActive ? tint(theme.accent, 20) : "#43394f");
  g.addColorStop(1, doorActive ? theme.accent : "#2c2438");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.fill();
  if (doorActive) {
    const a = 0.35 + 0.25 * Math.sin(t * 4);
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
    ctx.stroke();
    drawArrow(ctx, cx + 5, cy, "#27202e");
  } else {
    ellipse(ctx, cx + 8, cy, 3.5, 4, theme.accent);
  }
  ctx.font = "bold 8px 'Trebuchet MS', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff8df";
  ctx.fillText("AGE", cx, cy + r + 14);
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(ctx, x - 10, y - 3, 10, 5, color);
  px(ctx, x - 3, y - 8, 4, 4, color);
  px(ctx, x - 3, y + 4, 4, 4, color);
  px(ctx, x + 1, y - 4, 4, 4, color);
  px(ctx, x + 1, y, 4, 4, color);
}

// ===========================================================================
// Option stations (non-person choices) — higher-res, rounded, shaded
// ===========================================================================

const CAT_TINT: Record<string, string> = {
  health: "#ff5d6c", food: "#ffa14d", fun: "#ff8fd0", smarts: "#5db8ff",
  wealth: "#3ddc84", social: "#ffd23f", rest: "#9c8cff", special: "#ffffff",
};

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const EVENT_MONEY_IDS = new Set([
  "wallet", "refund", "cashback", "redenvelope", "rebate", "coin", "gift",
  "dividend", "garagesale", "referral", "bonus", "loan", "scholarship",
  "promo", "lottery", "crypto", "inherit",
]);
const EVENT_PRIZE_IDS = new Set(["busk", "contest", "raffle", "viral", "gameshow"]);

export type RunnerTokenKind =
  | "money"
  | "health"
  | "happiness"
  | "hazard"
  | "decision";

/** Compact pickup art for the life runner, sharing the event-item style. */
export function drawRunnerToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  kind: RunnerTokenKind
): void {
  ctx.save();
  if (kind === "money") {
    ellipse(ctx, x, footY - 18, 17, 17, "#c5791e");
    ellipse(ctx, x, footY - 21, 15, 15, "#ffd23f");
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ba6b15";
    ctx.font = "bold 18px 'Trebuchet MS', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, footY - 20);
  } else if (kind === "health") {
    const cy = footY - 20;
    ctx.beginPath();
    ctx.moveTo(x, cy + 14);
    ctx.bezierCurveTo(x - 20, cy - 2, x - 12, cy - 16, x, cy - 6);
    ctx.bezierCurveTo(x + 12, cy - 16, x + 20, cy - 2, x, cy + 14);
    ctx.closePath();
    ctx.fillStyle = "#ff5d6c";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ellipse(ctx, x - 5, cy - 5, 3, 3, "#ffd0d6");
  } else if (kind === "happiness") {
    const cy = footY - 20;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 16 : 7;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px2 = x + Math.cos(angle) * radius;
      const py2 = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else if (kind === "hazard") {
    const cy = footY - 20;
    ctx.beginPath();
    ctx.moveTo(x, cy - 17);
    ctx.lineTo(x + 16, cy + 12);
    ctx.lineTo(x - 16, cy + 12);
    ctx.closePath();
    ctx.fillStyle = "#ff8748";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.font = "bold 16px 'Trebuchet MS', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, cy + 3);
  } else {
    const cy = footY - 20;
    ctx.beginPath();
    ctx.moveTo(x, cy - 16);
    ctx.lineTo(x + 13, cy);
    ctx.lineTo(x, cy + 16);
    ctx.lineTo(x - 13, cy);
    ctx.closePath();
    ctx.fillStyle = "#9c8cff";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ellipse(ctx, x, cy, 4, 4, "#f2e8cf");
  }
  ctx.restore();
}

export function drawEventItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  eventId: string,
  emoji: string,
  label: string,
  good: boolean,
  focused: boolean,
  t: number
): void {
  const bob = Math.sin(t * 4 + x * 0.025) * (focused ? 4 : 2);
  const footY = y + bob;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(x, y - 3, focused ? 27 : 22, focused ? 7 : 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (eventId === "puppy") drawPet(ctx, x, footY, "dog", t, { focused, shadow: false });
  else if (eventId === "kitten") drawPet(ctx, x, footY, "cat", t, { focused, shadow: false });
  else if (EVENT_MONEY_IDS.has(eventId)) drawMoneyEvent(ctx, x, footY, eventId, focused);
  else if (!good) drawBadEvent(ctx, x, footY, eventId, focused);
  else if (EVENT_PRIZE_IDS.has(eventId)) drawPrizeEvent(ctx, x, footY, eventId, focused);
  else drawEmojiItem(ctx, x, footY, emoji, good, focused);

  const text = label.length > 18 ? `${label.slice(0, 17)}...` : label;
  ctx.font = `${focused ? "bold " : ""}10px 'Trebuchet MS', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.max(54, ctx.measureText(text).width + 12);
  const ly =
    eventId === "puppy" || eventId === "kitten"
      ? footY - 78
      : footY - 62;
  ctx.fillStyle = focused ? "rgba(42,22,64,0.96)" : "rgba(18,12,30,0.82)";
  rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
  ctx.fill();
  ctx.strokeStyle = good ? (eventId === "puppy" || eventId === "kitten" ? "#ffd23f" : "#3ddc84") : "#ff5d6c";
  ctx.lineWidth = focused ? 2 : 1;
  rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
  ctx.stroke();
  ctx.fillStyle = "#fff8df";
  ctx.fillText(text, x, ly);
  ctx.restore();
}

export interface PetDrawOptions {
  focused?: boolean;
  facing?: PetFacing;
  moving?: boolean;
  phase?: number;
  sitting?: boolean;
  shadow?: boolean;
}

export function drawPet(ctx: CanvasRenderingContext2D, x: number, footY: number, kind: PetKind, t: number, options: PetDrawOptions = {}): void {
  if (
    drawStorybookPet(ctx, x, footY, kind, {
      facing: options.facing,
      moving: options.moving,
      phase: options.phase ?? t,
      sitting: options.sitting,
      focused: options.focused,
      shadow: options.shadow,
    })
  ) {
    return;
  }

  drawLegacyPet(ctx, x, footY, kind, t, options);
}

/** Loading/error fallback retained so a missing optional atlas never stops play. */
function drawLegacyPet(ctx: CanvasRenderingContext2D, x: number, footY: number, kind: PetKind, t: number, options: PetDrawOptions): void {
  const dog = kind === "dog";
  const fur = dog ? "#c68148" : "#7d8794";
  const furLight = dog ? "#e6b17a" : "#b8c1cc";
  const ear = dog ? "#7b4a35" : "#4d5663";
  const focused = !!options.focused;
  const sitting = !!options.sitting;
  const scale = (focused ? 1.08 : 1) * (sitting ? 0.96 : 1);
  const dir = options.facing === "left" ? -1 : 1;
  const wag = dog ? Math.sin(t * 9 + x * 0.04) * 3 : Math.sin(t * 2.2 + x * 0.02) * 2;
  if (options.shadow !== false) {
    ctx.save();
    ctx.globalAlpha = focused ? 0.34 : 0.24;
    ellipse(ctx, x, footY - 3, focused ? 27 : 23, focused ? 7 : 5, "rgba(0,0,0,0.38)");
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, footY);
  ctx.scale(dir * scale, scale);
  const sx = 0;
  const sy = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ellipse(ctx, sx - 7, sy - 24, sitting ? 19 : 21, sitting ? 13 : 12, fur);
  ctx.stroke();
  const legH = sitting ? 10 : 15;
  px(ctx, sx - 20, sy - 16, 5, legH, OUTLINE);
  px(ctx, sx - 18.8, sy - 16, 3, legH - 1, furLight);
  px(ctx, sx + 2, sy - 16, 5, legH, OUTLINE);
  px(ctx, sx + 3.2, sy - 16, 3, legH - 1, furLight);
  ctx.lineWidth = dog ? 3 : 2;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  if (dog) {
    ctx.moveTo(sx - 27, sy - 27);
    ctx.lineTo(sx - 39, sy - 35 + wag);
  } else {
    ctx.moveTo(sx - 28, sy - 27);
    ctx.quadraticCurveTo(sx - 43, sy - 44 + wag, sx - 27, sy - 50);
  }
  ctx.stroke();
  ctx.strokeStyle = dog ? "#d59d6b" : "#9fa8b2";
  ctx.beginPath();
  if (dog) {
    ctx.moveTo(sx - 26, sy - 27);
    ctx.lineTo(sx - 37, sy - 34 + wag);
  } else {
    ctx.moveTo(sx - 27, sy - 28);
    ctx.quadraticCurveTo(sx - 39, sy - 43 + wag, sx - 27, sy - 48);
  }
  ctx.stroke();
  ellipse(ctx, sx + 18, sy - 32, 13, 12, furLight);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (dog) {
    // floppy ears hang BESIDE the head (not on top like a teddy), plus a
    // proper muzzle with a wet nose, a happy tongue and a red collar
    ellipse(ctx, sx + 7, sy - 33, 5.5, 10.5, ear);
    ellipse(ctx, sx + 28, sy - 34, 5, 9.5, shade(ear, 12));
    ellipse(ctx, sx + 28, sy - 26.5, 8.5, 6, furLight);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(sx + 28, sy - 26.5, 8.5, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ellipse(ctx, sx + 34.5, sy - 28.5, 3.2, 2.6, "#2a2024");
    ellipse(ctx, sx + 30, sy - 20.5, 2.6, 3.2, "#ff8f9f");
    px(ctx, sx + 7, sy - 23, 13, 3.4, "#e5484d");
    ellipse(ctx, sx + 13.5, sy - 19.5, 2, 2, "#ffd23f");
  } else {
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy - 40);
    ctx.lineTo(sx + 15, sy - 52);
    ctx.lineTo(sx + 20, sy - 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 21, sy - 40);
    ctx.lineTo(sx + 28, sy - 52);
    ctx.lineTo(sx + 31, sy - 39);
    ctx.fill();
    ctx.fillStyle = ear;
    ctx.beginPath();
    ctx.moveTo(sx + 11, sy - 41);
    ctx.lineTo(sx + 15, sy - 48);
    ctx.lineTo(sx + 18, sy - 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 23, sy - 41);
    ctx.lineTo(sx + 28, sy - 48);
    ctx.lineTo(sx + 29, sy - 40);
    ctx.fill();
  }
  ellipse(ctx, sx + 14, sy - 33, 1.7, 2.2, "#20161c");
  ellipse(ctx, sx + 24, sy - 33, 1.7, 2.2, "#20161c");
  if (!dog) ellipse(ctx, sx + 19, sy - 28, 3.2, 2.2, "#20161c");
  if (!dog) {
    ctx.strokeStyle = "#20161c";
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx + 19 + side * 3, sy - 28);
      ctx.lineTo(sx + 19 + side * 12, sy - 31);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + 19 + side * 3, sy - 27);
      ctx.lineTo(sx + 19 + side * 12, sy - 25);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMoneyEvent(ctx: CanvasRenderingContext2D, x: number, footY: number, eventId: string, focused: boolean): void {
  const coinLike = eventId === "coin" || eventId === "crypto" || eventId === "lottery";
  const envelopeLike = eventId === "redenvelope" || eventId === "gift" || eventId === "inherit";
  const lift = focused ? -2 : 0;
  if (coinLike) {
    ellipse(ctx, x, footY - 30 + lift, 20, 20, "#c5791e");
    ellipse(ctx, x, footY - 33 + lift, 18, 18, "#ffd23f");
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ba6b15";
    ctx.font = "bold 21px 'Trebuchet MS', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, footY - 32 + lift);
    return;
  }
  if (envelopeLike) {
    const c = eventId === "inherit" ? "#f2e8cf" : "#ff5d4f";
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 24, footY - 49 + lift, 48, 31, 5);
    ctx.fill();
    ctx.fillStyle = c;
    rrect(ctx, x - 22, footY - 51 + lift, 44, 29, 5);
    ctx.fill();
    ctx.strokeStyle = eventId === "inherit" ? "#af7a42" : "#ffd23f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 20, footY - 49 + lift);
    ctx.lineTo(x, footY - 33 + lift);
    ctx.lineTo(x + 20, footY - 49 + lift);
    ctx.stroke();
    px(ctx, x - 4, footY - 39 + lift, 8, 8, eventId === "inherit" ? "#af7a42" : "#ffd23f");
    return;
  }
  for (let i = 0; i < 3; i++) {
    const yy = footY - 26 - i * 9 + lift;
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 26 + i * 2, yy - 16, 46, 20, 4);
    ctx.fill();
    ctx.fillStyle = i % 2 ? "#74c989" : "#9ae6aa";
    rrect(ctx, x - 24 + i * 2, yy - 18, 42, 18, 4);
    ctx.fill();
    px(ctx, x - 4 + i * 2, yy - 18, 7, 18, "#f2e8cf");
    ellipse(ctx, x - 14 + i * 2, yy - 9, 4, 4, "#3a8a55");
    ellipse(ctx, x + 10 + i * 2, yy - 9, 4, 4, "#3a8a55");
  }
}

function drawPrizeEvent(ctx: CanvasRenderingContext2D, x: number, footY: number, eventId: string, focused: boolean): void {
  const lift = focused ? -2 : 0;
  if (eventId === "busk") {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 15, footY - 18 + lift);
    ctx.lineTo(x + 15, footY - 50 + lift);
    ctx.stroke();
    ellipse(ctx, x - 9, footY - 26 + lift, 13, 17, "#b86a38");
    ellipse(ctx, x - 9, footY - 26 + lift, 8, 11, "#ffd38a");
    return;
  }
  if (eventId === "gameshow") {
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 24, footY - 52 + lift, 48, 34, 4);
    ctx.fill();
    ctx.fillStyle = "#5db8ff";
    rrect(ctx, x - 21, footY - 49 + lift, 42, 25, 3);
    ctx.fill();
    px(ctx, x - 15, footY - 43 + lift, 30, 5, "#fff4a8");
    px(ctx, x - 9, footY - 34 + lift, 18, 5, "#ff5d6c");
    return;
  }
  ctx.fillStyle = OUTLINE;
  rrect(ctx, x - 18, footY - 44 + lift, 36, 28, 5);
  ctx.fill();
  ctx.fillStyle = "#ff5d6c";
  rrect(ctx, x - 16, footY - 46 + lift, 32, 26, 5);
  ctx.fill();
  px(ctx, x - 2, footY - 46 + lift, 4, 26, "#ffd23f");
  px(ctx, x - 16, footY - 35 + lift, 32, 4, "#ffd23f");
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.moveTo(x, footY - 58 + lift);
  ctx.lineTo(x + 5, footY - 48 + lift);
  ctx.lineTo(x + 16, footY - 47 + lift);
  ctx.lineTo(x + 8, footY - 40 + lift);
  ctx.lineTo(x + 10, footY - 29 + lift);
  ctx.lineTo(x, footY - 35 + lift);
  ctx.lineTo(x - 10, footY - 29 + lift);
  ctx.lineTo(x - 8, footY - 40 + lift);
  ctx.lineTo(x - 16, footY - 47 + lift);
  ctx.lineTo(x - 5, footY - 48 + lift);
  ctx.closePath();
  ctx.fill();
}

function drawBadEvent(ctx: CanvasRenderingContext2D, x: number, footY: number, eventId: string, focused: boolean): void {
  const lift = focused ? -2 : 0;
  if (eventId === "phone") {
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 14, footY - 55 + lift, 28, 42, 5);
    ctx.fill();
    ctx.fillStyle = "#20283c";
    rrect(ctx, x - 11, footY - 51 + lift, 22, 34, 3);
    ctx.fill();
    ctx.strokeStyle = "#ff8a8a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 7, footY - 47 + lift);
    ctx.lineTo(x + 1, footY - 37 + lift);
    ctx.lineTo(x - 4, footY - 31 + lift);
    ctx.lineTo(x + 8, footY - 20 + lift);
    ctx.stroke();
    return;
  }
  if (eventId === "carrepair") {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x - 21, footY - 19 + lift);
    ctx.lineTo(x + 17, footY - 52 + lift);
    ctx.stroke();
    ctx.strokeStyle = "#bdc7d2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 20, footY - 20 + lift);
    ctx.lineTo(x + 16, footY - 51 + lift);
    ctx.stroke();
    ellipse(ctx, x + 18, footY - 52 + lift, 8, 8, "#ff8a8a");
    return;
  }
  if (eventId === "medbill") {
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 20, footY - 55 + lift, 40, 44, 4);
    ctx.fill();
    ctx.fillStyle = "#f2e8cf";
    rrect(ctx, x - 17, footY - 58 + lift, 34, 42, 4);
    ctx.fill();
    px(ctx, x - 4, footY - 51 + lift, 8, 22, "#ff5d6c");
    px(ctx, x - 11, footY - 44 + lift, 22, 8, "#ff5d6c");
    return;
  }
  if (eventId === "crash" || eventId === "scam") {
    ctx.fillStyle = OUTLINE;
    rrect(ctx, x - 24, footY - 51 + lift, 48, 33, 5);
    ctx.fill();
    ctx.fillStyle = eventId === "crash" ? "#252b3d" : "#5a2a33";
    rrect(ctx, x - 21, footY - 49 + lift, 42, 27, 4);
    ctx.fill();
    ctx.strokeStyle = "#ff5d6c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 15, footY - 31 + lift);
    ctx.lineTo(x - 5, footY - 39 + lift);
    ctx.lineTo(x + 4, footY - 34 + lift);
    ctx.lineTo(x + 16, footY - 45 + lift);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(x, footY - 58 + lift);
  ctx.lineTo(x + 27, footY - 14 + lift);
  ctx.lineTo(x - 27, footY - 14 + lift);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.moveTo(x, footY - 54 + lift);
  ctx.lineTo(x + 22, footY - 17 + lift);
  ctx.lineTo(x - 22, footY - 17 + lift);
  ctx.closePath();
  ctx.fill();
  px(ctx, x - 2, footY - 43 + lift, 4, 17, "#4c2a20");
  px(ctx, x - 2, footY - 22 + lift, 4, 4, "#4c2a20");
}

function drawEmojiItem(ctx: CanvasRenderingContext2D, x: number, footY: number, emoji: string, good: boolean, focused: boolean): void {
  const lift = focused ? -2 : 0;
  const fill = good ? "#2e3b49" : "#5a2a33";
  ctx.fillStyle = OUTLINE;
  rrect(ctx, x - 23, footY - 56 + lift, 46, 38, 9);
  ctx.fill();
  ctx.fillStyle = fill;
  rrect(ctx, x - 20, footY - 58 + lift, 40, 36, 9);
  ctx.fill();
  ctx.font = "28px system-ui, 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, footY - 40 + lift);
}

export function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, label: string, category: string, focused: boolean, used: boolean, t: number): void {
  const tintC = CAT_TINT[category] ?? "#ffffff";
  // every object idles with a tiny bob (phase-offset by x so neighbours don't sync)
  const bob = focused ? Math.sin(t * 6) * 3 : Math.sin(t * 2.1 + x * 0.13) * 1.3;
  const size = focused ? 40 : 34; // the object IS the icon now — no UI plate around it
  const cy = y - 7 - size * 0.44 + bob; // low enough that the object SITS on its shadow
  const top = cy - size * 0.62; // kept for the label position below

  ctx.save();
  if (used) ctx.globalAlpha *= 0.45;
  // respect the caller's fade (the engine draws satiated hazards ghostly at 0.18)
  const baseAlpha = ctx.globalAlpha;

  // soft radial contact shadow ON the floor — grounds the object like a real thing
  const shR = size * 0.62;
  const sh = ctx.createRadialGradient(x, y - 3, shR * 0.1, x, y - 3, shR);
  sh.addColorStop(0, "rgba(6,4,12,0.34)");
  sh.addColorStop(0.7, "rgba(6,4,12,0.14)");
  sh.addColorStop(1, "rgba(6,4,12,0)");
  ctx.save();
  ctx.translate(0, y - 3);
  ctx.scale(1, 0.24);
  ctx.translate(0, -(y - 3));
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(x, y - 3, shR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // category-coloured pool of light under the object — keeps the colour signal
  // that the old square border carried, but reads as light, not UI
  const ringR = focused ? 21 : 17;
  ctx.strokeStyle = focused ? "#ffffff" : tintC;
  ctx.globalAlpha = baseAlpha * (focused ? 0.85 : 0.55);
  ctx.lineWidth = focused ? 2.4 : 1.8;
  ctx.beginPath();
  ctx.ellipse(x, y - 3, ringR, ringR * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = baseAlpha;

  // a faint glow behind the object lifts it out of the room
  const glow = ctx.createRadialGradient(x, cy, 1, x, cy, size * 0.85);
  const ga = focused ? 0.34 : 0.18;
  glow.addColorStop(0, colorParts(tintC) ? `rgba(${colorParts(tintC)![0]},${colorParts(tintC)![1]},${colorParts(tintC)![2]},${ga})` : `rgba(255,255,255,${ga})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, cy, size * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // the object itself: a large free-standing icon with a real drop shadow
  ctx.font = `${size}px system-ui, 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(8,5,16,0.5)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(icon, x, cy);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (used) {
    ctx.fillStyle = "#3ddc84";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText("✓", x + size * 0.55, cy - size * 0.45);
  }
  ctx.restore();

  // always-on label (above the plate, clear of characters) so every choice reads
  ctx.font = `${focused ? "bold " : ""}10px 'Trebuchet MS', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(label).width + 12;
  const ly = top - 9;
  ctx.save();
  if (used) ctx.globalAlpha = 0.6;
  ctx.fillStyle = focused ? "rgba(42,22,64,0.95)" : "rgba(18,12,30,0.8)";
  rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
  ctx.fill();
  if (focused) {
    ctx.strokeStyle = tintC;
    ctx.lineWidth = 1.5;
    rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
    ctx.stroke();
  }
  ctx.fillStyle = focused ? "#ffffff" : "rgba(244,239,255,0.92)";
  ctx.fillText(label, x, ly);
  ctx.restore();
}
