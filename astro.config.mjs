import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { bookTableHastPlugin } from "./src/lib/book-table-hast.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* Live-service stamp: after every build, dist/version.json names the OS
   chunk this build produced (found the same way a probe finds it: the
   homepage's script shim imports it), when it was built, and the repo
   version from package.json. The running OS polls that stamp — served
   no-store — and reloads itself onto a newer build, so no visitor sits
   on a stale BLACKSITE; the desktop build plate reads the same stamp.
   See startUpdateWatch in src/scripts/os.ts. A stamp that cannot be
   read stays null, and null means silence. */
const stampVersion = {
  name: "stamp-version",
  hooks: {
    "astro:build:done": ({ dir }) => {
      const distDir = fileURLToPath(dir);
      let chunk = null;
      let version = null;
      try {
        const html = readFileSync(join(distDir, "index.html"), "utf8");
        const refs = [...html.matchAll(/(?:src|href)="\/_astro\/([^"]+\.js)"/g)].map((m) => m[1]);
        for (const ref of refs) {
          const src = readFileSync(join(distDir, "_astro", ref), "utf8");
          const hit = src.match(/os\.[A-Za-z0-9_-]+\.js/);
          if (hit) { chunk = hit[0]; break; }
        }
      } catch { /* the stamp stays null and every client stays silent */ }
      try {
        const pkg = JSON.parse(readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "package.json"), "utf8"));
        if (typeof pkg.version === "string" && pkg.version) version = pkg.version;
      } catch { /* no version line — the plate shows chunk + built only */ }
      writeFileSync(join(distDir, "version.json"), JSON.stringify({ chunk, built: new Date().toISOString(), version }) + "\n");
    },
  },
};

export default defineConfig({
  integrations: [stampVersion],
  site: "https://nosuchmachine.net",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  markdown: {
    shikiConfig: {
      // AA pair. Light is the default; dark follows prefers-color-scheme via
      // the .astro-code hook in src/styles/global.css.
      themes: {
        light: "github-light-high-contrast",
        dark: "github-dark-high-contrast",
      },
      langs: [
        {
          name: "orange",
          scopeName: "source.orange",
          patterns: [
            { name: "comment.line.double-slash.orange", match: "//.*$" },
            {
              name: "string.quoted.double.orange",
              begin: '(?:[bh])?"',
              end: '"',
              patterns: [{ name: "constant.character.escape.orange", match: "\\\\." }],
            },
            {
              name: "keyword.control.orange",
              match: "\\b(spec|impl|proof|game|module|use|let|for|in|if|else|requires|ensures|return|pub)\\b",
            },
            { name: "constant.language.orange", match: "\\b(true|false)\\b" },
            { name: "entity.name.type.orange", match: "\\b(Int|Bool|Word|Mod|Array)\\b" },
            {
              name: "constant.numeric.orange",
              match: "\\b(0[xX][0-9a-fA-F_]+|0[bB][01_]+|[0-9][0-9_]*)\\b",
            },
            {
              name: "entity.name.function.orange",
              match: "\\b[a-zA-Z_][a-zA-Z_0-9]*(?=\\s*\\()",
            },
            { name: "keyword.operator.orange", match: "[=+*/%&|^~<>!:-]+" },
          ],
        },
      ],
    },
    processor: satteri({ hastPlugins: [bookTableHastPlugin] }),
  },
  // Keep scripts and images as files. The Cloudflare CSP allows same-origin
  // scripts and forbids inline event handlers, so nothing executable is inlined.
  vite: { build: { assetsInlineLimit: 0 } },
});
