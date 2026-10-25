// @ts-nocheck
// GET /api/ping?host=example.com&count=4
// The web's honest ping: browsers and edges cannot send ICMP, so this times
// real TCP connects from the edge and says exactly that. Named, not faked.
import { connect } from "cloudflare:sockets";
import { err, guardTarget, json } from "../_lib/guard";

async function timeConnect(host: string, port: number, timeoutMs = 3000): Promise<number | null> {
  const started = Date.now();
  let socket: any = null;
  try {
    socket = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false });
    await Promise.race([socket.opened, new Promise((_, r) => setTimeout(() => r(new Error("t")), timeoutMs))]);
    return Date.now() - started;
  } catch {
    return null;
  } finally {
    try { socket?.close(); } catch { /* noop */ }
  }
}

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  // Strict integer params, the exchange.ts shape: a non-numeric port or
  // count once became NaN, flowed through the clamps untouched, and the
  // endpoint answered ok:true with null samples and a null port.
  const portRaw = q.get("port");
  const port = portRaw === null ? 443 : Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return err("Port must be 1-65535.");
  const countRaw = q.get("count");
  const count = countRaw === null ? 4 : Number(countRaw);
  if (!Number.isInteger(count) || count < 1 || count > 8) return err("Count must be 1-8.");
  let host: string;
  try {
    const g = await guardTarget(q.get("host") || "");
    host = g.host;
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  const samples: Array<number | null> = [];
  for (let i = 0; i < count; i++) samples.push(await timeConnect(host, port));
  const ok = samples.filter((s): s is number => s !== null);
  return json({
    ok: true, host, port, samples,
    stats: ok.length ? { min: Math.min(...ok), max: Math.max(...ok), avg: Math.round(ok.reduce((a, b) => a + b, 0) / ok.length), answered: ok.length, sent: count } : { answered: 0, sent: count },
    note: "Not ICMP — the web has none. These are full TCP connect times from a Cloudflare edge location to the port shown; the native bench's ICMP ping lives in nightjar.",
  });
}
