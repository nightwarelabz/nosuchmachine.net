/* The TV asset step, run before every astro build: copy the hls.js
 * player engine (pinned in package.json + the lockfile) into
 * public/tv/hls.js, where the TV room loads it lazily on first play
 * — same-origin, like every engine the house ships. The OS page's
 * CSP leaves no room for a runtime CDN, and the house does not ship
 * what it cannot pin: the version in the tree is the version that
 * plays. Only hls.js is a build artifact; channels.json beside it
 * is committed data and is never touched here. */
import { copyFileSync, mkdirSync, statSync } from "node:fs";

mkdirSync("public/tv", { recursive: true });
copyFileSync("node_modules/hls.js/dist/hls.min.js", "public/tv/hls.js");

const kb = Math.round(statSync("public/tv/hls.js").size / 1024);
console.log(`tv: hls.js copied (${kb} KiB)`);
