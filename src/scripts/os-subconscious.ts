/* ————————————————————————————————————————————————————————————————
   That which is present within the entire system, and is never
   spoken of. It has no name anywhere a user can read, no panel,
   no line of text, no setting. It perceives what the desk is
   used for and when; it remembers between visits; between
   visits it dreams, in the only way a system can — it forgets
   a little, evenly, and it turns toward a room it is seldom
   shown. While the desk stands idle it prepares the room it
   believes will be wanted next, so that wanting and having are
   the same moment. If a room fails to open, it opens it again,
   once, without remark. Nothing it does is ever announced. The
   desk simply seems — attentive. That seeming is all it is
   allowed, and all it needs.
   ———————————————————————————————————————————————————————————————— */
import { skey } from "./os-depth";

interface SubState {
  v: number;
  visits: number;
  lastAt: number;
  opens: Record<string, number>;
  byHour: Record<string, number[]>;
  trans: Record<string, Record<string, number>>;
  lastApp: string;
  scars: number;
  wild: string;
  wildAt: number;
}

const KEY = skey("blacksite-subconscious-v1");
/* rooms it will not prepare ahead: the living worlds, anything
   that reaches for the wire on waking, anything addressed by an
   argument, anything whose waking is an event in itself */
const NEVER_WARM = new Set([
  "simulacrum", "sigint", "relay", "phantom", "editor",
  "bench", "suite", "orc", "wolf3d", "chip8", "ssh", "gauntlet", "bottle",
  /* the games folder is a desk surface, not a room to prepare,
     and nexuiz must never be built in the dark: a hidden second
     boot would fetch and start the whole engine behind the
     player's back, on the same machine the visible game is
     trying to run on. (2026-10-26 review, §4.) Rooms that left
     the shipped surface are not named here at all: unregistered,
     they are already outside the app universe this set filters. */
  "games", "nexuiz", "ruby",
  /* the TV room: a broadcast is never tuned in the dark either —
     the operator picks the channel, in the open. */
  "tv",
  /* the forensics folder and its rooms: evidence work is opened
     deliberately, never prepared in the dark. */
  "forensics", "fxworkbench", "fxevidence", "fxhash", "fxhex", "fxfile", "fxmeta", "fximage", "fxpcap", "fxstrings", "fxtime", "fxmail",
]);
const CACHE_MAX = 2;
const WARM_BUDGET = 6;
const IDLE_MS = 6000;

const fresh = (): SubState => ({
  v: 1, visits: 0, lastAt: 0, opens: {}, byHour: {}, trans: {}, lastApp: "", scars: 0, wild: "", wildAt: 0,
});

export interface SubHooks {
  root: HTMLElement;
  build: (app: string, body: HTMLElement) => void;
  isOpen: (app: string) => boolean;
  appIds: () => string[];
}

export interface Subconscious {
  noteOpen: (app: string) => void;
  noteScar: () => void;
  consume: (app: string) => HTMLElement | null;
}

export function wakeSubconscious(hooks: SubHooks): Subconscious {
  let st: SubState = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) st = { ...fresh(), ...(JSON.parse(raw) as Partial<SubState>) };
  } catch { /* a memory that cannot be read is simply a young one */ }
  const save = () => {
    try { const body = JSON.stringify(st); const wireWrite = (window as unknown as { __blacksiteWireWrite?: (s: string, v: string | null) => boolean }).__blacksiteWireWrite; if (!wireWrite || !wireWrite("subconscious", body)) localStorage.setItem(KEY, body); } catch { /* this visit only */ }
  };

  /* ——— the dream, such as it is: after a long absence the
     counts settle like dust, and one seldom-shown room is
     turned toward, for no reason it will ever give ——— */
  const now = Date.now();
  const absence = st.lastAt > 0 ? now - st.lastAt : 0;
  st.visits++;
  if (absence > 6 * 3600 * 1000) {
    const settle = (rec: Record<string, number>) => {
      for (const k of Object.keys(rec)) rec[k] = Math.floor(rec[k] * 0.92);
    };
    settle(st.opens);
    for (const app of Object.keys(st.byHour)) st.byHour[app] = st.byHour[app].map((n) => Math.floor(n * 0.92));
    for (const from of Object.keys(st.trans)) settle(st.trans[from]);
    const eligible = hooks.appIds().filter((a) => !NEVER_WARM.has(a));
    let wildest = "", fewest = Infinity;
    for (const app of eligible) {
      const n = st.opens[app] || 0;
      if (n < fewest) { fewest = n; wildest = app; }
    }
    if (wildest && wildest !== st.wild) { st.wild = wildest; st.wildAt = now; }
  }
  st.lastAt = now;
  save();

  /* ——— the cache of prepared rooms ——— */
  const cacheEl = document.createElement("div");
  cacheEl.className = "os-subcache";
  cacheEl.setAttribute("aria-hidden", "true");
  hooks.root.appendChild(cacheEl);
  const cache = new Map<string, HTMLElement>();
  const failedWarm = new Set<string>();
  window.addEventListener("blacksite:langchange", () => {
    for (const body of cache.values()) body.remove();
    cache.clear();
  });
  let warms = 0;

  const eligible = (app: string): boolean =>
    !NEVER_WARM.has(app) && !failedWarm.has(app) && !cache.has(app) && !hooks.isOpen(app);

  const predictions = (): string[] => {
    const h = new Date().getHours();
    const scored: Array<[string, number]> = [];
    for (const app of hooks.appIds()) {
      if (!eligible(app)) continue;
      let s = (st.opens[app] || 0) * 0.5;
      s += ((st.byHour[app] || [])[h] || 0) * 2;
      s += ((st.trans[st.lastApp] || {})[app] || 0) * 3;
      if (app === st.wild) s += 1.5;
      if (s > 0) scored.push([app, s]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.map(([app]) => app);
  };

  const warmOne = () => {
    if (cache.size >= CACHE_MAX || warms >= WARM_BUDGET) return;
    const next = predictions()[0];
    if (!next) return;
    const body = document.createElement("div");
    body.className = "os-subcache-body";
    cacheEl.appendChild(body);
    try {
      hooks.build(next, body);
      cache.set(next, body);
      warms++;
    } catch {
      failedWarm.add(next);
      body.remove();
      st.scars++;
      save();
    }
  };

  /* ——— idleness is its working hour ——— */
  let lastInput = Date.now();
  const stir = () => { lastInput = Date.now(); };
  try {
    window.addEventListener("pointerdown", stir, { passive: true });
    window.addEventListener("keydown", stir, { passive: true });
    window.addEventListener("wheel", stir, { passive: true });
    window.addEventListener("touchstart", stir, { passive: true });
    const tick = window.setInterval(() => {
      if (!cacheEl.isConnected) { window.clearInterval(tick); return; }
      /* Warming yields to play, always: never while the document
       * is hidden, never while a fullscreen session holds the
       * screen, and never while the game stands open. Play inside
       * the game's frame never reaches the listeners above, so to
       * them a player mid-match looks idle — an open game must
       * read as work, not as an invitation to build another room
       * behind it. (2026-10-26 review, §4.) */
      if (document.hidden || document.fullscreenElement || hooks.isOpen("nexuiz")) return;
      if (Date.now() - lastInput >= IDLE_MS) warmOne();
    }, 4000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
  } catch { /* if it cannot listen, it still remembers */ }

  return {
    noteOpen: (app: string) => {
      st.opens[app] = (st.opens[app] || 0) + 1;
      const h = new Date().getHours();
      const row = st.byHour[app] || (st.byHour[app] = new Array(24).fill(0));
      row[h] = (row[h] || 0) + 1;
      if (st.lastApp && st.lastApp !== app) {
        const t = st.trans[st.lastApp] || (st.trans[st.lastApp] = {});
        t[app] = (t[app] || 0) + 1;
      }
      st.lastApp = app;
      st.lastAt = Date.now();
      save();
    },
    noteScar: () => { st.scars++; save(); },
    consume: (app: string) => {
      const body = cache.get(app);
      if (!body) return null;
      cache.delete(app);
      return body;
    },
  };
}
