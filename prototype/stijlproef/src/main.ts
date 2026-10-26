import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Environment } from './env';
import { World, Lot } from './world';
import { CarSystem } from './cars';
import { Crowd } from './crowd';
import { Events, EventId } from './events';
import { Fx } from './fx';
import { Post } from './post';
import { Hud, PersonaId } from './hud';
import { Tutorial } from './tutorial';
import { CharCard } from './charcard';
import { SAP_SVG } from './avatar';
import { audio } from './audio';
import { TOOLS, ToolId, makeStructure } from './structures';
import { WORLD_CENTRE } from './config';
import { clamp, damp, easeInOutCubic, easeOutBack, lerp } from './util';

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PAD = 0.05;

// ------------------------------------------------------------------ quality tiers
type Tier = 'high' | 'med' | 'low';
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const TIERS: Record<Tier, { shadow: number; dpr: number; tilt: boolean; smaa: boolean }> = {
  high: { shadow: 3072, dpr: 1.75, tilt: true, smaa: true },
  med: { shadow: 2048, dpr: 1.25, tilt: true, smaa: false },
  low: { shadow: 1024, dpr: 1.5, tilt: false, smaa: false },
};
let tier: Tier = (['high', 'med', 'low'] as const).includes(q.get('q') as Tier) ? (q.get('q') as Tier) : isMobile ? 'low' : 'high';
const autoTier = q.get('q') === null;

// ------------------------------------------------------------------ renderer / scene
const canvas = $('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
renderer.shadowMap.enabled = !/[?&]noshadow=1/.test(location.search);
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // ACES is applied in the post-processing chain
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 1, 900);

const env = new Environment(scene, renderer);
await document.fonts.load('700 48px "Fredoka Variable"').catch(() => {});
const world = new World(env);
scene.add(world.group);
const cars = new CarSystem(world.graph, world.bays);
scene.add(cars.group);
const crowd = new Crowd(world.graph);
scene.add(crowd.group);
const fx = new Fx();
scene.add(fx.group);
const post = new Post(renderer, scene, camera);

// ------------------------------------------------------------------ game state
const game = {
  funds: 120, quarter: 0, qTimer: 0, qDur: 40,
  tool: null as ToolId | null,
  placed: { garage: 0, automaat: 0, fiets: 0 } as Record<ToolId, number>,
  pressure: clamp(+(q.get('pressure') ?? 60) / 100),
  paused: q.get('pause') === '1',
  playing: false,
  hover: null as { lot: Lot; sub: number } | null,
  searchLevel: 0, shake: 0,
};
env.hour = +(q.get('hour') ?? 11);
env.rainTarget = q.get('rain') === '1' ? 1 : 0;
const HOUR_PER_SEC = 24 / 60;

// ------------------------------------------------------------------ camera
const START = { tx: 14, tz: 24, az: 2.72, pol: 1.1, dist: 255 };
const portrait = () => window.innerWidth / window.innerHeight < 0.8;
const startDist = () => Number(q.get('dist') ?? (portrait() ? 205 : START.dist));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9; controls.panSpeed = 0.8;
controls.screenSpacePanning = false; controls.zoomToCursor = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.minDistance = 14; controls.maxDistance = 360;
controls.minPolarAngle = 0.22; controls.maxPolarAngle = 1.43;
controls.target.set(START.tx, 0, START.tz);
const camPose = { az: START.az, pol: START.pol, dist: 300 };
function applyPose(p = camPose) {
  camera.position.setFromSpherical(new THREE.Spherical(p.dist, p.pol, p.az)).add(controls.target);
  camera.lookAt(controls.target);
}
function setCamera(tx: number, tz: number, dist: number, az: number, pol: number) {
  controls.target.set(tx, 0, tz); camPose.az = az; camPose.pol = pol; camPose.dist = dist; applyPose(); controls.update();
}
controls.enabled = false; controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
let idle = 0;
controls.addEventListener('start', () => { idle = -1; controls.autoRotate = false; camTween = null; });
controls.addEventListener('end', () => { idle = 0; });

let camTween: { t: number; dur: number; from: { az: number; pol: number; dist: number; tx: number; tz: number }; to: { az: number; pol: number; dist: number; tx: number; tz: number } } | null = null;
function tweenToPlayView(dur = 2.4) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let az = s.theta;
  while (az - START.az > Math.PI) az -= Math.PI * 2;
  while (az - START.az < -Math.PI) az += Math.PI * 2;
  camTween = { t: 0, dur, from: { az, pol: s.phi, dist: s.radius, tx: controls.target.x, tz: controls.target.z }, to: { az: START.az, pol: START.pol, dist: startDist(), tx: START.tx, tz: START.tz } };
  controls.autoRotate = false; controls.enabled = false;
}

// ------------------------------------------------------------------ HUD + audio wiring
const hud = new Hud();
const cards = new CharCard('cardlayer', (k) => { if (audio.started) (k === 'click' ? audio.click() : audio.chime()); });
let rainToastShown = false;
// iOS needs the AudioContext to be created/resumed inside touchend/click; keep resuming on later gestures too.
const unlock = () => { audio.start(); };
for (const ev of ['pointerup', 'touchend', 'click', 'keydown'] as const) window.addEventListener(ev, unlock, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resume(); });

hud.onSound = (k, v) => { if (!audio.started) return; if (k === 'click') audio.click(); else if (k === 'tick') audio.tick(); else audio.sliderTick(v ?? 0); };
hud.onPressure = (v) => { game.pressure = v; };
hud.onClock = () => { game.paused = !game.paused; };
hud.onRain = () => {
  env.rainTarget = env.rainTarget > 0 ? 0 : 1; hud.setRain(env.rainTarget > 0);
  // Easter egg: the Kleinpolderplein slogan only appears when it rains AND the camera is near our office.
  if (env.rainTarget > 0 && !rainToastShown && nearKleinpolder()) { rainToastShown = true; hud.toast('Steden schuilen niet wanneer het regent.', 'Easter egg · Kleinpolderplein', 6200); }
};
hud.onMute = () => { audio.setMuted(!audio.muted); hud.setMute(audio.muted); };
hud.onTool = (id) => selectTool(id);
hud.setRain(env.rainTarget > 0);
($('p-range') as HTMLInputElement).value = String(Math.round(game.pressure * 100));

const events = new Events(world, cars, crowd, hud, scene);
events.onToast = (t, s) => hud.toast(t, s, 5200);
events.camDist = () => camera.position.distanceTo(controls.target);
hud.onEvent = (id) => { if (id) events.start(id as EventId); else events.stop(); };

function selectTool(id: ToolId | null) {
  game.tool = id;
  hud.selectTool(id);
  rebuildGhost();
  if (id) hud.hint(id === 'garage' ? 'Garage: kies een vrije kavel (gloeit geel) · Esc om te stoppen' : `${TOOLS[id].label}: kies een kwart van een kavel · Esc om te stoppen`);
  else if (!tutorial.active) hud.hint(null);
}

// ------------------------------------------------------------------ ghost + placing
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9, -9);
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD);
const hit = new THREE.Vector3();
let ghost: THREE.Group | null = null;
let ghostTool: ToolId | null = null;
const ghostMat = new THREE.MeshStandardMaterial({ color: '#7fe0a8', emissive: '#2f9e6a', emissiveIntensity: 0.9, transparent: true, opacity: 0.74, depthWrite: true, roughness: 0.5 });
const ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#7fe0a8', transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false }));
ghostRing.visible = false; ghostRing.renderOrder = 7;
scene.add(ghostRing);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#7fe0a8', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
beam.visible = false; beam.renderOrder = 8;
scene.add(beam);
const arrowGeo = new THREE.ConeGeometry(0.9, 1.9, 4).rotateX(Math.PI).rotateY(Math.PI / 4);
const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffd264', toneMapped: false, fog: false }), world.lots.length);
arrows.frustumCulled = false; arrows.renderOrder = 9;
scene.add(arrows);
const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < world.lots.length; i++) arrows.setMatrixAt(i, zeroM);

function rebuildGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; }
  ghostTool = game.tool;
  if (!game.tool) return;
  ghost = makeStructure(game.tool, world.glowMat);
  ghost.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.material = ghostMat; m.castShadow = false; m.receiveShadow = false; }
  });
  ghost.visible = false;
  scene.add(ghost);
}

const SUB = 3; // offset of a 6x6 sub-lot from the lot centre
const subOffset = (i: number): [number, number] => [(i % 2 ? 1 : -1) * SUB, (i >= 2 ? 1 : -1) * SUB];
function lotAt(x: number, z: number, tool: ToolId): { lot: Lot; sub: number } | null {
  for (const l of world.lots) {
    const dx = x - l.cx, dz = z - l.cz, h = l.size / 2 + 0.8;
    if (Math.abs(dx) > h || Math.abs(dz) > h) continue;
    const sub = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
    return { lot: l, sub: tool === 'garage' ? -1 : sub };
  }
  return null;
}
const canPlace = (h: { lot: Lot; sub: number }, tool: ToolId) => (tool === 'garage' ? h.lot.free : h.lot.subs[h.sub]);

function screenOf(p: THREE.Vector3) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function pickAt(cx: number, cy: number) {
  mouse.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

let downPos = { x: 0, y: 0 };
const lastPointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
canvas.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  if (e.pointerType === 'mouse') hoverLabelAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { mouse.set(-9, -9); hideLabelTip(); });
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; if (e.button === 2) selectTool(null); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', (e) => {
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) return;
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  if (game.tool && game.playing) {
    const p = pickAt(e.clientX, e.clientY);
    const h = p ? lotAt(p.x, p.z, game.tool) : null;
    if (h) tryPlace(h.lot, game.tool, h.sub); else if (p) hud.floater(e.clientX, e.clientY - 20, 'Kies een kavel', 'msg', false);
    return;
  }
  // tap on a landmark: pinned label (touch friendly)
  hoverLabelAt(e.clientX, e.clientY, true);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectTool(null);
  if (e.key === '1') selectTool('garage');
  if (e.key === '2') selectTool('automaat');
  if (e.key === '3') selectTool('fiets');
  if (e.key.toLowerCase() === 'm') hud.onMute();
  if (e.key.toLowerCase() === 'n') toggleLabels();
  if (e.key === ' ') { game.paused = !game.paused; e.preventDefault(); }
});

const placedAnims: { g: THREE.Group; t: number }[] = [];
const placedList: { x: number; z: number; id: ToolId }[] = [];

function tryPlace(lot: Lot, id: ToolId, sub: number) {
  const info = TOOLS[id];
  if (!canPlace({ lot, sub }, id)) { audio.started && audio.error(); hud.shakeTool(id); hud.floater(lastPointer.x, lastPointer.y - 20, id === 'garage' ? 'Een garage heeft een hele kavel nodig' : 'Hier staat al iets', 'msg', false); return false; }
  if (game.funds < info.cost) { audio.started && audio.error(); hud.shakeTool(id); hud.floater(lastPointer.x, lastPointer.y - 20, 'Te weinig geld in het fonds', 'msg', false); return false; }
  place(lot, id, sub);
  return true;
}

function place(lot: Lot, id: ToolId, sub: number) {
  const info = TOOLS[id];
  const [ox, oz] = id === 'garage' ? [0, 0] : subOffset(sub);
  if (id === 'garage') lot.subs = [false, false, false, false]; else lot.subs[sub] = false;
  lot.free = false;
  const g = makeStructure(id, world.glowMat);
  g.position.set(lot.cx + ox, 0, lot.cz + oz);
  g.scale.set(1, 0.001, 1);
  world.structures.add(g);
  placedAnims.push({ g, t: 0 });
  fx.burst(lot.cx + ox, PAD, lot.cz + oz);
  game.shake = 0.45;
  game.funds -= info.cost;
  game.placed[id]++;
  hud.setFunds(game.funds);
  const sp = screenOf(new THREE.Vector3(lot.cx + ox, 3, lot.cz + oz));
  hud.floater(sp.x, sp.y, `−${info.costLabel}`, 'neg');
  if (audio.started) { audio.plop(); audio.coin(); audio.whoosh(); }
  hud.setUpkeep((Object.keys(game.placed) as ToolId[]).reduce((s, k) => s + game.placed[k] * TOOLS[k].upkeep, 0));
  placedList.push({ x: lot.cx + ox, z: lot.cz + oz, id });
  cars.setReliefs(placedList.map((p) => ({ x: p.x, z: p.z, r: p.id === 'garage' ? 46 : p.id === 'fiets' ? 20 : 17, k: p.id === 'garage' ? 0.95 : p.id === 'fiets' ? 0.14 : 0.1 })));
  cars.onRelief();
  tutorial.notifyPlaced(id);
  if (id === 'garage' && tutorial.active) window.setTimeout(showSap, 1100);
  selectTool(null);
  hud.setAffordable(game.funds);
}
function showSap() {
  cards.show({ id: 'sap', name: 'Sap', role: 'Adviseur · oud-MT', svg: SAP_SVG, text: 'Mooi die garage, jongen. Nu nog iemand die ’m schoonhoudt.', ms: 9000 });
}

// ------------------------------------------------------------------ labels (hover / tap + "show all")
const tip = $('tooltip');
let tipPinned = 0;
let labelsAll = false;
const chips = new Map<string, HTMLElement>();
function nearKleinpolder() { const k = world.labels.find((l) => l.id === 'kleinpolder'); return !!k && Math.hypot(controls.target.x - k.x, controls.target.z - k.z) < 60; }
function labelScale() { return window.innerHeight / (2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }
function labelAt(cx: number, cy: number) {
  const k = labelScale();
  let best: (typeof world.labels)[number] | null = null; let bd = 1e9;
  const v = new THREE.Vector3();
  for (const l of world.labels) {
    // anchor on the ground and at the landmark's height
    const p0 = screenOf(v.set(l.x, 0, l.z)), p1 = screenOf(new THREE.Vector3(l.x, l.y, l.z));
    const rad = Math.max(isMobile ? 34 : 26, l.r * k * 0.9);
    // distance to the vertical segment between ground and top
    const sx = p1.x - p0.x, sy = p1.y - p0.y; const len2 = sx * sx + sy * sy || 1;
    const t = clamp(((cx - p0.x) * sx + (cy - p0.y) * sy) / len2);
    const d = Math.hypot(cx - (p0.x + sx * t), cy - (p0.y + sy * t));
    if (d < rad && d < bd) { bd = d; best = l; }
  }
  return best;
}
function showLabelTip(l: NonNullable<ReturnType<typeof labelAt>>, pin = false) {
  (tip.querySelector('b') as HTMLElement).textContent = l.name;
  (tip.querySelector('span') as HTMLElement).textContent = l.sub ?? '';
  const p = screenOf(new THREE.Vector3(l.x, l.y, l.z));
  tip.classList.add('show');
  const tw = tip.offsetWidth;
  tip.style.left = `${clamp(p.x, tw / 2 + 8, window.innerWidth - tw / 2 - 8)}px`;
  tip.style.top = `${clamp(p.y - tip.offsetHeight - 14, 8, window.innerHeight - 80)}px`;
  if (pin) tipPinned = 4;
}
function hideLabelTip() { if (tipPinned <= 0) tip.classList.remove('show'); }
function hoverLabelAt(cx: number, cy: number, pin = false) {
  if (game.tool || camTween) return;
  const l = labelAt(cx, cy);
  if (l) { showLabelTip(l, pin); canvas.style.cursor = 'help'; } else { canvas.style.cursor = ''; if (pin) tipPinned = 0; hideLabelTip(); }
}
function toggleLabels(on = !labelsAll) {
  labelsAll = on; hud.setLabels(on);
  const root = $('labels');
  root.innerHTML = ''; chips.clear();
  if (on) for (const l of world.labels) {
    const el = document.createElement('div'); el.className = 'lbl-chip' + (l.id === 'kleinpolder' ? ' hot' : '');
    el.textContent = l.id === 'kleinpolder' ? 'Kleinpolderplein — hier werken wij' : l.name;
    root.appendChild(el); chips.set(l.id, el);
  }
}
const FAR = ['cs', 'kleinpolder', 'kuip'];
const edgeChips = new Map<string, HTMLElement>();
function flyTo(l: { x: number; z: number }) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let az = s.theta; while (az - START.az > Math.PI) az -= Math.PI * 2; while (az - START.az < -Math.PI) az += Math.PI * 2;
  camTween = { t: 0, dur: 1.6, from: { az, pol: s.phi, dist: s.radius, tx: controls.target.x, tz: controls.target.z }, to: { az: START.az, pol: 0.95, dist: 110, tx: l.x, tz: l.z } };
  controls.enabled = false;
}
function updateEdgeChips() {
  if (!game.playing) { for (const e of edgeChips.values()) e.style.display = 'none'; return; }
  const v = new THREE.Vector3();
  for (const l of world.labels) {
    if (!FAR.includes(l.id)) continue;
    let el = edgeChips.get(l.id);
    if (!el) {
      el = document.createElement('button'); el.className = 'edge-chip';
      el.textContent = l.id === 'kleinpolder' ? 'Kleinpolderplein' : l.name;
      el.addEventListener('click', (e) => { e.stopPropagation(); flyTo(l); });
      $('labels').appendChild(el); edgeChips.set(l.id, el);
    }
    v.set(l.x, l.y * 0.5, l.z).project(camera);
    const inside = v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9;
    if (labelsAll || inside) { el.style.display = 'none'; continue; }
    let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
    const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8, 1e-3);
    x /= k; y /= k;
    const W = window.innerWidth, H = window.innerHeight;
    el.style.display = '';
    el.style.left = `${clamp((x * 0.5 + 0.5) * W, 70, W - 70)}px`;
    el.style.top = `${clamp((-y * 0.5 + 0.5) * H, 96, H - 96)}px`;
    el.textContent = (l.id === 'kleinpolder' ? 'Kleinpolderplein' : l.name) + (y > 0.5 ? ' ↑' : y < -0.5 ? ' ↓' : x > 0 ? ' →' : ' ←');
  }
}
function updateChips() {
  updateEdgeChips();
  if (!labelsAll) return;
  const v = new THREE.Vector3();
  for (const l of world.labels) {
    const el = chips.get(l.id); if (!el) continue;
    v.set(l.x, l.y, l.z).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    el.style.opacity = vis ? '1' : '0';
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}
hud.onLabels = () => toggleLabels();

// ------------------------------------------------------------------ tutorial
const tutorial = new Tutorial({
  hud,
  getSearchScreen: () => {
    const p = cars.pickSearcher(camera, window.innerWidth, window.innerHeight);
    return p ? screenOf(p) : null;
  },
  getLotScreen: () => {
    let best: Lot | null = null; let bd = 1e9;
    for (const l of world.lots) if (l.free) {
      const s = screenOf(new THREE.Vector3(l.cx, 0.5, l.cz));
      const d = Math.hypot(s.x - window.innerWidth / 2, (s.y - window.innerHeight * 0.52) * 1.3);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? screenOf(new THREE.Vector3(best.cx, 1.5, best.cz)) : null;
  },
  toolSelected: () => game.tool,
  onDone: () => { },
  onSound: (k) => { if (!audio.started) return; if (k === 'click') audio.click(); else audio.chime(); },
});

// ------------------------------------------------------------------ derived stats for HUD
const personaVals: Record<PersonaId, number> = { bewoner: 70, ondernemer: 70, bezoeker: 70, fietser: 60, stad: 70, wethouder: 70 };
function computePersonas(p: number) {
  const s = game.searchLevel;
  const g = game.placed.garage, m = game.placed.automaat, b = game.placed.fiets;
  const upkeep = g * TOOLS.garage.upkeep + m * TOOLS.automaat.upkeep + b * TOOLS.fiets.upkeep;
  const v: Record<PersonaId, number> = {
    bewoner: 95 - 72 * s + 5 * g,
    ondernemer: 92 - 62 * s + 4 * g + 3 * m,
    bezoeker: 92 - 76 * s + 6 * g + 6 * m,
    fietser: 48 + 20 * b - 14 * s + 3 * m,
    stad: 88 - 34 * p + 5 * b - 4 * g,
    wethouder: 90 - 22 * s - Math.max(0, (120 - game.funds) / 120) * 40 - upkeep * 14 + 4 * m,
  };
  let overall = 0;
  const W: Record<PersonaId, number> = { bewoner: 0.25, ondernemer: 0.2, bezoeker: 0.15, fietser: 0.15, stad: 0.1, wethouder: 0.15 };
  (Object.keys(v) as PersonaId[]).forEach((k) => { v[k] = clamp(v[k], 4, 100); overall += v[k] * W[k]; });
  Object.assign(personaVals, v);
  return overall;
}

// ------------------------------------------------------------------ title -> play
function startPlay() {
  if (game.playing) return;
  game.playing = true;
  audio.start(); audio.click(); audio.chime();
  $('title').classList.add('out');
  window.setTimeout(() => $('title').classList.add('gone'), 1000);
  tweenToPlayView(2.4);
  window.setTimeout(() => {
    $('app').classList.remove('hidden');
    if (q.get('skiptut') !== '1') {
      if (q.get('pressure') === null) game.pressure = 0.74;
      tutorial.start();
    }
    if (q.get('event')) events.start(q.get('event') as EventId);
  }, 1500);
}
$('btn-play').addEventListener('click', startPlay);

// ------------------------------------------------------------------ resize / quality
function applyTier(t: Tier) {
  tier = t;
  const c = TIERS[t];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, c.dpr));
  if (env.sun.shadow.mapSize.x !== c.shadow) {
    env.sun.shadow.mapSize.set(c.shadow, c.shadow);
    env.sun.shadow.map?.dispose(); env.sun.shadow.map = null;
  }
  post.configure({ tilt: c.tilt, smaa: c.smaa });
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  const a = w / h;
  camera.aspect = a;
  camera.fov = a < 1 ? lerp(26, 44, clamp((1 - a) / 0.6)) : 26;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyTier(tier);

// ------------------------------------------------------------------ main loop
const clock = new THREE.Timer();
let time = 0;
let frames = 0, fpsAcc = 0, fps = 60, lowFpsT = 0;
let introT = q.get('intro') === '0' ? 5 : 0;
const fpsEl = q.get('fps') === '1' ? Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;top:8px;z-index:999;font:12px monospace;color:#fff;background:#0008;padding:3px 6px;border-radius:4px' }) : null;
if (fpsEl) document.body.appendChild(fpsEl);
let hudTimer = 0;
const lookTarget = { x: 0, y: 0 };
let ready = false;
const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

function tick(dt: number) {
  time += dt;
  fpsAcc += dt; frames++;
  if (fpsAcc > 0.5) {
    fps = frames / fpsAcc; frames = 0; fpsAcc = 0;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${tier} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    // auto quality: step down when the frame rate stays low
    if (autoTier && ready && !manual) { lowFpsT = fps < 27 ? lowFpsT + 0.5 : Math.max(0, lowFpsT - 0.5); if (lowFpsT >= 3 && tier !== 'low') { lowFpsT = 0; applyTier(tier === 'high' ? 'med' : 'low'); } }
  }
  if (tipPinned > 0) { tipPinned -= dt; if (tipPinned <= 0) { tipPinned = 0; tip.classList.remove('show'); } }

  introT += dt;
  env.uniforms.uIntro.value = clamp((introT - 0.3) / 3.2);

  if (!game.paused) env.hour = (env.hour + dt * HOUR_PER_SEC) % 24;
  env.update(dt, time);
  world.setWet(env.wet);
  world.update(dt);
  const eff = clamp(game.pressure + events.pressureBoost);
  cars.setPressure(eff);
  const camDist = camera.position.distanceTo(controls.target);
  cars.update(dt, camDist);
  crowd.update(dt);
  events.update(dt);
  fx.update(dt);

  // quarters + economy
  if (game.playing && !game.paused) {
    game.qTimer += dt;
    if (game.qTimer >= game.qDur) {
      game.qTimer = 0; game.quarter++;
      const upkeep = (Object.keys(game.placed) as ToolId[]).reduce((s, k) => s + game.placed[k] * TOOLS[k].upkeep, 0);
      const income = 3.2;
      game.funds += income - upkeep / 4;
      hud.setFunds(game.funds);
      hud.setDelta(`${(income - upkeep / 4 >= 0 ? '+' : '−')}${Math.abs(income - upkeep / 4).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dit kwartaal`);
      if (audio.started) audio.coin();
      hud.setAffordable(game.funds);
    }
  }

  // camera
  if (camTween) {
    camTween.t += dt;
    const k = easeInOutCubic(clamp(camTween.t / camTween.dur));
    const f = camTween.from, t = camTween.to;
    controls.target.set(lerp(f.tx, t.tx, k), 0, lerp(f.tz, t.tz, k));
    applyPose({ az: lerp(f.az, t.az, k), pol: lerp(f.pol, t.pol, k), dist: lerp(f.dist, t.dist, k) });
    if (k >= 1) { camTween = null; controls.enabled = true; controls.update(); idle = 0; }
  } else if (controls.enabled || !game.playing) {
    if (game.playing) {
      idle += dt;
      // event camera assist: drift towards the action when the player is not steering
      if (events.focus && idle > 3) {
        controls.target.x = lerp(controls.target.x, events.focus.x, 1 - Math.exp(-1.2 * dt));
        controls.target.z = lerp(controls.target.z, events.focus.z, 1 - Math.exp(-1.2 * dt));
      }
      controls.target.x = clamp(controls.target.x, -96, 96);
      controls.target.z = clamp(controls.target.z, -78, 72);
      controls.target.y = 0;
    }
    controls.update();
  }
  env.setShadowFocus(controls.target.x, controls.target.z, clamp(camera.position.distanceTo(controls.target) * 0.62, 26, 150));

  // screen shake via view offset
  if (game.shake > 0.001) {
    game.shake = damp(game.shake, 0, 7, dt);
    const w = window.innerWidth, h = window.innerHeight;
    camera.setViewOffset(w, h, (Math.random() - 0.5) * 16 * game.shake, (Math.random() - 0.5) * 16 * game.shake, w, h);
  } else if (camera.view?.enabled) camera.clearViewOffset();

  // free-lot markers: subtle pulse always, stronger while building
  {
    const showLots = !!game.tool && game.playing;
    const mk = world.lotMarks.material as THREE.MeshBasicMaterial;
    mk.opacity = (showLots ? 0.55 : 0.2) + (showLots ? 0.25 : 0.12) * Math.sin(time * (showLots ? 4.5 : 2.2));
    world.lots.forEach((l, i) => {
      const s = l.free ? 1 + 0.015 * Math.sin(time * 2.2 + i) : 0;
      m4.compose(v3.set(l.cx, 0.07, l.cz), qt.identity(), sc3.setScalar(s));
      world.lotMarks.setMatrixAt(i, m4);
      if (showLots && (game.tool === 'garage' ? l.free : l.subs.some(Boolean))) {
        const a = 1.0 + 0.1 * Math.sin(time * 6 + i);
        m4.compose(v3.set(l.cx, 7.5 + Math.sin(time * 3.4 + i) * 0.6, l.cz), qt.setFromAxisAngle(Y, time * 1.6), sc3.setScalar(a));
        arrows.setMatrixAt(i, m4);
      } else arrows.setMatrixAt(i, zeroM);
    });
    world.lotMarks.instanceMatrix.needsUpdate = true;
    arrows.instanceMatrix.needsUpdate = true;
  }

  // hover + ghost
  if (game.tool && game.playing && mouse.x > -2 && !(window as unknown as { __forceHover?: boolean }).__forceHover) {
    const p = pickAt(lastPointer.x, lastPointer.y);
    game.hover = p ? lotAt(p.x, p.z, game.tool) : null;
  } else if (!(window as unknown as { __forceHover?: boolean }).__forceHover) game.hover = null;
  if (!game.tool) { beam.visible = false; ghostRing.visible = false; }
  if (ghost && ghostTool === game.tool) {
    const h = game.hover;
    ghost.visible = !!h; ghostRing.visible = !!h; beam.visible = !!h;
    if (h) {
      const [ox, oz] = game.tool === 'garage' ? [0, 0] : subOffset(h.sub);
      const x = h.lot.cx + ox, z = h.lot.cz + oz;
      const tl = game.tool!;
      const ok = canPlace(h, tl) && game.funds >= TOOLS[tl].cost;
      const free = canPlace(h, tl);
      const big = game.tool === 'garage';
      ghost.position.set(x, 0.12 + Math.sin(time * 3.2) * 0.05, z);
      const R = big ? 6.4 * Math.SQRT2 : 3.0 * Math.SQRT2;
      ghostRing.position.set(x, PAD + 0.1, z);
      ghostRing.scale.setScalar(R * (1 + 0.025 * Math.sin(time * 5)));
      beam.position.set(x, big ? 14 : 6, z);
      beam.scale.set(big ? 5.2 : 2.3, big ? 1.55 : 0.7, big ? 5.2 : 2.3);
      const col = ok ? '#7fe0a8' : free ? '#ffd27a' : '#ff8a78';
      ghostMat.color.set(col);
      ghostMat.emissive.set(ok ? '#2f9e6a' : free ? '#a8741c' : '#b0402f');
      (ghostRing.material as THREE.MeshBasicMaterial).color.set(col).multiplyScalar(2.2);
      (beam.material as THREE.MeshBasicMaterial).color.set(col);
      const key = `${h.lot.id}:${h.sub}`;
      if (key !== lastHoverKey) { lastHoverKey = key; if (audio.started) audio.tick(); }
    }
  }

  // placed building animations (spring up with overshoot + squash)
  for (let i = placedAnims.length - 1; i >= 0; i--) {
    const a = placedAnims[i];
    a.t += dt;
    const k = clamp(a.t / 0.85);
    const e = Math.max(0.001, easeOutBack(k, 2.4));
    const sq = 1 + (1 - Math.min(1, e)) * 0.08 - Math.max(0, e - 1) * 0.05;
    a.g.scale.set(sq, e, sq);
    if (k >= 1) { a.g.scale.set(1, 1, 1); placedAnims.splice(i, 1); }
  }
  // blue P sign halo breathes
  world.structures.traverse((o) => { if (o.name === 'halo') (o as THREE.Mesh).scale.setScalar(1 + 0.06 * Math.sin(time * 2.4)); });

  // HUD updates
  game.searchLevel = damp(game.searchLevel, clamp(cars.searching / 30), 2.2, dt);
  const overall = computePersonas(eff);
  hudTimer -= dt;
  const lx = lastPointer.x / window.innerWidth - 0.85, ly = lastPointer.y / window.innerHeight - 0.15;
  lookTarget.x = damp(lookTarget.x, -lx * 1.2, 6, dt); lookTarget.y = damp(lookTarget.y, -ly * 1.2, 6, dt);
  hud.update(dt, lookTarget.x, lookTarget.y);
  if (hudTimer <= 0) {
    hudTimer = 0.12;
    hud.setPersonas(personaVals, overall);
    const occ = cars.parkedCount / world.bays.length;
    const minutes = 1.5 + 11.5 * Math.pow(game.searchLevel, 1.1);
    hud.setPressureUi(eff, cars.searching, minutes, occ);
    hud.setClock(env.hour, game.paused, env.night);
    hud.setQuarter(game.quarter, 2026 + Math.floor(game.quarter / 4), game.qTimer / game.qDur);
    hud.setAffordable(game.funds);
    audio.setState(eff, env.rain, env.night);
  }
  updateChips();
  tutorial.update(dt);
}
function draw(dt: number) {
  post.bloom.intensity = env.bloom;
  post.bloom.luminanceMaterial.threshold = env.bloomThreshold;
  post.render(dt);
}
const manual = q.get('manual') === '1';
let frozen = false;
let lastHoverKey = '';
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  tick(dt);
  draw(dt);
  if (!frozen && !manual) requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ test hooks
(window as unknown as { __game: unknown }).__game = {
  get ready() { return ready; },
  get fps() { return fps; },
  setHour(h: number) { env.hour = h; },
  setRain(on: boolean) { env.rainTarget = on ? 1 : 0; env.rain = on ? 1 : 0; env.wet = on ? 1 : 0; hud.setRain(on); },
  setPressure(p: number) { game.pressure = p; cars.setPressure(p); cars.snapNow(30); },
  pause(on: boolean) { game.paused = on; },
  freeLots() { return world.lots.filter((l) => l.free).map((l) => ({ id: l.id, x: l.cx, z: l.cz })); },
  select(id: ToolId | null) { selectTool(id); },
  hoverLot(id: number | null, sub = 0) { (window as unknown as { __forceHover?: boolean }).__forceHover = id !== null; game.hover = id === null ? null : { lot: world.lots.find((l) => l.id === id)!, sub: game.tool === 'garage' ? -1 : sub }; },
  placeAt(id: number, tool: ToolId = 'garage', sub = 0) { const l = world.lots.find((x) => x.id === id); return l ? tryPlace(l, tool, tool === 'garage' ? -1 : sub) : false; },
  play() { startPlay(); },
  camera(tx: number, tz: number, dist: number, az: number, pol: number) { setCamera(tx, tz, dist, az, pol); },
  startEvent(id: EventId) { events.start(id); },
  stopEvent() { events.stop(); },
  labels(on = true) { toggleLabels(on); },
  showSap() { showSap(); },
  expandMood(on = true) { $('topright').classList.toggle('open', on); },
  openSheet(on = true) { $('pressure').classList.toggle('open', on); },
  toast(t: string) { hud.toast(t, 'Stadsbeheer Rotterdam'); },
  startTutorial() { $('app').classList.remove('hidden'); tutorial.start(); },
  projectLot(id: number) { const l = world.lots.find((x) => x.id === id)!; return screenOf(new THREE.Vector3(l.cx, 1, l.cz)); },
  labelList() { return world.labels.map((l) => l.id); },
  /** Manual mode: simulate `seconds` without rendering, then draw one frame. */
  advance(seconds: number) { const n = Math.max(1, Math.round(seconds / 0.04)); for (let i = 0; i < n; i++) tick(0.04); draw(0.04); },
  freeze() { frozen = true; },
  thaw() { if (frozen) { frozen = false; clock.update(); requestAnimationFrame(frame); } },
  tier() { return tier; },
  state: game,
};

// compile everything once, then reveal
cars.setPressure(game.pressure);
cars.snapNow(40);
if (q.get('cam')) { const c = q.get('cam')!.split(',').map(Number); setCamera(c[0], c[1], c[2], c[3], c[4]); }
else { setCamera(START.tx, START.tz, 300, START.az, 0.98); }
renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
  frame();
  window.setTimeout(() => {
    $('loading').classList.add('done');
    ready = true;
    if (q.get('play') === '1') {
      game.playing = true;
      $('title').classList.add('gone');
      $('app').classList.remove('hidden');
      if (!q.get('cam')) setCamera(START.tx, START.tz, startDist(), START.az, START.pol);
      controls.enabled = true; controls.autoRotate = false; idle = -9999;
      if (q.get('tutorial') === '1') tutorial.start();
      if (q.get('event')) events.start(q.get('event') as EventId);
    }
    if (q.get('labels') === '1') toggleLabels(true);
  }, 500);
});
