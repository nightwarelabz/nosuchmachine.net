/* DIAGNOSTIC ONLY (diag/nest-boot-canary branch — never merges):
 * paints boot stages into #boot-canary so a stalled nest shows
 * exactly where it died, readable in a plain screenshot. */
const c = document.getElementById("boot-canary");
if (c) {
  c.textContent = "CANARY 1: canary module ran";
  const w = window as unknown as { __bootStage?: string };
  window.addEventListener("error", (e) => {
    c.textContent += `\nERR: ${e.message || e.type} @${(e.filename || "").split("/").pop()}:${e.lineno || ""}`;
  });
  window.addEventListener("unhandledrejection", (e) => {
    c.textContent += `\nREJ: ${String((e as PromiseRejectionEvent).reason).slice(0, 160)}`;
  });
  let ticks = 0;
  setInterval(() => {
    ticks++;
    const line = `CANARY tick ${ticks}: entry=${w.__bootStage || "never ran"}`;
    const lines = (c.textContent || "").split("\n").filter((l) => !l.startsWith("CANARY tick"));
    c.textContent = [...lines, line].join("\n");
  }, 2000);
}
