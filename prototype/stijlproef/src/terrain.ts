// Terrain: land slabs with strata edges, water body + shore-distance field, roads from the graph.
import * as THREE from 'three';
import { FlatBuilder, GeoBuilder } from './geo';
import { Graph, LAND_I, LAND_N, LAND_S, Pt, REdge, RNode, pointInPoly } from './map';
import { COL } from './palette';
import { MARK_Y, ROAD_Y, TILE_X, TILE_Z0, TILE_Z1, WATER_Y, Z_N, Z_S } from './config';
import { mulberry32 } from './util';

// ---------------------------------------------------------------- land
const OUTER: [number, string][] = [
  [0, '#a9c56e'], [-0.42, '#8fae5d'], [-0.48, '#9a7452'], [-3.0, '#7d5a42'], [-3.06, '#746d75'], [-7, '#5a545c'], [-11, '#443f4a'],
];
const QUAY: [number, string][] = [
  [0, '#ece3ce'], [-0.22, '#d9cfb7'], [WATER_Y + 0.15, '#bdb29b'], [WATER_Y - 0.1, '#6d807c'], [-11, '#3e5558'],
];

export function buildLand(): { top: THREE.Mesh; sides: THREE.Mesh } {
  const polys = [LAND_N, LAND_S, LAND_I];
  // ---- top faces
  const topGeos: THREE.BufferGeometry[] = [];
  for (const poly of polys) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], -p[1])));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.05; uv[i * 2 + 1] = p.getZ(i) * 0.05; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    topGeos.push(g.index ? g.toNonIndexed() : g);
  }
  const topMerged = mergeNonIndexed(topGeos);
  const top = new THREE.Mesh(topMerged, new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 0.95 }));
  top.receiveShadow = true;

  // ---- side walls
  const rng = mulberry32(99);
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const poly of polys) {
    // orientation: we want outward facing quads
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const pts = area > 0 ? poly : [...poly].reverse();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const outer = Math.abs(mx) > TILE_X - 1.2 || mz < TILE_Z0 + 1.2 || mz > TILE_Z1 - 1.2 || (Math.abs(a[0]) > TILE_X - 1.2 && Math.abs(b[0]) > TILE_X - 1.2) || (Math.abs(mz) > 84 && (mz < 0 ? mz < TILE_Z0 + 9 : mz > TILE_Z1 - 9));
      const layers = outer ? OUTER : QUAY;
      const sh = 0.93 + rng() * 0.12;
      for (let k = 0; k < layers.length - 1; k++) {
        const [y0, c0] = layers[k], [y1, c1] = layers[k + 1];
        const jit = outer && k > 2 ? (rng() - 0.5) * 0.0 : 0;
        const v = (p: Pt, y: number, cc: string) => { pos.push(p[0], y, p[1]); c.set(cc).multiplyScalar(sh); col.push(c.r, c.g, c.b); };
        void jit;
        // quad a,b (top) / a,b (bottom): triangle winding so that the normal faces outward (right of travel direction in z-down space)
        v(a, y0, c0); v(a, y1, c1); v(b, y0, c0);
        v(b, y0, c0); v(a, y1, c1); v(b, y1, c1);
      }
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sg.computeVertexNormals();
  const sides = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  sides.castShadow = true; sides.receiveShadow = true;
  return { top, sides };
}

function mergeNonIndexed(gs: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of gs) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), nn = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++, o++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
      nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], o * 3);
      uv.set([u.getX(i), u.getY(i)], o * 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------- water
export const WATER_X0 = -TILE_X, WATER_X1 = TILE_X, WATER_Z0 = Z_N - 1.5, WATER_Z1 = Z_S + 1.5;
const RES = 0.5;

/** shore distance texture: R = distance to land (0..10 units) */
export function shoreTexture() {
  const W = Math.round((WATER_X1 - WATER_X0) / RES), H = Math.round((WATER_Z1 - WATER_Z0) / RES);
  const land = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = WATER_X0 + (i + 0.5) * RES, z = WATER_Z0 + (j + 0.5) * RES;
    land[j * W + i] = pointInPoly(x, z, LAND_N) || pointInPoly(x, z, LAND_S) || pointInPoly(x, z, LAND_I) ? 1 : 0;
  }
  const d = new Float32Array(W * H);
  const INF = 1e6;
  for (let k = 0; k < W * H; k++) d[k] = land[k] ? 0 : INF;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
    if (j > 0) d[k] = Math.min(d[k], d[k - W] + 1);
    if (i > 0 && j > 0) d[k] = Math.min(d[k], d[k - W - 1] + 1.414);
    if (i < W - 1 && j > 0) d[k] = Math.min(d[k], d[k - W + 1] + 1.414);
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    if (i < W - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
    if (j < H - 1) d[k] = Math.min(d[k], d[k + W] + 1);
    if (i < W - 1 && j < H - 1) d[k] = Math.min(d[k], d[k + W + 1] + 1.414);
    if (i > 0 && j < H - 1) d[k] = Math.min(d[k], d[k + W - 1] + 1.414);
  }
  const data = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) {
    const v = Math.min(255, Math.round(((d[k] * RES) / 10) * 255));
    data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** vertical end walls of the water body at x = +-TILE_X */
export function waterSkirts() {
  const gb: number[] = [], cc: number[] = [];
  const c = new THREE.Color();
  const rings: [number, string][] = [[WATER_Y, '#2f7a84'], [-3, '#25606c'], [-11, '#1a3a48']];
  for (const sx of [-1, 1]) {
    const x = sx * TILE_X;
    for (let k = 0; k < rings.length - 1; k++) {
      const [y0, c0] = rings[k], [y1, c1] = rings[k + 1];
      const v = (z: number, y: number, s: string) => { gb.push(x, y, z); c.set(s); cc.push(c.r, c.g, c.b); };
      v(Z_N, y0, c0); v(Z_N, y1, c1); v(Z_S, y0, c0);
      v(Z_S, y0, c0); v(Z_N, y1, c1); v(Z_S, y1, c1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(gb, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------- roads
export interface Bay { x: number; z: number; yaw: number; side: number; edge: number; y: number }
export interface LampSpec { x: number; z: number; y: number }

export const isElevated = (g: Graph, e: REdge) => e.bridge || g.nodes[e.a].y > 0.05 || g.nodes[e.b].y > 0.05;

export interface RoadOut {
  asphalt: THREE.BufferGeometry;
  marks: THREE.BufferGeometry;
  decks: THREE.BufferGeometry | null;
  bays: Bay[];
  lamps: LampSpec[];
}

export function slab(gb: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, w: number, thick: number, color: THREE.ColorRepresentation, lift = 0) {
  const f = b.clone().sub(a);
  const len = f.length();
  f.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(f, up);
  if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
  r.normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const m = new THREE.Matrix4().makeBasis(r, u, f);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5).addScaledVector(u, lift));
  gb.add(new THREE.BoxGeometry(w, thick, len + 0.02), color, m, { ao: 1 });
}

export function buildRoads(g: Graph, blocked: (x: number, z: number) => boolean, bridgeColor: (x: number) => string): RoadOut {
  const asp = new FlatBuilder();
  const mk = new FlatBuilder();
  const decks = new GeoBuilder();
  const bays: Bay[] = [];
  const lamps: LampSpec[] = [];
  const rng = mulberry32(2026);
  const W = COL.marking;
  const nodeHasBoulevard = (n: RNode) => n.edges.some((id) => g.edges[id].kind === 'boulevard');
  const trimAt = (e: REdge, n: RNode) => (e.kind !== 'boulevard' && nodeHasBoulevard(n) ? 7.4 : 0);

  for (const e of g.edges) {
    const A = g.nodes[e.a], B = g.nodes[e.b];
    const elevated = isElevated(g, e);
    const len = e.len;
    const tA = trimAt(e, A), tB = trimAt(e, B);
    const ax = A.x + e.dx * tA, az = A.z + e.dz * tA, bx = B.x - e.dx * tB, bz = B.z - e.dz * tB;
    const k = 0.94 + rng() * 0.1;
    if (elevated) {
      const sa = new THREE.Vector3(A.x, A.y - 0.5, A.z), sb = new THREE.Vector3(B.x, B.y - 0.5, B.z);
      const gc = e.kind === 'highway' || e.kind === 'ramp' ? '#b9b5ac' : bridgeColor((A.x + B.x) / 2);
      slab(decks, sa, sb, e.w, 0.8, gc);
      slab(decks, new THREE.Vector3(A.x, A.y - 0.04, A.z), new THREE.Vector3(B.x, B.y - 0.04, B.z), e.w - (e.kind === 'ramp' ? 0.7 : 1.4), 0.08, '#454a52');
      // kerbs / rails
      if (e.kind !== 'ramp') for (const s of [-1, 1]) {
        const nx = -e.dz * s * (e.w / 2 - 0.25), nz = e.dx * s * (e.w / 2 - 0.25);
        slab(decks, new THREE.Vector3(A.x + nx, A.y + 0.25, A.z + nz), new THREE.Vector3(B.x + nx, B.y + 0.25, B.z + nz), 0.16, 0.55, gc);
      }
      // dashes
      if (e.kind !== 'ramp') {
        const n = Math.floor(len / 3);
        for (let i = 0; i < n; i++) {
          const t0 = (i + 0.25) / n, t1 = (i + 0.7) / n;
          const p0 = new THREE.Vector3(A.x + (B.x - A.x) * t0, A.y + (B.y - A.y) * t0 + 0.02, A.z + (B.z - A.z) * t0);
          const p1 = new THREE.Vector3(A.x + (B.x - A.x) * t1, A.y + (B.y - A.y) * t1 + 0.02, A.z + (B.z - A.z) * t1);
          slab(decks, p0, p1, 0.12, 0.02, W);
        }
      }
      // pillars where the deck floats above land
      const steps = Math.floor(len / 6);
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, y = A.y + (B.y - A.y) * t;
        const water = z > Z_N + 0.5 && z < Z_S - 0.5 && !(e.kind === 'ramp' || e.kind === 'highway');
        if (y > 0.6 && !water && !pointInPoly(x, z, LAND_I) === false) { /* fallthrough */ }
        if (y > 0.6 && !water) decks.box(Math.min(1.4, e.w * 0.3), y - 0.9, 1.1, x, 0, z, '#bdb8ac', { ao: 0.8 });
      }
      continue;
    }
    const ww = e.w;
    if (e.kind === 'boulevard') {
      // two carriageways with a tram strip between them
      for (const s of [-1, 1]) {
        const nx = -e.dz * s * 4.1, nz = e.dx * s * 4.1;
        asp.seg(A.x + nx, A.z + nz, B.x + nx, B.z + nz, 4.6, ROAD_Y, COL.road, k);
      }
      asp.seg(A.x, A.z, B.x, B.z, 3.2, ROAD_Y - 0.01, '#8a8a7c', 1); // tram bed
    } else {
      asp.seg(ax, az, bx, bz, ww, ROAD_Y, e.kind === 'highway' ? '#3f444c' : COL.road, k);
    }
    // ---- markings
    const ux = e.dx, uz = e.dz;
    const point = (t: number, off = 0): [number, number] => [A.x + ux * t - uz * off, A.z + uz * t + ux * off];
    const yaw = Math.atan2(uz, ux);
    const x0 = tA + 4.6, x1 = len - tB - 4.6;
    if (e.kind !== 'ramp' && e.kind !== 'boulevard' && x1 > x0) {
      const n = Math.max(1, Math.floor((x1 - x0) / 3.2));
      for (let i = 0; i < n; i++) {
        const t = x0 + ((i + 0.5) / n) * (x1 - x0);
        const [px, pz] = point(t);
        mk.quad(px, pz, 1.5, e.kind === 'highway' ? 0.16 : 0.13, yaw, MARK_Y, W);
      }
    }
    if (e.kind === 'highway') {
      for (const s of [-1, 1]) { const [px, pz] = point(len / 2, s * 3.5); mk.quad(px, pz, len, 0.14, yaw, MARK_Y, '#f4f0e4'); }
    }
    if (e.kind === 'boulevard') {
      // rails
      for (const s of [-0.7, 0.7]) { const [px, pz] = point(len / 2, s); mk.quad(px, pz, len, 0.09, yaw, MARK_Y + 0.004, '#c9ccd0'); }
      // sleepers
      const n = Math.floor(len / 1.6);
      for (let i = 0; i < n; i++) { const [px, pz] = point((i + 0.5) * (len / n)); mk.quad(px, pz, 0.14, 1.9, yaw, MARK_Y - 0.002, '#6b5e50'); }
    }
    // crosswalks at junctions
    const cross = (n: RNode, atStart: boolean) => {
      if (n.edges.length < 3 || e.kind === 'ramp' || e.kind === 'boulevard' || e.kind === 'highway') return;
      const trim = atStart ? tA : tB;
      const d = trim + ww / 2 + 1.35;
      if (d > len - 1) return;
      const cnt = Math.max(3, Math.floor((ww - 0.8) / 0.85));
      for (let i = 0; i < cnt; i++) {
        const off = (i - (cnt - 1) / 2) * 0.85;
        const t = atStart ? d : len - d;
        const [px, pz] = point(t, off);
        mk.quad(px, pz, 1.5, 0.42, yaw, MARK_Y, W);
      }
    };
    cross(A, true); cross(B, false);

    // ---- parking bays
    if (e.parking) {
      const startT = tA + ww / 2 + 3.7, endT = len - tB - ww / 2 - 3.7;
      const pitch = 2.55;
      const nb = Math.floor((endT - startT) / pitch);
      for (const s of [-1, 1]) {
        const off = s * 2.3 * (e.kind === 'avenue' ? 1.2 : 1);
        let drawn = 0;
        for (let i = 0; i < nb; i++) {
          const t = startT + (i + 0.5) * pitch + ((endT - startT) - nb * pitch) / 2;
          const [px, pz] = point(t, off);
          if (blocked(px, pz)) continue;
          bays.push({ x: px, z: pz, yaw: yaw + (s > 0 ? 0 : Math.PI), side: s, edge: e.id, y: ROAD_Y });
          drawn++;
          // stall divider
          const [lx, lz] = point(t - pitch / 2, off + s * -0.05);
          mk.quad(lx, lz, 0.1, 1.15, yaw, MARK_Y, '#ddd3bf');
        }
        if (drawn > 0) {
          const [px, pz] = point((startT + endT) / 2, off - s * 0.62);
          mk.quad(px, pz, endT - startT, 0.08, yaw, MARK_Y, '#ddd3bf');
        }
      }
    }
    // ---- lamps
    if (e.kind !== 'boulevard' && e.kind !== 'ramp' && e.kind !== 'highway' && len > 14) {
      const spacing = 12;
      const nl = Math.floor((len - 10) / spacing);
      for (let i = 0; i <= nl; i++) {
        const t = 5 + (len - 10) * (nl ? i / nl : 0.5);
        const side = (i + e.id) % 2 ? 1 : -1;
        const [px, pz] = point(t, side * (ww / 2 + 0.7));
        if (blocked(px, pz)) continue;
        lamps.push({ x: px, z: pz, y: 0 });
      }
    }
  }

  // ---- junction patches
  for (const n of g.nodes) {
    const es = n.edges.map((id) => g.edges[id]).filter((e) => !isElevated(g, e));
    if (!es.length) continue;
    if (es.some((e) => e.kind === 'boulevard')) continue;
    if (n.y > 0.05) continue;
    const wmax = Math.max(...es.map((e) => e.w));
    const axisAligned = es.every((e) => Math.abs(e.dx) > 0.985 || Math.abs(e.dz) > 0.985);
    const straight = es.length === 2 && Math.abs(es[0].dx * es[1].dx + es[0].dz * es[1].dz) > 0.995;
    if (straight && es[0].kind === es[1].kind) continue;
    if (es.length === 1) { asp.disc(n.x, n.z, wmax / 2, ROAD_Y, COL.road, 14); continue; }
    if (axisAligned && es.length >= 3) asp.quad(n.x, n.z, wmax, wmax, 0, ROAD_Y, COL.road);
    else asp.disc(n.x, n.z, wmax / 2, ROAD_Y, es.some((e) => e.kind === 'highway') ? '#3f444c' : COL.road, 14);
  }

  return { asphalt: asp.build()!, marks: mk.build()!, decks: decks.build(), bays, lamps };
}
