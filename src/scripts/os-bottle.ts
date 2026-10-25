// Daylight Bottle, plugged into BLACKSITE OS.
//
// The bottle service (bottle.nosuchmachine.net) is Chase's age-encrypted
// message-in-a-bottle: senders encrypt locally to a recipient from the
// static keyring, the server stores ciphertext + public metadata only,
// recipients fetch candidates by fingerprint and decrypt locally. This
// module speaks its exact wire protocol (nsm.daylight-bottle.*.v1) with
// the same crypto library it uses (age-encryption), so a bottle sealed
// here opens there and a bottle dropped there opens here.
//
// The service sends no CORS headers, so service calls ride this site's
// own edge bridge (/api/bottle). Plaintext and private identities never
// leave this browser — the identity lives in memory unless the operator
// explicitly saves it into the virtual filesystem.
import { verb, bToHex } from "./os-shell";
import type { BlacksiteOS, ShellIO } from "./os-shell";

const SCHEMA = {
  key: "nsm.daylight-bottle.key.v1",
  payload: "nsm.daylight-bottle.payload.v1",
  drop: "nsm.daylight-bottle.drop.v1",
} as const;
const SERVICE = "https://bottle.nosuchmachine.net";
const IDENTITY_PATH = "/home/operator/bottle-identity.txt";
const MAX_MESSAGE_BYTES = 64 * 1024;

type AgeModule = typeof import("age-encryption");
let agePromise: Promise<AgeModule> | null = null;
function ageLib(): Promise<AgeModule> {
  if (!agePromise) {
    agePromise = import("age-encryption");
    // a failed load must not brick the bottle for the whole session:
    // evict the rejection so the next attempt tries the wire again.
    agePromise.catch(() => { agePromise = null; });
  }
  return agePromise;
}

interface KeyRecord { keyname: string; publicRecipient: string; fingerprint: string; status: string; createdAt?: string }
interface Identity { secret: string; recipient: string }
let identity: Identity | null = null;
/* Inbox reading cursors, kept per lookup fingerprint: a reading that
   stops at the page cap leaves its cursor here, and the next reading
   — verb or app — resumes from it instead of starting over, so pages
   past the cap are reachable. A completed reading clears its cursor. */
const inboxCursors = new Map<string, string>();

const te = new TextEncoder();
async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? te.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bToHex(new Uint8Array(digest));
}
export async function fingerprintFor(keyname: string, publicRecipient: string): Promise<string> {
  return `sha256:${await sha256Hex([SCHEMA.key, keyname, publicRecipient].join("\n"))}`;
}

async function bridge(path: string, init?: RequestInit): Promise<{ data: any; headers: Headers }> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `the bottle bridge answered HTTP ${res.status}`);
  return { data, headers: res.headers };
}
async function loadKeyring(): Promise<KeyRecord[]> {
  const { data } = await bridge("/api/bottle?action=keyring");
  if (!data || !Array.isArray(data.keys)) throw new Error("keyring answer was not a keyring");
  const keys: KeyRecord[] = [];
  for (const k of data.keys) {
    const expected = await fingerprintFor(k.keyname, k.publicRecipient);
    if (expected !== k.fingerprint) throw new Error(`keyring fingerprint mismatch for ${k.keyname} — refusing to trust it`);
    keys.push(k);
  }
  return keys;
}

async function sealPayload(keyname: string, fingerprint: string, recipient: string, message: string): Promise<string> {
  if (te.encode(message).length > MAX_MESSAGE_BYTES) throw new Error(`message above the ${MAX_MESSAGE_BYTES / 1024} KB room limit`);
  const age = await ageLib();
  const payload = { schema: SCHEMA.payload, keyname, recipientFingerprint: fingerprint, message, createdAt: new Date().toISOString() };
  const encrypter = new age.Encrypter();
  encrypter.addRecipient(recipient);
  const ciphertext = await encrypter.encrypt(JSON.stringify(payload));
  return age.armor.encode(ciphertext);
}
async function openPayload(ciphertext: string, secret: string): Promise<any> {
  const age = await ageLib();
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(secret.trim());
  const plaintext = await decrypter.decrypt(age.armor.decode(ciphertext.trim()), "text");
  const payload = JSON.parse(plaintext);
  if (payload?.schema !== SCHEMA.payload) throw new Error("that bottle's payload is not a daylight-bottle payload");
  return payload;
}

async function setIdentity(secret: string): Promise<Identity> {
  const age = await ageLib();
  const recipient = await age.identityToRecipient(secret.trim());
  identity = { secret: secret.trim(), recipient };
  return identity;
}

/* ---------------- shell verbs ---------------- */

export function registerBottleVerbs() {
  verb("bottle", "EDGE", "Daylight Bottle: status, keyring, identity, seal, drop, inbox, open, evidence", async (ctx) => {
    const sub = (ctx.args[0] || "status").toLowerCase();
    const rest = ctx.args.slice(1);
    const os = ctx.os;
    const gateLedger = () => os.gate("ledger");
    const gateActive = () => os.gate("active");

    if (sub === "keyring") {
      const refusal = gateLedger(); if (refusal) return refusal;
      const keys = await loadKeyring();
      if (!keys.length) return `the live keyring at ${SERVICE} currently holds no keys — drops are refused by the service until a keyname is registered. sealing locally still works for any age recipient (bottle sealto).`;
      return keys.map((k) => `${k.keyname}  ${k.status}\n  recipient ${k.publicRecipient}\n  fingerprint ${k.fingerprint}`).join("\n");
    }

    if (sub === "identity") {
      const op = (rest[0] || "show").toLowerCase();
      if (op === "new") {
        const age = await ageLib();
        const secret = await age.generateIdentity();
        const me = await setIdentity(secret);
        os.log("daylight bottle: generated a new age identity (memory only until `bottle identity save`)");
        return [`new daylight bottle identity — MEMORY ONLY until you save it.`, `secret     ${secret}`, `recipient  ${me.recipient}`, ``, `the secret is your whole identity: whoever holds it reads your bottles.`, `\`bottle identity save\` writes it to ${IDENTITY_PATH} in this browser's filesystem.`].join("\n");
      }
      if (op === "load") {
        const path = rest[1] || IDENTITY_PATH;
        const text = os.read(path);
        if (!text) return `no identity file at ${path}`;
        const match = text.match(/AGE-SECRET-KEY-1[0-9A-Z]+/);
        if (!match) return `${path} does not contain an AGE-SECRET-KEY`;
        const me = await setIdentity(match[0]);
        return `identity loaded from ${path}\nrecipient  ${me.recipient}`;
      }
      if (op === "save") {
        if (!identity) return "no identity in memory — `bottle identity new` or `load` one first";
        os.write(IDENTITY_PATH, `# daylight bottle identity — secret. kept in this browser's blacksite filesystem.\n${identity.secret}\n`);
        return `identity saved to ${IDENTITY_PATH} (this browser only; it never leaves the machine)`;
      }
      if (op === "forget") { identity = null; return "identity dropped from memory (any saved file is untouched)"; }
      // show
      if (!identity) {
        const saved = os.read(IDENTITY_PATH);
        return saved ? `no identity in memory. one is saved at ${IDENTITY_PATH} — \`bottle identity load\` to use it.` : "no identity yet — `bottle identity new` to mint one, or open the Daylight Bottle app.";
      }
      return `identity in memory\nrecipient  ${identity.recipient}\nfor a fingerprint, name the keyname: bottle inbox <keyname>`;
    }

    if (sub === "seal" || sub === "sealto") {
      const refusal = gateLedger(); if (refusal && sub === "seal") return refusal;
      let keyname: string, recipient: string, fingerprint: string, message: string;
      if (sub === "seal") {
        if (rest.length < 2) return "usage: bottle seal <keyname> <message…> — seals to a keyring recipient, writes the armored bottle to /deliveries";
        keyname = rest[0].toLowerCase();
        const keys = await loadKeyring();
        const rec = keys.find((k) => k.keyname === keyname && k.status === "active");
        if (!rec) return `no active keyring record named ${keyname} — \`bottle keyring\` lists them (the live keyring may be empty)`;
        recipient = rec.publicRecipient; fingerprint = rec.fingerprint;
        message = rest.slice(1).join(" ");
      } else {
        if (rest.length < 3) return "usage: bottle sealto <age1-recipient> <keyname> <message…> — seals to any age recipient under your chosen keyname";
        recipient = rest[0];
        if (!/^age1[a-z0-9]{20,511}$/.test(recipient)) return "that is not an age recipient (age1…)";
        keyname = rest[1].toLowerCase();
        fingerprint = await fingerprintFor(keyname, recipient);
        message = rest.slice(2).join(" ");
      }
      const armored = await sealPayload(keyname, fingerprint, recipient, message);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `/deliveries/bottle-${keyname.replace(/[^a-z0-9._-]/g, "-")}-${stamp}.age.txt`;
      ctx.os.write(path, armored + "\n");
      const sha = await sha256Hex(armored);
      return [`sealed for ${keyname} (${fingerprint.slice(0, 23)}…)`, `armored bottle written to ${path}`, `ciphertext sha256 ${sha}`, `hand the file to the recipient any way you like, or \`bottle drop\` it to the service.`].join("\n");
    }

    if (sub === "drop") {
      const refusal = gateActive(); if (refusal) return refusal;
      if (rest.length < 2) return "usage: bottle drop <keyname> <message…> — encrypts here, drops ciphertext at bottle.nosuchmachine.net";
      const keyname = rest[0].toLowerCase();
      const keys = await loadKeyring();
      const rec = keys.find((k) => k.keyname === keyname && k.status === "active");
      if (!rec) return `no active keyring record named ${keyname} — the service only accepts drops for registered keynames`;
      const message = rest.slice(1).join(" ");
      const armored = await sealPayload(keyname, rec.fingerprint, rec.publicRecipient, message);
      const { data } = await bridge("/api/bottle?action=drop", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema: SCHEMA.drop, keyname, recipientFingerprint: rec.fingerprint, ciphertext: armored, createdAtClient: new Date().toISOString() }),
      });
      const ev = data.evidence || {};
      os.log(`daylight bottle: dropped bottle ${data.bottleId} for ${keyname}`);
      return [`bottle dropped at ${SERVICE}`, `id         ${data.bottleId}`, `stored     ${ev.storedAt || data.storedAt}`, `expires    ${ev.expiresAt || data.expiresAt}`, `ciphertext sha256 ${ev.ciphertextSha256}`, `the server saw ciphertext and public metadata only — never the message.`].join("\n");
    }

    if (sub === "inbox") {
      const refusal = gateLedger(); if (refusal) return refusal;
      if (!identity) return "no identity in memory — `bottle identity new|load` first (the inbox is keyed by your fingerprint)";
      const keyname = (rest[0] || "").toLowerCase();
      if (!keyname) return "usage: bottle inbox <keyname> — your registered keyname pairs with your identity to form the lookup fingerprint";
      const fingerprint = await fingerprintFor(keyname, identity.recipient);
      const lines: string[] = [`inbox for ${keyname} — fingerprint ${fingerprint.slice(0, 23)}…`];
      // A reading stops after a few pages (each bottle is opened
      // locally — a deep inbox is real work), but the cursor is KEPT,
      // keyed by fingerprint: running `bottle inbox` again resumes
      // where the last reading stopped, so every page is reachable.
      // A reading that reaches the end clears it; the next starts
      // from the top.
      let cursor: string | undefined = inboxCursors.get(fingerprint);
      if (cursor) lines.push("(resuming where the last reading stopped — the pages before this were shown then)");
      let pages = 0, found = 0;
      do {
        const q = new URLSearchParams({ action: "list", recipientFingerprint: fingerprint });
        if (cursor) q.set("cursor", cursor);
        const { data, headers } = await bridge(`/api/bottle?${q.toString()}`);
        pages++;
        for (const b of data.bottles || []) {
          found++;
          const expected = await sha256Hex(b.ciphertext);
          if (expected !== b.ciphertextSha256) { lines.push(`✗ ${b.bottleId} — ciphertext hash mismatch, not opened`); continue; }
          try {
            const payload = await openPayload(b.ciphertext, identity.secret);
            if (payload.keyname !== b.keyname || payload.recipientFingerprint !== b.recipientFingerprint) { lines.push(`✗ ${b.bottleId} — payload metadata does not match its listing, not trusted`); continue; }
            lines.push(`\n— bottle ${b.bottleId} · stored ${b.storedAt} · expires ${b.expiresAt}\n${payload.message}`);
          } catch { lines.push(`✗ ${b.bottleId} — your identity does not open this bottle`); }
        }
        cursor = headers.get("x-daylight-next-cursor") || undefined;
      } while (cursor && pages < 4);
      if (cursor) { inboxCursors.set(fingerprint, cursor); lines.push("\n(more pages remain — run it again to keep reading from here)"); }
      else inboxCursors.delete(fingerprint);
      if (!found) lines.push("no bottles waiting. (the service is eventually consistent — a fresh drop can take a minute to surface.)");
      return lines.join("\n");
    }

    if (sub === "open") {
      const path = rest[0];
      const armored = path ? ctx.os.read(path) : ctx.stdin;
      if (!armored) return "usage: bottle open <file.age.txt> — decrypts an armored bottle with the identity in memory";
      if (!identity) return "no identity in memory — `bottle identity new|load` first";
      const payload = await openPayload(armored, identity.secret);
      return [`bottle opened — keyname ${payload.keyname} · sealed ${payload.createdAt}`, ``, payload.message].join("\n");
    }

    if (sub === "evidence") {
      const refusal = gateLedger(); if (refusal) return refusal;
      const id = rest[0];
      if (!id) return "usage: bottle evidence <bottleId>";
      const { data } = await bridge(`/api/bottle?action=evidence&id=${encodeURIComponent(id)}`);
      return JSON.stringify(data, null, 2);
    }

    // status
    let keyringNote = "keyring not fetched yet this session (bottle keyring)";
    try { const keys = await loadKeyring(); keyringNote = `live keyring: ${keys.length} record${keys.length === 1 ? "" : "s"}${keys.length ? " — " + keys.map((k) => k.keyname).join(", ") : " (drops refused by the service until one is registered)"}`; } catch (e: any) { keyringNote = `keyring unreachable: ${e?.message || e}`; }
    return [
      `DAYLIGHT BOTTLE — age-encrypted messages in a bottle, plugged into the OS.`,
      `service    ${SERVICE} (ciphertext-only storage; plaintext never leaves this browser)`,
      keyringNote,
      `identity   ${identity ? `in memory — recipient ${identity.recipient}` : "none loaded (bottle identity new|load)"}`,
      ``,
      `bottle keyring · bottle identity new|load|save|forget · bottle seal <keyname> <msg…>`,
      `bottle sealto <age1…> <keyname> <msg…> · bottle drop <keyname> <msg…> · bottle inbox <keyname>`,
      `bottle open <file> · bottle evidence <bottleId> · or open the Daylight Bottle window.`,
    ].join("\n");
  });
}

/* ---------------- the window ---------------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildBottleApp(body: HTMLElement, os: BlacksiteOS) {
  body.innerHTML = "";
  const out = el("pre", "os-plain");
  const say = (t: string) => { out.textContent = t; };
  const head = el("p", "os-note", "age-encrypted messages in a bottle. Encryption and decryption happen in this window; the service stores ciphertext and public metadata only, and your private identity never leaves this browser.");
  const serviceLink = el("a", "os-task-link", "bottle.nosuchmachine.net ↗");
  serviceLink.href = SERVICE; serviceLink.target = "_blank"; serviceLink.rel = "noreferrer";
  head.append(" ", serviceLink);
  body.append(head);

  // identity
  const idBox = el("div", "os-bottle-box");
  idBox.append(el("h3", "", "Identity"));
  const idArea = el("textarea", "os-bottle-area");
  idArea.placeholder = "paste an AGE-SECRET-KEY-1… to load an identity, or generate one";
  idArea.rows = 2;
  const idMeta = el("p", "os-note", identity ? `in memory — recipient ${identity.recipient}` : "no identity loaded");
  const idRow = el("div", "os-btnrow");
  const btnGen = el("button", "os-btn", "Generate new");
  const btnLoad = el("button", "os-btn", "Load from text");
  const btnSave = el("button", "os-btn", "Save to filesystem");
  const btnForget = el("button", "os-btn", "Forget");
  btnGen.addEventListener("click", async () => {
    try {
      const age = await ageLib();
      const secret = await age.generateIdentity();
      const me = await setIdentity(secret);
      idArea.value = secret;
      idMeta.textContent = `in memory — recipient ${me.recipient}. the secret above is your whole identity; save it somewhere safe.`;
      say("identity generated. it lives in memory until you save it.");
    } catch (e: any) { say(`✗ ${e?.message || e}`); }
  });
  btnLoad.addEventListener("click", async () => {
    const m = idArea.value.match(/AGE-SECRET-KEY-1[0-9A-Z]+/);
    if (!m) { say("that text holds no AGE-SECRET-KEY"); return; }
    try { const me = await setIdentity(m[0]); idMeta.textContent = `in memory — recipient ${me.recipient}`; say("identity loaded."); }
    catch (e: any) { say(`✗ ${e?.message || e}`); }
  });
  btnSave.addEventListener("click", () => {
    if (!identity) { say("no identity in memory to save"); return; }
    os.write(IDENTITY_PATH, `# daylight bottle identity — secret. kept in this browser's blacksite filesystem.\n${identity.secret}\n`);
    say(`saved to ${IDENTITY_PATH} — this browser only.`);
  });
  btnForget.addEventListener("click", () => { identity = null; idArea.value = ""; idMeta.textContent = "no identity loaded"; say("identity dropped from memory."); });
  idRow.append(btnGen, btnLoad, btnSave, btnForget);
  idBox.append(idArea, idMeta, idRow);
  body.append(idBox);

  // keyring + drop/seal
  const dropBox = el("div", "os-bottle-box");
  dropBox.append(el("h3", "", "Seal a bottle"));
  const keyRow = el("div", "os-btnrow");
  const keySelect = el("select", "os-bottle-select");
  const btnKeys = el("button", "os-btn", "Refresh keyring");
  keyRow.append(keySelect, btnKeys);
  const bareRow = el("div", "os-btnrow");
  const bareInput = el("input", "os-bottle-input");
  bareInput.placeholder = "…or any age1… recipient (sealed locally, not via the service keyring)";
  bareInput.style.flex = "1";
  const nameInput = el("input", "os-bottle-input");
  nameInput.placeholder = "keyname for that recipient";
  bareRow.append(bareInput, nameInput);
  const msgArea = el("textarea", "os-bottle-area");
  msgArea.placeholder = "the message — encrypted here, in this window, before anything is sent";
  msgArea.rows = 4;
  const actRow = el("div", "os-btnrow");
  const btnSeal = el("button", "os-btn", "Seal to a file");
  const btnDrop = el("button", "os-btn primary", "Drop at bottle.nosuchmachine.net");
  actRow.append(btnSeal, btnDrop);
  const armorArea = el("textarea", "os-bottle-area");
  armorArea.placeholder = "armored bottle appears here — and below, bottles you open";
  armorArea.rows = 6;
  const openRow = el("div", "os-btnrow");
  const btnOpen = el("button", "os-btn", "Open the bottle above");
  const btnInbox = el("button", "os-btn", "Fetch my inbox");
  const inboxName = el("input", "os-bottle-input");
  inboxName.placeholder = "my keyname (for inbox)";
  openRow.append(btnOpen, inboxName, btnInbox);
  dropBox.append(keyRow, bareRow, msgArea, actRow, armorArea, openRow);
  body.append(dropBox, out);

  let keyring: KeyRecord[] = [];
  const refreshKeys = async () => {
    try {
      keyring = await loadKeyring();
      keySelect.innerHTML = "";
      if (!keyring.length) {
        const opt = el("option", "", "(live keyring is empty — service drops are refused until a key is registered)");
        opt.value = "";
        keySelect.append(opt);
      }
      for (const k of keyring.filter((x) => x.status === "active")) {
        const opt = el("option", "", `${k.keyname} — ${k.fingerprint.slice(0, 23)}…`);
        opt.value = k.keyname;
        keySelect.append(opt);
      }
      say(keyring.length ? `keyring loaded: ${keyring.length} record(s).` : "the live keyring holds no keys yet. you can still seal bottles to any age recipient and open bottles addressed to you.");
    } catch (e: any) { say(`✗ keyring: ${e?.message || e}`); }
  };
  btnKeys.addEventListener("click", refreshKeys);
  void refreshKeys();

  const chosen = (): { keyname: string; recipient: string; fingerprint: Promise<string>; viaKeyring: boolean } | null => {
    const bare = bareInput.value.trim();
    if (bare) {
      if (!/^age1[a-z0-9]{20,511}$/.test(bare)) { say("that is not an age recipient (age1…)"); return null; }
      const kn = nameInput.value.trim().toLowerCase();
      if (!kn) { say("name the keyname for that recipient"); return null; }
      return { keyname: kn, recipient: bare, fingerprint: fingerprintFor(kn, bare), viaKeyring: false };
    }
    const rec = keyring.find((k) => k.keyname === keySelect.value && k.status === "active");
    if (!rec) { say("pick a keyring recipient, or paste an age1… recipient"); return null; }
    return { keyname: rec.keyname, recipient: rec.publicRecipient, fingerprint: Promise.resolve(rec.fingerprint), viaKeyring: true };
  };
  btnSeal.addEventListener("click", async () => {
    const c = chosen(); if (!c) return;
    try {
      const armored = await sealPayload(c.keyname, await c.fingerprint, c.recipient, msgArea.value);
      armorArea.value = armored;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `/deliveries/bottle-${c.keyname.replace(/[^a-z0-9._-]/g, "-")}-${stamp}.age.txt`;
      os.write(path, armored + "\n");
      say(`sealed for ${c.keyname}. armored bottle saved to ${path} and shown above — hand it over any way you like.`);
    } catch (e: any) { say(`✗ ${e?.message || e}`); }
  });
  btnDrop.addEventListener("click", async () => {
    const refusal = os.gate("active"); if (refusal) { say(refusal); return; }
    const c = chosen(); if (!c) return;
    if (!c.viaKeyring) { say("the service only accepts drops for keyring-registered keynames — seal to a file instead, or pick a keyring recipient"); return; }
    try {
      const fp = await c.fingerprint;
      const armored = await sealPayload(c.keyname, fp, c.recipient, msgArea.value);
      const { data } = await bridge("/api/bottle?action=drop", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema: SCHEMA.drop, keyname: c.keyname, recipientFingerprint: fp, ciphertext: armored, createdAtClient: new Date().toISOString() }),
      });
      armorArea.value = armored;
      say(`dropped. bottle id ${data.bottleId}\nstored ${data.evidence?.storedAt || data.storedAt} · expires ${data.evidence?.expiresAt || data.expiresAt}\nciphertext sha256 ${data.evidence?.ciphertextSha256}\nthe server saw ciphertext and public metadata only.`);
      os.log(`daylight bottle: dropped bottle ${data.bottleId} for ${c.keyname}`);
    } catch (e: any) { say(`✗ drop refused: ${e?.message || e}`); }
  });
  btnOpen.addEventListener("click", async () => {
    if (!identity) { say("load or generate an identity first"); return; }
    try {
      const payload = await openPayload(armorArea.value, identity.secret);
      say(`opened — for keyname ${payload.keyname}, sealed ${payload.createdAt}:\n\n${payload.message}`);
    } catch (e: any) { say(`✗ cannot open: ${e?.message || e}`); }
  });
  btnInbox.addEventListener("click", async () => {
    const refusal = os.gate("ledger"); if (refusal) { say(refusal); return; }
    if (!identity) { say("load or generate an identity first"); return; }
    const keyname = inboxName.value.trim().toLowerCase();
    if (!keyname) { say("give your keyname — it pairs with your identity to form the lookup fingerprint"); return; }
    try {
      const fingerprint = await fingerprintFor(keyname, identity.recipient);
      const lines: string[] = [];
      let cursor: string | undefined = inboxCursors.get(fingerprint);
      const resumed = !!cursor;
      let pages = 0; let found = 0;
      do {
        const q = new URLSearchParams({ action: "list", recipientFingerprint: fingerprint });
        if (cursor) q.set("cursor", cursor);
        const { data, headers } = await bridge(`/api/bottle?${q.toString()}`);
        pages++;
        for (const b of data.bottles || []) {
          found++;
          if (await sha256Hex(b.ciphertext) !== b.ciphertextSha256) { lines.push(`✗ ${b.bottleId} — ciphertext hash mismatch, not opened`); continue; }
          try {
            const payload = await openPayload(b.ciphertext, identity.secret);
            if (payload.keyname !== b.keyname || payload.recipientFingerprint !== b.recipientFingerprint) { lines.push(`✗ ${b.bottleId} — payload metadata mismatch, not trusted`); continue; }
            lines.push(`— bottle ${b.bottleId} · stored ${b.storedAt} · expires ${b.expiresAt}\n${payload.message}`);
          } catch { lines.push(`✗ ${b.bottleId} — your identity does not open it`); }
        }
        cursor = headers.get("x-daylight-next-cursor") || undefined;
      } while (cursor && pages < 4);
      if (cursor) inboxCursors.set(fingerprint, cursor); else inboxCursors.delete(fingerprint);
      const notes: string[] = [];
      if (resumed) notes.push("(resumed where the last reading stopped — the pages before this were shown then)");
      if (cursor) notes.push("(more pages remain — press inbox again to keep reading from here; a reading that reaches the end starts the next from the top)");
      say([found ? lines.join("\n\n") : "no bottles waiting under that fingerprint. (fresh drops can take a minute to surface — the service is eventually consistent.)", ...notes].join("\n\n"));
    } catch (e: any) { say(`✗ inbox: ${e?.message || e}`); }
  });
  say("daylight bottle, in the room. seal and drop from here, or drive it from the terminal: `bottle`.");
}
