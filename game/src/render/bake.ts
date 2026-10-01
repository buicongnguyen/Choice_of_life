import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Colour baking: the models are flat-coloured toys, so parts that differ only in colour can share
 * one mesh. Each part's material colour is multiplied into its painted vertex colours and the
 * parts are merged into one geometry per surface finish. A house of nine materials becomes one
 * or two draw calls instead of nine, and looks the same.
 *
 * Parts that must stay separate keep their own material: anything that glows (windows and lamps
 * are driven by the sky), see-through glass, and textured materials.
 */

const isPlain = (m: THREE.Material): m is THREE.MeshStandardMaterial => {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || s.transparent || s.map || s.alphaMap) return false;
  const glows = s.emissive && s.emissiveIntensity > 0 && (s.emissive.r > 0 || s.emissive.g > 0 || s.emissive.b > 0);
  return !glows;
};

/**
 * Shared vertex-coloured materials, one per surface finish, so every baked model can share them.
 * Finishes are coarse (glossy, satin, matte; plain or metal): finer roughness steps can't be seen
 * at game distance, but each one would split a merge into another draw call.
 */
const finishes = new Map<string, THREE.MeshStandardMaterial>();
function finishFor(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const rough = m.roughness < 0.35 ? 0.25 : m.roughness < 0.62 ? 0.5 : 0.75;
  const metal = m.metalness < 0.3 ? 0 : 0.6;
  const key = `${rough}|${metal}|${m.side}|${m.flatShading ? 1 : 0}`;
  let shared = finishes.get(key);
  if (!shared) {
    shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: m.side, flatShading: m.flatShading });
    shared.envMapIntensity = m.envMapIntensity;
    shared.name = `baked:${key}`;
    shared.userData.shared = true;
    finishes.set(key, shared);
  }
  return shared;
}

/**
 * A float copy of a mesh's geometry in `space` (positions, normals and colour only), with the
 * material colour multiplied into the vertex colours. Quantised (meshopt) attributes are expanded.
 */
export function bakedGeometry(mesh: THREE.Mesh, space: THREE.Matrix4, colour: THREE.Color = new THREE.Color(1, 1, 1)): THREE.BufferGeometry {
  const src = mesh.geometry;
  const pos = src.getAttribute("position");
  const nrm = src.getAttribute("normal");
  const col = src.getAttribute("color");
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const q = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.getX(i);
    p[i * 3 + 1] = pos.getY(i);
    p[i * 3 + 2] = pos.getZ(i);
    if (nrm) {
      q[i * 3] = nrm.getX(i);
      q[i * 3 + 1] = nrm.getY(i);
      q[i * 3 + 2] = nrm.getZ(i);
    }
    c[i * 3] = (col ? col.getX(i) : 1) * colour.r;
    c[i * 3 + 1] = (col ? col.getY(i) : 1) * colour.g;
    c[i * 3 + 2] = (col ? col.getZ(i) : 1) * colour.b;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(p, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(q, 3));
  out.setAttribute("color", new THREE.BufferAttribute(c, 3));
  const index = src.index ? Array.from(src.index.array as ArrayLike<number>) : [...Array(n).keys()];
  // A mirroring transform turns triangles inside out; swap two corners to keep them facing out.
  if (space.determinant() < 0) for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  out.setIndex(index);
  out.applyMatrix4(space);
  if (!nrm) out.computeVertexNormals();
  return out;
}

/** Every mesh under `root` with its transform relative to `root`. */
function meshesIn(root: THREE.Object3D): { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const out: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.push({ mesh, matrix: inverse.clone().multiply(mesh.matrixWorld) });
  });
  return out;
}

/**
 * A copy of `template` (a static model) with its plain parts merged per surface finish. Special
 * parts are kept as they are, positioned where they were. Geometry is new; materials are shared.
 */
export function bakeModel(template: THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  out.name = template.name;
  const groups = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  for (const { mesh, matrix } of meshesIn(template)) {
    const m = mesh.material as THREE.Material;
    if (Array.isArray(mesh.material) || !isPlain(m)) {
      const keep = new THREE.Mesh(mesh.geometry, mesh.material);
      keep.applyMatrix4(matrix);
      keep.castShadow = mesh.castShadow;
      keep.receiveShadow = mesh.receiveShadow;
      out.add(keep);
      continue;
    }
    const finish = finishFor(m);
    const list = groups.get(finish) ?? [];
    list.push(bakedGeometry(mesh, matrix, m.color));
    groups.set(finish, list);
  }
  for (const [finish, list] of groups) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, finish);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baked = true;
    out.add(mesh);
  }
  return out;
}

/**
 * One geometry for a whole (sub)tree, every material colour baked in, for instancing: each copy
 * of the model is then a single instance of one InstancedMesh. Glow and glass are flattened too,
 * so use this only for small things (scatter, critters, footprints).
 */
export function bakeSingle(root: THREE.Object3D, space?: THREE.Matrix4): THREE.BufferGeometry {
  const parts = meshesIn(root).map(({ mesh, matrix }) => {
    const m = mesh.material as THREE.MeshStandardMaterial;
    const colour = (Array.isArray(mesh.material) ? undefined : m.color) ?? new THREE.Color(1, 1, 1);
    return bakedGeometry(mesh, space ? space.clone().multiply(matrix) : matrix, colour);
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Bakes an animated model per moving part: every plain mesh is merged into the nearest node in
 * `parts` (joints, swinging bits), one mesh per surface finish, so the joints still move them.
 * A character of ~20 meshes becomes ~9 (and as many fewer shadow draws). Glowing and see-through
 * parts are left alone. Returns the new geometries (the caller disposes them).
 */
export function bakeParts(root: THREE.Object3D, parts: Set<THREE.Object3D>): THREE.BufferGeometry[] {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Object3D, Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>>();
  const baked: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !isPlain(mesh.material)) return;
    let owner: THREE.Object3D = mesh;
    while (!parts.has(owner) && owner !== root && owner.parent) owner = owner.parent;
    const toOwner = owner.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const byFinish = groups.get(owner) ?? new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    const finish = finishFor(material);
    const list = byFinish.get(finish) ?? [];
    list.push(bakedGeometry(mesh, toOwner, material.color));
    byFinish.set(finish, list);
    groups.set(owner, byFinish);
    baked.push(mesh);
  });
  for (const mesh of baked) {
    // A joint can itself be a mesh (a one-material glTF node): keep the node for its children
    // and the animator, but stop drawing it.
    if (parts.has(mesh) || mesh.children.length) mesh.layers.disableAll();
    else mesh.removeFromParent();
  }
  const made: THREE.BufferGeometry[] = [];
  for (const [owner, byFinish] of groups) {
    for (const [finish, list] of byFinish) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, finish);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `${owner.name}:baked`;
      owner.add(mesh);
      made.push(merged);
    }
  }
  return made;
}
