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
import { Patrol } from './patrol';
import { Session, GOAL, QUARTERS, UI_CFG, type PlanItem, type QuarterResult } from './session';
import { UI } from './ui';
import { Heat } from './heat';
import { fmtM, fmtMin, sapAdvice, wijkName } from './copy';
import type { TeamId } from '@sim/types';
import { WIJKEN, WIJK_BY_ID, wijkAt, type WijkId } from './wijken';
import { LOT_SIZE } from './map';
import { shortestPath } from './route';
import { clamp, damp, easeInOutCubic, easeOutBack, lerp } from './util';

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PAD = 0.05;
const PLAY_SECONDS = 20;

// ------------------------------------------------------------------ quality tiers
type Tier = 'high' | 'med' | 'low';
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/** low = no shadows, no post-processing, pixel ratio 1 */
const TIERS: Record<Tier, { shadow: number; dpr: number; tilt: boolean; smaa: boolean; post: boolean }> = {
  high: { shadow: 3072, dpr: 1.75, tilt: true, smaa: true, post: true },
  med: { shadow: 2048, dpr: 1.25, tilt: true, smaa: false, post: true },
  low: { shadow: 0, dpr: 1, tilt: false, smaa: false, post: false },
};
let tier: Tier = (['high', 'med', 'low'] as const).includes(q.get('q') as Tier) ? (q.get('q') as Tier) : isMobile ? 'low' : 'high';
const autoTier = q.get('q') === null;
const debug = q.get('debug') === '1';

// ------------------------------------------------------------------ renderer / scene
const canvas = $('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
renderer.shadowMap.enabled = TIERS[tier].shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // ACES is applied in the post-processing chain (or by the renderer on the low tier)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 1, 900);

const env = new Environment(scene, renderer);
await document.fonts.load('700 48px "Fredoka Variable"').catch(() => {});
const world = new World(env);
scene.add(world.group);
const cars = new CarSystem(world.graph, world.bays);
scene.add(cars.group);
const patrol = new Patrol(world.graph);
scene.add(patrol.group);
const crowd = new Crowd(world.graph);
scene.add(crowd.group);
const fx = new Fx();
scene.add(fx.group);
const post = new Post(renderer, scene, camera);
const heat = new Heat();
heat.cfg = { green: UI_CFG.heat.green, red: UI_CFG.heat.red };
scene.add(heat.mesh);

// ------------------------------------------------------------------ game state
const session = new Session();
const game = {
  phase: 'title' as 'title' | 'plan' | 'play' | 'after' | 'eind',
  tool: null as ToolId | null,
  hoverLot: null as Lot | null,
  shake: 0,
  playT: 0, playRes: null as QuarterResult | null, chipsNew: false,
  hourTarget: 11,
};
env.hour = +(q.get('hour') ?? 11);
env.rainTarget = q.get('rain') === '1' ? 1 : 0;

// ------------------------------------------------------------------ camera
const START = { tx: 22, tz: 14, az: 2.72, pol: 1.08, dist: 430 };
const portrait = () => window.innerWidth / window.innerHeight < 0.8;
const startDist = () => Number(q.get('dist') ?? (portrait() ? 520 : START.dist));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9; controls.panSpeed = 0.8;
controls.screenSpacePanning = false; controls.zoomToCursor = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.minDistance = 14; controls.maxDistance = 560;
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
controls.addEventListener('start', () => { controls.autoRotate = false; camTween = null; });

type Pose = { az: number; pol: number; dist: number; tx: number; tz: number };
let camTween: { t: number; dur: number; from: Pose; to: Pose } | null = null;
function tweenTo(to: Pose, dur: number) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let az = s.theta;
  while (az - to.az > Math.PI) az -= Math.PI * 2;
  while (az - to.az < -Math.PI) az += Math.PI * 2;
  camTween = { t: 0, dur, from: { az, pol: s.phi, dist: s.radius, tx: controls.target.x, tz: controls.target.z }, to };
  controls.autoRotate = false; controls.enabled = false;
}
const playView = (): Pose => (portrait() ? { az: START.az, pol: 0.8, dist: Number(q.get('dist') ?? 570), tx: START.tx, tz: 6 } : { az: START.az, pol: START.pol, dist: startDist(), tx: START.tx, tz: START.tz });
function flyToWijk(id: WijkId) {
  const w = WIJK_BY_ID[id];
  tweenTo({ az: START.az, pol: 0.95, dist: portrait() ? 190 : 120, tx: w.focus[0], tz: w.focus[1] }, 1.4);
}

// ------------------------------------------------------------------ HUD + audio wiring
const hud = new Hud();
const ui = new UI(session);
const cards = new CharCard('cardlayer', (k) => { if (audio.started) (k === 'click' ? audio.click() : audio.chime()); });
let rainToastShown = false;
const unlock = () => { audio.start(); };
for (const ev of ['pointerup', 'touchend', 'click', 'keydown'] as const) window.addEventListener(ev, unlock, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resume(); });

const sfx = (k: 'click' | 'error' | 'chime' | 'coin') => { if (!audio.started) return; if (k === 'click') audio.click(); else if (k === 'error') audio.error(); else if (k === 'coin') audio.coin(); else audio.chime(); };
hud.onSound = (k, v) => { if (!audio.started) return; if (k === 'click') audio.click(); else if (k === 'tick') audio.tick(); else audio.sliderTick(v ?? 0); };
hud.onRain = () => {
  env.rainTarget = env.rainTarget > 0 ? 0 : 1; hud.setRain(env.rainTarget > 0);
  // Easter egg: the Kleinpolderplein slogan only appears when it rains AND the camera is near our office.
  if (env.rainTarget > 0 && !rainToastShown && nearKleinpolder()) { rainToastShown = true; hud.toast('Steden schuilen niet wanneer het regent.', 'Easter egg · Kleinpolderplein', 6200); }
};
hud.onMute = () => { audio.setMuted(!audio.muted); hud.setMute(audio.muted); };
hud.onTool = (id) => selectTool(id);
hud.setRain(env.rainTarget > 0);
ui.onSound = sfx;

// events (Bokito / wedstrijd) stay in the code, but the button is hidden in Jaar 1
const events = new Events(world, cars, crowd, hud, scene);
events.onToast = (t, s) => hud.toast(t, s, 5200);
events.camDist = () => camera.position.distanceTo(controls.target);
hud.onEvent = (id) => { if (id) events.start(id as EventId); else events.stop(); };

// ------------------------------------------------------------------ plan visuals (ghosts) and committed structures
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9, -9);
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD);
const hit = new THREE.Vector3();
const ghostMat = new THREE.MeshStandardMaterial({ color: '#7fe0a8', emissive: '#2f9e6a', emissiveIntensity: 0.9, transparent: true, opacity: 0.7, depthWrite: true, roughness: 0.5 });
const plannedMat = new THREE.MeshStandardMaterial({ color: '#cfeede', emissive: '#4aa57c', emissiveIntensity: 0.6, transparent: true, opacity: 0.62, depthWrite: true, roughness: 0.5 });
const hoverRing = new THREE.Mesh(world.lotMarks.geometry, new THREE.MeshBasicMaterial({ color: '#1fb870', transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false }));
hoverRing.visible = false; hoverRing.renderOrder = 8;
scene.add(hoverRing);
// soft fill inside every valid bouwplek while building
const fillGeo = new THREE.PlaneGeometry(LOT_SIZE + 0.1, LOT_SIZE + 0.1).rotateX(-Math.PI / 2);
const lotFill = new THREE.InstancedMesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, fog: false, toneMapped: false }), world.lots.length);
lotFill.frustumCulled = false; lotFill.renderOrder = 5;
scene.add(lotFill);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#7fe0a8', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
beam.visible = false; beam.renderOrder = 8;
scene.add(beam);
let ghost: THREE.Group | null = null;
let ghostTool: ToolId | null = null;

function asGhost(g: THREE.Object3D, mat: THREE.Material) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.userData.mat0 = m.material; m.material = mat; m.castShadow = false; m.receiveShadow = false; }
  });
}
function solid(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.mat0) { m.material = m.userData.mat0; m.castShadow = true; m.receiveShadow = true; }
  });
}
function rebuildGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; }
  ghostTool = game.tool;
  if (!game.tool || !TOOLS[game.tool].placed) return;
  ghost = makeStructure(game.tool, world.glowMat);
  asGhost(ghost, ghostMat);
  ghost.visible = false;
  scene.add(ghost);
}

const SUB = 3; // offset of a 6x6 sub-lot from the lot centre
const subOffset = (i: number): [number, number] => [(i % 2 ? 1 : -1) * SUB, (i >= 2 ? 1 : -1) * SUB];
const freeSub = (l: Lot) => l.subs.findIndex(Boolean);
const lotValid = (l: Lot, t: ToolId) => (t === 'garage' ? l.free : t === 'scanauto' ? false : freeSub(l) >= 0);
function lotAt(x: number, z: number): Lot | null {
  for (const l of world.lots) {
    const h = l.size / 2 + 0.8;
    if (Math.abs(x - l.cx) <= h && Math.abs(z - l.cz) <= h) return l;
  }
  return null;
}
function screenOf(p: THREE.Vector3) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function pickAt(cx: number, cy: number) {
  mouse.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

function toolHint(id: ToolId) {
  const t = TOOLS[id];
  return t.placed ? `${t.label}: tik op een gloeiende bouwplek` : `${t.label}: tik op een wijk op de kaart`;
}
function selectTool(id: ToolId | null) {
  if (game.phase !== 'plan') id = null;
  game.tool = id;
  hud.selectTool(id);
  if (id) ui.togglePanel(null);
  rebuildGhost();
  if (!id) fcHide();
  for (const c of wijkChips.values()) c.classList.toggle('target', id === 'scanauto');
  refreshHint();
}
function refreshHint() {
  if (game.tool) hud.hint(toolHint(game.tool), true);
  else if (tutorial.active && tutorial.step === 2) hud.hint(null);
  else hud.hint(null);
}
hud.onHintExpire = refreshHint;
$('btn-cancel').addEventListener('click', () => { sfx('click'); selectTool(null); });

// ---- planned items: visuals keyed by plan-item id
interface Vis { g?: THREE.Group; lot?: Lot; sub: number; car?: ReturnType<Patrol['add']>; wijk: WijkId; tool: ToolId }
const vis = new Map<number, Vis>();
const placedAnims: { g: THREE.Object3D; t: number }[] = [];
const committed: { g: THREE.Object3D; lot?: Lot }[] = [];
const lastPointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };

function warn(text: string, x = lastPointer.x, y = lastPointer.y) {
  sfx('error');
  hud.warn(text);
  hud.floater(x, y - 24, '✕', 'msg', false);
}

function planBuild(tool: ToolId, wijk: WijkId, lot?: Lot, at?: { x: number; y: number }) {
  const info = TOOLS[tool];
  let sub = -1;
  if (lot) {
    if (tool === 'garage' && !lot.free) { warn('Een garage heeft een hele lege bouwplek nodig. Kies een andere.', at?.x, at?.y); return false; }
    if (tool !== 'garage') { sub = freeSub(lot); if (sub < 0) { warn('Deze bouwplek zit vol. Kies een andere.', at?.x, at?.y); return false; } }
  }
  const r = session.add(session.buildItem(tool as 'garage' | 'automaat' | 'scanauto' | 'stalling', wijk, lot ? { id: lot.id, sub } : undefined));
  if (!r.ok) { warn(r.reason, at?.x, at?.y); hud.shakeTool(tool); return false; }
  const it = r.item;
  const v: Vis = { sub, lot, wijk, tool };
  if (lot) {
    const [ox, oz] = tool === 'garage' ? [0, 0] : subOffset(sub);
    if (tool === 'garage') { lot.subs = [false, false, false, false]; lot.free = false; } else { lot.subs[sub] = false; lot.free = false; }
    const g = makeStructure(tool, world.glowMat);
    asGhost(g, plannedMat);
    g.position.set(lot.cx + ox, 0, lot.cz + oz);
    g.scale.set(1, 0.001, 1);
    world.structures.add(g);
    placedAnims.push({ g, t: 0 });
    v.g = g;
    fx.burst(lot.cx + ox, PAD, lot.cz + oz);
    const sp = screenOf(new THREE.Vector3(lot.cx + ox, 3, lot.cz + oz));
    hud.floater(sp.x, sp.y, `−${info.costLabel}`, 'neg');
  } else {
    const c = patrol.add(wijk);
    if (c) { asGhost(c.g, plannedMat); v.car = c; }
    const foc = WIJK_BY_ID[wijk].focus;
    const sp = screenOf(new THREE.Vector3(foc[0], 3, foc[1]));
    hud.floater(sp.x, sp.y, `−${info.costLabel}`, 'neg');
  }
  vis.set(it.id, v);
  game.shake = 0.3;
  if (audio.started) { audio.plop(); audio.coin(); }
  afterPlanChange();
  tutorial.notifyPlanned(it);
  selectTool(null);
  return true;
}

function unplan(items: PlanItem[]) {
  for (const it of items) {
    const v = vis.get(it.id);
    if (!v) continue;
    if (v.g) { world.structures.remove(v.g); const i = placedAnims.findIndex((a) => a.g === v.g); if (i >= 0) placedAnims.splice(i, 1); }
    if (v.lot) {
      if (v.tool === 'garage') { v.lot.subs = [true, true, true, true]; v.lot.free = true; }
      else { v.lot.subs[v.sub] = true; v.lot.free = v.lot.subs.every(Boolean); }
    }
    if (v.car) patrol.remove(v.car);
    vis.delete(it.id);
  }
}

function afterPlanChange() {
  ui.refresh();
  hud.setFunds(session.fondsAfterPlan());
  hud.setAffordable(session.fondsAfterPlan());
}

ui.onRemove = (id) => {
  const gone = session.remove(id);
  unplan(gone);
  if (gone.length > 1) hud.warn(`Ook uit je plan gehaald: ${gone.slice(1).map((g) => ui.itemLabel(g)).join(', ')} (geld of regels klopten niet meer).`);
  afterPlanChange();
};
ui.onPolicy = (w, level) => {
  const pend = session.plan.find((p) => (p.kind === 'tariff' || p.kind === 'intro') && p.wijk === w);
  const view = session.wijkViews()[w];
  if (pend && pend.level === level) { unplan(session.remove(pend.id)); afterPlanChange(); return; }
  if (!pend && view.paid && view.tariff === level) return;
  const before = pend ? { ...pend } : null;
  if (pend) session.remove(pend.id);
  const r = session.add(session.tariffItem(w, level, !view.paid));
  if (!r.ok) {
    if (before) { const { id: _id, ...rest } = before; void _id; session.add(rest); }
    sfx('error'); ui.say(r.reason); afterPlanChange(); return;
  }
  sfx('click'); ui.say(''); afterPlanChange();
};
ui.onHire = (team: TeamId) => {
  const r = session.add(session.hireItem(team));
  if (!r.ok) { sfx('error'); ui.say(r.reason); return; }
  sfx('coin'); ui.say(''); afterPlanChange();
};
ui.onHeat = (on) => { heat.setVisible(on && game.phase === 'plan' && !game.tool); };
ui.onWijk = (w) => heat.setSelected(w);
ui.onPick = (id, on) => {
  const err = session.setMomentPick(id, on);
  if (err) { sfx('error'); ui.say(err); return; }
  sfx(on ? 'coin' : 'click'); ui.say(''); afterPlanChange();
};
ui.onFly = (w) => {
  if (game.phase === 'plan' && !game.tool) { sfx('click'); ui.openWijk(w); return; }
  if (game.tool === 'scanauto') { planBuild('scanauto', w); return; }
  sfx('click'); flyToWijk(w);
};

// ------------------------------------------------------------------ voorspelling (one quarter ahead on a cloned state)
let fcKey = '';
function fcHide() { fcKey = ''; ui.hideForecast(); }
function fcFor(tool: ToolId, wijk: WijkId, at: { x: number; y: number } | null) {
  const kind = tool as 'garage' | 'automaat' | 'scanauto' | 'stalling';
  const item = session.buildItem(kind, wijk, undefined);
  const key = `${tool}:${wijk}:${session.plan.length}`;
  if (key === fcKey && !at) return;
  fcKey = key;
  const f = session.forecast([item.action], wijk);
  ui.showForecast(f, `${TOOLS[tool].label} in ${wijkName(wijk)}`, at, item.cost);
}
function fcHover(x: number, y: number) {
  const tool = game.tool; if (!tool) return;
  const p = pickAt(x, y); if (!p) { fcHide(); return; }
  let w: WijkId | null = null;
  if (tool === 'scanauto') w = wijkAt(p.x, p.z);
  else { const l = lotAt(p.x, p.z); w = l && lotValid(l, tool) ? l.wijk : null; }
  if (!w) { fcHide(); return; }
  fcFor(tool, w, { x, y });
}

// ------------------------------------------------------------------ pointer input
let downPos = { x: 0, y: 0 };
canvas.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  if (e.pointerType === 'mouse') hoverLabelAt(e.clientX, e.clientY);
  if (game.tool && game.phase === 'plan') fcHover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { mouse.set(-9, -9); hideLabelTip(); fcHide(); });
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; if (e.button === 2) selectTool(null); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', (e) => {
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) return;
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  if (game.tool && game.phase === 'plan') {
    const p = pickAt(e.clientX, e.clientY);
    if (!p) return;
    if (game.tool === 'scanauto') {
      const w = wijkAt(p.x, p.z);
      if (w) planBuild('scanauto', w, undefined, { x: e.clientX, y: e.clientY }); else warn('Tik op een wijk op de kaart, niet op het water.');
      return;
    }
    const l = lotAt(p.x, p.z);
    if (!l) { warn('Tik op een gloeiende bouwplek.'); return; }
    if (!lotValid(l, game.tool)) { warn(game.tool === 'garage' ? 'Een garage heeft een hele lege bouwplek nodig.' : 'Deze bouwplek zit vol.'); return; }
    planBuild(game.tool, l.wijk, l, { x: e.clientX, y: e.clientY });
    return;
  }
  if (game.phase === 'plan' && (!tutorial.active || tutorial.step >= 3)) {
    const lbl = labelAt(e.clientX, e.clientY);
    const p = pickAt(e.clientX, e.clientY);
    const w = lbl ? wijkAt(lbl.x, lbl.z) : p ? wijkAt(p.x, p.z) : null;
    if (w) { sfx('click'); ui.openWijk(w); return; }
  }
  hoverLabelAt(e.clientX, e.clientY, true);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectTool(null);
  if (game.phase === 'plan' && !tutorial.active) {
    if (e.key === '1') selectTool('garage');
    if (e.key === '2') selectTool('automaat');
    if (e.key === '3') selectTool('scanauto');
    if (e.key === '4') selectTool('stalling');
  }
  if (e.key.toLowerCase() === 'm') hud.onMute();
  if (e.key.toLowerCase() === 'n') toggleLabels();
});

// ------------------------------------------------------------------ labels (hover / tap + "show all") and wijk chips
const tip = $('tooltip');
let tipPinned = 0;
let labelsAll = false;
const chips = new Map<string, HTMLElement>();
const wijkChips = ui.buildChips();
function nearKleinpolder() { const k = world.labels.find((l) => l.id === 'kleinpolder'); return !!k && Math.hypot(controls.target.x - k.x, controls.target.z - k.z) < 60; }
function labelScale() { return window.innerHeight / (2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }
function labelAt(cx: number, cy: number) {
  const k = labelScale();
  let best: (typeof world.labels)[number] | null = null; let bd = 1e9;
  const v = new THREE.Vector3();
  for (const l of world.labels) {
    const p0 = screenOf(v.set(l.x, 0, l.z)), p1 = screenOf(new THREE.Vector3(l.x, l.y, l.z));
    const rad = Math.max(isMobile ? 34 : 26, l.r * k * 0.9);
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
  if (game.tool || camTween || tutorial.active) return;
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
hud.onLabels = () => toggleLabels();

// HUD rectangles, so floating labels never sit on top of a panel
const HUD_IDS = ['topleft', 'goalbar', 'topright', 'rail', 'sidepanel', 'plan', 'teambar', 'toolbar', 'sys', 'hint', 'playbar', 'cardlayer'];
let hudRects: DOMRect[] = [];
let hudRectT = 0;
function refreshHudRects() {
  hudRects = [];
  for (const id of HUD_IDS) { const el = document.getElementById(id); if (!el || el.classList.contains('hidden') || (el as HTMLElement).hidden) continue; const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) hudRects.push(r); }
}
const underHud = (x: number, y: number, padX = 0, padY = 0) => hudRects.some((r) => x > r.left - padX && x < r.right + padX && y > r.top - padY && y < r.bottom + padY);

const _v = new THREE.Vector3();
function updateChips(dt: number) {
  hudRectT -= dt;
  if (hudRectT <= 0) { hudRectT = 0.25; refreshHudRects(); }
  const W = window.innerWidth, H = window.innerHeight;
  const shown = game.phase === 'play' && !game.chipsNew && game.playRes ? game.playRes.old : session.shown;
  const views = session.wijkViews(shown);
  const hide = game.phase === 'title' || game.phase === 'after' || game.phase === 'eind';
  for (const w of WIJKEN) {
    const el = wijkChips.get(w.id)!;
    if (hide) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue; }
    _v.set(w.focus[0], 3, w.focus[1]).project(camera);
    const x = clamp((_v.x * 0.5 + 0.5) * W, 78, W - 78), y = clamp((-_v.y * 0.5 + 0.5) * H, 118, H - 200);
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    const behind = _v.z > 1;
    const blocked = underHud(x, y, 40, 14);
    el.style.opacity = behind || blocked ? '0' : '1'; el.style.pointerEvents = behind || blocked ? 'none' : 'auto';
    const s = views[w.id].search;
    const sev = s > GOAL.marathon.maxSearch ? 'bad' : s > 5 ? 'mid' : 'ok';
    el.dataset.sev = sev;
    const t = el.querySelector('.w-t') as HTMLElement, txt = fmtMin(s);
    if (t.textContent !== txt) t.textContent = txt;
  }
  if (!labelsAll) return;
  for (const l of world.labels) {
    const el = chips.get(l.id); if (!el) continue;
    _v.set(l.x, l.y, l.z).project(camera);
    const px = (_v.x * 0.5 + 0.5) * W, py = (-_v.y * 0.5 + 0.5) * H;
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && !underHud(px, py, 30, 12);
    el.style.opacity = vis ? '1' : '0';
    el.style.left = `${px}px`; el.style.top = `${py}px`;
  }
}

// ------------------------------------------------------------------ tutorial
const tutorial = new Tutorial({
  centrumScreen: () => { const c = WIJK_BY_ID.centrum.focus; return screenOf(_v.set(c[0], 1, c[1]).clone()); },
  lotScreen: () => {
    let best: Lot | null = null; let bd = 1e9;
    for (const l of world.lots) if (l.free && l.wijk === 'centrum') {
      const s = screenOf(new THREE.Vector3(l.cx, 0.5, l.cz));
      const d = Math.hypot(s.x - window.innerWidth / 2, (s.y - window.innerHeight * 0.45) * 1.3);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? screenOf(new THREE.Vector3(best.cx, 1.5, best.cz)) : null;
  },
  selectedTool: () => game.tool,
  centrumMin: () => session.wijkViews().centrum.search,
  onDone: () => { refreshHint(); },
  onSound: (k) => sfx(k),
});

// ------------------------------------------------------------------ cars follow the simulation
function feedCars(state = session.shown) {
  const v = session.wijkViews(state);
  cars.setWijken(Object.fromEntries(Object.values(v).map((w) => [w.id, { bez: w.bez, search: w.search }])));
}
function feedHud(state = session.shown) {
  const row = state.history[state.history.length - 1] as unknown as Record<string, number>;
  const vals: Record<PersonaId, number> = { bewoner: row.bewoner, ondernemer: row.ondernemer, bezoeker: row.bezoeker, fietser: row.fietser, stad: row.stad, wethouder: row.wethouder };
  hud.setPersonas(vals, row.blij);
}

// ------------------------------------------------------------------ marathon: runners stream through Centrum
// route: Coolsingel (centrum) -> Erasmusbrug (Kop van Zuid); runners start in the first half and finish in the second
const ROUTE = { a: WIJK_BY_ID.centrum.focus, b: WIJK_BY_ID.kopbrug.focus };
const routeT = (x: number, z: number) => {
  const dx = ROUTE.b[0] - ROUTE.a[0], dz = ROUTE.b[1] - ROUTE.a[1], t = ((x - ROUTE.a[0]) * dx + (z - ROUTE.a[1]) * dz) / (dx * dx + dz * dz);
  const px = ROUTE.a[0] + dx * clamp(t), pz = ROUTE.a[1] + dz * clamp(t);
  return { t, d: Math.hypot(x - px, z - pz) };
};
const routeNodes = world.graph.nodes.map((n, i) => ({ i, ...routeT(n.x, n.z) })).filter((r) => r.d < 16 && r.t > -0.1 && r.t < 1.1 && world.graph.nodes[r.i].edges.length > 1);
const routeStart = routeNodes.filter((r) => r.t < 0.5).map((r) => r.i), routeEnd = routeNodes.filter((r) => r.t >= 0.5).map((r) => r.i);
const centrumNodes = routeStart.length && routeEnd.length ? [] : world.graph.nodes.map((n, i) => ({ n, i })).filter(({ n }) => wijkAt(n.x, n.z) === 'centrum' && n.edges.length > 1).map(({ i }) => i);
let runnerT = 0;
// the closed route as an orange ribbon on the road, so the player sees what the partners closed
const routeGroup = new THREE.Group(); routeGroup.visible = false; scene.add(routeGroup);
{
  const near = (x: number, z: number) => world.graph.nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.z - z) < b.d ? { i, d: Math.hypot(n.x - x, n.z - z) } : b), { i: 0, d: 1e9 }).i;
  const path = shortestPath(world.graph, near(ROUTE.a[0], ROUTE.a[1]), near(ROUTE.b[0], ROUTE.b[1]), { ignoreOneway: true, avoid: (e) => e.kind === 'highway' });
  const mat = new THREE.MeshBasicMaterial({ color: '#ff6a3d', transparent: true, opacity: 0.6, depthWrite: false, fog: false, toneMapped: false });
  for (let i = 0; path && i + 1 < path.length; i++) {
    const A = world.graph.nodes[path[i]], B = world.graph.nodes[path[i + 1]], L = Math.hypot(B.x - A.x, B.z - A.z);
    if (L < 0.1) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 3.4), mat);
    m.position.set((A.x + B.x) / 2, Math.max(A.y, B.y) + 0.12, (A.z + B.z) / 2); m.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x); m.renderOrder = 4;
    routeGroup.add(m);
  }
}
function runMarathon(dt: number) {
  runnerT -= dt;
  if (runnerT > 0 || crowd.count > 150) return;
  runnerT = 0.12;
  const pick = (l: number[]) => l[Math.floor(Math.random() * l.length)];
  const useRoute = routeStart.length > 0 && routeEnd.length > 0;
  if (!useRoute && centrumNodes.length < 2) return;
  const a = useRoute ? pick(routeStart) : pick(centrumNodes), b = useRoute ? pick(routeEnd) : pick(centrumNodes);
  if (a !== b) crowd.sendBetween(a, b, 4.6);
}

// ------------------------------------------------------------------ quarter loop
function enterPlan(first = false) {
  game.phase = 'plan';
  ui.setPhase('plan');
  $('playbar').classList.add('hidden');
  game.hourTarget = 11;
  hud.setQuarter(session.quarter, QUARTERS, `Kwartaal ${session.quarter + 1} van ${QUARTERS}`, `Jaar ${1}`);
  feedHud(); feedCars();
  afterPlanChange();
  const news = session.news();
  if (!first || news.length) {
    const g = news.find((n) => n.kind === 'groei'), a = news.find((n) => n.kind === 'marathon-aankondiging'), m = news.find((n) => n.kind === 'marathon');
    if (g) hud.toast(`${g.label}`, 'Nieuws · meer bewoners en bezoekers', 6500);
    else if (m) hud.toast('Marathon Rotterdam is dit kwartaal!', 'Nieuws · het Centrum loopt vol', 6500);
    void a;
  }
  if (!first) window.setTimeout(() => quarterCards(), 700);
}

/** cards that open at the start of a plan phase: dilemma (Q2), Marathon announcement (Q3), Moment panel (Q4) */
let pendingSap: string | null = null;
function flushSap() {
  if (!pendingSap || game.phase !== 'plan') return;
  const text = pendingSap; pendingSap = null;
  cards.show({ id: 'sap-' + session.quarter + '-' + Math.random().toString(36).slice(2, 6), name: 'Sap', role: 'Adviseur · oud-MT', svg: SAP_SVG, text, ms: 16000 });
}
function quarterCards() {
  if (game.phase !== 'plan' || tutorial.active) { flushSap(); return; }
  if (session.isDilemmaQuarter() && !session.dilemmaChoice) {
    ui.showDilemma((k) => { session.dilemmaChoice = k; afterPlanChange(); hud.toast('Keuze genoteerd', 'Je ziet de reacties in de afrekening', 4200); window.setTimeout(flushSap, 600); });
  } else if (session.news().some((n) => n.kind === 'marathon-aankondiging')) {
    ui.showMomentAnnounce(() => window.setTimeout(flushSap, 600));
  } else if (session.isMomentQuarter()) {
    ui.openMoment(); flushSap();
  } else flushSap();
}

function commitQuarter() {
  if (game.phase !== 'plan') return;
  selectTool(null);
  const hadGarage = session.has('garage') > 0;
  void hadGarage;
  tutorial.notifyCommit();
  ui.setPhase('play');
  const items = [...session.plan];
  const res = session.commit();
  game.playRes = res; game.playT = 0; game.chipsNew = false;
  game.phase = 'play';
  // planned things become real
  for (const it of items) {
    const v = vis.get(it.id);
    if (!v) continue;
    if (v.g) {
      world.structures.remove(v.g);
      const lot = v.lot!;
      const [ox, oz] = v.tool === 'garage' ? [0, 0] : subOffset(v.sub);
      const g = makeStructure(v.tool, world.glowMat);
      g.position.set(lot.cx + ox, 0, lot.cz + oz); g.scale.set(1, 0.001, 1);
      world.structures.add(g);
      placedAnims.push({ g, t: 0 });
      committed.push({ g, lot });
      fx.burst(lot.cx + ox, PAD, lot.cz + oz);
    }
    if (v.car) { solid(v.car.g); }
  }
  vis.clear();
  feedHud(res.next); feedCars(res.next);
  $('playbar').classList.remove('hidden');
  $('play-lbl').textContent = `Kwartaal ${res.q + 1} loopt…`;
  if (res.q === GOAL.marathon.quarter) hud.banner('Marathon Rotterdam!', 'Coolsingel en Erasmusbrug zijn dicht: kijk hoe lang auto’s zoeken.');
  else hud.clearBanner();
  if (audio.started) { audio.whoosh(); audio.chime(); }
  env.hour = 8; game.hourTarget = 8;
}

function endPlay() {
  const res = game.playRes!;
  game.phase = 'after';
  ui.setPhase('after');
  $('playbar').classList.add('hidden');
  hud.clearBanner();
  game.chipsNew = true;
  hud.setFunds(res.money.fondsNew);
  hud.setDelta(`${fmtM(res.money.saldo, true)} dit kwartaal`, res.money.saldo >= 0);
  hud.setAffordable(res.money.fondsNew);
  ui.refresh();
  ui.showAfrekening(res);
  if (audio.started) audio.coin();
}
$('btn-skip').addEventListener('click', () => { sfx('click'); if (game.phase === 'play') endPlay(); });

ui.onNext = () => { sfx('click'); commitQuarter(); };
ui.onContinue = () => {
  const res = game.playRes!;
  ui.hideModal();
  if (session.done) {
    game.phase = 'eind';
    ui.setPhase('eind');
    ui.showEind();
    if (audio.started) audio.chime();
    return;
  }
  pendingSap = sapAdvice(session, res);
  enterPlan();

};
ui.onReplay = () => {
  pendingSap = null;
  ui.hideModal();
  session.reset();
  resetWorld();
  enterPlan(true);
  tweenTo(playView(), 1.6);
};
ui.onPanel = (p) => { if (p) { selectTool(null); $('topright').classList.remove('open'); } };
$('face-wrap').addEventListener('click', () => { if ($('topright').classList.contains('open')) ui.togglePanel(null); });

function resetWorld() {
  unplan([...vis.keys()].map((id) => ({ id } as PlanItem)));
  for (const c of committed) world.structures.remove(c.g);
  committed.length = 0;
  for (const c of [...patrol.cars]) patrol.remove(c);
  for (const l of world.lots) { l.subs = [true, true, true, true]; l.free = true; }
  placedAnims.length = 0;
  vis.clear();
}

// ------------------------------------------------------------------ title -> play
function startPlay() {
  if (game.phase !== 'title') return;
  audio.start(); audio.click(); audio.chime();
  $('title').classList.add('out');
  window.setTimeout(() => $('title').classList.add('gone'), 1000);
  tweenTo(playView(), 2.4);
  window.setTimeout(() => {
    $('app').classList.remove('hidden');
    enterPlan(true);
    if (q.get('skiptut') !== '1') tutorial.start();
    if (q.get('event')) events.start(q.get('event') as EventId);
  }, 1500);
}
$('btn-play').addEventListener('click', startPlay);

// ------------------------------------------------------------------ resize / quality
function applyTier(t: Tier) {
  tier = t;
  const c = TIERS[t];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, c.dpr));
  const sh = c.shadow > 0;
  if (renderer.shadowMap.enabled !== sh) {
    renderer.shadowMap.enabled = sh;
    scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true; });
  }
  renderer.toneMapping = c.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  if (sh && env.sun.shadow.mapSize.x !== c.shadow) {
    env.sun.shadow.mapSize.set(c.shadow, c.shadow);
    env.sun.shadow.map?.dispose(); env.sun.shadow.map = null;
  }
  if (c.post) post.configure({ tilt: c.tilt, smaa: c.smaa });
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
const fpsEl = q.get('fps') === '1' ? Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:999;font:12px monospace;color:#fff;background:#0008;padding:3px 6px;border-radius:4px' }) : null;
if (fpsEl) document.body.appendChild(fpsEl);
let hudTimer = 0;
const lookTarget = { x: 0, y: 0 };
let ready = false;
const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
const col = new THREE.Color();
const subOf = (l: Lot) => (game.tool && game.tool !== 'garage' ? Math.max(0, freeSub(l)) : -1);

function tick(dt: number) {
  time += dt;
  fpsAcc += dt; frames++;
  if (fpsAcc > 0.5) {
    fps = frames / fpsAcc; frames = 0; fpsAcc = 0;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${tier} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    // auto quality: step down when the frame rate stays low
    if (autoTier && ready) { lowFpsT = fps < 27 ? lowFpsT + 0.5 : Math.max(0, lowFpsT - 0.5); if (lowFpsT >= 3 && tier !== 'low') { lowFpsT = 0; applyTier(tier === 'high' ? 'med' : 'low'); } }
  }
  if (tipPinned > 0) { tipPinned -= dt; if (tipPinned <= 0) { tipPinned = 0; tip.classList.remove('show'); } }

  introT += dt;
  env.uniforms.uIntro.value = clamp((introT - 0.3) / 3.2);

  // clock: stands still while planning, sweeps through the day while a quarter plays
  if (game.phase === 'play') {
    game.playT += dt;
    const k = clamp(game.playT / PLAY_SECONDS);
    env.hour = lerp(8, 20.4, easeInOutCubic(k) * 0.6 + k * 0.4);
    if (!game.chipsNew && k > 0.35) game.chipsNew = true;
    if (game.playRes!.q === GOAL.marathon.quarter) runMarathon(dt);
    $('play-lbl').textContent = `Kwartaal ${game.playRes!.q + 1} loopt… ${Math.max(0, Math.ceil(PLAY_SECONDS - game.playT))} s`;
    if (game.playT >= PLAY_SECONDS) endPlay();
  } else if (game.phase === 'plan' || game.phase === 'after' || game.phase === 'eind') {
    if (game.phase === 'plan') env.hour = damp(env.hour, game.hourTarget, 2.5, dt);
  }
  routeGroup.visible = (game.phase === 'plan' || game.phase === 'play') && session.quarter === GOAL.marathon.quarter || (game.phase === 'play' && game.playRes?.q === GOAL.marathon.quarter);
  crowd.scaleMul = game.phase === 'play' && game.playRes?.q === GOAL.marathon.quarter ? 2.6 : 1;
  env.update(dt, time);
  world.setWet(env.wet);
  world.update(dt);
  const camDist = camera.position.distanceTo(controls.target);
  cars.update(dt, camDist);
  patrol.update(dt);
  crowd.update(dt);
  events.update(dt);
  fx.update(dt);

  // camera
  if (camTween) {
    camTween.t += dt;
    const k = easeInOutCubic(clamp(camTween.t / camTween.dur));
    const f = camTween.from, t = camTween.to;
    controls.target.set(lerp(f.tx, t.tx, k), 0, lerp(f.tz, t.tz, k));
    applyPose({ az: lerp(f.az, t.az, k), pol: lerp(f.pol, t.pol, k), dist: lerp(f.dist, t.dist, k) });
    if (k >= 1) { camTween = null; controls.enabled = game.phase !== 'title'; controls.update(); }
  } else if (controls.enabled || game.phase === 'title') {
    if (game.phase !== 'title') {
      if (events.focus && game.phase === 'play') {
        controls.target.x = lerp(controls.target.x, events.focus.x, 1 - Math.exp(-1.2 * dt));
        controls.target.z = lerp(controls.target.z, events.focus.z, 1 - Math.exp(-1.2 * dt));
      }
      controls.target.x = clamp(controls.target.x, -96, 140);
      controls.target.z = clamp(controls.target.z, -78, 100);
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

  // bouwplekken: faint outline when idle, glowing fill + outline for every valid one while a tool is selected
  {
    const tool = game.tool && TOOLS[game.tool].placed ? game.tool : null;
    const building = !!tool && game.phase === 'plan';
    const mk = world.lotMarks.material as THREE.MeshBasicMaterial;
    mk.opacity = (building ? 0.7 : 0.16) + (building ? 0.3 : 0.1) * Math.sin(time * (building ? 4.5 : 2.2));
    
    world.lots.forEach((l, i) => {
      const valid = building ? lotValid(l, tool!) : l.free && game.phase === 'plan';
      const s = valid ? 1 + 0.012 * Math.sin(time * 2.2 + i) : 0;
      m4.compose(v3.set(l.cx, 0.07, l.cz), qt.identity(), sc3.setScalar(s));
      world.lotMarks.setMatrixAt(i, m4);
      const hov = game.hoverLot === l && building && valid;
      m4.compose(v3.set(l.cx, 0.06, l.cz), qt.identity(), sc3.setScalar(building && valid ? 1 : 0));
      lotFill.setMatrixAt(i, m4);
      lotFill.setColorAt(i, col.set(hov ? '#2ecb82' : '#ffc42e'));
    });
    (lotFill.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.1 * Math.sin(time * 4);
    world.lotMarks.instanceMatrix.needsUpdate = true;
    lotFill.instanceMatrix.needsUpdate = true;
    if (lotFill.instanceColor) lotFill.instanceColor.needsUpdate = true;
  }

  // hover + ghost
  if (game.tool && TOOLS[game.tool].placed && game.phase === 'plan' && mouse.x > -2) {
    const p = pickAt(lastPointer.x, lastPointer.y);
    game.hoverLot = p ? lotAt(p.x, p.z) : null;
  } else game.hoverLot = null;
  hoverRing.visible = false; beam.visible = false;
  if (ghost && ghostTool === game.tool) {
    const l = game.hoverLot;
    ghost.visible = !!l;
    if (l) {
      const tl = game.tool!;
      const valid = lotValid(l, tl);
      const sub = subOf(l);
      const [ox, oz] = tl === 'garage' ? [0, 0] : subOffset(Math.max(0, sub));
      const x = l.cx + ox, z = l.cz + oz;
      const ok = valid && session.fondsAfterPlan() >= TOOLS[tl].cost;
      const big = tl === 'garage';
      ghost.position.set(x, 0.12 + Math.sin(time * 3.2) * 0.05, z);
      hoverRing.visible = true;
      hoverRing.position.set(l.cx, 0.09, l.cz);
      hoverRing.scale.setScalar(1.03 + 0.02 * Math.sin(time * 5));
      beam.visible = valid;
      beam.position.set(x, big ? 14 : 6, z);
      beam.scale.set(big ? 5.2 : 2.3, big ? 1.55 : 0.7, big ? 5.2 : 2.3);
      const c = ok ? '#7fe0a8' : valid ? '#ffd27a' : '#ff8a78';
      ghostMat.color.set(c);
      ghostMat.emissive.set(ok ? '#2f9e6a' : valid ? '#a8741c' : '#b0402f');
      (hoverRing.material as THREE.MeshBasicMaterial).color.set(ok ? '#14a860' : valid ? '#e09400' : '#d9442b');
      (beam.material as THREE.MeshBasicMaterial).color.set(c);
      const key = `${l.id}`;
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
  world.structures.traverse((o) => { if (o.name === 'halo') (o as THREE.Mesh).scale.setScalar(1 + 0.06 * Math.sin(time * 2.4)); });

  // HUD updates
  const lookX = lastPointer.x / window.innerWidth - 0.85, lookY = lastPointer.y / window.innerHeight - 0.15;
  lookTarget.x = damp(lookTarget.x, -lookX * 1.2, 6, dt); lookTarget.y = damp(lookTarget.y, -lookY * 1.2, 6, dt);
  hud.update(dt, lookTarget.x, lookTarget.y);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.12;
    hud.setClock(env.hour, game.phase !== 'play', env.night);
    audio.setState(clamp(cars.searching / 30), env.rain, env.night);
  }
  heat.setData(Object.fromEntries(Object.values(session.wijkViews(game.phase === 'play' && !game.chipsNew && game.playRes ? game.playRes.old : session.shown)).map((w) => [w.id, w.search])));
  heat.setVisible(ui.heatOn && game.phase === 'plan' && !game.tool && (!tutorial.active || tutorial.step >= 3));
  heat.update(dt);
  updateChips(dt);
  tutorial.update();
}
function draw(dt: number) {
  if (TIERS[tier].post) {
    post.bloom.intensity = env.bloom;
    post.bloom.luminanceMaterial.threshold = env.bloomThreshold;
    post.render(dt);
  } else renderer.render(scene, camera);
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

// ------------------------------------------------------------------ debug + test hooks
if (debug) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:999;background:#0009;color:#fff;font:12px monospace;padding:4px 8px;border-radius:6px;display:flex;gap:6px;align-items:center';
  box.innerHTML = 'druk (debug) <input type="range" min="0" max="100" value="60" id="dbg-p">';
  document.body.appendChild(box);
  ($('dbg-p') as HTMLInputElement).addEventListener('input', (e) => {
    const p = +(e.target as HTMLInputElement).value / 100;
    cars.setWijken(Object.fromEntries(WIJKEN.map((w) => [w.id, { bez: p * 1.25, search: 2 + 16 * p }])));
  });
}
(window as unknown as { __game: unknown }).__game = {
  get ready() { return ready; },
  get fps() { return fps; },
  get phase() { return game.phase; },
  session,
  setHour(h: number) { env.hour = h; game.hourTarget = h; },
  setRain(on: boolean) { env.rainTarget = on ? 1 : 0; env.rain = on ? 1 : 0; env.wet = on ? 1 : 0; hud.setRain(on); },
  camera(tx: number, tz: number, dist: number, az: number, pol: number) { setCamera(tx, tz, dist, az, pol); },
  labels(on = true) { toggleLabels(on); },
  startEvent(id: EventId) { events.start(id); },
  stopEvent() { events.stop(); },
  advance(seconds: number) { const n = Math.max(1, Math.round(seconds / 0.04)); for (let i = 0; i < n; i++) tick(0.04); draw(0.04); },
  freeze() { frozen = true; },
  thaw() { if (frozen) { frozen = false; clock.update(); requestAnimationFrame(frame); } },
  tier() { return tier; },
  /** debug: size of the marathon route node sets and how many random runner paths can be found */
  routeTest() { let ok = 0; for (let i = 0; i < 20 && routeStart.length && routeEnd.length; i++) if (crowd.sendBetween(routeStart[i % routeStart.length], routeEnd[(i * 7) % routeEnd.length], 4.6)) ok++; return { rs: routeStart.length, re: routeEnd.length, cn: centrumNodes.length, ok, count: crowd.count }; },
  fmtMin,
  /** screen position of the free bouwplek in a wijk that is nearest to the centre of the screen (tests click there) */
  lotXY(w: WijkId, n = 0, small = false) {
    refreshHudRects();
    const c = world.lots.filter((l) => l.wijk === w && (small ? l.subs.some(Boolean) : l.free)).map((l) => ({ l, s: screenOf(new THREE.Vector3(l.cx, 0.3, l.cz)) }))
      .filter(({ s }) => s.x > 20 && s.x < innerWidth - 20 && s.y > 20 && s.y < innerHeight - 20 && !underHud(s.x, s.y, 14, 14));
    c.sort((a, b) => Math.hypot(a.s.x - innerWidth / 2, a.s.y - innerHeight / 2) - Math.hypot(b.s.x - innerWidth / 2, b.s.y - innerHeight / 2));
    return c[n] ? c[n].s : null;
  },
  lotPos(w: WijkId) { return world.lots.filter((l) => l.wijk === w).map((l) => ({ id: l.id, x: l.cx, z: l.cz, free: l.free })); },
  wijkXY(w: WijkId) { const f = WIJK_BY_ID[w].focus; return screenOf(new THREE.Vector3(f[0], 1, f[1])); },
};

// compile everything once, then reveal
feedCars(); feedHud();
cars.snapNow(40);
if (q.get('cam')) { const c = q.get('cam')!.split(',').map(Number); setCamera(c[0], c[1], c[2], c[3], c[4]); }
else { setCamera(START.tx, START.tz, 560, START.az, 0.98); }
renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
  frame();
  window.setTimeout(() => {
    $('loading').classList.add('done');
    window.setTimeout(() => $('loading').remove(), 900);
    ready = true;
    if (q.get('play') === '1') {
      $('title').classList.add('gone');
      $('app').classList.remove('hidden');
      if (!q.get('cam')) { const v = playView(); setCamera(v.tx, v.tz, v.dist, v.az, v.pol); }
      controls.enabled = true; controls.autoRotate = false;
      game.phase = 'title';
      enterPlan(true);
      if (q.get('tutorial') === '1') tutorial.start();
    }
    if (q.get('labels') === '1') toggleLabels(true);
  }, 500);
});
