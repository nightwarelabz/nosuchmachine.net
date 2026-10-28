/* orc, as a room of the OS.
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

import { DEPTH, MAX_NEST } from "./os-depth";
import { t, tf } from "./os-i18n";

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
  face.alt = "orc";
  const heroText = el("div");
  heroText.append(el("h3", "", t("ORC")));
  hero.append(face, heroText);
  const bar = el("div", "os-files-bar");
  const addr = document.createElement("input");
  addr.className = "os-bottle-input";
  addr.style.flex = "1";
  addr.setAttribute("aria-label", "Address");
  addr.placeholder = t("address or search");
  const go = el("button", "os-btn", t("go"));
  const lens = el("button", "os-btn", t("lens"));
  const get = el("a", "os-btn", "get orc");
  get.setAttribute("href", "https://github.com/nightwarelabz/orc/releases/latest");
  get.setAttribute("target", "_blank");
  get.setAttribute("rel", "noreferrer");
  bar.append(addr, go, lens, get);
  if (DEPTH >= 1) bar.append(el("span", "os-note", `nest ${DEPTH}`));
  // The hall has a floor: at MAX_NEST the room stops framing and
  // says so, rather than melting the browser one mirror later.
  if (DEPTH >= MAX_NEST) {
    const floor = el("p", "os-note", `the mirrors end here — ${MAX_NEST} nests deep is where physics collects. there is no pane left to frame another page in — but the address bar is not dead: it drives THIS frame, and what you open replaces the room you are standing in (one mirror up, the desk is as you left it). orc standalone starts fresh at the surface.`);
    floor.style.padding = "1.2rem";
    wrap.append(hero, bar, floor);
    body.appendChild(wrap);
    // The bar drives the frame this room itself stands in. House
    // pages go direct; the wider web rides the lens — at this depth
    // a bare cross-origin navigation dies on the ancestors' COEP
    // wall, and the lens is the door that gets through.
    let lensForcedFloor = false;
    const navigateSelf = (raw: string) => {
      let url = raw.trim();
      if (!url) return;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        url = /\.[a-z]{2,}(\/|$)/i.test(url) ? `https://${url}` : `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
      }
      // scheme law: only http and https ever navigate. A typed or
      // handed-in javascript:/data:/file: URL is not a navigation —
      // it is a search for those words.
      if (!/^https?:/i.test(url)) url = `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
      addr.value = url;
      let u: URL;
      try { u = new URL(url); } catch { return; }
      window.location.href = !lensForcedFloor && u.origin === window.location.origin ? url : `/lens?u=${encodeURIComponent(url)}`;
    };
    go.addEventListener("click", () => navigateSelf(addr.value));
    lens.addEventListener("click", () => { lensForcedFloor = true; navigateSelf(addr.value); });
    addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigateSelf(addr.value); e.stopPropagation(); });
    if (arg) navigateSelf(arg);
    return;
  }
  // The frame's credentialless-ness is a property of the DOOR, not
  // of the room, and the element is rebuilt whenever a navigation
  // crosses doors (the attribute is read at navigation start).
  //
  // Cross-origin direct frames need it: the OS page rides COEP
  // require-corp (phantom's SharedArrayBuffer ring), and a plain
  // cross-origin frame without COEP headers of its own is blocked
  // by that policy — "refused to connect". Credentialless is the
  // sanctioned waiver: the framed page loads in an ephemeral,
  // cookie-less context and owes no COEP headers.
  //
  // House pages and lens pages ride PLAIN frames — they are
  // same-origin and owe no waiver. This is also what lets the
  // mirrors compose: credentialless does not nest in Chromium (a
  // credentialless frame's own credentialless child loses the
  // waiver, and the depth-2 OS load died silently with the pane
  // frozen on its previous page — proven live, 2026-10-24). A nest
  // in a plain frame is an ordinary same-origin document, so its
  // own orc room starts from surface physics again.
  //
  // NO sandbox attribute, ever — deliberately. A sandboxed frame
  // without allow-same-origin gets an opaque origin, which makes
  // the framed page's OWN subresources cross-origin: under the
  // framed OS's COEP its CSS and module scripts then die for want
  // of CORP/CORS slips, and the nest renders as raw static HTML —
  // the exact corpse Chase screenshotted. The lens door carries
  // its own sandbox at the response level, where it belongs.
  let frame: HTMLIFrameElement;
  let frameCredless: boolean | null = null;
  const mountFrame = (credless: boolean) => {
    const f = document.createElement("iframe");
    f.className = "os-orc-frame";
    f.setAttribute("title", "orc preview pane");
    if (credless) f.setAttribute("credentialless", "");
    f.setAttribute("referrerpolicy", "no-referrer");
    if (frame) frame.replaceWith(f); else wrap.appendChild(f);
    frame = f;
    frameCredless = credless;
  };
  wrap.append(hero, bar);
  mountFrame(false);
  body.appendChild(wrap);

  // Two doors into the pane. Browsers with credentialless frames
  // (Chromium) frame the web directly — full fidelity. Browsers
  // without (Safari supports neither credentialless frames nor COEP
  // credentialless, so this page's isolation wall blacks out every
  // framed site) go through the house lens instead: /lens fetches
  // the page from this origin and rewrites it to stay framed.
  // House pages frame directly on every browser — same-origin loads
  // owe no COEP slip, which is also what makes the recursion work.
  // Gecko advertises the credentialless attribute but its frames
  // still die on this page's COEP wall (NS_ERROR_DOM_COEP_FAILED,
  // seen in orc standalone 2026-10-24) — for Gecko the lens is the
  // working door, same as Safari.
  const HAS_CREDLESS = "credentialless" in HTMLIFrameElement.prototype && !navigator.userAgent.includes("Firefox");
  let lensForced = false;
  const door = (url: string): { src: string; credless: boolean } => {
    let u: URL;
    try { u = new URL(url); } catch { return { src: url, credless: false }; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { src: `/lens?u=${encodeURIComponent(url)}`, credless: false };
    if (u.origin === window.location.origin) return { src: url, credless: false };
    if (HAS_CREDLESS && !lensForced) return { src: url, credless: true };
    return { src: `/lens?u=${encodeURIComponent(url)}`, credless: false };
  };

  const navigate = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      url = /\.[a-z]{2,}(\/|$)/i.test(url) ? `https://${url}` : `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
    }
    if (!/^https?:/i.test(url)) url = `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
    addr.value = url;
    const d = door(url);
    if (frameCredless !== d.credless) mountFrame(d.credless);
    frame.src = d.src;
  };
  go.addEventListener("click", () => navigate(addr.value));
  lens.addEventListener("click", () => { lensForced = true; navigate(addr.value); });
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigate(addr.value); e.stopPropagation(); });
  // The starter pane is the house itself (Chase's ruling,
  // 2026-10-24): the room opens on nosuchmachine.net — on the house
  // origin that is the first mirror of the nest.
  navigate(arg || "https://nosuchmachine.net/");
  setTimeout(() => addr.focus(), 80);
}
