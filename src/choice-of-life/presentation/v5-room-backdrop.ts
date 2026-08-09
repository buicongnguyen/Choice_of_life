import { drawRoom, type RoomDecor } from "../../sprites";
import type { RoomTheme, SceneKind, UpperSceneKind } from "../../types";

export interface V5RoomBackdrop {
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}

const THEMES: Readonly<Record<SceneKind, RoomTheme>> = Object.freeze({
  nursery: { wall: "#ffd6e9", wallShade: "#f3a9c9", floor: "#bfe8ff", floorShade: "#91cfff", accent: "#ff64b7" },
  playroom: { wall: "#83d7ff", wallShade: "#58b8ec", floor: "#ffe18a", floorShade: "#e8bd55", accent: "#ff6f91" },
  school: { wall: "#79c9ff", wallShade: "#4da6e1", floor: "#d49561", floorShade: "#b87844", accent: "#fff06a" },
  campus: { wall: "#a8df8f", wallShade: "#79be6f", floor: "#d8a461", floorShade: "#b88342", accent: "#5fd0ff" },
  office: { wall: "#72c6a4", wallShade: "#4ea985", floor: "#8ec3d8", floorShade: "#67a6be", accent: "#34e06f" },
  home: { wall: "#ffd08c", wallShade: "#edae66", floor: "#e08a80", floorShade: "#c86b64", accent: "#74d6ff" },
  sunset: { wall: "#ffb077", wallShade: "#e58a5d", floor: "#d7839a", floorShade: "#b8667f", accent: "#ffe18a" },
});

export function createV5RoomBackdrop(
  document: Document,
  scene: SceneKind,
  upperScene: UpperSceneKind,
): V5RoomBackdrop {
  const canvas = document.createElement("canvas");
  canvas.className = "col-v5-room-backdrop";
  canvas.width = 960;
  canvas.height = 540;
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  const ownerWindow = document.defaultView;
  let disposed = false;
  let animationFrame = 0;
  let lastPaint = -100;
  const reduceMotion =
    ownerWindow?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.querySelector<HTMLElement>(".choice-life-root")?.dataset.reducedMotion === "true";
  const decor: RoomDecor = {
    scene,
    upperScene,
    atHome: scene === "home",
    homeQuality: scene === "home" ? 2 : 0,
    splitY: 230,
    ownedVehicles: [],
    ownedHome: null,
  };
  const paint = (time: number): void => {
    if (disposed || context === null) return;
    if (time - lastPaint >= 80 || lastPaint < 0) {
      lastPaint = time;
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawRoom(context, THEMES[scene], canvas.width, canvas.height, canvas.height, false, time / 1000, decor);
    }
    if (!reduceMotion && typeof ownerWindow?.requestAnimationFrame === "function") {
      animationFrame = ownerWindow.requestAnimationFrame(paint);
    }
  };
  paint(0);
  return Object.freeze({
    canvas,
    dispose(): void {
      disposed = true;
      if (animationFrame !== 0) ownerWindow?.cancelAnimationFrame(animationFrame);
    },
  });
}
