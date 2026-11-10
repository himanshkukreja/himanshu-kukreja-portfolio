/** The confetti canvas (loaded only when a win happens; see celebrate.ts). Particles fly from `origin`, fall and fade over about 1.2 s. */
import { CONFETTI_COLORS } from "./celebrate";

type P = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; delay: number };

const LIFE_MS = 1200;

export function burst(origin: { x: number; y: number }, opts: { count: number; speed: number; waves: number }): void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "70" });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const parts: P[] = [];
  for (let w = 0; w < opts.waves; w++) {
    for (let i = 0; i < opts.count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // mostly upward, wide fan
      const s = opts.speed * (0.45 + Math.random() * 0.65);
      parts.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: w * 220,
      });
    }
  }
  const total = LIFE_MS + (opts.waves - 1) * 220;
  const t0 = performance.now();
  let last = t0;
  const frame = (now: number) => {
    const t = now - t0;
    const dt = Math.min(2, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      const age = t - p.delay;
      if (age < 0) continue;
      p.vy += 0.38 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / LIFE_MS);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < total) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
