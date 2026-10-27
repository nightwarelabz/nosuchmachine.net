// @ts-nocheck
// Nexuiz Classic data pipe — a same-origin, fixed-destination range
// proxy for the game's own data packs.
//
// THE ROAD AGAIN (the haxiuz strip, amended): the stripped pack
// (data/haxiuz.pk3, 99,228,456 bytes) was first dealt as a plain
// site file, but Cloudflare Pages caps static assets at 25 MiB —
// a 99 MB pack cannot deploy as one. So the pack travels in spans
// like the release packs always did: part "haxiuz" streams the
// pack's raw-deflate span out of its container zip
// (haxiuz-release.zip, a release asset on the house's own haxiuz
// repo, tag data-1), and play.js deals the span entry. Parts
// "data" and "spog" stand unchanged — the archive.org origin,
// the same spans — as the documented full-data restore path in
// tools/nexuiz/BUILD.md: restore the two span entries in play.js
// and the full deal is the deal again.
//
// Why this exists: the ACTUAL Nexuiz 2.5.2 data pack
// (data20091001.pk3, 887,580,846 bytes) is far beyond any file this
// site may ship, and every lawful upstream that carries the release
// zip sends no CORS headers (measured 2026-10-25: GitHub Releases,
// archive.org item servers, and deb.debian.org all answer without
// Access-Control-Allow-Origin), so the browser cannot fetch the game
// data cross-origin. This function is a plug, not a relay: each
// part's destination is one pinned file (for data/spog, the
// official release zip on archive.org, whose SHA-256 matches the
// FreshPorts-published value; for haxiuz, the house-built
// container zip on the haxiuz repo's data-1 release), and the only
// thing a caller may choose is which pinned pack and which
// fixed-size chunk of that pack's compressed span to stream.
//
// The client inflates each pack's raw-deflate span, reassembles the
// pack byte-for-byte, and verifies its SHA-256 against the value
// pinned in public/nexuiz/NOTICE.txt before the engine ever sees it.
// Wrong bytes — from anywhere — are refused, never played.
import { err } from "../_lib/guard";

const CHUNK = 16 * 1024 * 1024; // 16 MiB of compressed span per request

// Spans of each pack's raw deflate stream inside its part's
// container zip, measured from the hash-verified zip (see
// public/nexuiz/NOTICE.txt). data/spog's container is the official
// release zip on archive.org; haxiuz's container is
// haxiuz-release.zip (98,509,335 bytes, SHA-256
// f00dc045337d245bc3be901763d1fe7607112f383bc64abcc9611f33f8a252f1),
// whose single deflated entry is the pack itself: the span begins
// just past its local header (offset 40) and inflates to the pack
// byte-for-byte.
const PACKS: Record<string, { origin: string; source: string; spanStart: number; spanLength: number }> = {
  data: { origin: "https://archive.org/download/nexuiz-252/nexuiz-252.zip", source: "archive.org", spanStart: 23842145, spanLength: 880493625 },
  spog: { origin: "https://archive.org/download/nexuiz-252/nexuiz-252.zip", source: "archive.org", spanStart: 904335848, spanLength: 24638 },
  haxiuz: { origin: "https://github.com/nightwarelabz/haxiuz/releases/download/data-1/haxiuz-release.zip", source: "github.com/nightwarelabz/haxiuz (release data-1)", spanStart: 40, spanLength: 98509217 },
};

/* The range answer is verified before a single byte is passed on:
   the upstream's Content-Range must name exactly the chunk that
   was asked for — the same start, the same end, and a total (when
   one is reported) that can actually contain it — and its
   Content-Length, when sent, must equal the chunk's size. Only
   then does the answer earn the one-year immutable cache stamp
   below. Before this check existed the endpoint trusted a bare
   206: an upstream answering a DIFFERENT range (a mirror gone
   wrong, an origin swapped mid-flight) would have its bytes
   stamped with this chunk's length and cached immutably under
   this chunk's URL — poison with a year's lease on it.
   Returns a short problem string, or null when the range fits. */
export function rangeCheck(contentRange: string | null, contentLength: string | null, start: number, end: number): string | null {
  if (!contentRange) return "no Content-Range header";
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange.trim());
  if (!m) return "an unparsable Content-Range";
  if (Number(m[1]) !== start || Number(m[2]) !== end) return `Content-Range ${m[1]}-${m[2]} for a request of ${start}-${end}`;
  if (m[3] !== "*" && Number(m[3]) <= end) return `a reported total of ${m[3]} that cannot contain the chunk`;
  if (contentLength !== null && Number(contentLength) !== end - start + 1) return `Content-Length ${contentLength} for a chunk of ${end - start + 1}`;
  return null;
}

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const part = url.searchParams.get("part") || "";
  const pack = PACKS[part];
  if (!pack) return err("Unknown part. Use part=data, part=spog or part=haxiuz.", 404);
  const chunkRaw = url.searchParams.get("chunk") || "0";
  if (!/^\d{1,4}$/.test(chunkRaw)) return err("chunk must be a small non-negative integer.");
  const chunk = parseInt(chunkRaw, 10);
  const chunkCount = Math.ceil(pack.spanLength / CHUNK);
  if (chunk >= chunkCount) return err(`chunk out of range (this pack has ${chunkCount}).`, 404);

  const start = pack.spanStart + chunk * CHUNK;
  const end = Math.min(pack.spanStart + pack.spanLength, start + CHUNK) - 1;
  let upstream: Response;
  try {
    upstream = await fetch(pack.origin, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    return err(`The data archive did not answer. It lives at ${pack.source} — try again shortly.`, 502);
  }
  if (upstream.status !== 206 || !upstream.body) {
    return err(`The data archive answered ${upstream.status} instead of a byte range — refusing to pass it on.`, 502);
  }
  const rangeProblem = rangeCheck(upstream.headers.get("content-range"), upstream.headers.get("content-length"), start, end);
  if (rangeProblem) {
    return err(`The data archive's answer carries ${rangeProblem} — refusing to pass it on, and nothing is cached.`, 502);
  }
  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "content-length": String(end - start + 1),
    "cache-control": "public, max-age=31536000, immutable",
    "x-nexuiz-part": part,
    "x-nexuiz-chunk": String(chunk),
    "x-nexuiz-chunks": String(chunkCount),
  };
  return new Response(upstream.body, { status: 200, headers });
}
