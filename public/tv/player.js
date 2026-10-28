/* The TV player frame's engine — see os-tv.ts for why the player
 * is a document of its own (the OS page's content policy admits
 * no blob: media, and a MediaSource load is a blob: load). This
 * frame speaks a small postMessage protocol with the TV room:
 * in, {type:"tv:play", url} and {type:"tv:stop"}; out,
 * {type:"tv:state", state, reason} and a one-second
 * {type:"tv:time", ct, paused, rs} heartbeat. Reasons are codes,
 * never prose — the room owns every word the operator reads. */
(() => {
  const v = document.getElementById("v");
  let hls = null;
  let recoveries = 0;
  let currentUrl = "";
  const send = (msg) => parent.postMessage(msg, location.origin);
  const state = (s, reason) => send({ type: "tv:state", state: s, reason: reason || "" });

  const teardown = () => {
    if (hls) { try { hls.destroy(); } catch { /* already gone */ } hls = null; }
    try { v.pause(); } catch { /* noop */ }
    v.removeAttribute("src");
    try { v.load(); } catch { /* noop */ }
  };

  const play = (url) => {
    teardown();
    recoveries = 0;
    currentUrl = url;
    state("loading");
    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ maxBufferLength: 30, liveSyncDurationCount: 3 });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { void v.play().catch(() => { /* judged by state */ }); });
      hls.on(window.Hls.Events.ERROR, (_ev, d) => {
        if (!d || !d.fatal) return;
        if (d.type === window.Hls.ErrorTypes.NETWORK_ERROR && recoveries < 2) { recoveries++; hls.startLoad(); return; }
        if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR && recoveries < 2) { recoveries++; hls.recoverMediaError(); return; }
        const code = d.response && d.response.code;
        teardown();
        state("dead", code ? `http:${code}` : "broke");
      });
      hls.loadSource(url);
      hls.attachMedia(v);
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url;
      void v.play().catch(() => { /* judged by state */ });
    } else {
      state("dead", "no-hls");
    }
  };

  v.addEventListener("playing", () => state("playing"));
  v.addEventListener("error", () => { if (currentUrl && !hls) state("dead", "no-answer"); });
  window.setInterval(() => send({ type: "tv:time", ct: v.currentTime, paused: v.paused, rs: v.readyState }), 1000);
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === "tv:play") play(e.data.url);
    else if (e.data.type === "tv:stop") { currentUrl = ""; teardown(); state("idle"); }
  });
  state("idle");
})();
