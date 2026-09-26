import * as THREE from "three";

import type { MoveMode } from "../game/story/model";

export type Shot =
  | { kind: "follow"; mode: MoveMode }
  | { kind: "two-shot"; a: THREE.Vector3; b: THREE.Vector3 }
  | { kind: "wide"; target: THREE.Vector3; distance: number; height: number; side?: number }
  | { kind: "orbit"; target: THREE.Vector3; distance: number; height: number; speed: number };

const FOLLOW: Record<MoveMode, { back: number; up: number; ahead: number; look: number }> = {
  crawl: { back: 9.8, up: 4.6, ahead: 3.2, look: 0.9 },
  toddle: { back: 10.6, up: 5.0, ahead: 3.4, look: 1.0 },
  run: { back: 17, up: 8.2, ahead: 4.8, look: 1.2 },
  bike: { back: 18.5, up: 8.8, ahead: 6, look: 1.2 },
  walk: { back: 15.5, up: 7.4, ahead: 4.2, look: 1.2 },
};

/** Smoothly moves the camera between gameplay and story framings. */
export class CameraDirector {
  private position = new THREE.Vector3(0, 4, 12);
  private look = new THREE.Vector3(0, 1, 0);
  private shot: Shot = { kind: "follow", mode: "run" };
  private blend = 1;
  private orbitAngle = 0;
  /** Extra shake from bumps, decays quickly. */
  shake = 0;
  reducedMotion = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  set(shot: Shot, instant = false) {
    this.shot = shot;
    this.blend = instant ? 1 : 0;
    if (instant) this.snap = true;
  }
  private snap = true;

  get current() {
    return this.shot;
  }

  update(dt: number, focus: THREE.Vector3, speed: number) {
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    const s = this.shot;
    if (s.kind === "follow") {
      const f = FOLLOW[s.mode];
      const kick = Math.min(1, speed / 12) * 0.6;
      if (this.camera.aspect < 1) {
        // Portrait: a side view shows almost none of the road ahead, so look diagonally down it.
        wantPos.set(focus.x - 6.5, f.up * 1.15 + kick * 0.3, f.back * 0.9 + kick);
        wantLook.set(focus.x + 6, f.look, -1.2);
      } else {
        wantPos.set(focus.x + f.ahead * 0.55, f.up + kick * 0.3, f.back + kick);
        wantLook.set(focus.x + f.ahead, f.look, -1.6);
      }
      // Follow lane changes a little so the near and far lanes both stay framed.
      wantPos.z += focus.z * 0.25;
    } else if (s.kind === "two-shot") {
      const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
      const span = Math.max(3, s.a.distanceTo(s.b));
      wantPos.set(mid.x - 0.4, 1.9 + span * 0.12, mid.z + 4.6 + span * 0.55);
      wantLook.set(mid.x, 1.05, mid.z);
    } else if (s.kind === "wide") {
      wantPos.set(s.target.x + (s.side ?? 0), s.height, s.target.z + s.distance);
      wantLook.copy(s.target);
    } else {
      this.orbitAngle += dt * s.speed;
      wantPos.set(
        s.target.x + Math.sin(this.orbitAngle) * s.distance,
        s.height,
        s.target.z + Math.cos(this.orbitAngle) * s.distance,
      );
      wantLook.copy(s.target);
    }
    if (this.snap) {
      this.position.copy(wantPos);
      this.look.copy(wantLook);
      this.snap = false;
    }
    this.blend = Math.min(1, this.blend + dt / 1.1);
    const follow = s.kind === "follow" ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * (1.2 + this.blend * 4));
    this.position.lerp(wantPos, follow);
    this.look.lerp(wantLook, follow);
    this.camera.position.copy(this.position);
    if (this.shake > 0 && !this.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    this.camera.lookAt(this.look);
  }
}
