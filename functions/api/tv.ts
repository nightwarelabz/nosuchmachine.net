// @ts-nocheck
// GET /api/tv?u=<https HLS url>
// The TV bench's broadcast relay. The OS page serves connect-src
// 'self', so the player can only ever fetch same-origin — every
// playlist and every segment of a broadcast rides through here,
// and here is what makes a planet of public broadcasters playable
// in the room at all.
//
// It is a broadcast relay, not an open proxy: the target passes the
// same public-target guard as every other bench probe (https only,
// private / loopback / link-local / metadata / reserved refused
// before contact, re-checked on every redirect hop), and only
// HLS-shaped upstreams are relayed — anything else is a plain
// refusal. Playlists are rewritten so every URI they name (variant
// playlists, segments, keys, init maps, subtitle tracks) comes back
// through this endpoint and is guarded again in its turn; media
// bytes stream straight through untouched. Receive only: the relay
// speaks GET and nothing else. No catalog lives here: any guarded
// public HLS target may ride, exactly as /api/radio carries any
// guarded station.
//
// Segments are many small requests — one channel at a live edge is
// a playlist refresh plus a segment every few seconds — so the
// per-visitor cadence is counted in requests, not connections:
// 1200 in 10 minutes is several channels at once, watched forever,
// and still a hard ceiling against fan-out. Counted before the
// guard, like the SSH bridge: knocking costs the knocker.
import { guardUrl, userAgent } from "../_lib/guard";
import { attemptAllowed, ATTEMPT_WINDOW_MS } from "../_lib/ratelimit";

const TV_LIMIT = 1200;
const MAX_HOPS = 5;
const MAX_PLAYLIST_BYTES = 4 * 1024 * 1024;
const MEDIA_EXT = new Set(["ts", "m4s", "mp4", "m4v", "aac", "mp3", "m4a", "cmfv", "cmfa"]);

function plain(message: string, status = 400): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function extOf(url: URL): string {
  const seg = url.pathname.split("/").pop() || "";
  const dot = seg.lastIndexOf(".");
  return dot >= 0 ? seg.slice(dot + 1).toLowerCase() : "";
}

/* Every URI a playlist names rides the relay: bare URI lines and
 * URI="..." attributes alike (keys, init maps, alternate renditions,
 * subtitle tracks, part hints). Relative references resolve against
 * the playlist's own URL first — that resolution is the whole HLS
 * addressing model. */
function rewritePlaylist(body: string, base: URL): string {
  const relay = (raw: string): string => {
    const abs = new URL(raw, base).toString();
    return `/api/tv?u=${encodeURIComponent(abs)}`;
  };
  return body.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      if (!trimmed.includes('URI="')) return line;
      return line.replace(/URI="([^"]*)"/g, (_m, uri) => `URI="${relay(uri)}"`);
    }
    return relay(trimmed);
  }).join("\n");
}

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  const raw = q.get("u") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return plain("That is not a valid channel URL.");
  }
  if (target.protocol !== "https:") return plain("Refused: the bench relays https broadcasts only.");

  const kv = context.env?.RELAY_MEMORY || null;
  const visitor = context.request.headers.get("cf-connecting-ip") || "";
  if (!(await attemptAllowed(kv, "tvrl", visitor, TV_LIMIT, ATTEMPT_WINDOW_MS))) {
    return plain(`tv relay: too many requests from this visitor — the limit is ${TV_LIMIT} in 10 minutes. Wait a while, then try again.`, 429);
  }

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
        headers: { "user-agent": userAgent(), accept: "application/vnd.apple.mpegurl, application/x-mpegURL, video/*, audio/*, application/octet-stream" },
        signal: ctl.signal,
      });
    } catch (e: any) {
      clearTimeout(to);
      return plain(`The channel did not answer: ${e?.name === "AbortError" ? "timed out after 20s" : "connection error"}.`, 502);
    }
    clearTimeout(to);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === MAX_HOPS) { await res.body?.cancel().catch(() => {}); return plain("The channel redirected too many times.", 502); }
      const loc = res.headers.get("location")!;
      await res.body?.cancel().catch(() => {});
      try {
        const next = new URL(loc, target);
        if (next.protocol !== "https:") return plain("Refused: the channel redirected to a non-https address.");
        target = await guardUrl(next.toString());
      } catch (e: any) {
        return plain(String(e?.message || e));
      }
      res = null;
      continue;
    }
    break;
  }
  if (!res) return plain("The channel did not answer.", 502);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return plain(`The channel answered HTTP ${res.status}.`, res.status);
  }

  const ctype = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = extOf(target);

  /* Media path: a named segment or clip streams straight through —
     buffering a broadcast would be both a lie and a memory failure.
     Only media-shaped answers may ride; a text/html answer wearing
     a segment's name is refused like the radio relay refuses it. */
  if (MEDIA_EXT.has(ext)) {
    const mediaShaped = ctype.startsWith("video/") || ctype.startsWith("audio/") || ctype === "application/octet-stream";
    if (!mediaShaped) {
      await res.body?.cancel().catch(() => {});
      return plain(`Refused: that address serves ${ctype || "no content type"}, not broadcast media. The relay carries HLS broadcasts only.`, 415);
    }
    const headers: Record<string, string> = {
      "content-type": res.headers.get("content-type")!,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    };
    const len = res.headers.get("content-length");
    if (len) headers["content-length"] = len;
    return new Response(res.body, { status: res.status, headers });
  }

  /* Playlist path: small text-shaped answers are read whole (with a
     cap) and proven to be what they claim. A playlist is rewritten
     so the whole tree of URIs it names rides the relay; a subtitle
     track passes as itself; a key file passes as bytes. Anything
     else wearing no media shape is refused. */
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_PLAYLIST_BYTES) {
    return plain("Refused: that answer is too large to be a playlist.", 502);
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(0, 16));
  if (head.startsWith("#EXTM3U")) {
    const text = new TextDecoder("utf-8").decode(buf);
    return new Response(rewritePlaylist(text, target), {
      status: 200,
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  if (ext === "vtt" && (ctype === "text/vtt" || ctype === "text/plain")) {
    return new Response(buf, {
      status: 200,
      headers: { "content-type": "text/vtt", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  if (ctype === "application/octet-stream" && buf.length <= 65536) {
    return new Response(buf, {
      status: 200,
      headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  return plain(`Refused: that address serves ${ctype || "no content type"}, not an HLS broadcast. The relay carries HLS broadcasts only.`, 415);
}
