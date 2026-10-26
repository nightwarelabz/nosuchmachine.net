"use strict";
const q = new URLSearchParams(location.search);
const rawMode = q.get("mode");
const mode = rawMode === "minsta" || rawMode === "join" ? rawMode : "menu";
const rawName = (q.get("name") || "").replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "").slice(0, 24);
const dataBase = q.get("base") || "/api/nexuiz-data";
/* The house bridge (sparta-bridge contract): a wss URL used VERBATIM
 * by the engine's socket layer — one WebSocket session there is one
 * player on the house server. The token is what the engine dials;
 * the bridge carries the datagrams to the real server either way. */
const bridge = q.get("bridge") || "";
const server = (q.get("server") || "thisissparta2").replace(/[^A-Za-z0-9_!.\-:]/g, "").slice(0, 64) || "thisissparta2";
const botsRaw = parseInt(q.get("bots") || "5", 10);
const bots = Number.isFinite(botsRaw) ? Math.max(0, Math.min(15, botsRaw)) : 5;

const plate = document.getElementById("plate");
const plateText = document.getElementById("plate-text");
const plateBar = document.getElementById("plate-bar");
const plateFill = document.getElementById("plate-fill");
const plateStatus = document.getElementById("plate-status");
const plateBtn = document.getElementById("plate-btn");
const con = document.getElementById("con");
const post = (m) => { try { parent.postMessage(Object.assign({ from: "nexuiz" }, m), location.origin); } catch {} };
const fmtMB = (b) => (b / 1048576).toFixed(0) + " MB";

let engineDead = false;
function engineError(message) {
  if (engineDead) return;
  engineDead = true;
  plate.hidden = false;
  plateText.hidden = true; plateBar.hidden = true; plateBtn.hidden = true;
  plateStatus.className = "err";
  plateStatus.textContent = "the engine stopped: " + message;
  post({ type: "error", file: "engine", message });
}

const args = ["-game", "data"];
if (rawName) args.push("+set", "name", rawName);
if (mode === "minsta") {
  args.push("+maxplayers", "16", "+bot_number", String(bots), "+gametype", "dm", "+map", "aggressor");
}
const joinLive = mode === "join" && /^(ws|wss):\/\/[^\s"']+$/.test(bridge);
if (mode === "join" && joinLive) {
  args.push("+connect", server);
}
/* Extra engine arguments (comma-separated) — the game's own
 * command line, for tuning and diagnosis. */
const extra = q.get("extra");
if (extra) {
  for (const tok of extra.split(",")) if (tok) args.push(tok);
}

const moduleDef = {
  canvas: document.getElementById("canvas"),
  dataBase,
  files: {
    "data/data20091001.pk3": {
      part: "data", spanLength: 880493625, size: 887580846,
      sha256: "3ec238441a4886b44a12134cf89f45b3d9be59359d4a089773f7996b8d4bd6c0",
    },
    "data/common-spog.pk3": {
      part: "spog", spanLength: 24638, size: 28724,
      sha256: "d098b071c88447914ec6e9f17f8b57327399e91b011699d20a39e6452949780c",
    },
    "data/autoexec.cfg": "/nexuiz/autoexec.cfg",
  },
  arguments: args,
  onEngineStart() {
    if (engineDead) return;
    plate.hidden = true;
    post({ type: "started", mode });
  },
  onAbort(what) { engineError("aborted (" + String(what) + ")"); },
  onExit(code) { if (code) engineError("exit code " + code); },
  onDataFile(file) {
    plateBar.hidden = false;
    plateStatus.textContent = "fetching " + file + " — first visit crosses the wire; after that it is kept locally.";
    post({ type: "progress", file, done: 0, total: 1 });
  },
  onDataProgress(file, done, total) {
    plateFill.style.width = (100 * done / total).toFixed(1) + "%";
    plateStatus.textContent = file + ": " + fmtMB(done) + " of " + fmtMB(total) + " (verified when whole)";
    post({ type: "progress", file, done, total });
  },
  onDataError(file, message) {
    plateText.hidden = true; plateBar.hidden = true; plateBtn.hidden = true;
    plateStatus.className = "err";
    plateStatus.textContent = "the game data was refused: " + message;
    post({ type: "error", file, message });
  },
  onConsole(text) {
    /* The runtime's run-dependency watcher narrates its waits
     * through the error channel ("still waiting on run
     * dependencies: … dependency: data/… (end of list)"). That is
     * machinery noise, not the game's word: it is not logged, and
     * like everything else on this channel it is never rendered
     * (the console element is display:none — see play.html). */
    if (/^(still waiting on run dependencies:|dependency: |\(end of list\))/.test(text)) return;
    con.textContent += text + "\n";
    while (con.textContent.length > 20000) con.textContent = con.textContent.slice(6000);
    con.scrollTop = con.scrollHeight;
    if (/Engine Error|Host_Error|Sys_Error|Aborted\(|RuntimeError/.test(text)) engineError(text.slice(0, 220));
  },
};
/* Emscripten's socket layer (SOCKFS) dials this URL verbatim for
 * every connection and offers the "sparta" subprotocol — exactly the
 * bridge's contract. Set before the engine script loads. */
if (joinLive) moduleDef.websocket = { url: bridge, subprotocol: "sparta" };
window.Module = moduleDef;

if (mode === "join" && !joinLive) {
  plateText.textContent = "the house room needs its bridge address, and none was given — the game stays closed rather than dial a stranger.";
  plateBtn.hidden = true;
  post({ type: "error", file: "bridge", message: "join asked for without a bridge address" });
}

/* The canvas is the engine's window: its backing store is the
 * video mode. Keep it matched to the stage it stands in — before
 * the engine boots, so it opens at the size it was dealt, and on
 * every resize after (the OS stage taking the whole screen, a
 * window dragged) — through the runtime's own sizing call where
 * it genuinely stands exported, so SDL hears of the change and
 * re-modes; the plain attribute set is what SDL reads at boot,
 * and it is the fallback wherever the call is not exported.
 *
 * A runtime method is NEVER read off Module directly — not even
 * for a typeof. The shipped glue defines an aborting getter for
 * every runtime name it did not export (setCanvasSize among
 * them): touching the property runs the getter, and the getter
 * aborts the whole engine on the spot — a guard that reads the
 * method to check for it is the very thing that kills the game.
 * The own-property descriptor is the only safe probe: it never
 * runs a getter, and it tells the two cases apart — an exported
 * method stands as a plain function value, an unexported one as
 * a getter with no value, to be left strictly alone. */
function runtimeMethod(name) {
  try {
    const d = Object.getOwnPropertyDescriptor(window.Module || {}, name);
    return d && typeof d.value === "function" ? d.value : null;
  } catch { return null; }
}
const stageEl = document.getElementById("stage");
const canvasEl = moduleDef.canvas;
let fitTimer = 0;
function fitCanvas() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (!w || !h) return;
  if (canvasEl.width === w && canvasEl.height === h) return;
  const setCanvasSize = runtimeMethod("setCanvasSize");
  if (setCanvasSize) { try { setCanvasSize.call(window.Module, w, h); return; } catch { /* the plain set below */ } }
  canvasEl.width = w;
  canvasEl.height = h;
}
function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(fitCanvas, 120); }
if (typeof ResizeObserver === "function") new ResizeObserver(fitSoon).observe(stageEl);
window.addEventListener("resize", fitSoon);
fitCanvas();

/* The house word on fullscreen (the OS stage owns the state; the
 * frame only hears of it): the canvas refits, so the game takes
 * the whole display. */
window.addEventListener("message", (ev) => {
  const m = ev.data;
  if (!m || m.from !== "house" || m.type !== "fullscreen") return;
  document.body.classList.toggle("fs", !!m.on);
  fitSoon();
});

plateBtn.addEventListener("click", () => {
  fitCanvas();
  plateBtn.hidden = true;
  plateText.textContent = mode === "join"
    ? "raising the engine — it deals you into thisissparta2! when the table is up…"
    : "raising the engine…";
  const s = document.createElement("script");
  s.src = "darkplaces-wasm.js";
  s.onerror = () => {
    plateStatus.className = "err";
    plateStatus.textContent = "the engine file did not load — the game stays closed.";
    post({ type: "error", file: "darkplaces-wasm.js", message: "engine script failed to load" });
  };
  s.onload = () => {
    // The plate hides when the loader hands over to the engine
    // (Module.onEngineStart, fired by the pre-js at callMain); if
    // the engine then fails, onConsole/onAbort re-raises the plate
    // with the error. Data callbacks keep the plate honest until
    // then.
  };
  document.body.appendChild(s);
  post({ type: "booting", mode });
});
