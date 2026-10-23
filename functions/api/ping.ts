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
  const count = Math.min(8, Math.max(1, Number(q.get("count") || 4)));
  const port = Number(q.get("port") || 443);
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
