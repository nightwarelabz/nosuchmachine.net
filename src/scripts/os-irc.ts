// @ts-nocheck
import { sfx } from "./os-sound";
import { skey } from "./os-depth";
/* relaychat. A real IRC client in the tab: it speaks the IRC
   protocol itself (registration, PING/PONG, channels, private messages,
   NAMES) over a WebSocket to the site's own bridge, which pipes it to a
   public network — OFTC, Libera.Chat, or hackint — over TLS. No account,
   no tracking: a nick, a channel, and the wire. The house channel is
   #nosuchmachine on OFTC; on IRC, whoever arrives first opens
   the room. */

export interface IrcMessage {
  prefix: string;
  nick: string;
  command: string;
  params: string[];
  trailing: string;
  tags: Record<string, string>;
}

/** Parse one IRC protocol line (RFC 1459 shape, with the IRCv3 message
 *  tags the house bridge uses to hand the room its memory). Pure —
 *  harness-tested. */
export function parseIrcLine(line: string): IrcMessage {
  let rest = line.replace(/\r$/, "");
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    if (sp > 0) {
      for (const pair of rest.slice(1, sp).split(";")) {
        const eq = pair.indexOf("=");
        if (eq > 0) tags[pair.slice(0, eq)] = pair.slice(eq + 1);
        else if (pair) tags[pair] = "";
      }
      rest = rest.slice(sp + 1);
    }
  }
  let prefix = "";
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  let trailing = "";
  const tIdx = rest.indexOf(" :");
  if (tIdx >= 0) {
    trailing = rest.slice(tIdx + 2);
    rest = rest.slice(0, tIdx);
  }
  const parts = rest.split(" ").filter((p) => p.length > 0);
  const command = (parts.shift() || "").toUpperCase();
  if (trailing) parts.push(trailing);
  const nick = prefix.split("!")[0] || prefix;
  return { prefix, nick, command, params: parts, trailing, tags };
}

const NETWORKS = [
  { host: "irc.oftc.net", label: "OFTC" },
  { host: "irc.libera.chat", label: "Libera.Chat — refuses bridged guests (SASL wall)" },
  { host: "irc.hackint.org", label: "hackint" },
];
const HOUSE_CHANNEL = "#nosuchmachine";
/* House names for arrivals who bring none: machine + digit + letter + one
   more mark — machine1A, machine2D, machine7Q3 — an endless arrangement.
   If the network says a drawn name is taken (433), the room draws again. */
function machineName(): string {
  const digit = () => String(Math.floor(Math.random() * 10));
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const mark = () => (Math.random() < 0.5 ? digit() : letter());
  return `machine${digit()}${letter()}${mark()}`;
}
const MAX_LINES = 300;
const CLAIM_PATH = "/home/operator/relay-claim.txt";
/* The house names — mirrored from the bridge, which is the authority.
   This copy only drives the connect card's courtesy checks; the bridge
   refuses an unclaimed house name no matter what any client asks. */
const HOUSE_NAMES = ["nightwarelabz", "nosuchmachine", "chasebryan", "chase", "nightjar"];
function isHouseName(nick: string): boolean {
  // The strip class mirrors the bridge's claimedName exactly — backslash
  // included — so the card's courtesy check never disagrees with the
  // bridge's enforcement (a chase\bryan is the same claim both places).
  const base = nick.toLowerCase().replace(/[_`^|\\-]/g, "");
  return HOUSE_NAMES.some((h) => base === h || (base.startsWith(h) && /^\d+$/.test(base.slice(h.length))));
}

export function buildRelayApp(body: HTMLElement, os: any) {
  const el = (tag: string, cls = "", text = "") => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  body.textContent = "";
  const wrap = el("div", "os-relay");

  /* ————— the identity box — dynamically allocated —————
     No box stands on the desk by default: Relay opens straight onto the
     wire wearing an issued machine name. This box is BUILT only when the
     operator asks for an identity of their own (the identity button) and
     torn down when they leave it. A name may carry a password — the
     network's NickServ password for that name — and the box can register
     a fresh name as well. Passwords and the house claim code live in
     memory for this visit only: nothing here is written to disk, ever.
     Older builds saved the claim code into the filesystem; that practice
     is retired, and any copy found is destroyed on sight. */
  try { if (os.read(CLAIM_PATH)) os.remove(CLAIM_PATH); } catch { /* nothing saved, nothing to scrub */ }
  /* The board wipe (Chase's order, 2026-10-25): the pre-presence kept
     log is retired — its key is destroyed on sight, so every visitor's
     kept conversation and roster clear exactly once and the room
     starts over with a clean board under the v2 key. */
  try { localStorage.removeItem(skey("blacksite-relay-v1")); } catch { /* nothing old to clear */ }
  const card = el("div", "os-relay-card");
  card.hidden = true;
  wrap.appendChild(card);

  const hideIdentityBox = () => { card.replaceChildren(); card.hidden = true; wrap.classList.remove("card-open"); };

  const showIdentityBox = () => {
    card.replaceChildren();
    wrap.classList.add("card-open");
    const note = el("p", "os-note",
      "A name of your own — only if you want one. The room never asks: you are already in it wearing a " +
      "machine name. Add a password if the name is registered to you on the network (NickServ) and Relay " +
      "identifies you as you enter; tick register to claim a fresh name — the network mails you a code, " +
      "and from then on the password is the name's key. Passwords ride this visit in memory only and are " +
      "never stored. Wearing a new name re-enters the wire as that name; the room keeps your conversation. " +
      "(Libera.Chat turns bridged guests away — it demands SASL from the bridge's range — so the house " +
      "room lives on OFTC. The house names are the operator's own; they don't open for visitors.)");
    const netSel = document.createElement("select");
    netSel.className = "os-bottle-select";
    for (const n of NETWORKS) {
      const o = document.createElement("option");
      o.value = n.host; o.textContent = n.label;
      if (n.host === wireHost) o.selected = true;
      netSel.appendChild(o);
    }
    const nickIn = document.createElement("input");
    nickIn.className = "os-bottle-input";
    nickIn.value = myNick || machineName();
    nickIn.placeholder = "the name you want to wear";
    nickIn.maxLength = 24;
    const chanIn = document.createElement("input");
    chanIn.className = "os-bottle-input";
    chanIn.value = [...joinedChans][0] || HOUSE_CHANNEL;
    chanIn.placeholder = "channel";
    const passIn = document.createElement("input");
    passIn.className = "os-bottle-input";
    passIn.type = "password";
    passIn.placeholder = "password — only if this name is registered (NickServ)";
    passIn.autocomplete = "current-password";
    passIn.value = wirePassword;
    const regWrap = el("label", "os-relay-tls");
    const regIn = document.createElement("input");
    regIn.type = "checkbox";
    regWrap.append(regIn, document.createTextNode(" register this name to me"));
    const mailIn = document.createElement("input");
    mailIn.className = "os-bottle-input";
    mailIn.type = "email";
    mailIn.placeholder = "email — NickServ sends the verification code here";
    mailIn.hidden = true;
    regIn.addEventListener("change", () => { mailIn.hidden = !regIn.checked; if (regIn.checked) mailIn.focus(); });
    const claimWrap = el("div", "");
    claimWrap.hidden = true;
    const claimNote = el("p", "os-note", "— that name is claimed by the house. Its code opens it, and nothing else does.");
    const claimIn = document.createElement("input");
    claimIn.className = "os-bottle-input";
    claimIn.type = "password";
    claimIn.placeholder = "house claim code";
    claimIn.autocomplete = "off";
    claimWrap.append(claimNote, claimIn);
    const tlsWrap = el("label", "os-relay-tls");
    const tlsIn = document.createElement("input");
    tlsIn.type = "checkbox"; tlsIn.checked = wirePort !== 6667;
    tlsWrap.append(tlsIn, document.createTextNode(" TLS (port 6697)"));
    const msg = el("p", "os-note", "");
    const enterBtn = el("button", "os-btn", "enter as this name ▸");
    const cancelBtn = el("button", "os-btn", "back to the room");
    const syncClaim = () => { claimWrap.hidden = !isHouseName(nickIn.value.trim()); };
    nickIn.addEventListener("input", syncClaim);
    nickIn.addEventListener("change", syncClaim);
    cancelBtn.addEventListener("click", () => { hideIdentityBox(); });
    enterBtn.addEventListener("click", () => {
      const nick = (nickIn.value.trim() || machineName()).replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "") || machineName();
      const claim = claimIn.value.trim();
      if (isHouseName(nick) && !claim) {
        // Re-check at the click itself, not only while typing: however
        // the name got into the field (autofill, paste, a change event
        // the input event missed), a house name is met with the claim
        // field and the ask — never a bare refusal.
        syncClaim();
        claimWrap.hidden = false;
        msg.textContent = `— "${nick}" is claimed by the house. Enter its claim code above and enter again — or take any other name.`;
        claimIn.focus();
        return;
      }
      if (regIn.checked && (!passIn.value.trim() || !mailIn.value.trim())) { msg.textContent = "— registering takes both a password and an email for the code."; return; }
      const channel = chanIn.value.trim().startsWith("#") ? chanIn.value.trim() : HOUSE_CHANNEL;
      hideIdentityBox();
      connectWith({ host: netSel.value, port: tlsIn.checked ? 6697 : 6667, nick, channel, password: passIn.value, registerEmail: regIn.checked ? mailIn.value.trim() : "", claim });
    });
    card.append(note, netSel, nickIn, chanIn, passIn, regWrap, mailIn, claimWrap, tlsWrap, enterBtn, cancelBtn, msg);
    syncClaim();
    card.hidden = false;
  };

  /* ————— the dev note — pinned at the top of the chat —————
     A topic-of-the-day bar for developer messages: it ships with the
     build, so what it says is always true of the build you are looking
     at, and it never scrolls away with the conversation. */
  const DEV_NOTE = "happy halloween hackerz!";
  const noteEl = el("div", "os-relay-note");
  noteEl.append(el("span", "os-relay-note-tag", "dev note · pinned"), document.createTextNode(DEV_NOTE));

  /* ————— session view ————— */
  const view = el("div", "os-relay-view");
  const targetsEl = el("div", "os-relay-targets");
  const main = el("div", "os-relay-main");
  const linesEl = el("div", "os-relay-lines");
  const inputRow = el("div", "os-relay-inputrow");
  const input = document.createElement("input");
  input.className = "os-relay-input";
  input.placeholder = "say it on the wire — /join #chan · /msg nick · /me waves · /away · /part · /nick name · /wipe";
  input.maxLength = 400;
  const sendBtn = el("button", "os-btn small", "send ▸");
  sendBtn.title = "send it on the wire";
  const idBtn = el("button", "os-btn small", "identity");
  idBtn.title = "a name of your own — with a password if you want one";
  idBtn.addEventListener("click", () => showIdentityBox());
  const copyBtn = el("button", "os-btn small", "copy");
  copyBtn.title = "copy this conversation";
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText((buffers.get(current) || []).join("\n")).then(() => { copyBtn.textContent = "copied ✓"; setTimeout(() => (copyBtn.textContent = "copy"), 1400); });
  });
  const forgetBtn = el("button", "os-btn small", "forget");
  forgetBtn.title = "forget this conversation — wipe the log kept on this machine";
  forgetBtn.addEventListener("click", () => {
    try { localStorage.removeItem(skey(RELAY_LOG_KEY)); } catch { /* nothing kept anyway */ }
    buffers.clear();
    roster.clear();
    manualAway = "";
    for (const [chan, set] of users) for (const n of set) rosterTouch(chan, n, n === myNick ? presence : "here");
    pendingJoins = [];
    current = "server";
    renderTargets();
    push("server", "— forgotten on this machine. The room's own memory keeps what was said — /wipe there takes back only your own lines.");
  });
  input.setAttribute("enterkeyhint", "send");
  inputRow.append(input, sendBtn, idBtn, copyBtn, forgetBtn);
  main.append(linesEl, inputRow);
  const usersCol = el("div", "os-relay-users");
  const selfEl = el("div", "os-relay-self");
  const selfLine = el("div", "os-relay-self-line", "");
  const selfBtns = el("div", "os-relay-self-btns");
  const awayBtn = el("button", "os-btn small", "set away");
  awayBtn.title = "mark yourself away on the wire — or /away in the chat";
  awayBtn.addEventListener("click", () => { if (presence === "away") setPresence("here"); else setPresence("away", "away"); input.focus(); });
  const nameBtn = el("button", "os-btn small", "new name");
  nameBtn.title = "reset your name — let this one go and draw a fresh machine name";
  nameBtn.addEventListener("click", () => { resetName(); input.focus(); });
  selfBtns.append(awayBtn, nameBtn);
  selfEl.append(el("div", "os-relay-users-h", "you"), selfLine, selfBtns);
  const usersEl = el("div", "");
  usersCol.append(selfEl, usersEl);
  view.append(targetsEl, main, usersCol);
  wrap.appendChild(noteEl);
  wrap.appendChild(view);
  body.appendChild(wrap);

  /* ————— client state ————— */
  let ws: WebSocket | null = null;
  let myNick = "";
  let current = "server";
  const joinedChans = new Set<string>();
  let intentionalClose = false;
  let attempts = 0;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let capFallback: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wireHost = "";
  let wirePort = 6697;
  let wireClaim = "";
  let wirePassword = "";
  let wireRegister: { password: string; email: string } | null = null;
  let joinTarget = HOUSE_CHANNEL;
  const buffers = new Map<string, string[]>();
  const users = new Map<string, Set<string>>();
  const ops = new Map<string, Set<string>>();

  /* ————— presence + the kept roster —————
     Presence is real IRC: the client speaks AWAY to the network and
     shows every state in the room — here, idle, away, gone. Where the
     network offers away-notify (Libera, hackint) the client negotiates
     it and states arrive as they change; OFTC offers no such cap
     (proven live: its LS lists multi-prefix only, away-notify is
     NAKed), so there the room is read by WHO — the 352 status letter
     (H here / G gone-away) — on join and once a minute. Idle engages
     (and speaking or stirring clears it); away is set on purpose, by
     the button or /away, and is remembered across refreshes. The
     roster keeps EVERYONE who steps into the room — name, state, last
     seen — on this machine, so a refresh no longer makes people
     disappear: whoever is out shows as kept until they step back in.
     Your own name likewise sticks until you deliberately reset it
     (the new name button) and draw a fresh machine name. */
  type Presence = "here" | "idle" | "away";
  let presence: Presence = "here";
  let awayMsg = "";
  let manualAway = "";
  let registered = false;
  let lastAct = Date.now();
  const roster = new Map<string, Map<string, { s: string; l: number }>>();
  const ROSTER_CAP = 300;
  const rosterTouch = (chan: string, nick: string, state: string, force = false) => {
    if (!chan.startsWith("#") || !nick) return;
    if (!roster.has(chan)) roster.set(chan, new Map());
    const meta = roster.get(chan)!;
    const prev = meta.get(nick);
    // A plain sighting never erases a known away/idle — only the AWAY
    // event itself (force) or the person leaving/returning moves it.
    if (prev && !force && state === "here" && (prev.s === "away" || prev.s === "idle")) state = prev.s;
    meta.set(nick, { s: state, l: Date.now() });
    if (meta.size > ROSTER_CAP) {
      const gone = [...meta.entries()].filter(([, m]) => m.s === "gone").sort((a, b) => a[1].l - b[1].l);
      for (const [n] of gone.slice(0, meta.size - ROSTER_CAP)) meta.delete(n);
    }
    scheduleSave();
  };

  /* ————— retention, in two keepings —————
     The device keeps its log: every target's lines, the name you wear,
     the channels you sit in — persisted to this device's own storage
     (skey: the surface keeps it, nests stay volatile, factory reset
     wipes it), so a refresh costs nothing.
     And the room keeps a memory of its own, in the bridge: the last
     day of the room's lines, capped at 300, replayed to any client as
     it joins — so a conversation survives the device it was spoken
     from, and nobody is a ghost for having spoken elsewhere. That
     memory is mutable by design, not an archive: lines expire, a
     removal purges the removed voice from it, and credential-shaped
     lines never enter it — and a wipe reaches exactly as far as
     authorship: it takes back the wiper's own lines from it, never
     the whole chat for everyone. Passwords and the house claim code
     are NEVER part of either keeping — they ride the visit in
     memory only, as always. The "forget" button wipes this device's
     log on the spot; /wipe takes back your own lines in a room. */
  const RELAY_LOG_KEY = "blacksite-relay-v2";
  /* Conversations with the network's services are never part of the
     kept log: a NickServ window is where IDENTIFY passwords and
     REGISTER verification codes land, and a kept log that kept those
     would be a credential file wearing a chat's clothes. Service
     windows live for the visit, in memory only. */
  const SERVICE_NICKS = new Set(["nickserv", "chanserv"]);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveLog = () => {
    saveTimer = null;
    try {
      const scrub = (line: string) => {
        for (const secret of [wirePassword, wireClaim]) if (secret && secret.length >= 4) line = line.split(secret).join("•••");
        return line;
      };
      const keptBuffers = Object.fromEntries([...buffers].filter(([t]) => !SERVICE_NICKS.has(t.toLowerCase())).map(([t, lines]) => [t, lines.map(scrub)]));
      const data = { v: 2, nick: myNick, current, channels: [...joinedChans], buffers: keptBuffers, roster: Object.fromEntries([...roster].map(([c, m]) => [c, Object.fromEntries(m)])), away: manualAway };
      let body = JSON.stringify(data);
      // A pathological log sheds its oldest lines before it sheds the room.
      let guard = 0;
      while (body.length > 1_200_000 && guard++ < 8) {
        for (const lines of Object.values(data.buffers)) if (lines.length > 25) lines.splice(0, Math.ceil(lines.length / 2));
        body = JSON.stringify(data);
      }
      localStorage.setItem(skey(RELAY_LOG_KEY), body);
    } catch { /* private modes keep nothing — the visit only, as before */ }
  };
  const scheduleSave = () => { if (!saveTimer) saveTimer = setTimeout(saveLog, 250); };
  const onPageHide = () => { if (saveTimer) { clearTimeout(saveTimer); saveLog(); } };
  window.addEventListener("pagehide", onPageHide);
  const loadLog = (): { nick: string; current: string; channels: string[]; buffers: Record<string, string[]>; roster: Record<string, Record<string, { s: string; l: number }>>; away: string } | null => {
    try {
      const raw = localStorage.getItem(skey(RELAY_LOG_KEY));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !data.buffers || typeof data.buffers !== "object") return null;
      const clean: Record<string, string[]> = {};
      for (const [t, lines] of Object.entries(data.buffers)) {
        if (SERVICE_NICKS.has(t.toLowerCase())) continue; // service windows were never meant to be kept — older logs lose them here
        if (Array.isArray(lines)) clean[t] = lines.filter((l) => typeof l === "string").slice(-MAX_LINES);
      }
      if (!Object.keys(clean).length) return null;
      const cleanRoster: Record<string, Record<string, { s: string; l: number }>> = {};
      if (data.roster && typeof data.roster === "object") {
        for (const [chan, members] of Object.entries(data.roster)) {
          if (!chan.startsWith("#") || !members || typeof members !== "object") continue;
          cleanRoster[chan] = {};
          for (const [nick, m] of Object.entries(members as Record<string, any>)) {
            if (m && typeof m === "object") cleanRoster[chan][nick] = { s: typeof m.s === "string" ? m.s : "gone", l: typeof m.l === "number" ? m.l : 0 };
          }
        }
      }
      return {
        // A claimed house name is never restored from storage: it opens
        // only with its code, presented fresh each visit.
        nick: typeof data.nick === "string" && data.nick && !isHouseName(data.nick) ? data.nick : "",
        current: typeof data.current === "string" ? data.current : "server",
        channels: Array.isArray(data.channels) ? data.channels.filter((c) => typeof c === "string" && c.startsWith("#")) : [],
        buffers: clean,
        roster: cleanRoster,
        away: typeof data.away === "string" ? data.away : "",
      };
    } catch { return null; }
  };
  let pendingJoins: string[] = [];
  /* Channels a JOIN echo may pull the view to: an explicit /join, or
     the first join out of the server tab. Automatic rejoins (refresh,
     reconnect, kept channels) must never steal the view from the
     target the operator is actually reading. */
  const joinFocus = new Set<string>();

  const stamp = (when?: number) => {
    const d = when ? new Date(when) : new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const push = (target: string, text: string, when?: number) => {
    if (!buffers.has(target)) { buffers.set(target, []); renderTargets(); }
    const buf = buffers.get(target)!;
    buf.push(`${stamp(when)} ${text}`);
    if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES);
    if (target === current) renderLines();
    scheduleSave();
  };
  /* A line out of the room's memory (the bridge replays the recent past
     as a client joins): it is laid in with its true time, and a line
     this device already holds is not laid in twice. */
  const pushMemory = (target: string, body: string, when?: number) => {
    const rendered = `${stamp(when)} ${body}`;
    if ((buffers.get(target) || []).includes(rendered)) return;
    push(target, body, when);
  };
  /* The room's colour law (Chase, 2026-10-25): what people say is
     blue, what they do in an emote is not, and development's voice —
     the bridge, the network, this client's own system lines — is
     always yellow. The kept line's dress decides: <nick> is speech,
     · nick is an emote, and everything else the room shows (—, the
     bridge's notices, service voices) is the system speaking. */
  const lineKind = (line: string): string => {
    const body = line.slice(6); // after the "HH:MM " stamp
    if (body.startsWith("· ")) return "emote";
    if (body.startsWith("<")) return "chat";
    return "dev";
  };
  const renderLines = () => {
    linesEl.textContent = "";
    for (const line of buffers.get(current) || []) linesEl.appendChild(el("div", `os-relay-line ${lineKind(line)}`, line));
    linesEl.scrollTop = linesEl.scrollHeight;
    renderUsers();
  };
  const renderTargets = () => {
    targetsEl.textContent = "";
    for (const t of buffers.keys()) {
      const b = el("button", `os-relay-target${t === current ? " active" : ""}`, t);
      b.addEventListener("click", () => selectTarget(t));
      targetsEl.appendChild(b);
    }
  };
  /* One door for every view change: the active tab, the lines pane and
     the roster must always describe the SAME target. The auto-join bug
     was a split change — JOIN moved `current` and repainted only the
     tabs, leaving the pane showing the server buffer until the operator
     toggled away and back. Nothing may move `current` bare any more. */
  const selectTarget = (t: string) => {
    current = t;
    renderTargets();
    renderLines();
    // A view change is state worth keeping: without this, a refresh
    // after merely tapping a tab restored the previous target, because
    // only pushed lines ever scheduled a save.
    scheduleSave();
  };
  const ago = (ts: number) => {
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  };
  const userRow = (nick: string, state: string, last = 0) => {
    const row = el("div", `os-relay-user${state === "gone" ? " gone" : ""}`);
    const dot = el("span", "os-relay-dot");
    dot.dataset.state = state;
    row.append(dot, document.createTextNode(nick));
    if (state === "idle" || state === "away") row.append(el("span", "os-relay-state", state));
    if (state === "gone") row.append(el("span", "os-relay-state", `gone · ${ago(last)}`));
    return row;
  };
  const renderSelf = () => {
    selfLine.textContent = "";
    if (myNick) {
      // Your name is yours to choose: wearing it is a button, and the
      // box it opens takes any name you give it — a password is an
      // offer, never a toll (no registration stands between a guest
      // and a name of their own).
      const selfNameBtn = el("button", "os-relay-self-name", myNick);
      selfNameBtn.title = "name yourself — wear any name you choose, no registration";
      selfNameBtn.addEventListener("click", () => showIdentityBox());
      selfLine.append(selfNameBtn, document.createTextNode(` · ${presence}${presence === "away" && awayMsg && awayMsg !== "away" ? ` — ${awayMsg}` : ""}`));
    } else selfLine.textContent = "—";
    awayBtn.textContent = presence === "away" ? "I'm back" : "set away";
  };
  const renderUsers = () => {
    renderSelf();
    usersEl.textContent = "";
    const set = users.get(current);
    const meta = roster.get(current);
    const live = set ? [...set] : [];
    /* GuardianAngel stands in the room as a member — in the member
       list, like anyone else. It carries no panel, no status prose,
       and no announcements of its own; it simply is here, and it
       works. (If a wire by that name ever truly joins, the name is
       already present and nothing doubles.) */
    if (current.startsWith("#") && !live.some((u) => u.toLowerCase() === GUARDIAN_NICK.toLowerCase())) live.push(GUARDIAN_NICK);
    live.sort((a, b) => a.localeCompare(b));
    usersEl.appendChild(el("div", "os-relay-users-h", `${live.length} on the wire`));
    for (const u of live) usersEl.appendChild(userRow(u, u === myNick ? presence : u === GUARDIAN_NICK ? "here" : (meta?.get(u)?.s || "here")));
    const kept = meta ? [...meta.entries()].filter(([n, m]) => m.s === "gone" && !(set && set.has(n))).sort((a, b) => b[1].l - a[1].l) : [];
    if (kept.length) {
      usersEl.appendChild(el("div", "os-relay-users-h", "kept — not in the room"));
      for (const [n, m] of kept) usersEl.appendChild(userRow(n, "gone", m.l));
    }
  };
  const send = (raw: string) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(raw + "\r\n"); };

  /* ————— GuardianAngel —————
     A standing member of the room, and nothing more is said about
     it anywhere: no panel, no status prose, no announcements, and no
     off switch — by the house's rulings it simply is here, in the
     member list like anyone else, and it works in silence. What it
     does, within the authority this client actually holds:
       · links from ordinary users are cut out of the line before it
         is shown or kept (a link-only line is dropped whole, and no
         marker takes the link's place);
       · spam is measured, not vibes: the same line three times in
         thirty seconds, or six lines in eight, is a strike;
       · strikes accumulate silently and escalate — at the second,
         removal; at the third, a ban — and where this client holds
         channel op those are real wire actions (KICK, then MODE +b
         + KICK), signed with the bare member name so every other
         Relay in the room recognises the removal, purges the
         offender's earlier lines too, and likewise says nothing.
         Without op, the guard still guards this view: the
         offender's lines stop reaching it.
     House names, channel ops and the network's own voices are exempt
     — a guard that bites the house is a bug, not a feature. Classic
     IRC cannot un-send a line from other clients; what the guard
     deletes, it deletes from every Relay it can reach. */
  const GUARDIAN_NICK = "GuardianAngel";
  const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
  const guardState = new Map<string, { strikes: number; last: number; window: { t: number; text: string }[] }>();
  const selfIsOp = (chan: string) => ops.get(chan)?.has(myNick) ?? false;
  const guardExempt = (chan: string, nick: string) => nick === myNick || isHouseName(nick) || nick.includes(".") || (ops.get(chan)?.has(nick) ?? false);
  const purgeLines = (chan: string, nick: string) => {
    const buf = buffers.get(chan);
    if (!buf) return;
    const esc = nick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\d{2}:\\d{2} (<${esc}> |· ${esc} )`);
    const kept = buf.filter((l) => !re.test(l));
    if (kept.length !== buf.length) { buffers.set(chan, kept); if (chan === current) renderLines(); scheduleSave(); }
  };
  const addStrike = (chan: string, nick: string, why: string) => {
    const key = `${chan}|${nick.toLowerCase()}`;
    const now = Date.now();
    let st = guardState.get(key);
    if (!st || now - st.last > 120_000) st = { strikes: 0, last: now, window: st?.window || [] };
    st.strikes += 1;
    st.last = now;
    guardState.set(key, st);
    /* Silence is the whole manner: no warning line, no removal
       notice, no ban announcement. The actions are the message. */
    if (st.strikes === 2) {
      if (selfIsOp(chan)) { send(`KICK ${chan} ${nick} :${GUARDIAN_NICK}`); purgeLines(chan, nick); }
      return;
    }
    if (st.strikes >= 3 && selfIsOp(chan)) { send(`MODE ${chan} +b ${nick}!*@*`); send(`KICK ${chan} ${nick} :${GUARDIAN_NICK}`); purgeLines(chan, nick); }
  };
  const guardianProcess = (chan: string, nick: string, text: string): { text: string | null; strikeWhy?: string } => {
    if (guardExempt(chan, nick)) return { text };
    const key = `${chan}|${nick.toLowerCase()}`;
    const now = Date.now();
    let st = guardState.get(key);
    if (!st) { st = { strikes: 0, last: now, window: [] }; guardState.set(key, st); }
    if (st.strikes >= 2 && !selfIsOp(chan)) return { text: null }; // locally muted: their lines stop here
    if (text.match(LINK_RE)) {
      const out = text.replace(LINK_RE, "").replace(/\s{2,}/g, " ").trim();
      return { text: out || null, strikeWhy: "link posted" };
    }
    const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
    st.window = st.window.filter((w) => now - w.t < 30_000);
    st.window.push({ t: now, text: norm });
    const repeats = norm ? st.window.filter((w) => w.text === norm).length : 0;
    const recent = st.window.filter((w) => now - w.t < 8_000).length;
    if (repeats >= 3) { st.window = st.window.filter((w) => w.text !== norm); return { text, strikeWhy: "repeat spam" }; }
    if (recent >= 6) { st.window = []; return { text, strikeWhy: "flooding" }; }
    return { text };
  };
  /* Presence moves on the wire as real IRC AWAY, so any client in the
     room — Relay or not — reads the state the panel shows. */
  const applyAwayWire = () => {
    if (!registered) return;
    if (presence === "here") send("AWAY");
    else send(`AWAY :${presence === "idle" ? "idle" : (awayMsg || "away")}`);
  };
  const setPresence = (p: Presence, msg = "") => {
    const was = presence;
    presence = p;
    awayMsg = p === "away" ? (msg || "away") : (p === "idle" ? "idle" : "");
    if (p === "away") manualAway = awayMsg;
    else if (p === "here") manualAway = "";
    if (was !== p || p === "away") {
      applyAwayWire();
      for (const c of joinedChans) rosterTouch(c, myNick, presence, true);
      push(current.startsWith("#") ? current : "server", p === "here" ? "— you are back" : `— you are ${p}${p === "away" && awayMsg !== "away" ? `: ${awayMsg}` : ""}`);
    }
    renderUsers();
    scheduleSave();
  };
  /* Idle is automatic: four quiet minutes with no key or touch, and
     the room is told. Stirring — or speaking — brings you back. */
  const bump = () => { lastAct = Date.now(); if (presence === "idle") setPresence("here"); };
  window.addEventListener("keydown", bump, { passive: true });
  window.addEventListener("pointerdown", bump, { passive: true });
  const onVis = () => { if (!document.hidden) bump(); };
  document.addEventListener("visibilitychange", onVis);
  const IDLE_MS = 4 * 60_000;
  const idleWatch = setInterval(() => { if (presence === "here" && Date.now() - lastAct > IDLE_MS) setPresence("idle"); }, 15_000);
  /* OFTC has no away-notify: the room's states are read by WHO — once
     on join (from the 366 handler) and once a minute after. */
  const whoWatch = setInterval(() => { if (registered) for (const c of joinedChans) send(`WHO ${c}`); }, 60_000);
  /* The deliberate reset: let the worn name go, draw a fresh machine
     name, and wear it — on the wire at once when connected. */
  const resetName = () => {
    const fresh = machineName();
    push("server", `— a fresh name is drawn: ${fresh}. The old one is let go.`);
    if (ws && ws.readyState === WebSocket.OPEN && registered) { send(`NICK ${fresh}`); return; }
    for (const meta of roster.values()) { const e = meta.get(myNick); if (e) { meta.delete(myNick); meta.set(fresh, e); } }
    myNick = fresh;
    renderUsers();
    scheduleSave();
  };

  const handle = (m: IrcMessage) => {
    switch (m.command) {
      case "PING":
        send(`PONG :${m.params[0] || ""}`);
        break;
      case "001":
        attempts = 0;
        registered = true;
        if (capFallback) { clearTimeout(capFallback); capFallback = null; }
        push("server", `— registered on the network as ${myNick}`);
        if (manualAway) { presence = "away"; awayMsg = manualAway; }
        if (presence !== "here") { applyAwayWire(); renderUsers(); }
        if (wireRegister) {
          send(`PRIVMSG NickServ :REGISTER ${wireRegister.password} ${wireRegister.email}`);
          push("server", `— registering ${myNick} with NickServ: watch your inbox for the code, then send /msg NickServ VERIFY REGISTER ${myNick} <code> — after that, the identity box's password field is this name's key.`);
          wireRegister = null;
        } else if (wirePassword) {
          send("PRIVMSG NickServ :IDENTIFY " + wirePassword);
          push("server", `— identifying to NickServ as ${myNick}…`);
        }
        if (joinedChans.size) for (const c of joinedChans) send(`JOIN ${c}`);
        else send(`JOIN ${joinTarget}`);
        if (pendingJoins.length) { for (const c of pendingJoins) send(`JOIN ${c}`); pendingJoins = []; }
        break;
      case "PRIVMSG": {
        const target = m.params[0] === myNick ? m.nick : m.params[0];
        const text = m.params[1] || "";
        if (text === "\x01VERSION\x01") { send(`NOTICE ${m.nick} :\x01VERSION BLACKSITE relaychat, nosuchmachine.net\x01`); break; }
        if (text.startsWith("\x01PING ") && text.endsWith("\x01")) { send(`NOTICE ${m.nick} :${text}`); break; }
        const isAction = text.startsWith("\x01ACTION ") && text.endsWith("\x01");
        const said = isAction ? text.slice(8, -1) : text;
        /* A line tagged relaymem is the room remembering, not the room
           speaking now: it takes its true time from the tag, dedupes
           against what this device already holds, makes no sound, and
           never earns a strike — the past was already judged live.
           GuardianAngel still reads it before it is shown, so a link
           cut today is cut in the remembered line too. */
        const mem = m.tags?.relaymem === "1";
        const when = mem && m.tags.time ? Date.parse(m.tags.time) || undefined : undefined;
        if (mem && m.nick === "relay.bridge") {
          // The bridge's own voice out of the memory — a restart probe
          // and its kin — wears the bridge's dress, not a chatter's:
          // a development line, yellow by the room's colour law.
          pushMemory(target, `— the bridge: ${said}`, when);
          break;
        }
        if (target.startsWith("#") && m.nick !== myNick) {
          // GuardianAngel reads every room line before it is shown.
          const v = guardianProcess(target, m.nick, said);
          if (v.text !== null) {
            const body = isAction ? `· ${m.nick} ${v.text}` : `<${m.nick}> ${v.text}`;
            if (mem) pushMemory(target, body, when);
            else push(target, body);
          }
          if (!mem && v.strikeWhy) addStrike(target, m.nick, v.strikeWhy);
        } else if (mem) pushMemory(target, isAction ? `· ${m.nick} ${said}` : `<${m.nick}> ${said}`, when);
        else if (isAction) push(target, `· ${m.nick} ${said}`);
        else push(target, `<${m.nick}> ${said}`);
        if (!mem) sfx("ping");
        break;
      }
      case "NOTICE": {
        const text = m.params[1] || "";
        if (m.nick === "relay.bridge") {
          // The house bridge speaks for itself — its refusal is the one
          // notice that must never be dressed as network chatter.
          push("server", `— the bridge: ${text}`);
          break;
        }
        if (m.nick.includes(".")) {
          // a server speaking: its connection housekeeping (hostname and
          // ident lookups against the bridge) can never succeed and is
          // not news — it never reaches the page. Anything else it says
          // arrives in house dress, without the *** shout.
          if (/looking up your hostname|checking ident|found your hostname|couldn'?t look up your hostname|no ident response|looking up your host/i.test(text)) break;
          push("server", `— the network: ${text.replace(/^\*\*\*\s*/, "")}`);
          break;
        }
        push("server", `-${m.nick}- ${text}`);
        break;
      }
      case "CAP": {
        // Capability negotiation: ask for away-notify so the room's
        // away/idle states are visible as they change, then close the
        // negotiation either way — registration must never wait on it.
        const sub = (m.params[1] || "").toUpperCase();
        const caps = m.params.slice(2).join(" ");
        if (sub === "LS") { if (/away-notify/.test(caps)) send("CAP REQ :away-notify"); else send("CAP END"); }
        else if (sub === "ACK" || sub === "NAK") send("CAP END");
        break;
      }
      case "AWAY": {
        const msg = m.params[0] || "";
        const st = msg ? (msg === "idle" ? "idle" : "away") : "here";
        for (const [chan, set] of users) if (set.has(m.nick)) {
          rosterTouch(chan, m.nick, st, true);
          push(chan, msg ? `— ${m.nick} is ${st}${st === "away" && msg !== "away" ? `: ${msg}` : ""}` : `— ${m.nick} is back`);
        }
        if (current.startsWith("#")) renderUsers();
        break;
      }
      case "JOIN": {
        const chan = m.params[0];
        if (m.nick === myNick) {
          joinedChans.add(chan);
          // Move the WHOLE view — tab, pane and roster together — and
          // only when this join owns the view: the first step out of
          // the server tab, or a channel the operator explicitly
          // joined. A kept channel rejoining behind a refresh or a
          // reconnect must not yank the operator off what they read.
          const focus = current === "server" || joinFocus.has(chan);
          joinFocus.delete(chan);
          if (focus) current = chan;
          push(chan, `— you stepped into ${chan}`);
          if (focus) renderTargets();
        } else push(chan, `— ${m.nick} arrived`);
        if (!users.has(chan)) users.set(chan, new Set());
        users.get(chan)!.add(m.nick);
        rosterTouch(chan, m.nick, m.nick === myNick ? presence : "here", m.nick === myNick);
        if (chan === current) renderLines();
        break;
      }
      case "PART": {
        const chan = m.params[0];
        if (m.nick === myNick) { joinedChans.delete(chan); roster.get(chan)?.delete(myNick); }
        else rosterTouch(chan, m.nick, "gone", true);
        push(chan, `— ${m.nick} left`);
        users.get(chan)?.delete(m.nick);
        ops.get(chan)?.delete(m.nick);
        if (chan === current) renderUsers();
        break;
      }
      case "QUIT":
        for (const [chan, set] of users) if (set.delete(m.nick)) { push(chan, `— ${m.nick} left the wire`); rosterTouch(chan, m.nick, "gone", true); ops.get(chan)?.delete(m.nick); }
        if (current.startsWith("#")) renderUsers();
        break;
      case "NICK": {
        const fresh = m.params[0];
        for (const set of users.values()) if (set.delete(m.nick)) set.add(fresh);
        for (const set of ops.values()) if (set.delete(m.nick)) set.add(fresh);
        for (const meta of roster.values()) { const e = meta.get(m.nick); if (e) { meta.delete(m.nick); meta.set(fresh, e); } }
        if (m.nick === myNick) { myNick = fresh; push("server", `— you are now ${myNick}`); }
        scheduleSave();
        renderUsers();
        break;
      }
      case "353": {
        const chan = m.params[2];
        if (!users.has(chan)) users.set(chan, new Set());
        for (const n of (m.params[3] || "").split(" ")) if (n) {
          // NAMES prefixes are authority, not decoration: @ is op —
          // GuardianAngel's reach, and its exemption list, read them.
          let token = n; let pfx = "";
          while (token.startsWith("@") || token.startsWith("+")) { pfx += token[0]; token = token.slice(1); }
          if (!token) continue;
          users.get(chan)!.add(token);
          if (pfx.includes("@")) { if (!ops.has(chan)) ops.set(chan, new Set()); ops.get(chan)!.add(token); }
          rosterTouch(chan, token, token === myNick ? presence : "here", token === myNick);
        }
        if (chan === current) renderUsers();
        break;
      }
      case "MODE": {
        const chan = m.params[0];
        if (!chan || !chan.startsWith("#")) break;
        let sign = "+"; let ai = 2;
        const argModes = "ovbeIq";
        for (const ch of (m.params[1] || "")) {
          if (ch === "+" || ch === "-") { sign = ch; continue; }
          let arg: string | undefined;
          if (argModes.includes(ch) || ch === "k" || (ch === "l" && sign === "+")) arg = m.params[ai++];
          if (ch === "o" && arg) {
            if (!ops.has(chan)) ops.set(chan, new Set());
            if (sign === "+") ops.get(chan)!.add(arg); else ops.get(chan)!.delete(arg);
          }
        }
        if (chan === current) renderUsers();
        break;
      }
      case "KICK": {
        const chan = m.params[0];
        const target = m.params[1];
        const reason = m.params[2] || "";
        users.get(chan)?.delete(target);
        ops.get(chan)?.delete(target);
        if (target === myNick) {
          joinedChans.delete(chan);
          push(chan, `— you were removed from ${chan}${reason ? `: ${reason}` : ""}`);
        } else {
          rosterTouch(chan, target, "gone", true);
          // A GuardianAngel removal (ours or another op's) purges the
          // removed user's lines from this log too — the deletion
          // reaches every Relay that hears the kick.
          /* A GuardianAngel-signed removal is never narrated — the
             member acts, the room simply has one fewer offender. */
          if (/^GuardianAngel$/.test(reason)) purgeLines(chan, target);
          else push(chan, `— ${target} was removed by ${m.nick}${reason ? ` (${reason})` : ""}`);
        }
        if (chan === current) renderUsers();
        break;
      }
      case "352": {
        // WHO reply: [me, chan, user, host, server, nick, status, …] —
        // the status letter is the network's own word: H here, G away.
        const chan = m.params[1];
        const nick = m.params[5];
        const status = m.params[6] || "";
        if (nick && nick !== myNick) rosterTouch(chan, nick, status.startsWith("G") ? "away" : "here", true);
        if (chan === current) renderUsers();
        break;
      }
      case "366": {
        // End of NAMES: reconcile the kept roster against who is
        // actually in the room now — anyone kept but absent is gone,
        // with their last-seen time untouched — then read the room's
        // presence by WHO (OFTC has no away-notify to push it).
        const chan = m.params[1];
        const live = users.get(chan);
        const meta = roster.get(chan);
        if (meta) {
          let changed = false;
          for (const [nick, e] of meta) if (nick !== myNick && e.s !== "gone" && !(live && live.has(nick))) { e.s = "gone"; changed = true; }
          if (changed) scheduleSave();
        }
        if (chan && chan.startsWith("#")) send(`WHO ${chan}`);
        if (chan === current) renderUsers();
        break;
      }
      case "332":
        push(m.params[1], `— topic: ${m.params[2] || ""}`);
        break;
      case "TOPIC":
        push(m.params[0], `— ${m.nick} set the topic: ${m.params[1] || ""}`);
        break;
      case "433": {
        if (/^machine\d[A-Z][0-9A-Z]$/.test(myNick)) {
          myNick = machineName();
          push("server", `— that machine name is already worn in the room; you are ${myNick} now`);
          send(`NICK ${myNick}`);
        } else push("server", `— the name ${m.params[1] || ""} is taken on this network — /nick another, or wear a machine name`);
        break;
      }
      default:
        if (/^4\d\d$/.test(m.command) || /^5\d\d$/.test(m.command)) push("server", `— ${m.params.slice(1).join(" ")}`);
        break;
    }
  };

  interface IdentityOpts { host: string; port: number; nick: string; channel: string; password: string; registerEmail: string; claim: string; }
  /* The build this client runs, learned from the site's own stamp.
     It rides every bridge connect so the bridge can register the one
     event the room deserves to hear about: a full service restart —
     a new build going live refreshes every client at once — which
     the bridge writes into the room's memory as a yellow probe line,
     once, never as spam. */
  let buildStamp = "";
  const noteBuild = async () => {
    try {
      const r = await fetch("/version.json", { cache: "no-store" });
      const j = await r.json();
      if (j && typeof j.chunk === "string") buildStamp = j.chunk;
    } catch { /* no stamp, no probe — the wire is unaffected */ }
  };
  void noteBuild();
  const connectWith = (o: IdentityOpts) => {
    const refusal = os.gate("active");
    if (refusal) { push("server", refusal); return; }
    myNick = o.nick || machineName();
    if (ws) { intentionalClose = true; if (keepalive) { clearInterval(keepalive); keepalive = null; } try { ws.close(); } catch { /* already gone */ } }
    users.clear(); ops.clear(); current = "server";
    joinedChans.clear(); intentionalClose = false; attempts = 0;
    wireHost = o.host; wirePort = o.port; wireClaim = o.claim; wirePassword = o.password;
    wireRegister = o.registerEmail && o.password ? { password: o.password, email: o.registerEmail } : null;
    joinTarget = o.channel || HOUSE_CHANNEL;
    push("server", `— reaching ${o.host}:${o.port} through the house bridge…`);
    renderTargets();
    openWire();
  };

  /* One bridge connection. The edge lets a held connection go after a few
     minutes (measured live: a healthy session dropped between 130s and
     180s), so the wire heals itself: a 45-second IRC PING keeps both legs
     warm, and an uninvited close re-registers and rejoins every channel
     the operator was sitting in, buffers untouched. Only /quit — or
     closing the app — leaves for good. */
  const openWire = () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/irc-bridge?host=${encodeURIComponent(wireHost)}&port=${wirePort}${buildStamp ? `&build=${encodeURIComponent(buildStamp)}` : ""}`);
    ws.binaryType = "arraybuffer";
    const mine = ws;
    let pending = "";
    ws.addEventListener("open", () => {
      push("server", "— bridge open; registering…");
      send("CAP LS 302");
      if (capFallback) clearTimeout(capFallback);
      capFallback = setTimeout(() => { if (!registered) send("CAP END"); }, 6000);
      if (wireClaim) send(`PASS nsm-claim:${wireClaim}`);
      send(`NICK ${myNick}`);
      send(`USER ${myNick} 0 * :BLACKSITE Relay machine`);
      if (keepalive) clearInterval(keepalive);
      keepalive = setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) send("PING :relay"); }, 45000);
    });
    ws.addEventListener("message", (ev) => {
      const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(new Uint8Array(ev.data as ArrayBuffer));
      pending += text;
      let idx;
      while ((idx = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, idx).replace(/\r$/, "");
        pending = pending.slice(idx + 1);
        if (line) handle(parseIrcLine(line));
      }
    });
    ws.addEventListener("close", (ev) => {
      if (ws !== mine) return;
      registered = false;
      if (keepalive) { clearInterval(keepalive); keepalive = null; }
      if ((ev as CloseEvent).code === 4403) {
        // The bridge's claim refusal is FINAL: the same presentation
        // would be refused forever, so the wire does not heal itself
        // over it. The operator is pointed at the identity box instead.
        intentionalClose = true;
        push("server", "— the bridge refused that name: it is claimed by the house and opens only with its claim code. The identity box is up — present the code there, or wear another name.");
        showIdentityBox();
        return;
      }
      if (intentionalClose) { push("server", "— off the wire."); return; }
      users.clear(); ops.clear();
      attempts += 1;
      const wait = Math.min(2000 * 2 ** (attempts - 1), 20000);
      push("server", `— the wire dropped. Stepping back on in ${Math.round(wait / 1000)}s — your place in the room is kept.`);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => { reconnectTimer = null; if (!intentionalClose) openWire(); }, wait);
    });
    ws.addEventListener("error", () => push("server", "— bridge hiccup; the rejoin below covers it"));
  };
  /* Retention: if this machine kept a log, the room reopens with its
     words in place, wearing the same name, and steps back into every
     channel the operator was sitting in — a refresh costs nothing. */
  const restored = loadLog();
  if (restored) {
    for (const [t, lines] of Object.entries(restored.buffers)) buffers.set(t, lines);
    for (const [chan, members] of Object.entries(restored.roster)) {
      const meta = new Map<string, { s: string; l: number }>();
      for (const [nick, m] of Object.entries(members)) meta.set(nick, { s: m.s, l: m.l });
      roster.set(chan, meta);
    }
    if (restored.away) { manualAway = restored.away; presence = "away"; awayMsg = restored.away; }
    pendingJoins = restored.channels.filter((c) => c !== HOUSE_CHANNEL);
    if (restored.current && buffers.has(restored.current)) current = restored.current;
    renderTargets();
    renderLines();
    push(current, "— kept from before: everything above was said earlier. The wire picks up below.");
  }

  /* No box, no form: Relay opens already standing in the house channel,
     wearing an issued machine name. Identity is opt-in, from the button. */
  connectWith({ host: NETWORKS[0].host, port: 6697, nick: restored?.nick || machineName(), channel: HOUSE_CHANNEL, password: "", registerEmail: "", claim: "" });
  // connectWith lands on the server tab; if a kept log was restored, put
  // the operator back on the target they were reading when they left —
  // through the same single door, so tab and pane agree. The JOIN
  // echoes that follow must not steal it back (see joinFocus).
  if (restored && restored.current && buffers.has(restored.current)) selectTarget(restored.current);

  /* Closing the window leaves the wire — no ghost sessions idling in the
     room after the operator has gone. The teardown is TOTAL, and it is
     the only door out: every listener this instance put on window or
     document comes off (a dead room must not keep answering keys and
     touches, stacking one ghost per opening), every watch and timer
     stops — including a pending reconnect, which must never be able
     to resurrect the wire behind a closed window — the kept log is
     flushed, and the socket closes. Reopening builds a fresh
     instance that starts clean. */
  const teardown = () => {
    window.removeEventListener("keydown", bump);
    window.removeEventListener("pointerdown", bump);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onPageHide);
    clearInterval(idleWatch);
    clearInterval(whoWatch);
    if (keepalive) { clearInterval(keepalive); keepalive = null; }
    if (capFallback) { clearTimeout(capFallback); capFallback = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveLog(); }
    intentionalClose = true;
    try { ws?.close(); } catch { /* already gone */ }
  };
  const ghostWatch = setInterval(() => {
    if (!document.body.contains(wrap)) {
      clearInterval(ghostWatch);
      teardown();
    }
  }, 2000);

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    if ((wirePassword && text === wirePassword) || (wireClaim && text === wireClaim)) {
      // The one accident Relay can actually prevent: the operator
      // pasting a credential they handed this visit into the room.
      // It is not sent, and it does not stay sitting in the box.
      input.value = "";
      push(current, "— that text is a credential you handed this visit. It was NOT sent — credentials belong nowhere near a chat box. If it was pasted by accident, it never left this machine.");
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) { push(current, "— the wire is down this second; your line stays in the box and goes out when the wire is back."); return; }
    if (current === "server" && !text.startsWith("/")) { push("server", "— join a channel first (the house channel opens on connect)"); return; }
    input.value = "";
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      const arg = rest.join(" ");
      switch (cmd.toLowerCase()) {
        case "join": if (arg.startsWith("#")) joinFocus.add(arg); send(`JOIN ${arg}`); break;
        case "part": send(`PART ${current}`); if (current !== "server") { buffers.delete(current); selectTarget("server"); } break;
        case "msg": { const [to, ...msgParts] = rest; const msg = msgParts.join(" "); if (to && msg) { if (presence !== "here") setPresence("here"); send(`PRIVMSG ${to} :${msg}`); push(to, `<${myNick}> ${msg}`); selectTarget(to); } break; }
        case "me": if (presence !== "here") setPresence("here"); send(`PRIVMSG ${current} :\x01ACTION ${arg}\x01`); push(current, `· ${myNick} ${arg}`); break;
        case "away": setPresence("away", arg || "away"); break;
        case "back": setPresence("here"); break;
        case "nick": send(`NICK ${arg}`); break;
        case "topic": send(`TOPIC ${current} :${arg}`); break;
        case "quit": intentionalClose = true; joinedChans.clear(); if (keepalive) { clearInterval(keepalive); keepalive = null; } send("QUIT :off the wire"); ws.close(); push("server", "— off the wire. The identity box is up if you want back in — any name, or none."); showIdentityBox(); break;
        case "wipe": {
          // A wipe reaches exactly as far as authorship — the house's
          // ruling. It takes back YOUR lines: the bridge purges this
          // name's lines from the room's memory (its answer arrives as
          // a bridge notice), and this device drops them from the room
          // in front of you. Everyone else's words stand, untouched —
          // nobody wipes the whole chat for everyone.
          if (!current.startsWith("#")) { push(current, "— /wipe belongs to a room: stand in the channel whose lines of yours you would take back."); break; }
          send(`RELAYMEM-WIPE ${current}`);
          purgeLines(current, myNick);
          push(current, "— your lines here are wiped — yours only. Everyone else's words stand, and so does the room.");
          break;
        }
        default: push(current, `— no such order: /${cmd} (try /join /part /msg /me /nick /away /back /topic /wipe /quit)`);
      }
      return;
    }
    if (presence !== "here") setPresence("here");
    send(`PRIVMSG ${current} :${text}`);
    push(current, `<${myNick}> ${text}`);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  sendBtn.addEventListener("click", () => { submit(); input.focus(); });
}
