/* Forensics — the shared hand of the bench.
 *
 * Every parser the Forensics rooms stand on lives here, written
 * once and used by all of them: hashes, magic identification,
 * embedded-signature scanning, ZIP, EXIF, PNG, PDF, ID3, MP4,
 * strings, IOC extraction, PCAP/PCAPNG, EML, timeline sources,
 * and the FXBAG sealed-evidence container. Pure functions over
 * bytes — no DOM except the download door, no network at all:
 * what a room examines never leaves the tab.
 */
import { md5 } from "./os-shell";

/* ————— bytes ————— */
export const te = new TextEncoder();
export const td = new TextDecoder();
export const tdFatal = new TextDecoder("utf-8", { fatal: false });

export function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
export function fromHex(s: string): Uint8Array {
  const clean = s.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function asciiAt(b: Uint8Array, off: number, len: number): string {
  let s = "";
  for (let i = 0; i < len && off + i < b.length; i++) s += String.fromCharCode(b[off + i]);
  return s;
}
export function latin1(b: Uint8Array, start = 0, end = b.length): string {
  let s = "";
  const n = Math.min(b.length, end);
  for (let i = start; i < n; i++) s += String.fromCharCode(b[i]);
  return s;
}
export const u16le = (b: Uint8Array, o: number) => (o + 1 < b.length ? b[o] | (b[o + 1] << 8) : 0);
export const u16be = (b: Uint8Array, o: number) => (o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
export const u32le = (b: Uint8Array, o: number) => (o + 3 < b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : 0);
export const u32be = (b: Uint8Array, o: number) => (o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0);
export const i32le = (b: Uint8Array, o: number) => u32le(b, o) | 0;
export function u64leNum(b: Uint8Array, o: number): number { return u32le(b, o) + u32le(b, o + 4) * 4294967296; }
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(2)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
export function entropyOf(b: Uint8Array): number {
  if (!b.length) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const x of b) counts[x]++;
  let e = 0;
  for (const c of counts) if (c > 0) { const p = c / b.length; e -= p * Math.log2(p); }
  return Math.round(e * 1000) / 1000;
}
export function blockEntropies(b: Uint8Array, block = 256): number[] {
  const out: number[] = [];
  for (let i = 0; i < b.length; i += block) out.push(entropyOf(b.subarray(i, Math.min(b.length, i + block))));
  return out;
}

/* ————— hashes ————— */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
export function crc32(b: Uint8Array): string {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
async function subtle(bytes: Uint8Array, algo: string): Promise<string> {
  const d = await crypto.subtle.digest(algo, bytes as unknown as BufferSource);
  return toHex(new Uint8Array(d));
}
export interface HashSet { md5: string; sha1: string; sha256: string; sha384: string; sha512: string; crc32: string }
export async function hashAll(bytes: Uint8Array): Promise<HashSet> {
  const [sha1, sha256, sha384, sha512] = await Promise.all([
    subtle(bytes, "SHA-1"), subtle(bytes, "SHA-256"), subtle(bytes, "SHA-384"), subtle(bytes, "SHA-512"),
  ]);
  return { md5: md5(bytes), sha1, sha256, sha384, sha512, crc32: crc32(bytes) };
}
export async function sha256(bytes: Uint8Array): Promise<string> { return subtle(bytes, "SHA-256"); }

/* A guess at what a pasted hash is, from its shape alone. */
export function identifyHash(s: string): string {
  const v = s.trim();
  if (/^[0-9a-fA-F]+$/.test(v)) {
    const byLen: Record<number, string> = {
      8: "CRC32 (or another 32-bit checksum)", 32: "MD5 — or MD4 / NTLM, same shape",
      40: "SHA-1 — or RIPEMD-160, same shape", 56: "SHA-224 / SHA3-224", 64: "SHA-256 / SHA3-256 / BLAKE2s",
      96: "SHA-384 / SHA3-384", 128: "SHA-512 / SHA3-512 / BLAKE2b",
    };
    return byLen[v.length] || `hex, ${v.length} characters — no common digest has this length`;
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) return "base64-shaped, not a raw hex digest — decode it first";
  if (/^\$[a-z0-9]+\$/.test(v)) return "a modular crypt string (bcrypt/argon/sha-crypt family) — the prefix names it";
  return "not digest-shaped: not pure hex, not base64, no crypt prefix";
}

/* ————— magic identification ————— */
export type MagicRow = [string, string, string]; // hex prefix, extension, description
export const BUILTIN_MAGIC: MagicRow[] = [
  ["89504e470d0a1a0a", "png", "PNG image"], ["ffd8ffe0", "jpg", "JPEG image (JFIF)"], ["ffd8ffe1", "jpg", "JPEG image (Exif)"],
  ["ffd8ffee", "jpg", "JPEG image (Adobe)"], ["ffd8ffdb", "jpg", "JPEG image"], ["474946383761", "gif", "GIF image (87a)"],
  ["474946383961", "gif", "GIF image (89a)"], ["255044462d", "pdf", "PDF document"], ["504b0304", "zip", "ZIP archive"],
  ["504b0506", "zip", "ZIP archive (empty)"], ["7f454c46", "elf", "ELF executable"], ["1f8b", "gz", "gzip archive"],
  ["377abcaf271c", "7z", "7-Zip archive"], ["526172211a0700", "rar", "RAR archive (1.5+)"], ["526172211a070100", "rar", "RAR archive (5+)"],
  ["53514c69746520666f726d6174203300", "sqlite", "SQLite database"], ["494433", "mp3", "MP3 audio (ID3v2)"],
  ["fffb", "mp3", "MP3 audio (MPEG frame)"], ["fff3", "mp3", "MP3 audio (MPEG frame)"], ["fff2", "mp3", "MP3 audio (MPEG frame)"],
  ["424d", "bmp", "BMP image"], ["4949", "tif", "TIFF image (little-endian)"], ["4d4d", "tif", "TIFF image (big-endian)"],
  ["52494646", "webp", "RIFF container (WebP/WAV/AVI)"], ["4d5a", "exe", "Windows PE executable (MZ)"],
  ["cafebabe", "class", "Java class / Mach-O fat"], ["feedface", "macho", "Mach-O (32-bit)"], ["feedfacf", "macho", "Mach-O (64-bit)"],
  ["cefaedfe", "macho", "Mach-O (32-bit, swapped)"], ["cffaedfe", "macho", "Mach-O (64-bit, swapped)"],
  ["62706c6973743030", "plist", "binary plist"], ["3c3f786d6c", "xml", "XML document"], ["3c21444f4354595045", "html", "HTML document"],
  ["4f676753", "ogg", "Ogg container"], ["664c6143", "flac", "FLAC audio"], ["d0cf11e0a1b11ae1", "ole", "OLE2 compound document (legacy Office)"],
  ["7573746172", "tar", "TAR archive (ustar)"], ["425a68", "bz2", "bzip2 archive"], ["fd377a585a0000", "xz", "xz archive"],
  ["28b52ffd", "zst", "Zstandard archive"], ["0061736d", "wasm", "WebAssembly module"], ["66747970", "mp4", "MP4/ISO media (offset 4)"],
];
let magicCache: MagicRow[] | null = null;
export async function loadMagic(): Promise<MagicRow[]> {
  if (magicCache) return magicCache;
  try {
    const res = await fetch("/toolchest/magic.json");
    if (res.ok) {
      const rows = (await res.json()) as MagicRow[];
      if (Array.isArray(rows) && rows.length) { magicCache = rows; return rows; }
    }
  } catch { /* the built-in table stands */ }
  magicCache = BUILTIN_MAGIC;
  return magicCache;
}
export function identifyMagic(bytes: Uint8Array, rows: MagicRow[] = BUILTIN_MAGIC): { ext: string; desc: string; hex: string } | null {
  const headHex = toHex(bytes.subarray(0, 24));
  let best: MagicRow | null = null;
  for (const row of rows) {
    const sig = row[0].toLowerCase();
    if (headHex.startsWith(sig) && (!best || sig.length > best[0].length)) best = row;
  }
  // MP4's ftyp sits at offset 4, outside the prefix game.
  if (!best && bytes.length >= 8 && asciiAt(bytes, 4, 4) === "ftyp") {
    return { ext: "mp4", desc: `ISO media (${asciiAt(bytes, 8, 4)} brand)`, hex: headHex.slice(0, 16) };
  }
  return best ? { ext: best[1], desc: best[2], hex: best[0] } : null;
}
export function nameExt(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/* ————— embedded signatures + logical EOF ————— */
export const EMBED_SIGS: Array<{ kind: string; ext: string; bytes: number[]; ascii?: string }> = [
  { kind: "PNG image", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "JPEG image", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { kind: "GIF image", ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { kind: "ZIP archive", ext: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { kind: "PDF document", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { kind: "ELF executable", ext: "elf", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { kind: "SQLite database", ext: "sqlite", bytes: [], ascii: "SQLite format 3\0" },
  { kind: "gzip archive", ext: "gz", bytes: [0x1f, 0x8b] },
  { kind: "7-Zip archive", ext: "7z", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { kind: "RAR archive", ext: "rar", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { kind: "MP3 (ID3v2 tag)", ext: "mp3", bytes: [0x49, 0x44, 0x33] },
];
export interface EmbeddedHit { offset: number; kind: string; ext: string }
export function embeddedScan(bytes: Uint8Array): EmbeddedHit[] {
  const hits: EmbeddedHit[] = [];
  for (const sig of EMBED_SIGS) {
    const pat = sig.ascii ? te.encode(sig.ascii) : new Uint8Array(sig.bytes);
    outer: for (let i = 0; i + pat.length <= bytes.length; i++) {
      for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
      hits.push({ offset: i, kind: sig.kind, ext: sig.ext });
    }
  }
  return hits.sort((a, b) => a.offset - b.offset);
}
/* Where the named format logically ends; anything past it is trailing data. */
export function logicalEof(bytes: Uint8Array): { kind: string; eof: number } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && asciiAt(bytes, 1, 3) === "PNG") {
    // walk chunks to the end of IEND
    let off = 8;
    while (off + 8 <= bytes.length) {
      const len = u32be(bytes, off);
      const type = asciiAt(bytes, off + 4, 4);
      if (off + 12 + len > bytes.length) return null;
      off += 12 + len;
      if (type === "IEND") return { kind: "PNG", eof: off };
    }
    return null;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = bytes.length - 1; i > 0; i--) if (bytes[i - 1] === 0xff && bytes[i] === 0xd9) return { kind: "JPEG", eof: i + 1 };
    return null;
  }
  if (bytes.length >= 6 && asciiAt(bytes, 0, 3) === "GIF") {
    for (let i = bytes.length - 1; i >= 0; i--) if (bytes[i] === 0x3b) return { kind: "GIF", eof: i + 1 };
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const z = zipRead(bytes);
    if (z) return { kind: "ZIP", eof: z.eocdEnd };
    return null;
  }
  return null;
}

/* ————— ZIP ————— */
export interface ZipEntry {
  name: string; method: number; crc: string; compSize: number; size: number;
  dosTime: number; time: Date; comment: string; localOffset: number;
}
export interface ZipInfo { entries: ZipEntry[]; comment: string; eocdEnd: number }
export function dosToMs(dosDate: number, dosTime: number): number {
  const y = ((dosDate >> 9) & 0x7f) + 1980, mo = (dosDate >> 5) & 0xf, d = dosDate & 0x1f;
  const h = (dosTime >> 11) & 0x1f, mi = (dosTime >> 5) & 0x3f, s = (dosTime & 0x1f) * 2;
  return Date.UTC(y, Math.max(0, mo - 1), d || 1, h, mi, s);
}
export function zipRead(bytes: Uint8Array): ZipInfo | null {
  // find the end-of-central-directory record, scanning the tail
  const tail = Math.max(0, bytes.length - 65558);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= tail; i--) {
    if (u32le(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = u16le(bytes, eocd + 10);
  const cdOff = u32le(bytes, eocd + 16);
  const commentLen = u16le(bytes, eocd + 20);
  const comment = tdFatal.decode(bytes.subarray(eocd + 22, eocd + 22 + commentLen));
  const entries: ZipEntry[] = [];
  let off = cdOff;
  for (let i = 0; i < count && off + 46 <= bytes.length; i++) {
    if (u32le(bytes, off) !== 0x02014b50) break;
    const method = u16le(bytes, off + 10);
    const dosTime = u16le(bytes, off + 12), dosDate = u16le(bytes, off + 14);
    const crc = u32le(bytes, off + 16).toString(16).padStart(8, "0");
    const compSize = u32le(bytes, off + 20), size = u32le(bytes, off + 24);
    const nLen = u16le(bytes, off + 28), xLen = u16le(bytes, off + 30), cLen = u16le(bytes, off + 32);
    const localOffset = u32le(bytes, off + 42);
    const name = tdFatal.decode(bytes.subarray(off + 46, off + 46 + nLen));
    const eComment = tdFatal.decode(bytes.subarray(off + 46 + nLen + xLen, off + 46 + nLen + xLen + cLen));
    entries.push({ name, method, crc, compSize, size, dosTime: dosToMs(dosDate, dosTime), time: new Date(dosToMs(dosDate, dosTime)), comment: eComment, localOffset });
    off += 46 + nLen + xLen + cLen;
  }
  return { entries, comment, eocdEnd: eocd + 22 + commentLen };
}
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function zipExtract(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const off = entry.localOffset;
  if (u32le(bytes, off) !== 0x04034b50) throw new Error("local header not found for " + entry.name);
  const nLen = u16le(bytes, off + 26), xLen = u16le(bytes, off + 28);
  const start = off + 30 + nLen + xLen;
  const raw = bytes.subarray(start, start + entry.compSize);
  if (entry.method === 0) return new Uint8Array(raw);
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error(`compression method ${entry.method} is not supported here (stored and deflate are)`);
}

/* ————— PNG ————— */
export interface PngChunk { type: string; offset: number; length: number; dataOff: number }
export function parsePng(bytes: Uint8Array): { chunks: PngChunk[]; texts: Array<[string, string]> } | null {
  if (bytes.length < 8 || bytes[0] !== 0x89 || asciiAt(bytes, 1, 3) !== "PNG") return null;
  const chunks: PngChunk[] = [];
  const texts: Array<[string, string]> = [];
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = u32be(bytes, off);
    const type = asciiAt(bytes, off + 4, 4);
    if (off + 12 + len > bytes.length) { chunks.push({ type, offset: off, length: len, dataOff: off + 8 }); break; }
    chunks.push({ type, offset: off, length: len, dataOff: off + 8 });
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === "tEXt") {
      const z = data.indexOf(0);
      if (z > 0) texts.push([latin1(data, 0, z), latin1(data, z + 1)]);
    } else if (type === "iTXt") {
      const z = data.indexOf(0);
      if (z > 0 && data.length > z + 2) {
        const comp = data[z + 1];
        let p = z + 3;
        while (p < data.length && data[p] !== 0) p++; // language tag
        p++;
        while (p < data.length && data[p] !== 0) p++; // translated keyword
        p++;
        texts.push([latin1(data, 0, z), comp ? "(compressed iTXt — not inflated in this view)" : tdFatal.decode(data.subarray(p))]);
      }
    } else if (type === "zTXt") {
      const z = data.indexOf(0);
      if (z > 0) texts.push([latin1(data, 0, z), "(zTXt — deflate-compressed text)"]);
    }
    off += 12 + len;
    if (type === "IEND") break;
  }
  return { chunks, texts };
}

/* ————— EXIF (JPEG APP1 + TIFF) ————— */
export interface ExifResult {
  fields: Array<[string, string]>;
  gps?: { lat: number; lon: number; alt?: number };
  dateOriginal?: string;
  thumb?: Uint8Array;
}
const TIFF_TYPES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
function tiffParse(t: Uint8Array): ExifResult | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  const be = t[0] === 0x4d && t[1] === 0x4d;
  if (!le && !be) return null;
  const U16 = (o: number) => (le ? u16le(t, o) : u16be(t, o));
  const U32 = (o: number) => (le ? u32le(t, o) : u32be(t, o));
  if (U16(2) !== 42) return null;
  const fields: Array<[string, string]> = [];
  const out: ExifResult = { fields };
  const rat = (o: number) => { const n = U32(o), d = U32(o + 4); return d === 0 ? 0 : n / d; };
  const srat = (o: number) => { const n = U32(o) | 0, d = U32(o + 4) | 0; return d === 0 ? 0 : n / d; };
  function valueStr(type: number, count: number, voff: number): string {
    const size = (TIFF_TYPES[type] || 1) * count;
    const at = size <= 4 ? voff : U32(voff);
    if (at + size > t.length && type !== 2) return "";
    switch (type) {
      case 2: return latin1(t, at, Math.min(t.length, at + count)).replace(/\0+$/, "");
      case 3: { const v: string[] = []; for (let i = 0; i < count; i++) v.push(String(U16(at + i * 2))); return v.join(", "); }
      case 4: { const v: string[] = []; for (let i = 0; i < count; i++) v.push(String(U32(at + i * 4))); return v.join(", "); }
      case 5: { const v: string[] = []; for (let i = 0; i < count; i++) { const n = U32(at + i * 8), d = U32(at + i * 8 + 4); v.push(d ? `${n}/${d}` : "0"); } return v.join(", "); }
      case 10: { const v: string[] = []; for (let i = 0; i < count; i++) { const n = U32(at + i * 8) | 0, d = U32(at + i * 8 + 4) | 0; v.push(d ? `${n}/${d}` : "0"); } return v.join(", "); }
      default: return "";
    }
  }
  function readIfd(off: number): Map<number, { type: number; count: number; voff: number }> {
    const map = new Map<number, { type: number; count: number; voff: number }>();
    if (off <= 0 || off + 2 > t.length) return map;
    const n = U16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > t.length) break;
      map.set(U16(e), { type: U16(e + 2), count: U32(e + 4), voff: e + 8 });
    }
    return map;
  }
  const nextIfd = (off: number) => { const n = U16(off); const p = off + 2 + n * 12; return p + 4 <= t.length ? U32(p) : 0; };
  const get = (m: Map<number, { type: number; count: number; voff: number }>, tag: number) => {
    const e = m.get(tag); return e ? valueStr(e.type, e.count, e.voff) : "";
  };
  const ifd0Off = U32(4);
  const ifd0 = readIfd(ifd0Off);
  const push = (k: string, v: string) => { if (v) fields.push([k, v]); };
  push("make", get(ifd0, 0x010f)); push("model", get(ifd0, 0x0110)); push("software", get(ifd0, 0x0131));
  push("date/time", get(ifd0, 0x0132)); push("artist", get(ifd0, 0x013b)); push("copyright", get(ifd0, 0x8298));
  push("image description", get(ifd0, 0x010e));
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const ex = readIfd(U32(exifPtr.voff));
    const dto = get(ex, 0x9003);
    push("date/time original", dto); if (dto) out.dateOriginal = dto;
    push("create date", get(ex, 0x9004));
    const exp = ex.get(0x829a); if (exp) { const es = valueStr(exp.type, exp.count, exp.voff); push("exposure", es.includes("/") ? es + " s" : es + " s"); }
    const fn = ex.get(0x829d); if (fn) push("f-number", "f/" + valueStr(fn.type, fn.count, fn.voff).split("/").reduce((a, b) => String(Number(a) / Number(b || 1))));
    push("ISO", get(ex, 0x8827));
    const fl = ex.get(0x920a); if (fl) { const [n, d] = valueStr(fl.type, fl.count, fl.voff).split("/"); push("focal length", (Number(n) / Number(d || 1)).toFixed(1) + " mm"); }
    push("lens model", get(ex, 0xa434)); push("lens make", get(ex, 0xa433));
    push("flash", get(ex, 0x9209)); push("metering", get(ex, 0x9207)); push("white balance", get(ex, 0xa403));
    void rat; void srat;
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const g = readIfd(U32(gpsPtr.voff));
    const comp = (tag: number) => {
      const e = g.get(tag);
      if (!e) return null;
      const at = (TIFF_TYPES[e.type] || 1) * e.count <= 4 ? e.voff : U32(e.voff);
      return rat(at) + rat(at + 8) / 60 + rat(at + 16) / 3600;
    };
    const lat = comp(2), lon = comp(4);
    const latRef = get(g, 1), lonRef = get(g, 3);
    if (lat !== null && lon !== null) {
      out.gps = { lat: latRef.startsWith("S") ? -lat : lat, lon: lonRef.startsWith("W") ? -lon : lon };
      const altE = g.get(6);
      if (altE) { const at = (TIFF_TYPES[altE.type] || 1) * altE.count <= 4 ? altE.voff : U32(altE.voff); out.gps.alt = rat(at); }
      fields.push(["GPS", `${out.gps.lat.toFixed(6)}, ${out.gps.lon.toFixed(6)}`]);
    }
  }
  const ifd1Off = nextIfd(ifd0Off);
  if (ifd1Off) {
    const ifd1 = readIfd(ifd1Off);
    const jo = ifd1.get(0x0201), jl = ifd1.get(0x0202);
    if (jo && jl) {
      const o = Number(valueStr(jo.type, jo.count, jo.voff)), l = Number(valueStr(jl.type, jl.count, jl.voff));
      if (o > 0 && l > 0 && o + l <= t.length) out.thumb = t.subarray(o, o + l);
    }
  }
  return fields.length || out.gps ? out : null;
}
export function parseExif(bytes: Uint8Array): ExifResult | null {
  // TIFF directly
  if (bytes.length > 8 && ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d))) {
    return tiffParse(bytes);
  }
  // JPEG: walk segments for APP1 Exif
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) break;
      const marker = bytes[off + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = u16be(bytes, off + 2);
      if (len < 2) break;
      if (marker === 0xe1 && asciiAt(bytes, off + 4, 6) === "Exif\0\0") {
        return tiffParse(bytes.subarray(off + 10, off + 2 + len));
      }
      off += 2 + len;
    }
  }
  return null;
}

/* ————— PDF ————— */
export interface PdfInfo { fields: Array<[string, string]>; pages: number | null; xmp: string | null; version: string }
export function parsePdf(bytes: Uint8Array): PdfInfo | null {
  if (asciiAt(bytes, 0, 5) !== "%PDF-") return null;
  const text = latin1(bytes);
  const fields: Array<[string, string]> = [];
  const grab = (key: string, label: string) => {
    const re = new RegExp("/" + key + "\\s*\\((?:\\\\.|[^\\\\,)])*\\)");
    const m = re.exec(text);
    if (m) {
      const inner = m[0].slice(m[0].indexOf("(") + 1, -1).replace(/\\([()\\])/g, "$1").replace(/\\n/g, " ").replace(/\\r/g, "");
      if (inner.trim()) fields.push([label, inner.trim()]);
    }
  };
  grab("Title", "title"); grab("Author", "author"); grab("Creator", "creator");
  grab("Producer", "producer"); grab("Subject", "subject"); grab("Keywords", "keywords");
  grab("CreationDate", "created"); grab("ModDate", "modified");
  let pages: number | null = null;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) pages = Math.max(...counts);
  else { const pc = (text.match(/\/Type\s*\/Page[^s]/g) || []).length; pages = pc || null; }
  let xmp: string | null = null;
  const xs = text.indexOf("<x:xmpmeta");
  if (xs >= 0) { const xe = text.indexOf("</x:xmpmeta>", xs); xmp = text.slice(xs, xe > 0 ? xe + 12 : xs + 2000); }
  return { fields, pages, xmp, version: asciiAt(bytes, 5, 3) };
}

/* ————— ID3 ————— */
export interface Id3Info { version: string; fields: Array<[string, string]> }
export function parseId3(bytes: Uint8Array): Id3Info | null {
  const fields: Array<[string, string]> = [];
  let version = "";
  const decText = (data: Uint8Array): string => {
    if (!data.length) return "";
    const enc = data[0];
    const body = data.subarray(1);
    try {
      if (enc === 0) return latin1(body).replace(/\0+$/, "");
      if (enc === 1) return new TextDecoder("utf-16").decode(body).replace(/\0+$/, "");
      if (enc === 2) return new TextDecoder("utf-16be").decode(body).replace(/\0+$/, "");
      return tdFatal.decode(body).replace(/\0+$/, "");
    } catch { return ""; }
  };
  if (bytes.length > 10 && asciiAt(bytes, 0, 3) === "ID3") {
    const ver = bytes[3];
    version = `ID3v2.${ver}`;
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    let off = 10;
    const end = Math.min(bytes.length, 10 + size);
    while (off + 10 <= end) {
      const id = asciiAt(bytes, off, 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsize = ver >= 4
        ? ((bytes[off + 4] & 0x7f) << 21) | ((bytes[off + 5] & 0x7f) << 14) | ((bytes[off + 6] & 0x7f) << 7) | (bytes[off + 7] & 0x7f)
        : u32be(bytes, off + 4);
      if (fsize <= 0) break;
      if (id.startsWith("T") && id !== "TXXX") {
        const v = decText(bytes.subarray(off + 10, off + 10 + fsize));
        if (v) fields.push([id, v]);
      }
      off += 10 + fsize;
    }
  }
  if (bytes.length >= 128 && asciiAt(bytes, bytes.length - 128, 3) === "TAG") {
    if (!version) version = "ID3v1";
    const t = bytes.subarray(bytes.length - 128);
    const s = (a: number, b: number) => latin1(t, a, b).replace(/[\0 ]+$/, "");
    const pairs: Array<[string, string]> = [["title", s(3, 33)], ["artist", s(33, 63)], ["album", s(63, 93)], ["year", s(93, 97)], ["comment", s(97, 127)]];
    for (const [k, v] of pairs) if (v) fields.push([`v1 ${k}`, v]);
  }
  return fields.length ? { version, fields } : null;
}

/* ————— MP4 / ISO media ————— */
export interface Mp4Info { brand: string; compatible: string[]; created?: Date; modified?: Date; durationSec?: number }
export function parseMp4(bytes: Uint8Array): Mp4Info | null {
  if (bytes.length < 8 || asciiAt(bytes, 4, 4) !== "ftyp") return null;
  const brand = asciiAt(bytes, 8, 4);
  const compat: string[] = [];
  for (let i = 16; i + 4 <= Math.min(bytes.length, 64); i += 4) { const c = asciiAt(bytes, i, 4); if (c.trim()) compat.push(c); }
  const info: Mp4Info = { brand, compatible: compat };
  const macToDate = (sec: number) => new Date((sec - 2082844800) * 1000);
  let off = 0;
  while (off + 8 <= bytes.length) {
    const size = u32be(bytes, off);
    const type = asciiAt(bytes, off + 4, 4);
    if (size < 8) break;
    if (type === "moov" || type === "udta") { /* descend one level below */ }
    if (type === "mvhd") {
      const v = bytes[off + 8];
      if (v === 0) {
        info.created = macToDate(u32be(bytes, off + 12));
        info.modified = macToDate(u32be(bytes, off + 16));
        const scale = u32be(bytes, off + 20), dur = u32be(bytes, off + 24);
        if (scale) info.durationSec = Math.round((dur / scale) * 10) / 10;
      } else {
        const be64 = (o: number) => u32be(bytes, o) * 4294967296 + u32be(bytes, o + 4);
        info.created = macToDate(be64(off + 12));
        info.modified = macToDate(be64(off + 20));
        const scale = u32be(bytes, off + 28), dur = be64(off + 32);
        if (scale) info.durationSec = Math.round((dur / scale) * 10) / 10;
      }
      break;
    }
    // descend into moov by stepping inside it
    if (type === "moov") { off += 8; continue; }
    off += size === 0 ? bytes.length : size;
    if (off <= 0) break;
  }
  return info;
}

/* ————— OOXML core properties (via the ZIP reader) ————— */
export async function parseOoxml(bytes: Uint8Array): Promise<Array<[string, string]> | null> {
  const z = zipRead(bytes);
  if (!z) return null;
  const core = z.entries.find((e) => e.name === "docProps/core.xml");
  const app = z.entries.find((e) => e.name === "docProps/app.xml");
  if (!core && !app) return null;
  const fields: Array<[string, string]> = [];
  const xmlFields = async (entry: ZipEntry | undefined, tags: string[]) => {
    if (!entry) return;
    try {
      const xml = tdFatal.decode(await zipExtract(bytes, entry));
      for (const tag of tags) {
        const m = new RegExp(`<(?:[a-z]+:)?${tag}[^>]*>([^<]+)<`, "i").exec(xml);
        if (m && m[1].trim()) fields.push([tag, m[1].trim()]);
      }
    } catch { /* unreadable part */ }
  };
  await xmlFields(core, ["title", "creator", "lastModifiedBy", "revision", "created", "modified", "subject", "keywords", "category"]);
  await xmlFields(app, ["Application", "AppVersion", "Company"]);
  return fields.length ? fields : null;
}

/* ————— strings ————— */
export interface StrHit { offset: number; enc: "ascii" | "utf16le" | "utf16be"; text: string }
export function extractStrings(bytes: Uint8Array, minLen = 4, cap = 5000): { hits: StrHit[]; truncated: boolean } {
  const hits: StrHit[] = [];
  let run = -1;
  const printable = (c: number) => (c >= 0x20 && c < 0x7f) || c === 0x09;
  for (let i = 0; i <= bytes.length; i++) {
    const c = i < bytes.length ? bytes[i] : 0;
    if (printable(c)) { if (run < 0) run = i; }
    else {
      if (run >= 0 && i - run >= minLen) hits.push({ offset: run, enc: "ascii", text: latin1(bytes, run, i) });
      run = -1;
    }
  }
  // UTF-16LE / BE: printable char followed/preceded by a NUL
  for (const le of [true, false]) {
    let start = -1;
    for (let i = 0; i + 1 <= bytes.length; i += 1) {
      const a = le ? bytes[i] : bytes[i + 1];
      const z = le ? bytes[i + 1] : bytes[i];
      const isCh = z === 0 && printable(a);
      if (isCh && start < 0 && i % 2 === 0) start = i;
      if (!isCh && start >= 0) {
        const n = (i - start) / 2;
        if (n >= minLen) {
          let s = "";
          for (let j = start; j < i; j += 2) s += String.fromCharCode(le ? bytes[j] : bytes[j + 1]);
          hits.push({ offset: start, enc: le ? "utf16le" : "utf16be", text: s });
        }
        start = -1;
      }
    }
  }
  hits.sort((a, b) => a.offset - b.offset);
  return { hits: hits.slice(0, cap), truncated: hits.length > cap };
}

/* ————— IOC extraction ————— */
export function extractIocs(text: string): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const add = (k: string, re: RegExp, valid?: (s: string) => boolean) => {
    const found = new Set<string>();
    for (const m of text.matchAll(re)) { const v = m[0]; if (!valid || valid(v)) found.add(v); }
    if (found.size) groups[k] = [...found].slice(0, 500);
  };
  add("ipv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (v) => v.split(".").every((o) => Number(o) <= 255));
  add("ipv6", /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b/g);
  add("url", /https?:\/\/[^\s"'<>\\)\]]+/gi);
  add("email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
  add("domain", /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|gov|edu|mil|info|biz|xyz|top|club|site|online|dev|app|me|tv|cc|us|uk|de|jp|cn|ru|br|au|ca|fr|it|nl|se|no|fi|dk|es|pl|be|ch|at|nz|za|in|kr|tw|hk|sg|mx|ar|cl|pe|ve|ua|tr|il|ae|sa|eg|ng|ke|gh|pro|mobi|name|aero|asia|cat|jobs|travel|xxx|post|geo|kid|kids|srl|onion)\b/gi);
  add("md5", /\b[0-9a-fA-F]{32}\b/g);
  add("sha1", /\b[0-9a-fA-F]{40}\b/g);
  add("sha256", /\b[0-9a-fA-F]{64}\b/g);
  add("bitcoin", /\b(?:1|3)[1-9A-HJ-NP-Za-km-z]{25,34}\b|\bbc1[ac-hj-np-z02-9]{11,71}\b/g);
  add("ethereum", /\b0x[0-9a-fA-F]{40}\b/g);
  add("mac", /\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g);
  add("windows path", /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\s]+\\)*[^\\/:*?"<>|\s]*/g);
  add("registry", /\b(?:HKEY_(?:LOCAL_MACHINE|CURRENT_USER|CLASSES_ROOT|USERS|CURRENT_CONFIG)|HKLM|HKCU|HKCR)(?:\\[^\s"']+)+/g);
  add("user agent", /Mozilla\/[^\s"']+(?:\s\([^\"]*?\))?(?:\s[^\s"']+)*/g);
  return groups;
}

/* ————— hex view helpers ————— */
export function hexRows(bytes: Uint8Array, start: number, count: number): string {
  const lines: string[] = [];
  for (let off = start; off < Math.min(bytes.length, start + count); off += 16) {
    const slice = bytes.subarray(off, Math.min(off + 16, bytes.length));
    let hexPart = "";
    for (let i = 0; i < 16; i++) { hexPart += i < slice.length ? slice[i].toString(16).padStart(2, "0") + " " : "   "; if (i === 7) hexPart += " "; }
    let txt = "";
    for (const c of slice) txt += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".";
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hexPart} |${txt}|`);
  }
  return lines.join("\n");
}

/* ————— downloads ————— */
export function download(name: string, data: Uint8Array | string, mime = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type: "text/plain;charset=utf-8" }) : new Blob([data as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ————— PCAP / PCAPNG ————— */
export interface FxPacket {
  n: number; ts: number; len: number; caplen: number;
  src: string; dst: string; proto: string; info: string;
  payload: Uint8Array; l4: string; sport: number; dport: number;
  srcIp: string; dstIp: string; tcpSeq: number; tcpFlags: string;
}
export interface PcapResult {
  format: string; linktype: number; packets: FxPacket[]; totalBytes: number;
  dns: Array<{ name: string; type: string; answers: string[]; pkt: number }>;
  unsupported?: string;
}
const LINK_NAMES: Record<number, string> = { 0: "BSD loopback", 1: "Ethernet", 113: "Linux cooked", 276: "Linux cooked v2" };
function macStr(b: Uint8Array, o: number): string { return [...b.subarray(o, o + 6)].map((x) => x.toString(16).padStart(2, "0")).join(":"); }
function ipv4Str(b: Uint8Array, o: number): string { return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`; }
function ipv6Str(b: Uint8Array, o: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) parts.push(((b[o + i] << 8) | b[o + i + 1]).toString(16));
  return parts.join(":").replace(/(^|:)(0:)+/, "::");
}
const DNS_TYPES: Record<number, string> = { 1: "A", 2: "NS", 5: "CNAME", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 65: "HTTPS" };
function dnsName(b: Uint8Array, start: number, base: number): { name: string; next: number } {
  const labels: string[] = [];
  let i = start, next = -1, guard = 0;
  while (i < b.length && guard++ < 64) {
    const len = b[i];
    if (len === 0) { if (next < 0) next = i + 1; break; }
    if ((len & 0xc0) === 0xc0) { const ptr = ((len & 0x3f) << 8) | b[i + 1]; if (next < 0) next = i + 2; i = base + ptr; continue; }
    labels.push(latin1(b, i + 1, i + 1 + len));
    i += 1 + len;
  }
  return { name: labels.join("."), next: next < 0 ? i : next };
}
function parseDns(payload: Uint8Array, pktN: number, out: PcapResult["dns"]): string | null {
  if (payload.length < 12) return null;
  const flags = u16be(payload, 2);
  const qd = u16be(payload, 4), an = u16be(payload, 6);
  const qr = (flags >> 15) & 1;
  let off = 12;
  let firstName = "";
  for (let q = 0; q < qd; q++) {
    const { name, next } = dnsName(payload, off, 0);
    if (next < 0) return null;
    const qt = u16be(payload, next);
    if (q === 0) { firstName = name; out.push({ name, type: DNS_TYPES[qt] || String(qt), answers: [], pkt: pktN }); }
    off = next + 4;
  }
  if (qr && an > 0) {
    const answers: string[] = [];
    for (let a = 0; a < an && off + 12 <= payload.length; a++) {
      const { next } = dnsName(payload, off, 0);
      if (next < 0) break;
      const type = u16be(payload, next);
      const rdlen = u16be(payload, next + 8);
      const rd = next + 10;
      if (type === 1 && rdlen === 4) answers.push(ipv4Str(payload, rd));
      else if (type === 28 && rdlen === 16) answers.push(ipv6Str(payload, rd));
      else if (type === 5) answers.push(dnsName(payload, rd, 0).name);
      off = rd + rdlen;
    }
    if (answers.length) out.push({ name: firstName, type: "answer", answers, pkt: pktN });
  }
  return firstName ? `DNS ${qr ? "response" : "query"} ${firstName}` : "DNS";
}
function decodeFrame(frame: Uint8Array, linktype: number, n: number, ts: number, dnsOut: PcapResult["dns"]): FxPacket {
  const p: FxPacket = {
    n, ts, len: frame.length, caplen: frame.length, src: "", dst: "", proto: "", info: "",
    payload: new Uint8Array(0), l4: "", sport: 0, dport: 0, srcIp: "", dstIp: "", tcpSeq: 0, tcpFlags: "",
  };
  let off = 0, ethertype = 0;
  if (linktype === 1) {
    if (frame.length < 14) { p.proto = "short frame"; return p; }
    p.dst = macStr(frame, 0); p.src = macStr(frame, 6);
    ethertype = u16be(frame, 12); off = 14;
    if (ethertype === 0x8100 || ethertype === 0x88a8) { p.info = "VLAN " + u16be(frame, 14) + " · "; ethertype = u16be(frame, 16); off = 18; }
    p.proto = ethertype === 0x0800 ? "IPv4" : ethertype === 0x86dd ? "IPv6" : ethertype === 0x0806 ? "ARP" : "0x" + ethertype.toString(16);
  } else if (linktype === 101 || linktype === 12 || linktype === 14) {
    const v = frame.length ? frame[0] >> 4 : 0;
    p.proto = v === 6 ? "IPv6" : "IPv4"; ethertype = v === 6 ? 0x86dd : 0x0800; off = 0;
  } else if (linktype === 0) {
    const fam = frame.length >= 4 ? u32le(frame, 0) : 0;
    ethertype = fam === 2 || fam === 24 || fam === 10 ? 0x0800 : 0x86dd;
    p.proto = "loopback"; off = 4;
  } else if (linktype === 113) {
    ethertype = u16be(frame, 14); off = 16; p.proto = "Linux cooked";
  }
  const body = frame.subarray(off);
  if (ethertype === 0x0806 && body.length >= 28) {
    p.srcIp = ipv4Str(body, 14); p.dstIp = ipv4Str(body, 24);
    p.src = p.srcIp; p.dst = p.dstIp;
    p.info += (u16be(body, 6) === 1 ? `ARP who has ${p.dstIp}? tell ${p.srcIp}` : `ARP ${p.srcIp} is at ${macStr(body, 8)}`);
    p.proto = "ARP";
    return p;
  }
  if (ethertype === 0x0800 && body.length >= 20) {
    const ihl = (body[0] & 0xf) * 4;
    const proto = body[9];
    p.srcIp = ipv4Str(body, 12); p.dstIp = ipv4Str(body, 16);
    p.src = p.srcIp; p.dst = p.dstIp;
    const total = u16be(body, 2);
    decodeL4(body.subarray(ihl, total > ihl ? total : body.length), proto, p, dnsOut);
    p.proto = p.l4 || "IPv4";
    return p;
  }
  if (ethertype === 0x86dd && body.length >= 40) {
    const nh = body[6];
    p.srcIp = ipv6Str(body, 8); p.dstIp = ipv6Str(body, 24);
    p.src = p.srcIp; p.dst = p.dstIp;
    const plen = u16be(body, 4);
    decodeL4(body.subarray(40, plen > 0 ? 40 + plen : body.length), nh, p, dnsOut);
    p.proto = p.l4 || "IPv6";
    return p;
  }
  p.payload = body;
  p.info += `${body.length} bytes`;
  return p;
}
function decodeL4(seg: Uint8Array, proto: number, p: FxPacket, dnsOut: PcapResult["dns"]) {
  if (proto === 6 && seg.length >= 20) {
    p.l4 = "TCP";
    p.sport = u16be(seg, 0); p.dport = u16be(seg, 2);
    p.tcpSeq = u32be(seg, 4);
    const doff = (seg[12] >> 4) * 4;
    const flags = seg[13];
    p.tcpFlags = [flags & 0x02 ? "SYN" : "", flags & 0x10 ? "ACK" : "", flags & 0x01 ? "FIN" : "", flags & 0x04 ? "RST" : "", flags & 0x08 ? "PSH" : ""].filter(Boolean).join(",") || "·";
    p.payload = seg.subarray(Math.min(doff, seg.length));
    p.info = `TCP ${p.sport} → ${p.dport} [${p.tcpFlags}] seq ${p.tcpSeq} · ${p.payload.length} payload bytes`;
    if (p.payload.length) {
      const head = latin1(p.payload.subarray(0, Math.min(80, p.payload.length))).split("\r\n")[0];
      if (/^(GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH|HTTP\/)/.test(head)) p.info += " · " + head.slice(0, 60);
    }
    if ((p.sport === 53 || p.dport === 53) && p.payload.length > 2) {
      const dnsInfo = parseDns(p.payload.subarray(2), p.n, dnsOut);
      if (dnsInfo) p.info = dnsInfo;
    }
  } else if (proto === 17 && seg.length >= 8) {
    p.l4 = "UDP";
    p.sport = u16be(seg, 0); p.dport = u16be(seg, 2);
    p.payload = seg.subarray(8);
    p.info = `UDP ${p.sport} → ${p.dport} · ${p.payload.length} payload bytes`;
    if (p.sport === 53 || p.dport === 53) {
      const dnsInfo = parseDns(p.payload, p.n, dnsOut);
      if (dnsInfo) p.info = dnsInfo;
    }
  } else if (proto === 1 && seg.length >= 2) {
    p.l4 = "ICMP";
    const types: Record<number, string> = { 0: "echo reply", 3: "unreachable", 8: "echo request", 11: "time exceeded" };
    p.payload = seg;
    p.info = `ICMP ${types[seg[0]] || "type " + seg[0]}`;
  } else if (proto === 58 && seg.length >= 2) {
    p.l4 = "ICMPv6";
    p.payload = seg;
    p.info = `ICMPv6 type ${seg[0]}`;
  } else {
    p.l4 = "proto " + proto;
    p.payload = seg;
    p.info = `${seg.length} bytes`;
  }
}
export function parsePcap(bytes: Uint8Array): PcapResult {
  const dns: PcapResult["dns"] = [];
  const packets: FxPacket[] = [];
  let totalBytes = 0;
  // pcapng
  if (bytes.length >= 4 && bytes[0] === 0x0a && bytes[1] === 0x0d && bytes[2] === 0x0d && bytes[3] === 0x0a) {
    let le = true;
    if (bytes.length >= 12) le = !(bytes[8] === 0x1a && bytes[9] === 0x2b && bytes[10] === 0x3c && bytes[11] === 0x4d);
    const U32 = (o: number) => (le ? u32le(bytes, o) : u32be(bytes, o));
    const U16 = (o: number) => (le ? u16le(bytes, o) : u16be(bytes, o));
    let linktype = 1, tsResol = 1e-6, snaplen = 65535;
    let off = 0, n = 0;
    while (off + 12 <= bytes.length) {
      const type = U32(off), blen = U32(off + 4);
      if (blen < 12 || off + blen > bytes.length) break;
      if (type === 1) { // interface description
        linktype = U16(off + 8); snaplen = U32(off + 12);
        tsResol = 1e-6;
        let oo = off + 16;
        const oend = off + blen - 4;
        while (oo + 4 <= oend) {
          const code = U16(oo), olen = U16(oo + 2);
          if (code === 0) break;
          if (code === 9 && olen >= 1) { const v = bytes[oo + 4]; tsResol = (v & 0x80) ? Math.pow(2, -(v & 0x7f)) : Math.pow(10, -v); }
          oo += 4 + Math.ceil(olen / 4) * 4;
        }
      } else if (type === 6) { // enhanced packet
        const hi = U32(off + 12), lo = U32(off + 16);
        const caplen = U32(off + 20);
        const frame = bytes.subarray(off + 28, off + 28 + caplen);
        const ts = (hi * 4294967296 + lo) * tsResol;
        n++;
        totalBytes += frame.length;
        if (packets.length < 20000) packets.push(decodeFrame(new Uint8Array(frame), linktype, n, ts, dns));
      } else if (type === 3) { // simple packet
        const plen = U32(off + 8);
        const caplen = Math.min(plen, snaplen);
        const frame = bytes.subarray(off + 12, off + 12 + caplen);
        n++;
        totalBytes += frame.length;
        if (packets.length < 20000) packets.push(decodeFrame(new Uint8Array(frame), linktype, n, 0, dns));
      } else if (type === 0x0a0d0d0a) {
        if (off + 16 <= bytes.length) le = !(bytes[off + 8] === 0x1a && bytes[off + 9] === 0x2b && bytes[off + 10] === 0x3c && bytes[off + 11] === 0x4d);
      }
      off += blen;
    }
    if (![0, 1, 12, 14, 101, 113].includes(linktype)) {
      return { format: "pcapng", linktype, packets, totalBytes, dns, unsupported: `link type ${linktype} (${LINK_NAMES[linktype] || "unknown"}) is not decoded by this lab — Ethernet, raw IP and loopback are` };
    }
    return { format: "pcapng", linktype, packets, totalBytes, dns };
  }
  // classic pcap
  if (bytes.length < 24) throw new Error("too small to be a capture file");
  const m = [bytes[0], bytes[1], bytes[2], bytes[3]].map((x) => x.toString(16).padStart(2, "0")).join("");
  const conf: Record<string, { le: boolean; nano: boolean }> = {
    d4c3b2a1: { le: true, nano: false }, a1b2c3d4: { le: false, nano: false },
    "4d3cb2a1": { le: true, nano: true }, a1b23c4d: { le: false, nano: true },
  };
  const c = conf[m];
  if (!c) throw new Error("not a pcap or pcapng file (magic " + m + ")");
  const U32 = (o: number) => (c.le ? u32le(bytes, o) : u32be(bytes, o));
  const linktype = U32(20);
  if (![0, 1, 12, 14, 101, 113].includes(linktype)) {
    return { format: "pcap", linktype, packets: [], totalBytes: 0, dns, unsupported: `link type ${linktype} (${LINK_NAMES[linktype] || "unknown"}) is not decoded by this lab — Ethernet, raw IP and loopback are` };
  }
  let off = 24, n = 0;
  while (off + 16 <= bytes.length) {
    const sec = U32(off), frac = U32(off + 4), incl = U32(off + 8);
    if (incl > bytes.length) break;
    const frame = bytes.subarray(off + 16, off + 16 + incl);
    const ts = sec + (c.nano ? frac / 1e9 : frac / 1e6);
    n++;
    totalBytes += frame.length;
    if (packets.length < 20000) {
      const pkt = decodeFrame(new Uint8Array(frame), linktype, n, ts, dns);
      pkt.len = U32(off + 12);
      packets.push(pkt);
    }
    off += 16 + incl;
  }
  return { format: "pcap", linktype, packets, totalBytes, dns };
}
export interface TcpStream { key: string; a: string; b: string; ab: Uint8Array; ba: Uint8Array; packets: number }
export function tcpStreams(packets: FxPacket[]): TcpStream[] {
  const map = new Map<string, { a: string; b: string; segA: Array<[number, Uint8Array]>; segB: Array<[number, Uint8Array]>; count: number }>();
  for (const p of packets) {
    if (p.l4 !== "TCP" || !p.srcIp) continue;
    const ep1 = `${p.srcIp}:${p.sport}`, ep2 = `${p.dstIp}:${p.dport}`;
    const [a, b] = ep1 < ep2 ? [ep1, ep2] : [ep2, ep1];
    const key = a + " ↔ " + b;
    let s = map.get(key);
    if (!s) { s = { a, b, segA: [], segB: [], count: 0 }; map.set(key, s); }
    s.count++;
    if (p.payload.length) (ep1 === a ? s.segA : s.segB).push([p.tcpSeq, p.payload]);
  }
  const assemble = (segs: Array<[number, Uint8Array]>): Uint8Array => {
    const sorted = [...segs].sort((x, y) => x[0] - y[0]);
    const parts: Uint8Array[] = [];
    let cursor: number | null = null;
    for (const [seq, data] of sorted) {
      if (cursor === null) { parts.push(data); cursor = seq + data.length; continue; }
      if (seq >= cursor) { parts.push(data); cursor = seq + data.length; }
      else if (seq + data.length > cursor) { parts.push(data.subarray(cursor - seq)); cursor = seq + data.length; }
    }
    const total = parts.reduce((a, x) => a + x.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const part of parts) { out.set(part, o); o += part.length; }
    return out;
  };
  return [...map.entries()].map(([key, s]) => ({ key, a: s.a, b: s.b, ab: assemble(s.segA), ba: assemble(s.segB), packets: s.count }));
}

/* ————— EML ————— */
export interface EmlPart { headers: Array<[string, string]>; type: string; name: string; body: Uint8Array; children: EmlPart[]; isAttachment: boolean }
export interface EmlResult {
  headers: Array<[string, string]>;
  received: Array<{ raw: string; from: string; by: string; with: string; date: string; ts: number | null }>;
  authLines: Array<[string, string]>;
  flags: string[];
  root: EmlPart;
  textBody: string; htmlBody: string;
  attachments: Array<{ name: string; type: string; size: number; bytes: Uint8Array }>;
}
function splitHeadBody(text: string): { head: string; body: string } {
  const m = /\r\n\r\n|\n\n/.exec(text);
  if (!m) return { head: text, body: "" };
  return { head: text.slice(0, m.index), body: text.slice(m.index + m[0].length) };
}
function parseHeaders(head: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of head.split(/\r?\n/)) {
    if (/^\s/.test(line) && out.length) out[out.length - 1][1] += " " + line.trim();
    else { const c = line.indexOf(":"); if (c > 0) out.push([line.slice(0, c).trim(), line.slice(c + 1).trim()]); }
  }
  return out;
}
function qpDecode(s: string): Uint8Array {
  const bytes: number[] = [];
  const clean = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) { bytes.push(parseInt(clean.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(clean.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(bytes);
}
function b64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeBody(body: string, cte: string): Uint8Array {
  const enc = cte.toLowerCase();
  if (enc.includes("base64")) { try { return b64Decode(body); } catch { return te.encode(body); } }
  if (enc.includes("quoted-printable")) return qpDecode(body);
  return te.encode(body);
}
function parsePart(head: string, body: string): EmlPart {
  const headers = parseHeaders(head);
  const getH = (n: string) => headers.find(([k]) => k.toLowerCase() === n)?.[1] || "";
  const ct = getH("content-type") || "text/plain";
  const type = ct.split(";")[0].trim().toLowerCase();
  const nameM = /name\*?=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
  const disp = getH("content-disposition");
  const fileM = /filename\*?=(?:"([^"]+)"|([^;\s]+))/i.exec(disp);
  const name = (fileM?.[1] || fileM?.[2] || nameM?.[1] || nameM?.[2] || "").trim();
  const part: EmlPart = { headers, type, name, body: new Uint8Array(0), children: [], isAttachment: /attachment/i.test(disp) || (!!name && !type.startsWith("text/")) };
  const boundaryM = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
  if (type.startsWith("multipart/") && boundaryM) {
    const boundary = boundaryM[1] || boundaryM[2];
    const chunks = body.split("--" + boundary);
    for (let ci = 1; ci < chunks.length; ci++) {
      let chunk = chunks[ci];
      if (chunk.startsWith("--")) break;
      chunk = chunk.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      const sub = splitHeadBody(chunk);
      part.children.push(parsePart(sub.head, sub.body));
    }
    return part;
  }
  part.body = decodeBody(body, getH("content-transfer-encoding"));
  return part;
}
export function parseEml(bytes: Uint8Array): EmlResult {
  const text = latin1(bytes);
  const { head, body } = splitHeadBody(text);
  const headers = parseHeaders(head);
  const getAll = (n: string) => headers.filter(([k]) => k.toLowerCase() === n).map(([, v]) => v);
  const get1 = (n: string) => getAll(n)[0] || "";
  const root = parsePart(head, body);
  const received = getAll("received").map((raw) => {
    const semi = raw.lastIndexOf(";");
    const date = semi >= 0 ? raw.slice(semi + 1).trim() : "";
    const ts = date ? Date.parse(date) : NaN;
    const grabF = (kw: string) => { const m = new RegExp("\\b" + kw + "\\s+([^\\s(]+)").exec(raw); return m ? m[1] : ""; };
    return { raw, from: grabF("from"), by: grabF("by"), with: grabF("with"), date, ts: Number.isNaN(ts) ? null : ts };
  });
  const authLines: Array<[string, string]> = [];
  for (const [k, v] of headers) {
    const lk = k.toLowerCase();
    if (lk === "authentication-results" || lk === "received-spf" || lk === "dkim-signature" || lk === "arc-authentication-results") authLines.push([k, v]);
  }
  if (/spf=/i.test(get1("authentication-results")) === false && get1("received-spf")) authLines.push(["SPF (Received-SPF)", get1("received-spf")]);
  const flags: string[] = [];
  const addrOf = (v: string) => { const m = /<([^>]+)>/.exec(v); return (m ? m[1] : v).trim().toLowerCase(); };
  const from = addrOf(get1("from"));
  const rp = addrOf(get1("return-path"));
  const rt = addrOf(get1("reply-to"));
  const dom = (a: string) => a.split("@")[1] || "";
  if (from && rp && from !== rp) flags.push(`From (${from}) ≠ Return-Path (${rp})`);
  if (from && rp && dom(from) !== dom(rp)) flags.push(`From domain ${dom(from)} ≠ Return-Path domain ${dom(rp)}`);
  if (rt && from && rt !== from) flags.push(`Reply-To (${rt}) ≠ From (${from}) — replies go elsewhere`);
  if (!getAll("dkim-signature").length) flags.push("no DKIM-Signature header present");
  if (!getAll("authentication-results").length && !getAll("received-spf").length) flags.push("no Authentication-Results or Received-SPF header present");
  let textBody = "", htmlBody = "";
  const attachments: EmlResult["attachments"] = [];
  const walk = (p: EmlPart) => {
    if (p.isAttachment && p.body.length) attachments.push({ name: p.name || "(unnamed)", type: p.type, size: p.body.length, bytes: p.body });
    if (p.type === "text/plain" && !p.isAttachment && !textBody) textBody = tdFatal.decode(p.body);
    if (p.type === "text/html" && !p.isAttachment && !htmlBody) htmlBody = tdFatal.decode(p.body);
    p.children.forEach(walk);
  };
  walk(root);
  return { headers, received, authLines, flags, root, textBody, htmlBody, attachments };
}

/* ————— timeline sources ————— */
export interface FxEvent { t: number; source: string; event: string }
export async function eventsForFile(name: string, bytes: Uint8Array): Promise<FxEvent[]> {
  const out: FxEvent[] = [];
  const ex = parseExif(bytes);
  if (ex?.dateOriginal) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/.exec(ex.dateOriginal);
    if (m) out.push({ t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), source: name, event: "EXIF DateTimeOriginal" });
  }
  const z = zipRead(bytes);
  if (z) for (const e of z.entries) out.push({ t: e.dosTime, source: name, event: `ZIP entry stored: ${e.name}` });
  const pdf = parsePdf(bytes);
  if (pdf) for (const [k, v] of pdf.fields) {
    if (k === "created" || k === "modified") {
      const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(v);
      if (m) out.push({ t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), source: name, event: `PDF ${k}` });
    }
  }
  const mp4 = parseMp4(bytes);
  if (mp4?.created) out.push({ t: mp4.created.getTime(), source: name, event: "MP4 mvhd created" });
  if (mp4?.modified) out.push({ t: mp4.modified.getTime(), source: name, event: "MP4 mvhd modified" });
  if (/\.eml$/i.test(name) || asciiAt(bytes, 0, 200).includes("\nReceived:") || /^From:/m.test(latin1(bytes.subarray(0, 512)))) {
    try {
      const eml = parseEml(bytes);
      const date = eml.headers.find(([k]) => k.toLowerCase() === "date")?.[1];
      if (date) { const t = Date.parse(date); if (!Number.isNaN(t)) out.push({ t, source: name, event: "mail Date header" }); }
      for (const hop of eml.received) if (hop.ts !== null) out.push({ t: hop.ts, source: name, event: `mail received by ${hop.by || hop.from || "?"}` });
    } catch { /* not mail */ }
  }
  if (bytes.length >= 4 && (bytes[0] === 0xd4 || bytes[0] === 0xa1 || bytes[0] === 0x0a)) {
    try {
      const cap = parsePcap(bytes);
      if (cap.packets.length) {
        out.push({ t: Math.round(cap.packets[0].ts * 1000), source: name, event: "capture first packet" });
        out.push({ t: Math.round(cap.packets[cap.packets.length - 1].ts * 1000), source: name, event: "capture last packet" });
      }
    } catch { /* not a capture */ }
  }
  return out;
}
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseLogText(text: string, source: string): FxEvent[] {
  const out: FxEvent[] = [];
  const year = new Date().getFullYear();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(line);
    if (m) { out.push({ t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), source, event: line.slice(0, 140) }); continue; }
    m = /\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/.exec(line);
    if (m) { out.push({ t: Date.UTC(+m[3], MONTHS[m[2].toLowerCase()] ?? 0, +m[1], +m[4], +m[5], +m[6]), source, event: line.slice(0, 140) }); continue; }
    m = /^([A-Za-z]{3})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2})/.exec(line);
    if (m) { out.push({ t: new Date(year, MONTHS[m[1].toLowerCase()] ?? 0, +m[2], +m[3], +m[4], +m[5]).getTime(), source, event: line.slice(0, 140) }); continue; }
  }
  return out;
}

/* ————— FXBAG — the sealed evidence bag —————
 *
 * Format v1 (this comment is the spec; keep it true):
 *   bytes 0..7    magic "FXBAG001"
 *   bytes 8..23   PBKDF2 salt — 16 random bytes
 *   bytes 24..35  AES-GCM IV — 12 random bytes
 *   bytes 36..    AES-256-GCM ciphertext + the 16-byte GCM tag
 *                 (WebCrypto appends the tag to the ciphertext)
 * Plaintext layout:
 *   u32be manifest length N
 *   N bytes of manifest JSON (utf8):
 *     { v: 1, id, created (ISO), source,
 *       files: [{ name, size, sha256 }],
 *       custody: [custody log lines] }
 *   then every file's bytes, concatenated in manifest order.
 * Key: PBKDF2(passphrase, salt, 600,000 iterations, SHA-256)
 * → AES-256-GCM, 256-bit. The passphrase is never stored, here
 * or anywhere else in the OS. A wrong passphrase or a single
 * flipped bit anywhere in the bag fails the GCM tag and the
 * bag is refused whole. On open, each file's SHA-256 is checked
 * against the manifest before anything is handed back.
 */
export interface BagFile { name: string; bytes: Uint8Array }
export interface BagManifest {
  v: number; id: string; created: string; source: string;
  files: Array<{ name: string; size: number; sha256: string }>;
  custody: string[];
}
const BAG_MAGIC = "FXBAG001";
const BAG_ITERS = 600000;
async function bagKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: BAG_ITERS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}
export function bagId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "bag-" + toHex(b);
}
export async function sealBag(files: BagFile[], source: string, custody: string[], passphrase: string): Promise<{ bag: Uint8Array; manifest: BagManifest }> {
  const manifest: BagManifest = {
    v: 1, id: bagId(), created: new Date().toISOString(), source, custody,
    files: await Promise.all(files.map(async (f) => ({ name: f.name, size: f.bytes.length, sha256: await sha256(f.bytes) }))),
  };
  const mBytes = te.encode(JSON.stringify(manifest));
  const plainLen = 4 + mBytes.length + files.reduce((a, f) => a + f.bytes.length, 0);
  const plain = new Uint8Array(plainLen);
  const dv = new DataView(plain.buffer);
  dv.setUint32(0, mBytes.length);
  plain.set(mBytes, 4);
  let off = 4 + mBytes.length;
  for (const f of files) { plain.set(f.bytes, off); off += f.bytes.length; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await bagKey(passphrase, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, plain as unknown as BufferSource));
  const bag = new Uint8Array(8 + 16 + 12 + cipher.length);
  bag.set(te.encode(BAG_MAGIC), 0);
  bag.set(salt, 8);
  bag.set(iv, 24);
  bag.set(cipher, 36);
  return { bag, manifest };
}
export interface OpenedBag { manifest: BagManifest; files: Array<{ name: string; bytes: Uint8Array; sha256: string; expect: string; verified: boolean }> }
export async function openBag(bag: Uint8Array, passphrase: string): Promise<OpenedBag> {
  if (bag.length < 36 + 16 || asciiAt(bag, 0, 8) !== BAG_MAGIC) throw new Error("not an FXBAG001 evidence bag");
  const salt = bag.subarray(8, 24);
  const iv = bag.subarray(24, 36);
  const key = await bagKey(passphrase, new Uint8Array(salt));
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) as unknown as BufferSource }, key, bag.subarray(36) as unknown as BufferSource);
  } catch {
    throw new Error("the bag refused: wrong passphrase or tampered bytes (GCM tag check failed)");
  }
  const plain = new Uint8Array(plainBuf);
  const mLen = u32be(plain, 0);
  if (4 + mLen > plain.length) throw new Error("bag manifest is corrupt");
  const manifest = JSON.parse(td.decode(plain.subarray(4, 4 + mLen))) as BagManifest;
  let off = 4 + mLen;
  const files: OpenedBag["files"] = [];
  for (const entry of manifest.files) {
    const bytes = plain.subarray(off, off + entry.size);
    if (bytes.length !== entry.size) throw new Error("bag is truncated: " + entry.name);
    const digest = await sha256(new Uint8Array(bytes));
    files.push({ name: entry.name, bytes: new Uint8Array(bytes), sha256: digest, expect: entry.sha256, verified: digest === entry.sha256 && entry.size === bytes.length });
    off += entry.size;
  }
  return { manifest, files };
}
