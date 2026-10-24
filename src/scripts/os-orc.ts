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
 * Honest physics, named in the room itself: many sites refuse framing
 * (X-Frame-Options / frame-ancestors). Those do not load here — orc
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
    el("p", "os-note", "the house browser. Our version of LibreWolf, wrapped to be installed anywhere — the engine travels with it, so every site stands on the same ground."),
  );
  hero.append(face, heroText);
  const bar = el("div", "os-files-bar");
  const addr = document.createElement("input");
  addr.className = "os-bottle-input";
  addr.style.flex = "1";
  addr.setAttribute("aria-label", "Address");
  addr.placeholder = "https://example.org — or a word to search";
  const go = el("button", "os-btn", "go");
  const out = el("button", "os-btn", "open in your browser");
  bar.append(addr, go, out);
  const frame = document.createElement("iframe");
  frame.className = "os-orc-frame";
  frame.setAttribute("title", "orc preview pane");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
  frame.setAttribute("referrerpolicy", "no-referrer");
  const note = el("p", "os-note",
    "orc is the house browser — our version of LibreWolf, wrapped so you install it once and it carries its own engine: " +
    "nosuchmachine.net and everything else, the same on every machine, with no telemetry and no sponsored anything. " +
    "This room previews pages that allow framing; a page that refuses will stay blank here — that refusal is the site's, " +
    "and orc itself is never refused, because there the page stands top-level.");
  wrap.append(hero, bar, frame, note);
  body.appendChild(wrap);

  let current = "";
  const navigate = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      url = /\.[a-z]{2,}(\/|$)/i.test(url) ? `https://${url}` : `https://duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
    }
    current = url;
    addr.value = url;
    frame.src = url;
  };
  go.addEventListener("click", () => navigate(addr.value));
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") navigate(addr.value); e.stopPropagation(); });
  out.addEventListener("click", () => { if (current) window.open(current, "_blank", "noopener,noreferrer"); });
  // The starter pane is example.org on purpose: it is one of the few
  // well-known pages that permits framing, so the room opens alive.
  // (nosuchmachine.net itself sends frame-ancestors 'none' — the bench
  // cannot be framed even by its own house, which is the correct
  // posture for the site and exactly why orc-the-browser exists.)
  navigate(arg || "https://example.org");
  setTimeout(() => addr.focus(), 80);
}
