/* nocturn-gba — a Game Boy Advance bench for the desk.
 *
 * The machine is mGBA compiled to WebAssembly, vendored self-hosted
 * under /vendor/mgba (MPL-2.0; provenance, license and the BIOS story
 * ride in /vendor/mgba/NOTICE.md). No CDN is contacted, and the bench
 * itself makes no network calls: a ROM is read on this machine, run on
 * this machine, and kept in the core's own browser storage (IDBFS) —
 * the library, battery saves and save states persist across visits
 * for this origin, the way the other benches persist.
 *
 * BIOS, stated plainly: there is no BIOS file and none is needed.
 * mGBA runs on its built-in HLE BIOS, a clean-room reimplementation;
 * most software never notices, a few titles that lean on exact BIOS
 * behavior may run differently. That is the machine's honest shape.
 *
 * EMCON: an emulator is local compute — it touches no network and
 * speaks to no one — so, like the CHIP-8 console and the DOS machine,
 * it runs under every condition.
 *
 * House pattern follows the CHIP-8 console: a stage, a ROM select fed
 * by the file picker, drag-and-drop and the VFS, a status line, and a
 * MutationObserver that parks the machine when the window leaves the
 * desk. The core and its canvas are kept at module scope and re-homed
 * into each new window: one machine, many rooms. */

import type { BlacksiteOS } from "./os-shell";
import { skey } from "./os-depth";

const CORE_URL = "/vendor/mgba/mgba.js";
const LAST_KEY = skey("blacksite-gba-last-v1");
const DEMO_NAME = "nocturn-demo.gba";

/* The built-in demo cart — the house's own test ROM, written for this
 * bench the way CHIP8_DEMO was written for the console: hand-written
 * ARM assembly (mode 3), assembled with the Keystone engine, header
 * complement computed, 512 bytes once the zero tail is trimmed. It
 * paints a field that slowly cycles its color, a white bar, and a
 * white block the D-pad walks around; A floods the field green, B
 * red. One authoring note, learned on the bench: the pass is NOT
 * vblank-synced on purpose — phase-locking a full-screen redraw to
 * VCOUNT 160 races mGBA's scanline renderer and the furniture never
 * lands in a presented frame; free-running, it does. */
const GBA_DEMO = new Uint8Array([
  46, 0, 0, 234, 36, 255, 174, 81, 105, 154, 162, 33, 61, 132, 130, 10, 132, 228, 9, 173, 17, 36, 139, 152,
  192, 129, 127, 33, 163, 82, 190, 25, 147, 9, 206, 32, 16, 70, 74, 74, 248, 39, 49, 236, 88, 199, 232, 51,
  130, 227, 206, 191, 133, 244, 223, 148, 206, 75, 9, 193, 148, 86, 138, 192, 19, 114, 167, 252, 159, 132, 77, 115,
  163, 202, 154, 97, 88, 151, 163, 39, 252, 3, 152, 118, 35, 29, 199, 97, 3, 4, 174, 86, 191, 56, 132, 0,
  64, 167, 14, 253, 255, 82, 254, 3, 111, 149, 48, 241, 151, 251, 192, 133, 96, 214, 128, 37, 169, 99, 190, 3,
  1, 78, 56, 226, 249, 162, 52, 255, 187, 62, 3, 68, 120, 0, 144, 203, 136, 17, 58, 148, 101, 192, 124, 99,
  135, 240, 60, 175, 214, 37, 228, 139, 56, 10, 172, 114, 33, 212, 248, 7, 78, 79, 67, 84, 85, 82, 78, 84,
  69, 83, 84, 0, 78, 84, 83, 84, 48, 49, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 130, 0, 0,
  1, 3, 160, 227, 1, 27, 160, 227, 3, 16, 129, 226, 0, 16, 128, 229, 3, 4, 160, 227, 100, 16, 160, 227,
  0, 16, 128, 229, 0, 32, 160, 227, 1, 32, 130, 226, 1, 51, 160, 227, 19, 62, 131, 226, 176, 64, 211, 225,
  4, 64, 224, 225, 255, 80, 160, 227, 5, 64, 4, 224, 63, 80, 160, 227, 5, 64, 4, 224, 3, 4, 160, 227,
  0, 16, 144, 229, 16, 0, 20, 227, 3, 16, 129, 18, 32, 0, 20, 227, 3, 16, 65, 18, 196, 0, 81, 227,
  196, 16, 160, 195, 4, 0, 81, 227, 4, 16, 160, 179, 0, 16, 128, 229, 162, 177, 160, 225, 31, 176, 11, 226,
  34, 194, 160, 225, 31, 192, 12, 226, 140, 178, 139, 225, 34, 193, 160, 225, 31, 192, 12, 226, 12, 181, 139, 225,
  1, 0, 20, 227, 62, 190, 160, 19, 2, 0, 20, 227, 31, 176, 160, 19, 11, 120, 139, 225, 7, 128, 160, 225,
  7, 144, 160, 225, 7, 160, 160, 225, 6, 84, 160, 227, 75, 109, 160, 227, 128, 7, 165, 232, 1, 96, 86, 226,
  252, 255, 255, 26, 255, 128, 160, 227, 127, 140, 136, 227, 20, 96, 160, 227, 6, 84, 160, 225, 6, 82, 69, 224,
  20, 80, 133, 226, 6, 4, 160, 227, 133, 80, 128, 224, 200, 144, 160, 227, 178, 128, 197, 224, 1, 144, 89, 226,
  252, 255, 255, 26, 1, 96, 134, 226, 29, 0, 86, 227, 243, 255, 255, 26, 3, 4, 160, 227, 0, 16, 144, 229,
  75, 96, 160, 227, 6, 84, 160, 225, 6, 82, 69, 224, 1, 80, 133, 224, 6, 4, 160, 227, 133, 80, 128, 224,
  16, 144, 160, 227, 178, 128, 197, 224, 1, 144, 89, 226, 252, 255, 255, 26, 1, 96, 134, 226, 91, 0, 86, 227,
  243, 255, 255, 26, 183, 255, 255, 234,
]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* The core's own API (its full contract ships as mgba.d.ts in the
 * upstream package); typed here only where the bench leans on it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mgba = any;

let emu: Mgba | null = null;
let emuBooting: Promise<Mgba> | null = null;
let screen: HTMLCanvasElement | null = null;
let currentRom = "";
let powered = false;
let isPaused = false;

function getScreen(): HTMLCanvasElement {
  if (!screen) {
    screen = document.createElement("canvas");
    screen.width = 240;
    screen.height = 160;
    screen.className = "os-gba-screen";
    screen.tabIndex = 0;
  }
  return screen;
}

function bootCore(): Promise<Mgba> {
  if (emu) return Promise.resolve(emu);
  if (emuBooting) return emuBooting;
  emuBooting = (async () => {
    // The vendored core is a public asset, not a bundle module: load
    // it at runtime from its own subtree (its pthread worker spawns
    // from that same URL, which is why it must live same-origin).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* @vite-ignore */ CORE_URL);
    const Module: Mgba = await mod.default({ canvas: getScreen() });
    await Module.FSInit();
    // The advertised map, bound through the core's own contract:
    // arrows are the pad, X = A, Z = B, A = L, S = R, enter = start,
    // shift = select.
    Module.bindKey("Up", "Up"); Module.bindKey("Down", "Down");
    Module.bindKey("Left", "Left"); Module.bindKey("Right", "Right");
    Module.bindKey("X", "A"); Module.bindKey("Z", "B");
    Module.bindKey("A", "L"); Module.bindKey("S", "R");
    Module.bindKey("Return", "Start");
    Module.bindKey("Left Shift", "Select"); Module.bindKey("Right Shift", "Select");
    emu = Module;
    return Module;
  })();
  emuBooting.catch(() => { emuBooting = null; });
  return emuBooting;
}

const romNames = (m: Mgba): string[] =>
  (m.listRoms() as string[]).filter((n) => /\.(gba|agb)$/i.test(n));

export function buildNocturnGba(body: HTMLElement, os: BlacksiteOS) {
  const wrap = el("div", "os-gba");
  const bar = el("div", "os-files-bar");
  const fileBtn = el("button", "os-btn small", "load cart…");
  const fileIn = document.createElement("input");
  fileIn.type = "file";
  fileIn.accept = ".gba,.agb,.bin";
  fileIn.style.display = "none";
  const sel = document.createElement("select");
  sel.className = "os-bottle-select";
  const powerBtn = el("button", "os-btn small", "power");
  const resetBtn = el("button", "os-btn small", "reset");
  const pauseBtn = el("button", "os-btn small", "pause");
  const saveBtn = el("button", "os-btn small", "save state");
  const loadBtn = el("button", "os-btn small", "load state");
  const fullBtn = el("button", "os-btn small", "fullscreen");
  const notice = el("a", "os-btn small", "core & license");
  notice.setAttribute("href", "/vendor/mgba/NOTICE.md");
  notice.setAttribute("target", "_blank");
  notice.setAttribute("rel", "noreferrer");
  bar.append(fileBtn, fileIn, sel, powerBtn, resetBtn, pauseBtn, saveBtn, loadBtn, fullBtn, notice);
  const stage = el("div", "os-gba-stage");
  stage.appendChild(getScreen());
  const status = el("p", "os-note", "warming the core…");
  const keys = el("p", "os-note", "keys: arrows pad · X = A · Z = B · A = L · S = R · enter = start · shift = select. click the screen, then play. carts also drop onto the window, or ride from the vfs (files named .gba under /home).");
  const bios = el("p", "os-note", "core: mGBA wasm (MPL-2.0), vendored — no cart leaves this machine. BIOS: the core's built-in HLE BIOS; no BIOS file needed, and a few titles that lean on exact BIOS behavior may differ. library, battery saves and states persist in this browser.");

  // The touch pad: the house's coarse-pointer pattern, driving the
  // same button contract the keyboard map uses.
  const pad = el("div", "os-gba-pad");
  const padBtn = (label: string, name: string) => {
    const b = el("button", "os-gba-pad-btn", label);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (emu && powered) emu.buttonPress(name); });
    const release = () => { if (emu && powered) emu.buttonUnpress(name); };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("pointerleave", release);
    return b;
  };
  const dpad = el("div", "os-gba-dpad");
  dpad.append(padBtn("◀", "Left"), padBtn("▲", "Up"), padBtn("▼", "Down"), padBtn("▶", "Right"));
  const acts = el("div", "os-gba-acts");
  acts.append(padBtn("L", "L"), padBtn("B", "B"), padBtn("A", "A"), padBtn("R", "R"));
  const meta = el("div", "os-gba-meta");
  meta.append(padBtn("select", "Select"), padBtn("start", "Start"));
  pad.append(dpad, meta, acts);

  wrap.append(bar, stage, status, pad, keys, bios);
  body.appendChild(wrap);

  const setControls = (on: boolean) => {
    for (const c of [sel, powerBtn, resetBtn, pauseBtn, saveBtn, loadBtn]) c.toggleAttribute("disabled", !on);
  };
  setControls(false);

  const refreshLibrary = (m: Mgba) => {
    const keep = sel.value;
    sel.innerHTML = "";
    const lib = romNames(m);
    for (const n of lib) {
      const o = document.createElement("option");
      o.value = `lib:${n}`; o.textContent = n;
      sel.appendChild(o);
    }
    // VFS carts, the CHIP-8 console's habit: scanned from /home.
    const vfs: string[] = [];
    const scan = (dir: string) => {
      for (const n of os.list(dir)) {
        const p = (dir === "/" ? "" : dir) + "/" + n;
        if (os.isDir(p)) { if (!p.startsWith("/sys")) scan(p); }
        else if (/\.(gba|agb)$/i.test(n)) vfs.push(p);
      }
    };
    try { scan("/home"); } catch { /* a bare desk simply has none */ }
    for (const p of vfs) {
      const o = document.createElement("option");
      o.value = `vfs:${p}`; o.textContent = p;
      sel.appendChild(o);
    }
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
    else if (currentRom) {
      const mine = `lib:${currentRom}`;
      if ([...sel.options].some((o) => o.value === mine)) sel.value = mine;
    }
  };

  const play = (m: Mgba, name: string): boolean => {
    const path = `${m.filePaths().gamePath}/${name}`;
    let ok = false;
    try { ok = m.loadGame(path); } catch { ok = false; }
    if (ok) {
      currentRom = name; powered = true; isPaused = false;
      pauseBtn.textContent = "pause";
      status.textContent = name;
      try { localStorage.setItem(LAST_KEY, name); } catch { /* storage is a courtesy */ }
    } else {
      status.textContent = `${name} would not boot on this core.`;
    }
    return ok;
  };

  const ingest = async (m: Mgba, file: File) => {
    status.textContent = `reading ${file.name}…`;
    await new Promise<void>((resolve) => {
      try { m.uploadRom(file, () => resolve()); } catch { resolve(); }
    });
    try { await m.FSSync(); } catch { /* IDBFS keeps its own counsel */ }
    refreshLibrary(m);
    play(m, file.name);
  };

  let dead = false;
  const winEl = wrap.closest(".os-window");
  const focusObs = winEl ? new MutationObserver(() => {
    // The core hears the whole document's keys; the bench only lets
    // it listen while its own window holds the desk's focus.
    if (emu) emu.toggleInput(winEl.classList.contains("focused"));
  }) : null;
  if (winEl && focusObs) focusObs.observe(winEl, { attributes: true, attributeFilter: ["class"] });
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      dead = true;
      obs.disconnect();
      focusObs?.disconnect();
      if (emu && powered && !isPaused) { try { emu.pauseGame(); isPaused = true; } catch { /* parked either way */ } }
      if (emu) void Promise.resolve(emu.FSSync()).catch(() => undefined);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  fileBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", () => {
    const f = fileIn.files?.[0];
    fileIn.value = "";
    if (f && emu) void ingest(emu, f);
  });
  wrap.addEventListener("dragover", (e) => { e.preventDefault(); wrap.classList.add("os-gba-drop"); });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("os-gba-drop"));
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    wrap.classList.remove("os-gba-drop");
    const f = e.dataTransfer?.files?.[0];
    if (f && emu) void ingest(emu, f);
  });
  sel.addEventListener("change", () => {
    if (!emu) return;
    const v = sel.value;
    if (v.startsWith("lib:")) play(emu, v.slice(4));
    else if (v.startsWith("vfs:")) {
      const p = v.slice(4);
      const bytes = os.readBytes(p);
      if (!bytes) { status.textContent = `${p} could not be read.`; return; }
      const name = p.split("/").pop() || "cart.gba";
      try {
        emu.FS.writeFile(`${emu.filePaths().gamePath}/${name}`, bytes);
        void Promise.resolve(emu.FSSync()).catch(() => undefined);
        refreshLibrary(emu);
        play(emu, name);
      } catch { status.textContent = `${p} would not ride into the machine.`; }
    }
  });
  powerBtn.addEventListener("click", () => {
    if (!emu || !powered) return;
    try { emu.quitGame(); } catch { /* already dark */ }
    powered = false; currentRom = "";
    status.textContent = "powered off — pick a cart.";
  });
  resetBtn.addEventListener("click", () => { if (emu && powered) { try { emu.quickReload(); status.textContent = `${currentRom} — reset.`; } catch { /* no cart, no reset */ } } });
  pauseBtn.addEventListener("click", () => {
    if (!emu || !powered) return;
    try {
      if (isPaused) { emu.resumeGame(); isPaused = false; pauseBtn.textContent = "pause"; }
      else { emu.pauseGame(); isPaused = true; pauseBtn.textContent = "resume"; }
    } catch { /* the core shrugs; the button follows next click */ }
  });
  saveBtn.addEventListener("click", () => {
    if (!emu || !powered) return;
    try {
      if (emu.saveState(1)) { void Promise.resolve(emu.FSSync()).catch(() => undefined); status.textContent = "state saved (slot 1)."; }
      else status.textContent = "the core refused the state save.";
    } catch { status.textContent = "the core refused the state save."; }
  });
  loadBtn.addEventListener("click", () => {
    if (!emu || !powered) return;
    try { status.textContent = emu.loadState(1) ? "state loaded (slot 1)." : "no state in slot 1 yet."; }
    catch { status.textContent = "no state in slot 1 yet."; }
  });
  fullBtn.addEventListener("click", () => { void stage.requestFullscreen?.().catch(() => undefined); });
  getScreen().addEventListener("pointerdown", () => getScreen().focus());

  void bootCore().then((m) => {
    if (dead) return;
    setControls(true);
    const v = m.version ? `${m.version.projectName} ${m.version.projectVersion}` : "mGBA";
    refreshLibrary(m);
    if (emu) emu.toggleInput(winEl ? winEl.classList.contains("focused") : true);
    if (currentRom) {
      // A reopened window: the machine never stopped, it was parked —
      // the same cart is still in the slot, paused where it was left.
      pauseBtn.textContent = isPaused ? "resume" : "pause";
      status.textContent = `${currentRom} · core ${v}`;
      return;
    }
    // First run: last cart first, then any library cart, then the
    // built-in demo — written into the library on first run.
    let last = "";
    try { last = localStorage.getItem(LAST_KEY) || ""; } catch { last = ""; }
    const lib = romNames(m);
    let demoFresh = false;
    if (last && lib.includes(last)) play(m, last);
    else if (lib.length) play(m, lib[0]);
    else {
      try {
        m.FS.writeFile(`${m.filePaths().gamePath}/${DEMO_NAME}`, GBA_DEMO);
        void Promise.resolve(m.FSSync()).catch(() => undefined);
      } catch { /* the demo is a courtesy, not a promise */ }
      refreshLibrary(m);
      demoFresh = play(m, DEMO_NAME);
    }
    if (demoFresh) status.textContent = `${DEMO_NAME} — the built-in demo cart · core ${v}. drop a .gba anywhere on this window to play your own.`;
    else if (powered) status.textContent = `${currentRom} · core ${v}`;
  }).catch((err: Error) => {
    if (dead) return;
    status.textContent = self.crossOriginIsolated === false
      ? "the core needs a cross-origin-isolated page (COOP/COEP) and this one is not — the machine stays dark."
      : `the core would not start — ${err.message}`;
  });
}
