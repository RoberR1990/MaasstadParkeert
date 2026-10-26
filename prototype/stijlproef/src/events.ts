// Events: "Wedstrijddag in De Kuip" and "Bokito ontsnapt uit Blijdorp". They only drive the shared systems
// (cars hotspot / blockers / routed cars, crowd, floodlights, banner); the sim state itself stays untouched.
import * as THREE from 'three';
import type { World } from './world';
import type { CarSystem } from './cars';
import type { Crowd } from './crowd';
import type { Hud } from './hud';
import { audio } from './audio';
import { nearestNode, shortestPath } from './route';
import { bubbleTexture } from './tex';
import { clamp, lerp, mulberry32 } from './util';

export type EventId = 'wedstrijd' | 'gorilla';

const KUIP: [number, number] = [77, 67];
const CFG = {
  wedstrijd: { countdown: 48, match: 34, carEvery: 0.9, carMax: 34, pedEvery: 0.16, pedMax: 300, hotspotR: 46 },
  gorilla: { gorillaStart: 1.2, gorillaSpeed: 5.6, vanStart: 5, vanSpeed: 7.0, caughtHold: 6.5 },
};

class Polyline {
  pts: THREE.Vector3[] = []; cum: number[] = [0];
  constructor(pts: THREE.Vector3[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  get length() { return this.cum[this.cum.length - 1]; }
  at(s: number, out = new THREE.Vector3()): { p: THREE.Vector3; yaw: number } {
    s = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const t = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    out.lerpVectors(a, b, t);
    return { p: out, yaw: Math.atan2(b.z - a.z, b.x - a.x) };
  }
}

export function makeGorilla(): THREE.Group {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#4d4642', roughness: 0.95, flatShading: true });
  const chest = new THREE.MeshStandardMaterial({ color: '#7a6c64', roughness: 0.95, flatShading: true });
  const face = new THREE.MeshStandardMaterial({ color: '#241f1f', roughness: 0.8, flatShading: true });
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
  };
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  const body = new THREE.Group(); g.add(body);
  const bm = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; body.add(m); return m;
  };
  // torso leans forward (+x is the running direction)
  bm(ico, fur, 0.0, 1.15, 0, 1.55, 1.5, 1.35);
  bm(ico, chest, 0.34, 1.12, 0, 0.9, 1.0, 1.0);
  bm(ico, fur, -0.55, 0.95, 0, 1.0, 0.9, 1.1);
  // head with brow ridge + muzzle
  const head = new THREE.Group(); head.position.set(0.72, 1.62, 0); body.add(head);
  const hm = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; head.add(m); return m;
  };
  hm(ico, fur, 0, 0.08, 0, 0.8, 0.8, 0.8);
  hm(ico, fur, -0.05, 0.3, 0, 0.7, 0.55, 0.7); // crown
  hm(ico, face, 0.22, 0.0, 0, 0.45, 0.45, 0.55); // muzzle
  hm(new THREE.BoxGeometry(0.16, 0.1, 0.62), fur, 0.2, 0.17, 0); // brow
  for (const s of [-1, 1]) hm(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: '#f6efe0' }), 0.34, 0.1, s * 0.13);
  // arms (knuckle walking) and legs, pivoted at the shoulder / hip so they can swing
  const limbs: THREE.Group[] = [];
  const limb = (x: number, z: number, len: number, rad: number, y: number) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z); body.add(piv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.8, len, 6), fur); m.position.y = -len / 2; m.castShadow = true; piv.add(m);
    const hand = new THREE.Mesh(ico, face); hand.scale.setScalar(rad * 1.6); hand.position.y = -len; piv.add(hand);
    limbs.push(piv); return piv;
  };
  limb(0.4, 0.78, 1.25, 0.22, 1.45); limb(0.4, -0.78, 1.25, 0.22, 1.45);
  limb(-0.45, 0.4, 0.8, 0.22, 0.85); limb(-0.45, -0.4, 0.8, 0.22, 0.85);
  g.userData = { body, limbs, head };
  g.scale.setScalar(1.75);
  return g;
}

function makeVan(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f1efe6', roughness: 0.5 });
  const green = new THREE.MeshStandardMaterial({ color: '#00811f', roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#27323d', roughness: 0.2 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.7, 0.9, 1.2), white, 0, 0.7, 0);
  add(new THREE.BoxGeometry(1.7, 0.7, 1.16), white, -0.4, 1.35, 0);
  add(new THREE.BoxGeometry(0.8, 0.5, 1.22), glass, 0.62, 1.3, 0);
  add(new THREE.BoxGeometry(2.72, 0.2, 1.24), green, 0, 0.62, 0);
  for (const x of [-0.9, 0.9]) for (const z of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1c1f24' }), x, 0.26, z);
  const light = new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false });
  const lb = add(new THREE.BoxGeometry(0.34, 0.14, 0.7), light, 0.1, 1.76, 0);
  g.userData.light = lb;
  return g;
}

export class Events {
  active: EventId | null = null;
  t = 0;
  /** extra pressure (0..1) added to the player's slider while an event runs */
  pressureBoost = 0;
  /** camera assist: a world point the camera may drift towards */
  focus: THREE.Vector3 | null = null;
  private rng = mulberry32(55);
  private carT = 0; private pedT = 0; private carsSent = 0; private pedsSent = 0;
  private flood = 0; private floodTarget = 0;
  private kuipNode: number;
  private starts: number[];
  private gor = makeGorilla();
  private van = makeVan();
  private route: Polyline | null = null;
  private caught = false; private caughtT = 0; private vanS = 0; private gorS = 0;
  private roared = false;
  private beamMat: THREE.MeshBasicMaterial | null;
  private mark: THREE.Sprite;
  private phase = '';
  onToast: (text: string, small: string) => void = () => {};

  constructor(private world: World, private cars: CarSystem, private crowd: Crowd, private hud: Hud, scene: THREE.Object3D) {
    const g = world.graph;
    this.kuipNode = nearestNode(g, 64, 52);
    // cars / people enter from the north-east and north-west boundaries or the station
    this.starts = [nearestNode(g, 104, -42), nearestNode(g, -104, -18), nearestNode(g, 0, -56), nearestNode(g, 50, -84), nearestNode(g, 76, -84)];
    this.gor.visible = false; this.van.visible = false;
    scene.add(this.gor, this.van);
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('!', '#fff3cf', '#d94a1a'), depthWrite: false, fog: false, transparent: true }));
    this.mark.center.set(0.5, 0.1); this.mark.visible = false; this.mark.renderOrder = 11;
    scene.add(this.mark);
    const bm = world.landmark.kuipBeamMat as THREE.Mesh | undefined;
    this.beamMat = bm ? (bm.material as THREE.MeshBasicMaterial) : null;
  }

  start(id: EventId) {
    if (this.active) this.stop(true);
    this.active = id; this.t = 0; this.phase = ''; this.caught = false; this.roared = false;
    this.carsSent = 0; this.pedsSent = 0; this.carT = 0; this.pedT = 0;
    this.hud.setEventActive(true);
    if (id === 'wedstrijd') {
      this.hud.banner('Feyenoord speelt thuis!', 'Wedstrijddag in De Kuip: auto’s en supporters stromen toe.');
      this.cars.hotspot = { x: KUIP[0], z: 62, r: CFG.wedstrijd.hotspotR, k: 1 };
      this.floodTarget = 1; this.pressureBoost = 0.18;
      audio.started && audio.whistle();
    } else {
      this.hud.banner('Bokito ontsnapt uit Blijdorp!', 'Hij zoekt alleen een parkeerplek. Auto’s: rem!', true);
      this.buildGorillaRoute();
      this.gor.visible = true; this.van.visible = false;
      this.pressureBoost = 0;
    }
  }

  stop(silent = false) {
    if (!this.active) return;
    this.active = null; this.floodTarget = 0; this.pressureBoost = 0;
    this.cars.hotspot = null; this.cars.blockers = []; this.focus = null;
    this.gor.visible = false; this.van.visible = false; this.mark.visible = false;
    audio.setCrowd(0);
    this.crowd.clear();
    this.hud.setEventActive(false);
    if (!silent) this.hud.clearBanner();
  }

  private buildGorillaRoute() {
    const g = this.world.graph;
    const a = nearestNode(g, 50, -64), b = nearestNode(g, 0, -18);
    const nodes = shortestPath(g, a, b) ?? [a];
    const pts = [new THREE.Vector3(43, 0.05, -77), new THREE.Vector3(40, 0.05, -71), new THREE.Vector3(38, 0.1, -65.5), new THREE.Vector3(38, 0.1, -64)];
    pts.push(new THREE.Vector3(g.nodes[a].x, 0.1, g.nodes[a].z));
    for (const n of nodes.slice(1)) pts.push(new THREE.Vector3(g.nodes[n].x, 0.1 + g.nodes[n].y, g.nodes[n].z));
    this.route = new Polyline(pts);
  }

  private setFlood(l: number) {
    const w = this.world;
    w.floodMat.color.setRGB(lerp(0.8, 4.2, l), lerp(0.78, 3.7, l), lerp(0.72, 2.8, l));
    if (this.beamMat) this.beamMat.opacity = l * 0.085;
  }

  camDist = () => 150;
  update(dt: number) {
    this.flood = lerp(this.flood, this.floodTarget, 1 - Math.exp(-2 * dt));
    this.setFlood(this.flood);
    if (!this.active) return;
    this.t += dt;
    if (this.active === 'wedstrijd') this.updateMatch(dt); else this.updateGorilla(dt);
  }

  private updateMatch(dt: number) {
    const C = CFG.wedstrijd;
    const g = this.world.graph;
    const left = C.countdown - this.t;
    if (left > 0) {
      const m = Math.floor(left / 60), s = Math.ceil(left % 60);
      this.hud.bannerCount(`Aftrap over ${m}:${String(s % 60).padStart(2, '0')}`);
      this.carT -= dt; this.pedT -= dt;
      if (this.carT <= 0 && this.carsSent < C.carMax) {
        this.carT = C.carEvery;
        const st = this.starts[Math.floor(this.rng() * this.starts.length)];
        const path = shortestPath(g, st, this.kuipNode);
        if (path && this.cars.spawnRouted(path, 'search', 6.2)) this.carsSent++;
      }
      if (this.pedT <= 0 && this.pedsSent < C.pedMax) {
        this.pedT = C.pedEvery;
        const st = this.starts[Math.floor(this.rng() * this.starts.length)];
        if (this.crowd.sendBetween(st, this.kuipNode, 3.0)) this.pedsSent++;
      }
      audio.setCrowd(clamp(0.15 + (this.t / C.countdown) * 0.3));
    } else {
      if (this.phase !== 'match') {
        this.phase = 'match';
        this.hud.bannerSub('Aftrap! Het wordt stil op straat en luid in De Kuip.');
        this.hud.bannerCount('Aftrap!');
        audio.started && (audio.whistle(), audio.swell());
        this.pressureBoost = 0.1;
      }
      const k = (this.t - C.countdown) / C.match;
      audio.setCrowd(0.65 + 0.3 * Math.sin(this.t * 0.9));
      if (Math.random() < dt * 0.25) audio.swell();
      if (k > 1) { this.stop(); this.hud.toast('Fluitsignaal. Iedereen naar huis.', 'Wedstrijddag voorbij'); }
    }
  }

  private updateGorilla(dt: number) {
    const C = CFG.gorilla;
    const R = this.route!;
    const gor = this.gor, van = this.van;
    const ud = gor.userData as { body: THREE.Group; limbs: THREE.Group[]; head: THREE.Group };
    if (!this.roared && this.t > 0.6) { this.roared = true; audio.started && audio.roar(); }
    const tg = this.t - C.gorillaStart;
    if (!this.caught) {
      this.gorS = Math.max(0, tg) * C.gorillaSpeed;
      const { p, yaw } = R.at(Math.min(this.gorS, R.length));
      const run = this.gorS < R.length;
      gor.position.set(p.x, Math.abs(Math.sin(this.t * 11)) * (run ? 0.18 : 0), p.z);
      gor.rotation.y = -yaw;
      const sw = Math.sin(this.t * 11) * 0.9;
      ud.limbs[0].rotation.z = sw; ud.limbs[1].rotation.z = -sw; ud.limbs[2].rotation.z = -sw; ud.limbs[3].rotation.z = sw;
      ud.body.rotation.z = -0.1 + Math.sin(this.t * 22) * 0.02;
      
      // cars stop for him
      this.cars.blockers = [{ x: p.x, z: p.z, r: 7.5 }];
      if (Math.random() < dt * 0.8 && audio.started) audio.honk();
      this.focus = gor.position.clone();
      this.mark.visible = true; this.mark.position.set(p.x, 4.4 + Math.sin(this.t * 6) * 0.2, p.z);
      const ms = clamp(this.camDist() * 0.032, 3, 9); this.mark.scale.set(ms, ms, 1);
      // zookeeper van joins the chase
      const tv = this.t - C.vanStart;
      if (tv > 0) {
        van.visible = true;
        this.vanS = tv * C.vanSpeed;
        const vp = R.at(Math.min(this.vanS, R.length));
        van.position.set(vp.p.x, 0.07, vp.p.z); van.rotation.y = -vp.yaw;
        (van.userData.light as THREE.Mesh).visible = Math.sin(this.t * 12) > 0;
      }
      this.hud.bannerCount(`Achtervolging ${Math.floor(this.t)} s`);
      if (tv > 0 && this.vanS >= this.gorS - 2.4 || this.gorS >= R.length) {
        this.caught = true; this.caughtT = 0;
        this.cars.blockers = [{ x: p.x, z: p.z, r: 9 }];
        this.hud.banner('Gevangen!', 'Bokito is terug in Blijdorp. Ken je die van 2007 nog?', false);
        this.onToast('Badge: Apenkooi', 'Alle auto’s stonden stil voor een aap');
        audio.started && audio.chime();
      }
    } else {
      this.caughtT += dt;
      // gorilla sits down, van parks next to him
      ud.body.rotation.z = lerp(ud.body.rotation.z, 0.25, 1 - Math.exp(-4 * dt));
      for (const l of ud.limbs) l.rotation.z *= 1 - Math.min(1, dt * 5);
      if (this.caughtT > C.caughtHold) { this.stop(); }
    }
  }
}
