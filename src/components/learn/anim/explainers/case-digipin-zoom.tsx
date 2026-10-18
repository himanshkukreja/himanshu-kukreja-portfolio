/**
 * Case file "Building DIGIPIN": GeoHash grid subdivision for the case file's own example, Mumbai
 * (19.0760°N, 72.8777°E) → TE7UD2EVV + check character K. Every character is 5 bits, so it picks
 * 1 of 32 sub-cells (8 × 4, then 4 × 8, alternating as the bits alternate longitude / latitude).
 * The cells and the dot are computed from the real GeoHash, not drawn by hand.
 */
import { defineExplainer, ease, lerp, seg, Txt, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const B32 = "0123456789BCDEFGHJKMNPQRSTUVWXYZ";
const CODE = "TE7UD2EVV";
const CHECK = "K";
const LAT = 19.076;
const LON = 72.8777;
const LEVELS = [1, 3, 6, 9];
const SIZE: Record<number, [string, string]> = {
  0: ["whole Earth", "the whole Earth"],
  1: ["~5,000 km", "~5,000 km · continent"],
  3: ["~156 km", "~156 km · region"],
  6: ["~1.2 × 0.6 km", "~1.2 km × 0.6 km · neighborhood"],
  9: ["~4.8 m", "~4.8 m × 4.8 m · DIGIPIN"],
};

type R = { x: number; y: number; w: number; h: number };
const WIDE: R = { x: 24, y: 104, w: 272, h: 136 };
const SQ: R = { x: 56, y: 68, w: 208, h: 208 };
const panel = (n: number) => (n % 2 === 0 ? WIDE : SQ);

/** grid shape for the character at position p (0-based) and the (col, row) a 5-bit value picks; row 0 = south */
function cellOf(p: number, v: number) {
  const b = (k: number) => (v >> k) & 1;
  if (p % 2 === 0) return { cols: 8, rows: 4, col: (b(4) << 2) | (b(2) << 1) | b(0), row: (b(3) << 1) | b(1) };
  return { cols: 4, rows: 8, col: (b(3) << 1) | b(1), row: (b(4) << 2) | (b(2) << 1) | b(0) };
}
const sub = (P: R, cols: number, rows: number, col: number, row: number): R => ({ x: P.x + (col * P.w) / cols, y: P.y + P.h - ((row + 1) * P.h) / rows, w: P.w / cols, h: P.h / rows });

// bounds of every prefix of CODE (lat, lon), computed once
const BOUNDS = (() => {
  const out: { la: [number, number]; lo: [number, number] }[] = [];
  const la: [number, number] = [-90, 90];
  const lo: [number, number] = [-180, 180];
  let even = true;
  out.push({ la: [...la], lo: [...lo] });
  for (const ch of CODE) {
    const v = B32.indexOf(ch);
    for (let k = 4; k >= 0; k--) {
      const bit = (v >> k) & 1;
      const r = even ? lo : la;
      const m = (r[0] + r[1]) / 2;
      if (bit) r[0] = m;
      else r[1] = m;
      even = !even;
    }
    out.push({ la: [...la], lo: [...lo] });
  }
  return out;
})();

const lerpR = (a: R, b: R, f: number): R => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), w: lerp(a.w, b.w, f), h: lerp(a.h, b.h, f) });

function Scene({ step, t, narrow }: SceneProps) {
  const n0 = step === 0 ? 0 : LEVELS[step - 1];
  const n1 = LEVELS[Math.min(step, LEVELS.length - 1)];
  const raw = lerp(n0, n1, t);
  const n = Math.min(9, Math.floor(raw + 1e-9));
  const f = n >= 9 ? 0 : ease(raw - n);
  const P = panel(n);
  const F = n >= 9 ? P : lerpR(P, panel(n + 1), f);
  // window into P's coordinates, zooming towards the chosen sub-cell C
  let C: R = P;
  let g = { cols: 1, rows: 1, col: 0, row: 0 };
  if (n < 9) {
    g = cellOf(n, B32.indexOf(CODE[n]));
    C = sub(P, g.cols, g.rows, g.col, g.row);
  }
  const axis = (p0: number, pw: number, c0: number, cw: number) => {
    const s = Math.pow(cw / pw, f);
    const sc = cw / pw;
    const w = pw * s;
    const x = sc < 1 ? p0 + ((c0 - p0) * (1 - s)) / (1 - sc) : p0;
    return { x, w };
  };
  const ax = axis(P.x, P.w, C.x, C.w);
  const ay = axis(P.y, P.h, C.y, C.h);
  const X = (x: number) => F.x + ((x - ax.x) * F.w) / ax.w;
  const Y = (y: number) => F.y + ((y - ay.x) * F.h) / ay.w;
  const lines: string[] = [];
  const grid = (G: R, cols: number, rows: number) => {
    let d = "";
    for (let i = 1; i < cols; i++) d += `M${X(G.x + (i * G.w) / cols)} ${Y(G.y)}V${Y(G.y + G.h)}`;
    for (let j = 1; j < rows; j++) d += `M${X(G.x)} ${Y(G.y + (j * G.h) / rows)}H${X(G.x + G.w)}`;
    return d;
  };
  if (n < 9) lines.push(grid(P, g.cols, g.rows));
  const child = n < 8 ? cellOf(n + 1, 0) : null;
  const labels = (G: R, p: number) =>
    Array.from({ length: 32 }, (_, v) => {
      const c = cellOf(p, v);
      const r = sub(G, c.cols, c.rows, c.col, c.row);
      const x0 = X(r.x);
      const x1 = X(r.x + r.w);
      const y0 = Y(r.y);
      const y1 = Y(r.y + r.h);
      const cy = (y0 + y1) / 2;
      // keep the label clear of the Mumbai dot when it sits in this cell
      const hasDot = dot.x >= x0 && dot.x <= x1 && dot.y >= y0 && dot.y <= y1;
      const dy = hasDot && Math.abs(dot.y - cy) < 9 ? (dot.y > cy ? -(y1 - y0) * 0.24 : (y1 - y0) * 0.24) : 0;
      return { ch: B32[v], x: (x0 + x1) / 2, y: cy + 4 + dy, on: p < 9 && B32[v] === CODE[p] };
    });
  const bounds = BOUNDS[n];
  const dot = { x: X(P.x + ((LON - bounds.lo[0]) / (bounds.lo[1] - bounds.lo[0])) * P.w), y: Y(P.y + P.h - ((LAT - bounds.la[0]) / (bounds.la[1] - bounds.la[0])) * P.h) };
  const showLabels = n < 9;
  const size = SIZE[n] || null;
  const codeX = narrow ? 318 : 326;
  const pitch = narrow ? 25 : 24;
  return (
    <g>
      <defs>
        <clipPath id="dg-clip">
          <rect x={F.x} y={F.y} width={F.w} height={F.h} />
        </clipPath>
      </defs>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "Mumbai · 19.0760°N 72.8777°E" : "Mumbai · 19.0760°N, 72.8777°E"}
      </Txt>
      <g clipPath="url(#dg-clip)">
        <rect x={F.x} y={F.y} width={F.w} height={F.h} className="dg-cell" />
        {n < 9 && <rect x={X(C.x)} y={Y(C.y)} width={X(C.x + C.w) - X(C.x)} height={Y(C.y + C.h) - Y(C.y)} className={f > 0 ? "dg-pick" : "dg-next"} />}
        <path d={lines.join("")} className="dg-grid" />
        {child && f > 0 && <path d={grid(C, child.cols, child.rows)} className="dg-grid" opacity={seg(f, 0.5, 1)} />}
        {showLabels &&
          labels(P, n).map((l) => (
            <text key={l.ch} x={l.x} y={l.y} textAnchor="middle" className={`ax-s${l.on ? " lit" : ""}`} opacity={1 - seg(f, 0, 0.3)}>
              {l.ch}
            </text>
          ))}
        {showLabels &&
          f > 0.6 &&
          n < 8 &&
          labels(C, n + 1).map((l) => (
            <text key={`c${l.ch}`} x={l.x} y={l.y} textAnchor="middle" className="ax-s" opacity={seg(f, 0.7, 1)}>
              {l.ch}
            </text>
          ))}
        <circle cx={dot.x} cy={dot.y} r={4.5} className="dg-dot" />
      </g>
      {n >= 9 && (
        <Txt x={F.x + F.w / 2} y={F.y + F.h / 2 + 5} tone="mute">
          TE7UD2EVV
        </Txt>
      )}
      <rect x={F.x} y={F.y} width={F.w} height={F.h} className="dg-frame" />
      <Txt x={160} y={H - 16} k="s" tone={size ? "lit" : "mute"}>
        {size ? size[narrow ? 0 : 1] : `${n} characters`}
      </Txt>
      {/* the code */}
      <Txt x={codeX} y={92} k="k" anchor="start">
        DIGIPIN
      </Txt>
      {[...CODE, CHECK].map((ch, i) => {
        const done = i < n;
        const now = i === n && f > 0;
        const isCheck = i === 9;
        const lit = isCheck ? n >= 9 : done;
        return (
          <text key={i} x={codeX + i * pitch + (isCheck ? 6 : 0)} y={136} className={`dg-code${lit ? (isCheck ? " ok" : " on") : ""}`} opacity={lit ? 1 : now ? 0.4 + 0.6 * f : 0.28}>
            {ch}
          </text>
        );
      })}
      <line x1={codeX} x2={codeX + 9 * pitch - 4} y1={148} y2={148} className="dg-under" />
      <Txt x={codeX} y={176} k="s" anchor="start">
        {n >= 9 ? (narrow ? "9 + check char K" : "9 GeoHash chars + check char K") : `${n} char${n === 1 ? "" : "s"} · ${n * 5} bits`}
      </Txt>
      <Txt x={codeX} y={200} k="s" anchor="start" tone="mute">
        {narrow ? "1 of 32 per char" : "each char: 5 bits, 1 of 32 cells"}
      </Txt>
      {n >= 6 && (
        <Txt x={codeX} y={232} k="s" anchor="start" tone="sky">
          {narrow ? "TE7UD2 = cluster" : "prefix TE7UD2 = delivery cluster"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.dg-cell{fill:var(--ax-box)}.dg-frame{fill:none;stroke:var(--ax-fg3);stroke-width:1.5}.dg-grid{fill:none;stroke:var(--ax-line);stroke-width:1;vector-effect:non-scaling-stroke}.dg-pick{fill:var(--ax-accent);fill-opacity:.22;stroke:var(--ax-accent);stroke-width:2;vector-effect:non-scaling-stroke}.dg-next{fill:none;stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:3 3}.dg-dot{fill:var(--ax-accent);stroke:var(--c-bg,#000);stroke-width:2}.dg-code{font:700 30px var(--ax-mono);fill:var(--ax-fg)}.dg-code.on{fill:var(--ax-accent-text)}.dg-code.ok{fill:var(--ax-ok-text)}.dg-under{stroke:var(--ax-line);stroke-width:1.5}@container ax (max-width:520px){.dg-code{font-size:36px}}`,
  variants: [
    {
      id: "zoom",
      label: "Zoom",
      steps: [
        { caption: "Each character is 5 bits, picking 1 of 32 cells. \"T\" alone is a ~5,000 km continent cell.", tween: 1500, ms: 2800 },
        { caption: "\"TE7\" narrows it to a cell ~156 km across: a region around Mumbai.", tween: 2400, ms: 2600 },
        { caption: "\"TE7UD2\" is ~1.2 km × 0.6 km, a neighborhood; delivery clusters group by this 6-character prefix.", tween: 3000, ms: 3000 },
        { caption: "Nine characters reach a ~4.8 m cell. A check character makes the 10-character DIGIPIN, TE7UD2EVVK.", tween: 3000, ms: 3800 },
      ],
    },
  ],
  Scene,
});
