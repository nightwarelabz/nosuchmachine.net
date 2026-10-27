/* SIGINT air picture — live air traffic, heard and never spoken to.
 *
 * The bench's fifth source, and the quietest kind of intercept:
 * aircraft broadcast their own positions (ADS-B), a worldwide
 * federation of ground receivers collects them, and the community
 * exchange (api.adsb.lol) publishes the picture. This panel reads
 * it — through the house edge (/api/air), because the feed sends no
 * CORS headers — and draws it: a north-up scope over a watch point,
 * the traffic table beneath, and a click to grade a contact into
 * the bench's intercept registry, the same ledger the decoders
 * write to.
 *
 * Listening only, by construction: the panel can fetch the feed
 * and nothing else; there is no transmit path here to switch off.
 * The fetch is wire contact all the same — an outbound request,
 * the class the Standard gates as "active" — so EMCON bravo and
 * alpha refuse it in the Standard's own words, and a watch already
 * running stands down if the condition rises.
 */

export interface AirHooks {
  status: (text: string) => void;
  intercept: (text: string) => void;
}

export interface AirSource {
  panel: HTMLElement;
  activate: () => void;
  deactivate: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* The EMCON gate, read off the same chip the live-stations source
 * reads — bravo and alpha refuse wire contact, identically. */
const emconLevel = (): string =>
  document.getElementById("os-emcon-chip")?.dataset.level ?? "open";
const gateRefusal = (): string | null => {
  const lvl = emconLevel();
  if (lvl === "alpha") return "the Standard forbids this: emcon alpha is total silence — no wire contact at all.";
  if (lvl === "bravo") return "the Standard forbids this: emcon bravo is receive-only — the air feed is wire contact, and it stands down.";
  return null;
};

interface Ac {
  hex?: string; flight?: string; r?: string; t?: string; desc?: string;
  alt_baro?: number | string; gs?: number; track?: number;
  baro_rate?: number; squawk?: string; lat?: number; lon?: number;
}
interface Contact extends Ac {
  distNm: number; brg: number; call: string;
}

/* The default watch point is the geographic centre of the
 * contiguous United States — a neutral empty chair, nobody's home.
 * The operator moves it with the lat/lon fields or the location
 * button (which asks only when clicked, never on open). */
const DEFAULT_WATCH = { lat: 39.8, lon: -98.5 };
const EMERGENCY: Record<string, string> = { "7500": "hijack", "7600": "radio failure", "7700": "emergency" };

const toRad = (d: number) => (d * Math.PI) / 180;
function distBrg(lat1: number, lon1: number, lat2: number, lon2: number): { nm: number; brg: number } {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const nm = 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { nm, brg };
}
const fmtAlt = (a: number | string | undefined): string =>
  a === undefined ? "—" : a === "ground" ? "ground" : `${Math.round(a as number).toLocaleString()} ft`;
const fmtNum = (v: number | undefined, unit: string): string =>
  typeof v === "number" ? `${Math.round(v)}${unit}` : "—";

export function createAirSource(hooks: AirHooks): AirSource {
  const panel = el("div", "os-live");
  panel.hidden = true;

  const headRow = el("div", "os-sigint-copyhead");
  headRow.append(
    el("h4", "", "AIR — LIVE TRAFFIC"),
    el("span", "os-note", "ads-b exchange feed (api.adsb.lol) · receive only — the bench transmits nothing"),
  );
  const bar = el("div", "os-live-bar");
  const latIn = document.createElement("input");
  latIn.className = "os-air-num"; latIn.value = DEFAULT_WATCH.lat.toFixed(2);
  latIn.setAttribute("aria-label", "Watch point latitude");
  const lonIn = document.createElement("input");
  lonIn.className = "os-air-num"; lonIn.value = DEFAULT_WATCH.lon.toFixed(2);
  lonIn.setAttribute("aria-label", "Watch point longitude");
  const myLoc = el("button", "os-btn", "my location");
  const rangeSel = document.createElement("select");
  rangeSel.className = "os-sigint-sel";
  rangeSel.setAttribute("aria-label", "Range in nautical miles");
  for (const nm of [10, 25, 50, 100, 250]) {
    const o = document.createElement("option");
    o.textContent = `${nm} nm`; o.value = String(nm); rangeSel.appendChild(o);
  }
  rangeSel.value = "50";
  const refreshBtn = el("button", "os-btn", "refresh");
  bar.append(el("span", "os-note", "lat"), latIn, el("span", "os-note", "lon"), lonIn, myLoc, el("span", "os-note", "range"), rangeSel, refreshBtn);
  const note = el("p", "os-note os-live-note",
    `watch point ${DEFAULT_WATCH.lat.toFixed(2)}, ${DEFAULT_WATCH.lon.toFixed(2)} — the centre of the contiguous US, a default, not a home. Set your own above.`);
  const scope = document.createElement("canvas");
  scope.className = "os-air-scope"; scope.width = 560; scope.height = 560;
  scope.setAttribute("aria-label", "Air traffic scope, north up");
  const table = el("table", "os-sigint-reg os-air-table");
  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  for (const h of ["callsign", "hex", "type", "alt", "spd", "trk", "v/s", "squawk", "dist", "brg"]) {
    const th = document.createElement("th"); th.textContent = h; headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);
  panel.append(headRow, bar, note, scope, table);
  const sx = scope.getContext("2d")!;

  let watch = { ...DEFAULT_WATCH };
  let range = 50;
  let contacts: Contact[] = [];
  let poll = 0, emconTick = 0, active = false;
  let lastAt = 0;

  const drawScope = () => {
    const W = scope.width, H = scope.height, cx = W / 2, cy = H / 2, R = W / 2 - 8;
    sx.fillStyle = "#020604"; sx.fillRect(0, 0, W, H);
    sx.strokeStyle = "rgba(120,255,170,0.25)"; sx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3, 1]) { sx.beginPath(); sx.arc(cx, cy, R * f, 0, Math.PI * 2); sx.stroke(); }
    sx.beginPath(); sx.moveTo(cx - R, cy); sx.lineTo(cx + R, cy); sx.moveTo(cx, cy - R); sx.lineTo(cx, cy + R); sx.stroke();
    sx.fillStyle = "rgba(230,255,240,0.7)"; sx.font = "12px monospace";
    sx.fillText("N", cx - 3, 16);
    sx.fillText(`${range} nm`, 8, H - 8);
    sx.fillStyle = "#7dffa8"; sx.fillRect(cx - 2, cy - 2, 4, 4);
    contacts.forEach((c, i) => {
      if (c.distNm > range) return;
      const th = toRad(c.brg), rr = (c.distNm / range) * R;
      const x = cx + Math.sin(th) * rr, y = cy - Math.cos(th) * rr;
      const emg = c.squawk && EMERGENCY[c.squawk];
      sx.fillStyle = emg ? "#ff5f56" : "#7dffa8";
      sx.beginPath(); sx.arc(x, y, 3, 0, Math.PI * 2); sx.fill();
      if (i < 5 || emg) {
        sx.fillStyle = emg ? "#ff5f56" : "rgba(230,255,240,0.85)";
        sx.fillText(c.call || c.hex || "?", x + 6, y + 3);
      }
    });
  };

  const renderTable = () => {
    const rows = contacts.slice(0, 40).map((c) => {
      const tr = document.createElement("tr");
      const emg = c.squawk && EMERGENCY[c.squawk];
      if (emg) tr.className = "os-air-emg";
      const cells = [
        c.call || "—", c.hex || "—", c.t || "—", fmtAlt(c.alt_baro),
        fmtNum(c.gs, " kt"), typeof c.track === "number" ? `${Math.round(c.track)}°` : "—",
        typeof c.baro_rate === "number" ? `${c.baro_rate > 0 ? "+" : ""}${Math.round(c.baro_rate)}` : "—",
        emg ? `${c.squawk} ${EMERGENCY[c.squawk!]}` : (c.squawk || "—"),
        `${c.distNm.toFixed(1)} nm`, `${Math.round(c.brg)}°`,
      ];
      for (const cell of cells) { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); }
      tr.addEventListener("click", () => {
        const parts = [
          c.call || c.hex || "unknown contact",
          c.t ? `type ${c.t}` : "",
          fmtAlt(c.alt_baro),
          typeof c.gs === "number" ? `${Math.round(c.gs)} kt` : "",
          `${c.distNm.toFixed(1)} nm / ${String(Math.round(c.brg)).padStart(3, "0")}°`,
          c.squawk ? `squawk ${c.squawk}${emg ? ` — ${EMERGENCY[c.squawk]}` : ""}` : "",
        ].filter(Boolean).join(" · ");
        hooks.intercept(`${parts} · ads-b`);
        hooks.status(`air: graded ${c.call || c.hex || "a contact"} into the intercept registry`);
      });
      return tr;
    });
    tbody.replaceChildren(...rows);
  };

  const fetchOnce = async () => {
    const refusal = gateRefusal();
    if (refusal) { standDown(refusal); return; }
    try {
      const r = await fetch(`/api/air?lat=${watch.lat}&lon=${watch.lon}&dist=${range}`, { headers: { Accept: "application/json" } });
      const data = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; ac?: Ac[] } | null;
      if (!r.ok || !data?.ok || !Array.isArray(data.ac)) {
        note.textContent = data?.error || `the air feed answered HTTP ${r.status} — the scope keeps its last picture, and says so.`;
        return;
      }
      contacts = data.ac
        .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
        .map((a) => {
          const { nm, brg } = distBrg(watch.lat, watch.lon, a.lat!, a.lon!);
          return { ...a, distNm: nm, brg, call: (a.flight || "").trim() };
        })
        .sort((x, y) => x.distNm - y.distNm);
      lastAt = Date.now();
      note.textContent = `${contacts.length} aircraft within ${range} nm of ${watch.lat.toFixed(2)}, ${watch.lon.toFixed(2)} · updated ${new Date(lastAt).toLocaleTimeString()} · receive only`;
      drawScope();
      renderTable();
    } catch {
      note.textContent = "the air feed did not answer — the scope keeps its last picture, and says so.";
    }
  };

  const readControls = () => {
    const la = parseFloat(latIn.value), lo = parseFloat(lonIn.value);
    if (Number.isFinite(la) && la >= -90 && la <= 90 && Number.isFinite(lo) && lo >= -180 && lo <= 180) {
      watch = { lat: la, lon: lo };
    } else {
      latIn.value = watch.lat.toFixed(2); lonIn.value = watch.lon.toFixed(2);
      note.textContent = "that watch point is not on the earth — lat −90…90, lon −180…180. The watch did not move.";
      return false;
    }
    range = Number(rangeSel.value) || 50;
    return true;
  };

  const standDown = (why: string) => {
    window.clearInterval(poll); poll = 0;
    note.textContent = why;
    hooks.status(why);
  };

  myLoc.addEventListener("click", () => {
    if (!navigator.geolocation) { note.textContent = "this browser offers no location — type a watch point instead."; return; }
    note.textContent = "asking the browser for your position…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latIn.value = pos.coords.latitude.toFixed(2);
        lonIn.value = pos.coords.longitude.toFixed(2);
        if (readControls() && active) void fetchOnce();
      },
      () => { note.textContent = "the browser would not give a position — type a watch point instead. Nothing was sent anywhere."; },
      { timeout: 10000 },
    );
  });
  refreshBtn.addEventListener("click", () => { if (readControls() && active) void fetchOnce(); });
  rangeSel.addEventListener("change", () => { if (readControls() && active) void fetchOnce(); });
  for (const inp of [latIn, lonIn]) {
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && readControls() && active) void fetchOnce();
    });
  }

  drawScope();

  return {
    panel,
    activate: () => {
      panel.hidden = false;
      active = true;
      const refusal = gateRefusal();
      if (refusal) { note.textContent = refusal; hooks.status(refusal); return; }
      void fetchOnce();
      window.clearInterval(poll);
      poll = window.setInterval(() => { void fetchOnce(); }, 10000);
      window.clearInterval(emconTick);
      emconTick = window.setInterval(() => {
        if (!active) return;
        const r2 = gateRefusal();
        if (r2 && poll) standDown(r2);
      }, 1000);
    },
    deactivate: () => {
      active = false;
      window.clearInterval(poll); poll = 0;
      window.clearInterval(emconTick); emconTick = 0;
      panel.hidden = true;
    },
  };
}
