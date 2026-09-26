import * as THREE from "three";

import { findNode, instance, readyAll, recolour } from "./assets";
import { HEAD_ACCESSORIES, SOCKETS, type CharacterSpec } from "./cast";

export type Anim = "idle" | "run" | "walk" | "toddle" | "crawl" | "bike" | "talk" | "wave" | "cheer" | "sit" | "dig";

const UMBRELLA_ARM = -2.5;
const JOINTS = ["Hips", "Torso", "Head", "ArmL", "ArmR", "LegL", "LegR"] as const;
const DOG_JOINTS = ["Body", "Head", "EarL", "EarR", "Tail", "LegFL", "LegFR", "LegBL", "LegBR"] as const;
type Joint = (typeof JOINTS)[number] | (typeof DOG_JOINTS)[number];

export function specModels(spec: CharacterSpec): string[] {
  const names = [spec.body];
  if (spec.hair) names.push(`hair_${spec.hair}`);
  for (const a of spec.accessories ?? []) names.push(`acc_${a}`);
  return names;
}

export async function preloadSpecs(specs: CharacterSpec[]) {
  await readyAll(specs.flatMap(specModels));
}

/** A composed, animated toy person (or dog). Position and face it through `root`. */
export class Person {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly isDog: boolean;
  anim: Anim = "idle";
  /** Ground speed in m/s; drives stride frequency. */
  speed = 0;
  /** Height above ground while jumping (set by the runner). */
  lift = 0;
  /** Seconds of stumble remaining. */
  stumble = 0;
  /** Holding an umbrella raises the right arm. */
  holdingUp = false;
  private joints = new Map<Joint, THREE.Object3D>();
  private rest = new Map<THREE.Object3D, THREE.Euler>();
  private phase = Math.random() * 10;
  private t = Math.random() * 10;
  readonly headRadius: number;
  readonly height: number;
  private hipsRestY = 0;
  private ownMaterials: THREE.Material[] = [];

  constructor(readonly spec: CharacterSpec) {
    this.model = instance(spec.body);
    this.isDog = spec.body === "dog";
    this.ownMaterials.push(...recolour(this.model, spec.colours));
    for (const name of this.isDog ? DOG_JOINTS : JOINTS) {
      const node = findNode(this.model, name);
      if (node) {
        this.joints.set(name, node);
        this.rest.set(node, node.rotation.clone());
      }
    }
    const hips = this.joints.get(this.isDog ? "Body" : "Hips");
    this.hipsRestY = hips?.position.y ?? 0;
    const headCentre = findNode(this.model, "HeadCenter");
    this.headRadius = (headCentre?.userData.radius as number) ?? 0.28;
    const rootNode = findNode(this.model, "Root");
    this.height = (rootNode?.userData.height as number) ?? 1.4;

    if (spec.hair && headCentre) {
      const hair = instance(`hair_${spec.hair}`);
      this.ownMaterials.push(...recolour(hair, { Hair: spec.colours.Hair ?? "#4a2c1d" }));
      hair.scale.setScalar(this.headRadius);
      headCentre.add(hair);
    }
    for (const acc of spec.accessories ?? []) {
      const item = instance(`acc_${acc}`);
      if (HEAD_ACCESSORIES.has(acc) && headCentre) {
        if (acc === "beard" || acc === "mustache") this.ownMaterials.push(...recolour(item, { Hair: spec.colours.Hair ?? "#5a3a26" }));
        item.scale.setScalar(this.headRadius);
        headCentre.add(item);
      } else {
        const socket = findNode(this.model, SOCKETS[acc] ?? "Back");
        if (!socket) continue;
        if (acc === "cane") {
          socket.updateWorldMatrix(true, false);
          const handY = socket.getWorldPosition(new THREE.Vector3()).y;
          item.scale.setScalar(Math.max(0.3, handY / 0.8));
        }
        if (acc === "umbrella") {
          this.holdingUp = true;
          // Counter the raised arm so the canopy stays upright over the head.
          item.rotation.x = -UMBRELLA_ARM;
        }
        socket.add(item);
      }
    }
    if (spec.scale) this.model.scale.setScalar(spec.scale);
    this.root.add(this.model);
  }

  /** Face a world direction on the ground plane (radians, 0 = toward the camera). */
  face(angle: number) {
    this.root.rotation.y = angle;
  }

  private pose(name: Joint, x = 0, y = 0, z = 0) {
    const j = this.joints.get(name);
    if (!j) return;
    const r = this.rest.get(j)!;
    j.rotation.set(r.x + x, r.y + y, r.z + z);
  }

  update(dt: number) {
    this.t += dt;
    this.stumble = Math.max(0, this.stumble - dt);
    if (this.isDog) return this.updateDog(dt);
    const t = this.t;
    const hips = this.joints.get("Hips");
    let bob = 0;
    let lean = 0;
    let legL = 0,
      legR = 0,
      armL = 0,
      armR = 0,
      armSpread = 0,
      headNod = 0,
      headTurn = 0,
      roll = 0;

    const stride = (freq: number, amp: number) => {
      this.phase += dt * freq;
      const s = Math.sin(this.phase);
      legL = s * amp;
      legR = -s * amp;
      armL = -s * amp * 0.85;
      armR = s * amp * 0.85;
      return s;
    };

    switch (this.anim) {
      case "run": {
        const s = stride(4 + this.speed * 1.05, 0.95);
        bob = Math.abs(Math.cos(this.phase)) * 0.07;
        lean = 0.16;
        roll = s * 0.04;
        break;
      }
      case "walk": {
        const s = stride(2.6 + this.speed * 0.9, 0.5);
        bob = Math.abs(Math.cos(this.phase)) * 0.03;
        lean = 0.05;
        roll = s * 0.03;
        break;
      }
      case "toddle": {
        const s = stride(8 + this.speed * 0.9, 0.55);
        bob = Math.abs(Math.cos(this.phase)) * 0.05;
        roll = s * 0.12;
        armSpread = 0.55;
        armL = armR = -0.35;
        break;
      }
      case "crawl": {
        const s = stride(6 + this.speed, 0.45);
        bob = Math.abs(s) * 0.025;
        roll = s * 0.06;
        break;
      }
      case "bike": {
        this.phase += dt * (2 + this.speed * 0.9);
        const s = Math.sin(this.phase);
        legL = -1.05 + s * 0.55;
        legR = -1.05 - s * 0.55;
        armL = armR = -1.15;
        lean = 0.32;
        break;
      }
      case "talk": {
        headNod = Math.sin(t * 5.5) * 0.06;
        armR = -0.35 + Math.sin(t * 3.1) * 0.25;
        armSpread = 0.1;
        bob = Math.sin(t * 2) * 0.008;
        break;
      }
      case "wave": {
        armR = -2.6;
        armSpread = Math.sin(t * 10) * 0.35;
        headTurn = 0.1;
        break;
      }
      case "cheer": {
        armL = armR = -2.7;
        armSpread = 0.35;
        bob = Math.abs(Math.sin(t * 9)) * 0.08;
        break;
      }
      case "sit": {
        legL = legR = -1.45;
        bob = -this.hipsRestY * 0.42;
        armL = armR = -0.4;
        break;
      }
      case "dig": {
        this.phase += dt * 4;
        const s = Math.sin(this.phase);
        armL = armR = -1.1 + s * 0.4;
        lean = 0.45 + s * 0.1;
        break;
      }
      case "idle":
      default: {
        bob = Math.sin(t * 2.1) * 0.01;
        headNod = Math.sin(t * 0.7) * 0.04;
        headTurn = Math.sin(t * 0.45) * 0.12;
        armL = Math.sin(t * 2.1) * 0.03;
        armR = -armL;
      }
    }

    if (this.lift > 0.02) {
      // Airborne: tuck the legs and throw the arms up.
      legL = -0.9;
      legR = -0.5;
      armL = armR = -2.2;
      armSpread = 0.3;
    }
    if (this.stumble > 0) {
      const k = this.stumble / 0.7;
      lean -= 0.5 * k;
      armL = armR = -1.8 * k;
      armSpread = 0.5 * k;
    }
    if (this.holdingUp) {
      armR = UMBRELLA_ARM;
    }

    if (hips) hips.position.y = this.hipsRestY + bob;
    this.pose("Hips", 0, 0, roll);
    this.pose("Torso", lean, 0, -roll * 0.5);
    this.pose("Head", headNod - lean * 0.6, headTurn, 0);
    this.pose("LegL", legL);
    this.pose("LegR", legR);
    this.pose("ArmL", armL, 0, armSpread);
    this.pose("ArmR", armR, 0, -armSpread);
  }

  private updateDog(dt: number) {
    const moving = this.speed > 0.2;
    this.phase += dt * (moving ? 5 + this.speed * 1.3 : 0);
    const s = Math.sin(this.phase);
    const body = this.joints.get("Body");
    if (body) body.position.y = this.hipsRestY + (moving ? Math.abs(Math.cos(this.phase)) * 0.05 : Math.sin(this.t * 3) * 0.004) + this.lift;
    const amp = moving ? 0.8 : 0;
    this.pose("LegFL", s * amp);
    this.pose("LegFR", s * amp * 0.8);
    this.pose("LegBL", -s * amp);
    this.pose("LegBR", -s * amp * 0.8);
    this.pose("Body", moving ? Math.cos(this.phase) * 0.06 : 0);
    this.pose("Tail", 0, Math.sin(this.t * (moving ? 14 : 9)) * 0.6, 0);
    this.pose("Head", moving ? -Math.cos(this.phase) * 0.08 : Math.sin(this.t * 0.8) * 0.1, Math.sin(this.t * 0.5) * 0.25);
    this.pose("EarL", 0, 0, (moving ? s * 0.35 : 0) + 0.1);
    this.pose("EarR", 0, 0, (moving ? -s * 0.35 : 0) - 0.1);
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials = [];
  }
}

export async function createPerson(spec: CharacterSpec): Promise<Person> {
  await readyAll(specModels(spec));
  return new Person(spec);
}
