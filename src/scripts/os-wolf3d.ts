/* Wolfenstein 3D — the shareware episode, running in a DOS machine
 * in the room. The player is js-dos (DOSBox in WebAssembly, GPL-2.0),
 * vendored self-hosted under /wolf3d/ — no CDN is contacted. The game
 * data is the unaltered 1992 shareware distribution (episode 1, v1.4),
 * which its own license grants the right to copy and distribute; the
 * full story is in /wolf3d/NOTICE.txt.
 *
 * House pattern follows the CHIP-8 console: a stage, a status line,
 * and a MutationObserver that stops the machine when the window
 * leaves the desk. */

declare global {
  interface Window { Dos?: (el: HTMLElement, opts: Record<string, unknown>) => { stop: () => Promise<void> } }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let playerLoading: Promise<void> | null = null;
function loadPlayer(): Promise<void> {
  if (window.Dos) return Promise.resolve();
  if (playerLoading) return playerLoading;
  playerLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-wolf-css]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/wolf3d/js-dos.css";
      css.dataset.wolfCss = "1";
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = "/wolf3d/js-dos.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("the js-dos player did not load"));
    document.head.appendChild(s);
  });
  return playerLoading;
}

export function buildWolf3d(body: HTMLElement) {
  const wrap = el("div", "os-wolf3d");
  const stage = el("div", "os-wolf-stage");
  const status = el("p", "os-note", "warming up the DOS machine…");
  const bar = el("div", "os-files-bar");
  const full = el("button", "os-btn small", "fullscreen");
  full.addEventListener("click", () => { void stage.requestFullscreen?.().catch(() => undefined); });
  const notice = el("a", "os-btn small", "license & notice");
  notice.setAttribute("href", "/wolf3d/NOTICE.txt");
  notice.setAttribute("target", "_blank");
  notice.setAttribute("rel", "noreferrer");
  bar.append(full, notice);
  const keys = el("p", "os-note",
    "Wolfenstein 3D — shareware episode 1 (1992), unaltered, running on DOSBox in this tab. " +
    "Move: arrow keys · fire: Ctrl · open doors: Space · strafe: Alt · run: Shift · weapons: 1–4. " +
    "On touch screens the player raises its own pad and keys. Saves stay in this browser.");
  wrap.append(bar, stage, status, keys);
  body.appendChild(wrap);

  let dos: { stop: () => Promise<void> } | null = null;
  let dead = false;
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      dead = true;
      obs.disconnect();
      if (dos) void dos.stop().catch(() => undefined);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  void loadPlayer().then(() => {
    if (dead) return;
    if (!window.Dos) { status.textContent = "the player loaded without its Dos — the machine stays dark."; return; }
    status.textContent = "DOS machine running — click the screen, then play. First boot takes a few seconds.";
    dos = window.Dos(stage, {
      url: "/wolf3d/wolf3d.jsdos",
      pathPrefix: "/wolf3d/emulators/",
      autoStart: true,
      noCloud: true,
      backend: "dosbox",
    });
  }).catch((err: Error) => {
    status.textContent = `the DOS machine would not start — ${err.message}`;
  });
}
