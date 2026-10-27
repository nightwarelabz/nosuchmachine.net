import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("dist");
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
const book = JSON.parse(fs.readFileSync("src/data/book.json", "utf8"));

function decodeAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function anchors(html) {
  return [...html.matchAll(/<a\b([^>]*)>/g)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        decodeAttribute(attribute[2]),
      ]),
    ),
  );
}

function readRoute(route) {
  const file = path.join(root, route, "index.html");
  assert.ok(fs.existsSync(file), `Missing page: ${route}`);
  return fs.readFileSync(file, "utf8");
}
assert.equal(
  new Set(catalog.map((p) => p.slug)).size,
  catalog.length,
  "Project slugs must be unique",
);
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const osHome = fs.readFileSync(path.join(root, "index.html"), "utf8");
// The swap (Chase's directive): BLACKSITE OS is the main site view at /;
// the bench suite lives at /bench/. The homepage carries the OS markers.
for (const marker of ["os-boot", "os-desktop", "os-taskbar", "os-emcon-chip", "BLACKSITE OS"]) {
  assert.ok(osHome.includes(marker), `Homepage (BLACKSITE OS) missing marker: ${marker}`);
}
assert.ok(osHome.includes("/bench/"), "Homepage OS must link the bench suite at /bench/");
const bench = fs.readFileSync(path.join(root, "bench/index.html"), "utf8");
const homeLinks = new Set(anchors(bench).map((anchor) => anchor.href));
const homeHeading = bench.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const home = bench;
assert.match(homeHeading ?? "", /bench/i, "Bench page must present the BLACKSITE WEB bench");
assert.match(home, /blacksite[\s-]*web/i, "Bench page must identify BLACKSITE WEB");
assert.match(home, /nightware[\s-]*labz/i, "Bench page must identify NIGHTWARE LABZ");
for (const section of [
  "hero", "instrument", "skelli", "get-started", "lab", "about", "work", "current",
]) {
  assert.ok(
    home.includes(`id="${section}"`),
    `Missing homepage section or retained anchor: #${section}`,
  );
}
for (const panel of [
  "panel-overview", "panel-dns", "panel-tls", "panel-http", "panel-ports",
  "panel-recon", "panel-jwt", "panel-vault", "panel-codecs", "panel-subnet",
  "panel-cert", "panel-payload", "panel-mirror", "panel-report", "panel-mail", "panel-subs", "panel-pqc",
]) {
  assert.ok(home.includes(`id="${panel}"`), `Missing suite panel: #${panel}`);
}
for (const control of [
  "global-target", "battery-run", "dns-run", "tls-run", "http-run", "tcp-run",
  "recon-run", "jwt-run", "hash-run", "vault-seal", "codec-run", "subnet-run",
  "cert-run", "payload-run", "echo-run", "webrtc-run", "fingerprint-run", "mail-run", "subs-run", "pqc-run",
  "ble-run", "report-export-md", "report-export-json",
]) {
  assert.ok(home.includes(`id="${control}"`), `Missing suite control: #${control}`);
}
for (const destination of [
  "https://github.com/nightwarelabz/nightjar",
  "https://github.com/nightwarelabz/nightjar/releases",
  "https://github.com/nightwarelabz/nightjar#get-started",
  "/projects/orange/",
]) {
  assert.ok(homeLinks.has(destination), `Homepage missing destination: ${destination}`);
}
assert.match(home, /Xcode/i, "Homepage must explain the build-from-source option for the native app");
assert.match(
  home,
  /signing|sign and|signed|provisioning/i,
  "Homepage must explain iOS signing requirements",
);
assert.match(home, /one knock, read, grade/i, "Homepage must state the bench doctrine");
assert.match(home, /public targets only/i, "Homepage must state the public-target guard");

// Wolfenstein 3D + orc: the DOS machine's assets must ship whole, and
// the OS bundle must carry both rooms.
for (const asset of ["wolf3d/js-dos.js", "wolf3d/js-dos.css", "wolf3d/NOTICE.txt", "wolf3d/emulators/emulators.js", "wolf3d/emulators/wdosbox.js", "wolf3d/emulators/wdosbox.wasm", "wolf3d/emulators/wlibzip.js", "wolf3d/emulators/wlibzip.wasm"]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `Missing wolf3d asset: ${asset}`);
}
const bundleSize = fs.statSync(path.join(root, "wolf3d/wolf3d.jsdos")).size;
assert.ok(bundleSize > 600_000 && bundleSize < 900_000, `wolf3d.jsdos bundle size looks wrong: ${bundleSize}`);
const astroJs = fs.readdirSync(path.join(root, "_astro")).filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(root, "_astro", f), "utf8")).join("\n");
for (const marker of ["wolf3d.jsdos", "os-wolf-stage", "os-orc-frame", "Wolfenstein 3D"]) {
  assert.ok(astroJs.includes(marker), `OS bundle missing marker: ${marker}`);
}
for (const asset of ["orc/orc-64.png", "orc/orc-128.png", "orc/orc-256.png"]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `Missing orc icon asset: ${asset}`);
}
assert.ok(astroJs.includes("orc-64.png"), "OS bundle must carry the orc face icon");
// Nexuiz: the real DarkPlaces build and its frame must ship, the OS
// bundle must carry the room, and the data pipe's pins must be the
// verified release's (NOTICE.txt is the provenance of record).
for (const asset of ["nexuiz/play.html", "nexuiz/autoexec.cfg", "nexuiz/NOTICE.txt", "nexuiz/COPYING.txt", "nexuiz/darkplaces-wasm.js", "nexuiz/darkplaces-wasm.wasm", "nexuiz/sparta-menu.pk3"]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `Missing nexuiz asset: ${asset}`);
}
const nexWasmSize = fs.statSync(path.join(root, "nexuiz/darkplaces-wasm.wasm")).size;
assert.ok(nexWasmSize > 1_000_000 && nexWasmSize < 25_000_000, `darkplaces-wasm.wasm size looks wrong: ${nexWasmSize}`);
const nexNotice = fs.readFileSync(path.join(root, "nexuiz/NOTICE.txt"), "utf8");
for (const pin of ["3ec238441a4886b44a12134cf89f45b3d9be59359d4a089773f7996b8d4bd6c0", "a5e27ebcc9775c4a490d0d3536c32e4a8f8f96b038c0b6a78d1823c37a962000", "d098b071c88447914ec6e9f17f8b57327399e91b011699d20a39e6452949780c", "9b20e773ef86a45017835138ac3bda582631c583dddffe68f9c1c1eb6b67cd17", "10018c6a19fee310c70504952691fb21748ff5d1412c4f1271ff7de658d7f5b3"]) {
  assert.ok(nexNotice.includes(pin), `nexuiz NOTICE.txt must pin the verified hash: ${pin}`);
}
for (const marker of ["os-nexuiz-stage", "/nexuiz/play.html", "blacksite-nexuiz-bridge", "blacksite-relay-v2"]) {
  assert.ok(astroJs.includes(marker), `OS bundle missing nexuiz marker: ${marker}`);
}
// House QC patch 010 (identity swap): the menu door's label is
// "haxiuz" and its command is unchanged — the connect token is
// load-bearing across bridge, gateway and OS. The patch of
// record must carry the door line on both sides with the same
// command string: before (label "thisissparta2!") and after
// (label "haxiuz"), command "connect thisissparta2" in both.
const qcPatch010 = fs.readFileSync("tools/nexuiz/house-qc-patch-010.diff", "utf8");
assert.ok(
  qcPatch010.includes('makeNexuizCommandButton("thisissparta2!", \'0 0 0\', "connect thisissparta2", 0)'),
  "house-qc-patch-010 must record the door's pre-swap line with its connect command",
);
assert.ok(
  qcPatch010.includes('makeNexuizCommandButton("haxiuz", \'0 0 0\', "connect thisissparta2", 0)'),
  "house-qc-patch-010 must relabel the door to haxiuz with the connect command unchanged",
);
// House QC patch 011 (the native cursor): the menu's drawn
// cursor is a zero-alpha drawpic — the same draw, painting
// nothing — and the patch of record must carry both sides of
// that one line.
const qcPatch011 = fs.readFileSync("tools/nexuiz/house-qc-patch-011.diff", "utf8");
assert.ok(
  qcPatch011.includes("draw_mousepointer_size, '1 1 1', draw_alpha, 0)"),
  "house-qc-patch-011 must record the cursor draw's pre-patch line",
);
assert.ok(
  qcPatch011.includes("draw_mousepointer_size, '1 1 1', 0, 0)"),
  "house-qc-patch-011 must draw the menu cursor at zero alpha",
);
// House QC patch 012 (the menu banner): the patch of record
// must carry the plate-layer skip, the banner draw in the
// resolver's absolute form, and the update-nag gate.
const qcPatch012 = fs.readFileSync("tools/nexuiz/house-qc-patch-012.diff", "utf8");
assert.ok(
  qcPatch012.includes('SKINGFX_BACKGROUND_INGAME && i == 1'),
  "house-qc-patch-012 must record the plate-layer skip",
);
assert.ok(
  qcPatch012.includes('"/gfx/nightware-banner"'),
  "house-qc-patch-012 must draw the house banner in the resolver's absolute form",
);
assert.ok(
  qcPatch012.includes('FALSE && _Nex_ExtResponseSystem_UpdateTo'),
  "house-qc-patch-012 must gate the nexuiz.com update nag off",
);
// House QC patch 013 (mouse sensitivity, restored): the patch
// of record must carry the stock slider on the stock cvar.
const qcPatch013 = fs.readFileSync("tools/nexuiz/house-qc-patch-013.diff", "utf8");
assert.ok(
  qcPatch013.includes('makeNexuizSlider(1, 32, 0.2, "sensitivity")'),
  "house-qc-patch-013 must restore the stock sensitivity slider on the stock cvar",
);
// House QC patch 014 (the tag's seat): the patch of record must
// carry the tag's seat on both sides — the old seat on the
// plate's corner, and the new seat computed off the plate's
// left edge with the tag margin.
const qcPatch014 = fs.readFileSync("tools/nexuiz/house-qc-patch-014.diff", "utf8");
assert.ok(
  qcPatch014.includes("tagpos = '1 0 0' * (0.986 - tagw) + '0 1 0' * 0.112;"),
  "house-qc-patch-014 must record the tag's pre-move seat",
);
assert.ok(
  qcPatch014.includes("tagpos = '1 0 0' * (1 - bw - 0.014 - tagw) + '0 1 0' * 0.112;"),
  "house-qc-patch-014 must seat the tag left of the plate with its margin",
);
// Nexuiz fullscreen law: Esc is the game's menu key — the OS bundle
// must carry the frame's Esc report and the 4.5 s hold-exit clock,
// and the play frame must carry its half (watching the key, holding
// the pointer lock for the session).
assert.ok(astroJs.includes("esc-down"), "OS bundle must carry the nexuiz Esc hold-exit clock");
assert.ok(astroJs.includes("4500"), "OS bundle must carry the 4.5 s Esc hold");
// Window lifecycle (review §3/§5): the OS bundle must carry the
// running/suspended/disposed contract words the windows speak, the
// state the window body wears, and the lazy build a restored
// minimized window is dealt instead of its content.
for (const marker of ["os:suspend", "os:resume", "os:dispose"]) {
  assert.ok(astroJs.includes(marker), `OS bundle missing lifecycle word: ${marker}`);
}
assert.ok(astroJs.includes("osState"), "OS bundle must stamp each window's lifecycle state on its body");
assert.ok(astroJs.includes("deferBuild"), "OS bundle must carry the deferred build session restore deals a minimized window");
const nexPlay = fs.readFileSync(path.join(root, "nexuiz/play.js"), "utf8");
assert.ok(nexPlay.includes("esc-down"), "nexuiz play frame must report Esc edges to the house");
assert.ok(nexPlay.includes("requestPointerLock"), "nexuiz play frame must hold pointer lock in fullscreen");
// Haxiuz stripped data: the play frame must deal the stripped
// pack as a span entry on the data pipe (part "haxiuz", its span
// and SHA-256 pinned — the pack is 99 MB, far past the 25 MiB
// ceiling on a static site file, so it cannot be dealt as one),
// it must no longer deal the release pack as a files entry, and
// it must retire the full-data kept copies a returning player's
// machine may still hold under the old parts' keys.
assert.ok(nexPlay.includes("data/haxiuz.pk3"), "nexuiz play frame must deal the stripped haxiuz data pack");
assert.ok(nexPlay.includes('part: "haxiuz"'), "nexuiz play frame must deal the stripped pack as the data pipe's haxiuz span part");
assert.ok(nexPlay.includes("spanLength: 98509217"), "nexuiz play frame must pin the haxiuz pack's span length in its deal");
assert.ok(nexPlay.includes('sha256: "10018c6a19fee310c70504952691fb21748ff5d1412c4f1271ff7de658d7f5b3"'), "nexuiz play frame must pin the haxiuz pack's SHA-256 in its deal");
assert.ok(!nexPlay.includes('"/nexuiz/haxiuz.pk3?v="'), "nexuiz play frame must not deal the haxiuz pack as a static site file");
assert.ok(!nexPlay.includes('"data/data20091001.pk3":'), "nexuiz play frame must not deal the full release data pack");
assert.ok(nexPlay.includes("part=data"), "nexuiz play frame must carry the legacy full-data cache retirement");
// Auto-join law (v1.1, restoring the pre-menu-first mechanism):
// the window's room deal ("join") carries the connect as a boot
// argument, dealt only when a usable bridge address rides
// along — the local and menu deals deal no connect — and the
// engine must raise itself (the click-to-play plate belonged
// to the first auto-join and stays gone). The menu's door
// (house-qc-patch-009) stands as the manual road back in.
assert.ok(nexPlay.includes('args.push("+connect", server)'), "nexuiz play frame must deal the auto-join connect on a join deal");
assert.ok(nexPlay.includes('const joinLive = mode === "join"'), "the auto-join connect must be gated on the join deal and a live bridge");
assert.ok(nexPlay.includes('rawMode === "join" ? "join" : "menu"'), "the play frame must deal the join mode the window deals on open");
assert.ok(!nexPlay.includes("plate-btn"), "nexuiz play frame must not gate the menu behind a click-to-play plate");
// Esc heal forwarding (review §9): a press inside the frame is
// reported to the house as a throttled "gesture" word, and the
// OS bundle must answer it with the fullscreen heal.
assert.ok(nexPlay.includes('post({ type: "gesture" })'), "nexuiz play frame must forward in-frame gestures to the house for the fullscreen heal");
assert.ok(astroJs.includes("gesture"), "OS bundle must carry the nexuiz gesture heal word");
// Nexuiz WebRTC transport: a house peer's construction must try the
// fast road first — a DataChannel negotiated over the /rtc
// signaling path on the dealt door, STUN only, no TURN, inside the
// setup budget — and every failure on it must land on the exact
// current road, a real WebSocket to the original URL. These pins
// are the ship-markers of that contract in the built play frame.
assert.ok(nexPlay.includes("nxInstallSpartaWebSocket(bridge)"), "nexuiz play frame must install the RTC shim on a live join");
assert.ok(
  nexPlay.indexOf("nxInstallSpartaWebSocket(bridge)") > nexPlay.indexOf("moduleDef.websocket") &&
  nexPlay.indexOf("nxInstallSpartaWebSocket(bridge)") < nexPlay.indexOf("window.Module = moduleDef"),
  "the RTC shim must be installed where the websocket is dealt, before window.Module is set",
);
assert.ok(nexPlay.includes('"/rtc"') && nexPlay.includes("nxSpartaSignalUrl"), "the shim must derive its signaling path as /rtc on the dealt door");
assert.ok(nexPlay.includes("new URL(houseUrl)"), "the signaling URL must be derived from the dealt bridge URL, not rebuilt from parts");
assert.ok(nexPlay.includes('createDataChannel("sparta", { ordered: false, maxRetransmits: 0 })'), "the fast road's channel must be sparta, unordered, with no retransmits");
assert.ok(nexPlay.includes("NX_RTC_BUDGET_MS = 8000"), "the RTC setup budget must be 8000 ms from construction");
assert.ok(nexPlay.includes('"stun:stun.l.google.com:19302"'), "the fast road must learn its address from the house STUN server only (no TURN)");
assert.ok(nexPlay.includes("new RealWebSocket(this.url, this._protocols)"), "the fallback must construct the original WebSocket with the original URL and protocols");
assert.ok(nexPlay.includes("new RealWebSocket(url, protocols)"), "a construction for any other URL must return a real WebSocket, untouched");
// Nexuiz session diagnostics (review §2): opt-in per deal and off
// by default. The frame samples only when dealt diag=1; every
// figure comes from the session's own connection — the shim's
// registry of the sockets the engine actually made, and the
// active peer connection's own getStats — never a second peer
// opened to measure. Engine frames are counted from the glue's
// own main-loop counter, reached only by the descriptor probe.
assert.ok(nexPlay.includes('q.get("diag")'), "nexuiz diagnostics must be gated on the dealt diag parameter");
assert.ok(nexPlay.includes("NxSpartaSocket.DIAG = NX_DIAG"), "the socket instrumentation must arm only with the deal's diag flag");
assert.ok(nexPlay.includes("NxSpartaSocket.REGISTRY"), "diagnostics must read the session's own sockets from the shim registry");
assert.ok(nexPlay.includes("getStats"), "webrtc figures must come from the active peer connection's getStats");
assert.ok(nexPlay.includes("currentFrameNumber"), "engine frames must be counted from the glue's main-loop frame counter");
assert.ok(nexPlay.includes('Object.getOwnPropertyDescriptor(window, "MainLoop")'), "the engine frame counter must be reached by the descriptor probe, never a direct read");
assert.ok(nexPlay.includes("diag-export"), "the frame must answer the house's diagnostics export request");
assert.ok(nexPlay.includes("session: NX_SESSION"), "every frame word must carry the deal's session tag");
assert.ok(nexPlay.includes("ev.origin !== location.origin") && nexPlay.includes("ev.source !== window.parent"), "the frame must believe house words only from this origin and the parent window");
assert.ok(astroJs.includes("blacksite-nexuiz-diag"), "the OS window must honor the diagnostics opt-in flag");
assert.ok(astroJs.includes("session diagnostics"), "the OS window must stand the diagnostics panel when armed");
assert.ok(astroJs.includes("diag-export"), "the OS window must ask the frame for its diagnostics export");
assert.ok(astroJs.includes("origin!==location.origin"), "the OS window must check the origin of frame words, not only the source window");
// Live update: the build stamp must name the OS chunk this build made,
// and the bundle must carry the watcher that polls it.
const versionStamp = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
assert.ok(/^os\.[A-Za-z0-9_-]+\.js$/.test(versionStamp.chunk || ""), "version.json must name the OS chunk this build produced");
assert.ok(fs.existsSync(path.join(root, "_astro", versionStamp.chunk)), "version.json chunk must exist in _astro");
assert.ok(astroJs.includes("BLACKSITE has been updated"), "OS bundle must carry the update watcher");
assert.ok(astroJs.includes("/version.json"), "OS bundle must poll /version.json");
assert.ok(astroJs.includes("server is about to refresh for an update"), "OS bundle must carry the held update's warning toast");
assert.ok(astroJs.includes("waiting for haxiuz to close"), "OS bundle must carry the held update's haxiuz wait");
// ——— BEGIN haxiuz restructure pins (Games folder + surface removal) ———
// Chase's order (2026-10-26): the games stand in one desktop folder;
// Bloodbath and Wyrdfall leave the shipped surface (their sources stay
// in the repo, unbuilt); haxiuz keeps its internal "nexuiz" key.
// Source-level pins read the wiring files, bundle pins read the built OS.
const osSrcR = fs.readFileSync("src/scripts/os.ts", "utf8");
const subSrcR = fs.readFileSync("src/scripts/os-subconscious.ts", "utf8");
assert.ok(osSrcR.includes('games: { title: "games", icon: "games" }'), "APPS must register the games folder");
assert.ok(osSrcR.includes('["games", "games", "games"]'), "desktop defs must stand the games folder on the desk");
assert.ok(osSrcR.includes('["nexuiz", "haxiuz"]') && osSrcR.includes('["simulacrum", "Simulacrum"]') && osSrcR.includes('["wolf3d", "Wolfenstein 3D"]'), "GAME_FOLDER must hold exactly haxiuz (key nexuiz), Simulacrum and Wolfenstein 3D");
for (const loose of ['["simulacrum", "simulacrum", "Simulacrum"]', '["bloodbath", "bloodbath", "Bloodbath"]', '["wyrdfall", "wyrdfall", "Wyrdfall"]', '["wolf3d", "wolf3d", "Wolfenstein 3D"]', '["nexuiz", "nexuiz", "haxiuz"]']) {
  assert.ok(!osSrcR.includes(loose), `desktop defs must not stand a loose game icon: ${loose}`);
}
assert.ok(!osSrcR.includes("buildBloodbath") && !osSrcR.includes("buildWyrdfall"), "os.ts must not import the removed rooms' builders");
assert.ok(!/bloodbath: \{ title/.test(osSrcR) && !/wyrdfall: \{ title/.test(osSrcR), "APPS must carry no bloodbath/wyrdfall registration");
assert.ok(!astroJs.includes("Bloodbath") && !astroJs.includes("Wyrdfall"), "the built OS bundle must carry no Bloodbath/Wyrdfall surface");
assert.ok(astroJs.includes("os-games"), "the built OS bundle must carry the games folder window");
assert.ok(!subSrcR.includes("bloodbath") && !subSrcR.includes("wyrdfall"), "the subconscious must name no removed app (candidates or exclusions)");
assert.ok(subSrcR.includes('"games", "nexuiz"'), "the subconscious must never warm the games folder or the haxiuz engine");
assert.ok(qcPatch010.includes('"connect thisissparta2"'), "the door's connect token is unchanged by the identity (patch of record)");
// ——— BEGIN phonehome pins (Chase, 2026-10-27) ———
// phonehome is the OS's telecommunications field: registered as an
// app, stood on the desk, sealed station to station, and its edge
// rendezvous exists. The bundle pins read the built OS chunk.
assert.ok(osSrcR.includes('phonehome: { title: "phonehome", icon: "phonehome" }'), "APPS must register phonehome");
assert.ok(osSrcR.includes('["phonehome", "phonehome", "phonehome"]'), "desktop defs must stand phonehome on the desk");
assert.ok(osSrcR.includes("registerPhonehomeVerbs()"), "os.ts must register the phonehome verb");
assert.ok(astroJs.includes("nsm.phonehome.signal.v1"), "OS bundle must carry the phonehome signal schema");
assert.ok(astroJs.includes("nsm.phonehome.message.v1"), "OS bundle must carry the phonehome sealed-message schema");
assert.ok(astroJs.includes("a secure transmitter and reception field"), "OS bundle must carry phonehome's own description of itself");
assert.ok(astroJs.includes("tap to talk") && astroJs.includes("toggleTalk"), "phonehome talk must be a tap toggle (Chase, 2026-10-27)");
assert.ok(!astroJs.includes("hold to talk"), "phonehome must not ship the retired hold-to-talk control");
assert.ok(ex2(new URL("../functions/api/phonehome.ts", import.meta.url)), "the phonehome rendezvous function must exist");
const phApiSrc = rfs2(new URL("../functions/api/phonehome.ts", import.meta.url), "utf8");
assert.ok(phApiSrc.includes("phonehome:v1:") && phApiSrc.includes("expirationTtl"), "the rendezvous must namespace its keys and expire them");
assert.ok(phApiSrc.includes("PHONEHOME") && phApiSrc.includes("RELAY_MEMORY"), "the rendezvous must prefer its own KV binding and fall back to the house namespace");
// ——— END phonehome pins ———
// ——— END haxiuz restructure pins ———
assert.ok(astroJs.includes("credentialless"), "orc preview frame must be credentialless (the OS page's COEP require-corp blocks plain cross-origin frames)");
assert.ok(!astroJs.includes("Orchestration"), "ORC is never expanded in public copy (Chase: the expansion is for internal records)");
const headersOut = fs.readFileSync(path.join(root, "_headers"), "utf8");
assert.ok(headersOut.includes("/wolf3d/*"), "Served _headers must carry the /wolf3d/* scope");
assert.ok(headersOut.includes("/nexuiz/*"), "Served _headers must carry the /nexuiz/* scope");
assert.ok(headersOut.includes("frame-src 'self' https:"), "OS CSP must allow the orc room's frames");
assert.ok(headersOut.includes("frame-ancestors 'self'"), "OS pages must be framable by the house itself (the orc room recursion) - and only by the house");
import { readFileSync as rfs2 } from "node:fs";
const soundSrc = rfs2(new URL("../src/scripts/os-sound.ts", import.meta.url), "utf8");
assert.ok(!soundSrc.includes("if (armed) return"), "the sound engine must re-arm on every gesture - arm-once wedges Safari silent");
import { existsSync as ex2 } from "node:fs";
assert.ok(ex2(new URL("../functions/lens.ts", import.meta.url)), "the orc lens function must exist (Safari's only door into the pane)");
const lensSrc = rfs2(new URL("../functions/lens.ts", import.meta.url), "utf8");
assert.ok(lensSrc.includes("guardUrl"), "the lens must route every target through the shared SSRF guard");
assert.ok(!/content-security-policy[^\n]*allow-same-origin/.test(lensSrc), "lens pages must never run with this origin's privileges");
const orcSrc = rfs2(new URL("../src/scripts/os-orc.ts", import.meta.url), "utf8");
assert.ok(ex2(new URL("../src/scripts/os-depth.ts", import.meta.url)), "the nest-layering module must exist");
const depthSrc = rfs2(new URL("../src/scripts/os-depth.ts", import.meta.url), "utf8");
assert.ok(depthSrc.includes("blacksite-nest-"), "nests must namespace their storage (shared keys = session-restore regress)");
assert.ok(astroJs.includes("the mirrors end here"), "the nest ceiling note must ship in the bundle");
assert.ok(!orcSrc.includes('setAttribute("sandbox"'), "the orc frame must NOT be sandboxed: an opaque origin starves the framed page of its own subresources (the unstyled-nest corpse)");
assert.ok(astroJs.includes("/lens?u="), "the orc room must route non-credentialless browsers through the lens");
assert.ok(orcSrc.includes("frameCredless !== d.credless"), "the orc frame must be rebuilt when a navigation crosses the credentialless door - credentialless does not nest, so house and lens pages ride plain frames");
assert.ok(!astroJs.includes("open in your browser"), "the orc room has no open-out button (Chase's ruling)");
// Relay regression pin (2026-10-25): a stray bare `connect();` — a leftover
// from the pre-connectWith card flow — sat between Relay's auto-connect and
// its submit wiring. It names no function in the module, so opening Relay
// threw and the Enter/send listeners below it were never registered: the
// room joined and listened, but nobody could send. Pin both halves: no
// undefined bare call, and the send wiring present.
const ircSrc = rfs2(new URL("../src/scripts/os-irc.ts", import.meta.url), "utf8");
assert.ok(!/^\s*connect\(\);\s*$/m.test(ircSrc), "Relay must not call the retired card-flow connect() — it is undefined and kills the send wiring below it");
assert.ok(ircSrc.includes('input.addEventListener("keydown"'), "Relay must wire Enter to submit");
assert.ok(ircSrc.includes('sendBtn.addEventListener("click"'), "Relay must wire the send button to submit");
// Relay retention (Chase, 2026-10-25): a refresh must not cost the room its
// words. The log persists on-device under the depth-namespaced key, restore
// runs before the auto-connect, and the forget button can wipe it.
assert.ok(ircSrc.includes('skey(RELAY_LOG_KEY)') && ircSrc.includes('"blacksite-relay-v2"'), "Relay retention must persist under the skey-namespaced blacksite-relay-v2 key");
assert.ok(ircSrc.includes('removeItem(skey("blacksite-relay-v1"))'), "Relay must destroy the retired v1 log key on sight — the board wipe that starts the room clean");
assert.ok(ircSrc.includes("const restored = loadLog();"), "Relay must restore its kept log before reconnecting");
assert.ok(ircSrc.includes("forgetBtn"), "Relay must offer the forget button that wipes the kept log");
// The pinned dev note (Chase, 2026-10-25): a topic-of-the-day bar at the
// top of the chat carrying the current developer message, verbatim.
assert.ok(ircSrc.includes("os-relay-note"), "Relay must render the pinned dev note bar");
// Relay presence + kept roster (Chase, 2026-10-25): auto-idle and manual
// away ride real IRC AWAY with away-notify negotiated; everyone who
// enters is kept on-device; the worn name resets only on purpose.
assert.ok(ircSrc.includes("CAP REQ :away-notify"), "Relay must negotiate away-notify so presence shows as it changes");
assert.ok(ircSrc.includes("setPresence"), "Relay must carry presence state (here / idle / away)");
assert.ok(ircSrc.includes("IDLE_MS"), "Relay idle must engage automatically after quiet minutes");
assert.ok(ircSrc.includes("rosterTouch"), "Relay must keep a roster of everyone who enters the room");
assert.ok(ircSrc.includes("kept — not in the room"), "Relay must show kept users who are not in the room");
assert.ok(ircSrc.includes("resetName"), "Relay must offer the deliberate new-name reset");
// Relay identity card + login flow (main-chat audit, 2026-10-25): the
// card and the room are alternative views over an opaque window; a
// bridge claim refusal is final (4403), speaks as the bridge, and the
// claim field is re-checked at the Enter click.
const osCssSrc = fs.readFileSync("src/styles/os.css", "utf8");
assert.ok(/\.os-relay \{[^}]*background:/.test(osCssSrc), "Relay window must paint an opaque house background (no wallpaper bleed)");
assert.ok(osCssSrc.includes(".os-relay.card-open .os-relay-view"), "With the identity card open, the room view must step aside");
assert.ok(/\.os-relay-card \{[^}]*overflow-y: auto/.test(osCssSrc), "The identity card must scroll its own length");
assert.ok(ircSrc.includes('nickIn.addEventListener("change", syncClaim)'), "Claim reveal must also bind the nick field's change event");
assert.ok(ircSrc.includes("code === 4403"), "Client must treat bridge close 4403 (claim refusal) as final — no reconnect loop");
assert.ok(ircSrc.includes('m.nick === "relay.bridge"'), "The bridge's own NOTICE must be dressed as the bridge, not as network chatter");
const bridgeSrc = fs.readFileSync("functions/api/irc-bridge.ts", "utf8");
assert.ok(bridgeSrc.includes("closeBoth(4403)"), "Bridge must close claim refusals with code 4403");
// Relay view logic (Chase, 2026-10-25): auto-join must land IN the
// channel — tab, pane and roster describing the same target — with no
// toggle away and back; kept service windows and credentials must
// never enter the persisted log.
assert.ok(ircSrc.includes("const selectTarget"), "Relay view changes must go through the single selectTarget door (tab + pane + roster together)");
assert.ok(ircSrc.includes("joinFocus"), "Automatic rejoins must not steal the view from the target being read");
assert.ok(ircSrc.includes("SERVICE_NICKS"), "NickServ/ChanServ windows must be excluded from the kept log (they carry passwords and codes)");
assert.ok(ircSrc.includes("It was NOT sent"), "Relay must refuse to send a credential handed to it this visit");
// GuardianAngel (Chase, 2026-10-25): automated moderation that acts
// within the authority the client holds — link removal, measured spam
// strikes, warn/remove/ban escalation when op, view-only guard without.
assert.ok(ircSrc.includes("guardianProcess"), "GuardianAngel must read every room line before it is shown");
assert.ok(ircSrc.includes("addStrike"), "GuardianAngel strikes must escalate remove -> ban");
assert.ok(ircSrc.includes("GUARDIAN_NICK"), "GuardianAngel stands in the room as a named member");
assert.ok(ircSrc.includes("purgeLines"), "A GuardianAngel removal must purge the offender's lines from Relay logs that hear it");
assert.ok(!ircSrc.includes("setGuardian"), "GuardianAngel has no off switch — it stays on (house ruling)");
assert.ok(!ircSrc.includes("[link removed]"), "GuardianAngel carries no text: links are cut, not labelled");
assert.ok(!ircSrc.includes("GuardianAngel warned"), "GuardianAngel never announces itself in the room");
assert.ok(astroJs.includes("happy halloween hackerz!"), "The pinned dev note must carry the current developer message in the served bundle");
// Relay room memory (Chase, 2026-10-25): the bridge holds the room's
// recent lines in a mutable, expiring memory (KV) and replays them to
// any joining device — nobody is a ghost for speaking from another
// machine. Inert without the binding; armed the moment it exists.
const memLibSrc = fs.readFileSync("functions/_lib/relay-memory.ts", "utf8");
assert.ok(memLibSrc.includes("expirationTtl"), "Room memory lines must expire — the memory forgets on a clock, it is not an archive");
assert.ok(memLibSrc.includes("memPurgeNick"), "Room memory must be purgeable per removed voice (mutable by design)");
assert.ok(!memLibSrc.includes("memWipe"), "No whole-room wipe may exist anywhere: a wipe takes back only what the wiper said — never the entire chat for everyone (house ruling, Chase 2026-10-25)");
assert.ok(!bridgeSrc.includes("memWipe"), "The bridge must hold no whole-room wipe capability either — a wipe takes back the wiper's own lines only");
assert.ok(bridgeSrc.includes("RELAY_MEMORY"), "The bridge must read the room-memory binding");
assert.ok(bridgeSrc.includes("relaymem=1"), "The bridge must tag replayed lines so clients lay them in as memory, not as new speech");
assert.ok(bridgeSrc.includes("RELAYMEM-WIPE"), "The bridge must honor the wipe control line at authorship scope only — the sender's own lines, never the room");
assert.ok(bridgeSrc.includes("worn.map((n) => memPurgeNick(mem, host, chan, n))"), "A bridge wipe must purge by every name the wiper's own session wore on this connection — authorship is the whole scope, and nobody else's lines are reachable");
assert.ok(ircSrc.includes("under every name you have worn on this connection — yours only"), "The client must state the wipe ruling where a wipe happens: your lines only, under every name you wore, everyone else untouched");
assert.ok(ircSrc.includes('tags?.relaymem'), "The client must recognize memory-tagged lines");
assert.ok(ircSrc.includes("pushMemory"), "The client must lay memory lines in deduped, with their true time");
// Relay colour law + restart probes + self-naming (Chase, 2026-10-25):
// speech renders blue, emotes are the exception, development's voice
// (bridge, network, system lines) is always yellow; a full service
// restart registers exactly one probe in the room's memory; a guest
// names themself by choice, with no registration standing in the way.
assert.ok(ircSrc.includes("lineKind"), "Relay lines must be classified for the colour law at render");
assert.ok(osCssSrc.includes(".os-relay-line.dev") && osCssSrc.includes(".os-relay-line.chat") && osCssSrc.includes(".os-relay-line.emote"), "Relay must carry the colour law in CSS (dev yellow, chat blue, emote apart)");
assert.ok(ircSrc.includes("name yourself"), "A guest's own name must be a door to naming themself — no registration required");
assert.ok(ircSrc.includes("&build="), "The client must tell the bridge its build so restarts can register");
assert.ok(bridgeSrc.includes("memBuildProbe"), "The bridge must register full restarts as probes in the room memory");
assert.ok(memLibSrc.includes("sys|build") && memLibSrc.includes("PROBE_COOLDOWN_MS"), "Restart probes must key on the build stamp and respect a cooldown — register, never spam");

const osPage = fs.readFileSync(path.join(root, "blacksite/index.html"), "utf8");
for (const [route, html] of [["/", osHome], ["/blacksite/", osPage]]) {
  for (const marker of ['id="os-boot-classic"', 'id="os-boot-thinice"', 'id="os-boot-frost"', 'data-boot-classic', 'data-boot-skip', 'role="progressbar"']) {
    assert.ok(html.includes(marker), `${route} must ship the Thinice boot and the original classic fallback: ${marker}`);
  }
  assert.ok(html.includes("needs JavaScript to boot"), `${route} must retain its no-script path`);
}
assert.ok(home.includes("Daylight Bottle"), "Bench page must carry the Daylight Bottle plug");
assert.ok(home.includes("/#bottle"), "Bench page must deep-link the OS bottle desk");
for (const marker of ["os-boot", "os-desktop", "os-taskbar", "os-emcon-chip", "BLACKSITE OS"]) {
  assert.ok(osPage.includes(marker), `BLACKSITE OS page missing marker: ${marker}`);
}
assert.equal(book.chapters.length, 24, "The pinned Orange Book has 24 chapters");
assert.equal(
  new Set(book.chapters.map((chapter) => chapter.slug)).size,
  book.chapters.length,
  "Book chapter slugs must be unique",
);
for (const field of ["title", "author", "version", "snapshot", "sourceUrl"])
  assert.ok(
    typeof book[field] === "string" && book[field].trim(),
    `Missing book ${field}`,
  );
assert.match(
  book.revision,
  /^[a-f\d]{40}$/,
  "Book source must be pinned to a full commit revision",
);
assert.ok(
  fs.existsSync("vendor/orange/THE_ORANGE_BOOK.md"),
  "The original Orange Book source must be retained locally",
);
// Check against the vendored manuscript, so missing text or stale chapter imports
// fail without fetching a moving upstream revision during a build.
execFileSync(process.execPath, ["scripts/sync-orange-book.mjs", "--check"], {
  stdio: "inherit",
});
assert.ok(
  fs.readFileSync(path.join(root, "book/orange-book.md")).equals(
    fs.readFileSync("vendor/orange/THE_ORANGE_BOOK.md"),
  ),
  "The hosted manuscript download must match the original source",
);
assert.ok(
  anchors(home).some((anchor) => anchor.href === "/book/"),
  "Homepage must link to the hosted Orange Book",
);
const bookHome = readRoute("/book/");
const bookHomeLinks = new Set(anchors(bookHome).map((anchor) => anchor.href));
const chapterRoutes = book.chapters.map((chapter) => `/book/${chapter.slug}/`);
for (const route of ["/book/", ...chapterRoutes])
  assert.ok(
    sitemap.includes(`https://nosuchmachine.net${route}</loc>`),
    `Book route missing from sitemap: ${route}`,
  );

for (const [index, chapter] of book.chapters.entries()) {
  if (index > 0)
    assert.ok(
      chapter.order > book.chapters[index - 1].order,
      "Book chapters must follow reading order",
    );
  const route = chapterRoutes[index];
  assert.ok(bookHomeLinks.has(route), `Book contents missing chapter: ${chapter.title}`);
  const chapterLinks = anchors(readRoute(route));
  const activeChapterLinks = chapterLinks.filter(
    (anchor) =>
      anchor["aria-current"] === "page" && chapterRoutes.includes(anchor.href),
  );
  assert.deepEqual(
    activeChapterLinks.map((anchor) => anchor.href),
    [route],
    `Book sidebar must identify the current chapter: ${route}`,
  );
  for (const [relation, expected] of [
    ["prev", chapterRoutes[index - 1]],
    ["next", chapterRoutes[index + 1]],
  ]) {
    const links = chapterLinks.filter((anchor) =>
      (anchor.rel ?? "").split(/\s+/).includes(relation),
    );
    assert.deepEqual(
      links.map((anchor) => anchor.href),
      expected ? [expected] : [],
      `Incorrect ${relation} chapter link: ${route}`,
    );
  }
}

const searchIndexFile = path.join(root, "book/search-index.json");
assert.ok(fs.existsSync(searchIndexFile), "Missing locally hosted book search index");
const searchIndex = JSON.parse(fs.readFileSync(searchIndexFile, "utf8"));
assert.ok(
  Array.isArray(searchIndex),
  "Book search index must contain an array of chapter entries",
);
assert.deepEqual(
  searchIndex.map((chapter) => chapter.url),
  chapterRoutes,
  "Book search must index every chapter exactly once in reading order",
);
for (const [index, chapter] of searchIndex.entries()) {
  assert.equal(
    chapter.title,
    book.chapters[index].title,
    `Search title differs from chapter: ${chapter.url}`,
  );
  assert.ok(
    typeof chapter.text === "string" && chapter.text.trim().length > 100,
    `Search index lacks chapter text: ${chapter.url}`,
  );
}
// Orange's sized-call syntax resembles Markdown links. Readers must be able to
// find these literal examples from both inline code and fenced code blocks.
for (const [route, expressions] of [
  [
    "/book/chapter-8/",
    [
      "sha256[2](m)",
      "sum[1]([10])",
      "spec total() -> Int { sum([1, 2, 3]) + sum[1]([10]) }",
    ],
  ],
  ["/book/appendix-a/", ["f[s, ...](args)"]],
]) {
  const chapter = searchIndex.find((entry) => entry.url === route);
  for (const expression of expressions)
    assert.ok(
      chapter.text.includes(expression),
      `Book search must preserve Orange syntax ${expression} in ${route}`,
    );
}

const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (file.endsWith(".html")) files.push(file);
  }
}
walk(root);
let checkedLinks = 0;
for (const project of catalog) {
  const route = `/projects/${project.slug}/`;
  const projectFile = path.join(root, route, "index.html");
  assert.ok(
    sitemap.includes(`https://nosuchmachine.net${route}`),
    `${project.name} missing from sitemap`,
  );
  assert.ok(
    fs.existsSync(projectFile),
    `${project.name} page missing`,
  );
  assert.ok(
    project.sources.length > 0,
    `${project.name} needs a source reference`,
  );
  const projectHtml = fs.readFileSync(projectFile, "utf8");
  const projectLinks = new Set(
    [...projectHtml.matchAll(/\bhref="([^"]+)"/g)].map((match) =>
      match[1].replaceAll("&amp;", "&"),
    ),
  );
  for (const source of project.sources) {
    assert.ok(
      projectLinks.has(source.href),
      `${project.name} missing source reference: ${source.href}`,
    );
  }
}
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
  assert.ok(ids.includes("main"), `Missing main content target: ${file}`);
  assert.equal(
    [...html.matchAll(/<main\b/g)].length,
    1,
    `Expected one main landmark: ${file}`,
  );
  assert.equal(
    [...html.matchAll(/<h1\b/g)].length,
    1,
    `Expected one page heading: ${file}`,
  );
  for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/application\/ld\+json/.test(tag[1])) continue;
    assert.ok(
      /\bsrc=/.test(tag[1]) && !tag[2].trim(),
      `Executable inline script conflicts with CSP: ${file}`,
    );
  }
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(
      match[1].replaceAll("&amp;", "&"),
      `https://nosuchmachine.net/${path.relative(root, file)}`,
    );
    if (url.origin !== "https://nosuchmachine.net") continue;
    let target = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (fs.existsSync(target) && fs.statSync(target).isDirectory())
      target = path.join(target, "index.html");
    assert.ok(fs.existsSync(target), `Missing target ${match[1]} on ${file}`);
    if (url.hash && target.endsWith(".html")) {
      const targetHtml = fs.readFileSync(target, "utf8");
      assert.ok(
        targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
        `Missing anchor ${match[1]} on ${file}`,
      );
    }
    checkedLinks++;
  }
}
console.log(
  `Verified NIGHTWARE LABZ / BLACKSITE OS homepage with the bench suite at /bench/, BLACKSITE OS alias page markers, suite panels and controls, installation and source links, ${book.chapters.length} hosted book chapters with reading navigation and search, ${catalog.length} project routes and source references, ${files.length} HTML pages, ${checkedLinks} local links/assets, sitemap, and CSP-compatible scripts.`,
);
