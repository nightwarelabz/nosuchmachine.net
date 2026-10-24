/* PHASE2 — PHANTOM · phase1 (Bryforge/phase1 v7.0.1), ported to the
 * room. The Rust binary runs unmodified-in-spirit as wasm32-wasip1 in
 * a worker (public/phase2/phantom-worker.js holds the WASI world:
 * a memory filesystem, clocks, random, and a stdin ring). This file
 * is only the glass: a terminal that renders the byte stream, and an
 * input line that feeds the ring. The port's whole delta against
 * upstream is eight small cfg gates — tools/phase2/ keeps the patch.
 *
 * Blocking stdin is real here: the worker waits on a
 * SharedArrayBuffer, which is why the OS pages carry
 * Cross-Origin-Embedder-Policy — without isolation the phantom
 * honestly cannot wake, and the window says so instead of hanging.
 */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* A small ANSI line renderer: cooked-mode phase1 speaks in lines,
   cursor returns, clear-screens, and color codes. Colors are
   dropped; structure (lines, overwrites, clears) is honored. */
class AnsiLines {
  private decoder = new TextDecoder();
  private cur: string[] = [];
  private col = 0;
  private esc = "";
  constructor(private commit: (line: string) => void, private clearAll: () => void) {}
  feed(bytes: Uint8Array) {
    const text = this.decoder.decode(bytes, { stream: true });
    for (const ch of text) {
      if (this.esc) { this.esc += ch; if (/[A-Za-z]/.test(ch)) { this.applyEsc(this.esc); this.esc = ""; } else if (this.esc.length > 12) this.esc = ""; continue; }
      if (ch === "\x1b") { this.esc = ch; continue; }
      if (ch === "\n") { this.commit(this.cur.join("")); this.cur = []; this.col = 0; continue; }
      if (ch === "\r") { this.col = 0; continue; }
      if (ch === "\x08") { this.col = Math.max(0, this.col - 1); continue; }
      if (ch === "\x07") continue;
      this.cur[this.col] = ch;
      this.col++;
    }
  }
  tail(): string { return this.cur.join(""); }
  private applyEsc(seq: string) {
    const final = seq[seq.length - 1];
    const params = seq.slice(2, -1);
    if (final === "J") { if (params === "2" || params === "3" || params === "") this.clearAll(); }
    else if (final === "K") { this.cur.length = this.col; }
    else if (final === "H") { /* cursor home — the live line restarts from the shell's next print */ }
    else if (final === "C") { this.col += parseInt(params || "1", 10) || 1; }
    else if (final === "D") { this.col = Math.max(0, this.col - (parseInt(params || "1", 10) || 1)); }
    /* SGR and everything else: structure only, color stays home */
  }
}

export function buildPhase2App(body: HTMLElement) {
  body.classList.add("os-term-body");
  body.classList.add("os-p2");
  const transcript = el("div", "os-term-out");
  const liveLine = el("pre", "os-term-text os-p2-live");
  const line = el("div", "os-term-line");
  const prompt = el("span", "os-term-prompt", "phase1 ›");
  const input = document.createElement("input");
  input.className = "os-term-input";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("aria-label", "Phase2 input — lines for the phantom");
  const rebootBtn = el("button", "os-btn small", "reboot");
  const copyBtn = el("button", "os-btn small", "copy");
  line.append(prompt, input, rebootBtn, copyBtn);
  body.append(transcript, line);

  const print = (text: string, cls?: string) => {
    const pre = el("pre", "os-term-text" + (cls ? ` ${cls}` : ""), text);
    transcript.insertBefore(pre, liveLine.parentNode === transcript ? liveLine : null);
    if (liveLine.parentNode !== transcript) transcript.appendChild(liveLine);
    transcript.scrollTop = transcript.scrollHeight;
  };
  const renderer = new AnsiLines(
    (l) => print(l),
    () => { transcript.querySelectorAll("pre:not(.os-p2-live)").forEach((n) => n.remove()); },
  );
  const renderTail = () => { liveLine.textContent = renderer.tail(); transcript.scrollTop = transcript.scrollHeight; };
  transcript.appendChild(liveLine);

  copyBtn.addEventListener("click", () => {
    const text = [...transcript.querySelectorAll("pre")].map((c) => c.textContent || "").join("\n");
    void navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = "copied ✓"; setTimeout(() => (copyBtn.textContent = "copy"), 1400); });
  });

  let worker: Worker | null = null;
  let head: Int32Array | null = null;
  let ring: Uint8Array | null = null;
  let exited = false;
  const RING_CAP = 65536;

  const sendLine = (text: string) => {
    if (!head || !ring) return;
    const bytes = new TextEncoder().encode(text + "\n");
    const w = Atomics.load(head, 0);
    const r = Atomics.load(head, 1);
    if (bytes.length > RING_CAP - (w - r)) return; // a line longer than the ring is not a line, it is a flood
    for (let i = 0; i < bytes.length; i++) ring[(w + i) % RING_CAP] = bytes[i];
    Atomics.store(head, 0, w + bytes.length);
    Atomics.notify(head, 0);
  };

  const boot = () => {
    exited = false;
    input.disabled = false;
    const sab = new SharedArrayBuffer(64 + RING_CAP);
    head = new Int32Array(sab, 0, 4);
    ring = new Uint8Array(sab, 64, RING_CAP);
    worker = new Worker("/phase2/phantom-worker.js");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "out") {
        for (const chunk of m.batch) { renderer.feed(chunk.bytes); }
        renderTail();
      } else if (m.type === "exit") {
        exited = true;
        input.disabled = true;
        print(`— phase1 shut down (exit ${m.code}). the room it lived in was volatile; reboot raises a fresh one.`, "dim");
      } else if (m.type === "error") {
        exited = true;
        input.disabled = true;
        print(`— the phantom could not wake: ${m.message}`, "err");
      }
    };
    worker.onerror = () => { print("— the phantom worker faulted. reboot to try again.", "err"); };
    print("— raising phase1 7.0.1 (wasm32-wasip1) — its boot menu takes an empty line for BOOT.", "dim");
    worker.postMessage({ type: "init", sab, wasmUrl: "/phase2/phantom.wasm", env: { COLUMNS: "100" } });
  };

  rebootBtn.addEventListener("click", () => {
    if (worker) { worker.terminate(); worker = null; }
    transcript.querySelectorAll("pre:not(.os-p2-live)").forEach((n) => n.remove());
    boot();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = input.value;
    input.value = "";
    if (!exited) sendLine(text);
  });

  if (typeof SharedArrayBuffer === "undefined" || !(window as any).crossOriginIsolated) {
    input.disabled = true;
    print("— PHANTOM needs a cross-origin-isolated room to block on stdin (SharedArrayBuffer). This browser or context refuses it, so the phantom sleeps. A hard refresh on the top-level site usually settles it.", "err");
  } else {
    boot();
  }

  /* The window closing ends the phantom's world. */
  const watch = setInterval(() => {
    if (!body.isConnected) { clearInterval(watch); if (worker) worker.terminate(); }
  }, 1000);
}
