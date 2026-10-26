/* Nexuiz — Nexuiz Classic 2.5.2, the real game, in the room.
 *
 * The engine is DarkPlaces compiled from its real source tree to
 * WebAssembly (vendored self-hosted under /nexuiz/ — no CDN is
 * contacted), and the data is the original 2.5.2 release pack,
 * byte-for-byte, verified against its published SHA-256 before the
 * engine starts (the full provenance is in /nexuiz/NOTICE.txt).
 *
 * Multiplayer is the primary case: the house server thisissparta2!
 * runs natively at the house, and a browser client reaches it
 * through the house bridge (one WebSocket session there is one
 * player on the server; the engine's own socket layer dials the
 * bridge address verbatim — see public/nexuiz/play.js). When the
 * bridge address is known, opening this window deals you straight
 * into the shared room. Local play rides along: the game's own
 * menus and ladder, and a local MinstaHook bot match — house
 * configuration is config-only, the way real Nexuiz servers were
 * run (public/nexuiz/autoexec.cfg).
 *
 * Bots are a switch, never a condition: in the local match the
 * toggle below is the player's own (bot_number at the table), and
 * in the house room the fill is the host's server-side switch
 * (bot_join_empty / minplayers) — this window never forces it.
 *
 * The game runs inside a same-origin frame (play.html) so closing
 * this window ends its world cleanly, the way the phantom's worker
 * ends with its window. The player name is your Relay name when
 * you wear one.
 */
import { skey } from "./os-depth";

/* The house bridge address (wss) — one constant, on purpose.
 * This is the public door to thisissparta2!: the Tailscale Funnel
 * endpoint on the host Mac, TLS-terminated, proxying the bridge
 * that pipes the browser session to the room's server. A
 * per-browser override can be set in local storage under
 * blacksite-nexuiz-bridge (the seam the bridge's own contract
 * reserves). */
const HOUSE_BRIDGE = "wss://chases-macbook-air-1.taildc9dec.ts.net";

function bridgeUrl(): string {
  try {
    const raw = localStorage.getItem(skey("blacksite-nexuiz-bridge"));
    if (raw && /^(ws|wss):\/\/[^\s"']+$/.test(raw) && raw.length <= 200) return raw;
  } catch { /* no storage, no override */ }
  return HOUSE_BRIDGE;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* Desktop-first input is the only control design (keyboard +
 * mouse, pointer lock) — there are no touch controls, by ruling.
 * A touch-first visitor gets the recommendation instead of a
 * broken game: detected by a mobile UA token, or by the primary
 * pointer being coarse with no fine pointer available (a touch
 * laptop still reports a fine primary pointer and plays). */
function touchFirst(): boolean {
  try {
    if (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent)) return true;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    return coarse && !fine;
  } catch {
    return false;
  }
}

/* Opening the room takes the whole screen. The click that opens
 * the window is the gesture fullscreen asks for, and the builder
 * runs inside it; the OS open path calls this too, for a room
 * that was prepared ahead of the click (built at idle, when no
 * gesture stands) and for a window that already stands. Any
 * refusal — a session restored without a click, a browser that
 * wants its own say — leaves the window exactly as opened:
 * fullscreen is a welcome, never a gate. A touch-first stage
 * (data-touch) never asks: its note is not a game to enlarge. */
export function nexuizStageFullscreen(body: HTMLElement) {
  const stage = body.querySelector<HTMLElement>(".os-nexuiz-stage");
  if (!stage || stage.dataset.touch || document.fullscreenElement === stage) return;
  try { void stage.requestFullscreen?.().catch(() => undefined); } catch { /* the window stands */ }
}

function relayName(): string {
  try {
    const raw = localStorage.getItem(skey("blacksite-relay-v2"));
    if (!raw) return "";
    const data = JSON.parse(raw);
    const nick = typeof data?.nick === "string" ? data.nick : "";
    return nick.replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "").slice(0, 24);
  } catch {
    return "";
  }
}

export function buildNexuiz(body: HTMLElement) {
  const wrap = el("div", "os-nexuiz");
  const bar = el("div", "os-files-bar");
  const stage = el("div", "os-nexuiz-stage");
  const status = el("p", "os-note", "the table is minsta hook. pick a door.");
  const frame = document.createElement("iframe");
  frame.className = "os-nexuiz-frame";
  frame.setAttribute("title", "nexuiz");
  frame.setAttribute("allow", "pointer-lock; fullscreen; autoplay");
  stage.appendChild(frame);

  const notice0 = el("a", "os-btn small", "license & provenance");
  notice0.setAttribute("href", "/nexuiz/NOTICE.txt");
  notice0.setAttribute("target", "_blank");
  notice0.setAttribute("rel", "noreferrer");
  if (touchFirst()) {
    stage.dataset.touch = "1";
    bar.appendChild(notice0);
    const plateNote = el("p", "os-note", "nexuiz is played with a keyboard and a mouse — this screen is touch-first, and there are no touch controls. open the site on a laptop or desktop and the table is yours.");
    plateNote.style.padding = "18px 14px";
    stage.appendChild(plateNote);
    status.textContent = "best on a laptop or desktop.";
    wrap.append(bar, stage, status);
    body.appendChild(wrap);
    return;
  }

  /* The OS owns the game's storage story: ask the browser to keep
   * the origin's storage (the verified game packs, the engine's
   * user dir) instead of treating it as evictable cache. The grant
   * is the browser's call — where it refuses, the cache still
   * works, just without the promise. */
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(() => {});
    }
  } catch { /* storage persistence is a kindness, not a gate */ }

  const name = relayName();
  const bridge = bridgeUrl();
  let botsOn = true;
  const src = (mode: string) => {
    const q = new URLSearchParams({ mode });
    if (name) q.set("name", name);
    if (mode === "minsta") q.set("bots", botsOn ? "5" : "0");
    if (mode === "join") { q.set("bridge", bridge); q.set("server", "thisissparta2"); }
    return `/nexuiz/play.html?${q.toString()}`;
  };
  let mode = "";
  const deal = (next: string, note: string) => {
    mode = next;
    status.textContent = note;
    frame.src = src(next);
  };

  const spartaBtn = el("button", "os-btn small", "join thisissparta2!");
  spartaBtn.addEventListener("click", () => {
    if (!bridge) {
      status.textContent = "thisissparta2! is live at the house — its public bridge address is not published yet, so this door waits. local minsta hook is ready now.";
      return;
    }
    deal("join", "joining thisissparta2! — the shared room. other players arrive the same way you do.");
  });
  const minstaBtn = el("button", "os-btn small", "minsta hook — instant match");
  minstaBtn.addEventListener("click", () => deal("minsta", botsOn
    ? "minsta hook on aggressor, five bots. one shot, one kill — hook is your other hand."
    : "minsta hook on aggressor, no bots — the map is yours alone."));
  const menuBtn = el("button", "os-btn small", "nexuiz menu");
  menuBtn.addEventListener("click", () => deal("menu", "the game's own menu. single player ladder, create a match, options — as shipped in 2009."));
  const botsBtn = el("button", "os-btn small", "bots: on");
  botsBtn.addEventListener("click", () => {
    botsOn = !botsOn;
    botsBtn.textContent = botsOn ? "bots: on" : "bots: off";
    status.textContent = botsOn
      ? "bots on — the local match deals five in. (the house room's fill is the host's own switch, server-side.)"
      : "bots off — the local match deals none in. (the house room's fill is the host's own switch, server-side.)";
    if (mode === "minsta") deal("minsta", botsOn ? "minsta hook on aggressor, five bots." : "minsta hook on aggressor, no bots.");
  });
  const full = el("button", "os-btn small", "fullscreen");
  full.addEventListener("click", () => { void stage.requestFullscreen?.().catch(() => undefined); });
  const notice = el("a", "os-btn small", "license & provenance");
  notice.setAttribute("href", "/nexuiz/NOTICE.txt");
  notice.setAttribute("target", "_blank");
  notice.setAttribute("rel", "noreferrer");
  bar.append(spartaBtn, minstaBtn, menuBtn, botsBtn, full, notice);

  const keys = el("p", "os-note", "wasd move · mouse look (click the game to lock) · e: hook · space jump · esc menu");
  wrap.append(bar, stage, status, keys);
  body.appendChild(wrap);

  /* Escape in true fullscreen belongs to the game. By the game's
   * own design Esc is its menu key, so a press — and any hold
   * shorter than the exit hold — must reach the engine exactly
   * as pressed; the only way out of the fullscreen room is Esc
   * held continuously for 4.5 seconds. The Keyboard Lock API is
   * what makes that possible: while the stage holds the screen,
   * the lock captures Escape, so presses arrive here as ordinary
   * key events instead of the browser leaving fullscreen on the
   * first touch. Where the API is absent, nothing here engages
   * and the browser's stock behaviour stands.
   *
   * The clock lives in this frame: the fullscreen element — and
   * so the only exit — is the stage. The play frame watches the
   * key where the engine hears it and reports the edges
   * (esc-down / esc-up); a hold that starts here instead (focus
   * on the OS side of the stage) is forwarded into the frame as a
   * synthetic press, so the game still gets its menu key. A
   * second edge while a hold stands is the same press seen from
   * the other side of the glass and is ignored. */
  const ESC_HOLD_MS = 4500;
  let escSince = 0;
  let escTimer: number | undefined;
  const keyboard = () => (navigator as { keyboard?: { lock?: (keys: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  const escCancel = () => {
    escSince = 0;
    if (escTimer !== undefined) { clearTimeout(escTimer); escTimer = undefined; }
  };
  const escDown = () => {
    if (document.fullscreenElement !== stage || escSince) return;
    escSince = performance.now();
    escTimer = window.setTimeout(() => {
      escCancel();
      if (document.fullscreenElement === stage) {
        try { void document.exitFullscreen().catch(() => undefined); } catch { /* the screen is already ours again */ }
      }
    }, ESC_HOLD_MS);
  };
  const escUp = () => escCancel();
  const fwdEsc = (type: "keydown" | "keyup") => {
    try {
      const cw = frame.contentWindow as (Window & { KeyboardEvent: typeof KeyboardEvent }) | null;
      const canvas = frame.contentDocument?.getElementById("canvas");
      if (!cw || !canvas) return;
      canvas.dispatchEvent(new cw.KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));
    } catch { /* the frame is not ready to hear it */ }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.repeat || document.fullscreenElement !== stage) return;
    escDown();
    fwdEsc("keydown");
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || document.fullscreenElement !== stage) return;
    escUp();
    fwdEsc("keyup");
  };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  const onMsg = (ev: MessageEvent) => {
    if (ev.source !== frame.contentWindow || !ev.data || ev.data.from !== "nexuiz") return;
    const m = ev.data;
    if (m.type === "progress" && m.total > 1) {
      status.textContent = `fetching the game data — ${(m.done / 1048576).toFixed(0)} of ${(m.total / 1048576).toFixed(0)} MB. it is verified whole before the engine starts.`;
    } else if (m.type === "error") {
      status.textContent = m.file === "engine" ? `the engine stopped: ${m.message}` : `the game data was refused: ${m.message}`;
    } else if (m.type === "esc-down") {
      escDown();
    } else if (m.type === "esc-up") {
      escUp();
    } else if (m.type === "started") {
      status.textContent = mode === "join"
        ? "thisissparta2! — live. click the game to take the mouse."
        : mode === "minsta" ? "minsta hook — live." : "nexuiz — live. click the game to take the mouse.";
    }
  };
  window.addEventListener("message", onMsg);
  /* The frame cannot see the parent's fullscreen state, so the
   * stage tells it: the play page refits its canvas to the new
   * size, so the game takes the whole display (play.js). */
  const tellFs = () => {
    try { frame.contentWindow?.postMessage({ from: "house", type: "fullscreen", on: document.fullscreenElement === stage }, location.origin); } catch { /* no frame, no word */ }
  };
  document.addEventListener("fullscreenchange", tellFs);
  frame.addEventListener("load", tellFs);
  /* The lock follows the screen: taken whenever this stage
   * becomes the fullscreen element (either door in — the opening
   * click or the fullscreen button), released whenever it stops
   * being, with any standing hold cancelled alongside. */
  const onFsLock = () => {
    if (document.fullscreenElement === stage) {
      try { void keyboard()?.lock?.(["Escape"])?.catch(() => undefined); } catch { /* no lock to take */ }
    } else {
      escCancel();
      try { keyboard()?.unlock?.(); } catch { /* nothing was held */ }
    }
  };
  document.addEventListener("fullscreenchange", onFsLock);
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      obs.disconnect();
      window.removeEventListener("message", onMsg);
      document.removeEventListener("fullscreenchange", tellFs);
      document.removeEventListener("fullscreenchange", onFsLock);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      escCancel();
      try { keyboard()?.unlock?.(); } catch { /* nothing was held */ }
      frame.src = "about:blank";
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  if (bridge) {
    deal("join", "joining thisissparta2! — the shared room. other players arrive the same way you do.");
  } else {
    deal("menu", "the game's own menu. single player ladder, create a match, options — as shipped in 2009.");
  }
  nexuizStageFullscreen(body);
}
