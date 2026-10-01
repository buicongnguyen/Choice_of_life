import * as THREE from "three";

import type { Gull } from "./flock";
import { InstancedRig } from "./instancing";

const PARTS = ["Body", "Head", "WingL", "WingR"] as const;
/**
 * The model is authored with its wings spread flat. To fold one: roll the panel about its own
 * span, droop it a little, then sweep it back along the flank (`?view=gulls` in the art viewer
 * shows every pose; &fold=&roll=&droop= try other values).
 */
export const GULL_POSE = { fold: 1.6, roll: 0.6, droop: 0.35 };
const SCALE = 0.8;

type Turn = [number, number, number];

/** Draws every visible gull with one instanced draw call per body part. */
export class GullView {
  readonly rig: InstancedRig;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(SCALE, SCALE, SCALE);
  private turns: Record<string, Turn>[] = [];

  constructor(capacity = 32) {
    // Turns are applied roll (x) first, then droop or flap (z), then the sweep back (y).
    // No shadows: a flying gull's shadow would cross the lanes and read as something to dodge.
    this.rig = new InstancedRig("gull", [...PARTS], capacity, false, "YZX");
    this.rig.group.name = "gulls";
    for (let i = 0; i < capacity; i++) this.turns.push({ Head: [0, 0, 0], WingL: [0, 0, 0], WingR: [0, 0, 0] });
  }

  update(gulls: Gull[]) {
    let n = 0;
    for (const g of gulls) {
      if (n >= this.rig.capacity) break;
      this.q.setFromEuler(this.e.set(g.pitch, g.yaw, g.roll));
      this.m.compose(this.p.set(g.x, g.y, g.z), this.q, this.s);
      const t = this.turns[n];
      const folded = 1 - g.spread;
      // A strong beat while flapping, a slight wobble while gliding, with a little dihedral.
      const beat = g.spread * (Math.sin(g.flap) * (g.flapping > 0.5 ? 0.9 : 0.08) + 0.12);
      const { fold, roll, droop } = GULL_POSE;
      t.WingL[0] = roll * folded;
      t.WingL[1] = fold * folded;
      t.WingL[2] = -droop * folded + beat;
      t.WingR[0] = roll * folded;
      t.WingR[1] = -fold * folded;
      t.WingR[2] = droop * folded - beat;
      t.Head[0] = g.peck > 0 ? 0.75 * Math.sin((g.peck / 0.35) * Math.PI) : 0;
      t.Head[1] = g.head;
      this.rig.set(n++, this.m, t);
    }
    this.rig.commit(n);
  }

  dispose() {
    this.rig.dispose();
  }
}
