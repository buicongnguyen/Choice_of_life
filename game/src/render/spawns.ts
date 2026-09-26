import * as THREE from "three";

import { LANE_Z, type Course, type Spawn } from "../game/course";
import { hasModel, instance, loadModel, modelBox, modelExtras, readyAll } from "./assets";
import { Particles, SCORE_COLOURS } from "./fx";

const PICKUP_MODEL = { health: "pickup_heart", happiness: "pickup_star", money: "pickup_coin" } as const;

/** Positive things glow in their score's colour; keepsakes are gold, letters warm cream. */
const GLOW = { health: "#ff4d6d", happiness: "#ffc21a", money: "#1fd68a", keepsake: "#ffe27a", letter: "#ffb48a" } as const;
/** Everything in a lane fits inside that lane (lanes are 1.9 m apart). */
const LANE_FIT = 1.55;

function modelFor(s: Spawn): string {
  if (s.kind === "pickup") return PICKUP_MODEL[s.score ?? "happiness"];
  if (s.kind === "keepsake") return "keepsake";
  if (s.kind === "letter") return "letter";
  return s.hazard?.model ?? "hz_blocks";
}

function glowColour(s: Spawn): string {
  if (s.kind === "keepsake") return GLOW.keepsake;
  if (s.kind === "letter") return GLOW.letter;
  return GLOW[s.score ?? "happiness"];
}

export function courseModels(course: Course): string[] {
  return [...new Set(course.spawns.map(modelFor))].filter(hasModel);
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let textures: { glow: THREE.Texture; ring: THREE.Texture; pool: THREE.Texture } | undefined;
function sharedTextures() {
  textures ??= {
    glow: canvasTexture((g, n) => {
      const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.3, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }),
    ring: canvasTexture((g, n) => {
      const grad = g.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.35)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }),
    pool: canvasTexture((g, n) => {
      const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.8)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.45)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }),
  };
  return textures;
}

interface Live {
  obj: THREE.Object3D;
  spawn: Spawn;
  /** Seconds since collected (pickups fly up and pop). */
  taken?: number;
  wobble?: number;
  baseScale: number;
  halo?: THREE.Sprite;
  mark?: THREE.Mesh;
}

/** Pickups, keepsakes, letters and hazards in the lanes, streamed around the runner. */
export class SpawnView {
  readonly group = new THREE.Group();
  private live = new Map<number, Live>();
  private done = new Set<number>();
  private sparkleClock = 0;
  private haloMaterials = new Map<string, THREE.SpriteMaterial>();
  private markMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private markGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private offset = new THREE.Vector3();
  /** Letters only appear once you've promised to write. */
  showLetters = false;

  constructor(
    readonly course: Course,
    private particles: Particles,
  ) {}

  static async prepare(course: Course, particles: Particles) {
    const names = courseModels(course);
    await readyAll(names);
    // Positive items glow faintly in their own colour so they read as "good" at a glance.
    for (const name of names.filter((n) => n.startsWith("pickup_") || n === "keepsake" || n === "letter")) {
      const template = await loadModel(name);
      template.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
          if (m.userData.glowSet || !("emissive" in m)) continue;
          m.userData.glowSet = true;
          m.emissive = m.color.clone();
          m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.28);
        }
      });
    }
    return new SpawnView(course, particles);
  }

  /** Spawns taken before a reload stay taken. */
  markDone(ids: readonly number[]) {
    for (const id of ids) this.done.add(id);
  }

  private centre(name: string): number {
    return Number(modelExtras(name).center ?? 0.3);
  }

  private haloMaterial(colour: string) {
    let m = this.haloMaterials.get(colour);
    if (!m) {
      // Normal blending so the coloured glow shows on light floors as well as dark streets.
      m = new THREE.SpriteMaterial({ map: sharedTextures().glow, color: colour, transparent: true, depthWrite: false, opacity: 0.55 });
      this.haloMaterials.set(colour, m);
    }
    return m;
  }

  private markMaterial(key: string, colour: string, map: THREE.Texture, opacity: number, additive: boolean) {
    let m = this.markMaterials.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map,
        color: colour,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      this.markMaterials.set(key, m);
    }
    return m;
  }

  private make(s: Spawn): Live | null {
    const name = modelFor(s);
    if (!hasModel(name)) return null;
    const obj = instance(name);
    const z = LANE_Z[s.lane];
    obj.position.set(s.x, s.y, z);
    const live: Live = { obj, spawn: s, baseScale: 1 };
    if (s.kind === "hazard") {
      const size = modelBox(name).getSize(this.offset);
      live.baseScale = Math.min(1, LANE_FIT / Math.max(size.x, size.z, 0.01));
      obj.scale.setScalar(live.baseScale);
      obj.rotation.y = ((s.id * 2.399) % 0.4) - 0.2;
      // A faint red pool under anything to avoid.
      const mark = new THREE.Mesh(this.markGeometry, this.markMaterial("hazard", "#ff3b30", sharedTextures().pool, 0.32, false));
      mark.scale.set(1.5, 1, 1.5);
      mark.position.set(s.x, 0.045, z);
      mark.renderOrder = 2;
      this.group.add(mark);
      live.mark = mark;
    } else {
      live.baseScale = s.kind === "pickup" ? 1.15 : s.kind === "keepsake" ? 1.3 : 1.2;
      obj.scale.setScalar(live.baseScale);
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = false;
      });
      obj.position.y = s.y - this.centre(name) * live.baseScale;
      const colour = glowColour(s);
      const halo = new THREE.Sprite(this.haloMaterial(colour));
      halo.scale.setScalar(s.kind === "keepsake" ? 1.9 : 1.35);
      halo.position.set(s.x, s.y, z - 0.05);
      halo.renderOrder = 3;
      this.group.add(halo);
      live.halo = halo;
      // A coloured ring on the ground marks where the good thing is, even when it floats high.
      const mark = new THREE.Mesh(this.markGeometry, this.markMaterial(`ring-${colour}`, colour, sharedTextures().ring, 0.75, false));
      mark.scale.set(1.15, 1, 1.15);
      mark.position.set(s.x, 0.05, z);
      mark.renderOrder = 2;
      this.group.add(mark);
      live.mark = mark;
    }
    this.group.add(obj);
    return live;
  }

  private remove(l: Live) {
    l.obj.removeFromParent();
    l.halo?.removeFromParent();
    l.mark?.removeFromParent();
  }

  collect(id: number) {
    const l = this.live.get(id);
    if (!l || l.taken !== undefined) return;
    l.taken = 0;
    this.done.add(id);
    l.mark?.removeFromParent();
    const at = l.obj.position.clone().add(new THREE.Vector3(0, 0.3, 0));
    const colour =
      l.spawn.kind === "keepsake"
        ? ["#fff3c4", "#ffd23f", "#ff9ecb", "#8fe3ff"]
        : l.spawn.kind === "letter"
          ? ["#fff1d6", "#ff6b4a"]
          : SCORE_COLOURS[l.spawn.score ?? "happiness"];
    this.particles.emit(at, { count: l.spawn.kind === "keepsake" ? 60 : 16, colour, speed: l.spawn.kind === "keepsake" ? 6 : 4, life: 0.7, size: 0.45, gravity: 4 });
  }

  hit(id: number) {
    const l = this.live.get(id);
    if (!l) return;
    l.wobble = 0;
    this.done.add(id);
    this.particles.emit(l.obj.position.clone().add(new THREE.Vector3(0, 0.4, 0)), { count: 18, colour: ["#ffffff", "#ffe0b0"], speed: 3.5, life: 0.6, size: 0.45, gravity: 3 });
  }

  update(dt: number, runnerX: number, time: number) {
    const lo = runnerX - 18;
    const hi = runnerX + 95;
    for (const [id, l] of this.live) {
      if (l.spawn.x < lo || l.spawn.x > hi + 10 || (l.taken !== undefined && l.taken > 0.5)) {
        this.remove(l);
        this.live.delete(id);
      }
    }
    for (const s of this.course.spawns) {
      if (s.x < lo) continue;
      if (s.x > hi) break;
      if (this.live.has(s.id) || (this.done.has(s.id) && s.kind !== "hazard")) continue;
      if (s.kind === "letter" && !this.showLetters) continue;
      const made = this.make(s);
      if (made) this.live.set(s.id, made);
    }
    this.sparkleClock += dt;
    const sparkle = this.sparkleClock > 0.08;
    if (sparkle) this.sparkleClock = 0;
    const pulse = 1 + Math.sin(time * 4) * 0.08;
    for (const l of this.live.values()) {
      const s = l.spawn;
      if (s.kind === "hazard") {
        if (l.wobble !== undefined) {
          l.wobble += dt;
          const k = Math.max(0, 1 - l.wobble / 0.8);
          l.obj.rotation.z = Math.sin(l.wobble * 30) * 0.25 * k;
          l.obj.scale.setScalar(l.baseScale * (1 + Math.sin(l.wobble * 20) * 0.08 * k));
        }
        continue;
      }
      const centre = this.centre(modelFor(s)) * l.baseScale;
      if (l.taken !== undefined) {
        l.taken += dt;
        const k = l.taken / 0.5;
        l.obj.position.y = s.y - centre + k * 1.6;
        l.obj.scale.setScalar(l.baseScale * (1 + k * 0.6) * (1 - k));
        l.obj.rotation.y += dt * 18;
        if (l.halo) {
          l.halo.position.y = s.y + k * 1.6;
          l.halo.scale.setScalar(1.35 * (1 + k));
        }
        continue;
      }
      const bob = Math.sin(time * 3 + s.x * 0.7) * 0.08;
      l.obj.position.y = s.y - centre + bob;
      l.obj.rotation.y = time * (s.kind === "keepsake" ? 1.2 : 2.2) + s.x;
      if (l.halo) {
        l.halo.position.y = s.y + bob;
        l.halo.scale.setScalar((s.kind === "keepsake" ? 1.9 : 1.35) * pulse);
      }
      if (sparkle && (s.kind === "keepsake" || s.kind === "letter")) {
        this.particles.emit(l.obj.position.clone().add(new THREE.Vector3(0, 0.35, 0)), {
          count: 1,
          colour: s.kind === "keepsake" ? ["#fff3c4", "#8fe3ff", "#ff9ecb"] : ["#fff1d6"],
          speed: 0.8,
          up: 1,
          life: 0.9,
          size: 0.3,
          gravity: -0.5,
          spread: 0.7,
        });
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const l of this.live.values()) this.remove(l);
    this.live.clear();
    for (const m of this.haloMaterials.values()) m.dispose();
    for (const m of this.markMaterials.values()) m.dispose();
    this.markGeometry.dispose();
  }
}
