// @ts-nocheck
// Relay's room memory — the bridge remembers the room, briefly, for
// everyone. Every Relay client reaches the network through the site's
// own bridge, so the bridge is the one place that hears the whole room
// no matter which device anyone speaks from. It keeps a rolling buffer
// of each channel's recent lines and replays them to a client as it
// joins, on any device — nobody is a ghost for having spoken from
// another machine.
//
// The memory is deliberately, dynamically mutable — it is not an
// archive, and it is built to forget:
//   · every line expires 24 hours after it is spoken (KV TTL), and the
//     buffer holds at most 300 lines per channel, oldest shed first;
//   · when the room removes someone (a KICK the bridge observes), that
//     person's lines are purged from the memory as they are purged
//     from every Relay view — moderation rewrites the past tense too;
//   · a wipe reaches exactly as far as authorship (RELAYMEM-WIPE):
//     it takes back the wiper's own lines — the purge above, aimed by
//     the bridge at the name the wiper's session wears — and never
//     the whole chat for everyone;
//   · credential-shaped lines never enter: anything carrying the house
//     claim shape, or a password-shaped assignment, is refused at the
//     door, and the network's service windows are never channel lines
//     in the first place.
// Storage is one KV value per line under a key that carries the line's
// time bucket, its voice, and a hash of its words — listing a channel's
// prefix enumerates its past in order, with no shared index for
// concurrent bridges to race over. With no RELAY_MEMORY binding
// configured the module is inert and the bridge behaves exactly as it
// did before memory existed.

export interface MemLine {
  t: number; // epoch ms the line was spoken
  p: string; // full IRC prefix (nick!user@host) it arrived under
  x: string; // the raw message text (CTCP wrappers intact)
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_S = 24 * 60 * 60;
const CAP = 300;
const REPLAY = 120;
const BUCKET_MS = 3000;

const chanPrefix = (net: string, chan: string) => `rm1|${net}|${chan.toLowerCase()}|`;
const nickOf = (prefix: string) => prefix.split("!")[0].toLowerCase();

/* A line's key: the same broadcast reaches the bridge once per
   connected session (and once more as the sender's own send), so the
   key is derived from the line itself inside a short time bucket —
   every copy lands on the same key and the room stores the line once.
   Two genuinely identical lines from the same voice inside one bucket
   are the same line for memory's purposes; the next bucket tells them
   apart. The value keeps the precise time, and replay re-sorts by it,
   so the small disorder a bucket can hold never reaches the reader. */
async function lineKey(net: string, chan: string, line: MemLine): Promise<string> {
  const bucket = String(Math.floor(line.t / BUCKET_MS)).padStart(10, "0");
  const raw = new TextEncoder().encode(`${nickOf(line.p)}|${line.x}`);
  const digest = await crypto.subtle.digest("SHA-1", raw);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  return `${chanPrefix(net, chan)}${bucket}|${nickOf(line.p)}|${hex}`;
}

/* The door rule: credential-shaped lines are never remembered. The
   shapes people actually paste are wider than "password: x" — "my
   password is hunter2", "pass word: x", "pw: x", a NickServ command
   mid-sentence — so the door watches for all of those. And the
   sharpest hole was never a shape at all: the bare claim code pasted
   without its label. The door therefore also hashes every word of the
   line against the house claim verifier the bridge hands it, and
   refuses on equality — the code alone, label or not, never enters. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function refused(text: string, claimSha256?: string): Promise<boolean> {
  if (/nsm-claim:/i.test(text)) return true;
  if (/\b(?:pass(?:word|wd)?|pwd)\s*[:=]\s*\S+/i.test(text)) return true;
  if (/\bpass\s?word(?:\s+is\b|\s*[:=])\s*\S+/i.test(text)) return true;
  if (/\bpw\s*[:=]\s*\S+/i.test(text)) return true;
  if (/(?:^|\s)\/?(?:msg|query)\s+(?:nickserv|chanserv)\b/i.test(text)) return true;
  if (/\b(?:nickserv|chanserv)\s+(?:identify|id)\b/i.test(text)) return true;
  if (claimSha256) {
    const tokens = text.split(/\s+/).slice(0, 64);
    for (const raw of tokens) {
      const bare = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      for (const tok of bare === raw ? [raw] : [raw, bare]) {
        if (tok.length < 6 || tok.length > 128) continue;
        if ((await sha256Hex(tok)) === claimSha256) return true;
      }
    }
  }
  return false;
}

/** Every key the channel holds, oldest first (KV lists in key order,
 *  and the time bucket leads each key). Bounded for sanity: a room's
 *  past never needs more than twice the cap enumerated at once. */
async function listKeys(kv: any, net: string, chan: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const res = await kv.list({ prefix: chanPrefix(net, chan), limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const k of res.keys || []) out.push(k.name);
    if (res.list_complete || !res.cursor || out.length > CAP * 2) break;
    cursor = res.cursor;
  }
  return out;
}

/** Shed the oldest lines past the cap. Deleting is idempotent, so any
 *  number of bridges may prune the same room at once without loss. */
async function prune(kv: any, net: string, chan: string): Promise<void> {
  const keys = await listKeys(kv, net, chan);
  if (keys.length <= CAP) return;
  await Promise.allSettled(keys.slice(0, keys.length - CAP).map((k) => kv.delete(k)));
}

let appendsSincePrune = 0;

/** Remember one channel line. Fire-and-forget by design: memory must
 *  never delay, break, or block the wire it listens to. Pruning is
 *  throttled to one append in 32: the tap hears every line once per
 *  connected bridge session, and a full prefix listing on every line
 *  multiplied KV reads by the room's whole audience. The cap still
 *  binds — a prune still sheds back to exactly CAP — it just runs on
 *  a counter instead of on every word spoken. claimSha256, when the
 *  caller holds it, arms the door's bare-code check (see refused). */
export async function memAppend(kv: any, net: string, chan: string, line: MemLine, claimSha256?: string): Promise<void> {
  if (!kv || !chan.startsWith("#")) return;
  if (await refused(line.x, claimSha256)) return;
  try {
    await kv.put(await lineKey(net, chan, line), JSON.stringify(line), { expirationTtl: TTL_S });
    if (++appendsSincePrune >= 32) {
      appendsSincePrune = 0;
      await prune(kv, net, chan);
    }
  } catch { /* the room forgets this one; the wire never notices */ }
}

/** The recent past of a channel, oldest first, ready to replay. */
export async function memReplay(kv: any, net: string, chan: string): Promise<MemLine[]> {
  if (!kv) return [];
  try {
    const keys = (await listKeys(kv, net, chan)).slice(-REPLAY);
    if (!keys.length) return [];
    const floor = Date.now() - DAY_MS;
    const got = await Promise.allSettled(keys.map((k) => kv.get(k)));
    const lines: MemLine[] = [];
    for (const r of got) {
      if (r.status !== "fulfilled" || !r.value) continue;
      try {
        const line = JSON.parse(r.value);
        if (line && typeof line.t === "number" && line.t >= floor && typeof line.p === "string" && typeof line.x === "string") lines.push(line);
      } catch { /* a torn entry is simply not part of the past */ }
    }
    return lines.sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

/** Forget one voice in one channel — moderation reaches memory too.
 *  The voice rides in every key, so a purge needs no reads at all.
 *  Reports how many lines it actually deleted, or -1 when the key
 *  list itself could not be read: a /wipe answers for its work, and
 *  "unconfirmed" is an answer — silence dressed as success is not. */
export async function memPurgeNick(kv: any, net: string, chan: string, nick: string): Promise<number> {
  if (!kv) return 0;
  let keys: string[];
  try {
    keys = await listKeys(kv, net, chan);
  } catch { return -1; /* the purge cannot even see its work — say so */ }
  const mine = keys.filter((k) => k.split("|")[4] === nick.toLowerCase());
  const done = await Promise.allSettled(mine.map((k) => kv.delete(k)));
  return done.filter((r) => r.status === "fulfilled").length;
}

/* ————— the restart probe —————
   A full service restart — a new build going live — refreshes every
   client at once, and the room deserves a register of it: one yellow
   probe line in the house channel's memory, which every reconnecting
   client then receives in its replay. Smart about it, never spam:
   the first build a bridge ever sees is the baseline and registers
   nothing; a build change registers one probe; further changes
   inside the cooldown update the stamp silently and register
   nothing. Concurrent bridges may race the same change — their
   probes carry identical words into the same time bucket, so the
   room still stores exactly one. */
const PROBE_COOLDOWN_MS = 30 * 60 * 1000;
export async function memBuildProbe(kv: any, net: string, chan: string, build: string, probeText: string): Promise<void> {
  if (!kv || !build) return;
  // The stamp arrives as a bare, unauthenticated query parameter, so
  // anything that is not exactly a stamped chunk name is ignored:
  // without the shape rule, a rotating invented stamp would force a
  // KV write on every connect and could forge a restart probe.
  if (!/^os\.[A-Za-z0-9_-]+\.js$/.test(build)) return;
  try {
    let prev: any = null;
    try { prev = JSON.parse((await kv.get("sys|build")) || "null"); } catch { prev = null; }
    if (prev && prev.chunk === build) return;
    const now = Date.now();
    const due = !!prev && (typeof prev.probeAt !== "number" || now - prev.probeAt >= PROBE_COOLDOWN_MS);
    await kv.put("sys|build", JSON.stringify({ chunk: build, probeAt: due ? now : (prev && typeof prev.probeAt === "number" ? prev.probeAt : 0) }));
    if (due) await memAppend(kv, net, chan, { t: now, p: "relay.bridge", x: probeText });
  } catch { /* a missed registration is a small thing; the wire never notices */ }
}
