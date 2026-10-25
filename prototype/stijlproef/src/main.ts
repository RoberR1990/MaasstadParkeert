import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Environment } from './env';
import { World } from './world';
import { CarSystem } from './cars';
import { Fx } from './fx';
import { Post } from './post';
import { Hud, PersonaId } from './hud';
import { Tutorial } from './tutorial';
import { audio } from './audio';
import { TOOLS, ToolId, makeStructure } from './structures';
import { Lot } from './city';
import { PAD_H } from './config';
import { clamp, damp, easeInOutCubic, easeOutBack, lerp } from './util';

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ renderer / scene
const canvas = $('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // ACES is applied in the post-processing chain
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 4, 700);

const env = new Environment(scene, renderer);
const world = new World(env);
scene.add(world.group);
const cars = new CarSystem(world.bays);
scene.add(cars.group);
const fx = new Fx();
scene.add(fx.group);
const post = new Post(renderer, scene, camera);

// ------------------------------------------------------------------ game state
const game = {
  funds: 120,
  quarter: 0,
  qTimer: 0,
  qDur: 40,
  tool: null as ToolId | null,
  placed: { garage: 0, automaat: 0, fiets: 0 } as Record<ToolId, number>,
  pressure: clamp(+(q.get('pressure') ?? 60) / 100),
  paused: q.get('pause') === '1',
  playing: false,
  hoverLot: null as Lot | null,
  searchLevel: 0,
  shake: 0,
};
env.hour = +(q.get('hour') ?? 10);
env.rainTarget = q.get('rain') === '1' ? 1 : 0;
const HOUR_PER_SEC = 24 / 60;

// ------------------------------------------------------------------ camera
const TARGET = new THREE.Vector3(0, 0, 15);
const BASE_AZ = 0.62;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
controls.panSpeed = 0.7;
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.target.copy(TARGET);
const camPose = { az: BASE_AZ, pol: 0.98, dist: Number(q.get('dist') ?? 195) };
function applyPose(p = camPose) {
  const s = new THREE.Spherical(p.dist, p.pol, p.az);
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target);
}
applyPose();
function limitCamera(on: boolean) {
  controls.minPolarAngle = on ? 0.62 : 0.98;
  controls.maxPolarAngle = on ? 1.2 : 0.98;
  controls.minAzimuthAngle = on ? BASE_AZ - 1.0 : -Infinity;
  controls.maxAzimuthAngle = on ? BASE_AZ + 1.0 : Infinity;
  controls.minDistance = on ? 70 : 100;
  controls.maxDistance = on ? 240 : 400;
}
limitCamera(false);
controls.enabled = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
let idle = 0;
let driftDir = 1;
controls.addEventListener('start', () => { idle = -1; controls.autoRotate = false; });
controls.addEventListener('end', () => { idle = 0; });

function fitDistance() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

let camTween: { t: number; dur: number; from: { az: number; pol: number; dist: number; tx: number; tz: number }; to: typeof camPose } | null = null;
function tweenToPlayView(dur = 2.2) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let az = s.theta;
  // choose the equivalent angle closest to BASE_AZ
  while (az - BASE_AZ > Math.PI) az -= Math.PI * 2;
  while (az - BASE_AZ < -Math.PI) az += Math.PI * 2;
  camTween = { t: 0, dur, from: { az, pol: s.phi, dist: s.radius, tx: controls.target.x, tz: controls.target.z }, to: { az: BASE_AZ, pol: 1.0, dist: Number(q.get('dist') ?? 182) } };
  controls.autoRotate = false;
  controls.enabled = false;
}

// ------------------------------------------------------------------ HUD + audio wiring
const hud = new Hud();
$('btn-rain').classList.toggle('on', env.rainTarget > 0);
let userInteracted = false;
const kick = () => { if (!userInteracted) { userInteracted = true; } audio.start(); };
window.addEventListener('pointerdown', kick, { passive: true });
window.addEventListener('keydown', kick);

hud.onSound = (k, v) => {
  if (!audio.started) return;
  if (k === 'click') audio.click(); else if (k === 'tick') audio.tick(); else audio.sliderTick(v ?? 0);
};
hud.onPressure = (v) => { game.pressure = v; };
hud.onClock = () => { game.paused = !game.paused; };
hud.onRain = () => { env.rainTarget = env.rainTarget > 0 ? 0 : 1; hud.setRain(env.rainTarget > 0); };
hud.onMute = () => { audio.setMuted(!audio.muted); hud.setMute(audio.muted); };
hud.onTool = (id) => selectTool(id);
hud.setRain(env.rainTarget > 0);
($('p-range') as HTMLInputElement).value = String(Math.round(game.pressure * 100));

function selectTool(id: ToolId | null) {
  game.tool = id;
  hud.selectTool(id);
  rebuildGhost();
  if (id) hud.hint(`${TOOLS[id].label}: kies een vrije kavel (gloeit) · Esc om te stoppen`);
  else if (!tutorial.active) hud.hint(null);
}

// ------------------------------------------------------------------ ghost + placing
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9, -9);
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_H);
const hit = new THREE.Vector3();
let ghost: THREE.Group | null = null;
let ghostTool: ToolId | null = null;
const ghostMat = new THREE.MeshStandardMaterial({ color: '#7fe0a8', emissive: '#2f9e6a', emissiveIntensity: 0.9, transparent: true, opacity: 0.78, depthWrite: true, roughness: 0.5 });
const ghostRing = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.55, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#7fe0a8', transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
ghostRing.visible = false; ghostRing.renderOrder = 7;
scene.add(ghostRing);
// light beam over the hovered lot + bobbing arrows over every free lot
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#7fe0a8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
beam.visible = false; beam.renderOrder = 8;
scene.add(beam);
const arrowGeo = new THREE.ConeGeometry(0.42, 0.9, 4).rotateX(Math.PI).rotateY(Math.PI / 4);
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

function lotAt(x: number, z: number): Lot | null {
  let best: Lot | null = null; let bd = 1.9;
  for (const l of world.lots) {
    const d = Math.max(Math.abs(l.cx - x), Math.abs(l.cz - z));
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

function screenOf(p: THREE.Vector3) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}

let downPos = { x: 0, y: 0 };
canvas.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
});
canvas.addEventListener('pointerleave', () => { mouse.set(-9, -9); });
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; if (e.button === 2) selectTool(null); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', (e) => {
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
  if (game.tool && game.hoverLot) tryPlace(game.hoverLot, game.tool);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectTool(null);
  if (e.key === '1') selectTool('garage');
  if (e.key === '2') selectTool('automaat');
  if (e.key === '3') selectTool('fiets');
  if (e.key.toLowerCase() === 'm') hud.onMute();
  if (e.key === ' ') { game.paused = !game.paused; e.preventDefault(); }
});
const lastPointer = { x: 0, y: 0 };

const placedAnims: { g: THREE.Group; t: number; h: number }[] = [];

function tryPlace(lot: Lot, id: ToolId) {
  const info = TOOLS[id];
  if (!lot.free) { audio.started && audio.error(); hud.shakeTool(id); hud.floater(lastPointer.x, lastPointer.y - 20, 'Hier staat al iets', 'msg', false); return false; }
  if (game.funds < info.cost) { audio.started && audio.error(); hud.shakeTool(id); hud.floater(lastPointer.x, lastPointer.y - 20, 'Te weinig geld in het fonds', 'msg', false); return false; }
  place(lot, id);
  return true;
}

function place(lot: Lot, id: ToolId) {
  const info = TOOLS[id];
  lot.free = false;
  if (lot.marker) { world.group.remove(lot.marker); }
  const g = makeStructure(id, world.glowMat);
  g.position.set(lot.cx, 0, lot.cz);
  g.scale.set(1, 0.001, 1);
  world.structures.add(g);
  placedAnims.push({ g, t: 0, h: g.userData.height ?? 2 });
  fx.burst(lot.cx, PAD_H, lot.cz);
  game.shake = 0.45;
  game.funds -= info.cost;
  game.placed[id]++;
  hud.setFunds(game.funds);
  const sp = screenOf(new THREE.Vector3(lot.cx, 2.2, lot.cz));
  hud.floater(sp.x, sp.y, `−${info.costLabel}`, 'neg');
  if (audio.started) { audio.plop(); audio.coin(); audio.whoosh(); }
  const upkeep = (Object.keys(game.placed) as ToolId[]).reduce((s, k) => s + game.placed[k] * TOOLS[k].upkeep, 0);
  hud.setUpkeep(upkeep);
  // relief for nearby streets
  const rel: { x: number; z: number; r: number; k: number }[] = [];
  const all = placedList; all.push({ x: lot.cx, z: lot.cz, id });
  for (const p of all) rel.push({ x: p.x, z: p.z, r: p.id === 'garage' ? 30 : p.id === 'fiets' ? 14 : 12, k: p.id === 'garage' ? 0.95 : p.id === 'fiets' ? 0.14 : 0.1 });
  cars.setReliefs(rel);
  cars.onRelief();
  tutorial.notifyPlaced(id);
  selectTool(null);
  hud.setAffordable(game.funds);
}
const placedList: { x: number; z: number; id: ToolId }[] = [];

// ------------------------------------------------------------------ tutorial
const tutorial = new Tutorial({
  hud,
  getSearchScreen: () => {
    const p = cars.pickSearcher(camera, window.innerWidth, window.innerHeight);
    return p ? screenOf(p) : null;
  },
  getLotScreen: () => {
    // nearest free lot to the screen centre
    let best: Lot | null = null; let bd = 1e9;
    for (const l of world.lots) if (l.free) {
      const s = screenOf(new THREE.Vector3(l.cx, 0.5, l.cz));
      const d = Math.hypot(s.x - window.innerWidth / 2, (s.y - window.innerHeight * 0.52) * 1.3);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? screenOf(new THREE.Vector3(best.cx, 0.9, best.cz)) : null;
  },
  toolSelected: () => game.tool,
  onDone: () => { },
  onSound: (k) => { if (!audio.started) return; if (k === 'click') audio.click(); else audio.chime(); },
});

// ------------------------------------------------------------------ derived stats for HUD
const personaVals: Record<PersonaId, number> = { bewoner: 70, ondernemer: 70, bezoeker: 70, fietser: 60, stad: 70, wethouder: 70 };
function computePersonas() {
  const s = game.searchLevel;
  const g = game.placed.garage, m = game.placed.automaat, b = game.placed.fiets;
  const p = game.pressure;
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
      if (q.get('pressure') === null) { game.pressure = 0.72; }
      tutorial.start();
    }
  }, 1500);
}
$('btn-play').addEventListener('click', startPlay);

// ------------------------------------------------------------------ resize
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  fitDistance();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ main loop
const clock = new THREE.Timer();
let time = 0;
let frames = 0, fpsAcc = 0, fps = 60;
let introT = q.get('intro') === '0' ? 5 : 0;
const fpsEl = q.get('fps') === '1' ? Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;top:8px;z-index:999;font:12px monospace;color:#fff;background:#0008;padding:3px 6px;border-radius:4px' }) : null;
if (fpsEl) document.body.appendChild(fpsEl);
let hudTimer = 0;
const lookTarget = { x: 0, y: 0 };
let ready = false;

function tick(dt: number) {
  time += dt;
  fpsAcc += dt; frames++;
  if (fpsAcc > 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`; }

  // intro: the city grows from the middle of the island
  introT += dt;
  env.uniforms.uIntro.value = clamp((introT - 0.3) / 3.2);

  // time of day
  if (!game.paused) env.hour = (env.hour + dt * HOUR_PER_SEC) % 24;
  env.update(dt, time);
  world.setWet(env.wet);
  world.update(dt);
  cars.setPressure(game.pressure);
  cars.update(dt);
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
    controls.target.set(lerp(f.tx, TARGET.x, k), 0, lerp(f.tz, TARGET.z, k));
    applyPose({ az: lerp(f.az, t.az, k), pol: lerp(f.pol, t.pol, k), dist: lerp(f.dist, t.dist, k) });
    if (k >= 1) { camTween = null; controls.enabled = true; limitCamera(true); controls.update(); idle = 0; }
  } else if (controls.enabled || !game.playing) {
    if (game.playing) {
      idle += dt;
      if (idle > 6 && idle >= 0 && !controls.autoRotate) { controls.autoRotate = true; }
      if (controls.autoRotate) {
        const az = controls.getAzimuthalAngle();
        if (az > BASE_AZ + 0.4) driftDir = -1; else if (az < BASE_AZ - 0.4) driftDir = 1;
        controls.autoRotateSpeed = 0.35 * driftDir * -1;
      }
      // keep the view over the island
      controls.target.x = clamp(controls.target.x, -26, 26);
      controls.target.z = clamp(controls.target.z, -20, 36);
      controls.target.y = 0;
    }
    controls.update();
  }

  // screen shake via view offset
  if (game.shake > 0.001) {
    game.shake = damp(game.shake, 0, 7, dt);
    const w = window.innerWidth, h = window.innerHeight;
    camera.setViewOffset(w, h, (Math.random() - 0.5) * 16 * game.shake, (Math.random() - 0.5) * 16 * game.shake, w, h);
  } else if (camera.view?.enabled) camera.clearViewOffset();

  // hover + ghost
  const showLots = !!game.tool;
  for (const l of world.lots) if (l.marker && l.free) {
    const mat = l.marker.material as THREE.MeshStandardMaterial;
    mat.emissive.set('#ffe9a8');
    mat.emissiveIntensity = showLots ? 0.8 + 0.5 * Math.sin(time * 4 + l.id) : 0;
  }
  {
    const m4 = new THREE.Matrix4();
    world.lots.forEach((l, i) => {
      if (showLots && l.free && game.playing) {
        const sc = 1.9 + 0.2 * Math.sin(time * 6 + i);
        m4.compose(new THREE.Vector3(l.cx, 3.1 + Math.sin(time * 3.4 + i) * 0.35, l.cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 1.6), new THREE.Vector3(sc, sc, sc));
        arrows.setMatrixAt(i, m4);
      } else arrows.setMatrixAt(i, zeroM);
    });
    arrows.instanceMatrix.needsUpdate = true;
  }
  if (game.tool && game.playing && mouse.x > -2) {
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) game.hoverLot = lotAt(hit.x, hit.z); else game.hoverLot = null;
  } else if (!(window as unknown as { __forceHover?: boolean }).__forceHover) game.hoverLot = null;
  if (!game.tool) beam.visible = false;
  if (ghost && ghostTool === game.tool) {
    const l = game.hoverLot;
    ghost.visible = !!l;
    ghostRing.visible = !!l;
    beam.visible = !!l;
    if (l) {
      const ok = l.free && game.funds >= TOOLS[game.tool!].cost;
      const bob = Math.sin(time * 3.2) * 0.04;
      ghost.position.set(l.cx, 0.12 + bob, l.cz);
      ghostRing.position.set(l.cx, PAD_H + 0.06, l.cz);
      beam.position.set(l.cx, 4.6, l.cz);
      ghostRing.scale.setScalar(1 + 0.03 * Math.sin(time * 5));
      const col = ok ? '#7fe0a8' : l.free ? '#ffd27a' : '#ff8a78';
      ghostMat.color.set(col);
      ghostMat.emissive.set(ok ? '#2f9e6a' : l.free ? '#a8741c' : '#b0402f');
      (ghostRing.material as THREE.MeshBasicMaterial).color.set(col);
      (beam.material as THREE.MeshBasicMaterial).color.set(col);
      if (game.hoverLot !== lastHoverReported) { lastHoverReported = game.hoverLot; if (audio.started) audio.tick(); }
    }
  }

  // placed building animations (spring up with overshoot + squash)
  for (let i = placedAnims.length - 1; i >= 0; i--) {
    const a = placedAnims[i];
    a.t += dt;
    const k = clamp(a.t / 0.85);
    const e = Math.max(0.001, easeOutBack(k, 2.4));
    a.g.scale.set(1 + (1 - Math.min(1, e)) * 0.12 - Math.max(0, e - 1) * 0.08, e, 1 + (1 - Math.min(1, e)) * 0.12 - Math.max(0, e - 1) * 0.08);
    if (k >= 1) { a.g.scale.set(1, 1, 1); placedAnims.splice(i, 1); }
  }

  // HUD updates
  game.searchLevel = damp(game.searchLevel, clamp(cars.searching / 28), 2.2, dt);
  const overall = computePersonas();
  hudTimer -= dt;
  const nightF = env.night;
  const lx = lastPointer.x / window.innerWidth - 0.85, ly = lastPointer.y / window.innerHeight - 0.15;
  lookTarget.x = damp(lookTarget.x, -lx * 1.2, 6, dt); lookTarget.y = damp(lookTarget.y, -ly * 1.2, 6, dt);
  hud.update(dt, -lookTarget.x * -1, -lookTarget.y * -1);
  if (hudTimer <= 0) {
    hudTimer = 0.12;
    hud.setPersonas(personaVals, overall);
    const occ = cars.parkedCount / world.bays.length;
    const minutes = 1.5 + 11.5 * Math.pow(game.searchLevel, 1.1);
    hud.setPressureUi(game.pressure, cars.searching, minutes, occ);
    hud.setClock(env.hour, game.paused, nightF);
    const year = 2026 + Math.floor(game.quarter / 4);
    hud.setQuarter(game.quarter, year, game.qTimer / game.qDur);
    hud.setAffordable(game.funds);
    audio.setState(game.pressure, env.rain, nightF);
  }
  tutorial.update(dt);
}
function draw(dt: number) {
  post.bloom.intensity = env.bloom;
  post.bloom.luminanceMaterial.threshold = env.bloomThreshold;
  post.render(dt);
}
const manual = q.get('manual') === '1';
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  tick(dt);
  draw(dt);
  if (!frozen && !manual) requestAnimationFrame(frame);
}
let frozen = false;
let lastHoverReported: Lot | null = null;

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
  hoverLot(id: number | null) { (window as unknown as { __forceHover?: boolean }).__forceHover = id !== null; game.hoverLot = id === null ? null : world.lots.find((l) => l.id === id) ?? null; mouse.set(-9, -9); },
  placeAt(id: number, tool: ToolId = 'garage') { const l = world.lots.find((x) => x.id === id); return l ? tryPlace(l, tool) : false; },
  play() { startPlay(); },
  skipIntro() { introT = 10; tween(); },
  camera(az: number, pol: number, dist: number) { applyPose({ az, pol, dist }); },
  steps(n: number) { cars.snapNow(n); },
  startTutorial() { $('app').classList.remove('hidden'); tutorial.start(); },
  projectLot(id: number) { const l = world.lots.find((x) => x.id === id)!; return screenOf(new THREE.Vector3(l.cx, 1, l.cz)); },
  /** Manual mode: simulate `seconds` without rendering, then draw one frame. */
  advance(seconds: number) { const n = Math.max(1, Math.round(seconds / 0.04)); for (let i = 0; i < n; i++) tick(0.04); draw(0.04); },
  freeze() { frozen = true; },
  thaw() { if (frozen) { frozen = false; clock.update(); requestAnimationFrame(frame); } },
  state: game,
};
function tween() { camTween = null; }

// compile everything once, then reveal
cars.setPressure(game.pressure);
cars.snapNow(40);
renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
  frame();
  window.setTimeout(() => {
    $('loading').classList.add('done');
    ready = true;
    if (q.get('play') === '1') {
      game.playing = true;
      $('title').classList.add('gone');
      $('app').classList.remove('hidden');
      applyPose({ az: BASE_AZ, pol: 1.0, dist: Number(q.get('dist') ?? 182) });
      controls.enabled = true; limitCamera(true); controls.autoRotate = false; idle = -9999;
      if (q.get('tutorial') === '1') tutorial.start();
    }
  }, 500);
});
