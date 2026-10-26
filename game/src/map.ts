// Geography of the toy-map: land polygons, the road graph (shared by rendering, cars and people),
// block cells and free building lots. x = east, z = south.
import { BRIDGE_X, TILE_X, TILE_Z0, TILE_Z1, WILLEM_X, Z_N, Z_S } from './config';

export type Pt = [number, number];

// ---------------------------------------------------------------- polygon helpers
class PathB {
  pts: Pt[] = [];
  m(x: number, z: number) { this.pts.push([x, z]); return this; }
  /** arc around (cx,cz) from angle a0 to a1 (radians, z down) */
  arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 8) {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; this.pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    return this;
  }
}
function chaikin(p: Pt[], it = 2): Pt[] {
  let q = p;
  for (let k = 0; k < it; k++) {
    const o: Pt[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q = o;
  }
  return q;
}
export function pointInPoly(x: number, z: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const R = 9; // outer corner radius of the diorama
const PI = Math.PI;
export const LAND_N: Pt[] = new PathB()
  .m(TILE_X, Z_N).m(-TILE_X, Z_N)
  .arc(-TILE_X + R, TILE_Z0 + R, R, PI, PI * 1.5)
  .arc(TILE_X - R, TILE_Z0 + R, R, PI * 1.5, PI * 2).pts;

const PIER_X0 = -35, PIER_X1 = -11, PIER_TIP = 31;
export const LAND_S: Pt[] = new PathB()
  .m(TILE_X, Z_S).m(PIER_X1, Z_S).m(PIER_X1, PIER_TIP + 4)
  .arc(PIER_X1 - 4, PIER_TIP + 4, 4, 0, -PI / 2, 5)
  .arc(PIER_X0 + 4, PIER_TIP + 4, 4, -PI / 2, -PI, 5)
  .m(PIER_X0, Z_S).m(-TILE_X, Z_S)
  .arc(-TILE_X + R, TILE_Z1 - R, R, PI, PI / 2, 8)
  .arc(TILE_X - R, TILE_Z1 - R, R, PI / 2, 0, 8).pts;

export const LAND_I: Pt[] = chaikin([[13, 31.5], [18, 26], [26, 24.5], [54, 24.5], [62, 26], [67, 31.5], [62, 37], [54, 38.5], [26, 38.5], [18, 37]], 2);

// ---------------------------------------------------------------- road graph
export type RoadKind = 'street' | 'avenue' | 'boulevard' | 'quay' | 'bridge' | 'highway' | 'ramp' | 'lane';
export interface RNode { id: number; x: number; z: number; y: number; edges: number[]; boundary?: boolean }
export interface REdge {
  id: number; a: number; b: number; kind: RoadKind; w: number; parking: boolean; oneway: boolean;
  len: number; dx: number; dz: number; lane: number; bridge: boolean;
}
export const ROAD_W: Record<RoadKind, number> = { street: 5.8, avenue: 7.6, boulevard: 16, quay: 6.2, bridge: 7.8, highway: 7.8, ramp: 4.4, lane: 4.6 };
const LANE_OFF: Record<RoadKind, number> = { street: 0.98, avenue: 1.4, boulevard: 4.1, quay: 1.2, bridge: 1.5, highway: 1.95, ramp: 0, lane: 0.9 };

export class Graph {
  nodes: RNode[] = [];
  edges: REdge[] = [];
  private idx = new Map<string, number>();

  node(x: number, z: number, y = 0): number {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    const f = this.idx.get(k);
    if (f !== undefined) { if (y > this.nodes[f].y) this.nodes[f].y = y; return f; }
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, y, edges: [] });
    this.idx.set(k, id);
    return id;
  }
  link(a: number, b: number, kind: RoadKind, o: { parking?: boolean; oneway?: boolean; bridge?: boolean } = {}) {
    if (a === b) return;
    for (const eid of this.nodes[a].edges) { const e = this.edges[eid]; if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return; }
    const A = this.nodes[a], B = this.nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const id = this.edges.length;
    const parking = o.parking ?? (kind === 'street' || kind === 'avenue' || kind === 'quay' || kind === 'lane');
    this.edges.push({ id, a, b, kind, w: ROAD_W[kind], parking, oneway: o.oneway ?? false, len, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len, lane: LANE_OFF[kind], bridge: o.bridge ?? false });
    A.edges.push(id); B.edges.push(id);
  }
  line(pts: (Pt | [number, number, number])[], kind: RoadKind, o: { parking?: boolean; oneway?: boolean; bridge?: boolean } = {}) {
    let prev = -1;
    for (const p of pts) {
      const n = this.node(p[0], p[1], (p as number[])[2] ?? 0);
      if (prev >= 0) this.link(prev, n, kind, o);
      prev = n;
    }
  }
  removeInside(x0: number, z0: number, x1: number, z1: number) {
    const inside = (n: RNode) => n.x >= x0 && n.x <= x1 && n.z >= z0 && n.z <= z1;
    this.edges = this.edges.filter((e) => !(inside(this.nodes[e.a]) && inside(this.nodes[e.b])));
  }
  removeEdgesBetween(x0: number, z0: number, x1: number, z1: number, kind?: RoadKind) {
    // remove edges whose midpoint lies in the rect
    this.edges = this.edges.filter((e) => {
      if (kind && e.kind !== kind) return true;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      return !(mx >= x0 && mx <= x1 && mz >= z0 && mz <= z1);
    });
  }
  /** insert nodes that lie on the interior of an edge into that edge (so crossings connect) */
  splitAtNodes() {
    let again = true;
    while (again) {
      again = false;
      outer: for (const e of this.edges) {
        const A = this.nodes[e.a], B = this.nodes[e.b];
        for (const n of this.nodes) {
          if (n.id === e.a || n.id === e.b) continue;
          const t = ((n.x - A.x) * e.dx + (n.z - A.z) * e.dz);
          if (t < 0.5 || t > e.len - 0.5) continue;
          const px = A.x + e.dx * t, pz = A.z + e.dz * t;
          if (Math.hypot(px - n.x, pz - n.z) < 0.06) {
            this.edges = this.edges.filter((q) => q !== e);
            const o = { parking: e.parking, oneway: e.oneway, bridge: e.bridge };
            n.y = Math.max(n.y, A.y + (B.y - A.y) * (t / e.len));
            this.link(e.a, n.id, e.kind, o); this.link(n.id, e.b, e.kind, o);
            again = true; break outer;
          }
        }
      }
    }
  }
  /** drop unused nodes, rebuild adjacency + ids */
  finish() {
    const used = new Set<number>();
    for (const e of this.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map<number, number>();
    const nodes: RNode[] = [];
    for (const n of this.nodes) if (used.has(n.id)) { map.set(n.id, nodes.length); nodes.push({ ...n, id: nodes.length, edges: [] }); }
    this.nodes = nodes;
    this.edges = this.edges.map((e, i) => {
      const ne = { ...e, id: i, a: map.get(e.a)!, b: map.get(e.b)! };
      this.nodes[ne.a].edges.push(i); this.nodes[ne.b].edges.push(i);
      return ne;
    });
    for (const n of this.nodes) {
      if (n.edges.length === 1 && (Math.abs(n.x) >= TILE_X - 3 || n.z <= TILE_Z0 + 3 || n.z >= TILE_Z1 - 3)) n.boundary = true;
    }
    // elevation of nodes along edges that were split is already stored on the nodes
  }
  other(e: REdge, n: number) { return e.a === n ? e.b : e.a; }
}

export function buildGraph(): Graph {
  const g = new Graph();
  const XN = [-74, -50, -26, 26, 50, 76];
  const ZN = [-64, -42, -18, 4];
  // ---- north bank grid
  for (const x of XN) g.line([[x, -84], ...ZN.map((z) => [x, z] as Pt)], 'street');
  g.line([[-104, -64], ...[-74, -50, -26, 26, 50, 76].map((x) => [x, -64] as Pt), [104, -64]], 'street');
  g.line([[-104, -42], [-90, -42], [-74, -42], [-50, -42], [-26, -42], [-12, -42]], 'avenue');
  g.line([[12, -42], [26, -42], [50, -42], [76, -42], [104, -42]], 'avenue');
  g.line([[-104, -18], ...[-74, -50, -26].map((x) => [x, -18] as Pt), [0, -18], [26, -18], [50, -18], [76, -18], [104, -18]], 'street');
  g.line([[-104, 4], [-74, 4], [-50, 4], [-26, 4], [0, 4], [26, 4], [50, 4], [76, 4], [104, 4]], 'quay');
  // Coolsingel boulevard
  g.line([[0, -30], [0, -18], [0, 4]], 'boulevard', { parking: false });
  // station square bus road + connection to Hofplein
  g.line([[-26, -56], [0, -56], [26, -56]], 'street', { parking: false });
  g.line([[0, -56], [0, -54]], 'avenue', { parking: false });
  g.removeInside(-27, -85, 27, -57);
  // Hofplein roundabout (counter-clockwise seen from above)
  const ring: number[] = [];
  const RR = 12, N = 16;
  for (let i = 0; i < N; i++) { const a = (-i / N) * Math.PI * 2 + Math.PI / 2; ring.push(g.node(Math.cos(a) * RR, -42 + Math.sin(a) * RR)); }
  for (let i = 0; i < N; i++) g.link(ring[i], ring[(i + 1) % N], 'ramp', { oneway: true, parking: false });
  // Het Park: no quay road in front of the Euromast
  g.removeEdgesBetween(-73, 3, -51, 5);
  // ---- Kleinpolderplein cloverleaf (A13 / A20 look-alike)
  const C: Pt = [-88, -70];
  const dropRect = [-106, -86, -70, -56] as const;
  g.removeInside(dropRect[0], dropRect[1], dropRect[2], dropRect[3]);
  const H = 3.4;
  const yAt = (d: number) => H * Math.max(0, Math.min(1, (16 - Math.abs(d)) / 9));
  // E-W highway at ground level, N-S highway elevated
  g.line([[-104, C[1], 0], [C[0] - 14, C[1], 0], [C[0] - 6.5, C[1], 0], [C[0], C[1], 0], [C[0] + 6.5, C[1], 0], [C[0] + 14, C[1], 0], [-74, C[1], 0]], 'highway', { parking: false });
  g.line([[-74, C[1]], [-74, -64]], 'avenue');
  const nsz = [-84, -78, -73, -70, -67, -62, -56].map((z) => z);
  g.line(nsz.map((z) => [C[0], z, yAt(z - C[1])] as [number, number, number]), 'highway', { parking: false, bridge: true });
  g.line([[C[0], -56, 0], [C[0], -42, 0]], 'avenue');
  // four leaf loops, rotated copies of the NE loop
  const rot = (p: Pt, k: number): Pt => { let [x, z] = p; for (let i = 0; i < k; i++) { [x, z] = [z, -x]; } return [x, z]; };
  const loopLocal: Pt[] = [[0, -6.5], [2.2, -8.2], [4, -9.5]];
  const lc: Pt = [9.5, -9.5], lr = 5.5;
  for (let i = 1; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI * 1.5; loopLocal.push([lc[0] + Math.cos(a) * lr, lc[1] + Math.sin(a) * lr]); }
  loopLocal.push([6.5, -3], [4.8, -1.9]);
  // loop: west point (4,-9.5) heading north then clockwise: angle PI -> 2.5PI. The last circle point is the south point (heading west).
  for (let k = 0; k < 4; k++) {
    const pts = loopLocal.map((p) => rot(p, k));
    const n = pts.length;
    const y0 = k % 2 === 0 ? H : 0, y1 = k % 2 === 0 ? 0 : H;
    const nodes = pts.map((p, i) => g.node(C[0] + p[0], C[1] + p[1], y0 + (y1 - y0) * (i / (n - 1))));
    for (let i = 0; i < n - 1; i++) g.link(nodes[i], nodes[i + 1], 'ramp', { oneway: true, parking: false });
    // the loop ends on the centre line of the next arm
    const armPt = rot([6.5, 0], k);
    g.link(nodes[n - 1], g.node(C[0] + armPt[0], C[1] + armPt[1], y1), 'ramp', { oneway: true, parking: false });
  }

  // ---- bridges
  g.line([[BRIDGE_X, 4, 0], [BRIDGE_X, 10, 1.8], [BRIDGE_X, 15, 2.6], [BRIDGE_X, 41, 2.6], [BRIDGE_X, 46, 1.8], [BRIDGE_X, 52, 0]], 'bridge', { parking: false, bridge: true });
  g.line([[WILLEM_X, 4, 0], [WILLEM_X, 9, 1.6], [WILLEM_X, 12, 2.2], [WILLEM_X, 22, 2.2], [WILLEM_X, 26, 0.9], [WILLEM_X, 31.5, 0]], 'bridge', { parking: false, bridge: true });
  g.line([[30, 31.5, 0], [30, 37, 0.5], [30, 40, 1.1], [30, 44, 1.1], [30, 47, 0.5], [30, 52, 0]], 'bridge', { parking: false, bridge: true });
  // Noordereiland street
  g.line([[17, 31.5], [30, 31.5], [WILLEM_X, 31.5], [63, 31.5]], 'lane');

  // ---- south bank
  const XS = [-76, -50, -23, 0, 30, 52, 102];
  g.line([[-104, 52], ...XS.map((x) => [x, 52] as Pt), [104, 52]], 'quay');
  g.line([[-50, 68], [-23, 68], [0, 68]], 'street');
  g.line([[-104, 82], ...XS.map((x) => [x, 82] as Pt), [104, 82]], 'street');
  for (const x of XS) g.line([[x, 52], [x, 68], [x, 82]], 'street', x === 0 ? { parking: false } : {});
  g.line([[-23, 52], [-23, 44], [-23, 38]], 'street');
  g.line([[0, 82], [0, 84]], 'street');

  g.splitAtNodes();
  g.finish();
  return g;
}

// ---------------------------------------------------------------- block cells
export type CellType = 'rows' | 'slab' | 'modern' | 'towers' | 'park' | 'courts' | 'special' | 'island' | 'pier' | 'kop';
export interface Cell {
  x0: number; z0: number; x1: number; z1: number; type: CellType;
  inset?: [number, number, number, number]; // left right top bottom (defaults = street + pavement)
  seed: number; name?: string;
}
export const INS = 4.5;
const c = (x0: number, z0: number, x1: number, z1: number, type: CellType, o: Partial<Cell> = {}): Cell => ({ x0, z0, x1, z1, type, seed: Math.round(Math.abs(x0 * 7 + z0 * 13)), ...o });
export const CELLS: Cell[] = [
  // north bank, row A (z -86..-64)
  c(-74, -86, -50, -64, 'rows'), c(-50, -86, -26, -64, 'slab'), c(50, -86, 76, -64, 'rows'), c(76, -86, 106, -64, 'modern'),
  // row B (-64..-42)
  c(-106, -56, -74, -42, 'rows'), c(-74, -64, -50, -42, 'modern'), c(-50, -64, -26, -42, 'rows'), c(26, -64, 50, -42, 'rows'),
  c(50, -64, 76, -42, 'slab'), c(76, -64, 106, -42, 'park'),
  // row C (-42..-18)
  c(-106, -42, -74, -18, 'slab'), c(-74, -42, -50, -18, 'rows'), c(-50, -42, -26, -18, 'rows'),
  c(-26, -30, 0, -18, 'rows', { inset: [INS, 9.5, 2, INS] }), c(0, -30, 26, -18, 'rows', { inset: [9.5, INS, 2, INS] }),
  c(26, -42, 50, -18, 'towers'), c(50, -42, 76, -18, 'rows'), c(76, -42, 106, -18, 'modern'),
  // row D (-18..4)
  c(-106, -18, -74, 4, 'rows'), c(0, -18, 26, 4, 'rows', { inset: [9.5, INS, INS, INS] }), c(76, -18, 106, 4, 'modern'),
  // south bank west (30 deep cells) and Kop van Zuid (thin cells, extra street at z=68)
  c(-106, 52, -76, 82, 'rows'), c(-76, 52, -50, 82, 'rows'),
  c(-50, 68, -23, 82, 'slab'), c(-23, 68, 0, 82, 'rows'),
  c(0, 52, 30, 82, 'modern'), c(30, 52, 52, 82, 'slab'),
];

/** Free building lots: each is a 2x2 cluster of 6x6 sub-lots (garage takes all four). */
export const LOT_SIZE = 12;
export const LOT_CENTRES: Pt[] = [
  [-62, -30], [-38, -53], [38, -53], [63, -30], [16, -7], [-88, -8], [63, -75], [10.9, 62.9], [-95.2, 62.9], [-65.1, 62.9],
];
