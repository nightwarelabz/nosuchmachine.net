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
//   · a claimed house name may wipe a channel's memory outright
//     (RELAYMEM-WIPE), and the wipe is total and immediate;
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

/* The door rule: credential-shaped lines are never remembered. */
function refused(text: string): boolean {
  if (/nsm-claim:/i.test(text)) return true;
  if (/\b(?:pass(?:word|wd)?|pwd)\s*[:=]\s*\S+/i.test(text)) return true;
  if (/^\s*\/?(?:msg|query)\s+(?:nickserv|chanserv)\b/i.test(text)) return true;
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

/** Remember one channel line. Fire-and-forget by design: memory must
 *  never delay, break, or block the wire it listens to. */
export async function memAppend(kv: any, net: string, chan: string, line: MemLine): Promise<void> {
  if (!kv || !chan.startsWith("#")) return;
  if (refused(line.x)) return;
  try {
    await kv.put(await lineKey(net, chan, line), JSON.stringify(line), { expirationTtl: TTL_S });
    await prune(kv, net, chan);
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
 *  The voice rides in every key, so a purge needs no reads at all. */
export async function memPurgeNick(kv: any, net: string, chan: string, nick: string): Promise<void> {
  if (!kv) return;
  try {
    const keys = await listKeys(kv, net, chan);
    const mine = keys.filter((k) => k.split("|")[4] === nick.toLowerCase());
    await Promise.allSettled(mine.map((k) => kv.delete(k)));
  } catch { /* a failed purge still leaves expiry to do the forgetting */ }
}

/** Forget the whole channel at once. Total and immediate. */
export async function memWipe(kv: any, net: string, chan: string): Promise<void> {
  if (!kv) return;
  try {
    const keys = await listKeys(kv, net, chan);
    await Promise.allSettled(keys.map((k) => kv.delete(k)));
  } catch { /* expiry finishes what a failed wipe began */ }
}
