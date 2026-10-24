/* SIGINT bench — the wide ear.
 *
 * A full receive bench for Blacksite, built from the house's own
 * technologies: nightjar's listening-post pattern (a presence
 * registry with pattern-of-life, now kept for emitters instead of
 * BLE advertisers) and the bench doctrine — one ear, read, grade.
 *
 * The receiver is a real DSP chain in an AudioWorklet
 * (/sdr-worklet.js): NCO mix, Hilbert analytic, CW/SSB/AM/FM demod,
 * wideband FFT for the waterfall. W2 adds the analyst's half:
 * measurement cursors with SNR / occupied-bandwidth readouts, an
 * eye diagram + bit slicer, an ITA2 RTTY decoder next to the Morse
 * copy, a modulation grader that reads duty cycle and envelope
 * statistics before it names a signal, and an intercept log with
 * export. It is fully usable with NO
 * hardware — sources: a synthesized live band (stations that speak
 * Morse and RTTY among others), the microphone / line-in (a real
 * radio's audio is a real input), audio files, and baseband
 * recordings the bench itself makes (WAV, replayable through the
 * file source). An SDR over USB is a later wave's door; nothing
 * here can transmit — receive only, by construction.
 */

import { skey } from "./os-depth";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ */
/* The synthesized band — a small, honest RF neighbourhood at audio   */
/* rates. Stations are placed so every decoder has something true to  */
/* hear: a Morse beacon, an ITA2 RTTY broadcast, an AM music station, */
/* an SSB voice-shaped signal, an FM repeater, and one wanderer.       */
/* ------------------------------------------------------------------ */

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--",
  "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", "/": "-..-.", "=": "-...-", "+": ".-.-.", "?": "..--..",
};
const MORSE_REV: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/* ITA2 (Baudot) — letters shift. */
const ITA2: Record<string, number> = {
  E: 0x01, A: 0x03, S: 0x05, I: 0x06, U: 0x07, D: 0x09, R: 0x0a, J: 0x0b,
  N: 0x0c, F: 0x0d, C: 0x0e, K: 0x0f, T: 0x10, Z: 0x11, L: 0x12, W: 0x13,
  H: 0x14, Y: 0x15, P: 0x16, Q: 0x17, O: 0x18, B: 0x19, G: 0x1a, M: 0x1c,
  X: 0x1d, V: 0x1e, " ": 0x04 - 0x04 + 0x04, "\n": 0x02, "\r": 0x08,
};
ITA2[" "] = 0x04;

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function synthBand(sr: number, seconds: number): AudioBuffer {
  const n = Math.floor(sr * seconds);
  const buf = new Float32Array(n);
  const rnd = seededRand(427427);
  const add = (t0: number, t1: number, fn: (t: number) => number) => {
    const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(n, Math.floor(t1 * sr));
    for (let i = a; i < b; i++) buf[i] += fn(i / sr);
  };
  /* noise floor */
  let lp = 0;
  for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; lp += 0.08 * (w - lp); buf[i] += lp * 0.03 + w * 0.006; }

  /* CW beacon @ 3.2 kHz — keyed carrier, shaped edges */
  const msg = "VVV VVV DE NIGHTWARE LABZ · SDR TEST · 599 · ";
  const dit = 0.06;
  const elements: Array<[number, number]> = [];
  {
    let t = 0.5;
    for (const ch of msg.repeat(6)) {
      if (ch === " ") { t += dit * 4; continue; }
      const code = MORSE[ch.toUpperCase()];
      if (!code) { t += dit * 3; continue; }
      for (const sym of code) {
        const d = sym === "." ? dit : dit * 3;
        elements.push([t, t + d]);
        t += d + dit;
      }
      t += dit * 2;
    }
  }
  for (const [a, b] of elements) {
    add(a, b, (t) => {
      const env = Math.min(1, (t - a) / 0.004, (b - t) / 0.004);
      return 0.5 * Math.max(0, env) * Math.sin(2 * Math.PI * 3200 * t);
    });
  }

  /* RTTY broadcast @ 6.8 kHz — 170 Hz shift, 45.45 baud, ITA2 */
  {
    const text = "RYRY NIGHTWARE LABZ SDR TEST 1234567890 DE THE WIDE EAR ";
    const baud = 45.45, bitT = 1 / baud;
    const bits: number[] = [];
    const pushChar = (c: string) => {
      const code = ITA2[c.toUpperCase()];
      if (code === undefined) return;
      bits.push(0);
      for (let i = 0; i < 5; i++) bits.push((code >> i) & 1);
      bits.push(1, 1);
    };
    for (const c of text.repeat(3)) pushChar(c);
    let phase = 0;
    const total = Math.min(seconds - 1, bits.length * bitT + 2);
    const a0 = Math.floor(1 * sr), a1 = Math.floor((1 + total) * sr);
    for (let i = a0; i < a1 && i < n; i++) {
      const t = i / sr - 1;
      const bit = bits[Math.floor(t / bitT)] ?? 1;
      const f = bit ? 6800 + 85 : 6800 - 85;
      phase += (2 * Math.PI * f) / sr;
      buf[i] += 0.34 * Math.sin(phase);
    }
  }

  /* AM station @ 10.5 kHz — a slow machine melody, then speech-shaped bursts */
  add(0, seconds, (t) => {
    const notes = [220, 261.6, 329.6, 392, 329.6, 261.6];
    const seg = t % 12;
    let m: number;
    if (seg < 7) {
      const note = notes[Math.floor(t / 0.9) % notes.length];
      m = 0.75 * Math.sin(2 * Math.PI * note * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t));
    } else {
      m = 0.7 * Math.sin(2 * Math.PI * 140 * t) * Math.max(0, Math.sin(2 * Math.PI * 2.1 * t)) *
          Math.sin(2 * Math.PI * 900 * t + 2 * Math.sin(2 * Math.PI * 3 * t));
    }
    return 0.30 * (1 + 0.8 * m) * Math.sin(2 * Math.PI * 10500 * t);
  });

  /* SSB voice-shaped @ 15.2 kHz — wandering formants, syllabic gating */
  add(0, seconds, (t) => {
    const gate = Math.max(0, Math.sin(2 * Math.PI * 0.45 * t + 1)) > 0.25 ? 1 : 0.08;
    const f1 = 15200 + 500 + 260 * Math.sin(2 * Math.PI * 0.7 * t);
    const f2 = 15200 + 1300 + 420 * Math.sin(2 * Math.PI * 0.53 * t + 2);
    return gate * 0.16 * (Math.sin(2 * Math.PI * f1 * t) + 0.7 * Math.sin(2 * Math.PI * f2 * t));
  });

  /* FM repeater @ 20.4 kHz — tone bursts over a deviated carrier */
  {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const seg = t % 9;
      const mod = seg < 1.2 ? Math.sin(2 * Math.PI * 700 * t) : seg < 2.4 ? Math.sin(2 * Math.PI * 900 * t) : 0.15 * Math.sin(2 * Math.PI * 180 * t);
      phase += (2 * Math.PI * (20400 + 2400 * mod)) / sr;
      buf[i] += 0.30 * Math.sin(phase);
    }
  }

  /* The wanderer — a slow chirp crossing the whole band */
  add(0, seconds, (t) => {
    const ph = (t % 30) / 30;
    const f = 800 + ph * 22200;
    return 0.16 * Math.sin(2 * Math.PI * f * t - Math.PI * 22200 * 30 * ph * ph * 0 + 2 * Math.PI * 800 * t * 0 + (2 * Math.PI * (f - 800) * t * ph) / 2);
  });

  /* gentle limiting */
  for (let i = 0; i < n; i++) buf[i] = Math.max(-0.92, Math.min(0.92, buf[i]));
  const ctx = new OfflineAudioContext(1, n, sr);
  const b = ctx.createBuffer(1, n, sr);
  b.copyToChannel(buf, 0);
  return b;
}

/* ------------------------------------------------------------------ */
/* The registry — nightjar's presence pattern, kept for emitters.     */
/* ------------------------------------------------------------------ */

interface Station {
  freq: number; first: number; last: number; hits: number;
  peakDb: number; widthHz: number; guess: string; grade: string;
  trail: number[]; /* presence bits, 1 per second, last 90 */
  freqHist: number[];
}

const REG_KEY = "sigint-registry-v2";

/* ------------------------------------------------------------------ */

export function buildSigint(body: HTMLElement) {
  const wrap = el("div", "os-sigint");
  const head = el("div", "os-sigint-head");
  const freqInput = document.createElement("input");
  freqInput.className = "os-sigint-freq";
  freqInput.value = "3.200";
  freqInput.setAttribute("aria-label", "Frequency in kHz");
  const freqUnit = el("span", "os-note", "kHz");
  const power = el("button", "os-btn primary", "power");
  const srcBand = el("button", "os-btn primary", "band");
  const srcMic = el("button", "os-btn", "mic");
  const srcFile = el("button", "os-btn", "file");
  const recBtn = el("button", "os-btn", "rec");
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "audio/*"; fileInput.style.display = "none";
  head.append(freqInput, freqUnit, power, srcBand, srcMic, srcFile, recBtn, fileInput);

  const fall = document.createElement("canvas");
  fall.className = "os-sigint-fall";
  fall.width = 1024; fall.height = 300;

  const modes = el("div", "os-sigint-modes");
  const modeBtns: Record<string, HTMLButtonElement> = {};
  for (const m of ["cw", "usb", "lsb", "am", "fm", "rtty"]) {
    const b = el("button", "os-btn" + (m === "cw" ? " primary" : ""), m.toUpperCase());
    modeBtns[m] = b; modes.appendChild(b);
  }
  const bwSel = document.createElement("select");
  bwSel.className = "os-sigint-sel";
  for (const [label, v] of [["250 Hz", 250], ["500 Hz", 500], ["800 Hz", 800], ["2.4 kHz", 2400], ["5 kHz", 5000], ["12 kHz", 12000]] as Array<[string, number]>) {
    const o = document.createElement("option"); o.textContent = label; o.value = String(v); bwSel.appendChild(o);
  }
  bwSel.value = "500";
  const gain = document.createElement("input");
  gain.type = "range"; gain.min = "0"; gain.max = "2"; gain.step = "0.05"; gain.value = "1";
  gain.className = "os-sigint-slider"; gain.setAttribute("aria-label", "Gain");
  const squelch = document.createElement("input");
  squelch.type = "range"; squelch.min = "-110"; squelch.max = "-40"; squelch.step = "1"; squelch.value = "-95";
  squelch.className = "os-sigint-slider"; squelch.setAttribute("aria-label", "Squelch");
  modes.append(el("span", "os-note", "bw"), bwSel, el("span", "os-note", "gain"), gain, el("span", "os-note", "sql"), squelch);
  const markA = el("button", "os-btn", "mark A");
  const markB = el("button", "os-btn", "mark B");
  const markX = el("button", "os-btn", "✕ marks");
  modes.append(markA, markB, markX);
  const readout = el("p", "os-note os-sigint-readout", "");

  const lower = el("div", "os-sigint-lower");
  const copyPane = el("pre", "os-sigint-copy");
  copyPane.textContent = "";
  const copyBox = el("div", "os-sigint-pane");
  const copyHead = el("div", "os-sigint-copyhead");
  const tabCw = el("button", "os-btn primary", "CW copy");
  const tabRtty = el("button", "os-btn", "RTTY copy");
  copyHead.append(el("h4", "", "COPY"), tabCw, tabRtty);
  const eye = document.createElement("canvas");
  eye.className = "os-sigint-eye"; eye.width = 220; eye.height = 64;
  eye.style.display = "none";
  copyBox.append(copyHead, eye, copyPane);
  const regBox = el("div", "os-sigint-pane");
  const regTable = el("table", "os-sigint-reg");
  regBox.append(el("h4", "", "EMITTERS — THE REGISTRY"), regTable);
  lower.append(copyBox, regBox);

  const logBox = el("div", "os-sigint-pane os-sigint-logbox");
  const logHead = el("div", "os-sigint-copyhead");
  const logExport = el("button", "os-btn", "export log");
  const logClear = el("button", "os-btn", "clear log");
  logHead.append(el("h4", "", "INTERCEPT LOG"), logExport, logClear);
  const logPane = el("pre", "os-sigint-copy os-sigint-log");
  logBox.append(logHead, logPane);

  const status = el("p", "os-note", "receiver off · receive only — the ear never speaks");
  wrap.append(head, fall, modes, readout, lower, logBox, status);
  body.appendChild(wrap);

  /* ---------------- state ---------------- */
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let master: GainNode | null = null;
  let liveSrc: AudioNode | null = null;
  let micStream: MediaStream | null = null;
  let bandBuffer: AudioBuffer | null = null;
  let freq = 3200, mode = "cw", running = false;
  let latestMag: Float32Array | null = null;
  const hist = document.createElement("canvas");
  hist.width = 1024; hist.height = 226;
  const hx = hist.getContext("2d")!;
  hx.fillStyle = "#020604"; hx.fillRect(0, 0, hist.width, hist.height);
  const histTmp = document.createElement("canvas");
  histTmp.width = 1024; histTmp.height = 226;
  const htx = histTmp.getContext("2d")!;
  let stations: Station[] = [];
  const candidates: Array<{ f: number; n: number }> = [];
  try {
    const saved = JSON.parse(localStorage.getItem(skey(REG_KEY)) || "[]") as Station[];
    if (Array.isArray(saved)) {
      /* restored rows are history, not live identifications: anything
         older than 15 minutes is gone, and every grade is re-earned. */
      const cutoff = Date.now() - 15 * 60 * 1000;
      stations = saved.filter((s) => s.last > cutoff)
        .map((s) => ({ ...s, trail: [], freqHist: [], guess: "carrier", grade: "possible" }));
    }
  } catch { /* fresh registry */ }

  /* W2 analyst state */
  let curA: number | null = null, curB: number | null = null;
  let statsCv: number | null = null;
  let paneTab: "cw" | "rtty" = "cw";
  let cwText = "", rttyText = "";
  interface Intercept { t: number; mode: string; freq: number; text: string }
  let intercepts: Intercept[] = [];
  try { intercepts = JSON.parse(localStorage.getItem(skey("sigint-log-v1")) || "[]") as Intercept[]; } catch { intercepts = []; }
  const commitIntercept = (m: string, text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 6) return;
    intercepts.push({ t: Date.now(), mode: m, freq, text: clean.slice(0, 220) });
    if (intercepts.length > 80) intercepts = intercepts.slice(-80);
    try { localStorage.setItem(skey("sigint-log-v1"), JSON.stringify(intercepts)); } catch { /* private mode */ }
    renderLog();
  };
  const renderLog = () => {
    logPane.textContent = intercepts.slice(-30).map((i) =>
      `${new Date(i.t).toLocaleTimeString()} · ${i.mode} · ${(i.freq / 1000).toFixed(3)} kHz · ${i.text}`).join("\n");
    logPane.scrollTop = logPane.scrollHeight;
  };
  renderLog();
  logClear.addEventListener("click", () => {
    intercepts = [];
    try { localStorage.removeItem(skey("sigint-log-v1")); } catch { /* noop */ }
    renderLog();
  });
  logExport.addEventListener("click", () => {
    const txt = intercepts.map((i) => `${new Date(i.t).toISOString()} · ${i.mode} · ${(i.freq / 1000).toFixed(3)} kHz · ${i.text}`).join("\n");
    const url = URL.createObjectURL(new Blob([txt || "(empty log)"], { type: "text/plain" }));
    const a = el("a"); a.setAttribute("href", url); a.setAttribute("download", "sigint-intercept-log.txt"); a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  markA.addEventListener("click", () => { curA = freq; });
  markB.addEventListener("click", () => { curB = freq; });
  markX.addEventListener("click", () => { curA = null; curB = null; });
  tabCw.addEventListener("click", () => setPane("cw"));
  tabRtty.addEventListener("click", () => setPane("rtty"));
  const setPane = (t: "cw" | "rtty") => {
    paneTab = t;
    tabCw.classList.toggle("primary", t === "cw");
    tabRtty.classList.toggle("primary", t === "rtty");
    eye.style.display = t === "rtty" ? "block" : "none";
    copyPane.textContent = t === "cw" ? cwText : rttyText;
  };

  /* CW decoder state */
  let envMin = 0.02, envMax = 0.4, markStart = 0, spaceStart = 0, inMark = false;
  let rawMark = false, rawSince = 0;
  let unit = 60; /* ms, adapts */
  let curCode = "";
  let cwLine = "";
  const setCopy = (txt: string) => {
    cwText = (cwText + txt).slice(-2400);
    cwLine += txt;
    if (txt === " " && cwLine.replace(/ /g, "").length >= 10) { commitIntercept("CW", cwLine); cwLine = ""; }
    if (paneTab === "cw") { copyPane.textContent = cwText; copyPane.scrollTop = copyPane.scrollHeight; }
  };
  const flushChar = () => {
    if (!curCode) return;
    setCopy(MORSE_REV[curCode] || "·");
    curCode = "";
  };

  const post = () => {
    node?.port.postMessage({ freq, mode: mode === "rtty" ? "fsk" : mode, shift: 170, bw: Number(bwSel.value), gain: Number(gain.value), squelch: Number(squelch.value) });
  };

  const tune = (hz: number) => {
    const nyq = (ctx ? ctx.sampleRate : 48000) / 2;
    freq = Math.max(80, Math.min(nyq - 80, Math.round(hz)));
    freqInput.value = (freq / 1000).toFixed(3);
    curCode = ""; inMark = false;
    post();
  };

  /* ---------------- audio graph ---------------- */
  const stopSource = () => {
    try { liveSrc?.disconnect(); } catch { /* already gone */ }
    if (liveSrc instanceof AudioBufferSourceNode) { try { liveSrc.stop(); } catch { /* noop */ } }
    liveSrc = null;
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
  };

  const setSource = async (kind: "band" | "mic" | "file", file?: File) => {
    if (!ctx || !node) return;
    stopSource();
    for (const [b, k] of [[srcBand, "band"], [srcMic, "mic"], [srcFile, "file"]] as Array<[HTMLButtonElement, string]>) {
      b.classList.toggle("primary", k === kind);
    }
    if (kind === "band") {
      bandBuffer ??= synthBand(ctx.sampleRate, 30);
      const s = ctx.createBufferSource(); s.buffer = bandBuffer; s.loop = true;
      s.connect(node); s.start(); liveSrc = s;
      status.textContent = "source: the house band (synthesized) · live";
    } else if (kind === "mic") {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const s = ctx.createMediaStreamSource(micStream);
        s.connect(node); liveSrc = s;
        status.textContent = "source: microphone / line-in · live — a real radio's audio is a real input";
      } catch { status.textContent = "microphone refused — the bench hears nothing from it"; }
    } else if (kind === "file" && file) {
      try {
        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        s.connect(node); s.start(); liveSrc = s;
        status.textContent = `source: file ${file.name} · looping`;
      } catch { status.textContent = "that file would not decode as audio"; }
    }
  };

  power.addEventListener("click", async () => {
    if (running) {
      running = false; power.textContent = "power";
      stopSource(); await ctx?.suspend();
      status.textContent = "receiver off · receive only — the ear never speaks";
      return;
    }
    try {
      ctx ??= new AudioContext();
      if (!node) {
        await ctx.audioWorklet.addModule("/sdr-worklet.js");
        node = new AudioWorkletNode(ctx, "sdr-dsp", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        master = ctx.createGain(); master.gain.value = 1;
        node.connect(master); master.connect(ctx.destination);
        node.port.onmessage = (e: MessageEvent) => {
          const d = e.data as { type: string; mag?: Float32Array; v?: number; open?: boolean; chunk?: Float32Array };
          if (d.type === "spectrum" && d.mag) {
            latestMag = d.mag;
            /* one waterfall row per spectrum frame, kept on a history
               canvas — the old per-frame translucent fade erased rows
               almost as fast as they were drawn. */
            /* shift via a ping-pong canvas: drawing a canvas onto
               itself with an offset does not accumulate reliably. */
            htx.drawImage(hist, 0, 0);
            hx.drawImage(histTmp, 0, 1);
            const img = hx.createImageData(hist.width, 1);
            const n = d.mag.length;
            for (let x = 0; x < hist.width; x++) {
              const db = d.mag[Math.floor((x / hist.width) * (n - 1))];
              const t = Math.max(0, Math.min(1, (db + 105) / 55));
              img.data[x * 4] = Math.floor(20 + t * 60);
              img.data[x * 4 + 1] = Math.floor(30 + t * 220);
              img.data[x * 4 + 2] = Math.floor(24 + t * 70);
              img.data[x * 4 + 3] = 255;
            }
            hx.putImageData(img, 0, 0);
            registryTick(d.mag, ctx ? ctx.sampleRate : 48000);
          }
          if (d.type === "env") feedDecoder(d.v ?? 0, !!d.open);
          if (d.type === "rec" && d.chunk && recording) recChunks.push(d.chunk);
          const dd = d as { type: string; vs?: Float32Array; cv?: number };
          if (dd.type === "fsk" && dd.vs) feedFsk(dd.vs);
          if (dd.type === "stats" && typeof dd.cv === "number") statsCv = dd.cv;
        };
      }
      await ctx.resume();
      running = true; power.textContent = "on air";
      tune(freq); post();
      await setSource("band");
    } catch (err) {
      status.textContent = "the receiver would not start in this browser (AudioWorklet needed)";
    }
  });

  srcBand.addEventListener("click", () => void setSource("band"));
  srcMic.addEventListener("click", () => void setSource("mic"));
  srcFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { const f = fileInput.files?.[0]; if (f) void setSource("file", f); });

  /* recording: the worklet taps the raw band; the room keeps WAV. */
  let recording = false, recChunks: Float32Array[] = [], recCount = 0;
  recBtn.addEventListener("click", () => {
    if (!node) { status.textContent = "power the receiver first"; return; }
    recording = !recording;
    recBtn.classList.toggle("primary", recording);
    if (recording) { recChunks = []; recCount = 0; node.port.postMessage({ record: true }); status.textContent = "recording baseband…"; }
    else {
      node.port.postMessage({ record: false });
      const sr = ctx?.sampleRate ?? 48000;
      const total = recChunks.reduce((a, c) => a + c.length, 0);
      const pcm = new Int16Array(total);
      let o = 0;
      for (const c of recChunks) { for (let i = 0; i < c.length; i++) pcm[o++] = Math.max(-32767, Math.min(32767, c[i] * 32767)); o = o; }
      const wav = new ArrayBuffer(44 + pcm.length * 2);
      const v = new DataView(wav);
      const wstr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
      wstr(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); wstr(8, "WAVEfmt ");
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      wstr(36, "data"); v.setUint32(40, pcm.length * 2, true);
      new Int16Array(wav, 44).set(pcm);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const a = el("a", "os-btn", `baseband-${Math.round(total / sr)}s.wav`);
      a.setAttribute("href", url); a.setAttribute("download", `sigint-baseband.wav`);
      status.replaceChildren(document.createTextNode("recorded · "), a, document.createTextNode(" · replay it through the file source"));
    }
  });

  for (const [m, b] of Object.entries(modeBtns)) {
    b.addEventListener("click", () => {
      mode = m;
      for (const bb of Object.values(modeBtns)) bb.classList.toggle("primary", bb === b);
      if (m === "cw") bwSel.value = "500";
      if (m === "usb" || m === "lsb") bwSel.value = "2400";
      if (m === "am") bwSel.value = "5000";
      if (m === "fm") bwSel.value = "12000";
      if (m === "rtty") { bwSel.value = "800"; setPane("rtty"); resetRtty(); }
      if (m === "cw") setPane("cw");
      post();
    });
  }
  bwSel.addEventListener("change", post);
  gain.addEventListener("input", post);
  squelch.addEventListener("input", post);
  freqInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { const khz = parseFloat(freqInput.value); if (!Number.isNaN(khz)) tune(khz * 1000); }
  });

  /* tuning gestures on the waterfall */
  let dragging = false;
  const tuneFromEvent = (e: PointerEvent) => {
    const r = fall.getBoundingClientRect();
    const nyq = (ctx ? ctx.sampleRate : 48000) / 2;
    tune(((e.clientX - r.left) / r.width) * nyq);
  };
  fall.addEventListener("pointerdown", (e) => { dragging = true; fall.setPointerCapture(e.pointerId); tuneFromEvent(e); });
  fall.addEventListener("pointermove", (e) => { if (dragging) tuneFromEvent(e); });
  fall.addEventListener("pointerup", () => { dragging = false; });
  fall.addEventListener("wheel", (e) => { e.preventDefault(); tune(freq + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 100)); }, { passive: false });

  /* ---------------- CW decoder ---------------- */
  function feedDecoder(v: number, open: boolean) {
    if (!open) v = 0;
    envMin = v < envMin ? v : envMin + (v - envMin) * 0.002;
    envMax = Math.max(v, envMax - 0.0006, envMin + 0.04);
    const now = performance.now();
    const want = inMark ? v > envMin + (envMax - envMin) * 0.32 : v > envMin + (envMax - envMin) * 0.55;
    if (want !== rawMark) { rawMark = want; rawSince = now; }
    if (rawMark === inMark || now - rawSince < 22) return; /* debounce */
    const mark = rawMark;
    if (mark && !inMark) {
      inMark = true; markStart = now;
      const space = now - spaceStart;
      if (spaceStart && space > unit * 2.2) { flushChar(); if (space > unit * 5.5) setCopy(" "); }
    } else if (!mark && inMark) {
      inMark = false; spaceStart = now;
      const d = now - markStart;
      const isDit = d < unit * 2;
      curCode += isDit ? "." : "-";
      unit = Math.max(28, Math.min(140, unit * 0.85 + (isDit ? d : d / 3) * 0.15));
    }
  }

  /* ---------------- RTTY decoder (ITA2) ----------------
     The worklet streams instantaneous frequency (~2 ms/value);
     a 45.45-baud symbol is 11 values. UART-style framing: hunt a
     mark→space edge, sample 5 data bits at symbol centres, honour
     LTRS/FIGS shifts. The eye folds the same stream at the symbol
     period so the operator can see the two tones separate. */
  const ITA2_LTRS: Record<number, string> = {
    0x01: "E", 0x03: "A", 0x05: "S", 0x06: "I", 0x07: "U", 0x09: "D", 0x0a: "R", 0x0b: "J",
    0x0c: "N", 0x0d: "F", 0x0e: "C", 0x0f: "K", 0x10: "T", 0x11: "Z", 0x12: "L", 0x13: "W",
    0x14: "H", 0x15: "Y", 0x16: "P", 0x17: "Q", 0x18: "O", 0x19: "B", 0x1a: "G", 0x1c: "M",
    0x1d: "X", 0x1e: "V", 0x04: " ", 0x02: "\n", 0x08: "",
  };
  const ITA2_FIGS: Record<number, string> = {
    0x01: "3", 0x03: "-", 0x05: "'", 0x06: "8", 0x07: "7", 0x09: "$", 0x0a: "4", 0x0b: "'",
    0x0c: ",", 0x0d: "!", 0x0e: ":", 0x0f: "(", 0x10: "5", 0x11: '"', 0x12: ")", 0x13: "2",
    0x14: "#", 0x15: "6", 0x16: "0", 0x17: "1", 0x18: "9", 0x19: "?", 0x1a: "&", 0x1c: ".",
    0x1d: "/", 0x1e: ";", 0x04: " ", 0x02: "\n", 0x08: "",
  };
  const SPS = 11;
  let fbuf: number[] = [], fpos = 0, figsShift = false, rttyLine = "";
  let sampleIdx = 0;
  const ex = eye.getContext("2d")!;
  ex.fillStyle = "#020604"; ex.fillRect(0, 0, eye.width, eye.height);
  const resetRtty = () => { fbuf = []; fpos = 0; figsShift = false; };
  const fskThreshold = (): number => {
    if (fbuf.length < 40) return 0;
    const w = [...fbuf.slice(-440)].sort((a, b) => a - b);
    return (w[Math.floor(w.length * 0.1)] + w[Math.floor(w.length * 0.9)]) / 2;
  };
  const emitRtty = (code: number) => {
    if (code === 0x1f) { figsShift = false; return; }
    if (code === 0x1b) { figsShift = true; return; }
    if (code === 0x00) return;
    const ch = (figsShift ? ITA2_FIGS : ITA2_LTRS)[code] ?? "·";
    if (!ch) return;
    rttyText = (rttyText + ch).slice(-2400);
    rttyLine += ch;
    if (ch === "\n" || rttyLine.replace(/ /g, "").length >= 40) { commitIntercept("RTTY", rttyLine); rttyLine = ""; }
    if (paneTab === "rtty") { copyPane.textContent = rttyText; copyPane.scrollTop = copyPane.scrollHeight; }
  };
  function feedFsk(vs: Float32Array) {
    const thr0 = fskThreshold();
    for (const v of vs) {
      fbuf.push(v); sampleIdx++;
      /* eye: fold at the symbol period, fade slowly */
      const x = (sampleIdx % SPS) / SPS * eye.width;
      const y = eye.height / 2 - Math.max(-1, Math.min(1, v / 500)) * (eye.height / 2 - 2);
      ex.fillStyle = "rgba(120,255,170,0.75)";
      ex.fillRect(x, y, 1.6, 1.6);
    }
    ex.fillStyle = "rgba(2,6,4,0.10)"; ex.fillRect(0, 0, eye.width, eye.height);
    const thrY = eye.height / 2 - Math.max(-1, Math.min(1, thr0 / 500)) * (eye.height / 2 - 2);
    ex.strokeStyle = "rgba(255,95,86,0.8)"; ex.beginPath(); ex.moveTo(0, thrY); ex.lineTo(eye.width, thrY); ex.stroke();
    const thr = fskThreshold();
    const bitAt = (center: number): number => {
      let acc = 0, cnt = 0;
      for (let k = -1; k <= 1; k++) { const idx = Math.round(center) + k; if (idx >= 0 && idx < fbuf.length) { acc += fbuf[idx]; cnt++; } }
      return cnt && acc / cnt > thr ? 1 : 0;
    };
    while (fpos + Math.round(7.5 * SPS) < fbuf.length) {
      /* hunt a mark→space edge */
      if (!(fbuf[fpos] <= thr && (fpos === 0 || fbuf[fpos - 1] > thr))) { fpos++; continue; }
      if (bitAt(fpos + 0.5 * SPS) !== 0) { fpos++; continue; }
      let code = 0;
      for (let k = 1; k <= 5; k++) code |= bitAt(fpos + (k + 0.5) * SPS) << (k - 1);
      emitRtty(code);
      fpos += Math.round(7.5 * SPS);
    }
    if (fpos > 3000) { fbuf = fbuf.slice(fpos); sampleIdx -= fpos; fpos = 0; }
  }

  /* ---------------- registry engine ---------------- */
  const classify = (st: Station): [string, string] => {
    if (st.hits < 12) return ["carrier", "possible"];
    /* RTTY/FSK is a BIMODAL claim: two stable tones, not jitter. */
    if (st.freqHist.length >= 16 && st.widthHz < 700) {
      const sorted = [...st.freqHist].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const lo = st.freqHist.filter((f) => f < med - 40).length;
      const hi = st.freqHist.filter((f) => f > med + 40).length;
      const span = sorted[sorted.length - 1] - sorted[0];
      if (span > 110 && span < 520 && lo > st.freqHist.length * 0.22 && hi > st.freqHist.length * 0.22) {
        return ["RTTY · FSK", st.hits > 60 ? "firm" : "probable"];
      }
    }
    /* Duty cycle from the pattern-of-life trail: broadcasters and
       repeaters are always there; keyed signals come and go. The
       W1 grader ignored it and called everything CW — width plus
       duty separates the band honestly. */
    const recent = st.trail.slice(-30);
    const duty = recent.length >= 8 ? recent.filter(Boolean).length / recent.length : null;
    if (st.widthHz > 6000) return ["FM · wide", st.hits > 60 ? "firm" : "probable"];
    if (st.widthHz > 1200) {
      if (duty !== null && duty > 0.85) return ["AM · broadcast", "probable"];
      if (duty !== null && duty > 0.3) return ["SSB · voice", "probable"];
      return ["wideband signal", "possible"];
    }
    if (st.widthHz < 320) {
      if (duty !== null && duty > 0.12 && duty < 0.82) return ["CW beacon", st.hits > 60 ? "firm" : "probable"];
      if (duty !== null && duty >= 0.9) return ["carrier", "probable"];
      if (st.hits > 30) return ["CW?", "probable"];
      return ["carrier", "possible"];
    }
    if (duty !== null && duty > 0.3 && duty < 0.92) return ["FSK · data", "possible"];
    return ["carrier", "possible"];
  };

  const registryTick = (mag: Float32Array, sr: number) => {
    const n = mag.length;
    const sorted = Array.from(mag).sort((a, b) => a - b);
    const floor = sorted[Math.floor(n * 0.5)];
    const now = Date.now();
    const rawPeaks: Array<{ f: number; db: number; w: number }> = [];
    for (let i = 2; i < n - 2; i++) {
      if (mag[i] > floor + 15 && mag[i] >= mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > mag[i - 2] + 1.5 && mag[i] > mag[i + 2] + 1.5) {
        let w = 0; for (let j = i; j < n && mag[j] > floor + 8; j++) w++;
        for (let j = i - 1; j > 0 && mag[j] > floor + 8; j--) w++;
        rawPeaks.push({ f: (i / (n - 1)) * (sr / 2), db: mag[i], w: (w / (n - 1)) * (sr / 2) });
      }
    }
    /* non-max suppression: one peak per 90 Hz neighbourhood */
    rawPeaks.sort((a, b) => b.db - a.db);
    const peaks: Array<{ f: number; db: number; w: number }> = [];
    for (const p of rawPeaks) {
      if (peaks.every((q) => Math.abs(q.f - p.f) > 90)) peaks.push(p);
      if (peaks.length >= 14) break;
    }
    /* candidate persistence: a peak must return 3 ticks running
       before it earns a registry row — transients stay noise. */
    for (const p of peaks) {
      const cand = candidates.find((c) => Math.abs(c.f - p.f) < 110);
      if (cand) { cand.f = cand.f * 0.6 + p.f * 0.4; cand.n++; } else candidates.push({ f: p.f, n: 1 });
    }
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!peaks.some((p) => Math.abs(p.f - candidates[i].f) < 110)) candidates.splice(i, 1);
    }
    const confirmed = peaks.filter((p) => (candidates.find((c) => Math.abs(c.f - p.f) < 110)?.n ?? 0) >= 3);
    for (const p of confirmed) {
      let st = stations.find((s) => Math.abs(s.freq - p.f) < 130);
      if (!st) {
        st = { freq: p.f, first: now, last: now, hits: 0, peakDb: p.db, widthHz: p.w, guess: "carrier", grade: "possible", trail: [], freqHist: [] };
        stations.push(st);
      }
      st.last = now; st.hits++; st.peakDb = Math.max(st.peakDb, p.db); st.widthHz = p.w;
      st.freq = st.freq * 0.7 + p.f * 0.3;
      st.freqHist.push(p.f); if (st.freqHist.length > 24) st.freqHist.shift();
      [st.guess, st.grade] = classify(st);
    }
    /* pattern-of-life trail, 1 bit/sec */
    const sec = Math.floor(now / 1000);
    for (const st of stations) {
      const alive = now - st.last < 4000;
      const lastSec = (st as unknown as { _sec?: number })._sec ?? sec;
      if (sec !== lastSec) { st.trail.push(alive ? 1 : 0); if (st.trail.length > 90) st.trail.shift(); (st as unknown as { _sec?: number })._sec = sec; }
    }
    stations = stations.filter((s) => now - s.last < 30 * 60 * 1000).slice(0, 24);
  };

  const renderRegistry = () => {
    const rows = stations
      .filter((st) => Date.now() - st.last < 90000)
      .sort((a, b) => b.hits - a.hits).slice(0, 12)
      .sort((a, b) => a.freq - b.freq).map((st) => {
      const tr = document.createElement("tr");
      const alive = Date.now() - st.last < 5000;
      tr.style.opacity = alive ? "1" : "0.45";
      /* live envelope evidence at the tuned slice outranks the
         registry's structural guess for the station you're hearing */
      let guess = st.guess;
      if (running && Math.abs(st.freq - freq) < 200 && statsCv !== null) {
        if (statsCv > 0.42) guess = "AM · broadcast";
        else if (statsCv < 0.15 && st.widthHz > 3000) guess = "FM · wide";
      }
      const cells = [
        (st.freq / 1000).toFixed(3), guess, st.grade,
        `${Math.round(st.peakDb)} dB`, st.hits.toString(),
        new Date(st.first).toLocaleTimeString(), new Date(st.last).toLocaleTimeString(),
        st.trail.map((b) => (b ? "▮" : "·")).join(""),
      ];
      for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
      tr.addEventListener("click", () => tune(st.freq));
      return tr;
    });
    const headRow = document.createElement("tr");
    for (const h of ["kHz", "id", "grade", "peak", "hits", "first", "last", "pattern"]) {
      const th = document.createElement("th"); th.textContent = h; headRow.appendChild(th);
    }
    regTable.replaceChildren(headRow, ...rows);
  };

  /* ---------------- draw loop + housekeeping ---------------- */
  const fx = fall.getContext("2d")!;
  const draw = () => {
    if (!body.isConnected) return;
    const W = fall.width, H = fall.height, specH = 74;
    fx.drawImage(hist, 0, specH);
    if (latestMag) {
      const mag = latestMag, n = mag.length;
      /* spectrum */
      fx.fillStyle = "#020604"; fx.fillRect(0, 0, W, specH);
      fx.strokeStyle = "rgba(120,255,170,0.9)"; fx.beginPath();
      for (let x = 0; x < W; x++) {
        const db = mag[Math.floor((x / W) * (n - 1))];
        const y = specH - Math.max(0, Math.min(1, (db + 105) / 55)) * (specH - 6) - 3;
        if (x === 0) fx.moveTo(x, y); else fx.lineTo(x, y);
      }
      fx.stroke();
    }
    /* tuning marker + passband */
    const nyq = (ctx ? ctx.sampleRate : 48000) / 2;
    const tx = (freq / nyq) * W;
    const bwPx = (Number(bwSel.value) / nyq) * W;
    fx.fillStyle = "rgba(255,90,90,0.10)";
    fx.fillRect(tx - bwPx / 2, 0, bwPx, H);
    fx.strokeStyle = "#ff5f56"; fx.beginPath(); fx.moveTo(tx, 0); fx.lineTo(tx, H); fx.stroke();
    fx.fillStyle = "rgba(230,255,240,0.75)"; fx.font = "11px monospace";
    for (let k = 0; k <= 24; k += 4) fx.fillText(`${k}`, (k * 1000 / nyq) * W + 3, H - 6);
    /* measurement cursors */
    for (const [cf, col, lab] of [[curA, "#57d7ff", "A"], [curB, "#ff57d7", "B"]] as Array<[number | null, string, string]>) {
      if (cf === null) continue;
      const cx = (cf / nyq) * W;
      fx.strokeStyle = col; fx.beginPath(); fx.moveTo(cx, 0); fx.lineTo(cx, H); fx.stroke();
      fx.fillStyle = col; fx.fillText(lab, cx + 3, 12);
    }
    /* measurements: SNR + occupied bandwidth at the tuned slice */
    if (latestMag && running) {
      const mag = latestMag, n = mag.length;
      const binHz = nyq / (n - 1);
      const tBin = Math.round(freq / binHz);
      const srt = [...mag].sort((a, b) => a - b);
      const floorDb = srt[Math.floor(n * 0.5)];
      const snr = Math.max(0, (mag[Math.min(n - 1, tBin)] ?? floorDb) - floorDb);
      const halfWin = Math.round(12000 / binHz);
      const lo = Math.max(0, tBin - halfWin), hi = Math.min(n - 1, tBin + halfWin);
      let total = 0; const pw: number[] = [];
      for (let i = lo; i <= hi; i++) { const p = Math.pow(10, mag[i] / 10); pw.push(p); total += p; }
      let acc = 0, oLo = lo, oHi = hi;
      for (let i = 0; i < pw.length; i++) { acc += pw[i]; if (acc <= total * 0.005) oLo = lo + i; if (acc <= total * 0.995) oHi = lo + i; }
      const obw = Math.max(binHz, (oHi - oLo) * binHz);
      const parts = [
        `SNR ${snr.toFixed(0)} dB`, `OBW ${obw >= 1000 ? (obw / 1000).toFixed(2) + " kHz" : obw.toFixed(0) + " Hz"}`,
        `env CV ${statsCv !== null ? statsCv.toFixed(2) : "—"}`,
      ];
      if (curA !== null) parts.push(`A ${(curA / 1000).toFixed(3)}`);
      if (curB !== null) parts.push(`B ${(curB / 1000).toFixed(3)}`);
      if (curA !== null && curB !== null) parts.push(`Δ ${Math.abs(curA - curB).toFixed(0)} Hz`);
      const txt = parts.join(" · ");
      if (readout.textContent !== txt) readout.textContent = txt;
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  const housekeep = window.setInterval(() => {
    if (!body.isConnected) {
      window.clearInterval(housekeep);
      stopSource();
      void ctx?.close();
      try { localStorage.setItem(skey(REG_KEY), JSON.stringify(stations.map(({ trail, freqHist, ...rest }) => rest))); } catch { /* private mode */ }
      return;
    }
    renderRegistry();
    const chip = document.getElementById("os-emcon-chip");
    if (master && chip) master.gain.value = chip.dataset.level === "alpha" ? 0 : 1;
  }, 1500);

}
