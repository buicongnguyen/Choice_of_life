import * as THREE from "three";

/** A soft glowing strip down the lane you're in, fading out ahead of you. */
export class LaneGlow {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor() {
    const geometry = new THREE.PlaneGeometry(14, 1.75);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        uniforms: { colour: { value: new THREE.Color("#fff1c2") }, strength: { value: 0.2 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 colour; uniform float strength;
          varying vec2 vUv;
          void main() {
            // Soft sides across the lane; bright just behind the runner, fading ahead.
            float across = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
            float along = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.25, 1.0, vUv.x));
            gl_FragColor = vec4(colour, strength * across * along);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  update(x: number, z: number, y: number, visible: boolean, strength: number, colour?: string) {
    this.mesh.visible = visible;
    if (colour) (this.mesh.material.uniforms.colour.value as THREE.Color).set(colour);
    this.mesh.position.set(x + 5, y, z);
    this.mesh.material.uniforms.strength.value = strength;
  }
}
