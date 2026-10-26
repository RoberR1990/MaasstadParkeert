// Cars on the road graph. Parked cars fill the bays according to parkeerdruk; moving cars drive on the right,
// "searchers" keep turning right (circling the block) and carry a "?" bubble. Event hooks: hotspot, blockers, routed cars.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GeoBuilder } from './geo';
import type { Bay } from './world';
import type { Graph, REdge } from './map';
import { CAR_COLORS } from './palette';
import { CAR_L, CAR_W, ROAD_Y } from './config';
import { bubbleTexture } from './tex';
import { canLeave } from './route';
import { clamp, lerp, mulberry32, pick, range, easeOutBack } from './util';
import { WIJKEN, wijkAt } from './wijken';

function carGeometries(kind: 0 | 1) {
  const body = new GeoBuilder();
  const det = new GeoBuilder();
  const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
  const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  const L = CAR_L, W = CAR_W;
  if (kind === 0) {
    body.add(rb(L, 0.46, W, 0.16), '#ffffff', T(0, 0.43, 0), { ao: 0.7, aoH: 0.5 });
    body.add(rb(1.04, 0.1, 0.8, 0.05), '#ffffff', T(-0.12, 1.0, 0), { ao: 1 });
    body.add(rb(1.1, 0.34, 0.84, 0.12), '#ffffff', T(-0.12, 0.76, 0), { ao: 0.9, aoH: 0.4 });
    det.add(rb(1.12, 0.22, 0.88, 0.08), '#222e3a', T(-0.12, 0.78, 0), { ao: 1 });
  } else {
    body.add(rb(L, 0.5, W, 0.14), '#ffffff', T(0, 0.45, 0), { ao: 0.7, aoH: 0.5 });
    body.add(rb(1.4, 0.4, 0.86, 0.12), '#ffffff', T(-0.3, 0.88, 0), { ao: 0.9, aoH: 0.4 });
    body.add(rb(1.36, 0.08, 0.8, 0.05), '#ffffff', T(-0.3, 1.12, 0), { ao: 1 });
    det.add(rb(1.42, 0.26, 0.9, 0.08), '#222e3a', T(-0.28, 0.9, 0), { ao: 1 });
  }
  for (const sx of [-0.66, 0.66]) for (const sz of [-W / 2 + 0.02, W / 2 - 0.02]) {
    det.add(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 10).rotateX(Math.PI / 2), '#1c1f24', T(sx, 0.2, sz), { ao: 1 });
    det.add(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8).rotateX(Math.PI / 2), '#aeb6bd', T(sx, 0.2, sz), { ao: 1 });
  }
  for (const sz of [-0.34, 0.34]) {
    det.add(new THREE.BoxGeometry(0.06, 0.12, 0.2), '#fff4cc', T(L / 2 - 0.01, 0.5, sz), { ao: 1 });
    det.add(new THREE.BoxGeometry(0.06, 0.12, 0.2), '#b83a3a', T(-L / 2 + 0.01, 0.5, sz), { ao: 1 });
  }
  return { body: body.build()!, det: det.build()! };
}

class Fleet {
  body: THREE.InstancedMesh;
  det: THREE.InstancedMesh;
  constructor(public count: number, geos: { body: THREE.BufferGeometry; det: THREE.BufferGeometry }) {
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.05, envMapIntensity: 1.3 });
    const dm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1 });
    this.body = new THREE.InstancedMesh(geos.body, bm, count);
    this.det = new THREE.InstancedMesh(geos.det, dm, count);
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.det.castShadow = false;
    this.body.frustumCulled = false; this.det.frustumCulled = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) { this.body.setMatrixAt(i, m); this.det.setMatrixAt(i, m); this.body.setColorAt(i, new THREE.Color('#ffffff')); }
  }
  set(i: number, m: THREE.Matrix4) { this.body.setMatrixAt(i, m); this.det.setMatrixAt(i, m); }
  flush() { this.body.instanceMatrix.needsUpdate = true; this.det.instanceMatrix.needsUpdate = true; }
}

type Mode = 'wander' | 'search' | 'route';
interface Agent {
  active: boolean; mode: Mode; e: number; fwd: boolean; s: number;
  speed: number; maxSpeed: number;
  pos: THREE.Vector3; yaw: number; init: boolean;
  color: THREE.Color; shape: 0 | 1; scale: number; scaleT: number;
  timer: number; retire: boolean; sprite: number; bubble: '?' | '!' | 'P' | null;
  path: number[]; pi: number; onArrive: 'retire' | 'search';
  despawn: boolean; wi: number;
}
export interface Hotspot { x: number; z: number; r: number; k: number }
export interface Blocker { x: number; z: number; r: number }

const SEARCH_KINDS = new Set(['street', 'avenue', 'quay', 'lane']);

export class CarSystem {
  group = new THREE.Group();
  private parked: Fleet[];
  private moving: Fleet[];
  private bays: Bay[];
  private rank: Float32Array;
  private bayScale: Float32Array;
  private bayVel: Float32Array;
  private bayTarget: Uint8Array;
  private bayYaw: Float32Array;
  private bayShape: Uint8Array;
  private bayIdx: Int32Array;
  private bayOff: Float32Array;
  private agents: Agent[] = [];
  private sprites: THREE.Sprite[] = [];
  private mats: Record<'?' | '!' | 'P', THREE.Texture>;
  private rng = mulberry32(777);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private sv = new THREE.Vector3(1, 1, 1);
  private yAxis = new THREE.Vector3(0, 1, 0);
  private pressure = 0.6;
  /** per wijk (order of WIJKEN): demand/supply and search time straight from the simulation */
  private wState = WIJKEN.map(() => ({ bez: 0.8, search: 2 }));
  private bayWijk: Int8Array;
  private edgeWijk: Int8Array;
  wSearching: number[] = WIJKEN.map(() => 0);
  private reliefs: { x: number; z: number; r: number; k: number }[] = [];
  private searchEdges: REdge[] = [];
  private centralW: number[] = [];
  hotspot: Hotspot | null = null;
  blockers: Blocker[] = [];
  searching = 0;
  parkedCount = 0;
  private parkedDirty = true;
  private spawnTimer = 0;
  private snap = true;
  private time = 0;
  private camDist = 150;
  private avgRelief = 0;

  constructor(private g: Graph, bays: Bay[]) {
    this.bays = bays;
    const geoA = carGeometries(0), geoB = carGeometries(1);
    const nA = bays.length, nM = 260;
    this.parked = [new Fleet(nA, geoA), new Fleet(nA, geoB)];
    this.moving = [new Fleet(nM, geoA), new Fleet(nM, geoB)];
    for (const f of [...this.parked, ...this.moving]) this.group.add(f.body, f.det);
    const n = bays.length;
    this.rank = new Float32Array(n); this.bayScale = new Float32Array(n); this.bayVel = new Float32Array(n);
    this.bayTarget = new Uint8Array(n); this.bayYaw = new Float32Array(n); this.bayShape = new Uint8Array(n);
    this.bayIdx = new Int32Array(n); this.bayOff = new Float32Array(n);
    const idx = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const r = Math.floor(this.rng() * (i + 1)); [idx[i], idx[r]] = [idx[r], idx[i]]; }
    idx.forEach((bay, rk) => (this.rank[bay] = rk / n));
    for (let i = 0; i < n; i++) {
      const sh = this.rng() < 0.35 ? 1 : 0;
      this.bayShape[i] = sh;
      this.parked[sh].body.setColorAt(i, new THREE.Color(pick(this.rng, CAR_COLORS)));
      this.bayYaw[i] = -bays[i].yaw + (this.rng() - 0.5) * 0.07;
      this.bayOff[i] = (this.rng() - 0.5) * 0.3;
    }
    for (let i = 0; i < nM; i++) for (const f of this.moving) f.body.setColorAt(i, new THREE.Color(pick(this.rng, CAR_COLORS)));
    for (let i = 0; i < nM; i++) {
      this.agents.push({
        active: false, mode: 'wander', e: 0, fwd: true, s: 0, speed: 0, maxSpeed: 4, pos: new THREE.Vector3(), yaw: 0, init: false,
        color: new THREE.Color(), shape: 0, scale: 0, scaleT: 1, timer: 0, retire: false, sprite: -1, bubble: null,
        path: [], pi: 0, onArrive: 'retire', despawn: false, wi: -1,
      });
    }
    this.mats = {
      '?': bubbleTexture('?', '#fff8ea', '#d9674f'),
      '!': bubbleTexture('!', '#fff3cf', '#d9941a'),
      P: bubbleTexture('P', '#e9f6ec', '#2f8a63'),
    };
    this.searchEdges = g.edges.filter((e) => SEARCH_KINDS.has(e.kind) && !e.bridge);
    const wIdx = (x: number, z: number) => { const id = wijkAt(x, z); return id ? WIJKEN.findIndex((w) => w.id === id) : -1; };
    this.bayWijk = Int8Array.from(bays, (b) => wIdx(b.x, b.z));
    this.edgeWijk = Int8Array.from(this.searchEdges, (e) => { const A = g.nodes[e.a], B = g.nodes[e.b]; return wIdx((A.x + B.x) / 2, (A.z + B.z) / 2); });
    this.centralW = this.searchEdges.map((e) => {
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      return 0.2 + Math.max(0, 1 - Math.hypot(mx, mz - 8) / 95);
    });
  }

  setPressure(p: number) { this.pressure = clamp(p); }
  /** Feed the simulation: bezetting (demand / places) and search time in minutes per wijk. */
  setWijken(m: Record<string, { bez: number; search: number }>) {
    WIJKEN.forEach((w, i) => { if (m[w.id]) this.wState[i] = m[w.id]; });
    this.pressure = clamp(this.wState.reduce((a, w) => a + w.bez, 0) / this.wState.length / 1.25);
  }
  snapNow(seconds = 25) {
    this.snap = true; this.parkedDirty = true;
    this.update(0.016, this.camDist);
    for (let i = 0; i < seconds / 0.05; i++) { this.spawnTimer = 0; this.update(0.05, this.camDist); }
    for (const a of this.agents) if (a.active && !a.retire) a.scale = 1;
  }
  setReliefs(g: { x: number; z: number; r: number; k: number }[]) {
    this.reliefs = g; this.parkedDirty = true;
    let s = 0, n = 0;
    for (const e of this.searchEdges) { const A = this.g.nodes[e.a]; s += this.relief(A.x, A.z); n++; }
    this.avgRelief = n ? s / n : 0;
  }
  relief(x: number, z: number) {
    let s = 0;
    for (const g of this.reliefs) {
      const d = Math.hypot(x - g.x, z - g.z);
      if (d < g.r) s += g.k * Math.pow(1 - d / g.r, 0.7);
    }
    return clamp(s, 0, 1);
  }
  private hot(x: number, z: number) {
    const h = this.hotspot; if (!h) return 0;
    const d = Math.hypot(x - h.x, z - h.z);
    return d < h.r ? h.k * Math.pow(1 - d / h.r, 0.5) : 0;
  }

  // ------------------------------------------------------------ geometry helpers
  private place(ag: Agent, out: THREE.Vector3): number {
    const e = this.g.edges[ag.e];
    const A = this.g.nodes[ag.fwd ? e.a : e.b], B = this.g.nodes[ag.fwd ? e.b : e.a];
    const t = clamp(ag.s / e.len);
    const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
    const off = e.oneway ? e.lane : e.lane;
    out.set(A.x + (B.x - A.x) * t - dz * off, ROAD_Y + A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t + dx * off);
    return Math.atan2(dz, dx);
  }

  private takeSprite() {
    for (let i = 0; i < this.sprites.length; i++) if (!this.sprites[i].visible) { this.sprites[i].visible = true; return i; }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.mats['?'], depthWrite: false, fog: false, transparent: true }));
    s.center.set(0.5, 0.1);
    s.renderOrder = 10;
    this.sprites.push(s);
    this.group.add(s);
    return this.sprites.length - 1;
  }
  private setBubble(ag: Agent, b: Agent['bubble']) {
    if (ag.bubble === b) return;
    ag.bubble = b;
    if (!b) { if (ag.sprite >= 0) { this.sprites[ag.sprite].visible = false; ag.sprite = -1; } return; }
    if (ag.sprite < 0) ag.sprite = this.takeSprite();
    const sp = this.sprites[ag.sprite];
    sp.material.map = this.mats[b]; sp.material.needsUpdate = true;
  }

  // ------------------------------------------------------------ spawning
  private freeAgent() { return this.agents.find((a) => !a.active) ?? null; }
  private init(ag: Agent, mode: Mode) {
    ag.active = true; ag.mode = mode; ag.scale = 0; ag.scaleT = 1; ag.timer = 0; ag.retire = false; ag.init = false; ag.despawn = false;
    ag.color.set(pick(this.rng, CAR_COLORS));
    ag.shape = this.rng() < 0.35 ? 1 : 0;
    ag.maxSpeed = mode === 'search' ? range(this.rng, 2.4, 3.1) : range(this.rng, 3.8, 5.4);
    ag.speed = ag.maxSpeed * 0.6;
    ag.path = []; ag.pi = 0; ag.onArrive = 'retire';
    this.setBubble(ag, null);
  }
  private spawnSearcher(near?: Hotspot, wijk = -1) {
    const ag = this.freeAgent(); if (!ag) return;
    // weighted pick over search edges
    let tot = 0; const w: number[] = [];
    for (let i = 0; i < this.searchEdges.length; i++) {
      const e = this.searchEdges[i];
      const A = this.g.nodes[e.a], B = this.g.nodes[e.b];
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      let ww = this.centralW[i] * Math.pow(1 - this.relief(mx, mz), 3);
      if (wijk >= 0 && this.edgeWijk[i] !== wijk) ww = 0;
      if (near) ww = Math.hypot(mx - near.x, mz - near.z) < near.r ? 1 : 0;
      else ww *= 1 + this.hot(mx, mz) * 3;
      w.push(ww); tot += ww;
    }
    if (tot <= 0.01) return;
    let r = this.rng() * tot, pickI = 0;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { pickI = i; break; } }
    const e = this.searchEdges[pickI];
    this.init(ag, 'search');
    ag.e = e.id; ag.fwd = e.oneway ? true : this.rng() < 0.5; ag.s = this.rng() * e.len; ag.wi = this.edgeWijk[pickI];
    this.setBubble(ag, '?');
  }
  private spawnWanderer() {
    const ag = this.freeAgent(); if (!ag) return;
    const bn = this.g.nodes.filter((n) => n.boundary && n.edges.length);
    if (!bn.length) return;
    const n = pick(this.rng, bn);
    const e = this.g.edges[n.edges[0]];
    if (!canLeave(e, n.id)) return;
    this.init(ag, 'wander');
    ag.e = e.id; ag.fwd = e.a === n.id; ag.s = 0;
  }
  /** a car that follows a node path, then retires or starts searching */
  spawnRouted(path: number[], onArrive: 'retire' | 'search', speed = 5.6) {
    if (path.length < 2) return false;
    const ag = this.freeAgent(); if (!ag) return false;
    const e = this.edgeOf(path[0], path[1]); if (!e) return false;
    this.init(ag, 'route');
    ag.path = path; ag.pi = 1; ag.onArrive = onArrive; ag.maxSpeed = speed * range(this.rng, 0.9, 1.1);
    ag.e = e.id; ag.fwd = e.a === path[0]; ag.s = 0;
    return true;
  }
  private edgeOf(a: number, b: number): REdge | null {
    for (const eid of this.g.nodes[a].edges) { const e = this.g.edges[eid]; if (this.g.other(e, a) === b) return e; }
    return null;
  }

  /** choose the next directed edge at node `v`, arriving over edge `e` */
  private nextEdge(ag: Agent, e: REdge, v: number): { e: REdge; fwd: boolean } | null {
    const node = this.g.nodes[v];
    const outs = node.edges.map((i) => this.g.edges[i]).filter((q) => q.id !== e.id && canLeave(q, v));
    if (ag.mode === 'route' && ag.pi < ag.path.length) {
      const q = this.edgeOf(v, ag.path[ag.pi]);
      if (q && canLeave(q, v)) { ag.pi++; return { e: q, fwd: q.a === v }; }
    }
    let cand = outs;
    if (ag.mode === 'search') { const c2 = outs.filter((q) => SEARCH_KINDS.has(q.kind)); if (c2.length) cand = c2; }
    if (!cand.length) {
      if (canLeave(e, v)) return { e, fwd: e.a === v }; // dead end: U-turn
      return null;
    }
    // heading of the arrival edge
    const inFwd = e.b === v;
    const hx = (inFwd ? e.dx : -e.dx), hz = (inFwd ? e.dz : -e.dz);
    const score = (q: REdge) => {
      const f = q.a === v;
      const dx = f ? q.dx : -q.dx, dz = f ? q.dz : -q.dz;
      return { cross: hx * dz - hz * dx, dot: hx * dx + hz * dz, f };
    };
    if (ag.mode === 'search') {
      if (this.rng() < 0.1) { const q = pick(this.rng, cand); return { e: q, fwd: q.a === v }; }
      let best = cand[0], bs = -9;
      for (const q of cand) { const s = score(q); const v2 = s.cross - (s.dot < -0.9 ? 3 : 0); if (v2 > bs) { bs = v2; best = q; } }
      return { e: best, fwd: best.a === v };
    }
    // wanderer: prefer straight on
    let tot = 0; const ws = cand.map((q) => { const s = score(q); const w = s.dot > 0.8 ? 3 : s.dot > -0.5 ? 1 : 0.15; tot += w; return w; });
    let r = this.rng() * tot;
    for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) return { e: cand[i], fwd: cand[i].a === v }; }
    return { e: cand[0], fwd: cand[0].a === v };
  }

  // ------------------------------------------------------------ update
  update(dt: number, camDist = this.camDist) {
    this.time += dt; this.camDist = camDist;
    const p = this.pressure;

    // ---- parked cars
    const fillW = this.wState.map((w) => 0.1 + 0.88 * Math.pow(clamp(w.bez), 1.2));
    void p;
    let cnt = 0, changed = false;
    for (let i = 0; i < this.bays.length; i++) {
      const b = this.bays[i];
      const rel = this.reliefs.length ? this.relief(b.x, b.z) : 0;
      const bw = this.bayWijk[i], fill = bw >= 0 ? fillW[bw] : 0.5;
      const want = this.rank[i] < Math.min(1, fill * (1 - 0.62 * rel) + this.hot(b.x, b.z) * 0.9) ? 1 : 0;
      if (want !== this.bayTarget[i]) { this.bayTarget[i] = want; if (this.snap) this.bayScale[i] = want; }
      cnt += want;
      const target = this.bayTarget[i];
      const s = this.bayScale[i];
      let dirty = this.parkedDirty;
      if (Math.abs(s - target) > 0.001 || Math.abs(this.bayVel[i]) > 0.001) {
        const k = 140, c = 13;
        this.bayVel[i] += (k * (target - s) - c * this.bayVel[i]) * dt;
        this.bayScale[i] = Math.max(0, s + this.bayVel[i] * dt);
        dirty = true;
      } else if (s !== target) { this.bayScale[i] = target; dirty = true; }
      if (dirty) {
        changed = true;
        const sc = this.bayScale[i];
        const sh = this.bayShape[i];
        const ox = Math.cos(b.yaw + Math.PI / 2) * 0, oz = 0; void ox; void oz;
        this.q.setFromAxisAngle(this.yAxis, this.bayYaw[i] + (b.side > 0 ? 0 : 0));
        this.v3.set(b.x + Math.cos(b.yaw) * this.bayOff[i], b.y, b.z + Math.sin(b.yaw) * this.bayOff[i]);
        this.m4.compose(this.v3, this.q, this.sv.setScalar(sc));
        this.parked[sh].set(i, this.m4);
        this.parked[1 - sh].set(i, this.m4.makeScale(0, 0, 0));
      }
    }
    this.parkedCount = cnt;
    if (changed) for (const f of this.parked) f.flush();
    this.parkedDirty = false; this.snap = false;

    // ---- targets: searchers per wijk follow the simulated search time
    const nW = WIJKEN.map(() => 0); let nSearch = 0, nWander = 0, hotSearch = 0;
    for (const a of this.agents) if (a.active && !a.retire && !a.despawn) {
      if (a.mode === 'search') { nSearch++; if (a.wi >= 0) nW[a.wi]++; if (this.hotspot && Math.hypot(a.pos.x - this.hotspot.x, a.pos.z - this.hotspot.z) < this.hotspot.r) hotSearch++; }
      else if (a.mode === 'wander') nWander++;
    }
    const wantW = this.wState.map((w) => Math.round(13 * Math.pow(clamp((w.search - 2.4) / 15), 0.8)));
    const wantHot = this.hotspot ? Math.round(this.hotspot.k * 16) : 0;
    const wantWander = Math.round(lerp(10, 46, Math.pow(p, 0.9)));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.14;
      let worst = -1, wd = 0, over = -1, od = 0;
      wantW.forEach((w, i) => { const d = w - nW[i]; if (d > wd) { wd = d; worst = i; } if (-d > od) { od = -d; over = i; } });
      if (this.hotspot && hotSearch < wantHot) this.spawnSearcher(this.hotspot);
      else if (worst >= 0) this.spawnSearcher(undefined, worst);
      if (over >= 0 && od >= 1) {
        const v = this.agents.find((a) => a.active && a.mode === 'search' && !a.retire && a.wi === over);
        if (v) { v.timer = 0.2 + this.rng() * 1.2; v.retire = true; }
      }
      if (nWander < wantWander) this.spawnWanderer();
      else if (nWander > wantWander + 1) { const v = this.agents.find((a) => a.active && a.mode === 'wander' && !a.despawn); if (v) v.despawn = true; }
    }
    this.searching = nSearch; this.wSearching = nW;

    // ---- move
    const spriteSize = clamp(this.camDist * 0.03, 2.6, 9);
    const dirOf = (a: Agent) => { const e = this.g.edges[a.e]; return a.fwd ? [e.dx, e.dz] : [-e.dx, -e.dz]; };
    for (let k = 0; k < this.agents.length; k++) {
      const ag = this.agents[k];
      const fleet = this.moving[ag.shape], other = this.moving[1 - ag.shape];
      if (!ag.active) { fleet.set(k, this.m4.makeScale(0, 0, 0)); other.set(k, this.m4.makeScale(0, 0, 0)); continue; }
      if (ag.retire) {
        ag.timer -= dt;
        if (ag.timer <= 0 && ag.scaleT !== 0) { ag.scaleT = 0; this.setBubble(ag, 'P'); }
      }
      ag.scale += (ag.scaleT - ag.scale) * Math.min(1, dt * (ag.scaleT === 0 ? 3.2 : 5));
      if (ag.scaleT === 0 && ag.scale < 0.02) {
        ag.active = false; ag.retire = false; this.setBubble(ag, null);
        fleet.set(k, this.m4.makeScale(0, 0, 0));
        continue;
      }
      const e = this.g.edges[ag.e];
      const [dx, dz] = dirOf(ag);
      // speed control: leader, blockers
      let spd = ag.maxSpeed;
      let blocked = false;
      for (let o = 0; o < this.agents.length; o++) {
        const ot = this.agents[o];
        if (o === k || !ot.active || ot.e !== ag.e || ot.fwd !== ag.fwd) continue;
        const gap = ot.s - ag.s;
        if (gap > 0 && gap < 4.2) spd = Math.min(spd, Math.max(0, ag.maxSpeed * (gap - 2.5) / 1.7));
      }
      for (const bl of this.blockers) {
        const rx = bl.x - ag.pos.x, rz = bl.z - ag.pos.z;
        const d = Math.hypot(rx, rz);
        if (d < bl.r && (rx * dx + rz * dz) > -0.3 * d) { spd = 0; blocked = true; }
      }
      if (ag.mode === 'search' && this.hotspot == null) { /* keep */ }
      ag.speed += (spd - ag.speed) * Math.min(1, dt * (spd === 0 ? 6 : 2.4));
      if (ag.speed < 0.02 && spd === 0) ag.speed = 0;
      ag.s += ag.speed * dt;
      if (blocked && ag.mode !== 'route' && !ag.retire) this.setBubble(ag, '!');
      else if (ag.bubble === '!') this.setBubble(ag, ag.mode === 'search' ? '?' : null);
      // junction
      if (ag.s >= e.len) {
        const v = ag.fwd ? e.b : e.a;
        const left = ag.s - e.len;
        if (ag.mode === 'wander' && (ag.despawn || (this.g.nodes[v].boundary && this.rng() < 0.7))) { ag.scaleT = 0; ag.s = e.len; }
        else {
          if (ag.mode === 'route' && ag.pi >= ag.path.length) {
            // arrived
            if (ag.onArrive === 'search') { ag.mode = 'search'; ag.maxSpeed = range(this.rng, 2.4, 3.0); this.setBubble(ag, '?'); }
            else { ag.retire = true; ag.timer = 0; }
          }
          const nx = this.nextEdge(ag, e, v);
          if (!nx) { ag.scaleT = 0; ag.s = e.len; }
          else { ag.e = nx.e.id; ag.fwd = nx.fwd; ag.s = Math.min(left, nx.e.len * 0.5); }
        }
      }
      // render pose
      const tgt = this.v3;
      const yaw = this.place(ag, tgt);
      if (!ag.init) { ag.pos.copy(tgt); ag.yaw = yaw; ag.init = true; }
      else {
        const kf = 1 - Math.exp(-16 * dt);
        ag.pos.lerp(tgt, kf);
        let dy = yaw - ag.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        ag.yaw += dy * (1 - Math.exp(-10 * dt));
      }
      const sc = ag.scale > 0.999 ? 1 : Math.max(0.001, ag.scale < 1 ? easeOutBack(clamp(ag.scale), 1.4) : ag.scale);
      this.q.setFromAxisAngle(this.yAxis, -ag.yaw);
      this.m4.compose(ag.pos, this.q, this.sv.setScalar(sc));
      fleet.set(k, this.m4);
      other.set(k, this.m4.makeScale(0, 0, 0));
      fleet.body.setColorAt(k, ag.color);
      if (ag.sprite >= 0) {
        const s = this.sprites[ag.sprite];
        const bob = Math.sin(this.time * 4 + k) * 0.12;
        const pop = ag.scaleT === 0 ? 1 + (1 - ag.scale) * 0.4 : easeOutBack(clamp(ag.scale * 1.5));
        s.position.set(ag.pos.x, ag.pos.y + 1.2 + bob + (ag.scaleT === 0 ? (1 - ag.scale) * 0.8 : 0), ag.pos.z);
        const sz = spriteSize * pop * (ag.scaleT === 0 ? clamp(ag.scale * 3 + 0.2) : 1);
        s.scale.set(sz, sz, 1);
      }
    }
    for (const f of this.moving) {
      f.flush();
      if (f.body.instanceColor) f.body.instanceColor.needsUpdate = true;
    }
  }

  onRelief() {
    for (const ag of this.agents) {
      if (!ag.active || ag.mode !== 'search' || ag.retire) continue;
      const rel = this.relief(ag.pos.x, ag.pos.z);
      if (rel > 0.35) { ag.timer = 0.3 + this.rng() * 3.6 * (1.2 - rel); ag.retire = true; }
    }
    this.parkedDirty = true;
  }

  pickSearcher(camera: THREE.Camera, w: number, h: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null; let bd = 1e9;
    const v = new THREE.Vector3();
    for (const ag of this.agents) {
      if (!ag.active || ag.mode !== 'search' || ag.scale < 0.9) continue;
      v.set(ag.pos.x, 0.8, ag.pos.z).project(camera);
      if (Math.abs(v.x) > 0.7 || Math.abs(v.y) > 0.6) continue;
      const d = Math.hypot(v.x * (w / h), v.y + 0.05);
      if (d < bd) { bd = d; best = new THREE.Vector3(ag.pos.x, 0.8, ag.pos.z); }
    }
    return best;
  }
  allSearchers() { return this.agents.filter((a) => a.active && a.mode === 'search').map((a) => new THREE.Vector3(a.pos.x, 0.8, a.pos.z)); }
}
