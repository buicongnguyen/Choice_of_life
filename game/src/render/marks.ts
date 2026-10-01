import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Marks on the ground: footprints (wet after a puddle, milky after spilt milk, soft in cliff-path
 * dirt and on rain-soaked streets) and ripple rings (puddle splashes, raindrops). Each kind is one
 * instanced draw call from a fixed pool; a mark is written once when it appears and the shader
 * ages, grows and fades it, so a busy storm costs no per-frame CPU work.
 */

const VERTEX = /* glsl */ `
  attribute float born;
  attribute float life;
  attribute vec4 tint;
  uniform float time;
  uniform float grow;
  varying float vAlpha;
  varying vec3 vColour;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    float age = (time - born) / max(life, 0.001);
    if (age < 0.0 || age > 1.0) {
      // Dead marks are moved outside the view so they are never rasterised.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    // Footprints hold, then fade; ripples fade as they spread.
    vAlpha = tint.a * (grow > 0.0 ? (1.0 - age) * (1.0 - age) : 1.0 - smoothstep(0.55, 1.0, age));
    vColour = tint.rgb;
    vUv = uv;
    float s = 1.0 + grow * age;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position * vec3(s, 1.0, s), 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAGMENT = /* glsl */ `
  uniform float ring;
  varying float vAlpha;
  varying vec3 vColour;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    float a = vAlpha;
    if (ring > 0.5) {
      float d = length(vUv - 0.5) * 2.0;
      a *= smoothstep(0.6, 0.8, d) * (1.0 - smoothstep(0.86, 1.0, d));
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColour, a);
    // Tone-mapped and fogged like the rest of the scene, with or without the bloom pass.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

class MarkPool {
  readonly mesh: THREE.InstancedMesh;
  private born: THREE.InstancedBufferAttribute;
  private life: THREE.InstancedBufferAttribute;
  private tint: THREE.InstancedBufferAttribute;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  readonly uniforms: { time: { value: number }; grow: { value: number }; ring: { value: number } };

  constructor(geometry: THREE.BufferGeometry, readonly size: number, grow: number, ring: boolean) {
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(size).fill(-1e6), 1);
    this.life = new THREE.InstancedBufferAttribute(new Float32Array(size).fill(1), 1);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
    geometry.setAttribute("born", this.born);
    geometry.setAttribute("life", this.life);
    geometry.setAttribute("tint", this.tint);
    this.uniforms = { time: { value: 0 }, grow: { value: grow }, ring: { value: ring ? 1 : 0 } };
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      fog: true,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    // Share the time/grow/ring uniform objects with this pool (merge() above cloned only fog).
    Object.assign(material.uniforms, this.uniforms);
    this.mesh = new THREE.InstancedMesh(geometry, material, size);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  add(x: number, y: number, z: number, yaw: number, scale: number, colour: THREE.Color, alpha: number, life: number, delay = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.size;
    this.q.setFromAxisAngle(this.up, yaw);
    this.mesh.setMatrixAt(i, this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, 1, scale)));
    this.born.setX(i, this.uniforms.time.value + delay);
    this.life.setX(i, life);
    this.tint.setXYZW(i, colour.r, colour.g, colour.b, alpha);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born.needsUpdate = true;
    this.life.needsUpdate = true;
    this.tint.needsUpdate = true;
  }

  /** Marks still showing (for QA). */
  live(): number {
    let n = 0;
    const t = this.uniforms.time.value;
    for (let i = 0; i < this.size; i++) if (t - this.born.getX(i) < this.life.getX(i) && t >= this.born.getX(i)) n++;
    return n;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** A toy shoe print: a rounded forefoot and a heel, 0.26 m long (scaled to the walker). */
function solePrint(): THREE.BufferGeometry {
  const oval = (rx: number, rz: number, cz: number) => {
    const shape = new THREE.Shape();
    shape.absellipse(0, cz, rx, rz, 0, Math.PI * 2, false, 0);
    const g = new THREE.ShapeGeometry(shape, 8);
    g.deleteAttribute("normal");
    return g;
  };
  const sole = mergeGeometries([oval(0.05, 0.075, 0.045), oval(0.038, 0.045, -0.082)], false)!;
  // Shapes lie in XY; lay them on the ground with the toe toward +x (the way the runner faces).
  sole.rotateX(-Math.PI / 2);
  sole.rotateY(-Math.PI / 2);
  return sole;
}

function ripplePlane(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

export type PrintKind = "wet" | "milk" | "coffee" | "dirt" | "rain";
const PRINT_LOOK: Record<PrintKind, { colour: THREE.Color; alpha: number; life: number }> = {
  wet: { colour: new THREE.Color("#28394f"), alpha: 0.38, life: 3.2 },
  milk: { colour: new THREE.Color("#fffaf0"), alpha: 0.75, life: 3.2 },
  coffee: { colour: new THREE.Color("#6b3d1f"), alpha: 0.5, life: 3.2 },
  dirt: { colour: new THREE.Color("#4a301c"), alpha: 0.4, life: 2.6 },
  // A lighter sheen where a shoe pressed the water off the pavement.
  rain: { colour: new THREE.Color("#b9cde8"), alpha: 0.28, life: 1.8 },
};

export class Marks {
  readonly group = Object.assign(new THREE.Group(), { name: "marks" });
  private prints = new MarkPool(solePrint(), 48, 0, false);
  private ripples = new MarkPool(ripplePlane(), 64, 2.2, true);
  private time = 0;
  private rainClock = 0;
  private white = new THREE.Color("#ffffff");
  private water = new THREE.Color("#dff1ff");

  constructor() {
    this.group.add(this.prints.mesh, this.ripples.mesh);
  }

  /** A footprint at a foot's contact point, toe toward +x; `size` 1 = adult. */
  footprint(at: THREE.Vector3, kind: PrintKind, size: number, yaw = 0) {
    const look = PRINT_LOOK[kind];
    this.prints.add(at.x, Math.max(0, at.y) + 0.012, at.z, yaw, size, look.colour, look.alpha, look.life);
  }

  /** Rings spreading from a splash, on a surface at height `y` (a puddle's top). */
  splash(x: number, z: number, size = 1, y = 0.02) {
    for (let i = 0; i < 3; i++) this.ripples.add(x, y, z, 0, size * (0.5 + i * 0.25), this.white, 0.8 - i * 0.15, 0.7 + i * 0.15, i * 0.12);
  }

  /** Raindrops ringing on the ground around [x0, x1] x [z0, z1], `rate` per second. */
  rain(dt: number, rate: number, x0: number, x1: number, z0: number, z1: number) {
    this.rainClock += dt * rate;
    while (this.rainClock >= 1) {
      this.rainClock -= 1;
      const x = x0 + Math.random() * (x1 - x0);
      const z = z0 + Math.random() * (z1 - z0);
      this.ripples.add(x, 0.015, z, 0, 0.18 + Math.random() * 0.2, this.water, 0.45, 0.45 + Math.random() * 0.2);
    }
  }

  update(dt: number) {
    this.time += dt;
    this.prints.uniforms.time.value = this.time;
    this.ripples.uniforms.time.value = this.time;
  }

  /** Marks showing now (for QA). */
  live() {
    return { prints: this.prints.live(), ripples: this.ripples.live() };
  }

  dispose() {
    this.prints.dispose();
    this.ripples.dispose();
  }
}
