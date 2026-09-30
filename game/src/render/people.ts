import * as THREE from "three";

import { findNode, instance, readyAll, recolour } from "./assets";
import { HEAD_ACCESSORIES, SOCKETS, type CharacterSpec } from "./cast";
import { CRANK_RATIO, gaitParams, scaleGait, solveGait, type Gait, type Limb } from "./gait";

export type Anim = "idle" | "run" | "walk" | "toddle" | "crawl" | "bike" | "talk" | "wave" | "cheer" | "sit" | "dig";

const UMBRELLA_ARM = -2.5;
const JOINTS = ["Hips", "Torso", "Head", "ArmL", "ArmR", "LegL", "LegR"] as const;
const DOG_JOINTS = ["Body", "Head", "EarL", "EarR", "Tail", "LegFL", "LegFR", "LegBL", "LegBR"] as const;
type Joint = (typeof JOINTS)[number] | (typeof DOG_JOINTS)[number];
/** A limb that walks: its rest floor contact (model units) and where that sits on the limb. */
type RigLimb = Limb & { name: Joint; node: THREE.Object3D; contact: THREE.Vector3; restScale: THREE.Vector3 };
/** The crawling baby's knee touches the floor this far ahead of its hip (art/characters.py build_baby). */
const BABY_KNEE_AHEAD = 0.07;

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
  /** Position in the stride cycle (0..1 per stride; see gait.ts). */
  private cycle = Math.random();
  private t = Math.random() * 10;
  readonly headRadius: number;
  readonly height: number;
  private hipsRestY = 0;
  /** The top joint of the body (Hips, the baby's Torso, the dog's Body): it carries the bob. */
  private bodyNode?: THREE.Object3D;
  /** World metres per model unit. */
  private unit: number;
  private legRig: RigLimb[] = [];
  /** A crawl plants the hands as well as the knees. */
  private crawlRig: RigLimb[] = [];
  private ownMaterials: THREE.Material[] = [];
  /** Hip pivot height above the ground (m). */
  readonly legLength: number;
  /** Counts steps (one per half stride) so footfall effects land on real steps. */
  footfalls = 0;
  /** On the bicycle the legs follow the crank angle instead of their own rhythm. */
  pedal?: number;

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
    const torso = this.joints.get("Torso");
    // The baby's rig hangs the hips from the torso; everyone else hangs the torso from the hips.
    this.bodyNode = hips && torso && hips.parent === torso ? torso : hips;
    this.hipsRestY = this.bodyNode?.position.y ?? 0;
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
    // Measure where each walking limb meets the floor so steps match the ground exactly.
    this.unit = spec.scale ?? 1;
    this.model.updateMatrixWorld(true);
    const inModel = (node: THREE.Object3D) => this.model.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
    const limb = (name: Joint, phase: number, forward = 0, contactNode?: string): RigLimb | undefined => {
      const node = this.joints.get(name);
      if (!node) return undefined;
      const pivot = inModel(node);
      const at = contactNode ? findNode(this.model, contactNode) : undefined;
      if (at) forward = inModel(at).z - pivot.z;
      const floor = this.model.localToWorld(new THREE.Vector3(pivot.x, 0, pivot.z + forward));
      return { name, node, phase, forward, down: pivot.y, contact: node.worldToLocal(floor), restScale: node.scale.clone() };
    };
    const rig = (...limbs: (RigLimb | undefined)[]) => limbs.filter((l): l is RigLimb => l !== undefined);
    if (this.isDog) {
      // A trot: diagonal pairs of paws step together.
      this.legRig = rig(limb("LegFL", 0), limb("LegFR", 0.5), limb("LegBL", 0.5), limb("LegBR", 0));
    } else if (spec.body === "baby") {
      this.legRig = rig(limb("LegL", 0, BABY_KNEE_AHEAD), limb("LegR", 0.5, BABY_KNEE_AHEAD));
      this.crawlRig = [...this.legRig, ...rig(limb("ArmL", 0.5, 0, "HandL"), limb("ArmR", 0, 0, "HandR"))];
    } else {
      this.legRig = rig(limb("LegL", 0), limb("LegR", 0.5));
    }
    this.legLength = Math.max(0.1, (this.legRig[0]?.down ?? 0.3) * this.unit);
  }

  /**
   * Advances the stride at the current speed and plants the rig's limbs (see gait.ts). Returns
   * each limb's swing, the body's height change (model units) and a side-to-side rhythm.
   */
  private stride(gait: Gait, rig: RigLimb[], dt: number) {
    const reach = rig.length ? Math.hypot(rig[0].forward, rig[0].down) * this.unit : this.legLength;
    const g = gaitParams(gait, this.speed, reach);
    const before = Math.floor(this.cycle * 2);
    this.cycle += dt * g.freq;
    if (Math.floor(this.cycle * 2) !== before) this.footfalls++;
    const pose = solveGait(this.cycle, scaleGait(g, 1 / this.unit), rig);
    const swing = new Map<Joint, number>();
    rig.forEach((l, i) => {
      swing.set(l.name, pose.limbs[i].angle);
      this.stretch(l, pose.limbs[i].stretch);
    });
    return { swing: (name: Joint) => swing.get(name) ?? 0, body: pose.body, s: Math.sin(2 * Math.PI * this.cycle) };
  }

  /** Shortens a limb along the line from its pivot to its floor contact. */
  private stretch(l: RigLimb, k: number) {
    const r = l.restScale;
    // A straight leg shortens along its length; a bent one (the baby's) scales towards the knee.
    l.node.scale.set(r.x, r.y * k, l.forward !== 0 ? r.z * k : r.z);
  }

  /** World position of a limb's floor contact as currently posed (for QA probes). */
  contactPoint(name: Joint): THREE.Vector3 | undefined {
    const l = [...this.legRig, ...this.crawlRig].find((r) => r.name === name);
    return l && l.node.localToWorld(l.contact.clone());
  }

  /** Where the foot that came down most recently stands (world); the legs land half a stride apart. */
  lastFootfall(): THREE.Vector3 | undefined {
    const leg = this.legRig[Math.floor(this.cycle * 2) % 2];
    return leg && this.contactPoint(leg.name);
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
    let bob = 0;
    /** A foot is planted this frame: sway the torso, not the hips, so the feet stay on the floor. */
    let grounded = false;
    let lean = 0;
    let legL = 0,
      legR = 0,
      armL = 0,
      armR = 0,
      armSpread = 0,
      headNod = 0,
      headTurn = 0,
      roll = 0;

    // Limbs are full length unless a gait below plants them.
    for (const l of this.crawlRig.length ? this.crawlRig : this.legRig) this.stretch(l, 1);
    const walk = (gait: Gait, armSwing = 0.85) => {
      const step = this.stride(gait, this.legRig, dt);
      legL = step.swing("LegL");
      legR = step.swing("LegR");
      // Each arm swings against the leg on its own side.
      armL = -legL * armSwing;
      armR = -legR * armSwing;
      bob = step.body;
      grounded = true;
      return step.s;
    };

    switch (this.anim) {
      case "run": {
        const s = walk("run");
        lean = 0.16 * Math.min(1, this.speed / 3);
        roll = s * 0.04;
        break;
      }
      case "walk": {
        const s = walk("walk");
        lean = 0.05;
        roll = s * 0.03;
        break;
      }
      case "toddle": {
        const s = walk("toddle");
        roll = s * 0.07;
        armSpread = 0.55;
        armL = armR = -0.35;
        break;
      }
      case "crawl": {
        // Knees and hands are all planted, diagonally paired.
        const step = this.stride("crawl", this.crawlRig.length ? this.crawlRig : this.legRig, dt);
        legL = step.swing("LegL");
        legR = step.swing("LegR");
        armL = step.swing("ArmL");
        armR = step.swing("ArmR");
        bob = step.body;
        // The baby's torso carries everything, so it doesn't sway: a little nod instead.
        grounded = true;
        headNod = step.s * 0.05;
        break;
      }
      case "bike": {
        // Legs follow the crank so the pedals and feet turn together with the wheels.
        if (this.pedal !== undefined) this.phase = this.pedal;
        else this.phase += (dt * this.speed * CRANK_RATIO) / 0.33;
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
      for (const l of this.crawlRig.length ? this.crawlRig : this.legRig) this.stretch(l, 1);
      bob = 0;
      grounded = false;
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

    if (this.bodyNode) this.bodyNode.position.y = this.hipsRestY + bob;
    this.pose("Hips", 0, 0, grounded ? 0 : roll);
    this.pose("Torso", lean, 0, grounded ? roll : -roll * 0.5);
    this.pose("Head", headNod - lean * 0.6, headTurn, 0);
    this.pose("LegL", legL);
    this.pose("LegR", legR);
    this.pose("ArmL", armL, 0, armSpread);
    this.pose("ArmR", armR, 0, -armSpread);
  }

  private updateDog(dt: number) {
    const moving = this.speed > 0.2 && this.lift <= 0.02;
    const step = moving ? this.stride("dog", this.legRig, dt) : undefined;
    if (!step) for (const l of this.legRig) this.stretch(l, 1);
    const s = step?.s ?? 0;
    if (this.bodyNode) this.bodyNode.position.y = this.hipsRestY + (step ? step.body : Math.sin(this.t * 3) * 0.004) + this.lift;
    for (const leg of ["LegFL", "LegFR", "LegBL", "LegBR"] as const) this.pose(leg, step?.swing(leg) ?? 0);
    this.pose("Tail", 0, Math.sin(this.t * (moving ? 14 : 9)) * 0.6, 0);
    this.pose("Head", moving ? -Math.cos(4 * Math.PI * this.cycle) * 0.06 : Math.sin(this.t * 0.8) * 0.1, Math.sin(this.t * 0.5) * 0.25);
    this.pose("EarL", 0, 0, s * 0.35 + 0.1);
    this.pose("EarR", 0, 0, -s * 0.35 - 0.1);
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
