/* ————————————————————————————————————————————————————————————————
   BLACKSITE OS — the language register.

   The room speaks English, and — at the operator's word — Japanese.
   One dictionary, one door: every surface that wants a translated
   word asks `t()` with the ENGLISH STRING AS THE KEY, and the
   Japanese table in os-i18n-ja.ts answers. A string the table does
   not carry falls back to the key itself, so an untranslated line
   shows English — never a blank, never a guess. The roster's
   Japanese lives with the roster (each row's descJa, read through
   rosterDesc below), because the roster is data, not code.

   The choice persists in its own register (blacksite-lang-v1),
   notarized by the tripwire like the sound state is, and switching
   is instant: setLang speaks `blacksite:langchange` on the window,
   and the chrome — desktop, titles, taskbar, launcher, the folders,
   settings, help — re-renders from t() on the spot. Rooms already
   open keep the language they were built in until they are opened
   again; their titles switch at once.

   The frost boot's subtitle pool is NOT translated: the boot
   ceremony is exempt by Chase's standing ruling, and the exemption
   holds until he lifts it. Program output, file contents, and the
   wire's own words are data — the register translates the ROOM,
   never what passes through it.
   ———————————————————————————————————————————————————————————————— */
import { skey } from "./os-depth";
import { JA } from "./os-i18n-ja";

export type Lang = "en" | "ja";

const KEY = skey("blacksite-lang-v1");

function load(): Lang {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.lang === "ja") return "ja";
    }
  } catch { /* private modes keep nothing — the room opens in English */ }
  return "en";
}

let current: Lang = load();
const listeners = new Set<(l: Lang) => void>();

export function lang(): Lang { return current; }
export function isJa(): boolean { return current === "ja"; }

/** The one door: English string in, the room's language out. */
export function t(en: string): string {
  if (current === "en") return en;
  return JA[en] ?? en;
}

/** t() with {name} placeholders filled after the lookup. */
export function tf(en: string, vars: Record<string, string | number>): string {
  let out = t(en);
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** A roster row's description in the room's language. */
export function rosterDesc(row: { desc: string; descJa?: string }): string {
  return current === "ja" && row.descJa ? row.descJa : row.desc;
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try {
    const body = JSON.stringify({ lang: next });
    const wireWrite = (window as unknown as { __blacksiteWireWrite?: (s: string, v: string | null) => boolean }).__blacksiteWireWrite;
    if (!wireWrite || !wireWrite("lang", body)) localStorage.setItem(KEY, body);
  } catch { /* private modes keep no notes */ }
  try { document.documentElement.lang = next === "ja" ? "ja" : "en"; } catch { /* no document yet */ }
  for (const fn of listeners) { try { fn(next); } catch { /* one bad ear does not stop the word */ } }
  window.dispatchEvent(new CustomEvent("blacksite:langchange", { detail: { lang: next } }));
}

/** Boot-time: stamp the document's language before the desk builds. */
export function initLang(): void {
  try { document.documentElement.lang = current === "ja" ? "ja" : "en"; } catch { /* no document yet */ }
}
