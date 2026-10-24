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

  const print = (text: string, cls?: string) => {
    const pre = el("pre", "os-term-text" + (cls ? ` ${cls}` : ""), text);
    transcript.insertBefore(pre, liveLine.parentNode === transcript ? liveLine : null);
    if (liveLine.parentNode !== transcript) transcript.appendChild(liveLine);
    screen.scrollTop = screen.scrollHeight;
  };
  const renderer = new AnsiLines(
    (l) => {
      print(l);
      if (l.includes("boot>")) setState("menu", "BOOT MENU");
      else if (l.includes("phase1://")) setState("running", "RUNNING");
    },
    () => { transcript.querySelectorAll("pre:not(.os-phantom-live)").forEach((n) => n.remove()); },
  );
  const renderTail = () => {
    const tail = renderer.tail();
    liveLine.textContent = tail;
    screen.scrollTop = screen.scrollHeight;
    // the prompts are never committed lines — they live in the tail
    if (tail.includes("boot>")) setState("menu", "BOOT MENU");
    else if (tail.includes("phase1://")) setState("running", "RUNNING");
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
