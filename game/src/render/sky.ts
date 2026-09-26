import * as THREE from "three";

import type { SkyId } from "../game/story/model";

export interface Mood {
  top: string;
  horizon: string;
  ground: string;
  sun: string;
  sunIntensity: number;
  /** Sun direction: elevation and azimuth in degrees (azimuth 0 = from the camera side). */
  elevation: number;
  azimuth: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  windows: number;
  lamps: number;
  clouds: string;
  cloudCover: number;
  seaDeep: string;
  seaShallow: string;
  stars: number;
  rain: number;
  /** Strength of the glossy environment reflections (the studio fill). */
  env: number;
}

const base: Mood = {
  top: "#3aa6ff",
  horizon: "#c4ecff",
  ground: "#ffe7b8",
  sun: "#fff4dc",
  sunIntensity: 2.7,
  elevation: 48,
  azimuth: -35,
  hemiSky: "#bfe4ff",
  hemiGround: "#ffcf8a",
  hemi: 1.15,
  fog: "#c4ecff",
  fogNear: 55,
  fogFar: 230,
  exposure: 0.98,
  windows: 0.05,
  lamps: 0.7,
  clouds: "#ffffff",
  cloudCover: 0.6,
  seaDeep: "#0b6e8a",
  seaShallow: "#1fc8d6",
  stars: 0,
  rain: 0,
  env: 0.55,
};

export const MOODS: Record<SkyId, Mood> = {
  morning: {
    ...base,
    top: "#58b4ff",
    horizon: "#ffe2b8",
    sun: "#ffe9c4",
    sunIntensity: 2.9,
    elevation: 26,
    azimuth: -48,
    hemiGround: "#ffc58a",
    fog: "#ffe6c4",
    windows: 0.12,
  },
  noon: { ...base },
  golden: {
    ...base,
    top: "#4a94e8",
    horizon: "#ffc98a",
    ground: "#ffcf8f",
    sun: "#ffcf96",
    sunIntensity: 3.3,
    elevation: 17,
    azimuth: -58,
    hemiSky: "#a9d4ff",
    hemiGround: "#ffb070",
    fog: "#ffd2a0",
    windows: 0.3,
    lamps: 0.9,
    clouds: "#fff0dc",
    seaDeep: "#0d6687",
    seaShallow: "#2fc0c8",
  },
  city_morning: {
    ...base,
    top: "#62b0f2",
    horizon: "#ffe8cc",
    sun: "#fff0d8",
    elevation: 30,
    azimuth: -42,
    fog: "#f4e6d6",
    fogNear: 60,
    fogFar: 260,
    windows: 0.12,
  },
  city_noon: { ...base, top: "#2d96ff", horizon: "#cfeeff", fogFar: 280, windows: 0.06 },
  storm: {
    ...base,
    top: "#16283a",
    horizon: "#3f5d6b",
    ground: "#34464d",
    sun: "#b9cfe0",
    sunIntensity: 0.9,
    elevation: 50,
    azimuth: -20,
    hemiSky: "#6d8fa6",
    hemiGround: "#3a3f4a",
    hemi: 0.95,
    fog: "#3d5561",
    fogNear: 26,
    fogFar: 140,
    exposure: 0.92,
    windows: 1.8,
    lamps: 2.4,
    clouds: "#4a6070",
    cloudCover: 1,
    seaDeep: "#123a4c",
    seaShallow: "#2a6472",
    rain: 1,
    env: 0.22,
  },
  sunset: {
    ...base,
    top: "#3f4fb0",
    horizon: "#ff9a52",
    ground: "#ffb46b",
    sun: "#ffa45c",
    sunIntensity: 2.0,
    elevation: 9,
    azimuth: -62,
    hemiSky: "#8a8cff",
    hemiGround: "#ff9a5a",
    hemi: 1.3,
    fog: "#ff9f6e",
    fogNear: 60,
    fogFar: 260,
    exposure: 1.0,
    windows: 1.4,
    lamps: 2.6,
    clouds: "#ffc9a0",
    cloudCover: 0.5,
    seaDeep: "#27477a",
    seaShallow: "#e0875a",
    env: 0.35,
  },
  dusk: {
    ...base,
    top: "#1a2566",
    horizon: "#ff9d52",
    ground: "#c77a4a",
    sun: "#ffb26b",
    sunIntensity: 1.9,
    elevation: 6,
    azimuth: -65,
    hemiSky: "#7a8cf0",
    hemiGround: "#d9865a",
    hemi: 1.15,
    fog: "#e0885c",
    fogNear: 80,
    fogFar: 330,
    exposure: 1.02,
    windows: 1.5,
    lamps: 2.6,
    clouds: "#ffb487",
    cloudCover: 0.4,
    seaDeep: "#1d3a7a",
    seaShallow: "#d9895a",
    stars: 0.6,
    env: 0.3,
  },
};

export function sunDirection(m: Mood): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(m.elevation);
  const az = THREE.MathUtils.degToRad(m.azimuth);
  // Light comes from the camera side (+Z), from the left (-X), so building fronts are lit.
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

/** Gradient dome, sun glow, stars and a drifting cloud field that follow the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private clouds = new THREE.Group();
  private cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0, flatShading: false });
  private cloudOffsets: number[] = [];

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          ground: { value: new THREE.Color() },
          sunColour: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          stars: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColour; uniform vec3 sunDir;
          uniform float stars;
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main() {
            float h = vDir.y;
            vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.62, h), 0.8)) : mix(horizon, ground, smoothstep(0.0, -0.25, h));
            float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
            col += sunColour * (pow(sd, 900.0) * 1.6 + pow(sd, 18.0) * 0.28 + pow(sd, 4.0) * 0.08);
            if (stars > 0.0 && h > 0.08) {
              vec3 cell = floor(vDir * 220.0);
              float s = step(0.9965, hash(cell)) * smoothstep(0.08, 0.5, h);
              col += vec3(s) * stars;
            }
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.buildClouds();
    this.group.add(this.clouds);
  }

  private buildClouds() {
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const n = 4 + (i % 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, this.cloudMat);
        const r = 3 + ((i * 7 + k * 13) % 5);
        m.scale.set(r * 1.3, r * 0.85, r);
        m.position.set((k - n / 2) * r * 1.1, Math.sin(k * 1.7) * r * 0.35, Math.cos(k * 2.1) * r * 0.4);
        cloud.add(m);
      }
      cloud.position.set(i * 38 - 300, 34 + ((i * 17) % 22), -150 - ((i * 29) % 90));
      this.cloudOffsets.push(cloud.position.x);
      this.clouds.add(cloud);
    }
  }

  apply(m: Mood) {
    const u = this.dome.material.uniforms;
    (u.top.value as THREE.Color).set(m.top);
    (u.horizon.value as THREE.Color).set(m.horizon);
    (u.ground.value as THREE.Color).set(m.ground);
    (u.sunColour.value as THREE.Color).set(m.sun);
    (u.sunDir.value as THREE.Vector3).copy(sunDirection(m));
    u.stars.value = m.stars;
    this.cloudMat.color.set(m.clouds);
    // Clouds glow with the sky's own light so they never read as dark smudges.
    this.cloudMat.emissive.set(m.clouds).multiplyScalar(0.6);
    this.clouds.children.forEach((c, i) => (c.visible = i / this.clouds.children.length < m.cloudCover));
  }

  update(cameraX: number, time: number) {
    this.dome.position.x = cameraX;
    // Clouds drift and wrap around the camera.
    this.clouds.children.forEach((c, i) => {
      const span = 640;
      const x = this.cloudOffsets[i] + time * 1.2;
      c.position.x = cameraX + ((((x - cameraX * 0.6) % span) + span) % span) - span / 2;
    });
  }
}
