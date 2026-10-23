# NIGHTWARE LABZ

The home of NIGHTWARE LABZ and nightjar, Chase Bryan’s native network instrument for iPhone and Mac.

**Production domain:** [nosuchmachine.net](https://nosuchmachine.net)

## Structure

- The homepage introduces nightjar, its network instruments, and Skelli, then gives visitors a clear installation path. Releases, source code, and the installation manual use the canonical `nightwarelabz/nightjar` repository.
- The NIGHTWARE LABZ identity uses the project's existing stallion and wordmark, black and steel surfaces, silver type, and crimson accents. Product claims and asset provenance are recorded in [Nightjar sources](docs/nightjar-sources.md).
- Installation copy distinguishes an iOS release package, which still needs suitable signing, from building the native iPhone and Mac apps with Xcode. It does not imply an App Store listing, a Mac binary download, or a universal one-tap install.
- The lab section retains a path to Orange and the Orange Book. Existing homepage anchors remain available for incoming links.
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
