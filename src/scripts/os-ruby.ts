/* the Ruby room — real CRuby 3.4 (the official ruby.wasm build)
 * in a dedicated worker (os-ruby-worker.ts, bundled to
 * /ruby/ruby-worker.js by scripts/build-ruby.mjs; the interpreter
 * rides same-origin at /ruby/ruby.wasm).
 *
 * The bridge is the VFS: at run, /home/operator is mirrored into
 * the worker as Ruby's one filesystem and files Ruby writes are
 * walked back into the VFS afterwards. The editor's buffer is
 * staged in as the entry file, so Run always runs what you see.
 * `gets` reads lines typed into the console's stdin row (a
 * SharedArrayBuffer ring, the phantom pattern — where shared
 * memory is unavailable the program reads EOF instead).
 *
 * A hard 30-second cap and the Stop button both terminate the
 * worker and respawn it; output is capped in the console. Honest
 * limits: the bundled stdlib only — no gems, no native extensions,
 * no network from Ruby. */
import { verb, type BlacksiteOS } from "./os-shell";
import { t, tf } from "./os-i18n";

const HOME = "/home/operator";
const RUN_CAP_MS = 30_000;
const OUT_CAP = 256 * 1024;
const STARTER = [
  "# ruby in the room — CRuby 3.4, the real interpreter, as wasm.",
  "puts \"hello from ruby #{RUBY_VERSION}\"",
  "puts \"1 + 2 = #{1 + 2}\"",
  "puts [3, 1, 4, 1, 5, 9].sum",
  "",
].join("\n");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

interface RunFile { path: string; data: Uint8Array }
interface RunResult { files: RunFile[]; capped: boolean }

/* The stdin ring the window writes and the worker blocks on:
   header Int32 [0] write seq · [1] read seq · [2] closed. */
class StdinRing {
  sab: SharedArrayBuffer | null = null;
  private head: Int32Array | null = null;
  private ring: Uint8Array | null = null;
  constructor() {
    try {
      if (typeof SharedArrayBuffer !== "undefined") {
        this.sab = new SharedArrayBuffer(64 + 65536);
        this.head = new Int32Array(this.sab, 0, 4);
        this.ring = new Uint8Array(this.sab, 64);
      }
    } catch { this.sab = null; }
  }
  reset(): void {
    if (!this.head) return;
    Atomics.store(this.head, 0, 0);
    Atomics.store(this.head, 1, 0);
    Atomics.store(this.head, 2, 0);
  }
  close(): void { if (this.head) { Atomics.store(this.head, 2, 1); Atomics.notify(this.head, 0); } }
  writeLine(text: string): void {
    if (!this.head || !this.ring || !this.sab) return;
    const bytes = new TextEncoder().encode(text + "\n");
    const cap = this.ring.length;
    const w = Atomics.load(this.head, 0);
    const r = Atomics.load(this.head, 1);
    if (bytes.length > cap - (w - r)) return; // ring full — the line is dropped, never a hang
    for (let i = 0; i < bytes.length; i++) this.ring[(w + i) % cap] = bytes[i];
    Atomics.store(this.head, 0, w + bytes.length);
    Atomics.notify(this.head, 0);
  }
}

/* One worker, spawned lazily, shared by the room and the verb.
   A run that outlives its welcome is terminated wholesale and
   the next run respawns — the exercise-sandbox discipline. */
class RubyRunner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private settle: ((r: RunResult | null) => void) | null = null;
  private onOut: ((stream: string, text: string) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  ring = new StdinRing();
  running = false;
  timedOut = false;

  private spawn(): Promise<void> {
    this.kill();
    const w = new Worker("/ruby/ruby-worker.js");
    this.worker = w;
    this.ready = new Promise<void>((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        const m = e.data as { type: string; error?: string };
        if (m.type === "ready") { w.removeEventListener("message", onMsg); resolve(); }
        else if (m.type === "initfail") { w.removeEventListener("message", onMsg); reject(new Error(m.error || "init failed")); }
      };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", () => reject(new Error("the ruby worker faulted")), { once: true });
    });
    w.addEventListener("message", (e) => {
      const m = e.data as { type: string; stream?: string; text?: string; files?: RunFile[]; capped?: boolean; error?: string };
      if (m.type === "out") this.onOut?.(m.stream || "stdout", m.text || "");
      else if (m.type === "done") this.finish({ files: m.files || [], capped: !!m.capped });
      else if (m.type === "fatal") { this.onOut?.("stderr", `ruby: ${m.error || "the run failed"}`); this.finish(null); }
    });
    w.postMessage({ type: "init", wasmUrl: "/ruby/ruby.wasm" });
    return this.ready;
  }

  private kill(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { this.worker?.terminate(); } catch { /* already gone */ }
    this.worker = null;
    this.ready = null;
  }

  private finish(r: RunResult | null): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.running = false;
    this.ring.close();
    const s = this.settle;
    this.settle = null;
    s?.(r);
  }

  async run(files: RunFile[], entry: string, onOut: (stream: string, text: string) => void): Promise<RunResult | null> {
    if (this.running) return null;
    this.running = true;
    this.timedOut = false;
    this.onOut = onOut;
    try {
      if (!this.worker || !this.ready) await this.spawn();
      else await this.ready;
    } catch (err) {
      this.running = false;
      onOut("stderr", tf("the ruby engine failed to start: {e}", { e: String((err as Error)?.message || err) }));
      return null;
    }
    this.ring.reset();
    return new Promise<RunResult | null>((resolve) => {
      this.settle = resolve;
      this.timer = setTimeout(() => {
        this.timedOut = true;
        this.kill();
        this.finish(null);
      }, RUN_CAP_MS);
      const msg: Record<string, unknown> = { type: "run", files, entry };
      if (this.ring.sab) msg.sab = this.ring.sab;
      this.worker!.postMessage(msg);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.kill();
    this.finish(null);
  }
}

const runner = new RubyRunner();

/* Mirror the VFS home into run files (the editor buffer staged
   over its own home-relative name), then write the run's files
   back. The entry is skipped on write-back when the open file
   lives outside home — its bytes already live in the buffer. */
function mirrorHome(os: BlacksiteOS): RunFile[] {
  const out: RunFile[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of os.list(dir)) {
      const p = `${dir}/${name}`;
      const r = rel ? `${rel}/${name}` : name;
      if (os.isDir(p)) walk(p, r);
      else { const b = os.readBytes(p); if (b) out.push({ path: r, data: b }); }
    }
  };
  if (os.isDir(HOME)) walk(HOME, "");
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Only files the run actually changed (or created) are written
   back. Mirroring everything home-shaped and then blindly
   rewriting it would put the room's own hand on files Ruby never
   touched — the decoy canaries among them, whose overwrite is an
   AEGIS trip. The comparison is against the bytes mirrored in,
   so an untouched file is never a write. */
function writeBack(os: BlacksiteOS, files: RunFile[], skipPath: string | null, originals: Map<string, Uint8Array>): void {
  for (const f of files) {
    const orig = originals.get(f.path);
    if (orig && sameBytes(orig, f.data)) continue;
    const vfsPath = `${HOME}/${f.path}`;
    if (skipPath && vfsPath === skipPath) continue;
    const parent = vfsPath.slice(0, vfsPath.lastIndexOf("/"));
    if (parent && !os.isDir(parent)) { try { os.mkdir(parent); } catch { /* stands */ } }
    /* The VFS keeps text and binary apart (content vs binary): a
       Ruby-written text file written back as binary would read as
       empty in cat and the Editor. Text goes back as text; only
       genuinely binary output rides as bytes. */
    let text: string | null = null;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(f.data); } catch { text = null; }
    if (text !== null) os.write(vfsPath, text);
    else os.writeBytes(vfsPath, f.data);
  }
}

export function buildRubyApp(body: HTMLElement, os: BlacksiteOS, arg?: string): void {
  body.innerHTML = "";
  const wrap = el("div", "os-ruby");
  const bar = el("div", "os-ruby-bar");
  const pathIn = el("input", "os-ruby-path");
  pathIn.type = "text";
  pathIn.spellcheck = false;
  let currentPath = arg ? os.norm(arg) : `${HOME}/hello.rb`;
  pathIn.value = currentPath;
  const openBtn = el("button", "os-btn", t("open"));
  const saveBtn = el("button", "os-btn", t("save"));
  const runBtn = el("button", "os-btn", t("run"));
  const stopBtn = el("button", "os-btn", t("stop"));
  stopBtn.disabled = true;
  bar.append(pathIn, openBtn, saveBtn, runBtn, stopBtn);
  wrap.append(bar);
  wrap.append(el("p", "os-note", t("real CRuby 3.4 (ruby.wasm) in a worker — the bundled stdlib only: no gems, no native extensions, no network. /home/operator is its filesystem, mirrored in at run and written back after; `gets` reads the stdin line below.")));

  const edRow = el("div", "os-ruby-edrow");
  const gutter = el("pre", "os-ruby-gutter", "1");
  const area = el("textarea", "os-ruby-area");
  area.spellcheck = false;
  area.setAttribute("aria-label", "ruby");
  edRow.append(gutter, area);
  wrap.append(edRow);

  const out = el("pre", "os-ruby-out", t("output lands here."));
  wrap.append(out);
  const inRow = el("div", "os-ruby-inrow");
  inRow.append(el("span", "os-ruby-inlabel", "stdin ›"));
  const inLine = el("input", "os-ruby-inline");
  inLine.type = "text";
  inLine.disabled = true;
  inRow.append(inLine);
  wrap.append(inRow);
  body.append(wrap);

  let outBytes = 0;
  let started = false;
  const syncGutter = () => {
    const n = area.value.split("\n").length;
    gutter.textContent = Array.from({ length: n }, (_, i) => String(i + 1)).join("\n");
    gutter.scrollTop = area.scrollTop;
  };
  area.addEventListener("input", syncGutter);
  area.addEventListener("scroll", () => { gutter.scrollTop = area.scrollTop; });
  area.addEventListener("keydown", (e) => { if (e.isComposing) e.stopPropagation(); });

  const loadPath = (p: string) => {
    const text = os.read(p);
    if (text === null) { out.textContent = tf("ruby: no such file: {path}", { path: p }); return; }
    currentPath = p;
    pathIn.value = p;
    area.value = text;
    syncGutter();
  };
  if (arg) loadPath(currentPath);
  else { area.value = STARTER; syncGutter(); }

  openBtn.addEventListener("click", () => loadPath(os.norm(pathIn.value.trim() || currentPath)));
  saveBtn.addEventListener("click", () => {
    currentPath = os.norm(pathIn.value.trim() || currentPath);
    const parent = currentPath.slice(0, currentPath.lastIndexOf("/"));
    if (parent && !os.isDir(parent)) { try { os.mkdir(parent); } catch { /* stands */ } }
    os.write(currentPath, area.value);
    out.textContent = tf("saved: {path}", { path: currentPath });
  });

  const print = (stream: string, text: string) => {
    if (!started) { out.textContent = ""; started = true; }
    if (outBytes >= OUT_CAP) return;
    outBytes += text.length;
    const span = el("span", stream === "stderr" ? "os-ruby-err" : "", text);
    out.append(span);
    out.scrollTop = out.scrollHeight;
  };

  const doRun = async () => {
    if (runner.running) return;
    out.textContent = "";
    started = false;
    outBytes = 0;
    runBtn.disabled = true;
    stopBtn.disabled = false;
    inLine.disabled = !runner.ring.sab;
    print("stdout", tf("running {path}…", { path: currentPath }) + "\n");
    const files = mirrorHome(os);
    const originals = new Map(files.map((f) => [f.path, f.data]));
    const base = currentPath.split("/").pop() || "main.rb";
    const staged: RunFile = { path: base, data: new TextEncoder().encode(area.value) };
    const files2 = files.filter((f) => f.path !== base);
    files2.push(staged);
    const res = await runner.run(files2, base, print);
    runBtn.disabled = false;
    stopBtn.disabled = true;
    inLine.disabled = true;
    if (res) {
      writeBack(os, res.files, currentPath === `${HOME}/${base}` ? null : `${HOME}/${base}`, originals);
      if (res.capped) print("stderr", t("— output capped; the rest was dropped.") + "\n");
    } else if (runner.timedOut) {
      print("stderr", t("— killed at the 30-second cap.") + "\n");
    } else {
      print("stderr", t("— stopped.") + "\n");
    }
  };
  runBtn.addEventListener("click", () => void doRun());
  stopBtn.addEventListener("click", () => runner.stop());
  inLine.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") {
      const v = inLine.value;
      inLine.value = "";
      print("stdout", v + "\n");
      runner.ring.writeLine(v);
    }
  });
}

export function registerRubyVerbs(): void {
  verb("ruby", "LIVE", "ruby <file.rb> — run a ruby program (real CRuby 3.4 as wasm); with no file, opens the Ruby room", async (ctx) => {
    const arg = ctx.args[0];
    if (!arg) { ctx.io.openApp?.("ruby"); return "the Ruby room — CRuby 3.4, in a worker."; }
    const path = ctx.os.norm(arg);
    const text = ctx.os.read(path);
    if (text === null) return tf("ruby: no such file: {path}", { path });
    if (runner.running) return t("ruby is already running — stop it first.");
    const files = mirrorHome(ctx.os);
    const originals = new Map(files.map((f) => [f.path, f.data]));
    const base = path.split("/").pop() || "main.rb";
    const files2 = files.filter((f) => f.path !== base);
    files2.push({ path: base, data: new TextEncoder().encode(text) });
    ctx.io.print(tf("running {path}…", { path }));
    const res = await runner.run(files2, base, (_s, chunk) => {
      for (const line of chunk.split("\n")) if (line) ctx.io.print(line);
    });
    if (res) writeBack(ctx.os, res.files, path === `${HOME}/${base}` ? null : `${HOME}/${base}`, originals);
    else if (runner.timedOut) ctx.io.print(t("— killed at the 30-second cap."));
  });
}
