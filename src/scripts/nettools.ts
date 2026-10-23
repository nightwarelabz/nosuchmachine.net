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
    status(`1/5 DNS — full record sweep for ${host}…`);
    await runDns(host, "ALL");
    status(`2/5 TLS — handshake + certificate chain for ${host}…`);
    await runTls(host);
    status(`3/5 HTTP — audit + security grade for https://${host}/…`);
    await runHttpAudit(`https://${host}/`);
    status(`4/5 PORTS — connect check (common services) for ${host}…`);
    await runTcp(host);
    status(`5/5 RECON — registration, certificate census, well-known files for ${host}…`);
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
  on("echo-run", "click", () => void runEcho());
  on("battery-run", "click", () => void runFullBattery());
}
