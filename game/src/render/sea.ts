import * as THREE from "three";

/** Stylised animated sea: rolling swells, a shallow-to-deep gradient, sun glitter and shore foam. */
export class Sea {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor() {
    const geometry = new THREE.PlaneGeometry(700, 380, 140, 76);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      fog: true,
      transparent: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          deep: { value: new THREE.Color("#0b6e8a") },
          shallow: { value: new THREE.Color("#1fc8d6") },
          sky: { value: new THREE.Color("#c4ecff") },
          sunColour: { value: new THREE.Color("#fff4dc") },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          shore: { value: -6 },
          storm: { value: 0 },
        },
      ]),
      vertexShader: /* glsl */ `
        uniform float time; uniform float storm;
        varying vec3 vWorld; varying vec3 vNormal;
        #include <fog_pars_vertex>
        float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + time * s); }
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          float amp = 0.18 + storm * 0.35;
          float h = amp * (wave(world.xz, vec2(0.8, 0.6), 0.35, 1.3) + 0.6 * wave(world.xz, vec2(-0.4, 0.9), 0.62, 1.9) + 0.3 * wave(world.xz, vec2(0.2, -1.0), 1.4, 2.7));
          world.y += h;
          float e = 0.25;
          float hx = amp * (wave(world.xz + vec2(e, 0.0), vec2(0.8, 0.6), 0.35, 1.3) + 0.6 * wave(world.xz + vec2(e, 0.0), vec2(-0.4, 0.9), 0.62, 1.9));
          float hz = amp * (wave(world.xz + vec2(0.0, e), vec2(0.8, 0.6), 0.35, 1.3) + 0.6 * wave(world.xz + vec2(0.0, e), vec2(-0.4, 0.9), 0.62, 1.9));
          vNormal = normalize(vec3(h - hx, e, h - hz));
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; uniform vec3 sunColour; uniform vec3 sunDir;
        uniform float time; uniform float shore; uniform float storm;
        varying vec3 vWorld; varying vec3 vNormal;
        #include <fog_pars_fragment>
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorld);
          // Calm the far water: grazing waves alias into streaks, so fade their normals out with distance.
          float far = smoothstep(35.0, 140.0, length(cameraPosition - vWorld));
          vec3 n = normalize(mix(normalize(vNormal), vec3(0.0, 1.0, 0.0), far * 0.85));
          // Distance from the shore line, whichever side of it the water is on.
          float dist = clamp(abs(shore - vWorld.z) / 45.0, 0.0, 1.0);
          vec3 col = mix(shallow, deep, smoothstep(0.0, 1.0, dist));
          float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
          col = mix(col, sky, fres * 0.55);
          vec3 h = normalize(normalize(sunDir) + viewDir);
          float glint = pow(max(dot(n, h), 0.0), 220.0) * (1.0 - far * 0.7);
          col += sunColour * glint * (1.6 - storm);
          // Foam ribbons near the shore line.
          float band = abs(shore - vWorld.z);
          float foam = smoothstep(0.55, 1.0, sin(band * 1.4 - time * 1.6 + sin(vWorld.x * 0.3) * 0.8)) * smoothstep(9.0, 0.0, band);
          col = mix(col, vec3(1.0), foam * 0.55);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    // Spans z = +70 (under the camera) to -310 so water shows both in front of a quay and behind a beach.
    this.mesh.position.set(0, -0.35, -120);
    this.mesh.receiveShadow = false;
  }

  set(options: { deep: string; shallow: string; sky: string; sun: string; sunDir: THREE.Vector3; storm: number; shore: number }) {
    const u = this.mesh.material.uniforms;
    (u.deep.value as THREE.Color).set(options.deep);
    (u.shallow.value as THREE.Color).set(options.shallow);
    (u.sky.value as THREE.Color).set(options.sky);
    (u.sunColour.value as THREE.Color).set(options.sun);
    (u.sunDir.value as THREE.Vector3).copy(options.sunDir);
    u.storm.value = options.storm;
    u.shore.value = options.shore;
  }

  update(cameraX: number, time: number) {
    // Snap to a wave period so the pattern doesn't slide with the camera.
    this.mesh.position.x = Math.round(cameraX / 20) * 20;
    this.mesh.material.uniforms.time.value = time;
  }
}
