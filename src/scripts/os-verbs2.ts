// BLACKSITE OS — wire, web-bench, and protocol-probe verbs (the EDGE half).
import { verb, bToB64, b64ToB, bToHex, hexToB, mmh3 } from "./os-shell";
import { api, exchange, edgeDns, dnsRecords, fmtBytes, hostPort, need } from "./os-verbs";

type Ctx = { args: string[]; stdin: string; os: any; io: any; raw: string };
const td = new TextDecoder();

function gateActive(ctx: Ctx): string | null { return ctx.os.gate("active"); }
async function fetchEdge(ctx: Ctx, url: string, method = "GET", binary = false): Promise<any> {
  const refusal = ctx.os.gate("active");
  if (refusal) throw new Error(refusal);
  return api(`/api/fetch?url=${encodeURIComponent(url)}&method=${method}${binary ? "&binary=1" : ""}`);
}
function asUrl(arg: string): string { return /^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ? arg : `https://${arg}`; }
function gradeLine(score: number) { return score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F"; }

function registerWire() {
  verb("ping", "EDGE", "ping <host> [-c n] — TCP connect timing from the edge (the web has no ICMP; it says so)", async (ctx) => {
    if (!need(ctx, 1, "ping <host> [-c n]")) return;
    const cIdx = ctx.args.indexOf("-c");
    const count = cIdx >= 0 ? Math.min(8, Number(ctx.args[cIdx + 1]) || 4) : 4;
    const host = ctx.args.find((a, i) => !a.startsWith("-") && i !== cIdx + 1)!;
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/ping?host=${encodeURIComponent(host)}&count=${count}`);
    if (!data.ok) return `ping: ${data.error}`;
    const lines = data.samples.map((s: number | null, i: number) => s === null ? `  #${i + 1} no answer` : `  #${i + 1} connect ${s} ms`);
    return [`PING ${data.host} — TCP connect timing from the edge (not ICMP):`, ...lines, data.stats.avg ? `min/avg/max = ${data.stats.min}/${data.stats.avg}/${data.stats.max} ms · ${data.stats.answered}/${data.stats.sent} answered` : "no answers."].join("\n");
  });
  verb("dig", "EDGE", "dig [@server] <name> [type] — ask DNS directly", async (ctx) => {
    const args = ctx.args.filter((a) => !a.startsWith("@"));
    if (!need(ctx, 1, "dig <name> [type]")) return;
    const name = args[0]; const type = (args[1] || "A").toUpperCase();
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(name, type);
    if (!data.ok) return `dig: ${data.error}`;
    const lines: string[] = [];
    for (const r of data.results[type] || []) {
      if (!r.ok) { lines.push(`${r.label}: ${r.error}`); continue; }
      lines.push(`;; ${r.label} — ${r.statusName}, ${r.ms} ms${r.ad ? ", DNSSEC AD set" : ""}`);
      for (const rec of r.records) lines.push(`${rec.name} ${rec.ttl} IN ${rec.typeName} ${rec.data}`);
      if (!r.records.length) lines.push("(no records)");
    }
    return lines.join("\n");
  });
  verb("nslookup", "EDGE", "nslookup <name> — A + AAAA, the short way", async (ctx) => {
    if (!need(ctx, 1, "nslookup <name>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const a = await edgeDns(ctx.args[0], "A"); const aaaa = await edgeDns(ctx.args[0], "AAAA");
    return [`${ctx.args[0]}:`, ...dnsRecords(a, "A").map((r) => `  A     ${r}`), ...dnsRecords(aaaa, "AAAA").map((r) => `  AAAA  ${r}`)].join("\n");
  });
  verb("host", "EDGE", "host <name|ip> — resolve, or reverse an address", async (ctx) => {
    if (!need(ctx, 1, "host <name|ip>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ctx.args[0])) {
      const data = await edgeDns(ctx.args[0], "PTR");
      const recs = dnsRecords(data, "PTR");
      return recs.length ? recs.map((r) => `${ctx.args[0]} → ${r}`).join("\n") : "no PTR record answers.";
    }
    const a = await edgeDns(ctx.args[0], "A");
    return dnsRecords(a, "A").join("\n") || "does not resolve.";
  });
  verb("whois", "EDGE", "whois <domain> — whose name is it (RDAP)", async (ctx) => {
    if (!need(ctx, 1, "whois <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await api(`/api/recon?domain=${encodeURIComponent(ctx.args[0])}`);
    if (!data.ok) return `whois: ${data.error}`;
    const r = data.registration;
    if (!r.ok) return `whois: ${r.error}`;
    return [`domain: ${r.ldhName}`, `status: ${(r.status || []).join(", ") || "(none published)"}`, `nameservers: ${(r.nameservers || []).join(", ") || "(none)"}`, `dnssec signed: ${r.dnssec === null ? "unknown" : r.dnssec}`, ...(r.events || []).map((e: any) => `${e.action}: ${e.date}`), ...(r.entities || []).map((e: any) => `${(e.roles || []).join("/")}: ${e.name}`)].join("\n");
  });
  verb("rdap", "EDGE", "rdap <domain|ip> — the registry's modern ledger", async (ctx) => {
    if (!need(ctx, 1, "rdap <domain|ip>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(ctx.args[0]);
    const data = await fetchEdge(ctx, `https://rdap.org/${isIp ? "ip" : "domain"}/${encodeURIComponent(ctx.args[0])}`);
    if (!data.ok) return `rdap: ${data.error}`;
    return (data.bodyText || `(HTTP ${data.status}, no body)`).slice(0, 6000);
  });
  verb("curl", "EDGE", "curl [-I] [-o file] <url> — fetch a page, see its papers", async (ctx) => {
    const headOnly = ctx.args.includes("-I");
    const oIdx = ctx.args.indexOf("-o");
    const outFile = oIdx >= 0 ? ctx.args[oIdx + 1] : null;
    const urlArg = ctx.args.find((a, i) => !a.startsWith("-") && i !== oIdx + 1);
    if (!urlArg) { ctx.io.print("usage: curl [-I] [-o file] <url>", "err"); return; }
    const data = await fetchEdge(ctx, asUrl(urlArg), headOnly ? "HEAD" : "GET");
    if (!data.ok) return `curl: ${data.error}`;
    const headerLines = Object.entries(data.headers).map(([k, v]) => `${k}: ${v}`);
    if (headOnly) return [`HTTP ${data.status} (${data.ms} ms)`, ...headerLines].join("\n");
    if (outFile) { ctx.os.write(outFile, data.bodyText || ""); return `saved ${data.bodyBytes} bytes to ${outFile} (HTTP ${data.status})`; }
    return [`HTTP ${data.status} · ${data.bodyBytes} bytes · ${data.ms} ms`, ...headerLines.slice(0, 14), "", (data.bodyText || "").slice(0, 4000)].join("\n");
  });
  verb("wget", "EDGE", "wget <url> [file] — fetch it into the files", async (ctx) => {
    if (!need(ctx, 1, "wget <url> [file]")) return;
    const url = asUrl(ctx.args[0]);
    const data = await fetchEdge(ctx, url);
    if (!data.ok) return `wget: ${data.error}`;
    const name = ctx.args[1] || url.split("/").filter(Boolean).pop() || "index.html";
    ctx.os.write(name, data.bodyText || "");
    return `saved ${data.bodyBytes} bytes → ${ctx.os.norm(name)} (HTTP ${data.status})`;
  });
  verb("nc", "EDGE", "nc -z <host> <port> | nc <host> <port> [words] — a raw conversation, one knock", async (ctx) => {
    const zero = ctx.args.includes("-z");
    const rest = ctx.args.filter((a) => !a.startsWith("-"));
    if (rest.length < 2) { ctx.io.print("usage: nc [-z] <host> <port> [words]", "err"); return; }
    const [host, portS, ...words] = rest;
    const port = Number(portS);
    if (zero) {
      const data = await api(`/api/tcp?host=${encodeURIComponent(host)}&ports=${port}`);
      if (!data.ok) return `nc: ${data.error}`;
      const r = data.results[0];
      return `${host} ${port}: ${r.state} (${r.ms} ms)`;
    }
    const data = await exchange(ctx, host, port, words.length ? words.join(" ") + "\r\n" : undefined);
    if (!data.ok) return `nc: ${data.error}`;
    return data.receivedBytes ? fmtBytes(b64ToB(data.receivedBase64)) : "(the door said nothing)";
  });
  verb("telnet", "EDGE", "telnet <host> [port] — the old handshake (banner read)", async (ctx) => {
    if (!need(ctx, 1, "telnet <host> [port]")) return;
    const { host, port } = hostPort(ctx.args[0] + (ctx.args[1] ? ":" + ctx.args[1] : ""), 23);
    const data = await exchange(ctx, host, port);
    if (!data.ok) return `telnet: ${data.error}`;
    return data.receivedBytes ? fmtBytes(b64ToB(data.receivedBase64)) : `connected to ${host}:${port} in ${data.connectMs} ms — no banner offered.`;
  });
  verb("banner", "EDGE", "banner <host> <port> — make a door introduce itself", async (ctx) => {
    if (!need(ctx, 2, "banner <host> <port>")) return;
    const data = await exchange(ctx, ctx.args[0], Number(ctx.args[1]));
    if (!data.ok) return `banner: ${data.error}`;
    return data.receivedBytes ? fmtBytes(b64ToB(data.receivedBase64)) : "(connected — the door introduces itself to no one)";
  });
  verb("knock", "EDGE", "knock <host> [ports] — knock a host (default: the top doors)", async (ctx) => {
    if (!need(ctx, 1, "knock <host> [ports]")) return;
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const ports = ctx.args[1] || "common";
    const data = await api(`/api/tcp?host=${encodeURIComponent(ctx.args[0])}&ports=${encodeURIComponent(ports)}`);
    if (!data.ok) return `knock: ${data.error}`;
    return [`${data.host} — ${data.summary}`, ...data.results.map((r: any) => `  ${String(r.port).padStart(5)}/${r.service.padEnd(16)} ${r.state}${r.state === "open" ? ` (${r.ms} ms)` : ""}`)].join("\n");
  });
  verb("portscan", "EDGE", "portscan <host> [top|a-b|list] — every door in the set, banners on the open ones", async (ctx) => {
    if (!need(ctx, 1, "portscan <host> [top|a-b|list]")) return;
    const spec = ctx.args[1] || "top";
    let ports = "common";
    if (/^\d+-\d+$/.test(spec)) {
      const [a, b] = spec.split("-").map(Number);
      if (b - a > 31) return "ranges cap at 32 doors in this room — the bench knocks, it does not sweep.";
      ports = Array.from({ length: b - a + 1 }, (_, i) => a + i).join(",");
    } else if (/^[\d,]+$/.test(spec)) ports = spec;
    else if (spec === "all") return "the web room checks the common doors or a 32-door set. 'all' lives in the native bench, on your own wire.";
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/tcp?host=${encodeURIComponent(ctx.args[0])}&ports=${encodeURIComponent(ports)}`);
    if (!data.ok) return `portscan: ${data.error}`;
    return [`${data.host} — ${data.summary}`, ...data.results.map((r: any) => `  ${String(r.port).padStart(5)}/${(r.service || "").padEnd(16)} ${r.state}`)].join("\n");
  });
  verb("cert", "EDGE", "cert <host> [port] — audit the TLS papers", async (ctx) => {
    if (!need(ctx, 1, "cert <host> [port]")) return;
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/tls?host=${encodeURIComponent(ctx.args[0])}&port=${encodeURIComponent(ctx.args[1] || "443")}`);
    if (!data.ok) return `cert: ${data.error}`;
    const leaf = data.chain?.[0];
    return [data.serverHelloVersion ? `negotiated (ServerHello): ${data.serverHelloVersion} · ${data.cipherSuite || ""}` : "no ServerHello read", leaf ? `leaf: ${leaf.subject}\nissuer: ${leaf.issuer}\nvalid: ${leaf.notBefore} → ${leaf.notAfter} (${leaf.daysRemaining} days left)\nSANs: ${(leaf.sans || []).join(", ") || "(none)"}\nsha256: ${leaf.sha256Fingerprint}` : "no certificate flight read (see findings)", ...(data.findings || []).map((f: string) => `! ${f}`)].join("\n");
  });
  verb("tlsgrade", "EDGE", "tlsgrade <host>[:port] — which TLS still turns", async (ctx) => {
    if (!need(ctx, 1, "tlsgrade <host>[:port]")) return;
    const { host, port } = hostPort(ctx.args[0], 443);
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/tls?host=${encodeURIComponent(host)}&port=${port}`);
    if (!data.ok) return `tlsgrade: ${data.error}`;
    const v = data.serverHelloVersion || "unread";
    const verdict = /1\.0|1\.1/.test(v) ? "FINDING: a pre-1.2 dialect still turns — anything under TLS 1.2 is a finding." : /1\.2/.test(v) ? "TLS 1.2 answered the 1.2 flight. (1.3 is negotiated separately by real clients.)" : /1\.3/.test(v) ? "TLS 1.3." : "no grade — no handshake read.";
    return `${host}:${port} — ${v}\n${verdict}\n${(data.findings || []).join("\n")}`;
  });
  verb("ifconfig", "LIVE", "ifconfig — this room's interfaces, as the web allows them to be known", async (ctx) => {
    const lines = [`browser  ${navigator.userAgent}`, `language ${navigator.language} · cores ${navigator.hardwareConcurrency || "?"} · online ${navigator.onLine}`];
    try { const data = await api("/api/echo"); if (data.ok) lines.push(`edge sees: ${data.network.connectingIp} · ${data.network.asOrganization || ""} · ${data.tls.version || ""} ${data.tls.cipher || ""} · colo ${data.network.colo || ""}`); } catch { /* edge quiet */ }
    lines.push("the LAN itself — addresses, gateway, arp — is the native bench's country. a web page is not shown it.");
    return lines.join("\n");
  });
  verb("traceroute", "LIMIT", "the road, hop by hop", async () => "traceroute needs ICMP/TTL games a browser cannot play and an edge cannot fake honestly. `ping` gives connect timing; the road itself lives in the native bench.");
  verb("arp", "LIMIT", "the neighborhood board", async () => "a web page is never shown the LAN's arp table — that is the native listening post's ground. On the web: `recon` a name, `knock` a public host.");
}

function registerWebBench() {
  const audit = async (ctx: Ctx, urlArg: string) => {
    const refusal = gateActive(ctx); if (refusal) throw new Error(refusal);
    const url = asUrl(urlArg);
    return api(`/api/http-audit?url=${encodeURIComponent(url)}`);
  };
  verb("webaudit", "EDGE", "webaudit <url> — headers, cookies, posture, graded", async (ctx) => {
    if (!need(ctx, 1, "webaudit <url>")) return;
    const data = await audit(ctx, ctx.args[0]);
    if (!data.ok) return `webaudit: ${data.error}`;
    return [`${data.finalUrl} — HTTP ${data.finalStatus} · grade ${data.security.grade} (${data.security.score}/100) · ${data.totalMs} ms · ${data.redirectHops} redirect(s)`, ...data.security.checks.map((c: any) => `  ${c.pass ? "✓" : "✗"} ${c.label} — ${c.detail}`), `cookies: ${data.cookies.length ? data.cookies.map((c: any) => `${c.name} [${c.issues.join(", ") || "flags kept"}]`).join("; ") : "none set"}`, `cors: ${data.cors.verdict}`, ...(data.fingerprint || []).map((f: string) => `fp: ${f}`)].join("\n");
  });
  verb("headersdeep", "EDGE", "headersdeep <url> — every header on the answer, read whole", async (ctx) => {
    if (!need(ctx, 1, "headersdeep <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `headersdeep: ${data.error}`;
    return [`HTTP ${data.status}`, ...Object.entries(data.headers).map(([k, v]) => `${k}: ${v}`)].join("\n");
  });
  verb("cookieaudit", "EDGE", "cookieaudit <url> — every cookie, and the flags each keeps or breaks", async (ctx) => {
    if (!need(ctx, 1, "cookieaudit <url>")) return;
    const data = await audit(ctx, ctx.args[0]);
    if (!data.ok) return `cookieaudit: ${data.error}`;
    if (!data.cookies.length) return "no cookies set on the final answer.";
    return data.cookies.map((c: any) => `${c.name}\n  Secure: ${c.flags.secure} · HttpOnly: ${c.flags.httpOnly} · SameSite: ${c.flags.sameSite || "(unset)"} · Path: ${c.flags.path || "/"}\n  ${c.issues.length ? "issues: " + c.issues.join(", ") : "flags kept"}`).join("\n");
  });
  verb("corsprobe", "EDGE", "corsprobe <url> — cross-origin policy, one foreign Origin", async (ctx) => {
    if (!need(ctx, 1, "corsprobe <url>")) return;
    const data = await audit(ctx, ctx.args[0]);
    if (!data.ok) return `corsprobe: ${data.error}`;
    return `ACAO: ${data.cors.allowOrigin || "(none)"} · credentials: ${data.cors.allowCredentials || "(none)"}\n${data.cors.verdict}`;
  });
  verb("corsdeep", "EDGE", "corsdeep <url> — cross-origin deepened: null origin, subdomain origin, preflight", async (ctx) => {
    if (!need(ctx, 1, "corsdeep <url>")) return;
    const url = asUrl(ctx.args[0]);
    const host = new URL(url).hostname;
    const probes = ["https://blacksite-probe.nosuchmachine.net", "null", `https://evil.${host}`];
    const lines: string[] = [];
    for (const origin of probes) {
      const data = await api(`/api/fetch?url=${encodeURIComponent(url)}&method=GET&origin=${encodeURIComponent(origin)}`);
      if (!data.ok) { lines.push(`${origin}: ${data.error}`); continue; }
      lines.push(`Origin ${origin} → ACAO: ${data.headers["access-control-allow-origin"] || "(none)"} · ACAC: ${data.headers["access-control-allow-credentials"] || "(none)"}`);
    }
    const pre = await api(`/api/fetch?url=${encodeURIComponent(url)}&method=OPTIONS`);
    lines.push(`preflight (OPTIONS, no Origin) → ${pre.ok ? `HTTP ${pre.status} · allow-methods: ${pre.headers["access-control-allow-methods"] || pre.headers["allow"] || "(none)"}` : pre.error}`);
    lines.push("reading: reflection of an arbitrary origin WITH credentials is the critical shape; wildcard without credentials is a public-API posture; silence is correct for private answers.");
    return lines.join("\n");
  });
  verb("redirectchain", "EDGE", "redirectchain <url> — the chain walked hop by hop", async (ctx) => {
    if (!need(ctx, 1, "redirectchain <url>")) return;
    const data = await audit(ctx, ctx.args[0]);
    if (!data.ok) return `redirectchain: ${data.error}`;
    const lines = data.hops.map((h: any, i: number) => `${i + 1}. ${h.status} ${h.url} (${h.ms} ms)`);
    if (data.mixedContentRisk) lines.push(`! ${data.mixedContentRisk}`);
    return lines.join("\n");
  });
  verb("robots", "EDGE", "robots <url> — the map the site posts of itself", async (ctx) => {
    if (!need(ctx, 1, "robots <url>")) return;
    const base = new URL(asUrl(ctx.args[0]));
    const data = await fetchEdge(ctx, `${base.origin}/robots.txt`);
    if (!data.ok) return `robots: ${data.error}`;
    return data.status === 200 ? (data.bodyText || "").slice(0, 4000) : `no robots.txt (HTTP ${data.status})`;
  });
  verb("robotsdeep", "EDGE", "robotsdeep <url> — robots.txt graded, and the doors its map advertises", async (ctx) => {
    if (!need(ctx, 1, "robotsdeep <url>")) return;
    const base = new URL(asUrl(ctx.args[0]));
    const data = await fetchEdge(ctx, `${base.origin}/robots.txt`);
    if (!data.ok) return `robotsdeep: ${data.error}`;
    if (data.status !== 200) return `no robots.txt to grade (HTTP ${data.status}). the site posts no map.`;
    const text = data.bodyText || "";
    const disallows = [...text.matchAll(/^\s*disallow:\s*(\S+)/gim)].map((m) => m[1]);
    const sitemaps = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const interesting = disallows.filter((d) => /admin|backup|config|\.env|api|private|internal|debug|test/i.test(d));
    return [`${disallows.length} disallowed paths, ${sitemaps.length} sitemap(s) declared`, ...(interesting.length ? ["the map advertises doors worth a look (they are told to robots, not locked):", ...interesting.map((d) => `  ${d}`)] : ["nothing sensitive advertised in the map"]), ...(sitemaps.length ? [`sitemaps: ${sitemaps.join(", ")}`] : [])].join("\n");
  });
  verb("sitemap", "EDGE", "sitemap <url> — the house's own map of itself", async (ctx) => {
    if (!need(ctx, 1, "sitemap <url>")) return;
    const base = new URL(asUrl(ctx.args[0]));
    const data = await fetchEdge(ctx, `${base.origin}/sitemap.xml`);
    if (!data.ok) return `sitemap: ${data.error}`;
    if (data.status !== 200) return `no sitemap.xml (HTTP ${data.status})`;
    const locs = [...(data.bodyText || "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    return [`${locs.length} URLs published`, ...locs.slice(0, 60)].join("\n");
  });
  verb("techstack", "EDGE", "techstack <url> — the stack, fingerprinted from what the answer gives away", async (ctx) => {
    if (!need(ctx, 1, "techstack <url>")) return;
    const data = await audit(ctx, ctx.args[0]);
    if (!data.ok) return `techstack: ${data.error}`;
    return data.fingerprint?.length ? data.fingerprint.join("\n") : "the answer gives nothing away. well kept.";
  });
  verb("wafdetect", "EDGE", "wafdetect <url> — which shield shows its badge on an ordinary knock", async (ctx) => {
    if (!need(ctx, 1, "wafdetect <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `wafdetect: ${data.error}`;
    const h = data.headers;
    const signs: string[] = [];
    if (h["cf-ray"]) signs.push("Cloudflare (cf-ray)");
    if (/cloudfront/i.test(h["via"] || "") || h["x-amz-cf-id"]) signs.push("AWS CloudFront");
    if (/akamai/i.test(JSON.stringify(h))) signs.push("Akamai markers");
    if (/sucuri/i.test(JSON.stringify(h))) signs.push("Sucuri");
    if (h["x-sucuri-id"]) signs.push("Sucuri (x-sucuri-id)");
    if (/incapsula|imperva/i.test(JSON.stringify(h))) signs.push("Imperva/Incapsula markers");
    if (h["server"] && /cloudflare/i.test(h["server"])) signs.push("server banner says cloudflare");
    return signs.length ? `badges shown: ${signs.join(" · ")}` : "no shield shows a badge on an ordinary knock. (absence of a badge is not absence of a shield.)";
  });
  verb("faviconhash", "EDGE", "faviconhash <url> — the icon's MurmurHash3, the badge hunters search by", async (ctx) => {
    if (!need(ctx, 1, "faviconhash <url>")) return;
    const base = new URL(asUrl(ctx.args[0]));
    const data = await fetchEdge(ctx, `${base.origin}/favicon.ico`, "GET", true);
    if (!data.ok) return `faviconhash: ${data.error}`;
    if (data.status !== 200 || !data.bodyBase64) return `no favicon.ico (HTTP ${data.status})`;
    const bytes = b64ToB(data.bodyBase64);
    const wrapped = bToB64(bytes).replace(/(.{76})/g, "$1\n");
    const hash = mmh3(new TextEncoder().encode(wrapped));
    return `murmur3 (shodan-style, base64-wrapped): ${hash}\nraw bytes: ${bytes.length} · md5: (see the Vault room) — search icon_hash=${hash} on shodan/fofa to find the badge's other homes.`;
  });
  verb("hstsprobe", "EDGE", "hstsprobe <url> — the https-only promise: set, long, honored", async (ctx) => {
    if (!need(ctx, 1, "hstsprobe <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `hstsprobe: ${data.error}`;
    const hsts = data.headers["strict-transport-security"];
    if (!hsts) return "no Strict-Transport-Security header. the promise is not made.";
    const maxAge = Number(hsts.match(/max-age=(\d+)/)?.[1] || 0);
    return [`STS: ${hsts}`, `max-age ${maxAge}s (${Math.round(maxAge / 86400)} days) — ${maxAge >= 31536000 ? "a year or more: preload-grade" : maxAge >= 15552000 ? "six months: solid" : "short: a promise with a small memory"}`, `includeSubDomains: ${/includesubdomains/i.test(hsts)} · preload flag: ${/preload/i.test(hsts)}`].join("\n");
  });
  verb("cacheprobe", "EDGE", "cacheprobe <url> — how caches are told to treat the answer", async (ctx) => {
    if (!need(ctx, 1, "cacheprobe <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `cacheprobe: ${data.error}`;
    const h = data.headers;
    return [`cache-control: ${h["cache-control"] || "(unset)"}`, `age: ${h["age"] || "(none)"} · cf-cache-status: ${h["cf-cache-status"] || "(n/a)"}`, `etag: ${h["etag"] || "(none)"} · last-modified: ${h["last-modified"] || "(none)"}`, `vary: ${h["vary"] || "(none)"}`, /private|no-store/i.test(h["cache-control"] || "") ? "the answer asks not to be kept. correct for anything personal." : "the answer may be kept by caches — fine for public paper, a finding on anything authenticated."].join("\n");
  });
  verb("compressprobe", "EDGE", "compressprobe <url> — does the house squeeze", async (ctx) => {
    if (!need(ctx, 1, "compressprobe <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `compressprobe: ${data.error}`;
    return `content-encoding: ${data.headers["content-encoding"] || "(identity — no squeeze on this answer)"} · transfer notes in headers above via headersdeep.`;
  });
  verb("httpversion", "EDGE", "httpversion — which HTTP the edge speaks to you (target-side versions ride the audit)", async (ctx) => {
    const data = await api("/api/echo");
    return data.ok ? `your road to this bench: ${data.httpVersion || "?"} over ${data.tls.version || "?"}` : "edge did not answer.";
  });
  verb("methoddeep", "EDGE", "methoddeep <url> — OPTIONS/HEAD read on a nothing path; write verbs stay unspoken from the web", async (ctx) => {
    if (!need(ctx, 1, "methoddeep <url>")) return;
    const base = new URL(asUrl(ctx.args[0]));
    const nothing = `${base.origin}/blacksite-nothing-${Math.floor(Math.random() * 1e6)}`;
    const lines: string[] = [];
    for (const m of ["OPTIONS", "HEAD", "GET"]) {
      const data = await fetchEdge(ctx, nothing, m);
      lines.push(`${m} → ${data.ok ? `HTTP ${data.status}${m === "OPTIONS" ? ` · allow: ${data.headers["allow"] || data.headers["access-control-allow-methods"] || "(none published)"}` : ""}` : data.error}`);
    }
    lines.push("write verbs (PUT/DELETE/TRACE) are not tried from the web room — the native bench tries them empty-handed, on your own wire, by your own hand.");
    return lines.join("\n");
  });
  verb("certprobe", "EDGE", "certprobe <url> — the leaf's papers against the name you knocked on", async (ctx) => {
    if (!need(ctx, 1, "certprobe <url>")) return;
    const host = new URL(asUrl(ctx.args[0])).hostname;
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/tls?host=${encodeURIComponent(host)}&port=443`);
    if (!data.ok) return `certprobe: ${data.error}`;
    const leaf = data.chain?.[0];
    if (!leaf) return `no chain read. ${(data.findings || []).join(" ")}`;
    const covered = (leaf.sans || []).some((s: string) => s === host || (s.startsWith("*.") && host.endsWith(s.slice(1)) && host.split(".").length === s.split(".").length));
    return [`leaf for ${host}: ${covered ? "the name is covered by the SAN list" : "the name is NOT in the SAN list — browsers will refuse this paper"}`, `subject: ${leaf.subject}`, `issuer: ${leaf.issuer}`, `expires: ${leaf.notAfter} (${leaf.daysRemaining} days)`].join("\n");
  });
  verb("certchain", "EDGE", "certchain <url> — every paper in the chain, leaf to root", async (ctx) => {
    if (!need(ctx, 1, "certchain <url>")) return;
    const host = new URL(asUrl(ctx.args[0])).hostname;
    const refusal = gateActive(ctx); if (refusal) return refusal;
    const data = await api(`/api/tls?host=${encodeURIComponent(host)}&port=443`);
    if (!data.ok) return `certchain: ${data.error}`;
    if (!data.chain?.length) return `no chain read from the flight. ${(data.findings || []).join(" ")}`;
    return data.chain.map((c: any, i: number) => `${i + 1}. [${c.position}] ${c.subject}\n   issuer: ${c.issuer} · expires ${c.notAfter}\n   sha256: ${c.sha256Fingerprint}`).join("\n");
  });
  verb("jsendpoints", "EDGE", "jsendpoints <url> — the API doors the page's own scripts name", async (ctx) => {
    if (!need(ctx, 1, "jsendpoints <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]));
    if (!data.ok) return `jsendpoints: ${data.error}`;
    const html = data.bodyText || "";
    const found = new Set<string>();
    for (const m of html.matchAll(/["'](\/(?:api|v\d|graphql|rest|wp-json)[^"'\s<]{1,120})["']/g)) found.add(m[1]);
    for (const m of html.matchAll(/src=["']([^"']+\.js)["']/g)) found.add(`script: ${m[1]}`);
    return found.size ? [...found].slice(0, 80).join("\n") : "the page names no API doors in its own paper.";
  });
  verb("urlextract", "EDGE", "urlextract <url> — every road out of the page, sorted", async (ctx) => {
    if (!need(ctx, 1, "urlextract <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]));
    if (!data.ok) return `urlextract: ${data.error}`;
    const urls = new Set<string>();
    for (const m of (data.bodyText || "").matchAll(/(?:href|src)=["']([^"']+)["']/g)) urls.add(m[1]);
    return [...urls].sort().slice(0, 120).join("\n") || "no roads out.";
  });
  verb("swaggerprobe", "EDGE", "swaggerprobe <url> — the API's published spec doors", async (ctx) => {
    if (!need(ctx, 1, "swaggerprobe <url>")) return;
    const base = new URL(asUrl(ctx.args[0])).origin;
    const doors = ["/swagger.json", "/swagger-ui.html", "/openapi.json", "/api-docs", "/v3/api-docs", "/swagger-ui/", "/redoc"];
    const lines: string[] = [];
    for (const door of doors) {
      const data = await fetchEdge(ctx, base + door, "HEAD");
      lines.push(`${door} → ${data.ok ? `HTTP ${data.status}${data.status === 200 ? " — published" : ""}` : "no answer"}`);
    }
    return lines.join("\n");
  });
  verb("oidcprobe", "EDGE", "oidcprobe <url> — the OpenID discovery document, read whole", async (ctx) => {
    if (!need(ctx, 1, "oidcprobe <url>")) return;
    const base = new URL(asUrl(ctx.args[0])).origin;
    const data = await fetchEdge(ctx, `${base}/.well-known/openid-configuration`);
    if (!data.ok) return `oidcprobe: ${data.error}`;
    if (data.status !== 200) return `no discovery document (HTTP ${data.status}).`;
    try { const j = JSON.parse(data.bodyText); return [`issuer: ${j.issuer}`, `authorization: ${j.authorization_endpoint}`, `token: ${j.token_endpoint}`, `jwks: ${j.jwks_uri}`, `algorithms: ${(j.id_token_signing_alg_values_supported || []).join(", ")}`, `scopes: ${(j.scopes_supported || []).slice(0, 12).join(", ")}`].join("\n"); }
    catch { return (data.bodyText || "").slice(0, 2000); }
  });
  verb("graphqlprobe", "EDGE", "graphqlprobe <url> — is the schema posted on the door (GET dialect)", async (ctx) => {
    if (!need(ctx, 1, "graphqlprobe <url>")) return;
    const url = `${asUrl(ctx.args[0])}?query=${encodeURIComponent("{__typename}")}`;
    const data = await fetchEdge(ctx, url);
    if (!data.ok) return `graphqlprobe: ${data.error}`;
    return `HTTP ${data.status} — ${(data.bodyText || "").slice(0, 600)}\n(the web room asks by GET; the full introspection battery rides POST in the native bench.)`;
  });
  verb("openredirect", "EDGE", "openredirect <url> — do the exit parameters walk off the site", async (ctx) => {
    if (!need(ctx, 1, "openredirect <url>")) return;
    const data = await fetchEdge(ctx, ctx.args[0]);
    if (!data.ok) return `openredirect: ${data.error}`;
    if ([301, 302, 303, 307, 308].includes(data.status) && data.location) {
      const offsite = /^https?:\/\//i.test(data.location);
      return `HTTP ${data.status} → ${data.location}\n${offsite ? "the door leads off-site — if that destination came from a query parameter you control, this is the open-redirect shape; verify by hand with your own parameter." : "redirect stays relative/on-site."}`;
    }
    return `no redirect on that knock (HTTP ${data.status}). try the URL with your exit parameter included, e.g. ?next=https://example.org/`;
  });
  verb("wayback", "EDGE", "wayback <domain> — what the public archive remembers", async (ctx) => {
    if (!need(ctx, 1, "wayback <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await fetchEdge(ctx, `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(ctx.args[0])}&output=json&limit=12&from=1996&collapse=timestamp:6`);
    if (!data.ok) return `wayback: ${data.error}`;
    try {
      const rows = JSON.parse(data.bodyText || "[]");
      if (!rows.length) return "the archive remembers nothing under that name.";
      return rows.map((r: any) => Array.isArray(r) ? r.join("  ") : String(r)).join("\n");
    } catch { return (data.bodyText || "").slice(0, 2000); }
  });
  verb("apicensus", "EDGE", "apicensus <url> — one answer as an API citizen: limits, pages, challenges", async (ctx) => {
    if (!need(ctx, 1, "apicensus <url>")) return;
    const data = await fetchEdge(ctx, asUrl(ctx.args[0]), "HEAD");
    if (!data.ok) return `apicensus: ${data.error}`;
    const h = data.headers;
    const interesting = Object.entries(h).filter(([k]) => /rate|limit|retry|page|total|link|auth|challenge/i.test(k));
    return [`HTTP ${data.status}`, ...(interesting.length ? interesting.map(([k, v]) => `${k}: ${v}`) : ["no rate-limit, pagination, or challenge headers published"]), `content-type: ${h["content-type"] || "(none)"}`].join("\n");
  });
}

export function registerWireVerbs() {
  registerWire();
  registerWebBench();
}
export { asUrl, fetchEdge };
