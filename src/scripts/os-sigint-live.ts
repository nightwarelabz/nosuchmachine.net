/* SIGINT live stations — real broadcast radio with no SDR attached.
 *
 * The bench's fourth source. The stations are real: the directory is
 * radio-browser.info (a community index of ~63k broadcasters), and
 * the audio is each station's own HTTPS stream, fetched by the tab.
 * This is programme audio, not RF — nothing here pretends to a tuned
 * frequency or passes through the demod modes; it lands on the
 * receiver's post-demod output bus (the master gain), next to what
 * the demodulator produces.
 *
 * Playback honesty — the trap this module exists to disarm: an
 * <audio> element routed through a MediaElementAudioSourceNode goes
 * SILENT when the stream carries no CORS headers, while the element
 * itself plays happily — and the site serves COEP: require-corp, so
 * a cross-origin stream with no CORP header is blocked before it
 * can even do that. (That pair is why every station once read as
 * dead.) So the graph route now loads the stream through the
 * house's own relay, /api/radio: same-origin, CORS-clean, COEP-
 * clean — the tap hears the station the directory promised. The
 * watchdog still judges the attempt: if the graph tap reads
 * silence while the element plays, the stream is re-routed DIRECT
 * on a fresh element (straight to output — nothing is routed twice
 * through a captured element) and the UI says so, knowing COEP may
 * refuse that too. A station that answers neither way is reported
 * dead, plainly. No station is ever listed that the directory did
 * not return.
 *
 * A third wall stood in front of both: the OS page's Content-
 * Security-Policy is connect-src 'self', so the browser's own
 * directory fetches to radio-browser.info were refused outright —
 * the list itself never loaded (convicted in a headless drive,
 * 2026-10-27: CSP violations on every mirror). The directory
 * therefore rides the house fetch edge (/api/fetch) like every
 * other bench lookup, and list sizes are capped at 40 so a reply
 * fits that edge's body cap.
 *
 * EMCON: a live stream is wire contact — an outbound request, the
 * same class the shell gates as "active". Under bravo or alpha the
 * source refuses to fetch or play, in the Standard's own words, and
 * a stream already playing stands down if the condition rises.
 */

export interface LiveStationRec {
  uuid: string;
  name: string;
  url: string;
  country: string;
  tags: string;
  codec: string;
  bitrate: number;
}

export interface LiveHooks {
  context: () => AudioContext | null;
  master: () => GainNode | null;
  gain: () => number;
  status: (text: string) => void;
  intercept: (text: string) => void;
}

export interface LiveSource {
  panel: HTMLElement;
  activate: () => void;
  deactivate: () => void;
  setGain: (v: number) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ---------------- EMCON — the house gate, read off the same chip
 * the bench's own housekeeping reads. A stream is "active" wire
 * contact in the shell gate's terms (an outbound fetch, like the
 * probes Wave 3 gated): bravo and alpha both refuse it. */
const emconLevel = (): string =>
  document.getElementById("os-emcon-chip")?.dataset.level ?? "open";
const gateRefusal = (): string | null => {
  const lvl = emconLevel();
  if (lvl === "alpha") return "the Standard forbids this: emcon alpha is total silence — no wire contact at all.";
  if (lvl === "bravo") return "the Standard forbids this: emcon bravo is receive-only — a live stream is wire contact, and it stands down.";
  return null;
};

/* ---------------- the directory ---------------- */
/* nl1.api.radio-browser.info is gone (it no longer answers at
 * all); de1 and de2 carry the directory, and all.api is the
 * project's round-robin name. Verified answering 2026-10-27. */
const BASES = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://all.api.radio-browser.info",
];

/* The directory rides the house fetch edge: the OS page's CSP
 * (connect-src 'self') refuses a direct browser fetch to the
 * mirrors, so each mirror is asked through /api/fetch in turn —
 * that edge sends the bench's own User-Agent, which is also what
 * radio-browser asks apps to identify themselves with. The edge
 * caps the body it hands back, so directory lists stay at 40. */
async function dirFetch(path: string): Promise<unknown> {
  let lastErr: unknown = null;
  for (const b of BASES) {
    try {
      const ctl = new AbortController();
      const to = window.setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(`/api/fetch?url=${encodeURIComponent(b + path)}`, { signal: ctl.signal });
      window.clearTimeout(to);
      const data = (await r.json()) as { ok?: boolean; status?: number; bodyText?: string; truncated?: boolean };
      if (!r.ok || !data?.ok || data.status !== 200 || typeof data.bodyText !== "string" || data.truncated) {
        throw new Error("the fetch edge could not carry the directory reply");
      }
      return JSON.parse(data.bodyText);
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("directory unreachable");
}

interface RawStation {
  stationuuid?: string; name?: string; url_resolved?: string; url?: string;
  country?: string; tags?: string; codec?: string; bitrate?: number;
}

function toRecs(raw: unknown): LiveStationRec[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LiveStationRec[] = [];
  for (const s of raw as RawStation[]) {
    const url = (s.url_resolved || s.url || "").trim();
    /* HTTPS only: the site is HTTPS, so an http stream is blocked
       as mixed content anyway — listing it would be a lie. */
    if (!url.startsWith("https://")) continue;
    const name = (s.name || "").trim();
    if (!name || seen.has(url)) continue;
    seen.add(url);
    out.push({
      uuid: s.stationuuid || "",
      name,
      url,
      country: (s.country || "").trim(),
      tags: (s.tags || "").trim(),
      codec: (s.codec || "").trim().toUpperCase(),
      bitrate: typeof s.bitrate === "number" ? s.bitrate : 0,
    });
  }
  return out;
}

/* ---------------- the source ---------------- */
export function createLiveSource(hooks: LiveHooks): LiveSource {
  const panel = el("div", "os-live");
  panel.hidden = true;

  const headRow = el("div", "os-sigint-copyhead");
  headRow.append(el("h4", "", "LIVE STATIONS"), el("span", "os-note", "directory: radio-browser.info · real broadcast streams — programme audio, not RF"));
  const bar = el("div", "os-live-bar");
  const search = document.createElement("input");
  search.className = "os-live-search";
  search.placeholder = "station name…";
  search.setAttribute("aria-label", "Search stations by name");
  const searchBtn = el("button", "os-btn", "search");
  const browse = document.createElement("select");
  browse.className = "os-sigint-sel";
  browse.setAttribute("aria-label", "Browse the directory");
  const retryBtn = el("button", "os-btn", "retry");
  retryBtn.hidden = true;
  bar.append(search, searchBtn, browse, retryBtn);
  const note = el("p", "os-note os-live-note", "");
  const now = el("div", "os-live-now");
  now.hidden = true;
  const nowName = el("span", "os-live-nowname", "");
  const nowRoute = el("span", "os-live-route", "");
  const meter = document.createElement("canvas");
  meter.className = "os-live-meter"; meter.width = 90; meter.height = 12;
  const toggleBtn = el("button", "os-btn", "pause");
  const stopBtn = el("button", "os-btn", "stop");
  now.append(nowName, nowRoute, meter, toggleBtn, stopBtn);
  const list = el("div", "os-live-list");
  panel.append(headRow, bar, note, now, list);
  const mctx = meter.getContext("2d")!;

  /* browse menu: fixed entries + async country group */
  const BROWSE: Array<[string, () => Promise<LiveStationRec[]>]> = [
    ["top voted", () => loadPath("/json/stations/topvote/40?hidebroken=true")],
  ];
  const rebuildBrowse = (countries: string[]) => {
    browse.replaceChildren();
    const mk = (label: string, value: string) => {
      const o = document.createElement("option"); o.textContent = label; o.value = value; return o;
    };
    browse.appendChild(mk("browse: top voted", "top"));
    const tagG = document.createElement("optgroup"); tagG.label = "by tag";
    for (const t of ["news", "talk", "music", "jazz", "classical", "rock", "pop", "electronic", "world", "sports", "comedy", "oldies"]) {
      tagG.appendChild(mk(t, `tag:${t}`));
    }
    browse.appendChild(tagG);
    if (countries.length) {
      const cG = document.createElement("optgroup"); cG.label = "by country";
      for (const c of countries) cG.appendChild(mk(c, `country:${c}`));
      browse.appendChild(cG);
    }
  };
  rebuildBrowse([]);
  void (async () => {
    try {
      const raw = await dirFetch("/json/countries?order=stationcount&reverse=true&hidebroken=true") as Array<{ name?: string; stationcount?: number }>;
      const names = raw.filter((c) => c.name && (c.stationcount ?? 0) >= 60).slice(0, 36).map((c) => c.name!);
      if (names.length) rebuildBrowse(names);
    } catch { /* the menu simply stays without countries */ }
  })();

  async function loadPath(path: string): Promise<LiveStationRec[]> {
    return toRecs(await dirFetch(path));
  }
  const queryFor = (key: string): (() => Promise<LiveStationRec[]>) => {
    if (key.startsWith("tag:")) {
      const t = key.slice(4);
      return () => loadPath(`/json/stations/bytag/${encodeURIComponent(t)}?order=votes&reverse=true&hidebroken=true&limit=40`);
    }
    if (key.startsWith("country:")) {
      const c = key.slice(8);
      return () => loadPath(`/json/stations/bycountry/${encodeURIComponent(c)}?order=votes&reverse=true&hidebroken=true&limit=40`);
    }
    return BROWSE[0][1];
  };

  let lastQuery: () => Promise<LiveStationRec[]> = BROWSE[0][1];
  let loaded = false;

  const showPlate = (msg: string, retry: boolean) => {
    note.textContent = msg;
    retryBtn.hidden = !retry;
    list.replaceChildren();
  };

  const renderList = (recs: LiveStationRec[]) => {
    list.replaceChildren();
    for (const rec of recs.slice(0, 60)) {
      const b = el("button", "os-live-row");
      if (playing && playing.rec.url === rec.url) b.classList.add("on");
      const meta = [
        rec.country || "—",
        rec.codec ? `${rec.codec}${rec.bitrate ? ` ${rec.bitrate}k` : ""}` : "",
        rec.tags.split(",").slice(0, 3).join(", "),
      ].filter(Boolean).join(" · ");
      b.append(el("span", "os-live-name", rec.name), el("span", "os-live-meta", meta));
      b.addEventListener("click", () => play(rec));
      list.appendChild(b);
    }
  };

  const runQuery = async (q: () => Promise<LiveStationRec[]>, what: string) => {
    const refusal = gateRefusal();
    if (refusal) { showPlate(refusal, false); hooks.status(refusal); return; }
    lastQuery = q;
    note.textContent = `asking the directory (${what})…`;
    retryBtn.hidden = true;
    try {
      const recs = await q();
      loaded = true;
      if (!recs.length) { showPlate(`the directory answered, but nothing playable (HTTPS) matched ${what}.`, false); return; }
      note.textContent = `${recs.length} stations · ${what} · click one to play it`;
      renderList(recs);
    } catch {
      showPlate("the directory didn't answer on any mirror. No stations are shown, because none were fetched; nothing here is ever faked. Retry when the wire is back.", true);
      hooks.status("live stations: the radio-browser directory did not answer");
    }
  };

  searchBtn.addEventListener("click", () => {
    const q = search.value.trim();
    if (!q) return;
    void runQuery(() => loadPath(`/json/stations/search?name=${encodeURIComponent(q)}&order=votes&reverse=true&hidebroken=true&limit=40`), `search “${q}”`);
  });
  search.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") searchBtn.click();
  });
  browse.addEventListener("change", () => { void runQuery(queryFor(browse.value), browse.selectedOptions[0]?.textContent ?? "browse"); });
  retryBtn.addEventListener("click", () => { void runQuery(lastQuery, "retry"); });

  /* ---------------- playback ---------------- */
  /* The graph route never loads a station cross-origin: the house
     relay (/api/radio) carries the stream same-origin so COEP and
     CORS cannot silence the tap. The direct route keeps the
     station's own URL — it is the fallback, by definition. */
  const relayUrl = (u: string) => `/api/radio?u=${encodeURIComponent(u)}`;
  interface Playing {
    rec: LiveStationRec;
    route: "graph" | "direct";
    el: HTMLAudioElement;
    srcNode: MediaElementAudioSourceNode | null;
    analyser: AnalyserNode | null;
    gnode: GainNode | null;
    watch: number;
    meterTick: number;
    emconTick: number;
    logged: boolean;
  }
  let playing: Playing | null = null;
  const buf = new Float32Array(256);

  const rms = (p: Playing): number => {
    if (!p.analyser) return 0;
    p.analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  const drawMeter = (v: number) => {
    mctx.fillStyle = "#020604"; mctx.fillRect(0, 0, meter.width, meter.height);
    mctx.fillStyle = "#3ddc84";
    const w = Math.max(0, Math.min(1, v * 3)) * meter.width;
    mctx.fillRect(0, 3, w, 6);
    now.dataset.rms = v.toFixed(4);
  };

  const teardownEl = (p: Playing) => {
    window.clearInterval(p.watch); window.clearInterval(p.meterTick); window.clearInterval(p.emconTick);
    try { p.el.pause(); } catch { /* noop */ }
    p.el.removeAttribute("src");
    try { p.el.load(); } catch { /* noop */ }
    try { p.srcNode?.disconnect(); } catch { /* noop */ }
    try { p.analyser?.disconnect(); } catch { /* noop */ }
    try { p.gnode?.disconnect(); } catch { /* noop */ }
  };

  const stopPlayback = () => {
    if (playing) { teardownEl(playing); playing = null; }
    now.hidden = true;
    now.dataset.route = "";
    drawMeter(0);
    for (const r of list.querySelectorAll(".os-live-row.on")) r.classList.remove("on");
  };

  const confirmPlaying = (p: Playing) => {
    if (p.logged) return;
    p.logged = true;
    const meta = [p.rec.country, p.rec.codec ? `${p.rec.codec}${p.rec.bitrate ? ` ${p.rec.bitrate}k` : ""}` : ""].filter(Boolean).join(" · ");
    hooks.intercept(`${p.rec.name}${meta ? ` · ${meta}` : ""} · live stream`);
    if (p.rec.uuid) void dirFetch(`/json/url/${encodeURIComponent(p.rec.uuid)}`).catch(() => { /* the directory's click courtesy — best effort */ });
  };

  const startEmconWatch = (p: Playing) => {
    p.emconTick = window.setInterval(() => {
      const refusal = gateRefusal();
      if (refusal && playing === p) {
        stopPlayback();
        note.textContent = refusal;
        hooks.status(refusal);
      }
    }, 1000);
  };

  const goDirect = (p: Playing, reason: string) => {
    const rec = p.rec;
    teardownEl(p);
    const elx = new Audio();
    elx.preload = "auto";
    elx.src = rec.url;
    elx.volume = Math.min(1, Math.max(0, hooks.gain()));
    const np: Playing = { rec, route: "direct", el: elx, srcNode: null, analyser: null, gnode: null, watch: 0, meterTick: 0, emconTick: 0, logged: p.logged };
    playing = np;
    nowRoute.textContent = `direct — ${reason}; playing straight to output, unanalysed`;
    now.dataset.route = "direct";
    hooks.status(`source: live station · ${rec.name}${rec.country ? ` (${rec.country})` : ""} · direct`);
    drawMeter(0);
    let lastCt = 0, deadTicks = 0, heldNoted = false;
    const t0 = performance.now();
    np.watch = window.setInterval(() => {
      if (playing !== np) return;
      const ct = elx.currentTime, age = (performance.now() - t0) / 1000;
      if (elx.error || (!elx.paused && ct === lastCt && elx.readyState < 2 && ++deadTicks >= 10)) {
        window.clearInterval(np.watch);
        stopPlayback();
        note.textContent = `“${rec.name}” didn't answer — the stream stayed silent on both routes. Nothing is playing; pick another station.`;
        hooks.status(`live station ${rec.name}: no answer on either route`);
        return;
      }
      now.dataset.ct = ct.toFixed(1);
      if (ct > lastCt) { lastCt = ct; confirmPlaying(np); }
      else if (age > 9 && lastCt === 0 && !heldNoted) {
        /* held back (autoplay) or never started: say so once, and
           leave the element standing — the play button is a real
           user gesture and can still start it. */
        heldNoted = true;
        note.textContent = `“${rec.name}” hasn't started — the browser may be holding autoplay back on the direct route. Press play, or pick another station.`;
      }
    }, 500);
    startEmconWatch(np);
    void elx.play().catch(() => { /* the watchdog judges; the play button below is the gesture path */ });
  };

  const play = (rec: LiveStationRec) => {
    const refusal = gateRefusal();
    if (refusal) { note.textContent = refusal; hooks.status(refusal); return; }
    const ctx = hooks.context(), master = hooks.master();
    if (!ctx || !master) { hooks.status("power the receiver first — a live station plays on the receiver's output bus"); return; }
    stopPlayback();
    const ela = new Audio();
    ela.crossOrigin = "anonymous";
    ela.preload = "auto";
    ela.src = relayUrl(rec.url);
    let srcNode: MediaElementAudioSourceNode, analyser: AnalyserNode, gnode: GainNode;
    try {
      srcNode = ctx.createMediaElementSource(ela);
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      gnode = ctx.createGain(); gnode.gain.value = hooks.gain();
      srcNode.connect(analyser); analyser.connect(gnode); gnode.connect(master);
    } catch {
      /* a graph that cannot even be built is a direct station */
      const np: Playing = { rec, route: "graph", el: ela, srcNode: null, analyser: null, gnode: null, watch: 0, meterTick: 0, emconTick: 0, logged: false };
      playing = np; showNow(rec); goDirect(np, "the audio graph refused the element");
      return;
    }
    const p: Playing = { rec, route: "graph", el: ela, srcNode, analyser, gnode, watch: 0, meterTick: 0, emconTick: 0, logged: false };
    playing = p;
    showNow(rec);
    nowRoute.textContent = "tuning through the audio graph…";
    now.dataset.route = "tuning";
    p.meterTick = window.setInterval(() => { if (playing === p) { drawMeter(rms(p)); now.dataset.ct = p.el.currentTime.toFixed(1); } }, 200);
    const t0 = performance.now();
    let startCt = -1, advTicks = 0, silentAdv = 0;
    p.watch = window.setInterval(() => {
      if (playing !== p) return;
      const ct = ela.currentTime, r = rms(p), age = (performance.now() - t0) / 1000;
      if (startCt < 0 && ct > 0) startCt = ct;
      const advancing = startCt >= 0 && ct - startCt > 0.4;
      if (advancing && r > 0.004) {
        if (++advTicks >= 2) {
          window.clearInterval(p.watch);
          nowRoute.textContent = "analysed — playing through the bench's audio graph";
          now.dataset.route = "graph";
          hooks.status(`source: live station · ${rec.name}${rec.country ? ` (${rec.country})` : ""} · analysed`);
          confirmPlaying(p);
        }
        return;
      }
      if (ela.error || (age > 7 && startCt < 0)) {
        window.clearInterval(p.watch);
        goDirect(p, "the stream would not load through the graph");
        return;
      }
      if (advancing && r < 0.0012) {
        if (++silentAdv >= 6) {
          window.clearInterval(p.watch);
          goDirect(p, "no CORS headers — the graph heard silence while the station played");
          return;
        }
      } else silentAdv = 0;
      if (age > 14) {
        window.clearInterval(p.watch);
        goDirect(p, "the graph route never proved the signal");
      }
    }, 400);
    startEmconWatch(p);
    void ela.play().catch(() => { /* judged by the watchdog */ });
    drawMeter(0);
  };

  const showNow = (rec: LiveStationRec) => {
    now.hidden = false;
    nowName.textContent = rec.name;
    toggleBtn.textContent = "pause";
    for (const r of list.querySelectorAll(".os-live-row")) {
      r.classList.toggle("on", (r.querySelector(".os-live-name")?.textContent ?? "") === rec.name);
    }
  };

  toggleBtn.addEventListener("click", () => {
    if (!playing) return;
    if (playing.el.paused) { void playing.el.play().catch(() => { /* stays paused */ }); toggleBtn.textContent = "pause"; }
    else { playing.el.pause(); toggleBtn.textContent = "play"; }
  });
  stopBtn.addEventListener("click", () => {
    stopPlayback();
    hooks.status("live station stopped · the bench is quiet");
  });

  return {
    panel,
    activate: () => {
      panel.hidden = false;
      const refusal = gateRefusal();
      if (refusal) { showPlate(refusal, false); hooks.status(refusal); return; }
      if (!loaded) void runQuery(BROWSE[0][1], "top voted");
    },
    deactivate: () => {
      stopPlayback();
      panel.hidden = true;
    },
    setGain: (v: number) => {
      if (!playing) return;
      if (playing.route === "graph" && playing.gnode) playing.gnode.gain.value = v;
      else playing.el.volume = Math.min(1, Math.max(0, v));
    },
  };
}
