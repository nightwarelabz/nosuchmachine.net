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
  let addresses: string[] = [];
  try {
    const g = await guardTarget(hostParam);
    host = g.host;
    addresses = g.addresses || [];
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  // Cloudflare cannot TCP-connect to its own anycast ranges (loop
  // prevention): a Cloudflare-hosted target reads "closed" on every door
  // from inside, whatever its true state. Say so instead of lying.
  const CF_V4: Array<[number, number]> = [[0x68000000, 0xfff80000], [0xac400000, 0xfffc0000], [0xa29f0000, 0xffff0000], [0xad000000, 0xffff0000], [0xaf500000, 0xfffe0000], [0x6a1fc000, 0xffffc000], [0x8d380000, 0xffff0000], [0x8d580000, 0xffff0000], [0xc6290000, 0xfffe0000], [0xc762b000, 0xfffff000]];
  const ipv4Int = (ip: string) => ip.split(".").map(Number).reduce((a, o) => a * 256 + o, 0) >>> 0;
  const isCf = (a: string) => a.includes(":") ? a.toLowerCase().startsWith("2606:4700:") || a.toLowerCase().startsWith("2803:f800:") || a.toLowerCase().startsWith("2405:b500:") || a.toLowerCase().startsWith("2405:8100:") || a.toLowerCase().startsWith("2a06:98c0:") || a.toLowerCase().startsWith("2c0f:f248:") : CF_V4.some(([net, mask]) => (ipv4Int(a) & mask) === (net & mask));
  const cfHosted = addresses.length > 0 && addresses.every(isCf);
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
    warning: cfHosted ? "This target is Cloudflare-hosted, and Cloudflare cannot TCP-connect to its own anycast addresses — every door reads closed from inside regardless of its true state. Use the TLS/HTTP probes for this host (they ride fetch, not raw sockets), or knock it from the native bench." : undefined,
    note: "Connect check from a Cloudflare edge point of presence. 'Filtered / timed out' means no answer arrived in time — from here. Your mileage from another network will differ.",
  });
}
