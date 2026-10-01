import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { findNode, isUsable, loadedTemplate } from "./assets";
import { bakedGeometry, bakeSingle } from "./bake";

/**
 * Drawing many small things cheaply. Every copy of a model shares one geometry (its colours baked
 * into the vertices, see bake.ts), so a whole family of copies is one draw call:
 *  - StreamedInstances: static scatter along the course, refilled as the camera moves;
 *  - InstancedRig: animated critters made of rigid hinged parts (one draw call per part).
 */

const singles = new Map<string, THREE.BufferGeometry>();
/** One baked geometry for a whole (preloaded) model, shared by everything that instances it. */
export function singleGeometry(name: string): THREE.BufferGeometry | undefined {
  let g = singles.get(name);
  if (!g && isUsable(name)) {
    g = bakeSingle(loadedTemplate(name)!);
    singles.set(name, g);
  }
  return g;
}

/** Uniforms shared by every swaying material, so one write per frame moves them all. */
export const sway = { time: { value: 0 }, amount: { value: 1 } };

/**
 * A vertex-coloured material lit like the rest of the scene. With `bend` > 0, vertices bend in the
 * wind in proportion to their height (grass, flowers), each instance in its own phase.
 */
export function scatterMaterial(bend = 0): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  material.envMapIntensity = 0.75;
  if (bend > 0) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.swayTime = sway.time;
      shader.uniforms.swayAmount = sway.amount;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float swayTime;\nuniform float swayAmount;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float swayPhase = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 2.3;
          #else
            float swayPhase = 0.0;
          #endif
          float swayBend = max(0.0, position.y) * ${bend.toFixed(3)} * swayAmount;
          transformed.x += sin(swayTime * 2.1 + swayPhase) * swayBend;
          transformed.z += sin(swayTime * 1.5 + swayPhase * 1.7) * swayBend * 0.6;`,
        );
    };
    material.customProgramCacheKey = () => `sway${bend}`;
  }
  return material;
}

export interface ScatterItem {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Multiplies the baked colours (1,1,1 = as authored). */
  tint?: THREE.Color;
}

/**
 * One InstancedMesh holding the items (sorted by x) that lie within a window around the camera.
 * The instance buffer is rewritten only when the window has moved by `step` metres, so a long
 * course of scatter costs one draw call and almost no CPU.
 */
export class StreamedInstances {
  readonly mesh: THREE.InstancedMesh;
  private lo = Infinity;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly items: ScatterItem[],
    readonly span: number,
    readonly step = 4,
  ) {
    // Capacity: the most items that ever fall inside one window (two-pointer scan).
    let most = 0;
    for (let i = 0, j = 0; i < items.length; i++) {
      while (items[i].x - items[j].x > span + step) j++;
      most = Math.max(most, i - j + 1);
    }
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, most));
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // The window always surrounds the camera, so per-mesh culling would never skip it.
    this.mesh.frustumCulled = false;
    if (items.some((it) => it.tint)) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, most) * 3).fill(1), 3);
  }

  /** Shows the items in [lo, lo + span]. */
  update(lo: number) {
    const start = Math.floor(lo / this.step) * this.step;
    if (start === this.lo) return;
    this.lo = start;
    const hi = start + this.span + this.step;
    let n = 0;
    // Binary search for the first item at or after `start`.
    let a = 0;
    let b = this.items.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (this.items[mid].x < start) a = mid + 1;
      else b = mid;
    }
    const white = new THREE.Color(1, 1, 1);
    for (let i = a; i < this.items.length && this.items[i].x <= hi && n < this.mesh.instanceMatrix.count; i++) {
      const it = this.items[i];
      this.q.setFromAxisAngle(this.up, it.yaw);
      this.m.compose(this.v.set(it.x, it.y, it.z), this.q, this.s.setScalar(it.scale));
      this.mesh.setMatrixAt(n, this.m);
      if (this.mesh.instanceColor) this.mesh.setColorAt(n, it.tint ?? white);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

/** A rigid part of a rig: its geometry (in the part's own space) and where it hangs at rest. */
interface RigPart {
  name: string;
  parent: number;
  rest: THREE.Matrix4;
  mesh: THREE.InstancedMesh;
}

/**
 * Many copies of an animated model built from rigid hinged parts (a gull's body, head and wings).
 * Each part is one InstancedMesh, so any number of copies costs one draw call per part. Each frame
 * the caller sets every copy's root transform and per-part rotations, then calls commit().
 */
export class InstancedRig {
  readonly group = new THREE.Group();
  readonly parts: RigPart[] = [];
  private world: THREE.Matrix4[] = [];
  private local = new THREE.Matrix4();
  private rot = new THREE.Matrix4();
  private euler: THREE.Euler;
  count = 0;

  /** `order`: how each part's (x, y, z) turn is composed (e.g. "YZX" turns about y last). */
  constructor(model: string, partNames: string[], readonly capacity: number, castShadow = true, order: THREE.EulerOrder = "XYZ") {
    this.euler = new THREE.Euler(0, 0, 0, order);
    const template = loadedTemplate(model);
    if (!template || !isUsable(model)) throw new Error(`model ${model} not loaded`);
    template.updateMatrixWorld(true);
    const nodes = partNames.map((n) => {
      const node = findNode(template, n);
      if (!node) throw new Error(`model ${model} has no part ${n}`);
      return node;
    });
    const inverseRoot = template.matrixWorld.clone().invert();
    const restWorld = nodes.map((n) => inverseRoot.clone().multiply(n.matrixWorld));
    const stop = new Set(nodes);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    material.envMapIntensity = 0.75;
    nodes.forEach((node, i) => {
      // The part's own meshes, not those of child parts.
      const pieces: THREE.BufferGeometry[] = [];
      const toPart = node.matrixWorld.clone().invert();
      const walk = (o: THREE.Object3D) => {
        if (o !== node && stop.has(o)) return;
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          pieces.push(bakedGeometry(mesh, toPart.clone().multiply(mesh.matrixWorld), m.color));
        }
        o.children.forEach(walk);
      };
      walk(node);
      if (!pieces.length) throw new Error(`part ${partNames[i]} of ${model} has no meshes`);
      const merged = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false)!;
      if (pieces.length > 1) for (const g of pieces) g.dispose();
      merged.computeBoundingSphere();
      let parent = -1;
      for (let p = node.parent; p && parent < 0; p = p.parent) parent = nodes.indexOf(p as THREE.Object3D);
      const rest = parent >= 0 ? restWorld[parent].clone().invert().multiply(restWorld[i]) : restWorld[i];
      const mesh = new THREE.InstancedMesh(merged, material, capacity);
      mesh.count = 0;
      mesh.castShadow = castShadow;
      mesh.frustumCulled = false;
      mesh.name = `${model}:${partNames[i]}`;
      this.group.add(mesh);
      this.parts.push({ name: partNames[i], parent, rest, mesh });
    });
    this.world = this.parts.map(() => new THREE.Matrix4());
  }

  /**
   * Poses copy `index`: `root` places the whole model; `turns[part]` rotates that part about its
   * hinge (Euler x, y, z in radians), after its rest pose.
   */
  set(index: number, root: THREE.Matrix4, turns: Record<string, readonly [number, number, number]>) {
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      const base = part.parent >= 0 ? this.world[part.parent] : root;
      this.local.copy(part.rest);
      const t = turns[part.name];
      if (t) this.local.multiply(this.rot.makeRotationFromEuler(this.euler.set(t[0], t[1], t[2])));
      this.world[i].multiplyMatrices(base, this.local);
      part.mesh.setMatrixAt(index, this.world[i]);
    }
  }

  /** Shows the first `count` copies. */
  commit(count: number) {
    this.count = Math.min(count, this.capacity);
    for (const part of this.parts) {
      part.mesh.count = this.count;
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const part of this.parts) {
      part.mesh.geometry.dispose();
      part.mesh.dispose();
    }
    (this.parts[0]?.mesh.material as THREE.Material | undefined)?.dispose();
  }
}
