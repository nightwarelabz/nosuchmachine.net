/* Nexuiz Classic for BLACKSITE — the engine's pre-js loader.
 *
 * Derived from the DarkPlaces tree's own wasm/pre.js (GPL-2.0-or-later,
 * like the engine; the upstream file lives at wasm/pre.js in the
 * DarkPlaces source). The skeleton is upstream's: stdin stub, the
 * /game basedir, IDBFS mounted for the user dir, Module.files fetched
 * into the filesystem, then callMain.
 *
 * The BLACKSITE delta is the transport for the game's data packs, and
 * it exists for one reason: fidelity. The packs must reach the engine
 * byte-for-byte (their SHA-256 is pinned in public/nexuiz/NOTICE.txt),
 * but the release zip's upstreams send no CORS headers and the packs
 * are far too large to ship as site files. So a pack entry in
 * Module.files may be a span descriptor:
 *
 *   { part: "data", spanLength: 880493625, size: 887580846,
 *     sha256: "3ec238441a4886b44a12134cf89f45b3d9be59359d4a089773f7996b8d4bd6c0" }
 *
 * The loader fetches the pack's raw-deflate span from the site's own
 * data pipe (/api/nexuiz-data) in fixed 16 MiB chunks, inflates it
 * with DecompressionStream, writes it into the FS as it lands, and
 * verifies an incremental SHA-256 over the inflated bytes. A pack
 * whose bytes do not match its pinned hash is REFUSED — the engine
 * is never started on wrong data.
 *
 * Storage is the OS's side of the bargain: a returning player never
 * crosses the wire twice for the same bytes. The Cache API holds
 * the data in two shapes, never both at rest: the compressed
 * chunks are transport staging (they keep an interrupted first
 * download resumable), and once a pack is verified whole, the pack
 * itself is stored as one entry and the staged chunks are
 * dropped — at rest there is exactly one copy, the verified pack,
 * ready to load without touching the wire or the inflater. A warm
 * boot verifies the LOCAL bytes against the same pinned hash
 * before writing them into the filesystem; the hash is always
 * checked against bytes already on the machine. (The packs do not
 * ride the IDBFS mount: its whole-file sync hands the store one
 * ~900 MB record per file, which browsers refuse in practice —
 * measured, see the cache audit. IDBFS keeps what it is good at:
 * the engine's own small files in the user dir.) If any store
 * refuses, the loader degrades a rung — kept pack, then staging
 * chunks, then the wire — and the game is never refused for a
 * storage failure. Plain-string entries keep upstream's
 * fetch-and-write behavior, with one addition: a failed fetch
 * falls back to the copy the cache kept instead of closing.
 *
 * Everything else — engine, gamecode, media — is the original game.
 */

// ——— incremental SHA-256 (FIPS 180-4), for the transport check only.
function Sha256() {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const buf = new Uint8Array(64);
  let bufLen = 0, total = 0;
  const w = new Uint32Array(64);
  function block(b, off) {
    for (let i = 0; i < 16; i++) w[i] = (b[off + 4 * i] << 24) | (b[off + 4 * i + 1] << 16) | (b[off + 4 * i + 2] << 8) | b[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h = [(h[0] + a) | 0, (h[1] + bb) | 0, (h[2] + c) | 0, (h[3] + d) | 0, (h[4] + e) | 0, (h[5] + f) | 0, (h[6] + g) | 0, (h[7] + hh) | 0];
  }
  this.update = function (data) {
    total += data.length;
    let off = 0;
    if (bufLen) {
      const take = Math.min(64 - bufLen, data.length);
      buf.set(data.subarray(0, take), bufLen);
      bufLen += take; off += take;
      if (bufLen === 64) { block(buf, 0); bufLen = 0; }
    }
    while (off + 64 <= data.length) { block(data, off); off += 64; }
    if (off < data.length) { buf.set(data.subarray(off), 0); bufLen = data.length - off; }
  };
  this.hex = function () {
    const bitLenHi = Math.floor(total / 0x20000000), bitLenLo = (total << 3) >>> 0;
    const pad = new Uint8Array(bufLen < 56 ? 64 - bufLen : 128 - bufLen);
    pad[0] = 0x80;
    const tail = new Uint8Array(bufLen + pad.length);
    tail.set(buf.subarray(0, bufLen), 0); tail.set(pad, bufLen);
    const dv = new DataView(tail.buffer);
    dv.setUint32(tail.length - 4, bitLenLo);
    dv.setUint32(tail.length - 8, bitLenHi);
    for (let off = 0; off < tail.length; off += 64) block(tail, off);
    return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  };
}

if (!Object.hasOwn(Module, 'arguments')) {
	Module['arguments'] = ['-basedir', '/game'];
}
else {
	Module['arguments'] = ['-basedir', '/game'].concat(Module['arguments']);
}

Module['print'] = function(text) {
	console.log(text);
	if (Module['onConsole']) Module['onConsole'](text);
}

Module['printErr'] = function(text) {
	console.error(text);
	if (Module['onConsole']) Module['onConsole'](text);
}

Module['preRun'] = [
	function()
	{
		function stdin(){
			return '\n';  // Return a newline/line feed character so the user is not prompted for input
		};
		FS.init(stdin, null, null); // null for both stdout and stderr

		function createParentDirectory(filePath) {
			parts = filePath.split('/');
			for (let i = parts.length - 1; i > 0; i--) {
				localDir = '/game/' + parts.slice(0, -i).join('/')
				try {
					FS.mkdir(localDir);
				}
				catch {
					// Directory already exists
				}
			}
		}

		function fail(localPath, message) {
			console.error("nexuiz data: " + message);
			if (Module['onDataError']) Module['onDataError'](localPath, message);
			throw new Error(message);
		}

		// FS.syncfs as a promise: resolves true when the sync
		// completed, false when the platform refused it (quota,
		// storage pressure) — or when it simply never answers: a
		// browser killed mid-transaction can leave the database
		// blocked, and a loader parked on it would hold the whole
		// game hostage to a storage hiccup. Ten seconds is
		// generous; past that, the boot proceeds without the sync
		// and says so. Storage trouble must never read as game
		// trouble — callers degrade, they do not fail.
		function syncfsP(populate) {
			return new Promise((resolve) => {
				let settled = false;
				const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
				try {
					FS.syncfs(populate, (err) => done(!err));
				} catch {
					done(false);
					return;
				}
				setTimeout(() => {
					if (!settled) console.log("nexuiz data: the storage sync did not answer in time — proceeding without it this boot.");
					done(false);
				}, 10000);
			});
		}

		// Fetch one fixed chunk of a pack's compressed span, from the
		// staging cache when it is already there. The wire fetch asks
		// the HTTP cache to keep nothing (cache: "no-store"): the
		// staging cache is the one deliberate copy, and a second,
		// silent copy in the HTTP disk cache is ~850 MB of the
		// player's disk spent on bytes nothing ever reads back.
		const CHUNK = 16 * 1024 * 1024;
		async function fetchChunk(cache, part, idx, expectLen) {
			const url = chunkUrl(part, idx);
			if (cache) {
				const hit = await cache.match(url);
				if (hit) {
					const body = await hit.arrayBuffer();
					if (body.byteLength === expectLen) return new Uint8Array(body);
				}
			}
			let res = null;
			let lastErr = null;
			for (let attempt = 0; attempt < 3 && !res; attempt++) {
				try {
					const r = await fetch(url, { cache: "no-store" });
					if (r.ok) res = r; else lastErr = new Error("the data pipe answered " + r.status + " for chunk " + idx);
				} catch (e) { lastErr = e; }
				if (!res && attempt < 2) await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
			}
			if (!res) throw lastErr || new Error("chunk " + idx + " could not be fetched");
			if (cache) {
				try { await cache.put(url, res.clone()); } catch { /* cache is a kindness, not a promise */ }
			}
			const body = await res.arrayBuffer();
			if (body.byteLength !== expectLen) throw new Error("chunk " + idx + " arrived at " + body.byteLength + " bytes, expected " + expectLen);
			return new Uint8Array(body);
		}

		// The one cache for everything the loader keeps: chunk
		// staging, the verified packs, the small house files.
		async function openDataCache() {
			return (typeof caches !== "undefined") ? await caches.open("nexuiz-data-v1").catch(() => null) : null;
		}
		function chunkUrl(part, idx) {
			return Module['dataBase'] + "?part=" + encodeURIComponent(part) + "&chunk=" + idx;
		}
		function packUrl(part) {
			return Module['dataBase'] + "?part=" + encodeURIComponent(part) + "&pack=1";
		}
		function keptUrl(localPath) {
			return "/nexuiz/kept/" + localPath;
		}

		// Drop one pack's staging chunks — called once the verified
		// pack itself is stored, so at rest there is one copy.
		async function dropChunks(cache, part, chunks) {
			if (!cache) return;
			for (let i = 0; i < chunks; i++) {
				try { await cache.delete(chunkUrl(part, i)); } catch { /* already gone is fine */ }
			}
		}

		// Is the verified pack already kept on this machine? Reads
		// the kept pack entry, checks exact size, then the full
		// SHA-256 over the kept bytes, and only then writes them
		// into the filesystem. Local bytes only — this path never
		// touches the network, so a warm boot's verdict is the
		// machine's own. A kept pack that fails any check is
		// deleted on the spot, never trusted twice.
		async function loadKeptPack(cache, localPath, desc) {
			if (!cache) return false;
			const hit = await cache.match(packUrl(desc.part)).catch(() => null);
			if (!hit) return false;
			Module['addRunDependency'](localPath);
			try {
				const body = await hit.arrayBuffer();
				if (body.byteLength !== desc.size) {
					try { await cache.delete(packUrl(desc.part)); } catch { /* ignore */ }
					return false;
				}
				const bytes = new Uint8Array(body);
				let digest;
				if (typeof crypto !== "undefined" && crypto.subtle) {
					const buf = await crypto.subtle.digest("SHA-256", bytes);
					digest = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
				} else {
					const hasher = new Sha256();
					for (let pos = 0; pos < bytes.length; pos += CHUNK) hasher.update(bytes.subarray(pos, Math.min(pos + CHUNK, bytes.length)));
					digest = hasher.hex();
				}
				if (digest !== desc.sha256) {
					console.log("nexuiz data: the kept copy of " + localPath + " fails its hash — fetching it fresh.");
					try { await cache.delete(packUrl(desc.part)); } catch { /* ignore */ }
					return false;
				}
				const stream = FS.open("/game/" + localPath, "w");
				for (let pos = 0; pos < bytes.length; pos += CHUNK) {
					FS.write(stream, bytes, pos, Math.min(CHUNK, bytes.length - pos));
					if (Module['onDataProgress']) Module['onDataProgress'](localPath, Math.min(pos + CHUNK, bytes.length), desc.size);
				}
				FS.close(stream);
				console.log("Verified " + localPath + " from this machine's own storage — no download.");
				if (Module['onDataLocal']) Module['onDataLocal'](localPath);
				return true;
			} finally {
				Module['removeRunDependency'](localPath);
			}
		}

		async function downloadSpanFile(localPath, desc) {
			if (typeof DecompressionStream === "undefined") {
				fail(localPath, "this browser cannot unpack the game data (no DecompressionStream) — the game stays closed rather than improvise.");
			}
			Module['addRunDependency'](localPath);
			const cache = await openDataCache();
			const chunks = Math.ceil(desc.spanLength / CHUNK);
			// The pack is assembled whole: the SHA-256 verdict must be
			// over the reassembled bytes themselves, not a stand-in.
			const assembled = new Uint8Array(desc.size);
			const fallbackHash = (typeof crypto === "undefined" || !crypto.subtle) ? new Sha256() : null;
			const stream = FS.open("/game/" + localPath, "w");
			let inflated = 0;
			try {
				const ds = new DecompressionStream("deflate-raw");
				const writer = ds.writable.getWriter();
				const reader = ds.readable.getReader();
				const pump = (async () => {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						if (inflated + value.length > desc.size) throw new Error("the pack unpacked past its true size");
						assembled.set(value, inflated);
						if (fallbackHash) fallbackHash.update(value);
						FS.write(stream, value, 0, value.byteLength);
						inflated += value.byteLength;
						if (Module['onDataProgress']) Module['onDataProgress'](localPath, inflated, desc.size);
					}
				})();
				const feed = (async () => {
					for (let i = 0; i < chunks; i++) {
						const expect = Math.min(CHUNK, desc.spanLength - i * CHUNK);
						const bytes = await fetchChunk(cache, desc.part, i, expect);
						await writer.write(bytes);
					}
					await writer.close();
				})();
				// Feed and pump race as one: if either side dies
				// (a failed write into the engine filesystem, a
				// stream error), the rejection must surface here —
				// awaiting them in sequence lets a dead pump park
				// the feed's backpressure promise forever, and the
				// download hangs silently with the engine unstarted.
				await Promise.all([feed, pump]);
			} catch (e) {
				FS.close(stream);
				fail(localPath, "the game data did not arrive whole: " + (e && e.message ? e.message : e));
			}
			FS.close(stream);
			if (inflated !== desc.size) fail(localPath, "the pack unpacked to " + inflated + " bytes; the real pack is " + desc.size + ". Refusing it.");
			let digest;
			if (fallbackHash) digest = fallbackHash.hex();
			else {
				const buf = await crypto.subtle.digest("SHA-256", assembled);
				digest = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
			}
			if (digest !== desc.sha256) fail(localPath, "the pack's SHA-256 is " + digest + "; the real pack is " + desc.sha256 + ". Refusing wrong bytes.");
			console.log("Downloaded and verified " + localPath);
			Module['removeRunDependency'](localPath);
			return { assembled, cache, chunks };
		}

		async function startDownload(localPath, remotePath) {
			Module['addRunDependency'](localPath);
			try {
				const response = await fetch(remotePath);
				if (!response.ok) throw new Error("answered " + response.status);
				const arrayBuffer = await response.arrayBuffer();
				const buffer = new Uint8Array(arrayBuffer);
				const stream = FS.open("/game/" + localPath, "w");
				FS.write(stream, buffer, 0, buffer.byteLength);
				FS.close(stream);
				console.log("Downloaded " + localPath);
				// Keep a copy in the cache: if a later boot cannot
				// reach the file, the kept copy plays instead.
				try {
					const c = await openDataCache();
					if (c) await c.put(keptUrl(localPath), new Response(buffer, { headers: { "content-type": "text/plain" } }));
				} catch { /* a kindness, not a promise */ }
			} catch (e) {
				// A small house file (the autoexec) is re-fetched each
				// boot so house tuning reaches players — but a failed
				// fetch must not close the game when the machine
				// already keeps a copy: play the kept one.
				let kept = 0;
				try { kept = FS.stat("/game/" + localPath).size; } catch { /* nothing on disk */ }
				if (kept <= 0) {
					try {
						const c = await openDataCache();
						const hit = c ? await c.match(keptUrl(localPath)) : null;
						if (hit) {
							const buf = new Uint8Array(await hit.arrayBuffer());
							const stream = FS.open("/game/" + localPath, "w");
							FS.write(stream, buf, 0, buf.byteLength);
							FS.close(stream);
							kept = buf.byteLength;
						}
					} catch { /* no kept copy either */ }
				}
				if (kept > 0) {
					console.log("nexuiz data: " + localPath + " could not be refreshed (" + (e && e.message ? e.message : e) + ") — playing the copy kept on this machine.");
				} else {
					throw e;
				}
			}
			Module['removeRunDependency'](localPath);
		}

		function createBaseDir() {
			FS.mkdir('/game');
			// Mounts IDBFS to where the game would save — with
			// autoPersist ON: the plain mount only ever syncs when
			// someone calls FS.syncfs (a clean engine shutdown, in
			// practice), so anything the engine downloads mid-
			// session would live in memory and die with the tab.
			// With autoPersist, the filesystem queues a sync at the
			// end of any frame that changed a file — a finished
			// download commits itself, kill or no kill.
			FS.mount(IDBFS, { autoPersist: true }, '/home/web_user/');
			// The play frame also asks for a flush when it goes
			// away (pagehide): whatever the engine wrote is
			// committed then too, belt over the auto-persist's
			// braces.
			Module['houseSyncFS'] = function () {
				try { FS.syncfs(false, function () {}); } catch { /* best effort at the door */ }
			};
		}

		async function downloadGameFiles() {
			createBaseDir();
			// Bring everything the machine already keeps into the
			// filesystem BEFORE deciding anything needs the wire.
			await syncfsP(true);
			let downloads = [];
			for (const [localPath, desc] of Object.entries(Module.files)) {
				createParentDirectory(localPath);
				if (typeof desc === "string") {
					console.log("Downloading " + desc + " to " + localPath);
					downloads.push(startDownload(localPath, desc));
				} else {
					downloads.push((async () => {
						const cache = await openDataCache();
						if (await loadKeptPack(cache, localPath, desc)) return;
						console.log("Downloading pack " + desc.part + " to " + localPath);
						if (Module['onDataFile']) Module['onDataFile'](localPath);
						const got = await downloadSpanFile(localPath, desc);
						// Store the verified pack itself; only then
						// may its staging chunks go. If the store
						// refuses, the chunks stay as the kept copy
						// and the next boot rebuilds from them —
						// slower, never broken.
						if (got && got.cache) {
							try {
								await got.cache.put(packUrl(desc.part), new Response(got.assembled, { headers: { "content-type": "application/octet-stream" } }));
								await dropChunks(got.cache, desc.part, got.chunks);
								console.log("Kept " + localPath + " on this machine for next time.");
							} catch (e) {
								console.log("nexuiz data: the kept-pack store refused " + localPath + " (" + (e && e.message ? e.message : e) + ") — the staging chunks stay as the copy.");
							}
						}
					})());
				}
			}
			try {
				await Promise.all(downloads);
			} catch (e) {
				// fail() already reported; leave the run dependencies
				// pending so the engine never starts on wrong data.
				return;
			}
			// Flush the engine's user dir (small files — the class
			// the IDBFS sync handles) and start. The result is
			// ignored on purpose: storage trouble must not gate
			// the engine.
			await syncfsP(false);
			if (Module['onEngineStart']) Module['onEngineStart']();
			Module.callMain(Module.arguments);
		}

		downloadGameFiles();
	}
];

Module['noInitialRun'] = true;
