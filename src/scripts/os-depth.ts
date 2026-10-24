/* ————————————————————————————————————————————————————————————————
   BLACKSITE OS — nest depth & mirror discipline.

   The house frames itself (the orc room), so the OS must know when
   it is a mirror: which reflection down the hall it is, and how to
   behave there. Three laws keep the hall of mirrors habitable:

   1. THE SURFACE OWNS THE STORAGE. Depth 0 reads and writes the
      real keys, exactly as before. Every nest (depth >= 1) gets its
      own namespaced keys — blacksite-nest-<instance>-<key> — with a
      per-boot random instance, so mirrors never share a session,
      never restore the surface's windows (that way lies an infinite
      regress of orc windows opening orc windows), and never fight
      each other. Nests are volatile: the surface sweeps orphaned
      nest keys on its own boot.
   2. DEEPER BOOTS FASTER. The ceremony compresses with depth, so a
      cascade of mirrors does not take a cascade of minutes.
   3. THE HALL HAS A FLOOR. At MAX_NEST the orc room stops framing
      and says so. Physics allows a lot; it does not allow infinity,
      and a melted browser helps no one.
   ———————————————————————————————————————————————————————————————— */

export const MAX_NEST = 8;

function climb(): number {
  let d = 0;
  let w: Window = window;
  try {
    while (w.parent && w.parent !== w && d <= 64) {
      d++;
      w = w.parent;
    }
  } catch {
    /* a cross-origin ancestor stops the climb — count what we saw */
  }
  return d;
}

/** 0 = the surface (top-level). >= 1 = that many mirrors deep. */
export const DEPTH = climb();

const INSTANCE = Math.random().toString(36).slice(2, 8);

/** The storage key this instance should use for a base key. */
export function skey(base: string): string {
  return DEPTH === 0 ? base : `blacksite-nest-${INSTANCE}-${base}`;
}

/** Depth-0 housekeeping: mirrors are volatile, so the surface
 *  sweeps their orphaned namespaces when it boots. */
export function sweepNestKeys(): void {
  if (DEPTH !== 0) return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("blacksite-nest-")) localStorage.removeItem(k);
    }
  } catch { /* private modes keep nothing anyway */ }
}
