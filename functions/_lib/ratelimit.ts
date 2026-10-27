// @ts-nocheck
// Per-visitor attempt limiting for the house's public wire bridges.
//
// The bridges are public by design — any visitor may open a session —
// but a public door with no cadence at all is a mule: one visitor could
// fan out connection attempts through the house's edge as fast as the
// wire allows. This limiter counts NEW connection attempts per visitor
// in a fixed window and refuses past the cap, in plain words, before
// any target is resolved or dialed.
//
// Identity is the connecting address Cloudflare reports. An IPv6
// visitor is bucketed by their /64 — the smallest block a visitor is
// ever assigned — so address rotation inside one allocation gains
// nothing; an IPv4 visitor is their address. Storage rides the site's
// existing KV (keys under their own prefix, invisible to the room
// memory that shares the namespace, which enumerates only its own
// channel prefixes). With no KV bound, or no identity reported, the
// limiter is inert — the same posture as every optional binding in the
// house. A KV failure degrades open on purpose: this is an abuse
// control, not the safety gate — the public-target guard remains the
// gate, and it fails closed on its own.
//
// The count is a plain read-modify-write, so a burst racing itself can
// undercount by a little. The cap is a blunt instrument against
// fan-out, not a meter, and it is honest about that shape.

export const ATTEMPT_LIMIT = 30;
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/* The visitor bucket for an address: IPv6 → its /64, IPv4 → itself. */
export function visitorBucket(ip: string): string {
  const v = String(ip || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes(":")) {
    const head = v.split("::")[0];
    const groups = head.split(":").filter((g) => g.length > 0);
    return groups.slice(0, 4).join(":");
  }
  return v;
}

/* Count one attempt; true when it may proceed. */
export async function attemptAllowed(
  kv: any,
  scope: string,
  ip: string,
  limit: number = ATTEMPT_LIMIT,
  windowMs: number = ATTEMPT_WINDOW_MS,
  now: number = Date.now(),
): Promise<boolean> {
  if (!kv) return true;
  const bucket = visitorBucket(ip);
  if (!bucket) return true;
  const key = `${scope}:${bucket}:${Math.floor(now / windowMs)}`;
  try {
    const cur = parseInt((await kv.get(key)) || "0", 10) || 0;
    if (cur >= limit) return false;
    await kv.put(key, String(cur + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
    return true;
  } catch {
    return true;
  }
}
