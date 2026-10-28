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
function makeStorage(sharedMap) {
  // a storage FACADE over a backing map: each module load (each
  // simulated page realm) gets its own facade over the same map,
  // exactly as a fresh browser realm gets a fresh localStorage
  // object over the same store. Attacks written to the map
  // directly are between-sessions attacks — no realm was alive
  // to see them; attacks through a live facade pass the realm's
  // storage surface, sentinel and all.
  const map = sharedMap || new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => ([...map.keys()][i] ?? null),
  };
}
const timers = new Map();
let timerSeq = 1;
function fakeSetTimeout(fn) { const id = timerSeq++; timers.set(id, fn); return id; }
function fakeClearTimeout(id) { timers.delete(id); }
function flushTimers() { const fns = [...timers.values()]; timers.clear(); for (const fn of fns) fn(); }

function loadModule(source, requireMap, storage, sessionMap) {
  const api = {};
  vm.runInNewContext(source, {
    exports: api, module: { exports: api },
    require: (name) => {
      if (name in requireMap) return requireMap[name];
      throw new Error("unexpected require: " + name);
    },
    localStorage: storage, sessionStorage: makeStorage(sessionMap), Date: FakeDate,
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
const jaDict = loadModule(transpile("src/scripts/os-i18n-ja.ts"), {}, makeStorage());
const i18n = loadModule(transpile("src/scripts/os-i18n.ts"), { "./os-i18n-ja": jaDict, "./os-depth": { skey: (k) => k } }, makeStorage());
const tripwire = loadModule(transpile("src/scripts/os-tripwire.ts"), { "./os-ivory": ivory }, makeStorage());
void tripwire;
const shell = loadModule(transpile("src/scripts/os-shell.ts"), {
  "../data/blacksite-commands.json": [],
  "./os-parse": { identifyFile: () => null, hexdump: () => "" },
  "./os-sound": { sfx: () => {} },
  "./os-depth": { skey: (k) => k },
  "./os-ivory": ivory,
  "./os-tripwire": tripwire,
  "./os-i18n": i18n,
}, makeStorage()); // placeholder storage, replaced per scenario below

function bootOS(shared, sessionShared) {
  // os-shell captured the localStorage global at load; rebuild the
  // module per scenario so each room gets its own storage world —
  // a fresh facade over the scenario's shared backing map.
  const storage = makeStorage(shared);
  const mod = loadModule(transpile("src/scripts/os-shell.ts"), {
    "../data/blacksite-commands.json": [],
    "./os-parse": { identifyFile: () => null, hexdump: () => "" },
    "./os-sound": { sfx: () => {} },
    "./os-depth": { skey: (k) => k },
    "./os-ivory": ivory,
    "./os-tripwire": tripwire,
  "./os-i18n": i18n,
  }, storage, sessionShared);
  return { ...mod, storage };
}
void shell;

{ // accounted work observes clean; a bypass is watched, then trips AEGIS
  const shared = new Map();
  const { BlacksiteOS, storage } = bootOS(shared);
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
  void storage;
}
{ // the slow drip: twelve patient funnel writes — watch, never containment
  const shared = new Map();
  const { BlacksiteOS } = bootOS(shared);
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
  const shared = new Map();
  const { BlacksiteOS } = bootOS(shared);
  const os = new BlacksiteOS();
  os.files.set(CAN, { type: "file", content: "the decoy, rewritten in silence", mtime: fakeNow });
  const r = os.ivoryObserveNow("clock");
  assert.ok(r.findings.some((f) => f.kind === "canary" && f.severity === "trip"), "canary drift behind the funnel trips");
  assert.equal(os.aegis.contained, true, "containment follows the tower's word");
}
{ // AEGIS's register rewritten through the LIVE storage surface:
  // the sentinel blocks the write and carries out the sentence in
  // the same instant — no observance needs to run.
  const shared = new Map();
  const { BlacksiteOS, storage } = bootOS(shared);
  const os = new BlacksiteOS();
  os.ivoryObserveNow("clock");
  const forged = JSON.stringify({ contained: false, trips: [], snaps: [] });
  storage.setItem("blacksite-aegis-v1", forged);
  assert.notEqual(storage.getItem("blacksite-aegis-v1"), forged, "the sentinel BLOCKED the unaccounted write — the forged register never landed");
  assert.equal(JSON.parse(storage.getItem("blacksite-aegis-v1")).contained, true, "what stands in its place is the restored default — contained");
  assert.equal(os.aegis.contained, true, "and the sentence landed in the same instant");
  assert.ok(os.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("unaccounted hand inside the room")), "the wire recorded the AI-proofing accusation");
}
{ // the same rewrite written to the raw store behind the realm
  // (a between-sessions hand, devtools on a closed room): the
  // tripwire's manifest convicts it at the next observance —
  // the notarized head no longer matches what storage holds.
  const shared = new Map();
  const { BlacksiteOS } = bootOS(shared);
  const os = new BlacksiteOS();
  os.ivoryObserveNow("clock");
  shared.set("blacksite-aegis-v1", JSON.stringify({ wire: 1, contained: false, trips: [], snaps: [] }));
  os.ivoryObserveNow("clock");
  assert.equal(os.aegis.contained, true, "a snapshot ring wiped behind the realm restores the defaults at the next observance");
  assert.ok(os.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("AEGIS's register")), "the wire's verdict names the rewritten register");
}
{ // a ledger rewritten between sessions: the tripwire convicts it
  // at boot, before anything else — head mismatch against the
  // notarized manifest, with the accusation in the wire's memory.
  const shared = new Map();
  const first = bootOS(shared);
  const os1 = new first.BlacksiteOS();
  os1.ivoryObserveNow("clock");
  flushTimers();
  const raw = shared.get("blacksite-ivory-v1");
  assert.ok(raw, "the tower persisted its ledger");
  const forged = JSON.parse(raw);
  forged.entries[0].findings = ["note:forged-history"];
  shared.set("blacksite-ivory-v1", JSON.stringify(forged));
  fakeNow += 60_000;
  const second = bootOS(shared);
  const os2 = new second.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "the forged ledger tripped the tripwire restore at boot");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("tower's ledger")), "the wire's memory names the forged ledger");
  assert.ok(os2.journal.some((j) => j.text.includes("tripwire:")), "the journal carries the tripwire's word");
}
console.log("ivory layer 2: the tower in the shell — all assertions held");

/* ————— layer 3: TRIPWIRE — the full-system wire ————— */
const WIRE = "blacksite-tripwire-v1";
const REBOOT = "blacksite-tripwire-reboot";
{ // genesis: the wire strings itself over the whole system, and a
  // healthy room reboots clean under it forever.
  const shared = new Map(); const sess = new Map();
  const b1 = bootOS(shared, sess);
  const os = new b1.BlacksiteOS();
  flushTimers();
  const st = os.tripwireStatus();
  assert.equal(st.state, "strung", "the wire is strung");
  assert.equal(st.registers, 13, "thirteen system registers are on the wire (the language register joined, 2026-10-28)");
  assert.ok(st.heads.aegis && st.heads.ivory && st.heads.vfs, "the defenses and the filesystem are notarized");
  assert.ok(st.census >= 3, "the census saw the room's keys");
  assert.equal(os.aegis.contained, false);
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  flushTimers();
  assert.equal(os2.aegis.contained, false, "a healthy room boots clean under the wire");
  assert.equal(os2.tripwireStatus().events.filter((e) => e.kind === "tamper").length, 0, "no accusations in a healthy room");
  assert.ok(os2.tripwireStatus().boots >= 2, "the wire counts the boots");
}
{ // the cut wire: delete ONLY the tripwire register between
  // sessions, in a marked room — verdict, defaults restored,
  // reboot flagged once, and no loop.
  const shared = new Map(); const sess = new Map();
  const b1 = bootOS(shared, sess);
  const os1 = new b1.BlacksiteOS();
  os1.ivoryObserveNow("clock");
  flushTimers();
  assert.ok(shared.has(WIRE), "the wire register exists");
  shared.delete(WIRE);
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "a cut wire restores the defaults — containment — at boot");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("the wire was cut")), "the accusation is in the wire's rebuilt memory");
  assert.ok(os2.aegisStatus().snaps.some((s) => s.why === "tripwire-restore"), "AEGIS re-genesis took the tripwire-restore snapshot");
  const flag = JSON.parse(makeStorage(sess).getItem(REBOOT));
  assert.equal(flag.count, 1, "the reboot was flagged exactly once");
  fakeNow += 60_000;
  const b3 = bootOS(shared, sess);
  const os3 = new b3.BlacksiteOS();
  flushTimers();
  assert.equal(os3.tripwireStatus().events.filter((e) => e.kind === "tamper").length, 1, "the restored room does not accuse itself again — no reboot loop");
  assert.equal(JSON.parse(makeStorage(sess).getItem(REBOOT)).count, 1, "the flag still says one reboot");
  assert.equal(os3.aegis.contained, true, "containment holds until the operator lifts it");
}
{ // amnesia: AEGIS's register wiped between sessions.
  const shared = new Map(); const sess = new Map();
  const b1 = bootOS(shared, sess);
  const os1 = new b1.BlacksiteOS();
  flushTimers();
  shared.delete("blacksite-aegis-v1");
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "the amnesia attack restores the defaults");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("made to forget")), "the verdict names the amnesia");
  void os1;
}
{ // the whole system: the SESSION register — written by its own
  // hand through the sanctioned path, silent; rewritten in the
  // dark, a verdict like any other.
  const shared = new Map(); const sess = new Map();
  const b1 = bootOS(shared, sess);
  const os1 = new b1.BlacksiteOS();
  assert.equal(os1.wireSanctionedWrite("session", JSON.stringify([{ app: "terminal" }])), true, "the sanctioned write path accepts the session register");
  os1.ivoryObserveNow("clock");
  assert.equal(os1.aegis.contained, false, "a sanctioned write is silent");
  flushTimers();
  shared.set("blacksite-session-v1", JSON.stringify([{ app: "terminal" }, { app: "phantom" }]));
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "a session register rewritten in the dark trips the wire");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("session register")), "the verdict names the register");
}
{ // the sanctioned bridge covers the services: relay writes and
  // accounted deletions (the SIGINT log's own clear) stay silent.
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  assert.equal(os.wireSanctionedWrite("relay", JSON.stringify({ v: 2, nick: "op" })), true);
  assert.equal(os.wireSanctionedWrite("sigintLog", JSON.stringify([{ t: 1 }])), true);
  assert.equal(os.wireSanctionedWrite("sigintLog", null), true, "an accounted deletion is a write like any other");
  assert.equal(os.wireSanctionedWrite("bogus-register", "x"), false, "the bridge refuses a register the wire does not defend");
  const r = os.ivoryObserveNow("clock");
  assert.equal(os.aegis.contained, false, "sanctioned service writes never trip the wire");
  assert.equal(os.tripwireStatus().events.filter((e) => e.kind === "tamper").length, 0);
  void r;
}
{ // the sentinel against removal, and the plant law in-session.
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS, storage } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  os.ivoryObserveNow("clock");
  storage.removeItem("blacksite-ivory-v1");
  assert.ok(storage.getItem("blacksite-ivory-v1") !== null, "the sentinel blocked the removal — the ledger still stands");
  assert.equal(os.aegis.contained, true, "the removal attempt carried out the sentence in the instant");

  const shared2 = new Map(); const sess2 = new Map();
  const b2 = bootOS(shared2, sess2);
  const os2 = new b2.BlacksiteOS();
  b2.storage.setItem("blacksite-evil-v1", "{\"planted\":true}");
  os2.ivoryObserveNow("clock");
  assert.equal(os2.aegis.contained, true, "a planted register in the system namespace trips the wire at the next observance");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("planted")), "the verdict names the plant");
}
{ // the perimeter: game saves arrive and are censused, never
  // notarized, never a verdict; a plant BETWEEN sessions (where an
  // update could also legitimately land) is censused, not shot.
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS, storage } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  storage.setItem("wyrdfall-save-v2", "{\"lvl\":3}");
  storage.setItem("simulacrum-blooms-42", "[]");
  os.ivoryObserveNow("clock");
  assert.equal(os.aegis.contained, false, "perimeter writes are silent");
  assert.ok(os.tripwireStatus().census >= 5, "the census adopted the perimeter keys");
  flushTimers();
  shared.set("blacksite-future-v1", "{}");
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  assert.equal(os2.aegis.contained, false, "a between-sessions arrival is censused, not convicted — updates land that way");
}
{ // the wire's own seal, handled in the dark.
  const shared = new Map(); const sess = new Map();
  const b1 = bootOS(shared, sess);
  const os1 = new b1.BlacksiteOS();
  flushTimers();
  const wire = JSON.parse(shared.get(WIRE));
  wire.boots = 999;
  shared.set(WIRE, JSON.stringify(wire));
  fakeNow += 60_000;
  const b2 = bootOS(shared, sess);
  const os2 = new b2.BlacksiteOS();
  assert.equal(os2.aegis.contained, true, "a handled wire restores the defaults");
  assert.ok(os2.tripwireStatus().events.some((e) => e.kind === "tamper" && e.detail.includes("seal is broken")), "the verdict names the broken seal");
  void os1;
}
{ // ordinary operator violence stays lawful: trips, restores,
  // lifts, resets — the wire never accuses the room's own hands.
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  for (let i = 0; i < 12; i++) os.write(`/tmp/burst-${i}.txt`, "x" + i);
  flushTimers();
  assert.equal(os.aegis.contained, true, "the burst tripped AEGIS itself");
  assert.equal(os.aegisRestore(), true);
  os.write("/tmp/after.txt", "aftermath");
  flushTimers();
  os.reset();
  flushTimers();
  os.ivoryObserveNow("clock");
  assert.equal(os.tripwireStatus().events.filter((e) => e.kind === "tamper").length, 0, "no accusations across trips, restores, and a factory reset");
  assert.equal(os.tripwireStatus().state, "strung");
}
{ // the injection watch: a CSP violation the browser caught is
  // remembered by the wire — intelligence, never a sentence.
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  os.noteInjection("script-src refused https://evil.example/x.js");
  const st = os.tripwireStatus();
  assert.ok(st.events.some((e) => e.kind === "injection" && e.detail.includes("evil.example")), "the wire remembers the injection attempt");
  assert.equal(st.state, "strung", "an observed injection is not a cut wire");
  assert.equal(os.aegis.contained, false, "and it carries no sentence");
  assert.ok(os.journal.some((j) => j.text.startsWith("injection:")), "the journal carries the watch's word");
}
{ // VERIFY INTEGRITY: the composed checker — green on a healthy
  // room, naming the failed line on a handled one, and read-only
  // throughout (it reports; it does not sentence).
  const shared = new Map(); const sess = new Map();
  const { BlacksiteOS } = bootOS(shared, sess);
  const os = new BlacksiteOS();
  flushTimers();
  const good = os.verifyIntegrity();
  assert.equal(good.ok, true, "a healthy room verifies clean");
  assert.ok(good.checks.every((c) => c.ok), "every line of the audit holds");
  assert.ok(good.checks.some((c) => c.name.includes("sentinel") && c.ok), "the sentinel reports standing");
  assert.equal(good.checks.length, 7, "seven lines: seal, manifest, census, chain, root, sentinel, AEGIS");
  shared.set("blacksite-settings-v1", JSON.stringify({ emcon: "alpha", theme: "thinice", wallpaper: "", tomatoes: [] }));
  const bad = os.verifyIntegrity();
  assert.equal(bad.ok, false, "a register rewritten behind the realm fails the checker");
  assert.ok(bad.checks.some((c) => !c.ok && c.detail.includes("settings register")), "the failed line names the handled register");
  assert.equal(os.aegis.contained, false, "the checker itself sentences no one — the observance does that");
  os.ivoryObserveNow("clock");
  assert.equal(os.aegis.contained, true, "and the observance carries out the sentence the checker foresaw");
}
{ // the launched-bytes judge: byte for byte, where it matters
  const J = tripwire.judgeLaunched;
  const H = "a".repeat(64);
  assert.equal(J({ stampChunk: "os.X.js", stampHash: H, runningChunk: "os.X.js", servedHash: H }).ok, true, "served bytes equal to the seal pass");
  const bad = J({ stampChunk: "os.X.js", stampHash: H, runningChunk: "os.X.js", servedHash: "b".repeat(64) });
  assert.equal(bad.ok, false, "same name, different bytes FAILS — the launched artifact was altered");
  assert.ok(bad.detail.includes("NOT the launched build's"), "the failure says what happened");
  assert.equal(J({ stampChunk: "os.Y.js", stampHash: H, runningChunk: "os.X.js", servedHash: null }).ok, true, "an older page under a newer stamp is update-waiting, not tampering");
  assert.equal(J({ stampChunk: "os.X.js", stampHash: null, runningChunk: "os.X.js", servedHash: null }).ok, true, "a pre-seal stamp reports neutral");
  assert.equal(J({ stampChunk: null, stampHash: null, runningChunk: null, servedHash: null }).ok, true, "an unreadable stamp reports neutral, never a verdict");
  assert.equal(J({ stampChunk: "os.X.js", stampHash: H, runningChunk: "os.X.js", servedHash: null }).ok, true, "an unfetchable bundle is unverified, not accused");
}
console.log("tripwire layer 3: the full-system wire — all assertions held");
console.log("verify-ivory: OK");
