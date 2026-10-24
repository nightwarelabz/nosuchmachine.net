// @ts-nocheck
// BLACKSITE Relay bridge — browsers cannot open raw TCP, so the OS room's
// IRC client speaks WebSocket to this bridge and the bridge speaks TCP/TLS
// to a public IRC network. This is a plug, not a relay in the open sense:
// the destination must be one of the allowlisted public networks below,
// and the target still passes the site-wide public-target guard before any
// socket opens. The bridge pipes lines and keeps nothing.
import { guardTarget, err } from "../_lib/guard";

const NETWORKS: Record<string, number[]> = {
  "irc.libera.chat": [6697, 6667],
  "irc.oftc.net": [6697, 6667],
  "irc.hackint.org": [6697, 6667],
};

export async function onRequest(context: any) {
  const { request } = context;
  if (request.headers.get("Upgrade") !== "websocket") return err("relay bridge: websocket upgrade required.", 426);
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
  const socket = connect(
    { hostname: host, port },
    { secureTransport: port === 6697 ? "on" : "off", allowHalfOpen: false },
  );
  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = Object.values(pair) as any[];
  server.accept();
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let closed = false;
  const closeBoth = () => {
    if (closed) return; closed = true;
    try { server.close(); } catch { /* already gone */ }
    try { reader.cancel(); } catch { /* already gone */ }
    try { socket.close(); } catch { /* already gone */ }
  };
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) server.send(value);
      }
    } catch { /* the wire ended */ }
    closeBoth();
  })();
  server.addEventListener("message", async (event: any) => {
    try {
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new TextEncoder().encode(String(event.data));
      await writer.write(data);
    } catch { closeBoth(); }
  });
  server.addEventListener("close", closeBoth);
  server.addEventListener("error", closeBoth);
  return new Response(null, { status: 101, webSocket: client });
}
