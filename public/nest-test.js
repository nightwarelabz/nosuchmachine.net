/* nest bisection probe (diagnostic branch only) */
(function () {
  var d = 0, w = window;
  try { while (w.parent && w.parent !== w) { d++; w = w.parent; } } catch (e) {}
  var t = document.getElementById("t");
  if (t) t.textContent = "LEVEL " + d + " isolated=" + window.crossOriginIsolated + " sab=" + (typeof SharedArrayBuffer);
  if (d < 3) {
    var f = document.createElement("iframe");
    f.src = location.pathname + "?n=" + (d + 1);
    f.width = "92%"; f.height = "260";
    document.body.appendChild(f);
  }
})();
