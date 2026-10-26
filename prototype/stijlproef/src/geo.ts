// Procedural geometry helpers: collect many small parts into one merged,
// vertex-coloured BufferGeometry (position, normal, color, fac, fa).
// `fac`/`fa` drive the facade shader (windows, curtain walls, light dots) without any UVs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Facade pattern ids understood by facade.ts */
export const FAC = { none: 0, punched: 1, curtain: 2, ribbon: 3, dots: 4, tall: 5, shopfront: 6, arch: 7, grid: 8 } as const;

export interface FacOpts {
  p: number; // pattern id
  sx: number; // target column width
  sy: number; // target row height (storey)
  lit?: number; // 0..1 chance a window is lit at night
}

export interface AddOpts {
  /** darkening at the bottom of the part (fake ambient occlusion), 1 = none */
  ao?: number;
  /** height in world units over which the AO gradient fades out */
  aoH?: number;
  /** random-free brightness multiplier */
  tint?: number;
  fac?: FacOpts;
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export class GeoBuilder {
  parts: THREE.BufferGeometry[] = [];
  private xf: THREE.Matrix4 | null = null;

  /** Run `fn` with every added part transformed by translate(x,y,z) * rotY * rotX(tilt) (local coordinates). */
  local(x: number, y: number, z: number, rotY: number, fn: () => void, tiltX = 0, tiltZ = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, tiltZ, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const prev = this.xf;
    this.xf = prev ? prev.clone().multiply(m) : m;
    fn();
    this.xf = prev;
  }

  /** Like local() but with an arbitrary matrix. */
  localM(m: THREE.Matrix4, fn: () => void) {
    const prev = this.xf;
    this.xf = prev ? prev.clone().multiply(m) : m.clone();
    fn();
    this.xf = prev;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, o: AddOpts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (m) g.applyMatrix4(m);
    if (this.xf) g.applyMatrix4(this.xf);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const n = pos.count;
    let minY = Infinity;
    for (let i = 0; i < n; i++) minY = Math.min(minY, pos.getY(i));
    const ao = o.ao ?? 0.8;
    const aoH = o.aoH ?? 1.1;
    const tint = o.tint ?? 1;
    _c.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = THREE.MathUtils.smoothstep(pos.getY(i) - minY, 0, aoH);
      const f = (ao + (1 - ao) * t) * tint;
      col[i * 3] = _c.r * f;
      col[i * 3 + 1] = _c.g * f;
      col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const fac = new Float32Array(n * 4);
    const fa = new Float32Array(n * 4);
    if (o.fac && o.fac.p > 0) {
      // group wall vertices by face normal, then give every vertex the extents of its face
      const groups = new Map<string, { u0: number; u1: number; y0: number; y1: number; idx: number[]; tx: number; tz: number }>();
      for (let i = 0; i < n; i++) {
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        const hl = Math.hypot(nx, nz);
        if (hl < 0.6 || Math.abs(ny) > 0.78) continue;
        const key = `${Math.round(nx * 16)},${Math.round(ny * 16)},${Math.round(nz * 16)}`;
        let gr = groups.get(key);
        if (!gr) { gr = { u0: Infinity, u1: -Infinity, y0: Infinity, y1: -Infinity, idx: [], tx: nz / hl, tz: -nx / hl }; groups.set(key, gr); }
        const u = pos.getX(i) * gr.tx + pos.getZ(i) * gr.tz;
        gr.u0 = Math.min(gr.u0, u); gr.u1 = Math.max(gr.u1, u);
        gr.y0 = Math.min(gr.y0, pos.getY(i)); gr.y1 = Math.max(gr.y1, pos.getY(i));
        gr.idx.push(i);
      }
      for (const gr of groups.values()) {
        const W = gr.u1 - gr.u0, H = gr.y1 - gr.y0;
        if (W < 0.5 || H < 0.5) continue;
        for (const i of gr.idx) {
          fac[i * 4] = o.fac.p; fac[i * 4 + 1] = o.fac.sx; fac[i * 4 + 2] = o.fac.sy; fac[i * 4 + 3] = o.fac.lit ?? 0.5;
          fa[i * 4] = gr.u0; fa[i * 4 + 1] = W; fa[i * 4 + 2] = gr.y0; fa[i * 4 + 3] = H;
        }
      }
    }
    g.setAttribute('fac', new THREE.BufferAttribute(fac, 4));
    g.setAttribute('fa', new THREE.BufferAttribute(fa, 4));
    this.parts.push(g);
    return this;
  }

  /** Box centred horizontally on (x,z), sitting on y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, o: AddOpts = {}, rotY = 0) {
    const seg = Math.max(1, Math.min(6, Math.ceil(h / 1.6)));
    const g = new THREE.BoxGeometry(w, h, d, 1, o.ao === 1 ? 1 : seg, 1);
    _m.compose(_v.set(x, y + h / 2, z), _q.setFromEuler(_e.set(0, rotY, 0)), ONE);
    return this.add(g, color, _m.clone(), o);
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, o: AddOpts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    return this.add(g, color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, o: AddOpts = {}) {
    const g = new THREE.ConeGeometry(r, h, seg);
    return this.add(g, color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), { ao: 1, ...o });
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sx = 1, sy = 1, sz = 1, detail = 1, o: AddOpts = {}) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    return this.add(g, color, m, { ao: 1, ...o });
  }

  /** Triangular prism roof; ridge runs along x when alongX is true, else along z. (x,y,z) = centre of the base. */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, alongX = false, o: AddOpts = {}) {
    const len = alongX ? w : d;
    const span = alongX ? d : w;
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, alongX ? Math.PI / 2 : 0, 0)), ONE);
    return this.add(g, color, _m.clone(), { ao: 1, ...o });
  }

  /** Square-ish pyramid / hip roof. */
  pyramid(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, o: AddOpts = {}) {
    const g = new THREE.ConeGeometry(0.7071, h, 4, 1).rotateY(Math.PI / 4);
    _m.compose(_v.set(x, y + h / 2, z), _q.identity(), new THREE.Vector3(w, 1, d));
    return this.add(g, color, _m.clone(), { ao: 1, ...o });
  }

  /** Cylinder strut between two points. */
  strut(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 5, o: AddOpts = {}) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, m, { ao: 1, ...o });
  }

  /** Tapered strut with different radii at both ends. */
  taper(a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, color: THREE.ColorRepresentation, seg = 6, o: AddOpts = {}) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(rB, rA, len, seg);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return this.add(g, color, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), { ao: 1, ...o });
  }

  /** Oriented box between two points (beams, ribs). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, color: THREE.ColorRepresentation, o: AddOpts = {}) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(w, len, d);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return this.add(g, color, new THREE.Matrix4().compose(mid, q, ONE), { ao: 1, ...o });
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return g;
  }
}

/** Flat (y-up) vertex-coloured triangles: roads, plazas, lawns, markings. Much cheaper than boxes. */
export class FlatBuilder {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();

  tri(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y: number, color: THREE.ColorRepresentation, k = 1) {
    this.c.set(color);
    // make sure the winding faces up
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross > 0) { [bx, cx] = [cx, bx]; [bz, cz] = [cz, bz]; }
    this.pos.push(ax, y, az, bx, y, bz, cx, y, cz);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r * k, this.c.g * k, this.c.b * k);
  }

  /** Rotated rectangle centred on (x,z); `len` along heading yaw (0 = +x). */
  quad(x: number, z: number, len: number, wid: number, yaw: number, y: number, color: THREE.ColorRepresentation, k = 1) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const hl = len / 2, hw = wid / 2;
    const P = (a: number, b: number): [number, number] => [x + a * cs - b * sn, z + a * sn + b * cs];
    const [p0x, p0z] = P(-hl, -hw), [p1x, p1z] = P(hl, -hw), [p2x, p2z] = P(hl, hw), [p3x, p3z] = P(-hl, hw);
    this.tri(p0x, p0z, p1x, p1z, p2x, p2z, y, color, k);
    this.tri(p0x, p0z, p2x, p2z, p3x, p3z, y, color, k);
  }

  /** Segment between two points with a width. */
  seg(x0: number, z0: number, x1: number, z1: number, wid: number, y: number, color: THREE.ColorRepresentation, k = 1, ext = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-4) return;
    this.quad((x0 + x1) / 2, (z0 + z1) / 2, len + ext * 2, wid, Math.atan2(z1 - z0, x1 - x0), y, color, k);
  }

  disc(x: number, z: number, r: number, y: number, color: THREE.ColorRepresentation, n = 20, k = 1) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      this.tri(x, z, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, y, color, k);
    }
  }

  ring(x: number, z: number, r0: number, r1: number, y: number, color: THREE.ColorRepresentation, n = 28, a0 = 0, a1 = Math.PI * 2) {
    for (let i = 0; i < n; i++) {
      const s = a0 + ((a1 - a0) * i) / n, e = a0 + ((a1 - a0) * (i + 1)) / n;
      const A = [x + Math.cos(s) * r0, z + Math.sin(s) * r0], B = [x + Math.cos(s) * r1, z + Math.sin(s) * r1];
      const C = [x + Math.cos(e) * r1, z + Math.sin(e) * r1], D = [x + Math.cos(e) * r0, z + Math.sin(e) * r0];
      this.tri(A[0], A[1], B[0], B[1], C[0], C[1], y, color);
      this.tri(A[0], A[1], C[0], C[1], D[0], D[1], y, color);
    }
  }

  /** Arbitrary simple polygon (earcut via ShapeUtils). */
  poly(pts: [number, number][], y: number, color: THREE.ColorRepresentation, k = 1) {
    const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(v, []);
    for (const t of tris) this.tri(v[t[0]].x, v[t[0]].y, v[t[1]].x, v[t[1]].y, v[t[2]].x, v[t[2]].y, y, color, k);
  }

  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.ColorRepresentation, k = 1) {
    this.quad((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, y, color, k);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const nrm = new Float32Array(this.pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Rounded rectangle outline as a THREE.Shape (centred on origin). */
export function roundedRectShape(w: number, d: number, r: number, shape = new THREE.Shape()): THREE.Shape {
  const x = -w / 2;
  const y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + d - r);
  shape.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + d);
  shape.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Rounded slab lying flat (extruded upwards from y=0). */
export function roundedSlab(w: number, d: number, r: number, h: number, bevel = 0.04): THREE.BufferGeometry {
  const s = roundedRectShape(w - bevel * 2, d - bevel * 2, Math.max(0.01, r - bevel));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });
  g.rotateX(-Math.PI / 2); // extrude along +y
  g.translate(0, bevel, 0);
  return g;
}
