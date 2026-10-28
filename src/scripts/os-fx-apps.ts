/* Forensics — the instrument rooms, first bench.
 *
 * Hash Lab, Hex Lab, File Lab, Metadata Lab, Image Lab. Each one
 * is fed the same way: a file from the operator's disk, a piece
 * of evidence out of the current case or the locker, or a VFS
 * path handed over by another room. All work is done on local
 * bytes — canvas, WebCrypto, hand parsers. No network.
 */
import type { BlacksiteOS } from "./os-shell";
import {
  fxEl, fxNote, fxStore, casePath, loadCase, lockerLoad, LOCKER_ROOT,
} from "./os-forensics";
import {
  hashAll, identifyHash, identifyMagic, loadMagic, embeddedScan, logicalEof, zipRead, zipExtract,
  parsePng, parseExif, parsePdf, parseId3, parseMp4, parseOoxml, hexRows, entropyOf, blockEntropies,
  fmtSize, download, toHex, fromHex, latin1,
} from "./os-fx-parse";

export interface FxLoaded { name: string; bytes: Uint8Array; path?: string }

/* The shared feeding hand: picker, evidence select, drag-drop,
 * and the VFS path a room can be opened with. */
export function mountLoader(body: HTMLElement, os: BlacksiteOS, initialPath: string | undefined, onLoad: (f: FxLoaded) => void): { loadPath: (p: string) => void } {
  const bar = fxEl("div", "os-fx-bar", body);
  const pick = fxEl("button", "os-btn", bar, "open file");
  const input = fxEl("input", "", bar) as HTMLInputElement;
  input.type = "file"; input.hidden = true;
  pick.addEventListener("click", () => input.click());
  const sel = fxEl("select", "os-fx-input", bar) as HTMLSelectElement;
  const note = fxNote(bar, "or drop a file in this window");
  const fillSel = () => {
    sel.textContent = "";
    const blank = fxEl("option", "", sel, "evidence…") as HTMLOptionElement; blank.value = "";
    const add = (label: string, p: string) => { const o = fxEl("option", "", sel, label) as HTMLOptionElement; o.value = p; };
    if (fxStore.currentCase) {
      const c = loadCase(os, fxStore.currentCase);
      if (c) for (const r of c.evidence) add(`case: ${r.file}`, `${casePath(c.name)}/evidence/${r.file}`);
    }
    for (const r of lockerLoad(os).items) add(`locker: ${r.file}`, `${LOCKER_ROOT}/evidence/${r.file}`);
  };
  fillSel();
  const loadPath = (p: string) => {
    const bytes = os.readBytes(p);
    if (bytes) { onLoad({ name: p.split("/").pop() || p, bytes, path: p }); note.textContent = p; }
    else note.textContent = "that evidence is gone";
  };
  sel.addEventListener("change", () => { if (sel.value) loadPath(sel.value); });
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (f) { onLoad({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); note.textContent = f.name; }
  });
  body.addEventListener("dragover", (e) => e.preventDefault());
  body.addEventListener("drop", async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) { onLoad({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); note.textContent = f.name; }
  });
  body.addEventListener("os:focus-arg", (e) => {
    const p = (e as CustomEvent).detail;
    if (typeof p === "string" && p) loadPath(p);
  });
  /* Deferred a tick: a room opened with a path must finish
   * building itself before the first file lands in it. */
  if (initialPath) setTimeout(() => loadPath(initialPath), 0);
  return { loadPath };
}

function section(parent: HTMLElement, title: string): HTMLElement {
  fxEl("h3", "os-fx-h", parent, title);
  const s = fxEl("div", "os-fx-sec", parent);
  return s;
}
function kvTable(parent: HTMLElement, rows: Array<[string, string]>) {
  const t = fxEl("table", "os-fx-table", parent);
  for (const [k, v] of rows) {
    const tr = fxEl("tr", "", t);
    fxEl("td", "os-fx-k", tr, k);
    fxEl("td", "os-fx-mono", tr, v);
  }
  return t;
}

/* ————— Hash Lab ————— */
export function buildHashLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  fxNote(root, "digests computed in this tab — MD5 and CRC32 by hand, the SHA family by WebCrypto");
  const rows: Array<{ name: string; size: number; digests: Awaited<ReturnType<typeof hashAll>> }> = [];
  const tableWrap = fxEl("div", "", root);

  const renderTable = () => {
    tableWrap.textContent = "";
    if (!rows.length) return;
    const t = fxEl("table", "os-fx-table", tableWrap);
    const hd = fxEl("tr", "", t);
    for (const h of ["file", "size", "md5", "sha-1", "sha-256", "crc32"]) fxEl("th", "", hd, h);
    for (const r of rows) {
      const tr = fxEl("tr", "", t);
      fxEl("td", "", tr, r.name);
      fxEl("td", "", tr, fmtSize(r.size));
      fxEl("td", "os-fx-mono", tr, r.digests.md5);
      fxEl("td", "os-fx-mono", tr, r.digests.sha1.slice(0, 16) + "…");
      fxEl("td", "os-fx-mono", tr, r.digests.sha256.slice(0, 16) + "…");
      fxEl("td", "os-fx-mono", tr, r.digests.crc32);
    }
    const bar = fxEl("div", "os-fx-bar", tableWrap);
    const exp = fxEl("button", "os-btn", bar, "export table");
    exp.addEventListener("click", () => {
      const lines = ["file\tsize\tmd5\tsha1\tsha256\tsha384\tsha512\tcrc32"];
      for (const r of rows) lines.push([r.name, r.size, r.digests.md5, r.digests.sha1, r.digests.sha256, r.digests.sha384, r.digests.sha512, r.digests.crc32].join("\t"));
      download("hashes.tsv", lines.join("\n") + "\n");
    });
    const det = fxEl("button", "os-btn", bar, "full digests");
    det.addEventListener("click", () => {
      tableWrap.textContent = "";
      for (const r of rows) {
        fxEl("h3", "os-fx-h", tableWrap, r.name);
        kvTable(tableWrap, [["md5", r.digests.md5], ["sha-1", r.digests.sha1], ["sha-256", r.digests.sha256], ["sha-384", r.digests.sha384], ["sha-512", r.digests.sha512], ["crc32", r.digests.crc32]]);
      }
    });
  };
  const addBytes = async (name: string, bytes: Uint8Array) => {
    rows.push({ name, size: bytes.length, digests: await hashAll(bytes) });
    renderTable();
  };

  const feed = section(root, "hash files");
  mountLoader(feed, os, arg, (f) => void addBytes(f.name, f.bytes));
  const bulkBar = fxEl("div", "os-fx-bar", feed);
  const bulkBtn = fxEl("button", "os-btn", bulkBar, "add many files");
  const bulkIn = fxEl("input", "", bulkBar) as HTMLInputElement;
  bulkIn.type = "file"; bulkIn.multiple = true; bulkIn.hidden = true;
  bulkBtn.addEventListener("click", () => bulkIn.click());
  bulkIn.addEventListener("change", async () => {
    for (const f of [...(bulkIn.files || [])]) await addBytes(f.name, new Uint8Array(await f.arrayBuffer()));
  });

  const textSec = section(root, "hash text");
  const ta = fxEl("textarea", "os-fx-input os-fx-notes", textSec) as HTMLTextAreaElement;
  ta.placeholder = "type or paste text — hashed as UTF-8";
  const textOut = fxEl("div", "", textSec);
  let textTimer = 0;
  ta.addEventListener("input", () => {
    window.clearTimeout(textTimer);
    textTimer = window.setTimeout(async () => {
      const bytes = new TextEncoder().encode(ta.value);
      const d = await hashAll(bytes);
      textOut.textContent = "";
      kvTable(textOut, [["md5", d.md5], ["sha-1", d.sha1], ["sha-256", d.sha256], ["sha-384", d.sha384], ["sha-512", d.sha512], ["crc32", d.crc32]]);
    }, 250);
  });

  const idSec = section(root, "identify a hash");
  fxNote(idSec, "a guess from shape alone — length and charset. treat it as a lead, not a verdict.");
  const idBar = fxEl("div", "os-fx-bar", idSec);
  const idIn = fxEl("input", "os-fx-input os-fx-grow", idBar) as HTMLInputElement;
  idIn.placeholder = "paste a hash";
  const idOut = fxNote(idBar, "");
  idIn.addEventListener("input", () => { idOut.textContent = idIn.value.trim() ? identifyHash(idIn.value) : ""; });

  const cmpSec = section(root, "compare");
  const cmpNote = fxNote(cmpSec, "pick a file, then a second file or a hash to hold against it");
  const cmpBar = fxEl("div", "os-fx-bar", cmpSec);
  const aBtn = fxEl("button", "os-btn", cmpBar, "file A");
  const aIn = fxEl("input", "", cmpBar) as HTMLInputElement; aIn.type = "file"; aIn.hidden = true;
  const bBtn = fxEl("button", "os-btn", cmpBar, "file B");
  const bIn = fxEl("input", "", cmpBar) as HTMLInputElement; bIn.type = "file"; bIn.hidden = true;
  const bHash = fxEl("input", "os-fx-input os-fx-grow", cmpBar) as HTMLInputElement;
  bHash.placeholder = "…or paste B's hash";
  const verdict = fxNote(cmpSec, "");
  let aDig: Awaited<ReturnType<typeof hashAll>> | null = null;
  let bDig: Awaited<ReturnType<typeof hashAll>> | null = null;
  const judge = () => {
    if (!aDig) { verdict.textContent = ""; return; }
    const target = bHash.value.trim().toLowerCase();
    if (bDig) {
      const same = aDig.sha256 === bDig.sha256;
      verdict.textContent = same ? "MATCH — same SHA-256, same bytes" : "NO MATCH — the files differ";
      verdict.classList.toggle("os-fx-warn", !same);
    } else if (target) {
      const all = [aDig.md5, aDig.sha1, aDig.sha256, aDig.sha384, aDig.sha512, aDig.crc32];
      const same = all.includes(target);
      verdict.textContent = same ? "MATCH — the pasted hash is one of file A's digests" : "NO MATCH — the pasted hash is none of file A's digests";
      verdict.classList.toggle("os-fx-warn", !same);
    }
  };
  aBtn.addEventListener("click", () => aIn.click());
  bBtn.addEventListener("click", () => bIn.click());
  aIn.addEventListener("change", async () => { const f = aIn.files?.[0]; if (f) { aDig = await hashAll(new Uint8Array(await f.arrayBuffer())); cmpNote.textContent = `A: ${f.name}`; judge(); } });
  bIn.addEventListener("change", async () => { const f = bIn.files?.[0]; if (f) { bDig = await hashAll(new Uint8Array(await f.arrayBuffer())); cmpNote.textContent += ` · B: ${f.name}`; judge(); } });
  bHash.addEventListener("input", judge);
}

/* ————— Hex Lab ————— */
export function buildHexLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  let cur: FxLoaded | null = null;
  let pageStart = 0;
  const PAGE = 8192;
  let hits: number[] = [];
  let hitIdx = -1;
  const tools = fxEl("div", "", root);
  mountLoader(tools, os, arg, (f) => { cur = f; pageStart = 0; hits = []; hitIdx = -1; render(); });

  const bar = fxEl("div", "os-fx-bar", root);
  const prev = fxEl("button", "os-btn", bar, "← page");
  const next = fxEl("button", "os-btn", bar, "page →");
  const gotoIn = fxEl("input", "os-fx-input", bar) as HTMLInputElement;
  gotoIn.placeholder = "goto offset (0x…)";
  const gotoBtn = fxEl("button", "os-btn", bar, "go");
  const findIn = fxEl("input", "os-fx-input os-fx-grow", bar) as HTMLInputElement;
  findIn.placeholder = "search text, or hex: 89504e47";
  const findBtn = fxEl("button", "os-btn", bar, "find");
  const hitNote = fxNote(bar, "");
  const dump = fxEl("pre", "os-fx-pre os-fx-dump", root);
  const selOut = fxEl("div", "", root);
  const stripWrap = fxEl("div", "", root);
  const diffSec = fxEl("div", "", root);

  const showPage = (start: number) => {
    if (!cur) return;
    pageStart = Math.max(0, Math.min(start, Math.max(0, cur.bytes.length - 1)));
    dump.textContent = hexRows(cur.bytes, pageStart, PAGE);
    hitNote.textContent = `${cur.name} · ${fmtSize(cur.bytes.length)} · showing 0x${pageStart.toString(16)}–0x${Math.min(cur.bytes.length, pageStart + PAGE).toString(16)}${cur.bytes.length > PAGE ? " (paged — the whole file is never rendered at once)" : ""}`;
  };
  const drawStrip = () => {
    stripWrap.textContent = "";
    if (!cur || cur.bytes.length < 2) return;
    fxEl("h3", "os-fx-h", stripWrap, "entropy by block");
    const block = Math.max(256, Math.ceil(cur.bytes.length / 480));
    const ents = blockEntropies(cur.bytes, block);
    const cv = fxEl("canvas", "os-fx-strip", stripWrap);
    cv.width = Math.max(64, ents.length * 2); cv.height = 48;
    const g = cv.getContext("2d");
    if (g) {
      g.fillStyle = "#9fd8e8";
      ents.forEach((e, i) => { const h = (e / 8) * 46; g.fillRect(i * 2, 48 - h, 1.6, h); });
    }
    fxNote(stripWrap, `one bar per ${block} bytes · full height = entropy 8.0 (packed/encrypted) · flat low = structured or empty`);
  };
  const render = () => { showPage(0); drawStrip(); renderDiffTools(); };
  prev.addEventListener("click", () => showPage(pageStart - PAGE));
  next.addEventListener("click", () => showPage(pageStart + PAGE));
  const go = () => {
    if (!cur) return;
    const v = gotoIn.value.trim();
    const n = v.startsWith("0x") ? parseInt(v, 16) : parseInt(v, 10);
    if (!Number.isNaN(n)) showPage(Math.floor(n / PAGE) * PAGE);
  };
  gotoBtn.addEventListener("click", go);
  const doFind = () => {
    if (!cur) return;
    const q = findIn.value;
    if (!q) return;
    let pat: Uint8Array;
    if (/^(?:[0-9a-fA-F]{2}[\s:-]?)+$/.test(q.trim()) && q.replace(/[\s:-]/g, "").length >= 4 && q.replace(/[\s:-]/g, "").length % 2 === 0) pat = fromHex(q);
    else pat = new TextEncoder().encode(q);
    hits = [];
    outer: for (let i = 0; i + pat.length <= cur.bytes.length && hits.length < 1000; i++) {
      for (let j = 0; j < pat.length; j++) if (cur.bytes[i + j] !== pat[j]) continue outer;
      hits.push(i);
    }
    hitIdx = hits.length ? 0 : -1;
    if (hits.length) { showPage(Math.floor(hits[0] / PAGE) * PAGE); hitNote.textContent = `hit 1/${hits.length} at 0x${hits[0].toString(16)} — enter steps through`; }
    else hitNote.textContent = "no hits";
  };
  findBtn.addEventListener("click", doFind);
  findIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!hits.length) { doFind(); return; }
      hitIdx = (hitIdx + 1) % hits.length;
      showPage(Math.floor(hits[hitIdx] / PAGE) * PAGE);
      hitNote.textContent = `hit ${hitIdx + 1}/${hits.length} at 0x${hits[hitIdx].toString(16)}`;
    }
  });

  /* selection → byte range. The dump is fixed-width text: 79
   * characters a row, the hex field starting at column 10. */
  dump.addEventListener("mouseup", () => {
    if (!cur) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const text = dump.textContent || "";
    const pre = document.createRange();
    pre.selectNodeContents(dump);
    pre.setEnd(range.startContainer, range.startOffset);
    const a = posToByte(pre.toString().length);
    const pre2 = document.createRange();
    pre2.selectNodeContents(dump);
    pre2.setEnd(range.endContainer, range.endOffset);
    const b = posToByte(pre2.toString().length);
    if (a === null || b === null || b <= a) { selOut.textContent = ""; return; }
    const sliceBytes = cur.bytes.subarray(pageStart + a, pageStart + b);
    if (!sliceBytes.length) return;
    const at = (o: number, n: number) => sliceBytes.subarray(o, o + n);
    const le = (bb: Uint8Array) => bb.reduce((acc, x, i) => acc + x * 2 ** (8 * i), 0);
    const be = (bb: Uint8Array) => bb.reduce((acc, x) => acc * 256 + x, 0);
    selOut.textContent = "";
    kvTable(selOut, [
      ["offset", `0x${(pageStart + a).toString(16)} (${pageStart + a})`],
      ["length", `${sliceBytes.length} byte(s)`],
      ["bytes", toHex(sliceBytes.subarray(0, 32)) + (sliceBytes.length > 32 ? "…" : "")],
      ["as text", latin1(sliceBytes.subarray(0, 64)).replace(/[^\x20-\x7e]/g, ".")],
      ["int16 le / be", sliceBytes.length >= 2 ? `${le(at(0, 2))} / ${be(at(0, 2))}` : "—"],
      ["int32 le / be", sliceBytes.length >= 4 ? `${le(at(0, 4))} / ${be(at(0, 4))}` : "—"],
      ["entropy", String(entropyOf(sliceBytes))],
    ]);
    void text;
  });
  function posToByte(charPos: number): number | null {
    const ROW = 79;
    const line = Math.floor(charPos / ROW);
    const col = charPos % ROW;
    let idx: number | null = null;
    if (col >= 61 && col <= 76) idx = col - 61;
    else if (col >= 10 && col < 59) {
      const c = col - 10;
      idx = Math.floor((c - (c > 24 ? 1 : 0)) / 3);
      if (idx > 15) idx = 15;
    }
    if (idx === null) return null;
    return line * 16 + idx;
  }

  /* diff against a second file */
  function renderDiffTools() {
    diffSec.textContent = "";
    if (!cur) return;
    const s = section(diffSec, "diff against a second file");
    const bar2 = fxEl("div", "os-fx-bar", s);
    const btn = fxEl("button", "os-btn", bar2, "choose file B");
    const inp = fxEl("input", "", bar2) as HTMLInputElement;
    inp.type = "file"; inp.hidden = true;
    btn.addEventListener("click", () => inp.click());
    const out = fxEl("div", "", s);
    inp.addEventListener("change", async () => {
      const f = inp.files?.[0];
      if (!f || !cur) return;
      const other = new Uint8Array(await f.arrayBuffer());
      const diffs: Array<[number, string, string]> = [];
      let total = 0;
      const n = Math.max(cur.bytes.length, other.length);
      for (let i = 0; i < n; i++) {
        const x = i < cur.bytes.length ? cur.bytes[i] : -1;
        const y = i < other.length ? other[i] : -1;
        if (x !== y) { total++; if (diffs.length < 100) diffs.push([i, x < 0 ? "—" : x.toString(16).padStart(2, "0"), y < 0 ? "—" : y.toString(16).padStart(2, "0")]); }
      }
      out.textContent = "";
      fxNote(out, `${f.name}: ${total} differing byte(s)${cur.bytes.length !== other.length ? ` · lengths differ (${cur.bytes.length} vs ${other.length})` : ""}${total > 100 ? " · first 100 shown" : ""}`);
      const t = fxEl("table", "os-fx-table", out);
      const hd = fxEl("tr", "", t);
      for (const h of ["offset", "A", "B"]) fxEl("th", "", hd, h);
      for (const [off, x, y] of diffs) {
        const tr = fxEl("tr", "", t);
        fxEl("td", "os-fx-mono", tr, "0x" + off.toString(16));
        fxEl("td", "os-fx-mono", tr, x);
        fxEl("td", "os-fx-mono", tr, y);
      }
    });
  }
}

/* ————— File Lab ————— */
export function buildFileLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  const out = fxEl("div", "", root);
  mountLoader(root, os, arg, async (f) => {
    out.textContent = "";
    fxEl("h3", "os-fx-h", out, f.name);
    const rows = await loadMagic();
    const magic = identifyMagic(f.bytes, rows);
    const basic = section(out, "identification");
    const verdictRows: Array<[string, string]> = [
      ["size", `${f.bytes.length} bytes`],
      ["first bytes", toHex(f.bytes.subarray(0, 16))],
      ["magic verdict", magic ? `${magic.desc} (.${magic.ext})` : "no known signature — the name is all there is"],
    ];
    const nameExtension = f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "";
    if (magic && nameExtension && nameExtension !== magic.ext && !(magic.ext === "jpg" && nameExtension === "jpeg")) {
      verdictRows.push(["extension", `WARNING: named .${nameExtension} but the bytes say .${magic.ext} — trust the bytes`]);
    }
    kvTable(basic, verdictRows);

    const emb = section(out, "embedded signatures");
    const found = embeddedScan(f.bytes).filter((h) => h.offset !== 0);
    if (!found.length) fxNote(emb, "no embedded file signatures past offset 0");
    else {
      const nextBound = (i: number) => (i + 1 < found.length ? found[i + 1].offset : f.bytes.length);
      const t = fxEl("table", "os-fx-table", emb);
      const hd = fxEl("tr", "", t);
      for (const h of ["offset", "type", "carve"]) fxEl("th", "", hd, h);
      found.forEach((hit, i) => {
        const tr = fxEl("tr", "", t);
        fxEl("td", "os-fx-mono", tr, `0x${hit.offset.toString(16)} (${hit.offset})`);
        fxEl("td", "", tr, hit.kind);
        const cell = fxEl("td", "", tr);
        const btn = fxEl("button", "os-btn", cell, "carve");
        btn.addEventListener("click", () => {
          let end = nextBound(i);
          let note = `bounded by ${i + 1 < found.length ? "the next signature" : "end of file"} — a carve is a byte range, not a parsed file`;
          if (hit.ext === "zip") {
            const z = zipRead(f.bytes.subarray(hit.offset));
            if (z) { end = hit.offset + z.eocdEnd; note = `a whole ZIP: its own end-of-directory lands at 0x${end.toString(16)}`; }
          }
          download(`carved-${hit.offset}.${hit.ext}`, f.bytes.subarray(hit.offset, end));
          fxNote(emb, note);
        });
      });
    }

    const trSec = section(out, "trailing data");
    const eof = logicalEof(f.bytes);
    if (!eof) fxNote(trSec, "logical end unknown for this type, or the file is truncated");
    else if (eof.eof >= f.bytes.length) fxNote(trSec, `${eof.kind} ends exactly at its logical EOF (0x${eof.eof.toString(16)}) — nothing trails it`);
    else {
      const tail = f.bytes.subarray(eof.eof);
      fxNote(trSec, `${tail.length} byte(s) trail the ${eof.kind}'s logical end at 0x${eof.eof.toString(16)} — first bytes: ${toHex(tail.subarray(0, 24))}`, true);
      const btn = fxEl("button", "os-btn", trSec, "download trailing bytes");
      btn.addEventListener("click", () => download(`${f.name}.trailing.bin`, tail));
    }

    const z = zipRead(f.bytes);
    if (z) {
      const zs = section(out, "zip structure");
      if (z.comment) fxNote(zs, `archive comment: ${z.comment}`);
      const t = fxEl("table", "os-fx-table", zs);
      const hd = fxEl("tr", "", t);
      for (const h of ["entry", "method", "size", "stored", "crc32", "stored time", ""]) fxEl("th", "", hd, h);
      for (const e of z.entries) {
        const tr = fxEl("tr", "", t);
        fxEl("td", "", tr, e.name);
        fxEl("td", "", tr, e.method === 0 ? "stored" : e.method === 8 ? "deflate" : "method " + e.method);
        fxEl("td", "", tr, fmtSize(e.size));
        fxEl("td", "", tr, fmtSize(e.compSize));
        fxEl("td", "os-fx-mono", tr, e.crc);
        fxEl("td", "", tr, e.time.toISOString().replace("T", " ").slice(0, 19) + "Z");
        const cell = fxEl("td", "", tr);
        const btn = fxEl("button", "os-btn", cell, "extract");
        btn.addEventListener("click", async () => {
          try { download(e.name.split("/").pop() || "entry", await zipExtract(f.bytes, e)); }
          catch (err) { fxNote(zs, (err as Error).message, true); }
        });
      }
    }
  });
}

/* ————— Metadata Lab ————— */
export function buildMetadataLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  const out = fxEl("div", "", root);
  mountLoader(root, os, arg, async (f) => {
    out.textContent = "";
    const report: string[] = [`metadata — ${f.name}`, `size: ${f.bytes.length} bytes`];
    const head = (t: string) => { fxEl("h3", "os-fx-h", out, t); report.push("", "## " + t); };
    const rows = (r: Array<[string, string]>) => { kvTable(out, r); for (const [k, v] of r) report.push(`${k}: ${v}`); };
    head("identification");
    const magicRows = await loadMagic();
    const magic = identifyMagic(f.bytes, magicRows);
    rows([["magic", magic ? `${magic.desc} (.${magic.ext})` : "unknown"], ["sha-256 (short)", "see Hash Lab"]]);

    let found = false;
    const ex = parseExif(f.bytes);
    if (ex) {
      found = true;
      head("EXIF");
      rows(ex.fields);
      if (ex.gps) {
        const link = `https://www.openstreetmap.org/?mlat=${ex.gps.lat.toFixed(6)}&mlon=${ex.gps.lon.toFixed(6)}`;
        const p = fxNote(out, "");
        p.append("map: ");
        const a = fxEl("a", "os-fx-link", p, link);
        a.href = link; a.target = "_blank"; a.rel = "noreferrer";
        report.push("map: " + link);
      }
      if (ex.thumb) { fxNote(out, `an EXIF thumbnail is embedded (${ex.thumb.length} bytes) — the Image Lab shows it beside the main image`); report.push(`exif thumbnail: ${ex.thumb.length} bytes`); }
    }
    const png = parsePng(f.bytes);
    if (png) {
      found = true;
      head("PNG chunks");
      const t = fxEl("table", "os-fx-table", out);
      const hd = fxEl("tr", "", t);
      for (const h of ["chunk", "offset", "length"]) fxEl("th", "", hd, h);
      for (const c of png.chunks) {
        const tr = fxEl("tr", "", t);
        fxEl("td", "os-fx-mono", tr, c.type);
        fxEl("td", "os-fx-mono", tr, "0x" + c.offset.toString(16));
        fxEl("td", "", tr, String(c.length));
        report.push(`chunk ${c.type} @0x${c.offset.toString(16)} len ${c.length}`);
      }
      if (png.texts.length) { head("PNG text"); rows(png.texts); }
      if (!png.chunks.some((c) => c.type === "eXIf")) fxNote(out, "this PNG carries no eXIf chunk — PNG has no native camera metadata beyond its text chunks");
    }
    const pdf = parsePdf(f.bytes);
    if (pdf) {
      found = true;
      head("PDF");
      rows([["version", "%PDF-" + pdf.version], ["pages", pdf.pages !== null ? String(pdf.pages) : "not stated"], ...pdf.fields]);
      if (pdf.xmp) {
        fxEl("h3", "os-fx-h", out, "XMP packet");
        const pre = fxEl("pre", "os-fx-pre", out);
        pre.textContent = pdf.xmp.slice(0, 4000);
        report.push("", "## XMP", pdf.xmp.slice(0, 4000));
      }
    }
    const id3 = parseId3(f.bytes);
    if (id3) { found = true; head("ID3 — " + id3.version); rows(id3.fields); }
    const mp4 = parseMp4(f.bytes);
    if (mp4) {
      found = true;
      head("MP4 / ISO media");
      rows([
        ["major brand", mp4.brand], ["compatible", mp4.compatible.join(", ") || "—"],
        ["created (mvhd)", mp4.created ? mp4.created.toISOString() : "—"],
        ["modified (mvhd)", mp4.modified ? mp4.modified.toISOString() : "—"],
        ["duration", mp4.durationSec !== undefined ? mp4.durationSec + " s" : "—"],
      ]);
    }
    const ooxml = await parseOoxml(f.bytes);
    if (ooxml) { found = true; head("Office Open XML core properties"); rows(ooxml); }
    else {
      const z = zipRead(f.bytes);
      if (z && !ooxml) { fxNote(out, "this ZIP carries no docProps/core.xml — a plain archive holds only names, times and sizes (the File Lab lists them)"); }
    }
    if (!found) fxNote(out, "no metadata this lab reads — this format either carries none, or keeps it where these parsers do not look. that is a statement about the file, not a gap to fill in.");
    const bar = fxEl("div", "os-fx-bar", out);
    const cp = fxEl("button", "os-btn", bar, "copy report");
    cp.addEventListener("click", () => { try { void navigator.clipboard.writeText(report.join("\n")); } catch { /* clipboard shut */ } fxNote(bar, "copied"); });
    const dl = fxEl("button", "os-btn", bar, "download report");
    dl.addEventListener("click", () => download(`${f.name}.metadata.txt`, report.join("\n") + "\n"));
  });
}

/* ————— Image Lab ————— */
export function buildImageLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  let cur: FxLoaded | null = null;
  let img: HTMLImageElement | null = null;
  let srcData: ImageData | null = null;
  const stage = fxEl("div", "", root);

  const loadImg = async (f: FxLoaded) => {
    cur = f;
    stage.textContent = "";
    fxNote(stage, `${f.name} · ${fmtSize(f.bytes.length)}`);
    const url = URL.createObjectURL(new Blob([f.bytes as unknown as BlobPart], { type: "image/*" }));
    const im = new Image();
    im.src = url;
    try { await im.decode(); } catch { fxNote(stage, "the browser cannot decode this image", true); return; }
    img = im;
    const cv0 = document.createElement("canvas");
    cv0.width = im.naturalWidth; cv0.height = im.naturalHeight;
    const g0 = cv0.getContext("2d");
    if (!g0) return;
    g0.drawImage(im, 0, 0);
    try { srcData = g0.getImageData(0, 0, cv0.width, cv0.height); } catch { fxNote(stage, "canvas readback refused for this image", true); return; }
    fxNote(stage, `${im.naturalWidth}×${im.naturalHeight}`);
    render();
  };
  mountLoader(root, os, arg, (f) => void loadImg(f));

  const ctl = fxEl("div", "os-fx-bar", stage);
  void ctl;
  const viewSec = fxEl("div", "", root);
  const mainRow = fxEl("div", "os-fx-imgrow", viewSec);
  const canvasWrap = fxEl("div", "", mainRow);
  const sideWrap = fxEl("div", "", mainRow);
  const histWrap = fxEl("div", "", root);
  const lsbSec = fxEl("div", "", root);
  const elaSec = fxEl("div", "", root);

  function render() {
    if (!img || !srcData || !cur) return;
    canvasWrap.textContent = "";
    sideWrap.textContent = "";
    const bar = fxEl("div", "os-fx-bar", canvasWrap);
    const mode = fxEl("select", "os-fx-input", bar) as HTMLSelectElement;
    for (const [v, label] of [["normal", "as shot"], ["r", "red channel"], ["g", "green channel"], ["b", "blue channel"], ["a", "alpha channel"], ["plane", "bit plane"]] as Array<[string, string]>) {
      const o = fxEl("option", "", mode, label) as HTMLOptionElement; o.value = v;
    }
    const planeSel = fxEl("select", "os-fx-input", bar) as HTMLSelectElement;
    for (let i = 0; i < 8; i++) { const o = fxEl("option", "", planeSel, "bit " + i) as HTMLOptionElement; o.value = String(i); }
    planeSel.value = "0";
    const cv = fxEl("canvas", "os-fx-canvas", canvasWrap);
    cv.width = srcData.width; cv.height = srcData.height;
    const draw = () => {
      const g = cv.getContext("2d");
      if (!g || !srcData) return;
      const out = new ImageData(srcData.width, srcData.height);
      const s = srcData.data, d = out.data;
      const m = mode.value;
      const plane = Number(planeSel.value);
      for (let i = 0; i < s.length; i += 4) {
        if (m === "normal") { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; }
        else if (m === "r" || m === "g" || m === "b") { const v = s[i + (m === "r" ? 0 : m === "g" ? 1 : 2)]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        else if (m === "a") { const v = s[i + 3]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        else { // one bit plane of every channel, amplified
          d[i] = ((s[i] >> plane) & 1) * 255; d[i + 1] = ((s[i + 1] >> plane) & 1) * 255; d[i + 2] = ((s[i + 2] >> plane) & 1) * 255; d[i + 3] = 255;
        }
      }
      g.putImageData(out, 0, 0);
    };
    mode.addEventListener("change", draw);
    planeSel.addEventListener("change", draw);
    draw();

    /* histogram of the shot as decoded */
    histWrap.textContent = "";
    fxEl("h3", "os-fx-h", histWrap, "histogram");
    const hist = fxEl("canvas", "os-fx-strip", histWrap);
    hist.width = 256; hist.height = 64;
    const hg = hist.getContext("2d");
    if (hg) {
      const counts = [new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0)];
      const s = srcData.data;
      for (let i = 0; i < s.length; i += 4) { counts[0][s[i]]++; counts[1][s[i + 1]]++; counts[2][s[i + 2]]++; }
      const max = Math.max(...counts.flat());
      hg.globalCompositeOperation = "lighter";
      const colors = ["rgba(232,110,110,0.85)", "rgba(110,220,130,0.85)", "rgba(110,150,240,0.85)"];
      counts.forEach((c, ci) => {
        hg.fillStyle = colors[ci];
        c.forEach((v, x) => { const h = (v / max) * 62; hg.fillRect(x, 64 - h, 1, h); });
      });
    }

    /* EXIF thumbnail beside the main image */
    const ex = parseExif(cur.bytes);
    if (ex?.thumb) {
      fxEl("h3", "os-fx-h", sideWrap, "EXIF thumbnail");
      const timg = fxEl("img", "os-fx-thumb", sideWrap) as HTMLImageElement;
      timg.src = URL.createObjectURL(new Blob([ex.thumb as unknown as BlobPart], { type: "image/jpeg" }));
      fxNote(sideWrap, `${ex.thumb.length} bytes — if this differs from the shot, the photo was edited after the camera wrote it`);
    }

    /* LSB extraction */
    lsbSec.textContent = "";
    const ls = section(lsbSec, "LSB extraction");
    fxNote(ls, "reads the low bits of the chosen channels, pixel by pixel, first bit into the high end of each byte");
    const lbar = fxEl("div", "os-fx-bar", ls);
    const chanSel = fxEl("select", "os-fx-input", lbar) as HTMLSelectElement;
    for (const [v, label] of [["rgb", "R+G+B"], ["r", "R only"], ["g", "G only"], ["b", "B only"], ["rgba", "R+G+B+A"]] as Array<[string, string]>) {
      const o = fxEl("option", "", chanSel, label) as HTMLOptionElement; o.value = v;
    }
    const bitsSel = fxEl("select", "os-fx-input", lbar) as HTMLSelectElement;
    for (const v of ["1", "2"]) { const o = fxEl("option", "", bitsSel, v + " bit(s)") as HTMLOptionElement; o.value = v; }
    const runBtn = fxEl("button", "os-btn", lbar, "extract");
    const lout = fxEl("div", "", ls);
    runBtn.addEventListener("click", () => {
      if (!srcData) return;
      const chans = chanSel.value === "rgb" ? [0, 1, 2] : chanSel.value === "rgba" ? [0, 1, 2, 3] : [{ r: 0, g: 1, b: 2 }[chanSel.value as "r" | "g" | "b"]];
      const bits = Number(bitsSel.value);
      const mask = (1 << bits) - 1;
      const totalBits = (srcData.data.length / 4) * chans.length * bits;
      const out = new Uint8Array(Math.floor(totalBits / 8));
      let bitPos = 0;
      const s = srcData.data;
      for (let px = 0; px < s.length; px += 4) {
        for (const ch of chans) {
          const v = s[px + ch] & mask;
          for (let b = bits - 1; b >= 0; b--) {
            const byteIdx = Math.floor(bitPos / 8);
            if (byteIdx >= out.length) break;
            if ((v >> b) & 1) out[byteIdx] |= 1 << (7 - (bitPos % 8));
            bitPos++;
          }
        }
      }
      lout.textContent = "";
      fxNote(lout, `${out.length} byte(s) ride in those bits — preview of the first 512:`);
      const pre = fxEl("pre", "os-fx-pre", lout);
      pre.textContent = latin1(out.subarray(0, 512)).replace(/[^\x20-\x7e\n]/g, ".");
      const dl = fxEl("button", "os-btn", lout, "download extracted bytes");
      dl.addEventListener("click", () => download(`${cur?.name || "image"}.lsb.bin`, out));
    });

    /* ELA */
    elaSec.textContent = "";
    const es = section(elaSec, "error level analysis");
    fxNote(es, "the shot is re-saved as JPEG quality 90 and the difference amplified — regions that compress unlike their neighbours light up. a lead, not proof.");
    const ebar = fxEl("div", "os-fx-bar", es);
    const strength = fxEl("input", "os-fx-input", ebar) as HTMLInputElement;
    strength.type = "range"; strength.min = "1"; strength.max = "40"; strength.value = "12";
    const sNote = fxNote(ebar, "strength 12");
    strength.addEventListener("input", () => { sNote.textContent = "strength " + strength.value; });
    const elaBtn = fxEl("button", "os-btn", ebar, "run ELA");
    const elaWrap = fxEl("div", "", es);
    elaBtn.addEventListener("click", async () => {
      if (!img || !srcData) return;
      elaWrap.textContent = "";
      const w = srcData.width, h = srcData.height;
      const c1 = document.createElement("canvas");
      c1.width = w; c1.height = h;
      c1.getContext("2d")!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c1.toBlob(r, "image/jpeg", 0.9));
      if (!blob) { fxNote(elaWrap, "JPEG re-encode failed", true); return; }
      const url = URL.createObjectURL(blob);
      const im2 = new Image();
      im2.src = url;
      await im2.decode();
      const c2 = document.createElement("canvas");
      c2.width = w; c2.height = h;
      const g2 = c2.getContext("2d")!;
      g2.drawImage(im2, 0, 0);
      const d2 = g2.getImageData(0, 0, w, h).data;
      const s = srcData.data;
      const ela = fxEl("canvas", "os-fx-canvas", elaWrap);
      ela.width = w; ela.height = h;
      const ge = ela.getContext("2d")!;
      const outImg = ge.createImageData(w, h);
      const k = Number(strength.value);
      for (let i = 0; i < s.length; i += 4) {
        outImg.data[i] = Math.min(255, Math.abs(s[i] - d2[i]) * k);
        outImg.data[i + 1] = Math.min(255, Math.abs(s[i + 1] - d2[i + 1]) * k);
        outImg.data[i + 2] = Math.min(255, Math.abs(s[i + 2] - d2[i + 2]) * k);
        outImg.data[i + 3] = 255;
      }
      ge.putImageData(outImg, 0, 0);
      fxNote(elaWrap, "the source must be a JPEG for ELA to mean anything — on a PNG this shows decode noise.");
    });
  }
}
