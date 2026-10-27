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
- Data packs: the files inside the served pack are byte-for-byte
  the release packs' own (see the stripped-data section below);
  the pack itself is a house-built subset of the release data,
  hash-pinned in NOTICE.txt. The full-data deal it replaced is
  the documented fallback in that section.
- Game logic (QuakeC progs): the server and client progs are the
  ones inside the release pack, untouched. The **menu** progs
  carries six tracked house patches — `house-qc-patch-008.diff`
  and, stacked on it, `house-qc-patch-009.diff`,
  `house-qc-patch-010.diff`, `house-qc-patch-011.diff`,
  `house-qc-patch-012.diff` and `house-qc-patch-013.diff`, all
  beside this file — shipped as the override pack
  `public/nexuiz/sparta-menu.pk3` (see the menu section below
  and NOTICE.txt): the Settings surface is locked to the Player
  page (the name field, and the mouse sensitivity control
  patch 013 restores there), the main menu draws the build's
  haxiuz tag and — patch 012 — the house banner where the
  stock plate stood, and the Multiplayer dialog carries the
  house room's front door: the boot deals the room's connect
  itself (the auto-join, restored in the play frame), and the
  door is the manual road back in.
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

## Stripped data — the haxiuz pack, and the full-data fallback

haxiuz plays one session — CTF MinstaHook on evilspace — so the
site serves a stripped data pack instead of the release's whole
data universe:

- `data/haxiuz.pk3` — **99,228,456 bytes, 1,528 files**, SHA-256
  `10018c6a19fee310c70504952691fb21748ff5d1412c4f1271ff7de658d7f5b3`
  (pin of record in `public/nexuiz/NOTICE.txt`), dealt in
  `public/nexuiz/play.js` as a span entry on the data pipe
  (`part: "haxiuz"`, `spanLength: 98509217`), the road the full
  packs took before it. The strip's first deal carried the pack
  as a plain site file, but Cloudflare Pages caps static assets
  at 25 MiB — a 99 MB pack cannot deploy as one — so the pack
  rides the pipe: its container is `haxiuz-release.zip`
  (**98,509,335 bytes**, SHA-256
  `f00dc045337d245bc3be901763d1fe7607112f383bc64abcc9611f33f8a252f1`),
  a release asset on the haxiuz repo (tag `data-1`) whose single
  deflated entry is the pack itself; the pack's span inside it
  starts at offset 40 and runs 98,509,217 bytes, and inflating
  it reproduces the pack byte-for-byte. `NX_DATA_STAMP` in
  play.js names the pack build's generation — **bump it
  whenever the pack is rebuilt**, in the same change that
  updates the span and the pin here, in play.js, in the pipe
  (`functions/api/nexuiz-data.ts`) and in NOTICE.txt: a changed
  stamp makes the play frame's cache sweep retire the previous
  build's `part=haxiuz` staging chunks and kept pack, so a
  rebuilt pack never assembles out of an older build's bytes.
- Contents are a measured census, not a hand list: the era
  native client was run against the full release data unpacked
  loose (menu boot; a full local CTF MinstaHook bot match on
  evilspace under the house rules, with working audio so the
  sound loads count) under `strace`, and every file it opened is
  in the pack — closed out with what the engine loads beside an
  open: model `.skin`/`.sounds`/`.framegroups` companions and
  LODs, texture variant sets (`_norm`/`_glow`/`_gloss`/…),
  randomized sound variants, every player model (the gamecode
  precaches them all at match start —
  `qcsrc/server/miscfunctions.qc`, `sv_precacheplayermodels`),
  the item models and their texture families, all shader
  scripts, and common-spog's files merged in. The pack was then
  played the same way and its console censused against the full
  data's console: the only lines left are the ones the full data
  prints too (the `.zym.animinfo` probe, the palette fallback,
  the `.wav`→`.ogg` sound probes). Two misses the first census
  caught and repaired are the standing warning: files a session
  reaches only sometimes (an item model, its pickup sounds) do
  not appear in any single run's opens — precache lists in the
  pinned QC are the second source, and any rebuild must check
  both.
- What a returning player's machine keeps changes with the deal:
  the old kept packs and staging chunks sit in the
  `nexuiz-data-v1` cache under the old span parts' keys. play.js
  deletes exactly those keys at boot (the stripped pack's own
  keys are its part's own — `part=haxiuz` staging chunks and the
  kept pack under the same part — and the small house files are
  untouched), so the ~900 MB the full deal kept does not linger
  as dead weight, and no stale full-data entry can ever be
  mistaken for the stripped set — the loader only ever reads
  the keys the current deal names. On a data-build generation
  change (`NX_DATA_STAMP`, above) the sweep retires the
  previous build's `part=haxiuz` keys as well; the loader's
  SHA-256 verdict over kept and assembled bytes stands behind
  the sweep either way.

**Fallback — restoring the full-data deal.** If a miss ever
surfaces in the stripped pack (a console line naming a file the
session reached for and did not find), the full data is one
edit away and needs nothing rebuilt:

1. In `public/nexuiz/play.js`, replace the
   `"data/haxiuz.pk3"` entry in `Module.files` with the two
   original span entries, verbatim:

   ```js
   "data/data20091001.pk3": {
     part: "data", spanLength: 880493625, size: 887580846,
     sha256: "3ec238441a4886b44a12134cf89f45b3d9be59359d4a089773f7996b8d4bd6c0",
   },
   "data/common-spog.pk3": {
     part: "spog", spanLength: 24638, size: 28724,
     sha256: "d098b071c88447914ec6e9f17f8b57327399e91b011699d20a39e6452949780c",
   },
   ```

2. Nothing else moves: the data pipe
   (`functions/api/nexuiz-data.ts`) still stands with the
   full-data parts' pins unchanged (the `haxiuz` part may stay
   beside them, undealt), the loader's span path is untouched
   in the glue, and the cache-retirement sweep in play.js only
   deletes keys, never blocks a download — a machine that kept
   nothing simply crosses the wire again. NOTICE.txt records
   both deals' hashes; update its “what is served” section in
   the same change so the file never describes a deal the frame
   does not make.

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
zip -9 sparta-menu.pk3 menu.dat gfx/nightware-banner.tga
```

The pack's second entry is the menu banner: the NIGHTWARE
LABZ gunmetal banner, converted losslessly from its PNG
master (1,672 x 941 — this engine build decodes no PNG),
carried at `gfx/nightware-banner.tga` so patch 012's draw
finds it at the pack's root. Any faithful PNG->TGA converter
reproduces it; the member's SHA-256 is pinned in NOTICE.txt.

With `house-qc-patch-008.diff`, then `house-qc-patch-009.diff`,
then `house-qc-patch-010.diff`, then `house-qc-patch-011.diff`,
then `house-qc-patch-012.diff`, then `house-qc-patch-013.diff`
applied to the sources first (`patch -p1`, from the qcsrc root's
parent — they apply clean in order and reproduce the compiled
tree exactly), the output is the shipped override: menu.dat
SHA-256
`de06b531c8cabedf64c00d005d4e1365ca54b92c2992797a474073aa0e186f0c`,
pk3 SHA-256
`8e4f26be73410725a0f7d4807809eb29875cbf0b4988107bf2ee39d759c0e0c2`.
Patch 009 alone (one file, `dialog_multiplayer.c`) adds the
room's door to the Multiplayer dialog; measured against the
patch-008 build it moves the header CRC not at all (still
10020), changes exactly one function's statement stream
(fillNexuizMultiplayerDialog, +16 statements — the net program
delta), adds two anonymous string globals (the door's label and
command), and leaves the field definitions identical.
Patch 010 alone (two files, `menu.qc` +
`dialog_multiplayer.c`) is the identity swap: the masthead tag
and the door button's label both become "haxiuz"; the door's
command `connect thisissparta2` is unchanged. Measured against
the patch-009 build it moves the header CRC not at all (still
10020), keeps all 1,010 functions and all 43,525 statements
(same opcode stream), and changes no field definition; because
both labels are now the same string, the compiler folds the
masthead's string global into the door's (global definitions
9,255 → 9,254 by that one removal, with the operand
renumbering it causes), and the string table's whole diff is
the two old labels out, "haxiuz" in.
Patch 011 alone (one file, `draw.qc`) is the native cursor:
the menu paints no cursor of its own — `draw_drawMousePointer`
still draws the skin cursor picture at the tracked position
and size, but at zero alpha, so it paints nothing (a zero
size would not do: the engine's DrawQ_Pic reads a zero size
as the picture's natural size); mouse tracking and
hit-testing are untouched, and the engine tracks the
player's real cursor in absolute mode (`menu_mouse_absolute`,
dealt in the house config). Measured against the patch-010
build it moves the header CRC not at all (still 10020), keeps
all 1,010 functions and all 43,525 statements (same opcode
stream), changes no field definition, and leaves the string
table and initial global data byte-identical; exactly one
statement differs — the drawpic alpha operand reads the
constant 0 instead of the `draw_alpha` global. File size
unchanged (617,644 bytes).
Patch 012 (two files, `menu.qc` + `menu/nexuiz/util.qc`) is
the menu banner: the stock backgrounds carry the Nexuiz
logo and the nexuiz.com strap baked into ONE plate layer
(title layer 3, in-game layer 2 — measured from the shipped
textures: x 0.1709..1, y 0..0.2096 of the 1024x768 layers,
identical in both), and drawBackground now skips that layer
and draws the house banner in its footprint instead —
fitted by its own aspect (the size read from the texture
itself), pinned to the top-right corner, at each
background's own alpha. The texture is named in the menu's
absolute form ("/gfx/nightware-banner"): draw_UseSkinFor
prefixes every relative pic name with the current skin's
directory, and the leading slash is the stock resolver's
own escape. The separate update nag in preMenuDraw, which
carried a nexuiz.com address, is gated off. Measured
against the patch-011 build it moves the header CRC not at
all (still 10020), keeps all 1,010 functions and all field
definitions, adds one string (the banner's name) and nine
anonymous global definitions, and changes exactly two
functions' opcode streams: drawBackground (138 -> 180
statements; locals 26 -> 34) and preMenuDraw (114 -> 115,
the gate). One compiler warning is expected — "Result of
comparison is constant" — and is the gate itself.
Patch 013 alone (one file, `dialog_multiplayer_playersetup.c`)
restores the mouse sensitivity control to the Player tab —
the stock "Sensitivity:" label and
makeNexuizSlider(1, 32, 0.2, "sensitivity") verbatim from
the stock Input settings (dialog_settings_input.c, which
stands unmodified in the tree but unwired since patch 008).
The slider writes the cvar directly; the house config
never deals sensitivity, so the player's value is never
stomped at boot and the engine's own config save persists
it. Measured against the patch-012 build it moves the
header CRC not at all (still 10020), keeps all 1,010
functions and all field definitions, adds no strings (the
label and cvar already live in the progs), adds one global
definition (the fill's local), and changes exactly one
function's opcode stream: fillNexuizPlayerSettingsTab
(73 -> 98 statements).

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

## Session diagnostics and the baseline procedure

The diagnostics layer (play.js + src/scripts/os-nexuiz.ts,
documented for players in NOTICE.txt) is not an engine artifact:
no engine rebuild, no `NX_ENGINE_STAMP` change. To reproduce a
measurement:

1. Arm it: set local storage `blacksite-nexuiz-diag` = `1` for
   the site (the OS window reads it through its storage seam),
   or load the OS page with `?nexuiz-diag=1`. Open the Nexuiz
   window: the deal carries `diag=1` and a minted `session`
   tag, and the diagnostics panel stands under the game.
2. Play the session under the conditions being measured. The
   panel updates at the sampler's rate (2/s) from the frame's
   own account of the session's active connection.
3. Press "export diagnostics (json)": the window asks the frame
   for its record and saves it — header (browser, platform,
   hardware concurrency, display refresh estimate, canvas
   backing, dealt mode, engine stamp, site build, bridge host),
   the frozen pre-engine rAF baseline, the event log, and up to
   1,200 samples at 500 ms (transport, setup, fallback reason,
   RTT and ICE pair when WebRTC carried it, packet/byte counters
   and rates, buffered bytes, page-frame percentiles, engine
   frames per window, focus/visibility/fullscreen/pointer-lock,
   canvas size, DPR).

Baseline discipline (review §1): a comparison counts only when
map, resolution, effects, server population and network
conditions match across runs, and the export header's context
record matches too. Foreground play is measured separately
from background throttling (the samples carry visibility and
focus for exactly this). Local bot modes are outside the
performance target; their exports are labelled by mode and are
not multiplayer evidence.
