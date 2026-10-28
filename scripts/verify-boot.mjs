// Controller regressions with a deterministic clock and a deliberately small DOM.
// Browser rendering is checked separately; these exercise failure and handoff.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("src/scripts/os-boot.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lines = ["firmware", "memory", "vfs mounted", "engines ready", "emcon open", "doctrine", "", "BLACKSITE IS NOW LIVE"];

function harness({ search = "", reduced = false, storageDenied = false, canvasFailure = false, revealFailure = false, depth = 0 } = {}) {
  let now = 0, next = 1, ready = 0, disposed = 0;
  const jobs = new Map(), saved = new Map(), styles = new Map();
  const doc = new EventTarget(), win = new EventTarget();
  class Element extends EventTarget {
    hidden = false; inert = false; textContent = ""; dataset = {}; attributes = new Map();
    classes = new Set(); children = []; parentElement = null;
    classList = { add: (...names) => names.forEach((name) => this.classes.add(name)) };
    style = { setProperty: (key, value) => styles.set(key, value) };
    querySelector = (query) => nodes.get(query) || null;
    querySelectorAll = (query) => lists.get(query) || [];
    setAttribute = (key, value) => this.attributes.set(key, value);
    toggleAttribute = (key, active) => active ? this.attributes.set(key, "") : this.attributes.delete(key);
    replaceChildren = (...children) => { this.children = children; };
    contains = (node) => this === node || this.children.includes(node);
    focus = () => { doc.activeElement = this; };
    remove = () => { this.removed = true; };
  }
  class Button extends Element {}
  const nodes = new Map();
  for (const id of ["os-boot-classic", "os-boot-thinice", "os-boot-text", "os-boot-announcement", "os-boot-frost", "os-boot-stage", "os-boot-detail", "os-boot-percent", "os-boot-progress", "os-boot-depth", "os-boot-emcon"]) nodes.set(`#${id}`, new Element());
  const skip = new Button(), classic = new Button(), thinice = new Button();
  nodes.set("[data-boot-classic]", classic); nodes.set("[data-boot-thinice]", thinice); nodes.set("[data-boot-skip]", skip);
  const desk = new Element(), taskbar = new Element(), overlay = new Element(), start = new Button();
  overlay.parentElement = new Element(); overlay.children = [...nodes.values(), skip];
  const lists = new Map([["[data-boot-skip]", [skip]], ["[data-boot-checkpoint]", Array.from({ length: 4 }, () => new Element())], [".os-desktop, .os-taskbar", [desk, taskbar]]]);
  doc.activeElement = doc.body = new Element();
  doc.getElementById = () => start;
  doc.createTextNode = (text) => ({ textContent: text });
  doc.createElement = () => new Element();
  win.location = { search };
  win.matchMedia = () => ({ matches: reduced });
  const api = {};
  vm.runInNewContext(source, {
    exports: api, document: doc, window: win, HTMLButtonElement: Button, AbortController, URLSearchParams,
    localStorage: {
      getItem: (key) => { if (storageDenied) throw new Error("denied"); return saved.get(key) || null; },
      setItem: (key, value) => { if (storageDenied) throw new Error("denied"); saved.set(key, value); },
    },
    performance: { now: () => now },
    setTimeout: (run, delay) => { const id = next++; jobs.set(id, { at: now + delay, run }); return id; },
    clearTimeout: (id) => jobs.delete(id),
    require: (name) => {
      // os-boot's whole dependency set, named on purpose: the frost plate,
      // and the language engine (2026-10-28 — boot labels translate; the
      // stub serves t() as the identity, the boot tests exercise the
      // controller, not the dictionary).
      if (name === "./os-i18n") return { t: (s) => s };
      assert.equal(name, "./os-boot-frost");
      return { createFrostPlate: () => {
        if (canvasFailure) throw new Error("no context");
        return { reveal: () => { if (revealFailure) throw new Error("lost context"); }, dispose: () => disposed++ };
      } };
    },
  });
  const advance = (until) => {
    let budget = 1000;
    while (budget--) {
      const first = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first || first[1].at > until) { now = until; return; }
      jobs.delete(first[0]); now = first[1].at; first[1].run();
    }
    throw new Error("timer loop");
  };
  return {
    api, nodes, lists, saved, styles, overlay, desk, taskbar, skip, classic, thinice, doc, win, start, advance, jobs,
    ready: () => ready, disposed: () => disposed,
    startBoot: () => api.startBootSequence({ overlay, lines, depth, emcon: "alpha", storageKey: "test-boot", onReady: () => ready++ }),
    key: (key, target = doc.body, modifiers = {}) => {
      const event = new Event("keydown", { cancelable: true });
      Object.assign(event, { key, ...modifiers }); Object.defineProperty(event, "target", { value: target });
      doc.dispatchEvent(event);
    },
  };
}

let count = 0;
function check(name, test) { test(); count++; console.log(`PASS ${name}`); }

check("URL overrides a saved style without overwriting it", () => {
  const h = harness({ search: "?boot=thinice" });
  h.api.rememberBootStyle("classic", "test-boot");
  assert.equal(h.api.bootStyle("test-boot"), "thinice");
  assert.equal(h.api.preferredBootStyle("test-boot"), "classic");
});
check("invalid query values and blocked storage safely default to Thinice", () => {
  const h = harness({ search: "?boot=bogus", storageDenied: true });
  assert.equal(h.api.bootStyle("test-boot"), "thinice");
  h.api.rememberBootStyle("classic", "test-boot");
  h.startBoot(); h.advance(5300); assert.equal(h.ready(), 1);
});
check("normal boot reaches 100%, restores interaction once and releases every timer", () => {
  const h = harness(); h.startBoot();
  assert.equal(h.desk.inert, true); assert.equal(h.taskbar.inert, true);
  h.advance(4400); assert.equal(h.nodes.get("#os-boot-progress").attributes.get("aria-valuenow"), "100");
  h.advance(8000);
  assert.equal(h.ready(), 1); assert.equal(h.disposed(), 1);
  assert.equal(h.desk.inert, false); assert.equal(h.taskbar.inert, false);
  assert.equal(h.overlay.removed, true); assert.equal(h.jobs.size, 0);
});
check("rapid skips and stale input cannot restore the session twice", () => {
  const h = harness(); h.startBoot();
  h.skip.dispatchEvent(new Event("click")); h.skip.dispatchEvent(new Event("click"));
  h.advance(8000); assert.equal(h.ready(), 1); assert.equal(h.jobs.size, 0);
});
check("Enter and Escape skip, without stealing native button activation or modified keys", () => {
  const h = harness(); h.startBoot();
  h.key("Enter", h.classic); assert.equal(h.ready(), 0);
  h.key("Enter", h.doc.body, { ctrlKey: true }); assert.equal(h.ready(), 0);
  h.key("Enter", h.doc.body, { isComposing: true }); assert.equal(h.ready(), 0);
  h.key("Enter"); assert.equal(h.ready(), 1);
  const escape = harness(); escape.startBoot(); escape.key("Escape"); escape.advance(8000);
  assert.equal(escape.ready(), 1); assert.equal(escape.jobs.size, 0);
});
check("skipping with keyboard focus returns focus to Start and preserves existing inert state", () => {
  const h = harness(); h.taskbar.inert = true; h.startBoot(); h.doc.activeElement = h.skip;
  h.key("Escape"); assert.equal(h.doc.activeElement, h.start);
  assert.equal(h.taskbar.inert, true); assert.equal(h.desk.inert, false);
});
check("the fallback preference stays inside its supplied nest namespace", () => {
  const h = harness(); h.api.rememberBootStyle("classic", "nested-boot");
  assert.equal(h.api.preferredBootStyle("nested-boot"), "classic");
  assert.equal(h.api.preferredBootStyle("surface-boot"), "thinice");
});
check("missing canvas falls back to the original terminal and still starts", () => {
  const h = harness({ canvasFailure: true }); h.startBoot();
  assert.equal(h.overlay.dataset.boot, "classic");
  h.advance(2000); assert.equal(h.ready(), 1);
  assert.equal(h.nodes.get("#os-boot-text").textContent, lines.join("\n"));
});
check("a canvas failure during the reveal also falls back and disposes", () => {
  const h = harness({ revealFailure: true }); h.startBoot();
  assert.equal(h.overlay.dataset.boot, "classic"); assert.equal(h.disposed(), 1);
  h.advance(8000); assert.equal(h.ready(), 1); assert.equal(h.jobs.size, 0);
});
check("classic button switches immediately and remembers the fallback", () => {
  const h = harness(); h.startBoot(); h.advance(500);
  h.classic.dispatchEvent(new Event("click"));
  assert.equal(h.saved.get("test-boot"), "classic"); assert.equal(h.overlay.dataset.boot, "classic");
  h.advance(8000); assert.equal(h.ready(), 1); assert.equal(h.jobs.size, 0);
});
check("classic keeps a way to select Thinice for the next boot", () => {
  const h = harness({ search: "?boot=classic" }); h.startBoot();
  h.thinice.dispatchEvent(new Event("click"));
  assert.equal(h.saved.get("test-boot"), "thinice");
  h.advance(8000); assert.equal(h.ready(), 1); assert.equal(h.disposed(), 0);
});
check("reduced motion displays a static plate and completes within half a second", () => {
  const h = harness({ reduced: true }); h.startBoot();
  assert.equal(h.styles.get("--cold-progress"), "1");
  h.advance(500); assert.equal(h.ready(), 1); assert.equal(h.overlay.removed, true);
});
check("nested boots are brief and identify their volatile depth", () => {
  const h = harness({ depth: 3 }); h.startBoot();
  assert.equal(h.nodes.get("#os-boot-depth").textContent, "NEST 03 · VOLATILE");
  assert.equal(h.nodes.get("#os-boot-emcon").textContent, "EMCON ALPHA");
  h.advance(300); assert.equal(h.ready(), 1);
});
check("removing cold-start markup still leaves a working classic boot", () => {
  const h = harness(); h.nodes.delete("#os-boot-thinice"); h.startBoot();
  h.advance(2000); assert.equal(h.ready(), 1);
});
check("the safety deadline releases a boot even when animation callbacks stall", () => {
  const h = harness(); h.startBoot();
  // Discard presentation ticks while retaining the independent deadline.
  for (const [id, job] of h.jobs) if (job.at < 7000) h.jobs.delete(id);
  h.advance(8000); assert.equal(h.ready(), 1); assert.equal(h.desk.inert, false);
});

console.log(`Verified ${count} boot controller regressions.`);
