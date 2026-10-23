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
    ["javascript engine", "the native room — your programs, in the room", "LIVE"],
    ["file parsers", "ELF · PE · Mach-O · ZIP · PDF · images · Wasm · SQLite · gzip · TAR · plist", "LIVE"],
    ["edge bridge", `/api/* — the guarded wire: ${f.live + f.edge} verbs registered, wire verbs behind the public-target guard`, "LIVE"],
    ["emcon standard", `graded silence — currently ${f.emcon.toUpperCase()}`, "LIVE"],
    ["daylight bottle", "age-encrypted bottles, plugged in from bottle.nosuchmachine.net", "LIVE"],
    ["timelock", "RSW repeated-squaring seals (the Magic Box construction)", "LIVE"],
    ["gauntlet", "the room tests itself — crypto vectors, vfs, roster, engines", "LIVE"],
  ];
}

export function vfsStats(files: Map<string, { type: string; content?: string; b64?: string }>): { files: number; bytes: number } {
  let count = 0, bytes = 0;
  for (const n of files.values()) if (n.type === "file") { count++; bytes += (n.content?.length ?? 0) + (n.b64?.length ?? 0); }
  return { files: count, bytes };
}
