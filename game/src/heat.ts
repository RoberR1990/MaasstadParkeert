// "Druk-kaart": the ground of every wijk tinted by how hard it is to park there (green = easy, red = searching for ages).
import * as THREE from 'three';
import { TILE_X0, TILE_X1, TILE_Z0, TILE_Z1 } from './config';
import { WIJKEN, wijkAt, type WijkId } from './wijken';

const RES = 2; // texels per world unit
const W = Math.round((TILE_X1 - TILE_X0) * RES), H = Math.round((TILE_Z1 - TILE_Z0) * RES);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const RAMP = ['#2ecb82', '#f4cf4a', '#ec4a38'].map(hex);

export class Heat {
  mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private idx: Uint8Array;
  private data: Record<string, number> = {};
  private selected: WijkId | null = null;
  private target = 0; private level = 0;
  private dirty = true;
  cfg = { green: 3, red: 10 };

  constructor(y = 0.04) {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.idx = new Uint8Array(W * H);
    const ids = WIJKEN.map((w) => w.id);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const w = wijkAt(TILE_X0 + (i + 0.5) / RES, TILE_Z0 + (j + 0.5) / RES);
      this.idx[j * W + i] = w ? ids.indexOf(w) + 1 : 0;
    }
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(TILE_X1 - TILE_X0, TILE_Z1 - TILE_Z0).rotateX(-Math.PI / 2), mat);
    this.mesh.position.set((TILE_X0 + TILE_X1) / 2, y, (TILE_Z0 + TILE_Z1) / 2);
    this.mesh.renderOrder = 3; this.mesh.visible = false;
  }

  colorFor(search: number): [number, number, number] {
    const t = Math.min(1, Math.max(0, (search - this.cfg.green) / (this.cfg.red - this.cfg.green)));
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2, a = RAMP[t < 0.5 ? 0 : 1], b = RAMP[t < 0.5 ? 1 : 2];
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  }
  /** search time (minutes) per wijk */
  setData(search: Record<string, number>) {
    if (WIJKEN.every((w) => this.data[w.id] === search[w.id])) return;
    this.data = { ...search }; this.dirty = true;
  }
  setSelected(id: WijkId | null) { if (id !== this.selected) { this.selected = id; this.dirty = true; } }
  setVisible(on: boolean) { this.target = on ? 1 : 0; }
  get visible() { return this.target > 0; }

  update(dt: number) {
    this.level += (this.target - this.level) * Math.min(1, dt * 5);
    if (Math.abs(this.target - this.level) < 0.01) this.level = this.target;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = this.level;
    this.mesh.visible = this.level > 0.01;
    if (!this.dirty || !this.mesh.visible) return;
    this.dirty = false;
    const img = this.ctx.createImageData(W, H), d = img.data;
    const cols = WIJKEN.map((w) => this.colorFor(this.data[w.id] ?? 0));
    const sel = this.selected ? WIJKEN.findIndex((w) => w.id === this.selected) + 1 : 0;
    for (let p = 0; p < W * H; p++) {
      const k = this.idx[p]; if (!k) continue;
      const c = cols[k - 1];
      d[p * 4] = c[0]; d[p * 4 + 1] = c[1]; d[p * 4 + 2] = c[2]; d[p * 4 + 3] = sel === k ? 185 : 135;
    }
    this.ctx.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
  }
}
