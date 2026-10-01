import * as THREE from "three";

import { createLife } from "./game/life";
import type { PersonId } from "./game/story/model";
import { loadManifest, readyAll } from "./render/assets";
import { personSpec, playerSpec } from "./render/cast";
import { Engine } from "./render/engine";
import { createPerson } from "./render/people";
import type { Gull } from "./render/flock";

/** Debug views for art review: ?view=cast | ?view=models&names=a,b,c | ?view=gulls */
export async function startViewer(kind: string, params: URLSearchParams) {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const engine = new Engine(canvas, { quality: (params.get("q") as "high" | "low") ?? "high" });
  engine.setMood((params.get("sky") as never) ?? "noon");
  await loadManifest();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#ffd9a0", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);
  const items: THREE.Object3D[] = [];
  const animated: { update(dt: number): void }[] = [];
  if (kind === "gulls") return gullView(engine, params);
  if (kind === "cast") {
    const life = createLife({ name: "Kai", pronoun: "they", look: { skin: "#f0b48a", hair: "#4a2c1d", hairStyle: (params.get("hair") as never) ?? "short", colour: "#12a5b8" }, seed: 1 });
    const chapter = Number(params.get("chapter") ?? 2);
    const ids = (params.get("people") ?? "you,mom,dad,nana,juno,dex,okafor,sam,lina,biscuit").split(",") as PersonId[];
    const ages = ["baby", "toddler", "child", "teen", "adult", "elder"] as const;
    const specs = params.get("ages") ? ages.map((a) => playerSpec(life, a, chapter)) : ids.map((id) => (id === "you" ? playerSpec(life, "child", chapter) : personSpec(id, life, chapter)));
    for (const spec of specs) {
      const p = await createPerson(spec);
      p.anim = (params.get("anim") as never) ?? "idle";
      p.speed = 6;
      items.push(p.root);
      animated.push(p);
    }
  } else {
    const names = (params.get("names") ?? "").split(",").filter(Boolean);
    await readyAll(names);
    const { instance } = await import("./render/assets");
    for (const n of names) items.push(instance(n));
  }
  let x = 0;
  const gap = Number(params.get("gap") ?? 0.35);
  for (const item of items) {
    const box = new THREE.Box3().setFromObject(item);
    const w = box.max.x - box.min.x;
    item.position.x = x - box.min.x;
    x += w + gap;
    engine.scene.add(item);
  }
  const span = x - gap;
  const box = new THREE.Box3();
  items.forEach((i) => box.expandByObject(i));
  const height = box.max.y;
  const dist = Number(params.get("dist") ?? Math.max(span * 0.9, height * 2.4));
  const yaw = Number(params.get("yaw") ?? 0);
  const target = new THREE.Vector3(span / 2, height * 0.45, 0);
  engine.camera.position.set(target.x + Math.sin(yaw) * dist, target.y + dist * 0.25 + Number(params.get("lift") ?? 0), Math.cos(yaw) * dist);
  engine.camera.lookAt(target);
  engine.followShadows(target);
  engine.refreshGlow();
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    animated.forEach((a) => a.update(dt));
    engine.render(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __viewerReady: boolean }).__viewerReady = true;
}

/** Gull poses side by side: perched facing four ways, half-folded at take-off, and in flight. */
async function gullView(engine: Engine, params: URLSearchParams) {
  const { GullView, GULL_POSE } = await import("./render/gulls");
  for (const key of ["fold", "roll", "droop"] as const) if (params.get(key)) GULL_POSE[key] = Number(params.get(key));
  await readyAll(["gull"]);
  const view = new GullView(8);
  engine.scene.add(view.rig.group);
  const base = { pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, flapping: 0, head: 0, headTarget: 0, peck: 0, timer: 0, delay: 0, cx: 0, cy: 0, cz: 0, ty: 0, tz: 0, radius: 0, turn: 0, angle: 0, seed: 1 };
  const gulls: Gull[] = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw, i) => ({ ...base, mode: "perched" as const, x: i * 0.9, y: 0, z: 0, yaw, spread: 0, flap: 0 }));
  gulls.push({ ...base, mode: "flying" as const, x: 4, y: 0.5, z: 0, yaw: Math.PI / 2, spread: 0.5, flap: 0, flapping: 1 });
  gulls.push({ ...base, mode: "flying" as const, x: 5.4, y: 0.8, z: 0, yaw: Math.PI / 2, spread: 1, flap: Math.PI / 2, flapping: 1 });
  gulls.push({ ...base, mode: "flying" as const, x: 7, y: 0.8, z: 0, yaw: Math.PI / 2, spread: 1, flap: -Math.PI / 2, flapping: 1 });
  view.update(gulls);
  const target = new THREE.Vector3(3.5, 0.3, 0);
  const dist = Number(params.get("dist") ?? 6);
  const yaw = Number(params.get("yaw") ?? 0);
  engine.camera.position.set(target.x + Math.sin(yaw) * dist, target.y + dist * Number(params.get("pitch") ?? 0.6), Math.cos(yaw) * dist);
  engine.camera.lookAt(target);
  engine.followShadows(target);
  const loop = () => {
    engine.render(0.016);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __viewerReady: boolean }).__viewerReady = true;
}
