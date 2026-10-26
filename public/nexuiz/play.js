"use strict";
const q = new URLSearchParams(location.search);
const rawMode = q.get("mode");
const mode = rawMode === "minsta" || rawMode === "join" ? rawMode : "menu";
const rawName = (q.get("name") || "").replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "").slice(0, 24);
const dataBase = q.get("base") || "/api/nexuiz-data";
/* The engine build stamp. The glue script and the wasm are served
 * immutable (see public/_headers), so their URLs must change when
 * the engine does: this stamp rides both URLs, and play.js itself
 * stays revalidated, so a new stamp is always picked up. Bump it
 * whenever darkplaces-wasm.js or darkplaces-wasm.wasm is rebuilt
 * (the rule is written down in tools/nexuiz/BUILD.md). */
const NX_ENGINE_STAMP = "4";
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
  locateFile(path) { return path.endsWith(".wasm") ? path + "?v=" + NX_ENGINE_STAMP : path; },
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
    /* The setup budget runs from construction: the fast road
     * proves itself in this window or the other road is taken. */
    this._budgetTimer = setTimeout(() => this._failRtc(), NX_RTC_BUDGET_MS);
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
  _emitMessage(data) { this._emit("message", { data }); }

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
    if (this._dc && this._dc.readyState === "open") { this._dc.send(data); return; }
    if (this._fb && this._fb.readyState === NxSpartaSocket.OPEN) { this._fb.send(data); return; }
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
    if (typeof RTC !== "function") { this._startFallback(); return; }
    let sigUrl;
    try { sigUrl = nxSpartaSignalUrl(this.url); } catch { this._startFallback(); return; }
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
    } catch { this._startFallback(); return; }

    dc.onopen = () => this._transportOpened();
    dc.onmessage = (ev) => { if (!this._closed) this._deliverDcData(ev ? ev.data : undefined); };
    dc.onclose = () => {
      if (this._closed) return;
      if (!this._opened) this._failRtc();
      else this._finishClose(1006, "", false);
    };
    dc.onerror = () => { if (!this._opened) this._failRtc(); };

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
      if (!this._opened) this._failRtc();
      else if (state === "failed") this._finishClose(1006, "", false);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state !== "failed" && state !== "disconnected") return;
      if (!this._opened) this._failRtc();
      else if (state === "failed") this._finishClose(1006, "", false);
    };

    sig.onopen = () => {
      const queued = this._sigQueue;
      this._sigQueue = [];
      for (const text of queued) { try { sig.send(text); } catch { /* a dead signaling socket is the RTC road's failure, handled by its own handlers */ } }
    };
    sig.onmessage = (ev) => this._onSignal(ev ? ev.data : undefined);
    sig.onerror = () => { if (!this._opened) this._failRtc(); };
    sig.onclose = () => { if (!this._opened && !this._closed) this._failRtc(); };

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
      } catch { this._failRtc(); }
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
        } catch { this._failRtc(); }
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
    this._clearBudget();
    this.readyState = NxSpartaSocket.OPEN;
    /* The shim's own queue goes first, in order: those sends were
     * dealt before the ones SOCKFS flushes in answer to onopen. */
    this._flushQueue();
    this._emit("open", {});
  }

  /* The RTC road failed before a transport opened. Its handlers
   * come off and its pieces close before the other road is taken,
   * so nothing from the attempt can speak after the switch. */
  _failRtc() {
    if (this._closed || this._opened || this._fallbackStarted) return;
    this._startFallback();
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

/* The replacement for the page-global WebSocket, installed only
 * on a live join, before the engine script can look the
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

/* Emscripten's socket layer (SOCKFS) dials this URL verbatim for
 * every connection and offers the "sparta" subprotocol — exactly the
 * bridge's contract. Set before the engine script loads. On a live
 * join the page-global WebSocket is the shim's first (see the
 * sparta-rtc-shim block above): the dealt values below do not
 * change — the URL SOCKFS dials is still the bridge's, word for
 * word — only the construction behind them tries the fast road
 * first and falls back to a real socket on the same URL. */
if (joinLive) {
  moduleDef.websocket = { url: bridge, subprotocol: "sparta" };
  nxInstallSpartaWebSocket(bridge);
}
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

/* The mouse, held. In true fullscreen the external cursor is
 * disabled for the whole session: the canvas holds pointer lock
 * from the moment the house says the screen is taken until the
 * hold-exit drops lock and fullscreen together, and the game's
 * own software cursor does the menu work under it, the way
 * DarkPlaces renders it. The lock is asked for at fullscreen
 * entry and re-asked whenever it is lost while the session
 * stands — a short Esc can cost it, and the engine's own
 * relative-mouse toggles in its menus can too — after the
 * browser's re-lock cooldown (Chromium refuses a re-lock for
 * ~1.25 s after an Esc-cost loss). One stand-down: while an Esc
 * hold is underway nothing re-locks, so the hold-exit is one act
 * and no race undoes it. A failed ask is retried a few times,
 * never in a loop. And because the platform grants the lock
 * only to a live gesture inside the frame (a message from the
 * house carries none — Chromium answers NotAllowedError), the
 * asks are anchored where gestures happen: the press that
 * raises the engine, and any key or press in the frame after.
 * Windowed play is untouched: there, the lock stays the
 * engine's click-to-play business, as shipped. */
let fsOn = false;
let lockFails = 0;
let relockTimer = 0;
const RELOCK_MS = 1400;
function engineStarted() { lockFails = 0; takeLock(); }
function houseFullscreen(on) {
  fsOn = on;
  if (on) { lockFails = 0; takeLock(); }
  else clearTimeout(relockTimer);
}
function takeLock() {
  if (!fsOn || escHeld || engineDead) return;
  if (document.pointerLockElement === canvasEl) return;
  if (lockFails >= 4) return;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && typeof p.catch === "function") p.catch(() => { lockFails++; scheduleRelock(); });
  } catch { lockFails++; scheduleRelock(); }
}
function scheduleRelock() {
  if (!fsOn || escHeld || engineDead) return;
  clearTimeout(relockTimer);
  relockTimer = setTimeout(takeLock, RELOCK_MS);
}
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvasEl) { lockFails = 0; return; }
  scheduleRelock();
});
document.addEventListener("pointerlockerror", () => { lockFails++; scheduleRelock(); });

/* The house word on fullscreen (the OS stage owns the state; the
 * frame only hears of it): the canvas refits, so the game takes
 * the whole display. */
window.addEventListener("message", (ev) => {
  const m = ev.data;
  if (!m || m.from !== "house" || m.type !== "fullscreen") return;
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
  plateBtn.hidden = true;
  plateText.textContent = mode === "join"
    ? "raising the engine — it deals you into thisissparta2! when the table is up…"
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
plateBtn.addEventListener("click", raiseEngine);
/* Under pointer lock a press lands on the canvas, never on the
 * plate button — the same press raises the engine, so the door
 * is never locked shut. The press is also a live gesture inside
 * the frame, the moment the platform reliably grants the lock,
 * so it asks for the lock too, engine raising or not (the
 * engine's own click-to-lock rides the same press either way). */
canvasEl.addEventListener("mousedown", () => {
  if (!engineRaised && !engineDead && !plateBtn.hidden) raiseEngine();
  takeLock();
});
