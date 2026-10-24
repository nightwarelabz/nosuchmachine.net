// @ts-nocheck
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

  /* ————— connect card ————— */
  const card = el("div", "os-relay-card");
  const intro = el("p", "os-note",
    "The house wire: a real IRC client in this tab, bridged by the site's edge to a public network over TLS. " +
    "Opening Relay drops you straight into #nosuchmachine on OFTC as a guest — no account, no registration, " +
    "no name to file; /nick names you once you are in the room. This card is only for changing network or " +
    "wearing a name of your own. (Libera.Chat currently turns bridged guests away — it demands " +
    "SASL from the bridge's network range — so the house room lives on OFTC.) The house names — nightwarelabz, nosuchmachine, chasebryan " +
    "and kin — are claimed: the bridge opens them only with the house claim code, so nobody on this wire wears " +
    "the operator's name but the operator.");
  const netSel = document.createElement("select");
  netSel.className = "os-bottle-select";
  for (const n of NETWORKS) {
    const o = document.createElement("option");
    o.value = n.host; o.textContent = n.label;
    netSel.appendChild(o);
  }
  const nickIn = document.createElement("input");
  nickIn.className = "os-bottle-input";
  nickIn.value = `guest-${Math.floor(1000 + Math.random() * 9000)}`;
  nickIn.placeholder = "nick";
  nickIn.maxLength = 24;
  const chanIn = document.createElement("input");
  chanIn.className = "os-bottle-input";
  chanIn.value = HOUSE_CHANNEL;
  chanIn.placeholder = "channel";
  const tlsWrap = el("label", "os-relay-tls");
  const tlsIn = document.createElement("input");
  tlsIn.type = "checkbox"; tlsIn.checked = true;
  tlsWrap.append(tlsIn, document.createTextNode(" TLS (port 6697)"));
  const claimIn = document.createElement("input");
  claimIn.className = "os-bottle-input";
  claimIn.type = "password";
  claimIn.placeholder = "claim code — house names only";
  claimIn.autocomplete = "off";
  try {
    const saved = os.read(CLAIM_PATH);
    if (saved) claimIn.value = saved.split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#")).pop() || "";
  } catch { /* no saved code — the field just stays empty */ }
  const cardMsg = el("p", "os-note", "");
  const joinBtn = el("button", "os-btn", "enter the wire ▸");
  card.append(intro, netSel, nickIn, chanIn, claimIn, tlsWrap, joinBtn, cardMsg);
  wrap.appendChild(card);

  /* ————— session view ————— */
  const view = el("div", "os-relay-view");
  view.hidden = true;
  const targetsEl = el("div", "os-relay-targets");
  const main = el("div", "os-relay-main");
  const linesEl = el("div", "os-relay-lines");
  const inputRow = el("div", "os-relay-inputrow");
  const input = document.createElement("input");
  input.className = "os-relay-input";
  input.placeholder = "say it on the wire — /join #chan · /msg nick · /me waves · /part · /nick name";
  input.maxLength = 400;
  const idBtn = el("button", "os-btn small", "name / network");
  idBtn.title = "change name or network";
  idBtn.addEventListener("click", () => { card.hidden = false; cardMsg.textContent = "— wearing a new name re-enters the wire as that name; the room keeps your conversation."; nickIn.focus(); });
  const copyBtn = el("button", "os-btn small", "copy");
  copyBtn.title = "copy this conversation";
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText((buffers.get(current) || []).join("\n")).then(() => { copyBtn.textContent = "copied ✓"; setTimeout(() => (copyBtn.textContent = "copy"), 1400); });
    input.focus();
  });
  inputRow.append(input, idBtn, copyBtn);
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
      b.addEventListener("click", () => { current = t; renderTargets(); renderLines(); input.focus(); });
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
        if (joinedChans.size) for (const c of joinedChans) send(`JOIN ${c}`);
        else send(`JOIN ${chanIn.value.trim() || HOUSE_CHANNEL}`);
        break;
      case "PRIVMSG": {
        const target = m.params[0] === myNick ? m.nick : m.params[0];
        const text = m.params[1] || "";
        if (text === "\x01VERSION\x01") { send(`NOTICE ${m.nick} :\x01VERSION BLACKSITE Relay — the house wire, nosuchmachine.net\x01`); break; }
        if (text.startsWith("\x01PING ") && text.endsWith("\x01")) { send(`NOTICE ${m.nick} :${text}`); break; }
        if (text.startsWith("\x01ACTION ") && text.endsWith("\x01")) push(target, `· ${m.nick} ${text.slice(8, -1)}`);
        else push(target, `<${m.nick}> ${text}`);
        break;
      }
      case "NOTICE":
        push("server", `-${m.nick}- ${m.params[1] || ""}`);
        break;
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
      default:
        if (/^4\d\d$/.test(m.command) || /^5\d\d$/.test(m.command)) push("server", `— ${m.params.slice(1).join(" ")}`);
        break;
    }
  };

  const connect = () => {
    const refusal = os.gate("active");
    if (refusal) { card.hidden = false; cardMsg.textContent = refusal; return; }
    const host = netSel.value;
    const port = tlsIn.checked ? 6697 : 6667;
    myNick = (nickIn.value.trim() || "guest").replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "") || "guest";
    const claim = claimIn.value.trim();
    if (isHouseName(myNick) && !claim) {
      card.hidden = false; view.hidden = true;
      cardMsg.textContent = `— "${myNick}" is a claimed house name. It opens only with the house claim code — enter it above, or pick any other nick.`;
      return;
    }
    if (ws) { intentionalClose = true; if (keepalive) { clearInterval(keepalive); keepalive = null; } try { ws.close(); } catch { /* already gone */ } }
    buffers.clear(); users.clear(); current = "server";
    joinedChans.clear(); intentionalClose = false; attempts = 0;
    wireHost = host; wirePort = port; wireClaim = claim;
    card.hidden = true; view.hidden = false;
    push("server", `— reaching ${host}:${port} through the house bridge…`);
    renderTargets();
    openWire();
    input.focus();
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
      if (wireClaim) {
        send(`PASS nsm-claim:${wireClaim}`);
        if (isHouseName(myNick)) {
          try { os.write(CLAIM_PATH, `# relay claim code — secret. kept in this browser's blacksite filesystem only.\n${wireClaim}\n`); } catch { /* the code still rides this session */ }
        }
      }
      send(`NICK ${myNick}`);
      send(`USER ${myNick} 0 * :BLACKSITE Relay guest`);
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
  joinBtn.addEventListener("click", connect);

  /* No registration, no form to clear: opening Relay steps straight into
     the house channel as a guest. The card above is for changing network
     or wearing a name of your own — never a toll booth. */
  connect();

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

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = input.value.trim();
    input.value = "";
    if (!text || !ws) return;
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
        case "quit": intentionalClose = true; joinedChans.clear(); if (keepalive) { clearInterval(keepalive); keepalive = null; } send("QUIT :off the wire"); ws.close(); card.hidden = false; view.hidden = true; break;
        default: push(current, `— no such order: /${cmd} (try /join /part /msg /me /nick /topic /quit)`);
      }
      return;
    }
    if (current === "server") { push("server", "— join a channel first (the house channel opens on connect)"); return; }
    send(`PRIVMSG ${current} :${text}`);
    push(current, `<${myNick}> ${text}`);
  });
}
