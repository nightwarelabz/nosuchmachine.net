// BLACKSITE WEB — local lab. Everything in this file runs entirely in the
// visitor's browser. Nothing typed here is sent anywhere.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
function val(id: string): string { return ($<HTMLInputElement>(id)?.value ?? "").toString(); }
function setVal(id: string, v: string) { const el = $<HTMLInputElement>(id); if (el) el.value = v; }
function setText(id: string, v: string) { const el = $(id); if (el) el.textContent = v; }
function on(id: string, ev: string, fn: (e: Event) => void) { $(id)?.addEventListener(ev, fn); }
export function emitReport(source: string, title: string, body: unknown) {
  document.dispatchEvent(new CustomEvent("blacksite:report", { detail: { source, title, body, at: new Date().toISOString() } }));
}
function pretty(x: unknown): string { return typeof x === "string" ? x : JSON.stringify(x, null, 2); }
function show(id: string, x: unknown) { setText(id, pretty(x)); }

const te = new TextEncoder();
const td = new TextDecoder();
function bytesToHex(b: Uint8Array): string { return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2) throw new Error("Hex input has an odd number of digits.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToB64(b: Uint8Array): string { let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); }
function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(norm.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha(algo: string, data: BufferSource): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(algo, data as BufferSource)));
}
// Compact MD5 (public-domain style implementation) for legacy fingerprinting only.
function md5(input: Uint8Array): string {
  function rl(v: number, a: number) { return (v << a) | (v >>> (32 - a)); }
  function add(x: number, y: number) { const l = (x & 0xffff) + (y & 0xffff); const m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xffff); }
  function F(x: number, y: number, z: number) { return (x & y) | (~x & z); }
  function G(x: number, y: number, z: number) { return (x & z) | (y & ~z); }
  function H(x: number, y: number, z: number) { return x ^ y ^ z; }
  function I(x: number, y: number, z: number) { return y ^ (x | ~z); }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add(rl(add(add(a, F(b, c, d)), add(x, t)), s), b); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add(rl(add(add(a, G(b, c, d)), add(x, t)), s), b); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add(rl(add(add(a, H(b, c, d)), add(x, t)), s), b); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add(rl(add(add(a, I(b, c, d)), add(x, t)), s), b); }
  const msg = Array.from(input);
  const bitLen = input.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 0; i < 8; i++) msg.push((bitLen / Math.pow(2, 8 * i)) & 0xff);
  const w = new Array(16);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K: number[] = [];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  for (let blk = 0; blk < msg.length; blk += 64) {
    for (let i = 0; i < 16; i++) w[i] = msg[blk + i * 4] | (msg[blk + i * 4 + 1] << 8) | (msg[blk + i * 4 + 2] << 16) | (msg[blk + i * 4 + 3] << 24);
    let aa = a, bb = b, cc = c, dd = d;
    const ops = [ff, gg, hh, ii];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 16; i++) {
        let idx: number;
        if (r === 0) idx = i; else if (r === 1) idx = (5 * i + 1) % 16; else if (r === 2) idx = (3 * i + 5) % 16; else idx = (7 * i) % 16;
        const args: [number, number, number, number, number, number, number] = [aa, bb, cc, dd, w[idx], S[r * 4 + (i % 4)], K[r * 16 + i]];
        const res = ops[r](...args);
        aa = dd; dd = cc; cc = bb; bb = res;
      }
    }
    a = add(a, aa); b = add(b, bb); c = add(c, cc); d = add(d, dd);
  }
  const out = new Uint8Array(16);
  [a, b, c, d].forEach((v, i) => { out[i * 4] = v & 0xff; out[i * 4 + 1] = (v >> 8) & 0xff; out[i * 4 + 2] = (v >> 16) & 0xff; out[i * 4 + 3] = (v >>> 24) & 0xff; });
  return bytesToHex(out);
}

function shannonEntropy(b: Uint8Array): number {
  if (!b.length) return 0;
  const counts = new Array(256).fill(0);
  b.forEach((x) => counts[x]++);
  let e = 0;
  for (const c of counts) if (c) { const p = c / b.length; e -= p * Math.log2(p); }
  return Math.round(e * 1000) / 1000;
}

/* ---------------- HASH LAB ---------------- */
async function runHash() {
  const input = val("hash-input");
  const mode = val("hash-mode") || "text";
  let bytes: Uint8Array<ArrayBuffer>;
  if (mode === "hex") { try { bytes = hexToBytes(input); } catch (e: any) { return show("hash-out", String(e.message || e)); } }
  else bytes = te.encode(input);
  const result: Record<string, string> = {
    "MD5 (legacy fingerprint only)": md5(bytes),
    "SHA-1 (legacy)": await sha("SHA-1", bytes),
    "SHA-256": await sha("SHA-256", bytes),
    "SHA-384": await sha("SHA-384", bytes),
    "SHA-512": await sha("SHA-512", bytes),
  };
  if (val("hash-key")) {
    const key = await crypto.subtle.importKey("raw", te.encode(val("hash-key")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    result["HMAC-SHA-256 (with key)"] = bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes as BufferSource)));
  }
  result["bytes"] = String(bytes.length);
  result["entropy (bits/byte)"] = String(shannonEntropy(bytes));
  show("hash-out", result);
  emitReport("hash", `Hash of ${bytes.length} byte(s)`, result);
}
async function runFileHash(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const result = {
    file: file.name, bytes: file.size, type: file.type || "(unknown)",
    "MD5": md5(buf), "SHA-1": await sha("SHA-1", buf), "SHA-256": await sha("SHA-256", buf), "SHA-512": await sha("SHA-512", buf),
    "entropy (bits/byte)": shannonEntropy(buf),
  };
  show("hash-out", result);
  emitReport("file-hash", `File hash: ${file.name}`, result);
}

/* ---------------- CODECS ---------------- */
function runCodec() {
  const op = val("codec-op");
  const input = val("codec-input");
  try {
    let out = "";
    switch (op) {
      case "b64e": out = bytesToB64(te.encode(input)); break;
      case "b64d": out = td.decode(b64ToBytes(input)); break;
      case "b64url": out = bytesToB64(te.encode(input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); break;
      case "hexe": out = bytesToHex(te.encode(input)); break;
      case "hexd": out = td.decode(hexToBytes(input)); break;
      case "urle": out = encodeURIComponent(input); break;
      case "urld": out = decodeURIComponent(input); break;
      case "htmle": out = input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); break;
      case "htmld": { const t = document.createElement("textarea"); t.innerHTML = input; out = t.value; break; }
      case "rot13": out = input.replace(/[a-zA-Z]/g, (c) => String.fromCharCode((c <= "Z" ? 65 : 97) + ((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26))); break;
      case "bin": out = [...te.encode(input)].map((b) => b.toString(2).padStart(8, "0")).join(" "); break;
      case "hexdump": {
        const b = te.encode(input); const lines: string[] = [];
        for (let i = 0; i < b.length; i += 16) {
          const slice = b.slice(i, i + 16);
          const hexPart = [...slice].map((x) => x.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
          const ascii = [...slice].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ".")).join("");
          lines.push(`${i.toString(16).padStart(8, "0")}  ${hexPart}  |${ascii}|`);
        }
        out = lines.join("\n") || "(empty input)"; break;
      }
      case "entropy": {
        const b = te.encode(input);
        out = JSON.stringify({ bytes: b.length, shannonBitsPerByte: shannonEntropy(b), verdict: shannonEntropy(b) > 7.2 ? "Very high — looks compressed or encrypted" : shannonEntropy(b) > 5 ? "High — structured or encoded data" : "Ordinary text range" }, null, 2); break;
      }
    }
    setVal("codec-output", out);
  } catch (e: any) { setVal("codec-output", `Error: ${e?.message || e}`); }
}
function runRegex() {
  const pattern = val("regex-pattern");
  const flags = val("regex-flags") || "g";
  const subject = val("regex-subject");
  try {
    const re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
    const matches = [...subject.matchAll(re)].slice(0, 100).map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) }));
    show("regex-out", matches.length ? matches : "No matches.");
  } catch (e: any) { show("regex-out", `Error: ${e?.message || e}`); }
}

/* ---------------- JWT ---------------- */
function b64urlJson(part: string): any { return JSON.parse(td.decode(b64ToBytes(part))); }
async function runJwt() {
  const token = val("jwt-input").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return show("jwt-out", "A JWT has exactly three dot-separated parts: header.payload.signature");
  try {
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const findings: string[] = [];
    if (String(header.alg).toLowerCase() === "none") findings.push("CRITICAL: alg=none — the token asks verifiers to skip signature checking entirely.");
    if (header.kid && /(\.\.|\/|\\)/.test(String(header.kid))) findings.push("kid header contains path characters — classic directory-traversal / injection smell in naive verifiers.");
    if (header.jku || header.x5u) findings.push("Header points at a remote key URL (jku/x5u) — SSRF / key-substitution surface in naive verifiers.");
    if (payload.exp && payload.exp < now) findings.push(`Token is EXPIRED (exp ${new Date(payload.exp * 1000).toISOString()}).`);
    if (payload.nbf && payload.nbf > now) findings.push("Token is not yet valid (nbf is in the future).");
    if (!payload.exp) findings.push("No exp claim — if the issuer accepts it forever, a leak is permanent.");
    if (!payload.iss) findings.push("No iss (issuer) claim.");
    const verdict: any = { header, payload, signatureBytes: b64ToBytes(parts[2]).length, findings: findings.length ? findings : ["No structural red flags found. That is not a signature verdict — verify below."] };
    const secret = val("jwt-secret");
    if (secret && /^HS(256|384|512)$/.test(header.alg || "")) {
      const bits = header.alg.slice(2);
      const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: `SHA-${bits}` }, false, ["sign"]);
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(`${parts[0]}.${parts[1]}`)));
      const expected = bytesToB64(sig).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      verdict.signatureCheck = expected === parts[2] ? "VALID for the supplied secret" : "INVALID for the supplied secret";
    }
    show("jwt-out", verdict);
    emitReport("jwt", "JWT inspection", verdict);
  } catch (e: any) { show("jwt-out", `Could not decode: ${e?.message || e}`); }
}

/* ---------------- VAULT (AES-GCM) ---------------- */
async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function runVaultEncrypt() {
  const password = val("vault-password");
  if (!password) return show("vault-out", "Set a password first.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310000;
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(val("vault-input"))));
  const pack = { format: "BLACKSITE-WEB-AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations, salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(ct) };
  show("vault-out", pack);
  setVal("vault-input", JSON.stringify(pack));
  emitReport("vault", "AES-256-GCM seal created", { format: pack.format, iterations, ciphertextBytes: ct.length });
}
async function runVaultDecrypt() {
  const password = val("vault-password");
  try {
    const pack = JSON.parse(val("vault-input"));
    const key = await deriveKey(password, b64ToBytes(pack.salt), pack.iterations);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(pack.iv) }, key, b64ToBytes(pack.ciphertext));
    setVal("vault-input", td.decode(pt));
    show("vault-out", "Opened. Plaintext is in the box above. (Wrong password or tampered data fails closed — AES-GCM authenticates.)");
  } catch { show("vault-out", "Open failed: wrong password, or the sealed data was altered. AES-GCM refuses both the same way, on purpose."); }
}
function passwordStrength(pw: string) {
  if (!pw) return { bits: 0, verdict: "empty" };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  const bits = Math.round(pw.length * Math.log2(pool || 1));
  const penalty = /(.)\1{2,}|1234|abcd|qwer|password|letmein/i.test(pw) ? " — but it contains an obvious pattern, which real cracking ignores entropy math for" : "";
  return { bits, verdict: (bits < 35 ? "Weak" : bits < 60 ? "Fair" : bits < 90 ? "Strong" : "Excellent") + penalty, crackTimeOffline: bits < 35 ? "seconds to hours" : bits < 60 ? "days to years" : bits < 90 ? "centuries+ at 10^10 guesses/sec" : "beyond practical brute force", length: pw.length, pool };
}
function genPassword() {
  const len = Math.min(128, Math.max(8, Number(val("pwgen-length")) || 20));
  const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKMNPQRSTUVWXYZ", "23456789", "!@#$%^&*()-_=+[]{}"];
  const all = sets.join("");
  const out: string[] = sets.map((s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length]);
  const rnd = crypto.getRandomValues(new Uint32Array(len));
  for (let i = out.length; i < len; i++) out.push(all[rnd[i] % all.length]);
  // Fisher-Yates shuffle with crypto randomness.
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  const pw = out.join("");
  setVal("pwgen-out", pw);
  show("pwgen-meta", passwordStrength(pw));
}

/* ---------------- SUBNET ---------------- */
function ipToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) { if (!/^\d+$/.test(x) || Number(x) > 255) return null; n = n * 256 + Number(x); }
  return n >>> 0;
}
function intToIp(n: number): string { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
function classifyIp(n: number): string {
  const inR = (base: string, bits: number) => { const b = ipToInt(base)!; const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; return (n & mask) === (b & mask); };
  if (inR("127.0.0.0", 8)) return "Loopback";
  if (inR("10.0.0.0", 8) || inR("172.16.0.0", 12) || inR("192.168.0.0", 16)) return "Private (RFC1918)";
  if (inR("169.254.0.0", 16)) return "Link-local (APIPA / cloud metadata range)";
  if (inR("100.64.0.0", 10)) return "CGNAT shared space";
  if (inR("224.0.0.0", 4)) return "Multicast";
  if (inR("192.0.2.0", 24) || inR("198.51.100.0", 24) || inR("203.0.113.0", 24)) return "Documentation (TEST-NET)";
  if (inR("0.0.0.0", 8)) return "Unspecified / this-network";
  return "Public";
}
function runSubnet() {
  const input = val("subnet-input").trim();
  const [ipPart, prefixPart] = input.split("/");
  const ip = ipToInt((ipPart || "").trim());
  if (ip === null) return show("subnet-out", "Enter an IPv4 address, with optional /prefix — e.g. 192.168.1.10/24");
  const prefix = prefixPart !== undefined ? Number(prefixPart) : 24;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return show("subnet-out", "Prefix must be 0–32.");
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const result: any = {
    address: intToIp(ip), class: classifyIp(ip), prefix: `/${prefix}`,
    netmask: intToIp(mask), wildcardMask: intToIp((~mask) >>> 0),
    networkAddress: intToIp(network), broadcastAddress: intToIp(broadcast),
    totalAddresses: total,
    usableHosts: prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2,
    firstUsable: prefix >= 31 ? intToIp(network) : intToIp(network + 1),
    lastUsable: prefix >= 31 ? intToIp(broadcast) : intToIp(broadcast - 1),
    binary: ip.toString(2).padStart(32, "0").replace(/(.{8})(?=.)/g, "$1."),
    asInteger: ip, asHex: "0x" + ip.toString(16).padStart(8, "0"),
  };
  show("subnet-out", result);
  emitReport("subnet", `Subnet math: ${input}`, result);
}

/* ---------------- CERT DECODER ---------------- */
const OID_NAMES: Record<string, string> = { "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU", "1.2.840.113549.1.1.11": "sha256WithRSAEncryption", "1.2.840.113549.1.1.12": "sha384WithRSAEncryption", "1.2.840.113549.1.1.5": "sha1WithRSAEncryption", "1.2.840.10045.4.3.2": "ecdsa-with-SHA256", "1.2.840.10045.4.3.3": "ecdsa-with-SHA384", "1.3.101.112": "Ed25519" };
function readLen(buf: Uint8Array, i: number): [number, number] { const b = buf[i]; if (b < 0x80) return [b, i + 1]; const n = b & 0x7f; let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[i + 1 + k]; return [v, i + 1 + n]; }
function readTLV(buf: Uint8Array, i: number) { const tag = buf[i]; const [len, after] = readLen(buf, i + 1); return { tag, len, valueStart: after, end: after + len }; }
function oidStr(bytes: Uint8Array): string { if (!bytes.length) return ""; const out = [Math.floor(bytes[0] / 40), bytes[0] % 40]; let v = 0; for (let i = 1; i < bytes.length; i++) { v = v * 128 + (bytes[i] & 0x7f); if (!(bytes[i] & 0x80)) { out.push(v); v = 0; } } return out.join("."); }
function parseName(buf: Uint8Array, start: number, end: number): string { const parts: string[] = []; let i = start; while (i < end) { const set = readTLV(buf, i); let j = set.valueStart; while (j < set.end) { const seq = readTLV(buf, j); const o = readTLV(buf, seq.valueStart); const oid = oidStr(buf.slice(o.valueStart, o.end)); const v = readTLV(buf, o.end); parts.push(`${OID_NAMES[oid] || oid}=${td.decode(buf.slice(v.valueStart, v.end))}`); j = seq.end; } i = set.end; } return parts.join(", "); }
async function runCert() {
  let input = val("cert-input").trim();
  const pemBody = input.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s/g, "");
  let der: Uint8Array;
  try { der = /^[0-9a-fA-F\s]+$/.test(input) && input.length > 40 ? hexToBytes(input) : b64ToBytes(pemBody); }
  catch { return show("cert-out", "Could not decode that as PEM, base64 DER, or hex DER."); }
  try {
    const cert = readTLV(der, 0);
    const tbs = readTLV(der, cert.valueStart);
    let p = tbs.valueStart;
    const version = der[p] === 0xa0 ? (der[readTLV(der, p).valueStart] + 1) : 1;
    if (der[p] === 0xa0) p = readTLV(der, p).end;
    const serialT = readTLV(der, p); p = serialT.end;
    const serial = bytesToHex(der.slice(serialT.valueStart, serialT.end)).toUpperCase().replace(/(..)(?=.)/g, "$1:") || "00";
    const algT = readTLV(der, p); const algOid = readTLV(der, algT.valueStart); p = algT.end;
    const issuerT = readTLV(der, p); const issuer = parseName(der, issuerT.valueStart, issuerT.end); p = issuerT.end;
    const valT = readTLV(der, p);
    const fmtTime = (t: ReturnType<typeof readTLV>) => { const s = td.decode(der.slice(t.valueStart, t.end)); if (t.tag === 0x17) { const yy = Number(s.slice(0, 2)); return new Date(Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)))).toISOString(); } return s; };
    const nb = readTLV(der, valT.valueStart); const na = readTLV(der, nb.end); p = valT.end;
    const subjT = readTLV(der, p); const subject = parseName(der, subjT.valueStart, subjT.end); p = subjT.end;
    const sans: string[] = [];
    while (p < tbs.end) {
      const t = readTLV(der, p);
      if (t.tag === 0xa3) {
        const extSeq = readTLV(der, t.valueStart); let q = extSeq.valueStart;
        while (q < extSeq.end) {
          const ext = readTLV(der, q); const eOid = readTLV(der, ext.valueStart);
          if (oidStr(der.slice(eOid.valueStart, eOid.end)) === "2.5.29.17") {
            let vPos = eOid.end; let vT = readTLV(der, vPos); if (vT.tag === 0x01) { vPos = vT.end; vT = readTLV(der, vPos); }
            const inner = readTLV(der, vT.valueStart); let r = inner.valueStart;
            while (r < inner.end) { const gn = readTLV(der, r); if (gn.tag === 0x82) sans.push(td.decode(der.slice(gn.valueStart, gn.end))); else if (gn.tag === 0x87 && gn.len === 4) sans.push([...der.slice(gn.valueStart, gn.end)].join(".")); r = gn.end; }
          }
          q = ext.end;
        }
      }
      p = t.end;
    }
    const result = {
      version: `v${version}`, subject, issuer, serial,
      signatureAlgorithm: OID_NAMES[oidStr(der.slice(algOid.valueStart, algOid.end))] || oidStr(der.slice(algOid.valueStart, algOid.end)),
      notBefore: fmtTime(nb), notAfter: fmtTime(na),
      daysRemaining: Math.floor((Date.parse(fmtTime(na)) - Date.now()) / 86400000),
      subjectAltNames: sans, sha256Fingerprint: bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", der as BufferSource))).toUpperCase().replace(/(..)(?=.)/g, "$1:"),
      selfSigned: subject === issuer,
    };
    show("cert-out", result);
    emitReport("cert", "Certificate decode (pasted)", result);
  } catch (e: any) { show("cert-out", `Parse failed: ${e?.message || e}. This decoder handles standard X.509 certificates.`); }
}

/* ---------------- MIRROR: WebRTC + fingerprint ---------------- */
function runWebRtc() {
  return new Promise<void>((resolve) => {
    const found = new Set<string>();
    let pc: RTCPeerConnection | null = null;
    try { pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }); }
    catch { show("webrtc-out", "WebRTC is unavailable in this browser."); return resolve(); }
    pc.createDataChannel("probe");
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        show("webrtc-out", found.size ? { candidatesSeenByAnyWebsite: [...found], note: "These are the addresses WebRTC exposed during this check. mDNS-masked names (.local) are Chrome/Firefox doing their job; a raw LAN IP here is visible to every site you visit unless your browser or VPN masks it." } : "No ICE candidates gathered — WebRTC may be blocked, which is itself a posture.");
        emitReport("webrtc", "WebRTC exposure check", [...found]);
        pc?.close(); resolve(); return;
      }
      const parts = e.candidate.candidate.split(" ");
      const addr = parts[4]; const type = parts[7];
      if (addr) found.add(`${addr} (${type}${parts[8] ? ", " + parts.slice(8).join(" ") : ""})`);
    };
    pc.createOffer().then((o) => pc!.setLocalDescription(o)).catch(() => { show("webrtc-out", "Offer failed."); resolve(); });
    setTimeout(() => { if (pc && pc.connectionState !== "closed") { try { pc.close(); } catch { /* noop */ } resolve(); } }, 5000);
  });
}
function runFingerprint() {
  const nav = navigator as any;
  const result: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    platform: nav.userAgentData?.platform || navigator.platform,
    languages: navigator.languages, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}x, ${screen.colorDepth}-bit`,
    cpuCores: navigator.hardwareConcurrency || "hidden", deviceMemoryGB: nav.deviceMemory || "hidden",
    touchPoints: navigator.maxTouchPoints, doNotTrack: navigator.doNotTrack,
    cookiesEnabled: navigator.cookieEnabled,
    webdriver: (navigator as any).webdriver === true ? "TRUE — automation flag is set" : "false",
    pluginsVisible: navigator.plugins.length, pdfViewerEnabled: (nav as any).pdfViewerEnabled ?? "unknown",
  };
  show("fingerprint-out", result);
  emitReport("fingerprint", "Browser fingerprint surface", result);
}
async function runBle() {
  const nav = navigator as any;
  if (!nav.bluetooth) return show("ble-out", "Web Bluetooth is not available here. It needs Chrome/Edge on desktop or Android, HTTPS, and a user gesture — the same radio nightjar's listening post watches, from inside a web page.");
  try {
    show("ble-out", "Asking the browser for a device chooser… pick a device and BLACKSITE WEB will read the services it offers. Nothing is written to the device.");
    const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service", "device_information", "heart_rate", "generic_access"] });
    const info: any = { name: device.name || "(unnamed)", id: device.id };
    try {
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      info.services = [];
      for (const svc of services) {
        const entry: any = { uuid: svc.uuid };
        try {
          const chars = await svc.getCharacteristics();
          entry.characteristics = chars.map((c: any) => ({ uuid: c.uuid, properties: Object.entries(c.properties).filter(([, v]) => v).map(([k]) => k) }));
        } catch { entry.characteristics = "(could not enumerate)"; }
        info.services.push(entry);
      }
      server.disconnect();
    } catch (e: any) { info.gatt = `GATT connect/read failed: ${e?.message || e}`; }
    show("ble-out", info);
    emitReport("ble", "Web Bluetooth device read", info);
  } catch (e: any) { show("ble-out", `Cancelled or failed: ${e?.message || e}`); }
}

/* ---------------- wiring ---------------- */
export function initLab() {
  on("hash-run", "click", () => void runHash());
  on("hash-file", "change", (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void runFileHash(f); });
  on("codec-run", "click", runCodec);
  on("codec-swap", "click", () => { setVal("codec-input", val("codec-output")); });
  on("regex-run", "click", runRegex);
  on("jwt-run", "click", () => void runJwt());
  on("vault-seal", "click", () => void runVaultEncrypt());
  on("vault-open", "click", () => void runVaultDecrypt());
  on("pw-check", "click", () => show("pwgen-meta", passwordStrength(val("pw-input"))));
  on("pw-input", "input", () => show("pwgen-meta", passwordStrength(val("pw-input"))));
  on("pwgen-run", "click", genPassword);
  on("subnet-run", "click", runSubnet);
  on("cert-run", "click", () => void runCert());
  on("payload-run", "click", () => {
    // payload SHA needs async; do it properly here
    void (async () => {
      const format = val("payload-format"); const input = val("payload-input");
      try {
        let bytes: Uint8Array<ArrayBuffer>;
        if (format === "hex") bytes = hexToBytes(input); else if (format === "base64") bytes = b64ToBytes(input); else bytes = te.encode(input);
        const table: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
        let crc = 0xffffffff; bytes.forEach((b) => (crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8))); crc = (crc ^ 0xffffffff) >>> 0;
        const result = { bytes: bytes.length, asText: td.decode(bytes), asHex: bytesToHex(bytes), asBase64: bytesToB64(bytes), crc32: "0x" + crc.toString(16).padStart(8, "0"), entropyBitsPerByte: shannonEntropy(bytes), sha256: await sha("SHA-256", bytes) };
        show("payload-out", result);
        emitReport("payload", "Payload build", result);
      } catch (e: any) { show("payload-out", `Error: ${e?.message || e}`); }
    })();
  });
  on("webrtc-run", "click", () => void runWebRtc());
  on("fingerprint-run", "click", runFingerprint);
  on("ble-run", "click", () => void runBle());
}
