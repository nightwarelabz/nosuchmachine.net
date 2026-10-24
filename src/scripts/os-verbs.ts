// BLACKSITE OS — the verb roster, ported from nightjar's Blacksite bench.
// LIVE = runs in this room. EDGE = one knock through the site's guarded
// edge functions. LIMIT verbs are registered in os-limits.ts with the
// room's honest reason, and `help` shows the whole 427 either way.
import {
  BlacksiteOS, VERBS, verb, md5, mmh3, bToHex, hexToB, bToB64, b64ToB,
} from "./os-shell";
import type { ShellIO } from "./os-shell";
import { identifyFile, hexdump } from "./os-parse";
import { OS_RELEASE, registerRows, vfsStats } from "./os-register";
import { sfx, armAudio, soundPrefs, setSoundPrefs } from "./os-sound";

const te = new TextEncoder();
const td = new TextDecoder();
type Ctx = { args: string[]; stdin: string; os: BlacksiteOS; io: ShellIO; raw: string };
const out = (s: string) => s;
function need(ctx: Ctx, n: number, usage: string): boolean {
  if (ctx.args.length < n) { ctx.io.print(`usage: ${usage}`, "err"); return false; }
  return true;
}
async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  return res.json().catch(() => ({ ok: false, error: `edge answered HTTP ${res.status}` }));
}
async function edgeDns(name: string, type: string): Promise<any> {
  return api(`/api/dns?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`);
}
function dnsRecords(data: any, type: string): string[] {
  const rows: string[] = [];
  for (const r of data?.results?.[type] || []) {
    if (!r.ok) continue;
    for (const rec of r.records || []) rows.push(String(rec.data));
  }
  return rows;
}
function fmtBytes(b: Uint8Array, max = 400): string {
  return td.decode(b.slice(0, max)).replace(/[^\x20-\x7e\r\n\t]/g, "·");
}
function fileBytes(ctx: Ctx, path: string): Uint8Array {
  const b = ctx.os.readBytes(path);
  if (!b) throw new Error(`no such file: ${path}`);
  return b;
}
async function exchange(ctx: Ctx, host: string, port: number, sendText?: string, sendBytes?: Uint8Array, timeoutMs = 5000): Promise<any> {
  const refusal = ctx.os.gate("active");
  if (refusal) throw new Error(refusal);
  const note = ctx.os.gateNote("active");
  if (note) ctx.os.log(note + ` (${host}:${port})`);
  return api("/api/exchange", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ host, port, sendText: sendText || undefined, sendBase64: sendBytes ? bToB64(sendBytes) : undefined, timeoutMs }),
  });
}
function hostPort(arg: string, defaultPort: number): { host: string; port: number } {
  const m = arg.match(/^(.+?):(\d+)$/);
  if (m) return { host: m[1], port: Number(m[2]) };
  return { host: arg, port: defaultPort };
}

/* ============ THE HOUSE ============ */
function registerHouse() {
  verb("help", "LIVE", "help [section|word] — the whole roster, with each command's web standing", async (ctx) => {
    const { default: rosterData } = await import("../data/blacksite-commands.json");
    const sections = new Map<string, Array<any>>();
    for (const r of rosterData as any[]) {
      if (!sections.has(r.section)) sections.set(r.section, []);
      sections.get(r.section)!.push(r);
    }
    const statusOf = (v: string) => VERBS.get(v)?.status || "LIMIT";
    const q = ctx.args.join(" ").trim().toLowerCase();
    if (!q) {
      const lines = ["BLACKSITE OS — command sections (help <section> opens one, help <word> searches all):", ""];
      let live = 0, edge = 0, limit = 0;
      for (const [name, rows] of sections) {
        const verbs = new Set(rows.map((r: any) => r.verb));
        let l = 0, e = 0;
        verbs.forEach((v) => { const s = statusOf(v); if (s === "LIVE") l++; else if (s === "EDGE") e++; });
        live += l; edge += e; limit += verbs.size - l - e;
        lines.push(`  ${name.padEnd(34)} ${rows.length} commands · ${l + e} live on the web`);
      }
      lines.push("", `Total: ${rosterData.length} commands · ${live} LIVE in-room · ${edge} EDGE via one knock · ${limit} LIMIT (named in \`limits\`)`, "Doctrine: one knock, read, grade. Public targets only.");
      return lines.join("\n");
    }
    const sectionMatch = [...sections.keys()].find((s) => s.toLowerCase().startsWith(q));
    const rows = sectionMatch ? sections.get(sectionMatch)! : (rosterData as any[]).filter((r) => r.verb.includes(q) || r.cmd.includes(q) || r.desc.toLowerCase().includes(q));
    if (!rows.length) return `no command matches "${q}".`;
    return rows.slice(0, 90).map((r: any) => `${statusOf(r.verb).padEnd(5)} ${r.cmd.padEnd(38)} ${r.desc}`).join("\n");
  });
  verb("sound", "LIVE", "sound [on|off|vol <0-100>|test] — the room's synthesized voice", async (ctx) => {
    const p = soundPrefs();
    const a = (ctx.args[0] || "").toLowerCase();
    if (a === "on") { setSoundPrefs({ enabled: true }); armAudio(); sfx("open"); return "the room's voice is on."; }
    if (a === "off") { setSoundPrefs({ enabled: false }); return "the room is mute. (EMCON alpha silences it too, whatever this says.)"; }
    if (a === "vol") { const v = parseInt(ctx.args[1] || "", 10); if (isNaN(v) || v < 0 || v > 100) return "sound vol <0-100>"; setSoundPrefs({ volume: v / 100 }); armAudio(); sfx("ping"); return `volume ${v}.`; }
    if (a === "test") { armAudio(); sfx("live"); return "the voice, tested — the boot swell, on demand."; }
    return `sound: ${p.enabled ? "on" : "off"} · volume ${Math.round(p.volume * 100)} · synthesized in-tab, no audio files · arms on your first click or keypress · EMCON alpha is total silence.`;
  });
  verb("ver", "LIVE", "version of the room", async () => "BLACKSITE OS — web edition 2.0 'NOETHER' · the nightjar bench, ported\nkernel: blacksite-web · shell: blacksite sh · engines: skulpt python, native javascript\nthe register: `register` · the budgets: `sysinfo` · the grade: `posture`");
  verb("sys", "LIVE", "the whole house state", async (ctx) => {
    const up = Math.floor((Date.now() - ctx.os.bootedAt) / 1000);
    return [
      `host        ${ctx.os.env.HOSTNAME}`, `user        ${ctx.os.env.USER}`,
      `emcon       ${ctx.os.emcon.toUpperCase()}`, `theme       ${ctx.os.theme}`,
      `uptime      ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m ${up % 60}s`,
      `processes   ${ctx.os.procs.filter((p) => p.state === "running").length} running, ${ctx.os.procs.length} on the board`,
      `files       ${ctx.os.files.size} nodes under ${ctx.os.cwd}`,
      `journal     ${ctx.os.journal.length} entries`, `engine      browser — see \`limits\` for the honest physics`,
    ].join("\n");
  });
  verb("ps", "LIVE", "processes, live and recent", async (ctx) => {
    if (!ctx.os.procs.length) return "no processes yet — the board fills as you work.";
    return ["  PID  STATE    ELAPSED  COMMAND", ...ctx.os.procs.slice(-25).map((p) => `${String(p.pid).padStart(5)}  ${p.state.padEnd(8)} ${String(Math.floor((Date.now() - p.started) / 1000)).padStart(6)}s  ${p.cmd}`)].join("\n");
  });
  verb("jobs", "LIVE", "the kernel's live programs", async (ctx) => {
    const live = ctx.os.procs.filter((p) => p.state === "running");
    return live.length ? live.map((p) => `[${p.pid}] running  ${p.cmd}`).join("\n") : "no live programs.";
  });
  verb("kill", "LIVE", "kill <pid> — stop a program", async (ctx) => {
    if (!need(ctx, 1, "kill <pid>")) return;
    const pid = Number(ctx.args[0]);
    const proc = ctx.os.procs.find((p) => p.pid === pid);
    if (!proc) return `no such pid: ${ctx.args[0]}`;
    proc.state = "killed";
    ctx.os.log(`kill ${pid} (${proc.cmd})`);
    return `killed ${pid}. the kernel reclaims it.`;
  });
  verb("stop", "LIVE", "stop whatever is running in this room", async (ctx) => { ctx.os.stopFlag = true; ctx.os.procs.forEach((p) => { if (p.state === "running") p.state = "killed"; }); return "stop spoken. everything in this room stands down."; });
  verb("halt", "LIVE", "stop everything, now", async (ctx) => { ctx.os.stopFlag = true; ctx.os.procs.forEach((p) => { if (p.state === "running") p.state = "killed"; }); ctx.os.log("HALT"); return "halt. the whole house stands down."; });
  verb("clear", "LIVE", "clear the transcript", async (ctx) => { ctx.io.clear(); });
  verb("date", "LIVE", "the date and time", async () => new Date().toString());
  verb("uptime", "LIVE", "how long the room has stood", async (ctx) => { const s = Math.floor((Date.now() - ctx.os.bootedAt) / 1000); return `up ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`; });
  verb("sysinfo", "LIVE", "sysinfo — the room's budgets: files, bytes, verbs, uptime", async (ctx) => {
    const vs = vfsStats(ctx.os.files as any);
    let ls = 0; try { for (const k of Object.keys(localStorage)) if (k.startsWith("blacksite-")) ls += (localStorage.getItem(k) || "").length; } catch { /* private mode */ }
    const live = [...VERBS.values()].filter((v) => v.status === "LIVE").length;
    const edge = [...VERBS.values()].filter((v) => v.status === "EDGE").length;
    return [
      `BLACKSITE OS ${OS_RELEASE.version} "${OS_RELEASE.codename}" — sysinfo`,
      `verbs: ${VERBS.size} registered (${live} in-room, ${edge} edge) of 427 on the roster — the rest are named limits`,
      `vfs: ${vs.files} files · ${(vs.bytes / 1024).toFixed(1)} KB of content`,
      `local storage footprint: ${(ls / 1024).toFixed(1)} KB (this room only)`,
      `processes on the board: ${ctx.os.procs.length} · journal entries: ${ctx.os.journal.length}`,
      `emcon: ${ctx.os.emcon.toUpperCase()} · theme: ${ctx.os.theme} · shell history: ${ctx.os.history.length} lines`,
    ].join("\n");
  });
  verb("register", "LIVE", "register — the Noether register: every subsystem, declared", async (ctx) => {
    const facts = { live: [...VERBS.values()].filter((v) => v.status === "LIVE").length, edge: [...VERBS.values()].filter((v) => v.status === "EDGE").length, emcon: ctx.os.emcon, skReady: typeof (window as any).Sk !== "undefined" };
    const lines = [`THE NOETHER REGISTER — BLACKSITE OS ${OS_RELEASE.version}`, "(the WUCI OS discipline: components declared, budgets visible, limits named)", ""];
    for (const [name, what, state] of registerRows(facts)) lines.push(`  ${name.padEnd(18)} ${state.padEnd(8)} ${what}`);
    return lines.join("\n");
  });
  verb("posture", "LIVE", "posture — the room grades itself (engines, storage, silence, edge, crypto)", async (ctx) => {
    const parts: Array<[string, number, number, string]> = [];
    const sk = typeof (window as any).Sk !== "undefined";
    parts.push(["engines (python + javascript)", sk ? 25 : 10, 25, sk ? "both engines answer" : "python still loading"]);
    let storageOk = false; try { localStorage.setItem("blacksite-probe", "1"); localStorage.removeItem("blacksite-probe"); storageOk = true; } catch { /* no */ }
    parts.push(["storage (vfs persistence)", storageOk ? 15 : 0, 15, storageOk ? "local storage writable — the room persists" : "storage unavailable (private mode?) — the room forgets"]);
    const emconPts = ({ open: 6, charlie: 13, bravo: 17, alpha: 20 } as Record<string, number>)[ctx.os.emcon] ?? 6;
    parts.push(["silence (emcon condition)", emconPts, 20, `condition ${ctx.os.emcon.toUpperCase()} — ${ctx.os.emcon === "open" ? "the wire is open; the bench knocks freely" : "the gate is set; refusals speak"}`]);
    let bridge = 0; let bridgeNote = "edge bridge unreachable from here";
    if (ctx.os.emcon === "alpha") { bridgeNote = "not attempted — EMCON ALPHA forbids the wire, this verb included"; }
    else try { const r = await fetch("/api/echo", { headers: { accept: "application/json" } }); const d = await r.json(); if (d.ok) { bridge = 20; bridgeNote = "edge bridge answers; the guard stands in front of every wire verb"; } } catch { /* offline */ }
    parts.push(["edge bridge (guarded wire)", bridge, 20, bridgeNote]);
    let cryptoPts = 0; let cryptoNote = "WebCrypto missing — vault and bottle are dark";
    if (crypto?.subtle) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")); const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); if (hex.startsWith("ba7816bf8f01cfea")) { cryptoPts = 20; cryptoNote = "WebCrypto present; SHA-256('abc') matches FIPS 180-4 in this browser"; } }
    parts.push(["crypto (webcrypto, proven live)", cryptoPts, 20, cryptoNote]);
    const total = parts.reduce((a, p) => a + p[1], 0);
    const grade = total >= 90 ? "A" : total >= 75 ? "B" : total >= 60 ? "C" : total >= 40 ? "D" : "F";
    return [`POSTURE — the room grades itself`, ...parts.map(([n, got, max, note]) => `  ${n.padEnd(34)} ${String(got).padStart(2)}/${max}  ${note}`), ``, `POSTURE GRADE: ${grade} (${total}/100)`].join("\n");
  });
  verb("banner", "LIVE", "banner <text> — say it in block letters", async (ctx) => {
    const FONT: Record<string, string[]> = {
      A: [" █ ", "█ █", "███", "█ █", "█ █"], B: ["██ ", "█ █", "██ ", "█ █", "██ "], C: [" ██", "█  ", "█  ", "█  ", " ██"],
      D: ["██ ", "█ █", "█ █", "█ █", "██ "], E: ["███", "█  ", "██ ", "█  ", "███"], F: ["███", "█  ", "██ ", "█  ", "█  "],
      G: [" ██", "█  ", "█ █", "█ █", " ██"], H: ["█ █", "█ █", "███", "█ █", "█ █"], I: ["███", " █ ", " █ ", " █ ", "███"],
      J: [" ██", "  █", "  █", "█ █", " █ "], K: ["█ █", "█ █", "██ ", "█ █", "█ █"], L: ["█  ", "█  ", "█  ", "█  ", "███"],
      M: ["█ █", "███", "█ █", "█ █", "█ █"], N: ["█ █", "███", "███", "█ █", "█ █"], O: [" █ ", "█ █", "█ █", "█ █", " █ "],
      P: ["██ ", "█ █", "██ ", "█  ", "█  "], Q: [" █ ", "█ █", "█ █", " ██", "  █"], R: ["██ ", "█ █", "██ ", "█ █", "█ █"],
      S: [" ██", "█  ", " █ ", "  █", "██ "], T: ["███", " █ ", " █ ", " █ ", " █ "], U: ["█ █", "█ █", "█ █", "█ █", " █ "],
      V: ["█ █", "█ █", "█ █", "█ █", " █ "], W: ["█ █", "█ █", "█ █", "███", "█ █"], X: ["█ █", "█ █", " █ ", "█ █", "█ █"],
      Y: ["█ █", "█ █", " █ ", " █ ", " █ "], Z: ["███", "  █", " █ ", "█  ", "███"],
      "0": ["███", "█ █", "█ █", "█ █", "███"], "1": [" █ ", "██ ", " █ ", " █ ", "███"], "2": ["██ ", "  █", " █ ", "█  ", "███"],
      "3": ["██ ", "  █", " █ ", "  █", "██ "], "4": ["█ █", "█ █", "███", "  █", "  █"], "5": ["███", "█  ", "██ ", "  █", "██ "],
      "6": [" ██", "█  ", "██ ", "█ █", " █ "], "7": ["███", "  █", " █ ", " █ ", " █ "], "8": [" █ ", "█ █", " █ ", "█ █", " █ "],
      "9": [" █ ", "█ █", " ██", "  █", "██ "], " ": ["   ", "   ", "   ", "   ", "   "], "-": ["   ", "   ", "███", "   ", "   "],
      ".": ["   ", "   ", "   ", "   ", " █ "], "!": [" █ ", " █ ", " █ ", "   ", " █ "], "?": ["██ ", "  █", " █ ", "   ", " █ "],
      "/": ["  █", "  █", " █ ", "█  ", "█  "], ":": ["   ", " █ ", "   ", " █ ", "   "], "_": ["   ", "   ", "   ", "   ", "███"],
      "+": ["   ", " █ ", "███", " █ ", "   "], "#": ["█ █", "███", "█ █", "███", "█ █"],
    };
    const text = (ctx.args.join(" ") || "BLACKSITE").toUpperCase().slice(0, 24);
    const rows = ["", "", "", "", ""];
    for (const ch of text) { const g = FONT[ch] || FONT["?"]; for (let r = 0; r < 5; r++) rows[r] += g[r] + " "; }
    return rows.join("\n");
  });
  verb("whoami", "LIVE", "who you are in this room", async (ctx) => ctx.os.env.USER);
  verb("hostname", "LIVE", "who this room is on the wire", async (ctx) => ctx.os.env.HOSTNAME);
  verb("env", "LIVE", "the environment", async (ctx) => Object.entries(ctx.os.env).map(([k, v]) => `${k}=${v}`).join("\n"));
  verb("set", "LIVE", "set NAME=value", async (ctx) => { const m = ctx.raw.match(/set\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)/); if (m) { ctx.os.env[m[1]] = m[2]; return `${m[1]} set.`; } return Object.entries(ctx.os.env).map(([k, v]) => `${k}=${v}`).join("\n"); });
  verb("history", "LIVE", "the command history", async (ctx) => ctx.os.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n") || "no history yet.");
  verb("emcon", "LIVE", "emcon [open|charlie|bravo|alpha] — read or set the condition", async (ctx) => {
    const v = (ctx.args[0] || "").toLowerCase();
    if (!v) return `emcon ${ctx.os.emcon} — ${{ open: "no restrictions. the wire is yours to knock on.", charlie: "guarded: active probes run, and are journaled.", bravo: "receive-only: active probes refuse; public ledgers still read.", alpha: "total silence: no wire contact at all." }[ctx.os.emcon]}`;
    if (!["open", "charlie", "bravo", "alpha", "off"].includes(v)) return "conditions: open, charlie, bravo, alpha.";
    ctx.os.emcon = (v === "off" ? "open" : v) as BlacksiteOS["emcon"];
    ctx.os.saveSoon(); ctx.os.log(`emcon set to ${ctx.os.emcon}`);
    document.dispatchEvent(new CustomEvent("blacksite:toast", { detail: { text: `EMCON is now ${ctx.os.emcon.toUpperCase()} — the gates read it before every knock.` } }));
    document.dispatchEvent(new CustomEvent("blacksite:emcon"));
    return `condition is now ${ctx.os.emcon.toUpperCase()}. the gates read it before every knock.`;
  });
  verb("theme", "LIVE", "theme [name] — list or switch the house theme", async (ctx) => {
    const themes = ["violent-redteam", "phosphor", "ember", "ghost", "arctic", "plumage"];
    const v = ctx.args[0];
    if (!v) return `theme: ${ctx.os.theme}\nthemes: ${themes.join(", ")}`;
    if (!themes.includes(v)) return `no such theme. themes: ${themes.join(", ")}`;
    ctx.os.theme = v; ctx.os.saveSoon(); ctx.io.setTheme?.(v);
    return `theme is now ${v}.`;
  });
  verb("journal", "LIVE", "journal [n] — the house journal", async (ctx) => {
    const n = Number(ctx.args[0]) || 20;
    return ctx.os.journal.slice(-n).map((j) => `${j.at.slice(11, 19)}  ${j.text}`).join("\n") || "the journal is empty.";
  });
  verb("log", "LIVE", "log [n] — the flight recorder", async (ctx) => {
    const n = Number(ctx.args[0]) || 20;
    return ctx.os.journal.slice(-n).map((j) => `${j.at}  ${j.text}`).join("\n") || "nothing recorded yet.";
  });
  verb("macro", "LIVE", "macro save <name> <cmds...> | macro list | macro run <name> | macro del <name>", async (ctx) => {
    const [sub, name, ...rest] = ctx.args;
    if (sub === "list") return ctx.os.macros.size ? [...ctx.os.macros.entries()].map(([k, v]) => `${k}: ${v}`).join("\n") : "no macros kept.";
    if (sub === "save" && name && rest.length) { ctx.os.macros.set(name, rest.join(" ")); ctx.os.saveSoon(); return `macro ${name} kept.`; }
    if (sub === "del" && name) { ctx.os.macros.delete(name); ctx.os.saveSoon(); return `macro ${name} let go.`; }
    if (sub === "run" && name) {
      const body = ctx.os.macros.get(name);
      if (!body) return `no such macro: ${name}`;
      const { execLine } = await import("./os-shell");
      await execLine(ctx.os, body, ctx.io, 1);
      return `— macro ${name} done.`;
    }
    return "usage: macro save <name> <commands> | macro list | macro run <name> | macro del <name>";
  });
  verb("tomato", "LIVE", "tomato list|throw <mark>|wipe — the standing marks", async (ctx) => {
    const [sub, ...rest] = ctx.args;
    if (sub === "throw" && rest.length) { ctx.os.tomatoes.push(rest.join(" ")); ctx.os.saveSoon(); return "mark thrown. it stands."; }
    if (sub === "wipe") { ctx.os.tomatoes = []; ctx.os.saveSoon(); return "marks wiped."; }
    return ctx.os.tomatoes.length ? ctx.os.tomatoes.map((t, i) => `${i + 1}. ${t}`).join("\n") : "no standing marks.";
  });
  verb("haptics", "LIVE", "haptics on|off — the house's motor (vibration, where the device offers it)", async (ctx) => {
    if (ctx.args[0] === "on" || !ctx.args[0]) { navigator.vibrate?.(30); return "haptics on. (felt that? then this device has a motor the page may use.)"; }
    return "haptics off.";
  });
  verb("fastfetch", "LIVE", "the machine's calling card — every value read live", async (ctx) => {
    const nav = navigator as any;
    const lines = [
      "        ▄▄▄▄▄        operator@blacksite-web",
      "      ▄█▀▀▀▀▀▀█▄     ─────────────────────────",
      "     █▀  ▄██▄  ▀█    OS: BLACKSITE OS (web edition)",
      "    █   ██████   █   Host: nosuchmachine.net",
      `    █   ▀████▀   █   Shell: blacksite sh · EMCON ${ctx.os.emcon.toUpperCase()}`,
      "     ▀█▄    ▄█▀    Uptime: " + Math.floor((Date.now() - ctx.os.bootedAt) / 1000) + "s",
      "       ▀▀▀▀▀▀      Browser: " + navigator.userAgent.split(" ").slice(0, 3).join(" ") + "…",
      `                   Cores: ${navigator.hardwareConcurrency || "?"} · Memory: ${nav.deviceMemory || "?"}GB · Files: ${ctx.os.files.size} nodes`,
    ];
    return lines.join("\n");
  });
  verb("neofetch", "LIVE", "the same card, under a crescent moon", async (ctx) => {
    const { VERBS: v } = await import("./os-shell");
    void v;
    return "   ☾  BLACKSITE OS — web edition\n   host nosuchmachine.net · emcon " + ctx.os.emcon + " · theme " + ctx.os.theme + "\n   the bench, under a crescent moon.";
  });
  verb("aegis", "LIVE", "aegis [status|snapshot|restore|lift [--adopt]] — the room's immune system: snapshots, containment, the mirage", async (ctx) => {
    const st = ctx.os.aegisStatus();
    const sub = (ctx.args[0] || "status").toLowerCase();
    if (sub === "snapshot") { ctx.os.snapshotNow("manual"); return "aegis: snapshot kept. the room can now be returned to exactly this moment."; }
    if (sub === "restore") return ctx.os.aegisRestore() ? "aegis: restored. whatever the attack wrote is gone; the room stands as the snapshot left it." : "aegis: no snapshot exists to restore from.";
    if (sub === "lift") { const adopt = ctx.args.includes("--adopt"); const n = ctx.os.aegisLift(adopt); return `aegis: containment lifted — the mirage's ${n} ${n === 1 ? "entry" : "entries"} ${adopt ? "adopted into the real room" : "discarded"}.`; }
    const lines = [
      st.contained ? "AEGIS: CONTAINED — the real filesystem is frozen; writes land in the mirage and read back as success to whoever is writing them." : "AEGIS: standing watch. the room snapshots itself at boot, every five minutes, and at the first whisper of noise.",
      `snapshots: ${st.snaps.length ? st.snaps.map((x) => `${new Date(x.at).toLocaleTimeString()} (${x.why})`).join(" · ") : "none yet"}`,
      `mirage: ${st.mirage} ${st.mirage === 1 ? "entry" : "entries"} held`,
    ];
    if (st.trips.length) lines.push("trips:", ...st.trips.map((t) => `  ${t.at} — ${t.reason}`));
    lines.push("what trips it: a ransom note's shape, ten mutations in ten seconds, existing files turning to high-entropy noise, a hand on the decoy files in ~/documents. what it cannot do: reach outside this tab. nothing on the attacker's own machine is touched — the backfire is that the attack spends itself on a mirage, the room restores, and the attempt stays in the journal.");
    return lines.join("\n");
  });
  verb("wallpaper", "LIVE", "wallpaper [mare|stars|plasma|mandelbrot|none] — nightmare, or art the room generates", async (ctx) => {
    const kind = ctx.args[0] || "stars";
    if (!["mare", "stars", "plasma", "mandelbrot", "none"].includes(kind)) return "wallpapers: mare, stars, plasma, mandelbrot, none.";
    ctx.io.setWallpaper?.(kind);
    return kind === "none" ? "wallpaper cleared." : kind === "mare" ? "wallpaper: nightmare." : `wallpaper: ${kind}, generated by the room.`;
  });
  verb("open", "LIVE", "open <terminal|files|editor|processes|journal|gauntlet|settings|help|bench> — go to a room", async (ctx) => {
    const app = ctx.args[0];
    if (!app) return "rooms: terminal, files, editor, processes, journal, gauntlet, settings, help, bench (the web suite).";
    ctx.io.openApp?.(app, ctx.args[1]);
    return `opening ${app}…`;
  });
  verb("edit", "LIVE", "edit <file> — open it in the Editor room (vim modes)", async (ctx) => { if (!need(ctx, 1, "edit <file>")) return; ctx.io.openApp?.("editor", ctx.args[0]); return `editing ${ctx.args[0]} — :w saves, :q leaves.`; });
  verb("vim", "LIVE", "vim <file> — the vim-personality editor", async (ctx) => { if (!need(ctx, 1, "vim <file>")) return; ctx.io.openApp?.("editor", ctx.args[0]); return "the Editor room, vim personality forward."; });
  verb("emacs", "LIVE", "emacs <file> — the emacs-personality editor", async (ctx) => { if (!need(ctx, 1, "emacs <file>")) return; ctx.io.openApp?.("editor", ctx.args[0]); return "the Editor room. (the web port keeps one editor with two sets of manners — vim modes are the working set today.)"; });
  verb("skelli", "LIVE", "skelli <words> — ask her", async (ctx) => {
    const words = ctx.args.join(" ") || "…";
    ctx.os.log(`skelli asked: ${words}`);
    return "Skelli (web poster): the real Skelli lives in nightjar on iPhone/Mac, where she runs this whole bench herself. Here I can point: try `help`, `eazy example.com`, or `magdump example.com` — and `limits` before you believe any of us.";
  });
  verb("limits", "LIVE", "what this room honestly cannot do", async () => [
    "THE ROOM'S HONEST LIMITS — read once, believe always:",
    "• No ICMP, no UDP, no raw sockets, no LAN: browsers have none. ping here times real TCP connects from the edge and says so.",
    "• Every wire result is from a Cloudflare point of presence, not your network. A door open here may be shut from your chair, and the reverse.",
    "• Private, loopback, link-local, CGNAT, and metadata addresses are refused before contact — this bench cannot be pointed inward, by design.",
    "• TLS 1.3 encrypts its certificate flight; the inspector reports that instead of inventing a chain.",
    "• Connect checks cap at 32 ports; exchanges are one connection, ≤4KB spoken, ≤64KB read. No sweeps, no sessions, no second knock.",
    "• ICS and radio doors that speak UDP or serial are named but not knocked from the web — they live in the native bench.",
    "• Python here is Skulpt, a dialect — no threads, no sockets. JavaScript runs sandboxed. The files are yours: they live in this browser's storage, and a cleared browser is a wiped room.",
    "• freedoom needs its game data fetched from Freedoom's own release and a WASM port the web room has not shipped — it stays in the native console for now.",
  ].join("\n"));
}

/* ============ FILES ============ */
function registerFiles() {
  const resolve = (ctx: Ctx, p: string) => ctx.os.norm(p);
  verb("pwd", "LIVE", "print working directory", async (ctx) => ctx.os.cwd);
  verb("cd", "LIVE", "cd <dir> — change directory", async (ctx) => {
    const target = ctx.args[0] ? resolve(ctx, ctx.args[0]) : ctx.os.env.HOME;
    if (!ctx.os.isDir(target)) throw new Error(`not a directory: ${target}`);
    ctx.os.cwd = target;
  });
  verb("ls", "LIVE", "ls [-l] [dir] — list the tree", async (ctx) => {
    const long = ctx.args.includes("-l");
    const dirArg = ctx.args.find((a) => !a.startsWith("-")) || ".";
    const dir = resolve(ctx, dirArg);
    if (!ctx.os.isDir(dir)) { const n = ctx.os.node(dir); if (n) return dir.split("/").pop() || dir; throw new Error(`no such directory: ${dir}`); }
    const names = ctx.os.list(dir);
    if (!names.length) return "(empty)";
    if (!long) return names.map((n) => ctx.os.isDir(`${dir}/${n}`) ? n + "/" : n).join("  ");
    return names.map((n) => { const node = ctx.os.node(`${dir}/${n}`)!; const size = node.type === "dir" ? "-" : (node.binary ? String(Math.floor(node.binary.length * 3 / 4)) : String((node.content || "").length)); return `${node.type === "dir" ? "d" : "-"} ${size.padStart(8)}  ${new Date(node.mtime).toISOString().slice(0, 16).replace("T", " ")}  ${n}`; }).join("\n");
  });
  verb("cat", "LIVE", "cat <file...> — read files (or stdin)", async (ctx) => {
    if (!ctx.args.length) return ctx.stdin;
    const parts: string[] = [];
    for (const f of ctx.args) { const c = ctx.os.read(f); if (c === null) throw new Error(`no such file: ${f}`); parts.push(c); }
    return parts.join("\n");
  });
  verb("echo", "LIVE", "echo <words> — say it back (pipes and redirects work)", async (ctx) => ctx.args.join(" "));
  verb("printf", "LIVE", "printf <format> [args…] — formatted print (%s %d %x %f %c %% · \\n \\t escapes · the format repeats until args are spent)", async (ctx) => {
    if (!ctx.args.length) throw new Error("usage: printf FORMAT [ARGS…]");
    const fmt = ctx.args[0].replace(/\\(.)/g, (_m, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c === "0" ? "\0" : c));
    const args = ctx.args.slice(1);
    let ai = 0;
    const render = (f: string): string => f.replace(/%([-+ 0#]*)(\d*(?:\.\d+)?)([sdixXofc%])/g, (_m, flags, spec, conv) => {
      if (conv === "%") return "%";
      const arg = args.length ? args[ai++ % args.length] : "";
      const width = parseInt(spec) || 0;
      const padNum = (s: string) => (width > 0 ? (String(flags).includes("0") && !String(flags).includes("-") ? s.padStart(width, "0") : s.padStart(width)) : s);
      if (conv === "s") { return width > 0 ? (String(flags).includes("-") ? arg.padEnd(width) : arg.padStart(width)) : arg; }
      if (conv === "c") return arg ? arg[0] : "";
      const num = parseFloat(arg) || 0;
      if (conv === "d" || conv === "i") return padNum(String(Math.trunc(num)));
      if (conv === "x") return padNum(Math.trunc(num).toString(16));
      if (conv === "X") return padNum(Math.trunc(num).toString(16).toUpperCase());
      if (conv === "o") return padNum(Math.trunc(num).toString(8));
      if (conv === "f") { const p = spec.includes(".") ? parseInt(spec.split(".")[1]) || 0 : 6; return padNum(num.toFixed(p)); }
      return arg;
    });
    let out = render(fmt);
    while (args.length && ai < args.length) out += render(fmt);
    return out;
  });
  verb("mkdir", "LIVE", "mkdir <dir>", async (ctx) => { if (!need(ctx, 1, "mkdir <dir>")) return; ctx.os.mkdir(ctx.args[0]); });
  verb("touch", "LIVE", "touch <file> — make it, or mark it now", async (ctx) => { if (!need(ctx, 1, "touch <file>")) return; const p = resolve(ctx, ctx.args[0]); if (!ctx.os.node(p)) ctx.os.write(p, ""); else { const n = ctx.os.node(p)!; n.mtime = Date.now(); ctx.os.saveSoon(); } });
  verb("rm", "LIVE", "rm [-r] <path>", async (ctx) => { const rec = ctx.args.includes("-r") || ctx.args.includes("-rf"); const target = ctx.args.find((a) => !a.startsWith("-")); if (!target) { ctx.io.print("usage: rm [-r] <path>", "err"); return; } ctx.os.remove(target, rec); });
  verb("cp", "LIVE", "cp <from> <to>", async (ctx) => { if (!need(ctx, 2, "cp <from> <to>")) return; const b = fileBytes(ctx, ctx.args[0]); const n = ctx.os.node(ctx.args[0]); if (n?.binary) ctx.os.writeBytes(ctx.args[1], b); else ctx.os.write(ctx.args[1], td.decode(b)); });
  verb("mv", "LIVE", "mv <from> <to>", async (ctx) => { if (!need(ctx, 2, "mv <from> <to>")) return; const b = fileBytes(ctx, ctx.args[0]); const n = ctx.os.node(ctx.args[0]); if (n?.binary) ctx.os.writeBytes(ctx.args[1], b); else ctx.os.write(ctx.args[1], td.decode(b)); ctx.os.remove(ctx.args[0], true); });
  verb("head", "LIVE", "head [-n n] [file]", async (ctx) => { const nIdx = ctx.args.indexOf("-n"); const n = nIdx >= 0 ? Number(ctx.args[nIdx + 1]) || 10 : 10; const f = ctx.args.find((a, i) => !a.startsWith("-") && i !== nIdx + 1); const text = f ? ctx.os.read(f) : ctx.stdin; if (text === null) throw new Error(`no such file: ${f}`); return (text || "").split("\n").slice(0, n).join("\n"); });
  verb("tail", "LIVE", "tail [-n n] [file]", async (ctx) => { const nIdx = ctx.args.indexOf("-n"); const n = nIdx >= 0 ? Number(ctx.args[nIdx + 1]) || 10 : 10; const f = ctx.args.find((a, i) => !a.startsWith("-") && i !== nIdx + 1); const text = f ? ctx.os.read(f) : ctx.stdin; if (text === null) throw new Error(`no such file: ${f}`); return (text || "").split("\n").slice(-n).join("\n"); });
  verb("wc", "LIVE", "wc [file] — lines, words, bytes", async (ctx) => { const text = ctx.args[0] ? ctx.os.read(ctx.args[0]) : ctx.stdin; if (text === null) throw new Error(`no such file: ${ctx.args[0]}`); const t = text || ""; return `${t.split("\n").length} lines · ${t.split(/\s+/).filter(Boolean).length} words · ${te.encode(t).length} bytes${ctx.args[0] ? "  " + ctx.args[0] : ""}`; });
  verb("grep", "LIVE", "grep [-i] <pattern> [file] — hunt lines", async (ctx) => {
    const ci = ctx.args.includes("-i");
    const pat = ctx.args.find((a) => !a.startsWith("-"));
    const file = ctx.args.filter((a) => !a.startsWith("-"))[1];
    if (!pat) { ctx.io.print("usage: grep [-i] <pattern> [file]", "err"); return; }
    const text = file ? ctx.os.read(file) : ctx.stdin;
    if (text === null) throw new Error(`no such file: ${file}`);
    const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ci ? "i" : "");
    return (text || "").split("\n").filter((l) => re.test(l)).join("\n") || "(no matches)";
  });
  verb("find", "LIVE", "find [dir] [name-part] — walk the tree", async (ctx) => {
    const start = ctx.args[0] ? resolve(ctx, ctx.args[0]) : ctx.os.cwd;
    const needle = (ctx.args[1] || "").toLowerCase();
    const hits: string[] = [];
    for (const key of ctx.os.files.keys()) if (key.startsWith(start) && (!needle || key.toLowerCase().includes(needle))) hits.push(key);
    return hits.sort().join("\n") || "(nothing found)";
  });
  verb("tree", "LIVE", "tree [dir] — the tree, drawn", async (ctx) => {
    const start = ctx.args[0] ? resolve(ctx, ctx.args[0]) : ctx.os.cwd;
    const lines = [start];
    const walk = (dir: string, prefix: string) => {
      const names = ctx.os.list(dir);
      names.forEach((n, i) => {
        const last = i === names.length - 1;
        const path = (dir === "/" ? "" : dir) + "/" + n;
        lines.push(`${prefix}${last ? "└── " : "├── "}${n}${ctx.os.isDir(path) ? "/" : ""}`);
        if (ctx.os.isDir(path)) walk(path, prefix + (last ? "    " : "│   "));
      });
    };
    walk(start, "");
    return lines.join("\n");
  });
  verb("stat", "LIVE", "stat <path>", async (ctx) => { if (!need(ctx, 1, "stat <path>")) return; const p = resolve(ctx, ctx.args[0]); const n = ctx.os.node(p); if (!n) throw new Error(`no such file: ${p}`); return `${p}\ntype: ${n.type}\nmodified: ${new Date(n.mtime).toISOString()}${n.type === "file" ? `\nbytes: ${ctx.os.readBytes(p)?.length}` : ""}`; });
  verb("du", "LIVE", "du — the tree's weight", async (ctx) => { let total = 0; ctx.os.files.forEach((n) => { if (n.type === "file") total += n.binary ? Math.floor(n.binary.length * 3 / 4) : (n.content || "").length; }); return `${total} bytes across ${ctx.os.files.size} nodes`; });
  verb("sort", "LIVE", "sort [file] — sort lines", async (ctx) => { const t = ctx.args[0] ? ctx.os.read(ctx.args[0]) : ctx.stdin; if (t === null) throw new Error("no such file"); return (t || "").split("\n").sort().join("\n"); });
  verb("uniq", "LIVE", "uniq [file] — collapse repeats", async (ctx) => { const t = ctx.args[0] ? ctx.os.read(ctx.args[0]) : ctx.stdin; if (t === null) throw new Error("no such file"); return [...new Set((t || "").split("\n"))].join("\n"); });
  verb("tr", "LIVE", "tr a b — swap characters in stdin", async (ctx) => { if (!need(ctx, 2, "tr <from-chars> <to-chars>")) return; let s = ctx.stdin; for (let i = 0; i < ctx.args[0].length; i++) s = s.split(ctx.args[0][i]).join(ctx.args[1][i] || ""); return s; });
  verb("cut", "LIVE", "cut -d c -f n [file]", async (ctx) => {
    const dIdx = ctx.args.indexOf("-d"); const fIdx = ctx.args.indexOf("-f");
    const delim = dIdx >= 0 ? ctx.args[dIdx + 1] : "\t"; const field = fIdx >= 0 ? Number(ctx.args[fIdx + 1]) || 1 : 1;
    const file = ctx.args.find((a, i) => !a.startsWith("-") && i !== dIdx + 1 && i !== fIdx + 1);
    const t = file ? ctx.os.read(file) : ctx.stdin; if (t === null) throw new Error("no such file");
    return (t || "").split("\n").map((l) => l.split(delim)[field - 1] ?? "").join("\n");
  });
  verb("basename", "LIVE", "basename <path>", async (ctx) => ctx.args[0]?.split("/").filter(Boolean).pop() || "/");
  verb("dirname", "LIVE", "dirname <path>", async (ctx) => { const parts = (ctx.args[0] || "").split("/").filter(Boolean); parts.pop(); return "/" + parts.join("/"); });
  verb("file", "LIVE", "file <path> — what is it, really (magic bytes, not the name)", async (ctx) => {
    if (!need(ctx, 1, "file <path>")) return;
    const b = fileBytes(ctx, ctx.args[0]);
    const v = identifyFile(b, ctx.args[0]);
    return `${ctx.args[0]}: ${v.kind} — ${v.summary}`;
  });
  verb("parse", "LIVE", "parse <path> — the file bench reads it whole", async (ctx) => {
    if (!need(ctx, 1, "parse <path>")) return;
    const b = fileBytes(ctx, ctx.args[0]);
    const v = identifyFile(b, ctx.args[0]);
    return JSON.stringify({ file: ctx.args[0], kind: v.kind, summary: v.summary, ...v.details }, null, 2);
  });
  verb("hexdump", "LIVE", "hexdump <path> — the bytes, honestly", async (ctx) => { if (!need(ctx, 1, "hexdump <path>")) return; return hexdump(fileBytes(ctx, ctx.args[0])); });
  verb("xxd", "LIVE", "xxd <path>", async (ctx) => { if (!need(ctx, 1, "xxd <path>")) return; return hexdump(fileBytes(ctx, ctx.args[0])); });
  verb("import", "LIVE", "import — bring a file from this device into the tree", async (ctx) => { ctx.io.openApp?.("files", "import"); return "the Files room is open with its importer — pick a file and it lands in your cwd."; });
  verb("strings", "LIVE", "strings <path> — the readable runs inside a binary", async (ctx) => {
    if (!need(ctx, 1, "strings <path>")) return;
    const b = fileBytes(ctx, ctx.args[0]);
    const runs: string[] = []; let cur = "";
    for (const byte of b) { if (byte >= 32 && byte < 127) cur += String.fromCharCode(byte); else { if (cur.length >= 4) runs.push(cur); cur = ""; } }
    if (cur.length >= 4) runs.push(cur);
    return runs.slice(0, 300).join("\n") || "(no readable runs of 4+)";
  });
}

/* ============ CODECS + CRYPTO ============ */
function registerCrypto() {
  verb("base64", "LIVE", "base64 [-d] <text|file>", async (ctx) => {
    const decode = ctx.args.includes("-d");
    const src = ctx.args.find((a) => !a.startsWith("-")) || "";
    const input = ctx.os.node(src) ? fileBytes(ctx, src) : null;
    if (decode) { const text = input ? td.decode(input) : src; return td.decode(b64ToB(text)); }
    const bytes = input || te.encode(src || ctx.stdin);
    return bToB64(bytes);
  });
  verb("b64deep", "LIVE", "b64deep <text> — base64, unwrapped to the bottom", async (ctx) => {
    let cur = (ctx.args[0] || "").trim(); const layers: string[] = [];
    for (let i = 0; i < 8; i++) {
      try { const decoded = td.decode(b64ToB(cur)); layers.push(`layer ${i + 1}: ${decoded.slice(0, 200)}`); if (!/^[A-Za-z0-9+/=\s]+$/.test(decoded.trim()) || decoded.trim().length < 8) break; cur = decoded.trim(); }
      catch { break; }
    }
    return layers.join("\n") || "not base64.";
  });
  verb("hex", "LIVE", "hex [-d] <text>", async (ctx) => {
    const decode = ctx.args.includes("-d");
    const src = ctx.args.find((a) => !a.startsWith("-")) || "";
    return decode ? td.decode(hexToB(src)) : bToHex(te.encode(src || ctx.stdin));
  });
  verb("rot13", "LIVE", "rot13 <text>", async (ctx) => (ctx.args.join(" ") || ctx.stdin).replace(/[a-zA-Z]/g, (c) => String.fromCharCode((c <= "Z" ? 65 : 97) + ((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26))));
  verb("xor", "LIVE", "xor <hexkey> <hexdata> — the old handshake", async (ctx) => {
    if (!need(ctx, 2, "xor <hexkey> <hexdata>")) return;
    const key = hexToB(ctx.args[0]); const data = hexToB(ctx.args[1]);
    const outBytes = new Uint8Array(data.length);
    data.forEach((b, i) => (outBytes[i] = b ^ key[i % key.length]));
    return bToHex(outBytes);
  });
  verb("md5", "LIVE", "md5 <text|file>", async (ctx) => { const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin); return md5(b); });
  verb("sha1", "LIVE", "sha1 <text|file>", async (ctx) => { const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin); return await (async () => bToHex(new Uint8Array(await crypto.subtle.digest("SHA-1", b as BufferSource))))(); });
  verb("sha256", "LIVE", "sha256 <text|file>", async (ctx) => { const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin); return bToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))); });
  verb("sha512", "LIVE", "sha512 <text|file>", async (ctx) => { const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin); return bToHex(new Uint8Array(await crypto.subtle.digest("SHA-512", b as BufferSource))); });
  verb("hmac", "LIVE", "hmac <key> <text> — HMAC-SHA-256", async (ctx) => {
    if (!need(ctx, 2, "hmac <key> <text>")) return;
    const key = await crypto.subtle.importKey("raw", te.encode(ctx.args[0]), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return bToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(ctx.args.slice(1).join(" ")))));
  });
  verb("crc32", "LIVE", "crc32 <text|file>", async (ctx) => {
    const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin);
    const table: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    let crc = 0xffffffff; b.forEach((x) => (crc = table[(crc ^ x) & 0xff] ^ (crc >>> 8)));
    return "0x" + ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  });
  verb("entropy", "LIVE", "entropy <text|file> — Shannon, honestly", async (ctx) => {
    const src = ctx.args[0] || ""; const b = ctx.os.node(src) ? fileBytes(ctx, src) : te.encode(src || ctx.stdin);
    const counts = new Array(256).fill(0); b.forEach((x) => counts[x]++);
    let e = 0; for (const c of counts) if (c) { const p = c / b.length; e -= p * Math.log2(p); }
    return `${Math.round(e * 1000) / 1000} bits/byte over ${b.length} bytes — ${e > 7.2 ? "compressed or encrypted, almost surely" : e > 5 ? "encoded or structured" : "ordinary"}`;
  });
  verb("uuid", "LIVE", "uuid — a fresh name for a thing", async () => crypto.randomUUID());
  verb("passwd", "LIVE", "passwd [n] — a generated password", async (ctx) => {
    const len = Math.min(128, Math.max(8, Number(ctx.args[0]) || 20));
    const sets = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+";
    const rnd = crypto.getRandomValues(new Uint32Array(len));
    return [...rnd].map((r) => sets[r % sets.length]).join("");
  });
  verb("totp", "LIVE", "totp <base32-secret> — the current six digits (RFC 6238)", async (ctx) => {
    if (!need(ctx, 1, "totp <base32-secret>")) return;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const ch of ctx.args[0].replace(/[\s=]/g, "").toUpperCase()) { const v = alphabet.indexOf(ch); if (v < 0) throw new Error("not base32"); bits += v.toString(2).padStart(5, "0"); }
    const keyBytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < keyBytes.length; i++) keyBytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    const counter = Math.floor(Date.now() / 30000);
    const msg = new Uint8Array(8); let c = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
    const off = mac[mac.length - 1] & 0xf;
    const code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
    return `${String(code % 1000000).padStart(6, "0")}  (${30 - (Math.floor(Date.now() / 1000) % 30)}s left in this window)`;
  });
  verb("jwtcheck", "LIVE", "jwtcheck <token> — decoded and graded, no wire", async (ctx) => {
    if (!need(ctx, 1, "jwtcheck <token>")) return;
    const parts = ctx.args[0].split(".");
    if (parts.length !== 3) return "not a JWT: needs three dot-separated parts.";
    const header = JSON.parse(td.decode(b64ToB(parts[0])));
    const payload = JSON.parse(td.decode(b64ToB(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    const findings: string[] = [];
    if (String(header.alg).toLowerCase() === "none") findings.push("CRITICAL alg=none");
    if (payload.exp && payload.exp < now) findings.push("EXPIRED");
    if (!payload.exp) findings.push("no exp — a leak is forever");
    if (header.jku || header.x5u) findings.push("remote key URL in header (jku/x5u)");
    return JSON.stringify({ header, payload, findings: findings.length ? findings : ["no structural red flags (signature not verified — use the bench Vault/JWT room to verify)"] }, null, 2);
  });
  verb("jwtdeep", "LIVE", "jwtdeep <token> — a token read to the bottom", async (ctx) => {
    if (!need(ctx, 1, "jwtdeep <token>")) return;
    const parts = ctx.args[0].split(".");
    if (parts.length !== 3) return "not a JWT.";
    const header = JSON.parse(td.decode(b64ToB(parts[0])));
    const payload = JSON.parse(td.decode(b64ToB(parts[1])));
    const claims = Object.entries(payload).map(([k, v]) => {
      let note = "";
      if ((k === "exp" || k === "iat" || k === "nbf") && typeof v === "number") note = ` = ${new Date(v * 1000).toISOString()}`;
      return `${k}: ${JSON.stringify(v)}${note}`;
    });
    return [`header: ${JSON.stringify(header)}`, `signature: ${b64ToB(parts[2]).length} bytes`, "claims:", ...claims].join("\n");
  });
  verb("calc", "LIVE", "calc <expression> — exact arithmetic", async (ctx) => {
    const expr = ctx.args.join(" ");
    if (!/^[0-9+\-*/().\s%<>]+$/.test(expr)) return "calc speaks arithmetic only.";
    const val = Function(`"use strict"; return (${expr})`)();
    return String(val);
  });
  verb("subnet", "LIVE", "subnet <a.b.c.d/prefix> — the CIDR math", async (ctx) => {
    if (!need(ctx, 1, "subnet <a.b.c.d/prefix>")) return;
    const [ipPart, pfx] = ctx.args[0].split("/");
    const oct = ipPart.split(".").map(Number);
    if (oct.length !== 4 || oct.some((o) => isNaN(o) || o < 0 || o > 255)) return "not an IPv4 address.";
    const p = Number(pfx ?? 24);
    const ip = oct.reduce((a, o) => a * 256 + o, 0) >>> 0;
    const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    const net = (ip & mask) >>> 0; const bcast = (net | (~mask >>> 0)) >>> 0;
    const toIp = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    return [`address ${toIp(ip)}  netmask ${toIp(mask)}  network ${toIp(net)}/${p}`, `broadcast ${toIp(bcast)}  usable ${p >= 31 ? Math.pow(2, 32 - p) : Math.pow(2, 32 - p) - 2} hosts (${toIp(p >= 31 ? net : net + 1)} – ${toIp(p >= 31 ? bcast : bcast - 1)})`].join("\n");
  });
}

export function registerCoreVerbs() {
  registerHouse();
  registerFiles();
  registerCrypto();
}
export { api, exchange, edgeDns, dnsRecords, fmtBytes, fileBytes, hostPort, need, out, te, td };
