import { skey } from "./os-depth";
/** A synthetic field: no sensors, network requests, or visitor telemetry. */
const background = document.querySelector<HTMLCanvasElement>("#ambient-canvas");
const instrument = document.querySelector<HTMLCanvasElement>("#phase-canvas");
const motionButtons = document.querySelectorAll<HTMLButtonElement>(
  "[data-motion-toggle]",
);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let manualPause = false;
try {
  manualPause = localStorage.getItem(skey("nsm-motion")) === "paused";
} catch {
  /* Storage is optional. */
}
let paused = reducedMotion.matches || manualPause;
let active = true,
  frame = 0,
  lastDraw = 0,
  elapsed = 0,
  previous = 0;
const canvases = [background, instrument].filter(
  (item): item is HTMLCanvasElement => Boolean(item),
);
function sizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect(),
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function paintBackground(time: number) {
  if (!background) return;
  const ctx = background.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = background.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 0.65;
  for (let row = 0; row < 10; row++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(113, 214, 183, ${0.026 + row * 0.001})`;
    for (let x = 0; x <= w; x += 12) {
      const y =
        h * 0.37 +
        row * 34 +
        Math.sin(x * 0.006 + time * 0.14 + row * 0.22) * (22 + row * 4) +
        Math.sin(x * 0.014 - time * 0.2) * 9;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let n = 0; n < 22; n++) {
    const x = ((n * 173.7 + time * (2 + (n % 3))) % (w + 40)) - 20,
      y = (n * 87.3) % h;
    ctx.fillStyle =
      n % 3 === 0 ? "rgba(166, 151, 224, 0.2)" : "rgba(145, 225, 197, 0.18)";
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}
function paintInstrument(time: number) {
  if (!instrument || !active) return;
  const ctx = instrument.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = instrument.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5,
    cy = h * 0.46,
    scale = Math.min(w * 0.42, h * 0.42),
    rotation = time * 0.085;
  function project(x: number, y: number, z: number): [number, number] {
    const rx = x * Math.cos(rotation) - z * Math.sin(rotation),
      rz = x * Math.sin(rotation) + z * Math.cos(rotation);
    return [cx + rx * scale, cy + (y * 0.87 + rz * 0.32) * scale];
  }
  ctx.lineWidth = 0.65;
  for (let latitude = -4; latitude <= 4; latitude++) {
    const angle = (latitude * Math.PI) / 10;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(135, 211, 188, 0.16)";
    for (let i = 0; i <= 96; i++) {
      const p = (i * Math.PI) / 48,
        [x, y] = project(
          Math.cos(p) * Math.cos(angle),
          Math.sin(angle),
          Math.sin(p) * Math.cos(angle),
        );
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let longitude = 0; longitude < 12; longitude++) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(135, 211, 188, 0.13)";
    const angle = (longitude * Math.PI) / 6;
    for (let i = 0; i <= 96; i++) {
      const p = (i * Math.PI) / 48,
        [x, y] = project(
          Math.cos(p) * Math.cos(angle),
          Math.sin(p),
          Math.cos(p) * Math.sin(angle),
        );
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let orbit = 0; orbit < 3; orbit++) {
    ctx.beginPath();
    ctx.lineWidth = orbit === 0 ? 1.4 : 0.9;
    ctx.strokeStyle = [
      "rgba(150, 233, 197, 0.8)",
      "rgba(165, 148, 224, 0.65)",
      "rgba(246, 178, 178, 0.45)",
    ][orbit];
    for (let i = 0; i <= 420; i++) {
      const p = (i * Math.PI) / 210,
        [x, y] = project(
          1.1 * Math.sin(p * (orbit + 2) + time * 0.15),
          0.87 * Math.sin(p * (orbit + 3)),
          0.6 * Math.cos(p * 2 + orbit),
        );
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const bins = Math.min(80, Math.floor(w / 6));
  for (let i = 0; i < bins; i++) {
    const frequency = i / bins;
    const peaks =
      Math.exp(-((frequency - 0.26) ** 2) / 0.0012) +
      Math.exp(-((frequency - 0.67) ** 2) / 0.003) * 0.72;
    const power = 4 + peaks * 42 + (Math.sin(i * 2.73 + time) + 1) * 4;
    ctx.fillStyle = `rgba(142, 222, 187, ${0.14 + peaks * 0.3})`;
    ctx.fillRect(w * 0.08 + (i * w * 0.84) / bins, h * 0.93 - power, 2, power);
  }
}
function draw(time: number) {
  paintBackground(time);
  paintInstrument(time);
}
function animate(timestamp: number) {
  frame = 0;
  if (paused || document.hidden) return;
  if (previous) elapsed += Math.min((timestamp - previous) / 1000, 0.08);
  previous = timestamp;
  if (timestamp - lastDraw > 32) {
    draw(elapsed);
    lastDraw = timestamp;
  }
  frame = requestAnimationFrame(animate);
}
function updateMotion() {
  motionButtons.forEach((button) => {
    button.textContent = paused ? "Resume motion" : "Pause motion";
  });
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
  draw(elapsed);
  if (!paused && !document.hidden) frame = requestAnimationFrame(animate);
}
motionButtons.forEach((button) =>
  button.addEventListener("click", () => {
    paused = !paused;
    manualPause = paused;
    try {
      localStorage.setItem(skey("nsm-motion"), paused ? "paused" : "running");
    } catch {
      /* Optional preference. */
    }
    updateMotion();
  }),
);
reducedMotion.addEventListener("change", () => {
  paused = reducedMotion.matches || manualPause;
  updateMotion();
});
document.addEventListener("visibilitychange", updateMotion);
const resizeObserver = new ResizeObserver(() => {
  canvases.forEach(sizeCanvas);
  draw(elapsed);
});
canvases.forEach((canvas) => resizeObserver.observe(canvas));
if (instrument)
  new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active) draw(elapsed);
  }).observe(instrument);
canvases.forEach(sizeCanvas);
updateMotion();
