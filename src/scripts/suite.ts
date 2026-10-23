// BLACKSITE WEB — console shell: rail navigation, global target, and the
// session Report (the Deliveries of the web bench). All probe logic lives
// in nettools.ts (edge) and lab.ts (local).
import { initLab } from "./lab";
import { initNetTools, globalTarget } from "./nettools";

interface ReportEntry { source: string; title: string; body: unknown; at: string; }
const report: ReportEntry[] = [];

function switchPanel(id: string) {
  document.querySelectorAll<HTMLElement>(".panel").forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  document.querySelectorAll<HTMLButtonElement>(".rail-btn").forEach((b) => {
    const active = b.dataset.panel === id;
    b.classList.toggle("active", active);
    b.setAttribute("aria-current", active ? "page" : "false");
  });
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderReport() {
  const list = document.getElementById("report-list");
  const count = document.getElementById("report-count");
  if (count) count.textContent = String(report.length);
  if (!list) return;
  if (!report.length) {
    list.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "report-empty";
    empty.textContent = "Nothing yet. Run a probe and its result lands here, exportable as JSON or Markdown.";
    list.appendChild(empty);
    return;
  }
  list.innerHTML = "";
  for (const entry of [...report].reverse()) {
    const item = document.createElement("article");
    item.className = "report-item";
    const head = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const meta = document.createElement("span");
    meta.textContent = `${entry.source} · ${new Date(entry.at).toLocaleTimeString()}`;
    head.append(title, meta);
    const pre = document.createElement("pre");
    pre.textContent = typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body, null, 2);
    item.append(head, pre);
    list.appendChild(item);
  }
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportReport(kind: "json" | "md") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (kind === "json") {
    download(`blacksite-web-report-${stamp}.json`, JSON.stringify({ generated: new Date().toISOString(), tool: "BLACKSITE WEB — nosuchmachine.net", entries: report }, null, 2), "application/json");
    return;
  }
  const lines = ["# BLACKSITE WEB — session report", "", `Generated: ${new Date().toISOString()}`, `Target: ${globalTarget() || "(various)"}`, ""];
  for (const e of report) {
    lines.push(`## ${e.title}`, "", `Source: ${e.source} · ${e.at}`, "", "```json", typeof e.body === "string" ? e.body : JSON.stringify(e.body, null, 2), "```", "");
  }
  download(`blacksite-web-report-${stamp}.md`, lines.join("\n"), "text/markdown");
}

function syncTargetToTools() {
  const target = globalTarget();
  if (!target) return;
  const host = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0].split(":")[0];
  const set = (id: string, v: string) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el && !el.value) el.value = v; };
  set("dns-name", host);
  set("tls-host", host);
  set("tcp-host", host);
  set("recon-domain", host);
  const http = document.getElementById("http-url") as HTMLInputElement | null;
  if (http && !http.value) http.value = /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `https://${host}/`;
}

function init() {
  document.querySelectorAll<HTMLFormElement>("form.bs-form").forEach((f) => {
    f.addEventListener("submit", (e) => e.preventDefault());
  });
  document.querySelectorAll<HTMLButtonElement>(".rail-btn").forEach((b) => {
    b.addEventListener("click", () => switchPanel(b.dataset.panel || "overview"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => switchPanel(b.dataset.goto || "overview"));
  });
  document.addEventListener("blacksite:report", (e) => {
    const entry = (e as CustomEvent<ReportEntry>).detail;
    report.push(entry);
    renderReport();
  });
  document.getElementById("global-target")?.addEventListener("change", syncTargetToTools);
  document.getElementById("report-export-json")?.addEventListener("click", () => exportReport("json"));
  document.getElementById("report-export-md")?.addEventListener("click", () => exportReport("md"));
  document.getElementById("report-clear")?.addEventListener("click", () => { report.length = 0; renderReport(); });
  // Copy buttons: <button data-copy="element-id">
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]");
    if (!btn) return;
    const src = document.getElementById(btn.dataset.copy || "");
    const text = src instanceof HTMLInputElement || src instanceof HTMLTextAreaElement ? src.value : src?.textContent || "";
    if (text) void navigator.clipboard.writeText(text).then(() => { const old = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = old), 1400); });
  });
  initLab();
  initNetTools();
  renderReport();
  const fromHash = location.hash.replace("#", "");
  if (fromHash && document.getElementById(`panel-${fromHash}`)) switchPanel(fromHash);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
