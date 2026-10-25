// @ts-nocheck
// Nexuiz Classic data pipe — a same-origin, fixed-destination range
// proxy for the game's own data packs.
//
// Why this exists: the ACTUAL Nexuiz 2.5.2 data pack
// (data20091001.pk3, 887,580,846 bytes) is far beyond any file this
// site may ship, and every lawful upstream that carries the release
// zip sends no CORS headers (measured 2026-10-25: GitHub Releases,
// archive.org item servers, and deb.debian.org all answer without
// Access-Control-Allow-Origin), so the browser cannot fetch the game
// data cross-origin. This function is a plug, not a relay: the
// destination is one pinned file (the official release zip on
// archive.org, whose SHA-256 matches the FreshPorts-published value),
// and the only thing a caller may choose is which pinned pack and
// which fixed-size chunk of that pack's compressed span to stream.
//
// The client inflates each pack's raw-deflate span, reassembles the
// pack byte-for-byte, and verifies its SHA-256 against the value
// pinned in public/nexuiz/NOTICE.txt before the engine ever sees it.
// Wrong bytes — from anywhere — are refused, never played.
import { err } from "../_lib/guard";

const ORIGIN_FILE = "https://archive.org/download/nexuiz-252/nexuiz-252.zip";
const CHUNK = 16 * 1024 * 1024; // 16 MiB of compressed span per request

// Spans of each pack's raw deflate stream inside the release zip,
// measured from the hash-verified zip (see public/nexuiz/NOTICE.txt).
const PACKS: Record<string, { spanStart: number; spanLength: number }> = {
  data: { spanStart: 23842145, spanLength: 880493625 },
  spog: { spanStart: 904335848, spanLength: 24638 },
};

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const part = url.searchParams.get("part") || "";
  const pack = PACKS[part];
  if (!pack) return err("Unknown part. Use part=data or part=spog.", 404);
  const chunkRaw = url.searchParams.get("chunk") || "0";
  if (!/^\d{1,4}$/.test(chunkRaw)) return err("chunk must be a small non-negative integer.");
  const chunk = parseInt(chunkRaw, 10);
  const chunkCount = Math.ceil(pack.spanLength / CHUNK);
  if (chunk >= chunkCount) return err(`chunk out of range (this pack has ${chunkCount}).`, 404);

  const start = pack.spanStart + chunk * CHUNK;
  const end = Math.min(pack.spanStart + pack.spanLength, start + CHUNK) - 1;
  let upstream: Response;
  try {
    upstream = await fetch(ORIGIN_FILE, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    return err("The data archive did not answer. It lives at archive.org — try again shortly.", 502);
  }
  if (upstream.status !== 206 || !upstream.body) {
    return err(`The data archive answered ${upstream.status} instead of a byte range — refusing to pass it on.`, 502);
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
