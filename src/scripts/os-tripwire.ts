/* ————————————————————————————————————————————————————————————————
   TRIPWIRE — the full-system wire. No holes.

   AEGIS guards the room. The Ivory-Tower guards AEGIS's register
   and the room's slow drift. But who guards the guards — and who
   guards everything else the system keeps? A hand that cannot
   beat the defenses can simply make them FORGET: wipe AEGIS's
   snapshot register and it wakes amnesiac and trusting; wipe the
   Tower's ledger and it takes a fresh baseline over whatever it
   finds; rewrite either one carefully and its own internal
   checks — a chain that still chains, a ring that still parses —
   will swear nothing happened. And beyond the defenses, the
   room's whole kept state — the filesystem register, the session,
   the Relay identity log, the phonehome callsign, the SIGINT
   registry, the subconscious — sat outside every watch there was.

   So now every register the SYSTEM keeps is strung on one wire.

   THE MANIFEST. The tripwire register holds a manifest: the
   SHA-256 head of every system register in the room — AEGIS, the
   Tower's ledger, the filesystem, the macros, the settings, the
   session, the Relay log, the phonehome callsign, the SIGINT
   registry and intercept log, the sound state, the subconscious
   — each notarized at the moment its own hand writes it, and the
   whole manifest sealed into a chain of seals under the wire's
   own key. Every legitimate writer in the room notes the wire
   when it writes; the shell's own hands note it inside their
   persist funnels, the other services announce their writes and
   the wire reads back what actually landed.

   THE CENSUS AND THE PLANT LAW. The wire also keeps a census of
   every key in the room's storage. Games and world-saves live on
   the perimeter — censused, never notarized (a corrupted high
   score must not be able to reboot the room; a game's saves are
   not the system's identity). But a key in the system's own
   namespaces that no hand in this room owns and the census has
   never seen is a PLANTED register, and a planted register is a
   verdict like any other.

   THE VERDICTS. Judged at boot, before the defenses load, and
   again at every observance of the Tower's clock:
   — any system register missing while the manifest remembers it,
     or present when the manifest swears it was absent (the
     amnesia attack, in either direction);
   — any stored register whose hash is not the notarized head
     (the careful rewrite);
   — the wire's own register deleted while the defenses carry
     its mark, or its seal found broken (the cut wire);
   — the wire rewritten mid-session behind its in-memory back;
   — a planted register in the system's namespaces.

   THE SENTENCE. A verdict is not a warning. The accusation is
   recorded in the wire's own register FIRST — outside every
   accused register — then the default defenses restore
   themselves, whole and armed: AEGIS re-genesis, CONTAINED, over
   a fresh snapshot of the room as found; the Tower re-genesis;
   the decoy canaries verified and re-planted if handled; the
   manifest re-strung over the restored state. The operator's
   files are never the sentence — only the defenses are rebuilt.
   Then the room REBOOTS onto the restored defaults, once: a flag
   in session storage makes the fresh boot announce why, and a
   second tamper in the same session holds containment without
   looping the reboot.

   THE MIGRATION LAW. A room from before the wire existed has
   registers that carry no mark and no wire register: that is
   adoption, not attack — the wire strings itself and notarizes
   what it finds. A room whose registers DO carry the mark but
   whose wire is gone has no such innocence.

   THE HONEST SCOPE. In-tab, as ever: an attacker with the page's
   full authority and perfect knowledge could rewrite every
   register and the in-memory wire between ticks. The wire
   convicts what actually happens — wipes, edits, plants, partial
   and lazy forgeries — across the whole system surface, and it
   makes a silent tamper require flawlessly re-notarizing the
   world in a single instant.
   ———————————————————————————————————————————————————————————————— */

import { hashText } from "./os-ivory";

export interface WireEvent { at: string; kind: string; detail: string; }

export class TripwireRegister {
  /** short register name → notarized head, or null when the
   *  register's accounted state is ABSENT (cleared by its own
   *  hand, not yet created). */
  heads: Record<string, string | null> = {};
  boots = 0;
  events: WireEvent[] = [];
  /** every storage key the wire has ever seen in this room —
   *  the census the plant law is judged against. */
  census: string[] = [];
  private prevSeal = "tripwire-genesis";

  private seal(): string {
    const heads = Object.keys(this.heads).sort().map((k) => `${k}=${this.heads[k] ?? "absent"}`).join(";");
    return hashText(`tripwire:seal\0${this.prevSeal}\0${heads}\0${this.boots}\0${this.events.map((e) => `${e.kind}:${e.detail}`).join(";")}\0${this.census.join(",")}`);
  }
  serialize(): string {
    return JSON.stringify({ v: 2, heads: this.heads, boots: this.boots, events: this.events, census: this.census, prev: this.prevSeal, seal: this.seal() });
  }
  /** Load a stored register. "fresh" (nothing stored), "ok"
   *  (seal holds), or "broken" (seal does not hold). */
  adopt(raw: string | null): "fresh" | "ok" | "broken" {
    if (!raw) return "fresh";
    try {
      const d = JSON.parse(raw);
      if (!d || d.v !== 2) return "broken";
      this.heads = d.heads && typeof d.heads === "object" ? d.heads : {};
      this.boots = typeof d.boots === "number" ? d.boots : 0;
      this.events = Array.isArray(d.events) ? d.events : [];
      this.census = Array.isArray(d.census) ? d.census.filter((k: unknown) => typeof k === "string") : [];
      this.prevSeal = typeof d.prev === "string" ? d.prev : "tripwire-genesis";
      return this.seal() === d.seal ? "ok" : "broken";
    } catch { return "broken"; }
  }
  private advance() { this.prevSeal = this.seal(); }
  note(short: string, head: string | null) { this.heads[short] = head; this.advance(); }
  noteBoot() { this.boots++; this.advance(); }
  noteEvent(kind: string, detail: string) {
    this.events.push({ at: new Date().toISOString(), kind, detail });
    while (this.events.length > 8) this.events.shift();
    this.advance();
  }
  noteCensus(keys: string[]) {
    const merged = new Set([...this.census, ...keys]);
    this.census = [...merged].sort().slice(0, 96);
    this.advance();
  }
  status() {
    return {
      heads: { ...this.heads }, boots: this.boots,
      events: [...this.events], census: [...this.census],
    };
  }
}

export interface WireJudgeInput {
  wirePresent: boolean;
  wireSealOk: boolean;
  /** any system register carries the wire's mark (v2-era room) */
  marked: boolean;
  /** the stored manifest (short → head|null); empty on adoption */
  manifest: Record<string, string | null>;
  /** the registers as found (short → hash|null-absent) */
  present: Record<string, string | null>;
  /** display names for verdicts (short → human name) */
  names: Record<string, string>;
  /** planted keys: in the system namespaces, owned by no hand,
   *  never censused */
  planted: string[];
}

/** Judge the prints. Returns the verdict detail, or null when the
 *  wire holds. Gravity order: the cut wire and amnesia speak
 *  before mere mismatch; a plant speaks last but still speaks. */
export function judgeWire(p: WireJudgeInput): string | null {
  if (!p.wirePresent) {
    return p.marked ? "the tripwire register was deleted while the system carries its mark — the wire was cut" : null;
  }
  if (!p.wireSealOk) return "the tripwire register's own seal is broken — the wire itself was handled";
  for (const short of Object.keys(p.manifest)) {
    const name = p.names[short] || short;
    const want = p.manifest[short];
    const got = p.present[short] ?? null;
    if (want !== null && got === null) return `${name} is gone while the wire remembers it — the system was made to forget`;
    if (want === null && got !== null) return `${name} exists while the wire swears it was absent — it was planted or restored in the dark`;
    if (want !== null && got !== null && want !== got) return `${name} does not match the head the tripwire notarized — it was rewritten`;
  }
  if (p.planted.length) return `a register no hand in this room owns was planted in storage: ${p.planted[0]}${p.planted.length > 1 ? ` (and ${p.planted.length - 1} more)` : ""}`;
  return null;
}
