/* A cached, deterministic ice plate. Branch geometry is drawn once per
   size, then revealed from the edges. No shaders, assets, or network. */
export interface FrostPlate { reveal: (progress: number) => void; dispose: () => void }

export function createFrostPlate(canvas: HTMLCanvasElement): FrostPlate {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Frost canvas unavailable");
  const plate = document.createElement("canvas");
  const ice = plate.getContext("2d");
  if (!ice) throw new Error("Frost plate unavailable");
  let width = 0;
  let height = 0;
  let current = 0;
  let disposed = false;

  function prepare() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    // Bound fill cost on retina phones and large monitors alike.
    const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_500_000 / (width * height)));
    canvas.width = plate.width = Math.max(1, Math.round(width * scale));
    canvas.height = plate.height = Math.max(1, Math.round(height * scale));
    ice!.setTransform(scale, 0, 0, scale, 0, 0);
    let seed = 0x1ce51de;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const short = Math.min(width, height);
    const line = (x: number, y: number, nx: number, ny: number, alpha: number, weight = 0.5) => {
      ice!.strokeStyle = `rgba(186,225,243,${alpha})`;
      ice!.lineWidth = weight;
      ice!.beginPath(); ice!.moveTo(x, y); ice!.lineTo(nx, ny); ice!.stroke();
    };
    const fern = (x: number, y: number, angle: number, length: number, level: number) => {
      const steps = level === 0 ? 11 : 7;
      for (let i = 0; i < steps; i++) {
        const a = angle + (random() - 0.5) * 0.13;
        const step = length / steps;
        const nx = x + Math.cos(a) * step;
        const ny = y + Math.sin(a) * step;
        line(x, y, nx, ny, 0.14 + (1 - i / steps) * 0.22, level === 0 ? 0.8 : 0.45);
        for (const side of [-1, 1]) {
          const branchAngle = a + side * (0.65 + random() * 0.18);
          const branchLength = length * (1 - i / steps) * (0.2 + random() * 0.15);
          if (level < 2 && i % 2 === 0) fern(nx, ny, branchAngle, branchLength, level + 1);
          else line(nx, ny, nx + Math.cos(branchAngle) * branchLength, ny + Math.sin(branchAngle) * branchLength, 0.16);
        }
        x = nx; y = ny;
      }
    };

    // Dendrites grow along four edges; the center stays legible.
    const roots = Math.max(10, Math.min(22, Math.ceil(width / 80)));
    for (let i = 0; i < roots; i++) {
      const along = (i + random()) / roots;
      fern(along * width, -8, Math.PI / 2 + (random() - 0.5) * 1.2, short * (0.13 + random() * 0.25), 0);
      fern(along * width, height + 8, -Math.PI / 2 + (random() - 0.5) * 1.2, short * (0.12 + random() * 0.27), 0);
      if (i % 2 === 0) {
        fern(-8, along * height, (random() - 0.5) * 1.1, short * (0.1 + random() * 0.23), 0);
        fern(width + 8, along * height, Math.PI + (random() - 0.5) * 1.1, short * (0.1 + random() * 0.23), 0);
      }
    }

    // Fine crystalline sediment makes frost read as a surface, not a wireframe.
    for (let i = 0; i < 3200; i++) {
      const x = random() * width, y = random() * height;
      const edge = Math.min(x / width, 1 - x / width, y / height, 1 - y / height);
      if (random() > Math.pow(Math.max(0, 1 - edge * 3.8), 4)) continue;
      const size = 0.5 + random() * 3.5;
      ice!.fillStyle = `rgba(194,231,247,${0.08 + random() * 0.18})`;
      ice!.beginPath(); ice!.moveTo(x, y - size); ice!.lineTo(x + size * 0.3, y); ice!.lineTo(x, y + size); ice!.lineTo(x - size * 0.3, y); ice!.closePath(); ice!.fill();
    }
    // Long, restrained stress fractures in the corners of the ice sheet.
    for (const [x, y, direction] of [[0, height * 0.1, 0.38], [width, height * 0.82, 3.7], [width * 0.82, 0, 2.1]]) {
      let px = x, py = y;
      for (let j = 0; j < 7; j++) {
        const a = direction + (random() - 0.5) * 0.55;
        const length = short * (0.035 + random() * 0.055);
        const nx = px + Math.cos(a) * length, ny = py + Math.sin(a) * length;
        line(px, py, nx, ny, 0.29 - j * 0.03, 0.7);
        line(px + 2, py + 1, nx + 2, ny + 1, 0.05, 2);
        px = nx; py = ny;
      }
    }
  }

  function reveal(progress: number) {
    if (disposed) return;
    current = Math.max(0, Math.min(1, progress));
    context!.setTransform(1, 0, 0, 1, 0, 0);
    context!.clearRect(0, 0, canvas.width, canvas.height);
    context!.globalCompositeOperation = "source-over";
    context!.globalAlpha = 0.25 + current * 0.75;
    context!.drawImage(plate, 0, 0);
    context!.globalAlpha = 1;
    // A shrinking clear ellipse reveals the ice toward the title.
    context!.globalCompositeOperation = "destination-in";
    context!.save();
    context!.scale(canvas.width, canvas.height);
    const radius = 0.84 - current * 0.5;
    const mask = context!.createRadialGradient(0.5, 0.5, radius * 0.55, 0.5, 0.5, radius);
    mask.addColorStop(0, "rgba(0,0,0,0)"); mask.addColorStop(1, "rgba(0,0,0,1)");
    context!.fillStyle = mask; context!.fillRect(0, 0, 1, 1);
    context!.restore();
    context!.globalCompositeOperation = "source-over";
  }
  // Resize is driven by the controller so a failing canvas also uses classic boot.
  prepare();
  reveal(0);
  return {
    reveal: (progress) => {
      if (disposed) return;
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) prepare();
      reveal(progress);
    },
    dispose: () => { disposed = true; canvas.width = canvas.height = plate.width = plate.height = 1; },
  };
}
