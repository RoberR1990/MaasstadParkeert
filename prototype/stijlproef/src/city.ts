// Procedural city layout: blocks, lots, buildings, trees, lamps, windows.
import * as THREE from 'three';
import { GeoBuilder, roundedSlab } from './geo';
import * as PAL from './palette';
import { COL } from './palette';
import { BLOCK, NB, PAD_H, blockCenter } from './config';
import { Rng, pick, range } from './util';

export interface Lot {
  id: number;
  cx: number;
  cz: number;
  size: number;
  bi: number;
  bj: number;
  free: boolean;
  marker?: THREE.Mesh;
}
export interface Win {
  x: number; y: number; z: number; rotY: number; sx: number; sy: number;
  lit: number; color: THREE.Color; shop?: boolean;
}
export interface TreeSpec { x: number; z: number; s: number; autumn: boolean; y: number }
export interface LampSpec { x: number; z: number }
export interface Block { i: number; j: number; cx: number; cz: number; type: string }

export interface CityData {
  lots: Lot[];
  blocks: Block[];
  trees: TreeSpec[];
  lamps: LampSpec[];
  wins: Win[];
  /** merged static geometry, one entry per material class */
  geoMain: THREE.BufferGeometry;
  geoPads: THREE.BufferGeometry;
  geoLawn: THREE.BufferGeometry;
  /** per-building spawn data for the intro "pop up" animation: [cx, cz] */
  buildingCenters: { x: number; z: number; h: number }[];
}

type Face = [boolean, boolean, boolean, boolean]; // +z, +x, -z, -x
const Y0 = PAD_H;
const ALL: Face = [true, true, true, true];

interface HouseOpts {
  cx: number; cz: number; w: number; d: number; floors: number; fh?: number;
  style: 'brick' | 'plaster' | 'painted' | 'flat' | 'shop' | 'glass' | 'modern';
  faces?: Face;
  roof?: 'gable' | 'flat' | 'auto';
  doorFace?: number;
}

export function generateCity(rng: Rng): CityData {
  const gb = new GeoBuilder();
  const pads = new GeoBuilder();
  const lawn = new GeoBuilder();
  const wins: Win[] = [];
  const trees: TreeSpec[] = [];
  const lamps: LampSpec[] = [];
  const lots: Lot[] = [];
  const blocks: Block[] = [];
  const centers: { x: number; z: number; h: number }[] = [];

  // ---------- building generator ----------
  function house(o: HouseOpts) {
    const fh = o.fh ?? 0.62;
    const { cx, cz, w, d, floors, style } = o;
    const faces = o.faces ?? ALL;
    const h = floors * fh + 0.25;
    let wall: string;
    let winCol = '#4c5d70';
    let glassy = false;
    switch (style) {
      case 'brick': wall = pick(rng, PAL.BRICK); break;
      case 'plaster': wall = pick(rng, PAL.PLASTER); break;
      case 'painted': wall = pick(rng, PAL.PAINTED); break;
      case 'flat': wall = pick(rng, [...PAL.CONCRETE, ...PAL.PLASTER]); break;
      case 'shop': wall = pick(rng, [...PAL.BRICK, ...PAL.PLASTER]); break;
      case 'modern': wall = pick(rng, PAL.CONCRETE); winCol = '#5d7488'; glassy = true; break;
      default: wall = pick(rng, PAL.GLASS_BODY); winCol = '#6d93ad'; glassy = true;
    }
    // main body + plinth + string courses
    gb.box(w, h, d, cx, Y0, cz, wall, { ao: 0.74, aoH: Math.min(2.4, h) });
    const plinth = new THREE.Color(wall).multiplyScalar(0.72);
    gb.box(w + 0.05, 0.3, d + 0.05, cx, Y0, cz, plinth, { ao: 0.9 });
    if (!glassy) {
      const band = new THREE.Color(wall).lerp(new THREE.Color('#f4ead4'), 0.5);
      for (let f = 1; f < floors; f++) gb.box(w + 0.06, 0.05, d + 0.06, cx, Y0 + f * fh + 0.2, cz, band, { ao: 1 });
    } else if (style === 'glass') {
      // vertical fins on the tower
      const fin = new THREE.Color(wall).multiplyScalar(0.86);
      const n = Math.max(2, Math.round(w / 0.55));
      for (let k = 0; k <= n; k++) {
        const fx = -w / 2 + (w * k) / n;
        gb.box(0.05, h, d + 0.05, cx + fx, Y0, cz, fin, { ao: 1 });
        gb.box(w + 0.05, h, 0.05, cx, Y0, cz - d / 2 + (d * k) / n, fin, { ao: 1 });
      }
    }
    // cornice / roof
    const roofMode = o.roof ?? 'auto';
    const gable = roofMode === 'gable' || (roofMode === 'auto' && (style === 'brick' || style === 'plaster' || style === 'painted') && floors <= 4 && rng() < 0.7);
    const roofTop = Y0 + h;
    if (gable) {
      const col = rng() < 0.55 ? pick(rng, PAL.ROOF_TILE) : pick(rng, PAL.ROOF_SLATE);
      gb.box(w + 0.14, 0.07, d + 0.14, cx, roofTop - 0.02, cz, new THREE.Color(wall).lerp(new THREE.Color('#fff4dd'), 0.35), { ao: 1 });
      const rh = Math.min(w, d) * 0.42;
      const alongX = rng() < 0.5 ? d < w : d <= w;
      gb.gable(alongX ? w + 0.18 : w + 0.14, rh, alongX ? d + 0.12 : d + 0.18, cx, roofTop + 0.04, cz, col, alongX, { tint: 1 });
      if (rng() < 0.6) gb.box(0.2, 0.42, 0.2, cx + range(rng, -w / 4, w / 4), roofTop + rh * 0.45, cz + range(rng, -d / 4, d / 4), new THREE.Color(PAL.BRICK[0]).multiplyScalar(0.85), { ao: 1 });
    } else {
      const rc = pick(rng, PAL.ROOF_FLAT);
      gb.box(w + 0.1, 0.08, d + 0.1, cx, roofTop, cz, new THREE.Color(wall).lerp(new THREE.Color('#fff4dd'), 0.3), { ao: 1 });
      gb.box(w - 0.1, 0.03, d - 0.1, cx, roofTop + 0.06, cz, rc, { ao: 1 });
      // parapet
      const pc = new THREE.Color(wall).multiplyScalar(0.95);
      gb.box(w + 0.1, 0.1, 0.06, cx, roofTop + 0.06, cz + d / 2 + 0.02, pc, { ao: 1 });
      gb.box(w + 0.1, 0.1, 0.06, cx, roofTop + 0.06, cz - d / 2 - 0.02, pc, { ao: 1 });
      gb.box(0.06, 0.1, d, cx + w / 2 + 0.02, roofTop + 0.06, cz, pc, { ao: 1 });
      gb.box(0.06, 0.1, d, cx - w / 2 - 0.02, roofTop + 0.06, cz, pc, { ao: 1 });
      // roof clutter
      const nb = style === 'glass' ? 2 : 1 + Math.floor(rng() * 2);
      for (let k = 0; k < nb; k++) {
        const bw = range(rng, 0.3, 0.55);
        gb.box(bw, range(rng, 0.2, 0.4), bw, cx + range(rng, -w / 3, w / 3), roofTop + 0.08, cz + range(rng, -d / 3, d / 3), pick(rng, PAL.CONCRETE), { ao: 0.9 });
      }
      if (style === 'glass' || floors > 9) {
        gb.cyl(0.015, 0.03, 1.5, cx + w * 0.2, roofTop + 0.1, cz - d * 0.2, '#d8d6d0', 5, { ao: 1 });
        // setback crown
        gb.box(w * 0.62, 0.55, d * 0.62, cx, roofTop + 0.06, cz, new THREE.Color(wall).multiplyScalar(0.93), { ao: 0.85 });
        gb.box(w * 0.66, 0.06, d * 0.66, cx, roofTop + 0.61, cz, '#e9e4d8', { ao: 1 });
      }
    }
    // balconies on flats
    if (style === 'flat' && floors >= 4) {
      for (let f = 2; f < floors; f += 2) {
        for (let k = 0; k < 2; k++) {
          const bx = cx + (k - 0.5) * (w * 0.5);
          gb.box(0.55, 0.05, 0.28, bx, Y0 + f * fh + 0.2, cz + d / 2 + 0.14, '#e8e0cf', { ao: 1 });
          gb.box(0.55, 0.14, 0.03, bx, Y0 + f * fh + 0.25, cz + d / 2 + 0.27, '#8a8f93', { ao: 1 });
        }
      }
    }
    // door + awning
    const doorCol = pick(rng, ['#5b6b73', '#7b4b3f', '#3f5a54', '#c79c4f']);
    if (faces[0] && style !== 'glass' && style !== 'modern') {
      if (style === 'shop') {
        const ac = pick(rng, PAL.AWNING);
        const ac2 = '#f1e8d6';
        const n = 6;
        for (let k = 0; k < n; k++) {
          const sw = (w - 0.1) / n;
          const ax = cx - (w - 0.1) / 2 + sw * (k + 0.5);
          const g = new THREE.BoxGeometry(sw, 0.05, 0.5);
          const m = new THREE.Matrix4().makeRotationX(0.38);
          m.setPosition(ax, Y0 + 0.78, cz + d / 2 + 0.22);
          gb.add(g, k % 2 ? ac2 : ac, m, { ao: 1 });
        }
        gb.box(w - 0.5, 0.5, 0.04, cx, Y0 + 0.18, cz + d / 2 + 0.01, '#34414c', { ao: 1 });
        wins.push({ x: cx, y: Y0 + 0.43, z: cz + d / 2 + 0.035, rotY: 0, sx: (w - 0.62) / 0.36, sy: 0.62, lit: rng() < 0.85 ? 1 : 0, color: new THREE.Color('#3b4856'), shop: true });
      } else {
        gb.box(0.3, 0.46, 0.05, cx + (rng() < 0.5 ? -w * 0.28 : w * 0.28), Y0, cz + d / 2 + 0.01, doorCol, { ao: 1 });
        gb.box(0.4, 0.04, 0.12, cx + 0 * w, Y0 + 0.48, cz + d / 2 + 0.02, '#e8e0cf', { ao: 1 });
      }
    }
    // windows
    addWindows(cx, cz, w, d, floors, fh, style === 'shop' ? 1 : 0, glassy, winCol, faces, style === 'glass' ? 0.42 : style === 'modern' ? 0.5 : 0.6, style === 'shop');
    centers.push({ x: cx, z: cz, h });
    return h;
  }

  function addWindows(cx: number, cz: number, w: number, d: number, floors: number, fh: number, f0: number, glassy: boolean, col: string, faces: Face, litProb: number, shop: boolean) {
    const colW = glassy ? 0.5 : 0.62;
    const dirs = [
      { L: w, rot: 0, nx: 0, nz: 1, off: d / 2 },
      { L: d, rot: Math.PI / 2, nx: 1, nz: 0, off: w / 2 },
      { L: w, rot: Math.PI, nx: 0, nz: -1, off: d / 2 },
      { L: d, rot: -Math.PI / 2, nx: -1, nz: 0, off: w / 2 },
    ];
    const base = new THREE.Color(col);
    // per-floor lit tendency makes window glow cluster nicely
    for (let fi = 0; fi < 4; fi++) {
      if (!faces[fi]) continue;
      const dd = dirs[fi];
      const cols = Math.max(1, Math.floor((dd.L - 0.25) / colW));
      const sp = dd.L / cols;
      for (let f = f0; f < floors; f++) {
        const floorLit = rng() < litProb ? 1 : 0;
        for (let k = 0; k < cols; k++) {
          const along = -dd.L / 2 + sp * (k + 0.5);
          // skip door column on ground floor of the front
          if (f === 0 && fi === 0 && !shop && !glassy && k === 0) continue;
          const px = cx + (dd.nz !== 0 ? along : dd.nx * (dd.off + 0.012)) ;
          const pz = cz + (dd.nz !== 0 ? dd.nz * (dd.off + 0.012) : along);
          const lit = rng() < 0.55 + 0.35 * floorLit && floorLit ? range(rng, 0.55, 1) : rng() < 0.08 ? 0.8 : 0;
          const c = base.clone().multiplyScalar(range(rng, 0.88, 1.1));
          wins.push({
            x: px, y: Y0 + 0.2 + fh * (f + 0.5) + 0.04, z: pz, rotY: dd.rot,
            sx: glassy ? (sp * 0.82) / 0.36 : 1, sy: glassy ? (fh * 0.7) / 0.4 : 1, lit, color: c,
          });
        }
      }
    }
  }

  function tree(x: number, z: number, s = 1, y = Y0) {
    trees.push({ x, z, s: s * range(rng, 0.85, 1.15), autumn: rng() < 0.2, y });
  }

  // ---------- blocks ----------
  const typeMap: string[][] = [];
  for (let j = 0; j < NB; j++) {
    typeMap[j] = [];
    for (let i = 0; i < NB; i++) {
      const central = 1 - Math.min(1, Math.hypot(i - 3.5, j - 3.0) / 5);
      const r = rng();
      let t = 'standard';
      if (r < 0.2) t = 'perimeter';
      else if (r < 0.2 + 0.05 + central * 0.1) t = "tower";
      else if (r > 0.93) t = 'park';
      typeMap[j][i] = t;
    }
  }
  // hand-placed anchors so the composition reads well
  typeMap[3][3] = 'park'; typeMap[4][4] = 'tower'; typeMap[2][4] = 'tower'; typeMap[6][5] = 'perimeter';
  typeMap[5][1] = 'park'; typeMap[1][5] = 'perimeter'; typeMap[7][6] = 'tower'; typeMap[7][0] = 'standard';

  // choose free lots: spread out, standard/tower blocks only
  const order: [number, number][] = [];
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) order.push([i, j]);
  for (let k = order.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [order[k], order[r]] = [order[r], order[k]]; }
  const freeBlocks = new Map<string, number>();
  for (const [i, j] of order) {
    if (freeBlocks.size >= 15) break;
    const t = typeMap[j][i];
    if (t !== 'standard' && t !== 'tower') continue;
    let near = false;
    for (const key of freeBlocks.keys()) {
      const [a, b] = key.split(',').map(Number);
      if (Math.abs(a - i) + Math.abs(b - j) < 2) near = true;
    }
    if (near) continue;
    freeBlocks.set(`${i},${j}`, Math.floor(rng() * 4));
  }
  // guarantee a free lot near the centre-front for the tutorial
  for (const key of [...freeBlocks.keys()]) {
    const [a, b] = key.split(',').map(Number);
    if (Math.abs(a - 3) + Math.abs(b - 4) < 1) freeBlocks.delete(key);
  }
  freeBlocks.set('3,4', 1);
  typeMap[4][3] = 'standard';

  let lotId = 0;
  for (let j = 0; j < NB; j++) {
    for (let i = 0; i < NB; i++) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const type = typeMap[j][i];
      blocks.push({ i, j, cx, cz, type });
      const central = 1 - Math.min(1, Math.hypot(i - 3.5, j - 3.0) / 5.5);
      const riverside = j === NB - 1;

      // pad (sidewalk)
      pads.add(roundedSlab(BLOCK, BLOCK, 0.55, PAD_H, 0.03), type === 'park' ? COL.grassDark : COL.sidewalk, new THREE.Matrix4().makeTranslation(cx, 0, cz), { ao: 1 });

      const lotSize = 2.4;
      const off = 1.4;
      const lotPos: [number, number][] = [[-off, -off], [off, -off], [-off, off], [off, off]];

      if (type === 'park') {
        lawn.add(roundedSlab(BLOCK - 0.5, BLOCK - 0.5, 0.45, 0.04, 0.02), pick(rng, [COL.grassTop, '#a6bd74']), new THREE.Matrix4().makeTranslation(cx, PAD_H - 0.01, cz), { ao: 1 });
        // winding path
        gb.box(0.6, 0.02, BLOCK - 0.6, cx + 0.3, PAD_H + 0.03, cz, '#e3d6bb', { ao: 1 });
        gb.box(BLOCK - 0.6, 0.02, 0.6, cx, PAD_H + 0.032, cz - 0.3, '#e3d6bb', { ao: 1 });
        // pond
        gb.cyl(0.95, 0.95, 0.03, cx - 1.5, PAD_H + 0.03, cz + 1.4, '#cfc3ae', 18, { ao: 1 });
        gb.cyl(0.8, 0.8, 0.045, cx - 1.5, PAD_H + 0.03, cz + 1.4, '#6fb0b8', 18, { ao: 1 });
        for (let k = 0; k < 7; k++) tree(cx + range(rng, -2.3, 2.3), cz + range(rng, -2.3, 2.3), range(rng, 0.9, 1.25));
        // bench
        gb.box(0.5, 0.07, 0.16, cx + 0.9, PAD_H + 0.05, cz + 0.3 + 0.0, '#8d6a4a', { ao: 1 });
        gb.box(0.5, 0.04, 0.04, cx + 0.9, PAD_H + 0.0, cz + 0.2, '#4a4f58', { ao: 1 });
        continue;
      }

      if (type === 'perimeter') {
        const t = 1.45;
        const out = BLOCK - 0.5;
        const fl = Math.round(3 + central * 2 + rng() * 1.5);
        const st = pick(rng, ['brick', 'brick', 'plaster', 'painted'] as const);
        // north / south wings full width, west / east wings between
        const wingH = (cz2: number, faces: Face) => house({ cx, cz: cz2, w: out, d: t, floors: fl + (rng() < 0.4 ? 1 : 0), style: st, faces, roof: 'flat' });
        wingH(cz - out / 2 + t / 2, [false, true, true, true]);
        wingH(cz + out / 2 - t / 2, [true, true, false, true]);
        const inner = out - 2 * t;
        house({ cx: cx - out / 2 + t / 2, cz, w: t, d: inner, floors: fl, style: st, faces: [false, false, false, true], roof: 'flat' });
        house({ cx: cx + out / 2 - t / 2, cz, w: t, d: inner, floors: fl, style: st, faces: [false, true, false, false], roof: 'flat' });
        // courtyard
        lawn.add(roundedSlab(inner, inner, 0.3, 0.05, 0.02), '#a3bb73', new THREE.Matrix4().makeTranslation(cx, PAD_H - 0.01, cz), { ao: 1 });
        tree(cx - 0.35, cz - 0.3, 1.0); tree(cx + 0.4, cz + 0.45, 0.85);
        continue;
      }

      // standard + tower blocks (4 lots)
      const freeIdx = freeBlocks.get(`${i},${j}`);
      for (let k = 0; k < 4; k++) {
        const lx = cx + lotPos[k][0];
        const lz = cz + lotPos[k][1];
        const lot: Lot = { id: lotId++, cx: lx, cz: lz, size: lotSize, bi: i, bj: j, free: false };
        lots.push(lot);
        if (freeIdx === k) {
          lot.free = true;
          const m = new GeoBuilder();
          m.box(2.3, 0.025, 2.3, 0, PAD_H, 0, '#ebdfc6', { ao: 1 });
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            m.box(0.5, 0.03, 0.07, sx * 0.95, PAD_H + 0.02, sz * 1.1, '#c4b08b', { ao: 1 });
            m.box(0.07, 0.03, 0.5, sx * 1.1, PAD_H + 0.02, sz * 0.95, '#c4b08b', { ao: 1 });
          }
          const mesh = new THREE.Mesh(m.build()!, null as unknown as THREE.Material);
          mesh.position.set(lx, 0, lz);
          lot.marker = mesh;
          continue;
        }
        const isTowerLot = type === 'tower' && k === 0 + ((i + j) % 4);
        const dist = central;
        if (isTowerLot) {
          const fl = Math.round(10 + dist * 9 + rng() * 5);
          house({ cx: lx, cz: lz, w: 2.2, d: 2.2, floors: fl, fh: 0.5, style: rng() < 0.55 ? 'glass' : 'modern', roof: 'flat' });
          continue;
        }
        let style: HouseOpts['style'];
        let fl: number;
        const r = rng();
        if (riverside) { style = r < 0.5 ? 'flat' : 'modern'; fl = Math.round(5 + rng() * 4); }
        else if (r < 0.38) { style = 'brick'; fl = Math.round(2 + dist * 2.5 + rng() * 1.5); }
        else if (r < 0.58) { style = 'plaster'; fl = Math.round(2.5 + dist * 2 + rng() * 1.5); }
        else if (r < 0.7) { style = 'painted'; fl = Math.round(2.5 + dist * 2 + rng()); }
        else if (r < 0.84) { style = 'shop'; fl = Math.round(3 + dist * 1.5 + rng()); }
        else { style = 'flat'; fl = Math.round(4 + dist * 3 + rng() * 2); }
        const sc = range(rng, 0.9, 1.0);
        house({ cx: lx, cz: lz, w: 2.35 * sc, d: 2.3 * (rng() < 0.3 ? 0.88 : 1), floors: Math.max(2, fl), style });
      }
      // alley greenery between lots
      if (rng() < 0.7) tree(cx + range(rng, -0.15, 0.15), cz + range(rng, -0.15, 0.15), 0.55, PAD_H);
      // street trees on the pad rim + lamps
      for (const sd of [-1, 1]) {
        if (rng() < 0.55) tree(cx + sd * range(rng, 0.5, 1.4), cz + BLOCK / 2 - 0.18, 0.62);
        if (rng() < 0.55) tree(cx - sd * range(rng, 0.5, 1.4), cz - BLOCK / 2 + 0.18, 0.62);
      }
    }
  }
  // lamps: two per block at opposite corners
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
    const cx = blockCenter(i); const cz = blockCenter(j);
    lamps.push({ x: cx - BLOCK / 2 + 0.2, z: cz - BLOCK / 2 + 0.2 });
    lamps.push({ x: cx + BLOCK / 2 - 0.2, z: cz + BLOCK / 2 - 0.2 });
  }

  return {
    lots, blocks, trees, lamps, wins,
    geoMain: gb.build()!, geoPads: pads.build()!, geoLawn: lawn.build()!,
    buildingCenters: centers,
  };
}
