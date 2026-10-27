// BLACKSITE OS — the toolchest. Local-compute admin, network and data
// tools: every verb here runs in the room (LIVE). The registry tables
// (ports, ciphers, mime, protocols, zones, codes…) ship as static JSON
// under /toolchest/ and load on first use, the way the Lua and SQLite
// engines do — a failed load says so instead of guessing.
import { verb, bToHex, hexToB, bToB64, b64ToB, md5 } from "./os-shell";
import { need, fileBytes } from "./os-verbs";

type Ctx = { args: string[]; stdin: string; os: any; io: any; raw: string };
const te = new TextEncoder();
const td = new TextDecoder();

/* ---------------- shared helpers ---------------- */
const tables = new Map<string, Promise<any[]>>();
function table(name: string): Promise<any[]> {
  if (!tables.has(name)) {
    tables.set(name, fetch(`/toolchest/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }));
  }
  return tables.get(name)!;
}
async function rows(name: string): Promise<any[]> {
  try { return await table(name); }
  catch { throw new Error(`the toolchest ${name} table could not be loaded — it ships with the site as /toolchest/${name}.json; check the connection and try again.`); }
}
/** text input: the joined args, else stdin. */
const txt = (ctx: Ctx, from = 0) => ctx.args.slice(from).join(" ") || ctx.stdin.trim();
/** byte input: a VFS file when the first free arg names one, else the text. */
function bytes(ctx: Ctx, from = 0): Uint8Array {
  const src = ctx.args.slice(from).find((a) => !a.startsWith("-")) || "";
  if (src && ctx.os.node(src)) return fileBytes(ctx, src);
  const t = txt(ctx, from);
  if (!t && ctx.stdin) return te.encode(ctx.stdin);
  return te.encode(t);
}
/** line input for line tools: a VFS file's text, else stdin, else joined args. */
function lines(ctx: Ctx, from = 0): string[] {
  const src = ctx.args.slice(from).find((a) => !a.startsWith("-")) || "";
  let t = "";
  if (src && ctx.os.node(src)) { const r = ctx.os.read(src); if (r === null) throw new Error(`no such file: ${src}`); t = r || ""; }
  else t = ctx.stdin || ctx.args.slice(from).join(" ");
  return t.replace(/\n$/, "").split("\n");
}
const rng = (n: number) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
const pickRng = <T,>(arr: T[]) => arr[(rng(1)[0] / 256) * arr.length | 0];
function fmtN(n: number | bigint): string { return n.toLocaleString("en-US"); }

/* ---------------- IPv4 ---------------- */
function parseIp(s: string): number | null {
  const parts = s.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p); if (o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}
const ipStr = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const maskFor = (p: number) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
function parseCidr(s: string): { ip: number; p: number } {
  const [a, b] = (s || "").split("/");
  const ip = parseIp(a || "");
  if (ip === null) throw new Error(`not an IPv4 address: ${a || s}`);
  const p = b === undefined ? 32 : Number(b);
  if (!Number.isInteger(p) || p < 0 || p > 32) throw new Error(`bad prefix length: ${b}`);
  return { ip, p };
}
function ipClass(n: number): string {
  const a = (n >>> 24) & 255;
  if (a < 128) return "A"; if (a < 192) return "B"; if (a < 224) return "C"; if (a < 240) return "D (multicast)"; return "E (experimental)";
}
function ipKind(n: number): string[] {
  const kinds: string[] = [];
  const in_ = (base: number, p: number) => (n & maskFor(p)) === (base & maskFor(p));
  if (in_(parseIp("10.0.0.0")!, 8) || in_(parseIp("172.16.0.0")!, 12) || in_(parseIp("192.168.0.0")!, 16)) kinds.push("private (RFC 1918)");
  if (in_(parseIp("127.0.0.0")!, 8)) kinds.push("loopback");
  if (in_(parseIp("169.254.0.0")!, 16)) kinds.push("link-local (APIPA)");
  if (in_(parseIp("100.64.0.0")!, 10)) kinds.push("shared address space / CGNAT (RFC 6598)");
  if (in_(parseIp("192.0.2.0")!, 24) || in_(parseIp("198.51.100.0")!, 24) || in_(parseIp("203.0.113.0")!, 24)) kinds.push("documentation (TEST-NET)");
  if (in_(parseIp("198.18.0.0")!, 15)) kinds.push("benchmarking (RFC 2544)");
  if ((n >>> 28) === 14) kinds.push("multicast");
  if (n === 0) kinds.push("unspecified (this host)");
  if (n === 0xffffffff) kinds.push("limited broadcast");
  if (!kinds.length) kinds.push("public");
  return kinds;
}

/* ---------------- IPv6 (BigInt) ---------------- */
function parseIp6(s: string): bigint | null {
  s = s.trim().toLowerCase();
  if (!s) return null;
  if (s.includes(".")) { // v4 tail
    const i = s.lastIndexOf(":");
    if (i < 0) return null;
    const v4 = parseIp(s.slice(i + 1));
    if (v4 === null) return null;
    s = s.slice(0, i + 1) + ((v4 >>> 16) & 0xffff).toString(16) + ":" + (v4 & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const side = (h: string) => (h === "" ? [] : h.split(":").map((g) => {
    if (!/^[0-9a-f]{1,4}$/.test(g)) throw new Error("bad group");
    return parseInt(g, 16);
  }));
  try {
    let groups: number[];
    if (halves.length === 2) {
      const l = side(halves[0]), r = side(halves[1]);
      if (l.length + r.length > 7) return null;
      groups = [...l, ...new Array(8 - l.length - r.length).fill(0), ...r];
    } else {
      groups = side(s);
      if (groups.length !== 8) return null;
    }
    return groups.reduce((a, g) => (a << 16n) | BigInt(g), 0n);
  } catch { return null; }
}
const ip6Groups = (n: bigint) => { const g: number[] = []; for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn)); return g; };
const ip6Expand = (n: bigint) => ip6Groups(n).map((g) => g.toString(16).padStart(4, "0")).join(":");
function ip6Compress(n: bigint): string {
  const g = ip6Groups(n);
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === 0) { if (curStart < 0) curStart = i; curLen++; if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } }
    else { curStart = -1; curLen = 0; }
  }
  if (bestLen < 2) return g.map((x) => x.toString(16)).join(":");
  const l = g.slice(0, bestStart).map((x) => x.toString(16)).join(":");
  const r = g.slice(bestStart + bestLen).map((x) => x.toString(16)).join(":");
  return `${l}::${r}`;
}

/* ---------------- the families ---------------- */
function registerIpFamily() {
  verb("netcalc", "LIVE", "netcalc <a.b.c.d/prefix> — the full subnet breakdown", async (ctx) => {
    if (!need(ctx, 1, "netcalc <a.b.c.d/prefix>")) return;
    const { ip, p } = parseCidr(ctx.args[0]);
    const mask = maskFor(p), net = (ip & mask) >>> 0, bcast = (net | (~mask >>> 0)) >>> 0;
    const hosts = p >= 31 ? Math.pow(2, 32 - p) : Math.pow(2, 32 - p) - 2;
    const rowsOut = [
      `address     ${ipStr(ip)}  (class ${ipClass(ip)} · ${ipKind(ip).join(", ")})`,
      `netmask     ${ipStr(mask)}  /${p}   wildcard ${ipStr((~mask) >>> 0)}`,
      `network     ${ipStr(net)}/${p}`,
      `broadcast   ${ipStr(bcast)}`,
      p >= 31 ? `range       ${ipStr(net)} — ${ipStr(bcast)}  (point-to-point / host route: every address is usable)` : `host range  ${ipStr((net + 1) >>> 0)} — ${ipStr((bcast - 1) >>> 0)}`,
      `addresses   ${fmtN(Math.pow(2, 32 - p))} total · ${fmtN(hosts)} usable hosts`,
      `binary      ${ipStr(ip).split(".").map((o) => Number(o).toString(2).padStart(8, "0")).join(".")}`,
      `integer     ${ip}  ·  hex ${"0x" + ip.toString(16).padStart(8, "0")}  ·  reverse ${ipStr(ip).split(".").reverse().join(".")}.in-addr.arpa`,
    ];
    return rowsOut.join("\n");
  });
  verb("cidr", "LIVE", "cidr <a.b.c.d/prefix> — address count and range, compact", async (ctx) => {
    if (!need(ctx, 1, "cidr <a.b.c.d/prefix>")) return;
    const { ip, p } = parseCidr(ctx.args[0]);
    const mask = maskFor(p), net = (ip & mask) >>> 0, bcast = (net | (~mask >>> 0)) >>> 0;
    return `${ipStr(net)}/${p} — ${fmtN(Math.pow(2, 32 - p))} addresses, ${ipStr(net)} to ${ipStr(bcast)}, mask ${ipStr(mask)}`;
  });
  verb("wildcard", "LIVE", "wildcard <a.b.c.d/prefix> — the Cisco-style wildcard mask and the range it matches", async (ctx) => {
    if (!need(ctx, 1, "wildcard <a.b.c.d/prefix>")) return;
    const { ip, p } = parseCidr(ctx.args[0]);
    const wild = (~maskFor(p)) >>> 0, net = (ip & maskFor(p)) >>> 0, end = (net | wild) >>> 0;
    return `wildcard ${ipStr(wild)} — an ACL line '${ipStr(net)} ${ipStr(wild)}' matches ${ipStr(net)} to ${ipStr(end)} (${fmtN(Math.pow(2, 32 - p))} addresses)`;
  });
  verb("supernet", "LIVE", "supernet <cidr> <cidr> […] — the smallest supernet covering them all", async (ctx) => {
    if (!need(ctx, 2, "supernet <cidr> <cidr> […]")) return;
    let lo = 0xffffffff, hi = 0;
    for (const a of ctx.args) {
      const { ip, p } = parseCidr(a);
      const net = (ip & maskFor(p)) >>> 0, end = (net | (~maskFor(p) >>> 0)) >>> 0;
      lo = Math.min(lo, net); hi = Math.max(hi, end);
    }
    const xor = (lo ^ hi) >>> 0;
    const p = xor === 0 ? 32 : Math.clz32(xor);
    const net = (lo & maskFor(p)) >>> 0;
    const exact = (net === lo) && ((net | (~maskFor(p) >>> 0)) >>> 0) === hi;
    return `${ipStr(net)}/${p} covers ${ipStr(lo)} — ${ipStr(hi)}${exact ? " exactly" : " (the covering supernet is larger than the inputs combined)"}`;
  });
  verb("vlsm", "LIVE", "vlsm <base-cidr> <hosts> [hosts…] — carve a block into subnets by need, largest first", async (ctx) => {
    if (!need(ctx, 2, "vlsm <base-cidr> <hosts> [hosts…]")) return;
    const { ip, p } = parseCidr(ctx.args[0]);
    let cursor = (ip & maskFor(p)) >>> 0;
    const limit = (cursor | (~maskFor(p) >>> 0)) >>> 0;
    const needs = ctx.args.slice(1).map(Number).sort((a, b) => b - a);
    if (needs.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error("host counts must be positive integers");
    const out: string[] = [`carving ${ipStr(cursor)}/${p}:`];
    for (const n of needs) {
      let bits = 0; while (Math.pow(2, bits) - 2 < n) bits++;
      const sub = 32 - bits, size = Math.pow(2, bits);
      if (sub < p) throw new Error(`${n} hosts do not fit in what is left of the base block`);
      if (cursor % size !== 0) cursor = (Math.floor(cursor / size) + 1) * size;
      if (cursor + size - 1 > limit) throw new Error(`out of room: ${n} hosts do not fit in what is left of the base block`);
      const end = (cursor + size - 1) >>> 0;
      out.push(`  ${String(n).padStart(6)} hosts → ${ipStr(cursor)}/${sub}  (${ipStr((cursor + 1) >>> 0)} — ${ipStr((end - 1) >>> 0)}, bcast ${ipStr(end)})`);
      cursor = (end + 1) >>> 0;
    }
    return out.join("\n");
  });
  verb("iprange", "LIVE", "iprange <first> <last> — count a range, list it when it is small", async (ctx) => {
    if (!need(ctx, 2, "iprange <first> <last>")) return;
    const a = parseIp(ctx.args[0]), b = parseIp(ctx.args[1]);
    if (a === null || b === null) throw new Error("both ends must be IPv4 addresses");
    const lo = Math.min(a, b), hi = Math.max(a, b), count = hi - lo + 1;
    const out = [`${ipStr(lo)} — ${ipStr(hi)}: ${fmtN(count)} addresses`];
    if (count <= 256) { for (let n = lo; n <= hi; n++) out.push(ipStr(n >>> 0)); }
    else out.push("(too many to list — pipe through `head` will not help; narrow the range)");
    return out.join("\n");
  });
  verb("ip2int", "LIVE", "ip2int <a.b.c.d> — an address as a 32-bit integer", async (ctx) => {
    if (!need(ctx, 1, "ip2int <a.b.c.d>")) return;
    const n = parseIp(ctx.args[0]); if (n === null) throw new Error(`not an IPv4 address: ${ctx.args[0]}`);
    return `${n}  (hex 0x${n.toString(16).padStart(8, "0")})`;
  });
  verb("int2ip", "LIVE", "int2ip <n> — a 32-bit integer as an address", async (ctx) => {
    if (!need(ctx, 1, "int2ip <n>")) return;
    const n = Number(ctx.args[0]);
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new Error("an integer from 0 to 4294967295");
    return ipStr(n >>> 0);
  });
  verb("ip2hex", "LIVE", "ip2hex <a.b.c.d> — an address in hex", async (ctx) => {
    if (!need(ctx, 1, "ip2hex <a.b.c.d>")) return;
    const n = parseIp(ctx.args[0]); if (n === null) throw new Error(`not an IPv4 address: ${ctx.args[0]}`);
    return "0x" + n.toString(16).padStart(8, "0");
  });
  verb("hex2ip", "LIVE", "hex2ip <0x…> — a hex word as an address", async (ctx) => {
    if (!need(ctx, 1, "hex2ip <0x…>")) return;
    const b = hexToB(ctx.args[0]);
    if (b.length !== 4) throw new Error("exactly 4 bytes (8 hex digits) make an IPv4 address");
    return ipStr(((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
  });
  verb("ipbin", "LIVE", "ipbin <a.b.c.d> — an address in dotted binary", async (ctx) => {
    if (!need(ctx, 1, "ipbin <a.b.c.d>")) return;
    const n = parseIp(ctx.args[0]); if (n === null) throw new Error(`not an IPv4 address: ${ctx.args[0]}`);
    return ipStr(n).split(".").map((o) => Number(o).toString(2).padStart(8, "0")).join(".");
  });
  verb("ipinfo", "LIVE", "ipinfo <address> — class, kind, and forms of an IPv4 or IPv6 address", async (ctx) => {
    if (!need(ctx, 1, "ipinfo <address>")) return;
    const s = ctx.args[0];
    const v4 = parseIp(s);
    if (v4 !== null) return `${s}\n  family IPv4 · class ${ipClass(v4)} · ${ipKind(v4).join(", ")}\n  integer ${v4} · hex 0x${v4.toString(16).padStart(8, "0")} · reverse ${ipStr(v4).split(".").reverse().join(".")}.in-addr.arpa`;
    const v6 = parseIp6(s);
    if (v6 !== null) {
      const g = ip6Groups(v6);
      const kinds: string[] = [];
      if (v6 === 0n) kinds.push("unspecified (::)");
      if (v6 === 1n) kinds.push("loopback (::1)");
      if ((g[0] & 0xffc0) === 0xfe80) kinds.push("link-local (fe80::/10)");
      if ((g[0] & 0xfe00) === 0xfc00) kinds.push("unique local (fc00::/7)");
      if ((g[0] & 0xff00) === 0xff00) kinds.push("multicast (ff00::/8)" + (g[0] === 0xff02 ? " — link-scoped" : g[0] === 0xff01 ? " — interface-scoped" : g[0] === 0xff05 ? " — site-scoped" : ""));
      if (g[0] === 0x2001 && g[1] === 0x0db8) kinds.push("documentation (2001:db8::/32)");
      if (g[0] === 0x0100) kinds.push("discard-only (100::/64)");
      if (g[5] === 0xffff && g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0) kinds.push(`IPv4-mapped (holds ${ipStr(Number(v6 & 0xffffffffn))})`);
      if (!kinds.length) kinds.push("global unicast");
      return `${ip6Compress(v6)}\n  family IPv6 · ${kinds.join(", ")}\n  expanded ${ip6Expand(v6)}`;
    }
    throw new Error(`not an IP address: ${s}`);
  });
  verb("iprev", "LIVE", "iprev <a.b.c.d> — the reverse-DNS name of an address", async (ctx) => {
    if (!need(ctx, 1, "iprev <a.b.c.d>")) return;
    const n = parseIp(ctx.args[0]); if (n === null) throw new Error(`not an IPv4 address: ${ctx.args[0]}`);
    return ipStr(n).split(".").reverse().join(".") + ".in-addr.arpa";
  });
  verb("ipv6x", "LIVE", "ipv6x <address> — expand an IPv6 address to all eight groups", async (ctx) => {
    if (!need(ctx, 1, "ipv6x <address>")) return;
    const n = parseIp6(ctx.args[0]); if (n === null) throw new Error(`not an IPv6 address: ${ctx.args[0]}`);
    return ip6Expand(n);
  });
  verb("ipv6c", "LIVE", "ipv6c <address> — compress an IPv6 address to its shortest form", async (ctx) => {
    if (!need(ctx, 1, "ipv6c <address>")) return;
    const n = parseIp6(ctx.args[0]); if (n === null) throw new Error(`not an IPv6 address: ${ctx.args[0]}`);
    return ip6Compress(n);
  });
  verb("ip6rev", "LIVE", "ip6rev <address> — the ip6.arpa reverse-DNS name of an IPv6 address", async (ctx) => {
    if (!need(ctx, 1, "ip6rev <address>")) return;
    const n = parseIp6(ctx.args[0]); if (n === null) throw new Error(`not an IPv6 address: ${ctx.args[0]}`);
    return ip6Expand(n).replace(/:/g, "").split("").reverse().join(".") + ".ip6.arpa";
  });
  verb("v6subnet", "LIVE", "v6subnet <prefix/len> <new-len> [n] — split an IPv6 prefix, showing the first n children", async (ctx) => {
    if (!need(ctx, 2, "v6subnet <prefix/len> <new-len> [n]")) return;
    const [addr, lenS] = ctx.args[0].split("/");
    const base = parseIp6(addr); if (base === null) throw new Error(`not an IPv6 prefix: ${ctx.args[0]}`);
    const len = Number(lenS), nl = Number(ctx.args[1]), show = Math.min(Number(ctx.args[2]) || 8, 64);
    if (!Number.isInteger(len) || !Number.isInteger(nl) || nl <= len || nl > 128) throw new Error("new length must be greater than the prefix length, up to 128");
    const shift = BigInt(128 - nl);
    const netBase = (base >> BigInt(128 - len)) << BigInt(128 - len);
    const total = 1n << BigInt(nl - len);
    const out = [`${ip6Compress(netBase)}/${len} splits into ${fmtN(total)} /${nl} networks; first ${show}:`];
    for (let i = 0n; i < BigInt(show) && i < total; i++) out.push(`  ${ip6Compress(netBase + (i << shift))}/${nl}`);
    return out.join("\n");
  });
  verb("v6map", "LIVE", "v6map <address> — an IPv4 address in IPv6 mapped form, or the IPv4 inside a mapped address", async (ctx) => {
    if (!need(ctx, 1, "v6map <address>")) return;
    const v4 = parseIp(ctx.args[0]);
    if (v4 !== null) return `::ffff:${ipStr(v4)}  (expanded ${ip6Expand((0xffffn << 32n) | BigInt(v4))})`;
    const v6 = parseIp6(ctx.args[0]);
    if (v6 === null) throw new Error(`not an IP address: ${ctx.args[0]}`);
    const g = ip6Groups(v6);
    if (g[5] === 0xffff && g.slice(0, 5).every((x) => x === 0)) return ipStr(Number(v6 & 0xffffffffn));
    throw new Error("that IPv6 address is not an IPv4-mapped one (::ffff:a.b.c.d)");
  });
  verb("mac", "LIVE", "mac <address> — a MAC address in every house style, with its flag bits read", async (ctx) => {
    if (!need(ctx, 1, "mac <address>")) return;
    const clean = ctx.args[0].replace(/[:.\- ]/g, "");
    if (!/^[0-9a-fA-F]{12}$/.test(clean)) throw new Error("a MAC is 6 bytes — 12 hex digits, in colon, dash, dotted, or bare form");
    const b = hexToB(clean);
    const pairs = [...b].map((x) => x.toString(16).padStart(2, "0"));
    return [
      `colon   ${pairs.join(":")}`,
      `dash    ${pairs.join("-").toUpperCase()}`,
      `dotted  ${clean.slice(0, 4)}.${clean.slice(4, 8)}.${clean.slice(8)}`.toLowerCase(),
      `bare    ${clean.toLowerCase()}`,
      `bits    ${b[0] & 1 ? "multicast" : "unicast"} · ${b[0] & 2 ? "locally administered (software-set)" : "universally administered (burned in)"} · OUI ${pairs.slice(0, 3).join(":")}`,
    ].join("\n");
  });
  verb("eui64", "LIVE", "eui64 <mac> — the EUI-64 identifier and link-local address a MAC makes", async (ctx) => {
    if (!need(ctx, 1, "eui64 <mac>")) return;
    const clean = ctx.args[0].replace(/[:.\- ]/g, "");
    if (!/^[0-9a-fA-F]{12}$/.test(clean)) throw new Error("a MAC is 6 bytes — 12 hex digits");
    const b = [...hexToB(clean)];
    const eui = [b[0] ^ 2, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
    const groups = [0xfe80, 0, 0, 0, (eui[0] << 8) | eui[1], (eui[2] << 8) | eui[3], (eui[4] << 8) | eui[5], (eui[6] << 8) | eui[7]];
    const ll = groups.reduce((a, g) => (a << 16n) | BigInt(g), 0n);
    return `EUI-64      ${eui.map((x) => x.toString(16).padStart(2, "0")).join(":")}\nlink-local  ${ip6Compress(ll)}  (the address this machine gives itself on the wire)`;
  });
  verb("ula", "LIVE", "ula [n] — fresh RFC 4193 unique-local IPv6 prefixes", async (ctx) => {
    const n = Math.min(Number(ctx.args[0]) || 1, 10);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const b = rng(6);
      out.push(`fd${b[0].toString(16).padStart(2, "0")}:${((b[1] << 8) | b[2]).toString(16)}:${((b[3] << 8) | b[4]).toString(16)}::/48  (global id ${bToHex(b.slice(0, 5))}, first /64 fd${b[0].toString(16).padStart(2, "0")}:${((b[1] << 8) | b[2]).toString(16)}:${((b[3] << 8) | b[4]).toString(16)}:0::/64)`);
    }
    return out.join("\n");
  });
  verb("netmask", "LIVE", "netmask <prefix|mask|all> — netmask, wildcard, and host count in every notation", async (ctx) => {
    if (!need(ctx, 1, "netmask <prefix|mask|all>")) return;
    const row = (p: number) => `/${String(p).padEnd(3)} ${ipStr(maskFor(p)).padEnd(16)} wild ${ipStr((~maskFor(p)) >>> 0).padEnd(16)} hex 0x${maskFor(p).toString(16).padStart(8, "0")}  ${fmtN(Math.pow(2, 32 - p))} addresses`;
    if (ctx.args[0] === "all") { const all: string[] = []; for (let p = 0; p <= 32; p++) all.push(row(p)); return all.join("\n"); }
    let p: number;
    if (ctx.args[0].includes(".")) {
      const m = parseIp(ctx.args[0]); if (m === null) throw new Error(`not a mask: ${ctx.args[0]}`);
      p = ipStr(m).split(".").map((o) => Number(o).toString(2)).join("").split("").filter((c) => c === "1").length;
      if (maskFor(p) !== m) throw new Error("that mask is not contiguous — it is not a netmask");
    } else { p = Number(ctx.args[0].replace("/", "")); if (!Number.isInteger(p) || p < 0 || p > 32) throw new Error("a prefix length from 0 to 32"); }
    return row(p);
  });
  verb("innet", "LIVE", "innet <cidr> <address> — is the address inside the block?", async (ctx) => {
    if (!need(ctx, 2, "innet <cidr> <address>")) return;
    const { ip, p } = parseCidr(ctx.args[0]);
    const t = parseIp(ctx.args[1]); if (t === null) throw new Error(`not an IPv4 address: ${ctx.args[1]}`);
    const inside = (t & maskFor(p)) >>> 0 === (ip & maskFor(p)) >>> 0;
    return inside ? `yes — ${ctx.args[1]} is inside ${ipStr((ip & maskFor(p)) >>> 0)}/${p}` : `no — ${ctx.args[1]} is outside ${ipStr((ip & maskFor(p)) >>> 0)}/${p}`;
  });
  verb("overlap", "LIVE", "overlap <cidr> <cidr> — how two blocks relate", async (ctx) => {
    if (!need(ctx, 2, "overlap <cidr> <cidr>")) return;
    const A = parseCidr(ctx.args[0]), B = parseCidr(ctx.args[1]);
    const rngOf = (c: { ip: number; p: number }) => { const lo = (c.ip & maskFor(c.p)) >>> 0; return [lo, (lo | (~maskFor(c.p) >>> 0)) >>> 0] as const; };
    const [aLo, aHi] = rngOf(A), [bLo, bHi] = rngOf(B);
    if (aHi < bLo || bHi < aLo) return "disjoint — the blocks share no address";
    if (aLo <= bLo && aHi >= bHi) return `the first contains the second whole (${ipStr(bLo)} — ${ipStr(bHi)} sits inside ${ipStr(aLo)} — ${ipStr(aHi)})`;
    if (bLo <= aLo && bHi >= aHi) return "the second contains the first whole";
    return `partial overlap — the shared span is ${ipStr(Math.max(aLo, bLo))} — ${ipStr(Math.min(aHi, bHi))}`;
  });
  verb("ip2cidr", "LIVE", "ip2cidr <first> <last> — the smallest single CIDR covering a range", async (ctx) => {
    if (!need(ctx, 2, "ip2cidr <first> <last>")) return;
    const a = parseIp(ctx.args[0]), b = parseIp(ctx.args[1]);
    if (a === null || b === null) throw new Error("both ends must be IPv4 addresses");
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const xor = (lo ^ hi) >>> 0;
    const p = xor === 0 ? 32 : Math.clz32(xor);
    return `${ipStr((lo & maskFor(p)) >>> 0)}/${p} (covers ${ipStr(lo)} — ${ipStr(hi)}${p < 32 && (lo & maskFor(p)) >>> 0 === lo && ((lo | (~maskFor(p) >>> 0)) >>> 0) === hi ? " exactly" : ", and more besides"})`;
  });
  verb("mtu", "LIVE", "mtu <link-mtu> [pppoe|gre|vxlan|wireguard|vlan|ipsec…] — the payload room left after encapsulation", async (ctx) => {
    if (!need(ctx, 1, "mtu <link-mtu> [overheads…]")) return;
    const overheads: Record<string, number> = { ethernet: 0, vlan: 4, pppoe: 8, gre: 24, ipv6: 20, mpls: 4, vxlan: 50, geneve: 46, wireguard: 60, ipsec: 70, teredo: 48 };
    let mtu = Number(ctx.args[0]);
    if (!Number.isInteger(mtu) || mtu < 100) throw new Error("a link MTU in bytes, e.g. 1500");
    const out = [`link MTU ${mtu}`];
    for (const a of ctx.args.slice(1)) {
      const o = overheads[a.toLowerCase()];
      if (o === undefined) throw new Error(`unknown encapsulation: ${a} (known: ${Object.keys(overheads).join(", ")})`);
      mtu -= o; out.push(`  − ${a} overhead ${o} → ${mtu}`);
    }
    out.push(`effective MTU ${mtu} · TCP MSS (IPv4) ${mtu - 40} · TCP MSS (IPv6) ${mtu - 60}`);
    return out.join("\n");
  });
  verb("bdp", "LIVE", "bdp <rate> <rtt-ms> — the bandwidth-delay product: how much must be in flight", async (ctx) => {
    if (!need(ctx, 2, "bdp <rate like 100M|1G> <rtt-ms>")) return;
    const m = ctx.args[0].match(/^([\d.]+)\s*([kKmMgG]?)(b|B)?(ps)?$/);
    if (!m) throw new Error("a rate like 100M, 1G, 500k (bits per second)");
    let bps = Number(m[1]) * ({ "": 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 } as any)[m[2]] * (m[3] === "B" ? 8 : 1);
    const rtt = Number(ctx.args[1]); if (!(rtt > 0)) throw new Error("an RTT in milliseconds");
    const bits = bps * (rtt / 1000), byts = bits / 8;
    const human = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(2) + " MB" : n >= 1e3 ? (n / 1e3).toFixed(1) + " KB" : n.toFixed(0) + " B";
    return `BDP = ${fmtN(Math.round(bits))} bits in flight (${human(byts)})\na TCP window smaller than this cannot fill the pipe: window scaling must pass ${human(byts)} — the old 64 KB unscaled window caps this path at ${(65535 * 8 / (rtt / 1000) / 1e6).toFixed(1)} Mb/s.`;
  });
  const DSCP: Array<[number, string, string]> = [
    [0, "CS0 / BE", "best effort — the default"], [8, "CS1", "background / scavenger-ish priority"], [16, "CS2", "operations traffic"], [24, "CS3", "signalling"], [32, "CS4", "real-time interactive"], [40, "CS5", "broadcast video"], [48, "CS6", "network control"], [56, "CS7", "reserved control"],
    [10, "AF11", "assured forwarding class 1, low drop"], [12, "AF12", "class 1, medium drop"], [14, "AF13", "class 1, high drop"],
    [18, "AF21", "assured forwarding class 2, low drop"], [20, "AF22", "class 2, medium drop"], [22, "AF23", "class 2, high drop"],
    [26, "AF31", "assured forwarding class 3, low drop"], [28, "AF32", "class 3, medium drop"], [30, "AF33", "class 3, high drop"],
    [34, "AF41", "assured forwarding class 4, low drop"], [36, "AF42", "class 4, medium drop"], [38, "AF43", "class 4, high drop"],
    [46, "EF", "expedited forwarding — the voice class"], [44, "VA", "voice admit (capacity-admitted traffic)"], [1, "LE", "lower effort — below best effort"],
  ];
  verb("dscp", "LIVE", "dscp <codepoint|name|tos> — DSCP classes, codepoints, and TOS bytes", async (ctx) => {
    if (!need(ctx, 1, "dscp <codepoint|name|tos>")) return;
    const q = ctx.args[0].toUpperCase();
    const hit = DSCP.find(([n, name]) => String(n) === q || name === q || name.startsWith(q + " ") || name.split(" / ").includes(q));
    if (hit) return `DSCP ${hit[0]} — ${hit[1]}: ${hit[2]} · TOS byte ${hit[0] << 2} (0x${(hit[0] << 2).toString(16).padStart(2, "0")}) · the top 6 bits of the TOS/traffic-class byte`;
    const n = Number(ctx.args[0]);
    if (Number.isInteger(n) && n > 63 && n <= 255) { const cp = n >> 2; const named = DSCP.find(([x]) => x === cp); return `TOS byte ${n} carries DSCP ${cp}${named ? ` — ${named[1]}: ${named[2]}` : " (no standard class name)"} · ECN bits ${n & 3}`; }
    if (Number.isInteger(n) && n >= 0 && n <= 63) return `DSCP ${n} — no standard class name · TOS byte ${n << 2}`;
    return `no DSCP match for '${ctx.args[0]}' — try a codepoint 0–63, a name (EF, AF31, CS3), or a TOS byte 0–255.\nclasses: ${DSCP.map(([n, name]) => `${name.split(" / ")[0]}=${n}`).join("  ")}`;
  });
}

function registerLookupFamily() {
  const search = (rs: any[], q: string, fields: (r: any) => string) =>
    rs.filter((r) => fields(r).toLowerCase().includes(q.toLowerCase()));
  const cap = (list: string[], n = 40) => list.length > n ? [...list.slice(0, n), `… and ${list.length - n} more — narrow the search`] : list;
  verb("svc", "LIVE", "svc <port|service> — the IANA service registry: what a port is for", async (ctx) => {
    if (!need(ctx, 1, "svc <port|service>")) return;
    const rs = await rows("ports");
    const q = ctx.args.join(" ").trim();
    let hits: any[];
    if (/^\d+$/.test(q)) hits = rs.filter((r) => r[0] === Number(q));
    else hits = search(rs, q, (r) => `${r[2]} ${r[3]}`);
    if (!hits.length) return `no IANA service named or numbered '${q}' — unassigned, or a private house name.`;
    return cap(hits.map((r) => `${String(r[0]).padEnd(6)} ${r[1].padEnd(5)} ${r[2].padEnd(22)} ${r[3]}`)).join("\n");
  });
  verb("cipher", "LIVE", "cipher <0x00,0x00|name> — the IANA TLS cipher-suite registry", async (ctx) => {
    if (!need(ctx, 1, "cipher <value|name>")) return;
    const rs = await rows("ciphers");
    const q = ctx.args.join(" ").trim();
    const hits = /^0x/i.test(q) ? rs.filter((r) => r[0].toLowerCase() === q.toLowerCase().replace(/\s/g, "")) : search(rs, q, (r) => r[1]);
    if (!hits.length) return `no assigned TLS suite matches '${q}'.`;
    return cap(hits.map((r) => `${r[0]}  ${r[1]}`)).join("\n");
  });
  verb("mime", "LIVE", "mime <extension|type> — MIME types and their extensions (mime-db)", async (ctx) => {
    if (!need(ctx, 1, "mime <extension|type>")) return;
    const rs = await rows("mime");
    const q = ctx.args.join(" ").trim().toLowerCase().replace(/^\./, "");
    if (q.includes("/")) {
      const hit = rs.find((r) => r[0] === q);
      return hit ? `${hit[0]} — extensions: ${hit[1].join(", ")}${hit[2] ? " · compressible" : ""}` : `no type '${q}' in mime-db.`;
    }
    const hits = rs.filter((r) => r[1].includes(q));
    if (!hits.length) return `no MIME type claims the extension '.${q}'.`;
    return cap(hits.map((r) => `${r[0].padEnd(52)} .${q}${r[1].length > 1 ? `  (also: ${r[1].filter((e: string) => e !== q).join(", ")})` : ""}`)).join("\n");
  });
  verb("tz", "LIVE", "tz [zone] — time zones: search them, or read the hour in one", async (ctx) => {
    const rs = await rows("tz");
    const q = ctx.args.join(" ").trim();
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!q) return `you are in ${here} — ${new Date().toLocaleString("en-GB", { timeZone: here })}\nUTC — ${new Date().toISOString().replace("T", " ").slice(0, 19)}\n${rs.length} zones on the registry: name one (or part of one) to read its hour.`;
    const hits = search(rs, q.replace(/ /g, "_"), (r) => r[0]);
    if (!hits.length) return `no zone matches '${q}'.`;
    return cap(hits.map((r) => {
      let t = ""; try { t = new Date().toLocaleString("en-GB", { timeZone: r[0], hour12: false }); } catch { t = "(unreadable)"; }
      return `${r[0].padEnd(34)} ${r[1].padEnd(9)} ${t}`;
    }), 25).join("\n");
  });
  verb("country", "LIVE", "country <code|name> — ISO 3166 country codes", async (ctx) => {
    if (!need(ctx, 1, "country <code|name>")) return;
    const rs = await rows("countries");
    const q = ctx.args.join(" ").trim();
    const hits = /^[a-z]{2}$/i.test(q) ? rs.filter((r) => r[0] === q.toUpperCase()) : search(rs, q, (r) => `${r[0]} ${r[1]}`);
    return hits.length ? cap(hits.map((r) => `${r[0]}  ${r[1]}`)).join("\n") : `no country matches '${q}'.`;
  });
  verb("currency", "LIVE", "currency <code|name> — ISO 4217 currency codes", async (ctx) => {
    if (!need(ctx, 1, "currency <code|name>")) return;
    const rs = await rows("currencies");
    const q = ctx.args.join(" ").trim();
    const hits = /^[a-z]{3}$/i.test(q) ? rs.filter((r) => r[0] === q.toUpperCase()) : search(rs, q, (r) => `${r[0]} ${r[1]}`);
    return hits.length ? cap(hits.map((r) => `${r[0]}  ${r[1]}`)).join("\n") : `no currency matches '${q}'.`;
  });
  verb("language", "LIVE", "language <code|name> — ISO 639 language codes", async (ctx) => {
    if (!need(ctx, 1, "language <code|name>")) return;
    const rs = await rows("languages");
    const q = ctx.args.join(" ").trim();
    const hits = /^[a-z]{2,3}$/i.test(q) && rs.some((r) => r[0] === q.toLowerCase()) ? rs.filter((r) => r[0] === q.toLowerCase()) : search(rs, q, (r) => `${r[0]} ${r[1]}`);
    return hits.length ? cap(hits.map((r) => `${r[0].padEnd(5)} ${r[1]}`)).join("\n") : `no language matches '${q}'.`;
  });
  verb("proto", "LIVE", "proto <number|keyword> — the IANA protocol-number registry (what rides in IPv4 protocol / IPv6 next-header)", async (ctx) => {
    if (!need(ctx, 1, "proto <number|keyword>")) return;
    const rs = await rows("protocols");
    const q = ctx.args.join(" ").trim();
    const hits = /^\d+$/.test(q) ? rs.filter((r) => r[0] === Number(q)) : search(rs, q, (r) => `${r[1]} ${r[2]}`);
    return hits.length ? cap(hits.map((r) => `${String(r[0]).padEnd(4)} ${r[1].padEnd(14)} ${r[2]}`)).join("\n") : `no protocol matches '${q}'.`;
  });
  verb("http", "LIVE", "http <code|words> — HTTP status codes and what they actually mean", async (ctx) => {
    if (!need(ctx, 1, "http <code|words>")) return;
    const rs = await rows("http");
    const q = ctx.args.join(" ").trim();
    const hits = /^\d{3}$/.test(q) ? rs.filter((r) => r[0] === Number(q)) : search(rs, q, (r) => `${r[1]} ${r[2]}`);
    return hits.length ? cap(hits.map((r) => `${r[0]} ${r[1]} — ${r[2]}`)).join("\n") : `no status code matches '${q}'.`;
  });
  verb("dnstype", "LIVE", "dnstype <type> — DNS record types, one line each", async (ctx) => {
    const rs = await rows("dnstypes");
    const q = (ctx.args[0] || "").toUpperCase();
    if (!q) return rs.map((r) => `${r[0].padEnd(11)} ${r[1]}`).join("\n");
    const hit = rs.find((r) => r[0] === q);
    return hit ? `${hit[0]} — ${hit[1]}` : `no record type '${q}' in the table (${rs.length} types known).`;
  });
  verb("signal", "LIVE", "signal <number|name> — POSIX signals: default action and meaning", async (ctx) => {
    const rs = await rows("signals");
    const q = (ctx.args[0] || "").toUpperCase().replace(/^SIG/, "");
    if (!q) return rs.map((r) => `${String(r[0]).padStart(2)} ${r[1].padEnd(10)} ${r[2].padEnd(10)} ${r[3]}`).join("\n");
    const hit = rs.find((r) => String(r[0]) === q || r[1].replace(/^SIG/, "") === q);
    return hit ? `${hit[1]} (${hit[0]}) — default: ${hit[2]}. ${hit[3]}` : `no signal '${ctx.args[0]}' in the table.`;
  });
  verb("errno", "LIVE", "errno <number|name> — Linux error numbers and what they are telling you", async (ctx) => {
    if (!need(ctx, 1, "errno <number|name>")) return;
    const rs = await rows("errno");
    const q = ctx.args.join(" ").trim().toUpperCase();
    const hits = /^\d+$/.test(q) ? rs.filter((r) => r[0] === Number(q)) : search(rs, q, (r) => `${r[1]} ${r[2]}`);
    return hits.length ? cap(hits.map((r) => `${String(r[0]).padStart(3)} ${r[1].padEnd(16)} ${r[2]}`)).join("\n") : `no errno matches '${q}' in the common table.`;
  });
  verb("magic", "LIVE", "magic <hex|extension> — file signatures: name bytes, or name the type from its first bytes", async (ctx) => {
    if (!need(ctx, 1, "magic <hex|extension>")) return;
    const rs = await rows("magic");
    const q = ctx.args[0].toLowerCase();
    if (/^[a-z0-9]{1,6}$/.test(q) && !/^[0-9a-f]+$/.test(q.replace(/^\./, ""))) { /* extension path below handles it */ }
    if (q.startsWith(".") || /^[a-z]{2,5}$/i.test(q) && rs.some((r) => r[1] === q.replace(/^\./, ""))) {
      const ext = q.replace(/^\./, "");
      const hits = rs.filter((r) => r[1] === ext);
      if (hits.length) return hits.map((r) => `${r[0].padEnd(38)} .${r[1]} — ${r[2]}`).join("\n");
    }
    const probe = q.replace(/0x/g, "").replace(/[^0-9a-f?]/g, "");
    if (probe.length >= 2) {
      const match = (sig: string) => {
        if (sig.length > probe.length * (sig.includes("?") ? 1 : 1)) return false;
        for (let i = 0; i < sig.length; i += 2) {
          const sb = sig.slice(i, i + 2), pb = probe.slice(i, i + 2);
          if (pb.length < 2) return false;
          if (sb !== "??" && sb !== pb) return false;
        }
        return true;
      };
      const hits = rs.filter((r) => match(r[0]));
      if (hits.length) return hits.map((r) => `${r[2]} (.${r[1]}) — signature ${r[0]}`).join("\n");
      return `no known signature matches the bytes ${probe} — an unknown format, or a signature deeper than offset 0.`;
    }
    return `no signature for '${ctx.args[0]}' — give hex bytes (89504e47…) or an extension (png).`;
  });
}

/* ---------------- encoders ---------------- */
const B32A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32encode(b: Uint8Array): string {
  let out = "", buf = 0, bits = 0;
  for (const x of b) { buf = (buf << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out += B32A[(buf >> bits) & 31]; } }
  if (bits > 0) out += B32A[(buf << (5 - bits)) & 31];
  while (out.length % 8) out += "=";
  return out;
}
function b32decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    const v = B32A.indexOf(ch); if (v < 0) throw new Error(`not base32: '${ch}'`);
    buf = (buf << 5) | v; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}
const B58A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(b: Uint8Array): string {
  let zeros = 0; while (zeros < b.length && b[zeros] === 0) zeros++;
  let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x);
  let out = "";
  while (n > 0n) { out = B58A[Number(n % 58n)] + out; n /= 58n; }
  return "1".repeat(zeros) + out;
}
function b58decode(s: string): Uint8Array {
  let zeros = 0; while (zeros < s.length && s[zeros] === "1") zeros++;
  let n = 0n;
  for (const ch of s) { const v = B58A.indexOf(ch); if (v < 0) throw new Error(`not base58: '${ch}'`); n = n * 58n + BigInt(v); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}
function b85encode(b: Uint8Array): string { // Ascii85, no <~ ~> frame
  let out = "";
  for (let i = 0; i < b.length; i += 4) {
    const chunk = b.slice(i, i + 4);
    let n = 0; for (let j = 0; j < 4; j++) n = n * 256 + (chunk[j] ?? 0);
    let enc = "";
    if (n === 0 && chunk.length === 4) enc = "z";
    else { for (let j = 0; j < 5; j++) { enc = String.fromCharCode(33 + (n % 85)) + enc; n = Math.floor(n / 85); } enc = enc.slice(0, chunk.length + 1); }
    out += enc;
  }
  return out;
}
function b85decode(s: string): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  const flush = (g: number[], count: number) => {
    let n = 0; for (const v of g) n = n * 85 + v;
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...bytes.slice(0, count));
  };
  for (const ch of s.replace(/\s/g, "")) {
    if (ch === "z") { if (group.length) throw new Error("z inside an ascii85 group"); out.push(0, 0, 0, 0); continue; }
    const v = ch.charCodeAt(0) - 33; if (v < 0 || v > 84) throw new Error(`not ascii85: '${ch}'`);
    group.push(v);
    if (group.length === 5) { flush(group, 4); group = []; }
  }
  if (group.length) { const g = [...group]; while (g.length < 5) g.push(84); flush(g, group.length - 1); }
  return new Uint8Array(out);
}
const MORSE: Record<string, string> = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", "\"": ".-..-.", "$": "...-..-", "@": ".--.-." };
const NATO: Record<string, string> = { a: "Alfa", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike", n: "November", o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu", "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Niner" };
function punyDecode(input: string): string {
  const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initBias = 72, initN = 128;
  const digit = (c: string) => { const n = c.charCodeAt(0); if (n >= 48 && n <= 57) return n - 22; if (n >= 65 && n <= 90) return n - 65; return n - 97; };
  const adapt = (d: number, pts: number, first: boolean) => {
    d = first ? Math.floor(d / damp) : Math.floor(d / 2);
    d += Math.floor(d / pts);
    let k = 0;
    while (d > ((base - tmin) * tmax) / 2) { d = Math.floor(d / (base - tmin)); k += base; }
    return k + Math.floor(((base - tmin + 1) * d) / (d + skew));
  };
  const out: number[] = [];
  let idx = input.lastIndexOf("-");
  const basic = idx >= 0 ? input.slice(0, idx) : "";
  for (const ch of basic) out.push(ch.charCodeAt(0));
  let i = 0, n = initN, bias = initBias;
  idx = idx >= 0 ? idx + 1 : 0;
  while (idx < input.length) {
    const oldi = i; let w = 1;
    for (let k = base; ; k += base) {
      if (idx >= input.length) throw new Error("truncated punycode");
      const d = digit(input[idx++]);
      i += d * w;
      const t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
      if (d < t) break;
      w *= base - t;
    }
    const pts = out.length + 1;
    bias = adapt(i - oldi, pts, oldi === 0);
    n += Math.floor(i / pts);
    i %= pts;
    out.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...out);
}

function registerEncoderFamily() {
  verb("b32e", "LIVE", "b32e <text|file> — base32 encode (RFC 4648)", async (ctx) => b32encode(bytes(ctx)));
  verb("b32d", "LIVE", "b32d <text> — base32 decode", async (ctx) => td.decode(b32decode(txt(ctx))));
  verb("b58e", "LIVE", "b58e <text|file> — base58 encode (Bitcoin alphabet)", async (ctx) => b58encode(bytes(ctx)));
  verb("b58d", "LIVE", "b58d <text> — base58 decode", async (ctx) => td.decode(b58decode(txt(ctx))));
  verb("b85e", "LIVE", "b85e <text|file> — Ascii85 encode", async (ctx) => b85encode(bytes(ctx)));
  verb("b85d", "LIVE", "b85d <text> — Ascii85 decode", async (ctx) => td.decode(b85decode(txt(ctx))));
  verb("b64url", "LIVE", "b64url [-d] <text|file> — base64url, the URL-safe armour with no padding", async (ctx) => {
    if (ctx.args.includes("-d")) return td.decode(b64ToB(ctx.args.find((a) => !a.startsWith("-")) || ""));
    return bToB64(bytes(ctx)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  });
  verb("urlenc", "LIVE", "urlenc <text> — percent-encode for a URL", async (ctx) => encodeURIComponent(txt(ctx)));
  verb("urldec", "LIVE", "urldec <text> — decode percent-encoding", async (ctx) => { try { return decodeURIComponent(txt(ctx).replace(/\+/g, " ")); } catch { throw new Error("malformed percent-encoding"); } });
  verb("htmlenc", "LIVE", "htmlenc <text> — escape text for HTML", async (ctx) => txt(ctx).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
  verb("htmldec", "LIVE", "htmldec <text> — unescape HTML entities", async (ctx) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", deg: "°", plusmn: "±", times: "×", divide: "÷", micro: "µ", para: "¶", sect: "§", dagger: "†", bull: "•", euro: "€", pound: "£", yen: "¥", cent: "¢" };
    return txt(ctx).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
      if (g[0] === "#") { const code = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : Number(g.slice(1)); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
      return named[g] ?? m;
    });
  });
  verb("unie", "LIVE", "unie <text> — escape text as \\uXXXX sequences", async (ctx) => txt(ctx).replace(/[^\x20-\x7e]/g, (c) => { const cp = c.codePointAt(0)!; return cp > 0xffff ? `\\u{${cp.toString(16)}}` : "\\u" + cp.toString(16).padStart(4, "0"); }));
  verb("unid", "LIVE", "unid <text> — read \\uXXXX and \\u{…} escapes back to text", async (ctx) => txt(ctx).replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, a, b) => String.fromCodePoint(parseInt(a || b, 16))));
  verb("qpenc", "LIVE", "qpenc <text> — quoted-printable encode (RFC 2045)", async (ctx) => {
    const b = te.encode(txt(ctx));
    let out = "";
    for (const x of b) {
      if ((x >= 33 && x <= 60) || (x >= 62 && x <= 126)) out += String.fromCharCode(x);
      else out += "=" + x.toString(16).toUpperCase().padStart(2, "0");
    }
    return out;
  });
  verb("qpdec", "LIVE", "qpdec <text> — quoted-printable decode", async (ctx) => {
    const s = txt(ctx).replace(/=\r?\n/g, "");
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
      else out.push(s.charCodeAt(i));
    }
    return td.decode(new Uint8Array(out));
  });
  verb("rot", "LIVE", "rot <n> <text> — Caesar shift by n (rot13's general)", async (ctx) => {
    if (!need(ctx, 2, "rot <n> <text>")) return;
    const n = ((Number(ctx.args[0]) % 26) + 26) % 26;
    if (!Number.isFinite(n)) throw new Error("a shift number");
    return txt(ctx, 1).replace(/[a-zA-Z]/g, (c) => { const base = c <= "Z" ? 65 : 97; return String.fromCharCode(base + ((c.charCodeAt(0) - base + n) % 26)); });
  });
  verb("rot47", "LIVE", "rot47 <text> — ROT47 over the printable ASCII band", async (ctx) => txt(ctx).replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94))));
  verb("morse", "LIVE", "morse [-d] <text> — Morse code, both ways", async (ctx) => {
    if (ctx.args.includes("-d")) {
      const revMap = new Map(Object.entries(MORSE).map(([k, v]) => [v, k]));
      const input = ctx.args.filter((a) => a !== "-d").join(" ") || ctx.stdin;
      return input.split(" / ").map((word) => word.split(/\s+/).filter(Boolean).map((sym) => revMap.get(sym) ?? "?").join("")).join(" ");
    }
    return txt(ctx).toLowerCase().split("").map((c) => c === " " ? "/" : (MORSE[c] ?? "")).filter(Boolean).join(" ");
  });
  verb("nato", "LIVE", "nato <text> — spell it in the phonetic alphabet", async (ctx) => txt(ctx).toLowerCase().split("").map((c) => NATO[c] ?? c).join(" "));
  verb("bintext", "LIVE", "bintext <text> — text as binary bytes", async (ctx) => [...te.encode(txt(ctx))].map((b) => b.toString(2).padStart(8, "0")).join(" "));
  verb("textbin", "LIVE", "textbin <bits> — binary bytes back to text", async (ctx) => {
    const bits = txt(ctx).replace(/[^01]/g, "");
    if (bits.length % 8) throw new Error("the bit count must divide by 8");
    const out = new Uint8Array(bits.length / 8);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    return td.decode(out);
  });
  verb("octtext", "LIVE", "octtext <text> — text as octal bytes", async (ctx) => [...te.encode(txt(ctx))].map((b) => b.toString(8).padStart(3, "0")).join(" "));
  verb("textoct", "LIVE", "textoct <octal> — octal bytes back to text", async (ctx) => {
    const parts = txt(ctx).split(/[\s,]+/).filter(Boolean);
    return td.decode(new Uint8Array(parts.map((p) => { const n = parseInt(p, 8); if (isNaN(n) || n > 255) throw new Error(`not an octal byte: ${p}`); return n; })));
  });
  verb("puny", "LIVE", "puny [-d] <domain> — punycode an international domain, or read xn-- back", async (ctx) => {
    if (!need(ctx, 1, "puny [-d] <domain>")) return;
    const d = ctx.args.find((a) => !a.startsWith("-"))!;
    if (ctx.args.includes("-d")) {
      return d.split(".").map((label) => label.toLowerCase().startsWith("xn--") ? punyDecode(label.slice(4)) : label).join(".");
    }
    try { return new URL(`https://${d}`).hostname; } catch { throw new Error(`not a domain: ${d}`); }
  });
  verb("uuenc", "LIVE", "uuenc <text|file> — uuencode, the old mail armour", async (ctx) => {
    const b = bytes(ctx);
    const out: string[] = [];
    for (let i = 0; i < b.length; i += 45) {
      const chunk = b.slice(i, i + 45);
      let line = String.fromCharCode(chunk.length + 32);
      for (let j = 0; j < chunk.length; j += 3) {
        const [x, y, z] = [chunk[j], chunk[j + 1] ?? 0, chunk[j + 2] ?? 0];
        const quad = [x >> 2, ((x & 3) << 4) | (y >> 4), ((y & 15) << 2) | (z >> 6), z & 63];
        line += quad.map((v) => v === 0 ? "`" : String.fromCharCode(v + 32)).join("");
      }
      out.push(line);
    }
    out.push("`", "end");
    return out.join("\n");
  });
  verb("uudec", "LIVE", "uudec <text> — uudecode back to bytes, shown as text", async (ctx) => {
    const out: number[] = [];
    let expected = 0;
    for (const line of txt(ctx).split("\n")) {
      if (!line || line === "end" || line.startsWith("begin ")) continue;
      const len = line.charCodeAt(0) - 32;
      if (len <= 0 || len > 45) continue;
      expected += len;
      const body = line.slice(1);
      for (let i = 0; i < body.length; i += 4) {
        const q = [0, 1, 2, 3].map((k) => { const c = body.charCodeAt(i + k) || 32; return c === 96 ? 0 : (c - 32) & 63; });
        out.push((q[0] << 2) | (q[1] >> 4), ((q[1] & 15) << 4) | (q[2] >> 2), ((q[2] & 3) << 6) | q[3]);
      }
    }
    return td.decode(new Uint8Array(out.slice(0, expected)));
  });
  verb("a1z26", "LIVE", "a1z26 [-d] <text> — letters as numbers (a=1 … z=26), both ways", async (ctx) => {
    if (ctx.args.includes("-d")) return ctx.args.filter((a) => a !== "-d").join(" ").split(/[\s-]+/).filter(Boolean).map((n) => { const v = Number(n); if (!(v >= 1 && v <= 26)) throw new Error(`not 1–26: ${n}`); return String.fromCharCode(96 + v); }).join("");
    return txt(ctx).toLowerCase().replace(/[^a-z ]/g, "").split("").map((c) => c === " " ? "/" : String(c.charCodeAt(0) - 96)).join(" ");
  });
  verb("escquote", "LIVE", "escquote <text> — quote a string so a POSIX shell takes it literally", async (ctx) => "'" + txt(ctx).replace(/'/g, "'\\''") + "'");
  verb("regexesc", "LIVE", "regexesc <text> — escape a string for a regular expression", async (ctx) => txt(ctx).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  verb("jsonesc", "LIVE", "jsonesc <text> — escape a string for a JSON string literal", async (ctx) => JSON.stringify(txt(ctx)));
  verb("jsonunesc", "LIVE", "jsonunesc <text> — read a JSON string literal back", async (ctx) => {
    const s = txt(ctx);
    try { return JSON.parse(s.startsWith("\"") ? s : `"${s}"`); } catch { throw new Error("not a JSON string literal"); }
  });
  verb("soundex", "LIVE", "soundex <word…> — Soundex codes, the census-taker's phonetic hash", async (ctx) => {
    if (!need(ctx, 1, "soundex <word…>")) return;
    const code = (w: string) => {
      const map: Record<string, string> = { b: "1", f: "1", p: "1", v: "1", c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2", d: "3", t: "3", l: "4", m: "5", n: "5", r: "6" };
      const s = w.toLowerCase().replace(/[^a-z]/g, "");
      if (!s) return w;
      let out = s[0].toUpperCase(), prev = map[s[0]] || "";
      for (let i = 1; i < s.length && out.length < 4; i++) {
        const c = map[s[i]] || "";
        if (c && c !== prev) out += c;
        if (s[i] !== "h" && s[i] !== "w") prev = c;
      }
      return out.padEnd(4, "0");
    };
    return ctx.args.map((w) => `${w} → ${code(w)}`).join("\n");
  });
}

/* ---------------- hashes & checksums ---------------- */
function crcTable(poly: number): number[] {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? poly ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
}
const CRC32T = crcTable(0xedb88320);
function crc32num(b: Uint8Array): number {
  let crc = 0xffffffff; for (const x of b) crc = CRC32T[(crc ^ x) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function crc16Calc(b: Uint8Array, poly: number, init: number, refin: boolean, xorout: number): number {
  let crc = init;
  const rev = (v: number, bits: number) => { let r = 0; for (let i = 0; i < bits; i++) { r = (r << 1) | (v & 1); v >>= 1; } return r; };
  for (const x of b) {
    crc ^= refin ? rev(x, 8) << 8 : x << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff;
  }
  return (refin ? rev(crc, 16) : crc) ^ xorout;
}
function registerHashFamily() {
  verb("crc16", "LIVE", "crc16 [-a arc|modbus|xmodem|ccitt] <text|file> — CRC-16 in its common flavours", async (ctx) => {
    const ai = ctx.args.indexOf("-a");
    const algo = (ai >= 0 ? ctx.args[ai + 1] : "ccitt").toLowerCase();
    const variants: Record<string, [number, number, boolean, number]> = {
      ccitt: [0x1021, 0xffff, false, 0], xmodem: [0x1021, 0, false, 0], arc: [0x8005, 0, true, 0], modbus: [0x8005, 0xffff, true, 0],
    };
    const v = variants[algo];
    if (!v) throw new Error(`unknown flavour: ${algo} (ccitt, xmodem, arc, modbus)`);
    const args = ai >= 0 ? ctx.args.filter((_a, i) => i !== ai && i !== ai + 1) : ctx.args;
    const src = args.find((a) => !a.startsWith("-")) || "";
    const data = src && ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(args.join(" ") || ctx.stdin);
    return `0x${crc16Calc(data, ...v).toString(16).padStart(4, "0")}  (crc16-${algo})`;
  });
  verb("crc8", "LIVE", "crc8 <text|file> — CRC-8 (poly 0x07) of the input", async (ctx) => {
    let crc = 0;
    for (const x of bytes(ctx)) { crc ^= x; for (let k = 0; k < 8; k++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff; }
    return "0x" + crc.toString(16).padStart(2, "0");
  });
  verb("adler32", "LIVE", "adler32 <text|file> — the Adler-32 checksum (zlib's)", async (ctx) => {
    let a = 1, b = 0;
    for (const x of bytes(ctx)) { a = (a + x) % 65521; b = (b + a) % 65521; }
    return "0x" + (((b << 16) | a) >>> 0).toString(16).padStart(8, "0");
  });
  verb("fnv", "LIVE", "fnv <text|file> — FNV-1a 32-bit hash", async (ctx) => {
    let h = 0x811c9dc5;
    for (const x of bytes(ctx)) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
    return "0x" + h.toString(16).padStart(8, "0");
  });
  verb("fnv64", "LIVE", "fnv64 <text|file> — FNV-1a 64-bit hash", async (ctx) => {
    let h = 0xcbf29ce484222325n;
    for (const x of bytes(ctx)) { h ^= BigInt(x); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return "0x" + h.toString(16).padStart(16, "0");
  });
  verb("sha384", "LIVE", "sha384 <text|file> — SHA-384 of the text, or of the named tree file", async (ctx) => {
    return bToHex(new Uint8Array(await crypto.subtle.digest("SHA-384", bytes(ctx) as BufferSource)));
  });
  verb("checksum", "LIVE", "checksum <file> — every house digest of a tree file at once", async (ctx) => {
    if (!need(ctx, 1, "checksum <file>")) return;
    if (!ctx.os.node(ctx.args[0])) throw new Error(`no such file: ${ctx.args[0]}`);
    const b = fileBytes(ctx, ctx.args[0]);
    const [s1, s256] = await Promise.all([
      crypto.subtle.digest("SHA-1", b as BufferSource),
      crypto.subtle.digest("SHA-256", b as BufferSource),
    ]);
    const textLike = b.every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127));
    return [
      `${ctx.args[0]} — ${fmtN(b.length)} bytes${textLike ? " · text" : " · binary"}`,
      `  md5     ${md5(b)}`,
      `  sha1    ${bToHex(new Uint8Array(s1))}`,
      `  sha256  ${bToHex(new Uint8Array(s256))}`,
      `  crc32   0x${crc32num(b).toString(16).padStart(8, "0")}`,
    ].join("\n");
  });
  verb("pbkdf2", "LIVE", "pbkdf2 <password> <salt> [iterations] — PBKDF2-HMAC-SHA256, 32 bytes out", async (ctx) => {
    if (!need(ctx, 2, "pbkdf2 <password> <salt> [iterations]")) return;
    const iters = Math.min(Number(ctx.args[2]) || 100000, 5000000);
    const key = await crypto.subtle.importKey("raw", te.encode(ctx.args[0]), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode(ctx.args[1]) as BufferSource, iterations: iters }, key, 256);
    return `${bToHex(new Uint8Array(bits))}  (${fmtN(iters)} iterations)`;
  });
  verb("hashid", "LIVE", "hashid <hash> — name a hash by its shape", async (ctx) => {
    if (!need(ctx, 1, "hashid <hash>")) return;
    const h = ctx.args[0].trim();
    const out: string[] = [];
    if (/^\$2[aby]\$\d{2}\$/.test(h)) out.push("bcrypt password hash");
    if (/^\$argon2/.test(h)) out.push("Argon2 password hash");
    if (/^\$6\$/.test(h)) out.push("SHA-512 crypt (shadow)");
    if (/^\$5\$/.test(h)) out.push("SHA-256 crypt (shadow)");
    if (/^\$1\$/.test(h)) out.push("MD5 crypt (shadow, legacy)");
    if (/^[0-9a-fA-F]{32}$/.test(h)) out.push("32 hex — MD5, MD4, or NTLM (all wear this shape)");
    if (/^[0-9a-fA-F]{40}$/.test(h)) out.push("40 hex — SHA-1 (or RIPEMD-160)");
    if (/^[0-9a-fA-F]{56}$/.test(h)) out.push("56 hex — SHA-224 or SHA3-224");
    if (/^[0-9a-fA-F]{64}$/.test(h)) out.push("64 hex — SHA-256, SHA3-256, BLAKE2s, or a double-MD5 construction");
    if (/^[0-9a-fA-F]{96}$/.test(h)) out.push("96 hex — SHA-384");
    if (/^[0-9a-fA-F]{128}$/.test(h)) out.push("128 hex — SHA-512, SHA3-512, or Whirlpool");
    if (/^[0-9a-fA-F]{16}$/.test(h)) out.push("16 hex — a 64-bit hash: FNV-1a 64, xxHash64, or a truncated digest");
    if (/^\{SHA\}/.test(h)) out.push("LDAP {SHA} — base64 SHA-1 with a label");
    if (/^[A-Za-z0-9+/]{43}=$/.test(h)) out.push("44-char base64 — likely a raw SHA-256 digest armoured");
    if (/^[A-Za-z0-9+/]{86}==$/.test(h)) out.push("88-char base64 — likely a raw SHA-512 digest armoured");
    return out.length ? out.join("\n") : `no known shape matches '${h.slice(0, 24)}…' — length ${h.length}. shape is a first guess, never proof: verify against the source.`;
  });
  verb("fp", "LIVE", "fp <hex> — a digest dressed as a fingerprint: colon pairs, and the SSH-style base64", async (ctx) => {
    if (!need(ctx, 1, "fp <hex>")) return;
    const b = hexToB(ctx.args[0]);
    const colon = [...b].map((x) => x.toString(16).padStart(2, "0")).join(":");
    const ssh = bToB64(new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))).replace(/=+$/, "");
    return `colon    ${colon}\nssh-style  SHA256:${ssh}  (the fingerprint of these ${b.length} bytes, as SSH would print it)`;
  });
}

/* ---------------- generators ---------------- */
const NANO_A = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const WORDS = "amber anvil arrow aspen atlas badge bamboo banner basil beacon beret birch blade blaze bolt bonus bottle breeze bridge brook broom bubble bucket budget buffer bullet bundle burden button cable cactus candle cannon canvas canyon carbon carpet castle casual catalog cedar census center chain chair chalk chance chapter charm chart chase cheap check cheese cherry chess chest chief child chill choice church circle citrus civil claim class clay clean clear clerk clever click cliff climb clinic clock close cloth cloud club coach coast code coffee coil coin cold collar colony color column comet comfort comic command comet common compact company compare compass complex concert conduct copper copy coral cord core cork corn corner correct cotton couch cough council count county couple course cousin cover crack craft crane crash crazy cream credit creek crew crib crime crisis critic crop cross crowd crown crucial crush crystal cube culture cupboard current curtain curve cushion custom cycle daily dairy daisy damage dance danger daring dark dawn deadline deal debate debris decade decide decor decrease deep deer defeat defend degree delay delta demand demo dense dental deny depart depend deposit depth desert design desk detail device dial diamond diary dice diesel diet differ digest digital dilemma dinner direct dirt disco discuss disease dish distance ditch dive divide dizzy doctor dollar domain door double dough dove dozen draft dragon drain drama draw dream dress drift drill drink drip drive drop drown drum dry duck duct dude dune dungeon dust duty dwarf dwell dynamic eager eagle ear early earn earth easy eat echo edge edit educate effort egg eight elbow elder elect element elite else email embrace emerge emotion empire empty enable enact end enemy energy engine english enjoy enough enter entire entry envy episode equal equip error escape essay estate ethics even event every exact exam example excess excuse execute exist exit expand expect expert expire explain export expose extend extra eye fabric face fact factor factory faculty fade fail fair faith fall false family fan fancy farm fashion fast fatal fate father fault favor fear feature february federal fee feed feel fellow fence fever few fiber fiction field fierce fifth fight figure file fill film filter final finance find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor fleet flesh flight float flock flood floor flour flow flu fluid flush focus fog fold folk follow food fool foot force ford forest forget fork form format former forth fortune forum forward found fourth fox fraction frame free freeze fresh friction friend fringe frog front frost fruit fuel full fun fund funny fur furniture future gadget gain galaxy gallery game gap garage garden gas gather gauge gear gender gentle genuine gesture ghost giant gift giggle giraffe ginger girl give glad glance glare glass glide glimpse globe glory glove glow glue goal goat gold golf good goose gorilla gossip govern gown grab grace grade grain grand grant grape graph grasp grass gray great green grid grief grill grin grip grit groan groom gross ground group grove grow grunt guard guess guest guide guilt guitar gun gust gym habit hair half hall halt hammer hamster hand handle handy hang happen happy harbor hard harm harness harvest hat hatch hate have hawk hazard head health heap hear heart heat heavy heel height helicopter hell hello helmet help hen hero hidden high hike hill hint hip hire history hit hobby hockey hold hole home honest honey hood hope horn horror horse hospital host hotel hour house hover howl huge human humor hunger hunt hurry hurt husband hut hybrid ice icon idea ideal idle idol igloo ill image imagine impact import impose improve inch include income indeed index indoor infant inflame inform inhale inherit initial inject injury inner input insect inside insist inspect inspire install instant intact intake integer intend intense interact interest internal into invent invest invite involve iron island issue item itself jacket january jazz jeans jelly jewel job join joke jolly journal journey joy judge juice jump june jungle junior jury just keen keep kettle key kick kid kind king kiss kit kitchen knee knife knock know koala lab label labor lack ladder lady lake lamp land lane language lap large laser last late laugh laundry lava law lawn lawsuit layer lazy lead leaf league lean learn lease least leather leave lecture left leg legal legend leisure lemon lend length lens leopard lesson let letter level liability library license life lift light lightning like likely lily limb limit line link lion liquid list listen liter little live load loan lobby lobster local lock lodge log logic lonely long look loose lose loss lot loud lounge love lower loyal lucky luggage lumber lump lunar lunch lung lure lurk lush luxury machine mad magic magnet mail main major make male mall manage manner manual many map marble march margin marine mark market marriage mask mass master match material math matrix matter max may mayor meal mean measure meat mechanic medal media medical meet melon melt member memory mental mention menu mercy mere merit mess metal meter method metro mexico middle might mild mile milk mill mind mine minimum minor minute miracle mirror miss mistake mix mobile model modern modest modify mom moment monitor monk monkey monster month mood moon moral more morning mortgage most mother motion motor mount mouse mouth move movie much mud muffin mule multiple muscle museum music must mutual mystery myth nail name narrow nasty nation native nature near neat neck need needle negate neglect neither nerve nest net network neutral never new news next nice night noble noise none noodle norm normal north nose notable note nothing notice notion novel now nuclear number nurse nut oak oath obesity obey object oblige obscure observe obtain obvious occur ocean october odd off offer officer often oil okay old olive olympic omit once one onion online only open opinion oppose optic option orange orbit orchard order ordinary other otter ought ounce our outcome outer outfit outline output outside oven over own oxide oxygen oyster pace pack package pact paddle page pain paint pair palace pale palm panda panel panther paper parade parent park parrot part party pass past patch path patient patrol pattern pause pave paw pay peace peach peanut pear peasant pedal peek peel peep peer pen penalty pencil people pepper perfect perform perhaps period permit person pet phase phone photo phrase physical piano pick picnic picture pie piece pig pilot pin pink pioneer pipe pitch pizza place plain plan plane planet plant plastic plate platform play plaza plead pleasant please pleasure plenty plot plus pocket poem poet point polar pole police polish polite poll polo pond pool poor pop popular pork port pose position positive possess post pot potato potential pound pour powder power practical praise prayer precise predict prefer premise premium prepare present press pressure pretend pretty prevent price pride priest primarily prime principal print prior prison private prize probably problem process produce product profess profit program progress project promise prompt proof proper prosper protect proud prove prune public pudding pull pulp pulse pump punch pupil pure purple purpose push put puzzle pyramid quality quantum quarter queen question quick quiet quit quite rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather ratio raw ray reach react read ready real realm rear reason rebel rebuild recall receive recent recess reckon record recover recycle red reduce refer reform refrain regard region register regret regular regulate reinforce reject relax relay release relent relief rely remain remark remedy remember remind remove render rent repair repeat replace reply report rescue resemble reserve reset resist resolve resort respect respond rest result resume retain retire return reunion reveal revenge review reward rhyme rib ribbon rice rich rid ride rifle right rigid ring riot rip rise risk ritual rival river road roar roast robot robust rocket romantic roof rook room root rope rose rough round route row royalty rub rude rug ruin rule rumor run runway rural rust ruth sad safe sail saint salad salary sale salt salute same sample sand satisfy sauce save say scale scan scar scatter scene scheme scholar school science scissor scope score scout scrap scratch screen screw script sea seal search season seat second secret section secure see seed seek seem select sell send senior sense sentence separate sequence serial series serious serve set setup seven severe sex shabby shadow shaft shame shape share sharp shave shed sheep sheet shelf shell shield shift shine ship shirt shock shoe shoot shop short shot shoulder shout show shower shrug shuffle shy sick side sigh sight sign silent silk sill silver similar simple since sing sink sir sister six size ski skill skin skirt skull slab slam slap slash slate slavery sleep slice slide slight slim sling slip slope slow slump small smart smash smell smile smoke smooth snack snake snap snare snarl snatch sneer sneeze sniff snore snow soak soap soccer social sock soda soft soil solar sold sole solid solution solve some son song soon sorry sort soul sound soup source south space spare spark spatial speak spear special speed spell spend sphere spider spill spin spirit split spoil sponsor spoon sport spot spray spread spring square squid stable staff stage stain stair stake stalemate stand standard star stare start state station stay steady steak steal steam steel steer stem step stew stick stiff still sting stink stir stock stomach stone stoop stop store storm story stove strain strange strap straw stream street strength stress stretch strict strike string strip strive strong structure stubborn student studio stuff stumble style subject submit substance suburb success such sudden sue suffer sugar suggest suit suite summer summit sun sunday sunset super supply supreme sure surface surge surprise surround survey survive suspect sustain swagger swallow swamp swap swarm swear sweat sweep sweet swift swim swing sword symbol system table tack tackle tad tag tail take talented talk tall tank tap tape target tarry task taste tattoo taxi tea teach team tear technical teen telescope tell temper temperature temple tempo ten tenant tend tennis tense tenth term terrace terrain terror test text than thank theater their theme then therapy there thick thief thin thing think third thorn thorough though thousand threat three throat throne through throw thrust thumb thunder ti ticket tide tie tight tile till tilt timber time tiny tip tired title toast today toddler toe together tomato tomorrow ton tone tongue tool tooth top torch torrent torrid total touch tough tour toward towel tower town toxic toy trace track trade trail train trait tramp transfer transform transit translate trap trash travel tray treasure treat tree trek trench trend trial tribe trick trigger trillion trio trip troop trophy trouble truck true truly trumpet trunk trust truth try tube tumble tuna tunnel turbo turn turtle tutor twelve twenty twice twin twist two type typical ugly ultra umbrella unable unaware uncle under uniform union unique unit united universe unknown unless unlock until unusual update upgrade upper upset urban urge us use used useful useless usual vacation valid valley value van vanish vapor various vary vase vast vehicle vendor venture venue verb verdict verify version versus very vessel veteran via vicious victim victory view village violence violin virtual virus visa visible visitor visual vital vivid vocal voice volcano volume volunteer vote voyage vague vulture wage wagon wait wake walk wall wander want war warm warn warp wash wasp waste watch water wave way wealth weapon wear weather weave web wedding wednesday weed week weird welcome welfare west wet whale what wheat wheel when where which while whisper whistle white who whole why wide wife wild will win wind window wine wing winner winter wipe wire wisdom wise wish with within wizard wolf woman wonder wood wool word work worm worry worth wound wrap wrestle wrist write writer wrong yard year yeast yellow yes yet yield you young your youth zebra zero zigzag zone zoo zoom".split(" ");
function registerGeneratorFamily() {
  verb("uuid7", "LIVE", "uuid7 — a time-ordered UUID, version 7", async () => {
    const b = rng(16);
    let t = BigInt(Date.now());
    for (let i = 5; i >= 0; i--) { b[i] = Number(t & 0xffn); t >>= 8n; }
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = bToHex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  });
  verb("uuidinfo", "LIVE", "uuidinfo <uuid> — version, variant, and (for v7) its birth time", async (ctx) => {
    if (!need(ctx, 1, "uuidinfo <uuid>")) return;
    const m = ctx.args[0].match(/^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})$/);
    if (!m) throw new Error("not a UUID in 8-4-4-4-12 form");
    const version = parseInt(m[3][0], 16);
    const variantBits = parseInt(m[4][0], 16);
    const variant = variantBits < 8 ? "NCS (reserved)" : variantBits < 12 ? "RFC 4122 / RFC 9562" : variantBits < 14 ? "Microsoft" : "reserved future";
    let extra = "";
    if (version === 7) { const ts = parseInt(m[1] + m[2], 16); extra = `\ntimestamp   ${new Date(ts).toISOString()} (from the v7 time field)`; }
    if (version === 1) extra = "\nnote        v1 embeds a MAC address and a 100 ns clock — it leaks where and when it was minted";
    return `version ${version} · variant ${variant}${extra}`;
  });
  verb("randmac", "LIVE", "randmac — a fresh locally-administered unicast MAC", async () => {
    const b = rng(6); b[0] = (b[0] & 0xfc) | 0x02;
    return [...b].map((x) => x.toString(16).padStart(2, "0")).join(":");
  });
  verb("randip", "LIVE", "randip [cidr] — a random IPv4 address, or a random host inside a block", async (ctx) => {
    if (ctx.args[0]) {
      const { ip, p } = parseCidr(ctx.args[0]);
      const net = (ip & maskFor(p)) >>> 0, span = Math.pow(2, 32 - p);
      const off = Math.floor((rng(4).reduce((a, x) => a * 256 + x, 0) / 4294967296) * span);
      return ipStr((net + off) >>> 0);
    }
    return ipStr(rng(4).reduce((a, x) => a * 256 + x, 0) >>> 0);
  });
  verb("randip6", "LIVE", "randip6 [prefix/len] — a random IPv6 address, or a random one inside a prefix", async (ctx) => {
    const b = rng(16);
    let n = b.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
    if (ctx.args[0]) {
      const [addr, lenS] = ctx.args[0].split("/");
      const base = parseIp6(addr); const len = Number(lenS);
      if (base === null || !Number.isInteger(len) || len < 0 || len > 128) throw new Error("a prefix like 2001:db8::/32");
      const hostMask = (1n << BigInt(128 - len)) - 1n;
      n = (base & ~hostMask) | (n & hostMask);
    }
    return ip6Compress(n);
  });
  verb("randport", "LIVE", "randport — a random ephemeral port", async () => String(49152 + (rng(2)[0] * 256 + rng(2)[1]) % 16384));
  verb("randtoken", "LIVE", "randtoken [bytes] [hex|b64] — random bytes as a token", async (ctx) => {
    const n = Math.min(Number(ctx.args[0]) || 16, 512);
    if (!Number.isInteger(n) || n <= 0) throw new Error("a byte count");
    const b = rng(n);
    return (ctx.args[1] || "hex").toLowerCase() === "b64" ? bToB64(b) : bToHex(b);
  });
  verb("password", "LIVE", "password [length] [-s] — a fresh password from the room's dice (crypto-random)", async (ctx) => {
    const len = Math.min(Math.max(Number(ctx.args.find((a) => /^\d+$/.test(a))) || 20, 4), 256);
    let pool = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    if (ctx.args.includes("-s")) pool += "!@#$%^&*()-_=+[]{}<>?";
    if (ctx.args.includes("-a")) pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" + (ctx.args.includes("-s") ? "!@#$%^&*()-_=+[]{}<>?" : "");
    let out = "";
    const b = rng(len * 2);
    for (let i = 0; out.length < len && i < b.length; i++) if (b[i] < 256 - (256 % pool.length)) out += pool[b[i] % pool.length];
    return out;
  });
  verb("passphrase", "LIVE", "passphrase [words] — a diceware-style passphrase from the house list", async (ctx) => {
    const n = Math.min(Math.max(Number(ctx.args[0]) || 5, 2), 12);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(pickRng(WORDS));
    return out.join("-");
  });
  verb("pwcheck", "LIVE", "pwcheck <password> — an honest entropy estimate of a password", async (ctx) => {
    if (!need(ctx, 1, "pwcheck <password>")) return;
    const p = ctx.args.join(" ");
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26; if (/[A-Z]/.test(p)) pool += 26; if (/[0-9]/.test(p)) pool += 10; if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
    const bits = pool ? p.length * Math.log2(pool) : 0;
    const common = /^(password|123456|qwerty|letmein|admin|welcome|iloveyou)/i.test(p);
    const verdict = common ? "it is on every attacker's first page — worthless" : bits < 40 ? "weak — a rig chews this in hours" : bits < 65 ? "fair — fine for low-value doors" : bits < 90 ? "strong" : "very strong";
    return `${p.length} chars · pool ~${pool} · ≈${bits.toFixed(0)} bits if every char were random — ${verdict}. (an estimate of shape, not a promise: real strength lives in how it was made.)`;
  });
  verb("nanoid", "LIVE", "nanoid [length] — a compact URL-safe id", async (ctx) => {
    const len = Math.min(Math.max(Number(ctx.args[0]) || 21, 4), 128);
    let out = "";
    const b = rng(len * 2);
    for (let i = 0; out.length < len && i < b.length; i++) if (b[i] < 252) out += NANO_A[b[i] % NANO_A.length] || NANO_A[0];
    return out;
  });
  verb("ulid", "LIVE", "ulid [-d <ulid>] — mint a ULID, or read the time inside one", async (ctx) => {
    const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    if (ctx.args.includes("-d")) {
      const s = (ctx.args[ctx.args.indexOf("-d") + 1] || "").toUpperCase();
      if (s.length !== 26) throw new Error("a ULID is 26 characters");
      let t = 0; for (let i = 0; i < 10; i++) { const v = A.indexOf(s[i]); if (v < 0) throw new Error(`not Crockford base32: '${s[i]}'`); t = t * 32 + v; }
      return `${s} was minted at ${new Date(t).toISOString()}`;
    }
    let t = Date.now(), time = "";
    for (let i = 0; i < 10; i++) { time = A[t % 32] + time; t = Math.floor(t / 32); }
    let randPart = "";
    const b = rng(16);
    for (let i = 0; i < 16; i++) randPart += A[b[i] % 32];
    return time + randPart;
  });
  verb("objectid", "LIVE", "objectid [-d <id>] — mint a Mongo-style ObjectId, or read the time inside one", async (ctx) => {
    if (ctx.args.includes("-d")) {
      const s = ctx.args[ctx.args.indexOf("-d") + 1] || "";
      if (!/^[0-9a-fA-F]{24}$/.test(s)) throw new Error("an ObjectId is 24 hex digits");
      const ts = parseInt(s.slice(0, 8), 16);
      return `minted ${new Date(ts * 1000).toISOString()} · machine/process ${s.slice(8, 18)} · counter ${parseInt(s.slice(18), 16)}`;
    }
    const now = Math.floor(Date.now() / 1000);
    return now.toString(16).padStart(8, "0") + bToHex(rng(8));
  });
  verb("dice", "LIVE", "dice <NdM[+K]> — roll the dice, honestly (crypto-random)", async (ctx) => {
    if (!need(ctx, 1, "dice <NdM[+K]>")) return;
    const m = ctx.args[0].match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) throw new Error("dice speak: 2d6, d20, 3d8+2");
    const n = Math.min(Number(m[1] || 1), 100), sides = Math.min(Number(m[2]), 1000), k = Number(m[3] || 0);
    if (n <= 0 || sides <= 1) throw new Error("at least one die, at least two sides");
    const rolls: number[] = [];
    const b = rng(n * 2);
    for (let i = 0; i < n; i++) rolls.push((b[i] % sides) + 1);
    return `${rolls.join(" + ")}${k ? ` ${k > 0 ? "+" : "−"} ${Math.abs(k)}` : ""} = ${rolls.reduce((a, x) => a + x, 0) + k}`;
  });
  verb("snowflake", "LIVE", "snowflake <id> — read the timestamp inside a Discord/Twitter-style snowflake", async (ctx) => {
    if (!need(ctx, 1, "snowflake <id>")) return;
    let id: bigint;
    try { id = BigInt(ctx.args[0]); } catch { throw new Error("a snowflake is an integer"); }
    const discord = Number((id >> 22n) + 1420070400000n);
    const twitter = Number((id >> 22n) + 1288834974657n);
    return `discord epoch → ${new Date(discord).toISOString()} · worker ${Number((id >> 17n) & 31n)} · process ${Number((id >> 12n) & 31n)} · increment ${Number(id & 4095n)}\ntwitter epoch → ${new Date(twitter).toISOString()}`;
  });
  verb("pick", "LIVE", "pick <a> <b> [c…] — the room chooses, fairly", async (ctx) => {
    if (!need(ctx, 2, "pick <a> <b> [c…]")) return;
    return pickRng(ctx.args);
  });
  verb("shuffle", "LIVE", "shuffle [file] — shuffle lines (stdin or a tree file)", async (ctx) => {
    const ls = lines(ctx);
    for (let i = ls.length - 1; i > 0; i--) { const j = Math.floor((rng(1)[0] / 256) * (i + 1)); [ls[i], ls[j]] = [ls[j], ls[i]]; }
    return ls.join("\n");
  });
}

/* ---------------- admin builders & calculators ---------------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOWS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function parseCronField(field: string, min: number, max: number, names?: Record<string, number>): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    let base = part, step = 1;
    if (part.includes("/")) { const [b, s] = part.split("/"); base = b; step = Number(s); if (!step) return null; }
    let lo = min, hi = max;
    if (base !== "*") {
      const conv = (v: string) => { const n = names?.[v.toLowerCase()]; return n !== undefined ? n : Number(v); };
      if (base.includes("-")) { const [a, b2] = base.split("-"); lo = conv(a); hi = conv(b2); }
      else { lo = hi = conv(base); }
      if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}
function cronSets(expr: string) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error("a cron line is five fields: minute hour day-of-month month day-of-week");
  const monNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const dowNames = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const mins = parseCronField(f[0], 0, 59), hrs = parseCronField(f[1], 0, 23), dom = parseCronField(f[2], 1, 31), mon = parseCronField(f[3], 1, 12, monNames), dow = parseCronField(f[4], 0, 7, dowNames);
  if (!mins || !hrs || !dom || !mon || !dow) throw new Error("a field would not parse — use numbers, ranges (1-5), lists (1,15), and steps (*/15)");
  if (dow.has(7)) { dow.delete(7); dow.add(0); }
  return { mins, hrs, dom, mon, dow, domAny: f[2] === "*", dowAny: f[4] === "*" };
}
function registerAdminFamily() {
  verb("chmod", "LIVE", "chmod <mode> — read a mode in octal or symbols, get both and what it grants", async (ctx) => {
    if (!need(ctx, 1, "chmod <mode>")) return;
    const s = ctx.args[0];
    let bits: number[];
    let special = 0;
    if (/^[0-7]{3,4}$/.test(s)) { const n = parseInt(s, 8); bits = [(n >> 6) & 7, (n >> 3) & 7, n & 7]; special = s.length === 4 ? Number(s[0]) : 0; }
    else if (/^[rwxstST-]{9}$/.test(s)) {
      bits = [0, 0, 0];
      for (let g = 0; g < 3; g++) for (let i = 0; i < 3; i++) {
        const c = s[g * 3 + i];
        bits[g] |= c === "r" ? 4 : c === "w" ? 2 : c === "x" || c === "s" || c === "t" ? 1 : 0;
        if (i === 2 && c === "s") special |= g === 0 ? 4 : 2;
        if (i === 2 && c === "t") special |= 1;
      }
    } else throw new Error("a mode: three octal digits (755), four with specials (4755), or nine symbols (rwxr-xr-x)");
    const syms = bits.map((b) => (b & 4 ? "r" : "-") + (b & 2 ? "w" : "-") + (b & 1 ? "x" : "-")).join("");
    const octal = (special ? String(special) : "") + bits.map((b) => String(b)).join("");
    const words = bits.map((b, i) => `${["owner", "group", "others"][i]}: ${[b & 4 && "read", b & 2 && "write", b & 1 && "execute"].filter(Boolean).join(" + ") || "nothing"}`);
    const specialNote = special ? ` · specials ${special & 4 ? "setuid " : ""}${special & 2 ? "setgid " : ""}${special & 1 ? "sticky" : ""}`.replace(/ · specials $/, "") : "";
    return `${octal} = ${syms}${specialNote}\n  ${words.join("\n  ")}\non a directory, execute means 'may enter and reach names inside'; read alone lists names but cannot open them.`;
  });
  verb("umask", "LIVE", "umask [mask] — what a umask leaves for new files and directories", async (ctx) => {
    const s = ctx.args[0] || "022";
    if (!/^[0-7]{3}$/.test(s)) throw new Error("a three-digit octal umask, e.g. 022");
    const m = parseInt(s, 8);
    const file = 0o666 & ~m, dir = 0o777 & ~m;
    const sym = (b: number) => [6, 3, 0].map((sh) => { const v = (b >> sh) & 7; return (v & 4 ? "r" : "-") + (v & 2 ? "w" : "-") + (v & 1 ? "x" : "-"); }).join("");
    return `umask ${s} → new files ${file.toString(8)} (${sym(file)}) · new directories ${dir.toString(8)} (${sym(dir)})\nthe umask only ever subtracts: files start at 666, directories at 777, and the mask's bits are removed.`;
  });
  verb("cronx", "LIVE", "cronx <5-field expr> — a cron expression explained field by field", async (ctx) => {
    if (!need(ctx, 1, "cronx <expr>")) return;
    const expr = ctx.args.join(" ");
    const s = cronSets(expr);
    const list = (set: Set<number>, fmt: (n: number) => string) => { const a = [...set].sort((x, y) => x - y); return a.length > 12 ? `${a.slice(0, 6).map(fmt).join(", ")} … (${a.length} values)` : a.map(fmt).join(", "); };
    return [
      `'${expr}'`,
      `  minute       ${list(s.mins, (n) => String(n))}`,
      `  hour         ${list(s.hrs, (n) => String(n).padStart(2, "0") + ":00")}`,
      `  day of month ${list(s.dom, (n) => String(n))}`,
      `  month        ${list(s.mon, (n) => MONTHS[n - 1])}`,
      `  day of week  ${list(s.dow, (n) => DOWS[n])}`,
      s.domAny || s.dowAny ? "  note: standard cron runs when EITHER the day-of-month or the day-of-week matches (when both are restricted) — the classic surprise." : "  both day fields are wildcards or one field is restricted — no either/or trap here.",
    ].join("\n");
  });
  verb("cronnext", "LIVE", "cronnext <5-field expr> [n] — the next n times a cron line fires", async (ctx) => {
    if (!need(ctx, 1, "cronnext <expr> [n]")) return;
    const maybeN = Number(ctx.args[ctx.args.length - 1]);
    const hasN = Number.isInteger(maybeN) && ctx.args.length > 1 && String(maybeN) === ctx.args[ctx.args.length - 1];
    const n = hasN ? Math.min(Math.max(maybeN, 1), 25) : 5;
    const expr = (hasN ? ctx.args.slice(0, -1) : ctx.args).join(" ");
    const s = cronSets(expr);
    const out: string[] = [];
    const t = new Date();
    t.setSeconds(0, 0); t.setMinutes(t.getMinutes() + 1);
    const cap = 366 * 24 * 60;
    for (let i = 0; i < cap && out.length < n; i++) {
      const domHit = s.dom.has(t.getDate()), dowHit = s.dow.has(t.getDay());
      const dayHit = (!s.domAny && !s.dowAny) ? (domHit || dowHit) : (domHit && dowHit);
      if (s.mins.has(t.getMinutes()) && s.hrs.has(t.getHours()) && s.mon.has(t.getMonth() + 1) && dayHit)
        out.push(t.toLocaleString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
      t.setMinutes(t.getMinutes() + 1);
    }
    return out.length ? out.join("\n") : "no firing found in the next year — check the expression (cronx explains it)";
  });
  const kvFlags = (args: string[]) => {
    const flags: Record<string, string> = {}; const free: string[] = [];
    for (const a of args) { const m = a.match(/^--([a-z-]+)(?:=(.*))?$/); if (m) flags[m[1]] = m[2] ?? "true"; else free.push(a); }
    return { flags, free };
  };
  verb("unit", "LIVE", "unit <name> --exec=<cmd> [--user --desc --restart --after --wantedby] — a systemd service unit, written", async (ctx) => {
    if (!need(ctx, 1, "unit <name> --exec=<cmd>")) return;
    const { flags, free } = kvFlags(ctx.args.slice(1));
    if (!flags.exec) throw new Error("a unit needs --exec=<the command it runs>");
    const name = free[0] || ctx.args[0];
    return [
      `# /etc/systemd/system/${name}.service`,
      "[Unit]",
      `Description=${flags.desc || name}`,
      `After=${flags.after || "network.target"}`,
      flags.wants ? `Wants=${flags.wants}` : "",
      "",
      "[Service]",
      `ExecStart=${flags.exec}`,
      flags.user ? `User=${flags.user}` : "",
      flags.workdir ? `WorkingDirectory=${flags.workdir}` : "",
      `Restart=${flags.restart || "on-failure"}`,
      flags.env ? `Environment=${flags.env}` : "",
      "",
      "[Install]",
      `WantedBy=${flags.wantedby || "multi-user.target"}`,
      "# then: systemctl daemon-reload && systemctl enable --now " + name,
    ].filter((l) => l !== "").join("\n");
  });
  verb("systimer", "LIVE", "systimer <name> --calendar=<spec> --service=<unit> — a systemd timer unit", async (ctx) => {
    if (!need(ctx, 1, "systimer <name> --calendar=<spec>")) return;
    const { flags } = kvFlags(ctx.args.slice(1));
    if (!flags.calendar) throw new Error("a timer needs --calendar=<OnCalendar spec, e.g. 'daily', 'Mon 03:00', '*-*-* 04:30:00'>");
    return [
      `# /etc/systemd/system/${ctx.args[0]}.timer`,
      "[Unit]",
      `Description=timer for ${flags.service || ctx.args[0]}`,
      "",
      "[Timer]",
      `OnCalendar=${flags.calendar}`,
      flags.boot ? `OnBootSec=${flags.boot}` : "",
      `Persistent=${flags.persistent || "true"}`,
      `Unit=${flags.service || ctx.args[0] + ".service"}`,
      "",
      "[Install]",
      "WantedBy=timers.target",
    ].filter((l) => l !== "").join("\n");
  });
  verb("fstab", "LIVE", "fstab <device> <mount> <fs> [options] [dump] [pass] — an /etc/fstab line, explained", async (ctx) => {
    if (!need(ctx, 3, "fstab <device> <mount> <fs> [options] [dump] [pass]")) return;
    const [dev, mnt, fs, opts = "defaults", dump = "0", pass = mnt === "/" ? "1" : "2"] = ctx.args;
    return `${dev}  ${mnt}  ${fs}  ${opts}  ${dump}  ${pass}\n  device '${dev}' (a UUID=… is sturdier than /dev/sdX — names move) · mount point ${mnt} · type ${fs} · options ${opts} · dump ${dump} (the old dump backup flag, almost always 0 now) · pass ${pass} (fsck order: 1 = root first, 2 = others, 0 = never)`;
  });
  verb("sudoers", "LIVE", "sudoers <user> [--cmd=<path>] [-n] — a sudoers line, and its blast radius", async (ctx) => {
    if (!need(ctx, 1, "sudoers <user> [--cmd=<path>]")) return;
    const { flags } = kvFlags(ctx.args.slice(1));
    const cmd = flags.cmd || "ALL";
    const line = `${ctx.args[0]} ALL=(ALL) ${ctx.args.includes("-n") ? "NOPASSWD: " : ""}${cmd}`;
    const radius = cmd === "ALL" ? "FULL ROOT, everything — this user is root with extra steps" : `one door: ${cmd} only (mind commands that shell out — editors, pagers, find -exec)`;
    return `${line}\n  blast radius: ${radius}\n  write it in /etc/sudoers.d/ with mode 0440, and always check with visudo -c before trusting it.`;
  });
  verb("sshconf", "LIVE", "sshconf <host> [--hostname --user --port --key --proxy] — an ssh_config stanza", async (ctx) => {
    if (!need(ctx, 1, "sshconf <host> [--hostname=h --user=u --port=p --key=path --proxy=jump]")) return;
    const { flags } = kvFlags(ctx.args.slice(1));
    return [
      `Host ${ctx.args[0]}`,
      flags.hostname ? `    HostName ${flags.hostname}` : "",
      flags.user ? `    User ${flags.user}` : "",
      flags.port ? `    Port ${flags.port}` : "",
      flags.key ? `    IdentityFile ${flags.key}` : "",
      flags.proxy ? `    ProxyJump ${flags.proxy}` : "",
      "    ServerAliveInterval 30",
    ].filter(Boolean).join("\n");
  });
  verb("resolvconf", "LIVE", "resolvconf <ns…> [--search=domain] — a resolv.conf, written", async (ctx) => {
    const { flags, free } = kvFlags(ctx.args);
    if (!free.length) throw new Error("at least one nameserver address");
    for (const ns of free) if (parseIp(ns) === null && parseIp6(ns) === null) throw new Error(`not a nameserver address: ${ns}`);
    return [...(flags.search ? [`search ${flags.search}`] : []), ...free.slice(0, 3).map((ns) => `nameserver ${ns}`), "options timeout:2 attempts:3"].join("\n") + (free.length > 3 ? `\n# note: only the first 3 nameservers are ever read — ${free.length} given` : "");
  });
  verb("logrot", "LIVE", "logrot <path> [--size --rotate --compress --daily] — a logrotate block", async (ctx) => {
    if (!need(ctx, 1, "logrot <path> [--size=100M --rotate=14]")) return;
    const { flags } = kvFlags(ctx.args.slice(1));
    return [
      `${ctx.args[0]} {`,
      `    ${flags.daily ? "daily" : "weekly"}`,
      flags.size ? `    size ${flags.size}` : "    maxsize 100M",
      `    rotate ${flags.rotate || "14"}`,
      flags.nocompress ? "    nocompress" : "    compress",
      "    missingok",
      "    notifempty",
      "    copytruncate",
      "}",
    ].join("\n");
  });
  verb("sla", "LIVE", "sla <percent> — an availability promise turned into allowed downtime", async (ctx) => {
    if (!need(ctx, 1, "sla <percent>")) return;
    const p = Number(ctx.args[0]);
    if (!(p > 0 && p < 100)) throw new Error("a percentage like 99.9 or 99.99");
    const err = 100 - p;
    const per = (mins: number) => { const m = mins * err / 100; return m >= 1440 ? (m / 1440).toFixed(2) + " days" : m >= 60 ? (m / 60).toFixed(2) + " hours" : m.toFixed(1) + " minutes"; };
    return `${p}% uptime allows:\n  per day    ${per(1440)}\n  per month  ${per(43200)}  (30 days)\n  per year   ${per(525600)}\ncount the nines: 99 = two, 99.9 = three, 99.99 = four, 99.999 = five.`;
  });
  verb("bw", "LIVE", "bw <size> <rate|time> — transfer time, or the rate a deadline demands", async (ctx) => {
    if (!need(ctx, 2, "bw <size like 10GB> <rate like 100Mbps | time like 2h>")) return;
    const sizeM = ctx.args[0].match(/^([\d.]+)\s*([KMGT]?i?[B])$/i);
    if (!sizeM) throw new Error("a size like 10GB, 500MB, 2TiB");
    const mult: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776 };
    const bytesN = Number(sizeM[1]) * mult[sizeM[2].toLowerCase()];
    const bits = bytesN * 8;
    const rateM = ctx.args[1].match(/^([\d.]+)\s*([KMGT]?)(bps|bit|b\/s)?$/i);
    const timeM = ctx.args[1].match(/^([\d.]+)\s*(s|m|h|d)$/i);
    const human = (s: number) => s >= 86400 ? (s / 86400).toFixed(2) + " days" : s >= 3600 ? (s / 3600).toFixed(2) + " hours" : s >= 60 ? (s / 60).toFixed(1) + " minutes" : s.toFixed(1) + " seconds";
    if (rateM) {
      const rate = Number(rateM[1]) * ({ "": 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12 } as any)[(rateM[2] || "").toLowerCase()];
      return `${ctx.args[0]} at ${ctx.args[1]} takes ${human(bits / rate)} of wire time — before protocol overhead; count ~5% more on a real link.`;
    }
    if (timeM) {
      const secs = Number(timeM[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 } as any)[timeM[2].toLowerCase()];
      const needBps = bits / secs;
      return `to move ${ctx.args[0]} in ${ctx.args[1]} you need ${(needBps / 1e6).toFixed(2)} Mbps sustained (${(needBps / 1e9 >= 1 ? (needBps / 1e9).toFixed(2) + " Gbps" : (needBps / 1e3).toFixed(0) + " Kbps")}) — before overhead.`;
    }
    throw new Error("the second argument is a rate (100Mbps) or a deadline (2h, 30m)");
  });
  verb("dbm", "LIVE", "dbm <value dBm|mW> — decibel-milliwatts and milliwatts, both directions", async (ctx) => {
    if (!need(ctx, 1, "dbm <value>")) return;
    const s = ctx.args[0].toLowerCase();
    const n = Number(s.replace(/(dbm|mw|w)$/, ""));
    if (!Number.isFinite(n)) throw new Error("a power: -67dBm, 100mW, 1W");
    if (s.endsWith("mw") || s.endsWith("w")) {
      const mw = s.endsWith("w") && !s.endsWith("mw") ? n * 1000 : n;
      return `${mw} mW = ${(10 * Math.log10(mw)).toFixed(1)} dBm`;
    }
    const mw = Math.pow(10, n / 10);
    return `${n} dBm = ${mw >= 1000 ? (mw / 1000).toFixed(2) + " W" : mw >= 1 ? mw.toFixed(2) + " mW" : mw.toExponential(2) + " mW"}\nradio sense: 0 dBm is 1 mW, −30 a strong whisper of signal, −67 a good Wi-Fi voice, −90 the edge of hearing. +3 dB doubles power; +10 dB is tenfold.`;
  });
  verb("freq", "LIVE", "freq <value|wavelength> — frequency ↔ wavelength, and the band it lives in", async (ctx) => {
    if (!need(ctx, 1, "freq <100MHz | 3m | 2.4GHz>")) return;
    const s = ctx.args[0];
    const fm = s.match(/^([\d.]+)\s*(Hz|kHz|MHz|GHz|THz)?$/i);
    const lm = s.match(/^([\d.]+)\s*(mm|cm|m|km)$/i);
    let hz: number;
    if (fm && (fm[2] || /^\d+$/.test(s))) hz = Number(fm[1]) * ({ hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 } as any)[(fm[2] || "Hz").toLowerCase()];
    else if (lm) { const meters = Number(lm[1]) * ({ mm: 0.001, cm: 0.01, m: 1, km: 1000 } as any)[lm[2].toLowerCase()]; hz = 299792458 / meters; }
    else throw new Error("a frequency (100MHz) or a wavelength (3m)");
    const lam = 299792458 / hz;
    const bands: Array<[number, string]> = [[3e3, "VLF"], [3e4, "LF"], [3e5, "MF"], [3e6, "HF (shortwave)"], [3e7, "VHF"], [3e8, "UHF"], [3e9, "SHF"], [3e10, "EHF"], [3e11, "THF"], [Infinity, "beyond radio"]];
    const band = bands.find(([edge]) => hz < edge)![1];
    const human = hz >= 1e9 ? (hz / 1e9).toFixed(3) + " GHz" : hz >= 1e6 ? (hz / 1e6).toFixed(3) + " MHz" : hz >= 1e3 ? (hz / 1e3).toFixed(2) + " kHz" : hz.toFixed(0) + " Hz";
    const lamS = lam >= 1 ? lam.toFixed(3) + " m" : lam >= 0.01 ? (lam * 100).toFixed(2) + " cm" : (lam * 1000).toFixed(2) + " mm";
    let home = "";
    if (Math.abs(hz - 2.4e9) < 1.5e8) home = " — the 2.4 GHz ISM band: Wi-Fi, Bluetooth, and microwave ovens live here";
    if (Math.abs(hz - 5e9) < 5e8) home = " — the 5 GHz Wi-Fi neighbourhood";
    if (hz >= 88e6 && hz <= 108e6) home = " — FM broadcast radio";
    if (hz >= 144e6 && hz <= 148e6) home = " — the 2-metre amateur band";
    return `${human} ↔ wavelength ${lamS} · band ${band}${home}\na quarter-wave antenna for it is ${(lam / 4 >= 1 ? (lam / 4).toFixed(2) + " m" : ((lam / 4) * 100).toFixed(1) + " cm")}.`;
  });
  verb("raid", "LIVE", "raid <0|1|5|6|10> <disks> <disk-size> — usable capacity and how many deaths it survives", async (ctx) => {
    if (!need(ctx, 3, "raid <level> <disks> <size like 4TB>")) return;
    const level = ctx.args[0], n = Number(ctx.args[1]);
    const sm = ctx.args[2].match(/^([\d.]+)\s*(TB|GB|TiB|GiB)?$/i);
    if (!sm) throw new Error("a disk size like 4TB");
    const size = Number(sm[1]);
    const unit = (sm[2] || "TB").toUpperCase().replace("IB", "iB");
    const rules: Record<string, { min: number; factor: (n: number) => number; survives: string }> = {
      "0": { min: 2, factor: (n) => n, survives: "none — one dead disk is everything gone" },
      "1": { min: 2, factor: () => 1, survives: "n−1 disks (full mirror)" },
      "5": { min: 3, factor: (n) => n - 1, survives: "one disk — and the rebuild window is the dangerous hour" },
      "6": { min: 4, factor: (n) => n - 2, survives: "two disks" },
      "10": { min: 4, factor: (n) => n / 2, survives: "one per mirror pair — two, if they are not partners" },
    };
    const r = rules[level];
    if (!r) throw new Error("levels the house speaks: 0, 1, 5, 6, 10");
    if (!Number.isInteger(n) || n < r.min) throw new Error(`RAID ${level} wants at least ${r.min} disks`);
    if (level === "10" && n % 2) throw new Error("RAID 10 wants an even disk count");
    return `RAID ${level}: ${n} × ${size}${unit} → ${(size * r.factor(n)).toFixed(1)}${unit} usable of ${(size * n).toFixed(1)}${unit} raw · survives ${r.survives}.\nRAID is availability, not backup: it mirrors your mistakes at line speed.`;
  });
  verb("disk", "LIVE", "disk <size> [fs] — what a filesystem really leaves of a disk", async (ctx) => {
    if (!need(ctx, 1, "disk <size like 1TB> [ext4|xfs|btrfs|apfs|ntfs]")) return;
    const sm = ctx.args[0].match(/^([\d.]+)\s*(TB|GB|PB)?$/i);
    if (!sm) throw new Error("a size like 1TB or 500GB");
    const tb = Number(sm[1]) * ((sm[2] || "TB").toUpperCase() === "GB" ? 0.001 : (sm[2] || "TB").toUpperCase() === "PB" ? 1000 : 1);
    const tib = tb * 0.9095;
    const fs = (ctx.args[1] || "ext4").toLowerCase();
    const overhead: Record<string, [number, string]> = {
      ext4: [0.05, "5% reserved blocks (root's margin; tune2fs -m can lower it)"],
      xfs: [0.01, "~1% metadata, no reserved blocks by default"],
      btrfs: [0.02, "~2% metadata (data/metadata are separate chunks — a full btrfs needs balance, not just delete)"],
      apfs: [0.01, "~1% plus snapshots quietly holding what you deleted"],
      ntfs: [0.03, "~3% including the MFT zone"],
    };
    const o = overhead[fs];
    if (!o) throw new Error(`filesystems the house knows: ${Object.keys(overhead).join(", ")}`);
    return `a '${sm[1]}${(sm[2] || "TB").toUpperCase()}' disk is ${tib.toFixed(2)} TiB to the OS (makers sell decimal, systems count binary — that gap is not theft, it is arithmetic)\n${fs} then keeps ~${(o[0] * 100).toFixed(0)}%: ${o[1]}\nusable ≈ ${(tib * (1 - o[0])).toFixed(2)} TiB`;
  });
  verb("ttl", "LIVE", "ttl <seconds> — a DNS TTL in human terms, with the trade named", async (ctx) => {
    if (!need(ctx, 1, "ttl <seconds>")) return;
    const s = Number(ctx.args[0]);
    if (!Number.isInteger(s) || s < 0) throw new Error("a TTL in seconds");
    const human = s >= 86400 ? (s / 86400) + " day(s)" : s >= 3600 ? (s / 3600).toFixed(1) + " hours" : s >= 60 ? (s / 60).toFixed(1) + " minutes" : s + " seconds";
    const band = s < 60 ? "hair-trigger: every resolver comes back almost at once. right for failover, ruinous as a default." : s < 600 ? "nimble: migrations land in minutes; query load is real but sane. the classic pre-move setting." : s < 7200 ? "balanced: the common working range for services that move sometimes." : s < 86400 ? "calm: cheap to serve, slow to fix. good for stable names." : "glacial: a bad record — or a hostile one — lives at resolvers for days. use rarely.";
    return `TTL ${fmtN(s)} = ${human}\n${band}\nlower it a day before a migration, raise it after the dust settles.`;
  });
  verb("soaserial", "LIVE", "soaserial [serial] — the next SOA serial (date scheme), or today's first", async (ctx) => {
    const now = new Date();
    const today = Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}00`);
    if (!ctx.args[0]) return `today's first serial: ${today} (YYYYMMDDNN — the NN is the day's edit count)`;
    const cur = Number(ctx.args[0]);
    if (!Number.isInteger(cur) || cur < 0) throw new Error("a serial number");
    const next = cur < today ? today : cur + 1;
    return `after ${cur} comes ${next}${cur < today ? " (a new day restarts the sequence)" : " (same day: NN increments; it runs out at +99 — then wait, or jump schemes)"}`;
  });
  verb("spf", "LIVE", "spf --ip4=<net> [--include=<domain>] [-a] [-mx] — an SPF record, built", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    const parts = ["v=spf1"];
    for (const a of ctx.args) { const m = a.match(/^--ip4=(.+)$/); if (m) parts.push(`ip4:${m[1]}`); const m6 = a.match(/^--ip6=(.+)$/); if (m6) parts.push(`ip6:${m6[1]}`); const inc = a.match(/^--include=(.+)$/); if (inc) parts.push(`include:${inc[1]}`); }
    if (ctx.args.includes("-a")) parts.push("a");
    if (ctx.args.includes("-mx")) parts.push("mx");
    parts.push(flags.all || "~all");
    return `${parts.join(" ")}\n  end with -all (hard fail) when the list is complete and watched; ~all (softfail) while you are still discovering senders. SPF breaks after 10 DNS lookups of mechanisms — count them.`;
  });
  verb("dmarc", "LIVE", "dmarc --p=<none|quarantine|reject> [--rua=<mail>] [--pct=n] — a DMARC record, built", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    if (!flags.p) throw new Error("a policy: --p=none (watch), quarantine, or reject");
    const parts = ["v=DMARC1", `p=${flags.p}`];
    if (flags.sp) parts.push(`sp=${flags.sp}`);
    if (flags.rua) parts.push(`rua=mailto:${flags.rua.replace(/^mailto:/, "")}`);
    if (flags.ruf) parts.push(`ruf=mailto:${flags.ruf.replace(/^mailto:/, "")}`);
    if (flags.pct) parts.push(`pct=${flags.pct}`);
    parts.push("adkim=s", "aspf=s");
    return `_dmarc.<your-domain>  TXT  "${parts.join("; ")}"\n  climb the ladder: none while reports flow, quarantine at pct=10..100, reject when nothing legitimate fails. strict alignment (s) is the honest finish; relaxed (r) is the common start.`;
  });
  verb("cachectl", "LIVE", "cachectl [--max-age=n] [--public|--private] [--immutable] [--swr=n] — a Cache-Control header, built and read", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    const parts: string[] = [];
    if (flags.public) parts.push("public"); if (flags.private) parts.push("private"); if (flags.nostore) parts.push("no-store"); if (flags.nocache) parts.push("no-cache");
    if (flags["max-age"]) parts.push(`max-age=${flags["max-age"]}`);
    if (flags.swr) parts.push(`stale-while-revalidate=${flags.swr}`);
    if (flags.immutable) parts.push("immutable");
    if (!parts.length) throw new Error("some directives: --public --max-age=3600 --swr=60 --immutable");
    return `Cache-Control: ${parts.join(", ")}\n  no-store beats everything (nothing kept, anywhere). no-cache means 'store, but revalidate before use' — the most misread line on the web. immutable + a long max-age is for fingerprinted assets only.`;
  });
  verb("cors", "LIVE", "cors --origin=<origin|*> [--methods] [--creds] — the CORS response headers a browser wants", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    if (!flags.origin) throw new Error("an origin: --origin=https://example.net (or * for public, credential-less resources)");
    const lines = [`Access-Control-Allow-Origin: ${flags.origin}`];
    if (flags.origin !== "*") lines.push("Vary: Origin");
    if (flags.creds) { if (flags.origin === "*") return "refused: browsers reject credentials with a * origin — name the origin instead."; lines.push("Access-Control-Allow-Credentials: true"); }
    if (flags.methods) lines.push(`Access-Control-Allow-Methods: ${flags.methods}`);
    if (flags.headers) lines.push(`Access-Control-Allow-Headers: ${flags.headers}`);
    if (flags.maxage) lines.push(`Access-Control-Max-Age: ${flags.maxage}`);
    return lines.join("\n") + "\n  these ride the preflight answer (OPTIONS) and the real response both; CORS is a browser leash, not a lock — curl never asked permission.";
  });
  verb("csp", "LIVE", "csp [--default --script --style --img --connect] — a Content-Security-Policy header, built", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    const d = (k: string, fb: string) => flags[k] || fb;
    const parts = [
      `default-src ${d("default", "'self'")}`,
      `script-src ${d("script", "'self'")}`,
      `style-src ${d("style", "'self' 'unsafe-inline'")}`,
      `img-src ${d("img", "'self' data:")}`,
      `connect-src ${d("connect", "'self'")}`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `frame-ancestors ${d("frame", "'none'")}`,
    ];
    return `Content-Security-Policy: ${parts.join("; ")}\n  start report-only (Content-Security-Policy-Report-Only) and watch what breaks before you enforce. 'unsafe-inline' in script-src is an unlocked door with a policy framed beside it.`;
  });
  verb("cookie", "LIVE", "cookie <name> <value> [--max-age=n] [--secure] [--httponly] [--samesite] [--path] — a Set-Cookie header, built", async (ctx) => {
    if (!need(ctx, 2, "cookie <name> <value> [flags]")) return;
    const { flags } = kvFlags(ctx.args.slice(2));
    const parts = [`${ctx.args[0]}=${encodeURIComponent(ctx.args[1])}`, `Path=${flags.path || "/"}`];
    if (flags["max-age"]) parts.push(`Max-Age=${flags["max-age"]}`);
    if (flags.domain) parts.push(`Domain=${flags.domain}`);
    if (flags.secure) parts.push("Secure");
    if (flags.httponly) parts.push("HttpOnly");
    parts.push(`SameSite=${flags.samesite || "Lax"}`);
    return `Set-Cookie: ${parts.join("; ")}\n  the honest default for a session cookie: Secure + HttpOnly + SameSite=Lax. SameSite=None requires Secure, and means 'send it everywhere — be sure'.`;
  });
  verb("curlgen", "LIVE", "curlgen --url=<u> [--method --data --header --user --insecure] — a curl command, assembled", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    if (!flags.url) throw new Error("a URL: --url=https://…");
    const parts = ["curl", "-sS"];
    if (flags.method) parts.push("-X", flags.method.toUpperCase());
    if (flags.header) parts.push("-H", `'${flags.header}'`);
    if (flags.data) parts.push("--data", `'${flags.data}'`);
    if (flags.user) parts.push("-u", flags.user);
    if (flags.insecure) parts.push("-k # (admits it stops verifying the certificate)");
    if (flags.follow) parts.push("-L");
    parts.push(`'${flags.url}'`);
    return parts.join(" ");
  });
  verb("magicpacket", "LIVE", "magicpacket <mac> — a Wake-on-LAN magic packet, as hex (the room builds it; it does not send it)", async (ctx) => {
    if (!need(ctx, 1, "wol <mac>")) return;
    const clean = ctx.args[0].replace(/[:.\- ]/g, "");
    if (!/^[0-9a-fA-F]{12}$/.test(clean)) throw new Error("a MAC is 6 bytes — 12 hex digits");
    return "ffffffffffff" + clean.toLowerCase().repeat(16) + "\n  6 bytes of FF, then the MAC sixteen times — 102 bytes, classically sent to UDP 7 or 9 on the broadcast address.";
  });
  verb("htpasswd", "LIVE", "htpasswd <user> <password> — an Apache {SHA} password line", async (ctx) => {
    if (!need(ctx, 2, "htpasswd <user> <password>")) return;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", te.encode(ctx.args[1]) as BufferSource));
    return `${ctx.args[0]}:{SHA}${bToB64(digest)}\n  {SHA} is unsalted SHA-1 — fine for a low-stakes door, nothing more. bcrypt ($2y$) is the modern answer; this room prints the classic because it can do it honestly.`;
  });
  verb("robotstxt", "LIVE", "robotstxt [--disallow=/path] [--sitemap=<url>] [--all=allow|deny] — a robots.txt, written", async (ctx) => {
    const { flags } = kvFlags(ctx.args);
    const lines = ["User-agent: *"];
    if (flags.all === "deny") lines.push("Disallow: /");
    else {
      for (const a of ctx.args) { const m = a.match(/^--disallow=(.+)$/); if (m) lines.push(`Disallow: ${m[1]}`); }
      if (lines.length === 1) lines.push("Allow: /");
    }
    if (flags.sitemap) lines.push("", `Sitemap: ${flags.sitemap}`);
    return lines.join("\n") + "\n# robots.txt is a request, not a fence — polite crawlers obey, others read it as a map of what you mind about.";
  });
  const GITIGNORES: Record<string, string[]> = {
    node: ["node_modules/", "dist/", ".env", "npm-debug.log*"],
    python: ["__pycache__/", "*.py[cod]", ".venv/", ".env", "dist/", "*.egg-info/"],
    macos: [".DS_Store", ".AppleDouble", ".LSOverride"],
    go: ["/bin/", "*.test", "*.out"],
    rust: ["/target", "Cargo.lock (libraries keep it; binaries commit it)"],
    general: [".env", "*.log", ".idea/", ".vscode/", "*~"],
  };
  verb("gitignore", "LIVE", "gitignore <node|python|macos|go|rust|general> […] — .gitignore lines for a stack", async (ctx) => {
    if (!need(ctx, 1, "gitignore <stack…>")) return;
    const out: string[] = [];
    for (const s of ctx.args) {
      const g = GITIGNORES[s.toLowerCase()];
      if (!g) throw new Error(`stacks on the shelf: ${Object.keys(GITIGNORES).join(", ")}`);
      out.push(`# ${s}`, ...g);
    }
    return out.join("\n");
  });
  const LICENSES: Record<string, string> = {
    mit: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. (full text: choosealicense.com/licenses/mit — add your year and name to the copyright line.)",
    isc: "ISC License — MIT's shorter sibling: permission to use, copy, modify, and distribute, with the copyright and permission notices kept. Functionally MIT for most purposes.",
    "bsd-2-clause": "BSD 2-Clause (Simplified) — use, copy, modify, distribute; keep the copyright notice and the disclaimer; no endorsement clause. (full text ships with the SPDX listing.)",
    "bsd-3-clause": "BSD 3-Clause — BSD-2 plus: the holder's name may not be used to endorse derived products without written permission.",
    "apache-2.0": "Apache License 2.0 — permissive like MIT/BSD, plus an express patent grant and a patent-retaliation clause, and a NOTICE file duty. The corporate-safe permissive.",
    "gpl-3.0": "GNU GPL v3 — copyleft: derivatives distributed must be free under the same terms, source included. Strong copyleft; linking counts.",
    "agpl-3.0": "GNU AGPL v3 — GPL plus the network clause: running it as a service for others is distribution, and they get the source offer too.",
    "lgpl-3.0": "GNU LGPL v3 — weak copyleft: link freely, modifications to the library itself stay free.",
    "mpl-2.0": "Mozilla Public License 2.0 — file-level copyleft: MPL files stay MPL, the work around them may be anything.",
    unlicense: "The Unlicense — a public-domain dedication: do anything; no warranty. Some jurisdictions shrug at dedications; the author meant it.",
    "cc0-1.0": "CC0 1.0 — a public-domain dedication with a fallback license, the careful Unlicense.",
    "wtfpl": "WTFPL — Do What The F*ck You Want To Public License. Exactly what it says; some employers' lawyers flinch.",
  };
  verb("license", "LIVE", "license <spdx-id> — open-source licenses: the short honest read, full text for MIT", async (ctx) => {
    if (!need(ctx, 1, "license <spdx-id>")) return;
    const hit = LICENSES[ctx.args[0].toLowerCase()];
    return hit ?? `not on the shelf — the shelf holds: ${Object.keys(LICENSES).join(", ")}. (ids are SPDX: exact strings matter in package.json.)`;
  });
}

/* ---------------- time ---------------- */
function registerTimeFamily() {
  verb("epoch", "LIVE", "epoch [unix|iso|now] — seconds ↔ dates, both ways, with the age of the moment", async (ctx) => {
    const a = ctx.args.join(" ").trim();
    if (!a || a === "now") { const now = new Date(); return `now: ${Math.floor(now.getTime() / 1000)} · ${now.toISOString()} · millis ${now.getTime()}`; }
    let d: Date;
    if (/^-?\d+$/.test(a)) { const n = Number(a); d = new Date(Math.abs(n) > 1e12 ? n : n * 1000); }
    else { d = new Date(a); if (isNaN(d.getTime())) throw new Error(`not a date or a unix time: ${a}`); }
    const secs = Math.floor(d.getTime() / 1000);
    const ageMs = Date.now() - d.getTime();
    const age = Math.abs(ageMs) >= 86400000 ? `${(Math.abs(ageMs) / 86400000).toFixed(1)} days` : Math.abs(ageMs) >= 3600000 ? `${(Math.abs(ageMs) / 3600000).toFixed(1)} hours` : `${(Math.abs(ageMs) / 60000).toFixed(1)} minutes`;
    return `${secs} · ${d.toISOString()} · ${d.toUTCString()}\n${ageMs >= 0 ? `${age} ago` : `in ${age}`} · millis ${d.getTime()}`;
  });
  verb("weekday", "LIVE", "weekday <date> — the day of the week, day of the year, and ISO week of a date", async (ctx) => {
    if (!need(ctx, 1, "weekday <date>")) return;
    const d = new Date(ctx.args.join(" "));
    if (isNaN(d.getTime())) throw new Error("a date like 2026-10-27");
    const start = new Date(d.getFullYear(), 0, 0);
    const doy = Math.floor((d.getTime() - start.getTime()) / 86400000);
    const thurs = new Date(d); thurs.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(thurs.getFullYear(), 0, 4);
    const week = 1 + Math.round(((thurs.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    const leap = (d.getFullYear() % 4 === 0 && d.getFullYear() % 100 !== 0) || d.getFullYear() % 400 === 0;
    return `${DOWS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · day ${doy} of ${leap ? 366 : 365} · ISO week ${week}${leap ? " · a leap year" : ""}`;
  });
  verb("age", "LIVE", "age <date> [date] — the span between two dates (or a date and now)", async (ctx) => {
    if (!need(ctx, 1, "age <date> [date]")) return;
    const a = new Date(ctx.args[0]);
    const b = ctx.args[1] ? new Date(ctx.args[1]) : new Date();
    if (isNaN(a.getTime()) || isNaN(b.getTime())) throw new Error("dates like 2026-10-27");
    const ms = Math.abs(b.getTime() - a.getTime());
    const days = ms / 86400000;
    return `${fmtN(Math.round(ms / 1000))} seconds · ${fmtN(Math.floor(days))} days · ${(days / 7).toFixed(1)} weeks · ${(days / 30.44).toFixed(1)} months · ${(days / 365.25).toFixed(2)} years`;
  });
  verb("tzdiff", "LIVE", "tzdiff <zone> <zone> — the offset between two zones, right now", async (ctx) => {
    if (!need(ctx, 2, "tzdiff <zone> <zone>")) return;
    const off = (z: string) => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "longOffset" }).formatToParts();
        const v = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT";
        const m = v.match(/GMT([+-])(\d{2}):(\d{2})/);
        return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
      } catch { throw new Error(`not a zone: ${z} (name one from \`tz\`)`); }
    };
    const a = off(ctx.args[0]), b = off(ctx.args[1]);
    const diff = a - b;
    return `${ctx.args[0]} is UTC${a >= 0 ? "+" : "−"}${Math.abs(a / 60).toFixed(a % 60 ? 2 : 0)}h · ${ctx.args[1]} is UTC${b >= 0 ? "+" : "−"}${Math.abs(b / 60).toFixed(b % 60 ? 2 : 0)}h\n${ctx.args[0]} runs ${diff === 0 ? "level with" : `${Math.abs(diff / 60)}h ${diff > 0 ? "ahead of" : "behind"}`} ${ctx.args[1]} right now (offsets move with daylight saving — this is today's truth).`;
  });
  verb("bizdays", "LIVE", "bizdays <from> <to> — business days between two dates", async (ctx) => {
    if (!need(ctx, 2, "bizdays <from> <to>")) return;
    let a = new Date(ctx.args[0]); const b = new Date(ctx.args[1]);
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) throw new Error("two dates, first before second");
    let count = 0, total = 0;
    const t = new Date(a);
    while (t <= b) { total++; const d = t.getDay(); if (d !== 0 && d !== 6) count++; t.setDate(t.getDate() + 1); }
    return `${count} business days (${total} calendar days) — weekends out; holidays are yours to know.`;
  });
  verb("leapyear", "LIVE", "leapyear <year> — is it a leap year, and why", async (ctx) => {
    if (!need(ctx, 1, "leapyear <year>")) return;
    const y = Number(ctx.args[0]);
    if (!Number.isInteger(y)) throw new Error("a year");
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return leap ? `${y} IS a leap year — 366 days, February gets its 29th.` : `${y} is not a leap year — 365 days.${y % 100 === 0 && y % 400 !== 0 ? " (divisible by 100 but not 400: the Gregorian correction.)" : ""}`;
  });
  verb("easter", "LIVE", "easter <year> — Easter Sunday (Western), by the computus", async (ctx) => {
    if (!need(ctx, 1, "easter <year>")) return;
    const y = Number(ctx.args[0]);
    if (!Number.isInteger(y)) throw new Error("a year");
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return `Easter Sunday ${y}: ${MONTHS[month - 1]} ${day}`;
  });
  verb("moonphase", "LIVE", "moonphase [date] — the moon's age and face tonight (or any night)", async (ctx) => {
    const d = ctx.args[0] ? new Date(ctx.args[0]) : new Date();
    if (isNaN(d.getTime())) throw new Error("a date like 2026-10-27");
    const synodic = 29.530588853;
    const known = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const days = d.getTime() / 86400000 - known;
    const age = ((days % synodic) + synodic) % synodic;
    const illum = Math.round((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2 * 100);
    const name = age < 1.8 ? "new moon" : age < 5.5 ? "waxing crescent" : age < 9.4 ? "first quarter" : age < 13.8 ? "waxing gibbous" : age < 16.6 ? "full moon" : age < 21.1 ? "waning gibbous" : age < 24.7 ? "last quarter" : age < 28.5 ? "waning crescent" : "new moon again";
    return `${name} · ${illum}% lit · age ${age.toFixed(1)} days of ${synodic.toFixed(1)} (an ephemeris-grade estimate, good to a few hours)`;
  });
  verb("httpdate", "LIVE", "httpdate [date] — a date in HTTP's own format (IMF-fixdate)", async (ctx) => {
    const d = ctx.args[0] ? new Date(ctx.args.join(" ")) : new Date();
    if (isNaN(d.getTime())) throw new Error("a date");
    return d.toUTCString();
  });
  verb("semver", "LIVE", "semver <a> [b] [--bump=major|minor|patch] — read, compare, and bump versions", async (ctx) => {
    if (!need(ctx, 1, "semver <version> [other]")) return;
    const parse = (s: string) => { const m = s.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+(.+))?$/); if (!m) throw new Error(`not semver: ${s}`); return { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || "", raw: s }; };
    const cmp = (A: ReturnType<typeof parse>, B: ReturnType<typeof parse>) => {
      for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] - B.n[i];
      if (A.pre === B.pre) return 0;
      if (!A.pre) return 1; if (!B.pre) return -1;
      const pa = A.pre.split("."), pb = B.pre.split(".");
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if (pa[i] === undefined) return -1; if (pb[i] === undefined) return 1;
        const na = Number(pa[i]), nb = Number(pb[i]);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
        if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
      }
      return 0;
    };
    const bump = ctx.args.find((a) => a.startsWith("--bump="))?.split("=")[1];
    const A = parse(ctx.args[0]);
    if (bump) {
      const n = [...A.n];
      if (bump === "major") { n[0]++; n[1] = 0; n[2] = 0; } else if (bump === "minor") { n[1]++; n[2] = 0; } else if (bump === "patch") n[2]++;
      else throw new Error("bump: major, minor, or patch");
      return n.join(".");
    }
    const other = ctx.args.find((a, i) => i > 0 && !a.startsWith("--"));
    if (!other) return `${A.raw} = major ${A.n[0]} · minor ${A.n[1]} · patch ${A.n[2]}${A.pre ? ` · prerelease ${A.pre} (a prerelease is OLDER than the same numbers without one)` : ""}`;
    const B = parse(other);
    const c = cmp(A, B);
    return c === 0 ? `${A.raw} = ${B.raw}` : c < 0 ? `${A.raw} < ${B.raw}` : `${A.raw} > ${B.raw}`;
  });
}

/* ---------------- text & data ---------------- */
function registerTextFamily() {
  verb("slug", "LIVE", "slug <text> — a URL slug from any text", async (ctx) => txt(ctx).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  verb("titlecase", "LIVE", "titlecase <text> — Title Case, with the small words kept small", async (ctx) => {
    const small = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "at", "by", "in", "of", "on", "to", "up", "via", "as"]);
    return txt(ctx).toLowerCase().split(/\s+/).map((w, i) => i === 0 || !small.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
  });
  verb("textcase", "LIVE", "textcase <upper|lower|camel|pascal|snake|kebab|const|flat> <text> — one text, every house style", async (ctx) => {
    if (!need(ctx, 2, "textcase <mode> <text>")) return;
    const mode = ctx.args[0].toLowerCase();
    const words = txt(ctx, 1).replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    switch (mode) {
      case "upper": return txt(ctx, 1).toUpperCase();
      case "lower": return txt(ctx, 1).toLowerCase();
      case "camel": return words.map((w, i) => i === 0 ? w : cap(w)).join("");
      case "pascal": return words.map(cap).join("");
      case "snake": return words.join("_");
      case "kebab": return words.join("-");
      case "const": return words.join("_").toUpperCase();
      case "flat": return words.join("");
      default: throw new Error("modes: upper lower camel pascal snake kebab const flat");
    }
  });
  verb("dedupe", "LIVE", "dedupe [file] — remove duplicate lines, keeping first sightings in order", async (ctx) => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const l of lines(ctx)) if (!seen.has(l)) { seen.add(l); out.push(l); }
    return out.join("\n");
  });
  verb("jsonfmt", "LIVE", "jsonfmt [-m] [file] — pretty-print JSON (or minify with -m); validates as it goes", async (ctx) => {
    const src = ctx.args.find((a) => !a.startsWith("-")) || "";
    const textin = src && ctx.os.node(src) ? (ctx.os.read(src) ?? "") : (ctx.stdin || txt(ctx));
    let v: any;
    try { v = JSON.parse(textin); } catch (e: any) { throw new Error(`not JSON: ${e.message}`); }
    return ctx.args.includes("-m") ? JSON.stringify(v) : JSON.stringify(v, null, 2);
  });
  verb("jsonq", "LIVE", "jsonq <path> [file] — pull a value out of JSON by its dot path (a.b.0.c)", async (ctx) => {
    if (!need(ctx, 1, "jsonq <path> [file]")) return;
    const src = ctx.args[1] || "";
    const textin = src && ctx.os.node(src) ? (ctx.os.read(src) ?? "") : ctx.stdin;
    if (!textin) throw new Error("JSON on stdin (or name a tree file)");
    let v: any;
    try { v = JSON.parse(textin); } catch (e: any) { throw new Error(`not JSON: ${e.message}`); }
    for (const part of ctx.args[0].split(".")) {
      if (v === null || v === undefined || !(part in Object(v))) throw new Error(`no such path at '${part}'`);
      v = v[part];
    }
    return typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
  });
  verb("csv2json", "LIVE", "csv2json [file] — CSV with a header row, as JSON objects", async (ctx) => {
    const ls = lines(ctx);
    if (!ls.length) return "[]";
    const splitRow = (line: string) => {
      const out: string[] = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur); return out;
    };
    const head = splitRow(ls[0]);
    const objs = ls.slice(1).filter((l) => l.trim()).map((l) => { const cells = splitRow(l); const o: Record<string, string> = {}; head.forEach((h, i) => (o[h] = cells[i] ?? "")); return o; });
    return JSON.stringify(objs, null, 2);
  });
  verb("json2csv", "LIVE", "json2csv [file] — a JSON array of objects, as CSV", async (ctx) => {
    const src = ctx.args.find((a) => !a.startsWith("-")) || "";
    const textin = src && ctx.os.node(src) ? (ctx.os.read(src) ?? "") : ctx.stdin;
    let v: any;
    try { v = JSON.parse(textin || ""); } catch { throw new Error("JSON on stdin (or name a tree file)"); }
    if (!Array.isArray(v) || !v.length) throw new Error("a non-empty JSON array of objects");
    const keys: string[] = [];
    for (const o of v) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
    const cell = (x: any) => { const s = x === null || x === undefined ? "" : typeof x === "object" ? JSON.stringify(x) : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [keys.join(","), ...v.map((o) => keys.map((k) => cell(o[k])).join(","))].join("\n");
  });
  verb("wrap", "LIVE", "wrap [width] [file] — wrap text to a width (default 76)", async (ctx) => {
    const numArg = ctx.args.find((a) => /^\d+$/.test(a));
    const width = numArg ? Number(numArg) : 76;
    const ls = lines(ctx).filter((l) => !numArg || l !== numArg);
    const out: string[] = [];
    for (const para of ls) {
      if (!para.trim()) { out.push(""); continue; }
      let line = "";
      for (const word of para.split(/\s+/)) {
        if (line && line.length + 1 + word.length > width) { out.push(line); line = word; }
        else line = line ? line + " " + word : word;
      }
      out.push(line);
    }
    return out.join("\n");
  });
  verb("count", "LIVE", "count [file] — characters, words, lines, sentences, bytes", async (ctx) => {
    const src = ctx.args.find((a) => !a.startsWith("-")) || "";
    const t = src && ctx.os.node(src) ? (ctx.os.read(src) ?? "") : (ctx.stdin || txt(ctx));
    const words = t.split(/\s+/).filter(Boolean).length;
    const sentences = t.split(/[.!?]+/).filter((s) => s.trim()).length;
    return `${fmtN(t.length)} characters · ${fmtN(words)} words · ${fmtN(t ? t.split("\n").length : 0)} lines · ${fmtN(sentences)} sentences · ${fmtN(te.encode(t).length)} bytes${words ? ` · ${(t.length / Math.max(words, 1)).toFixed(1)} chars/word · ~${Math.max(1, Math.round(words / 200))} min read` : ""}`;
  });
  verb("wordfreq", "LIVE", "wordfreq [n] [file] — the most common words in the text", async (ctx) => {
    const n = Number(ctx.args.find((a) => /^\d+$/.test(a))) || 15;
    const src = ctx.args.find((a) => !a.startsWith("-") && !/^\d+$/.test(a)) || "";
    const t = src && ctx.os.node(src) ? (ctx.os.read(src) ?? "") : ctx.stdin;
    const counts = new Map<string, number>();
    for (const w of t.toLowerCase().split(/[^a-z0-9']+/)) if (w) counts.set(w, (counts.get(w) || 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return sorted.map(([w, c]) => `${String(c).padStart(5)}  ${w}`).join("\n") || "(no words)";
  });
  verb("numlines", "LIVE", "numlines [file] — the lines, numbered", async (ctx) => lines(ctx).map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join("\n"));
  verb("trimlines", "LIVE", "trimlines [-e] [file] — trim every line (and drop empties with -e)", async (ctx) => {
    let ls = lines(ctx).map((l) => l.trim());
    if (ctx.args.includes("-e")) ls = ls.filter((l) => l !== "");
    return ls.join("\n");
  });
  verb("charfreq", "LIVE", "charfreq <text> — character frequencies of a text", async (ctx) => {
    const t = txt(ctx) || ctx.stdin;
    const counts = new Map<string, number>();
    for (const c of t) counts.set(c, (counts.get(c) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([c, n]) => `${c === " " ? "␣" : c === "\n" ? "⏎" : c}  ${n}`).join("\n");
  });
  verb("filetype", "LIVE", "filetype <file> — name a tree file by its bytes, not its name", async (ctx) => {
    if (!need(ctx, 1, "filetype <file>")) return;
    const b = fileBytes(ctx, ctx.args[0]);
    const rs = await rows("magic");
    const head = bToHex(b.slice(0, 24));
    let best: any = null;
    for (const r of rs) {
      const sig: string = r[0];
      if (sig.length / 2 > 24) continue;
      if (sig.startsWith("7573746172")) continue; // ustar lives at offset 257; handled below
      let ok = true;
      for (let i = 0; i < sig.length; i += 2) { if (sig.slice(i, i + 2) !== "??" && sig.slice(i, i + 2) !== head.slice(i, i + 2)) { ok = false; break; } }
      if (ok && (!best || sig.length > best[0].length)) best = r;
    }
    if (!best && b.length > 262 && td.decode(b.slice(257, 262)) === "ustar") best = ["7573746172", "tar", "tar archive"];
    const textLike = b.every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127));
    return best ? `${ctx.args[0]}: ${best[2]} (.${best[1]}) — ${fmtN(b.length)} bytes` : `${ctx.args[0]}: ${textLike ? "text (no known magic — judged by content)" : "data (no signature the house knows)"} — ${fmtN(b.length)} bytes`;
  });
  verb("pem2der", "LIVE", "pem2der <file|text> — strip PEM armour to DER, shown as hex", async (ctx) => {
    const t = txt(ctx) || (ctx.args[0] && ctx.os.read(ctx.args[0])) || "";
    const m = t.match(/-----BEGIN ([^-]+)-----([A-Za-z0-9+/=\s]+)-----END/);
    if (!m) throw new Error("no PEM block found");
    const b = b64ToB(m[2]);
    return `${m[1].trim()} — ${b.length} DER bytes\n${bToHex(b)}`;
  });
  verb("der2pem", "LIVE", "der2pem <file> [label] — dress DER bytes in PEM armour", async (ctx) => {
    if (!need(ctx, 1, "der2pem <file> [label]")) return;
    const b = fileBytes(ctx, ctx.args[0]);
    const label = (ctx.args[1] || "CERTIFICATE").toUpperCase();
    const b64 = bToB64(b);
    const wrapped = b64.match(/.{1,64}/g)!.join("\n");
    return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
  });
  verb("urlparse", "LIVE", "urlparse <url> — a URL taken apart on the bench", async (ctx) => {
    if (!need(ctx, 1, "urlparse <url>")) return;
    let u: URL;
    try { u = new URL(ctx.args[0]); } catch { throw new Error(`not a URL: ${ctx.args[0]}`); }
    const out = [
      `protocol  ${u.protocol}`,
      u.username ? `user      ${decodeURIComponent(u.username)}${u.password ? " (password present — it should not be, URLs leak)" : ""}` : "",
      `host      ${u.hostname}`,
      u.port ? `port      ${u.port}` : `port      (default for ${u.protocol.replace(":", "")})`,
      `path      ${u.pathname}`,
      ...[...u.searchParams.entries()].map(([k, v]) => `query     ${k} = ${v}`),
      u.hash ? `fragment  ${u.hash}` : "",
    ];
    return out.filter(Boolean).join("\n");
  });
  verb("urlnorm", "LIVE", "urlnorm <url> — a URL normalised: case, default ports, dot segments, sorted query", async (ctx) => {
    if (!need(ctx, 1, "urlnorm <url>")) return;
    let u: URL;
    try { u = new URL(ctx.args[0]); } catch { throw new Error(`not a URL: ${ctx.args[0]}`); }
    u.protocol = u.protocol.toLowerCase(); u.hostname = u.hostname.toLowerCase();
    const entries = [...u.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    u.search = "";
    for (const [k, v] of entries) u.searchParams.append(k, v);
    return u.toString();
  });
  verb("queryparse", "LIVE", "queryparse <query|url> — a query string as a table", async (ctx) => {
    if (!need(ctx, 1, "queryparse <query>")) return;
    const s = ctx.args.join(" ");
    const q = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s.replace(/^\?/, "");
    const params = new URLSearchParams(q);
    const out = [...params.entries()].map(([k, v]) => `${k.padEnd(20)} ${v}`);
    return out.length ? out.join("\n") : "(no parameters)";
  });
  verb("emailcheck", "LIVE", "emailcheck <address> — is this email address well-formed, and where does it bend?", async (ctx) => {
    if (!need(ctx, 1, "emailcheck <address>")) return;
    const s = ctx.args[0];
    const notes: string[] = [];
    const at = s.lastIndexOf("@");
    if (at <= 0 || at === s.length - 1) return `'${s}' is not an address — it needs one @ with text on both sides.`;
    const [local, domain] = [s.slice(0, at), s.slice(at + 1)];
    if (local.length > 64) notes.push("local part over 64 chars (over the RFC limit)");
    if (s.length > 254) notes.push("the whole address runs over 254 chars");
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) notes.push("dots misbehave in the local part (leading, trailing, or doubled)");
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) notes.push("the local part carries characters outside the usual set");
    if (!/^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(domain)) notes.push("the domain does not parse as a host name with a real TLD");
    if (domain.toLowerCase() !== domain) notes.push("domain in mixed case — legal, but domains fold to lowercase; local parts technically do not");
    return notes.length ? `'${s}' parses, with notes:\n  ${notes.join("\n  ")}\n(well-formed is not the same as real — only a knock at the domain's mail exchangers speaks to that, and that is the wire's work.)` : `'${s}' is well-formed: local '${local}' @ domain '${domain}'. (form only — existence is the wire's question.)`;
  });
}

/* ---------------- numbers & identifiers ---------------- */
function registerNumberFamily() {
  verb("ieee", "LIVE", "ieee <float|hex> — IEEE-754 bits of a float (double), or the float inside bits", async (ctx) => {
    if (!need(ctx, 1, "ieee <float|0x…>")) return;
    const buf = new DataView(new ArrayBuffer(8));
    if (/^0x[0-9a-fA-F]{16}$/.test(ctx.args[0])) {
      buf.setBigUint64(0, BigInt(ctx.args[0]));
      const v = buf.getFloat64(0);
      const bits = ctx.args[0].slice(2);
      return `${ctx.args[0]} = ${v}\n  sign ${bits[0] >= "8" ? 1 : 0} · exponent bits ${parseInt(bits.slice(1, 4), 16)} (unbiased ${parseInt(bits.slice(1, 4), 16) - 1023}) · this is the double a JavaScript number actually is`;
    }
    const v = Number(ctx.args[0]);
    if (!Number.isFinite(v) && !["Infinity", "-Infinity", "NaN"].includes(ctx.args[0])) throw new Error("a number, or a 16-hex-digit double");
    buf.setFloat64(0, v);
    const bits = buf.getBigUint64(0);
    return `${v} = 0x${bits.toString(16).padStart(16, "0")}\n  sign ${(bits >> 63n) & 1n} · biased exponent ${Number((bits >> 52n) & 0x7ffn)} · mantissa 0x${(bits & 0xfffffffffffffn).toString(16).padStart(13, "0")}`;
  });
  verb("varint", "LIVE", "varint [-d] <n|hex> — protobuf-style varint (LEB128), both ways", async (ctx) => {
    if (ctx.args.includes("-d")) {
      const b = hexToB(ctx.args.find((a) => !a.startsWith("-")) || "");
      let result = 0n, shift = 0n;
      for (const x of b) { result |= BigInt(x & 0x7f) << shift; shift += 7n; if (!(x & 0x80)) break; }
      return result.toString();
    }
    if (!need(ctx, 1, "varint <n>")) return;
    let n: bigint;
    try { n = BigInt(ctx.args[0]); } catch { throw new Error("an integer"); }
    if (n < 0n) throw new Error("unsigned varints only here — zigzag first for signed values");
    const out: number[] = [];
    do { let byte = Number(n & 0x7fn); n >>= 7n; if (n) byte |= 0x80; out.push(byte); } while (n);
    return bToHex(new Uint8Array(out)) + ` (${out.length} byte${out.length > 1 ? "s" : ""})`;
  });
  verb("baseconv", "LIVE", "baseconv <n> <from> <to> — a number between bases 2 and 36", async (ctx) => {
    if (!need(ctx, 3, "baseconv <n> <from> <to>")) return;
    const from = Number(ctx.args[1]), to = Number(ctx.args[2]);
    if (!(from >= 2 && from <= 36) || !(to >= 2 && to <= 36)) throw new Error("bases run 2 to 36");
    const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
    let n = 0n;
    for (const ch of ctx.args[0].toLowerCase()) {
      const v = digits.indexOf(ch);
      if (v < 0 || v >= from) throw new Error(`'${ch}' is not a base-${from} digit`);
      n = n * BigInt(from) + BigInt(v);
    }
    if (n === 0n) return "0";
    let out = "";
    while (n > 0n) { out = digits[Number(n % BigInt(to))] + out; n /= BigInt(to); }
    return out;
  });
  verb("roman", "LIVE", "roman <n|numeral> — Roman numerals, both ways", async (ctx) => {
    if (!need(ctx, 1, "roman <n|numeral>")) return;
    const s = ctx.args[0];
    if (/^\d+$/.test(s)) {
      let n = Number(s);
      if (n <= 0 || n > 3999) throw new Error("Rome wrote 1 to 3999 in this system");
      const table: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
      let out = "";
      for (const [v, sym] of table) while (n >= v) { out += sym; n -= v; }
      return out;
    }
    const vals: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const up = s.toUpperCase();
    if (!/^[IVXLCDM]+$/.test(up)) throw new Error("a number, or a numeral in IVXLCDM");
    let total = 0;
    for (let i = 0; i < up.length; i++) { const cur = vals[up[i]], next = vals[up[i + 1]] || 0; total += cur < next ? -cur : cur; }
    return String(total);
  });
  verb("coord", "LIVE", "coord <lat,lon> — coordinates: decimal ↔ degrees-minutes-seconds", async (ctx) => {
    if (!need(ctx, 1, "coord <lat,lon>")) return;
    const m = ctx.args.join("").match(/^(-?[\d.]+),(-?[\d.]+)$/);
    if (!m) throw new Error("latitude,longitude in decimal degrees");
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("latitude runs ±90, longitude ±180");
    const dms = (v: number, pos: string, neg: string) => {
      const hemi = v >= 0 ? pos : neg;
      const a = Math.abs(v), dgr = Math.floor(a), minF = (a - dgr) * 60, min = Math.floor(minF), sec = (minF - min) * 60;
      return `${dgr}°${min}′${sec.toFixed(1)}″${hemi}`;
    };
    return `${lat}, ${lon}\n  ${dms(lat, "N", "S")}  ${dms(lon, "E", "W")}`;
  });
  const GEO_A = "0123456789bcdefghjkmnpqrstuvwxyz";
  verb("geohash", "LIVE", "geohash [-d] <lat,lon|hash> [precision] — geohash, both ways", async (ctx) => {
    if (ctx.args.includes("-d")) {
      const h = (ctx.args.find((a) => !a.startsWith("-")) || "").toLowerCase();
      let latR: [number, number] = [-90, 90], lonR: [number, number] = [-180, 180], even = true;
      for (const ch of h) {
        const v = GEO_A.indexOf(ch); if (v < 0) throw new Error(`not a geohash character: '${ch}'`);
        for (let i = 4; i >= 0; i--) {
          const bit = (v >> i) & 1;
          const r = even ? lonR : latR;
          const mid = (r[0] + r[1]) / 2;
          if (bit) r[0] = mid; else r[1] = mid;
          even = !even;
        }
      }
      return `${h} covers lat ${(latR[0] + latR[1]) / 2} ±${((latR[1] - latR[0]) / 2).toFixed(6)}, lon ${(lonR[0] + lonR[1]) / 2} ±${((lonR[1] - lonR[0]) / 2).toFixed(6)}`;
    }
    if (!need(ctx, 1, "geohash <lat,lon> [precision]")) return;
    const m = ctx.args[0].match(/^(-?[\d.]+),(-?[\d.]+)$/);
    if (!m) throw new Error("latitude,longitude");
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    const precision = Math.min(Number(ctx.args[1]) || 8, 12);
    let latR: [number, number] = [-90, 90], lonR: [number, number] = [-180, 180];
    let out = "", cur = 0, bits = 0, even = true;
    while (out.length < precision) {
      const r = even ? lonR : latR, v = even ? lon : lat;
      const mid = (r[0] + r[1]) / 2;
      cur <<= 1;
      if (v >= mid) { cur |= 1; r[0] = mid; } else r[1] = mid;
      even = !even; bits++;
      if (bits === 5) { out += GEO_A[cur]; cur = 0; bits = 0; }
    }
    return out;
  });
  verb("maiden", "LIVE", "maiden <lat,lon> — the Maidenhead grid square of a place (the ham locator)", async (ctx) => {
    if (!need(ctx, 1, "maiden <lat,lon>")) return;
    const m = ctx.args.join("").match(/^(-?[\d.]+),(-?[\d.]+)$/);
    if (!m) throw new Error("latitude,longitude");
    let [lon, lat] = [Number(m[2]) + 180, Number(m[1]) + 90];
    const A = "ABCDEFGHIJKLMNOPQRSTUVWX";
    let out = A[Math.floor(lon / 20)] + A[Math.floor(lat / 10)];
    lon %= 20; lat %= 10;
    out += Math.floor(lon / 2) + "" + Math.floor(lat);
    lon %= 2; lat %= 1;
    out += "abcdefghijklmnopqrstuvwx"[Math.floor(lon * 12)] + "abcdefghijklmnopqrstuvwx"[Math.floor(lat * 24)];
    return out;
  });
  verb("gcd", "LIVE", "gcd <a> <b> — the greatest common divisor", async (ctx) => {
    if (!need(ctx, 2, "gcd <a> <b>")) return;
    let [a, b] = [Math.abs(Number(ctx.args[0])), Math.abs(Number(ctx.args[1]))];
    if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error("two integers");
    while (b) [a, b] = [b, a % b];
    return String(a);
  });
  verb("lcm", "LIVE", "lcm <a> <b> — the least common multiple", async (ctx) => {
    if (!need(ctx, 2, "lcm <a> <b>")) return;
    let [a, b] = [Math.abs(Number(ctx.args[0])), Math.abs(Number(ctx.args[1]))];
    if (!Number.isInteger(a) || !Number.isInteger(b) || !a || !b) throw new Error("two non-zero integers");
    let x = a, y = b;
    while (y) [x, y] = [y, x % y];
    return String((a / x) * b);
  });
  verb("prime", "LIVE", "prime <n> — is it prime, what are its factors, what prime comes next", async (ctx) => {
    if (!need(ctx, 1, "prime <n>")) return;
    const n = Number(ctx.args[0]);
    if (!Number.isInteger(n) || n < 2) throw new Error("an integer ≥ 2");
    const factors: number[] = [];
    let rest = n;
    for (let d = 2; d * d <= rest && d < 1e7; d++) while (rest % d === 0) { factors.push(d); rest /= d; }
    if (rest > 1) factors.push(rest);
    if (factors.length === 1 && factors[0] === n) {
      let next = n + 1;
      outer: while (true) { for (let d = 2; d * d <= next; d++) if (next % d === 0) { next++; continue outer; } break; }
      return `${fmtN(n)} is prime. the next prime is ${fmtN(next)}.`;
    }
    return `${fmtN(n)} = ${factors.map(fmtN).join(" × ")}`;
  });
  verb("pct", "LIVE", "pct <part> <whole> — a part as a percentage of a whole", async (ctx) => {
    if (!need(ctx, 2, "pct <part> <whole>")) return;
    const [a, b] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!Number.isFinite(a) || !b) throw new Error("two numbers, the whole non-zero");
    return `${((a / b) * 100).toFixed(2)}%`;
  });
  verb("pctchg", "LIVE", "pctchg <from> <to> — the percentage change between two numbers", async (ctx) => {
    if (!need(ctx, 2, "pctchg <from> <to>")) return;
    const [a, b] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!Number.isFinite(a) || !Number.isFinite(b) || !a) throw new Error("two numbers, the first non-zero");
    const c = ((b - a) / Math.abs(a)) * 100;
    return `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;
  });
  verb("ratio", "LIVE", "ratio <w> <h> — an aspect ratio, simplified", async (ctx) => {
    if (!need(ctx, 2, "ratio <w> <h>")) return;
    let [a, b] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!(a > 0) || !(b > 0)) throw new Error("two positive numbers");
    let x = Math.round(a * 1000), y = Math.round(b * 1000);
    let p = x, q = y;
    while (q) [p, q] = [q, p % q];
    return `${x / p}:${y / p}  (${(a / b).toFixed(4)}:1)`;
  });
  verb("fib", "LIVE", "fib <n> — the nth Fibonacci number, exact", async (ctx) => {
    if (!need(ctx, 1, "fib <n>")) return;
    const n = Number(ctx.args[0]);
    if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error("an integer from 0 to 10000");
    let [a, b] = [0n, 1n];
    for (let i = 0; i < n; i++) [a, b] = [b, a + b];
    return a.toString();
  });
  verb("fact", "LIVE", "fact <n> — n factorial, exact", async (ctx) => {
    if (!need(ctx, 1, "fact <n>")) return;
    const n = Number(ctx.args[0]);
    if (!Number.isInteger(n) || n < 0 || n > 5000) throw new Error("an integer from 0 to 5000");
    let r = 1n;
    for (let i = 2; i <= n; i++) r *= BigInt(i);
    return r.toString();
  });
  verb("temp", "LIVE", "temp <value[C|F|K]> — temperatures in all three scales", async (ctx) => {
    if (!need(ctx, 1, "temp <value[C|F|K]>")) return;
    const m = ctx.args[0].match(/^(-?[\d.]+)\s*([CFKcfk])?$/);
    if (!m) throw new Error("a temperature like 100C, 32F, 273K");
    let c = Number(m[1]);
    const unit = (m[2] || "C").toUpperCase();
    if (unit === "F") c = (c - 32) * 5 / 9;
    if (unit === "K") c = c - 273.15;
    return `${c.toFixed(2)} °C · ${(c * 9 / 5 + 32).toFixed(2)} °F · ${(c + 273.15).toFixed(2)} K${c <= -273.15 ? " — at absolute zero nothing moves" : ""}`;
  });
  const UNITS: Record<string, Record<string, number>> = {
    length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 },
    mass: { mg: 0.001, g: 1, kg: 1000, t: 1e6, oz: 28.349523125, lb: 453.59237 },
    data: { b: 1, kb: 1000, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776, bit: 0.125 },
    speed: { mps: 1, kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444, fps: 0.3048 },
    pressure: { pa: 1, hpa: 100, kpa: 1000, bar: 100000, atm: 101325, psi: 6894.757, mmhg: 133.322, inhg: 3386.389 },
  };
  verb("conv", "LIVE", "conv <value> <from> <to> — units: length, mass, data, speed, pressure (mm cm m km in ft yd mi nmi · mg g kg t oz lb · B KB MB GB TB KiB MiB GiB TiB bit · mps kmh mph kn fps · Pa hPa kPa bar atm psi mmHg inHg)", async (ctx) => {
    if (!need(ctx, 3, "conv <value> <from> <to>")) return;
    const value = Number(ctx.args[0]);
    if (!Number.isFinite(value)) throw new Error("a number first");
    const from = ctx.args[1].toLowerCase(), to = ctx.args[2].toLowerCase();
    for (const cat of Object.values(UNITS)) {
      if (from in cat && to in cat) return `${value} ${ctx.args[1]} = ${(value * cat[from] / cat[to]).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${ctx.args[2]}`;
      if (from in cat && !(to in cat)) continue;
    }
    if (Object.values(UNITS).some((c) => from in c) && Object.values(UNITS).some((c) => to in c)) throw new Error(`${ctx.args[1]} and ${ctx.args[2]} live in different families — no honest conversion`);
    throw new Error("unknown unit — the help line lists the shelf");
  });
  verb("bitops", "LIVE", "bitops <a> <and|or|xor|shl|shr|not> [b] — bitwise work with the bits shown", async (ctx) => {
    if (!need(ctx, 2, "bitops <a> <op> [b]")) return;
    const a = BigInt(ctx.args[0]);
    const op = ctx.args[1].toLowerCase();
    let r: bigint;
    if (op === "not") r = ~a;
    else {
      if (ctx.args[2] === undefined) throw new Error("that op wants a second number");
      const b = BigInt(ctx.args[2]);
      if (op === "and") r = a & b; else if (op === "or") r = a | b; else if (op === "xor") r = a ^ b;
      else if (op === "shl") r = a << b; else if (op === "shr") r = a >> b;
      else throw new Error("ops: and or xor shl shr not");
    }
    return `${r}  ·  hex 0x${(r < 0n ? (r + (1n << 64n)) : r).toString(16)}  ·  bin ${r >= 0n ? r.toString(2) : "(negative — two's complement at 64 bits) " + (r + (1n << 64n)).toString(2)}`;
  });
  verb("twos", "LIVE", "twos <n> [bits] — a number in two's complement at a width", async (ctx) => {
    if (!need(ctx, 1, "twos <n> [bits]")) return;
    const width = Number(ctx.args[1]) || 32;
    if (![8, 16, 32, 64].includes(width)) throw new Error("widths: 8, 16, 32, 64");
    let n = BigInt(ctx.args[0]);
    const mod = 1n << BigInt(width);
    if (n < 0n) n += mod;
    n &= mod - 1n;
    const signed = n >= (1n << BigInt(width - 1)) ? n - mod : n;
    return `unsigned ${n} · signed ${signed} · bin ${n.toString(2).padStart(width, "0")} · hex 0x${n.toString(16).padStart(width / 4, "0")}`;
  });
  verb("endian", "LIVE", "endian <hex> — byte-swap a hex word (endianness flip)", async (ctx) => {
    if (!need(ctx, 1, "endian <hex>")) return;
    const b = hexToB(ctx.args[0]);
    return bToHex(new Uint8Array([...b].reverse())) + `  (the ${b.length}-byte word, read the other way)`;
  });
  verb("bcd", "LIVE", "bcd [-d] <n|hex> — binary-coded decimal, both ways", async (ctx) => {
    if (ctx.args.includes("-d")) {
      const b = hexToB(ctx.args.find((a) => !a.startsWith("-")) || "");
      let out = "";
      for (const x of b) { const hi = x >> 4, lo = x & 15; if (hi > 9 || lo > 9) throw new Error("not BCD — a nibble above 9"); out += `${hi}${lo}`; }
      return out.replace(/^0+(?=.)/, "");
    }
    if (!need(ctx, 1, "bcd <n>")) return;
    if (!/^\d+$/.test(ctx.args[0])) throw new Error("a decimal integer");
    const digits = ctx.args[0].padStart(Math.ceil(ctx.args[0].length / 2) * 2, "0");
    const out: number[] = [];
    for (let i = 0; i < digits.length; i += 2) out.push((Number(digits[i]) << 4) | Number(digits[i + 1]));
    return bToHex(new Uint8Array(out));
  });
  verb("gray", "LIVE", "gray [-d] <n> — Gray code, both ways", async (ctx) => {
    const arg = ctx.args.find((a) => !a.startsWith("-"));
    if (!arg) { ctx.io.print("usage: gray [-d] <n>", "err"); return; }
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 0) throw new Error("a non-negative integer");
    if (ctx.args.includes("-d")) {
      let g = n, r = 0;
      while (g) { r ^= g; g >>= 1; }
      return String(r);
    }
    return `${n ^ (n >> 1)}  (neighbours differ by one bit — that is the whole point)`;
  });
  verb("hamming", "LIVE", "hamming <a> <b> — the Hamming distance between two strings or hex words", async (ctx) => {
    if (!need(ctx, 2, "hamming <a> <b>")) return;
    const [a, b] = [ctx.args[0], ctx.args[1]];
    if (/^0x[0-9a-fA-F]+$/.test(a) && /^0x[0-9a-fA-F]+$/.test(b)) {
      const ba = hexToB(a), bb = hexToB(b);
      if (ba.length !== bb.length) throw new Error("bit distance wants equal lengths");
      let d = 0;
      for (let i = 0; i < ba.length; i++) { let x = ba[i] ^ bb[i]; while (x) { d += x & 1; x >>= 1; } }
      return `${d} bits differ`;
    }
    if (a.length !== b.length) throw new Error("string distance wants equal lengths");
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return `${d} positions differ`;
  });
  verb("lev", "LIVE", "lev <a> <b> — the Levenshtein edit distance between two strings", async (ctx) => {
    if (!need(ctx, 2, "lev <a> <b>")) return;
    const [a, b] = [ctx.args[0], ctx.args[1]];
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return `${row[b.length]} edit${row[b.length] === 1 ? "" : "s"} (insert, delete, substitute — each costs 1)`;
  });
  verb("anagram", "LIVE", "anagram <a> <b> — are they anagrams?", async (ctx) => {
    if (!need(ctx, 2, "anagram <a> <b>")) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").split("").sort().join("");
    return norm(ctx.args[0]) === norm(ctx.args[1]) ? "yes — the same letters, rearranged" : "no";
  });
  verb("palindrome", "LIVE", "palindrome <text> — does it read the same backwards?", async (ctx) => {
    const s = txt(ctx).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!s) throw new Error("some text");
    return s === [...s].reverse().join("") ? "yes — a palindrome" : "no";
  });
  verb("isbn", "LIVE", "isbn <isbn> — validate an ISBN-10 or ISBN-13, and convert", async (ctx) => {
    if (!need(ctx, 1, "isbn <isbn>")) return;
    const s = ctx.args[0].replace(/[-\s]/g, "").toUpperCase();
    if (/^\d{9}[\dX]$/.test(s)) {
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === "X" ? 10 : Number(s[i]));
      const ok = sum % 11 === 0;
      if (!ok) return `ISBN-10 ${s}: the check digit fails — not a valid ISBN-10.`;
      const core = "978" + s.slice(0, 9);
      let cd = 0;
      for (let i = 0; i < 12; i++) cd += Number(core[i]) * (i % 2 ? 3 : 1);
      return `ISBN-10 ${s}: valid · as ISBN-13: ${core}${(10 - (cd % 10)) % 10}`;
    }
    if (/^\d{13}$/.test(s)) {
      let sum = 0;
      for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
      return sum % 10 === 0 ? `ISBN-13 ${s}: valid${s.startsWith("978") ? ` · as ISBN-10: ${s.slice(3, 12)}${(() => { let t = 0; const c = s.slice(3, 12); for (let i = 0; i < 9; i++) t += (10 - i) * Number(c[i]); const chk = (11 - (t % 11)) % 11; return chk === 10 ? "X" : chk === 11 ? "0" : String(chk); })()}` : " (979 prefixes have no ISBN-10 twin)"}` : `ISBN-13 ${s}: the check digit fails.`;
    }
    throw new Error("an ISBN-10 or ISBN-13, hyphens welcome");
  });
  verb("luhn", "LIVE", "luhn <digits> — the Luhn check: validate, or complete with -c", async (ctx) => {
    if (!need(ctx, 1, "luhn <digits>")) return;
    const s = ctx.args.find((a) => !a.startsWith("-"))!.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(s)) throw new Error("digits only");
    const sum = (body: string) => {
      // from the right: the check digit sits at position 0 undoubled;
      // every second digit after it (odd positions) doubles.
      let total = 0;
      for (let i = 0; i < body.length; i++) {
        let d = Number(body[body.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        total += d;
      }
      return total;
    };
    if (ctx.args.includes("-c")) return `${s}${(10 - (sum(s + "0") % 10)) % 10}  (check digit ${(10 - (sum(s + "0") % 10)) % 10} appended)`;
    return sum(s) % 10 === 0 ? `${s} passes Luhn — the checksum holds (that proves arithmetic, not existence)` : `${s} fails Luhn — a digit is wrong somewhere`;
  });
  verb("iban", "LIVE", "iban <iban> — validate an IBAN (mod-97) and read its parts", async (ctx) => {
    if (!need(ctx, 1, "iban <iban>")) return;
    const s = ctx.args.join("").replace(/\s/g, "").toUpperCase();
    const lens: Record<string, number> = { GB: 22, DE: 22, FR: 27, CH: 21, ES: 24, IT: 27, NL: 18, BE: 16, AT: 20, PL: 28, SE: 24, NO: 15, DK: 18, FI: 18, IE: 22, PT: 25, CZ: 24, HU: 28, GR: 27, TR: 26, AE: 23, SA: 24, AU: 0 };
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return `'${s}' does not wear the IBAN shape (2 letters, 2 check digits, then the BBAN).`;
    const cc = s.slice(0, 2);
    if (lens[cc] !== undefined && lens[cc] !== 0 && s.length !== lens[cc]) return `${cc} IBANs are ${lens[cc]} characters — this one is ${s.length}. wrong before the arithmetic even starts.`;
    const rearranged = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of rearranged) {
      const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of v) rem = (rem * 10 + Number(d)) % 97;
    }
    return rem === 1 ? `${s} — valid: country ${cc}, check digits ${s.slice(2, 4)}, BBAN ${s.slice(4)} (mod-97 holds)` : `${s} — INVALID: mod-97 leaves ${rem}, a valid IBAN leaves 1. a digit is wrong.`;
  });
  verb("ean", "LIVE", "ean <ean> — validate an EAN-8 / EAN-13 / UPC check digit", async (ctx) => {
    if (!need(ctx, 1, "ean <ean>")) return;
    const s = ctx.args[0].replace(/[\s-]/g, "");
    if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(s)) throw new Error("an EAN-8, UPC-A (12), or EAN-13 (13 digits)");
    let sum = 0;
    for (let i = 0; i < s.length - 1; i++) sum += Number(s[s.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
    const want = (10 - (sum % 10)) % 10;
    return Number(s[s.length - 1]) === want ? `${s}: valid — check digit ${want} holds` : `${s}: invalid — the check digit should be ${want}, not ${s[s.length - 1]}`;
  });
}

/* ---------------- the second shelf ---------------- */
function registerSecondShelf() {
  const OUI: Record<string, string> = {
    "000C29": "VMware", "005056": "VMware", "000569": "VMware", "001C42": "Parallels", "080027": "VirtualBox (Oracle)", "525400": "QEMU / KVM", "00163E": "Xen", "001B21": "Intel (NICs)", "3CFDFE": "Intel", "9C6B00": "Intel", "0024D7": "Intel", "68B599": "Cisco", "001B0D": "Cisco", "2C3E50": "Cisco", "001A2F": "Cisco", "F8C288": "Apple", "A45E60": "Apple", "3C15C2": "Apple", "D8A25E": "Apple", "F0DBE2": "Apple", "6C4008": "Apple", "002454": "Apple", "28CFE9": "Apple", "7C2F80": "Apple", "001CB3": "Apple", "002332": "Apple", "0010FA": "Apple", "D49A20": "Apple", "8866A5": "Apple", "002241": "Samsung", "5C3C27": "Samsung", "00265D": "Samsung", "D0176A": "Samsung", "001247": "Dell", "B083FE": "Dell", "ECF4BB": "Dell", "F8DB88": "Dell", "3C9A92": "Hewlett Packard", "94E721": "Hewlett Packard", "001E0B": "Hewlett Packard", "B499BA": "Raspberry Pi", "DCA632": "Raspberry Pi", "E45F01": "Raspberry Pi", "28CDC1": "Raspberry Pi", "D83ADD": "Ubiquiti", "FCECDA": "Ubiquiti", "002722": "Ubiquiti", "24A43C": "Espressif (ESP32/ESP8266)", "A4CF12": "Espressif", "7CDFEB": "Espressif", "18FE34": "Espressif", "B8D61A": "MikroTik", "4C5E0C": "MikroTik", "2CC81B": "MikroTik", "000E8F": "Sercomm / OEM", "001DD8": "Microsoft (Xbox / Hyper-V guests wear 00155D)", "00155D": "Microsoft Hyper-V", "7C2D62": "Microsoft", "0026F8": "Oracle / Sun", "002128": "Oracle", "00144F": "Oracle", "0003BA": "Sun Microsystems", "00221F": "Juniper Networks", "9C8E99": "Juniper", "50C7BF": "TP-Link", "EC086B": "TP-Link", "F8D111": "TP-Link", "1C3BF3": "TP-Link", "9403C7": "Netgear", "A021B7": "Netgear", "E091F5": "Netgear", "0024B2": "Netgear", "001E2A": "Hikvision", "44A642": "Hangzhou Hikvision", "94A6B1": "Sony", "0013A9": "Sony", "78C81C": "Google", "F8ADCB": "Google", "3C5AB4": "Google (Nest)", "001A11": "Google", "DAA119": "(locally administered — a privacy MAC, not a factory one)", "020000": "(locally administered example range)",
  };
  verb("oui", "LIVE", "oui <mac|prefix> — who burned this MAC's first three bytes", async (ctx) => {
    if (!need(ctx, 1, "oui <mac|prefix>")) return;
    const clean = ctx.args[0].replace(/[:.\- ]/g, "").toUpperCase();
    if (!/^[0-9A-F]{6,12}$/.test(clean)) throw new Error("a MAC, or at least its first three bytes");
    const key = clean.slice(0, 6);
    const hit = OUI[key];
    if (hit) return `${key} — ${hit}`;
    const firstByte = hexToB(key.slice(0, 2))[0];
    return `${key} is not in the house's short table${firstByte & 2 ? " — and the locally-administered bit is set, so it was likely software-minted, not burned in" : " — the full IEEE registry is the authority; the short table holds the common silicon"}.`;
  });
  const RCODES: Array<[number, string, string]> = [
    [0, "NOERROR", "no error — the answer stands"], [1, "FORMERR", "the query was malformed"], [2, "SERVFAIL", "the server failed — lame, broken DNSSEC, or an upstream down"], [3, "NXDOMAIN", "the name does not exist"], [4, "NOTIMP", "not implemented — the server does not speak that opcode or type"], [5, "REFUSED", "the server refuses — policy, ACL, or not authoritative"], [6, "YXDOMAIN", "a name exists that should not"], [7, "YXRRSET", "a record set exists that should not"], [8, "NXRRSET", "a record set does not exist that should"], [9, "NOTAUTH", "the server is not authoritative for that zone"], [10, "NOTZONE", "the name sits outside the zone"], [16, "BADVERS", "a bad EDNS version (also BADSIG in TSIG dress)"], [17, "BADKEY", "a bad TSIG key"], [18, "BADTIME", "a TSIG signature outside its time window"], [19, "BADMODE", "a bad TKEY mode"], [20, "BADNAME", "a duplicate TKEY name"], [21, "BADALG", "an unsupported algorithm"], [23, "BADCOOKIE", "a bad DNS cookie"],
  ];
  verb("rcode", "LIVE", "rcode <number|name> — DNS response codes, read plain", async (ctx) => {
    if (!need(ctx, 1, "rcode <number|name>")) return;
    const q = ctx.args[0].toUpperCase();
    const hit = RCODES.find(([n, name]) => String(n) === q || name === q);
    return hit ? `${hit[0]} ${hit[1]} — ${hit[2]}` : `no base rcode '${ctx.args[0]}' (0–10 are the classic set; 16+ arrive by EDNS and TSIG)`;
  });
  verb("dnsclass", "LIVE", "dnsclass [class] — the DNS classes: IN, CH, HS, and what a class even is", async (ctx) => {
    const table: Array<[string, number, string]> = [["IN", 1, "Internet — the class of every record you have ever read"], ["CH", 3, "Chaos — the old MIT net; now home to version.bind and other server confessions"], ["HS", 4, "Hesiod — the name-service class that stayed in the museum"], ["NONE", 254, "the delete-this signal in dynamic update"], ["ANY", 255, "a query for every class — the wildcard class (QCLASS only)"]];
    if (!ctx.args[0]) return table.map(([n, v, d]) => `${n.padEnd(5)} ${String(v).padEnd(4)} ${d}`).join("\n");
    const hit = table.find(([n, v]) => n === ctx.args[0].toUpperCase() || String(v) === ctx.args[0]);
    return hit ? `${hit[0]} (class ${hit[1]}) — ${hit[2]}` : `no class '${ctx.args[0]}' in the short table`;
  });
  verb("tlsver", "LIVE", "tlsver [version] — the TLS/SSL family tree, with the dates of death", async (ctx) => {
    const table: Array<[string, string]> = [
      ["SSL 2.0", "1995 — broken by 2011 (RFC 6176), forbidden everywhere"],
      ["SSL 3.0", "1996 — killed by POODLE; RFC 7568 forbids it (2015)"],
      ["TLS 1.0", "1999 — deprecated by RFC 8996 (2021); PCI forbade it in 2018"],
      ["TLS 1.1", "2006 — deprecated with 1.0 by RFC 8996"],
      ["TLS 1.2", "2008 — sound with the right suites (ECDHE + AEAD); still widely ridden"],
      ["TLS 1.3", "2018 — the current road: 1-RTT, forward secrecy always, chacha or GCM"],
      ["DTLS 1.2", "2012 — TLS over datagrams, TLS 1.2's UDP sibling"],
      ["DTLS 1.3", "2022 — DTLS caught up to TLS 1.3"],
    ];
    if (!ctx.args[0]) return table.map(([v, d]) => `${v.padEnd(9)} ${d}`).join("\n");
    const hit = table.find(([v]) => v.toLowerCase().includes(ctx.args.join(" ").toLowerCase()));
    return hit ? `${hit[0]} — ${hit[1]}` : "versions on the tree: SSL 2.0 / 3.0, TLS 1.0–1.3, DTLS 1.2 / 1.3";
  });
  const CRC32CT = crcTable(0x82f63b78);
  verb("crc32c", "LIVE", "crc32c <text|file> — CRC-32C (Castagnoli), the iSCSI/SSE4.2 flavour", async (ctx) => {
    let crc = 0xffffffff;
    for (const x of bytes(ctx)) crc = CRC32CT[(crc ^ x) & 0xff] ^ (crc >>> 8);
    return "0x" + ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  });
  verb("distance", "LIVE", "distance <lat,lon> <lat,lon> — the great-circle distance between two places", async (ctx) => {
    if (!need(ctx, 2, "distance <lat,lon> <lat,lon>")) return;
    const parse = (s: string) => { const m = s.match(/^(-?[\d.]+),(-?[\d.]+)$/); if (!m) throw new Error(`not lat,lon: ${s}`); return [Number(m[1]) * Math.PI / 180, Number(m[2]) * Math.PI / 180] as const; };
    const [la1, lo1] = parse(ctx.args[0]), [la2, lo2] = parse(ctx.args[1]);
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(h));
    return `${km.toFixed(2)} km · ${(km * 0.621371).toFixed(2)} miles · ${(km / 1.852).toFixed(1)} nautical miles`;
  });
  verb("bearing", "LIVE", "bearing <lat,lon> <lat,lon> — the initial great-circle bearing from here to there", async (ctx) => {
    if (!need(ctx, 2, "bearing <lat,lon> <lat,lon>")) return;
    const parse = (s: string) => { const m = s.match(/^(-?[\d.]+),(-?[\d.]+)$/); if (!m) throw new Error(`not lat,lon: ${s}`); return [Number(m[1]) * Math.PI / 180, Number(m[2]) * Math.PI / 180] as const; };
    const [la1, lo1] = parse(ctx.args[0]), [la2, lo2] = parse(ctx.args[1]);
    const y = Math.sin(lo2 - lo1) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
    const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return `${deg.toFixed(1)}° — ${points[Math.round(deg / 45) % 8]} by the compass`;
  });
  verb("dewpoint", "LIVE", "dewpoint <tempC> <rh%> — the dew point of air (Magnus)", async (ctx) => {
    if (!need(ctx, 2, "dewpoint <tempC> <rh%>")) return;
    const [t, rh] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!Number.isFinite(t) || !(rh > 0 && rh <= 100)) throw new Error("a temperature in °C and a relative humidity 1–100");
    const a = 17.27, b = 237.7;
    const alpha = (a * t) / (b + t) + Math.log(rh / 100);
    const dp = (b * alpha) / (a - alpha);
    return `dew point ${dp.toFixed(1)} °C — below this, the air drops its water. (spread ${Math.abs(t - dp).toFixed(1)}°: wide means dry air, narrow means fog is thinking about it)`;
  });
  verb("windchill", "LIVE", "windchill <tempC> <kmh> — what moving air makes cold feel like", async (ctx) => {
    if (!need(ctx, 2, "windchill <tempC> <kmh>")) return;
    const [t, v] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!Number.isFinite(t) || !Number.isFinite(v)) throw new Error("a temperature in °C and a wind in km/h");
    const wc = 13.12 + 0.6215 * t - 11.37 * Math.pow(v, 0.16) + 0.3965 * t * Math.pow(v, 0.16);
    return `${wc.toFixed(1)} °C felt (the formula holds for ≤10 °C and ≥4.8 km/h; outside that, the number lies politely)`;
  });
  verb("heatindex", "LIVE", "heatindex <tempC> <rh%> — what humid heat does to a body (Rothfusz)", async (ctx) => {
    if (!need(ctx, 2, "heatindex <tempC> <rh%>")) return;
    const [tc, rh] = [Number(ctx.args[0]), Number(ctx.args[1])];
    if (!Number.isFinite(tc) || !(rh > 0 && rh <= 100)) throw new Error("a temperature in °C and a relative humidity 1–100");
    const t = tc * 9 / 5 + 32;
    const hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
    const c = (hi - 32) * 5 / 9;
    return `feels like ${c.toFixed(1)} °C (the regression holds for ≥27 °C and ≥40% humidity)`;
  });
  const PAPERS: Record<string, [number, number]> = { a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148], b5: [176, 250], letter: [216, 279], legal: [216, 356], tabloid: [279, 432], executive: [184, 267] };
  verb("paper", "LIVE", "paper <a4|letter|…> — paper sizes in mm and inches", async (ctx) => {
    const hit = PAPERS[(ctx.args[0] || "").toLowerCase()];
    if (!ctx.args[0]) return Object.entries(PAPERS).map(([k, [w, h]]) => `${k.padEnd(10)} ${w}×${h} mm`).join("\n");
    if (!hit) throw new Error(`sizes on the shelf: ${Object.keys(PAPERS).join(", ")}`);
    return `${ctx.args[0].toUpperCase()}: ${hit[0]}×${hit[1]} mm · ${(hit[0] / 25.4).toFixed(2)}×${(hit[1] / 25.4).toFixed(2)} in`;
  });
  verb("ppi", "LIVE", "ppi <px-wide> <px-high> <inches-diagonal> — a screen's pixel density", async (ctx) => {
    if (!need(ctx, 3, "ppi <w> <h> <inches>")) return;
    const [w, h, d] = [Number(ctx.args[0]), Number(ctx.args[1]), Number(ctx.args[2])];
    if (!(w > 0) || !(h > 0) || !(d > 0)) throw new Error("positive numbers");
    const p = Math.hypot(w, h) / d;
    return `${p.toFixed(0)} ppi · dot pitch ${(25.4 / p).toFixed(3)} mm · ${p >= 300 ? "print-class" : p >= 200 ? "retina-class at arm's length" : p >= 110 ? "a desktop-grade density" : "chunky — pixels are visible citizens"}`;
  });
  verb("unicode", "LIVE", "unicode <char|U+XXXX> — a character's papers: codepoint, UTF-8, block", async (ctx) => {
    if (!need(ctx, 1, "unicode <char|U+XXXX>")) return;
    const s = ctx.args.join(" ");
    let cp: number, ch: string;
    const m = s.match(/^U\+([0-9A-Fa-f]{1,6})$/i);
    if (m) { cp = parseInt(m[1], 16); ch = String.fromCodePoint(cp); }
    else { const first = [...s][0]; if (!first) throw new Error("a character"); ch = first; cp = first.codePointAt(0)!; }
    const blocks: Array<[number, string]> = [[0x2500, "Box Drawing"], [0x2200, "Mathematical Operators"], [0x2000, "General Punctuation"], [0x1F600, "Emoticons"], [0x1F300, "Misc Symbols and Pictographs"], [0x2190, "Arrows"], [0x20A0, "Currency Symbols"], [0x0400, "Cyrillic"], [0x0370, "Greek"], [0x0590, "Hebrew"], [0x0600, "Arabic"], [0x4E00, "CJK Unified Ideographs"], [0x3040, "Hiragana"], [0x30A0, "Katakana"], [0xAC00, "Hangul Syllables"], [0x0100, "Latin Extended-A"], [0x0080, "Latin-1 Supplement"], [0x0000, "Basic Latin"]];
    const block = blocks.find(([start, _], i) => cp >= start && (i === 0 || cp < (blocks[i - 1][0])))?.[1] || blocks.filter(([st]) => cp >= st).pop()?.[1] || "unknown";
    return `'${ch}' U+${cp.toString(16).toUpperCase().padStart(4, "0")} (${cp})\n  UTF-8 ${[...new TextEncoder().encode(ch)].map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ")} · UTF-16 ${ch.length} code unit(s) · block: ${block}`;
  });
  verb("utf8", "LIVE", "utf8 <text> — a text as UTF-8 bytes, with the census", async (ctx) => {
    const t = txt(ctx);
    const b = te.encode(t);
    return `${bToHex(b)}\n${[...t].length} characters · ${t.length} UTF-16 units · ${b.length} UTF-8 bytes`;
  });
  const BECH_A = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  verb("bech32", "LIVE", "bech32 [-d] <hrp> <hex> | <bech32> — SegWit's armour (BIP-173), both ways", async (ctx) => {
    const polymod = (values: number[]) => {
      const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
      let chk = 1;
      for (const v of values) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
      }
      return chk;
    };
    const hrpExpand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
    const convert = (data: number[], from: number, to: number, pad: boolean) => {
      let acc = 0, bits = 0; const out: number[] = [];
      for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & ((1 << to) - 1)); } }
      if (pad) { if (bits) out.push((acc << (to - bits)) & ((1 << to) - 1)); }
      else if (bits >= from || ((acc << (to - bits)) & ((1 << to) - 1))) return null;
      return out;
    };
    if (ctx.args.includes("-d")) {
      const s = (ctx.args.find((a) => !a.startsWith("-")) || "").toLowerCase();
      const split = s.lastIndexOf("1");
      if (split < 1) throw new Error("not bech32 — no hrp separator");
      const hrp = s.slice(0, split);
      const data: number[] = [];
      for (const ch of s.slice(split + 1)) { const v = BECH_A.indexOf(ch); if (v < 0) throw new Error(`not a bech32 character: '${ch}'`); data.push(v); }
      if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error("checksum fails — not a valid bech32 string");
      const payload = convert(data.slice(0, -6), 5, 8, false);
      if (!payload) throw new Error("the payload does not regroup cleanly");
      return `hrp '${hrp}' · payload ${bToHex(new Uint8Array(payload))}`;
    }
    if (!need(ctx, 2, "bech32 <hrp> <hex>")) return;
    const hrp = ctx.args[0];
    const bytesIn = [...hexToB(ctx.args[1])];
    const conv = convert(bytesIn, 8, 5, true)!;
    const mod = polymod([...hrpExpand(hrp), ...conv, 0, 0, 0, 0, 0, 0]) ^ 1;
    const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
    return hrp + "1" + [...conv, ...checksum].map((v) => BECH_A[v]).join("");
  });
  verb("sri", "LIVE", "sri <file|text> — a Subresource Integrity string for a resource", async (ctx) => {
    if (!need(ctx, 1, "sri <file|text>")) return;
    const b = bytes(ctx);
    const parts: string[] = [];
    for (const algo of ["SHA-256", "SHA-384", "SHA-512"] as const) {
      const d = new Uint8Array(await crypto.subtle.digest(algo, b as BufferSource));
      parts.push(`${algo.toLowerCase().replace("-", "")}-${bToB64(d)}`);
    }
    return parts.join(" ") + `\n  ride it as: integrity="${parts[1]}" crossorigin="anonymous"`;
  });
  verb("spdx", "LIVE", "spdx <id|word> — SPDX license identifiers, searched", async (ctx) => {
    const table: Array<[string, string]> = [
      ["MIT", "MIT License"], ["MIT-0", "MIT, no attribution"], ["Apache-2.0", "Apache License 2.0"], ["BSD-2-Clause", "BSD 2-Clause (Simplified)"], ["BSD-3-Clause", "BSD 3-Clause (New)"], ["BSD-3-Clause-Clear", "BSD 3-Clause Clear"], ["GPL-2.0-only", "GPL v2 only"], ["GPL-2.0-or-later", "GPL v2 or later"], ["GPL-3.0-only", "GPL v3 only"], ["GPL-3.0-or-later", "GPL v3 or later"], ["LGPL-2.1-or-later", "Lesser GPL 2.1+"], ["LGPL-3.0-or-later", "Lesser GPL 3+"], ["AGPL-3.0-only", "Affero GPL v3 only"], ["AGPL-3.0-or-later", "Affero GPL v3 or later"], ["MPL-2.0", "Mozilla Public License 2.0"], ["EPL-2.0", "Eclipse Public License 2.0"], ["EUPL-1.2", "European Union Public License 1.2"], ["ISC", "ISC License"], ["Unlicense", "The Unlicense"], ["CC0-1.0", "CC0 1.0 dedication"], ["CC-BY-4.0", "Creative Commons Attribution 4.0"], ["CC-BY-SA-4.0", "Creative Commons Attribution-ShareAlike 4.0"], ["0BSD", "BSD 0-Clause (no conditions)"], ["Zlib", "zlib License"], ["BSL-1.0", "Boost Software License 1.0"], ["Artistic-2.0", "Artistic License 2.0"], ["MS-PL", "Microsoft Public License"], ["PostgreSQL", "PostgreSQL License"], ["NCSA", "University of Illinois/NCSA"], ["WTFPL", "Do What The F*ck You Want To"], ["BlueOak-1.0.0", "Blue Oak Model License 1.0.0"], ["CDDL-1.0", "Common Development and Distribution License"], [" OFL-1.1".trim(), "SIL Open Font License 1.1"], ["AFL-3.0", "Academic Free License 3.0"], ["OSL-3.0", "Open Software License 3.0"], ["PHP-3.0", "PHP License 3.0"], ["Python-2.0", "Python License 2.0"], ["Ruby", "Ruby License"], ["Vim", "Vim License"], ["LGPL-2.0-or-later", "Library GPL 2+"],
    ];
    if (!need(ctx, 1, "spdx <id|word>")) return;
    const q = ctx.args.join(" ").toLowerCase();
    const hits = table.filter(([id, name]) => id.toLowerCase() === q || id.toLowerCase().includes(q) || name.toLowerCase().includes(q));
    return hits.length ? hits.map(([id, name]) => `${id.padEnd(20)} ${name}`).join("\n") : `no SPDX id matches '${ctx.args.join(" ")}' on the short shelf (${table.length} common ids).`;
  });
}

export function registerToolchestVerbs() {
  registerIpFamily();
  registerLookupFamily();
  registerEncoderFamily();
  registerHashFamily();
  registerGeneratorFamily();
  registerAdminFamily();
  registerTimeFamily();
  registerTextFamily();
  registerNumberFamily();
  registerSecondShelf();
}
