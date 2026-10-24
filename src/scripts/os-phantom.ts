/* phantom · phase1 (Bryforge/phase1 v7.0.1), ported to the
 * room. The Rust binary runs unmodified-in-spirit as wasm32-wasip1 in
 * a worker (public/phantom/phantom-worker.js holds the WASI world:
 * a memory filesystem, clocks, random, and a stdin ring). This file
 * is the console the guest is operated through: a state rail with the
 * machine's lamp and its honest spec plate, a framed screen for the
 * byte stream, quick keys that send real lines, and an input line
 * that feeds the ring. The port's whole delta against upstream is
 * eight small cfg gates — tools/phantom/ keeps the patch.
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
   cursor returns, clear-screens, and color. The guest's SGR colors
   are rendered, not dropped: the standard and bright palettes, the
   256-color cube, truecolor, bold and dim — the pen is a stream
   property, snapshotted into every cell it writes. */
export interface Seg { t: string; fg?: string; bg?: string; b?: boolean; d?: boolean }
interface Pen { fg?: string; bg?: string; b: boolean; d: boolean }
const PAL = ["#5c6670", "#e5534b", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#c9d1d9"];
const PALB = ["#8b949e", "#ff7b72", "#56d364", "#e3b341", "#79b8ff", "#d2a8ff", "#56d4dd", "#f0f6fc"];
function x256(n: number): string {
  if (n < 8) return PAL[n];
  if (n < 16) return PALB[n - 8];
  n -= 16;
  if (n < 216) { const lv = (v: number) => (v === 0 ? 0 : 55 + v * 40); return `rgb(${lv(Math.floor(n / 36))},${lv(Math.floor((n % 36) / 6))},${lv(n % 6)})`; }
  const v = 8 + (n - 216) * 10;
  return `rgb(${v},${v},${v})`;
}
export class AnsiLines {
  private decoder = new TextDecoder();
  private cur: string[] = [];
  private attrs: Array<Pen | undefined> = [];
  private pen: Pen = { b: false, d: false };
  private col = 0;
  private esc = "";
  constructor(private commit: (segs: Seg[]) => void, private clearAll: () => void) {}
  feed(bytes: Uint8Array) {
    const text = this.decoder.decode(bytes, { stream: true });
    for (const ch of text) {
      if (this.esc) { this.esc += ch; if (/[A-Za-z]/.test(ch)) { this.applyEsc(this.esc); this.esc = ""; } else if (this.esc.length > 40) this.esc = ""; continue; }
      if (ch === "\x1b") { this.esc = ch; continue; }
      if (ch === "\n") { this.commit(this.segments()); this.cur = []; this.attrs = []; this.col = 0; continue; }
      if (ch === "\r") { this.col = 0; continue; }
      if (ch === "\x08") { this.col = Math.max(0, this.col - 1); continue; }
      if (ch === "\x07") continue;
      this.cur[this.col] = ch;
      this.attrs[this.col] = this.pen.fg || this.pen.bg || this.pen.b || this.pen.d ? { ...this.pen } : undefined;
      this.col++;
    }
  }
  tail(): Seg[] { return this.segments(); }
  private segments(): Seg[] {
    const segs: Seg[] = [];
    for (let i = 0; i < this.cur.length; i++) {
      const ch = this.cur[i] ?? " ";
      const a = this.attrs[i];
      const last = segs[segs.length - 1];
      if (last && last.fg === a?.fg && last.bg === a?.bg && !!last.b === !!a?.b && !!last.d === !!a?.d) last.t += ch;
      else segs.push({ t: ch, fg: a?.fg, bg: a?.bg, b: a?.b, d: a?.d });
    }
    while (segs.length && !segs[segs.length - 1].bg && /^ +$/.test(segs[segs.length - 1].t)) segs.pop();
    return segs;
  }
  private applyEsc(seq: string) {
    const final = seq[seq.length - 1];
    const params = seq.slice(2, -1);
    if (final === "J") { if (params === "2" || params === "3" || params === "") this.clearAll(); }
    else if (final === "K") { this.cur.length = this.col; this.attrs.length = this.col; }
    else if (final === "H") { /* cursor home — the live line restarts from the shell's next print */ }
    else if (final === "C") { this.col += parseInt(params || "1", 10) || 1; }
    else if (final === "D") { this.col = Math.max(0, this.col - (parseInt(params || "1", 10) || 1)); }
    else if (final === "m") {
      const parts = params === "" ? [0] : params.split(";").map((x) => parseInt(x || "0", 10) || 0);
      for (let i = 0; i < parts.length; i++) {
        const n = parts[i];
        if (n === 0) this.pen = { b: false, d: false };
        else if (n === 1) this.pen.b = true;
        else if (n === 2) this.pen.d = true;
        else if (n === 22) { this.pen.b = false; this.pen.d = false; }
        else if (n >= 30 && n <= 37) this.pen.fg = PAL[n - 30];
        else if (n === 38 || n === 48) {
          const mode = parts[++i];
          const key = n === 38 ? "fg" : "bg";
          if (mode === 5) this.pen[key] = x256(parts[++i] ?? 7);
          else if (mode === 2) this.pen[key] = `rgb(${parts[++i] ?? 0},${parts[++i] ?? 0},${parts[++i] ?? 0})`;
        }
        else if (n === 39) this.pen.fg = undefined;
        else if (n >= 40 && n <= 47) this.pen.bg = PAL[n - 40];
        else if (n === 49) this.pen.bg = undefined;
        else if (n >= 90 && n <= 97) this.pen.fg = PALB[n - 90];
        else if (n >= 100 && n <= 107) this.pen.bg = PALB[n - 100];
      }
    }
  }
}

export function buildPhantomApp(body: HTMLElement) {
  body.classList.add("os-term-body");
  body.classList.add("os-phantom");
  body.classList.add("os-guest");

  /* — the rail: the machine's lamp, its state in one word, the plate
       that says what the guest is and what its world lacks, power. — */
  const rail = el("div", "os-guest-rail");
  const lamp = el("span", "os-guest-lamp");
  lamp.dataset.state = "booting";
  const stateWord = el("span", "os-guest-state", "RAISING");
  const plate = el("span", "os-guest-plate", "GUEST phase1 7.0.1 · RUST · WASM32-WASIP1 · IMAGE 995,163 B · MEMORY VOLATILE · NETWORK: NONE — NO WIRE EXISTS IN ITS WORLD");
  const wakeBtn = el("button", "os-btn small", "wake");
  const haltBtn = el("button", "os-btn small", "halt");
  const copyBtn = el("button", "os-btn small", "copy");
  rail.append(lamp, stateWord, plate, wakeBtn, haltBtn, copyBtn);

  /* — the screen: the guest's display, framed like one. — */
  const screen = el("div", "os-guest-screen");
  const transcript = el("div", "os-term-out");
  const liveLine = el("pre", "os-term-text os-phantom-live");
  transcript.appendChild(liveLine);
  screen.append(transcript);

  /* — quick keys: real lines, sent for the operator. — */
  const keys = el("div", "os-guest-keys");
  const keyBtns: HTMLButtonElement[] = [];
  for (const [label, cmd] of [["boot ⏎", ""], ["help", "help"], ["ls /", "ls /"], ["ps", "ps"], ["plugins", "plugins"], ["uname", "uname"], ["exit", "exit"]] as Array<[string, string]>) {
    const b = el("button", "os-guest-key", label);
    b.addEventListener("click", () => sendLine(cmd));
    keys.append(b);
    keyBtns.push(b);
  }

  /* — the line. — */
  const line = el("div", "os-term-line os-guest-line");
  const prompt = el("span", "os-term-prompt", "phantom ›");
  const input = document.createElement("input");
  input.className = "os-term-input";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("aria-label", "phantom input — lines for the phantom");
  line.append(prompt, input);
  body.append(rail, screen, keys, line);

  type GuestState = "asleep" | "off" | "booting" | "menu" | "running" | "halted" | "fault";
  let state: GuestState = "booting";
  const setState = (st: GuestState, word: string) => {
    state = st;
    lamp.dataset.state = st;
    stateWord.textContent = word;
    const live = st === "menu" || st === "running";
    keyBtns.forEach((b) => { b.disabled = !live; });
    input.disabled = !(live || st === "booting");
    wakeBtn.disabled = live || st === "booting";
    haltBtn.disabled = !(live || st === "booting");
  };

  const paintSegs = (host: HTMLElement, segs: Seg[]) => {
    host.innerHTML = "";
    for (const seg of segs) {
      if (!seg.fg && !seg.bg && !seg.b && !seg.d) { host.appendChild(document.createTextNode(seg.t)); continue; }
      const sp = el("span", "");
      sp.textContent = seg.t;
      if (seg.fg) sp.style.color = seg.fg;
      if (seg.bg) sp.style.background = seg.bg;
      if (seg.b) sp.style.fontWeight = "700";
      if (seg.d) sp.style.opacity = "0.62";
      host.appendChild(sp);
    }
  };
  const print = (text: string, cls?: string) => {
    const pre = el("pre", "os-term-text" + (cls ? ` ${cls}` : ""), text);
    transcript.insertBefore(pre, liveLine.parentNode === transcript ? liveLine : null);
    if (liveLine.parentNode !== transcript) transcript.appendChild(liveLine);
    screen.scrollTop = screen.scrollHeight;
  };
  const printSegs = (segs: Seg[]) => {
    const pre = el("pre", "os-term-text");
    paintSegs(pre, segs);
    transcript.insertBefore(pre, liveLine.parentNode === transcript ? liveLine : null);
    if (liveLine.parentNode !== transcript) transcript.appendChild(liveLine);
    screen.scrollTop = screen.scrollHeight;
  };
  const renderer = new AnsiLines(
    (segs) => {
      printSegs(segs);
      const plain = segs.map((x) => x.t).join("");
      if (plain.includes("boot>")) setState("menu", "BOOT MENU");
      else if (plain.includes("phase1://")) setState("running", "RUNNING");
    },
    () => { transcript.querySelectorAll("pre:not(.os-phantom-live)").forEach((n) => n.remove()); },
  );
  const renderTail = () => {
    const tail = renderer.tail();
    paintSegs(liveLine, tail);
    screen.scrollTop = screen.scrollHeight;
    // the prompts are never committed lines — they live in the tail
    const plain = tail.map((x) => x.t).join("");
    if (plain.includes("boot>")) setState("menu", "BOOT MENU");
    else if (plain.includes("phase1://")) setState("running", "RUNNING");
  };

  copyBtn.addEventListener("click", () => {
    const text = [...transcript.querySelectorAll("pre")].map((c) => c.textContent || "").join("\n");
    void navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = "copied ✓"; setTimeout(() => (copyBtn.textContent = "copy"), 1400); });
  });

  let worker: Worker | null = null;
  let head: Int32Array | null = null;
  let ring: Uint8Array | null = null;
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

  const isolated = typeof SharedArrayBuffer !== "undefined" && !!(window as any).crossOriginIsolated;

  const boot = () => {
    const sab = new SharedArrayBuffer(64 + RING_CAP);
    head = new Int32Array(sab, 0, 4);
    ring = new Uint8Array(sab, 64, RING_CAP);
    worker = new Worker("/phantom/phantom-worker.js");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "out") {
        for (const chunk of m.batch) { renderer.feed(chunk.bytes); }
        renderTail();
      } else if (m.type === "exit") {
        setState("halted", "HALTED");
        print(`— phase1 shut down (exit ${m.code}). the room it lived in was volatile; wake raises a fresh one.`, "dim");
      } else if (m.type === "error") {
        setState("fault", "FAULTED");
        print(`— the phantom could not wake: ${m.message}`, "err");
      }
    };
    worker.onerror = (e) => { setState("fault", "FAULTED"); print(`— the phantom worker faulted: ${e.message || "no reason given"}. wake to try again.`, "err"); };
    setState("booting", "RAISING");
    print("— raising phantom — its boot menu takes an empty line for BOOT.", "dim");
    worker.postMessage({ type: "init", sab, wasmUrl: "/phantom/phantom.wasm", env: { COLUMNS: "100" } });
  };

  const powerOn = () => {
    if (worker) { worker.terminate(); worker = null; }
    transcript.querySelectorAll("pre:not(.os-phantom-live)").forEach((n) => n.remove());
    if (!isolated) {
      setState("asleep", "ASLEEP");
      print("— phantom needs a cross-origin-isolated room to block on stdin (SharedArrayBuffer). This browser or context refuses it, so the phantom sleeps.", "err");
      return;
    }
    boot();
  };
  const powerOff = () => {
    if (state === "menu" || state === "running") { sendLine("exit"); return; } // the guest halts itself, gracefully
    if (worker) { worker.terminate(); worker = null; }
    head = null; ring = null;
    setState("off", "OFFLINE");
    print("— power cut. the room it lived in was volatile; wake raises a fresh one.", "dim");
  };
  wakeBtn.addEventListener("click", powerOn);
  haltBtn.addEventListener("click", powerOff);

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = input.value;
    input.value = "";
    if (state === "menu" || state === "running" || state === "booting") sendLine(text);
  });

  powerOn();

  /* The window closing ends the phantom's world. */
  const watch = setInterval(() => {
    if (!body.isConnected) { clearInterval(watch); if (worker) worker.terminate(); }
  }, 1000);
}
