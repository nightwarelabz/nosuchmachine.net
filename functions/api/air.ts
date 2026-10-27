// @ts-nocheck
// GET /api/air?lat=<deg>&lon=<deg>&dist=<nm>
// The SIGINT bench's air picture: live ADS-B traffic around a watch
// point, read off the community exchange (api.adsb.lol — itself a
// federation of ground receivers; this bench only ever reads it).
// The feed sends no CORS headers, so the tab cannot read it directly
// — it is fetched here, server-side, from that one fixed upstream.
// There is no free-form URL and no other verb: listening only, and
// nothing in this function can transmit anything anywhere.
import { err, guardTarget, json, userAgent } from "../_lib/guard";

const UPSTREAM = "api.adsb.lol";

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const dist = Number(q.get("dist") ?? "25");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return err("lat must be a number between -90 and 90.");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return err("lon must be a number between -180 and 180.");
  if (!Number.isFinite(dist) || dist < 1 || dist > 250) return err("dist must be nautical miles between 1 and 250.");
  /* The upstream is a fixed public host; it still passes the guard,
     so the day it resolves somewhere non-public this door closes. */
  try {
    await guardTarget(UPSTREAM);
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  let res: Response;
  try {
    res = await fetch(`https://${UPSTREAM}/v2/lat/${lat}/lon/${lon}/dist/${dist}`, {
      headers: { "user-agent": userAgent(), accept: "application/json" },
      cf: { cacheTtl: 5, cacheEverything: true },
      signal: AbortSignal.timeout(12000),
    } as RequestInit);
  } catch (e: any) {
    return err(`The air feed did not answer: ${e?.name === "TimeoutError" ? "timed out after 12s" : "connection error"}.`, 502);
  }
  if (!res.ok) return err(`The air feed answered HTTP ${res.status}.`, 502);
  const data: any = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.ac)) return err("The air feed answered, but not in its own shape — nothing is shown rather than something invented.", 502);
  return json(
    { ok: true, at: Date.now(), lat, lon, dist, total: typeof data.total === "number" ? data.total : data.ac.length, ac: data.ac },
    200,
    { "cache-control": "public, max-age=5" },
  );
}
