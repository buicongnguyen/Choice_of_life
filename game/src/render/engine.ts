import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { SkyId } from "../game/story/model";
import { glowMaterials } from "./assets";
import { Sea } from "./sea";
import { MOODS, Sky, sunDirection, type Mood } from "./sky";

export interface EngineOptions {
  quality: "high" | "low";
}

/** Renderer, scene, lights, sky, sea and post-processing; knows nothing about the story. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.3, 1400);
  readonly sun = new THREE.DirectionalLight("#fff4dc", 3);
  readonly hemi = new THREE.HemisphereLight("#bfe4ff", "#ffcf8a", 1.1);
  readonly sky = new Sky();
  readonly sea = new Sea();
  mood: Mood = MOODS.noon;
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private passes: { dispose(): void }[] = [];
  /** Skips lightning flashes. */
  reducedMotion = false;
  private shadowTarget = new THREE.Vector3();
  time = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private options: EngineOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.quality === "high" ? 2 : 1.25));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(options.quality === "high" ? 2048 : 1024, options.quality === "high" ? 2048 : 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -26;
    cam.right = 26;
    cam.top = 18;
    cam.bottom = -18;
    cam.near = 1;
    cam.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.sky.group, this.sea.mesh);
    this.scene.fog = new THREE.Fog("#c4ecff", 55, 230);

    if (options.quality === "high") this.setupPost();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer);
    const render = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.24, 0.45, 2.1);
    const output = new OutputPass();
    this.composer.addPass(render);
    this.composer.addPass(this.bloom);
    this.composer.addPass(output);
    this.passes = [render, this.bloom, output];
  }

  setQuality(quality: "high" | "low") {
    if (quality === this.options.quality) return;
    this.options.quality = quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.25));
    if (quality === "high" && !this.composer) this.setupPost();
    if (quality === "low") {
      // EffectComposer.dispose() frees only its own targets; the passes hold the bloom targets.
      for (const pass of this.passes) pass.dispose();
      this.passes = [];
      this.composer?.dispose();
      this.composer = undefined;
      this.bloom = undefined;
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the lanes framed on tall phone screens by widening the view.
    this.camera.fov = w / h < 1 ? 58 : w / h < 1.4 ? 46 : 40;
    this.camera.updateProjectionMatrix();
  }

  setMood(id: SkyId | Mood) {
    const m = typeof id === "string" ? MOODS[id] : id;
    this.mood = m;
    this.sun.color.set(m.sun);
    this.sun.intensity = m.sunIntensity;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGround);
    this.hemi.intensity = m.hemi;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(m.fog);
    fog.near = m.fogNear;
    fog.far = m.fogFar;
    this.renderer.toneMappingExposure = m.exposure;
    this.scene.environmentIntensity = m.env;
    this.sky.apply(m);
    this.sea.set({ deep: m.seaDeep, shallow: m.seaShallow, sky: m.horizon, sun: m.sun, sunDir: sunDirection(m), storm: m.rain, shore: this.sea.mesh.material.uniforms.shore.value });
    for (const w of glowMaterials.windows) w.emissiveIntensity = m.windows;
    for (const l of glowMaterials.lamps) l.emissiveIntensity = m.lamps;
  }

  /** Re-applies glow levels to materials loaded after the mood was set. */
  refreshGlow() {
    for (const w of glowMaterials.windows) w.emissiveIntensity = this.mood.windows;
    for (const l of glowMaterials.lamps) l.emissiveIntensity = this.mood.lamps;
  }

  /** Keeps the sun's shadow box centred on the action. */
  followShadows(target: THREE.Vector3) {
    this.shadowTarget.copy(target);
    const dir = sunDirection(this.mood);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(dir, 60);
    // Snap to shadow texels to stop shimmering while the camera moves.
    const texel = 52 / this.sun.shadow.mapSize.x;
    this.sun.position.x = Math.round(this.sun.position.x / texel) * texel;
    this.sun.target.position.x = Math.round(this.sun.target.position.x / texel) * texel;
  }

  private lightning = 0;
  private nextBolt = 6;
  /** Called when lightning strikes (for thunder). */
  onLightning?: () => void;

  render(dt: number) {
    this.time += dt;
    // Storms flash now and then; the hemisphere light carries the flash.
    if (this.mood.rain > 0 && dt > 0 && !this.reducedMotion) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.lightning = 0.35;
        this.nextBolt = 7 + Math.random() * 9;
        this.onLightning?.();
      }
    }
    if (this.lightning > 0) {
      this.lightning = Math.max(0, this.lightning - dt);
      const flicker = this.lightning > 0.22 || (this.lightning > 0.08 && this.lightning < 0.14) ? 1 : 0;
      this.hemi.intensity = this.mood.hemi + flicker * 3.5;
    } else if (this.hemi.intensity !== this.mood.hemi) {
      this.hemi.intensity = this.mood.hemi;
    }
    this.sky.update(this.camera.position.x, this.time);
    this.sea.update(this.camera.position.x, this.time);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
