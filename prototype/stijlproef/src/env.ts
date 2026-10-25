// Day/night cycle, sky, lights, fog, stars, rain and the shared shader uniforms.
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, mulberry32 } from './util';

interface Look {
  h: number;
  sun: string; sunI: number;
  hemiSky: string; hemiGround: string; hemiI: number;
  bgTop: string; bgHor: string; fog: string;
  night: number; envI: number; bloom: number; bloomT: number;
}

// Keyframes over 24 h. Colours are sRGB hex; they get converted to linear by THREE.Color.
const KEYS: Look[] = [
  { h: 0,    sun: '#7f95d6', sunI: 0.9, hemiSky: '#3a4a86', hemiGround: '#1a1f38', hemiI: 0.75, bgTop: '#0d1433', bgHor: '#222f5c', fog: '#1a2448', night: 1,   envI: 0.22, bloom: 0.8, bloomT: 0.7 },
  { h: 4.8,  sun: '#7f95d6', sunI: 0.8, hemiSky: '#43558f', hemiGround: '#1d2138', hemiI: 0.75, bgTop: '#18214a', bgHor: '#34457a', fog: '#2a3763', night: 1,   envI: 0.25, bloom: 0.8, bloomT: 0.7 },
  { h: 6.2,  sun: '#ffa27a', sunI: 1.5, hemiSky: '#8e9cc4', hemiGround: '#4a3f52', hemiI: 0.7,  bgTop: '#5f7fbd', bgHor: '#f2b79a', fog: '#d9a999', night: 0.4, envI: 0.4,  bloom: 0.7, bloomT: 0.85 },
  { h: 7.8,  sun: '#ffd9a2', sunI: 2.6, hemiSky: '#aac6e2', hemiGround: '#7a7266', hemiI: 0.55, bgTop: '#8ec3ea', bgHor: '#f7e6c9', fog: '#e9dcc6', night: 0,   envI: 0.55, bloom: 0.35, bloomT: 1.25 },
  { h: 11.5, sun: '#fff0d8', sunI: 3.0, hemiSky: '#b6d6ee', hemiGround: '#8a8372', hemiI: 0.5, bgTop: '#7bbbe8', bgHor: '#f4ecdc', fog: '#e8e4d8', night: 0,   envI: 0.6,  bloom: 0.3, bloomT: 1.3 },
  { h: 15.5, sun: '#ffe6bd', sunI: 2.9, hemiSky: '#b4d0e8', hemiGround: '#857c6c', hemiI: 0.5, bgTop: '#80b6e0', bgHor: '#f6e5c8', fog: '#eadcc3', night: 0,   envI: 0.58, bloom: 0.32, bloomT: 1.25 },
  { h: 17.6, sun: '#ffb260', sunI: 2.8, hemiSky: '#c8b0a8', hemiGround: '#6f5a52', hemiI: 0.65, bgTop: '#8aa0d2', bgHor: '#ffc78f', fog: '#f1c8a0', night: 0.1, envI: 0.5,  bloom: 0.55, bloomT: 1.0 },
  { h: 19.0, sun: '#ff7c52', sunI: 1.5, hemiSky: '#9d8fb8', hemiGround: '#503f52', hemiI: 0.6,  bgTop: '#5e5fa0', bgHor: '#f6906c', fog: '#c98a88', night: 0.55, envI: 0.35, bloom: 0.8, bloomT: 0.8 },
  { h: 20.3, sun: '#8296e0', sunI: 1.1, hemiSky: '#5668a8', hemiGround: '#262a48', hemiI: 0.75, bgTop: '#2a3c7c', bgHor: '#6f80b8', fog: '#4b5a8c', night: 0.92, envI: 0.28, bloom: 1.0, bloomT: 0.6 },
  { h: 22.2, sun: '#7f95d6', sunI: 0.9, hemiSky: '#3a4a86', hemiGround: '#1a1f38', hemiI: 0.75, bgTop: '#0d1433', bgHor: '#222f5c', fog: '#1a2448', night: 1,   envI: 0.22, bloom: 0.8, bloomT: 0.7 },
  { h: 24,   sun: '#7f95d6', sunI: 0.9, hemiSky: '#3a4a86', hemiGround: '#1a1f38', hemiI: 0.75, bgTop: '#0d1433', bgHor: '#222f5c', fog: '#1a2448', night: 1,   envI: 0.22, bloom: 0.8, bloomT: 0.7 },
];
const C = (s: string) => new THREE.Color(s);
const KEYS_C = KEYS.map((k) => ({ ...k, c: { sun: C(k.sun), hs: C(k.hemiSky), hg: C(k.hemiGround), bt: C(k.bgTop), bh: C(k.bgHor), fog: C(k.fog) } }));

export class Environment {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  uniforms = {
    uNight: { value: 0 },
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uWet: { value: 0 },
  };
  hour = 10;
  night = 0;
  rain = 0; // smoothed 0..1
  rainTarget = 0;
  wet = 0;
  bloom = 0.3;
  bloomThreshold = 1.2;
  sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  sunColor = new THREE.Color();
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private rainMesh: THREE.LineSegments;
  private rainMat: THREE.ShaderMaterial;
  envI = 0.5;
  private _a = new THREE.Color();
  private _b = new THREE.Color();
  private target = new THREE.Vector3(0, 0, 12);
  dayness = 1;
  skyTop!: THREE.Color;
  skyHor!: THREE.Color;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.fog = new THREE.FogExp2('#e8e4d8', 0.0017);
    scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight('#fff0d8', 3);
    this.sun.castShadow = true;
    const S = 3072;
    this.sun.shadow.mapSize.set(S, S);
    const cam = this.sun.shadow.camera;
    cam.left = -72; cam.right = 72; cam.top = 72; cam.bottom = -72; cam.near = 10; cam.far = 320;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3.2;
    this.sun.shadow.blurSamples = 12;
    this.sun.target.position.copy(this.target);
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#b6d6ee', '#8a8372', 0.75);
    scene.add(this.hemi);

    // Neutral image-based light so glass and wet roads have something to reflect.
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `varying vec3 vD; void main(){ float t = vD.y; vec3 top = vec3(0.55,0.72,0.95); vec3 hor = vec3(1.0,0.93,0.82); vec3 bot = vec3(0.35,0.3,0.26);
        vec3 c = t>0.0 ? mix(hor, top, pow(t,0.6)) : mix(hor, bot, pow(-t,0.5));
        c += vec3(1.0,0.9,0.7) * pow(max(dot(normalize(vD), normalize(vec3(0.5,0.6,0.4))),0.0), 40.0) * 3.0;
        gl_FragColor = vec4(c,1.0);} `,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat));
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.5;
    pm.dispose();

    // Screen-space gradient backdrop (drawn first, no depth).
    this.skyMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uNight: this.uniforms.uNight, uRain: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0);} ',
      fragmentShader: `varying vec2 vUv; uniform vec3 uTop; uniform vec3 uHor; uniform float uNight; uniform float uRain;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*45758.5453); }
        void main(){
          float t = smoothstep(0.0, 1.0, vUv.y);
          vec3 c = mix(uHor, uTop, t);
          float d = distance(vUv, vec2(0.5, 0.46));
          c += uHor * 0.22 * smoothstep(0.75, 0.0, d) * (1.0 - uNight * 0.6);
          c *= 1.0 - 0.18 * smoothstep(0.45, 1.0, d);
          c += (h21(gl_FragCoord.xy) - 0.5) * 0.012; // dither against banding
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.skyTop = this.skyMat.uniforms.uTop.value as THREE.Color;
    this.skyHor = this.skyMat.uniforms.uHor.value as THREE.Color;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -1000;
    scene.add(sky);

    // Stars
    const r = mulberry32(7);
    const sp: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      sp.push(Math.cos(th) * s * 500, u * 500, Math.sin(th) * s * 500);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe6ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.renderOrder = -900;
    scene.add(this.stars);

    // Rain: line segments animated fully in the vertex shader.
    const N = 5000;
    const pos = new Float32Array(N * 2 * 3);
    const seed = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (r() - 0.5) * 130, z = (r() - 0.5) * 150 + 12, ph = r();
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k);
        seed[o * 3] = x; seed[o * 3 + 1] = ph; seed[o * 3 + 2] = z; end[o] = k;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: this.uniforms.uTime, uAmount: { value: 0 }, uTint: { value: new THREE.Color('#dfe9f2') } },
      vertexShader: `attribute vec3 aSeed; attribute float aEnd; uniform float uTime; uniform float uAmount; varying float vA;
        void main(){
          float H = 48.0;
          float y = mod(aSeed.y * H - uTime * 38.0, H);
          vec3 p = vec3(aSeed.x, y - 2.0, aSeed.z);
          p.x += (y) * 0.12; // slight wind slant
          p -= vec3(0.12, 1.0, 0.0) * aEnd * 0.9;
          float vis = step(fract(sin(aSeed.x * 12.9898 + aSeed.z * 78.233) * 43758.5453), uAmount); // thin out with amount
          vA = vis * (0.55 - 0.3 * (y / H));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: 'uniform vec3 uTint; varying float vA; void main(){ gl_FragColor = vec4(uTint, vA * 0.9); }',
    });
    this.rainMesh = new THREE.LineSegments(rg, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 50;
    scene.add(this.rainMesh);
  }

  private sample(h: number) {
    let i = 0;
    while (i < KEYS_C.length - 2 && h >= KEYS_C[i + 1].h) i++;
    const a = KEYS_C[i], b = KEYS_C[i + 1];
    const t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
    return { a, b, t };
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    this.rain = damp(this.rain, this.rainTarget, 1.4, dt);
    this.wet = damp(this.wet, this.rainTarget, 0.35, dt);
    this.uniforms.uWet.value = this.wet;
    const h = ((this.hour % 24) + 24) % 24;
    const { a, b, t } = this.sample(h);
    const L = (k: 'sunI' | 'hemiI' | 'night' | 'envI' | 'bloom' | 'bloomT') => lerp(a[k], b[k], t);
    const rain = this.rain;
    this.night = L('night');
    this.dayness = (1 - this.night) * (1 - rain * 0.4);
    this.uniforms.uNight.value = clamp(this.night + rain * 0.18 * (1 - this.night) * 0.5);

    // sun / moon arc
    const hh = h < 5.4 ? h + 24 : h;
    let dir = new THREE.Vector3();
    if (hh <= 18.8) {
      const ang = ((hh - 5.4) / 13.4) * Math.PI;
      dir.set(-Math.cos(ang) * 1.0, Math.sin(ang) * 0.9 + 0.07, 0.34);
    } else {
      const ang = ((hh - 18.8) / 10.6) * Math.PI;
      dir.set(Math.cos(ang) * 0.9, Math.sin(ang) * 0.75 + 0.1, 0.5);
    }
    dir.normalize();
    this.sunDir.copy(dir);
    this.sun.position.copy(this.target).addScaledVector(dir, 150);
    this.sun.color.lerpColors(a.c.sun, b.c.sun, t);
    this.sunColor.copy(this.sun.color);
    this.sun.intensity = L('sunI') * (1 - rain * 0.8);
    this.hemi.color.lerpColors(a.c.hs, b.c.hs, t);
    this.hemi.groundColor.lerpColors(a.c.hg, b.c.hg, t);
    this.hemi.intensity = L('hemiI') * (1 + rain * 0.25);

    const grey = this._a.set('#5f6f7d').multiplyScalar(0.4 + 0.6 * (1 - this.night));
    const greyH = this._b.set('#8d9aa5').multiplyScalar(0.35 + 0.65 * (1 - this.night));
    const top = this.skyMat.uniforms.uTop.value as THREE.Color;
    const hor = this.skyMat.uniforms.uHor.value as THREE.Color;
    top.lerpColors(a.c.bt, b.c.bt, t).lerp(grey, rain * 0.7);
    hor.lerpColors(a.c.bh, b.c.bh, t).lerp(greyH, rain * 0.7);
    (this.fog.color as THREE.Color).lerpColors(a.c.fog, b.c.fog, t).lerp(greyH, rain * 0.5);
    this.fog.density = 0.0017 + rain * 0.0007;
    this.scene.environmentIntensity = L('envI') * (1 + rain * 0.35);
    this.bloom = L('bloom') * (1 + rain * 0.2);
    this.bloomThreshold = L('bloomT');

    (this.stars.material as THREE.PointsMaterial).opacity = clamp((this.night - 0.55) * 2.2) * (1 - rain);
    this.rainMat.uniforms.uAmount.value = rain;
    this.rainMesh.visible = rain > 0.02;
    this.rainMat.uniforms.uTint.value.set(this.night > 0.5 ? '#9fb2d8' : '#e4edf5');
  }
}
