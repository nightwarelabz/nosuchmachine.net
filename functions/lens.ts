// @ts-nocheck
// GET /lens?u=<absolute url> — the orc room's lens for browsers that
// cannot frame the web themselves.
//
// Why this exists: the BLACKSITE OS page rides COEP require-corp
// (phantom's cross-origin isolation), which blocks framing any site
// that does not send a Cross-Origin-Resource-Policy slip. Chromium
// waives that for credentialless frames; Safari supports neither
// credentialless frames nor COEP credentialless, so in Safari the
// room's pane stays black on arbitrary sites. The lens is the house
// fetching the page from its own origin instead: the frame never
// leaves nosuchmachine.net.
//
// Security posture (deliberate, and narrower than a proxy):
// - GET only. No POST, no bodies, no form submission through the lens.
// - Public targets only: every URL — the first and every redirect
//   hop — passes the shared guard (DNS-checked against private,
//   loopback, link-local, CGNAT and metadata ranges).
// - No cookies in either direction: the fetch sends none, and any
//   Set-Cookie from the target is stripped, never relayed.
// - The house itself is refused as a target (no lens loops; the room
//   frames house pages directly).
// - Bodies are capped; binary/app payloads are refused by type.
// - Rewritten pages are served under a sandbox CSP with NO
//   allow-same-origin, so lens content runs with an opaque origin
//   and cannot reach the OS's storage or APIs, on top of the room
//   iframe's own sandbox.
// - Links and subresources are rewritten back through the lens, so a
//   framed site stays framed; scripts pass through byte-exact (app-
//   grade JS sites may still break — the lens is a reader, not a
//   browser; orc standalone is the browser).
import { guardUrl } from "./_lib/guard";

const MAX_HOPS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const HOUSE = /(^|\.)nosuchmachine\.net$/i;

function refusal(title: string, detail: string, status = 400): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>orc lens</title>
<style>body{background:#0b0e13;color:#cfd6e4;font:14px/1.6 ui-monospace,Menlo,monospace;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:34rem;padding:2rem}h1{font-size:1rem;color:#ffdf6b;letter-spacing:.08em}a{color:#8ab4ff}</style>
<main><h1>THE LENS REFUSES</h1><p>${title}</p><p>${detail}</p><p><a href="https://github.com/nightwarelabz/orc/releases/latest">get orc</a> — the standalone browses natively, no lens involved.</p></main>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

function lensUrl(abs: string): string {
  return `/lens?u=${encodeURIComponent(abs)}`;
}

function absolutize(raw: string, base: URL): string | null {
  const v = (raw || "").trim();
  if (!v || v.startsWith("#")) return null;
  if (/^(data|javascript|mailto|tel|blob|about):/i.test(v)) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (HOUSE.test(u.hostname)) return u.toString(); // house links leave the lens
    return lensUrl(u.toString());
  } catch {
    return null;
  }
}

function rewriteCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
    const next = absolutize(ref, base);
    return next ? `url("${next}")` : m;
  }).replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, ref) => {
    const next = absolutize(ref, base);
    return next ? `@import "${next}"` : m;
  });
}

async function fetchGuarded(start: URL): Promise<{ res: Response; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; orc-lens/1.0; +https://nosuchmachine.net)",
        accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
        "accept-language": "en",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: url };
      if (hop === MAX_HOPS) throw new Error("Too many redirects.");
      const next = new URL(loc, url);
      url = await guardUrl(next.toString()); // every hop re-checked
      if (HOUSE.test(url.hostname)) throw new Error("The lens does not frame the house; the room frames it directly.");
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("That page is larger than the lens carries (3 MB).");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function onRequestGet(context: any) {
  const q = new URL(context.request.url).searchParams;
  const raw = q.get("u") || "";
  let target: URL;
  try {
    target = await guardUrl(raw);
  } catch (e: any) {
    return refusal("That address is not one the lens will fetch.", String(e?.message || e), 403);
  }
  if (HOUSE.test(target.hostname)) {
    return refusal("That is the house itself.", "The room frames house pages directly — the lens is only for the web outside.", 400);
  }
  let res: Response, finalUrl: URL;
  try {
    ({ res, finalUrl } = await fetchGuarded(target));
  } catch (e: any) {
    return refusal("The fetch failed.", String(e?.message || e), 502);
  }
  const type = (res.headers.get("content-type") || "").toLowerCase();
  const baseHeaders: Record<string, string> = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  };
  if (!res.ok && res.status !== 404 && res.status !== 403) {
    // Mirror honest failures as a lens note; 404/403 pages still render below.
    if (!type.includes("text/html")) return refusal(`The site answered ${res.status}.`, "Nothing renderable came back through the lens.", 502);
  }

  if (type.includes("text/html")) {
    let body: Uint8Array;
    try { body = await readCapped(res); } catch (e: any) { return refusal("The page is too large for the lens.", String(e?.message || e), 502); }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(body);
    const rw = new HTMLRewriter()
      .on("base", { element(el) { el.remove(); } })
      .on("a, area, link", {
        element(el) {
          const v = el.getAttribute("href");
          const n = v && absolutize(v, finalUrl);
          if (n) el.setAttribute("href", n);
          if (el.tagName === "a") el.removeAttribute("target");
        },
      })
      .on("img, script, iframe, embed, source, track, video, audio, input", {
        element(el) {
          for (const attr of ["src", "poster", "data"]) {
            const v = el.getAttribute(attr);
            const n = v && absolutize(v, finalUrl);
            if (n) el.setAttribute(attr, n);
          }
          const ss = el.getAttribute("srcset");
          if (ss) {
            const parts = ss.split(",").map((p) => {
              const t = p.trim().split(/\s+/);
              const n = t[0] && absolutize(t[0], finalUrl);
              return n ? [n, ...t.slice(1)].join(" ") : p;
            });
            el.setAttribute("srcset", parts.join(", "));
          }
        },
      })
      .on("form", {
        element(el) {
          const m = (el.getAttribute("method") || "get").toLowerCase();
          const v = el.getAttribute("action");
          const n = v && absolutize(v, finalUrl);
          if (n && m === "get") {
            el.setAttribute("action", n);
            // A GET submission replaces the action's query string with
            // the form data — the ?u= that routes the lens would be
            // discarded, and every lensed GET form landed on a refusal.
            // Carry u as a hidden field so the submission restores it.
            if (n.startsWith("/lens?")) {
              const u = new URL(n, "https://lens.invalid").searchParams.get("u");
              if (u) {
                const esc = u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
                el.append(`<input type="hidden" name="u" value="${esc}">`, { html: true });
              }
            }
          }
        },
      })
      .on("[style]", {
        element(el) {
          const v = el.getAttribute("style");
          if (v) el.setAttribute("style", rewriteCssUrls(v, finalUrl));
        },
      })
      .on("style", {
        text(t) { t.replace(rewriteCssUrls(t.text, finalUrl)); },
      })
      .on("meta", {
        element(el) {
          const equiv = (el.getAttribute("http-equiv") || "").toLowerCase();
          if (equiv === "refresh") {
            const c = el.getAttribute("content") || "";
            const m = c.match(/url\s*=\s*(.+)$/i);
            const n = m && absolutize(m[1], finalUrl);
            if (n) el.setAttribute("content", c.replace(/url\s*=\s*.+$/i, `url=${n}`));
          }
          if (equiv === "content-security-policy") el.remove();
        },
      });
    const out = rw.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    const headers = new Headers(out.headers);
    for (const [k, v] of Object.entries(baseHeaders)) headers.set(k, v);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("content-security-policy", "sandbox allow-scripts allow-forms allow-popups allow-modals");
    headers.delete("set-cookie");
    return new Response(out.body, { status: 200, headers });
  }

  if (type.includes("text/css")) {
    let body: Uint8Array;
    try { body = await readCapped(res); } catch (e: any) { return refusal("That stylesheet is too large for the lens.", String(e?.message || e), 502); }
    const css = new TextDecoder("utf-8", { fatal: false }).decode(body);
    return new Response(rewriteCssUrls(css, finalUrl), {
      status: 200,
      headers: { ...baseHeaders, "content-type": "text/css; charset=utf-8" },
    });
  }

  const PASS = ["image/", "font/", "application/javascript", "text/javascript", "application/json", "audio/", "video/"];
  if (PASS.some((p) => type.startsWith(p)) || type.includes("font") || type === "") {
    let body: Uint8Array;
    try { body = await readCapped(res); } catch (e: any) { return refusal("That resource is too large for the lens.", String(e?.message || e), 502); }
    return new Response(body, {
      status: 200,
      headers: { ...baseHeaders, "content-type": res.headers.get("content-type") || "application/octet-stream" },
    });
  }

  return refusal(`The lens does not carry ${type.split(";")[0] || "that content type"}.`, "It renders pages, styles, images, fonts and scripts — not downloads or app payloads.", 415);
}
