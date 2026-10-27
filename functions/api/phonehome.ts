// @ts-nocheck
// BLACKSITE phonehome rendezvous — a narrow edge plug that lets two
// Blacksite stations find each other, and nothing more.
//
// Two operators agree a call code out of band. The caller leaves a
// signed WebRTC offer under the code; the listener takes it, leaves
// a signed answer; the caller takes that and the rendezvous is
// done — voice and text then flow peer to peer and never touch
// this function or its store. What the store ever holds:
//   one value per (call code, role): a signed signaling blob
//   (public keys + SDP), under a key namespaced phonehome:v1:,
//   with a ten-minute TTL, deleted by either station on link-up
//   or hangup. No content, no media, no archive — the Relay
//   memory's law, applied to a smaller room.
//
// Storage is the PHONEHOME KV binding when it exists, else the
// house's RELAY_MEMORY namespace under the phonehome: prefix —
// segregated by key, identical TTL discipline either way. With
// neither binding the plug answers 501 and the stations carry
// their signals by hand, which always works.
import { err, json } from "../_lib/guard";

const CODE = /^[a-z0-9][a-z0-9-]{3,31}$/;
const MAX_BLOB = 64 * 1024;
const TTL_S = 600;

function store(context: any) {
  return context.env?.PHONEHOME || context.env?.RELAY_MEMORY || null;
}
async function codeHash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nsm.phonehome.code.v1\n${code}`));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function keyFor(code: string, role: string): Promise<string> {
  return `phonehome:v1:${await codeHash(code)}:${role}`;
}
const normCode = (raw: string) => (raw || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);

export async function onRequestGet(context: any) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || "";
  const kv = store(context);
  if (action === "status") return json({ bound: !!kv, ttlSeconds: TTL_S });
  if (action !== "get") return err("unknown action", 400);
  if (!kv) return err("the rendezvous is not bound on this deployment — carry the signals by hand", 501);
  const code = normCode(url.searchParams.get("code") || "");
  const role = url.searchParams.get("role") || "";
  if (!CODE.test(code)) return err("that call code is not a call code");
  if (role !== "offer" && role !== "answer") return err("role must be offer or answer");
  const blob = await kv.get(await keyFor(code, role));
  return json(blob ? { found: true, blob } : { found: false });
}

export async function onRequestPost(context: any) {
  const kv = store(context);
  if (!kv) return err("the rendezvous is not bound on this deployment — carry the signals by hand", 501);
  let body: any;
  try { body = await context.request.json(); } catch { return err("body must be JSON"); }
  const action = body?.action || "";
  const code = normCode(body?.code || "");
  if (!CODE.test(code)) return err("that call code is not a call code");
  if (action === "clear") {
    await kv.delete(await keyFor(code, "offer"));
    await kv.delete(await keyFor(code, "answer"));
    return json({ cleared: true });
  }
  if (action !== "put") return err("unknown action", 400);
  const role = body?.role || "";
  if (role !== "offer" && role !== "answer") return err("role must be offer or answer");
  const blob = body?.blob;
  if (typeof blob !== "string" || !blob || blob.length > MAX_BLOB) return err("blob must be a signal string under 64 KB");
  let parsed: any;
  try { parsed = JSON.parse(blob); } catch { return err("blob is not a phonehome signal"); }
  if (parsed?.schema !== "nsm.phonehome.signal.v1" || parsed?.kind !== role) return err("blob is not a phonehome signal of that kind");
  await kv.put(await keyFor(code, role), blob, { expirationTtl: TTL_S });
  return json({ stored: true, role, expiresInSeconds: TTL_S });
}
