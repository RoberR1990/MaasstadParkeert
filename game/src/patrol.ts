// Scan cars on patrol: small white cars that cruise the parking streets of "their" wijk. They mirror the sim's scanautos.
import * as THREE from 'three';
import type { Graph, REdge } from './map';
import { ROAD_Y } from './config';
import { WIJKEN, wijkAt, type WijkId } from './wijken';
import { makeScanCar } from './structures';
import { canLeave } from './route';
import { clamp, easeOutBack, mulberry32 } from './util';

interface PCar { g: THREE.Group; wijk: WijkId; e: number; fwd: boolean; s: number; speed: number; pos: THREE.Vector3; yaw: number; t: number; init: boolean }
const PARK = new Set(['street', 'avenue', 'quay', 'lane']);

export class Patrol {
  group = new THREE.Group();
  cars: PCar[] = [];
  private rng = mulberry32(31337);
  private edges: Record<string, REdge[]> = {};
  private time = 0;
  private v = new THREE.Vector3();

  constructor(private g: Graph) {
    for (const w of WIJKEN) this.edges[w.id] = [];
    for (const e of g.edges) {
      if (!PARK.has(e.kind) || e.bridge) continue;
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const id = wijkAt((A.x + B.x) / 2, (A.z + B.z) / 2);
      if (id) this.edges[id].push(e);
    }
  }

  count(wijk?: WijkId) { return this.cars.filter((c) => !wijk || c.wijk === wijk).length; }
  /** `pulse`: the car pops in with a little spring (a scan car just bought) */
  add(wijk: WijkId) {
    const list = this.edges[wijk]; if (!list.length) return null;
    const e = list[Math.floor(this.rng() * list.length)];
    const car = { g: makeScanCar(), wijk, e: e.id, fwd: e.oneway ? true : this.rng() < 0.5, s: this.rng() * e.len, speed: 3.2, pos: new THREE.Vector3(), yaw: 0, t: 0, init: false };
    car.g.scale.setScalar(0.001);
    this.group.add(car.g); this.cars.push(car);
    return car;
  }
  remove(car: PCar) { this.group.remove(car.g); this.cars = this.cars.filter((c) => c !== car); }
  /** world position of the newest car in a wijk (for floaters / camera) */
  where(wijk: WijkId) { const c = [...this.cars].reverse().find((x) => x.wijk === wijk); return c ? c.pos.clone() : null; }

  private place(c: PCar, out: THREE.Vector3) {
    const e = this.g.edges[c.e];
    const A = this.g.nodes[c.fwd ? e.a : e.b], B = this.g.nodes[c.fwd ? e.b : e.a];
    const t = clamp(c.s / e.len), dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
    out.set(A.x + (B.x - A.x) * t - dz * e.lane, ROAD_Y + A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t + dx * e.lane);
    return Math.atan2(dz, dx);
  }

  update(dt: number) {
    this.time += dt;
    for (const c of this.cars) {
      c.t += dt;
      const e = this.g.edges[c.e];
      c.s += c.speed * dt;
      if (c.s >= e.len) {
        const v = c.fwd ? e.b : e.a, left = c.s - e.len;
        const outs = this.g.nodes[v].edges.map((i) => this.g.edges[i]).filter((q) => q.id !== e.id && canLeave(q, v) && PARK.has(q.kind) && !q.bridge && this.inWijk(q, c.wijk));
        const pick = outs.length ? outs[Math.floor(this.rng() * outs.length)] : (canLeave(e, v) ? e : null);
        if (pick) { c.e = pick.id; c.fwd = pick.a === v; c.s = Math.min(left, pick.len * 0.5); } else c.s = e.len;
      }
      const tgt = this.v, yaw = this.place(c, tgt);
      if (!c.init) { c.pos.copy(tgt); c.yaw = yaw; c.init = true; }
      else {
        c.pos.lerp(tgt, 1 - Math.exp(-14 * dt));
        let d = yaw - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        c.yaw += d * (1 - Math.exp(-9 * dt));
      }
      c.g.position.copy(c.pos); c.g.rotation.y = -c.yaw;
      const sc = easeOutBack(clamp(c.t / 0.7), 2.2) * 1.0;
      c.g.scale.setScalar(Math.max(0.001, sc) * 1.0);
      const b = c.g.getObjectByName('beacon'); if (b) b.visible = Math.sin(this.time * 9 + c.s) > -0.2;
    }
  }
  private inWijk(e: REdge, w: WijkId) { const A = this.g.nodes[e.a], B = this.g.nodes[e.b]; return wijkAt((A.x + B.x) / 2, (A.z + B.z) / 2) === w; }
}
