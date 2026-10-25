// @ts-nocheck
// BLACKSITE git proxy — isomorphic-git in the BLACKSITE OS room speaks
// git smart-HTTP, which needs CORS the git hosts do not send. This is
// the room's own proxy: the path after /api/git-proxy/ is the target URL
// (https only), re-validated against the public-target guard before any
// byte moves, and only the three git transport endpoints are forwarded.
// It is a pipe, not a cache: nothing is stored, and credentials in the
// Authorization header pass through to the guarded target only.
import { guardUrl, json, err } from "../../_lib/guard";

const ALLOWED = /\/(info\/refs|git-upload-pack|git-receive-pack)$/;

export async function onRequest(context: any) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "POST") return err("git proxy: only GET and POST.", 405);
  const outer = new URL(request.url);
  const marker = "/api/git-proxy/";
  const idx = outer.pathname.indexOf(marker);
  if (idx < 0) return err("git proxy: malformed path.", 400);
  let decodedTarget: string;
  try {
    decodedTarget = decodeURIComponent(outer.pathname.slice(idx + marker.length));
  } catch {
    return err("git proxy: the target path is not valid percent-encoding.", 400);
  }
  const rawTarget = decodedTarget + outer.search;
  if (!rawTarget.startsWith("https://")) return err("git proxy: only https:// git remotes — the room does not do plaintext git.", 400);
  const pathOnly = rawTarget.split("?")[0];
  if (!ALLOWED.test(pathOnly)) return err("git proxy: only info/refs, git-upload-pack, and git-receive-pack are forwarded.", 400);
  let target: URL;
  try {
    target = await guardUrl(rawTarget);
  } catch (e: any) {
    return err(String(e?.message || e), 403);
  }
  const headers = new Headers();
  for (const h of ["accept", "content-type", "git-protocol", "authorization"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("user-agent", "git/isomorphic-git (BLACKSITE OS; nosuchmachine.net)");
  const init: RequestInit = { method: request.method, headers, redirect: "manual", signal: AbortSignal.timeout(120000) };
  if (request.method === "POST") init.body = await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (e: any) {
    return err(`git proxy: the remote did not answer (${String(e?.message || e).slice(0, 120)}).`, 502);
  }
  const out = new Headers();
  // Location matters: redirects are set to manual here, and a git host
  // that moved (renamed account, canonical host) answers 3xx — passing
  // the status through without its Location left the client facing a
  // redirect it could not follow. www-authenticate rides along so an
  // upstream credential challenge reaches the client as itself.
  for (const h of ["content-type", "location", "www-authenticate"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
