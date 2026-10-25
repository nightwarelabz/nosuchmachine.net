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
assert.ok(astroJs.includes("credentialless"), "orc preview frame must be credentialless (the OS page's COEP require-corp blocks plain cross-origin frames)");
assert.ok(!astroJs.includes("Orchestration"), "ORC is never expanded in public copy (Chase: the expansion is for internal records)");
const headersOut = fs.readFileSync(path.join(root, "_headers"), "utf8");
assert.ok(headersOut.includes("/wolf3d/*"), "Served _headers must carry the /wolf3d/* scope");
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
assert.ok(ircSrc.includes("addStrike"), "GuardianAngel strikes must escalate warn -> remove -> ban");
assert.ok(ircSrc.includes("[link removed]"), "GuardianAngel must remove links from room lines");
assert.ok(ircSrc.includes("purgeLines"), "A GuardianAngel removal must purge the offender's lines from Relay logs that hear it");
assert.ok(astroJs.includes("hard refresh to check chat if chat works. added persistence to the chat"), "The pinned dev note must carry the current developer message in the served bundle");

const osPage = fs.readFileSync(path.join(root, "blacksite/index.html"), "utf8");
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
