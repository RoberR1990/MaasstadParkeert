// Shader patches for the shared building material:
//  - facade: procedural windows / curtain walls / light dots from the `fac`/`fa` vertex attributes
//  - intro:  the city "grows" from the middle when the title screen ends
import * as THREE from 'three';

type Uni = { uIntro: { value: number }; uNight: { value: number }; uTime: { value: number } };

const INTRO_FN = `
float introEase(float p){ float c = 1.9; return p <= 0.0 ? 0.0 : 1.0 + (c + 1.0) * pow(p - 1.0, 3.0) + c * pow(p - 1.0, 2.0); }
`;

const keys = new WeakMap<THREE.Material, string[]>();
function chain(mat: THREE.Material, key: string, fn: (shader: THREE.WebGLProgramParametersWithUniforms) => void) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => { prev?.call(mat, shader, r); fn(shader); };
  const list = keys.get(mat) ?? [];
  list.push(key);
  keys.set(mat, list);
  mat.customProgramCacheKey = () => (keys.get(mat) ?? []).join('+');
}

/** Adds the "city grows from the middle" intro to a standard/depth material. */
export function patchIntro(mat: THREE.Material, uni: Pick<Uni, 'uIntro' | 'uTime'>, mode: 'world' | 'inst', sway = false, centre: [number, number] = [0, 0], radius = 120) {
  chain(mat, `intro-${mode}-${sway}`, (shader) => {
    shader.uniforms.uIntro = uni.uIntro;
    shader.uniforms.uTime = uni.uTime;
    shader.vertexShader = 'uniform float uIntro;\nuniform float uTime;\n' + INTRO_FN + shader.vertexShader;
    const pos = mode === 'world' ? 'position.xz' : '(instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xz';
    const apply = mode === 'world'
      ? 'transformed.y = transformed.y * s;'
      : 'transformed *= s;' + (sway ? ' transformed.x += sin(uTime * 1.3 + (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).x * 0.7) * 0.03 * transformed.y;' : '');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       { float id = length(${pos} - vec2(${centre[0].toFixed(1)}, ${centre[1].toFixed(1)})) / ${radius.toFixed(1)};
         float p = clamp((uIntro * 1.7 - id) * 2.4, 0.0, 1.0);
         float s = introEase(p);
         ${apply} }`,
    );
  });
}

/** Procedural facades (windows etc.). Needs `fac` + `fa` attributes on the geometry. */
export function patchFacade(mat: THREE.MeshStandardMaterial, uni: Pick<Uni, 'uNight' | 'uTime'>) {
  chain(mat, 'facade', (shader) => {
    shader.uniforms.uNight = uni.uNight;
    shader.uniforms.uTime = uni.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 fac; attribute vec4 fa;
        varying vec4 vFac; varying vec4 vFa; varying vec3 vFW; varying vec3 vFN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFac = fac; vFa = fa;
        vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac; varying vec4 vFa; varying vec3 vFW; varying vec3 vFN;
        uniform float uNight; uniform float uTime;
        float gLit; float gGlass; vec3 gEm;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float box(vec2 f, vec2 lo, vec2 hi){ return step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gLit = 0.0; gGlass = 0.0; gEm = vec3(0.0);
        if (vFac.x > 0.5) {
          float nl = length(vFN.xz);
          if (nl > 0.5) {
            vec2 tg = vec2(vFN.z, -vFN.x) / nl;
            float u = dot(vFW.xz, tg) - vFa.x;
            float v = vFW.y - vFa.z;
            float cols = max(1.0, floor(vFa.y / vFac.y + 0.5));
            float rows = max(1.0, floor(vFa.w / vFac.z + 0.5));
            vec2 g = vec2(u / vFa.y * cols, v / vFa.w * rows);
            vec2 cell = clamp(floor(g), vec2(0.0), vec2(cols - 1.0, rows - 1.0));
            vec2 f = clamp(g - cell, 0.0, 1.0);
            // quantised so interpolation noise in the varyings can't leak into the per-cell hash (that caused sparkle)
            vec4 faq = floor(vFa * 4.0 + 0.5) / 4.0; vec2 nq = floor(vFN.xz * 4.0 + 0.5) / 4.0;
            float seed = mod(faq.x * 3.17 + faq.z * 1.91 + nq.x * 7.0 + nq.y * 5.0, 23.0);
            float h = fh(cell + seed);
            float h2 = fh(cell * 1.7 + seed + 3.3);
            int p = int(vFac.x + 0.5);
            vec3 base = diffuseColor.rgb;
            vec3 glassDay = vec3(0.17, 0.25, 0.34);
            vec3 col = base;
            float lit = 0.0;
            if (p == 1) {
              // punched windows in brick: mortar courses, white reveal, door on the ground floor
              col *= 1.0 - 0.07 * step(0.86, fract(v * 3.4));
              float ground = step(cell.y, 0.5) * step(1.5, rows);
              float doorCol = floor(fh(vec2(seed, 1.3)) * cols);
              float isDoor = ground * step(abs(cell.x - doorCol), 0.5);
              float win = box(f, vec2(0.2, ground > 0.5 ? 0.34 : 0.22), vec2(0.8, ground > 0.5 ? 0.86 : 0.84));
              float frame = box(f, vec2(0.15, ground > 0.5 ? 0.30 : 0.18), vec2(0.85, ground > 0.5 ? 0.9 : 0.89));
              col = mix(col, vec3(0.93, 0.9, 0.82) * (0.55 + 0.45 * smoothstep(0.0, 1.0, base.r + 0.6)), frame);
              col = mix(col, glassDay * (0.8 + 0.5 * f.y * h2), win);
              col = mix(col, vec3(0.24, 0.30, 0.30), isDoor * box(f, vec2(0.25, 0.0), vec2(0.75, 0.74)));
              float dwin = isDoor * box(f, vec2(0.32, 0.4), vec2(0.68, 0.68));
              col = mix(col, glassDay, dwin);
              lit = max(win * (1.0 - isDoor), dwin) * step(h, vFac.w);
              gGlass = win * (1.0 - isDoor);
            } else if (p == 2) {
              // curtain wall: tinted glass, mullions, spandrel
              float span = step(f.y, 0.2);
              float mull = max(step(f.x, 0.07), step(0.93, f.x));
              float shade = 0.78 + 0.5 * h2 + 0.25 * smoothstep(0.0, 1.0, (v) / max(vFa.w, 1.0));
              col = base * shade;
              col = mix(col, base * 1.25 + 0.05, span);
              col = mix(col, base * 0.55, mull * (1.0 - span * 0.5));
              lit = (1.0 - span) * (1.0 - mull) * step(h, vFac.w);
              gGlass = (1.0 - span) * (1.0 - mull);
            } else if (p == 3) {
              // slab block: ribbon windows with balcony band
              float win = box(f, vec2(0.08, 0.34), vec2(0.92, 0.80));
              float band = box(f, vec2(0.0, 0.0), vec2(1.0, 0.26));
              float pil = max(step(f.x, 0.06), step(0.94, f.x));
              col = mix(col, vec3(0.93, 0.92, 0.88), band);
              col = mix(col, glassDay * (0.8 + 0.5 * f.y), win);
              col = mix(col, base * 0.92, pil * win);
              lit = win * (1.0 - pil) * step(h, vFac.w);
              gGlass = win;
            } else if (p == 4) {
              // dark panel with a regular grid of light dots
              vec2 c = f - 0.5;
              float d = length(c);
              float dotm = smoothstep(0.30, 0.22, d);
              float tw = 0.6 + 0.4 * sin(uTime * (0.8 + h * 2.0) + h * 40.0);
              col = base * 0.9;
              vec3 dc = mix(vec3(1.0, 0.78, 0.45), vec3(0.7, 0.9, 1.0), step(0.7, h2));
              col = mix(col, dc * 1.2, dotm * 0.7);
              gEm = dc * dotm * tw * (0.35 + 1.5 * uNight);
            } else if (p == 5 || p == 7) {
              // tall (optionally arched) windows
              float cx = abs(f.x - 0.5);
              float inb = step(cx, 0.22) * step(0.12, f.y) * step(f.y, 0.78);
              float arch = 0.0;
              if (p == 7) {
                float ay = (f.y - 0.62) / 0.2;
                arch = step(cx * cx / 0.0484 + ay * ay, 1.0) * step(0.62, f.y);
                inb = step(cx, 0.22) * step(0.12, f.y) * step(f.y, 0.62) ;
              }
              float win = max(inb, arch);
              float fr = step(cx, 0.28) * step(0.08, f.y) * step(f.y, p == 7 ? 0.9 : 0.84);
              col = mix(col, base * 0.82, fr);
              col = mix(col, glassDay * (0.8 + 0.5 * f.y), win);
              lit = win * step(h, vFac.w);
              gGlass = win;
            } else if (p == 8) {
              // light aluminium frame grid with big dark glass panes (De Rotterdam)
              float win = box(f, vec2(0.1, 0.1), vec2(0.9, 0.9));
              col = mix(base * 1.05, glassDay * (0.75 + 0.55 * f.y * (0.6 + 0.4 * h2)), win);
              lit = win * step(h, vFac.w);
              gGlass = win;
            } else if (p == 6) {
              // shop front: big glass, mullions, warm light at night
              float win = box(f, vec2(0.04, 0.12), vec2(0.96, 0.84));
              float mull = step(abs(fract(g.x * 2.0) - 0.5), 0.03);
              col = mix(col, base * 0.6, 1.0 - step(0.9, f.y) * 0.0);
              col = mix(col, vec3(0.45, 0.55, 0.62) * (0.7 + 0.5 * f.y), win);
              col = mix(col, base * 0.6, mull * win);
              lit = win * (1.0 - mull) * step(h, 0.8);
              gGlass = win;
            }
            diffuseColor.rgb = col;
            gLit = lit;
            gEm += vec3(1.0, 0.72, 0.4) * lit * (0.55 + 0.5 * h2) * uNight * 1.9;
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.34, gGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEm;`);
  });
}
