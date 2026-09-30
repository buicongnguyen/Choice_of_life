import * as THREE from "three";

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  colour: THREE.Color;
  gravity: number;
  spin: number;
}

function softDot(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pooled billboard particles (bursts, dust, confetti, sparkles). */
export class Particles {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colours: Float32Array;
  private sizes: Float32Array;
  private next = 0;

  constructor(readonly capacity = 900) {
    this.positions = new Float32Array(capacity * 3);
    this.colours = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.particles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 1, age: 0, size: 0.2, colour: new THREE.Color(), gravity: 0, spin: 0 });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("colour", new THREE.BufferAttribute(this.colours, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: softDot() }, scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 colour; attribute float size; varying vec3 vColour;
        uniform float scale;
        void main() {
          vColour = colour;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec3 vColour;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColour * t.rgb, t.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(at: THREE.Vector3, options: { count: number; colour: string | string[]; speed: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number }) {
    const colours = Array.isArray(options.colour) ? options.colour : [options.colour];
    for (let k = 0; k < options.count; k++) {
      const p = this.particles[this.next];
      this.next = (this.next + 1) % this.capacity;
      p.alive = true;
      p.age = 0;
      p.life = (options.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      p.size = (options.size ?? 0.35) * (0.6 + Math.random() * 0.8);
      p.gravity = options.gravity ?? 6;
      p.colour.set(colours[k % colours.length]);
      const spread = options.spread ?? 0.2;
      p.pos.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + (options.up ?? 0.5), Math.random() - 0.5).normalize();
      p.vel.copy(dir).multiplyScalar(options.speed * (0.5 + Math.random()));
    }
  }

  /** `viewportHeight` in device pixels keeps particle size consistent across screens. */
  update(dt: number, viewportHeight = 720) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = viewportHeight * 0.83;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
        p.vel.y -= p.gravity * dt;
        p.vel.multiplyScalar(1 - Math.min(1, dt * 1.5));
        p.pos.addScaledVector(p.vel, dt);
      }
      const k = p.alive ? 1 - p.age / p.life : 0;
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colours[i * 3] = p.colour.r * k;
      this.colours[i * 3 + 1] = p.colour.g * k;
      this.colours[i * 3 + 2] = p.colour.b * k;
      this.sizes[i] = p.alive ? p.size * (0.5 + k * 0.5) : 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.colour.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

/** Rain streaks that follow the camera (storm chapter). */
export class Rain {
  readonly lines: THREE.LineSegments;
  private drops: Float32Array;
  private count = 1400;
  /** Drops live in world space around this point, so the world runs past them at its own speed. */
  private centre = new THREE.Vector3();
  intensity = 0;

  constructor() {
    this.drops = new Float32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) this.reset(i, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.drops, 3));
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: "#cfe6f2", transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
  }

  private static readonly SPAN = 46;

  private reset(i: number, anywhere = false) {
    // Around the action and biased away from the camera (+z), so the drops are in view.
    const x = this.centre.x + (Math.random() - 0.35) * Rain.SPAN;
    const y = anywhere ? Math.random() * 16 : 16;
    const z = this.centre.z - 16 + Math.random() * 22;
    this.drops.set([x, y, z, x - 0.12, y - 0.7, z], i * 6);
  }

  update(dt: number, centre: THREE.Vector3) {
    this.lines.visible = this.intensity > 0.01;
    if (!this.lines.visible) return;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.45 * this.intensity;
    this.centre.copy(centre);
    const lo = centre.x - Rain.SPAN * 0.35;
    const hi = lo + Rain.SPAN;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const fall = 22 * dt;
      this.drops[o + 1] -= fall;
      this.drops[o + 4] -= fall;
      this.drops[o] -= fall * 0.17;
      this.drops[o + 3] -= fall * 0.17;
      if (this.drops[o + 4] < 0) this.reset(i);
      else if (this.drops[o] < lo || this.drops[o] > hi) {
        // Wrap drops the runner has passed round to the front, keeping their height.
        const shift = -Math.floor((this.drops[o] - lo) / Rain.SPAN) * Rain.SPAN;
        this.drops[o] += shift;
        this.drops[o + 3] += shift;
      }
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

export const SCORE_COLOURS = { health: "#ff5a6e", happiness: "#ffd23f", money: "#3ddc97" } as const;
