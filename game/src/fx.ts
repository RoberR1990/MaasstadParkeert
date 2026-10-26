// Juice: dust puffs, debris chips, expanding ring.
import * as THREE from 'three';
import { puffTexture } from './tex';
import { mulberry32 } from './util';

interface Puff { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; s0: number; s1: number }
interface Chip { v: THREE.Vector3; p: THREE.Vector3; r: THREE.Vector3; life: number; sc: number }

export class Fx {
  group = new THREE.Group();
  private puffs: Puff[] = [];
  private chips: Chip[] = [];
  private chipMesh: THREE.InstancedMesh;
  private rings: { m: THREE.Mesh; t: number }[] = [];
  private rng = mulberry32(4242);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor() {
    const tex = puffTexture();
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: '#f3e8d6', fog: true }));
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ s, v: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 2 });
    }
    this.chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 36);
    const cols = ['#e7c07a', '#d9805f', '#7aa6a6', '#efe6d4', '#9fb58b', '#b97a8f'];
    for (let i = 0; i < 36; i++) {
      this.chipMesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      this.chips.push({ v: new THREE.Vector3(), p: new THREE.Vector3(), r: new THREE.Vector3(), life: 0, sc: 1 });
      this.chipMesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
    }
    this.chipMesh.frustumCulled = false;
    this.chipMesh.castShadow = true;
    this.group.add(this.chipMesh);
    const rg = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false; m.renderOrder = 6;
      this.group.add(m);
      this.rings.push({ m, t: 1 });
    }
  }

  burst(x: number, y: number, z: number) {
    const r = this.rng;
    let n = 0;
    for (const p of this.puffs) {
      if (p.life > 0 || n >= 16) continue;
      n++;
      const a = r() * Math.PI * 2, sp = 1.2 + r() * 2.2;
      p.v.set(Math.cos(a) * sp, 0.6 + r() * 1.3, Math.sin(a) * sp);
      p.s.position.set(x + Math.cos(a) * 0.9, y + 0.1, z + Math.sin(a) * 0.9);
      p.life = p.max = 0.8 + r() * 0.5;
      p.s0 = 0.5 + r() * 0.4; p.s1 = 2.0 + r() * 1.5;
      p.s.visible = true;
    }
    let c = 0;
    for (let i = 0; i < this.chips.length && c < 24; i++) {
      const ch = this.chips[i];
      if (ch.life > 0) continue;
      c++;
      const a = r() * Math.PI * 2, sp = 2 + r() * 3;
      ch.v.set(Math.cos(a) * sp, 4 + r() * 4, Math.sin(a) * sp);
      ch.p.set(x, y + 0.3, z);
      ch.r.set(r() * 8, r() * 8, r() * 8);
      ch.life = 0.9 + r() * 0.5; ch.sc = 0.6 + r() * 0.9;
    }
    const ring = this.rings.find((q) => q.t >= 1);
    if (ring) { ring.t = 0; ring.m.position.set(x, y + 0.05, z); ring.m.visible = true; }
  }

  update(dt: number) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; (p.s.material as THREE.SpriteMaterial).opacity = 0; continue; }
      const t = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.pow(0.04, dt));
      p.v.y += dt * 0.5;
      const s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - t, 2));
      p.s.scale.set(s, s, 1);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.75 * (1 - t * 0.3);
    }
    let dirty = false;
    this.chips.forEach((c, i) => {
      if (c.life <= 0) return;
      c.life -= dt;
      dirty = true;
      if (c.life <= 0) { this.chipMesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); return; }
      c.v.y -= 16 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.2) { c.p.y = 0.2; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; }
      this.q.setFromEuler(this.e.set(c.r.x * c.life, c.r.y * c.life, c.r.z * c.life));
      const s = c.sc * Math.min(1, c.life * 3);
      this.m4.compose(c.p, this.q, new THREE.Vector3(s, s, s));
      this.chipMesh.setMatrixAt(i, this.m4);
    });
    if (dirty) this.chipMesh.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t += dt / 0.9;
      if (r.t >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - r.t, 3);
      const s = 1 + e * 3.6;
      r.m.scale.set(s, 1, s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.9;
    }
  }
}
