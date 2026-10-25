/* Wyrdfall — a province that does not scale to meet you.
   A full little RPG in the posture of the old province games: textured
   timber towns, painted folk, dungeons lit by torchlight, and work for
   anyone willing to walk the roads. Second building: a bespoke textured
   engine, sprite actors, a dressed world, and a sound engine with
   plucked strings in it. */
import { m4 } from "./os-simulacrum";
import { T, SPR, tileUV, makeAtlas } from "./os-wy-tex";

type Col3 = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const vrnd = mulberry32(0x77fa11);
const hash2 = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
};
const fbm = (x: number, z: number) => vnoise(x, z) * 0.55 + vnoise(x * 2.13 + 7.7, z * 2.13 + 3.1) * 0.28 + vnoise(x * 4.7 + 13.7, z * 4.7 + 9.2) * 0.17;

/* ——— the province's shape ——— */
const WORLD_R = 880;
const TOWNS = [
  { name: "Thornwick", x: 0, z: -120, r: 105 },
  { name: "Millbrook", x: -390, z: 265, r: 80 },
  { name: "Cairn Ford", x: 435, z: 335, r: 80 },
];
const DUNGEONS = [
  { name: "Barrow of the First King", x: 185, z: -430, kind: "undead" as const },
  { name: "The Sunken Vault", x: -530, z: -185, kind: "vermin" as const },
  { name: "Witch Hollow", x: 565, z: 65, kind: "cult" as const },
  { name: "The Howling Deep", x: -145, z: 570, kind: "undead" as const },
];
export function wyHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  let h = (fbm(x * 0.004 + 31.7, z * 0.004 + 11.2) - 0.42) * 95;
  h += (fbm(x * 0.021 + 3.3, z * 0.021 + 8.8) - 0.5) * 7;
  const rim = clamp((d - 660) / 190, 0, 1);
  h = lerp(h, 120 + fbm(x * 0.01, z * 0.01) * 60, rim * rim);
  const mere = clamp(1 - Math.hypot(x + 330, z - 330) / 260, 0, 1);
  h = lerp(h, -7, mere * mere * 0.96);
  for (const t of TOWNS) {
    const td = Math.hypot(x - t.x, z - t.z);
    if (td < t.r + 40) h = lerp(6, h, clamp((td - t.r * 0.55) / (t.r * 0.45 + 40), 0, 1));
  }
  for (const dg of DUNGEONS) {
    const dd = Math.hypot(x - dg.x, z - dg.z);
    if (dd < 46) h = lerp(Math.max(h, 9), h, clamp((dd - 20) / 26, 0, 1));
  }
  return h;
}
const roadDist = (x: number, z: number): number => {
  let m = 1e9;
  const seg = (ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    m = Math.min(m, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  };
  seg(TOWNS[0].x, TOWNS[0].z, TOWNS[1].x, TOWNS[1].z);
  seg(TOWNS[0].x, TOWNS[0].z, TOWNS[2].x, TOWNS[2].z);
  seg(TOWNS[1].x, TOWNS[1].z, TOWNS[2].x, TOWNS[2].z);
  for (const dg of DUNGEONS) {
    let best = TOWNS[0], bd = 1e9;
    for (const t of TOWNS) { const d = Math.hypot(dg.x - t.x, dg.z - t.z); if (d < bd) { bd = d; best = t; } }
    seg(best.x, best.z, dg.x, dg.z);
  }
  return m;
};
const inTown = (x: number, z: number) => TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r);

/* ——— textured geometry: pos3, nor3, tint3, uv2 — 11 floats a vertex ——— */
type V = number[];
function tri(a: V, p1: number[], p2: number[], p3: number[], n: Col3, tint: Col3, tile: number, flip = false) {
  const [u0, vB, u1, vT] = tileUV(tile);
  const pts = flip ? [p1, p3, p2] : [p1, p2, p3];
  const uvs: Array<[number, number]> = flip ? [[u0, vB], [u1, vT], [u1, vB]] : [[u0, vB], [u1, vB], [u0, vT]];
  for (let i = 0; i < 3; i++) a.push(pts[i][0], pts[i][1], pts[i][2], n[0], n[1], n[2], tint[0], tint[1], tint[2], uvs[i][0], uvs[i][1]);
}
/* a wall quad from its bottom-left and bottom-right corners, rising h */
function quad(a: V, bl: number[], br: number[], h: number, tint: Col3, tile: number) {
  const dx = br[0] - bl[0], dz = br[2] - bl[2];
  const L = Math.hypot(dx, dz) || 1;
  const n: Col3 = [-dz / L, 0, dx / L];
  const tl = [bl[0], bl[1] + h, bl[2]], tr = [br[0], br[1] + h, br[2]];
  tri(a, bl, br, tl, n, tint, tile);
  tri(a, br, tr, tl, n, tint, tile);
}
function flat(a: V, y: number, x1: number, z1: number, x2: number, z2: number, tint: Col3, tile: number, up = true) {
  const n: Col3 = up ? [0, 1, 0] : [0, -1, 0];
  tri(a, [x1, y, z1], [x2, y, z1], [x1, y, z2], n, tint, tile, !up);
  tri(a, [x2, y, z1], [x2, y, z2], [x1, y, z2], n, tint, tile, !up);
}
function box(a: V, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, tint: Col3, tile: number, topTile?: number) {
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  quad(a, [x0, y0, z1], [x1, y0, z1], hy * 2, tint, tile);
  quad(a, [x1, y0, z0], [x0, y0, z0], hy * 2, tint, tile);
  quad(a, [x1, y0, z1], [x1, y0, z0], hy * 2, tint, tile);
  quad(a, [x0, y0, z0], [x0, y0, z1], hy * 2, tint, tile);
  flat(a, y1, x0, z0, x1, z1, tint, topTile ?? tile);
  flat(a, y0, x0, z0, x1, z1, tint, tile, false);
}
function boxR(a: V, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, tint: Col3, tile: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = (lx: number, lz: number): [number, number] => [cx + lx * c - lz * s, cz + lx * s + lz * c];
  const y0 = cy - hy, y1 = cy + hy;
  const cnr = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => R(lx, lz));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(a, [cnr[i][0], y0, cnr[i][1]], [cnr[j][0], y0, cnr[j][1]], hy * 2, tint, tile);
  }
  const [ax, az] = cnr[0], [bx, bz] = cnr[1], [ex, ez] = cnr[2], [dx, dz] = cnr[3];
  tri(a, [ax, y1, az], [bx, y1, bz], [dx, y1, dz], [0, 1, 0], tint, tile);
  tri(a, [bx, y1, bz], [ex, y1, ez], [dx, y1, dz], [0, 1, 0], tint, tile);
}
/* a gabled roof: ridge along local X, spanning w × d, rising rh from cy */
function gable(a: V, cx: number, cy: number, cz: number, w: number, d: number, rh: number, yaw: number, tint: Col3, tile: number, endTile: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lx: number, ly: number, lz: number): [number, number, number] => [cx + lx * c - lz * s, cy + ly, cz + lx * s + lz * c];
  const hw = w / 2, hd = d / 2;
  const nS: Col3 = [s * 0.55, 0.83, -c * 0.55];
  const nN: Col3 = [-s * 0.55, 0.83, c * 0.55];
  const eL = P(-hw, 0, -hd), eR = P(hw, 0, -hd), rL = P(-hw, rh, 0), rR = P(hw, rh, 0);
  const eL2 = P(-hw, 0, hd), eR2 = P(hw, 0, hd);
  tri(a, eL, eR, rL, nS, tint, tile); tri(a, eR, rR, rL, nS, tint, tile);
  tri(a, eR2, eL2, rR, nN, tint, tile); tri(a, eL2, rL, rR, nN, tint, tile);
  tri(a, eL2, rL, eL, [-c, 0, -s], tint, endTile);
  tri(a, eR, rR, eR2, [c, 0, s], tint, endTile);
}
/* a cylindrical billboard pushed into a dynamic array */
function bill(a: V, x: number, y: number, z: number, w: number, h: number, camX: number, camZ: number, tile: number, tint: Col3, yOff = 0) {
  let dx = camX - x, dz = camZ - z;
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const rx = -dz * (w / 2), rz = dx * (w / 2);
  const [u0, vB, u1, vT] = tileUV(tile);
  const n: Col3 = [dx, 0, dz];
  const c1 = [x - rx, y + yOff, z - rz], c2 = [x + rx, y + yOff, z + rz];
  const c3 = [x - rx, y + yOff + h, z - rz], c4 = [x + rx, y + yOff + h, z + rz];
  const push = (p: number[], u: number, v: number) => a.push(p[0], p[1], p[2], n[0], n[1], n[2], tint[0], tint[1], tint[2], u, v);
  push(c1, u0, vB); push(c2, u1, vB); push(c3, u0, vT);
  push(c2, u1, vB); push(c4, u1, vT); push(c3, u0, vT);
}
function decal(a: V, x: number, y: number, z: number, w: number, h: number, yaw: number, tile: number, tint: Col3) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const [u0, vB, u1, vT] = tileUV(tile);
  const P = (lx: number, lz: number): [number, number, number] => [x + lx * c - lz * s, y, z + lx * s + lz * c];
  const p1 = P(-w / 2, -h / 2), p2 = P(w / 2, -h / 2), p3 = P(-w / 2, h / 2), p4 = P(w / 2, h / 2);
  const push = (p: [number, number, number], u: number, v: number) => a.push(p[0], p[1], p[2], 0, 1, 0, tint[0], tint[1], tint[2], u, v);
  push(p1, u0, vB); push(p2, u1, vB); push(p3, u0, vT);
  push(p2, u1, vB); push(p4, u1, vT); push(p3, u0, vT);
}

/* ————————————————— the built world ————————————————— */
const ROAD_SEGS: Array<[number, number, number, number]> = [
  [TOWNS[0].x, TOWNS[0].z, TOWNS[1].x, TOWNS[1].z],
  [TOWNS[0].x, TOWNS[0].z, TOWNS[2].x, TOWNS[2].z],
  [TOWNS[1].x, TOWNS[1].z, TOWNS[2].x, TOWNS[2].z],
];
for (const dg of DUNGEONS) {
  let best = TOWNS[0], bd = 1e9;
  for (const t of TOWNS) { const d = Math.hypot(dg.x - t.x, dg.z - t.z); if (d < bd) { bd = d; best = t; } }
  ROAD_SEGS.push([best.x, best.z, dg.x, dg.z]);
}
interface LightAnchor { x: number; y: number; z: number; range: number; col: Col3; flicker: boolean }
interface BDef {
  x: number; z: number; yaw: number; baseY: number; w: number; d: number;
  floors: number; wall: number; upper: number; roof: number;
  kind: string; name: string; doorX: number; doorZ: number;
}
const WIN_GLOW: V = [];           /* window quads, redrawn as glow at night */
const WORLD_LIGHTS: LightAnchor[] = [];
const BUILDINGS: BDef[] = [];

function xform(dst: V, src: V, x: number, y: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < src.length; i += 11) {
    const px = src[i], py = src[i + 1], pz = src[i + 2];
    dst.push(
      x + px * c - pz * s, y + py, z + px * s + pz * c,
      src[i + 3] * c - src[i + 5] * s, src[i + 4], src[i + 3] * s + src[i + 5] * c,
      src[i + 6], src[i + 7], src[i + 8], src[i + 9], src[i + 10],
    );
  }
}

/* one house, local space: front faces +z, ground at y=0 */
function buildHouse(local: V, glow: V, b: Omit<BDef, "x" | "z" | "yaw" | "baseY" | "doorX" | "doorZ">) {
  const W: Col3 = [1, 1, 1];
  const hw = b.w / 2, hd = b.d / 2;
  box(local, 0, -0.3, 0, hw + 0.3, 0.8, hd + 0.3, [0.92, 0.92, 0.92], T.STONE_DARK);
  box(local, 0, 0.5 + 1.6, 0, hw, 1.6, hd, W, b.wall);
  const doorW = 1.35, doorH = 2.35;
  quad(local, [-doorW / 2, 0.5, hd + 0.04], [doorW / 2, 0.5, hd + 0.04], doorH, W, T.DOOR);
  flat(local, 0.52, -doorW / 2 - 0.3, hd + 0.05, doorW / 2 + 0.3, hd + 0.85, [0.9, 0.9, 0.9], T.STONE_DARK);
  const win = (cx: number, cy: number, cz: number, ry: number) => {
    const t: V = [];
    quad(t, [-0.48, 0, 0], [0.48, 0, 0], 1.3, W, T.WINDOW);
    xform(local, t, cx, cy, cz, ry);
    const g2: V = [];
    quad(g2, [-0.48, 0, 0], [0.48, 0, 0], 1.3, W, T.WINDOW);
    xform(glow, g2, cx, cy, cz, ry);
  };
  win(-hw + 1.15, 1.55, hd + 0.045, 0);
  win(hw - 1.15, 1.55, hd + 0.045, 0);
  win(hw + 0.045, 1.55, 0, Math.PI / 2);
  win(-hw - 0.045, 1.55, 0, -Math.PI / 2);
  let topY = 0.5 + 3.2;
  if (b.floors === 2) {
    box(local, 0, topY + 0.14, 0, hw + 0.30, 0.14, hd + 0.30, [0.85, 0.8, 0.75], T.PLANK_H);
    box(local, 0, topY + 0.28 + 1.35, 0, hw + 0.24, 1.35, hd + 0.24, W, b.upper);
    win(-hw + 1.05, topY + 1.15, hd + 0.285, 0);
    win(hw - 1.05, topY + 1.15, hd + 0.285, 0);
    win(0, topY + 1.15, -hd - 0.285, Math.PI);
    topY += 0.28 + 2.7;
  }
  gable(local, 0, topY + 0.02, 0, b.w + 1.5 + (b.floors === 2 ? 0.5 : 0), b.d + 1.5, 2.1 + b.w * 0.10, 0, W, b.roof, b.floors === 2 ? b.upper : b.wall);
  box(local, hw * 0.45, topY + 1.55, 0, 0.34, 1.15, 0.34, [0.95, 0.95, 0.95], T.STONE_DARK);
}

const SERVICE_ART: Record<string, { npc: number; keeper: string; emblem: number }> = {
  tavern: { npc: SPR.INNKEEP, keeper: "the innkeeper", emblem: T.EMB_TANKARD },
  shop: { npc: SPR.MERCHANT, keeper: "the merchant", emblem: T.EMB_COIN },
  guildf: { npc: SPR.GUILD, keeper: "the guildmaster", emblem: T.EMB_SWORD },
  guildm: { npc: SPR.COVEN, keeper: "the covenmaster", emblem: T.EMB_MOON },
  temple: { npc: SPR.PRIEST, keeper: "the priest", emblem: T.EMB_FLAME },
};
const SERVICE_NAMES: Record<string, Record<string, string>> = {
  tavern: { Thornwick: "The Gilded Boar", Millbrook: "The Miller's Rest", "Cairn Ford": "The Ford & Flagon" },
  shop: { Thornwick: "Provisions & Sundries", Millbrook: "Millbrook Goods", "Cairn Ford": "Ford Trading" },
  guildf: { Thornwick: "Hall of the Hearthguard", Millbrook: "Hearthguard Lodge", "Cairn Ford": "Hearthguard Post" },
  guildm: { Thornwick: "House of the Umbral Covenant", Millbrook: "Umbral Cottage", "Cairn Ford": "Umbral Shrine" },
  temple: { Thornwick: "Temple of the Listening God", Millbrook: "Chapel of the Listening God", "Cairn Ford": "Shrine of the Listening God" },
};
const KEEPERS: Record<string, string[]> = {
  tavern: ["Berta", "Hob", "Sella"],
  shop: ["Marcus", "Tilda", "Oren"],
  guildf: ["Captain Yrsa", "Ser Brandt", "Ser Kol"],
  guildm: ["Mother Vael", "Brother Odo", "Sister Mirel"],
  temple: ["Father Anselm", "Mother Rue", "Father Cato"],
};

function buildTowns() {
  const local: V = [], glowLocal: V = [];
  for (let ti = 0; ti < TOWNS.length; ti++) {
    const t = TOWNS[ti];
    const services = ["tavern", "shop", "guildf", "guildm", "temple"];
    const nHouses = ti === 0 ? 8 : 5;
    const total = services.length + nHouses;
    for (let i = 0; i < total; i++) {
      const ang = (i / total) * Math.PI * 2 + ti * 0.7;
      const rad = i < services.length ? t.r * 0.52 : t.r * (0.78 + (i % 3) * 0.06);
      const x = t.x + Math.cos(ang) * rad, z = t.z + Math.sin(ang) * rad;
      const yaw = Math.atan2(x - t.x, t.z - z);
      const kind = i < services.length ? services[i] : "house";
      const grand = kind === "temple" || kind === "guildf";
      const b: BDef = {
        x, z, yaw, baseY: Math.max(5.4, wyHeight(x, z)),
        w: grand ? 11 : 6.5 + vrnd() * 3.5,
        d: grand ? 10 : 6 + vrnd() * 3,
        floors: kind === "house" ? (vrnd() < 0.45 ? 1 : 2) : 2,
        wall: kind === "temple" ? T.MARBLE : kind === "guildf" || kind === "guildm" ? T.STONE : vrnd() < 0.5 ? T.TIMBER : T.STONE,
        upper: kind === "temple" ? T.MARBLE : T.TIMBER,
        roof: kind === "temple" ? T.SHINGLE : vrnd() < 0.4 ? T.THATCH : vrnd() < 0.5 ? T.ROOF_WOOD : T.SHINGLE,
        kind,
        name: kind === "house" ? "A barred house" : SERVICE_NAMES[kind][t.name],
        doorX: 0, doorZ: 0,
      };
      const c = Math.cos(yaw), s = Math.sin(yaw);
      b.doorX = x + (0 * c - (b.d / 2 + 1.1) * s) * -1;
      b.doorZ = z + (0 * s + (b.d / 2 + 1.1) * c) * -1;
      /* door stands on the front (+z local): world = R(yaw)·(0, d/2+1.1) + pos, R: (lx,lz)->(lx·c − lz·s, lx·s + lz·c) with the house's own convention */
      b.doorX = x + (0 * c - (b.d / 2 + 1.1) * s);
      b.doorZ = z + (0 * s + (b.d / 2 + 1.1) * c);
      BUILDINGS.push(b);
      local.length = 0; glowLocal.length = 0;
      buildHouse(local, glowLocal, b);
      if (kind === "guildf" || kind === "guildm") {
        const bt: V = [];
        quad(bt, [-0.55, 0, 0], [0.55, 0, 0], 1.9, [1, 1, 1], kind === "guildf" ? T.BANNER_G : T.BANNER_M);
        xform(local, bt, -b.w / 2 + 1.1, 4.6, b.d / 2 + 0.32, 0);
        const bt2: V = [];
        quad(bt2, [-0.55, 0, 0], [0.55, 0, 0], 1.9, [1, 1, 1], kind === "guildf" ? T.BANNER_G : T.BANNER_M);
        xform(local, bt2, b.w / 2 - 1.1, 4.6, b.d / 2 + 0.32, 0);
      }
      return2(local, glowLocal, b);
    }
    /* plaza: well, lamps, a market stall or two in the capital */
    const wellL: V = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(wellL, Math.cos(a) * 1.25, 0.45, Math.sin(a) * 1.25, 0.42, 0.45, 0.42, [0.95, 0.95, 0.95], T.STONE);
    }
    box(wellL, -1.5, 1.5, 0, 0.12, 1.5, 0.12, [1, 1, 1], T.PLANK_V);
    box(wellL, 1.5, 1.5, 0, 0.12, 1.5, 0.12, [1, 1, 1], T.PLANK_V);
    gable(wellL, 0, 2.9, 0, 3.6, 2.2, 0.8, Math.PI / 2, [1, 1, 1], T.ROOF_WOOD, T.PLANK_V);
    xform(WORLD_STATIC, wellL, t.x + 6, 6, t.z + 4, 0.4);
    for (let li = 0; li < 4; li++) {
      const a = li * Math.PI / 2 + 0.78;
      const lx = t.x + Math.cos(a) * t.r * 0.34, lz = t.z + Math.sin(a) * t.r * 0.34;
      const lampL: V = [];
      box(lampL, 0, 1.55, 0, 0.11, 1.55, 0.11, [0.7, 0.65, 0.6], T.PLANK_V);
      box(lampL, 0, 3.25, 0, 0.30, 0.30, 0.30, [1.2, 1.05, 0.6], T.WINDOW);
      xform(WORLD_STATIC, lampL, lx, 6, lz, a);
      WORLD_LIGHTS.push({ x: lx, y: 9.3, z: lz, range: 21, col: [1.0, 0.72, 0.34], flicker: false });
    }
    if (ti === 0) {
      for (let si = 0; si < 3; si++) {
        const sx = t.x - 16 + si * 13, sz = t.z + 20;
        const st: V = [];
        for (const [px, pz] of [[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]]) box(st, px, 1.1, pz, 0.09, 1.1, 0.09, [1, 1, 1], T.PLANK_V);
        box(st, 0, 1.05, 0, 2.5, 0.09, 1.7, [1, 1, 1], T.PLANK_H);
        box(st, -1.2, 0.55, 0.4, 0.55, 0.55, 0.55, [1, 1, 1], T.BARREL);
        box(st, 1.1, 0.45, -0.3, 0.5, 0.45, 0.5, [0.95, 0.9, 0.8], T.CHEST);
        box(st, 0.2, 0.35, 0.9, 0.42, 0.35, 0.42, [1.1, 0.9, 0.6], T.HAY);
        const awn: V = [];
        quad(awn, [-2.7, 2.9, 2.1], [2.7, 2.9, 2.1], 0.12, [1, 1, 1], T.PLANK_H);
        tri(awn, [-2.7, 2.9, 2.1], [2.7, 2.9, 2.1], [-2.7, 2.25, -1.9], [0, 0.5, 0.86], [1, 1, 1], si % 2 ? T.BED : T.PLANK_H);
        tri(awn, [2.7, 2.9, 2.1], [2.7, 2.25, -1.9], [-2.7, 2.25, -1.9], [0, 0.5, 0.86], [1, 1, 1], si % 2 ? T.BED : T.PLANK_H);
        st.push(...awn);
        xform(WORLD_STATIC, st, sx, 6, sz, si * 0.5 - 0.4);
      }
    }
    /* service signs */
    for (const b of BUILDINGS) {
      if (b.kind === "house" || Math.hypot(b.x - t.x, b.z - t.z) > t.r) continue;
      const art = SERVICE_ART[b.kind];
      const sg: V = [];
      box(sg, 0, 1.1, 0, 0.09, 1.1, 0.09, [1, 1, 1], T.PLANK_V);
      quad(sg, [-0.5, 1.55, 0.1], [0.5, 1.55, 0.1], 1.0, [1, 1, 1], art.emblem);
      quad(sg, [0.5, 1.55, 0.13], [-0.5, 1.55, 0.13], 1.0, [1, 1, 1], T.SIGN);
      const sy = Math.atan2(b.doorX - b.x, b.doorZ - b.z);
      void sy;
      xform(WORLD_STATIC, sg, b.doorX, b.baseY, b.doorZ, b.yaw);
    }
  }
  function return2(local: V, glow: V, b: BDef) {
    xform(WORLD_STATIC, local, b.x, b.baseY, b.z, b.yaw);
    xform(WIN_GLOW, glow, b.x, b.baseY, b.z, b.yaw);
  }
}

const WORLD_STATIC: V = [];
const WORLD_CUTOUT: V = [];

function buildTerrain() {
  const N = 148, EXT = WORLD_R;
  const H: number[][] = [];
  for (let j = 0; j <= N; j++) {
    H.push([]);
    for (let i = 0; i <= N; i++) H[j].push(wyHeight(-EXT + (i / N) * EXT * 2, -EXT + (j / N) * EXT * 2));
  }
  const out: V = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x0 = -EXT + (i / N) * EXT * 2, x1 = -EXT + ((i + 1) / N) * EXT * 2;
    const z0 = -EXT + (j / N) * EXT * 2, z1 = -EXT + ((j + 1) / N) * EXT * 2;
    const h00 = H[j][i], h10 = H[j][i + 1], h01 = H[j + 1][i], h11 = H[j + 1][i + 1];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ch = (h00 + h10 + h01 + h11) / 4;
    const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / (x1 - x0);
    let tile: number = T.GRASS;
    const rd = roadDist(cx, cz);
    if (ch < 0.7) tile = T.SAND;
    else if (slope > 0.85) tile = T.CLIFF;
    else if (slope > 0.42) tile = T.ROCK;
    else if (fbm(cx * 0.01 + 51, cz * 0.01 + 3) > 0.58) tile = T.GRASS_DRY;
    else if (fbm(cx * 0.008 + 91, cz * 0.008 + 47) > 0.62) tile = T.LEAFGROUND;
    if (rd < 4.6 && ch >= 0.7) tile = T.DIRT;
    const jit = 0.92 + hash2(i * 3.1, j * 7.7) * 0.16;
    const tint: Col3 = [jit, jit, jit];
    const nrm = (): Col3 => {
      const nx = (h00 + h01 - h10 - h11) / (x1 - x0), nz = (h00 + h10 - h01 - h11) / (z1 - z0);
      const v: Col3 = [nx * 0.5, 1, nz * 0.5];
      const L = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / L, v[1] / L, v[2] / L];
    };
    const n = nrm();
    tri(out, [x0, h00, z0], [x1, h10, z0], [x0, h01, z1], n, tint, tile);
    tri(out, [x1, h10, z0], [x1, h11, z1], [x0, h01, z1], n, tint, tile);
  }
  /* town discs — a grid of setts with honest wear, never one stretched skin */
  for (const t of TOWNS) {
    const half = t.r * 0.92, cells = 20, step = (half * 2) / cells;
    for (let gj = 0; gj < cells; gj++) for (let gi = 0; gi < cells; gi++) {
      const gx = t.x - half + gi * step, gz = t.z - half + gj * step;
      if (Math.hypot(gx + step / 2 - t.x, gz + step / 2 - t.z) > half) continue;
      const worn = hash2(gi * 3.7 + t.x, gj * 9.1 + t.z);
      const jt = 0.94 + worn * 0.1;
      flat(out, 6.04, gx, gz, gx + step, gz + step, [jt, jt * 0.98, jt * 0.94], worn > 0.93 ? T.DIRT : T.COBBLE);
    }
  }
  /* road ribbons */
  for (const [ax, az, bx, bz] of ROAD_SEGS) {
    const L = Math.hypot(bx - ax, bz - az), steps = Math.floor(L / 11);
    const px = -(bz - az) / L, pz = (bx - ax) / L;
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      const t0 = sIdx / steps, t1 = (sIdx + 1) / steps;
      const cx0 = lerp(ax, bx, t0), cz0 = lerp(az, bz, t0), cx1 = lerp(ax, bx, t1), cz1 = lerp(az, bz, t1);
      const w = 3.4;
      const p1: [number, number, number] = [cx0 + px * w, wyHeight(cx0 + px * w, cz0 + pz * w) + 0.07, cz0 + pz * w];
      const p2: [number, number, number] = [cx0 - px * w, wyHeight(cx0 - px * w, cz0 - pz * w) + 0.07, cz0 - pz * w];
      const p3: [number, number, number] = [cx1 + px * w, wyHeight(cx1 + px * w, cz1 + pz * w) + 0.07, cz1 + pz * w];
      const p4: [number, number, number] = [cx1 - px * w, wyHeight(cx1 - px * w, cz1 - pz * w) + 0.07, cz1 - pz * w];
      tri(out, p1, p2, p3, [0, 1, 0], [1, 1, 1], T.ROAD);
      tri(out, p2, p4, p3, [0, 1, 0], [1, 1, 1], T.ROAD);
    }
  }
  /* Millbrook fields */
  const fields: Array<[number, number, number, number, number]> = [
    [-460, 190, 52, 34, 0.3], [-300, 320, 44, 30, -0.2], [370, 420, 48, 30, 0.9], [500, 250, 40, 28, 0.1],
  ];
  for (const [fx, fz, fw, fd, fy] of fields) {
    const t2: V = [];
    flat(t2, 0, -fw / 2, -fd / 2, fw / 2, fd / 2, [1.02, 1.0, 0.9], T.GRASS_DRY);
    const y = wyHeight(fx, fz);
    xform(out, t2, fx, y + 0.09, fz, fy);
  }
  for (let i = 0; i < out.length; i += 65536) WORLD_STATIC.push(...out.slice(i, i + 65536));
}

function buildDressing() {
  const S = WORLD_STATIC, C = WORLD_CUTOUT;
  const clear = (x: number, z: number, r: number) => {
    if (roadDist(x, z) < r + 4) return false;
    for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.r + 18) return false;
    return true;
  };
  /* trees — trunk and a crown of crossed foliage */
  for (let i = 0; i < 460; i++) {
    const x = (vrnd() * 2 - 1) * 830, z = (vrnd() * 2 - 1) * 830;
    const h = wyHeight(x, z);
    if (h < 1.2 || h > 78 || !clear(x, z, 3)) continue;
    const pine = h > 30 || vrnd() < 0.3;
    const th = pine ? 3.6 + vrnd() * 1.6 : 2.4 + vrnd() * 1.2;
    box(S, x, h + th / 2 - 0.2, z, 0.26, th / 2, 0.26, [0.9, 0.85, 0.8], T.BARK);
    const cw = pine ? 3.4 + vrnd() * 1.2 : 5.2 + vrnd() * 2.2;
    const chh = pine ? 5.5 + vrnd() * 2 : 4.2 + vrnd() * 1.6;
    const tint: Col3 = pine ? [0.55, 0.75, 0.5] : [0.95 + vrnd() * 0.2, 1, 0.9];
    for (let k = 0; k < 3; k++) {
      const t2: V = [];
      quad(t2, [-cw / 2, 0, 0], [cw / 2, 0, 0], chh, tint, T.FOLIAGE);
      quad(t2, [cw / 2, 0, 0], [-cw / 2, 0, 0], chh, tint, T.FOLIAGE);
      xform(C, t2, x, h + th - 0.4, z, (k * Math.PI) / 3 + vrnd() * 0.4);
    }
  }
  /* bushes, rocks, grass */
  for (let i = 0; i < 240; i++) {
    const x = (vrnd() * 2 - 1) * 830, z = (vrnd() * 2 - 1) * 830;
    const h = wyHeight(x, z);
    if (h < 0.9 || !clear(x, z, 2)) continue;
    const t2: V = [];
    const w = 1.6 + vrnd() * 1.6;
    quad(t2, [-w / 2, 0, 0], [w / 2, 0, 0], w * 0.72, [0.9, 0.95, 0.85], T.FOLIAGE);
    quad(t2, [w / 2, 0, 0], [-w / 2, 0, 0], w * 0.72, [0.9, 0.95, 0.85], T.FOLIAGE);
    xform(C, t2, x, h - 0.05, z, vrnd() * 3);
  }
  for (let i = 0; i < 170; i++) {
    const x = (vrnd() * 2 - 1) * 840, z = (vrnd() * 2 - 1) * 840;
    const h = wyHeight(x, z);
    if (h < 0.4 || !clear(x, z, 2)) continue;
    const sc = 0.5 + vrnd() * 2.1;
    boxR(S, x, h + sc * 0.2, z, sc, sc * 0.62, sc * 0.8, vrnd() * 3, [0.95, 0.93, 0.9], vrnd() < 0.3 ? T.MOSSY : T.ROCK);
  }
  for (let i = 0; i < 950; i++) {
    const nearTown = vrnd() < 0.4;
    const t = TOWNS[(vrnd() * 3) | 0];
    const x = nearTown ? t.x + (vrnd() * 2 - 1) * (t.r + 60) : (vrnd() * 2 - 1) * 800;
    const z = nearTown ? t.z + (vrnd() * 2 - 1) * (t.r + 60) : (vrnd() * 2 - 1) * 800;
    const h = wyHeight(x, z);
    if (h < 0.8 || roadDist(x, z) < 3.4) continue;
    const t2: V = [];
    const tile = vrnd() < 0.16 ? T.FLOWERS : T.TUFT;
    const w = 1.1 + vrnd() * 0.9;
    quad(t2, [-w / 2, 0, 0], [w / 2, 0, 0], w * 0.8, [1, 1, 1], tile);
    quad(t2, [w / 2, 0, 0], [-w / 2, 0, 0], w * 0.8, [1, 1, 1], tile);
    xform(C, t2, x, h - 0.03, z, vrnd() * 3);
    const t3: V = [];
    quad(t3, [0, 0, -w / 2], [0, 0, w / 2], w * 0.8, [1, 1, 1], tile);
    quad(t3, [0, 0, w / 2], [0, 0, -w / 2], w * 0.8, [1, 1, 1], tile);
    xform(C, t3, x, h - 0.03, z, 0);
  }
  /* roadside fences near the towns */
  for (const [ax, az, bx, bz] of ROAD_SEGS) {
    const L = Math.hypot(bx - ax, bz - az);
    const px = -(bz - az) / L, pz = (bx - ax) / L;
    for (let d = 14; d < L - 10; d += 4.2) {
      const t = d / L, cx = lerp(ax, bx, t), cz = lerp(az, bz, t);
      const nearT = TOWNS.some((tw) => Math.hypot(cx - tw.x, cz - tw.z) < tw.r + 95);
      if (!nearT || vrnd() < 0.3) continue;
      for (const side of [-1, 1]) {
        const fx = cx + px * 5.6 * side, fz = cz + pz * 5.6 * side;
        const fy = wyHeight(fx, fz);
        if (fy < 0.7) continue;
        box(S, fx, fy + 0.55, fz, 0.09, 0.55, 0.09, [0.9, 0.85, 0.8], T.PLANK_V);
      }
    }
  }
  /* ruins and the standing stones */
  const ruin = (rx: number, rz: number, ry: number) => {
    const t2: V = [];
    quad(t2, [-4, 0, 0], [1, 0, 0], 2.6, [0.9, 0.9, 0.88], T.MOSSY);
    quad(t2, [2.4, 0, 0], [4.4, 0, 0], 1.4, [0.9, 0.9, 0.88], T.MOSSY);
    quad(t2, [-4, 0, 0], [-4, 0, 4], 1.8, [0.9, 0.9, 0.88], T.STONE_DARK);
    box(t2, 0.5, 0.4, 2.5, 0.5, 0.4, 1.6, [0.9, 0.9, 0.88], T.STONE_DARK);
    box(t2, -1.8, 0.35, 1.2, 1.1, 0.35, 0.5, [0.88, 0.88, 0.86], T.MOSSY);
    xform(S, t2, rx, wyHeight(rx, rz), rz, ry);
  };
  ruin(300, -30, 0.7); ruin(-240, -330, 2.1); ruin(120, 420, 1.2);
  for (const dg of DUNGEONS) ruin(dg.x + 26, dg.z + 14, vrnd() * 3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sx = 302 + Math.cos(a) * 11, sz = -32 + Math.sin(a) * 11;
    boxR(S, sx, wyHeight(sx, sz) + 1.5, sz, 0.55, 1.6 + (i % 3) * 0.3, 0.4, a + 0.3, [0.92, 0.92, 0.9], T.ROCK);
  }
  /* dungeon mouths: a stone throat in the hillside, torches at the door */
  for (const dg of DUNGEONS) {
    const y = wyHeight(dg.x, dg.z);
    const t2: V = [];
    box(t2, 0, 1.9, 0, 2.6, 1.9, 0.6, [0.95, 0.95, 0.95], T.STONE_DARK);
    quad(t2, [-1.05, 0, 0.62], [1.05, 0, 0.62], 2.6, [1, 1, 1], dg.kind === "undead" ? T.PORTCULLIS : T.BRICK);
    box(t2, -2.2, 1.0, 0.8, 0.16, 1.0, 0.16, [0.9, 0.85, 0.8], T.PLANK_V);
    box(t2, 2.2, 1.0, 0.8, 0.16, 1.0, 0.16, [0.9, 0.85, 0.8], T.PLANK_V);
    const yawTo = Math.atan2(dg.x - TOWNS[0].x, TOWNS[0].z - dg.z);
    xform(S, t2, dg.x, y, dg.z, yawTo);
    const R2 = (lx: number, lz: number): [number, number] => [dg.x + lx * Math.cos(yawTo) - lz * Math.sin(yawTo), dg.z + lx * Math.sin(yawTo) + lz * Math.cos(yawTo)];
    const [t1x, t1z] = R2(-2.2, 0.8), [t2x, t2z] = R2(2.2, 0.8);
    WORLD_LIGHTS.push({ x: t1x, y: y + 2.2, z: t1z, range: 11, col: [1.0, 0.62, 0.25], flicker: true });
    WORLD_LIGHTS.push({ x: t2x, y: y + 2.2, z: t2z, range: 11, col: [1.0, 0.62, 0.25], flicker: true });
  }
  /* the graveyard by Thornwick's temple */
  const temple = BUILDINGS.find((b) => b.kind === "temple");
  if (temple) {
    for (let i = 0; i < 12; i++) {
      const gx = temple.x + 14 + (i % 4) * 2.6, gz = temple.z + ((i / 4) | 0) * 3 - 3;
      boxR(S, gx, 6.35, gz, 0.34, 0.5, 0.1, (hash2(i, 3) - 0.5) * 0.3, [0.9, 0.9, 0.88], T.STONE_DARK);
    }
  }
}

/* ————————————————— interiors & under-places ————————————————— */
interface NpcDef { name: string; sprite: number; role: string; x: number; z: number; yaw: number; home?: BDef; town?: string }
interface Flame { x: number; y: number; z: number; s: number }
interface InteriorScene { geo: V; npcs: NpcDef[]; lights: LightAnchor[]; flames: Flame[] }

function buildInterior(b: BDef): InteriorScene {
  const a: V = [];
  const W: Col3 = [1, 1, 1];
  const floorTile = b.kind === "temple" ? T.MARBLE : b.kind === "guildf" ? T.FLAG : T.PLANK_H;
  const wallTile = b.kind === "temple" ? T.STONE : b.kind === "guildf" || b.kind === "guildm" ? T.STONE_DARK : T.TIMBER;
  flat(a, 0, -6, -5, 6, 5, W, floorTile);
  flat(a, 3.4, -6, -5, 6, 5, [0.5, 0.45, 0.4], T.PLANK_H, false);
  quad(a, [-6, 0, -5], [6, 0, -5], 3.4, W, wallTile);
  quad(a, [6, 0, 5], [-6, 0, 5], 3.4, W, wallTile);
  quad(a, [-6, 0, 5], [-6, 0, -5], 3.4, W, wallTile);
  quad(a, [6, 0, -5], [6, 0, 5], 3.4, W, wallTile);
  quad(a, [0.68, 0, 4.94], [-0.68, 0, 4.94], 2.35, W, T.DOOR);
  for (const bx of [-3.6, 0, 3.6]) box(a, bx, 3.28, 0, 0.22, 0.14, 5, [0.8, 0.75, 0.7], T.PLANK_V);
  const lights: LightAnchor[] = [{ x: 0, y: 2.7, z: 0.5, range: 17, col: [1.0, 0.78, 0.5], flicker: false }];
  const flames: Flame[] = [];
  const npcs: NpcDef[] = [];
  const art = SERVICE_ART[b.kind];
  const ti = TOWNS.findIndex((t) => t.name === (b.name && Object.values(SERVICE_NAMES).some((m) => m[t.name] === b.name) ? t.name : ""));
  void ti;
  const keeperName = (KEEPERS[b.kind] || ["The keeper"])[TOWNS.findIndex((t) => Math.hypot(b.x - t.x, b.z - t.z) < t.r + 30)] || "The keeper";
  npcs.push({ name: keeperName, sprite: art.npc, role: "keeper", x: -0.8, z: -2.6, yaw: 0.2, home: b });
  const table = (tx: number, tz: number) => {
    box(a, tx, 0.78, tz, 0.95, 0.07, 0.6, W, T.TABLE);
    box(a, tx, 0.38, tz, 0.09, 0.38, 0.09, W, T.PLANK_V);
    box(a, tx - 1.25, 0.42, tz, 0.55, 0.09, 0.24, [0.9, 0.85, 0.8], T.PLANK_H);
    box(a, tx + 1.25, 0.42, tz, 0.55, 0.09, 0.24, [0.9, 0.85, 0.8], T.PLANK_H);
  };
  if (b.kind === "tavern") {
    box(a, 0, 0.8, -4.55, 1.25, 0.8, 0.42, W, T.STONE);
    box(a, 0, 0.95, -4.2, 0.8, 0.5, 0.1, [0.16, 0.1, 0.06], T.BRICK);
    box(a, 0, 1.85, -4.6, 0.5, 0.3, 0.35, W, T.STONE_DARK);
    flames.push({ x: 0, y: 0.55, z: -4.15, s: 1.15 });
    lights.push({ x: 0, y: 1.4, z: -3.9, range: 14, col: [1.0, 0.6, 0.24], flicker: true });
    table(-3.2, 0.6); table(2.8, 1.4); table(0.4, -0.6);
    box(a, 4.9, 0.55, -3.4, 0.5, 0.55, 0.5, W, T.BARREL);
    box(a, 4.9, 1.6, -3.4, 0.45, 0.5, 0.45, W, T.BARREL);
    box(a, -5.2, 0.9, 3.6, 0.75, 0.9, 1.9, W, T.BED);
    npcs.push({ name: "A travelling pedlar", sprite: SPR.TOWNS_A, role: "patron", x: 2.8, z: 0.4, yaw: 2.6, home: b });
  } else if (b.kind === "shop") {
    box(a, 0, 0.95, -1.6, 3.1, 0.1, 0.55, W, T.PLANK_H);
    box(a, 0, 0.45, -1.6, 3.1, 0.45, 0.5, [0.92, 0.9, 0.85], T.PLANK_V);
    for (const sx of [-5.9, 5.9]) {
      const sh: V = [];
      quad(sh, [-1.9, 0, 0], [1.9, 0, 0], 1.7, W, T.BOOKS);
      xform(a, sh, sx > 0 ? 5.94 : -5.94, 1.0, -1, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    box(a, -4.6, 0.5, 2.8, 0.6, 0.5, 0.6, W, T.CHEST);
    box(a, 4.4, 0.45, 3.4, 0.55, 0.45, 0.55, W, T.BARREL);
    box(a, 3.4, 0.4, 3.6, 0.5, 0.4, 0.5, [1.05, 0.95, 0.7], T.HAY);
    npcs[0].x = 0.9; npcs[0].z = -2.9;
  } else if (b.kind === "guildf") {
    const bn: V = [];
    quad(bn, [-1.1, 0, 0], [1.1, 0, 0], 2.1, W, T.BANNER_G);
    xform(a, bn, 0, 1.1, -4.94, 0);
    table(0, 0.8);
    box(a, -4.8, 1.0, -4.2, 1.1, 1.0, 0.25, [0.9, 0.88, 0.84], T.PLANK_V);
    const em: V = [];
    quad(em, [-0.6, 0, 0], [0.6, 0, 0], 1.2, W, T.EMB_SWORD);
    xform(a, em, -4.8, 0.9, -3.9, 0);
    flames.push({ x: -3.4, y: 1.15, z: -4.3, s: 0.6 }, { x: 3.4, y: 1.15, z: -4.3, s: 0.6 });
    lights.push({ x: 0, y: 1.6, z: -4.0, range: 11, col: [1.0, 0.62, 0.25], flicker: true });
  } else if (b.kind === "guildm") {
    const bn: V = [];
    quad(bn, [-1.1, 0, 0], [1.1, 0, 0], 2.1, W, T.BANNER_M);
    xform(a, bn, 0, 1.1, -4.94, 0);
    table(0, -0.8);
    const bk: V = [];
    quad(bk, [-1.9, 0, 0], [1.9, 0, 0], 1.7, W, T.BOOKS);
    xform(a, bk, -5.94, 1.0, 0.5, -Math.PI / 2);
    flames.push({ x: -0.5, y: 0.9, z: -0.8, s: 0.42 }, { x: 0.5, y: 0.9, z: -0.8, s: 0.42 });
    lights.push({ x: 0, y: 1.4, z: -0.8, range: 9, col: [0.75, 0.6, 1.0], flicker: true });
    npcs[0].z = -3.1;
  } else if (b.kind === "temple") {
    box(a, 0, 0.65, -3.9, 1.5, 0.65, 0.55, W, T.ALTAR);
    for (const px of [-4.4, 4.4]) box(a, px, 1.7, -3.4, 0.42, 1.7, 0.42, W, T.MARBLE);
    for (const rz of [-0.6, 1.2]) {
      box(a, -2.2, 0.4, rz, 1.15, 0.08, 0.3, [0.92, 0.9, 0.86], T.PLANK_H);
      box(a, 2.2, 0.4, rz, 1.15, 0.08, 0.3, [0.92, 0.9, 0.86], T.PLANK_H);
    }
    flames.push({ x: -1.1, y: 1.35, z: -3.9, s: 0.5 }, { x: 1.1, y: 1.35, z: -3.9, s: 0.5 });
    lights.push({ x: 0, y: 1.8, z: -3.6, range: 12, col: [1.0, 0.8, 0.45], flicker: true });
    npcs[0].x = 1.6; npcs[0].z = -2.9;
  }
  return { geo: a, npcs, lights, flames };
}

interface DungScene {
  name: string; kind: string; geo: V; lights: LightAnchor[]; flames: Flame[];
  chests: Array<{ x: number; z: number; opened: boolean; gold: number; quest: boolean }>;
  spawns: Array<{ x: number; z: number; kind: FoeKind; boss: boolean }>;
  startX: number; startZ: number; cells: Set<string>;
}
type FoeKind = "wolf" | "rat" | "skeleton" | "bandit" | "cultist";
const FOES: Record<FoeKind, { name: string; sprite: number; w: number; h: number; hp: number; dmg: number; spd: number; reach: number }> = {
  wolf: { name: "Wolf", sprite: SPR.WOLF, w: 1.6, h: 1.1, hp: 26, dmg: 7, spd: 3.5, reach: 1.5 },
  rat: { name: "Barrow-rat", sprite: SPR.RAT, w: 1.0, h: 0.6, hp: 12, dmg: 4, spd: 3.1, reach: 1.1 },
  skeleton: { name: "Skeleton", sprite: SPR.SKELETON, w: 1.15, h: 2.0, hp: 34, dmg: 9, spd: 2.3, reach: 1.7 },
  bandit: { name: "Bandit", sprite: SPR.BANDIT, w: 1.15, h: 2.0, hp: 30, dmg: 8, spd: 2.7, reach: 1.7 },
  cultist: { name: "Cultist", sprite: SPR.CULTIST, w: 1.15, h: 2.0, hp: 24, dmg: 10, spd: 2.4, reach: 1.7 },
};
function buildDungeon(di: number): DungScene {
  const def = DUNGEONS[di];
  const rnd = mulberry32(0xd06 + di * 977);
  const GW = 11, CS = 9;
  const cells = new Set<string>();
  const key = (i: number, j: number) => `${i},${j}`;
  let ci = 5, cj = 5;
  cells.add(key(ci, cj));
  const rooms: Array<[number, number]> = [[ci, cj]];
  for (let s = 0; s < 90 && cells.size < 34; s++) {
    const dir = (rnd() * 4) | 0;
    ci = clamp(ci + [1, -1, 0, 0][dir], 1, GW - 2);
    cj = clamp(cj + [0, 0, 1, -1][dir], 1, GW - 2);
    if (!cells.has(key(ci, cj))) { cells.add(key(ci, cj)); rooms.push([ci, cj]); }
  }
  const wx = (i: number) => (i - 5) * CS, wz = (j: number) => (j - 5) * CS;
  const a: V = [];
  const W: Col3 = [1, 1, 1];
  const wallAt = (i: number, j: number, side: number) => {
    const x = wx(i), z = wz(j), h = CS / 2;
    const tile = rnd() < 0.24 ? T.MOSSY : T.BRICK;
    const tint: Col3 = [0.92 + rnd() * 0.14, 0.92 + rnd() * 0.1, 0.9 + rnd() * 0.1];
    if (side === 0) quad(a, [x - h, 0, z - h], [x + h, 0, z - h], 3.3, tint, tile);
    if (side === 1) quad(a, [x + h, 0, z + h], [x - h, 0, z + h], 3.3, tint, tile);
    if (side === 2) quad(a, [x - h, 0, z + h], [x - h, 0, z - h], 3.3, tint, tile);
    if (side === 3) quad(a, [x + h, 0, z - h], [x + h, 0, z + h], 3.3, tint, tile);
  };
  for (const k of cells) {
    const [i, j] = k.split(",").map(Number);
    const x = wx(i), z = wz(j), h = CS / 2;
    const jt = 0.9 + rnd() * 0.18;
    flat(a, 0, x - h, z - h, x + h, z + h, [jt, jt, jt], T.FLAG);
    flat(a, 3.3, x - h, z - h, x + h, z + h, [0.42, 0.4, 0.38], T.BRICK, false);
    if (!cells.has(key(i, j - 1))) wallAt(i, j, 0);
    if (!cells.has(key(i, j + 1))) wallAt(i, j, 1);
    if (!cells.has(key(i - 1, j))) wallAt(i, j, 2);
    if (!cells.has(key(i + 1, j))) wallAt(i, j, 3);
    if (rnd() < 0.3) decal(a, x + (rnd() * 4 - 2), 0.03, z + (rnd() * 4 - 2), 2.2, 1.6, rnd() * 3, T.ROCK, [0.5, 0.48, 0.45]);
  }
  quad(a, [wx(5) - 1.1, 0, wz(5) - CS / 2 + 0.1], [wx(5) + 1.1, 0, wz(5) - CS / 2 + 0.1], 2.7, W, T.PORTCULLIS);
  const dist = (r: [number, number]) => Math.abs(r[0] - 5) + Math.abs(r[1] - 5);
  const sorted = [...rooms].sort((p, q) => dist(q) - dist(p));
  const chests = sorted.slice(0, 3).map((r, idx) => ({ x: wx(r[0]), z: wz(r[1]), opened: false, gold: 25 + ((rnd() * 55) | 0), quest: idx === 0 }));
  for (const ch of chests) box(a, ch.x, 0.45, ch.z, 0.62, 0.45, 0.42, ch.quest ? [1.25, 1.1, 0.7] : W, T.CHEST);
  const flames: Flame[] = [];
  const lights: LightAnchor[] = [];
  rooms.forEach((r, idx) => {
    if (idx % 3 !== 1 && idx !== 0) return;
    const x = wx(r[0]), z = wz(r[1]);
    box(a, x + 3.4, 0.75, z + 3.4, 0.14, 0.75, 0.14, [0.85, 0.8, 0.75], T.PLANK_V);
    flames.push({ x: x + 3.4, y: 1.5, z: z + 3.4, s: 0.85 });
    lights.push({ x: x + 3.4, y: 2.1, z: z + 3.4, range: 14, col: [1.0, 0.6, 0.22], flicker: true });
  });
  const pool: FoeKind[] = def.kind === "undead" ? ["skeleton", "skeleton", "rat"] : def.kind === "vermin" ? ["rat", "rat", "wolf"] : ["cultist", "cultist", "skeleton"];
  const spawns: DungScene["spawns"] = [];
  rooms.forEach((r, idx) => {
    if (idx === 0) return;
    const n = idx === sorted.length - 1 ? 1 : (rnd() < 0.75 ? 1 : 2);
    for (let k = 0; k < n; k++) {
      spawns.push({ x: wx(r[0]) + (rnd() * 4 - 2), z: wz(r[1]) + (rnd() * 4 - 2), kind: pool[(rnd() * pool.length) | 0], boss: false });
    }
  });
  const bossCell = sorted[0];
  spawns.push({ x: wx(bossCell[0]), z: wz(bossCell[1]) - 2.2, kind: def.kind === "vermin" ? "wolf" : def.kind === "cult" ? "cultist" : "skeleton", boss: true });
  return { name: def.name, kind: def.kind, geo: a, lights, flames, chests, spawns, startX: wx(5), startZ: wz(5) + 2.5, cells };
}

/* ————————————————— the game's data ————————————————— */
interface Weapon { name: string; dmg: number; price: number }
const WEAPONS: Weapon[] = [
  { name: "Rusty Iron Sword", dmg: 6, price: 0 },
  { name: "Iron Sword", dmg: 9, price: 80 },
  { name: "Steel Sword", dmg: 13, price: 230 },
  { name: "Silver Sword", dmg: 17, price: 520 },
];
type SkillId = "blade" | "destruction" | "restoration" | "athletics" | "lockpicking" | "mercantile";
const SKILL_NAMES: Record<SkillId, string> = {
  blade: "Blade", destruction: "Destruction", restoration: "Restoration",
  athletics: "Athletics", lockpicking: "Lockpicking", mercantile: "Mercantile",
};
interface Sheet {
  name: string; cls: string; level: number;
  hp: number; mp: number; gold: number; weapon: number;
  skills: Record<SkillId, number>; gains: number;
  rep: Record<string, number>;
}
interface Quest {
  id: number; kind: "cull" | "fetch" | "deliver"; giver: string; faction: string;
  dungeon: number; target: number; done: number; reward: number; destName?: string; destKind?: string;
}
const CLASS_SPR: Record<string, number> = { Knight: SPR.KNIGHT, Ranger: SPR.RANGER, Sorcerer: SPR.SORCERER, Rogue: SPR.ROGUE };
const RUMOURS = [
  "They say the First King was buried with his sword still warm.",
  "Wolves grow bold on the Millbrook road after dark.",
  "The Covenant pays well and asks nothing. That is the worrying part.",
  "A fisher swears the Mere breathes on windless nights.",
  "The standing stones east of here hum when no one listens.",
  "Silver bites the dead harder than steel. Everyone knows it.",
  "Do not sleep in the Howling Deep. Do not even blink there.",
];
const GREET: Record<string, string[]> = {
  keeper: ["Well met, traveller.", "You look road-worn. Sit a while.", "News from the road? No? Then I will make some up."],
  patron: ["Mind the fire, it bites.", "I walked from Cairn Ford in two days. Two!", "Buy an honest drink and I will tell you a dishonest story."],
  guard: ["Move along, citizen.", "The roads are watched. Mostly.", "Report trouble to the Hearthguard."],
  wanderer: ["Fine weather for the road.", "Have you seen the stones east of Thornwick?", "I keep to the roads. Mostly."],
};
const TOWNSFOLK_NAMES = ["Aldric", "Berta", "Cato", "Dunna", "Elowen", "Fenn", "Gisla", "Hob", "Ilsa", "Joren"];

/* ————————————————— the game itself ————————————————— */
export function buildWyrdfall(body: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "os-wy-wrap";
  wrap.innerHTML = `
    <canvas class="os-wy-canvas"></canvas>
    <div class="os-wy-vig"></div>
    <div class="os-wy-hurt"></div>
    <div class="os-wy-hud" hidden>
      <div class="os-wy-bars">
        <div class="os-wy-bar hp"><i></i></div>
        <div class="os-wy-bar mp"><i></i></div>
        <div class="os-wy-bar st"><i></i></div>
      </div>
      <div class="os-wy-compass"><div class="os-wy-compstrip">N ···· NE ···· E ···· SE ···· S ···· SW ···· W ···· NW ···· N ···· NE ···· E ···· SE ···· S ···· SW ···· W ···· NW ····&nbsp;</div></div>
      <div class="os-wy-clock"></div>
    </div>
    <div class="os-wy-cross" hidden><span class="os-wy-dot"></span><span class="os-wy-interact"></span></div>
    <div class="os-wy-place" hidden></div>
    <div class="os-wy-toast" hidden></div>
    <button class="os-wy-burger" aria-label="Menu">≡</button>
    <div class="os-wy-dialog" hidden>
      <div class="os-wy-dname"></div>
      <div class="os-wy-dtext"></div>
      <div class="os-wy-dopts"></div>
    </div>
    <div class="os-wy-create" hidden>
      <div class="os-wy-title">WYRDFALL</div>
      <div class="os-wy-subtitle">a province that does not scale to meet you</div>
      <label class="os-wy-field">Name <input class="os-wy-name" maxlength="18" value="Wanderer"></label>
      <div class="os-wy-classes"></div>
      <div class="os-wy-create-btns">
        <button class="os-wy-begin">Begin in Thornwick</button>
        <button class="os-wy-continue" hidden>Continue — <span></span></button>
      </div>
    </div>
    <div class="os-wy-panel os-wy-menu" hidden>
      <div class="os-wy-panel-title">Wyrdfall</div>
      <button data-m="resume">Return to the province</button>
      <button data-m="sheet">Character sheet <span class="os-wy-key">C</span></button>
      <button data-m="map">Map of the province <span class="os-wy-key">M</span></button>
      <button data-m="save">Save</button>
      <div class="os-wy-sect">Hands</div>
      <div class="os-wy-optrow"><span>Input</span><span class="os-wy-seg"><button data-i="mouse">Mouse</button><button data-i="laptop">Laptop</button></span></div>
      <div class="os-wy-optrow"><span>Look speed</span><input type="range" class="os-wy-sens" min="40" max="220" value="100"></div>
      <div class="os-wy-optrow"><span>Head bob</span><button class="os-wy-tog" data-t="bob">On</button></div>
      <div class="os-wy-sect">Senses</div>
      <div class="os-wy-optrow"><span>Sound</span><button class="os-wy-tog" data-t="sound">On</button></div>
      <div class="os-wy-optrow"><span>Sharpness</span><span class="os-wy-seg"><button data-d="0">Auto</button><button data-d="1">1×</button><button data-d="2">2×</button></span></div>
      <button data-m="quit">Quit to desktop</button>
    </div>
    <div class="os-wy-panel os-wy-sheetp" hidden>
      <div class="os-wy-panel-title">Character</div>
      <div class="os-wy-sheetbody"></div>
      <button data-m="resume">Close</button>
    </div>
    <div class="os-wy-panel os-wy-mapp" hidden>
      <div class="os-wy-panel-title">The Province</div>
      <canvas class="os-wy-map" width="460" height="460"></canvas>
      <div class="os-wy-mapnote">Tap a marked place to hire a cart (6 gold, roads only).</div>
      <button data-m="resume">Close</button>
    </div>
    <div class="os-wy-death" hidden>
      <div class="os-wy-death-line">The province keeps what it kills.</div>
      <button class="os-wy-rise">Rise at the temple</button>
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
  const Q = <E extends Element = HTMLElement>(sel: string) => wrap.querySelector(sel) as E;
  const canvas = Q<HTMLCanvasElement>(".os-wy-canvas");
  /* Never a silent black window: any failure in the engine below — no
     WebGL, a shader this device's compiler refuses, a world that will
     not build — lands on this plate in plain words, where the player
     (and a screenshot) can see it. */
  const wyFail = (title: string, detail: string) => {
    try {
      if (wrap.querySelector(".os-wy-fail")) return;
      const plate = document.createElement("div");
      plate.className = "os-wy-fail";
      const h = document.createElement("div");
      h.className = "os-wy-fail-h"; h.textContent = title;
      const p = document.createElement("pre");
      p.className = "os-wy-fail-p"; p.textContent = detail.slice(0, 900);
      plate.append(h, p);
      wrap.appendChild(plate);
    } catch { /* the plate is a courtesy, never a new failure */ }
  };
  const hudEl = Q(".os-wy-hud"), crossEl = Q(".os-wy-cross"), interactEl = Q(".os-wy-interact");
  const hpBar = Q(".os-wy-bar.hp i"), mpBar = Q(".os-wy-bar.mp i"), stBar = Q(".os-wy-bar.st i");
  const clockEl = Q(".os-wy-clock"), compStrip = Q(".os-wy-compstrip");
  const placeEl = Q(".os-wy-place"), toastEl = Q(".os-wy-toast"), hurtEl = Q(".os-wy-hurt");
  const dialogEl = Q(".os-wy-dialog"), dName = Q(".os-wy-dname"), dText = Q(".os-wy-dtext"), dOpts = Q(".os-wy-dopts");
  const createEl = Q(".os-wy-create"), nameInput = Q<HTMLInputElement>(".os-wy-name");
  const classesEl = Q(".os-wy-classes"), continueBtn = Q<HTMLButtonElement>(".os-wy-continue");
  const menuEl = Q(".os-wy-menu"), sheetEl = Q(".os-wy-sheetp"), mapEl2 = Q(".os-wy-mapp");
  const sheetBody = Q(".os-wy-sheetbody"), deathEl = Q(".os-wy-death");
  const touchEl = Q(".os-wy-touch"), useBtn = Q<HTMLButtonElement>(".os-wy-tbtn[data-t='use']");

  /* ——— settings ——— */
  interface Cfg { mode: "mouse" | "laptop"; sens: number; bob: boolean; sound: boolean; dpr: number }
  const cfg: Cfg = (() => {
    try {
      const raw = localStorage.getItem("wyrdfall-cfg");
      if (raw) return { mode: "mouse", sens: 1, bob: true, sound: true, dpr: 0, ...JSON.parse(raw) };
    } catch { /* fresh */ }
    return { mode: "mouse", sens: 1, bob: true, sound: true, dpr: 0 };
  })();
  const saveCfg = () => { try { localStorage.setItem("wyrdfall-cfg", JSON.stringify(cfg)); } catch { /* private */ } };

  /* ——— state ——— */
  type Scene =
    | { kind: "title" }
    | { kind: "overworld" }
    | { kind: "interior"; b: BDef; scene: InteriorScene }
    | { kind: "dungeon"; di: number; scene: DungScene };
  let scene: Scene = { kind: "title" };
  let sheet: Sheet | null = null;
  let started = false, dead = false;
  let px = 0, pz = -40, pyaw = 0, ppitch = 0, tYaw = 0, tPitch = 0;
  let vx = 0, vz = 0, vy = 0, groundY = 6, jumpOff = 0, grounded = true;
  let eyeY = 8, bobPhase = 0, landDip = 0, stepAcc = 0;
  let gameMin = 8 * 60, dayCount = 1;
  let stamina = 100, swingT = 0, castCd = 0, hurtT = 0, shake = 0, hitStop = 0;
  let discovered = new Set<string>();
  let quests: Quest[] = [];
  let questSeq = 1;
  let returnPos: { x: number; z: number; yaw: number } | null = null;
  let lastPlace = "", placeT = 0, toastT = 0;
  let menuOpen = false, dlgOpen = false;
  let selClass = "Knight";
  let spellLight = 0;
  const maxHp = (s: Sheet) => 46 + s.level * 6 + (s.cls === "Knight" ? 14 : s.cls === "Rogue" ? 4 : 0);
  const maxMp = (s: Sheet) => 26 + s.level * 4 + (s.cls === "Sorcerer" ? 16 : s.cls === "Rogue" ? 0 : 6);
  const hourNow = () => gameMin / 60;
  const playing = () => started && !dead && scene.kind !== "title";

  interface DynFoe {
    kind: FoeKind; x: number; z: number; y: number; yaw: number; hp: number; max: number;
    phase: number; flash: number; atkCd: number; dead: boolean; boss: boolean;
    vx: number; vz: number; boltCd: number; name: string;
  }
  let foes: DynFoe[] = [];
  interface Wanderer { npc: NpcDef; x: number; z: number; yaw: number; tx: number; tz: number; wait: number; phase: number }
  let wanderers: Wanderer[] = [];
  interface Remain { x: number; y: number; z: number; yaw: number; sprite: number; w: number }
  let remains: Remain[] = [];
  interface Tracer { x: number; y: number; z: number; dx: number; dy: number; dz: number; len: number; hostile: boolean; dmg: number }
  let tracers: Tracer[] = [];
  interface ChestState { di: number; idx: number }
  let openedChests: ChestState[] = [];

  let curInteract: { label: string; run: () => void } | null = null;
  let ambushCd = 0, spawnCd = 0, autosaveT = 0;

  /* ——— input ——— */
  const keys: Record<string, boolean> = {};
  let locked = false;
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (!wrap.isConnected) return;
    keys[e.code] = down;
    if (!down) return;
    if (e.code === "KeyC" && playing() && !dlgOpen) { togglePanel(sheetEl); }
    if (e.code === "KeyM" && playing() && !dlgOpen) { togglePanel(mapEl2); drawMap(); }
    if (cfg.mode === "laptop" && playing() && !panelsOpen()) {
      if (e.code === "Space") { swingStart(); e.preventDefault(); }
      if (e.code === "KeyF" && grounded) { vy = 8.6; grounded = false; }
    }
  };
  /* keys live on the window, not the wrap: the wrap is never focused, and a
     focused button hides when its panel closes — wrap-scoped keys died
     the moment a game began. (Convicted by the headless drive, 2026-10-25.) */
  const onKeyDown = onKey(true), onKeyUp = onKey(false);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && playing() && cfg.mode === "mouse" && !dlgOpen && menuEl.hidden && sheetEl.hidden && mapEl2.hidden) openPanel(menuEl);
  });
  canvas.addEventListener("click", () => {
    if (playing() && cfg.mode === "mouse" && !locked && !panelsOpen()) canvas.requestPointerLock();
  });
  wrap.addEventListener("mousemove", (e) => {
    if (!locked || !playing() || panelsOpen()) return;
    tYaw -= e.movementX * 0.0021 * cfg.sens;
    tPitch = clamp(tPitch - e.movementY * 0.0021 * cfg.sens, -1.35, 1.35);
  });
  wrap.addEventListener("mousedown", (e) => {
    if (!locked || !playing() || panelsOpen()) return;
    if (e.button === 0) swingStart();
    if (e.button === 2) castBolt();
  });
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());
  const onActKey = (e: KeyboardEvent) => {
    if (!wrap.isConnected || !playing() || panelsOpen()) return;
    if (e.code === "KeyE") curInteract?.run();
    if (cfg.mode === "mouse") {
      if (e.code === "Space" && grounded) { vy = 8.6; grounded = false; e.preventDefault(); }
      if (e.code === "KeyF") castBolt();
    }
    if (e.code === "KeyR") castHeal();
  };
  window.addEventListener("keydown", onActKey);
  /* touch hands */
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
        const dx = clamp((t.clientX - touch.cx) / 52, -1, 1), dy = clamp((t.clientY - touch.cy) / 52, -1, 1);
        touch.r = dx; touch.f = -dy;
        stickDot.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
      } else if (t.identifier === touch.lookId) {
        tYaw -= (t.clientX - touch.lx) * 0.0046 * cfg.sens;
        tPitch = clamp(tPitch - (t.clientY - touch.ly) * 0.0046 * cfg.sens, -1.35, 1.35);
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
      if (t === "jump" && grounded) { vy = 8.6; grounded = false; }
    }, { passive: false });
  });
  function panelsOpen() { return menuOpen || dlgOpen || !sheetEl.hidden || !mapEl2.hidden; }
  function openPanel(p: HTMLElement) {
    menuEl.hidden = p !== menuEl; sheetEl.hidden = p !== sheetEl; mapEl2.hidden = p !== mapEl2;
    menuOpen = p === menuEl;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closePanels() {
    menuEl.hidden = sheetEl.hidden = mapEl2.hidden = true;
    menuOpen = false;
  }
  function togglePanel(p: HTMLElement) {
    if (p.hidden) { openPanel(p); if (p === sheetEl) fillSheet(); if (p === mapEl2) drawMap(); }
    else closePanels();
  }
  Q(".os-wy-burger").addEventListener("click", () => { if (playing()) togglePanel(menuEl); });

  /* ————————————————— the sound engine —————————————————
     Plucked strings (Karplus-Strong), a living ambience, and honest
     weight in the sword arm. Generative, place-aware, never a loop. */
  const audio = (() => {
    let ac: AudioContext | null = null;
    let master: GainNode, musicBus: GainNode, sfxBus: GainNode, ambBus: GainNode;
    let noiseBuf: AudioBuffer;
    let droneOsc: OscillatorNode[] = [], droneGain: GainNode;
    let windGain: GainNode, windSrc: AudioBufferSourceNode;
    const pluckCache = new Map<number, AudioBuffer>();
    let seqNext = 0, seqStep = 0, startedAt = 0;
    let birdT = 3, cricketT = 0, fireT = 0.4;
    const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
    const ROOTS = [0, 3, 10, 5];
    let melDeg = 4;
    const freqOf = (semi: number) => 146.83 * Math.pow(2, semi / 12);

    function ensure(): boolean {
      if (ac) { if (ac.state === "suspended") void ac.resume(); return true; }
      try {
        ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch { return false; }
      master = ac.createGain(); master.gain.value = cfg.sound ? 0.9 : 0; master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      ambBus = ac.createGain(); ambBus.gain.value = 0.8; ambBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      /* wind: looped noise through a wandering band */
      windSrc = ac.createBufferSource(); windSrc.buffer = noiseBuf; windSrc.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 480; bp.Q.value = 0.6;
      windGain = ac.createGain(); windGain.gain.value = 0.0;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = ac.createGain(); lfoG.gain.value = 0.012;
      lfo.connect(lfoG); lfoG.connect(windGain.gain);
      windSrc.connect(bp); bp.connect(windGain); windGain.connect(ambBus);
      windSrc.start(); lfo.start();
      /* the deep drone, for under-places and dark roads */
      droneGain = ac.createGain(); droneGain.gain.value = 0; droneGain.connect(ambBus);
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220; lp.connect(droneGain);
      for (const f of [73.42, 110.0]) {
        const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f;
        o.connect(lp); o.start(); droneOsc.push(o);
      }
      startedAt = ac.currentTime;
      seqNext = ac.currentTime + 0.1;
      return true;
    }
    function pluckBuffer(freq: number): AudioBuffer {
      const key = Math.round(freq * 10);
      const hit = pluckCache.get(key);
      if (hit) return hit;
      const sr = ac!.sampleRate, len = Math.floor(sr * 1.1);
      const buf = ac!.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const N = Math.max(2, Math.round(sr / freq));
      const ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const cur = ring[idx];
        out[i] = cur;
        ring[idx] = (cur + ring[(idx + 1) % N]) * 0.5 * 0.996;
        idx = (idx + 1) % N;
      }
      pluckCache.set(key, buf);
      return buf;
    }
    function pluck(freq: number, when: number, vol: number, dest?: AudioNode) {
      if (!ac) return;
      const src = ac.createBufferSource(); src.buffer = pluckBuffer(freq);
      const g = ac.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(dest ?? musicBus);
      src.start(when);
    }
    function noise(when: number, dur: number, filterType: BiquadFilterType, f0: number, f1: number, vol: number, dest?: AudioNode) {
      if (!ac) return;
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const fl = ac.createBiquadFilter(); fl.type = filterType;
      fl.frequency.setValueAtTime(f0, when);
      fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), when + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      src.connect(fl); fl.connect(g); g.connect(dest ?? sfxBus);
      src.start(when, Math.random() * 1.2); src.stop(when + dur + 0.05);
    }
    function tone(when: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number, dest?: AudioNode) {
      if (!ac) return;
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, when);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g); g.connect(dest ?? sfxBus);
      o.start(when); o.stop(when + dur + 0.05);
    }
    type Place = "town" | "wilds" | "tavern" | "temple" | "dungeon" | "guild";
    function update(dt: number, place: Place, night: boolean, indoors: boolean) {
      if (!ac) return;
      const t = ac.currentTime;
      /* ambience levels */
      const windTarget = indoors ? 0.004 : place === "dungeon" ? 0.0 : 0.028 + (night ? 0.008 : 0);
      windGain.gain.setTargetAtTime(windTarget, t, 0.8);
      const droneTarget = place === "dungeon" ? 0.055 : night && !indoors ? 0.016 : 0.0;
      droneGain.gain.setTargetAtTime(droneTarget, t, 1.2);
      /* birds by day, crickets by night, fire indoors */
      birdT -= dt;
      if (birdT < 0) {
        birdT = 1.5 + Math.random() * 5;
        if (!night && !indoors && place !== "dungeon") {
          const f = 2300 + Math.random() * 900;
          tone(t, 0.09, "sine", f, f * 1.3, 0.016, ambBus);
          tone(t + 0.13, 0.07, "sine", f * 1.1, f * 0.9, 0.012, ambBus);
        }
      }
      cricketT -= dt;
      if (cricketT < 0) {
        cricketT = 0.9 + Math.random() * 1.4;
        if (night && !indoors && place !== "dungeon") {
          for (let i = 0; i < 3; i++) tone(t + i * 0.07, 0.04, "sine", 4300, 4300, 0.006, ambBus);
        }
      }
      fireT -= dt;
      if (fireT < 0) {
        fireT = 0.08 + Math.random() * 0.5;
        if (place === "tavern" || place === "temple" || place === "guild") noise(t, 0.03, "highpass", 2000, 3000, 0.02 + Math.random() * 0.03, ambBus);
      }
      /* the plucked sequencer */
      const stepDur = place === "tavern" ? 0.30 : place === "dungeon" ? 0.85 : place === "temple" ? 0.62 : 0.44;
      while (seqNext < t + 0.3) {
        const bar = Math.floor(seqStep / 8) % 4;
        const root = ROOTS[bar];
        const inBar = seqStep % 8;
        if (inBar === 0) pluck(freqOf(root - 12), seqNext, place === "dungeon" ? 0.16 : 0.11);
        if (place === "tavern" && inBar === 4) {
          pluck(freqOf(root - 12), seqNext, 0.10);
          pluck(freqOf(root - 12 + 7), seqNext + 0.05, 0.07);
          pluck(freqOf(root - 12 + 12), seqNext + 0.1, 0.06);
        }
        const restP = place === "dungeon" ? 0.72 : place === "wilds" && night ? 0.55 : 0.30;
        if (Math.random() > restP) {
          melDeg = clamp(melDeg + [-2, -1, -1, 0, 1, 1, 2, 3][(Math.random() * 8) | 0], 0, DORIAN.length - 1);
          const f = freqOf(root + DORIAN[melDeg] + 12);
          pluck(f, seqNext, place === "temple" ? 0.075 : 0.095);
          if (place === "temple" && Math.random() < 0.3) pluck(f * 2, seqNext + stepDur * 0.5, 0.03);
        }
        seqNext += stepDur;
        seqStep++;
      }
    }
    return {
      ensure,
      update,
      setSound(on: boolean) { if (ac && master) master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.1); },
      swing() { if (ac) noise(ac.currentTime, 0.13, "bandpass", 1100, 280, 0.16); },
      hitFlesh() { if (!ac) return; const t = ac.currentTime; tone(t, 0.12, "sine", 170, 55, 0.30); noise(t, 0.07, "lowpass", 900, 300, 0.18); },
      hitBone() { if (!ac) return; const t = ac.currentTime; noise(t, 0.05, "highpass", 2400, 3200, 0.16); tone(t, 0.06, "square", 620, 300, 0.05); },
      die(kind: string) {
        if (!ac) return; const t = ac.currentTime;
        if (kind === "skeleton") { for (let i = 0; i < 4; i++) noise(t + i * 0.06, 0.04, "highpass", 2600, 3400, 0.12); }
        else if (kind === "wolf" || kind === "rat") tone(t, 0.3, "sawtooth", 300, 60, 0.10);
        else tone(t, 0.35, "sawtooth", 220, 50, 0.12);
      },
      growl(kind: string) {
        if (!ac) return; const t = ac.currentTime;
        if (kind === "wolf") { tone(t, 0.5, "sawtooth", 85, 55, 0.14); noise(t, 0.4, "lowpass", 500, 200, 0.08); }
        else if (kind === "skeleton") noise(t, 0.12, "highpass", 2000, 2800, 0.10);
        else if (kind === "cultist") tone(t, 0.4, "triangle", 140, 180, 0.10);
        else if (kind === "rat") tone(t, 0.15, "square", 900, 1400, 0.05);
        else tone(t, 0.3, "sawtooth", 130, 90, 0.09);
      },
      cast() { if (!ac) return; const t = ac.currentTime; tone(t, 0.2, "sawtooth", 920, 130, 0.10); noise(t, 0.16, "highpass", 3000, 900, 0.06); },
      heal() { if (!ac) return; const t = ac.currentTime; [523, 659, 784].forEach((f, i) => tone(t + i * 0.07, 0.22, "sine", f, f, 0.07)); },
      coin() { if (!ac) return; const t = ac.currentTime; tone(t, 0.07, "sine", 1318, 1318, 0.10); tone(t + 0.06, 0.12, "sine", 1760, 1760, 0.09); },
      door() { if (ac) tone(ac.currentTime, 0.28, "sawtooth", 95, 55, 0.05); },
      chest() { if (!ac) return; const t = ac.currentTime; noise(t, 0.06, "lowpass", 700, 300, 0.2); tone(t + 0.08, 0.1, "sine", 1318, 1560, 0.07); },
      levelUp() { if (!ac) return; const t = ac.currentTime; [0, 4, 7, 12].forEach((d, i) => pluck(freqOf(d + 12), t + i * 0.09, 0.16, sfxBus)); },
      questDone() { if (!ac) return; const t = ac.currentTime; pluck(freqOf(7 + 12), t, 0.14, sfxBus); pluck(freqOf(12 + 12), t + 0.11, 0.14, sfxBus); },
      hurt() { if (!ac) return; const t = ac.currentTime; tone(t, 0.14, "sawtooth", 130, 70, 0.16); noise(t, 0.08, "lowpass", 800, 300, 0.10); },
      step(surface: string, run: boolean) {
        if (!ac) return; const t = ac.currentTime;
        const f = surface === "stone" ? 1500 : surface === "wood" ? 750 : surface === "water" ? 500 : 420;
        noise(t, surface === "water" ? 0.16 : 0.07, "lowpass", f, f * 0.5, run ? 0.075 : 0.05);
      },
      splash() { if (ac) noise(ac.currentTime, 0.3, "lowpass", 700, 250, 0.12); },
      shutdown() {
        if (!ac) return;
        try { windSrc?.stop(); } catch { /* already */ }
        for (const o of droneOsc) { try { o.stop(); } catch { /* already */ } }
        droneOsc = [];
        const c = ac; ac = null;
        void c.close();
      },
    };
  })();

  /* ————————————————— helpers, save, scenes ————————————————— */
  function toast(msg: string, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastT = ms / 1000;
  }
  function banner(place: string) {
    if (place === lastPlace) return;
    lastPlace = place;
    placeEl.textContent = place;
    placeEl.hidden = false;
    placeT = 3.2;
  }
  function gainSkill(id: SkillId, amt = 1) {
    if (!sheet) return;
    sheet.skills[id] = Math.min(100, sheet.skills[id] + amt);
    sheet.gains += amt;
  }
  const SAVE_KEY = "wyrdfall-save-v2";
  function saveGame() {
    if (!sheet) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        sheet, quests, questSeq, px, pz, pyaw, gameMin, dayCount,
        discovered: [...discovered], openedChests,
      }));
    } catch { /* private mode */ }
  }
  function loadSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as {
        sheet: Sheet; quests: Quest[]; questSeq: number; px: number; pz: number; pyaw: number;
        gameMin: number; dayCount: number; discovered: string[]; openedChests: ChestState[];
      };
      sheet = d.sheet; quests = d.quests || []; questSeq = d.questSeq || 1;
      px = d.px; pz = d.pz; pyaw = d.pyaw; tYaw = pyaw;
      gameMin = d.gameMin; dayCount = d.dayCount;
      discovered = new Set(d.discovered || []);
      openedChests = d.openedChests || [];
      return true;
    } catch { return false; }
  }
  function hasSave(): boolean {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  let sceneLights: LightAnchor[] = WORLD_LIGHTS;
  let sceneFlames: Flame[] = [];
  let uploadScene: (() => void) | null = null;
  function setSceneLights(l: LightAnchor[], f: Flame[]) { sceneLights = l; sceneFlames = f; }

  function makeFoe(kind: FoeKind, x: number, z: number, boss: boolean): DynFoe {
    const base = FOES[kind];
    const y = scene.kind === "overworld" ? wyHeight(x, z) : 0;
    const hp = Math.round(base.hp * (boss ? 2.3 : 1) * (1 + ((sheet?.level || 1) - 1) * 0.06));
    return {
      kind, x, z, y, yaw: vrnd() * 6.28, hp, max: hp, phase: vrnd() * 6, flash: 0,
      atkCd: 0, dead: false, boss, vx: 0, vz: 0, boltCd: 1.5 + vrnd() * 2,
      name: boss ? (kind === "wolf" ? "The Broodmother" : kind === "cultist" ? "The High Celebrant" : kind === "skeleton" ? "The First King's Remnant" : base.name) : base.name,
    };
  }
  function enterBuilding(b: BDef) {
    returnPos = { x: b.doorX, z: b.doorZ, yaw: pyaw };
    const sc = buildInterior(b);
    scene = { kind: "interior", b, scene: sc };
    px = 0; pz = 3.6; tYaw = 0; pyaw = 0;
    foes = [];
    setSceneLights(sc.lights, sc.flames);
    uploadScene?.();
    banner(b.name);
    audio.door();
    saveGame();
  }
  function exitBuilding() {
    if (!returnPos) return;
    scene = { kind: "overworld" };
    px = returnPos.x; pz = returnPos.z;
    setSceneLights(WORLD_LIGHTS, []);
    uploadScene?.();
    audio.door();
    spawnWanderers();
    saveGame();
  }
  function enterDungeon(di: number) {
    const def = DUNGEONS[di];
    returnPos = { x: px, z: pz, yaw: pyaw };
    const sc = buildDungeon(di);
    for (const c of openedChests) if (c.di === di && sc.chests[c.idx]) sc.chests[c.idx].opened = true;
    scene = { kind: "dungeon", di, scene: sc };
    discovered.add(def.name);
    px = sc.startX; pz = sc.startZ; tYaw = Math.PI; pyaw = Math.PI;
    foes = sc.spawns.map((s) => makeFoe(s.kind, s.x, s.z, s.boss));
    setSceneLights(sc.lights, sc.flames);
    uploadScene?.();
    banner(def.name);
    saveGame();
  }
  function exitDungeon() {
    if (!returnPos) return;
    scene = { kind: "overworld" };
    px = returnPos.x; pz = returnPos.z;
    foes = [];
    setSceneLights(WORLD_LIGHTS, []);
    uploadScene?.();
    spawnWanderers();
    saveGame();
  }
  function spawnWanderers() {
    wanderers = [];
    let ni = 0;
    for (const t of TOWNS) {
      for (let i = 0; i < 3; i++) {
        const npc: NpcDef = {
          name: TOWNSFOLK_NAMES[ni++ % TOWNSFOLK_NAMES.length],
          sprite: [SPR.TOWNS_A, SPR.TOWNS_B, SPR.TOWNS_C][i % 3],
          role: "wanderer", x: t.x, z: t.z, yaw: 0, town: t.name,
        };
        wanderers.push({
          npc, x: t.x + (vrnd() * 40 - 20), z: t.z + (vrnd() * 40 - 20), yaw: vrnd() * 6.28,
          tx: t.x, tz: t.z, wait: vrnd() * 3, phase: vrnd() * 6,
        });
      }
      for (let i = 0; i < 2; i++) {
        const gx = t.x + (i === 0 ? -8 : 9), gz = t.z + (i === 0 ? 12 : -10);
        wanderers.push({
          npc: { name: "Hearthguard", sprite: SPR.GUARD, role: "guard", x: gx, z: gz, yaw: 0, town: t.name },
          x: gx, z: gz, yaw: i * 2.2, tx: gx, tz: gz, wait: 9999, phase: 0,
        });
      }
    }
  }

  /* ————————————————— dialogue & trade ————————————————— */
  let dlgNpc: NpcDef | null = null;
  function openDialog(npc: NpcDef, text: string, opts: Array<{ label: string; run: () => void }>) {
    dlgNpc = npc;
    dlgOpen = true;
    dName.textContent = npc.name;
    dText.textContent = text;
    dOpts.innerHTML = "";
    for (const o of opts) {
      const b = document.createElement("button");
      b.textContent = o.label;
      b.addEventListener("click", o.run);
      dOpts.appendChild(b);
    }
    dialogEl.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.ensure();
  }
  function closeDialog() {
    dlgOpen = false;
    dlgNpc = null;
    dialogEl.hidden = true;
  }
  function say(text: string, opts: Array<{ label: string; run: () => void }>) {
    dText.textContent = text;
    dOpts.innerHTML = "";
    for (const o of opts) {
      const b = document.createElement("button");
      b.textContent = o.label;
      b.addEventListener("click", o.run);
      dOpts.appendChild(b);
    }
  }
  const leaveOpt = () => ({ label: "Leave", run: () => closeDialog() });
  function rumourLine(): string {
    return RUMOURS[(Math.random() * RUMOURS.length) | 0];
  }
  function applyRest(hours: number, label: string) {
    if (!sheet) return;
    gameMin += hours * 60;
    while (gameMin >= 1440) { gameMin -= 1440; dayCount++; }
    if (sheet.gains >= 5) {
      sheet.level++;
      sheet.gains = 0;
      sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
      audio.levelUp();
      toast(`${label} You wake stronger — level ${sheet.level}.`);
    } else {
      sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
      toast(label);
    }
    stamina = 100;
    saveGame();
  }
  const townNameOf = (npc: NpcDef): string | undefined =>
    npc.town || (npc.home ? TOWNS.find((t) => Math.hypot(npc.home!.x - t.x, npc.home!.z - t.z) < t.r + 30)?.name : undefined);
  function giveQuest(npc: NpcDef) {
    if (!sheet) return;
    if (quests.length >= 3) { say("You carry enough burdens already. Finish one, then return.", [leaveOpt()]); return; }
    const faction = npc.home?.kind || "tavern";
    const roll = Math.random();
    if (faction === "tavern" || roll < 0.25) {
      const others = TOWNS.filter((t) => t.name !== townNameOf(npc));
      const dest = others[(Math.random() * others.length) | 0];
      const q: Quest = { id: questSeq++, kind: "deliver", giver: npc.name, faction, dungeon: -1, target: 1, done: 0, reward: 45 + sheet.level * 6, destName: dest.name, destKind: "tavern" };
      quests.push(q);
      say(`Take this sealed letter to the innkeeper of ${dest.name}. Do not break the seal. ${q.reward} gold on your return.`, [leaveOpt()]);
    } else {
      const di = (Math.random() * DUNGEONS.length) | 0;
      const fetch = Math.random() < 0.45;
      const q: Quest = {
        id: questSeq++, kind: fetch ? "fetch" : "cull", giver: npc.name, faction, dungeon: di,
        target: fetch ? 1 : 4 + sheet.level, done: 0, reward: (fetch ? 130 : 85) + sheet.level * 12,
      };
      quests.push(q);
      say(fetch
        ? `${DUNGEONS[di].name} holds a reliquary in its deepest chest. Bring it to me — ${q.reward} gold, and the faction will remember.`
        : `${DUNGEONS[di].name} breeds trouble. Cull ${q.target} of its denizens and return — ${q.reward} gold.`, [leaveOpt()]);
    }
    saveGame();
  }
  function talkTo(npc: NpcDef) {
    if (!sheet) return;
    audio.ensure();
    /* deliver turn-in: any tavern keeper in the destination town */
    if (npc.role === "keeper" && npc.home?.kind === "tavern") {
      const q = quests.find((qq) => qq.kind === "deliver" && qq.destName === townNameOf(npc));
      if (q) {
        quests = quests.filter((qq) => qq !== q);
        sheet.gold += q.reward;
        sheet.rep.tavern = (sheet.rep.tavern || 0) + 2;
        audio.questDone(); audio.coin();
        openDialog(npc, `The seal is unbroken. Word travels fast — your ${q.reward} gold, and our thanks.`, [leaveOpt()]);
        saveGame();
        return;
      }
    }
    /* quest turn-in with the giver's faction */
    if (npc.role === "keeper" && npc.home) {
      const q = quests.find((qq) => qq.faction === npc.home!.kind && qq.done >= qq.target);
      if (q) {
        quests = quests.filter((qq) => qq !== q);
        sheet.gold += q.reward;
        sheet.rep[q.faction] = (sheet.rep[q.faction] || 0) + 3;
        gainSkill("mercantile", 1);
        audio.questDone(); audio.coin();
        openDialog(npc, `It is done, then. The province breathes easier. Your ${q.reward} gold — spend it loudly.`, [leaveOpt()]);
        saveGame();
        return;
      }
    }
    if (npc.role !== "keeper" || !npc.home) {
      const lines = GREET[npc.role] || GREET.wanderer;
      openDialog(npc, Math.random() < 0.45 ? rumourLine() : lines[(Math.random() * lines.length) | 0], [leaveOpt()]);
      return;
    }
    const kind = npc.home.kind;
    const opts: Array<{ label: string; run: () => void }> = [];
    const greet = GREET.keeper[(Math.random() * GREET.keeper.length) | 0];
    if (kind === "tavern") {
      opts.push({ label: "A bed for the night — 10 gold", run: () => {
        if (sheet!.gold < 10) { say("No coin, no pillow. The stable is free and honest.", [leaveOpt()]); return; }
        sheet!.gold -= 10; closeDialog(); applyRest(9, "You sleep the sleep of the road-worn.");
      } });
      opts.push({ label: "A hot meal — 4 gold", run: () => {
        if (sheet!.gold < 4) { say("The pot is not a charity, friend.", [leaveOpt()]); return; }
        sheet!.gold -= 4; sheet!.hp = Math.min(maxHp(sheet!), sheet!.hp + maxHp(sheet!) * 0.45); stamina = 100; audio.coin();
        say("Broth, bread, and something that was probably a turnip. You feel human again.", [leaveOpt()]);
      } });
    }
    if (kind === "shop") {
      opts.push({ label: "Trade", run: () => shopMenu(npc) });
    }
    if (kind === "temple") {
      opts.push({ label: "Blessing — the God listens freely", run: () => {
        sheet!.hp = maxHp(sheet!); sheet!.mp = maxMp(sheet!); audio.heal();
        say("A quiet settles over you, like snow deciding not to fall. You are whole.", [leaveOpt()]);
      } });
      opts.push({ label: "Commune until dawn", run: () => {
        closeDialog();
        const toDawn = gameMin < 420 ? 420 - gameMin : 1440 - gameMin + 420;
        applyRest(toDawn / 60, "You kneel until the light changes.");
      } });
    }
    if (kind === "guildf" || kind === "guildm") {
      const skills: SkillId[] = kind === "guildf" ? ["blade", "athletics"] : ["destruction", "restoration"];
      for (const sk of skills) {
        opts.push({ label: `Train ${SKILL_NAMES[sk]} — 35 gold`, run: () => {
          if (sheet!.gold < 35) { say("Training is cheaper than funerals, but not free.", [leaveOpt()]); return; }
          sheet!.gold -= 35; gainSkill(sk, 4); audio.coin();
          say(`Hours of drills you will feel tomorrow. ${SKILL_NAMES[sk]} is now ${sheet!.skills[sk]}.`, [leaveOpt()]);
          saveGame();
        } });
      }
    }
    opts.push({ label: "Work — what needs doing?", run: () => giveQuest(npc) });
    opts.push({ label: "Rumours", run: () => say(rumourLine(), [{ label: "Another", run: () => say(rumourLine(), [leaveOpt()]) }, leaveOpt()]) });
    opts.push(leaveOpt());
    openDialog(npc, greet, opts);
  }
  function shopMenu(npc: NpcDef) {
    if (!sheet) return;
    const s = sheet;
    const opts: Array<{ label: string; run: () => void }> = [];
    const next = WEAPONS[s.weapon + 1];
    if (next) {
      const price = Math.round(next.price * (1 - s.skills.mercantile * 0.003));
      opts.push({ label: `${next.name} — ${price} gold`, run: () => {
        if (s.gold < price) { say("Fine steel, empty purse. A classic pairing.", [leaveOpt()]); return; }
        s.gold -= price; s.weapon++; audio.coin();
        say(`The ${next.name} settles into your hand like it was waiting.`, [leaveOpt()]);
        saveGame();
      } });
    }
    const draughtPrice = Math.round(25 * (1 - s.skills.mercantile * 0.003));
    opts.push({ label: `Healing draught — ${draughtPrice} gold`, run: () => {
      if (s.gold < draughtPrice) { say("Potions are not poured on credit.", [leaveOpt()]); return; }
      if (s.hp >= maxHp(s)) { say("You are unwounded. Save your coin for when you are not.", [leaveOpt()]); return; }
      s.gold -= draughtPrice; s.hp = maxHp(s); audio.coin(); audio.heal();
      say("Warm as a hearth. The wounds close like shy doors.", [leaveOpt()]);
    } });
    opts.push(leaveOpt());
    say("What catches your eye? Mind the steel — it bites the curious.", opts);
    void npc;
  }

  /* ————————————————— combat & the step ————————————————— */
  let swingHitDone = true;
  function swingStart() {
    if (!playing() || swingT > 0.12 || panelsOpen()) return;
    swingT = 0.34;
    swingHitDone = false;
    audio.ensure(); audio.swing();
  }
  function resolveSwing() {
    if (!sheet) return;
    const dmgBase = WEAPONS[sheet.weapon].dmg + sheet.level * 0.7 + sheet.skills.blade * 0.13;
    const fx = -Math.sin(pyaw), fz = -Math.cos(pyaw);
    let best: DynFoe | null = null, bestD = 2.45;
    for (const f of foes) {
      if (f.dead) continue;
      const dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      if (d > 0.9 && (dx * fx + dz * fz) / (d || 1) < 0.15) continue;
      best = f; bestD = d;
    }
    if (!best) return;
    const crit = Math.random() < 0.1;
    const dmg = Math.round(dmgBase * (crit ? 1.6 : 1) * (0.9 + Math.random() * 0.2));
    hurtFoe(best, dmg, fx, fz, crit ? 7 : 4.5);
    gainSkill("blade", 1);
  }
  function hurtFoe(f: DynFoe, dmg: number, kx: number, kz: number, force: number) {
    f.hp -= dmg;
    f.flash = 1;
    f.vx += kx * force; f.vz += kz * force;
    hitStop = Math.max(hitStop, 0.045);
    if (f.kind === "skeleton") audio.hitBone(); else audio.hitFlesh();
    if (f.hp <= 0 && !f.dead) killFoe(f);
    else if (Math.random() < 0.5) audio.growl(f.kind);
  }
  function killFoe(f: DynFoe) {
    if (!sheet) return;
    f.dead = true;
    audio.die(f.kind);
    remains.push({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, sprite: SPR.CORPSE, w: FOES[f.kind].w + 0.5 });
    const loot = 2 + ((Math.random() * 6) | 0) + (f.boss ? 40 : 0);
    sheet.gold += loot;
    toast(`${f.name} falls. You take ${loot} gold from the still-warm purse.`);
    if (scene.kind === "dungeon") {
      for (const q of quests) {
        if (q.kind === "cull" && q.dungeon === scene.di && q.done < q.target) {
          q.done++;
          if (q.done >= q.target) toast("The cull is complete — return for your reward.");
        }
      }
    }
    saveGame();
  }
  function castBolt() {
    if (!sheet || !playing() || castCd > 0 || panelsOpen()) return;
    const cost = 6;
    if (sheet.mp < cost) { toast("The magicka is not there."); return; }
    sheet.mp -= cost;
    castCd = 0.45;
    spellLight = 0.25;
    audio.ensure(); audio.cast();
    const cp = Math.cos(ppitch);
    const dir: [number, number, number] = [-Math.sin(pyaw) * cp, Math.sin(ppitch), -Math.cos(pyaw) * cp];
    tracers.push({
      x: px + dir[0] * 0.5, y: eyeY + dir[1] * 0.5, z: pz + dir[2] * 0.5,
      dx: dir[0], dy: dir[1], dz: dir[2], len: 34, hostile: false, dmg: 8 + sheet.skills.destruction * 0.3 + sheet.level,
    });
  }
  function castHeal() {
    if (!sheet || !playing() || panelsOpen()) return;
    const cost = 8;
    if (sheet.mp < cost) { toast("The magicka is not there."); return; }
    if (sheet.hp >= maxHp(sheet)) return;
    sheet.mp -= cost;
    const amt = Math.round(12 + sheet.skills.restoration * 0.5);
    sheet.hp = Math.min(maxHp(sheet), sheet.hp + amt);
    gainSkill("restoration", 1);
    audio.ensure(); audio.heal();
    toast(`Warmth knits you — ${amt} health restored.`);
  }
  function hurtPlayer(dmg: number, fromX: number, fromZ: number) {
    if (!sheet || dead) return;
    sheet.hp -= dmg;
    hurtT = 1; shake = Math.max(shake, 0.16);
    const dx = px - fromX, dz = pz - fromZ, L = Math.hypot(dx, dz) || 1;
    vx += (dx / L) * 3.2; vz += (dz / L) * 3.2;
    audio.hurt();
    if (sheet.hp <= 0) {
      sheet.hp = 0;
      dead = true;
      deathEl.hidden = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  Q(".os-wy-rise").addEventListener("click", () => {
    if (!sheet) return;
    const lost = Math.floor(sheet.gold * 0.1);
    sheet.gold -= lost;
    sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
    scene = { kind: "overworld" };
    const temple = BUILDINGS.find((b) => b.kind === "temple");
    px = temple ? temple.doorX : 0; pz = temple ? temple.doorZ : -40;
    foes = [];
    setSceneLights(WORLD_LIGHTS, []);
    uploadScene?.();
    spawnWanderers();
    dead = false;
    deathEl.hidden = true;
    gameMin += 360; if (gameMin >= 1440) { gameMin -= 1440; dayCount++; }
    toast(`You wake on cold temple stone. The province kept ${lost} gold of yours.`);
    saveGame();
  });

  let restCd = 0;
  function tryRestWilds() {
    if (!sheet || scene.kind === "interior") return;
    for (const f of foes) if (!f.dead && Math.hypot(f.x - px, f.z - pz) < 15) { toast("Enemies nearby — the ground stays cold."); return; }
    if (Math.random() < 0.25) {
      applyRest(3, "Something finds you in the dark.");
      for (let i = 0; i < 2; i++) {
        const a = vrnd() * 6.28;
        foes.push(makeFoe(hourNow() > 18 || hourNow() < 5 ? "skeleton" : "wolf", px + Math.cos(a) * 9, pz + Math.sin(a) * 9, false));
      }
      toast("Ambush — up, up!");
    } else {
      applyRest(6, "You sleep badly on honest ground, and wake anyway.");
    }
    restCd = 2;
  }

  function collide(nx: number, nz: number): [number, number] {
    if (scene.kind === "overworld") {
      for (const b of BUILDINGS) {
        const dx = nx - b.x, dz = nz - b.z;
        if (Math.abs(dx) > b.w / 2 + 3 || Math.abs(dz) > b.d / 2 + 3) continue;
        const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw);
        let lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ex = b.w / 2 + 0.38, ez = b.d / 2 + 0.38;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const pushX = ex - Math.abs(lx), pushZ = ez - Math.abs(lz);
          if (pushX < pushZ) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
          const c2 = Math.cos(b.yaw), s2 = Math.sin(b.yaw);
          nx = b.x + lx * c2 - lz * s2;
          nz = b.z + lx * s2 + lz * c2;
        }
      }
      const rr = Math.hypot(nx, nz);
      if (rr > WORLD_R - 30) { nx *= (WORLD_R - 30) / rr; nz *= (WORLD_R - 30) / rr; }
    } else if (scene.kind === "interior") {
      nx = clamp(nx, -5.5, 5.5); nz = clamp(nz, -4.5, 4.5);
    } else if (scene.kind === "dungeon") {
      const sc = scene.scene;
      const cellOf = (x: number, z: number) => `${Math.round(x / 9) + 5},${Math.round(z / 9) + 5}`;
      const ok = (x: number, z: number) => {
        for (const [ox, oz] of [[0, 0], [0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) {
          if (!sc.cells.has(cellOf(x + ox, z + oz))) return false;
        }
        return true;
      };
      if (ok(nx, nz)) return [nx, nz];
      if (ok(nx, pz)) return [nx, pz];
      if (ok(px, nz)) return [px, nz];
      return [px, pz];
    }
    return [nx, nz];
  }

  function computeInteract() {
    curInteract = null;
    if (!playing() || panelsOpen()) return;
    if (scene.kind === "interior") {
      const sc = scene.scene;
      for (const n of sc.npcs) {
        if (Math.hypot(n.x - px, n.z - pz) < 2.5) {
          curInteract = { label: `Speak — ${n.name}`, run: () => talkTo(n) };
          return;
        }
      }
      if (Math.hypot(px - 0, pz - 4.4) < 1.7) {
        curInteract = { label: `Leave — ${scene.b.name}`, run: () => exitBuilding() };
      }
      return;
    }
    if (scene.kind === "dungeon") {
      const sc = scene.scene;
      for (const ch of sc.chests) {
        if (!ch.opened && Math.hypot(ch.x - px, ch.z - pz) < 2.3) {
          curInteract = { label: "Open the chest", run: () => {
            ch.opened = true;
            openedChests.push({ di: (scene as { di: number }).di, idx: sc.chests.indexOf(ch) });
            sheet!.gold += ch.gold;
            audio.chest(); audio.coin();
            if (ch.quest) {
              for (const q of quests) if (q.kind === "fetch" && q.dungeon === (scene as { di: number }).di) q.done = q.target;
              toast(`Inside: ${ch.gold} gold — and the reliquary, heavier than it looks.`);
            } else {
              toast(`Inside: ${ch.gold} gold, and the smell of old rain.`);
            }
            saveGame();
          } };
          return;
        }
      }
      if (Math.hypot(px - sc.startX, pz - (sc.startZ - 7)) < 2.6) {
        curInteract = { label: `Climb out — ${sc.name}`, run: () => exitDungeon() };
      }
      return;
    }
    /* overworld */
    for (const b of BUILDINGS) {
      if (Math.hypot(b.doorX - px, b.doorZ - pz) < 2.7) {
        if (b.kind === "house") curInteract = { label: b.name, run: () => toast("Barred fast. Whoever lives here values their quiet.") };
        else curInteract = { label: `Enter — ${b.name}`, run: () => enterBuilding(b) };
        return;
      }
    }
    for (let di = 0; di < DUNGEONS.length; di++) {
      const dg = DUNGEONS[di];
      if (Math.hypot(dg.x - px, dg.z - pz) < 4.2) {
        curInteract = { label: `Descend — ${dg.name}`, run: () => enterDungeon(di) };
        return;
      }
    }
    for (const w of wanderers) {
      if (Math.hypot(w.x - px, w.z - pz) < 2.5) {
        curInteract = { label: `Speak — ${w.npc.name}`, run: () => talkTo({ ...w.npc, x: w.x, z: w.z }) };
        return;
      }
    }
  }

  function step(dt: number) {
    if (!sheet) return;
    castCd = Math.max(0, castCd - dt);
    swingT = Math.max(0, swingT - dt);
    if (!swingHitDone && swingT < 0.17) { resolveSwing(); swingHitDone = true; }
    spellLight = Math.max(0, spellLight - dt);
    restCd = Math.max(0, restCd - dt);
    ambushCd = Math.max(0, ambushCd - dt);
    if (keys.KeyT && restCd <= 0 && playing() && !panelsOpen()) tryRestWilds();
    /* the clock */
    gameMin += dt * 2;
    if (gameMin >= 1440) { gameMin -= 1440; dayCount++; }
    /* input direction */
    const fAmt = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
    const rAmt = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    const fIn = touch.on ? touch.f : fAmt, rIn = touch.on ? touch.r : rAmt;
    const moving = fIn !== 0 || rIn !== 0;
    const wantSprint = (!!(keys.ShiftLeft || keys.ShiftRight) || (touch.on && Math.hypot(touch.f, touch.r) > 0.95)) && stamina > 2 && moving;
    if (scene.kind === "overworld") groundY = wyHeight(px, pz);
    else groundY = 0;
    const inWater = scene.kind === "overworld" && groundY < 0.35;
    let speed = wantSprint ? 7.3 : 4.6;
    if (inWater) speed *= 0.55;
    if (moving && wantSprint) {
      stamina = Math.max(0, stamina - 13 * dt);
      if (Math.random() < dt * 0.14) gainSkill("athletics", 1);
    } else {
      stamina = Math.min(100, stamina + (moving ? 7 : 12) * dt);
    }
    const sy = Math.sin(pyaw), cy = Math.cos(pyaw);
    let wx = -sy * fIn + cy * rIn, wz = -cy * fIn - sy * rIn;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const mag = Math.min(1, wl);
    const accel = grounded ? 11 : 2.2;
    vx = lerp(vx, wx * speed * mag, Math.min(1, accel * dt));
    vz = lerp(vz, wz * speed * mag, Math.min(1, accel * dt));
    if (!grounded) {
      vy -= 22 * dt;
      jumpOff += vy * dt;
      if (jumpOff <= 0) {
        jumpOff = 0; grounded = true;
        landDip = clamp(-vy * 0.011, 0.03, 0.13);
        if (vy < -13) audio.step("stone", false);
        vy = 0;
      }
    }
    let nx = px + vx * dt, nz = pz + vz * dt;
    [nx, nz] = collide(nx, nz);
    px = nx; pz = nz;
    const hSpeed = Math.hypot(vx, vz);
    if (grounded && hSpeed > 0.6) {
      bobPhase += dt * hSpeed * 1.55;
      stepAcc += hSpeed * dt;
      if (stepAcc > 2.3) {
        stepAcc = 0;
        const surface = inWater ? "water" : scene.kind !== "overworld" ? (scene.kind === "dungeon" || (scene.kind === "interior" && scene.b.kind === "guildf") ? "stone" : "wood") : inTown(px, pz) ? "stone" : roadDist(px, pz) < 4.5 ? "grass" : "grass";
        audio.step(surface, wantSprint);
      }
    }
    landDip = Math.max(0, landDip - dt * 0.55);
    /* camera */
    pyaw += (tYaw - pyaw) * Math.min(1, dt * 30);
    ppitch += (tPitch - ppitch) * Math.min(1, dt * 30);
    const targetEye = groundY + jumpOff + 1.62 + (cfg.bob && grounded ? Math.sin(bobPhase * 2) * 0.034 : 0) - landDip;
    eyeY += (targetEye - eyeY) * Math.min(1, dt * 14);
    /* foes */
    const frozen = hitStop > 0;
    hitStop = Math.max(0, hitStop - dt);
    for (const f of foes) {
      if (f.dead) continue;
      f.flash = Math.max(0, f.flash - dt * 5);
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.vx *= Math.max(0, 1 - dt * 7); f.vz *= Math.max(0, 1 - dt * 7);
      if (frozen) continue;
      f.y = scene.kind === "overworld" ? wyHeight(f.x, f.z) : 0;
      const dx = px - f.x, dz = pz - f.z, d = Math.hypot(dx, dz);
      const base = FOES[f.kind];
      const aggro = scene.kind === "dungeon" ? 17 : (hourNow() > 19 || hourNow() < 5.5 ? 24 : 19);
      if (d < aggro && d > 0.01) {
        f.yaw = Math.atan2(dx, dz);
        if (d > base.reach) {
          const sp = base.spd * (f.boss ? 0.92 : 1);
          let mx = (dx / d) * sp, mz = (dz / d) * sp;
          for (const o of foes) {
            if (o === f || o.dead) continue;
            const ox = f.x - o.x, oz = f.z - o.z, od = Math.hypot(ox, oz);
            if (od > 0.01 && od < 1.1) { mx += (ox / od) * 1.6; mz += (oz / od) * 1.6; }
          }
          f.x += mx * dt; f.z += mz * dt;
          f.phase += dt * base.spd * 1.9;
        } else {
          f.atkCd -= dt;
          if (f.atkCd <= 0) {
            f.atkCd = 0.95;
            hurtPlayer(Math.max(1, Math.round(base.dmg * (f.boss ? 1.5 : 1) - sheet.level * 0.12)), f.x, f.z);
          }
        }
        if (f.kind === "cultist") {
          f.boltCd -= dt;
          if (f.boltCd <= 0 && d > 4.5 && d < 17) {
            f.boltCd = 2.8;
            const bd: [number, number, number] = [dx / d, (eyeY - (f.y + 1.4)) / d, dz / d];
            tracers.push({ x: f.x, y: f.y + 1.4, z: f.z, dx: bd[0], dy: bd[1], dz: bd[2], len: 22, hostile: true, dmg: base.dmg });
            audio.cast();
          }
        }
      } else {
        f.phase += dt * 0.7;
        f.x += Math.sin(f.yaw) * 0.24 * dt;
        f.z += Math.cos(f.yaw) * 0.24 * dt;
        if (Math.random() < dt * 0.14) f.yaw += (Math.random() - 0.5) * 1.6;
      }
    }
    /* projectiles */
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      const spd = 30;
      t.x += t.dx * spd * dt; t.y += t.dy * spd * dt; t.z += t.dz * spd * dt;
      t.len -= spd * dt;
      let kill = t.len <= 0;
      if (t.hostile) {
        if (Math.hypot(t.x - px, t.z - pz) < 0.85 && Math.abs(t.y - eyeY) < 1.3) {
          hurtPlayer(t.dmg, t.x - t.dx, t.z - t.dz);
          kill = true;
        }
      } else {
        for (const f of foes) {
          if (f.dead) continue;
          const fh = FOES[f.kind].h;
          if (Math.hypot(t.x - f.x, t.z - f.z) < 0.95 && t.y > f.y - 0.2 && t.y < f.y + fh + 0.3) {
            hurtFoe(f, Math.round(t.dmg * (0.9 + Math.random() * 0.2)), t.dx, t.dz, 3);
            gainSkill("destruction", 1);
            kill = true;
            break;
          }
        }
      }
      if (kill) tracers.splice(i, 1);
    }
    /* wanderers */
    if (scene.kind === "overworld") {
      for (const w of wanderers) {
        if (w.npc.role === "guard") continue;
        const t = TOWNS.find((tt) => tt.name === w.npc.town);
        if (!t) continue;
        const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
        if (w.wait > 0) { w.wait -= dt; continue; }
        if (d < 1.2) {
          w.wait = 2 + vrnd() * 5;
          w.tx = t.x + (vrnd() * 2 - 1) * t.r * 0.72;
          w.tz = t.z + (vrnd() * 2 - 1) * t.r * 0.72;
        } else {
          w.yaw = Math.atan2(dx, dz);
          w.x += (dx / d) * 1.12 * dt;
          w.z += (dz / d) * 1.12 * dt;
          w.phase += dt * 3.4;
        }
      }
      /* the wilds provide */
      spawnCd -= dt;
      const wildFoes = foes.filter((f) => !f.dead).length;
      if (spawnCd <= 0 && wildFoes < 4 && !inTown(px, pz)) {
        spawnCd = 3.5;
        if (Math.random() < 0.55) {
          const a = vrnd() * Math.PI * 2, dist = 27 + vrnd() * 13;
          const sx = px + Math.cos(a) * dist, sz = pz + Math.sin(a) * dist;
          if (wyHeight(sx, sz) > 0.6 && Math.hypot(sx, sz) < WORLD_R - 60) {
            const night = hourNow() > 18.5 || hourNow() < 5.5;
            const kind: FoeKind = roadDist(sx, sz) < 5 ? "bandit" : night ? (Math.random() < 0.5 ? "skeleton" : "wolf") : "wolf";
            foes.push(makeFoe(kind, sx, sz, false));
          }
        }
      }
      for (let i = foes.length - 1; i >= 0; i--) {
        if (!foes[i].dead && Math.hypot(foes[i].x - px, foes[i].z - pz) > 95) foes.splice(i, 1);
      }
      /* place banners + discovery */
      let place = "The Wilds";
      for (const t of TOWNS) if (Math.hypot(px - t.x, pz - t.z) < t.r) { place = t.name; discovered.add(t.name); }
      for (const dg of DUNGEONS) if (Math.hypot(px - dg.x, pz - dg.z) < 30) { place = dg.name; discovered.add(dg.name); }
      if (wyHeight(px, pz) < 0.4) place = "The Mere";
      banner(place);
    }
    computeInteract();
    hurtT = Math.max(0, hurtT - dt * 1.6);
    shake = Math.max(0, shake - dt * 0.5);
    autosaveT += dt;
    if (autosaveT > 45) { autosaveT = 0; saveGame(); }
  }

  /* ————————————————— creation, menu, sheet, map ————————————————— */
  const atlasCv = makeAtlas();
  const CLASS_INFO: Record<string, { prime: SkillId; second?: SkillId; blurb: string }> = {
    Knight: { prime: "blade", blurb: "Steel and patience. The road respects both." },
    Ranger: { prime: "athletics", second: "blade", blurb: "Fast over rough country, quiet in it." },
    Sorcerer: { prime: "destruction", second: "restoration", blurb: "The province's old arguments, settled loudly." },
    Rogue: { prime: "lockpicking", second: "mercantile", blurb: "Every lock is a question. So is every price." },
  };
  for (const cls of Object.keys(CLASS_INFO)) {
    const card = document.createElement("button");
    card.className = "os-wy-class" + (cls === selClass ? " sel" : "");
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const g2 = cv.getContext("2d")!;
    g2.imageSmoothingEnabled = false;
    const cell = CLASS_SPR[cls];
    g2.drawImage(atlasCv, (cell % 16) * 128, Math.floor(cell / 16) * 128, 128, 128, 0, 0, 64, 64);
    const label = document.createElement("span");
    label.innerHTML = `<b>${cls}</b><small>${CLASS_INFO[cls].blurb}</small>`;
    card.appendChild(cv); card.appendChild(label);
    card.addEventListener("click", () => {
      selClass = cls;
      classesEl.querySelectorAll(".os-wy-class").forEach((c) => c.classList.toggle("sel", c === card));
      audio.ensure();
    });
    classesEl.appendChild(card);
  }
  if (hasSave()) {
    continueBtn.hidden = false;
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") as { sheet?: Sheet };
      if (d.sheet) continueBtn.querySelector("span")!.textContent = `${d.sheet.name}, level ${d.sheet.level} ${d.sheet.cls}`;
    } catch { /* unreadable save */ }
  }
  function beginGame(fresh: boolean) {
    audio.ensure();
    if (fresh) {
      const info = CLASS_INFO[selClass];
      const skills: Record<SkillId, number> = { blade: 5, destruction: 5, restoration: 5, athletics: 5, lockpicking: 5, mercantile: 5 };
      skills[info.prime] += 10;
      if (info.second) skills[info.second] += 6;
      sheet = {
        name: (nameInput.value || "Wanderer").trim() || "Wanderer", cls: selClass, level: 1,
        hp: 0, mp: 0, gold: 60, weapon: 0, skills, gains: 0, rep: {},
      };
      sheet.hp = maxHp(sheet); sheet.mp = maxMp(sheet);
      px = 14; pz = -92; pyaw = 0.47; tYaw = 0.47;
      gameMin = 8 * 60; dayCount = 1;
      quests = []; discovered = new Set(["Thornwick"]); openedChests = [];
      foes = []; remains = [];
      saveGame();
    } else {
      if (!loadSave()) return;
    }
    started = true;
    scene = { kind: "overworld" };
    setSceneLights(WORLD_LIGHTS, []);
    uploadScene?.();
    spawnWanderers();
    createEl.hidden = true;
    hudEl.hidden = false;
    crossEl.hidden = false;
    banner("Thornwick");
    toast(fresh ? "The province is not expecting you. That is its mistake." : "The province remembers you.");
  }
  Q(".os-wy-begin").addEventListener("click", () => beginGame(true));
  continueBtn.addEventListener("click", () => beginGame(false));

  /* menu wiring */
  menuEl.querySelectorAll<HTMLButtonElement>("[data-m]").forEach((b) => {
    b.addEventListener("click", () => {
      const m = b.dataset.m;
      if (m === "resume") { closePanels(); if (cfg.mode === "mouse" && playing()) canvas.requestPointerLock(); }
      if (m === "sheet") { openPanel(sheetEl); fillSheet(); }
      if (m === "map") { openPanel(mapEl2); drawMap(); }
      if (m === "save") { saveGame(); toast("The province, committed to memory."); }
      if (m === "quit") {
        saveGame();
        audio.shutdown();
        wrap.dispatchEvent(new CustomEvent("wyrdfall-quit", { bubbles: true }));
        const host = wrap.closest(".os-win-body") as HTMLElement | null;
        if (host) host.innerHTML = "";
        wrap.remove();
      }
    });
  });
  sheetEl.querySelector<HTMLButtonElement>("[data-m='resume']")!.addEventListener("click", () => closePanels());
  mapEl2.querySelector<HTMLButtonElement>("[data-m='resume']")!.addEventListener("click", () => closePanels());
  const syncMenu = () => {
    menuEl.querySelectorAll<HTMLButtonElement>("[data-i]").forEach((b) => b.classList.toggle("sel", b.dataset.i === cfg.mode));
    menuEl.querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) => b.classList.toggle("sel", Number(b.dataset.d) === cfg.dpr));
    const sens = Q<HTMLInputElement>(".os-wy-sens");
    sens.value = String(Math.round(cfg.sens * 100));
    menuEl.querySelectorAll<HTMLButtonElement>(".os-wy-tog").forEach((b) => {
      const on = b.dataset.t === "bob" ? cfg.bob : cfg.sound;
      b.textContent = on ? "On" : "Off";
      b.classList.toggle("sel", on);
    });
  };
  menuEl.querySelectorAll<HTMLButtonElement>("[data-i]").forEach((b) => b.addEventListener("click", () => { cfg.mode = b.dataset.i as Cfg["mode"]; saveCfg(); syncMenu(); }));
  menuEl.querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) => b.addEventListener("click", () => { cfg.dpr = Number(b.dataset.d); saveCfg(); syncMenu(); }));
  Q<HTMLInputElement>(".os-wy-sens").addEventListener("input", (e) => { cfg.sens = Number((e.target as HTMLInputElement).value) / 100; saveCfg(); });
  menuEl.querySelectorAll<HTMLButtonElement>(".os-wy-tog").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.t === "bob") cfg.bob = !cfg.bob;
    if (b.dataset.t === "sound") { cfg.sound = !cfg.sound; audio.setSound(cfg.sound); }
    saveCfg(); syncMenu();
  }));
  syncMenu();

  function fillSheet() {
    if (!sheet) return;
    const s = sheet;
    const skillRows = (Object.keys(SKILL_NAMES) as SkillId[]).map((k) =>
      `<div class="os-wy-skill"><span>${SKILL_NAMES[k]}</span><span class="os-wy-sbar"><i style="width:${s.skills[k]}%"></i></span><b>${s.skills[k]}</b></div>`).join("");
    const repRows = Object.entries(s.rep).filter(([, v]) => v > 0).map(([k, v]) => {
      const names: Record<string, string> = { guildf: "Hearthguard", guildm: "Umbral Covenant", tavern: "Innkeepers", temple: "The Listening God", shop: "Merchants" };
      return `<div>${names[k] || k} — standing ${v}</div>`;
    }).join("");
    const questRows = quests.length
      ? quests.map((q) => `<div class="os-wy-qrow">${q.kind === "cull" ? `Cull in ${DUNGEONS[q.dungeon].name} — ${q.done}/${q.target}` : q.kind === "fetch" ? `Reliquary from ${DUNGEONS[q.dungeon].name} — ${q.done >= q.target ? "recovered" : "waiting in the deep"}` : `Letter to ${q.destName} — ${q.done >= q.target ? "delivered" : "sealed"}`} <em>(${q.giver})</em></div>`).join("")
      : "<div>No work carried. Guilds and innkeepers always have some.</div>";
    sheetBody.innerHTML = `
      <div class="os-wy-shead"><b>${s.name}</b> — level ${s.level} ${s.cls}</div>
      <div>Health ${Math.ceil(s.hp)} / ${maxHp(s)} · Magicka ${Math.floor(s.mp)} / ${maxMp(s)} · Gold ${s.gold}</div>
      <div>Weapon — ${WEAPONS[s.weapon].name}</div>
      <div class="os-wy-sect">Skills — they rise by use; five gains make a level at rest</div>
      ${skillRows}
      <div class="os-wy-sect">Standing</div>
      ${repRows || "<div>Unknown, everywhere. A clean slate.</div>"}
      <div class="os-wy-sect">Work carried</div>
      ${questRows}`;
  }

  const mapCanvas = Q<HTMLCanvasElement>(".os-wy-map");
  function drawMap() {
    const ctx = mapCanvas.getContext("2d");
    if (!ctx) return;
    const S = mapCanvas.width;
    const W2 = (x: number) => (x / (WORLD_R * 2) + 0.5) * S;
    ctx.fillStyle = "#221a12";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(201,162,39,0.5)";
    ctx.beginPath();
    for (const [ax, az, bx, bz] of ROAD_SEGS) { ctx.moveTo(W2(ax), W2(az)); ctx.lineTo(W2(bx), W2(bz)); }
    ctx.stroke();
    ctx.fillStyle = "#2c4a63";
    ctx.beginPath();
    ctx.ellipse(W2(-330), W2(330), 60, 50, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a227";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "center";
    for (const t of TOWNS) {
      if (!discovered.has(t.name) && t.name !== "Thornwick") continue;
      ctx.beginPath(); ctx.arc(W2(t.x), W2(t.z), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(t.name, W2(t.x), W2(t.z) - 8);
    }
    ctx.fillStyle = "#b4584e";
    for (const dg of DUNGEONS) {
      if (!discovered.has(dg.name)) continue;
      ctx.fillRect(W2(dg.x) - 3, W2(dg.z) - 3, 6, 6);
      ctx.fillText(dg.name, W2(dg.x), W2(dg.z) - 8);
    }
    ctx.fillStyle = "#f2ead2";
    ctx.save();
    ctx.translate(W2(px), W2(pz));
    ctx.rotate(-pyaw);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  mapCanvas.addEventListener("click", (e) => {
    if (!sheet) return;
    const rect = mapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * mapCanvas.width;
    const mz = (e.clientY - rect.top) / rect.height * mapCanvas.height;
    const wx2 = (mx / mapCanvas.width - 0.5) * WORLD_R * 2;
    const wz2 = (mz / mapCanvas.height - 0.5) * WORLD_R * 2;
    for (const t of TOWNS) {
      if (Math.hypot(wx2 - t.x, wz2 - t.z) > 46) continue;
      if (!discovered.has(t.name)) { toast("You have not walked there yet. Carts serve known roads."); return; }
      const dist = Math.hypot(px - t.x, pz - t.z);
      if (dist < 120) { toast("You could walk that before the driver hitches up."); return; }
      if (sheet.gold < 6) { toast("The cart costs 6 gold. The road costs nothing but time."); return; }
      sheet.gold -= 6;
      px = t.x + 14; pz = t.z + 18;
      foes = [];
      closePanels();
      const night = hourNow() > 19 || hourNow() < 5;
      if (night && Math.random() < 0.4) {
        for (let i = 0; i < 2; i++) { const a = vrnd() * 6.28; foes.push(makeFoe("bandit", px + Math.cos(a) * 10, pz + Math.sin(a) * 10, false)); }
        toast(`The cart reaches ${t.name} — but the road took its toll. Bandits!`);
      } else {
        toast(`The cart rattles into ${t.name} by ${night ? "lantern light" : "daylight"}.`);
      }
      audio.coin();
      saveGame();
      return;
    }
  });

  /* ————————————————— the textured engine ————————————————— */
  const gl = (canvas.getContext("webgl2", { antialias: false, alpha: false }) || canvas.getContext("webgl", { antialias: false, alpha: false })) as WebGLRenderingContext;
  if (!gl) {
    wyFail("The province could not take shape here", "This browser would not grant the game a WebGL canvas. In a browser that asks permission for WebGL, allow it and reopen the game; a private or lockdown mode can also refuse it.");
    return;
  }
  canvas.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    wyFail("The light went out", "The browser took the graphics context back — this can happen when a device is short on graphics memory. Close the game and open it again.");
  });
  const glFails: string[] = [];
  function mkProg(vs: string, fs: string): WebGLProgram {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) glFails.push(`${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader: ${gl.getShaderInfoLog(s) || "unknown error"}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) glFails.push(`program link: ${gl.getProgramInfoLog(p) || "unknown error"}`);
    return p;
  }
  const LIT_VS = `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUV;
    uniform mat4 uMVP; uniform vec3 uCamPos;
    varying vec3 vCol; varying vec3 vNor; varying vec2 vUV; varying vec3 vWP; varying float vDist;
    void main() {
      vCol = aCol; vNor = aNor; vUV = aUV; vWP = aPos;
      gl_Position = uMVP * vec4(aPos, 1.0);
      vDist = distance(aPos.xz, uCamPos.xz);
    }`;
  const LIT_FS = `
    precision mediump float;
    varying vec3 vCol; varying vec3 vNor; varying vec2 vUV; varying vec3 vWP; varying float vDist;
    uniform sampler2D uAtlas;
    uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmbSky; uniform vec3 uAmbGnd;
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    uniform float uAlphaTest; uniform float uEmiss;
    uniform vec4 uPL[6]; uniform vec3 uPLCol[6];
    void main() {
      vec4 tex = texture2D(uAtlas, vUV);
      if (tex.a < uAlphaTest) discard;
      vec3 n = normalize(vNor);
      float wrap = clamp((dot(n, uSunDir) + 0.45) / 1.45, 0.0, 1.0);
      vec3 amb = mix(uAmbGnd, uAmbSky, n.y * 0.5 + 0.5);
      vec3 col = tex.rgb * vCol * (amb + uSunCol * wrap);
      for (int i = 0; i < 6; i++) {
        vec3 Ld = uPL[i].xyz - vWP;
        float dist = length(Ld);
        float att = clamp(1.0 - dist / max(uPL[i].w, 0.01), 0.0, 1.0);
        if (att > 0.001) {
          float pd = max(dot(n, Ld / max(dist, 0.001)), 0.0);
          col += tex.rgb * vCol * uPLCol[i] * (att * att) * (0.30 + 0.70 * pd);
        }
      }
      col += tex.rgb * vCol * uEmiss;
      float f = smoothstep(uFogNear, uFogFar, vDist);
      col = mix(col, uFogColor, f);
      gl_FragColor = vec4(col, tex.a);
    }`;
  const SKY_VS = `
    attribute vec3 aPos;
    uniform mat4 uVP;
    varying vec3 vDir;
    void main() { vDir = aPos; vec4 p = uVP * vec4(aPos, 1.0); gl_Position = p.xyww; }`;
  const SKY_FS = `
    precision highp float;
    varying vec3 vDir;
    uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol;
    uniform vec3 uMoonDir; uniform float uNight; uniform float uTime;
    void main() {
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      vec3 col = mix(uHor, uZen, pow(h, 0.58));
      float sd = max(dot(d, uSunDir), 0.0);
      col += uSunCol * (pow(sd, 240.0) * 1.4 + pow(sd, 20.0) * 0.32);
      float md = dot(d, uMoonDir);
      col = mix(col, vec3(0.87, 0.88, 0.82), smoothstep(0.99965, 0.99985, md) * uNight);
      col += vec3(0.5, 0.55, 0.65) * pow(max(md, 0.0), 300.0) * 0.5 * uNight;
      if (uNight > 0.02 && d.y > 0.01) {
        vec3 sp = floor(d * 230.0);
        vec3 p3 = fract(sp * 0.1031);
        p3 += dot(p3, p3.zyx + 31.32);
        float hsh = fract((p3.x + p3.y) * p3.z);
        float star = step(0.9978, hsh) * uNight * smoothstep(0.01, 0.3, d.y);
        float tw = 0.7 + 0.3 * sin(uTime * 2.2 + hsh * 44.0);
        col += vec3(0.85, 0.9, 1.0) * star * tw;
      }
      gl_FragColor = vec4(col, 1.0);
    }`;
  const WAT_VS = `
    attribute vec3 aPos;
    uniform mat4 uMVP; uniform vec2 uCam;
    varying vec3 vW; varying float vDist;
    void main() { vW = aPos; gl_Position = uMVP * vec4(aPos, 1.0); vDist = distance(aPos.xz, uCam); }`;
  const WAT_FS = `
    precision mediump float;
    varying vec3 vW; varying float vDist;
    uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uHor; uniform vec3 uCamPos;
    uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uTime; uniform float uDay;
    void main() {
      vec2 p = vW.xz;
      float w1 = sin(p.x * 0.5 + uTime * 1.15) + sin(p.y * 0.43 - uTime * 0.85);
      float w2 = sin((p.x + p.y) * 0.19 + uTime * 0.5);
      vec3 n = normalize(vec3(w1 * 0.07 + w2 * 0.03, 1.0, w1 * 0.05 - w2 * 0.05));
      vec3 view = normalize(uCamPos - vW);
      float fres = pow(1.0 - max(view.y, 0.0), 2.0);
      vec3 deep = mix(vec3(0.012, 0.03, 0.045), vec3(0.05, 0.11, 0.14), uDay);
      vec3 c = mix(deep, uHor, fres * 0.6);
      vec3 hv = normalize(view + uSunDir);
      c += uSunCol * pow(max(dot(n, hv), 0.0), 70.0) * 0.7;
      float f = smoothstep(uFogNear, uFogFar, vDist);
      c = mix(c, uFog, f);
      gl_FragColor = vec4(c, 0.88);
    }`;
  const litP = mkProg(LIT_VS, LIT_FS), skyP = mkProg(SKY_VS, SKY_FS), watP = mkProg(WAT_VS, WAT_FS);
  if (glFails.length) {
    wyFail("The province could not take shape here", "This device's graphics compiler refused the game's shaders:\n" + glFails.join("\n"));
    return;
  }
  const LU = {
    mvp: gl.getUniformLocation(litP, "uMVP"), camPos: gl.getUniformLocation(litP, "uCamPos"),
    sunDir: gl.getUniformLocation(litP, "uSunDir"), sunCol: gl.getUniformLocation(litP, "uSunCol"),
    ambSky: gl.getUniformLocation(litP, "uAmbSky"), ambGnd: gl.getUniformLocation(litP, "uAmbGnd"),
    fogColor: gl.getUniformLocation(litP, "uFogColor"), fogNear: gl.getUniformLocation(litP, "uFogNear"), fogFar: gl.getUniformLocation(litP, "uFogFar"),
    alphaTest: gl.getUniformLocation(litP, "uAlphaTest"), emiss: gl.getUniformLocation(litP, "uEmiss"),
    atlas: gl.getUniformLocation(litP, "uAtlas"), pl: gl.getUniformLocation(litP, "uPL"), plCol: gl.getUniformLocation(litP, "uPLCol"),
  };
  const SU = {
    vp: gl.getUniformLocation(skyP, "uVP"), zen: gl.getUniformLocation(skyP, "uZen"), hor: gl.getUniformLocation(skyP, "uHor"),
    sunDir: gl.getUniformLocation(skyP, "uSunDir"), sunCol: gl.getUniformLocation(skyP, "uSunCol"),
    moonDir: gl.getUniformLocation(skyP, "uMoonDir"), night: gl.getUniformLocation(skyP, "uNight"), time: gl.getUniformLocation(skyP, "uTime"),
  };
  const WU = {
    mvp: gl.getUniformLocation(watP, "uMVP"), cam: gl.getUniformLocation(watP, "uCam"), camPos: gl.getUniformLocation(watP, "uCamPos"),
    sunDir: gl.getUniformLocation(watP, "uSunDir"), sunCol: gl.getUniformLocation(watP, "uSunCol"), hor: gl.getUniformLocation(watP, "uHor"),
    fog: gl.getUniformLocation(watP, "uFog"), fogNear: gl.getUniformLocation(watP, "uFogNear"), fogFar: gl.getUniformLocation(watP, "uFogFar"),
    time: gl.getUniformLocation(watP, "uTime"), day: gl.getUniformLocation(watP, "uDay"),
  };
  const aPos = gl.getAttribLocation(litP, "aPos"), aNor = gl.getAttribLocation(litP, "aNor"), aCol = gl.getAttribLocation(litP, "aCol"), aUV = gl.getAttribLocation(litP, "aUV");
  const aPosS = gl.getAttribLocation(skyP, "aPos");
  const aPosW = gl.getAttribLocation(watP, "aPos");
  /* the atlas, bound once */
  const atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  const mkDyn = (floats: number) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    return b;
  };
  const dynBuf = mkDyn(520000), staBuf = gl.createBuffer(), cutBuf = gl.createBuffer(), gloBuf = gl.createBuffer();
  let staCount = 0, cutCount = 0, gloCount = 0;
  const skyBuf = gl.createBuffer();
  {
    const R = 1500;
    const pts: number[] = [];
    const verts: Array<[number, number, number]> = [[R, 0, 0], [-R, 0, 0], [0, R, 0], [0, -R, 0], [0, 0, R], [0, 0, -R]];
    const faces = [[2, 4, 0], [2, 0, 5], [2, 5, 1], [2, 1, 4], [3, 0, 4], [3, 5, 0], [3, 1, 5], [3, 4, 1]];
    for (const f of faces) for (const vi of f) pts.push(...verts[vi]);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
  }
  const watBuf2 = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, watBuf2);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -880, 0.35, -880, 880, 0.35, -880, -880, 0.35, 880,
    880, 0.35, -880, 880, 0.35, 880, -880, 0.35, 880,
  ]), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  const upBuf = (buf: WebGLBuffer | null, arr: V) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return arr.length / 11;
  };
  uploadScene = () => {
    if (scene.kind === "interior") {
      staCount = upBuf(staBuf, scene.scene.geo);
      cutCount = upBuf(cutBuf, []);
      gloCount = upBuf(gloBuf, []);
    } else if (scene.kind === "dungeon") {
      staCount = upBuf(staBuf, scene.scene.geo);
      cutCount = upBuf(cutBuf, []);
      gloCount = upBuf(gloBuf, []);
    } else {
      staCount = upBuf(staBuf, WORLD_STATIC);
      cutCount = upBuf(cutBuf, WORLD_CUTOUT);
      gloCount = upBuf(gloBuf, WIN_GLOW);
    }
  };
  const bindLit = (buf: WebGLBuffer | null) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNor); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 44, 0);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 44, 12);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 44, 24);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 44, 36);
  };
  const plPos = new Float32Array(24), plColA = new Float32Array(18);
  function fillLights(camX: number, camY: number, camZ: number, now: number, nightF: number) {
    const cand: Array<{ a: LightAnchor; d: number }> = [];
    if (scene.kind !== "overworld") cand.push({ a: { x: camX, y: camY + 0.3, z: camZ, range: 8.5, col: [1.0, 0.8, 0.55], flicker: true }, d: -1 });
    for (const a of sceneLights) {
      const d = (a.x - camX) ** 2 + (a.z - camZ) ** 2;
      if (d < 3600) cand.push({ a, d });
    }
    cand.sort((p, q) => p.d - q.d);
    for (let i = 0; i < 6; i++) {
      if (i < cand.length) {
        const a = cand[i].a;
        let inten = a.flicker ? 0.82 + 0.33 * vnoise(now * 7, i * 17.3) : 1;
        if (scene.kind === "overworld" && !a.flicker) inten *= (0.12 + nightF * 0.95) * 1.7;
        plPos[i * 4] = a.x; plPos[i * 4 + 1] = a.y; plPos[i * 4 + 2] = a.z; plPos[i * 4 + 3] = a.range;
        plColA[i * 3] = a.col[0] * inten; plColA[i * 3 + 1] = a.col[1] * inten; plColA[i * 3 + 2] = a.col[2] * inten;
      } else if (i === cand.length && spellLight > 0) {
        plPos[i * 4] = camX; plPos[i * 4 + 1] = camY + 0.4; plPos[i * 4 + 2] = camZ; plPos[i * 4 + 3] = 13;
        plColA[i * 3] = 0.65 * spellLight * 3; plColA[i * 3 + 1] = 0.5 * spellLight * 3; plColA[i * 3 + 2] = 1.0 * spellLight * 3;
      } else {
        plPos[i * 4 + 3] = 0;
        plColA[i * 3] = plColA[i * 3 + 1] = plColA[i * 3 + 2] = 0;
      }
    }
    gl.uniform4fv(LU.pl, plPos);
    gl.uniform3fv(LU.plCol, plColA);
  }

  const dynCut: V = [], dynBlend: V = [], dynAdd: V = [];
  let lastAudioPlace = "";
  function render(now: number) {
    const w = wrap.clientWidth || 1024, h = wrap.clientHeight || 640;
    const dprSel = cfg.dpr === 0 ? Math.min(window.devicePixelRatio || 1, 2) : cfg.dpr;
    const cw = Math.max(2, Math.round(w * dprSel)), chh = Math.max(2, Math.round(h * dprSel));
    if (canvas.width !== cw || canvas.height !== chh) { canvas.width = cw; canvas.height = chh; }
    gl.viewport(0, 0, cw, chh);
    let camX = px, camY = eyeY, camZ = pz, yaw = pyaw, pitch = ppitch;
    if (scene.kind === "title") {
      const a = now * 0.02;
      camX = Math.cos(a) * 118; camZ = -120 + Math.sin(a) * 118;
      camY = wyHeight(camX, camZ) + 27;
      yaw = Math.atan2(-(0 - camX), -(-120 - camZ));
      pitch = -0.26;
    }
    if (shake > 0) {
      camX += Math.sin(now * 43) * shake * 0.05;
      camY += Math.sin(now * 51 + 2) * shake * 0.05;
    }
    const cp = Math.cos(pitch);
    const dir: [number, number, number] = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const eye: [number, number, number] = [camX, camY, camZ];
    const vpM = m4.mul(m4.persp(1.09, cw / chh, 0.1, 2400), m4.lookAt(eye, [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]], [0, 1, 0]));
    const hr = hourNow();
    const sunAng = ((hr - 6) / 12) * Math.PI;
    const sunDir: [number, number, number] = [Math.cos(sunAng) * 0.72, Math.sin(sunAng), 0.38];
    const sl = Math.hypot(...sunDir) || 1;
    sunDir[0] /= sl; sunDir[1] /= sl; sunDir[2] /= sl;
    const night = clamp(0.28 - sunDir[1] * 2.1, 0, 1);
    const sunset = clamp(1 - Math.abs(sunDir[1]) * 2.6, 0, 1);
    const inDark = scene.kind === "interior" || scene.kind === "dungeon";
    const dayF = 1 - night;
    let sunCol: Col3, ambSky: Col3, ambGnd: Col3, fogCol: Col3, fogNear: number, fogFar: number, litSun: Col3;
    if (scene.kind === "dungeon") {
      litSun = [0.3, 0.5, 0.2]; sunCol = [0.05, 0.045, 0.04];
      ambSky = [0.235, 0.21, 0.18]; ambGnd = [0.125, 0.11, 0.095];
      fogCol = [0.028, 0.024, 0.02]; fogNear = 3; fogFar = 31;
    } else if (scene.kind === "interior") {
      litSun = [0.35, 0.7, 0.3]; sunCol = [0.30, 0.26, 0.20];
      ambSky = [0.52, 0.46, 0.38]; ambGnd = [0.30, 0.25, 0.20];
      fogCol = [0.05, 0.04, 0.033]; fogNear = 6; fogFar = 42;
    } else {
      litSun = sunDir[1] < -0.04 ? [-sunDir[0] * 0.4, 0.55, -sunDir[2] * 0.4] : sunDir;
      const elev = clamp(sunDir[1] * 1.6, 0, 1);
      if (night > 0.55) {
        const ml = Math.hypot(litSun[0], litSun[1], litSun[2]) || 1;
        litSun = [litSun[0] / ml, litSun[1] / ml, litSun[2] / ml];
        sunCol = [0.30, 0.36, 0.50];
      } else {
        sunCol = [lerp(0.16, 1.06, elev) * lerp(1, 0.3, night), lerp(0.2, 0.97, elev) * lerp(1, 0.32, night), lerp(0.3, 0.84, elev) * lerp(1, 0.4, night)];
      }
      if (sunset > 0.3 && night < 0.6) { sunCol[0] *= 1.12; sunCol[1] *= 0.82; sunCol[2] *= 0.62; }
      ambSky = [lerp(0.44, 0.105, night), lerp(0.48, 0.12, night), lerp(0.55, 0.175, night)];
      ambGnd = [lerp(0.30, 0.05, night), lerp(0.27, 0.052, night), lerp(0.22, 0.065, night)];
      fogCol = [
        lerp(lerp(0.56, 0.72, sunset * 0.5), 0.035, night),
        lerp(lerp(0.62, 0.44, sunset * 0.5), 0.045, night),
        lerp(lerp(0.68, 0.30, sunset * 0.5), 0.085, night),
      ];
      fogNear = lerp(95, 26, night); fogFar = lerp(820, 310, night);
    }
    gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    /* sky */
    if (!inDark) {
      const zen: Col3 = [lerp(0.26, 0.010, night), lerp(0.44, 0.016, night), lerp(0.68, 0.05, night)];
      const hor: Col3 = [
        lerp(lerp(0.72, 0.90, sunset * 0.6), 0.05, night),
        lerp(lerp(0.77, 0.50, sunset * 0.6), 0.06, night),
        lerp(lerp(0.82, 0.26, sunset * 0.6), 0.105, night),
      ];
      const skySunCol: Col3 = [1.0 * dayF + 0.1, lerp(0.93, 0.5, sunset) * dayF + 0.05, lerp(0.82, 0.22, sunset) * dayF + 0.02];
      gl.useProgram(skyP);
      gl.uniformMatrix4fv(SU.vp, false, vpM);
      gl.uniform3fv(SU.zen, zen);
      gl.uniform3fv(SU.hor, hor);
      gl.uniform3fv(SU.sunDir, sunDir);
      gl.uniform3fv(SU.sunCol, skySunCol);
      gl.uniform3f(SU.moonDir, -sunDir[0], Math.max(0.18, -sunDir[1]), -sunDir[2]);
      gl.uniform1f(SU.night, night);
      gl.uniform1f(SU.time, now);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.enableVertexAttribArray(aPosS);
      gl.vertexAttribPointer(aPosS, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(aNor); gl.disableVertexAttribArray(aCol); gl.disableVertexAttribArray(aUV);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, 24);
      gl.depthMask(true);
    }
    /* the lit world */
    gl.useProgram(litP);
    gl.uniformMatrix4fv(LU.mvp, false, vpM);
    gl.uniform3fv(LU.camPos, eye);
    gl.uniform3fv(LU.sunDir, litSun);
    gl.uniform3fv(LU.sunCol, sunCol);
    gl.uniform3fv(LU.ambSky, ambSky);
    gl.uniform3fv(LU.ambGnd, ambGnd);
    gl.uniform3fv(LU.fogColor, fogCol);
    gl.uniform1f(LU.fogNear, fogNear);
    gl.uniform1f(LU.fogFar, fogFar);
    gl.uniform1i(LU.atlas, 0);
    fillLights(camX, camY, camZ, now, night);
    gl.uniform1f(LU.alphaTest, 0.0);
    gl.uniform1f(LU.emiss, 0.0);
    bindLit(staBuf);
    gl.drawArrays(gl.TRIANGLES, 0, staCount);
    gl.uniform1f(LU.alphaTest, 0.42);
    bindLit(cutBuf);
    gl.drawArrays(gl.TRIANGLES, 0, cutCount);
    if (!inDark && night > 0.04 && gloCount > 0) {
      gl.uniform1f(LU.alphaTest, 0.0);
      gl.uniform1f(LU.emiss, night * 0.95);
      bindLit(gloBuf);
      gl.drawArrays(gl.TRIANGLES, 0, gloCount);
      gl.uniform1f(LU.emiss, 0.0);
    }
    /* water */
    if (!inDark) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(watP);
      gl.uniformMatrix4fv(WU.mvp, false, vpM);
      gl.uniform2f(WU.cam, camX, camZ);
      gl.uniform3fv(WU.camPos, eye);
      gl.uniform3fv(WU.sunDir, litSun);
      gl.uniform3fv(WU.sunCol, sunCol);
      gl.uniform3fv(WU.hor, fogCol);
      gl.uniform3fv(WU.fog, fogCol);
      gl.uniform1f(WU.fogNear, fogNear);
      gl.uniform1f(WU.fogFar, fogFar);
      gl.uniform1f(WU.time, now);
      gl.uniform1f(WU.day, dayF);
      gl.bindBuffer(gl.ARRAY_BUFFER, watBuf2);
      gl.enableVertexAttribArray(aPosW);
      gl.vertexAttribPointer(aPosW, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      gl.useProgram(litP);
      gl.uniformMatrix4fv(LU.mvp, false, vpM);
    }
    /* ——— the living, assembled ——— */
    dynCut.length = 0; dynBlend.length = 0; dynAdd.length = 0;
    const frameOf = (moving: boolean, phase: number) => (moving ? [0, 1, 0, 2][Math.floor(phase * 1.7) % 4] : 0);
    const actorBill = (x: number, y: number, z: number, w: number, h: number, sprite: number, moving: boolean, phase: number, tint: Col3) => {
      if (Math.hypot(x - camX, z - camZ) > 110) return;
      bill(dynCut, x, y, z, w, h, camX, camZ, sprite + frameOf(moving, phase), tint);
    };
    if (scene.kind === "overworld") {
      for (const w of wanderers) {
        const wy = wyHeight(w.x, w.z);
        const moving = w.wait <= 0 && w.npc.role !== "guard";
        actorBill(w.x, wy, w.z, 1.18, 2.02, w.npc.sprite, moving, w.phase, [1, 1, 1]);
      }
      /* chimney smoke */
      for (const b of BUILDINGS) {
        const dx = b.x - camX, dz = b.z - camZ;
        if (dx * dx + dz * dz > 11000) continue;
        const topY = b.baseY + (b.floors === 2 ? 6.68 : 3.7) + 2.75;
        const lx = b.w * 0.225;
        const cxw = b.x + lx * Math.cos(b.yaw), czw = b.z + lx * Math.sin(b.yaw);
        for (let k = 0; k < 2; k++) {
          const ph = (now * 0.07 + hash2(b.x, b.z) + k * 0.5) % 1;
          bill(dynBlend, cxw + ph * 2.2, topY + ph * 7.5, czw, 1.2 + ph * 2.8, 1.2 + ph * 2.8, camX, camZ, T.SMOKE, [0.82, 0.82, 0.83]);
        }
      }
      /* clouds */
      for (let i = 0; i < 8; i++) {
        const cx2 = ((i * 397 + now * 0.7) % 1600) - 800;
        const cz2 = ((i * 613) % 1300) - 650;
        bill(dynBlend, cx2, 152 + (i % 4) * 11, cz2, 150 + (i % 3) * 60, 26 + (i % 3) * 8, camX, camZ, T.CLOUD, [1.18, 1.18, 1.22]);
      }
    }
    if (scene.kind === "interior") {
      for (const n of scene.scene.npcs) actorBill(n.x, 0, n.z, 1.18, 2.02, n.sprite, false, 0, [1, 1, 1]);
    }
    for (const f of foes) {
      if (f.dead) continue;
      const base = FOES[f.kind];
      const sc = f.boss ? 1.32 : 1;
      const tint: Col3 = f.flash > 0 ? [1 + f.flash * 1.3, 1 - f.flash * 0.55, 1 - f.flash * 0.55] : [1, 1, 1];
      actorBill(f.x, f.y, f.z, base.w * sc, base.h * sc, base.sprite, Math.hypot(f.vx, f.vz) > 0.4 || f.phase > 0, f.phase, tint);
    }
    for (const r of remains) {
      if (Math.hypot(r.x - camX, r.z - camZ) > 110) continue;
      decal(dynCut, r.x, r.y + 0.06, r.z, r.w, r.w * 0.86, r.yaw, r.sprite, [0.9, 0.88, 0.86]);
    }
    for (const t of tracers) {
      bill(dynAdd, t.x, t.y, t.z, 0.6, 0.6, camX, camZ, T.SPARK, t.hostile ? [1.5, 0.55, 0.45] : [1.2, 1.0, 1.6]);
    }
    for (const fl of sceneFlames) {
      const fs = fl.s * (0.92 + 0.16 * Math.sin(now * 11 + fl.x * 3 + fl.z));
      bill(dynAdd, fl.x, fl.y, fl.z, 0.62 * fs, 0.85 * fs, camX, camZ, T.FLAME, [1.35, 1.1, 0.8]);
    }
    if (scene.kind === "overworld" && night > 0.05) {
      for (const a of WORLD_LIGHTS) {
        if (a.flicker || Math.hypot(a.x - camX, a.z - camZ) > 60) continue;
        bill(dynAdd, a.x, a.y - 0.1, a.z, 0.85, 0.85, camX, camZ, T.FLAME, [1.2 * night, 0.95 * night, 0.6 * night]);
      }
    }
    /* dynamic draws */
    gl.uniform1f(LU.alphaTest, 0.42);
    if (dynCut.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(dynCut));
      bindLit(dynBuf);
      gl.drawArrays(gl.TRIANGLES, 0, dynCut.length / 11);
    }
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    if (dynBlend.length) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(LU.alphaTest, 0.02);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(dynBlend));
      bindLit(dynBuf);
      gl.drawArrays(gl.TRIANGLES, 0, dynBlend.length / 11);
    }
    if (dynAdd.length) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(LU.alphaTest, 0.02);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(dynAdd));
      bindLit(dynBuf);
      gl.drawArrays(gl.TRIANGLES, 0, dynAdd.length / 11);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    /* the sword in hand */
    if (playing() && !panelsOpen() && !dlgOpen) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const ident = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      gl.uniformMatrix4fv(LU.mvp, false, ident);
      gl.uniform3f(LU.camPos, 0, 0, 0);
      gl.uniform3f(LU.sunDir, 0.3, 0.8, 0.4);
      const vmK = inDark ? 0.8 : 1 - night * 0.45;
      gl.uniform3f(LU.sunCol, 0.5 * vmK, 0.48 * vmK, 0.44 * vmK);
      gl.uniform3f(LU.ambSky, 0.62 * vmK, 0.60 * vmK, 0.57 * vmK);
      gl.uniform3f(LU.ambGnd, 0.5 * vmK, 0.48 * vmK, 0.45 * vmK);
      gl.uniform1f(LU.fogFar, 1e6);
      gl.uniform1f(LU.alphaTest, 0.4);
      const vm: V = [];
      const p = swingT > 0 ? 1 - swingT / 0.34 : 0;
      const sw = Math.sin(p * Math.PI);
      const asp = chh / Math.max(1, cw);
      const cxp = (0.68 - sw * 0.30) * asp, cyp = -0.64 + sw * 0.16 + Math.sin(bobPhase * 2) * 0.006;
      const ang = -0.42 - sw * 1.30 + Math.sin(now * 1.3) * 0.015;
      const hw2 = 0.185 * asp, hh2 = 0.36;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const steel: Col3 = sheet && sheet.weapon >= 3 ? [1.18, 1.18, 1.24] : sheet && sheet.weapon >= 2 ? [1.02, 1.02, 1.05] : [0.88, 0.78, 0.68];
      const [u0, vB, u1, vT] = tileUV(T.SWORD);
      const corner = (lx: number, ly: number, u: number, v: number) => {
        vm.push(cxp + (lx * ca - ly * sa), cyp + (lx * sa + ly * ca), 0, 0, 0, 1, steel[0], steel[1], steel[2], u, v);
      };
      corner(-hw2, -hh2, u0, vB); corner(hw2, -hh2, u1, vB); corner(-hw2, hh2, u0, vT);
      corner(hw2, -hh2, u1, vB); corner(hw2, hh2, u1, vT); corner(-hw2, hh2, u0, vT);
      if (castCd > 0.28) {
        const k = (castCd - 0.28) / 0.17;
        const [su0, svB, su1, svT] = tileUV(T.SPARK);
        const sx2 = -0.52 * asp, sy2 = -0.42, ss = 0.17 * k + 0.05;
        const sc2: Col3 = [1.3 * k, 1.1 * k, 1.7 * k];
        const push2 = (x: number, y: number, u: number, v: number) => vm.push(x, y, 0, 0, 0, 1, sc2[0], sc2[1], sc2[2], u, v);
        push2(sx2 - ss, sy2 - ss, su0, svB); push2(sx2 + ss, sy2 - ss, su1, svB); push2(sx2 - ss, sy2 + ss, su0, svT);
        push2(sx2 + ss, sy2 - ss, su1, svB); push2(sx2 + ss, sy2 + ss, su1, svT); push2(sx2 - ss, sy2 + ss, su0, svT);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(vm));
      bindLit(dynBuf);
      gl.drawArrays(gl.TRIANGLES, 0, vm.length / 11);
    }
    /* ——— the telling ——— */
    if (sheet && started) {
      hpBar.style.width = `${clamp((sheet.hp / maxHp(sheet)) * 100, 0, 100)}%`;
      mpBar.style.width = `${clamp((sheet.mp / maxMp(sheet)) * 100, 0, 100)}%`;
      stBar.style.width = `${stamina}%`;
      const hh = Math.floor(hourNow()), mm = Math.floor((hourNow() % 1) * 60);
      clockEl.textContent = `Day ${dayCount} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${sheet.gold} gold`;
      const frac = (((pyaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      compStrip.style.transform = `translateX(${-frac * 50}%)`;
    }
    hurtEl.style.opacity = String(clamp(hurtT * 0.6, 0, 0.6));
    touchEl.style.visibility = isTouchDev && started && !panelsOpen() && scene.kind !== "title" ? "visible" : "hidden";
    if (isTouchDev) useBtn.textContent = curInteract ? (curInteract.label.split("—")[0] || "use").trim() : "use";
    interactEl.textContent = curInteract && playing() && !panelsOpen() ? (isTouchDev ? "" : curInteract.label + (cfg.mode === "mouse" ? "  ·  E" : "")) : "";
    crossEl.hidden = !(playing() && !panelsOpen());
    /* audio place */
    if (started && !dead) {
      const place = scene.kind === "dungeon" ? "dungeon" : scene.kind === "interior" ? (scene.b.kind === "tavern" ? "tavern" : scene.b.kind === "temple" ? "temple" : scene.b.kind === "guildf" || scene.b.kind === "guildm" ? "guild" : "town") : inTown(px, pz) ? "town" : "wilds";
      if (place !== lastAudioPlace) { lastAudioPlace = place; }
      audio.update(1 / 60, place as "town" | "wilds" | "tavern" | "temple" | "dungeon" | "guild", night > 0.5, scene.kind === "interior");
    }
  }

  /* ——— the frame ——— */
  let raf = 0, lastT = performance.now() / 1000, renderErrs = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    let dt = Math.min(0.05, now - lastT);
    lastT = now;
    if (started && !dead && !panelsOpen() && !dlgOpen) step(dt);
    else if (dlgOpen) { /* the world holds its breath */ }
    if (placeT > 0) { placeT -= dt; if (placeT <= 0) placeEl.hidden = true; }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
    try { render(now); } catch (e) {
      renderErrs++;
      if (renderErrs === 3) {
        cancelAnimationFrame(raf);
        wyFail("The province faltered", "Rendering failed on this device: " + (e instanceof Error ? e.message : String(e)));
      }
    }
    void dt;
  };
  try {
    buildTerrain();
    buildTowns();
    buildDressing();
    uploadScene();
    spawnWanderers();
  } catch (e) {
    wyFail("The province could not take shape here", "World-building failed on this device: " + (e instanceof Error ? e.message : String(e)));
    return;
  }
  createEl.hidden = false;
  frame();
  const obs = new MutationObserver(() => {
    if (!wrap.isConnected) {
      cancelAnimationFrame(raf);
      audio.shutdown();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onActKey);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
