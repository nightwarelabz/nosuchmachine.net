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

## The Daylight Bottle plug

BLACKSITE OS carries a Daylight Bottle desk (desktop icon, the `bottle`
verb family, deep link `/blacksite/#bottle`). Daylight Bottle
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
