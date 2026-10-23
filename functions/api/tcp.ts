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
  // Cloudflare's published egress/anycast allocations (ipv4 ranges list).
  const CF_V4: Array<[number, number]> = [
    [0x68100000, 0xfff80000], // 104.16.0.0/13
    [0x68180000, 0xfffc0000], // 104.24.0.0/14
    [0xac400000, 0xfff80000], // 172.64.0.0/13
    [0xa29e0000, 0xfffe0000], // 162.158.0.0/15
    [0xc6298000, 0xffff8000], // 198.41.128.0/17
    [0x8d654000, 0xffffc000], // 141.101.64.0/18
    [0x6ca2c000, 0xffffc000], // 108.162.192.0/18
    [0xadf53000, 0xfffff000], // 173.245.48.0/20
    [0xbe5df000, 0xfffff000], // 190.93.240.0/20
    [0xbc72e000, 0xfffff000], // 188.114.96.0/20
    [0x6715f400, 0xfffffc00], // 103.21.244.0/22
    [0x6716c800, 0xfffffc00], // 103.22.200.0/22
    [0x671f0400, 0xfffffc00], // 103.31.4.0/22
    [0xc5eaf000, 0xfffffc00], // 197.234.240.0/22
    [0x83004800, 0xfffffc00], // 131.0.72.0/22
  ];
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
