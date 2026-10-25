/* Wolfenstein 3D — the shareware episode, running in a DOS machine
 * in the room. The player is js-dos (DOSBox in WebAssembly, GPL-2.0),
 * vendored self-hosted under /wolf3d/ — no CDN is contacted. The game
 * data is the unaltered 1992 shareware distribution (episode 1, v1.4),
 * which its own license grants the right to copy and distribute; the
 * full story is in /wolf3d/NOTICE.txt.
 *
 * House pattern follows the CHIP-8 console: a stage, a status line,
 * and a MutationObserver that stops the machine when the window
 * leaves the desk.
 *
 * The room dresses the machine, never the game: a CRT treatment over
 * the stage (scanlines, grille, vignette — a toggle, remembered), a
 * pixel-crisp canvas, and a house score. The score is an original
 * composition in note data, played by a small FM synth (the AdLib's
 * own recipe: a modulator leaning on a carrier) through a master
 * chain. It sounds a sting when the machine is ready and loops an
 * exploration march — until the operator clicks into the screen,
 * when the room goes quiet and the game's own Bobby Prince score
 * (real AdLib, inside DOSBox) has the room. The operator can call
 * the house score back, in an explore or combat arrangement, from
 * the bar. Nothing here reaches inside the .jsdos bundle. */

import { skey } from "./os-depth";
import { soundPrefs } from "./os-sound";

declare global {
  interface Window { Dos?: (el: HTMLElement, opts: Record<string, unknown>) => { stop: () => Promise<void> } }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let playerLoading: Promise<void> | null = null;
function loadPlayer(): Promise<void> {
  if (window.Dos) return Promise.resolve();
  if (playerLoading) return playerLoading;
  playerLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-wolf-css]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/wolf3d/js-dos.css";
      css.dataset.wolfCss = "1";
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = "/wolf3d/js-dos.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("the js-dos player did not load"));
    document.head.appendChild(s);
  });
  return playerLoading;
}

/* ————————————————— the house score —————————————————
   Original composition, note data only. One 8-bar march in D minor;
   the combat arrangement is the same march driven harder: faster,
   the bass on driving eighths, an octave harmony under the lead,
   denser drums, a crash on the loop's head. Steps are 16ths;
   a bar is 16 steps; the loop is 128. Events are [step, midi, len]. */

const WOLF_PROG = [38, 38, 34, 33, 38, 38, -1, 38]; // per-bar bass roots; -1 = split bar (Bb then A)
const WOLF_LEAD: Array<[number, number, number]> = [
  // bar 1 (Dm)
  [0, 74, 3], [3, 72, 1], [4, 74, 4], [8, 77, 3], [11, 76, 1], [12, 74, 4],
  // bar 2 (Dm)
  [16, 69, 4], [20, 74, 2], [22, 72, 2], [24, 69, 4], [28, 65, 4],
  // bar 3 (Bb)
  [32, 70, 3], [35, 74, 1], [36, 77, 4], [40, 74, 3], [43, 70, 1], [44, 69, 4],
  // bar 4 (A)
  [48, 69, 3], [51, 68, 1], [52, 69, 4], [56, 73, 4], [60, 76, 4],
  // bar 5 (Dm)
  [64, 74, 3], [67, 72, 1], [68, 74, 4], [72, 81, 3], [75, 77, 1], [76, 76, 4],
  // bar 6 (Dm)
  [80, 77, 4], [84, 74, 2], [86, 69, 2], [88, 72, 4], [92, 74, 4],
  // bar 7 (Bb → A)
  [96, 70, 3], [99, 74, 1], [100, 77, 4], [104, 69, 4], [108, 73, 4],
  // bar 8 (Dm)
  [112, 74, 6], [118, 69, 2], [120, 65, 4], [124, 62, 4],
];
const WOLF_STING: Array<[number, number, number]> = [
  [0, 62, 4], [4, 65, 4], [8, 69, 4], [12, 74, 12],
];
const WOLF_DRUMS: Record<"explore" | "combat", Record<string, string>> = {
  explore: { kick: "x.......x.......", snare: "....x.......x...", hat: "..x...x...x...x." },
  combat: { kick: "x.....x.x.......", snare: "....x.......x..x", hat: "x.x.x.x.x.x.x.x." },
};
const WOLF_LOOP_STEPS = 128;

type ScoreMode = "off" | "explore" | "combat";

class WolfScore {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextAt = 0;
  mode: ScoreMode = "off";
  onMode: (m: ScoreMode) => void = () => undefined;

  private ensure(): boolean {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      // the master chain: score gain -> gentle lowpass -> destination
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = 0.4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(lp).connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }

  /** A two-operator FM voice — the AdLib recipe, honestly small. */
  private fm(freq: number, t: number, dur: number, ratio: number, index: number, peak: number) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const car = c.createOscillator(); car.type = "sine"; car.frequency.value = freq;
    const mod = c.createOscillator(); mod.type = "sine"; mod.frequency.value = freq * ratio;
    const mg = c.createGain();
    mg.gain.setValueAtTime(freq * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.35), t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(this.master);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  private noiseHit(t: number, dur: number, freq: number, peak: number) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = peak;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
  private static f(midi: number) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /** Schedule one 16th step of the current arrangement at time t. */
  private scheduleStep(step: number, t: number, stepDur: number, mode: "explore" | "combat") {
    const bar = Math.floor(step / 16), inBar = step % 16;
    const drums = WOLF_DRUMS[mode];
    if (drums.kick[inBar] === "x") this.noiseHit(t, 0.09, 150, 0.5);
    if (drums.kick[inBar] === "x") this.fm(58, t, 0.1, 1, 0.5, 0.30); // kick body under the thump
    if (drums.snare[inBar] === "x") this.noiseHit(t, 0.12, 1900, 0.20);
    if (drums.hat[inBar] === "x") this.noiseHit(t, 0.03, 6800, 0.07);
    if (mode === "combat" && step === 0) this.noiseHit(t, 0.5, 3200, 0.12); // crash on the loop head
    // bass: explore holds half-note roots; combat drives eighths, root/octave
    const root = WOLF_PROG[bar];
    const roots: Array<[number, number]> = root === -1 ? [[0, 34], [8, 33]] : [[0, root]];
    if (mode === "explore") {
      for (const [at, r] of roots) if (inBar === at) this.fm(WolfScore.f(r + 12), t, stepDur * 7, 1, 1.6, 0.30);
    } else if (inBar % 2 === 0) {
      const r = root === -1 ? (inBar < 8 ? 34 : 33) : root;
      const oct = inBar % 8 === 4 ? 12 : 0;
      this.fm(WolfScore.f(r + 12 + oct), t, stepDur * 1.8, 1, 1.6, 0.30);
    }
    // lead (+ octave-down harmony in combat; bars 5–8 climb an octave)
    for (const [at, midi, len] of WOLF_LEAD) {
      if (at !== step) continue;
      const lift = mode === "combat" && bar >= 4 ? 12 : 0;
      this.fm(WolfScore.f(midi + lift), t, stepDur * len * 0.92, 2, 2.6, 0.20);
      if (mode === "combat") this.fm(WolfScore.f(midi + lift - 12), t, stepDur * len * 0.92, 1, 2.0, 0.10);
    }
  }

  /** The title sting — one shot, ~3.5 s, over the ready machine. */
  sting() {
    if (!soundPrefs().enabled || !this.ensure() || !this.ctx || !this.master) return;
    const c = this.ctx;
    const t0 = c.currentTime + 0.03;
    this.master.gain.cancelScheduledValues(t0);
    this.master.gain.setTargetAtTime(0.5 * soundPrefs().volume + 0.12, t0, 0.03);
    const stepDur = 60 / 100 / 4;
    for (const [at, midi, len] of WOLF_STING) {
      this.fm(WolfScore.f(midi), t0 + at * stepDur, stepDur * len * 0.95, 2, 2.8, 0.22);
    }
    this.fm(WolfScore.f(38), t0, stepDur * 24, 1, 1.4, 0.28);
    this.noiseHit(t0 + 12 * stepDur, 0.3, 900, 0.10);
    // no master fade here: the notes decay on their own envelopes,
    // and the march that follows owns the master level.
  }

  setMode(mode: ScoreMode) {
    this.mode = mode;
    this.onMode(mode);
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (mode === "off") {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    if (!soundPrefs().enabled || !this.ensure() || !this.ctx || !this.master) { this.mode = "off"; this.onMode("off"); return; }
    const c = this.ctx;
    this.master.gain.setTargetAtTime(0.42 * soundPrefs().volume + 0.10, c.currentTime, 0.15);
    this.step = 0;
    this.nextAt = c.currentTime + 0.06;
    const bpm = mode === "explore" ? 100 : 132;
    const stepDur = 60 / bpm / 4;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextAt < this.ctx.currentTime + 0.14) {
        this.scheduleStep(this.step, this.nextAt, stepDur, mode);
        this.nextAt += stepDur;
        this.step = (this.step + 1) % WOLF_LOOP_STEPS;
      }
    }, 27);
  }
  stop() {
    this.setMode("off");
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null; this.master = null;
  }
}

const CRT_KEY = skey("wolf3d-crt-v1");
function crtWanted(): boolean {
  try { return localStorage.getItem(CRT_KEY) !== "off"; } catch { return true; }
}

export function buildWolf3d(body: HTMLElement) {
  const wrap = el("div", "os-wolf3d");
  // The CRT sheet does NOT live inside the stage: js-dos owns the
  // element it is handed, root and children, and sweeps foreign
  // nodes out of it as it mounts (proven in the drive rig — the
  // sheet vanished at mount, and a MutationObserver heal never
  // converged). The frame is ours; the stage fills it; the sheet
  // lies over the stage from inside the frame, untouchable.
  const frame = el("div", "os-wolf-frame");
  const stage = el("div", "os-wolf-stage");
  const crt = el("div", "os-wolf-crt");
  crt.setAttribute("aria-hidden", "true");
  if (!crtWanted()) crt.classList.add("off");
  frame.append(stage, crt);
  const status = el("p", "os-note", "loading…");
  const bar = el("div", "os-files-bar");
  const full = el("button", "os-btn small", "fullscreen");
  full.addEventListener("click", () => { void frame.requestFullscreen?.().catch(() => undefined); });
  const crtBtn = el("button", "os-btn small", crtWanted() ? "crt: on" : "crt: off");
  crtBtn.addEventListener("click", () => {
    const on = crt.classList.toggle("off") === false;
    crtBtn.textContent = on ? "crt: on" : "crt: off";
    try { localStorage.setItem(CRT_KEY, on ? "on" : "off"); } catch { /* private modes keep no notes */ }
  });
  const score = new WolfScore();
  const scoreBtn = el("button", "os-btn small", "score: explore");
  score.onMode = (m) => { scoreBtn.textContent = `score: ${m}`; };
  scoreBtn.addEventListener("click", () => {
    score.setMode(score.mode === "off" ? "explore" : score.mode === "explore" ? "combat" : "off");
  });
  const notice = el("a", "os-btn small", "license & notice");
  notice.setAttribute("href", "/wolf3d/NOTICE.txt");
  notice.setAttribute("target", "_blank");
  notice.setAttribute("rel", "noreferrer");
  bar.append(full, crtBtn, scoreBtn, notice);
  const keys = el("p", "os-note", "arrows move · ctrl fire · space open · alt strafe · shift run · 1–4 weapons");
  wrap.append(bar, frame, status, keys);
  body.appendChild(wrap);

  let dos: { stop: () => Promise<void> } | null = null;
  let dead = false;
  let greeted = false;
  // The score arms on the operator's first gesture inside this window
  // (browser law: no sound before a gesture). Once armed it stings;
  // the march starts when the machine is ready to play.
  let armed = false;
  const arm = () => {
    if (armed || dead) return;
    armed = true;
    if (greeted) { score.sting(); if (score.mode === "off") score.setMode("explore"); }
  };
  wrap.addEventListener("pointerdown", arm);
  wrap.addEventListener("keydown", arm);
  // Clicking into the screen hands the room to the game itself: the
  // house score fades and DOSBox's own music takes over.
  frame.addEventListener("pointerdown", () => {
    if (score.mode !== "off") { score.setMode("off"); status.textContent = "the machine has the room — its own music now. the score bar can call the house band back."; }
  });
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      dead = true;
      obs.disconnect();
      score.stop();
      if (dos) void dos.stop().catch(() => undefined);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  void loadPlayer().then(() => {
    if (dead) return;
    if (!window.Dos) { status.textContent = "the player loaded without its Dos — the machine stays dark."; return; }
    status.textContent = "click the screen to play.";
    greeted = true;
    if (armed) { score.sting(); if (score.mode === "off") score.setMode("explore"); }
    dos = window.Dos(stage, {
      url: "/wolf3d/wolf3d.jsdos",
      pathPrefix: "/wolf3d/emulators/",
      autoStart: true,
      noCloud: true,
      backend: "dosbox",
    });
  }).catch((err: Error) => {
    status.textContent = `the DOS machine would not start — ${err.message}`;
  });
}
