// @ts-nocheck
// GET /api/radio?u=<https station url>
// The SIGINT bench's station relay. The bench plays real broadcast
// streams through its WebAudio graph (waterfall, demod metering,
// EMCON mute) — but the site serves COEP: require-corp and station
// streams almost never send CORP or CORS headers, so a cross-origin
// element load is blocked outright or taps as silence. This relay
// makes the stream same-origin: the tab fetches it from here, and
// here fetches it from the station, streaming straight through.
//
// It is a radio relay, not an open proxy: the target passes the same
// public-target guard as every other bench probe (https only,
// private / loopback / link-local / metadata / reserved refused
// before contact, re-checked on every redirect hop), and only
// audio-shaped upstreams are relayed — anything else is a plain
// refusal. Receive only: the relay speaks GET and nothing else.
import { guardUrl, userAgent } from "../_lib/guard";

function plain(message: string, status = 400): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

const MAX_HOPS = 5;

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  const raw = q.get("u") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return plain("That is not a valid station URL.");
  }
  if (target.protocol !== "https:") return plain("Refused: the bench relays https station streams only.");
  try {
    target = await guardUrl(target.toString());
  } catch (e: any) {
    return plain(String(e?.message || e));
  }

  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    try {
      res = await fetch(target.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": userAgent(), accept: "audio/*, application/octet-stream" },
        signal: ctl.signal,
      });
    } catch (e: any) {
      clearTimeout(to);
      return plain(`The station did not answer: ${e?.name === "AbortError" ? "timed out after 20s" : "connection error"}.`, 502);
    }
    clearTimeout(to);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === MAX_HOPS) { await res.body?.cancel().catch(() => {}); return plain("The station redirected too many times.", 502); }
      const loc = res.headers.get("location")!;
      await res.body?.cancel().catch(() => {});
      try {
        const next = new URL(loc, target);
        if (next.protocol !== "https:") return plain("Refused: the station redirected to a non-https address.");
        target = await guardUrl(next.toString());
      } catch (e: any) {
        return plain(String(e?.message || e));
      }
      res = null;
      continue;
    }
    break;
  }
  if (!res) return plain("The station did not answer.", 502);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return plain(`The station answered HTTP ${res.status}.`, res.status);
  }
  const ctype = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const audioShaped = ctype.startsWith("audio/") || ctype === "application/octet-stream";
  if (!audioShaped) {
    await res.body?.cancel().catch(() => {});
    return plain(`Refused: that address serves ${ctype || "no content type"}, not audio. The relay carries station audio only.`, 415);
  }
  /* Stream straight through — a station plays for as long as the
     listener stays; buffering it whole would be both a lie and a
     memory failure. Status and content type are the station's own. */
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type")!,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
