/* ————————————————————————————————————————————————————————————————
   BLOODBATH — the stark contrast.

   The Simulacrum is a world that watches you and keeps its
   account in silence. This is the other world: it does not watch,
   it comes. A scorched field under a red dusk that never lifts,
   a sea the colour of what it is named for, and things in the
   murk that want you dead in plain, honest ways.

   Built on the Simulacrum's engine craft — seeded land, baked
   scatter, true-shape geometry, the same light — turned inside
   out: where that world forbids hostility, this one is nothing
   else. Guns here. Enemies here. The tally here. Each world
   keeps what the other refuses.
   ———————————————————————————————————————————————————————————————— */
import { mulberry32, m4, LIT_VS, LIT_FS, SKY_VS, SKY_FS, WATER_VS, WATER_FS, PTS_VS, PTS_FS } from "./os-simulacrum";

type Col3 = [number, number, number];
const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ————— the land: one fixed hell, the same for everyone ————— */
const SEED = 0xb100d;
const hash2 = (x: number, z: number): number => {
  let h = Math.sin(x * 127.1 + z * 311.7 + SEED * 0.013) * 43758.5453;
  return h - Math.floor(h);
};
const vnoise = (x: number, z: number): number => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), ux), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), ux), uz);
};
const fbm = (x: number, z: number, oct: number): number => {
  let v = 0, a = 0.55, f = 1;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, z * f); f *= 2.13; a *= 0.5; }
  return v;
};
export function bbHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const plain = clamp((d - 26) / 60, 0, 1);            // a killing floor at the heart
  const hills = Math.pow(fbm(x * 0.011 + 7.3, z * 0.011 + 2.9, 4), 1.6) * 34;
  const rough = fbm(x * 0.06 + 1.7, z * 0.06 + 8.4, 3) * 2.6;
  const rim = clamp((d - 130) / 40, 0, 1) * 22;         // the pit has walls
  return -1.6 + (hills + rough) * plain + rim;
}
const slopeAt = (x: number, z: number): number => {
  const e = 1.4;
  return Math.max(Math.abs(bbHeight(x + e, z) - bbHeight(x - e, z)), Math.abs(bbHeight(x, z + e) - bbHeight(x, z - e))) / (2 * e);
};

/* ————— geometry: true shapes, computed normals (the house kit, cut down) ————— */
function tri(a: number[], p: number[], q: number[], r: number[], col: Col3) {
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
  const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  a.push(...p, ...col, nx, ny, nz, ...q, ...col, nx, ny, nz, ...r, ...col, nx, ny, nz);
}
function prism(a: number[], x: number, y: number, z: number, rb: number, rt: number, h: number, sides: number, col: Col3, leanX = 0, leanZ = 0) {
  const ring = (r: number, yy: number, lx: number, lz: number) => {
    const pts: number[][] = [];
    for (let k = 0; k < sides; k++) { const t = (k / sides) * Math.PI * 2; pts.push([x + lx + Math.cos(t) * r, yy, z + lz + Math.sin(t) * r]); }
    return pts;
  };
  const bot = ring(rb, y, 0, 0), top = ring(rt, y + h, leanX, leanZ);
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    tri(a, bot[k], top[k], top[k2], col);
    tri(a, bot[k], top[k2], bot[k2], col);
    tri(a, [x, y, z], bot[k2], bot[k], col);
    tri(a, [x + leanX, y + h, z + leanZ], top[k], top[k2], col);
  }
}
function octa(a: number[], x: number, y: number, z: number, rx: number, ry: number, rz: number, col: Col3, twist = 0) {
  const T: number[] = [x, y + ry, z], B: number[] = [x, y - ry, z];
  const E: number[][] = [];
  for (let k = 0; k < 4; k++) { const t = (k / 4) * Math.PI * 2 + twist; E.push([x + Math.cos(t) * rx, y, z + Math.sin(t) * rz]); }
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    tri(a, T, E[k], E[k2], col);
    tri(a, B, E[k2], E[k], col);
  }
}
function boxS(a: number[], x: number, y: number, z: number, w: number, h: number, d: number, col: Col3, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx: number, ly: number, lz: number): number[] => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
  const c000 = P(-w / 2, 0, -d / 2), c100 = P(w / 2, 0, -d / 2), c110 = P(w / 2, 0, d / 2), c010 = P(-w / 2, 0, d / 2);
  const c001 = P(-w / 2, h, -d / 2), c101 = P(w / 2, h, -d / 2), c111 = P(w / 2, h, d / 2), c011 = P(-w / 2, h, d / 2);
  tri(a, c000, c100, c110, col); tri(a, c000, c110, c010, col);
  tri(a, c001, c111, c101, col); tri(a, c001, c011, c111, col);
  tri(a, c000, c001, c101, col); tri(a, c000, c101, c100, col);
  tri(a, c100, c101, c111, col); tri(a, c100, c111, c110, col);
  tri(a, c110, c111, c011, col); tri(a, c110, c011, c010, col);
  tri(a, c010, c011, c001, col); tri(a, c010, c001, c000, col);
}
/* a shape that faces a heading: local (lx right, ly up, lz forward) into the world */
function triR(a: number[], cx: number, cy: number, cz: number, sy: number, cyaw: number, p: number[], q: number[], r: number[], col: Col3) {
  const R = (v: number[]): number[] => [cx + v[0] * cyaw + v[2] * sy, cy + v[1], cz - v[0] * sy + v[2] * cyaw];
  tri(a, R(p), R(q), R(r), col);
}
function octaR(a: number[], cx: number, cy: number, cz: number, yaw: number, lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, col: Col3) {
  const sy = Math.sin(yaw), cyw = Math.cos(yaw);
  const wx = cx + lx * cyw + lz * sy, wz = cz - lx * sy + lz * cyw;
  octa(a, wx, cy + ly, wz, rx, ry, rz, col, yaw);
}
function prismR(a: number[], cx: number, cy: number, cz: number, yaw: number, lx: number, ly: number, lz: number, rb: number, rt: number, h: number, sides: number, col: Col3, leanF = 0) {
  const sy = Math.sin(yaw), cyw = Math.cos(yaw);
  const wx = cx + lx * cyw + lz * sy, wz = cz - lx * sy + lz * cyw;
  prism(a, wx, cy + ly, wz, rb, rt, h, sides, col, leanF * sy, leanF * cyw);
}

/* a stretched octa along any axis: tracers, barrels */
function beam(a: number[], x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, r: number, col: Col3) {
  const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; uz = 0; }
  let px2 = dy * uz - dz * uy, py2 = dz * ux - dx * uz, pz2 = dx * uy - dy * ux;
  const pl = Math.hypot(px2, py2, pz2) || 1; px2 /= pl; py2 /= pl; pz2 /= pl;
  const qx = dy * pz2 - dz * py2, qy = dz * px2 - dx * pz2, qz = dx * py2 - dy * px2;
  const T: number[] = [x + dx * len / 2, y + dy * len / 2, z + dz * len / 2];
  const B: number[] = [x - dx * len / 2, y - dy * len / 2, z - dz * len / 2];
  const E: number[][] = [
    [x + px2 * r, y + py2 * r, z + pz2 * r],
    [x + qx * r, y + qy * r, z + qz * r],
    [x - px2 * r, y - py2 * r, z - pz2 * r],
    [x - qx * r, y - qy * r, z - qz * r],
  ];
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; tri(a, T, E[k], E[k2], col); tri(a, B, E[k2], E[k], col); }
}

/* ————— the field, baked once ————— */
interface Solid { x: number; z: number; r: number }
function buildField(): { terrain: Float32Array; lit: Float32Array; solids: Solid[] } {
  const rnd = mulberry32(SEED ^ 0x5eed);
  const tv: number[] = [], lit: number[] = [], solids: Solid[] = [];
  const N = 150, EXT = 380, st = EXT / N;
  const H = (i: number, j: number) => bbHeight(-EXT / 2 + i * st, -EXT / 2 + j * st);
  const pal = (x: number, z: number, h: number, sl: number): Col3 => {
    const crack = fbm(x * 0.05 + 31, z * 0.05 + 17, 3);
    if (h < 0.15) return [0.145, 0.032, 0.030];
    if (sl > 0.55) return [0.16, 0.13, 0.12];
    if (crack > 0.60 && crack < 0.665 && sl < 0.3) return [0.42, 0.10, 0.02];   // ember seams in the crust
    if (h > 17) return [0.34, 0.29, 0.26];                                     // ash heights
    const v = 0.85 + hash2(Math.floor(x * 2), Math.floor(z * 2)) * 0.3;
    return [0.115 * v, 0.075 * v, 0.065 * v];
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -EXT / 2 + i * st, z0 = -EXT / 2 + j * st;
    const quad: Array<[number, number, number, Col3]> = [];
    for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]] as Array<[number, number]>) {
      const x = x0 + di * st, z = z0 + dj * st, h = H(i + di, j + dj);
      quad.push([x, h, z, pal(x, z, h, slopeAt(x, z))]);
    }
    const [A, B, C, D] = quad;
    const push = (P: [number, number, number, Col3], Q: [number, number, number, Col3], R: [number, number, number, Col3]) => {
      const ux = Q[0] - P[0], uy = Q[1] - P[1], uz = Q[2] - P[2];
      const vx = R[0] - P[0], vy = R[1] - P[1], vz = R[2] - P[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const V of [P, Q, R]) tv.push(V[0], V[1], V[2], V[3][0], V[3][1], V[3][2], nx / l, ny / l, nz / l);
    };
    push(A, B, C); push(A, C, D);
  }
  /* scatter: dead trees, black rock, bone, ruin — the leavings of a world that ended */
  for (let t = 0; t < 240; t++) {
    const a = rnd() * Math.PI * 2, d = 12 + Math.pow(rnd(), 0.7) * 150;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = bbHeight(x, z);
    if (h < 0.35 || slopeAt(x, z) > 0.6) continue;
    const roll = rnd();
    if (roll < 0.34) {
      /* a dead tree: a trunk and its bare reaching */
      const s = 0.7 + rnd() * 0.9, dark: Col3 = [0.07, 0.055, 0.05];
      prism(lit, x, h - 0.2, z, 0.22 * s, 0.10 * s, 3.6 * s, 6, dark, (rnd() - 0.5) * 0.8);
      const tx = x + (rnd() - 0.5) * 0.8, tz = z + (rnd() - 0.5) * 0.8;
      for (let b = 0; b < 4; b++) {
        const ba = rnd() * Math.PI * 2, bl = (1.2 + rnd() * 1.4) * s;
        prism(lit, tx, h + (2.2 + rnd() * 1.2) * s, tz, 0.07 * s, 0.015 * s, bl, 5, dark, Math.cos(ba) * bl * 0.55, Math.sin(ba) * bl * 0.55);
      }
      solids.push({ x, z, r: 0.5 * s });
    } else if (roll < 0.62) {
      const s = 0.5 + rnd() * 1.6;
      octa(lit, x, h + 0.2 * s, z, s, 0.62 * s, s * (0.7 + rnd() * 0.5), [0.09, 0.08, 0.085], rnd() * 3);
      solids.push({ x, z, r: 0.9 * s });
    } else if (roll < 0.80) {
      /* bone spikes, in leaning clusters */
      const bone: Col3 = [0.62, 0.58, 0.50];
      const n = 2 + Math.floor(rnd() * 3);
      for (let b = 0; b < n; b++) prism(lit, x + (rnd() - 0.5) * 1.6, h - 0.2, z + (rnd() - 0.5) * 1.6, 0.13, 0.01, 1.6 + rnd() * 2.2, 5, bone, (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.1);
      solids.push({ x, z, r: 0.8 });
    } else if (roll < 0.90) {
      /* a ribcage, half-buried */
      const bone: Col3 = [0.55, 0.51, 0.44], rot = rnd() * 3.14;
      for (let rib = 0; rib < 5; rib++) {
        const rr = 1.5 - Math.abs(rib - 2) * 0.18, off = (rib - 2) * 0.55;
        for (let sg = 0; sg < 5; sg++) {
          const aa = (sg / 5) * Math.PI, lx = off, lz = Math.cos(aa) * rr, ly = Math.sin(aa) * rr;
          const wx = x + lx * Math.cos(rot) - lz * Math.sin(rot), wz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
          octa(lit, wx, h + ly - 0.25, wz, 0.09, 0.09, 0.30, bone, rot);
        }
      }
      solids.push({ x, z, r: 1.2 });
    } else {
      /* a broken column of whatever stood here */
      const stone: Col3 = [0.20, 0.17, 0.16], ch = 2 + rnd() * 4.5;
      prism(lit, x, h - 0.3, z, 0.55, 0.48, ch, 6, stone);
      boxS(lit, x + 1.4, h - 0.2, z + 0.6, 1.0, 0.8, 1.0, stone, rnd() * 3);
      solids.push({ x, z, r: 0.9 });
    }
  }
  return { terrain: new Float32Array(tv), lit: new Float32Array(lit), solids };
}

/* ————————————————— the app ————————————————— */
export function buildBloodbath(body: HTMLElement) {
  const wrap = el("div", "os-bb");
  const canvas = document.createElement("canvas");
  canvas.className = "os-bb-canvas";
  const shade = el("div", "os-bb-shade");
  const hud = el("div", "os-bb-hud");
  const hpWrap = el("div", "os-bb-hp");
  const hpBar = el("div", "os-bb-hpbar");
  hpWrap.append(hpBar);
  const statLine = el("div", "os-bb-stats", "");
  hud.append(hpWrap, statLine);
  const cross = el("div", "os-bb-cross", "+");
  const banner = el("div", "os-bb-banner", "");
  const startScr = el("div", "os-bb-start");
  const startName = el("div", "os-bb-name", "bloodbath");
  const startSub = el("div", "os-bb-sub", "the other world — it does not watch. it comes.");
  const startBest = el("div", "os-bb-best", "");
  const startEnter = el("div", "os-bb-enter", "click to enter the pit");
  startScr.append(startName, startSub, startBest, startEnter);
  const deathScr = el("div", "os-bb-death");
  const deathName = el("div", "os-bb-name", "you died");
  const deathStats = el("div", "os-bb-best", "");
  const deathEnter = el("div", "os-bb-enter", "click to rise again");
  deathScr.append(deathName, deathStats, deathEnter);
  deathScr.style.display = "none";
  wrap.append(canvas, shade, hud, cross, banner, startScr, deathScr);
  body.append(wrap);

  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false })!;
  const compile = (vs: string, fs: string): WebGLProgram => {
    const mk = (type: number, src: string) => { const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    return pr;
  };
  const litPr = compile(LIT_VS, LIT_FS);
  const skyPr = compile(SKY_VS, SKY_FS);
  const waterPr = compile(WATER_VS, WATER_FS);
  const ptsPr = compile(PTS_VS, PTS_FS);
  const dummyTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dummyTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  interface Mesh { buf: WebGLBuffer; n: number }
  const makeMesh = (data: Float32Array, stride = 9): Mesh => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf, n: Math.floor(data.length / stride) };
  };
  const dynBuf = gl.createBuffer()!;
  const bindDyn = (pr: WebGLProgram, data: Float32Array, stride = 9): number => {
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(pr, "aPos"), aCol = gl.getAttribLocation(pr, "aCol"), aNor = gl.getAttribLocation(pr, "aNor");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * 4, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, stride * 4, 12);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, stride * 4, 24);
    return Math.floor(data.length / stride);
  };
  const SUN: Col3 = (() => { const v: Col3 = [-0.55, 0.30, -0.78]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const FOG: Col3 = [0.145, 0.028, 0.026];
  const setLit = (pr: WebGLProgram, vp: Float32Array, eye: [number, number, number], nowS: number) => {
    gl.useProgram(pr);
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, "uMVP"), false, vp);
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, "uModel"), false, m4.ident());
    gl.uniform2fv(gl.getUniformLocation(pr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(pr, "uSun"), SUN);
    gl.uniform3fv(gl.getUniformLocation(pr, "uFog"), FOG);
    gl.uniform1f(gl.getUniformLocation(pr, "uFogNear"), 26);
    gl.uniform1f(gl.getUniformLocation(pr, "uFogFar"), 235);
    gl.uniform3fv(gl.getUniformLocation(pr, "uTint"), [1.02, 0.80, 0.70]);
    gl.uniform3fv(gl.getUniformLocation(pr, "uCamPos"), eye);
    gl.uniform3fv(gl.getUniformLocation(pr, "uRim"), [0.42, 0.13, 0.09]);
    gl.uniform1f(gl.getUniformLocation(pr, "uTime"), nowS);
    gl.uniform3fv(gl.getUniformLocation(pr, "uSeason"), [0, 0, 0]);
    gl.uniform1f(gl.getUniformLocation(pr, "uShadowAmt"), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dummyTex);
    gl.uniform1i(gl.getUniformLocation(pr, "uShadowMap"), 0);
  };
  const bindMesh = (pr: WebGLProgram, m: Mesh, stride = 9) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = gl.getAttribLocation(pr, "aPos"), aCol = gl.getAttribLocation(pr, "aCol"), aNor = gl.getAttribLocation(pr, "aNor");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * 4, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, stride * 4, 12);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, stride * 4, 24);
  };

  /* static world */
  const field = buildField();
  const terrainMesh = makeMesh(field.terrain);
  const litMesh = makeMesh(field.lit);
  const skyOcta: number[] = [];
  octa(skyOcta, 0, 0, 0, 880, 880, 880, [1, 1, 1]);
  const skyPos: number[] = [];
  for (let i = 0; i < skyOcta.length; i += 9) skyPos.push(skyOcta[i], skyOcta[i + 1], skyOcta[i + 2]);
  const skyMesh = makeMesh(new Float32Array(skyPos), 3);
  /* the sea, the colour it is named for */
  const seaData: number[] = [];
  {
    const c: Col3 = [0.30, 0.018, 0.016], E = 460;
    for (const [x, z] of [[-E, -E], [E, -E], [E, E], [-E, E]] as Array<[number, number]>) seaData.push(x, 0.02, z, ...c, 0.94, 0.4);
    const idx = [0, 1, 2, 0, 2, 3];
    const flat: number[] = [];
    for (const i of idx) flat.push(...seaData.slice(i * 8, i * 8 + 8));
    var seaMesh = makeMesh(new Float32Array(flat), 8);
  }
  /* ash, forever falling */
  const ashData: number[] = [];
  {
    const arnd = mulberry32(SEED ^ 0xa54);
    for (let i = 0; i < 420; i++) {
      const ember = arnd() < 0.16;
      const c: Col3 = ember ? [0.95, 0.38, 0.08] : [0.42 + arnd() * 0.2, 0.30 + arnd() * 0.12, 0.26 + arnd() * 0.1];
      ashData.push((arnd() - 0.5) * 130, arnd() * 55, (arnd() - 0.5) * 130, ...c, ember ? 2.6 : 1.5 + arnd() * 1.6);
    }
  }
  const ashMesh = makeMesh(new Float32Array(ashData), 7);

  /* ————— sound: small, synthesized, angry ————— */
  const audio = {
    ctx: null as AudioContext | null,
    start() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { /* silence */ } } if (this.ctx?.state === "suspended") void this.ctx.resume(); },
    burst(dur: number, f0: number, f1: number, gain: number, type: OscillatorType | "noise") {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(this.ctx.destination);
      if (type === "noise") {
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const flt = this.ctx.createBiquadFilter(); flt.type = "bandpass"; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
        src.connect(flt); flt.connect(g); src.start(t);
      } else {
        const o = this.ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
        o.connect(g); o.start(t); o.stop(t + dur);
      }
    },
    shot() { this.burst(0.13, 2600, 300, 0.50, "noise"); this.burst(0.09, 210, 55, 0.4, "triangle"); },
    hit() { this.burst(0.07, 900, 500, 0.18, "square"); },
    kill() { this.burst(0.35, 300, 40, 0.4, "sawtooth"); this.burst(0.22, 1400, 200, 0.2, "noise"); },
    hurt() { this.burst(0.20, 140, 60, 0.5, "sawtooth"); },
    horn() { this.burst(0.9, 98, 96, 0.30, "sawtooth"); this.burst(0.9, 147, 144, 0.22, "sawtooth"); },
  };

  /* ————— state ————— */
  let px = 0, pz = 14, py = bbHeight(0, 14), vy = 0, yaw = Math.PI, pitch = 0;
  let hp = 100, lastHurtAt = -99, kills = 0, wave = 0, state: "start" | "play" | "dead" = "start";
  let best = { wave: 0, kills: 0, total: 0 };
  try { best = { ...best, ...(JSON.parse(localStorage.getItem("bloodbath-best") || "{}") as typeof best) }; } catch { /* fresh tally */ }
  const saveBest = () => { try { localStorage.setItem("bloodbath-best", JSON.stringify(best)); } catch { /* the tally is kept in memory */ } };
  startBest.textContent = best.wave > 0 ? `best — wave ${best.wave} · ${best.kills} kills · ${best.total} all told` : "no tally yet. the pit is waiting.";
  const keys = new Set<string>();
  let locked = false, firing = false, lastShotAt = 0, shake = 0, flashAt = -9, dmgAt = -9;

  canvas.addEventListener("click", () => {
    wrap.focus();
    if (state === "play" && !locked) canvas.requestPointerLock();
  });
  startScr.addEventListener("click", () => {
    wrap.focus();
    audio.start();
    if (state === "start") { state = "play"; startScr.style.display = "none"; nextWave(performance.now() / 1000); }
    canvas.requestPointerLock();
  });
  deathScr.addEventListener("click", () => {
    wrap.focus();
    audio.start();
    hp = 100; kills = 0; wave = 0; px = 0; pz = 14; py = bbHeight(0, 14); vy = 0;
    enemies.length = 0; spawnQueue = 0;
    state = "play"; deathScr.style.display = "none";
    nextWave(performance.now() / 1000);
    canvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  wrap.addEventListener("mousemove", (e) => {
    if (!locked || state !== "play") return;
    yaw -= e.movementX * 0.0023;
    pitch = clamp(pitch - e.movementY * 0.0023, -1.35, 1.35);
  });
  wrap.addEventListener("mousedown", (e) => { if (locked && state === "play" && e.button === 0) firing = true; });
  document.addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });
  wrap.addEventListener("keydown", (e) => { keys.add(e.code); });
  wrap.addEventListener("keyup", (e) => { keys.delete(e.code); });
  wrap.tabIndex = 0;

  /* ————— the things that come ————— */
  interface Husk { x: number; z: number; hp: number; speed: number; scale: number; brute: boolean; attackAt: number; hitAt: number; dead: boolean; deadAt: number; phase: number }
  const enemies: Husk[] = [];
  let spawnQueue = 0, bruteQueue = 0, spawnCount = 0, nextSpawnAt = 0, intermission = false, interAt = 0;
  const spawnHusk = (nowS: number) => {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 46 + Math.random() * 22;
      const x = clamp(px + Math.cos(a) * d, -160, 160), z = clamp(pz + Math.sin(a) * d, -160, 160);
      if (bbHeight(x, z) < 0.3) continue;
      const brute = bruteQueue > 0 && spawnCount % 6 === 5;
      if (brute) bruteQueue--;
      spawnCount++;
      enemies.push({
        x, z, hp: brute ? 330 : 75, speed: brute ? 2.4 : Math.min(5.2, 3.1 + Math.random() * 1.3 + wave * 0.06),
        scale: brute ? 1.55 : 0.95 + Math.random() * 0.15, brute, attackAt: nowS + 1, hitAt: -9,
        dead: false, deadAt: 0, phase: Math.random() * 9,
      });
      return;
    }
  };
  const sayBanner = (text: string, hold = 2.6) => {
    banner.textContent = text;
    banner.style.opacity = "1";
    window.setTimeout(() => { banner.style.opacity = "0"; }, hold * 1000);
  };
  const nextWave = (nowS: number) => {
    wave++;
    spawnQueue = 4 + wave * 3;
    bruteQueue = Math.floor(wave / 3);
    spawnCount = 0;
    nextSpawnAt = nowS + 1.5;
    intermission = false;
    best.wave = Math.max(best.wave, wave);
    saveBest();
    sayBanner(`wave ${wave}`);
    audio.horn();
  };

  /* ————— blood, in the air ————— */
  interface Mote { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; col: Col3; s: number }
  const motes: Mote[] = [];
  const burst = (x: number, y: number, z: number, col: Col3, n: number, spd = 3, up = 2.5) => {
    for (let i = 0; i < n && motes.length < 650; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.7) * spd;
      motes.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.random() * up, vz: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.7, col, s: 0.05 + Math.random() * 0.09 });
    }
  };

  /* ————— the weapon ————— */
  let tracer: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; until: number } | null = null;
  let recoil = 0;
  const shoot = (nowS: number, eye: [number, number, number], fwd: [number, number, number]) => {
    lastShotAt = nowS; flashAt = nowS; recoil = Math.min(1, recoil + 0.55);
    audio.shot();
    let bestT = 220, hitHusk: Husk | null = null, headshot = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const gy = bbHeight(e.x, e.z);
      for (const [cy, r, head] of [[gy + 1.95 * e.scale, 0.36 * e.scale, true], [gy + 1.10 * e.scale, 0.58 * e.scale, false]] as Array<[number, number, boolean]>) {
        const ox = e.x - eye[0], oy = cy - eye[1], oz = e.z - eye[2];
        const t = ox * fwd[0] + oy * fwd[1] + oz * fwd[2];
        if (t < 0.5 || t > bestT) continue;
        const cxp = eye[0] + fwd[0] * t, cyp = eye[1] + fwd[1] * t, czp = eye[2] + fwd[2] * t;
        if (Math.hypot(e.x - cxp, cy - cyp, e.z - czp) < r) { bestT = t; hitHusk = e; headshot = head; }
      }
    }
    let groundT = 220;
    for (let t = 2; t < 220; t += 1.5) {
      const gx = eye[0] + fwd[0] * t, gy2 = eye[1] + fwd[1] * t, gz = eye[2] + fwd[2] * t;
      if (gy2 < bbHeight(gx, gz)) { groundT = t; break; }
    }
    const tHit = Math.min(bestT, groundT);
    const ix = eye[0] + fwd[0] * tHit, iy = eye[1] + fwd[1] * tHit, iz = eye[2] + fwd[2] * tHit;
    const right: Col3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
    tracer = { x1: eye[0] + right[0] * 0.26 + fwd[0] * 0.5, y1: eye[1] - 0.22, z1: eye[2] + right[2] * 0.26 + fwd[2] * 0.5, x2: ix, y2: iy, z2: iz, until: nowS + 0.07 };
    if (hitHusk && bestT <= groundT) {
      const e = hitHusk;
      e.hp -= headshot ? 60 : 25;
      e.hitAt = nowS;
      burst(ix, iy, iz, [0.55, 0.03, 0.02], headshot ? 22 : 13, 3.4, 2.6);
      audio.hit();
      if (e.hp <= 0 && !e.dead) {
        e.dead = true; e.deadAt = nowS; kills++;
        burst(e.x, bbHeight(e.x, e.z) + 1.2, e.z, [0.62, 0.04, 0.03], 30, 4.2, 3.4);
        audio.kill();
      }
    } else if (groundT < 220) {
      burst(ix, iy + 0.2, iz, [0.36, 0.30, 0.27], 6, 2.0, 2.0);
    }
  };
  const hurt = (dmg: number, nowS: number) => {
    if (state !== "play") return;
    hp -= dmg; lastHurtAt = nowS; dmgAt = nowS; shake = Math.min(1, shake + 0.5);
    audio.hurt();
    if (hp <= 0) {
      hp = 0; state = "dead";
      best.kills = Math.max(best.kills, kills);
      best.total += kills;
      saveBest();
      deathStats.textContent = `wave ${wave} · ${kills} kills — best wave ${best.wave} · ${best.total} all told`;
      deathScr.style.display = "flex";
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  };

  /* ————— the frame ————— */
  let lastT = performance.now();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!wrap.isConnected) return;
    const now = performance.now();
    const nowS = now / 1000;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    /* fit */
    const cw = wrap.clientWidth || 1024, chh = wrap.clientHeight || 640;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (state === "play") {
      /* move */
      const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const spd = run ? 8.6 : 5.2;
      let mx = 0, mz = 0;
      const sy = Math.sin(yaw), cyw = Math.cos(yaw);
      if (keys.has("KeyW") || keys.has("ArrowUp")) { mx += -sy; mz += -cyw; }
      if (keys.has("KeyS") || keys.has("ArrowDown")) { mx += sy; mz += cyw; }
      if (keys.has("KeyA") || keys.has("ArrowLeft")) { mx += -cyw; mz += sy; }
      if (keys.has("KeyD") || keys.has("ArrowRight")) { mx += cyw; mz += -sy; }
      const ml = Math.hypot(mx, mz);
      if (ml > 0) { mx = mx / ml * spd * dt; mz = mz / ml * spd * dt; px += mx; pz += mz; }
      const rr = Math.hypot(px, pz);
      if (rr > 165) { px *= 165 / rr; pz *= 165 / rr; }
      for (const so of field.solids) {
        const dx = px - so.x, dz = pz - so.z, d = Math.hypot(dx, dz);
        if (d > 0.001 && d < so.r + 0.55) { px = so.x + (dx / d) * (so.r + 0.55); pz = so.z + (dz / d) * (so.r + 0.55); }
      }
      const ground = bbHeight(px, pz);
      if ((keys.has("Space")) && Math.abs(py - ground) < 0.05) vy = 5.4;
      vy -= 13.5 * dt;
      py += vy * dt;
      if (py < ground) { py = ground; vy = 0; }
      if (firing && nowS - lastShotAt > 0.13) {
        const cp = Math.cos(pitch);
        shoot(nowS, [px, py + 1.66, pz], [-sy * cp, Math.sin(pitch), -cyw * cp]);
      }
      if (hp < 100 && nowS - lastHurtAt > 5) hp = Math.min(100, hp + dt * 6);
      /* waves */
      if (spawnQueue > 0 && nowS >= nextSpawnAt) { spawnHusk(nowS); spawnQueue--; nextSpawnAt = nowS + 1.1; }
      const alive = enemies.some((e) => !e.dead);
      if (spawnQueue === 0 && !alive && !intermission && state === "play") { intermission = true; interAt = nowS + 6; if (wave > 0) sayBanner(`wave ${wave} cleared`, 3.2); }
      if (intermission && nowS >= interAt) nextWave(nowS);
      /* the coming */
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz);
        const eyaw = Math.atan2(dx, dz);
        e.phase += dt * e.speed * 2.4;
        if (d > 1.55 * e.scale) {
          let vx = (dx / d) * e.speed * dt, vz = (dz / d) * e.speed * dt;
          for (const o of enemies) {
            if (o === e || o.dead) continue;
            const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz);
            if (od > 0.01 && od < 1.3) { vx += (ox / od) * (1.3 - od) * dt * 2.4; vz += (oz / od) * (1.3 - od) * dt * 2.4; }
          }
          e.x += vx; e.z += vz;
          void eyaw;
        } else if (nowS >= e.attackAt) {
          e.attackAt = nowS + 0.9;
          if (d < 2.3 * e.scale) hurt(e.brute ? 20 : 9, nowS);
        }
      }
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead && nowS - enemies[i].deadAt > 12) enemies.splice(i, 1);
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life += dt;
        if (m.life >= m.max) { motes.splice(i, 1); continue; }
        m.vy -= 5.5 * dt;
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      }
    }
    recoil = Math.max(0, recoil - dt * 7);
    shake = Math.max(0, shake - dt * 2.6);

    /* ——— render ——— */
    const eye: [number, number, number] = [px, py + 1.66 + Math.sin(nowS * 2.1) * 0.012, pz];
    const cp = Math.cos(pitch + recoil * 0.035), sp2 = Math.sin(pitch + recoil * 0.035);
    const fwd: [number, number, number] = [-Math.sin(yaw) * cp, sp2, -Math.cos(yaw) * cp];
    const shx = (Math.random() - 0.5) * shake * 0.05, shy = (Math.random() - 0.5) * shake * 0.05;
    const center: [number, number, number] = [eye[0] + fwd[0] + shx, eye[1] + fwd[1] + shy, eye[2] + fwd[2]];
    const proj = m4.persp(1.22, canvas.width / Math.max(1, canvas.height), 0.1, 1600);
    const view = m4.lookAt(eye, center, [0, 1, 0]);
    const vp = new Float32Array(m4.mul(proj, view));
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    /* sky */
    gl.depthMask(false);
    gl.useProgram(skyPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(skyPr, "uVP"), false, vp);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uZen"), [0.045, 0.008, 0.016]);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uHor"), [0.32, 0.075, 0.048]);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunDir"), SUN);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunCol"), [0.88, 0.22, 0.07]);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uNight"), 0.38);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uTime"), nowS);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uCover"), 0.35);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uGloom"), 0.4);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uFlash"), 0);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uMoonDir"), SUN);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uAurora"), 0);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uSecond"), 0);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, skyMesh.buf);
      const aPos = gl.getAttribLocation(skyPr, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
      gl.drawArrays(gl.TRIANGLES, 0, skyMesh.n);
    }
    gl.depthMask(true);
    /* land */
    setLit(litPr, vp, eye, nowS);
    bindMesh(litPr, terrainMesh);
    gl.drawArrays(gl.TRIANGLES, 0, terrainMesh.n);
    bindMesh(litPr, litMesh);
    gl.drawArrays(gl.TRIANGLES, 0, litMesh.n);
    /* the sea */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(waterPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(waterPr, "uMVP"), false, vp);
    gl.uniform2fv(gl.getUniformLocation(waterPr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(waterPr, "uCamPos"), eye);
    gl.uniform3fv(gl.getUniformLocation(waterPr, "uSun"), SUN);
    gl.uniform3fv(gl.getUniformLocation(waterPr, "uSunCol"), [0.88, 0.22, 0.07]);
    gl.uniform3fv(gl.getUniformLocation(waterPr, "uHor"), [0.32, 0.075, 0.048]);
    gl.uniform3fv(gl.getUniformLocation(waterPr, "uFog"), FOG);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uFogNear"), 26);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uFogFar"), 235);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uTime"), nowS);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uCold"), 0.15);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uDay"), 0.5);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, seaMesh.buf);
      const aPos = gl.getAttribLocation(waterPr, "aPos"), aCol = gl.getAttribLocation(waterPr, "aCol"), aAux = gl.getAttribLocation(waterPr, "aAux");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aAux);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(aAux, 2, gl.FLOAT, false, 32, 24);
      gl.drawArrays(gl.TRIANGLES, 0, seaMesh.n);
    }
    gl.disable(gl.BLEND);
    /* dynamic: husks, blood, tracer, the weapon */
    const dyn: number[] = [];
    for (const e of enemies) {
      const gy = bbHeight(e.x, e.z);
      const eyaw = Math.atan2(px - e.x, pz - e.z);
      const flash = nowS - e.hitAt < 0.09;
      const skin: Col3 = flash ? [1.0, 0.36, 0.24] : e.brute ? [0.13, 0.09, 0.09] : [0.16, 0.12, 0.11];
      const cloth: Col3 = flash ? [1.0, 0.4, 0.3] : [0.07, 0.05, 0.055];
      let sink = 0, sq = 1;
      if (e.dead) { const age = nowS - e.deadAt; sink = age * 0.16; sq = Math.max(0.25, 1 - age * 0.09); }
      const bob = e.dead ? 0 : Math.abs(Math.sin(e.phase)) * 0.09;
      const base = gy - sink + bob, sc = e.scale * sq;
      const step = Math.sin(e.phase) * 0.34;
      prismR(dyn, e.x, base, e.z, eyaw, -0.16 * sc, 0, step * 0.4, 0.09 * sc, 0.07 * sc, 0.78 * sc, 5, cloth);
      prismR(dyn, e.x, base, e.z, eyaw, 0.16 * sc, 0, -step * 0.4, 0.09 * sc, 0.07 * sc, 0.78 * sc, 5, cloth);
      prismR(dyn, e.x, base + 0.74 * sc, e.z, eyaw, 0, 0, 0, 0.34 * sc, 0.22 * sc, 0.72 * sc, 6, skin);
      prismR(dyn, e.x, base + 0.86 * sc, e.z, eyaw, -0.44 * sc, 0, 0.30 * sc, 0.07 * sc, 0.055 * sc, 0.66 * sc, 5, skin, 0.5);
      prismR(dyn, e.x, base + 0.86 * sc, e.z, eyaw, 0.44 * sc, 0, 0.30 * sc, 0.07 * sc, 0.055 * sc, 0.66 * sc, 5, skin, 0.5);
      octaR(dyn, e.x, base + 1.62 * sc, e.z, eyaw, 0, 0, 0, 0.17 * sc, 0.21 * sc, 0.17 * sc, skin);
      if (!e.dead) {
        octaR(dyn, e.x, base + 1.66 * sc, e.z, eyaw, -0.07 * sc, 0, 0.15 * sc, 0.028 * sc, 0.028 * sc, 0.028 * sc, [1.0, 0.12, 0.05]);
        octaR(dyn, e.x, base + 1.66 * sc, e.z, eyaw, 0.07 * sc, 0, 0.15 * sc, 0.028 * sc, 0.028 * sc, 0.028 * sc, [1.0, 0.12, 0.05]);
      }
    }
    for (const m of motes) {
      const f = 1 - m.life / m.max;
      octa(dyn, m.x, m.y, m.z, m.s * f, m.s * f, m.s * f, m.col);
    }
    if (tracer && nowS < tracer.until) {
      const dx = tracer.x2 - tracer.x1, dy = tracer.y2 - tracer.y1, dz = tracer.z2 - tracer.z1;
      const L = Math.hypot(dx, dy, dz) || 1;
      beam(dyn, (tracer.x1 + tracer.x2) / 2, (tracer.y1 + tracer.y2) / 2, (tracer.z1 + tracer.z2) / 2, dx, dy, dz, L, 0.02, [1.0, 0.55, 0.2]);
      octa(dyn, tracer.x1, tracer.y1, tracer.z1, 0.10, 0.10, 0.10, [1.0, 0.62, 0.18]);
    }
    /* the reaper, in hand */
    if (state === "play") {
      const right: [number, number, number] = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const back = recoil * 0.09;
      const gx = eye[0] + right[0] * 0.27 + fwd[0] * (0.55 - back);
      const gy2 = eye[1] - 0.24 + recoil * 0.03;
      const gz = eye[2] + right[2] * 0.27 + fwd[2] * (0.55 - back);
      const gunYaw = Math.atan2(fwd[0], fwd[2]);
      octa(dyn, gx, gy2, gz, 0.075, 0.085, 0.16, [0.10, 0.09, 0.10], gunYaw);
      beam(dyn, gx + fwd[0] * 0.30, gy2 + 0.01 + fwd[1] * 0.30, gz + fwd[2] * 0.30, fwd[0], fwd[1], fwd[2], 0.52, 0.026, [0.16, 0.14, 0.15]);
      boxS(dyn, gx - fwd[0] * 0.05, gy2 - 0.085, gz - fwd[2] * 0.05, 0.07, 0.10, 0.15, [0.13, 0.10, 0.09], gunYaw);
      if (nowS - flashAt < 0.05) octa(dyn, gx + fwd[0] * 0.60, gy2 + 0.01 + fwd[1] * 0.60, gz + fwd[2] * 0.60, 0.13, 0.13, 0.13, [1.0, 0.6, 0.15]);
    }
    if (dyn.length) {
      setLit(litPr, vp, eye, nowS);
      const n = bindDyn(litPr, new Float32Array(dyn));
      gl.drawArrays(gl.TRIANGLES, 0, n);
    }
    /* ash */
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(ptsPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(ptsPr, "uVP"), false, vp);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTime"), nowS);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 2.1);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uCam"), eye);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [130, 55, 130]);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uDrift"), 0.35);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTwinkle"), 0);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTint"), 0);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, ashMesh.buf);
      const aPos = gl.getAttribLocation(ptsPr, "aPos"), aCol = gl.getAttribLocation(ptsPr, "aCol"), aSize = gl.getAttribLocation(ptsPr, "aSize");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aSize);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 24);
      gl.drawArrays(gl.POINTS, 0, ashMesh.n);
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    /* ——— hud ——— */
    hpBar.style.width = `${Math.max(0, hp)}%`;
    hpBar.style.background = hp > 34 ? "#a31616" : "#e03418";
    const hostiles = enemies.filter((e) => !e.dead).length + spawnQueue;
    statLine.textContent = state === "play" ? `wave ${Math.max(1, wave)} · kills ${kills} · ${hostiles} still coming` : "";
    cross.style.opacity = state === "play" && locked ? "1" : "0";
    hud.style.opacity = state === "play" ? "1" : "0";
    const sinceDmg = nowS - dmgAt;
    shade.style.opacity = sinceDmg < 0.35 ? String(0.55 * (1 - sinceDmg / 0.35)) : hp < 34 && state === "play" ? String(0.16 + 0.08 * Math.sin(nowS * 5)) : "0";
  };
  requestAnimationFrame(frame);
}
