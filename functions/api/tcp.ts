// @ts-nocheck
// GET /api/tcp?host=example.com&ports=22,80,443
// TCP connect check — the same honest primitive nightjar uses on iOS:
// a full connection either opens or it doesn't. No SYN tricks, no stealth
// claims, no banner grabbing beyond what a normal client would receive.
import { connect } from "cloudflare:sockets";
import { err, guardTarget, json } from "../_lib/guard";

const SERVICE: Record<number, string> = {
  21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 80: "HTTP", 110: "POP3",
  143: "IMAP", 443: "HTTPS", 445: "SMB", 465: "SMTPS", 587: "SMTP submission", 993: "IMAPS",
  995: "POP3S", 1723: "PPTP", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL", 5900: "VNC",
  6379: "Redis", 8080: "HTTP-alt", 8443: "HTTPS-alt", 27017: "MongoDB",
};
export const COMMON_PORTS = Object.keys(SERVICE).map(Number);

async function probe(host: string, port: number, timeoutMs = 3500) {
  const started = Date.now();
  let socket: any = null;
  try {
    socket = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false });
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return { port, service: SERVICE[port] || "", state: "open", ms: Date.now() - started };
  } catch (e: any) {
    const ms = Date.now() - started;
    const timedOut = e?.message === "timeout" || ms >= timeoutMs - 50;
    return { port, service: SERVICE[port] || "", state: timedOut ? "filtered / timed out" : "closed", ms };
  } finally {
    try { socket?.close(); } catch { /* already closed */ }
  }
}

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const hostParam = url.searchParams.get("host") || "";
  const portsParam = url.searchParams.get("ports") || "";
  let ports: number[];
  if (!portsParam || portsParam === "common") {
    ports = COMMON_PORTS;
  } else {
    ports = [...new Set(portsParam.split(",").map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535))];
    if (ports.length === 0) return err("No valid ports. Give a comma list like 22,80,443 (max 32) or 'common'.");
    if (ports.length > 32) return err("At most 32 ports per check. This is a connect check, not a sweep.");
  }
  let host: string;
  try {
    const g = await guardTarget(hostParam);
    host = g.host;
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  const results: Awaited<ReturnType<typeof probe>>[] = [];
  // Small batches keep one request from becoming a scan cannon.
  for (let i = 0; i < ports.length; i += 6) {
    results.push(...(await Promise.all(ports.slice(i, i + 6).map((p) => probe(host, p)))));
  }
  results.sort((a, b) => a.port - b.port);
  const open = results.filter((r) => r.state === "open");
  return json({
    ok: true, host, checkedAt: new Date().toISOString(),
    summary: `${open.length} open of ${results.length} checked`,
    openPorts: open.map((r) => r.port), results,
    note: "Connect check from a Cloudflare edge point of presence. 'Filtered / timed out' means no answer arrived in time — from here. Your mileage from another network will differ.",
  });
}
