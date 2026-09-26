import * as THREE from "three";

/** A floating speech-bubble tag ("! Juno") above someone waiting for you ahead. */
export function nameBubble(text: string): THREE.Sprite {
  const scale = 2;
  const font = `700 ${30 * scale}px Fredoka, Nunito, system-ui, sans-serif`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const label = `! ${text}`;
  const width = Math.ceil(probe.measureText(label).width) + 44 * scale;
  const height = 64 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height + 14 * scale;
  const g = canvas.getContext("2d")!;
  const r = height / 2;
  g.fillStyle = "rgba(42,31,61,0.25)";
  g.beginPath();
  g.roundRect(4 * scale, 6 * scale, width - 8 * scale, height - 4 * scale, r);
  g.fill();
  g.fillStyle = "#fffdf6";
  g.beginPath();
  g.roundRect(2 * scale, 2 * scale, width - 8 * scale, height - 8 * scale, r);
  g.fill();
  // Little tail pointing down at the person.
  g.beginPath();
  g.moveTo(width / 2 - 10 * scale, height - 7 * scale);
  g.lineTo(width / 2, height + 10 * scale);
  g.lineTo(width / 2 + 10 * scale, height - 7 * scale);
  g.fill();
  g.font = font;
  g.textBaseline = "middle";
  g.fillStyle = "#ff6b4a";
  g.fillText("!", 18 * scale, height / 2 - 2 * scale);
  g.fillStyle = "#2a1f3d";
  g.fillText(text, 18 * scale + probe.measureText("! ").width, height / 2 - 2 * scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  const worldHeight = 1.05;
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function disposeSprite(sprite: THREE.Sprite) {
  sprite.removeFromParent();
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
