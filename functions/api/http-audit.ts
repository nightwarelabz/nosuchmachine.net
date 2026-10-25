// @ts-nocheck
// GET /api/http-audit?url=https://example.com/
// HTTPS/HTTP audit: redirect chain, response headers, security-header
// grading (the web bench's EAZY-style battery), cookie flags, CORS
// reflection probe, and server fingerprint — read and grade only.
import { err, guardUrl, json, userAgent } from "../_lib/guard";

interface Hop { url: string; status: number; ms: number; headers: Record<string, string>; }

async function fetchHop(url: string, extraHeaders: Record<string, string> = {}): Promise<{ res: Response; ms: number }> {
  const started = Date.now();
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": userAgent(), accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", ...extraHeaders },
    signal: AbortSignal.timeout(10000),
  });
  return { res, ms: Date.now() - started };
}

/** Stream a response body to text, stopping at the cap: a byte cap that
 *  first downloads the whole body into worker memory caps nothing (the
 *  final-page snippet below once read the entire HTML with res.text()). */
async function readCappedText(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      const keep = value.slice(0, value.length - (total - cap));
      if (keep.length) chunks.push(keep);
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function gradeSecurityHeaders(headers: Record<string, string>) {
  const checks: Array<{ id: string; label: string; pass: boolean; detail: string; weight: number }> = [];
  const has = (k: string) => (headers[k] || "").trim();
  checks.push({ id: "hsts", label: "Strict-Transport-Security", pass: /max-age=\d{5,}/.test(has("strict-transport-security")), detail: has("strict-transport-security") || "Not set", weight: 18 });
  const csp = has("content-security-policy");
  checks.push({ id: "csp", label: "Content-Security-Policy", pass: !!csp && !/unsafe-inline/.test(csp) , detail: csp ? (csp.length > 140 ? csp.slice(0, 140) + "…" : csp) : "Not set", weight: 18 });
  checks.push({ id: "xcto", label: "X-Content-Type-Options: nosniff", pass: /nosniff/i.test(has("x-content-type-options")), detail: has("x-content-type-options") || "Not set", weight: 10 });
  const frame = has("x-frame-options") || (/frame-ancestors/.test(csp) ? "via CSP frame-ancestors" : "");
  checks.push({ id: "frame", label: "Clickjacking protection (X-Frame-Options / frame-ancestors)", pass: !!frame, detail: frame || "Not set", weight: 12 });
  checks.push({ id: "referrer", label: "Referrer-Policy", pass: !!has("referrer-policy"), detail: has("referrer-policy") || "Not set", weight: 8 });
  checks.push({ id: "permissions", label: "Permissions-Policy", pass: !!has("permissions-policy"), detail: has("permissions-policy") ? "Set" : "Not set", weight: 8 });
  checks.push({ id: "coop", label: "Cross-Origin-Opener-Policy", pass: !!has("cross-origin-opener-policy"), detail: has("cross-origin-opener-policy") || "Not set", weight: 8 });
  checks.push({ id: "corp-corp", label: "Cross-Origin-Resource-Policy", pass: !!has("cross-origin-resource-policy"), detail: has("cross-origin-resource-policy") || "Not set", weight: 6 });
  checks.push({ id: "server-leak", label: "Server / X-Powered-By does not over-share", pass: !/^(microsoft-iis\/|apache\/[\d.]+ \(|nginx\/[\d.]+$|php\/)/i.test(has("server")) && !has("x-powered-by"), detail: [has("server") && `Server: ${has("server")}`, has("x-powered-by") && `X-Powered-By: ${has("x-powered-by")}`].filter(Boolean).join(" · ") || "Nothing identifying sent", weight: 12 });
  const score = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F";
  return { score, grade, checks };
}

function auditCookies(setCookies: string[]) {
  return setCookies.map((raw) => {
    const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
    const name = pair.split("=")[0] || "(unnamed)";
    const flags = { secure: attrs.some((a) => /^secure$/i.test(a)), httpOnly: attrs.some((a) => /^httponly$/i.test(a)), sameSite: (attrs.find((a) => /^samesite=/i.test(a)) || "").split("=")[1] || null, path: (attrs.find((a) => /^path=/i.test(a)) || "").split("=")[1] || null, maxAge: (attrs.find((a) => /^(max-age|expires)=/i.test(a)) || "").split("=").slice(1).join("=") || null };
    const issues: string[] = [];
    if (!flags.secure) issues.push("missing Secure");
    if (!flags.httpOnly) issues.push("missing HttpOnly");
    if (!flags.sameSite) issues.push("missing SameSite");
    if (flags.sameSite && flags.sameSite.toLowerCase() === "none" && !flags.secure) issues.push("SameSite=None without Secure is rejected by browsers");
    return { name, flags, issues };
  });
}

export async function onRequestGet(context: any) {
  const urlParam = new URL(context.request.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = await guardUrl(urlParam);
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  const hops: Hop[] = [];
  let current = target.toString();
  let finalBodySnippet = "";
  let finalContentType = "";
  for (let i = 0; i < 8; i++) {
    let res: Response; let ms: number;
    try {
      ({ res, ms } = await fetchHop(current));
    } catch (e: any) {
      return err(`Fetch failed at ${current}: ${e?.name === "TimeoutError" ? "timed out after 10s" : "connection error"}. The target may be down, blocking the edge, or HTTP-only on a blocked port.`);
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const hop: Hop = { url: current, status: res.status, ms, headers };
    // Preserve raw Set-Cookie list separately (Headers collapses it in some runtimes).
    const setCookies: string[] = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : (headers["set-cookie"] ? [headers["set-cookie"]] : []);
    (hop as any).setCookies = setCookies;
    hops.push(hop);
    const location = res.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      const next = new URL(location, current).toString();
      try {
        await guardUrl(next);
      } catch (e: any) {
        return json({ ok: true, target: target.toString(), stoppedAtRedirect: next, stopReason: String(e?.message || e), hops });
      }
      current = next;
      continue;
    }
    finalContentType = res.headers.get("content-type") || "";
    if (/text\/html|application\/xhtml/i.test(finalContentType)) {
      try {
        finalBodySnippet = await readCappedText(res, 60000);
      } catch { /* body unreadable */ }
    } else {
      try { await res.body?.cancel(); } catch { /* noop */ }
    }
    break;
  }
  const finalHop = hops[hops.length - 1];
  const security = gradeSecurityHeaders(finalHop.headers);
  const cookies = auditCookies((finalHop as any).setCookies || []);

  // CORS reflection probe: a single GET with a foreign Origin — read, grade.
  let cors: any = { probed: false };
  try {
    const { res } = await fetchHop(finalHop.url, { origin: "https://blacksite-probe.nosuchmachine.net" });
    const acao = res.headers.get("access-control-allow-origin");
    const acac = res.headers.get("access-control-allow-credentials");
    cors = {
      probed: true,
      allowOrigin: acao, allowCredentials: acac,
      reflectsForeignOrigin: acao === "https://blacksite-probe.nosuchmachine.net",
      wildcard: acao === "*",
      verdict: acao === "https://blacksite-probe.nosuchmachine.net" && acac === "true"
        ? "DANGER: reflects an arbitrary Origin WITH credentials — any site can read authenticated responses."
        : acao === "https://blacksite-probe.nosuchmachine.net"
          ? "Reflects an arbitrary Origin (no credentials flag). Any site can read these responses cross-origin."
          : acao === "*" ? "Wildcard ACAO: responses are readable cross-origin (without credentials)."
            : "No cross-origin read granted to the probe origin.",
    };
    try { await res.body?.cancel(); } catch { /* noop */ }
  } catch { cors = { probed: false, verdict: "Probe fetch failed." }; }

  // Light fingerprint from headers + HTML markers.
  const fingerprint: string[] = [];
  const srv = finalHop.headers["server"]; if (srv) fingerprint.push(`Server: ${srv}`);
  const powered = finalHop.headers["x-powered-by"]; if (powered) fingerprint.push(`X-Powered-By: ${powered}`);
  if (finalBodySnippet) {
    if (/wp-content|wp-includes/i.test(finalBodySnippet)) fingerprint.push("WordPress markers in HTML");
    if (/__next|_next\/static/i.test(finalBodySnippet)) fingerprint.push("Next.js markers in HTML");
    if (/data-reactroot|react/i.test(finalBodySnippet) && /<div id=\"(root|app)\"/i.test(finalBodySnippet)) fingerprint.push("React SPA shell");
    if (/ng-version|angular/i.test(finalBodySnippet)) fingerprint.push("Angular markers in HTML");
    if (/\/_astro\//i.test(finalBodySnippet)) fingerprint.push("Astro markers in HTML");
    const generator = finalBodySnippet.match(/<meta[^>]+name=[\"']generator[\"'][^>]+content=[\"']([^\"']+)[\"']/i)?.[1];
    if (generator) fingerprint.push(`Generator: ${generator}`);
    const title = finalBodySnippet.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1]?.trim();
    if (title) fingerprint.push(`Title: ${title}`);
  }
  const totalMs = hops.reduce((s, h) => s + h.ms, 0);
  return json({
    ok: true, target: target.toString(), finalUrl: finalHop.url, finalStatus: finalHop.status,
    redirectHops: hops.length - 1, totalMs, hops, security, cookies, cors, fingerprint,
    mixedContentRisk: target.protocol === "http:" ? "Target itself is plain HTTP." : finalHop.url.startsWith("http:") ? "Redirect chain downgraded to plain HTTP." : null,
    note: "One GET per hop from a Cloudflare edge location, following at most 8 redirects, each re-checked against the public-target guard. Grades describe the response as received here.",
  });
}
