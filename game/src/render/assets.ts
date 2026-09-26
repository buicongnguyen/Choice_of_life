import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export interface ManifestEntry {
  group: string;
  bytes: number;
  triangles: number;
  nodes: string[];
  materials: string[];
  extras: Record<string, string | number>;
}
export type Manifest = Record<string, ManifestEntry>;

const BASE = "./models/";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<THREE.Object3D>>();
const sizes = new Map<string, THREE.Box3>();
let manifest: Manifest = {};

/** Materials that glow: windows at dusk, lamps always. Collected so the sky can drive them. */
export const glowMaterials = { windows: new Set<THREE.MeshStandardMaterial>(), lamps: new Set<THREE.MeshStandardMaterial>() };

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    manifest = res.ok ? ((await res.json()) as Manifest) : {};
  } catch {
    manifest = {};
  }
  return manifest;
}

export const hasModel = (name: string) => name in manifest;
export const modelExtras = (name: string) => manifest[name]?.extras ?? {};

function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as THREE.MeshStandardMaterial[]) {
      if (!m || !("isMeshStandardMaterial" in m)) continue;
      m.envMapIntensity = 0.75;
      const name = m.name.replace(/\.\d+$/, "");
      if (name === "Window") {
        m.emissive = new THREE.Color("#ffc46b");
        m.emissiveIntensity = 0.05;
        m.roughness = 0.12;
        m.metalness = 0.1;
        glowMaterials.windows.add(m);
      } else if (name === "Lamp") {
        m.emissive = m.color.clone().lerp(new THREE.Color("#fff3c4"), 0.5);
        m.emissiveIntensity = 0.9;
        glowMaterials.lamps.add(m);
      } else if (name === "EyeShine") {
        m.emissive = new THREE.Color("#ffffff");
        m.emissiveIntensity = 1;
      } else if (name === "Glass") {
        m.transparent = true;
        m.opacity = 0.35;
        m.depthWrite = false;
      }
    }
  });
}

/** Loads (once) and returns the template scene for a model; missing models become a visible placeholder. */
export function loadModel(name: string): Promise<THREE.Object3D> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader
      .loadAsync(`${BASE}${name}.glb`)
      .then((gltf: GLTF) => {
        const root = gltf.scene;
        prepare(root);
        root.updateMatrixWorld(true);
        sizes.set(name, new THREE.Box3().setFromObject(root));
        return root;
      })
      .catch(() => {
        console.warn(`model ${name} missing; using a placeholder`);
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#ff00aa" }));
        box.position.y = 0.5;
        const g = new THREE.Group();
        g.add(box);
        sizes.set(name, new THREE.Box3().setFromObject(g));
        return g as THREE.Object3D;
      });
    cache.set(name, pending);
  }
  return pending;
}

export async function preload(names: Iterable<string>) {
  await Promise.all([...new Set(names)].map((n) => loadModel(n)));
}

/** Synchronous instance of an already-loaded model (geometry and materials are shared). */
export function instance(name: string): THREE.Object3D {
  const template = loadedTemplates.get(name);
  if (!template) throw new Error(`model ${name} not preloaded`);
  return template.clone(true);
}

const loadedTemplates = new Map<string, THREE.Object3D>();
export async function ready(name: string) {
  const t = await loadModel(name);
  loadedTemplates.set(name, t);
  return t;
}
export async function readyAll(names: Iterable<string>) {
  await Promise.all([...new Set(names)].map((n) => ready(n)));
}
export const isReady = (name: string) => loadedTemplates.has(name);

export function modelSize(name: string): THREE.Vector3 {
  const box = sizes.get(name);
  return box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
}
export function modelBox(name: string): THREE.Box3 {
  return sizes.get(name)?.clone() ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
}

/** Gives an instance its own copies of the named materials, recoloured. */
export function recolour(root: THREE.Object3D, colours: Record<string, string | THREE.Color>) {
  const copies = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => {
      const base = m.name.replace(/\.\d+$/, "");
      const colour = colours[base];
      if (colour === undefined) return m;
      let copy = copies.get(m);
      if (!copy) {
        copy = m.clone();
        (copy as THREE.MeshStandardMaterial).color = new THREE.Color(colour);
        copies.set(m, copy);
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

export function setShadows(root: THREE.Object3D, cast: boolean, receive = true) {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
