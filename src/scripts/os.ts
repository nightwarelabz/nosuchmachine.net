// BLACKSITE OS — window manager and rooms. The shell lives in os-shell.ts;
// this file is the glass: boot, desktop, windows, and the room apps.
import { BlacksiteOS, VERBS, execLine } from "./os-shell";
import type { ShellIO } from "./os-shell";
import { registerCoreVerbs } from "./os-verbs";
import { registerWireVerbs } from "./os-verbs2";
import { registerBenchVerbs } from "./os-verbs3";
import { registerLimitReasons } from "./os-limits";
import { registerBottleVerbs, buildBottleApp } from "./os-bottle";
import roster from "../data/blacksite-commands.json";
import { OS_RELEASE, registerRows, vfsStats } from "./os-register";
import { identifyFile, hexdump } from "./os-parse";
import { Chip8, CHIP8_DEMO } from "./os-engines2";
import { SshSession } from "./os-ssh";

const os = new BlacksiteOS();
let zTop = 10;
const windows = new Map<string, HTMLElement>();
let winCounter = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function root(): HTMLElement { return document.getElementById("os-root")!; }
function tdDecode(bytes: Uint8Array): string { return new TextDecoder().decode(bytes); }
function desktop(): HTMLElement { return document.querySelector(".os-desktop")!; }

const APPS: Record<string, { title: string; icon: string }> = {
  terminal: { title: "Terminal — blacksite sh", icon: "▸_" },
  files: { title: "Files", icon: "🗀" },
  editor: { title: "Editor", icon: "✎" },
  processes: { title: "Processes — the board", icon: "☰" },
  journal: { title: "Journal", icon: "🕮" },
  gauntlet: { title: "Gauntlet & Diagnose", icon: "⚔" },
  settings: { title: "House Settings", icon: "⚙" },
  help: { title: "Help — the 426", icon: "?" },
  bottle: { title: "Daylight Bottle", icon: "☀" },
  system: { title: "System — the Noether register", icon: "⬢" },
};

export function openApp(app: string, arg?: string) {
  if (app === "bench" || app === "suite") { window.location.href = "/"; return; }
  const meta = APPS[app];
  if (!meta) return;
  const key = app === "editor" ? `editor:${arg || ""}` : app;
  const existing = windows.get(key);
  if (existing) { focusWindow(existing); const body = existing.querySelector<HTMLElement>(".os-win-body"); body?.dispatchEvent(new CustomEvent("os:focus-arg", { detail: arg })); return; }
  const win = el("section", "os-window");
  win.dataset.app = app;
  win.style.zIndex = String(++zTop);
  const offset = (winCounter++ % 6) * 28;
  win.style.left = `${60 + offset}px`;
  win.style.top = `${36 + offset}px`;
  const head = el("header", "os-win-head");
  const title = el("span", "os-win-title", `${meta.icon}  ${meta.title}${app === "editor" && arg ? ` — ${arg}` : ""}`);
  const controls = el("span", "os-win-controls");
  const minBtn = el("button", "os-win-btn", "–");
  minBtn.setAttribute("aria-label", "Minimize");
  const maxBtn = el("button", "os-win-btn", "☐");
  maxBtn.setAttribute("aria-label", "Maximize");
  const closeBtn = el("button", "os-win-btn os-win-close", "×");
  closeBtn.setAttribute("aria-label", "Close");
  controls.append(minBtn, maxBtn, closeBtn);
  head.append(title, controls);
  const body = el("div", "os-win-body");
  win.append(head, body);
  const resize = el("div", "os-win-resize");
  win.appendChild(resize);
  desktop().appendChild(win);
  windows.set(key, win);
  addTaskbarButton(key, meta.title, win);
  head.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest("button")) return; startDrag(e, win); });
  resize.addEventListener("pointerdown", (e) => startResize(e, win));
  win.addEventListener("pointerdown", () => focusWindow(win));
  closeBtn.addEventListener("click", () => { win.remove(); windows.delete(key); document.querySelector(`[data-task="${CSS.escape(key)}"]`)?.remove(); });
  minBtn.addEventListener("click", () => { win.style.display = "none"; });
  const toggleMax = () => toggleMaximize(win);
  maxBtn.addEventListener("click", toggleMax);
  head.addEventListener("dblclick", (e) => { if (!(e.target as HTMLElement).closest("button")) toggleMax(); });
  win.classList.add("os-win-in");
  focusWindow(win);
  BUILDERS[app]?.(body, arg);
}
function focusWindow(win: HTMLElement) {
  win.style.zIndex = String(++zTop);
  win.style.display = "";
  document.querySelectorAll(".os-window").forEach((w) => w.classList.toggle("focused", w === win));
}
function addTaskbarButton(key: string, title: string, win: HTMLElement) {
  const bar = document.getElementById("os-taskbar-apps")!;
  const btn = el("button", "os-task-btn", title);
  btn.dataset.task = key;
  btn.addEventListener("click", () => { win.style.display = win.style.display === "none" ? "" : win.style.display; focusWindow(win); });
  bar.appendChild(btn);
}
function toggleMaximize(win: HTMLElement) {
  if (win.classList.contains("maxed")) {
    win.classList.remove("maxed");
    const prev = (win as any)._prevRect as { l: string; t: string; w: string; h: string } | undefined;
    if (prev) { win.style.left = prev.l; win.style.top = prev.t; win.style.width = prev.w; win.style.height = prev.h; }
  } else {
    (win as any)._prevRect = { l: win.style.left, t: win.style.top, w: win.style.width, h: win.style.height };
    win.classList.add("maxed");
  }
  focusWindow(win);
}
function startDrag(e: PointerEvent, win: HTMLElement) {
  if (win.classList.contains("maxed")) return;
  const startX = e.clientX - win.offsetLeft;
  const startY = e.clientY - win.offsetTop;
  const move = (ev: PointerEvent) => {
    win.style.left = `${Math.max(-40, Math.min(window.innerWidth - 80, ev.clientX - startX))}px`;
    win.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - startY))}px`;
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function startResize(e: PointerEvent, win: HTMLElement) {
  e.preventDefault();
  const startW = win.offsetWidth, startH = win.offsetHeight, startX = e.clientX, startY = e.clientY;
  const move = (ev: PointerEvent) => {
    win.style.width = `${Math.max(320, startW + ev.clientX - startX)}px`;
    win.style.height = `${Math.max(200, startH + ev.clientY - startY)}px`;
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/* ---------------- Terminal ---------------- */
function buildTerminal(body: HTMLElement) {
  body.classList.add("os-term-body");
  const transcript = el("div", "os-term-out");
  const line = el("div", "os-term-line");
  const prompt = el("span", "os-term-prompt");
  const input = document.createElement("input");
  input.className = "os-term-input";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("aria-label", "Terminal input");
  line.append(prompt, input);
  body.append(transcript, line);
  const setPrompt = () => { prompt.textContent = `${os.env.USER}@blacksite:${os.cwd.replace(os.env.HOME, "~")}$ `; };
  setPrompt();
  const io: ShellIO = {
    print: (text, cls) => {
      const pre = el("pre", "os-term-text" + (cls ? ` ${cls}` : ""));
      pre.textContent = text;
      transcript.appendChild(pre);
      body.scrollTop = body.scrollHeight;
    },
    clear: () => { transcript.innerHTML = ""; },
    openApp: (app, arg) => openApp(app, arg),
    setWallpaper: (kind) => setWallpaper(kind),
    setTheme: (name) => applyTheme(name),
  };
  io.print("BLACKSITE OS — web edition. `help` for the 426, `limits` for the honest physics, `gauntlet` to watch the room test itself.", "dim");
  io.print("doctrine: one knock, read, grade. public targets only.", "dim");
  // the launcher (start button / Ctrl-K) can hand this terminal a line to run
  document.addEventListener("blacksite:run", async (e) => {
    if (!body.isConnected) return;
    const cmd = (e as CustomEvent).detail as string;
    if (!cmd) return;
    io.print(`${prompt.textContent}${cmd}`, "cmd");
    input.disabled = true;
    await execLine(os, cmd, io);
    input.disabled = false;
    setPrompt();
  });
  let histIdx = os.history.length;
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const cmd = input.value;
      input.value = "";
      io.print(`${prompt.textContent}${cmd}`, "cmd");
      if (cmd.trim() === "exit" || cmd.trim() === "logout") {
        const win = body.closest<HTMLElement>(".os-window");
        win?.querySelector<HTMLButtonElement>(".os-win-close")?.click();
        return;
      }
      input.disabled = true;
      await execLine(os, cmd, io);
      input.disabled = false;
      histIdx = os.history.length;
      setPrompt();
      input.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx > 0) input.value = os.history[--histIdx] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < os.history.length - 1) input.value = os.history[++histIdx] || "";
      else { histIdx = os.history.length; input.value = ""; }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const cur = input.value;
      const words = cur.split(/\s+/);
      const last = words[words.length - 1] || "";
      let candidates: string[] = [];
      if (words.length <= 1) candidates = [...VERBS.keys()].filter((v) => v.startsWith(last));
      else candidates = os.list(os.cwd).filter((n) => n.startsWith(last)).map((n) => (os.isDir(`${os.cwd}/${n}`) ? n + "/" : n));
      if (candidates.length === 1) { words[words.length - 1] = candidates[0] + (words.length <= 1 ? " " : ""); input.value = words.join(" "); }
      else if (candidates.length > 1) io.print(candidates.join("  "), "dim");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault(); io.clear();
    } else if (e.key === "c" && e.ctrlKey) {
      os.stopFlag = true;
      io.print("^C", "dim");
    }
  });
  body.addEventListener("click", () => input.focus());
  setTimeout(() => input.focus(), 50);
}

/* ---------------- Files ---------------- */
function buildFiles(body: HTMLElement) {
  let current = os.cwd;
  const bar = el("div", "os-files-bar");
  const pathLabel = el("span", "os-files-path");
  const upBtn = el("button", "os-btn", "↑ up");
  const importBtn = el("button", "os-btn", "import file…");
  const newFileBtn = el("button", "os-btn", "new file");
  const newDirBtn = el("button", "os-btn", "new folder");
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.hidden = true;
  bar.append(pathLabel, upBtn, importBtn, newFileBtn, newDirBtn, fileInput);
  const list = el("div", "os-files-list");
  const preview = el("pre", "os-plain os-files-preview");
  preview.textContent = "select a file to inspect it — the room's parsers read its bones (format, headers, strings) without opening it.";
  body.append(bar, list, preview);
  const render = () => {
    pathLabel.textContent = current;
    list.innerHTML = "";
    for (const name of os.list(current)) {
      const path = (current === "/" ? "" : current) + "/" + name;
      const isDir = os.isDir(path);
      const row = el("button", "os-file-row", `${isDir ? "🗀" : "🗎"} ${name}${isDir ? "/" : ""}`);
      row.addEventListener("dblclick", () => {
        if (isDir) { current = path; render(); }
        else openApp("editor", path);
      });
      row.addEventListener("click", () => {
        list.querySelectorAll(".os-file-row").forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
        if (isDir) { preview.textContent = `${path}/ — a folder. double-click to enter.`; return; }
        const bytes = os.readBytes(path);
        if (!bytes) { preview.textContent = "could not read that file."; return; }
        const id = identifyFile(bytes, name);
        const head = id.kind === "text" ? tdDecode(bytes.slice(0, 1200)) : hexdump(bytes.slice(0, 128), 0);
        preview.textContent = `${name} — ${id.summary} · ${bytes.length} bytes\n\n${head}`;
      });
      const actions = el("span", "os-file-actions");
      if (!isDir) {
        const dl = el("button", "os-btn small", "download");
        dl.addEventListener("click", (e) => { e.stopPropagation(); downloadFile(path); });
        const run = el("button", "os-btn small", "run");
        run.addEventListener("click", (e) => { e.stopPropagation(); openApp("terminal"); void execLine(os, `run ${path}`, termIO(body)); });
        actions.append(dl, run);
      }
      const del = el("button", "os-btn small danger", "delete");
      del.addEventListener("click", (e) => { e.stopPropagation(); try { os.remove(path, true); render(); } catch (err: any) { alert(err?.message || err); } });
      actions.append(del);
      row.appendChild(actions);
      list.appendChild(row);
    }
    if (!os.list(current).length) list.appendChild(el("p", "os-note", "(empty folder)"));
  };
  upBtn.addEventListener("click", () => { current = os.norm(current + "/.."); render(); });
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const target = os.norm(`${current}/${f.name}`);
    // text files stay text; binaries are kept base64 in the tree
    const looksText = bytes.slice(0, 4096).every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128);
    if (looksText && f.size < 512000) os.write(target, new TextDecoder().decode(bytes));
    else os.writeBytes(target, bytes);
    os.log(`imported ${f.name} (${f.size} bytes) into ${current}`);
    render();
  });
  newFileBtn.addEventListener("click", () => { const name = prompt("New file name:"); if (name) { try { os.write(os.norm(`${current}/${name}`), ""); render(); } catch (e: any) { alert(e?.message || e); } } });
  newDirBtn.addEventListener("click", () => { const name = prompt("New folder name:"); if (name) { try { os.mkdir(os.norm(`${current}/${name}`)); render(); } catch (e: any) { alert(e?.message || e); } } });
  body.addEventListener("os:focus-arg", ((e: CustomEvent) => { if (e.detail === "import") fileInput.click(); }) as EventListener);
  render();
}
function termIO(_body: HTMLElement): ShellIO {
  return { print: (t, cls) => console.log(`[blacksite] ${t} ${cls || ""}`), clear: () => undefined, openApp: (a, arg) => openApp(a, arg), setWallpaper, setTheme: applyTheme };
}
function downloadFile(path: string) {
  const bytes = os.readBytes(path);
  if (!bytes) return;
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = path.split("/").pop() || "file";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- Editor (vim manners) ---------------- */
function buildEditor(body: HTMLElement, arg?: string) {
  const path = arg ? os.norm(arg) : os.norm(`${os.cwd}/untitled.txt`);
  const area = document.createElement("textarea");
  area.className = "os-editor-area";
  area.setAttribute("spellcheck", "false");
  area.value = os.read(path) ?? "";
  const status = el("div", "os-editor-status");
  let mode: "normal" | "insert" | "command" = "insert";
  let commandLine = "";
  let dirty = false;
  const setStatus = (extra = "") => { status.textContent = `${path} — ${mode.toUpperCase()}${dirty ? " [+]" : ""}${extra ? " · " + extra : ""}`; };
  setStatus("i for insert discipline · Esc normal · :w save · :q leave — vim manners, web-sized");
  area.addEventListener("input", () => { dirty = true; setStatus(); });
  const save = () => { try { os.write(path, area.value); dirty = false; setStatus("written"); } catch (e: any) { setStatus(String(e?.message || e)); } };
  const quit = () => { body.closest<HTMLElement>(".os-window")?.querySelector<HTMLButtonElement>(".os-win-close")?.click(); };
  area.addEventListener("keydown", (e) => {
    if (mode === "command") {
      e.preventDefault();
      if (e.key === "Enter") {
        const cmd = commandLine.trim();
        commandLine = ""; mode = "normal";
        if (cmd === "w") save();
        else if (cmd === "q") { if (dirty) setStatus("unsaved — :q! to abandon"); else quit(); }
        else if (cmd === "wq") { save(); quit(); }
        else if (cmd === "q!") quit();
        else if (cmd.startsWith("w ")) { try { os.write(cmd.slice(2).trim(), area.value); dirty = false; setStatus("written"); } catch (err: any) { setStatus(String(err?.message || err)); } }
        else setStatus(`not a room command: :${cmd}`);
        setStatus();
      } else if (e.key === "Escape") { mode = "normal"; commandLine = ""; setStatus(); }
      else if (e.key === "Backspace") commandLine = commandLine.slice(0, -1);
      else if (e.key.length === 1) { commandLine += e.key; status.textContent = `:${commandLine}`; }
      return;
    }
    if (mode === "normal") {
      if (e.key === "i") { mode = "insert"; setStatus(); return; }
      if (e.key === ":") { mode = "command"; commandLine = ""; status.textContent = ":"; e.preventDefault(); return; }
      const pos = area.selectionStart;
      const lines = area.value.split("\n");
      let offset = 0; let lineIdx = 0;
      for (let i = 0; i < lines.length; i++) { if (offset + lines[i].length >= pos) { lineIdx = i; break; } offset += lines[i].length + 1; }
      const gotoLine = (idx: number, col = 0) => { const target = lines.slice(0, idx).reduce((a, l) => a + l.length + 1, 0) + col; area.setSelectionRange(target, target); };
      if (e.key === "h") area.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1));
      else if (e.key === "l") area.setSelectionRange(pos + 1, pos + 1);
      else if (e.key === "j") gotoLine(Math.min(lines.length - 1, lineIdx + 1), pos - lines.slice(0, lineIdx).reduce((a, l) => a + l.length + 1, 0));
      else if (e.key === "k") gotoLine(Math.max(0, lineIdx - 1), pos - lines.slice(0, lineIdx).reduce((a, l) => a + l.length + 1, 0));
      else if (e.key === "x") { area.value = area.value.slice(0, pos) + area.value.slice(pos + 1); area.setSelectionRange(pos, pos); dirty = true; }
      else if (e.key === "d") { /* dd handled on second d via keyup memory */ if ((area as any)._dd) { lines.splice(lineIdx, 1); area.value = lines.join("\n"); gotoLine(Math.min(lines.length - 1, lineIdx)); dirty = true; (area as any)._dd = false; } else (area as any)._dd = true; setTimeout(() => ((area as any)._dd = false), 500); }
      else if (e.key === "G") gotoLine(lines.length - 1);
      else if (e.key === "g") gotoLine(0);
      else return; // let other keys pass quietly in normal mode? no — normal mode swallows typing:
      e.preventDefault();
      setStatus();
      return;
    }
    if (e.key === "Escape") { mode = "normal"; setStatus(); }
  });
  body.append(area, status);
  setTimeout(() => area.focus(), 50);
}


const BOOT_AT = Date.now();
function buildChip8(body: HTMLElement, arg: string) {
  const wrap = el("div", "os-chip8");
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 32;
  canvas.className = "os-chip8-screen";
  const bar = el("div", "os-files-bar");
  const sel = document.createElement("select");
  sel.className = "os-bottle-select";
  const demoOpt = document.createElement("option"); demoOpt.value = ""; demoOpt.textContent = "built-in demo";
  sel.appendChild(demoOpt);
  const roms: string[] = [];
  const scan = (dir: string) => { for (const n of os.list(dir)) { const p = (dir === "/" ? "" : dir) + "/" + n; if (os.isDir(p)) { if (!p.startsWith("/sys")) scan(p); } else if (n.endsWith(".ch8")) roms.push(p); } };
  scan("/home");
  for (const r of roms) { const o = document.createElement("option"); o.value = r; o.textContent = r; sel.appendChild(o); }
  if (arg && roms.includes(arg)) sel.value = arg;
  const status = el("span", "os-note", "");
  bar.append(sel, status);
  wrap.append(bar, canvas);
  const keysNote = el("p", "os-note", "keys: 1 2 3 4 / Q W E R / A S D F / Z X C V map to the hex pad. click the screen, then play.");
  wrap.appendChild(keysNote);
  body.appendChild(wrap);
  const cpu = new Chip8();
  const KEYMAP: Record<string, number> = { "1": 1, "2": 2, "3": 3, "4": 0xc, q: 4, w: 5, e: 6, r: 0xd, a: 7, s: 8, d: 9, f: 0xe, z: 0xa, x: 0, c: 0xb, v: 0xf };
  const load = () => {
    cpu.load(sel.value ? (os.readBytes(sel.value) || CHIP8_DEMO) : CHIP8_DEMO);
    status.textContent = sel.value || "built-in demo";
  };
  sel.addEventListener("change", load);
  const down = (e: KeyboardEvent) => { const k = KEYMAP[e.key.toLowerCase()]; if (k !== undefined) { cpu.keys[k] = 1; e.preventDefault(); } };
  const up = (e: KeyboardEvent) => { const k = KEYMAP[e.key.toLowerCase()]; if (k !== undefined) cpu.keys[k] = 0; };
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", down);
  canvas.addEventListener("keyup", up);
  canvas.addEventListener("pointerdown", () => canvas.focus());
  load();
  let dead = false;
  const obs = new MutationObserver(() => { if (!document.body.contains(wrap)) { dead = true; obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
  const ctx2 = canvas.getContext("2d")!;
  let lastTimer = performance.now();
  const frame = () => {
    if (dead) return;
    for (let i = 0; i < 10; i++) cpu.cycle();
    const now = performance.now();
    if (now - lastTimer > 16) { cpu.tickTimers(); lastTimer = now; }
    if (cpu.drawFlag) {
      cpu.drawFlag = false;
      const img = ctx2.createImageData(64, 32);
      for (let i = 0; i < 64 * 32; i++) { const on = cpu.gfx[i]; img.data[i * 4] = on ? 120 : 8; img.data[i * 4 + 1] = on ? 255 : 14; img.data[i * 4 + 2] = on ? 170 : 10; img.data[i * 4 + 3] = 255; }
      ctx2.putImageData(img, 0, 0);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setTimeout(() => canvas.focus(), 80);
}

/* ————— SSH app: a real terminal over the room's SSH client ————— */
const ANSI_FG = ["#3a4458", "#ff5f57", "#3ddc84", "#ffb02e", "#58a6ff", "#d368d8", "#39c5cf", "#d7e3f4", "#6b7a94", "#ff848c", "#7bf0ab", "#ffd479", "#8fc2ff", "#eba8f2", "#7ae3ea", "#ffffff"];
function buildSsh(body: HTMLElement, arg: string) {
  const wrap = el("div", "os-ssh");
  const bar = el("div", "os-files-bar");
  const hostIn = document.createElement("input"); hostIn.className = "os-bottle-input"; hostIn.placeholder = "host"; hostIn.style.flex = "1";
  const portIn = document.createElement("input"); portIn.className = "os-bottle-input"; portIn.placeholder = "22"; portIn.style.width = "64px"; portIn.value = "22";
  const userIn = document.createElement("input"); userIn.className = "os-bottle-input"; userIn.placeholder = "user"; userIn.style.width = "110px";
  const connectBtn = el("button", "os-btn", "connect");
  bar.append(hostIn, portIn, userIn, connectBtn);
  if (arg) {
    const m = arg.match(/^(?:([^@]+)@)?([^:]+)(?::(\d+))?$/);
    if (m) { userIn.value = m[1] || ""; hostIn.value = m[2] || ""; if (m[3]) portIn.value = m[3]; }
  }
  const status = el("p", "os-note", "ssh — the room's own client. curve25519 + aes-gcm; the host key's fingerprint must be trusted by your hand before any password moves. the wire rides this site's bridge as ciphertext.");
  const promptRow = el("div", "os-ssh-prompt"); promptRow.style.display = "none";
  const screenEl = el("div", "os-ssh-screen");
  screenEl.tabIndex = 0;
  wrap.append(bar, status, promptRow, screenEl);
  body.appendChild(wrap);

  // the VT grid
  let cols = 80, rows = 24;
  type Cell = { ch: string; fg: number; bg: number; bold: boolean };
  const blank = (): Cell => ({ ch: " ", fg: 7, bg: -1, bold: false });
  let grid: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, blank));
  let cx = 0, cy = 0, fg = 7, bg = -1, bold = false;
  const scrollback: string[] = [];
  const renderLine = (line: Cell[]): string => {
    let out = "", cur = "";
    const flush = () => { if (cur) { out += cur; cur = ""; } };
    let lastKey = "";
    for (const cell of line) {
      const key = `${cell.fg}|${cell.bg}|${cell.bold ? 1 : 0}`;
      if (key !== lastKey) { flush(); cur = `<span style="color:${ANSI_FG[cell.fg]}${cell.bg >= 0 ? `;background:${ANSI_FG[cell.bg]}` : ""}${cell.bold ? ";font-weight:700" : ""}">`; lastKey = key; }
      cur += cell.ch === "<" ? "&lt;" : cell.ch === "&" ? "&amp;" : cell.ch;
    }
    flush();
    return out ? out + "</span>" : "";
  };
  const repaint = () => { screenEl.innerHTML = grid.map(renderLine).join("\n") || " "; };
  const scrollUp = () => { scrollback.push(grid[0].map((c) => c.ch).join("").replace(/\s+$/, "")); if (scrollback.length > 400) scrollback.shift(); grid.shift(); grid.push(Array.from({ length: cols }, blank)); };
  const decoder = new TextDecoder();
  let escState = 0; let escBuf = "";
  const feedText = (text: string) => {
    for (const ch of text) {
      if (escState === 1) { escState = ch === "[" ? 2 : ch === "]" ? 3 : 0; escBuf = ""; continue; }
      if (escState === 3) { if (ch === "\x07") escState = 0; continue; }
      if (escState === 2) {
        if (/[0-9;? ]/.test(ch)) { escBuf += ch; continue; }
        const params = escBuf.replace(/^\?/, "").split(";").map((x) => parseInt(x || "0", 10) || 0);
        const p = (i: number, d: number) => params[i] || d;
        if (ch === "H" || ch === "f") { cy = Math.min(rows - 1, p(0, 1) - 1); cx = Math.min(cols - 1, p(1, 1) - 1); }
        else if (ch === "A") cy = Math.max(0, cy - p(0, 1));
        else if (ch === "B") cy = Math.min(rows - 1, cy + p(0, 1));
        else if (ch === "C") cx = Math.min(cols - 1, cx + p(0, 1));
        else if (ch === "D") cx = Math.max(0, cx - p(0, 1));
        else if (ch === "G") cx = Math.min(cols - 1, p(0, 1) - 1);
        else if (ch === "d") cy = Math.min(rows - 1, p(0, 1) - 1);
        else if (ch === "J") { const mode = params[0] || 0; if (mode === 2) grid = Array.from({ length: rows }, () => Array.from({ length: cols }, blank)); else if (mode === 0) { for (let x = cx; x < cols; x++) grid[cy][x] = blank(); for (let y = cy + 1; y < rows; y++) grid[y] = Array.from({ length: cols }, blank); } }
        else if (ch === "K") { const mode = params[0] || 0; if (mode === 0) for (let x = cx; x < cols; x++) grid[cy][x] = blank(); else if (mode === 2) grid[cy] = Array.from({ length: cols }, blank); }
        else if (ch === "m") { if (!escBuf) { fg = 7; bg = -1; bold = false; } for (const v of params) { if (v === 0) { fg = 7; bg = -1; bold = false; } else if (v === 1) bold = true; else if (v === 22) bold = false; else if (v >= 30 && v <= 37) fg = v - 30; else if (v >= 40 && v <= 47) bg = v - 40; else if (v >= 90 && v <= 97) fg = v - 90 + 8; else if (v >= 100 && v <= 107) bg = v - 100 + 8; else if (v === 39) fg = 7; else if (v === 49) bg = -1; } }
        escState = 0; continue;
      }
      if (ch === "\x1b") { escState = 1; continue; }
      if (ch === "\r") { cx = 0; continue; }
      if (ch === "\n") { cy++; if (cy >= rows) { scrollUp(); cy = rows - 1; } continue; }
      if (ch === "\x08") { cx = Math.max(0, cx - 1); continue; }
      if (ch === "\x07") continue;
      if (ch === "\t") { cx = Math.min(cols - 1, (Math.floor(cx / 8) + 1) * 8); continue; }
      if (ch < " ") continue;
      if (cx >= cols) { cx = 0; cy++; if (cy >= rows) { scrollUp(); cy = rows - 1; } }
      grid[cy][cx] = { ch, fg, bg, bold };
      cx++;
    }
    repaint();
  };
  repaint();

  let session: SshSession | null = null;
  let ws: WebSocket | null = null;
  const askInWindow = (label: string, secret: boolean): Promise<string | null> => new Promise((resolve) => {
    promptRow.innerHTML = "";
    const lab = el("span", "os-note", label);
    const input = document.createElement("input");
    input.className = "os-bottle-input"; input.type = secret ? "password" : "text"; input.style.flex = "1";
    const ok = el("button", "os-btn", "send");
    const cancel = el("button", "os-btn", "cancel");
    promptRow.append(lab, input, ok, cancel);
    promptRow.style.display = "flex";
    setTimeout(() => input.focus(), 30);
    const done = (v: string | null) => { promptRow.style.display = "none"; promptRow.innerHTML = ""; screenEl.focus(); resolve(v); };
    ok.addEventListener("click", () => done(input.value));
    cancel.addEventListener("click", () => done(null));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); e.stopPropagation(); });
  });
  const confirmKey = (fingerprint: string, algorithm: string): Promise<boolean> => new Promise((resolve) => {
    promptRow.innerHTML = "";
    const lab = el("span", "os-note", `host key ${algorithm} — ${fingerprint} — trust this key?`);
    const ok = el("button", "os-btn", "trust & continue");
    const no = el("button", "os-btn danger", "refuse");
    promptRow.append(lab, ok, no);
    promptRow.style.display = "flex";
    ok.addEventListener("click", () => { promptRow.style.display = "none"; promptRow.innerHTML = ""; resolve(true); });
    no.addEventListener("click", () => { promptRow.style.display = "none"; promptRow.innerHTML = ""; resolve(false); });
  });

  const connect = () => {
    const refusal = os.gate("active");
    if (refusal) { status.textContent = refusal; return; }
    const host = hostIn.value.trim(); const port = Number(portIn.value) || 22; const user = userIn.value.trim();
    if (!host || !user) { status.textContent = "host and user, both — then connect."; return; }
    connectBtn.setAttribute("disabled", "true");
    status.textContent = `connecting to ${user}@${host}:${port} through the bridge…`;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/ssh-bridge?host=${encodeURIComponent(host)}&port=${port}`);
    ws.binaryType = "arraybuffer";
    const queue: Uint8Array[] = [];
    let open = false;
    session = new SshSession((bytes) => { if (open && ws?.readyState === 1) ws!.send(bytes as BufferSource); else queue.push(bytes.slice()); }, {
      onStatus: (m) => { status.textContent = m; },
      onData: (bytes) => feedText(decoder.decode(bytes, { stream: true })),
      confirmHostKey: confirmKey,
      getPassword: () => askInWindow(`password for ${user}@${host}`, true),
      onClose: (reason) => { status.textContent = `closed — ${reason}`; connectBtn.removeAttribute("disabled"); try { ws?.close(); } catch { /* gone */ } },
    }, user);
    ws.addEventListener("open", () => { open = true; for (const b of queue) ws!.send(b as BufferSource); queue.length = 0; void session!.connect(cols, rows).catch((e: any) => { status.textContent = `failed — ${e?.message || e}`; connectBtn.removeAttribute("disabled"); }); });
    ws.addEventListener("message", (ev) => { if (ev.data instanceof ArrayBuffer) session?.feed(new Uint8Array(ev.data)); });
    ws.addEventListener("close", () => { if (session) status.textContent = "closed — the bridge let go."; connectBtn.removeAttribute("disabled"); });
    ws.addEventListener("error", () => { status.textContent = "the bridge did not answer — the target may be unreachable or refused by the guard."; connectBtn.removeAttribute("disabled"); });
  };
  connectBtn.addEventListener("click", connect);
  screenEl.addEventListener("keydown", (e) => {
    if (!session) return;
    const send = (s: string) => session!.sendData(new TextEncoder().encode(s));
    if (e.key === "Enter") send("\r");
    else if (e.key === "Backspace") send("\x7f");
    else if (e.key === "Tab") { send("\t"); e.preventDefault(); }
    else if (e.key === "ArrowUp") send("\x1b[A");
    else if (e.key === "ArrowDown") send("\x1b[B");
    else if (e.key === "ArrowRight") send("\x1b[C");
    else if (e.key === "ArrowLeft") send("\x1b[D");
    else if (e.key === "Home") send("\x1b[H");
    else if (e.key === "End") send("\x1b[F");
    else if (e.key === "Delete") send("\x1b[3~");
    else if (e.ctrlKey && e.key.length === 1) send(String.fromCharCode(e.key.toLowerCase().charCodeAt(0) - 96));
    else if (e.key.length === 1 && !e.metaKey) send(e.key);
    else return;
    e.preventDefault();
  });
  screenEl.addEventListener("paste", (e) => { const text = e.clipboardData?.getData("text"); if (text && session) { session.sendData(new TextEncoder().encode(text)); e.preventDefault(); } });
  if (arg && hostIn.value) setTimeout(connect, 60);
}

function buildSystem(body: HTMLElement) {
  const wrap = el("div", "os-settings");
  const stats = el("div", "os-sys-grid");
  const vs = vfsStats(os.files as any);
  let lsBytes = 0; try { for (const k of Object.keys(localStorage)) if (k.startsWith("blacksite-")) lsBytes += (localStorage.getItem(k) || "").length; } catch { /* private mode */ }
  const liveCount = [...VERBS.values()].filter((v) => v.status === "LIVE").length;
  const edgeCount = [...VERBS.values()].filter((v) => v.status === "EDGE").length;
  const cells: Array<[string, string]> = [
    [OS_RELEASE.version + " " + OS_RELEASE.codename, "RELEASE"],
    [`${liveCount + edgeCount} (${liveCount} + ${edgeCount})`, "WORKING VERBS — IN-ROOM + EDGE"],
    ["426", "COMMANDS ON THE ROSTER"],
    [`${vs.files}`, "FILES IN THE VFS"],
    [`${(vs.bytes / 1024).toFixed(1)} KB`, "VFS CONTENT"],
    [`${(lsBytes / 1024).toFixed(1)} KB`, "LOCAL STORAGE FOOTPRINT"],
    [`${Math.floor((Date.now() - BOOT_AT) / 1000)}s`, "UPTIME (THIS BOOT)"],
    [os.emcon.toUpperCase(), "EMCON CONDITION"],
  ];
  for (const [v, k] of cells) { const c = el("div", "os-sys-stat"); c.append(el("strong", "", v), el("span", "", k)); stats.appendChild(c); }
  const h = el("h3", "", "THE COMPONENT REGISTER — every subsystem, declared");
  const table = el("table", "os-sys-table");
  const head = el("tr"); head.append(el("th", "", "COMPONENT"), el("th", "", "WHAT IT IS"), el("th", "", "STATE"));
  table.appendChild(head);
  const facts = { live: [...VERBS.values()].filter((v) => v.status === "LIVE").length, edge: [...VERBS.values()].filter((v) => v.status === "EDGE").length, emcon: os.emcon, skReady: typeof (window as any).Sk !== "undefined" };
  for (const [name, what, state] of registerRows(facts)) {
    const tr = el("tr");
    const tdState = el("td", "", state); tdState.style.color = state === "LIVE" ? "var(--os-green)" : "var(--os-muted)";
    tr.append(el("td", "", name), el("td", "", what), tdState);
    table.appendChild(tr);
  }
  const note = el("p", "os-note", "The register is the WUCI OS discipline carried to the web: components are declared, budgets are visible, and limits are named instead of hidden. Run `posture` in the terminal for the room's graded self-assessment, `register` for this table as text.");
  const refresh = el("button", "os-btn", "refresh the budgets");
  refresh.addEventListener("click", () => { body.innerHTML = ""; buildSystem(body); });
  wrap.append(stats, h, table, note, refresh);
  body.appendChild(wrap);
}

/* ---------------- Processes / Journal / Gauntlet / Settings / Help ---------------- */
function buildProcesses(body: HTMLElement) {
  const pre = el("pre", "os-plain");
  body.appendChild(pre);
  const render = () => {
    pre.textContent = ["  PID  STATE    ELAPSED  COMMAND", ...os.procs.slice(-30).map((p) => `${String(p.pid).padStart(5)}  ${p.state.padEnd(8)} ${String(Math.floor((Date.now() - p.started) / 1000)).padStart(6)}s  ${p.cmd}`)].join("\n") || "no processes yet.";
  };
  render();
  const timer = setInterval(() => { if (!body.isConnected) { clearInterval(timer); return; } render(); }, 1000);
}
function buildJournal(body: HTMLElement) {
  const pre = el("pre", "os-plain");
  const refresh = el("button", "os-btn", "refresh");
  refresh.addEventListener("click", () => { pre.textContent = os.journal.map((j) => `${j.at}  ${j.text}`).join("\n") || "the journal is empty."; });
  body.append(refresh, pre);
  refresh.click();
}
function buildGauntlet(body: HTMLElement) {
  const outPane = el("div", "os-term-out");
  const row = el("div", "os-btnrow");
  const runG = el("button", "os-btn primary", "RUN THE GAUNTLET");
  const runD = el("button", "os-btn", "RUN DIAGNOSE");
  row.append(runG, runD);
  body.append(row, outPane);
  const io: ShellIO = { print: (t, cls) => { const p = el("pre", "os-term-text" + (cls ? ` ${cls}` : "")); p.textContent = t; outPane.appendChild(p); }, clear: () => (outPane.innerHTML = ""), openApp, setWallpaper, setTheme: applyTheme };
  runG.addEventListener("click", () => void execLine(os, "gauntlet", io));
  runD.addEventListener("click", () => void execLine(os, "diagnose", io));
}
function buildSettings(body: HTMLElement) {
  const wrap = el("div", "os-settings");
  const themes = ["violent-redteam", "phosphor", "ember", "ghost", "arctic", "plumage"];
  const themeTitle = el("h3", "", "Theme");
  const themeRow = el("div", "os-btnrow");
  for (const t of themes) { const b = el("button", "os-btn" + (os.theme === t ? " primary" : ""), t); b.addEventListener("click", () => { applyTheme(t); buildSettingsRefresh(body); }); themeRow.appendChild(b); }
  const emconTitle = el("h3", "", "EMCON — the house condition");
  const emconRow = el("div", "os-btnrow");
  for (const c of ["open", "charlie", "bravo", "alpha"] as const) { const b = el("button", "os-btn" + (os.emcon === c ? " primary" : ""), c.toUpperCase()); b.addEventListener("click", () => { os.emcon = c; os.saveSoon(); updateEmconChip(); buildSettingsRefresh(body); }); emconRow.appendChild(b); }
  const wpTitle = el("h3", "", "Wallpaper — generated by the room");
  const wpRow = el("div", "os-btnrow");
  for (const w of ["stars", "plasma", "mandelbrot"]) {
    const b = el("button", "os-wp-thumb");
    const thumb = paintWallpaper(w, 132, 82); thumb.className = "os-wp-canvas";
    const label = el("span", "", w);
    b.append(thumb, label);
    b.addEventListener("click", () => setWallpaper(w));
    wpRow.appendChild(b);
  }
  { const b = el("button", "os-btn", "none — bare black"); b.addEventListener("click", () => setWallpaper("none")); wpRow.appendChild(b); }
  const dangerTitle = el("h3", "", "The reset");
  const resetBtn = el("button", "os-btn danger", "FACTORY RESET THE ROOM (wipes files, macros, settings)");
  resetBtn.addEventListener("click", () => { if (confirm("Wipe the room back to first boot?")) { os.reset(); applyTheme(os.theme); updateEmconChip(); window.location.reload(); } });
  const note = el("p", "os-note", "Files live in this browser's storage. A cleared browser is a wiped room. EMCON gates every wire verb: bravo refuses active probes, alpha refuses the wire entirely — try it, the refusals speak.");
  wrap.append(themeTitle, themeRow, emconTitle, emconRow, wpTitle, wpRow, dangerTitle, resetBtn, note);
  body.appendChild(wrap);
}
function buildSettingsRefresh(body: HTMLElement) { body.innerHTML = ""; buildSettings(body); }
function buildHelp(body: HTMLElement) {
  const search = document.createElement("input");
  search.className = "os-help-search";
  search.placeholder = "search the 426 — try 'smtp', 'modbus', 'jwt'…";
  const listEl = el("div", "os-help-list");
  body.append(search, listEl);
  const render = (q: string) => {
    listEl.innerHTML = "";
    const rows = (roster as any[]).filter((r) => !q || r.verb.includes(q) || r.cmd.includes(q) || r.desc.toLowerCase().includes(q) || r.section.includes(q));
    const head = el("p", "os-note", `${rows.length} of 426 commands · status is this room's honest standing`);
    listEl.appendChild(head);
    for (const r of rows.slice(0, 150)) {
      const status = VERBS.get(r.verb)?.status || "LIMIT";
      const row = el("div", "os-help-row");
      row.append(el("span", `os-status ${status.toLowerCase()}`, status), el("code", "", r.cmd), el("span", "os-help-desc", r.desc));
      listEl.appendChild(row);
    }
  };
  search.addEventListener("input", () => render(search.value.trim().toLowerCase()));
  render("");
}

const BUILDERS: Record<string, (body: HTMLElement, arg?: string) => void> = {
  terminal: buildTerminal, files: buildFiles, editor: buildEditor, processes: buildProcesses,
  journal: buildJournal, gauntlet: buildGauntlet, settings: buildSettings, help: buildHelp,
  bottle: (body) => buildBottleApp(body, os),
  system: buildSystem,
};

/* ---------------- theme / wallpaper / chrome ---------------- */
function applyTheme(name: string) {
  os.theme = name;
  os.saveSoon();
  root().dataset.theme = name;
}
function setWallpaper(kind: string) {
  const desk = desktop();
  if (kind === "none") { desk.style.backgroundImage = ""; return; }
  desk.style.backgroundImage = `url(${paintWallpaper(kind, 960, 600).toDataURL()})`;
}
function paintWallpaper(kind: string, W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  const accent = getComputedStyle(root()).getPropertyValue("--os-accent").trim() || "#ff3b47";
  const base = g.createLinearGradient(0, 0, W * 0.3, H);
  base.addColorStop(0, "#0a0f1a"); base.addColorStop(0.55, "#05070c"); base.addColorStop(1, "#030408");
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // nebula: two soft accent glows, low and slow
  const hexRgb = /^#?([0-9a-f]{6})$/i.exec(accent);
  const rgb = hexRgb ? [parseInt(hexRgb[1].slice(0, 2), 16), parseInt(hexRgb[1].slice(2, 4), 16), parseInt(hexRgb[1].slice(4, 6), 16)] : [255, 59, 71];
  const neb = (x: number, y: number, r: number, a: number) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
    rg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  g.globalCompositeOperation = "lighter";
  neb(W * 0.78, H * 0.2, W * 0.35, 0.1);
  neb(W * 0.16, H * 0.82, W * 0.31, 0.07);
  g.globalCompositeOperation = "source-over";
  if (kind === "stars") {
    for (let i = 0; i < 420; i++) { const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 1.5; g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.8})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillStyle = accent; g.beginPath(); g.arc(W * 0.8, H * 0.18, 2.6, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(W * 0.8 - 7, H * 0.18); g.lineTo(W * 0.8 + 7, H * 0.18); g.moveTo(W * 0.8, H * 0.18 - 7); g.lineTo(W * 0.8, H * 0.18 + 7); g.stroke();
  } else if (kind === "plasma" || kind === "mandelbrot") {
    const small = document.createElement("canvas"); small.width = 480; small.height = 300;
    const sg = small.getContext("2d")!;
    const img = sg.createImageData(480, 300);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 480; x++) {
      const idx = (y * 480 + x) * 4;
      if (kind === "plasma") {
        const v = Math.sin(x / 33) + Math.sin(y / 23) + Math.sin((x + y) / 39) + Math.sin(Math.hypot(x - 240, y - 150) / 19);
        img.data[idx] = 70 + 55 * Math.sin(v * 1.7); img.data[idx + 1] = 14 + 14 * Math.cos(v * 1.3); img.data[idx + 2] = 44 + 40 * Math.sin(v * 0.9 + 2); img.data[idx + 3] = 255;
      } else {
        let zx = 0, zy = 0; const cx = (x / 480) * 3.2 - 2.2, cy = (y / 300) * 2.2 - 1.1; let iter = 0;
        while (zx * zx + zy * zy < 4 && iter < 42) { const t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t; iter++; }
        img.data[idx] = iter * 6; img.data[idx + 1] = iter * 2; img.data[idx + 2] = 40 + iter * 5; img.data[idx + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.85; g.drawImage(small, 0, 0, W, H); g.globalAlpha = 1;
  }
  // vignette: the room darkens at its edges
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  return canvas;
}
function updateEmconChip() {
  const chip = document.getElementById("os-emcon-chip");
  if (chip) { chip.textContent = `EMCON ${os.emcon.toUpperCase()}`; chip.dataset.level = os.emcon; }
}

/* ---------------- boot ---------------- */
function boot() {
  registerCoreVerbs();
  registerWireVerbs();
  registerBenchVerbs();
  registerBottleVerbs();
  registerLimitReasons();
  applyTheme(os.theme);
  const overlay = document.getElementById("os-boot")!;
  const bootText = document.getElementById("os-boot-text")!;
  const lines = [
    "NIGHTWARE LABZ BIOS — blacksite web firmware 2.0 · NOETHER",
    "memory: the browser provides · storage: local, yours",
    "kernel: blacksite sh · vfs: mounted (persistent, this browser)",
    `engines: javascript native · python skulpt · verbs: ${[...VERBS.values()].filter((v) => v.status !== "LIMIT").length} working of 426 on the roster`,
    `emcon: ${os.emcon.toUpperCase()} · theme: ${os.theme}`,
    "doctrine loaded: one knock, read, grade.",
    "",
    "BLACKSITE IS NOW LIVE",
  ];
  let i = 0;
  const tick = () => {
    if (i < lines.length) { bootText.textContent += (i ? "\n" : "") + lines[i]; i++; setTimeout(tick, 110); }
    else setTimeout(() => { overlay.classList.add("done"); openApp("terminal"); if (window.location.hash === "#bottle") openApp("bottle"); setTimeout(() => overlay.remove(), 650); }, 420);
  };
  tick();
  // desktop icons
  const icons = document.getElementById("os-icons")!;
  const defs: Array<[string, string, string]> = [
    ["terminal", "▸_", "Terminal"], ["files", "🗀", "Files"], ["editor", "✎", "Editor"],
    ["processes", "☰", "Processes"], ["gauntlet", "⚔", "Gauntlet"], ["journal", "🕮", "Journal"],
    ["help", "?", "Help — 426"], ["settings", "⚙", "Settings"], ["bottle", "☀", "Daylight Bottle"], ["system", "⬢", "System"],
  ];
  for (const [app, icon, label] of defs) {
    const b = el("button", "os-icon");
    b.append(el("span", "os-icon-glyph", icon), el("span", "os-icon-label", label));
    b.addEventListener("dblclick", () => openApp(app, app === "editor" ? os.norm(`${os.cwd}/notes.txt`) : undefined));
    b.addEventListener("click", () => openApp(app, app === "editor" ? os.norm(`${os.cwd}/notes.txt`) : undefined));
    icons.appendChild(b);
  }
  const suiteIcon = el("button", "os-icon");
  suiteIcon.append(el("span", "os-icon-glyph", "⌖"), el("span", "os-icon-label", "Bench (web suite)"));
  suiteIcon.addEventListener("click", () => { window.location.href = "/"; });
  icons.appendChild(suiteIcon);
  // clock
  const clock = document.getElementById("os-clock")!;
  const tickClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  tickClock(); setInterval(tickClock, 1000);
  updateEmconChip();
  document.getElementById("os-emcon-chip")?.addEventListener("click", () => openApp("settings"));
  document.getElementById("os-start")?.addEventListener("click", () => toggleLauncher());
  document.addEventListener("blacksite:openapp", (e) => { const d = (e as CustomEvent).detail || {}; if (d.app) openApp(d.app, d.arg); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggleLauncher(); }
    if (e.altKey && e.key === "Tab") {
      e.preventDefault();
      const wins = [...windows.values()].filter((w) => w.style.display !== "none");
      if (wins.length > 1) {
        const sorted = wins.sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));
        focusWindow(sorted[0]);
      }
    }
  });
  document.addEventListener("blacksite:toast", (e) => osToast((e as CustomEvent).detail?.text || ""));
  document.addEventListener("blacksite:emcon", () => updateEmconChip());
  setWallpaper("stars");
}

/* ---------------- toasts + the start launcher ---------------- */
export function osToast(text: string) {
  if (!text) return;
  let stack = document.querySelector<HTMLElement>(".os-toasts");
  if (!stack) { stack = el("div", "os-toasts"); desktop().appendChild(stack); }
  const t = el("div", "os-toast", text);
  stack.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.4s"; setTimeout(() => t.remove(), 420); }, 4200);
}
let launcherEl: HTMLElement | null = null;
function toggleLauncher() { if (launcherEl) { launcherEl.remove(); launcherEl = null; } else openLauncher(); }
function openLauncher() {
  const desk = desktop();
  const box = el("div", "os-launcher");
  const input = document.createElement("input");
  input.placeholder = "launch an app, or type a command and press Enter…";
  input.setAttribute("aria-label", "Launcher");
  const list = el("div", "os-launcher-list");
  box.append(input, list);
  desk.appendChild(box);
  launcherEl = box;
  let selected = 0;
  const appDefs: Array<[string, string]> = Object.entries(APPS).map(([k, v]) => [k, `${v.icon}  ${v.title}`]);
  const render = () => {
    list.innerHTML = "";
    const q = input.value.trim().toLowerCase();
    const items: Array<{ label: string; small: string; go: () => void }> = [];
    if (!q) list.appendChild(el("div", "os-launch-head", "APPS"));
    for (const [key, label] of appDefs) if (!q || label.toLowerCase().includes(q)) items.push({ label, small: "APP", go: () => openApp(key) });
    if (q) {
      const cmdItems: Array<{ label: string; small: string; go: () => void }> = [];
      for (const [name, def] of VERBS) if (name.includes(q)) cmdItems.push({ label: `▸_ ${name}`, small: def.status, go: () => { openApp("terminal"); setTimeout(() => document.dispatchEvent(new CustomEvent("blacksite:run", { detail: name })), 60); } });
      if (cmdItems.length) { const h = el("div", "os-launch-head", "COMMANDS — ENTER RUNS IN THE TERMINAL"); list.appendChild(h); items.push(...cmdItems.slice(0, 8)); }
    }
    items.forEach((it, i) => {
      const b = el("button", "os-launch-item" + (i === selected ? " sel" : ""), it.label);
      b.appendChild(el("small", "", it.small));
      b.addEventListener("click", () => { toggleLauncher(); it.go(); });
      list.appendChild(b);
    });
    box.dataset.count = String(items.length);
    (box as any)._items = items;
  };
  input.addEventListener("input", () => { selected = 0; render(); });
  input.addEventListener("keydown", (e) => {
    const items = (box as any)._items as Array<{ go: () => void }> || [];
    if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(items.length - 1, selected + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(0, selected - 1); render(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim();
      const it = items[selected];
      toggleLauncher();
      if (it) it.go();
      else if (q) { openApp("terminal"); setTimeout(() => document.dispatchEvent(new CustomEvent("blacksite:run", { detail: q })), 60); }
    } else if (e.key === "Escape") toggleLauncher();
  });
  render();
  input.focus();
  setTimeout(() => document.addEventListener("pointerdown", function outside(ev) {
    if (launcherEl && !launcherEl.contains(ev.target as Node) && (ev.target as HTMLElement).id !== "os-start") { toggleLauncher(); document.removeEventListener("pointerdown", outside); }
  }), 0);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
