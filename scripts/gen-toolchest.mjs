#!/usr/bin/env node
/* TOOLCHEST dataset generator — builds the lazy registry files under
 * public/toolchest/ that the toolchest verbs and app read on first use.
 *
 * Provenance: ports/ciphers/protocols are the IANA registries, mime is
 * mime-db, zones/countries/currencies/languages come from this node's
 * own Intl data, and http/dnstypes/magic/signals/errno are curated
 * tables authored in this file from the stable standards (RFC 9110,
 * RFC 1035 + friends, POSIX, Linux errno.h). Run: node scripts/gen-toolchest.mjs
 * The site build does NOT run this — the JSON is committed.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../public/toolchest/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const counts = {};
function emit(name, rows) {
  writeFileSync(new URL(name, OUT), JSON.stringify(rows));
  counts[name] = rows.length;
  console.log(`${name}: ${rows.length} rows`);
}
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}
/* small CSV reader: quotes, embedded commas and newlines */
function csv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const clean = (s) => (s || "").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();

/* ---------- ports: IANA service names / port numbers ---------- */
{
  const rows = csv(await get("https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv"));
  const head = rows[0].map((h) => h.trim());
  const iName = head.indexOf("Service Name"), iPort = head.indexOf("Port Number"), iProto = head.indexOf("Transport Protocol"), iDesc = head.indexOf("Description");
  const seen = new Set(); const out = [];
  const push = (port, proto, name, desc) => {
    const k = `${port}|${proto}|${name}|${desc}`;
    if (seen.has(k)) return; seen.add(k); out.push([port, proto, name, desc]);
  };
  for (const r of rows.slice(1)) {
    const name = (r[iName] || "").trim(); if (!name) continue;
    const proto = (r[iProto] || "").trim().toLowerCase(); if (!proto) continue;
    const desc = clean(r[iDesc]);
    const p = (r[iPort] || "").trim();
    const range = p.match(/^(\d+)-(\d+)$/);
    if (/^\d+$/.test(p)) push(Number(p), proto, name, desc);
    else if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      if (b - a <= 64) for (let n = a; n <= b; n++) push(n, proto, name, desc);
    }
  }
  out.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]));
  emit("ports.json", out);
}

/* ---------- ciphers: IANA TLS cipher suites ---------- */
{
  const rows = csv(await get("https://www.iana.org/assignments/tls-parameters/tls-parameters-4.csv"));
  const out = [];
  for (const r of rows.slice(1)) {
    const value = (r[0] || "").trim(), desc = clean(r[1]);
    if (!/^0x[0-9A-Fa-f]{2},0x[0-9A-Fa-f]{2}$/.test(value)) continue;
    if (!desc || /unassigned|reserved/i.test(desc)) continue;
    out.push([value, desc]);
  }
  emit("ciphers.json", out);
}

/* ---------- protocols: IANA protocol numbers ---------- */
{
  const rows = csv(await get("https://www.iana.org/assignments/protocol-numbers/protocol-numbers-1.csv"));
  const out = [];
  for (const r of rows.slice(1)) {
    if (!/^\d+$/.test((r[0] || "").trim())) continue;
    out.push([Number(r[0]), (r[1] || "").trim(), clean(r[2])]);
  }
  out.sort((a, b) => a[0] - b[0]);
  emit("protocols.json", out);
}

/* ---------- mime: mime-db ---------- */
{
  const db = JSON.parse(await get("https://cdn.jsdelivr.net/npm/mime-db@1.54.0/db.json"));
  const out = [];
  for (const [type, v] of Object.entries(db)) {
    if (!v.extensions || !v.extensions.length) continue;
    out.push([type, v.extensions, v.compressible ? 1 : 0]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]));
  emit("mime.json", out);
}

/* ---------- Intl-derived registries ---------- */
{
  const tz = [];
  for (const z of Intl.supportedValuesOf("timeZone")) {
    let off = "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" }).formatToParts();
      off = (parts.find((p) => p.type === "timeZoneName") || {}).value || "";
    } catch { /* zone stays bare */ }
    tz.push([z, off]);
  }
  emit("tz.json", tz);
  const dn = (type) => new Intl.DisplayNames(["en"], { type });
  /* ISO 3166-1 alpha-2 — supportedValuesOf has no region key, so the
   * code list is embedded and the names come from Intl. */
  const ISO_CC = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";
  const regions = dn("region"), out1 = [];
  for (const c of ISO_CC.split(" ")) {
    try { const n = regions.of(c); if (n && n !== c) out1.push([c, n]); } catch { /* skip */ }
  }
  emit("countries.json", out1);
  const curs = dn("currency"), out2 = [];
  for (const c of Intl.supportedValuesOf("currency")) {
    try { const n = curs.of(c); if (n && n !== c) out2.push([c, n]); } catch { /* skip */ }
  }
  emit("currencies.json", out2);
  /* ISO 639-1 — same story: the list is embedded, names from Intl. */
  const ISO_LANG = "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu";
  const langs = dn("language"), out3 = [];
  for (const c of ISO_LANG.split(" ")) {
    try { const n = langs.of(c); if (n && n !== c) out3.push([c, n]); } catch { /* skip */ }
  }
  emit("languages.json", out3);
}

/* ---------- curated: HTTP status codes (RFC 9110 + registry) ---------- */
{
  const H = (code, phrase, mean) => [code, phrase, mean];
  emit("http.json", [
    H(100, "Continue", "the server has the headers; send the body"),
    H(101, "Switching Protocols", "the server agrees to change protocol, e.g. to WebSocket"),
    H(102, "Processing", "WebDAV: received and still working on it"),
    H(103, "Early Hints", "headers sent early so the browser can preload while the server thinks"),
    H(200, "OK", "the request worked"),
    H(201, "Created", "a new resource was created — check Location"),
    H(202, "Accepted", "queued for later processing, not done yet"),
    H(203, "Non-Authoritative Information", "a proxy rewrote the response headers on the way through"),
    H(204, "No Content", "worked, and there is no body to show"),
    H(205, "Reset Content", "worked; clear the form or view that sent the request"),
    H(206, "Partial Content", "one range of the resource, as asked"),
    H(207, "Multi-Status", "WebDAV: several sub-results in one XML body"),
    H(208, "Already Reported", "WebDAV: these members were already listed in this response"),
    H(226, "IM Used", "the body is a delta against a stored instance"),
    H(300, "Multiple Choices", "several representations; pick one"),
    H(301, "Moved Permanently", "the resource lives at the new URL now — update the link"),
    H(302, "Found", "temporarily elsewhere; keep using the original URL"),
    H(303, "See Other", "go look at the other URL, with a GET"),
    H(304, "Not Modified", "your cached copy is still good"),
    H(305, "Use Proxy", "deprecated: reach it through the named proxy"),
    H(307, "Temporary Redirect", "temporarily elsewhere; same method, same body"),
    H(308, "Permanent Redirect", "permanently elsewhere; same method, same body"),
    H(400, "Bad Request", "the server could not understand the request"),
    H(401, "Unauthorized", "authenticate first — the name lies, it means unauthenticated"),
    H(402, "Payment Required", "reserved; some APIs use it for billing walls"),
    H(403, "Forbidden", "you may not have this, and logging in will not change it"),
    H(404, "Not Found", "nothing lives at this URL"),
    H(405, "Method Not Allowed", "that verb is not allowed here — see Allow"),
    H(406, "Not Acceptable", "no representation matches your Accept headers"),
    H(407, "Proxy Authentication Required", "authenticate with the proxy first"),
    H(408, "Request Timeout", "you took too long sending the request"),
    H(409, "Conflict", "the request fights the resource's current state"),
    H(410, "Gone", "deliberately and permanently removed"),
    H(411, "Length Required", "a Content-Length header is required"),
    H(412, "Precondition Failed", "an If- condition you set did not hold"),
    H(413, "Content Too Large", "the body is bigger than the server accepts"),
    H(414, "URI Too Long", "the URL is longer than the server will read"),
    H(415, "Unsupported Media Type", "the server cannot read that body format"),
    H(416, "Range Not Satisfiable", "the requested range lies outside the resource"),
    H(417, "Expectation Failed", "the Expect header could not be met"),
    H(418, "I'm a Teapot", "an April Fools' RFC relic that refused to die"),
    H(421, "Misdirected Request", "this server is not authoritative for that host"),
    H(422, "Unprocessable Content", "well-formed, but semantically wrong"),
    H(423, "Locked", "WebDAV: the resource is locked"),
    H(424, "Failed Dependency", "WebDAV: a method this one depended on failed"),
    H(425, "Too Early", "the server will not risk replaying an early request"),
    H(426, "Upgrade Required", "switch protocol first, then ask again"),
    H(428, "Precondition Required", "send conditional headers so updates cannot be lost"),
    H(429, "Too Many Requests", "rate limited — slow down, see Retry-After"),
    H(431, "Request Header Fields Too Large", "the headers are bigger than the server accepts"),
    H(451, "Unavailable For Legal Reasons", "blocked for legal reasons"),
    H(500, "Internal Server Error", "the server broke on its own side"),
    H(501, "Not Implemented", "the server does not know that method or function"),
    H(502, "Bad Gateway", "the upstream behind the gateway answered nonsense"),
    H(503, "Service Unavailable", "down, overloaded, or in maintenance — may be brief"),
    H(504, "Gateway Timeout", "the upstream behind the gateway never answered"),
    H(505, "HTTP Version Not Supported", "that HTTP version is not spoken here"),
    H(507, "Insufficient Storage", "WebDAV: no room to store the result"),
    H(508, "Loop Detected", "WebDAV: an infinite loop in the request graph"),
    H(510, "Not Extended", "the required extensions were not sent"),
    H(511, "Network Authentication Required", "a captive portal wants a login first"),
  ]);
}

/* ---------- curated: DNS record types ---------- */
{
  const D = (type, desc) => [type, desc];
  emit("dnstypes.json", [
    D("A", "IPv4 address of the host"),
    D("AAAA", "IPv6 address of the host"),
    D("AFSDB", "location of an AFS cell database server"),
    D("APL", "address prefix list — ranges for policy and ACLs"),
    D("CAA", "which certificate authorities may issue for the name"),
    D("CDNSKEY", "child-side DNSKEY, for a parent to copy into a DS"),
    D("CDS", "child-side DS, for a parent to copy"),
    D("CERT", "a certificate or CRL stored in DNS"),
    D("CNAME", "canonical name — this name is an alias of that one"),
    D("CSYNC", "tells a parent which child records to copy wholesale"),
    D("DLV", "a DNSSEC lookaside validation anchor (largely historic)"),
    D("DNAME", "delegates a whole subtree to another name"),
    D("DNSKEY", "the public key that signs the zone"),
    D("DS", "delegation signer — the hash of a child DNSKEY, chain of trust"),
    D("EUI48", "a 48-bit EUI address, published in DNS"),
    D("EUI64", "a 64-bit EUI address, published in DNS"),
    D("HINFO", "host hardware and OS hints (mostly historic)"),
    D("HTTPS", "service binding with HTTP hints — ports, ALPN, ECH"),
    D("IPSECKEY", "a public key for IPsec, in DNS"),
    D("KEY", "a generic public key record (historic, pre-DNSKEY)"),
    D("KX", "a key exchange host, like MX for non-mail services"),
    D("LOC", "geographic coordinates of a host or place"),
    D("MX", "a mail exchanger, with preference"),
    D("NAPTR", "naming authority pointer — rewrite rules for URIs and ENUM"),
    D("NS", "an authoritative name server for the zone"),
    D("NSEC", "proves a name does not exist; walks the signed zone"),
    D("NSEC3", "proves non-existence with hashed names, against zone walking"),
    D("NSEC3PARAM", "the hash parameters NSEC3 uses"),
    D("NULL", "an experimental placeholder carrying arbitrary data"),
    D("OPENPGPKEY", "an OpenPGP public key for a mail address"),
    D("OPT", "EDNS pseudo-record: bigger UDP, DNSSEC flags, options"),
    D("PTR", "pointer — the name for an address, the reverse lookup"),
    D("RRSIG", "the signature over a record set"),
    D("RP", "the responsible person's mailbox for this name"),
    D("SIG", "a signature record (historic, pre-RRSIG)"),
    D("SMIMEA", "binds an S/MIME certificate to a mail address (DANE)"),
    D("SOA", "start of authority — the zone's own ledger and timers"),
    D("SRV", "service location: host, port, priority, weight"),
    D("SSHFP", "an SSH host key fingerprint, so the first connect can verify"),
    D("SVCB", "service binding — the general form HTTPS specialises"),
    D("TA", "a trust anchor (historic, unmanaged)"),
    D("TKEY", "a shared secret established for transaction signing"),
    D("TLSA", "binds a TLS certificate to the name (DANE)"),
    D("TSIG", "a transaction signature pseudo-record — signed DNS messages"),
    D("TXT", "text: SPF policy, verification tokens, anything human or machine"),
    D("URI", "a URI for the name, with priority and weight"),
    D("ZONEMD", "a digest of the whole zone, for verifying transfers"),
  ]);
}

/* ---------- curated: file magic — [hex prefix (?? = any byte), extension, what it is] ---------- */
{
  const M = (hex, ext, desc) => [hex, ext, desc];
  emit("magic.json", [
    M("89504e470d0a1a0a", "png", "PNG image"),
    M("ffd8ffe0", "jpg", "JPEG image (JFIF)"),
    M("ffd8ffe1", "jpg", "JPEG image (Exif)"),
    M("ffd8ffdb", "jpg", "JPEG image (raw)"),
    M("474946383761", "gif", "GIF image (87a)"),
    M("474946383961", "gif", "GIF image (89a)"),
    M("25504446", "pdf", "PDF document"),
    M("504b0304", "zip", "ZIP archive — also jar, docx, xlsx, apk, epub"),
    M("504b0506", "zip", "ZIP archive (empty)"),
    M("504b0708", "zip", "ZIP archive (spanned)"),
    M("1f8b", "gz", "gzip compressed data"),
    M("425a68", "bz2", "bzip2 compressed data"),
    M("fd377a585a00", "xz", "XZ compressed data"),
    M("28b52ffd", "zst", "Zstandard frame"),
    M("377abcaf271c", "7z", "7-Zip archive"),
    M("526172211a0700", "rar", "RAR archive (v4)"),
    M("526172211a070100", "rar", "RAR archive (v5)"),
    M("04224d18", "lz4", "LZ4 frame"),
    M("213c617263683e", "ar", "ar archive — also .deb packages"),
    M("edabeedb", "rpm", "RPM package"),
    M("4d534346", "cab", "Microsoft Cabinet archive"),
    M("7f454c46", "elf", "ELF executable or shared object (Linux/Unix)"),
    M("feedface", "macho", "Mach-O binary (32-bit, big-endian order)"),
    M("feedfacf", "macho", "Mach-O binary (64-bit, big-endian order)"),
    M("cefaedfe", "macho", "Mach-O binary (32-bit, little-endian order)"),
    M("cffaedfe", "macho", "Mach-O binary (64-bit, little-endian order)"),
    M("cafebabe", "class", "Java class file — also Mach-O fat binaries share this magic"),
    M("4d5a", "exe", "DOS/Windows executable (MZ)"),
    M("0061736d", "wasm", "WebAssembly module"),
    M("53514c69746520666f726d6174203300", "sqlite", "SQLite 3 database"),
    M("00000100", "ico", "Windows icon"),
    M("00000200", "cur", "Windows cursor"),
    M("424d", "bmp", "BMP bitmap image"),
    M("49492a00", "tiff", "TIFF image (little-endian)"),
    M("4d4d002a", "tiff", "TIFF image (big-endian)"),
    M("52494646????????57454250", "webp", "WebP image (RIFF container)"),
    M("52494646????????57415645", "wav", "WAV audio (RIFF container)"),
    M("52494646????????41564920", "avi", "AVI video (RIFF container)"),
    M("494433", "mp3", "MP3 audio with an ID3 tag"),
    M("fffb", "mp3", "MP3 audio frame"),
    M("664c6143", "flac", "FLAC lossless audio"),
    M("4f676753", "ogg", "Ogg container — Vorbis, Opus, or Theora"),
    M("4d546864", "mid", "MIDI song file"),
    M("38425053", "psd", "Adobe Photoshop document"),
    M("252150532d41646f62652d", "eps", "Encapsulated PostScript"),
    M("????????6674797069736f6d", "mp4", "MP4 video (ISO media, isom brand)"),
    M("????????667479704d344120", "m4a", "M4A audio"),
    M("????????6674797071742020", "mov", "QuickTime movie"),
    M("????????6674797068656963", "heic", "HEIC image (HEIF)"),
    M("????????6674797061766966", "avif", "AVIF image"),
    M("0000000c6a5020200d0a870a", "jp2", "JPEG 2000 image"),
    M("1a45dfa3", "mkv", "Matroska container — MKV or WebM"),
    M("464c5601", "flv", "Flash Video"),
    M("3026b2758e66cf11", "asf", "ASF container — WMV/WMA"),
    M("2e524d46", "rm", "RealMedia file"),
    M("d0cf11e0a1b11ae1", "ole", "OLE compound document — old Office .doc/.xls/.ppt"),
    M("774f4646", "woff", "WOFF web font"),
    M("774f4632", "woff2", "WOFF2 web font"),
    M("0001000000100080", "ttf", "TrueType font (common header)"),
    M("4f54544f", "otf", "OpenType font (CFF outlines)"),
    M("74727565", "ttc", "TrueType font collection"),
    M("64383a616e6e6f756e6365", "torrent", "BitTorrent metainfo file"),
    M("4c00000001140200", "lnk", "Windows shortcut"),
    M("52454745444954", "reg", "Windows Registry editor file"),
    M("2321", "sh", "a script with a shebang line"),
    M("50415231", "parquet", "Apache Parquet data file (head)"),
    M("4f5243", "orc", "Apache ORC data file"),
    M("d4c3b2a1", "pcap", "pcap capture (little-endian)"),
    M("a1b2c3d4", "pcap", "pcap capture (big-endian)"),
    M("0a0d0d0a", "pcapng", "pcapng capture"),
    M("3082", "der", "DER-encoded certificate or key (ASN.1 SEQUENCE)"),
    M("2d2d2d2d2d424547494e", "pem", "PEM-encoded certificate or key"),
    M("4b444d", "dmg", "Apple disk image (kDMG)"),
    M("5858454e", "xbe", "Xbox executable"),
    M("2321414d52", "amr", "AMR voice audio"),
    M("2e736e64", "au", "Sun/NeXT audio (au/snd)"),
    M("464f524d????????41494646", "aiff", "AIFF audio (FORM container)"),
    M("7573746172", "tar", "tar archive signature at offset 257 (ustar)"),
    M("514649fb", "qcow2", "QEMU QCOW2 disk image"),
    M("4b4f4c59", "vhdx", "Hyper-V VHDX tail signature family"),
    M("636f6e6e6563746978", "vhd", "VHD disk image footer (conectix)"),
    M("4d495374", "iso", "optical disc image family marker — confirm by size and layout"),
    M("89504e47", "png", "PNG image (short form)"),
    M("ffd8", "jpg", "JPEG image (short form)"),
    M("255044462d", "pdf", "PDF document (versioned header)"),
    M("62706c697374", "plist", "Apple binary property list"),
    M("3c3f786d6c", "xml", "XML document"),
    M("7b", "json", "JSON text (an opening brace — weak signature)"),
    M("1f9d", "Z", "compress(1) .Z data"),
    M("1f1f", "z", "old packed data (pack)"),
    M("4a415243", "jar", "Java archive marker (rare)"),
  ]);
}

/* ---------- curated: POSIX/Linux signals ---------- */
{
  const S = (num, name, act, desc) => [num, name, act, desc];
  emit("signals.json", [
    S(1, "SIGHUP", "terminate", "hangup — the controlling terminal went away; daemons read it as 'reload'"),
    S(2, "SIGINT", "terminate", "interrupt — Ctrl-C at the terminal"),
    S(3, "SIGQUIT", "core dump", "quit — Ctrl-\\ at the terminal, stronger than INT"),
    S(4, "SIGILL", "core dump", "illegal instruction — the CPU refused the code"),
    S(5, "SIGTRAP", "core dump", "trace/breakpoint trap — debuggers live here"),
    S(6, "SIGABRT", "core dump", "abort — the process killed itself on purpose (assert)"),
    S(7, "SIGBUS", "core dump", "bus error — a bad physical memory access, often mmap trouble"),
    S(8, "SIGFPE", "core dump", "floating point exception — divide by zero and friends"),
    S(9, "SIGKILL", "terminate", "kill — cannot be caught, blocked, or ignored"),
    S(10, "SIGUSR1", "terminate", "user-defined signal 1 (default action kills — catch it or don't send it)"),
    S(11, "SIGSEGV", "core dump", "segmentation fault — an invalid memory reference"),
    S(12, "SIGUSR2", "terminate", "user-defined signal 2"),
    S(13, "SIGPIPE", "terminate", "broken pipe — wrote to a pipe whose reader is gone"),
    S(14, "SIGALRM", "terminate", "alarm clock — timer from alarm(2) or setitimer"),
    S(15, "SIGTERM", "terminate", "termination request — the polite kill; catch it and clean up"),
    S(16, "SIGSTKFLT", "terminate", "stack fault on a coprocessor (Linux, rarely seen)"),
    S(17, "SIGCHLD", "ignore", "a child stopped or exited — read it to reap zombies"),
    S(18, "SIGCONT", "continue", "resume a stopped process"),
    S(19, "SIGSTOP", "stop", "stop the process — cannot be caught, blocked, or ignored"),
    S(20, "SIGTSTP", "stop", "terminal stop — Ctrl-Z at the terminal"),
    S(21, "SIGTTIN", "stop", "a background process tried to read the terminal"),
    S(22, "SIGTTOU", "stop", "a background process tried to write the terminal"),
    S(23, "SIGURG", "ignore", "urgent data on a socket"),
    S(24, "SIGXCPU", "core dump", "CPU time limit exceeded"),
    S(25, "SIGXFSZ", "core dump", "file size limit exceeded"),
    S(26, "SIGVTALRM", "terminate", "virtual timer expired (counts CPU time, not wall time)"),
    S(27, "SIGPROF", "terminate", "profiling timer expired"),
    S(28, "SIGWINCH", "ignore", "the window changed size — terminals and TUIs re-read it"),
    S(29, "SIGIO", "terminate", "I/O is possible now (async notification)"),
    S(30, "SIGPWR", "terminate", "power failure signal (rarely delivered)"),
    S(31, "SIGSYS", "core dump", "bad system call — seccomp filters often speak this"),
  ]);
}

/* ---------- curated: Linux errno (common set) ---------- */
{
  const E = (num, name, desc) => [num, name, desc];
  emit("errno.json", [
    E(1, "EPERM", "operation not permitted — not the owner, or not allowed to do that"),
    E(2, "ENOENT", "no such file or directory"),
    E(3, "ESRCH", "no such process"),
    E(4, "EINTR", "interrupted system call — retry it"),
    E(5, "EIO", "input/output error — the device or disk failed the read"),
    E(6, "ENXIO", "no such device or address"),
    E(7, "E2BIG", "argument list too long"),
    E(8, "ENOEXEC", "exec format error — not a runnable binary for this machine"),
    E(9, "EBADF", "bad file descriptor"),
    E(10, "ECHILD", "no child processes to wait for"),
    E(11, "EAGAIN", "resource temporarily unavailable — would block; try again"),
    E(12, "ENOMEM", "cannot allocate memory — out of memory"),
    E(13, "EACCES", "permission denied — the mode bits said no"),
    E(14, "EFAULT", "bad address — a pointer pointed outside the process"),
    E(15, "ENOTBLK", "block device required"),
    E(16, "EBUSY", "device or resource busy"),
    E(17, "EEXIST", "file exists — create was exclusive"),
    E(18, "EXDEV", "invalid cross-device link — rename across filesystems"),
    E(19, "ENODEV", "no such device"),
    E(20, "ENOTDIR", "not a directory — a path step was a file"),
    E(21, "EISDIR", "is a directory — read or wrote a directory as a file"),
    E(22, "EINVAL", "invalid argument"),
    E(23, "ENFILE", "too many open files in the system"),
    E(24, "EMFILE", "too many open files in this process"),
    E(25, "ENOTTY", "inappropriate ioctl for device — not a terminal"),
    E(26, "ETXTBSY", "text file busy — a running binary was opened for writing"),
    E(27, "EFBIG", "file too large"),
    E(28, "ENOSPC", "no space left on device"),
    E(29, "ESPIPE", "illegal seek — pipes cannot be seeked"),
    E(30, "EROFS", "read-only file system"),
    E(31, "EMLINK", "too many links"),
    E(32, "EPIPE", "broken pipe — the reader went away"),
    E(33, "EDOM", "numerical argument out of domain"),
    E(34, "ERANGE", "numerical result out of range"),
    E(35, "EDEADLK", "resource deadlock avoided"),
    E(36, "ENAMETOOLONG", "file name too long"),
    E(37, "ENOLCK", "no locks available"),
    E(38, "ENOSYS", "function not implemented — the syscall does not exist here"),
    E(39, "ENOTEMPTY", "directory not empty"),
    E(40, "ELOOP", "too many levels of symbolic links"),
    E(42, "ENOMSG", "no message of the desired type"),
    E(43, "EIDRM", "identifier removed — the IPC object is gone"),
    E(52, "EBADE", "invalid exchange"),
    E(61, "ENODATA", "no data available — the attribute or stream is empty"),
    E(62, "ETIME", "timer expired"),
    E(74, "EBADMSG", "bad message"),
    E(75, "EOVERFLOW", "value too large for the data type"),
    E(84, "EILSEQ", "invalid or incomplete multibyte or wide character"),
    E(85, "ERESTART", "interrupted call should be restarted"),
    E(88, "ENOTSOCK", "socket operation on a non-socket"),
    E(89, "EDESTADDRREQ", "destination address required"),
    E(90, "EMSGSIZE", "message too long for the socket"),
    E(91, "EPROTOTYPE", "protocol wrong type for socket"),
    E(92, "ENOPROTOOPT", "protocol not available"),
    E(93, "EPROTONOSUPPORT", "protocol not supported"),
    E(94, "ESOCKTNOSUPPORT", "socket type not supported"),
    E(95, "EOPNOTSUPP", "operation not supported on this endpoint"),
    E(96, "EPFNOSUPPORT", "protocol family not supported"),
    E(97, "EAFNOSUPPORT", "address family not supported by protocol"),
    E(98, "EADDRINUSE", "address already in use — something holds the port"),
    E(99, "EADDRNOTAVAIL", "cannot assign requested address"),
    E(100, "ENETDOWN", "network is down"),
    E(101, "ENETUNREACH", "network is unreachable — no route"),
    E(102, "ENETRESET", "network dropped the connection on reset"),
    E(103, "ECONNABORTED", "software caused connection abort"),
    E(104, "ECONNRESET", "connection reset by peer"),
    E(105, "ENOBUFS", "no buffer space available"),
    E(106, "EISCONN", "transport endpoint is already connected"),
    E(107, "ENOTCONN", "transport endpoint is not connected"),
    E(108, "ESHUTDOWN", "cannot send after transport endpoint shutdown"),
    E(110, "ETIMEDOUT", "connection timed out"),
    E(111, "ECONNREFUSED", "connection refused — nothing listens there, or it said no"),
    E(113, "EHOSTUNREACH", "no route to host"),
    E(114, "EALREADY", "operation already in progress"),
    E(115, "EINPROGRESS", "operation now in progress (nonblocking connect)"),
    E(117, "EUCLEAN", "structure needs cleaning — filesystem damage"),
    E(122, "EDQUOT", "quota exceeded"),
    E(123, "ENOMEDIUM", "no medium found — the drive is empty"),
    E(125, "ECANCELED", "operation canceled"),
    E(126, "ENOKEY", "required key not available"),
    E(131, "ENOTRECOVERABLE", "state not recoverable (robust mutex)"),
    E(132, "ERFKILL", "operation not possible due to RF-kill"),
    E(133, "EHWPOISON", "memory page has a hardware error"),
  ]);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`TOTAL: ${total} rows across ${Object.keys(counts).length} datasets`);
