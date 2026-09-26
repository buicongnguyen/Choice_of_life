import * as THREE from "three";

import { LANE_Z, type Course, type Spawn } from "../game/course";
import { hasModel, instance, modelExtras, readyAll } from "./assets";
import { Particles, SCORE_COLOURS } from "./fx";

const PICKUP_MODEL = { health: "pickup_heart", happiness: "pickup_star", money: "pickup_coin" } as const;

function modelFor(s: Spawn): string {
  if (s.kind === "pickup") return PICKUP_MODEL[s.score ?? "happiness"];
  if (s.kind === "keepsake") return "keepsake";
  if (s.kind === "letter") return "letter";
  return s.hazard?.model ?? "hz_blocks";
}

export function courseModels(course: Course): string[] {
  return [...new Set(course.spawns.map(modelFor))].filter(hasModel);
}

interface Live {
  obj: THREE.Object3D;
  spawn: Spawn;
  /** Seconds since collected (pickups fly up and pop). */
  taken?: number;
  wobble?: number;
  baseScale: number;
}

/** Pickups, keepsakes, letters and hazards in the lanes, streamed around the runner. */
export class SpawnView {
  readonly group = new THREE.Group();
  private live = new Map<number, Live>();
  private done = new Set<number>();
  private sparkleClock = 0;
  /** Letters only appear once you've promised to write. */
  showLetters = false;

  constructor(
    readonly course: Course,
    private particles: Particles,
  ) {}

  static async prepare(course: Course, particles: Particles) {
    await readyAll(courseModels(course));
    return new SpawnView(course, particles);
  }

  /** Spawns taken before a reload stay taken. */
  markDone(ids: readonly number[]) {
    for (const id of ids) this.done.add(id);
  }

  private centre(name: string): number {
    return Number(modelExtras(name).center ?? 0.3);
  }

  private make(s: Spawn): Live | null {
    const name = modelFor(s);
    if (!hasModel(name)) return null;
    const obj = instance(name);
    obj.position.set(s.x, s.y, LANE_Z[s.lane]);
    let baseScale = 1;
    if (s.kind === "pickup") baseScale = 0.9;
    if (s.kind === "keepsake") baseScale = 1.15;
    obj.scale.setScalar(baseScale);
    if (s.kind !== "hazard") {
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = false;
      });
      // Pickups hover: their model sits on the ground at y=0, so lift its centre to the spawn height.
      obj.position.y = s.y - this.centre(name) * baseScale;
    } else {
      obj.rotation.y = ((s.id * 2.399) % 0.6) - 0.3;
    }
    this.group.add(obj);
    return { obj, spawn: s, baseScale };
  }

  collect(id: number) {
    const l = this.live.get(id);
    if (!l || l.taken !== undefined) return;
    l.taken = 0;
    this.done.add(id);
    const at = l.obj.position.clone().add(new THREE.Vector3(0, 0.3, 0));
    const colour =
      l.spawn.kind === "keepsake"
        ? ["#fff3c4", "#ffd23f", "#ff9ecb", "#8fe3ff"]
        : l.spawn.kind === "letter"
          ? ["#fff1d6", "#ff6b4a"]
          : SCORE_COLOURS[l.spawn.score ?? "happiness"];
    this.particles.emit(at, { count: l.spawn.kind === "keepsake" ? 60 : 14, colour, speed: l.spawn.kind === "keepsake" ? 6 : 4, life: 0.7, size: 0.4, gravity: 4 });
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
        l.obj.removeFromParent();
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
    for (const l of this.live.values()) {
      const s = l.spawn;
      if (s.kind === "hazard") {
        if (l.wobble !== undefined) {
          l.wobble += dt;
          const k = Math.max(0, 1 - l.wobble / 0.8);
          l.obj.rotation.z = Math.sin(l.wobble * 30) * 0.25 * k;
          l.obj.scale.setScalar(1 + Math.sin(l.wobble * 20) * 0.08 * k);
        }
        continue;
      }
      if (l.taken !== undefined) {
        l.taken += dt;
        const k = l.taken / 0.5;
        l.obj.position.y = s.y - this.centre(modelFor(s)) + k * 1.6;
        l.obj.scale.setScalar(l.baseScale * (1 + k * 0.6) * (1 - k));
        l.obj.rotation.y += dt * 18;
        continue;
      }
      const bob = Math.sin(time * 3 + s.x * 0.7) * 0.08;
      l.obj.position.y = s.y - this.centre(modelFor(s)) * l.baseScale + bob;
      l.obj.rotation.y = time * (s.kind === "keepsake" ? 1.2 : 2.2) + s.x;
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
  }
}
