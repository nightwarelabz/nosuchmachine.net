/* ————————————————————————————————————————————————————————————————
   BLOODBATH — the stark contrast.

   The Simulacrum is a world that watches you and keeps its
   account in silence. This is the other world: it does not
   watch either — something worse lives here. There is a devil
   behind this place, and he keeps HIS account the way the
   Dreamer keeps hers: never in numbers, always in weather.
   The fog is his attention. The rain, when it comes, is his.

   One fixed hell, hand-laid, the same for everyone: a black
   cathedral, a graveyard, a gallows hill, a moat of what the
   sea is named for. No world-gen — the pit was BUILT, and it
   was built to be learned. A rifle in hand, a hook on the arm,
   and things in the murk that want you dead in plain, honest
   ways. Where the other world forbids hostility, this one is
   nothing else. Each world keeps what the other refuses.
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
  const plain = clamp((d - 58) / 78, 0, 1);            // a wide killing floor, hand-kept
  const hills = Math.pow(fbm(x * 0.011 + 7.3, z * 0.011 + 2.9, 4), 1.6) * 34;
  const rough = fbm(x * 0.06 + 1.7, z * 0.06 + 8.4, 3) * 2.6;
  const rim = clamp((d - 130) / 40, 0, 1) * 22;         // the pit has walls
  const moat = -3.4 * Math.exp(-Math.pow((d - 118) / 13, 2));   // a ring of blood, wadeable at its edges
  const shore = -clamp((d - 178) / 55, 0, 1) * 34;      // beyond the rim the land gives up to the sea
  return 0.55 + (hills + rough) * plain + rim + moat + shore;
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

/* a stretched octa along any axis: tracers, ropes, barrels */
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

/* ————— the field, baked once: terrain, then the hand-laid pit ————— */
interface Solid { x: number; z: number; r: number }
interface Pit { x: number; z: number; r: number }
function buildField(): { terrain: Float32Array; lit: Float32Array; solids: Solid[]; lairs: Array<[number, number]>; pits: Pit[] } {
  const rnd = mulberry32(SEED ^ 0x5eed);
  const tv: number[] = [], lit: number[] = [], solids: Solid[] = [], pits: Pit[] = [];
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

  /* ——— the hand-laid pit. Nothing here is rolled: it was placed. ——— */
  const STONE: Col3 = [0.155, 0.125, 0.12], STONE2: Col3 = [0.21, 0.165, 0.15], BONE: Col3 = [0.58, 0.53, 0.45];
  const WOOD: Col3 = [0.085, 0.058, 0.045], EMBER: Col3 = [0.85, 0.28, 0.05], EMBER2: Col3 = [1.0, 0.52, 0.12];
  const deadTree = (x: number, z: number, s: number) => {
    const h = bbHeight(x, z), dark: Col3 = [0.07, 0.055, 0.05];
    prism(lit, x, h - 0.2, z, 0.22 * s, 0.10 * s, 3.6 * s, 6, dark, (rnd() - 0.5) * 0.8);
    const tx = x + (rnd() - 0.5) * 0.8, tz = z + (rnd() - 0.5) * 0.8;
    for (let b = 0; b < 4; b++) {
      const ba = rnd() * Math.PI * 2, bl = (1.2 + rnd() * 1.4) * s;
      prism(lit, tx, h + (2.2 + rnd() * 1.2) * s, tz, 0.07 * s, 0.015 * s, bl, 5, dark, Math.cos(ba) * bl * 0.55, Math.sin(ba) * bl * 0.55);
    }
    solids.push({ x, z, r: 0.5 * s });
  };
  const ribcage = (x: number, z: number, s: number) => {
    const h = bbHeight(x, z), rot = rnd() * 3.14;
    for (let rib = 0; rib < 5; rib++) {
      const rr = (1.5 - Math.abs(rib - 2) * 0.18) * s, off = (rib - 2) * 0.55 * s;
      for (let sg = 0; sg < 5; sg++) {
        const aa = (sg / 5) * Math.PI, lx = off, lz = Math.cos(aa) * rr, ly = Math.sin(aa) * rr;
        const wx = x + lx * Math.cos(rot) - lz * Math.sin(rot), wz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
        octa(lit, wx, h + ly - 0.25, wz, 0.09 * s, 0.09 * s, 0.30 * s, BONE, rot);
      }
    }
    solids.push({ x, z, r: 1.2 * s });
  };
  /* the cathedral, north — black stone, open to a sky that never helps */
  {
    const cx = 0, cz = -64, gy = bbHeight(cx, cz);
    boxS(lit, cx, gy - 0.30, cz, 17, 0.35, 15, STONE);                       // the floor slab, near-flush
    boxS(lit, cx, gy - 0.25, cz + 8.6, 13, 0.28, 2.2, STONE2);                // the step down to the pit
    for (const sxn of [-1, 1]) for (let i = 0; i < 4; i++) {                  // the colonnade
      const px2 = cx + sxn * (2.2 + i * 1.9), pz2 = cz + 6.4;
      prism(lit, px2, gy, pz2, 0.40, 0.34, 7.4, 8, STONE2);
      boxS(lit, px2, gy + 7.4, pz2, 1.15, 0.5, 1.15, STONE);
      solids.push({ x: px2, z: pz2, r: 0.62 });
      const qx = cx + sxn * (2.2 + i * 1.9), qz = cz - 6.4;
      prism(lit, qx, gy, qz, 0.40, 0.34, 7.4, 8, STONE2);
      solids.push({ x: qx, z: qz, r: 0.62 });
    }
    boxS(lit, cx, gy, cz - 7.6, 16.5, 8.6, 1.1, STONE);                       // the back wall
    for (let i = 0; i < 9; i++) solids.push({ x: cx - 7 + i * 1.75, z: cz - 7.6, r: 1.0 });
    boxS(lit, cx, gy + 8.55, cz, 17.5, 0.85, 16.5, STONE);                     // the roof beam, broken sky above
    for (const sxn of [-1, 1]) {                                              // the spires
      prism(lit, cx + sxn * 7.4, gy, cz - 7.2, 0.72, 0.5, 11.2, 6, STONE);
      octa(lit, cx + sxn * 7.4, gy + 11.9, cz - 7.2, 0.34, 1.1, 0.34, STONE2);
      solids.push({ x: cx + sxn * 7.4, z: cz - 7.2, r: 0.95 });
    }
    octa(lit, cx, gy + 5.7, cz - 6.95, 1.15, 1.15, 0.16, [0.50, 0.05, 0.045]); // the rose, lit from inside by nothing good
    boxS(lit, cx, gy + 0.05, cz - 3.4, 3.6, 1.05, 1.5, [0.10, 0.08, 0.09]);   // the altar
    octa(lit, cx, gy + 1.55, cz - 3.4, 0.30, 0.42, 0.30, [0.72, 0.05, 0.04]);
    solids.push({ x: cx, z: cz - 3.4, r: 1.7 });
    for (const sxn of [-1, 1]) {                                              // the braziers, always lit
      prism(lit, cx + sxn * 3.1, gy + 0.05, cz + 1.5, 0.30, 0.46, 0.8, 6, [0.12, 0.09, 0.08]);
      octa(lit, cx + sxn * 3.1, gy + 1.15, cz + 1.5, 0.30, 0.38, 0.30, EMBER2);
      solids.push({ x: cx + sxn * 3.1, z: cz + 1.5, r: 0.55 });
    }
  }
  /* the graveyard, west — rows, kept */
  {
    const cx = -54, cz = 16;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = cx + (c - 2.5) * 2.15 + (rnd() - 0.5) * 0.5, z = cz + (r - 1.5) * 2.7 + (rnd() - 0.5) * 0.5;
      const gy = bbHeight(x, z), roll = rnd();
      if (roll < 0.55) boxS(lit, x, gy - 0.08, z, 0.78, 0.95 + rnd() * 0.55, 0.22, [0.33, 0.30, 0.28], (rnd() - 0.5) * 0.45);
      else if (roll < 0.8) { boxS(lit, x, gy - 0.08, z, 0.20, 1.35, 0.20, [0.30, 0.27, 0.25], (rnd() - 0.5) * 0.3); boxS(lit, x, gy + 0.55, z, 0.72, 0.20, 0.20, [0.30, 0.27, 0.25], (rnd() - 0.5) * 0.3); }
      else prism(lit, x, gy - 0.1, z, 0.24, 0.10, 1.7 + rnd() * 0.5, 4, [0.28, 0.25, 0.24]);
      solids.push({ x, z, r: 0.42 });
    }
    for (let i = 0; i < 16; i++) {                                            // the iron fence, mostly standing
      const a = (i / 16) * Math.PI * 2, x = cx + Math.cos(a) * 9.5, z = cz + Math.sin(a) * 8.5;
      if (rnd() < 0.2) continue;
      prism(lit, x, bbHeight(x, z) - 0.1, z, 0.045, 0.045, 1.0, 4, [0.10, 0.09, 0.10]);
    }
    deadTree(cx - 7.5, cz - 6.5, 1.15); deadTree(cx + 8, cz + 6, 0.9);
  }
  /* the gallows, east */
  {
    const cx = 50, cz = -10, gy = bbHeight(cx, cz);
    boxS(lit, cx, gy - 0.18, cz, 5.2, 0.42, 5.2, WOOD);
    for (const szn of [-1, 1]) { prism(lit, cx - 1.5, gy + 0.2, cz + szn * 1.5, 0.13, 0.11, 3.7, 6, WOOD); solids.push({ x: cx - 1.5, z: cz + szn * 1.5, r: 0.34 }); }
    boxS(lit, cx - 1.5, gy + 3.85, cz, 0.34, 0.34, 3.9, WOOD);
    boxS(lit, cx - 0.55, gy + 3.85, cz, 2.0, 0.30, 0.30, WOOD);
    prism(lit, cx + 0.35, gy + 2.05, cz, 0.035, 0.035, 1.8, 5, [0.45, 0.38, 0.28]);
    octa(lit, cx + 0.35, gy + 1.95, cz, 0.17, 0.22, 0.17, [0.45, 0.38, 0.28]);
    deadTree(cx + 4.5, cz + 4, 1.0);
  }
  /* the bone fields, north-east and south */
  ribcage(32, 54, 1.25); ribcage(38, 48, 0.9); ribcage(-8, 78, 1.4);
  {
    const x = 26, z = 62, gy = bbHeight(x, z);                               // something enormous died here
    octa(lit, x, gy + 0.75, z, 1.05, 0.92, 1.1, BONE, 0.5);
    octa(lit, x + 0.45, gy + 0.85, z + 0.92, 0.19, 0.19, 0.10, [0.05, 0.04, 0.04], 0.5);
    octa(lit, x - 0.42, gy + 0.85, z + 0.95, 0.19, 0.19, 0.10, [0.05, 0.04, 0.04], 0.5);
    boxS(lit, x + 0.1, gy - 0.05, z + 0.9, 0.85, 0.4, 0.5, BONE, 0.5);
    solids.push({ x, z, r: 1.15 });
  }
  /* watchtowers, west-north and east */
  for (const [tx, tz] of [[-38, -52], [62, 8]] as Array<[number, number]>) {
    const gy = bbHeight(tx, tz);
    for (const sxn of [-1, 1]) for (const szn of [-1, 1])
      prism(lit, tx + sxn * 1.35, gy - 0.2, tz + szn * 1.35, 0.13, 0.10, 5.4, 5, WOOD, -sxn * 0.85, -szn * 0.85);
    boxS(lit, tx, gy + 5.1, tz, 4.6, 0.35, 4.6, WOOD);
    for (const sxn of [-1, 1]) for (const szn of [-1, 1]) prism(lit, tx + sxn * 2.0, gy + 5.4, tz + szn * 2.0, 0.07, 0.06, 1.5, 4, WOOD);
    prism(lit, tx, gy + 6.8, tz, 2.9, 0.06, 1.9, 4, [0.12, 0.07, 0.06]);
    octa(lit, tx, gy + 6.1, tz, 0.22, 0.30, 0.22, EMBER2);
    solids.push({ x: tx, z: tz, r: 1.55 });
  }
  /* ruined walls — lanes and cover, laid like a maze someone gave up on */
  const wallRun = (x: number, z: number, rot: number, len: number) => {
    const n = Math.floor(len / 2.3), c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.16) continue;
      const lx = (i - (n - 1) / 2) * 2.3, wx = x + lx * c, wz = z + lx * s;
      const gy = bbHeight(wx, wz), h = rnd() < 0.14 ? 0.55 : 2.0 + rnd() * 1.4;
      boxS(lit, wx, gy - 0.25, wz, 2.4, h, 0.72, rnd() < 0.5 ? STONE : STONE2, rot);
      if (h > 1) solids.push({ x: wx, z: wz, r: 1.05 });
    }
  };
  wallRun(16, 8, 0.4, 16); wallRun(-18, -6, -0.9, 13); wallRun(6, 34, 1.25, 15);
  wallRun(-32, 44, 0.15, 12); wallRun(40, -38, 2.2, 14); wallRun(-14, -34, 1.7, 11);
  /* ember pits — the ground itself, burning low */
  for (const [qx, qz, qr] of [[-25, -38, 5.5], [56, 42, 6.5], [-64, -58, 5.0], [20, -14, 4.2]] as Array<[number, number, number]>) {
    const gy = bbHeight(qx, qz);
    octa(lit, qx, gy + 0.06, qz, qr, 0.10, qr, [0.30, 0.05, 0.012]);
    octa(lit, qx, gy + 0.10, qz, qr * 0.55, 0.09, qr * 0.55, EMBER);
    octa(lit, qx, gy + 0.13, qz, qr * 0.24, 0.08, qr * 0.24, EMBER2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, rx = qx + Math.cos(a) * (qr + 0.7), rz = qz + Math.sin(a) * (qr + 0.7);
      octa(lit, rx, bbHeight(rx, rz) + 0.25, rz, 0.4 + rnd() * 0.4, 0.35 + rnd() * 0.3, 0.4, [0.09, 0.08, 0.085], rnd() * 3);
    }
    pits.push({ x: qx, z: qz, r: qr * 0.85 });
  }
  /* scatter: the leavings, sparser now that the pit has furniture */
  for (let t = 0; t < 130; t++) {
    const a = rnd() * Math.PI * 2, d = 14 + Math.pow(rnd(), 0.7) * 148;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = bbHeight(x, z);
    if (h < 0.35 || slopeAt(x, z) > 0.6) continue;
    if (Math.abs(x) < 10 && z < -54 && z > -74) continue;                      // keep the cathedral floor clear
    const roll = rnd();
    if (roll < 0.30) deadTree(x, z, 0.7 + rnd() * 0.9);
    else if (roll < 0.58) {
      const s = 0.5 + rnd() * 1.6;
      octa(lit, x, h + 0.2 * s, z, s, 0.62 * s, s * (0.7 + rnd() * 0.5), [0.09, 0.08, 0.085], rnd() * 3);
      solids.push({ x, z, r: 0.9 * s });
    } else if (roll < 0.78) {
      const n = 2 + Math.floor(rnd() * 3);
      for (let b = 0; b < n; b++) prism(lit, x + (rnd() - 0.5) * 1.6, h - 0.2, z + (rnd() - 0.5) * 1.6, 0.13, 0.01, 1.6 + rnd() * 2.2, 5, BONE, (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.1);
      solids.push({ x, z, r: 0.8 });
    } else if (roll < 0.88) ribcage(x, z, 0.8 + rnd() * 0.4);
    else {
      const ch = 2 + rnd() * 4.5;
      prism(lit, x, h - 0.3, z, 0.55, 0.48, ch, 6, STONE2);
      boxS(lit, x + 1.4, h - 0.2, z + 0.6, 1.0, 0.8, 1.0, STONE2, rnd() * 3);
      solids.push({ x, z, r: 0.9 });
    }
  }
  const lairs: Array<[number, number]> = [[0, -64], [-54, 16], [50, -10], [32, 54], [-38, -52], [62, 8], [-8, 78], [20, -14]];
  return { terrain: new Float32Array(tv), lit: new Float32Array(lit), solids, lairs, pits };
}

/* ————————————————— the devil —————————————————
   The Dreamer keeps her account in weather and wonders, and
   never shows a number. He keeps his the same way. His ledger
   is ire: it rises with slaughter and with style, and it is
   read the way hers is — in what the world does to you. Fog
   is his attention closing in. The rage in their step is his
   pleasure. Every so often he reaches into the world himself:
   rain the colour of the sea, a darkness at noon, bells from
   no tower, a hunt he sends for his own amusement. He speaks
   rarely, sideways, and never to help. */
type HauntKind = "rain" | "hunt" | "dark" | "bells";
class Devil {
  private rnd = mulberry32(SEED ^ 0xde71);
  ire = 0;
  fog = 0;
  rage = 1;
  private nextHauntAt = 110;
  private nextTauntAt = 55;
  private flags = new Set<string>();
  private pick(pool: string[]): string { return pool[Math.floor(this.rnd() * pool.length)]; }
  note(ev: string): string | undefined {
    switch (ev) {
      case "firstkill":
        this.ire = Math.min(1, this.ire + 0.08);
        if (!this.flags.has(ev)) { this.flags.add(ev); return this.pick(["more.", "again. the pit approves.", "a good beginning."]); }
        break;
      case "headshot":
        this.ire = Math.min(1, this.ire + 0.03);
        if (this.rnd() < 0.30) return this.pick(["between the eyes.", "he saw that one.", "a mercy, of a kind."]);
        break;
      case "milestone":
        this.ire = Math.min(1, this.ire + 0.06);
        return this.pick(["the tally grows.", "my house rises, brick by brick.", "you dance well, meat."]);
      case "waveclear":
        this.ire = Math.min(1, this.ire + 0.05);
        if (this.rnd() < 0.6) return this.pick(["a brief mercy. it will not hold.", "rest. i am gathering more.", "even hell breathes between courses."]);
        break;
      case "death":
        this.ire = Math.min(1, this.ire + 0.07);
        return this.pick(["rise. you are mine either way.", "death is a door here. it opens inward.", "again. i have eternity; you have ammunition."]);
      case "hook":
        if (!this.flags.has(ev)) { this.flags.add(ev); return "it flies. how charming."; }
        break;
      case "lowhp":
        if (this.rnd() < 0.5) return this.pick(["bleed quieter.", "i can hear your heart. so can they.", "not yet. i am not finished with you."]);
        break;
    }
    return undefined;
  }
  act(nowS: number, busy: boolean, dt: number): { say?: string; haunt?: HauntKind } | null {
    this.ire = Math.max(0, this.ire - dt * 0.0022);
    const fogT = Math.min(0.85, this.ire * 0.55 + (busy ? 0.22 : 0));
    this.fog += (fogT - this.fog) * Math.min(1, dt * 0.35);
    this.rage = 1 + this.ire * 0.30;
    if (nowS >= this.nextHauntAt) {
      this.nextHauntAt = nowS + 150 + this.rnd() * 170;
      const roll = this.rnd();
      return {
        haunt: roll < 0.30 ? "rain" : roll < 0.55 ? "hunt" : roll < 0.80 ? "dark" : "bells",
        say: this.pick(["something is coming that is not a wave.", "a gift, of my kind.", "listen.", "the pit stirs."]),
      };
    }
    if (nowS >= this.nextTauntAt) {
      this.nextTauntAt = nowS + 75 + this.rnd() * 85;
      return { say: this.pick(["i keep the tally here.", "hell is patient. i am learning.", "every soul, a brick.", "you are the loudest thing in my house.", "do not stop on my account."]) };
    }
    return null;
  }
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
  const whisper = el("div", "os-bb-whisper", "");
  /* the glass menu — the pit's manners, inherited from the other world */
  const menu = el("div", "os-bb-menu");
  const menuTitle = el("div", "os-bb-mtitle", "the pit provides");
  const menuTally = el("div", "os-bb-mtally", "");
  const mrow = el("div", "os-bb-mrow");
  const mkBtn = (label: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.className = "os-bb-mbtn";
    b.textContent = label;
    return b;
  };
  const btnSound = mkBtn("sound · on");
  const btnIris = mkBtn("iris · auto");
  const btnPhoto = mkBtn("photo");
  const btnFull = mkBtn("full screen");
  mrow.append(btnSound, btnIris, btnPhoto, btnFull);
  const menuKeys = el("div", "os-bb-mkeys", "wasd move · mouse look · lmb fire · rmb / f — the hook · space jump — leaps off the hook · shift run · m menu");
  menu.append(menuTitle, menuTally, mrow, menuKeys);
  const menubtn = el("button", "os-bb-menubtn", "≡");
  const touchBox = el("div", "os-bb-touch");
  const tFire = el("div", "os-bb-tbtn os-bb-tfire", "fire");
  const tHook = el("div", "os-bb-tbtn os-bb-thook", "hook");
  const tJump = el("div", "os-bb-tbtn os-bb-tjump", "jump");
  touchBox.append(tFire, tHook, tJump);
  const startScr = el("div", "os-bb-start");
  const startName = el("div", "os-bb-name", "bloodbath");
  const startSub = el("div", "os-bb-sub", "the other world — it does not watch. it hunts. a devil keeps this place.");
  const startBest = el("div", "os-bb-best", "");
  const startEnter = el("div", "os-bb-enter", "click to enter the pit");
  startScr.append(startName, startSub, startBest, startEnter);
  const deathScr = el("div", "os-bb-death");
  const deathName = el("div", "os-bb-name", "you died");
  const deathDevil = el("div", "os-bb-sub", "");
  const deathStats = el("div", "os-bb-best", "");
  const deathEnter = el("div", "os-bb-enter", "click to rise again");
  deathScr.append(deathName, deathDevil, deathStats, deathEnter);
  deathScr.style.display = "none";
  wrap.append(canvas, shade, hud, cross, banner, whisper, menu, menubtn, touchBox, startScr, deathScr);
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
  let fogNear = 26, fogFar = 235;
  const setLit = (pr: WebGLProgram, vp: Float32Array, eye: [number, number, number], nowS: number) => {
    gl.useProgram(pr);
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, "uMVP"), false, vp);
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, "uModel"), false, m4.ident());
    gl.uniform2fv(gl.getUniformLocation(pr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(pr, "uSun"), SUN);
    gl.uniform3fv(gl.getUniformLocation(pr, "uFog"), FOG);
    gl.uniform1f(gl.getUniformLocation(pr, "uFogNear"), fogNear);
    gl.uniform1f(gl.getUniformLocation(pr, "uFogFar"), fogFar);
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

  /* ————— state ————— */
  const SPAWN: [number, number] = [0, -24];
  let px = SPAWN[0], pz = SPAWN[1], py = bbHeight(SPAWN[0], SPAWN[1]), vy = 0, vx = 0, vz = 0, yaw = 0, pitch = 0;
  let grounded = true;
  let hp = 100, lastHurtAt = -99, kills = 0, headshots = 0, wave = 0, state: "start" | "play" | "dead" = "start";
  let best = { wave: 0, kills: 0, total: 0 };
  try { best = { ...best, ...(JSON.parse(localStorage.getItem("bloodbath-best") || "{}") as typeof best) }; } catch { /* fresh tally */ }
  const saveBest = () => { try { localStorage.setItem("bloodbath-best", JSON.stringify(best)); } catch { /* the tally is kept in memory */ } };
  startBest.textContent = best.wave > 0 ? `best — wave ${best.wave} · ${best.kills} kills · ${best.total} all told` : "no tally yet. the pit is waiting.";
  const keys = new Set<string>();
  let locked = false, firing = false, rmbHeld = false, lastShotAt = 0, shake = 0, flashAt = -9, dmgAt = -9, splatAt = -9;
  let bloomSpread = 0, jumpReq = false, burnTick = 0, splashTick = 0;
  const hook = { live: false, x: 0, y: 0, z: 0, coolUntil: 0 };
  let hookWasHeld = false;
  const devil = new Devil();
  let skyNight = 0.38, darkUntil = 0, rainUntil = 0;
  const bellQueue: number[] = [];
  let nextBellAt = 0, nextThumpAt = 0, thump2At = 0;
  let sndOn = true, photoOn = false, menuOn = false;
  let irisMode: "auto" | "high" | "low" = "auto";
  let capIdx = 0, dprCap = 1.5, ashFrac = 1, fpsE = 60, irisAt = 0;
  const stick = { on: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  const lookT = { id: -1, lx: 0, ly: 0 };
  let touchFire = false, touchHook = false;

  /* ————— sound: small, synthesized, angry — and underneath it, the music of the place ————— */
  interface DroneNodes { g: GainNode; stop: () => void }
  const audio = {
    ctx: null as AudioContext | null,
    droneNodes: null as DroneNodes | null,
    delaySend: null as GainNode | null,
    start() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { /* silence */ } } if (this.ctx?.state === "suspended") void this.ctx.resume(); },
    burst(dur: number, f0: number, f1: number, gain: number, type: OscillatorType | "noise") {
      if (!this.ctx || !sndOn) return;
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
    hookSnd() { this.burst(0.09, 1500, 2600, 0.16, "square"); this.burst(0.14, 300, 90, 0.2, "triangle"); },
    thump(soft = false) { this.burst(0.16, 96, 40, soft ? 0.30 : 0.5, "sine"); },
    /* the soundtrack: a drone that never resolves, bells that
       answer nothing, a heart that is not yours */
    syncDrone(on: boolean) {
      if (!this.ctx) return;
      const c = this.ctx;
      if (on && !this.droneNodes) {
        const g = c.createGain(); g.gain.value = 0;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; lp.Q.value = 0.6;
        lp.connect(g); g.connect(c.destination);
        const mk = (type: OscillatorType, f: number, det: number, gn: number) => {
          const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
          const og = c.createGain(); og.gain.value = gn;
          o.connect(og); og.connect(lp); o.start();
          return o;
        };
        const oscs = [mk("sawtooth", 36.71, 0, 0.5), mk("sawtooth", 55.0, 7, 0.34), mk("sine", 73.42, -4, 0.5), mk("sine", 110.0, 3, 0.16)];
        const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
        const lg = c.createGain(); lg.gain.value = 0.014;
        lfo.connect(lg); lg.connect(g.gain); lfo.start();
        /* a shared echo for the bells */
        const dly = c.createDelay(1); dly.delayTime.value = 0.42;
        const fb = c.createGain(); fb.gain.value = 0.36;
        const wet = c.createGain(); wet.gain.value = 0.30;
        const send = c.createGain(); send.gain.value = 1;
        send.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(c.destination);
        this.delaySend = send;
        g.gain.setTargetAtTime(0.05, c.currentTime, 2.5);
        this.droneNodes = { g, stop: () => { for (const o of oscs) { try { o.stop(); } catch { /* done */ } } try { lfo.stop(); } catch { /* done */ } } };
      } else if (!on && this.droneNodes) {
        const dn = this.droneNodes; this.droneNodes = null; this.delaySend = null;
        dn.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
        window.setTimeout(() => dn.stop(), 900);
      } else if (on && this.droneNodes) {
        this.droneNodes.g.gain.setTargetAtTime(sndOn ? 0.05 : 0.0001, c.currentTime, 0.8);
      }
    },
    bell(f: number) {
      if (!this.ctx || !sndOn) return;
      const c = this.ctx, t = c.currentTime;
      const g = c.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 3.4);
      g.connect(c.destination);
      if (this.delaySend) g.connect(this.delaySend);
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2.76;
      const g2 = c.createGain(); g2.gain.value = 0.32;
      o.connect(g); o2.connect(g2); g2.connect(g);
      o.start(t); o2.start(t); o.stop(t + 3.5); o2.stop(t + 3.5);
    },
  };

  /* ————— voices of the pit ————— */
  const sayBanner = (text: string, hold = 2.6) => {
    banner.textContent = text;
    banner.style.opacity = "1";
    window.setTimeout(() => { banner.style.opacity = "0"; }, hold * 1000);
  };
  let whisperTimer = 0;
  const devilSay = (text?: string) => {
    if (!text) return;
    whisper.textContent = text;
    whisper.style.opacity = "1";
    window.clearTimeout(whisperTimer);
    whisperTimer = window.setTimeout(() => { whisper.style.opacity = "0"; }, 4600);
  };

  /* ————— the menu ————— */
  const refreshMenu = () => {
    btnSound.textContent = sndOn ? "sound · on" : "sound · off";
    btnIris.textContent = `iris · ${irisMode}`;
    btnPhoto.textContent = photoOn ? "photo · on" : "photo";
    menuTally.textContent = `the pit holds ${best.total + kills} · best wave ${Math.max(best.wave, wave)} · this run — wave ${Math.max(1, wave)} · ${kills} kills · ${headshots} between the eyes`;
  };
  const setMenu = (on: boolean) => {
    menuOn = on;
    wrap.classList.toggle("menu-on", on);
    if (on) {
      refreshMenu();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  };
  btnSound.addEventListener("click", () => { sndOn = !sndOn; audio.start(); refreshMenu(); });
  btnIris.addEventListener("click", () => { irisMode = irisMode === "auto" ? "high" : irisMode === "high" ? "low" : "auto"; refreshMenu(); });
  btnPhoto.addEventListener("click", () => { photoOn = !photoOn; wrap.classList.toggle("photo", photoOn); refreshMenu(); });
  btnFull.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.requestFullscreen().catch(() => { /* the OS window is enough */ });
  });
  menubtn.addEventListener("click", () => { audio.start(); setMenu(!menuOn); });

  /* ————— input ————— */
  canvas.addEventListener("click", () => {
    wrap.focus();
    if (state === "play" && !locked && !menuOn) canvas.requestPointerLock();
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
    respawn(performance.now() / 1000);
    canvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  wrap.addEventListener("mousemove", (e) => {
    if (!locked || state !== "play" || menuOn) return;
    yaw -= e.movementX * 0.0023;
    pitch = clamp(pitch - e.movementY * 0.0023, -1.35, 1.35);
  });
  wrap.addEventListener("mousedown", (e) => {
    if (state !== "play" || menuOn) return;
    if (e.button === 0 && locked) firing = true;
    if (e.button === 2) rmbHeld = true;
  });
  document.addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; if (e.button === 2) rmbHeld = false; });
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());
  wrap.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "Space") { if (!e.repeat) jumpReq = true; e.preventDefault(); }
    if (e.code === "KeyM" && state === "play") setMenu(!menuOn);
  });
  wrap.addEventListener("keyup", (e) => { keys.delete(e.code); });
  wrap.tabIndex = 0;
  /* touch: left thumb walks, right thumb looks, buttons bite */
  wrap.addEventListener("touchstart", (e) => {
    wrap.classList.add("touched");
    audio.start();
    const rect = wrap.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      if (t.target !== canvas && t.target !== wrap) continue;
      const x = t.clientX - rect.left, y = t.clientY - rect.top;
      if (x < rect.width / 2 && !stick.on) { stick.on = true; stick.id = t.identifier; stick.ox = x; stick.oy = y; stick.dx = 0; stick.dy = 0; }
      else if (lookT.id === -1) { lookT.id = t.identifier; lookT.lx = x; lookT.ly = y; }
    }
  }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    const rect = wrap.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const x = t.clientX - rect.left, y = t.clientY - rect.top;
      if (stick.on && t.identifier === stick.id) {
        stick.dx = clamp(x - stick.ox, -46, 46);
        stick.dy = clamp(y - stick.oy, -46, 46);
      } else if (t.identifier === lookT.id && state === "play" && !menuOn) {
        yaw -= (x - lookT.lx) * 0.0048;
        pitch = clamp(pitch - (y - lookT.ly) * 0.0048, -1.35, 1.35);
        lookT.lx = x; lookT.ly = y;
      }
    }
    if (state === "play") e.preventDefault();
  }, { passive: false });
  const touchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (stick.on && t.identifier === stick.id) { stick.on = false; stick.dx = 0; stick.dy = 0; }
      if (t.identifier === lookT.id) lookT.id = -1;
    }
  };
  wrap.addEventListener("touchend", touchEnd);
  wrap.addEventListener("touchcancel", touchEnd);
  const bindTBtn = (node: HTMLElement, down: () => void, up?: () => void) => {
    node.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    if (up) node.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); up(); }, { passive: false });
  };
  bindTBtn(tFire, () => { touchFire = true; }, () => { touchFire = false; });
  bindTBtn(tHook, () => { touchHook = true; }, () => { touchHook = false; });
  bindTBtn(tJump, () => { jumpReq = true; });

  /* ————— the things that come ————— */
  type Kind = "husk" | "stalker" | "brute" | "wraith" | "impaler";
  interface Foe {
    kind: Kind; x: number; z: number; hp: number; speed: number; scale: number; dmg: number; reach: number;
    attackCd: number; attackAt: number; hitAt: number; dead: boolean; deadAt: number; phase: number;
    ambient: boolean; lvx: number; lvz: number; lungeAt: number;
  }
  const foes: Foe[] = [];
  let spawnQueue: Kind[] = [];
  let nextSpawnAt = 0, intermission = false, interAt = 0, nextAmbAt = 10, clearedWave = 0;
  const makeFoe = (kind: Kind, x: number, z: number, nowS: number, ambient: boolean): Foe => {
    const base = {
      husk: { hp: 75, speed: 3.1 + Math.random() * 1.3 + wave * 0.06, scale: 0.95 + Math.random() * 0.15, dmg: 9, reach: 1.9, cd: 0.9 },
      stalker: { hp: 42, speed: 6.3 + Math.random() * 0.7, scale: 0.88 + Math.random() * 0.14, dmg: 8, reach: 2.5, cd: 0.7 },
      brute: { hp: 330, speed: 2.4, scale: 1.55, dmg: 20, reach: 2.7, cd: 0.9 },
      wraith: { hp: 60, speed: 3.6, scale: 1.0 + Math.random() * 0.12, dmg: 13, reach: 2.6, cd: 1.1 },
      impaler: { hp: 1500, speed: 2.3, scale: 2.3, dmg: 32, reach: 3.6, cd: 1.2 },
    }[kind];
    return {
      kind, x, z, hp: base.hp, speed: Math.min(6.9, base.speed), scale: base.scale, dmg: base.dmg, reach: base.reach,
      attackCd: base.cd, attackAt: nowS + 1, hitAt: -9, dead: false, deadAt: 0, phase: Math.random() * 9,
      ambient, lvx: 0, lvz: 0, lungeAt: nowS + 1 + Math.random() * 2,
    };
  };
  const spawnPoint = (): [number, number] => {
    if (Math.random() < 0.5) {
      const L = field.lairs[Math.floor(Math.random() * field.lairs.length)];
      return [L[0] + (Math.random() - 0.5) * 6, L[1] + (Math.random() - 0.5) * 6];
    }
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 46 + Math.random() * 22;
      const x = clamp(px + Math.cos(a) * d, -160, 160), z = clamp(pz + Math.sin(a) * d, -160, 160);
      if (bbHeight(x, z) < 0.3) continue;
      return [x, z];
    }
    return field.lairs[0];
  };
  const nextWave = (nowS: number) => {
    wave++;
    const n = 4 + wave * 3;
    const q: Kind[] = [];
    if (wave % 5 === 0) q.push("impaler");
    for (let i = 0; i < Math.floor(wave / 3); i++) q.push("brute");
    if (wave >= 2) for (let i = 0; i < Math.min(Math.floor((wave - 1) * 0.8), Math.floor(n * 0.3)); i++) q.push("wraith");
    for (let i = 0; i < Math.min(Math.floor(wave * 0.9), Math.floor(n * 0.35)); i++) q.push("stalker");
    while (q.length < n) q.push("husk");
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    spawnQueue = q;
    nextSpawnAt = nowS + 1.6;
    intermission = false;
    best.wave = Math.max(best.wave, wave);
    saveBest();
    sayBanner(wave % 5 === 0 ? `wave ${wave} — something large is coming` : `wave ${wave}`);
    audio.horn();
  };
  function respawn(nowS: number) {
    hp = 100; kills = 0; headshots = 0;
    px = SPAWN[0]; pz = SPAWN[1]; py = bbHeight(SPAWN[0], SPAWN[1]);
    vx = 0; vz = 0; vy = 0; yaw = 0; pitch = 0;
    foes.length = 0; spawnQueue = [];
    hook.live = false;
    const w = Math.max(1, wave);
    wave = w - 1;
    state = "play";
    deathScr.style.display = "none";
    nextWave(nowS);
  }

  /* ————— blood, in the air and on the ground ————— */
  interface Mote { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; col: Col3; s: number }
  const motes: Mote[] = [];
  const burst = (x: number, y: number, z: number, col: Col3, n: number, spd = 3, up = 2.5) => {
    for (let i = 0; i < n && motes.length < 650; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.7) * spd;
      motes.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.random() * up, vz: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.7, col, s: 0.05 + Math.random() * 0.09 });
    }
  };
  interface Gib { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; col: Col3; s: number; rest: boolean }
  const gibs: Gib[] = [];
  const spawnGibs = (e: Foe) => {
    const gy = bbHeight(e.x, e.z), cy = gy + 1.1 * e.scale;
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3.6;
      const boneBit = i % 3 === 2;
      gibs.push({
        x: e.x, y: cy, z: e.z, vx: Math.cos(a) * v, vy: 2 + Math.random() * 3.4, vz: Math.sin(a) * v,
        life: 0, col: boneBit ? [0.58, 0.53, 0.45] : i % 2 ? [0.42, 0.045, 0.035] : [0.28, 0.03, 0.028],
        s: (0.08 + Math.random() * 0.13) * e.scale, rest: false,
      });
    }
    if (gibs.length > 220) gibs.splice(0, gibs.length - 220);
  };
  interface Pool { x: number; z: number; r: number }
  const pools: Pool[] = [];
  const addPool = (x: number, z: number, s: number) => {
    pools.push({ x, z, r: (0.95 + Math.random() * 0.55) * s });
    if (pools.length > 80) pools.shift();
  };

  /* ————— shapes of the damned ————— */
  const spheresOf = (e: Foe): Array<[number, number, number, number, boolean]> => {
    const gy = bbHeight(e.x, e.z), s = e.scale;
    if (e.kind === "stalker") {
      const eyaw = Math.atan2(px - e.x, pz - e.z), fx = Math.sin(eyaw), fz = Math.cos(eyaw);
      return [
        [e.x + fx * 0.62 * s, gy + 0.60 * s, e.z + fz * 0.62 * s, 0.31 * s, true],
        [e.x, gy + 0.62 * s, e.z, 0.52 * s, false],
      ];
    }
    if (e.kind === "wraith") {
      const base = gy + 1.3;
      return [
        [e.x, base + 1.72 * s, e.z, 0.30 * s, true],
        [e.x, base + 0.95 * s, e.z, 0.52 * s, false],
      ];
    }
    return [
      [e.x, gy + 1.95 * s, e.z, 0.36 * s, true],
      [e.x, gy + 1.05 * s, e.z, 0.60 * s, false],
    ];
  };
  const foeVerts = (dyn: number[], e: Foe, nowS: number) => {
    const gy = bbHeight(e.x, e.z);
    const eyaw = Math.atan2(px - e.x, pz - e.z);
    const flash = nowS - e.hitAt < 0.09;
    let sink = 0, sq = 1;
    if (e.dead) { const age = nowS - e.deadAt; sink = age * 0.16; sq = Math.max(0.22, 1 - age * 0.085); }
    const sc = e.scale * sq;
    const bob = e.dead ? 0 : Math.abs(Math.sin(e.phase)) * 0.09;
    const step = Math.sin(e.phase) * 0.34;
    const FLASH: Col3 = [1.0, 0.38, 0.26];
    if (e.kind === "stalker") {
      const hide: Col3 = flash ? FLASH : [0.115, 0.088, 0.082];
      const belly: Col3 = flash ? FLASH : [0.21, 0.155, 0.13];
      const base = gy - sink + bob * 0.5;
      octaR(dyn, e.x, base, e.z, eyaw, 0, 0.62 * sc, 0, 0.30 * sc, 0.27 * sc, 0.66 * sc, hide);
      octaR(dyn, e.x, base, e.z, eyaw, 0, 0.58 * sc, 0.80 * sc, 0.21 * sc, 0.19 * sc, 0.30 * sc, hide);
      octaR(dyn, e.x, base, e.z, eyaw, 0, 0.42 * sc, 0.88 * sc, 0.15 * sc, 0.07 * sc, 0.24 * sc, belly);
      if (!e.dead) for (const sxn of [-1, 1]) octaR(dyn, e.x, base, e.z, eyaw, sxn * 0.09 * sc, 0.66 * sc, 1.04 * sc, 0.030 * sc, 0.030 * sc, 0.030 * sc, [1.0, 0.14, 0.05]);
      const legs: Array<[number, number, number]> = [[-0.20, 0.34, 0], [0.20, 0.34, Math.PI], [-0.20, -0.34, Math.PI], [0.20, -0.34, 0]];
      for (const [lx, lz, ph] of legs) prismR(dyn, e.x, base, e.z, eyaw, lx * sc, 0, lz * sc, 0.075 * sc, 0.05 * sc, 0.60 * sc, 5, hide, Math.sin(e.phase * 1.6 + ph) * 0.38);
      for (let i = 0; i < 3; i++) octaR(dyn, e.x, base, e.z, eyaw, 0, 0.94 * sc, (0.28 - i * 0.28) * sc, 0.07 * sc, 0.17 * sc, 0.07 * sc, [0.50, 0.46, 0.40]);
      prismR(dyn, e.x, base, e.z, eyaw, 0, 0.64 * sc, -0.62 * sc, 0.05 * sc, 0.012 * sc, 0.72 * sc, 5, hide, -0.85);
      return;
    }
    if (e.kind === "wraith") {
      const shroud: Col3 = flash ? FLASH : [0.35, 0.32, 0.42];
      const face: Col3 = flash ? FLASH : [0.74, 0.71, 0.78];
      const hover = (1.3 + Math.sin(nowS * 1.7 + e.phase) * 0.18) * sq;
      const base = gy + hover - sink;
      prism(dyn, e.x, base, e.z, 0.52 * sc, 0.15 * sc, 1.5 * sc, 7, shroud);
      octa(dyn, e.x, base + 1.72 * sc, e.z, 0.19 * sc, 0.24 * sc, 0.19 * sc, face);
      const fx = Math.sin(eyaw), fz = Math.cos(eyaw), rx2 = Math.cos(eyaw), rz2 = -Math.sin(eyaw);
      if (!e.dead) for (const sxn of [-1, 1]) octa(dyn, e.x + fx * 0.155 * sc + rx2 * sxn * 0.07 * sc, base + 1.76 * sc, e.z + fz * 0.155 * sc + rz2 * sxn * 0.07 * sc, 0.028 * sc, 0.028 * sc, 0.028 * sc, [0.88, 0.84, 0.98]);
      for (const sxn of [-1, 1]) prismR(dyn, e.x, base + 0.40 * sc, e.z, eyaw, sxn * 0.34 * sc, 0, 0.22 * sc, 0.045 * sc, 0.028 * sc, 0.88 * sc, 5, shroud, 0.35);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + nowS * 0.3;
        octa(dyn, e.x + Math.cos(a) * 0.44 * sc, base + 0.07 + Math.sin(nowS * 2.3 + k * 1.7) * 0.05, e.z + Math.sin(a) * 0.44 * sc, 0.09 * sc, 0.17 * sc, 0.09 * sc, shroud);
      }
      return;
    }
    /* husk, brute, impaler — one shape, three sizes of wrong */
    const skin: Col3 = flash ? FLASH : e.kind === "husk" ? [0.16, 0.12, 0.11] : e.kind === "brute" ? [0.13, 0.09, 0.09] : [0.15, 0.08, 0.08];
    const cloth: Col3 = flash ? FLASH : [0.07, 0.05, 0.055];
    const plate: Col3 = flash ? FLASH : [0.05, 0.045, 0.05];
    const base = gy - sink + bob;
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
    if (e.kind !== "husk") {
      for (const sxn of [-1, 1]) {
        octaR(dyn, e.x, base, e.z, eyaw, sxn * 0.14 * sc, 1.92 * sc, -0.02 * sc, 0.05 * sc, 0.30 * sc, 0.05 * sc, plate);
        octaR(dyn, e.x, base, e.z, eyaw, sxn * 0.44 * sc, 1.36 * sc, 0, 0.21 * sc, 0.12 * sc, 0.25 * sc, plate);
      }
      for (let i = 0; i < 3; i++) octaR(dyn, e.x, base, e.z, eyaw, 0, (1.38 - i * 0.22) * sc, -0.26 * sc, 0.06 * sc, 0.16 * sc, 0.06 * sc, plate);
    }
    if (e.kind === "impaler") {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        octaR(dyn, e.x, base, e.z, eyaw, Math.cos(a) * 0.13 * sc, 1.95 * sc, Math.sin(a) * 0.13 * sc, 0.05 * sc, 0.34 * sc, 0.05 * sc, plate);
      }
      octaR(dyn, e.x, base, e.z, eyaw, 0, 1.12 * sc, 0.30 * sc, 0.15 * sc, 0.20 * sc, 0.07 * sc, flash ? FLASH : [1.0, 0.24, 0.05]);
    }
  };

  /* ————— the weapons: the reaper, and the hook ————— */
  let tracer: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; until: number } | null = null;
  let recoil = 0;
  const shoot = (nowS: number, eye: [number, number, number], fwd: [number, number, number]) => {
    lastShotAt = nowS; flashAt = nowS; recoil = Math.min(1, recoil + 0.55);
    audio.shot();
    let bestT = 220, hitFoe: Foe | null = null, headshot = false;
    for (const e of foes) {
      if (e.dead) continue;
      for (const [cx2, cy2, cz2, r, head] of spheresOf(e)) {
        const ox = cx2 - eye[0], oy = cy2 - eye[1], oz = cz2 - eye[2];
        const t = ox * fwd[0] + oy * fwd[1] + oz * fwd[2];
        if (t < 0.5 || t > bestT) continue;
        const qx = eye[0] + fwd[0] * t, qy = eye[1] + fwd[1] * t, qz = eye[2] + fwd[2] * t;
        if (Math.hypot(cx2 - qx, cy2 - qy, cz2 - qz) < r) { bestT = t; hitFoe = e; headshot = head; }
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
    if (hitFoe && bestT <= groundT) {
      const e = hitFoe;
      e.hp -= headshot ? 65 : 26;
      e.hitAt = nowS;
      burst(ix, iy, iz, [0.55, 0.03, 0.02], headshot ? 24 : 14, 3.4, 2.6);
      audio.hit();
      if (e.hp <= 0 && !e.dead) {
        e.dead = true; e.deadAt = nowS; kills++;
        if (headshot) { headshots++; devilSay(devil.note("headshot")); }
        if (kills === 1) devilSay(devil.note("firstkill"));
        else if (kills % 25 === 0) devilSay(devil.note("milestone"));
        burst(e.x, bbHeight(e.x, e.z) + 1.2 * e.scale, e.z, [0.62, 0.04, 0.03], 30, 4.2, 3.4);
        spawnGibs(e);
        addPool(e.x, e.z, e.scale);
        if (Math.hypot(e.x - px, e.z - pz) < 9) splatAt = nowS;
        audio.kill();
      }
    } else if (groundT < 220) {
      burst(ix, iy + 0.2, iz, [0.36, 0.30, 0.27], 6, 2.0, 2.0);
    }
  };
  const fireHook = (nowS: number, eye: [number, number, number], fwd: [number, number, number]) => {
    if (hook.live || nowS < hook.coolUntil) return;
    let bestT = 72, ax = 0, ay = 0, az = 0, found = false;
    for (let t = 1.5; t < bestT; t += 1.1) {
      const gx = eye[0] + fwd[0] * t, gy2 = eye[1] + fwd[1] * t, gz = eye[2] + fwd[2] * t;
      const gh = bbHeight(gx, gz);
      if (gy2 <= gh + 0.25) { bestT = t; ax = gx; ay = gh + 0.3; az = gz; found = true; break; }
    }
    for (const s of field.solids) {
      const cx2 = s.x, cy2 = bbHeight(s.x, s.z) + 2.0, cz2 = s.z, r = s.r + 1.35;
      const ox = cx2 - eye[0], oy = cy2 - eye[1], oz = cz2 - eye[2];
      const t = ox * fwd[0] + oy * fwd[1] + oz * fwd[2];
      if (t < 1 || t > bestT) continue;
      const qx = eye[0] + fwd[0] * t, qy = eye[1] + fwd[1] * t, qz = eye[2] + fwd[2] * t;
      if (Math.hypot(cx2 - qx, cy2 - qy, cz2 - qz) < r) { bestT = t; ax = qx; ay = qy; az = qz; found = true; }
    }
    for (const e of foes) {
      if (e.dead) continue;
      for (const [cx2, cy2, cz2, r] of spheresOf(e)) {
        const ox = cx2 - eye[0], oy = cy2 - eye[1], oz = cz2 - eye[2];
        const t = ox * fwd[0] + oy * fwd[1] + oz * fwd[2];
        if (t < 1 || t > bestT) continue;
        const qx = eye[0] + fwd[0] * t, qy = eye[1] + fwd[1] * t, qz = eye[2] + fwd[2] * t;
        if (Math.hypot(cx2 - qx, cy2 - qy, cz2 - qz) < r + 0.3) { bestT = t; ax = cx2; ay = cy2; az = cz2; found = true; }
      }
    }
    if (!found) return;
    hook.live = true; hook.x = ax; hook.y = ay; hook.z = az;
    audio.hookSnd();
    devilSay(devil.note("hook"));
  };
  const releaseHook = (nowS: number) => { if (hook.live) { hook.live = false; hook.coolUntil = nowS + 0.3; } };

  /* ————— harm ————— */
  const die = () => {
    state = "dead";
    best.kills = Math.max(best.kills, kills);
    best.total += kills;
    saveBest();
    deathDevil.textContent = devil.note("death") ?? "";
    deathStats.textContent = `wave ${wave} · ${kills} kills — the pit holds ${best.total} now · best wave ${best.wave}`;
    deathScr.style.display = "flex";
    releaseHook(performance.now() / 1000);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const hurt = (dmg: number, nowS: number) => {
    if (state !== "play") return;
    const wasLow = hp < 30;
    hp -= dmg; lastHurtAt = nowS; dmgAt = nowS; shake = Math.min(1, shake + 0.5);
    audio.hurt();
    if (hp < 30 && !wasLow) devilSay(devil.note("lowhp"));
    if (hp <= 0) { hp = 0; die(); }
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
    /* the iris: quality that breathes so the pit never stutters */
    if (dt > 0) fpsE = fpsE * 0.95 + (1 / dt) * 0.05;
    if (nowS >= irisAt) {
      irisAt = nowS + 2.5;
      if (irisMode === "high") capIdx = 0;
      else if (irisMode === "low") capIdx = 3;
      else if (fpsE < 45 && capIdx < 3) capIdx++;
      else if (fpsE > 57 && capIdx > 0) capIdx--;
      dprCap = [1.5, 1.25, 1.0, 0.8][capIdx];
      ashFrac = [1, 0.8, 0.6, 0.45][capIdx];
    }
    const cw = wrap.clientWidth || 1024, chh = wrap.clientHeight || 640;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    audio.syncDrone(sndOn && state === "play");

    if (state === "play") {
      const sy = Math.sin(yaw), cyw = Math.cos(yaw);
      const eyeStep: [number, number, number] = [px, py + 1.66, pz];
      const cpS = Math.cos(pitch);
      const fwdStep: [number, number, number] = [-sy * cpS, Math.sin(pitch), -cyw * cpS];
      /* wish */
      let wx2 = 0, wz2 = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) { wx2 += -sy; wz2 += -cyw; }
      if (keys.has("KeyS") || keys.has("ArrowDown")) { wx2 += sy; wz2 += cyw; }
      if (keys.has("KeyA") || keys.has("ArrowLeft")) { wx2 += -cyw; wz2 += sy; }
      if (keys.has("KeyD") || keys.has("ArrowRight")) { wx2 += cyw; wz2 += -sy; }
      if (stick.on) { wx2 += -sy * (-stick.dy / 46) + cyw * (stick.dx / 46); wz2 += -cyw * (-stick.dy / 46) - sy * (stick.dx / 46); }
      const wl = Math.hypot(wx2, wz2);
      if (wl > 1) { wx2 /= wl; wz2 /= wl; }
      const groundHere = bbHeight(px, pz);
      const wading = groundHere < 0.3;
      const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const maxSpd = (run ? 8.6 : 5.2) * (wading ? 0.55 : 1);
      /* the hook: fire on the press, hold to be pulled, leap to let go flying */
      const hookHeldNow = rmbHeld || keys.has("KeyF") || touchHook;
      if (hookHeldNow && !hookWasHeld) fireHook(nowS, eyeStep, fwdStep);
      hookWasHeld = hookHeldNow;
      if (!hookHeldNow && hook.live) releaseHook(nowS);
      if (jumpReq && hook.live) { releaseHook(nowS); vy = Math.max(vy, 6.2); grounded = false; jumpReq = false; }
      if (hook.live) {
        const hx = hook.x - px, hy = hook.y - (py + 1.1), hz = hook.z - pz;
        const hd = Math.hypot(hx, hy, hz) || 1;
        vx += (hx / hd) * 47 * dt; vz += (hz / hd) * 47 * dt; vy += (hy / hd) * 47 * dt;
        if (hd < 2.4) releaseHook(nowS);
      }
      /* locomotion: weight and momentum, quake in its bones */
      if (grounded) {
        if (wl > 0.01) {
          const nvx = vx + wx2 * 52 * dt, nvz = vz + wz2 * 52 * dt;
          const ns = Math.hypot(nvx, nvz), cs = Math.hypot(vx, vz);
          const cap = Math.max(maxSpd, cs);
          if (ns > cap) { vx = (nvx / ns) * cap; vz = (nvz / ns) * cap; } else { vx = nvx; vz = nvz; }
        } else {
          const f = Math.max(0, 1 - 9 * dt); vx *= f; vz *= f;
        }
      } else {
        vx += wx2 * 3.4 * dt; vz += wz2 * 3.4 * dt;
        const dr = Math.max(0, 1 - 0.05 * dt); vx *= dr; vz *= dr;
      }
      const spdNow = Math.hypot(vx, vz);
      if (spdNow > 30) { vx *= 30 / spdNow; vz *= 30 / spdNow; }
      if (jumpReq && grounded) { vy = 6.6; grounded = false; }
      jumpReq = false;
      vy -= 17 * dt;
      px += vx * dt; pz += vz * dt; py += vy * dt;
      const rr = Math.hypot(px, pz);
      if (rr > 165) { px *= 165 / rr; pz *= 165 / rr; }
      for (const so of field.solids) {
        const dx = px - so.x, dz = pz - so.z, d = Math.hypot(dx, dz);
        if (d > 0.001 && d < so.r + 0.55) { px = so.x + (dx / d) * (so.r + 0.55); pz = so.z + (dz / d) * (so.r + 0.55); }
      }
      const ground = bbHeight(px, pz);
      if (py <= ground) {
        if (!grounded && vy < -10) { shake = Math.min(1, shake + 0.3); burst(px, ground + 0.3, pz, [0.4, 0.33, 0.3], 7, 1.8, 1.4); }
        py = ground; vy = 0; grounded = true;
      } else if (py > ground + 0.05) grounded = false;
      if (wading && Math.hypot(vx, vz) > 1) {
        splashTick -= dt;
        if (splashTick <= 0) { splashTick = 0.38; burst(px, 0.25, pz, [0.5, 0.04, 0.03], 5, 1.6, 1.8); }
      }
      /* the pits burn */
      for (const pit of field.pits) {
        if (Math.hypot(px - pit.x, pz - pit.z) < pit.r) {
          hp -= 7 * dt; dmgAt = nowS;
          burnTick -= dt;
          if (burnTick <= 0) { burnTick = 0.3; burst(px, py + 0.4, pz, [0.95, 0.4, 0.08], 4, 1.4, 2.2); }
          if (hp <= 0) { hp = 0; die(); }
          break;
        }
      }
      /* the reaper speaks */
      if ((firing || touchFire) && !menuOn && nowS - lastShotAt > 0.105) {
        const rgt: [number, number, number] = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const sp = bloomSpread;
        const dxr = (Math.random() - 0.5) * 2 * sp, dyr = (Math.random() - 0.5) * 2 * sp * 0.7;
        const fx2 = fwdStep[0] + rgt[0] * dxr, fy2 = fwdStep[1] + dyr, fz2 = fwdStep[2] + rgt[2] * dxr;
        const fl = Math.hypot(fx2, fy2, fz2) || 1;
        shoot(nowS, eyeStep, [fx2 / fl, fy2 / fl, fz2 / fl]);
        bloomSpread = Math.min(0.02, bloomSpread + 0.0035);
      }
      if (nowS - lastShotAt > 0.3) bloomSpread = Math.max(0, bloomSpread - dt * 0.06);
      if (hp < 100 && nowS - lastHurtAt > 5) hp = Math.min(100, hp + dt * 6);
      /* waves and the world's own prowling */
      if (spawnQueue.length && nowS >= nextSpawnAt) {
        const kind = spawnQueue.shift()!;
        const [sx2, sz2] = spawnPoint();
        foes.push(makeFoe(kind, sx2, sz2, nowS, false));
        nextSpawnAt = nowS + 1.0;
      }
      const livingWave = foes.some((f) => !f.dead && !f.ambient);
      const busy = spawnQueue.length > 0 || livingWave;
      if (nowS >= nextAmbAt) {
        nextAmbAt = nowS + 3.5;
        const amb = foes.filter((f) => !f.dead && f.ambient).length;
        if (!busy && amb < 6) {
          const roll = Math.random();
          const kind: Kind = roll < 0.55 ? "husk" : roll < 0.85 ? "stalker" : "wraith";
          const L = field.lairs[Math.floor(Math.random() * field.lairs.length)];
          foes.push(makeFoe(kind, L[0] + (Math.random() - 0.5) * 5, L[1] + (Math.random() - 0.5) * 5, nowS, true));
        }
      }
      if (spawnQueue.length === 0 && !livingWave && !intermission && wave > 0) {
        intermission = true; interAt = nowS + 7;
        if (wave > clearedWave) { clearedWave = wave; sayBanner(`wave ${wave} cleared`, 3.2); devilSay(devil.note("waveclear")); }
      }
      if (intermission && nowS >= interAt) nextWave(nowS);
      /* the devil, thinking */
      const actRes = devil.act(nowS, busy, dt);
      if (actRes?.say) devilSay(actRes.say);
      if (actRes?.haunt) {
        if (actRes.haunt === "rain") rainUntil = nowS + 24;
        else if (actRes.haunt === "dark") darkUntil = nowS + 28;
        else if (actRes.haunt === "bells") bellQueue.push(nowS + 0.4, nowS + 2.1, nowS + 4.0);
        else for (let i = 0; i < 3; i++) { const [hx2, hz2] = spawnPoint(); foes.push(makeFoe("stalker", hx2, hz2, nowS, true)); }
      }
      while (bellQueue.length && bellQueue[0] <= nowS) { bellQueue.shift(); audio.bell(65.41); }
      if (nowS < rainUntil) {
        for (let i = 0; i < 3 && motes.length < 640; i++) {
          motes.push({ x: px + (Math.random() - 0.5) * 44, y: py + 15 + Math.random() * 4, z: pz + (Math.random() - 0.5) * 44, vx: 0, vy: -13 - Math.random() * 5, vz: 0, life: 0, max: 1.1, col: [0.48, 0.03, 0.02], s: 0.05 });
        }
      }
      /* the soundtrack's appointments */
      if (sndOn && audio.ctx) {
        if (nextBellAt === 0) nextBellAt = nowS + 6;
        if (nowS >= nextBellAt) {
          nextBellAt = nowS + 11 + Math.random() * 16;
          audio.bell([73.42, 87.31, 98.0, 73.42, 110.0][Math.floor(Math.random() * 5)]);
        }
        if (devil.ire > 0.5) {
          if (nowS >= nextThumpAt) { nextThumpAt = nowS + 1.25; thump2At = nowS + 0.3; audio.thump(); }
          if (thump2At > 0 && nowS >= thump2At) { thump2At = 0; audio.thump(true); }
        }
      }
      const nightT = nowS < darkUntil ? 0.85 : 0.38;
      skyNight += (nightT - skyNight) * Math.min(1, dt * 0.7);
      fogFar = 235 - devil.fog * 78;
      fogNear = 26 - devil.fog * 9;
      /* the coming */
      for (const e of foes) {
        if (e.dead) continue;
        const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz);
        const gyE = bbHeight(e.x, e.z);
        const wf = gyE < 0.3 ? 0.6 : 1;
        const sp2 = e.speed * devil.rage * wf;
        e.phase += dt * (e.kind === "stalker" ? sp2 * 3.4 : sp2 * 2.4);
        if (e.kind === "stalker") {
          if (d < 10 && d > 2.8 && nowS >= e.lungeAt) {
            e.lungeAt = nowS + 2.1 + Math.random() * 1.4;
            e.lvx = (dx / (d || 1)) * 13.5; e.lvz = (dz / (d || 1)) * 13.5;
          }
          e.x += e.lvx * dt; e.z += e.lvz * dt;
          const ld = Math.max(0, 1 - 2.6 * dt); e.lvx *= ld; e.lvz *= ld;
        }
        if (d > e.reach) {
          let mxv = (dx / (d || 1)) * sp2 * dt, mzv = (dz / (d || 1)) * sp2 * dt;
          for (const o of foes) {
            if (o === e || o.dead) continue;
            const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz);
            if (od > 0.01 && od < 1.3) { mxv += (ox / od) * (1.3 - od) * dt * 2.4; mzv += (oz / od) * (1.3 - od) * dt * 2.4; }
          }
          e.x += mxv; e.z += mzv;
          if (e.kind !== "wraith") for (const so of field.solids) {
            const sdx = e.x - so.x, sdz = e.z - so.z, sd = Math.hypot(sdx, sdz);
            if (sd > 0.001 && sd < so.r + 0.5) { e.x = so.x + (sdx / sd) * (so.r + 0.5); e.z = so.z + (sdz / sd) * (so.r + 0.5); }
          }
        } else if (nowS >= e.attackAt) {
          e.attackAt = nowS + e.attackCd;
          hurt(e.dmg, nowS);
          if (e.kind === "stalker") { e.lvx = -(dx / (d || 1)) * 4; e.lvz = -(dz / (d || 1)) * 4; }
        }
      }
      for (let i = foes.length - 1; i >= 0; i--) if (foes[i].dead && nowS - foes[i].deadAt > 25) foes.splice(i, 1);
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life += dt;
        if (m.life >= m.max) { motes.splice(i, 1); continue; }
        m.vy -= 5.5 * dt;
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      }
      for (let i = gibs.length - 1; i >= 0; i--) {
        const g = gibs[i];
        g.life += dt;
        if (g.life > 18) { gibs.splice(i, 1); continue; }
        if (!g.rest) {
          g.vy -= 9.5 * dt;
          g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
          const gh = bbHeight(g.x, g.z) + g.s * 0.6;
          if (g.y < gh) {
            g.y = gh;
            if (Math.abs(g.vy) > 1.2) { g.vy = -g.vy * 0.35; g.vx *= 0.7; g.vz *= 0.7; }
            else { g.rest = true; g.vy = 0; }
          }
        }
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
    gl.uniform1f(gl.getUniformLocation(skyPr, "uNight"), skyNight);
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
    gl.uniform1f(gl.getUniformLocation(waterPr, "uFogNear"), fogNear);
    gl.uniform1f(gl.getUniformLocation(waterPr, "uFogFar"), fogFar);
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
    /* dynamic: the damned, the gore, the rope, the weapon */
    const dyn: number[] = [];
    for (const p of pools) octa(dyn, p.x, bbHeight(p.x, p.z) + 0.05, p.z, p.r, 0.035, p.r, [0.30, 0.025, 0.022]);
    for (const g of gibs) {
      const f2 = g.life > 14 ? Math.max(0.15, 1 - (g.life - 14) / 4) : 1;
      octa(dyn, g.x, g.y, g.z, g.s * f2, g.s * 0.8 * f2, g.s * f2, g.col);
    }
    for (const e of foes) foeVerts(dyn, e, nowS);
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
    /* the reaper, in hand — and the hook housing under its barrel */
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
      boxS(dyn, gx + fwd[0] * 0.10, gy2 - 0.175, gz + fwd[2] * 0.10, 0.06, 0.07, 0.22, [0.20, 0.17, 0.16], gunYaw);
      if (nowS - flashAt < 0.05) octa(dyn, gx + fwd[0] * 0.60, gy2 + 0.01 + fwd[1] * 0.60, gz + fwd[2] * 0.60, 0.13, 0.13, 0.13, [1.0, 0.6, 0.15]);
      if (hook.live) {
        const hx3 = eye[0] + right[0] * 0.27 + fwd[0] * 0.55, hy3 = eye[1] - 0.31, hz3 = eye[2] + right[2] * 0.27 + fwd[2] * 0.55;
        const rdx = hook.x - hx3, rdy = hook.y - hy3, rdz = hook.z - hz3;
        const RL = Math.hypot(rdx, rdy, rdz) || 1;
        beam(dyn, (hx3 + hook.x) / 2, (hy3 + hook.y) / 2, (hz3 + hook.z) / 2, rdx, rdy, rdz, RL, 0.016, [0.42, 0.40, 0.42]);
        octa(dyn, hook.x, hook.y, hook.z, 0.09, 0.09, 0.09, [0.55, 0.53, 0.55]);
      }
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
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 2.1 + devil.fog * 1.2);
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
      gl.drawArrays(gl.POINTS, 0, Math.floor(ashMesh.n * ashFrac));
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    /* ——— hud ——— */
    hpBar.style.width = `${Math.max(0, hp)}%`;
    hpBar.style.background = hp > 34 ? "#a31616" : "#e03418";
    const hostiles = foes.filter((e) => !e.dead).length + spawnQueue.length;
    statLine.textContent = state === "play" ? `wave ${Math.max(1, wave)} · kills ${kills} · ${hostiles} still coming · the pit holds ${best.total + kills}` : "";
    cross.style.opacity = state === "play" && (locked || wrap.classList.contains("touched")) && !menuOn ? "1" : "0";
    cross.style.transform = `translate(-50%, -50%) scale(${(1 + bloomSpread * 24).toFixed(2)})`;
    hud.style.opacity = state === "play" ? "1" : "0";
    const sinceDmg = nowS - dmgAt, sinceSplat = nowS - splatAt;
    let shO = 0;
    if (sinceDmg < 0.35) shO = Math.max(shO, 0.55 * (1 - sinceDmg / 0.35));
    if (sinceSplat < 0.5) shO = Math.max(shO, 0.6 * (1 - sinceSplat / 0.5));
    if (hp < 34 && state === "play") shO = Math.max(shO, 0.16 + 0.08 * Math.sin(nowS * 5));
    shade.style.opacity = String(shO);
  };
  requestAnimationFrame(frame);
}
