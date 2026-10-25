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

/** Expand an IPv6 address to its eight hextets, or null if unparseable.
 *  Handles "::" compression and an embedded dotted-quad tail. The checks
 *  below run on the PARSED form: string prefixes are bypassed by the
 *  expanded spellings (0:0:0:0:0:ffff:127.0.0.1, ::ffff:7f00:1), so no
 *  classification may ever be done on the raw text. */
export function parseIPv6(ip: string): number[] | null {
  let h = ip.toLowerCase().trim();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  let tail: number[] = [];
  if (h.includes(".")) {
    const cut = h.lastIndexOf(":");
    if (cut < 0) return null;
    const v4 = ipv4ToInt(h.slice(cut + 1));
    if (v4 === null) return null;
    tail = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    h = h.slice(0, cut);
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parseSide = (s: string): number[] | null => {
    if (!s) return [];
    const out: number[] = [];
    for (const part of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      out.push(parseInt(part, 16));
    }
    return out;
  };
  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  if (left === null || right === null) return null;
  const total = left.length + right.length + tail.length;
  if (halves.length === 1 && total !== 8) return null;
  if (total > 8) return null;
  return [...left, ...Array(8 - total).fill(0), ...right, ...tail];
}

export function isPublicIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (g === null) return false;
  const v4Of = (hi: number, lo: number) => isPublicIPv4(`${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`);
  // Addresses whose last 32 bits ARE an IPv4 address inherit its verdict:
  // v4-compatible (::a.b.c.d), v4-mapped (::ffff:a.b.c.d in every
  // spelling), and NAT64 well-known (64:ff9b::a.b.c.d).
  if (g.slice(0, 6).every((x) => x === 0)) return v4Of(g[6], g[7]);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Of(g[6], g[7]);
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return v4Of(g[6], g[7]);
  if (g[0] >= 0xfe80 && g[0] <= 0xfebf) return false; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false; // 2001::/32 Teredo (embeds a v4 in the tail)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // 100::/64 discard-only
  if (g[0] === 0x2001 && g[1] === 0x0002) return false; // 2001:2::/48 benchmarking
  return true;
}

export function isIPLiteral(host: string): boolean {
  return ipv4ToInt(host) !== null || host.includes(":");
}

export function isPublicIP(ip: string): boolean {
  return ip.includes(":") ? isPublicIPv6(ip) : isPublicIPv4(ip);
}

/** One DoH lookup. Returns the answer list (possibly empty — the name
 *  simply has no such record), or null when the resolution service itself
 *  could not be reached or read. The distinction is the guard's spine:
 *  an empty answer is information; an unreachable resolver is the ABSENCE
 *  of verification, and callers must refuse rather than proceed
 *  unchecked. (This path once failed open: a resolver hiccup returned an
 *  unverified host and every probe dialed it with no address check.) */
async function dohLookup(name: string, type: "A" | "AAAA"): Promise<string[] | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      cf: { cacheTtl: 30, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    } as RequestInit);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.Answer)) return [];
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
  const [a, aaaa] = await Promise.all([dohLookup(host, "A"), dohLookup(host, "AAAA")]);
  if (a === null || aaaa === null) {
    // Fail CLOSED: without a verified answer the target's addresses are
    // unknown, and an unverified target is a refused target. (The message
    // deliberately never says "does not resolve" — dns.ts keys its
    // MX-only fallback on that phrase, and this refusal is not that.)
    throw new Error("The address-verification service could not be reached, so this target's addresses are unverified — refused. Try again in a moment.");
  }
  const addresses = [...a, ...aaaa];
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
