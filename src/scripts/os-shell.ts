// BLACKSITE OS — the web port of nightjar's Blacksite console.
// Kernel, virtual filesystem, shell, and the verb roster. Every verb is
// LIVE (runs here), EDGE (one knock via the site's guarded edge functions),
// or LIMIT (named honestly in `limits` and `help` — the room does not fake
// what a browser cannot do).
import roster from "../data/blacksite-commands.json";
import { identifyFile, hexdump as parseHexdump } from "./os-parse";

export interface ShellIO {
  print(text: string, cls?: string): void;
  clear(): void;
  openApp?(app: string, arg?: string): void;
  setWallpaper?(kind: string): void;
  setTheme?(name: string): void;
}
export interface Proc { pid: number; cmd: string; state: "running" | "done" | "killed"; started: number; }
interface VNode { type: "dir" | "file"; content?: string; binary?: string; mtime: number; }
interface Ctx { args: string[]; stdin: string; os: BlacksiteOS; io: ShellIO; raw: string; }

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

const VFS_KEY = "blacksite-vfs-v1";
const MACRO_KEY = "blacksite-macros-v1";
const SET_KEY = "blacksite-settings-v1";

export class BlacksiteOS {
  files = new Map<string, VNode>();
  cwd = "/home/operator";
  env: Record<string, string> = { USER: "operator", HOSTNAME: "blacksite-web", HOME: "/home/operator", SHELL: "/bin/blacksite", TERM: "blacksite-256color" };
  history: string[] = [];
  procs: Proc[] = [];
  nextPid = 100;
  emcon: "open" | "charlie" | "bravo" | "alpha" = "open";
  theme = "violent-redteam";
  journal: Array<{ at: string; text: string }> = [];
  tomatoes: string[] = [];
  bootedAt = Date.now();
  stopFlag = false;
  macros = new Map<string, string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() { this.load(); }
  log(text: string) { this.journal.push({ at: new Date().toISOString(), text }); if (this.journal.length > 300) this.journal.shift(); }
  norm(path: string, base = this.cwd): string {
    const raw = path.startsWith("/") ? path : `${base}/${path}`;
    const parts: string[] = [];
    for (const seg of raw.split("/")) { if (!seg || seg === ".") continue; if (seg === "..") parts.pop(); else parts.push(seg); }
    return "/" + parts.join("/");
  }
  node(path: string): VNode | undefined { return this.files.get(this.norm(path)); }
  isDir(path: string): boolean { return this.node(path)?.type === "dir"; }
  list(path: string): string[] {
    const dir = this.norm(path);
    const prefix = dir === "/" ? "/" : dir + "/";
    const out = new Set<string>();
    for (const key of this.files.keys()) {
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
  write(path: string, content: string) {
    const p = this.norm(path);
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    this.files.set(p, { type: "file", content, mtime: Date.now() });
    this.saveSoon();
  }
  writeBytes(path: string, bytes: Uint8Array) {
    const p = this.norm(path);
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    this.files.set(p, { type: "file", binary: bToB64(bytes), mtime: Date.now() });
    this.saveSoon();
  }
  mkdir(path: string) {
    const p = this.norm(path);
    const parent = p.slice(0, p.lastIndexOf("/")) || "/";
    if (!this.isDir(parent)) throw new Error(`no such directory: ${parent}`);
    if (this.files.has(p)) throw new Error(`already exists: ${p}`);
    this.files.set(p, { type: "dir", mtime: Date.now() });
    this.saveSoon();
  }
  remove(path: string, recursive = false) {
    const p = this.norm(path);
    const n = this.files.get(p);
    if (!n) throw new Error(`no such file: ${p}`);
    if (n.type === "dir") {
      const children = [...this.files.keys()].filter((k) => k.startsWith(p + "/"));
      if (children.length && !recursive) throw new Error(`directory not empty: ${p} (rm -r to take the tree)`);
      children.forEach((k) => this.files.delete(k));
    }
    this.files.delete(p);
    this.saveSoon();
  }
  seed() {
    const dirs = ["/", "/home", "/home/operator", "/packages", "/captures", "/deliveries", "/tmp"];
    for (const d of dirs) this.files.set(d, { type: "dir", mtime: Date.now() });
    this.write("/README.md", "# BLACKSITE OS — web edition\n\nThe nightjar Blacksite console, ported to the web.\nType `help` for the full 427-command roster, `limits` for what this\nroom honestly cannot do, and `gauntlet` to watch it test itself.\n\nDoctrine: one knock, read, grade. Public targets only.\n");
    this.write("/home/operator/notes.txt", "scope: only systems i own or am authorized to test.\nthe bench knocks once, reads, and grades. it does not exploit.\n");
    this.write("/home/operator/hello.lua", "-- lua in the room (fengari)\nprint('hello from blacksite lua')\nfor i = 1, 3 do print('count', i) end\nlocal t = {bench = 'blacksite'}\nprint(t.bench)\n");
    this.write("/home/operator/demo.scm", "; scheme in the room — run it: run demo.scm\n(define (square x) (* x x))\n(display (map square (list 3 4 12)))\n(newline)\n(display \"lisp answers in the room\")\n");
    this.write("/home/operator/notes.sql", "-- sqlite in the room — run it: run notes.sql  (the db persists at room.db)\nCREATE TABLE IF NOT EXISTS notes (body TEXT);\nINSERT INTO notes VALUES ('the room remembers'), ('one knock, read, grade');\nSELECT COUNT(*) AS notes FROM notes;\n");
    this.write("/home/operator/hello.py", "import math\n\nprint('hello from blacksite python')\nprint('pi is', math.pi)\nbench = {'bench': 'blacksite', 'engine': 'skulpt'}\nprint(bench)\nfor i in range(3):\n    print('count', i)\n");
    this.write("/home/operator/demo.js", "console.log('hello from blacksite javascript');\nconst xs = [1,2,3,4];\nconsole.log('sum', xs.reduce((a,b)=>a+b,0));\n");
    this.write("/home/operator/scope.txt", "target: example.com\nauthorization: demonstration target (RFC 2606)\n");
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
      if (settings) { const s = JSON.parse(settings); if (s.emcon) this.emcon = s.emcon; if (s.theme) this.theme = s.theme; if (Array.isArray(s.tomatoes)) this.tomatoes = s.tomatoes; }
    } catch { if (!this.files.size) this.seed(); }
    if (!this.files.size) this.seed();
  }
  saveSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(VFS_KEY, JSON.stringify([...this.files.entries()]));
        localStorage.setItem(MACRO_KEY, JSON.stringify(Object.fromEntries(this.macros)));
        localStorage.setItem(SET_KEY, JSON.stringify({ emcon: this.emcon, theme: this.theme, tomatoes: this.tomatoes }));
      } catch { /* storage full/blocked — the room runs volatile and says so in limits */ }
    }, 250);
  }
  reset() { localStorage.removeItem(VFS_KEY); localStorage.removeItem(MACRO_KEY); localStorage.removeItem(SET_KEY); this.files.clear(); this.macros.clear(); this.tomatoes = []; this.emcon = "open"; this.seed(); }
  spawn(cmd: string): Proc {
    const proc: Proc = { pid: this.nextPid++, cmd, state: "running", started: Date.now() };
    this.procs.push(proc);
    if (this.procs.length > 40) this.procs = this.procs.slice(-40);
    return proc;
  }
  /** The EMCON gate. Returns a refusal line, or null when the verb may run. */
  gate(kind: "active" | "ledger"): string | null {
    if (this.emcon === "alpha") return "the Standard forbids this: emcon alpha is total silence — no wire contact at all.";
    if (this.emcon === "bravo" && kind === "active") return "the Standard forbids this: emcon bravo is receive-only — active probes stand down.";
    return null;
  }
  gateNote(kind: "active" | "ledger"): string | null {
    if (this.emcon === "charlie") return "emcon charlie: guarded — the knock is permitted and logged in the journal.";
    return null;
  }
}

/* ---------------- shell engine ---------------- */

function tokenize(line: string, os: BlacksiteOS): string[] {
  const tokens: string[] = [];
  let cur = ""; let quote: string | null = null; let started = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      // POSIX: inside double quotes a backslash escapes only $ ` " \ and
      // newline — every other sequence keeps its backslash, so regexes
      // ("\d+") and printf formats ("%s\n") survive tokenizing intact.
      else if (ch === "\\" && quote === '"' && i + 1 < line.length && ['"', "\\", "$", "`"].includes(line[i + 1])) { cur += line[++i]; }
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (ch === "\\" && i + 1 < line.length) { cur += line[++i]; started = true; continue; }
    if (/\s/.test(ch)) { if (started || cur) { tokens.push(cur); cur = ""; started = false; } continue; }
    cur += ch; started = true;
  }
  if (started || cur) tokens.push(cur);
  // $VAR expansion (not inside single quotes — simplified: expand everywhere post-tokenize)
  return tokens.map((t) => t.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => os.env[name] ?? ""));
}
function splitTop(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ""; let quote: string | null = null; let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
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
  // command substitution $(...)
  const sub = line.match(/\$\(([^()]*(?:\([^()]*\))?[^()]*)\)/);
  if (sub && depth < 4) {
    const capture: string[] = [];
    const capIO: ShellIO = { print: (t) => capture.push(t), clear: () => undefined, openApp: io.openApp, setWallpaper: io.setWallpaper, setTheme: io.setTheme };
    await execLine(os, sub[1], capIO, depth + 1);
    line = line.replace(sub[0], capture.join("\n").trim().split("\n")[0] || "");
  }
  let background = false;
  if (/&\s*$/.test(line) && !line.endsWith("&&")) { background = true; line = line.replace(/&\s*$/, "").trim(); }
  const stages = splitTop(line, "|").map((s) => s.trim()).filter(Boolean);
  const proc = os.spawn(line.slice(0, 80));
  const run = async (): Promise<boolean> => {
    let stdin = "";
    let ok = true;
    for (let s = 0; s < stages.length; s++) {
      const stage = stages[s];
      // redirects
      let redirect: { file: string; append: boolean } | null = null;
      let inputFile: string | null = null;
      let cmdline = stage;
      const redir = cmdline.match(/(>>?)\s*([^\s]+)\s*$/);
      if (redir && s === stages.length - 1) { redirect = { file: redir[2], append: redir[1] === ">>" }; cmdline = cmdline.replace(redir[0], "").trim(); }
      const inredir = cmdline.match(/<\s*([^\s]+)/);
      if (inredir) { inputFile = inredir[1]; cmdline = cmdline.replace(inredir[0], "").trim(); }
      if (inputFile) { const content = os.read(inputFile); if (content === null) { io.print(`blacksite: no such file: ${inputFile}`, "err"); return false; } stdin = content; }
      const tokens = tokenize(cmdline, os);
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
        const result = await def.run({ args, stdin, os, io: collectIO, raw: cmdline });
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
