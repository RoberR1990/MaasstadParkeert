// Tiny instanced pedestrians that walk along the sidewalks of the road graph (ambient + event streams).
import * as THREE from 'three';
import type { Graph } from './map';
import { shortestPath, edgeBetween } from './route';
import { mulberry32, pick, range } from './util';

interface Walker { active: boolean; path: number[]; pi: number; s: number; e: number; fwd: boolean; speed: number; phase: number; side: number; dest: number; fade: number }

const BODY = ['#e8453c', '#3f8fd2', '#f2a03a', '#f4efe0', '#2d3d4d', '#6cbf5c', '#d8509a', '#8e5cc7', '#f4d03f', '#c9ccd0'];
const SKIN = ['#f1c9a5', '#d9a37c', '#a9714f', '#7a4a32', '#f6d9bf'];

export class Crowd {
  group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private w: Walker[] = [];
  private rng = mulberry32(99);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private y = new THREE.Vector3(0, 1, 0);
  private t = 0;
  count = 0;
  scaleMul = 1;

  constructor(private g: Graph, cap = 420) {
    this.body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 6).translate(0, 0.31, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), cap);
    this.head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 0).translate(0, 0.78, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), cap);
    for (const im of [this.body, this.head]) { im.frustumCulled = false; im.castShadow = false; this.group.add(im); }
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      this.body.setMatrixAt(i, z); this.head.setMatrixAt(i, z);
      this.body.setColorAt(i, new THREE.Color(pick(this.rng, BODY)));
      this.head.setColorAt(i, new THREE.Color(pick(this.rng, SKIN)));
      this.w.push({ active: false, path: [], pi: 0, s: 0, e: 0, fwd: true, speed: 2, phase: this.rng() * 6, side: 1, dest: 0, fade: 0 });
    }
  }

  /** send a walker along a node path */
  send(path: number[], speed = 2.4) {
    const w = this.w.find((x) => !x.active); if (!w || path.length < 2) return false;
    const e = edgeBetween(this.g, path[0], path[1]); if (!e) return false;
    w.active = true; w.path = path; w.pi = 1; w.e = e.id; w.fwd = e.a === path[0]; w.s = 0; w.speed = speed * range(this.rng, 0.8, 1.2);
    w.side = this.rng() < 0.5 ? 1 : -1; w.fade = 0; w.dest = path[path.length - 1];
    this.count++;
    return true;
  }
  sendBetween(a: number, b: number, speed = 2.4) {
    const p = shortestPath(this.g, a, b, { ignoreOneway: true, avoid: (e) => e.kind === 'highway' });
    return p ? this.send(p, speed) : false;
  }
  clear() { for (const w of this.w) w.active = false; this.count = 0; }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.w.length; i++) {
      const w = this.w[i];
      if (!w.active) { if (w.fade !== -1) { this.body.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.head.setMatrixAt(i, this.m); w.fade = -1; } continue; }
      w.fade = Math.min(1, (w.fade < 0 ? 0 : w.fade) + dt * 3);
      const e = this.g.edges[w.e];
      w.s += w.speed * dt;
      if (w.s >= e.len) {
        const v = w.fwd ? e.b : e.a;
        const nxt = w.path[w.pi];
        if (nxt === undefined) { w.active = false; this.count--; continue; }
        const ne = edgeBetween(this.g, v, nxt);
        if (!ne) { w.active = false; this.count--; continue; }
        w.s -= e.len; w.e = ne.id; w.fwd = ne.a === v; w.pi++;
        if (w.s > ne.len) w.s = 0;
      }
      const ee = this.g.edges[w.e];
      const A = this.g.nodes[w.fwd ? ee.a : ee.b], B = this.g.nodes[w.fwd ? ee.b : ee.a];
      const t = Math.min(1, w.s / ee.len);
      const dx = (B.x - A.x) / ee.len, dz = (B.z - A.z) / ee.len;
      const off = (ee.bridge || ee.kind === 'highway' ? ee.w / 2 - 0.5 : ee.w / 2 + 0.25) * w.side;
      const bob = Math.abs(Math.sin(this.t * 9 + w.phase)) * 0.06;
      this.p.set(A.x + (B.x - A.x) * t - dz * off, A.y + (B.y - A.y) * t + 0.07 + bob, A.z + (B.z - A.z) * t + dx * off);
      this.q.setFromAxisAngle(this.y, -Math.atan2(dz, dx));
      this.s.setScalar(Math.min(1, w.fade) * 1.75 * this.scaleMul);
      this.m.compose(this.p, this.q, this.s);
      this.body.setMatrixAt(i, this.m); this.head.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true; this.head.instanceMatrix.needsUpdate = true;
  }
}
