// BLACKSITE OS — the SSH client. A real one, in the tab: curve25519 key
// exchange (BigInt ladder below), AES-GCM transport (RFC 5647 counter
// discipline — the invocation counter starts at the derived IV, exactly
// as the native bench learned against live servers), host-key signature
// verification, password / keyboard-interactive auth, and a shell
// channel. The wire reaches the target through /api/ssh-bridge, a pure
// byte pipe at the site's edge — all cryptography lives here.

/* ————— byte helpers ————— */
export const enc = new TextEncoder();
export const dec = new TextDecoder();
export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
export function u32(n: number): Uint8Array<ArrayBuffer> { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; }
export function sshString(data: Uint8Array | string): Uint8Array<ArrayBuffer> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return concat(u32(bytes.length), bytes);
}
export function sshMpint(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  let b = bytes;
  while (b.length > 1 && b[0] === 0 && (b[1] & 0x80) === 0) b = b.slice(1);
  if (b.length && (b[0] & 0x80)) b = concat(new Uint8Array([0]), b);
  return sshString(b);
}
export class Reader {
  off = 0;
  constructor(public buf: Uint8Array) {}
  u8(): number { return this.buf[this.off++]; }
  bool(): boolean { return this.u8() !== 0; }
  u32(): number { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.off, 4).getUint32(0); this.off += 4; return v; }
  bytes(n: number): Uint8Array { const v = this.buf.slice(this.off, this.off + n); this.off += n; return v; }
  string(): Uint8Array { return this.bytes(this.u32()); }
  str(): string { return dec.decode(this.string()); }
  nameList(): string[] { const s = this.str(); return s ? s.split(",") : []; }
  rest(): Uint8Array { return this.buf.slice(this.off); }
}
export async function sha256(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}
export function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "");
}

/* ————— curve25519 (RFC 7748, BigInt Montgomery ladder) ————— */
const P = (1n << 255n) - 19n;
function modPow(base: bigint, exp: bigint): bigint {
  let result = 1n; let b = base % P;
  while (exp > 0n) { if (exp & 1n) result = (result * b) % P; b = (b * b) % P; exp >>= 1n; }
  return result;
}
function leToBig(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}
function bigToLe(v: bigint, len = 32): Uint8Array {
  const out = new Uint8Array(len);
  let x = v;
  for (let i = 0; i < len; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
export function x25519(scalar: Uint8Array, uBytes: Uint8Array): Uint8Array {
  const k = new Uint8Array(scalar);
  k[0] &= 248; k[31] &= 127; k[31] |= 64;
  const n = leToBig(k);
  const x1 = leToBig(uBytes) & ((1n << 255n) - 1n);
  let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
  const A24 = 121665n;
  for (let t = 254; t >= 0; t--) {
    const bit = (n >> BigInt(t)) & 1n;
    swap ^= bit;
    if (swap === 1n) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    swap = bit;
    const A = (x2 + z2) % P, AA = (A * A) % P, B = (x2 - z2 + P) % P, BB = (B * B) % P;
    const C = (x3 + z3) % P, D = (x3 - z3 + P) % P, DA = (D * A) % P, CB = (C * B) % P;
    const E = (AA - BB + P) % P;
    x3 = ((DA + CB) % P) ** 2n % P;
    z3 = (x1 * (((DA - CB + P) % P) ** 2n % P)) % P;
    x2 = (AA * BB) % P;
    z2 = (E * ((AA + A24 * E) % P)) % P;
  }
  if (swap === 1n) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
  return bigToLe((x2 * modPow(z2, P - 2n)) % P);
}
export const X25519_BASE = new Uint8Array(32); X25519_BASE[0] = 9;

/* ————— KDF (RFC 4253 §7.2) ————— */
export async function kdf(K: Uint8Array, H: Uint8Array, sessionId: Uint8Array, letter: string, need: number): Promise<Uint8Array> {
  let out = new Uint8Array(0);
  let prev = new Uint8Array(0);
  while (out.length < need) {
    const data = prev.length === 0
      ? concat(sshMpint(K), H, enc.encode(letter), sessionId)
      : concat(sshMpint(K), H, prev);
    prev = await sha256(data);
    out = concat(out, prev);
  }
  return out.slice(0, need);
}

/* ————— the packet transport —————
   Before NEWKEYS: plain framing. After: AES-GCM per RFC 5647 — the
   4-byte length is sealed as its own invocation (tag discarded, as
   OpenSSH does), the payload sealed with its tag appended, and the
   invocation counter starts at the derived IV's counter half and
   increments per invocation. */
export class Transport {
  private buf = new Uint8Array(0);
  private sendKey: CryptoKey | null = null;
  private recvKey: CryptoKey | null = null;
  private sendFixed = new Uint8Array(4); private recvFixed = new Uint8Array(4);
  private sendCounter = 0n; private recvCounter = 0n;
  private sendChain: Promise<void> = Promise.resolve();
  onPacket: (payload: Uint8Array) => void = () => {};
  onError: (e: Error) => void = () => {};
  constructor(private send: (bytes: Uint8Array) => void) {}
  feed(bytes: Uint8Array) {
    this.buf = concat(this.buf, bytes);
    void this.pump();
  }
  private pumping = false;
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const payload = await this.tryRead();
        if (payload === null) break;
        this.onPacket(payload);
      }
    } catch (e: any) { this.onError(e instanceof Error ? e : new Error(String(e))); } finally { this.pumping = false; }
  }
  private async tryRead(): Promise<Uint8Array | null> {
    if (!this.recvKey) {
      if (this.buf.length < 4) return null;
      const len = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0);
      if (len > 1_000_000) throw new Error("ssh: absurd packet length");
      if (this.buf.length < 4 + len) return null;
      const packet = this.buf.slice(4, 4 + len);
      this.buf = this.buf.slice(4 + len);
      const pad = packet[0];
      return packet.slice(1, packet.length - pad);
    }
    if (this.buf.length < 4) return null;
    const nonce = concat(this.recvFixed, be64(this.recvCounter));
    const keystream = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, this.recvKey, new Uint8Array(4)));
    const lenBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) lenBytes[i] = this.buf[i] ^ keystream[i];
    const len = new DataView(lenBytes.buffer).getUint32(0);
    if (len > 1_000_000 || len < 12) throw new Error("ssh: absurd encrypted packet length — the keys disagree");
    if (this.buf.length < 4 + len + 16) return null;
    this.recvCounter++;
    const payloadNonce = concat(this.recvFixed, be64(this.recvCounter));
    this.recvCounter++;
    const sealed = this.buf.slice(4, 4 + len + 16);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: payloadNonce, tagLength: 128 }, this.recvKey, sealed));
    this.buf = this.buf.slice(4 + len + 16);
    const pad = plain[0];
    return plain.slice(1, plain.length - pad);
  }
  async enableEncryption(sendIv: Uint8Array, sendKeyBytes: Uint8Array, recvIv: Uint8Array, recvKeyBytes: Uint8Array) {
    this.sendKey = await crypto.subtle.importKey("raw", sendKeyBytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    this.recvKey = await crypto.subtle.importKey("raw", recvKeyBytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    this.sendFixed = sendIv.slice(0, 4); this.recvFixed = recvIv.slice(0, 4);
    this.sendCounter = leToBig(sendIv.slice(4, 12).reverse());
    this.recvCounter = leToBig(recvIv.slice(4, 12).reverse());
  }
  writePacket(payload: Uint8Array) {
    this.sendChain = this.sendChain.then(() => this.writePacketNow(payload));
    return this.sendChain;
  }
  private async writePacketNow(payload: Uint8Array) {
    const blockSize = 16;
    let padLen = blockSize - ((payload.length + 5) % blockSize);
    if (padLen < 4) padLen += blockSize;
    const packetLen = payload.length + padLen + 1;
    const packet = concat(new Uint8Array([padLen]), payload, crypto.getRandomValues(new Uint8Array(padLen)));
    if (!this.sendKey) {
      this.send(concat(u32(packetLen), packet));
      return;
    }
    const lenNonce = concat(this.sendFixed, be64(this.sendCounter)); this.sendCounter++;
    const sealedLen = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: lenNonce, tagLength: 128 }, this.sendKey, u32(packetLen)));
    const payloadNonce = concat(this.sendFixed, be64(this.sendCounter)); this.sendCounter++;
    const sealedBody = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: payloadNonce, tagLength: 128 }, this.sendKey, packet));
    this.send(concat(sealedLen.slice(0, 4), sealedBody));
  }
}
function be64(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 7; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

/* ————— the session ————— */
export interface SshCallbacks {
  onStatus: (msg: string) => void;
  onData: (bytes: Uint8Array) => void;
  confirmHostKey: (fingerprint: string, algorithm: string) => Promise<boolean>;
  getPassword: () => Promise<string | null>;
  onClose: (reason: string) => void;
}
const CLIENT_VERSION = "SSH-2.0-BLACKSITE-OS_1.0";
const HANDSHAKE_STEP_MS = 10_000;
const KEX_ALGS = ["curve25519-sha256", "curve25519-sha256@libssh.org"];
const HOSTKEY_ALGS = ["ssh-ed25519", "rsa-sha2-256"];
const CIPHER_ALGS = ["aes256-gcm@openssh.com", "aes128-gcm@openssh.com"];

export class SshSession {
  private transport: Transport;
  private bannerBuf = new Uint8Array(0);
  private phase: "banner" | "packets" = "banner";
  private waiters: Array<{ type: number; resolve: (p: Uint8Array) => void }> = [];
  private serverVersion = "";
  private authed = false;
  private localChannel = 0;
  private remoteChannel = 0;
  private serverWindow = 0;
  private sendQueue: Uint8Array[] = [];
  private consumed = 0;
  private closed = false;
  private stash = new Map<number, Uint8Array>();
  constructor(private pipeSend: (bytes: Uint8Array) => void, private cb: SshCallbacks, private user: string) {
    this.transport = new Transport(pipeSend);
    this.transport.onPacket = (payload) => this.handlePacket(payload);
    this.transport.onError = (e) => this.close(`transport: ${e.message}`);
  }
  feed(bytes: Uint8Array) {
    if (this.phase === "banner") {
      this.bannerBuf = concat(this.bannerBuf, bytes);
      const nl = this.bannerBuf.indexOf(0x0a);
      if (nl < 0) { if (this.bannerBuf.length > 1024) this.cb.onClose("the server never sent an SSH banner"); return; }
      const line = dec.decode(this.bannerBuf.slice(0, nl)).trim();
      const rest = this.bannerBuf.slice(nl + 1);
      this.bannerBuf = new Uint8Array(0);
      if (!line.startsWith("SSH-")) { this.cb.onClose(`that is not an SSH server (it said: ${line.slice(0, 60)})`); return; }
      this.serverVersion = line;
      this.phase = "packets";
      if (rest.length) this.transport.feed(rest);
      return;
    }
    this.transport.feed(bytes);
  }
  private handlePacket(payload: Uint8Array) {
    const type = payload[0];
    for (let i = 0; i < this.waiters.length; i++) {
      if (this.waiters[i].type === type) { const w = this.waiters.splice(i, 1)[0]; w.resolve(payload); return; }
    }
    if ([20, 21, 31, 6, 51, 52, 60, 91, 92, 99, 100].includes(type)) { this.stash.set(type, payload); return; }
    if (type === 1) { const r = new Reader(payload.slice(1)); r.u32(); this.close(r.str() || "the server disconnected"); return; }
    if (type === 94 || type === 95) {
      const r = new Reader(payload.slice(1));
      r.u32();
      let data: Uint8Array;
      if (type === 95) { r.u32(); data = r.string(); } else data = r.string();
      this.consumed += data.length;
      if (this.consumed >= 524288) { this.consumed = 0; void this.transport.writePacket(concat(new Uint8Array([93]), u32(this.remoteChannel), u32(1048576))); }
      this.cb.onData(data);
      return;
    }
    if (type === 93) { const r = new Reader(payload.slice(1)); r.u32(); this.serverWindow += r.u32(); this.flushSend(); return; }
    if (type === 96) { return; }
    if (type === 97) { this.close("the server closed the channel"); return; }
    if (type === 98) { return; } // channel requests (exit-status etc.) — noted, not acted on
  }
  private waitFor(type: number): Promise<Uint8Array> {
    const stashed = this.stash.get(type);
    if (stashed) { this.stash.delete(type); return Promise.resolve(stashed); }
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const w = { type, resolve: (p: Uint8Array) => { clearTimeout(timer); resolve(p); } };
      // The bridge's discipline, kept on this side too: no single
      // machine-paced step of the greeting may wait on the far door
      // longer than 10s. A server that goes silent mid-handshake —
      // after the banner, during kex, before auth — fails the
      // connect instead of hanging it forever. Steps paced by the
      // operator's own hand (trusting a host key, typing a password)
      // are waits on the operator, not the wire, and are not on
      // this clock.
      timer = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        const err = new Error(`ssh: the server went silent mid-handshake (10s waiting for packet type ${type}) — connection dropped.`);
        this.close(err.message);
        reject(err);
      }, HANDSHAKE_STEP_MS);
      this.waiters.push(w);
    });
  }
  private close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.cb.onClose(reason);
  }
  async connect(cols: number, rows: number): Promise<void> {
    this.cb.onStatus("banner exchange…");
    // our version line goes first, raw, before any packet framing
    this.pipeSend(enc.encode(CLIENT_VERSION + "\r\n"));
    const serverKex = this.waitFor(20);
    const myKexPayload = buildKexInit();
    await this.transport.writePacket(myKexPayload);
    const serverKexPayload = await serverKex;
    const server = parseKexInit(serverKexPayload);
    const kex = KEX_ALGS.find((a) => server.kex.includes(a));
    const hostkeyAlg = HOSTKEY_ALGS.find((a) => server.hostkey.includes(a));
    const cipher = CIPHER_ALGS.find((a) => server.ciphersCS.includes(a));
    if (!kex || !hostkeyAlg || !cipher) throw new Error(`no common language — server offers kex [${server.kex.join(", ")}], host keys [${server.hostkey.join(", ")}], ciphers [${server.ciphersCS.join(", ")}]. the room speaks curve25519, ed25519/rsa-sha2-256, aes-gcm.`);
    this.cb.onStatus(`key exchange (${kex})…`);
    const ephPriv = crypto.getRandomValues(new Uint8Array(32));
    const ephPub = x25519(ephPriv, X25519_BASE);
    const kexReplyP = this.waitFor(31);
    await this.transport.writePacket(concat(new Uint8Array([30]), sshString(ephPub)));
    const reply = await kexReplyP;
    const rr = new Reader(reply.slice(1));
    const hostKeyBlob = rr.string();
    const serverPub = rr.string();
    const sigBlob = rr.string();
    const shared = x25519(ephPriv, serverPub);
    const H = await sha256(concat(sshString(CLIENT_VERSION), sshString(this.serverVersion), sshString(myKexPayload), sshString(serverKexPayload), sshString(hostKeyBlob), sshString(ephPub), sshString(serverPub), sshMpint(shared)));
    const hostAlg = new Reader(hostKeyBlob).str();
    const fingerprint = "SHA256:" + b64(await sha256(hostKeyBlob));
    await verifyHostSignature(hostAlg, hostKeyBlob, H, sigBlob);
    if (!(await this.cb.confirmHostKey(fingerprint, hostAlg))) throw new Error("host key refused — connection dropped before authentication, as it should be.");
    const keyLen = cipher.startsWith("aes256") ? 32 : 16;
    const sessionId = H;
    const ivCS = await kdf(shared, H, sessionId, "A", 12);
    const ivSC = await kdf(shared, H, sessionId, "B", 12);
    const keyCS = await kdf(shared, H, sessionId, "C", keyLen);
    const keySC = await kdf(shared, H, sessionId, "D", keyLen);
    const newKeysP = this.waitFor(21);
    await this.transport.writePacket(new Uint8Array([21]));
    await this.transport.enableEncryption(ivCS, keyCS, ivSC, keySC);
    await newKeysP;
    this.cb.onStatus("encrypted. authenticating…");
    await this.serviceRequest("ssh-userauth");
    await this.authenticate();
    this.cb.onStatus("opening the shell…");
    await this.openChannel(cols, rows);
    this.cb.onStatus("connected.");
  }
  private async serviceRequest(name: string) {
    const okP = this.waitFor(6);
    await this.transport.writePacket(concat(new Uint8Array([5]), sshString(name)));
    await okP;
  }
  private async authenticate() {
    const password = await this.cb.getPassword();
    if (password === null) throw new Error("no password given — the room does not guess.");
    const first = await this.raceAuth();
    await this.transport.writePacket(concat(new Uint8Array([50]), sshString(this.user), sshString("ssh-connection"), sshString("password"), new Uint8Array([0]), sshString(password)));
    const outcome = await first;
    if (outcome.kind === "success") { this.authed = true; return; }
    if (outcome.kind === "info") { await this.answerInfo(password, outcome.payload); const again = await this.raceAuth(); if ((await again).kind === "success") { this.authed = true; return; } throw new Error("authentication failed — the server refused."); }
    const methods = outcome.methods || [];
    if (methods.includes("keyboard-interactive")) {
      const p = this.raceAuth();
      await this.transport.writePacket(concat(new Uint8Array([50]), sshString(this.user), sshString("ssh-connection"), sshString("keyboard-interactive"), sshString(""), sshString("")));
      const o2 = await p;
      if (o2.kind === "info") { await this.answerInfo(password, o2.payload); const o3 = await this.raceAuth(); if ((await o3).kind === "success") { this.authed = true; return; } }
      if (o2.kind === "success") { this.authed = true; return; }
    }
    throw new Error(`authentication failed — the server refused the password (methods it still offers: ${methods.join(", ") || "none"}). the room keeps no second guess.`);
  }
  private raceAuth(): Promise<{ kind: "success" } | { kind: "methods"; methods: string[] } | { kind: "info"; payload: Uint8Array }> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: any) => { if (!done) { done = true; resolve(v); } };
      this.waitFor(52).then(() => finish({ kind: "success" }));
      this.waitFor(51).then((payload) => { const r = new Reader(payload.slice(1)); finish({ kind: "methods", methods: r.nameList() }); });
      this.waitFor(60).then((payload) => finish({ kind: "info", payload }));
    });
  }
  private async answerInfo(password: string, payload: Uint8Array) {
    const r = new Reader(payload.slice(1));
    r.str(); r.str(); r.str();
    const count = r.u32();
    const answers: Uint8Array[] = [u32(count)];
    for (let i = 0; i < count; i++) { r.string(); r.bool(); answers.push(sshString(password)); }
    await this.transport.writePacket(concat(new Uint8Array([61]), ...answers));
  }
  private async openChannel(cols: number, rows: number) {
    const confirmP = this.waitFor(91);
    const failP = this.waitFor(92);
    await this.transport.writePacket(concat(new Uint8Array([90]), sshString("session"), u32(this.localChannel), u32(1048576), u32(32768)));
    const confirm = await Promise.race([confirmP, failP]);
    if (confirm[0] === 92) throw new Error("the server refused the session channel.");
    const r = new Reader(confirm.slice(1));
    this.remoteChannel = r.u32();
    this.serverWindow = r.u32();
    const ptyOk = this.waitFor(99); const ptyFail = this.waitFor(100);
    await this.transport.writePacket(concat(new Uint8Array([98]), u32(this.remoteChannel), new Uint8Array([1]), sshString("pty-req"), sshString("xterm-256color"), u32(cols), u32(rows), u32(0), u32(0), sshString("")));
    await Promise.race([ptyOk, ptyFail]);
    await this.transport.writePacket(concat(new Uint8Array([98]), u32(this.remoteChannel), new Uint8Array([0]), sshString("shell")));
  }
  sendData(bytes: Uint8Array) {
    this.sendQueue.push(bytes);
    this.flushSend();
  }
  private flushSend() {
    while (this.sendQueue.length && this.serverWindow > 0) {
      const head = this.sendQueue[0];
      const n = Math.min(head.length, this.serverWindow, 32768);
      const chunk = head.slice(0, n);
      this.sendQueue[0] = head.slice(n);
      if (!this.sendQueue[0].length) this.sendQueue.shift();
      this.serverWindow -= n;
      void this.transport.writePacket(concat(new Uint8Array([94]), u32(this.remoteChannel), sshString(chunk)));
    }
  }
  resize(cols: number, rows: number) {
    void this.transport.writePacket(concat(new Uint8Array([98]), u32(this.remoteChannel), new Uint8Array([0]), sshString("window-change"), u32(cols), u32(rows), u32(0), u32(0)));
  }
  disconnect() {
    void this.transport.writePacket(concat(new Uint8Array([1]), u32(1), sshString("leaving"), sshString("")));
    this.close("disconnected.");
  }
}
function buildKexInit(): Uint8Array {
  const cookie = crypto.getRandomValues(new Uint8Array(16));
  const lists = [KEX_ALGS.join(","), HOSTKEY_ALGS.join(","), CIPHER_ALGS.join(","), CIPHER_ALGS.join(","), "hmac-sha2-256", "hmac-sha2-256", "none", "none", "", ""];
  return concat(new Uint8Array([20]), cookie, ...lists.map((l) => sshString(l)), new Uint8Array([0]), u32(0));
}
function parseKexInit(payload: Uint8Array) {
  const r = new Reader(payload.slice(1));
  r.bytes(16);
  const kex = r.nameList(); const hostkey = r.nameList();
  const ciphersCS = r.nameList(); r.nameList(); r.nameList(); r.nameList(); r.nameList(); r.nameList(); r.nameList(); r.nameList();
  return { kex, hostkey, ciphersCS };
}
async function verifyHostSignature(alg: string, hostKeyBlob: Uint8Array, H: Uint8Array, sigBlob: Uint8Array) {
  const sr = new Reader(sigBlob);
  const sigAlg = sr.str();
  const sig = sr.string();
  const data = sshString(H);
  if (alg === "ssh-ed25519" && sigAlg === "ssh-ed25519") {
    const kr = new Reader(hostKeyBlob); kr.str();
    const pub = kr.string();
    try {
      const key = await crypto.subtle.importKey("raw", pub as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sig as BufferSource, data as BufferSource);
      if (!ok) throw new Error("the host key signature does not verify — this is not the server it claims to be, or the wire bent it. dropped.");
    } catch (e: any) {
      if (String(e?.message || e).includes("does not verify")) throw e;
      throw new Error("this browser cannot verify Ed25519 host keys (WebCrypto Ed25519 unavailable) — connection refused rather than unverified.");
    }
    return;
  }
  if (alg === "rsa-sha2-256" || alg === "ssh-rsa") {
    const kr = new Reader(hostKeyBlob); kr.str();
    const e = kr.string(); const n = kr.string();
    const jwk = { kty: "RSA", e: b64url(e), n: b64url(n) };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sig as BufferSource, data as BufferSource);
    if (!ok) throw new Error("the host key signature does not verify — dropped.");
    return;
  }
  throw new Error(`unsupported host key algorithm ${alg}.`);
}
function b64url(bytes: Uint8Array): string {
  let b = bytes;
  while (b.length > 1 && b[0] === 0) b = b.slice(1);
  return b64(b).replace(/\+/g, "-").replace(/\//g, "_");
}
