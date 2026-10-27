"use strict";
const q = new URLSearchParams(location.search);
const rawMode = q.get("mode");
/* "join" is the retired auto-join's name: a dealt URL carrying
 * it (an older OS bundle, a kept link) now means what every room
 * deal means — the game's own menu, with the transport dealt —
 * never a connection made for the player. The room is entered
 * by hand, at the door the menu itself carries
 * (tools/nexuiz/house-qc-patch-009.diff). */
const mode = rawMode === "minsta" ? "minsta" : "menu";
const rawName = (q.get("name") || "").replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "").slice(0, 24);
const dataBase = q.get("base") || "/api/nexuiz-data";
/* The engine build stamp. The glue script and the wasm are served
 * immutable (see public/_headers), so their URLs must change when
 * the engine does: this stamp rides both URLs, and play.js itself
 * stays revalidated, so a new stamp is always picked up. Bump it
 * whenever darkplaces-wasm.js or darkplaces-wasm.wasm is rebuilt
 * (the rule is written down in tools/nexuiz/BUILD.md). */
const NX_ENGINE_STAMP = "4";
/* The stripped data pack's build stamp. The pack is a house build
 * and its bytes change when the strip is rebuilt (its SHA-256 is
 * pinned in NOTICE.txt); the span deal below has no file URL for
 * a stamp to ride, so the stamp names the build generation to the
 * retirement sweep instead: when the stamp a machine last swept
 * under differs from this one, the sweep also retires the previous
 * build's part=haxiuz staging chunks and kept pack, so a rebuilt
 * pack never assembles out of an older build's bytes (the loader's
 * hash verdict is the backstop — wrong bytes are refused, never
 * played). Bump it whenever haxiuz.pk3 is rebuilt, in the same
 * change that updates the deal's span and pin (see
 * tools/nexuiz/BUILD.md). */
const NX_DATA_STAMP = "1";
/* Retire the full-data kept copies, and the previous data
 * build's. The loader's kept packs and staging chunks live in
 * the "nexuiz-data-v1" Cache API store under keys naming their
 * span parts (part=data / part=spog for the full deal, part=
 * haxiuz for the stripped one) and the old pack paths; the deal
 * below never requests the full-data keys, and this sweep
 * deletes them so a returning player's machine does not keep
 * ~900 MB of data the game no longer plays. The stripped pack's
 * own keys are its part's own (part=haxiuz) and are touched only
 * on a build-generation change (see NX_DATA_STAMP above). The
 * small house files are not touched. */
if (typeof caches !== "undefined") {
  let staleBuild = false;
  try {
    staleBuild = localStorage.getItem("nexuiz-data-stamp") !== NX_DATA_STAMP;
    if (staleBuild) localStorage.setItem("nexuiz-data-stamp", NX_DATA_STAMP);
  } catch { /* no storage, no generation sweep — the hash verdict still stands */ }
  caches.open("nexuiz-data-v1").then(async (cache) => {
    try {
      for (const req of await cache.keys()) {
        if (req.url.includes("part=data") || req.url.includes("part=spog")
          || req.url.includes("/nexuiz/kept/data/data20091001.pk3")
          || req.url.includes("/nexuiz/kept/data/common-spog.pk3")
          || req.url.includes("/nexuiz/kept/data/haxiuz.pk3")
          || (staleBuild && /[?&]part=haxiuz(&|$)/.test(req.url))) {
          await cache.delete(req);
        }
      }
    } catch { /* a store that refuses is left as it lies */ }
  }).catch(() => {});
}
/* The house bridge (sparta-bridge contract): a wss URL used VERBATIM
 * by the engine's socket layer — one WebSocket session there is one
 * player on the house server. The address is dealt as a transport,
 * nothing more: the socket layer dials it for ANY connection the
 * engine makes (verified in the shipped glue — SOCKFS's createPeer
 * takes the dealt URL whole whenever one is dealt, and builds an
 * address only out of the bare-scheme form), so the menu's own
 * connect reaches the room through it. Nothing dials at boot. */
const bridge = q.get("bridge") || "";
const botsRaw = parseInt(q.get("bots") || "5", 10);
const bots = Number.isFinite(botsRaw) ? Math.max(0, Math.min(15, botsRaw)) : 5;
/* The session this deal belongs to, minted by the OS window per
 * deal and echoed on every word the frame sends up, so a stale
 * frame's words can be told from the live deal's (the house reads
 * the tag; a frame dealt none sends an empty one). */
const NX_SESSION = q.get("session") || "";
/* Diagnostics are opt-in, per deal: the OS window deals diag=1
 * only when the operator has armed them there (see os-nexuiz.ts).
 * Off is the shipped state — nothing below samples, polls or
 * posts diagnostics, and the socket instrumentation stays inert:
 * no statistics calls, no panel, no per-frame cost beyond the
 * flag checks themselves. */
const NX_DIAG = q.get("diag") === "1";

const plate = document.getElementById("plate");
const plateText = document.getElementById("plate-text");
const plateBar = document.getElementById("plate-bar");
const plateFill = document.getElementById("plate-fill");
const plateStatus = document.getElementById("plate-status");
const con = document.getElementById("con");
const post = (m) => { try { parent.postMessage(Object.assign({ from: "nexuiz", session: NX_SESSION }, m), location.origin); } catch {} };
const fmtMB = (b) => (b / 1048576).toFixed(0) + " MB";

let engineDead = false;
function engineError(message) {
  if (engineDead) return;
  engineDead = true;
  if (NX_DIAG) nxDiagPushEvent("engine-error", String(message).slice(0, 160));
  plate.hidden = false;
  plateText.hidden = true; plateBar.hidden = true;
  plateStatus.className = "err";
  plateStatus.textContent = "the engine stopped: " + message;
  post({ type: "error", file: "engine", message });
}

const args = ["-game", "data"];
if (rawName) args.push("+set", "name", rawName);
if (mode === "minsta") {
  args.push("+maxplayers", "16", "+bot_number", String(bots), "+gametype", "dm", "+map", "aggressor");
}
/* No connect is dealt, for any mode: the engine boots to its
 * main menu and the connection is the player's to make, at the
 * door the menu carries. A usable bridge address riding along
 * deals the transport below — that is all it does. */
const bridgeLive = bridge !== "" && /^(ws|wss):\/\/[^\s"']+$/.test(bridge);
/* Extra engine arguments (comma-separated) — the game's own
 * command line, for tuning and diagnosis. */
const extra = q.get("extra");
if (extra) {
  for (const tok of extra.split(",")) if (tok) args.push(tok);
}

const moduleDef = {
  canvas: document.getElementById("canvas"),
  locateFile(path) { return path.endsWith(".wasm") ? path + "?v=" + NX_ENGINE_STAMP : path; },
  dataBase,
  files: {
    /* haxiuz data: the game stripped to the session it plays —
     * CTF MinstaHook on evilspace, the MinstaNex and the laser,
     * the hook, Mulder for everyone, bots, the menu and the HUD.
     * One house-built pack (99,228,456 bytes, 1,528 files) whose
     * contents are the recorded census of what a session loads,
     * built from the verified release packs (the full record —
     * provenance, census method, and the full-data fallback — is
     * in NOTICE.txt and tools/nexuiz/BUILD.md). common-spog's
     * files ride inside it. It travels the span pipe, the road
     * the release packs took before it: at 99 MB it is
     * far past the 25 MiB ceiling on a site file, so the pipe
     * (/api/nexuiz-data, part "haxiuz") streams its raw-deflate
     * span out of its container zip — haxiuz-release.zip, a
     * release asset on the house's haxiuz repo (tag data-1),
     * whose single deflated entry the pack is — and the loader
     * inflates the span, reassembles the pack, and verifies it
     * against the SHA-256 pinned here and in NOTICE.txt before
     * the engine starts. Wrong bytes are refused, never played. */
    "data/haxiuz.pk3": {
      part: "haxiuz", spanLength: 98509217, size: 99228456,
      sha256: "10018c6a19fee310c70504952691fb21748ff5d1412c4f1271ff7de658d7f5b3",
    },
    /* The house menu override: one file, menu.dat, compiled from
     * the release's own menu sources with one tracked patch
     * (tools/nexuiz/house-qc-patch-008.diff) that locks the
     * Settings surface to the player name, so every player runs
     * the same specs and configs. Pack precedence is the
     * engine's own filename order in the game directory — the
     * same route the house room's sparta overrides take — so
     * this pack's menu.dat is the one the engine reads. The
     * full record is in NOTICE.txt. */
    "data/sparta-menu.pk3": "/nexuiz/sparta-menu.pk3",
    "data/autoexec.cfg": "/nexuiz/autoexec.cfg",
  },
  arguments: args,
  onEngineStart() {
    if (engineDead) return;
    plate.hidden = true;
    post({ type: "started", mode });
    if (NX_DIAG) nxDiagNoteEngineStart();
    engineStarted();
  },
  onAbort(what) { engineError("aborted (" + String(what) + ")"); },
  onExit(code) { if (code) engineError("exit code " + code); },
  onDataFile(file) {
    plateBar.hidden = false;
    plateStatus.textContent = "fetching " + file + " — first visit crosses the wire; after that it is kept locally.";
    post({ type: "progress", file, done: 0, total: 1 });
  },
  onDataLocal(file) {
    plateStatus.textContent = file + " is kept on this machine — no download.";
  },
  onDataProgress(file, done, total) {
    plateFill.style.width = (100 * done / total).toFixed(1) + "%";
    plateStatus.textContent = file + ": " + fmtMB(done) + " of " + fmtMB(total) + " (verified when whole)";
    post({ type: "progress", file, done, total });
  },
  onDataError(file, message) {
    plateText.hidden = true; plateBar.hidden = true;
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
/* sparta-rtc-shim:start — one self-contained block: the socket
 * below, its signaling-URL derivation, and the installer are the
 * whole of it, so the block can be lifted verbatim and exercised
 * on its own (the code-path proof does exactly that).
 *
 * The fast road, and the road that is already there.
 *
 * SOCKFS dials the dealt bridge URL for every peer through the
 * page-global WebSocket constructor, looked up at call time, and
 * uses only the plain socket face: onopen/onclose/onmessage/
 * onerror, send(), close(), readyState against the instance's
 * own CONNECTING/OPEN/CLOSING/CLOSED constants, and onmessage
 * events whose .data is an ArrayBuffer. A house peer — the dealt
 * URL, the "sparta" subprotocol — deserves a faster road than a
 * relayed TCP stream where one is honestly available, so a house
 * construction returns the shim socket below instead of a real
 * WebSocket. The shim first tries WebRTC: a DataChannel named
 * "sparta", unordered with no retransmits (the game's datagrams
 * are exactly that), negotiated over a signaling socket to the
 * same door at the /rtc path, with one public STUN server to
 * learn its own address from. There is no TURN relay: a NAT that
 * refuses UDP outright cannot be crossed without one, and that
 * is the honest limit of the fast road — it is not a dead end,
 * because every failure on it lands on the road below.
 *
 * The other road: if the channel is not open within the setup
 * budget — signaling refused or closed, ICE failed or
 * disconnected, a negotiation error, the budget itself expiring,
 * or a browser with no RTCPeerConnection at all — the shim
 * silently substitutes the exact current road: a real WebSocket
 * to the original URL with the original protocols, delegated
 * 1:1. The switch happens only before a transport has opened.
 * Once the channel is open, a failure is a dropped connection
 * and the socket closes like a real one — a fresh WebSocket
 * mid-game would be a new player wearing the old one's name,
 * and its opening messages are not game datagrams. Once a shim
 * has fallen back it never retries RTC; the engine cannot tell
 * the difference either way, and needs not.
 */
const NX_RTC_BUDGET_MS = 8000;

/* The signaling door: the bridge's own URL with /rtc at the end
 * of its path (a trailing slash is the path's end, not part of
 * the name — the root path takes /rtc whole). */
function nxSpartaSignalUrl(houseUrl) {
  const u = new URL(houseUrl);
  u.pathname = (u.pathname.endsWith("/") ? u.pathname.slice(0, -1) : u.pathname) + "/rtc";
  return u.toString();
}

/* A remote ice line from the signaling socket, in the shape
 * addIceCandidate takes: a candidate object rides as dealt; a
 * candidate string rides with its mid and line index beside it.
 * An empty candidate is the end-of-candidates mark, not a
 * candidate — there is nothing to add for it. */
function nxSpartaRemoteIce(msg) {
  if (msg.candidate && typeof msg.candidate === "object") return msg.candidate;
  if (typeof msg.candidate !== "string" || !msg.candidate) return null;
  return {
    candidate: msg.candidate,
    sdpMid: msg.sdpMid ?? null,
    sdpMLineIndex: msg.sdpMLineIndex ?? null,
  };
}

/* The byte weight of one datagram as the face carries it — the
 * diagnostics counters' measure, nothing more. */
function nxSpartaByteLen(data) {
  if (data === null || data === undefined) return 0;
  if (typeof data === "string") return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  return 0;
}

class NxSpartaSocket {
  constructor(url, protocols, RealWebSocket) {
    this.url = String(url);
    this.protocol = "sparta";
    this._protocols = protocols;
    this._realCtor = RealWebSocket;
    this._binaryType = "arraybuffer";
    this.readyState = NxSpartaSocket.CONNECTING;
    this.CONNECTING = NxSpartaSocket.CONNECTING;
    this.OPEN = NxSpartaSocket.OPEN;
    this.CLOSING = NxSpartaSocket.CLOSING;
    this.CLOSED = NxSpartaSocket.CLOSED;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    this._listeners = new Map();
    this._queue = [];
    this._sigQueue = [];
    this._pendingIce = [];
    this._pendingRemoteIce = [];
    this._pc = null;
    this._dc = null;
    this._sig = null;
    this._fb = null;
    this._offerSent = false;
    this._remoteSet = false;
    this._opened = false;
    this._closed = false;
    this._closeFired = false;
    this._fallbackStarted = false;
    /* Diagnostics ride along only when the page's deal armed them
     * (NxSpartaSocket.DIAG, set by play.js from its diag parameter
     * before any socket can be constructed): the timestamps, the
     * failure's reason and the frame counters are the whole cost,
     * and only then — an unarmed socket records nothing. Armed,
     * the socket also stands in the class registry, so the page's
     * sampler can read THIS connection — the active one — rather
     * than opening a second peer to measure a stranger. */
    this._diag = NxSpartaSocket.DIAG === true;
    this._createdAt = this._diag ? performance.now() : 0;
    this._openedAt = 0;
    this._closedAt = 0;
    this._transport = null;
    this._rtcFailReason = null;
    this._closeCode = null;
    this._framesIn = 0;
    this._framesOut = 0;
    this._bytesIn = 0;
    this._bytesOut = 0;
    if (this._diag) {
      const reg = NxSpartaSocket.REGISTRY;
      reg.push(this);
      if (reg.length > 4) reg.shift();
    }
    /* The setup budget runs from construction: the fast road
     * proves itself in this window or the other road is taken. */
    this._budgetTimer = setTimeout(() => this._failRtc("rtc setup budget expired"), NX_RTC_BUDGET_MS);
    if (this._budgetTimer && typeof this._budgetTimer.unref === "function") this._budgetTimer.unref();
    this._startRtc();
  }

  get binaryType() { return this._binaryType; }
  set binaryType(value) {
    this._binaryType = String(value);
    try { if (this._dc) this._dc.binaryType = this._binaryType; } catch { /* the channel keeps its type */ }
    try { if (this._fb) this._fb.binaryType = this._binaryType; } catch { /* the socket keeps its type */ }
  }

  get bufferedAmount() {
    let n = 0;
    for (const data of this._queue) n += (data && (data.byteLength ?? data.length)) || 0;
    try { if (this._dc) n += this._dc.bufferedAmount || 0; } catch { /* the queue's word stands */ }
    try { if (this._fb) n += this._fb.bufferedAmount || 0; } catch { /* the queue's word stands */ }
    return n;
  }

  addEventListener(type, listener) {
    if (typeof listener !== "function") return;
    let set = this._listeners.get(type);
    if (!set) { set = new Set(); this._listeners.set(type, set); }
    set.add(listener);
  }
  removeEventListener(type, listener) {
    const set = this._listeners.get(type);
    if (set) set.delete(listener);
  }
  dispatchEvent(event) {
    if (!event || typeof event.type !== "string") return false;
    this._emit(event.type, event);
    return true;
  }

  /* One event, both doors the face offers: the property handler
   * SOCKFS sets, and any listener added beside it. A throwing
   * handler is the handler's business, as on a real socket — it
   * does not take the dispatch, or the engine, down with it. */
  _emit(type, event) {
    const ev = event && typeof event === "object" ? event : {};
    try { if (!ev.type) ev.type = type; } catch { /* a native event carries its own */ }
    try { if (!ev.target) ev.target = this; } catch { /* a native event carries its own */ }
    try { ev.currentTarget = this; } catch { /* a native event carries its own */ }
    const handler = this["on" + type];
    if (typeof handler === "function") { try { handler.call(this, ev); } catch { /* the handler's business */ } }
    const set = this._listeners.get(type);
    if (set) for (const listener of [...set]) { try { listener.call(this, ev); } catch { /* the listener's business */ } }
  }
  _emitMessage(data) {
    if (this._diag) { this._framesIn++; this._bytesIn += nxSpartaByteLen(data); }
    this._emit("message", { data });
  }

  send(data) {
    if (this._closed || this.readyState === NxSpartaSocket.CLOSING || this.readyState === NxSpartaSocket.CLOSED) return;
    if (this._opened) {
      /* Open is open: a transport's refusal here is the caller's
       * word to hear — SOCKFS turns it into its own errno. */
      this._sendNow(data);
      return;
    }
    /* While CONNECTING the shim queues too. SOCKFS already queues
     * its own sends and flushes them at onopen, but a send that
     * lands in the fallback race must never be dropped, and a real
     * WebSocket throws on send-while-CONNECTING — swallowing the
     * call into the queue is strictly safer than either. */
    this._queue.push(data);
  }
  _sendNow(data) {
    if (this._dc && this._dc.readyState === "open") { this._dc.send(data); if (this._diag) { this._framesOut++; this._bytesOut += nxSpartaByteLen(data); } return; }
    if (this._fb && this._fb.readyState === NxSpartaSocket.OPEN) { this._fb.send(data); if (this._diag) { this._framesOut++; this._bytesOut += nxSpartaByteLen(data); } return; }
    throw new Error("sparta socket: no transport is open");
  }
  _flushQueue() {
    const queued = this._queue;
    this._queue = [];
    for (let i = 0; i < queued.length; i++) {
      try { this._sendNow(queued[i]); }
      catch {
        /* What would not go stays queued, in order, at the front. */
        this._queue = queued.slice(i).concat(this._queue);
        return;
      }
    }
  }

  close(code, reason) {
    if (this.readyState === NxSpartaSocket.CLOSING || this.readyState === NxSpartaSocket.CLOSED) return;
    this._finishClose(
      typeof code === "number" ? code : 1000,
      typeof reason === "string" ? reason : "",
      true,
    );
  }
  /* The one close door: every ending — the caller's close(), a
   * transport dying, the fallback road closing — passes through
   * here, tears every transport down with its handlers already
   * lifted (so a teardown cannot re-enter), and fires onclose
   * exactly once, as the socket had opened or was connecting in
   * every case that reaches this line. */
  _finishClose(code, reason, wasClean) {
    this._closed = true;
    if (this._diag && this._closedAt === 0) { this._closedAt = performance.now(); this._closeCode = code; }
    this._clearBudget();
    this.readyState = NxSpartaSocket.CLOSING;
    this._teardownRtc();
    const fb = this._fb;
    this._fb = null;
    if (fb) {
      try { fb.onopen = fb.onmessage = fb.onerror = fb.onclose = null; } catch { /* already still */ }
      try { fb.close(); } catch { /* already closed */ }
    }
    this.readyState = NxSpartaSocket.CLOSED;
    if (!this._closeFired) {
      this._closeFired = true;
      this._emit("close", { code, reason, wasClean });
    }
  }

  _clearBudget() {
    if (this._budgetTimer) { clearTimeout(this._budgetTimer); this._budgetTimer = null; }
  }

  _startRtc() {
    const RTC = globalThis.RTCPeerConnection;
    /* No RTCPeerConnection, no fast road — the old browser takes
     * the current road directly and is none the worse for it. */
    if (typeof RTC !== "function") { if (this._diag) this._rtcFailReason = "no RTCPeerConnection in this browser"; this._startFallback(); return; }
    let sigUrl;
    try { sigUrl = nxSpartaSignalUrl(this.url); } catch { if (this._diag) this._rtcFailReason = "signaling address could not be derived"; this._startFallback(); return; }
    let pc, dc, sig;
    try {
      pc = new RTC({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      this._pc = pc;
      /* The channel is created before the offer, so the offer
       * carries it: its name is the contract's word, and its
       * shape is the game's — datagrams, unordered, never
       * retransmitted. */
      dc = pc.createDataChannel("sparta", { ordered: false, maxRetransmits: 0 });
      this._dc = dc;
      try { dc.binaryType = this._binaryType; } catch { /* the channel's default is arraybuffer too */ }
      const RealWebSocket = this._realCtor;
      sig = new RealWebSocket(sigUrl);
      this._sig = sig;
    } catch { if (this._diag) this._rtcFailReason = "rtc construction failed"; this._startFallback(); return; }

    dc.onopen = () => this._transportOpened();
    dc.onmessage = (ev) => { if (!this._closed) this._deliverDcData(ev ? ev.data : undefined); };
    dc.onclose = () => {
      if (this._closed) return;
      if (!this._opened) this._failRtc("data channel closed during setup");
      else this._finishClose(1006, "", false);
    };
    dc.onerror = () => { if (!this._opened) this._failRtc("data channel error during setup"); };

    pc.onicecandidate = (ev) => {
      const cand = ev && ev.candidate;
      if (!cand) return;
      const msg = { type: "ice", candidate: cand.candidate, sdpMid: cand.sdpMid, sdpMLineIndex: cand.sdpMLineIndex };
      /* Candidates are trickled as they come — but never ahead of
       * the offer they belong to; those wait beside it. */
      if (this._offerSent) this._sigSend(msg);
      else this._pendingIce.push(msg);
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state !== "failed" && state !== "disconnected") return;
      if (!this._opened) this._failRtc(state === "failed" ? "ice connection failed" : "ice connection disconnected");
      else if (state === "failed") this._finishClose(1006, "", false);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state !== "failed" && state !== "disconnected") return;
      if (!this._opened) this._failRtc(state === "failed" ? "peer connection failed" : "peer connection disconnected");
      else if (state === "failed") this._finishClose(1006, "", false);
    };

    sig.onopen = () => {
      const queued = this._sigQueue;
      this._sigQueue = [];
      for (const text of queued) { try { sig.send(text); } catch { /* a dead signaling socket is the RTC road's failure, handled by its own handlers */ } }
    };
    sig.onmessage = (ev) => this._onSignal(ev ? ev.data : undefined);
    sig.onerror = () => { if (!this._opened) this._failRtc("signaling socket error"); };
    sig.onclose = () => { if (!this._opened && !this._closed) this._failRtc("signaling socket closed"); };

    (async () => {
      try {
        const offer = await pc.createOffer();
        if (this._closed || this._fallbackStarted || this._opened) return;
        await pc.setLocalDescription(offer);
        if (this._closed || this._fallbackStarted || this._opened) return;
        this._offerSent = true;
        this._sigSend({ type: "offer", sdp: (pc.localDescription && pc.localDescription.sdp) || offer.sdp });
        const pending = this._pendingIce;
        this._pendingIce = [];
        for (const msg of pending) this._sigSend(msg);
      } catch { this._failRtc("negotiation failed"); }
    })();
  }

  /* Signaling words wait for the signaling socket exactly as
   * game words wait for the shim: queued while it connects,
   * sent in order once it stands. */
  _sigSend(obj) {
    const sig = this._sig;
    if (!sig) return;
    let text;
    try { text = JSON.stringify(obj); } catch { return; }
    if (sig.readyState === NxSpartaSocket.OPEN) { try { sig.send(text); } catch { /* the socket's handlers carry its failure */ } }
    else if (sig.readyState === NxSpartaSocket.CONNECTING) this._sigQueue.push(text);
  }

  _onSignal(data) {
    if (this._closed || this._fallbackStarted) return;
    let msg;
    try { msg = JSON.parse(typeof data === "string" ? data : ""); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    const pc = this._pc;
    if (!pc) return;
    if (msg.type === "answer" && typeof msg.sdp === "string") {
      if (this._opened || this._remoteSet) return;
      (async () => {
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          this._remoteSet = true;
          const queued = this._pendingRemoteIce;
          this._pendingRemoteIce = [];
          for (const cand of queued) { try { await pc.addIceCandidate(cand); } catch { /* a refused candidate is not the negotiation's failure */ } }
        } catch { this._failRtc("remote answer refused"); }
      })();
    } else if (msg.type === "ice") {
      const cand = nxSpartaRemoteIce(msg);
      if (!cand) return;
      /* A candidate that arrives before the answer stands waits
       * for it: a peer connection refuses candidates dealt to it
       * before its remote description, and the refusal is ours
       * to avoid, not the gateway's to forgive. */
      if (!this._remoteSet) { this._pendingRemoteIce.push(cand); return; }
      try {
        const p = pc.addIceCandidate(cand);
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch { /* a refused candidate is not the negotiation's failure */ }
    }
  }

  /* Channel words, delivered as the face promises: with
   * binaryType "arraybuffer" (the type SOCKFS deals the shim)
   * onmessage carries an ArrayBuffer whose bytes are the
   * datagram's, untouched — one channel message, one event. */
  _deliverDcData(data) {
    if (data === undefined || data === null) return;
    if (typeof data === "string" || data instanceof ArrayBuffer) {
      this._emitMessage(this._binaryType === "blob" && data instanceof ArrayBuffer ? new Blob([data]) : data);
      return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      if (this._binaryType === "blob") { this._emitMessage(data); return; }
      data.arrayBuffer().then((ab) => { if (!this._closed) this._emitMessage(ab); }).catch(() => {});
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this._emitMessage(this._binaryType === "blob" ? new Blob([ab]) : ab);
      return;
    }
    this._emitMessage(data);
  }

  _transportOpened() {
    if (this._closed || this._opened) return;
    this._opened = true;
    if (this._diag) {
      this._openedAt = performance.now();
      this._transport = this._fb ? "websocket" : "webrtc";
    }
    this._clearBudget();
    this.readyState = NxSpartaSocket.OPEN;
    /* The shim's own queue goes first, in order: those sends were
     * dealt before the ones SOCKFS flushes in answer to onopen. */
    this._flushQueue();
    this._emit("open", {});
  }

  /* The RTC road failed before a transport opened. Its handlers
   * come off and its pieces close before the other road is taken,
   * so nothing from the attempt can speak after the switch. The
   * reason rides along for diagnostics: a fallback that cannot
   * say why it fell is a guess, not a measurement. */
  _failRtc(reason) {
    if (this._closed || this._opened || this._fallbackStarted) return;
    if (this._diag && reason && !this._rtcFailReason) this._rtcFailReason = reason;
    this._startFallback();
  }

  /* The diagnostic face — read by the page's sampler only when
   * the deal armed diagnostics: a plain snapshot of what this
   * socket has done, and, for a WebRTC carriage, the active peer
   * connection's own statistics for the pair that actually
   * carries the game. Nothing here opens anything; it reads the
   * connection that exists. */
  diagSnapshot() {
    return {
      state: this._closed ? "closed" : this._opened ? "open" : "connecting",
      transport: this._transport,
      setupMs: this._diag && this._openedAt ? Math.round(this._openedAt - this._createdAt) : null,
      rtcFailReason: this._rtcFailReason,
      framesIn: this._framesIn,
      framesOut: this._framesOut,
      bytesIn: this._bytesIn,
      bytesOut: this._bytesOut,
      bufferedAmount: this.bufferedAmount,
      closeCode: this._closeCode,
    };
  }
  async diagStats() {
    const pc = this._pc;
    if (!pc || this._transport !== "webrtc" || typeof pc.getStats !== "function") return null;
    let report;
    try { report = await pc.getStats(); } catch { return null; }
    const byId = new Map();
    let pair = null, channel = null, viaTransport = null;
    try {
      report.forEach((s) => { if (s && s.id) byId.set(s.id, s); });
      report.forEach((s) => {
        if (!s) return;
        if (s.type === "transport" && s.selectedCandidatePairId && !viaTransport) viaTransport = s;
        if (s.type === "data-channel" && s.label === "sparta" && !channel) channel = s;
      });
      if (viaTransport) pair = byId.get(viaTransport.selectedCandidatePairId) || null;
      if (!pair) report.forEach((s) => { if (!pair && s && s.type === "candidate-pair" && s.nominated && (s.state === "succeeded" || s.state === "in-progress")) pair = s; });
    } catch { return null; }
    if (!pair) return null;
    const local = byId.get(pair.localCandidateId) || {};
    const remote = byId.get(pair.remoteCandidateId) || {};
    return {
      localCandidateType: local.candidateType || null,
      localProtocol: local.protocol || null,
      remoteCandidateType: remote.candidateType || null,
      remoteProtocol: remote.protocol || null,
      rttMs: typeof pair.currentRoundTripTime === "number" ? Math.round(pair.currentRoundTripTime * 1000) : null,
      pairBytesSent: typeof pair.bytesSent === "number" ? pair.bytesSent : null,
      pairBytesReceived: typeof pair.bytesReceived === "number" ? pair.bytesReceived : null,
      channelMessagesSent: channel && typeof channel.messagesSent === "number" ? channel.messagesSent : null,
      channelMessagesReceived: channel && typeof channel.messagesReceived === "number" ? channel.messagesReceived : null,
    };
  }
  _teardownRtc() {
    const sig = this._sig, dc = this._dc, pc = this._pc;
    this._sig = null;
    this._dc = null;
    this._pc = null;
    if (sig) {
      try { sig.onopen = sig.onmessage = sig.onerror = sig.onclose = null; } catch { /* already still */ }
      try { sig.close(); } catch { /* already closed */ }
    }
    if (dc) {
      try { dc.onopen = dc.onmessage = dc.onclose = dc.onerror = null; } catch { /* already still */ }
      try { dc.close(); } catch { /* already closed */ }
    }
    if (pc) {
      try { pc.onicecandidate = pc.oniceconnectionstatechange = pc.onconnectionstatechange = null; } catch { /* already still */ }
      try { pc.close(); } catch { /* already closed */ }
    }
  }

  /* The exact current road: a real WebSocket to the original URL
   * with the original protocols, delegated 1:1 — its onopen is
   * the shim's onopen, its messages and errors are the shim's,
   * its close is the shim's close, code and all. */
  _startFallback() {
    if (this._closed || this._opened || this._fallbackStarted) return;
    this._fallbackStarted = true;
    this._clearBudget();
    this._teardownRtc();
    const RealWebSocket = this._realCtor;
    let ws;
    try { ws = new RealWebSocket(this.url, this._protocols); }
    catch { this._finishClose(1006, "", false); return; }
    this._fb = ws;
    try { ws.binaryType = this._binaryType; } catch { /* the socket's default stands */ }
    ws.onopen = () => {
      if (this._closed) { try { ws.close(); } catch { /* already closed */ } return; }
      this._transportOpened();
    };
    ws.onmessage = (ev) => { if (!this._closed) this._emitMessage(ev ? ev.data : undefined); };
    ws.onerror = (ev) => { if (!this._closed) this._emit("error", ev || {}); };
    ws.onclose = (ev) => {
      this._finishClose(
        ev && typeof ev.code === "number" ? ev.code : 1006,
        ev && ev.reason ? String(ev.reason) : "",
        !!(ev && ev.wasClean),
      );
    };
  }
}
NxSpartaSocket.CONNECTING = 0;
NxSpartaSocket.OPEN = 1;
NxSpartaSocket.CLOSING = 2;
NxSpartaSocket.CLOSED = 3;
/* Diagnostics plumbing, inert unless the page's deal armed it:
 * play.js sets DIAG from its diag parameter before any socket can
 * be constructed, and REGISTRY then keeps the last few sockets the
 * engine made, so the sampler reads the ACTIVE connection — never
 * a second peer opened for the purpose of measuring. */
NxSpartaSocket.DIAG = false;
NxSpartaSocket.REGISTRY = [];

/* The replacement for the page-global WebSocket, installed only
 * when a bridge is dealt, before the engine script can look the
 * constructor up. The original is captured first and kept: a
 * construction for the dealt house URL returns a shim socket;
 * a construction for any other URL returns a real WebSocket,
 * untouched in behaviour — the replacement spends itself only
 * on the house's own peers, and every peer SOCKFS makes dials
 * the dealt URL. */
function nxInstallSpartaWebSocket(houseUrl) {
  const RealWebSocket = globalThis.WebSocket;
  if (typeof RealWebSocket !== "function") return null;
  function SpartaWebSocket(url, protocols) {
    if (String(url) === houseUrl) return new NxSpartaSocket(url, protocols, RealWebSocket);
    return new RealWebSocket(url, protocols);
  }
  SpartaWebSocket.CONNECTING = NxSpartaSocket.CONNECTING;
  SpartaWebSocket.OPEN = NxSpartaSocket.OPEN;
  SpartaWebSocket.CLOSING = NxSpartaSocket.CLOSING;
  SpartaWebSocket.CLOSED = NxSpartaSocket.CLOSED;
  try { SpartaWebSocket.prototype = RealWebSocket.prototype; } catch { /* the face stands without it */ }
  globalThis.WebSocket = SpartaWebSocket;
  return SpartaWebSocket;
}
/* sparta-rtc-shim:end */

/* The deal's word on diagnostics reaches the shim before the
 * engine script loads — and so before any socket can exist. */
NxSpartaSocket.DIAG = NX_DIAG;

/* Emscripten's socket layer (SOCKFS) dials this URL verbatim for
 * every connection and offers the "sparta" subprotocol — exactly the
 * bridge's contract. Set before the engine script loads. When a
 * bridge is dealt the page-global WebSocket is the shim's first (see
 * the sparta-rtc-shim block above): the dealt values below do not
 * change — the URL SOCKFS dials is still the bridge's, word for
 * word — only the construction behind them tries the fast road
 * first and falls back to a real socket on the same URL. Dealt
 * whenever the address rides along, for every mode: the socket
 * stands ready from the menu on, and dials only when the player
 * takes the menu's door (or any connect of their own). A frame
 * dealt no bridge boots the same menu with no road out — local
 * play needs none, and the room is simply not reachable from it. */
if (bridgeLive) {
  moduleDef.websocket = { url: bridge, subprotocol: "sparta" };
  nxInstallSpartaWebSocket(bridge);
}
window.Module = moduleDef;

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

/* ————————————————————————————————————————————————————————————
 * Diagnostics (review §2) — opt-in per deal, off by default.
 *
 * Armed only when the deal carries diag=1, this block samples
 * the session every 500 ms and keeps a bounded history (1,200
 * samples = 10 minutes, 200 events) for the export the house
 * panel asks for. Three signals, each labelled for exactly what
 * it measures — the brief is explicit that a browser rAF
 * interval does not prove how often the engine renders:
 *
 *   pageRaf      — requestAnimationFrame intervals in this
 *                  frame: the browser's scheduling of the page.
 *                  A baseline is frozen from the same signal
 *                  before the engine starts (data fetch shares
 *                  the thread), so a throttled environment can
 *                  be told from a busy engine.
 *   engineFrames — the engine's own main-loop iterations,
 *                  counted from the glue's MainLoop frame
 *                  counter, reached ONLY through the
 *                  own-property descriptor probe (the standing
 *                  rule for this glue: a direct read of an
 *                  unexported runtime name can abort the
 *                  engine). A counter gives counts per window —
 *                  a rate and a mean interval, never a
 *                  distribution; null when unreachable.
 *   packets      — datagrams through the house socket face
 *                  (the shim's counters), and for a WebRTC
 *                  carriage the ACTIVE peer connection's own
 *                  getStats: the selected candidate pair, its
 *                  candidate types/protocols and its RTT. No
 *                  second peer is ever opened to measure.
 *
 * Unarmed, none of this runs: no sampler, no rAF probe, no
 * statistics calls — the flag checks in the socket and the
 * hooks are the whole footprint.
 * ———————————————————————————————————————————————————————————— */
const NX_DIAG_SAMPLE_MS = 500;
const NX_DIAG_SAMPLE_CAP = 1200;
const NX_DIAG_EVENT_CAP = 200;
const nxDiag = {
  t0: performance.now(),
  engineStartAt: 0,
  rafLast: 0,
  winDeltas: [],
  baseDeltas: [],
  preEngine: null,
  samples: [],
  events: [],
  lastTickAt: 0,
  lastFrames: null,
  lastEngineFrame: null,
  lastSockKey: "",
  version: undefined,
};
function nxDiagPushEvent(kind, detail) {
  nxDiag.events.push({ t: Math.round(performance.now() - nxDiag.t0), wall: Date.now(), kind, detail: String(detail || "") });
  if (nxDiag.events.length > NX_DIAG_EVENT_CAP) nxDiag.events.shift();
}
function nxDiagFrameStats(deltas) {
  const n = deltas.length;
  if (!n) return { n: 0, p50: null, p95: null, p99: null, gaps50: 0, mean: null };
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (p) => Math.round(sorted[Math.min(n - 1, Math.floor(p / 100 * n))] * 10) / 10;
  let sum = 0, gaps = 0;
  for (const d of deltas) { sum += d; if (d > 50) gaps++; }
  return { n, p50: pick(50), p95: pick(95), p99: pick(99), gaps50: gaps, mean: Math.round(sum / n * 10) / 10 };
}
function nxDiagRaf(now) {
  if (nxDiag.rafLast) {
    const d = now - nxDiag.rafLast;
    nxDiag.winDeltas.push(d);
    if (!nxDiag.engineStartAt && nxDiag.baseDeltas.length < 3600) nxDiag.baseDeltas.push(d);
  }
  nxDiag.rafLast = now;
  requestAnimationFrame(nxDiagRaf);
}
function nxDiagNoteEngineStart() {
  nxDiag.engineStartAt = performance.now();
  const st = nxDiagFrameStats(nxDiag.baseDeltas);
  if (st.n >= 10 && st.p50) {
    nxDiag.preEngine = {
      samples: st.n, p50: st.p50, p95: st.p95, p99: st.p99,
      refreshHz: st.p50 >= 4 && st.p50 <= 50 ? Math.round(1000 / st.p50) : null,
      note: "page rAF before the engine started; the data fetch shares this thread, so read it as the environment's cadence, not an idle desktop's",
    };
  }
  nxDiagPushEvent("engine", "engine started");
}
/* The engine's frame counter, by the house's descriptor
 * discipline (the runtimeMethod rule above): the descriptor is
 * inspected, never the property — a data descriptor's value is
 * read without running anything, and an accessor or an absence
 * simply means the signal is not there to read. */
function nxDiagEngineFrame() {
  try {
    const d = Object.getOwnPropertyDescriptor(window, "MainLoop");
    if (!d || !("value" in d) || !d.value) return null;
    const n = d.value.currentFrameNumber;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch { return null; }
}
function nxDiagSocket() {
  const reg = NxSpartaSocket.REGISTRY;
  for (let i = reg.length - 1; i >= 0; i--) {
    if (reg[i].diagSnapshot().state === "open") return reg[i];
  }
  return reg.length ? reg[reg.length - 1] : null;
}
function nxDiagFetchVersion() {
  if (nxDiag.version !== undefined) return Promise.resolve(nxDiag.version);
  return fetch("/version.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { nxDiag.version = j; return j; })
    .catch(() => { nxDiag.version = null; return null; });
}
async function nxDiagTick() {
  const now = performance.now();
  const elapsed = nxDiag.lastTickAt ? (now - nxDiag.lastTickAt) / 1000 : 0;
  nxDiag.lastTickAt = now;
  const deltas = nxDiag.winDeltas;
  nxDiag.winDeltas = [];
  const raf = nxDiagFrameStats(deltas);
  const ef = nxDiagEngineFrame();
  let engineDelta = null;
  if (ef !== null && nxDiag.lastEngineFrame !== null) engineDelta = ef - nxDiag.lastEngineFrame;
  if (ef !== null) nxDiag.lastEngineFrame = ef;
  const sock = nxDiagSocket();
  const snap = sock ? sock.diagSnapshot() : null;
  let stats = null;
  if (sock && snap && snap.state === "open" && snap.transport === "webrtc") {
    try { stats = await sock.diagStats(); } catch { stats = null; }
  }
  let pktInPerSec = null, pktOutPerSec = null;
  if (snap && elapsed > 0) {
    if (nxDiag.lastFrames) {
      pktInPerSec = Math.round((snap.framesIn - nxDiag.lastFrames.fi) / elapsed);
      pktOutPerSec = Math.round((snap.framesOut - nxDiag.lastFrames.fo) / elapsed);
    }
    nxDiag.lastFrames = { fi: snap.framesIn, fo: snap.framesOut };
  }
  const sockKey = snap
    ? snap.state + "|" + (snap.transport || "") + "|" + (snap.rtcFailReason || "") + "|" + (snap.closeCode ?? "")
    : "none";
  if (sockKey !== nxDiag.lastSockKey) {
    nxDiag.lastSockKey = sockKey;
    if (snap) nxDiagPushEvent("transport", snap.state + (snap.transport ? " via " + snap.transport : "")
      + (snap.rtcFailReason ? " (rtc did not carry it: " + snap.rtcFailReason + ")" : "")
      + (snap.closeCode !== null && snap.closeCode !== undefined ? " close " + snap.closeCode : ""));
  }
  const sample = {
    t: Math.round(now - nxDiag.t0),
    wall: Date.now(),
    transport: snap ? snap.transport : null,
    sockState: snap ? snap.state : "none",
    setupMs: snap ? snap.setupMs : null,
    rtcFailReason: snap ? snap.rtcFailReason : null,
    rttMs: stats ? stats.rttMs : null,
    ice: stats ? { local: stats.localCandidateType, localProto: stats.localProtocol, remote: stats.remoteCandidateType, remoteProto: stats.remoteProtocol } : null,
    framesIn: snap ? snap.framesIn : 0,
    framesOut: snap ? snap.framesOut : 0,
    bytesIn: snap ? snap.bytesIn : 0,
    bytesOut: snap ? snap.bytesOut : 0,
    pktInPerSec, pktOutPerSec,
    buffered: snap ? snap.bufferedAmount : 0,
    raf: { p50: raf.p50, p95: raf.p95, p99: raf.p99, gaps50: raf.gaps50, n: raf.n },
    engineFrames: engineDelta,
    focus: document.hasFocus(),
    visibility: document.visibilityState,
    fullscreen: fsOn,
    pointerLock: document.pointerLockElement === canvasEl,
    canvas: [canvasEl.width, canvasEl.height],
    dpr: window.devicePixelRatio || 1,
  };
  nxDiag.samples.push(sample);
  if (nxDiag.samples.length > NX_DIAG_SAMPLE_CAP) nxDiag.samples.shift();
  post({
    type: "diag",
    summary: {
      t: sample.t,
      transport: sample.transport,
      sockState: sample.sockState,
      setupMs: sample.setupMs,
      rtcFailReason: sample.rtcFailReason,
      rttMs: sample.rttMs,
      ice: stats ? `${stats.localCandidateType || "?"}/${stats.localProtocol || "?"} to ${stats.remoteCandidateType || "?"}/${stats.remoteProtocol || "?"}` : null,
      framesIn: sample.framesIn,
      framesOut: sample.framesOut,
      pktInPerSec, pktOutPerSec,
      buffered: sample.buffered,
      rafP50: raf.p50, rafP95: raf.p95, rafP99: raf.p99, rafGaps50: raf.gaps50,
      engineFps: engineDelta !== null && elapsed > 0 ? Math.round(engineDelta / elapsed * 10) / 10 : null,
      refreshHz: nxDiag.preEngine ? nxDiag.preEngine.refreshHz : null,
      canvas: sample.canvas,
      focus: sample.focus,
      fullscreen: sample.fullscreen,
      pointerLock: sample.pointerLock,
      sampleCount: nxDiag.samples.length,
    },
  });
}
function nxDiagContext() {
  let bridgeHost = null;
  try { bridgeHost = bridge ? new URL(bridge).host : null; } catch { bridgeHost = null; }
  return {
    exportedAt: new Date().toISOString(),
    session: NX_SESSION,
    mode,
    engineStamp: NX_ENGINE_STAMP,
    siteBuild: nxDiag.version !== undefined ? nxDiag.version : null,
    userAgent: navigator.userAgent,
    platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    displayRefreshHz: nxDiag.preEngine ? nxDiag.preEngine.refreshHz : null,
    bridgeHost,
    visibility: document.visibilityState,
    focus: document.hasFocus(),
    fullscreen: fsOn,
    pointerLock: document.pointerLockElement === canvasEl,
    canvasBacking: [canvasEl.width, canvasEl.height],
    devicePixelRatio: window.devicePixelRatio || 1,
    sampleIntervalMs: NX_DIAG_SAMPLE_MS,
    sampleCap: NX_DIAG_SAMPLE_CAP,
    signals: {
      pageRaf: "requestAnimationFrame intervals in this frame — the browser's scheduling of the page, not engine renders",
      engineFrames: "engine main-loop iterations per sample window, counted from the glue's MainLoop frame counter (descriptor-probed, read-only); null when the counter is unreachable",
      packets: "datagrams through the house socket face (shim counters); for webrtc, rtt/ice/pair figures come from the active peer connection's own getStats",
    },
  };
}
function nxDiagBuildExport() {
  return {
    kind: "nexuiz-diagnostics",
    version: 1,
    header: nxDiagContext(),
    baseline: nxDiag.preEngine,
    events: nxDiag.events,
    samples: nxDiag.samples,
  };
}
async function nxDiagSendExport() {
  if (nxDiag.version === undefined) {
    await Promise.race([nxDiagFetchVersion(), new Promise((r) => setTimeout(r, 800))]);
  }
  post({ type: "diag-export", export: nxDiagBuildExport() });
}
function nxDiagDownload() {
  try {
    const blob = new Blob([JSON.stringify(nxDiagBuildExport(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexuiz-diagnostics.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { /* a framed page's export travels by postMessage instead */ }
}
function nxDiagInit() {
  nxDiagPushEvent("boot", "diagnostics armed for this deal");
  requestAnimationFrame(nxDiagRaf);
  setInterval(() => { void nxDiagTick(); }, NX_DIAG_SAMPLE_MS);
  void nxDiagFetchVersion();
  window.__nexuizDiag = { export: () => nxDiagBuildExport(), download: () => nxDiagDownload() };
}
if (NX_DIAG) nxDiagInit();

/* Escape, watched — never touched. In true fullscreen a press
 * of Esc is the game's menu key: it must reach the engine
 * exactly as pressed, so these listeners only observe the edges
 * (no preventDefault, no stopPropagation, ever) and report them
 * to the house, which runs the hold clock — the fullscreen
 * element, and with it the only exit, is the OS frame's stage.
 * A continuous 4.5-second hold is the one way out; a press or a
 * shorter hold is the game's, whole. A blur mid-hold reads as a
 * release: a hold nobody is still making must not fire. */
let escHeld = false;
window.addEventListener("keydown", (e) => {
  /* A key press in the frame is a live gesture — the one moment
   * the platform reliably grants pointer lock (see takeLock). */
  if (e.key !== "Escape" && fsOn) takeLock();
  if (e.key !== "Escape" || e.repeat || escHeld) return;
  escHeld = true;
  post({ type: "esc-down" });
});
window.addEventListener("keyup", (e) => {
  if (e.key !== "Escape" || !escHeld) return;
  escHeld = false;
  post({ type: "esc-up" });
  /* A press can cost the lock at its start — the platform still
   * treats Esc as its own key on the way in — and the hold
   * standing down is what re-arms the keeper: schedule the
   * re-take now, past the cooldown, if the session lost it. */
  if (fsOn && document.pointerLockElement !== canvasEl) scheduleRelock();
});
window.addEventListener("blur", () => {
  if (!escHeld) return;
  escHeld = false;
  post({ type: "esc-up" });
});

/* The mouse: one pointer truth per state. In play, the mouse
 * is captured — pointer lock, raw: every lock request made in
 * this frame (the engine's own, through its SDL/Emscripten
 * glue, and this keeper's) passes through the interception
 * below, which is installed here, before the engine script is
 * ever loaded, and asks for unadjustedMovement — the browser's
 * raw, unaccelerated movement — wherever the options form is
 * offered; a refusal of the options form falls back to the
 * plain call, so the option can never cost the lock. In the
 * menus, the mouse is NOT captured: the menu progs paint no
 * cursor (house QC patch 011) and track the player's real
 * cursor in absolute mode (menu_mouse_absolute, dealt in the
 * house config), so the native cursor standing over the canvas
 * IS the game's pointer, at the same coordinates the engine
 * hit-tests.
 *
 * The engine itself says which state stands: it asks for
 * relative mouse (a pointer-lock request out of its glue) when
 * play owns the mouse, and releases it (an exitPointerLock out
 * of the same glue) when a menu takes over. The interception
 * records that want, and the keeper below serves only it:
 * while the engine wants the mouse, a lock lost mid-play is
 * re-asked — after the browser's re-lock cooldown (Chromium
 * refuses a re-lock for ~1.25 s after an Esc-cost loss) — and
 * anchored where gestures happen, because the platform grants
 * the lock only to a live gesture inside the frame (a message
 * from the house carries none — Chromium answers
 * NotAllowedError). While a menu stands, the keeper asks for
 * nothing: no lock is taken, held or healed over a menu, in
 * fullscreen or windowed alike. One stand-down rides over both
 * states: while an Esc hold is underway nothing re-locks, so
 * the earned hold-exit is one act and no race undoes it. A
 * failed ask is retried a few times, never in a loop.
 *
 * The census is the proof surface: every request is logged
 * with who asked (engine or keeper) and what the browser
 * granted (unadjusted, or the plain fallback), in
 * window.nxLockCensus and, when armed, the diagnostics log. */
let engineWantsLock = false;
let keeperAsking = false;
const nxLockCensus = [];
window.nxLockCensus = nxLockCensus;
function nxLockNote(by, form, outcome) {
  const entry = { t: Date.now(), by, form, outcome };
  nxLockCensus.push(entry);
  if (nxLockCensus.length > 64) nxLockCensus.shift();
  if (NX_DIAG) nxDiagPushEvent("pointerlock-ask", by + " " + form + " " + outcome);
  return entry;
}
const nxNativeRequestPointerLock = Element.prototype.requestPointerLock;
Element.prototype.requestPointerLock = function (...args) {
  if (this !== canvasEl) return nxNativeRequestPointerLock.apply(this, args);
  const by = keeperAsking ? "keeper" : "engine";
  if (!keeperAsking) engineWantsLock = true;
  if (args.length > 0) { nxLockNote(by, "as-asked", "asked"); return nxNativeRequestPointerLock.apply(this, args); }
  let first;
  try {
    first = nxNativeRequestPointerLock.call(this, { unadjustedMovement: true });
  } catch {
    nxLockNote(by, "plain", "options form refused (throw) — plain ask follows");
    return nxNativeRequestPointerLock.call(this);
  }
  if (first && typeof first.then === "function") {
    const entry = nxLockNote(by, "unadjusted", "asked");
    return first.then(
      () => { entry.outcome = "granted"; if (NX_DIAG) nxDiagPushEvent("pointerlock-grant", by + " unadjusted"); },
      () => {
        entry.outcome = "refused — plain fallback follows";
        nxLockNote(by, "plain", "fallback ask");
        return nxNativeRequestPointerLock.call(this);
      },
    );
  }
  nxLockNote(by, "unadjusted", "asked (no promise — grant read at pointerlockchange)");
  return first;
};
const nxNativeExitPointerLock = Document.prototype.exitPointerLock;
Document.prototype.exitPointerLock = function (...args) {
  engineWantsLock = false;
  return nxNativeExitPointerLock.apply(this, args);
};

let fsOn = false;
let lockFails = 0;
let relockTimer = 0;
const RELOCK_MS = 1400;
function engineStarted() { lockFails = 0; takeLock(); }
function houseFullscreen(on) {
  fsOn = on;
  if (NX_DIAG) nxDiagPushEvent("fullscreen", on ? "entered" : "left");
  if (on) { lockFails = 0; takeLock(); }
  else clearTimeout(relockTimer);
}
function takeLock() {
  if (!fsOn || escHeld || engineDead) return;
  if (!engineWantsLock) return;
  if (document.pointerLockElement === canvasEl) return;
  if (lockFails >= 4) return;
  keeperAsking = true;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && typeof p.catch === "function") p.catch(() => { lockFails++; scheduleRelock(); });
  } catch { lockFails++; scheduleRelock(); }
  keeperAsking = false;
}
function scheduleRelock() {
  if (!fsOn || escHeld || engineDead) return;
  if (!engineWantsLock) return;
  clearTimeout(relockTimer);
  relockTimer = setTimeout(takeLock, RELOCK_MS);
}
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvasEl;
  if (NX_DIAG) nxDiagPushEvent("pointerlock", locked ? "taken" : "lost");
  nxApplyCursor();
  if (locked) { lockFails = 0; return; }
  scheduleRelock();
});
/* The cursor truth, worn on the canvas: the real cursor stands
 * whenever the lock does not own the mouse (menus, the plate),
 * and is hidden exactly while it does. The engine hides the
 * browser cursor under its own hand (its SDL layer disables
 * the cursor in menus and in play alike, for the sake of the
 * drawn cursor patch 011 retires), and it re-asserts that word
 * whenever its mouse mode changes — so the page's answer is a
 * standing one: an important declaration for the state's
 * truth, re-applied the moment the canvas's style changes
 * under it (a mutation observer fires before paint, so the
 * wrong cursor never shows). Under lock the platform hides
 * the cursor regardless; this keeps the unlocked states
 * honest by construction. */
function nxApplyCursor() {
  const want = document.pointerLockElement === canvasEl ? "none" : "default";
  if (canvasEl.style.getPropertyValue("cursor") !== want
    || canvasEl.style.getPropertyPriority("cursor") !== "important") {
    canvasEl.style.setProperty("cursor", want, "important");
  }
}
new MutationObserver(nxApplyCursor).observe(canvasEl, { attributes: true, attributeFilter: ["style"] });
nxApplyCursor();
document.addEventListener("pointerlockerror", () => { lockFails++; scheduleRelock(); });

/* The house's words (the OS stage owns the fullscreen state; the
 * frame only hears of it): the canvas refits, so the game takes
 * the whole display. The words are believed only from the house
 * itself — this origin, and the parent window — because a data
 * field alone is not a credential: any frame on the page could
 * spell "house" (review §8). */
window.addEventListener("message", (ev) => {
  if (ev.origin !== location.origin || ev.source !== window.parent) return;
  const m = ev.data;
  if (!m || m.from !== "house") return;
  if (m.type === "diag-export") { if (NX_DIAG) void nxDiagSendExport(); return; }
  if (m.type !== "fullscreen") return;
  document.body.classList.toggle("fs", !!m.on);
  houseFullscreen(!!m.on);
  fitSoon();
});

/* When this frame goes away — the OS window closed, the tab closed,
 * navigation — ask the loader to commit the engine's filesystem to
 * the machine's storage, so what the engine downloaded in-session
 * (maps, house packs) is still there next visit. Best effort at the
 * door, on top of the filesystem's own auto-persist. */
window.addEventListener("pagehide", () => {
  const M = window.Module;
  if (M && typeof M.houseSyncFS === "function") { try { M.houseSyncFS(); } catch {} }
});

let engineRaised = false;
function raiseEngine() {
  if (engineRaised) return;
  engineRaised = true;
  fitCanvas();
  plateText.textContent = bridgeLive
    ? "raising the engine — it stands up on its own menu; the haxiuz door is in it, on the multiplayer side…"
    : "raising the engine…";
  const s = document.createElement("script");
  s.src = "darkplaces-wasm.js?v=" + NX_ENGINE_STAMP;
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
}
/* The engine raises itself. The click-to-play plate belonged to
 * the auto-join: its press dealt the player into the room, so a
 * press was the honest moment to stand the engine up. The menu
 * is the front door now, and reaching it asks for no press at
 * all — the frame deals the game, the game stands up on its
 * menu. (A press on the game still takes the pointer lock, per
 * the keeper above; that was always the game's own business.) */
raiseEngine();
/* A press on the canvas is a live gesture inside the frame, the
 * moment the platform reliably grants the lock, so it asks for
 * the lock (the engine's own click-to-lock rides the same press
 * either way). The raise guard rides along as a belt: should
 * the self-raise above ever be refused, a press still stands
 * the engine up rather than leaving a dead plate. */
canvasEl.addEventListener("mousedown", () => {
  if (!engineRaised && !engineDead) raiseEngine();
  takeLock();
});
