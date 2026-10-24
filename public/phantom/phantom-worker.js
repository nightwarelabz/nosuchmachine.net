/* phantom · the WASI host for phase1, in a worker.
 *
 * phase1 v7 (Bryforge/phase1) compiled to wasm32-wasip1 expects a
 * WASI preview1 world: args, env, clocks, random, stdio, and a
 * filesystem. This worker provides exactly that world and nothing
 * more — the filesystem is a memory map that dies with the window
 * (phase1's own boot card says "state ram/volatile"), stdin arrives
 * through a SharedArrayBuffer ring the window writes lines into, and
 * stdout streams back as bytes for the window to render. No network
 * imports exist here at all: sockets answer NOTSUP, by construction.
 */
"use strict";

const ERR = { SUCCESS: 0, ACCES: 2, AGAIN: 4, BADF: 8, EXIST: 20, INVAL: 28, IO: 29, ISDIR: 31, NAMETOOLONG: 37, NOENT: 44, NOTDIR: 54, NOTEMPTY: 55, NOTSUP: 58, PERM: 63 };
const FT = { UNKNOWN: 0, CHAR: 2, DIR: 3, REGULAR: 4 };
const OF = { CREAT: 1, DIR: 2, EXCL: 4, TRUNC: 8 };

let MEM = null; // DataView over the instance memory, refreshed per call
const mem = () => { if (!MEM || MEM.buffer.byteLength === 0) MEM = new DataView(exports.memory.buffer); return MEM; };
let exports = null;

/* ---------------- stdin ring (SharedArrayBuffer) ----------------
   header Int32: [0] write seq · [1] read seq · [2] closed · [3] pad
   ring: 64 KiB at byte 64. The window is the only writer. */
let sabHead = null, sabRing = null;
const RING_CAP = 65536;
function stdinWait() {
  flushOut(); // never park with the phantom's words still in the buffer — Atomics.wait starves the flush timer
  while (true) {
    const w = Atomics.load(sabHead, 0), r = Atomics.load(sabHead, 1);
    if (w - r > 0) return w - r;
    if (Atomics.load(sabHead, 2)) return 0;
    Atomics.wait(sabHead, 0, w);
  }
}
function stdinReadInto(view, ptr, want) {
  let avail = stdinWait();
  if (avail === 0) return 0; // EOF
  const n = Math.min(avail, want);
  const r = Atomics.load(sabHead, 1);
  for (let i = 0; i < n; i++) view.setUint8(ptr + i, sabRing[(r + i) % RING_CAP]);
  Atomics.store(sabHead, 1, r + n);
  return n;
}

/* ---------------- the memory filesystem ---------------- */
const fsMap = new Map(); // abs path -> { dir: true } | { data: Uint8Array, mtime: number }
fsMap.set("/", { dir: true });
fsMap.set("/tmp", { dir: true });
fsMap.set("/plugins", { dir: true });
const norm = (p) => {
  const out = [];
  for (const seg of p.split("/")) { if (!seg || seg === ".") continue; if (seg === "..") out.pop(); else out.push(seg); }
  return "/" + out.join("/");
};
const parentOf = (p) => { const i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); };
const childrenOf = (dir) => {
  const pre = dir === "/" ? "/" : dir + "/";
  const names = new Set();
  for (const k of fsMap.keys()) { if (k !== dir && k.startsWith(pre)) { const rest = k.slice(pre.length); if (rest && !rest.includes("/")) names.add(rest); } }
  return [...names].sort();
};

/* ---------------- fds ---------------- */
const fds = new Map();
let nextFd = 5;
fds.set(0, { kind: "stdin" });
fds.set(1, { kind: "stdout" });
fds.set(2, { kind: "stderr" });
fds.set(3, { kind: "dir", path: "/" });   // preopen "."
fds.set(4, { kind: "dir", path: "/tmp" }); // preopen "/tmp"

/* ---------------- output ---------------- */
let outBuf = [], outLen = 0, outTimer = null;
function emit(stream, bytes) {
  outBuf.push({ stream, bytes }); outLen += bytes.length;
  if (outLen > 4096) flushOut();
  else if (!outTimer) outTimer = setTimeout(flushOut, 16);
}
function flushOut() {
  if (outTimer) { clearTimeout(outTimer); outTimer = null; }
  if (!outBuf.length) return;
  const batch = outBuf; outBuf = []; outLen = 0;
  postMessage({ type: "out", batch });
}

/* ---------------- helpers over wasm memory ---------------- */
const rdStr = (ptr, len) => new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
function writeIov(view, iovsPtr, iovsLen, fill) {
  let total = 0;
  for (let i = 0; i < iovsLen; i++) {
    const base = view.getUint32(iovsPtr + i * 8, true);
    const len = view.getUint32(iovsPtr + i * 8 + 4, true);
    total += fill(base, len, total);
  }
  return total;
}
function filestat(view, ptr, path) {
  const node = fsMap.get(path);
  view.setBigUint64(ptr, 1n, true);            // dev
  view.setBigUint64(ptr + 8, BigInt([...path].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)), true); // ino
  view.setUint8(ptr + 16, node.dir ? FT.DIR : FT.REGULAR);
  view.setBigUint64(ptr + 24, 1n, true);       // nlink
  view.setBigUint64(ptr + 32, BigInt(node.dir ? 0 : node.data.length), true);
  const t = BigInt((node.mtime || Date.now()) * 1e6);
  view.setBigUint64(ptr + 40, t, true); view.setBigUint64(ptr + 48, t, true); view.setBigUint64(ptr + 56, t, true);
}

/* ---------------- the WASI surface ---------------- */
const ENV = { TERM: "xterm", HOME: "/home/operator", PHASE1_LEGACY_SHELL_UI: "1", PHASE1_COOKED_INPUT: "1", COLUMNS: "100", LINES: "30", PWD: "/", USER: "operator" };
const ARGS = ["phase1"];
const wasi = {
  args_sizes_get: (argcPtr, argvBufSizePtr) => { const v = mem(); v.setUint32(argcPtr, ARGS.length, true); v.setUint32(argvBufSizePtr, ARGS.reduce((a, s) => a + s.length + 1, 0), true); return 0; },
  args_get: (argvPtr, bufPtr) => { const v = mem(); let off = bufPtr; ARGS.forEach((s, i) => { v.setUint32(argvPtr + i * 4, off, true); for (const ch of s) v.setUint8(off++, ch.charCodeAt(0)); v.setUint8(off++, 0); }); return 0; },
  environ_sizes_get: (countPtr, sizePtr) => { const ks = Object.keys(ENV); const v = mem(); v.setUint32(countPtr, ks.length, true); v.setUint32(sizePtr, ks.reduce((a, k) => a + k.length + 1 + ENV[k].length + 1, 0), true); return 0; },
  environ_get: (envPtr, bufPtr) => { const v = mem(); let off = bufPtr; Object.keys(ENV).forEach((k, i) => { const s = `${k}=${ENV[k]}`; v.setUint32(envPtr + i * 4, off, true); for (const ch of s) v.setUint8(off++, ch.charCodeAt(0)); v.setUint8(off++, 0); }); return 0; },
  clock_time_get: (id, _prec, outPtr) => { const ns = id === 0 ? BigInt(Date.now()) * 1000000n : BigInt(Math.floor(performance.now() * 1e6)); mem().setBigUint64(outPtr, ns, true); return 0; },
  random_get: (bufPtr, len) => { const a = new Uint8Array(exports.memory.buffer, bufPtr, len); crypto.getRandomValues(a); return 0; },
  sched_yield: () => 0,
  proc_exit: (code) => { flushOut(); postMessage({ type: "exit", code }); throw new Error("__phantom_exit_" + code); },
  fd_close: (fd) => { if (fd > 4) fds.delete(fd); return 0; },
  fd_fdstat_get: (fd, outPtr) => { const f = fds.get(fd); if (!f) return ERR.BADF; const v = mem(); v.setUint8(outPtr, f.kind === "dir" ? FT.DIR : f.kind === "file" ? FT.REGULAR : FT.CHAR); v.setUint16(outPtr + 2, 0, true); v.setBigUint64(outPtr + 8, 0xffffffffffffffffn, true); v.setBigUint64(outPtr + 16, 0xffffffffffffffffn, true); return 0; },
  fd_fdstat_set_flags: () => 0,
  fd_prestat_get: (fd, outPtr) => { const v = mem(); if (fd === 3) { v.setUint8(outPtr, 0); v.setUint32(outPtr + 4, 1, true); return 0; } if (fd === 4) { v.setUint8(outPtr, 0); v.setUint32(outPtr + 4, 4, true); return 0; } return ERR.BADF; },
  fd_prestat_dir_name: (fd, pathPtr, len) => { const name = fd === 3 ? "." : "/tmp"; const v = mem(); for (let i = 0; i < Math.min(len, name.length); i++) v.setUint8(pathPtr + i, name.charCodeAt(i)); return 0; },
  fd_read: (fd, iovsPtr, iovsLen, nreadPtr) => {
    const v = mem(); const f = fds.get(fd); if (!f) return ERR.BADF;
    let total = 0;
    if (f.kind === "stdin") total = writeIov(v, iovsPtr, iovsLen, (base, len) => stdinReadInto(v, base, len));
    else if (f.kind === "file") { const node = fsMap.get(f.path); total = writeIov(v, iovsPtr, iovsLen, (base, len) => { const n = Math.max(0, Math.min(len, node.data.length - f.offset)); new Uint8Array(exports.memory.buffer, base, n).set(node.data.subarray(f.offset, f.offset + n)); f.offset += n; return n; }); }
    else return ERR.BADF;
    v.setUint32(nreadPtr, total, true); return 0;
  },
  fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
    const v = mem(); const f = fds.get(fd); if (!f) return ERR.BADF;
    let total = 0;
    if (f.kind === "stdout" || f.kind === "stderr") {
      const parts = [];
      total = writeIov(v, iovsPtr, iovsLen, (base, len) => { parts.push(new Uint8Array(exports.memory.buffer.slice(base, base + len))); return len; });
      const all = new Uint8Array(total); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      emit(f.kind === "stdout" ? 1 : 2, all);
    } else if (f.kind === "file") {
      const node = fsMap.get(f.path);
      total = writeIov(v, iovsPtr, iovsLen, (base, len) => {
        const at = f.append ? node.data.length : f.offset;
        const need = at + len;
        if (need > node.data.length) { const grown = new Uint8Array(need); grown.set(node.data); node.data = grown; }
        node.data.set(new Uint8Array(exports.memory.buffer, base, len), at);
        f.offset = at + len; node.mtime = Date.now();
        return len;
      });
    } else return ERR.BADF;
    v.setUint32(nwrittenPtr, total, true); return 0;
  },
  fd_seek: (fd, offset, whence, newPosPtr) => { const f = fds.get(fd); if (!f || f.kind !== "file") return ERR.BADF; const node = fsMap.get(f.path); let base = whence === 0 ? 0 : whence === 1 ? f.offset : node.data.length; f.offset = Math.max(0, base + Number(offset)); mem().setBigUint64(newPosPtr, BigInt(f.offset), true); return 0; },
  fd_tell: (fd, posPtr) => { const f = fds.get(fd); if (!f) return ERR.BADF; mem().setBigUint64(posPtr, BigInt(f.offset || 0), true); return 0; },
  fd_filestat_get: (fd, outPtr) => { const f = fds.get(fd); if (!f || !f.path) return ERR.BADF; filestat(mem(), outPtr, f.path); return 0; },
  fd_filestat_set_size: (fd, size) => { const f = fds.get(fd); if (!f || f.kind !== "file") return ERR.BADF; const node = fsMap.get(f.path); const n = Number(size); const d = new Uint8Array(n); d.set(node.data.subarray(0, n)); node.data = d; node.mtime = Date.now(); return 0; },
  fd_filestat_set_times: () => 0,
  fd_sync: () => 0, fd_datasync: () => 0, fd_advise: () => 0, fd_allocate: () => ERR.NOTSUP,
  fd_readdir: (fd, bufPtr, bufLen, cookie, bufUsedPtr) => {
    const f = fds.get(fd); if (!f || f.kind !== "dir") return ERR.BADF;
    const v = mem(); const kids = childrenOf(f.path);
    let written = 0, idx = Number(cookie);
    while (idx < kids.length) {
      const name = kids[idx]; const node = fsMap.get(norm(f.path + "/" + name));
      const recLen = 24 + name.length;
      if (written + recLen > bufLen) break;
      v.setBigUint64(bufPtr + written, BigInt(idx + 1), true);
      v.setBigUint64(bufPtr + written + 8, 1n, true);
      v.setUint32(bufPtr + written + 16, name.length, true);
      v.setUint8(bufPtr + written + 20, node.dir ? FT.DIR : FT.REGULAR);
      for (let i = 0; i < name.length; i++) v.setUint8(bufPtr + written + 24 + i, name.charCodeAt(i));
      written += recLen; idx++;
    }
    v.setUint32(bufUsedPtr, written, true); return 0;
  },
  path_open: (dirfd, _dirflags, pathPtr, pathLen, oflags, _rb, _ri, fdflags, openedPtr) => {
    const dir = fds.get(dirfd); if (!dir || !dir.path) return ERR.BADF;
    const p = norm(dir.path + "/" + rdStr(pathPtr, pathLen));
    let node = fsMap.get(p);
    if (!node) {
      if (!(oflags & OF.CREAT)) return ERR.NOENT;
      const parent = fsMap.get(parentOf(p)); if (!parent || !parent.dir) return ERR.NOENT;
      node = { data: new Uint8Array(0), mtime: Date.now() }; fsMap.set(p, node);
    }
    if (node.dir) { const fd = nextFd++; fds.set(fd, { kind: "dir", path: p }); mem().setUint32(openedPtr, fd, true); return 0; }
    if (oflags & OF.DIR) return ERR.NOTDIR;
    if (oflags & OF.TRUNC) { node.data = new Uint8Array(0); node.mtime = Date.now(); }
    const fd = nextFd++; fds.set(fd, { kind: "file", path: p, offset: 0, append: !!(fdflags & 1) });
    mem().setUint32(openedPtr, fd, true); return 0;
  },
  path_filestat_get: (_flags, dirfd, pathPtr, pathLen, outPtr) => { const dir = fds.get(dirfd); if (!dir || !dir.path) return ERR.BADF; const p = norm(dir.path + "/" + rdStr(pathPtr, pathLen)); if (!fsMap.get(p)) return ERR.NOENT; filestat(mem(), outPtr, p); return 0; },
  path_filestat_set_times: () => 0,
  path_create_directory: (dirfd, pathPtr, pathLen) => { const dir = fds.get(dirfd); if (!dir || !dir.path) return ERR.BADF; const p = norm(dir.path + "/" + rdStr(pathPtr, pathLen)); if (fsMap.has(p)) return ERR.EXIST; const parent = fsMap.get(parentOf(p)); if (!parent || !parent.dir) return ERR.NOENT; fsMap.set(p, { dir: true }); return 0; },
  path_unlink_file: (dirfd, pathPtr, pathLen) => { const dir = fds.get(dirfd); if (!dir || !dir.path) return ERR.BADF; const p = norm(dir.path + "/" + rdStr(pathPtr, pathLen)); const n = fsMap.get(p); if (!n) return ERR.NOENT; if (n.dir) return ERR.ISDIR; fsMap.delete(p); return 0; },
  path_remove_directory: (dirfd, pathPtr, pathLen) => { const dir = fds.get(dirfd); if (!dir || !dir.path) return ERR.BADF; const p = norm(dir.path + "/" + rdStr(pathPtr, pathLen)); const n = fsMap.get(p); if (!n || !n.dir) return ERR.NOENT; if (childrenOf(p).length) return ERR.NOTEMPTY; fsMap.delete(p); return 0; },
  path_rename: (oldFd, oldPtr, oldLen, newFd, newPtr, newLen) => {
    const a = fds.get(oldFd), b = fds.get(newFd); if (!a || !b || !a.path || !b.path) return ERR.BADF;
    const from = norm(a.path + "/" + rdStr(oldPtr, oldLen)); const to = norm(b.path + "/" + rdStr(newPtr, newLen));
    const node = fsMap.get(from); if (!node) return ERR.NOENT;
    fsMap.delete(from); fsMap.set(to, node);
    for (const k of [...fsMap.keys()]) if (k.startsWith(from + "/")) { const v = fsMap.get(k); fsMap.delete(k); fsMap.set(to + k.slice(from.length), v); }
    return 0;
  },
  path_link: () => ERR.NOTSUP, path_symlink: () => ERR.NOTSUP,
  path_readlink: () => ERR.INVAL,
  poll_oneoff: (inPtr, outPtr, nsubs, neventsPtr) => {
    const v = mem(); let waitMs = 0;
    for (let i = 0; i < nsubs; i++) {
      const type = v.getUint8(inPtr + i * 48 + 8);
      if (type === 0) { // clock subscription — the only kind std's sleep uses
        const timeout = v.getBigUint64(inPtr + i * 48 + 24, true);
        const flags = v.getUint16(inPtr + i * 48 + 40, true);
        let ms; if (flags & 1) { const nowNs = BigInt(Date.now()) * 1000000n; ms = Number((timeout > nowNs ? timeout - nowNs : 0n) / 1000000n); } else ms = Number(timeout / 1000000n);
        waitMs = Math.max(waitMs, ms);
      }
    }
    if (waitMs > 0) { flushOut(); Atomics.wait(sabHead, 3, 0, Math.min(waitMs, 60000)); }
    for (let i = 0; i < nsubs; i++) { v.setBigUint64(outPtr + i * 32, v.getBigUint64(inPtr + i * 48, true), true); v.setUint16(outPtr + i * 32 + 8, 0, true); v.setUint8(outPtr + i * 32 + 10, v.getUint8(inPtr + i * 48 + 8)); }
    v.setUint32(neventsPtr, nsubs, true); return 0;
  },
  sock_accept: () => ERR.NOTSUP, sock_recv: () => ERR.NOTSUP, sock_send: () => ERR.NOTSUP, sock_shutdown: () => ERR.NOTSUP,
};

/* ---------------- boot ---------------- */
onmessage = async (e) => {
  const msg = e.data;
  if (msg.type !== "init") return;
  sabHead = new Int32Array(msg.sab, 0, 4);
  sabRing = new Uint8Array(msg.sab, 64, RING_CAP);
  Object.assign(ENV, msg.env || {});
  try {
    for (const name of ["hello.py", "demo.py"]) {
      try {
        const res = await fetch("/phantom/plugins/" + name);
        if (res.ok) fsMap.set("/plugins/" + name, { data: new TextEncoder().encode(await res.text()), mtime: Date.now() });
      } catch { /* the plugins are garnish — the phantom boots without them */ }
    }
    const res = await fetch(msg.wasmUrl);
    if (!res.ok) throw new Error("the phantom binary answered " + res.status);
    const bytes = await res.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi });
    exports = instance.exports;
    exports._start();
    flushOut();
    postMessage({ type: "exit", code: 0 });
  } catch (err) {
    if (String(err && err.message || err).startsWith("__phantom_exit_")) return; // proc_exit already reported
    flushOut();
    postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
