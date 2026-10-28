/* ————————————————————————————————————————————————————————————————
   IVORY-TOWER — the clockwork observance, coupled to AEGIS.

   AEGIS is the hands: it watches the mutation funnels and trips
   containment when a run is LOUD — ten mutations in ten seconds,
   files turning to noise, a ransom note's shape. But a patient
   adversary is none of those things. One file a minute never trips
   a cadence breaker. A hand that rewrites the room's stored state
   directly never touches a funnel at all. And AEGIS's own snapshot
   ring sits in the same storage it defends, taken on trust.

   So the house keeps a tower, and the tower keeps a clock.

   THE TOWER. An observer with no write path to the room. It never
   touches a file; it hashes them. Its ledger lives under its own
   storage key, apart from the VFS and apart from AEGIS's register,
   and every entry in it is chained to the one before — rewrite
   history and the chain breaks in the open.

   THE CLOCKWORK. The tower does not watch continuously; it
   OBSERVES, on a tick: at boot, every thirty seconds of room life,
   and whenever the operator calls for it. Each observance is
   complete and particular — nothing is sampled, nothing is
   estimated. What changed is named, file by file.

   THE OBSERVANCE. At each tick the tower takes the measure of the
   whole room: a Merkle root over every file's SHA-256, the decoy
   canaries by content hash, the fingerprint of AEGIS's own stored
   register, and the fingerprints of the room's persistence
   registers (vfs / macros / settings). Then it asks the only
   question that matters: did the room's own hand do this? Every
   mutation that comes through the funnels is noted as it lands, so
   a change the tower cannot account for is a change that arrived
   by another road — and there is no legitimate other road.

   THE COUPLING. The tower holds no weapon of its own; AEGIS is
   the weapon. One unaccounted drift raises the WATCH: AEGIS takes
   an ivory-watch snapshot and the tower's eye sharpens. Drift
   again under the watch, a canary altered behind the funnel, the
   AEGIS register moved by no AEGIS hand, a persistence register
   rewritten outside the save hand, or the ledger's own chain
   found broken — the tower speaks, and AEGIS trips containment
   and raises the mirage, exactly as if the run had been loud.
   A slow cadence of accounted work (many existing files, changed
   patiently, one at a time) can raise the watch but never the
   trip: the tower accuses on evidence of bypass, not on rhythm
   alone — an operator's own patient script is watched, not jailed.

   THE HONEST SCOPE. The tower is in-tab, like everything here.
   A script already running with the page's full authority could
   in principle rewrite the tower's ledger too — and recompute its
   chain. What the tower convicts is what actually happens to
   rooms: slow ransomware under every threshold, silent corruption,
   tampered snapshots and registers, and drift nobody can account
   for. It claims nothing beyond the room, and within the room it
   misses nothing that changes.
   ———————————————————————————————————————————————————————————————— */

const te = new TextEncoder();

/* ————— SHA-256, pure and synchronous —————
   The observance must be synchronous (a tick cannot await) and
   must run identically in the headless harness, so the tower
   carries its own SHA-256 rather than leaning on crypto.subtle's
   promises. Validated against the standard test vectors in
   scripts/verify-ivory.mjs. */
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function rotr(x: number, n: number): number { return (x >>> n) | (x << (32 - n)); }

export function sha256Hex(data: Uint8Array): string {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((((data.length + 9 + 63) >> 6) << 6));
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Int32Array(64);
  for (let blk = 0; blk < padded.length; blk += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(blk + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA_K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export function hashText(s: string): string { return sha256Hex(te.encode(s)); }

/* ————— the Merkle root over the room —————
   Leaves are (path, content-hash) pairs, sorted by path; the tree
   folds pairwise, an odd leaf promoted by pairing with itself.
   One root therefore swears for every file at once, and any
   single byte changed anywhere moves it. */
export interface IvoryLeaf { path: string; hash: string; }

export function merkleRoot(leaves: IvoryLeaf[]): string {
  if (!leaves.length) return hashText("ivory:empty-room");
  let level = [...leaves].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((l) => hashText(`ivory:leaf\0${l.path}\0${l.hash}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashText(`ivory:node\0${level[i]}\0${level[i + 1] ?? level[i]}`));
    level = next;
  }
  return level[0];
}

/* ————— the observance ————— */
export type IvorySeverity = "note" | "watch" | "trip";
export interface IvoryFinding { kind: string; severity: IvorySeverity; detail: string; }
export interface IvoryInput {
  at: number;
  trigger: string;
  files: IvoryLeaf[];
  canaries: Record<string, string | null>;
  aegisPrint: string | null;
  storePrints: Record<string, string | null>;
  contained: boolean;
}
export interface IvoryEntry {
  seq: number; at: number; trigger: string; root: string; files: number;
  prev: string; hash: string; findings: string[];
}
export interface IvoryReport { entry: IvoryEntry; findings: IvoryFinding[]; state: "calm" | "watch"; root: string; }

const GENESIS = "ivory-genesis";
const LEDGER_CAP = 120;
const CADENCE_WINDOW_MS = 600_000;
const CADENCE_DISTINCT = 12;

export class IvoryTower {
  state: "calm" | "watch" = "calm";
  private entries: IvoryEntry[] = [];
  private lastLeaves = new Map<string, string>();
  private lastCanaries: Record<string, string | null> = {};
  private lastAegisPrint: string | null | undefined = undefined;
  private lastStorePrints: Record<string, string | null> = {};
  private hasBaseline = false;
  private cleanStreak = 0;
  private chainBroken = false;
  private chainTripSent = false;
  /* The funnel's own testimony, this session only: every mutation
     the room's hand made, and every register it rewrote, since the
     last observance. What is not testified to is unaccounted. */
  private accountedPaths = new Set<string>();
  private accountedAegis = false;
  private accountedStores = new Set<string>();
  private notes: Array<{ p: string; t: number; own: boolean }> = [];

  /* — the funnel testifies — */
  noteMutation(path: string, own: boolean) {
    this.accountedPaths.add(path);
    this.notes.push({ p: path, t: Date.now(), own });
    if (this.notes.length > 4000) this.notes.splice(0, this.notes.length - 4000);
  }
  noteAegis() { this.accountedAegis = true; }
  noteStore(key: string) { this.accountedStores.add(key); }

  private entryHash(e: Omit<IvoryEntry, "hash">): string {
    return hashText(`ivory:entry\0${e.seq}\0${e.at}\0${e.trigger}\0${e.root}\0${e.files}\0${e.prev}\0${e.findings.join(";")}`);
  }
  private append(input: IvoryInput, root: string, findings: IvoryFinding[]): IvoryEntry {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS;
    const base: Omit<IvoryEntry, "hash"> = {
      seq: this.entries.length ? this.entries[this.entries.length - 1].seq + 1 : 1,
      at: input.at, trigger: input.trigger, root, files: input.files.length,
      prev, findings: findings.map((f) => `${f.severity}:${f.kind}`),
    };
    const entry: IvoryEntry = { ...base, hash: this.entryHash(base) };
    this.entries.push(entry);
    while (this.entries.length > LEDGER_CAP) this.entries.shift();
    return entry;
  }
  private adopt(input: IvoryInput) {
    this.lastLeaves = new Map(input.files.map((l) => [l.path, l.hash]));
    this.lastCanaries = { ...input.canaries };
    this.lastAegisPrint = input.aegisPrint;
    this.lastStorePrints = { ...input.storePrints };
    this.accountedPaths.clear();
    this.accountedStores.clear();
    this.accountedAegis = false;
  }
  /** Set the measure without judging it — the operator's own
   *  restore or lift rewrites the room wholesale, by hand, and the
   *  tower re-baselines rather than accusing the hand that feeds it. */
  baseline(input: IvoryInput): IvoryReport {
    const root = merkleRoot(input.files);
    const entry = this.append(input, root, []);
    this.adopt(input);
    this.hasBaseline = true;
    return { entry, findings: [], state: this.state, root };
  }

  observe(input: IvoryInput): IvoryReport {
    const root = merkleRoot(input.files);
    if (!this.hasBaseline) {
      const entry = this.append(input, root, [{ kind: "baseline", severity: "note", detail: "the tower takes the room's measure" }]);
      this.adopt(input);
      this.hasBaseline = true;
      return { entry, findings: [], state: this.state, root };
    }
    const findings: IvoryFinding[] = [];
    const boot = input.trigger === "boot";

    /* The chain judges itself first. */
    if (this.chainBroken && !this.chainTripSent) {
      this.chainTripSent = true;
      findings.push({ kind: "chain", severity: "trip", detail: "the tower's own ledger chain is broken — its history was rewritten" });
    }

    /* Files: what changed, and whose hand was on it. */
    const now = new Map(input.files.map((l) => [l.path, l.hash]));
    const changed: string[] = [];
    for (const [p, h] of now) if (this.lastLeaves.get(p) !== h) changed.push(p);
    for (const p of this.lastLeaves.keys()) if (!now.has(p)) changed.push(p);
    const unaccounted = changed.filter((p) => !this.accountedPaths.has(p));

    /* Canaries by content, behind the funnel: the gravest drift. */
    const canaryDrift = Object.keys(input.canaries).filter((p) => this.lastCanaries[p] !== input.canaries[p] && !this.accountedPaths.has(p));
    if (canaryDrift.length) {
      findings.push({ kind: "canary", severity: "trip", detail: `a decoy file changed behind the funnel: ${canaryDrift.join(", ")}` });
    }
    const fileDrift = unaccounted.filter((p) => !(p in input.canaries));
    if (fileDrift.length) {
      const names = fileDrift.slice(0, 6).join(", ") + (fileDrift.length > 6 ? `, and ${fileDrift.length - 6} more` : "");
      if (boot) {
        findings.push({ kind: "drift", severity: "note", detail: `${fileDrift.length} ${fileDrift.length === 1 ? "path" : "paths"} changed between sessions (${names}) — the tower notes it and re-baselines; between sessions it cannot swear whose hand it was` });
      } else if (this.state === "watch") {
        findings.push({ kind: "drift", severity: "trip", detail: `drift behind the funnel, again, while the tower was watching: ${names}` });
      } else {
        findings.push({ kind: "drift", severity: "watch", detail: `drift behind the funnel: ${names} — no hand in this room accounts for ${fileDrift.length === 1 ? "it" : "them"}` });
      }
    }

    /* AEGIS's register: moved by no AEGIS hand. */
    if (this.lastAegisPrint !== undefined && input.aegisPrint !== this.lastAegisPrint && !this.accountedAegis) {
      findings.push(boot
        ? { kind: "aegis-register", severity: "note", detail: "AEGIS's register changed between sessions — noted, and the tower re-baselines" }
        : { kind: "aegis-register", severity: "trip", detail: "AEGIS's stored register changed with no AEGIS hand on it — the snapshot ring was tampered with" });
    }
    /* The persistence registers: rewritten outside the save hand. */
    for (const k of Object.keys(input.storePrints)) {
      if (k in this.lastStorePrints && input.storePrints[k] !== this.lastStorePrints[k] && !this.accountedStores.has(k)) {
        findings.push(boot
          ? { kind: "register", severity: "note", detail: `the ${k} register changed between sessions — noted, and the tower re-baselines` }
          : { kind: "register", severity: "trip", detail: `the ${k} register was rewritten outside the room's save hand` });
      }
    }

    /* The slow cadence: accounted, patient, and worth a raised eye.
       Watch only — rhythm is suspicion, never proof. */
    if (!boot) {
      const recent = this.notes.filter((n) => !n.own && input.at - n.t < CADENCE_WINDOW_MS);
      const distinctOld = new Set(recent.filter((n) => this.lastLeaves.has(n.p)).map((n) => n.p));
      if (distinctOld.size >= CADENCE_DISTINCT) {
        findings.push(this.state === "calm"
          ? { kind: "cadence", severity: "watch", detail: `a slow cadence — ${distinctOld.size} existing files changed patiently inside ten minutes, each step under every AEGIS threshold` }
          : { kind: "cadence", severity: "note", detail: `the slow cadence continues under the watch — ${distinctOld.size} existing files in ten minutes` });
      }
    }

    /* Escalation and decay. */
    if (findings.some((f) => f.severity === "watch") && this.state === "calm") { this.state = "watch"; this.cleanStreak = 0; }
    if (this.state === "watch") {
      if (!findings.length) {
        this.cleanStreak++;
        if (this.cleanStreak >= 3) {
          this.state = "calm"; this.cleanStreak = 0;
          findings.push({ kind: "stand-down", severity: "note", detail: "three clean observances — the tower stands down to calm" });
        }
      } else this.cleanStreak = 0;
    }
    this.notes = this.notes.filter((n) => input.at - n.t < CADENCE_WINDOW_MS);
    const entry = this.append(input, root, findings);
    this.adopt(input);
    return { entry, findings, state: this.state, root };
  }

  verifyChain(): { ok: boolean; at: number | null } {
    let prev = this.entries.length && this.entries[0].seq > 1 ? null : GENESIS;
    for (const e of this.entries) {
      if (prev !== null && e.prev !== prev) return { ok: false, at: e.seq };
      if (this.entryHash(e) !== e.hash) return { ok: false, at: e.seq };
      prev = e.hash;
    }
    return { ok: true, at: null };
  }

  status() {
    const last = this.entries[this.entries.length - 1];
    return {
      state: this.state,
      ticks: this.entries.length,
      lastSeq: last ? last.seq : 0,
      lastAt: last ? last.at : null,
      lastTrigger: last ? last.trigger : null,
      root: last ? last.root : null,
      chain: this.chainBroken ? "broken" : "holds",
      ledger: this.entries.slice(-8).map((e) => ({ seq: e.seq, at: e.at, trigger: e.trigger, root: e.root, findings: [...e.findings] })),
    };
  }

  serialize(): string {
    return JSON.stringify({
      entries: this.entries, state: this.state,
      lastLeaves: [...this.lastLeaves.entries()], lastCanaries: this.lastCanaries,
      lastAegisPrint: this.lastAegisPrint === undefined ? { u: 1 } : { v: this.lastAegisPrint },
      lastStorePrints: this.lastStorePrints, hasBaseline: this.hasBaseline,
    });
  }
  restore(json: string): boolean {
    try {
      const d = JSON.parse(json);
      if (!d || !Array.isArray(d.entries)) return false;
      this.entries = d.entries;
      this.state = d.state === "watch" ? "watch" : "calm";
      this.lastLeaves = new Map(Array.isArray(d.lastLeaves) ? d.lastLeaves : []);
      this.lastCanaries = d.lastCanaries || {};
      this.lastAegisPrint = d.lastAegisPrint && "v" in d.lastAegisPrint ? d.lastAegisPrint.v : undefined;
      this.lastStorePrints = d.lastStorePrints || {};
      this.hasBaseline = !!d.hasBaseline;
      const v = this.verifyChain();
      this.chainBroken = !v.ok;
      return true;
    } catch { this.chainBroken = true; return false; }
  }
}
