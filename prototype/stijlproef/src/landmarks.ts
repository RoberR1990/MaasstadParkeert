// Hand-built hero models of Rotterdam. Every landmark is clearly more detailed than the filler architecture.
import * as THREE from 'three';
import type { FlatBuilder, GeoBuilder } from './geo';
import { FAC } from './geo';
import type { Town } from './buildings';
import type { Environment } from './env';
import { mix } from './buildings';
import { buildLandmarks2 } from './landmarks2';
import { Z_N, Z_S } from './config';
import { range } from './util';

export type Updater = (dt: number, t: number) => void;
export interface Label { id: string; name: string; sub?: string; x: number; y: number; z: number; r: number }
export interface LM {
  gb: GeoBuilder; mt: GeoBuilder; gl: GeoBuilder; fl: GeoBuilder; glass: GeoBuilder; flat: FlatBuilder;
  town: Town; objs: THREE.Object3D[]; labels: Label[]; updaters: Updater[]; rng: () => number;
  uni: Environment['uniforms']; env: Environment; world: unknown; noPark: ((x: number, z: number) => boolean)[]; named: Record<string, THREE.Object3D>;
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const label = (lm: LM, id: string, name: string, x: number, y: number, z: number, r = 8, sub?: string) => lm.labels.push({ id, name, sub, x, y, z, r });

/** canvas text sign (plane), faces +z */
export function signMesh(text: string, w: number, h: number, bg: string, fg: string, font = '700 64px "Fredoka Variable", system-ui, sans-serif') {
  const c = document.createElement('canvas');
  const k = 256;
  c.width = Math.round(k * (w / h > 2 ? 4 : 2)); c.height = Math.round(c.width * (h / w));
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  let size = c.height * 0.58;
  g.font = font.replace(/\d+px/, `${size}px`);
  while (g.measureText(text).width > c.width * 0.9 && size > 8) { size -= 4; g.font = font.replace(/\d+px/, `${size}px`); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}

const WHITE = '#f6f3ea';
const RED = '#d0372c';

export function buildLandmarks(lm: LM) {
  erasmusbrug(lm);
  willemsbrug(lm);
  koninginnebrug(lm);
  kopVanZuid(lm);
  noordereiland(lm);
  blaak(lm);
  buildLandmarks2(lm);
}

// ===================================================================== Erasmusbrug
function erasmusbrug(lm: LM) {
  const { gb, gl } = lm;
  const bx = 4.9, bz = 50.6, H = 47;
  const lean = (y: number) => (y < 0.38 * H ? Math.tan(0.07) * y : Math.tan(0.07) * 0.38 * H + Math.tan(0.31) * (y - 0.38 * H));
  const P = (t: number) => V(bx, t * H, bz + lean(t * H));
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const r0 = 2.5 - 1.6 * t0, r1 = 2.5 - 1.6 * t1;
    gb.taper(P(t0), P(t1), r0, r1, WHITE, 6, { ao: 0.78, aoH: 14 });
  }
  gb.sphere(1.9, bx, 0.38 * H, bz + lean(0.38 * H), WHITE, 1, 1, 1, 1, { ao: 1 });
  gb.sphere(0.62, P(1).x, P(1).y + 0.2, P(1).z, '#e9e3d5', 1, 1.5, 1, 1, { ao: 1 });
  // foundation block at the base
  gb.box(4.6, 1.2, 4.2, bx, 0, bz, '#e4dfd2', { ao: 0.85 });
  // main span stays (fan, deck edge x = 3.7)
  const cableCol = '#f8f5ee';
  const n = 17;
  for (let k = 0; k < n; k++) {
    const t = 0.6 + (k / (n - 1)) * 0.37;
    const zDeck = 44.5 - k * 1.7;
    gb.strut(P(t).clone().add(V(-0.35, 0, 0)), V(3.75, 2.55, zDeck), 0.075, cableCol, 5);
  }
  // back stays
  for (let k = 0; k < 8; k++) {
    const t = 0.66 + (k / 7) * 0.3;
    const zA = 59 + k * 2.1;
    gb.strut(P(t).clone().add(V(-0.35, 0, 0)), V(3.6, 0.3, zA), 0.07, cableCol, 5);
    gb.box(0.9, 0.5, 0.9, 3.6, 0, zA, '#d8d3c6', { ao: 1 });
  }
  // beacon
  gl.sphere(0.32, P(1).x, P(1).y + 1.5, P(1).z, '#ff5a40', 1, 1, 1, 1, { ao: 1 });
  gb.cyl(0.07, 0.1, 1.4, P(1).x, P(1).y + 0.3, P(1).z, '#cfcac0', 5, { ao: 1 });
  // bridge piers at the north approach
  for (const z of [6.5, 9]) gb.box(5.8, 3.2, 1.0, 0, -1.6, z, '#e4dfd2', { ao: 0.85 });
  lm.noPark.push((x, z) => x > 2.9 && x < 7.5 && z > 47 && z < 54);
  lm.town.excl.push([2.5, 48, 8, 56]);
  label(lm, 'erasmus', 'Erasmusbrug', 4, 34, 36, 12, '“De Zwaan”');
}

// ===================================================================== Willemsbrug
function willemsbrug(lm: LM) {
  const { gb } = lm;
  const x = 50;
  for (const pz of [13.2, 20.6]) {
    const top = V(x, 21.5, pz);
    for (const s of [-1, 1]) {
      gb.beam(V(x + s * 4.6, 1.4, pz), top, 0.75, 0.75, RED, { ao: 0.9 });
      gb.box(1.4, 1.4, 1.4, x + s * 4.6, 0, pz, '#cfc9bb', { ao: 0.9 });
    }
    gb.beam(V(x - 2.7, 10.5, pz), V(x + 2.7, 10.5, pz), 0.5, 0.5, RED);
    gb.box(1.3, 1.0, 1.3, x, 21.3, pz, RED, { ao: 1 });
    for (const dz of [-1, 1]) for (let k = 0; k < 5; k++) {
      const zz = pz + dz * (2.4 + k * 1.9);
      for (const s of [-1, 1]) gb.strut(V(x + s * 0.2, 20.6 - k * 0.5, pz), V(x + s * 3.5, 2.55, zz), 0.07, '#f1ece0', 5);
    }
  }
  lm.town.excl.push([45.5, 22, 54.5, 33]);
  label(lm, 'willems', 'Willemsbrug', 50, 22, 17, 12, 'de rode brug');
}

function koninginnebrug(lm: LM) {
  const { gb } = lm;
  for (const z of [37.5, 44.5]) {
    for (const s of [-1, 1]) gb.box(0.9, 6.2, 0.9, 30 + s * 3.6, 0, z, '#e9e6de', { ao: 0.85 });
    gb.box(8.1, 0.9, 1.1, 30, 6.2, z, '#e9e6de', { ao: 0.9 });
  }
  lm.town.excl.push([26, 31, 34, 40]);
}

// ===================================================================== Kop van Zuid
function kopVanZuid(lm: LM) {
  const { gb } = lm;
  deRotterdam(lm, -11.5, 60);
  kpn(lm, -33, 58.5);
  hotelNewYork(lm, -23, 35.2);
  // Montevideo (white, balconies, lattice crown)
  gb.local(-15.8, 0, 41.5, 0, () => {
    const floors = 27, fh = 1.15, h = floors * fh;
    gb.box(5.6, h, 5.2, 0, 0, 0, '#ece8de', { ao: 0.82, aoH: 6, fac: { p: FAC.ribbon, sx: 1.9, sy: fh, lit: 0.55 } });
    for (let f = 2; f < floors; f += 3) gb.box(5.9, 0.12, 5.5, 0, f * fh, 0, '#f6f3ec', { ao: 1 });
    gb.box(2.6, 2.2, 2.6, 0, h, 0, '#d8d4c8', { ao: 0.9 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(0.07, 0.07, 3.2, sx * 1.2, h + 2.2, sz * 1.2, '#c8c4b8', 5, { ao: 1 });
    gb.cyl(0.05, 0.08, 4, 0, h + 2.2, 0, '#d8d6d0', 5, { ao: 1 });
  });
  // Maastoren (steel-blue glass)
  gb.local(-30.2, 0, 41.2, 0, () => {
    const floors = 36, fh = 1.1, h = floors * fh;
    gb.box(7.4, 3.6, 7.0, 0, 0, 0, '#c9ced0', { ao: 0.8, fac: { p: FAC.curtain, sx: 1.7, sy: 1.2, lit: 0.5 } });
    gb.box(6.4, h, 6.0, 0, 3.6, 0, '#6f8499', { ao: 0.8, aoH: 8, fac: { p: FAC.curtain, sx: 1.5, sy: fh, lit: 0.6 } });
    gb.box(5.4, 1.4, 5.0, 0, h + 3.6, 0, '#7d90a3', { ao: 1 });
    gb.cyl(0.06, 0.1, 4.5, 1, h + 5, -1, '#d8d6d0', 5, { ao: 1 });
  });
  // low warehouses / quay buildings on the pier base
  lm.gb.box(10, 3.2, 4.2, -17, 0, 49.2, '#b36b52', { ao: 0.8 });
  label(lm, 'kvz', 'Kop van Zuid', -22, 48, 52, 0.01); // dummy anchor (not shown) kept for map text
  lm.labels.pop();
}

function deRotterdam(lm: LM, cx: number, cz: number) {
  const { gb } = lm;
  const fh = 1.1;
  gb.local(cx, 0, cz, 0, () => {
    // podium
    gb.box(21, 3.6, 9.4, 0, 0, 0, '#a9b2b8', { ao: 0.8, fac: { p: FAC.grid, sx: 1.8, sy: 1.2, lit: 0.6 } });
    const towers: { x: number; segs: [number, number, number][] }[] = [
      { x: -6.8, segs: [[17, 0, 0], [12, 0.9, -0.9], [9, -0.7, 0.6]] },
      { x: 0, segs: [[14, 0, 0], [11, -0.8, -0.7], [9, 0.8, 0.8]] },
      { x: 6.8, segs: [[11, 0, 0], [10, 0.7, -0.6], [9, -0.5, 0.7]] },
    ];
    let hMax = 0;
    for (const t of towers) {
      let y = 3.6;
      for (const [fl, dx, dz] of t.segs) {
        const hh = fl * fh;
        gb.box(5.6, hh, 7.4, t.x + dx, y, dz, '#8f9aa3', { ao: 0.85, aoH: 8, fac: { p: FAC.grid, sx: 1.4, sy: fh, lit: 0.55 } });
        y += hh;
      }
      hMax = Math.max(hMax, y);
      gb.box(4.4, 0.5, 6.0, t.x, y, 0, '#e8ebec', { ao: 1 });
    }
    // connecting bridges between the towers
    gb.box(2.0, 3.3, 6.4, -3.4, 24, 0.2, '#e2e6e7', { ao: 0.9, fac: { p: FAC.grid, sx: 1.2, sy: fh, lit: 0.5 } });
    gb.box(2.0, 3.3, 6.4, 3.4, 17, -0.2, '#e2e6e7', { ao: 0.9, fac: { p: FAC.grid, sx: 1.2, sy: fh, lit: 0.5 } });
  });
  lm.town.excl.push([cx - 11, cz - 5.5, cx + 11, cz + 5.5]);
  label(lm, 'derotterdam', 'De Rotterdam', cx, 46, cz, 12, 'drie torens, één stad');
}

function kpn(lm: LM, cx: number, cz: number) {
  const { gb } = lm;
  gb.local(cx, 0, cz, 0, () => {
    // podium
    gb.box(9.5, 3.4, 7.8, 0, 0, 0, '#d8dadb', { ao: 0.8, fac: { p: FAC.grid, sx: 1.8, sy: 1.2, lit: 0.6 } });
    // slanted tower, leaning to the river (north = -z)
    gb.local(0, 3.2, 0, 0, () => {
      const h = 42;
      gb.box(7.6, h, 5.8, 0, 0, 0, '#2c323f', { ao: 0.75, aoH: 10, fac: { p: FAC.dots, sx: 0.78, sy: 0.78, lit: 1 } });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.34, h, 0.34, sx * 3.8, 0, sz * 2.9, '#cdd2d4', { ao: 1 });
      gb.box(8.0, 0.5, 6.2, 0, h, 0, '#cdd2d4', { ao: 1 });
      // red-white diagonal bracing on the back (south) face
      gb.beam(V(-3.7, 1, 3.05), V(3.7, h * 0.55, 3.05), 0.34, 0.34, '#e8e6e0');
      gb.beam(V(3.7, 1, 3.05), V(-3.7, h * 0.55, 3.05), 0.34, 0.34, '#e8e6e0');
      gb.cyl(0.07, 0.1, 4, 2, h + 0.5, 0, '#d8d6d0', 5, { ao: 1 });
    }, -0.115);
  });
  lm.town.excl.push([cx - 6, cz - 5, cx + 6, cz + 5]);
  label(lm, 'kpn', 'KPN-toren', cx, 38, cz - 3, 10, 'de scheve toren');
}

function hotelNewYork(lm: LM, cx: number, cz: number) {
  const { gb, gl } = lm;
  const stone = '#d9c8a4', brick = '#b5654d', copper = '#5aa58f';
  gb.local(cx, 0, cz, Math.PI, () => {
    const W = 15.5, D = 6.4, h = 6.9;
    gb.box(W, h, D, 0, 0, 0, stone, { ao: 0.78, aoH: 4, fac: { p: FAC.punched, sx: 1.55, sy: 1.15, lit: 0.6 } });
    gb.box(W + 0.12, 1.2, D + 0.12, 0, 0, 0, mix(brick, '#3a2c28', 0.15), { ao: 1 });
    gb.box(W + 0.14, 0.18, D + 0.14, 0, h - 0.05, 0, '#efe6cf', { ao: 1 });
    // slate roof with dormers
    gb.gable(W + 0.4, 2.3, D + 0.9, 0, h, 0, '#4d5560', true);
    for (let i = 0; i < 4; i++) {
      const dx = -5.4 + i * 3.6;
      gb.box(1.0, 0.9, 0.8, dx, h + 0.35, D * 0.18, stone, { ao: 1 });
      gb.gable(1.0, 0.6, 0.8, dx, h + 1.25, D * 0.18, '#4d5560', false);
      gb.box(0.5, 0.5, 0.04, dx, h + 0.45, D * 0.18 + 0.42, '#3c4a58', { ao: 1 });
    }
    // two corner towers with green copper spires (front = +z)
    for (const s of [-1, 1]) {
      const tx = s * (W / 2 - 1.2);
      gb.box(2.8, h + 3.2, 2.8, tx, 0, D / 2 - 0.2, stone, { ao: 0.78, aoH: 5, fac: { p: FAC.punched, sx: 1.4, sy: 1.15, lit: 0.6 } });
      gb.box(3.1, 0.2, 3.1, tx, h + 3.2, D / 2 - 0.2, '#efe6cf', { ao: 1 });
      gb.pyramid(3.3, 4.2, 3.3, tx, h + 3.4, D / 2 - 0.2, copper);
      gb.cyl(0.05, 0.08, 1.4, tx, h + 7.4, D / 2 - 0.2, '#d4b24a', 5, { ao: 1 });
      gb.sphere(0.2, tx, h + 7.1, D / 2 - 0.2, '#d4b24a', 1, 1, 1, 1);
    }
    // central gable with clock
    gb.box(3.6, h + 1.6, 1.2, 0, 0, D / 2 + 0.5, stone, { ao: 0.85, aoH: 5, fac: { p: FAC.punched, sx: 1.7, sy: 1.15, lit: 0.6 } });
    gb.gable(3.8, 1.9, 1.2, 0, h + 1.6, D / 2 + 0.5, '#cdbb92', false);
    const clock = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14).rotateX(Math.PI / 2);
    gb.add(clock, '#f6f1e2', new THREE.Matrix4().makeTranslation(0, h + 1.7, D / 2 + 1.14), { ao: 1 });
    // quay + jetty
    gb.box(W + 3, 0.18, 2.2, 0, 0, D / 2 + 1.7, '#bfae8d', { ao: 1 });
    gb.cyl(0.03, 0.03, 5, W / 2 + 0.4, h, -D / 2 + 0.8, '#d8d6d0', 5, { ao: 1 });
    gl.box(1.2, 0.8, 0.04, W / 2 + 1.0, h + 3.4, -D / 2 + 0.8, '#e9d27a', { ao: 1 });
  });
  lm.town.excl.push([cx - 8.5, cz - 4.5, cx + 8.5, cz + 4.5]);
  label(lm, 'hny', 'Hotel New York', cx, 14, cz, 9, 'voormalig Holland-Amerika Lijn');
}

// ===================================================================== Noordereiland
function noordereiland(lm: LM) {
  const t = lm.town;
  t.run(22, 25.0, 45.5, 28.6, 0, 3.6, 4, { shops: 0.05 });
  t.run(54.5, 25.0, 62, 28.6, 0, 3.6, 4);
  t.run(21, 34.4, 45, 38, 2, 3.6, 4);
  t.run(54.5, 34.4, 62, 38, 2, 3.6, 4);
  lm.flat.rect(24, 24.9, 62, 25.0, 0.04, '#cdbfa3');
  for (let x = 22; x < 62; x += 5.8) { t.tree(x + range(lm.rng, -0.4, 0.4), 30.0, 0.8, 1); t.tree(x + 2.6, 33.0, 0.7, 1); }
  for (let i = 0; i < 6; i++) t.tree(range(lm.rng, 15, 20), range(lm.rng, 28, 35), 0.9, 0);
  label(lm, 'noorder', 'Noordereiland', 38, 9, 31.5, 14, '19e-eeuwse huizen');
}

// ===================================================================== Blaak: Kubuswoningen, Markthal, Potlood
function blaak(lm: LM) {
  const { gb } = lm;
  const s = 3.9, diag = s * Math.sqrt(3);
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 1, 1).normalize(), V(0, 1, 0));
  const yel = '#e9c22b', dark = '#2e3e4c';
  const cube = (cx: number, cz: number, rot: number) => {
    const pH = 3.8;
    gb.cyl(1.0, 1.25, pH, cx, 0, cz, '#bdb8ac', 6, { ao: 0.8 });
    gb.cyl(1.35, 1.35, 0.25, cx, pH - 0.1, cz, '#a9a498', 6, { ao: 1 });
    const m = new THREE.Matrix4().compose(V(cx, pH + diag / 2 - 0.05, cz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot).multiply(q), V(1, 1, 1));
    gb.localM(m, () => {
      gb.box(s, s, s, 0, -s / 2, 0, yel, { ao: 1 });
      const win = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
        gb.box(w, h, 0.1, x, y - h / 2, z, dark, { ao: 1 }, ry);
        gb.box(w * 0.08, h, 0.14, x, y - h / 2, z, '#f4efe0', { ao: 1 }, ry);
      };
      const k = 0.6 * s;
      win(k, k, 0, 0, s / 2 + 0.03, 0);
      win(k, k, 0, 0, -s / 2 - 0.03, 0);
      gb.box(0.1, k, k, s / 2 + 0.03, -k / 2 - 0.2, 0, dark, { ao: 1 });
      gb.box(0.1, k, k, -s / 2 - 0.03, -k / 2 - 0.2, 0, dark, { ao: 1 });
      gb.box(k, 0.1, k, 0, s / 2 - 0.0, 0, '#b9d6e2', { ao: 1 }); // skylight
    });
  };
  const rows: [number, number, number][] = [
    [54.5, -2.6, 0.2], [60.2, -2.6, 0.5], [65.9, -2.6, -0.2], [71.6, -2.6, 0.3],
    [62.4, -9.8, 0.1], [68.1, -9.8, -0.4], [73.8, -9.8, 0.2],
  ];
  for (const [x, z, r] of rows) cube(x, z, r);
  // low shops under the cubes
  gb.box(21.6, 1.6, 2.4, 63.2, 0, 1.6, '#c9c3b5', { ao: 0.8 });
  label(lm, 'kubus', 'Kubuswoningen', 63, 12, -6, 14, 'gele kubussen op palen');

  // Potlood
  gb.local(56.3, 0, -12.6, 0, () => {
    const h = 25;
    gb.box(5.6, h, 5.6, 0, 0, 0, '#cbd0d3', { ao: 0.8, aoH: 8, fac: { p: FAC.ribbon, sx: 1.4, sy: 1.15, lit: 0.55 } });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.28, h, 0.28, sx * 2.8, 0, sz * 2.8, '#eeeeea', { ao: 1 });
    gb.box(5.9, 0.7, 5.9, 0, h, 0, '#c4c8cb', { ao: 1 }); // ferrule
    // sharpened pencil roof: wood cone + graphite tip
    gb.pyramid(5.8, 6.5, 5.8, 0, h + 0.7, 0, '#d9b46a');
    gb.pyramid(1.7, 2.2, 1.7, 0, h + 0.7 + 4.5, 0, '#33363a');
  });
  lm.town.excl.push([52.5, -16, 60, -9]);
  label(lm, 'potlood', 'Het Potlood', 56.3, 31, -12.6, 8, 'Blaaktoren');

  markthal(lm, 38.5, -7.2);
}

function markthal(lm: LM, cx: number, cz: number) {
  const { gb, glass } = lm;
  const L = 13.5, Wo = 8, Wi = 5.5, ho = 7.4, hi = 5.2; // outer/inner half-widths, straight leg heights
  const shell = new THREE.Shape();
  shell.moveTo(-Wo, 0); shell.lineTo(-Wo, ho); shell.absarc(0, ho, Wo, Math.PI, 0, true); shell.lineTo(Wo, 0); shell.lineTo(-Wo, 0);
  const hole = new THREE.Path();
  hole.moveTo(-Wi, 0); hole.lineTo(-Wi, hi); hole.absarc(0, hi, Wi, Math.PI, 0, true); hole.lineTo(Wi, 0); hole.lineTo(-Wi, 0);
  shell.holes.push(hole);
  const eg = new THREE.ExtrudeGeometry(shell, { depth: L, bevelEnabled: false, curveSegments: 22 });
  eg.translate(0, 0, -L / 2);
  gb.add(eg, '#a3a5ae', new THREE.Matrix4().makeTranslation(cx, 0, cz), { ao: 0.8, aoH: 5 });
  // apartment windows (dark panes) on the outside of the arch
  const pane = new THREE.BoxGeometry(0.14, 0.72, 0.95);
  const rowsZ = 10;
  const outline: [number, number, number][] = []; // x, y, angle (normal)
  for (let y = 1.0; y < ho; y += 1.25) { outline.push([-Wo, y, Math.PI]); outline.push([Wo, y, 0]); }
  const arcN = 17;
  for (let i = 1; i < arcN; i++) { const a = Math.PI - (i / arcN) * Math.PI; outline.push([Math.cos(a) * Wo, ho + Math.sin(a) * Wo, a]); }
  for (const [x, y, a] of outline) {
    for (let r = 0; r < rowsZ; r++) {
      const z = -L / 2 + 0.9 + r * ((L - 1.8) / (rowsZ - 1));
      const m = new THREE.Matrix4().compose(V(cx + x + Math.cos(a) * 0.02, y, cz + z), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a), V(1, 1, 1));
      gb.add(pane, '#38485a', m, { ao: 1 });
    }
  }
  // coloured interior mural ("Hoorn des Overvloeds")
  const pal = ['#e8453c', '#f2a03a', '#f4d03f', '#6cbf5c', '#3f8fd2', '#d8509a', '#8e5cc7', '#f6efe0', '#2fa58f', '#ff7a59'];
  const prof: [number, number, number][] = []; // x,y, 0..1 param
  const legN = 5, arcM = 26;
  for (let i = 0; i <= legN; i++) prof.push([-Wi + 0.04, (i / legN) * hi, 0]);
  for (let i = 1; i < arcM; i++) { const a = Math.PI - (i / arcM) * Math.PI; prof.push([Math.cos(a) * (Wi - 0.04), hi + Math.sin(a) * (Wi - 0.04), 0]); }
  for (let i = legN; i >= 0; i--) prof.push([Wi - 0.04, (i / legN) * hi, 0]);
  const zN = 14;
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const colAt = (i: number, j: number) => {
    const n = Math.sin(i * 0.55) * 1.6 + Math.sin(j * 0.9 + i * 0.2) * 1.4 + hash(Math.floor(i / 2), Math.floor(j / 2)) * 4;
    return pal[Math.abs(Math.floor(n * 1.3)) % pal.length];
  };
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < zN; j++) {
    const a = prof[i], b = prof[i + 1];
    const z0 = -L / 2 + 0.05 + (j / zN) * (L - 0.1), z1 = -L / 2 + 0.05 + ((j + 1) / zN) * (L - 0.1);
    c.set(colAt(i, j));
    const shade = 0.78 + 0.22 * Math.min(1, a[1] / 6);
    c.multiplyScalar(shade);
    const v = (p: [number, number, number], z: number) => { pos.push(cx + p[0], p[1], cz + z); col.push(c.r, c.g, c.b); };
    v(a, z0); v(b, z0); v(a, z1); v(a, z1); v(b, z0); v(b, z1);
  }
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ig.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ig.computeVertexNormals();
  const interior = new THREE.Mesh(ig, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  lm.objs.push(interior);
  // market floor + stalls
  lm.flat.rect(cx - Wi, cz - L / 2, cx + Wi, cz + L / 2, 0.05, '#efe4cf');
  const stall = ['#e8453c', '#f2a03a', '#3f8fd2', '#6cbf5c', '#d8509a', '#f4d03f'];
  for (let r = 0; r < 5; r++) for (const sx of [-2.9, 0, 2.9]) {
    const z = cz - L / 2 + 1.6 + r * 2.5;
    gb.box(1.7, 0.7, 1.3, cx + sx, 0.04, z, '#f4efe4', { ao: 0.9 });
    gb.box(1.9, 0.12, 1.5, cx + sx, 1.5, z, stall[(r + (sx > 0 ? 1 : 0) + (sx === 0 ? 3 : 0)) % stall.length], { ao: 1 });
    gb.box(0.08, 1.5, 0.08, cx + sx - 0.8, 0, z - 0.6, '#555', { ao: 1 });
    gb.box(0.08, 1.5, 0.08, cx + sx + 0.8, 0, z + 0.6, '#555', { ao: 1 });
  }
  // glass end walls with steel mullions
  const sh = new THREE.Shape();
  sh.moveTo(-Wi, 0); sh.lineTo(-Wi, hi); sh.absarc(0, hi, Wi, Math.PI, 0, true); sh.lineTo(Wi, 0); sh.lineTo(-Wi, 0);
  for (const sz of [-1, 1]) {
    const gg = new THREE.ShapeGeometry(sh, 22);
    glass.add(gg, '#ffffff', new THREE.Matrix4().makeTranslation(cx, 0, cz + sz * (L / 2 - 0.15)), { ao: 1 });
    for (let k = -4; k <= 4; k++) {
      const x = (k / 4.4) * Wi;
      const top = hi + Math.sqrt(Math.max(0, Wi * Wi - x * x));
      gb.box(0.08, top, 0.1, cx + x, 0, cz + sz * (L / 2 - 0.1), '#46515c', { ao: 1 });
    }
    for (const y of [2, 4.5, 7]) gb.box(Wi * 2, 0.07, 0.1, cx, y, cz + sz * (L / 2 - 0.1), '#46515c', { ao: 1 });
  }
  lm.town.excl.push([cx - Wo - 0.5, cz - L / 2 - 0.5, cx + Wo + 0.5, cz + L / 2 + 0.5]);
  lm.flat.rect(cx - Wo - 2.5, cz - L / 2 - 2.5, cx + Wo + 2.5, cz + L / 2 + 2.5, 0.036, '#e1d8c6');
  label(lm, 'markthal', 'Markthal', cx, 14, cz, 12, 'de boog van Rotterdam');
}

export { Z_N, Z_S };
