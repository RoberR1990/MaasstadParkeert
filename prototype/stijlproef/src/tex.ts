// Canvas-generated textures (no external assets).
import * as THREE from 'three';
import { mulberry32 } from './util';

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const { c, g } = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function puffTexture() {
  const { c, g } = canvas(128);
  const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,250,240,0.95)');
  gr.addColorStop(0.55, 'rgba(255,246,232,0.55)');
  gr.addColorStop(1, 'rgba(255,246,232,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** Subtle speckled noise for asphalt / grass. Neutral grey base so it multiplies colours. */
export function noiseTexture(seed = 3, contrast = 0.12, size = 256) {
  const r = mulberry32(seed);
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 255 * (1 - contrast + r() * contrast * 1.4);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // soft blotches
  for (let i = 0; i < 60; i++) {
    const x = r() * size, y = r() * size, rad = 10 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    gr.addColorStop(0, a); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function bubbleTexture(symbol: string, bg = '#fff8ea', fg = '#d9674f') {
  const { c, g } = canvas(128);
  g.shadowColor = 'rgba(20,30,45,0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  g.fillStyle = bg;
  g.beginPath(); g.arc(64, 56, 40, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(50, 90); g.lineTo(64, 112); g.lineTo(78, 90); g.closePath(); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = fg;
  g.font = '900 62px "Fredoka Variable", "Nunito Variable", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(symbol, 64, 60);
  return tex(c);
}

export function signTexture(letter = 'P', bg = '#2f6f7e', fg = '#fff6e4') {
  const { c, g } = canvas(128);
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(6, 6, 116, 116, 26); g.fill();
  g.lineWidth = 5; g.strokeStyle = fg; g.beginPath(); g.roundRect(14, 14, 100, 100, 20); g.stroke();
  g.fillStyle = fg;
  g.font = '700 84px "Fredoka Variable", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  return tex(c);
}

/** Meter screen texture. */
export function screenTexture() {
  const { c, g } = canvas(64);
  g.fillStyle = '#ffe9b8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3b4a58'; g.font = '700 30px "Fredoka Variable", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('€', 32, 34);
  return tex(c);
}

export function streakTexture() {
  const { c, g } = canvas(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(28, 0, 8, 256);
  return tex(c);
}

/** Wake: white wedge fading out along its length. */
export function wakeTexture() {
  const { c, g } = canvas(256, 64);
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(255,255,255,0.8)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(256, 4); g.lineTo(256, 60); g.closePath(); g.fill();
  return tex(c);
}
