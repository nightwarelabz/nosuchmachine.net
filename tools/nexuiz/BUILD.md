# Nexuiz Classic for BLACKSITE — engine build provenance

The client shipped under `public/nexuiz/` is the **actual DarkPlaces
engine**, compiled from its real source tree to WebAssembly, running
the **actual Nexuiz 2.5.2 release data** (hashes pinned in
`public/nexuiz/NOTICE.txt`). Nothing about the engine or the game was
re-implemented. This file records exactly how the shipped binaries
were produced, so the build is reproducible and every deviation from
stock is on the record.

## Engine

- Source: `github.com/xonotic/darkplaces` (the maintained DarkPlaces
  tree), commit `d93f9c4292039354a2b8d40d11bc386891e55fe5`.
- Toolchain: Emscripten **6.0.13** (emsdk, commit
  `e13ee988ce3d87a738dd8f3661d02223308c412a`), clang targeting
  wasm32, SDL 2.32.10 via the Emscripten port.
- Target: the tree's own `make emscripten-release` → `darkplaces-wasm.js`.
- Engine C sources: **one patch file** — inserted lines across
  `snd_main.c` and `gl_backend.c` (two `#ifdef` guard pairs,
  plus the GLES2 framebuffer-bind repair in
  R_Mesh_CreateFramebufferObject), one modified line in
  `gl_textures.c` (the GLES2 framebuffer color format), and
  two modified lines in `shader_glsl.h` (shader constants
  spelled as float literals so strict GLSL ES 1.00 compilers
  accept them — see the deviation register for all of it),
  saved beside this file as `engine-patches.patch` (guards:
  adjustment 3). Everything else is the tree's own build-system
  surface (make variables), plus the loader pre-js
  (`tools/nexuiz/pre.js`, derived from the tree's `wasm/pre.js`,
  GPL like the engine). `git diff --stat` on the build checkout
  shows exactly those four files: 21 insertions, 3 deletions.

## The build-system adjustments

1. **GL flavor: the tree's stock ES flavor, with its define carried
   in `CFLAGS_EXTRA`.** The wasm target's `-DUSE_GLES2` normally
   comes from a block in `makefile` that the two-level make does
   not reliably deliver when `CFLAGS_EXTRA` is given on the command
   line (measured across three builds: with a command-line
   CFLAGS_EXTRA, the block's tokens vanish from the level-2 compile
   lines entirely). So the define — and `-DNOSUPPORTIPV6`, from the
   same block — ride in the command-line flags instead, where their
   presence in every compile line is verified in the build log.
   The flavor itself matters, also measured: the engine's
   desktop-profile request (CORE 3.2) cannot be served here at
   all — SDL's EGL layer requires the EGL_KHR_create_context
   extension for versioned core requests, Emscripten's EGL does
   not advertise it, and context creation dies in SDL before EGL
   is ever called ("context attributes are not supported"). The
   ES-profile request is the working shape (an SDL probe against
   the same port + flags shows ES requests yielding a WebGL2
   ES 3.0 context).
2. **Decoder link flags** via `CFLAGS_EXTRA` (see the command
   below): `-DLINK_TO_LIBJPEG` + `-DLINK_TO_LIBVORBIS` flip the
   engine's jpeg and ogg/vorbis support from its runtime-dlopen
   flavor (which cannot resolve on the web, and would have silently
   killed all JPEG textures and all OGG audio) to static linking —
   the engine's own supported configuration. `-DHAVE_BOOLEAN
   -Dboolean=int` is the documented pairing for the Emscripten
   libjpeg port's jpeg-9 headers (`jmorecfg.h`: "Defining
   HAVE_BOOLEAN before including jpeglib.h should make it work");
   without it, jpeg.c's static path fails to compile against the
   port's enum-typed `boolean`.
3. **Video capture OFF (the tree's own `DP_VIDEO_CAPTURE=disabled`
   switch), plus the port's engine-source guards.** Capture —
   desktop video recording to .avi/.ogv — is not a gameplay
   feature, and at this commit the GLES2 flavor cannot compile it:
   its readback paths use desktop-GL entry points the ES header
   set does not declare. Two unguarded desktop-GL usages remain
   outside capture, both fixed with the tree's own guard idioms
   (the guard hunks of `engine-patches.patch` beside this file —
   8 inserted lines, none modified):
   - `snd_main.c`, `S_PaintAndSubmit`: the capture-off
     configuration's one unguarded use of the capture state.
     Every sibling site (e.g. `cl_main.c`) guards the same member
     with `#ifdef CONFIG_VIDEO_CAPTURE`, and the member itself
     only exists under that define. Behavior is unchanged either
     way (with capture off, the clause was simply always false).
   - `gl_backend.c`: the GL debug-output callback and its
     registration. `glquake.h` declares everything they use only
     in its `#ifndef USE_GLES2` half, and the registration is
     runtime-gated on `vid.support.arb_debug_output`, which the
     ES path never sets — the guarded code could never execute
     in this flavor. The guard is the header's own condition.
   The GL constant defines in the build command (`-DGL_BGRA=…`
   etc.) are the remaining GLES2-header gaps in other files,
   with values taken verbatim from the fallback block in the
   engine's own `glquake.h`.

## Media decoder census (verified on the built objects with llvm-nm)

| format | files in data | decoder in this build |
|---|---|---|
| TGA | 5,057 | engine-native loader |
| JPG | 2,188 | **static** libjpeg (Emscripten port) — `jpeg.o` holds direct `jpeg_CreateDecompress`/`jpeg_read_scanlines` refs |
| OGG | 538 | **static** libvorbisfile 1.3.7 + libvorbis 1.3.7 + libogg 1.3.5, built from the Xiph tarballs with the same emcc (sha256 below) — `snd_ogg.o` holds direct `ov_open_callbacks`/`ov_read` refs, no dlopen |
| WAV | 80 | engine-native loader |
| PNG | **4** | **not decoded** — deviation, see below |

The one decoder deviation: PNG. This tree's `image_png.c` is
dynamic-load-only (there is no static path in the source at this
commit), and a native libpng cannot be dlopen'd in a browser. The
data carries exactly 4 PNG files of 9,341 —
`models/sprites/nb-ball.png`, `particles/particlefont-template.png`
(a template, unused at runtime), and
`textures/water/cheapwater-blue.png` /
`textures/water/cheapwater-fire.png` (low-end water fallbacks).
Everything else the game shows is TGA/JPG engine-native.

XMP (tracker modules) is likewise the tree's dlopen flavor and is
not linked; no Nexuiz 2.5.2 content uses it (all music is OGG).

## Exact build command

```
# libogg 1.3.5 (tarball sha256 0eb4b4b9420a0f51db142ba3f9c64b333f826532dc0f48c6410ae51f4799b664)
# libvorbis 1.3.7 (tarball sha256 0e982409a9c3fc82ee06e08205b1355e5c6aa4c36bca58146ef399621b0ce5ab)
#   both: emconfigure ./configure --prefix=<xiph-wasm> --disable-shared --enable-static
#         emmake make && emmake make install     (vorbis also: --disable-oggtest)

make -j2 emscripten-release DP_VIDEO_CAPTURE=disabled \
  CFLAGS_EXTRA="-DLINK_TO_LIBVORBIS -DLINK_TO_LIBJPEG -DHAVE_BOOLEAN -Dboolean=int -DUSE_GLES2 -DNOSUPPORTIPV6 <the 24 GL constants of adjustment 3> -I<xiph-wasm>/include" \
  LDFLAGS_WASMJS='$(LDFLAGS_UNIXCOMMON) -s USE_SDL=2 -s USE_LIBPNG=1 -s USE_LIBJPEG=1 -s USE_ZLIB=1 \
    -s INITIAL_MEMORY=128mb -s MAXIMUM_MEMORY=2gb -s FULL_ES3 -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 \
    -s ALLOW_MEMORY_GROWTH=1 -s ASSERTIONS=1 -s STACK_SIZE=8mb -lidbfs.js \
    --pre-js tools/nexuiz/pre.js \
    -s EXPORTED_RUNTIME_METHODS=callMain,addRunDependency,removeRunDependency \
    <xiph-wasm>/lib/libvorbisfile.a <xiph-wasm>/lib/libvorbis.a <xiph-wasm>/lib/libogg.a'
```

- vs. the tree's stock `LDFLAGS_WASMJS`: `SINGLE_FILE` dropped (the
  house serves the .wasm beside the .js); assertions stay ON (the
  tree's default).
- Shipped artifacts (2026-10-25 build): `darkplaces-wasm.js`
  sha256 `0ea5a57597c4d045d8dd8365fa439d19e6ece3392bfa46091d56cebe8c1fd1a2`,
  `darkplaces-wasm.wasm` sha256
  `9af941032880ad7482ecda43a2f0a03defc5d57e6eae21ebd7bd3cb4c32bccec`.
  The glue was **relinked the same day** with the caching loader
  (the `tools/nexuiz/pre.js` in this tree — persisted packs, local
  verification; see "Storage and caching" below): same objects,
  same flags, same command, only the `--pre-js` input changed.
  The build is deterministic — a control relink with the original
  pre.js reproduced both artifacts byte-for-byte — and the wasm
  is unchanged. Current glue sha256:
  `8d3f2138c8e87e33ecd402a13ae5eb1ffdb0643d0bba7dc5fd565ee2cab9f59c`.

## Deviation register (engine + data)

- Engine C sources: **one patch file** (`engine-patches.patch`
  beside this file): 8 inserted #ifdef-guard lines across
  `snd_main.c` + `gl_backend.c` (see adjustment 3); a
  10-line framebuffer repair in `gl_backend.c`'s
  R_Mesh_CreateFramebufferObject — the GLES2 flavor generated
  a framebuffer but never bound it before attaching its
  textures (the desktop path binds through
  R_Mesh_SetRenderTargets, which this flavor excludes), so
  every rendertarget stayed incomplete
  (glCheckFramebufferStatus 36054) and the rendered scene
  never reached the screen: the patch binds the new
  framebuffer for attachment and restores the tracked binding
  before returning, the tree's own idiom; one modified
  line in `gl_textures.c`'s GLES2 table — the framebuffer
  colorbuffer format was GL_RGB565 uploaded as
  (GL_RGBA, GL_UNSIGNED_SHORT_5_6_5), a combination WebGL2
  rejects with INVALID_OPERATION, which left the screen
  rendertarget's color texture imageless (framebuffer
  incomplete, scene black); the row now uses the classic
  GL_RGBA / GL_UNSIGNED_BYTE combination (RGBA8 storage,
  strictly more color precision than the 565 it replaces);
  and two
  modified lines in `shader_glsl.h`, both the same class:
  constants spelled with integer literals in float expressions
  the strict GLSL ES 1.00 compiler rejects — the `sat()` macro's
  `clamp(x, 0, 1)` ("'clamp': no matching overloaded function
  found") and a `#define lightcolor 1` multiplied into vec3
  lighting ("'*': wrong operand types … const int"). Every lit
  world shader failed to compile and the 3D view drew black.
  They are now `clamp(x, 0.0, 1.0)` and `1.0` — the same values
  the desktop compilers silently convert to.
  Video capture is configured off via the tree's own switch.
  No other changes.
- Data packs: **none** — byte-for-byte the release packs, SHA-256
  verified in the loader before the engine starts.
- Game logic (QuakeC progs): the server and client progs are the
  ones inside the release pack, untouched. The **menu** progs
  carries two tracked house patches — `house-qc-patch-008.diff`
  and, stacked on it, `house-qc-patch-009.diff`, both beside
  this file — shipped as the override pack
  `public/nexuiz/sparta-menu.pk3` (see the menu section below
  and NOTICE.txt): the Settings surface is locked to the player
  name, the main menu draws the build's rezzmodV1 tag, and the
  Multiplayer dialog carries the house room's front door — the
  game boots to its menu, and the room is entered there.
- House layer: configuration only — `public/nexuiz/autoexec.cfg`
  (MinstaHook cvars, the way real servers were run), the loader
  transport, and the OS window. One platform cvar rides in it:
  `sys_usesdlgetticks 1` — measured: with the engine's default
  clock_gettime source under Emscripten, Sys_UpdateTime reported
  steps to 4294967297.0 s and the frame delta collapsed (the
  menu's frametime fade never advanced; the menu drew black).
  The engine's own SDL_GetTicks() timer switch is monotonic in
  the browser; with it the full menu renders (drive-verified).
  A second platform cvar rides beside it:
  `mod_q3bsp_lightgrid_texture 0` — the GLES2 path cannot
  stretch-upload a 3D texture and the engine faults in
  R_UploadFullTexture ("lightgrid") on Q3 BSP map load; the
  cvar (the engine's own) keeps lightgrid lighting at entity
  origins without the global texture upload.
- Build configuration: the two adjustments above, and PNG/XMP
  decoding absent as recorded.
- The generic engine build reports its game as "DarkPlaces-Quake"
  in the console (the Nexuiz data dir rides as `-game data`); the
  game itself — menus, progs, media — is Nexuiz's own.

## Storage and caching — what a player's machine keeps

The rule (Chase's): nobody re-downloads what the machine already
has, and the OS owns the storage story. The loader
(`tools/nexuiz/pre.js`) and the play frame (`public/nexuiz/play.js`)
keep it together:

- **One copy at rest.** The Cache API (`nexuiz-data-v1`) holds the
  data in two shapes, never both at rest: the compressed chunks
  are transport staging for the first download (they keep an
  interrupted download resumable), and once a pack is verified
  whole, the pack itself is stored as one entry and its staging
  chunks are deleted. Chunk fetches go out with
  `cache: "no-store"` so the browser's HTTP cache does not quietly
  keep a second copy of the spans (it did: ~850 MB duplicated,
  measured in the cache audit,
  `~/workspace/nexuiz-research/cache-audit/`). The packs
  deliberately do NOT ride an IDBFS mount: IDBFS whole-file sync
  hands IndexedDB one ~900 MB record per file, and the store
  refused it in the audit rig (the loader's fallback fired; the
  game played from the staging cache) — IDBFS keeps the engine's
  user dir, whose files are small.
- **Warm boot verifies locally.** A kept pack that matches its
  pinned size is SHA-256-verified from the kept bytes and written
  into the filesystem — no wire, no inflater. A pack that fails
  size or hash is deleted and fetched fresh — the refusal
  discipline is unchanged, the verdict just comes from local
  bytes.
- **Degradation is honest.** If any store refuses (quota,
  private mode), the loader falls a rung — kept pack, then
  staging chunks, then the wire — and says so in the console.
  Storage failure never closes the game.
- **The OS asks for persistence.** `buildNexuiz`
  (`src/scripts/os-nexuiz.ts`) calls `navigator.storage.persist()`
  when the game window is first built. The grant is the browser's
  heuristic, not a promise — where it is refused, eviction remains
  possible under storage pressure, which is the platform's limit,
  not the design's.
- **In-session downloads commit.** The user dir's IDBFS mount
  runs with `autoPersist: true` — without it the mount syncs only
  on an explicit `FS.syncfs` (a clean engine shutdown, in
  practice), and a mid-session download would die with the tab;
  with it, the filesystem queues a sync at the end of any frame
  that changed a file, so a finished download commits itself
  (audit-proven: an engine-written file survives a SIGKILL of the
  browser). The play frame additionally flushes on `pagehide`
  (`Module.houseSyncFS`) — belt over braces for the graceful
  close.
- **Engine binaries are immutable — under a stamp.** The two
  engine files are served `Cache-Control: public,
  max-age=31536000, immutable` (see `public/_headers`). That is
  only safe because `play.js` carries `NX_ENGINE_STAMP` and
  appends it to both engine URLs (the glue script's `src`, and the
  wasm via `Module.locateFile`). **Rule: whenever
  `darkplaces-wasm.js` or `darkplaces-wasm.wasm` is rebuilt or
  replaced, bump `NX_ENGINE_STAMP` in `public/nexuiz/play.js` in
  the same change.** play.js, play.html and `autoexec.cfg` are
  deliberately NOT immutable — they revalidate every visit, which
  is how loader and tuning changes reach players; the autoexec is
  re-fetched each boot, with a fall back to the kept copy when the
  fetch fails.

## Menu progs override (sparta-menu.pk3)

The house menu is rebuilt from the release's own sources —
`qcsrc/` inside `gamesource20091001.zip` (the source archive of
the same verified release) — with the era's own compiler, the
fteqcc binary the archive itself bundles
(`fteqcc/fteqcc-linux-x86_64`, rev 1253299209):

```
cd qcsrc/menu
fteqcc -O1 -Oreturn_only -Ostrip_functions   # writes ../../menu.dat
zip -9 sparta-menu.pk3 menu.dat              # single entry, at the root
```

With `house-qc-patch-008.diff` and then `house-qc-patch-009.diff`
applied to the sources first (`patch -p1`, from the qcsrc root's
parent — they apply clean in order and reproduce the compiled
tree exactly), the output is the shipped override: menu.dat
SHA-256
`2444a040d1780cc7f960918c2e2db989cd745357ba658a8b00179e8b5acb9a53`,
pk3 SHA-256
`1ecf5d09ff61c5b614685dfe7d66710b0484272b22b159db1e8ac031d8c1435a`.
Patch 009 alone (one file, `dialog_multiplayer.c`) adds the
room's door to the Multiplayer dialog; measured against the
patch-008 build it moves the header CRC not at all (still
10020), changes exactly one function's statement stream
(fillNexuizMultiplayerDialog, +16 statements — the net program
delta), adds two anonymous string globals (the door's label and
command), and leaves the field definitions identical.

Unpatched, the same recipe reproduces the shipped menu.dat's
engine-visible contract exactly — header CRC 10020, and the
strings, field-definition, global-definition and
initial-global-data sections byte-identical; the function table
keeps its shape (1,010 functions, same names, order and
parameter metadata). Only the compiled statement streams
differ, in 168 of 1,010 functions and only in function-exit
encodings (the opcode census there is confined to DONE, RETURN,
IF, IFNOT, GOTO): the release's fteqcc was two weeks younger
than the bundled revision and does not survive, so code-section
byte-identity is not claimed — see NOTICE.txt for the full
parity statement.
