/* The house icon set — one hand, one stroke.
 *
 * Every BLACKSITE icon is the same kind of drawing: a 24-unit grid,
 * a 1.6 stroke in the current color, round caps, no fills except
 * pin-dots. They take thinice's ice wherever they stand — thinice
 * is the house's one theme, so the set wears it everywhere. No emoji anywhere: an
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
  bottle: wrap(`<rect x="10.2" y="2.4" width="3.6" height="2.5" rx="0.7"/><path d="M10.5 4.9v3.4c0 1-.3 1.7-1 2.3l-1.2 1.2c-.8.8-1.3 1.8-1.3 3v3.7a2.5 2.5 0 0 0 2.5 2.5h5a2.5 2.5 0 0 0 2.5-2.5v-3.7c0-1.2-.5-2.2-1.3-3l-1.2-1.2c-.7-.6-1-1.3-1-2.3V4.9"/><path d="M9.9 13.9h4.2v4.7H9.9z"/><path d="M11 16.2h2"/>`),
  system: wrap(`<path d="M12 3.2L20 12l-8 8.8L4 12Z"/><path d="M12 8.2l3.6 3.8-3.6 3.8-3.6-3.8Z"/>`),
  chip8: wrap(`<rect x="7" y="7" width="10" height="10" rx="1.6"/><rect x="10.2" y="10.2" width="3.6" height="3.6"/>${pins()}`),
  ruby: wrap(`<path d="M8.2 4.5h7.6l3.7 5L12 20l-7.5-10.5Z"/><path d="M4.5 9.5h15M8.2 4.5L12 9.5l3.8-5M8.5 9.5L12 20l3.5-10.5"/>`),
  ssh: wrap(`<circle cx="8" cy="15.5" r="4.2"/><path d="M11 12.5L19.5 4"/><path d="M16.8 6.7l2.4.4M14.9 8.6l2.3.5"/>`),
  relay: wrap(`${dot(12, 12.4, 1.15)}<path d="M9.2 15.4a4.4 4.4 0 0 1 0-5.8M14.8 9.6a4.4 4.4 0 0 1 0 5.8"/><path d="M6.7 17.9a8.8 8.8 0 0 1 0-10.8M17.3 7.1a8.8 8.8 0 0 1 0 10.8"/>`),
  phantom: wrap(`<path d="M6 20.6V11a6 6 0 0 1 12 0v9.6l-2-1.7-2 1.7-2-1.7-2 1.7Z"/>${dot(9.7, 10.6)}${dot(14.3, 10.6)}`),
  nexuiz: wrap(`<path d="M5.5 20.5v-17L18.5 20.5v-17"/><path d="M5.5 3.5h13"/>`),
  wolf3d: wrap(`<path d="M5 20.5v-11M19 20.5v-11M5 9.5h14M5 20.5h14"/><path d="M5 9.5V6.8h3v2.7M10.5 9.5V6.8h3v2.7M16 9.5V6.8h3v2.7"/><path d="M9.8 20.5v-3.6a2.2 2.2 0 0 1 4.4 0v3.6"/>${dot(12, 13.4, 0.95)}`),
  orc: wrap(`<circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="3.9" ry="8.6"/><path d="M3.9 9h16.2M3.9 15h16.2"/>`),
  sigint: wrap(`<path d="M4.5 20.5h15"/><path d="M6 20.5v-5.5M9.8 20.5V7.5M13.6 20.5v-8.5M17.4 20.5V4.8"/>${dot(17.4, 3.4, 1)}`),
  tv: wrap(`<rect x="3" y="6.5" width="18" height="12.5" rx="1.6"/><path d="M8.2 3.2L12 6.3l3.8-3.1M9.5 21.8h5M12 19v2.8"/><path d="M10.2 9.8l4.6 2.7-4.6 2.7Z"/>`),
  phonehome: wrap(`<path d="M5.2 4.2h3.4l1.4 3.9-2.1 1.6a13.4 13.4 0 0 0 6.4 6.4l1.6-2.1 3.9 1.4v3.4a1.7 1.7 0 0 1-1.9 1.7C10.6 19.8 4.2 13.4 3.5 6.1a1.7 1.7 0 0 1 1.7-1.9Z"/><path d="M15.8 3.8a6.4 6.4 0 0 1 4.4 4.4M18.6 2.6a10.6 10.6 0 0 1 2.8 2.8"/>`),
  simulacrum: wrap(`<circle cx="17.5" cy="6.5" r="1.8"/><path d="M3 19.5l5.2-7.5 3.8 4.6 3-3.9 6 6.8"/><path d="M2.5 19.5h19"/>`),
  bloodbath: wrap(`<path d="M12 3.2c3.4 4.5 5.8 7.9 5.8 10.8a5.8 5.8 0 1 1-11.6 0C6.2 11.1 8.6 7.7 12 3.2z"/><path d="M9.4 14.2a2.8 2.8 0 0 0 2 3.4"/>`),
  wyrdfall: wrap(`<path d="M12 2.4v10.4"/><path d="M8.8 10.6h6.4"/><path d="M12 12.8l-1.5 3.4h3z"/><path d="M2.8 20.6l4.6-4.2 3.1 2.9 3.5-4 7.2 5.3z"/>`),
  games: wrap(`<path d="M3.5 6.8A1.8 1.8 0 0 1 5.3 5h4l2 2.6h7.4a1.8 1.8 0 0 1 1.8 1.8v7.8a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M3.5 10.2h17"/>${dot(12, 14.6, 1.15)}`),
  forensics: wrap(`<path d="M3.5 6.8A1.8 1.8 0 0 1 5.3 5h4l2 2.6h7.4a1.8 1.8 0 0 1 1.8 1.8v7.8a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M3.5 10.2h17"/><circle cx="14.8" cy="14.4" r="3.1"/><path d="M17.2 16.8l2.6 2.6"/>`),
  fxworkbench: wrap(`<path d="M4 20.5h16"/><path d="M6.5 20.5v-4.2h11v4.2"/><path d="M9.5 16.3V9.8a2.5 2.5 0 0 1 5 0v6.5"/><path d="M5 9.5h4M15 9.5h4"/>${dot(12, 6.2, 1.05)}`),
  fxevidence: wrap(`<rect x="5" y="4.5" width="14" height="15.5" rx="1.8"/><path d="M9 4.5V3h6v1.5"/><path d="M9.2 10h5.6M9.2 13.4h5.6"/><path d="M9.2 16.8h3.4"/>`),
  fxhash: wrap(`<path d="M9.5 4.5L8 19.5M16 4.5l-1.5 15M4.8 9h14.7M3.8 15h14.7"/>`),
  fxhex: wrap(`<path d="M12 3.2l7.8 4.5v8.6L12 20.8l-7.8-4.5V7.7Z"/><path d="M12 8v8M8.8 10l6.4 4M15.2 10l-6.4 4"/>`),
  fxfile: wrap(`<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18"/><circle cx="11.2" cy="13.6" r="2.4"/><path d="M13 15.4l2 2"/>`),
  fxmeta: wrap(`<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18"/><path d="M9.8 12.2h4.4M9.8 15h4.4M9.8 17.8h2.6"/>`),
  fximage: wrap(`<rect x="3.5" y="5" width="17" height="14" rx="1.8"/><circle cx="9" cy="9.6" r="1.7"/><path d="M3.5 16.5l4.8-4.3 3.4 3 3-2.6 5.8 5"/>`),
  fxpcap: wrap(`<path d="M4 5.5c4.5 2.6 11.5 2.6 16 0M4 18.5c4.5-2.6 11.5-2.6 16 0"/><path d="M4 5.5v4M20 5.5v4M4 14.5v4M20 14.5v4"/>${dot(8.2, 12, 1)}${dot(12, 12, 1)}${dot(15.8, 12, 1)}`),
  fxstrings: wrap(`<path d="M5 6.5h14M5 12h9M5 17.5h12"/><path d="M16.8 15.2l2.8 2.8"/><circle cx="14.6" cy="12.8" r="2.6"/>`),
  fxtime: wrap(`<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.4 2.2"/><path d="M4.5 3.8L7 5.8M19.5 3.8L17 5.8"/>`),
  fxmail: wrap(`<rect x="3.5" y="5.5" width="17" height="13" rx="1.8"/><path d="M4.5 7.5l7.5 5.4 7.5-5.4"/>`),
  bench: wrap(`<circle cx="12" cy="12" r="6.8"/><path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21"/>${dot(12, 12, 1)}`),
  toolchest: wrap(`<rect x="3.5" y="10.4" width="17" height="9.2" rx="1.6"/><path d="M3.5 10.4a8.5 5.8 0 0 1 17 0"/><path d="M9.4 10.4V8.1A2.6 2.6 0 0 1 12 5.7a2.6 2.6 0 0 1 2.6 2.4v2.3"/><rect x="10.7" y="13.2" width="2.6" height="3.2" rx="0.8"/>`),
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
