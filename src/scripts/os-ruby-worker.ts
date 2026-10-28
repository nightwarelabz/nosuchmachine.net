/* the Ruby engine room — real CRuby 3.4 (the official ruby.wasm
 * build) in a dedicated worker. This file is bundled by
 * scripts/build-ruby.mjs into public/ruby/ruby-worker.js; the
 * interpreter rides beside it split into ruby.wasm.<n> parts with
 * a manifest (Pages refuses single files over 25 MiB) and is
 * reassembled + hash-verified here before compiling. Both are
 * build artifacts, never committed.
 *
 * The world offered to Ruby is deliberately small: WASI args/env
 * (empty), clocks, randomness, stdio, and ONE preopen directory —
 * the operator's VFS home, mirrored in before the run and walked
 * back out after it. No network imports exist here at all.
 *
 * One compiled module, a fresh VM per run, so a run can poison
 * nothing. Output streams through the binding's console printer
 * (CRuby's own UTF-8 decoding). stdin is a blocking Fd over a
 * SharedArrayBuffer ring the window writes lines into (the phantom
 * pattern); without shared memory the run reads EOF instead. A run
 * that never ends blocks this thread — the window's Stop and its
 * 30-second cap terminate and respawn the worker wholesale. */
import { RubyVM, consolePrinter } from "@ruby/wasm-wasi";
import { WASI, PreopenDirectory, Directory, File as WasiFile, OpenFile, Fd } from "@bjorn3/browser_wasi_shim";

const HOME = "/home/operator";
const POST_CAP = 1024 * 1024; // bytes of output forwarded per run

let modulePromise: Promise<WebAssembly.Module> | null = null;

interface RunFile { path: string; data: Uint8Array }

/* stdin over the shared ring: header Int32 [0] write seq ·
   [1] read seq · [2] closed flag; bytes live in the ring after a
   64-byte header. fd_read blocks on Atomics.wait — the phantom
   host's discipline, so `gets` truly waits for the operator. */
class StdinFd extends Fd {
  private head: Int32Array;
  private ring: Uint8Array;
  constructor(sab: SharedArrayBuffer) {
    super();
    this.head = new Int32Array(sab, 0, 4);
    this.ring = new Uint8Array(sab, 64);
  }
  fd_read(size: number): { ret: number; data: Uint8Array } {
    const cap = this.ring.length;
    for (;;) {
      const w = Atomics.load(this.head, 0);
      const r = Atomics.load(this.head, 1);
      const avail = w - r;
      if (avail > 0) {
        const n = Math.min(avail, size);
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = this.ring[(r + i) % cap];
        Atomics.store(this.head, 1, r + n);
        return { ret: 0, data: out };
      }
      if (Atomics.load(this.head, 2)) return { ret: 0, data: new Uint8Array(0) };
      Atomics.wait(this.head, 0, w);
    }
  }
}

function buildTree(files: RunFile[]): Map<string, InstanceType<typeof WasiFile> | Directory> {
  const root = new Map<string, InstanceType<typeof WasiFile> | Directory>();
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = dir.get(parts[i]);
      if (!(next instanceof Directory)) { next = new Directory(new Map()); dir.set(parts[i], next); }
      dir = (next as Directory).contents as typeof root;
    }
    dir.set(parts[parts.length - 1], new WasiFile(f.data));
  }
  return root;
}

function walkBack(dir: Map<string, unknown>, prefix: string, out: RunFile[]): void {
  for (const [name, node] of dir) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (node instanceof Directory) walkBack((node as Directory).contents as Map<string, unknown>, path, out);
    else if (node instanceof WasiFile) out.push({ path, data: (node as WasiFile).data.slice() });
  }
}

async function run(m: { entry: string; files: RunFile[]; sab?: SharedArrayBuffer }): Promise<void> {
  const post = (msg: Record<string, unknown>) => (self as unknown as Worker).postMessage(msg);
  try {
    const module = await modulePromise!;
    /* The preopen is the filesystem ROOT, with the home nested
       inside it: `load` resolves /home/operator/... by walking
       realpath through /home, which must exist as a directory —
       a preopen mounted directly at /home/operator leaves /home
       itself missing and every absolute load dies in ENOENT. */
    const root = new Map<string, unknown>();
    root.set("home", new Directory(new Map([["operator", new Directory(buildTree(m.files) as Map<string, never>)]])));
    const preopen = new PreopenDirectory("/", root as never);
    const stdin = m.sab ? new StdinFd(m.sab) : new OpenFile(new WasiFile([]));
    let posted = 0;
    let capped = false;
    const sink = (stream: string) => (str: string) => {
      if (posted >= POST_CAP) { capped = true; return; }
      posted += str.length;
      post({ type: "out", stream, text: str });
    };
    const printer = consolePrinter({ stdout: sink("stdout"), stderr: sink("stderr") });
    const wasi = new WASI([], [], [stdin, new OpenFile(new WasiFile([])), new OpenFile(new WasiFile([])), preopen], { debug: false });
    const { vm } = await RubyVM.instantiateModule({
      module, wasip1: wasi,
      addToImports: (imports) => printer.addToImports(imports),
      setMemory: (memory) => printer.setMemory(memory),
    });
    const target = `${HOME}/${m.entry}`;
    /* The program runs by `load`, wrapped so an uncaught exception
       prints CRuby's own full message to stderr — the same words
       the ruby binary itself would print. SystemExit is the
       program's own business and passes quietly. */
    const driver =
      "begin\n" +
      `  Dir.chdir(${JSON.stringify(HOME)})\n` +
      `  load ${JSON.stringify(target)}\n` +
      "rescue SystemExit\n" +
      "rescue Exception => __rb_e\n" +
      "  $stderr.puts(__rb_e.full_message(highlight: false, order: :top))\n" +
      "end\n";
    try { vm.eval(driver); }
    catch (err) { post({ type: "out", stream: "stderr", text: String((err as Error)?.message || err) }); }
    const all: RunFile[] = [];
    walkBack(root as Map<string, unknown>, "", all);
    const files = all
      .filter((f) => f.path.startsWith("home/operator/"))
      .map((f) => ({ path: f.path.slice("home/operator/".length), data: f.data }));
    post({ type: "done", files, capped });
  } catch (err) {
    post({ type: "fatal", error: String((err as Error)?.message || err) });
  }
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: string; wasmBase?: string; entry: string; files: RunFile[]; sab?: SharedArrayBuffer };
  if (m.type === "init") {
    modulePromise = (async () => {
      const base = m.wasmBase!;
      const mres = await fetch(`${base}manifest.json`);
      if (!mres.ok) throw new Error(`ruby manifest: HTTP ${mres.status}`);
      const manifest = (await mres.json()) as { parts: string[]; bytes: number; sha256: string };
      const chunks = await Promise.all(
        manifest.parts.map(async (part) => {
          const res = await fetch(`${base}${part}`);
          if (!res.ok) throw new Error(`ruby.wasm part ${part}: HTTP ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        }),
      );
      const whole = new Uint8Array(manifest.bytes);
      let off = 0;
      for (const c of chunks) { whole.set(c, off); off += c.length; }
      if (off !== manifest.bytes) throw new Error("ruby.wasm: reassembled size mismatch");
      const digest = await crypto.subtle.digest("SHA-256", whole);
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex !== manifest.sha256) throw new Error("ruby.wasm: sha-256 mismatch after reassembly");
      return WebAssembly.compile(whole);
    })();
    modulePromise.then(
      () => (self as unknown as Worker).postMessage({ type: "ready" }),
      (err) => (self as unknown as Worker).postMessage({ type: "initfail", error: String((err as Error)?.message || err) }),
    );
  } else if (m.type === "run") {
    void run(m);
  }
};
