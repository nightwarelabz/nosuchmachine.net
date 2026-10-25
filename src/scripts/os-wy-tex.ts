/* Wyrdfall's paintbox: a procedural texture atlas and a company of pixel
   actors, drawn once onto a single canvas in a muted, earthy palette —
   the posture of the old province games: timber and plaster, ashlar
   stone, thatch and slate, and people small against tall houses.
   Everything the renderer samples lives here; the game asks for a tile
   number and receives its place in the atlas. */

export const CELL = 128, COLS = 16, ATLAS_PX = 2048;

/* tile indices — the world's surfaces */
export const T = {
  GRASS: 0, GRASS_DRY: 1, DIRT: 2, ROAD: 3, COBBLE: 4, ROCK: 5, SAND: 6,
  STONE: 7, TIMBER: 8, PLANK_V: 9, PLANK_H: 10, THATCH: 11, SHINGLE: 12,
  BRICK: 13, FLAG: 14, MARBLE: 15, DOOR: 16, WINDOW: 17, STONE_DARK: 18,
  FOLIAGE: 19, BARK: 20, TUFT: 21, FLOWERS: 22, CHEST: 23, BARREL: 24,
  ALTAR: 25, SIGN: 26, EMB_TANKARD: 27, EMB_COIN: 28, EMB_SWORD: 29,
  EMB_MOON: 30, EMB_FLAME: 31, BANNER_G: 32, BANNER_M: 33, PLASTER: 34,
  HAY: 35, PORTCULLIS: 36, MOSSY: 37, BOOKS: 38, BED: 39, TABLE: 40,
  GATE: 41, ROOF_WOOD: 42, CLIFF: 43, LEAFGROUND: 44, STEPPING: 45, SWORD: 47,
  FLAME: 120, SMOKE: 121, SPARK: 123, MOON: 124, CLOUD: 126,
} as const;

/* actor indices — each actor owns three cells: stand, stride, counter-stride */
export const SPR = {
  KNIGHT: 64, RANGER: 67, SORCERER: 70, ROGUE: 73, INNKEEP: 76,
  MERCHANT: 79, PRIEST: 82, GUILD: 85, COVEN: 88, TOWNS_A: 91,
  TOWNS_B: 94, TOWNS_C: 97, GUARD: 100, WOLF: 103, SKELETON: 106,
  BANDIT: 109, RAT: 112, CULTIST: 115, CORPSE: 118,
} as const;

/* UV bounds of a cell, inset a hair so neighbours never bleed.
   Returns [u0, vBottom, u1, vTop] for use with FLIP_Y upload. */
export function tileUV(i: number): [number, number, number, number] {
  const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
  const ins = 0.75;
  const u0 = (cx + ins) / ATLAS_PX, u1 = (cx + CELL - ins) / ATLAS_PX;
  const vT = 1 - (cy + ins) / ATLAS_PX, vB = 1 - (cy + CELL - ins) / ATLAS_PX;
  return [u0, vB, u1, vT];
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

class Tile {
  constructor(private g: Ctx, private ox: number, private oy: number, private rnd: () => number) {}
  fill(c: string) { this.g.fillStyle = c; this.g.fillRect(this.ox, this.oy, CELL, CELL); }
  px(x: number, y: number, w: number, h: number, c: string) {
    this.g.fillStyle = c; this.g.fillRect(this.ox + x, this.oy + y, w, h);
  }
  /* scattered flecks of colour, the cheapest honesty a surface can have */
  fleck(c: string, n: number, s = 2) {
    this.g.fillStyle = c;
    for (let i = 0; i < n; i++) this.g.fillRect(this.ox + Math.floor(this.rnd() * (CELL - s)), this.oy + Math.floor(this.rnd() * (CELL - s)), s, s);
  }
  flecks(pairs: Array<[string, number]>, s = 2) { for (const [c, n] of pairs) this.fleck(c, n, s); }
  grain(c: string, n: number, vertical = true) {
    this.g.fillStyle = c;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(this.rnd() * CELL), y = Math.floor(this.rnd() * CELL), l = 4 + Math.floor(this.rnd() * 12);
      if (vertical) this.g.fillRect(this.ox + x, this.oy + y, 1, l); else this.g.fillRect(this.ox + x, this.oy + y, l, 1);
    }
  }
}

function ashlar(t: Tile, base: string, mortar: string, hi: string, lo: string, rows = 4, dark = false) {
  t.fill(base);
  const rh = CELL / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh, off = r % 2 === 0 ? 0 : CELL / 4;
    t.px(0, y, CELL, 2, mortar);
    for (let x = -1; x < 3; x++) t.px(x * (CELL / 2) + off, y, 2, rh, mortar);
    t.px(0, y + 2, CELL, 2, hi);
    t.px(0, y + rh - 3, CELL, 3, lo);
  }
  t.flecks([[hi, 26], [lo, 30], [mortar, 14]], 3);
  if (dark) t.flecks([["#20241c", 22], ["#39402e", 12]], 4);
}

function planks(t: Tile, base: string, seam: string, grainC: string, vertical: boolean, n = 4) {
  t.fill(base);
  const w = CELL / n;
  for (let i = 0; i <= n; i++) {
    if (vertical) t.px(i * w - 1, 0, 2, CELL, seam); else t.px(0, i * w - 1, CELL, 2, seam);
  }
  t.grain(grainC, 60, vertical);
  t.flecks([[seam, 10]], 2);
}

function drawTiles(g: Ctx) {
  const tile = (idx: number, fn: (t: Tile) => void) => {
    const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
    fn(new Tile(g, ox, oy, mulberry(0x9e37 + idx * 131)));
  };

  tile(T.GRASS, (t) => {
    t.fill("#4a6128");
    t.flecks([["#556f30", 300], ["#3d5523", 260], ["#637a38", 120], ["#2f471d", 90]], 3);
    t.grain("#5d7836", 46);
  });
  tile(T.GRASS_DRY, (t) => {
    t.fill("#6d7038");
    t.flecks([["#7c8145", 260], ["#5d612f", 220], ["#8b8a52", 110], ["#4d5227", 70]], 3);
    t.grain("#83834c", 40);
  });
  tile(T.DIRT, (t) => {
    t.fill("#5d4630");
    t.flecks([["#6d5439", 240], ["#4c3823", 220], ["#7d6444", 90], ["#3e2d1c", 70]], 3);
    t.fleck("#8a7a5e", 26, 3);
  });
  tile(T.ROAD, (t) => {
    t.fill("#6b563c");
    t.flecks([["#77634a", 200], ["#584631", 190], ["#83704f", 80]], 3);
    t.px(0, 26, CELL, 7, "#57432c"); t.px(0, 95, CELL, 7, "#57432c");
    t.px(0, 30, CELL, 2, "#665136"); t.px(0, 99, CELL, 2, "#665136");
    t.fleck("#8d7c5f", 40, 3);
  });
  tile(T.COBBLE, (t) => {
    t.fill("#4e4a42");
    const s = 21;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const off = y % 2 === 0 ? 0 : s / 2;
      const tone = ["#6a655a", "#615b51", "#716a5e", "#5a554c"][(x * 7 + y * 3) % 4];
      t.px(x * s + off - s / 2 + 2, y * s + 2, s - 4, s - 4, tone);
      t.px(x * s + off - s / 2 + 2, y * s + 2, s - 4, 3, "#7d7769");
    }
    t.flecks([["#3f3b34", 60], ["#7d7769", 40]], 2);
  });
  tile(T.ROCK, (t) => {
    t.fill("#6b6257");
    t.flecks([["#7a7266", 180], ["#59524a", 200], ["#847a6b", 90]], 4);
    t.px(8, 30, 52, 5, "#59524a"); t.px(66, 74, 44, 5, "#504a42"); t.px(20, 96, 60, 4, "#59524a");
    t.px(14, 22, 40, 3, "#8a8071"); t.px(70, 66, 30, 3, "#8a8071");
  });
  tile(T.CLIFF, (t) => {
    t.fill("#675d50");
    for (let y = 0; y < 8; y++) { t.px(0, y * 16 + 12, CELL, 4, "#4f473d"); t.px(0, y * 16, CELL, 2, "#7d7263"); }
    t.flecks([["#7a7060", 130], ["#554d42", 150]], 3);
  });
  tile(T.SAND, (t) => {
    t.fill("#a08d5f");
    t.flecks([["#b09d6d", 260], ["#8f7c52", 200], ["#bfae7d", 90]], 2);
  });
  tile(T.STONE, (t) => ashlar(t, "#7b7568", "#4c463d", "#8d877a", "#5f594f"));
  tile(T.STONE_DARK, (t) => ashlar(t, "#5b564c", "#37332c", "#6b665b", "#454139", 4, true));
  tile(T.TIMBER, (t) => {
    t.fill("#cbb894");
    t.flecks([["#bfae87", 150], ["#d8c6a2", 120], ["#b3a07a", 60]], 3);
    const beam = "#4e3620", beamHi = "#63472a";
    t.px(0, 0, CELL, 10, beam); t.px(0, CELL - 10, CELL, 10, beam);
    t.px(0, 0, 10, CELL, beam); t.px(CELL - 10, 0, 10, CELL, beam);
    t.px(0, 0, CELL, 3, beamHi); t.px(0, 59, CELL, 9, beam); t.px(0, 59, CELL, 2, beamHi);
    t.px(58, 0, 10, CELL, beam);
    for (let i = 0; i < 10; i++) { t.px(10 + i * 5, 10 + i * 5, 5, 5, beam); t.px(CELL - 15 - i * 5, 10 + i * 5, 5, 5, beam); }
  });
  tile(T.PLANK_V, (t) => planks(t, "#77572f", "#54391d", "#86643a", true));
  tile(T.PLANK_H, (t) => planks(t, "#6e5029", "#4c3418", "#7d5c33", false));
  tile(T.THATCH, (t) => {
    t.fill("#8a6d35");
    for (let r = 0; r < 4; r++) {
      t.px(0, r * 32 + 26, CELL, 6, "#6e5626");
      t.px(0, r * 32 + 26, CELL, 2, "#a0803f");
    }
    t.grain("#9c7f42", 130); t.grain("#755a29", 110);
    t.flecks([["#a8894a", 60]], 2);
  });
  tile(T.SHINGLE, (t) => {
    t.fill("#4c4a4e");
    const w = 32, h = 21;
    for (let r = 0; r < 7; r++) {
      const off = r % 2 === 0 ? 0 : w / 2;
      for (let x = -1; x < 5; x++) {
        const tone = ["#5a585e", "#54525a", "#605e63", "#4c4a52"][(x * 5 + r * 3) % 4];
        t.px(x * w + off + 2, r * h + 2, w - 4, h - 3, tone);
        t.px(x * w + off + 2, r * h + h - 4, w - 4, 3, "#353338");
      }
    }
  });
  tile(T.ROOF_WOOD, (t) => {
    t.fill("#5d4023");
    for (let r = 0; r < 6; r++) {
      t.px(0, r * 22 + 17, CELL, 5, "#422c15");
      for (let x = 0; x < 4; x++) t.px(x * 32 + (r % 2) * 16, r * 22, 2, 17, "#4e3519");
      t.px(0, r * 22, CELL, 2, "#715231");
    }
    t.grain("#6b4c2a", 50, false);
  });
  tile(T.BRICK, (t) => {
    t.fill("#4a3430");
    const bh = 16, bw = 42;
    for (let r = 0; r < 8; r++) {
      const off = r % 2 === 0 ? 0 : bw / 2;
      t.px(0, r * bh, CELL, 2, "#2e201d");
      for (let x = -1; x < 4; x++) {
        t.px(x * bw + off, r * bh, 2, bh, "#2e201d");
        const tone = ["#5a4038", "#523a34", "#60453c"][(x * 3 + r * 7) % 3];
        t.px(x * bw + off + 2, r * bh + 2, bw - 3, bh - 4, tone);
      }
    }
    t.flecks([["#241816", 40], ["#6b4a3e", 26]], 3);
  });
  tile(T.FLAG, (t) => {
    t.fill("#3d3831");
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const tone = ["#554f45", "#4c463d", "#59524a", "#463f36"][(x + y * 2) % 4];
      t.px(x * 64 + 3, y * 64 + 3, 58, 58, tone);
      t.px(x * 64 + 3, y * 64 + 3, 58, 4, "#655c4f");
    }
    t.px(30, 8, 3, 40, "#332e27"); t.px(76, 70, 26, 3, "#332e27");
    t.flecks([["#2c2822", 40]], 3);
  });
  tile(T.MARBLE, (t) => {
    t.fill("#cfc8b4");
    t.flecks([["#c0b9a5", 130], ["#ded8c6", 130]], 3);
    t.px(10, 40, 46, 2, "#a8a28e"); t.px(56, 41, 30, 2, "#a8a28e"); t.px(70, 84, 44, 2, "#a8a28e"); t.px(20, 100, 26, 2, "#b3ad99");
    t.px(0, 62, CELL, 3, "#b8b29e"); t.px(62, 0, 3, CELL, "#b8b29e");
  });
  tile(T.PLASTER, (t) => {
    t.fill("#c2b193");
    t.flecks([["#b3a284", 170], ["#d0c0a0", 150], ["#a99573", 50]], 3);
  });
  tile(T.DOOR, (t) => {
    planks(t, "#5d4023", "#3d2812", "#6b4c2a", true, 5);
    t.px(0, 14, CELL, 9, "#2e2c2c"); t.px(0, 104, CELL, 9, "#2e2c2c");
    t.px(0, 14, CELL, 2, "#4a4848"); t.px(0, 104, CELL, 2, "#4a4848");
    t.px(96, 58, 16, 5, "#2e2c2c"); t.px(102, 58, 6, 16, "#2e2c2c");
    t.px(100, 72, 10, 10, "#3d3b3b");
  });
  tile(T.GATE, (t) => {
    planks(t, "#54391d", "#38240f", "#63472a", true, 5);
    t.px(0, 8, CELL, 12, "#33241a"); t.px(0, 62, CELL, 12, "#33241a"); t.px(0, 108, CELL, 12, "#33241a");
    for (let i = 0; i < 12; i++) t.px(6 + i * 10, 30 + i * 3, 6, 6, "#2e2c2c");
  });
  tile(T.WINDOW, (t) => {
    t.fill("#3a2c1c");
    t.px(8, 8, 112, 112, "#241a10");
    t.px(14, 14, 100, 100, "#e8a83e");
    t.px(14, 14, 100, 100, "#d18f2a");
    t.px(20, 20, 40, 42, "#f4bc55"); t.px(68, 20, 40, 42, "#eda93e");
    t.px(20, 68, 40, 40, "#eda93e"); t.px(68, 68, 40, 40, "#f7c86a");
    t.px(60, 14, 8, 100, "#241a10"); t.px(14, 60, 100, 8, "#241a10");
    t.px(8, 8, 112, 5, "#54391d"); t.px(8, 115, 112, 5, "#54391d");
  });
  tile(T.FOLIAGE, (t) => {
    g.clearRect((T.FOLIAGE % COLS) * CELL, Math.floor(T.FOLIAGE / COLS) * CELL, CELL, CELL);
    const rnd = mulberry(0xf011);
    for (let i = 0; i < 240; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.6) * 56;
      const x = 64 + Math.cos(a) * rr - 7, y = 64 + Math.sin(a) * rr * 0.92 - 7;
      const tone = ["#3d5523", "#4a6128", "#556f30", "#354d20", "#637a38"][(rnd() * 5) | 0];
      t.px(x, y, 15, 12, tone);
      t.px(x + 2, y + 1, 6, 4, "#6d8742");
    }
  });
  tile(T.BARK, (t) => {
    t.fill("#4c3823");
    for (let x = 0; x < 8; x++) {
      t.px(x * 16 + 2, 0, 5, CELL, "#3a2a18");
      t.px(x * 16 + 9, 0, 3, CELL, "#5d4630");
    }
    t.flecks([["#2e2012", 40], ["#665034", 34]], 4);
  });
  tile(T.TUFT, (t) => {
    const ox = (T.TUFT % COLS) * CELL, oy = Math.floor(T.TUFT / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    for (let i = 0; i < 26; i++) {
      const x = 8 + ((i * 37) % 112), sway = ((i * 13) % 9) - 4;
      const hgt = 34 + ((i * 29) % 40);
      const tone = i % 3 === 0 ? "#637a38" : i % 3 === 1 ? "#4a6128" : "#556f30";
      t.px(x, CELL - hgt, 3, hgt, tone);
      t.px(x + sway, CELL - hgt - 4, 3, 8, tone);
    }
  });
  tile(T.FLOWERS, (t) => {
    const ox = (T.FLOWERS % COLS) * CELL, oy = Math.floor(T.FLOWERS / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    for (let i = 0; i < 18; i++) {
      const x = 10 + ((i * 41) % 108), hgt = 26 + ((i * 17) % 30);
      t.px(x, CELL - hgt, 2, hgt, "#41602a");
      const c = ["#c9b458", "#b4584e", "#d8d3e8", "#c98ab4"][i % 4];
      t.px(x - 3, CELL - hgt - 6, 8, 7, c);
      t.px(x - 1, CELL - hgt - 4, 4, 3, "#e8dfae");
    }
  });
  tile(T.CHEST, (t) => {
    planks(t, "#6e5029", "#4c3418", "#7d5c33", false, 3);
    t.px(0, 0, CELL, 16, "#77572f"); t.px(0, 16, CELL, 5, "#33241a");
    t.px(8, 0, 12, CELL, "#2e2c2c"); t.px(108, 0, 12, CELL, "#2e2c2c");
    t.px(52, 44, 24, 30, "#3d3b3b"); t.px(57, 50, 14, 10, "#c9a227"); t.px(61, 58, 6, 10, "#8a6d1c");
  });
  tile(T.BARREL, (t) => {
    planks(t, "#77572f", "#54391d", "#86643a", true, 6);
    t.px(0, 18, CELL, 8, "#2e2c2c"); t.px(0, 102, CELL, 8, "#2e2c2c");
    t.px(0, 18, CELL, 2, "#4a4848"); t.px(0, 102, CELL, 2, "#4a4848");
  });
  tile(T.ALTAR, (t) => {
    ashlar(t, "#8d877a", "#5f594f", "#a09a8c", "#6e695e", 3);
    t.px(14, 0, 100, 44, "#7d1f1a");
    t.px(14, 40, 100, 4, "#c9a227");
    t.px(58, 8, 12, 28, "#e8e2d2"); t.px(50, 16, 28, 7, "#e8e2d2");
  });
  tile(T.SIGN, (t) => {
    planks(t, "#6e5029", "#4c3418", "#7d5c33", false, 3);
    t.px(0, 0, CELL, 6, "#3d2812"); t.px(0, CELL - 6, CELL, 6, "#3d2812");
    t.px(0, 0, 6, CELL, "#3d2812"); t.px(CELL - 6, 0, 6, CELL, "#3d2812");
  });
  const emblem = (idx: number, draw: (t: Tile) => void) => tile(idx, (t) => {
    planks(t, "#54391d", "#38240f", "#63472a", false, 3);
    draw(t);
  });
  emblem(T.EMB_TANKARD, (t) => {
    t.px(44, 34, 34, 58, "#b9c0c9"); t.px(44, 34, 34, 8, "#e8e2d2");
    t.px(78, 46, 12, 30, "#8d9299"); t.px(48, 40, 26, 8, "#f4f0e2");
  });
  emblem(T.EMB_COIN, (t) => {
    t.px(38, 30, 52, 52, "#c9a227"); t.px(44, 36, 40, 40, "#dcb83e");
    t.px(58, 44, 12, 24, "#a8891f"); t.px(52, 50, 24, 6, "#a8891f");
  });
  emblem(T.EMB_SWORD, (t) => {
    t.px(60, 18, 8, 56, "#c9ced6"); t.px(60, 10, 8, 10, "#e8ecf2");
    t.px(40, 74, 48, 8, "#c9a227"); t.px(59, 82, 10, 22, "#54391d"); t.px(56, 102, 16, 8, "#c9a227");
  });
  emblem(T.EMB_MOON, (t) => {
    t.px(46, 26, 44, 60, "#d8d3e8"); t.px(64, 20, 40, 66, "#54391d");
    t.px(96, 34, 6, 6, "#e8e2d2"); t.px(34, 78, 5, 5, "#e8e2d2");
  });
  emblem(T.EMB_FLAME, (t) => {
    t.px(52, 52, 24, 34, "#e07b2a"); t.px(46, 66, 36, 20, "#c25e1e");
    t.px(58, 40, 12, 30, "#f4a83e"); t.px(60, 60, 8, 16, "#f7d774");
  });
  tile(T.BANNER_G, (t) => {
    t.fill("#2f4a28");
    t.px(0, 0, CELL, 8, "#c9a227"); t.px(6, 14, 116, 3, "#c9a227");
    t.px(52, 34, 24, 44, "#c9a227"); t.px(44, 44, 40, 10, "#c9a227");
    t.px(0, 108, CELL, 20, "#243a1e");
  });
  tile(T.BANNER_M, (t) => {
    t.fill("#3c2a56");
    t.px(0, 0, CELL, 8, "#b9c0c9");
    t.px(50, 30, 28, 48, "#b9c0c9"); t.px(64, 24, 30, 52, "#3c2a56");
    t.px(0, 108, CELL, 20, "#2c1f42");
  });
  tile(T.HAY, (t) => {
    t.fill("#a8894a");
    t.grain("#c2a35c", 160); t.grain("#8f713a", 130);
    t.px(0, 40, CELL, 5, "#7d6230"); t.px(0, 88, CELL, 5, "#7d6230");
  });
  tile(T.PORTCULLIS, (t) => {
    t.fill("#241f1a");
    for (let x = 0; x < 6; x++) { t.px(x * 22 + 4, 0, 7, CELL, "#4a4848"); t.px(x * 22 + 4, 0, 2, CELL, "#636161"); }
    for (let y = 0; y < 5; y++) { t.px(0, y * 28 + 6, CELL, 7, "#4a4848"); t.px(0, y * 28 + 6, CELL, 2, "#636161"); }
    for (let x = 0; x < 6; x++) t.px(x * 22 + 5, 116, 5, 12, "#333131");
  });
  tile(T.MOSSY, (t) => {
    ashlar(t, "#6a655a", "#454139", "#7a7568", "#524e44", 4, true);
    t.flecks([["#41602a", 66], ["#4a6128", 44]], 6);
  });
  tile(T.BOOKS, (t) => {
    t.fill("#3d2812");
    for (let r = 0; r < 3; r++) {
      const y = r * 43;
      t.px(0, y + 36, CELL, 6, "#54391d");
      let x = 4;
      while (x < 116) {
        const w = 7 + ((x * 7 + r * 13) % 6), h = 26 + ((x + r) % 8);
        const c = ["#7d2f26", "#2f4a6b", "#3f6034", "#6b5320", "#5b3a7e", "#715231"][(x * 3 + r) % 6];
        t.px(x, y + 34 - h, w, h, c);
        t.px(x, y + 34 - h + 4, w, 2, "#c9bfa8");
        x += w + 2;
      }
    }
  });
  tile(T.BED, (t) => {
    t.fill("#8e2f26");
    t.flecks([["#a03a30", 120], ["#7c281f", 100]], 3);
    t.px(0, 0, CELL, 30, "#e8e2d2"); t.px(0, 30, CELL, 4, "#b9b2a0");
    t.px(0, 96, CELL, 32, "#5d4630"); t.px(0, 92, CELL, 4, "#c9a227");
  });
  tile(T.TABLE, (t) => {
    planks(t, "#77572f", "#54391d", "#86643a", false, 4);
    t.px(20, 18, 26, 26, "#cfc8b4"); t.px(74, 66, 34, 10, "#b9c0c9");
    t.px(84, 20, 12, 12, "#c9a227");
  });
  tile(T.LEAFGROUND, (t) => {
    t.fill("#4c4a26");
    t.flecks([["#5d5a30", 200], ["#3e3c1e", 190], ["#6d6538", 90], ["#77572f", 60]], 3);
  });
  tile(T.STEPPING, (t) => {
    t.fill("#4a6128");
    t.flecks([["#556f30", 200], ["#3d5523", 170]], 3);
    t.px(30, 34, 66, 54, "#7b7568"); t.px(34, 38, 58, 46, "#867f71");
    t.px(40, 42, 30, 4, "#98917f");
  });
  tile(T.SWORD, (t) => {
    const ox = (T.SWORD % COLS) * CELL, oy = Math.floor(T.SWORD / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    t.px(58, 22, 12, 62, "#c9ced6"); t.px(58, 22, 12, 6, "#eef1f5");
    t.px(62, 30, 3, 50, "#8d9299");
    t.px(64, 6, 1, 18, "#eef1f5"); t.px(60, 12, 9, 6, "#dfe3e9"); t.px(61, 18, 6, 6, "#c9ced6");
    t.px(38, 84, 52, 9, "#c9a227"); t.px(38, 84, 52, 3, "#e3c34e");
    t.px(58, 93, 12, 22, "#54391d"); t.px(58, 99, 12, 3, "#3d2812"); t.px(58, 107, 12, 3, "#3d2812");
    t.px(54, 115, 20, 10, "#c9a227"); t.px(60, 117, 8, 6, "#8e2f26");
  });
  tile(T.FLAME, (t) => {
    const ox = (T.FLAME % COLS) * CELL, oy = Math.floor(T.FLAME / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    t.px(50, 58, 28, 44, "#e07b2a"); t.px(44, 72, 40, 30, "#c25e1e");
    t.px(56, 40, 16, 40, "#f4a83e"); t.px(58, 66, 12, 26, "#f7d774"); t.px(61, 80, 6, 14, "#fff3c4");
  });
  tile(T.SMOKE, (t) => {
    const ox = (T.SMOKE % COLS) * CELL, oy = Math.floor(T.SMOKE / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    const rnd = mulberry(0x510e);
    for (let i = 0; i < 26; i++) {
      const x = 24 + rnd() * 74, y = 24 + rnd() * 74, s = 14 + rnd() * 22;
      t.px(x, y, s, s * 0.8, "rgba(160,158,152,0.20)");
    }
  });
  tile(T.SPARK, (t) => {
    const ox = (T.SPARK % COLS) * CELL, oy = Math.floor(T.SPARK / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    t.px(52, 52, 24, 24, "#b48ae0"); t.px(58, 58, 12, 12, "#e6d4ff");
    t.px(62, 30, 4, 20, "#9a6ad0"); t.px(62, 78, 4, 20, "#9a6ad0");
    t.px(30, 62, 20, 4, "#9a6ad0"); t.px(78, 62, 20, 4, "#9a6ad0");
  });
  tile(T.MOON, (t) => {
    const ox = (T.MOON % COLS) * CELL, oy = Math.floor(T.MOON / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5, d = dx * dx + dy * dy;
      if (d < 200) {
        let c = "#ddd8c8";
        if (d > 168) c = "#c9c3ae";
        if ((x * 7 + y * 13) % 29 === 0) c = "#c2bca6";
        t.px(x * 4, y * 4, 4, 4, c);
      }
    }
  });
  tile(T.CLOUD, (t) => {
    const ox = (T.CLOUD % COLS) * CELL, oy = Math.floor(T.CLOUD / COLS) * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    const rnd = mulberry(0xc10d);
    for (let i = 0; i < 34; i++) {
      const x = 12 + rnd() * 92, y = 44 + rnd() * 36, s = 16 + rnd() * 26;
      t.px(x, y, s, s * 0.52, "rgba(232,230,226,0.16)");
    }
  });
}

/* ————— the company: pixel actors on a 32×32 grid, four paces to a cell —————
   Daggerfall's own posture: people and beasts as painted flats that turn
   to face you, drawn with a silhouette first and a palette second. Each
   actor is authored once standing; its stride replaces the leg rows, and
   the counter-stride is the stride mirrored. */

const PAL: Record<string, string> = {
  K: "#17130f", S: "#d9a877", s: "#b9835a", H: "#4a3220", h: "#2e2012",
  A: "#c9ced6", a: "#9aa2ac", D: "#626a74", L: "#7a5230", l: "#54391d",
  G: "#c9a227", W: "#e8e2d2", w: "#c9c2ae", R: "#8e2f26", r: "#6b211b",
  P: "#5b3a7e", p: "#422a5c", N: "#3f6034", n: "#2f4a28", B: "#ddd6c2",
  b: "#b0a78d", E: "#ffd23e", F: "#7d7a72", f: "#5a574f", M: "#5e1f1a",
  C: "#8a6d4a", c: "#6e5638", X: "#3a5a7d", x: "#2c435f",
};

interface ActorArt { stand: string[]; stride: string[]; swap?: Record<string, string> }

const A = (stand: string[], stride: string[], swap?: Record<string, string>): ActorArt => ({ stand, stride, swap });

const KNIGHT = A([
  "................................",
  "...............RR...............",
  "..............RRRR..............",
  "..............RRRR..............",
  "..........KKAAAAAAAAKK..........",
  ".........KAAAAAAAAAAAAAK........",
  ".........KAAAKKKKKKKAAAK........",
  ".........KAAKSSSSSSKAAAK........",
  "..........KKSSKKKKSSKK..........",
  "............SSSSSSSS............",
  "......KKK.KAAAAAAAAAAK.KKK......",
  ".....KAAAKKAAAAAAAAAAAKKAAAK....",
  "....KAAAAAKAGGGGGGGGAKAAAAAK....",
  "....KAAAAAKAGKAAAAKAKAAAAAK....",
  "....KAAAAAKAGKAAAAKKGAKAAAAK....",
  ".....KAAAKKAGGGGGGGGAKKAAAK.....",
  "......KKK.KAAAAAAAAAAK.KKK......",
  ".........KAAAAAAAAAAAAK.........",
  ".........KAAAAKAAKAAAAK.........",
  "..........KKKKKAAKKKKKK.........",
  "...............AA...............",
  "..............KAAK..............",
  "..............KAAK..............",
  "..............KAAK..............",
  ".............KAAAAK.............",
  ".............KAKKAK.............",
  ".............KAKKAK.............",
  ".............KAKKAK.............",
  ".............KAKKAK.............",
  "............KAAKKAAK............",
  "...........KAAAKKAAAK...........",
  "...........KKKKKKKKKK...........",
], [
  ".............KAAAAK.............",
  "............KAAKKAAK............",
  "...........KAAK..KAAK...........",
  "..........KAAK....KAAK..........",
  ".........KAAK......KAAK.........",
  ".........KAK........KAK.........",
  "........KAAK........KAAK........",
  "........KKKK........KKKK........",
]);

const RANGER = A([
  "................................",
  ".............NNNNNN.............",
  "............NNNNNNNN............",
  "...........NNNKKKKKKNNN...........",
  "...........NKSSSSSSKN...........",
  "............SSKKKKSS............",
  "............SSSSSSSS............",
  ".............sSSSSs.............",
  "......KKK.KNNNNNNNNNNK.KK.......",
  ".....KLLLKNNNNNNNNNNNNKLLL......",
  "....KLLLKNNNKGGGGKNNNNKLLLK.....",
  "....KLlLKNNNKGLLLKNNNNKLlLK.....",
  "....KLLLKNNNKGLLLKNNNNKLLLK.....",
  ".....KKKKNNNNKGGGGKNNNKKKK......",
  "..........KNNNNNNNNNNK.....K....",
  ".........KNNNKKKKKKNNNK....K....",
  ".........KNNNK....KNNNK...K.....",
  "..........KKK......KKK....K.....",
  "..........................K.....",
  "..........................K.....",
  "...............................",
  "..............ll................",
  ".............KllK...............",
  ".............KllK...............",
  "............KLLLLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "...........KLLKKLLK.............",
  "..........KLLLK KLLLK...........",
  "..........KKKKK KKKKK...........",
], [
  "............KLLLLK..............",
  "...........KLLKKLLK.............",
  "..........KLLK..KLLK............",
  ".........KLLK....KLLK...........",
  "........KLLK......KLLK..........",
  "........KLK........KLK..........",
  ".......KLLK........KLLK.........",
  ".......KKKK........KKKK.........",
]);

const SORCERER = A([
  "................................",
  "...............PP...............",
  "..............PPPP..............",
  ".............PPPPPP.............",
  "............PPPPPPPP............",
  "...........PPPPPPPPPP...........",
  "..........PPPPPPPPPPPP..........",
  ".........PPPPKSSSSKPPPP.........",
  "............SSSSSS..............",
  "............sSSSSs...KKK........",
  "......KKK.KPPPPPPPPK.KGEK.......",
  ".....KPPPKPPPPPPPPPPK.KGEK......",
  "....KPPPKPPPKGGGGKPPPK.KKK......",
  "....KPpPKPPPKGEGEKPPPK..........",
  "....KPPPKPPPKGGGGKPPPK..........",
  ".....KKKKPPPPPPPPPPPKK..........",
  ".........KPPPPPPPPPPK...........",
  ".........KPPPKKKKKPPK...........",
  ".........KPPPK...KPPK...........",
  ".........KPPPK...KPPK...........",
  ".........KPPPK...KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  "........KPPPK....KPPPK..........",
  "........KPPPK....KPPPK..........",
  "........KPPPK....KPPPK..........",
  "........KKKKK....KKKKK..........",
], [
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  ".........KPPK....KPPK...........",
  "........KPPPK....KPPPK..........",
  "........KPPPK....KPPPK..........",
  ".......KPPPK......KPPPK.........",
  ".......KKKKK......KKKKK.........",
]);

const ROGUE = A([
  "................................",
  "................................",
  ".............hhhhhh.............",
  "............hhhhhhhh............",
  "...........hhKSSSSKhh...........",
  "...........hKSSSSSSKh...........",
  "............SSKKKKSS............",
  "............ssssssss............",
  "......KKK.KllllllllllK.KKK......",
  ".....KLLLKllllllllllllKLLLK.....",
  "....KLLLKllKGGGGGGKlllkLLLK.....",
  "....KLlLKllKGLLLLLKlllkLlLK.....",
  "....KLLLKllKGLLLLLKlllkLLLK.....",
  ".....KKKKllKGGGGGGKlllKKKK......",
  ".........KllllllllllK...........",
  ".........KlllKKKKKlllK..........",
  ".........KlllK...KlllK..........",
  "..........KKK.....KKK...........",
  "................................",
  "................................",
  "..............DD................",
  ".............KDDK...............",
  ".............KDDK...............",
  ".............KllK...............",
  "............KllllK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "...........KllKKllK.............",
  "..........KlllK KlllK...........",
  "..........KKKKK KKKKK...........",
], [
  "............KllllK..............",
  "...........KllKKllK.............",
  "..........KllK..KllK............",
  ".........KllK....KllK...........",
  "........KllK......KllK..........",
  "........KlK........KlK..........",
  ".......KllK........KllK.........",
  ".......KKKK........KKKK.........",
]);

const INNKEEP = A([
  "................................",
  "................................",
  ".............HHHHHH.............",
  "............HHSSSSSHH...........",
  "............KSSSSSSK............",
  ".............SSSSSS.............",
  "............SsSSSSsS............",
  ".............sSSs...............",
  "......KKK.KCCCCCCCCCCK.KKK......",
  ".....KSSSKWWWWWWWWWWWWKSSSK.....",
  "....KSSSKWWWKGGGGKWWWWKSSSK.....",
  "....KSSSKWWWKWWWWKWWWWKSSSK.....",
  "....KSSSKWWWKWWWWKWWWWKSSSK.....",
  ".....KKKKWWWKGGGGKWWWWKKKK......",
  ".........KWWWWWWWWWWK...........",
  ".........KCCCCKKKKCCCK..........",
  ".........KCCCCK..KCCCCK.........",
  "..........KKKK....KKKK..........",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............KllK...............",
  "............KLLLLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "............KLKKLK..............",
  "...........KLLKKLLK.............",
  "..........KLLLK KLLLK...........",
  "..........KKKKK KKKKK...........",
], [
  "............KLLLLK..............",
  "...........KLLKKLLK.............",
  "..........KLLK..KLLK............",
  ".........KLLK....KLLK...........",
  "........KLLK......KLLK..........",
  "........KLK........KLK..........",
  ".......KLLK........KLLK.........",
  ".......KKKK........KKKK.........",
], { C: "#7d4a2a", c: "#5d3620" });

const MERCHANT = A([
  "................................",
  "...............GG...............",
  "..............KPPPPK............",
  ".............KPPPPPPK...........",
  "............KPKSSSSKPK..........",
  ".............KSSSSSSK...........",
  "..............SSSSSS............",
  "..............sSSs..............",
  "......KKK.KPPPPPPPPPPK.KKK......",
  ".....KPPPKPPPPPPPPPPPPKPPPK.....",
  "....KPPPKPPKGGGGGGKPPPKPPPK.....",
  "....KPpPKPPKGKGGKGKPPPKPpPK.....",
  "....KPPPKPPKGGGGGGKPPPKPPPK.....",
  ".....KKKKPPPPPPPPPPPPPPKKKK.....",
  ".........KPPPPPPPPPPK...........",
  ".........KPPPKKKKKPPPK..........",
  ".........KPPPK...KPPPK..........",
  "..........KKKK....KKKK..........",
  "................................",
  "................................",
  "................................",
  ".............KGGK...............",
  "............KGGGGK..............",
  "............KllllK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "............KlKKlK..............",
  "...........KllKKllK.............",
  "..........KlllK KlllK...........",
  "..........KKKKK KKKKK...........",
], [
  "............KllllK..............",
  "...........KllKKllK.............",
  "..........KllK..KllK............",
  ".........KllK....KllK...........",
  "........KllK......KllK..........",
  "........KlK........KlK..........",
  ".......KllK........KllK.........",
  ".......KKKK........KKKK.........",
]);

const PRIEST = A([
  "................................",
  "................................",
  ".............WWWWWW.............",
  "............WWSSSSWW............",
  "............KSSSSSSK............",
  ".............SSSSSS.............",
  ".............SSSSs..............",
  ".............sSSs...............",
  "......KKK.KWWWWWWWWWWK.KKK......",
  ".....KWWWKWWWWWWWWWWWWKWWWK.....",
  "....KWWWKWWWK.GG.KWWWWKWWWK.....",
  "....KWwWKWWWK.GG.KWWWWKWwWK.....",
  "....KWWWKWWWK.GG.KWWWWKWWWK.....",
  ".....KKKKWWWKGGGGKWWWWKKKK......",
  ".........KWWWWWWWWWWK...........",
  ".........KWWWKGGGKWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  "........KWWWWK...KWWWK..........",
  "........KWWWWK...KWWWK..........",
  "........KWWWWK...KWWWK..........",
  "........KKKKKK...KKKKK..........",
], [
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  ".........KWWWK...KWK............",
  "........KWWWWK...KWWWK..........",
  "........KWWWWK...KWWWK..........",
  ".......KWWWWK.....KWWWK.........",
  ".......KKKKKK.....KKKKK.........",
]);

const ROBED = (robe: string, shade: string, trim: string, hood = true): ActorArt => A([
  "................................",
  "................................",
  ...(hood ? [
    ".............CCCCCC.............",
    "............CCCCCCCC............",
    "...........CCKSSSSKCC...........",
    "...........CKSSSSSSKC...........",
    "............SSsKKsSS............",
    ".............sSSs...............",
  ] : [
    ".............HHHHHH.............",
    "............HHSSSSSHH...........",
    "............KSSSSSSK............",
    ".............SSSSSS.............",
    ".............sSSs...............",
    "................................",
  ]),
  "......KKK.KCCCCCCCCCCK.KKK......",
  ".....KCCCKCCCCCCCCCCCCKCCCK.....",
  "....KCCCKCCCKTTTTKCCCCKCCCK.....",
  "....KCcCKCCCKTccTKCCCCKCcCK.....",
  "....KCCCKCCCKTTTTKCCCCKCCCK.....",
  ".....KKKKCCCCCCCCCCCCCCKKKK.....",
  ".........KCCCCCCCCCCCK..........",
  ".........KCCCCKKKKCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  "........KCCCCCK..KCCCCCK........",
  "........KCCCCCK..KCCCCCK........",
  "........KCCCCCK..KCCCCCK........",
  "........KKKKKKK..KKKKKKK........",
], [
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  "........KCCCCCK..KCCCCCK........",
  "........KCCCCCK..KCCCCCK........",
  ".......KCCCCCK....KCCCCCK.......",
  ".......KCCCCCK....KCCCCCK.......",
  ".......KKKKKKK....KKKKKKK.......",
], { C: robe, c: shade, T: trim });

const GUILDMASTER = A([
  "................................",
  "................................",
  ".............HHHHHH.............",
  "............HHSSSSSHH...........",
  "............KSSSSSSK............",
  ".............SSSSSS.............",
  "............SSSSSSSS............",
  ".............sSSs...............",
  "......KKK.KXXXXXXXXXXK.KKK......",
  ".....KXXXKXXXXXXXXXXXXKXXXK.....",
  "....KXXXKXXXKGGGGKXXXXKXXXK.....",
  "....KXxXKXXXKGAAAKXXXXKXxXK.....",
  "....KXXXKXXXKGAAAKXXXXKXXXK.....",
  ".....KKKKXXXKGGGGKXXXXKKKK......",
  ".........KXXXXXXXXXXK...........",
  ".........KXXXXKKKKXXXXK.........",
  ".........KXXXXK..KXXXXK.........",
  "..........KKKK....KKKK..........",
  "................................",
  "................................",
  "..............AA................",
  ".............KAAK...............",
  ".............KAAK...............",
  "............KDDDDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "...........KDDKKD DK............",
  "..........KDDDK KDDDK...........",
  "..........KKKKK KKKKK...........",
], ROGUE.stride);

const TUNIC = (main: string, shade: string, hair = "H"): ActorArt => A([
  "................................",
  "................................",
  `.............${hair}${hair}${hair}${hair}${hair}${hair}.............`,
  `............${hair}${hair}SSSSSS${hair}${hair}...........`,
  "............KSSSSSSK............",
  ".............SSSSSS.............",
  ".............sSSSs..............",
  ".............sSSs...............",
  "......KKK.KCCCCCCCCCCK.KKK......",
  ".....KSSSKCCCCCCCCCCCCKSSSK.....",
  "....KSSSKCCCKLLLLKCCCCKSSSK.....",
  "....KSSSKCCCKLllLKCCCCKSSSK.....",
  "....KSSSKCCCKLLLLKCCCCKSSSK.....",
  ".....KKKKCCCCCCCCCCCCCCKKKK.....",
  ".........KCCCCCCCCCCCK..........",
  ".........KCCCCKKKKCCCCK.........",
  ".........KCCCCK..KCCCCK.........",
  "..........KKKK....KKKK..........",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............KccK...............",
  "............KCCCCK..............",
  "............KcKKcK..............",
  "............KcKKcK..............",
  "............KcKKcK..............",
  "............KcKKcK..............",
  "............KcKKcK..............",
  "...........KCCKKCCK.............",
  "..........KCCCK KCCCK...........",
  "..........KKKKK KKKKK...........",
], [
  "............KCCCCK..............",
  "...........KCCKKCCK.............",
  "..........KCCK..KCCK............",
  ".........KCCK....KCCK...........",
  "........KCCK......KCCK..........",
  "........KcK........KcK..........",
  ".......KCCK........KCCK.........",
  ".......KKKK........KKKK.........",
], { C: main, c: shade });

const DRESS = A([
  "................................",
  "................................",
  ".............hhhhhh.............",
  "............hhSSSShh............",
  "............KSSSSSSK............",
  ".............SSSSSS.............",
  "............SSSSSSS.............",
  ".............sSSs...............",
  "......KKK.KCCCCCCCCCCK.KKK......",
  ".....KSSSKCCCCCCCCCCCCKSSSK.....",
  "....KSSSKCCCKGGGGKCCCCKSSSK.....",
  "....KSSSKCCCKCCCCKCCCCKSSSK.....",
  "....KSSSKCCCCCCCCCCCCCKSSSK.....",
  ".....KKKKCCCCCCCCCCCCCCKKKK.....",
  ".........KCCCCCCCCCCCK..........",
  "........KCCCCCCCCCCCCCK.........",
  "........KCCCCCCCCCCCCCK.........",
  ".......KCCCCCCCCCCCCCCCK........",
  ".......KCCCCCCCCCCCCCCCK........",
  ".......KCCCKCCCCCKCCCCCK........",
  ".......KCCCCCCCCCCCCCCCK........",
  ".......KCCCCCCCCCCCCCCCK........",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  ".....KCCCCCCCCCCCCCCCCCCCK......",
  ".....KCCCCCCCCCCCCCCCCCCCK......",
  ".....KCCCCCCCCCCCCCCCCCCCK......",
  ".....KKKKKKKKKKKKKKKKKKKKK......",
], [
  ".......KCCCCCCCCCCCCCCCK........",
  ".......KCCCCCCCCCCCCCCCK........",
  ".......KCCCCCCCCCCCCCCCK........",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  "......KCCCCCCCCCCCCCCCCCK.......",
  ".....KCCCCCCCCCCCCCCCCCCCK......",
  ".....KKKKKKKKKKKKKKKKKKKKK......",
], { C: "#6b3a4a", c: "#522c38" });

const GUARD = A([
  "................................",
  "................................",
  "..........KKDDDDDDDDKK..........",
  ".........KDDDDDDDDDDDDK.........",
  ".........KDDDKSSSSKDDDK.........",
  "..........KKKSSSSSSKKK..........",
  ".............SSSSSS.............",
  ".............sSSSs..............",
  "......KKK.KaaaaaaaaaaK.KKK......",
  ".....KaaAKaaaaaaaaaaaaKAAaK.....",
  "....KAaAKaaKRRRRRRKaaaKAaAK.....",
  "....KAaAKaaKRKAAAKRaaaKAaAK....",
  "....KAaAKaaKRRRRRRKaaaKAaAK....",
  ".....KKKKaaaKaaaaKaaaaKKK.......",
  ".........KaaaaaaaaaaK......A....",
  ".........KaaaKKKKKaaaK.....A....",
  ".........KaaaK...KaaaK.....A....",
  "..........KKK.....KKK......A....",
  "...........................A....",
  "...........................A....",
  "...........................G....",
  "...............................",
  ".............KDDK...............",
  "............KDDDDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "............DKKKDK..............",
  "...........KDDKKD DK............",
  "..........KDDDK KDDDK...........",
  "..........KKKKK KKKKK...........",
], KNIGHT.stride);

const SKELETON = A([
  "................................",
  "................................",
  "............KBBBBBBK............",
  "...........KBBBBBBBBK...........",
  "...........KBKBBKBBBK...........",
  "...........KBBBBBBBBK...........",
  "............KBKBBKBK............",
  ".............KBBBBK.............",
  "...............BB...............",
  "......KKK..KBBBBBBBBK..KKK......",
  ".....KBBBK.BKBBBKBBKB.BKBBBK....",
  "....KBBBK..BKBBBKBBKB..KBBBK....",
  "....KBBBK..KBBBBBBBBK..KBBBK....",
  ".....KKK...BKBBBKBBKB...KKK.....",
  "...........BKBBBBBBKB...........",
  "...........KBBBBBBBBK......A....",
  "............KBBKBBK............A",
  ".............KBBBK.........A....",
  "..............BBB..........A....",
  "................................",
  "................................",
  "................................",
  "................................",
  ".............KBBBK..............",
  "............KBKKBK..............",
  "............KBKKBK..............",
  "............KBKKBK..............",
  "............KBKKBK..............",
  "............KBKKBK..............",
  "...........KBBK KBBK............",
  "..........KBBBK KBBBK...........",
  "..........KKKKK KKKKK...........",
], [
  ".............KBBBK..............",
  "............KBKKBK..............",
  "...........KBK..KBK.............",
  "..........KBK....KBK............",
  ".........KBK......KBK...........",
  ".........KBK......KBK...........",
  "........KBBK......KBBK..........",
  "........KKKK......KKKK..........",
]);

const BANDIT = A([
  "................................",
  "................................",
  ".............RRRRRR.............",
  "............RRSSSSRR............",
  "............KSSSSSSK............",
  ".............SKKKKKS............",
  ".............SSSSSS.............",
  ".............sSSSs..............",
  "......KKK.KLLLLLLLLLLK.KKK......",
  ".....KLLLKLLLLLLLLLLLLKLLLK.....",
  "....KLLLKLLKDDDDDDKLLLKLLLK.....",
  "....KLlLKLLKDLlLlDKLLLKLlLK.....",
  "....KLLLKLLKDDDDDDKLLLKLLLK.....",
  ".....KKKKLLLLLLLLLLLLLLKKKK.....",
  ".........KLLLLLLLLLLK...........",
  ".........KLLLKKKKKLLLK..........",
  ".........KLLLK...KLLLK..........",
  "..........KKKK....KKKK..........",
  "................................",
  "................................",
  ".........................DD.....",
  "........................KDDK....",
  ".............KllK......KLLLLK...",
  "............KLLLLK....KDDDDDK...",
  "............LLKKLLK.............",
  "............LLKKLLK.............",
  "............LLKKLLK.............",
  "............LLKKLLK.............",
  "............LLKKLLK.............",
  "...........KLLKKLLK.............",
  "..........KLLLK KLLLK...........",
  "..........KKKKK KKKKK...........",
], ROGUE.stride);

const WOLF = A([
  "................................",
  "................................",
  "................................",
  "................................",
  ".....KK.........................",
  "....KFFK........................",
  "....KFFFK....KKK................",
  "...KFFFFFK..KFFFK...............",
  "...KFEFFFK.KFFFFK...............",
  "....KFFFFKFFFFF K...............",
  ".....KKKKFFFFFFFK....KKK........",
  "........KFFFFFFFFFK.KFFFK.......",
  ".......KFFFFFFFFFFFFFfFFK.......",
  "......KFFFFFFFFFFFFFFFffK.......",
  "......KfFFFFFFFFFFFFFffK........",
  ".......KffFFFFFFFFFFfK..........",
  "........KKFFFFFFFFKK............",
  "..........KFFFFFFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KfK..KfK..............",
  ".........KFFK..KFFK.............",
  ".........KKKK..KKKK.............",
], [
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK..KFK..............",
  "..........KFK...KFK.............",
  ".........KFK.....KFK............",
  ".........KFK......KFK...........",
  "........KFFK.......KFFK.........",
  "........KKKK.......KKKK.........",
]);

const RAT = A([
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "...KK...........................",
  "..KFFK..........................",
  "..KFEFK..KKKKKKKKK..............",
  "...KFFFKFFFFFFFFfFFK....KKK....",
  "....KFFFFFFFFFFFFFffK..KsssK....",
  ".....KfFFFFFFFFFFfK....KssK.....",
  "......KKFFFFFFFFKK......KsK.....",
  "........KFK..KFK........KK......",
  "........KFK..KFK................",
  "........KFK..KFK................",
  "........KFK..KFK................",
  "........KFK..KFK................",
  "........KFK..KFK................",
  ".......KFFK..KFFK...............",
  ".......KKKK..KKKK...............",
], [
  "........KFK..KFK................",
  "........KFK..KFK................",
  "........KFK..KFK................",
  "........KFK...KFK...............",
  ".......KFK.....KFK..............",
  ".......KFK......KFK.............",
  "......KFFK.......KFFK...........",
  "......KKKK.......KKKK...........",
]);

const CORPSE = A([
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "...KKK..........................",
  "..KSSSK.KKKKKKKKKKKK.KKK.KKK....",
  "..KSSSKKCCCCCCCCCCCKKCCKKCCCK...",
  "...KKKKKCCCCCCCCCCCCCCCCCCCCK...",
  "......K.KKKKKKKKKKKK.KKK.KKK....",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
], []);

const ARTISTS: Record<number, ActorArt> = {
  [SPR.KNIGHT]: KNIGHT,
  [SPR.RANGER]: RANGER,
  [SPR.SORCERER]: SORCERER,
  [SPR.ROGUE]: ROGUE,
  [SPR.INNKEEP]: INNKEEP,
  [SPR.MERCHANT]: MERCHANT,
  [SPR.PRIEST]: PRIEST,
  [SPR.GUILD]: GUILDMASTER,
  [SPR.COVEN]: ROBED("#3a2a4a", "#2c1f38", "#b9c0c9"),
  [SPR.CULTIST]: ROBED("#4a2438", "#381b2a", "#c9a227"),
  [SPR.TOWNS_A]: TUNIC("#7d5c33", "#63472a"),
  [SPR.TOWNS_B]: DRESS,
  [SPR.TOWNS_C]: TUNIC("#5d5648", "#474238", "w"),
  [SPR.GUARD]: GUARD,
  [SPR.WOLF]: WOLF,
  [SPR.SKELETON]: SKELETON,
  [SPR.BANDIT]: BANDIT,
  [SPR.RAT]: RAT,
  [SPR.CORPSE]: CORPSE,
};

function paintActor(g: Ctx, cellIdx: number, art: ActorArt, frame: number) {
  const ox = (cellIdx % COLS) * CELL, oy = Math.floor(cellIdx / COLS) * CELL;
  const pal: Record<string, string> = { ...PAL, ...(art.swap || {}) };
  const useStride = (frame === 1 || frame === 2) && art.stride.length === 8;
  const flip = frame === 2;
  const pad = Math.max(0, 32 - art.stand.length);
  const rows: string[] = [];
  for (let i = 0; i < 32; i++) rows.push(i < pad ? "" : art.stand[i - pad]);
  if (useStride) for (let j = 0; j < 8; j++) rows[24 + j] = art.stride[j];
  const bob = useStride ? 1 : 0;
  for (let y = 0; y < 32; y++) {
    if (y + bob > 31) continue;
    const row = rows[y] || "";
    for (let x = 0; x < 32; x++) {
      const ch = row[flip ? 31 - x : x];
      if (!ch || ch === "." || ch === " ") continue;
      const c = pal[ch];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(ox + x * 4, oy + (y + bob) * 4, 4, 4);
    }
  }
}

export function makeAtlas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = ATLAS_PX; cv.height = ATLAS_PX;
  const g = cv.getContext("2d")!;
  drawTiles(g);
  for (const [idx, art] of Object.entries(ARTISTS)) {
    const base = Number(idx);
    paintActor(g, base, art, 0);
    paintActor(g, base + 1, art, 1);
    paintActor(g, base + 2, art, 2);
  }
  return cv;
}
