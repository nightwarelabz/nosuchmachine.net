/* orc — the house browser, as a room of the OS.
 *
 * orc proper is a standalone, installable browser: our own version of
 * LibreWolf (Gecko engine, MPL-2.0) wrapped in the Nightware wraparound
 * system, so the engine ships with the browser and Blacksite behaves
 * identically on every machine — browser-neutral by construction.
 * Its design and policy layer live in the orc project; this room is
 * the door to it from inside the OS, and a working preview pane for
 * pages that allow being framed.
 *
 * Honest physics, named in the room itself: the OS page rides COEP
 * require-corp (phantom's SharedArrayBuffer ring), so the preview
 * frame is credentialless — the framed page loads cookie-less and
 * owes no COEP headers. Sites that refuse framing outright
 * (X-Frame-Options / frame-ancestors) still do not load here — orc
 * the browser has no such limit, because there the page is top-level.
 * The OS shell widens its own CSP for this room's scope with
 * frame-src https: (see public/_headers). */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildOrc(body: HTMLElement, arg?: string) {
  const wrap = el("div", "os-orc");
  const hero = el("div", "os-orc-hero");
  const face = document.createElement("img");
  face.src = "/orc/orc-256.png";
  face.alt = "orc — the pixel orc, orc's mark";
  const heroText = el("div");
  heroText.append(
    el("h3", "", "ORC — Orchestration"),
    el("p", "os-note", "the house browser."),
  );
  hero.append(face, heroText);
  const bar = el("div", "os-files-bar");
  const addr = document.createElement("input");
  addr.className = "os-bottle-input";
  addr.style.flex = "1";
  addr.setAttribute("aria-label", "Address");
  addr.placeholder = "address or search";
  const go = el("button", "os-btn", "go");
  const get = el("a", "os-btn", "get orc");
  get.setAttribute("href", "https://github.com/nightwarelabz/orc/releases/latest");
  get.setAttribute("target", "_blank");
  get.setAttribute("rel", "noreferrer");
  bar.append(addr, go, get);
  const frame = document.createElement("iframe");
  frame.className = "os-orc-frame";
  frame.setAttribute("title", "orc preview pane");
  // The OS page itself rides COEP require-corp (phantom's
  // SharedArrayBuffer ring demands cross-origin isolation), and a
  // plain cross-origin frame without COEP headers of its own is
  // blocked by that policy — "refused to connect". The credentialless
  // attribute is the sanctioned door: the framed page loads in an
  // ephemeral, cookie-less context and owes no COEP headers. Sites
  // that forbid framing outright still refuse, and browsers without
  // credentialless frames are the only door in; there is no
  // open-out button by Chase's ruling — orc proper, or your own
  // browser, is where pages live top-level.
  frame.setAttribute("credentialless", "");
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  frame.setAttribute("referrerpolicy", "no-referrer");
  wrap.append(hero, bar, frame);
  body.appendChild(wrap);

  // Two doors into the pane. Browsers with credentialless frames
  // (Chromium) frame the web directly — full fidelity. Browsers
  // without (Safari supports neither credentialless frames nor COEP
  // credentialless, so this page's isolation wall blacks out every
  // framed site) go through the house lens instead: /lens fetches
  // the page from this origin and rewrites it to stay framed.
  // House pages frame directly on every browser — same-origin loads
  // owe no COEP slip, which is also what makes the recursion work.
  const HAS_CREDLESS = "credentialless" in HTMLIFrameElement.prototype;
  const paneUrl = (url: string): string => {
    let u: URL;
    try { u = new URL(url); } catch { return url; }
    if (u.origin === window.location.origin) return url;
    if (HAS_CREDLESS) return url;
    return `/lens?u=${encodeURIComponent(url)}`;
  };

  const navigate = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      url = /\.[a-z]{2,}(\/|$)/i.test(url) ? `https://${url}` : `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
    }
    addr.value = url;
    frame.src = paneUrl(url);
  };
  go.addEventListener("click", () => navigate(addr.value));
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigate(addr.value); e.stopPropagation(); });
  // The starter pane is example.org on purpose: it permits framing
  // everywhere (and through the lens where framing is walled), so the
  // room opens alive on every browser.
  navigate(arg || "https://example.org");
  setTimeout(() => addr.focus(), 80);
}
