// Canvas renderer for the contribution snake. Colours come from the site's CSS tokens so
// light / dark mode follow the theme; everything here is per-frame cheap (≈400 rects + one path).

import { ROWS, type SnakeEngine } from "./engine";

type RGB = [number, number, number];

export type Palette = {
  levels: RGB[]; // 0..4
  snake: RGB;
  eye: string;
  label: string;
  glow: boolean;
  font: string;
};

export type Layout = {
  cols: number;
  pitch: number;
  cell: number;
  gutterL: number;
  gutterT: number;
  width: number;
  height: number;
  months: { col: number; text: string }[];
  dayLabels: boolean;
};

function toRgb(ctx: CanvasRenderingContext2D, css: string, fallback: RGB): RGB {
  ctx.fillStyle = "#000";
  ctx.fillStyle = css.trim() || "#000";
  const v = String(ctx.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);

export function readPalette(ctx: CanvasRenderingContext2D, el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n);
  const empty = toRgb(ctx, v("--c-surface-2"), [20, 20, 22]);
  const surface = toRgb(ctx, v("--c-surface"), [10, 10, 11]);
  const signal = toRgb(ctx, v("--c-signal"), [255, 107, 43]);
  const dark = surface[0] + surface[1] + surface[2] < 200;
  // Level ramp: tinted toward the signal from the empty cell. Light mode needs more ink earlier.
  const ramp = dark ? [0, 0.3, 0.52, 0.74, 0.9] : [0, 0.3, 0.52, 0.76, 0.92];
  const levels = ramp.map((t) => mix(empty, signal, t));
  const mono = (v("--font-geist-mono") || "").trim();
  return {
    levels,
    // Snake is brighter than any cell in dark mode and deeper in light mode, so it always reads on top.
    snake: dark ? mix(signal, [255, 236, 220], 0.12) : mix(signal, [120, 30, 0], 0.18),
    eye: css(toRgb(ctx, v("--c-on-signal"), [18, 7, 0])),
    label: css(toRgb(ctx, v("--c-fg-4"), [126, 126, 133])),
    glow: dark,
    font: `${mono ? `${mono}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`,
  };
}

export function cellXY(L: Layout, idx: number): [number, number] {
  const c = Math.floor(idx / ROWS);
  const r = idx % ROWS;
  return [L.gutterL + c * L.pitch, L.gutterT + r * L.pitch];
}

const EAT_FADE = 380;
const GROW_FADE = 520;

export function draw(
  ctx: CanvasRenderingContext2D,
  eng: SnakeEngine,
  P: Palette,
  L: Layout,
  now: number,
  hover: number,
  showSnake: boolean
) {
  ctx.clearRect(0, 0, L.width, L.height);

  // Labels
  const fs = L.pitch >= 14 ? 11 : 10;
  ctx.font = `${fs}px ${P.font}`;
  ctx.fillStyle = P.label;
  ctx.textBaseline = "alphabetic";
  if (L.gutterT > 0) for (const m of L.months) ctx.fillText(m.text, L.gutterL + m.col * L.pitch, L.gutterT - 6);
  if (L.dayLabels) {
    ctx.textBaseline = "middle";
    for (const [r, t] of [
      [1, "Mon"],
      [3, "Wed"],
      [5, "Fri"],
    ] as const)
      ctx.fillText(t, 0, L.gutterT + r * L.pitch + L.cell / 2);
  }

  // Cells
  const empty = P.levels[0];
  for (let i = 0; i < eng.size; i++) {
    const c = eng.cells[i];
    if (!c) continue;
    const [x, y] = cellXY(L, i);
    const base = P.levels[Math.max(0, Math.min(4, c.level))];
    let col = base;
    let scale = 1;
    const e = eng.eatenAt[i];
    if (e) {
      const t = Math.min(1, (now - e) / EAT_FADE);
      col = mix(base, empty, t);
      scale = t < 1 ? 1 - 0.35 * Math.sin(t * Math.PI) : 1;
    } else if (eng.restoredAt[i] && now < eng.restoredAt[i] + GROW_FADE) {
      const t = Math.max(0, (now - eng.restoredAt[i]) / GROW_FADE);
      col = mix(empty, base, t);
    }
    ctx.fillStyle = css(col);
    if (scale !== 1) {
      const s = L.cell * scale;
      const o = (L.cell - s) / 2;
      ctx.fillRect(x + o, y + o, s, s);
    } else ctx.fillRect(x, y, L.cell, L.cell);
    if (i === hover) {
      ctx.strokeStyle = P.label;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, L.cell + 1, L.cell + 1);
    }
  }

  if (!showSnake || !eng.snake.length) return;

  // Snake: centres interpolated between steps; wrap-around jumps snap instead of sliding across the grid.
  const t = eng.interp(now);
  const half = L.cell / 2;
  const pts: [number, number][] = eng.snake.map((idx, k) => {
    const from = eng.prev[k] ?? idx;
    const [ax, ay] = cellXY(L, from);
    const [bx, by] = cellXY(L, idx);
    if (Math.abs(ax - bx) > L.pitch * 1.5 || Math.abs(ay - by) > L.pitch * 1.5) return [bx + half, by + half];
    return [ax + (bx - ax) * t + half, ay + (by - ay) * t + half];
  });
  const n = pts.length;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = n - 1; k > 0; k--) {
    const a = pts[k];
    const b = pts[k - 1];
    if (Math.abs(a[0] - b[0]) > L.pitch * 1.5 || Math.abs(a[1] - b[1]) > L.pitch * 1.5) continue;
    const f = 1 - k / Math.max(n, 6); // tail is thinner and softer
    ctx.strokeStyle = css(mix(P.snake, P.levels[0], 0.5 * (1 - f)));
    ctx.lineWidth = Math.max(2, L.cell * (0.5 + 0.38 * f));
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // Head
  const [hx, hy] = pts[0];
  const hs = L.cell * 1.08;
  ctx.fillStyle = css(P.snake);
  if (P.glow) {
    ctx.shadowColor = "rgba(255,107,43,0.75)";
    ctx.shadowBlur = Math.max(6, L.cell * 0.9);
  }
  ctx.beginPath();
  const rr = hs * 0.32;
  if (typeof ctx.roundRect === "function") ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, rr);
  else ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (L.cell >= 7) {
    // Eyes look where the snake is heading.
    const d = eng.dir;
    const fx = d === 1 ? 1 : d === 3 ? -1 : 0;
    const fy = d === 2 ? 1 : d === 0 ? -1 : 0;
    const px = -fy;
    const py = fx;
    const er = Math.max(1, L.cell * 0.11);
    ctx.fillStyle = P.eye;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + fx * hs * 0.16 + px * s * hs * 0.22, hy + fy * hs * 0.16 + py * s * hs * 0.22, er, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "+N" pops in play mode
  if (eng.mode !== "attract" && L.cell >= 8) {
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${Math.max(10, Math.round(L.cell * 0.75))}px ${P.font}`;
    for (const p of eng.pops) {
      const age = (now - p.t) / 700;
      if (age >= 1) continue;
      const [x, y] = cellXY(L, p.idx);
      ctx.fillStyle = css(P.snake, 1 - age);
      ctx.fillText(`+${p.n}`, x + half, y - 2 - age * L.pitch * 1.4);
    }
    ctx.textAlign = "start";
  }
}
