import * as THREE from "three";

import { rng } from "../game/rng";
import { resolve, type ChapterDef, type PlaceId } from "../game/story/model";
import type { LifeState } from "../game/types";
import { hasModel } from "./assets";
import { scatterMaterial, singleGeometry, StreamedInstances, type ScatterItem } from "./instancing";

/**
 * The tiny things along the verges: grass, flowers, weeds, pebbles, shells, starfish, fallen
 * leaves, petals and feathers. The plan is pure data (seeded, so the same life always looks the
 * same); drawing is one streamed InstancedMesh per kind (see instancing.ts).
 *
 * Nothing is ever placed on the three lanes (|z| < LANE_CLEAR): scatter is decoration and must
 * never look like a pickup or an obstacle.
 */

export const LANE_CLEAR = 3.0;

/** A strip of ground beside the lanes: depth range (world z) and ground height. */
type Band = readonly [z0: number, z1: number, y: number];

interface Kind {
  model: string;
  /** Items per metre of course. */
  perMetre: number;
  bands: Band[];
  scale?: [number, number];
  /** Per-instance colour multipliers (hex); one is picked per item. */
  tints?: string[];
  /** Wind bend (0 = stiff). */
  bend?: number;
}

const BACK: Band = [-3.45, -3.05, 0];
const FRONT: Band = [3.05, 4.2, 0];
const QUAY: Band = [4.4, 5.6, 0];
const LEAVES = ["#ffffff", "#ffb08a", "#fff09a", "#ffd0a0"];

export const SCATTER: Partial<Record<PlaceId, Kind[]>> = {
  garden: [
    { model: "tiny_flowers", perMetre: 0.55, bands: [BACK, FRONT, [5.2, 9, -0.03]], bend: 0.35 },
    { model: "tiny_tuft", perMetre: 1.1, bands: [FRONT, [4.2, 9, -0.03]], scale: [0.8, 1.5], bend: 0.5 },
    { model: "tiny_pebbles", perMetre: 0.12, bands: [FRONT] },
    { model: "tiny_petals", perMetre: 0.2, bands: [FRONT, BACK], tints: ["#ffffff", "#fff6c8"] },
  ],
  harbour: [
    { model: "tiny_weeds", perMetre: 0.32, bands: [BACK, FRONT], bend: 0.25 },
    { model: "tiny_feather", perMetre: 0.07, bands: [FRONT, QUAY] },
    { model: "tiny_shell", perMetre: 0.1, bands: [QUAY] },
  ],
  festival: [
    { model: "tiny_petals", perMetre: 1.1, bands: [BACK, FRONT, QUAY], tints: ["#ffffff", "#fff6c8", "#ffd0e0"] },
    { model: "tiny_weeds", perMetre: 0.12, bands: [FRONT], bend: 0.25 },
    { model: "tiny_feather", perMetre: 0.05, bands: [QUAY] },
  ],
  storm_harbour: [
    { model: "tiny_leaf", perMetre: 0.9, bands: [BACK, FRONT, QUAY], scale: [0.8, 1.3], tints: LEAVES },
    { model: "tiny_feather", perMetre: 0.08, bands: [FRONT] },
  ],
  coast: [
    { model: "tiny_tuft", perMetre: 0.8, bands: [[3.1, 5.8, 0], [6.3, 11, -0.05]], scale: [0.8, 1.5], bend: 0.5 },
    { model: "tiny_flowers", perMetre: 0.22, bands: [[3.1, 5.8, 0], [6.3, 11, -0.05]], bend: 0.35 },
    { model: "tiny_shell", perMetre: 0.35, bands: [[-12, -3.7, -0.08]] },
    { model: "tiny_starfish", perMetre: 0.12, bands: [[-12, -3.7, -0.08]], scale: [0.8, 1.2] },
    { model: "tiny_pebbles", perMetre: 0.22, bands: [[-12, -3.7, -0.08]] },
  ],
  cliff: [
    { model: "tiny_tuft", perMetre: 1.4, bands: [FRONT, [4.2, 9, -0.05], [-13, -3.7, -0.05]], scale: [0.8, 1.6], bend: 0.5 },
    { model: "tiny_flowers", perMetre: 0.5, bands: [FRONT, [4.2, 9, -0.05], [-13, -3.7, -0.05]], bend: 0.35 },
    { model: "tiny_pebbles", perMetre: 0.15, bands: [FRONT] },
  ],
  dusk_cliff: [
    { model: "tiny_tuft", perMetre: 1.3, bands: [FRONT, [4.2, 9, -0.05], [-13, -3.7, -0.05]], scale: [0.8, 1.6], bend: 0.5 },
    { model: "tiny_flowers", perMetre: 0.25, bands: [FRONT, [4.2, 9, -0.05]], bend: 0.35 },
  ],
  station: [
    { model: "tiny_weeds", perMetre: 0.1, bands: [BACK, FRONT], bend: 0.25 },
    { model: "tiny_leaf", perMetre: 0.1, bands: [FRONT], tints: LEAVES },
  ],
  city: [
    { model: "tiny_leaf", perMetre: 0.22, bands: [BACK, FRONT], tints: LEAVES },
    { model: "tiny_weeds", perMetre: 0.08, bands: [BACK], bend: 0.25 },
  ],
  storm_city: [{ model: "tiny_leaf", perMetre: 0.8, bands: [BACK, FRONT], scale: [0.8, 1.3], tints: LEAVES }],
};

export interface PlannedItem {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tint?: string;
}

/** Every scatter model a chapter can use (for preloading). */
export function scatterModels(chapter: ChapterDef, s: LifeState): string[] {
  const names = new Set<string>();
  for (const seg of resolve(chapter.places, s)) for (const k of SCATTER[seg.place] ?? []) names.add(k.model);
  return [...names];
}

/**
 * Seeded scatter plan for a chapter: items per model, sorted by x. `density` (0..1) keeps a
 * stable subset, so lower quality thins the same plan rather than making a different one.
 */
export function planScatter(chapter: ChapterDef, s: LifeState, density = 1): Map<string, PlannedItem[]> {
  const out = new Map<string, PlannedItem[]>();
  const segments = resolve(chapter.places, s);
  segments.forEach((seg, i) => {
    const x0 = i === 0 ? -40 : seg.from * chapter.length;
    const x1 = i === segments.length - 1 ? chapter.length + 90 : segments[i + 1].from * chapter.length;
    const kinds = SCATTER[seg.place] ?? [];
    kinds.forEach((kind, k) => {
      const r = rng(s.seed ^ 0x71ce ^ (chapter.index * 977) ^ (i * 131) ^ (k * 7919));
      const widths = kind.bands.map(([a, b]) => b - a);
      const total = widths.reduce((sum, w) => sum + w, 0);
      const count = Math.round((x1 - x0) * kind.perMetre);
      const list = out.get(kind.model) ?? [];
      for (let n = 0; n < count; n++) {
        // Draw every random number before the density test, so thinning keeps the same items.
        const x = r.range(x0, x1);
        let pick = r.range(0, total);
        let band = kind.bands[0];
        for (let b = 0; b < kind.bands.length; b++) {
          band = kind.bands[b];
          if ((pick -= widths[b]) <= 0) break;
        }
        const z = r.range(band[0], band[1]);
        const yaw = r.range(0, Math.PI * 2);
        const scale = kind.scale ? r.range(kind.scale[0], kind.scale[1]) : r.range(0.85, 1.2);
        const tint = kind.tints ? kind.tints[Math.floor(r.next() * kind.tints.length) % kind.tints.length] : undefined;
        const keep = r.next() < density;
        if (keep && Math.abs(z) >= LANE_CLEAR) list.push({ x, y: band[2], z, yaw, scale, tint });
      }
      out.set(kind.model, list);
    });
  });
  for (const list of out.values()) list.sort((a, b) => a.x - b.x);
  return out;
}

/** How far around the camera scatter is drawn (it is tiny, so it fades into texture beyond). */
const BEHIND = 40;
const SPAN = 150;

/** Draws a chapter's scatter plan: one instanced draw call per kind. */
export class Scatter {
  readonly group = Object.assign(new THREE.Group(), { name: "scatter" });
  private batches: StreamedInstances[] = [];
  private materials: THREE.Material[] = [];

  constructor(chapter: ChapterDef, s: LifeState, density: number) {
    const bends = new Map<string, number>();
    for (const kinds of Object.values(SCATTER)) for (const k of kinds ?? []) bends.set(k.model, k.bend ?? 0);
    for (const [model, plan] of planScatter(chapter, s, density)) {
      const geometry = hasModel(model) ? singleGeometry(model) : undefined;
      if (!geometry || !plan.length) continue;
      const material = scatterMaterial(bends.get(model) ?? 0);
      this.materials.push(material);
      const items: ScatterItem[] = plan.map((p) => ({ ...p, tint: p.tint ? new THREE.Color(p.tint) : undefined }));
      const batch = new StreamedInstances(geometry, material, items, SPAN);
      batch.mesh.name = `scatter:${model}`;
      this.batches.push(batch);
      this.group.add(batch.mesh);
    }
  }

  update(cameraX: number) {
    for (const b of this.batches) b.update(cameraX - BEHIND);
  }

  /** Instances currently drawn, per model (for QA). */
  counts(): Record<string, number> {
    return Object.fromEntries(this.batches.map((b) => [b.mesh.name.slice(8), b.mesh.count]));
  }

  dispose() {
    this.group.removeFromParent();
    for (const b of this.batches) b.dispose();
    for (const m of this.materials) m.dispose();
    this.batches = [];
  }
}
