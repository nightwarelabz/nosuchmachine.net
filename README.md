# NIGHTWARE LABZ — BLACKSITE WEB

**nosuchmachine.net is a working pentest bench, not a brochure.** The homepage is BLACKSITE OS itself; the bench suite lives at `/bench/`. The homepage is
BLACKSITE WEB: the [nightjar](https://github.com/nightwarelabz/nightjar) Blacksite
bench rebuilt for the browser — DNS, TLS, HTTP security grading, TCP connect
checks, domain recon, JWT/certificate inspection, hashes, codecs, subnet math,
payloads, and a self-audit mirror — running on Cloudflare Pages + Pages
Functions. See [docs/blacksite-web.md](docs/blacksite-web.md) for the full
architecture, the tool roster, and the safety guard.

**Production domain:** [nosuchmachine.net](https://nosuchmachine.net)

**Doctrine: one knock, read, grade.** The bench recons and grades; it does not
exploit, spray, brute-force, or flood. Server-side probes only touch public
targets — private, loopback, link-local, CGNAT, and cloud-metadata addresses are
refused in `functions/_lib/guard.ts` before contact and on every redirect hop.

## Structure

- The OS also carries a **Daylight Bottle desk**: the age-encrypted
  message-in-a-bottle service (bottle.nosuchmachine.net) plugged into the
  room — mint/load an age identity, seal and drop bottles to keyring
  recipients, fetch and open an inbox — speaking the service's exact
  `nsm.daylight-bottle.*.v1` protocol through a same-origin edge bridge
  (`functions/api/bottle.ts`), because the service deliberately sends no
  CORS headers. Plaintext and identities never leave the browser.
- `/` (and its alias `/blacksite/`) is **BLACKSITE OS**: the nightjar console ported whole — a
  windowed web OS (boot, desktop, taskbar, process board) with a real shell
  over a persistent virtual filesystem, pipes/redirects/jobs, the full
  426-command Blacksite roster from nightjar's own generated reference
  (`src/data/blacksite-commands.json`) with each command LIVE, EDGE, or a
  named LIMIT, Python (vendored Skulpt) and JavaScript engines, a
  vim-mannered editor, the Wave-10 file parsers, the Gauntlet self-test
  battery, EMCON gating, themes, and room-generated wallpapers. Its wire
  verbs ride the same guarded edge functions (`/api/fetch`, `/api/exchange`,
  `/api/ping` included: one connection, ≤4KB spoken, ≤64KB read).
- The bench page (`src/pages/bench/index.astro`, served at `/bench/`) is the suite console: a global target
  bar with a one-click full battery, a tool rail, and a session Report with
  JSON/Markdown export. Network probes live in Cloudflare Pages Functions under
  `functions/api/` (`dns`, `tls`, `http-audit`, `tcp`, `recon`, `echo`); local
  tools live in `src/scripts/lab.ts` and never send input anywhere.
- The TLS Inspector's certificate chain comes from a hand-rolled TLS
  ClientHello parsed at the edge (`functions/api/tls.ts`); TLS 1.3's encrypted
  Certificate message is reported honestly rather than faked.
- The native instrument still exists and still out-ranges the web: nightjar for
  iPhone/Mac (BLE listening, pcap dissection, listeners, encrypted messaging)
  builds from source with Xcode; iOS packages still need signing/provisioning.
  The suite links to the canonical `nightwarelabz/nightjar` repository,
  releases, and get-started guide rather than advertising over them.
- Legacy homepage anchors (`#hero`, `#instrument`, `#skelli`, `#get-started`,
  `#lab`, `#about`, `#work`, `#current`) are retained as hidden anchors for
  incoming links.
- The complete Orange Book is hosted at `/book/`, with a table of contents, 24 chapter pages, chapter navigation, section links, and local full-text search. The reader follows the original manuscript's order, including its preface, appendices, manuscript map, and source disclosure.
- All 40 existing project pages remain available at `/projects/<slug>/`, with their purpose, implementation, maturity, limitations, repository, and documentation links.
- `src/data/catalog.json` owns the project content. The [repository inventory](docs/repository-inventory.json) and [review report](docs/portfolio-review.md) record the public-repository review and earlier curation decisions.
- `src/data/book.json` records the book's publication metadata and chapter order; `src/content/book/` contains the generated chapter Markdown. The full upstream manuscript is retained in `vendor/orange/THE_ORANGE_BOOK.md` and available to download at `/book/orange-book.md`.
- The sitemap includes the catalog and all hosted book pages. Executable scripts must remain external to comply with the existing Cloudflare content-security policy.

## Develop

```sh
# Node 22.23.3 (.nvmrc). engines.node is >=22.23.3 so the locked undici floor (>=22.19.0) is met.
npm ci
npm run dev
npm run check
npm run build
npm run verify
npm run preview
```

`verify` confirms the NIGHTWARE LABZ / nightjar identity, homepage section anchors, source and release destinations, installation guidance, and retained Orange and book links. It checks every hosted book chapter, reading order, previous/next links, active chapter navigation, search-index coverage, and consistency with the vendored manuscript. It also checks unique catalog slugs, all generated project routes and source references, sitemap entries, internal links and anchors, image/script assets, unique IDs, one main landmark and heading per page, and CSP-compatible script output. CI runs the type check, build, and this integration check.

## Update the Orange Book

The hosted edition is pinned to Orange Book v0.26, snapshot October 2, 2026, from Orange revision [`4394a66201ff59d73bdd1dea38637bf9b7f37421`](https://github.com/chasebryan/orange/commit/4394a66201ff59d73bdd1dea38637bf9b7f37421). Builds use the committed manuscript and chapters without fetching upstream content, so the book remains available independently of GitHub.

To import a newer edition from a local Orange checkout with a clean `docs/THE_ORANGE_BOOK.md`:

```sh
npm run sync:book -- --repo /path/to/orange
npm run check
npm run build
npm run verify
```

Review and commit the updated vendored manuscript, downloadable source, metadata, and chapter files together. The import records the source commit, preserves chapter URLs, and rewrites manuscript-relative links for the hosted reader. If a new edition changes the section structure, update the chapter map and descriptions in `scripts/sync-orange-book.mjs` and the pinned chapter count in `scripts/verify-build.mjs` as part of that edition review.

`npm run sync:book` regenerates chapters from the committed manuscript. `npm run sync:book -- --check` checks the generated metadata and chapters without writing files or accessing the network.

## Deploy

https://nosuchmachine.net is served by Cloudflare Pages Git integration on project `nosuchmachine-net`. The apex and www resolve to Cloudflare anycast addresses, and responses include `server: cloudflare` and `cf-ray`. There is no GitHub Actions deploy workflow. GitHub Pages is not enabled, and `.github/workflows/deploy-github-pages.yml` and `public/CNAME` have been removed so Pages cannot claim the hostname.

The dashboard build command is `npm run build:pages`. That script syncs the book, typechecks, builds, and verifies, and it stops on the first failure (`&&`), so a book sync that cannot reach Orange never publishes `dist`. Build output is `dist`. Node is `22.23.3` from `.nvmrc`.

Production apex `https://nosuchmachine.net` is a **Cloudflare** zone. Historically it was published by Cloudflare Pages project `wuci-ji` from [`chasebryan/-wuci-ji`](https://github.com/chasebryan/-wuci-ji). This repository is now the source of truth for the public portfolio.

`bottle.nosuchmachine.net` remains a separate Cloudflare Worker in `-wuci-ji` — do not remove that subdomain.

### Cloudflare Pages

1. Workers & Pages → `nosuchmachine-net` → Settings → Builds: build command `npm run build:pages`, build output directory `dist`.
2. The Pages build image reads `.nvmrc` (same setting as `NODE_VERSION`). Confirm the build log uses Node `22.23.3`. The v3 image defaults to `22.16.0` when nothing pins Node, which is older than `engines`. If a log shows that default, set environment variable `NODE_VERSION` to `22.23.3` for Production and Preview.
3. Custom domains stay on `nosuchmachine-net`: `nosuchmachine.net` and `www.nosuchmachine.net`. Remove those hostnames from the old `wuci-ji` project if they are still attached.
4. Book rebuilds: Settings → Builds → Add deploy hook, branch `main`. Orange posts that URL; do not put the URL in this repo.
5. Keep Always Use HTTPS and HSTS on the zone. `bottle.nosuchmachine.net` is a separate Worker; do not change it.

GitHub Pages is retired for this site. Do not turn Pages back on for `nosuchmachine.net`.

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).
