/* Simulacrum — a fully procedurally generated artificial world.
 *
 * Nothing here is loaded, modelled, textured, or sampled: the
 * terrain, the sky and its weather, every tree, rock, crystal and
 * monolith is generated in code from a single seed, chunk by
 * chunk, endlessly around the walker — and the music is generated
 * from the same seed, so a world sounds like itself. WebGL renders
 * it; WebXR, where a browser offers it, puts the walker inside.
 * The seed is the world — same seed, same hills, same song,
 * forever (and per nest, like every Blacksite room's memory).
 *
 * v2, "the living world": a shader sky with procedural clouds,
 * a moon, and aurora at night; weather that turns (clear, mist,
 * rain, thunder); segmented water with shores, sun-glitter and
 * swimming; biomes; birds; drifting motes and fireflies; and a
 * full synthesized soundscape — generative score, wind, rain,
 * footsteps, crystal chimes — under the house's EMCON law.
 */

import { skey } from "./os-depth";
import { soundPrefs } from "./os-sound";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ---------------- deterministic noise ---------------- */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(private seed: number) {}
  private hash(ix: number, iz: number): number {
    let h = (ix * 374761393 + iz * 668265263 + this.seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  at(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = this.hash(ix, iz), b = this.hash(ix + 1, iz);
    const c = this.hash(ix, iz + 1), d = this.hash(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  fbm(x: number, z: number, oct: number): number {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * this.at(x * f, z * f); amp *= 0.5; f *= 2.03; }
    return v;
  }
}

/* ---------------- tiny mat4 ---------------- */

export type M4 = Float32Array;
export const m4 = {
  ident(): M4 { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  persp(fov: number, asp: number, near: number, far: number): M4 {
    const t = 1 / Math.tan(fov / 2), d = 1 / (near - far);
    return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) * d, -1, 0, 0, 2 * far * near * d, 0]);
  },
  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  trans(x: number, y: number, z: number): M4 {
    const m = m4.ident(); m[12] = x; m[13] = y; m[14] = z; return m;
  },
  rotX(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotY(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  },
  rotZ(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
};

/* ---------------- shaders ---------------- */

export const LIT_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aNor;
uniform mat4 uMVP; uniform mat4 uModel; uniform vec2 uCam;
varying vec3 vCol; varying vec3 vNor; varying float vDist;
void main() {
  vCol = aCol;
  vNor = mat3(uModel) * aNor;
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = distance(wp.xz, uCam);
}`;
export const LIT_FS = `
precision mediump float;
varying vec3 vCol; varying vec3 vNor; varying float vDist;
uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uTint;
void main() {
  vec3 n = normalize(vNor);
  float li = max(0.18, dot(n, normalize(uSun)));
  float hemi = 0.72 + 0.28 * n.y;
  vec3 c = vCol * li * hemi * uTint;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;
export const UNLIT_VS = `
attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uMVP; uniform vec3 uOrigin; uniform vec2 uCam;
varying vec3 vCol; varying float vDist;
void main() { vCol = aCol; gl_Position = uMVP * vec4(aPos, 1.0); vDist = distance(aPos.xz + uOrigin.xz, uCam); }`;
export const UNLIT_FS = `
precision mediump float;
varying vec3 vCol; varying float vDist;
uniform float uAlpha; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
void main() {
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(vCol, uFog, f), uAlpha);
}`;
export const SKY_VS = `
attribute vec3 aPos;
uniform mat4 uVP;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uVP * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
export const SKY_FS = `
precision mediump float;
varying vec3 vDir;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
uniform float uTime; uniform float uCover; uniform float uGloom; uniform float uFlash; uniform vec3 uMoonDir;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.13; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.12, 1.0);
  vec3 c = mix(uHor, uZen, pow(max(h, 0.0), 0.62));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 600.0) * 1.6 + pow(s, 18.0) * 0.28);
  float md = max(dot(d, normalize(uMoonDir)), 0.0);
  c += vec3(0.82, 0.88, 1.0) * (pow(md, 1400.0) * 1.1 + pow(md, 60.0) * 0.05) * uNight;
  if (uNight > 0.02 && d.y > 0.0) {
    vec2 sp = floor(d.xz / max(0.035, d.y) * 14.0);
    float st = step(0.9975, hash21(sp)) * uNight;
    c += vec3(st) * (0.55 + 0.45 * sin(uNight * 40.0 + hash21(sp + 7.0) * 20.0));
  }
  if (uNight > 0.25 && d.y > 0.03) {
    float band = exp(-pow((d.y - 0.40) * 3.1, 2.0));
    float curt = fbm2(vec2(d.x * 4.0 + uTime * 0.045, d.z * 2.0 - uTime * 0.02));
    float rays = 0.5 + 0.5 * sin(d.x * 22.0 + curt * 14.0 + uTime * 0.5);
    vec3 aur = mix(vec3(0.10, 0.95, 0.45), vec3(0.45, 0.25, 0.95), clamp(d.y * 1.6 - 0.15, 0.0, 1.0));
    c += aur * band * (0.25 + 0.75 * curt) * rays * (uNight - 0.2) * 0.55;
  }
  if (d.y > 0.015) {
    vec2 cuv = d.xz / (d.y + 0.22);
    float cl = fbm2(cuv * 1.15 + vec2(uTime * 0.006, uTime * 0.0016));
    float cov = smoothstep(1.05 - uCover, 1.30 - uCover, cl) * smoothstep(0.015, 0.14, d.y);
    float sunAmt = pow(s, 3.0);
    vec3 cloudCol = mix(vec3(0.34, 0.38, 0.46), vec3(1.03, 1.0, 0.97), clamp(0.35 + sunAmt + (1.0 - uGloom) * 0.3, 0.0, 1.0));
    cloudCol *= (1.0 - uGloom * 0.45);
    c = mix(c, cloudCol, cov * 0.88);
  }
  c += vec3(0.55, 0.62, 0.85) * uFlash * (0.25 + 0.75 * (1.0 - max(h, 0.0)));
  gl_FragColor = vec4(c, 1.0);
}`;
export const WATER_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aAux;
uniform mat4 uMVP; uniform vec2 uCam;
varying vec3 vCol; varying float vAlpha; varying vec3 vWorld; varying float vDist;
void main() {
  vCol = aCol; vAlpha = aAux.x;
  vWorld = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = distance(aPos.xz, uCam);
}`;
export const WATER_FS = `
precision mediump float;
varying vec3 vCol; varying float vAlpha; varying vec3 vWorld; varying float vDist;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uCamPos; uniform float uTime; uniform vec3 uHor;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uDay;
void main() {
  vec2 p = vWorld.xz;
  float w1 = sin(p.x * 0.55 + uTime * 1.1) + sin(p.y * 0.42 - uTime * 0.8);
  float w2 = sin((p.x + p.y) * 0.21 + uTime * 0.5);
  vec3 n = normalize(vec3(w1 * 0.06 + w2 * 0.03, 1.0, w1 * 0.04 - w2 * 0.05));
  vec3 view = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(view.y, 0.0), 2.0);
  vec3 c = mix(vCol, uHor, fres * 0.55);
  vec3 hv = normalize(normalize(uSun) + view);
  float spec = pow(max(dot(n, hv), 0.0), 140.0) * 1.4 * uDay;
  c += uSunCol * spec;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFog, f), vAlpha);
}`;
export const PTS_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uTime; uniform float uFall; uniform vec3 uCam; uniform vec3 uBox;
varying vec3 vCol; varying float vFade;
void main() {
  vCol = aCol;
  vec3 p = uCam + mod(aPos - uCam, uBox) - uBox * 0.5;
  if (uFall > 0.0) {
    float fall = mod(uCam.y + 20.0 - aPos.y + uTime * uFall, uBox.y);
    p.y = uCam.y + 20.0 - fall;
    p.x += fall * 0.22;
  }
  vec4 mv = uVP * vec4(p, 1.0);
  gl_Position = mv;
  float dist = max(1.0, -mv.z);
  gl_PointSize = clamp(aSize * (120.0 / dist), 1.0, 9.0);
  vFade = clamp(1.6 - dist / (uBox.x * 0.62), 0.0, 1.0);
}`;
export const PTS_FS = `
precision mediump float;
varying vec3 vCol; varying float vFade;
uniform float uAlpha;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.12, length(q));
  gl_FragColor = vec4(vCol, uAlpha * vFade * m);
}`;

/* ---------------- audio: the world's own voice ---------------- */

export class SimAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private gate = 1;
  private muted = false;
  private chordAt = 0;
  private chordIdx = 0;
  private pluckAt = 0;
  private started = false;
  private rnd: () => number;
  private chords: number[][] = [];
  private scale: number[] = [];
  private root = 110;

  constructor(seed: number) {
    this.rnd = mulberry32(seed ^ 0x51ab);
    const roots = [0, -4, 5, -2, 0, -4, -7, -2];
    const progLen = 4 + Math.floor(this.rnd() * 3);
    const start = Math.floor(this.rnd() * 4);
    for (let i = 0; i < progLen; i++) {
      const r = roots[(start + i) % roots.length];
      const minor = this.rnd() < 0.62;
      this.chords.push([r, r + (minor ? 3 : 4), r + 7, r + 14]);
    }
    this.scale = [0, 3, 5, 7, 10, 12, 15, 19];
    this.root = 110 * Math.pow(2, (Math.floor(this.rnd() * 5) - 2) / 12);
  }

  get live() { return this.started; }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6;
    this.muffle = c.createBiquadFilter();
    this.muffle.type = "lowpass"; this.muffle.frequency.value = 18000;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.muffle.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.muffle);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.8; this.ambBus.connect(this.muffle);
    const nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nbuf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; lp += 0.06 * (w - lp); nd[i] = lp * 2.4; }
    const wind = c.createBufferSource(); wind.buffer = nbuf; wind.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = "bandpass"; this.windFilter.frequency.value = 480; this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
    wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.ambBus);
    wind.start();
    const rain = c.createBufferSource(); rain.buffer = nbuf; rain.loop = true; rain.playbackRate.value = 1.7;
    const rf = c.createBiquadFilter(); rf.type = "highpass"; rf.frequency.value = 2400;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    rain.connect(rf); rf.connect(this.rainGain); this.rainGain.connect(this.ambBus);
    rain.start();
    this.chordAt = c.currentTime + 0.1;
    this.pluckAt = c.currentTime + 2.5;
    this.started = true;
    this.applyGain(0.8);
  }

  private applyGain(t = 0.2) {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.gate * soundPrefs().volume * 0.85;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, t);
  }
  setGate(g: number) { if (g !== this.gate) { this.gate = g; this.applyGain(0.4); } }
  setMuted(m: boolean) { this.muted = m; this.applyGain(0.1); }
  setUnderwater(u: boolean) {
    if (!this.ctx || !this.muffle) return;
    this.muffle.frequency.setTargetAtTime(u ? 640 : 18000, this.ctx.currentTime, 0.15);
  }
  setWeather(rainAmt: number, alt: number, t: number) {
    if (!this.ctx || !this.windGain || !this.rainGain || !this.windFilter) return;
    const ct = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.035 + Math.min(0.10, Math.max(0, alt) * 0.0022) + rainAmt * 0.03, ct, 0.6);
    this.windFilter.frequency.setTargetAtTime(420 + Math.sin(t * 0.23) * 130 + Math.sin(t * 0.071) * 90, ct, 0.8);
    this.rainGain.gain.setTargetAtTime(rainAmt * 0.11, ct, 0.8);
  }

  private tone(dest: AudioNode, freq: number, t0: number, dur: number, peak: number, type: OscillatorType = "sine", glideTo?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  tick(dayFrac: number) {
    if (!this.ctx || !this.musicBus) return;
    const c = this.ctx, now = c.currentTime;
    const dark = dayFrac < 0.25 || dayFrac > 0.8;
    if (now >= this.chordAt) {
      const chord = this.chords[this.chordIdx % this.chords.length];
      this.chordIdx++;
      const dur = 13;
      for (const semi of chord) {
        const f = this.root * Math.pow(2, semi / 12);
        this.tone(this.musicBus, f, now, dur, 0.028, "triangle");
        this.tone(this.musicBus, f * 1.003, now, dur, 0.02, "sine");
      }
      this.tone(this.musicBus, this.root * Math.pow(2, chord[0] / 12) / 2, now, dur, 0.035, "sine");
      this.chordAt = now + dur * 0.92;
    }
    if (now >= this.pluckAt) {
      if (this.rnd() < (dark ? 0.4 : 0.68)) {
        const chord = this.chords[(this.chordIdx + this.chords.length - 1) % this.chords.length];
        const base = chord[0];
        const note = this.scale[Math.floor(this.rnd() * this.scale.length)];
        const f = this.root * 2 * Math.pow(2, (base + note) / 12);
        this.tone(this.musicBus, f, now, 2.2, 0.045, "sine");
        this.tone(this.musicBus, f * 2, now, 2.2, 0.012, "sine");
      }
      this.pluckAt = now + 2.6 + this.rnd() * (dark ? 7 : 4.5);
    }
  }

  private noiseBurst(t0: number, dur: number, peak: number, freq: number, type: BiquadFilterType = "bandpass", q = 1) {
    if (!this.ctx || !this.ambBus) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(this.ambBus);
    src.start(t0);
  }
  footstep(surface: string) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (surface === "water") this.noiseBurst(t, 0.16, 0.10, 900, "bandpass", 0.8);
    else if (surface === "rock" || surface === "snow") this.noiseBurst(t, 0.07, 0.07, surface === "rock" ? 2100 : 700, "bandpass", 1.2);
    else this.noiseBurst(t, 0.09, 0.05, 480, "lowpass");
  }
  splash(big = false) { if (this.ctx) this.noiseBurst(this.ctx.currentTime, big ? 0.5 : 0.3, 0.16, 1100, "bandpass", 0.6); }
  thud(v: number) { if (this.ctx && this.ambBus) { this.tone(this.ambBus, 68, this.ctx.currentTime, 0.22, Math.min(0.3, 0.08 + v * 0.02), "sine", 40); this.noiseBurst(this.ctx.currentTime, 0.1, 0.06, 300, "lowpass"); } }
  chime(pitchSeed: number) {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const semis = [0, 7, 12, 16, 19, 24];
    const f = 660 * Math.pow(2, semis[Math.abs(pitchSeed) % semis.length] / 12);
    this.tone(this.musicBus, f, t, 2.6, 0.05, "sine");
    this.tone(this.musicBus, f * 2.76, t, 1.4, 0.016, "sine");
    this.tone(this.musicBus, f * 5.4, t, 0.7, 0.008, "sine");
  }
  chirp() {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const f = 2400 + this.rnd() * 1400;
    this.tone(this.musicBus, f, t, 0.09, 0.02, "sine", f * 1.3);
    this.tone(this.musicBus, f * 1.1, t + 0.13, 0.07, 0.016, "sine", f * 1.45);
  }
  thunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 1.6, 0.30, 120, "lowpass");
    this.noiseBurst(t + 0.08, 2.4, 0.18, 70, "lowpass");
  }
  ui(kind: "take" | "world" | "toggle") {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    if (kind === "take") this.tone(this.musicBus, 520, t, 0.3, 0.05, "sine", 780);
    if (kind === "toggle") this.tone(this.musicBus, 840, t, 0.12, 0.04, "sine");
    if (kind === "world") for (let i = 0; i < 4; i++) this.tone(this.musicBus, this.root * Math.pow(2, this.scale[i] / 12) * 2, t + i * 0.09, 1.4, 0.05, "sine");
  }
  dispose() {
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.started = false;
  }
}

/* ---------------- the world ---------------- */

const CHUNK = 48, STEP = 2, RADIUS = 3;

interface Mesh { buf: WebGLBuffer; n: number }
interface XRSessionLike {
  requestReferenceSpace(t: string): Promise<unknown>;
  addEventListener(t: string, f: () => void): void;
  requestAnimationFrame(f: (t: number, fr: XRFrameLike) => void): void;
  renderState: { baseLayer: unknown };
  updateRenderState(s: object): Promise<void>;
}
interface XRFrameLike {
  getViewerPose(ref: unknown): { views: Array<{ projectionMatrix: Float32Array; transform: { inverse: { matrix: Float32Array } } }> } | null;
}
declare const XRWebGLLayer: new (s: XRSessionLike, gl: WebGLRenderingContext) => {
  framebuffer: WebGLFramebuffer | null;
  getViewport(v: unknown): { x: number; y: number; width: number; height: number } | null;
};

type Weather = "clear" | "mist" | "rain";

export function buildSimulacrum(body: HTMLElement) {
  const wrap = el("div", "os-sim");
  const canvas = document.createElement("canvas");
  canvas.className = "os-sim-canvas";
  canvas.width = 1024; canvas.height = 640;
  const shade = el("div", "os-sim-shade");
  const uw = el("div", "os-sim-uw");
  const stage = el("div", "os-sim-stage");
  stage.append(canvas, shade, uw);
  const hud = el("div", "os-sim-hud");
  const seedLabel = el("span", "os-note", "");
  const newBtn = el("button", "os-btn", "new world");
  const flyBtn = el("button", "os-btn", "walk");
  const wxBtn = el("button", "os-btn", "weather");
  const hourBtn = el("button", "os-btn", "skip hour");
  const sndBtn = el("button", "os-btn", "sound: on");
  const xrBtn = el("button", "os-btn", "enter VR");
  const posLabel = el("span", "os-note", "");
  hud.append(seedLabel, newBtn, flyBtn, wxBtn, hourBtn, sndBtn, xrBtn, posLabel);
  const hint = el("p", "os-note", "click the world to take it — WASD + mouse · F flies (space/C rise & sink) · shift is swift · T skips an hour · the world sings its own seed");
  wrap.append(stage, hud, hint);
  body.appendChild(wrap);

  const gl = canvas.getContext("webgl", { antialias: true }) as WebGLRenderingContext | null;
  if (!gl) { hint.textContent = "WebGL is not available in this browser — the simulacrum cannot form."; return; }

  const program = (vs: string, fs: string) => {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    return pr;
  };
  const litPr = program(LIT_VS, LIT_FS);
  const unlitPr = program(UNLIT_VS, UNLIT_FS);
  const skyPr = program(SKY_VS, SKY_FS);
  const waterPr = program(WATER_VS, WATER_FS);
  const ptsPr = program(PTS_VS, PTS_FS);

  const makeMesh = (verts: Float32Array, dynamic = false): Mesh => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return { buf, n: verts.length / 9 };
  };
  const bindLit = (mesh: Mesh, model: M4) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const aPos = gl.getAttribLocation(litPr, "aPos");
    const aCol = gl.getAttribLocation(litPr, "aCol");
    const aNor = gl.getAttribLocation(litPr, "aNor");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 36, 24);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uModel"), false, model);
  };
  const bindUnlit = (mesh: Mesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const aPos = gl.getAttribLocation(unlitPr, "aPos");
    const aCol = gl.getAttribLocation(unlitPr, "aCol");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
  };

  /* ---- world state ---- */
  let seed = Number(localStorage.getItem(skey("simulacrum-seed")) || "0") || 20261024;
  let noise = new Noise(seed);
  let moistNoise = new Noise(seed ^ 0x5eed);
  let detailNoise = new Noise(seed ^ 0xd37a);
  const height = (x: number, z: number): number => {
    const hills = noise.fbm(x * 0.012 + 31, z * 0.012 + 7, 4);
    const ridge = 1 - Math.abs(noise.fbm(x * 0.004 + 3, z * 0.004 + 19, 3) * 2 - 1);
    return -3.5 + hills * 13 + Math.pow(ridge, 3) * 15;
  };
  const moisture = (x: number, z: number) => moistNoise.fbm(x * 0.008 + 99, z * 0.008 + 3, 3);
  seedLabel.textContent = `seed ${seed}`;
  let audio = new SimAudio(seed);

  interface Chunk { key: string; terrain: Mesh; lit: Mesh | null; glow: Mesh | null; crystals: Array<[number, number]> }
  const chunks = new Map<string, Chunk>();
  const keyOf = (cx: number, cz: number) => `${cx},${cz}`;

  const palette = (x: number, z: number, h: number, slope: number): [number, number, number] => {
    const m = moisture(x, z);
    const spk = 0.92 + 0.16 * detailNoise.at(x * 1.7, z * 1.7);
    let c: [number, number, number];
    if (h < -0.4) { const d = Math.min(1, -h / 7); c = [0.55 - d * 0.3, 0.50 - d * 0.22, 0.34 - d * 0.1]; }
    else if (h < 0.7) c = [0.80, 0.70, 0.47];
    else if (slope > 0.55) c = [0.40, 0.37, 0.42];
    else if (h > 14.5 && slope < 0.5) c = [0.90, 0.93, 0.97];
    else if (h > 10) c = [0.45, 0.42, 0.46];
    else {
      const dry: [number, number, number] = [0.44, 0.38, 0.20];
      const lush: [number, number, number] = [0.15, 0.36, 0.18];
      const k = Math.max(0, Math.min(1, (m - 0.28) * 2.6));
      c = [dry[0] + (lush[0] - dry[0]) * k, dry[1] + (lush[1] - dry[1]) * k, dry[2] + (lush[2] - dry[2]) * k];
    }
    return [c[0] * spk, c[1] * spk, c[2] * spk];
  };

  const buildChunk = (cx: number, cz: number): Chunk => {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const seg = CHUNK / STEP;
    const tv: number[] = [];
    const vert = (x: number, z: number): number[] => {
      const h = height(x, z);
      const e = 1.4;
      const hx = height(x + e, z) - height(x - e, z);
      const hz = height(x, z + e) - height(x, z - e);
      let nx = -hx / (2 * e), nz = -hz / (2 * e), ny = 1;
      const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const col = palette(x, z, h, 1 - ny);
      return [x, h, z, ...col, nx, ny, nz];
    };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const x = x0 + i * STEP, z = z0 + j * STEP;
      const v00 = vert(x, z), v10 = vert(x + STEP, z), v01 = vert(x, z + STEP), v11 = vert(x + STEP, z + STEP);
      tv.push(...v00, ...v01, ...v10, ...v10, ...v01, ...v11);
    }
    const rnd = mulberry32(seed ^ (cx * 7919) ^ (cz * 104729));
    const lit: number[] = [], glow: number[] = [];
    const crystals: Array<[number, number]> = [];
    const box = (arr: number[], cxp: number, cyp: number, czp: number, sx: number, sy: number, sz: number, col: [number, number, number]) => {
      const x1 = cxp - sx / 2, x2 = cxp + sx / 2, y1 = cyp, y2 = cyp + sy, z1 = czp - sz / 2, z2 = czp + sz / 2;
      const F: Array<[number[], number[]]> = [
        [[x1, y1, z2, x2, y1, z2, x2, y2, z2], [0, 0, 1]], [[x1, y1, z1, x2, y2, z1, x2, y1, z1], [0, 0, -1]],
        [[x2, y1, z2, x2, y1, z1, x2, y2, z1], [1, 0, 0]], [[x1, y1, z1, x1, y1, z2, x1, y2, z2], [-1, 0, 0]],
        [[x1, y2, z2, x2, y2, z2, x2, y2, z1], [0, 1, 0]],
      ];
      for (const [tri, n] of F) for (let k = 0; k < 9; k += 3) arr.push(tri[k], tri[k + 1], tri[k + 2], ...col, ...n);
    };
    const cone = (arr: number[], cxp: number, cyp: number, czp: number, r: number, hgt: number, col: [number, number, number], sides = 6) => {
      for (let k = 0; k < sides; k++) {
        const a1 = (k / sides) * Math.PI * 2, a2 = ((k + 1) / sides) * Math.PI * 2;
        arr.push(cxp + Math.cos(a1) * r, cyp, czp + Math.sin(a1) * r, ...col, 0, 0.6, 0);
        arr.push(cxp + Math.cos(a2) * r, cyp, czp + Math.sin(a2) * r, ...col, 0, 0.6, 0);
        arr.push(cxp, cyp + hgt, czp, ...col, 0, 1, 0);
      }
    };
    const slopeAt = (x: number, z: number) => {
      const e = 1.4;
      return 1 - 1 / Math.hypot((height(x + e, z) - height(x - e, z)) / (2 * e), 1, (height(x, z + e) - height(x, z - e)) / (2 * e));
    };
    for (let t = 0; t < 30; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.9) continue;
      const sl = slopeAt(x, z);
      const roll = rnd();
      const moist = moisture(x, z);
      if (sl < 0.34 && roll < 0.52) {
        const s = 0.8 + rnd() * 0.9;
        box(lit, x, h - 0.1, z, 0.32 * s, 1.6 * s, 0.32 * s, [0.36, 0.25, 0.16]);
        if (moist > 0.52 && rnd() < 0.4) {
          const g: [number, number, number] = [0.20 + rnd() * 0.12, 0.42 + rnd() * 0.16, 0.16];
          cone(lit, x, h + 1.2 * s, z, 1.9 * s, 1.5 * s, g, 7);
          cone(lit, x, h + 2.0 * s, z, 1.3 * s, 1.2 * s, g, 7);
        } else {
          const g: [number, number, number] = [0.13 + rnd() * 0.1, 0.34 + rnd() * 0.2, 0.18];
          cone(lit, x, h + 1.3 * s, z, 1.5 * s, 2.6 * s, g);
          cone(lit, x, h + 2.6 * s, z, 1.05 * s, 2.0 * s, g);
        }
      } else if (roll < 0.80) {
        const s = 0.5 + rnd() * 1.3;
        box(lit, x, h - 0.2, z, s, s * 0.8, s, [0.42, 0.40, 0.45]);
      } else if (roll < 0.93) {
        const s = 0.7 + rnd() * 0.8;
        cone(glow, x, h - 0.1, z, 0.55 * s, 2.6 * s, [0.62, 0.36, 1.0]);
        cone(glow, x + 0.7 * s, h - 0.1, z + 0.3 * s, 0.34 * s, 1.5 * s, [0.45, 0.75, 1.0]);
        crystals.push([x, z]);
      } else if (sl < 0.3) {
        /* the artifact: a black monolith, rare and unexplained */
        box(lit, x, h - 0.3, z, 1.3, 6 + rnd() * 5, 1.3, [0.015, 0.015, 0.02]);
      }
    }
    /* grass + flowers */
    for (let t = 0; t < 14; t++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = height(x, z);
      if (h < 0.8 || h > 10 || slopeAt(x, z) > 0.3) continue;
      if (rnd() < 0.62) {
        for (let b = 0; b < 3; b++) cone(lit, x + (rnd() - 0.5) * 0.5, h - 0.03, z + (rnd() - 0.5) * 0.5, 0.16, 0.55 + rnd() * 0.3, [0.25, 0.5, 0.2], 4);
      } else {
        const petals: Array<[number, number, number]> = [[0.95, 0.45, 0.65], [0.98, 0.85, 0.35], [0.7, 0.55, 1.0], [0.95, 0.95, 0.95]];
        cone(glow, x, h + 0.18, z, 0.14, 0.3, petals[Math.floor(rnd() * petals.length)], 5);
        cone(lit, x, h - 0.02, z, 0.05, 0.24, [0.2, 0.4, 0.16], 4);
      }
    }
    return {
      key: keyOf(cx, cz),
      terrain: makeMesh(new Float32Array(tv)),
      lit: lit.length ? makeMesh(new Float32Array(lit)) : null,
      glow: glow.length ? makeMesh(new Float32Array(glow)) : null,
      crystals,
    };
  };

  /* sky dome */
  const skyMesh = (() => {
    const v: number[] = [];
    const seg = 20;
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg / 2; j++) {
      const p = (a: number, b: number): number[] => {
        const th = (a / seg) * Math.PI * 2, ph = (b / (seg / 2)) * Math.PI;
        return [Math.cos(th) * Math.sin(ph) * 900, Math.cos(ph) * 900, Math.sin(th) * Math.sin(ph) * 900, 0, 0, 0, 0, 0, 0];
      };
      const a = p(i, j), b = p(i + 1, j), c = p(i, j + 1), d = p(i + 1, j + 1);
      v.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    return makeMesh(new Float32Array(v));
  })();

  /* water: a segmented sheet that follows the walker, tinted by depth */
  const WSEG = 56, WSIZE = 448;
  let waterMesh: Mesh | null = null;
  let waterCell: [number, number] = [1e9, 1e9];
  const buildWater = (px: number, pz: number) => {
    const cell = WSIZE / WSEG;
    const cx = Math.round(px / cell) * cell, cz = Math.round(pz / cell) * cell;
    if (waterCell[0] === cx && waterCell[1] === cz && waterMesh) return;
    waterCell = [cx, cz];
    const v: number[] = [];
    const gv = (gx: number, gz: number): number[] => {
      const x = cx - WSIZE / 2 + gx * cell, z = cz - WSIZE / 2 + gz * cell;
      const depth = Math.max(0, -height(x, z));
      const k = Math.min(1, depth / 8);
      const col: [number, number, number] = [0.22 - k * 0.17, 0.48 - k * 0.3, 0.55 - k * 0.2];
      const alpha = height(x, z) > 0.15 ? 0 : Math.min(0.88, 0.30 + depth * 0.14);
      return [x, 0, z, ...col, alpha, 0, 0, 0, 0];
    };
    for (let i = 0; i < WSEG; i++) for (let j = 0; j < WSEG; j++) {
      const a = gv(i, j), b = gv(i + 1, j), c = gv(i, j + 1), d = gv(i + 1, j + 1);
      v.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    if (waterMesh) gl.deleteBuffer(waterMesh.buf);
    waterMesh = makeMesh(new Float32Array(v));
  };

  /* points: motes (day pollen / night fireflies) + rain */
  const makePoints = (count: number, box: [number, number, number], col: [number, number, number], size: [number, number], seedN: number) => {
    const rnd = mulberry32(seedN);
    const v = new Float32Array(count * 7);
    for (let i = 0; i < count; i++) {
      v[i * 7] = rnd() * box[0]; v[i * 7 + 1] = rnd() * box[1]; v[i * 7 + 2] = rnd() * box[2];
      v[i * 7 + 3] = col[0]; v[i * 7 + 4] = col[1]; v[i * 7 + 5] = col[2];
      v[i * 7 + 6] = size[0] + rnd() * (size[1] - size[0]);
    }
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    return { buf, n: count };
  };
  let motes = makePoints(220, [60, 24, 60], [0.85, 0.95, 0.60], [1.6, 3.2], seed ^ 0x9e37 & 0xffffff);
  let rainPts = makePoints(420, [70, 44, 70], [0.65, 0.75, 0.95], [1.2, 1.8], seed ^ 0x7a11 & 0xffffff);
  const bindPoints = (pts: { buf: WebGLBuffer }) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, pts.buf);
    const aPos = gl.getAttribLocation(ptsPr, "aPos");
    const aCol = gl.getAttribLocation(ptsPr, "aCol");
    const aSize = gl.getAttribLocation(ptsPr, "aSize");
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 24);
  };

  /* birds: dark wings on seeded circles */
  const BIRDS = 8;
  const birdBuf = gl.createBuffer()!;
  const birdRnd = mulberry32(seed ^ 0xb12d);
  const birds = Array.from({ length: BIRDS }, (_, i) => ({
    r: 46 + birdRnd() * 55, h: 20 + birdRnd() * 10, sp: (0.05 + birdRnd() * 0.05) * (birdRnd() < 0.5 ? 1 : -1),
    ph: birdRnd() * Math.PI * 2, ox: (birdRnd() - 0.5) * 60, oz: (birdRnd() - 0.5) * 60, size: 0.8 + birdRnd() * 0.7, idx: i,
  }));

  /* ---- walker + weather state ---- */
  let px = 8, pz = 8, py = height(8, 8) + 26;
  let yaw = 0.7, pitch = -0.16, flying = false, vy = 0;
  let vx = 0, vz = 0, bobPhase = 0, bobAmp = 0, landDip = 0, wasGrounded = true, wasInWater = false;
  let keys = new Set<string>();
  let locked = false, touched = false, muted = false;
  let dayT = 0.32;
  let weather: Weather = "clear";
  let mistAmt = 0, rainAmt = 0, flash = 0;
  let wxNext = 55, wxClock = 0;
  const wxRnd = mulberry32(seed ^ 0x3f5 & 0xffffff);
  const spawn = () => { px = 8; pz = 8; py = height(px, pz) + 26; yaw = 0.7; pitch = -0.16; vx = 0; vz = 0; vy = 0; };
  spawn();

  canvas.addEventListener("click", () => {
    touched = true;
    if (!audio.live) { audio.start(); audio.ui("take"); }
    if (!locked && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    yaw -= e.movementX * 0.0024;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0024));
  });
  const kd = (e: KeyboardEvent) => {
    if (!body.isConnected) return;
    if (locked || touched) keys.add(e.code);
    if ((locked || touched) && e.code === "KeyF") { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; audio.ui("toggle"); if (!flying) py = Math.max(py, height(px, pz) + 1.7); }
    if ((locked || touched) && e.code === "KeyT") { dayT = (dayT + 1 / 24) % 1; audio.ui("toggle"); }
  };
  const ku = (e: KeyboardEvent) => keys.delete(e.code);
  document.addEventListener("keydown", kd);
  document.addEventListener("keyup", ku);
  flyBtn.addEventListener("click", () => { flying = !flying; flyBtn.textContent = flying ? "fly" : "walk"; audio.ui("toggle"); if (!flying) py = Math.max(py, height(px, pz) + 1.7); });
  wxBtn.addEventListener("click", () => {
    weather = weather === "clear" ? "mist" : weather === "mist" ? "rain" : "clear";
    wxClock = 0; wxNext = 70;
    audio.ui("toggle");
  });
  hourBtn.addEventListener("click", () => { dayT = (dayT + 1 / 24) % 1; audio.ui("toggle"); });
  sndBtn.addEventListener("click", () => {
    if (!audio.live) audio.start();
    muted = !muted;
    audio.setMuted(muted);
    sndBtn.textContent = muted ? "sound: off" : "sound: on";
  });
  newBtn.addEventListener("click", () => {
    seed = Math.floor(Math.random() * 89999999) + 10000000;
    localStorage.setItem(skey("simulacrum-seed"), String(seed));
    noise = new Noise(seed);
    moistNoise = new Noise(seed ^ 0x5eed);
    detailNoise = new Noise(seed ^ 0xd37a);
    for (const ch of chunks.values()) { gl.deleteBuffer(ch.terrain.buf); if (ch.lit) gl.deleteBuffer(ch.lit.buf); if (ch.glow) gl.deleteBuffer(ch.glow.buf); }
    chunks.clear();
    waterCell = [1e9, 1e9];
    audio.dispose();
    audio = new SimAudio(seed);
    if (touched) { audio.start(); audio.ui("world"); }
    motes = makePoints(220, [60, 24, 60], [0.85, 0.95, 0.60], [1.6, 3.2], seed ^ 0x9e37 & 0xffffff);
    rainPts = makePoints(420, [70, 44, 70], [0.65, 0.75, 0.95], [1.2, 1.8], seed ^ 0x7a11 & 0xffffff);
    seedLabel.textContent = `seed ${seed}`;
    spawn();
  });

  let lastTouch: { x: number; y: number } | null = null;
  canvas.addEventListener("touchstart", (e) => { touched = true; if (!audio.live) audio.start(); lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!lastTouch) return;
    const t = e.touches[0];
    yaw -= (t.clientX - lastTouch.x) * 0.005;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - (t.clientY - lastTouch.y) * 0.005));
    lastTouch = { x: t.clientX, y: t.clientY };
    keys.add("KeyW");
  }, { passive: true });
  canvas.addEventListener("touchend", () => { lastTouch = null; keys.delete("KeyW"); });

  /* WebXR door */
  const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean>; requestSession(m: string, o: object): Promise<XRSessionLike> } }).xr;
  let xrSession: XRSessionLike | null = null;
  let xrRef: unknown = null;
  if (xr) {
    xr.isSessionSupported("immersive-vr").then((ok) => { if (!ok) xrBtn.style.display = "none"; }).catch(() => { xrBtn.style.display = "none"; });
  } else xrBtn.style.display = "none";
  xrBtn.addEventListener("click", async () => {
    if (!xr) return;
    try {
      xrSession = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"] });
      await xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      xrSession.requestReferenceSpace("local-floor").then((space) => { xrRef = space; });
      xrSession.addEventListener("end", () => { xrSession = null; });
    } catch { hint.textContent = "VR refused here — the flat world still walks."; }
  });

  /* ---- per-frame helpers ---- */
  const sunDir = (t: number): [number, number, number] => {
    const a = (t - 0.25) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a), 0.35];
  };
  const skyColors = (t: number, gloom: number): { zen: number[]; hor: number[]; sun: number[]; fog: number[]; night: number } => {
    const s = sunDir(t), day = Math.max(0, Math.min(1, s[1] * 2.4 + 0.35));
    const dusk = Math.max(0, 1 - Math.abs(s[1]) * 3.2);
    const mixc = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
    let zen = mixc([0.012, 0.02, 0.06], [0.19, 0.38, 0.72], day);
    let hor = mixc([0.05, 0.05, 0.10], [0.62, 0.74, 0.86], day);
    hor = mixc(hor, [0.98, 0.52, 0.28], dusk * 0.65);
    zen = mixc(zen, [0.30, 0.22, 0.42], dusk * 0.4);
    zen = mixc(zen, [0.16, 0.19, 0.24], gloom * 0.5);
    hor = mixc(hor, [0.36, 0.40, 0.45], gloom * 0.55);
    return { zen, hor, sun: [1.0, 0.85 - dusk * 0.25, 0.6 - dusk * 0.3], fog: hor, night: 1 - day };
  };
  const biomeAt = (x: number, z: number): string => {
    const h = height(x, z), m = moisture(x, z);
    if (h < -1.2) return "the deep";
    if (h < 0.6) return "the shore";
    if (h > 14.5) return "the snowfields";
    if (h > 10) return "the high pines";
    if (m > 0.58) return "the wet wilds";
    if (m < 0.30) return "the dry grass";
    return "the grasslands";
  };
  const surfaceAt = (x: number, z: number): string => {
    const h = height(x, z);
    if (h < 0.4) return "water";
    if (h > 14.5) return "snow";
    return "grass";
  };

  let fogNear = 55, fogFar = 300;
  let lastChime = new Map<string, number>();
  let frames = 0;

  const render = (proj: M4, view: M4, eye: [number, number, number], clear = true) => {
    const nowS = performance.now() / 1000;
    const gloom = Math.max(mistAmt * 0.5, rainAmt * 0.8);
    const sc = skyColors(dayT, gloom);
    const sun = sunDir(dayT);
    const moon: [number, number, number] = [-sun[0], -sun[1], -sun[2]];
    const cover = (weather === "clear" ? 0.34 : weather === "mist" ? 0.55 : 0.85);
    if (clear) {
      gl.clearColor(sc.fog[0], sc.fog[1], sc.fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.DEPTH_TEST);
    /* sky */
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(skyPr);
    const rotOnly = new Float32Array(view); rotOnly[12] = 0; rotOnly[13] = 0; rotOnly[14] = 0;
    gl.uniformMatrix4fv(gl.getUniformLocation(skyPr, "uVP"), false, m4.mul(proj, rotOnly));
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uZen"), sc.zen);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uHor"), sc.hor);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunDir"), sun);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uSunCol"), sc.sun);
    gl.uniform3fv(gl.getUniformLocation(skyPr, "uMoonDir"), moon);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uNight"), sc.night);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uTime"), nowS);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uCover"), cover);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uGloom"), gloom);
    gl.uniform1f(gl.getUniformLocation(skyPr, "uFlash"), flash);
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, skyMesh.buf);
      const a = gl.getAttribLocation(skyPr, "aPos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, 0);
      gl.drawArrays(gl.TRIANGLES, 0, skyMesh.n);
    }
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    const vp = m4.mul(proj, view);
    /* world */
    gl.useProgram(litPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(litPr, "uMVP"), false, vp);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uSun"), sun);
    gl.uniform2fv(gl.getUniformLocation(litPr, "uCam"), [eye[0], eye[2]]);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uFog"), sc.fog);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogNear"), fogNear);
    gl.uniform1f(gl.getUniformLocation(litPr, "uFogFar"), fogFar);
    gl.uniform3fv(gl.getUniformLocation(litPr, "uTint"), [0.55 + 0.45 * Math.max(0, sun[1] + 0.4), 0.55 + 0.45 * Math.max(0, sun[1] + 0.35), 0.6 + 0.4 * Math.max(0, sun[1] + 0.3)]);
    for (const ch of chunks.values()) {
      bindLit(ch.terrain, m4.ident());
      gl.drawArrays(gl.TRIANGLES, 0, ch.terrain.n);
      if (ch.lit) { bindLit(ch.lit, m4.ident()); gl.drawArrays(gl.TRIANGLES, 0, ch.lit.n); }
    }
    /* birds */
    {
      const bv: number[] = [];
      const t = nowS;
      for (const b of birds) {
        const cx = px + b.ox, cz = pz + b.oz;
        const a = b.ph + t * b.sp;
        const bx = cx + Math.cos(a) * b.r, bz = cz + Math.sin(a) * b.r;
        const by = height(cx, cz) + b.h + Math.sin(t * 0.9 + b.ph) * 1.6;
        const tx = -Math.sin(a) * Math.sign(b.sp), tz = Math.cos(a) * Math.sign(b.sp);
        const flap = Math.sin(t * 9 + b.ph * 3) * 0.85;
        const s = b.size;
        const P = (ox: number, oy: number, oz: number) => bv.push(bx + ox, by + oy, bz + oz, 0.05, 0.05, 0.07, 0, 1, 0);
        const W1: [number, number, number] = [tx * 0.4 + (-tz) * s, flap * s * 0.8, tz * 0.4 + tx * s];
        const W2: [number, number, number] = [tx * 0.4 - (-tz) * s, flap * s * 0.8, tz * 0.4 - tx * s];
        const TAIL: [number, number, number] = [-tx * s * 0.9, 0, -tz * s * 0.9];
        const NOSE: [number, number, number] = [tx * s * 0.9, 0, tz * s * 0.9];
        P(...TAIL); P(...W1); P(...NOSE);
        P(...TAIL); P(...NOSE); P(...W2);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, birdBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bv), gl.DYNAMIC_DRAW);
      gl.useProgram(unlitPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uFog"), sc.fog);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogNear"), fogNear);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uFogFar"), fogFar);
      gl.uniform2fv(gl.getUniformLocation(unlitPr, "uCam"), [eye[0], eye[2]]);
      gl.uniform3fv(gl.getUniformLocation(unlitPr, "uOrigin"), [0, 0, 0]);
      gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 1);
      const aPos = gl.getAttribLocation(unlitPr, "aPos");
      const aCol = gl.getAttribLocation(unlitPr, "aCol");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.drawArrays(gl.TRIANGLES, 0, bv.length / 9);
    }
    /* glow scatter */
    gl.useProgram(unlitPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(unlitPr, "uMVP"), false, vp);
    gl.uniform1f(gl.getUniformLocation(unlitPr, "uAlpha"), 0.9 + 0.1 * Math.sin(nowS * 2.2));
    for (const ch of chunks.values()) if (ch.glow) { bindUnlit(ch.glow); gl.drawArrays(gl.TRIANGLES, 0, ch.glow.n); }
    /* water */
    if (waterMesh) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(waterPr);
      gl.uniformMatrix4fv(gl.getUniformLocation(waterPr, "uMVP"), false, vp);
      gl.uniform2fv(gl.getUniformLocation(waterPr, "uCam"), [eye[0], eye[2]]);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uSun"), sun);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uSunCol"), sc.sun);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uHor"), sc.hor);
      gl.uniform3fv(gl.getUniformLocation(waterPr, "uFog"), sc.fog);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uFogNear"), fogNear);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uFogFar"), fogFar);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uTime"), nowS);
      gl.uniform1f(gl.getUniformLocation(waterPr, "uDay"), Math.max(0.12, Math.min(1, sun[1] * 2.2 + 0.4)));
      gl.bindBuffer(gl.ARRAY_BUFFER, waterMesh.buf);
      const aPos = gl.getAttribLocation(waterPr, "aPos");
      const aCol = gl.getAttribLocation(waterPr, "aCol");
      const aAux = gl.getAttribLocation(waterPr, "aAux");
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aAux);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(aAux, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, waterMesh.n);
      gl.disable(gl.BLEND);
    }
    /* points: motes + rain */
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(ptsPr);
    gl.uniformMatrix4fv(gl.getUniformLocation(ptsPr, "uVP"), false, vp);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uTime"), nowS);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uCam"), eye);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 0);
    gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [60, 24, 60]);
    gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), 0.22 + sc.night * 0.6);
    bindPoints(motes);
    gl.drawArrays(gl.POINTS, 0, motes.n);
    if (rainAmt > 0.02) {
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uFall"), 26);
      gl.uniform3fv(gl.getUniformLocation(ptsPr, "uBox"), [70, 44, 70]);
      gl.uniform1f(gl.getUniformLocation(ptsPr, "uAlpha"), rainAmt * 0.55);
      bindPoints(rainPts);
      gl.drawArrays(gl.POINTS, 0, rainPts.n);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };

  /* ---- step ---- */
  let last = performance.now();
  let chipClock = 0;
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    dayT = (dayT + dt / 300) % 1;
    /* weather machine */
    wxClock += dt;
    if (wxClock > wxNext) {
      wxClock = 0; wxNext = 45 + wxRnd() * 60;
      const r = wxRnd();
      weather = r < 0.5 ? "clear" : r < 0.78 ? "mist" : "rain";
    }
    mistAmt += ((weather === "mist" ? 1 : 0) - mistAmt) * Math.min(1, dt * 0.25);
    rainAmt += ((weather === "rain" ? 1 : 0) - rainAmt) * Math.min(1, dt * 0.25);
    flash = Math.max(0, flash - dt * 1.4);
    if (rainAmt > 0.6 && Math.random() < dt / 13) { flash = 1; audio.thunder(); }
    /* fog targets */
    const groundH = height(px, pz);
    const inWater = !flying && groundH < -0.4 && py < 0.6;
    const underwater = inWater && py < -0.25;
    const tFogN = underwater ? 1.5 : 55 - mistAmt * 39 - rainAmt * 25;
    const tFogF = underwater ? 24 : 300 - mistAmt * 205 - rainAmt * 130;
    fogNear += (tFogN - fogNear) * Math.min(1, dt * 1.5);
    fogFar += (tFogF - fogFar) * Math.min(1, dt * 1.5);
    uw.style.opacity = underwater ? "1" : "0";
    /* movement */
    const fwd: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)];
    const right: [number, number] = [-fwd[1], fwd[0]];
    let ix = 0, iz = 0;
    if (!touched) {
      yaw += dt * 0.045;
      const target = height(px, pz) + 24 + Math.sin(now * 0.00021) * 3;
      py += (target - py) * Math.min(1, dt * 0.7);
    }
    if (keys.has("KeyW") || keys.has("ArrowUp")) { ix += fwd[0]; iz += fwd[1]; }
    if (keys.has("KeyS") || keys.has("ArrowDown")) { ix -= fwd[0]; iz -= fwd[1]; }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) { ix -= right[0]; iz -= right[1]; }
    if (keys.has("KeyD") || keys.has("ArrowRight")) { ix += right[0]; iz += right[1]; }
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const baseSpeed = flying ? (sprint ? 30 : 13) : inWater ? 4.2 : sprint ? 15 : 8.5;
    const il = Math.hypot(ix, iz);
    const txv = il > 0 ? (ix / il) * baseSpeed : 0;
    const tzv = il > 0 ? (iz / il) * baseSpeed : 0;
    const accel = flying || inWater ? 3.2 : 7;
    vx += (txv - vx) * Math.min(1, dt * accel);
    vz += (tzv - vz) * Math.min(1, dt * accel);
    px += vx * dt; pz += vz * dt;
    const hSpeed = Math.hypot(vx, vz);
    if (flying) {
      if (keys.has("Space")) py += baseSpeed * 0.8 * dt;
      if (keys.has("KeyC")) py -= baseSpeed * 0.8 * dt;
      if (keys.has("KeyW")) py += Math.sin(pitch) * baseSpeed * 0.7 * dt;
      py = Math.max(height(px, pz) + 1.2, py);
      wasGrounded = false;
    } else if (inWater) {
      /* swimming: buoyancy to just under the surface */
      const target = Math.min(-0.45, Math.max(groundH + 1.0, py));
      vy = 0;
      py += (target - py) * Math.min(1, dt * 3);
      if (keys.has("Space")) py = Math.min(0.1, py + 3.2 * dt);
      if (keys.has("KeyC")) py = Math.max(groundH + 0.8, py - 3.2 * dt);
      wasGrounded = false;
    } else {
      const ground = groundH + 1.7;
      vy -= 22 * dt;
      py += vy * dt;
      if (py <= ground) {
        if (!wasGrounded && vy < -9) { audio.thud(-vy); landDip = Math.min(0.5, -vy * 0.02); }
        py = ground; vy = 0; wasGrounded = true;
      } else wasGrounded = false;
      if (keys.has("Space") && wasGrounded) vy = 8.4;
    }
    /* water entry/exit */
    if (inWater && !wasInWater) audio.splash(py < -1);
    wasInWater = inWater;
    /* head-bob + footsteps */
    landDip = Math.max(0, landDip - dt * 1.8);
    if (wasGrounded && hSpeed > 1.2) {
      const prev = bobPhase;
      bobPhase += dt * hSpeed * 1.35;
      bobAmp = Math.min(1, bobAmp + dt * 5);
      if (Math.floor(prev / Math.PI) !== Math.floor(bobPhase / Math.PI)) audio.footstep(surfaceAt(px, pz));
    } else bobAmp = Math.max(0, bobAmp - dt * 5);
    /* audio ambience */
    if (audio.live) {
      audio.tick(dayT);
      audio.setWeather(rainAmt, py - groundH, now / 1000);
      audio.setUnderwater(underwater);
      /* crystal chimes */
      const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const ch = chunks.get(keyOf(ccx + i, ccz + j));
        if (!ch) continue;
        ch.crystals.forEach(([cxp, czp], idx) => {
          const d2 = (cxp - px) * (cxp - px) + (czp - pz) * (czp - pz);
          const k = `${ch.key}:${idx}`;
          if (d2 < 42 && now - (lastChime.get(k) ?? 0) > 9000) { lastChime.set(k, now); audio.chime(Math.floor(cxp * 7 + czp * 13)); }
        });
      }
      if (Math.random() < dt * 0.05 && sunDir(dayT)[1] > 0.1) audio.chirp();
    }
    /* chunks */
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    let built = 0;
    for (let i = -RADIUS; i <= RADIUS && built < 2; i++) for (let j = -RADIUS; j <= RADIUS && built < 2; j++) {
      const k = keyOf(ccx + i, ccz + j);
      if (!chunks.has(k)) { chunks.set(k, buildChunk(ccx + i, ccz + j)); built++; }
    }
    for (const [k, ch] of chunks) {
      const [cx, cz] = k.split(",").map(Number);
      if (Math.abs(cx - ccx) > RADIUS + 1 || Math.abs(cz - ccz) > RADIUS + 1) {
        gl.deleteBuffer(ch.terrain.buf);
        if (ch.lit) gl.deleteBuffer(ch.lit.buf);
        if (ch.glow) gl.deleteBuffer(ch.glow.buf);
        chunks.delete(k);
      }
    }
    buildWater(px, pz);
    /* HUD + EMCON, ~4×/s and 1×/s */
    if ((frames++ & 15) === 0) {
      const heading = Math.atan2(fwd[0], -fwd[1]) * 180 / Math.PI;
      const deg = ((heading % 360) + 360) % 360;
      const cards = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const hour = ((dayT - 0.25) * 24 + 6 + 24) % 24;
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      posLabel.textContent = `${cards[Math.round(deg / 45) % 8]} ${deg.toFixed(0)}° · ${biomeAt(px, pz)} · ${weather} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · x ${px.toFixed(0)} z ${pz.toFixed(0)} · ${chunks.size} chunks`;
    }
    chipClock += dt;
    if (chipClock > 1) {
      chipClock = 0;
      const chip = document.getElementById("os-emcon-chip");
      audio.setGate(chip && chip.dataset.level === "alpha" ? 0 : 1);
    }
  };

  const frame = () => {
    if (!body.isConnected) {
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
      audio.dispose();
      return;
    }
    step();
    if (!(xrSession && xrRef)) {
      const asp = canvas.width / canvas.height;
      const proj = m4.persp(1.25, asp, 0.1, 1200);
      const bobY = Math.sin(bobPhase * 2) * 0.055 * bobAmp - landDip * 0.3;
      const roll = Math.sin(bobPhase) * 0.006 * bobAmp;
      const view = m4.mul(m4.rotZ(roll), m4.mul(m4.rotX(-pitch), m4.mul(m4.rotY(-yaw), m4.trans(-px, -(py + bobY), -pz))));
      render(proj, view, [px, py + bobY, pz]);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const xrFrame = (_t: number, frameObj: XRFrameLike) => {
    if (!xrSession || !xrRef) return;
    const pose = frameObj.getViewerPose(xrRef);
    if (pose) {
      const layer = xrSession.renderState.baseLayer as InstanceType<typeof XRWebGLLayer>;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      let first = true;
      for (const view of pose.views) {
        const vp = layer.getViewport(view)!;
        gl.viewport(vp.x, vp.y, vp.width, vp.height);
        render(view.projectionMatrix as unknown as M4, view.transform.inverse.matrix as unknown as M4, [px, py, pz], first);
        first = false;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    xrSession.requestAnimationFrame(xrFrame);
  };
  const xrWatch = window.setInterval(() => {
    if (!body.isConnected) { window.clearInterval(xrWatch); return; }
    if (xrSession && xrRef) xrSession.requestAnimationFrame(xrFrame);
  }, 800);
}
