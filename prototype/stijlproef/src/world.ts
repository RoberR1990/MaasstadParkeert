// Builds the diorama: base tile, roads, buildings, windows, trees, lamps, water, bridge and boats.
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CityData, Lot, generateCity } from './city';
import { COL } from './palette';
import * as PAL from './palette';
import { radialTexture, noiseTexture, wakeTexture } from './tex';
import { Environment } from './env';
import { BLOCK, BRIDGE_X, NB, P, PAD_H, RIVER_X, RIVER_Z0, RIVER_Z1, ROAD_Y, STREET, TILE_X, TILE_Z0, TILE_Z1, WATER_Y, blockCenter, lineCoord } from './config';
import { mulberry32, pick, range, damp } from './util';

export interface Bay { x: number; z: number; yaw: number; side: number; horizontal: boolean }

const INTRO_FN = `
float introEase(float p){ float c = 1.9; return p <= 0.0 ? 0.0 : 1.0 + (c + 1.0) * pow(p - 1.0, 3.0) + c * pow(p - 1.0, 2.0); }
`;

/** Adds the "city grows from the middle" intro to a standard/depth material. */
function patchIntro(mat: THREE.Material, uni: { uIntro: { value: number }; uTime?: { value: number } }, mode: 'world' | 'inst' | 'late', sway = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uIntro = uni.uIntro;
    if (sway && uni.uTime) shader.uniforms.uTime = uni.uTime;
    shader.vertexShader = 'uniform float uIntro;\n' + (sway ? 'uniform float uTime;\n' : '') + INTRO_FN + shader.vertexShader;
    const pos = mode === 'world' ? 'position.xz' : '(instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xz';
    const delay = mode === 'late' ? '0.42' : '0.0';
    const apply =
      mode === 'world'
        ? 'transformed.y = 0.16 + (transformed.y - 0.16) * s;'
        : 'transformed *= s;' + (sway ? ' transformed.x += sin(uTime * 1.3 + (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).x * 0.7) * 0.025 * transformed.y;' : '');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       { float id = length(${pos} - vec2(0.0, 12.0)) / 60.0;
         float p = clamp((uIntro * 1.7 - id - ${delay}) * 2.4, 0.0, 1.0);
         float s = introEase(p);
         ${apply} }`,
    );
  };
  mat.customProgramCacheKey = () => `intro-${mode}-${sway}`;
}

function outline(x0: number, x1: number, z0: number, z1: number, r: number, seg = 8): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cz + r * Math.sin(a)));
    }
  };
  arc(x1 - r, z0 + r, -Math.PI / 2, 0);
  arc(x1 - r, z1 - r, 0, Math.PI / 2);
  arc(x0 + r, z1 - r, Math.PI / 2, Math.PI);
  arc(x0 + r, z0 + r, Math.PI, Math.PI * 1.5);
  return pts;
}

export class World {
  group = new THREE.Group();
  city: CityData;
  lots: Lot[];
  bays: Bay[] = [];
  mats: Record<string, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.ShaderMaterial> = {};
  lampHeadMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  poolMat: THREE.MeshBasicMaterial;
  waterMat: THREE.ShaderMaterial;
  wetList: { mat: THREE.MeshStandardMaterial; r0: number; r1: number; c0: THREE.Color; c1: THREE.Color }[] = [];
  boats: { g: THREE.Group; speed: number; z: number; x0: number; x1: number; bob: number; phase: number }[] = [];
  pylonTop = new THREE.Vector3();
  structures = new THREE.Group();
  windowMat!: THREE.MeshStandardMaterial;
  mainMat: THREE.MeshStandardMaterial;
  clouds: { g: THREE.Group; speed: number }[] = [];
  private env: Environment;
  private t = 0;

  constructor(env: Environment) {
    this.env = env;
    const rng = mulberry32(20261025);
    this.city = generateCity(rng);
    this.lots = this.city.lots;
    const U = env.uniforms;
    const sharedNoise = noiseTexture(5, 0.1);

    const mk = (color: THREE.ColorRepresentation, rough: number, wetRough: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}, wetDark = 0.82) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
      this.wetList.push({ mat: m, r0: rough, r1: wetRough, c0: new THREE.Color(color), c1: new THREE.Color(color).multiplyScalar(wetDark) });
      return m;
    };

    // ---- materials ----
    const main = mk('#ffffff', 0.86, 0.5, { vertexColors: true }, 0.86);
    this.mainMat = main;
    const pads = mk('#ffffff', 0.92, 0.45, { vertexColors: true }, 0.85);
    const lawn = mk('#ffffff', 1.0, 0.8, { vertexColors: true }, 0.9);
    const ground = mk(COL.grassTop, 1.0, 0.8, { map: sharedNoise }, 0.88);
    const road = mk(COL.road, 0.95, 0.28, { map: sharedNoise, envMapIntensity: 1.2 }, 0.72);
    const marking = mk(COL.marking, 0.8, 0.35, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 0.9);
    const side = mk('#ffffff', 1.0, 1.0, { vertexColors: true, side: THREE.DoubleSide, flatShading: true }, 1);
    const quay = mk('#ffffff', 0.9, 0.5, { vertexColors: true, side: THREE.DoubleSide }, 0.85);
    const trunk = mk(COL.trunk, 1, 0.9);
    const crown = mk('#ffffff', 0.92, 0.6, { vertexColors: true, flatShading: true }, 0.9);
    patchIntro(main, U, 'world');
    patchIntro(crown, U, 'inst', true);
    patchIntro(trunk, U, 'inst', true);
    this.mats = { main, pads, lawn, ground, road, marking, side, quay, trunk, crown };

    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: '#cfc7b8' });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#cfc7b8' });
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,205,130,0.85)', 'rgba(255,190,110,0)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

    this.buildBase(side, ground, quay);
    this.buildRoads(road, marking);
    this.buildCity(main, pads, lawn, crown, trunk);
    this.buildWindows();
    this.buildBridgeAndPromenade(main);
    this.waterMat = this.buildWater();
    this.buildBoats(main);
    this.group.add(this.structures);
  }

  // ------------------------------------------------------------------ base tile
  private buildBase(side: THREE.Material, ground: THREE.Material, quay: THREE.Material) {
    const rng = mulberry32(99);
    const x0 = -TILE_X, x1 = TILE_X, z0 = TILE_Z0, z1 = TILE_Z1;
    const R = 6;
    // top face with the river channel cut out
    const top = new THREE.Shape(outline(x0, x1, z0, z1, R, 10).map((p) => new THREE.Vector2(p.x, -p.y)));
    const hole = new THREE.Path(outline(-RIVER_X, RIVER_X, RIVER_Z0, RIVER_Z1, 1.4, 5).map((p) => new THREE.Vector2(p.x, -p.y)).reverse());
    top.holes.push(hole);
    const tg = new THREE.ShapeGeometry(top, 4);
    tg.rotateX(-Math.PI / 2);
    // world-space uv for texture
    const tp = tg.getAttribute('position');
    const uv = new Float32Array(tp.count * 2);
    for (let i = 0; i < tp.count; i++) { uv[i * 2] = tp.getX(i) * 0.09; uv[i * 2 + 1] = tp.getZ(i) * 0.09; }
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const topMesh = new THREE.Mesh(tg, ground);
    topMesh.receiveShadow = true;
    this.group.add(topMesh);

    // layered side loft: grass lip, soil, rock
    const layers = [
      { y: 0, inset: 0, col: '#a8c070', j: 0 },
      { y: -0.38, inset: 0, col: '#8aa65e', j: 0 },
      { y: -0.42, inset: 0.18, col: '#9b6f4d', j: 0.04 },
      { y: -1.8, inset: 0.5, col: '#80583f', j: 0.25 },
      { y: -2.4, inset: 0.85, col: '#6b4a3a', j: 0.3 },
      { y: -2.46, inset: 1.6, col: '#6c666c', j: 0.3 },
      { y: -5.6, inset: 3.6, col: '#554f58', j: 0.9 },
      { y: -9.5, inset: 8.0, col: '#413d46', j: 0.7 },
    ];
    const segs = 10;
    const base = outline(x0, x1, z0, z1, R, 10);
    const n = base.length;
    const rings: THREE.Vector3[][] = layers.map((L, li) => {
      const pts = outline(x0 + L.inset, x1 - L.inset, z0 + L.inset, z1 - L.inset, Math.max(1.2, R - L.inset * 0.6), 10);
      return pts.map((p, i) => {
        const jit = (rng() - 0.5) * 2 * L.j * (li > 2 ? 1 : 0.2);
        const c = new THREE.Vector2(0, (z0 + z1) / 2);
        const dir = p.clone().sub(c).normalize();
        return new THREE.Vector3(p.x + dir.x * jit, L.y + (li > 4 ? (rng() - 0.5) * 0.5 : 0), p.y + dir.y * jit * 0.6);
      });
    });
    const pos: number[] = [];
    const col: number[] = [];
    const cc = new THREE.Color();
    const push = (v: THREE.Vector3, c: string, shade = 1) => {
      pos.push(v.x, v.y, v.z);
      cc.set(c).multiplyScalar(shade);
      col.push(cc.r, cc.g, cc.b);
    };
    for (let li = 0; li < layers.length - 1; li++) {
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        const a = rings[li][i], b = rings[li][i2], c2 = rings[li + 1][i], d = rings[li + 1][i2];
        const sh = 0.92 + rng() * 0.16; // faceted strata variation
        push(a, layers[li].col, sh); push(c2, layers[li + 1].col, sh); push(b, layers[li].col, sh);
        push(b, layers[li].col, sh); push(c2, layers[li + 1].col, sh); push(d, layers[li + 1].col, sh);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sg.computeVertexNormals();
    const sideMesh = new THREE.Mesh(sg, side);
    sideMesh.castShadow = true; sideMesh.receiveShadow = true;
    this.group.add(sideMesh);

    // channel walls + bed
    const cw = outline(-RIVER_X, RIVER_X, RIVER_Z0, RIVER_Z1, 1.4, 5);
    const ys = [0, WATER_Y + 0.12, WATER_Y - 0.12, WATER_Y - 1.2];
    const wcols = ['#e3d8c2', '#cdbfa6', '#7d8a86', '#5c6d6d'];
    const wp: number[] = [], wc: number[] = [];
    for (let k = 0; k < ys.length - 1; k++) {
      for (let i = 0; i < cw.length; i++) {
        const j = (i + 1) % cw.length;
        const A = cw[i], B = cw[j];
        const v = (p: THREE.Vector2, y: number, c: string) => { wp.push(p.x, y, p.y); cc.set(c); wc.push(cc.r, cc.g, cc.b); };
        v(A, ys[k], wcols[k]); v(A, ys[k + 1], wcols[k + 1]); v(B, ys[k], wcols[k]);
        v(B, ys[k], wcols[k]); v(A, ys[k + 1], wcols[k + 1]); v(B, ys[k + 1], wcols[k + 1]);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    wg.computeVertexNormals();
    const walls = new THREE.Mesh(wg, quay);
    walls.receiveShadow = true;
    this.group.add(walls);
    // river bed
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_X * 2, RIVER_Z1 - RIVER_Z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4c6468', roughness: 1 }));
    bed.position.set(0, WATER_Y - 1.2, (RIVER_Z0 + RIVER_Z1) / 2);
    this.group.add(bed);
  }

  // ------------------------------------------------------------------ roads & markings
  private buildRoads(road: THREE.Material, marking: THREE.Material) {
    const parts: THREE.BufferGeometry[] = [];
    const flat = (w: number, d: number, x: number, z: number, y: number, uvScale = 0.11) => {
      const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      g.translate(x, y, z);
      const p = g.getAttribute('position');
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * uvScale; uv[i * 2 + 1] = p.getZ(i) * uvScale; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return g;
    };
    const ext = (NB / 2) * P + STREET / 2 - 0.0;
    for (let k = 0; k < 9; k++) parts.push(flat(ext * 2 - 0.0, STREET, 0, lineCoord(k), ROAD_Y));
    for (let k = 0; k < 9; k++) for (let j = 0; j < NB; j++) parts.push(flat(STREET, BLOCK, lineCoord(k), blockCenter(j), ROAD_Y));
    // approach road over the promenade and far bank (bridge itself is built separately)
    parts.push(flat(STREET, RIVER_Z0 - (lineCoord(8) + STREET / 2) + 0.2, BRIDGE_X, (lineCoord(8) + STREET / 2 + RIVER_Z0) / 2 - 0.1, ROAD_Y));
    parts.push(flat(STREET, TILE_Z1 - RIVER_Z1 - 1.5, BRIDGE_X, (RIVER_Z1 + TILE_Z1 - 1.5) / 2, ROAD_Y));
    const roadMesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()))!, road);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // markings
    const mk = new GeoBuilder();
    const W = COL.marking;
    const my = ROAD_Y + 0.012;
    const dash = (x: number, z: number, along: 'x' | 'z', len: number, wd: number, c = W) => {
      if (along === 'x') mk.box(len, 0.004, wd, x, my, z, c, { ao: 1 });
      else mk.box(wd, 0.004, len, x, my, z, c, { ao: 1 });
    };
    const bayLen = 1.4;
    for (let k = 0; k < 9; k++) {
      for (let s = 0; s < NB; s++) {
        for (const horizontal of [true, false]) {
          const line = lineCoord(k);
          const c = blockCenter(s);
          const along = horizontal ? 'x' : 'z';
          const px = (a: number, o: number) => (horizontal ? [a, line + o] : [line + o, a]);
          // centre dashes
          for (let d = 0; d < 3; d++) {
            const a = c - BLOCK / 2 + 0.95 + d * 1.85;
            const [x, z] = px(a, 0);
            dash(x, z, along, 0.9, 0.07);
          }
          // crosswalk bars at both ends
          for (const e of [-1, 1]) {
            const a = c + e * (BLOCK / 2 - 0.34);
            for (let b = 0; b < 7; b++) {
              const o = (b - 3) * 0.44;
              const [x, z] = px(a, o);
              if (horizontal) mk.box(0.38, 0.004, 0.24, x, my, z, W, { ao: 1 });
              else mk.box(0.24, 0.004, 0.38, x, my, z, W, { ao: 1 });
            }
          }
          // bays on both sides (skip the outer side of the boundary lines)
          for (const side of [-1, 1]) {
            if ((k === 0 && side === -1) || (k === 8 && side === 1)) continue;
            const off = side * 0.92;
            const [ex, ez] = px(c, off);
            dash(ex, ez, along, 4.3, 0.035, '#ddd3bf');
            for (let b = 0; b <= 3; b++) {
              const a = c - 2.1 + b * bayLen;
              const [x, z] = px(a, side * 1.31);
              if (horizontal) mk.box(0.035, 0.004, 0.78, x, my, z, '#ddd3bf', { ao: 1 });
              else mk.box(0.78, 0.004, 0.035, x, my, z, '#ddd3bf', { ao: 1 });
            }
            for (let b = 0; b < 3; b++) {
              const a = c - 2.1 + (b + 0.5) * bayLen;
              const [x, z] = px(a, side * 1.31);
              this.bays.push({ x, z, yaw: horizontal ? 0 : -Math.PI / 2, side, horizontal });
            }
          }
        }
      }
    }
    const mmat = (marking as THREE.MeshStandardMaterial).clone();
    mmat.vertexColors = true;
    mmat.color.set('#ffffff');
    const mm = new THREE.Mesh(mk.build()!, mmat);
    mm.receiveShadow = true;
    this.wetList.push({ mat: mmat, r0: 0.8, r1: 0.3, c0: new THREE.Color('#fff'), c1: new THREE.Color('#d8dde0') });
    this.group.add(mm);
  }

  // ------------------------------------------------------------------ buildings, trees, lamps
  private buildCity(main: THREE.Material, pads: THREE.Material, lawn: THREE.Material, crown: THREE.Material, trunk: THREE.Material) {
    const c = this.city;
    const m = new THREE.Mesh(c.geoMain, main);
    m.castShadow = true; m.receiveShadow = true;
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchIntro(dm, this.env.uniforms, 'world');
    m.customDepthMaterial = dm;
    this.group.add(m);
    const pm = new THREE.Mesh(c.geoPads, pads); pm.receiveShadow = true; pm.castShadow = true;
    this.group.add(pm);
    const lm = new THREE.Mesh(c.geoLawn, lawn); lm.receiveShadow = true;
    this.group.add(lm);

    // free-lot markers
    for (const lot of c.lots) if (lot.marker) {
      lot.marker.material = this.mats.pads.clone();
      (lot.marker.material as THREE.MeshStandardMaterial).vertexColors = true;
      lot.marker.receiveShadow = true;
      this.group.add(lot.marker);
    }

    // trees (instanced crown + trunk)
    const rng = mulberry32(5);
    const cg = new GeoBuilder();
    cg.sphere(0.52, 0, 0.82, 0, '#ffffff', 1, 0.92, 1, 1, { ao: 0.72, aoH: 0.9 });
    cg.sphere(0.34, 0.3, 0.62, 0.1, '#f0f0f0', 1, 0.9, 1, 1, { ao: 0.7, aoH: 0.7 });
    cg.sphere(0.3, -0.27, 0.58, -0.16, '#eaeaea', 1, 0.9, 1, 1, { ao: 0.7, aoH: 0.7 });
    cg.sphere(0.27, 0.05, 1.12, -0.05, '#ffffff', 1, 0.9, 1, 1, { ao: 0.85, aoH: 0.5 });
    const crownGeo = cg.build()!;
    const tg = new GeoBuilder();
    tg.cyl(0.04, 0.07, 0.5, 0, 0, 0, '#ffffff', 6, { ao: 1 });
    const trunkGeo = tg.build()!;
    const N = c.trees.length;
    const crowns = new THREE.InstancedMesh(crownGeo, crown, N);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunk, N);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    c.trees.forEach((t, i) => {
      q.setFromEuler(e.set(0, rng() * 6.28, 0));
      mtx.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * range(rng, 0.9, 1.15), t.s));
      crowns.setMatrixAt(i, mtx);
      trunks.setMatrixAt(i, mtx);
      crowns.setColorAt(i, new THREE.Color(t.autumn ? pick(rng, PAL.TREE_AUTUMN) : pick(rng, PAL.TREE_GREENS)));
    });
    crowns.castShadow = true; crowns.receiveShadow = true;
    trunks.castShadow = true;
    for (const mesh of [crowns, trunks]) {
      const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      patchIntro(d, this.env.uniforms, 'inst');
      mesh.customDepthMaterial = d;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    // lamps
    const lamps = [...c.lamps];
    for (let x = -36; x <= 36; x += 9) lamps.push({ x: x + 4.5, z: RIVER_Z0 - 1.3 });
    for (let z = 45; z <= 54; z += 3) { lamps.push({ x: BRIDGE_X - 1.9, z }); lamps.push({ x: BRIDGE_X + 1.9, z: z + 1.5 }); }
    const poleG = new GeoBuilder();
    poleG.cyl(0.025, 0.04, 1.15, 0, 0, 0, COL.lampPole, 6, { ao: 1 });
    poleG.box(0.2, 0.025, 0.025, 0.08, 1.15, 0, COL.lampPole, { ao: 1 });
    const poles = new THREE.InstancedMesh(poleG.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), lamps.length);
    const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), this.lampHeadMat, lamps.length);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), this.poolMat, lamps.length);
    lamps.forEach((l, i) => {
      const y = l.z > 39 ? 0.06 : PAD_H;
      mtx.makeTranslation(l.x, y, l.z); poles.setMatrixAt(i, mtx);
      mtx.makeTranslation(l.x + 0.15, y + 1.14, l.z); head.setMatrixAt(i, mtx);
      mtx.makeTranslation(l.x + 0.15, y + 0.025, l.z); pool.setMatrixAt(i, mtx);
    });
    poles.castShadow = true; poles.frustumCulled = false; head.frustumCulled = false; pool.frustumCulled = false;
    pool.renderOrder = 5;
    this.group.add(poles, head, pool);
  }

  // ------------------------------------------------------------------ windows (instanced, night glow via shader)
  private buildWindows() {
    const wins = this.city.wins;
    const geo = new THREE.BoxGeometry(0.36, 0.4, 0.05);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.15, envMapIntensity: 1.4 });
    this.wetList.push({ mat, r0: 0.22, r1: 0.1, c0: new THREE.Color('#fff'), c1: new THREE.Color('#e6eaf0') });
    const lit = new Float32Array(wins.length);
    const uni = this.env.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = uni.uNight;
      shader.uniforms.uIntro = uni.uIntro;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aLit; varying float vLit; uniform float uIntro;\n${INTRO_FN}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLit = aLit;
          { float id = length((instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xz - vec2(0.0, 12.0)) / 60.0;
            float p = clamp((uIntro * 1.7 - id - 0.45) * 3.0, 0.0, 1.0);
            transformed *= introEase(p); }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLit; uniform float uNight;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.70, 0.36) * vLit * uNight * 1.9;`);
    };
    mat.customProgramCacheKey = () => 'windows-lit';
    const im = new THREE.InstancedMesh(geo, mat, wins.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    wins.forEach((w, i) => {
      q.setFromEuler(e.set(0, w.rotY, 0));
      m4.compose(new THREE.Vector3(w.x, w.y, w.z), q, new THREE.Vector3(w.sx, w.sy, 1));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, w.color);
      lit[i] = w.lit;
    });
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
    im.frustumCulled = false;
    this.windowMat = mat;
    this.group.add(im);
  }

  // ------------------------------------------------------------------ bridge + promenade
  private buildBridgeAndPromenade(main: THREE.Material) {
    const g = new GeoBuilder();
    const W = '#f4efe4';
    const x = BRIDGE_X;
    const zA = RIVER_Z0 - 0.6, zB = RIVER_Z1 + 0.6;
    // deck
    g.box(4.0, 0.4, zB - zA, x, -0.34, (zA + zB) / 2, W, { ao: 0.85 });
    g.box(3.0, 0.03, zB - zA, x, 0.05, (zA + zB) / 2, '#4d525b', { ao: 1 });
    for (let z = zA + 0.8; z < zB; z += 1.6) g.box(0.07, 0.01, 0.8, x, 0.085, z, COL.marking, { ao: 1 });
    // kerbs + rails
    for (const s of [-1, 1]) {
      g.box(0.5, 0.1, zB - zA, x + s * 1.75, 0.0, (zA + zB) / 2, '#e7e1d3', { ao: 1 });
      g.box(0.04, 0.3, zB - zA, x + s * 1.97, 0.1, (zA + zB) / 2, W, { ao: 1 });
    }
    // pylon (single, tilted back away from the span)
    const baseZ = RIVER_Z1 + 1.4, baseX = x + 2.7;
    const H = 33, lean = THREE.MathUtils.degToRad(15);
    const tipZ = baseZ + Math.sin(lean) * H, tipY = Math.cos(lean) * H;
    const pylon = new THREE.CylinderGeometry(0.16, 0.42, H / Math.cos(0) , 4, 1).rotateY(Math.PI / 4);
    const pm = new THREE.Matrix4().compose(
      new THREE.Vector3(baseX, tipY / 2 - 0.3, baseZ + (tipZ - baseZ) / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean),
      new THREE.Vector3(1, 1, 1),
    );
    g.add(pylon, W, pm, { ao: 0.7, aoH: 6 });
    g.box(0.9, 1.6, 1.2, baseX, -1.0, baseZ, '#e7e1d3', { ao: 0.8 }); // foot
    this.pylonTop.set(baseX, tipY, tipZ);
    const along = (s: number) => new THREE.Vector3(baseX, tipY * s - 0.3, baseZ + (tipZ - baseZ) * s);
    const cable = '#f7f3ea';
    for (let n = 0; n < 9; n++) {
      const s = 0.52 + n * 0.055;
      g.strut(along(s), new THREE.Vector3(x + 1.75, 0.1, RIVER_Z1 - 0.8 - n * 1.55), 0.035, cable);
    }
    for (let n = 0; n < 5; n++) {
      const s = 0.58 + n * 0.08;
      g.strut(along(s), new THREE.Vector3(x + 1.75, 0.1, RIVER_Z1 + 2.2 + n * 1.5), 0.035, cable);
    }
    g.box(0.5, 0.05, 0.5, baseX, tipY + 0.4, tipZ + 0.1, '#e9e3d5', { ao: 1 });
    // aviation beacon
    const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), this.lampHeadMat);
    beacon.position.set(baseX, tipY + 0.7, tipZ + 0.1);
    this.group.add(beacon);

    // promenade paving along the quay (north bank) and far bank edge
    const pz = (lineCoord(8) + STREET / 2 + RIVER_Z0) / 2;
    g.box(TILE_X * 2 - 6, 0.05, RIVER_Z0 - (lineCoord(8) + STREET / 2) - 0.1, 0, 0, pz, '#d8ccb5', { ao: 1 });
    g.box(RIVER_X * 2 + 1.5, 0.12, 0.45, 0, 0, RIVER_Z0 - 0.15, '#ebe2cf', { ao: 1 });
    g.box(RIVER_X * 2 + 1.5, 0.12, 0.45, 0, 0, RIVER_Z1 + 0.15, '#ebe2cf', { ao: 1 });
    g.box(0.45, 0.12, RIVER_Z1 - RIVER_Z0, -RIVER_X - 0.15, 0, (RIVER_Z0 + RIVER_Z1) / 2, '#ebe2cf', { ao: 1 });
    g.box(0.45, 0.12, RIVER_Z1 - RIVER_Z0, RIVER_X + 0.15, 0, (RIVER_Z0 + RIVER_Z1) / 2, '#ebe2cf', { ao: 1 });
    // bollards + benches
    const rng = mulberry32(31);
    for (let bx = -35; bx < 36; bx += 4.5) {
      if (Math.abs(bx - BRIDGE_X) < 3) continue;
      g.cyl(0.07, 0.09, 0.28, bx, 0.05, RIVER_Z0 + 0.35, '#3f4651', 6, { ao: 1 });
      if (rng() < 0.4) {
        g.box(0.8, 0.07, 0.25, bx + 2.2, 0.28, RIVER_Z0 - 1.3, '#8d6a4a', { ao: 1 });
        g.box(0.8, 0.04, 0.04, bx + 2.2, 0.05, RIVER_Z0 - 1.3, '#4a4f58', { ao: 1 });
      }
    }
    const mesh = new THREE.Mesh(g.build()!, main);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);

    // extra trees: promenade + far bank + tile rim
    // (added as a small second tree instanced mesh through city.trees is too late; use simple merged trees)
    const tb = new GeoBuilder();
    const addTree = (tx: number, tz: number, s: number, c: string, y = 0.0) => {
      tb.cyl(0.04 * s, 0.07 * s, 0.5 * s, tx, y, tz, COL.trunk, 6, { ao: 1 });
      tb.sphere(0.52 * s, tx, y + 0.82 * s, tz, c, 1, 0.92, 1, 1, { ao: 0.72, aoH: 0.9 });
      tb.sphere(0.34 * s, tx + 0.3 * s, y + 0.62 * s, tz + 0.1 * s, c, 1, 0.9, 1, 1, { ao: 0.7, aoH: 0.7 });
      tb.sphere(0.27 * s, tx + 0.05 * s, y + 1.12 * s, tz - 0.05 * s, c, 1, 0.9, 1, 1, { ao: 0.85, aoH: 0.5 });
    };
    const green = () => (rng() < 0.2 ? pick(rng, PAL.TREE_AUTUMN) : pick(rng, PAL.TREE_GREENS));
    for (let tx = -36; tx <= 36; tx += 4.5) if (Math.abs(tx - BRIDGE_X) > 3) addTree(tx + range(rng, -0.6, 0.6), RIVER_Z0 - 2.4 + range(rng, -0.2, 0.2), range(rng, 0.8, 1.05), green(), 0.05);
    for (let i = 0; i < 46; i++) {
      const tx = range(rng, -41, 41), tz = range(rng, RIVER_Z1 + 2, TILE_Z1 - 2);
      if (Math.abs(tx - BRIDGE_X) < 3.5) continue;
      addTree(tx, tz, range(rng, 0.9, 1.5), green());
    }
    for (let i = 0; i < 40; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const tx = side * range(rng, 38.5, 42.5), tz = range(rng, TILE_Z0 + 3, RIVER_Z0 - 4);
      addTree(tx, tz, range(rng, 0.9, 1.5), green());
    }
    for (let i = 0; i < 20; i++) addTree(range(rng, -40, 40), range(rng, TILE_Z0 + 2, TILE_Z0 + 5.5), range(rng, 0.9, 1.5), green());
    const tm = new THREE.Mesh(tb.build()!, this.mats.crown.clone());
    (tm.material as THREE.MeshStandardMaterial).onBeforeCompile = () => {};
    (tm.material as THREE.MeshStandardMaterial).customProgramCacheKey = () => 'plain-tree';
    tm.castShadow = true; tm.receiveShadow = true;
    this.group.add(tm);
    this.wetList.push({ mat: tm.material as THREE.MeshStandardMaterial, r0: 0.92, r1: 0.6, c0: new THREE.Color('#fff'), c1: new THREE.Color('#e6e6e6') });
  }

  // ------------------------------------------------------------------ water
  private buildWater() {
    const zc = (RIVER_Z0 + RIVER_Z1) / 2;
    const geo = new THREE.PlaneGeometry(RIVER_X * 2 + 0.6, RIVER_Z1 - RIVER_Z0 + 0.6, 160, 36).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: false,
      uniforms: {
        uTime: this.env.uniforms.uTime,
        uNight: this.env.uniforms.uNight,
        uSunDir: { value: this.env.sunDir },
        uSunCol: { value: this.env.sunColor },
        uDeep: { value: new THREE.Color(COL.waterDeep) },
        uShallow: { value: new THREE.Color(COL.waterShallow) },
        uSkyTop: { value: this.env.skyTop },
        uSkyHor: { value: this.env.skyHor },
        uRain: { value: 0 },
        uFogColor: { value: this.env.fog.color },
        uFogDensity: { value: 0.004 },
        uBounds: { value: new THREE.Vector4(-RIVER_X, RIVER_X, RIVER_Z0, RIVER_Z1) },
      },
      vertexShader: `uniform float uTime; varying vec3 vW;
        float wave(vec2 p){ return sin(p.x*0.7+uTime*0.9)*0.5 + sin(p.y*1.1-uTime*0.7+p.x*0.3)*0.35 + sin((p.x+p.y)*1.7+uTime*1.4)*0.15; }
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); w.y += wave(w.xz)*0.045; vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uNight, uRain, uFogDensity; uniform vec3 uSunDir, uSunCol, uDeep, uShallow, uSkyTop, uSkyHor, uFogColor; uniform vec4 uBounds; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 p = vW.xz; float t = uTime;
          vec2 g = vec2(0.0);
          g += vec2(0.8,0.3) * 0.70*cos(dot(p, vec2(0.8,0.3))*1.0 + t*0.9)*0.12;
          g += vec2(-0.4,0.9) * 1.31*cos(dot(p, vec2(-0.4,0.9))*1.5 - t*1.1)*0.09;
          g += vec2(0.9,-0.5) * 2.4*cos(dot(p, vec2(0.9,-0.5))*2.6 + t*1.7)*0.05;
          g += vec2(0.2,0.98) * 4.1*cos(dot(p, vec2(0.2,0.98))*4.4 - t*2.3)*0.025;
          // rain ripples
          float rip = 0.0;
          vec2 cell = floor(p*1.1); vec2 f = fract(p*1.1) - 0.5;
          for (int i = 0; i < 2; i++){
            vec2 c2 = cell + vec2(float(i)*7.0, float(i)*3.0);
            float hh = h21(c2); float tt = fract(t*0.8 + hh);
            vec2 off = (vec2(h21(c2+1.7), h21(c2+3.1)) - 0.5) * 0.6;
            float d = length(f - off);
            rip += smoothstep(0.045, 0.0, abs(d - tt*0.5)) * (1.0 - tt);
          }
          g += rip * uRain * 0.8;
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float dx = min(vW.x - uBounds.x, uBounds.y - vW.x);
          float dz = min(vW.z - uBounds.z, uBounds.w - vW.z);
          float edge = min(dx, dz);
          float depth = smoothstep(0.0, 5.0, edge);
          vec3 col = mix(uShallow, uDeep, depth * 0.85 + 0.1 * sin(p.x*0.2 + t*0.1));
          // quay shadow
          col *= mix(0.72, 1.0, smoothstep(0.0, 2.6, vW.z - uBounds.z));
          vec3 rv = reflect(-v, n);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(rv.y*1.4, 0.0, 1.0));
          col = mix(col, sky, fres*0.62 + 0.08);
          vec3 L = normalize(uSunDir);
          float spec = pow(max(dot(reflect(-L, n), v), 0.0), 140.0);
          col += uSunCol * spec * 2.4 * (1.0 - uRain*0.8);
          float spark = pow(max(dot(reflect(-L, n), v), 0.0), 18.0) * 0.18;
          col += uSunCol * spark;
          // foam on the quay edges
          float fo = smoothstep(0.75, 0.0, edge + 0.15*sin(vW.x*1.7+t*0.6) + 0.1*sin(vW.z*3.1));
          fo *= 0.55 + 0.45*sin(edge*16.0 - t*1.1 + vW.x);
          col = mix(col, vec3(0.95,0.97,0.96), clamp(fo,0.0,1.0)*0.5);
          // lamp reflections at night
          float lx = abs(fract((vW.x-4.5)/9.0+0.5)-0.5)*9.0;
          float refl = exp(-lx*lx*2.2) * exp(-(vW.z-uBounds.z)*0.35) * (0.55 + 0.45*sin(vW.z*10.0 + t*2.2 + vW.x*2.0));
          col *= mix(1.0, 0.3, uNight);
          col += vec3(1.0,0.72,0.4) * refl * uNight * 0.55;
          // fog
          float dist = length(vW - cameraPosition);
          float ff = 1.0 - exp(-pow(uFogDensity*dist, 2.0));
          col = mix(col, uFogColor, ff);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, WATER_Y, zc);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mat;
  }

  // ------------------------------------------------------------------ boats
  private buildBoats(main: THREE.Material) {
    const wakeTex = wakeTexture();
    const mkBoat = (kind: 'barge' | 'tour' | 'tug') => {
      const g = new GeoBuilder();
      let len = 6, wid = 1.5;
      if (kind === 'barge') {
        len = 8.5; wid = 1.7;
        const hull = new THREE.Shape();
        hull.moveTo(-len / 2, -wid / 2); hull.lineTo(len / 2 - 1.2, -wid / 2); hull.lineTo(len / 2, 0); hull.lineTo(len / 2 - 1.2, wid / 2); hull.lineTo(-len / 2, wid / 2); hull.closePath();
        const hg = new THREE.ExtrudeGeometry(hull, { depth: 0.6, bevelEnabled: false }).rotateX(-Math.PI / 2);
        g.add(hg, '#3d4a58', new THREE.Matrix4().makeTranslation(0, -0.1, 0), { ao: 0.8 });
        g.box(len - 0.5, 0.06, wid + 0.04, 0, 0.38, 0, '#a85f49', { ao: 1 });
        const cols = ['#c9835f', '#6f93a0', '#d7b46a', '#8a9b78', '#b86a5c'];
        for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) g.box(1.9, 0.45, 1.3, -2.4 + i * 2.05, 0.5 + k * 0.45, 0, cols[(i * 2 + k) % cols.length], { ao: 0.75 });
        g.box(1.0, 0.7, 1.3, len / 2 - 1.2, 0.5, 0, '#efe8d8', { ao: 0.8 });
        g.box(1.04, 0.1, 1.34, len / 2 - 1.2, 1.2, 0, '#6a7480', { ao: 1 });
        g.box(0.5, 0.25, 0.04, len / 2 - 0.69, 0.82, 0, '#2d3b49', { ao: 1 });
      } else if (kind === 'tour') {
        len = 6.2; wid = 1.7;
        const hull = new THREE.Shape();
        hull.moveTo(-len / 2, -wid / 2); hull.lineTo(len / 2 - 1.3, -wid / 2); hull.quadraticCurveTo(len / 2, 0, len / 2 - 1.3, wid / 2); hull.lineTo(-len / 2, wid / 2); hull.closePath();
        g.add(new THREE.ExtrudeGeometry(hull, { depth: 0.5, bevelEnabled: false }).rotateX(-Math.PI / 2), '#f2ede0', new THREE.Matrix4().makeTranslation(0, -0.1, 0), { ao: 0.85 });
        g.box(len - 1.2, 0.04, wid + 0.04, -0.2, 0.38, 0, '#4f7c73', { ao: 1 });
        g.box(len - 1.8, 0.55, wid - 0.35, -0.3, 0.4, 0, '#7b9db0', { ao: 0.8 });
        g.box(len - 1.7, 0.08, wid - 0.25, -0.3, 0.95, 0, '#f2ede0', { ao: 1 });
        g.box(0.04, 0.5, 0.04, -len / 2 + 0.5, 0.95, 0, '#d8d3c6', { ao: 1 });
        g.box(0.3, 0.2, 0.02, -len / 2 + 0.67, 1.3, 0, '#c9674f', { ao: 1 });
      } else {
        len = 3.4; wid = 1.3;
        const hull = new THREE.Shape();
        hull.moveTo(-len / 2, -wid / 2); hull.lineTo(len / 2 - 0.7, -wid / 2); hull.quadraticCurveTo(len / 2, 0, len / 2 - 0.7, wid / 2); hull.lineTo(-len / 2, wid / 2); hull.closePath();
        g.add(new THREE.ExtrudeGeometry(hull, { depth: 0.5, bevelEnabled: false }).rotateX(-Math.PI / 2), '#a85f49', new THREE.Matrix4().makeTranslation(0, -0.1, 0), { ao: 0.85 });
        g.box(1.2, 0.6, 0.9, -0.2, 0.4, 0, '#efe8d8', { ao: 0.8 });
        g.box(1.3, 0.06, 1.0, -0.2, 1.0, 0, '#3d4a58', { ao: 1 });
        g.cyl(0.12, 0.14, 0.5, -0.7, 1.0, 0, '#2f3943', 8, { ao: 1 });
      }
      const mesh = new THREE.Mesh(g.build()!, main);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const grp = new THREE.Group();
      grp.add(mesh);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.4, wid * 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
      wake.position.set(-len * 0.95, 0.03, 0);
      grp.add(wake);
      return grp;
    };
    const zc = (RIVER_Z0 + RIVER_Z1) / 2;
    const defs: { kind: 'barge' | 'tour' | 'tug'; z: number; speed: number; x0: number; x1: number; start: number }[] = [
      { kind: 'barge', z: zc + 3.2, speed: 1.6, x0: -34, x1: 34, start: 0.2 },
      { kind: 'tour', z: zc - 2.6, speed: -1.1, x0: -34, x1: 34, start: 0.7 },
      { kind: 'tug', z: zc + 0.3, speed: 2.0, x0: -34, x1: 34, start: 0.5 },
    ];
    for (const d of defs) {
      const g = mkBoat(d.kind);
      g.position.set(d.x0 + (d.x1 - d.x0) * d.start, WATER_Y, d.z);
      if (d.speed < 0) g.rotation.y = Math.PI;
      this.group.add(g);
      this.boats.push({ g, speed: d.speed, z: d.z, x0: d.x0, x1: d.x1, bob: 0.03, phase: Math.random() * 6 });
    }
  }

  setWet(w: number) {
    for (const e of this.wetList) {
      e.mat.roughness = e.r0 + (e.r1 - e.r0) * w;
      if (!e.mat.vertexColors && !e.mat.map) e.mat.color.lerpColors(e.c0, e.c1, w);
    }
  }

  update(dt: number) {
    this.t += dt;
    const n = this.env.uniforms.uNight.value as number;
    // lamps glow
    const glow = 0.45 + n * 5.0;
    this.lampHeadMat.color.setRGB(0.8 + glow * 0.5, 0.72 + glow * 0.34, 0.55 + glow * 0.18);
    this.poolMat.opacity = Math.min(1, n * 0.9);
    this.glowMat.color.setRGB(1.0 + n * 2.0, 0.82 + n * 1.3, 0.55 + n * 0.5);
    this.waterMat.uniforms.uRain.value = this.env.rain;
    this.waterMat.uniforms.uFogDensity.value = this.env.fog.density;
    for (const b of this.boats) {
      const x = b.g.position.x + b.speed * dt;
      b.g.position.x = x > b.x1 ? b.x0 : x < b.x0 ? b.x1 : x;
      b.g.position.y = WATER_Y + Math.sin(this.t * 1.3 + b.phase) * b.bob;
      b.g.rotation.z = Math.sin(this.t * 1.1 + b.phase) * 0.012;
    }
  }
}

export { damp };
