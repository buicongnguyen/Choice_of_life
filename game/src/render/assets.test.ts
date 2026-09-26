import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLife } from "../game/life";
import { CHAPTERS } from "../game/story/chapters";
import type { PersonId } from "../game/story/model";
import type { LifeState } from "../game/types";
import { HAIR_STYLES, personSpec, playerSpec, type CharacterSpec } from "./cast";
import { allPlaceModels, LANDMARK_MODELS } from "./world";

interface Entry {
  group: string;
  bytes: number;
  triangles: number;
  nodes: string[];
  materials: string[];
  extras: Record<string, unknown>;
}
const manifest = JSON.parse(readFileSync(new URL("../../../public/models/manifest.json", import.meta.url), "utf8")) as Record<string, Entry>;

const PEOPLE: PersonId[] = ["mom", "dad", "nana", "juno", "dex", "okafor", "hale", "sam", "lina", "mika", "pip", "ada", "doctor", "biscuit"];

function lives(): LifeState[] {
  const out: LifeState[] = [];
  for (const hairStyle of HAIR_STYLES) {
    for (const [path, dream] of [["uni", "healer"], ["uni", "storyteller"], ["uni", "explorer"], ["uni", "maker"], ["apprentice", "maker"], ["shop", "maker"], ["travel", "explorer"]] as const) {
      const s = createLife({ name: "Kai", pronoun: "they", look: { skin: "#f0b48a", hair: "#4a2c1d", hairStyle, colour: "#12a5b8" }, seed: 1 });
      s.path = path;
      s.dream = dream;
      s.flags = ["partner", "kids", "biscuit"];
      out.push(s);
    }
  }
  return out;
}

function specModels(spec: CharacterSpec) {
  return [spec.body, ...(spec.hair ? [`hair_${spec.hair}`] : []), ...(spec.accessories ?? []).map((a) => `acc_${a}`)];
}

describe("asset contract", () => {
  it("has every model the cast can wear, at every age", () => {
    const needed = new Set<string>();
    for (const s of lives()) {
      for (let chapter = 0; chapter <= 8; chapter++) {
        for (const age of ["baby", "toddler", "child", "teen", "adult", "elder"] as const) specModels(playerSpec(s, age, chapter)).forEach((n) => needed.add(n));
        for (const id of PEOPLE) specModels(personSpec(id, s, chapter)).forEach((n) => needed.add(n));
      }
    }
    expect([...needed].filter((n) => !manifest[n])).toEqual([]);
  });

  it("has every place, landmark, hazard, pickup and prop the chapters use", () => {
    const needed = new Set<string>([...allPlaceModels(), ...LANDMARK_MODELS, "pickup_heart", "pickup_star", "pickup_coin", "keepsake", "letter", "tin", "bicycle"]);
    for (const c of CHAPTERS) c.hazards.forEach((h) => needed.add(h.model));
    expect([...needed].filter((n) => !manifest[n])).toEqual([]);
  });

  it("bodies expose the joints and sockets the animator and outfits use", () => {
    for (const [name, entry] of Object.entries(manifest)) {
      if (!name.startsWith("body_")) continue;
      for (const joint of ["Root", "Hips", "Torso", "Head", "ArmL", "ArmR", "LegL", "LegR", "HeadCenter", "HandR", "Back", "Chest"]) {
        expect(entry.nodes, `${name} ${joint}`).toContain(joint);
      }
      for (const mat of ["Skin", "Top", "Eye", ...(name === "body_baby" ? [] : ["Shoes"])]) expect(entry.materials, `${name} ${mat}`).toContain(mat);
    }
    expect(manifest.dog.nodes).toEqual(expect.arrayContaining(["Body", "Head", "Tail", "LegFL", "LegBR", "EarL"]));
    expect(manifest.bicycle.nodes).toEqual(expect.arrayContaining(["Frame", "WheelF", "WheelB", "Crank", "Seat"]));
  });

  it("low hazards can be jumped and tall ones cannot", () => {
    for (const c of CHAPTERS) {
      for (const h of c.hazards) {
        const height = Number(manifest[h.model]?.extras.height ?? NaN);
        if (Number.isNaN(height)) continue;
        if (h.kind === "low") expect(height, h.model).toBeLessThanOrEqual(0.5);
        else expect(height, h.model).toBeGreaterThanOrEqual(0.75);
      }
    }
  });

  it("stays inside the download budget", () => {
    const total = Object.values(manifest).reduce((sum, e) => sum + e.bytes, 0);
    expect(total).toBeLessThan(7.5e6);
    for (const [name, e] of Object.entries(manifest)) {
      const limit = name === "lighthouse" ? 260e3 : e.group === "characters" ? 140e3 : 200e3;
      expect(e.bytes, name).toBeLessThan(limit);
    }
  });
});
