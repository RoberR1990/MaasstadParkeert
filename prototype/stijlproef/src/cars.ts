// Cars: parked cars fill bays according to parkeerdruk; moving cars wander, and "searchers" circle blocks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GeoBuilder } from './geo';
import { Bay } from './world';
import { CAR_COLORS } from './palette';
import { P, NB, ROAD_Y, lineCoord } from './config';
import { bubbleTexture } from './tex';
import { clamp, lerp, mulberry32, pick, range, easeOutBack } from './util';

const CAR_L = 1.3;
const CAR_W = 0.62;
const LANE = 0.5;

function carGeometries() {
  const body = new GeoBuilder();
  const det = new GeoBuilder();
  const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
  // body (tinted per instance)
  body.add(rb(CAR_L, 0.27, CAR_W, 0.09), '#ffffff', new THREE.Matrix4().makeTranslation(0, 0.235, 0), { ao: 0.78, aoH: 0.3 });
  body.add(rb(0.6, 0.07, 0.5, 0.03), '#ffffff', new THREE.Matrix4().makeTranslation(-0.1, 0.545, 0), { ao: 1 });
  // glass band + pillars
  det.add(rb(0.66, 0.17, 0.54, 0.05), '#26333f', new THREE.Matrix4().makeTranslation(-0.1, 0.45, 0), { ao: 1 });
  // wheels
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.29, 0.29]) {
    det.add(new THREE.CylinderGeometry(0.105, 0.105, 0.1, 8).rotateX(Math.PI / 2), '#23262b', new THREE.Matrix4().makeTranslation(sx, 0.105, sz), { ao: 1 });
  }
  // lights
  for (const sz of [-0.2, 0.2]) {
    det.add(new THREE.BoxGeometry(0.04, 0.06, 0.12), '#fff1c6', new THREE.Matrix4().makeTranslation(CAR_L / 2 - 0.01, 0.27, sz), { ao: 1 });
    det.add(new THREE.BoxGeometry(0.04, 0.06, 0.12), '#a33a3a', new THREE.Matrix4().makeTranslation(-CAR_L / 2 + 0.01, 0.27, sz), { ao: 1 });
  }
  return { body: body.build()!, det: det.build()! };
}

class Fleet {
  body: THREE.InstancedMesh;
  det: THREE.InstancedMesh;
  constructor(public count: number, geos: { body: THREE.BufferGeometry; det: THREE.BufferGeometry }, shadow = true) {
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, envMapIntensity: 1.3 });
    const dm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    this.body = new THREE.InstancedMesh(geos.body, bm, count);
    this.det = new THREE.InstancedMesh(geos.det, dm, count);
    this.body.castShadow = shadow; this.body.receiveShadow = true;
    this.det.castShadow = false;
    this.body.frustumCulled = false; this.det.frustumCulled = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) { this.body.setMatrixAt(i, m); this.det.setMatrixAt(i, m); this.body.setColorAt(i, new THREE.Color('#ffffff')); }
  }
  set(i: number, m: THREE.Matrix4) { this.body.setMatrixAt(i, m); this.det.setMatrixAt(i, m); }
  flush() { this.body.instanceMatrix.needsUpdate = true; this.det.instanceMatrix.needsUpdate = true; }
}

interface Node { i: number; j: number }
const nodePos = (i: number, j: number) => new THREE.Vector2(lineCoord(i), j <= 8 ? lineCoord(j) : lineCoord(8) + 27);
const isBoundary = (i: number, j: number) => i === 0 || i === 8 || j === 0 || j >= 8 && !(j === 8 && i === 2) || (i === 2 && j === 9);

type Mode = 'wander' | 'search' | 'leaving';
interface Agent {
  active: boolean; mode: Mode;
  pos: THREE.Vector2; yaw: number; speed: number; maxSpeed: number;
  a: Node; b: Node; c: Node | null;
  color: THREE.Color; scale: number; scaleT: number;
  block: { i: number; j: number } | null;
  timer: number; sprite: number; despawnAtBoundary: boolean;
  edgeId: number; retire: boolean;
}

export interface Garage { x: number; z: number }

export class CarSystem {
  group = new THREE.Group();
  private parked: Fleet;
  private moving: Fleet;
  private bays: Bay[];
  private rank: Float32Array;
  private bayScale: Float32Array;
  private bayVel: Float32Array;
  private bayTarget: Uint8Array;
  private bayYaw: Float32Array;
  private bayOff: Float32Array;
  private agents: Agent[] = [];
  private sprites: THREE.Sprite[] = [];
  private spriteMats: { q: THREE.SpriteMaterial; ok: THREE.SpriteMaterial };
  private rng = mulberry32(777);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private pressure = 0.6;
  private reliefs: { x: number; z: number; r: number; k: number }[] = [];
  searching = 0;
  parkedCount = 0;
  private parkedDirty = true;
  private spawnTimer = 0;
  private snap = true;
  private time = 0;

  constructor(bays: Bay[]) {
    this.bays = bays;
    const geos = carGeometries();
    this.parked = new Fleet(bays.length, geos, true);
    this.moving = new Fleet(160, geos, true);
    this.group.add(this.parked.body, this.parked.det, this.moving.body, this.moving.det);
    const n = bays.length;
    this.rank = new Float32Array(n);
    this.bayScale = new Float32Array(n);
    this.bayVel = new Float32Array(n);
    this.bayTarget = new Uint8Array(n);
    this.bayYaw = new Float32Array(n);
    this.bayOff = new Float32Array(n);
    const idx = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const r = Math.floor(this.rng() * (i + 1)); [idx[i], idx[r]] = [idx[r], idx[i]]; }
    idx.forEach((bay, rk) => (this.rank[bay] = rk / n));
    for (let i = 0; i < n; i++) {
      this.parked.body.setColorAt(i, new THREE.Color(pick(this.rng, CAR_COLORS)));
      const b = bays[i];
      // face along the street, alternating direction by side like real traffic flow
      this.bayYaw[i] = b.yaw + (b.side > 0 ? 0 : Math.PI) + (this.rng() - 0.5) * 0.06;
      this.bayOff[i] = (this.rng() - 0.5) * 0.16;
    }
    for (let i = 0; i < this.moving.count; i++) this.moving.body.setColorAt(i, new THREE.Color(pick(this.rng, CAR_COLORS)));
    for (let i = 0; i < 160; i++) {
      this.agents.push({
        active: false, mode: 'wander', pos: new THREE.Vector2(), yaw: 0, speed: 0, maxSpeed: 3,
        a: { i: 0, j: 0 }, b: { i: 0, j: 0 }, c: null, color: new THREE.Color(), scale: 0, scaleT: 1, block: null, timer: 0, sprite: -1,
        despawnAtBoundary: false, edgeId: 0, retire: false,
      });
    }
    this.spriteMats = {
      q: new THREE.SpriteMaterial({ map: bubbleTexture('?', '#fff8ea', '#d9674f'), depthWrite: false, fog: false }),
      ok: new THREE.SpriteMaterial({ map: bubbleTexture('P', '#e9f6ec', '#2f8a63'), depthWrite: false, fog: false }),
    };
  }

  setPressure(p: number) { this.pressure = clamp(p); }
  /** Jump straight to the target state (used by screenshot hooks / title screen). */
  snapNow(seconds = 25) {
    this.snap = true; this.parkedDirty = true;
    this.update(0.016);
    for (let i = 0; i < seconds / 0.05; i++) { this.spawnTimer = 0; this.update(0.05); }
    for (const a of this.agents) if (a.active && !a.retire) { a.scale = 1; }
  }
  private avgRelief = 0;
  setReliefs(g: { x: number; z: number; r: number; k: number }[]) {
    this.reliefs = g; this.parkedDirty = true;
    let s = 0;
    for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) s += this.relief((i - 3.5) * P, (j - 3.5) * P);
    this.avgRelief = s / (NB * NB);
  }

  relief(x: number, z: number) {
    let s = 0;
    for (const g of this.reliefs) {
      const d = Math.hypot(x - g.x, z - g.z);
      if (d < g.r) s += g.k * Math.pow(1 - d / g.r, 0.7);
    }
    return clamp(s, 0, 1);
  }

  // ------------------------------------------------------------ agents
  private spawn(mode: Mode, at?: { i: number; j: number }) {
    const ag = this.agents.find((a) => !a.active);
    if (!ag) return null;
    ag.active = true; ag.mode = mode; ag.scale = 0; ag.scaleT = 1; ag.timer = 0; ag.sprite = -1; ag.despawnAtBoundary = false; ag.retire = false;
    ag.color.set(pick(this.rng, CAR_COLORS));
    ag.maxSpeed = mode === 'search' ? range(this.rng, 1.9, 2.4) : range(this.rng, 2.8, 3.8);
    ag.speed = ag.maxSpeed * 0.6;
    if (mode === 'search') {
      // choose a block, weighted by lack of relief and nearness to the middle
      let best: { i: number; j: number } | null = at ?? null;
      if (!best) {
        let tot = 0; const w: number[] = [];
        const cand: { i: number; j: number }[] = [];
        for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
          const cx = (i - 3.5) * P, cz = (j - 3.5) * P;
          const central = 1 - Math.min(1, Math.hypot(cx, cz - 3) / 44);
          const wt = Math.pow(1 - this.relief(cx, cz), 3) * (0.25 + central);
          // avoid stacking too many in one block
          const crowd = this.agents.filter((a) => a.active && a.mode === 'search' && a.block && a.block.i === i && a.block.j === j).length;
          const ww = wt / (1 + crowd * 1.5);
          cand.push({ i, j }); w.push(ww); tot += ww;
        }
        if (tot < 0.05) { ag.active = false; return null; }
        let r = this.rng() * tot;
        for (let k = 0; k < cand.length; k++) { r -= w[k]; if (r <= 0) { best = cand[k]; break; } }
        best = best ?? cand[0];
      }
      ag.block = best;
      // start at a random corner of the loop
      const loop = this.loopNodes(best);
      const s = Math.floor(this.rng() * 4);
      ag.a = loop[s]; ag.b = loop[(s + 1) % 4];
      this.placeOnEdge(ag, this.rng() * 0.6);
      ag.c = loop[(s + 2) % 4];
      ag.sprite = this.takeSprite();
    } else {
      // enter from a boundary node, heading inwards
      const bn = [] as Node[];
      for (let k = 0; k <= 8; k++) bn.push({ i: k, j: 0 }, { i: k, j: 8 }, { i: 0, j: k }, { i: 8, j: k });
      bn.push({ i: 2, j: 9 });
      const start = pick(this.rng, bn);
      const nb = this.neighbours(start);
      ag.a = start; ag.b = pick(this.rng, nb);
      this.placeOnEdge(ag, 0.0);
      ag.c = this.nextWander(ag.a, ag.b);
      ag.block = null;
    }
    return ag;
  }

  private loopNodes(b: { i: number; j: number }): Node[] {
    return [{ i: b.i, j: b.j }, { i: b.i + 1, j: b.j }, { i: b.i + 1, j: b.j + 1 }, { i: b.i, j: b.j + 1 }];
  }

  private neighbours(n: Node): Node[] {
    const out: Node[] = [];
    if (n.i > 0 && n.j <= 8) out.push({ i: n.i - 1, j: n.j });
    if (n.i < 8 && n.j <= 8) out.push({ i: n.i + 1, j: n.j });
    if (n.j > 0 && n.j <= 8) out.push({ i: n.i, j: n.j - 1 });
    if (n.j < 8) out.push({ i: n.i, j: n.j + 1 });
    if (n.i === 2 && n.j === 8) out.push({ i: 2, j: 9 });
    if (n.i === 2 && n.j === 9) return [{ i: 2, j: 8 }];
    return out;
  }

  private nextWander(a: Node, b: Node): Node {
    const opts = this.neighbours(b).filter((n) => !(n.i === a.i && n.j === a.j));
    if (!opts.length) return a;
    const dx = b.i - a.i, dz = b.j - a.j;
    const wts = opts.map((n) => ((n.i - b.i === dx && n.j - b.j === dz) ? 3 : 1));
    const tot = wts.reduce((s, v) => s + v, 0);
    let r = this.rng() * tot;
    for (let k = 0; k < opts.length; k++) { r -= wts[k]; if (r <= 0) return opts[k]; }
    return opts[0];
  }

  private placeOnEdge(ag: Agent, t: number) {
    const A = nodePos(ag.a.i, ag.a.j), B = nodePos(ag.b.i, ag.b.j);
    const d = B.clone().sub(A); const len = d.length(); d.normalize();
    const rn = new THREE.Vector2(-d.y, d.x);
    ag.pos.copy(A).addScaledVector(d, len * t).addScaledVector(rn, LANE);
    ag.yaw = Math.atan2(d.y, d.x);
    ag.edgeId = ag.a.i * 1000 + ag.a.j * 100 + ag.b.i * 10 + ag.b.j;
  }

  private takeSprite() {
    for (let i = 0; i < this.sprites.length; i++) if (!this.sprites[i].visible) { this.sprites[i].visible = true; return i; }
    const s = new THREE.Sprite(this.spriteMats.q.clone());
    s.center.set(0.5, 0.1);
    this.sprites.push(s);
    this.group.add(s);
    return this.sprites.length - 1;
  }

  private chooseSearchTarget(ag: Agent) {
    // continue around the block: next node in the loop after b
    const loop = this.loopNodes(ag.block!);
    const k = loop.findIndex((n) => n.i === ag.b.i && n.j === ag.b.j);
    return loop[(k + 1) % 4];
  }

  /** Reduce searchers near new garages: they find a spot and vanish. */
  private retireSearchers(delayBase = 0.3) {
    for (const ag of this.agents) {
      if (!ag.active || ag.mode !== 'search' || !ag.block) continue;
      const cx = (ag.block.i - 3.5) * P, cz = (ag.block.j - 3.5) * P;
      const rel = this.relief(cx, cz);
      if (rel > 0.35 && !ag.retire) {
        ag.timer = delayBase + this.rng() * 3.6 * (1.2 - rel);
        ag.mode = 'search';
        ag.retire = true;
      }
    }
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    const p = this.pressure;

    // ---- parked cars
    const fill = 0.1 + 0.88 * Math.pow(p, 1.15);
    let cnt = 0;
    let changed = false;
    for (let i = 0; i < this.bays.length; i++) {
      const b = this.bays[i];
      const rel = this.reliefs.length ? this.relief(b.x, b.z) : 0;
      const want = this.rank[i] < fill * (1 - 0.62 * rel) ? 1 : 0;
      if (want !== this.bayTarget[i]) {
        this.bayTarget[i] = want;
        if (this.snap) { this.bayScale[i] = want; } else {
          // stagger so changes ripple instead of popping at once
          this.bayVel[i] = want ? 0 : this.bayVel[i];
        }
      }
      cnt += want;
      const target = this.bayTarget[i];
      const s = this.bayScale[i];
      if (Math.abs(s - target) > 0.001 || Math.abs(this.bayVel[i]) > 0.001) {
        // damped spring -> pop with a little overshoot
        const k = 140, c = 13;
        const a = k * (target - s) - c * this.bayVel[i];
        this.bayVel[i] += a * dt;
        this.bayScale[i] = Math.max(0, s + this.bayVel[i] * dt);
        changed = true;
      } else if (s !== target) { this.bayScale[i] = target; changed = true; }
      if (changed || this.parkedDirty) {
        const sc = this.bayScale[i];
        const horizontal = b.horizontal;
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.bayYaw[i]);
        this.m4.compose(
          new THREE.Vector3(b.x + (horizontal ? this.bayOff[i] : 0), ROAD_Y, b.z + (horizontal ? 0 : this.bayOff[i])),
          this.q,
          new THREE.Vector3(sc, sc, sc),
        );
        this.parked.set(i, this.m4);
      }
    }
    this.parkedCount = cnt;
    if (changed || this.parkedDirty) this.parked.flush();
    this.parkedDirty = false;
    this.snap = false;

    // ---- target counts
    let nSearch = 0, nWander = 0;
    for (const a of this.agents) if (a.active) {
      if (a.mode === 'search' && !a.retire) nSearch++;
      else if (a.mode === 'wander' && !a.despawnAtBoundary) nWander++;
    }
    const wantSearch = Math.round(Math.pow(p, 1.5) * 28 * (1 - clamp(this.avgRelief * 2.4, 0, 0.85)));
    const wantWander = Math.round(lerp(8, 44, Math.pow(p, 0.9)));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.18;
      if (nSearch < wantSearch) this.spawn('search');
      else if (nSearch > wantSearch + 1) {
        const v = this.agents.find((a) => a.active && a.mode === 'search' && !a.retire);
        if (v) { v.timer = 0.2; v.retire = true; }
      }
      if (nWander < wantWander) this.spawn('wander');
      else if (nWander > wantWander + 1) {
        const v = this.agents.find((a) => a.active && a.mode === 'wander' && !a.despawnAtBoundary);
        if (v) v.despawnAtBoundary = true;
      }
    }
    this.searching = nSearch;

    // ---- move agents
    const tmpD = new THREE.Vector2(), tmpR = new THREE.Vector2(), tmpT = new THREE.Vector2();
    let sCount = 0;
    for (let k = 0; k < this.agents.length; k++) {
      const ag = this.agents[k];
      if (!ag.active) { this.moving.set(k, this.m4.makeScale(0, 0, 0)); continue; }
      // retire (found a spot)
      if (ag.retire) {
        ag.timer -= dt;
        if (ag.timer <= 0 && ag.scaleT !== 0) {
          ag.scaleT = 0;
          if (ag.sprite >= 0) {
            const s = this.sprites[ag.sprite];
            s.material.map = this.spriteMats.ok.map;
            s.material.needsUpdate = true;
          }
        }
      }
      ag.scale += (ag.scaleT - ag.scale) * Math.min(1, dt * (ag.scaleT === 0 ? 3.2 : 5));
      if (ag.scaleT === 0 && ag.scale < 0.02) {
        ag.active = false; ag.retire = false;
        if (ag.sprite >= 0) { this.sprites[ag.sprite].visible = false; this.sprites[ag.sprite].material.map = this.spriteMats.q.map; this.sprites[ag.sprite].material.needsUpdate = true; ag.sprite = -1; }
        this.moving.set(k, this.m4.makeScale(0, 0, 0));
        continue;
      }
      const A = nodePos(ag.a.i, ag.a.j), B = nodePos(ag.b.i, ag.b.j);
      tmpD.copy(B).sub(A); const len = tmpD.length(); tmpD.normalize();
      tmpR.set(-tmpD.y, tmpD.x);
      // progress along the edge
      const prog = (ag.pos.x - A.x) * tmpD.x + (ag.pos.y - A.y) * tmpD.y;
      // following distance: slow down behind another car on the same lane
      let spd = ag.maxSpeed;
      for (let o = 0; o < this.agents.length; o++) {
        const other = this.agents[o];
        if (o === k || !other.active || other.edgeId !== ag.edgeId) continue;
        const op = (other.pos.x - A.x) * tmpD.x + (other.pos.y - A.y) * tmpD.y;
        const gap = op - prog;
        if (gap > 0 && gap < 2.1) spd = Math.min(spd, Math.max(0.2, ag.maxSpeed * (gap - 0.95) / 1.15));
      }
      ag.speed += (spd - ag.speed) * Math.min(1, dt * 3);
      // pure pursuit toward lane line
      const lateral = (ag.pos.x - A.x) * tmpR.x + (ag.pos.y - A.y) * tmpR.y;
      const look = 1.5;
      tmpT.copy(A).addScaledVector(tmpD, Math.min(len + 1.5, prog + look)).addScaledVector(tmpR, LANE);
      const want = Math.atan2(tmpT.y - ag.pos.y, tmpT.x - ag.pos.x);
      let da = want - ag.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const maxTurn = 3.6 * dt * Math.max(0.5, ag.speed / 2.5);
      ag.yaw += clamp(da * Math.min(1, dt * 7), -maxTurn, maxTurn);
      ag.pos.x += Math.cos(ag.yaw) * ag.speed * dt;
      ag.pos.y += Math.sin(ag.yaw) * ag.speed * dt;
      void lateral;
      // reached the junction?
      let turning = false;
      if (ag.c) { const C = nodePos(ag.c.i, ag.c.j); turning = Math.sign(C.x - B.x) !== Math.sign(B.x - A.x) || Math.sign(C.y - B.y) !== Math.sign(B.y - A.y); }
      const sw = turning ? 2.0 : 0.6;
      const nowProg = (ag.pos.x - A.x) * tmpD.x + (ag.pos.y - A.y) * tmpD.y;
      if (nowProg > len - sw) {
        if (ag.mode === 'wander' && ag.despawnAtBoundary && isBoundary(ag.b.i, ag.b.j)) { ag.scaleT = 0; }
        if (ag.mode === 'wander' && isBoundary(ag.b.i, ag.b.j) && this.neighbours(ag.b).length <= 2 && this.rng() < 0.18) ag.scaleT = 0;
        ag.a = ag.b;
        ag.b = ag.c ?? ag.a;
        ag.c = ag.mode === 'search' ? this.chooseSearchTarget(ag) : this.nextWander(ag.a, ag.b);
        ag.edgeId = ag.a.i * 1000 + ag.a.j * 100 + ag.b.i * 10 + ag.b.j;
      }
      // matrix
      const sc = ag.scale > 0.999 ? 1 : Math.max(0.001, ag.scale < 1 ? easeOutBack(clamp(ag.scale), 1.4) : ag.scale);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ag.yaw);
      this.m4.compose(new THREE.Vector3(ag.pos.x, ROAD_Y, ag.pos.y), this.q, new THREE.Vector3(sc, sc, sc));
      this.moving.set(k, this.m4);
      this.moving.body.setColorAt(k, ag.color);
      // sprite
      if (ag.sprite >= 0) {
        const s = this.sprites[ag.sprite];
        const bob = Math.sin(this.time * 4 + k) * 0.08;
        const pop = ag.scaleT === 0 ? 1 + (1 - ag.scale) * 0.6 : easeOutBack(clamp(ag.scale * 1.5));
        s.position.set(ag.pos.x, 0.9 + bob + (ag.scaleT === 0 ? (1 - ag.scale) * 0.8 : 0), ag.pos.y);
        const sz = 2.5 * pop * (ag.scaleT === 0 ? clamp(ag.scale * 3 + 0.2) : 1);
        s.scale.set(sz, sz, 1);
        sCount++;
      }
    }
    this.moving.flush();
    if (this.moving.body.instanceColor) this.moving.body.instanceColor.needsUpdate = true;
    void sCount;
  }

  /** Called after a garage is placed: nearby searchers find a spot and leave. */
  onRelief() {
    this.retireSearchers();
    this.parkedDirty = true;
  }

  /** Screen-space helper for the tutorial: a searching car near the middle of the view. */
  pickSearcher(camera: THREE.Camera, w: number, h: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null; let bd = 1e9;
    const v = new THREE.Vector3();
    for (const ag of this.agents) {
      if (!ag.active || ag.mode !== 'search' || ag.scale < 0.9) continue;
      v.set(ag.pos.x, 0.5, ag.pos.y).project(camera);
      const d = Math.hypot(v.x * (w / h), v.y + 0.05);
      if (d < bd) { bd = d; best = new THREE.Vector3(ag.pos.x, 0.5, ag.pos.y); }
    }
    return best;
  }

  allSearchers() {
    return this.agents.filter((a) => a.active && a.mode === 'search').map((a) => new THREE.Vector3(a.pos.x, 0.5, a.pos.y));
  }
}
