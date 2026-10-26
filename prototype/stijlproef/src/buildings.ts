// Filler architecture: brick rowhouses with gables, white modernist slabs, glass towers, parks.
// Every house is built in local coordinates (front = +z, base on y = 0) and placed with GeoBuilder.local().
import * as THREE from 'three';
import { FAC, FlatBuilder, GeoBuilder } from './geo';
import * as PAL from './palette';
import { Rng, pick, range } from './util';
import type { Cell } from './map';
import { INS } from './map';

export interface TreeSpec { x: number; z: number; s: number; kind: number; y: number }
export type Rect = [number, number, number, number]; // x0 z0 x1 z1

export const FH = 1.15; // storey height
const col = (c: string) => new THREE.Color(c);
const mix = (a: string, b: string, t: number) => col(a).lerp(col(b), t);

export class Town {
  gb = new GeoBuilder();
  flat = new FlatBuilder(); // lawns, courtyards, pavements (above the ground slab)
  trees: TreeSpec[] = [];
  excl: Rect[] = [];
  /** number of houses, towers (for stats / debugging) */
  count = 0;
  constructor(public rng: Rng) {}

  tree(x: number, z: number, s = 1, kind = 0, y = 0) {
    if (this.blocked(x, z, 0.5)) return;
    this.trees.push({ x, z, s: s * range(this.rng, 0.85, 1.15), kind, y });
  }
  blocked(x: number, z: number, pad = 0) {
    for (const r of this.excl) if (x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad) return true;
    return false;
  }
  blockedRect(x0: number, z0: number, x1: number, z1: number) {
    for (const r of this.excl) if (x1 > r[0] && x0 < r[2] && z1 > r[1] && z0 < r[3]) return true;
    return false;
  }

  // ------------------------------------------------------------ one rowhouse, local coords
  house(o: { w: number; d: number; floors: number; wall?: string; roof?: 'eave' | 'front' | 'step' | 'flat' | 'auto'; shop?: boolean; tall?: boolean }) {
    const { rng, gb } = this;
    const { w, d, floors } = o;
    const wall = o.wall ?? pick(rng, rng() < 0.72 ? PAL.BRICK : rng() < 0.5 ? PAL.YELLOW_BRICK : PAL.PLASTER);
    const h = floors * FH + 0.3;
    const sx = o.tall ? 1.6 : 1.45;
    gb.box(w, h, d, 0, 0, 0, wall, { ao: 0.74, aoH: Math.min(3, h), fac: { p: o.shop ? FAC.punched : FAC.punched, sx, sy: FH, lit: 0.55 } });
    // plinth + string course
    const plinth = mix(wall, '#3a3430', 0.38);
    gb.box(w + 0.06, 0.45, d + 0.06, 0, 0, 0, plinth, { ao: 1 });
    gb.box(w + 0.08, 0.1, d + 0.08, 0, 0.3 + FH, 0, mix(wall, '#f2e8d2', 0.55), { ao: 1 });
    if (o.shop) {
      // awning + shop window band on the ground floor (front)
      const ac = pick(rng, PAL.AWNING);
      const n = Math.max(2, Math.round(w / 0.9));
      for (let k = 0; k < n; k++) {
        const sw = (w - 0.1) / n;
        const g = new THREE.BoxGeometry(sw, 0.06, 0.7);
        const m = new THREE.Matrix4().makeRotationX(0.42);
        m.setPosition(-w / 2 + 0.05 + sw * (k + 0.5), 1.35, d / 2 + 0.3);
        gb.add(g, k % 2 ? '#f1e8d6' : ac, m, { ao: 1 });
      }
    }
    let rk = o.roof ?? 'auto';
    if (rk === 'auto') { const r = rng(); rk = r < 0.34 ? 'eave' : r < 0.58 ? 'front' : r < 0.72 ? 'step' : 'flat'; }
    const tile = pick(rng, rng() < 0.6 ? PAL.ROOF_TILE : PAL.ROOF_SLATE);
    if (rk === 'eave') {
      const rh = Math.min(d * 0.34, 1.7);
      gb.gable(w + 0.16, rh, d + 0.5, 0, h - 0.02, 0, tile, true);
      gb.box(w + 0.16, 0.12, d + 0.5, 0, h - 0.1, 0, mix(wall, '#fff4dd', 0.5), { ao: 1 });
      if (rng() < 0.55) gb.box(0.4, 0.9, 0.4, range(rng, -w / 3, w / 3), h + rh * 0.35, -d * 0.12, mix(PAL.BRICK[0], '#000', 0.2), { ao: 1 });
      if (w > 3 && rng() < 0.55) { // dormer
        const dx = range(rng, -w / 4, w / 4);
        gb.box(0.95, 0.75, 0.7, dx, h + rh * 0.25, d * 0.2, mix(wall, '#fff', 0.2), { ao: 1 });
        gb.gable(0.95, 0.5, 0.7, dx, h + rh * 0.25 + 0.75, d * 0.2, tile, false);
        gb.box(0.5, 0.42, 0.04, dx, h + rh * 0.25 + 0.15, d * 0.2 + 0.36, '#3c4a58', { ao: 1 });
      }
    } else if (rk === 'front') {
      const rh = w * 0.62;
      gb.gable(w + 0.1, rh, d + 0.3, 0, h - 0.02, 0, tile, false);
      gb.gable(w, rh - 0.02, 0.18, 0, h - 0.02, d / 2 + 0.02, wall, false, { ao: 1 });
      gb.gable(w + 0.2, 0.1 + rh, 0.06, 0, h - 0.05, d / 2 + 0.14, mix(wall, '#fff4dd', 0.6), false, { ao: 1 });
      // attic window + hoist beam
      gb.box(0.4, 0.5, 0.05, 0, h + rh * 0.2, d / 2 + 0.16, '#3c4a58', { ao: 1 });
      gb.box(0.08, 0.08, 0.6, 0, h + rh * 0.78, d / 2 + 0.3, '#4a3b30', { ao: 1 });
    } else if (rk === 'step') {
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        const sw = w * (1 - k * 0.27);
        gb.box(sw, 0.62, 0.22, 0, h - 0.02 + k * 0.62, d / 2 - 0.08, wall, { ao: 1 });
        gb.box(sw + 0.1, 0.06, 0.3, 0, h - 0.02 + (k + 1) * 0.62 - 0.04, d / 2 - 0.08, mix(wall, '#fff4dd', 0.6), { ao: 1 });
      }
      gb.gable(w - 0.2, 0.9, d, 0, h - 0.02, -0.05, tile, false);
      gb.box(0.07, 0.07, 0.07, 0, h + steps * 0.62 + 0.06, d / 2 - 0.08, '#3c3a38', { ao: 1 });
    } else {
      const rc = pick(rng, PAL.ROOF_FLAT);
      gb.box(w + 0.1, 0.1, d + 0.1, 0, h - 0.02, 0, mix(wall, '#fff4dd', 0.35), { ao: 1 });
      gb.box(w - 0.1, 0.04, d - 0.1, 0, h + 0.06, 0, rc, { ao: 1 });
      const pc = mix(wall, '#fff4dd', 0.15);
      gb.box(w + 0.1, 0.22, 0.08, 0, h + 0.06, d / 2 + 0.02, pc, { ao: 1 });
      gb.box(w + 0.1, 0.22, 0.08, 0, h + 0.06, -d / 2 - 0.02, pc, { ao: 1 });
      gb.box(0.08, 0.22, d, w / 2 + 0.02, h + 0.06, 0, pc, { ao: 1 });
      gb.box(0.08, 0.22, d, -w / 2 - 0.02, h + 0.06, 0, pc, { ao: 1 });
      if (rng() < 0.6) gb.box(0.7, 0.5, 0.7, range(rng, -w / 4, w / 4), h + 0.08, range(rng, -d / 4, d / 4), pick(rng, PAL.CONCRETE), { ao: 0.9 });
      if (rng() < 0.3) gb.box(w * 0.6, 0.05, d * 0.5, 0, h + 0.08, 0, '#8fb05f', { ao: 1 }); // green roof
    }
    // front step
    gb.box(1.0, 0.18, 0.35, 0, 0, d / 2 + 0.17, '#cfc8b8', { ao: 1 });
    this.count++;
  }

  /** A straight run of rowhouses along a street, front facing `face` (0=+z 1=+x 2=-z 3=-x). */
  run(x0: number, z0: number, x1: number, z1: number, face: number, depth: number, base: number, o: { shops?: number; style?: 'old' | 'mix' } = {}) {
    const { rng } = this;
    const horiz = face === 0 || face === 2;
    const len = horiz ? x1 - x0 : z1 - z0;
    let a = 0;
    let floors = base;
    const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][face];
    while (a < len - 1.6) {
      let w = range(rng, 2.9, 4.4);
      if (len - a - w < 2.4) w = len - a;
      const cx = horiz ? x0 + a + w / 2 : (face === 1 ? x1 - depth / 2 : x0 + depth / 2);
      const cz = horiz ? (face === 0 ? z1 - depth / 2 : z0 + depth / 2) : z0 + a + w / 2;
      if (rng() < 0.3) floors = Math.max(2, Math.min(base + 1, floors + (rng() < 0.5 ? -1 : 1)));
      const hx0 = horiz ? cx - w / 2 : cx - depth / 2, hx1 = horiz ? cx + w / 2 : cx + depth / 2;
      const hz0 = horiz ? cz - depth / 2 : cz - w / 2, hz1 = horiz ? cz + depth / 2 : cz + w / 2;
      if (!this.blockedRect(hx0, hz0, hx1, hz1)) {
        const shop = rng() < (o.shops ?? 0);
        this.gb.local(cx, 0, cz, rot, () => this.house({ w, d: depth, floors: floors + (shop ? 0 : 0), shop }));
      }
      a += w;
    }
  }

  // ------------------------------------------------------------ cell fillers
  private inner(c: Cell): Rect {
    const i = c.inset ?? [INS, INS, INS, INS];
    return [c.x0 + i[0], c.z0 + i[2], c.x1 - i[1], c.z1 - i[3]];
  }

  fill(c: Cell) {
    switch (c.type) {
      case 'rows': this.perimeter(c, 0.1); break;
      case 'courts': this.perimeter(c, 0.05, true); break;
      case 'slab': this.slabs(c); break;
      case 'modern': this.modern(c); break;
      case 'towers': this.towerBlock(c); break;
      case 'park': this.park(c); break;
      default: break;
    }
  }

  /** Perimeter block of rowhouses with a green courtyard. */
  perimeter(c: Cell, shops: number, bigCourt = false) {
    const { rng } = this;
    const [x0, z0, x1, z1] = this.inner(c);
    const dp = bigCourt ? 3.8 : 4.4;
    const base = Math.round(range(rng, 3, 5));
    const wide = x1 - x0, tall = z1 - z0;
    if (wide < 8 || tall < 3) return;
    if (tall < 12 || wide < 12) {
      // thin block: back-to-back rows facing both streets
      if (tall >= 6.4) {
        const d2 = Math.min(4.4, tall / 2);
        this.run(x0, z0, x1, z0 + d2, 2, d2, base, { shops });
        this.run(x0, z1 - d2, x1, z1, 0, d2, base, { shops });
      } else this.run(x0, z1 - Math.min(tall, 4.4), x1, z1, 0, Math.min(tall, 4.4), base, { shops });
      this.streetTrees(c);
      return;
    }
    this.run(x0, z0, x1, z0 + dp, 2, dp, base, { shops });
    this.run(x0, z1 - dp, x1, z1, 0, dp, base, { shops });
    this.run(x0, z0 + dp, x0 + dp, z1 - dp, 3, dp, base, { shops: 0 });
    this.run(x1 - dp, z0 + dp, x1, z1 - dp, 1, dp, base, { shops: 0 });
    // courtyard
    const cx0 = x0 + dp + 0.4, cz0 = z0 + dp + 0.4, cx1 = x1 - dp - 0.4, cz1 = z1 - dp - 0.4;
    if (cx1 - cx0 > 1 && cz1 - cz0 > 1) {
      this.flat.rect(cx0, cz0, cx1, cz1, 0.035, pick(rng, ['#9db86c', '#a3bb73', '#93b062']));
      const n = Math.round(((cx1 - cx0) * (cz1 - cz0)) / 26);
      for (let i = 0; i < n; i++) this.tree(range(rng, cx0 + 0.8, cx1 - 0.8), range(rng, cz0 + 0.8, cz1 - 0.8), range(rng, 0.7, 1.1), 0);
      for (let i = 0; i < 2; i++) this.gb.box(1.4, 0.8, 1.0, range(rng, cx0 + 1, cx1 - 1), 0, range(rng, cz0 + 1, cz1 - 1), pick(rng, PAL.CONCRETE), { ao: 0.9 });
    }
    this.streetTrees(c);
  }

  streetTrees(c: Cell) {
    const { rng } = this;
    const i = c.inset ?? [INS, INS, INS, INS];
    const step = 6.2;
    for (let x = c.x0 + 4; x < c.x1 - 3; x += step) {
      if (rng() < 0.8) this.tree(x + range(rng, -0.4, 0.4), c.z0 + i[2] - 1.35, 0.8, 1);
      if (rng() < 0.8) this.tree(x + range(rng, -0.4, 0.4), c.z1 - i[3] + 1.35, 0.8, 1);
    }
    for (let z = c.z0 + 4; z < c.z1 - 3; z += step) {
      if (rng() < 0.7) this.tree(c.x0 + i[0] - 1.35, z + range(rng, -0.4, 0.4), 0.8, 1);
      if (rng() < 0.7) this.tree(c.x1 - i[1] + 1.35, z + range(rng, -0.4, 0.4), 0.8, 1);
    }
  }

  /** White post-war slabs standing in greenery (very Rotterdam). */
  slabs(c: Cell) {
    const { rng, gb } = this;
    const [x0, z0, x1, z1] = this.inner(c);
    const alongX = x1 - x0 >= z1 - z0;
    const L = alongX ? x1 - x0 : z1 - z0;
    const T = alongX ? z1 - z0 : x1 - x0;
    const dep = 5.2, gap = 6.2;
    const n = Math.max(1, Math.min(3, Math.floor((T + gap) / (dep + gap))));
    const total = n * dep + (n - 1) * gap;
    const off = (T - total) / 2;
    // lawn for the whole block
    this.flat.rect(x0, z0, x1, z1, 0.035, '#a3bb73');
    const wall = pick(rng, [...PAL.WHITE, ...PAL.PLASTER, ...PAL.YELLOW_BRICK]);
    for (let k = 0; k < n; k++) {
      const len = Math.min(L - 1, range(rng, 16, 23));
      const floors = Math.round(range(rng, 5, 8));
      const a0 = (L - len) / 2 + range(rng, -1.5, 1.5);
      const pos = off + dep / 2 + k * (dep + gap);
      const cx = alongX ? x0 + a0 + len / 2 : x0 + pos;
      const cz = alongX ? z0 + pos : z0 + a0 + len / 2;
      if (this.blockedRect(alongX ? cx - len / 2 : cx - dep / 2, alongX ? cz - dep / 2 : cz - len / 2, alongX ? cx + len / 2 : cx + dep / 2, alongX ? cz + dep / 2 : cz + len / 2)) continue;
      const h = floors * FH + 0.3;
      gb.local(cx, 0, cz, alongX ? 0 : Math.PI / 2, () => {
        gb.box(len, h, dep, 0, 0, 0, wall, { ao: 0.78, aoH: 3, fac: { p: FAC.ribbon, sx: 2.3, sy: FH, lit: 0.5 } });
        gb.box(len + 0.1, 0.5, dep + 0.1, 0, 0, 0, mix(wall, '#555', 0.35), { ao: 1 });
        // balcony slabs on the sunny side
        for (let f = 1; f < floors; f += 1) gb.box(len - 0.4, 0.07, 0.55, 0, 0.3 + f * FH - 0.04, dep / 2 + 0.28, '#f3efe6', { ao: 1 });
        // roof, plant room, stair cores
        gb.box(len + 0.3, 0.14, dep + 0.3, 0, h - 0.02, 0, mix(wall, '#fff', 0.4), { ao: 1 });
        gb.box(len * 0.25, 1.0, dep * 0.6, range(rng, -len / 4, len / 4), h + 0.1, 0, pick(rng, PAL.CONCRETE), { ao: 0.9 });
        for (let s = 0; s < 3; s++) gb.box(1.6, 0.8, 1.4, -len / 2 + (s + 0.5) * (len / 3), h + 0.1, -dep / 2 + 1.0, mix(wall, '#bbb', 0.3), { ao: 1 });
        // brick end walls
        gb.box(0.12, h - 0.2, dep - 0.2, len / 2 + 0.06, 0.1, 0, mix(PAL.BRICK[0], '#fff', 0.1), { ao: 0.8 });
        gb.box(0.12, h - 0.2, dep - 0.2, -len / 2 - 0.06, 0.1, 0, mix(PAL.BRICK[0], '#fff', 0.1), { ao: 0.8 });
      });
      // trees between slabs
      for (let t = 0; t < 4; t++) this.tree(range(rng, x0 + 1, x1 - 1), range(rng, z0 + 1, z1 - 1), range(rng, 0.8, 1.3), 0);
    }
    this.streetTrees(c);
  }

  /** A glass tower: podium + shaft + crown. Local coords. */
  tower(w: number, d: number, floors: number, glass?: string) {
    const { rng, gb } = this;
    const g = glass ?? pick(rng, PAL.GLASS_BODY);
    const fh = 1.1;
    const h = floors * fh;
    const pod = 3 * fh;
    gb.box(w + 2.2, pod, d + 2.2, 0, 0, 0, mix(g, '#e8e8e8', 0.45), { ao: 0.8, aoH: 3, fac: { p: FAC.curtain, sx: 1.7, sy: fh, lit: 0.5 } });
    gb.box(w + 2.3, 0.2, d + 2.3, 0, pod, 0, '#dcdcd6', { ao: 1 });
    gb.box(w, h, d, 0, pod, 0, g, { ao: 0.78, aoH: 6, fac: { p: FAC.curtain, sx: 1.5, sy: fh, lit: 0.6 } });
    // setback crown + mast
    gb.box(w * 0.7, 2.4, d * 0.7, 0, pod + h, 0, mix(g, '#fff', 0.15), { ao: 0.9 });
    gb.box(w * 0.74, 0.16, d * 0.74, 0, pod + h + 2.4, 0, '#e9e4d8', { ao: 1 });
    gb.cyl(0.05, 0.1, 4, w * 0.15, pod + h + 2.5, -d * 0.1, '#d8d6d0', 5, { ao: 1 });
    gb.box(1.1, 0.5, 1.1, -w * 0.15, pod + h + 2.56, d * 0.12, '#bfbdb6', { ao: 1 });
    this.count++;
    return pod + h + 6.5;
  }

  towerBlock(c: Cell) {
    const { rng, gb } = this;
    const [x0, z0, x1, z1] = this.inner(c);
    this.flat.rect(x0, z0, x1, z1, 0.04, '#e1d8c6');
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const spots: [number, number][] = [[x0 + 5.5, z0 + 5.5], [x1 - 5.5, z1 - 5.5], [x1 - 5.5, z0 + 5.5]];
    spots.forEach(([sx, sz], i) => {
      const fl = Math.round(range(rng, 11, 17) - i * 2);
      gb.local(sx, 0, sz, 0, () => this.tower(5.4 + (i % 2), 5.2, fl));
    });
    // little plaza with trees in the 4th corner
    for (let i = 0; i < 7; i++) this.tree(x0 + 4 + rng() * 6, z1 - 3 - rng() * 5, range(rng, 0.8, 1.2), 0);
    gb.box(3, 0.4, 1.2, mx - 4, 0, mz + 3, '#c6bfae', { ao: 1 });
    this.streetTrees(c);
  }

  /** mixed contemporary block: office, white apartments, rows */
  modern(c: Cell) {
    const { rng, gb } = this;
    const [x0, z0, x1, z1] = this.inner(c);
    const w = x1 - x0, d = z1 - z0;
    if (d < 11) { this.slabs(c); return; }
    if (w < 9) return;
    this.flat.rect(x0, z0, x1, z1, 0.036, '#e3dac8');
    const half = d / 2;
    // north half: apartments (white, balconies)
    const aptFloors = Math.round(range(rng, 6, 9));
    const aw = Math.min(w - 2, range(rng, 13, 18));
    const ax = x0 + range(rng, 0, w - aw) + aw / 2;
    const az = z0 + 3.2;
    const wall = pick(rng, PAL.WHITE);
    if (!this.blockedRect(ax - aw / 2, az - 3.2, ax + aw / 2, az + 3.2)) {
      gb.local(ax, 0, az, Math.PI, () => {
        const h = aptFloors * FH + 0.3;
        gb.box(aw, h, 6, 0, 0, 0, wall, { ao: 0.8, aoH: 3, fac: { p: FAC.ribbon, sx: 2.2, sy: FH, lit: 0.5 } });
        for (let f = 1; f < aptFloors; f += 1) {
          gb.box(aw - 0.6, 0.07, 0.9, 0, 0.3 + f * FH - 0.04, 3.4, '#f4f1ea', { ao: 1 });
          gb.box(aw - 0.6, 0.38, 0.05, 0, 0.3 + f * FH + 0.04, 3.82, '#9aa4a6', { ao: 1 });
        }
        gb.box(aw + 0.2, 0.15, 6.2, 0, h - 0.02, 0, '#d8d4c8', { ao: 1 });
        gb.box(aw * 0.3, 1.2, 4, aw * 0.1, h + 0.1, 0, pick(rng, PAL.CONCRETE), { ao: 0.9 });
        gb.box(aw, 0.05, 6, 0, h + 0.1, 0, '#8fb05f', { ao: 1 });
        this.count++;
      });
    }
    // south half: office tower or low glass office
    const ox = x0 + range(rng, 6, Math.max(6.1, w - 6)), oz = z1 - 6;
    if (!this.blockedRect(ox - 4.5, oz - 4.5, ox + 4.5, oz + 4.5)) {
      gb.local(ox, 0, oz, 0, () => this.tower(5, 5, Math.round(range(rng, 7, 13))));
    }
    // loose trees + benches
    for (let i = 0; i < 8; i++) this.tree(range(rng, x0 + 1, x1 - 1), range(rng, z0 + half * 0.9, z1 - 1), range(rng, 0.7, 1.1), i % 3 === 0 ? 1 : 0);
    this.streetTrees(c);
  }

  park(c: Cell) {
    const { rng } = this;
    const [x0, z0, x1, z1] = this.inner(c);
    this.flat.rect(c.x0 + 1.5, c.z0 + 1.5, c.x1 - 1.5, c.z1 - 1.5, 0.035, '#8fb05f');
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // winding paths
    for (let i = 0; i < 2; i++) this.flat.seg(x0, cz - 2 + i * 4, x1, cz + 2 - i * 4, 1.2, 0.045, '#e3d6bb');
    this.flat.disc(cx + 4, cz - 5, 3.2, 0.045, '#cfc3ae');
    this.flat.disc(cx + 4, cz - 5, 2.7, 0.05, '#6bb0b8');
    for (let i = 0; i < 30; i++) this.tree(range(rng, x0, x1), range(rng, z0, z1), range(rng, 0.9, 1.5), i % 4 === 0 ? 1 : 0);
  }
}

export { mix };
