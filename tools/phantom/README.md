# phantom · the phase1 web port

`public/phantom/phantom.wasm` is phase1 v7.0.1 (github.com/Bryforge/phase1,
edge/stable @ fb33abf) compiled for `wasm32-wasip1`, hosted in BLACKSITE
OS by `public/phantom/phantom-worker.js` (the WASI world) and
`src/scripts/os-phantom.ts` (the glass).

## The delta

Eight small `cfg!(target_family = "wasm")` gates, nothing else —
`phase1-phantom.patch` is the whole of it:

- `std::process::id()` panics on WASI ("unsupported") — the kernel's
  two seed sites and one wasm-runtime site answer `1` in the room;
  the sim keeps its own PID space regardless.
- `std::env::temp_dir()` panics on WASI — five feature sites answer
  `/tmp`, which the host maps to its memory filesystem.
- `stty` cannot exist in a browser, and std's PATH search for it
  panics before the call can fail — the two compiled `stty` helpers
  refuse on wasm, which drops every raw-mode consumer onto the
  cooked line path phase1 already maintains (its own
  `PHASE1_COOKED_INPUT` flag is the same idea, set by the host too).
- The storage helper's `std::env::current_exe()` is gated off; the
  helper binary does not exist in the room, and phase1 says so in
  its own words.

Everything else — subprocess calls included — already degrades
gracefully on WASI: `Command` returns `Err(Unsupported)`, and phase1
reports its host-tool features unavailable in its own voice. Those
stay honest limits, not stubs.

## Rebuild

    git clone https://github.com/Bryforge/phase1 && cd phase1
    git checkout edge/stable
    git apply /path/to/phase1-phantom.patch
    tools/phantom/build-phantom.sh .

## Host contract

The worker provides WASI preview1: args, env (legacy shell UI +
cooked input flags set), clocks, random, stdio over a
SharedArrayBuffer ring (64 KiB at byte 64; header Int32 [write seq,
read seq, closed, pad]), and a memory filesystem preopened at `.`
and `/tmp`, seeded with `public/phantom/plugins/*.py`. Sockets are
NOTSUP by construction. Blocking stdin is why the OS scope carries
`Cross-Origin-Embedder-Policy: credentialless`.
