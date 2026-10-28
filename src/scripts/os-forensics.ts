/* Forensics — the folder, the workbench, the case store, the verbs.
 *
 * A folder of evidence rooms on the Blacksite desktop. Every byte
 * an operator brings in is hashed the moment it lands (MD5,
 * SHA-1, SHA-256), typed by its magic, filed into a case or the
 * standing locker under /evidence, and written into a chain-of-
 * custody log that never skips a step. Nothing here touches the
 * network: evidence is examined where it sits, in this tab.
 *
 * Storage discipline: item bytes live as VFS binary nodes; the
 * case/locker manifests (JSON) and custody logs (text) sit beside
 * them, so the whole bench survives reloads like any other file
 * in the house.
 */
import { verb, type BlacksiteOS, type VerbDef } from "./os-shell";
import { t, tf } from "./os-i18n";
type FxCtx = Parameters<VerbDef["run"]>[0];
import {
  hashAll, identifyMagic, loadMagic, extractStrings, extractIocs, parseExif,
  fmtSize, download, latin1, type HashSet,
} from "./os-fx-parse";

/* ————— the folder ————— */
export const FORENSICS_FOLDER: Array<[string, string]> = [
  ["fxworkbench", "Workbench"],
  ["fxevidence", "Evidence"],
  ["fxhash", "Hash Lab"],
  ["fxhex", "Hex Lab"],
  ["fxfile", "File Lab"],
  ["fxmeta", "Metadata Lab"],
  ["fximage", "Image Lab"],
  ["fxpcap", "PCAP Lab"],
  ["fxstrings", "Strings & IOC"],
  ["fxtime", "Timeline Lab"],
  ["fxmail", "Mail Lab"],
];
export const FORENSICS_KEYS = new Set(FORENSICS_FOLDER.map(([k]) => k));

/* ————— shared element hand (the apps files share it too) ————— */
export function fxEl<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  parent.appendChild(n);
  return n;
}
export function fxNote(parent: HTMLElement, text: string, warn = false): HTMLElement {
  return fxEl("p", "os-note" + (warn ? " os-fx-warn" : ""), parent, text);
}

/* ————— the case store ————— */
export interface FxEvidenceRec {
  file: string; size: number; type: string; md5: string; sha1: string; sha256: string; acquired: string;
}
export interface FxCase { name: string; created: string; notes: string; evidence: FxEvidenceRec[] }
export interface FxLocker { items: FxEvidenceRec[] }

export const fxStore = {
  currentCase: null as string | null,
};

const CASES_ROOT = "/cases";
export const LOCKER_ROOT = "/evidence";

function ensureDir(os: BlacksiteOS, path: string) {
  if (!os.isDir(path)) { try { os.mkdir(path); } catch { /* already there */ } }
}
export function listCases(os: BlacksiteOS): string[] {
  ensureDir(os, CASES_ROOT);
  return os.list(CASES_ROOT).filter((n) => os.isDir(`${CASES_ROOT}/${n}`));
}
export function casePath(name: string) { return `${CASES_ROOT}/${name}`; }
export function loadCase(os: BlacksiteOS, name: string): FxCase | null {
  const raw = os.read(`${casePath(name)}/case.json`);
  if (!raw) return null;
  try { return JSON.parse(raw) as FxCase; } catch { return null; }
}
export function saveCase(os: BlacksiteOS, c: FxCase) {
  os.write(`${casePath(c.name)}/case.json`, JSON.stringify(c, null, 1));
}
export function createCase(os: BlacksiteOS, name: string): FxCase {
  const clean = name.trim().replace(/[^\w .()-]/g, "").slice(0, 48);
  if (!clean) throw new Error("a case needs a name");
  ensureDir(os, CASES_ROOT);
  if (os.isDir(casePath(clean))) throw new Error("a case by that name already stands");
  os.mkdir(casePath(clean));
  os.mkdir(`${casePath(clean)}/evidence`);
  const c: FxCase = { name: clean, created: new Date().toISOString(), notes: "", evidence: [] };
  saveCase(os, c);
  os.write(`${casePath(clean)}/custody.log`, "");
  custody(os, casePath(clean), "case created");
  fxStore.currentCase = clean;
  return c;
}
export function custody(os: BlacksiteOS, root: string, action: string, detail = "") {
  const line = `${new Date().toISOString()} · ${action}${detail ? " · " + detail : ""}`;
  const path = `${root}/custody.log`;
  const prev = os.read(path) || "";
  os.write(path, prev + line + "\n");
}
export function custodyLines(os: BlacksiteOS, root: string): string[] {
  return (os.read(`${root}/custody.log`) || "").split("\n").filter(Boolean);
}
/* Intake one file's bytes: hash, type, store, manifest, custody. */
export async function intakeInto(os: BlacksiteOS, root: string, manifest: { evidence?: FxEvidenceRec[]; items?: FxEvidenceRec[] }, name: string, bytes: Uint8Array, source: string): Promise<FxEvidenceRec> {
  const rows = await loadMagic();
  const magic = identifyMagic(bytes, rows);
  const h = await hashAll(bytes);
  const safe = name.replace(/[^\w .()-]/g, "_") || "unnamed";
  ensureDir(os, `${root}/evidence`);
  let file = safe;
  let i = 2;
  while (os.readBytes(`${root}/evidence/${file}`) !== null) { file = `${safe.replace(/(\.[^.]+)?$/, "")}-${i++}${/\.[^.]+$/.test(safe) ? "." + safe.split(".").pop() : ""}`; }
  os.writeBytes(`${root}/evidence/${file}`, bytes);
  const rec: FxEvidenceRec = {
    file, size: bytes.length, type: magic ? `${magic.desc} (.${magic.ext})` : "unknown magic",
    md5: h.md5, sha1: h.sha1, sha256: h.sha256, acquired: new Date().toISOString(),
  };
  const list = manifest.evidence || manifest.items;
  if (list) list.push(rec);
  custody(os, root, "intake", `${file} · sha256 ${h.sha256.slice(0, 16)}… · from ${source}`);
  return rec;
}
export function lockerLoad(os: BlacksiteOS): FxLocker {
  ensureDir(os, LOCKER_ROOT);
  const raw = os.read(`${LOCKER_ROOT}/locker.json`);
  if (raw) { try { return JSON.parse(raw) as FxLocker; } catch { /* fall through */ } }
  return { items: [] };
}
export function lockerSave(os: BlacksiteOS, l: FxLocker) {
  ensureDir(os, LOCKER_ROOT);
  os.write(`${LOCKER_ROOT}/locker.json`, JSON.stringify(l, null, 1));
  if (os.read(`${LOCKER_ROOT}/custody.log`) === null) os.write(`${LOCKER_ROOT}/custody.log`, "");
}
/* Which instrument should open a piece of evidence, by its bytes. */
export function smartApp(bytes: Uint8Array, name: string): string {
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return "fximage";
  if (bytes.length > 8 && bytes[0] === 0x89 && latin1(bytes, 1, 4) === "PNG") return "fximage";
  if (bytes.length > 6 && latin1(bytes, 0, 3) === "GIF") return "fximage";
  if (bytes.length >= 4 && ((bytes[0] === 0xd4 && bytes[1] === 0xc3) || (bytes[0] === 0xa1 && bytes[1] === 0xb2) || (bytes[0] === 0x0a && bytes[1] === 0x0d))) return "fxpcap";
  if (/\.eml$/i.test(name) || /^From:/m.test(latin1(bytes.subarray(0, 512)))) return "fxmail";
  if (parseExif(bytes)) return "fxmeta";
  return "fxhex";
}
export function openInApp(os: BlacksiteOS, app: string, vfsPath: string) {
  document.dispatchEvent(new CustomEvent("blacksite:openapp", { detail: { app, arg: vfsPath } }));
  void os;
}

/* ————— the workbench ————— */
export function buildWorkbench(body: HTMLElement, os: BlacksiteOS) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  fxNote(root, t("cases and evidence on the house VFS · every intake is hashed and logged · nothing leaves this tab"));

  const bar = fxEl("div", "os-fx-bar", root);
  const sel = fxEl("select", "os-fx-input", bar) as HTMLSelectElement;
  const nameIn = fxEl("input", "os-fx-input", bar) as HTMLInputElement;
  nameIn.placeholder = t("new case name");
  const createBtn = fxEl("button", "os-btn", bar, t("create case"));
  const delBtn = fxEl("button", "os-btn", bar, t("delete case"));
  const status = fxNote(root, "");

  const main = fxEl("div", "os-fx-main", root);

  function refreshSel() {
    const names = listCases(os);
    sel.textContent = "";
    const blank = fxEl("option", "", sel, t("— no case open —")) as HTMLOptionElement;
    blank.value = "";
    for (const n of names) { const o = fxEl("option", "", sel, n) as HTMLOptionElement; o.value = n; }
    if (fxStore.currentCase && names.includes(fxStore.currentCase)) sel.value = fxStore.currentCase;
  }

  function render() {
    main.textContent = "";
    const name = fxStore.currentCase;
    if (!name) { fxNote(main, t("open or create a case to begin.")); return; }
    const c = loadCase(os, name);
    if (!c) { fxNote(main, t("that case is gone."), true); fxStore.currentCase = null; return; }
    fxEl("h3", "os-fx-h", main, tf("case: {name}", { name: c.name }));
    fxNote(main, `opened ${c.created} · ${c.evidence.length} item(s) of evidence`);

    const inBar = fxEl("div", "os-fx-bar", main);
    const pick = fxEl("button", "os-btn", inBar, t("intake files"));
    const fileIn = fxEl("input", "", inBar) as HTMLInputElement;
    fileIn.type = "file"; fileIn.multiple = true; fileIn.hidden = true;
    pick.addEventListener("click", () => fileIn.click());
    fxNote(inBar, t("or drop files anywhere in this window"));
    const doIntake = async (files: FileList | File[]) => {
      for (const f of [...files]) {
        status.textContent = `hashing ${f.name}…`;
        const bytes = new Uint8Array(await f.arrayBuffer());
        await intakeInto(os, casePath(c.name), c, f.name, bytes, "operator intake");
        saveCase(os, c);
      }
      status.textContent = "";
      render();
    };
    fileIn.addEventListener("change", () => { if (fileIn.files?.length) void doIntake(fileIn.files); });

    const table = fxEl("table", "os-fx-table", main);
    const thead = fxEl("tr", "", table);
    for (const h of ["file", "size", "type", "sha-256", "acquired", ""]) fxEl("th", "", thead, t(h));
    for (const rec of c.evidence) {
      const tr = fxEl("tr", "", table);
      fxEl("td", "", tr, rec.file);
      fxEl("td", "", tr, fmtSize(rec.size));
      fxEl("td", "", tr, rec.type);
      fxEl("td", "os-fx-mono", tr, rec.sha256.slice(0, 12) + "…");
      fxEl("td", "", tr, rec.acquired.replace("T", " ").slice(0, 19));
      const acts = fxEl("td", "os-fx-acts", tr);
      const p = `${casePath(c.name)}/evidence/${rec.file}`;
      const openBtn = fxEl("button", "os-btn", acts, t("open"));
      openBtn.addEventListener("click", () => {
        const bytes = os.readBytes(p);
        if (bytes) openInApp(os, smartApp(bytes, rec.file), p);
      });
      const hexBtn = fxEl("button", "os-btn", acts, t("hex"));
      hexBtn.addEventListener("click", () => openInApp(os, "fxhex", p));
      const dlBtn = fxEl("button", "os-btn", acts, t("save"));
      dlBtn.addEventListener("click", () => { const b = os.readBytes(p); if (b) download(rec.file, b); });
      const rmBtn = fxEl("button", "os-btn", acts, t("remove"));
      rmBtn.addEventListener("click", () => {
        try { os.remove(p); } catch { /* already gone */ }
        c.evidence = c.evidence.filter((r) => r !== rec);
        custody(os, casePath(c.name), "removed", `${rec.file} · sha256 ${rec.sha256.slice(0, 16)}…`);
        saveCase(os, c);
        render();
      });
    }

    const vBar = fxEl("div", "os-fx-bar", main);
    const verifyBtn = fxEl("button", "os-btn", vBar, t("verify all"));
    const reportBtn = fxEl("button", "os-btn", vBar, t("case report"));
    const vStatus = fxNote(vBar, "");
    verifyBtn.addEventListener("click", async () => {
      vStatus.textContent = "re-hashing…";
      let bad = 0;
      const rows = [...table.querySelectorAll("tr")];
      for (let i = 0; i < c.evidence.length; i++) {
        const rec = c.evidence[i];
        const bytes = os.readBytes(`${casePath(c.name)}/evidence/${rec.file}`);
        const now: HashSet | null = bytes ? await hashAll(bytes) : null;
        const ok = !!now && now.sha256 === rec.sha256 && now.md5 === rec.md5;
        if (!ok) { bad++; rows[i + 1]?.classList.add("os-fx-bad"); }
      }
      vStatus.textContent = bad ? `${bad} item(s) no longer match their intake hashes` : `all ${c.evidence.length} item(s) match their intake hashes`;
      vStatus.classList.toggle("os-fx-warn", bad > 0);
      custody(os, casePath(c.name), "verify-all", bad ? `${bad} MISMATCH` : "all match");
    });
    reportBtn.addEventListener("click", () => {
      const lines: string[] = [
        `# case report — ${c.name}`, "", `case opened: ${c.created}`, `report filed: ${new Date().toISOString()}`,
        `evidence: ${c.evidence.length} item(s)`, "", "## notes", "", c.notes || "(none)", "", "## evidence",
      ];
      for (const r of c.evidence) {
        lines.push("", `### ${r.file}`, `- size: ${r.size} bytes`, `- type: ${r.type}`, `- acquired: ${r.acquired}`,
          `- md5: ${r.md5}`, `- sha1: ${r.sha1}`, `- sha256: ${r.sha256}`);
      }
      lines.push("", "## chain of custody", "");
      for (const l of custodyLines(os, casePath(c.name))) lines.push("- " + l);
      const report = lines.join("\n") + "\n";
      os.write(`${casePath(c.name)}/report.md`, report);
      custody(os, casePath(c.name), "report filed", "report.md");
      download(`${c.name}-report.md`, report, "text/markdown");
      vStatus.textContent = "report downloaded and filed into the case";
    });

    fxEl("h3", "os-fx-h", main, t("notes"));
    const notes = fxEl("textarea", "os-fx-input os-fx-notes", main) as HTMLTextAreaElement;
    notes.value = c.notes;
    const nBar = fxEl("div", "os-fx-bar", main);
    const saveNotes = fxEl("button", "os-btn", nBar, t("save notes"));
    saveNotes.addEventListener("click", () => { c.notes = notes.value; saveCase(os, c); fxNote(nBar, t("saved")); });

    fxEl("h3", "os-fx-h", main, t("chain of custody"));
    const log = fxEl("pre", "os-fx-pre", main);
    log.textContent = custodyLines(os, casePath(c.name)).join("\n") || "(no entries)";
  }

  createBtn.addEventListener("click", () => {
    try {
      const c = createCase(os, nameIn.value);
      nameIn.value = "";
      status.textContent = `case "${c.name}" stands open`;
      refreshSel(); render();
    } catch (e) { status.textContent = (e as Error).message; status.classList.add("os-fx-warn"); }
  });
  sel.addEventListener("change", () => {
    fxStore.currentCase = sel.value || null;
    render();
  });
  delBtn.addEventListener("click", () => {
    const name = fxStore.currentCase;
    if (!name) return;
    try { os.remove(casePath(name), true); } catch { /* already gone */ }
    fxStore.currentCase = null;
    status.textContent = `case "${name}" deleted (its custody log went with it)`;
    refreshSel(); render();
  });
  body.addEventListener("dragover", (e) => { e.preventDefault(); });
  body.addEventListener("drop", (e) => {
    e.preventDefault();
    const name = fxStore.currentCase;
    if (!name || !e.dataTransfer || !e.dataTransfer.files.length) return;
    const c = loadCase(os, name);
    if (!c) return;
    void (async () => {
      for (const f of [...e.dataTransfer!.files]) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        await intakeInto(os, casePath(name), c, f.name, bytes, "drag-drop intake");
        saveCase(os, c);
      }
      render();
    })();
  });
  refreshSel();
  render();
}

/* ————— terminal verbs ————— */
function verbFile(ctx: FxCtx, path: string): { bytes: Uint8Array; path: string } | string {
  const p = ctx.os.norm(path);
  const bytes = ctx.os.readBytes(p);
  if (!bytes) return `no such file in the house: ${path} (evidence lives under /cases/<case>/evidence/ and /evidence/evidence/)`;
  return { bytes, path: p };
}
export function registerForensicsVerbs() {
  verb("fxcase", "LIVE", "the current forensics case: evidence count and the last custody lines", async (ctx) => {
    const name = fxStore.currentCase;
    if (!name) { ctx.io.print("no case is open. open one in the Workbench (Forensics folder)."); return; }
    const c = loadCase(ctx.os, name);
    if (!c) { ctx.io.print(`case "${name}" no longer stands.`); return; }
    ctx.io.print(`case: ${c.name} · opened ${c.created} · ${c.evidence.length} item(s) of evidence`);
    for (const r of c.evidence) ctx.io.print(`  ${r.file} · ${fmtSize(r.size)} · ${r.type} · sha256 ${r.sha256.slice(0, 16)}…`);
    const lines = custodyLines(ctx.os, casePath(name));
    ctx.io.print(`custody — last ${Math.min(5, lines.length)} of ${lines.length}:`);
    for (const l of lines.slice(-5)) ctx.io.print("  " + l);
  });
  verb("fxhash", "LIVE", "fxhash <vfs path> — md5, sha-1, sha-256, sha-384, sha-512 and crc32 of a house file", async (ctx) => {
    const f = verbFile(ctx, ctx.args[0] || "");
    if (typeof f === "string") { ctx.io.print(f); return; }
    const h = await hashAll(f.bytes);
    ctx.io.print(`${f.path} · ${fmtSize(f.bytes.length)}`);
    ctx.io.print(`  md5     ${h.md5}`);
    ctx.io.print(`  sha1    ${h.sha1}`);
    ctx.io.print(`  sha256  ${h.sha256}`);
    ctx.io.print(`  sha384  ${h.sha384}`);
    ctx.io.print(`  sha512  ${h.sha512}`);
    ctx.io.print(`  crc32   ${h.crc32}`);
  });
  verb("fxmagic", "LIVE", "fxmagic <vfs path> — identify a house file by its magic bytes", async (ctx) => {
    const f = verbFile(ctx, ctx.args[0] || "");
    if (typeof f === "string") { ctx.io.print(f); return; }
    const rows = await loadMagic();
    const magic = identifyMagic(f.bytes, rows);
    if (!magic) { ctx.io.print(`${f.path}: no known magic — the first bytes are ${latin1(f.bytes.subarray(0, 4)).replace(/[^\x20-\x7e]/g, ".")} in a trench coat`); return; }
    ctx.io.print(`${f.path}: ${magic.desc} (.${magic.ext}) · signature ${magic.hex}`);
  });
  verb("fxstrings", "LIVE", "fxstrings <vfs path> [count] — the first strings in a house file, with offsets", async (ctx) => {
    const f = verbFile(ctx, ctx.args[0] || "");
    if (typeof f === "string") { ctx.io.print(f); return; }
    const n = Math.min(200, Math.max(1, parseInt(ctx.args[1] || "40", 10) || 40));
    const { hits, truncated } = extractStrings(f.bytes, 4, n);
    for (const h of hits) ctx.io.print(`${h.offset.toString(16).padStart(8, "0")}  ${h.enc.padEnd(7)}  ${h.text.slice(0, 100)}`);
    ctx.io.print(`${hits.length} string(s) shown${truncated ? " — the file holds more" : ""}`);
  });
  verb("fxioc", "LIVE", "fxioc <vfs path> — indicators of compromise in a house file, grouped and counted", async (ctx) => {
    const f = verbFile(ctx, ctx.args[0] || "");
    if (typeof f === "string") { ctx.io.print(f); return; }
    const { hits } = extractStrings(f.bytes, 4, 20000);
    const text = hits.map((h) => h.text).join("\n");
    const groups = extractIocs(text);
    const kinds = Object.keys(groups);
    if (!kinds.length) { ctx.io.print(`${f.path}: no indicators found in its strings`); return; }
    ctx.io.print(`${f.path}:`);
    for (const k of kinds) {
      ctx.io.print(`  ${k}: ${groups[k].length}`);
      for (const v of groups[k].slice(0, 6)) ctx.io.print(`    ${v.slice(0, 90)}`);
    }
  });
  verb("fxmeta", "LIVE", "fxmeta <vfs path> — headline metadata for a house file (EXIF for images)", async (ctx) => {
    const f = verbFile(ctx, ctx.args[0] || "");
    if (typeof f === "string") { ctx.io.print(f); return; }
    const ex = parseExif(f.bytes);
    if (!ex) { ctx.io.print(`${f.path}: no EXIF block — the Metadata Lab reads PNG text, PDF info, ID3 and MP4 too`); return; }
    for (const [k, v] of ex.fields) ctx.io.print(`  ${k}: ${v}`);
    if (ex.gps) ctx.io.print(`  maps: https://www.openstreetmap.org/?mlat=${ex.gps.lat.toFixed(6)}&mlon=${ex.gps.lon.toFixed(6)}`);
  });
}
