/* Simulacrum — a fully procedurally generated artificial world.
 *
 * Nothing here is loaded, modelled, or textured: the terrain, the
 * sky, the weather of light, every tree, rock and crystal is
 * generated in code from a single seed, chunk by chunk, endlessly
 * around the walker. WebGL renders it; WebXR, where a browser
 * offers it, puts the walker inside it for real. The seed is the
 * world — same seed, same hills, forever (and per nest, like every
 * Blacksite room's memory).
 */

import { skey } from "./os-depth";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ---------------- deterministic noise ---------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Noise {
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

type M4 = Float32Array;
const m4 = {
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
  scale(x: number, y: number, z: number): M4 {
    return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  },
};

/* ---------------- shaders ---------------- */

const LIT_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aNor;
uniform mat4 uMVP; uniform mat4 uModel;
varying vec3 vCol; varying vec3 vNor; varying float vDist;
uniform vec2 uCam;
void main() {
  vCol = aCol;
  vNor = mat3(uModel) * aNor;
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = distance(wp.xz, uCam);
}`;
const LIT_FS = `
precision mediump float;
varying vec3 vCol; varying vec3 vNor; varying float vDist;
uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uTint;
void main() {
  float li = max(0.25, dot(normalize(vNor), normalize(uSun)));
  vec3 c = vCol * li * uTint;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;
const UNLIT_VS = `
attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uMVP; uniform vec3 uOrigin; uniform vec2 uCam;
varying vec3 vCol; varying float vDist;
void main() { vCol = aCol; gl_Position = uMVP * vec4(aPos, 1.0); vDist = distance(aPos.xz + uOrigin.xz, uCam); }`;
const UNLIT_FS = `
precision mediump float;
varying vec3 vCol; varying float vDist;
uniform float uAlpha; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
void main() {
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(vCol, uFog, f), uAlpha);
}`;
const SKY_VS = `
attribute vec3 aPos;
uniform mat4 uVP;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uVP * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = `
precision mediump float;
varying vec3 vDir;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.12, 1.0);
  vec3 c = mix(uHor, uZen, pow(max(h, 0.0), 0.62));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 600.0) * 1.6 + pow(s, 18.0) * 0.28);
  if (uNight > 0.02 && d.y > 0.0) {
    vec2 sp = floor(d.xz / max(0.035, d.y) * 14.0);
    float st = step(0.9975, hash21(sp)) * uNight;
    c += vec3(st) * (0.55 + 0.45 * sin(uNight * 40.0 + hash21(sp + 7.0) * 20.0));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------------- world ---------------- */

/* Minimal WebXR shapes (the project's TS lib predates them). */
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

const CHUNK = 48, STEP = 2, RADIUS = 3;

interface Mesh { buf: WebGLBuffer; n: number }

export function buildSimulacrum(body: HTMLElement) {
  const wrap = el("div", "os-sim");
  const canvas = document.createElement("canvas");
  canvas.className = "os-sim-canvas";
  canvas.width = 1024; canvas.height = 640;
  const hud = el("div", "os-sim-hud");
  const seedLabel = el("span", "os-note", "");
  const newBtn = el("button", "os-btn", "new world");
  const flyBtn = el("button", "os-btn", "walk");
  const xrBtn = el("button", "os-btn", "enter VR");
  const posLabel = el("span", "os-note", "");
  hud.append(seedLabel, newBtn, flyBtn, xrBtn, posLabel);
  const hint = el("p", "os-note", "click the world to take it — WASD + mouse · F toggles flight (space/C rise & sink) · shift is swift · every hill is generated, nothing is loaded");
  wrap.append(canvas, hud, hint);
  body.appendChild(wrap);

  const gl = canvas.getContext("webgl", { antialias: true }) as WebGLRenderingContext | null;
  if (!gl) { hint.textContent = "WebGL is not available in this browser — the simulacrum cannot form."; return; }

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
  const makeMesh = (verts: Float32Array): Mesh => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    return { buf, n: verts.length / 9 };
  };

  /* ---- world state ---- */
  let seed = Number(localStorage.getItem(skey("simulacrum-seed")) || "0") || 20261024;
  let noise = new Noise(seed);
  const height = (x: number, z: number): number => {
    const hills = noise.fbm(x * 0.012 + 31, z * 0.012 + 7, 4);
    const ridge = 1 - Math.abs(noise.fbm(x * 0.004 + 3, z * 0.004 + 19, 3) * 2 - 1);
    return -3.5 + hills * 13 + Math.pow(ridge, 3) * 15;
  };
  seedLabel.textContent = `seed ${seed}`;

  interface Chunk { key: string; terrain: Mesh; lit: Mesh | null; glow: Mesh | null }
  const chunks = new Map<string, Chunk>();
  const keyOf = (cx: number, cz: number) => `${cx},${cz}`;

  const palette = (h: number, slope: number): [number, number, number] => {
    if (h < 0.7) return [0.80, 0.70, 0.47];
    if (slope > 0.55) return [0.40, 0.37, 0.42];
    if (h > 15) return [0.90, 0.93, 0.97];
    if (h > 10) return [0.45, 0.42, 0.46];
    const g = 0.30 + Math.min(0.22, h * 0.02);
    return [0.24, g + 0.14, 0.26];
  };

  const buildChunk = (cx: number, cz: number): Chunk => {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const seg = CHUNK / STEP;
    const tv: number[] = [];
    const pushTri = (arr: number[], a: number[], b: number[], c: number[]) => { arr.push(...a, ...b, ...c); };
    const vert = (x: number, z: number): number[] => {
      const h = height(x, z);
      const e = 1.4;
      const hx = height(x + e, z) - height(x - e, z);
      const hz = height(x, z + e) - height(x, z - e);
      let nx = -hx / (2 * e), nz = -hz / (2 * e), ny = 1;
      const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const slope = 1 - ny;
      const col = palette(h, slope);
      return [x, h, z, ...col, nx, ny, nz];
    };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const x = x0 + i * STEP, z = z0 + j * STEP;
      const v00 = vert(x, z), v10 = vert(x + STEP, z), v01 = vert(x, z + STEP), v11 = vert(x + STEP, z + STEP);
      pushTri(tv, v00, v01, v10); pushTri(tv, v10, v01, v11);
    }
    /* scatter — deterministic per chunk */
    const rnd = mulberry32(seed ^ (cx * 7919) ^ (cz * 104729));
    const lit: number[] = [], glow: number[] = [];
    const box = (arr: number[], cxp: number, cyp: number, czp: number, sx: number, sy: number, sz: number, col: [number, number, number]) => {
      const x1 = cxp - sx / 2, x2 = cxp + sx / 2, y1 = cyp, y2 = cyp + sy, z1 = czp - sz / 2, z2 = czp + sz / 2;
      const F: Array<[number[], number[]]> = [
        [[x1, y1, z2, x2, y1, z2, x2, y2, z2], [0, 0, 1]], [[x1, y1, z1, x2, y2, z1, x2, y1, z1], [0, 0, -1]],
        [[x2, y1, z2, x2, y1, z1, x2, y2, z1], [1, 0, 0]], [[x1, y1, z1, x1, y1, z2, x1, y2, z2], [-1, 0, 0]],
        [[x1, y2, z2, x2, y2, z2, x2, y2, z1], [0, 1, 0]],
      ];
      for (const [tri, n] of F) for (let k = 0; k < 9; k += 3) arr.push(tri[k], tri[k + 1], tri[k + 2], ...col, ...n);
    };
    const cone = (arr: number[], cxp: number, cyp: number, czp: number, r: number, hgt: number, col: [number, number, number]) => {
      const sides = 6;
      for (let k = 0; k < sides; k++) {
        const a1 = (k / sides) * Math.PI * 2, a2 = ((k + 1) / sides) * Math.PI * 2;
        arr.push(cxp + Math.cos(a1) * r, cyp, czp + Math.sin(a1) * r, ...col, 0, 0.6, 0);
        arr.push(cxp + Math.cos(a2) * r, cyp, czp + Math.sin(a2) * r, ...col, 0, 0.6, 0);
        arr.push(cxp, cyp + hgt, czp, ...col, 0, 1, 0);
      }
    };
    for (let t = 0; t < 26; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.9) continue;
      const e = 1.4, sl = 1 - 1 / Math.hypot((height(x + e, z) - height(x - e, z)) / (2 * e), 1, (height(x, z + e) - height(x, z - e)) / (2 * e));
      const roll = rnd();
      if (sl < 0.30 && roll < 0.62) {
        const s = 0.8 + rnd() * 0.9;
        box(lit, x, h - 0.1, z, 0.32 * s, 1.6 * s, 0.32 * s, [0.36, 0.25, 0.16]);
        const g: [number, number, number] = [0.13 + rnd() * 0.1, 0.34 + rnd() * 0.2, 0.18];
        cone(lit, x, h + 1.3 * s, z, 1.5 * s, 2.6 * s, g);
        cone(lit, x, h + 2.6 * s, z, 1.05 * s, 2.0 * s, g);
      } else if (roll < 0.86) {
        const s = 0.5 + rnd() * 1.3;
        box(lit, x, h - 0.2, z, s, s * 0.8, s, [0.42, 0.40, 0.45]);
      } else {
        const s = 0.7 + rnd() * 0.8;
        cone(glow, x, h - 0.1, z, 0.55 * s, 2.6 * s, [0.62, 0.36, 1.0]);
        cone(glow, x, h - 0.1, z, 0.34 * s, 1.5 * s, [0.45, 0.75, 1.0]);
      }
    }
    return {
      key: keyOf(cx, cz),
      terrain: makeMesh(new Float32Array(tv)),
      lit: lit.length ? makeMesh(new Float32Array(lit)) : null,
      glow: glow.length ? makeMesh(new Float32Array(glow)) : null,
    };
  };

  /* sky dome + water + motes */
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
  const waterMesh = makeMesh(new Float32Array([
    -900, 0, -900, 0.12, 0.32, 0.52, 0, 1, 0, 900, 0, -900, 0.12, 0.32, 0.52, 0, 1, 0, 900, 0, 900, 0.12, 0.32, 0.52, 0, 1, 0,
    -900, 0, -900, 0.12, 0.32, 0.52, 0, 1, 0, 900, 0, 900, 0.12, 0.32, 0.52, 0, 1, 0, -900, 0, 900, 0.12, 0.32, 0.52, 0, 1, 0,
  ]));

  /* ---- walker ---- */
  let px = 8, pz = 8, py = height(8, 8) + 26;
  let yaw = 0.7, pitch = -0.16, flying = false, vy = 0;
  let keys = new Set<string>();
  let locked = false, touched = false;
  let dayT = 0.32; /* 0..1 — starts mid-morning */
  const spawn = () => { px = 8; pz = 8; py = height(px, pz) + 26; yaw = 0.7; pitch = -0.16; };
  spawn();

  canvas.addEventListener("click", () => {
    touched = true;
    if (!locked && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    yaw -= e.movementX * 0.0024;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0024));
  });
  const kd = (e: KeyboardEvent) => {
    if (!body.isConnected) return;
    if (locked || touched) keys.add(e.code);
    if (e.code === "KeyF" && (locked || touched)) { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; if (!flying) py = height(px, pz) + 1.7; }
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.code);
  document.addEventListener("keydown", kd);
  document.addEventListener("keyup", ku);
  flyBtn.addEventListener("click", () => { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; if (!flying) py = height(px, pz) + 1.7; });
  newBtn.addEventListener("click", () => {
    seed = Math.floor(Math.random() * 89999999) + 10000000;
    localStorage.setItem(skey("simulacrum-seed"), String(seed));
    noise = new Noise(seed);
    for (const ch of chunks.values()) { gl.deleteBuffer(ch.terrain.buf); if (ch.lit) gl.deleteBuffer(ch.lit.buf); if (ch.glow) gl.deleteBuffer(ch.glow.buf); }
    chunks.clear();
    seedLabel.textContent = `seed ${seed}`;
    spawn();
  });

  /* touch: drag to look, two buttons worth of honesty */
  let lastTouch: { x: number; y: number } | null = null;
  canvas.addEventListener("touchstart", (e) => { touched = true; lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!lastTouch) return;
    const t = e.touches[0];
    yaw -= (t.clientX - lastTouch.x) * 0.005;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - (t.clientY - lastTouch.y) * 0.005));
    lastTouch = { x: t.clientX, y: t.clientY };
    keys.add("KeyW");
  }, { passive: true });
  canvas.addEventListener("touchend", () => { lastTouch = null; keys.delete("KeyW"); });

  /* WebXR door */
  const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean>; requestSession(m: string, o: object): Promise<XRSessionLike> } }).xr;
  let xrSession: XRSessionLike | null = null;
  if (xr) {
    xr.isSessionSupported("immersive-vr").then((ok) => { if (!ok) xrBtn.style.display = "none"; }).catch(() => { xrBtn.style.display = "none"; });
  } else xrBtn.style.display = "none";
  xrBtn.addEventListener("click", async () => {
    if (!xr) return;
    try {
      xrSession = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"] });
      await xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      xrSession.requestReferenceSpace("local-floor").then((space) => { xrRef = space; });
      xrSession.addEventListener("end", () => { xrSession = null; });
    } catch { hint.textContent = "VR refused here — the flat world still walks."; }
  });
  let xrRef: unknown = null;

  /* ---- frame ---- */
  let last = performance.now(), frames = 0;
  const sunDir = (t: number): [number, number, number] => {
    const a = (t - 0.25) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a), 0.35];
  };
  const skyColors = (t: number): { zen: number[]; hor: number[]; sun: number[]; fog: number[]; night: number } => {
    const s = sunDir(t), day = Math.max(0, Math.min(1, s[1] * 2.4 + 0.35));
    const dusk = Math.max(0, 1 - Math.abs(s[1]) * 3.2);
    const mixc = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
    let zen = mixc([0.012, 0.02, 0.06], [0.19, 0.38, 0.72], day);
    let hor = mixc([0.05, 0.05, 0.10], [0.62, 0.74, 0.86], day);
    hor = mixc(hor, [0.98, 0.52, 0.28], dusk * 0.65);
    zen = mixc(zen, [0.30, 0.22, 0.42], dusk * 0.4);
    return { zen, hor, sun: [1.0, 0.85 - dusk * 0.25, 0.6 - dusk * 0.3], fog: hor, night: 1 - day };
  };

  const render = (proj: M4, view: M4, eye: [number, number, number], clear = true) => {
    const sc = skyColors(dayT);
    const sun = sunDir(dayT);
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
    gl.uniform1f(gl.getUniformLocation(skyPr, "uNight"), sc.night);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, skyMesh.buf);
      const a = gl.getAttribLocation(skyPr, "aPos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, 0);
      gl.drawArrays(gl.TRIANGLES, 0, skyMesh.n);
    }
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    const vp = m4.mul(proj, view);
    /* world */
    gl.useProgram(litPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uSun"), sun);
    gl.uniform2fv(gl.getUniformLocation(litPr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uFog"), sc.fog);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogNear"), 55);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogFar"), 300);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uTint"), [0.55 + 0.45 * Math.max(0, sun[1] + 0.4), 0.55 + 0.45 * Math.max(0, sun[1] + 0.35), 0.6 + 0.4 * Math.max(0, sun[1] + 0.3)]);
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    for (const ch of chunks.values()) {
      bindLit(ch.terrain, m4.ident());
      gl.drawArrays(gl.TRIANGLES, 0, ch.terrain.n);
      if (ch.lit) { bindLit(ch.lit, m4.ident()); gl.drawArrays(gl.TRIANGLES, 0, ch.lit.n); }
    }
    /* glow scatter + water (unlit) */
    gl.useProgram(unlitPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
    gl.uniform3fv(gl.getUniformLocation(unlitPr, "uFog"), sc.fog);
    gl.uniform2fv(gl.getUniformLocation(unlitPr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(unlitPr, "uOrigin"), [0, 0, 0]);
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogNear"), 55);
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogFar"), 300);
    const bindUnlit = (mesh: Mesh) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
      const aPos = gl.getAttribLocation(unlitPr, "aPos");
      const aCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
    };
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.9 + 0.1 * Math.sin(performance.now() * 0.0022));
    for (const ch of chunks.values()) if (ch.glow) { bindUnlit(ch.glow); gl.drawArrays(gl.TRIANGLES, 0, ch.glow.n); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.72);
    {
      /* water follows the walker */
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uOrigin"), [px, 0, pz]);
      const wvp = m4.mul(vp, m4.trans(px, 0, pz));
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, wvp);
      bindUnlit(waterMesh);
      gl.drawArrays(gl.TRIANGLES, 0, waterMesh.n);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
    }
    gl.disable(gl.BLEND);
  };

  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    dayT = (dayT + dt / 300) % 1;
    /* movement */
    const sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 26 : 11) * dt;
    const fwd: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)];
    const right: [number, number] = [-fwd[1], fwd[0]];
    let mx = 0, mz = 0;
    if (!touched) { /* cinematic drift until the walker takes it */
      yaw += dt * 0.045;
      const target = height(px, pz) + 24 + Math.sin(now * 0.00021) * 3;
      py += (target - py) * Math.min(1, dt * 0.7);
    }
    if (keys.has("KeyW") || keys.has("ArrowUp")) { mx += fwd[0]; mz += fwd[1]; }
    if (keys.has("KeyS") || keys.has("ArrowDown")) { mx -= fwd[0]; mz -= fwd[1]; }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) { mx -= right[0]; mz -= right[1]; }
    if (keys.has("KeyD") || keys.has("ArrowRight")) { mx += right[0]; mz += right[1]; }
    const ml = Math.hypot(mx, mz) || 1;
    px += (mx / ml) * sp * (mx || mz ? 1 : 0);
    pz += (mz / ml) * sp * (mx || mz ? 1 : 0);
    if (flying) {
      if (keys.has("Space")) py += sp * 0.9;
      if (keys.has("KeyC")) py -= sp * 0.9;
      if (keys.has("KeyW")) py += Math.sin(pitch) * sp * 0.7;
      py = Math.max(height(px, pz) + 1.2, py);
    } else {
      const ground = height(px, pz) + 1.7;
      vy -= 22 * dt;
      py += vy * dt;
      if (py <= ground) { py = ground; vy = 0; }
      if (keys.has("Space") && py <= ground + 0.05) vy = 8.4;
    }
    /* chunks around the walker (max 2 builds/frame) */
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    let built = 0;
    for (let i = -RADIUS; i <= RADIUS && built < 2; i++) for (let j = -RADIUS; j <= RADIUS && built < 2; j++) {
      const k = keyOf(ccx + i, ccz + j);
      if (!chunks.has(k)) { chunks.set(k, buildChunk(ccx + i, ccz + j)); built++; }
    }
    for (const [k, ch] of chunks) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.abs(cx - ccx) > RADIUS + 1 || Math.abs(cz - ccz) > RADIUS + 1) {
        gl.deleteBuffer(ch.terrain.buf);
        if (ch.lit) gl.deleteBuffer(ch.lit.buf);
        if (ch.glow) gl.deleteBuffer(ch.glow.buf);
        chunks.delete(k);
      }
    }
    if ((frames++ & 15) === 0) posLabel.textContent = `x ${px.toFixed(0)} · z ${pz.toFixed(0)} · ${flying ? "flying" : "walking"} · ${chunks.size} chunks`;
  };

  const frame = () => {
    if (!body.isConnected) { document.removeEventListener("keydown", kd); document.removeEventListener("keyup", ku); return; }
    step();
    if (xrSession && xrRef) {
      /* XR frames are driven by the session's own rAF below. */
    } else {
      const asp = canvas.width / canvas.height;
      const proj = m4.persp(1.25, asp, 0.1, 1200);
      const view = m4.mul(m4.rotX(-pitch), m4.mul(m4.rotY(-yaw), m4.trans(-px, -py, -pz)));
      render(proj, view, [px, py, pz]);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* XR loop: stereo views from the headset pose */
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
        const proj = view.projectionMatrix as unknown as M4;
        const inv = view.transform.inverse.matrix as unknown as M4;
        render(proj, inv, [px, py, pz], first);
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
