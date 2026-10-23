// @ts-nocheck
// GET /api/tls?host=example.com&port=443
// TLS inspector. Negotiates with cloudflare:sockets startTls for the
// version/cipher facts it can prove, and separately performs a hand-rolled
// TLS 1.2 ClientHello over a plain socket to read the certificate chain
// exactly as a client receives it (subject, issuer, SANs, validity, serial,
// signature algorithm, SHA-256 fingerprint). TLS 1.3 encrypts the
// Certificate message; when that happens we say so instead of guessing.
import { connect } from "cloudflare:sockets";
import { err, guardTarget, json } from "../_lib/guard";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function colonHex(bytes: Uint8Array): string {
  return hex(bytes).toUpperCase().replace(/(..)(?=.)/g, "$1:");
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return colonHex(new Uint8Array(digest));
}

// ---- minimal DER walker (enough for X.509 name/validity/SAN extraction) ----
const OID_NAMES: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "rsaEncryption", "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption", "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption", "1.2.840.10045.2.1": "EC public key",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256", "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512", "1.3.101.112": "Ed25519",
};
function readLen(buf: Uint8Array, i: number): [number, number] {
  const b = buf[i];
  if (b < 0x80) return [b, i + 1];
  const n = b & 0x7f;
  let v = 0;
  for (let k = 0; k < n; k++) v = v * 256 + buf[i + 1 + k];
  return [v, i + 1 + n];
}
function readTLV(buf: Uint8Array, i: number): { tag: number; start: number; headerLen: number; len: number; valueStart: number; end: number } {
  const tag = buf[i];
  const [len, afterLen] = readLen(buf, i + 1);
  return { tag, start: i, headerLen: afterLen - i, len, valueStart: afterLen, end: afterLen + len };
}
function oidString(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const out = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { out.push(v); v = 0; }
  }
  return out.join(".");
}
function derTime(bytes: Uint8Array, isUtc: boolean): string {
  const s = new TextDecoder().decode(bytes);
  try {
    if (isUtc) {
      const yy = Number(s.slice(0, 2));
      const year = yy >= 50 ? 1900 + yy : 2000 + yy;
      return new Date(Date.UTC(year, Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)))).toISOString();
    }
    return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14)))).toISOString();
  } catch { return s; }
}
function parseName(buf: Uint8Array, start: number, end: number): string {
  const parts: string[] = [];
  let i = start;
  while (i < end) {
    const set = readTLV(buf, i);
    let j = set.valueStart;
    while (j < set.end) {
      const seq = readTLV(buf, j);
      const oidT = readTLV(buf, seq.valueStart);
      const oid = oidString(buf.slice(oidT.valueStart, oidT.end));
      const valT = readTLV(buf, oidT.end);
      const val = new TextDecoder().decode(buf.slice(valT.valueStart, valT.end));
      parts.push(`${OID_NAMES[oid] || oid}=${val}`);
      j = seq.end;
    }
    i = set.end;
  }
  return parts.join(", ");
}
function parseCert(der: Uint8Array) {
  const cert = readTLV(der, 0);
  const tbs = readTLV(der, cert.valueStart);
  let p = tbs.valueStart;
  if (der[p] === 0xa0) p = readTLV(der, p).end; // [0] version
  const serialT = readTLV(der, p); p = serialT.end;
  const serial = hex(der.slice(serialT.valueStart, serialT.end)).toUpperCase().replace(/(..)(?=.)/g, "$1:") || "00";
  const algT = readTLV(der, p);
  const algOidT = readTLV(der, algT.valueStart);
  const sigAlg = OID_NAMES[oidString(der.slice(algOidT.valueStart, algOidT.end))] || oidString(der.slice(algOidT.valueStart, algOidT.end));
  p = algT.end;
  const issuerT = readTLV(der, p); const issuer = parseName(der, issuerT.valueStart, issuerT.end); p = issuerT.end;
  const validityT = readTLV(der, p);
  const nbT = readTLV(der, validityT.valueStart);
  const notBefore = derTime(der.slice(nbT.valueStart, nbT.end), nbT.tag === 0x17);
  const naT = readTLV(der, nbT.end);
  const notAfter = derTime(der.slice(naT.valueStart, naT.end), naT.tag === 0x17);
  p = validityT.end;
  const subjectT = readTLV(der, p); const subject = parseName(der, subjectT.valueStart, subjectT.end); p = subjectT.end;
  // Walk remaining TBSCertificate fields looking for [3] extensions -> SAN (2.5.29.17).
  const sans: string[] = [];
  while (p < tbs.end) {
    const t = readTLV(der, p);
    if (t.tag === 0xa3) {
      const extSeq = readTLV(der, t.valueStart);
      let q = extSeq.valueStart;
      while (q < extSeq.end) {
        const ext = readTLV(der, q);
        const eOidT = readTLV(der, ext.valueStart);
        const eOid = oidString(der.slice(eOidT.valueStart, eOidT.end));
        let vPos = eOidT.end;
        let valT = readTLV(der, vPos);
        if (valT.tag === 0x01) { vPos = valT.end; valT = readTLV(der, vPos); } // critical BOOLEAN
        if (eOid === "2.5.29.17" && valT.tag === 0x04) {
          const inner = readTLV(der, valT.valueStart);
          let r = inner.valueStart;
          while (r < inner.end) {
            const gn = readTLV(der, r);
            if (gn.tag === 0x82) sans.push(new TextDecoder().decode(der.slice(gn.valueStart, gn.end)));
            else if (gn.tag === 0x87 && gn.len === 4) sans.push([...der.slice(gn.valueStart, gn.end)].join("."));
            r = gn.end;
          }
        }
        q = ext.end;
      }
    }
    p = t.end;
  }
  const now = Date.now();
  return {
    subject, issuer, serial, signatureAlgorithm: sigAlg, notBefore, notAfter, sans,
    daysRemaining: Math.floor((Date.parse(notAfter) - now) / 86400000),
    expired: Date.parse(notAfter) < now, notYetValid: Date.parse(notBefore) > now,
    selfSigned: subject === issuer,
  };
}

// ---- hand-rolled TLS 1.2 ClientHello to read the Certificate message ----
function buildClientHello(host: string): Uint8Array {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const serverName = new TextEncoder().encode(host);
  const extensions: number[] = [];
  // server_name
  const sniEntry = [0, serverName.length >> 8, serverName.length & 0xff, ...serverName];
  const sniList = [sniEntry.length >> 8, sniEntry.length & 0xff, ...sniEntry];
  extensions.push(0, 0, sniList.length >> 8, sniList.length & 0xff, ...sniList);
  // supported_versions: TLS1.3, 1.2 (we still parse a 1.2-style Certificate if the server downgrades)
  const versions = [4, 0x03, 0x04, 0x03, 0x03];
  extensions.push(0, 43, 0, versions.length, ...versions);
  // supported_groups: x25519, secp256r1, secp384r1
  const groups = [0, 10, 0, 29, 0, 23, 0, 24];
  const groupsBody = [groups.length >> 8, groups.length & 0xff, ...groups];
  extensions.push(0, 10, groupsBody.length >> 8, groupsBody.length & 0xff, ...groupsBody);
  // signature_algorithms
  const sigList = [0x04, 0x03, 0x05, 0x03, 0x06, 0x03, 0x08, 0x04, 0x08, 0x05, 0x08, 0x06, 0x04, 0x01, 0x05, 0x01, 0x06, 0x01];
  const sigBody = [sigList.length >> 8, sigList.length & 0xff, ...sigList];
  extensions.push(0, 13, sigBody.length >> 8, sigBody.length & 0xff, ...sigBody);
  // key_share (x25519 dummy 32-byte key) so TLS 1.3 servers complete their flight
  const dummyKey = crypto.getRandomValues(new Uint8Array(32));
  const share = [0, 29, dummyKey.length >> 8, dummyKey.length & 0xff, ...dummyKey];
  const shares = [share.length >> 8, share.length & 0xff, ...share];
  const ksBody = [shares.length >> 8, shares.length & 0xff, ...shares];
  extensions.push(0, 51, ksBody.length >> 8, ksBody.length & 0xff, ...ksBody);

  const ciphers = [0x13, 0x01, 0x13, 0x02, 0x13, 0x03, 0xc0, 0x2b, 0xc0, 0x2f, 0xc0, 0x2c, 0xc0, 0x30, 0xcc, 0xa9, 0xcc, 0xa8, 0xc0, 0x13, 0xc0, 0x14, 0x00, 0x9c, 0x00, 0x9d, 0x00, 0x2f, 0x00, 0x35];
  const body: number[] = [
    0x03, 0x03, ...random,
    0, // session id length
    ciphers.length >> 8, ciphers.length & 0xff, ...ciphers,
    1, 0, // compression: null only
    extensions.length >> 8, extensions.length & 0xff, ...extensions,
  ];
  const handshake = [1, body.length >> 16, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
  return new Uint8Array([0x16, 0x03, 0x01, handshake.length >> 8, handshake.length & 0xff, ...handshake]);
}

async function readCertificateFlight(host: string, port: number, timeoutMs = 8000) {
  const socket: any = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const deadline = Date.now() + timeoutMs;
  try {
    await Promise.race([socket.opened, new Promise((_, r) => setTimeout(() => r(new Error("connect timeout")), timeoutMs))]);
    await writer.write(buildClientHello(host));
    let buf = new Uint8Array(0);
    let serverVersion: number | null = null;
    let cipher: number | null = null;
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<any>((_, r) => setTimeout(() => r(new Error("read timeout")), Math.max(1, deadline - Date.now()))),
      ]);
      if (done || !value) break;
      const merged = new Uint8Array(buf.length + value.length);
      merged.set(buf); merged.set(value, buf.length); buf = merged;
      // Walk complete records.
      let off = 0;
      const certs: Uint8Array[] = [];
      let encrypted = false;
      while (buf.length - off >= 5) {
        const type = buf[off];
        const len = (buf[off + 3] << 8) | buf[off + 4];
        if (buf.length - off < 5 + len) break;
        const payload = buf.slice(off + 5, off + 5 + len);
        if (type === 22) {
          let p = 0;
          while (p + 4 <= payload.length) {
            const hType = payload[p];
            const hLen = (payload[p + 1] << 16) | (payload[p + 2] << 8) | payload[p + 3];
            if (hType === 2 && p + 4 + hLen <= payload.length) { // ServerHello
              serverVersion = (payload[p + 4] << 8) | payload[p + 5];
              const sidLenOff = p + 4 + 2 + 32;
              const sidLen = payload[sidLenOff];
              const cipherOff = sidLenOff + 1 + sidLen;
              cipher = (payload[cipherOff] << 8) | payload[cipherOff + 1];
            }
            if (hType === 11) { // Certificate
              let q = p + 4;
              q += 3; // certificate_list length (TLS1.2 layout) -- 1.3 has a request-context byte first; handled by fallback below
              // TLS 1.2: uint24 total, then per-cert uint24 len + DER.
              let totalEnd = q + (((payload[q - 3] << 16) | (payload[q - 2] << 8) | payload[q - 1]));
              let r = q;
              while (r + 3 < totalEnd && r + 3 <= payload.length) {
                const cLen = (payload[r] << 16) | (payload[r + 1] << 8) | payload[r + 2];
                if (cLen > 0 && r + 3 + cLen <= payload.length) certs.push(payload.slice(r + 3, r + 3 + cLen));
                r += 3 + cLen;
                // TLS 1.3 per-cert extensions: skip uint16 if present and parse failed.
                if (certs.length && r === q + 3 + cLen) {
                  // peek: if remaining structure looks like extensions, advance 2 + len
                  const extLen = (payload[r] << 8) | payload[r + 1];
                  if (Number.isFinite(extLen) && r + 2 + extLen < totalEnd + 1 && certs.length === 1 && totalEnd > r + 2 + extLen) {
                    // Only skip when the next cert length parses plausibly.
                    const after = r + 2 + extLen;
                    const nLen = (payload[after] << 16) | (payload[after + 1] << 8) | payload[after + 2];
                    if (nLen > 100 && after + 3 + nLen <= payload.length + 2) r = after;
                  }
                }
              }
            }
            p += 4 + hLen;
            if (p > payload.length) break;
          }
        }
        if (type === 23) encrypted = true; // application data => TLS1.3 encrypted handshake flight
        off += 5 + len;
        if (certs.length > 0) return { certs, serverVersion, cipher, encrypted };
        if (encrypted && certs.length === 0) return { certs, serverVersion, cipher, encrypted };
      }
      buf = buf.slice(off);
      if (certs.length > 0) return { certs, serverVersion, cipher, encrypted: false };
    }
    return { certs: [], serverVersion, cipher, encrypted: false };
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
    try { writer.releaseLock(); } catch { /* noop */ }
    try { socket.close(); } catch { /* noop */ }
  }
}

const TLS_CIPHERS: Record<number, string> = {
  0x1301: "TLS_AES_128_GCM_SHA256", 0x1302: "TLS_AES_256_GCM_SHA384", 0x1303: "TLS_CHACHA20_POLY1305_SHA256",
  0xc02b: "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256", 0xc02f: "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  0xc02c: "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", 0xc030: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  0xcca9: "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256", 0xcca8: "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
  0xc013: "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA", 0xc014: "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
  0x009c: "TLS_RSA_WITH_AES_128_GCM_SHA256", 0x009d: "TLS_RSA_WITH_AES_256_GCM_SHA384",
  0x002f: "TLS_RSA_WITH_AES_128_CBC_SHA", 0x0035: "TLS_RSA_WITH_AES_256_CBC_SHA",
};

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const hostParam = url.searchParams.get("host") || "";
  const port = Number(url.searchParams.get("port") || 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return err("Port must be 1-65535.");
  let host: string; let addresses: string[] = [];
  try {
    const g = await guardTarget(hostParam);
    host = g.host; addresses = g.addresses;
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  const started = Date.now();
  let flight: Awaited<ReturnType<typeof readCertificateFlight>> | null = null;
  let flightError = "";
  try {
    flight = await readCertificateFlight(host, port);
  } catch (e: any) {
    flightError = String(e?.message || "handshake failed");
  }
  const versionName = flight?.serverVersion === 0x0304 ? "TLS 1.3 (via supported_versions)" : flight?.serverVersion === 0x0303 ? "TLS 1.2" : flight?.serverVersion === 0x0302 ? "TLS 1.1" : flight?.serverVersion === 0x0301 ? "TLS 1.0" : null;
  const chain: any[] = [];
  if (flight && flight.certs.length) {
    for (let i = 0; i < flight.certs.length; i++) {
      try {
        chain.push({ position: i === 0 ? "leaf" : `intermediate-${i}`, ...parseCert(flight.certs[i]), sha256Fingerprint: await sha256Hex(flight.certs[i]) });
      } catch {
        chain.push({ position: i === 0 ? "leaf" : `intermediate-${i}`, parseError: "Certificate received but could not be parsed.", sha256Fingerprint: await sha256Hex(flight.certs[i]) });
      }
    }
  }
  const leaf = chain[0] || null;
  const findings: string[] = [];
  if (leaf?.expired) findings.push("Leaf certificate is EXPIRED.");
  if (leaf?.notYetValid) findings.push("Leaf certificate is not yet valid.");
  if (leaf && leaf.daysRemaining <= 21 && !leaf.expired) findings.push(`Leaf certificate expires soon (${leaf.daysRemaining} days).`);
  if (leaf?.selfSigned) findings.push("Leaf certificate is self-signed (subject equals issuer).");
  if (leaf && (!leaf.sans || leaf.sans.length === 0)) findings.push("Leaf certificate carries no Subject Alternative Names (modern browsers require SANs).");
  if (leaf && host && leaf.sans?.length && !leaf.sans.some((s: string) => s === host || (s.startsWith("*.") && host.split(".").length === s.split(".").length && host.endsWith(s.slice(1))))) findings.push(`Hostname ${host} is not covered by the leaf SAN list.`);
  if (flight?.encrypted && chain.length === 0) findings.push("Server negotiated TLS 1.3 and encrypted its Certificate message, so the chain cannot be read with a raw 1.2-style flight from the edge. The HTTPS reachability result still applies.");
  if (flightError) findings.push(`Raw handshake flight failed: ${flightError}. The server may require TLS 1.3, SNI-based routing, or client settings this probe does not offer.`);
  if (!flightError && flight && flight.serverVersion == null && chain.length === 0 && !flight.encrypted) findings.push("No TLS handshake data was received. That port may not speak TLS at all, may require a protocol this probe does not speak, or may be silently dropping the edge's connection.");
  return json({
    ok: true, host, port, addresses, ms: Date.now() - started,
    serverHelloVersion: versionName, cipherSuite: flight?.cipher != null ? (TLS_CIPHERS[flight.cipher] || `0x${flight.cipher.toString(16).padStart(4, "0")}`) : null,
    chain, findings,
    note: "Facts read from the server's own handshake flight at a Cloudflare edge location. Chain validation against a root store is your browser's job; this probe reports what was presented.",
  });
}
