// IVORY-TOWER — headless proof of the clockwork observance and its
// coupling to AEGIS. Two layers:
//   1. the tower alone (src/scripts/os-ivory.ts): SHA-256 vectors,
//      the Merkle root, the escalation ladder, the chained ledger.
//   2. the tower wired into the real shell (src/scripts/os-shell.ts):
//      funnel writes are accounted, writes that bypass the funnel
//      are convicted, a slow drip raises the watch without tripping,
//      register tampering and a broken ledger hand the room to AEGIS.
// Deterministic: a fake clock and in-memory storage throughout.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

let fakeNow = 1_700_000_000_000;
class FakeDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fakeNow])); }
  static now() { return fakeNow; }
}
function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const timers = new Map();
let timerSeq = 1;
function fakeSetTimeout(fn) { const id = timerSeq++; timers.set(id, fn); return id; }
function fakeClearTimeout(id) { timers.delete(id); }
function flushTimers() { const fns = [...timers.values()]; timers.clear(); for (const fn of fns) fn(); }

function loadModule(source, requireMap, storage) {
  const api = {};
  vm.runInNewContext(source, {
    exports: api, module: { exports: api },
    require: (name) => {
      if (name in requireMap) return requireMap[name];
      throw new Error("unexpected require: " + name);
    },
    localStorage: storage, Date: FakeDate,
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
    TextEncoder, TextDecoder, btoa, atob, console,
    AbortController, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  }, { filename: "module.js" });
  return api;
}

/* ————— layer 1: the tower alone ————— */
const ivory = loadModule(transpile("src/scripts/os-ivory.ts"), {}, makeStorage());
const { sha256Hex, hashText, merkleRoot, IvoryTower } = ivory;
const te = new TextEncoder();

assert.equal(sha256Hex(te.encode("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256 empty vector");
assert.equal(sha256Hex(te.encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 abc vector");
assert.equal(sha256Hex(te.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1", "sha256 56-byte vector");
assert.equal(sha256Hex(new Uint8Array(1_000_000).fill(0x61)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0", "sha256 million-a vector");

const leavesA = [{ path: "/a", hash: hashText("one") }, { path: "/b", hash: hashText("two") }];
const leavesB = [{ path: "/b", hash: hashText("two") }, { path: "/a", hash: hashText("one") }];
assert.equal(merkleRoot(leavesA), merkleRoot(leavesB), "merkle root is order-independent");
assert.notEqual(merkleRoot(leavesA), merkleRoot([{ path: "/a", hash: hashText("one") }, { path: "/b", hash: hashText("TWO") }]), "one changed byte moves the root");

const CAN = "/home/operator/documents/wallet-recovery.txt";
function input(files, over = {}) {
  return {
    at: fakeNow, trigger: "clock",
    files: Object.entries(files).map(([path, c]) => ({ path, hash: hashText("f:" + c) })),
    canaries: { [CAN]: files[CAN] ? hashText("f:" + files[CAN]) : null },
    aegisPrint: "aegis-1", storePrints: { vfs: "v1", macros: "m1", settings: "s1" },
    contained: false, ...over,
  };
}
const room = { "/a": "alpha", "/b": "beta", [CAN]: "canary-song" };

{ // baseline, clean, accounted
  const t = new IvoryTower();
  let r = t.observe(input(room));
  assert.equal(r.findings.length, 0, "first observance is a baseline");
  r = t.observe(input(room));
  assert.equal(r.findings.length, 0, "an unchanged room observes clean");
  t.noteMutation("/a", false);
  r = t.observe(input({ ...room, "/a": "alpha-2" }));
  assert.equal(r.findings.length, 0, "a funnel-accounted change is no finding");
  assert.equal(t.verifyChain().ok, true, "the chain holds over clean observances");
}
{ // unaccounted drift: watch, then trip
  const t = new IvoryTower();
  t.observe(input(room));
  let r = t.observe(input({ ...room, "/a": "forged" }));
  assert.equal(r.state, "watch", "first unaccounted drift raises the watch");
  assert.ok(r.findings.some((f) => f.kind === "drift" && f.severity === "watch"), "drift finding is a watch");
  r = t.observe(input({ ...room, "/a": "forged", "/b": "forged-too" }));
  assert.ok(r.findings.some((f) => f.severity === "trip"), "drift under the watch trips");
}
{ // canary behind the funnel: immediate trip from calm
  const t = new IvoryTower();
  t.observe(input(room));
  const r = t.observe(input({ ...room, [CAN]: "ransacked" }));
  assert.ok(r.findings.some((f) => f.kind === "canary" && f.severity === "trip"), "canary drift trips at once");
}
{ // AEGIS register + store registers
  const t = new IvoryTower();
  t.observe(input(room));
  let r = t.observe(input(room, { aegisPrint: "aegis-TAMPERED" }));
  assert.ok(r.findings.some((f) => f.kind === "aegis-register" && f.severity === "trip"), "an AEGIS register moved by no AEGIS hand trips");
  const t2 = new IvoryTower();
  t2.observe(input(room));
  t2.noteAegis();
  r = t2.observe(input(room, { aegisPrint: "aegis-2" }));
  assert.equal(r.findings.length, 0, "AEGIS's own housekeeping is accounted");
  const t3 = new IvoryTower();
  t3.observe(input(room));
  r = t3.observe(input(room, { storePrints: { vfs: "vTAMPERED", macros: "m1", settings: "s1" } }));
  assert.ok(r.findings.some((f) => f.kind === "register" && f.severity === "trip"), "a persistence register rewritten outside the save hand trips");
}
{ // the slow cadence: watch, never trip
  const t = new IvoryTower();
  const many = {}; for (let i = 0; i < 14; i++) many["/f" + i] = "v1";
  t.observe(input({ ...many, [CAN]: "canary-song" }));
  for (let i = 0; i < 12; i++) { t.noteMutation("/f" + i, false); many["/f" + i] = "v2-" + i; }
  const r = t.observe(input({ ...many, [CAN]: "canary-song" }));
  assert.ok(r.findings.some((f) => f.kind === "cadence" && f.severity === "watch"), "a patient cadence over existing files raises the watch");
  assert.ok(!r.findings.some((f) => f.severity === "trip"), "rhythm alone never trips");
}
{ // watch decay: three clean observances stand the tower down
  const t = new IvoryTower();
  t.observe(input(room));
  t.observe(input({ ...room, "/a": "forged" }));
  assert.equal(t.state, "watch");
  t.observe(input({ ...room, "/a": "forged" }));
  t.observe(input({ ...room, "/a": "forged" }));
  const r = t.observe(input({ ...room, "/a": "forged" }));
  assert.equal(t.state, "calm", "three clean observances stand the watch down");
  assert.ok(r.findings.some((f) => f.kind === "stand-down"), "the stand-down is itself entered in the ledger");
}
{ // the ledger across a reload: chain holds; tampered, it trips
  const t = new IvoryTower();
  t.observe(input(room));
  t.observe(input(room));
  const saved = t.serialize();
  const t2 = new IvoryTower();
  assert.equal(t2.restore(saved), true, "the ledger restores");
  assert.equal(t2.verifyChain().ok, true, "the restored chain verifies");
  const forged = JSON.parse(saved);
  forged.entries[0].root = "0".repeat(64);
  const t3 = new IvoryTower();
  t3.restore(JSON.stringify(forged));
  assert.equal(t3.verifyChain().ok, false, "a rewritten entry breaks the chain");
  const r = t3.observe(input(room));
  assert.ok(r.findings.some((f) => f.kind === "chain" && f.severity === "trip"), "a broken chain trips at the next observance");
}
{ // boot drift is a note — except the canary, which trips from the dark
  const t = new IvoryTower();
  t.observe(input(room));
  const saved = t.serialize();
  const t2 = new IvoryTower();
  t2.restore(saved);
  let r = t2.observe(input({ ...room, "/a": "edited-offline" }, { trigger: "boot" }));
  assert.ok(r.findings.some((f) => f.kind === "drift" && f.severity === "note"), "between sessions, drift is noted, not accused");
  assert.ok(!r.findings.some((f) => f.severity === "trip"), "boot drift alone does not trip");
  const t3 = new IvoryTower();
  t3.restore(saved);
  r = t3.observe(input({ ...room, [CAN]: "gone-in-the-dark" }, { trigger: "boot" }));
  assert.ok(r.findings.some((f) => f.kind === "canary" && f.severity === "trip"), "a canary altered between sessions trips at boot");
}
console.log("ivory layer 1: the tower alone — all assertions held");

/* ————— layer 2: the tower in the real shell ————— */
const shell = loadModule(transpile("src/scripts/os-shell.ts"), {
  "../data/blacksite-commands.json": [],
  "./os-parse": { identifyFile: () => null, hexdump: () => "" },
  "./os-sound": { sfx: () => {} },
  "./os-depth": { skey: (k) => k },
  "./os-ivory": ivory,
}, makeStorage()); // placeholder storage, replaced per scenario below

function bootOS(storage) {
  // os-shell captured the localStorage global at load; rebuild the
  // module per scenario so each room gets its own storage world.
  return loadModule(transpile("src/scripts/os-shell.ts"), {
    "../data/blacksite-commands.json": [],
    "./os-parse": { identifyFile: () => null, hexdump: () => "" },
    "./os-sound": { sfx: () => {} },
    "./os-depth": { skey: (k) => k },
    "./os-ivory": ivory,
  }, storage);
}
void shell;

{ // accounted work observes clean; a bypass is watched, then trips AEGIS
  const storage = makeStorage();
  const { BlacksiteOS } = bootOS(storage);
  const os = new BlacksiteOS();
  assert.equal(os.aegis.contained, false);
  assert.ok(os.ivoryStatus().ticks >= 1, "the boot observance is in the ledger");
  os.write("/home/operator/notes.txt", "honest work, through the funnel");
  flushTimers();
  let r = os.ivoryObserveNow("clock");
  assert.equal(r.findings.length, 0, "funnel work is accounted — the tower is silent");
  os.files.set("/home/operator/notes.txt", { type: "file", content: "written by no funnel", mtime: fakeNow });
  r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.severity === "watch"), "a bypass of the funnel raises the watch");
  assert.equal(os.aegis.contained, false, "the watch does not contain");
  assert.ok(os.aegisStatus().snaps.some((s) => s.why === "ivory-watch"), "AEGIS took the ivory-watch snapshot");
  os.files.set("/home/operator/scope.txt", { type: "file", content: "a second silent hand", mtime: fakeNow });
  r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.severity === "trip"), "drift under the watch trips");
  assert.equal(os.aegis.contained, true, "AEGIS containment is the sentence — the coupling holds");
  assert.equal(os.aegisRestore(), true, "the room restores");
  assert.equal(os.aegis.contained, false);
  r = os.ivoryObserveNow("clock");
  assert.ok(!r.findings.some((f) => f.severity === "trip"), "after the operator's restore the tower re-baselines and does not accuse the hand that feeds it");
}
{ // the slow drip: twelve patient funnel writes — watch, never containment
  const storage = makeStorage();
  const { BlacksiteOS } = bootOS(storage);
  const os = new BlacksiteOS();
  // the seeds land eleven seconds apart: an operator creating files,
  // not a burst — AEGIS's ten-in-ten-seconds breaker stays silent.
  for (let i = 0; i < 12; i++) { fakeNow += 11_000; os.write(`/home/operator/drip-${i}.txt`, "seed " + i); }
  flushTimers();
  os.ivoryObserveNow("clock"); // the seeds enter the measure
  for (let i = 0; i < 12; i++) {
    fakeNow += 30_000; // thirty patient seconds between files — far under AEGIS's cadence
    os.write(`/home/operator/drip-${i}.txt`, "dripped " + i);
    flushTimers();
  }
  const r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.kind === "cadence" && f.severity === "watch"), "the drip raises the tower's watch");
  assert.equal(os.aegis.contained, false, "and AEGIS does not trip on rhythm — the drip was accounted work");
}
{ // the canary, touched behind the funnel, trips at once
  const storage = makeStorage();
  const { BlacksiteOS } = bootOS(storage);
  const os = new BlacksiteOS();
  os.files.set(CAN, { type: "file", content: "the decoy, rewritten in silence", mtime: fakeNow });
  const r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.kind === "canary" && f.severity === "trip"), "canary drift behind the funnel trips");
  assert.equal(os.aegis.contained, true, "containment follows the tower's word");
}
{ // AEGIS's own register, rewritten in storage, trips at the next tick
  const storage = makeStorage();
  const { BlacksiteOS } = bootOS(storage);
  const os = new BlacksiteOS();
  os.ivoryObserveNow("clock");
  storage.setItem("blacksite-aegis-v1", JSON.stringify({ contained: false, trips: [], snaps: [] }));
  const r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.kind === "aegis-register" && f.severity === "trip"), "a snapshot ring wiped in storage is convicted by its fingerprint");
  assert.equal(os.aegis.contained, true);
}
{ // a ledger rewritten between sessions trips at boot, before anything else
  const storage = makeStorage();
  const first = bootOS(storage);
  const os1 = new first.BlacksiteOS();
  os1.ivoryObserveNow("clock");
  const raw = storage.getItem("blacksite-ivory-v1");
  assert.ok(raw, "the tower persisted its ledger");
  const forged = JSON.parse(raw);
  forged.entries[0].findings = ["note:forged-history"];
  storage.setItem("blacksite-ivory-v1", JSON.stringify(forged));
  fakeNow += 60_000;
  const second = bootOS(storage);
  const os2 = new second.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "the broken chain tripped containment at boot");
  assert.ok(os2.journal.some((j) => j.text.includes("ledger chain is broken")), "the journal names the broken chain");
}
console.log("ivory layer 2: the tower in the shell — all assertions held");
console.log("verify-ivory: OK");
