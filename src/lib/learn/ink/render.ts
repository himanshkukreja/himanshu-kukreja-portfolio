/**
 * Notebook pages: drawing. One set of functions draws a page for the live editor (ink layers), the thumbnails in
 * the Pages tab and renderPagePng (paper + ink + items, for the AI and export), so all three look the same.
 *
 * Strokes are outlined with perfect-freehand (MIT) once per stroke object and cached as Path2D in page units; a
 * layer is drawn by filling one combined path per colour (a handful of fill calls, not one per stroke), which is
 * what keeps panning and zooming smooth with thousands of strokes.
 */
import { getStroke, type StrokeOptions } from "perfect-freehand";
import { CLIP, TEXT, Q } from "./geometry";
import { PAGE_H, PAGE_W, type InkColor, type PageItem, type Paper, type Stroke } from "./types";

export type InkTheme = "light" | "dark";

// ------------------------------------------------------------------ colours (no purple)

/** Ink per theme: every colour keeps a strong contrast on its sheet (light sheet #FFFFFF, dark sheet #111113). */
export const INK: Record<InkTheme, Record<InkColor, string>> = {
  light: { ink: "#141414", signal: "#D9480F", teal: "#0F766E", grey: "#6B6B72", red: "#C81E1E" },
  dark: { ink: "#F3F2EE", signal: "#FF7A3D", teal: "#2DD4BF", grey: "#A3A3A8", red: "#FF6B6B" },
};
/** Highlighter per theme (drawn translucent under the ink): "ink" is the classic yellow marker. */
export const MARKER: Record<InkTheme, Record<InkColor, string>> = {
  light: { ink: "#FFD43B", signal: "#FF922B", teal: "#38D9A9", grey: "#ADB5BD", red: "#FF8787" },
  dark: { ink: "#FAB005", signal: "#FF6B2B", teal: "#12B886", grey: "#868E96", red: "#F03E3E" },
};
export const MARKER_ALPHA: Record<InkTheme, number> = { light: 0.38, dark: 0.34 };

export const INK_LABEL: Record<InkColor, string> = { ink: "Ink", signal: "Orange", teal: "Teal", grey: "Grey", red: "Red" };
export const MARKER_LABEL: Record<InkColor, string> = { ink: "Yellow", signal: "Orange", teal: "Green", grey: "Grey", red: "Pink" };

export const SHEET: Record<InkTheme, { bg: string; faint: string; line: string; strong: string; margin: string; label: string; card: string; cardLine: string; text: string; muted: string }> = {
  light: { bg: "#FFFFFF", faint: "#EDEBE5", line: "#DCDAD3", strong: "#B9B7AF", margin: "rgba(255,107,43,0.55)", label: "#7A7A80", card: "#F7F6F2", cardLine: "#D4D2CB", text: "#141414", muted: "#6B6B72" },
  dark: { bg: "#111113", faint: "#1E1E22", line: "#2A2A2F", strong: "#3E3E45", margin: "rgba(255,107,43,0.5)", label: "#85858C", card: "#18181B", cardLine: "#34343A", text: "#F3F2EE", muted: "#A3A3A8" },
};

export const PEN_SIZES = [2.6, 4.2, 7] as const;
export const MARKER_SIZE = 24;

// ------------------------------------------------------------------ strokes

export function strokeOptions(s: Pick<Stroke, "tool" | "size">, simulate: boolean, last: boolean): StrokeOptions {
  if (s.tool === "highlighter")
    return { size: s.size, thinning: 0, smoothing: 0.5, streamline: 0.4, simulatePressure: false, start: { cap: true, taper: 0 }, end: { cap: true, taper: 0 }, last };
  return {
    size: s.size,
    thinning: simulate ? 0.5 : 0.62,
    smoothing: 0.55,
    streamline: 0.32,
    simulatePressure: simulate,
    easing: (t) => t,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last,
  };
}

/** perfect-freehand input from flat pts; a stroke whose first pressure is 0 simulates pressure. */
export function strokeInput(pts: number[], n = pts.length): { points: number[][]; simulate: boolean } {
  const simulate = !(pts[2] > 0);
  const count = Math.floor(n / 3);
  const points: number[][] = new Array(count);
  for (let j = 0; j < count; j++) points[j] = [pts[j * 3] / Q, pts[j * 3 + 1] / Q, simulate ? 0.5 : pts[j * 3 + 2] / 100];
  return { points, simulate };
}

/** SVG path data for a perfect-freehand outline (quadratic midpoints; closed). */
export function outlinePathData(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  let d = `M${r(outline[0][0])},${r(outline[0][1])}Q`;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    d += `${r(a[0])},${r(a[1])} ${r((a[0] + b[0]) / 2)},${r((a[1] + b[1]) / 2)} `;
  }
  return `${d}Z`;
}

export function outlineFor(s: Pick<Stroke, "tool" | "size" | "pts">, last = true): number[][] {
  const { points, simulate } = strokeInput(s.pts);
  return getStroke(points, strokeOptions(s, simulate, last));
}

const pathCache = new WeakMap<Stroke, Path2D>();
/** The stroke's filled outline as a Path2D in page units (cached per stroke object). */
export function strokePath(s: Stroke): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = new Path2D(outlinePathData(outlineFor(s)));
    pathCache.set(s, p);
  }
  return p;
}

/** Path data of a stroke (for SVG exports). */
export const strokePathData = (s: Stroke) => outlinePathData(outlineFor(s));

/** One combined path per colour, for one layer (pen or highlighter). */
export type Layer = Map<InkColor, Path2D>;
export function buildLayer(strokes: Stroke[], tool: Stroke["tool"], skip?: Set<string> | null): Layer {
  const m: Layer = new Map();
  for (const s of strokes) {
    if (s.tool !== tool || (skip && skip.has(s.id))) continue;
    let p = m.get(s.color);
    if (!p) m.set(s.color, (p = new Path2D()));
    p.addPath(strokePath(s));
  }
  return m;
}
export function addToLayer(layer: Layer, s: Stroke) {
  let p = layer.get(s.color);
  if (!p) layer.set(s.color, (p = new Path2D()));
  p.addPath(strokePath(s));
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function fillLayer(ctx: Ctx, layer: Layer, tool: Stroke["tool"], theme: InkTheme) {
  if (tool === "highlighter") {
    ctx.save();
    ctx.globalAlpha = MARKER_ALPHA[theme];
    layer.forEach((p, c) => {
      ctx.fillStyle = MARKER[theme][c] || MARKER[theme].ink;
      ctx.fill(p);
    });
    ctx.restore();
    return;
  }
  layer.forEach((p, c) => {
    ctx.fillStyle = INK[theme][c] || INK[theme].ink;
    ctx.fill(p);
  });
}

/** Draw one stroke (live drawing / incremental commit). */
export function fillStroke(ctx: Ctx, s: Stroke, theme: InkTheme, path?: Path2D) {
  ctx.save();
  if (s.tool === "highlighter") {
    ctx.globalAlpha = MARKER_ALPHA[theme];
    ctx.fillStyle = MARKER[theme][s.color] || MARKER[theme].ink;
  } else ctx.fillStyle = INK[theme][s.color] || INK[theme].ink;
  ctx.fill(path || strokePath(s));
  ctx.restore();
}

// ------------------------------------------------------------------ paper

export type PaperLine = { x1: number; y1: number; x2: number; y2: number; tone: "faint" | "line" | "strong" | "margin" };
export type PaperSpec = {
  lines: PaperLine[];
  dots: { gap: number; r: number; x0: number; y0: number; x1: number; y1: number } | null;
  boxes: { x: number; y: number; w: number; h: number; label: string }[];
  labels: { x: number; y: number; text: string }[];
};

export const INTERVIEW_BOXES = [
  { x: 40, y: 40, w: 455, h: 250, label: "Requirements" },
  { x: 505, y: 40, w: 455, h: 250, label: "Estimates" },
  { x: 40, y: 300, w: 455, h: 250, label: "API" },
  { x: 505, y: 300, w: 455, h: 250, label: "Data model" },
  { x: 40, y: 560, w: 920, h: 480, label: "High-level design" },
  { x: 40, y: 1050, w: 590, h: 324, label: "Deep dives" },
  { x: 640, y: 1050, w: 320, h: 324, label: "Trade-offs" },
];

const specCache = new Map<Paper, PaperSpec>();
/** The paper's lines, dots, boxes and labels in page units. */
export function paperSpec(paper: Paper): PaperSpec {
  const hit = specCache.get(paper);
  if (hit) return hit;
  const spec: PaperSpec = { lines: [], dots: null, boxes: [], labels: [] };
  const hline = (y: number, x1 = 0, x2 = PAGE_W, tone: PaperLine["tone"] = "line") => spec.lines.push({ x1, y1: y, x2, y2: y, tone });
  if (paper === "ruled") {
    for (let y = 148; y < PAGE_H - 40; y += 36) hline(y);
    spec.lines.push({ x1: 96, y1: 0, x2: 96, y2: PAGE_H, tone: "margin" });
  } else if (paper === "grid") {
    for (let y = 25; y < PAGE_H; y += 25) hline(y, 0, PAGE_W, y % 125 === 0 ? "line" : "faint");
    for (let x = 25; x < PAGE_W; x += 25) spec.lines.push({ x1: x, y1: 0, x2: x, y2: PAGE_H, tone: x % 125 === 0 ? "line" : "faint" });
  } else if (paper === "dot") {
    spec.dots = { gap: 25, r: 1.7, x0: 25, y0: 25, x1: PAGE_W - 1, y1: PAGE_H - 1 };
  } else if (paper === "cornell") {
    hline(110, 0, PAGE_W, "strong");
    hline(1150, 0, PAGE_W, "strong");
    spec.lines.push({ x1: 280, y1: 110, x2: 280, y2: 1150, tone: "strong" });
    for (let y = 166; y < 1150; y += 36) hline(y, 296, PAGE_W - 24);
    for (let y = 1222; y < PAGE_H - 30; y += 36) hline(y, 24, PAGE_W - 24);
    spec.labels.push({ x: 24, y: 40, text: "TOPIC" }, { x: 24, y: 136, text: "CUES · QUESTIONS" }, { x: 296, y: 136, text: "NOTES" }, { x: 24, y: 1176, text: "SUMMARY" });
  } else if (paper === "interview") {
    spec.boxes = INTERVIEW_BOXES;
    spec.dots = { gap: 25, r: 1.2, x0: 25, y0: 25, x1: PAGE_W - 1, y1: PAGE_H - 1 };
  }
  specCache.set(paper, spec);
  return spec;
}

/** Draw the sheet and its paper in page units (the caller has set the page → canvas transform). */
export function drawPaper(ctx: Ctx, paper: Paper, theme: InkTheme) {
  const c = SHEET[theme];
  const spec = paperSpec(paper);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (spec.dots) {
    const d = spec.dots;
    ctx.fillStyle = paper === "interview" ? c.line : c.strong;
    const s = d.r * 2;
    for (let y = d.y0; y < d.y1; y += d.gap) for (let x = d.x0; x < d.x1; x += d.gap) ctx.fillRect(x - d.r, y - d.r, s, s);
  }
  ctx.lineWidth = 1.2;
  for (const l of spec.lines) {
    ctx.strokeStyle = l.tone === "margin" ? c.margin : l.tone === "strong" ? c.strong : l.tone === "faint" ? c.faint : c.line;
    ctx.lineWidth = l.tone === "line" || l.tone === "faint" ? 1.1 : 1.6;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  ctx.font = `600 15px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textBaseline = "alphabetic";
  for (const b of spec.boxes) {
    ctx.fillStyle = c.bg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = c.strong;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = c.label;
    ctx.fillText(b.label.toUpperCase(), b.x + 14, b.y + 28);
  }
  ctx.fillStyle = c.label;
  for (const t of spec.labels) ctx.fillText(t.text, t.x, t.y);
}

// ------------------------------------------------------------------ items

/** Wrap text to a width with the context's current font. */
export function wrapText(ctx: Ctx, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (line && ctx.measureText(next).width > width) {
        out.push(line.trimEnd());
        line = w.trimStart();
        // a single word wider than the box: hard-break it
        while (ctx.measureText(line).width > width && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && ctx.measureText(line.slice(0, k)).width > width) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

const SANS = `ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, "SF Mono", Menlo, monospace`;

/**
 * Draw the page's items: clips as cards with their source, text boxes as text, snips as their image (from
 * `images`, keyed by storage path) or a placeholder. `detail: false` draws text as bars (thumbnails).
 */
export function drawItems(ctx: Ctx, items: PageItem[], theme: InkTheme, images: Map<string, CanvasImageSource>, detail = true) {
  const c = SHEET[theme];
  for (const it of items) {
    if (it.kind === "snip") {
      const img = images.get(it.path);
      if (img) ctx.drawImage(img, it.x, it.y, it.w, it.h);
      else {
        ctx.fillStyle = c.card;
        ctx.fillRect(it.x, it.y, it.w, it.h);
      }
      ctx.strokeStyle = c.cardLine;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(it.x, it.y, it.w, it.h);
      continue;
    }
    if (it.kind === "clip") {
      ctx.font = `${CLIP.font}px ${SANS}`;
      const lines = detail ? wrapText(ctx, it.text, it.w - CLIP.pad * 2) : [];
      const n = detail ? lines.length : Math.max(1, Math.ceil((it.text.length * CLIP.font * 0.5) / (it.w - CLIP.pad * 2)));
      const h = CLIP.pad * 2 + CLIP.head + n * CLIP.line;
      ctx.fillStyle = c.card;
      ctx.fillRect(it.x, it.y, it.w, h);
      ctx.strokeStyle = c.cardLine;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(it.x, it.y, it.w, h);
      ctx.fillStyle = "#FF6B2B";
      ctx.fillRect(it.x, it.y, 4, h);
      if (!detail) {
        ctx.fillStyle = c.cardLine;
        for (let i = 0; i < n; i++) ctx.fillRect(it.x + CLIP.pad, it.y + CLIP.pad + CLIP.head + i * CLIP.line + 8, (it.w - CLIP.pad * 2) * (i === n - 1 ? 0.6 : 1), 12);
        continue;
      }
      ctx.fillStyle = c.muted;
      ctx.font = `600 14px ${MONO}`;
      const src = `CLIP · ${it.source.title}`.toUpperCase();
      ctx.fillText(src.length > 60 ? `${src.slice(0, 58)}…` : src, it.x + CLIP.pad, it.y + CLIP.pad + 16);
      ctx.fillStyle = c.text;
      ctx.font = `${CLIP.font}px ${SANS}`;
      lines.forEach((l, i) => ctx.fillText(l, it.x + CLIP.pad, it.y + CLIP.pad + CLIP.head + (i + 1) * CLIP.line - 8));
      continue;
    }
    // text box
    ctx.font = `${TEXT.font}px ${SANS}`;
    if (!detail) {
      const n = Math.max(1, Math.ceil((it.text.length * TEXT.font * 0.5) / (it.w - TEXT.pad * 2)));
      ctx.fillStyle = c.strong;
      for (let i = 0; i < n; i++) ctx.fillRect(it.x + TEXT.pad, it.y + TEXT.pad + i * TEXT.line + 10, (it.w - TEXT.pad * 2) * (i === n - 1 ? 0.5 : 0.95), 12);
      continue;
    }
    ctx.fillStyle = c.text;
    wrapText(ctx, it.text, it.w - TEXT.pad * 2).forEach((l, i) => ctx.fillText(l, it.x + TEXT.pad, it.y + TEXT.pad + (i + 1) * TEXT.line - 9));
  }
}

/** Paper, items, highlighter, ink: the whole page in page units onto a context already scaled to it. */
export function drawPage(ctx: Ctx, page: { paper: Paper; strokes: Stroke[]; items: PageItem[] }, theme: InkTheme, images: Map<string, CanvasImageSource>, detail = true) {
  drawPaper(ctx, page.paper, theme);
  drawItems(ctx, page.items, theme, images, detail);
  fillLayer(ctx, buildLayer(page.strokes, "highlighter"), "highlighter", theme);
  fillLayer(ctx, buildLayer(page.strokes, "pen"), "pen", theme);
}
