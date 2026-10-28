// phonehome — Blacksite OS's telecommunications field.
//
// A secure transmitter and a reception field, point to point
// between two Blacksite stations. The only live bearer a browser
// has is WebRTC, so that is what carries it: voice on the
// platform's DTLS-SRTP media path, text on a data channel and
// additionally sealed (AES-256-GCM under an ECDH session key)
// between the two operators' identities. Signaling — the one
// rendezvous a peer link needs — travels two ways over one wire
// format: hand-carried by the operators themselves, or swapped
// by the site's narrow edge rendezvous (functions/api/phonehome),
// which holds signed signals only, for minutes, and never sees
// a word or a sound of the link itself.
//
// Doctrine, named in the window as everywhere in this house:
// no PSTN, no SMS, no cellular — a browser has no telephony
// radio. Transmitting is an active organ under EMCON; listening
// is a ledger contact; alpha tears a live link down.
import { verb, bToHex, bToB64, b64ToB } from "./os-shell";
import type { BlacksiteOS } from "./os-shell";
import { sfx } from "./os-sound";
import { skey } from "./os-depth";

export const PHONEHOME_SCHEMA = {
  signal: "nsm.phonehome.signal.v1",
  message: "nsm.phonehome.message.v1",
  identity: "nsm.phonehome.identity.v1",
} as const;
const IDENTITY_PATH = "/home/operator/phonehome-identity.json";
const STORE_KEY = "blacksite-phonehome-v1";
const SIGNAL_MAX_AGE_MS = 30 * 60 * 1000;
const RENDEZVOUS_TTL_S = 600;
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const MAX_TEXT = 16 * 1024;

const te = new TextEncoder();
const td = new TextDecoder();

/* ---------------- identity ---------------- */

export interface PhoneIdentity {
  ecdh: CryptoKeyPair;
  sign: CryptoKeyPair;
  ecdhPub: JsonWebKey;
  signPub: JsonWebKey;
  fingerprint: string;
}

async function fingerprintFor(ecdhPub: JsonWebKey, signPub: JsonWebKey): Promise<string> {
  const material = ["nsm.phonehome.identity.v1", ecdhPub.x, ecdhPub.y, signPub.x, signPub.y].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", te.encode(material));
  return `sha256:${bToHex(new Uint8Array(digest))}`;
}
export function shortFingerprint(fp: string): string {
  const hex = fp.replace(/^sha256:/, "");
  return (hex.match(/.{1,4}/g) || []).slice(0, 4).join(" ");
}

async function makeIdentity(): Promise<PhoneIdentity> {
  const ecdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const ecdhPub = await crypto.subtle.exportKey("jwk", ecdh.publicKey);
  const signPub = await crypto.subtle.exportKey("jwk", sign.publicKey);
  return { ecdh, sign, ecdhPub, signPub, fingerprint: await fingerprintFor(ecdhPub, signPub) };
}

async function identityToJson(id: PhoneIdentity): Promise<string> {
  return JSON.stringify({
    schema: PHONEHOME_SCHEMA.identity,
    ecdhPriv: await crypto.subtle.exportKey("jwk", id.ecdh.privateKey),
    ecdhPub: id.ecdhPub,
    signPriv: await crypto.subtle.exportKey("jwk", id.sign.privateKey),
    signPub: id.signPub,
  }, null, 2);
}
async function identityFromJson(text: string): Promise<PhoneIdentity> {
  const data = JSON.parse(text);
  if (data?.schema !== PHONEHOME_SCHEMA.identity) throw new Error("that file is not a phonehome identity");
  const ecdh = {
    privateKey: await crypto.subtle.importKey("jwk", data.ecdhPriv, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("jwk", data.ecdhPub, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
  const sign = {
    privateKey: await crypto.subtle.importKey("jwk", data.signPriv, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]),
    publicKey: await crypto.subtle.importKey("jwk", data.signPub, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
  };
  const fp = await fingerprintFor(data.ecdhPub, data.signPub);
  return { ecdh, sign, ecdhPub: data.ecdhPub, signPub: data.signPub, fingerprint: fp };
}

/* The room's own identity + callsign. Memory only, like Bottle's,
   until the operator saves the identity into the VFS by hand. */
let identity: PhoneIdentity | null = null;
let callsign = "";
try { callsign = localStorage.getItem(skey(STORE_KEY)) || ""; } catch { /* storage is optional */ }
function saveCallsign() { try { const wireWrite = (window as unknown as { __blacksiteWireWrite?: (s: string, v: string | null) => boolean }).__blacksiteWireWrite; if (!wireWrite || !wireWrite("phonehome", callsign)) localStorage.setItem(skey(STORE_KEY), callsign); } catch { /* optional */ } }
async function ensureIdentity(): Promise<PhoneIdentity> {
  if (!identity) identity = await makeIdentity();
  return identity;
}

/* ---------------- signed signals ---------------- */

interface SignalBlob {
  schema: string; kind: "offer" | "answer"; from: string; fingerprint: string;
  ecdhPub: JsonWebKey; signPub: JsonWebKey; sdp: RTCSessionDescriptionInit;
  nonce: string; ts: number; sig: string;
}
function signalPayload(b: Omit<SignalBlob, "sig">): string {
  return [b.schema, b.kind, b.from, b.fingerprint, JSON.stringify(b.ecdhPub), JSON.stringify(b.signPub), b.sdp.type || "", b.sdp.sdp || "", b.nonce, String(b.ts)].join("\n");
}
async function signSignal(id: PhoneIdentity, kind: "offer" | "answer", sdp: RTCSessionDescriptionInit): Promise<string> {
  const base: Omit<SignalBlob, "sig"> = {
    schema: PHONEHOME_SCHEMA.signal, kind, from: callsign || "a blacksite station",
    fingerprint: id.fingerprint, ecdhPub: id.ecdhPub, signPub: id.signPub,
    sdp, nonce: bToHex(crypto.getRandomValues(new Uint8Array(12))), ts: Date.now(),
  };
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, id.sign.privateKey, te.encode(signalPayload(base)));
  return JSON.stringify({ ...base, sig: bToB64(new Uint8Array(sig)) });
}
async function verifySignal(text: string): Promise<SignalBlob> {
  let b: SignalBlob;
  try { b = JSON.parse(text); } catch { throw new Error("that signal is not phonehome signal text"); }
  if (b?.schema !== PHONEHOME_SCHEMA.signal) throw new Error("that signal is not a phonehome signal");
  if (Math.abs(Date.now() - (b.ts || 0)) > SIGNAL_MAX_AGE_MS) throw new Error("that signal is stale — signals live thirty minutes; make a fresh one");
  const expected = await fingerprintFor(b.ecdhPub, b.signPub);
  if (expected !== b.fingerprint) throw new Error("signal fingerprint does not match its keys — refused");
  const key = await crypto.subtle.importKey("jwk", b.signPub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const { sig, ...rest } = b;
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64ToB(sig || "") as BufferSource, te.encode(signalPayload(rest as Omit<SignalBlob, "sig">)));
  if (!ok) throw new Error("signal signature does not verify — refused");
  return b;
}

/* ---------------- sealed text ---------------- */

async function deriveSessionKey(mine: PhoneIdentity, peerEcdhPub: JsonWebKey): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey("jwk", peerEcdhPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, mine.ecdh.privateKey, 256);
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function sealText(key: CryptoKey, from: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify({ text, ts: Date.now() })));
  return JSON.stringify({ schema: PHONEHOME_SCHEMA.message, from, iv: bToB64(iv), ct: bToB64(new Uint8Array(ct)) });
}
async function openText(key: CryptoKey, raw: string): Promise<{ text: string; ts: number }> {
  const env = JSON.parse(raw);
  if (env?.schema !== PHONEHOME_SCHEMA.message) throw new Error("not a phonehome transmission");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToB(env.iv) as BufferSource }, key, b64ToB(env.ct) as BufferSource);
  return JSON.parse(td.decode(pt));
}

/* ---------------- one endpoint of a link ---------------- */

type LinkState = "idle" | "waiting" | "linked" | "closed";
interface EndpointEvents {
  onText?: (text: string, fromFp: string) => void;
  onState?: (state: LinkState, note: string) => void;
  onTrack?: (stream: MediaStream) => void;
}
class Endpoint {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  sessionKey: CryptoKey | null = null;
  peer: { fingerprint: string; callsign: string; ecdhPub: JsonWebKey } | null = null;
  state: LinkState = "idle";
  constructor(private id: PhoneIdentity, private ev: EndpointEvents, audio?: { track: MediaStreamTrack; stream: MediaStream }) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (audio) this.pc.addTrack(audio.track, audio.stream);
    this.pc.ondatachannel = (e) => this.wireChannel(e.channel);
    this.pc.ontrack = (e) => { if (e.streams[0]) this.ev.onTrack?.(e.streams[0]); };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "connected") this.setState("linked", "linked — the wire is up");
      else if (s === "failed") { this.setState("closed", "the link could not be punched — this pair of networks refused the peer path (NAT is physics; no relay is standing in v1)"); }
      else if (s === "disconnected" || s === "closed") this.setState("closed", "the link is down");
    };
  }
  private setState(s: LinkState, note: string) { this.state = s; this.ev.onState?.(s, note); }
  private wireChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.setState("linked", "linked — the wire is up");
    dc.onclose = () => this.setState("closed", "the link is down");
    dc.onmessage = async (e) => {
      if (!this.sessionKey || typeof e.data !== "string") return;
      try {
        const msg = await openText(this.sessionKey, e.data);
        this.ev.onText?.(msg.text, this.peer?.fingerprint || "");
      } catch { /* a transmission that does not open is not shown */ }
    };
  }
  private async iceComplete(): Promise<void> {
    if (this.pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const done = () => { this.pc.removeEventListener("icegatheringstatechange", check); resolve(); };
      const check = () => { if (this.pc.iceGatheringState === "complete") done(); };
      this.pc.addEventListener("icegatheringstatechange", check);
      setTimeout(done, 8000);
    });
  }
  async offer(): Promise<string> {
    this.wireChannel(this.pc.createDataChannel("phonehome", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.iceComplete();
    this.setState("waiting", "signal made — waiting for the answer");
    return signSignal(this.id, "offer", this.pc.localDescription!.toJSON());
  }
  async answer(offerText: string): Promise<string> {
    const blob = await verifySignal(offerText);
    if (blob.kind !== "offer") throw new Error("that signal is an answer, not an offer");
    this.peer = { fingerprint: blob.fingerprint, callsign: blob.from, ecdhPub: blob.ecdhPub };
    await this.pc.setRemoteDescription(blob.sdp);
    this.sessionKey = await deriveSessionKey(this.id, blob.ecdhPub);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.iceComplete();
    this.setState("waiting", "answer made — the link rises when the caller takes it");
    return signSignal(this.id, "answer", this.pc.localDescription!.toJSON());
  }
  async complete(answerText: string): Promise<void> {
    const blob = await verifySignal(answerText);
    if (blob.kind !== "answer") throw new Error("that signal is an offer, not an answer");
    if (this.peer && blob.fingerprint !== this.peer.fingerprint) throw new Error("the answer came from a different station than the one listening — refused");
    if (this.peer && JSON.stringify(blob.ecdhPub) !== JSON.stringify(this.peer.ecdhPub)) throw new Error("the answering station's keys changed mid-handshake — refused");
    this.peer = { fingerprint: blob.fingerprint, callsign: blob.from, ecdhPub: blob.ecdhPub };
    await this.pc.setRemoteDescription(blob.sdp);
    this.sessionKey = await deriveSessionKey(this.id, blob.ecdhPub);
  }
  async send(text: string): Promise<void> {
    if (!this.dc || this.dc.readyState !== "open" || !this.sessionKey) throw new Error("no link is up");
    if (te.encode(text).length > MAX_TEXT) throw new Error("transmission above the 16 KB field limit");
    this.dc.send(await sealText(this.sessionKey, this.id.fingerprint, text));
  }
  close() { try { this.dc?.close(); } catch { /* gone */ } try { this.pc.close(); } catch { /* gone */ } this.setState("closed", "the link is down"); }
}

/* ---------------- the room's live session (one at a time) ---------------- */

interface RxLine { at: string; from: string; text: string; mine?: boolean }
type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { for (const fn of listeners) fn(); }

let osRef: BlacksiteOS | null = null;
let endpoint: Endpoint | null = null;
let linkState: LinkState = "idle";
let linkNote = "no link. make a signal, or take one.";
let rxLines: RxLine[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let rendezvousCode = "";
let micStream: MediaStream | null = null;
let micTrack: MediaStreamTrack | null = null;
let voiceArmed = false;
let talking = false;
let remoteStream: MediaStream | null = null;

function gateActive(): string | null { return osRef ? osRef.gate("active") : null; }
function gateLedger(): string | null { return osRef ? osRef.gate("ledger") : null; }
function stamp(): string { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function pushRx(text: string, from: string, mine = false) {
  rxLines.push({ at: stamp(), from, text, mine });
  if (rxLines.length > 200) rxLines = rxLines.slice(-200);
  emit();
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function teardown(note?: string) {
  stopPolling();
  /* a link going down always closes the microphone with it —
     talk never survives into the next link on its own. */
  talking = false;
  if (micTrack) micTrack.enabled = false;
  endpoint?.close();
  endpoint = null;
  remoteStream = null;
  linkState = "idle";
  if (note) linkNote = note;
  emit();
}
function newEndpoint(): Endpoint {
  const ep = new Endpoint(identity!, {
    onText: (text, fromFp) => { sfx("ping"); pushRx(text, fromFp); osRef?.log(`phonehome: received a transmission from ${shortFingerprint(fromFp)} (content not journaled)`); },
    onState: (s, note) => { linkState = s; linkNote = note; if (s === "linked") sfx("live"); emit(); },
    onTrack: (stream) => { remoteStream = stream; emit(); },
  }, voiceArmed && micTrack && micStream ? { track: micTrack, stream: micStream } : undefined);
  endpoint = ep;
  return ep;
}

/* Rendezvous wire — the edge swaps signed signals only. */
async function rendezvous(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `the rendezvous answered HTTP ${res.status}`);
  return data;
}
const codeNorm = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
async function rvPut(code: string, role: "offer" | "answer", blob: string) {
  await rendezvous("/api/phonehome", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "put", code, role, blob }) });
}
async function rvGet(code: string, role: "offer" | "answer"): Promise<string | null> {
  const data = await rendezvous(`/api/phonehome?action=get&code=${encodeURIComponent(code)}&role=${role}`);
  return data?.found ? (data.blob as string) : null;
}
async function rvClear(code: string) {
  await rendezvous("/api/phonehome", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear", code }) }).catch(() => undefined);
}
function pollFor(code: string, role: "offer" | "answer", what: string, take: (blob: string) => Promise<void>) {
  stopPolling();
  const started = Date.now();
  pollTimer = setInterval(async () => {
    if (Date.now() - started > RENDEZVOUS_TTL_S * 1000) { stopPolling(); linkNote = `the rendezvous held that ${what} for ten minutes and let it go — nobody came.`; linkState = "idle"; emit(); return; }
    if (osRef?.emcon === "alpha") { teardown("emcon alpha — total silence. the link was torn down by the Standard."); return; }
    try {
      const blob = await rvGet(code, role);
      if (!blob) return;
      stopPolling();
      await take(blob);
      void rvClear(code);
    } catch (e: any) { stopPolling(); linkNote = `✗ ${e?.message || e}`; emit(); }
  }, 2000);
}

/* Actions shared by the window and the verb. Each returns a line
   for the caller to show; the window re-renders off `emit()`. */
export const phonehome = {
  onChange(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  get state() { return { identity, callsign, linkState, linkNote, rxLines, voiceArmed, talking, peer: endpoint?.peer || null, rendezvousCode, remoteStream }; },
  bindOs(os: BlacksiteOS) { osRef = os; },
  setCallsign(name: string) { callsign = name.trim().slice(0, 40); saveCallsign(); emit(); },
  async newIdentity(): Promise<string> {
    identity = await makeIdentity();
    return `new phonehome identity — in memory only until you save it.\nfingerprint  ${identity.fingerprint}\nshort        ${shortFingerprint(identity.fingerprint)}`;
  },
  async saveIdentity(): Promise<string> {
    if (!identity) return "no identity in memory — make one first";
    if (!osRef) return "the room is not bound";
    osRef.write(IDENTITY_PATH, await identityToJson(identity) + "\n");
    return `identity saved to ${IDENTITY_PATH} (this browser only; it never leaves the machine)`;
  },
  async loadIdentity(): Promise<string> {
    if (!osRef) return "the room is not bound";
    const text = osRef.read(IDENTITY_PATH);
    if (!text) return `no identity file at ${IDENTITY_PATH}`;
    identity = await identityFromJson(text);
    emit();
    return `identity loaded — fingerprint ${shortFingerprint(identity.fingerprint)}`;
  },
  forgetIdentity(): string { identity = null; emit(); return "identity dropped from memory (any saved file is untouched)"; },

  async makeOffer(): Promise<string> {
    const refusal = gateActive(); if (refusal) return refusal;
    await ensureIdentity();
    teardown();
    const ep = newEndpoint();
    const blob = await ep.offer();
    linkState = "waiting"; linkNote = "offer signal made — hand it to the other station, or let the rendezvous carry it"; emit();
    osRef?.log("phonehome: made an offer signal");
    return blob;
  },
  async takeOffer(offerText: string): Promise<string> {
    const refusal = gateActive(); if (refusal) return refusal;
    await ensureIdentity();
    await verifySignal(offerText);
    teardown();
    const ep = newEndpoint();
    const answer = await ep.answer(offerText);
    linkNote = `signal verified — from ${ep.peer?.callsign || "a station"} · ${shortFingerprint(ep.peer?.fingerprint || "")}. hand the answer back.`; emit();
    return answer;
  },
  async takeAnswer(answerText: string): Promise<void> {
    const refusal = gateActive(); if (refusal) throw new Error(refusal);
    if (!endpoint) throw new Error("no offer is standing — make one first");
    await endpoint.complete(answerText);
    linkNote = "answer verified and taken — the link is rising"; emit();
  },
  async call(codeRaw: string): Promise<string> {
    const refusal = gateActive(); if (refusal) return refusal;
    const code = codeNorm(codeRaw);
    if (code.length < 4) return "a call code is at least four letters or digits — the two stations agree it beforehand";
    await ensureIdentity();
    teardown();
    rendezvousCode = code;
    const ep = newEndpoint();
    const blob = await ep.offer();
    await rvPut(code, "offer", blob);
    linkState = "waiting"; linkNote = `signal left at the rendezvous under “${code}” — waiting for the other station to answer (ten minutes, then it evaporates)`; emit();
    pollFor(code, "answer", "signal", async (answer) => { await ep.complete(answer); linkNote = "answer taken from the rendezvous — the link is rising"; emit(); });
    return linkNote;
  },
  async listen(codeRaw: string): Promise<string> {
    const refusal = gateLedger(); if (refusal) return refusal;
    const code = codeNorm(codeRaw);
    if (code.length < 4) return "a call code is at least four letters or digits";
    rendezvousCode = code;
    linkState = "waiting"; linkNote = `listening at the rendezvous under “${code}” — the reception field is open`; emit();
    pollFor(code, "offer", "call", async (offer) => {
      const refusal2 = gateActive(); if (refusal2) { linkNote = refusal2; emit(); return; }
      await ensureIdentity();
      teardown();
      const ep = newEndpoint();
      const answer = await ep.answer(offer);
      await rvPut(code, "answer", answer);
      linkNote = `answered — ${ep.peer?.callsign || "a station"} · ${shortFingerprint(ep.peer?.fingerprint || "")}. the link is rising.`; emit();
    });
    return linkNote;
  },
  hangup(): string {
    if (rendezvousCode) void rvClear(rendezvousCode);
    teardown("link closed by your hand. the fields keep what crossed them until you clear them.");
    osRef?.log("phonehome: link closed");
    return linkNote;
  },
  async send(text: string): Promise<string> {
    const refusal = gateActive(); if (refusal) return refusal;
    if (!endpoint) return "no link is up — phonehome send rides a live link";
    await endpoint.send(text);
    sfx("send");
    pushRx(text, identity?.fingerprint || "", true);
    osRef?.log("phonehome: transmitted a sealed line (content not journaled)");
    return "transmitted";
  },
  clearFields() { rxLines = []; emit(); },
  async armVoice(): Promise<string> {
    const refusal = gateActive(); if (refusal) return refusal;
    if (!navigator.mediaDevices?.getUserMedia) return "this browser offers no microphone — voice is not available here";
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micTrack = micStream.getAudioTracks()[0] || null;
    if (!micTrack) return "no microphone was granted";
    micTrack.enabled = false; // tap-to-talk: silent until switched on
    talking = false;
    voiceArmed = true;
    emit();
    return "voice armed for the next link — the microphone rides the offer or answer you make next, and speaks only while talk is toggled on. tap talk once to open the mic, tap again to close it. a link already up must be re-made to carry voice.";
  },
  disarmVoice() {
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null; micTrack = null; voiceArmed = false; talking = false; emit();
    return "voice disarmed — microphone released";
  },
  /* Tap-to-talk: one tap opens the microphone, the next closes
     it. The track itself is the switch — disabled, it sends
     silence, so off is off, not muted-in-software theatre. */
  toggleTalk(): string {
    if (!voiceArmed || !micTrack) return "voice is not armed — arm voice first, then tap talk";
    talking = !talking;
    micTrack.enabled = talking;
    emit();
    return talking ? "talk on — the microphone is live" : "talk off — the microphone is silent";
  },
  async selfTest(say: (t: string) => void) {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const got: string[] = [];
    const epB = new Endpoint(b, { onText: (t) => got.push(t) });
    const epA = new Endpoint(a, {});
    try {
      const offer = await epA.offer();
      const answer = await epB.answer(offer);
      await epA.complete(answer);
      /* The channel, not the clock, says when the field is open:
         wait for the wire itself, up to twelve seconds, before
         putting a line on it — and for the line to land, likewise. */
      const waitOpen = async () => { for (let i = 0; i < 48 && epA.dc?.readyState !== "open"; i++) await new Promise((r) => setTimeout(r, 250)); };
      await waitOpen();
      if (epA.dc?.readyState !== "open") { say("✗ self-test: the stations verified each other (signatures, fingerprints, session seal) but the peer path itself never opened — this network refused the crossing, as a hard NAT would. the field is proven up to the wire; the wire is this network's to allow."); epA.close(); epB.close(); return; }
      await epA.send("self-test — this line crossed the field sealed, station to station");
      for (let i = 0; i < 40 && !got.length; i++) await new Promise((r) => setTimeout(r, 250));
      if (got.length) { pushRx(got[0], b.fingerprint); say(`✓ self-test passed — a sealed line crossed between two in-page stations and opened on the far side. fingerprints, signatures and the session seal all verified in the crossing.`); }
      else say("✗ self-test: the stations linked but the sealed line did not arrive — the field is not proven");
    } catch (e: any) { say(`✗ self-test: ${e?.message || e}`); }
    epA.close(); epB.close();
  },
};

/* ---------------- shell verb ---------------- */

export function registerPhonehomeVerbs() {
  verb("phonehome", "EDGE", "phonehome: status, identity, call, listen, send, hangup — or open the window", async (ctx) => {
    phonehome.bindOs(ctx.os);
    const sub = (ctx.args[0] || "status").toLowerCase();
    const rest = ctx.args.slice(1);
    if (sub === "open") { ctx.io.openApp?.("phonehome"); return "the field is open on the desk."; }
    if (sub === "identity") {
      const op = (rest[0] || "show").toLowerCase();
      if (op === "new") { const line = await phonehome.newIdentity(); emit(); return line; }
      if (op === "save") return phonehome.saveIdentity();
      if (op === "load") return phonehome.loadIdentity();
      if (op === "forget") return phonehome.forgetIdentity();
      if (!identity) return "no identity in memory — `phonehome identity new`, or open the phonehome window";
      return `phonehome identity in memory\ncallsign     ${callsign || "(none set)"}\nfingerprint  ${identity.fingerprint}\nshort        ${shortFingerprint(identity.fingerprint)}`;
    }
    if (sub === "call") return phonehome.call(rest[0] || "");
    if (sub === "listen") return phonehome.listen(rest[0] || "");
    if (sub === "send") {
      if (!rest.length) return "usage: phonehome send <the line to transmit>";
      return phonehome.send(rest.join(" "));
    }
    if (sub === "hangup") return phonehome.hangup();
    const st = phonehome.state;
    return [
      "PHONEHOME — a secure transmitter and reception field between two blacksite stations.",
      "voice on WebRTC's encrypted media path · text sealed station to station · signals signed",
      `identity   ${identity ? `in memory — ${shortFingerprint(identity.fingerprint)}` : "none (phonehome identity new)"}`,
      `callsign   ${callsign || "(none set — set it in the window)"}`,
      `link       ${st.linkState} — ${st.linkNote}`,
      st.peer ? `peer       ${st.peer.callsign} · ${shortFingerprint(st.peer.fingerprint)}` : "",
      "",
      "phonehome call <code> · phonehome listen <code> · phonehome send <line…> · phonehome hangup",
      "or open the phonehome window for the fields, hand-carried signals, and tap-to-talk voice.",
      "honest physics: no PSTN, no SMS — a browser has no telephony radio. links are station to station.",
    ].filter(Boolean).join("\n");
  });
}

/* ---------------- the window ---------------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildPhonehomeApp(body: HTMLElement, os: BlacksiteOS) {
  phonehome.bindOs(os);
  body.innerHTML = "";
  const wrap = el("div", "os-ph");
  const note = el("p", "os-note", "a secure transmitter and reception field between two blacksite stations. text is sealed station to station; voice rides the encrypted peer path and speaks only while talk is toggled on — one tap on, one tap off. the rendezvous — when you use it — holds signed signals only, for ten minutes, and never hears the link. honest physics: no phone numbers, no SMS; a browser has no telephony radio.");
  wrap.appendChild(note);

  /* identity */
  const idBox = el("div", "os-ph-box");
  idBox.append(el("h3", "", "This station"));
  const csRow = el("div", "os-btnrow");
  const csIn = document.createElement("input"); csIn.className = "os-bottle-input"; csIn.placeholder = "callsign — the name this station wears"; csIn.style.flex = "1"; csIn.value = callsign;
  csIn.addEventListener("change", () => phonehome.setCallsign(csIn.value));
  const idMeta = el("p", "os-note", "");
  csRow.append(csIn);
  const idRow = el("div", "os-btnrow");
  const bNew = el("button", "os-btn", "new identity");
  const bSave = el("button", "os-btn", "save to filesystem");
  const bLoad = el("button", "os-btn", "load saved");
  const bForget = el("button", "os-btn", "forget");
  idRow.append(bNew, bSave, bLoad, bForget);
  idBox.append(csRow, idMeta, idRow);
  wrap.appendChild(idBox);

  /* link */
  const linkBox = el("div", "os-ph-box");
  linkBox.append(el("h3", "", "The link"));
  const stateLine = el("p", "os-ph-state", "");
  const codeRow = el("div", "os-btnrow");
  const codeIn = document.createElement("input"); codeIn.className = "os-bottle-input"; codeIn.placeholder = "call code — agreed with the other station beforehand"; codeIn.style.flex = "1";
  const bCall = el("button", "os-btn primary", "call");
  const bListen = el("button", "os-btn", "listen");
  const bHang = el("button", "os-btn danger", "hang up");
  codeRow.append(codeIn, bCall, bListen, bHang);
  const peerLine = el("p", "os-note", "");
  linkBox.append(stateLine, codeRow, peerLine);
  wrap.appendChild(linkBox);

  /* hand-carried signals */
  const sigBox = el("div", "os-ph-box");
  sigBox.append(el("h3", "", "Hand-carried signals — no rendezvous"));
  const sigOut = document.createElement("textarea"); sigOut.className = "os-bottle-area"; sigOut.rows = 4; sigOut.placeholder = "signals you make appear here — carry one to the other station any way you trust";
  const sigIn = document.createElement("textarea"); sigIn.className = "os-bottle-area"; sigIn.rows = 4; sigIn.placeholder = "paste a signal that was carried to you";
  const sigRow = el("div", "os-btnrow");
  const bOffer = el("button", "os-btn", "make offer signal");
  const bTakeOffer = el("button", "os-btn", "take offer → make answer");
  const bTakeAnswer = el("button", "os-btn", "take answer → link");
  sigRow.append(bOffer, bTakeOffer, bTakeAnswer);
  sigBox.append(sigOut, sigIn, sigRow);
  wrap.appendChild(sigBox);

  /* the fields */
  const fields = el("div", "os-ph-fields");
  const txBox = el("div", "os-ph-box os-ph-tx");
  txBox.append(el("h3", "", "Transmitter"));
  const txArea = document.createElement("textarea"); txArea.className = "os-bottle-area"; txArea.rows = 4; txArea.placeholder = "the line to transmit — sealed here, opened only by the station at the other end";
  const txRow = el("div", "os-btnrow");
  const bSend = el("button", "os-btn primary", "transmit");
  const bVoice = el("button", "os-btn", "arm voice");
  const bTalk = el("button", "os-btn os-ph-talk", "tap to talk");
  txRow.append(bSend, bVoice, bTalk);
  txBox.append(txArea, txRow);
  const rxBox = el("div", "os-ph-box os-ph-rx");
  rxBox.append(el("h3", "", "Reception"));
  const rxPre = el("pre", "os-ph-rxlog");
  const rxRow = el("div", "os-btnrow");
  const bClear = el("button", "os-btn", "clear fields");
  const bTest = el("button", "os-btn", "self-test the field");
  rxRow.append(bClear, bTest);
  const meterWrap = el("div", "os-ph-meter"); const meter = el("div", "os-ph-meter-fill"); meterWrap.appendChild(meter);
  rxBox.append(rxPre, meterWrap, rxRow);
  fields.append(txBox, rxBox);
  wrap.appendChild(fields);
  const out = el("pre", "os-plain");
  wrap.appendChild(out);
  body.appendChild(wrap);
  const say = (t: string) => { out.textContent = t; };

  /* voice reception: play the remote stream and breathe the meter */
  let audioEl: HTMLAudioElement | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let attachedStream: MediaStream | null = null;
  const attachRemote = (stream: MediaStream | null) => {
    if (stream === attachedStream) return;
    attachedStream = stream;
    if (meterTimer) { clearInterval(meterTimer); meterTimer = null; }
    if (!stream) { if (audioEl) { audioEl.srcObject = null; } meter.style.width = "0%"; return; }
    if (!audioEl) { audioEl = document.createElement("audio"); audioEl.autoplay = true; }
    audioEl.srcObject = stream;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 256;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      meterTimer = setInterval(() => {
        if (!body.isConnected) { if (meterTimer) clearInterval(meterTimer); void ctx.close(); return; }
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        meter.style.width = `${Math.round(peak * 100)}%`;
      }, 90);
    } catch { /* the meter is a courtesy; the audio still plays */ }
  };

  const render = () => {
    const st = phonehome.state;
    idMeta.textContent = st.identity
      ? `identity in memory — fingerprint ${st.identity.fingerprint}\nshort ${shortFingerprint(st.identity.fingerprint)} — compare the short form with your peer by another channel before trusting a link`
      : "no identity in memory — make one, or load the saved one. a fresh station proves the field; a kept identity is how a peer knows you again.";
    idMeta.style.whiteSpace = "pre-line";
    stateLine.textContent = `${st.linkState.toUpperCase()} — ${st.linkNote}`;
    stateLine.dataset.state = st.linkState;
    peerLine.textContent = st.peer ? `peer — ${st.peer.callsign} · fingerprint ${st.peer.fingerprint}\nshort ${shortFingerprint(st.peer.fingerprint)}` : (st.linkState === "linked" ? "" : "no peer yet. the two short fingerprints are the ceremony: read yours aloud, hear theirs, and only then trust the wire.");
    peerLine.style.whiteSpace = "pre-line";
    bVoice.textContent = st.voiceArmed ? "voice armed — disarm" : "arm voice";
    bTalk.textContent = st.talking ? "talking — tap to stop" : "tap to talk";
    bTalk.classList.toggle("live", st.talking);
    rxPre.textContent = st.rxLines.length
      ? st.rxLines.map((l) => `${l.at}  ${l.mine ? "you →" : "→ you"}  [${shortFingerprint(l.from)}]\n${l.text}`).join("\n\n")
      : "the reception field is quiet. what crosses the link lands here, and nowhere else — nothing is recorded, nothing is kept by any server.";
    attachRemote(st.remoteStream);
  };
  const off = phonehome.onChange(render);

  bNew.addEventListener("click", async () => { say(await phonehome.newIdentity()); render(); });
  bSave.addEventListener("click", async () => say(await phonehome.saveIdentity()));
  bLoad.addEventListener("click", async () => { try { say(await phonehome.loadIdentity()); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bForget.addEventListener("click", () => { say(phonehome.forgetIdentity()); render(); });
  bCall.addEventListener("click", async () => { try { say(await phonehome.call(codeIn.value)); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bListen.addEventListener("click", async () => { try { say(await phonehome.listen(codeIn.value)); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bHang.addEventListener("click", () => { say(phonehome.hangup()); render(); });
  bOffer.addEventListener("click", async () => { try { sigOut.value = await phonehome.makeOffer(); say("offer signal made — carry it to the other station, then take their answer here."); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bTakeOffer.addEventListener("click", async () => { try { sigOut.value = await phonehome.takeOffer(sigIn.value); say("offer verified — answer signal made. carry it back; the link rises when the caller takes it."); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bTakeAnswer.addEventListener("click", async () => { try { await phonehome.takeAnswer(sigIn.value); say("answer verified and taken — the link is rising."); } catch (e: any) { say(`✗ ${e?.message || e}`); } render(); });
  bSend.addEventListener("click", async () => {
    const text = txArea.value.trim();
    if (!text) { say("the transmitter field is empty"); return; }
    try { say(await phonehome.send(text)); txArea.value = ""; } catch (e: any) { say(`✗ ${e?.message || e}`); }
    render();
  });
  txArea.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) bSend.click(); e.stopPropagation(); });
  bVoice.addEventListener("click", async () => {
    if (phonehome.state.voiceArmed) { say(phonehome.disarmVoice()); }
    else { try { say(await phonehome.armVoice()); } catch (e: any) { say(`✗ microphone: ${e?.message || e}`); } }
    render();
  });
  bTalk.addEventListener("click", () => { say(phonehome.toggleTalk()); render(); });
  bClear.addEventListener("click", () => { phonehome.clearFields(); say("fields cleared — what crossed them is gone from this station."); render(); });
  bTest.addEventListener("click", () => { say("running the field self-test — two stations, in this page only…"); void phonehome.selfTest(say).then(render); });

  /* EMCON alpha is total silence: if the Standard falls to alpha
     while this window stands open, a live link is torn down. */
  const emconWatch = setInterval(() => {
    if (!body.isConnected) { clearInterval(emconWatch); off(); return; }
    if (os.emcon === "alpha" && endpoint) teardown("emcon alpha — total silence. the link was torn down by the Standard.");
  }, 1000);

  render();
  say("phonehome, in the room. set a callsign, agree a call code with the other station, and call — or carry the signals by hand.");
}
