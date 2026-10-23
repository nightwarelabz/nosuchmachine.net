// @ts-nocheck
// Shared target guard for BLACKSITE WEB probes.
//
// Doctrine (same as nightjar's Blacksite bench): one knock, read, grade.
// Server-side probes only ever touch PUBLIC targets. Any hostname that
// resolves to a private, loopback, link-local, multicast, CGNAT, or
// cloud-metadata address is refused before a socket is opened, and the
// refusal is re-checked on every redirect hop. This keeps the suite from
// being usable as an SSRF / internal-scan proxy.

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

export function err(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

const BLOCKED_SUFFIXES = [".local", ".internal", ".intranet", ".lan", ".home", ".corp"];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

export function parseHostname(input: string): string | null {
  if (!input) return null;
  let raw = String(input).trim();
  if (!raw) return null;
  // Accept bare hosts, host:port, and full URLs.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).hostname;
    } catch {
      return null;
    }
  } else {
    raw = raw.split("/")[0].split("?")[0].split("#")[0];
    // Strip credentials if present.
    if (raw.includes("@")) raw = raw.slice(raw.lastIndexOf("@") + 1);
    // Strip :port (but keep bracketed IPv6 intact until below).
    if (raw.startsWith("[")) {
      const end = raw.indexOf("]");
      if (end === -1) return null;
      raw = raw.slice(1, end);
    } else if ((raw.match(/:/g) || []).length === 1) {
      raw = raw.split(":")[0];
    }
  }
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (BLOCKED_HOSTS.has(host)) return null;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return null;
  if (/\s/.test(host)) return null;
  return host;
}

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inCidr(value: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (b & mask);
}

export function isPublicIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8], // "this" network / unspecified
    ["10.0.0.0", 8], // RFC1918
    ["100.64.0.0", 10], // CGNAT shared space
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (incl. cloud metadata 169.254.169.254)
    ["172.16.0.0", 12], // RFC1918
    ["192.0.0.0", 24], // IETF special (excl. .0.0.9/10 handled by /24)
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.88.99.0", 24], // 6to4 relay (deprecated)
    ["192.168.0.0", 16], // RFC1918
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved / broadcast
  ];
  return !blocked.some(([base, bits]) => inCidr(n, base, bits));
}

export function isPublicIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::" || h === "::1") return false;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return false; // fe80::/10 link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return false; // unique local
  if (h.startsWith("ff")) return false; // multicast
  if (h.startsWith("2001:db8")) return false; // documentation
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice(7);
    if (ipv4ToInt(v4) !== null) return isPublicIPv4(v4);
  }
  return true;
}

export function isIPLiteral(host: string): boolean {
  return ipv4ToInt(host) !== null || host.includes(":");
}

export function isPublicIP(ip: string): boolean {
  return ip.includes(":") ? isPublicIPv6(ip) : isPublicIPv4(ip);
}

async function dohLookup(name: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, {
    headers: { accept: "application/dns-json" },
    cf: { cacheTtl: 30, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.Answer)) return [];
  return data.Answer.filter((a: any) => a.type === (type === "A" ? 1 : 28)).map((a: any) => String(a.data));
}

export interface GuardResult {
  host: string;
  addresses: string[];
}

/**
 * Validate a probe target. Returns the hostname plus the public addresses
 * it currently resolves to, or throws an Error with a user-facing message.
 */
export async function guardTarget(input: string): Promise<GuardResult> {
  const host = parseHostname(input);
  if (!host) throw new Error("Enter a valid public hostname or IP address.");
  if (isIPLiteral(host)) {
    if (!isPublicIP(host)) throw new Error("Refused: that address is private, loopback, link-local, or reserved. BLACKSITE WEB only probes public targets.");
    return { host, addresses: [host] };
  }
  if (!/^[a-z0-9._-]+$/i.test(host) || !host.includes(".")) {
    throw new Error("Enter a fully-qualified public hostname (for example, example.com).");
  }
  let addresses: string[] = [];
  try {
    const [a, aaaa] = await Promise.all([dohLookup(host, "A"), dohLookup(host, "AAAA")]);
    addresses = [...a, ...aaaa];
  } catch {
    // Resolution service hiccup: let the probe itself surface the failure,
    // but only for names that are syntactically public.
    return { host, addresses: [] };
  }
  if (addresses.length === 0) {
    throw new Error("That hostname does not resolve to any A/AAAA address.");
  }
  const bad = addresses.filter((ip) => !isPublicIP(ip));
  if (bad.length > 0) {
    throw new Error(`Refused: ${host} resolves to a non-public address (${bad[0]}). BLACKSITE WEB only probes public targets.`);
  }
  return { host, addresses };
}

/** Re-validate a redirect target URL before following it. */
export async function guardUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http:// and https:// URLs can be probed.");
  }
  if (url.username || url.password) throw new Error("URLs with embedded credentials are refused.");
  await guardTarget(url.hostname);
  return url;
}

export function userAgent(): string {
  return "BLACKSITE-WEB/1.0 (+https://nosuchmachine.net/; nightjar web bench; one knock, read, grade)";
}
