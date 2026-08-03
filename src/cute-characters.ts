import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
} from "./types";

export type CuteFacing = "front" | "left" | "right" | "back";

export interface CuteCharacterMotion {
  moving: boolean;
  facing: CuteFacing;
  verticalBias: number;
  pose?: "stand" | "sit";
}

export interface CuteCharacterLook {
  /** Exact v5 life-stage profile used to select generated storybook art. */
  lifeStageIndex?: number;
  /** Complete storybook identity; omitted legacy looks use "classic". */
  appearance?: CharacterAppearanceId;
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
  iris?: string;
}

export interface CuteGeometry {
  height: number;
  headHeight: number;
  headWidth: number;
  bodyHeight: number;
  legHeight: number;
  shoulderWidth: number;
  torsoWidth: number;
  hipWidth: number;
  limbWidth: number;
  shoeWidth: number;
  silhouetteWidth: number;
}

const OUTLINE = "#49302f";
const DEEP = "#2e2024";
const WHITE = "#fff9e9";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function colorParts(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!hex) return null;
  return [
    parseInt(hex[1].slice(0, 2), 16),
    parseInt(hex[1].slice(2, 4), 16),
    parseInt(hex[1].slice(4, 6), 16),
  ];
}

function mix(color: string, amount: number): string {
  const parts = colorParts(color);
  if (!parts) return color;
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.min(1, Math.abs(amount) / 100);
  const values = parts.map((part) => Math.round(part + (target - part) * weight));
  return `rgb(${values[0]},${values[1]},${values[2]})`;
}

const shade = (color: string, amount = 24): string => mix(color, -amount);
const tint = (color: string, amount = 24): string => mix(color, amount);
const snap = (value: number): number => Math.round(value * 2) / 2;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillStroke(
  ctx: CanvasRenderingContext2D,
  fill: string,
  outlineWidth = 1.6
): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  outlineWidth = 1.5
): void {
  ctx.beginPath();
  ctx.ellipse(snap(x), snap(y), Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  fillStroke(ctx, fill, outlineWidth);
}

function softLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  fill: string
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 2.6;
  ctx.beginPath();
  ctx.moveTo(snap(x1), snap(y1));
  ctx.lineTo(snap(x2), snap(y2));
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(snap(x1), snap(y1));
  ctx.lineTo(snap(x2), snap(y2));
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = tint(fill, 30);
  ctx.lineWidth = Math.max(0.7, width * 0.18);
  ctx.beginPath();
  ctx.moveTo(snap(x1 - width * 0.16), snap(y1));
  ctx.lineTo(snap(x2 - width * 0.16), snap(y2));
  ctx.stroke();
  ctx.restore();
}

function fourBeat(phase: number): { swing: number; bounce: number; frame: number } {
  const tau = Math.PI * 2;
  const normalized = ((phase % tau) + tau) % tau;
  const frame = Math.floor(normalized / (Math.PI / 2)) % 4;
  const swing = [0.85, 0.12, -0.85, -0.12][frame];
  const bounce = [0, 1, 0, 1][frame];
  return { swing, bounce, frame };
}

export function cuteGeometry(look: CuteCharacterLook): CuteGeometry {
  const height = Math.max(54, look.heightPx);
  const ratio = clamp(look.headRatio, look.baby ? 0.46 : 0.28, 0.54);
  const headHeight = height * ratio;
  const headWidth =
    headHeight *
    (look.baby ? 0.98 : look.child ? 0.92 : look.elder ? 0.9 : 0.87) *
    (1 + look.chub * 0.035);
  const remainder = height - headHeight;
  const bodyHeight = remainder * (look.baby ? 0.38 : look.child ? 0.43 : 0.45);
  const legHeight = remainder - bodyHeight - height * 0.025;
  const adult = !look.baby && !look.child;
  const adultShoulderFactor =
    look.gender === "male" ? 0.9 : 0.81;
  const shoulderWidth = Math.max(
    headWidth * (look.child ? 0.76 : adultShoulderFactor),
    height * (adult && look.gender === "male" ? 0.235 : 0.22)
  );
  const torsoWidth =
    shoulderWidth *
    (adult && look.gender === "female" ? 0.96 : 0.94) *
    (1 + look.chub * 0.06);
  const hipWidth =
    torsoWidth *
    (look.skirt
      ? adult && look.gender === "female"
        ? 1.1
        : 1.02
      : adult && look.gender === "female"
        ? 1.03 + look.chub * 0.05
        : 0.9 + look.chub * 0.05);
  const limbWidth = height * (0.064 + look.chub * 0.009);
  const shoeWidth = height * (look.child ? 0.13 : 0.125);
  return {
    height,
    headHeight,
    headWidth,
    bodyHeight,
    legHeight,
    shoulderWidth,
    torsoWidth,
    hipWidth,
    limbWidth,
    shoeWidth,
    silhouetteWidth: Math.max(headWidth * 1.12, shoulderWidth + limbWidth * 1.5),
  };
}

function groundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  width: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = DEEP;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 1, width * 0.54, Math.max(2.5, width * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShoe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  facing: -1 | 1
): void {
  const toe = x + facing * width * 0.12;
  oval(ctx, toe, y, width * 0.55, height * 0.5, color, 1.45);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = tint(color, 55);
  ctx.lineWidth = Math.max(0.7, height * 0.13);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(toe - width * 0.23, y - height * 0.08);
  ctx.lineTo(toe + width * 0.22, y - height * 0.08);
  ctx.stroke();
  ctx.restore();
}

function drawBackHair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook,
  bodyTop: number
): void {
  if (look.hairStyle === "long") {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * headW * 0.18, cy - headH * 0.42);
      ctx.quadraticCurveTo(
        cx + side * headW * 0.62,
        cy - headH * 0.18,
        cx + side * headW * 0.54,
        bodyTop + headH * 0.72
      );
      ctx.quadraticCurveTo(
        cx + side * headW * 0.4,
        bodyTop + headH * 0.88,
        cx + side * headW * 0.28,
        bodyTop + headH * 0.66
      );
      ctx.quadraticCurveTo(
        cx + side * headW * 0.34,
        cy + headH * 0.12,
        cx + side * headW * 0.18,
        cy - headH * 0.42
      );
      ctx.closePath();
      fillStroke(ctx, shade(look.hair, 8), 1.55);
    }
  }
  if (look.hairStyle === "bun") {
    oval(ctx, cx, cy - headH * 0.52, headW * 0.25, headH * 0.2, look.hair, 1.55);
  }
}

function drawHairCap(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook,
  back = false
): void {
  const top = cy - headH * 0.5;
  const shortBack = back && look.hairStyle === "short";
  const bottom = back
    ? cy + headH * (shortBack ? 0.08 : 0.35)
    : cy - headH * 0.02;
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.49, bottom);
  ctx.quadraticCurveTo(cx - headW * 0.55, top - headH * 0.04, cx, top - headH * 0.08);
  ctx.quadraticCurveTo(cx + headW * 0.55, top - headH * 0.04, cx + headW * 0.49, bottom);
  if (back) {
    const backDepth = shortBack ? 0.19 : 0.51;
    ctx.quadraticCurveTo(cx + headW * 0.42, cy + headH * backDepth, cx, cy + headH * (backDepth + 0.01));
    ctx.quadraticCurveTo(cx - headW * 0.42, cy + headH * backDepth, cx - headW * 0.49, bottom);
  } else {
    ctx.quadraticCurveTo(cx + headW * 0.24, cy - headH * 0.14, cx + headW * 0.05, cy - headH * 0.08);
    ctx.quadraticCurveTo(cx - headW * 0.12, cy - headH * 0.2, cx - headW * 0.49, bottom);
  }
  ctx.closePath();
  fillStroke(ctx, look.hair, 1.65);

  ctx.save();
  ctx.globalAlpha = 0.52;
  ctx.strokeStyle = tint(look.hair, look.elder ? 18 : 35);
  ctx.lineWidth = Math.max(0.8, headW * 0.035);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.22, top + headH * 0.03);
  ctx.quadraticCurveTo(cx - headW * 0.08, top - headH * 0.02, cx + headW * 0.08, top + headH * 0.02);
  ctx.stroke();
  ctx.restore();

  if (look.hairTexture === "coily") {
    for (const offset of [-0.36, -0.18, 0, 0.18, 0.36]) {
      oval(
        ctx,
        cx + headW * offset,
        top + headH * (0.02 + Math.abs(offset) * 0.12),
        headW * 0.12,
        headH * 0.1,
        look.hair,
        1.15
      );
    }
  } else if (look.hairTexture === "wavy" && !back) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = shade(look.hair, 30);
    ctx.lineWidth = Math.max(0.75, headW * 0.024);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.3, top + headH * 0.08);
    ctx.quadraticCurveTo(cx - headW * 0.08, top + headH * 0.18, cx + headW * 0.17, top + headH * 0.07);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFrontFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook
): void {
  const eyeY = cy - headH * 0.015;
  const eyeDX = headW * 0.235;
  const eyeRX = headW * (look.child ? 0.105 : 0.095);
  const eyeRY = eyeRX * 1.18;
  const iris = look.iris ?? "#59412f";

  for (const side of [-1, 1]) {
    const ex = cx + side * eyeDX;
    oval(ctx, ex, eyeY, eyeRX, eyeRY, WHITE, 1.05);
    oval(ctx, ex, eyeY + eyeRY * 0.08, eyeRX * 0.65, eyeRY * 0.72, iris, 0.7);
    oval(ctx, ex, eyeY + eyeRY * 0.17, eyeRX * 0.33, eyeRY * 0.43, DEEP, 0);
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(ex - eyeRX * 0.24, eyeY - eyeRY * 0.24, Math.max(0.7, eyeRX * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + eyeRX * 0.2, eyeY + eyeRY * 0.06, Math.max(0.45, eyeRX * 0.1), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = shade(look.hair, 10);
    ctx.lineWidth = Math.max(0.9, headW * 0.026);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - eyeRX * 0.8, eyeY - eyeRY * 1.55);
    ctx.quadraticCurveTo(ex, eyeY - eyeRY * 1.8, ex + eyeRX * 0.8, eyeY - eyeRY * 1.48);
    ctx.stroke();
    if (look.gender === "female" && !look.elder) {
      ctx.lineWidth = Math.max(0.65, headW * 0.016);
      ctx.beginPath();
      ctx.moveTo(ex + side * eyeRX * 0.75, eyeY - eyeRY * 0.62);
      ctx.lineTo(ex + side * eyeRX * 1.22, eyeY - eyeRY * 0.98);
      ctx.stroke();
    }
  }

  ctx.fillStyle = shade(look.skin, 14);
  ctx.beginPath();
  ctx.arc(cx + headW * 0.018, cy + headH * 0.13, Math.max(0.65, headW * 0.022), 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#f07f86";
  ctx.beginPath();
  ctx.ellipse(cx - headW * 0.33, cy + headH * 0.16, headW * 0.105, headH * 0.055, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + headW * 0.33, cy + headH * 0.16, headW * 0.105, headH * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const mouthY = cy + headH * 0.255;
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, headW * (look.child ? 0.16 : 0.15), headH * 0.056, 0, 0, Math.PI * 2);
  fillStroke(ctx, "#6d3037", 0.85);
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.roundRect?.(cx - headW * 0.08, mouthY - headH * 0.05, headW * 0.16, headH * 0.035, headH * 0.012);
  if (typeof ctx.roundRect === "function") ctx.fill();
  else {
    ctx.fillRect(cx - headW * 0.08, mouthY - headH * 0.05, headW * 0.16, headH * 0.035);
  }
  ctx.fillStyle = "#ef8290";
  ctx.beginPath();
  ctx.ellipse(cx, mouthY + headH * 0.04, headW * 0.075, headH * 0.026, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.elder) {
    ctx.strokeStyle = "#6b5148";
    ctx.lineWidth = Math.max(0.9, headW * 0.025);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * eyeDX, eyeY, eyeRX * 1.45, eyeRY * 1.27, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - eyeDX + eyeRX * 1.4, eyeY);
    ctx.lineTo(cx + eyeDX - eyeRX * 1.4, eyeY);
    ctx.stroke();
  }
}

function drawHeadFront(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook,
  bodyTop: number
): void {
  drawBackHair(ctx, cx, cy, headW, headH, look, bodyTop);
  oval(ctx, cx - headW * 0.48, cy + headH * 0.03, headW * 0.09, headH * 0.105, look.skin, 1.25);
  oval(ctx, cx + headW * 0.48, cy + headH * 0.03, headW * 0.09, headH * 0.105, look.skin, 1.25);
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.45, cy - headH * 0.12);
  ctx.quadraticCurveTo(cx - headW * 0.5, cy - headH * 0.47, cx, cy - headH * 0.5);
  ctx.quadraticCurveTo(cx + headW * 0.5, cy - headH * 0.47, cx + headW * 0.45, cy - headH * 0.12);
  ctx.quadraticCurveTo(cx + headW * 0.43, cy + headH * 0.34, cx, cy + headH * 0.47);
  ctx.quadraticCurveTo(cx - headW * 0.43, cy + headH * 0.34, cx - headW * 0.45, cy - headH * 0.12);
  ctx.closePath();
  fillStroke(ctx, look.skin, 1.7);
  drawFrontFace(ctx, cx, cy, headW, headH, look);
  drawHairCap(ctx, cx, cy, headW, headH, look);
}

function drawBackHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook,
  bodyTop: number
): void {
  drawBackHair(ctx, cx, cy, headW, headH, look, bodyTop);
  oval(ctx, cx, cy, headW * 0.49, headH * 0.5, shade(look.skin, 2), 1.6);
  drawHairCap(ctx, cx, cy, headW, headH, look, true);
  if (look.hairStyle === "long") {
    for (const side of [-1, 1]) {
      ctx.strokeStyle = shade(look.hair, 24);
      ctx.lineWidth = Math.max(0.75, headW * 0.024);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + side * headW * 0.2, cy + headH * 0.1);
      ctx.quadraticCurveTo(
        cx + side * headW * 0.34,
        bodyTop + headH * 0.34,
        cx + side * headW * 0.36,
        bodyTop + headH * 0.67
      );
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = tint(look.hair, 34);
      ctx.lineWidth = Math.max(0.65, headW * 0.018);
      ctx.beginPath();
      ctx.moveTo(cx + side * headW * 0.3, cy + headH * 0.05);
      ctx.quadraticCurveTo(
        cx + side * headW * 0.42,
        bodyTop + headH * 0.35,
        cx + side * headW * 0.39,
        bodyTop + headH * 0.58
      );
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = shade(look.hair, 28);
  ctx.lineWidth = Math.max(0.8, headW * 0.026);
  ctx.beginPath();
  ctx.moveTo(cx, cy - headH * 0.42);
  ctx.quadraticCurveTo(
    cx - headW * 0.04,
    cy - headH * 0.06,
    cx,
    cy + headH * (look.hairStyle === "short" ? 0.1 : 0.34)
  );
  ctx.stroke();
  ctx.restore();
}

function drawSideHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  headW: number,
  headH: number,
  look: CuteCharacterLook,
  dir: -1 | 1,
  bodyTop: number
): void {
  drawBackHair(ctx, cx - dir * headW * 0.04, cy, headW, headH, look, bodyTop);
  oval(ctx, cx, cy, headW * 0.47, headH * 0.49, look.skin, 1.65);

  ctx.beginPath();
  ctx.moveTo(cx + dir * headW * 0.39, cy - headH * 0.08);
  ctx.quadraticCurveTo(
    cx + dir * headW * 0.53,
    cy - headH * 0.02,
    cx + dir * headW * 0.47,
    cy + headH * 0.06
  );
  ctx.quadraticCurveTo(cx + dir * headW * 0.41, cy + headH * 0.1, cx + dir * headW * 0.36, cy + headH * 0.1);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.45;
  ctx.stroke();

  const eyeX = cx + dir * headW * 0.2;
  const eyeY = cy - headH * 0.015;
  const eyeR = headW * 0.105;
  oval(ctx, eyeX, eyeY, eyeR, eyeR * 1.14, WHITE, 1);
  oval(ctx, eyeX + dir * eyeR * 0.1, eyeY + eyeR * 0.08, eyeR * 0.59, eyeR * 0.7, look.iris ?? "#59412f", 0.65);
  oval(ctx, eyeX + dir * eyeR * 0.14, eyeY + eyeR * 0.13, eyeR * 0.29, eyeR * 0.38, DEEP, 0);
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(eyeX - dir * eyeR * 0.15, eyeY - eyeR * 0.2, Math.max(0.6, eyeR * 0.18), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7f3840";
  ctx.lineWidth = Math.max(1, headW * 0.03);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + dir * headW * 0.18, cy + headH * 0.24);
  ctx.quadraticCurveTo(cx + dir * headW * 0.26, cy + headH * 0.28, cx + dir * headW * 0.32, cy + headH * 0.23);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#ee8188";
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * headW * 0.08,
    cy + headH * 0.16,
    headW * 0.075,
    headH * 0.038,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  drawHairCap(ctx, cx - dir * headW * 0.04, cy, headW, headH, look);
  if (look.elder) {
    ctx.strokeStyle = "#6b5148";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, eyeR * 1.45, eyeR * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawOutfitDetail(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  width: number,
  height: number,
  look: CuteCharacterLook,
  back = false
): void {
  ctx.save();
  ctx.strokeStyle = tint(look.shirt, 46);
  ctx.fillStyle = tint(look.shirt, 46);
  ctx.lineWidth = Math.max(0.8, width * 0.035);
  ctx.lineCap = "round";
  if (back) {
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.22, top + height * 0.2);
    ctx.quadraticCurveTo(cx, top + height * 0.32, cx + width * 0.22, top + height * 0.2);
    ctx.stroke();
  } else if (look.outfitStyle === "asian") {
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.24, top + height * 0.1);
    ctx.lineTo(cx + width * 0.06, top + height * 0.31);
    ctx.lineTo(cx + width * 0.27, top + height * 0.13);
    ctx.stroke();
  } else if (look.outfitStyle === "middleEastern") {
    ctx.beginPath();
    ctx.moveTo(cx, top + height * 0.12);
    ctx.lineTo(cx, top + height * 0.72);
    ctx.stroke();
    for (const y of [0.3, 0.46, 0.62]) {
      ctx.beginPath();
      ctx.arc(cx, top + height * y, Math.max(0.75, width * 0.025), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.outfitStyle === "africanDiaspora") {
    for (const side of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * width * 0.16, top + height * 0.17);
      ctx.lineTo(cx + side * width * 0.16 - width * 0.045, top + height * 0.26);
      ctx.lineTo(cx + side * width * 0.16 + width * 0.045, top + height * 0.26);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, top + height * 0.14);
    ctx.lineTo(cx, top + height * 0.76);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.26, top + height * 0.12);
    ctx.quadraticCurveTo(cx, top + height * 0.31, cx + width * 0.26, top + height * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTorso(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  width: number,
  height: number,
  look: CuteCharacterLook,
  back = false
): void {
  const adult = !look.baby && !look.child;
  if (adult && look.gender === "female") {
    // The deterministic fallback must keep the same adult gender separation as
    // the reviewed raster art. A softly shaped chest and waist read as a
    // healthy adult woman at gameplay scale without exaggerated anatomy.
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.34, top);
    ctx.quadraticCurveTo(
      cx - width * 0.53,
      top + height * 0.23,
      cx - width * 0.48,
      top + height * 0.43
    );
    ctx.quadraticCurveTo(
      cx - width * 0.39,
      top + height * 0.7,
      cx - width * 0.43,
      top + height
    );
    ctx.lineTo(cx + width * 0.43, top + height);
    ctx.quadraticCurveTo(
      cx + width * 0.39,
      top + height * 0.7,
      cx + width * 0.48,
      top + height * 0.43
    );
    ctx.quadraticCurveTo(
      cx + width * 0.53,
      top + height * 0.23,
      cx + width * 0.34,
      top
    );
    ctx.closePath();
  } else if (adult && look.gender === "male") {
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.5, top + height * 0.04);
    ctx.quadraticCurveTo(
      cx - width * 0.48,
      top,
      cx - width * 0.4,
      top
    );
    ctx.lineTo(cx + width * 0.4, top);
    ctx.quadraticCurveTo(
      cx + width * 0.48,
      top,
      cx + width * 0.5,
      top + height * 0.04
    );
    ctx.lineTo(cx + width * 0.42, top + height);
    ctx.lineTo(cx - width * 0.42, top + height);
    ctx.closePath();
  } else {
    roundedRectPath(
      ctx,
      cx - width / 2,
      top,
      width,
      height,
      Math.min(width * 0.24, height * 0.2)
    );
  }
  fillStroke(ctx, look.shirt, 1.65);
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = tint(look.shirt, 28);
  roundedRectPath(
    ctx,
    cx - width * 0.37,
    top + height * 0.06,
    width * 0.18,
    height * 0.77,
    width * 0.08
  );
  ctx.fill();
  ctx.restore();
  drawOutfitDetail(ctx, cx, top, width, height, look, back);
}

function drawSkirtOrPelvis(
  ctx: CanvasRenderingContext2D,
  cx: number,
  hipY: number,
  geo: CuteGeometry,
  look: CuteCharacterLook
): void {
  if (look.skirt) {
    const height = geo.height * (look.child ? 0.12 : 0.135);
    ctx.beginPath();
    ctx.moveTo(cx - geo.torsoWidth * 0.42, hipY - height * 0.18);
    ctx.lineTo(cx - geo.hipWidth * 0.65, hipY + height);
    ctx.quadraticCurveTo(cx, hipY + height * 1.08, cx + geo.hipWidth * 0.65, hipY + height);
    ctx.lineTo(cx + geo.torsoWidth * 0.42, hipY - height * 0.18);
    ctx.closePath();
    fillStroke(ctx, look.pants, 1.55);
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = tint(look.pants, 35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - geo.hipWidth * 0.18, hipY + height * 0.08);
    ctx.lineTo(cx - geo.hipWidth * 0.24, hipY + height * 0.86);
    ctx.stroke();
    ctx.restore();
  } else {
    roundedRectPath(
      ctx,
      cx - geo.hipWidth / 2,
      hipY - geo.height * 0.025,
      geo.hipWidth,
      geo.height * 0.11,
      geo.hipWidth * 0.18
    );
    fillStroke(ctx, look.pants, 1.55);
  }
}

function drawFrontStanding(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  phase: number,
  motion: CuteCharacterMotion
): void {
  const geo = cuteGeometry(look);
  const beat = fourBeat(phase);
  const swing = motion.moving ? beat.swing : 0;
  const bob = motion.moving
    ? beat.bounce * geo.height * 0.012
    : Math.sin(phase * 0.45) * geo.height * 0.004;
  const baseY = footY - bob;
  const shoeH = geo.height * 0.065;
  const hipY = baseY - shoeH - geo.legHeight;
  const bodyTop = hipY - geo.bodyHeight;
  const headCy = bodyTop - geo.headHeight * 0.46;
  const legFill = look.skirt ? look.skin : look.pants;
  const step = swing * geo.height * 0.035;
  const legGap = geo.hipWidth * 0.22;
  const shoeY = baseY - shoeH * 0.46;

  groundShadow(ctx, cx, footY, geo.silhouetteWidth);

  for (const side of [-1, 1] as const) {
    const far = side === (swing > 0 ? -1 : 1);
    if (!far) continue;
    const x = cx + side * legGap + side * step;
    softLine(ctx, cx + side * legGap * 0.7, hipY, x, shoeY - shoeH * 0.35, geo.limbWidth * 1.02, shade(legFill, 3));
    drawShoe(ctx, x, shoeY, geo.shoeWidth, shoeH, look.shoes, side);
  }
  for (const side of [-1, 1] as const) {
    const far = side === (swing > 0 ? -1 : 1);
    if (far) continue;
    const x = cx + side * legGap + side * step;
    softLine(ctx, cx + side * legGap * 0.7, hipY, x, shoeY - shoeH * 0.35, geo.limbWidth * 1.02, legFill);
    drawShoe(ctx, x, shoeY, geo.shoeWidth, shoeH, look.shoes, side);
  }

  const shoulderY = bodyTop + geo.bodyHeight * 0.21;
  const handY = hipY + geo.legHeight * (look.child ? 0.04 : 0.07);
  const armSwing = swing * geo.height * 0.025;
  for (const side of [-1, 1] as const) {
    const shoulderX = cx + side * geo.shoulderWidth * 0.42;
    const elbowX = cx + side * (geo.torsoWidth * 0.57 + armSwing);
    const elbowY = bodyTop + geo.bodyHeight * (side < 0 ? 0.61 : 0.56);
    const relaxedPose = !motion.moving && side > 0;
    const finalElbowX = relaxedPose ? cx + side * geo.shoulderWidth * 0.62 : elbowX;
    const finalElbowY = relaxedPose ? bodyTop + geo.bodyHeight * 0.5 : elbowY;
    const handX = relaxedPose
      ? cx + side * geo.hipWidth * 0.34
      : cx + side * (geo.hipWidth * 0.58 + armSwing * 1.15);
    const finalHandY = relaxedPose ? hipY - geo.height * 0.015 : handY;
    softLine(ctx, shoulderX, shoulderY, finalElbowX, finalElbowY, geo.limbWidth * 0.84, shade(look.shirt, 5));
    softLine(ctx, finalElbowX, finalElbowY, handX, finalHandY, geo.limbWidth * 0.76, look.shirt);
    oval(ctx, handX, finalHandY + geo.limbWidth * 0.05, geo.limbWidth * 0.46, geo.limbWidth * 0.55, look.skin, 1.2);
  }

  drawSkirtOrPelvis(ctx, cx, hipY, geo, look);
  drawTorso(ctx, cx, bodyTop, geo.torsoWidth, geo.bodyHeight, look);
  oval(ctx, cx, bodyTop + geo.height * 0.008, geo.headWidth * 0.16, geo.height * 0.025, look.skin, 1.1);
  drawHeadFront(ctx, cx, headCy, geo.headWidth, geo.headHeight, look, bodyTop);

  if (look.elder) {
    const handX = cx + geo.hipWidth * 0.63;
    const handY2 = hipY + geo.legHeight * 0.08;
    ctx.lineCap = "round";
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(handX, handY2 - geo.height * 0.01);
    ctx.lineTo(cx + geo.silhouetteWidth * 0.48, footY);
    ctx.stroke();
    ctx.strokeStyle = "#8b633c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(handX - geo.height * 0.008, handY2 - geo.height * 0.012, geo.height * 0.018, Math.PI * 1.15, Math.PI * 2.02);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = "#8b633c";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function drawBackStanding(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  phase: number,
  motion: CuteCharacterMotion
): void {
  const geo = cuteGeometry(look);
  const beat = fourBeat(phase);
  const swing = motion.moving ? beat.swing : 0;
  const bob = motion.moving ? beat.bounce * geo.height * 0.012 : 0;
  const baseY = footY - bob;
  const shoeH = geo.height * 0.065;
  const hipY = baseY - shoeH - geo.legHeight;
  const bodyTop = hipY - geo.bodyHeight;
  const headCy = bodyTop - geo.headHeight * 0.46;
  const step = swing * geo.height * 0.034;
  const legGap = geo.hipWidth * 0.22;
  const shoeY = baseY - shoeH * 0.46;
  const legFill = look.skirt ? look.skin : look.pants;

  groundShadow(ctx, cx, footY, geo.silhouetteWidth);
  for (const side of [-1, 1] as const) {
    const x = cx + side * legGap + side * step;
    softLine(
      ctx,
      cx + side * legGap * 0.7,
      hipY,
      x,
      shoeY - shoeH * 0.35,
      geo.limbWidth,
      legFill
    );
    drawShoe(ctx, x, shoeY, geo.shoeWidth, shoeH, look.shoes, side);
  }

  drawSkirtOrPelvis(ctx, cx, hipY, geo, look);
  drawTorso(ctx, cx, bodyTop, geo.torsoWidth, geo.bodyHeight, look, true);
  const shoulderY = bodyTop + geo.bodyHeight * 0.22;
  for (const side of [-1, 1] as const) {
    const handX = cx + side * geo.hipWidth * 0.59;
    const handY = hipY + geo.legHeight * 0.06;
    softLine(
      ctx,
      cx + side * geo.shoulderWidth * 0.42,
      shoulderY,
      handX,
      handY,
      geo.limbWidth * 0.8,
      look.shirt
    );
    oval(ctx, handX, handY, geo.limbWidth * 0.43, geo.limbWidth * 0.52, look.skin, 1.15);
  }
  oval(ctx, cx, bodyTop + geo.height * 0.008, geo.headWidth * 0.16, geo.height * 0.025, look.skin, 1.1);
  drawBackHead(ctx, cx, headCy, geo.headWidth, geo.headHeight, look, bodyTop);
}

function drawSideStanding(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  phase: number,
  motion: CuteCharacterMotion,
  dir: -1 | 1
): void {
  const geo = cuteGeometry(look);
  const beat = fourBeat(phase);
  const swing = motion.moving ? beat.swing : 0;
  const bob = motion.moving ? beat.bounce * geo.height * 0.012 : 0;
  const baseY = footY - bob;
  const shoeH = geo.height * 0.065;
  const hipY = baseY - shoeH - geo.legHeight;
  const bodyTop = hipY - geo.bodyHeight;
  const headCx = cx + dir * geo.headWidth * 0.03;
  const headCy = bodyTop - geo.headHeight * 0.46;
  const shoeY = baseY - shoeH * 0.46;
  const step = swing * geo.height * 0.05;
  const legFill = look.skirt ? look.skin : look.pants;

  groundShadow(ctx, cx, footY, geo.silhouetteWidth);
  const backFoot = cx - dir * step;
  softLine(
    ctx,
    cx - dir * geo.hipWidth * 0.08,
    hipY,
    backFoot,
    shoeY - shoeH * 0.35,
    geo.limbWidth,
    shade(legFill, 12)
  );
  drawShoe(ctx, backFoot + dir * geo.shoeWidth * 0.12, shoeY, geo.shoeWidth * 1.06, shoeH, shade(look.shoes, 10), dir);
  const frontFoot = cx + dir * step;
  softLine(
    ctx,
    cx + dir * geo.hipWidth * 0.08,
    hipY,
    frontFoot,
    shoeY - shoeH * 0.35,
    geo.limbWidth,
    legFill
  );
  drawShoe(ctx, frontFoot + dir * geo.shoeWidth * 0.12, shoeY, geo.shoeWidth * 1.06, shoeH, look.shoes, dir);

  if (look.skirt) {
    const skirtH = geo.height * 0.13;
    ctx.beginPath();
    ctx.moveTo(cx - geo.torsoWidth * 0.28, hipY - skirtH * 0.2);
    ctx.lineTo(cx - geo.torsoWidth * 0.38, hipY + skirtH);
    ctx.lineTo(cx + geo.torsoWidth * 0.38, hipY + skirtH * 0.92);
    ctx.lineTo(cx + geo.torsoWidth * 0.28, hipY - skirtH * 0.2);
    ctx.closePath();
    fillStroke(ctx, look.pants, 1.5);
  }

  const bodyW = geo.torsoWidth * 0.72;
  drawTorso(ctx, cx, bodyTop, bodyW, geo.bodyHeight, look);
  const shoulderX = cx + dir * bodyW * 0.2;
  const shoulderY = bodyTop + geo.bodyHeight * 0.22;
  const elbowX = cx + dir * (bodyW * 0.55 - swing * geo.height * 0.015);
  const elbowY = bodyTop + geo.bodyHeight * 0.58;
  const handX = cx + dir * (bodyW * 0.46 - swing * geo.height * 0.025);
  const handY = hipY + geo.legHeight * 0.07;
  softLine(ctx, shoulderX, shoulderY, elbowX, elbowY, geo.limbWidth * 0.82, look.shirt);
  softLine(ctx, elbowX, elbowY, handX, handY, geo.limbWidth * 0.74, shade(look.shirt, 4));
  oval(ctx, handX, handY, geo.limbWidth * 0.43, geo.limbWidth * 0.52, look.skin, 1.15);
  oval(ctx, cx, bodyTop + geo.height * 0.008, geo.headWidth * 0.14, geo.height * 0.025, look.skin, 1.05);
  drawSideHead(ctx, headCx, headCy, geo.headWidth, geo.headHeight, look, dir, bodyTop);
}

function drawSeated(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  phase: number
): void {
  const geo = cuteGeometry(look);
  const bob = Math.sin(phase * 0.5) * geo.height * 0.003;
  const shoeH = geo.height * 0.065;
  const seatY = footY - geo.height * 0.2 - bob;
  const bodyTop = seatY - geo.bodyHeight;
  const headCy = bodyTop - geo.headHeight * 0.46;
  const kneeY = seatY + geo.legHeight * 0.25;
  const shoeY = footY - shoeH * 0.46;

  groundShadow(ctx, cx, footY, geo.silhouetteWidth * 0.95);
  for (const side of [-1, 1] as const) {
    const hipX = cx + side * geo.hipWidth * 0.18;
    const kneeX = cx + side * geo.hipWidth * 0.45;
    const shoeX = cx + side * geo.hipWidth * 0.42;
    softLine(ctx, hipX, seatY, kneeX, kneeY, geo.limbWidth, look.skirt ? look.skin : look.pants);
    softLine(ctx, kneeX, kneeY, shoeX, shoeY - shoeH * 0.35, geo.limbWidth * 0.92, look.skirt ? look.skin : look.pants);
    drawShoe(ctx, shoeX, shoeY, geo.shoeWidth, shoeH, look.shoes, side);
  }
  drawSkirtOrPelvis(ctx, cx, seatY - geo.height * 0.04, geo, look);
  drawTorso(ctx, cx, bodyTop, geo.torsoWidth, geo.bodyHeight, look);
  for (const side of [-1, 1] as const) {
    const elbowX = cx + side * geo.torsoWidth * 0.52;
    const elbowY = bodyTop + geo.bodyHeight * 0.55;
    const handX = cx + side * geo.hipWidth * 0.24;
    const handY = seatY - geo.height * 0.01;
    softLine(
      ctx,
      cx + side * geo.shoulderWidth * 0.4,
      bodyTop + geo.bodyHeight * 0.2,
      elbowX,
      elbowY,
      geo.limbWidth * 0.82,
      look.shirt
    );
    softLine(ctx, elbowX, elbowY, handX, handY, geo.limbWidth * 0.72, look.shirt);
    oval(ctx, handX, handY, geo.limbWidth * 0.42, geo.limbWidth * 0.5, look.skin, 1.1);
  }
  drawHeadFront(ctx, cx, headCy, geo.headWidth, geo.headHeight, look, bodyTop);
}

function drawBaby(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  phase: number,
  motion: CuteCharacterMotion
): void {
  const geo = cuteGeometry(look);
  const dir: -1 | 1 = motion.facing === "left" ? -1 : 1;
  const beat = fourBeat(phase);
  const bob = motion.moving ? beat.bounce * geo.height * 0.008 : 0;
  const headR = geo.headHeight * 0.48;
  const bodyX = cx - dir * geo.height * 0.1;
  const bodyY = footY - geo.height * 0.25 - bob;
  const headX = cx + dir * geo.height * 0.23;
  const headY = footY - geo.height * 0.39 - bob;
  const limbW = geo.height * 0.075;

  groundShadow(ctx, cx, footY, geo.height * 0.7);
  softLine(
    ctx,
    bodyX - dir * geo.height * 0.12,
    bodyY + geo.height * 0.04,
    bodyX - dir * geo.height * 0.23,
    footY - geo.height * 0.035,
    limbW,
    look.shirt
  );
  softLine(
    ctx,
    bodyX + dir * geo.height * 0.08,
    bodyY + geo.height * 0.03,
    headX + dir * geo.height * 0.13,
    footY - geo.height * 0.02,
    limbW * 0.9,
    look.skin
  );
  oval(ctx, bodyX, bodyY, geo.height * 0.28, geo.height * 0.17, look.shirt, 1.65);
  ctx.save();
  ctx.globalAlpha = 0.4;
  oval(ctx, bodyX - dir * geo.height * 0.07, bodyY - geo.height * 0.035, geo.height * 0.09, geo.height * 0.055, tint(look.shirt, 35), 0);
  ctx.restore();

  if (motion.facing === "back") {
    oval(ctx, headX, headY, headR, headR * 0.96, look.skin, 1.6);
    drawHairCap(ctx, headX, headY, headR * 2, headR * 2, look, true);
    return;
  }
  if (motion.facing === "front") {
    drawHeadFront(ctx, headX, headY, headR * 2, headR * 2, look, bodyY);
    return;
  }
  drawSideHead(ctx, headX, headY, headR * 2, headR * 2, look, dir, bodyY);
}

export function drawCuteCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  look: CuteCharacterLook,
  walkPhase: number,
  motionInput: CuteCharacterMotion | boolean
): void {
  const motion: CuteCharacterMotion =
    typeof motionInput === "boolean"
      ? { moving: motionInput, facing: "front", verticalBias: 0 }
      : motionInput;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (look.baby) {
    drawBaby(ctx, cx, footY, look, walkPhase, motion);
  } else if (motion.pose === "sit") {
    drawSeated(ctx, cx, footY, look, walkPhase);
  } else if (motion.facing === "back") {
    drawBackStanding(ctx, cx, footY, look, walkPhase, motion);
  } else if (motion.facing === "left" || motion.facing === "right") {
    drawSideStanding(
      ctx,
      cx,
      footY,
      look,
      walkPhase,
      motion,
      motion.facing === "left" ? -1 : 1
    );
  } else {
    drawFrontStanding(ctx, cx, footY, look, walkPhase, motion);
  }
  ctx.restore();
}
