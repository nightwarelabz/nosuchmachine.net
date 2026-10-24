// @ts-nocheck
// BLACKSITE SSH bridge — browsers cannot open raw TCP, so the OS room's
// SSH client speaks WebSocket to this bridge and the bridge speaks TCP
// to the target. The target passes the same public-target guard as every
// other wire on the site before any socket opens. The bridge is a pure
// byte pipe: the SSH cryptography (curve25519, AES-GCM, host-key
// verification) happens in the visitor's tab — the edge sees ciphertext
// only and keeps nothing.
import { guardTarget, err } from "../_lib/guard";

export async function onRequest(context: any) {
  const { request } = context;
  if (request.headers.get("Upgrade") !== "websocket") return err("ssh bridge: websocket upgrade required.", 426);
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const port = Math.max(1, Math.min(65535, Number(url.searchParams.get("port") || 22)));
  let addresses: string[];
  try {
    const g = await guardTarget(host);
    addresses = g.addresses;
  } catch (e: any) {
    return err(String(e?.message || e), 403);
  }
  if (!addresses.length) return err("ssh bridge: the target does not resolve to a public address.", 403);
  const { connect } = await import("cloudflare:sockets");
  const socket = connect({ hostname: addresses[0], port }, { secureTransport: "off", allowHalfOpen: false });
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
