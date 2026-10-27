// @ts-nocheck
// BLACKSITE SSH bridge — browsers cannot open raw TCP, so the OS room's
// SSH client speaks WebSocket to this bridge and the bridge speaks TCP
// to the target. The target passes the same public-target guard as every
// other wire on the site before any socket opens. The bridge is a pure
// byte pipe: the SSH cryptography (curve25519, AES-GCM, host-key
// verification) happens in the visitor's tab — the edge sees ciphertext
// only and keeps nothing.
import { guardTarget, err } from "../_lib/guard";
import { attemptAllowed, ATTEMPT_LIMIT } from "../_lib/ratelimit";

export async function onRequest(context: any) {
  const { request } = context;
  if (request.headers.get("Upgrade") !== "websocket") return err("ssh bridge: websocket upgrade required.", 426);
  // Browser callers must come from the site itself: any web page can
  // otherwise open bridge sessions out of a visitor's browser and use
  // the house's edge as a connection mule. A missing Origin is a
  // non-browser client, which is the bridge's own kind of caller.
  const origin = request.headers.get("Origin");
  if (origin) {
    let originUrl: string | null = null;
    try { originUrl = new URL(origin).origin; } catch { originUrl = null; }
    if (originUrl !== new URL(request.url).origin) return err("ssh bridge: websocket upgrades are accepted from this site only.", 403);
  }
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  // Strict integer port, validated before any dial: a non-numeric port
  // once became NaN, sailed through the clamp as NaN, and reached
  // connect() outside any try (an unhandled 500), while port=0 was
  // silently dialed as port 1.
  const portRaw = url.searchParams.get("port");
  const port = portRaw === null ? 22 : Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return err("ssh bridge: port must be an integer between 1 and 65535.", 400);
  // Per-visitor cadence (Chase's ruling, 2026-10-27): the bridge is a
  // public outbound relay, so new connection attempts are counted per
  // visitor and capped — past the cap the answer is a plain 429 before
  // any target is resolved or dialed. Refused attempts still count:
  // knocking costs the knocker, not the house.
  const kv = context.env?.RELAY_MEMORY || null;
  const visitor = request.headers.get("cf-connecting-ip") || "";
  if (!(await attemptAllowed(kv, "sshrl", visitor))) {
    return err(`ssh bridge: too many connection attempts from this visitor — the limit is ${ATTEMPT_LIMIT} in 10 minutes. Wait a while, then try again.`, 429);
  }
  let addresses: string[];
  try {
    const g = await guardTarget(host);
    addresses = g.addresses;
  } catch (e: any) {
    return err(String(e?.message || e), 403);
  }
  if (!addresses.length) return err("ssh bridge: the target does not resolve to a public address.", 403);
  const { connect } = await import("cloudflare:sockets");
  let socket: any;
  try {
    socket = connect({ hostname: addresses[0], port }, { secureTransport: "off", allowHalfOpen: false });
  } catch (e: any) {
    return err(`ssh bridge: the connection could not be opened (${String(e?.message || e).slice(0, 120)}).`, 502);
  }
  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = Object.values(pair) as any[];
  server.accept();
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let closed = false;
  // A bridged pair is a held-open socket on the edge, and this bridge had
  // no clock at all: a target that never answered left the session pinned
  // until the client left or the platform reaped it. Now a 10-second
  // connect deadline and a five-minute idle reaper — any byte in either
  // direction re-arms the idle clock — close what time closes.
  const CONNECT_DEADLINE_MS = 10000;
  const IDLE_LIMIT_MS = 5 * 60 * 1000;
  let idleTimer: any = null;
  let connectTimer: any = null;
  const closeBoth = () => {
    if (closed) return; closed = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (connectTimer) clearTimeout(connectTimer);
    try { server.close(); } catch { /* already gone */ }
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
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) { armIdle(); server.send(value); }
      }
    } catch { /* the wire ended */ }
    closeBoth();
  })();
  server.addEventListener("message", async (event: any) => {
    try {
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new TextEncoder().encode(String(event.data));
      await writer.write(data);
      armIdle();
    } catch { closeBoth(); }
  });
  server.addEventListener("close", closeBoth);
  server.addEventListener("error", closeBoth);
  return new Response(null, { status: 101, webSocket: client });
}
