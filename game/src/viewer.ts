import * as THREE from "three";

import { createLife } from "./game/life";
import type { PersonId } from "./game/story/model";
import { loadManifest, readyAll } from "./render/assets";
import { personSpec, playerSpec } from "./render/cast";
import { Engine } from "./render/engine";
import { createPerson } from "./render/people";

/** Debug views for art review: ?view=cast | ?view=models&names=a,b,c */
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
