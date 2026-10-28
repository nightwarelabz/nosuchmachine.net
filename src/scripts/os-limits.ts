// BLACKSITE OS — the LIMIT ledger. Every roster verb the web room does not
// run gets a named reason, computed from its section and shape. `help`
// shows these as LIMIT; running one speaks its reason instead of pretending.
import roster from "../data/blacksite-commands.json";
import { LIMIT_REASONS, VERBS } from "./os-shell";
import { t } from "./os-i18n";

const UDP_HINTS = ["snmp", "nbstat", "mndp", "mdns", "ssdp", "upnp", "bonjour", "bacnet", "happ", "lon", "ffprobe", "moxa", "ntp", "reflect", "kiss", "ccsds"];
const LAN_HINTS = ["discover", "revdns", "router", "census", "scan"];
const CONTROL_HINTS = ["snmpset", "snmp3set", "unifi", "quarantine", "lockdown", "ssh", "restart", "block"];

export function registerLimitReasons() {
  for (const row of roster as Array<{ section: string; cmd: string; verb: string; desc: string }>) {
    const v = row.verb;
    if (VERBS.has(v) || LIMIT_REASONS.has(v)) continue;
    let reason: string;
    if (CONTROL_HINTS.some((h) => v.includes(h))) {
      reason = "that verb writes, controls, or speaks with kept credentials on gear. the web room reads and grades only — control lives in the native bench, on your own wire, with your own keys.";
    } else if (UDP_HINTS.some((h) => v.includes(h))) {
      reason = "that door speaks UDP (or LAN broadcast). browsers and this edge have no UDP — the native bench knocks it from your wire.";
    } else if (LAN_HINTS.some((h) => v === h || v.startsWith(h))) {
      reason = "that verb sweeps the local /24 you're standing on. the web room stands at the edge and has no neighborhood — the native bench does.";
    } else if (row.section === "pentest bench") {
      reason = "this probe's full protocol engine (multi-step session, UDP dialect, or credentialed read) lives in the native bench. the web room covers its family with the one-knock exchanges it can honestly make — try the verb's kin: banner, nc, knock, webaudit, cert.";
    } else if (row.section === "graphics") {
      reason = "that piece of the graphics room has not been ported yet. wallpaper is live; the rest is native for now.";
    } else if (row.section === "packages") {
      reason = "package management against live registries (clone/push/install) is not ported to the web room; the engines themselves (python3, js, run) are live.";
    } else if (row.section === "editors") {
      reason = "use `edit <file>` or open the Editor room — both editors' web port lives there (vim modes included).";
    } else if (row.section === "code — the engine room") {
      reason = "that engine-room verb is not ported yet. python3, js/node, and run are live.";
    } else {
      reason = "not ported to the web room yet. the native Blacksite in nightjar runs it today.";
    }
    LIMIT_REASONS.set(v, t(reason));
  }
}
