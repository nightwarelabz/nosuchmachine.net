// @ts-nocheck
import { sfx } from "./os-sound";
/* Relay — the house wire. A real IRC client in the tab: it speaks the IRC
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
}

/** Parse one IRC protocol line (RFC 1459 shape). Pure — harness-tested. */
export function parseIrcLine(line: string): IrcMessage {
  let rest = line.replace(/\r$/, "");
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
  return { prefix, nick, command, params: parts, trailing };
}

const NETWORKS = [
  { host: "irc.oftc.net", label: "OFTC — the house network" },
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
  const base = nick.toLowerCase().replace(/[_`^|\-]/g, "");
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
  const card = el("div", "os-relay-card");
  card.hidden = true;
  wrap.appendChild(card);

  const hideIdentityBox = () => { card.replaceChildren(); card.hidden = true; };

  const showIdentityBox = () => {
    card.replaceChildren();
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
    cancelBtn.addEventListener("click", () => { hideIdentityBox(); });
    enterBtn.addEventListener("click", () => {
      const nick = (nickIn.value.trim() || machineName()).replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "") || machineName();
      const claim = claimIn.value.trim();
      if (isHouseName(nick) && !claim) { msg.textContent = `— "${nick}" stays shut without its code. Take any other name — or the machine name.`; return; }
      if (regIn.checked && (!passIn.value.trim() || !mailIn.value.trim())) { msg.textContent = "— registering takes both a password and an email for the code."; return; }
      const channel = chanIn.value.trim().startsWith("#") ? chanIn.value.trim() : HOUSE_CHANNEL;
      hideIdentityBox();
      connectWith({ host: netSel.value, port: tlsIn.checked ? 6697 : 6667, nick, channel, password: passIn.value, registerEmail: regIn.checked ? mailIn.value.trim() : "", claim });
    });
    card.append(note, netSel, nickIn, chanIn, passIn, regWrap, mailIn, claimWrap, tlsWrap, enterBtn, cancelBtn, msg);
    syncClaim();
    card.hidden = false;
  };

  /* ————— session view ————— */
  const view = el("div", "os-relay-view");
  const targetsEl = el("div", "os-relay-targets");
  const main = el("div", "os-relay-main");
  const linesEl = el("div", "os-relay-lines");
  const inputRow = el("div", "os-relay-inputrow");
  const input = document.createElement("input");
  input.className = "os-relay-input";
  input.placeholder = "say it on the wire — /join #chan · /msg nick · /me waves · /part · /nick name";
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
  input.setAttribute("enterkeyhint", "send");
  inputRow.append(input, sendBtn, idBtn, copyBtn);
  main.append(linesEl, inputRow);
  const usersEl = el("div", "os-relay-users");
  view.append(targetsEl, main, usersEl);
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
  let wireHost = "";
  let wirePort = 6697;
  let wireClaim = "";
  let wirePassword = "";
  let wireRegister: { password: string; email: string } | null = null;
  let joinTarget = HOUSE_CHANNEL;
  const buffers = new Map<string, string[]>();
  const users = new Map<string, Set<string>>();

  const stamp = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const push = (target: string, text: string) => {
    if (!buffers.has(target)) { buffers.set(target, []); renderTargets(); }
    const buf = buffers.get(target)!;
    buf.push(`${stamp()} ${text}`);
    if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES);
    if (target === current) renderLines();
  };
  const renderLines = () => {
    linesEl.textContent = "";
    for (const line of buffers.get(current) || []) linesEl.appendChild(el("div", "os-relay-line", line));
    linesEl.scrollTop = linesEl.scrollHeight;
    renderUsers();
  };
  const renderTargets = () => {
    targetsEl.textContent = "";
    for (const t of buffers.keys()) {
      const b = el("button", `os-relay-target${t === current ? " active" : ""}`, t);
      b.addEventListener("click", () => { current = t; renderTargets(); renderLines(); });
      targetsEl.appendChild(b);
    }
  };
  const renderUsers = () => {
    usersEl.textContent = "";
    const set = users.get(current);
    if (!set) return;
    usersEl.appendChild(el("div", "os-relay-users-h", `${set.size} on the wire`));
    for (const u of [...set].sort((a, b) => a.localeCompare(b))) usersEl.appendChild(el("div", "os-relay-user", u));
  };
  const send = (raw: string) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(raw + "\r\n"); };

  const handle = (m: IrcMessage) => {
    switch (m.command) {
      case "PING":
        send(`PONG :${m.params[0] || ""}`);
        break;
      case "001":
        attempts = 0;
        push("server", `— registered on the network as ${myNick}`);
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
        break;
      case "PRIVMSG": {
        const target = m.params[0] === myNick ? m.nick : m.params[0];
        const text = m.params[1] || "";
        if (text === "\x01VERSION\x01") { send(`NOTICE ${m.nick} :\x01VERSION BLACKSITE Relay — the house wire, nosuchmachine.net\x01`); break; }
        if (text.startsWith("\x01PING ") && text.endsWith("\x01")) { send(`NOTICE ${m.nick} :${text}`); break; }
        if (text.startsWith("\x01ACTION ") && text.endsWith("\x01")) push(target, `· ${m.nick} ${text.slice(8, -1)}`);
        else push(target, `<${m.nick}> ${text}`);
        sfx("ping");
        break;
      }
      case "NOTICE": {
        const text = m.params[1] || "";
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
      case "JOIN": {
        const chan = m.params[0];
        if (m.nick === myNick) { joinedChans.add(chan); push(chan, `— you stepped into ${chan}`); current = chan; renderTargets(); }
        else push(chan, `— ${m.nick} arrived`);
        if (!users.has(chan)) users.set(chan, new Set());
        users.get(chan)!.add(m.nick);
        if (chan === current) renderUsers();
        break;
      }
      case "PART": {
        const chan = m.params[0];
        if (m.nick === myNick) joinedChans.delete(chan);
        push(chan, `— ${m.nick} left`);
        users.get(chan)?.delete(m.nick);
        if (chan === current) renderUsers();
        break;
      }
      case "QUIT":
        for (const [chan, set] of users) if (set.delete(m.nick)) push(chan, `— ${m.nick} left the wire`);
        if (current.startsWith("#")) renderUsers();
        break;
      case "NICK":
        for (const set of users.values()) if (set.delete(m.nick)) set.add(m.params[0]);
        if (m.nick === myNick) { myNick = m.params[0]; push("server", `— you are now ${myNick}`); }
        renderUsers();
        break;
      case "353": {
        const chan = m.params[2];
        if (!users.has(chan)) users.set(chan, new Set());
        for (const n of (m.params[3] || "").split(" ")) if (n) users.get(chan)!.add(n.replace(/^[@+]/, ""));
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
  const connectWith = (o: IdentityOpts) => {
    const refusal = os.gate("active");
    if (refusal) { push("server", refusal); return; }
    myNick = o.nick || machineName();
    if (ws) { intentionalClose = true; if (keepalive) { clearInterval(keepalive); keepalive = null; } try { ws.close(); } catch { /* already gone */ } }
    users.clear(); current = "server";
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
    ws = new WebSocket(`${proto}//${location.host}/api/irc-bridge?host=${encodeURIComponent(wireHost)}&port=${wirePort}`);
    ws.binaryType = "arraybuffer";
    const mine = ws;
    let pending = "";
    ws.addEventListener("open", () => {
      push("server", "— bridge open; registering…");
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
    ws.addEventListener("close", () => {
      if (ws !== mine) return;
      if (keepalive) { clearInterval(keepalive); keepalive = null; }
      if (intentionalClose) { push("server", "— off the wire."); return; }
      users.clear();
      attempts += 1;
      const wait = Math.min(2000 * 2 ** (attempts - 1), 20000);
      push("server", `— the wire dropped. Stepping back on in ${Math.round(wait / 1000)}s — your place in the room is kept.`);
      setTimeout(() => { if (!intentionalClose) openWire(); }, wait);
    });
    ws.addEventListener("error", () => push("server", "— bridge hiccup; the rejoin below covers it"));
  };
  /* No box, no form: Relay opens already standing in the house channel,
     wearing an issued machine name. Identity is opt-in, from the button. */
  connectWith({ host: NETWORKS[0].host, port: 6697, nick: machineName(), channel: HOUSE_CHANNEL, password: "", registerEmail: "", claim: "" });

  /* Closing the window leaves the wire — no ghost sessions idling in the
     room after the operator has gone. */
  const ghostWatch = setInterval(() => {
    if (!document.body.contains(wrap)) {
      clearInterval(ghostWatch);
      intentionalClose = true;
      if (keepalive) clearInterval(keepalive);
      try { ws?.close(); } catch { /* already gone */ }
    }
  }, 2000);

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) { push(current, "— the wire is down this second; your line stays in the box and goes out when the wire is back."); return; }
    if (current === "server" && !text.startsWith("/")) { push("server", "— join a channel first (the house channel opens on connect)"); return; }
    input.value = "";
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      const arg = rest.join(" ");
      switch (cmd.toLowerCase()) {
        case "join": send(`JOIN ${arg}`); break;
        case "part": send(`PART ${current}`); if (current !== "server") { buffers.delete(current); current = "server"; renderTargets(); renderLines(); } break;
        case "msg": { const [to, ...msgParts] = rest; const msg = msgParts.join(" "); if (to && msg) { send(`PRIVMSG ${to} :${msg}`); push(to, `<${myNick}> ${msg}`); current = to; renderTargets(); renderLines(); } break; }
        case "me": send(`PRIVMSG ${current} :\x01ACTION ${arg}\x01`); push(current, `· ${myNick} ${arg}`); break;
        case "nick": send(`NICK ${arg}`); break;
        case "topic": send(`TOPIC ${current} :${arg}`); break;
        case "quit": intentionalClose = true; joinedChans.clear(); if (keepalive) { clearInterval(keepalive); keepalive = null; } send("QUIT :off the wire"); ws.close(); push("server", "— off the wire. The identity box is up if you want back in — any name, or none."); showIdentityBox(); break;
        default: push(current, `— no such order: /${cmd} (try /join /part /msg /me /nick /topic /quit)`);
      }
      return;
    }
    send(`PRIVMSG ${current} :${text}`);
    push(current, `<${myNick}> ${text}`);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  sendBtn.addEventListener("click", () => { submit(); input.focus(); });
}
