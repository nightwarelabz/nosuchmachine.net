# BLACKSITE WEB — architecture and guard

nosuchmachine.net is a working pentest bench. This document records what the
suite does, how it is built, and — most importantly — the lines it will not
cross.

## Doctrine

**One knock, read, grade** — the same doctrine as nightjar's Blacksite bench.
The suite performs reconnaissance, inspection, and grading. It does not
exploit, spray credentials, brute-force, fuzz for vulnerabilities, or flood.
There are no wordlists, no payload delivery to targets, and no evasion
features. Custom port lists are capped at 32; the connect check is a connect
check and is labelled as one.

## The public-target guard (`functions/_lib/guard.ts`)

Every server-side probe passes through `guardTarget` / `guardUrl` first:

- Hostnames are normalized and rejected if they are `localhost`, blocked
  metadata names, or use local/internal suffixes (`.local`, `.internal`,
  `.lan`, `.home`, `.corp`, `.intranet`).
- IP literals must be public: RFC1918, loopback, link-local (including
  169.254.169.254), CGNAT 100.64/10, multicast, reserved, benchmarking, and
  TEST-NET ranges are all refused, for IPv4 and IPv6 (including IPv4-mapped
  IPv6).
- Hostnames are resolved through DNS-over-HTTPS before contact; if **any**
  returned A/AAAA address is non-public, the probe is refused (DNS-rebinding
  defense).
- HTTP audits follow at most 8 redirects manually and re-run the guard on
  every hop; URLs with embedded credentials are refused.
- The bench's own User-Agent identifies itself:
  `BLACKSITE-WEB/1.0 (+https://nosuchmachine.net/; …)`.

Known limit, stated plainly: after the pre-flight resolution check, the
platform resolver resolves the hostname again when connecting. A target
that races its DNS answers between the two lookups is a residual rebinding
window; the port surface is small (connect checks and HTTPS fetches of
public names) and the check removes the ordinary cases.

## Tool roster

### Via the edge (Pages Functions)

| Route | Tool | What it proves |
| --- | --- | --- |
| `GET /api/dns` | DNS | A/AAAA/CNAME/MX/TXT/NS/SOA/CAA/PTR/SRV/DS/DNSKEY/HTTPS from Cloudflare, Google, and Quad9 in parallel, with DNSSEC AD flags |
| `GET /api/tls` | TLS Inspector | Hand-rolled TLS ClientHello → ServerHello version/cipher + certificate chain parsed from the flight (subject, issuer, SANs, validity, serial, signature algorithm, SHA-256 fingerprint, findings) |
| `GET /api/http-audit` | HTTP Audit | Redirect chain, security-header score (A–F), cookie flag audit, CORS reflection probe with a foreign Origin, header/HTML fingerprint |
| `GET /api/tcp` | Connect Check | TCP connect results (open / closed / filtered-timeout) for the 24 common service ports or a custom list ≤ 32, via `cloudflare:sockets` |
| `GET /api/recon` | Domain Recon | RDAP registration, Certificate Transparency subdomain census (crt.sh), robots.txt Disallow sample, security.txt presence, sitemap size |
| `GET /api/echo` | Mirror (server half) | The visitor's own request as the edge received it: headers (credential headers withheld), TLS version/cipher, ASN/colo/country |

### In the browser (nothing leaves the machine)

JWT inspection + HMAC verification · MD5/SHA-1/SHA-256/SHA-384/SHA-512/HMAC
hashing + file fingerprinting · AES-256-GCM seal/open (PBKDF2-SHA-256,
310k iterations) · password strength + generator · Base64/Base64URL/hex/
URL/HTML/ROT13/binary codecs, hexdump, Shannon entropy · regex bench ·
IPv4 CIDR/subnet calculator with address classification · X.509 certificate
decoder (hand-rolled ASN.1) · payload builder (CRC32, entropy, SHA-256) ·
WebRTC ICE exposure check · browser fingerprint surface · Web Bluetooth
read-only device/service enumeration.

### Honest limits

A website cannot do raw-socket work: no SYN scans, no UDP, no packet
capture, no LAN sniffing, no OS fingerprinting beyond what responses
volunteer. TLS 1.3 encrypts the Certificate message, so the raw-flight
inspector reports that instead of inventing a chain. Connect results are
from a Cloudflare point of presence and can differ from another network.
For everything past that line there is the native instrument,
[nightjar](https://github.com/nightwarelabz/nightjar).

## Session report

Every probe result is appended to the Report panel client-side and can be
exported as JSON or Markdown. The server keeps nothing: no target history,
no accounts, no logging of probe inputs by this codebase.

## Abuse posture

The suite is intentionally a poor weapon: public targets only, tiny port
caps, one GET per hop, self-identifying User-Agent, no concurrency cannon,
no exploitation primitives. Operators are told, on the page itself, to test
only systems they own or are authorized to test.

## phantom: phase1 in the room (2026-10-24)

The operator's own earlier OS — phase1 v7.0.1 (Bryforge/phase1, Rust, terminal-first) — ported to BLACKSITE as **phantom** (renamed from the brief Phase2 — PHANTOM styling at the operator's word: one name, everywhere). The real binary, compiled to `wasm32-wasip1` (995 KB), runs in a Web Worker behind a hand-built WASI preview1 host (`public/phantom/phantom-worker.js`): a memory filesystem (volatile, as phase1's own boot card confesses), clocks, random, and a SharedArrayBuffer stdin ring the window feeds line by line. The port's entire delta against upstream is eight small `cfg` gates — `std::process::id()` and `env::temp_dir()` panic on WASI, `stty` is beneath a browser, the storage helper's `current_exe` likewise — kept as a patch in `tools/phantom/` with the build script that reproduces the binary. It boots the real boot selector, raises the real shell, spawns real simulated processes; host-tool features (git/cargo/python subprocesses, the storage helper) answer with phase1's own refusals, in its own voice. The optics full-screen HUD waits for a later stage; the shipped shell is the cooked line mode, chosen by phase1's own `PHASE1_LEGACY_SHELL_UI` flag. Isolation note: blocking stdin needs SharedArrayBuffer, so the OS scope and `/phantom/*` carry `Cross-Origin-Embedder-Policy: require-corp`.

**The overhaul (waves 1 and 3, 2026-10-24).** The desk was finished as a desk. Every icon is now a drawn house mark (`src/scripts/os-icons.ts` — fifteen glyphs on one 24-unit grid, 1.6 stroke, `currentColor`, re-skinned by the theme): no emoji serves as an icon anywhere in the OS, and the bench's one emoji heading wears the same drawn sun. phantom sits on the desktop board with every other major room. The taskbar was fitted at last (a slim profile at desktop sizes, the phone bar following). Window management became real logic: drag a title bar to an edge and a dashed hint previews the half; release snaps, drag-away restores the remembered rect; the top edge maximizes; Alt+arrow keys tile the focused window. Every open window registers as a desk process (pid, birth, state) — the Processes board leads with that real table, focus and close controls included — and the launcher carries an ACTIONS section (tile all, cascade, close all).

**The light made visible (overhaul wave 11, 2026-10-24).** The final verification caught the depth pass being too shy to see: the desktop accent glow sat mostly off-canvas at low alpha, the focused title-bar wash read as nothing at a glance, and the tool cards' hairline existed only on hover. The glow is now a broad bloom off the top center with a second ember at the lower corner, the wash is strengthened, and the hairline rests faintly visible. The bench hero is and always was the nightjar bird plate — an earlier description of it as the mare was the report's error, not the page's.

**The bench in dress uniform (overhaul wave 10, 2026-10-24).** The suite's panels take a red hairline across the brow, their headings a glowing house stud, output wells sunk with an inner shadow, fields answering focus with the house red, tool cards lighting their hairline on hover, and the hero's mare plate breathing light on a five-second cycle — stilled, like everything, for reduced-motion operators.

**The sound engine (overhaul wave 9, 2026-10-24).** The room has a voice and it is synthesized, not sampled (`src/scripts/os-sound.ts`): oscillators, filtered noise and envelopes — no audio files anywhere. Fourteen voices: the boot swell as BLACKSITE IS NOW LIVE lands, window open/close/minimize/restore, the snap tick, a sent line's thunk, an error's low answer, the EMCON gate's refusal thud (sounded at the gate itself), Relay's arrival ping, the AEGIS trip pulse, and the phantom guest's own beeps as its lamp changes state. Browsers forbid sound before a gesture, so the engine arms on the first pointer or key press and is honestly silent before it. Controls live in Settings (toggle, volume, test) and at the `sound` verb; preferences persist per browser. EMCON alpha silences the engine entirely — total silence means total.

**Ghost completion (overhaul wave 7, 2026-10-24).** The phantom console thinks ahead as the operator types: a dim suggestion stands in the input line, drawn from the guest's OWN registry (the 93 commands and 51 aliases phase1 itself completes from, extracted from its source) with the session's history ranked above the dictionary, and path completion after file commands for the paths the guest's world provably holds. Tab accepts the whole suggestion, Right-arrow accepts it a word at a time, Escape dismisses it for the line as typed; at the boot menu only history speaks. Nothing is ever suggested that the machine would not understand.

**Color, everywhere a terminal speaks (overhaul wave 6, 2026-10-24).** The phantom's renderer no longer drops the guest's colors: SGR is rendered in full — standard and bright palettes, the 256-color cube, truecolor, bold and dim, the pen snapshotted into every cell (proven against a headless harness: palette, mid-line bold toggles, cube math, truecolor sequences longer than the old escape cap, overwrites). The SSH grid already rendered its palette; the blacksite terminal's class palette is completed (ok/warn join dim/err/cmd) and its prints tint the house's verdict marks — a standing gauntlet case reads green, a fallen one red.

**The guest console (overhaul wave 2, 2026-10-24).** The phantom window is built as what it is — a sealed guest machine with an operator's console around it. A state rail carries the machine lamp (raising, boot menu, running, halted, asleep, faulted — read from the guest's own prompts, never faked), a spec plate that states the guest plainly (phase1 7.0.1, Rust, wasm32-wasip1, image 995,163 B, memory volatile, network: none — no wire exists in its world), and wake/halt power (halt asks the guest to shut itself down; the power only cuts when there is no guest to ask). The screen is a framed console display. A quick-key row (boot, help, ls /, ps, plugins, uname, exit) sends real lines for the operator — the same bytes the input line sends, nothing simulated.

## AEGIS — the OS immune system (2026-10-24)

BLACKSITE OS defends its own room. The shell snapshots the whole VFS (boot, five-minute cadence, on demand, and at the first high-entropy overwrite of an existing file — the *entropy-watch* snapshot lands before that write does). A circuit breaker watches the mutation funnels (`write`/`writeBytes`/`remove`): a ransom-note signature in name or content, ten mutations in ten seconds, four existing files turning to near-random noise inside a minute, or a delete of the decoy canary files in `~/documents` trips **containment**. Under containment the real filesystem freezes and every further write lands in the **mirage**, an in-memory overlay the writer reads back as complete success — a ransomware run encrypts a mirage, exhausts itself, and its ransom note is replaced in place by the house's counter-note. The operator restores from a snapshot (`aegis restore`, or the System panel) and loses nothing past the last snapshot; `aegis lift [--adopt]` judges the mirage by hand. Containment and the snapshot ring persist across reloads; the mirage is per-session. Honest scope: AEGIS governs the in-tab room only — it cannot reach an attacker's machine, and claims nothing beyond the room.

## Hardening (2026-10-24 pass)

- Every guarded endpoint's DNS-over-HTTPS lookup carries a 5 s timeout —
  a hung resolver can no longer stall the guard itself; the git proxy's
  upstream fetch is bounded at 120 s like the other bridges.
- Rendering discipline: anything a remote party controls (an SSH server's
  output, an echo payload, IRC traffic) reaches the page as text or as
  escaped, attribute-free spans — never as raw HTML. The SSH screen's
  renderer escapes `<`, `&`, and `>`; the bench's edge chip is composed
  from DOM text nodes.
- Default-scope responses carry `Cross-Origin-Opener-Policy: same-origin`,
  `X-Permitted-Cross-Domain-Policies: none`, and `Origin-Agent-Cluster: ?1`
  alongside the standing CSP/HSTS/nosniff set. The OS scope keeps its
  eval-by-design CSP, deliberately and only there.
- `/.well-known/security.txt` (RFC 9116) tells researchers where to knock.

## The Daylight Bottle plug

BLACKSITE OS carries a Daylight Bottle desk (desktop icon, the `bottle`
verb family, deep link `/#bottle`). Daylight Bottle
(bottle.nosuchmachine.net, from the Wuci-Ji project) is an age-encrypted
message-in-a-bottle service: senders encrypt locally to a recipient from
its static keyring, the server stores ciphertext + public metadata only,
recipients fetch candidates by fingerprint and decrypt locally.

The OS speaks the service's exact wire protocol
(`nsm.daylight-bottle.*.v1`) with the same crypto library
(`age-encryption`), so bottles interlock both ways — proven by decrypting
an OS-sealed bottle with the bottle app's own adapter code, metadata
assertions included. Fingerprints use the service's canon:
`sha256:` of SHA-256 over `nsm.daylight-bottle.key.v1\n<keyname>\n<age recipient>`.

The service sends no CORS headers by design, so service calls ride
`functions/api/bottle.ts`, a same-origin bridge to a fixed destination
(keyring, list, evidence, and schema-validated drops only — no
caller-supplied URLs). The bottle Worker remains the authority: it
re-validates every drop, enforces keyring membership, and applies its own
rate limits. Plaintext and private identities never leave the browser;
the OS keeps an identity in memory unless the operator explicitly saves
it into the virtual filesystem. Under EMCON, drops are an active
transmission (refused at Bravo/Alpha); reads stand down at Alpha.
