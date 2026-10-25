// @ts-nocheck
// BLACKSITE Relay bridge — browsers cannot open raw TCP, so the OS room's
// IRC client speaks WebSocket to this bridge and the bridge speaks TCP/TLS
// to a public IRC network. This is a plug, not a relay in the open sense:
// the destination must be one of the allowlisted public networks below,
// and the target still passes the site-wide public-target guard before any
// socket opens. The bridge pipes lines — and, through _lib/relay-memory,
// it also holds the room's recent lines in a short, deliberately mutable
// memory (expiring, capped, purged by moderation; a wipe takes back
// only the wiper's own lines) so a client joining from any device
// hears what the room
// recently said. With no memory binding configured it keeps nothing, as
// it always did.
import { guardTarget, err } from "../_lib/guard";
import { memAppend, memBuildProbe, memPurgeNick, memReplay } from "../_lib/relay-memory";

const NETWORKS: Record<string, number[]> = {
  "irc.libera.chat": [6697, 6667],
  "irc.oftc.net": [6697, 6667],
  "irc.hackint.org": [6697, 6667],
};

/* Claimed names — the operator's own. Nobody wears one of these through
   this bridge without the house claim code, so nobody on the wire can
   impersonate the house. A nick counts as claimed when, lowercased and
   stripped of decoration characters, it equals a protected name or is a
   protected name followed only by digits (chasebryan, chasebryan_ and
   chasebryan99 are all the same claim). The code itself never appears
   here — only its SHA-256; the client presents it as PASS nsm-claim:<code>
   before NICK, the bridge verifies and swallows that line, and the code
   never crosses to the network. Network-wide, NickServ registration is
   the second lock; this lock guards every door this site opens.
   The comparison folds the FULL IRC nick special set first: brackets
   and braces are legal nick characters, and RFC1459 casemapping pairs
   { } | ~ with [ ] \ ^ — without the fold, chasebryan{ or
   chasebryan[] walked straight past the gate and rendered in the room
   as the house. The client twin (os-irc.ts isHouseName) folds the
   identical way, so the courtesy check and the enforcement agree. */
const PROTECTED = ["nightwarelabz", "nosuchmachine", "chasebryan", "chase", "nightjar"];
const CLAIM_SHA256 = "02f61fd0c47816f3400fafcdcc05c33b01c13c636075ac6edbccaa983acfac01";
/* RFC1459 casemap, then strip every nick-decoration character: two
   nicks that a network would treat as the same name — or that merely
   render as the same name in the room — fold to the same base here. */
function foldNick(nick: string): string {
  return nick
    .toLowerCase()
    .replace(/\{/g, "[")
    .replace(/\}/g, "]")
    .replace(/\|/g, "\\")
    .replace(/~/g, "^")
    .replace(/[\[\]\\^`_|-]/g, "");
}
function claimedName(nick: string): string | null {
  const base = foldNick(nick);
  for (const p of PROTECTED) {
    if (base === p) return p;
    if (base.startsWith(p) && /^\d+$/.test(base.slice(p.length))) return p;
  }
  return null;
}

export async function onRequest(context: any) {
  const { request } = context;
  if (request.headers.get("Upgrade") !== "websocket") return err("relay bridge: websocket upgrade required.", 426);
  // Browser callers must come from the site itself: any web page can
  // otherwise open bridge sessions out of a visitor's browser and burn
  // the house's wires as a connection mule. A missing Origin is a
  // non-browser client, which is the bridge's own kind of caller.
  const origin = request.headers.get("Origin");
  if (origin) {
    let originUrl: string | null = null;
    try { originUrl = new URL(origin).origin; } catch { originUrl = null; }
    if (originUrl !== new URL(request.url).origin) return err("relay bridge: websocket upgrades are accepted from this site only.", 403);
  }
  const url = new URL(request.url);
  const host = (url.searchParams.get("host") || "").toLowerCase();
  const port = Number(url.searchParams.get("port") || 6697);
  const allowed = NETWORKS[host];
  if (!allowed) return err(`relay bridge: ${host || "(no network)"} is not one of the house networks (Libera.Chat, OFTC, hackint).`, 403);
  if (!allowed.includes(port)) return err(`relay bridge: port ${port} is not open on ${host} (use 6697 for TLS or 6667 for plain).`, 403);
  let addresses: string[];
  try {
    const g = await guardTarget(host);
    addresses = g.addresses;
  } catch (e: any) {
    return err(String(e?.message || e), 403);
  }
  if (!addresses.length) return err("relay bridge: the network does not resolve to a public address.", 403);
  const { connect } = await import("cloudflare:sockets");
  // Connect by hostname, not by the guard's resolved IP: with TLS on, the
  // certificate is issued for the network's name — an IP literal fails SNI
  // and validation, and the leg dies silently (proven live: port 6667
  // answered with the network banner while 6697 closed without a byte).
  // The guard above has already proven this name resolves to public space,
  // and the host is allowlisted, so the name is the right dial string.
  void addresses;
  let socket: any;
  try {
    socket = connect(
      { hostname: host, port },
      { secureTransport: port === 6697 ? "on" : "off", allowHalfOpen: false },
    );
  } catch (e: any) {
    return err(`relay bridge: the connection could not be opened (${String(e?.message || e).slice(0, 120)}).`, 502);
  }
  const mem = context.env?.RELAY_MEMORY || null;
  // A client that names its build lets the bridge register a full
  // service restart in the room's memory (see relay-memory's probe):
  // a new build going live is the one event that refreshes everyone
  // at once, and the room hears about it once, in yellow, on rejoin.
  void memBuildProbe(mem, host, "#nosuchmachine", (url.searchParams.get("build") || "").slice(0, 80),
    "BLACKSITE was restarted — a new build went live and every client has been refreshed onto it.");
  let myNick = "";
  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = Object.values(pair) as any[];
  server.accept();
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let closed = false;
  // The bridge had no clock: a network that never answered, or a room
  // gone silent, pinned the pair open until the client left. Same
  // discipline as the ssh bridge — a 10-second connect deadline and a
  // five-minute idle reaper, re-armed by any byte in either direction.
  const CONNECT_DEADLINE_MS = 10000;
  const IDLE_LIMIT_MS = 5 * 60 * 1000;
  let idleTimer: any = null;
  let connectTimer: any = null;
  const closeBoth = (code?: number) => {
    if (closed) return; closed = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (connectTimer) clearTimeout(connectTimer);
    // A claim refusal closes with 4403 so the client can tell a final
    // refusal from a dropped wire — and stop re-presenting the same
    // refused name in an auto-reconnect loop.
    try { if (code) server.close(code); else server.close(); } catch { /* already gone */ }
    try { reader.cancel(); } catch { /* already gone */ }
    try { socket.close(); } catch { /* already gone */ }
  };
  const armIdle = () => {
    if (closed) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeBoth(), IDLE_LIMIT_MS);
  };
  connectTimer = setTimeout(() => closeBoth(), CONNECT_DEADLINE_MS);
  socket.opened.then(
    () => { if (connectTimer) clearTimeout(connectTimer); armIdle(); },
    () => closeBoth(),
  );
  /* ————— the memory tap —————
     The wire itself is forwarded byte-for-byte untouched; alongside it,
     a line tap watches what the room says. Channel lines are remembered,
     a removal purges the removed voice from the memory, and when this
     session's own join echoes back, the room's recent past is replayed
     down this one wire — tagged, so the client can lay it in with its
     true time and never mistake it for the living moment. */
  const enc = new TextEncoder();
  const tapDec = new TextDecoder();
  let inBuf = "";
  const observeLine = (line: string) => {
    if (!mem) return;
    try {
      let m = /^:(\S+) PRIVMSG (\S+) :([\s\S]*)$/.exec(line) || /^:(\S+) PRIVMSG (\S+) (\S[\s\S]*)$/.exec(line);
      if (m) {
        const nick = m[1].split("!")[0];
        if (m[2].startsWith("#") && !nick.includes(".")) {
          void memAppend(mem, host, m[2], { t: Date.now(), p: m[1], x: m[3] }, CLAIM_SHA256);
        }
        return;
      }
      m = /^:(\S+) KICK (\S+) (\S+)/.exec(line);
      if (m) { void memPurgeNick(mem, host, m[2], m[3]); return; }
      m = /^:(\S+) JOIN :?(\S+)$/.exec(line);
      if (m) {
        const nick = m[1].split("!")[0];
        if (myNick && nick.toLowerCase() === myNick.toLowerCase()) {
          const chan = m[2];
          void (async () => {
            const past = await memReplay(mem, host, chan);
            for (const pastLine of past) {
              if (closed) return;
              try {
                server.send(enc.encode(`@time=${new Date(pastLine.t).toISOString()};relaymem=1 :${pastLine.p} PRIVMSG ${chan} :${pastLine.x}\r\n`));
              } catch { return; }
            }
          })();
        }
        return;
      }
      m = /^:(\S+) NICK :?(\S+)$/.exec(line);
      if (m) {
        const old = m[1].split("!")[0];
        if (myNick && old.toLowerCase() === myNick.toLowerCase()) myNick = m[2];
      }
    } catch { /* the tap never breaks the wire */ }
  };
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          armIdle(); server.send(value);
          if (mem) {
            inBuf += tapDec.decode(value, { stream: true });
            // The tap's buffer is capped like the client's: newline-
            // free junk from either side must not pin isolate memory.
            if (inBuf.length > MAX_BUF) { closeBoth(); return; }
            let idx;
            while ((idx = inBuf.indexOf("\n")) >= 0) {
              const line = inBuf.slice(0, idx).replace(/\r$/, "");
              inBuf = inBuf.slice(idx + 1);
              if (line.length > MAX_LINE) { closeBoth(); return; }
              if (line) observeLine(line);
            }
          }
        }
      }
    } catch { /* the wire ended */ }
    closeBoth();
  })();
  let claimed = false;
  let refused = false;
  let lineBuf = "";
  // Line discipline: IRC lines are short by protocol (512 bytes on the
  // wire); 8 KB is generous headroom for this bridge's own control
  // lines, and 64 KB of un-newlined buffer is far past any honest use.
  // Either overflow closes the session — an uncapped buffer is a
  // memory pin any client can set and walk away from.
  const MAX_BUF = 64 * 1024;
  const MAX_LINE = 8 * 1024;
  server.addEventListener("message", async (event: any) => {
    if (refused) return;
    try {
      const text = event.data instanceof ArrayBuffer ? new TextDecoder().decode(new Uint8Array(event.data)) : String(event.data);
      lineBuf += text;
      if (lineBuf.length > MAX_BUF) { closeBoth(); return; }
      let idx;
      while ((idx = lineBuf.indexOf("\n")) >= 0) {
        const raw = lineBuf.slice(0, idx).replace(/\r$/, "");
        lineBuf = lineBuf.slice(idx + 1);
        if (raw.length > MAX_LINE) { closeBoth(); return; }
        if (!raw) continue;
        const upper = raw.toUpperCase();
        if (upper.startsWith("PASS NSM-CLAIM:")) {
          const token = raw.slice(raw.indexOf(":") + 1).trim();
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
          const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
          claimed = hex === CLAIM_SHA256;
          continue;
        }
        if (upper.startsWith("NICK ")) {
          const want = raw.slice(5).trim().split(" ")[0];
          if (claimedName(want) && !claimed) {
            refused = true;
            try {
              server.send(new TextEncoder().encode(`:relay.bridge NOTICE * :the name "${want}" is claimed \u2014 it belongs to the house, and it opens only with the house claim code. Pick another nick, or enter the claim code in Relay.\r\n`));
            } catch { /* the refusal still closes */ }
            setTimeout(() => closeBoth(4403), 300);
            return;
          }
          myNick = want;
        }
        if (upper.startsWith("RELAYMEM-WIPE")) {
          // A control line for the bridge alone — it never crosses to
          // the network. By the house's ruling a wipe reaches exactly
          // as far as authorship: it takes back the wiper's OWN lines
          // from the room's memory, and no one else's. The bridge
          // knows the name this session wears, and that name is the
          // whole scope — there is no way to name another voice here.
          const chan = raw.split(/\s+/)[1] || "";
          const say = (text: string) => { try { server.send(new TextEncoder().encode(`:relay.bridge NOTICE * :${text}\r\n`)); } catch { /* the answer is best-effort; the act is what counts */ } };
          if (!mem) say("this bridge keeps no room memory — there is nothing to take back.");
          else if (!chan.startsWith("#")) say("name the room: RELAYMEM-WIPE #channel — it takes back your own lines there.");
          else if (!myNick) say("you are wearing no name yet — there is nothing of yours to take back.");
          else {
            void memPurgeNick(mem, host, chan, myNick);
            say(`your lines in ${chan} are wiped from the room's memory. Yours were the only ones touched.`);
          }
          continue;
        }
        if (mem && myNick) {
          // The speaker's own lines join the memory at the sending —
          // a lone voice in the room is still the room speaking.
          const pm = /^PRIVMSG (\S+) :([\s\S]*)$/i.exec(raw) || /^PRIVMSG (\S+) (\S[\s\S]*)$/i.exec(raw);
          if (pm && pm[1].startsWith("#")) {
            void memAppend(mem, host, pm[1], { t: Date.now(), p: `${myNick}!${myNick}@relay.bridge`, x: pm[2] }, CLAIM_SHA256);
          }
        }
        await writer.write(new TextEncoder().encode(raw + "\r\n"));
        armIdle();
      }
    } catch { closeBoth(); }
  });
  server.addEventListener("close", closeBoth);
  server.addEventListener("error", closeBoth);
  return new Response(null, { status: 101, webSocket: client });
}
