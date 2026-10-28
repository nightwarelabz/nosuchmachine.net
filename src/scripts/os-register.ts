// The Noether register — one source for the room's declared subsystems,
// budgets, and release identity, shared by the System app (os.ts) and
// the sysinfo / register / posture verbs (os-verbs.ts). The discipline
// is borrowed from Chase's WUCI OS: components are declared, budgets
// are visible, and limits are named instead of hidden.

export const OS_RELEASE = { version: "2.0", codename: "NOETHER", shipped: "2026-10-23" };

export interface RegisterFacts {
  live: number;
  edge: number;
  emcon: string;
  skReady: boolean;
}

export function registerRows(f: RegisterFacts): Array<[string, string, string]> {
  return [
    ["kernel", "blacksite sh — parser, pipes, redirects, jobs, EMCON gate", "LIVE"],
    ["vfs", "persistent virtual filesystem (this browser's local storage)", "LIVE"],
    ["window manager", "glass windows: drag, resize, minimize, maximize, taskbar", "LIVE"],
    ["python engine", "Skulpt — your programs, in the room", f.skReady ? "LIVE" : "LOADING"],
    ["lua engine", "Fengari — Lua in the room", "LIVE (loads on first use)"],
    ["sql engine", "SQLite (sql.js wasm) — room.db persists in the tree", "LIVE (loads on first use)"],
    ["scheme / bf engines", "hand-built Lisp + Brainfuck interpreters, in this source", "LIVE"],
    ["wasm room", "WebAssembly modules from the tree, instantiated in the room", "LIVE"],
    ["chip-8 machine", "a full CHIP-8 CPU with a console on the desk", "LIVE"],
    ["nexuiz machine", "Nexuiz Classic 2.5.2 on the real DarkPlaces engine (wasm) — the release data pack, hash-verified before it plays; MinstaHook is the house table", "LIVE"],
    ["dos machine", "DOSBox in WebAssembly (js-dos, vendored, self-hosted) — Wolfenstein 3D's shareware episode runs on it, unaltered 1992 data under its shareware license", "LIVE"],
    ["orc", "our version of LibreWolf in its wraparound: a room here, a standalone installable browser of its own", "LIVE"],
    ["javascript engine", "your programs, in the room", "LIVE"],
    ["file parsers", "ELF · PE · Mach-O · ZIP · PDF · images · Wasm · SQLite · gzip · TAR · plist", "LIVE"],
    ["edge bridge", `/api/* — the guarded wire: ${f.live + f.edge} verbs registered, wire verbs behind the public-target guard`, "LIVE"],
    ["emcon standard", `graded silence — currently ${f.emcon.toUpperCase()}`, "LIVE"],
    ["daylight bottle", "age-encrypted bottles, plugged in from bottle.nosuchmachine.net", "LIVE"],
    ["git", "isomorphic-git over the room's own tree; the wire runs through the site's guarded git proxy", "LIVE"],
    ["ssh client", "the room's own SSH — curve25519, AES-GCM, verified host keys; the edge bridge pipes ciphertext only", "LIVE"],
    ["relay (irc)", "a real IRC client in the room — OFTC/Libera/hackint over TLS through the house bridge; the house channel is #nosuchmachine on OFTC", "LIVE"],
    ["phonehome", "a secure transmitter + reception field between two stations — WebRTC voice + text sealed station to station (ECDH + AES-GCM, signed signals); the edge rendezvous swaps signed signals only and hears nothing", "LIVE"],
    ["timelock", "RSW repeated-squaring seals (the Magic Box construction)", "LIVE"],
    ["gauntlet", "the room tests itself — crypto vectors, vfs, roster, engines", "LIVE"],
    ["ivory-tower", "the clockwork observance coupled to AEGIS — Merkle-rooted room hashes, canary + register fingerprints, a hash-chained ledger; drift behind the funnel raises the watch, tampering hands the room to AEGIS", "LIVE"],
    ["tripwire", "the full-system wire between AEGIS and the tower — every system register notarized at its own hand's write, the storage surface watched by a sentinel that blocks unaccounted writes on the spot; tamper with the defenses and the defaults restore and the room reboots", "LIVE"],
    ["toolchest", "209 tools: 209 live commands + 14700 registry entries (ports, ciphers, mime, protocols, zones, codes)", "LIVE"],
  ];
}

export function vfsStats(files: Map<string, { type: string; content?: string; binary?: string }>): { files: number; bytes: number } {
  let count = 0, bytes = 0;
  for (const n of files.values()) {
    if (n.type !== "file") continue;
    count++;
    // Exactly one measure per node, and a real byte measure at
    // that: a binary node counts the bytes its base64 decodes to —
    // and ONLY those (its `content` field is the lossy text shadow
    // of the same bytes, so counting both counted the file twice);
    // a text node counts its UTF-8 bytes, not its UTF-16 length —
    // a character is not a byte, and the register's totals used to
    // say otherwise for anything past ASCII.
    if (n.binary) {
      const pad = n.binary.endsWith("==") ? 2 : n.binary.endsWith("=") ? 1 : 0;
      bytes += Math.max(0, Math.floor((n.binary.length * 3) / 4) - pad);
    } else if (n.content) {
      bytes += new TextEncoder().encode(n.content).length;
    }
  }
  return { files: count, bytes };
}
