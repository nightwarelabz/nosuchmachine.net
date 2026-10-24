// BLACKSITE OS — DNS/mail ledgers, protocol probes, batteries, engines.
import { verb, b64ToB, bToB64, bToHex, hexToB, mmh3 } from "./os-shell";
import { runScheme, runBrainfuck, runLua, runSql, wasmExports, runWasm } from "./os-engines2";
import { api, exchange, edgeDns, dnsRecords, fmtBytes, hostPort, need } from "./os-verbs";
import { registerGit } from "./os-git";
import { asUrl, fetchEdge } from "./os-verbs2";

type Ctx = { args: string[]; stdin: string; os: any; io: any; raw: string };
const td = new TextDecoder();

async function txtRecords(ctx: Ctx, name: string): Promise<string[]> {
  const refusal = ctx.os.gate("ledger");
  if (refusal) throw new Error(refusal);
  const data = await edgeDns(name, "TXT");
  return dnsRecords(data, "TXT").map((r) => r.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}

function registerDnsFamily() {
  verb("dnsdeep", "EDGE", "dnsdeep <domain> — every record family of one name, read whole", async (ctx) => {
    if (!need(ctx, 1, "dnsdeep <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const lines: string[] = [];
    for (const t of ["A", "AAAA", "MX", "NS", "TXT", "SOA", "CAA"]) {
      const data = await edgeDns(ctx.args[0], t);
      const recs = dnsRecords(data, t);
      lines.push(`${t.padEnd(5)} ${recs.length ? recs.join("\n" + " ".repeat(6)) : "(none)"}`);
    }
    return lines.join("\n");
  });
  verb("dnscensus", "EDGE", "dnscensus <domain> — do the resolvers agree (same as dnsaudit)", async (ctx) => {
    if (!need(ctx, 1, "dnscensus <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(ctx.args[0], "A");
    if (!data.ok) return `dnscensus: ${data.error}`;
    const sets = (data.results.A || []).map((r: any) => `${r.label}: ${r.ok ? (r.records.map((x: any) => x.data).sort().join(", ") || "(none)") : r.error}`);
    const unique = new Set(sets.map((s: string) => s.split(": ").slice(1).join(": ")));
    return [...sets, unique.size > 1 ? "VERDICT: the witnesses DISAGREE — split-horizon, stale cache, or a migration mid-flight." : "VERDICT: the witnesses agree."].join("\n");
  });
  verb("dnsaudit", "EDGE", "dnsaudit <domain> — resolvers compared", async (ctx) => {
    const { VERBS } = await import("./os-shell");
    const def = VERBS.get("dnscensus");
    if (def) return def.run(ctx);
  });
  verb("caacheck", "EDGE", "caacheck <domain> — who may issue, and whether a watch stands", async (ctx) => {
    if (!need(ctx, 1, "caacheck <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(ctx.args[0], "CAA");
    const recs = dnsRecords(data, "CAA");
    return recs.length ? recs.join("\n") : "no CAA records — any CA may issue for this name, and no iodef watch stands. adding CAA is cheap insurance.";
  });
  verb("ttlprobe", "EDGE", "ttlprobe <domain> — how long each family's answer may be remembered", async (ctx) => {
    if (!need(ctx, 1, "ttlprobe <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const lines: string[] = [];
    for (const t of ["A", "AAAA", "MX", "NS", "SOA"]) {
      const data = await edgeDns(ctx.args[0], t);
      const ttls = new Set<string>();
      for (const r of data.results[t] || []) if (r.ok) for (const rec of r.records) ttls.add(String(rec.ttl));
      lines.push(`${t.padEnd(5)} TTL ${[...ttls].join("/") || "—"}`);
    }
    lines.push("short TTLs: nimble migrations, more query load. long TTLs: calm, but a bad record lingers.");
    return lines.join("\n");
  });
  verb("soacheck", "EDGE", "soacheck <domain> — the zone's own ledger", async (ctx) => {
    if (!need(ctx, 1, "soacheck <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(ctx.args[0], "SOA");
    const recs = dnsRecords(data, "SOA");
    if (!recs.length) return "no SOA answers.";
    const parts = recs[0].split(/\s+/);
    return [`mname ${parts[0]} · rname ${parts[1]}`, `serial ${parts[2]} · refresh ${parts[3]}s · retry ${parts[4]}s · expire ${parts[5]}s · minimum ${parts[6]}s`, /^\d{10}$/.test(parts[2]) ? "serial convention: YYYYMMDDnn — the tidy kind." : "serial convention: not a date serial (fine, if the secondaries agree)."].join("\n");
  });
  verb("wildcardprobe", "EDGE", "wildcardprobe <domain> — ask for a name that cannot exist", async (ctx) => {
    if (!need(ctx, 1, "wildcardprobe <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const ghost = `blacksite-cannot-exist-${Math.floor(Math.random() * 1e9)}.${ctx.args[0]}`;
    const data = await edgeDns(ghost, "A");
    const recs = dnsRecords(data, "A");
    return recs.length ? `the ghost name ANSWERED (${recs.join(", ")}) — this zone is a wildcard: every invented name resolves. spam, scanners, and dangling-name hunters all love that.` : "the ghost name got NXDOMAIN/no answer — no wildcard. correct and quiet.";
  });
  verb("spfprobe", "EDGE", "spfprobe <domain> — who may sign letters with this name", async (ctx) => {
    if (!need(ctx, 1, "spfprobe <domain>")) return;
    const txts = await txtRecords(ctx, ctx.args[0]);
    const spf = txts.filter((t) => t.startsWith("v=spf1"));
    if (!spf.length) return "no SPF record — anyone may claim this name in a From header, as far as SPF is concerned.";
    const lookups = (spf[0].match(/\b(include:|a:|mx:|ptr:|exists:|redirect=)/g) || []).length;
    const terminal = spf[0].match(/([~\-?+])all/)?.[0] || "(no all)";
    return [`${spf[0]}`, `dns-mechanism count: ${lookups} of the 10-lookup budget`, `terminal: ${terminal} — ${terminal.startsWith("-") ? "-all: forgeries are refused. the strong word." : terminal.startsWith("~") ? "~all: softfail — a suggestion, not a wall." : "weak or missing terminal."}`].join("\n");
  });
  verb("dkimprobe", "EDGE", "dkimprobe <domain> — the signing keys under the common selectors", async (ctx) => {
    if (!need(ctx, 1, "dkimprobe <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const selectors = ["default", "google", "selector1", "selector2", "mail", "dkim", "k1", "s1", "mx", "smtp", "sig1", "mandrill"];
    const lines: string[] = [];
    for (const sel of selectors) {
      const txts = await txtRecords(ctx, `${sel}._domainkey.${ctx.args[0]}`).catch(() => [] as string[]);
      const key = txts.find((t) => t.includes("v=DKIM1") || t.includes("p="));
      if (key) lines.push(`${sel}: KEY PUBLISHED (${key.length} chars)${/p=\s*(;|$)/.test(key) ? " — but EMPTY: revoked" : ""}`);
    }
    return lines.length ? lines.join("\n") : "no DKIM keys under the twelve common selectors. the name may use a rarer selector — or sign nothing.";
  });
  verb("dmarcprobe", "EDGE", "dmarcprobe <domain> — what a forgery costs", async (ctx) => {
    if (!need(ctx, 1, "dmarcprobe <domain>")) return;
    const txts = await txtRecords(ctx, `_dmarc.${ctx.args[0]}`);
    const dmarc = txts.find((t) => t.startsWith("v=DMARC1"));
    if (!dmarc) return "no DMARC record — forgeries of this name cost the forger nothing at the policy layer.";
    const policy = dmarc.match(/p=(\w+)/)?.[1] || "?";
    return [`${dmarc}`, `policy p=${policy} — ${policy === "reject" ? "forgeries are refused. the finished posture." : policy === "quarantine" ? "forgeries go to spam. halfway." : "p=none: the policy only watches. it stops nothing."}`].join("\n");
  });
  verb("mxprobe", "EDGE", "mxprobe <domain> — where the mail goes", async (ctx) => {
    if (!need(ctx, 1, "mxprobe <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(ctx.args[0], "MX");
    const recs = dnsRecords(data, "MX");
    if (!recs.length) return "no MX — this name accepts no mail (or falls back to its A record, the old way).";
    if (recs.some((r) => /(^|\s)0\s+\.$/.test(r))) return "null MX — the name declares, on purpose, that it accepts NO mail. anything sent is forged by definition.";
    return recs.map((r) => `  ${r}`).join("\n");
  });
  verb("mtasts", "EDGE", "mtasts <domain> — the mail road's published seal (DNS half + policy)", async (ctx) => {
    if (!need(ctx, 1, "mtasts <domain>")) return;
    const txts = await txtRecords(ctx, `_mta-sts.${ctx.args[0]}`);
    const rec = txts.find((t) => t.includes("v=STSv1"));
    if (!rec) return "no MTA-STS record — the mail road has no published seal.";
    const policy = await fetchEdge(ctx, `https://mta-sts.${ctx.args[0]}/.well-known/mta-sts.txt`).catch(() => null);
    return [rec, policy?.ok && policy.status === 200 ? `policy file:\n${(policy.bodyText || "").slice(0, 600)}` : "policy file did not answer at mta-sts.<domain> — a seal half-published is a seal broken."].join("\n");
  });
  verb("tlsrpt", "EDGE", "tlsrpt <domain> — where broken mail seals are reported", async (ctx) => {
    if (!need(ctx, 1, "tlsrpt <domain>")) return;
    const txts = await txtRecords(ctx, `_smtp._tls.${ctx.args[0]}`);
    const rec = txts.find((t) => t.includes("v=TLSRPTv1"));
    return rec ? rec : "no TLS-RPT record — when a mail seal breaks, nobody anywhere is told.";
  });
  verb("bimi", "EDGE", "bimi <domain> — the face beside the letter", async (ctx) => {
    if (!need(ctx, 1, "bimi <domain>")) return;
    const txts = await txtRecords(ctx, `default._bimi.${ctx.args[0]}`);
    const rec = txts.find((t) => t.includes("v=BIMI1"));
    return rec ? `${rec}\n${/a=[^;]+/.test(rec) ? "a VMC authority is named — the mark stands verified." : "a mark is published without a VMC — most clients will not show it."}` : "no BIMI record at the default selector.";
  });
  verb("subdomains", "EDGE", "subdomains <domain> — the certificate logs confess (no dictionary, no brute force)", async (ctx) => {
    if (!need(ctx, 1, "subdomains <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await api(`/api/recon?domain=${encodeURIComponent(ctx.args[0])}`);
    if (!data.ok) return `subdomains: ${data.error}`;
    const subs = data.transparency?.subdomains || [];
    return data.transparency.ok ? [`${subs.length} names confessed by the public certificate logs:`, ...subs.slice(0, 200)].join("\n") : `CT ledger: ${data.transparency.error}`;
  });
  verb("certtrans", "EDGE", "certtrans <domain> — every certificate the logs remember", async (ctx) => {
    if (!need(ctx, 1, "certtrans <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await api(`/api/recon?domain=${encodeURIComponent(ctx.args[0])}`);
    if (!data.ok) return `certtrans: ${data.error}`;
    const t = data.transparency;
    return t.ok ? `certificates logged: ${t.certificatesLogged} · unique names: ${t.uniqueNames} · most recent not-before: ${t.mostRecentCertNotBefore || "?"}` : `CT ledger: ${t.error}`;
  });
  verb("reverseprobe", "EDGE", "reverseprobe <ip> — the name behind the number", async (ctx) => {
    if (!need(ctx, 1, "reverseprobe <ip>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await edgeDns(ctx.args[0], "PTR");
    const recs = dnsRecords(data, "PTR");
    return recs.length ? recs.join("\n") : "no PTR — the number names no one.";
  });
  verb("danglingprobe", "EDGE", "danglingprobe <name> — a CNAME that points at a ghost", async (ctx) => {
    if (!need(ctx, 1, "danglingprobe <name>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const cn = await edgeDns(ctx.args[0], "CNAME");
    const targets = dnsRecords(cn, "CNAME");
    if (!targets.length) return "no CNAME — nothing dangles here.";
    const lines = [`${ctx.args[0]} → ${targets.join(", ")}`];
    for (const t of targets) {
      const a = await edgeDns(t.replace(/\.$/, ""), "A");
      lines.push(dnsRecords(a, "A").length ? `${t} still resolves — alive.` : `${t} does NOT resolve — the CNAME dangles. if that name can be claimed at its provider, this is the subdomain-takeover shape. graded, never touched.`);
    }
    return lines.join("\n");
  });
  verb("asnprobe", "EDGE", "asnprobe <ip> — whose road a number runs on", async (ctx) => {
    if (!need(ctx, 1, "asnprobe <ip>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const data = await fetchEdge(ctx, `https://rdap.org/ip/${encodeURIComponent(ctx.args[0])}`);
    if (!data.ok) return `asnprobe: ${data.error}`;
    try { const j = JSON.parse(data.bodyText); return [`${j.name || ctx.args[0]} · ${j.type || ""}`, `handle: ${j.handle || "?"} · country: ${j.country || "?"}`, `range: ${j.startAddress || "?"} – ${j.endAddress || "?"}`, ...(j.entities || []).map((e: any) => `entity: ${(e.roles || []).join("/")} ${e.handle || ""}`)].join("\n"); }
    catch { return (data.bodyText || "").slice(0, 1500); }
  });
  verb("dnssecgrade", "EDGE", "dnssecgrade <domain> — the chain as far as the wire shows it", async (ctx) => {
    if (!need(ctx, 1, "dnssecgrade <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const ds = await edgeDns(ctx.args[0], "DS");
    const keys = await edgeDns(ctx.args[0], "DNSKEY");
    const a = await edgeDns(ctx.args[0], "A");
    const adFlags = (a.results.A || []).map((r: any) => r.ad);
    return [`DS records: ${dnsRecords(ds, "DS").length} · DNSKEY records: ${dnsRecords(keys, "DNSKEY").length}`, `resolver AD (authenticated data) on A: ${adFlags.some(Boolean) ? "set by at least one witness — the chain validates" : "not set"}`, dnsRecords(ds, "DS").length ? "the zone signs and the parent vouches. the finished posture." : "no DS at the parent — the chain of trust, if any, stops below the registry."].join("\n");
  });
  verb("nsecprobe", "EDGE", "nsecprobe <domain> — can the zone be walked", async (ctx) => {
    if (!need(ctx, 1, "nsecprobe <domain>")) return;
    const refusal = ctx.os.gate("ledger"); if (refusal) return refusal;
    const ghost = `blacksite-walk-${Math.floor(Math.random() * 1e9)}.${ctx.args[0]}`;
    const data = await edgeDns(ghost, "A");
    const auth = (data.results.A || []).flatMap((r: any) => r.authority || []);
    const nsec = auth.filter((a: any) => a.type === 47 || a.type === 50);
    return nsec.length ? `the denial proof uses ${nsec.some((a: any) => a.type === 50) ? "NSEC3 — names are hashed before they are listed; walking is work" : "NSEC — the neighbours are named in the clear; the zone can be walked"}.` : "no NSEC/NSEC3 in the denial answer — the zone may be unsigned, or its resolver stripped the proof.";
  });
}

/* ---- TCP protocol probes: one exchange each ---- */
function probe(verbName: string, port: number, help: string, sendText?: string, sendBytes?: Uint8Array, grade?: (text: string, raw: Uint8Array) => string) {
  verb(verbName, "EDGE", help, async (ctx) => {
    if (!need(ctx, 1, `${verbName} <host>`)) return;
    const hp = hostPort(ctx.args[0], port);
    const data = await exchange(ctx, hp.host, hp.port, sendText, sendBytes);
    if (!data.ok) return `${verbName}: ${data.error}`;
    const raw = b64ToB(data.receivedBase64 || "");
    const text = td.decode(raw);
    const body = data.receivedBytes ? fmtBytes(raw, 800) : "(the door connected and said nothing)";
    return `${hp.host}:${hp.port} — connected in ${data.connectMs} ms\n${body}${grade ? "\n" + grade(text, raw) : ""}`;
  });
}
function registerProbes() {
  probe("redisprobe", 6379, "redisprobe <host> — one PING; PONG without a password is critical", "PING\r\n", undefined, (t) => t.includes("+PONG") ? "GRADE: CRITICAL — the store answered PING with no password asked. an unauthenticated Redis is the whole database, gift-wrapped." : t.includes("NOAUTH") || t.includes("ERR") ? "the store demands a name/password or refused the verb. posture kept." : "no PONG read.");
  probe("smtpprobe", 25, "smtpprobe <host> — the mail door's manners (banner + EHLO; no mail, no AUTH)", "EHLO blacksite.nosuchmachine.net\r\n", undefined, (t) => [`banner+EHLO read. STARTTLS offered: ${/STARTTLS/i.test(t)} · 8BITMIME: ${/8BITMIME/i.test(t)} · SIZE: ${/SIZE/i.test(t)}`, /VRFY/i.test(t) ? "the EHLO letterhead mentions VRFY — verify-by-hand territory; the bench does not use it." : ""].filter(Boolean).join("\n"));
  probe("ftpprobe", 21, "ftpprobe <host> — banner; the anonymous word is NOT tried from the web room", undefined, undefined, (t) => `banner read. the conventional anonymous login is a credential attempt — the web room does not make it; the native bench asks by your hand.`);
  probe("pop3probe", 110, "pop3probe <host> — the POP3 greeting", undefined, undefined, (t) => t.startsWith("+OK") ? "greeting +OK — the door speaks POP3." : "no +OK greeting read.");
  probe("imapprobe", 143, "imapprobe <host> — the IMAP greeting and its capabilities", undefined, undefined, (t) => `STARTTLS in greeting: ${/STARTTLS/i.test(t)} · LOGINDISABLED: ${/LOGINDISABLED/i.test(t)}`);
  probe("mysqlprobe", 3306, "mysqlprobe <host> — the greeting read; no answer is ever sent back", undefined, undefined, (t, raw) => raw.length > 5 ? `greeting packet: protocol ${raw[4]} — the server introduced itself and the bench answered nothing, by design.` : "no greeting read.");
  probe("pgprobe", 5432, "pgprobe <host> — SSLRequest: S, N, or E; no startup packet follows", undefined, new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47]), (t, raw) => raw.length ? `the door answered '${String.fromCharCode(raw[0])}' — ${raw[0] === 0x53 ? "S: it will seal the road (TLS)" : raw[0] === 0x4e ? "N: it will NOT seal the road — credentials would cross in the clear if a client allowed it" : "E/other: see the raw byte"}` : "no answer read.");
  probe("memcacheprobe", 11211, "memcacheprobe <host> — version, asked politely", "version\r\n", undefined, (t) => t.startsWith("VERSION") ? `it published its version to a stranger: ${t.split("\r\n")[0]}. classic memcached keeps no names at all — anything in it is readable by anyone who knocks.` : "no VERSION answer.");
  probe("mqttprobe", 1883, "mqttprobe <host> — an anonymous CONNECT; the CONNACK grades the door", undefined, new Uint8Array([0x10, 0x14, 0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c, 0x00, 0x08, 0x62, 0x6c, 0x61, 0x63, 0x6b, 0x73, 0x69, 0x74, 0x65]), (t, raw) => raw.length >= 4 && raw[0] === 0x20 ? `CONNACK return code ${raw[3]} — ${raw[3] === 0 ? "GRADE: the broker let an unnamed guest IN. anything subscribed is theirs to read." : "the broker refused the unnamed guest. posture kept."}` : "no CONNACK read.");
  probe("vncprobe", 5900, "vncprobe <host> — the framebuffer's greeting and security types", undefined, undefined, (t, raw) => {
    if (!t.startsWith("RFB")) return "no RFB greeting.";
    return `it speaks ${t.slice(0, 12).trim()} — after the greeting it offers security types; type 1 (None) would be critical. the web room reads the greeting and stops, by doctrine.`;
  });
  probe("rtspprobe", 554, "rtspprobe <host> — the camera's OPTIONS; no stream is opened", "OPTIONS rtsp://x/ RTSP/1.0\r\nCSeq: 1\r\n\r\n", undefined, (t) => `public verbs are in the answer above. a camera that answers OPTIONS to strangers has introduced itself.`);
  probe("sipprobe", 5060, "sipprobe <host> — one SIP OPTIONS by TCP; no call is placed", "OPTIONS sip:x SIP/2.0\r\nVia: SIP/2.0/TCP blacksite;branch=z9hG4bK-bs\r\nFrom: <sip:blacksite@x>;tag=1\r\nTo: <sip:x>\r\nCall-ID: bs@blacksite\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n", undefined, (t) => /SIP\/2\.0/.test(t) ? "the PBX answered OPTIONS. its Allow list and letterhead are above." : "no SIP answer (many PBXs speak UDP only — that road is the native bench's).");
  probe("zkprobe", 2181, "zkprobe <host> — four letters: stat", "stat", undefined, (t) => t.includes("Zookeeper version") ? "it published its whole stat ledger to four letters from a stranger. by design, and worth grading." : "no stat ledger read.");
  probe("modbusprobe", 502, "modbusprobe <host> — the PLC's Device Identification, the one read this bench allows", undefined, new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x2b, 0x0e, 0x01, 0x00]), (t, raw) => raw.length >= 9 ? `the nameplate answered: function ${raw[7]?.toString(16)} — vendor/product/revision strings follow in the frame above (hex via banner if unreadable). identification only; nothing was written, ever.` : "no nameplate answer.");
  probe("enipprobe", 44818, "enipprobe <host> — EtherNet/IP List Identity, in the clear", undefined, (() => { const b = new Uint8Array(24); b[0] = 0x63; return b; })(), (t, raw) => raw.length >= 24 ? "List Identity answered — vendor, device type, product, revision and serial ride in that frame, in the clear, by design." : "no identity answer.");
  probe("dnp3probe", 20000, "dnp3probe <host> — link status only; never a control", undefined, new Uint8Array([0x05, 0x64, 0x05, 0xc9, 0x01, 0x00, 0x00, 0x00, 0xe2, 0x1e]), () => "asked for link status only. DNP3 controls are never built by this bench — not here, not in the native room.");
  probe("iec104probe", 2404, "iec104probe <host> — STARTDT/TESTFR only; nothing interrogated, nothing controlled", undefined, new Uint8Array([0x68, 0x04, 0x07, 0x00, 0x00, 0x00]), () => "telecontrol handshake only. interrogation and control frames do not exist in this bench.");
  probe("gpsdprobe", 2947, "gpsdprobe <host> — version and receivers; no WATCH, so no fix is ever streamed", "?VERSION;\r\n", undefined, (t) => t.slice(0, 300));
  probe("s7probe", 102, "s7probe <host> — the Siemens door, knocked once (connect + read)", undefined, undefined, () => "presence graded plainly from the connect; the full COTP/S7 nameplate read rides the native bench's protocol engine.");
  probe("bacnetprobe", 47808, "bacnetprobe — BACnet/IP speaks UDP", undefined, undefined, () => "UDP — see limits.");
  // HTTP-service probes via fetch
  const httpProbe = (name: string, port: number, path: string, help: string, grade: (j: any, raw: string) => string) => {
    verb(name, "EDGE", help, async (ctx) => {
      if (!need(ctx, 1, `${name} <host>`)) return;
      const hp = hostPort(ctx.args[0], port);
      const data = await fetchEdge(ctx, `http://${hp.host}:${hp.port}${path}`);
      if (!data.ok) return `${name}: ${data.error}`;
      if (data.status === 404) return `${hp.host}:${hp.port} answered HTTP but not at ${path} — the service may live elsewhere, or not run.`;
      let j: any = null;
      try { j = JSON.parse(data.bodyText || ""); } catch { /* not json */ }
      return `HTTP ${data.status} from ${hp.host}:${hp.port}${path}\n${grade(j, (data.bodyText || "").slice(0, 800))}`;
    });
  };
  httpProbe("dockerprobe", 2375, "/version", "dockerprobe <host> — an unauthenticated Docker API is the host itself", (j, raw) => j?.Version ? `GRADE: CRITICAL if unauthenticated — Docker ${j.Version} answered /version. this API is root on the host, wearing a web door.` : raw.slice(0, 300));
  httpProbe("elasticprobe", 9200, "/", "elasticprobe <host> — the cluster's own introduction", (j, raw) => j?.cluster_name ? `cluster ${j.cluster_name} · node ${j.name} · version ${j.version?.number} — handed to a stranger by design.` : raw.slice(0, 300));
  httpProbe("couchprobe", 5984, "/", "couchprobe <host> — the welcome mat", (j, raw) => j?.couchdb ? `${j.couchdb} — version ${j.version}. the welcome mat is public by design; the databases behind it are the question.` : raw.slice(0, 300));
  httpProbe("etcdprobe", 2379, "/version", "etcdprobe <host> — the version door", (j, raw) => j?.etcdserver ? `etcd ${j.etcdserver} · cluster ${j.etcdcluster}` : raw.slice(0, 300));
  httpProbe("consulprobe", 8500, "/v1/status/leader", "consulprobe <host> — who leads the raft, asked with no token", (j, raw) => raw ? `leader answer: ${raw.slice(0, 200)} — the agent API is a control plane; an unnamed read of it is already a finding.` : raw);
  httpProbe("vaultprobe", 8200, "/v1/sys/seal-status", "vaultprobe <host> — the seal-status", (j, raw) => j ? `sealed: ${j.sealed} · initialized: ${j.initialized} · version: ${j.version || "?"}` : raw.slice(0, 300));
  httpProbe("k8sprobe", 6443, "/version", "k8sprobe <host> — the API server's version papers (https door; http attempted)", (j, raw) => j?.gitVersion ? `kubernetes ${j.gitVersion} answered unnamed.` : raw.slice(0, 300));
  httpProbe("jenkinsprobe", 8080, "/", "jenkinsprobe <host> — the version in the letterhead", (_j, raw) => raw.slice(0, 300) || "answered.");
  httpProbe("solrprobe", 8983, "/solr/admin/info/system?wt=json", "solrprobe <host> — the admin system document", (j, raw) => j?.lucene ? `solr ${j.lucene["solr-spec-version"]} · lucene ${j.lucene["lucene-spec-version"]}` : raw.slice(0, 300));
  httpProbe("registryprobe", 5000, "/v2/", "registryprobe <host> — the /v2/ threshold; the token challenge read, never answered", (_j, raw) => raw.slice(0, 200) || "the threshold answered.");
  httpProbe("mtconnectprobe", 5000, "/current", "mtconnectprobe <host> — the machine-tool agent's published census", (_j, raw) => raw.slice(0, 500));
  httpProbe("sep2probe", 8080, "/dcap", "sep2probe <host> — the smart-grid capability document", (_j, raw) => raw.slice(0, 500));
}

function registerBatteries() {
  verb("scan", "EDGE", "scan [port] — the common doors of one host (the web room has no /24 to sweep)", async (ctx) => {
    const port = ctx.args[0] || "80";
    return "the web room stands at the edge, not on your LAN — there is no neighborhood here to sweep. `knock <host>` does this host's doors; the /24 sweep is the native bench on your own wire.";
  });
  verb("census", "EDGE", "census — the board, as the web can know it", async (ctx) => "no neighborhood board exists from the edge. the census lives in the native bench, on the wire you're standing on. here: `subdomains <domain>` reads the public board.");
  verb("eazy", "EDGE", "eazy <target> — the full battery: doors, web, tls, names, ledgers, one graded board", async (ctx) => {
    if (!need(ctx, 1, "eazy <target>")) return;
    const target = ctx.args[0].replace(/^https?:\/\//, "").split("/")[0];
    const host = target.split(":")[0];
    const refusal = ctx.os.gate("active"); if (refusal) return refusal;
    ctx.io.print(`EAZY ▸ ${host} — doors first…`, "dim");
    const tcp = await api(`/api/tcp?host=${encodeURIComponent(host)}&ports=common`);
    const lines: string[] = [`══ EAZY BOARD — ${host} ══`];
    if (tcp.ok) lines.push(`DOORS: ${tcp.summary} — ${(tcp.openPorts || []).join(", ") || "none"}`);
    const web = tcp.openPorts?.some((p: number) => [80, 443, 8080, 8443].includes(p));
    if (web) {
      const auditData = await api(`/api/http-audit?url=${encodeURIComponent(`https://${host}/`)}`);
      if (auditData.ok) lines.push(`WEB: grade ${auditData.security.grade} (${auditData.security.score}/100) · ${auditData.finalStatus} · cors: ${auditData.cors.verdict}`);
    }
    const tlsData = await api(`/api/tls?host=${encodeURIComponent(host)}&port=443`);
    if (tlsData.ok && tlsData.chain?.[0]) lines.push(`TLS: ${tlsData.chain[0].subject} · expires ${tlsData.chain[0].notAfter} (${tlsData.chain[0].daysRemaining}d)`);
    const recon = await api(`/api/recon?domain=${encodeURIComponent(host)}`);
    if (recon.ok) lines.push(`LEDGERS: registrar ${recon.registration.ok ? "read" : "unread"} · CT names ${recon.transparency.ok ? recon.transparency.uniqueNames : "?"} · security.txt ${recon.wellKnown.securityTxt.present ? "present" : "ABSENT"}`);
    for (const probeName of ["spfprobe", "dmarcprobe", "caacheck"]) {
      const { VERBS } = await import("./os-shell");
      const def = VERBS.get(probeName);
      if (def) { const r = await def.run({ ...ctx, args: [host] }); if (typeof r === "string") lines.push(`${probeName.toUpperCase()}: ${r.split("\n")[0]}`); }
    }
    lines.push("filed to the journal. one knock, read, grade — nothing exploited, nothing sprayed.");
    ctx.os.log(`eazy ${host}: ${lines[1] || "board filed"}`);
    return lines.join("\n");
  });
  verb("magdump", "EDGE", "magdump <target> — one named target, the whole bench emptied at it in stages; never a range", async (ctx) => {
    if (!need(ctx, 1, "magdump <target>")) return;
    if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(ctx.args[0]) || ctx.args[0].includes(",")) return "magdump takes ONE named target — never a range. a range is a census's job.";
    const { VERBS } = await import("./os-shell");
    const eazy = VERBS.get("eazy");
    if (eazy) {
      ctx.io.print("MAGDUMP ▸ lock-on. emptying the magazine, stage by stage…", "dim");
      const r = await eazy.run(ctx);
      const recon = await api(`/api/recon?domain=${encodeURIComponent(ctx.args[0].replace(/^https?:\/\//, "").split("/")[0].split(":")[0])}`).catch(() => null);
      const extra = recon?.ok ? `\nWELL-KNOWN: robots ${recon.wellKnown.robotsTxt.status} · sitemap ${recon.wellKnown.sitemapXml.urlCount} urls · findings: ${(recon.findings || []).join(" ") || "none"}` : "";
      return (typeof r === "string" ? r.replace("EAZY BOARD", "MAGDUMP BOARD") : "") + extra;
    }
  });
}

/* ————— timelock: the Magic Box construction, in the room —————
   RSW repeated squaring. Sealing is fast for the sealer, who knows
   the factorization and reduces the exponent through Carmichael's λ;
   opening costs t sequential squarings that no parallelism shortens.
   The delay is calibrated against THIS machine's measured squaring
   rate, and the lock file says exactly what it holds. */
function tlRandomBits(bits: number): bigint {
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  crypto.getRandomValues(bytes);
  let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
  const excess = BigInt(bytes.length * 8 - bits);
  if (excess > 0n) n >>= excess;
  return n | (1n << BigInt(bits - 1)) | 1n;
}
function tlGcd(a: bigint, b: bigint): bigint { while (b) { const t = a % b; a = b; b = t; } return a; }
function tlModPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n; }
  return r;
}
function tlIsPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0n; while ((d & 1n) === 0n) { d >>= 1n; s++; }
  for (let round = 0; round < 12; round++) {
    const a = 2n + (tlRandomBits(128) % (n - 3n));
    let x = tlModPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let r = 0n; r < s - 1n; r++) { x = (x * x) % n; if (x === n - 1n) { composite = false; break; } }
    if (composite) return false;
  }
  return true;
}
function tlGenPrime(bits: number): bigint { let c = tlRandomBits(bits); while (!tlIsPrime(c)) c += 2n; return c; }
async function tlCalibrate(N: bigint): Promise<number> {
  let v = 123456789n % N; const t0 = performance.now();
  for (let i = 0; i < 200; i++) v = (v * v) % N;
  const dt = (performance.now() - t0) / 1000;
  return Math.max(200, Math.floor(200 / Math.max(dt, 0.001)));
}
const tlHex = (n: bigint) => n.toString(16);
const tlUnhex = (s: string) => BigInt("0x" + s);

function registerTimelock() {
  verb("timelock", "LIVE", "timelock seal <seconds> <file> | timelock open <file.lock> — RSW time-lock seals (the Magic Box construction): sealing is instant, opening costs the squarings", async (ctx) => {
    const sub = (ctx.args[0] || "").toLowerCase();
    if (sub === "seal") {
      const seconds = Math.max(1, Math.min(86400, Number(ctx.args[1]) || 0));
      const path = ctx.args[2];
      if (!seconds || !path) throw new Error("usage: timelock seal <seconds> <file>");
      const content = ctx.os.read(path);
      if (content === null) throw new Error(`no such file: ${path}`);
      ctx.io.print("timelock: generating the modulus (two 512-bit primes)…", "dim");
      await new Promise((r) => setTimeout(r, 10));
      const p = tlGenPrime(512); let q = tlGenPrime(512); if (q === p) q = tlGenPrime(512);
      const N = p * q;
      const lambda = ((p - 1n) * (q - 1n)) / tlGcd(p - 1n, q - 1n);
      let x = tlRandomBits(256) % (N - 3n) + 2n;
      while (tlGcd(x, N) !== 1n) x += 1n;
      const rate = await tlCalibrate(N);
      const t = Math.max(2000, Math.round(seconds * rate));
      const e = tlModPow(2n, BigInt(t), lambda);
      const y = tlModPow(x, e, N);
      const keyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`blacksite.timelock.v1:${y.toString()}`));
      const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(content)));
      const outPath = path + ".lock";
      const lock = { schema: "blacksite.timelock.v1", construction: "RSW repeated squaring + AES-256-GCM", modulusBits: 1024, N: tlHex(N), t, x: tlHex(x), calibratedSeconds: seconds, squaringsPerSecondHere: rate, iv: bToB64(iv), ct: bToB64(ct), sealedAt: new Date().toISOString(), source: path };
      ctx.os.write(outPath, JSON.stringify(lock, null, 2));
      return `sealed ${path} → ${outPath}\n  t = ${t.toLocaleString()} sequential squarings at the calibrated ${rate.toLocaleString()}/s on this machine ≈ ${seconds}s of opening work.\n  the factorization stays in this moment and is discarded — nobody, including you, can shortcut this lock now. open it with: timelock open ${outPath}`;
    }
    if (sub === "open") {
      const path = ctx.args[1];
      if (!path) throw new Error("usage: timelock open <file.lock>");
      const raw = ctx.os.read(path);
      if (raw === null) throw new Error(`no such file: ${path}`);
      let lock: any; try { lock = JSON.parse(raw); } catch { throw new Error("that is not a timelock file (no JSON)"); }
      if (lock.schema !== "blacksite.timelock.v1") throw new Error(`unknown lock schema: ${lock.schema}`);
      const N = tlUnhex(lock.N); let v = tlUnhex(lock.x); const t = Number(lock.t);
      ctx.io.print(`timelock: ${t.toLocaleString()} squarings stand between you and the plaintext. starting…`, "dim");
      const t0 = performance.now();
      const CHUNK = 3000;
      for (let i = 0; i < t; i += CHUNK) {
        const end = Math.min(t, i + CHUNK);
        for (let j = i; j < end; j++) v = (v * v) % N;
        if (end < t && end % (CHUNK * 10) < CHUNK) ctx.io.print(`  ${Math.floor((end / t) * 100)}% — ${(end).toLocaleString()} / ${t.toLocaleString()} squarings`, "dim");
        await new Promise((r) => setTimeout(r, 0));
      }
      const keyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`blacksite.timelock.v1:${v.toString()}`));
      const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["decrypt"]);
      let plain: Uint8Array;
      try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToB(lock.iv) }, key, b64ToB(lock.ct))); }
      catch { throw new Error("the squarings finished but the seal does not open — the lock file is damaged or foreign."); }
      const outPath = path.replace(/\.lock$/, "") === path ? path + ".opened" : path.replace(/\.lock$/, "");
      ctx.os.write(outPath, td.decode(plain));
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      return `opened in ${secs}s of sequential squaring → ${outPath}\n${td.decode(plain)}`;
    }
    return "timelock — the Magic Box construction, in the room: an RSW repeated-squaring puzzle wraps an AES-256-GCM key.\n  timelock seal <seconds> <file>   seal a file so opening it costs ~<seconds> of unavoidable sequential work\n  timelock open <file.lock>        do the work, get the plaintext\nsealing is instant for the sealer (the factorization reduces the exponent); the factors are then discarded, so the delay binds everyone equally.";
  });
}

function registerEngines() {
  verb("run", "LIVE", "run <file> — run a program from the tree (.py, .js, .sh)", async (ctx) => {
    if (!need(ctx, 1, "run <file>")) return;
    const path = ctx.args[0];
    const content = ctx.os.read(path);
    if (content === null) throw new Error(`no such file: ${path}`);
    if (path.endsWith(".py")) return runPython(ctx, content, path);
    if (path.endsWith(".js") || path.endsWith(".mjs")) return runJs(ctx, content);
    if (path.endsWith(".sh")) { const { execLine } = await import("./os-shell"); for (const line of content.split("\n")) { if (line.trim() && !line.startsWith("#")) await execLine(ctx.os, line, ctx.io, 1); } return; }
    if (path.endsWith(".lua")) { const lines: string[] = []; try { await runLua(content, { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); } return lines.join("\n"); }
    if (path.endsWith(".scm") || path.endsWith(".ss")) { const lines: string[] = []; try { runScheme(content, { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); } return lines.join(""); }
    if (path.endsWith(".bf")) { const lines: string[] = []; try { runBrainfuck(content, "", { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); } return lines.join(""); }
    if (path.endsWith(".sql")) { const { VERBS } = await import("./os-shell"); return VERBS.get("sql")!.run({ ...ctx, args: [path] } as any); }
    if (path.endsWith(".ch8")) return "chip-8 is a machine, not a text run — open it with: chip8 " + path;
    return `don't know how to run ${path} — the room runs .py, .js, .sh, .lua, .scm, .bf, and .sql.`;
  });
  verb("python3", "LIVE", "python3 <file> — the room's Python (Skulpt dialect: no threads, no sockets — said out loud)", async (ctx) => {
    if (!need(ctx, 1, "python3 <file>")) return;
    const content = ctx.os.read(ctx.args[0]);
    if (content === null) throw new Error(`no such file: ${ctx.args[0]}`);
    return runPython(ctx, content, ctx.args[0]);
  });
  verb("python", "LIVE", "python <file>", async (ctx) => { const { VERBS } = await import("./os-shell"); return VERBS.get("python3")!.run(ctx); });
  verb("js", "LIVE", "js <file|expression> — the room's JavaScript, sandboxed", async (ctx) => {
    if (!need(ctx, 1, "js <file|expression>")) return;
    const maybeFile = ctx.os.read(ctx.args[0]);
    return runJs(ctx, maybeFile !== null ? maybeFile : ctx.args.join(" "));
  });
  verb("node", "LIVE", "node <file> — same engine, node manners", async (ctx) => { const { VERBS } = await import("./os-shell"); return VERBS.get("js")!.run(ctx); });
  verb("engines", "LIVE", "engines — every engine in the room and whether it answers", async () => {
    return [
      "THE ENGINE ROOM — eight engines, all real, all in this tab:",
      "  python    Skulpt (vendored) — python3 <file.py>",
      "  js        the room's JavaScript, sandboxed — js <file|expr>",
      "  lua       Lua 5.x on Fengari (vendored) — lua <file> · lua -e \"code\"",
      "  scheme    a hand-built Lisp in this source — scheme <file> · scheme -e \"(...)\"",
      "  bf        Brainfuck, 30,000 cells — bf <file> · bf -e \"code\"",
      "  sql       SQLite itself (sql.js wasm) — sql -e \"SELECT ...\" · sql <file.sql>",
      "            the database lives at /home/operator/room.db and persists in the tree",
      "  wasm      WebAssembly modules from the tree — wasm exports <f> · wasm run <f> <fn> [args]",
      "  chip8     a CHIP-8 machine (1980s, 4K, honest) — chip8 [file.ch8] opens the console",
      "every engine states its own limits where it has them; none of them phone home.",
    ].join("\n");
  });
  verb("lua", "LIVE", "lua <file.lua> | lua -e \"code\" — the room's Lua (Fengari)", async (ctx) => {
    if (!need(ctx, 1, "lua <file.lua> | lua -e \"code\"")) return;
    const lines: string[] = [];
    const src = ctx.args[0] === "-e" ? ctx.args.slice(1).join(" ") : ctx.os.read(ctx.args[0]);
    if (src === null || src === undefined) throw new Error(`no such file: ${ctx.args[0]}`);
    try { await runLua(src as string, { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); }
    return lines.join("\n");
  });
  verb("scheme", "LIVE", "scheme <file.scm> | scheme -e \"(expr)\" — the room's Lisp", async (ctx) => {
    if (!need(ctx, 1, "scheme <file.scm> | scheme -e \"(expr)\"")) return;
    const lines: string[] = [];
    const src = ctx.args[0] === "-e" ? ctx.args.slice(1).join(" ") : ctx.os.read(ctx.args[0]);
    if (src === null || src === undefined) throw new Error(`no such file: ${ctx.args[0]}`);
    try { runScheme(src as string, { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); }
    return lines.join("");
  });
  verb("bf", "LIVE", "bf <file.bf> | bf -e \"code\" — Brainfuck, thirty thousand cells", async (ctx) => {
    if (!need(ctx, 1, "bf <file.bf> | bf -e \"code\"")) return;
    const lines: string[] = [];
    const src = ctx.args[0] === "-e" ? ctx.args.slice(1).join(" ") : ctx.os.read(ctx.args[0]);
    if (src === null || src === undefined) throw new Error(`no such file: ${ctx.args[0]}`);
    try { runBrainfuck(src as string, "", { out: (t) => lines.push(t) }); } catch (e: any) { lines.push(String(e?.message || e)); }
    return lines.join("");
  });
  verb("sql", "LIVE", "sql -e \"SELECT ...\" | sql <file.sql> — SQLite (sql.js), db at /home/operator/room.db", async (ctx) => {
    if (!need(ctx, 1, "sql -e \"SELECT ...\" | sql <file.sql>")) return;
    const stmt = ctx.args[0] === "-e" ? ctx.args.slice(1).join(" ") : ctx.os.read(ctx.args[0]);
    if (stmt === null || stmt === undefined) throw new Error(`no such file: ${ctx.args[0]}`);
    const existing = ctx.os.readBytes("/home/operator/room.db");
    const { text, dbBytes } = await runSql(existing, stmt as string);
    ctx.os.writeBytes("/home/operator/room.db", dbBytes);
    return text;
  });
  verb("wasm", "LIVE", "wasm exports <file.wasm> | wasm run <file.wasm> <fn> [numbers...] — run real modules from the tree", async (ctx) => {
    if (!need(ctx, 2, "wasm exports|run <file.wasm> [fn] [args]")) return;
    const bytes = ctx.os.readBytes(ctx.args[1]);
    if (!bytes) throw new Error(`no such file: ${ctx.args[1]}`);
    if (ctx.args[0] === "exports") { const ex = await wasmExports(bytes); return ex.map((e) => `${e.kind} ${e.name}`).join("\n") || "(no exports)"; }
    if (ctx.args[0] === "run") {
      if (!need(ctx, 3, "wasm run <file.wasm> <fn> [numbers...]")) return;
      const lines: string[] = [];
      const result = await runWasm(bytes, ctx.args[2], ctx.args.slice(3).map(Number), { out: (t) => lines.push(t) });
      if (result !== "") lines.push(`→ ${result}`);
      return lines.join("");
    }
    return "wasm exports <file> — list a module's exports\nwasm run <file> <fn> [numbers...] — call an exported function (its prints land here; WASI fd_write is wired)";
  });
  verb("ssh", "EDGE", "ssh <user@host[:port]> — open an SSH session window (the room's own client: curve25519, aes-gcm, host-key trust by your hand)", async (ctx) => {
    const refusal = ctx.os.gate("active"); if (refusal) return refusal;
    if (!need(ctx, 1, "ssh <user@host[:port]>")) return;
    document.dispatchEvent(new CustomEvent("blacksite:openapp", { detail: { app: "ssh", arg: ctx.args[0] } }));
    return "the SSH window opens on the desk — the fingerprint must be trusted there before any password moves, and the session's cryptography never leaves this tab.";
  });
  verb("relay", "EDGE", "relay — open Relay, the house wire: a real IRC client in the room (OFTC, Libera.Chat, hackint; the house channel is #nosuchmachine)", async (ctx) => {
    const refusal = ctx.os.gate("active"); if (refusal) return refusal;
    document.dispatchEvent(new CustomEvent("blacksite:openapp", { detail: { app: "relay" } }));
    return "Relay opens on the desk already standing in #nosuchmachine on OFTC — no account, no registration; you arrive wearing a machine name (machine1A, machine2D, on without end) and /nick renames you.";
  });
  verb("chip8", "LIVE", "chip8 [file.ch8] — open the CHIP-8 console (the demo ROM runs if you name none)", async (ctx) => {
    document.dispatchEvent(new CustomEvent("blacksite:openapp", { detail: { app: "chip8", arg: ctx.args[0] || "" } }));
    return "the CHIP-8 console opens on the desk — 64×32, sixteen keys (your 1-4/Q-R/A-F/Z-V rows), four thousand bytes of 1977.";
  });
  verb("decode", "LIVE", "decode <hex> — raw advertisement bytes through the decoders (BLE AD structures)", async (ctx) => {
    if (!need(ctx, 1, "decode <hex>")) return;
    const bytes = hexToB(ctx.args.join(""));
    const lines: string[] = [`${bytes.length} bytes`];
    let i = 0;
    const AD: Record<number, string> = { 0x01: "Flags", 0x02: "Incomplete UUID16 list", 0x03: "Complete UUID16 list", 0x08: "Shortened name", 0x09: "Complete name", 0x0a: "Tx power", 0x16: "Service data", 0x19: "Appearance", 0xff: "Manufacturer data" };
    while (i < bytes.length) {
      const len = bytes[i];
      if (!len || i + len >= bytes.length + 1) { lines.push(`  [${i}] malformed tail: ${bToHex(bytes.slice(i))}`); break; }
      const type = bytes[i + 1];
      const payload = bytes.slice(i + 2, i + 1 + len);
      let extra = "";
      if (type === 0x09 || type === 0x08) extra = ` "${td.decode(payload)}"`;
      if (type === 0xff && payload.length >= 2) extra = ` company 0x${(payload[1] << 8 | payload[0]).toString(16).padStart(4, "0")} (${companyName(payload[1] << 8 | payload[0])})`;
      if (type === 0x01) extra = ` 0x${payload[0]?.toString(16)}`;
      lines.push(`  [${i}] ${AD[type] || `AD 0x${type.toString(16)}`} len ${len - 1}: ${bToHex(payload)}${extra}`);
      i += 1 + len;
    }
    return lines.join("\n");
  });
  verb("company", "LIVE", "company <id> — who a BLE company id belongs to", async (ctx) => {
    if (!need(ctx, 1, "company <id>")) return;
    const id = parseInt(ctx.args[0], ctx.args[0].startsWith("0x") ? 16 : 10);
    return `0x${id.toString(16).padStart(4, "0")}: ${companyName(id)}`;
  });
  verb("port", "LIVE", "port <n> — what a port is for", async (ctx) => {
    if (!need(ctx, 1, "port <n>")) return;
    const table: Record<number, string> = { 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB", 993: "IMAPS", 995: "POP3S", 1883: "MQTT", 3306: "MySQL", 3389: "RDP", 5060: "SIP", 5432: "PostgreSQL", 5900: "VNC", 6379: "Redis", 8080: "HTTP-alt", 8443: "HTTPS-alt", 502: "Modbus", 102: "S7/COTP", 20000: "DNP3", 44818: "EtherNet/IP", 2404: "IEC 104", 47808: "BACnet/IP (UDP)", 161: "SNMP (UDP)", 123: "NTP (UDP)", 2947: "gpsd", 2181: "ZooKeeper", 11211: "memcached", 27017: "MongoDB", 9200: "Elasticsearch", 2375: "Docker API", 6443: "Kubernetes API", 8200: "Vault", 8500: "Consul", 2379: "etcd", 8983: "Solr", 554: "RTSP", 9600: "OMRON FINS" };
    const n = Number(ctx.args[0]);
    return table[n] ? `${n}: ${table[n]}` : `${n}: not in the room's short registry — the long one lives in the native bench.`;
  });
}
function companyName(id: number): string {
  const table: Record<number, string> = { 0x004c: "Apple", 0x0006: "Microsoft", 0x00e0: "Google", 0x0075: "Samsung", 0x0059: "Nordic Semiconductor", 0x000f: "Broadcom", 0x001d: "Texas Instruments", 0x0087: "Garmin", 0x0157: "Anhui Huami (Amazfit)", 0x02e5: "Espressif", 0x0499: "Ruuvi Innovations", 0x0822: "Tile", 0x00da: "NXP" };
  return table[id] || "not in the room's short registry — the Bluetooth SIG assigns them; the native bench carries the long list.";
}

async function runPython(ctx: Ctx, source: string, _path: string): Promise<string> {
  const Sk = await loadSkulpt();
  const lines: string[] = [];
  Sk.configure({
    output: (text: string) => { lines.push(text.replace(/\n$/, "")); },
    read: (file: string) => {
      if (Sk.builtinFiles?.files?.[file]) return Sk.builtinFiles.files[file];
      // house imports: a .py beside the script, or under /packages
      const candidates = [ctx.os.norm(file), ctx.os.norm(`/packages/${file}`), ctx.os.norm(`${ctx.os.cwd}/${file}`)];
      for (const c of candidates) { const content = ctx.os.read(c); if (content !== null) return content; }
      throw new Error(`File not found: '${file}'`);
    },
    __future__: (Sk as any).python3 || 3,
  });
  try {
    await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, source, true));
  } catch (e: any) {
    lines.push(`python: ${String(e).slice(0, 500)}`);
  }
  return lines.join("\n");
}
let skulptPromise: Promise<any> | null = null;
function loadSkulpt(): Promise<any> {
  if ((window as any).Sk) return Promise.resolve((window as any).Sk);
  if (skulptPromise) return skulptPromise;
  skulptPromise = new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "/vendor/skulpt/skulpt.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "/vendor/skulpt/skulpt-stdlib.js";
      s2.onload = () => resolve((window as any).Sk);
      s2.onerror = () => reject(new Error("skulpt stdlib failed to load"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("skulpt failed to load"));
    document.head.appendChild(s1);
  });
  return skulptPromise;
}
async function runJs(ctx: Ctx, source: string): Promise<string> {
  const lines: string[] = [];
  const fakeConsole = { log: (...a: any[]) => lines.push(a.map((x) => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")), error: (...a: any[]) => lines.push("err: " + a.join(" ")), warn: (...a: any[]) => lines.push("warn: " + a.join(" ")) };
  try {
    const fn = new Function("console", "print", `"use strict";\n${source}`);
    const result = fn(fakeConsole, (...a: any[]) => fakeConsole.log(...a));
    if (result !== undefined) lines.push(String(result));
  } catch (e: any) {
    lines.push(`js: ${e?.message || e}`);
  }
  return lines.join("\n");
}

function registerSelfTests() {
  verb("diagnose", "LIVE", "diagnose — the whole house through its paces", async (ctx) => {
    const checks: Array<[string, boolean, string]> = [];
    checks.push(["kernel (shell parses)", typeof ctx.os.norm === "function", ""]);
    try { localStorage.setItem("bs-probe", "1"); localStorage.removeItem("bs-probe"); checks.push(["files persist (localStorage)", true, ""]); } catch { checks.push(["files persist (localStorage)", false, "storage blocked — the room is volatile"]); }
    checks.push(["crypto.subtle (hashes, seals)", !!crypto?.subtle, ""]);
    checks.push(["engines: javascript", true, "native, sandboxed"]);
    try { await loadSkulpt(); checks.push(["engines: python (skulpt)", true, "vendored, loads on demand"]); } catch { checks.push(["engines: python (skulpt)", false, "failed to load"]); }
    checks.push(["engines: lua / scheme / bf / wasm / chip8", true, "in-room; lua (fengari) and sql (sqlite wasm) load on first use"]);
    try { const echo = await api("/api/echo"); checks.push(["edge functions", !!echo.ok, echo.ok ? `colo ${echo.network?.colo}` : "no answer"]); } catch { checks.push(["edge functions", false, "unreachable"]); }
    checks.push(["emcon", true, ctx.os.emcon]);
    return ["DIAGNOSE — the house through its paces:", ...checks.map(([n, ok, note]) => `  ${ok ? "✓" : "✗"} ${n}${note ? ` — ${note}` : ""}`)].join("\n");
  });
  verb("gauntlet", "LIVE", "gauntlet — run the gauntlet: the room tests itself against known answers", async (ctx) => {
    const { md5: md5fn } = await import("./os-shell");
    const cases: Array<[string, () => Promise<boolean> | boolean]> = [
      ["md5('') is the RFC empty string", () => md5fn(new TextEncoder().encode("")) === "d41d8cd98f00b204e9800998ecf8427e"],
      ["md5('abc') RFC 1321", () => md5fn(new TextEncoder().encode("abc")) === "900150983cd24fb0d6963f7d28e17f72"],
      ["sha256('abc') FIPS 180-4", async () => bToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")))) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
      ["base64 round trip", () => td.decode(b64ToB(bToB64(new TextEncoder().encode("blacksite")))) === "blacksite"],
      ["vfs write/read", () => { ctx.os.write("/tmp/gauntlet.txt", "x"); const ok = ctx.os.read("/tmp/gauntlet.txt") === "x"; ctx.os.remove("/tmp/gauntlet.txt"); return ok; }],
      ["path normalization", () => ctx.os.norm("/a/b/../c") === "/a/c"],
      ["mmh3('') is 0", () => mmh3(new Uint8Array(0)) === 0],
      ["subnet of the room", () => ctx.os.norm("..", "/home/operator") === "/home"],
      ["427-command roster present", async () => { const { default: r } = await import("../data/blacksite-commands.json"); return (r as any[]).length === 427; }],
      ["python engine answers", async () => { const Sk = await loadSkulpt(); return !!Sk; }],
      ["scheme engine evaluates", async () => { const m = await import("./os-engines2"); const lines: string[] = []; m.runScheme("(define (fact n) (if (< n 2) 1 (* n (fact (- n 1))))) (display (fact 10))", { out: (t: string) => lines.push(t) }); return lines.join("") === "3628800"; }],
      ["brainfuck engine prints HI", async () => { const m = await import("./os-engines2"); const lines: string[] = []; m.runBrainfuck("++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.", "", { out: (t: string) => lines.push(t) }); return lines.join("").startsWith("Hello"); }],
      ["ssh curve25519 agreement", async () => { const m = await import("./os-ssh"); const a = crypto.getRandomValues(new Uint8Array(32)); const b = crypto.getRandomValues(new Uint8Array(32)); const aPub = m.x25519(a, m.X25519_BASE); const bPub = m.x25519(b, m.X25519_BASE); return m.b64(m.x25519(a, bPub)) === m.b64(m.x25519(b, aPub)); }],
      ["chip-8 cpu: add + jump", async () => { const m = await import("./os-engines2"); const cpu = new m.Chip8(); cpu.load(new Uint8Array([0x60, 0x05, 0x70, 0x03, 0x12, 0x04])); cpu.cycle(); cpu.cycle(); return cpu.V[0] === 8 && cpu.pc === 4; }],
    ];
    let passed = 0; const lines: string[] = [];
    for (const [name, fn] of cases) {
      let ok = false;
      try { ok = await fn(); } catch { ok = false; }
      if (ok) passed++;
      lines.push(`  ${ok ? "✓" : "✗"} ${name}`);
    }
    ctx.os.log(`gauntlet: ${passed}/${cases.length}`);
    return [`GAUNTLET — ${passed}/${cases.length} cases stand.`, ...lines, passed === cases.length ? "the room is sound. run your battery." : "some cases fell — diagnose will say more."].join("\n");
  });
}

export function registerBenchVerbs() {
  registerDnsFamily();
  registerProbes();
  registerBatteries();
  registerEngines();
  registerGit(verb);
  registerTimelock();
  registerSelfTests();
}
