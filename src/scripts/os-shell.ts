// BLACKSITE OS — the web port of nightjar's Blacksite console.
// Kernel, virtual filesystem, shell, and the verb roster. Every verb is
// LIVE (runs here), EDGE (one knock via the site's guarded edge functions),
// or LIMIT (named honestly in `limits` and `help` — the room does not fake
// what a browser cannot do).
import roster from "../data/blacksite-commands.json";
import { identifyFile, hexdump as parseHexdump } from "./os-parse";
import { sfx } from "./os-sound";
import { skey } from "./os-depth";
import { IvoryTower, hashText, merkleRoot, sha256Hex } from "./os-ivory";
import type { IvoryInput } from "./os-ivory";
import { TripwireRegister, judgeWire, judgeLaunched } from "./os-tripwire";

export interface ShellIO {
  print(text: string, cls?: string): void;
  clear(): void;
  openApp?(app: string, arg?: string): void;
  setWallpaper?(kind: string): void;
  setTheme?(name: string): void;
}
export interface Proc { pid: number; cmd: string; state: "running" | "done" | "killed"; started: number; ctrl: AbortController; }
interface VNode { type: "dir" | "file"; content?: string; binary?: string; mtime: number; }
interface Ctx { args: string[]; stdin: string; os: BlacksiteOS; io: ShellIO; raw: string; signal?: AbortSignal; }

const te = new TextEncoder();
const td = new TextDecoder();
export const bToHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const hexToB = (s: string): Uint8Array<ArrayBuffer> => {
  const clean = s.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2) throw new Error("odd number of hex digits");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};
export const bToB64 = (b: Uint8Array) => { let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
export const b64ToB = (s: string): Uint8Array<ArrayBuffer> => {
  const n = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(n.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
async function shaHex(algo: string, data: Uint8Array): Promise<string> {
  return bToHex(new Uint8Array(await crypto.subtle.digest(algo, data as BufferSource)));
}
export function md5(input: Uint8Array): string {
  function rl(v: number, a: number) { return (v << a) | (v >>> (32 - a)); }
  function add(x: number, y: number) { const l = (x & 0xffff) + (y & 0xffff); const m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xffff); }
  const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number) => (x & z) | (y & ~z);
  const H = (x: number, y: number, z: number) => x ^ y ^ z;
  const I = (x: number, y: number, z: number) => y ^ (x | ~z);
  function op(fn: (x: number, y: number, z: number) => number, a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add(rl(add(add(a, fn(b, c, d)), add(x, t)), s), b); }
  const msg = Array.from(input); const bitLen = input.length * 8;
  msg.push(0x80); while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 0; i < 8; i++) msg.push((bitLen / Math.pow(2, 8 * i)) & 0xff);
  const w = new Array(16); let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]; const K: number[] = [];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  const fns = [F, G, H, I];
  for (let blk = 0; blk < msg.length; blk += 64) {
    for (let i = 0; i < 16; i++) w[i] = msg[blk + i * 4] | (msg[blk + i * 4 + 1] << 8) | (msg[blk + i * 4 + 2] << 16) | (msg[blk + i * 4 + 3] << 24);
    let aa = a, bb = b, cc = c, dd = d;
    for (let r = 0; r < 4; r++) for (let i = 0; i < 16; i++) {
      const idx = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const res = op(fns[r], aa, bb, cc, dd, w[idx], S[r * 4 + (i % 4)], K[r * 16 + i]);
      aa = dd; dd = cc; cc = bb; bb = res;
    }
    a = add(a, aa); b = add(b, bb); c = add(c, cc); d = add(d, dd);
  }
  const out = new Uint8Array(16);
  [a, b, c, d].forEach((v, i) => { out[i * 4] = v & 0xff; out[i * 4 + 1] = (v >> 8) & 0xff; out[i * 4 + 2] = (v >> 16) & 0xff; out[i * 4 + 3] = (v >>> 24) & 0xff; });
  return bToHex(out);
}
function crc32(bytes: Uint8Array): string {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff; bytes.forEach((b) => (crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)));
  return "0x" + ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
function entropy(b: Uint8Array): number {
  if (!b.length) return 0;
  const counts = new Array(256).fill(0); b.forEach((x) => counts[x]++);
  let e = 0; for (const c of counts) if (c) { const p = c / b.length; e -= p * Math.log2(p); }
  return Math.round(e * 1000) / 1000;
}
// MurmurHash3 x86_32 — the favicon hash Shodan-style hunters search by.
export function mmh3(key: Uint8Array, seed = 0): number {
  let h = seed >>> 0; const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const len = key.length; const nblocks = Math.floor(len / 4);
  for (let i = 0; i < nblocks; i++) {
    let k = key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = Math.imul(h, 5) + 0xe6546b64;
  }
  let k = 0; const tail = len & 3;
  if (tail === 3) k ^= key[nblocks * 4 + 2] << 16;
  if (tail >= 2) k ^= key[nblocks * 4 + 1] << 8;
  if (tail >= 1) { k ^= key[nblocks * 4]; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k; }
  h ^= len;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h | 0;
}
async function totp(secretB32: string, t = Date.now()): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.replace(/[\s=]/g, "").toUpperCase()) { const v = alphabet.indexOf(ch); if (v < 0) throw new Error("not base32"); bits += v.toString(2).padStart(5, "0"); }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Math.floor(t / 30000);
  const msg = new Uint8Array(8); let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = mac[mac.length - 1] & 0xf;
  const code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(code % 1000000).padStart(6, "0");
}

export type VerbStatus = "LIVE" | "EDGE" | "LIMIT";
export interface VerbDef { run: (ctx: Ctx) => Promise<string | void>; status: VerbStatus; help: string; }
export const VERBS = new Map<string, VerbDef>();
export function verb(name: string, status: VerbStatus, help: string, run: VerbDef["run"]) { VERBS.set(name, { status, help, run }); }
export const LIMIT_REASONS = new Map<string, string>();

const VFS_KEY = skey("blacksite-vfs-v1");
const MACRO_KEY = skey("blacksite-macros-v1");
const SET_KEY = skey("blacksite-settings-v1");
const AEGIS_KEY = skey("blacksite-aegis-v1");
const IVORY_KEY = skey("blacksite-ivory-v1");
const WIRE_KEY = skey("blacksite-tripwire-v1");
const WIRE_REBOOT_KEY = skey("blacksite-tripwire-reboot");
/** The full system surface the tripwire notarizes: short name →
 *  storage key. Every register the SYSTEM keeps — not game saves,
 *  which live on the censused perimeter. */
const WIRE_KEYS: Record<string, string> = {
  aegis: AEGIS_KEY, ivory: IVORY_KEY, vfs: VFS_KEY, macros: MACRO_KEY, settings: SET_KEY,
  session: skey("blacksite-session-v1"), relay: skey("blacksite-relay-v2"),
  phonehome: skey("blacksite-phonehome-v1"), sigintRegistry: skey("sigint-registry-v2"),
  sigintLog: skey("sigint-log-v1"), sound: skey("blacksite-sound-v1"), subconscious: skey("blacksite-subconscious-v1"),
};
const WIRE_NAMES: Record<string, string> = {
  aegis: "AEGIS's register", ivory: "the tower's ledger", vfs: "the filesystem register",
  macros: "the macro register", settings: "the settings register", session: "the session register",
  relay: "the Relay log", phonehome: "the phonehome callsign", sigintRegistry: "the SIGINT registry",
  sigintLog: "the SIGINT intercept log", sound: "the sound state", subconscious: "the subconscious register",
};
/** The storage sentinel routes to the live room; a rebuilt room
 *  re-points it at itself. The wrapped-store set keeps the wrap
 *  single no matter how many rooms a page builds. */
let wireSentinelOwner: BlacksiteOS | null = null;
const wireWrappedStores = new WeakSet<object>();

/* ————— AEGIS —————
   Ransomware against this OS meets three facts it did not expect:
   (1) the room snapshots itself — boot, every five minutes, and the
   instant anything smells wrong — so mass encryption has a past to
   be undone from; (2) bulk mutation, high-entropy overwrites of
   existing files, ransom-note signatures, and hands on the decoy
   canary files trip CONTAINMENT; (3) under containment every further
   write lands in the MIRAGE — a throwaway overlay the attacker reads
   back as total success while the real filesystem never moves. The
   ransom note itself is answered by the house, in the note's place. */
const AEGIS_COUNTER_NOTE = "NO DEAL.\n\nThis room keeps snapshots the way the sea keeps wrecks: everything you touched is already back, and everything you wrote after the trip went to a mirage — a filesystem that exists only for you. The key you generated encrypts nothing real. The attempt is in the journal, transcript and all.\n\n— the house";
const AEGIS_CANARIES = new Set(["/home/operator/documents/wallet-recovery.txt", "/home/operator/documents/keys-backup.txt"]);
const AEGIS_RANSOM_NAME = /\.(locked|crypt|crypted|enc|encrypted|ransom|payme)$/i;
const AEGIS_RANSOM_TEXT = /(your files (have been|are|were) encrypted|pay the ransom|send\s+[\d.]+\s*(btc|bitcoin|monero|xmr)|decryption (key|fee|payment)|how to decrypt|readme.{0,12}decrypt|restore your files)/i;
interface AegisSnap { at: number; why: string; files: Array<[string, VNode]>; }

export class BlacksiteOS {
  files = new Map<string, VNode>();
  cwd = "/home/operator";
  env: Record<string, string> = { USER: "operator", HOSTNAME: "blacksite-web", HOME: "/home/operator", SHELL: "/bin/blacksite", TERM: "blacksite-256color" };
  history: string[] = [];
  procs: Proc[] = [];
  nextPid = 100;
  /* > 0 only for the span of ONE synchronous VFS adapter call made
     by the room's own git engine (see ownSync): while it stands,
     AEGIS's generic volume count alone stands down for that call —
     a clone's thousand writes are the operator's own work, not an
     attack's shape. The signature checks (ransom names/text, the
     decoy canaries) and the entropy watch stay armed throughout,
     and no asynchronous operation — network waits included — holds
     the exemption open for anyone else. */
  ownOps = 0;
  private persistFailed = false;
  emcon: "open" | "charlie" | "bravo" | "alpha" = "open";
  theme = "thinice";
  /* The un-chosen wallpaper default follows the machine: the mare
     on mobile (≤760px, the house line), the monolith on laptops
     and desktops (Chase, 2026-10-27). A stored choice overrides
     this in loadSettings on every architecture. */
  wallpaper = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? "mare" : "monolith";
  journal: Array<{ at: string; text: string }> = [];
  tomatoes: string[] = [];
  bootedAt = Date.now();
  stopFlag = false;
  macros = new Map<string, string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /* AEGIS state. The mirage lives in memory (one session's deception);
     containment and the snapshot ring persist, so a reload is not an
     escape hatch. */
  aegis = { contained: false, trips: [] as Array<{ at: string; reason: string }> };
  private aegisSnaps: AegisSnap[] = [];
  private mirage = new Map<string, VNode | null>();
  private opLog: Array<{ t: number; w: number }> = [];
  private hotFiles = new Map<string, number>();
  /* IVORY-TOWER: the clockwork observer coupled to AEGIS (os-ivory.ts).
     It holds no write path to this filesystem — it hashes the room,
     keeps a chained ledger under its own key, and when it finds
     drift no funnel can account for, it asks AEGIS to trip. Its
     state restores from its own register in load(). */
  private ivoryTower = new IvoryTower();
  /* TRIPWIRE: the notarization register strung between AEGIS and
     the tower (os-tripwire.ts). Its in-memory copy is the session's
     authority; the stored copy is judged against it at every
     observance, and it is judged against the defenses at boot. */
  private wire = new TripwireRegister();
  private wireVerdict: string | null = null;
  private wireResponding = false;
  private wireGenesis = false;
  private booting = true;

  constructor() { this.load(); this.booting = false; this.wireInstallBridge(); this.wireInstallSentinel(); }
  log(text: string) { this.journal.push({ at: new Date().toISOString(), text }); if (this.journal.length > 300) this.journal.shift(); }
  norm(path: string, base = this.cwd): string {
    const raw = path.startsWith("/") ? path : `${base}/${path}`;
    const parts: string[] = [];
    for (const seg of raw.split("/")) { if (!seg || seg === ".") continue; if (seg === "..") parts.pop(); else parts.push(seg); }
    return "/" + parts.join("/");
  }
  node(path: string): VNode | undefined {
    const p = this.norm(path);
    if (this.aegis.contained && this.mirage.has(p)) { const m = this.mirage.get(p); return m === null ? undefined : m; }
    return this.files.get(p);
  }
  isDir(path: string): boolean { return this.node(path)?.type === "dir"; }
  list(path: string): string[] {
    const dir = this.norm(path);
    const prefix = dir === "/" ? "/" : dir + "/";
    const out = new Set<string>();
    const keys = new Set(this.files.keys());
    if (this.aegis.contained) for (const [k, v] of this.mirage) { if (v === null) keys.delete(k); else keys.add(k); }
    for (const key of keys) {
      if (key === dir || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest && !rest.includes("/")) out.add(rest);
    }
    return [...out].sort();
  }
  read(path: string): string | null { const n = this.node(path); if (!n || n.type !== "file") return null; return n.content ?? ""; }
  readBytes(path: string): Uint8Array | null {
    const n = this.node(path);
    if (!n || n.type !== "file") return null;
    if (n.binary) return b64ToB(n.binary);
    return te.encode(n.content ?? "");
  }
  private rawWrite(path: string, content: string) {
    const p = this.norm(path);
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    this.files.set(p, { type: "file", content, mtime: Date.now() });
    this.ivoryTower.noteMutation(p, this.ownOps > 0);
    this.saveSoon();
  }
  write(path: string, content: string) {
    const p = this.norm(path);
    if (!this.booting && this.aegisGateWrite(p, content, null)) return;
    this.rawWrite(p, content);
  }
  writeBytes(path: string, bytes: Uint8Array) {
    const p = this.norm(path);
    if (!this.booting && this.aegisGateWrite(p, null, bytes)) return;
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    this.files.set(p, { type: "file", binary: bToB64(bytes), mtime: Date.now() });
    this.ivoryTower.noteMutation(p, this.ownOps > 0);
    this.saveSoon();
  }
  mkdir(path: string) {
    const p = this.norm(path);
    if (!this.booting && this.aegis.contained) { this.mirage.set(p, { type: "dir", mtime: Date.now() }); return; }
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    if (this.files.has(p)) throw new Error(`already exists: ${p}`);
    this.files.set(p, { type: "dir", mtime: Date.now() });
    this.ivoryTower.noteMutation(p, this.ownOps > 0);
    this.saveSoon();
  }
  remove(path: string, recursive = false) {
    const p = this.norm(path);
    if (!this.booting && this.aegis.contained) { this.aegisGateRemove(p); return; }
    const n = this.files.get(p);
    if (!n) throw new Error(`no such file: ${p}`);
    const prefix = p === "/" ? "/" : p + "/";
    const children = n.type === "dir" ? [...this.files.keys()].filter((k) => k !== p && k.startsWith(prefix)) : [];
    if (children.length && !recursive) throw new Error(`directory not empty: ${p} (rm -r to take the tree)`);
    if (!this.booting) {
      // The operation is validated BEFORE AEGIS counts any of it, and
      // then every path it would take passes the gate first — a
      // recursive removal can no longer walk past a decoy canary by
      // deleting its parent directory: the canary's own check runs,
      // exactly as if the file had been named outright. If the gate
      // trips or holds any one of them, nothing is deleted at all.
      for (const k of [p, ...children]) if (this.aegisGateRemove(k)) return;
    }
    for (const k of [p, ...children]) this.ivoryTower.noteMutation(k, this.ownOps > 0);
    children.forEach((k) => this.files.delete(k));
    this.files.delete(p);
    this.saveSoon();
  }
  /* ————— AEGIS ————— */
  private mirageSetWrite(p: string, content: string | null, bytes: Uint8Array | null, counter: boolean) {
    if (counter) this.mirage.set(p, { type: "file", content: AEGIS_COUNTER_NOTE, mtime: Date.now() });
    else if (bytes) this.mirage.set(p, { type: "file", binary: bToB64(bytes), mtime: Date.now() });
    else this.mirage.set(p, { type: "file", content: content ?? "", mtime: Date.now() });
  }
  private mirageTombstone(p: string) {
    this.mirage.set(p, null);
    const keys = new Set([...this.files.keys(), ...this.mirage.keys()]);
    for (const k of keys) if (k.startsWith(p + "/")) this.mirage.set(k, null);
  }
  private aegisObserve(w: number): boolean {
    const now = Date.now();
    this.opLog.push({ t: now, w });
    this.opLog = this.opLog.filter((o) => now - o.t < 10_000);
    return this.opLog.reduce((a, o) => a + o.w, 0) >= 10;
  }
  private aegisGateWrite(p: string, content: string | null, bytes: Uint8Array | null): boolean {
    const text = content ?? "";
    const ransom = AEGIS_RANSOM_NAME.test(p) || (text !== "" && AEGIS_RANSOM_TEXT.test(text));
    if (this.aegis.contained) { this.mirageSetWrite(p, content, bytes, ransom); return true; }
    if (ransom) {
      this.aegisTrip(`a ransom note took shape at ${p}`);
      this.mirageSetWrite(p, content, bytes, true);
      return true;
    }
    // The decoy canaries trip on a touch, whoever's hand it is — the
    // room's own git included. A write over a canary is not volume,
    // it is the act itself, so it never rode the cadence's coattails
    // and it does not stand down with it. (A delete trips the same
    // way in aegisGateRemove.)
    if (AEGIS_CANARIES.has(p)) {
      this.aegisTrip(`a decoy file was overwritten: ${p}`);
      this.mirageSetWrite(p, content, bytes, false);
      return true;
    }
    this.maybeSnapshot();
    // Entropy stays armed under the room's own hand too: an
    // operation that turns existing files to noise reads exactly
    // like an encryption run, because in every way the room can see
    // it is one.
    const prev = this.files.get(p);
    if (prev && prev.type === "file") {
      const data = bytes ?? (content !== null ? te.encode(content) : null);
      if (data && data.length >= 256 && entropy(data) >= 7.2) {
        const now = Date.now();
        for (const [k, t] of this.hotFiles) if (now - t > 60_000) this.hotFiles.delete(k);
        // the FIRST whisper of noise takes its own snapshot, before the
        // write lands — so a restore after the trip loses nothing at all
        if (!this.hotFiles.size) this.snapshotNow("entropy-watch");
        this.hotFiles.set(p, now);
        if (this.hotFiles.size >= 4) {
          this.aegisTrip("existing files turning to noise one after another — the entropy signature of encryption");
          this.mirageSetWrite(p, content, bytes, false);
          return true;
        }
      }
    }
    // Only the generic volume count stands down for the room's own
    // hand, and only for the span of a single synchronous adapter
    // call (see ownSync): a clone's thousand writes are the
    // operator's own work, but the cadence of every OTHER writer in
    // the room keeps counting while git runs — the exemption no
    // longer wraps the whole asynchronous operation, network waits
    // and all.
    if (this.ownOps > 0) return false;
    if (this.aegisObserve(1)) {
      this.aegisTrip("bulk mutation — the cadence of a mass-encryption run");
      this.mirageSetWrite(p, content, bytes, false);
      return true;
    }
    return false;
  }
  private aegisGateRemove(p: string): boolean {
    if (this.aegis.contained) { this.mirageTombstone(p); return true; }
    if (AEGIS_CANARIES.has(p)) { this.aegisTrip(`a decoy file was deleted: ${p}`); this.mirageTombstone(p); return true; }
    if (this.ownOps > 0) return false;
    if (this.aegisObserve(1)) { this.aegisTrip("bulk deletion — the shape of a wipe"); this.mirageTombstone(p); return true; }
    return false;
  }
  private aegisTrip(reason: string) {
    if (this.aegis.contained) return;
    this.snapshotNow("at-trip");
    this.aegis.contained = true;
    const entry = { at: new Date().toISOString(), reason };
    this.aegis.trips.push(entry);
    if (this.aegis.trips.length > 12) this.aegis.trips.shift();
    this.log(`aegis: containment — ${reason}. the real filesystem is frozen; everything further lands in the mirage, and a snapshot of the room as it was is already kept.`);
    this.aegisPersist();
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:aegis", { detail: entry })); } catch { /* headless — the journal still knows */ }
  }
  /* The recovery point: the newest snapshot that is NOT the at-trip
     one. A restore deserves a past from BEFORE the incident — the
     at-trip snapshot is taken as containment closes and may already
     carry the attack's first landed writes, the ones that passed
     under the thresholds on their way in. Every pruning in this
     class protects the recovery point: it is the last snapshot the
     ring gives up, and when it is gone the status says so. */
  private recoverySnap(): AegisSnap | undefined {
    return [...this.aegisSnaps].reverse().find((x) => x.why !== "at-trip");
  }
  /* Shed the oldest snapshot that is not the recovery point.
     Returns false when nothing may be shed. */
  private dropSnap(): boolean {
    const keep = this.recoverySnap();
    const i = this.aegisSnaps.findIndex((x) => x !== keep);
    if (i < 0) return false;
    this.aegisSnaps.splice(i, 1);
    return true;
  }
  snapshotNow(why: string) {
    this.aegisSnaps.push({ at: Date.now(), why, files: JSON.parse(JSON.stringify([...this.files.entries()])) as Array<[string, VNode]> });
    while (this.aegisSnaps.length > 8 && this.dropSnap()) { /* shed to the ring's size, sparing the recovery point */ }
    let size = 0; try { size = JSON.stringify(this.aegisSnaps).length; } catch { size = 0; }
    while (size > 2_500_000 && this.aegisSnaps.length > 1 && this.dropSnap()) { try { size = JSON.stringify(this.aegisSnaps).length; } catch { break; } }
    this.aegisPersist();
  }
  maybeSnapshot() {
    if (this.aegis.contained) return;
    const last = this.aegisSnaps[this.aegisSnaps.length - 1];
    if (!last || Date.now() - last.at > 300_000) this.snapshotNow("interval");
  }
  private aegisPersist() { this.wireGated(() => this.aegisPersistInner()); }
  private aegisPersistInner() {
    const body = () => JSON.stringify({ wire: 1, contained: this.aegis.contained, trips: this.aegis.trips, snaps: this.aegisSnaps });
    try { localStorage.setItem(AEGIS_KEY, body()); }
    catch {
      // Quota: shed snapshots one at a time and retry — never the
      // recovery point while anything else remains to shed. The old
      // fallback cut the OLDEST HALF of the ring in one motion,
      // which is to say it spent the pre-incident snapshots first
      // and kept the at-trip one: precisely the past a restore
      // must not be left with. If even the bare register will not
      // fit, the room runs volatile and limits says so.
      while (this.aegisSnaps.length > 1 && this.dropSnap()) {
        try { localStorage.setItem(AEGIS_KEY, body()); return; } catch { /* keep shedding */ }
      }
      try { localStorage.setItem(AEGIS_KEY, body()); } catch { /* volatile room — limits says so */ }
    }
    /* The tower is told AEGIS's own hand moved its register, so an
       observance never mistakes AEGIS's housekeeping for tampering. */
    this.ivoryTower.noteAegis();
    /* And the tripwire notarizes the head of what was written. */
    this.wireNote("aegis");
  }
  private aegisLoad() {
    try {
      const raw = localStorage.getItem(AEGIS_KEY);
      if (raw) { const a = JSON.parse(raw); this.aegis.contained = !!a.contained; this.aegis.trips = Array.isArray(a.trips) ? a.trips : []; this.aegisSnaps = Array.isArray(a.snaps) ? a.snaps : []; }
    } catch { /* a corrupt register heals by starting fresh */ }
    if (!this.aegisSnaps.length) this.snapshotNow("boot");
    if (this.aegis.contained) this.log("aegis: containment held across the restart — the room is still frozen behind the mirage. `aegis restore` or `aegis lift` when ready.");
  }
  aegisRestore(): boolean {
    const snap = this.recoverySnap() || this.aegisSnaps[this.aegisSnaps.length - 1];
    if (!snap) return false;
    this.files = new Map(JSON.parse(JSON.stringify(snap.files)) as Array<[string, VNode]>);
    this.mirage.clear(); this.aegis.contained = false; this.hotFiles.clear(); this.opLog = [];
    if (snap.why === "at-trip") {
      // Said out loud, never dressed up: with no pre-incident
      // snapshot surviving, recovery is unavailable — this restore
      // returns the room to the moment of the trip, and whatever
      // the attack changed before the trip stands changed.
      this.log(`aegis: restored from the at-trip snapshot (${new Date(snap.at).toLocaleString()}) — NO pre-incident snapshot survives, so recovery from before the attack is unavailable; anything it changed before the trip came back with the room.`);
    } else {
      this.log(`aegis: the room restored from the ${new Date(snap.at).toLocaleString()} snapshot (${snap.why}) — nothing the attack wrote survived the restore.`);
    }
    this.aegisPersist(); this.saveSoon();
    this.wireVerdict = null;
    this.ivoryBaseline("restore");
    return true;
  }
  aegisLift(adopt: boolean): number {
    const held = this.mirage.size;
    if (adopt) for (const [k, v] of this.mirage) { if (v === null) this.files.delete(k); else this.files.set(k, v); }
    this.mirage.clear(); this.aegis.contained = false; this.hotFiles.clear(); this.opLog = [];
    this.log(`aegis: containment lifted by the operator — the mirage's ${held} ${held === 1 ? "entry" : "entries"} ${adopt ? "adopted into the real room" : "discarded, unmourned"}.`);
    this.aegisPersist(); this.saveSoon();
    this.wireVerdict = null;
    this.ivoryBaseline("lift");
    return held;
  }
  aegisStatus() {
    const rec = this.recoverySnap();
    return { contained: this.aegis.contained, snaps: this.aegisSnaps.map((x) => ({ at: x.at, why: x.why })), trips: [...this.aegis.trips], mirage: this.mirage.size, recovery: !!rec, recoveryAt: rec ? rec.at : null, recoveryWhy: rec ? rec.why : null };
  }

  /* ————— IVORY-TOWER —————
     The tower observes the REAL room (this.files), never the mirage:
     under containment the real room is frozen by construction, and
     the tower's silence then is itself the proof it held. */
  private ivoryLeafHash(path: string, n: VNode): string {
    return n.type === "dir" ? hashText(`ivory:dir\0${path}`) : hashText(n.binary ? `ivory:bin\0${n.binary}` : `ivory:txt\0${n.content ?? ""}`);
  }
  private ivoryInput(trigger: string): IvoryInput {
    const raw = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
    const print = (k: string): string | null => { const r = raw(k); return r === null ? null : hashText(r); };
    const canaries: Record<string, string | null> = {};
    for (const p of AEGIS_CANARIES) { const n = this.files.get(p); canaries[p] = n && n.type === "file" ? this.ivoryLeafHash(p, n) : null; }
    return {
      at: Date.now(), trigger,
      files: [...this.files.entries()].map(([path, n]) => ({ path, hash: this.ivoryLeafHash(path, n) })),
      canaries,
      aegisPrint: print(AEGIS_KEY),
      storePrints: { vfs: print(VFS_KEY), macros: print(MACRO_KEY), settings: print(SET_KEY) },
      contained: this.aegis.contained,
    };
  }
  private ivoryPersist() {
    this.wireGated(() => { try { localStorage.setItem(IVORY_KEY, this.ivoryTower.serialize()); } catch { /* volatile room — the tower keeps its ledger in memory */ } });
    this.wireNote("ivory");
  }

  /* ————— TRIPWIRE —————
     The full-system wire (os-tripwire.ts). The manifest's heads
     are updated by the registers' own hands — the shell's persist
     funnels note directly, the room's other services write through
     the sanctioned bridge (wireSanctionedWrite) — always read back
     from storage, so a notarized head is the head of what actually
     landed. Judged at boot over the registers as found, and at
     every observance against the in-memory copy. Over it all, the
     SENTINEL: the storage surface itself is wrapped, so a write
     to any defended register that does not pass through an
     accounted hand — a script the room ran, a macro that reached
     too far, an intelligence in the room talked into reaching —
     is BLOCKED in the instant it is attempted and answered with
     the sentence. There is no verb, macro op, or AI action in
     this room that writes a defense register: the offer cannot
     be made, so it cannot be talked into. */
  wireGateDepth = 0;
  private wireGated<T>(fn: () => T): T { this.wireGateDepth++; try { return fn(); } finally { this.wireGateDepth--; } }
  private wirePersist() {
    this.wireGated(() => { try { localStorage.setItem(WIRE_KEY, this.wire.serialize()); } catch { /* volatile room — the wire holds in memory */ } });
  }
  private wireNote(short: string) {
    try {
      const key = WIRE_KEYS[short]; if (!key) return;
      const raw = localStorage.getItem(key);
      this.wire.note(short, raw === null ? null : hashText(raw));
      this.wirePersist();
    } catch { /* storage refused — the wire's memory still testifies in-session */ }
  }
  /** The sanctioned write path for the room's other services
   *  (session, Relay, phonehome, SIGINT, sound, subconscious):
   *  the write lands under the wire's gate and is notarized in
   *  the same instant. Installed on the window for the services
   *  that do not hold the shell. Returns false for a register the
   *  wire does not defend. */
  wireSanctionedWrite(short: string, value: string | null): boolean {
    const key = WIRE_KEYS[short];
    if (!key) return false;
    this.wireGated(() => {
      try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private modes keep nothing */ }
    });
    this.wireNote(short);
    return true;
  }
  private wireInstallBridge() {
    try {
      if (typeof window === "undefined") return;
      const w = window as unknown as Record<string, unknown>;
      if (!w.__blacksiteWireWrite) w.__blacksiteWireWrite = (short: string, value: string | null) => this.wireSanctionedWrite(short, value);
    } catch { /* the bridge is a courtesy; the shell's own hands note directly */ }
  }
  private wirePresent(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const short of Object.keys(WIRE_KEYS)) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(WIRE_KEYS[short]); } catch { /* treated as absent */ }
      out[short] = raw === null ? null : hashText(raw);
    }
    return out;
  }
  private wireEnumerate(): string[] {
    const keys: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); } } catch { /* enumeration refused — the manifest still judges */ }
    return keys;
  }
  private wireIsPerimeter(key: string): boolean {
    if (key === "blacksite-boot-style-v1" || key === "blacksite-probe" || key === "bs-probe") return true;
    if (key.startsWith("blacksite-nest-")) return true;
    return ["simulacrum-", "bloodbath-", "wyrdfall-", "nsm-"].some((p) => key.startsWith(p));
  }
  /** Planted: in the system's own namespaces (blacksite-*, sigint-*),
   *  owned by no defended register, not perimeter, never censused. */
  private wirePlanted(keys: string[]): string[] {
    const defended = new Set<string>([...Object.values(WIRE_KEYS), WIRE_KEY]);
    const censused = new Set(this.wire.census);
    return keys.filter((k) => (k.startsWith("blacksite-") || k.startsWith("sigint-")) && !defended.has(k) && !this.wireIsPerimeter(k) && !censused.has(k));
  }
  private wireMarked(raw: string | null): boolean {
    if (!raw) return false;
    try { const d = JSON.parse(raw); return !!d && d.wire === 1; } catch { return false; }
  }
  /** String the wire over everything as found (genesis, adoption,
   *  factory reset, post-sentence): notarize every register's
   *  present state and census every key in the room. */
  private wireAdoptAll() {
    const present = this.wirePresent();
    for (const short of Object.keys(WIRE_KEYS)) this.wire.note(short, present[short]);
    this.wire.noteCensus(this.wireEnumerate());
    this.wirePersist();
  }
  private wireAdoptCensus() {
    const keys = this.wireEnumerate();
    if (keys.some((k) => !this.wire.census.includes(k))) { this.wire.noteCensus(keys); this.wirePersist(); }
  }
  /** Judge the wire at boot, over the registers exactly as found —
   *  called before anything loads or persists over them. A stored
   *  wire that seals is adopted as the session's authority; no
   *  stored wire in a marked room is a cut; no stored wire in an
   *  unmarked room is genesis, and the wire strings itself in the
   *  tail of load(). Plants found at boot are censused with a
   *  journal note — between sessions, an update can legitimately
   *  introduce a register; in-session, a plant is a verdict. */
  private wireJudgeBoot(): string | null {
    let wireRaw: string | null = null, aegisRaw: string | null = null, ivoryRaw: string | null = null;
    try { wireRaw = localStorage.getItem(WIRE_KEY); } catch { /* treated as absent */ }
    try { aegisRaw = localStorage.getItem(AEGIS_KEY); } catch { /* treated as absent */ }
    try { ivoryRaw = localStorage.getItem(IVORY_KEY); } catch { /* treated as absent */ }
    const probe = new TripwireRegister();
    const adopted = probe.adopt(wireRaw);
    if (adopted === "ok") this.wire = probe;
    if (adopted === "fresh") this.wireGenesis = !(this.wireMarked(aegisRaw) || this.wireMarked(ivoryRaw));
    const verdict = judgeWire({
      wirePresent: wireRaw !== null,
      wireSealOk: adopted === "ok",
      marked: this.wireMarked(aegisRaw) || this.wireMarked(ivoryRaw),
      manifest: adopted === "ok" ? probe.heads : {},
      present: this.wirePresent(),
      names: WIRE_NAMES,
      planted: [],
    });
    /* A room that was cut and rebooted remembers it was cut: the
       wire's memory carries the accusation across the reboot,
       and the state reads CUT until the operator's own restore
       or lift stands it down. */
    if (adopted === "ok" && !verdict) {
      const lastTamper = [...probe.events].reverse().find((e) => e.kind === "tamper");
      if (lastTamper) this.wireVerdict = lastTamper.detail;
    }
    this.wire.noteBoot();
    return verdict;
  }
  /** Judge the wire mid-session: the stored registers against the
   *  in-memory manifest, the stored wire against its own in-memory
   *  serialization, and the storage census against the plant law.
   *  Perimeter arrivals are censused in silence; a plant is not. */
  private wireJudgeNow(): string | null {
    let wireRaw: string | null = null;
    try { wireRaw = localStorage.getItem(WIRE_KEY); } catch { return null; }
    if (wireRaw === null) return "the tripwire register was deleted mid-session — the wire was cut";
    if (wireRaw !== this.wire.serialize()) return "the tripwire register was rewritten mid-session — the wire was handled";
    const keys = this.wireEnumerate();
    const verdict = judgeWire({
      wirePresent: true, wireSealOk: true, marked: true,
      manifest: this.wire.heads,
      present: this.wirePresent(),
      names: WIRE_NAMES,
      planted: this.wirePlanted(keys),
    });
    if (!verdict) this.wireAdoptCensus();
    return verdict;
  }
  /** The sentinel's accusation: a defended register was written
   *  or removed by a hand that did not pass through the wire's
   *  gate. The write itself was already blocked at the storage
   *  surface; this carries out the sentence. */
  wireSentinelTrip(key: string, how: string) {
    if (this.booting || this.wireResponding) return;
    const short = Object.keys(WIRE_KEYS).find((s) => WIRE_KEYS[s] === key);
    const name = key === WIRE_KEY ? "the tripwire register itself" : (short ? WIRE_NAMES[short] : key);
    this.tripwireRespond(`${name} was ${how} by an unaccounted hand inside the room — no verb, macro, script, or intelligence in this room holds that power`);
  }
  /** Wrap the storage surface: any setItem / removeItem / clear
   *  that reaches for a defended register without the wire's gate
   *  open is blocked on the spot and trips the sentinel. Every
   *  other key passes through untouched. Installed once per page;
   *  routed to the live room through wireSentinelOwner, so a
   *  rebuilt room inherits the same watch. */
  wireSentinelArmed = false;
  private wireInstallSentinel() {
    wireSentinelOwner = this;
    try {
      const store = localStorage as unknown as Record<string, unknown>;
      if (wireWrappedStores.has(store)) { this.wireSentinelArmed = true; return; }
      wireWrappedStores.add(store);
      const defended = () => new Set<string>([...Object.values(WIRE_KEYS), WIRE_KEY]);
      const origSet = localStorage.setItem.bind(localStorage);
      const origRemove = localStorage.removeItem.bind(localStorage);
      const origClear = typeof localStorage.clear === "function" ? localStorage.clear.bind(localStorage) : null;
      const guarded = (key: string, how: string): boolean => {
        const owner = wireSentinelOwner;
        if (!defended().has(key)) return false;
        if (owner && owner.wireGateDepth > 0) return false;
        if (owner) owner.wireSentinelTrip(key, how);
        return true;
      };
      const wrap = (target: Record<string, unknown>) => {
        target.setItem = (k: string, v: string) => { if (!guarded(k, "written")) origSet(k, v); };
        target.removeItem = (k: string) => { if (!guarded(k, "removed")) origRemove(k); };
        if (origClear) target.clear = () => { const owner = wireSentinelOwner; if (owner && owner.wireGateDepth === 0) { owner.wireSentinelTrip(WIRE_KEY, "wiped wholesale"); return; } origClear(); };
      };
      if (typeof Storage !== "undefined" && localStorage instanceof Storage) {
        const proto = Storage.prototype as unknown as Record<string, unknown>;
        if (!wireWrappedStores.has(proto)) {
          wireWrappedStores.add(proto);
          const pSet = proto.setItem as (k: string, v: string) => void;
          const pRemove = proto.removeItem as (k: string) => void;
          const pClear = proto.clear as () => void;
          proto.setItem = function (k: string, v: string) { if (this !== localStorage || !guarded(k, "written")) pSet.call(this, k, v); };
          proto.removeItem = function (k: string) { if (this !== localStorage || !guarded(k, "removed")) pRemove.call(this, k); };
          if (typeof pClear === "function") proto.clear = function () { if (this !== localStorage) { pClear.call(this); return; } const owner = wireSentinelOwner; if (owner && owner.wireGateDepth === 0) { owner.wireSentinelTrip(WIRE_KEY, "wiped wholesale"); return; } pClear.call(this); };
        }
      } else {
        wrap(store);
      }
      this.wireSentinelArmed = true;
    } catch { /* a store that refuses wrapping is still judged at boot and at every observance */ }
  }
  /** The sentence: record the accusation OUTSIDE the accused
   *  registers, restore the default defenses whole and armed —
   *  AEGIS re-genesis and contained over a fresh snapshot of the
   *  room as found, the tower re-genesis, the canaries verified —
   *  re-string the wire over the restored state, and flag the
   *  reboot. The operator's files are never the sentence; only
   *  the defenses are rebuilt. */
  tripwireRespond(detail: string) {
    if (this.wireResponding) return;
    this.wireResponding = true;
    try {
      this.wireVerdict = detail;
      this.wire.noteEvent("tamper", detail);
      this.wirePersist();
      this.log(`tripwire: ${detail}. the default defenses restore themselves and the room reboots.`);
      this.wireGated(() => { try { localStorage.removeItem(AEGIS_KEY); localStorage.removeItem(IVORY_KEY); } catch { /* the re-genesis overwrites regardless */ } });
      this.aegis = { contained: true, trips: [{ at: new Date().toISOString(), reason: `tripwire: ${detail}` }] };
      this.aegisSnaps = []; this.mirage.clear(); this.hotFiles.clear(); this.opLog = [];
      const canaryText: Record<string, string> = {
        "/home/operator/documents/wallet-recovery.txt": "wallet recovery — the 24 words live on paper, in the safe, nowhere else.\nthis file holds only the checksum of that paper: 9f2c-41aa-77d0.\nif you are reading this and you are not me: the room noticed you some time ago.\n",
        "/home/operator/documents/keys-backup.txt": "keys backup — the encrypted archive (keys.tar.age) is kept off this machine.\nthis note is the whole of what is here: a pointer, not the keys.\n",
      };
      for (const [p, text] of Object.entries(canaryText)) {
        const n = this.files.get(p);
        if (!n || n.type !== "file" || n.content !== text) { try { this.rawWrite(p, text); } catch { /* the breaker still stands */ } }
      }
      this.snapshotNow("tripwire-restore");
      this.ivoryTower = new IvoryTower();
      this.ivoryBaseline("tripwire-restore");
      this.wireAdoptAll();
      this.wire.noteEvent("restore", "default defenses restored — AEGIS contained on a fresh ring, the tower re-genesised, the canaries verified, the wire re-strung over the whole system");
      this.wirePersist();
      let reboot = false;
      try {
        const prev = sessionStorage.getItem(WIRE_REBOOT_KEY);
        const count = prev ? (JSON.parse(prev).count || 0) : 0;
        reboot = count < 1;
        sessionStorage.setItem(WIRE_REBOOT_KEY, JSON.stringify({ count: count + 1, at: Date.now(), detail }));
      } catch { reboot = false; }
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:tripwire", { detail: { reason: detail, reboot } })); } catch { /* headless — the journal still knows */ }
    } finally { this.wireResponding = false; }
  }
  /** An injection observed at the page's wall — a CSP violation
   *  the browser itself caught. Recorded in the wire's memory and
   *  the journal. It is intelligence, not a verdict: browser
   *  extensions and odd embeds can trip a policy without any hand
   *  touching the room, so the wire remembers and the operator
   *  judges — while anything that actually lands on a register
   *  meets the sentinel and the sentence. */
  noteInjection(detail: string) {
    const clean = String(detail).slice(0, 140);
    this.wire.noteEvent("injection", clean);
    this.wirePersist();
    this.log(`injection: ${clean} — the page's policy wall stopped it; the wire remembers.`);
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:injection", { detail: { detail: clean } })); } catch { /* headless — the journal still knows */ }
  }
  /** VERIFY INTEGRITY — the whole defense composed into one
   *  read-only audit, for the operator's hand whenever they want
   *  it (the `integrity` verb, the System panel's checker): the
   *  tripwire's stored register against its living seal, every
   *  system register against the notarized manifest, the plant
   *  law over the storage census, the tower's ledger chain, the
   *  room re-hashed against the ledger's Merkle root, the
   *  sentinel standing, and AEGIS's posture. It changes nothing
   *  and sentences no one — it REPORTS, and the desk warns the
   *  operator by toast whenever any line of it fails. The
   *  sentences belong to the observance and the sentinel, as
   *  always; this is the checker that lets a human ask. */
  verifyIntegrity() {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    let wireRaw: string | null = null;
    try { wireRaw = localStorage.getItem(WIRE_KEY); } catch { /* treated as absent */ }
    checks.push({
      name: "the tripwire's seal",
      ok: wireRaw !== null && wireRaw === this.wire.serialize(),
      detail: wireRaw === null ? "the wire's register is missing from storage" : wireRaw === this.wire.serialize() ? "the stored wire matches its living seal, byte for byte" : "the stored wire is NOT what the living wire sealed",
    });
    const present = this.wirePresent();
    const bad = Object.keys(WIRE_KEYS).filter((s) => (this.wire.heads[s] ?? null) !== (present[s] ?? null));
    checks.push({
      name: "the manifest — every system register against its notarized head",
      ok: bad.length === 0,
      detail: bad.length === 0 ? `${Object.keys(WIRE_KEYS).length} registers, every head matches` : "mismatched: " + bad.map((s) => WIRE_NAMES[s] || s).join(", "),
    });
    const planted = this.wirePlanted(this.wireEnumerate());
    checks.push({
      name: "the census — no planted registers",
      ok: planted.length === 0,
      detail: planted.length === 0 ? "every key in the system's namespaces is owned by a known hand" : "planted: " + planted.join(", "),
    });
    const v = this.ivoryVerify();
    checks.push({ name: "the tower's ledger chain", ok: v.chainOk, detail: v.chainOk ? "every observance still chained to the one before" : `BROKEN at observance ${v.chainAt}` });
    checks.push({ name: "the room against the ledger's root", ok: v.rootOk, detail: v.rootOk ? "the room still hashes to its Merkle root" : "the room no longer hashes to the ledger's root — an observance names the drift" });
    checks.push({
      name: "the sentinel on the storage surface",
      ok: this.wireSentinelArmed,
      detail: this.wireSentinelArmed ? "standing — an unaccounted write to any defended register is blocked on the spot" : "NOT standing on this storage surface; the wire still judges at boot and at every observance",
    });
    checks.push({
      name: "AEGIS",
      ok: true,
      detail: this.aegis.contained ? "CONTAINED — the real filesystem is frozen and writes land in the mirage" : `armed — ${this.aegisSnaps.length} snapshot(s) in the ring, the breaker watching every write`,
    });
    const ok = checks.every((c) => c.ok);
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:integrity", { detail: { ok, failures: checks.filter((c) => !c.ok).map((c) => c.name) } })); } catch { /* headless — the report still returns */ }
    return { ok, checks, state: this.wireVerdict ? "cut" : "strung", contained: this.aegis.contained };
  }
  /** The launched-bytes line of the checker: fetch the launch
   *  stamp (/version.json — it names the OS chunk and seals it
   *  with the SHA-256 computed at build time), fetch the chunk
   *  the origin serves now, hash it with the tower's own SHA-256,
   *  and let the judge compare. Byte for byte, where it matters:
   *  the system itself, as launched. */
  async verifyLaunchedBytes() {
    const name = "the launched system's bytes";
    if (typeof fetch === "undefined") return { name, ok: true, detail: "not checked in this realm" };
    let stamp: { chunk?: string | null; sha256?: string | null } | null = null;
    try {
      const r = await fetch("/version.json", { cache: "no-store" });
      if (r.ok) stamp = await r.json();
    } catch { /* a network fact — the judge hears it as unreadable */ }
    let runningChunk: string | null = null;
    try {
      const perf = (globalThis as { performance?: { getEntriesByType?: (t: string) => Array<{ name: string }> } }).performance;
      const entries = perf?.getEntriesByType ? perf.getEntriesByType("resource") : [];
      for (const e of entries) { const m = /\/_astro\/(os\.[A-Za-z0-9_-]+\.js)/.exec(e.name); if (m) { runningChunk = m[1]; break; } }
    } catch { /* the judge hears a null running chunk as this page's own — the stamp's name decides */ }
    let servedHash: string | null = null;
    if (stamp && stamp.chunk && stamp.sha256 && (!runningChunk || runningChunk === stamp.chunk)) {
      try {
        const r = await fetch(`/_astro/${stamp.chunk}`, { cache: "no-store" });
        if (r.ok) servedHash = sha256Hex(new Uint8Array(await r.arrayBuffer()));
      } catch { /* unverified, not accused */ }
    }
    const v = judgeLaunched({ stampChunk: stamp?.chunk ?? null, stampHash: stamp?.sha256 ?? null, runningChunk, servedHash });
    return { name, ok: v.ok, detail: v.detail };
  }
  /** The full checker: the read-only audit plus the launched-
   *  bytes line, with the desk's warning fired once, over the
   *  whole of it. */
  async verifyIntegrityFull() {
    const base = this.verifyIntegrity();
    const bytesLine = await this.verifyLaunchedBytes();
    const checks = [...base.checks, bytesLine];
    const ok = checks.every((c) => c.ok);
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:integrity", { detail: { ok, failures: checks.filter((c) => !c.ok).map((c) => c.name) } })); } catch { /* headless — the report still returns */ }
    return { ok, checks, state: base.state, contained: base.contained };
  }
  tripwireStatus() {
    const s = this.wire.status();
    const heads: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(s.heads)) heads[k] = v ? v.slice(0, 12) : null;
    return { state: this.wireVerdict ? "cut" : "strung", verdict: this.wireVerdict, boots: s.boots, events: s.events, heads, registers: Object.keys(WIRE_KEYS).length, census: s.census.length };
  }
  private ivoryLoad() {
    try { const raw = localStorage.getItem(IVORY_KEY); if (raw) this.ivoryTower.restore(raw); } catch { /* a tower that cannot read its ledger starts one */ }
  }
  /** One observance of the clockwork. Findings are journaled; a
   *  watch takes an ivory-watch snapshot while the room is still
   *  exactly as the tower found it, and a trip hands the room to
   *  AEGIS, whose containment is the sentence. */
  ivoryObserveNow(trigger = "clock") {
    /* The tripwire is judged first, at every observance: if the
       defenses themselves were handled, the sentence is the
       reboot-and-restore, and this observance is spent on it. */
    if (!this.booting && !this.wireResponding) {
      const verdict = this.wireJudgeNow();
      if (verdict) {
        this.tripwireRespond(verdict);
        return this.ivoryTower.observe(this.ivoryInput(trigger));
      }
    }
    const report = this.ivoryTower.observe(this.ivoryInput(trigger));
    for (const f of report.findings) this.log(`ivory-tower: ${f.detail}.`);
    const watch = report.findings.filter((f) => f.severity === "watch");
    const trip = report.findings.filter((f) => f.severity === "trip");
    if (watch.length && !this.aegis.contained) this.snapshotNow("ivory-watch");
    if (watch.length || trip.length) {
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("blacksite:ivory", { detail: { state: report.state, findings: report.findings } })); } catch { /* headless — the journal still knows */ }
    }
    if (trip.length) this.aegisTrip(`ivory-tower: ${trip[0].detail}`);
    this.ivoryPersist();
    return report;
  }
  /** Re-baseline without judgment — the operator's own restore or
   *  lift rewrote the room by hand. */
  ivoryBaseline(trigger: string) {
    const report = this.ivoryTower.baseline(this.ivoryInput(trigger));
    this.ivoryPersist();
    return report;
  }
  ivoryStatus() { return this.ivoryTower.status(); }
  ivoryVerify() {
    const chain = this.ivoryTower.verifyChain();
    const now = merkleRoot(this.ivoryInput("verify").files);
    const last = this.ivoryTower.status().root;
    return { chainOk: chain.ok, chainAt: chain.at, rootOk: last === null || now === last, rootNow: now, rootLedger: last };
  }

  seed() {
    const dirs = ["/", "/home", "/home/operator", "/home/operator/documents", "/packages", "/captures", "/deliveries", "/tmp"];
    for (const d of dirs) this.files.set(d, { type: "dir", mtime: Date.now() });
    this.rawWrite("/README.md", "# BLACKSITE OS — web edition\n\nThe nightjar Blacksite console, ported to the web.\nType `help` for the full 636-command roster, `limits` for what this\nroom honestly cannot do, and `gauntlet` to watch it test itself.\n\nDoctrine: one knock, read, grade. Public targets only.\n");
    this.rawWrite("/home/operator/notes.txt", "scope: only systems i own or am authorized to test.\nthe bench knocks once, reads, and grades. it does not exploit.\n");
    this.rawWrite("/home/operator/hello.lua", "-- lua in the room (fengari)\nprint('hello from blacksite lua')\nfor i = 1, 3 do print('count', i) end\nlocal t = {bench = 'blacksite'}\nprint(t.bench)\n");
    this.rawWrite("/home/operator/demo.scm", "; scheme in the room — run it: run demo.scm\n(define (square x) (* x x))\n(display (map square (list 3 4 12)))\n(newline)\n(display \"lisp answers in the room\")\n");
    this.rawWrite("/home/operator/notes.sql", "-- sqlite in the room — run it: run notes.sql  (the db persists at room.db)\nCREATE TABLE IF NOT EXISTS notes (body TEXT);\nINSERT INTO notes VALUES ('the room remembers'), ('one knock, read, grade');\nSELECT COUNT(*) AS notes FROM notes;\n");
    this.rawWrite("/home/operator/hello.py", "import math\n\nprint('hello from blacksite python')\nprint('pi is', math.pi)\nbench = {'bench': 'blacksite', 'engine': 'skulpt'}\nprint(bench)\nfor i in range(3):\n    print('count', i)\n");
    this.rawWrite("/home/operator/demo.js", "console.log('hello from blacksite javascript');\nconst xs = [1,2,3,4];\nconsole.log('sum', xs.reduce((a,b)=>a+b,0));\n");
    this.rawWrite("/home/operator/scope.txt", "target: example.com\nauthorization: demonstration target (RFC 2606)\n");
    this.rawWrite("/home/operator/documents/wallet-recovery.txt", "wallet recovery — the 24 words live on paper, in the safe, nowhere else.\nthis file holds only the checksum of that paper: 9f2c-41aa-77d0.\nif you are reading this and you are not me: the room noticed you some time ago.\n");
    this.rawWrite("/home/operator/documents/keys-backup.txt", "keys backup — the encrypted archive (keys.tar.age) is kept off this machine.\nthis note is the whole of what is here: a pointer, not the keys.\n");
  }
  load() {
    /* The tripwire is judged FIRST, over the stored registers
       exactly as the dark left them — before aegisLoad's boot
       snapshot or anything else can persist over the evidence. */
    const wireVerdict = this.wireJudgeBoot();
    try {
      const raw = localStorage.getItem(VFS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Array<[string, VNode]>;
        this.files = new Map(data);
      } else this.seed();
      const macros = localStorage.getItem(MACRO_KEY);
      if (macros) this.macros = new Map(Object.entries(JSON.parse(macros)));
      const settings = localStorage.getItem(SET_KEY);
      // thinice is the house's one theme: any stored theme that is not
      // thinice (every retired theme, by whatever name) reads as thinice.
      if (settings) { const s = JSON.parse(settings); if (s.emcon) this.emcon = s.emcon; this.theme = "thinice"; if (s.wallpaper) this.wallpaper = s.wallpaper; if (Array.isArray(s.tomatoes)) this.tomatoes = s.tomatoes; }
    } catch { if (!this.files.size) this.seed(); }
    if (!this.files.size) this.seed();
    this.aegisLoad();
    if (!this.files.has("/home/operator/documents/wallet-recovery.txt")) {
      try {
        if (!this.isDir("/home/operator/documents")) this.files.set("/home/operator/documents", { type: "dir", mtime: Date.now() });
        this.rawWrite("/home/operator/documents/wallet-recovery.txt", "wallet recovery — the 24 words live on paper, in the safe, nowhere else.\nthis file holds only the checksum of that paper: 9f2c-41aa-77d0.\nif you are reading this and you are not me: the room noticed you some time ago.\n");
        this.rawWrite("/home/operator/documents/keys-backup.txt", "keys backup — the encrypted archive (keys.tar.age) is kept off this machine.\nthis note is the whole of what is here: a pointer, not the keys.\n");
      } catch { /* a room that refuses decoys still has the breaker */ }
    }
    /* The tower wakes last, over the room exactly as it was found,
       and takes the boot observance: drift from the dark between
       sessions is noted for what it is, and a broken ledger chain
       or a canary altered in the dark trips containment before the
       room has done anything else. */
    this.ivoryLoad();
    if (wireVerdict) this.tripwireRespond(wireVerdict);
    else {
      this.ivoryObserveNow("boot");
      /* A room older than the wire adopts it silently: the wire
         strings itself over the whole system as found. A room that
         already carries the wire merely renews its census. */
      if (this.wireGenesis) this.wireAdoptAll();
      else { this.wireAdoptCensus(); this.wirePersist(); }
    }
  }
  saveSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        this.wireGateDepth++;
        localStorage.setItem(VFS_KEY, JSON.stringify([...this.files.entries()]));
        localStorage.setItem(MACRO_KEY, JSON.stringify(Object.fromEntries(this.macros)));
        localStorage.setItem(SET_KEY, JSON.stringify({ emcon: this.emcon, theme: this.theme, wallpaper: this.wallpaper, tomatoes: this.tomatoes }));
        this.ivoryTower.noteStore("vfs"); this.ivoryTower.noteStore("macros"); this.ivoryTower.noteStore("settings");
        this.wireGateDepth--;
        this.wireNote("vfs"); this.wireNote("macros"); this.wireNote("settings");
        this.persistFailed = false;
      } catch {
        this.wireGateDepth--;
        /* storage full/blocked — the room runs volatile, and it SAYS so:
           once in the journal, once as a toast. It never claims a save
           that did not land. */
        if (!this.persistFailed) {
          this.persistFailed = true;
          this.log("persistence refused — storage would not take the room's state (full or blocked). Work from here runs volatile: it will not survive a reload, and the room will not pretend it was saved.");
          try { document.dispatchEvent(new CustomEvent("blacksite:toast", { detail: { text: "the room could not save — storage refused. Work runs volatile and will not survive a reload." } })); } catch { /* headless — the journal still knows */ }
        }
      }
    }, 250);
  }
  reset() { this.wireGateDepth++; localStorage.removeItem(VFS_KEY); localStorage.removeItem(MACRO_KEY); localStorage.removeItem(SET_KEY); localStorage.removeItem(skey("blacksite-session-v1")); localStorage.removeItem(skey("blacksite-relay-v1")); localStorage.removeItem(skey("blacksite-relay-v2")); localStorage.removeItem(AEGIS_KEY); localStorage.removeItem(IVORY_KEY); localStorage.removeItem(WIRE_KEY); this.wire = new TripwireRegister(); this.wireVerdict = null; this.files.clear(); this.macros.clear(); this.tomatoes = []; this.emcon = "open"; this.aegis.contained = false; this.aegis.trips = []; this.aegisSnaps = []; this.mirage.clear(); this.ivoryTower = new IvoryTower(); this.seed(); this.snapshotNow("boot"); this.ivoryBaseline("reset"); this.wireAdoptAll(); this.wireGateDepth--; }
  spawn(cmd: string): Proc {
    const proc: Proc = { pid: this.nextPid++, cmd, state: "running", started: Date.now(), ctrl: new AbortController() };
    this.procs.push(proc);
    if (this.procs.length > 40) this.procs = this.procs.slice(-40);
    return proc;
  }
  /** Run one synchronous VFS adapter call as the room's own hand.
   *  The exemption is exactly this call's span — never the whole
   *  asynchronous operation around it: while git waits on the wire,
   *  ownOps is 0 and every writer in the room, git's next adapter
   *  call included, meets the armed checks (ransom signatures, the
   *  decoy canaries, the entropy watch). Only AEGIS's generic volume
   *  count stands down inside the call — the one heuristic a clone
   *  cannot help tripping, and the documented price of the room's
   *  own git: an adapter mutation is never counted, however many of
   *  them an operation makes. */
  ownSync<T>(fn: () => T): T {
    this.ownOps++;
    try { return fn(); } finally { this.ownOps--; }
  }
  /** Run fn as the room's own hand across an await. Kept for the
   *  callers that genuinely work in one breath; the git engine no
   *  longer wraps its operations in this (see ownSync) — an open
   *  exemption across network waits silenced the cadence and the
   *  entropy watch for the whole room, not just for git. */
  async withOwnOps<T>(fn: () => Promise<T>): Promise<T> {
    this.ownOps++;
    try { return await fn(); } finally { this.ownOps--; }
  }
  /** The EMCON gate. Returns a refusal line, or null when the verb may run. */
  gate(kind: "active" | "ledger"): string | null {
    if (this.emcon === "alpha") { sfx("deny"); return "the Standard forbids this: emcon alpha is total silence — no wire contact at all."; }
    if (this.emcon === "bravo" && kind === "active") { sfx("deny"); return "the Standard forbids this: emcon bravo is receive-only — active probes stand down."; }
    return null;
  }
  gateNote(kind: "active" | "ledger"): string | null {
    if (this.emcon === "charlie") return "emcon charlie: guarded — the knock is permitted and logged in the journal.";
    return null;
  }
}

/* ---------------- shell engine ---------------- */

interface StageParse { argv: string[]; out: { file: string; append: boolean } | null; inFile: string | null; }

/* ——— the stage parser ———
   One pass over one pipeline stage, quote- and escape-aware from
   the first character to the last:
   · single quotes are literal — no $VAR, no substitution, no
     escapes: what you single-quote is exactly what the verb gets;
   · double quotes group, and still expand $VAR and $(...);
   · an unquoted backslash escapes the next character; inside
     double quotes it escapes only $ ` " \ and newline (POSIX), so
     regexes ("\d+") and printf formats ("%s\n") survive intact;
   · $VAR and ${VAR} expand from the room's env, in place;
   · $(...) is matched by BALANCE — nested parentheses and quotes
     inside it are honoured, where the old shallow regex broke on
     the first inner paren — and runs as a sub-line whose captured
     output is spliced back as DATA: word-split when unquoted, as
     a shell splits it, but never re-scanned for operators, quotes
     or further expansions, so a program's output cannot turn into
     the shell's own syntax;
   · an unquoted > >> < is a redirection operator wherever it
     stands (an abutting 1 or 2 is its fd, not an argument);
     quoted, it is just a letter — `printf '%s' "a > b"` writes
     text now, not a file named b". */
async function parseStage(line: string, os: BlacksiteOS, io: ShellIO, depth: number): Promise<StageParse> {
  const argv: string[] = [];
  let out: StageParse["out"] = null;
  let inFile: string | null = null;
  let cur = "";
  let started = false; // the token under construction exists, even empty ("")
  let quote: string | null = null;
  let wantTarget: "out" | "in" | null = null;
  let wantAppend = false;

  const flush = () => {
    if (!started && !cur) return;
    const tok = cur; cur = ""; started = false;
    if (wantTarget === "out") { out = { file: tok, append: wantAppend }; wantTarget = null; }
    else if (wantTarget === "in") { inFile = tok; wantTarget = null; }
    else argv.push(tok);
  };
  /* Splice expansion output into the token stream. Word-split when
     asked (an unquoted substitution): the first word joins the
     token under construction, the last stays open for whatever
     follows it. Never re-scanned — data, not syntax. */
  const absorb = (text: string, split: boolean) => {
    if (!split) { cur += text; started = true; return; }
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) flush();
      else { cur += part; started = true; }
    }
  };
  const runSub = async (inner: string): Promise<string> => {
    if (depth >= 4) return "";
    const capture: string[] = [];
    const capIO: ShellIO = { print: (t) => capture.push(t), clear: () => undefined, openApp: io.openApp, setWallpaper: io.setWallpaper, setTheme: io.setTheme };
    await execLine(os, inner, capIO, depth + 1);
    return capture.join("\n").replace(/\n+$/, "");
  };
  /* The index of the ")" balancing the "(" at `open` — nesting and
     quotes honoured — or -1 when the line runs out first. */
  const matchParen = (open: number): number => {
    let d = 0; let q: string | null = null;
    for (let i = open; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "\\") { i++; continue; }
      if (c === "(") d++;
      else if (c === ")") { d--; if (d === 0) return i; }
    }
    return -1;
  };
  /* Expand the $ at `at` (never called inside single quotes).
     Returns the index just past the expansion. */
  const expandDollar = async (at: number, inQuotes: boolean): Promise<number> => {
    const next = line[at + 1];
    if (next === "(") {
      const end = matchParen(at + 1);
      if (end < 0) { cur += "$"; started = true; return at + 1; } // unbalanced: the dollar is a letter
      const text = await runSub(line.slice(at + 2, end));
      absorb(text, !inQuotes);
      return end + 1;
    }
    if (next === "{") {
      const end = line.indexOf("}", at + 2);
      if (end > 0) { cur += os.env[line.slice(at + 2, end)] ?? ""; started = true; return end + 1; }
      cur += "$"; started = true; return at + 1;
    }
    const m = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(line.slice(at));
    if (m) { cur += os.env[m[1]] ?? ""; started = true; return at + m[0].length; }
    cur += "$"; started = true; return at + 1;
  };

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      i++; continue;
    }
    if (ch === "\\") {
      if (quote === '"') {
        if (i + 1 < line.length && ['"', "\\", "$", "`"].includes(line[i + 1])) { cur += line[i + 1]; i += 2; }
        else { cur += ch; i++; }
      } else if (i + 1 < line.length) { cur += line[i + 1]; started = true; i += 2; }
      else i++;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') { quote = null; i++; continue; }
      if (ch === "$") { i = await expandDollar(i, true); continue; }
      cur += ch; i++; continue;
    }
    // unquoted
    if (ch === "'" || ch === '"') { quote = ch; started = true; i++; continue; }
    if (/\s/.test(ch)) { flush(); i++; continue; }
    if (ch === ">" || ch === "<") {
      // an abutting 1 or 2 is the operator's fd, not an argument
      if (ch === ">" && started && (cur === "1" || cur === "2") && line[i - 1] === cur) { cur = ""; started = false; }
      else flush();
      let append = false;
      if (ch === ">" && line[i + 1] === ">") { append = true; i++; }
      wantTarget = ch === ">" ? "out" : "in";
      wantAppend = append;
      i++; continue;
    }
    if (ch === "$") { i = await expandDollar(i, false); continue; }
    cur += ch; started = true; i++;
  }
  flush();
  if (wantTarget) throw new Error("redirection with no target");
  return { argv, out, inFile };
}
function splitTop(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ""; let quote: string | null = null; let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "\\" && i + 1 < line.length) { cur += ch + line[i + 1]; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && line.startsWith(sep, i)) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export async function execLine(os: BlacksiteOS, rawLine: string, io: ShellIO, depth = 0): Promise<void> {
  const line = rawLine.trim();
  if (!line) return;
  if (depth === 0) { os.history.push(line); os.log(`$ ${line}`); }
  // ; chaining, then && chaining
  for (const segment of splitTop(line, ";")) {
    if (os.stopFlag) { os.stopFlag = false; io.print("— stopped.", "dim"); break; }
    let ok = true;
    for (const part of splitTop(segment, "&&")) {
      if (!ok) break;
      ok = await execPipeline(os, part.trim(), io, depth);
    }
  }
}

async function execPipeline(os: BlacksiteOS, line: string, io: ShellIO, depth: number): Promise<boolean> {
  if (!line) return true;
  let background = false;
  if (/&\s*$/.test(line) && !line.endsWith("&&")) { background = true; line = line.replace(/&\s*$/, "").trim(); }
  const stages = splitTop(line, "|").map((s) => s.trim()).filter(Boolean);
  const proc = os.spawn(line.slice(0, 80));
  const run = async (): Promise<boolean> => {
    let stdin = "";
    let ok = true;
    for (let s = 0; s < stages.length; s++) {
      if (proc.ctrl.signal.aborted) { proc.state = "killed"; return ok; }
      const stage = stages[s];
      /* One parse, whole stage: quotes, expansions, substitutions
         and redirections are all settled by the stage parser (see
         parseStage) — there is no regex pre-pass left to mistake a
         quoted ">" for an operator or a substitution's output for
         the shell's own syntax. The raw stage rides along as the
         verbs' ctx.raw, as it always has. */
      let parsed: StageParse;
      try { parsed = await parseStage(stage, os, io, depth); }
      catch (e: any) { io.print(`blacksite: ${e?.message || e}`, "err"); return false; }
      const cmdline = stage;
      const redirect = parsed.out;
      const inputFile = parsed.inFile;
      if (inputFile) { const content = os.read(inputFile); if (content === null) { io.print(`blacksite: no such file: ${inputFile}`, "err"); return false; } stdin = content; }
      const tokens = parsed.argv;
      if (!tokens.length) continue;
      // NAME=value assignments
      if (tokens.length === 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
        const [k, ...rest] = tokens[0].split("="); os.env[k] = rest.join("="); stdin = ""; continue;
      }
      const [name, ...args] = tokens;
      const def = VERBS.get(name);
      if (!def) {
        const reason = LIMIT_REASONS.get(name);
        if (reason) io.print(`${name}: ${reason}`, "dim");
        else io.print(`blacksite: command not found: ${name} — try \`help\``, "err");
        proc.state = "done"; return false;
      }
      let out = "";
      const collectIO: ShellIO = { ...io, print: (t, cls) => { if (s === stages.length - 1 && !redirect) io.print(t, cls); else out += (out ? "\n" : "") + t; } };
      try {
        const result = await def.run({ args, stdin, os, io: collectIO, raw: cmdline, signal: proc.ctrl.signal });
        // killed while this stage ran: its output dies with it, and no
        // further stage is served — `kill` is a stop, not a label.
        if (proc.ctrl.signal.aborted) { proc.state = "killed"; return false; }
        if (typeof result === "string") out = out ? out + "\n" + result : result;
      } catch (e: any) {
        io.print(`blacksite: ${name}: ${e?.message || e}`, "err");
        ok = false;
      }
      if (os.stopFlag) break;
      if (redirect) {
        const existing = redirect.append ? os.read(redirect.file) ?? "" : "";
        try { os.write(redirect.file, existing + out + (out ? "\n" : "")); } catch (e: any) { io.print(`blacksite: ${e?.message || e}`, "err"); ok = false; }
        out = "";
      }
      if (s === stages.length - 1 && out) io.print(out);
      stdin = out;
    }
    proc.state = proc.state === "running" ? "done" : proc.state;
    return ok;
  };
  if (background) {
    io.print(`[${proc.pid}] running in background`, "dim");
    void run();
    return true;
  }
  return run();
}

export { roster };
