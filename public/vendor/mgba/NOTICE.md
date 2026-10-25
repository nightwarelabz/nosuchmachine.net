# nocturn-gba core — provenance & license

The emulator core vendored in this directory is **mGBA**, compiled to
WebAssembly by the `@thenick775/mgba-wasm` package:

- Package: `@thenick775/mgba-wasm` **2.6.0** (npm registry tarball
  `mgba-wasm-2.6.0.tgz`)
- Contents vendored here: `dist/mgba.js` (248,854 bytes) and
  `dist/mgba.wasm` (1,852,041 bytes), unmodified. The package's source
  map was not vendored.
- Upstream: mGBA by Jeffrey Pfau (endrift) — https://mgba.io
- Wasm fork: https://github.com/thenick775/mgba (branch `feature/wasm`);
  this build powers the gbajs3 frontend.
- License: **Mozilla Public License 2.0** — the full text rides in
  `LICENSE` beside this file. mGBA itself is MPL-2.0.

## BIOS

No BIOS file is vendored, needed, or accepted by this bench. mGBA runs
on its own built-in **HLE BIOS** (a clean-room reimplementation of the
GBA boot ROM's services). The large majority of software runs on it; a
handful of titles that depend on exact BIOS timing or rarely used SWI
behavior can behave differently than on a dumped BIOS. That is the
honest state of the machine, stated here rather than discovered.

## Runtime requirements

The core is threaded: it needs a cross-origin-isolated page
(`Cross-Origin-Opener-Policy: same-origin` +
`Cross-Origin-Embedder-Policy: require-corp`), which the OS scope of
this site already serves; this subtree carries its own matching
`_headers` scope, as the other vendored machines do.

## Storage

The core keeps its own virtual filesystem (ROM library, battery saves,
save states, the demo cart) in the browser's IndexedDB for this origin
(Emscripten IDBFS). Nothing leaves the machine; the bench makes no
network calls of its own.
