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
 * frame-src https: (see public/_headers).
 *
 * A refusal cannot be detected from outside the frame — proven in
 * the lab, not assumed: in a credentialless frame a refused page
 * and a loaded page are indistinguishable to the parent (the load
 * event fires for both, every cross-origin probe reads the same,
 * resource timing is zeroed). The room never pretends otherwise.
 * What it does instead: a SEARCH rides the lens from the start
 * (DuckDuckGo refuses framing outright, and the lens always answers
 * with a readable page or a legible refusal — never a silent white
 * box), and every direct framing carries a standing hint strip
 * with the one-click lens route for exactly the blank case.
 *
 * Every navigation the room drives passes the house content guard
 * first (os-content-guard.ts): a listed host — adult, gore, shock —
 * is never requested; the pane shows the refusal plate instead.
 */

import { DEPTH, MAX_NEST } from "./os-depth";
import { guardCheck, type GuardHit } from "./os-content-guard";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The room's search page: the lite DuckDuckGo results sheet. It
 *  refuses framing like the rest of DuckDuckGo, so searches ride
 *  the lens (see door()); lite is also the better reader page —
 *  plain HTML, almost no subresource weight. */
const searchUrl = (q: string): string => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`;

/** What the operator typed, resolved to a destination: a full URL
 *  stays itself, a bare host gains https, anything else is a
 *  search. One resolver for both branches of the room. */
function resolveInput(raw: string): { url: string; isSearch: boolean } | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return { url: v, isSearch: false };
  if (/\.[a-z]{2,}(\/|$)/i.test(v)) return { url: `https://${v}`, isSearch: false };
  return { url: searchUrl(v), isSearch: true };
}

export function buildOrc(body: HTMLElement, arg?: string) {
  const wrap = el("div", "os-orc");
  const hero = el("div", "os-orc-hero");
  const face = document.createElement("img");
  face.src = "/orc/orc-256.png";
  face.alt = "orc";
  const heroText = el("div");
  heroText.append(el("h3", "", "ORC"));
  hero.append(face, heroText);
  const bar = el("div", "os-files-bar");
  const addr = document.createElement("input");
  addr.className = "os-bottle-input";
  addr.style.flex = "1";
  addr.setAttribute("aria-label", "Address");
  addr.placeholder = "address or search";
  const go = el("button", "os-btn", "go");
  const lens = el("button", "os-btn", "lens");
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
    const blockNote = el("p", "os-note");
    blockNote.style.padding = "0 1.2rem";
    wrap.append(hero, bar, floor, blockNote);
    body.appendChild(wrap);
    // The bar drives the frame this room itself stands in. House
    // pages go direct; the wider web rides the lens — at this depth
    // a bare cross-origin navigation dies on the ancestors' COEP
    // wall, and the lens is the door that gets through. The guard
    // stands at this door too: a listed host is never navigated to.
    let lensForcedFloor = false;
    const navigateSelf = (raw: string) => {
      const r = resolveInput(raw);
      if (!r) return;
      addr.value = r.url;
      void guardCheck(r.url).then((hit) => {
        if (hit) {
          blockNote.textContent = `orc doesn't open that — ${hit.host} is on the house blocklist. nothing was requested.`;
          return;
        }
        blockNote.textContent = "";
        let u: URL;
        try { u = new URL(r.url); } catch { return; }
        window.location.href = !lensForcedFloor && u.origin === window.location.origin ? r.url : `/lens?u=${encodeURIComponent(r.url)}`;
      });
    };
    go.addEventListener("click", () => navigateSelf(addr.value));
    lens.addEventListener("click", () => { lensForcedFloor = true; navigateSelf(addr.value); });
    addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigateSelf(addr.value); e.stopPropagation(); });
    if (arg) navigateSelf(arg);
    return;
  }

  // The pane's stage: the frame, and over it the guard's refusal
  // plate. The hint strip sits under the bar — shown after every
  // direct framing, because a refusal cannot be told from a slow
  // page from out here (see the header), and the strip is the way
  // out of the blank case, present exactly when it can happen.
  const stage = el("div", "os-orc-stage");
  const plate = el("div", "os-orc-plate");
  plate.hidden = true;
  const plateInner = el("div", "os-orc-plate-inner");
  const plateText = el("p", "os-orc-plate-text");
  const plateHome = el("button", "os-btn", "house page");
  plateInner.append(plateText, plateHome);
  plate.append(plateInner);
  const hint = el("div", "os-orc-hint");
  hint.hidden = true;
  const hintText = el("span", "os-orc-hint-text", "if the pane stays blank, the site refuses framing.");
  const hintLens = el("button", "os-btn", "open through the lens");
  const hintX = el("button", "os-btn", "×");
  hintX.setAttribute("aria-label", "dismiss");
  hint.append(hintText, hintLens, hintX);
  wrap.append(hero, bar, hint, stage);
  stage.append(plate);
  body.appendChild(wrap);

  const showBlocked = (hit: GuardHit) => {
    plateText.textContent = `orc doesn't open that — ${hit.host} is on the house blocklist (${hit.category === "adult" ? "adult" : "gore and shock"}). nothing was requested.`;
    plate.hidden = false;
  };

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
  // The sandbox is scoped to the FOREIGN door only (audit F-11):
  // a framed stranger gets allow-scripts allow-same-origin
  // allow-forms allow-popups — enough to read and use the page,
  // no top-navigation or download freedom it never needed. House
  // and lens frames are NEVER sandboxed: a sandboxed frame without
  // allow-same-origin gets an opaque origin, which makes the framed
  // page's OWN subresources cross-origin — under the framed OS's
  // COEP its CSS and module scripts then die for want of CORP/CORS
  // slips, and the nest renders as raw static HTML, the exact
  // corpse Chase screenshotted. The lens door carries its own
  // sandbox at the response level, where it belongs.
  let frame: HTMLIFrameElement;
  let frameCredless: boolean | null = null;
  let frameSandboxed: boolean | null = null;
  const mountFrame = (credless: boolean, sandboxed: boolean) => {
    const f = document.createElement("iframe");
    f.className = "os-orc-frame";
    f.setAttribute("title", "orc preview pane");
    if (credless) f.setAttribute("credentialless", "");
    if (sandboxed) f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.addEventListener("load", onFrameLoad);
    // State is assigned BEFORE the element enters the document:
    // an iframe's first about:blank load can dispatch synchronously
    // out of the insertion, and the load handler reads this state —
    // assign-after-append threw exactly once per room open.
    const old = frame;
    frame = f;
    frameCredless = credless;
    frameSandboxed = sandboxed;
    if (old) old.replaceWith(f); else stage.appendChild(f);
  };

  // Links inside a lensed page are rewritten back through the
  // lens, so a link-follow surfaces here as a lens navigation of
  // the SAME frame. The room can read its own lens URLs: re-check
  // the target, and if it names a blocked host, blank the pane and
  // raise the plate. The guard's second door.
  const onFrameLoad = (ev: Event) => {
    // Read the element that actually fired — a stale frame's late
    // load must not judge (or blank) the pane that replaced it.
    const f = ev.currentTarget as HTMLIFrameElement | null;
    if (!f) return;
    const src = f.getAttribute("src") || "";
    if (!src.startsWith("/lens?u=")) return;
    let target = "";
    try { target = new URL(src, window.location.origin).searchParams.get("u") || ""; } catch { return; }
    if (!target) return;
    void guardCheck(target).then((hit) => {
      if (!hit) return;
      if (frame !== f) return; // the pane has a new frame
      if ((frame.getAttribute("src") || "") !== src) return; // …or has moved on
      frame.src = "about:blank";
      showBlocked(hit);
    });
  };

  mountFrame(false, false);

  // Three doors into the pane. Browsers with credentialless frames
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
  // working door, same as Safari. Searches ride the lens on every
  // browser: the search page refuses framing by policy, so the
  // direct door could only ever show the white box.
  const HAS_CREDLESS = "credentialless" in HTMLIFrameElement.prototype && !navigator.userAgent.includes("Firefox");
  interface Door { src: string; credless: boolean; sandboxed: boolean; kind: "house" | "lens" | "foreign"; }
  let lensForced = false;
  const door = (url: string, forceLens = false): Door => {
    let u: URL;
    try { u = new URL(url); } catch { return { src: url, credless: false, sandboxed: false, kind: "house" }; }
    if (u.origin === window.location.origin) return { src: url, credless: false, sandboxed: false, kind: "house" };
    if (HAS_CREDLESS && !lensForced && !forceLens) return { src: url, credless: true, sandboxed: true, kind: "foreign" };
    return { src: `/lens?u=${encodeURIComponent(url)}`, credless: false, sandboxed: false, kind: "lens" };
  };

  let currentUrl = "";
  let navSeq = 0;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  const drive = async (rawInput: string) => {
    const seq = ++navSeq;
    const r = resolveInput(rawInput);
    if (!r) return;
    addr.value = r.url;
    const hit = await guardCheck(r.url);
    if (seq !== navSeq) return; // a newer navigation superseded this one
    if (hit) { hint.hidden = true; showBlocked(hit); return; }
    plate.hidden = true;
    const d = r.isSearch ? door(r.url, true) : door(r.url);
    currentUrl = r.url;
    if (frameCredless !== d.credless || frameSandboxed !== d.sandboxed) mountFrame(d.credless, d.sandboxed);
    frame.src = d.src;
    if (d.kind === "foreign") {
      hint.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.hidden = true; }, 12000);
    } else {
      hint.hidden = true;
    }
  };
  const navigate = (raw: string) => { void drive(raw); };
  go.addEventListener("click", () => navigate(addr.value));
  lens.addEventListener("click", () => { lensForced = true; navigate(addr.value); });
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigate(addr.value); e.stopPropagation(); });
  plateHome.addEventListener("click", () => navigate("https://nosuchmachine.net/"));
  hintLens.addEventListener("click", () => { lensForced = true; if (currentUrl) void drive(currentUrl); });
  hintX.addEventListener("click", () => { hint.hidden = true; clearTimeout(hintTimer); });
  // The starter pane is the house itself (Chase's ruling,
  // 2026-10-24): the room opens on nosuchmachine.net — on the house
  // origin that is the first mirror of the nest.
  navigate(arg || "https://nosuchmachine.net/");
  setTimeout(() => addr.focus(), 80);
}
