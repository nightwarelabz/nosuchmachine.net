// @ts-nocheck
// GET /api/dns?name=example.com&type=A|AAAA|CNAME|MX|TXT|NS|SOA|CAA|PTR|SRV|DS|DNSKEY|HTTPS|SVCB|ALL
// Multi-resolver DNS lookup via DNS-over-HTTPS. Read-only, no target contact.
import { err, guardTarget, json } from "../_lib/guard";

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA", "PTR", "SRV", "DS", "DNSKEY", "HTTPS", "SVCB"];
const TYPE_NUM: Record<string, number> = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, DS: 43, DNSKEY: 48, CAA: 257, HTTPS: 65, SVCB: 64 };

const RESOLVERS = [
  { id: "cloudflare", label: "Cloudflare 1.1.1.1", endpoint: "https://cloudflare-dns.com/dns-query" },
  { id: "google", label: "Google 8.8.8.8", endpoint: "https://dns.google/resolve" },
  { id: "quad9", label: "Quad9 9.9.9.9", endpoint: "https://dns.quad9.net:5053/dns-query" },
];

async function queryResolver(resolver: (typeof RESOLVERS)[number], name: string, type: string) {
  const started = Date.now();
  const url = `${resolver.endpoint}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}&do=1&cd=0`;
  try {
    const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { resolver: resolver.id, label: resolver.label, ok: false, error: `Resolver answered HTTP ${res.status}`, ms: Date.now() - started };
    const data: any = await res.json();
    const records = (Array.isArray(data.Answer) ? data.Answer : []).map((a: any) => ({
      name: a.name, type: a.type, typeName: Object.keys(TYPE_NUM).find((k) => TYPE_NUM[k] === a.type) || String(a.type), ttl: a.TTL, data: a.data,
    }));
    return {
      resolver: resolver.id, label: resolver.label, ok: true, ms: Date.now() - started,
      status: data.Status, statusName: ["NOERROR", "FORMERR", "SERVFAIL", "NXDOMAIN", "NOTIMP", "REFUSED"][data.Status] || String(data.Status),
      ad: !!data.AD, cd: !!data.CD, ra: !!data.RA, records,
      authority: Array.isArray(data.Authority) ? data.Authority.map((a: any) => ({ name: a.name, type: a.type, ttl: a.TTL, data: a.data })) : [],
    };
  } catch (e: any) {
    return { resolver: resolver.id, label: resolver.label, ok: false, error: e?.name === "TimeoutError" ? "Resolver timed out" : "Resolver unreachable", ms: Date.now() - started };
  }
}

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const nameParam = url.searchParams.get("name") || "";
  const typeParam = (url.searchParams.get("type") || "A").toUpperCase();
  let host: string;
  try {
    // PTR and IP literals are fine here; guard validates public space.
    const g = await guardTarget(nameParam);
    host = g.host;
  } catch (e: any) {
    // DNS for a name that has no A record yet (e.g. MX-only) should still work:
    // fall back to a syntax-only check when resolution was the failure.
    const msg = String(e?.message || "");
    if (/does not resolve/.test(msg)) {
      const { parseHostname } = await import("../_lib/guard");
      const h = parseHostname(nameParam);
      if (!h) return err(msg);
      host = h;
    } else return err(msg);
  }
  const types = typeParam === "ALL" ? [...TYPES] : [typeParam];
  if (types.some((t) => !TYPES.includes(t))) return err(`Unsupported record type. Use one of: ${TYPES.join(", ")}, ALL.`);
  // The ALL sweep covers all 14 types and runs them in parallel — each
  // type still asks all three resolvers. (It once stopped at slice(0, 10),
  // leaving DS, DNSKEY, HTTPS and SVCB unreachable through ALL, and walked
  // the types one by one, so a full census could take a minute of serial
  // resolver waits.)
  const swept = await Promise.all(types.map(async (t) => ({ t, rows: await Promise.all(RESOLVERS.map((r) => queryResolver(r, host, t))) })));
  const out: Record<string, unknown> = {};
  for (const { t, rows } of swept) out[t] = rows;
  return json({ ok: true, name: host, types, results: out, note: "Answers from three public resolvers. AD = DNSSEC-validated by that resolver." });
}
