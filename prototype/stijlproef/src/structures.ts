// Player-built structures (procedural). Each returns a Group centred on the lot, base at y = PAD_H.
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { PAD_H } from './config';
import { signTexture, screenTexture } from './tex';

export type ToolId = 'garage' | 'automaat' | 'fiets';

export interface ToolInfo {
  id: ToolId;
  label: string;
  cost: number; // in M€
  costLabel: string;
  upkeep: number; // M€ per year
  blurb: string;
  key: string;
}
export const TOOLS: Record<ToolId, ToolInfo> = {
  garage: { id: 'garage', label: 'Garage', cost: 12, costLabel: '12 M€', upkeep: 0.25, blurb: 'Wijkgarage met 400 plekken. Haalt auto\'s van straat, maar kost elk jaar beheer.', key: '1' },
  automaat: { id: 'automaat', label: 'Betaalautomaat', cost: 0.015, costLabel: '15 k€', upkeep: 0.001, blurb: 'Betalen kan alleen als de automaat werkt. Zonder monteur gaat hij kapot.', key: '2' },
  fiets: { id: 'fiets', label: 'Fietsenstalling', cost: 3, costLabel: '3 M€', upkeep: 0.1, blurb: '1.000 bewaakte fietsplekken. Fietsers blij, de straat een stuk rustiger.', key: '3' },
};

const mats = {
  vc: null as THREE.MeshStandardMaterial | null,
};

export function structureMaterial() {
  if (!mats.vc) mats.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
  return mats.vc;
}

export function makeGarage(glow: THREE.Material): THREE.Group {
  const g = new GeoBuilder();
  const gl = new GeoBuilder();
  const concrete = '#d9d3c6';
  const dark = '#b6b0a3';
  const teal = '#3f7a78';
  const sizeW = 2.3;
  const lv = 5;
  const lh = 0.9;
  g.box(sizeW + 0.1, 0.12, sizeW + 0.1, 0, PAD_H, 0, '#bfb9ab', { ao: 1 });
  for (let i = 0; i < lv; i++) {
    const y = PAD_H + 0.12 + i * lh;
    g.box(sizeW, 0.12, sizeW, 0, y + lh - 0.12, 0, concrete, { ao: 0.9, aoH: 0.15 });
    // columns
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.14, lh - 0.12, 0.14, sx * (sizeW / 2 - 0.1), y, sz * (sizeW / 2 - 0.1), dark, { ao: 0.8 });
    // slatted facade on 3 sides, open front on +z with parked cars visible
    const n = 11;
    for (let k = 0; k < n; k++) {
      const t = -sizeW / 2 + 0.12 + (k * (sizeW - 0.24)) / (n - 1);
      g.box(0.06, lh - 0.3, 0.05, t, y + 0.04, -sizeW / 2 + 0.03, teal, { ao: 0.9 });
      g.box(0.05, lh - 0.3, 0.06, -sizeW / 2 + 0.03, y + 0.04, t, teal, { ao: 0.9 });
      g.box(0.05, lh - 0.3, 0.06, sizeW / 2 - 0.03, y + 0.04, t, teal, { ao: 0.9 });
      if (k % 2 === 0) g.box(0.05, lh - 0.3, 0.05, t, y + 0.04, sizeW / 2 - 0.03, teal, { ao: 0.9 });
    }
    // front rail + coloured bumper blocks for parked cars
    g.box(sizeW, 0.12, 0.05, 0, y + 0.22, sizeW / 2 - 0.03, '#ece6d6', { ao: 1 });
    const cc = ['#d9805f', '#7aa6a6', '#efe6d4', '#c9b3a0', '#8d9fc4'];
    for (let k = 0; k < 4; k++) g.box(0.42, 0.2, 0.7, -0.78 + k * 0.52, y + 0.02, 0.1, cc[(k + i) % cc.length], { ao: 0.8 });
    // soft interior light strip (glows at night)
    gl.box(sizeW - 0.5, 0.025, 0.06, 0, y + lh - 0.15, 0.2, '#ffffff', { ao: 1 });
    gl.box(sizeW - 0.5, 0.025, 0.06, 0, y + lh - 0.15, -0.5, '#ffffff', { ao: 1 });
  }
  const top = PAD_H + 0.12 + lv * lh;
  // stair / lift core
  g.box(0.7, 0.55, 0.7, 0.7, top, -0.7, '#c9c2b2', { ao: 0.8 });
  g.box(0.74, 0.06, 0.74, 0.7, top + 0.55, -0.7, teal, { ao: 1 });
  // ramp on the side
  const ramp = new THREE.BoxGeometry(0.7, 0.08, 2.0);
  const rm = new THREE.Matrix4().makeRotationX(-0.28);
  rm.setPosition(sizeW / 2 + 0.38, PAD_H + 0.55, 0);
  g.add(ramp, '#bfb9ab', rm, { ao: 1 });
  g.box(0.1, 0.5, 0.1, sizeW / 2 + 0.38, PAD_H, 0.95, dark, { ao: 1 });
  // sign pole
  g.box(0.08, 1.4, 0.08, -0.95, top, 0.95, '#3c4450', { ao: 1 });
  const group = new THREE.Group();
  const m = new THREE.Mesh(g.build()!, structureMaterial());
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  const glowMesh = new THREE.Mesh(gl.build()!, glow);
  group.add(glowMesh);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.12), new THREE.MeshBasicMaterial({ map: signTexture('P'), toneMapped: false }));
  sign.position.set(-0.95, top + 2.0, 0.95);
  sign.castShadow = true;
  group.add(sign);
  group.userData.height = top + 1.7;
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

export function makeStructure(id: ToolId, glow: THREE.Material): THREE.Group {
  return id === 'garage' ? makeGarage(glow) : id === 'automaat' ? makeAutomaat(glow) : makeFiets(glow);
}
