// BLACKSITE OS — the web port of nightjar's Blacksite console.
// Kernel, virtual filesystem, shell, and the verb roster. Every verb is
// LIVE (runs here), EDGE (one knock via the site's guarded edge functions),
// or LIMIT (named honestly in `limits` and `help` — the room does not fake
// what a browser cannot do).
import roster from "../data/blacksite-commands.json";
import { identifyFile, hexdump as parseHexdump } from "./os-parse";
import { sfx } from "./os-sound";
import { skey } from "./os-depth";

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
  wallpaper = "mare";
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
  private booting = true;

  constructor() { this.load(); this.booting = false; }
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
    this.saveSoon();
  }
  mkdir(path: string) {
    const p = this.norm(path);
    if (!this.booting && this.aegis.contained) { this.mirage.set(p, { type: "dir", mtime: Date.now() }); return; }
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    if (this.files.has(p)) throw new Error(`already exists: ${p}`);
    this.files.set(p, { type: "dir", mtime: Date.now() });
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
  private aegisPersist() {
    const body = () => JSON.stringify({ contained: this.aegis.contained, trips: this.aegis.trips, snaps: this.aegisSnaps });
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
    return true;
  }
  aegisLift(adopt: boolean): number {
    const held = this.mirage.size;
    if (adopt) for (const [k, v] of this.mirage) { if (v === null) this.files.delete(k); else this.files.set(k, v); }
    this.mirage.clear(); this.aegis.contained = false; this.hotFiles.clear(); this.opLog = [];
    this.log(`aegis: containment lifted by the operator — the mirage's ${held} ${held === 1 ? "entry" : "entries"} ${adopt ? "adopted into the real room" : "discarded, unmourned"}.`);
    this.aegisPersist(); this.saveSoon();
    return held;
  }
  aegisStatus() {
    const rec = this.recoverySnap();
    return { contained: this.aegis.contained, snaps: this.aegisSnaps.map((x) => ({ at: x.at, why: x.why })), trips: [...this.aegis.trips], mirage: this.mirage.size, recovery: !!rec, recoveryAt: rec ? rec.at : null, recoveryWhy: rec ? rec.why : null };
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
  }
  saveSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(VFS_KEY, JSON.stringify([...this.files.entries()]));
        localStorage.setItem(MACRO_KEY, JSON.stringify(Object.fromEntries(this.macros)));
        localStorage.setItem(SET_KEY, JSON.stringify({ emcon: this.emcon, theme: this.theme, wallpaper: this.wallpaper, tomatoes: this.tomatoes }));
        this.persistFailed = false;
      } catch {
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
  reset() { localStorage.removeItem(VFS_KEY); localStorage.removeItem(MACRO_KEY); localStorage.removeItem(SET_KEY); localStorage.removeItem(skey("blacksite-session-v1")); localStorage.removeItem(skey("blacksite-relay-v1")); localStorage.removeItem(skey("blacksite-relay-v2")); localStorage.removeItem(AEGIS_KEY); this.files.clear(); this.macros.clear(); this.tomatoes = []; this.emcon = "open"; this.aegis.contained = false; this.aegis.trips = []; this.aegisSnaps = []; this.mirage.clear(); this.seed(); this.snapshotNow("boot"); }
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
