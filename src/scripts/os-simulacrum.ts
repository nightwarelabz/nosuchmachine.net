/* Simulacrum — a fully procedurally generated artificial world.
 *
 * Nothing here is loaded, modelled, textured, or sampled: the
 * terrain, the sky and its weather, every tree, rock, crystal and
 * monolith is generated in code from a single seed, chunk by
 * chunk, endlessly around the walker — and the music is generated
 * from the same seed, so a world sounds like itself. WebGL renders
 * it; WebXR, where a browser offers it, puts the walker inside.
 * The seed is the world — same seed, same hills, same song,
 * forever (and per nest, like every Blacksite room's memory).
 *
 * v2, "the living world": a shader sky with procedural clouds,
 * a moon, and aurora at night; weather that turns (clear, mist,
 * rain, thunder); segmented water with shores, sun-glitter and
 * swimming; biomes; birds; drifting motes and fireflies; and a
 * full synthesized soundscape — generative score, wind, rain,
 * footsteps, crystal chimes — under the house's EMCON law.
 */

import { skey } from "./os-depth";
import { soundPrefs } from "./os-sound";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ---------------- deterministic noise ---------------- */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(private seed: number) {}
  private hash(ix: number, iz: number): number {
    let h = (ix * 374761393 + iz * 668265263 + this.seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  at(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = this.hash(ix, iz), b = this.hash(ix + 1, iz);
    const c = this.hash(ix, iz + 1), d = this.hash(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  fbm(x: number, z: number, oct: number): number {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * this.at(x * f, z * f); amp *= 0.5; f *= 2.03; }
    return v;
  }
}

/* ---------------- tiny mat4 ---------------- */

export type M4 = Float32Array;
export const m4 = {
  ident(): M4 { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  persp(fov: number, asp: number, near: number, far: number): M4 {
    const t = 1 / Math.tan(fov / 2), d = 1 / (near - far);
    return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) * d, -1, 0, 0, 2 * far * near * d, 0]);
  },
  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  trans(x: number, y: number, z: number): M4 {
    const m = m4.ident(); m[12] = x; m[13] = y; m[14] = z; return m;
  },
  rotX(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotY(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  },
  ortho(l: number, r: number, b: number, t: number, n: number, f: number): M4 {
    return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  },
  lookAt(eye: [number, number, number], ctr: [number, number, number], up: [number, number, number]): M4 {
    let zx = eye[0] - ctr[0], zy = eye[1] - ctr[1], zz = eye[2] - ctr[2];
    const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
  },
  rotZ(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
};

/* ---------------- shaders ---------------- */

export const LIT_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aNor;
uniform mat4 uMVP; uniform mat4 uModel; uniform vec2 uCam;
varying vec3 vCol; varying vec3 vNor; varying float vDist; varying float vWY; varying vec3 vWP;
void main() {
  vCol = aCol;
  vNor = mat3(uModel) * aNor;
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWP = wp.xyz;
  vWY = wp.y;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = distance(wp.xz, uCam);
}`;
export const LIT_FS = `
precision mediump float;
varying vec3 vCol; varying vec3 vNor; varying float vDist; varying float vWY; varying vec3 vWP;
uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uTint;
uniform vec3 uCamPos; uniform vec3 uRim; uniform float uTime; uniform vec3 uSeason;
uniform sampler2D uShadowMap; uniform mat4 uShadowVP; uniform float uShadowAmt; uniform float uShadowTexel;
float dhash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float dnoise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dhash(i), dhash(i + vec2(1, 0)), u.x), mix(dhash(i + vec2(0, 1)), dhash(i + vec2(1, 1)), u.x), u.y);
}
vec3 grade(vec3 c, float amt) {
  vec3 a = c * (c * 2.51 + 0.03) / (c * (c * 2.43 + 0.59) + 0.14);
  return mix(c, clamp(a, 0.0, 1.0), amt);
}
float unpackDepth(vec4 v) {
  const vec4 shift = vec4(1.0, 1.0 / 256.0, 1.0 / 65536.0, 1.0 / 16777216.0);
  return dot(v, shift);
}
void main() {
  vec3 n = normalize(vNor);
  vec3 sunN = normalize(uSun);
  /* wrap diffuse: light bends a little way around forms */
  float dif = clamp((dot(n, sunN) + 0.85) / 1.85, 0.0, 1.0);
  float li = 0.24 + 0.76 * pow(dif, 1.5);
  float hemi = 0.78 + 0.22 * n.y;
  vec3 c = vCol * li * hemi * uTint;
  /* the sun's shadow, sampled soft */
  if (uShadowAmt > 0.003) {
    vec4 sc4 = uShadowVP * vec4(vWP + n * 1.4, 1.0);
    if (sc4.w > 0.0) {
      vec3 ndc = sc4.xyz / sc4.w;
      if (abs(ndc.x) < 0.995 && abs(ndc.y) < 0.995 && ndc.z < 1.0) {
        vec2 uv = ndc.xy * 0.5 + 0.5;
        float cur = ndc.z * 0.5 + 0.5 - 0.0028;
        float texel = uShadowTexel;
        float occ = 0.0;
        occ += cur > unpackDepth(texture2D(uShadowMap, uv + vec2(-texel, -texel))) ? 1.0 : 0.0;
        occ += cur > unpackDepth(texture2D(uShadowMap, uv + vec2(texel, -texel))) ? 1.0 : 0.0;
        occ += cur > unpackDepth(texture2D(uShadowMap, uv + vec2(-texel, texel))) ? 1.0 : 0.0;
        occ += cur > unpackDepth(texture2D(uShadowMap, uv + vec2(texel, texel))) ? 1.0 : 0.0;
        c *= 1.0 - (occ / 4.0) * uShadowAmt * clamp(li * 1.4, 0.0, 1.0);
      }
    }
  }
  /* rim: the sky catches the edges of things */
  vec3 vdir = normalize(uCamPos - vWP);
  float rim = pow(1.0 - max(dot(n, vdir), 0.0), 3.0);
  c += uRim * rim * 0.5;
  /* the waterline keeps its memory: wet land darkens and deepens */
  float wet = smoothstep(1.1, 0.15, vWY);
  c *= 1.0 - wet * 0.22;
  c = mix(c, c * vec3(0.85, 1.02, 1.05), wet * 0.5);
  /* strata in the steep places */
  float steep = 1.0 - smoothstep(0.55, 0.8, n.y);
  c *= 1.0 + steep * 0.10 * sin(vWY * 2.7);
  /* micro-detail: the ground only resolves when you walk up to
     it — grain, speckle, and a rare dew glint, all distance-faded
     so the far field never shimmers */
  float dNear = 1.0 - smoothstep(16.0, 60.0, vDist);
  if (dNear > 0.01) {
    vec2 dp = vWP.xz;
    float grain = dnoise(dp * 2.4) * 0.6 + dnoise(dp * 8.5) * 0.4;
    c *= 1.0 + (grain - 0.5) * 0.38 * dNear;
    float speck = dnoise(dp * 21.0 + 40.0);
    c *= 1.0 + (speck - 0.5) * 0.22 * dNear;
    float dew = step(0.965, dnoise(dp * 15.0 + 90.0)) * (0.5 + 0.5 * sin(uTime * 1.7 + dp.x * 2.0 + dp.y * 1.3));
    c += vec3(0.55, 0.62, 0.60) * dew * dNear * 0.35;
  }
  /* the turning year, written on the land: foliage goes amber
     in autumn and brightens in spring; snow takes the high,
     flat ground as the cold deepens */
  float fol = smoothstep(0.02, 0.10, c.g - max(c.r, c.b) * 0.92) * step(0.03, c.g);
  float hueVar = dnoise(vWP.xz * 0.045);
  vec3 amber = mix(vec3(0.88, 0.47, 0.09), vec3(0.72, 0.20, 0.10), hueVar) * (0.4 + 0.6 * (c.g + 0.2));
  c = mix(c, amber, fol * uSeason.y);
  c = mix(c, c * vec3(1.07, 1.03, 0.88) + vec3(0.015), fol * uSeason.z * 0.45);
  float snow = uSeason.x * smoothstep(1.2, 7.5, vWY + (dnoise(vWP.xz * 0.33) - 0.5) * 7.0) * smoothstep(0.42, 0.72, n.y);
  c = mix(c, vec3(0.90, 0.93, 0.99), clamp(snow, 0.0, 1.0) * 0.92);
  c = grade(c, 0.55);
  /* height fog: the low places fill first */
  float f = smoothstep(uFogNear, uFogFar, vDist);
  f = clamp(f * mix(1.5, 0.72, smoothstep(-3.0, 30.0, vWY)), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}
`;
export const UNLIT_VS = `
attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uMVP; uniform vec3 uOrigin; uniform vec2 uCam;
varying vec3 vCol; varying float vDist;
void main() { vCol = aCol; gl_Position = uMVP * vec4(aPos, 1.0); vDist = distance(aPos.xz + uOrigin.xz, uCam); }`;
export const UNLIT_FS = `
precision mediump float;
varying vec3 vCol; varying float vDist;
uniform float uAlpha; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
void main() {
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(vCol, uFog, f), uAlpha);
}`;
export const SKY_VS = `
attribute vec3 aPos;
uniform mat4 uVP;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uVP * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
export const SKY_FS = `
precision mediump float;
varying vec3 vDir;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
uniform float uTime; uniform float uCover; uniform float uGloom; uniform float uFlash; uniform vec3 uMoonDir; uniform float uAurora;
uniform float uSecond;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.13; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.12, 1.0);
  vec3 c = mix(uHor, uZen, pow(max(h, 0.0), 0.62));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 600.0) * 1.6 + pow(s, 18.0) * 0.28);
  if (uSecond > 0.01) {
    vec3 sd2v = normalize(uSunDir);
    vec3 s2v = normalize(vec3(-sd2v.x, abs(sd2v.y) * 0.9 + 0.10, -sd2v.z));
    float s2 = max(dot(d, s2v), 0.0);
    c += vec3(0.85, 0.88, 0.95) * (pow(s2, 700.0) * 1.9 + pow(s2, 18.0) * 0.10) * uSecond;
  }
  float md = max(dot(d, normalize(uMoonDir)), 0.0);
  c += vec3(0.82, 0.88, 1.0) * (pow(md, 900.0) * 1.35 + pow(md, 60.0) * 0.05 + pow(md, 8.0) * 0.045) * uNight;
  if (uNight > 0.02 && d.y > 0.0) {
    /* stars are points, not cells: a lit cell shows a small round
       star at its heart, and the whole field bows out at the
       zenith, where this projection stretches cells into squares */
    vec2 sp = d.xz / max(0.035, d.y) * 14.0;
    vec2 cell = floor(sp);
    vec2 cf = fract(sp) - 0.5;
    float on = step(0.9975, hash21(cell));
    float disc = smoothstep(0.42, 0.08, length(cf));
    float poleFade = 1.0 - smoothstep(0.88, 0.99, d.y);
    vec3 starCol = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.88, 0.72), hash21(cell + 3.0));
    c += starCol * on * disc * poleFade * uNight * (0.55 + 0.45 * sin(uNight * 40.0 + hash21(cell + 7.0) * 20.0));
  }
  if (uNight > 0.05 && d.y > -0.05) {
    /* the galactic band: a faint nebula river across the night —
       sampled on the direction's own circle, so there is no
       azimuth seam, and faded at the zenith, where it used to
       gather into a pinwheel */
    float gb = exp(-pow((d.y - 0.30) * 2.0, 2.0));
    vec2 nb = d.xz / max(0.22, length(d.xz));
    float neb = fbm2(nb * 2.3 + vec2(0.0, d.y * 7.0));
    vec3 nebCol = mix(vec3(0.16, 0.08, 0.30), vec3(0.05, 0.25, 0.30), neb);
    float nebFade = 1.0 - smoothstep(0.80, 0.96, d.y);
    c += nebCol * gb * smoothstep(0.45, 0.85, neb) * uNight * 0.5 * nebFade;
  }
  if (uNight > 0.25 && d.y > 0.03) {
    float band = exp(-pow((d.y - 0.40) * 3.1, 2.0));
    float curt = fbm2(vec2(d.x * 4.0 + uTime * 0.045, d.z * 2.0 - uTime * 0.02));
    float rays = 0.5 + 0.5 * sin(d.x * 22.0 + curt * 14.0 + uTime * 0.5);
    vec3 aur = mix(vec3(0.10, 0.95, 0.45), vec3(0.45, 0.25, 0.95), clamp(d.y * 1.6 - 0.15 + 0.30 * sin(uTime * 0.05 + curt * 2.0), 0.0, 1.0));
    c += aur * band * (0.25 + 0.75 * curt) * rays * (uNight - 0.2) * 0.55 * uAurora;
  }
  if (d.y > 0.015) {
    vec2 cuv = d.xz / (d.y + 0.22);
    float cl = fbm2(cuv * 1.15 + vec2(uTime * 0.006, uTime * 0.0016));
    float cov = smoothstep(1.05 - uCover, 1.30 - uCover, cl) * smoothstep(0.015, 0.14, d.y) * (1.0 - smoothstep(0.88, 0.99, d.y));
    float sunAmt = pow(s, 3.0);
    vec3 cloudCol = mix(vec3(0.34, 0.38, 0.46), vec3(1.03, 1.0, 0.97), clamp(0.35 + sunAmt + (1.0 - uGloom) * 0.3, 0.0, 1.0));
    cloudCol *= (1.0 - uGloom * 0.45);
    c = mix(c, cloudCol, cov * 0.88);
    c += vec3(0.45, 0.48, 0.58) * uFlash * cov * 0.85;
  }
  c += vec3(0.55, 0.62, 0.85) * uFlash * (0.25 + 0.75 * (1.0 - max(h, 0.0)));
  /* god-rays: at a low sun the light comes in shafts */
  {
    vec3 sd0 = normalize(uSunDir);
    float lowSun = pow(clamp(1.0 - abs(sd0.y + 0.06), 0.0, 1.0), 6.0);
    vec2 dxz = normalize(d.xz + vec2(1e-5));
    vec2 sxz = normalize(sd0.xz + vec2(1e-5));
    float toward = pow(max(dot(dxz, sxz), 0.0), 3.0);
    float az = atan(d.z, d.x);
    float shafts = 0.5 + 0.5 * sin(az * 16.0 + fbm2(d.xz * 2.0) * 7.0);
    c += uSunCol * shafts * toward * lowSun * smoothstep(0.0, 0.16, d.y) * (1.0 - uNight) * 0.16;
  }
  /* the grade, and a breath of dither so gradients never band */
  c = mix(c, clamp(c * (c * 2.51 + 0.03) / (c * (c * 2.43 + 0.59) + 0.14), 0.0, 1.0), 0.38);
  c += (hash21(gl_FragCoord.xy * 0.713) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
export const SHADOW_VS = `
attribute vec3 aPos;
uniform mat4 uMVP; uniform mat4 uModel;
void main() { gl_Position = uMVP * uModel * vec4(aPos, 1.0); }`;
export const SHADOW_FS = `
precision mediump float;
vec4 packDepth(float d) {
  const vec4 shift = vec4(1.0, 256.0, 65536.0, 16777216.0);
  const vec4 mask = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  vec4 r = fract(d * shift);
  r -= r.xxyz * mask;
  return r;
}
void main() { gl_FragColor = packDepth(gl_FragCoord.z); }`;
export const WATER_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aAux;
uniform mat4 uMVP; uniform vec2 uCam;
varying vec3 vCol; varying float vAlpha; varying vec3 vWorld; varying float vDist; varying float vDepth;
void main() {
  vCol = aCol; vAlpha = aAux.x; vDepth = aAux.y;
  vWorld = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = distance(aPos.xz, uCam);
}`;
export const WATER_FS = `
precision mediump float;
varying vec3 vCol; varying float vAlpha; varying vec3 vWorld; varying float vDist; varying float vDepth;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uCamPos; uniform float uTime; uniform vec3 uHor; uniform float uCold;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uDay;
void main() {
  vec2 p = vWorld.xz;
  float w1 = sin(p.x * 0.55 + uTime * 1.1) + sin(p.y * 0.42 - uTime * 0.8);
  float w2 = sin((p.x + p.y) * 0.21 + uTime * 0.5);
  float w3 = sin(p.x * 2.35 - uTime * 2.3) * sin(p.y * 1.95 + uTime * 1.8);
  vec3 n = normalize(vec3(w1 * 0.06 + w2 * 0.03 + w3 * 0.045, 1.0, w1 * 0.04 - w2 * 0.05 + w3 * 0.035));
  vec3 view = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(view.y, 0.0), 2.0);
  vec3 c = mix(vCol, uHor, fres * 0.55);
  /* foam where the water is thin over the land */
  float foam = smoothstep(0.85, 0.12, vDepth) * (0.5 + 0.30 * sin(uTime * 1.35 + p.x * 1.6 + p.y * 1.25)) * step(0.03, vDepth);
  c = mix(c, vec3(0.90, 0.96, 1.0), clamp(foam, 0.0, 0.6));
  c = mix(c, vec3(0.80, 0.86, 0.94), uCold * 0.40);
  vec3 hv = normalize(normalize(uSun) + view);
  float spec = pow(max(dot(n, hv), 0.0), 260.0) * 2.3 + pow(max(dot(n, hv), 0.0), 36.0) * 0.16;
  c += uSunCol * spec * uDay * (1.0 + uCold * 1.6);
  c = mix(c, c * (c * 2.51 + 0.03) / (c * (c * 2.43 + 0.59) + 0.14), 0.45);
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFog, f), vAlpha);
}`;
export const PTS_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uTime; uniform float uFall; uniform vec3 uCam; uniform vec3 uBox;
uniform float uDrift; uniform float uTwinkle; uniform float uTint;
varying vec3 vCol; varying float vFade;
void main() {
  float ph = fract(aPos.x * 0.371 + aPos.y * 0.717 + aPos.z * 0.113);
  float ph2 = fract(ph * 7.31 + 0.17);
  vCol = mix(aCol, vec3(0.60, 0.48, 1.0), uTint * step(0.82, ph));
  vec3 p = uCam + mod(aPos - uCam, uBox) - uBox * 0.5;
  if (uFall != 0.0) {
    float fall = mod(uCam.y + 20.0 - aPos.y + uTime * uFall, uBox.y);
    p.y = uCam.y + 20.0 - fall;
    if (uFall > 0.0) p.x += fall * 0.22;
  }
  /* a gentle, doubled wander — no two lights keep the same path,
     and none of them keep a straight one */
  float w1 = uTime * (0.05 + ph * 0.05);
  float w2 = uTime * (0.13 + ph2 * 0.11);
  p += uDrift * vec3(
    sin(w1 * 6.28 + ph * 40.0) + 0.6 * sin(w2 * 6.28 + ph2 * 31.0),
    0.55 * sin(w1 * 4.9 + ph2 * 47.0) + 0.4 * sin(w2 * 5.7 + ph * 23.0),
    cos(w1 * 5.6 + ph2 * 36.0) + 0.6 * cos(w2 * 6.9 + ph * 29.0));
  vec4 mv = uVP * vec4(p, 1.0);
  gl_Position = mv;
  float dist = max(1.0, -mv.z);
  float big = step(0.93, ph);
  gl_PointSize = clamp(aSize * (1.0 + big * 1.7) * (120.0 / dist), 1.0, 9.0 + big * 8.0);
  float tw = mix(1.0, pow(0.5 + 0.5 * sin(uTime * (0.35 + ph2 * 0.8) + ph * 80.0), 3.0), uTwinkle);
  vFade = clamp(1.6 - dist / (uBox.x * 0.62), 0.0, 1.0) * (0.15 + 0.85 * tw);
}`;
export const PTS_FS = `
precision mediump float;
varying vec3 vCol; varying float vFade;
uniform float uAlpha;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.12, length(q));
  gl_FragColor = vec4(vCol, uAlpha * vFade * m);
}`;

/* ---------------- audio: the world's own voice ---------------- */

export class SimAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private gate = 1;
  private muted = false;
  private chordAt = 0;
  private chordIdx = 0;
  private pluckAt = 0;
  private started = false;
  private rnd: () => number;
  private chords: number[][] = [];
  private scale: number[] = [];
  private root = 110;

  constructor(seed: number) {
    this.rnd = mulberry32(seed ^ 0x51ab);
    const roots = [0, -4, 5, -2, 0, -4, -7, -2];
    const progLen = 4 + Math.floor(this.rnd() * 3);
    const start = Math.floor(this.rnd() * 4);
    for (let i = 0; i < progLen; i++) {
      const r = roots[(start + i) % roots.length];
      const minor = this.rnd() < 0.62;
      this.chords.push([r, r + (minor ? 3 : 4), r + 7, r + 14]);
    }
    this.scale = [0, 3, 5, 7, 10, 12, 15, 19];
    this.root = 110 * Math.pow(2, (Math.floor(this.rnd() * 5) - 2) / 12);
  }

  get live() { return this.started; }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6;
    this.muffle = c.createBiquadFilter();
    this.muffle.type = "lowpass"; this.muffle.frequency.value = 18000;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.muffle.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.62; this.musicBus.connect(this.muffle);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.9; this.ambBus.connect(this.muffle);
    const nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nbuf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; lp += 0.06 * (w - lp); nd[i] = lp * 2.4; }
    const wind = c.createBufferSource(); wind.buffer = nbuf; wind.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = "bandpass"; this.windFilter.frequency.value = 480; this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
    wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.ambBus);
    wind.start();
    const rain = c.createBufferSource(); rain.buffer = nbuf; rain.loop = true; rain.playbackRate.value = 1.7;
    const rf = c.createBiquadFilter(); rf.type = "highpass"; rf.frequency.value = 2400;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    rain.connect(rf); rf.connect(this.rainGain); this.rainGain.connect(this.ambBus);
    rain.start();
    /* the night drone: a sub breath under everything, fed in tick */
    const drone = c.createOscillator(); drone.type = "sine"; drone.frequency.value = this.root / 2;
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0;
    drone.connect(this.droneGain); this.droneGain.connect(this.ambBus);
    drone.start();
    this.chordAt = c.currentTime + 0.1;
    this.pluckAt = c.currentTime + 2.5;
    this.started = true;
    this.applyGain(0.8);
    void c.resume();
  }

  private applyGain(t = 0.2) {
    if (!this.ctx || !this.master) return;
    const prefs = soundPrefs();
    const target = (this.muted || prefs.enabled === false ? 0 : this.gate * prefs.volume) * (1 - this.hush * 0.94);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, t);
  }
  private hush = 0;
  setHush(v: number) { if (v !== this.hush) { this.hush = v; this.applyGain(0.5); } }
  private echoOn = false;
  setEcho(on: boolean) { this.echoOn = on; }
  murmur() {
    if (!this.ctx || !this.ambBus) return;
    let t0 = this.ctx.currentTime + 0.1;
    const syllables = 5 + Math.floor(this.rnd() * 4);
    for (let i = 0; i < syllables; i++) {
      this.noiseBurst(t0, 0.16 + this.rnd() * 0.14, 0.016, 420 + this.rnd() * 480, "bandpass", 7);
      t0 += 0.22 + this.rnd() * 0.3;
    }
  }
  bell() {
    if (!this.ctx || !this.ambBus) return;
    const t = this.ctx.currentTime;
    this.tone(this.ambBus, 98, t, 5.5, 0.20, "sine");
    this.tone(this.ambBus, 147.2, t, 4.2, 0.055, "sine");
    this.tone(this.ambBus, 196.5, t, 3.4, 0.04, "sine");
    this.tone(this.ambBus, 295, t, 2.2, 0.016, "sine");
  }
  kick() { if (this.ctx && this.ctx.state !== "running") void this.ctx.resume(); }
  setGate(g: number) { if (g !== this.gate) { this.gate = g; this.applyGain(0.4); } }
  setMuted(m: boolean) { this.muted = m; this.applyGain(0.1); }
  setUnderwater(u: boolean) {
    if (!this.ctx || !this.muffle) return;
    this.muffle.frequency.setTargetAtTime(u ? 640 : 18000, this.ctx.currentTime, 0.15);
  }
  setWeather(rainAmt: number, alt: number, t: number) {
    if (!this.ctx || !this.windGain || !this.rainGain || !this.windFilter) return;
    const ct = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.085 + Math.min(0.17, Math.max(0, alt) * 0.004) + rainAmt * 0.05, ct, 0.6);
    this.windFilter.frequency.setTargetAtTime(420 + Math.sin(t * 0.23) * 130 + Math.sin(t * 0.071) * 90, ct, 0.8);
    this.rainGain.gain.setTargetAtTime(rainAmt * 0.18, ct, 0.8);
  }

  private tone(dest: AudioNode, freq: number, t0: number, dur: number, peak: number, type: OscillatorType = "sine", glideTo?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  private sparse = 0;
  private droneGain: GainNode | null = null;
  private callAt = 0;
  setMood(sparse: number) { this.sparse = sparse; }
  tick(dayFrac: number) {
    if (!this.ctx || !this.musicBus) return;
    const c = this.ctx, now = c.currentTime;
    const dark = dayFrac < 0.25 || dayFrac > 0.8;
    if (now >= this.chordAt) {
      const chord = this.chords[this.chordIdx % this.chords.length];
      this.chordIdx++;
      const dur = 13;
      for (const semi of chord) {
        const f = this.root * Math.pow(2, semi / 12);
        this.tone(this.musicBus, f, now, dur, 0.052, "triangle");
        this.tone(this.musicBus, f * 1.003, now, dur, 0.036, "sine");
      }
      this.tone(this.musicBus, this.root * Math.pow(2, chord[0] / 12) / 2, now, dur, 0.055, "sine");
      this.chordAt = now + dur * 0.92;
    }
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(dark ? 0.030 : 0.006, now, 1.5);
    /* the call: something far off answers the world, rarely —
       three gliding tones and a breath, never explained */
    if (this.callAt === 0) this.callAt = now + 34 + this.rnd() * 60;
    if (now >= this.callAt) {
      this.callAt = now + 55 + this.rnd() * 85;
      if (this.rnd() < 0.8 && this.ambBus) {
        const base = this.root * 2 * Math.pow(2, this.scale[Math.floor(this.rnd() * 4)] / 12);
        let t0 = now + 0.05;
        for (let nI = 0; nI < 3; nI++) {
          const f0 = base * (1 + (this.rnd() - 0.5) * 0.06);
          this.tone(this.ambBus, f0, t0, 1.6 + this.rnd() * 0.9, 0.020, "sine", f0 * (1 + (this.rnd() - 0.5) * 0.22));
          t0 += 1.1 + this.rnd() * 0.9;
        }
        this.noiseBurst(now, 2.5, 0.006, 700, "bandpass", 0.7);
      }
    }
    if (now >= this.pluckAt) {
      if (this.rnd() < (dark ? 0.4 : 0.68) * (1 - this.sparse * 0.55)) {
        const chord = this.chords[(this.chordIdx + this.chords.length - 1) % this.chords.length];
        const base = chord[0];
        const note = this.scale[Math.floor(this.rnd() * this.scale.length)];
        const f = this.root * 2 * Math.pow(2, (base + note) / 12);
        this.tone(this.musicBus, f, now, 2.2, 0.085, "sine");
        this.tone(this.musicBus, f * 2, now, 2.2, 0.02, "sine");
      }
      this.pluckAt = now + 2.6 + this.rnd() * (dark ? 7 : 4.5) + this.sparse * 4.5;
    }
  }

  private noiseBurst(t0: number, dur: number, peak: number, freq: number, type: BiquadFilterType = "bandpass", q = 1) {
    if (!this.ctx || !this.ambBus) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(this.ambBus);
    src.start(t0);
  }
  private stepBuf: AudioBuffer | null = null;
  private footAlt = false;
  /** one shaped layer of a footfall: a shared noise buffer, one
      filter, an envelope that lands and lets go — no two steps are
      alike because the source offset, rate and gain all wander */
  private stepLayer(t0: number, out: AudioNode, dur: number, peak: number, freq: number, type: BiquadFilterType, q = 1, sweepTo = 0, rate = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.stepBuf) {
      this.stepBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.stepBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(); src.buffer = this.stepBuf; src.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0, this.rnd() * 0.6); src.stop(t0 + dur + 0.05);
  }
  /** the ground, heard: each surface has its own small instrument —
      snow crunches and creaks, rock ticks over a heel-thock, the
      worn ways thud, shores hiss, the shallows slosh and drip.
      Feet alternate; a jog lands harder than a walk. */
  footstep(surface: string, run = false, depth = 0) {
    if (!this.ctx || !this.ambBus) return;
    const c = this.ctx, t = c.currentTime;
    this.footAlt = !this.footAlt;
    const alt = this.footAlt ? 1 : -1;
    const jit = 0.92 + this.rnd() * 0.16;
    const vol = (run ? 1.22 : 1) * (0.93 + this.rnd() * 0.14);
    const once = (t0: number, mul: number) => {
      let out: AudioNode = this.ambBus!;
      if (typeof c.createStereoPanner === "function") {
        const p = c.createStereoPanner(); p.pan.value = alt * 0.16; p.connect(this.ambBus!); out = p;
      }
      const L = (dur: number, peak: number, freq: number, type: BiquadFilterType, q = 1, sweepTo = 0, delay = 0) =>
        this.stepLayer(t0 + delay, out, dur, peak * vol * mul, freq * jit, type, q, sweepTo ? sweepTo * jit : 0, jit);
      if (surface === "snow") { L(0.17, 0.20, 640, "lowpass", 0.7, 400); L(0.06, 0.045, 1750, "bandpass", 3.5, 0, 0.018); }
      else if (surface === "rock") { L(0.05, 0.23, 2350, "bandpass", 1.4); L(0.07, 0.13, 300, "lowpass", 0.7); }
      else if (surface === "dirt") { L(0.10, 0.18, 430, "lowpass", 0.7); L(0.045, 0.05, 1150, "bandpass", 1, 0, 0.008); }
      else if (surface === "sand") { L(0.10, 0.115, 3100, "bandpass", 0.55); L(0.06, 0.06, 480, "lowpass", 0.7); }
      else if (surface === "water") {
        const d = Math.max(0, Math.min(1, depth));
        L(0.20, 0.20 + d * 0.06, 820 - d * 180, "bandpass", 0.65, 980 - d * 200);
        L(0.08, 0.06, 2000, "bandpass", 1, 0, 0.07);
      }
      else { L(0.12, 0.135, 880, "bandpass", 0.75, 1060); L(0.06, 0.065, 300, "lowpass", 0.7); }
    };
    once(t, 1);
    if (this.echoOn) once(t + 0.42, 0.5);
  }
  splash(big = false) { if (this.ctx) this.noiseBurst(this.ctx.currentTime, big ? 0.5 : 0.3, 0.16, 1100, "bandpass", 0.6); }
  thud(v: number) { if (this.ctx && this.ambBus) { this.tone(this.ambBus, 68, this.ctx.currentTime, 0.22, Math.min(0.3, 0.08 + v * 0.02), "sine", 40); this.noiseBurst(this.ctx.currentTime, 0.1, 0.06, 300, "lowpass"); } }
  chime(pitchSeed: number) {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const semis = [0, 7, 12, 16, 19, 24];
    const f = 660 * Math.pow(2, semis[Math.abs(pitchSeed) % semis.length] / 12);
    this.tone(this.musicBus, f, t, 2.6, 0.075, "sine");
    this.tone(this.musicBus, f * 2.76, t, 1.4, 0.016, "sine");
    this.tone(this.musicBus, f * 5.4, t, 0.7, 0.008, "sine");
  }
  chirp() {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const f = 2400 + this.rnd() * 1400;
    this.tone(this.musicBus, f, t, 0.09, 0.032, "sine", f * 1.3);
    this.tone(this.musicBus, f * 1.1, t + 0.13, 0.07, 0.026, "sine", f * 1.45);
  }
  thunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 1.6, 0.30, 120, "lowpass");
    this.noiseBurst(t + 0.08, 2.4, 0.18, 70, "lowpass");
  }
  cast(kind: "shape" | "blink" | "storm" | "bloom" | "star" | "time") {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    if (kind === "shape") { this.tone(this.musicBus, 130, t, 0.7, 0.12, "sine", 65); this.noiseBurst(t, 0.4, 0.05, 240, "lowpass"); }
    if (kind === "blink") { this.tone(this.musicBus, 1800, t, 0.28, 0.05, "sine", 300); }
    if (kind === "storm") { this.thunder(); this.tone(this.musicBus, 55, t, 1.8, 0.16, "sine", 38); }
    if (kind === "bloom") { [0, 4, 7, 12].forEach((sm, i) => this.tone(this.musicBus!, this.root * 2 * Math.pow(2, sm / 12), t + i * 0.07, 1.1, 0.04, "sine")); }
    if (kind === "star") { this.tone(this.musicBus, 880, t, 1.6, 0.05, "sine"); this.tone(this.musicBus, 1318, t + 0.05, 1.6, 0.03, "sine"); }
    if (kind === "time") { this.tone(this.musicBus, 440, t, 0.9, 0.05, "sine", 1320); }
  }
  ui(kind: "take" | "world" | "toggle") {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    if (kind === "take") this.tone(this.musicBus, 520, t, 0.3, 0.09, "sine", 780);
    if (kind === "toggle") this.tone(this.musicBus, 840, t, 0.12, 0.055, "sine");
    if (kind === "world") for (let i = 0; i < 4; i++) this.tone(this.musicBus, this.root * Math.pow(2, this.scale[i] / 12) * 2, t + i * 0.09, 1.4, 0.08, "sine");
  }
  dispose() {
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.started = false;
  }
}

/* ---------------- the sub-consciousness ----------------
 * Beneath the world runs a small second mind — the Dreamer.
 * It is not an NPC and it never speaks in paragraphs: it PERCEIVES
 * the walker (pace, idleness, biome, the hour, the water) and it
 * ACTS on the only body it has — the world itself. It owns the
 * weather, leans the music, sends the birds to look, raises the
 * aurora, and once in a while shakes the stars loose. Its temper
 * is seeded like everything else here: some worlds dream serene,
 * some dream tempestuous, some are playful. Manual overrides from
 * the operator are respected — it yields, and waits. */

export interface Perception {
  speed: number; idleFor: number; biome: string; night: number;
  inWater: boolean; flying: boolean; chimes: number; explored: number; dayT: number;
}
export interface Intents {
  weather: Weather; aurora: number; attend: number; sparse: number; shower: boolean; strange: number;
  /** the strangeness: a kind, and its 0..1 envelope */
  anomaly: string; anomalyAmt: number;
  /** its current moral reading of the walker, -1..1 */
  judgment: number;
}

export class Dreamer {
  private rnd: () => number;
  private serenity: number; private tempest: number; private play: number;
  private weather: Weather = "clear";
  private holdFor = 50;
  private insistUntil = 0;
  private lastBiome = "";
  private idleActs = 0;
  private saidSwim = false;
  private aurora = 1;
  private attend = 0;
  private shower = false;
  private showerCool = 120;
  private strangeness = 0.3;
  private anomalyKind = "";
  private anomalyFrom = 0;
  private anomalyUntil = 0;
  private anomalyDur = 10;
  private nextAnomalyAt = 100;
  private stoneShown = false;
  private idleWhisperAt = 0;
  private whisperQ: string[] = [];
  private rapport = 0;
  private lean = 0;
  private humor = 0;
  private band = 0;
  private bandAt = -1e9;
  setLean(v: number) { this.lean = Math.max(-1, Math.min(1, v)); }
  /** a witnessed act moves its momentary humor; the ledger itself
      is kept by the world (and persists) — this is the weather of
      its opinion, the ledger is the climate */
  act(kind: string) {
    const table: Record<string, number> = {
      bloom: 0.30, rest: 0.10, crystal: 0.10, hushKept: 0.22, shapeUp: 0.05,
      shapeDown: -0.30, storm: -0.24, shapeBurst: -0.20, flee: -0.08,
    };
    this.humor = Math.max(-1.2, Math.min(1.2, this.humor + (table[kind] ?? 0)));
  }
  get judgment(): number { return Math.max(-1, Math.min(1, this.lean * 0.55 + this.humor * 0.65)); }
  intents: Intents = { weather: "clear", aurora: 1, attend: 0, sparse: 0, shower: false, anomaly: "", anomalyAmt: 0, judgment: 0, strange: 0.3 };

  constructor(seed: number, rapport = 0, lean = 0) {
    this.lean = Math.max(-1, Math.min(1, lean));
    this.rnd = mulberry32(seed ^ 0xd12e & 0xffffff);
    this.rapport = rapport;
    const a = this.rnd(), b = this.rnd(), c = this.rnd(), d = this.rnd();
    const tot = a + b + c;
    this.serenity = a / tot; this.tempest = b / tot; this.play = c / tot;
    /* every world is strange in its own measure: most are nearly
       mundane, a few are deeply haunted — rolled once, from the seed */
    this.strangeness = Math.pow(d, 1.6);
    this.nextAnomalyAt = 80 + this.rnd() * 120;
  }
  note(...lines: string[]) { this.say(...lines); }
  greet(remembered: boolean, name: string) {
    if (remembered) this.say(`it remembers you — ${name} kept your shape`, `${name} again. it kept the light on`);
    else this.say(`this is ${name}. it is learning your step`);
  }
  insist(seconds: number, now: number) { this.insistUntil = now + seconds; }
  forceWeather(w: Weather) { this.weather = w; this.holdFor = 60; }
  drainWhispers(): string[] { const q = this.whisperQ; this.whisperQ = []; return q; }
  private say(...lines: string[]) { this.whisperQ.push(lines[Math.floor(this.rnd() * lines.length)]); }

  think(dt: number, now: number, p: Perception) {
    this.holdFor -= dt;
    this.showerCool -= dt;
    /* weather — its oldest prerogative */
    if (now > this.insistUntil && this.holdFor <= 0) {
      const r = this.rnd();
      const rainLine = 0.16 + this.tempest * 0.30 - this.serenity * 0.08 - this.rapport * 0.05 - this.judgment * 0.055;
      const mistLine = rainLine + 0.22 + this.serenity * 0.10;
      const next: Weather = r < rainLine ? "rain" : r < mistLine ? "mist" : "clear";
      if (next !== this.weather) {
        this.weather = next;
        if (next === "rain") this.say("it decides on rain", "the sky is told to open", "it wants weather");
        if (next === "mist") this.say("it pulls the fog closer", "a hush is arranged");
        if (next === "clear") this.say("the world exhales", "it clears its throat of clouds");
      }
      this.holdFor = 45 + this.rnd() * 65;
    }
    /* the idle walker is interesting — and it keeps remarking on
       the stillness while the stillness lasts */
    if (p.idleFor > 22) {
      this.attend = 1;
      if (now >= this.idleWhisperAt) {
        this.idleWhisperAt = now + 24 + this.rnd() * 14;
        this.say("it watches you rest", "stillness is noticed", "it wonders at the pause", "the birds have come to look at you", "it keeps the weather off you, for now", "it has sent the birds to count you", "even the trees lean to look", "somewhere, it is telling the hills about you");
      }
    } else if (p.idleFor < 2) { this.attend = Math.max(0, this.attend - dt * 0.2); }
    else this.attend = Math.max(0, this.attend - dt * 0.05);
    /* new country is noticed */
    if (p.biome !== this.lastBiome) {
      if (this.lastBiome && this.rnd() < 0.3) this.say(`it takes note: ${p.biome}`);
      this.lastBiome = p.biome;
    }
    /* swimming, learned once */
    if (p.inWater && !this.saidSwim) { this.saidSwim = true; this.say("it learns that you swim"); }
    /* night work: aurora lean + sparser music + the odd shower */
    const night = p.night;
    const auroraTarget = night > 0.5 ? 0.7 + this.serenity * 1.5 + this.play * 0.4 + this.rapport * 0.6 + this.judgment * 0.3 : 1;
    this.aurora += (auroraTarget - this.aurora) * Math.min(1, dt * 0.1);
    if (night > 0.6 && this.showerCool <= 0 && this.rnd() < dt * 0.01 * (0.5 + this.play)) {
      this.shower = true; this.showerCool = 150 + this.rnd() * 200;
      this.say("it shakes the stars loose");
      window.setTimeout(() => { this.shower = false; }, 9000);
    }
    const sparse = Math.max(0, Math.min(1, night * 0.7 + (p.idleFor > 15 ? 0.3 : 0) - p.speed * 0.02));
    /* ---- the strangeness ----
       Rare, seeded, never announced. The Dreamer keeps the schedule:
       a mundane world may go many minutes untouched; a haunted one
       breathes wrong every little while. Night and trust both
       hasten it. */
    if (!this.anomalyKind && now >= this.nextAnomalyAt) {
      /* the visitor — one roll in three thousand (Chase's number,
         2026-10-24): something crosses the sky that is not a bird,
         not a star, and does not stop */
      if (this.rnd() < 1 / 3000) {
        this.anomalyKind = "visitor";
        this.anomalyFrom = now;
        this.anomalyDur = 48;
        this.anomalyUntil = now + 48;
        this.nextAnomalyAt = now + 48 + 300 + this.rnd() * 300;
        if (this.rnd() < 0.7) this.say("something crossed, and did not stop", "it was not a star. it was not a bird");
      } else {
      const j = this.judgment;
      const darkBoost = 1 + Math.max(0, -j) * 1.1, kindBoost = 1 + Math.max(0, j) * 0.8;
      const pool: Array<[string, number, number]> = [
        ["hush", 14, 3 * (1 + Math.abs(j) * 0.5)], ["stutter", 2.5, 2 * darkBoost], ["echo", 22, 2.5], ["chroma", 30, 2.5],
        ["glass", 20, 2 * kindBoost], ["rainup", 16, 2], ["bell", 3, 2.5 * (1 + Math.abs(j) * 0.4)],
        ["star", 30, night > 0.4 ? 3.5 * darkBoost : 0], ["procession", 40, night > 0.25 ? 3 * (1 + Math.abs(j) * 0.4) : 0],
        ["secondsun", 26, night < 0.45 ? 2.5 : 0], ["stone", 24, this.stoneShown ? 0 : 2 * darkBoost],
        ["stretch", 18, 1.8 * darkBoost], ["murmur", 9, 1.8],
      ];
      let tot = 0;
      for (const [, , w] of pool) tot += w;
      let roll = this.rnd() * tot, kind = "hush", dur = 10;
      for (const [k, d2, w] of pool) { roll -= w; if (roll <= 0) { kind = k; dur = d2; break; } }
      this.anomalyKind = kind;
      this.anomalyFrom = now;
      this.anomalyDur = dur;
      this.anomalyUntil = now + dur;
      if (kind === "stone") this.stoneShown = true;
      const gap = (640 - this.strangeness * 300) * (night > 0.5 ? 0.7 : 1) * (1 - this.rapport * 0.15) + this.rnd() * 380;
      this.nextAnomalyAt = now + dur + gap;
      if (this.rnd() < 0.55) {
        if (kind === "hush") this.say("it is listening", "hold still. it is listening");
        if (kind === "star") this.say("one of them moved", "that one is not fixed");
        if (kind === "procession") this.say("something crosses the far hill", "lights, where no road is");
        if (kind === "stutter") this.say("the day caught on something");
        if (kind === "rainup") this.say("the rain has forgotten how to fall");
        if (kind === "secondsun") this.say("there are two. there should not be two");
        if (kind === "echo") this.say("your steps come back wrong");
        if (kind === "chroma") this.say("the light is the wrong colour here");
        if (kind === "bell") this.say("a bell, from no tower");
        if (kind === "glass") this.say("the sea has gone to glass");
        if (kind === "stretch") this.say("the world is breathing in");
        if (kind === "murmur") this.say("something is saying your name, almost");
      }
      }
    }
    /* the account, and the crossing of it */
    this.humor *= Math.pow(0.5, dt / 240);
    const jNow = this.judgment;
    const bandNow = jNow > 0.45 ? 1 : jNow < -0.45 ? -1 : 0;
    if (bandNow !== this.band && bandNow !== 0 && now - this.bandAt > 900) {
      this.bandAt = now;
      if (bandNow > 0) this.say("it has weighed your hands, and found them gentle", "it trusts your hands");
      else this.say("it has weighed your hands.", "the account is kept");
    }
    this.band = bandNow;
    let anAmt = 0;
    if (this.anomalyKind) {
      const into = now - this.anomalyFrom, left = this.anomalyUntil - now;
      anAmt = Math.max(0, Math.min(1, into / 2.2, left / 3));
      if (left <= 0) this.anomalyKind = "";
    }
    this.intents = { weather: this.weather, aurora: this.aurora, attend: this.attend, sparse, shower: this.shower, anomaly: this.anomalyKind, anomalyAmt: anAmt, judgment: this.judgment, strange: this.strangeness };
  }
}

/** Forge the world's name from its seed — two or three syllables,
 * always the same name for the same world. */
export function worldName(seed: number): string {
  const rnd = mulberry32(seed ^ 0x9a4e & 0xffffff);
  const on = ["vel", "thren", "os", "ka", "mi", "ru", "ae", "th", "or", "en", "sil", "var", "un", "ek", "ilo", "ash"];
  const mid = ["m", "r", "th", "l", "n", "v", "s", ""];
  const en = ["ora", "os", "ia", "une", "ath", "ire", "ek", "om"];
  const pick = (a: string[]) => a[Math.floor(rnd() * a.length)];
  const raw = pick(on) + pick(mid) + (rnd() < 0.45 ? pick(on) + pick(en) : pick(en));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/* ---------------- UNDERTOW ----------------
 * The physics of the simulacrum, named once and kept honestly:
 * a fixed-substep integrator for loose matter — gravity, slope
 * slide, buoyancy against the swell, drag, walker impulses, sleep —
 * and a small particle pool for splashes, petals, dust and the
 * blink's violet hush. Nothing floats that should sink; nothing
 * sinks that should float. */
export interface TowBody {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  r: number; kind: number; buoy: number; asleep: boolean; wet: boolean; calm: number;
}
interface TowPart {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; grav: number; drag: number;
  r: number; g: number; b: number; size: number;
}
export class Undertow {
  bodies: TowBody[] = [];
  private parts: TowPart[] = [];
  private acc = 0;
  constructor(private ground: (x: number, z: number) => number) {}
  swell(x: number, z: number, t: number): number {
    return Math.sin(x * 0.11 + t * 1.1) * 0.10 + Math.sin(z * 0.09 - t * 0.8) * 0.08;
  }
  windAt(x: number, z: number, t: number): [number, number] {
    return [
      (Math.sin(x * 0.013 + t * 0.11) + Math.sin(z * 0.019 - t * 0.07)) * 1.35,
      (Math.cos(z * 0.011 - t * 0.09) + Math.sin(x * 0.017 + t * 0.05)) * 1.35,
    ];
  }
  burst(x: number, y: number, z: number, o: { n?: number; col: [number, number, number]; spd?: number; up?: number; grav?: number; drag?: number; life?: number; size?: number; inward?: boolean }) {
    const n = o.n ?? 14;
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 480) this.parts.shift();
      const a = Math.random() * Math.PI * 2, rr = (o.spd ?? 2.2) * (0.3 + Math.random() * 0.7);
      const dir = o.inward ? -1 : 1;
      this.parts.push({
        x: x + Math.cos(a) * 0.3 * dir, y: y + Math.random() * 0.3, z: z + Math.sin(a) * 0.3 * dir,
        vx: Math.cos(a) * rr * dir, vy: (o.up ?? 2.4) * (0.4 + Math.random() * 0.8), vz: Math.sin(a) * rr * dir,
        life: 0, max: (o.life ?? 1.1) * (0.6 + Math.random() * 0.7), grav: o.grav ?? -9, drag: o.drag ?? 0.6,
        r: o.col[0], g: o.col[1], b: o.col[2], size: o.size ?? 2.2,
      });
    }
  }
  step(dt: number, t: number, walker: { x: number; z: number; vx: number; vz: number }, onSplash: (x: number, z: number, big: boolean) => void) {
    this.acc = Math.min(0.06, this.acc + dt);
    const H = 1 / 120;
    while (this.acc >= H) {
      this.acc -= H;
      this.integrate(H, t, walker, onSplash);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life += dt;
      if (q.life >= q.max) { this.parts.splice(i, 1); continue; }
      q.vy += q.grav * dt;
      const dr = 1 / (1 + q.drag * dt);
      q.vx *= dr; q.vy *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const gy = this.ground(q.x, q.z) + 0.06;
      if (q.y < gy) { q.y = gy; q.vy = 0; q.vx *= 0.9; q.vz *= 0.9; }
      if (q.y < 0.02 && this.ground(q.x, q.z) < -0.3) q.y = Math.max(q.y, this.swell(q.x, q.z, t));
    }
  }
  private integrate(h: number, t: number, walker: { x: number; z: number; vx: number; vz: number }, onSplash: (x: number, z: number, big: boolean) => void) {
    for (const b of this.bodies) {
      const dw = Math.hypot(b.x - walker.x, b.z - walker.z);
      if (b.asleep) {
        if (dw < b.r + 1.1 && Math.hypot(walker.vx, walker.vz) > 1.5) b.asleep = false;
        else continue;
      }
      b.vy -= 22 * h;
      const surfY = this.swell(b.x, b.z, t);
      const inWater = this.ground(b.x, b.z) < -0.25 && b.y - b.r < surfY + 0.05;
      if (inWater) {
        const sub = Math.max(0, Math.min(1.4, (surfY - (b.y - b.r)) / (2 * b.r + 0.001)));
        b.vy += 22 * sub * b.buoy * h;
        const dr = 1 / (1 + 2.4 * h);
        b.vx *= dr; b.vz *= dr; b.vy *= 1 / (1 + 1.6 * h);
        const [wx, wz] = this.windAt(b.x, b.z, t);
        b.vx += wx * 0.12 * h; b.vz += wz * 0.12 * h;
        if (!b.wet && b.vy < -2.5) onSplash(b.x, b.z, b.r > 0.45);
        b.wet = true;
      } else b.wet = false;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      const gy = this.ground(b.x, b.z) + b.r * 0.82;
      if (b.y < gy) {
        b.y = gy;
        if (b.vy < 0) b.vy = -b.vy * 0.22;
        const fr = 1 / (1 + 5 * h);
        b.vx *= fr; b.vz *= fr;
        const gx = (this.ground(b.x + 0.7, b.z) - this.ground(b.x - 0.7, b.z)) / 1.4;
        const gz = (this.ground(b.x, b.z + 0.7) - this.ground(b.x, b.z - 0.7)) / 1.4;
        if (gx * gx + gz * gz > 0.30) { b.vx -= gx * 7 * h; b.vz -= gz * 7 * h; }
      }
      if (dw < b.r + 0.95) {
        const dx = b.x - walker.x, dz = b.z - walker.z;
        const d = Math.max(0.2, Math.hypot(dx, dz));
        b.vx += (dx / d) * 2.4 * h * 8 + walker.vx * 0.35 * h * 8;
        b.vz += (dz / d) * 2.4 * h * 8 + walker.vz * 0.35 * h * 8;
        b.asleep = false; b.calm = 0;
      }
      const sp2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (sp2 < 0.003) { b.calm += h; if (b.calm > 0.8) { b.asleep = true; b.vx = b.vy = b.vz = 0; } }
      else b.calm = 0;
      if (dw > 150) {
        const a = Math.random() * Math.PI * 2, rr = 26 + Math.random() * 42;
        b.x = walker.x + Math.sin(a) * rr; b.z = walker.z + Math.cos(a) * rr;
        b.y = Math.max(this.ground(b.x, b.z), 0) + 1.2;
        b.vx = b.vy = b.vz = 0; b.asleep = true;
      }
    }
  }
  fillPoints(out: Float32Array): number {
    let n = 0;
    for (const q of this.parts) {
      const fade = 1 - q.life / q.max;
      const o = n * 7;
      out[o] = q.x; out[o + 1] = q.y; out[o + 2] = q.z;
      out[o + 3] = q.r; out[o + 4] = q.g; out[o + 5] = q.b;
      out[o + 6] = q.size * (0.5 + fade * 0.5);
      n++;
    }
    return n;
  }
  get partCount(): number { return this.parts.length; }
}

/* ---------------- the world ---------------- */

const CHUNK = 48, STEP = 2, RADIUS = 3;

interface Mesh { buf: WebGLBuffer; n: number }
interface XRSessionLike {
  requestReferenceSpace(t: string): Promise<unknown>;
  addEventListener(t: string, f: () => void): void;
  requestAnimationFrame(f: (t: number, fr: XRFrameLike) => void): void;
  renderState: { baseLayer: unknown };
  updateRenderState(s: object): Promise<void>;
}
interface XRFrameLike {
  getViewerPose(ref: unknown): { views: Array<{ projectionMatrix: Float32Array; transform: { inverse: { matrix: Float32Array } } }> } | null;
}
declare const XRWebGLLayer: new (s: XRSessionLike, gl: WebGLRenderingContext) => {
  framebuffer: WebGLFramebuffer | null;
  getViewport(v: unknown): { x: number; y: number; width: number; height: number } | null;
};

type Weather = "clear" | "mist" | "rain";


/* ————— a whisper of a network protocol —————
   The smallest honest MQTT client: CONNECT with a last will,
   SUBSCRIBE, PUBLISH QoS 0, PINGREQ. Enough for presence on a
   public broker, and nothing more. If it cannot connect, the
   world simply stays solo. */
export class MqttMini {
  connected = false;
  onMessage: (topic: string, payload: string) => void = () => { /* set by the world */ };
  onReady: () => void = () => { /* set by the world */ };
  onDown: () => void = () => { /* set by the world */ };
  private ws: WebSocket | null = null;
  private rx: number[] = [];
  private ping: number | null = null;
  private dead = false;
  constructor(private urls: string[], private clientId: string, private willTopic: string, private willPayload: string) {}
  private encStr(s: string): number[] {
    const u = new TextEncoder().encode(s);
    return [Math.floor(u.length / 256), u.length % 256, ...u];
  }
  private packet(head: number, body: number[]): Uint8Array<ArrayBuffer> {
    const out: number[] = [head];
    let n = body.length;
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0);
    return new Uint8Array([...out, ...body]) as Uint8Array<ArrayBuffer>;
  }
  connect() {
    if (this.ws || this.dead) return;
    const url = this.urls[0];
    let ws: WebSocket;
    try { ws = new WebSocket(url, ["mqtt"]); } catch { this.failover(); return; }
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      const body = [
        ...this.encStr("MQTT"), 4, 0x02 | 0x04 | 0x20, 0, 60,
        ...this.encStr(this.clientId), ...this.encStr(this.willTopic), ...this.encStr(this.willPayload),
      ];
      ws.send(this.packet(0x10, body));
    };
    ws.onmessage = (ev) => {
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      for (const b of bytes) this.rx.push(b);
      this.drain();
    };
    ws.onclose = () => { this.cleanup(); this.onDown(); };
    ws.onerror = () => { try { ws.close(); } catch { /* already gone */ } };
  }
  private failover() {
    this.urls.shift();
    this.ws = null;
    if (this.urls.length && !this.dead) this.connect();
    else this.onDown();
  }
  private cleanup() {
    this.connected = false;
    this.ws = null;
    if (this.ping !== null) { window.clearInterval(this.ping); this.ping = null; }
  }
  private drain() {
    for (;;) {
      if (this.rx.length < 2) return;
      let mult = 1, len = 0, i = 1, b = 0;
      do { if (i >= this.rx.length) return; b = this.rx[i++]; len += (b & 0x7f) * mult; mult *= 128; } while (b & 0x80);
      if (this.rx.length < i + len) return;
      const head = this.rx[0];
      const body = this.rx.slice(i, i + len);
      this.rx = this.rx.slice(i + len);
      const type = head >> 4;
      if (type === 2) {
        this.connected = true;
        this.ping = window.setInterval(() => { if (this.ws && this.connected) try { this.ws.send(this.packet(0xc0, [])); } catch { /* silent */ } }, 25000);
        this.onReady();
      } else if (type === 3) {
        let tlen = body[0] * 256 + body[1];
        const topic = new TextDecoder().decode(new Uint8Array(body.slice(2, 2 + tlen)));
        let off = 2 + tlen;
        if (((head >> 1) & 0x3) > 0) off += 2;
        const payload = new TextDecoder().decode(new Uint8Array(body.slice(off)));
        this.onMessage(topic, payload);
      }
    }
  }
  subscribe(topic: string) {
    if (!this.ws || !this.connected) return;
    this.ws.send(this.packet(0x82, [0, 7, ...this.encStr(topic), 0]));
  }
  publish(topic: string, payload: string, retain = false) {
    if (!this.ws || !this.connected) return;
    const body = [...this.encStr(topic), ...new TextEncoder().encode(payload)];
    try { this.ws.send(this.packet(0x30 | (retain ? 1 : 0), body)); } catch { /* gone mid-send */ }
  }
  close() {
    this.dead = true;
    if (this.ws) {
      try { this.ws.send(this.packet(0xe0, [])); } catch { /* already gone */ }
      try { this.ws.close(); } catch { /* already gone */ }
    }
    this.cleanup();
  }
}
export function buildSimulacrum(body: HTMLElement) {
  /* THE GIFTS REST (Chase, 2026-10-24): the player neither sees
     nor uses the gifts — the world is the gift. All gift logic
     stays whole below for testing; every player-facing door
     (keys, menu buttons, title line) checks this one flag. */
  const GIFTS_LIVE = false;
  const wrap = el("div", "os-sim");
  const canvas = document.createElement("canvas");
  canvas.className = "os-sim-canvas";
  canvas.width = 1024; canvas.height = 640;
  const shade = el("div", "os-sim-shade");
  const whisper = el("div", "os-sim-whisper", "");
  const titleScr = el("div", "os-sim-title");
  const titleName = el("div", "os-sim-title-name", "");
  const titleSub = el("div", "os-sim-title-sub", "");
  const titleMood = el("div", "os-sim-title-mood", "");
  const titleEnter = el("div", "os-sim-title-enter", "click to enter");
  const titleKeys = el("div", "os-sim-title-keys", "the opening · tab — starlight · 1 — blink · q — stormcall · x — bloom · b");
  titleScr.append(titleName, titleSub, titleMood, titleEnter);
  if (GIFTS_LIVE) titleScr.append(titleKeys);
  const opening = el("div", "os-sim-opening");
  const openingBar = el("div", "os-sim-opening-bar");
  const openingClose = el("button", "os-btn", "close the opening");
  openingBar.append(el("span", "os-note", "the opening — a whole machine, inside the world"), openingClose);
  const openingFrame = document.createElement("iframe");
  openingFrame.className = "os-sim-opening-frame";
  openingFrame.setAttribute("title", "the opening");
  opening.append(openingBar, openingFrame);
  opening.style.display = "none";
  const powers = el("div", "os-sim-powers");
  const uw = el("div", "os-sim-uw");
  const stage = el("div", "os-sim-stage");
  const hud = el("div", "os-sim-hud");
  const seedLabel = el("span", "os-note", "");
  const flyBtn = el("button", "os-btn", "walk");
  const sndBtn = el("button", "os-btn", "sound: on");
  const irisBtn = el("button", "os-btn", "iris: auto");
  const commonsBtn = el("button", "os-btn", "commons");
  commonsBtn.setAttribute("aria-pressed", "false");
  const photoBtn = el("button", "os-btn", "photo");
  const fsBtn = el("button", "os-btn", "fullscreen");
  const xrBtn = el("button", "os-btn", "enter VR");
  const posLabel = el("span", "os-note", "");
  hud.append(seedLabel, posLabel);
  const menuBtn = el("button", "os-btn os-sim-menubtn", "≡");
  menuBtn.setAttribute("aria-label", "menu");
  const menu = el("div", "os-sim-menu");
  const menuRow = el("div", "os-sim-menu-row");
  menuRow.append(flyBtn, sndBtn, irisBtn, commonsBtn, photoBtn, fsBtn, xrBtn);
  const menuKeys = el("div", "os-sim-menu-keys");
  menuKeys.append(
    el("div", "os-note", "move · w a s d — look · mouse — jump · space — sink · c"),
    el("div", "os-note", "swift · shift — fly · f — plant · e — menu · m"),
  );
  const recordH = el("div", "os-sim-menu-h", "the record");
  const recordEl = el("div", "os-sim-record");
  if (GIFTS_LIVE) menu.append(menuRow, el("div", "os-sim-menu-h", "the gifts"), powers, recordH, recordEl, el("div", "os-sim-menu-h", "the keys"), menuKeys);
  else menu.append(menuRow, recordH, recordEl, el("div", "os-sim-menu-h", "the keys"), menuKeys);
  stage.append(canvas, shade, uw, whisper, opening, titleScr, hud, menuBtn, menu);
  /* the front door and the making: a start screen over an unmade
     world, and a loading veil for the one full making */
  const startScr = el("div", "os-sim-start");
  const startName = el("div", "os-sim-start-name", "simulacrum");
  const startSub = el("div", "os-sim-start-sub", "a generated world");
  const startWorld = el("div", "os-sim-start-world", "");
  const startBegin = el("button", "os-btn os-sim-start-begin", "begin");
  const startNote = el("div", "os-sim-start-note", "for now, the simulacrum is recommended only for Chrome browser");
  startScr.append(startName, startSub, startWorld, startBegin, startNote);
  const loadScr = el("div", "os-sim-load");
  const loadName = el("div", "os-sim-load-name", "");
  const loadPhase = el("div", "os-sim-load-phase", "raising the land");
  const loadBar = el("div", "os-sim-load-bar");
  const loadFill = el("div", "os-sim-load-fill");
  loadBar.append(loadFill);
  const loadPct = el("div", "os-sim-load-pct", "0%");
  loadScr.append(loadName, loadPhase, loadBar, loadPct);
  loadScr.style.display = "none";
  stage.append(startScr, loadScr);
  /* the full making happens once per warm spec + world; the seed is
     read straight from storage here because the world's own seed
     variable is not loaded until further down the construction */
  const WARM_SPEC = "2";
  let warmFullPending = true;
  try {
    const storedSeed = Number(localStorage.getItem(skey("simulacrum-seed")) || "0");
    warmFullPending = localStorage.getItem(skey("simulacrum-warm")) !== `${WARM_SPEC}:${storedSeed}`;
  } catch { warmFullPending = true; }
  if (warmFullPending) titleScr.classList.add("held");
  wrap.append(stage);
  wrap.classList.add("chrome-on");
  body.appendChild(wrap);

  const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true }) as WebGLRenderingContext | null;
  if (!gl) { titleName.textContent = "the simulacrum"; titleMood.textContent = "WebGL is not available in this browser — the simulacrum cannot form."; titleEnter.textContent = ""; titleKeys.textContent = ""; startBegin.style.display = "none"; startWorld.textContent = "WebGL is not available in this browser — the simulacrum cannot form."; return; }

  const program = (vs: string, fs: string) => {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    return pr;
  };
  const litPr = program(LIT_VS, LIT_FS);
  const unlitPr = program(UNLIT_VS, UNLIT_FS);
  const skyPr = program(SKY_VS, SKY_FS);
  const waterPr = program(WATER_VS, WATER_FS);
  const shadowPr = program(SHADOW_VS, SHADOW_FS);
  /* one shadow map for the sun, RGBA-packed depth (no extensions
     needed); rebuildable at any size because the Iris asks for
     different sizes on different machines */
  let shadowSize = 2048;
  let shadowTex: WebGLTexture | null = null;
  let shadowFBO: WebGLFramebuffer | null = null;
  let shadowRB: WebGLRenderbuffer | null = null;
  let shadowOK = false;
  const buildShadowTarget = (n: number) => {
    if (shadowTex) { gl.deleteTexture(shadowTex); gl.deleteFramebuffer(shadowFBO); gl.deleteRenderbuffer(shadowRB); }
    shadowSize = n;
    shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    shadowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
    shadowRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, shadowRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, n, n);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowRB);
    shadowOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  buildShadowTarget(2048);
  let lightVP: M4 = m4.ident();
  let shadowAmt = 0;
  let lastBodiesN = 0;
  const ptsPr = program(PTS_VS, PTS_FS);

  const makeMesh = (verts: Float32Array, dynamic = false): Mesh => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return { buf, n: verts.length / 9 };
  };
  const bindLit = (mesh: Mesh, model: M4) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const aPos = gl.getAttribLocation(litPr, "aPos");
    const aCol = gl.getAttribLocation(litPr, "aCol");
    const aNor = gl.getAttribLocation(litPr, "aNor");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 36, 24);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uModel"), false, model);
  };
  const bindUnlit = (mesh: Mesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const aPos = gl.getAttribLocation(unlitPr, "aPos");
    const aCol = gl.getAttribLocation(unlitPr, "aCol");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
  };

  /* ---- world state ---- */
  let seed = Number(localStorage.getItem(skey("simulacrum-seed")) || "0");
  if (!seed) {
    seed = 10000000 + Math.floor(Math.random() * 89999999);
    try { localStorage.setItem(skey("simulacrum-seed"), String(seed)); } catch { seed = 20261024; }
  }
  let noise = new Noise(seed);
  let moistNoise = new Noise(seed ^ 0x5eed);
  let detailNoise = new Noise(seed ^ 0xd37a);
  let mountNoise = new Noise(seed ^ 0x9a17);
  let forestNoise = new Noise(seed ^ 0xf023);
  const heightBase = (x: number, z: number): number => {
    const hills = noise.fbm(x * 0.012 + 31, z * 0.012 + 7, 4);
    const ridge = 1 - Math.abs(noise.fbm(x * 0.004 + 3, z * 0.004 + 19, 3) * 2 - 1);
    /* true ranges: a slow continental mask lifts whole districts
       into mountains — foothills first, then ridged peaks */
    const mRaw = mountNoise.fbm(x * 0.0016 + 57, z * 0.0016 + 21, 2);
    const mk = Math.max(0, Math.min(1, (mRaw - 0.56) / 0.2));
    const mount = mk * mk * (3 - 2 * mk);
    return -3.5 + hills * 13 + Math.pow(ridge, 3) * 15 + mount * (9 + Math.pow(ridge, 2) * 30);
  };
  /* Worldshaping: the walker's edits live in an overlay on a 2-unit
     grid, smoothed into the land, kept per world. The pure noise
     world is underneath, untouched — the gift is a layer on it. */
  let edits = new Map<string, number>();
  try {
    const raw = JSON.parse(localStorage.getItem(skey(`simulacrum-edits-${seed}`)) || "{}") as Record<string, number>;
    for (const k of Object.keys(raw)) edits.set(k, raw[k]);
  } catch { edits = new Map(); }
  const overlayAt = (x: number, z: number): number => {
    if (!edits.size) return 0;
    const gx = Math.round(x / 2), gz = Math.round(z / 2);
    let sum = 0, wsum = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const d = edits.get(`${gx + i},${gz + j}`);
      if (d === undefined) continue;
      const dist = Math.hypot(i * 2 - (x - gx * 2), j * 2 - (z - gz * 2));
      const w = Math.max(0, 1 - dist / 5.2);
      sum += d * w * w; wsum += w * w;
    }
    return wsum > 0 ? sum / Math.max(0.55, wsum) : 0;
  };
  const height = (x: number, z: number): number => heightBase(x, z) + overlayAt(x, z);
  const persistEdits = () => {
    try { localStorage.setItem(skey(`simulacrum-edits-${seed}`), JSON.stringify(Object.fromEntries(edits))); } catch { /* cap reached */ }
  };
  const moisture = (x: number, z: number) => moistNoise.fbm(x * 0.008 + 99, z * 0.008 + 3, 3);
  let wName = worldName(seed);
  /* the world's memory of the walker, kept per world */
  interface DreamRecord { visits: number; rapport: number; light: number; shadow: number; ts: number }
  const dreamRecord = (sd: number): DreamRecord => {
    let r: DreamRecord = { visits: 0, rapport: 0, light: 0, shadow: 0, ts: Date.now() };
    try {
      const raw = JSON.parse(localStorage.getItem(skey(`simulacrum-dream-${sd}`)) || "null");
      if (raw && typeof raw.visits === "number") r = { light: 0, shadow: 0, ts: Date.now(), ...raw };
    } catch { /* fresh */ }
    /* the account fades, slowly — a three-day half-life */
    const days = Math.max(0, (Date.now() - (r.ts || Date.now())) / 86400000);
    const fade = Math.pow(0.5, days / 3);
    r.light *= fade; r.shadow *= fade;
    return r;
  };
  const leanOf = (r: DreamRecord) => (r.light - r.shadow) / (6 + r.light + r.shadow);
  const persistRec = () => { rec.ts = Date.now(); try { localStorage.setItem(skey(`simulacrum-dream-${seed}`), JSON.stringify(rec)); } catch { /* private mode */ } };
  /* ---- the turning year (state hoisted: seasonMoods is read by
     setTitle, which refreshLabel runs during construction — the
     same TDZ that killed the full stack in PR #86's first drive) ---- */
  const seasonOf = (d: Date): { cold: number; autumn: number; spring: number } => {
    const start = new Date(d.getFullYear(), 0, 0);
    const doy = Math.floor((d.getTime() - start.getTime()) / 86400000);
    const t = (doy / 365.25) * Math.PI * 2;
    const coldRaw = 0.5 + 0.5 * Math.cos(t - 0.26);
    return {
      cold: Math.pow(Math.max(0, coldRaw), 1.5),
      autumn: Math.exp(-Math.pow((doy - 292) / 27, 2)),
      spring: Math.exp(-Math.pow((doy - 106) / 25, 2)),
    };
  };
  let seasonNow = seasonOf(new Date());
  const seasonMoods = (): string[] => {
    if (seasonNow.autumn > 0.55) return ["the year is turning", "it is gathering the leaves"];
    if (seasonNow.cold > 0.55) return ["the world is holding its breath", "snow is a kind of listening"];
    if (seasonNow.spring > 0.55) return ["everything is beginning again", "the ground remembers green"];
    if (seasonNow.cold < 0.2) return ["the long light", "the world, unhurried"];
    return [];
  };
  const moodLines = ["it is dreaming of you", "the weather is being decided", "something here is awake", "it has been waiting", "the account is open"];
  const setTitle = () => {
    titleName.textContent = wName;
    titleSub.textContent = `a simulacrum · seed ${seed}`;
    const sm = seasonMoods();
    titleMood.textContent = sm.length && Math.abs(seed) % 5 < 2 ? sm[Math.abs(seed) % sm.length] : moodLines[Math.abs(seed) % moodLines.length];
    titleEnter.textContent = `click to enter ${wName.toLowerCase()}`;
    startWorld.textContent = `${wName.toLowerCase()} · seed ${seed}`;
    loadName.textContent = wName;
  };
  /* the commons state is declared HERE, above the label that
     names it: refreshLabel runs during construction, long
     before the commons machinery further down exists */
  const HOME_SEED = seed;
  const COMMONS_SEED = 20261024;
  let inCommons = false;
  const peers = new Map<string, Peer>();
  const refreshLabel = () => {
    const lean = leanOf(rec);
    seedLabel.textContent = `seed ${seed} · ${wName}${rec.visits > 1 ? " · it remembers you" : ""}${lean > 0.45 ? " · it trusts you" : lean < -0.45 ? " · it is wary of you" : ""}${inCommons ? " · the commons" : ""}${peers.size ? ` · ${peers.size} other${peers.size === 1 ? "" : "s"} walking` : ""}`;
    setTitle();
  };
  let rec = dreamRecord(seed);
  rec.visits++;
  rec.rapport = Math.min(1, rec.rapport + 0.05);
  persistRec();
  refreshLabel();
  let audio = new SimAudio(seed);
  let dreamer = new Dreamer(seed, rec.rapport, leanOf(rec));
  let greeted = false;
  /* the witness: every act of consequence passes through here —
     the Dreamer's humor moves at once; the ledger moves for good */
  const witnessLog: number[] = [];
  const throttle = new Map<string, number>();
  const witness = (kind: string) => {
    dreamer.act(kind);
    const nowMs = Date.now();
    const slow: Record<string, number> = { rest: 60000, crystal: 90000, flee: 30000 };
    if (slow[kind]) {
      if ((throttle.get(kind) ?? 0) > nowMs) return;
      throttle.set(kind, nowMs + slow[kind]);
    }
    if (kind === "bloom") rec.light += 1.0;
    else if (kind === "rest") rec.light += 0.5;
    else if (kind === "crystal") rec.light += 0.4;
    else if (kind === "hushKept") rec.light += 0.8;
    else if (kind === "shapeUp") rec.light += 0.15;
    else if (kind === "shapeDown") rec.shadow += 0.9;
    else if (kind === "storm") rec.shadow += 0.7;
    else if (kind === "flee") rec.shadow += 0.25;
    else if (kind === "shapeBurst") rec.shadow += 0.5;
    persistRec();
    dreamer.setLean(leanOf(rec));
    refreshLabel();
  };

  interface Chunk { key: string; terrain: Mesh; lit: Mesh | null; glow: Mesh | null; crystals: Array<[number, number]>; solids: Array<{ x: number; z: number; r: number; top: number }> }
  const chunks = new Map<string, Chunk>();
  const keyOf = (cx: number, cz: number) => `${cx},${cz}`;

  const palette = (x: number, z: number, h: number, slope: number): [number, number, number] => {
    const m = moisture(x, z);
    const spk = 0.92 + 0.16 * detailNoise.at(x * 1.7, z * 1.7);
    let c: [number, number, number];
    if (h < -0.4) { const d = Math.min(1, -h / 7); c = [0.55 - d * 0.3, 0.50 - d * 0.22, 0.34 - d * 0.1]; }
    else if (h < 0.7) c = [0.80, 0.70, 0.47];
    else if (slope > 0.55) c = [0.40, 0.37, 0.42];
    else if (h > 25 && slope < 0.62) c = [0.90, 0.93, 0.97];
    else if (h > 12) c = [0.45, 0.42, 0.46];
    else {
      const dry: [number, number, number] = [0.44, 0.38, 0.20];
      const lush: [number, number, number] = [0.15, 0.36, 0.18];
      const k = Math.max(0, Math.min(1, (m - 0.28) * 2.6));
      c = [dry[0] + (lush[0] - dry[0]) * k, dry[1] + (lush[1] - dry[1]) * k, dry[2] + (lush[2] - dry[2]) * k];
    }
    /* the worn ways: dirt where the paths run (dry banks only —
       paths do not paint the snowfields or the shore) */
    if (h >= 0.7 && h < 10 && slope <= 0.55) {
      const pd = pathDist(x, z);
      if (pd < 2.3) {
        const pk = Math.max(0, 1 - pd / 2.3) * 0.62;
        const dirt: [number, number, number] = [0.48, 0.38, 0.24];
        c = [c[0] + (dirt[0] - c[0]) * pk, c[1] + (dirt[1] - c[1]) * pk, c[2] + (dirt[2] - c[2]) * pk];
      }
    }
    return [c[0] * spk, c[1] * spk, c[2] * spk];
  };

  /* ================================================================
     THE MODEL KIT (v8) — true shapes, not placeholders.
     Every model is a CLOSED solid built from triangles whose
     normals are computed from the geometry itself (no painted-on
     normals, no one-sided clips, no hollow shells). A flower is
     stem + petal ring + heart; a tree is trunk, branches, and
     clustered canopy volumes. The world is composed the way a
     hand-built game world is: landmarks first, zones with their
     own flora, paths worn through them — never uniform scatter.
     ================================================================ */
  type Col3 = [number, number, number];
  const tri = (a: number[], p: number[], q: number[], r: number[], col: Col3) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const il = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= il; ny *= il; nz *= il;
    a.push(...p, ...col, nx, ny, nz, ...q, ...col, nx, ny, nz, ...r, ...col, nx, ny, nz);
  };
  /* tapered prism, closed top and bottom; lean shifts the top ring */
  const prism = (a: number[], x: number, y: number, z: number, rb: number, rt: number, h: number, sides: number, col: Col3, leanX = 0, leanZ = 0, twist = 0) => {
    const ring = (rad: number, yy: number, ox: number, oz: number): number[][] => {
      const pts: number[][] = [];
      for (let k = 0; k < sides; k++) {
        const t = ((k / sides) * Math.PI * 2) + twist;
        pts.push([x + ox + Math.cos(t) * rad, yy, z + oz + Math.sin(t) * rad]);
      }
      return pts;
    };
    const bot = ring(rb, y, 0, 0), top = ring(rt, y + h, leanX, leanZ);
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      tri(a, bot[k], top[k], top[k2], col);
      tri(a, bot[k], top[k2], bot[k2], col);
      tri(a, [x, y, z], bot[k], bot[k2], col);
      tri(a, [x + leanX, y + h, z + leanZ], top[k2], top[k], col);
    }
  };
  /* octahedron — the faceted volume: rocks, shards, canopy, hearts */
  const octa = (a: number[], x: number, y: number, z: number, rx: number, ry: number, rz: number, col: Col3, twist = 0) => {
    const T: number[] = [x, y + ry, z], B: number[] = [x, y - ry, z];
    const E: number[][] = [];
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI * 2 + twist;
      E.push([x + Math.cos(t) * rx, y, z + Math.sin(t) * rz]);
    }
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      tri(a, E[k], T, E[k2], col);
      tri(a, E[k2], B, E[k], col);
    }
  };
  /* closed box, yaw-rotated — stones, lintels, ribs, books of stone */
  const boxS = (a: number[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: Col3, rotY = 0) => {
    const c = Math.cos(rotY), sn = Math.sin(rotY);
    const corner = (dx: number, dy: number, dz: number): number[] => [x + dx * c - dz * sn, y + dy, z + dx * sn + dz * c];
    const v = [
      corner(-sx / 2, 0, -sz / 2), corner(sx / 2, 0, -sz / 2), corner(sx / 2, 0, sz / 2), corner(-sx / 2, 0, sz / 2),
      corner(-sx / 2, sy, -sz / 2), corner(sx / 2, sy, -sz / 2), corner(sx / 2, sy, sz / 2), corner(-sx / 2, sy, sz / 2),
    ];
    const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of F) { tri(a, v[f[0]], v[f[1]], v[f[2]], col); tri(a, v[f[0]], v[f[2]], v[f[3]], col); }
  };
  const vary = (col: Col3, amt: number, rnd: () => number): Col3 => {
    const f = 1 + (rnd() - 0.5) * 2 * amt;
    return [Math.min(1, col[0] * f), Math.min(1, col[1] * f), Math.min(1, col[2] * f)];
  };

  /* ---- the flora, built as things ---- */
  const BARK: Col3 = [0.32, 0.22, 0.14];
  const treePine = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g = vary([0.16, 0.36, 0.20], 0.25, rnd);
    prism(a, x, y - 0.2, z, 0.30 * s, 0.17 * s, 3.4 * s, 6, vary(BARK, 0.2, rnd));
    prism(a, x, y + 2.0 * s, z, 2.35 * s, 0.02, 2.8 * s, 7, g, 0, 0, rnd() * 0.4);
    prism(a, x, y + 3.8 * s, z, 1.75 * s, 0.02, 2.4 * s, 7, vary(g, 0.15, rnd), 0, 0, rnd() * 0.4);
    prism(a, x, y + 5.4 * s, z, 1.1 * s, 0.02, 2.0 * s, 7, vary(g, 0.15, rnd), 0, 0, rnd() * 0.4);
  };
  const treeSpire = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g = vary([0.13, 0.30, 0.24], 0.22, rnd);
    prism(a, x, y - 0.2, z, 0.15 * s, 0.08 * s, 5.2 * s, 5, vary(BARK, 0.2, rnd));
    prism(a, x, y + 3.4 * s, z, 0.95 * s, 0.02, 7.6 * s, 6, g, 0, 0, rnd() * 0.3);
  };
  const treeBroad = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g = vary([0.24, 0.44, 0.18], 0.28, rnd);
    prism(a, x, y - 0.2, z, 0.42 * s, 0.24 * s, 3.1 * s, 7, vary(BARK, 0.2, rnd), (rnd() - 0.5) * 0.5 * s, (rnd() - 0.5) * 0.5 * s);
    const cxp = x + (rnd() - 0.5) * 0.4 * s, czp = z + (rnd() - 0.5) * 0.4 * s;
    const blobs = 4 + Math.floor(rnd() * 3);
    for (let b = 0; b < blobs; b++) {
      const ba = (b / blobs) * Math.PI * 2 + rnd() * 0.8, bd = (b === 0 ? 0 : (0.9 + rnd() * 1.1) * s);
      octa(a, cxp + Math.cos(ba) * bd, y + (3.6 + rnd() * 1.3) * s, czp + Math.sin(ba) * bd,
        (1.3 + rnd() * 0.9) * s, (1.0 + rnd() * 0.6) * s, (1.3 + rnd() * 0.9) * s, vary(g, 0.2, rnd), rnd() * 0.8);
    }
  };
  const treeDead = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const d = vary([0.16, 0.14, 0.12], 0.2, rnd);
    prism(a, x, y - 0.2, z, 0.30 * s, 0.10 * s, 4.4 * s, 6, d, (rnd() - 0.5) * 0.8 * s, (rnd() - 0.5) * 0.8 * s);
    for (let b = 0; b < 3; b++) {
      const ba = rnd() * Math.PI * 2, bl = (1.2 + rnd() * 1.2) * s, by = y + (2.2 + rnd() * 1.6) * s;
      prism(a, x + Math.cos(ba) * bl * 0.4, by, z + Math.sin(ba) * bl * 0.4, 0.09 * s, 0.02, bl, 4, d, Math.cos(ba) * bl * 0.8, Math.sin(ba) * bl * 0.8);
    }
  };
  const treeGiant = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g = vary([0.20, 0.40, 0.20], 0.2, rnd);
    prism(a, x, y - 0.4, z, 1.45 * s, 0.75 * s, 15 * s, 8, vary([0.30, 0.20, 0.13], 0.15, rnd), (rnd() - 0.5) * 1.2 * s, (rnd() - 0.5) * 1.2 * s);
    for (let b = 0; b < 7; b++) {
      const ba = (b / 7) * Math.PI * 2 + rnd() * 0.7, bd = (b === 0 ? 0 : (2.2 + rnd() * 3.4) * s);
      octa(a, x + Math.cos(ba) * bd, y + (14.5 + rnd() * 5.5) * s, z + Math.sin(ba) * bd,
        (3.4 + rnd() * 2.2) * s, (2.4 + rnd() * 1.4) * s, (3.4 + rnd() * 2.2) * s, vary(g, 0.18, rnd), rnd() * 0.8);
    }
  };
  /* a flower, honestly: stem, heart, and a ring of solid petals */
  /* a true flower (Chase's crystal rule, applied to everything,
     2026-10-24: modelled, not coloured shapes): a two-bend stem
     with one leaf, a sepal star, petals as ridged cups around a
     domed heart — or, now and then, a bud not yet open */
  const flowerGeo = (lit: number[], glow: number[], x: number, y: number, z: number, s: number, petal: Col3, rnd: () => number) => {
    const leanX = (rnd() - 0.5) * 0.16 * s, leanZ = (rnd() - 0.5) * 0.16 * s;
    const stem: Col3 = [0.20, 0.40, 0.15];
    prism(lit, x, y - 0.03, z, 0.034 * s, 0.026 * s, 0.30 * s, 5, stem);
    prism(lit, x, y + 0.27 * s, z, 0.026 * s, 0.020 * s, 0.26 * s, 5, stem, leanX, leanZ);
    const hx = x + leanX, hz = z + leanZ, hy = y + 0.53 * s;
    { const la = rnd() * Math.PI * 2, lx = x + leanX * 0.5, lz = z + leanZ * 0.5, ly = y + 0.26 * s;
      const dx = Math.cos(la), dz = Math.sin(la), lc = vary(stem, 0.10, rnd);
      tri(lit, [lx, ly, lz], [lx + dx * 0.20 * s - dz * 0.06 * s, ly + 0.02 * s, lz + dz * 0.20 * s + dx * 0.06 * s], [lx + dx * 0.13 * s, ly + 0.07 * s, lz + dz * 0.13 * s], lc);
      tri(lit, [lx, ly, lz], [lx + dx * 0.13 * s, ly + 0.07 * s, lz + dz * 0.13 * s], [lx + dx * 0.20 * s + dz * 0.06 * s, ly + 0.02 * s, lz + dz * 0.20 * s - dx * 0.06 * s], lc); }
    const pc = vary(petal, 0.14, rnd);
    const pcLight = pc.map((c) => Math.min(1, c + 0.10)) as unknown as Col3;
    if (rnd() < 0.16) {
      for (let k = 0; k < 5; k++) {
        const pa = (k / 5) * Math.PI * 2;
        prism(lit, hx + Math.cos(pa) * 0.045 * s, hy - 0.02 * s, hz + Math.sin(pa) * 0.045 * s, 0.055 * s, 0.006 * s, 0.20 * s, 4, k % 2 ? pc : pcLight, -Math.cos(pa) * 0.05 * s, -Math.sin(pa) * 0.05 * s);
      }
      prism(lit, hx, hy - 0.09 * s, hz, 0.075 * s, 0.03 * s, 0.10 * s, 5, stem);
      return;
    }
    for (let k = 0; k < 5; k++) {
      const pa = (k / 5) * Math.PI * 2 + 0.3;
      octa(lit, hx + Math.cos(pa) * 0.09 * s, hy - 0.035 * s, hz + Math.sin(pa) * 0.09 * s, 0.075 * s, 0.02 * s, 0.075 * s, stem, -pa + Math.PI / 2);
    }
    const petals = 5 + Math.floor(rnd() * 3);
    for (let pI = 0; pI < petals; pI++) {
      const pa = (pI / petals) * Math.PI * 2 + rnd() * 0.25;
      const dx = Math.cos(pa), dz = Math.sin(pa), qx = -dz, qz = dx;
      const B: number[] = [hx + dx * 0.03 * s, hy, hz + dz * 0.03 * s];
      const M: number[] = [hx + dx * 0.17 * s, hy + 0.075 * s, hz + dz * 0.17 * s];
      const T: number[] = [hx + dx * 0.31 * s, hy + 0.10 * s, hz + dz * 0.31 * s];
      const L: number[] = [hx + dx * 0.16 * s + qx * 0.09 * s, hy + 0.04 * s, hz + dz * 0.16 * s + qz * 0.09 * s];
      const R: number[] = [hx + dx * 0.16 * s - qx * 0.09 * s, hy + 0.04 * s, hz + dz * 0.16 * s - qz * 0.09 * s];
      tri(lit, B, L, M, pc); tri(lit, B, M, R, pc); tri(lit, L, T, M, pcLight); tri(lit, R, M, T, pcLight);
    }
    octa(glow, hx, hy + 0.035 * s, hz, 0.07 * s, 0.05 * s, 0.07 * s, [0.98, 0.78, 0.30]);
  };
  /* a garden bed: soil, a stone lip, and flowers in honest rows —
     the sign that something in this world tends what grows */
  const gardenBed = (lit: number[], glow: number[], x: number, y: number, z: number, rot: number, rnd: () => number) => {
    const soil: Col3 = [0.23, 0.16, 0.10];
    const edge: Col3 = [0.42, 0.40, 0.38];
    const c = Math.cos(rot), s = Math.sin(rot);
    const L = (lx: number, lz: number): [number, number] => [x + lx * c - lz * s, z + lx * s + lz * c];
    boxS(lit, x, y - 0.10, z, 5.6, 0.24, 3.8, soil, rot);
    for (const [ex, ez, w, d] of [[0, -1.95, 5.9, 0.3], [0, 1.95, 5.9, 0.3], [-2.85, 0, 0.3, 4.2], [2.85, 0, 0.3, 4.2]] as Array<[number, number, number, number]>) {
      const [wx, wz] = L(ex, ez);
      boxS(lit, wx, y - 0.02, wz, w, 0.3, d, vary(edge, 0.08, rnd), rot);
    }
    const petals: Col3[] = [[0.95, 0.45, 0.65], [0.98, 0.85, 0.35], [0.72, 0.55, 1.0]];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const [fx, fz] = L(-2.1 + i * 1.05, -1.15 + row * 1.15);
      flowerGeo(lit, glow, fx, height(fx, fz) + 0.05, fz, 0.85 + rnd() * 0.3, petals[(row + i) % 3], rnd);
    }
  };
  const grassTuft = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g1: Col3 = [0.20, 0.42, 0.16], g2: Col3 = [0.38, 0.55, 0.22];
    const blades = 5 + Math.floor(rnd() * 3);
    for (let b = 0; b < blades; b++) {
      const ba = rnd() * Math.PI * 2, bd = rnd() * 0.16 * s;
      prism(a, x + Math.cos(ba) * bd, y - 0.02, z + Math.sin(ba) * bd, 0.045 * s, 0.004, (0.45 + rnd() * 0.5) * s, 3,
        vary(rnd() < 0.5 ? g1 : g2, 0.2, rnd), Math.cos(ba) * (0.10 + rnd() * 0.16) * s, Math.sin(ba) * (0.10 + rnd() * 0.16) * s);
    }
  };
  const rockGeo = (a: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const g = vary([0.42, 0.41, 0.44], 0.16, rnd);
    octa(a, x, y + 0.30 * s, z, (0.85 + rnd() * 0.5) * s, (0.5 + rnd() * 0.35) * s, (0.8 + rnd() * 0.5) * s, g, rnd() * 1.2);
    if (rnd() < 0.55) octa(a, x + (rnd() - 0.5) * 1.3 * s, y + 0.18 * s, z + (rnd() - 0.5) * 1.3 * s, 0.5 * s, 0.32 * s, 0.48 * s, vary(g, 0.15, rnd), rnd() * 1.2);
  };
  /* a true crystal cluster: points of six-sided prism growing
     from a rock matrix, each point in three tones — dark root,
     brightening shaft, pale termination — the way amethyst
     deepens and clears. Two families: amethyst and quartz. A
     small heart of glow sits inside the main point, nothing more;
     the rest is honest lit stone, not flat colour */
  const crystalGeo = (lit: number[], glow: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    const amethyst = rnd() < 0.65;
    const base: Col3 = amethyst ? [0.30, 0.20, 0.48] : [0.50, 0.53, 0.60];
    const mid: Col3 = amethyst ? [0.46, 0.31, 0.74] : [0.67, 0.71, 0.79];
    const tip: Col3 = amethyst ? [0.70, 0.54, 0.99] : [0.86, 0.90, 0.97];
    octa(lit, x, y + 0.10 * s, z, 0.88 * s, 0.30 * s, 0.82 * s, vary([0.36, 0.34, 0.38], 0.15, rnd), rnd() * 1.2);
    const point = (px: number, pz: number, ps: number, lean: number, ang: number) => {
      const lx = Math.cos(ang) * lean, lz = Math.sin(ang) * lean;
      const h1 = 0.9 * ps, h2 = 0.8 * ps;
      prism(lit, px, y + 0.05 * s, pz, 0.17 * ps, 0.125 * ps, h1, 6, vary(base, 0.12, rnd), lx * h1, lz * h1, rnd() * 0.5);
      const mx = px + lx * h1, mz = pz + lz * h1, my = y + 0.05 * s + h1;
      prism(lit, mx, my, mz, 0.125 * ps, 0.10 * ps, h2, 6, vary(mid, 0.12, rnd), lx * h2, lz * h2, rnd() * 0.5);
      prism(lit, mx + lx * h2, my + h2, mz + lz * h2, 0.105 * ps, 0.008 * ps, 0.55 * ps, 6, vary(tip, 0.10, rnd), lx * 0.16, lz * 0.16, rnd() * 0.5);
    };
    point(x, z, s * (1.5 + rnd() * 0.7), 0.05 + rnd() * 0.10, rnd() * 6.28);
    const nSide = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < nSide; i++) { const a = rnd() * 6.28, d = (0.35 + rnd() * 0.3) * s; point(x + Math.cos(a) * d, z + Math.sin(a) * d, s * (0.8 + rnd() * 0.5), 0.25 + rnd() * 0.35, a); }
    const nSmall = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < nSmall; i++) { const a = rnd() * 6.28, d = (0.5 + rnd() * 0.4) * s; point(x + Math.cos(a) * d, z + Math.sin(a) * d, s * (0.35 + rnd() * 0.3), 0.3 + rnd() * 0.4, a); }
    octa(glow, x, y + 0.9 * s, z, 0.10 * s, 0.16 * s, 0.10 * s, amethyst ? [0.55, 0.38, 0.95] : [0.75, 0.82, 0.95]);
  };
  /* a true mushroom (the crystal rule again): a bulbed cream stem
     with its little ring, pale gills under a russet dome built in
     shrinking courses, light freckles on the cap — and, often, a
     smaller one leaning at its foot. It was a violet prism once;
     the world is not made of coloured shapes any more. */
  const shroomGeo = (lit: number[], glow: number[], x: number, y: number, z: number, s: number, rnd: () => number) => {
    void glow;
    const one = (mx: number, mz: number, ms: number) => {
      const my = height(mx, mz);
      if (my < 0.3) return;
      const stem: Col3 = [0.82, 0.76, 0.64];
      const capTop = vary(rnd() < 0.5 ? [0.60, 0.27, 0.15] as Col3 : [0.72, 0.48, 0.22] as Col3, 0.12, rnd);
      prism(lit, mx, my - 0.04, mz, 0.16 * ms, 0.11 * ms, 0.30 * ms, 7, vary(stem, 0.06, rnd));
      prism(lit, mx, my + 0.24 * ms, mz, 0.11 * ms, 0.09 * ms, 0.26 * ms, 7, stem);
      prism(lit, mx, my + 0.30 * ms, mz, 0.13 * ms, 0.15 * ms, 0.05 * ms, 7, vary(stem, 0.05, rnd));
      prism(lit, mx, my + 0.46 * ms, mz, 0.46 * ms, 0.40 * ms, 0.06 * ms, 8, [0.88, 0.80, 0.66]);
      prism(lit, mx, my + 0.50 * ms, mz, 0.58 * ms, 0.50 * ms, 0.13 * ms, 8, capTop);
      prism(lit, mx, my + 0.61 * ms, mz, 0.50 * ms, 0.34 * ms, 0.11 * ms, 8, vary(capTop, 0.05, rnd));
      prism(lit, mx, my + 0.70 * ms, mz, 0.34 * ms, 0.10 * ms, 0.09 * ms, 8, vary(capTop, 0.08, rnd));
      const spots = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < spots; k++) {
        const sa = rnd() * Math.PI * 2, sr = (0.10 + rnd() * 0.16) * ms;
        octa(lit, mx + Math.cos(sa) * sr, my + 0.735 * ms, mz + Math.sin(sa) * sr, 0.04 * ms, 0.02 * ms, 0.04 * ms, [0.92, 0.88, 0.78], rnd());
      }
    };
    one(x, z, s);
    if (rnd() < 0.45) one(x + (rnd() - 0.5) * 0.9 * s, z + (rnd() - 0.5) * 0.9 * s, s * (0.45 + rnd() * 0.3));
  };

  /* ---- the great paths: worn ways across the world, seeded once.
     Palette consults them; scatter keeps off them; grass crowds
     their edges. A world you can wayfind in, like the old games. */
  interface PathSeg { x1: number; z1: number; x2: number; z2: number }
  let pathSegs: PathSeg[] = [];
  const buildPaths = () => {
    pathSegs = [];
    const rnd = mulberry32(seed ^ 0x9a77);
    for (let pth = 0; pth < 3; pth++) {
      let px = (rnd() - 0.5) * 500, pz = (rnd() - 0.5) * 500;
      let ang = rnd() * Math.PI * 2;
      for (let st = 0; st < 26; st++) {
        const nx = px + Math.cos(ang) * 34, nz = pz + Math.sin(ang) * 34;
        pathSegs.push({ x1: px, z1: pz, x2: nx, z2: nz });
        px = nx; pz = nz; ang += (rnd() - 0.5) * 0.55;
      }
    }
  };
  buildPaths();
  const pathDist = (x: number, z: number): number => {
    let best = 1e9;
    for (const sg of pathSegs) {
      const dx = sg.x2 - sg.x1, dz = sg.z2 - sg.z1;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - sg.x1) * dx + (z - sg.z1) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const ex = sg.x1 + dx * t - x, ez = sg.z1 + dz * t - z;
      const d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  /* ---- the wonders: colossal landmarks on the horizon, placed
     once per world — the things you navigate by and walk to ---- */
  let wonderMesh: (Mesh | null) = null;
  let wonderGlow: (Mesh | null) = null;
  let worldSolids: Array<{ x: number; z: number; r: number; top: number }> = [];
  interface POI { name: string; x: number; z: number; r: number }
  let pois: POI[] = [];
  const buildWonders = () => {
    if (wonderMesh) { gl.deleteBuffer(wonderMesh.buf); wonderMesh = null; }
    if (wonderGlow) { gl.deleteBuffer(wonderGlow.buf); wonderGlow = null; }
    worldSolids = []; pois = [];
    const lit: number[] = [], glow: number[] = [];
    const rnd = mulberry32(seed ^ 0x77de);
    const findLand = (ang: number, dist: number): [number, number] => {
      for (let dd = dist; dd < dist + 260; dd += 24) {
        const x = Math.cos(ang) * dd, z = Math.sin(ang) * dd;
        if (height(x, z) > 2.2) return [x, z];
      }
      return [Math.cos(ang) * dist, Math.sin(ang) * dist];
    };
    /* the titan arch */
    {
      const [x, z] = findLand(rnd() * 6.28, 330 + rnd() * 160);
      const y = height(x, z), rot = rnd() * 3.14, st: Col3 = [0.46, 0.44, 0.42];
      const c = Math.cos(rot), sn = Math.sin(rot);
      const lx = x - c * 16, lz = z - sn * 16, rx2 = x + c * 16, rz2 = z + sn * 16;
      boxS(lit, lx, height(lx, lz) - 2, lz, 9, 58, 9, st, rot);
      boxS(lit, rx2, height(rx2, rz2) - 2, rz2, 9, 58, 9, vary(st, 0.1, rnd), rot);
      boxS(lit, x, y + 52, z, 44, 10, 11, st, rot);
      worldSolids.push({ x: lx, z: lz, r: 6.4, top: y + 58 }, { x: rx2, z: rz2, r: 6.4, top: y + 58 });
      pois.push({ name: "the titan arch", x, z, r: 60 });
    }
    /* the standing ring, giant-scale */
    {
      const [x, z] = findLand(rnd() * 6.28, 300 + rnd() * 220);
      const y = height(x, z), st: Col3 = [0.40, 0.39, 0.40];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, sx = x + Math.cos(a) * 30, sz = z + Math.sin(a) * 30;
        if (k === 4) { boxS(lit, sx, height(sx, sz) - 0.4, sz, 4.4, 3.2, 6, st, a); continue; }
        const hh = 17 + rnd() * 9;
        boxS(lit, sx, height(sx, sz) - 1.5, sz, 4.6, hh, 6.2, vary(st, 0.12, rnd), a + 1.57);
        worldSolids.push({ x: sx, z: sz, r: 3.8, top: y + hh });
      }
      pois.push({ name: "the standing ring", x, z, r: 55 });
    }
    /* the world spike — a crystal cluster the size of a tower */
    {
      const [x, z] = findLand(rnd() * 6.28, 380 + rnd() * 200);
      const y = height(x, z);
      crystalGeo(lit, glow, x, y - 0.5, z, 6.2, rnd);
      crystalGeo(lit, glow, x + 8, y - 0.5, z + 4, 2.8, rnd);
      rockGeo(lit, x + 4, y, z - 4, 2.6, rnd);
      rockGeo(lit, x - 6, y, z + 5, 1.9, rnd);
      worldSolids.push({ x, z, r: 6.4, top: y + 32 });
      pois.push({ name: "the world spike", x, z, r: 50 });
    }
    /* the ribcage of something old */
    {
      const [x, z] = findLand(rnd() * 6.28, 300 + rnd() * 180);
      const rot = rnd() * 3.14, bone: Col3 = [0.82, 0.78, 0.68];
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (let k = 0; k < 5; k++) {
        const off = (k - 2) * 9, bx = x + c * off, bz = z + sn * off;
        const by = height(bx, bz);
        boxS(lit, bx - sn * 7, by - 0.5, bz + c * 7, 1.1, 13 - Math.abs(k - 2) * 1.6, 1.1, bone, rot);
        boxS(lit, bx + sn * 7, by - 0.5, bz - c * 7, 1.1, 13 - Math.abs(k - 2) * 1.6, 1.1, vary(bone, 0.1, rnd), rot);
        boxS(lit, bx, by + 11.4 - Math.abs(k - 2) * 1.6, bz, 1.0, 1.0, 15.5, bone, rot);
      }
      pois.push({ name: "the ribcage", x, z, r: 48 });
    }
    /* the first garden — beds in rings around one great tree */
    {
      const [x, z] = findLand(rnd() * 6.28, 260 + rnd() * 200);
      const y = height(x, z);
      for (let ring = 0; ring < 3; ring++) {
        const rr = 9 + ring * 6.5, n = 6 + ring * 2;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + ring * 0.35, bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
          gardenBed(lit, glow, bx, height(bx, bz), bz, a + Math.PI / 2, rnd);
        }
      }
      const s = 1.1 + rnd() * 0.3;
      treeGiant(lit, x, y, z, s, rnd);
      worldSolids.push({ x, z, r: 1.8 * s, top: y + 24 * s });
      pois.push({ name: "the first garden", x, z, r: 48 });
    }
    /* the three sisters — dead giants keeping one another company */
    {
      const [x, z] = findLand(rnd() * 6.28, 340 + rnd() * 200);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rnd() * 0.5, sx = x + Math.cos(a) * 15, sz = z + Math.sin(a) * 15;
        const sy = height(sx, sz), s = 2.4 + rnd() * 0.8;
        treeDead(lit, sx, sy, sz, s, rnd);
        crystalGeo(lit, glow, sx, sy + 4.4 * s, sz, 0.5, rnd);
        worldSolids.push({ x: sx, z: sz, r: 0.9 * s, top: sy + 5 * s });
      }
      pois.push({ name: "the three sisters", x, z, r: 46 });
    }
    if (lit.length) wonderMesh = makeMesh(new Float32Array(lit));
    if (glow.length) wonderGlow = makeMesh(new Float32Array(glow));
  };
  buildWonders();

  const buildChunk = (cx: number, cz: number): Chunk => {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const seg = CHUNK / STEP;
    const tv: number[] = [];
    const vert = (x: number, z: number): number[] => {
      const h = height(x, z);
      const e = 1.4;
      const hx = height(x + e, z) - height(x - e, z);
      const hz = height(x, z + e) - height(x, z - e);
      let nx = -hx / (2 * e), nz = -hz / (2 * e), ny = 1;
      const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const col = palette(x, z, h, 1 - ny);
      const avgN = (height(x - 3.2, z) + height(x + 3.2, z) + height(x, z - 3.2) + height(x, z + 3.2)) / 4;
      const ao = Math.max(0.66, Math.min(1.12, 1 - (avgN - h) * 0.075));
      const mott = 0.90 + 0.20 * (moisture(x * 0.14, z * 0.14) * 0.5 + 0.5);
      const shade = ao * mott;
      return [x, h, z, col[0] * shade, col[1] * shade, col[2] * shade, nx, ny, nz];
    };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const x = x0 + i * STEP, z = z0 + j * STEP;
      const v00 = vert(x, z), v10 = vert(x + STEP, z), v01 = vert(x, z + STEP), v11 = vert(x + STEP, z + STEP);
      tv.push(...v00, ...v01, ...v10, ...v10, ...v01, ...v11);
    }
    const rnd = mulberry32(seed ^ (cx * 7919) ^ (cz * 104729));
    const lit: number[] = [], glow: number[] = [];
    const crystals: Array<[number, number]> = [];
    const solids: Array<{ x: number; z: number; r: number; top: number }> = [];
    const slopeAt = (x: number, z: number) => {
      const e = 1.4;
      return 1 - 1 / Math.hypot((height(x + e, z) - height(x - e, z)) / (2 * e), 1, (height(x, z + e) - height(x, z - e)) / (2 * e));
    };
    /* the Dreamer's hand in the making: what it has learned of
       the walker bends what grows here — loved worlds grow
       wonders; shadowed worlds grow dead wood and stone */
    const lean = leanOf(rec);
    const wonderBias = 1 + lean * 0.55;
    const gloomBias = 1 - lean * 0.5;
    /* crystals grow in pockets, not everywhere: one chunk in
       five is crystal country, the rest is clean */
    const crystalPocket = rnd() < 0.20;
    /* how forested is this place? a field, not a coin per chunk —
       and the forest field gathers trees into true woods with
       clearings between, not a uniform sprinkle */
    const fmask = forestNoise.fbm((x0 + CHUNK / 2) * 0.006 + 7, (z0 + CHUNK / 2) * 0.006 + 23, 2);
    const forestAmt = Math.max(0, Math.min(1, (fmask - 0.34) / 0.3));
    const dens = (0.30 + 0.85 * Math.max(0, moisture(x0 + CHUNK / 2, z0 + CHUNK / 2))) * (0.5 + 1.35 * forestAmt);
    const treeTries = Math.min(54, Math.round(30 * dens));
    for (let t = 0; t < treeTries; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.9 || slopeAt(x, z) > 0.36) continue;
      if (pathDist(x, z) < 2.6) continue;
      const roll = rnd();
      if (roll < 0.40) { const s = 0.85 + rnd() * 1.5; treePine(lit, x, h, z, s, rnd); solids.push({ x, z, r: 0.34 * s, top: h + 8 * s }); }
      else if (roll < 0.66) { const s = 0.9 + rnd() * 1.1; treeBroad(lit, x, h, z, s, rnd); solids.push({ x, z, r: 0.46 * s, top: h + 6.4 * s }); }
      else if (roll < 0.80) { const s = 0.8 + rnd() * 1.0; treeSpire(lit, x, h, z, s, rnd); solids.push({ x, z, r: 0.2 * s, top: h + 11.6 * s }); }
      else if (roll < 0.80 + 0.09 * gloomBias) { const s = 0.9 + rnd() * 1.2; treeDead(lit, x, h, z, s, rnd); solids.push({ x, z, r: 0.34 * s, top: h + 4.6 * s }); }
    }
    /* a giant, rarely — the tree you navigate by */
    if (rnd() < 0.085 * wonderBias) {
      const x = x0 + 8 + rnd() * (CHUNK - 16), z = z0 + 8 + rnd() * (CHUNK - 16);
      const h = height(x, z);
      if (h > 1 && slopeAt(x, z) < 0.3 && pathDist(x, z) > 4) {
        const s = 1.0 + rnd() * 0.5;
        treeGiant(lit, x, h, z, s, rnd);
        solids.push({ x, z, r: 1.6 * s, top: h + 23 * s });
        pois.push({ name: "the giant", x, z, r: 40 });
      }
    }
    for (let t = 0; t < 12; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.4) continue;
      const roll = rnd();
      if (roll < 0.34) { const s = 0.6 + rnd() * 1.5; rockGeo(lit, x, h - 0.15, z, s, rnd); solids.push({ x, z, r: 0.95 * s, top: h + 0.9 * s }); }
      else if (crystalPocket && roll < 0.34 + 0.10 * wonderBias) { const s = 0.45 + rnd() * 0.35; crystalGeo(lit, glow, x, h - 0.1, z, s, rnd); crystals.push([x, z]); solids.push({ x, z, r: s + 0.35, top: h + 5.2 * s }); }
      else if (roll < 0.55 && moisture(x, z) > 0.52) { const s = 0.8 + rnd() * 1.1; shroomGeo(lit, glow, x, h, z, s, rnd); }
      else if (roll < 0.565 * gloomBias) { boxS(lit, x, h - 0.3, z, 1.3, 6 + rnd() * 5, 1.3, [0.015, 0.015, 0.02], rnd() * 3.14); solids.push({ x, z, r: 1.0, top: h + 10 }); }
    }
    /* ruins — rarer than before, and built of closed stone */
    if (rnd() < 0.13) {
      const rx = x0 + 10 + rnd() * (CHUNK - 20), rz = z0 + 10 + rnd() * (CHUNK - 20);
      const rh = height(rx, rz);
      if (rh > 1 && slopeAt(rx, rz) < 0.35 && pathDist(rx, rz) > 3) {
        const stone: Col3 = [0.48, 0.46, 0.44];
        const h1 = 3.4 + rnd() * 2.6, h2 = 2.2 + rnd() * 2.4, gap = 3.6 + rnd() * 1.6, rot = rnd() * 3.14;
        prism(lit, rx, rh - 0.3, rz, 0.62, 0.5, h1, 6, stone);
        prism(lit, rx + gap, rh - 0.3, rz, 0.55, 0.44, h2, 6, vary(stone, 0.1, rnd));
        if (rnd() < 0.6) boxS(lit, rx + gap / 2, rh + Math.min(h1, h2) - 0.5, rz, gap + 1.6, 0.8, 1.3, stone, rot);
        boxS(lit, rx + gap * 0.4, rh - 0.25, rz + 1.8, gap * 0.8, 0.7, 1.1, vary(stone, 0.12, rnd), rot * 0.5);
        for (let rb = 0; rb < 4; rb++) rockGeo(lit, rx + (rnd() - 0.5) * 7, rh - 0.2, rz + (rnd() - 0.5) * 7, 0.4 + rnd() * 0.4, rnd);
        solids.push({ x: rx, z: rz, r: 0.85, top: rh + h1 }, { x: rx + gap, z: rz, r: 0.8, top: rh + h2 });
        pois.push({ name: "the ruins", x: rx, z: rz, r: 26 });
      }
    }
    /* a garden bed, sometimes — tended ground among the wild */
    if (rnd() < 0.085) {
      const gx = x0 + 8 + rnd() * (CHUNK - 16), gz = z0 + 8 + rnd() * (CHUNK - 16);
      const gh = height(gx, gz);
      if (gh > 1 && gh < 9 && slopeAt(gx, gz) < 0.16 && pathDist(gx, gz) > 3) {
        gardenBed(lit, glow, gx, gh, gz, rnd() * 3.14, rnd);
        pois.push({ name: "the garden", x: gx, z: gz, r: 22 });
      }
    }
    /* ground cover, baked into the land like everything else —
       static, seeded, always the same grass in the same place */
    const grassN = Math.round(52 * detailMul * (1 + forestAmt * 0.9));
    for (let t = 0; t < grassN; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.7 || h > 12 || slopeAt(x, z) > 0.32) continue;
      grassTuft(lit, x, h, z, 0.8 + rnd() * 0.9, rnd);
    }
    for (let t = 0; t < Math.round(11 * wonderBias); t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.8 || h > 11 || slopeAt(x, z) > 0.3) continue;
      const petals: Col3[] = [[0.95, 0.45, 0.65], [0.98, 0.85, 0.35], [0.72, 0.55, 1.0], [0.95, 0.95, 0.95], [0.98, 0.55, 0.30]];
      flowerGeo(lit, glow, x, h, z, 0.8 + rnd() * 0.7, petals[Math.floor(rnd() * petals.length)], rnd);
    }
    for (let t = 0; t < 8; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.2) continue;
      octa(lit, x, h + 0.05, z, 0.14 + rnd() * 0.2, 0.08 + rnd() * 0.08, 0.13 + rnd() * 0.18, vary([0.44, 0.43, 0.45], 0.2, rnd), rnd());
    }
    return {
      key: keyOf(cx, cz),
      terrain: makeMesh(new Float32Array(tv)),
      lit: lit.length ? makeMesh(new Float32Array(lit)) : null,
      glow: glow.length ? makeMesh(new Float32Array(glow)) : null,
      crystals,
      solids,
    };
  };

  /* blooms — where the walker has cast Bloom, the world keeps it */
  interface Bloom { x: number; z: number; kind: number; born?: number; seen?: number }
  let blooms: Bloom[] = [];
  try { blooms = JSON.parse(localStorage.getItem(skey(`simulacrum-blooms-${seed}`)) || "[]") as Bloom[]; } catch { blooms = []; }
  /* what is not tended, the world takes back: a planting unseen
     for ten days withers. A garden is a promise kept. */
  const pruneBlooms = () => {
    const nowMs = Date.now();
    const kept = blooms.filter((b) => { if (!b.born) return true; if (nowMs - b.born < 3 * 86400000) return true; return nowMs - (b.seen ?? b.born) < 10 * 86400000; });
    if (kept.length !== blooms.length) { blooms = kept; try { localStorage.setItem(skey(`simulacrum-blooms-${seed}`), JSON.stringify(blooms)); } catch { /* kept in memory */ } }
  };
  pruneBlooms();
  let bloomMesh: Mesh | null = null;
  const rebuildBlooms = () => {
    if (bloomMesh) { gl.deleteBuffer(bloomMesh.buf); bloomMesh = null; }
    if (!blooms.length) return;
    const v: number[] = [];
    const cols: Array<[number, number, number]> = [[0.95, 0.5, 0.7], [0.98, 0.86, 0.4], [0.66, 0.5, 1.0], [0.5, 0.85, 1.0], [0.97, 0.94, 0.85]];
    const brnd = mulberry32(seed ^ 0xb100 & 0xffffff);
    for (const b of blooms) {
      /* a planting grows through its stages across real days:
         a sprout, a young thing, a full stand, and at last a
         lush one — the kept gardens are visibly the kept ones */
      const ageD = b.born ? (Date.now() - b.born) / 86400000 : 3;
      const st = ageD < 0.5 ? 0 : ageD < 2 ? 1 : ageD < 5 ? 2 : 3;
      const nF = st === 0 ? 3 : st === 3 ? 8 : 6;
      const sc = st === 0 ? 0.5 : st === 1 ? 0.85 : st === 2 ? 1.5 + brnd() * 0.9 : 1.9 + brnd() * 0.9;
      for (let i = 0; i < nF; i++) {
        const bx = b.x + (brnd() - 0.5) * 4.6, bz = b.z + (brnd() - 0.5) * 4.6;
        const by = height(bx, bz);
        if (by < 0.2) continue;
        /* what you plant is what you see: a true flower, stem,
           petal ring and heart — one kind still grows a crystal */
        if (b.kind === 3 && i === 0 && st >= 1) crystalGeo(v, v, bx, by - 0.1, bz, 0.5, brnd);
        else flowerGeo(v, v, bx, by, bz, sc, cols[b.kind] ?? cols[0], brnd);
      }
    }
    if (v.length) bloomMesh = makeMesh(new Float32Array(v));
  };
  let guestBlooms: Bloom[] = [];
  const rebuildAllBlooms = () => { const keep = blooms; blooms = [...keep, ...guestBlooms]; rebuildBlooms(); blooms = keep; };
  rebuildBlooms();


  const skyMesh = (() => {
    const v: number[] = [];
    const seg = 20;
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg / 2; j++) {
      const p = (a: number, b: number): number[] => {
        const th = (a / seg) * Math.PI * 2, ph = (b / (seg / 2)) * Math.PI;
        return [Math.cos(th) * Math.sin(ph) * 900, Math.cos(ph) * 900, Math.sin(th) * Math.sin(ph) * 900, 0, 0, 0, 0, 0, 0];
      };
      const a = p(i, j), b = p(i + 1, j), c = p(i, j + 1), d = p(i + 1, j + 1);
      v.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    return makeMesh(new Float32Array(v));
  })();

  /* water: a segmented sheet that follows the walker, tinted by depth */
  const WSEG = 56, WSIZE = 448;
  let waterMesh: Mesh | null = null;
  let waterCell: [number, number] = [1e9, 1e9];
  const buildWater = (px: number, pz: number) => {
    const cell = WSIZE / WSEG;
    const cx = Math.round(px / cell) * cell, cz = Math.round(pz / cell) * cell;
    if (waterCell[0] === cx && waterCell[1] === cz && waterMesh) return;
    waterCell = [cx, cz];
    const v: number[] = [];
    const gv = (gx: number, gz: number): number[] => {
      const x = cx - WSIZE / 2 + gx * cell, z = cz - WSIZE / 2 + gz * cell;
      const depth = Math.max(0, -height(x, z));
      const k = Math.min(1, depth / 8);
      const col: [number, number, number] = [0.22 - k * 0.17, 0.48 - k * 0.3, 0.55 - k * 0.2];
      const alpha = height(x, z) > 0.15 ? 0 : Math.min(0.88, 0.30 + depth * 0.14);
      return [x, 0, z, ...col, alpha, depth, 0, 0, 0];
    };
    for (let i = 0; i < WSEG; i++) for (let j = 0; j < WSEG; j++) {
      const a = gv(i, j), b = gv(i + 1, j), c = gv(i, j + 1), d = gv(i + 1, j + 1);
      v.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    if (waterMesh) gl.deleteBuffer(waterMesh.buf);
    waterMesh = makeMesh(new Float32Array(v));
  };

  /* points: motes (day pollen / night fireflies) + rain */
  const makePoints = (count: number, box: [number, number, number], col: [number, number, number], size: [number, number], seedN: number) => {
    const rnd = mulberry32(seedN);
    const v = new Float32Array(count * 7);
    for (let i = 0; i < count; i++) {
      v[i * 7] = rnd() * box[0]; v[i * 7 + 1] = rnd() * box[1]; v[i * 7 + 2] = rnd() * box[2];
      v[i * 7 + 3] = col[0]; v[i * 7 + 4] = col[1]; v[i * 7 + 5] = col[2];
      v[i * 7 + 6] = size[0] + rnd() * (size[1] - size[0]);
    }
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    return { buf, n: count };
  };
  let motes = makePoints(130, [60, 24, 60], [0.85, 0.95, 0.60], [1.6, 3.2], seed ^ 0x9e37 & 0xffffff);
  let rainPts = makePoints(420, [70, 44, 70], [0.65, 0.75, 0.95], [1.2, 1.8], seed ^ 0x7a11 & 0xffffff);
  let meteorPts = makePoints(170, [90, 40, 90], [0.92, 0.96, 1.0], [1.0, 1.7], seed ^ 0x9ee7 & 0xffffff);
  let snowPts = makePoints(520, [70, 42, 70], [0.94, 0.96, 1.0], [1.3, 2.6], seed ^ 0x5107 & 0xffffff);
  let firePts = makePoints(64, [48, 9, 48], [0.78, 1.0, 0.42], [1.7, 2.9], seed ^ 0xf17e & 0xffffff);
  const bindPoints = (pts: { buf: WebGLBuffer }) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, pts.buf);
    const aPos = gl.getAttribLocation(ptsPr, "aPos");
    const aCol = gl.getAttribLocation(ptsPr, "aCol");
    const aSize = gl.getAttribLocation(ptsPr, "aSize");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 24);
  };

  /* birds: dark wings on seeded circles */
  const BIRDS = 8;
  const birdBuf = gl.createBuffer()!;
  const birdRnd = mulberry32(seed ^ 0xb12d);
  const birds = Array.from({ length: BIRDS }, (_, i) => ({
    r: 46 + birdRnd() * 55, h: 20 + birdRnd() * 10, sp: (0.05 + birdRnd() * 0.05) * (birdRnd() < 0.5 ? 1 : -1),
    ph: birdRnd() * Math.PI * 2, ox: (birdRnd() - 0.5) * 60, oz: (birdRnd() - 0.5) * 60, size: 0.8 + birdRnd() * 0.7, idx: i,
  }));

  /* critters: ground wanderers with a small ethology — graze,
     wander, startle and flee, re-homing near the walker */
  const critBuf = gl.createBuffer()!;
  const critRnd = mulberry32(seed ^ 0xc217 & 0xffffff);
  interface Critter { hx: number; hz: number; x: number; z: number; hdg: number; state: number; t: number; tx: number; tz: number; col: [number, number, number]; s: number; kind: number }
  const critterCols: Array<[number, number, number]> = [[0.45, 0.32, 0.20], [0.72, 0.66, 0.58], [0.30, 0.26, 0.24], [0.55, 0.40, 0.26]];
  const critters: Critter[] = Array.from({ length: 6 }, (_, i) => ({
    hx: 8 + (critRnd() - 0.5) * 130, hz: 8 + (critRnd() - 0.5) * 130,
    x: 0, z: 0, hdg: critRnd() * 6.28, state: 0, t: critRnd() * 4, tx: 0, tz: 0,
    col: critterCols[i % critterCols.length], s: 0.8 + critRnd() * 0.5, kind: 0,
  }));
  /* the herd: four big grazers who keep to one another's country */
  const grazerCols: Array<[number, number, number]> = [[0.52, 0.38, 0.24], [0.62, 0.50, 0.36], [0.38, 0.30, 0.22]];
  const herdX = 30 + (critRnd() - 0.5) * 90, herdZ = -24 + (critRnd() - 0.5) * 90;
  for (let gi = 0; gi < 4; gi++) critters.push({
    hx: herdX + (critRnd() - 0.5) * 18, hz: herdZ + (critRnd() - 0.5) * 18,
    x: 0, z: 0, hdg: critRnd() * 6.28, state: 0, t: critRnd() * 4, tx: 0, tz: 0,
    col: grazerCols[gi % grazerCols.length], s: 1.5 + critRnd() * 0.6, kind: 1,
  });
  for (const c of critters) { c.x = c.hx; c.z = c.hz; c.tx = c.hx; c.tz = c.hz; }
  const stepCritters = (dt: number) => {
    for (const c of critters) {
      if (Math.hypot(c.hx - px, c.hz - pz) > 150) { c.hx = px + (critRnd() - 0.5) * 120; c.hz = pz + (critRnd() - 0.5) * 120; c.x = c.hx; c.z = c.hz; }
      c.t -= dt;
      const dWalker = Math.hypot(c.x - px, c.z - pz);
      if (dWalker < (c.kind === 1 ? 14 : 9) - judgmentNow * 3.5 && c.state !== 2) { c.state = 2; c.t = 1.6 + critRnd(); witness("flee"); }
      if (c.t <= 0) {
        if (c.state === 2 || critRnd() < 0.45) { c.state = 0; c.t = 2 + critRnd() * 4; }
        else { c.state = 1; c.tx = c.hx + (critRnd() - 0.5) * 46; c.tz = c.hz + (critRnd() - 0.5) * 46; c.t = 6 + critRnd() * 5; }
      }
      if (c.state > 0) {
        const tgt = c.state === 2 ? Math.atan2(c.x - px, c.z - pz) : Math.atan2(c.tx - c.x, c.tz - c.z);
        let dh = tgt - c.hdg;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        c.hdg += dh * Math.min(1, dt * 4);
        const sp = c.state === 2 ? (c.kind === 1 ? 6.4 : 5.2) : (c.kind === 1 ? 0.95 : 1.25);
        const nx = c.x + Math.sin(c.hdg) * sp * dt, nz = c.z + Math.cos(c.hdg) * sp * dt;
        if (height(nx, nz) > 0.4) { c.x = nx; c.z = nz; }
        else c.hdg += dt * 2.2;
      }
    }
  };
  const critterVerts = (): Float32Array => {
    const v: number[] = [];
    const push = (x: number, y: number, z: number, col: [number, number, number]) => v.push(x, y, z, ...col, 0, 1, 0);
    /* a closed box aligned to a heading — the grazers' anatomy */
    const boxAt = (cxp: number, cyp: number, czp: number, fx: number, fz: number, L: number, W: number, H: number, col: [number, number, number]) => {
      const rxv = fz, rzv = -fx;
      const cn = (a: number, b: number, dy: number): [number, number, number] => [cxp + fx * a + rxv * b, cyp + dy, czp + fz * a + rzv * b];
      const Q = (q: Array<[number, number, number]>) => { push(...q[0], col); push(...q[1], col); push(...q[2], col); push(...q[0], col); push(...q[2], col); push(...q[3], col); };
      Q([cn(-L, -W, H), cn(L, -W, H), cn(L, W, H), cn(-L, W, H)]);
      Q([cn(-L, -W, -H), cn(-L, W, -H), cn(L, W, -H), cn(L, -W, -H)]);
      Q([cn(L, -W, H), cn(L, -W, -H), cn(L, W, -H), cn(L, W, H)]);
      Q([cn(-L, W, H), cn(-L, W, -H), cn(-L, -W, -H), cn(-L, -W, H)]);
      Q([cn(-L, -W, H), cn(-L, -W, -H), cn(L, -W, -H), cn(L, -W, H)]);
      Q([cn(-L, W, H), cn(L, W, H), cn(L, W, -H), cn(-L, W, -H)]);
    };
    /* a tapered box: top face scaled and shifted against the foot —
       how a body stops looking like a crate */
    const tbox = (cxp: number, cyp: number, czp: number, fx: number, fz: number, L: number, W: number, H: number, topS: number, topF: number, col: [number, number, number]) => {
      const rxv = fz, rzv = -fx;
      const cn = (a: number, b: number, dy: number, sc: number, sh: number): [number, number, number] => [cxp + fx * (a * sc + sh) + rxv * b * sc, cyp + dy, czp + fz * (a * sc + sh) + rzv * b * sc];
      const Q = (q: Array<[number, number, number]>) => { push(...q[0], col); push(...q[1], col); push(...q[2], col); push(...q[0], col); push(...q[2], col); push(...q[3], col); };
      const B = (a: number, b: number) => cn(a, b, -H, 1, 0);
      const T = (a: number, b: number) => cn(a, b, H, topS, topF);
      Q([T(-L, -W), T(L, -W), T(L, W), T(-L, W)]);
      Q([B(-L, -W), B(-L, W), B(L, W), B(L, -W)]);
      Q([T(L, -W), B(L, -W), B(L, W), T(L, W)]);
      Q([T(-L, W), B(-L, W), B(-L, -W), T(-L, -W)]);
      Q([T(-L, -W), B(-L, -W), B(L, -W), T(L, -W)]);
      Q([T(-L, W), T(L, W), B(L, W), B(-L, W)]);
    };
    for (const c of critters) {
      if (c.kind === 1) {
        const gy = height(c.x, c.z);
        if (gy < 0.3) continue;
        const s = c.s;
        const fx = Math.sin(c.hdg), fz = Math.cos(c.hdg);
        const colD: [number, number, number] = [c.col[0] * 0.78, c.col[1] * 0.78, c.col[2] * 0.78];
        const stride = c.state > 0 ? Math.sin(performance.now() * 0.009 + c.hx) : 0;
        const bobG = c.state > 0 ? Math.abs(Math.sin(performance.now() * 0.009 + c.hx)) * 0.05 * s : 0;
        const bodyCy = gy + 1.0 * s + bobG;
        /* barrel body, a shoulder hump, a slanted neck, a muzzle
           that narrows, ears, and a tail that hangs and widens */
        tbox(c.x, bodyCy, c.z, fx, fz, 0.55 * s, 0.26 * s, 0.30 * s, 0.78, 0, c.col);
        tbox(c.x + fx * 0.30 * s, bodyCy + 0.28 * s, c.z + fz * 0.30 * s, fx, fz, 0.24 * s, 0.20 * s, 0.17 * s, 0.68, 0, c.col);
        for (const [la, lb] of [[0.38, 0.16], [0.38, -0.16], [-0.38, 0.16], [-0.38, -0.16]] as Array<[number, number]>) {
          const swing = ((la > 0) === (lb > 0) ? stride : -stride) * 0.10 * s * (c.state > 0 ? 1 : 0.15);
          tbox(c.x + fx * la * s + fz * lb * s + fx * swing, gy + 0.36 * s, c.z + fz * la * s - fx * lb * s + fz * swing, fx, fz, 0.05 * s, 0.05 * s, 0.36 * s, 0.74, 0, colD);
        }
        const dipG = c.state === 0 ? -0.34 * s : 0;
        const neckX = c.x + fx * 0.55 * s, neckZ = c.z + fz * 0.55 * s;
        tbox(neckX, bodyCy + 0.32 * s + dipG * 0.5, neckZ, fx, fz, 0.20 * s, 0.115 * s, 0.32 * s, 0.62, 0.15 * s, c.col);
        const headX = c.x + fx * 0.88 * s, headZ = c.z + fz * 0.88 * s, headY = bodyCy + 0.58 * s + dipG;
        tbox(headX, headY, headZ, fx, fz, 0.20 * s, 0.105 * s, 0.12 * s, 0.55, 0.04 * s, c.col);
        for (const eb of [0.11, -0.11]) tbox(headX - fx * 0.08 * s + fz * eb * s, headY + 0.15 * s, headZ - fz * 0.08 * s - fx * eb * s, fx, fz, 0.045 * s, 0.028 * s, 0.085 * s, 0.35, -0.02 * s, colD);
        tbox(c.x - fx * 0.60 * s, bodyCy + 0.02 * s, c.z - fz * 0.60 * s, fx, fz, 0.035 * s, 0.035 * s, 0.27 * s, 1.35, -0.05 * s, colD);
        continue;
      }
      const y = height(c.x, c.z);
      if (y < 0.3) continue;
      const bob = c.state > 0 ? Math.abs(Math.sin(performance.now() * 0.012 + c.hx)) * 0.09 : 0;
      const cy = y + 0.52 * c.s + bob;
      const fx = Math.sin(c.hdg), fz = Math.cos(c.hdg);
      const colD: [number, number, number] = [c.col[0] * 0.78, c.col[1] * 0.78, c.col[2] * 0.78];
      const L = 0.62 * c.s, W = 0.30 * c.s, H = 0.34 * c.s;
      /* a loaf body on real legs, a narrowing head, ears, a tail */
      tbox(c.x, cy, c.z, fx, fz, L, W, H, 0.66, 0, c.col);
      for (const [la, lb] of [[0.36, 0.17], [0.36, -0.17], [-0.36, 0.17], [-0.36, -0.17]] as Array<[number, number]>) {
        tbox(c.x + fx * la * c.s + fz * lb * c.s, y + 0.15 * c.s, c.z + fz * la * c.s - fx * lb * c.s, fx, fz, 0.05 * c.s, 0.05 * c.s, 0.15 * c.s, 0.75, 0, colD);
      }
      const dip = c.state === 0 ? -0.22 * c.s : 0;
      const headX = c.x + fx * (L + 0.14 * c.s), headZ = c.z + fz * (L + 0.14 * c.s), headY = cy + 0.10 * c.s + dip;
      tbox(headX, headY, headZ, fx, fz, 0.17 * c.s, 0.13 * c.s, 0.15 * c.s, 0.5, 0.04 * c.s, c.col);
      for (const eb of [0.09, -0.09]) tbox(headX - fx * 0.06 * c.s + fz * eb * c.s, headY + 0.20 * c.s, headZ - fz * 0.06 * c.s - fx * eb * c.s, fx, fz, 0.035 * c.s, 0.025 * c.s, 0.09 * c.s, 0.3, -0.02 * c.s, colD);
      tbox(c.x - fx * (L + 0.05 * c.s), cy + 0.12 * c.s, c.z - fz * (L + 0.05 * c.s), fx, fz, 0.04 * c.s, 0.04 * c.s, 0.13 * c.s, 1.3, -0.06 * c.s, colD);
    }
    return new Float32Array(v);
  };

  const spawnStone = () => {
    if (stoneMesh) { gl.deleteBuffer(stoneMesh.buf); stoneMesh = null; }
    const a = Math.random() * Math.PI * 2;
    for (const dist of [68, 44, 28]) {
      const sx = px + Math.sin(a) * dist, sz = pz + Math.cos(a) * dist;
      const sy = height(sx, sz);
      if (sy < 1.2) continue;
      const v: number[] = [];
      const hh = 7.5 + Math.random() * 2, cy = sy - 0.6;
      const col: [number, number, number] = [0.02, 0.02, 0.03];
      const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], n: [number, number, number]) => {
        v.push(...a, ...col, ...n, ...b, ...col, ...n, ...c, ...col, ...n, ...a, ...col, ...n, ...c, ...col, ...n, ...d, ...col, ...n);
      };
      const x0 = sx - 0.85, x1 = sx + 0.85, z0 = sz - 0.85, z1 = sz + 0.85, y0 = cy, y1 = cy + hh;
      quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      stoneMesh = makeMesh(new Float32Array(v));
      return;
    }
  };
  const anomalyVerts = (t: number): Float32Array => {
    const v: number[] = [];
    const octa = (cx: number, cy: number, cz: number, r: number, col: [number, number, number]) => {
      const T: [number, number, number] = [cx, cy + r, cz], B: [number, number, number] = [cx, cy - r, cz];
      const ring: Array<[number, number, number]> = [[cx + r, cy, cz], [cx, cy, cz + r], [cx - r, cy, cz], [cx, cy, cz - r]];
      for (let k = 0; k < 4; k++) {
        const A = ring[k], C = ring[(k + 1) % 4];
        v.push(...T, ...col, 0, 1, 0, ...A, ...col, 0, 1, 0, ...C, ...col, 0, 1, 0);
        v.push(...B, ...col, 0, 1, 0, ...C, ...col, 0, 1, 0, ...A, ...col, 0, 1, 0);
      }
    };
    if (anKind === "star" && anAmt > 0.02) {
      const drift = (performance.now() / 1000) * skyAn.sp;
      const az = skyAn.az + drift;
      octa(px + Math.sin(az) * 330, 150 + Math.sin(skyAn.el) * 60, pz + Math.cos(az) * 330, 2.6, [1.0, 0.98, 0.9]);
    }
    if (anKind === "visitor" && anAmt > 0.02) {
      const t2 = performance.now() / 1000;
      const az = skyAn.az + t2 * skyAn.sp;
      const vx = px + Math.sin(az) * 240, vz = pz + Math.cos(az) * 240, vy = 165 + Math.sin(t2 * 0.5) * 6;
      /* a disc: two shallow cones rim to rim, a dome above, and
         three lights underneath taking their turns at blinking */
      const R = 13, hull: [number, number, number] = [0.32, 0.34, 0.42];
      const rim: Array<[number, number, number]> = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; rim.push([vx + Math.cos(a) * R, vy, vz + Math.sin(a) * R]); }
      for (let k = 0; k < 10; k++) {
        const A = rim[k], C = rim[(k + 1) % 10];
        v.push(vx, vy + 2.6, vz, ...hull, 0, 1, 0, ...A, ...hull, 0, 1, 0, ...C, ...hull, 0, 1, 0);
        v.push(vx, vy - 1.6, vz, ...hull, 0, -1, 0, ...C, ...hull, 0, -1, 0, ...A, ...hull, 0, -1, 0);
      }
      octa(vx, vy + 3.4, vz, 3.4, [0.45, 0.50, 0.62]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + t2 * 0.9;
        const on = 0.55 + 0.45 * Math.sin(t2 * 2.4 + k * 2.1);
        octa(vx + Math.cos(a) * R * 0.62, vy - 1.9, vz + Math.sin(a) * R * 0.62, 0.9, [1.0 * on, 0.85 * on, 0.55 * on]);
      }
    }
    if (anKind === "procession" && anAmt > 0.02) {
      const head = (performance.now() / 1000) * 1.15 % 320;
      for (let i = 0; i < 6; i++) {
        const d = head - i * 7 - 150;
        const wx = skyAn.x0 + Math.sin(skyAn.az) * d, wz = skyAn.z0 + Math.cos(skyAn.az) * d;
        octa(wx, height(wx, wz) + 5.5, wz, 0.85, [1.0, 0.8, 0.45]);
      }
    }
    return new Float32Array(v);
  };

  /* UNDERTOW, instanced: ten loose things the world lets you move */

  /* ————— the other one —————
     There is a second presence in the world, and the world does
     not explain her. She walks the high ground at night in a long
     dark shroud, with a thin ring of soft light above her head
     whose colour drifts like weather. She keeps her distance.
     She tends the land the walker scars. Where she has stood, a
     small ring of pale stones sometimes remains. The Dreamer
     mentions her only sideways, and she is not in any hint, any
     label, any ledger line. She favours strange worlds and kind
     accounts; where the account is cruel, she simply does not
     come. Nobody is told who she is. */
  const vesper = { on: false, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, nextAt: 45 + Math.random() * 60, absent: false, retargetAt: 0, tendAt: 0, hueSeed: Math.random() * 10, watch: 0 };
  interface Sign { x: number; z: number; k: number }
  let signs: Sign[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(skey(`simulacrum-signs-${seed}`)) || "[]") as Array<unknown>;
    signs = raw.map((e) => Array.isArray(e) ? { x: e[0] as number, z: e[1] as number, k: 0 } : e as Sign);
  } catch { signs = []; }
  let signMesh: Mesh | null = null;
  const rebuildSigns = () => {
    if (signMesh) { gl.deleteBuffer(signMesh.buf); signMesh = null; }
    if (!signs.length) return;
    const v: number[] = [];
    const col: [number, number, number] = [0.80, 0.83, 0.88];
    for (const sg of signs) {
      const sy = height(sg.x, sg.z);
      if (sy < 0.2) continue;
      if (sg.k === 1) {
        /* a single black feather, standing where she stood */
        octa(v, sg.x, sy + 0.42, sg.z, 0.05, 0.46, 0.13, [0.05, 0.04, 0.09]);
        continue;
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const ox = sg.x + Math.cos(a) * 1.15, oz = sg.z + Math.sin(a) * 1.15;
        const oy = height(ox, oz);
        if (oy < 0.2) continue;
        octa(v, ox, oy + 0.13, oz, 0.15, 0.17, 0.15, col, a);
      }
    }
    if (v.length) signMesh = makeMesh(new Float32Array(v));
  };
  rebuildSigns();
  const leaveSign = (x: number, z: number) => {
    if (signs.some((sg) => Math.hypot(sg.x - x, sg.z - z) < 14)) return;
    signs.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, k: Math.random() < 0.3 ? 1 : 0 });
    if (signs.length > 28) signs = signs.slice(-28);
    try { localStorage.setItem(skey(`simulacrum-signs-${seed}`), JSON.stringify(signs)); } catch { /* private mode */ }
    rebuildSigns();
  };
  const buildFigure = (coat: [number, number, number], hem: [number, number, number], face: [number, number, number]): Mesh => {
    /* a true shape, closed and honestly lit: a shroud of three
       tapered volumes and a faceted head — no painted normals */
    const v: number[] = [];
    prism(v, 0, 0, 0, 0.55, 0.33, 1.15, 7, coat);
    prism(v, 0, 1.15, 0, 0.33, 0.15, 0.71, 7, hem);
    prism(v, 0, 1.86, 0, 0.15, 0.02, 0.28, 7, coat);
    /* shoulders, and arms that hang and lean in at the top */
    prism(v, 0, 1.50, 0, 0.35, 0.24, 0.30, 7, hem);
    prism(v, 0.38, 0.68, 0, 0.05, 0.095, 0.88, 5, coat, -0.14, 0);
    prism(v, -0.38, 0.68, 0, 0.05, 0.095, 0.88, 5, coat, 0.14, 0);
    octa(v, 0, 2.02, 0, 0.155, 0.20, 0.155, face);
    return makeMesh(new Float32Array(v));
  };
  const vesperMesh = buildFigure([0.09, 0.10, 0.15], [0.13, 0.14, 0.20], [0.80, 0.82, 0.86]);
  /* ————— the spirit —————
     The maker of the world walks it sometimes, as a spirit of
     light: tall, bright, unhurried, never to be caught. It does
     not speak, and nothing in the world names it. Gold motes
     rise off it as it goes. Where it stood when it went, a white
     flower is growing. (Chase asked to be in his world; this is
     him, as the world holds him.) */
  const spirit = { on: false, x: 0, z: 0, yaw: 0, nextAt: 200 + Math.random() * 260, until: 0, counted: false, moteAt: 0 };
  const spiritMesh = buildFigure([0.93, 0.89, 0.79], [0.99, 0.95, 0.85], [1.0, 0.98, 0.92]);
  const spiritStep = (nowS: number) => {
    if (!spirit.on) {
      if (nowS < spirit.nextAt) return;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2, d = 55 + Math.random() * 30;
        const bx = px + Math.sin(a) * d, bz = pz + Math.cos(a) * d;
        if (height(bx, bz) < 0.4) continue;
        spirit.x = bx; spirit.z = bz; spirit.on = true; spirit.counted = false;
        spirit.until = nowS + 70 + Math.random() * 50;
        spirit.yaw = Math.atan2(px - bx, pz - bz);
        tow.burst(bx, height(bx, bz) + 1.2, bz, { n: 22, col: [1.0, 0.9, 0.6], spd: 1.4, up: 2.2, grav: -1.4, drag: 1.2, life: 1.8, size: 2.4 });
        return;
      }
      spirit.nextAt = nowS + 60;
      return;
    }
    const dx = px - spirit.x, dz = pz - spirit.z, d = Math.hypot(dx, dz);
    spirit.yaw = Math.atan2(dx, dz);
    if (!spirit.counted && d < 130) { spirit.counted = true; deeds.spirit++; saveDeeds(); }
    if (nowS > spirit.moteAt) {
      spirit.moteAt = nowS + 2.5 + Math.random() * 2;
      tow.burst(spirit.x, height(spirit.x, spirit.z) + 0.4, spirit.z, { n: 5, col: [1.0, 0.92, 0.66], spd: 0.5, up: 1.5, grav: -1.8, drag: 1.0, life: 2.2, size: 2.0 });
    }
    if (d < 20 || nowS > spirit.until) {
      /* it does not flee. it simply is not there any more */
      tow.burst(spirit.x, height(spirit.x, spirit.z) + 1.2, spirit.z, { n: 26, col: [1.0, 0.92, 0.66], spd: 1.8, up: 2.4, grav: -1.2, drag: 1.1, life: 1.7, size: 2.4 });
      if (height(spirit.x, spirit.z) > 0.3 && blooms.length < 210) {
        blooms.push({ x: spirit.x, z: spirit.z, kind: 4, born: Date.now(), seen: Date.now() });
        try { localStorage.setItem(skey(`simulacrum-blooms-${seed}`), JSON.stringify(blooms)); } catch { /* kept in memory */ }
        rebuildAllBlooms();
      }
      spirit.on = false;
      spirit.nextAt = nowS + 360 + Math.random() * 420;
    }
  };
  const haloBuf = gl.createBuffer()!;
  const vesperSay = (line: string) => { whisper.textContent = line; whisper.style.opacity = "1"; whisperTimer = 7; };
  const vesperStep = (dt: number, nowS: number) => {
    const night = skyColors(dayT, 0).night;
    if (night < 0.12) vesper.absent = false;
    if (!vesper.on) {
      /* the bell calls her to the far hill, even by day */
      if (anKind === "bell" && anAmt > 0.3 && night > 0.04 && !vesper.absent && judgmentNow >= -0.45 && Math.random() < 0.5) {
        let bx = 0, bz = 0, bh = -1;
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2, d = 105 + Math.random() * 40;
          const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d, h = height(x, z);
          if (h > bh) { bh = h; bx = x; bz = z; }
        }
        if (bh > 1.2) {
          vesper.x = bx; vesper.z = bz; vesper.tx = bx; vesper.tz = bz;
          vesper.yaw = Math.atan2(px - bx, pz - bz);
          vesper.on = true; vesper.watch = nowS + 16;
          return;
        }
      }
      if (nowS < vesper.nextAt || night < 0.30 || vesper.absent) return;
      if (judgmentNow < -0.45) { vesper.absent = true; return; }
      if (Math.random() > 0.25 + strangeNow * 0.75) { vesper.nextAt = nowS + 20 + Math.random() * 30; return; }
      let bx = 0, bz = 0, bh = -1;
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, d = 55 + Math.random() * 45;
        const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d, h = height(x, z);
        if (h > bh) { bh = h; bx = x; bz = z; }
      }
      if (bh < 0.35 || (bh < 1.0 && Math.random() < 0.5)) { vesper.nextAt = nowS + 30; return; }
      vesper.x = bx; vesper.z = bz; vesper.tx = bx; vesper.tz = bz;
      vesper.yaw = Math.atan2(px - bx, pz - bz);
      vesper.on = true; vesper.retargetAt = nowS + 10;
      if (Math.random() < 0.35) vesperSay(["the other one is walking tonight", "she is out. do not follow", "the high places are hers tonight"][Math.floor(Math.random() * 3)]);
      return;
    }
    /* dawn takes her */
    if (night < 0.15) {
      vesper.on = false; vesper.nextAt = nowS + 150 + Math.random() * 200;
      if (Math.random() < 0.5) leaveSign(vesper.x, vesper.z);
      return;
    }
    const dx = px - vesper.x, dz = pz - vesper.z;
    const d = Math.hypot(dx, dz);
    /* while she watches, she does not walk — she only turns */
    if (nowS < vesper.watch) {
      vesper.yaw = Math.atan2(dx, dz);
      if (d < 9) { vesper.watch = 0; }
      else return;
    }
    if (d < 15) {
      tow.burst(vesper.x, height(vesper.x, vesper.z) + 1.4, vesper.z, { n: 26, col: [0.72, 0.6, 1.0], spd: 2.2, up: 1.6, grav: -0.8, drag: 1.2, life: 1.5, size: 2.6 });
      leaveSign(vesper.x, vesper.z);
      vesper.on = false; vesper.nextAt = nowS + 260 + Math.random() * 200;
      if (Math.random() < 0.4) vesperSay("she does not like to be followed");
      return;
    }
    /* her path: keep the distance she prefers */
    if (d < 34 || nowS > vesper.retargetAt) {
      vesper.retargetAt = nowS + 12 + Math.random() * 10;
      const away = Math.atan2(vesper.x - px, vesper.z - pz) + (Math.random() - 0.5) * 1.2;
      const dd = d < 34 ? 68 + Math.random() * 20 : 55 + Math.random() * 45;
      vesper.tx = px + Math.sin(away) * dd; vesper.tz = pz + Math.cos(away) * dd;
    }
    const mx = vesper.tx - vesper.x, mz = vesper.tz - vesper.z;
    const md = Math.hypot(mx, mz);
    if (md > 1.2) {
      const sp = d < 22 ? 6.4 : d < 34 ? 4.1 : 1.15;
      const nx = vesper.x + (mx / md) * Math.min(md, sp * dt);
      const nz = vesper.z + (mz / md) * Math.min(md, sp * dt);
      if (height(nx, nz) > 0.25) {
        vesper.yaw = Math.atan2(mx, mz);
        vesper.x = nx; vesper.z = nz;
      }
    }
    /* she tends what the walker has scarred, a little at a time */
    if (nowS > vesper.tendAt) {
      vesper.tendAt = nowS + 2.5;
      let bestK = "", bestV = 0;
      for (const [k, v] of edits) {
        if (Math.abs(v) < 0.3) continue;
        const [gx, gz] = k.split(",").map(Number);
        if (Math.hypot(gx * 2 - vesper.x, gz * 2 - vesper.z) < 26 && Math.abs(v) > Math.abs(bestV)) { bestK = k; bestV = v; }
      }
      if (bestK) {
        const next = bestV - Math.sign(bestV) * 0.06;
        if (Math.abs(next) < 0.05) edits.delete(bestK); else edits.set(bestK, next);
        persistEdits();
        const [gx, gz] = bestK.split(",").map(Number);
        for (const [k, ch] of chunks) {
          const [cx, cz] = k.split(",").map(Number);
          if (Math.abs((cx + 0.5) * CHUNK - gx * 2) < CHUNK + 4 && Math.abs((cz + 0.5) * CHUNK - gz * 2) < CHUNK + 4) {
            gl.deleteBuffer(ch.terrain.buf);
            if (ch.lit) gl.deleteBuffer(ch.lit.buf);
            if (ch.glow) gl.deleteBuffer(ch.glow.buf);
            chunks.delete(k);
          }
        }
      }
    }
  };

  let tow = new Undertow(height);
  const seedBodies = () => {
    const kinds: Array<[number, number, number]> = [
      [0, 0.42, 0.55], [1, 0.34, 1.6], [2, 0.5, 1.05], [0, 0.38, 0.55], [1, 0.3, 1.6],
      [2, 0.55, 1.05], [0, 0.46, 0.55], [1, 0.36, 1.6], [0, 0.4, 0.55], [2, 0.48, 1.05],
    ];
    kinds.forEach(([kind, r, buoy], i) => {
      const a = (i / kinds.length) * Math.PI * 2 + 0.4;
      const rr = 14 + (i % 5) * 9;
      const bx = 8 + Math.sin(a) * rr, bz = 8 + Math.cos(a) * rr;
      tow.bodies.push({ x: bx, y: Math.max(height(bx, bz), 0) + r + 0.1, z: bz, vx: 0, vy: 0, vz: 0, r, kind, buoy, asleep: true, wet: false, calm: 0 });
    });
  };
  seedBodies();
  const partBuf = gl.createBuffer()!;
  /* the far ranges: a silhouette ring on the horizon, a function of
     world position so it holds still while the walker moves */
  const ringBuf = gl.createBuffer()!;
  let ringCell: [number, number] = [1e9, 1e9];
  const farNoise = new Noise(777);
  const ringVerts = (): Float32Array => {
    const gx = Math.round(px / 160), gz = Math.round(pz / 160);
    if (ringCell[0] === gx && ringCell[1] === gz) return new Float32Array(0);
    ringCell = [gx, gz];
    const v: number[] = [];
    const SEG = 110, RR = 830;
    const prof = (a: number): number => {
      const wx = px + Math.sin(a) * RR, wz = pz + Math.cos(a) * RR;
      const n = farNoise.fbm(wx * 0.0016 + 40, wz * 0.0016 + 9, 3);
      return 26 + n * 150;
    };
    const col: [number, number, number] = [0.10, 0.13, 0.20];
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      const x0 = px + Math.sin(a0) * RR, z0 = pz + Math.cos(a0) * RR;
      const x1 = px + Math.sin(a1) * RR, z1 = pz + Math.cos(a1) * RR;
      const h0 = prof(a0), h1 = prof(a1);
      v.push(x0, -6, z0, ...col, 0, 1, 0, x1, -6, z1, ...col, 0, 1, 0, x1, h1, z1, ...col, 0, 1, 0);
      v.push(x0, -6, z0, ...col, 0, 1, 0, x1, h1, z1, ...col, 0, 1, 0, x0, h0, z0, ...col, 0, 1, 0);
    }
    return new Float32Array(v);
  };
  const partData = new Float32Array(512 * 7);
  const bodiesVerts = (t: number): Float32Array => {
    const v: number[] = [];
    const cols: Array<[number, number, number]> = [[0.36, 0.34, 0.33], [0.95, 0.85, 0.55], [0.42, 0.30, 0.18]];
    for (const b of tow.bodies) {
      const col = cols[b.kind];
      const sy = b.kind === 1 ? b.y + tow.swell(b.x, b.z, t) * 0.4 : b.y;
      const stretch = b.kind === 2 ? 2.3 : 1;
      const T: [number, number, number] = [b.x, sy + b.r, b.z], B: [number, number, number] = [b.x, sy - b.r * 0.8, b.z];
      const ring: Array<[number, number, number]> = [
        [b.x + b.r * stretch, sy, b.z], [b.x, sy, b.z + b.r], [b.x - b.r * stretch, sy, b.z], [b.x, sy, b.z - b.r],
      ];
      for (let k = 0; k < 4; k++) {
        const A = ring[k], C = ring[(k + 1) % 4];
        v.push(...T, ...col, 0, 1, 0, ...A, ...col, 0, 1, 0, ...C, ...col, 0, 1, 0);
        v.push(...B, ...col, 0, 1, 0, ...C, ...col, 0, 1, 0, ...A, ...col, 0, 1, 0);
      }
    }
    return new Float32Array(v);
  };

  /* ---- walker + weather state ---- */
  let viewRadius = RADIUS;
  /* ————— THE IRIS —————
     The world's eye, and its judgement of the machine it runs
     on. Four axes — resolution, view radius, shadow size, field
     density — each on its own ladder. In auto it probes the
     machine at first light, then keeps account of frame time:
     sustained pressure degrades one axis at a time (resolution
     first, density last), sustained headroom raises them again
     (radius first — seeing further is worth most). The user may
     pin a level instead; a pin is honoured, but the Iris keeps
     a safety hand on resolution alone, and gives it back when
     the machine breathes again. Nothing oscillates: every axis
     cools down after it moves, and up-steps demand far more
     evidence than down-steps. */
  const IRIS_MODES = ["auto", "low", "balanced", "rich", "ultra"] as const;
  type IrisMode = typeof IRIS_MODES[number];
  type IrisAxes = { res: number; radius: number; shadow: number; density: number };
  const IRIS_CEIL: Record<IrisMode, IrisAxes> = {
    auto: { res: 5, radius: 2, shadow: 3, density: 3 },
    low: { res: 1, radius: 0, shadow: 1, density: 1 },
    balanced: { res: 2, radius: 1, shadow: 2, density: 2 },
    rich: { res: 4, radius: 2, shadow: 2, density: 3 },
    ultra: { res: 5, radius: 2, shadow: 3, density: 3 },
  };
  const IRIS_PIN: Record<IrisMode, IrisAxes | null> = {
    auto: null,
    low: { res: 1, radius: 0, shadow: 1, density: 0 },
    balanced: { res: 2, radius: 1, shadow: 2, density: 2 },
    rich: { res: 4, radius: 2, shadow: 2, density: 3 },
    ultra: { res: 5, radius: 2, shadow: 3, density: 3 },
  };
  /* resolution is a SCALE of the stage's true size, never an absolute
     number: the world must fill its window exactly, on any browser,
     at any window shape, maximised or not */
  const RES_SCALE = [0.5, 0.65, 0.8, 1.0, 1.2, 1.45];
  let lastFitW = 0, lastFitH = 0;
  const fitCanvas = () => {
    const cw = stage.clientWidth, ch = stage.clientHeight;
    if (!cw || !ch) return;
    lastFitW = cw; lastFitH = ch;
    wrap.classList.toggle("sim-narrow", cw < 680);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = RES_SCALE[iris.res] * dpr;
    const w = Math.max(320, Math.min(2560, Math.round(cw * s)));
    const h = Math.max(200, Math.min(1600, Math.round(ch * s)));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const RADIUS_LADDER = [2, 3, 4];
  const SHADOW_LADDER = [0, 1024, 2048, 4096];
  const DENSITY_LADDER = [0, 0.5, 1, 1.6];
  const POINT_LADDER = [0.55, 0.8, 1, 1.35];
  const irisMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
  const irisProbe = (): IrisAxes => {
    let score = 0;
    if (!irisMobile) score += 2;
    if ((navigator.hardwareConcurrency || 4) >= 8) score += 1;
    const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (dm && dm >= 8) score += 1;
    if (window.screen.width >= 1920) score += 1;
    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        const r = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
        if (/apple m\d|nvidia|geforce|radeon rx|rtx/i.test(r)) score += 1;
        if (/swiftshader|llvmpipe|software|basic render/i.test(r)) score -= 2;
      }
    } catch { /* a masked renderer is no evidence either way */ }
    if (score <= 1) return { res: 1, radius: 0, shadow: 1, density: 1 };
    if (score <= 3) return { res: 2, radius: 1, shadow: 2, density: 2 };
    return { res: 3, radius: 1, shadow: 2, density: 2 };
  };
  let irisMode: IrisMode = "auto";
  try {
    const m = localStorage.getItem(skey("simulacrum-iris")) || "auto";
    if ((IRIS_MODES as readonly string[]).includes(m)) irisMode = m as IrisMode;
  } catch { /* private mode */ }
  const iris: IrisAxes = IRIS_PIN[irisMode] ? { ...IRIS_PIN[irisMode]! } : irisProbe();
  const irisClamp = (a: IrisAxes): IrisAxes => {
    const ceil = IRIS_CEIL[irisMode];
    const cap = (v: number, c: number, hard: number) => Math.max(0, Math.min(v, c, hard));
    return {
      res: cap(a.res, ceil.res, irisMobile ? 3 : 5),
      radius: cap(a.radius, ceil.radius, 2),
      shadow: cap(a.shadow, ceil.shadow, irisMobile ? 2 : 3),
      density: cap(a.density, ceil.density, 3),
    };
  };
  let detailMul = DENSITY_LADDER[iris.density];
  const irisApply = (axis: keyof IrisAxes) => {
    const c = irisClamp(iris);
    iris.res = c.res; iris.radius = c.radius; iris.shadow = c.shadow; iris.density = c.density;
    if (axis === "res") fitCanvas();
    if (axis === "radius") viewRadius = RADIUS_LADDER[iris.radius];
    if (axis === "shadow" && SHADOW_LADDER[iris.shadow] > 0 && SHADOW_LADDER[iris.shadow] !== shadowSize) buildShadowTarget(SHADOW_LADDER[iris.shadow]);
    if (axis === "density") {
      detailMul = DENSITY_LADDER[iris.density];
      /* density now lives in the baked ground cover — clear the
         chunks so the land re-grows at the new richness */
      for (const ch of chunks.values()) { gl.deleteBuffer(ch.terrain.buf); if (ch.lit) gl.deleteBuffer(ch.lit.buf); if (ch.glow) gl.deleteBuffer(ch.glow.buf); }
      chunks.clear();
      const pm = POINT_LADDER[iris.density];
      gl.deleteBuffer(motes.buf); gl.deleteBuffer(rainPts.buf); gl.deleteBuffer(meteorPts.buf);
      motes = makePoints(Math.round(130 * pm), [60, 24, 60], [0.85, 0.95, 0.60], [1.6, 3.2], seed ^ 0x9e37 & 0xffffff);
      rainPts = makePoints(Math.round(420 * pm), [70, 44, 70], [0.65, 0.75, 0.95], [1.2, 1.8], seed ^ 0x7a11 & 0xffffff);
      meteorPts = makePoints(Math.round(170 * pm), [90, 40, 90], [0.92, 0.96, 1.0], [1.0, 1.7], seed ^ 0x9ee7 & 0xffffff);
    }
  };
  const irisApplyAll = () => { (["res", "radius", "shadow", "density"] as Array<keyof IrisAxes>).forEach(irisApply); };
  irisApplyAll();
  let emaMs = 16, irisOver = 0, irisUnder = 0, irisCoolUntil = 0;
  const irisCool: Record<keyof IrisAxes, number> = { res: 0, radius: 0, shadow: 0, density: 0 };
  const irisTick = (dtMs: number, nowS: number) => {
    emaMs = emaMs * 0.95 + Math.min(100, dtMs) * 0.05;
    const dt = dtMs / 1000;
    if (emaMs > 24) { irisOver += dt; irisUnder = 0; }
    else if (emaMs < 12.5) { irisUnder += dt; irisOver = 0; }
    else { irisOver = 0; irisUnder = 0; }
    const pin = IRIS_PIN[irisMode];
    if (irisOver > 1.1 && nowS > irisCoolUntil) {
      /* degrade: resolution first, density last; a pinned level
         only ever lends its resolution to safety */
      const order: Array<keyof IrisAxes> = pin ? ["res"] : ["res", "shadow", "radius", "density"];
      for (const axis of order) {
        const floor = pin ? (axis === "res" ? 0 : pin[axis]) : 0;
        if (iris[axis] > floor && nowS > irisCool[axis]) {
          iris[axis]--;
          irisApply(axis);
          irisCool[axis] = nowS + 4;
          irisCoolUntil = nowS + 2.5;
          irisOver = 0;
          break;
        }
      }
    } else if (irisUnder > 5 && nowS > irisCoolUntil) {
      /* restore/raise: seeing further is worth most */
      const target = pin ?? IRIS_CEIL[irisMode];
      const order: Array<keyof IrisAxes> = ["radius", "shadow", "res", "density"];
      for (const axis of order) {
        if (iris[axis] < target[axis] && nowS > irisCool[axis]) {
          iris[axis]++;
          irisApply(axis);
          irisCool[axis] = nowS + 4;
          irisCoolUntil = nowS + 2.5;
          irisUnder = 0;
          break;
        }
      }
    }
  };
  const irisSetMode = (m: IrisMode) => {
    irisMode = m;
    try { localStorage.setItem(skey("simulacrum-iris"), m); } catch { /* private mode */ }
    const pin = IRIS_PIN[m];
    if (pin) { iris.res = pin.res; iris.radius = pin.radius; iris.shadow = pin.shadow; iris.density = pin.density; }
    irisApplyAll();
    irisOver = 0; irisUnder = 0;
  };

  let px = 8, pz = 8, py = height(8, 8) + 26;
  let yaw = 0.7, pitch = -0.16, flying = false, vy = 0;
  let coyoteT = 0, jumpBufT = 0, prevSpace = false;
  let vx = 0, vz = 0, bobPhase = 0, bobAmp = 0, landDip = 0, wasGrounded = true, wasInWater = false, strideAcc = 0;
  let keys = new Set<string>();
  /* the gifts */
  let starlightOn = false, stormUntil = 0, openingOpen = false;
  /* strangeness state, mirrored from the Dreamer's intents */
  let anKind = "", anAmt = 0, lastAnKind = "", birdsFlee = 0, glassT = 0, judgmentNow = 0, strangeNow = 0.3;
  let stoneMesh: Mesh | null = null;
  const skyAn = { az: 0, el: 0.5, sp: 0.01, x0: 0, z0: 0 };
  const cool = new Map<string, number>();
  const saidGift = new Set<string>();
  let locked = false, touched = false, muted = false;
  const now0 = new Date();
  let dayT = (now0.getHours() + now0.getMinutes() / 60 + now0.getSeconds() / 3600) / 24;
  let timeSkew = 0;
  let weather: Weather = "clear";
  let mistAmt = 0, rainAmt = 0, flash = 0;
  let idleFor = 0, explored = 0, chimeCount = 0, thinkClock = 0, hSpeedNow = 0;
  let auroraAmt = 1, attendAmt = 0, showerAmt = 0;
  let whisperTimer = 0;
  const spawn = () => { px = 8; pz = 8; py = height(px, pz) + 26; yaw = 0.7; pitch = -0.16; vx = 0; vz = 0; vy = 0; };
  spawn();

  /* the making: begin starts the world's processes; until the
     wanted field stands complete the world cannot be taken. The
     full loading screen belongs to the first making of a world —
     after that, the world wakes behind its title instead */
  let begun = false;
  let worldReady = false;
  let warming = false;
  let warmFrames = 0;
  const finishWarm = () => {
    warming = false;
    worldReady = true;
    titleScr.classList.remove("held", "waiting");
    titleKeys.textContent = "the opening · tab — starlight · 1 — blink · q — stormcall · x — bloom · b";
    if (warmFullPending) {
      try { localStorage.setItem(skey("simulacrum-warm"), `${WARM_SPEC}:${seed}`); } catch { /* private mode */ }
      loadScr.classList.add("done");
      window.setTimeout(() => loadScr.remove(), 950);
    }
  };
  startBegin.addEventListener("click", () => {
    if (begun) return;
    begun = true;
    if (!audio.live) audio.start();
    audio.kick();
    startScr.classList.add("taken");
    window.setTimeout(() => startScr.remove(), 1250);
    warming = true;
    warmFrames = 0;
    if (warmFullPending) loadScr.style.display = "flex";
    else {
      titleScr.classList.add("waiting");
      titleKeys.textContent = "the world is waking";
    }
  });
  const takeWorld = () => {
    if (!worldReady) return;
    touched = true;
    titleScr.classList.add("taken");
    if (!audio.live) { audio.start(); audio.ui("take"); }
    audio.kick();
    if (!greeted) { greeted = true; dreamer.greet(rec.visits > 1, wName); }
    if (!locked && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  };
  canvas.addEventListener("click", takeWorld);
  titleScr.addEventListener("click", takeWorld);
  /* Safari keeps an AudioContext suspended until a resume() lands
     inside a genuine gesture — so every real gesture in the app
     kicks it, not just the first click */
  wrap.addEventListener("pointerdown", () => audio.kick(), true);
  const visKick = () => { if (!document.hidden) audio.kick(); };
  document.addEventListener("visibilitychange", visKick);
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    /* dead zone + clamp: pointer-lock deltas trickle on some
       browsers (Safari synthesizes them at screen edges) and a
       resting hand's micro-jitter otherwise becomes a slow,
       constant veer while walking */
    const mx = Math.abs(e.movementX) < 1 ? 0 : Math.max(-80, Math.min(80, e.movementX));
    const my = Math.abs(e.movementY) < 1 ? 0 : Math.max(-80, Math.min(80, e.movementY));
    yaw -= mx * 0.0024;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - my * 0.0024));
  });
  const kd = (e: KeyboardEvent) => {
    if (!body.isConnected) return;
    audio.kick();
    if (locked || touched) keys.add(e.code);
    if ((locked || touched) && e.code === "KeyF") { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; audio.ui("toggle"); if (!flying) py = Math.max(py, height(px, pz) + 1.7); }
    if (GIFTS_LIVE && (locked || touched) && e.code === "KeyR") castShape(1);
    if (GIFTS_LIVE && (locked || touched) && e.code === "KeyG") castShape(-1);
    if (GIFTS_LIVE && (locked || touched) && e.code === "KeyQ") castBlink();
    if (GIFTS_LIVE && (locked || touched) && e.code === "KeyX") castStorm();
    if (GIFTS_LIVE && (locked || touched) && e.code === "KeyB") castBloom();
    if (GIFTS_LIVE && (locked || touched) && e.code === "Digit1") toggleStarlight();
    if ((locked || touched) && e.code === "KeyE") plantBloom();
    if (GIFTS_LIVE && e.code === "Tab" && body.contains(wrap)) { e.preventDefault(); toggleOpening(); }
    if (e.code === "KeyM" && body.contains(wrap)) setMenu(!menuOpen);
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.code);
  document.addEventListener("keydown", kd);
  document.addEventListener("keyup", ku);
  flyBtn.addEventListener("click", () => { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; audio.ui("toggle"); if (!flying) py = Math.max(py, height(px, pz) + 1.7); });
  irisBtn.textContent = `iris: ${irisMode}`;
  irisBtn.addEventListener("click", () => {
    const next = IRIS_MODES[(IRIS_MODES.indexOf(irisMode) + 1) % IRIS_MODES.length];
    irisSetMode(next);
    irisBtn.textContent = `iris: ${irisMode}`;
    audio.ui("toggle");
  });
  commonsBtn.addEventListener("click", () => { if (netPhase === "off") enterCommons(); else leaveCommons(); audio.ui("toggle"); });
  photoBtn.addEventListener("click", () => {
    setMenu(false);
    wrap.classList.add("os-sim-photo");
    window.setTimeout(() => {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = el("a"); a.setAttribute("href", url); a.setAttribute("download", `${wName.toLowerCase()}-${seed}.png`); a.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        wrap.classList.remove("os-sim-photo");
      }, "image/png");
    }, 420);
  });
  const ready = (k: string, cd: number): boolean => {
    const now = performance.now();
    if ((cool.get(k) ?? 0) > now) return false;
    cool.set(k, now + cd * 1000);
    return true;
  };
  const giftNote = (k: string, ...lines: string[]) => {
    if (saidGift.has(k)) return;
    saidGift.add(k);
    dreamer.note(...lines);
  };
  const castShape = (dir: 1 | -1) => {
    if (!ready("shape", 0.35)) return;
    const tx = px - Math.sin(yaw) * 8, tz = pz - Math.cos(yaw) * 8;
    const R = 5;
    for (let gx = Math.floor((tx - R * 2) / 2); gx <= Math.ceil((tx + R * 2) / 2); gx++)
      for (let gz = Math.floor((tz - R * 2) / 2); gz <= Math.ceil((tz + R * 2) / 2); gz++) {
        const cxp = gx * 2, czp = gz * 2;
        const d = Math.hypot(cxp - tx, czp - tz);
        if (d > R * 2) continue;
        const fall = Math.max(0, 1 - d / (R * 2));
        const k = `${gx},${gz}`;
        const next = Math.max(-14, Math.min(14, (edits.get(k) ?? 0) + dir * 2.4 * fall * fall));
        edits.set(k, next);
      }
    if (edits.size > 4200) { const first = edits.keys().next().value as string; edits.delete(first); }
    persistEdits();
    tow.burst(tx, height(tx, tz) + 0.4, tz, { n: 20, col: [0.5, 0.42, 0.32], spd: 3.2, up: 3.6, grav: -12, life: 1.0, size: 2.6 });
    witness(dir < 0 ? "shapeDown" : "shapeUp");
    witnessLog.push(Date.now());
    while (witnessLog.length && witnessLog[0] < Date.now() - 25000) witnessLog.shift();
    if (witnessLog.length === 6) witness("shapeBurst");
    for (const [k, ch] of chunks) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.abs((cx + 0.5) * CHUNK - tx) < CHUNK + R * 2 && Math.abs((cz + 0.5) * CHUNK - tz) < CHUNK + R * 2) {
        gl.deleteBuffer(ch.terrain.buf);
        if (ch.lit) gl.deleteBuffer(ch.lit.buf);
        if (ch.glow) gl.deleteBuffer(ch.glow.buf);
        chunks.delete(k);
      }
    }
    waterCell = [1e9, 1e9];
    rebuildBlooms();
    audio.cast("shape");
    giftNote("shape", "the land moves for you. it allows this.");
  };
  const castBlink = () => {
    if (!ready("blink", 1.2)) return;
    const d = 26;
    px += -Math.sin(yaw) * d;
    pz += -Math.cos(yaw) * d;
    if (flying) py += Math.sin(pitch) * d * 0.6;
    else py = Math.max(py, height(px, pz) + 1.7);
    tow.burst(px, py - 1.2, pz, { n: 16, col: [0.72, 0.55, 1.0], spd: 3.0, up: 0.8, grav: -1.2, drag: 1.4, life: 0.9, size: 2.4, inward: true });
    audio.cast("blink");
    giftNote("blink", "you fold the world. it felt that.");
  };
  const castStorm = () => {
    if (!ready("storm", 20)) return;
    stormUntil = performance.now() / 1000 + 30;
    dreamer.forceWeather("rain");
    dreamer.insist(35, performance.now() / 1000);
    audio.cast("storm");
    witness("storm");
    giftNote("storm", "it did not make this weather. you did.");
  };
  /* places found — kept per world, whispered once */
  let foundSet = new Set<string>();
  try { foundSet = new Set(JSON.parse(localStorage.getItem(skey(`simulacrum-found-${seed}`)) || "[]") as string[]); } catch { foundSet = new Set(); }
  /* THE RECORD — what the walker has done in this world, kept per
     world and counted plainly in the menu. (The world's own
     account of the walker is a different matter, and is never
     numbered.) */
  const deeds: { chunks: string[]; strange: string[]; spirit: number } = (() => {
    try { const d = JSON.parse(localStorage.getItem(skey(`simulacrum-deeds-${seed}`)) || "{}"); return { chunks: Array.isArray(d.chunks) ? d.chunks : [], strange: Array.isArray(d.strange) ? d.strange : [], spirit: typeof d.spirit === "number" ? d.spirit : 0 }; }
    catch { return { chunks: [], strange: [], spirit: 0 }; }
  })();
  const saveDeeds = () => { try { localStorage.setItem(skey(`simulacrum-deeds-${seed}`), JSON.stringify(deeds)); } catch { /* the record is kept in memory */ } };
  let lastTendAt = 0;
  const WONDER_NAMES = ["the titan arch", "the standing ring", "the world spike", "the ribcage", "the first garden", "the three sisters"];
  const renderRecord = () => {
    const w = WONDER_NAMES.filter((n) => foundSet.has(n)).length;
    recordEl.replaceChildren(
      el("div", "os-note", `wonders found · ${w} of 6`),
      el("div", "os-note", `the home field walked · ${deeds.chunks.length} of 49`),
      el("div", "os-note", `places found · ${foundSet.size}`),
      el("div", "os-note", `strangenesses witnessed · ${deeds.strange.length}`),
      el("div", "os-note", `blooms planted · ${blooms.length}`),
      el("div", "os-note", `land shaped · ${edits.size} places`),
      ...(deeds.spirit > 0 ? [el("div", "os-note", `a spirit of light · seen ${deeds.spirit} ${deeds.spirit === 1 ? "time" : "times"}`)] : []),
    );
  };
  const checkDiscoveries = () => {
    for (const poi of pois) {
      if (foundSet.has(poi.name)) continue;
      const dx = px - poi.x, dz = pz - poi.z;
      if (dx * dx + dz * dz < poi.r * poi.r) {
        foundSet.add(poi.name);
        try { localStorage.setItem(skey(`simulacrum-found-${seed}`), JSON.stringify([...foundSet])); } catch { /* the land remembers even if storage cannot */ }
        whisper.textContent = `you found ${poi.name}`;
        whisper.style.opacity = "1";
        whisperTimer = 5.2;
        audio.chime(3);
        witness("kind");
      }
    }
  };

  /* planting is not a gift. it is an act — anyone may kneel and
     put a flower in the ground. (the gifts rest; this stays.) */
  const plantBloom = () => {
    if (!worldReady) return;
    const bx = px - Math.sin(yaw) * 4, bz = pz - Math.cos(yaw) * 4;
    if (height(bx, bz) < 0.2) return;
    if (netPhase === "on" && mqtt && mqtt.connected) mqtt.publish(stateTopic(), JSON.stringify({ t: "bloom", id: myId, x: Math.round(bx * 10) / 10, z: Math.round(bz * 10) / 10 }));
    tow.burst(bx, height(bx, bz) + 0.5, bz, { n: 14, col: [0.98, 0.62, 0.78], spd: 1.5, up: 2.4, grav: -2.0, drag: 1.1, life: 1.4, size: 2.1 });
    blooms.push({ x: bx, z: bz, kind: Math.floor(Math.random() * 4), born: Date.now(), seen: Date.now() });
    if (blooms.length > 220) blooms = blooms.slice(-220);
    try { localStorage.setItem(skey(`simulacrum-blooms-${seed}`), JSON.stringify(blooms)); } catch { /* private mode */ }
    rebuildAllBlooms();
    audio.chime(2);
  };
  const castBloom = () => {
    if (!ready("bloom", 2)) return;
    const bx = px - Math.sin(yaw) * 4, bz = pz - Math.cos(yaw) * 4;
    if (netPhase === "on" && mqtt && mqtt.connected) mqtt.publish(stateTopic(), JSON.stringify({ t: "bloom", id: myId, x: Math.round(bx * 10) / 10, z: Math.round(bz * 10) / 10 }));
    if (height(bx, bz) < 0.2) return;
    tow.burst(bx, height(bx, bz) + 0.5, bz, { n: 18, col: [0.98, 0.62, 0.78], spd: 1.7, up: 2.8, grav: -2.2, drag: 1.1, life: 1.6, size: 2.3 });
    blooms.push({ x: bx, z: bz, kind: Math.floor(Math.random() * 4), born: Date.now(), seen: Date.now() });
    if (blooms.length > 220) blooms = blooms.slice(-220);
    try { localStorage.setItem(skey(`simulacrum-blooms-${seed}`), JSON.stringify(blooms)); } catch { /* private mode */ }
    rebuildAllBlooms();
    audio.cast("bloom");
    witness("bloom");
    giftNote("bloom", "it will keep those flowers");
  };
  const toggleStarlight = () => {
    starlightOn = !starlightOn;
    if (starlightOn) { audio.cast("star"); giftNote("star", "a small star, on loan"); }
  };
  const toggleOpening = (open?: boolean) => {
    openingOpen = open ?? !openingOpen;
    opening.style.display = openingOpen ? "flex" : "none";
    if (openingOpen) {
      if (!openingFrame.getAttribute("src")) openingFrame.setAttribute("src", `${location.origin}/`);
      if (document.pointerLockElement) document.exitPointerLock();
      giftNote("opening", "it feels you open the sky, and finds a machine there");
    }
  };
  openingClose.addEventListener("click", () => toggleOpening(false));
  const powerDefs: Array<[string, string, () => void]> = [
    ["the opening", "Tab", () => toggleOpening()],
    ["starlight", "1", toggleStarlight],
    ["blink", "Q", castBlink],
    ["stormcall", "X", castStorm],
    ["bloom", "B", castBloom],
  ];
  for (const [label, keyHint, fn] of powerDefs) {
    const b = el("button", "os-btn os-sim-power", `${label} · ${keyHint}`);
    b.addEventListener("click", () => { if (!worldReady) return; if (!audio.live) audio.start(); audio.kick(); touched = true; titleScr.classList.add("taken"); setMenu(false); fn(); });
    powers.append(b);
  }
  let chromeTimer = 6;
  const chromeWake = () => { wrap.classList.add("chrome-on"); chromeTimer = 4; };
  /* one door for everything the slab used to carry: a small button,
     and a glass sheet that rises from it — toggles, the record, the keys */
  let menuOpen = false;
  function setMenu(open: boolean) {
    menuOpen = open;
    wrap.classList.toggle("menu-on", open);
    if (open) {
      renderRecord();
      chromeWake();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  }
  menuBtn.addEventListener("click", () => { audio.kick(); setMenu(!menuOpen); });
  canvas.addEventListener("pointerdown", () => { if (menuOpen) setMenu(false); });
  wrap.addEventListener("pointermove", chromeWake);
  wrap.addEventListener("pointerdown", chromeWake);
  wrap.addEventListener("touchstart", chromeWake, { passive: true });
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.requestFullscreen?.();
  };
  fsBtn.addEventListener("click", toggleFullscreen);
  canvas.addEventListener("dblclick", toggleFullscreen);
  sndBtn.addEventListener("click", () => {
    if (!audio.live) audio.start();
    muted = !muted;
    audio.setMuted(muted);
    sndBtn.textContent = muted ? "sound: off" : "sound: on";
  });


  /* stepping between worlds is the machine's business, not a
     lever on the bar: the walker's own world, and the commons */
  const swapWorld = (ns: number) => {
    seed = ns;
    noise = new Noise(seed);
    moistNoise = new Noise(seed ^ 0x5eed);
    detailNoise = new Noise(seed ^ 0xd37a);
    for (const ch of chunks.values()) { gl.deleteBuffer(ch.terrain.buf); if (ch.lit) gl.deleteBuffer(ch.lit.buf); if (ch.glow) gl.deleteBuffer(ch.glow.buf); }
    chunks.clear();
    waterCell = [1e9, 1e9];
    buildPaths();
    buildWonders();
    try { foundSet = new Set(JSON.parse(localStorage.getItem(skey(`simulacrum-found-${seed}`)) || "[]") as string[]); } catch { foundSet = new Set(); }
    audio.dispose();
    audio = new SimAudio(seed);
    if (touched) { audio.start(); audio.ui("world"); }
    motes = makePoints(130, [60, 24, 60], [0.85, 0.95, 0.60], [1.6, 3.2], seed ^ 0x9e37 & 0xffffff);
    rainPts = makePoints(420, [70, 44, 70], [0.65, 0.75, 0.95], [1.2, 1.8], seed ^ 0x7a11 & 0xffffff);
    meteorPts = makePoints(170, [90, 40, 90], [0.92, 0.96, 1.0], [1.0, 1.7], seed ^ 0x9ee7 & 0xffffff);
    edits = new Map();
    try {
      const raw = JSON.parse(localStorage.getItem(skey(`simulacrum-edits-${seed}`)) || "{}") as Record<string, number>;
      for (const k of Object.keys(raw)) edits.set(k, raw[k]);
    } catch { edits = new Map(); }
    try { blooms = JSON.parse(localStorage.getItem(skey(`simulacrum-blooms-${seed}`)) || "[]") as Bloom[]; } catch { blooms = []; }
    pruneBlooms();
    guestBlooms = [];
    rebuildBlooms();
    try {
      const raw = JSON.parse(localStorage.getItem(skey(`simulacrum-signs-${seed}`)) || "[]") as Array<unknown>;
      signs = raw.map((e) => Array.isArray(e) ? { x: e[0] as number, z: e[1] as number, k: 0 } : e as Sign);
    } catch { signs = []; }
    rebuildSigns();
    tow = new Undertow(height);
    seedBodies();
    wName = worldName(seed);
    rec = dreamRecord(seed);
    rec.visits++;
    rec.rapport = Math.min(1, rec.rapport + 0.05);
    persistRec();
    dreamer = new Dreamer(seed, rec.rapport, leanOf(rec));
    greeted = false;
    titleScr.classList.remove("taken");
    if (stoneMesh) { gl.deleteBuffer(stoneMesh.buf); stoneMesh = null; }
    vesper.on = false;
    vesper.nextAt = performance.now() / 1000 + 50;
    anKind = ""; lastAnKind = "";
    px = 8; pz = 8; py = height(8, 8) + (touched ? 1.7 : 26);
    refreshLabel();
  };

  /* ————— the commons —————
     Toggle it on, and the system matches you with whoever else
     has toggled on: you step into one shared world (the first
     world, Ekthora's seed) and walk it together. Presence only —
     figures in seed-coloured shrouds, names the forge gives,
     arrivals and departures spoken as whispers. No accounts, no
     text, nothing typed by anyone reaches anyone. The matching
     is the machine's: a shard is chosen by sky-band (walkers
     whose real sun is near yours) and by who is already there.
     If the wire cannot be reached, the world stays solo and
     says nothing about it. */
  interface Peer { id: string; name: string; hue: number; x: number; z: number; y: number; yaw: number; fly: boolean; cx: number; cz: number; cy: number; cyaw: number; lastSeen: number; greeted: boolean; mesh: Mesh | null }
  const myId = "w" + Math.random().toString(36).slice(2, 10);
  const myName = worldName(HOME_SEED);
  const myHue = (HOME_SEED % 360) / 360;
  const hueRgb = (h: number): [number, number, number] => [0.5 + 0.5 * Math.sin(h * 6.283 + 0.4), 0.5 + 0.5 * Math.sin(h * 6.283 + 2.5), 0.5 + 0.5 * Math.sin(h * 6.283 + 4.6)];
  const band = Math.round(-(new Date().getTimezoneOffset()) / 180);
  const hereBase = `sim/v1/c/b${band}`;
  let mqtt: MqttMini | null = null;
  let netPhase: "off" | "survey" | "on" = "off";
  let surveyAt = 0, shard = 0, sendClock = 0, hereClock = 0;
  const survey = new Map<number, Set<string>>();
  const stateTopic = () => `${hereBase}/s${shard}`;
  const hereTopic = () => `${hereBase}/s${shard}/here/${myId}`;
  const peerSay = (line: string) => { whisper.textContent = line; whisper.style.opacity = "1"; whisperTimer = 7; };
  const dropPeer = (id: string, silent: boolean) => {
    const pr = peers.get(id);
    if (!pr) return;
    if (pr.mesh) gl.deleteBuffer(pr.mesh.buf);
    peers.delete(id);
    if (!silent && pr.greeted) peerSay(`${pr.name} has gone from the world`);
    refreshLabel();
  };
  const netMessage = (topic: string, payload: string) => {
    const hereM = topic.match(/\/s(\d+)\/here\/(\w+)$/);
    if (hereM) {
      const sh = Number(hereM[1]), id = hereM[2];
      if (id === myId) return;
      if (!payload) {
        if (netPhase === "on" && sh === shard) dropPeer(id, false);
        survey.get(sh)?.delete(id);
        return;
      }
      let info: { name?: string; hue?: number; ts?: number };
      try { info = JSON.parse(payload) as { name?: string; hue?: number; ts?: number }; } catch { return; }
      if (netPhase === "survey") {
        if (info.ts && Date.now() - info.ts > 45000) return;
        if (!survey.has(sh)) survey.set(sh, new Set());
        survey.get(sh)!.add(id);
        return;
      }
      if (netPhase !== "on" || sh !== shard) return;
      const name = String(info.name || "a walker").replace(/[^A-Za-z ]/g, "").slice(0, 20) || "a walker";
      const hue = Math.max(0, Math.min(1, Number(info.hue) || 0));
      const ex = peers.get(id);
      if (ex) { ex.name = name; ex.hue = hue; ex.lastSeen = performance.now() / 1000; return; }
      peers.set(id, { id, name, hue, x: 8, z: 8, y: 30, yaw: 0, fly: false, cx: 8, cz: 8, cy: 30, cyaw: 0, lastSeen: performance.now() / 1000, greeted: true, mesh: null });
      peerSay(`${name} has come into the world`);
      refreshLabel();
      return;
    }
    if (topic === stateTopic() && netPhase === "on") {
      let st: { t?: string; id?: string; x?: number; z?: number; y?: number; yaw?: number; fly?: boolean };
      try { st = JSON.parse(payload) as typeof st; } catch { return; }
      if (!st.id || st.id === myId) return;
      if (st.t === "gone") { dropPeer(st.id, false); return; }
      if (st.t === "bloom") {
        const bx = Math.max(-2000, Math.min(2000, Number(st.x) || 0)), bz = Math.max(-2000, Math.min(2000, Number(st.z) || 0));
        if (height(bx, bz) > 0.2) {
          const rndB = mulberry32((bx * 131 + bz * 17 + 7) & 0xffffff);
          for (let i = 0; i < 7; i++) guestBlooms.push({ x: bx + (rndB() - 0.5) * 5, z: bz + (rndB() - 0.5) * 5, kind: Math.floor(rndB() * 4) });
          if (guestBlooms.length > 260) guestBlooms = guestBlooms.slice(-260);
          rebuildAllBlooms();
          tow.burst(bx, height(bx, bz) + 0.5, bz, { n: 14, col: [0.98, 0.62, 0.78], spd: 1.6, up: 2.6, grav: -2.2, drag: 1.1, life: 1.5, size: 2.2 });
        }
        return;
      }
      if (st.t !== "s") return;
      let pr = peers.get(st.id);
      if (!pr) {
        /* state IS presence: a walker already inside when you
           joined had their roster entry eaten by your survey —
           adopt them from their state; the roster refreshes
           their true name within the republish cycle */
        let hsh = 5381;
        for (let ci = 0; ci < st.id.length; ci++) hsh = ((hsh << 5) + hsh + st.id.charCodeAt(ci)) | 0;
        hsh = Math.abs(hsh);
        pr = { id: st.id, name: worldName(hsh), hue: (hsh % 100) / 100, x: 8, z: 8, y: 30, yaw: 0, fly: false, cx: 8, cz: 8, cy: 30, cyaw: 0, lastSeen: performance.now() / 1000, greeted: false, mesh: null };
        peers.set(st.id, pr);
      }
      const nx = Math.max(-2000, Math.min(2000, Number(st.x) || 0));
      const nz = Math.max(-2000, Math.min(2000, Number(st.z) || 0));
      if (!pr.greeted) { pr.cx = nx; pr.cz = nz; pr.greeted = true; peerSay(`${pr.name} has come into the world`); refreshLabel(); }
      else if (Math.hypot(pr.cx - nx, pr.cz - nz) > 60) { pr.cx = nx; pr.cz = nz; }
      pr.x = nx; pr.z = nz; pr.y = Math.max(-20, Math.min(400, Number(st.y) || 0)); pr.yaw = Number(st.yaw) || 0; pr.fly = !!st.fly;
      pr.lastSeen = performance.now() / 1000;
    }
  };
  const enterCommons = () => {
    if (netPhase !== "off") return;
    try { localStorage.setItem(skey("simulacrum-commons"), "1"); } catch { /* private mode */ }
    inCommons = true;
    commonsBtn.setAttribute("aria-pressed", "true");
    if (seed !== COMMONS_SEED) swapWorld(COMMONS_SEED); else refreshLabel();
    netPhase = "survey";
    survey.clear();
    surveyAt = performance.now() / 1000 + 1.4;
    openWire();
    peerSay("you step into the commons");
  };
  /* the will clears our roster entry if we vanish mid-step; the
     wire is reopened once the shard is known, so the will names
     the right roster topic */
  const openWire = () => {
    mqtt = new MqttMini(["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"], myId, hereTopic(), "");
    mqtt.onMessage = netMessage;
    mqtt.onReady = () => {
      mqtt!.subscribe(`${hereBase}/+/here/+`);
      if (netPhase === "on") {
        mqtt!.subscribe(stateTopic());
        mqtt!.publish(hereTopic(), JSON.stringify({ name: myName, hue: myHue, ts: Date.now() }), true);
      }
    };
    mqtt.onDown = () => {
      if (!inCommons || netPhase === "off") return;
      const dead = mqtt;
      window.setTimeout(() => { if (inCommons && netPhase !== "off" && mqtt === dead) openWire(); }, 5000);
    };
    mqtt.connect();
    startPulse();
  };
  const leaveCommons = () => {
    if (netPhase === "off") return;
    stopPulse();
    try { localStorage.setItem(skey("simulacrum-commons"), "0"); } catch { /* private mode */ }
    if (mqtt) {
      mqtt.publish(hereTopic(), "", true);
      mqtt.publish(stateTopic(), JSON.stringify({ t: "gone", id: myId }));
      const m = mqtt; mqtt = null;
      window.setTimeout(() => m.close(), 250);
    }
    for (const id of [...peers.keys()]) dropPeer(id, true);
    netPhase = "off";
    inCommons = false;
    commonsBtn.setAttribute("aria-pressed", "false");
    if (seed !== HOME_SEED) swapWorld(HOME_SEED); else refreshLabel();
    peerSay("you are home again");
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && netPhase === "on" && mqtt && mqtt.connected) {
      mqtt.publish(hereTopic(), JSON.stringify({ name: myName, hue: myHue, ts: Date.now() }), true);
    }
  });
  const sendPresence = () => {
    if (mqtt && mqtt.connected) mqtt.publish(stateTopic(), JSON.stringify({ t: "s", id: myId, x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10, y: Math.round(py * 10) / 10, yaw: Math.round(yaw * 100) / 100, fly: flying }));
  };
  const finishSurvey = () => {
    /* the matching: the fullest shard that still has room,
       else the emptiest — the machine chooses your company */
    let best = 0, bestN = -1;
    for (let sN = 0; sN < 3; sN++) {
        const n = survey.get(sN)?.size ?? 0;
        if (n < 6 && n > bestN) { bestN = n; best = sN; }
      }
      if (bestN < 0) { best = 0; let min = 1e9; for (let sN = 0; sN < 3; sN++) { const n = survey.get(sN)?.size ?? 0; if (n < min) { min = n; best = sN; } } }
      shard = best;
      netPhase = "on";
      if (mqtt && shard !== 0) { mqtt.close(); openWire(); }
      else if (mqtt) {
        mqtt.subscribe(stateTopic());
        mqtt.publish(hereTopic(), JSON.stringify({ name: myName, hue: myHue, ts: Date.now() }), true);
      }
      refreshLabel();
  };
  /* the pulse: presence must not ride the render loop — a
     backgrounded or occluded window's frames stop entirely in
     modern browsers, and its walker went silent with them. A
     one-second timer keeps the survey finishing and the state
     flowing (background timers hold ~1 Hz); the frame loop
     still sends at 4 Hz while visible, for smoothness. */
  let netPulse: number | null = null, pulseCount = 0;
  const startPulse = () => {
    if (netPulse !== null) return;
    netPulse = window.setInterval(() => {
      if (!mqtt || !mqtt.connected) return;
      if (netPhase === "survey" && performance.now() / 1000 >= surveyAt) finishSurvey();
      if (netPhase === "on") {
        sendPresence();
        pulseCount++;
        if (pulseCount % 20 === 0) mqtt.publish(hereTopic(), JSON.stringify({ name: myName, hue: myHue, ts: Date.now() }), true);
      }
    }, 1000);
  };
  const stopPulse = () => { if (netPulse !== null) { window.clearInterval(netPulse); netPulse = null; } };
  const netTick = (dt: number, nowS: number) => {
    if (netPhase === "survey" && nowS >= surveyAt) finishSurvey();
    if (netPhase === "on" && mqtt && mqtt.connected) {
      sendClock += dt;
      if (sendClock > 0.25) { sendClock = 0; sendPresence(); }
      hereClock += dt;
      if (hereClock > 20) { hereClock = 0; mqtt.publish(hereTopic(), JSON.stringify({ name: myName, hue: myHue, ts: Date.now() }), true); }
    }
    for (const pr of peers.values()) {
      const k = Math.min(1, dt * 5);
      pr.cx += (pr.x - pr.cx) * k;
      pr.cz += (pr.z - pr.cz) * k;
      const gy = pr.fly ? pr.y - 1.7 : height(pr.cx, pr.cz);
      pr.cy += (gy - pr.cy) * Math.min(1, dt * 6);
      let dy = pr.yaw - pr.cyaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      pr.cyaw += dy * k;
      if (nowS - pr.lastSeen > 14) dropPeer(pr.id, true);
    }
  };
  let lastTouch: { x: number; y: number } | null = null;
  canvas.addEventListener("touchstart", (e) => { touched = true; if (!audio.live) audio.start(); lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!lastTouch) return;
    const t = e.touches[0];
    /* steering needs a deliberate drag: a resting finger's
       micro-moves on glass once accumulated into a slow veer */
    const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y;
    if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
      yaw -= dx * 0.005;
      pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * 0.005));
      lastTouch = { x: t.clientX, y: t.clientY };
    }
    keys.add("KeyW");
  }, { passive: true });
  canvas.addEventListener("touchend", () => { lastTouch = null; keys.delete("KeyW"); });

  /* WebXR door */
  const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean>; requestSession(m: string, o: object): Promise<XRSessionLike> } }).xr;
  let xrSession: XRSessionLike | null = null;
  let xrRef: unknown = null;
  if (xr) {
    xr.isSessionSupported("immersive-vr").then((ok) => { if (!ok) xrBtn.style.display = "none"; }).catch(() => { xrBtn.style.display = "none"; });
  } else xrBtn.style.display = "none";
  xrBtn.addEventListener("click", async () => {
    if (!xr || !worldReady) return;
    try {
      xrSession = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"] });
      await xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      xrSession.requestReferenceSpace("local-floor").then((space) => { xrRef = space; });
      xrSession.addEventListener("end", () => { xrSession = null; });
    } catch { whisper.textContent = "VR refused here — the flat world still walks."; whisper.style.opacity = "1"; whisperTimer = 4; }
  });

  /* the turning year state itself is declared above seasonMoods —
     setTitle reads it during construction, via refreshLabel */
  /* ---- per-frame helpers ---- */
  const sunDir = (t: number): [number, number, number] => {
    const a = (t - 0.25) * Math.PI * 2;
    /* winter sun rides lower over the same land */
    return [Math.cos(a), Math.sin(a) * (1 - 0.25 * seasonNow.cold), 0.35];
  };
  const skyColors = (t: number, gloom: number): { zen: number[]; hor: number[]; sun: number[]; fog: number[]; night: number } => {
    const s = sunDir(t), day = Math.max(0, Math.min(1, s[1] * 2.4 + 0.35));
    const dusk = Math.max(0, 1 - Math.abs(s[1]) * 3.2);
    const mixc = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
    let zen = mixc([0.012, 0.02, 0.06], [0.19, 0.38, 0.72], day);
    let hor = mixc([0.05, 0.05, 0.10], [0.62, 0.74, 0.86], day);
    hor = mixc(hor, [0.98, 0.52, 0.28], dusk * 0.65);
    zen = mixc(zen, [0.30, 0.22, 0.42], dusk * 0.4);
    zen = mixc(zen, [0.16, 0.19, 0.24], gloom * 0.5);
    hor = mixc(hor, [0.36, 0.40, 0.45], gloom * 0.55);
    zen = mixc(zen, [0.52, 0.62, 0.78], seasonNow.cold * day * 0.22);
    hor = mixc(hor, [0.80, 0.84, 0.90], seasonNow.cold * day * 0.18);
    return { zen, hor, sun: [1.0, 0.85 - dusk * 0.25, 0.6 - dusk * 0.3], fog: hor, night: 1 - day };
  };
  const biomeAt = (x: number, z: number): string => {
    const h = height(x, z), m = moisture(x, z);
    if (h < -1.2) return "the deep";
    if (h < 0.6) return "the shore";
    if (h > 24) return "the high snowfields";
    if (h > 13) return "the bare heights";
    if (h > 10) return "the high pines";
    if (m > 0.58) return "the wet wilds";
    if (m < 0.30) return "the dry grass";
    return "the grasslands";
  };
  const surfaceAt = (x: number, z: number): string => {
    const h = height(x, z);
    if (h < 0.45) return "water";
    /* snow where the world wears it: the high fields always, and
       wherever the turning year has brought the winter down — the
       same bargain the ground shader strikes, struck for the ear */
    if (h > 24) return "snow";
    if (seasonNow.cold > 0.34 && h > 0.9) return "snow";
    if (pathDist(x, z) < 1.7) return "dirt";
    const se = 1.4;
    const sgx = (height(x + se, z) - height(x - se, z)) / (2 * se);
    const sgz = (height(x, z + se) - height(x, z - se)) / (2 * se);
    if (1 - 1 / Math.hypot(sgx, 1, sgz) > 0.42) return "rock";
    if (h < 0.95 || moisture(x, z) < 0.24) return "sand";
    return "grass";
  };

  let fogNear = 55, fogFar = 300;
  let lastChime = new Map<string, number>();
  let frames = 0;

  const render = (proj: M4, view: M4, eye: [number, number, number], clear = true) => {
    const nowS = performance.now() / 1000;
    const gloom = Math.max(mistAmt * 0.5, rainAmt * 0.8);
    const sc = skyColors(dayT, gloom);
    const sun = sunDir(dayT);
    const moon: [number, number, number] = [-sun[0], -sun[1], -sun[2]];
    const cover = (weather === "clear" ? 0.34 : weather === "mist" ? 0.55 : 0.85);
    if (clear) {
      gl.clearColor(sc.fog[0], sc.fog[1], sc.fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.DEPTH_TEST);
    /* sky */
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(skyPr);
    const rotOnly = new Float32Array(view); rotOnly[12] = 0; rotOnly[13] = 0; rotOnly[14] = 0;
    gl.uniformMatrix4fv(gl.getUniformLocation(skyPr, "uVP"), false, m4.mul(proj, rotOnly));
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uZen"), sc.zen);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uHor"), sc.hor);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunDir"), sun);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunCol"), sc.sun);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uMoonDir"), moon);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uNight"), sc.night);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uTime"), nowS);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uCover"), cover);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uGloom"), gloom);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uFlash"), flash);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uAurora"), auroraAmt);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uSecond"), anKind === "secondsun" ? anAmt : 0);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, skyMesh.buf);
      const a = gl.getAttribLocation(skyPr, "aPos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, 0);
      gl.drawArrays(gl.TRIANGLES, 0, skyMesh.n);
    }
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    const vp = m4.mul(proj, view);
    /* the far ranges, with their own long fog so they read as
       silhouettes against the horizon rather than washing out */
    {
      const rv = ringVerts();
      if (rv.length) { gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf); gl.bufferData(gl.ARRAY_BUFFER, rv, gl.DYNAMIC_DRAW); }
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.88);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uFog"), sc.fog);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogNear"), 500);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogFar"), 1500);
      gl.uniform2fv(gl.getUniformLocation(unlitPr, "uCam"), [eye[0], eye[2]]);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uOrigin"), [0, 0, 0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf);
      const aPos = gl.getAttribLocation(unlitPr, "aPos");
      const aCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.drawArrays(gl.TRIANGLES, 0, 110 * 6);
    }
    /* the sun's shadow pass: casters only, packed depth */
    shadowAmt = 0;
    if (shadowOK && SHADOW_LADDER[iris.shadow] > 0 && sun[1] > -0.08) {
      const tx = Math.round(eye[0] / 4) * 4, tz = Math.round(eye[2] / 4) * 4;
      const lEye: [number, number, number] = [tx + sun[0] * 360, sun[1] * 360, tz + sun[2] * 360];
      const lView = m4.lookAt(lEye, [tx, 0, tz], Math.abs(sun[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0]);
      lightVP = m4.mul(m4.ortho(-165, 165, -165, 165, 40, 720), lView);
      shadowAmt = 0.62 * Math.max(0, Math.min(1, (sun[1] + 0.08) * 3.2));
      const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const prevVP = gl.getParameter(gl.VIEWPORT) as Int32Array;
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
      gl.viewport(0, 0, shadowSize, shadowSize);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadowPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(shadowPr, "uMVP"), false, lightVP);
      const sPos = gl.getAttribLocation(shadowPr, "aPos");
      gl.enableVertexAttribArray(sPos);
      const cast = (buf: WebGLBuffer, n: number, model: M4) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(sPos, 3, gl.FLOAT, false, 36, 0);
        gl.uniformMatrix4fv(gl.getUniformLocation(shadowPr, "uModel"), false, model);
        gl.drawArrays(gl.TRIANGLES, 0, n);
      };
      for (const ch of chunks.values()) {
        cast(ch.terrain.buf, ch.terrain.n, m4.ident());
        if (ch.lit) cast(ch.lit.buf, ch.lit.n, m4.ident());
      }
      if (stoneMesh) cast(stoneMesh.buf, stoneMesh.n, m4.ident());
      if (lastBodiesN > 0) cast(critBuf, lastBodiesN, m4.ident());
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
      gl.viewport(prevVP[0], prevVP[1], prevVP[2], prevVP[3]);
    }
    /* world */
    gl.useProgram(litPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uCamPos"), eye);
    gl.uniform1f(gl.getUniformLocation(litPr, "uTime"), nowS);
    gl.uniform3f(gl.getUniformLocation(litPr, "uSeason"), seasonNow.cold, seasonNow.autumn, seasonNow.spring);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uRim"), [sc.hor[0] * 0.16, sc.hor[1] * 0.16, sc.hor[2] * 0.16]);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uShadowVP"), false, lightVP);
    gl.uniform1f(gl.getUniformLocation(litPr, "uShadowAmt"), shadowAmt);
    gl.uniform1f(gl.getUniformLocation(litPr, "uShadowTexel"), 1 / shadowSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(gl.getUniformLocation(litPr, "uShadowMap"), 0);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uSun"), sun);
    gl.uniform2fv(gl.getUniformLocation(litPr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uFog"), sc.fog);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogNear"), fogNear);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogFar"), fogFar);
    const starLift = starlightOn ? Math.max(0, 0.35 - Math.max(0, sun[1]) * 0.5) : 0;
    gl.uniform3fv(gl.getUniformLocation(litPr, "uTint"), [0.55 + 0.45 * Math.max(0, sun[1] + 0.4) + starLift, 0.55 + 0.45 * Math.max(0, sun[1] + 0.35) + starLift, 0.6 + 0.4 * Math.max(0, sun[1] + 0.3) + starLift * 0.8]);
    for (const ch of chunks.values()) {
      bindLit(ch.terrain, m4.ident());
      gl.drawArrays(gl.TRIANGLES, 0, ch.terrain.n);
      if (ch.lit) { bindLit(ch.lit, m4.ident()); gl.drawArrays(gl.TRIANGLES, 0, ch.lit.n); }
    }
    if (wonderMesh) { bindLit(wonderMesh, m4.ident()); gl.drawArrays(gl.TRIANGLES, 0, wonderMesh.n); }
    /* birds */
    {
      const bv: number[] = [];
      const t = nowS;
      for (const b of birds) {
        const fleeR = 1 + birdsFlee * 0.85;
        const cx = px + b.ox * (1 - attendAmt * 0.62) * fleeR, cz = pz + b.oz * (1 - attendAmt * 0.62) * fleeR;
        const a = b.ph + t * b.sp;
        const bx = cx + Math.cos(a) * b.r, bz = cz + Math.sin(a) * b.r;
        const by = height(cx, cz) + b.h + Math.sin(t * 0.9 + b.ph) * 1.6;
        const tx = -Math.sin(a) * Math.sign(b.sp), tz = Math.cos(a) * Math.sign(b.sp);
        const flap = Math.sin(t * 9 + b.ph * 3) * 0.85;
        const s = b.size;
        const P = (ox: number, oy: number, oz: number) => bv.push(bx + ox, by + oy, bz + oz, 0.05, 0.05, 0.07, 0, 1, 0);
        /* a body with a belly and a spine, and wings with a joint:
           the outer panel bends further than the inner */
        const NOSE: [number, number, number] = [tx * s * 1.0, -s * 0.02, tz * s * 1.0];
        const TAIL: [number, number, number] = [-tx * s * 0.95, s * 0.05, -tz * s * 0.95];
        const CT: [number, number, number] = [0, s * 0.12, 0];
        const BELLY: [number, number, number] = [tx * s * 0.05, -s * 0.20, tz * s * 0.05];
        P(...NOSE); P(...CT); P(...TAIL);
        P(...NOSE); P(...BELLY); P(...CT);
        P(...TAIL); P(...BELLY); P(...NOSE);
        for (const sg of [1, -1]) {
          const rx = -tz * sg, rz = tx * sg;
          const BF: [number, number, number] = [tx * s * 0.30 + rx * s * 0.14, 0, tz * s * 0.30 + rz * s * 0.14];
          const BB: [number, number, number] = [-tx * s * 0.30 + rx * s * 0.14, 0, -tz * s * 0.30 + rz * s * 0.14];
          const M: [number, number, number] = [tx * s * 0.02 + rx * s * 0.66, flap * s * 0.45, tz * s * 0.02 + rz * s * 0.66];
          const TIP: [number, number, number] = [-tx * s * 0.16 + rx * s * 1.3, flap * s * 0.95, -tz * s * 0.16 + rz * s * 1.3];
          P(...BF); P(...M); P(...BB);
          P(...BB); P(...M); P(...TIP);
        }
      }
      /* butterflies keep to the planted flowers */
      for (let bi = 0; bi < blooms.length && bi < 26; bi++) {
        const b = blooms[bi];
        const dxB = b.x - px, dzB = b.z - pz;
        if (dxB * dxB + dzB * dzB > 3600) continue;
        const aB = t * (0.5 + (bi % 5) * 0.07) + bi * 2.39;
        const bxB = b.x + Math.cos(aB) * 1.3, bzB = b.z + Math.sin(aB) * 1.1;
        const byB = height(b.x, b.z) + 1.0 + Math.sin(t * 1.3 + bi) * 0.3;
        const flapB = Math.sin(t * 11 + bi * 1.7) * 0.9;
        const colB: [number, number, number] = ([[0.95, 0.55, 0.75], [1.0, 0.85, 0.4], [0.7, 0.6, 1.0], [0.55, 0.85, 1.0]] as Array<[number, number, number]>)[b.kind % 4];
        const txB = -Math.sin(aB), tzB = Math.cos(aB);
        const P2 = (ox: number, oy: number, oz: number) => bv.push(bxB + ox, byB + oy, bzB + oz, ...colB, 0, 1, 0);
        const W1B: [number, number, number] = [txB * 0.06 + (-tzB) * 0.34, flapB * 0.22, tzB * 0.06 + txB * 0.34];
        const W2B: [number, number, number] = [txB * 0.06 - (-tzB) * 0.34, flapB * 0.22, tzB * 0.06 - txB * 0.34];
        P2(0, 0, 0); P2(...W1B); P2(txB * 0.3, 0, tzB * 0.3);
        P2(0, 0, 0); P2(txB * 0.3, 0, tzB * 0.3); P2(...W2B);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, birdBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bv), gl.DYNAMIC_DRAW);
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uFog"), sc.fog);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogNear"), fogNear);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogFar"), fogFar);
      gl.uniform2fv(gl.getUniformLocation(unlitPr, "uCam"), [eye[0], eye[2]]);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uOrigin"), [0, 0, 0]);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
      const aPos = gl.getAttribLocation(unlitPr, "aPos");
      const aCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.drawArrays(gl.TRIANGLES, 0, bv.length / 9);
    }
    /* critters */
    {
      const cv = critterVerts();
      if (cv.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, critBuf);
        gl.bufferData(gl.ARRAY_BUFFER, cv, gl.DYNAMIC_DRAW);
        gl.useProgram(unlitPr);
        gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
        gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
        const aPos = gl.getAttribLocation(unlitPr, "aPos");
        const aCol = gl.getAttribLocation(unlitPr, "aCol");
        gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
        gl.drawArrays(gl.TRIANGLES, 0, cv.length / 9);
      }
    }
    /* UNDERTOW's loose matter */
    {
      const bvv = bodiesVerts(nowS);
      lastBodiesN = bvv.length / 9;
      if (bvv.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, critBuf);
        gl.bufferData(gl.ARRAY_BUFFER, bvv, gl.DYNAMIC_DRAW);
        gl.useProgram(unlitPr);
        gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
        gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
        const aPos = gl.getAttribLocation(unlitPr, "aPos");
        const aCol = gl.getAttribLocation(unlitPr, "aCol");
        gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
        gl.drawArrays(gl.TRIANGLES, 0, bvv.length / 9);
      }
    }
    /* the standing stone, when the world has raised one */
    if (stoneMesh) {
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
      bindUnlit(stoneMesh);
      gl.drawArrays(gl.TRIANGLES, 0, stoneMesh.n);
    }
    /* the spirit, when it walks */
    if (spirit.on) {
      const sy2 = height(spirit.x, spirit.z);
      gl.useProgram(litPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
      bindLit(spiritMesh, m4.mul(m4.trans(spirit.x, sy2 - 0.08, spirit.z), m4.rotY(spirit.yaw)));
      gl.drawArrays(gl.TRIANGLES, 0, spiritMesh.n);
    }
    /* the other one, when she is walking */
    if (vesper.on) {
      const gy = height(vesper.x, vesper.z);
      gl.useProgram(litPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
      bindLit(vesperMesh, m4.mul(m4.trans(vesper.x, gy - 0.08, vesper.z), m4.rotY(vesper.yaw)));
      gl.drawArrays(gl.TRIANGLES, 0, vesperMesh.n);
      /* her halo: a thin ring of soft light, its colour drifting
         like weather — warmer when the account is kind, colder
         when it is not */
      const hv: number[] = [];
      const warm = Math.max(0, judgmentNow), cold = Math.max(0, -judgmentNow);
      const ph = nowS * 0.11 + vesper.hueSeed;
      let hr = 0.55 + 0.45 * Math.sin(ph), hg = 0.55 + 0.45 * Math.sin(ph + 2.1), hb = 0.55 + 0.45 * Math.sin(ph + 4.2);
      hr = hr * (1 - cold * 0.4) + 1.0 * warm * 0.35; hg = hg * (1 - warm * 0.15) + 0.8 * warm * 0.3; hb = hb * (1 - warm * 0.5) + 1.0 * cold * 0.35;
      const hy2 = gy + 2.52 + Math.sin(nowS * 0.8) * 0.03;
      for (let k = 0; k < 14; k++) {
        const a1 = (k / 14) * Math.PI * 2, a2 = ((k + 1) / 14) * Math.PI * 2;
        const x1 = vesper.x + Math.cos(a1) * 0.34, z1 = vesper.z + Math.sin(a1) * 0.34;
        const x2 = vesper.x + Math.cos(a2) * 0.34, z2 = vesper.z + Math.sin(a2) * 0.34;
        hv.push(x1, hy2, z1, hr, hg, hb, x2, hy2, z2, hr, hg, hb, x2, hy2 + 0.045, z2, hr, hg, hb);
        hv.push(x1, hy2, z1, hr, hg, hb, x2, hy2 + 0.045, z2, hr, hg, hb, x1, hy2 + 0.045, z1, hr, hg, hb);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, haloBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hv), gl.DYNAMIC_DRAW);
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.9);
      const hPos = gl.getAttribLocation(unlitPr, "aPos");
      const hCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(hPos); gl.enableVertexAttribArray(hCol);
      gl.vertexAttribPointer(hPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(hCol, 3, gl.FLOAT, false, 36, 12);
      gl.drawArrays(gl.TRIANGLES, 0, hv.length / 9);
    }
    /* her signs, drawn with the blooms */
    if (signMesh) {
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.9);
      bindUnlit(signMesh);
      gl.drawArrays(gl.TRIANGLES, 0, signMesh.n);
    }
    /* the other walkers, when the commons has matched you */
    for (const pr of peers.values()) {
      if (!pr.greeted) continue;
      if (Math.hypot(pr.cx - px, pr.cz - pz) > 420) continue;
      if (!pr.mesh) {
        const rgb = hueRgb(pr.hue);
        pr.mesh = buildFigure([rgb[0] * 0.30 + 0.04, rgb[1] * 0.30 + 0.04, rgb[2] * 0.30 + 0.04], [rgb[0] * 0.45 + 0.07, rgb[1] * 0.45 + 0.07, rgb[2] * 0.45 + 0.07], [0.78, 0.79, 0.83]);
      }
      gl.useProgram(litPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
      bindLit(pr.mesh, m4.mul(m4.trans(pr.cx, pr.cy - 0.08, pr.cz), m4.rotY(pr.cyaw)));
      gl.drawArrays(gl.TRIANGLES, 0, pr.mesh.n);
    }
    /* the strangeness, drawn */
    {
      const av = anomalyVerts(nowS);
      if (av.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, critBuf);
        gl.bufferData(gl.ARRAY_BUFFER, av, gl.DYNAMIC_DRAW);
        gl.useProgram(unlitPr);
        gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
        gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), Math.min(1, anAmt + 0.25));
        const aPos = gl.getAttribLocation(unlitPr, "aPos");
        const aCol = gl.getAttribLocation(unlitPr, "aCol");
        gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
        gl.drawArrays(gl.TRIANGLES, 0, av.length / 9);
      }
    }
    /* glow scatter */
    gl.useProgram(unlitPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.9 + 0.1 * Math.sin(nowS * 2.2));
    for (const ch of chunks.values()) if (ch.glow) { bindUnlit(ch.glow); gl.drawArrays(gl.TRIANGLES, 0, ch.glow.n); }
    if (wonderGlow) { bindUnlit(wonderGlow); gl.drawArrays(gl.TRIANGLES, 0, wonderGlow.n); }
    /* blooms the world kept */
    if (bloomMesh) {
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.95);
      bindUnlit(bloomMesh);
      gl.drawArrays(gl.TRIANGLES, 0, bloomMesh.n);
    }
    /* starlight: a small loaned star at the walker's shoulder */
    if (starlightOn) {
      const sx = eye[0] - Math.sin(yaw + 2.2) * 1.7, sz = eye[2] - Math.cos(yaw + 2.2) * 1.7;
      const sy = eye[1] + 0.9 + Math.sin(nowS * 1.7) * 0.12;
      const ov: number[] = [];
      const spike = (dx: number, dy: number, dz: number, r: number, len: number) => {
        for (let k = 0; k < 4; k++) {
          const a1 = (k / 4) * Math.PI * 2, a2 = ((k + 1) / 4) * Math.PI * 2;
          const p1: [number, number, number] = [sx + dy * 0 + (dz !== 0 ? Math.cos(a1) * r : 0) + (dx !== 0 ? 0 : Math.cos(a1) * r * (dy !== 0 ? 1 : 0)), 0, 0];
          void p1;
          const base1: [number, number, number] = [sx + (dy !== 0 || dz !== 0 ? Math.cos(a1) * r : 0), sy + (dx !== 0 || dz !== 0 ? Math.sin(a1) * r * (dy === 0 ? 1 : 0) : 0), sz + (dz === 0 ? Math.sin(a1) * r : 0)];
          const base2: [number, number, number] = [sx + (dy !== 0 || dz !== 0 ? Math.cos(a2) * r : 0), sy + (dx !== 0 || dz !== 0 ? Math.sin(a2) * r * (dy === 0 ? 1 : 0) : 0), sz + (dz === 0 ? Math.sin(a2) * r : 0)];
          ov.push(...base1, 1, 0.95, 0.8, 0, 1, 0, ...base2, 1, 0.95, 0.8, 0, 1, 0, sx + dx * len, sy + dy * len, sz + dz * len, 1, 0.98, 0.9, 0, 1, 0);
        }
      };
      spike(0, 1, 0, 0.10, 0.42); spike(0, -1, 0, 0.10, 0.42); spike(1, 0, 0, 0.08, 0.3); spike(-1, 0, 0, 0.08, 0.3); spike(0, 0, 1, 0.08, 0.3); spike(0, 0, -1, 0.08, 0.3);
      gl.bindBuffer(gl.ARRAY_BUFFER, critBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ov), gl.DYNAMIC_DRAW);
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
      const aPos = gl.getAttribLocation(unlitPr, "aPos");
      const aCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.drawArrays(gl.TRIANGLES, 0, ov.length / 9);
    }
    /* water */
    if (waterMesh) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(waterPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(waterPr, "uMVP"), false, vp);
      gl.uniform2fv(gl.getUniformLocation(waterPr, "uCam"), [eye[0], eye[2]]);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uSun"), sun);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uSunCol"), sc.sun);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uHor"), sc.hor);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uFog"), sc.fog);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uFogNear"), fogNear);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uFogFar"), fogFar);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uTime"), anKind === "glass" ? glassT : nowS);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uCold"), seasonNow.cold);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uDay"), Math.max(0.12, Math.min(1, sun[1] * 2.2 + 0.4)));
      gl.bindBuffer(gl.ARRAY_BUFFER, waterMesh.buf);
      const aPos = gl.getAttribLocation(waterPr, "aPos");
      const aCol = gl.getAttribLocation(waterPr, "aCol");
      const aAux = gl.getAttribLocation(waterPr, "aAux");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aAux);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(aAux, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, waterMesh.n);
      gl.disable(gl.BLEND);
    }
    /* points: motes + rain */
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(ptsPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(ptsPr, "uVP"), false, vp);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTime"), nowS);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uCam"), eye);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 0);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [60, 24, 60]);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), 0.22 + sc.night * 0.6);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 1.15);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0.3);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
    bindPoints(motes);
    gl.drawArrays(gl.POINTS, 0, motes.n);
    if (sc.night > 0.22) {
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), -0.35);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [48, 9, 48]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), sc.night * (0.5 + 0.3 * Math.sin(nowS * 0.7)));
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 2.6);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 1.0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 1);
      bindPoints(firePts);
      gl.drawArrays(gl.POINTS, 0, firePts.n);
    }
    if (showerAmt > 0.02) {
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 52);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [90, 40, 90]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), showerAmt * 0.85);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
      bindPoints(meteorPts);
      gl.drawArrays(gl.POINTS, 0, meteorPts.n);
    }
    const rainDraw = anKind === "rainup" ? Math.max(rainAmt, anAmt * 0.8) : rainAmt;
    const snowing = seasonNow.cold > 0.5;
    if (seasonNow.cold > 0.28) {
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 3.0);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [70, 42, 70]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), Math.min(1, (seasonNow.cold - 0.28) * 1.6) * (snowing && rainDraw > 0.02 ? 0.95 : 0.5));
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 0.35);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
      bindPoints(snowPts);
      gl.drawArrays(gl.POINTS, 0, snowPts.n);
    }
    if (rainDraw > 0.02 && !snowing) {
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), anKind === "rainup" ? -24 : 26);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [70, 44, 70]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), rainDraw * 0.55);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
      bindPoints(rainPts);
      gl.drawArrays(gl.POINTS, 0, rainPts.n);
    }
    if (tow.partCount > 0) {
      const n = tow.fillPoints(partData);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 0);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [600, 300, 600]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), 0.9);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, partData.subarray(0, n * 7), gl.DYNAMIC_DRAW);
      const aPos = gl.getAttribLocation(ptsPr, "aPos");
      const aCol = gl.getAttribLocation(ptsPr, "aCol");
      const aSize = gl.getAttribLocation(ptsPr, "aSize");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aSize);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 24);
      gl.drawArrays(gl.POINTS, 0, n);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };

  /* ---- step ---- */
  let last = performance.now();
  let chipClock = 0;
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    /* the window is the world's frame: if it changed shape since the
       last frame — dragged, maximised, fullscreened, another browser
       entirely — the canvas re-fits before anything is drawn */
    if (stage.clientWidth !== lastFitW || stage.clientHeight !== lastFitH) fitCanvas();
    /* the world's clock is the walker's own: the sun here rises
       and sets with the sun outside the user's window. Only the
       Strangeness may bend it, and only briefly. */
    {
      const lt = new Date();
      timeSkew *= Math.pow(0.5, dt / 22);
      if (Math.abs(timeSkew) < 0.00002) timeSkew = 0;
      dayT = ((lt.getHours() + lt.getMinutes() / 60 + lt.getSeconds() / 3600) / 24 + timeSkew + 1) % 1;
      seasonNow = seasonOf(lt);
    }
    if (performance.now() / 1000 < stormUntil && Math.random() < dt / 2.4) { flash = 1; audio.thunder(); }
    /* the sub-consciousness thinks a few times a second, and the
       world follows its intents — weather included */
    thinkClock += dt;
    if (thinkClock > 0.6) {
      thinkClock = 0;
      dreamer.think(0.6, now / 1000, {
        speed: hSpeedNow, idleFor, biome: biomeAt(px, pz), night: skyColors(dayT, 0).night,
        inWater: py < 0.4 && height(px, pz) < -0.4, flying, chimes: chimeCount, explored, dayT,
      });
      const ints = dreamer.intents;
      weather = ints.weather;
      auroraAmt += (ints.aurora - auroraAmt) * 0.4;
      attendAmt += (ints.attend - attendAmt) * 0.4;
      showerAmt += ((ints.shower ? 1 : 0) - showerAmt) * 0.3;
      audio.setMood(ints.sparse);
      judgmentNow = ints.judgment;
      strangeNow = ints.strange;
      if (lastAnKind === "hush" && ints.anomaly !== "hush" && idleFor > 10) witness("hushKept");
      if (idleFor > 25) witness("rest");
      anKind = ints.anomaly; anAmt = ints.anomalyAmt;
      audio.setHush(anKind === "hush" ? anAmt : 0);
      audio.setEcho(anKind === "echo" && anAmt > 0.4);
      if (anKind !== lastAnKind) {
        if (anKind && !deeds.strange.includes(anKind)) { deeds.strange.push(anKind); saveDeeds(); }
        if (anKind === "stutter") { timeSkew = -20 / 1440; flash = Math.max(flash, 0.55); }
        if (anKind === "bell") { audio.bell(); birdsFlee = 1; }
        if (anKind === "murmur") audio.murmur();
        if (anKind === "glass") glassT = now / 1000;
        if (anKind === "stone") spawnStone();
        if (anKind === "star") { skyAn.az = Math.random() * 6.28; skyAn.el = 0.35 + Math.random() * 0.5; skyAn.sp = 0.008 + Math.random() * 0.01; }
        if (anKind === "visitor") { skyAn.az = Math.random() * 6.28; skyAn.sp = 0.021; }
        if (anKind === "procession") { skyAn.az = Math.random() * 6.28; skyAn.x0 = px - Math.sin(skyAn.az) * 150; skyAn.z0 = pz - Math.cos(skyAn.az) * 150; }
        lastAnKind = anKind;
      }
      for (const w of dreamer.drainWhispers()) {
        whisper.textContent = w;
        whisper.style.opacity = "1";
        whisperTimer = 7;
      }
    }
    whisperTimer = Math.max(0, whisperTimer - dt);
    if (chromeTimer > 0 && !menuOpen) { chromeTimer -= dt; if (chromeTimer <= 0) wrap.classList.remove("chrome-on"); }
    /* inside the world there is no furniture — the panel belongs
       to the threshold and to the pause, never to the walk itself */
    wrap.classList.toggle("sim-in", touched && document.pointerLockElement === canvas);
    if (menuOpen && document.pointerLockElement === canvas) setMenu(false);
    if (whisperTimer === 0) whisper.style.opacity = "0";
    mistAmt += ((weather === "mist" ? 1 : 0) - mistAmt) * Math.min(1, dt * 0.25);
    rainAmt += ((weather === "rain" ? 1 : 0) - rainAmt) * Math.min(1, dt * 0.25);
    flash = Math.max(0, flash - dt * 1.4);
    if (rainAmt > 0.6 && Math.random() < dt / 13) { flash = 1; audio.thunder(); }
    /* fog targets */
    const groundH = height(px, pz);
    const inWater = !flying && groundH < -0.4 && py < 0.6;
    const underwater = inWater && py < -0.25;
    const tFogN = underwater ? 1.5 : 55 - mistAmt * 39 - rainAmt * 25;
    const tFogF = underwater ? 24 : (300 - mistAmt * 205 - rainAmt * 130) * (anKind === "glass" ? 1 + anAmt * 0.85 : 1);
    birdsFlee = Math.max(0, birdsFlee - dt * 0.18);
    fogNear += (tFogN - fogNear) * Math.min(1, dt * 1.5);
    fogFar += (tFogF - fogFar) * Math.min(1, dt * 1.5);
    uw.style.opacity = underwater ? "1" : "0";
    /* movement */
    const fwd: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)];
    const right: [number, number] = [-fwd[1], fwd[0]];
    let ix = 0, iz = 0;
    if (!touched) {
      yaw += dt * 0.045;
      const target = height(px, pz) + 24 + Math.sin(now * 0.00021) * 3;
      py += (target - py) * Math.min(1, dt * 0.7);
    }
    if (keys.has("KeyW") || keys.has("ArrowUp")) { ix += fwd[0]; iz += fwd[1]; }
    if (keys.has("KeyS") || keys.has("ArrowDown")) { ix -= fwd[0]; iz -= fwd[1]; }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) { ix -= right[0]; iz -= right[1]; }
    if (keys.has("KeyD") || keys.has("ArrowRight")) { ix += right[0]; iz += right[1]; }
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const spaceNow = keys.has("Space");
    if (spaceNow && !prevSpace && !flying && !inWater) jumpBufT = 0.15;
    prevSpace = spaceNow;
    jumpBufT = Math.max(0, jumpBufT - dt);
    coyoteT = wasGrounded ? 0.12 : Math.max(0, coyoteT - dt);
    /* a small person in a gigantic world: the pace is a walk, not a
       vehicle — sprint is a jog, flight a glide, the water a wade */
    const baseSpeed = flying ? (sprint ? 14 : 7) : inWater ? 2.1 : sprint ? 5.6 : 3.0;
    const il = Math.hypot(ix, iz);
    const txv = il > 0 ? (ix / il) * baseSpeed : 0;
    const tzv = il > 0 ? (iz / il) * baseSpeed : 0;
    const accel = flying || inWater ? 2.8 : 4.2;
    vx += (txv - vx) * Math.min(1, dt * accel);
    vz += (tzv - vz) * Math.min(1, dt * accel);
    px += vx * dt; pz += vz * dt;
    /* solid ground truth: trunks, stone, crystal and wonder
       push back — you walk around the world, not through it */
    {
      const feet = py - 1.7;
      const pushOut = (sx: number, sz: number, sr: number, stop: number) => {
        if (feet > stop - 0.25) return;
        const dx = px - sx, dz = pz - sz, rr = sr + 0.55, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); px = sx + (dx / d) * rr; pz = sz + (dz / d) * rr; }
        else if (d2 <= 1e-6) { px = sx + rr; }
      };
      const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const ch = chunks.get(keyOf(ccx + i, ccz + j));
        if (ch) for (const so of ch.solids) pushOut(so.x, so.z, so.r, so.top);
      }
      for (const so of worldSolids) pushOut(so.x, so.z, so.r, so.top);
    }
    checkDiscoveries();
    { const hcx = Math.floor(px / CHUNK), hcz = Math.floor(pz / CHUNK), hk = `${hcx},${hcz}`; if (Math.abs(hcx) <= 3 && Math.abs(hcz) <= 3 && !deeds.chunks.includes(hk)) { deeds.chunks.push(hk); saveDeeds(); } }
    if (now / 1000 - lastTendAt > 1) { lastTendAt = now / 1000; let tendedAny = false; for (const b of blooms) { if (b.seen === undefined) continue; const dx = b.x - px, dz = b.z - pz; if (dx * dx + dz * dz < 49) { b.seen = Date.now(); tendedAny = true; } } if (tendedAny) { try { localStorage.setItem(skey(`simulacrum-blooms-${seed}`), JSON.stringify(blooms)); } catch { /* kept in memory */ } } }
    hSpeedNow = Math.hypot(vx, vz);
    const hSpeed = hSpeedNow;
    if (flying) {
      if (keys.has("Space")) py += baseSpeed * 0.8 * dt;
      if (keys.has("KeyC")) py -= baseSpeed * 0.8 * dt;
      if (keys.has("KeyW")) py += Math.sin(pitch) * baseSpeed * 0.7 * dt;
      py = Math.max(height(px, pz) + 1.2, py);
      wasGrounded = false;
    } else if (inWater) {
      /* swimming: buoyancy to just under the surface, riding the swell */
      const target = Math.min(-0.45, Math.max(groundH + 1.0, py)) + tow.swell(px, pz, now / 1000) * 0.4;
      vy = 0;
      py += (target - py) * Math.min(1, dt * 3);
      if (keys.has("Space")) py = Math.min(0.1, py + 3.2 * dt);
      if (keys.has("KeyC")) py = Math.max(groundH + 0.8, py - 3.2 * dt);
      wasGrounded = false;
    } else {
      const ground = groundH + 1.7;
      if (wasGrounded) {
        const gx = (height(px + 0.7, pz) - height(px - 0.7, pz)) / 1.4;
        const gz = (height(px, pz + 0.7) - height(px, pz - 0.7)) / 1.4;
        if (gx * gx + gz * gz > 0.90) { vx -= gx * 11 * dt; vz -= gz * 11 * dt; }
      }
      vy -= 22 * dt;
      py += vy * dt;
      if (py <= ground) {
        if (!wasGrounded && vy < -9) { audio.thud(-vy); landDip = Math.min(0.5, -vy * 0.02); tow.burst(px, groundH + 0.2, pz, { n: 10, col: [0.62, 0.55, 0.44], spd: 1.8, up: 1.1, grav: -3.5, drag: 1.6, life: 0.8, size: 2.0 }); }
        py = ground; vy = 0; wasGrounded = true;
      } else wasGrounded = false;
      if (jumpBufT > 0 && (wasGrounded || coyoteT > 0)) { vy = 8.4; jumpBufT = 0; coyoteT = 0; wasGrounded = false; }
    }
    /* water entry/exit */
    if (inWater && !wasInWater) {
      audio.splash(py < -1);
      tow.burst(px, 0.25, pz, { n: 16, col: [0.75, 0.88, 1.0], spd: 2.6, up: 3.4, grav: -11, life: 0.8, size: 2.4 });
    }
    vesperStep(dt, now / 1000);
    spiritStep(now / 1000);
    netTick(dt, now / 1000);
    tow.step(dt, now / 1000, { x: px, z: pz, vx, vz }, (bx, bz, big) => {
      audio.splash(big);
      tow.burst(bx, 0.25, bz, { n: big ? 16 : 9, col: [0.75, 0.88, 1.0], spd: 2.0, up: 2.8, grav: -11, life: 0.7, size: 2.2 });
    });
    wasInWater = inWater;
    if (touched && hSpeedNow < 0.5 && !keys.size) idleFor += dt; else idleFor = 0;
    explored += hSpeedNow * dt;
    /* head-bob + footsteps: strides are counted in distance
       travelled, so the feet land when they should at any pace —
       and they land in the shallows too, where the ground is near */
    landDip = Math.max(0, landDip - dt * 1.8);
    const wading = inWater && groundH > -1.15;
    if ((wasGrounded || wading) && hSpeed > 0.6) {
      const stride = wading ? 1.0 : sprint ? 1.55 : 1.25;
      strideAcc += hSpeed * dt;
      bobPhase += (hSpeed * dt * Math.PI) / stride;
      bobAmp = Math.min(1, bobAmp + dt * 5);
      if (strideAcc >= stride) {
        strideAcc -= stride;
        audio.footstep(surfaceAt(px, pz), sprint, wading ? Math.min(1, -groundH / 1.15) : 0);
      }
    } else bobAmp = Math.max(0, bobAmp - dt * 5);
    /* audio ambience */
    if (audio.live) {
      audio.tick(dayT);
      audio.setWeather(anKind === "rainup" ? Math.max(rainAmt, anAmt * 0.75) : rainAmt, py - groundH, now / 1000);
      audio.setUnderwater(underwater);
      /* crystal chimes */
      const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const ch = chunks.get(keyOf(ccx + i, ccz + j));
        if (!ch) continue;
        ch.crystals.forEach(([cxp, czp], idx) => {
          const d2 = (cxp - px) * (cxp - px) + (czp - pz) * (czp - pz);
          const k = `${ch.key}:${idx}`;
          if (d2 < 42 && now - (lastChime.get(k) ?? 0) > 9000) { lastChime.set(k, now); chimeCount++; audio.chime(Math.floor(cxp * 7 + czp * 13)); witness("crystal"); }
        });
      }
      if (Math.random() < dt * 0.05 && sunDir(dayT)[1] > 0.1) audio.chirp();
    }
    /* chunks — while the world is being made, the budget is a slice
       of each frame and the sets load by rings, nearest first, so
       the ground under the walker stands before the horizon does */
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    if (warming) {
      const buildT0 = performance.now();
      ringBuild:
      for (let ring = 0; ring <= viewRadius; ring++) {
        for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const k = keyOf(ccx + i, ccz + j);
          if (!chunks.has(k)) {
            chunks.set(k, buildChunk(ccx + i, ccz + j));
            if (performance.now() - buildT0 > 14) break ringBuild;
          }
        }
      }
    } else {
      let built = 0;
      for (let i = -viewRadius; i <= viewRadius && built < 2; i++) for (let j = -viewRadius; j <= viewRadius && built < 2; j++) {
        const k = keyOf(ccx + i, ccz + j);
        if (!chunks.has(k)) { chunks.set(k, buildChunk(ccx + i, ccz + j)); built++; }
      }
    }
    if (warming) {
      let missing = 0;
      for (let i = -viewRadius; i <= viewRadius; i++) for (let j = -viewRadius; j <= viewRadius; j++) if (!chunks.has(keyOf(ccx + i, ccz + j))) missing++;
      const total = (viewRadius * 2 + 1) * (viewRadius * 2 + 1);
      if (warmFullPending) {
        const pct = Math.round(100 * (total - missing) / total);
        loadFill.style.width = `${pct}%`;
        loadPct.textContent = `${pct}%`;
        loadPhase.textContent = missing > 0 ? `raising the land — ${total - missing} of ${total}` : "first light";
      }
      if (missing === 0) { warmFrames++; if (warmFrames >= 5) finishWarm(); }
      else warmFrames = 0;
    }
    for (const [k, ch] of chunks) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.abs(cx - ccx) > viewRadius + 1 || Math.abs(cz - ccz) > viewRadius + 1) {
        gl.deleteBuffer(ch.terrain.buf);
        if (ch.lit) gl.deleteBuffer(ch.lit.buf);
        if (ch.glow) gl.deleteBuffer(ch.glow.buf);
        chunks.delete(k);
      }
    }
    buildWater(px, pz);
    stepCritters(dt);
    /* HUD + EMCON, ~4×/s and 1×/s */
    if ((frames++ & 15) === 0) {
      const heading = Math.atan2(fwd[0], -fwd[1]) * 180 / Math.PI;
      const deg = ((heading % 360) + 360) % 360;
      const cards = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const hour = ((dayT - 0.25) * 24 + 6 + 24) % 24;
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      posLabel.textContent = `${cards[Math.round(deg / 45) % 8]} ${deg.toFixed(0)}° · ${biomeAt(px, pz)} · ${weather} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · x ${px.toFixed(0)} z ${pz.toFixed(0)} · ${chunks.size} chunks`;
    }
    chipClock += dt;
    if (chipClock > 1) {
      chipClock = 0;
      audio.kick();
      const chip = document.getElementById("os-emcon-chip");
      audio.setGate(chip && chip.dataset.level === "alpha" ? 0 : 1);
    }
  };

  let frameLast = performance.now();
  const frame = () => {
    const fNow = performance.now();
    irisTick(Math.max(0.01, fNow - frameLast), fNow / 1000);
    frameLast = fNow;
    if (!body.isConnected) {
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", visKick);
      stopPulse();
      if (mqtt) { try { mqtt.close(); } catch { /* already gone */ } mqtt = null; }
      audio.dispose();
      return;
    }
    if (!begun) { requestAnimationFrame(frame); return; }
    step();
    if (!(xrSession && xrRef)) {
      /* the viewport is stated, never inherited: some engines keep the
         viewport they were born with when the buffer is resized, and
         the world ends up drawn small in a corner of its own canvas */
      gl.viewport(0, 0, canvas.width, canvas.height);
      const asp = canvas.width / canvas.height;
      const stretchF = anKind === "stretch" ? 1 + Math.sin(performance.now() / 1000 * 0.55) * 0.055 * anAmt : 1;
      const proj = m4.persp(1.25 * stretchF, asp, 0.1, 1200);
      const bobY = Math.sin(bobPhase * 2) * 0.055 * bobAmp - landDip * 0.3;
      const roll = Math.sin(bobPhase) * 0.006 * bobAmp;
      const view = m4.mul(m4.rotZ(roll), m4.mul(m4.rotX(-pitch), m4.mul(m4.rotY(-yaw), m4.trans(-px, -(py + bobY), -pz))));
      render(proj, view, [px, py + bobY, pz]);
    }
    try { if (localStorage.getItem(skey("simulacrum-commons")) === "1") enterCommons(); } catch { /* private mode */ }
  requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const xrFrame = (_t: number, frameObj: XRFrameLike) => {
    if (!xrSession || !xrRef) return;
    const pose = frameObj.getViewerPose(xrRef);
    if (pose) {
      const layer = xrSession.renderState.baseLayer as InstanceType<typeof XRWebGLLayer>;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      let first = true;
      for (const view of pose.views) {
        const vp = layer.getViewport(view)!;
        gl.viewport(vp.x, vp.y, vp.width, vp.height);
        render(view.projectionMatrix as unknown as M4, view.transform.inverse.matrix as unknown as M4, [px, py, pz], first);
        first = false;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    xrSession.requestAnimationFrame(xrFrame);
  };
  const xrWatch = window.setInterval(() => {
    if (!body.isConnected) { window.clearInterval(xrWatch); return; }
    if (xrSession && xrRef) xrSession.requestAnimationFrame(xrFrame);
  }, 800);
}
