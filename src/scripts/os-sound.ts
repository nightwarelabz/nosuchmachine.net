/* ————————————————————————————————————————————————————————————————
   BLACKSITE OS — the sound engine.
   The room has a voice, and it is synthesized, not sampled: every
   sound is oscillators, filtered noise and envelopes composed here.
   There are no audio files in this house.
   Browsers forbid sound before a gesture, so the engine ARMS on the
   operator's first pointer or key press; before that it is silent
   rather than sorry. EMCON alpha is total silence — the engine
   refuses there too, because that is what alpha means.
   ———————————————————————————————————————————————————————————————— */

export type SfxName = "live" | "open" | "close" | "min" | "back" | "snap" | "send" | "err" | "deny" | "ping" | "aegis" | "beep" | "boot2" | "halt";

interface SoundPrefs { enabled: boolean; volume: number }
const KEY = "blacksite-sound-v1";

export function soundPrefs(): SoundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (p && typeof p.enabled === "boolean") return { enabled: p.enabled, volume: Math.min(1, Math.max(0, typeof p.volume === "number" ? p.volume : 0.5)) };
  } catch { /* a corrupt note is just the defaults */ }
  return { enabled: true, volume: 0.5 };
}
export function setSoundPrefs(patch: Partial<SoundPrefs>): SoundPrefs {
  const next = { ...soundPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private modes keep no notes */ }
  if (master && ctx) master.gain.setTargetAtTime(next.volume * 0.9, ctx.currentTime, 0.02);
  return next;
}

let gateFn: (() => boolean) | null = null; // true = total silence (EMCON alpha)
export function soundGate(fn: () => boolean) { gateFn = fn; }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let armed = false;

export function armAudio() {
  if (armed) return;
  armed = true;
  ensure();
}
function ensure(): AudioContext | null {
  if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return ctx; }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = soundPrefs().volume * 0.9;
    master.connect(ctx.destination);
    return ctx;
  } catch { return null; }
}

interface ToneOpts { type?: OscillatorType; at?: number; dur?: number; gain?: number; glide?: number }
function tone(freq: number, o: ToneOpts = {}) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.at || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.glide), t0 + (o.dur || 0.1));
  const peak = o.gain ?? 0.15;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.1));
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + (o.dur || 0.1) + 0.05);
}
function noise(o: { at?: number; dur?: number; gain?: number; freq?: number } = {}) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.at || 0);
  const dur = o.dur || 0.15;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = o.freq || 1800;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = o.gain ?? 0.06;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const RECIPES: Record<SfxName, () => void> = {
  live: () => { tone(196, { dur: 0.5, gain: 0.1 }); tone(294, { at: 0.09, dur: 0.5, gain: 0.1 }); tone(392, { at: 0.18, dur: 0.62, gain: 0.11 }); tone(587, { at: 0.27, dur: 0.55, gain: 0.06 }); noise({ at: 0.05, dur: 0.5, gain: 0.02, freq: 900 }); },
  open: () => { tone(660, { dur: 0.07, gain: 0.08 }); tone(990, { at: 0.03, dur: 0.06, gain: 0.04 }); },
  close: () => { tone(440, { dur: 0.08, gain: 0.07, glide: 320 }); },
  min: () => { tone(520, { dur: 0.11, gain: 0.07, glide: 240 }); },
  back: () => { tone(300, { dur: 0.09, gain: 0.07, glide: 460 }); },
  snap: () => { tone(1250, { dur: 0.03, gain: 0.05, type: "triangle" }); noise({ dur: 0.04, gain: 0.03, freq: 2600 }); },
  send: () => { tone(340, { dur: 0.07, gain: 0.06, glide: 240 }); },
  err: () => { tone(180, { dur: 0.09, gain: 0.06, type: "triangle" }); },
  deny: () => { tone(110, { dur: 0.13, gain: 0.14, type: "square" }); tone(98, { at: 0.1, dur: 0.16, gain: 0.12, type: "square" }); },
  ping: () => { tone(880, { dur: 0.08, gain: 0.07 }); tone(1318, { at: 0.07, dur: 0.12, gain: 0.06 }); },
  aegis: () => { tone(140, { dur: 0.18, gain: 0.13, type: "sawtooth" }); tone(140, { at: 0.22, dur: 0.18, gain: 0.13, type: "sawtooth" }); noise({ dur: 0.3, gain: 0.03, freq: 500 }); },
  beep: () => { tone(880, { dur: 0.06, gain: 0.06, type: "square" }); },
  boot2: () => { tone(660, { dur: 0.06, gain: 0.06, type: "square" }); tone(990, { at: 0.07, dur: 0.09, gain: 0.06, type: "square" }); },
  halt: () => { tone(520, { dur: 0.22, gain: 0.07, type: "square", glide: 196 }); },
};

const lastPlayed = new Map<SfxName, number>();
export function sfx(name: SfxName) {
  const prefs = soundPrefs();
  if (!prefs.enabled) return;
  if (gateFn && gateFn()) return; // total silence means total
  if (!armed) return; // no gesture yet — the browser's law, honored quietly
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < 90) return; // a chorus of one event is one sound
  lastPlayed.set(name, now);
  if (!ensure()) return;
  try { RECIPES[name](); } catch { /* a voice that cracks says nothing */ }
}
