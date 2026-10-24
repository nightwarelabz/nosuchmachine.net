// @ts-nocheck
/* Relay — the house wire. A real IRC client in the tab: it speaks the IRC
   protocol itself (registration, PING/PONG, channels, private messages,
   NAMES) over a WebSocket to the site's own bridge, which pipes it to a
   public network — Libera.Chat, OFTC, or hackint — over TLS. No account,
   no tracking: a nick, a channel, and the wire. The house channel is
   #nosuchmachine on Libera.Chat; on IRC, whoever arrives first opens
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
  { host: "irc.libera.chat", label: "Libera.Chat — the house network" },
  { host: "irc.oftc.net", label: "OFTC" },
  { host: "irc.hackint.org", label: "hackint" },
];
const HOUSE_CHANNEL = "#nosuchmachine";
const MAX_LINES = 300;

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
    "No account and nothing stored — pick a nick and step in. The house channel is #nosuchmachine on Libera.Chat; " +
    "on IRC, whoever arrives first opens the room.");
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
  const joinBtn = el("button", "os-btn", "enter the wire ▸");
  card.append(intro, netSel, nickIn, chanIn, tlsWrap, joinBtn);
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
  const copyBtn = el("button", "os-btn small", "copy");
  copyBtn.title = "copy this conversation";
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText((buffers.get(current) || []).join("\n")).then(() => { copyBtn.textContent = "copied ✓"; setTimeout(() => (copyBtn.textContent = "copy"), 1400); });
    input.focus();
  });
  inputRow.append(input, copyBtn);
  main.append(linesEl, inputRow);
  const usersEl = el("div", "os-relay-users");
  view.append(targetsEl, main, usersEl);
  wrap.appendChild(view);
  body.appendChild(wrap);

  /* ————— client state ————— */
  let ws: WebSocket | null = null;
  let myNick = "";
  let current = "server";
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
        push("server", `— registered on the network as ${myNick}`);
        send(`JOIN ${chanIn.value.trim() || HOUSE_CHANNEL}`);
        break;
      case "PRIVMSG": {
        const target = m.params[0] === myNick ? m.nick : m.params[0];
        const text = m.params[1] || "";
        if (text.startsWith("\x01ACTION ") && text.endsWith("\x01")) push(target, `· ${m.nick} ${text.slice(8, -1)}`);
        else push(target, `<${m.nick}> ${text}`);
        break;
      }
      case "NOTICE":
        push("server", `-${m.nick}- ${m.params[1] || ""}`);
        break;
      case "JOIN": {
        const chan = m.params[0];
        if (m.nick === myNick) { push(chan, `— you stepped into ${chan}`); current = chan; renderTargets(); }
        else push(chan, `— ${m.nick} arrived`);
        if (!users.has(chan)) users.set(chan, new Set());
        users.get(chan)!.add(m.nick);
        if (chan === current) renderUsers();
        break;
      }
      case "PART": {
        const chan = m.params[0];
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
    if (refusal) { push("server", refusal); }
    const host = netSel.value;
    const port = tlsIn.checked ? 6697 : 6667;
    myNick = (nickIn.value.trim() || "guest").replace(/[^A-Za-z0-9_\-\[\]{}^`|]/g, "") || "guest";
    buffers.clear(); users.clear(); current = "server";
    card.hidden = true; view.hidden = false;
    push("server", `— reaching ${host}:${port} through the house bridge…`);
    renderTargets();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/irc-bridge?host=${encodeURIComponent(host)}&port=${port}`);
    ws.binaryType = "arraybuffer";
    let pending = "";
    ws.addEventListener("open", () => {
      push("server", "— bridge open; registering…");
      send(`NICK ${myNick}`);
      send(`USER ${myNick} 0 * :BLACKSITE Relay guest`);
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
    ws.addEventListener("close", () => push(current, "— the wire went quiet (connection closed)"));
    ws.addEventListener("error", () => push(current, "— bridge error: the network could not be reached"));
    input.focus();
  };
  joinBtn.addEventListener("click", connect);

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
        case "quit": send("QUIT :off the wire"); ws.close(); card.hidden = false; view.hidden = true; break;
        default: push(current, `— no such order: /${cmd} (try /join /part /msg /me /nick /topic /quit)`);
      }
      return;
    }
    if (current === "server") { push("server", "— join a channel first (the house channel opens on connect)"); return; }
    send(`PRIVMSG ${current} :${text}`);
    push(current, `<${myNick}> ${text}`);
  });
}
