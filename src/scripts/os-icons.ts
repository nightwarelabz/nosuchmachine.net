/* The house icon set — one hand, one stroke.
 *
 * Every BLACKSITE icon is the same kind of drawing: a 24-unit grid,
 * a 1.6 stroke in the current color, round caps, no fills except
 * pin-dots. They take the theme's color wherever they stand, so the
 * whole set re-skins with the house themes. No emoji anywhere: an
 * icon here is a mark the house drew, not a glyph a vendor shipped.
 */
const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const dot = (cx: number, cy: number, r = 1.05) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
/* spokes for the sun and the gear: lines from r1 to r2 every 45°. */
const spokes = (r1: number, r2: number, step = 45) => {
  let out = "";
  for (let a = 0; a < 360; a += step) {
    const t = (a * Math.PI) / 180;
    const x1 = 12 + r1 * Math.cos(t), y1 = 12 + r1 * Math.sin(t);
    const x2 = 12 + r2 * Math.cos(t), y2 = 12 + r2 * Math.sin(t);
    out += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }
  return out;
};
/* pins on the chip: three per side. */
const pins = () => {
  let out = "";
  for (const p of [9.3, 12, 14.7]) {
    out += `<path d="M${p} 4.4V7M${p} 17v2.6M4.4 ${p}H7M17 ${p}h2.6"/>`;
  }
  return out;
};

export const ICONS: Record<string, string> = {
  terminal: wrap(`<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7.5 9.8l3.3 2.5-3.3 2.5"/><path d="M13 16.2h3.8"/>`),
  files: wrap(`<path d="M3.5 6.8A1.8 1.8 0 0 1 5.3 5h4l2 2.6h7.4a1.8 1.8 0 0 1 1.8 1.8v7.8a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M3.5 10.2h17"/>`),
  file: wrap(`<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18"/>`),
  editor: wrap(`<path d="M4.5 19.5l1.2-4.2L16.6 4.4a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.7 18.3Z"/><path d="M14.8 6.2l2.7 2.7"/>`),
  processes: wrap(`<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${dot(4.6, 6.5, 1.1)}${dot(4.6, 12, 1.1)}${dot(4.6, 17.5, 1.1)}`),
  journal: wrap(`<path d="M5.5 4A1.5 1.5 0 0 1 7 2.5h12V18H7a1.5 1.5 0 0 0-1.5 1.5Z"/><path d="M5.5 19.5V4"/><path d="M9.5 7h6"/>`),
  gauntlet: wrap(`<path d="M4 4l11.5 11.5M20 4L8.5 15.5"/><path d="M13.6 16.8l2.9 2.9M10.4 16.8l-2.9 2.9"/>${dot(17.9, 18.3, 0.95)}${dot(6.1, 18.3, 0.95)}`),
  settings: wrap(`<circle cx="12" cy="12" r="3"/>${spokes(5.4, 8.6)}`),
  help: wrap(`<circle cx="12" cy="12" r="9"/><path d="M9.8 9.2a2.4 2.4 0 1 1 2.8 2.4c-.7.35-1.1.9-1.1 1.9"/>${dot(12, 16.9, 1)}`),
  bottle: wrap(`<circle cx="12" cy="12" r="3.6"/>${spokes(5.9, 8.5)}`),
  system: wrap(`<path d="M12 3.2L20 12l-8 8.8L4 12Z"/><path d="M12 8.2l3.6 3.8-3.6 3.8-3.6-3.8Z"/>`),
  chip8: wrap(`<rect x="7" y="7" width="10" height="10" rx="1.6"/><rect x="10.2" y="10.2" width="3.6" height="3.6"/>${pins()}`),
  ssh: wrap(`<circle cx="8" cy="15.5" r="4.2"/><path d="M11 12.5L19.5 4"/><path d="M16.8 6.7l2.4.4M14.9 8.6l2.3.5"/>`),
  relay: wrap(`${dot(12, 12.4, 1.15)}<path d="M9.2 15.4a4.4 4.4 0 0 1 0-5.8M14.8 9.6a4.4 4.4 0 0 1 0 5.8"/><path d="M6.7 17.9a8.8 8.8 0 0 1 0-10.8M17.3 7.1a8.8 8.8 0 0 1 0 10.8"/>`),
  phantom: wrap(`<path d="M6 20.6V11a6 6 0 0 1 12 0v9.6l-2-1.7-2 1.7-2-1.7-2 1.7Z"/>${dot(9.7, 10.6)}${dot(14.3, 10.6)}`),
  wolf3d: wrap(`<path d="M5 20.5v-11M19 20.5v-11M5 9.5h14M5 20.5h14"/><path d="M5 9.5V6.8h3v2.7M10.5 9.5V6.8h3v2.7M16 9.5V6.8h3v2.7"/><path d="M9.8 20.5v-3.6a2.2 2.2 0 0 1 4.4 0v3.6"/>${dot(12, 13.4, 0.95)}`),
  orc: wrap(`<circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="3.9" ry="8.6"/><path d="M3.9 9h16.2M3.9 15h16.2"/>`),
  bench: wrap(`<circle cx="12" cy="12" r="6.8"/><path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21"/>${dot(12, 12, 1)}`),
  grid: wrap(`<rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/>`),
};

/* An icon as a DOM node: <span class="...">svg</span>. The span's
   class decides the drawn size; the svg takes the span's color.
   One exception, by the house's own choice (Chase, 2026-10-24): orc's
   mark is not a drawing but the pixel orc face he picked as its main
   icon — it rides as an image wherever the set is used. */
export function iconEl(name: string, cls: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  // Chase's ruling (2026-10-24): the orc face is used sparingly — the
  // taskbar, and the orc room's own hero plate (a direct <img> there).
  // Everywhere else (desktop, launcher, window title) orc wears the
  // drawn globe like every other app.
  if (name === "orc" && cls === "os-task-icon") {
    const img = document.createElement("img");
    img.className = "orc-face";
    img.src = "/orc/orc-64.png";
    img.alt = "";
    s.appendChild(img);
    return s;
  }
  s.innerHTML = ICONS[name] || "";
  return s;
}
