/* SDR DSP worklet — the wide ear's engine room.
 *
 * One real input stream (the "band": a synthesized band buffer, the
 * microphone, or a decoded audio file) enters; this processor
 *   - computes the wideband spectrum for the waterfall display,
 *   - mixes the tuned slice to baseband (NCO + Hilbert analytic),
 *   - demodulates it (CW / USB / LSB / AM / FM) to audio,
 *   - reports the CW envelope so the room can copy Morse.
 * Receive only, by construction: nothing here can transmit.
 */

const FFT_N = 2048;

/* Hilbert transformer, 31 taps (odd-length, antisymmetric). */
const HILBERT = (() => {
  const N = 31, half = (N - 1) / 2, taps = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = i - half;
    if (k === 0 || k % 2 === 0) { taps[i] = 0; continue; }
    const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    taps[i] = (2 / (Math.PI * k)) * win;
  }
  return taps;
})();
const HILBERT_DELAY = 15;

function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
  const mag = new Float32Array(n / 2 + 1);
  for (let i = 0; i <= n / 2; i++) {
    const m = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (n / 2);
    mag[i] = 20 * Math.log10(m + 1e-9);
  }
  return mag;
}

class SdrDsp extends AudioWorkletProcessor {
  constructor() {
    super();
    this.freq = 3200;          // tuned offset, Hz
    this.mode = "cw";
    this.bw = 500;             // Hz
    this.gain = 1.0;
    this.squelch = -95;        // dBFS slice power gate
    this.phase = 0;            // NCO
    this.bfoPhase = 0;
    this.hist = new Float32Array(HILBERT.length); // analytic builder
    this.histPos = 0;
    this.lpI = 0; this.lpQ = 0;                 // one-pole slice filter
    this.prevI = 0; this.prevQ = 0;             // FM discriminator
    this.agc = 0.2;
    this.slicePow = 0;
    this.envAcc = 0; this.envN = 0;
    this.specBuf = new Float32Array(FFT_N);
    this.specPos = 0; this.specHop = 0;
    this.recOn = false;
    this.recBuf = new Float32Array(8192);
    this.recPos = 0;
    this.port.onmessage = (e) => {
      const p = e.data || {};
      if (p.freq !== undefined) this.freq = p.freq;
      if (p.mode !== undefined) this.mode = p.mode;
      if (p.bw !== undefined) this.bw = p.bw;
      if (p.gain !== undefined) this.gain = p.gain;
      if (p.squelch !== undefined) this.squelch = p.squelch;
      if (p.record !== undefined) this.recOn = p.record;
    };
  }

  pushSpec(x) {
    this.specBuf[this.specPos++] = x;
    if (this.specPos >= FFT_N) {
      this.specPos = 0;
      const re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
      for (let i = 0; i < FFT_N; i++) {
        const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));
        re[i] = this.specBuf[i] * win;
      }
      const mag = fftMag(re, im);
      this.port.postMessage({ type: "spectrum", mag });
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const out = outputs[0][0];
    if (!input || !input[0]) { out.fill(0); return true; }
    const src = input[0];
    const sr = sampleRate;
    const ncoStep = (2 * Math.PI * this.freq) / sr;
    const bfoStep = (2 * Math.PI * 650) / sr;
    const alpha = 1 - Math.exp((-2 * Math.PI * (this.bw / 2)) / sr);
    for (let i = 0; i < src.length; i++) {
      const x = src[i];
      this.pushSpec(x);
      if (this.recOn) {
        this.recBuf[this.recPos++] = x;
        if (this.recPos >= this.recBuf.length) {
          this.port.postMessage({ type: "rec", chunk: this.recBuf.slice() });
          this.recPos = 0;
        }
      }
      /* analytic signal via Hilbert FIR */
      this.hist[this.histPos] = x;
      let q = 0;
      for (let t = 0; t < HILBERT.length; t++) {
        q += HILBERT[t] * this.hist[(this.histPos - t + HILBERT.length * 2) % HILBERT.length];
      }
      const iSig = this.hist[(this.histPos - HILBERT_DELAY + HILBERT.length * 2) % HILBERT.length];
      this.histPos = (this.histPos + 1) % HILBERT.length;
      /* mix the tuned slice to baseband */
      this.phase += ncoStep;
      const c = Math.cos(this.phase), s = Math.sin(this.phase);
      let zi = iSig * c + q * s;
      let zq = q * c - iSig * s;
      /* slice lowpass */
      this.lpI += alpha * (zi - this.lpI);
      this.lpQ += alpha * (zq - this.lpQ);
      zi = this.lpI; zq = this.lpQ;
      this.slicePow += 0.001 * (zi * zi + zq * zq - this.slicePow);
      const sliceDbEarly = 10 * Math.log10(this.slicePow + 1e-12);
      /* envelope for the CW decoder: slice magnitude BEFORE demod/AGC,
         windowed RMS — the AGC'd audio envelope is useless for keying
         (the AGC flattens marks and lifts spaces into false dots). */
      if (this.mode === "cw") {
        this.envAcc += zi * zi + zq * zq; this.envN++;
        if (this.envN >= 480) {
          this.port.postMessage({ type: "env", v: Math.sqrt(this.envAcc / this.envN), open: sliceDbEarly > this.squelch });
          this.envAcc = 0; this.envN = 0;
        }
      }
      const sliceDb = 10 * Math.log10(this.slicePow + 1e-12);
      let y = 0;
      if (this.mode === "am") {
        y = Math.sqrt(zi * zi + zq * zq) - 0.02;
      } else if (this.mode === "fm") {
        const dot = zi * this.prevI + zq * this.prevQ;
        const cross = zq * this.prevI - zi * this.prevQ;
        y = Math.atan2(cross, dot) * 2.2;
        this.prevI = zi; this.prevQ = zq;
      } else if (this.mode === "cw") {
        this.bfoPhase += bfoStep;
        y = zi * Math.cos(this.bfoPhase) - zq * Math.sin(this.bfoPhase);
      } else { /* usb / lsb: real part of the baseband analytic */
        y = zi;
      }
      /* slow AGC + squelch */
      const lvl = Math.abs(y);
      this.agc += (lvl > this.agc ? 0.002 : 0.0002) * (lvl - this.agc);
      const norm = y / Math.max(0.08, this.agc * 2.2);
      const open = sliceDb > this.squelch;
      out[i] = open ? Math.max(-1, Math.min(1, norm)) * 0.7 * this.gain : 0;
    }
    if (outputs[0][1]) outputs[0][1].set(out);
    return true;
  }
}

registerProcessor("sdr-dsp", SdrDsp);
