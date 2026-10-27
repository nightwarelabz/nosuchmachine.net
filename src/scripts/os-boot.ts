import { createFrostPlate, type FrostPlate } from "./os-boot-frost";

export type BootStyle = "thinice" | "classic";
export const BOOT_STYLE_KEY = "blacksite-boot-style-v1";

export function preferredBootStyle(storageKey = BOOT_STYLE_KEY): BootStyle {
  try { return localStorage.getItem(storageKey) === "classic" ? "classic" : "thinice"; }
  catch { return "thinice"; }
}
/** URL selection is temporary; Settings and the fallback button remember it. */
export function bootStyle(storageKey = BOOT_STYLE_KEY): BootStyle {
  const override = new URLSearchParams(window.location.search).get("boot");
  if (override === "classic" || override === "thinice") return override;
  return preferredBootStyle(storageKey);
}
export function rememberBootStyle(style: BootStyle, storageKey = BOOT_STYLE_KEY): void {
  try { localStorage.setItem(storageKey, style); } catch { /* a private room can still start */ }
}

interface BootOptions {
  overlay: HTMLElement;
  lines: string[];
  depth: number;
  emcon: string;
  storageKey: string;
  onReady: () => void;
}

/** Presentation only: the caller still owns registration, restoration and sound. */
export function startBootSequence({ overlay, lines, depth, emcon, storageKey, onReady }: BootOptions): void {
  const classic = overlay.querySelector<HTMLElement>("#os-boot-classic");
  const cold = overlay.querySelector<HTMLElement>("#os-boot-thinice");
  const text = overlay.querySelector<HTMLElement>("#os-boot-text");
  const announcement = overlay.querySelector<HTMLElement>("#os-boot-announcement");
  const listeners = new AbortController();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const blocked = [...(overlay.parentElement?.querySelectorAll<HTMLElement>(".os-desktop, .os-taskbar") || [])].map((node) => ({ node, inert: node.inert }));
  for (const { node } of blocked) node.inert = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let plate: FrostPlate | undefined;
  let finished = false;
  const disposePlate = () => { plate?.dispose(); plate = undefined; };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer); clearTimeout(watchdog);
    // Keep the last ice frame through the fade; stop all work immediately.
    const endingPlate = plate;
    plate = undefined;
    listeners.abort();
    const hadFocus = overlay.contains(document.activeElement);
    overlay.classList.add("done");
    cold?.classList.add("leaving");
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    for (const { node, inert } of blocked) node.inert = inert;
    try { onReady(); }
    finally {
      if (hadFocus && (overlay.contains(document.activeElement) || document.activeElement === document.body)) document.getElementById("os-start")?.focus({ preventScroll: true });
      setTimeout(() => { endingPlate?.dispose(); overlay.remove(); }, reduced ? 0 : 650);
    }
  };
  // Effects, a suspended tab or repeated input must never strand the desktop.
  const watchdog = setTimeout(finish, depth === 0 ? 7000 : 2200);
  const show = (style: BootStyle) => {
    overlay.dataset.boot = style;
    if (classic) classic.hidden = style !== "classic";
    if (cold) cold.hidden = style !== "thinice";
  };
  const runClassic = () => {
    if (finished) return;
    const hadColdFocus = cold?.contains(document.activeElement);
    clearTimeout(timer); disposePlate(); show("classic");
    if (hadColdFocus) classic?.querySelector<HTMLButtonElement>("[data-boot-skip]")?.focus({ preventScroll: true });
    if (!text) { finish(); return; }
    text.textContent = "";
    if (announcement) announcement.textContent = "Starting BLACKSITE OS with classic boot.";
    let i = 0;
    const tick = () => {
      if (finished) return;
      if (i < lines.length) {
        text.textContent += (i ? "\n" : "") + lines[i++];
        timer = setTimeout(tick, reduced ? 0 : Math.max(12, Math.round(110 / (depth + 1))));
      } else timer = setTimeout(finish, reduced ? 80 : 420);
    };
    tick();
  };

  for (const button of overlay.querySelectorAll<HTMLButtonElement>("[data-boot-skip]")) button.addEventListener("click", finish, { signal: listeners.signal });
  overlay.querySelector("[data-boot-classic]")?.addEventListener("click", () => { rememberBootStyle("classic", storageKey); runClassic(); }, { signal: listeners.signal });
  overlay.querySelector<HTMLButtonElement>("[data-boot-thinice]")?.addEventListener("click", (event) => {
    rememberBootStyle("thinice", storageKey);
    (event.currentTarget as HTMLButtonElement).textContent = "Thinice selected";
    if (announcement) announcement.textContent = "Thinice selected for the next boot.";
  }, { signal: listeners.signal });
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key === "Escape" || (event.key === "Enter" && !(event.target instanceof HTMLButtonElement))) {
      event.preventDefault(); event.stopImmediatePropagation(); finish();
    }
  }, { capture: true, signal: listeners.signal });
  window.addEventListener("pagehide", finish, { once: true, signal: listeners.signal });

  if (bootStyle(storageKey) === "classic" || !cold) { runClassic(); return; }
  try {
    show("thinice");
    const canvas = overlay.querySelector<HTMLCanvasElement>("#os-boot-frost");
    const stage = overlay.querySelector<HTMLElement>("#os-boot-stage");
    const detail = overlay.querySelector<HTMLElement>("#os-boot-detail");
    const percent = overlay.querySelector<HTMLElement>("#os-boot-percent");
    const progress = overlay.querySelector<HTMLElement>("#os-boot-progress");
    if (!canvas || !stage || !detail || !percent || !progress) throw new Error("Cold start unavailable");
    // Reduced motion is a static ice plate and a brief cross to the desktop.
    plate = createFrostPlate(canvas);
    const depthLabel = overlay.querySelector("#os-boot-depth");
    if (depthLabel) depthLabel.textContent = depth === 0 ? "SURFACE 00" : `NEST ${String(depth).padStart(2, "0")} · VOLATILE`;
    const emconLabel = overlay.querySelector("#os-boot-emcon");
    if (emconLabel) emconLabel.textContent = `EMCON ${emcon.toUpperCase()}`;
    const phases = ["ESTABLISHING THE SURFACE", "MOUNTING THE LOCAL FILESYSTEM", "BRINGING THE RUNTIME ONLINE", "BLACKSITE IS NOW LIVE"];
    const details = [lines[0], lines[2], lines[3], `${lines[4]} · ${lines[5]}`];
    const checkpoints = [...overlay.querySelectorAll<HTMLElement>("[data-boot-checkpoint]")];
    const duration = reduced ? 420 : depth === 0 ? 4400 : Math.max(160, 680 / depth);
    const start = performance.now();
    let previousPhase = -1;
    cold.classList.add("frosted");
    const tick = () => {
      if (finished) return;
      try {
        const fraction = Math.min(1, (performance.now() - start) / duration);
        const shown = reduced ? 1 : fraction;
        const value = Math.floor(shown * 100);
        const phase = Math.min(3, Math.floor(shown * 4));
        cold.style.setProperty("--cold-progress", String(shown));
        percent.replaceChildren(document.createTextNode(String(value).padStart(3, "0")), Object.assign(document.createElement("span"), { textContent: "%" }));
        progress.setAttribute("aria-valuenow", String(value));
        plate?.reveal(reduced ? 1 : Math.min(1, fraction * 1.25));
        if (phase !== previousPhase) {
          stage.textContent = `${String(phase + 1).padStart(2, "0")} · ${phases[phase]}`;
          detail.textContent = details[phase] || "blacksite sh · ready";
          for (const [index, checkpoint] of checkpoints.entries()) checkpoint.toggleAttribute("data-active", index <= phase);
          if (announcement) announcement.textContent = phases[phase];
          previousPhase = phase;
        }
        if (fraction === 1) { cold.classList.add("leaving"); timer = setTimeout(finish, reduced || depth > 0 ? 0 : 180); }
        else timer = setTimeout(tick, reduced ? duration : 40);
      } catch { runClassic(); }
    };
    tick();
  } catch { runClassic(); }
}
