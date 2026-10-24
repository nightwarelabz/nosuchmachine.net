// BLACKSITE OS — the second engine room: six more engines that genuinely
// run in the tab. Scheme and Brainfuck are hand-built interpreters in
// this file; CHIP-8 is a full CPU; the WebAssembly room instantiates real
// modules from the VFS; Lua is Fengari (vendored, public/vendor/fengari);
// SQL is SQLite itself compiled to wasm (sql.js, public/vendor/sql.js).
// Everything loads on demand and reports its own failures plainly.

export type IO = { out: (s: string) => void };

function loadScriptOnce(url: string, globalName: string): Promise<any> {
  const w = window as any;
  if (w[globalName]) return Promise.resolve(w[globalName]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => (window as any)[globalName] ? resolve((window as any)[globalName]) : reject(new Error(`${globalName} did not appear`));
    s.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(s);
  });
}

/* ————————————————— Scheme —————————————————
   A real little Lisp: reader, environments, closures, the core special
   forms, and a working library. Deterministic and synchronous; the step
   budget keeps a runaway recursion from eating the tab. */
type SVal = any;
class Env {
  vars = new Map<string, SVal>();
  constructor(public parent: Env | null) {}
  lookup(name: string): SVal {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.lookup(name);
    throw new Error(`scheme: unbound variable ${name}`);
  }
  define(name: string, v: SVal) { this.vars.set(name, v); }
  set(name: string, v: SVal): void {
    if (this.vars.has(name)) { this.vars.set(name, v); return; }
    if (this.parent) { this.parent.set(name, v); return; }
    throw new Error(`scheme: set! on unbound ${name}`);
  }
}
const SYM = Symbol.for("scheme-symbol");
const sym = (name: string) => ({ [SYM]: name });
const isSym = (v: SVal) => !!v && typeof v === "object" && SYM in v;
const symName = (v: SVal) => v[SYM] as string;

function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ";") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (/\s|,/.test(c)) { i++; continue; }
    if ("()'".includes(c)) { out.push(c); i++; continue; }
    if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') { if (src[j] === "\\") j++; j++; } out.push(src.slice(i, j + 1)); i = j + 1; continue; }
    let j = i; while (j < src.length && !/[\s()';]/.test(src[j])) j++;
    out.push(src.slice(i, j)); i = j;
  }
  return out;
}
function readForm(toks: string[], pos: { i: number }): SVal {
  const t = toks[pos.i++];
  if (t === "(") { const list: SVal[] = []; while (toks[pos.i] !== ")") { if (pos.i >= toks.length) throw new Error("scheme: unclosed ("); list.push(readForm(toks, pos)); } pos.i++; return list; }
  if (t === "'") return [sym("quote"), readForm(toks, pos)];
  if (t.startsWith('"')) return t.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (t === "#t") return true;
  if (t === "#f") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return sym(t);
}
export function showScheme(v: SVal): string {
  if (v === undefined) return "";
  if (v === true) return "#t";
  if (v === false) return "#f";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (isSym(v)) return symName(v);
  if (Array.isArray(v)) return `(${v.map(showScheme).join(" ")})`;
  if (v && v.__closure) return "#<procedure>";
  if (v && v.__builtin) return "#<builtin>";
  return String(v);
}
export function runScheme(source: string, io: IO): string {
  let steps = 0;
  const global = new Env(null);
  const B = (name: string, fn: (...a: SVal[]) => SVal) => global.define(name, { __builtin: fn });
  const num = (v: SVal) => { if (typeof v !== "number") throw new Error(`scheme: expected a number, got ${showScheme(v)}`); return v; };
  B("+", (...a) => a.reduce((x, y) => x + num(y), 0));
  B("-", (...a) => a.length === 1 ? -num(a[0]) : a.reduce((x, y) => x - num(y)));
  B("*", (...a) => a.reduce((x, y) => x * num(y), 1));
  B("/", (...a) => a.reduce((x, y) => x / num(y)));
  B("modulo", (a, b) => num(a) % num(b));
  B("quotient", (a, b) => Math.trunc(num(a) / num(b)));
  B("=", (a, b) => num(a) === num(b));
  B("<", (a, b) => num(a) < num(b));
  B(">", (a, b) => num(a) > num(b));
  B("<=", (a, b) => num(a) <= num(b));
  B(">=", (a, b) => num(a) >= num(b));
  B("abs", (a) => Math.abs(num(a)));
  B("min", (...a) => Math.min(...a.map(num)));
  B("max", (...a) => Math.max(...a.map(num)));
  B("floor", (a) => Math.floor(num(a)));
  B("sqrt", (a) => Math.sqrt(num(a)));
  B("expt", (a, b) => Math.pow(num(a), num(b)));
  B("not", (a) => a === false);
  B("eq?", (a, b) => a === b || (isSym(a) && isSym(b) && symName(a) === symName(b)));
  B("equal?", (a, b) => showScheme(a) === showScheme(b));
  B("null?", (a) => Array.isArray(a) && a.length === 0);
  B("pair?", (a) => Array.isArray(a) && a.length > 0);
  B("number?", (a) => typeof a === "number");
  B("string?", (a) => typeof a === "string");
  B("symbol?", (a) => isSym(a));
  B("cons", (a, b) => Array.isArray(b) ? [a, ...b] : [a, b]);
  B("car", (a) => { if (!Array.isArray(a) || !a.length) throw new Error("scheme: car of empty"); return a[0]; });
  B("cdr", (a) => { if (!Array.isArray(a)) throw new Error("scheme: cdr of non-pair"); return a.slice(1); });
  B("list", (...a) => a);
  B("length", (a) => (Array.isArray(a) || typeof a === "string") ? a.length : 0);
  B("append", (...a) => a.flatMap((x) => Array.isArray(x) ? x : [x]));
  B("reverse", (a) => [...a].reverse());
  B("string-append", (...a) => a.map((x) => typeof x === "string" ? x : showScheme(x)).join(""));
  B("number->string", (a) => String(num(a)));
  B("string->number", (a) => Number(a));
  B("display", (a) => { io.out(typeof a === "string" ? a : showScheme(a)); return undefined; });
  B("newline", () => { io.out("\n"); return undefined; });

  function ev(x: SVal, env: Env): SVal {
    if (++steps > 2_000_000) throw new Error("scheme: step budget spent (2,000,000) — the room stopped the program");
    if (isSym(x)) return env.lookup(symName(x));
    if (!Array.isArray(x)) return x;
    if (!x.length) return x;
    const head = isSym(x[0]) ? symName(x[0]) : null;
    switch (head) {
      case "quote": return x[1];
      case "if": return ev(x[1], env) !== false ? ev(x[2], env) : (x.length > 3 ? ev(x[3], env) : undefined);
      case "define": {
        if (Array.isArray(x[1])) { const [name, ...params] = x[1].map(symName); env.define(name, { __closure: { params, body: x.slice(2), env } }); return undefined; }
        env.define(symName(x[1]), ev(x[2], env)); return undefined;
      }
      case "set!": env.set(symName(x[1]), ev(x[2], env)); return undefined;
      case "lambda": return { __closure: { params: x[1].map(symName), body: x.slice(2), env } };
      case "let": case "let*": {
        const local = new Env(env);
        for (const [n, e] of x[1]) local.define(symName(n), ev(e, head === "let*" ? local : env));
        let r: SVal; for (const form of x.slice(2)) r = ev(form, local); return r;
      }
      case "begin": { let r: SVal; for (const form of x.slice(1)) r = ev(form, env); return r; }
      case "cond": {
        for (const clause of x.slice(1)) {
          if (isSym(clause[0]) && symName(clause[0]) === "else") { let r: SVal; for (const f of clause.slice(1)) r = ev(f, env); return r; }
          if (ev(clause[0], env) !== false) { let r: SVal = ev(clause[0], env); for (const f of clause.slice(1)) r = ev(f, env); return clause.length > 1 ? r : ev(clause[0], env); }
        }
        return undefined;
      }
      case "and": { let r: SVal = true; for (const f of x.slice(1)) { r = ev(f, env); if (r === false) return false; } return r; }
      case "or": { for (const f of x.slice(1)) { const r = ev(f, env); if (r !== false) return r; } return false; }
      case "when": if (ev(x[1], env) !== false) { let r: SVal; for (const f of x.slice(2)) r = ev(f, env); return r; } return undefined;
    }
    const proc = ev(x[0], env);
    const args = x.slice(1).map((a) => ev(a, env));
    return apply(proc, args);
  }
  function apply(proc: SVal, args: SVal[]): SVal {
    if (typeof proc === "function") return proc(...args);
    if (proc?.__builtin) return proc.__builtin(...args);
    if (proc?.__closure) {
      const { params, body, env } = proc.__closure;
      const local = new Env(env);
      params.forEach((p: string, i: number) => local.define(p, args[i]));
      let r: SVal; for (const form of body) r = ev(form, local); return r;
    }
    throw new Error(`scheme: ${showScheme(proc)} is not a procedure`);
  }
  B("map", (f: SVal, l: SVal) => (l as SVal[]).map((v) => apply(f, [v])));
  B("filter", (f: SVal, l: SVal) => (l as SVal[]).filter((v) => apply(f, [v]) !== false));
  B("foldl", (f: SVal, init: SVal, l: SVal) => (l as SVal[]).reduce((acc, v) => apply(f, [acc, v]), init));
  B("apply", (f: SVal, l: SVal) => apply(f, l as SVal[]));

  const toks = tokenize(source);
  const pos = { i: 0 };
  let last: SVal;
  let shown = false;
  while (pos.i < toks.length) { last = ev(readForm(toks, pos), global); }
  if (last !== undefined) { io.out(showScheme(last)); shown = true; }
  return shown ? "" : "";
}

/* ————————————————— Brainfuck ————————————————— */
export function runBrainfuck(source: string, input: string, io: IO): void {
  const code = [...source].filter((c) => "><+-.,[]".includes(c));
  const jump = new Map<number, number>();
  const stack: number[] = [];
  code.forEach((c, i) => { if (c === "[") stack.push(i); if (c === "]") { const j = stack.pop()!; jump.set(i, j); jump.set(j, i); } });
  if (stack.length) throw new Error("bf: unmatched [");
  const tape = new Uint8Array(30000);
  let ptr = 0, ip = 0, inPos = 0, steps = 0;
  while (ip < code.length) {
    if (++steps > 20_000_000) throw new Error("bf: step budget spent (20,000,000)");
    const c = code[ip];
    if (c === ">") ptr++;
    else if (c === "<") ptr = Math.max(0, ptr - 1);
    else if (c === "+") tape[ptr] = (tape[ptr] + 1) & 0xff;
    else if (c === "-") tape[ptr] = (tape[ptr] - 1) & 0xff;
    else if (c === ".") io.out(String.fromCharCode(tape[ptr]));
    else if (c === ",") tape[ptr] = inPos < input.length ? input.charCodeAt(inPos++) & 0xff : 0;
    else if (c === "[") { if (!tape[ptr]) ip = jump.get(ip)!; }
    else if (c === "]") { if (tape[ptr]) ip = jump.get(ip)!; }
    ip++;
  }
}

/* ————————————————— CHIP-8 ————————————————— */
const FONT = [0xf0, 0x90, 0x90, 0x90, 0xf0, 0x20, 0x60, 0x20, 0x20, 0x70, 0xf0, 0x10, 0xf0, 0x80, 0xf0, 0xf0, 0x10, 0xf0, 0x10, 0xf0, 0x90, 0x90, 0xf0, 0x10, 0x10, 0xf0, 0x80, 0xf0, 0x10, 0xf0, 0xf0, 0x80, 0xf0, 0x90, 0xf0, 0xf0, 0x10, 0x20, 0x40, 0x40, 0xf0, 0x90, 0xf0, 0x90, 0xf0, 0xf0, 0x90, 0xf0, 0x10, 0xf0, 0xf0, 0x90, 0xf0, 0x90, 0x90, 0xe0, 0x90, 0xe0, 0x90, 0xe0, 0xf0, 0x80, 0x80, 0x80, 0xf0, 0xe0, 0x90, 0x90, 0x90, 0xe0, 0xf0, 0x80, 0xf0, 0x80, 0xf0, 0xf0, 0x80, 0xf0, 0x80, 0x80];
export class Chip8 {
  mem = new Uint8Array(4096);
  V = new Uint8Array(16);
  I = 0; pc = 0x200; stack: number[] = [];
  gfx = new Uint8Array(64 * 32);
  keys = new Uint8Array(16);
  delay = 0; sound = 0; drawFlag = false;
  constructor() { this.mem.set(FONT, 0); }
  load(bytes: Uint8Array) { this.mem.set(bytes.slice(0, 3584), 0x200); this.pc = 0x200; }
  cycle() {
    const op = (this.mem[this.pc] << 8) | this.mem[this.pc + 1];
    const x = (op >> 8) & 0xf, y = (op >> 4) & 0xf, n = op & 0xf, nn = op & 0xff, nnn = op & 0xfff;
    this.pc += 2;
    switch (op & 0xf000) {
      case 0x0000:
        if (op === 0x00e0) { this.gfx.fill(0); this.drawFlag = true; }
        else if (op === 0x00ee) this.pc = this.stack.pop() ?? 0x200;
        break;
      case 0x1000: this.pc = nnn; break;
      case 0x2000: this.stack.push(this.pc); this.pc = nnn; break;
      case 0x3000: if (this.V[x] === nn) this.pc += 2; break;
      case 0x4000: if (this.V[x] !== nn) this.pc += 2; break;
      case 0x5000: if (this.V[x] === this.V[y]) this.pc += 2; break;
      case 0x6000: this.V[x] = nn; break;
      case 0x7000: this.V[x] = (this.V[x] + nn) & 0xff; break;
      case 0x8000:
        switch (n) {
          case 0x0: this.V[x] = this.V[y]; break;
          case 0x1: this.V[x] |= this.V[y]; break;
          case 0x2: this.V[x] &= this.V[y]; break;
          case 0x3: this.V[x] ^= this.V[y]; break;
          case 0x4: { const s = this.V[x] + this.V[y]; this.V[0xf] = s > 255 ? 1 : 0; this.V[x] = s & 0xff; break; }
          case 0x5: this.V[0xf] = this.V[x] >= this.V[y] ? 1 : 0; this.V[x] = (this.V[x] - this.V[y]) & 0xff; break;
          case 0x6: this.V[0xf] = this.V[x] & 1; this.V[x] >>= 1; break;
          case 0x7: this.V[0xf] = this.V[y] >= this.V[x] ? 1 : 0; this.V[x] = (this.V[y] - this.V[x]) & 0xff; break;
          case 0xe: this.V[0xf] = (this.V[x] >> 7) & 1; this.V[x] = (this.V[x] << 1) & 0xff; break;
        }
        break;
      case 0x9000: if (this.V[x] !== this.V[y]) this.pc += 2; break;
      case 0xa000: this.I = nnn; break;
      case 0xb000: this.pc = nnn + this.V[0]; break;
      case 0xc000: this.V[x] = (Math.random() * 256) & nn; break;
      case 0xd000: {
        this.V[0xf] = 0;
        for (let row = 0; row < n; row++) {
          const bits = this.mem[this.I + row];
          for (let col = 0; col < 8; col++) {
            if (bits & (0x80 >> col)) {
              const idx = ((this.V[y] + row) % 32) * 64 + ((this.V[x] + col) % 64);
              if (this.gfx[idx]) this.V[0xf] = 1;
              this.gfx[idx] ^= 1;
            }
          }
        }
        this.drawFlag = true;
        break;
      }
      case 0xe000:
        if (nn === 0x9e) { if (this.keys[this.V[x] & 0xf]) this.pc += 2; }
        else if (nn === 0xa1) { if (!this.keys[this.V[x] & 0xf]) this.pc += 2; }
        break;
      case 0xf000:
        switch (nn) {
          case 0x07: this.V[x] = this.delay; break;
          case 0x0a: { const k = this.keys.findIndex((v) => v === 1); if (k < 0) this.pc -= 2; else this.V[x] = k; break; }
          case 0x15: this.delay = this.V[x]; break;
          case 0x18: this.sound = this.V[x]; break;
          case 0x1e: this.I = (this.I + this.V[x]) & 0xfff; break;
          case 0x29: this.I = this.V[x] * 5; break;
          case 0x33: this.mem[this.I] = Math.floor(this.V[x] / 100); this.mem[this.I + 1] = Math.floor((this.V[x] / 10) % 10); this.mem[this.I + 2] = this.V[x] % 10; break;
          case 0x55: for (let i = 0; i <= x; i++) this.mem[this.I + i] = this.V[i]; break;
          case 0x65: for (let i = 0; i <= x; i++) this.V[i] = this.mem[this.I + i]; break;
        }
        break;
    }
  }
  tickTimers() { if (this.delay > 0) this.delay--; if (this.sound > 0) this.sound--; }
}
/** A tiny built-in demo ROM: draws the room's mark and waits. Hand-assembled. */
export const CHIP8_DEMO = new Uint8Array([
  0x60, 0x0a, 0x61, 0x0a, 0xf0, 0x29, 0xd0, 0x15, // V0=10 V1=10 I=font(0)=digit sprite of V0(A), draw
  0x60, 0x0f, 0xf0, 0x29, 0xd0, 0x15,             // draw F beside it
  0x60, 0x05, 0xf0, 0x29, 0x62, 0x18, 0x63, 0x0a, 0xd2, 0x35, // draw 5 lower
  0x12, 0x14,                                     // loop forever at 0x214
]);

/* ————————————————— WebAssembly room ————————————————— */
export async function wasmExports(bytes: Uint8Array): Promise<Array<{ name: string; kind: string }>> {
  const mod = await WebAssembly.compile(bytes as BufferSource);
  return WebAssembly.Module.exports(mod).map((e) => ({ name: e.name, kind: e.kind }));
}
export async function runWasm(bytes: Uint8Array, fnName: string, args: number[], io: IO): Promise<string> {
  let memory: WebAssembly.Memory | null = null;
  const writeOut = (mem: WebAssembly.Memory, ptr: number, len: number) => io.out(new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len)));
  const wasi = {
    fd_write: (_fd: number, iovs: number, count: number, nwritten: number) => {
      if (!memory) return 0;
      const view = new DataView(memory.buffer);
      let total = 0;
      for (let i = 0; i < count; i++) { const ptr = view.getUint32(iovs + i * 8, true); const len = view.getUint32(iovs + i * 8 + 4, true); writeOut(memory, ptr, len); total += len; }
      view.setUint32(nwritten, total, true);
      return 0;
    },
    fd_close: () => 0, fd_seek: () => 0, proc_exit: (code: number) => { throw new Error(`wasm: proc_exit(${code})`); },
    clock_time_get: () => 0, random_get: (ptr: number, len: number) => { if (memory) crypto.getRandomValues(new Uint8Array(memory.buffer, ptr, len)); return 0; },
    environ_sizes_get: () => 0, environ_get: () => 0, args_sizes_get: () => 0, args_get: () => 0,
  };
  const stub = () => 0;
  const env = new Proxy({}, { get: (_t, prop) => prop === "memory" ? undefined : stub });
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, { env, wasi_snapshot_preview1: wasi, wasi_unstable: wasi } as WebAssembly.Imports);
  memory = (instance.exports.memory as WebAssembly.Memory) || null;
  const names = Object.keys(instance.exports);
  const fn = instance.exports[fnName];
  if (typeof fn !== "function") throw new Error(`wasm: no exported function named ${fnName} — exports: ${names.join(", ")}`);
  const result = (fn as (...a: number[]) => unknown)(...args);
  return result === undefined ? "" : String(result);
}

/* ————————————————— Lua (Fengari) ————————————————— */
let luaPromise: Promise<any> | null = null;
function loadLua(): Promise<any> {
  if (!luaPromise) luaPromise = loadScriptOnce("/vendor/fengari/fengari-web.js", "fengari");
  return luaPromise;
}
export async function runLua(source: string, io: IO): Promise<void> {
  const fengari = await loadLua();
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushjsfunction(L, (state: any) => {
    const parts: string[] = [];
    const n = lua.lua_gettop(state);
    for (let i = 1; i <= n; i++) { const v = lua.lua_tojsstring(state, i); parts.push(v === null || v === undefined ? "nil" : String(v)); }
    io.out(parts.join("\t"));
    return 0;
  });
  lua.lua_setglobal(L, to_luastring("print"));
  const code = to_luastring(source);
  const status = lauxlib.luaL_dostring(L, code);
  if (status !== 0) {
    const msg = to_jsstring(lua.lua_tostring(L, -1)) || "unknown lua error";
    throw new Error(`lua: ${msg}`);
  }
}

/* ————————————————— SQL (SQLite via sql.js) ————————————————— */
let sqlPromise: Promise<any> | null = null;
function loadSql(): Promise<any> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const init = await loadScriptOnce("/vendor/sql.js/sql-wasm.js", "initSqlJs");
      return init({ locateFile: (f: string) => `/vendor/sql.js/${f}` });
    })();
  }
  return sqlPromise;
}
export async function runSql(dbBytes: Uint8Array | null, statements: string): Promise<{ text: string; dbBytes: Uint8Array }> {
  const SQL = await loadSql();
  const db = new SQL.Database(dbBytes ? dbBytes : undefined);
  const out: string[] = [];
  try {
    const results = db.exec(statements);
    for (const r of results) {
      out.push(r.columns.join(" | "));
      out.push(r.columns.map(() => "---").join("-+-"));
      for (const row of r.values) out.push(row.map((v: any) => v === null ? "NULL" : String(v)).join(" | "));
      out.push(`(${r.values.length} row${r.values.length === 1 ? "" : "s"})`);
    }
    const counts = db.getRowsModified?.() ?? 0;
    if (!results.length) out.push(counts ? `ok — ${counts} row(s) changed` : "ok");
  } finally {
    const bytes = db.export() as Uint8Array;
    db.close();
    return { text: out.join("\n"), dbBytes: bytes };
  }
}
