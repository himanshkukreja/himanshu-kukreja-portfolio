"use client";

/**
 * The "grid" view: a grid of cells (open, wall, start S, goal G) with a search drawn on it (src/lib/dsa/viz/search.ts):
 * cells waiting in the frontier (dashed), cells done (tinted) with their BFS distance or DFS visit number, the current
 * cell (solid), cells that just joined (ringed), neighbours skipped as already visited, and the final path. Beside the
 * grid (below it on phones) the frontier itself: the queue (front first) or the call stack (bottom first).
 *
 * The frontier panel and the cell colours are kept apart from the geometry (FrontierPanel, cellTone), so a graph view
 * (nodes and edges) can draw the same SearchState with its own layout.
 */
import type { GridState } from "@/lib/dsa/viz/grid";
import { cellName, describeGrid } from "@/lib/dsa/viz/grid";
import type { SearchState } from "@/lib/dsa/viz/search";

const CELL = 44;
const PAD = 22;

export { describeGrid };

/** How one node looks in a search: shared by every view that draws a SearchState. */
export function nodeTone(se: SearchState | null, n: number): "current" | "path" | "frontier" | "done" | "left" | "plain" {
  if (!se) return "plain";
  if (se.current === n) return "current";
  if (se.path.includes(n)) return "path";
  if (se.left === n) return "left";
  if (se.status[n] === "frontier") return "frontier";
  if (se.status[n] === "done") return "done";
  return "plain";
}

/** The queue or the call stack, as a row of chips with its two ends named. */
export function FrontierPanel({ se, name }: { se: SearchState; name: (n: number) => string }) {
  const bfs = se.algo === "bfs";
  const items = se.frontier;
  const MAX = 18;
  const shown = items.length > MAX ? (bfs ? items.slice(0, MAX) : items.slice(-MAX)) : items;
  const hidden = items.length - shown.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" aria-hidden>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
        {bfs ? "Queue" : "Call stack"} · {items.length} {bfs ? "waiting" : "deep"} · max {se.maxFrontier}
      </span>
      <div className="flex flex-wrap items-center gap-1 font-mono text-[12px]">
        <span className="text-[10px] uppercase text-fg-4">{bfs ? "front" : "bottom"}</span>
        {!bfs && hidden > 0 && <span className="text-fg-3">+{hidden}</span>}
        {shown.length === 0 && <span className="text-fg-3">empty</span>}
        {shown.map((n, i) => {
          const fresh = se.fresh.includes(n);
          const hot = bfs ? i === 0 : i === shown.length - 1;
          return (
            <span
              key={`${n}-${i}`}
              className={`whitespace-nowrap border px-1.5 py-0.5 ${hot ? "border-signal bg-signal text-on-signal" : fresh ? "border-signal bg-[var(--c-dsa-hl)] text-fg" : "border-line-strong bg-surface text-fg-2"}`}
            >
              {name(n).replace(/\s/g, "")}
              {bfs && <span className={hot ? "" : "text-fg-3"}> d{se.label[n]}</span>}
            </span>
          );
        })}
        {bfs && hidden > 0 && <span className="text-fg-3">+{hidden}</span>}
        <span className="text-[10px] uppercase text-fg-4">{bfs ? "back" : "top"}</span>
      </div>
    </div>
  );
}

export default function GridView({ state, t }: { state: GridState; prev: GridState | null; t: number }) {
  const { rows, cols, walls, start, goal, search: se } = state;
  const width = PAD + cols * CELL + 4;
  const height = PAD + rows * CELL + 4;
  const x = (c: number) => PAD + c * CELL;
  const y = (r: number) => PAD + r * CELL;
  const centre = (n: number) => [x(n % cols) + CELL / 2, y(Math.floor(n / cols)) + CELL / 2];
  const pathD = se && se.path.length > 1 ? se.path.map((n, i) => `${i ? "L" : "M"}${centre(n).join(" ")}`).join(" ") : "";
  return (
    <div className="flex flex-col gap-3 px-1 md:flex-row md:items-start md:gap-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full md:w-auto md:max-w-[60%] md:flex-1" style={{ maxHeight: 520 }} aria-hidden>
        <defs>
          <pattern id="grid-wall" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--c-surface-2)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--c-fg-3)" strokeWidth="3" />
          </pattern>
        </defs>
        {Array.from({ length: cols }, (_, c) => (
          <text key={`c${c}`} x={x(c) + CELL / 2} y={PAD - 7} textAnchor="middle" fontSize={12} className="font-mono" fill="var(--c-fg-3)">
            {c}
          </text>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <text key={`r${r}`} x={PAD - 6} y={y(r) + CELL / 2 + 4} textAnchor="end" fontSize={12} className="font-mono" fill="var(--c-fg-3)">
            {r}
          </text>
        ))}
        {walls.map((wall, n) => {
          const r = Math.floor(n / cols);
          const c = n % cols;
          const tone = wall ? "wall" : nodeTone(se, n);
          const fresh = !!se?.fresh.includes(n);
          const seen = !!se?.seen.includes(n);
          const fill =
            tone === "wall" ? "url(#grid-wall)" : tone === "current" ? "var(--c-signal)" : tone === "path" ? "var(--c-signal)" : tone === "frontier" || tone === "done" || tone === "left" ? "var(--c-dsa-hl)" : "var(--c-surface)";
          const stroke = tone === "current" || tone === "path" || tone === "frontier" || fresh ? "var(--c-signal)" : seen ? "var(--c-amber)" : "var(--c-line-strong)";
          const label = se && !wall && se.label[n] !== undefined ? String(se.label[n]) : "";
          const onSolid = tone === "current" || tone === "path";
          const letter = n === start ? "S" : n === goal ? "G" : "";
          return (
            <g key={n} opacity={tone === "left" ? 0.7 : 1}>
              <rect
                x={x(c) + 1}
                y={y(r) + 1}
                width={CELL - 2}
                height={CELL - 2}
                fill={fill}
                fillOpacity={tone === "path" ? 0.85 : tone === "done" || tone === "left" ? 0.55 : 1}
                stroke={stroke}
                strokeWidth={fresh || seen || tone === "current" ? 3 : tone === "frontier" ? 2 : 1}
                strokeDasharray={tone === "frontier" && !fresh ? "5 3" : undefined}
                opacity={fresh ? 0.4 + 0.6 * t : 1}
              />
              {letter && (
                <text x={x(c) + 5} y={y(r) + 14} fontSize={12} fontWeight={800} className="font-mono" fill={onSolid ? "var(--c-on-signal)" : "var(--c-signal-text)"}>
                  {letter}
                </text>
              )}
              {label && (
                <text x={x(c) + CELL / 2} y={y(r) + CELL / 2 + 7 + (letter ? 3 : 0)} textAnchor="middle" fontSize={label.length > 2 ? 15 : 19} fontWeight={700} className="font-mono" fill={onSolid ? "var(--c-on-signal)" : "var(--c-fg)"}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {pathD && <path d={pathD} fill="none" stroke="var(--c-on-signal)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" pathLength={1} strokeDashoffset={1 - t} opacity={0.9} />}
      </svg>
      {se && (
        <div className="flex min-w-0 flex-col gap-2 md:w-[38%] md:max-w-[340px]">
          <FrontierPanel se={se} name={(n) => cellName(cols, n)} />
          <p className="m-0 font-mono text-[11px] leading-relaxed text-fg-3">
            Numbers: {se.algo === "bfs" ? "steps from S (distance)" : "the order DFS visited the cells"}. Dashed: {se.algo === "bfs" ? "waiting in the queue" : "on the call stack"}.
          </p>
        </div>
      )}
    </div>
  );
}
