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
 * bridge address verbatim — see public/nexuiz/play.js). Opening
 * this window stands the game up on its own main menu, in true
 * fullscreen, and deals the bridge address with the frame: the
 * room's door is in that menu, at the head of its multiplayer
 * side (a tracked house patch to the menu progs —
 * tools/nexuiz/house-qc-patch-009.diff), and taking it dials the
 * room through the dealt transport. No connection is made for
 * the player. Local play rides along: the game's own menus and
 * ladder, and a local MinstaHook bot match — house
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

/* Session diagnostics are opt-in (review §2): armed only when the
 * operator has set the local-storage flag (the same storage seam
 * as the bridge override above) or the page's own query carries
 * the word. Armed, the window mints a session per deal, deals
 * diag=1 to the frame and stands the diagnostics panel; unarmed,
 * nothing about the window changes — no panel, no sampling, no
 * statistics calls in the frame. */
function diagEnabled(): boolean {
  try {
    if (new URLSearchParams(location.search).get("nexuiz-diag") === "1") return true;
    return localStorage.getItem(skey("blacksite-nexuiz-diag")) === "1";
  } catch {
    return false;
  }
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
  const status = el("p", "os-note", "nexuiz — standing the game up on its menu.");
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
  const diag = diagEnabled();
  let botsOn = true;
  /* Every deal carries a session the window minted for it alone.
   * The frame echoes the tag on every word it sends up, and the
   * window believes only its live deal's words — a frame from an
   * earlier deal (a re-deal, a restored window) cannot move the
   * status line or the diagnostics of the session that replaced
   * it (review §8's stale-callback rule, at this channel). */
  let session = "";
  let dealSeq = 0;
  const mintSession = () => {
    dealSeq += 1;
    return `${Date.now().toString(36)}-${dealSeq.toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
  };
  const src = (mode: string) => {
    const q = new URLSearchParams({ mode });
    if (name) q.set("name", name);
    if (mode === "minsta") q.set("bots", botsOn ? "5" : "0");
    /* The bridge rides with every deal, not just the room's: it
     * is a transport, not a destination — the frame installs the
     * socket layer from it and dials only when the player takes
     * the menu's door, from whichever engine session this window
     * dealt (the menu a local match disconnects back to carries
     * the same door). */
    if (bridge) q.set("bridge", bridge);
    q.set("session", session);
    if (diag) q.set("diag", "1");
    return `/nexuiz/play.html?${q.toString()}`;
  };
  let mode = "";
  const deal = (next: string, note: string) => {
    mode = next;
    session = mintSession();
    status.textContent = note;
    frame.src = src(next);
  };

  /* No join button stands here anymore: the room's door moved
   * into the game (the menu's multiplayer side), and a window
   * button promising the join would be copy the window cannot
   * keep — the join is the player's press, in the game. */
  const minstaBtn = el("button", "os-btn small", "minsta hook — instant match");
  minstaBtn.addEventListener("click", () => deal("minsta", botsOn
    ? "minsta hook on aggressor, five bots. one shot, one kill — hook is your other hand."
    : "minsta hook on aggressor, no bots — the map is yours alone."));
  const menuBtn = el("button", "os-btn small", "nexuiz menu");
  menuBtn.addEventListener("click", () => deal("menu", "the game's own menu — single player, the server browser, and thisissparta2!'s door at the head of the multiplayer side."));
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
  bar.append(minstaBtn, menuBtn, botsBtn, full, notice);

  const keys = el("p", "os-note", "wasd move · mouse look (click the game to lock) · e: hook · space jump · esc menu");
  wrap.append(bar, stage, status, keys);

  /* The diagnostics panel (review §2) — stands only when armed.
   * It renders the frame's own account of its live session: the
   * transport that actually carried it and why, its timing, its
   * frames — sampled in the frame from the session's own
   * connection, never from a second peer opened to measure. The
   * export button asks the frame for its bounded history and
   * saves the answer as JSON. Local deals (the bot match) are
   * labelled by their mode in the record; they are outside the
   * performance target, but the panel reads them the same way. */
  let diagPre: HTMLPreElement | null = null;
  const diagText = (s: Record<string, unknown>): string => {
    const num = (v: unknown, unit = "") => (typeof v === "number" ? `${Math.round(v)}${unit}` : "—");
    const lines: string[] = [];
    const transport = typeof s.transport === "string" ? s.transport
      : s.sockState === "none" ? "no connection yet" : String(s.sockState ?? "—");
    lines.push(`transport: ${transport}`
      + (s.rtcFailReason ? ` (rtc did not carry it: ${String(s.rtcFailReason)})` : "")
      + (typeof s.setupMs === "number" ? ` · setup ${num(s.setupMs, " ms")}` : ""));
    if (typeof s.ice === "string") lines.push(`ice: ${s.ice}`);
    lines.push(`rtt ${num(s.rttMs, " ms")} · packets in ${num(s.framesIn)} (${num(s.pktInPerSec)}/s) · out ${num(s.framesOut)} (${num(s.pktOutPerSec)}/s) · buffered ${num(s.buffered)} B`);
    lines.push(`page frames p50 ${num(s.rafP50)} · p95 ${num(s.rafP95)} · p99 ${num(s.rafP99)} ms · gaps >50 ms ${num(s.rafGaps50)}`);
    lines.push(`engine frames ${typeof s.engineFps === "number" ? `${s.engineFps.toFixed(1)}/s` : "— (counter unreachable)"} · display ≈${num(s.refreshHz)} Hz`);
    const canvas = Array.isArray(s.canvas) ? `${s.canvas[0]}×${s.canvas[1]}` : "—";
    lines.push(`canvas ${canvas} · focus ${s.focus ? "held" : "elsewhere"} · fullscreen ${s.fullscreen ? "yes" : "no"} · pointer lock ${s.pointerLock ? "held" : "no"} · samples ${num(s.sampleCount)}`);
    return lines.join("\n");
  };
  const downloadDiag = (data: unknown) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexuiz-diagnostics-${session || "session"}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      status.textContent = "diagnostics exported — the frame's own record of this session.";
    } catch { /* the export is a kindness, not a gate */ }
  };
  if (diag) {
    const box = el("div", "os-nexuiz-diag");
    const head = el("p", "os-note", "session diagnostics — this window's game, read from its own connection.");
    diagPre = el("pre", "os-nexuiz-diag-body", "waiting for the frame…");
    diagPre.style.margin = "0";
    diagPre.style.whiteSpace = "pre-wrap";
    diagPre.style.fontSize = "0.78rem";
    diagPre.style.opacity = "0.85";
    const exportBtn = el("button", "os-btn small", "export diagnostics (json)");
    exportBtn.addEventListener("click", () => {
      try { frame.contentWindow?.postMessage({ from: "house", type: "diag-export" }, location.origin); } catch { /* no frame, no export */ }
      if (diagPre) diagPre.textContent = "export asked of the frame…";
    });
    box.append(head, diagPre, exportBtn);
    wrap.appendChild(box);
  }
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
        fsExitEarned = true; // the heal below never fights an earned exit
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
    /* The frame's words are believed only from the frame itself:
     * this origin AND this window's frame — the source check
     * stood here already; the origin check joins it, because a
     * data field alone is not a credential (review §8). And only
     * the live deal's words count: a message carrying another
     * deal's session tag is a stale frame speaking out of turn
     * and is ignored whole. */
    if (ev.origin !== location.origin || ev.source !== frame.contentWindow || !ev.data || ev.data.from !== "nexuiz") return;
    const m = ev.data;
    if (typeof m.session === "string" && session && m.session !== session) return;
    if (m.type === "diag" && diagPre && m.summary) {
      diagPre.textContent = diagText(m.summary as Record<string, unknown>);
    } else if (m.type === "diag-export" && m.export) {
      downloadDiag(m.export);
    } else if (m.type === "progress" && m.total > 1) {
      status.textContent = `fetching the game data — ${(m.done / 1048576).toFixed(0)} of ${(m.total / 1048576).toFixed(0)} MB. it is verified whole before the engine starts.`;
    } else if (m.type === "error") {
      status.textContent = m.file === "engine" ? `the engine stopped: ${m.message}` : `the game data was refused: ${m.message}`;
    } else if (m.type === "esc-down") {
      escDown();
    } else if (m.type === "esc-up") {
      escUp();
    } else if (m.type === "started") {
      status.textContent = mode === "minsta"
        ? "minsta hook — live."
        : "nexuiz — live, on its menu. click the game to take the mouse; thisissparta2! is the multiplayer side's first door.";
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
  /* The lock follows the screen: wanted whenever this stage is
   * the fullscreen element (either door in — the opening click or
   * the fullscreen button), released whenever it stops being,
   * with any standing hold cancelled alongside. The asking is
   * tracked, not fire-and-forget: Chrome answers lock() only
   * within a live user gesture's reach, and the fullscreenchange
   * after the opening click can land outside it — the first cut
   * swallowed that refusal whole, so on the operator's real
   * Chrome the lock never held and Esc stayed the browser's key
   * (his live test, 2026-10-26). Now a grant counts only when
   * the promise resolves, a refusal is retried on the next
   * gesture inside fullscreen (a pointer press is always fresh
   * activation), and either outcome reaches the console, so a
   * refusal is a diagnosis instead of a silence. */
  let lockWanted = false;
  let lockHeld = false;
  const takeLock = () => {
    if (!lockWanted || lockHeld) return;
    let p: Promise<void> | undefined;
    try { p = keyboard()?.lock?.(["Escape"]); } catch { p = undefined; }
    if (!p) return;
    p.then(
      () => { lockHeld = true; console.info("[house] escape is the game's key — keyboard lock held"); },
      (err: unknown) => { lockHeld = false; console.warn("[house] keyboard lock refused — esc stays the browser's until the next gesture", err); },
    );
  };
  const onFsLock = () => {
    if (document.fullscreenElement === stage) {
      lockWanted = true;
      takeLock();
    } else {
      lockWanted = false;
      lockHeld = false;
      escCancel();
      try { keyboard()?.unlock?.(); } catch { /* nothing was held */ }
    }
  };
  document.addEventListener("fullscreenchange", onFsLock);
  const onGestureForLock = () => { takeLock(); };
  document.addEventListener("pointerdown", onGestureForLock, true);
  document.addEventListener("keydown", onGestureForLock, true);
  /* The self-heal (the operator's ruling, 2026-10-26, chosen over
   * dropping the menu pointer lock): while a fullscreen session
   * stands, an exit the hold clock did not earn is the browser
   * taking the screen, not the player leaving — so the stage
   * takes it back. Both convicted shapes land here: Chrome on
   * the operator's Mac dropping fullscreen on an Esc tap under a
   * granted keyboard lock, and the engine's own start-up knocking
   * the stage out of fullscreen once on the way in (the recorded
   * +179 ms flap). Asking for the screen needs a live gesture, so
   * the heal asks at once — a drop just after a gesture can still
   * spend it — and again on every following key or pointer press
   * until the screen is the stage's again: it returns on the
   * player's next touch, never by seizure in the dark. An earned
   * exit (the hold clock's, marked above) and a closed window
   * are never fought. */
  let fsSession = false;
  let fsExitEarned = false;
  const healFs = () => {
    if (!fsSession || fsExitEarned || document.fullscreenElement === stage) return;
    try {
      const r = stage.requestFullscreen() as unknown as Promise<void> | undefined;
      if (r) void r.catch(() => undefined);
    } catch { /* the next press asks again */ }
  };
  const onFsHeal = () => {
    if (document.fullscreenElement === stage) {
      fsSession = true;
      fsExitEarned = false;
    } else if (fsSession && !fsExitEarned) {
      healFs();
    } else {
      fsSession = false;
    }
  };
  document.addEventListener("fullscreenchange", onFsHeal);
  const onGestureForHeal = () => { healFs(); };
  document.addEventListener("pointerdown", onGestureForHeal, true);
  document.addEventListener("keydown", onGestureForHeal, true);
  /* Teardown — the session's end, run once and run whole. It
   * used to live only inside the removal observer below, ~150 ms
   * behind the close click and only when the window truly left
   * the document; now the lifecycle's dispose word runs it the
   * moment the window is closed, and the observer stands as the
   * backstop for any removal the desk did not announce. Every
   * listener this room put on the window or the document comes
   * off, the hold clock stops, the keyboard lock is released, a
   * stage still holding the screen gives it back, and the frame
   * is navigated away — its document's destruction is what ends
   * the engine and its transport, so it is made certain here
   * rather than left to the removal to imply. */
  let torn = false;
  const teardown = () => {
    if (torn) return;
    torn = true;
    obs.disconnect();
    window.removeEventListener("message", onMsg);
    document.removeEventListener("fullscreenchange", tellFs);
    document.removeEventListener("fullscreenchange", onFsLock);
    document.removeEventListener("pointerdown", onGestureForLock, true);
    document.removeEventListener("keydown", onGestureForLock, true);
    document.removeEventListener("fullscreenchange", onFsHeal);
    document.removeEventListener("pointerdown", onGestureForHeal, true);
    document.removeEventListener("keydown", onGestureForHeal, true);
    frame.removeEventListener("load", tellFs);
    fsSession = false;
    fsExitEarned = false;
    lockWanted = false;
    lockHeld = false;
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    escCancel();
    try { keyboard()?.unlock?.(); } catch { /* nothing was held */ }
    if (document.fullscreenElement === stage) {
      try { void document.exitFullscreen().catch(() => undefined); } catch { /* the screen is already the desk's */ }
    }
    frame.src = "about:blank";
  };
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) teardown();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  /* ——— the window lifecycle (review §3), this room's shape ———
   * The general contract suspends a put-away window's work. This
   * room is the standing exception, and the exception is physics,
   * not preference: in this engine the frame loop IS the network
   * — input, packet processing and rendering share one loop, and
   * no lever in the shipped build separates them (no runtime
   * console or cvar path is reachable from the page; the only
   * housings are boot arguments and the static autoexec). Pausing
   * the frame would not rest the game; it would strangle its
   * connection silently, the server's timeout ending the session
   * while the window claimed to hold it. So a minimized nexuiz
   * keeps its session exactly as dealt — the lifecycle marks the
   * window, and this room stops nothing — and a closed one ends
   * outright, above. One hazard the marking does retire: putting
   * the window away can make the browser drop the stage's
   * fullscreen, and a drop the desk itself caused is the
   * operator's own act — earned, like the hold clock's exit — so
   * the heal above never fights a minimize. */
  body.addEventListener("os:suspend", () => { if (fsSession) fsExitEarned = true; });
  body.addEventListener("os:dispose", teardown);

  /* The icon press is the whole ceremony: the game stands up on
   * its own main menu (the frame raises the engine itself — no
   * further press is asked), and the fullscreen follows on this
   * same gesture below. The room is one more press away, inside
   * the game, where its door stands. */
  deal("menu", "the game's own menu — thisissparta2!'s door stands in it, on the multiplayer side. the room is entered there now, by hand.");
  nexuizStageFullscreen(body);
}
