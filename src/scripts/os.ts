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
  const closeBtn = el("button", "os-win-btn os-win-close", "×");
  closeBtn.setAttribute("aria-label", "Close");
  controls.append(minBtn, closeBtn);
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
function startDrag(e: PointerEvent, win: HTMLElement) {
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
  body.append(bar, list);
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
  for (const w of ["stars", "plasma", "mandelbrot", "none"]) { const b = el("button", "os-btn", w); b.addEventListener("click", () => setWallpaper(w)); wpRow.appendChild(b); }
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
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 400;
  const g = canvas.getContext("2d")!;
  if (kind === "stars") {
    const grad = g.createRadialGradient(320, 200, 40, 320, 200, 420);
    grad.addColorStop(0, "#101a2e"); grad.addColorStop(1, "#04060a");
    g.fillStyle = grad; g.fillRect(0, 0, 640, 400);
    for (let i = 0; i < 260; i++) { const x = Math.random() * 640, y = Math.random() * 400, r = Math.random() * 1.4; g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillStyle = "rgba(255,59,71,0.85)"; g.beginPath(); g.arc(512, 82, 2.2, 0, 7); g.fill();
  } else if (kind === "plasma") {
    const img = g.createImageData(640, 400);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) {
      const v = Math.sin(x / 44) + Math.sin(y / 31) + Math.sin((x + y) / 52) + Math.sin(Math.hypot(x - 320, y - 200) / 26);
      const idx = (y * 640 + x) * 4;
      img.data[idx] = 90 + 60 * Math.sin(v * 1.7);
      img.data[idx + 1] = 22 + 18 * Math.cos(v * 1.3);
      img.data[idx + 2] = 60 + 50 * Math.sin(v * 0.9 + 2);
      img.data[idx + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  } else if (kind === "mandelbrot") {
    const img = g.createImageData(640, 400);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) {
      let zx = 0, zy = 0; const cx = (x / 640) * 3.2 - 2.2, cy = (y / 400) * 2.2 - 1.1;
      let iter = 0;
      while (zx * zx + zy * zy < 4 && iter < 42) { const t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t; iter++; }
      const idx = (y * 640 + x) * 4;
      img.data[idx] = iter * 6; img.data[idx + 1] = iter * 2; img.data[idx + 2] = 40 + iter * 5; img.data[idx + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  desk.style.backgroundImage = `url(${canvas.toDataURL()})`;
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
    "NIGHTWARE LABZ BIOS — blacksite web firmware 1.0",
    "memory: the browser provides · storage: local, yours",
    "kernel: blacksite sh · vfs: mounted (persistent, this browser)",
    `engines: javascript native · python skulpt · verbs: ${VERBS.size} live/edge of 426 on the roster`,
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
    ["help", "?", "Help — 426"], ["settings", "⚙", "Settings"], ["bottle", "☀", "Daylight Bottle"],
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
  document.getElementById("os-start")?.addEventListener("click", () => openApp("terminal"));
  setWallpaper("stars");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
