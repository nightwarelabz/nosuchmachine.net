/* orc content guard — the room's door policy.
 *
 * Chase's directive (2026-10-25): block all forms of sexual or
 * evil human stuff from being possible in orc. The guard is a
 * hostname blocklist, consulted BEFORE every navigation the room
 * drives: the address bar, the lens button, the search flow, and
 * the room's floor branch at MAX_NEST. A blocked host is never
 * requested — the refusal plate replaces the pane instead.
 * Lens pages get a second check on the far side: links inside a
 * lensed page are rewritten through the lens, so when the frame
 * reports a lens navigation the room re-checks its target and
 * blanks the pane if it names a blocked host (see os-orc.ts).
 *
 * Scope, stated plainly: this governs the orc room. It does not
 * govern the whole web — a page framed directly can wander where
 * it likes once loaded (the room cannot see inside a cross-origin
 * frame, and says so in os-orc.ts), and orc the standalone
 * browser is a separate program with its own policy layer.
 * Search TERMS are not policed; hosts are. A search for anything
 * still runs — what cannot happen is orc opening a listed host.
 *
 * Categories:
 * - adult: vendored from StevenBlack/hosts (alternates/porn-only)
 *   into public/orc/blocklist.txt, one registrable domain per
 *   line, provenance in that file's header. Fetched lazily the
 *   first time a check needs it (~48k domains). Matching walks
 *   every parent suffix of the host, so a listing covers its
 *   subdomains (www and deeper alike).
 * - harm: the hand-curated seed below — gore and shock domains,
 *   the canonical names of the genre. Small on purpose: it is a
 *   seed, labeled as such, and the data file is the part meant
 *   to grow. A revived corpse of a domain inherits the block.
 */

const HARM_SEED: ReadonlySet<string> = new Set([
  "bestgore.com",
  "goregrish.com",
  "theync.com",
  "kaotic.com",
  "seegore.com",
  "hoodsite.com",
  "watchpeopledie.tv",
  "documentingreality.com",
  "crazyshit.com",
  "ogrish.com",
  "rotten.com",
  "liveleak.com",
]);

export interface GuardHit {
  host: string;
  category: "adult" | "harm";
}

let adultList: Promise<ReadonlySet<string>> | null = null;

function loadAdult(): Promise<ReadonlySet<string>> {
  if (!adultList) {
    adultList = fetch("/orc/blocklist.txt")
      .then((r) => {
        if (!r.ok) throw new Error(`blocklist ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const set = new Set<string>();
        for (const line of text.split("\n")) {
          const d = line.trim().toLowerCase();
          if (d && !d.startsWith("#")) set.add(d);
        }
        return set as ReadonlySet<string>;
      })
      .catch((e) => {
        // Fail open on a broken fetch — the harm seed still
        // stands, and scripts/verify-build.mjs pins the asset's
        // presence and size in every shipped build, so a missing
        // list is a build failure, not a silent hole.
        console.warn("orc content guard: adult blocklist unavailable —", e);
        return new Set<string>() as ReadonlySet<string>;
      });
  }
  return adultList;
}

/** Every suffix of the host from the full name down to the
 *  registrable domain — a listing at any level blocks the host. */
function suffixes(host: string): string[] {
  const labels = host.split(".");
  const out: string[] = [];
  for (let i = 0; i + 1 < labels.length; i++) out.push(labels.slice(i).join("."));
  return out;
}

/** The verdict for a URL the room is about to open: a GuardHit
 *  when its host is listed, null when the door may open. Only
 *  http(s) hosts are judged; other schemes pass as they always
 *  have (the room's doors only carry the web anyway). */
export async function guardCheck(rawUrl: string): Promise<GuardHit | null> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) return null;
  const chain = suffixes(host);
  for (const s of chain) if (HARM_SEED.has(s)) return { host, category: "harm" };
  const adult = await loadAdult();
  for (const s of chain) if (adult.has(s)) return { host, category: "adult" };
  return null;
}
