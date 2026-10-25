// @ts-nocheck
// GET /api/recon?domain=example.com
// Domain recon from public ledgers only: RDAP registration record,
// Certificate Transparency subdomain census (crt.sh), and the domain's
// well-known public files (robots.txt, security.txt, sitemap.xml).
// Nothing here touches the target except three ordinary public-file GETs.
import { err, guardTarget, guardUrl, json, userAgent } from "../_lib/guard";

/** Stream a response body to text, stopping at the cap: a byte cap that
 *  first downloads the whole body into worker memory caps nothing. */
async function readCappedText(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      const keep = value.slice(0, value.length - (total - cap));
      if (keep.length) chunks.push(keep);
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

async function fetchText(url: string, timeoutMs = 8000): Promise<{ status: number; text: string } | null> {
  // Only the target's own well-known files (robots.txt, security.txt,
  // sitemap.xml) flow through here — the public ledgers keep their own
  // fetches. Redirects are walked by hand, at most 3 hops, with the
  // public-target guard re-checked on every hop: redirect:"follow" let a
  // public name bounce this fetch onto an address nobody had verified,
  // which is the one door the guard exists to keep shut.
  try {
    let current = url;
    for (let hop = 0; hop <= 3; hop++) {
      await guardUrl(current);
      const res = await fetch(current, { headers: { "user-agent": userAgent(), accept: "text/plain,*/*" }, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
      const location = res.headers.get("location");
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        if (hop === 3) return null;
        current = new URL(location, current).toString();
        continue;
      }
      return { status: res.status, text: await readCappedText(res, 20000) };
    }
    return null;
  } catch {
    return null;
  }
}

async function rdapBootstrap(domain: string): Promise<string | null> {
  try {
    const tld = domain.split(".").pop() || "";
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    for (const [tlds, urls] of data.services || []) {
      if ((tlds as string[]).includes(tld) && urls?.[0]) return String(urls[0]).replace(/\/$/, "");
    }
  } catch { /* fall through */ }
  return null;
}

async function rdap(domain: string) {
  try {
    const base = await rdapBootstrap(domain);
    const endpoint = base ? `${base}/domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const res = await fetch(endpoint, { headers: { accept: "application/rdap+json", "user-agent": userAgent() }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, error: `RDAP answered HTTP ${res.status} (the TLD registry may not publish RDAP).` };
    const d: any = await res.json();
    const events = (d.events || []).map((e: any) => ({ action: e.eventAction, date: e.eventDate }));
    const entities = (d.entities || []).map((e: any) => {
      const vcard = e.vcardArray?.[1] || [];
      const fn = vcard.find((v: any) => v[0] === "fn")?.[3];
      return { roles: e.roles || [], name: fn || e.handle || "(unnamed)" };
    });
    const ns = (d.nameservers || []).map((n: any) => n.ldhName).filter(Boolean);
    const status = d.status || [];
    let expires: string | null = null;
    const exp = events.find((e: any) => /expiration/i.test(e.action));
    if (exp) expires = exp.date;
    const daysToExpiry = expires ? Math.floor((Date.parse(expires) - Date.now()) / 86400000) : null;
    return { ok: true, handle: d.handle || null, ldhName: d.ldhName || domain, status, events, entities, nameservers: ns, expires, daysToExpiry, dnssec: d.secureDNS?.delegationSigned ?? null, registrarUrl: (d.links || []).find((l: any) => l.rel === "self")?.href || null };
  } catch {
    return { ok: false, error: "RDAP lookup failed (network or registry unavailable)." };
  }
}

async function ct(domain: string) {
  try {
    const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { headers: { "user-agent": userAgent(), accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `crt.sh answered HTTP ${res.status}.` };
    const rows: any[] = await res.json();
    const names = new Set<string>();
    let certCount = 0;
    let latest: string | null = null;
    for (const row of rows) {
      certCount++;
      for (const n of String(row.name_value || "").split("\n")) {
        const name = n.trim().toLowerCase();
        if (name && !name.startsWith("*")) names.add(name);
      }
      if (row.name_value && String(row.name_value).includes(domain)) { /* counted */ }
      const ts = row.not_before || row.entry_timestamp;
      if (ts && (!latest || ts > latest)) latest = ts;
    }
    const subdomains = [...names].filter((n) => n !== domain).sort();
    return { ok: true, certificatesLogged: rows.length, uniqueNames: names.size, subdomains: subdomains.slice(0, 500), truncated: subdomains.length > 500, mostRecentCertNotBefore: latest };
  } catch {
    // crt.sh is a volunteer service and sulks often; Cert Spotter's API is
    // the second witness for the same public logs.
    try {
      const res = await fetch(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`, { headers: { "user-agent": userAgent(), accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("certspotter");
      const rows: any[] = await res.json();
      const names = new Set<string>();
      let latest: string | null = null;
      for (const row of rows) {
        for (const n of row.dns_names || []) { const name = String(n).toLowerCase(); if (name && !name.startsWith("*")) names.add(name); }
        if (row.not_before && (!latest || row.not_before > latest)) latest = row.not_before;
      }
      const subdomains = [...names].filter((n) => n !== domain).sort();
      return { ok: true, source: "certspotter", certificatesLogged: rows.length, uniqueNames: names.size, subdomains: subdomains.slice(0, 500), truncated: subdomains.length > 500, mostRecentCertNotBefore: latest };
    } catch {
      return { ok: false, error: "Certificate Transparency lookups failed (crt.sh and Cert Spotter both unreachable or rate-limited) — try again shortly." };
    }
  }
}

export async function onRequestGet(context: any) {
  const domainParam = new URL(context.request.url).searchParams.get("domain") || "";
  let domain: string;
  try {
    const g = await guardTarget(domainParam);
    domain = g.host;
  } catch (e: any) {
    // Recon works from public ledgers, so an unresolvable-but-real name is
    // still reportable; only the well-known fetch needs the guard, and it
    // will fail closed on its own. Syntax + private checks still apply.
    const msg = String(e?.message || "");
    if (!/does not resolve/.test(msg)) return err(msg);
    const { parseHostname } = await import("../_lib/guard");
    const h = parseHostname(domainParam);
    if (!h) return err(msg);
    domain = h;
  }
  const [registration, transparency, robots, securityTxt, sitemap] = await Promise.all([
    rdap(domain),
    ct(domain),
    fetchText(`https://${domain}/robots.txt`),
    fetchText(`https://${domain}/.well-known/security.txt`),
    fetchText(`https://${domain}/sitemap.xml`, 6000),
  ]);
  const disallow: string[] = [];
  if (robots && robots.status === 200) {
    for (const line of robots.text.split("\n")) {
      const m = line.match(/^\s*disallow:\s*(\S+)/i);
      if (m) disallow.push(m[1]);
    }
  }
  return json({
    ok: true, domain, checkedAt: new Date().toISOString(),
    registration, transparency,
    wellKnown: {
      robotsTxt: robots ? { status: robots.status, disallowCount: disallow.length, disallowSample: disallow.slice(0, 40), snippet: robots.status === 200 ? robots.text.slice(0, 1200) : null } : { status: null, error: "unreachable" },
      securityTxt: securityTxt ? { status: securityTxt.status, present: securityTxt.status === 200, snippet: securityTxt.status === 200 ? securityTxt.text.slice(0, 1200) : null } : { status: null, present: false, error: "unreachable" },
      sitemapXml: sitemap ? { status: sitemap.status, present: sitemap.status === 200, urlCount: sitemap.status === 200 ? (sitemap.text.match(/<loc>/g) || []).length : 0 } : { status: null, present: false, error: "unreachable" },
    },
    findings: [
      ...(registration.ok && registration.daysToExpiry != null && registration.daysToExpiry < 30 ? [`Domain registration expires in ${registration.daysToExpiry} days.`] : []),
      ...(registration.ok && registration.dnssec === false ? ["DNSSEC delegation is not signed for this domain."] : []),
      ...(securityTxt && securityTxt.status !== 200 ? ["No /.well-known/security.txt — researchers have no published contact route."] : []),
      ...(transparency.ok && transparency.subdomains.length ? [`${transparency.subdomains.length} subdomain names appear in public certificate logs — each is public attack surface its owner chose to certify.`] : []),
    ],
    note: "Registration and certificate data come from public ledgers (RDAP, crt.sh). They describe what the domain's owners published, not a scan of the target.",
  });
}
