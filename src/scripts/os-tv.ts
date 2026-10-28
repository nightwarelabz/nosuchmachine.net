/* the TV room — free and open broadcast television from across the
 * planet, played in the room.
 *
 * The catalog (public/tv/channels.json) is a build-time-verified
 * snapshot of public broadcasters' official live streams and
 * free-to-air channels: every entry answered as valid HLS on the
 * day the catalog was cut, and streams rot, so the room says so.
 *
 * Two facts of the house's content policy shape the player.
 * First, connect-src is 'self', so nothing here reaches a
 * broadcaster directly: every playlist and segment rides the
 * house relay (/api/tv), which guards each target the way every
 * bench probe is guarded. Second, the OS policy carries no
 * media-src, so media falls back to default-src 'self' — and a
 * MediaSource load is a blob: load, which is not 'self': Chromium
 * refuses it outright ("Media load rejected by URL safety
 * check", convicted in the drive rig). The OS policy is not
 * loosened for this room. The player is therefore a document of
 * its own — /tv/player.html, on the nexuiz play-frame precedent —
 * under a subtree policy scoped to a player (engine script, the
 * same-origin relay, blob media), and this room speaks to it over
 * postMessage. The engine inside the frame is hls.js, pinned and
 * shipped same-origin (/tv/hls.js), with the video element's own
 * HLS (Safari) as the fallback path — same relay either way.
 *
 * A stream is wire contact, like the SIGINT bench's stations:
 * EMCON bravo/alpha refuse it with the Standard's words and no
 * fetch happens, and a rise mid-play stands the channel down.
 *
 * And playback is playback: it ends only when this window closes,
 * when the operator stops or pauses it, when the channel changes,
 * or when EMCON rises — never because the window was minimized,
 * covered, or the tab hidden. The room therefore takes no action
 * at all on os:suspend; the frame and its media are its own to
 * keep, exactly as the bench keeps a playing station. */
import { verb, type BlacksiteOS } from "./os-shell";
import { t, tf } from "./os-i18n";

interface Channel {
  id: string;
  name: string;
  country: string;
  code: string;
  region: string;
  languages: string[];
  category: string;
  stream: string;
  site?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---------------- EMCON — the house gate, read off the same chip
 * the SIGINT bench reads, in the Standard's own words. */
const emconLevel = (): string =>
  document.getElementById("os-emcon-chip")?.dataset.level ?? "open";
const gateRefusal = (): string | null => {
  const lvl = emconLevel();
  if (lvl === "alpha") return "the Standard forbids this: emcon alpha is total silence — no wire contact at all.";
  if (lvl === "bravo") return "the Standard forbids this: emcon bravo is receive-only — a live stream is wire contact, and it stands down.";
  return null;
};

const relayUrl = (u: string) => `/api/tv?u=${encodeURIComponent(u)}`;

/* The catalog loads once per page session. */
let catalogPromise: Promise<Channel[]> | null = null;
function loadCatalog(): Promise<Channel[]> {
  if (!catalogPromise) {
    catalogPromise = fetch("/tv/channels.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Channel[]>; })
      .catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

type PlayState = "idle" | "loading" | "playing" | "dead";

export function buildTvApp(body: HTMLElement, _os: BlacksiteOS, arg?: string): void {
  body.innerHTML = "";
  const wrap = el("div", "os-tv");

  /* ——— the browser ——— */
  const side = el("div", "os-tv-side");
  const search = el("input", "os-tv-search") as HTMLInputElement;
  search.type = "text";
  search.placeholder = t("search channels");
  search.setAttribute("aria-label", t("search channels"));
  if (arg) search.value = arg;
  const filters = el("div", "os-tv-filters");
  const regionSel = el("select", "os-tv-sel") as HTMLSelectElement;
  regionSel.setAttribute("aria-label", t("region"));
  const catSel = el("select", "os-tv-sel") as HTMLSelectElement;
  catSel.setAttribute("aria-label", t("category"));
  filters.append(regionSel, catSel);
  const count = el("p", "os-tv-count");
  const list = el("div", "os-tv-list");
  side.append(search, filters, count, list);

  /* ——— the player ——— */
  const stage = el("div", "os-tv-stage");
  const frame = el("iframe", "os-tv-frame") as HTMLIFrameElement;
  frame.src = "/tv/player.html";
  frame.allow = "fullscreen";
  frame.setAttribute("title", "TV");
  const now = el("div", "os-tv-now");
  const nowMain = el("span", "os-tv-now-main", t("nothing playing"));
  const nowState = el("span", "os-tv-now-state");
  now.append(nowMain, nowState);
  const bar = el("div", "os-tv-bar");
  const stopBtn = el("button", "os-btn", t("stop"));
  const note = el("p", "os-tv-note", t("free and open broadcasts — public streams, verified when this catalog was cut; streams rot, and a dead channel says so."));
  bar.append(stopBtn);
  stage.append(frame, now, bar, note);
  wrap.append(side, stage);
  body.appendChild(wrap);

  let channels: Channel[] = [];
  let current: Channel | null = null;
  let state: PlayState = "idle";
  let loadTimer = 0;
  let disposed = false;
  let frameReady = false;
  let queued: string | null = null;

  const setState = (s: PlayState, reason = "") => {
    state = s;
    nowState.textContent =
      s === "loading" ? ` · ${t("loading")}` :
      s === "playing" ? ` · ${t("playing")}` :
      s === "dead" ? ` · ${t("dead")}${reason ? ` — ${reason}` : ""}` : "";
    nowState.dataset.state = s;
  };

  const reasonText = (code: string): string => {
    if (code.startsWith("http:")) return tf("the channel answered HTTP {code}", { code: code.slice(5) });
    if (code === "broke") return t("the stream broke");
    if (code === "no-hls") return t("this browser cannot play HLS broadcasts");
    if (code === "no-answer") return t("the channel did not answer");
    return code;
  };

  const send = (msg: Record<string, unknown>) => {
    frame.contentWindow?.postMessage(msg, location.origin);
  };
  const commandPlay = (url: string) => {
    if (frameReady) send({ type: "tv:play", url });
    else queued = url;
  };
  const commandStop = () => {
    queued = null;
    if (frameReady) send({ type: "tv:stop" });
  };

  const stop = (toIdle = true) => {
    if (loadTimer) { window.clearTimeout(loadTimer); loadTimer = 0; }
    commandStop();
    current = null;
    if (toIdle) { nowMain.textContent = t("nothing playing"); setState("idle"); }
    for (const r of list.querySelectorAll(".os-tv-row.on")) r.classList.remove("on");
  };

  const play = (ch: Channel) => {
    /* EMCON first, before any word to the frame — the refusal is
       the Standard's, and a refused play touches no wire. */
    const refusal = gateRefusal();
    if (refusal) { nowMain.textContent = ch.name; setState("dead", refusal); return; }
    commandStop();
    current = ch;
    nowMain.textContent = `${ch.name} · ${ch.country} · ${ch.languages.join(", ") || "—"}`;
    setState("loading");
    for (const r of list.querySelectorAll(".os-tv-row")) {
      r.classList.toggle("on", (r as HTMLElement).dataset.id === ch.id);
    }
    if (loadTimer) window.clearTimeout(loadTimer);
    loadTimer = window.setTimeout(() => {
      if (!disposed && state === "loading" && current === ch) {
        commandStop();
        setState("dead", t("the channel did not answer in time"));
      }
    }, 25000);
    commandPlay(relayUrl(ch.stream));
  };

  const onMessage = (e: MessageEvent) => {
    if (disposed || e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === "tv:state") {
      if (!frameReady) {
        frameReady = true;
        if (queued) { const u = queued; queued = null; send({ type: "tv:play", url: u }); }
        return;
      }
      if (!current) return;
      if (e.data.state === "playing") {
        if (loadTimer) { window.clearTimeout(loadTimer); loadTimer = 0; }
        setState("playing");
      } else if (e.data.state === "dead") {
        if (loadTimer) { window.clearTimeout(loadTimer); loadTimer = 0; }
        setState("dead", reasonText(String(e.data.reason || "")));
      } else if (e.data.state === "loading") {
        setState("loading");
      }
    }
  };
  window.addEventListener("message", onMessage);

  stopBtn.addEventListener("click", () => stop());

  /* EMCON rise mid-play stands the channel down — the same watch
     the SIGINT bench keeps, on the same one-second cadence. It
     runs while the window is hidden too; a throttled timer still
     fires, and the law does not sleep. */
  const emconTick = window.setInterval(() => {
    if (disposed) return;
    const refusal = gateRefusal();
    if (refusal && current) {
      const name = current.name;
      stop(false);
      nowMain.textContent = name;
      setState("dead", refusal);
    }
  }, 1000);

  /* Close is the only lifecycle word that ends playback, and it is
     not a suspend: os:dispose is the window going away, and the
     frame dies with it. There is deliberately no os:suspend
     handler — hidden is not stopped. */
  body.addEventListener("os:dispose", () => {
    disposed = true;
    window.clearInterval(emconTick);
    window.removeEventListener("message", onMessage);
    stop(false);
  });

  /* ——— the browser's rendering ——— */
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const reg = regionSel.value;
    const cat = catSel.value;
    const rows = channels.filter((c) =>
      (!reg || c.region === reg) &&
      (!cat || c.category === cat) &&
      (!q || `${c.name} ${c.country} ${c.languages.join(" ")}`.toLowerCase().includes(q)));
    list.innerHTML = "";
    for (const c of rows) {
      const row = el("button", "os-tv-row" + (current?.id === c.id ? " on" : ""));
      row.dataset.id = c.id;
      const nm = el("span", "os-tv-row-name", c.name);
      const meta = el("span", "os-tv-row-meta", `${c.country} · ${c.languages.join(", ") || "—"} · ${c.category}`);
      row.append(nm, meta);
      row.addEventListener("click", () => void play(c));
      list.appendChild(row);
    }
    count.textContent = tf("{n} channels", { n: rows.length });
  };
  search.addEventListener("input", render);
  regionSel.addEventListener("change", render);
  catSel.addEventListener("change", render);

  void loadCatalog().then((cs) => {
    if (disposed) return;
    channels = cs;
    const regions = [...new Set(cs.map((c) => c.region))].sort();
    const cats = [...new Set(cs.map((c) => c.category))].sort();
    regionSel.append(new Option(t("all regions"), ""));
    for (const r of regions) regionSel.append(new Option(r, r));
    catSel.append(new Option(t("all categories"), ""));
    for (const c of cats) catSel.append(new Option(c, c));
    render();
  }).catch(() => {
    if (disposed) return;
    count.textContent = t("the catalog did not load");
  });
}

export function registerTvVerbs(): void {
  verb("tv", "LIVE", "tv — free and open broadcast television from across the planet, through the house relay; `tv <search>` opens the room filtered", async (ctx) => {
    const q = ctx.args.join(" ").trim();
    ctx.io.openApp?.("tv", q || undefined);
    return q
      ? tf("the TV room — channels matching {q}", { q })
      : t("the TV room — free and open broadcasts from across the planet.");
  });
}
