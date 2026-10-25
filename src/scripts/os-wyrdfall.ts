/* ————————————————————————————————————————————————————————————————
   WYRDFALL — a realm that keeps its own counsel.

   Not a tribute and not a copy: a first-person realm of the
   old school, raised from this house's own engine craft — the
   Simulacrum's seeded land and true-shape geometry, Bloodbath's
   arm and momentum — turned to a different purpose. A whole
   province: a capital of guilds and temples, villages, roads,
   barrows that go down further than they should. Make a
   character, take work from the guilds, learn by doing, rest
   to become. The realm does not scale to meet you and does
   not care whether you are ready. That is the posture.
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

/* ————— the land: one province, the same for everyone ————— */
const SEED = 0x99fd;
const hash2 = (x: number, z: number): number => {
  let h = Math.sin(x * 127.1 + z * 311.7 + 417.3) * 43758.5453;
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
interface Town { id: string; name: string; x: number; z: number; r: number; base: number; capital?: boolean }
const TOWNS: Town[] = [
  { id: "thornwick", name: "Thornwick", x: 0, z: -120, r: 95, base: 6, capital: true },
  { id: "millbrook", name: "Millbrook", x: -380, z: 260, r: 58, base: 9 },
  { id: "cairnford", name: "Cairn Ford", x: 430, z: 330, r: 58, base: 11 },
];
interface DungeonDef { id: string; name: string; x: number; z: number; seed: number; kind: string }
const DUNGEONS: DungeonDef[] = [
  { id: "barrow", name: "Barrow of the First King", x: 180, z: -420, seed: 1101, kind: "undead" },
  { id: "vault", name: "The Sunken Vault", x: -520, z: -180, seed: 2202, kind: "vermin" },
  { id: "hollow", name: "Witch Hollow", x: 560, z: 60, seed: 3303, kind: "cult" },
  { id: "deep", name: "The Howling Deep", x: -140, z: 560, seed: 4404, kind: "undead" },
];
const townAt = (x: number, z: number): Town | null => {
  for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.r) return t;
  return null;
};
export function wyHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  let h = Math.pow(fbm(x * 0.004 + 3.1, z * 0.004 + 9.4, 4), 1.5) * 46 + fbm(x * 0.03 + 7.7, z * 0.03 + 1.2, 3) * 3.2 - 6;
  h += clamp((d - 690) / 160, 0, 1) * 60;                                   // the province is walled by high country
  const lake = Math.exp(-Math.pow(Math.hypot(x + 470, z + 330) / 150, 2)); // the mere, south-west
  h = lerp(h, -3.5, clamp(lake * 1.4, 0, 1));
  for (const t of TOWNS) {                                                  // town flats
    const td = Math.hypot(x - t.x, z - t.z);
    if (td < t.r + 60) h = lerp(t.base, h, clamp((td - t.r * 0.55) / (t.r * 0.75), 0, 1));
  }
  for (const dg of DUNGEONS) {                                              // barrow mounds stand gentle
    const dd = Math.hypot(x - dg.x, z - dg.z);
    if (dd < 26) h = lerp(h + 2.2, h, clamp((dd - 8) / 18, 0, 1));
  }
  return h;
}
const slopeAt = (x: number, z: number): number => {
  const e = 1.6;
  return Math.max(Math.abs(wyHeight(x + e, z) - wyHeight(x - e, z)), Math.abs(wyHeight(x, z + e) - wyHeight(x, z - e))) / (2 * e);
};
/* roads: the old ways between the towns */
const ROADS: Array<[number, number, number, number]> = [
  [0, -120, -380, 260], [0, -120, 430, 330], [-380, 260, -140, 560],
  [0, -120, 180, -420], [-380, 260, -520, -180], [430, 330, 560, 60],
];
const roadDist = (x: number, z: number): number => {
  let best = 1e9;
  for (const [ax, az, bx, bz] of ROADS) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};

/* ————— geometry: the house kit ————— */
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
interface Solid { x: number; z: number; r: number }

/* ————— the province, baked ————— */
type BKind = "house" | "tavern" | "guildf" | "guildm" | "temple" | "shop";
interface Building { town: string; kind: BKind; name: string; x: number; z: number; rot: number; w: number; d: number; h: number; doorX: number; doorZ: number }
const KIND_NAME: Record<BKind, string> = {
  house: "a house", tavern: "The Gilded Boar", guildf: "Hall of the Hearthguard", guildm: "House of the Umbral Covenant", temple: "Temple of the Listening God", shop: "Provisions & Sundries",
};
const KIND_SIGN: Record<BKind, Col3> = {
  house: [0.4, 0.36, 0.3], tavern: [0.95, 0.62, 0.15], guildf: [0.75, 0.16, 0.10], guildm: [0.45, 0.30, 0.80], temple: [0.95, 0.85, 0.55], shop: [0.30, 0.65, 0.30],
};
function buildOverworld(): { terrain: Float32Array; lit: Float32Array; solids: Solid[]; buildings: Building[] } {
  const rnd = mulberry32(SEED ^ 0x0dd5);
  const tv: number[] = [], lit: number[] = [], solids: Solid[] = [], buildings: Building[] = [];
  const N = 132, EXT = 1760, st = EXT / N;
  const pal = (x: number, z: number, h: number, sl: number): Col3 => {
    if (h < 0.45) return [0.52, 0.46, 0.33];
    const rd = roadDist(x, z);
    if (rd < 4.6) return [0.40, 0.32, 0.22];
    if (rd < 10) return [0.36, 0.33, 0.19];
    const t = townAt(x, z);
    if (t) return [0.47, 0.41, 0.31];
    if (sl > 0.52) return [0.40, 0.375, 0.35];
    if (h > 30) return [0.55, 0.54, 0.52];
    const moist = fbm(x * 0.008 + 21, z * 0.008 + 4, 3);
    const v = 0.88 + hash2(Math.floor(x * 1.4), Math.floor(z * 1.4)) * 0.24;
    return moist > 0.52 ? [0.135 * v, 0.27 * v, 0.105 * v] : [0.30 * v, 0.33 * v, 0.135 * v];
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -EXT / 2 + i * st, z0 = -EXT / 2 + j * st;
    const quad: Array<[number, number, number, Col3]> = [];
    for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]] as Array<[number, number]>) {
      const x = x0 + di * st, z = z0 + dj * st, h = wyHeight(x, z);
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
  const building = (town: Town, kind: BKind, x: number, z: number, rot: number, w: number, d: number, h: number) => {
    const gy = wyHeight(x, z) - 0.25;
    const stone = kind === "guildf" || kind === "guildm" || kind === "temple";
    const wall: Col3 = stone ? [0.44, 0.41, 0.39] : [0.60 + rnd() * 0.06, 0.53, 0.43];
    const roof: Col3 = stone ? [0.28, 0.30, 0.37] : [0.44, 0.35, 0.19];
    const timber: Col3 = [0.23, 0.16, 0.10];
    const c = Math.cos(rot), s = Math.sin(rot);
    const L = (lx: number, lz: number): [number, number] => [x + lx * c - lz * s, z + lx * s + lz * c];
    /* walls: the front carries a door gap; the rest stand whole */
    const wallSeg = (lx: number, lz: number, len: number, alongX: boolean, hh: number, y0 = 0) => {
      const [wx, wz] = L(lx, lz);
      if (alongX) boxS(lit, wx, gy + y0, wz, len, hh, 0.35, wall, rot);
      else boxS(lit, wx, gy + y0, wz, 0.35, hh, len, wall, rot);
    };
    wallSeg(0, -d / 2, w, true, h);                                   // back
    wallSeg(-w / 2, 0, d, false, h);                                  // left
    wallSeg(w / 2, 0, d, false, h);                                   // right
    const doorW = 1.3;
    wallSeg(-(doorW / 2 + (w / 2 - doorW / 2) / 2), d / 2, w / 2 - doorW / 2, true, h);
    wallSeg(doorW / 2 + (w / 2 - doorW / 2) / 2, d / 2, w / 2 - doorW / 2, true, h);
    wallSeg(0, d / 2, doorW + 0.2, true, h - 2.3, 2.3);               // lintel
    const [dx2, dz2] = L(0, d / 2 + 0.1);
    boxS(lit, dx2, gy, dz2, doorW, 2.3, 0.14, [0.16, 0.11, 0.07], rot); // the door itself
    /* timbers + a pyramid roof + a chimney */
    for (const [cx2, cz2] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as Array<[number, number]>) {
      const [wx, wz] = L(cx2, cz2);
      boxS(lit, wx, gy, wz, 0.3, h, 0.3, timber, rot);
    }
    prism(lit, x, gy + h - 0.1, z, Math.max(w, d) * 0.74, 0.06, h * 0.52, 4, roof);
    if (kind === "house" || kind === "tavern") {
      const [hx2, hz2] = L(w * 0.28, -d * 0.18);
      boxS(lit, hx2, gy + h + h * 0.18, hz2, 0.55, 1.1, 0.55, wall, rot);
    }
    if (kind !== "house") {                                            // a sign, and its colour
      const [sx2, sz2] = L(w / 2 + 0.7, d / 2 + 0.7);
      prism(lit, sx2, gy, sz2, 0.07, 0.07, 2.6, 4, timber);
      octa(lit, sx2, gy + 2.85, sz2, 0.30, 0.38, 0.30, KIND_SIGN[kind]);
    }
    const [doorX, doorZ] = L(0, d / 2 + 1.6);
    buildings.push({ town: town.id, kind, name: KIND_NAME[kind], x, z, rot, w, d, h, doorX, doorZ });
    solids.push({ x, z, r: Math.max(w, d) * 0.44 });
  };
  for (const t of TOWNS) {
    const kinds: BKind[] = t.capital
      ? ["guildf", "guildm", "temple", "shop", "tavern", "house", "house", "house", "house", "house", "house", "house", "house", "house"]
      : t.id === "millbrook"
        ? ["tavern", "shop", "house", "house", "house", "house", "house"]
        : ["tavern", "temple", "house", "house", "house", "house", "house"];
    const ringR = t.capital ? 52 : 34;
    kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + rnd() * 0.22;
      const rr = ringR + (rnd() - 0.5) * 10 + (i % 3) * 6;
      const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
      const rot = Math.atan2(t.x - x, t.z - z);
      const big = kind !== "house";
      building(t, kind, x, z, rot, big ? 11 + rnd() * 3 : 7 + rnd() * 2.5, big ? 9.5 + rnd() * 2 : 6.5 + rnd() * 2, big ? 5.2 : 3.6 + rnd() * 0.8);
    });
    /* a well at the heart of every town */
    const gy = wyHeight(t.x, t.z);
    prism(lit, t.x, gy - 0.2, t.z, 1.15, 1.0, 0.9, 8, [0.42, 0.40, 0.38]);
    prism(lit, t.x - 1.3, gy - 0.2, t.z, 0.09, 0.09, 2.2, 4, [0.23, 0.16, 0.10]);
    prism(lit, t.x + 1.3, gy - 0.2, t.z, 0.09, 0.09, 2.2, 4, [0.23, 0.16, 0.10]);
    boxS(lit, t.x, gy + 1.95, t.z, 3.1, 0.18, 0.5, [0.23, 0.16, 0.10]);
    solids.push({ x: t.x, z: t.z, r: 1.5 });
  }
  /* dungeon mouths: a mound, a dark slab, two standing stones */
  for (const dg of DUNGEONS) {
    const gy = wyHeight(dg.x, dg.z);
    octa(lit, dg.x, gy + 0.4, dg.z, 7.5, 3.4, 7.5, [0.36, 0.33, 0.26]);
    boxS(lit, dg.x, gy + 0.2, dg.z + 5.4, 2.4, 3.4, 0.5, [0.10, 0.09, 0.10]);
    for (const sxn of [-1, 1]) {
      prism(lit, dg.x + sxn * 2.6, gy, dg.z + 5.2, 0.32, 0.2, 3.1 + sxn * 0.2, 5, [0.45, 0.43, 0.40], sxn * 0.25, 0);
      solids.push({ x: dg.x + sxn * 2.6, z: dg.z + 5.2, r: 0.55 });
    }
    solids.push({ x: dg.x, z: dg.z + 2.5, r: 4.6 });
  }
  /* the wild: pines, broadleafs, rock, the odd old stone */
  for (let i = 0; i < 750; i++) {
    const x = (rnd() - 0.5) * 1560, z = (rnd() - 0.5) * 1560;
    const h = wyHeight(x, z);
    if (h < 0.6 || slopeAt(x, z) > 0.62) continue;
    if (townAt(x, z)) continue;
    if (roadDist(x, z) < 6.5) continue;
    if (DUNGEONS.some((dg) => Math.hypot(x - dg.x, z - dg.z) < 14)) continue;
    const roll = rnd();
    if (roll < 0.52) {
      const s = 0.8 + rnd() * 0.9, trunk: Col3 = [0.20, 0.14, 0.09], leaf: Col3 = [0.075, 0.16, 0.07];
      prism(lit, x, h - 0.2, z, 0.16 * s, 0.11 * s, 2.6 * s, 6, trunk, (rnd() - 0.5) * 0.4);
      octa(lit, x, h + 3.1 * s, z, 1.5 * s, 1.7 * s, 1.5 * s, leaf);
      octa(lit, x, h + 4.4 * s, z, 1.05 * s, 1.3 * s, 1.05 * s, leaf);
      octa(lit, x, h + 5.5 * s, z, 0.6 * s, 0.9 * s, 0.6 * s, leaf);
      solids.push({ x, z, r: 0.42 * s });
    } else if (roll < 0.78) {
      const s = 0.8 + rnd() * 0.8, trunk: Col3 = [0.24, 0.17, 0.11], leaf: Col3 = [0.13, 0.24, 0.09];
      prism(lit, x, h - 0.2, z, 0.20 * s, 0.13 * s, 2.0 * s, 6, trunk, (rnd() - 0.5) * 0.5);
      octa(lit, x + 0.3, h + 2.6 * s, z, 1.6 * s, 1.2 * s, 1.6 * s, leaf);
      octa(lit, x - 0.9 * s, h + 2.1 * s, z + 0.5, 1.1 * s, 0.9 * s, 1.1 * s, leaf);
      octa(lit, x + 0.7 * s, h + 2.2 * s, z - 0.7 * s, 1.0 * s, 0.85 * s, 1.0 * s, leaf);
      solids.push({ x, z, r: 0.45 * s });
    } else if (roll < 0.94) {
      const s = 0.5 + rnd() * 1.7;
      octa(lit, x, h + 0.25 * s, z, s, 0.66 * s, s * (0.7 + rnd() * 0.5), [0.36, 0.34, 0.32], rnd() * 3);
      solids.push({ x, z, r: 0.9 * s });
    } else {
      prism(lit, x, h - 0.3, z, 0.5, 0.34, 2.6 + rnd() * 1.6, 5, [0.42, 0.40, 0.37], (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7);
      solids.push({ x, z, r: 0.6 });
    }
  }
  return { terrain: new Float32Array(tv), lit: new Float32Array(lit), solids, buildings };
}

/* ————— people, and the shape of a life ————— */
type SkillId = "blade" | "destruction" | "restoration" | "athletics" | "lockpick" | "mercantile";
const SKILL_NAME: Record<SkillId, string> = {
  blade: "Blade", destruction: "Destruction", restoration: "Restoration", athletics: "Athletics", lockpick: "Lockpicking", mercantile: "Mercantile",
};
interface Item { name: string; val: number; kind: "junk" | "potion-h" | "potion-m" | "letter" | "relic" }
interface Quest {
  id: number; kind: "cull" | "fetch" | "deliver"; giver: string; text: string;
  dungeon?: string; foe?: FoeKind; need: number; have: number; itemName?: string;
  toTown?: string; toNpc?: string; reward: number; faction: string; done: boolean;
}
interface Sheet {
  name: string; arch: string; level: number;
  skills: Record<SkillId, number>; uses: Record<SkillId, number>; gains: number;
  hp: number; mp: number; gold: number; weapon: number;
  rep: Record<string, number>; inv: Item[]; quests: Quest[];
}
const WEAPONS = [
  { name: "Rusty Iron Sword", dmg: 6, price: 0 },
  { name: "Iron Sword", dmg: 9, price: 80 },
  { name: "Steel Sword", dmg: 13, price: 230 },
  { name: "Silver Sword", dmg: 17, price: 520 },
];
interface Arch { id: string; name: string; blurb: string; skills: Partial<Record<SkillId, number>>; hp: number; mp: number }
const ARCHS: Arch[] = [
  { id: "knight", name: "Knight", blurb: "Sworn steel. The road is a duty and the sword is how it is answered.", skills: { blade: 34, athletics: 26, restoration: 12 }, hp: 120, mp: 40 },
  { id: "ranger", name: "Ranger", blurb: "The province is a text and you read it at a run — weather, track and sign.", skills: { blade: 26, athletics: 34, destruction: 16, lockpick: 14 }, hp: 102, mp: 62 },
  { id: "sorcerer", name: "Sorcerer", blurb: "The Covenant's dropout or its heir — the fire answers either way.", skills: { destruction: 34, restoration: 26, blade: 10 }, hp: 82, mp: 140 },
  { id: "rogue", name: "Rogue", blurb: "Every lock in the province is a question somebody hoped you'd never ask.", skills: { blade: 28, lockpick: 32, athletics: 24, mercantile: 16 }, hp: 95, mp: 56 },
];
const baseSkills = (): Record<SkillId, number> => ({ blade: 5, destruction: 5, restoration: 5, athletics: 5, lockpick: 5, mercantile: 5 });
const maxHp = (c: Sheet): number => (ARCHS.find((a) => a.id === c.arch)?.hp ?? 100) + (c.level - 1) * 9;
const maxMp = (c: Sheet): number => (ARCHS.find((a) => a.id === c.arch)?.mp ?? 60) + (c.level - 1) * 6;

type FoeKind = "wolf" | "bandit" | "skeleton" | "rat" | "cultist";
const FOE_NAME: Record<FoeKind, string> = { wolf: "wolf", bandit: "bandit", skeleton: "skeleton", rat: "barrow-rat", cultist: "hollow cultist" };
const FOES: Record<FoeKind, { hp: number; dmg: number; speed: number; gold: [number, number]; loot?: string }> = {
  wolf: { hp: 34, dmg: 7, speed: 5.6, gold: [0, 2], loot: "wolf pelt" },
  bandit: { hp: 52, dmg: 9, speed: 3.9, gold: [6, 22], loot: "bandit's sash" },
  skeleton: { hp: 46, dmg: 10, speed: 3.1, gold: [2, 12], loot: "grave goods" },
  rat: { hp: 16, dmg: 4, speed: 4.6, gold: [0, 3], loot: "rat tail" },
  cultist: { hp: 58, dmg: 11, speed: 3.6, gold:  [8, 26], loot: "hollow token" },
};
const FIRST = ["Aldric", "Berta", "Cassian", "Odile", "Fenwick", "Mabel", "Tomas", "Ysolt", "Garrick", "Hedda", "Osric", "Petra", "Wendell", "Sybil", "Ansel", "Runa", "Corin", "Maud", "Elias", "Verity"];
const RUMORS = [
  "They say the First King was buried sitting up, so he could watch the door.",
  "Wolves on the Millbrook road again. The Hearthguard pays for quiet roads, if you take my meaning.",
  "The mere gives back what it takes, but never in the same shape.",
  "A bell rings under Witch Hollow on windless nights. Nobody winds it. Nobody could.",
  "The Covenant pays well and asks nothing. That's what worries me.",
  "Silver bites the dead harder than iron does. Ask any gravedigger — the ones still living.",
  "If you must cross the high country, follow the old road-witches: grey stones, taller than you.",
  "The Listening God answers everyone. Eventually. That's the whole of the doctrine and the whole of the problem.",
  "Bandits keep to the roads at dusk. Cowards love an audience of travellers.",
  "They dug too deep in the Howling Deep and then, politely, stopped digging.",
];
const GREET: Record<string, string[]> = {
  innkeeper: ["Sit. The boar's honest and so is the ale.", "A bed, a bowl, or both — name it."],
  guildmaster: ["The Hall keeps the province's roads walkable. There's work, if you're the working kind.", "Mind the braziers. State your business."],
  covenmaster: ["You smell of weather and wanting. The Covenant can use both.", "Speak softly. The candles are listening on our behalf."],
  priest: ["The God is listening. So, for the moment, am I.", "You carry your troubles loudly, traveller. Set them down."],
  merchant: ["Everything's priced, friend. Even friendship, but I discount that.", "Come and see. Touching is free; leaving empty-handed costs you more."],
  townsfolk: ["Fine weather for the road, if the road behaves.", "Mind the wolves if you're walking far.", "You're not from the province. It suits you anyway."],
};
/* figures and beasts, drawn in the house geometry */
function humanoid(a: number[], x: number, y: number, z: number, yaw: number, phase: number, robe: Col3, trim: Col3, skin: Col3, hood = false) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const bob = Math.abs(Math.sin(phase)) * 0.05;
  const sw = Math.sin(phase) * 0.30;
  prismR(a, x, y + bob, z, yaw, 0, 0, 0, 0.36, 0.17, 1.02, 4, robe);
  prismR(a, x, y + bob, z, yaw, 0, 0.98, 0, 0.205, 0.16, 0.42, 4, robe);
  boxS(a, x, y + 1.24 + bob, z, 0.52, 0.10, 0.24, trim, yaw);
  if (hood) prismR(a, x, y + bob, z, yaw, 0, 1.36, 0, 0.20, 0.05, 0.34, 5, robe);
  octaR(a, x, y + bob, z, yaw, 0, 1.50, 0, 0.135, 0.16, 0.135, skin);
  prismR(a, x, y + bob, z, yaw, -0.30, 0.86, 0.02, 0.055, 0.05, 0.52, 4, robe, sw * 0.5);
  prismR(a, x, y + bob, z, yaw, 0.30, 0.86, 0.02, 0.055, 0.05, 0.52, 4, robe, -sw * 0.5);
  prismR(a, x, y + bob, z, yaw, -0.13, -0.06, 0, 0.06, 0.05, 0.16, 4, robe, sw);
  prismR(a, x, y + bob, z, yaw, 0.13, -0.06, 0, 0.06, 0.05, 0.16, 4, robe, -sw);
}
function beast(a: number[], x: number, y: number, z: number, yaw: number, phase: number, col: Col3, s: number) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const bob = Math.abs(Math.sin(phase * 2)) * 0.04 * s;
  const P = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * cy + lz * sy, y + ly, z - lx * sy + lz * cy];
  const bodyB = P(0, 0.62 * s + bob, 0);
  boxS(a, bodyB[0], bodyB[1], bodyB[2], 0.52 * s, 0.46 * s, 1.25 * s, col, yaw);
  const head = P(0, 0.78 * s + bob, 0.78 * s);
  octa(a, head[0], head[1], head[2], 0.20 * s, 0.19 * s, 0.30 * s, col);
  const ear1 = P(-0.12 * s, 1.0 * s + bob, 0.68 * s), ear2 = P(0.12 * s, 1.0 * s + bob, 0.68 * s);
  octa(a, ear1[0], ear1[1], ear1[2], 0.06 * s, 0.10 * s, 0.06 * s, col);
  octa(a, ear2[0], ear2[1], ear2[2], 0.06 * s, 0.10 * s, 0.06 * s, col);
  const tail = P(0, 0.74 * s + bob, -0.66 * s);
  beam(a, tail[0], tail[1], tail[2], -sy * 0.3, 0.25, -cy * 0.3, 0.55 * s, 0.045 * s, col);
  for (const [lx, lz] of [[-0.17, 0.42], [0.17, 0.42], [-0.17, -0.42], [0.17, -0.42]] as Array<[number, number]>) {
    const sw = Math.sin(phase * 2 + (lx > 0 ? 0 : Math.PI) + (lz > 0 ? 0.6 : 0)) * 0.16 * s;
    const leg = P(lx * s, 0, lz * s);
    prism(a, leg[0], y, leg[2], 0.055 * s, 0.045 * s, 0.62 * s, 4, col, sw * sy, sw * cy);
  }
}

/* ————— interiors and the places below ————— */
interface NpcDef { name: string; role: string; service: "inn" | "guildf" | "guildm" | "temple" | "shop" | null; x: number; z: number; yaw: number; robe: Col3 }
interface Interior { lit: Float32Array; solids: Solid[]; npcs: NpcDef[]; name: string }
const strSeed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ROBES: Col3[] = [[0.42, 0.30, 0.18], [0.25, 0.28, 0.40], [0.36, 0.20, 0.22], [0.22, 0.32, 0.24], [0.40, 0.36, 0.28], [0.30, 0.22, 0.38]];
function roomShell(lit: number[], W: number, D: number, wallCol: Col3, floorCol: Col3) {
  boxS(lit, 0, -0.25, 0, W, 0.25, D, floorCol);
  boxS(lit, 0, 3.4, 0, W, 0.25, D, [0.14, 0.11, 0.08]);
  boxS(lit, 0, 0, -D / 2, W, 3.4, 0.35, wallCol);
  boxS(lit, -W / 2, 0, 0, 0.35, 3.4, D, wallCol);
  boxS(lit, W / 2, 0, 0, 0.35, 3.4, D, wallCol);
  boxS(lit, -(1.1 + (W / 2 - 1.1) / 2), 0, D / 2, W / 2 - 1.1, 3.4, 0.35, wallCol);
  boxS(lit, 1.1 + (W / 2 - 1.1) / 2, 0, D / 2, W / 2 - 1.1, 3.4, 0.35, wallCol);
  boxS(lit, 0, 2.3, D / 2, 2.4, 1.1, 0.35, wallCol);
  boxS(lit, 0, 0, D / 2 + 0.05, 2.0, 2.3, 0.12, [0.15, 0.10, 0.06]);
}
function buildInterior(b: Building): Interior {
  const rnd = mulberry32(SEED ^ strSeed(b.town + ":" + b.kind + ":" + b.name));
  const lit: number[] = [], solids: Solid[] = [], npcs: NpcDef[] = [];
  const W = 17, D = 13;
  const stone = b.kind === "guildf" || b.kind === "guildm" || b.kind === "temple";
  roomShell(lit, W, D, stone ? [0.40, 0.37, 0.35] : [0.55, 0.48, 0.39], [0.34, 0.26, 0.18]);
  solids.push({ x: 0, z: -D / 2, r: 0 }, { x: -W / 2, z: 0, r: 0 }, { x: W / 2, z: 0, r: 0 });
  const wood: Col3 = [0.30, 0.20, 0.11], darkWood: Col3 = [0.20, 0.13, 0.07];
  const furn = (x: number, z: number, w: number, h: number, d: number, col: Col3, r = 0) => { boxS(lit, x, 0, z, w, h, d, col, r); solids.push({ x, z, r: Math.max(w, d) * 0.42 }); };
  const principal: Record<string, { role: string; service: NpcDef["service"] }> = {
    tavern: { role: "innkeeper", service: "inn" }, shop: { role: "merchant", service: "shop" },
    guildf: { role: "guildmaster", service: "guildf" }, guildm: { role: "covenmaster", service: "guildm" },
    temple: { role: "priest", service: "temple" },
  };
  const p = principal[b.kind] || { role: "townsfolk", service: null };
  if (b.kind === "tavern") {
    furn(0, -3.4, 7.5, 1.05, 1.1, wood);
    for (const [tx, tz] of [[-5, 1.5], [4.6, 2.2], [-3.4, 4.0]] as Array<[number, number]>) {
      furn(tx, tz, 1.7, 0.12, 1.7, wood); prism(lit, tx, 0, tz, 0.09, 0.09, 0.78, 4, darkWood);
      octa(lit, tx + 0.4, 0.95, tz + 0.2, 0.09, 0.12, 0.09, [0.75, 0.72, 0.6]);
    }
    boxS(lit, -W / 2 + 1.2, 0, -2, 1.6, 1.7, 3.2, [0.36, 0.33, 0.31]);
    octa(lit, -W / 2 + 1.2, 1.1, -2, 0.4, 0.5, 0.4, [1.0, 0.45, 0.10]);
    npcs.push({ name: FIRST[Math.floor(rnd() * FIRST.length)] + " the Keeper", role: p.role, service: p.service, x: 0, z: -4.6, yaw: 0, robe: [0.45, 0.32, 0.16] });
    npcs.push({ name: FIRST[Math.floor(rnd() * FIRST.length)], role: "townsfolk", service: null, x: -5, z: 2.6, yaw: 2.4, robe: ROBES[Math.floor(rnd() * ROBES.length)] });
  } else if (b.kind === "shop") {
    furn(0, -3.2, 8, 1.0, 1.0, wood);
    for (let i = 0; i < 3; i++) furn(-W / 2 + 1.0, -3 + i * 3, 0.7, 2.2, 2.2, darkWood);
    for (let i = 0; i < 4; i++) octa(lit, -W / 2 + 1.0, 0.7 + (i % 2) * 0.8, -3.8 + Math.floor(i / 2) * 3 + (i % 2), 0.2, 0.2, 0.2, [0.55 + (i % 3) * 0.1, 0.4, 0.25]);
    furn(5.4, 1.8, 1.1, 0.8, 1.1, wood); furn(6.4, 0.6, 0.9, 0.6, 0.9, darkWood);
    npcs.push({ name: FIRST[Math.floor(rnd() * FIRST.length)] + " the Provisioner", role: p.role, service: p.service, x: 0, z: -4.4, yaw: 0, robe: [0.28, 0.40, 0.30] });
  } else if (b.kind === "guildf") {
    furn(0, -1.5, 6.5, 0.14, 1.6, wood); prism(lit, -1.4, 0, -1.5, 0.1, 0.1, 0.85, 4, darkWood); prism(lit, 1.4, 0, -1.5, 0.1, 0.1, 0.85, 4, darkWood);
    for (const bx of [-5.6, 5.6]) { prism(lit, bx, 0, -4.4, 0.5, 0.36, 0.8, 6, [0.25, 0.23, 0.22]); octa(lit, bx, 1.25, -4.4, 0.32, 0.42, 0.32, [1.0, 0.42, 0.08]); solids.push({ x: bx, z: -4.4, r: 0.6 }); }
    for (let i = 0; i < 3; i++) { const rx = -2 + i * 2; boxS(lit, rx, 1.1, -D / 2 + 0.5, 0.08, 1.7, 0.3, [0.55, 0.56, 0.6]); boxS(lit, rx, 2.0, -D / 2 + 0.5, 0.5, 0.08, 0.08, [0.3, 0.2, 0.11]); }
    npcs.push({ name: "Guildmaster " + FIRST[Math.floor(rnd() * FIRST.length)], role: p.role, service: p.service, x: 0, z: -3.6, yaw: 0, robe: [0.42, 0.16, 0.12] });
    npcs.push({ name: FIRST[Math.floor(rnd() * FIRST.length)], role: "townsfolk", service: null, x: 3.8, z: 1.4, yaw: -2.2, robe: ROBES[Math.floor(rnd() * ROBES.length)] });
  } else if (b.kind === "guildm") {
    furn(0, -3.4, 1.0, 1.15, 0.7, darkWood);
    octa(lit, 0, 2.2, -3.4, 0.42, 0.62, 0.42, [0.52, 0.36, 0.95]);
    prism(lit, 0, 0, -3.4, 0.08, 0.08, 1.5, 4, [0.2, 0.18, 0.24]);
    for (let i = 0; i < 3; i++) furn(-W / 2 + 1.0, -3 + i * 3.2, 0.7, 2.4, 2.4, darkWood);
    octa(lit, 5.8, 1.5, -4.2, 0.2, 0.3, 0.2, [0.52, 0.36, 0.95]);
    npcs.push({ name: "Covenmaster " + FIRST[Math.floor(rnd() * FIRST.length)], role: p.role, service: p.service, x: 0, z: -4.8, yaw: 0, robe: [0.26, 0.18, 0.44] });
    npcs.push({ name: FIRST[Math.floor(rnd() * FIRST.length)], role: "townsfolk", service: null, x: -4.6, z: 2.2, yaw: 1.1, robe: [0.22, 0.20, 0.34] });
  } else if (b.kind === "temple") {
    furn(0, -4.2, 3.2, 1.15, 1.0, [0.48, 0.45, 0.42]);
    for (const cx2 of [-1.2, 1.2]) { prism(lit, cx2, 1.15, -4.2, 0.035, 0.035, 0.4, 4, [0.9, 0.85, 0.7]); octa(lit, cx2, 1.75, -4.2, 0.07, 0.12, 0.07, [1.0, 0.78, 0.35]); }
    for (const pz of [0.6, 2.8]) for (const px of [-2.6, 2.6]) furn(px, pz, 3.4, 0.5, 0.5, wood);
    octa(lit, 0, 2.6, -4.2, 0.16, 0.24, 0.16, [1.0, 0.85, 0.45]);
    npcs.push({ name: "Listener " + FIRST[Math.floor(rnd() * FIRST.length)], role: p.role, service: p.service, x: 0, z: -3.0, yaw: 0, robe: [0.62, 0.58, 0.48] });
  }
  /* the perimeter is law: clamp the room with four fat invisible solids */
  solids.push({ x: 0, z: D / 2 + 1.2, r: 1.2 }, { x: -W / 2 - 1.2, z: 0, r: 1.2 }, { x: W / 2 + 1.2, z: 0, r: 1.2 }, { x: 0, z: -D / 2 - 1.2, r: 1.2 });
  return { lit: new Float32Array(lit), solids, npcs, name: b.name };
}
interface ChestDef { x: number; z: number; locked: boolean; quest: boolean; opened: boolean }
interface DungeonRun { lit: Float32Array; solids: Solid[]; foes: Array<{ kind: FoeKind; x: number; z: number }>; chests: ChestDef[]; startX: number; startZ: number }
function buildDungeon(def: DungeonDef, withQuestChest: boolean): DungeonRun {
  const rnd = mulberry32(SEED ^ def.seed);
  const lit: number[] = [], solids: Solid[] = [];
  const CELL = 9, GW = 11, GH = 11;
  const rooms = new Set<string>();
  const key = (cx: number, cz: number) => cx + "," + cz;
  let cx = 5, cz = 9;
  rooms.add(key(cx, cz));
  const startCx = cx, startCz = cz;
  let steps = 15 + Math.floor(rnd() * 5);
  while (steps-- > 0) {
    const dir = Math.floor(rnd() * 4);
    if (dir === 0) cx = Math.max(1, cx - 1); else if (dir === 1) cx = Math.min(GW - 2, cx + 1);
    else if (dir === 2) cz = Math.max(1, cz - 1); else cz = Math.min(GH - 2, cz + 1);
    rooms.add(key(cx, cz));
  }
  for (let i = 0; i < 4; i++) {
    const all = [...rooms];
    const [ax, az] = all[Math.floor(rnd() * all.length)].split(",").map(Number);
    rooms.add(key(clamp(ax + (rnd() < 0.5 ? 1 : -1), 1, GW - 2), az));
    rooms.add(key(ax, clamp(az + (rnd() < 0.5 ? 1 : -1), 1, GH - 2)));
  }
  const wallCol: Col3 = [0.315, 0.295, 0.285], floorCol: Col3 = [0.25, 0.23, 0.215];
  const world = (c: number) => (c - 5) * CELL;
  const roomList: Array<[number, number]> = [];
  for (const k of rooms) {
    const [rx, rz] = k.split(",").map(Number);
    roomList.push([rx, rz]);
    const x = world(rx), z = world(rz);
    boxS(lit, x, -0.25, z, CELL, 0.25, CELL, floorCol);
    boxS(lit, x, 4.0, z, CELL, 0.25, CELL, [0.13, 0.115, 0.105]);
    const edges: Array<[number, number, boolean]> = [
      [rx, rz - 1, false], [rx, rz + 1, false], [rx - 1, rz, true], [rx + 1, rz, true],
    ];
    edges.forEach(([nx, nz, vert], ei) => {
      const open = rooms.has(key(nx, nz));
      const ex = ei === 0 ? x : ei === 1 ? x : ei === 2 ? x - CELL / 2 : x + CELL / 2;
      const ez = ei === 0 ? z - CELL / 2 : ei === 1 ? z + CELL / 2 : z;
      if (!open) {
        if (vert) { boxS(lit, ex, 0, ez, 0.4, 4.0, CELL, wallCol); solids.push({ x: ex, z: ez - 2.6, r: 1.5 }, { x: ex, z: ez, r: 1.5 }, { x: ex, z: ez + 2.6, r: 1.5 }); }
        else { boxS(lit, ex, 0, ez, CELL, 4.0, 0.4, wallCol); solids.push({ x: ex - 2.6, z: ez, r: 1.5 }, { x: ex, z: ez, r: 1.5 }, { x: ex + 2.6, z: ez, r: 1.5 }); }
      } else {
        /* a doorway: two stubs and a lintel */
        if (vert) {
          boxS(lit, ex, 0, ez - 3.3, 0.4, 4.0, 2.4, wallCol); boxS(lit, ex, 0, ez + 3.3, 0.4, 4.0, 2.4, wallCol);
          boxS(lit, ex, 2.5, ez, 0.4, 1.5, 4.4, wallCol);
          solids.push({ x: ex, z: ez - 3.3, r: 1.3 }, { x: ex, z: ez + 3.3, r: 1.3 });
        } else {
          boxS(lit, ex - 3.3, 0, ez, 2.4, 4.0, 0.4, wallCol); boxS(lit, ex + 3.3, 0, ez, 2.4, 4.0, 0.4, wallCol);
          boxS(lit, ex, 2.5, ez, 4.4, 1.5, 0.4, wallCol);
          solids.push({ x: ex - 3.3, z: ez, r: 1.3 }, { x: ex + 3.3, z: ez, r: 1.3 });
        }
      }
    });
    if ((rx + rz) % 2 === 0) octa(lit, x + (rnd() - 0.5) * 4, 2.6, z + (rnd() - 0.5) * 4, 0.13, 0.2, 0.13, [1.0, 0.55, 0.16]);
  }
  /* chests in the far rooms, foes everywhere but home */
  const byDist = roomList.map(([rx, rz]) => ({ rx, rz, d: Math.abs(rx - startCx) + Math.abs(rz - startCz) })).sort((a, b) => b.d - a.d);
  const chests: ChestDef[] = [];
  byDist.slice(0, 3).forEach((r, i) => {
    const x = world(r.rx) + (rnd() - 0.5) * 4, z = world(r.rz) + (rnd() - 0.5) * 4;
    boxS(lit, x, 0, z, 1.15, 0.62, 0.7, [0.30, 0.20, 0.11], rnd() * 3);
    octa(lit, x, 0.72, z, 0.5, 0.16, 0.3, [0.22, 0.15, 0.08]);
    solids.push({ x, z, r: 0.8 });
    chests.push({ x, z, locked: rnd() < 0.5, quest: withQuestChest && i === 0, opened: false });
  });
  const foes: Array<{ kind: FoeKind; x: number; z: number }> = [];
  const kindPool: FoeKind[] = def.kind === "undead" ? ["skeleton", "skeleton", "rat"] : def.kind === "vermin" ? ["rat", "rat", "skeleton"] : ["cultist", "cultist", "skeleton"];
  for (const [rx, rz] of roomList) {
    if (rx === startCx && rz === startCz) continue;
    const n = 1 + (rnd() < 0.55 ? 1 : 0);
    for (let i = 0; i < n; i++) foes.push({ kind: kindPool[Math.floor(rnd() * kindPool.length)], x: world(rx) + (rnd() - 0.5) * 5, z: world(rz) + (rnd() - 0.5) * 5 });
  }
  const sx = world(startCx), sz = world(startCz);
  boxS(lit, sx, 0, sz + 3.2, 2.2, 3.2, 0.3, [0.08, 0.07, 0.09]);
  octa(lit, sx, 2.0, sz + 3.0, 0.3, 0.45, 0.3, [0.55, 0.85, 0.95]);
  solids.push({ x: sx - 2.2, z: sz + 3.2, r: 1.2 }, { x: sx + 2.2, z: sz + 3.2, r: 1.2 });
  return { lit: new Float32Array(lit), solids, foes, chests, startX: sx, startZ: sz };
}

/* ————————————————————————————————————————————————————————————————
   THE GAME
   ———————————————————————————————————————————————————————————————— */
const SAVE_KEY = "wyrdfall-save-v1";
interface DynFoe { kind: FoeKind; x: number; z: number; hp: number; maxHp: number; yaw: number; phase: number; atkCd: number; flash: number; dead: boolean; home: string }
interface Interact { x: number; z: number; label: string; run: () => void }
export function buildWyrdfall(body: HTMLElement) {
  const wrap = el("div", "os-wy-wrap");
  wrap.innerHTML = `
    <canvas class="os-wy-canvas"></canvas>
    <div class="os-wy-vig"></div>
    <div class="os-wy-hurt"></div>
    <div class="os-wy-fade"></div>
    <div class="os-sim-cross os-wy-cross"></div>
    <div class="os-wy-hud">
      <div class="os-wy-bars">
        <div class="os-wy-bar hp"><i></i></div>
        <div class="os-wy-bar mp"><i></i></div>
        <div class="os-wy-bar st"><i></i></div>
      </div>
      <div class="os-wy-compass"><span class="os-wy-comp-strip"></span></div>
      <div class="os-wy-clock"></div>
    </div>
    <div class="os-wy-place"></div>
    <div class="os-wy-prompt"></div>
    <div class="os-wy-banner"></div>
    <button class="os-sim-burger os-wy-burger" title="Menu (M)">&#8801;</button>
    <div class="os-wy-menu" hidden>
      <div class="os-sim-menu-title">WYRDFALL</div>
      <button data-m="sound">sound · on</button>
      <button data-m="iris">iris · auto</button>
      <button data-m="input">input · mouse</button>
      <button data-m="photo">photo · off</button>
      <button data-m="save">save the realm</button>
      <button data-m="sheet">character sheet</button>
      <button data-m="map">the province map</button>
      <button data-m="quit">leave the realm</button>
      <div class="os-wy-record"></div>
      <div class="os-sim-menu-keys">WASD walk &middot; mouse look &middot; click the world to take the mouse<br>
      left button / space strike &middot; right button or Q cast bolt &middot; R mend &middot; E speak &amp; use &middot; shift run<br>
      C sheet &middot; T rest &middot; M menu &amp; map &middot; the realm saves itself at every threshold</div>
    </div>
    <div class="os-wy-dialog" hidden>
      <div class="os-wy-dialog-name"></div>
      <div class="os-wy-dialog-line"></div>
      <div class="os-wy-dialog-topics"></div>
    </div>
    <div class="os-wy-shop" hidden>
      <div class="os-wy-shop-title"></div>
      <div class="os-wy-shop-list"></div>
      <button class="os-wy-shop-close">done trading</button>
    </div>
    <div class="os-wy-sheet" hidden>
      <div class="os-wy-sheet-body"></div>
      <button class="os-wy-sheet-close">close</button>
    </div>
    <div class="os-wy-map" hidden>
      <canvas class="os-wy-map-canvas" width="780" height="620"></canvas>
      <div class="os-wy-map-note">click a known place to travel the old roads — time passes, and the roads are not always kind</div>
      <button class="os-wy-map-close">close</button>
    </div>
    <div class="os-wy-title">
      <div class="os-wy-title-name">WYRDFALL</div>
      <div class="os-wy-title-sub">a province that does not scale to meet you</div>
      <div class="os-wy-create">
        <input class="os-wy-namein" type="text" maxlength="18" placeholder="your name, traveller" />
        <div class="os-wy-archs"></div>
        <div class="os-wy-title-btns">
          <button class="os-wy-begin">enter the province</button>
          <button class="os-wy-continue" hidden>continue the journey</button>
        </div>
        <div class="os-wy-title-note">a character is made once and kept on this machine; the realm remembers</div>
      </div>
    </div>
    <div class="os-wy-death" hidden>
      <div class="os-wy-death-line"></div>
      <button class="os-wy-rise">rise at the temple</button>
    </div>
    <div class="os-wy-touch" style="display:none">
      <div class="os-wy-stick"><div class="os-wy-stick-dot"></div></div>
      <div class="os-wy-tbtns">
        <button class="os-wy-tbtn big" data-t="use">use</button>
        <button class="os-wy-tbtn" data-t="atk">strike</button>
        <button class="os-wy-tbtn" data-t="cast">cast</button>
        <button class="os-wy-tbtn" data-t="jump">leap</button>
        <button class="os-wy-tbtn" data-t="mend">mend</button>
      </div>
    </div>`;
  body.appendChild(wrap);
  const Q = <T extends Element = HTMLElement>(s: string): T => wrap.querySelector(s) as T;
  const canvas = Q<HTMLCanvasElement>(".os-wy-canvas");
  const hudEl = Q(".os-wy-hud"), hpBar = Q<HTMLElement>(".os-wy-bar.hp i"), mpBar = Q<HTMLElement>(".os-wy-bar.mp i"), stBar = Q<HTMLElement>(".os-wy-bar.st i");
  const clockEl = Q(".os-wy-clock"), compStrip = Q(".os-wy-comp-strip"), placeEl = Q(".os-wy-place"), promptEl = Q(".os-wy-prompt");
  const bannerEl = Q(".os-wy-banner"), crossEl = Q(".os-wy-cross"), hurtEl = Q(".os-wy-hurt"), fadeEl = Q(".os-wy-fade");
  const menuEl = Q(".os-wy-menu"), dialogEl = Q(".os-wy-dialog"), shopEl = Q(".os-wy-shop"), sheetEl = Q(".os-wy-sheet"), mapEl = Q(".os-wy-map");
  const titleEl = Q(".os-wy-title"), deathEl = Q(".os-wy-death");
  compStrip.textContent = "· N ····· NE ····· E ····· SE ····· S ····· SW ····· W ····· NW · N ····· NE ····· E ····· SE ····· S ····· SW ····· W ····· NW ";

  /* ——— sound: a small kit, struck iron and gut string ——— */
  let sndOn = true;
  try { sndOn = localStorage.getItem("wyrdfall-sound") !== "off"; } catch { /* keep */ }
  const audio = {
    ctx: null as AudioContext | null,
    ac(): AudioContext | null {
      if (!sndOn) return null;
      try {
        if (!this.ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
        if (this.ctx.state === "suspended") void this.ctx.resume();
        return this.ctx;
      } catch { return null; }
    },
    tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
      const ctx = this.ac(); if (!ctx) return;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(24, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    swing() { this.tone(900, 220, 0.11, "sawtooth", 0.03); },
    hit() { this.tone(210, 80, 0.09, "square", 0.09); this.tone(1400, 900, 0.04, "triangle", 0.05); },
    kill() { this.tone(160, 40, 0.28, "sawtooth", 0.10); this.tone(90, 30, 0.34, "triangle", 0.12, 0.03); },
    hurt() { this.tone(130, 70, 0.16, "sawtooth", 0.10); },
    bolt() { this.tone(1250, 300, 0.16, "sawtooth", 0.06); this.tone(2400, 800, 0.10, "triangle", 0.04); },
    mend() { this.tone(520, 880, 0.3, "sine", 0.06); this.tone(660, 990, 0.3, "sine", 0.04, 0.07); },
    coin() { this.tone(1560, 1560, 0.07, "square", 0.05); this.tone(2090, 2090, 0.14, "square", 0.05, 0.06); },
    door() { this.tone(90, 55, 0.22, "triangle", 0.10); this.tone(300, 180, 0.08, "square", 0.03, 0.02); },
    lock() { this.tone(700, 500, 0.05, "square", 0.07); this.tone(950, 700, 0.06, "square", 0.07, 0.09); },
    quest() { this.tone(392, 392, 0.14, "triangle", 0.07); this.tone(523, 523, 0.14, "triangle", 0.07, 0.12); this.tone(659, 659, 0.24, "triangle", 0.07, 0.24); },
    level() { this.tone(330, 330, 0.16, "triangle", 0.08); this.tone(415, 415, 0.16, "triangle", 0.08, 0.14); this.tone(494, 494, 0.16, "triangle", 0.08, 0.28); this.tone(659, 659, 0.4, "triangle", 0.09, 0.42); },
    step(soft: boolean) { this.tone(soft ? 120 : 95, 60, 0.05, "triangle", soft ? 0.016 : 0.026); },
  };

  /* ——— GL ——— */
  const gl = (canvas.getContext("webgl2", { antialias: false, alpha: false }) || canvas.getContext("webgl", { antialias: false, alpha: false })) as WebGLRenderingContext;
  const XR = (gl.getExtension("OES_standard_derivatives") as { enable?: () => void } | null);
  if (XR && XR.enable) XR.enable.call(gl);
  const mkProg = (vsSrc: string, fsSrc: string) => {
    const sh = (t: number, s: string) => { const h = gl.createShader(t)!; gl.shaderSource(h, s); gl.compileShader(h); return h; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    return p;
  };
  const mkBuf = (floats: number) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    return b;
  };
  const litP = mkProg(LIT_VS, LIT_FS), skyP = mkProg(SKY_VS, SKY_FS), watP = mkProg(WATER_VS, WATER_FS);
  const litU = { mvp: gl.getUniformLocation(litP, "uMVP"), model: gl.getUniformLocation(litP, "uModel"), cam: gl.getUniformLocation(litP, "uCam"), sun: gl.getUniformLocation(litP, "uSun"), fog: gl.getUniformLocation(litP, "uFog"), fogNear: gl.getUniformLocation(litP, "uFogNear"), fogFar: gl.getUniformLocation(litP, "uFogFar"), tint: gl.getUniformLocation(litP, "uTint"), camPos: gl.getUniformLocation(litP, "uCamPos"), rim: gl.getUniformLocation(litP, "uRim"), time: gl.getUniformLocation(litP, "uTime"), season: gl.getUniformLocation(litP, "uSeason"), shadowAmt: gl.getUniformLocation(litP, "uShadowAmt"), shadowMap: gl.getUniformLocation(litP, "uShadowMap") };
  const skyU = { vp: gl.getUniformLocation(skyP, "uVP"), zen: gl.getUniformLocation(skyP, "uZen"), hor: gl.getUniformLocation(skyP, "uHor"), sunDir: gl.getUniformLocation(skyP, "uSunDir"), sunCol: gl.getUniformLocation(skyP, "uSunCol"), night: gl.getUniformLocation(skyP, "uNight"), time: gl.getUniformLocation(skyP, "uTime"), cover: gl.getUniformLocation(skyP, "uCover"), gloom: gl.getUniformLocation(skyP, "uGloom"), flash: gl.getUniformLocation(skyP, "uFlash"), moonDir: gl.getUniformLocation(skyP, "uMoonDir"), aurora: gl.getUniformLocation(skyP, "uAurora"), second: gl.getUniformLocation(skyP, "uSecond") };
  const watU = { mvp: gl.getUniformLocation(watP, "uMVP"), cam: gl.getUniformLocation(watP, "uCam"), camPos: gl.getUniformLocation(watP, "uCamPos"), sun: gl.getUniformLocation(watP, "uSun"), sunCol: gl.getUniformLocation(watP, "uSunCol"), hor: gl.getUniformLocation(watP, "uHor"), fog: gl.getUniformLocation(watP, "uFog"), fogNear: gl.getUniformLocation(watP, "uFogNear"), fogFar: gl.getUniformLocation(watP, "uFogFar"), time: gl.getUniformLocation(watP, "uTime"), cold: gl.getUniformLocation(watP, "uCold"), day: gl.getUniformLocation(watP, "uDay") };
  const aPos = gl.getAttribLocation(litP, "aPos"), aCol = gl.getAttribLocation(litP, "aCol"), aNor = gl.getAttribLocation(litP, "aNor");
  const aPosS = gl.getAttribLocation(skyP, "aPos");
  const aPosW = gl.getAttribLocation(watP, "aPos"), aColW = gl.getAttribLocation(watP, "aCol"), aAuxW = gl.getAttribLocation(watP, "aAux");
  const dummyTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dummyTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  function setLit(vpArr: Float32Array, eye: [number, number, number], sun: Col3, fog: Col3, near: number, far: number, tint: Col3, rim: Col3, now: number) {
    gl.useProgram(litP);
    gl.uniformMatrix4fv(litU.mvp, false, vpArr);
    gl.uniformMatrix4fv(litU.model, false, m4.ident());
    gl.uniform2f(litU.cam, eye[0], eye[2]);
    gl.uniform3fv(litU.sun, sun);
    gl.uniform3fv(litU.fog, fog);
    gl.uniform1f(litU.fogNear, near);
    gl.uniform1f(litU.fogFar, far);
    gl.uniform3fv(litU.tint, tint);
    gl.uniform3fv(litU.camPos, eye);
    gl.uniform3fv(litU.rim, rim);
    gl.uniform1f(litU.time, now);
    gl.uniform3fv(litU.season, [0, 0, 0]);
    gl.uniform1f(litU.shadowAmt, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dummyTex);
    gl.uniform1i(litU.shadowMap, 0);
  }
  const dynBuf = mkBuf(400000), staBuf = gl.createBuffer(), terrBuf = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.02, 0.02, 0.03, 1);

  /* ——— state ——— */
  let irisOn = true, photoOn = false, laptop = false, dprCap = 1.5, frameMs = 16, quality = 0;
  try {
    irisOn = localStorage.getItem("wyrdfall-iris") !== "off";
    photoOn = localStorage.getItem("wyrdfall-photo") === "on";
    laptop = localStorage.getItem("wyrdfall-input") === "laptop";
  } catch { /* keep */ }
  const world = buildOverworld();
  const scene = { kind: "title" as "title" | "overworld" | "interior" | "dungeon", building: null as Building | null, interior: null as Interior | null, dungeon: null as DungeonRun | null, dungeonDef: null as DungeonDef | null };
  let sheet: Sheet | null = null;
  let timeMin = 8 * 60;                       // day one, eight in the morning
  let px = 0, pz = -60, pyaw = 0, ppitch = 0, vy = 0, groundY = wyHeight(0, -60), grounded = true;
  let stamina = 100, swingT = 0, swingHitDone = true, hurtT = 0, stepAcc = 0, placeName = "", placeT = 0;
  let foes: DynFoe[] = [], remains: Array<{ x: number; z: number; y: number; col: Col3; ttl: number }> = [];
  let tracers: Array<{ x: number; y: number; z: number; dx: number; dy: number; dz: number; len: number; col: Col3; ttl: number }> = [];
  let wanderers: Array<{ npc: NpcDef; x: number; z: number; tx: number; tz: number; yaw: number; phase: number; wait: number }> = [];
  let discovered = new Set<string>();
  let spawnT = 4, saveT = 30, ambushWarned = false;
  const interiorCache = new Map<string, Interior>();
  const getInterior = (b: Building): Interior => {
    const k = b.town + ":" + b.kind + ":" + Math.round(b.x) + ":" + Math.round(b.z);
    let i = interiorCache.get(k);
    if (!i) { i = buildInterior(b); interiorCache.set(k, i); }
    return i;
  };
  const keys: Record<string, boolean> = {};
  let locked = false, started = false;
  const proj = new Array(16).fill(0), view = new Array(16).fill(0), vp = new Array(16).fill(0);
  const isNight = () => { const h = (timeMin % 1440) / 60; return h < 5.2 || h > 20.6; };
  const hourNow = () => (timeMin % 1440) / 60;
  const dayNow = () => Math.floor(timeMin / 1440) + 1;

  /* ——— the realm's small magics: word, memory, thresholds ——— */
  const FACTION_OF: Record<string, string> = { guildf: "the Hearthguard", guildm: "the Umbral Covenant", temple: "the Listening God" };
  const SKILL_OF: Record<string, SkillId> = { guildf: "blade", guildm: "destruction", temple: "restoration" };
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let levelReady = false, pendingHit = -1, athAcc = 0, curInteract: Interact | null = null;
  let returnX = 0, returnZ = -40, dlgNpc: NpcDef | null = null, pendingOffer: Quest | null = null;
  const banner = (text: string, ms = 3400) => {
    bannerEl.textContent = text;
    bannerEl.classList.add("show");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.remove("show"), ms);
  };
  const setPlace = (name: string) => {
    if (name === placeName) return;
    placeName = name; placeT = 5;
    placeEl.textContent = name;
    placeEl.classList.add("show");
  };
  const townName = (id: string): string => TOWNS.find((t) => t.id === id)?.name || "the wilds";
  function skillUse(id: SkillId, n = 1) {
    if (!sheet) return;
    sheet.uses[id] += n;
    const need = 8 + sheet.skills[id] * 0.35;
    if (sheet.uses[id] >= need && sheet.skills[id] < 100) {
      sheet.uses[id] = 0;
      sheet.skills[id]++;
      sheet.gains++;
      banner(`${SKILL_NAME[id]} rises to ${sheet.skills[id]}.`);
      audio.quest();
      if (sheet.gains >= 5 && !levelReady) {
        levelReady = true;
        banner("You have grown in the doing. Rest — an inn bed, or T under the sky — and meditate on it.", 5200);
      }
    }
  }
  function saveGame() {
    if (!sheet || !started) return;
    try {
      const inWorld = scene.kind === "overworld";
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        sheet, timeMin, discovered: [...discovered],
        px: inWorld ? px : returnX, pz: inWorld ? pz : returnZ, pyaw,
      }));
    } catch { /* the realm forgets, this once */ }
  }
  function fadeThrough(fn: () => void) {
    fadeEl.style.opacity = "1";
    window.setTimeout(() => { fn(); fadeEl.style.opacity = "0"; }, 270);
  }
  /* ——— thresholds ——— */
  function enterBuilding(b: Building) {
    audio.door();
    fadeThrough(() => {
      returnX = px; returnZ = pz;
      scene.kind = "interior"; scene.building = b; scene.interior = getInterior(b);
      px = 0; pz = 3.2; pyaw = 0; vy = 0; groundY = 0; foes = [];
      uploadStatic(scene.interior.lit);
      setPlace(`${b.name} — ${townName(b.town)}`);
      saveGame();
    });
  }
  function leaveBuilding() {
    const b = scene.building; if (!b) return;
    audio.door();
    fadeThrough(() => {
      scene.kind = "overworld"; scene.building = null; scene.interior = null;
      px = b.doorX; pz = b.doorZ; pyaw = Math.atan2(-(b.doorX - b.x), -(b.doorZ - b.z));
      groundY = wyHeight(px, pz);
      setPlace(townName(b.town));
      saveGame();
    });
  }
  function enterDungeon(def: DungeonDef) {
    audio.door();
    fadeThrough(() => {
      returnX = px; returnZ = pz;
      const fetchHere = sheet?.quests.some((q) => q.kind === "fetch" && q.dungeon === def.id && q.have < q.need);
      scene.kind = "dungeon"; scene.dungeonDef = def;
      scene.dungeon = buildDungeon(def, !!fetchHere);
      px = scene.dungeon.startX; pz = scene.dungeon.startZ; pyaw = 0; vy = 0; groundY = 0;
      foes = scene.dungeon.foes.map((f) => ({ kind: f.kind, x: f.x, z: f.z, hp: FOES[f.kind].hp, maxHp: FOES[f.kind].hp, yaw: Math.random() * 6.3, phase: Math.random() * 6, atkCd: 0, flash: 0, dead: false, home: def.id }));
      uploadStatic(scene.dungeon.lit);
      discovered.add(def.id);
      setPlace(def.name);
      banner("The dark below keeps its own hours.");
      saveGame();
    });
  }
  function exitDungeon() {
    const def = scene.dungeonDef; if (!def) return;
    audio.door();
    fadeThrough(() => {
      scene.kind = "overworld"; scene.dungeon = null; scene.dungeonDef = null;
      px = def.x; pz = def.z + 9.5; pyaw = 0; foes = [];
      groundY = wyHeight(px, pz);
      setPlace("the wilds");
      saveGame();
    });
  }
  /* ——— rest, and what rest makes of you ——— */
  function doRest(hours: number, safe: boolean) {
    if (!sheet) return;
    if (foes.some((f) => !f.dead && Math.hypot(f.x - px, f.z - pz) < 20)) { banner("You cannot rest with enemies near."); return; }
    fadeThrough(() => {
      timeMin += hours * 60;
      sheet!.hp = maxHp(sheet!); sheet!.mp = maxMp(sheet!); stamina = 100;
      if (levelReady) {
        levelReady = false;
        sheet!.level++; sheet!.gains = 0;
        sheet!.hp = maxHp(sheet!); sheet!.mp = maxMp(sheet!);
        audio.level();
        banner(`You wake stronger than you lay down. Level ${sheet!.level}.`, 4600);
      } else banner("You rest. The world goes on without asking.");
      if (!safe && Math.random() < 0.25) {
        for (let i = 0; i < 2; i++) spawnFoe(isNight() ? "skeleton" : "wolf", px + 13 + Math.random() * 4, pz + (Math.random() - 0.5) * 10);
        banner("Something found you in the dark.", 4200);
      }
      saveGame();
    });
  }
  /* ——— foes ——— */
  function spawnFoe(kind: FoeKind, x: number, z: number) {
    foes.push({ kind, x, z, hp: FOES[kind].hp, maxHp: FOES[kind].hp, yaw: Math.random() * 6.3, phase: Math.random() * 6, atkCd: 0, flash: 0, dead: false, home: "" });
  }
  function damageFoe(f: DynFoe, dmg: number, skill: SkillId) {
    f.hp -= dmg; f.flash = 0.18;
    audio.hit();
    if (f.hp <= 0 && !f.dead) {
      f.dead = true;
      audio.kill();
      const st = FOES[f.kind];
      const gold = st.gold[0] + Math.floor(Math.random() * (st.gold[1] - st.gold[0] + 1));
      let msg = `The ${FOE_NAME[f.kind]} falls.`;
      if (sheet) {
        if (gold > 0) { sheet.gold += gold; msg += ` ${gold} gold.`; }
        if (st.loot && Math.random() < 0.45) { sheet.inv.push({ name: st.loot, val: 4 + Math.floor(Math.random() * 10), kind: "junk" }); msg += ` You take a ${st.loot}.`; }
        for (const q of sheet.quests) {
          if (q.kind === "cull" && !q.done && q.dungeon === (scene.dungeonDef?.id || "") && q.foe === f.kind && q.have < q.need) {
            q.have++;
            if (q.have >= q.need) { q.done = true; audio.quest(); banner("The work is done. Return, and be paid."); }
          }
        }
      }
      remains.push({ x: f.x, z: f.z, y: scene.kind === "overworld" ? wyHeight(f.x, f.z) : 0, col: f.kind === "skeleton" ? [0.62, 0.60, 0.54] : [0.30, 0.16, 0.12], ttl: 26 });
      banner(msg);
      skillUse(skill, 2);
    }
  }
  function hurtPlayer(dmg: number) {
    if (!sheet || hurtT > 0.25) return;
    sheet.hp -= dmg;
    hurtT = 0.55;
    audio.hurt();
    if (sheet.hp <= 0) {
      sheet.hp = 0;
      document.exitPointerLock?.();
      Q(".os-wy-death-line").textContent = `You fall — ${placeName || "in the wilds"}. The province keeps what it kills, but the Temple keeps you.`;
      deathEl.hidden = false;
    }
  }
  function swingStart() {
    if (!sheet || swingT > 0 || stamina < 4) return;
    swingT = 0.40; swingHitDone = false; pendingHit = 0.11; stamina = Math.max(0, stamina - 5);
    audio.swing();
  }
  function swingResolve() {
    const fx = -Math.sin(pyaw), fz = -Math.cos(pyaw);
    for (const f of foes) {
      if (f.dead) continue;
      const dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
      if (d > 2.5) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.42) continue;
      damageFoe(f, WEAPONS[sheet!.weapon].dmg + sheet!.skills.blade * 0.22 + Math.random() * 4, "blade");
    }
  }
  function castBolt() {
    if (!sheet) return;
    if (sheet.mp < 12) { banner("The fire will not come. No magicka."); return; }
    sheet.mp -= 12;
    audio.bolt();
    const cp = Math.cos(ppitch), dir: [number, number, number] = [-Math.sin(pyaw) * cp, Math.sin(ppitch), -Math.cos(pyaw) * cp];
    const eye: [number, number, number] = [px, groundY + 1.58, pz];
    let best: DynFoe | null = null, bestT = 64;
    for (const f of foes) {
      if (f.dead) continue;
      const rx = f.x - eye[0], ry = (scene.kind === "overworld" ? wyHeight(f.x, f.z) : 0) + 1.0 - eye[1], rz = f.z - eye[2];
      const t = rx * dir[0] + ry * dir[1] + rz * dir[2];
      if (t < 0 || t > bestT) continue;
      const qx = rx - dir[0] * t, qy = ry - dir[1] * t, qz = rz - dir[2] * t;
      if (qx * qx + qy * qy + qz * qz < 1.25) { best = f; bestT = t; }
    }
    tracers.push({ x: eye[0], y: eye[1], z: eye[2], dx: dir[0], dy: dir[1], dz: dir[2], len: best ? bestT : 46, col: [0.72, 0.52, 1.0], ttl: 0.07 });
    if (best) damageFoe(best, 9 + sheet.skills.destruction * 0.34 + Math.random() * 5, "destruction");
  }
  function castHeal() {
    if (!sheet) return;
    if (sheet.mp < 15) { banner("The mending will not come. No magicka."); return; }
    if (sheet.hp >= maxHp(sheet)) { banner("You are whole already."); return; }
    sheet.mp -= 15;
    sheet.hp = Math.min(maxHp(sheet), sheet.hp + 20 + sheet.skills.restoration * 0.35);
    audio.mend();
    skillUse("restoration");
  }
  /* ——— chests ——— */
  function openChest(c: ChestDef) {
    if (!sheet || !scene.dungeon) return;
    if (c.locked) {
      const roll = Math.random() * 100;
      if (roll < 22 + sheet.skills.lockpick * 0.55) {
        c.locked = false;
        audio.lock();
        banner("The lock gives, sweet as a confession.");
        skillUse("lockpick", 2);
      } else {
        audio.lock();
        banner(`The lock holds. (Lockpicking ${sheet.skills.lockpick})`);
        return;
      }
    }
    c.opened = true;
    if (c.quest) {
      const q = sheet.quests.find((q2) => q2.kind === "fetch" && q2.dungeon === scene.dungeonDef?.id && !q2.done);
      if (q) {
        q.have = q.need; q.done = true;
        sheet.inv.push({ name: q.itemName || "the thing sought", val: 0, kind: "relic" });
        audio.quest();
        banner(`You found ${q.itemName}. Carry it back.`, 4200);
        return;
      }
    }
    const gold = 14 + Math.floor(Math.random() * 48);
    sheet.gold += gold;
    audio.coin();
    let msg = `The chest yields ${gold} gold.`;
    if (Math.random() < 0.5) { sheet.inv.push({ name: "draught of mending", val: 25, kind: "potion-h" }); msg += " And a draught of mending."; }
    banner(msg);
  }

  /* ——— work, and the working of it ——— */
  let questSeq = 1;
  const FETCH_ITEMS: Record<string, string> = { barrow: "the First King's signet ring", vault: "the vault-keeper's ledger", hollow: "the hollow bell", deep: "a saint's fingerbone" };
  const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
  function genQuest(factionKey: string, giverName: string): Quest {
    const rnd = mulberry32((Date.now() & 0xfffff) ^ (questSeq * 7919) ^ 0x9e37);
    questSeq++;
    const reward = 50 + Math.floor(rnd() * 70) + (sheet?.level || 1) * 12;
    if (factionKey === "inn") {
      const others = TOWNS.filter((t) => t.id !== scene.building?.town);
      const dest = others[Math.floor(rnd() * others.length)];
      const tb = world.buildings.find((b) => b.town === dest.id && b.kind === "tavern")!;
      const keeper = getInterior(tb).npcs[0];
      return { id: questSeq, kind: "deliver", giver: giverName, text: `A sealed letter for ${keeper.name}, keeper of the tavern at ${dest.name}. Roads are roads — carry it there yourself. ${reward} gold when it is in their hands.`, toTown: dest.id, toNpc: keeper.name, need: 1, have: 0, reward, faction: "the road", done: false };
    }
    const dg = DUNGEONS[Math.floor(rnd() * DUNGEONS.length)];
    const faction = FACTION_OF[factionKey];
    if (rnd() < 0.5) {
      const foe: FoeKind = dg.kind === "undead" ? "skeleton" : dg.kind === "vermin" ? "rat" : "cultist";
      const need = 3 + Math.floor(rnd() * 3);
      return { id: questSeq, kind: "cull", giver: giverName, text: `${dg.name} stirs again. Go down and lay ${need} ${FOE_NAME[foe]}s back to rest. ${reward} gold, and ${faction} will know your name.`, dungeon: dg.id, foe, need, have: 0, reward, faction, done: false };
    }
    return { id: questSeq, kind: "fetch", giver: giverName, text: `Something was left in ${dg.name} that should not stay there: ${FETCH_ITEMS[dg.id]}. It will lie in a chest, in the deep rooms. Bring it back to ${faction}. ${reward} gold.`, dungeon: dg.id, itemName: FETCH_ITEMS[dg.id], need: 1, have: 0, reward, faction, done: false };
  }
  /* ——— conversation ——— */
  const dlgName = Q(".os-wy-dialog-name"), dlgLine = Q(".os-wy-dialog-line"), dlgTopics = Q(".os-wy-dialog-topics");
  function setTopics(list: Array<[string, () => void]>) {
    dlgTopics.replaceChildren();
    for (const [label, fn] of list) {
      const b = el("button", "os-wy-topic", label);
      b.addEventListener("click", fn);
      dlgTopics.appendChild(b);
    }
  }
  function openDialogue(npc: NpcDef) {
    dlgNpc = npc; pendingOffer = null;
    document.exitPointerLock?.();
    dialogEl.hidden = false;
    dlgName.textContent = `${npc.name} — ${npc.role}`;
    const g = GREET[npc.role] || GREET.townsfolk;
    dlgLine.textContent = g[Math.floor(Math.random() * g.length)];
    baseTopics();
  }
  function closeDialogue() { dialogEl.hidden = true; dlgNpc = null; pendingOffer = null; }
  function baseTopics() {
    const npc = dlgNpc; if (!npc || !sheet) return;
    const list: Array<[string, () => void]> = [];
    const dq = sheet.quests.find((q) => q.kind === "deliver" && q.toNpc === npc.name && scene.building?.town === q.toTown);
    if (dq) list.push(["Deliver the sealed letter", () => {
      sheet!.gold += dq.reward;
      sheet!.inv = sheet!.inv.filter((i) => i.kind !== "letter");
      sheet!.quests = sheet!.quests.filter((q) => q !== dq);
      audio.quest(); audio.coin();
      dlgLine.textContent = `"For me? ... Well. The road provides, and so do you. ${dq.reward} gold, as agreed with the sender."`;
      banner(`Delivered. ${dq.reward} gold.`);
      baseTopics();
    }]);
    if (npc.service && FACTION_OF[npc.service]) {
      const faction = FACTION_OF[npc.service];
      for (const q of sheet.quests.filter((q2) => q2.done && q2.faction === faction)) {
        list.push(["Turn in — the work is done", () => {
          sheet!.gold += q.reward;
          sheet!.rep[faction] = (sheet!.rep[faction] || 0) + 1;
          if (q.kind === "fetch") sheet!.inv = sheet!.inv.filter((i) => !(i.kind === "relic" && i.name === q.itemName));
          sheet!.quests = sheet!.quests.filter((q2) => q2 !== q);
          audio.quest(); audio.coin();
          dlgLine.textContent = `"It is done, then. ${faction} pays its debts — ${q.reward} gold, and your name is spoken warmer here now."`;
          baseTopics();
        }]);
      }
    }
    list.push(["Rumour", () => {
      dlgLine.textContent = RUMORS[Math.floor(Math.random() * RUMORS.length)];
      if (Math.random() < 0.4) {
        const un = DUNGEONS.filter((d) => !discovered.has(d.id));
        if (un.length) { const d = un[Math.floor(Math.random() * un.length)]; discovered.add(d.id); banner(`Marked on your map: ${d.name}.`); }
      }
    }]);
    if (npc.service === "inn") {
      list.push(["A bed for the night — 10 gold", () => {
        if (sheet!.gold < 10) { dlgLine.textContent = `"No coin, no mattress, friend. The floor of the province is free."`; return; }
        sheet!.gold -= 10; closeDialogue(); doRest(8, true);
      }]);
      list.push(["A hot meal — 4 gold", () => {
        if (sheet!.gold < 4) { dlgLine.textContent = `"Come back with coin."`; return; }
        sheet!.gold -= 4; sheet!.hp = Math.min(maxHp(sheet!), sheet!.hp + Math.ceil(maxHp(sheet!) * 0.35)); audio.coin();
        dlgLine.textContent = `"Eat. You look like the road has been chewing on you."`;
      }]);
      list.push(["Ask for work", () => offerWork("inn")]);
    }
    if (npc.service && FACTION_OF[npc.service]) {
      const sk = SKILL_OF[npc.service];
      list.push(["Ask for work", () => offerWork(npc.service!)]);
      list.push([`Train ${SKILL_NAME[sk]} — 35 gold`, () => {
        if (!sheet || sheet.gold < 35) { dlgLine.textContent = `"Training is cheaper than dying, but it is not free."`; return; }
        if (sheet.skills[sk] >= 100) { dlgLine.textContent = `"There is nothing left here to teach you."`; return; }
        sheet.gold -= 35; sheet.skills[sk]++; sheet.gains++; audio.coin();
        if (sheet.gains >= 5 && !levelReady) { levelReady = true; banner("You have grown in the doing. Rest and meditate on it.", 4600); }
        dlgLine.textContent = `"Again. And again. That is the whole of the teaching." (${SKILL_NAME[sk]} is now ${sheet.skills[sk]}.)`;
        baseTopics();
      }]);
      if (npc.service === "temple") list.push(["A blessing", () => { sheet!.hp = maxHp(sheet!); audio.mend(); dlgLine.textContent = `"The God heard that. Go on, then — louder this time." (Fully mended.)`; }]);
    }
    if (npc.service === "shop") list.push(["Trade", () => { closeDialogue(); openShop(); }]);
    list.push(["Farewell", () => closeDialogue()]);
    setTopics(list);
  }
  function offerWork(factionKey: string) {
    const npc = dlgNpc; if (!npc || !sheet) return;
    if (sheet.quests.length >= 3) { dlgLine.textContent = `"Your hands are full — three works at once is a feast already. Finish something."`; return; }
    pendingOffer = genQuest(factionKey, npc.name);
    dlgLine.textContent = pendingOffer.text;
    setTopics([
      ["Take the work", () => {
        const q = pendingOffer!; pendingOffer = null;
        sheet!.quests.push(q);
        if (q.kind === "deliver") sheet!.inv.push({ name: "a sealed letter", val: 0, kind: "letter" });
        if (q.dungeon) discovered.add(q.dungeon);
        audio.quest();
        banner("Work taken. It is written on your sheet — C.");
        dlgLine.textContent = `"Then it is yours. Do not make a liar of me."`;
        baseTopics();
      }],
      ["Not for me", () => { pendingOffer = null; dlgLine.textContent = `"As you like. The work will keep — it always does."`; baseTopics(); }],
    ]);
  }
  /* ——— trade ——— */
  const shopTitle = Q(".os-wy-shop-title"), shopList = Q(".os-wy-shop-list");
  function openShop() { document.exitPointerLock?.(); shopEl.hidden = false; renderShop(); }
  function renderShop() {
    if (!sheet) return;
    const merc = sheet.skills.mercantile;
    const buyMul = 1 - merc * 0.003, sellMul = 0.55 + merc * 0.004;
    shopTitle.textContent = `Provisions & Sundries — your gold: ${sheet.gold}`;
    shopList.replaceChildren();
    const row = (label: string, price: string, btnLabel: string, fn: (() => void) | null) => {
      const r = el("div", "os-wy-shop-row");
      r.append(el("span", "os-wy-shop-item", label), el("span", "os-wy-shop-price", price));
      const b = el("button", "os-wy-shop-btn", btnLabel) as HTMLButtonElement;
      if (!fn) b.disabled = true; else b.addEventListener("click", fn);
      r.appendChild(b); shopList.appendChild(r);
    };
    for (let i = 1; i < WEAPONS.length; i++) {
      const w = WEAPONS[i], price = Math.round(w.price * buyMul), owned = sheet.weapon >= i;
      row(`${w.name} — ${w.dmg} bite`, owned ? "carried" : `${price} gold`, owned ? "—" : "buy", owned ? null : () => {
        if (sheet!.gold < price) { banner("Not enough gold."); return; }
        sheet!.gold -= price; sheet!.weapon = i; audio.coin(); skillUse("mercantile", 0.6); banner(`${w.name} is yours.`); renderShop();
      });
    }
    const ph = Math.round(25 * buyMul), pm = Math.round(22 * buyMul);
    row("Draught of mending — restores health", `${ph} gold`, "buy", () => { if (sheet!.gold < ph) { banner("Not enough gold."); return; } sheet!.gold -= ph; sheet!.inv.push({ name: "draught of mending", val: 25, kind: "potion-h" }); audio.coin(); skillUse("mercantile", 0.4); renderShop(); });
    row("Draught of starwater — restores magicka", `${pm} gold`, "buy", () => { if (sheet!.gold < pm) { banner("Not enough gold."); return; } sheet!.gold -= pm; sheet!.inv.push({ name: "draught of starwater", val: 22, kind: "potion-m" }); audio.coin(); skillUse("mercantile", 0.4); renderShop(); });
    for (const it of [...sheet.inv]) {
      if (it.kind === "letter" || it.kind === "relic") continue;
      const price = Math.max(1, Math.round(it.val * sellMul));
      row(it.name, `${price} gold`, "sell", () => { sheet!.gold += price; sheet!.inv.splice(sheet!.inv.indexOf(it), 1); audio.coin(); skillUse("mercantile", 0.6); renderShop(); });
    }
  }
  Q(".os-wy-shop-close").addEventListener("click", () => { shopEl.hidden = true; });
  /* ——— the sheet ——— */
  const sheetBody = Q(".os-wy-sheet-body");
  function openSheet() {
    if (!sheet) return;
    document.exitPointerLock?.();
    sheetEl.hidden = false;
    const h = Math.floor(hourNow()), m = Math.floor((hourNow() % 1) * 60);
    const when = `Day ${dayNow()} — ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const skills = (Object.keys(SKILL_NAME) as SkillId[]).map((k) => `<div class="os-wy-sk"><span>${SKILL_NAME[k]}</span><b>${sheet!.skills[k]}</b></div>`).join("");
    const reps = Object.entries(sheet.rep).filter(([, v]) => v !== 0).map(([k, v]) => `<div class="os-wy-sk"><span>${k}</span><b>${v > 0 ? "+" : ""}${v}</b></div>`).join("") || `<div class="os-wy-dim">no faction knows your name yet</div>`;
    const quests = sheet.quests.length ? sheet.quests.map((q) => `<div class="os-wy-q">${q.text}<span>${q.kind === "cull" ? ` — ${q.have}/${q.need} laid to rest${q.done ? "; return for your reward" : ""}` : q.kind === "fetch" ? (q.done ? " — carried; return it" : " — not yet found") : " — undelivered"}</span></div>`).join("") : `<div class="os-wy-dim">no work taken — the guild halls and the inn keep the province's errands</div>`;
    const inv = sheet.inv.length ? sheet.inv.map((it, i) => `<div class="os-wy-sk"><span>${it.name}</span>${it.kind === "potion-h" || it.kind === "potion-m" ? `<button class="os-wy-use" data-i="${i}">drink</button>` : ""}</div>`).join("") : `<div class="os-wy-dim">your pack is empty but for road-dust</div>`;
    sheetBody.innerHTML = `
      <div class="os-wy-sheet-name">${esc(sheet.name)} — ${ARCHS.find((a) => a.id === sheet!.arch)?.name} · level ${sheet.level}</div>
      <div class="os-wy-dim">${when} · ${sheet.gold} gold · ${WEAPONS[sheet.weapon].name} in hand${levelReady ? " · you should rest and meditate" : ""}</div>
      <div class="os-wy-sheet-h">the shape of you</div><div class="os-wy-grid">${skills}</div>
      <div class="os-wy-sheet-h">who knows your name</div>${reps}
      <div class="os-wy-sheet-h">work on your hands</div>${quests}
      <div class="os-wy-sheet-h">the pack</div>${inv}`;
    sheetBody.querySelectorAll<HTMLButtonElement>(".os-wy-use").forEach((b) => b.addEventListener("click", () => {
      const it = sheet!.inv[Number(b.dataset.i)];
      if (!it) return;
      if (it.kind === "potion-h") sheet!.hp = Math.min(maxHp(sheet!), sheet!.hp + 45);
      if (it.kind === "potion-m") sheet!.mp = Math.min(maxMp(sheet!), sheet!.mp + 40);
      sheet!.inv.splice(sheet!.inv.indexOf(it), 1);
      audio.mend();
      openSheet();
    }));
  }
  Q(".os-wy-sheet-close").addEventListener("click", () => { sheetEl.hidden = true; });
  /* ——— the map, and the old roads ——— */
  const mapCanvas = Q<HTMLCanvasElement>(".os-wy-map-canvas");
  let mapTargets: Array<{ x: number; y: number; run: () => void }> = [];
  function openMap() {
    document.exitPointerLock?.();
    mapEl.hidden = false;
    const ctx = mapCanvas.getContext("2d"); if (!ctx) return;
    const W = 780, H = 620;
    const sx = (x: number) => ((x + 880) / 1760) * (W - 40) + 20;
    const sz = (z: number) => ((z + 880) / 1760) * (H - 40) + 20;
    ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);
    for (let x = -860; x < 880; x += 22) for (let z = -860; z < 880; z += 22) {
      const h = wyHeight(x, z);
      ctx.fillStyle = h < 0.4 ? "#1d3346" : h > 30 ? "#5a5c60" : h > 14 ? "#3d4a2c" : "#2c4423";
      ctx.fillRect(sx(x), sz(z), 5, 5);
    }
    ctx.strokeStyle = "rgba(190,160,100,0.5)"; ctx.lineWidth = 2; ctx.beginPath();
    for (const [ax, az, bx, bz] of ROADS) { ctx.moveTo(sx(ax), sz(az)); ctx.lineTo(sx(bx), sz(bz)); }
    ctx.stroke();
    mapTargets = [];
    ctx.font = "13px Georgia, serif"; ctx.textAlign = "left";
    for (const t of TOWNS) {
      ctx.fillStyle = "#e8c87a";
      ctx.beginPath(); ctx.arc(sx(t.x), sz(t.z), 5, 0, 7); ctx.fill();
      ctx.fillText(t.name, sx(t.x) + 9, sz(t.z) + 4);
      mapTargets.push({ x: sx(t.x), y: sz(t.z), run: () => travelTo("town", t.id) });
    }
    for (const d of DUNGEONS) {
      if (!discovered.has(d.id)) continue;
      const X = sx(d.x), Y = sz(d.z);
      ctx.fillStyle = "#b48ae0";
      ctx.beginPath(); ctx.moveTo(X, Y - 6); ctx.lineTo(X + 5, Y); ctx.lineTo(X, Y + 6); ctx.lineTo(X - 5, Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#cdb4e8";
      ctx.fillText(d.name, X + 9, Y + 4);
      mapTargets.push({ x: X, y: Y, run: () => travelTo("dungeon", d.id) });
    }
    ctx.fillStyle = "#f2ede2";
    ctx.beginPath(); ctx.arc(sx(px), sz(pz), 4, 0, 7); ctx.fill();
    ctx.fillText("you", sx(px) + 8, sz(pz) + 4);
  }
  function travelTo(kind: string, id: string) {
    let tx = 0, tz = 0, name = "";
    if (kind === "town") { const t = TOWNS.find((t2) => t2.id === id)!; tx = t.x; tz = t.z + t.r * 0.72; name = t.name; }
    else { const d = DUNGEONS.find((d2) => d2.id === id)!; tx = d.x; tz = d.z + 9.5; name = d.name; }
    const dist = Math.hypot(tx - px, tz - pz);
    const cart = !!sheet && sheet.gold >= 6 && dist > 120;
    const hours = Math.max(1, Math.round(dist / (cart ? 95 : 45)));
    if (cart && sheet) sheet.gold -= 6;
    mapEl.hidden = true;
    fadeThrough(() => {
      timeMin += hours * 60;
      scene.kind = "overworld"; scene.building = null; scene.interior = null; scene.dungeon = null; scene.dungeonDef = null;
      px = tx; pz = tz; pyaw = 0; foes = [];
      groundY = wyHeight(px, pz);
      setPlace(name);
      banner(`${name} — after ${hours} hour${hours > 1 ? "s" : ""} on the old roads${cart ? ", six gold lighter for the cart" : ""}.`);
      if (isNight() && Math.random() < 0.3) { spawnFoe("bandit", px + 10, pz + 6); spawnFoe("bandit", px - 9, pz + 9); banner("The road exacts its toll — bandits!"); }
      saveGame();
    });
  }
  mapCanvas.addEventListener("click", (e) => {
    const r = mapCanvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (780 / r.width), my = (e.clientY - r.top) * (620 / r.height);
    let best: { run: () => void } | null = null, bd = 22;
    for (const t of mapTargets) { const d = Math.hypot(t.x - mx, t.y - my); if (d < bd) { bd = d; best = t; } }
    best?.run();
  });
  Q(".os-wy-map-close").addEventListener("click", () => { mapEl.hidden = true; });
  /* ——— townsfolk abroad, and the doors of the world ——— */
  function buildWanderers() {
    const rnd = mulberry32(SEED ^ 0xbeef);
    wanderers = [];
    for (const t of TOWNS) {
      for (let i = 0; i < 3; i++) {
        const a = rnd() * Math.PI * 2, rr = 12 + rnd() * t.r * 0.45;
        const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
        wanderers.push({
          npc: { name: FIRST[Math.floor(rnd() * FIRST.length)], role: "townsfolk", service: null, x: 0, z: 0, yaw: 0, robe: ROBES[Math.floor(rnd() * ROBES.length)] },
          x, z, tx: x, tz: z, yaw: rnd() * 6.3, phase: rnd() * 6, wait: rnd() * 4,
        });
      }
    }
  }
  function currentInteracts(): Interact[] {
    const list: Interact[] = [];
    if (scene.kind === "overworld") {
      for (const b of world.buildings) {
        list.push({ x: b.doorX, z: b.doorZ, label: b.kind === "house" ? "Knock — a house" : "Enter — " + b.name, run: () => {
          if (b.kind === "house") { audio.door(); banner("Barred, and no answer but the wind."); return; }
          enterBuilding(b);
        } });
      }
      for (const d of DUNGEONS) list.push({ x: d.x, z: d.z + 6.8, label: "Descend — " + d.name, run: () => enterDungeon(d) });
      for (const w of wanderers) list.push({ x: w.x, z: w.z, label: "Speak — " + w.npc.name, run: () => openDialogue(w.npc) });
    } else if (scene.kind === "interior" && scene.interior) {
      for (const n of scene.interior.npcs) list.push({ x: n.x, z: n.z, label: "Speak — " + n.name, run: () => openDialogue(n) });
      list.push({ x: 0, z: 5.4, label: "Leave", run: leaveBuilding });
    } else if (scene.kind === "dungeon" && scene.dungeon) {
      for (const c of scene.dungeon.chests) if (!c.opened) list.push({ x: c.x, z: c.z, label: c.locked ? "A locked chest" : "Open the chest", run: () => openChest(c) });
      list.push({ x: scene.dungeon.startX, z: scene.dungeon.startZ + 3.2, label: "Climb out", run: exitDungeon });
    }
    return list;
  }

  /* ——— buffers, hands, and the turning of the world ——— */
  let staCount = 0, terrCount = 0, phase = 0, jumpOff = 0;
  function uploadStatic(a: Float32Array) {
    gl.bindBuffer(gl.ARRAY_BUFFER, staBuf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    staCount = a.length / 9;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, terrBuf);
  gl.bufferData(gl.ARRAY_BUFFER, world.terrain, gl.STATIC_DRAW);
  terrCount = world.terrain.length / 9;
  uploadStatic(world.lit);
  const watBuf = gl.createBuffer();
  { const wc: Col3 = [0.10, 0.17, 0.22];
    const per: number[] = [];
    for (const [x, z] of [[-880, -880], [880, -880], [880, 880], [-880, 880]] as Array<[number, number]>) per.push(x, 0.35, z, ...wc, 0.88, 0.4);
    const flat: number[] = [];
    for (const i of [0, 1, 2, 0, 2, 3]) flat.push(...per.slice(i * 8, i * 8 + 8));
    gl.bindBuffer(gl.ARRAY_BUFFER, watBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flat), gl.STATIC_DRAW); }
  const skyBuf = gl.createBuffer();
  let skyN = 0;
  { const so: number[] = [];
    octa(so, 0, 0, 0, 1500, 1500, 1500, [1, 1, 1]);
    const sp: number[] = [];
    for (let i = 0; i < so.length; i += 9) sp.push(so[i], so[i + 1], so[i + 2]);
    skyN = sp.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sp), gl.STATIC_DRAW); }
  const panelsOpen = () => !dialogEl.hidden || !shopEl.hidden || !sheetEl.hidden || !mapEl.hidden || !menuEl.hidden || !deathEl.hidden;
  const playing = () => started && scene.kind !== "title" && deathEl.hidden;
  function lockLook() { if (playing() && !panelsOpen()) canvas.requestPointerLock?.(); }
  canvas.addEventListener("click", () => { if (!locked) lockLook(); });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  wrap.addEventListener("mousemove", (e) => {
    if (!locked) return;
    pyaw -= e.movementX * 0.0021;
    ppitch = clamp(ppitch - e.movementY * 0.0021, -1.35, 1.35);
  });
  wrap.addEventListener("mousedown", (e) => {
    if (!playing() || panelsOpen() || !locked) return;
    if (e.button === 0 && !laptop) swingStart();
    if (e.button === 2) castBolt();
  });
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());
  wrap.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    keys[e.code] = true;
    if (!playing()) return;
    if (e.code === "KeyM") { toggleMenu(); return; }
    if (panelsOpen()) {
      if (e.code === "Escape") { closeDialogue(); shopEl.hidden = true; sheetEl.hidden = true; mapEl.hidden = true; menuEl.hidden = true; }
      return;
    }
    if (e.code === "KeyE") curInteract?.run();
    if (e.code === "KeyC") openSheet();
    if (e.code === "KeyT") { if (scene.kind === "overworld") doRest(8, false); else if (scene.kind === "dungeon") doRest(6, false); else banner("Not here. Beds are for inns."); }
    if (e.code === "KeyR") castHeal();
    if (e.code === "KeyQ") castBolt();
    if (e.code === "Space") { e.preventDefault(); if (laptop) swingStart(); else if (grounded) { vy = 8.2; grounded = false; } }
    if (e.code === "KeyF") { if (laptop) { if (grounded) { vy = 8.2; grounded = false; } } else castBolt(); }
  });
  wrap.addEventListener("keyup", (e) => { keys[e.code] = false; });
  /* ——— touch hands: a stick to walk, a drag to look, buttons to act ——— */
  const touchEl = Q(".os-wy-touch");
  const useBtn = Q<HTMLButtonElement>(".os-wy-tbtn[data-t='use']");
  const isTouchDev = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  touchEl.style.display = isTouchDev ? "block" : "none";
  const touch = { on: false, f: 0, r: 0, id: -1, cx: 0, cy: 0, lookId: -1, lx: 0, ly: 0 };
  const stickEl = Q(".os-wy-stick"), stickDot = Q(".os-wy-stick-dot");
  stickEl.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    const r = stickEl.getBoundingClientRect();
    touch.id = t.identifier; touch.cx = r.left + r.width / 2; touch.cy = r.top + r.height / 2; touch.on = true;
    e.preventDefault();
  }, { passive: false });
  wrap.addEventListener("touchstart", (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.target === canvas && touch.lookId === -1) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
    }
  }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touch.id) {
        const dx = clamp((t.clientX - touch.cx) / 44, -1, 1), dy = clamp((t.clientY - touch.cy) / 44, -1, 1);
        touch.r = dx; touch.f = -dy;
        stickDot.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
      } else if (t.identifier === touch.lookId) {
        pyaw -= (t.clientX - touch.lx) * 0.0052;
        ppitch = clamp(ppitch - (t.clientY - touch.ly) * 0.0052, -1.35, 1.35);
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    if (touch.id !== -1) e.preventDefault();
  }, { passive: false });
  const touchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touch.id) { touch.id = -1; touch.on = false; touch.f = 0; touch.r = 0; stickDot.style.transform = ""; }
      if (t.identifier === touch.lookId) touch.lookId = -1;
    }
  };
  wrap.addEventListener("touchend", touchEnd);
  wrap.addEventListener("touchcancel", touchEnd);
  touchEl.querySelectorAll<HTMLButtonElement>(".os-wy-tbtn").forEach((b) => {
    b.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = b.dataset.t;
      if (t === "use") curInteract?.run();
      if (t === "atk") swingStart();
      if (t === "cast") castBolt();
      if (t === "mend") castHeal();
      if (t === "jump" && grounded) { vy = 8.2; grounded = false; }
    }, { passive: false });
  });
  /* ——— the glass menu ——— */
  const menuBtns = menuEl.querySelectorAll<HTMLButtonElement>("button[data-m]");
  function syncMenu() {
    menuBtns.forEach((b) => {
      const m = b.dataset.m;
      if (m === "sound") b.textContent = `sound · ${sndOn ? "on" : "off"}`;
      if (m === "iris") b.textContent = `iris · ${irisOn ? "auto" : "off"}`;
      if (m === "input") b.textContent = `input · ${laptop ? "laptop" : "mouse"}`;
      if (m === "photo") b.textContent = `photo · ${photoOn ? "on" : "off"}`;
    });
    Q(".os-wy-record").textContent = sheet ? `${sheet.name} — level ${sheet.level} · ${sheet.gold} gold · day ${dayNow()}` : "";
  }
  function toggleMenu() { menuEl.hidden = !menuEl.hidden; if (!menuEl.hidden) { document.exitPointerLock?.(); syncMenu(); } }
  Q(".os-wy-burger").addEventListener("click", () => { if (started) toggleMenu(); });
  menuBtns.forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.m;
    if (m === "sound") { sndOn = !sndOn; try { localStorage.setItem("wyrdfall-sound", sndOn ? "on" : "off"); } catch { /* keep */ } }
    if (m === "iris") { irisOn = !irisOn; if (!irisOn) { quality = 0; dprCap = 1.5; } try { localStorage.setItem("wyrdfall-iris", irisOn ? "on" : "off"); } catch { /* keep */ } }
    if (m === "input") { laptop = !laptop; try { localStorage.setItem("wyrdfall-input", laptop ? "laptop" : "mouse"); } catch { /* keep */ } banner(laptop ? "Laptop hands: space strikes, E speaks and uses, F leaps, the pad turns your head. Click the world to take the view." : "Mouse hands: click to take the view. Left button strikes, right casts."); }
    if (m === "photo") { photoOn = !photoOn; try { localStorage.setItem("wyrdfall-photo", photoOn ? "on" : "off"); } catch { /* keep */ } }
    if (m === "save") { saveGame(); banner("The realm remembers."); }
    if (m === "sheet") { menuEl.hidden = true; openSheet(); return; }
    if (m === "map") { menuEl.hidden = true; openMap(); return; }
    if (m === "quit") { saveGame(); started = false; scene.kind = "title"; menuEl.hidden = true; titleEl.hidden = false; document.exitPointerLock?.(); return; }
    syncMenu();
  }));
  /* ——— the making of a traveller ——— */
  const archWrap = Q(".os-wy-archs");
  let chosenArch = ARCHS[0];
  for (const a of ARCHS) {
    const b = el("button", "os-wy-arch" + (a === chosenArch ? " sel" : ""));
    b.innerHTML = `<b>${a.name}</b><span>${a.blurb}</span><i>${Object.entries(a.skills).map(([k, v]) => `${SKILL_NAME[k as SkillId]} ${v}`).join(" · ")}</i>`;
    b.addEventListener("click", () => { chosenArch = a; archWrap.querySelectorAll(".os-wy-arch").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); });
    archWrap.appendChild(b);
  }
  let savedRaw: string | null = null;
  try { savedRaw = localStorage.getItem(SAVE_KEY); } catch { /* none */ }
  const contBtn = Q<HTMLButtonElement>(".os-wy-continue");
  if (savedRaw) contBtn.hidden = false;
  function beginGame(fromSave: boolean) {
    if (fromSave && savedRaw) {
      try {
        const d = JSON.parse(savedRaw) as { sheet: Sheet; timeMin: number; px: number; pz: number; pyaw: number; discovered: string[] };
        sheet = d.sheet; timeMin = d.timeMin || 480; px = d.px ?? 0; pz = d.pz ?? -40; pyaw = d.pyaw ?? 0;
        discovered = new Set(d.discovered || []);
      } catch { sheet = null; }
    }
    if (!sheet) {
      const nameIn = Q<HTMLInputElement>(".os-wy-namein");
      const skills = baseSkills();
      Object.assign(skills, chosenArch.skills);
      sheet = {
        name: (nameIn.value || "").trim() || "Traveller", arch: chosenArch.id, level: 1,
        skills, uses: { blade: 0, destruction: 0, restoration: 0, athletics: 0, lockpick: 0, mercantile: 0 }, gains: 0,
        hp: 0, mp: 0, gold: 60, weapon: 0,
        rep: { "the Hearthguard": 0, "the Umbral Covenant": 0, "the Listening God": 0 },
        inv: [{ name: "draught of mending", val: 25, kind: "potion-h" }], quests: [],
      };
      sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
      px = 0; pz = -40; pyaw = 0; timeMin = 8 * 60; discovered = new Set();
    }
    started = true;
    scene.kind = "overworld";
    groundY = wyHeight(px, pz);
    buildWanderers();
    titleEl.hidden = true;
    const t = townAt(px, pz);
    setPlace(t ? t.name : "the wilds");
    banner(fromSave ? `Welcome back, ${sheet.name}. It is day ${dayNow()}.` : "The province is yours to walk. The guild halls keep its work, if you want it.", 4600);
    saveGame();
  }
  Q(".os-wy-begin").addEventListener("click", () => beginGame(false));
  contBtn.addEventListener("click", () => beginGame(true));
  Q(".os-wy-rise").addEventListener("click", () => {
    if (!sheet) return;
    deathEl.hidden = true;
    sheet.gold = Math.floor(sheet.gold * 0.9);
    sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
    const temple = world.buildings.find((b) => b.town === "thornwick" && b.kind === "temple")!;
    fadeThrough(() => {
      scene.kind = "overworld"; scene.building = null; scene.interior = null; scene.dungeon = null; scene.dungeonDef = null; foes = [];
      px = temple.doorX; pz = temple.doorZ; pyaw = 0;
      groundY = wyHeight(px, pz);
      timeMin += 6 * 60;
      setPlace("the Temple of the Listening God");
      banner("You wake on temple stone, a tithe lighter. The God listened.");
      saveGame();
    });
  });
  /* ——— the step ——— */
  let eyeY = wyHeight(0, -40) + 1.62;
  function step(dt: number) {
    if (scene.kind === "title" || !sheet) return;
    timeMin += dt * 2;
    const paused = panelsOpen();
    if (!paused) {
      const fAmt = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
      const rAmt = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
      const fIn = touch.on ? touch.f : fAmt, rIn = touch.on ? touch.r : rAmt;
      const moving = fIn !== 0 || rIn !== 0;
      const sprint = (!!(keys.ShiftLeft || keys.ShiftRight) || (touch.on && Math.hypot(touch.f, touch.r) > 0.95)) && stamina > 2 && moving;
      if (sprint) { stamina = Math.max(0, stamina - 11 * dt); athAcc += dt; if (athAcc > 4) { athAcc = 0; skillUse("athletics", 0.4); } }
      else stamina = Math.min(100, stamina + (moving ? 5 : 9) * dt);
      if (moving) {
        let sp = sprint ? 6.9 : 4.3;
        if (scene.kind === "overworld" && groundY < 0.35) sp *= 0.55;
        const sy = Math.sin(pyaw), cy = Math.cos(pyaw);
        let wx = -sy * fIn + cy * rIn, wz = -cy * fIn - sy * rIn;
        const wl = Math.hypot(wx, wz) || 1;
        sp *= Math.min(1, wl); wx /= wl; wz /= wl;
        px += wx * sp * dt; pz += wz * sp * dt;
        stepAcc += sp * dt;
        if (stepAcc > 2.1 && grounded) { stepAcc = 0; audio.step(scene.kind !== "overworld"); }
        phase += dt * sp * 1.9;
      }
      const solids = scene.kind === "overworld" ? world.solids : scene.kind === "interior" ? scene.interior!.solids : scene.dungeon!.solids;
      for (const s of solids) {
        if (s.r <= 0) continue;
        const dx = px - s.x, dz = pz - s.z, d2 = dx * dx + dz * dz, rr = s.r + 0.42;
        if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2); px = s.x + (dx / d) * rr; pz = s.z + (dz / d) * rr; }
      }
      if (scene.kind === "overworld") { px = clamp(px, -862, 862); pz = clamp(pz, -862, 862); }
      if (scene.kind === "interior") { px = clamp(px, -7.6, 7.6); pz = clamp(pz, -5.6, 5.9); }
      const target = scene.kind === "overworld" ? wyHeight(px, pz) : 0;
      if (!grounded) { vy -= 22 * dt; jumpOff += vy * dt; if (jumpOff <= 0) { jumpOff = 0; vy = 0; grounded = true; } }
      groundY = target;
      if (swingT > 0) { swingT -= dt; if (pendingHit > 0) { pendingHit -= dt; if (pendingHit <= 0 && !swingHitDone) { swingHitDone = true; swingResolve(); } } }
      if (hurtT > 0) hurtT -= dt;
      for (const f of foes) {
        if (f.dead) continue;
        if (f.flash > 0) f.flash -= dt;
        f.atkCd -= dt;
        const dx = px - f.x, dz = pz - f.z, d = Math.hypot(dx, dz);
        const fGround = scene.kind === "overworld" ? wyHeight(f.x, f.z) : 0;
        if (d < 30 && Math.abs(fGround - groundY) < 3.5) {
          f.yaw = Math.atan2(-dx, -dz);
          if (d > 1.85) {
            const st = FOES[f.kind];
            f.x += (dx / d) * st.speed * dt; f.z += (dz / d) * st.speed * dt;
            f.phase += dt * st.speed * 2.0;
          } else if (f.atkCd <= 0) { f.atkCd = 0.95; hurtPlayer(FOES[f.kind].dmg * (0.8 + Math.random() * 0.5)); }
        }
      }
      foes = foes.filter((f) => !f.dead);
      for (const r of remains) r.ttl -= dt;
      remains = remains.filter((r) => r.ttl > 0);
      for (const t of tracers) t.ttl -= dt;
      tracers = tracers.filter((t) => t.ttl > 0);
      if (scene.kind === "overworld") {
        for (const w of wanderers) {
          w.wait -= dt;
          const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
          if (w.wait <= 0) {
            if (d < 0.6) {
              const t = townAt(w.x, w.z) || TOWNS[0];
              const a = Math.random() * 6.3, rr = 8 + Math.random() * t.r * 0.5;
              w.tx = t.x + Math.cos(a) * rr; w.tz = t.z + Math.sin(a) * rr; w.wait = 2 + Math.random() * 5;
            } else { w.yaw = Math.atan2(-dx, -dz); w.x += (dx / d) * 1.15 * dt; w.z += (dz / d) * 1.15 * dt; w.phase += dt * 4.4; }
          }
        }
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 5;
          if (!townAt(px, pz) && foes.length < 6 && Math.random() < 0.5) {
            const a = Math.random() * 6.3, d = 52 + Math.random() * 26;
            const sx2 = clamp(px + Math.cos(a) * d, -850, 850), sz2 = clamp(pz + Math.sin(a) * d, -850, 850);
            if (!townAt(sx2, sz2) && wyHeight(sx2, sz2) > 0.5) {
              const kind: FoeKind = isNight() ? (Math.random() < 0.5 ? "skeleton" : "wolf") : roadDist(sx2, sz2) < 9 ? "bandit" : "wolf";
              spawnFoe(kind, sx2, sz2);
            }
          }
        }
        for (const d of DUNGEONS) if (!discovered.has(d.id) && Math.hypot(px - d.x, pz - d.z) < 60) { discovered.add(d.id); banner(`A mound, a dark door, standing stones — ${d.name}.`); }
        const t = townAt(px, pz);
        const nearDg = DUNGEONS.find((d) => Math.hypot(px - d.x, pz - d.z) < 30);
        setPlace(t ? t.name : nearDg ? nearDg.name : wyHeight(px, pz) < 0.4 ? "the Mere" : "the wilds");
      }
      curInteract = null;
      let bd = 3.1;
      for (const it of currentInteracts()) { const d = Math.hypot(it.x - px, it.z - pz); if (d < bd) { bd = d; curInteract = it; } }
      saveT -= dt;
      if (saveT <= 0) { saveT = 45; saveGame(); }
    }
    promptEl.textContent = curInteract ? `E — ${curInteract.label}` : "";
    promptEl.style.opacity = curInteract ? "1" : "0";
    if (placeT > 0) { placeT -= dt; if (placeT <= 0) placeEl.classList.remove("show"); }
  }
  /* ——— the render ——— */
  const dynArr: number[] = [];
  function render(now: number, dt: number) {
    const w = wrap.clientWidth || 1024, h = wrap.clientHeight || 640;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const cw = Math.max(2, Math.round(w * dpr)), ch = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    let camX = px, camZ = pz, yaw = pyaw, pitch = ppitch;
    const targetEye = scene.kind === "title"
      ? wyHeight(Math.cos(now * 0.021) * 135, -120 + Math.sin(now * 0.021) * 135) + 30
      : groundY + jumpOff + 1.62 + Math.sin(phase * 2) * (grounded && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD) ? 0.028 : 0);
    eyeY += (targetEye - eyeY) * Math.min(1, dt * 13);
    let camY = eyeY;
    if (scene.kind === "title") {
      camX = Math.cos(now * 0.021) * 135; camZ = -120 + Math.sin(now * 0.021) * 135; camY = targetEye;
      yaw = Math.atan2(-(0 - camX), -(-120 - camZ)); pitch = -0.30;
    }
    const cp = Math.cos(pitch);
    const dir: [number, number, number] = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const eye: [number, number, number] = [camX, camY, camZ];
    const vpM = m4.mul(m4.persp(1.08, cw / ch, 0.1, 1700), m4.lookAt(eye, [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]], [0, 1, 0]));
    const hr = hourNow();
    const sunAng = ((hr - 6) / 12) * Math.PI;
    const sunDir: [number, number, number] = [Math.cos(sunAng) * 0.75, Math.sin(sunAng), 0.38];
    const sl = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1; sunDir[0] /= sl; sunDir[1] /= sl; sunDir[2] /= sl;
    const night = clamp(0.25 - sunDir[1] * 2.0, 0, 1);
    const sunset = clamp(1 - Math.abs(sunDir[1]) * 2.6, 0, 1);
    const inDark = scene.kind !== "overworld";
    const fogCol: Col3 = inDark ? [0.05, 0.04, 0.035] : [
      lerp(lerp(0.58, 0.66, sunset * 0.5), 0.04, night),
      lerp(lerp(0.63, 0.42, sunset * 0.5), 0.05, night),
      lerp(lerp(0.68, 0.30, sunset * 0.5), 0.09, night),
    ];
    const zen: Col3 = [lerp(0.30, 0.012, night), lerp(0.47, 0.018, night), lerp(0.68, 0.045, night)];
    const hor: Col3 = [
      lerp(lerp(0.74, 0.88, sunset * 0.6), 0.05, night),
      lerp(lerp(0.78, 0.50, sunset * 0.6), 0.06, night),
      lerp(lerp(0.82, 0.26, sunset * 0.6), 0.10, night),
    ];
    const sunCol: Col3 = [1.0, lerp(0.95, 0.55, sunset), lerp(0.85, 0.25, sunset)];
    gl.clearColor(fogCol[0] * 0.6, fogCol[1] * 0.6, fogCol[2] * 0.6, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const bindLit = (buf: WebGLBuffer | null) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aNor);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 36, 24);
    };
    if (!inDark) {
      gl.useProgram(skyP);
      gl.uniformMatrix4fv(skyU.vp, false, vpM);
      gl.uniform3fv(skyU.zen, zen);
      gl.uniform3fv(skyU.hor, hor);
      gl.uniform3fv(skyU.sunDir, sunDir);
      gl.uniform3fv(skyU.sunCol, sunCol);
      gl.uniform1f(skyU.night, night);
      gl.uniform1f(skyU.time, now);
      gl.uniform1f(skyU.cover, 0.28);
      gl.uniform1f(skyU.gloom, 0.12);
      gl.uniform1f(skyU.flash, 0);
      gl.uniform3f(skyU.moonDir, -sunDir[0], Math.max(0.25, -sunDir[1]), -sunDir[2]);
      gl.uniform1f(skyU.aurora, 0);
      gl.uniform1f(skyU.second, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.enableVertexAttribArray(aPosS);
      gl.vertexAttribPointer(aPosS, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(aCol); gl.disableVertexAttribArray(aNor);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, skyN);
      gl.depthMask(true);
    }
    if (inDark) {
      setLit(vpM, eye, [0.35, 0.75, 0.25], fogCol, scene.kind === "dungeon" ? 3.5 : 5, scene.kind === "dungeon" ? 30 : 36, scene.kind === "dungeon" ? [0.52, 0.48, 0.46] : [0.66, 0.58, 0.52], [0.30, 0.18, 0.08], now);
    } else {
      const sd: [number, number, number] = sunDir[1] < -0.05 ? [-sunDir[0] * 0.4, 0.55, -sunDir[2] * 0.4] : sunDir;
      setLit(vpM, eye, sd, fogCol, lerp(90, 26, night), lerp(780, 300, night), [1, 1, 1], [lerp(0.10, 0.42, sunset), 0.12, 0.08], now);
    }
    if (!inDark) { bindLit(terrBuf); gl.drawArrays(gl.TRIANGLES, 0, terrCount); }
    bindLit(staBuf);
    gl.drawArrays(gl.TRIANGLES, 0, staCount);
    if (!inDark) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(watP);
      gl.uniformMatrix4fv(watU.mvp, false, vpM);
      gl.uniform2f(watU.cam, eye[0], eye[2]);
      gl.uniform3fv(watU.camPos, eye);
      gl.uniform3fv(watU.sun, sunDir);
      gl.uniform3fv(watU.sunCol, sunCol);
      gl.uniform3fv(watU.hor, hor);
      gl.uniform3fv(watU.fog, fogCol);
      gl.uniform1f(watU.fogNear, lerp(90, 26, night));
      gl.uniform1f(watU.fogFar, lerp(780, 300, night));
      gl.uniform1f(watU.time, now);
      gl.uniform1f(watU.cold, 0.35);
      gl.uniform1f(watU.day, 1 - night);
      gl.bindBuffer(gl.ARRAY_BUFFER, watBuf);
      gl.enableVertexAttribArray(aPosW); gl.enableVertexAttribArray(aColW); gl.enableVertexAttribArray(aAuxW);
      gl.disableVertexAttribArray(aNor);
      gl.vertexAttribPointer(aPosW, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(aColW, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(aAuxW, 2, gl.FLOAT, false, 32, 24);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      gl.useProgram(litP);
    }
    /* the living */
    dynArr.length = 0;
    const gAt = (x: number, z: number) => (scene.kind === "overworld" ? wyHeight(x, z) : 0);
    const flashMix = (c: Col3, f: DynFoe): Col3 => f.flash > 0 ? [lerp(c[0], 1, 0.6), lerp(c[1], 0.25, 0.6), lerp(c[2], 0.2, 0.6)] : c;
    for (const f of foes) {
      if (f.dead) continue;
      const y = gAt(f.x, f.z), ry = f.yaw + Math.PI;
      if (f.kind === "wolf") beast(dynArr, f.x, y, f.z, ry, f.phase, flashMix([0.34, 0.32, 0.31], f), 1.15);
      else if (f.kind === "rat") beast(dynArr, f.x, y, f.z, ry, f.phase, flashMix([0.30, 0.24, 0.19], f), 0.42);
      else if (f.kind === "skeleton") humanoid(dynArr, f.x, y, f.z, ry, f.phase, flashMix([0.66, 0.63, 0.55], f), [0.20, 0.18, 0.16], [0.78, 0.75, 0.66]);
      else if (f.kind === "bandit") humanoid(dynArr, f.x, y, f.z, ry, f.phase, flashMix([0.36, 0.26, 0.16], f), [0.50, 0.14, 0.10], [0.72, 0.55, 0.40]);
      else humanoid(dynArr, f.x, y, f.z, ry, f.phase, flashMix([0.16, 0.13, 0.22], f), [0.45, 0.30, 0.80], [0.70, 0.60, 0.50], true);
    }
    if (scene.kind === "overworld") for (const w of wanderers) humanoid(dynArr, w.x, wyHeight(w.x, w.z), w.z, w.yaw + Math.PI, w.phase, w.npc.robe, [0.3, 0.26, 0.2], [0.72, 0.56, 0.42]);
    if (scene.kind === "interior" && scene.interior) for (const n of scene.interior.npcs) humanoid(dynArr, n.x, 0, n.z, n.yaw, Math.sin(now * 1.4 + n.x) * 0.06, n.robe, [0.3, 0.26, 0.2], [0.72, 0.56, 0.42], n.service === "guildm");
    for (const r of remains) octa(dynArr, r.x, r.y + 0.12, r.z, 0.72, 0.13, 0.72, r.col);
    for (const t of tracers) beam(dynArr, t.x, t.y, t.z, t.dx, t.dy, t.dz, t.len, 0.05, t.col);
    if (playing() && !panelsOpen()) {
      const fh: [number, number, number] = [-Math.sin(yaw), 0, -Math.cos(yaw)];
      const rt: [number, number, number] = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const B: [number, number, number] = [eye[0] + rt[0] * 0.33 + fh[0] * 0.52, eye[1] - 0.30, eye[2] + rt[2] * 0.33 + fh[2] * 0.52];
      const sp2 = swingT > 0 ? 1 - swingT / 0.40 : 0;
      const raise = 0.95 - (swingT > 0 ? Math.sin(sp2 * Math.PI) * 1.75 : 0) + Math.sin(now * 1.7) * 0.012;
      const bd: [number, number, number] = [fh[0] * Math.sin(raise), Math.cos(raise), fh[2] * Math.sin(raise)];
      const steel: Col3 = sheet && sheet.weapon >= 3 ? [0.82, 0.84, 0.90] : sheet && sheet.weapon >= 2 ? [0.66, 0.68, 0.72] : [0.52, 0.52, 0.55];
      beam(dynArr, B[0] + bd[0] * 0.36, B[1] + bd[1] * 0.36, B[2] + bd[2] * 0.36, bd[0], bd[1], bd[2], 0.68, 0.016, steel);
      octa(dynArr, B[0] + bd[0] * 0.72, B[1] + bd[1] * 0.72, B[2] + bd[2] * 0.72, 0.028, 0.045, 0.028, steel);
      beam(dynArr, B[0] + bd[0] * 0.03, B[1] + bd[1] * 0.03, B[2] + bd[2] * 0.03, rt[0], rt[1], rt[2], 0.17, 0.018, [0.55, 0.42, 0.16]);
      beam(dynArr, B[0] - bd[0] * 0.05, B[1] - bd[1] * 0.05, B[2] - bd[2] * 0.05, bd[0], bd[1], bd[2], 0.13, 0.020, [0.16, 0.11, 0.07]);
    }
    if (dynArr.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(dynArr));
      bindLit(dynBuf);
      gl.drawArrays(gl.TRIANGLES, 0, dynArr.length / 9);
    }
    /* the telling */
    if (sheet) {
      hpBar.style.width = `${clamp((sheet.hp / maxHp(sheet)) * 100, 0, 100)}%`;
      mpBar.style.width = `${clamp((sheet.mp / maxMp(sheet)) * 100, 0, 100)}%`;
      stBar.style.width = `${stamina}%`;
      const hh = Math.floor(hourNow()), mm = Math.floor((hourNow() % 1) * 60);
      clockEl.textContent = `Day ${dayNow()} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${sheet.gold} gold`;
      const frac = ((pyaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      compStrip.style.transform = `translateX(${-frac * 50}%)`;
    }
    hurtEl.style.opacity = String(clamp(hurtT, 0, 0.55));
    touchEl.style.visibility = isTouchDev && started && !panelsOpen() && scene.kind !== "title" ? "visible" : "hidden";
    if (isTouchDev) useBtn.textContent = curInteract ? (curInteract.label.split("—")[0] || "use").trim() : "use";
    const chromeOff = photoOn && locked;
    hudEl.style.visibility = started && !chromeOff ? "visible" : "hidden";
    Q<HTMLElement>(".os-wy-burger").style.visibility = started && !chromeOff ? "visible" : "hidden";
    crossEl.style.opacity = locked && !panelsOpen() && started ? "1" : "0";
    placeEl.style.visibility = chromeOff ? "hidden" : "visible";
  }
  let last = performance.now();
  function frame(nowMs: number) {
    requestAnimationFrame(frame);
    if (!body.isConnected) { wrap.remove(); return; }
    const dt = Math.min(0.05, (nowMs - last) / 1000 || 0.016);
    last = nowMs;
    const t0 = performance.now();
    if (started) step(dt);
    render(nowMs / 1000, dt);
    const ft = performance.now() - t0;
    frameMs = frameMs * 0.95 + ft * 0.05;
    if (irisOn) {
      if (frameMs > 21 && quality < 3) { quality++; dprCap = [1.5, 1.25, 1.0, 0.8][quality]; }
      else if (frameMs < 11 && quality > 0) { quality--; dprCap = [1.5, 1.25, 1.0, 0.8][quality]; }
    }
  }
  requestAnimationFrame(frame);
}
