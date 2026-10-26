// Player-built structures (procedural). Each returns a Group centred on the lot, base at y = PAD_H.
import * as THREE from 'three';
import { GeoBuilder } from './geo';
const PAD_H = 0.05;
import { signTexture, screenTexture, radialTexture } from './tex';

export type ToolId = 'garage' | 'automaat' | 'fiets';

export interface ToolInfo {
  id: ToolId;
  label: string;
  short: string;
  cost: number; // in M€
  costLabel: string;
  upkeep: number; // M€ per year
  blurb: string;
  key: string;
}
export const TOOLS: Record<ToolId, ToolInfo> = {
  garage: { id: 'garage', label: 'Garage', short: 'Garage', cost: 12, costLabel: '12 M€', upkeep: 0.25, blurb: 'Wijkgarage met 400 plekken. Haalt auto\'s van straat, maar kost elk jaar beheer.', key: '1' },
  automaat: { id: 'automaat', label: 'Betaalautomaat', short: 'Automaat', cost: 0.015, costLabel: '15 k€', upkeep: 0.001, blurb: 'Betalen kan alleen als de automaat werkt. Zonder monteur gaat hij kapot.', key: '2' },
  fiets: { id: 'fiets', label: 'Fietsenstalling', short: 'Fiets', cost: 3, costLabel: '3 M€', upkeep: 0.1, blurb: '1.000 bewaakte fietsplekken. Fietsers blij, de straat een stuk rustiger.', key: '3' },
};

const mats = {
  vc: null as THREE.MeshStandardMaterial | null,
};

export function structureMaterial() {
  if (!mats.vc) mats.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
  return mats.vc;
}

/** Garage on a 2x2 lot (12 x 12): layered decks with parked cars, side ramp, glowing blue "P" sign on a tall pole. */
export function makeGarage(glow: THREE.Material): THREE.Group {
  const g = new GeoBuilder();
  const gl = new GeoBuilder();
  const concrete = '#d9d3c6', dark = '#a9a396', teal = '#3f7a78', band = '#e9e4d6';
  const W = 10.6, D = 10.6, lv = 5, lh = 2.15;
  g.box(W + 0.8, 0.14, D + 0.8, 0, PAD_H, 0, '#c4beaf', { ao: 1 });
  const cc = ['#d9805f', '#7aa6a6', '#efe6d4', '#c9b3a0', '#8d9fc4', '#e7c07a', '#cf6f6a', '#9fb58b'];
  for (let i = 0; i < lv; i++) {
    const y = PAD_H + 0.14 + i * lh;
    g.box(W, 0.34, D, 0, y + lh - 0.34, 0, concrete, { ao: 0.9, aoH: 0.6 });
    g.box(W + 0.24, 0.14, D + 0.24, 0, y + lh - 0.5, 0, band, { ao: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0, 1]) {
      const x = sx * (W / 2 - 0.4) * (k ? 0.35 : 1), z = sz * (D / 2 - 0.4);
      g.box(0.42, lh - 0.34, 0.42, x, y, z, dark, { ao: 0.8 });
    }
    // slatted side facades (north, west, east); open south side so the parked cars read from the camera
    const n = 17;
    for (let k = 0; k < n; k++) {
      const t = -W / 2 + 0.35 + (k * (W - 0.7)) / (n - 1);
      g.box(0.16, lh - 0.7, 0.12, t, y + 0.1, -D / 2 + 0.1, teal, { ao: 0.9 });
      g.box(0.12, lh - 0.7, 0.16, -W / 2 + 0.1, y + 0.1, t, teal, { ao: 0.9 });
      g.box(0.12, lh - 0.7, 0.16, W / 2 - 0.1, y + 0.1, t, teal, { ao: 0.9 });
    }
    g.box(W, 0.24, 0.14, 0, y + 0.55, D / 2 - 0.1, '#ece6d6', { ao: 1 });
    for (let k = 0; k < 6; k++) {
      const cx = -4.2 + k * 1.7;
      g.box(1.3, 0.55, 2.3, cx, y + 0.02, 2.6, cc[(k * 3 + i * 5) % cc.length], { ao: 0.8 });
      g.box(1.0, 0.3, 1.2, cx, y + 0.57, 2.4, '#27323d', { ao: 1 });
      if ((k + i) % 3 !== 0) { g.box(1.3, 0.55, 2.3, cx, y + 0.02, -2.2, cc[(k * 2 + i) % cc.length], { ao: 0.8 }); g.box(1.0, 0.3, 1.2, cx, y + 0.57, -2.0, '#27323d', { ao: 1 }); }
    }
    gl.box(W - 1.6, 0.07, 0.2, 0, y + lh - 0.55, 0.2, '#ffffff', { ao: 1 });
    gl.box(W - 1.6, 0.07, 0.2, 0, y + lh - 0.55, -3.8, '#ffffff', { ao: 1 });
  }
  const top = PAD_H + 0.14 + lv * lh;
  // roof deck parapet + stair core
  g.box(W, 0.4, 0.2, 0, top, D / 2 - 0.1, '#ece6d6', { ao: 1 });
  g.box(2.4, 1.9, 2.4, 3.4, top, -3.4, '#c9c2b2', { ao: 0.8 });
  g.box(2.6, 0.16, 2.6, 3.4, top + 1.9, -3.4, teal, { ao: 1 });
  // ramp on the east side
  const ramp = new THREE.BoxGeometry(2.6, 0.3, 8.6);
  const rm = new THREE.Matrix4().makeRotationX(-0.19);
  rm.setPosition(W / 2 + 1.5, PAD_H + 1.3, 0.8);
  g.add(ramp, '#bdb7a8', rm, { ao: 1 });
  g.box(0.2, 1.1, 8.8, W / 2 + 2.7, PAD_H + 1.4, 0.8, dark, { ao: 1 });
  // sign pole
  g.box(0.3, 7.2, 0.3, -W / 2 - 0.6, top, D / 2 - 0.5, '#3c4450', { ao: 1 });
  const group = new THREE.Group();
  const m = new THREE.Mesh(g.build()!, structureMaterial());
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  group.add(new THREE.Mesh(gl.build()!, glow));
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture('P', '#1d62d6', '#ffffff'), toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.7) });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 0.4), signMat);
  sign.position.set(-W / 2 - 0.6, top + 9.0, D / 2 - 0.5);
  sign.castShadow = true;
  group.add(sign);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(90,150,255,0.8)', 'rgba(90,150,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(sign.position); halo.position.z += 0.5; halo.name = 'halo';
  group.add(halo);
  group.userData.height = top + 11;
  group.userData.sign = sign;
  return group;
}

export function makeAutomaat(glow: THREE.Material): THREE.Group {
  const g = new GeoBuilder();
  const group = new THREE.Group();
  // little plaza
  g.box(2.3, 0.04, 2.3, 0, PAD_H, 0, '#e4d8bf', { ao: 1 });
  // three marked bays on one side
  for (let k = 0; k < 4; k++) g.box(0.04, 0.012, 0.75, -0.9 + k * 0.6, PAD_H + 0.045, 0.75, '#fff6e0', { ao: 1 });
  // kiosk
  g.box(0.5, 1.15, 0.38, 0, PAD_H + 0.04, -0.25, '#3f7a78', { ao: 0.75, aoH: 0.6 });
  g.box(0.56, 0.09, 0.46, 0, PAD_H + 1.19, -0.25, '#2f5f5f', { ao: 1 });
  g.box(0.36, 0.2, 0.02, 0, PAD_H + 0.46, -0.05, '#f3e9d2', { ao: 1 }); // coin panel
  g.box(0.06, 0.06, 0.03, 0.1, PAD_H + 0.56, -0.04, '#caa24a', { ao: 1 });
  // small sibling meters
  for (const sx of [-0.8, 0.8]) {
    g.box(0.2, 0.55, 0.16, sx, PAD_H + 0.04, -0.7, '#57827d', { ao: 0.8 });
    g.box(0.24, 0.05, 0.2, sx, PAD_H + 0.59, -0.7, '#2f5f5f', { ao: 1 });
  }
  // planter boxes
  for (const sx of [-1, 1]) {
    g.box(0.5, 0.18, 0.3, sx * 0.85, PAD_H + 0.04, -1.0, '#9a7a5a', { ao: 0.9 });
    g.sphere(0.22, sx * 0.85, PAD_H + 0.3, -1.0, '#7e9e5b', 1, 0.8, 1, 1, { ao: 0.8, aoH: 0.3 });
  }
  const m = new THREE.Mesh(g.build()!, structureMaterial());
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.position.set(0, PAD_H + 0.86, -0.054);
  screen.rotation.y = 0;
  screen.position.z = -0.25 + 0.2;
  group.add(screen);
  // tall P-sign so it reads from far away
  const pole = new GeoBuilder();
  pole.box(0.05, 1.7, 0.05, 0.9, PAD_H + 0.04, 0.9, '#3c4450', { ao: 1 });
  const pm = new THREE.Mesh(pole.build()!, structureMaterial()); pm.castShadow = true;
  group.add(pm);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), new THREE.MeshBasicMaterial({ map: signTexture('€', '#c9674f'), toneMapped: false }));
  sign.position.set(0.9, PAD_H + 1.95, 0.9);
  group.add(sign);
  const gl = new GeoBuilder();
  gl.box(0.3, 0.03, 0.03, 0, PAD_H + 1.0, -0.05, '#ffffff', { ao: 1 });
  group.add(new THREE.Mesh(gl.build()!, glow));
  group.userData.height = 2.2;
  return group;
}

export function makeFiets(glow: THREE.Material): THREE.Group {
  const g = new GeoBuilder();
  const group = new THREE.Group();
  g.box(2.3, 0.04, 2.3, 0, PAD_H, 0, '#e4d8bf', { ao: 1 });
  // canopy: half-cylinder shell over posts (axis along x, arching upwards)
  g.add(new THREE.CylinderGeometry(0.98, 0.98, 2.2, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), '#7fb3a3', new THREE.Matrix4().makeTranslation(0, PAD_H + 0.95, 0), { ao: 1 });
  for (const sx of [-1.05, 1.05]) for (const sz of [-0.95, 0.95]) g.box(0.07, 0.95, 0.07, sx, PAD_H + 0.04, sz, '#4a5560', { ao: 0.9 });
  // bikes in two rows
  const cols = ['#d9805f', '#e7c07a', '#7aa6a6', '#cf6f6a', '#8d9fc4', '#efe6d4', '#9fb58b'];
  const wheel = new THREE.TorusGeometry(0.17, 0.018, 4, 12);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 7; k++) {
      const x = -0.9 + k * 0.3;
      const z = r === 0 ? -0.5 : 0.5;
      const c = cols[(k + r * 3) % cols.length];
      const w1 = new THREE.Matrix4().makeRotationY(Math.PI / 2); w1.setPosition(x, PAD_H + 0.21, z - 0.2);
      const w2 = new THREE.Matrix4().makeRotationY(Math.PI / 2); w2.setPosition(x, PAD_H + 0.21, z + 0.2);
      g.add(wheel, '#2b2e33', w1, { ao: 1 });
      g.add(wheel, '#2b2e33', w2, { ao: 1 });
      g.strut(new THREE.Vector3(x, PAD_H + 0.21, z - 0.2), new THREE.Vector3(x, PAD_H + 0.36, z), 0.014, c);
      g.strut(new THREE.Vector3(x, PAD_H + 0.36, z), new THREE.Vector3(x, PAD_H + 0.21, z + 0.2), 0.014, c);
      g.box(0.02, 0.1, 0.1, x, PAD_H + 0.36, z - 0.03, '#3c3a38', { ao: 1 });
      g.box(0.1, 0.02, 0.02, x, PAD_H + 0.42, z - 0.17, '#3c3a38', { ao: 1 });
    }
  }
  const m = new THREE.Mesh(g.build()!, structureMaterial());
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), new THREE.MeshBasicMaterial({ map: signTexture('F', '#3f7a78'), toneMapped: false }));
  sign.position.set(0, PAD_H + 1.65, 1.0);
  group.add(sign);
  const gl = new GeoBuilder();
  gl.box(1.8, 0.03, 0.04, 0, PAD_H + 0.88, 0, '#ffffff', { ao: 1 });
  group.add(new THREE.Mesh(gl.build()!, glow));
  group.userData.height = 1.9;
  return group;
}

export const SMALL_SCALE = 2.4;
export function makeStructure(id: ToolId, glow: THREE.Material): THREE.Group {
  if (id === 'garage') return makeGarage(glow);
  const inner = id === 'automaat' ? makeAutomaat(glow) : makeFiets(glow);
  inner.scale.setScalar(SMALL_SCALE);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.height = (inner.userData.height ?? 2) * SMALL_SCALE;
  return g;
}
