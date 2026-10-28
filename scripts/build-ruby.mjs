/* The Ruby asset step, run before every astro build:
 *   1. bundle the worker (src/scripts/os-ruby-worker.ts) into
 *      public/ruby/ruby-worker.js — a plain same-origin script the
 *      room spawns as a dedicated Worker;
 *   2. copy the official CRuby 3.4 + stdlib wasm build beside it as
 *      public/ruby/ruby.wasm (~30 MB, served like the toolchest
 *      datasets).
 * Both outputs are build artifacts: public/ruby/ is gitignored and
 * nothing binary is ever committed. The dependency route is npm —
 * @ruby/wasm-wasi (the JS binding) + @ruby/3.4-wasm-wasi (the
 * interpreter), pinned in package.json + the lockfile. */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, statSync } from "node:fs";

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

copyFileSync(
  "node_modules/@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm",
  "public/ruby/ruby.wasm",
);

const kb = Math.round(statSync("public/ruby/ruby.wasm").size / 1024);
console.log(`ruby: worker bundled · ruby.wasm copied (${kb} KiB)`);
