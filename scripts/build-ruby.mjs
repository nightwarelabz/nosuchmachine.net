/* The Ruby asset step, run before every astro build:
 *   1. bundle the worker (src/scripts/os-ruby-worker.ts) into
 *      public/ruby/ruby-worker.js — a plain same-origin script the
 *      room spawns as a dedicated Worker;
 *   2. split the official CRuby 3.4 + stdlib wasm build into
 *      public/ruby/ruby.wasm.<n> parts beside it, with a
 *      public/ruby/manifest.json naming the parts, the total byte
 *      count and the whole-file sha-256. The worker fetches the
 *      parts, reassembles them, verifies the hash, and compiles.
 *      The split exists because Cloudflare Pages refuses any single
 *      file over 25 MiB and the interpreter is ~30 MB whole — the
 *      first branch build was green in CI and undeployable for
 *      exactly that reason (2026-10-28).
 * Both outputs are build artifacts: public/ruby/ is gitignored and
 * nothing binary is ever committed. The dependency route is npm —
 * @ruby/wasm-wasi (the JS binding) + @ruby/3.4-wasm-wasi (the
 * interpreter), pinned in package.json + the lockfile. */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Clean first: a stale single-file ruby.wasm from an older build must
// never ride into dist beside the parts.
rmSync("public/ruby", { recursive: true, force: true });
mkdirSync("public/ruby", { recursive: true });

await build({
  entryPoints: ["src/scripts/os-ruby-worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "public/ruby/ruby-worker.js",
  logLevel: "warning",
});

const wasm = readFileSync("node_modules/@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm");
const PART_BYTES = 16 * 1024 * 1024; // under the 25 MiB Pages per-file cap
const parts = [];
for (let off = 0; off < wasm.length; off += PART_BYTES) {
  const name = `ruby.wasm.${parts.length}`;
  writeFileSync(`public/ruby/${name}`, wasm.subarray(off, Math.min(off + PART_BYTES, wasm.length)));
  parts.push(name);
}
const manifest = {
  parts,
  bytes: wasm.length,
  sha256: createHash("sha256").update(wasm).digest("hex"),
};
writeFileSync("public/ruby/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `ruby: worker bundled · ruby.wasm split into ${parts.length} parts (${Math.round(wasm.length / 1024)} KiB total)`,
);
