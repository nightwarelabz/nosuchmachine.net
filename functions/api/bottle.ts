// @ts-nocheck
// Daylight Bottle plug — a same-origin bridge from nosuchmachine.net to
// the Daylight Bottle service at bottle.nosuchmachine.net.
//
// Why this exists: the bottle service sends no CORS headers (deliberately,
// connect-src 'self'), so the BLACKSITE OS window on this origin cannot
// call it from the browser. This function forwards a narrow, validated
// slice of its API:
//   GET  /api/bottle?action=keyring
//   GET  /api/bottle?action=list&recipientFingerprint=sha256:<hex>[&cursor=]
//   GET  /api/bottle?action=evidence&id=<bottleId>
//   POST /api/bottle?action=drop    (nsm.daylight-bottle.drop.v1 JSON)
//
// The destination is a fixed constant — no caller-supplied URL ever reaches
// fetch, so this is a plug, not an open relay. The bottle Worker remains
// the authority: it re-validates every drop, enforces keyring membership
// and its own rate limits. Ciphertext only ever transits; plaintext never
// reaches either server (encryption happens in the OS window).
import { err, json } from "../_lib/guard";

const ORIGIN = "https://bottle.nosuchmachine.net";
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const KEYNAME = /^[a-z0-9][a-z0-9._/-]{2,63}$/;
const BOTTLE_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const MAX_DROP_BODY = 256 * 1024;

async function forward(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${ORIGIN}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  const cursor = res.headers.get("x-daylight-next-cursor");
  if (cursor) headers["x-daylight-next-cursor"] = cursor;
  return new Response(text, { status: res.status, headers });
}

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || "";
  try {
    if (action === "keyring") return await forward("/keyring.json");
    if (action === "list") {
      const fp = url.searchParams.get("recipientFingerprint") || "";
      if (!FINGERPRINT.test(fp)) return err("recipientFingerprint must be sha256: followed by 64 lowercase hex characters.");
      const q = new URLSearchParams({ recipientFingerprint: fp });
      const cursor = url.searchParams.get("cursor");
      if (cursor) {
        if (cursor.length > 2048) return err("cursor too long.");
        q.set("cursor", cursor);
      }
      return await forward(`/api/bottles?${q.toString()}`);
    }
    if (action === "evidence") {
      const id = url.searchParams.get("id") || "";
      if (!BOTTLE_ID.test(id)) return err("id must be a bottle id (8–128 chars of A–Z, a–z, 0–9, _ or -).");
      return await forward(`/api/bottles/${encodeURIComponent(id)}/evidence`);
    }
    return err("Unknown action. Use action=keyring, action=list, or action=evidence.", 404);
  } catch {
    return err("The Daylight Bottle service did not answer. It lives at bottle.nosuchmachine.net — try again shortly.", 502);
  }
}

export async function onRequestPost(context: any) {
  const url = new URL(context.request.url);
  if ((url.searchParams.get("action") || "") !== "drop") return err("POST is only for action=drop.", 404);
  const raw = await context.request.text();
  if (raw.length > MAX_DROP_BODY) return err("Drop body above the 256 KB service limit.");
  let body: any;
  try { body = JSON.parse(raw); } catch { return err("Drop body must be JSON."); }
  if (!body || typeof body !== "object") return err("Drop body must be a JSON object.");
  if (body.schema !== "nsm.daylight-bottle.drop.v1") return err("schema must be nsm.daylight-bottle.drop.v1.");
  if (typeof body.keyname !== "string" || !KEYNAME.test(body.keyname) || body.keyname.includes("..") || body.keyname.includes("//")) return err("keyname must be 3–64 lowercase letters, digits, '.', '_', '/', or '-' (no '..' or '//').");
  if (typeof body.recipientFingerprint !== "string" || !FINGERPRINT.test(body.recipientFingerprint)) return err("recipientFingerprint must be sha256: followed by 64 lowercase hex characters.");
  if (typeof body.ciphertext !== "string" || !body.ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) return err("ciphertext must be an armored age file (-----BEGIN AGE ENCRYPTED FILE-----).");
  if (typeof body.createdAtClient !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.createdAtClient)) return err("createdAtClient must be an ISO timestamp with milliseconds.");
  try {
    return await forward("/api/bottles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schema: body.schema, keyname: body.keyname, recipientFingerprint: body.recipientFingerprint, ciphertext: body.ciphertext, createdAtClient: body.createdAtClient }),
    });
  } catch {
    return err("The Daylight Bottle service did not answer. It lives at bottle.nosuchmachine.net — try again shortly.", 502);
  }
}
