// BLACKSITE WEB — network probes. These call the site's own edge functions
// (/api/*), which enforce the public-target guard server-side: private,
// loopback, link-local, and metadata addresses are refused before contact.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
function val(id: string): string { return ($<HTMLInputElement>(id)?.value ?? "").toString(); }
function setText(id: string, v: string) { const el = $(id); if (el) el.textContent = v; }
function show(id: string, x: unknown) { setText(id, typeof x === "string" ? x : JSON.stringify(x, null, 2)); }
function on(id: string, ev: string, fn: (e: Event) => void) { $(id)?.addEventListener(ev, fn); }
function emitReport(source: string, title: string, body: unknown) {
  document.dispatchEvent(new CustomEvent("blacksite:report", { detail: { source, title, body, at: new Date().toISOString() } }));
}
export function globalTarget(): string {
  return (document.getElementById("global-target") as HTMLInputElement | null)?.value.trim() || "";
}
function busy(id: string, label: string) { show(id, `⏳ ${label}`); }

async function api(path: string): Promise<any> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({ ok: false, error: `Edge answered HTTP ${res.status} with no JSON.` }));
  return data;
}

export async function runDns(nameOverride?: string, typeOverride?: string) {
  const name = nameOverride || val("dns-name") || globalTarget();
  const type = typeOverride || val("dns-type") || "A";
  if (!name) return show("dns-out", "Give me a hostname first — in the DNS box or the global target.");
  busy("dns-out", `Asking three resolvers for ${name} ${type}…`);
  const data = await api(`/api/dns?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`);
  show("dns-out", data);
  if (data.ok) emitReport("dns", `DNS ${type} for ${data.name}`, data.results);
  return data;
}

export async function runTls(hostOverride?: string) {
  const host = hostOverride || val("tls-host") || globalTarget();
  const port = val("tls-port") || "443";
  if (!host) return show("tls-out", "Give me a host first.");
  busy("tls-out", `Flying a handshake at ${host}:${port}…`);
  const data = await api(`/api/tls?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`);
  show("tls-out", data);
  if (data.ok) emitReport("tls", `TLS inspection: ${data.host}:${data.port}`, data);
  return data;
}

export async function runHttpAudit(urlOverride?: string) {
  let url = urlOverride || val("http-url") || globalTarget();
  if (!url) return show("http-out", "Give me a URL (or a hostname — I'll assume https).");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = "https://" + url;
  busy("http-out", `Auditing ${url} — one GET per hop, grading everything that comes back…`);
  const data = await api(`/api/http-audit?url=${encodeURIComponent(url)}`);
  show("http-out", data);
  if (data.ok) emitReport("http-audit", `HTTP audit: ${data.finalUrl} (${data.finalStatus}) — grade ${data.security?.grade} (${data.security?.score}/100)`, data);
  return data;
}

export async function runTcp(hostOverride?: string) {
  const host = hostOverride || val("tcp-host") || globalTarget();
  const ports = val("tcp-ports") || "common";
  if (!host) return show("tcp-out", "Give me a host first.");
  busy("tcp-out", `Connect-checking ${host} (${ports === "common" ? "common service ports" : ports})… this takes a few seconds; silence is an answer too.`);
  const data = await api(`/api/tcp?host=${encodeURIComponent(host)}&ports=${encodeURIComponent(ports)}`);
  show("tcp-out", data);
  if (data.ok) emitReport("tcp", `Connect check: ${data.host} — ${data.summary}`, data.results);
  return data;
}

export async function runRecon(domainOverride?: string) {
  const domain = domainOverride || val("recon-domain") || globalTarget();
  if (!domain) return show("recon-out", "Give me a domain first.");
  busy("recon-out", `Reading the public ledgers for ${domain} — RDAP + Certificate Transparency can take ~15s…`);
  const data = await api(`/api/recon?domain=${encodeURIComponent(domain)}`);
  show("recon-out", data);
  if (data.ok) emitReport("recon", `Domain recon: ${data.domain}`, data);
  return data;
}

/** Email security: SPF, DMARC, DKIM selectors, MTA-STS, TLS-RPT — graded. */
export async function runMail(domainOverride?: string) {
  const domain = (domainOverride || val("mail-domain") || globalTarget()).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0];
  if (!domain) return show("mail-out", "Give me a domain first.");
  busy("mail-out", `Reading the mail ledgers for ${domain} — SPF, DMARC, DKIM selectors, MTA-STS…`);
  const q = async (name: string, type: string) => {
    const d = await api(`/api/dns?name=${encodeURIComponent(name)}&type=${type}`);
    const rows: any[] = [];
    for (const r of d?.results || []) for (const a of r.answers || []) rows.push(a.data);
    return rows as string[];
  };
  try {
    const [mx, txt, dmarc, mtaSts, tlsRpt] = await Promise.all([
      q(domain, "MX"), q(domain, "TXT"), q(`_dmarc.${domain}`, "TXT"), q(`_mta-sts.${domain}`, "TXT"), q(`_smtp._tls.${domain}`, "TXT"),
    ]);
    const spf = txt.find((t) => /^v=spf1\b/i.test(t.replace(/^"|"$/g, "")));
    const dkimSelectors = ["default", "google", "selector1", "selector2", "s1", "k1", "mail", "dkim"];
    const dkimHits: string[] = [];
    await Promise.all(dkimSelectors.map(async (s) => {
      const rows = await q(`${s}._domainkey.${domain}`, "TXT");
      if (rows.some((t) => /v=DKIM1/i.test(t))) dkimHits.push(s);
    }));
    const lines: string[] = [];
    let score = 100; const findings: string[] = [];
    lines.push(`EMAIL SECURITY — ${domain}`, `resolved via the bench's three public resolvers (Cloudflare shown).`, "");
    lines.push("MX — mail exchangers");
    if (mx.length) for (const m of mx) lines.push(`  ${m}`);
    else { lines.push("  (none — this domain accepts no mail)"); score -= 5; findings.push("no MX records"); }
    if (mx.some((m) => /^\s*0\s+\.$/.test(m))) { lines.push("  note: null MX (RFC 7505) — the domain declares it accepts NO mail, deliberately."); }
    lines.push("", "SPF — sender policy");
    if (spf) {
      lines.push(`  ${spf.replace(/^"|"$/g, "")}`);
      if (/-all\s*$/.test(spf)) lines.push("  ending: -all (hard fail — the strict posture)");
      else if (/~all\s*$/.test(spf)) { lines.push("  ending: ~all (soft fail — common, weaker)"); score -= 8; findings.push("SPF softfail (~all) instead of -all"); }
      else if (/\?all\s*$/.test(spf)) { lines.push("  ending: ?all (neutral — barely a policy)"); score -= 15; findings.push("SPF neutral (?all)"); }
      else if (/\+all\s*$/.test(spf)) { lines.push("  ending: +all (PASS ANYONE — SPF is void here)"); score -= 40; findings.push("SPF +all authorizes everyone"); }
    } else { lines.push("  (no SPF record — anyone can spoof this domain's mail)"); score -= 30; findings.push("no SPF record"); }
    lines.push("", "DMARC — enforcement");
    const dm = dmarc.find((t) => /^v=DMARC1/i.test(t.replace(/^"|"$/g, "")));
    if (dm) {
      lines.push(`  ${dm.replace(/^"|"$/g, "")}`);
      const policy = /p=(reject|quarantine|none)/i.exec(dm)?.[1]?.toLowerCase();
      if (policy === "reject") lines.push("  policy: reject — spoofed mail is refused. the strong posture.");
      else if (policy === "quarantine") { lines.push("  policy: quarantine — spoofed mail is junked, not refused."); score -= 8; findings.push("DMARC policy is quarantine, not reject"); }
      else { lines.push("  policy: none — monitoring only; spoofing still delivers."); score -= 20; findings.push("DMARC policy is none (monitor only)"); }
      const pct = /pct=(\d+)/.exec(dm); if (pct && Number(pct[1]) < 100) { score -= 5; findings.push(`DMARC applies to ${pct[1]}% of mail`); }
    } else { lines.push("  (no DMARC record — no spoofing policy at all)"); score -= 25; findings.push("no DMARC record"); }
    lines.push("", "DKIM — signing selectors probed");
    lines.push(dkimHits.length ? `  publishing keys under: ${dkimHits.join(", ")}` : "  (none of the common selectors answer — mail may be unsigned, or selectors are nonstandard)");
    if (!dkimHits.length) { score -= 10; findings.push("no common DKIM selector publishes a key"); }
    lines.push("", "MTA-STS / TLS-RPT — transport enforcement");
    lines.push(mtaSts.some((t) => /v=STSv1/i.test(t)) ? "  MTA-STS: published (v=STSv1)" : "  MTA-STS: not published");
    if (!mtaSts.some((t) => /v=STSv1/i.test(t))) { score -= 5; findings.push("no MTA-STS"); }
    lines.push(tlsRpt.some((t) => /v=TLSRPTv1/i.test(t)) ? "  TLS-RPT: published (v=TLSRPTv1)" : "  TLS-RPT: not published");
    score = Math.max(0, score);
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
    lines.push("", `GRADE: ${grade} (${score}/100)`);
    lines.push(findings.length ? `findings: ${findings.join("; ")}` : "findings: none — this domain's mail posture is tight.");
    const text = lines.join("\n");
    show("mail-out", text);
    emitReport("mail", `Email security: ${domain} — grade ${grade} (${score}/100)`, text);
    return { ok: true, domain, grade, score };
  } catch (e: any) { show("mail-out", `mail audit failed: ${e?.message || e}`); }
}

/** Subdomain census: the Certificate Transparency names for a domain, via recon. */
export async function runSubs(domainOverride?: string) {
  const domain = (domainOverride || val("subs-domain") || globalTarget()).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0];
  if (!domain) return show("subs-out", "Give me a domain first.");
  busy("subs-out", `Censusing Certificate Transparency for ${domain} — this reads the public issuance ledger (~15s)…`);
  const data = await api(`/api/recon?domain=${encodeURIComponent(domain)}`);
  if (!data.ok) { show("subs-out", data); return data; }
  const names: string[] = data.transparency?.names || [];
  const lines = [
    `SUBDOMAIN CENSUS — ${domain}`,
    `source: Certificate Transparency (public issuance ledger) — ${data.transparency?.certificates ?? "?"} certificates`,
    `${names.length} distinct names have ever appeared on a certificate for this domain:`, "",
    ...names.map((n) => `  ${n}`),
    "", "Reading it: names here are public by design when a certificate is issued. Forgotten staging and dev names are the classic finding — each one is a door worth a knock (authorized, of course). The live/dead state of each name is a job for the DNS panel.",
  ];
  const text = lines.join("\n");
  show("subs-out", text);
  emitReport("subs", `Subdomain census: ${domain} — ${names.length} names`, text);
  return data;
}

export async function runEcho() {
  busy("echo-out", "Asking the edge what it sees…");
  const data = await api(`/api/echo`);
  show("echo-out", data);
  if (data.ok) emitReport("mirror", "Edge echo (what sites see)", data);
  return data;
}

/** The full battery: every network probe against the global target, in order. */
export async function runFullBattery() {
  const target = globalTarget();
  const status = (m: string) => setText("battery-status", m);
  if (!target) { status("Set a global target first — a public hostname like example.com."); return; }
  const host = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0];
  try {
    status(`1/6 DNS — full record sweep for ${host}…`);
    await runDns(host, "ALL");
    status(`2/6 TLS — handshake + certificate chain for ${host}…`);
    await runTls(host);
    status(`3/6 HTTP — audit + security grade for https://${host}/…`);
    await runHttpAudit(`https://${host}/`);
    status(`4/6 PORTS — connect check (common services) for ${host}…`);
    await runTcp(host);
    status(`5/6 MAIL — SPF, DMARC, DKIM, MTA-STS for ${host}…`);
    await runMail(host);
    status(`6/6 RECON — registration, certificate census, well-known files for ${host}…`);
    await runRecon(host);
    status(`Battery complete for ${host}. Everything is in the Report tab — export it before you close the page.`);
    emitReport("battery", `Full battery complete: ${host}`, { target: host, note: "Individual probe results are in their own report entries." });
  } catch (e: any) {
    status(`Battery stopped: ${e?.message || e}. Completed probes are in the Report tab.`);
  }
}

export function initNetTools() {
  on("dns-run", "click", () => void runDns());
  on("tls-run", "click", () => void runTls());
  on("http-run", "click", () => void runHttpAudit());
  on("tcp-run", "click", () => void runTcp());
  on("recon-run", "click", () => void runRecon());
  on("mail-run", "click", () => void runMail());
  on("subs-run", "click", () => void runSubs());
  on("echo-run", "click", () => void runEcho());
  on("battery-run", "click", () => void runFullBattery());
}
