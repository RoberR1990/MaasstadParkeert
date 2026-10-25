// Procedural geometry helpers: collect many small parts into one merged,
// vertex-coloured BufferGeometry (positions + normals + colours only).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface AddOpts {
  /** darkening at the bottom of the part (fake ambient occlusion), 1 = none */
  ao?: number;
  /** height in world units over which the AO gradient fades out */
  aoH?: number;
  /** random-free brightness multiplier */
  tint?: number;
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class GeoBuilder {
  parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, o: AddOpts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (geo.index === null && g === geo) g = geo.clone();
    g.deleteAttribute('uv');
    if (m) g.applyMatrix4(m);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    const ao = o.ao ?? 0.8;
    const aoH = o.aoH ?? 1.1;
    const tint = o.tint ?? 1;
    _c.set(color);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.smoothstep(pos.getY(i) - minY, 0, aoH);
      const f = (ao + (1 - ao) * t) * tint;
      col[i * 3] = _c.r * f;
      col[i * 3 + 1] = _c.g * f;
      col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Box centred horizontally on (x,z), sitting on y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, o: AddOpts = {}, rotY = 0) {
    const seg = Math.max(1, Math.min(10, Math.ceil(h / 0.7)));
    const g = new THREE.BoxGeometry(w, h, d, 1, seg, 1);
    _q.setFromEuler(_e.set(0, rotY, 0));
    _m.compose(new THREE.Vector3(x, y + h / 2, z), _q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, _m.clone(), o);
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, o: AddOpts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    return this.add(g, color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), o);
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sx = 1, sy = 1, sz = 1, detail = 1, o: AddOpts = {}) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    return this.add(g, color, m, { ao: 1, ...o });
  }

  /** Triangular prism roof; ridge runs along x when alongX is true, else along z. */
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
    _q.setFromEuler(_e.set(0, alongX ? Math.PI / 2 : 0, 0));
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, _m.clone(), { ao: 1, ...o });
  }

  /** Cylinder strut between two points. */
  strut(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 5) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, m, { ao: 1 });
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
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
