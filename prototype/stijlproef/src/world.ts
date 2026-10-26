// Assembles the diorama: land, water, roads, filler architecture, landmarks, trees, lamps, boats.
import * as THREE from 'three';
import { FlatBuilder, GeoBuilder } from './geo';
import { Town } from './buildings';
import { Graph, buildGraph, CELLS, LOT_CENTRES, LOT_SIZE } from './map';
import { Bay, buildLand, buildRoads, shoreTexture, waterSkirts, WATER_X0, WATER_X1, WATER_Z0, WATER_Z1, LampSpec } from './terrain';
import { buildLandmarks, Label, Updater } from './landmarks';
import { COL } from './palette';
import * as PAL from './palette';
import { noiseTexture, wakeTexture } from './tex';
import { Environment } from './env';
import { patchFacade, patchIntro } from './patches';
import { WATER_Y, WORLD_CENTRE } from './config';
import { mulberry32, pick, range } from './util';

export type { Bay } from './terrain';

export interface Lot {
  id: number; cx: number; cz: number; size: number;
  /** four 6x6 sub-lots (nw, ne, sw, se); true = free */
  subs: boolean[];
  free: boolean; // whole lot untouched
  ring?: THREE.Mesh;
}
export interface Boat { g: THREE.Group; curve: THREE.CatmullRomCurve3; u: number; speed: number; bob: number; phase: number; len: number }

export class World {
  group = new THREE.Group();
  graph: Graph;
  lots: Lot[] = [];
  bays: Bay[] = [];
  labels: Label[] = [];
  updaters: Updater[] = [];
  mats: Record<string, THREE.Material> = {};
  lampHeadMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  floodMat: THREE.MeshBasicMaterial;
  poolMat: THREE.MeshBasicMaterial;
  waterMat!: THREE.ShaderMaterial;
  wetList: { mat: THREE.MeshStandardMaterial; r0: number; r1: number; c0: THREE.Color; c1: THREE.Color }[] = [];
  boats: Boat[] = [];
  structures = new THREE.Group();
  lotMarks!: THREE.InstancedMesh;
  noPark: (x: number, z: number) => boolean = () => false;
  landmark: Record<string, THREE.Object3D | undefined> = {};
  private env: Environment;
  private t = 0;
  mainMat: THREE.MeshStandardMaterial;

  constructor(env: Environment) {
    this.env = env;
    const U = env.uniforms;
    const rng = mulberry32(20261026);
    this.graph = buildGraph();

    const mk = (color: THREE.ColorRepresentation, rough: number, wetRough: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}, wetDark = 0.82) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
      this.wetList.push({ mat: m, r0: rough, r1: wetRough, c0: new THREE.Color(color), c1: new THREE.Color(color).multiplyScalar(wetDark) });
      return m;
    };
    const main = mk('#ffffff', 0.85, 0.5, { vertexColors: true }, 0.88);
    patchIntro(main, U, 'world', false, WORLD_CENTRE, 130);
    patchFacade(main, U);
    this.mainMat = main;
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.55, envMapIntensity: 1.5 });
    const flatMat = mk('#ffffff', 0.92, 0.5, { vertexColors: true }, 0.88);
    const roadMat = mk('#ffffff', 0.95, 0.3, { vertexColors: true, envMapIntensity: 1.2 }, 0.75);
    const markMat = mk('#ffffff', 0.8, 0.35, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 0.92);
    const deckMat = mk('#ffffff', 0.8, 0.5, { vertexColors: true }, 0.9);
    const glassMat = new THREE.MeshStandardMaterial({ color: '#bfe3ee', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
    const crown = mk('#ffffff', 0.92, 0.6, { vertexColors: true, flatShading: true }, 0.9);
    const trunk = mk(COL.trunk, 1, 0.9);
    patchIntro(crown, U, 'inst', true, WORLD_CENTRE, 130);
    patchIntro(trunk, U, 'inst', true, WORLD_CENTRE, 130);
    this.mats = { main, metal, flatMat, roadMat, markMat, deckMat, glassMat, crown, trunk };

    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: '#cfc7b8' });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#cfc7b8' });
    this.floodMat = new THREE.MeshBasicMaterial({ color: '#cfc7b8' });
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

    // ---- land + water
    const land = buildLand();
    this.group.add(land.top, land.sides, waterSkirts());
    this.waterMat = this.buildWater();

    // ---- town (filler) + landmarks
    const town = new Town(rng);
    for (const [cx, cz] of LOT_CENTRES) town.excl.push([cx - LOT_SIZE / 2 - 0.4, cz - LOT_SIZE / 2 - 0.4, cx + LOT_SIZE / 2 + 0.4, cz + LOT_SIZE / 2 + 0.4]);
    const lm = {
      gb: new GeoBuilder(), mt: new GeoBuilder(), gl: new GeoBuilder(), fl: new GeoBuilder(), glass: new GeoBuilder(), flat: new FlatBuilder(),
      town, objs: [] as THREE.Object3D[], labels: [] as Label[], updaters: [] as Updater[], rng, uni: U, env, world: this,
      noPark: [] as ((x: number, z: number) => boolean)[], named: {} as Record<string, THREE.Object3D>,
    };
    buildLandmarks(lm);
    for (const c of CELLS) town.fill(c);
    this.noPark = (x, z) => lm.noPark.some((f) => f(x, z)) || town.blocked(x, z, 0);
    this.labels = lm.labels;
    this.updaters = lm.updaters;
    this.landmark = lm.named;

    // ---- roads
    const roads = buildRoads(this.graph, (x, z) => this.noPark(x, z), (x) => (Math.abs(x - 50) < 3 ? COL.redBridge : Math.abs(x) < 3 ? '#f1ede4' : '#d5d1c7'));
    this.bays = roads.bays;
    const addMesh = (g: THREE.BufferGeometry | null, m: THREE.Material, o: { cast?: boolean; recv?: boolean } = {}) => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = !!o.cast; mesh.receiveShadow = o.recv !== false;
      this.group.add(mesh);
      return mesh;
    };
    addMesh(roads.asphalt, roadMat);
    addMesh(roads.marks, markMat);
    addMesh(roads.decks, deckMat, { cast: true });
    addMesh(town.flat.build(), flatMat);
    addMesh(lm.flat.build(), flatMat);
    const bm = addMesh(town.gb.build(), main, { cast: true });
    if (bm) {
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      patchIntro(dm, U, 'world', false, WORLD_CENTRE, 130);
      bm.customDepthMaterial = dm;
    }
    const lmMain = addMesh(lm.gb.build(), main, { cast: true });
    if (lmMain) {
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      patchIntro(dm, U, 'world', false, WORLD_CENTRE, 130);
      lmMain.customDepthMaterial = dm;
    }
    addMesh(lm.mt.build(), metal, { cast: true });
    addMesh(lm.gl.build(), this.glowMat);
    addMesh(lm.fl.build(), this.floodMat);
    const gm = addMesh(lm.glass.build(), glassMat, { recv: false });
    if (gm) gm.renderOrder = 4;
    for (const o of lm.objs) this.group.add(o);

    this.buildTrees(town, crown, trunk, rng);
    this.buildLamps(roads.lamps);
    this.buildLots(rng);
    this.buildBoats(main);
    this.group.add(this.structures);
  }

  // ------------------------------------------------------------------ lots
  private buildLots(rng: () => number) {
    const fb = new FlatBuilder();
    const n = LOT_CENTRES.length;
    LOT_CENTRES.forEach(([cx, cz], i) => {
      const h = LOT_SIZE / 2;
      this.lots.push({ id: i, cx, cz, size: LOT_SIZE, subs: [true, true, true, true], free: true });
      fb.rect(cx - h, cz - h, cx + h, cz + h, 0.045, '#e8dec8');
      // divider cross + parking-bay hints
      fb.rect(cx - 0.05, cz - h + 0.4, cx + 0.05, cz + h - 0.4, 0.052, '#cfc4ad');
      fb.rect(cx - h + 0.4, cz - 0.05, cx + h - 0.4, cz + 0.05, 0.052, '#cfc4ad');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        fb.rect(cx + sx * h - (sx > 0 ? 1.6 : 0) - (sx < 0 ? -0.0 : 0), cz + sz * h - (sz > 0 ? 0.25 : 0), cx + sx * h + (sx < 0 ? 1.6 : 0), cz + sz * h + (sz < 0 ? 0.25 : 0), 0.056, '#f0b640');
        fb.rect(cx + sx * h - (sx > 0 ? 0.25 : 0), cz + sz * h - (sz > 0 ? 1.6 : 0), cx + sx * h + (sx < 0 ? 0.25 : 0), cz + sz * h + (sz < 0 ? 1.6 : 0), 0.056, '#f0b640');
      }
    });
    const m = new THREE.Mesh(fb.build()!, this.mats.flatMat);
    m.receiveShadow = true;
    this.group.add(m);
    // pulsing outline per lot
    const ringShape = new THREE.Shape();
    const o = LOT_SIZE / 2 + 0.2, inn = o - 0.55;
    ringShape.moveTo(-o, -o); ringShape.lineTo(o, -o); ringShape.lineTo(o, o); ringShape.lineTo(-o, o); ringShape.closePath();
    const hole = new THREE.Path(); hole.moveTo(-inn, -inn); hole.lineTo(-inn, inn); hole.lineTo(inn, inn); hole.lineTo(inn, -inn); hole.closePath();
    ringShape.holes.push(hole);
    const rg = new THREE.ShapeGeometry(ringShape).rotateX(-Math.PI / 2);
    const rmat = new THREE.MeshBasicMaterial({ color: '#ffd264', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    this.lotMarks = new THREE.InstancedMesh(rg, rmat, n);
    this.lotMarks.frustumCulled = false;
    this.lotMarks.renderOrder = 6;
    const m4 = new THREE.Matrix4();
    this.lots.forEach((l, i) => this.lotMarks.setMatrixAt(i, m4.makeTranslation(l.cx, 0.07, l.cz)));
    this.group.add(this.lotMarks);
    void rng;
  }

  // ------------------------------------------------------------------ trees
  private buildTrees(town: Town, crown: THREE.Material, trunk: THREE.Material, rng: () => number) {
    const kinds: { geo: THREE.BufferGeometry; trunk: THREE.BufferGeometry }[] = [];
    const cg = new GeoBuilder();
    cg.sphere(0.95, 0, 1.55, 0, '#ffffff', 1, 0.92, 1, 1, { ao: 0.7, aoH: 1.6 });
    cg.sphere(0.65, 0.58, 1.1, 0.2, '#f0f0f0', 1, 0.9, 1, 1, { ao: 0.68, aoH: 1.2 });
    cg.sphere(0.6, -0.52, 1.05, -0.3, '#eaeaea', 1, 0.9, 1, 1, { ao: 0.68, aoH: 1.2 });
    cg.sphere(0.52, 0.1, 2.15, -0.1, '#ffffff', 1, 0.9, 1, 1, { ao: 0.85, aoH: 1 });
    const tg = new GeoBuilder(); tg.cyl(0.08, 0.13, 1.1, 0, 0, 0, '#ffffff', 6, { ao: 1 });
    kinds.push({ geo: cg.build()!, trunk: tg.build()! });
    const pg = new GeoBuilder();
    pg.sphere(0.62, 0, 1.5, 0, '#ffffff', 1, 2.0, 1, 1, { ao: 0.7, aoH: 1.8 });
    pg.sphere(0.45, 0, 2.5, 0, '#f2f2f2', 1, 1.5, 1, 1, { ao: 0.9, aoH: 1 });
    const tg2 = new GeoBuilder(); tg2.cyl(0.07, 0.1, 0.9, 0, 0, 0, '#ffffff', 6, { ao: 1 });
    kinds.push({ geo: pg.build()!, trunk: tg2.build()! });
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const rr = mulberry32(5);
    kinds.forEach((k, ki) => {
      const list = town.trees.filter((t) => t.kind === ki);
      if (!list.length) return;
      const crowns = new THREE.InstancedMesh(k.geo, crown, list.length);
      const trunks = new THREE.InstancedMesh(k.trunk, trunk, list.length);
      list.forEach((t, i) => {
        q.setFromEuler(e.set(0, rr() * 6.28, 0));
        mtx.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * range(rr, 0.9, 1.15), t.s));
        crowns.setMatrixAt(i, mtx); trunks.setMatrixAt(i, mtx);
        crowns.setColorAt(i, new THREE.Color(rr() < 0.16 ? pick(rr, PAL.TREE_AUTUMN) : pick(rr, PAL.TREE_GREENS)));
      });
      crowns.castShadow = true; crowns.receiveShadow = true; trunks.castShadow = true;
      for (const mesh of [crowns, trunks]) {
        const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        patchIntro(d, this.env.uniforms, 'inst', false, WORLD_CENTRE, 130);
        mesh.customDepthMaterial = d;
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
    });
    void rng;
  }

  // ------------------------------------------------------------------ lamps
  private buildLamps(lamps: LampSpec[]) {
    const poleG = new GeoBuilder();
    poleG.cyl(0.06, 0.09, 2.7, 0, 0, 0, COL.lampPole, 6, { ao: 1 });
    poleG.box(0.5, 0.06, 0.06, 0.2, 2.7, 0, COL.lampPole, { ao: 1 });
    const poles = new THREE.InstancedMesh(poleG.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), lamps.length);
    const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), this.lampHeadMat, lamps.length);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), this.poolMat, lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      // lean the head towards the road
      m.makeTranslation(l.x, l.y, l.z); poles.setMatrixAt(i, m);
      m.makeTranslation(l.x + 0.4, l.y + 2.72, l.z); head.setMatrixAt(i, m);
      m.makeTranslation(l.x + 0.4, l.y + 0.1, l.z); pool.setMatrixAt(i, m);
    });
    poles.castShadow = true; poles.frustumCulled = false; head.frustumCulled = false; pool.frustumCulled = false;
    pool.renderOrder = 5;
    this.group.add(poles, head, pool);
  }

  // ------------------------------------------------------------------ water
  private buildWater() {
    const geo = new THREE.PlaneGeometry(WATER_X1 - WATER_X0, WATER_Z1 - WATER_Z0, 200, 48).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
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
        uShore: { value: shoreTexture() },
        uBox: { value: new THREE.Vector4(WATER_X0, WATER_Z0, WATER_X1 - WATER_X0, WATER_Z1 - WATER_Z0) },
      },
      vertexShader: `uniform float uTime; varying vec3 vW;
        float wave(vec2 p){ return sin(p.x*0.5+uTime*0.9)*0.5 + sin(p.y*0.9-uTime*0.7+p.x*0.3)*0.35 + sin((p.x+p.y)*1.3+uTime*1.4)*0.15; }
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); w.y += wave(w.xz)*0.05; vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uNight, uRain, uFogDensity; uniform vec3 uSunDir, uSunCol, uDeep, uShallow, uSkyTop, uSkyHor, uFogColor; uniform vec4 uBox; uniform sampler2D uShore; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 p = vW.xz; float t = uTime;
          vec2 g = vec2(0.0);
          g += vec2(0.8,0.3) * 0.70*cos(dot(p, vec2(0.8,0.3))*0.8 + t*0.9)*0.12;
          g += vec2(-0.4,0.9) * 1.31*cos(dot(p, vec2(-0.4,0.9))*1.2 - t*1.1)*0.09;
          g += vec2(0.9,-0.5) * 2.4*cos(dot(p, vec2(0.9,-0.5))*2.2 + t*1.7)*0.05;
          g += vec2(0.2,0.98) * 4.1*cos(dot(p, vec2(0.2,0.98))*3.8 - t*2.3)*0.025;
          float rip = 0.0;
          vec2 cell = floor(p*0.7); vec2 f = fract(p*0.7) - 0.5;
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
          vec2 suv = (p - uBox.xy) / uBox.zw;
          float edge = texture2D(uShore, suv).r * 10.0;
          float depth = smoothstep(0.0, 6.0, edge);
          vec3 deep = mix(uDeep, vec3(0.10, 0.20, 0.34), uNight * 0.8);
          vec3 shal = mix(uShallow, vec3(0.18, 0.32, 0.46), uNight * 0.85);
          vec3 col = mix(shal, deep, depth * 0.85 + 0.1 * sin(p.x*0.12 + t*0.1));
          col *= mix(0.78, 1.0, smoothstep(0.0, 2.4, edge));
          vec3 rv = reflect(-v, n);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(rv.y*1.4, 0.0, 1.0));
          col = mix(col, sky, fres*0.62 + 0.08);
          vec3 L = normalize(uSunDir);
          float spec = pow(max(dot(reflect(-L, n), v), 0.0), 140.0);
          col += uSunCol * spec * 2.6 * (1.0 - uRain*0.8);
          float spark = pow(max(dot(reflect(-L, n), v), 0.0), 18.0) * 0.16;
          col += uSunCol * spark;
          float fo = smoothstep(0.9, 0.0, edge + 0.15*sin(vW.x*1.7+t*0.6) + 0.1*sin(vW.z*3.1));
          fo *= 0.55 + 0.45*sin(edge*14.0 - t*1.1 + vW.x);
          col = mix(col, vec3(0.95,0.97,0.96), clamp(fo,0.0,1.0)*0.5);
          // lamp glints along the banks at night
          float glint = smoothstep(2.6, 0.2, edge) * (0.5 + 0.5*sin(vW.x*3.7 + t*1.7 + sin(vW.z*2.0)*3.0)) * smoothstep(0.4, 0.9, h21(floor(vec2(vW.x*0.8, 0.0))));
          col += vec3(1.0,0.72,0.4) * glint * uNight * 0.5;
          float dist = length(vW - cameraPosition);
          float ff = 1.0 - exp(-pow(uFogDensity*dist, 2.0));
          col = mix(col, uFogColor, ff);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((WATER_X0 + WATER_X1) / 2, WATER_Y, (WATER_Z0 + WATER_Z1) / 2);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mat;
  }

  // ------------------------------------------------------------------ boats
  private buildBoats(main: THREE.Material) {
    const wakeTex = wakeTexture();
    type Kind = 'barge' | 'tour' | 'taxi' | 'tug';
    const mkBoat = (kind: Kind) => {
      const g = new GeoBuilder();
      let len = 8, wid = 2;
      const hull = (L: number, Wd: number, bow: number, y0: number, hgt: number, color: string, round = true) => {
        const s = new THREE.Shape();
        s.moveTo(-L / 2, -Wd / 2); s.lineTo(L / 2 - bow, -Wd / 2);
        if (round) s.quadraticCurveTo(L / 2, 0, L / 2 - bow, Wd / 2); else { s.lineTo(L / 2, 0); s.lineTo(L / 2 - bow, Wd / 2); }
        s.lineTo(-L / 2, Wd / 2); s.closePath();
        g.add(new THREE.ExtrudeGeometry(s, { depth: hgt, bevelEnabled: false }).rotateX(-Math.PI / 2), color, new THREE.Matrix4().makeTranslation(0, y0, 0), { ao: 0.85 });
      };
      if (kind === 'barge') {
        len = 16; wid = 3.2;
        hull(len, wid, 2.2, -0.2, 1.2, '#3d4a58', false);
        g.box(len - 0.8, 0.12, wid + 0.06, 0, 0.96, 0, '#a85f49', { ao: 1 });
        const cols = ['#c9835f', '#6f93a0', '#d7b46a', '#8a9b78', '#b86a5c'];
        for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) g.box(3.2, 1.2, 2.5, -4.8 + i * 3.35, 1.0 + k * 1.2, 0, cols[(i * 2 + k) % cols.length], { ao: 0.75 });
        g.box(2.3, 1.9, 2.5, len / 2 - 2.6, 1.0, 0, '#efe8d8', { ao: 0.8 });
        g.box(2.5, 0.2, 2.7, len / 2 - 2.6, 2.9, 0, '#6a7480', { ao: 1 });
        g.box(0.9, 0.6, 0.06, len / 2 - 1.4, 2.0, 0, '#2d3b49', { ao: 1 });
      } else if (kind === 'tour') {
        len = 12; wid = 3.4;
        hull(len, wid, 2.6, -0.2, 1.0, '#f4f0e4');
        g.box(len - 2.4, 0.1, wid + 0.06, -0.3, 0.78, 0, '#2f6f7e', { ao: 1 });
        g.box(len - 3.4, 1.1, wid - 0.7, -0.6, 0.85, 0, '#9ec3d3', { ao: 0.85 });
        g.box(len - 3.2, 0.14, wid - 0.5, -0.6, 1.95, 0, '#f4f0e4', { ao: 1 });
        g.box(len - 6, 0.9, wid - 1.2, -1.3, 2.05, 0, '#9ec3d3', { ao: 0.9 });
        g.box(len - 5.8, 0.12, wid - 1.0, -1.3, 2.95, 0, '#f4f0e4', { ao: 1 });
        g.box(1.2, 0.6, 1.0, 0.8, 3.07, 0, '#e8e4d8', { ao: 1 });
        g.cyl(0.18, 0.2, 1.0, -3.4, 3.07, 0, '#2f3943', 8, { ao: 1 });
      } else if (kind === 'taxi') {
        len = 6.2; wid = 2.1;
        hull(len, wid, 1.8, -0.15, 0.7, '#f2efe6');
        g.box(len - 1.8, 0.08, wid + 0.04, -0.2, 0.52, 0, '#23506b', { ao: 1 });
        g.box(2.6, 0.95, wid - 0.5, -0.3, 0.55, 0, '#cfe6ee', { ao: 0.85 });
        g.box(2.8, 0.1, wid - 0.4, -0.3, 1.5, 0, '#23506b', { ao: 1 });
        g.box(0.8, 0.25, 0.3, -0.3, 1.58, 0, '#ffc233', { ao: 1 }); // taxi light
        g.box(0.5, 0.35, 0.4, -len / 2 + 0.4, 0.5, 0, '#2f3943', { ao: 1 });
      } else {
        len = 7; wid = 2.6;
        hull(len, wid, 1.4, -0.2, 1.0, '#a85f49');
        g.box(2.4, 1.2, 1.9, -0.4, 0.75, 0, '#efe8d8', { ao: 0.8 });
        g.box(2.6, 0.12, 2.1, -0.4, 1.95, 0, '#3d4a58', { ao: 1 });
        g.cyl(0.24, 0.28, 1.0, -1.3, 1.95, 0, '#2f3943', 8, { ao: 1 });
      }
      const mesh = new THREE.Mesh(g.build()!, main);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const grp = new THREE.Group();
      grp.add(mesh);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.5, wid * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0.6, fog: false }));
      wake.position.set(-len * 0.95, 0.03, 0);
      grp.add(wake);
      return { grp, len };
    };
    const east = [[-112, 37], [-60, 37], [-8, 37], [8, 39], [18, 42.4], [60, 42.4], [74, 40], [88, 36], [112, 36]];
    const west = [[112, 22], [86, 21], [72, 19], [62, 17], [20, 17], [10, 19], [0, 22], [-60, 22], [-112, 22]];
    const defs: { kind: Kind; path: number[][]; speed: number; start: number }[] = [
      { kind: 'tour', path: west, speed: 2.0, start: 0.42 },
      { kind: 'taxi', path: east, speed: 5.0, start: 0.34 },
      { kind: 'taxi', path: west, speed: 5.6, start: 0.78 },
      { kind: 'barge', path: east, speed: 2.4, start: 0.62 },
      { kind: 'tug', path: west, speed: 2.8, start: 0.12 },
    ];
    for (const d of defs) {
      const { grp, len } = mkBoat(d.kind);
      const curve = new THREE.CatmullRomCurve3(d.path.map((p) => new THREE.Vector3(p[0], WATER_Y, p[1])), false, 'catmullrom', 0.3);
      this.group.add(grp);
      this.boats.push({ g: grp, curve, u: d.start, speed: d.speed / curve.getLength(), bob: 0.04, phase: Math.random() * 6, len });
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
    const glow = 0.45 + n * 5.0;
    this.lampHeadMat.color.setRGB(0.8 + glow * 0.5, 0.72 + glow * 0.34, 0.55 + glow * 0.18);
    this.poolMat.opacity = Math.min(1, n * 0.9);
    this.glowMat.color.setRGB(1.0 + n * 2.0, 0.82 + n * 1.3, 0.55 + n * 0.5);
    this.waterMat.uniforms.uRain.value = this.env.rain;
    this.waterMat.uniforms.uFogDensity.value = this.env.fog.density;
    for (const b of this.boats) {
      b.u += b.speed * dt;
      if (b.u > 1) b.u -= 1;
      const p = b.curve.getPointAt(b.u);
      const tg = b.curve.getTangentAt(b.u);
      b.g.position.set(p.x, WATER_Y + Math.sin(this.t * 1.3 + b.phase) * b.bob, p.z);
      b.g.rotation.y = -Math.atan2(tg.z, tg.x);
      b.g.rotation.z = Math.sin(this.t * 1.1 + b.phase) * 0.012;
    }
    for (const u of this.updaters) u(dt, this.t);
  }
}

function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,205,130,0.85)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { noiseTexture };
