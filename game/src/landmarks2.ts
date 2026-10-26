// Landmarks, part 2: Coolsingel / Stadhuis / Hofplein, Centraal Station, parks (Museumpark, Het Park), Kuip, Kleinpolderplein, Diergaarde.
import * as THREE from 'three';
import { FAC } from './geo';
import { V, label, signMesh, type LM } from './landmarks';
import { range } from './util';

const WHITE = '#f6f3ea';

export function buildLandmarks2(lm: LM) {
  coolsingel(lm);
  stadhuis(lm, -15.8, -8.6);
  fountain(lm, 0, -42);
  station(lm);
  museumpark(lm);
  euromast(lm, -61.5, 5.5);
  kuip(lm, 77, 67);
  kleinpolder(lm);
  diergaarde(lm);
}

function coolsingel(lm: LM) {
  const t = lm.town;
  for (let z = -30; z < 3; z += 4.4) for (const s of [-1, 1]) t.tree(s * 7.6, z, 0.85, 1);
  for (let z = -32; z > -53; z -= 4.4) for (const s of [-1, 1]) if (Math.abs(z + 42) > 14) t.tree(s * 7.6, z, 0.85, 1);
  label(lm, 'coolsingel', 'Coolsingel', 0, 3, -20, 12, 'tram, bomen, boulevard');
  // trams: along x=0 from CS plaza to the bridge and over
  const col = ['#c9402f', '#e8e2d2'];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 6.4), new THREE.MeshStandardMaterial({ color: col[1], roughness: 0.5 }));
    body.position.y = 1.15; g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.55, 6.44), new THREE.MeshStandardMaterial({ color: col[0], roughness: 0.5 }));
    band.position.y = 0.85; g.add(band);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.5, 5.8), new THREE.MeshStandardMaterial({ color: '#2d3d4d', roughness: 0.2 }));
    win.position.y = 1.5; g.add(win);
    g.traverse((o) => { o.castShadow = true; });
    lm.objs.push(g);
    const zmin = -52, zmax = 66, speed = 5 + k;
    lm.updaters.push((_dt, time) => {
      const u = ((time * speed + k * 0.5 * (zmax - zmin)) % (2 * (zmax - zmin)));
      const fw = u < zmax - zmin;
      const z = fw ? zmin + u : zmax - (u - (zmax - zmin));
      const y = bridgeY(z);
      g.position.set(fw ? 1.0 : -1.0, y, z);
      g.rotation.y = fw ? 0 : Math.PI;
    });
  }
}
function bridgeY(z: number) {
  if (z < 8 || z > 48) return 0.1;
  const u = Math.min((z - 8) / 6, (48 - z) / 6, 1);
  return 0.1 + 2.5 * Math.max(0, u);
}

// ===================================================================== Stadhuis
function stadhuis(lm: LM, cx: number, cz: number) {
  const { gb } = lm;
  const stone = '#e6dcc6', brick = '#b05a45', roof = '#6b6f78', copper = '#5aa58f';
  gb.local(cx, 0, cz, Math.PI / 2, () => {
    const W = 20, D = 7.6, h = 7.4;
    gb.box(W, h, D, 0, 0, 0, brick, { ao: 0.78, aoH: 4, fac: { p: FAC.arch, sx: 1.7, sy: 1.25, lit: 0.55 } });
    gb.box(W + 0.2, 1.3, D + 0.2, 0, 0, 0, '#cfc3ab', { ao: 0.9 });
    gb.box(W + 0.5, 0.35, D + 0.5, 0, h, 0, stone, { ao: 1 });
    gb.gable(W, 2.2, D + 0.6, 0, h + 0.35, 0, roof, true);
    // end pavilions
    for (const s of [-1, 1]) {
      gb.box(4.2, h + 1.0, D + 0.8, s * (W / 2 - 1.4), 0, 0, stone, { ao: 0.8, aoH: 4, fac: { p: FAC.arch, sx: 1.7, sy: 1.25, lit: 0.55 } });
      gb.pyramid(4.8, 3.0, D + 1.3, s * (W / 2 - 1.4), h + 1.0, 0, roof);
    }
    // central pavilion with pediment
    gb.box(6.6, h + 1.4, 1.6, 0, 0, D / 2 + 0.5, stone, { ao: 0.82, aoH: 4, fac: { p: FAC.arch, sx: 1.7, sy: 1.25, lit: 0.55 } });
    for (let i = -2; i <= 2; i++) gb.cyl(0.18, 0.2, h - 1.6, i * 1.3, 1.2, D / 2 + 1.4, '#f1ead8', 7, { ao: 1 });
    gb.gable(7.0, 1.7, 2.0, 0, h + 1.4, D / 2 + 0.5, '#d7ccb4', false);
    // grand steps
    for (let i = 0; i < 4; i++) gb.box(6.6 + i * 0.5, 0.18, 0.5, 0, i * 0.18, D / 2 + 1.6 + (3 - i) * 0.5, '#d9d1c0', { ao: 1 });
    // tower
    const tz = -0.5;
    gb.box(3.4, 7.5, 3.4, 0, h + 0.4, tz, stone, { ao: 0.85, aoH: 5, fac: { p: FAC.tall, sx: 1.7, sy: 1.8, lit: 0.4 } });
    gb.box(3.7, 0.4, 3.7, 0, h + 7.9, tz, '#d7ccb4', { ao: 1 });
    // clock faces
    const clk = new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16).rotateX(Math.PI / 2);
    for (const a of [0, 1, 2, 3]) {
      const m = new THREE.Matrix4().makeRotationY(a * Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, h + 6.4, 1.74));
      m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, tz));
      gb.add(clk, '#f6f1e2', m, { ao: 1 });
    }
    // belfry
    gb.box(2.2, 2.0, 2.2, 0, h + 8.3, tz, '#cdbfa2', { ao: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.28, 2.0, 0.28, sx * 1.0, h + 8.3, tz + sz * 1.0, stone, { ao: 1 });
    gb.pyramid(2.9, 4.2, 2.9, 0, h + 10.3, tz, copper);
    gb.cyl(0.05, 0.12, 2.2, 0, h + 14.4, tz, '#d4b24a', 5, { ao: 1 });
    gb.sphere(0.28, 0, h + 14.7, tz, '#d9b84e', 1, 1, 1, 1);
  });
  lm.town.excl.push([cx - 5.5, cz - 11, cx + 5.5, cz + 11]);
  label(lm, 'stadhuis', 'Stadhuis', cx, 22, cz, 9, 'overleefde het bombardement');
}

// ===================================================================== Hofplein fountain
function fountain(lm: LM, cx: number, cz: number) {
  const { gb } = lm;
  gb.cyl(8.4, 8.6, 0.7, cx, 0, cz, '#d9d3c4', 28, { ao: 0.9 });
  gb.cyl(7.6, 7.6, 0.3, cx, 0.62, cz, '#4aa1c4', 28, { ao: 1 });
  gb.cyl(1.1, 1.5, 1.6, cx, 0.6, cz, '#d9d3c4', 12, { ao: 0.9 });
  const N = 14, M = 16;
  const geo = new THREE.SphereGeometry(0.16, 6, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#e7f6ff', roughness: 0.2, emissive: '#9fd4f0', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
  const im = new THREE.InstancedMesh(geo, mat, N * M + 24);
  im.frustumCulled = false;
  lm.objs.push(im);
  const d = new THREE.Object3D();
  lm.updaters.push((_dt, time) => {
    let i = 0;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2, R = 5.4 + (j % 2) * 0.8;
      const hh = 3.0 + (j % 2) * 0.8;
      for (let k = 0; k < M; k++) {
        const u = (k / M + time * 0.55 + j * 0.13) % 1;
        const r = 0.9 + (R - 0.9) * u;
        const y = 1.0 + 4 * hh * u * (1 - u) * 1.0;
        d.position.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
        d.scale.setScalar(0.8 + 0.4 * (1 - u)); d.updateMatrix(); im.setMatrixAt(i++, d.matrix);
      }
    }
    for (let k = 0; k < 24; k++) {
      const u = (k / 24 + time * 0.8) % 1;
      const y = 1.6 + 10.5 * 4 * u * (1 - u) * 0.9 * (0.5 + 0.5 * Math.sin(time * 1.3));
      d.position.set(cx + Math.sin(k * 3.7) * 0.25 * (1 - u * 0.2), 1.6 + 9 * u * (1.1 - u), cz + Math.cos(k * 2.3) * 0.25);
      d.scale.setScalar(1.1 - 0.5 * u); void y; d.updateMatrix(); im.setMatrixAt(i++, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  lm.town.excl.push([cx - 9, cz - 9, cx + 9, cz + 9]);
  label(lm, 'hofplein', 'Hofplein', cx, 6, cz, 9, 'de fontein draait mee');
}

// ===================================================================== Centraal Station
function station(lm: LM) {
  const { gb, mt, glass, flat } = lm;
  flat.rect(-27, -66, 27, -29, 0.03, '#d3cab6');
  flat.rect(-27, -86, 27, -57, 0.03, '#c9c1ae');
  const stone = '#e1d8c3';
  // main hall block
  gb.box(48, 8.5, 12, 0, 0, -78, stone, { ao: 0.8, aoH: 5, fac: { p: FAC.ribbon, sx: 1.6, sy: 1.2, lit: 0.5 } });
  for (const s of [-1, 1]) gb.box(9, 5.5, 10, s * 28, 0, -78, '#cfc7b4', { ao: 0.8, fac: { p: FAC.punched, sx: 1.6, sy: 1.2, lit: 0.5 } });
  // the famous wedge roof: steel, sloping up to a sharp tip pointing at the city (south, +z)
  const roofGeo = new THREE.BufferGeometry();
  const tipZ = -55, tipY = 17, bz = -80, by = 10.5, hw = 24, th = 0.9;
  const P = [
    [-hw, by, bz], [hw, by, bz], [0, tipY, tipZ],
    [-hw, by - th, bz], [hw, by - th, bz], [0, tipY - th, tipZ],
  ];
  const idx = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
  const arr: number[] = [];
  for (const i of idx) arr.push(...P[i]);
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  roofGeo.computeVertexNormals();
  mt.add(roofGeo, '#aab6c2', new THREE.Matrix4(), { ao: 1 });
  // V-struts under the roof
  for (const s of [-1, 1]) for (const k of [0.25, 0.55, 0.82]) {
    const x = s * hw * (1 - k), z = bz + (tipZ - bz) * k, y = by + (tipY - by) * k;
    mt.strut(V(x, y - th, z), V(x * 0.6, 3.2, z + 2.5), 0.2, '#cfd4d8', 5);
    mt.strut(V(x, y - th, z), V(x * 1.2 + s * 0.5, 3.0, z - 2.5), 0.2, '#cfd4d8', 5);
  }
  mt.strut(V(0, tipY - th, tipZ), V(0, 4.5, tipZ + 1.2), 0.26, '#cfd4d8', 6);
  mt.strut(V(0, tipY - th, tipZ), V(-2.6, 3.2, tipZ - 4), 0.18, '#cfd4d8', 5);
  mt.strut(V(0, tipY - th, tipZ), V(2.6, 3.2, tipZ - 4), 0.18, '#cfd4d8', 5);
  // glass facade under the tip
  const gs = new THREE.Shape();
  gs.moveTo(-9, 0); gs.lineTo(9, 0); gs.lineTo(9, 7); gs.lineTo(0, tipY - th - 3.2); gs.lineTo(-9, 7); gs.lineTo(-9, 0);
  glass.add(new THREE.ShapeGeometry(gs), '#ffffff', new THREE.Matrix4().makeTranslation(0, 0, tipZ - 1.8), { ao: 1 });
  // platform canopies and trains behind
  for (let i = 0; i < 4; i++) {
    const x = -15 + i * 10;
    mt.box(6, 0.25, 18, x, 4.4, -90.5, '#d3d8db', { ao: 1 });
    gb.box(4.4, 1.6, 15, x, 0.3, -90.5, i % 2 ? '#2f4f8c' : '#e8c23a', { ao: 0.9 });
  }
  // plaza: bus road lamps, tram stops, trees
  for (let x = -22; x <= 22; x += 5.5) for (const z of [-64, -33]) lm.town.tree(x, z, 0.75, 1);
  for (const x of [-9, 9]) { mt.box(7, 0.15, 2.2, x, 2.7, -48, '#9aa3aa', { ao: 1 }); mt.box(0.15, 2.7, 0.15, x - 3.2, 0, -48, '#9aa3aa', { ao: 1 }); mt.box(0.15, 2.7, 0.15, x + 3.2, 0, -48, '#9aa3aa', { ao: 1 }); }
  lm.town.excl.push([-26, -86, 26, -54]);
  lm.noPark.push((x, z) => x > -27 && x < 27 && z < -29 && z > -87);
  label(lm, 'cs', 'Rotterdam Centraal', 0, 20, -62, 16, 'het dak wijst naar de stad');
}

// ===================================================================== Museumpark + Depot, Het Park
function museumpark(lm: LM) {
  const { gb, flat, town } = lm;
  flat.rect(-52, -17, -26, 3, 0.04, '#9bbd72');
  flat.disc(-30, -2, 3.2, 0.05, '#6fb1c6', 22);
  flat.disc(-46, -11, 3.6, 0.05, '#6fb1c6', 22);
  flat.seg(-51, -3, -27, -12, 1.4, 0.06, '#e2d7bc');
  flat.seg(-39, 2, -39, -17, 1.2, 0.06, '#e2d7bc');
  flat.rect(-52, -9, -26, -7.8, 0.06, '#e2d7bc');
  for (let i = 0; i < 16; i++) town.tree(range(lm.rng, -50, -27), range(lm.rng, -16, 2), range(lm.rng, 0.8, 1.1), 0);
  // Depot: mirrored bowl
  const env = lm.env.bakeEnv(`void main(){ vec3 d = normalize(vD); float h = d.y*0.5+0.5;
    vec3 sky = mix(vec3(0.93,0.84,0.66), vec3(0.16,0.42,0.80), smoothstep(0.52,0.95,h));
    vec3 gnd = mix(vec3(0.20,0.27,0.16), vec3(0.62,0.5,0.36), smoothstep(0.1,0.5,h));
    vec3 c = h > 0.5 ? sky : gnd;
    c = mix(c, vec3(1.0,0.97,0.88), smoothstep(0.02,0.0,abs(h-0.5)) * 0.8);
    float sun = smoothstep(0.93,0.985, dot(d, normalize(vec3(0.5,0.6,0.4))));
    gl_FragColor = vec4(c + sun*vec3(2.4,2.0,1.4), 1.0); }`);
  const prof: THREE.Vector2[] = [];
  const R = 6.2, Hh = 8.4;
  for (let i = 0; i <= 12; i++) { const u = i / 12; prof.push(new THREE.Vector2(0.4 + (R - 0.4) * Math.pow(u, 0.8) * (0.55 + 0.45 * u), Hh * u)); }
  prof.unshift(new THREE.Vector2(0.01, 0));
  const lathe = new THREE.LatheGeometry(prof, 28);
  const bowl = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.1, envMap: env, envMapIntensity: 1.0, flatShading: true, color: '#f1f4f6' }));
  bowl.position.set(-38, 0.2, -7); bowl.castShadow = true;
  lm.objs.push(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.18, 6, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cfd6da', metalness: 0.8, roughness: 0.3, envMap: env }));
  rim.position.set(-38, 0.2 + Hh, -7); lm.objs.push(rim);
  // roof garden trees on the rim
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; town.tree(-38 + Math.cos(a) * R * 0.88, -7 + Math.sin(a) * R * 0.88, 0.6, 0, Hh); }
  town.excl.push([-45, -14, -31, 0]);
  label(lm, 'depot', 'Depot Boijmans', -38, 13, -7, 9, 'de spiegelende kom');
  label(lm, 'museumpark', 'Museumpark', -42, 4, -12, 9);
}

function euromast(lm: LM, cx: number, cz: number) {
  const { gb, mt, gl } = lm;
  const W = '#f1eee6';
  gb.cyl(2.4, 3.0, 1.2, cx, 0, cz, '#d7d3c8', 16, { ao: 0.8 });
  gb.cyl(1.5, 2.1, 24, cx, 0.8, cz, W, 12, { ao: 0.7, aoH: 10 });
  // observation deck: tapered glass ring
  gb.cyl(3.6, 1.7, 2.2, cx, 24, cz, W, 16, { ao: 1 });
  lm.glass.cyl(4.0, 4.0, 2.4, cx, 26, cz, '#ffffff', 16, { ao: 1 });
  gb.cyl(4.2, 4.2, 0.35, cx, 28.3, cz, W, 16, { ao: 1 });
  gb.cyl(3.0, 4.2, 0.9, cx, 28.6, cz, '#e2ded2', 16, { ao: 1 });
  // mast
  mt.cyl(0.55, 0.8, 22, cx, 29.5, cz, '#e9e5da', 10, { ao: 1 });
  mt.cyl(1.9, 1.9, 0.3, cx, 38, cz, '#e9e5da', 14, { ao: 1 });
  mt.cyl(0.5, 0.55, 13, cx, 51.5, cz, '#d5d9dc', 8, { ao: 1 });
  mt.cyl(0.04, 0.3, 11, cx, 64, cz, '#d8403a', 6, { ao: 1 });
  gl.sphere(0.3, cx, 75.5, cz, '#ff4a3a', 1, 1, 1, 1);
  lm.town.excl.push([cx - 4, cz - 4, cx + 4, cz + 4]);
  // park lawn and trees
  lm.flat.rect(-74, -3, -50, 8.2, 0.04, '#8fb86a');
  for (let i = 0; i < 12; i++) lm.town.tree(range(lm.rng, -73, -51), range(lm.rng, -2, 7), range(lm.rng, 0.8, 1.1), 0);
  label(lm, 'euromast', 'Euromast', cx, 52, cz, 10, 'uitzicht over de Maas');
}

// ===================================================================== De Kuip
function kuip(lm: LM, cx: number, cz: number) {
  const { gb, mt, fl, flat } = lm;
  const a = 19.5, b = 12.5;
  flat.disc(cx, cz, 25, 0.04, '#d6ccb8', 40);
  flat.disc(cx, cz, 23, 0.045, '#cfc5b0', 40);
  // pitch
  flat.poly(ell(cx, cz, 13.5, 7.4, 28), 0.5, '#58b05e');
  for (let i = -4; i <= 4; i++) {
    const x0 = cx + i * 2.4;
    if (i % 2) flat.rect(x0, cz - 6.6, x0 + 2.4, cz + 6.6, 0.52, '#66bd6b');
  }
  const ring = (rA: number, rB: number, y0: number, y1: number, col: string, shade = 1) => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], N = 56;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      const p = (t: number, y: number, k: number): number[] => [Math.cos(t) * (k ? rB * a : rA * a) , y, Math.sin(t) * (k ? rB * b : rA * b)];
      const A = p(t0, y0, 0), B = p(t1, y0, 0), C = p(t0, y1, 1), D = p(t1, y1, 1);
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    gb.add(g, col, new THREE.Matrix4().makeTranslation(cx, 0, cz), { ao: shade });
  };
  // outer wall, bowl tiers, roof ring
  const wall = new THREE.BufferGeometry();
  { const pos: number[] = [], N = 56; for (let i = 0; i < N; i++) { const t0 = (i / N) * 6.2832, t1 = ((i + 1) / N) * 6.2832; const e = (t: number, y: number) => [Math.cos(t) * a, y, Math.sin(t) * b]; const A = e(t0, 0), B = e(t1, 0), C = e(t0, 13), D = e(t1, 13); pos.push(...A, ...C, ...B, ...B, ...C, ...D); } wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wall.computeVertexNormals(); }
  gb.add(wall, '#a9afb6', new THREE.Matrix4().makeTranslation(cx, 0, cz), { ao: 0.62, aoH: 9 });
  // seat tiers (rising inwards)
  for (let k = 0; k < 4; k++) {
    const t0 = 0.74 - k * 0.1, t1 = 0.64 - k * 0.1;
    ringTier(gb, cx, cz, a, b, t0, t1, 4.4 + k * 2.1, 6.4 + k * 2.1, k % 2 ? '#6f7e8d' : '#8d9aa8');
  }
  void ring;
  // roof ring (cantilever), slightly sloped
  ringTier(gb, cx, cz, a, b, 1.04, 0.68, 13.6, 13.6, '#eef0f2', 0.5);
  ringTier(gb, cx, cz, a, b, 1.04, 0.68, 13.0, 13.0, '#9aa1a8', 0.5);
  // exterior stair towers (spiral ramps) as slim cylinders
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2 + 0.26;
    const x = cx + Math.cos(t) * (a + 1.2), z = cz + Math.sin(t) * (b + 1.2);
    gb.cyl(0.85, 0.95, 14.6, x, 0, z, '#d8dadc', 10, { ao: 0.8 });
    for (let s = 0; s < 8; s++) gb.box(1.3, 0.14, 1.3, x, 1.2 + s * 1.7, z, '#aeb2b6', { ao: 1 }, s);
  }
  // floodlight masts
  const lamps: THREE.Vector3[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (a - 3), z = cz + sz * (b - 1);
    mt.cyl(0.3, 0.55, 26, x, 0, z, '#bfc5c9', 8, { ao: 1 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) fl.box(0.8, 0.6, 0.3, x - 1.4 + c * 0.95, 26 + r * 0.7, z, '#fff6d8', { ao: 1 }, 0);
    mt.box(3.9, 0.2, 0.5, x, 25.7, z - 0.1, '#7d848a', { ao: 1 });
    lamps.push(V(x, 27, z));
  }
  // light beams, brightness controlled by flood level
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = new THREE.Group();
  for (const l of lamps) {
    const tgt = V(cx, 0.5, cz);
    const dir = tgt.clone().sub(l), len = dir.length();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, len, 14, 1, true), beamMat);
    cone.position.copy(l).add(tgt).multiplyScalar(0.5);
    cone.quaternion.setFromUnitVectors(V(0, -1, 0), dir.normalize());
    beams.add(cone);
  }
  beams.visible = true;
  lm.objs.push(beams);
  lm.named.kuipBeams = beams;
  lm.named.kuipBeamMat = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
  lm.town.excl.push([cx - 26, cz - 18, cx + 26, cz + 18]);
  lm.noPark.push((x, z) => ((x - cx) / 26) ** 2 + ((z - cz) / 18) ** 2 < 1);
  label(lm, 'kuip', 'De Kuip', cx, 14, cz, 14, 'de legendarische kom');
}
function ell(cx: number, cz: number, a: number, b: number, n: number): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; o.push([cx + Math.cos(t) * a, cz + Math.sin(t) * b]); }
  return o;
}
function ringTier(gb: LM['gb'], cx: number, cz: number, a: number, b: number, rOut: number, rIn: number, yOut: number, yIn: number, col: string, ao = 0.9) {
  const pos: number[] = [], N = 56;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const p = (t: number, r: number, y: number) => [Math.cos(t) * a * r, y, Math.sin(t) * b * r];
    const A = p(t0, rOut, yOut), B = p(t1, rOut, yOut), C = p(t0, rIn, yIn), D = p(t1, rIn, yIn);
    pos.push(...A, ...B, ...C, ...B, ...D, ...C, ...A, ...C, ...B, ...B, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  gb.add(g, col, new THREE.Matrix4().makeTranslation(cx, 0, cz), { ao });
}

// ===================================================================== Kleinpolderplein + Stadsbeheer office
function kleinpolder(lm: LM) {
  const { gb, mt, flat, town } = lm;
  const C: [number, number] = [-88, -70];
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { flat.disc(C[0] + dx, C[1] + dz, 6.4, 0.045, '#9bc06f', 18); for (let i = 0; i < 4; i++) town.tree(C[0] + dx + range(lm.rng, -3.5, 3.5), C[1] + dz + range(lm.rng, -3.5, 3.5), 0.8, 0); }
  // Stadsbeheer office
  const ox = -90, oz = -49;
  gb.local(ox, 0, oz, 0, () => {
    gb.box(22, 5.2, 8, 0, 0, 0, '#e8e4da', { ao: 0.8, aoH: 4, fac: { p: FAC.ribbon, sx: 1.7, sy: 1.3, lit: 0.6 } });
    gb.box(22.4, 0.5, 8.4, 0, 5.2, 0, '#4f9a4a', { ao: 1 });
    gb.box(21, 0.3, 7, 0, 5.7, 0, '#7bb86a', { ao: 1 });
    for (let i = 0; i < 6; i++) gb.box(2.4, 0.12, 1.6, -8.5 + i * 3.4, 6.1, 1.4, '#2b3a55', { ao: 1 }, 0);
    gb.box(3.2, 3.4, 1.4, 0, 0, 4.4, '#f1ede2', { ao: 0.9 });
    gb.box(8, 1.5, 0.3, 0, 6.1, 0, '#3f8a3a', { ao: 1 });
    // flag
    mt.cyl(0.06, 0.08, 6, 10.5, 0, 3, '#c9cdd0', 5, { ao: 1 });
    gb.box(1.6, 0.9, 0.05, 11.3, 5.2, 3, '#3a9a3f', { ao: 1 });
  });
  const sign = signMesh('STADSBEHEER', 9, 1.6, '#2f8f3e', '#ffffff');
  sign.position.set(ox, 7.4, oz + 4.4);
  lm.objs.push(sign);
  const sign2 = signMesh('STADSBEHEER', 9, 1.6, '#2f8f3e', '#ffffff'); sign2.position.set(ox, 7.4, oz + 4.3); sign2.rotation.y = Math.PI; sign2.position.z = oz - 4.4;
  lm.objs.push(sign2);
  // staff car park
  flat.rect(ox - 11, oz + 5, ox + 11, oz + 11, 0.04, '#515761');
  for (let i = 0; i < 9; i++) flat.rect(ox - 10 + i * 2.5, oz + 5.5, ox - 10 + i * 2.5 + 0.1, oz + 9, 0.05, '#e8e4da');
  town.excl.push([ox - 12, oz - 5, ox + 12, oz + 11.5]);
  lm.noPark.push((x, z) => x > ox - 12 && x < ox + 12 && z > oz - 5 && z < oz + 12);
  label(lm, 'kleinpolder', 'Kleinpolderplein — hier werken wij', ox, 8, oz, 14, 'Steden schuilen niet wanneer het regent.');
}

// ===================================================================== Diergaarde (zoo)
function diergaarde(lm: LM) {
  const { gb, flat, town } = lm;
  flat.rect(27, -85, 49, -65, 0.04, '#a5c77a');
  flat.seg(38, -65, 38, -78, 1.6, 0.06, '#e2d7bc');
  flat.seg(30, -72, 46, -72, 1.4, 0.06, '#e2d7bc');
  // gate
  gb.box(0.5, 3.4, 0.5, 36.2, 0, -65.4, '#8b5a3c', { ao: 1 });
  gb.box(0.5, 3.4, 0.5, 39.8, 0, -65.4, '#8b5a3c', { ao: 1 });
  gb.box(4.4, 0.7, 0.6, 38, 3.2, -65.4, '#3f8a3a', { ao: 1 });
  // fence
  for (let x = 27.5; x <= 48.5; x += 1.4) if (Math.abs(x - 38) > 2.2) gb.box(0.12, 1.2, 0.12, x, 0, -65.2, '#6b4a33', { ao: 1 });
  // rock-ring enclosure
  const rock = '#8c8a82';
  for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; gb.sphere(1.0 + (i % 3) * 0.2, 43 + Math.cos(t) * 4.6, 0.5, -77 + Math.sin(t) * 4.6, rock, 1, 0.9, 1, 0); }
  flat.disc(43, -77, 4.1, 0.05, '#7ea35c', 18);
  for (let i = 0; i < 4; i++) { const t = i * 1.7; gb.sphere(0.7, 43 + Math.cos(t) * 1.8, 0.4, -77 + Math.sin(t) * 1.8, '#a09c92', 1, 0.8, 1, 0); }
  // giraffes
  for (const [gx, gz, r] of [[31, -79, 0.5], [34, -81, -0.6]]) {
    gb.local(gx, 0, gz, r, () => {
      const c = '#e2b04e';
      gb.box(1.6, 0.9, 0.7, 0, 1.5, 0, c, { ao: 1 });
      for (const sx of [-0.6, 0.6]) for (const sz of [-0.2, 0.2]) gb.box(0.18, 1.6, 0.18, sx, 0, sz, c, { ao: 1 });
      gb.beam(V(0.7, 2.2, 0), V(1.0, 3.9, 0), 0.3, 0.3, c, { ao: 1 });
      gb.box(0.55, 0.3, 0.3, 1.2, 3.8, 0, c, { ao: 1 });
    });
  }
  for (let i = 0; i < 14; i++) town.tree(range(lm.rng, 28, 48), range(lm.rng, -84, -66), range(lm.rng, 0.8, 1.2), i % 3 === 0 ? 1 : 0);
  town.excl.push([27, -86, 49, -64]);
  lm.noPark.push((x, z) => x > 26 && x < 50 && z < -64 && z > -87);
  label(lm, 'diergaarde', 'Diergaarde Blijdorp', 38, 6, -75, 10, 'apen, giraffen, en soms een ontsnapping');
}
