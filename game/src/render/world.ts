import * as THREE from "three";

import { has } from "../game/life";
import { rng, type Rng } from "../game/rng";
import { resolve, type ChapterDef, type PlaceId } from "../game/story/model";
import type { LifeState } from "../game/types";
import { hasModel, instance, modelBox, readyAll } from "./assets";

/** How a model is positioned in depth. */
type Anchor =
  /** Authored in world layout already (ground tiles, walls): placed at z = 0. */
  | "tile"
  /** Its front face (max z) is aligned to `z`: backdrop buildings and furniture. */
  | "front"
  /** Its footprint centre is placed at `z`. */
  | "centre"
  /** Its back face (min z) is aligned to `z`: furniture standing against a wall. */
  | "back";

interface Pick {
  name: string;
  weight?: number;
}

interface Row {
  models: Pick[];
  z: number;
  anchor: Anchor;
  /** Gap range between neighbours (m). */
  gap: [number, number];
  /** Random depth jitter (m). */
  jitter?: number;
  /** Probability that a slot is left empty. */
  skip?: number;
  scale?: [number, number];
  /** Face the camera (0) or turn to the side for vehicles/boats. */
  yaw?: number;
  /** Bobbing on water. */
  float?: boolean;
  /** Vertical offset (trains sit down on their track bed). */
  y?: number;
}

interface BasePlane {
  colour: string;
  /** Depth range in world z (toward the camera is +). */
  z: [number, number];
  y: number;
}

export interface PlaceStyle {
  ground: string[];
  rows: Row[];
  planes: BasePlane[];
  /** Where the sea shoreline is (world z), or null for no sea. */
  shore: number | null;
  seaY?: number;
  /** A vertical quay face at z = +6 (harbour). */
  quay?: string;
  /** A cliff edge dropping to the sea behind the path. */
  cliffEdge?: string;
}

const H = 3.5; // backdrop front line (world z = -3.5)

const PLACES: Record<PlaceId, PlaceStyle> = {
  home: {
    ground: ["home_floor"],
    rows: [
      { models: [{ name: "home_wall", weight: 2 }, { name: "home_wall_window", weight: 2 }, { name: "home_wall_door" }], z: 0, anchor: "tile", gap: [0, 0] },
      {
        models: [
          { name: "sofa" },
          { name: "bookshelf" },
          { name: "crib" },
          { name: "armchair" },
          { name: "toy_chest" },
          { name: "floor_lamp" },
          { name: "plant_big" },
          { name: "kitchen_counter" },
          { name: "fridge" },
          { name: "dining_table" },
          { name: "high_chair" },
          { name: "rocking_horse" },
        ],
        z: -H + 0.08,
        anchor: "back",
        gap: [0.5, 1.8],
      },
      { models: [{ name: "rug_round" }], z: 0.2, anchor: "centre", gap: [9, 16], skip: 0.35 },
      { models: [{ name: "plant_big" }, { name: "rocking_horse" }], z: 4.6, anchor: "centre", gap: [12, 20], skip: 0.4 },
    ],
    planes: [
      { colour: "#8a4a22", z: [6, 40], y: -0.6 },
      { colour: "#ffe0b0", z: [-60, -3.6], y: -0.02 },
    ],
    shore: null,
  },
  garden: {
    ground: ["garden_floor"],
    rows: [
      { models: [{ name: "garden_fence" }], z: -H - 0.1, anchor: "front", gap: [0, 0] },
      { models: [{ name: "tree_round", weight: 3 }, { name: "boat_shed" }, { name: "flower_bed", weight: 2 }], z: -H - 1.2, anchor: "front", gap: [1, 4] },
      { models: [{ name: "flower_bed" }], z: 4.4, anchor: "centre", gap: [5, 11], skip: 0.25 },
      { models: [{ name: "hill_far" }], z: -70, anchor: "centre", gap: [8, 20] },
    ],
    planes: [
      { colour: "#5cc639", z: [-120, 40], y: -0.03 },
    ],
    shore: null,
  },
  harbour: {
    ground: ["street_tile"],
    rows: [
      {
        models: [
          { name: "house_a", weight: 2 },
          { name: "house_b", weight: 2 },
          { name: "house_c", weight: 2 },
          { name: "house_d", weight: 2 },
          { name: "bakery" },
          { name: "fish_market" },
        ],
        z: -H,
        anchor: "front",
        gap: [0.1, 0.8],
      },
      { models: [{ name: "lamp_post", weight: 2 }, { name: "bench" }, { name: "planter", weight: 2 }, { name: "barrel" }, { name: "crate_stack" }], z: -3.15, anchor: "centre", gap: [4, 9], skip: 0.2 },
      { models: [{ name: "bollard" }], z: 5.3, anchor: "centre", gap: [6, 9] },
      { models: [{ name: "boat_small" }], z: 8.4, anchor: "centre", gap: [10, 26], jitter: 0.3, float: true, yaw: 0.25 },
      { models: [{ name: "hill_far" }, { name: "tree_pine" }], z: -26, anchor: "centre", gap: [6, 18], scale: [1, 1.4] },
      { models: [{ name: "hill_far" }], z: -90, anchor: "centre", gap: [0, 12], scale: [1.4, 1.9] },
    ],
    planes: [{ colour: "#cfae7c", z: [-140, 6], y: -0.03 }],
    shore: 6,
    quay: "#a79fb8",
  },
  festival: {
    ground: ["street_tile"],
    rows: [
      {
        models: [{ name: "house_a" }, { name: "house_b" }, { name: "house_c" }, { name: "house_d" }, { name: "festival_stall", weight: 2 }],
        z: -H,
        anchor: "front",
        gap: [0.1, 1],
      },
      { models: [{ name: "lantern_string" }], z: -2.95, anchor: "centre", gap: [0, 0.5] },
      { models: [{ name: "festival_stall" }, { name: "planter" }, { name: "bench" }], z: -3.2, anchor: "centre", gap: [8, 14], skip: 0.3 },
      { models: [{ name: "bollard" }], z: 5.3, anchor: "centre", gap: [6, 9] },
      { models: [{ name: "boat_small" }], z: 8.4, anchor: "centre", gap: [10, 24], jitter: 0.3, float: true, yaw: 0.25 },
      { models: [{ name: "hill_far" }], z: -60, anchor: "centre", gap: [0, 10], scale: [1.2, 1.6] },
    ],
    planes: [{ colour: "#cfae7c", z: [-140, 6], y: -0.03 }],
    shore: 6,
    quay: "#a79fb8",
  },
  storm_harbour: {
    ground: ["street_tile"],
    rows: [
      { models: [{ name: "house_a" }, { name: "house_b" }, { name: "house_c" }, { name: "house_d" }, { name: "bakery" }], z: -H, anchor: "front", gap: [0.1, 0.8] },
      { models: [{ name: "lamp_post", weight: 2 }, { name: "sandbags" }, { name: "barrel" }], z: -3.15, anchor: "centre", gap: [5, 10], skip: 0.2 },
      { models: [{ name: "bollard" }], z: 5.3, anchor: "centre", gap: [6, 9] },
      { models: [{ name: "boat_small" }], z: 8.4, anchor: "centre", gap: [12, 28], jitter: 0.3, float: true, yaw: 0.25 },
      { models: [{ name: "hill_far" }], z: -60, anchor: "centre", gap: [0, 10], scale: [1.2, 1.6] },
    ],
    planes: [{ colour: "#8d8a8c", z: [-140, 6], y: -0.03 }],
    shore: 6,
    quay: "#7d7894",
  },
  coast: {
    ground: ["road_tile"],
    rows: [
      { models: [{ name: "guardrail" }], z: -H + 0.1, anchor: "front", gap: [0, 0] },
      { models: [{ name: "beach_hut", weight: 3 }, { name: "ice_cream_cart" }, { name: "dune_grass", weight: 2 }, { name: "signpost" }], z: -7, anchor: "centre", gap: [2, 7] },
      { models: [{ name: "dune_grass", weight: 2 }, { name: "rock_low" }], z: 4.6, anchor: "centre", gap: [3, 8] },
      { models: [{ name: "cliff_big" }, { name: "hill_far" }], z: -150, anchor: "centre", gap: [30, 80], scale: [1.4, 2] },
    ],
    planes: [
      { colour: "#f4c983", z: [-17, -3.4], y: -0.08 },
      { colour: "#8fd35a", z: [6, 40], y: -0.05 },
    ],
    shore: -16,
  },
  cliff: {
    ground: ["cliff_path_tile"],
    rows: [
      { models: [{ name: "tree_pine", weight: 2 }, { name: "rock_low", weight: 2 }, { name: "signpost" }, { name: "bench" }], z: -6, anchor: "centre", gap: [5, 12] },
      { models: [{ name: "dune_grass" }, { name: "rock_low" }], z: 4.4, anchor: "centre", gap: [4, 9] },
      { models: [{ name: "hill_far" }], z: -120, anchor: "centre", gap: [30, 70], scale: [1.4, 2] },
    ],
    planes: [
      { colour: "#6fd04a", z: [-14, 40], y: -0.05 },
    ],
    shore: -15,
    seaY: -9,
    cliffEdge: "#8a7d9c",
  },
  dusk_cliff: {
    ground: ["cliff_path_tile"],
    rows: [
      { models: [{ name: "tree_pine" }, { name: "rock_low", weight: 2 }, { name: "bench" }], z: -6.5, anchor: "centre", gap: [6, 14] },
      { models: [{ name: "dune_grass" }, { name: "rock_low" }], z: 4.4, anchor: "centre", gap: [4, 9] },
    ],
    planes: [{ colour: "#5aa83e", z: [-14, 40], y: -0.05 }],
    shore: -15,
    seaY: -9,
    cliffEdge: "#6b5f86",
  },
  station: {
    ground: ["platform_tile"],
    rows: [
      // A commuter train waits along the platform; the station hall rises behind it (a landmark).
      { models: [{ name: "train" }], z: -5.3, anchor: "centre", gap: [0.35, 0.35], y: -0.3 },
      { models: [{ name: "bench_city", weight: 2 }, { name: "newsstand" }], z: -3.2, anchor: "centre", gap: [7, 13] },
      { models: [{ name: "skyline_far" }], z: -110, anchor: "centre", gap: [0, 10] },
    ],
    planes: [
      { colour: "#5a5566", z: [-9, -3.4], y: -0.25 },
      { colour: "#8e8aa0", z: [6, 40], y: -0.05 },
    ],
    shore: null,
  },
  city: {
    ground: ["sidewalk_tile"],
    rows: [
      {
        models: [
          { name: "tower_a", weight: 2 },
          { name: "tower_b", weight: 2 },
          { name: "tower_c", weight: 2 },
          { name: "apartment", weight: 2 },
          { name: "shop_cafe" },
          { name: "shop_books" },
          { name: "shop_laundry" },
          { name: "office" },
        ],
        z: -H,
        anchor: "front",
        gap: [0.2, 1.2],
      },
      { models: [{ name: "street_tree", weight: 3 }, { name: "traffic_light" }, { name: "hydrant" }, { name: "newsstand" }, { name: "bench_city" }, { name: "bike_rack" }], z: -3.15, anchor: "centre", gap: [3, 8] },
      { models: [{ name: "taxi" }, { name: "car", weight: 2 }], z: 5.2, anchor: "centre", gap: [9, 22], skip: 0.25 },
      { models: [{ name: "skyline_far" }], z: -120, anchor: "centre", gap: [0, 10] },
      { models: [{ name: "bridge_far" }], z: -180, anchor: "centre", gap: [120, 200] },
    ],
    planes: [{ colour: "#4a4658", z: [6, 40], y: -0.05 }],
    shore: null,
  },
  storm_city: {
    ground: ["sidewalk_tile"],
    rows: [
      { models: [{ name: "tower_a" }, { name: "tower_b" }, { name: "tower_c" }, { name: "apartment", weight: 2 }, { name: "shop_cafe" }, { name: "shop_laundry" }], z: -H, anchor: "front", gap: [0.2, 1.2] },
      { models: [{ name: "street_tree", weight: 2 }, { name: "traffic_light" }, { name: "sandbags" }, { name: "hydrant" }], z: -3.15, anchor: "centre", gap: [3, 8] },
      { models: [{ name: "taxi" }, { name: "car", weight: 2 }], z: 5.2, anchor: "centre", gap: [10, 22], skip: 0.3 },
      { models: [{ name: "skyline_far" }], z: -110, anchor: "centre", gap: [0, 10] },
    ],
    planes: [{ colour: "#3a3848", z: [6, 40], y: -0.05 }],
    shore: null,
  },
};

const UNDER: Record<PlaceId, string> = {
  home: "#d9914f",
  garden: "#5cc639",
  harbour: "#c9a27a",
  festival: "#c9a27a",
  storm_harbour: "#8d8a8c",
  coast: "#5d5a6e",
  cliff: "#8bc25a",
  dusk_cliff: "#6aa24a",
  station: "#b8b2c8",
  city: "#c9c3d6",
  storm_city: "#8a8699",
};

export function placeStyle(place: PlaceId): PlaceStyle {
  return PLACES[place];
}

/** Every model any place can use (for the asset contract test). */
export function allPlaceModels(): string[] {
  const names = new Set<string>();
  for (const style of Object.values(PLACES)) {
    style.ground.forEach((g) => names.add(g));
    style.rows.forEach((r) => r.models.forEach((m) => names.add(m.name)));
  }
  return [...names];
}

export const LANDMARK_MODELS = ["lighthouse", "cliff_big", "fence_warning", "boat_shed", "school", "fish_market", "bus_stop", "high_school", "train", "campus", "shipyard", "shop_cafe", "hospital", "office", "newsroom", "aquarium_lab", "workshop"];

/** Story-specific set pieces, placed at encounter positions or fixed fractions of a chapter. */
export interface Landmark {
  model: string;
  x: number;
  z: number;
  anchor: Anchor;
  yaw?: number;
  scale?: number;
}

export function landmarksFor(chapter: ChapterDef, s: LifeState, encounterXs: Record<string, number>): Landmark[] {
  const L = chapter.length;
  const at = (id: string, fallback: number) => encounterXs[id] ?? fallback * L;
  const list: Landmark[] = [];
  const lighthouse = (x: number, z = -24) => list.push({ model: "lighthouse", x, z, anchor: "centre", scale: 1 }, { model: "cliff_big", x, z: z - 2, anchor: "centre", scale: 1.2 });
  switch (chapter.index) {
    case 0:
    case 8:
      list.push({ model: "lighthouse", x: L - 6, z: -8, anchor: "centre" });
      if (!has(s, "saved_light") && !has(s, "own_light") && !has(s, "juno_saved_light") && chapter.index === 8) {
        list.push({ model: "fence_warning", x: L - 12, z: -4.5, anchor: "centre" });
      }
      break;
    case 1:
      list.push({ model: "boat_shed", x: at("nanas-gift", 0.9) + 6, z: -H - 1, anchor: "front" });
      break;
    case 2:
      list.push({ model: "school", x: 0.06 * L, z: -H, anchor: "front" });
      list.push({ model: "fish_market", x: at("pup", 0.5) + 3, z: -H, anchor: "front" });
      list.push({ model: "boat_shed", x: at("dads-shed", 0.68) + 4, z: -H, anchor: "front" });
      list.push({ model: "lighthouse", x: at("the-tin", 0.93) + 10, z: -9, anchor: "centre" });
      lighthouse(0.35 * L, -70);
      break;
    case 3:
      list.push({ model: "bus_stop", x: at("bus-stop", 0.1) + 3, z: -H - 0.8, anchor: "front" });
      list.push({ model: "high_school", x: at("the-answers", 0.34) + 6, z: -9, anchor: "centre" });
      list.push({ model: "lighthouse", x: at("nanas-last-summer", 0.7) + 11, z: -9, anchor: "centre" });
      lighthouse(0.2 * L, -60);
      break;
    case 4:
      list.push({ model: "station", x: 34, z: -10.5, anchor: "front" });
      list.push({ model: "station", x: 128, z: -10.5, anchor: "front" });
      if (s.path === "uni") list.push({ model: "campus", x: 0.24 * L, z: -H, anchor: "front" });
      if (s.path === "apprentice") list.push({ model: "shipyard", x: 0.24 * L, z: -H, anchor: "front" });
      if (s.path === "shop") list.push({ model: "boat_shed", x: 0.24 * L, z: -H, anchor: "front" });
      list.push({ model: "bus_stop", x: at("sam", 0.55) + 3, z: -H - 0.6, anchor: "front" });
      list.push({ model: "shop_cafe", x: at("juno-in-the-city", 0.3) + 5, z: -H, anchor: "front" });
      break;
    case 5: {
      const work = { doctor: "hospital", engineer: "office", journalist: "newsroom", "marine biologist": "aquarium_lab", shipwright: "shipyard", boatwright: "workshop", "travel writer": "newsroom" } as const;
      const career = s.path ? ({ uni: { healer: "doctor", maker: "engineer", storyteller: "journalist", explorer: "marine biologist" }[s.dream ?? "healer"], apprentice: "shipwright", shop: "boatwright", travel: "travel writer" } as const)[s.path] : "engineer";
      list.push({ model: work[career as keyof typeof work], x: 0.08 * L, z: -H, anchor: "front" });
      list.push({ model: work[career as keyof typeof work], x: at("the-offer", 0.16) + 6, z: -H, anchor: "front" });
      break;
    }
    case 6:
      list.push({ model: "hospital", x: at("doctors-chair", 0.66) + 5, z: -H, anchor: "front" });
      list.push({ model: "lighthouse", x: at("save-the-light", 0.88) + 14, z: -14, anchor: "centre" });
      list.push({ model: "fence_warning", x: at("save-the-light", 0.88) + 8, z: -4.4, anchor: "centre" });
      break;
    case 7:
      lighthouse(0.5 * L, -46);
      list.push({ model: "lighthouse", x: L + 20, z: -40, anchor: "centre" });
      break;
  }
  return list.filter((l) => hasModel(l.model));
}

export interface Placement {
  name: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  float?: boolean;
}

/** All models a chapter can use, for preloading. */
export function chapterModels(chapter: ChapterDef, s: LifeState): string[] {
  const names = new Set<string>();
  for (const seg of resolve(chapter.places, s)) {
    const style = PLACES[seg.place];
    style.ground.forEach((g) => names.add(g));
    style.rows.forEach((r) => r.models.forEach((m) => names.add(m.name)));
  }
  landmarksFor(chapter, s, {}).forEach((l) => names.add(l.model));
  return [...names].filter(hasModel);
}

function weighted(r: Rng, picks: Pick[]): string {
  const total = picks.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  let roll = r.next() * total;
  for (const p of picks) {
    roll -= p.weight ?? 1;
    if (roll <= 0) return p.name;
  }
  return picks[picks.length - 1].name;
}

/** Deterministically lays out every placement for a chapter, from -40 m to the end + 80 m. */
export function layoutChapter(chapter: ChapterDef, s: LifeState, encounterXs: Record<string, number>): Placement[] {
  const segments = resolve(chapter.places, s);
  const placeAt = (x: number) => {
    let place = segments[0].place;
    for (const seg of segments) if (x >= seg.from * chapter.length) place = seg.place;
    return place;
  };
  const start = -40;
  const end = chapter.length + 90;
  const out: Placement[] = [];
  const r = rng(s.seed ^ 0x5eed ^ (chapter.index * 101));
  const landmarks = landmarksFor(chapter, s, encounterXs);
  // Landmarks in the backdrop band reserve their width so houses don't overlap them.
  const reserved = landmarks
    .filter((l) => l.z > -12 && l.z < -2)
    .map((l) => {
      const size = modelBox(l.model).getSize(new THREE.Vector3());
      return [l.x - size.x / 2 - 0.4, l.x + size.x / 2 + 0.4] as const;
    });
  const clashes = (x0: number, x1: number) => reserved.some(([a, b]) => x1 > a && x0 < b);

  // Ground tiles every 8 m.
  for (let x = Math.floor(start / 8) * 8; x < end; x += 8) {
    const style = PLACES[placeAt(x + 4)];
    const name = style.ground[Math.abs(Math.round(x / 8)) % style.ground.length];
    if (hasModel(name)) out.push({ name, x: x + 4, z: 0, y: 0, yaw: 0, scale: 1 });
  }

  // Rows: each row is packed independently along x; the row set follows the place at each x.
  const rowKeys = new Map<string, number>();
  for (const place of new Set(segments.map((seg) => seg.place))) {
    PLACES[place].rows.forEach((_row, i) => rowKeys.set(`${place}:${i}`, start));
  }
  for (const [key] of rowKeys) {
    const [place, index] = key.split(":");
    const row = PLACES[place as PlaceId].rows[Number(index)];
    const available = row.models.filter((m) => hasModel(m.name));
    if (!available.length) continue;
    let x = start + r.range(0, row.gap[1]);
    let guard = 0;
    while (x < end && guard++ < 2000) {
      const name = weighted(r, available);
      const box = modelBox(name);
      const scale = row.scale ? r.range(row.scale[0], row.scale[1]) : 1;
      const width = Math.max(0.4, (box.max.x - box.min.x) * scale);
      const cx = x - box.min.x * scale;
      const inPlace = placeAt(cx) === place;
      const skip = row.skip ? r.chance(row.skip) : false;
      if (inPlace && !skip && !(row.anchor === "front" && clashes(x, x + width))) {
        let z = row.z + (row.jitter ? r.range(-row.jitter, row.jitter) : 0);
        if (row.anchor === "front") z -= box.max.z * scale;
        else if (row.anchor === "back") z -= box.min.z * scale;
        else if (row.anchor === "centre") z -= ((box.max.z + box.min.z) / 2) * scale;
        const yaw = row.yaw ?? 0;
        out.push({ name, x: cx, z: row.anchor === "tile" ? 0 : z, y: row.y ?? 0, yaw, scale, float: row.float });
      }
      x += width + (row.gap[0] === row.gap[1] ? row.gap[0] : r.range(row.gap[0], row.gap[1]));
    }
  }
  for (const l of landmarks) {
    const box = modelBox(l.model);
    const scale = l.scale ?? 1;
    let z = l.z;
    if (l.anchor === "front") z -= box.max.z * scale;
    else if (l.anchor === "back") z -= box.min.z * scale;
    else if (l.anchor === "centre") z -= ((box.max.z + box.min.z) / 2) * scale;
    out.push({ name: l.model, x: l.x - ((box.max.x + box.min.x) / 2) * scale, z, y: 0, yaw: l.yaw ?? 0, scale });
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

/** Streams placements in and out around the camera and owns the generated base geometry. */
export class World {
  readonly group = new THREE.Group();
  private live = new Map<number, THREE.Object3D>();
  private floaters: { obj: THREE.Object3D; phase: number; baseY: number }[] = [];
  private base = new THREE.Group();

  constructor(
    readonly placements: Placement[],
    readonly chapter: ChapterDef,
    readonly life: LifeState,
  ) {
    this.group.add(this.base);
    this.buildBase();
  }

  static async prepare(chapter: ChapterDef, s: LifeState, encounterXs: Record<string, number>): Promise<World> {
    await readyAll(chapterModels(chapter, s));
    return new World(layoutChapter(chapter, s, encounterXs), chapter, s);
  }

  /** Flat base planes, the quay wall and the cliff edge for each place segment. */
  private buildBase() {
    const segments = resolve(this.chapter.places, this.life);
    segments.forEach((seg, i) => {
      const x0 = i === 0 ? -80 : seg.from * this.chapter.length;
      const x1 = i === segments.length - 1 ? this.chapter.length + 140 : segments[i + 1].from * this.chapter.length;
      const style = PLACES[seg.place];
      // A solid band under the lanes so gaps between tiles never show the sea.
      const under = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, 9.6), new THREE.MeshStandardMaterial({ color: UNDER[seg.place], roughness: 0.9 }));
      under.position.set((x0 + x1) / 2, -0.12, 1.2);
      under.receiveShadow = true;
      this.base.add(under);
      for (const p of style.planes) {
        const depth = p.z[1] - p.z[0];
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0, 0.1, depth),
          new THREE.MeshStandardMaterial({ color: p.colour, roughness: 0.9 }),
        );
        mesh.position.set((x0 + x1) / 2, p.y - 0.05, (p.z[0] + p.z[1]) / 2);
        mesh.receiveShadow = true;
        this.base.add(mesh);
      }
      if (seg.place === "home") {
        // A warm backdrop above the cutaway wall, like the back of a dolls' house stage.
        const g = new THREE.PlaneGeometry(x1 - x0, 18, 1, 8);
        const colours: number[] = [];
        const top = new THREE.Color("#f39a6a");
        const low = new THREE.Color("#ffe3bf");
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const t = (pos.getY(v) + 9) / 18;
          const c = low.clone().lerp(top, t);
          colours.push(c.r, c.g, c.b);
        }
        g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
        const back = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
        back.position.set((x0 + x1) / 2, 3.2 + 9, -4.05);
        this.base.add(back);
      }
      if (style.quay) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0, 1.6, 0.6),
          new THREE.MeshStandardMaterial({ color: style.quay, roughness: 0.8 }),
        );
        wall.position.set((x0 + x1) / 2, -0.8, 6.25);
        wall.receiveShadow = true;
        this.base.add(wall);
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0, 0.18, 0.9),
          new THREE.MeshStandardMaterial({ color: "#fff1d6", roughness: 0.7 }),
        );
        cap.position.set((x0 + x1) / 2, 0.02, 6.2);
        cap.receiveShadow = true;
        this.base.add(cap);
      }
      if (style.cliffEdge) {
        const rock = new THREE.MeshStandardMaterial({ color: style.cliffEdge, roughness: 0.85, flatShading: true });
        const r = rng(this.life.seed ^ (i * 7919));
        for (let x = x0; x < x1; x += 5) {
          const radius = r.range(3, 5);
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), rock);
          const sy = 1.4 + r.range(0, 0.3);
          // The rocks form the cliff face: their tops stay just below the grass line.
          m.position.set(x + r.range(-1, 1), -radius * sy - 0.25, -15.5 - r.range(0, 2));
          m.scale.set(1.6, sy, 1);
          m.rotation.set(r.range(0, 3), r.range(0, 3), r.range(0, 3));
          m.receiveShadow = true;
          this.base.add(m);
        }
      }
    });
  }

  /** Where the sea should sit for the place at x (for the Engine's sea). */
  seaAt(x: number): { shore: number | null; y: number } {
    const segments = resolve(this.chapter.places, this.life);
    let place = segments[0].place;
    for (const seg of segments) if (x >= seg.from * this.chapter.length) place = seg.place;
    const style = PLACES[place];
    return { shore: style.shore, y: style.seaY ?? -0.35 };
  }

  update(cameraX: number, time: number) {
    const lo = cameraX - 45;
    const hi = cameraX + 120;
    // Remove what fell behind.
    for (const [i, obj] of this.live) {
      const p = this.placements[i];
      if (p.x < lo - 20 || p.x > hi + 20) {
        obj.removeFromParent();
        this.live.delete(i);
        this.floaters = this.floaters.filter((f) => f.obj !== obj);
      }
    }
    // Add what came into range (placements are sorted by x).
    for (let i = 0; i < this.placements.length; i++) {
      const p = this.placements[i];
      if (p.x < lo) continue;
      if (p.x > hi) break;
      if (this.live.has(i)) continue;
      const obj = instance(p.name);
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = p.yaw;
      obj.scale.setScalar(p.scale);
      // Far silhouettes neither cast nor need shadows.
      if (p.z < -30) {
        obj.traverse((o) => {
          o.castShadow = false;
          o.receiveShadow = false;
        });
      }
      this.group.add(obj);
      this.live.set(i, obj);
      if (p.float) this.floaters.push({ obj, phase: p.x * 0.37, baseY: p.y - 0.15 });
    }
    for (const f of this.floaters) {
      f.obj.position.y = f.baseY + Math.sin(time * 1.3 + f.phase) * 0.12;
      f.obj.rotation.z = Math.sin(time * 1.1 + f.phase) * 0.04;
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.live.clear();
  }
}
