// @ts-nocheck
// GET /api/fetch?url=<https url>&method=GET|HEAD|OPTIONS
// The OS shell's guarded fetch: one request, public targets only, redirects
// NOT followed automatically (the shell walks chains itself, like the bench).
// Returns status, headers, and the body as text (truncated) or base64.
import { err, guardUrl, json, userAgent } from "../_lib/guard";

const METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  const urlParam = q.get("url") || "";
  const method = (q.get("method") || "GET").toUpperCase();
  const wantBinary = q.get("binary") === "1";
  if (!METHODS.has(method)) return err("The web bench fetches with GET, HEAD, or OPTIONS only — read verbs. Writes stay in the native instrument, on your own gear, by hand.");
  let target: URL;
  try {
    target = await guardUrl(urlParam);
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(target.toString(), {
      method,
      redirect: "manual",
      headers: { "user-agent": userAgent(), accept: "*/*", ...(q.get("origin") ? { origin: q.get("origin")! } : {}) },
      signal: AbortSignal.timeout(12000),
    });
  } catch (e: any) {
    return err(`Fetch failed: ${e?.name === "TimeoutError" ? "timed out after 12s" : "connection error"}.`);
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const setCookies: string[] = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : [];
  let bodyText: string | null = null;
  let bodyBase64: string | null = null;
  let bodyBytes = 0;
  let truncated = false;
  if (method !== "HEAD") {
    try {
      // Stream the body and stop at the cap: a byte cap that first
      // downloads the whole response into worker memory caps nothing.
      // (lens.ts readCapped is the house pattern; this is its shape.)
      const cap = wantBinary ? 262144 : 131072;
      const reader = res.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > cap) {
            truncated = true; // at least one byte beyond the cap exists
            const keep = value.slice(0, value.length - (total - cap));
            if (keep.length) chunks.push(keep);
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
        bodyBytes = total;
        const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of chunks) { buf.set(c, off); off += c.length; }
        if (wantBinary) {
          let bin = "";
          buf.forEach((b) => (bin += String.fromCharCode(b)));
          bodyBase64 = btoa(bin);
        } else {
          bodyText = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        }
      }
    } catch { /* body unreadable */ }
  }
  return json({
    ok: true, url: target.toString(), method, status: res.status, statusText: res.statusText,
    ms: Date.now() - started, headers, setCookies, bodyText, bodyBase64, bodyBytes, truncated,
    location: res.headers.get("location"),
  });
}
