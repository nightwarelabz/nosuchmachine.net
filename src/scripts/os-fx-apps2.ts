/* Forensics — the instrument rooms, second bench.
 *
 * PCAP Lab, Strings & IOC Lab, Timeline Lab, Mail Lab, and the
 * Evidence Locker: the standing transport subfolder at /evidence
 * that seals evidence into encrypted .fxbag files and receives
 * them back — verifying every hash before anything is filed.
 * All of it local: parsers by hand, bags by WebCrypto, and the
 * OS transmits nothing, ever.
 */
import type { BlacksiteOS } from "./os-shell";
import { t, tf } from "./os-i18n";
import {
  fxEl, fxNote, fxStore, casePath, loadCase, saveCase, custody, custodyLines,
  intakeInto, lockerLoad, lockerSave, LOCKER_ROOT,
} from "./os-forensics";
import { mountLoader, type FxLoaded } from "./os-fx-apps";
import {
  parsePcap, tcpStreams, extractStrings, extractIocs, eventsForFile, parseLogText, parseEml,
  sealBag, openBag, sha256, fmtSize, download, latin1, fromHex, type FxEvent,
} from "./os-fx-parse";

function section(parent: HTMLElement, title: string): HTMLElement {
  fxEl("h3", "os-fx-h", parent, t(title));
  return fxEl("div", "os-fx-sec", parent);
}
function kvTable(parent: HTMLElement, rows: Array<[string, string]>) {
  const tbl = fxEl("table", "os-fx-table", parent);
  for (const [k, v] of rows) {
    const tr = fxEl("tr", "", tbl);
    fxEl("td", "os-fx-k", tr, k);
    fxEl("td", "os-fx-mono", tr, v);
  }
}
const escapePayload = (b: Uint8Array) => latin1(b).replace(/[^\x20-\x7e\n\t]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));

/* ————— PCAP Lab ————— */
export function buildPcapLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  const out = fxEl("div", "", root);
  mountLoader(root, os, arg, (f) => {
    out.textContent = "";
    let cap;
    try { cap = parsePcap(f.bytes); }
    catch (e) { fxNote(out, (e as Error).message, true); return; }
    if (cap.unsupported) { fxNote(out, cap.unsupported, true); return; }
    const pkts = cap.packets;
    fxEl("h3", "os-fx-h", out, f.name);
    fxNote(out, `${cap.format} · link type ${cap.linktype} · ${pkts.length} packet(s) · ${fmtSize(cap.totalBytes)} captured${pkts.length >= 20000 ? " · parsing stopped at 20,000 packets" : ""}`);

    const hier = section(out, "protocol hierarchy");
    const counts = new Map<string, number>();
    for (const p of pkts) counts.set(p.proto, (counts.get(p.proto) || 0) + 1);
    kvTable(hier, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)]));

    const tableSec = section(out, "packets");
    const tbl = fxEl("table", "os-fx-table", tableSec);
    const hd = fxEl("tr", "", tbl);
    for (const h of ["#", "rel. time", "source", "destination", "proto", "len", "info"]) fxEl("th", "", hd, h);
    const t0 = pkts.length ? pkts[0].ts : 0;
    for (const p of pkts.slice(0, 500)) {
      const tr = fxEl("tr", "", tbl);
      fxEl("td", "os-fx-mono", tr, String(p.n));
      fxEl("td", "os-fx-mono", tr, (p.ts - t0).toFixed(3));
      fxEl("td", "", tr, p.src + (p.sport ? ":" + p.sport : ""));
      fxEl("td", "", tr, p.dst + (p.dport ? ":" + p.dport : ""));
      fxEl("td", "", tr, p.proto);
      fxEl("td", "", tr, String(p.len));
      fxEl("td", "", tr, p.info);
    }
    if (pkts.length > 500) fxNote(tableSec, `showing the first 500 of ${pkts.length} packets — the counts, endpoints and streams below cover them all`);

    const epSec = section(out, "endpoints");
    const eps = new Map<string, { pkts: number; bytes: number }>();
    for (const p of pkts) {
      for (const a of [p.srcIp || p.src, p.dstIp || p.dst]) {
        if (!a) continue;
        const e = eps.get(a) || { pkts: 0, bytes: 0 };
        e.pkts++; e.bytes += p.len;
        eps.set(a, e);
      }
    }
    kvTable(epSec, [...eps.entries()].sort((a, b) => b[1].pkts - a[1].pkts).slice(0, 40).map(([a, e]) => [a, `${e.pkts} packets · ${fmtSize(e.bytes)}`]));

    if (cap.dns.length) {
      const dnsSec = section(out, "DNS");
      const dt = fxEl("table", "os-fx-table", dnsSec);
      const dh = fxEl("tr", "", dt);
      for (const h of ["packet", "name", "type", "answers"]) fxEl("th", "", dh, h);
      for (const d of cap.dns) {
        const tr = fxEl("tr", "", dt);
        fxEl("td", "os-fx-mono", tr, String(d.pkt));
        fxEl("td", "", tr, d.name);
        fxEl("td", "", tr, d.type);
        fxEl("td", "", tr, d.answers.join(", "));
      }
    }

    const streams = tcpStreams(pkts);
    if (streams.length) {
      const sSec = section(out, "TCP streams");
      const selBar = fxEl("div", "os-fx-bar", sSec);
      const sel = fxEl("select", "os-fx-input os-fx-grow", selBar) as HTMLSelectElement;
      streams.forEach((s, i) => {
        const o = fxEl("option", "", sel, `${s.key} · ${s.packets} pkts · ${fmtSize(s.ab.length + s.ba.length)}`) as HTMLOptionElement;
        o.value = String(i);
      });
      const view = fxEl("div", "", sSec);
      const showStream = () => {
        const s = streams[Number(sel.value) || 0];
        view.textContent = "";
        fxNote(view, `${s.a} → ${s.b}: ${fmtSize(s.ab.length)}`);
        const preA = fxEl("pre", "os-fx-pre", view);
        preA.textContent = escapePayload(s.ab.subarray(0, 20000)) || "(no payload)";
        fxNote(view, `${s.b} → ${s.a}: ${fmtSize(s.ba.length)}`);
        const preB = fxEl("pre", "os-fx-pre", view);
        preB.textContent = escapePayload(s.ba.subarray(0, 20000)) || "(no payload)";
        const dlBar = fxEl("div", "os-fx-bar", view);
        const d1 = fxEl("button", "os-btn", dlBar, t("download A→B"));
        d1.addEventListener("click", () => download("stream-a-b.bin", s.ab));
        const d2 = fxEl("button", "os-btn", dlBar, t("download B→A"));
        d2.addEventListener("click", () => download("stream-b-a.bin", s.ba));
      };
      sel.addEventListener("change", showStream);
      showStream();
    }

    const searchSec = section(out, "payload search");
    const sBar = fxEl("div", "os-fx-bar", searchSec);
    const sIn = fxEl("input", "os-fx-input os-fx-grow", sBar) as HTMLInputElement;
    sIn.placeholder = t("text, or hex: 47455420");
    const sBtn = fxEl("button", "os-btn", sBar, t("search"));
    const sOut = fxNote(searchSec, "");
    sBtn.addEventListener("click", () => {
      const q = sIn.value;
      if (!q) return;
      let needle: Uint8Array;
      if (/^(?:[0-9a-fA-F]{2}[\s:-]?)+$/.test(q.trim()) && q.replace(/[\s:-]/g, "").length >= 4) needle = fromHex(q);
      else needle = new TextEncoder().encode(q);
      const found: number[] = [];
      for (const p of pkts) {
        outer: for (let i = 0; i + needle.length <= p.payload.length; i++) {
          for (let j = 0; j < needle.length; j++) if (p.payload[i + j] !== needle[j]) continue outer;
          found.push(p.n); break;
        }
        if (found.length >= 200) break;
      }
      sOut.textContent = found.length ? `payload rides in packet(s): ${found.join(", ")}` : "no packet carries that payload";
    });
  });
}

/* ————— Strings & IOC Lab ————— */
export function buildStringsLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  const ctl = fxEl("div", "os-fx-bar", root);
  fxNote(ctl, t("minimum length"));
  const minIn = fxEl("input", "os-fx-input", ctl) as HTMLInputElement;
  minIn.type = "number"; minIn.value = "4"; minIn.min = "3"; minIn.max = "64";
  const out = fxEl("div", "", root);
  let cur: FxLoaded | null = null;
  const render = () => {
    out.textContent = "";
    if (!cur) return;
    const minLen = Math.max(3, Number(minIn.value) || 4);
    const { hits, truncated } = extractStrings(cur.bytes, minLen, 5000);
    const joined = hits.map((h) => h.text).join("\n");
    const groups = extractIocs(joined);

    const iocSec = section(out, "indicators");
    const kinds = Object.keys(groups);
    if (!kinds.length) fxNote(iocSec, t("no indicators in the strings — clean, or quiet"));
    for (const k of kinds) {
      fxEl("h3", "os-fx-h", iocSec, `${k} (${groups[k].length})`);
      const pre = fxEl("pre", "os-fx-pre", iocSec);
      pre.textContent = groups[k].slice(0, 100).join("\n");
    }

    const rxSec = section(out, "regex search");
    const rxBar = fxEl("div", "os-fx-bar", rxSec);
    const rxIn = fxEl("input", "os-fx-input os-fx-grow", rxBar) as HTMLInputElement;
    rxIn.placeholder = t("your own pattern, e.g. (token|secret)=\\S+");
    const rxBtn = fxEl("button", "os-btn", rxBar, t("run"));
    const rxOut = fxEl("div", "", rxSec);
    rxBtn.addEventListener("click", () => {
      rxOut.textContent = "";
      let re: RegExp;
      try { re = new RegExp(rxIn.value, "g"); } catch (e) { fxNote(rxOut, t("bad pattern: ") + (e as Error).message, true); return; }
      const lines: string[] = [];
      for (const h of hits) for (const m of h.text.matchAll(re)) lines.push(`0x${h.offset.toString(16)}  ${m[0].slice(0, 120)}`);
      const pre = fxEl("pre", "os-fx-pre", rxOut);
      pre.textContent = lines.slice(0, 300).join("\n") || "no hits";
      fxNote(rxOut, `${lines.length} hit(s)${lines.length > 300 ? " · first 300 shown" : ""}`);
    });

    const strSec = section(out, "strings");
    fxNote(strSec, `${hits.length} string(s) at minimum length ${minLen}${truncated ? " — capped at 5,000; raise the minimum to narrow" : ""}`);
    const tbl = fxEl("table", "os-fx-table", strSec);
    const hd = fxEl("tr", "", tbl);
    for (const h of ["offset", "enc", "text"]) fxEl("th", "", hd, h);
    for (const h of hits.slice(0, 1000)) {
      const tr = fxEl("tr", "", tbl);
      fxEl("td", "os-fx-mono", tr, "0x" + h.offset.toString(16));
      fxEl("td", "", tr, h.enc);
      fxEl("td", "", tr, h.text.slice(0, 120));
    }
    if (hits.length > 1000) fxNote(strSec, t("table shows the first 1,000 — the export carries them all"));
    const expBar = fxEl("div", "os-fx-bar", strSec);
    const exp = fxEl("button", "os-btn", expBar, t("export strings + indicators"));
    exp.addEventListener("click", () => {
      const lines = [`# strings — ${cur!.name}`, ...hits.map((h) => `0x${h.offset.toString(16)}\t${h.enc}\t${h.text}`), "", "# indicators"];
      for (const k of kinds) { lines.push("", `## ${k} (${groups[k].length})`, ...groups[k]); }
      download(`${cur!.name}.strings.txt`, lines.join("\n") + "\n");
    });
  };
  mountLoader(root, os, arg, (f) => { cur = f; render(); });
  minIn.addEventListener("change", render);
}

/* ————— Timeline Lab ————— */
export function buildTimelineLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  fxNote(root, t("a supertimeline from whatever the files themselves carry — EXIF, ZIP clocks, PDF dates, mail hops, capture spans, mvhd — plus logs and your own entries"));
  const events: FxEvent[] = [];
  const tableWrap = fxEl("div", "", root);
  const render = () => {
    tableWrap.textContent = "";
    const sources = [...new Set(events.map((e) => e.source))];
    const bar = fxEl("div", "os-fx-bar", tableWrap);
    const filter = fxEl("select", "os-fx-input", bar) as HTMLSelectElement;
    const all = fxEl("option", "", filter, t("all sources")) as HTMLOptionElement; all.value = "";
    for (const s of sources) { const o = fxEl("option", "", filter, s) as HTMLOptionElement; o.value = s; }
    const exp = fxEl("button", "os-btn", bar, t("export CSV"));
    const clear = fxEl("button", "os-btn", bar, t("clear"));
    const tWrap = fxEl("div", "", tableWrap);
    const draw = () => {
      tWrap.textContent = "";
      const rows = events.filter((e) => !filter.value || e.source === filter.value).sort((a, b) => a.t - b.t);
      fxNote(tWrap, `${rows.length} event(s)`);
      const tbl = fxEl("table", "os-fx-table", tWrap);
      const hd = fxEl("tr", "", tbl);
      for (const h of ["time (UTC)", "source", "event"]) fxEl("th", "", hd, h);
      for (const e of rows.slice(0, 2000)) {
        const tr = fxEl("tr", "", tbl);
        fxEl("td", "os-fx-mono", tr, new Date(e.t).toISOString().replace("T", " ").slice(0, 19));
        fxEl("td", "", tr, e.source);
        fxEl("td", "", tr, e.event);
      }
      if (rows.length > 2000) fxNote(tWrap, t("first 2,000 shown — the CSV carries them all"));
    };
    filter.addEventListener("change", draw);
    exp.addEventListener("click", () => {
      const csv = ["time,source,event", ...[...events].sort((a, b) => a.t - b.t).map((e) => `"${new Date(e.t).toISOString()}","${e.source.replace(/"/g, '""')}","${e.event.replace(/"/g, '""')}"`)];
      download("timeline.csv", csv.join("\n") + "\n", "text/csv");
    });
    clear.addEventListener("click", () => { events.length = 0; render(); });
    draw();
  };
  const addFile = async (f: FxLoaded) => {
    const found = await eventsForFile(f.name, f.bytes);
    if (!found.length) {
      const logEvents = parseLogText(latin1(f.bytes), f.name);
      events.push(...logEvents);
      if (!logEvents.length) fxNote(root, `${f.name}: no timestamps this lab can read`, true);
    } else events.push(...found);
    render();
  };
  mountLoader(root, os, arg, (f) => void addFile(f));
  const logSec = section(root, "log text");
  const logTa = fxEl("textarea", "os-fx-input os-fx-notes", logSec) as HTMLTextAreaElement;
  logTa.placeholder = t("paste syslog / apache / ISO-timestamped lines");
  const logBar = fxEl("div", "os-fx-bar", logSec);
  const logBtn = fxEl("button", "os-btn", logBar, t("ingest lines"));
  logBtn.addEventListener("click", () => {
    const found = parseLogText(logTa.value, "pasted log");
    events.push(...found);
    fxNote(logBar, `${found.length} line(s) carried a readable timestamp`);
    render();
  });
  const manSec = section(root, "manual event");
  const manBar = fxEl("div", "os-fx-bar", manSec);
  const when = fxEl("input", "os-fx-input", manBar) as HTMLInputElement;
  when.type = "datetime-local";
  const what = fxEl("input", "os-fx-input os-fx-grow", manBar) as HTMLInputElement;
  what.placeholder = t("what happened");
  const addBtn = fxEl("button", "os-btn", manBar, t("add"));
  addBtn.addEventListener("click", () => {
    const t = when.value ? new Date(when.value).getTime() : NaN;
    if (!Number.isNaN(t) && what.value.trim()) { events.push({ t, source: "manual", event: what.value.trim() }); what.value = ""; render(); }
  });
  render();
}

/* ————— Mail Lab ————— */
export function buildMailLab(body: HTMLElement, os: BlacksiteOS, arg?: string) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  fxNote(root, t("authentication headers are reported as they stand in the message — this lab shows them, it does not grade them"));
  const out = fxEl("div", "", root);
  mountLoader(root, os, arg, async (f) => {
    out.textContent = "";
    let mail;
    try { mail = parseEml(f.bytes); } catch (e) { fxNote(out, (e as Error).message, true); return; }
    if (mail.flags.length) {
      const fs = section(out, "flags");
      for (const flag of mail.flags) fxNote(fs, flag, true);
    }
    const hs = section(out, "headers");
    const ht = fxEl("table", "os-fx-table", hs);
    for (const [k, v] of mail.headers) {
      const tr = fxEl("tr", "", ht);
      fxEl("td", "os-fx-k", tr, k);
      fxEl("td", "", tr, v.slice(0, 400));
    }
    if (mail.received.length) {
      const rs = section(out, "received chain — newest first, as written");
      const rt = fxEl("table", "os-fx-table", rs);
      const rh = fxEl("tr", "", rt);
      for (const h of ["from", "by", "with", "date", "delay from the hop below"]) fxEl("th", "", rh, h);
      mail.received.forEach((hop, i) => {
        const tr = fxEl("tr", "", rt);
        fxEl("td", "", tr, hop.from || "—");
        fxEl("td", "", tr, hop.by || "—");
        fxEl("td", "", tr, hop.with || "—");
        fxEl("td", "", tr, hop.date || "—");
        const below = mail.received[i + 1];
        let delay = "—";
        if (below && hop.ts !== null && below.ts !== null) {
          const sec = Math.round((hop.ts - below.ts) / 1000);
          delay = sec >= 0 ? `${sec} s` : `${sec} s (clock skew or a forged hop)`;
        }
        fxEl("td", "", tr, delay);
      });
    }
    const as = section(out, "authentication — verbatim");
    if (!mail.authLines.length) fxNote(as, t("no Authentication-Results, Received-SPF, DKIM-Signature or ARC headers in this message"));
    else {
      const at = fxEl("table", "os-fx-table", as);
      for (const [k, v] of mail.authLines) {
        const tr = fxEl("tr", "", at);
        fxEl("td", "os-fx-k", tr, k);
        fxEl("td", "os-fx-mono", tr, v.slice(0, 600));
      }
    }
    const treeSec = section(out, "MIME tree");
    const treePre = fxEl("pre", "os-fx-pre", treeSec);
    const walkTree = (p: ReturnType<typeof parseEml>["root"], depth: number, lines: string[]) => {
      lines.push(`${"  ".repeat(depth)}${p.type}${p.name ? " · " + p.name : ""}${p.body.length ? ` · ${p.body.length} B` : ""}${p.isAttachment ? " · attachment" : ""}`);
      p.children.forEach((c) => walkTree(c, depth + 1, lines));
    };
    const lines: string[] = [];
    walkTree(mail.root, 0, lines);
    treePre.textContent = lines.join("\n");
    if (mail.attachments.length) {
      const atSec = section(out, "attachments");
      const at = fxEl("table", "os-fx-table", atSec);
      const ah = fxEl("tr", "", at);
      for (const h of ["name", "type", "size", "sha-256", ""]) fxEl("th", "", ah, h);
      for (const att of mail.attachments) {
        const tr = fxEl("tr", "", at);
        fxEl("td", "", tr, att.name);
        fxEl("td", "", tr, att.type);
        fxEl("td", "", tr, fmtSize(att.size));
        fxEl("td", "os-fx-mono", tr, (await sha256(att.bytes)).slice(0, 20) + "…");
        const cell = fxEl("td", "", tr);
        const dl = fxEl("button", "os-btn", cell, t("save"));
        dl.addEventListener("click", () => download(att.name, att.bytes, att.type));
      }
    }
    const bs = section(out, "body");
    if (mail.textBody) { const pre = fxEl("pre", "os-fx-pre", bs); pre.textContent = mail.textBody.slice(0, 8000); }
    else if (mail.htmlBody) { fxNote(bs, t("no text/plain part — the HTML part, as source:")); const pre = fxEl("pre", "os-fx-pre", bs); pre.textContent = mail.htmlBody.slice(0, 8000); }
    else fxNote(bs, t("no readable body part"));
    fxNote(out, t("PDF and Office metadata live in the Metadata Lab; attachment hashes cross-check in the Hash Lab."));
  });
}

/* ————— Evidence Locker ————— */
export function buildEvidenceLocker(body: HTMLElement, os: BlacksiteOS) {
  body.textContent = "";
  const root = fxEl("div", "os-fx", body);
  fxNote(root, t("the standing locker at /evidence — what arrives is hashed, logged, and stays until you move it"));
  let locker = lockerLoad(os);
  lockerSave(os, locker);
  const status = fxNote(root, "");
  const main = fxEl("div", "", root);

  const render = () => {
    main.textContent = "";
    locker = lockerLoad(os);
    const inBar = fxEl("div", "os-fx-bar", main);
    const pick = fxEl("button", "os-btn", inBar, t("import files"));
    const fileIn = fxEl("input", "", inBar) as HTMLInputElement;
    fileIn.type = "file"; fileIn.multiple = true; fileIn.hidden = true;
    pick.addEventListener("click", () => fileIn.click());
    fxNote(inBar, t("or drop files in this window"));
    fileIn.addEventListener("change", async () => {
      for (const f of [...(fileIn.files || [])]) {
        status.textContent = `hashing ${f.name}…`;
        await intakeInto(os, LOCKER_ROOT, locker, f.name, new Uint8Array(await f.arrayBuffer()), "locker import");
        lockerSave(os, locker);
      }
      status.textContent = "";
      render();
    });

    const checked = new Set<string>();
    const tbl = fxEl("table", "os-fx-table", main);
    const hd = fxEl("tr", "", tbl);
    for (const h of ["", "file", "size", "type", "sha-256", "acquired", ""]) fxEl("th", "", hd, h);
    for (const rec of locker.items) {
      const tr = fxEl("tr", "", tbl);
      const cbCell = fxEl("td", "", tr);
      const cb = fxEl("input", "", cbCell) as HTMLInputElement;
      cb.type = "checkbox";
      cb.addEventListener("change", () => { if (cb.checked) checked.add(rec.file); else checked.delete(rec.file); });
      fxEl("td", "", tr, rec.file);
      fxEl("td", "", tr, fmtSize(rec.size));
      fxEl("td", "", tr, rec.type);
      fxEl("td", "os-fx-mono", tr, rec.sha256.slice(0, 12) + "…");
      fxEl("td", "", tr, rec.acquired.replace("T", " ").slice(0, 19));
      const acts = fxEl("td", "os-fx-acts", tr);
      const p = `${LOCKER_ROOT}/evidence/${rec.file}`;
      const toCase = fxEl("button", "os-btn", acts, t("to case"));
      toCase.addEventListener("click", async () => {
        const target = fxStore.currentCase;
        if (!target) { status.textContent = t("open a case in the Workbench first"); status.classList.add("os-fx-warn"); return; }
        const c = loadCase(os, target);
        const bytes = os.readBytes(p);
        if (!c || !bytes) return;
        await intakeInto(os, casePath(target), c, rec.file, bytes, "locker");
        saveCase(os, c);
        custody(os, LOCKER_ROOT, "copied to case", `${rec.file} → ${target}`);
        lockerSave(os, locker);
        status.textContent = `${rec.file} copied into case ${target} (custody noted on both sides)`;
        status.classList.remove("os-fx-warn");
      });
      const dl = fxEl("button", "os-btn", acts, t("save"));
      dl.addEventListener("click", () => { const b = os.readBytes(p); if (b) download(rec.file, b); });
      const rm = fxEl("button", "os-btn", acts, t("remove"));
      rm.addEventListener("click", () => {
        try { os.remove(p); } catch { /* already gone */ }
        locker.items = locker.items.filter((r) => r !== rec);
        custody(os, LOCKER_ROOT, "removed", `${rec.file} · sha256 ${rec.sha256.slice(0, 16)}…`);
        lockerSave(os, locker);
        render();
      });
    }
    if (!locker.items.length) fxNote(main, t("the locker is empty"));

    /* SEAL */
    const sealSec = section(main, "seal a bag — send");
    fxNote(sealSec, "tick items above, choose a passphrase, and the locker packs them into one encrypted .fxbag. the bag is a file — send it by any channel you trust. this OS does not transmit it, and the passphrase is never stored.");
    const sealBar = fxEl("div", "os-fx-bar", sealSec);
    const pass1 = fxEl("input", "os-fx-input", sealBar) as HTMLInputElement;
    pass1.type = "password"; pass1.placeholder = t("passphrase");
    const pass2 = fxEl("input", "os-fx-input", sealBar) as HTMLInputElement;
    pass2.type = "password"; pass2.placeholder = t("again");
    const sealBtn = fxEl("button", "os-btn", sealBar, t("seal bag"));
    const sealNote = fxNote(sealSec, "");
    sealBtn.addEventListener("click", async () => {
      const chosen = locker.items.filter((r) => checked.has(r.file));
      if (!chosen.length) { sealNote.textContent = t("tick at least one item"); return; }
      if (pass1.value.length < 4) { sealNote.textContent = t("a passphrase of at least 4 characters — longer is stronger"); return; }
      if (pass1.value !== pass2.value) { sealNote.textContent = t("the passphrases do not match"); return; }
      sealNote.textContent = t("deriving the key (PBKDF2, 600,000 rounds) and sealing…");
      const files = [];
      for (const r of chosen) {
        const bytes = os.readBytes(`${LOCKER_ROOT}/evidence/${r.file}`);
        if (bytes) files.push({ name: r.file, bytes });
      }
      const { bag, manifest } = await sealBag(files, "locker /evidence", custodyLines(os, LOCKER_ROOT).slice(-20), pass1.value);
      custody(os, LOCKER_ROOT, "sealed bag", `${manifest.id} · ${files.length} file(s) · ${fmtSize(bag.length)}`);
      lockerSave(os, locker);
      download(`${manifest.id}.fxbag`, bag);
      sealNote.textContent = tf("sealed: {id}.fxbag · {n} file(s) · {size} — custody noted", { id: manifest.id, n: files.length, size: fmtSize(bag.length) });
      pass1.value = ""; pass2.value = "";
    });

    /* OPEN */
    const openSec = section(main, "open a bag — receive");
    fxNote(openSec, t("a sealed bag is opened only whole: the GCM tag must verify, then every file's SHA-256 is checked against the bag's manifest before anything is filed. a mismatch is refused, in red, by name."));
    const openBar = fxEl("div", "os-fx-bar", openSec);
    const bagBtn = fxEl("button", "os-btn", openBar, t("choose .fxbag"));
    const bagIn = fxEl("input", "", openBar) as HTMLInputElement;
    bagIn.type = "file"; bagIn.accept = ".fxbag"; bagIn.hidden = true;
    bagBtn.addEventListener("click", () => bagIn.click());
    const openPass = fxEl("input", "os-fx-input", openBar) as HTMLInputElement;
    openPass.type = "password"; openPass.placeholder = t("bag passphrase");
    const openBtn = fxEl("button", "os-btn", openBar, t("open bag"));
    const openOut = fxEl("div", "", openSec);
    let bagBytes: Uint8Array | null = null;
    let bagName = "";
    bagIn.addEventListener("change", async () => {
      const f = bagIn.files?.[0];
      if (f) { bagBytes = new Uint8Array(await f.arrayBuffer()); bagName = f.name; fxNote(openBar, f.name); }
    });
    openBtn.addEventListener("click", async () => {
      openOut.textContent = "";
      if (!bagBytes) { fxNote(openOut, t("choose a .fxbag first"), true); return; }
      if (!openPass.value) { fxNote(openOut, t("the bag needs its passphrase"), true); return; }
      fxNote(openOut, t("deriving the key and checking the seal…"));
      let opened;
      try { opened = await openBag(bagBytes, openPass.value); }
      catch (e) { openOut.textContent = ""; fxNote(openOut, (e as Error).message, true); return; }
      openOut.textContent = "";
      const m = opened.manifest;
      fxNote(openOut, `bag ${m.id} · sealed ${m.created} · from ${m.source} · ${opened.files.length} file(s)`);
      const t2 = fxEl("table", "os-fx-table", openOut);
      const h2 = fxEl("tr", "", t2);
      for (const h of ["file", "size", "sha-256 verifies"]) fxEl("th", "", h2, h);
      let refused = 0;
      for (const file of opened.files) {
        const tr = fxEl("tr", file.verified ? "" : "os-fx-bad", t2);
        fxEl("td", "", tr, file.name);
        fxEl("td", "", tr, fmtSize(file.bytes.length));
        fxEl("td", "os-fx-mono", tr, file.verified ? "yes — " + file.sha256.slice(0, 16) + "…" : "NO — refused");
        if (!file.verified) refused++;
      }
      if (m.custody.length) {
        fxEl("h3", "os-fx-h", openOut, t("custody excerpt carried in the bag"));
        const pre = fxEl("pre", "os-fx-pre", openOut);
        pre.textContent = m.custody.join("\n");
      }
      const survivors = opened.files.filter((f) => f.verified);
      if (survivors.length) {
        const inBtn = fxEl("button", "os-btn", openOut, `intake ${survivors.length} verified file(s) into the locker`);
        inBtn.addEventListener("click", async () => {
          for (const file of survivors) {
            await intakeInto(os, LOCKER_ROOT, locker, file.name, file.bytes, `bag ${m.id}`);
            custody(os, LOCKER_ROOT, "received from bag", `${file.name} · bag ${m.id} · sha256 verified`);
          }
          lockerSave(os, locker);
          openPass.value = "";
          render();
        });
      }
      if (refused) fxNote(openOut, tf("{n} file(s) failed verification and were refused", { n: refused }), true);
      void bagName;
    });

    const logSec = section(main, "locker custody");
    const pre = fxEl("pre", "os-fx-pre", logSec);
    pre.textContent = custodyLines(os, LOCKER_ROOT).join("\n") || "(no entries)";
  };
  body.addEventListener("dragover", (e) => e.preventDefault());
  body.addEventListener("drop", async (e) => {
    e.preventDefault();
    for (const f of [...(e.dataTransfer?.files || [])]) {
      if (/\.fxbag$/i.test(f.name)) continue; // bags are opened, not intaken raw
      await intakeInto(os, LOCKER_ROOT, locker, f.name, new Uint8Array(await f.arrayBuffer()), "locker drop");
      lockerSave(os, locker);
    }
    render();
  });
  render();
}
