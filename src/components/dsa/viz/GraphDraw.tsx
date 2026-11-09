"use client";

/**
 * The drawing behind the graph view: a GraphState drawn as vertices on a ring joined by edges (arrows when directed, with a
 * weight beside each edge when weighted) and, by `show`, its adjacency list (a row of boxes for each vertex) and its adjacency
 * matrix (an n by n grid). Used by the step player's view (GraphView.tsx, themed with CSS variables) and by the lecture
 * stage's `graph` scene (DsaGraphScene.tsx, the stage's own colours).
 *
 * The vertex being worked on has the accent ring (and so has its list row and matrix row). The edge added, read or checked is
 * drawn heavy in the accent, with its list entry and its matrix cell filled. Vertices lit this step are tinted.
 */
import type { GraphState } from "@/lib/dsa/viz/types";
import { adjacency } from "@/lib/dsa/viz/graph";
import type { TreePalette } from "./TreeDraw";

const MONO = "ui-monospace, monospace";
const R = 17;

export function describeGraph(s: GraphState): string {
  const e = s.edges.length;
  const list = s.edges.map((x) => `${x.a}${s.directed ? " to " : " and "}${x.b}${x.w !== null ? ` (weight ${x.w})` : ""}`).join(", ");
  const cur = s.current !== null ? ` Working on vertex ${s.current}.` : "";
  const ed = s.edge ? ` Edge ${s.edge[0]} ${s.directed ? "to" : "and"} ${s.edge[1]} in focus.` : "";
  return `${s.directed ? "Directed" : "Undirected"} graph of ${s.n} vertices and ${e} edge${e === 1 ? "" : "s"}${e ? `: ${list}` : ""}.${cur}${ed}${s.out ? ` ${s.out}.` : ""}`;
}

const isEdge = (s: GraphState, a: number, b: number) => !!s.edge && ((s.edge[0] === a && s.edge[1] === b) || (!s.directed && s.edge[0] === b && s.edge[1] === a));

function GraphSvg({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const W = 300;
  const H = 250;
  const cx = W / 2;
  const cy = H / 2;
  const rad = s.n <= 2 ? 60 : 92;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / s.n;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const mark = new Set(s.mark);
  const path = new Set(s.path);
  const labelsAt = new Map<number, string[]>();
  for (const [name, id] of Object.entries(s.labels)) if (id !== null && id < s.n) labelsAt.set(id, [...(labelsAt.get(id) ?? []), name]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="presentation" style={{ width: "100%", height: "auto", display: "block" }}>
      {s.edges.map((e, k) => {
        const p = pos(e.a);
        const q = pos(e.b);
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const hot = isEdge(s, e.a, e.b);
        const color = hot ? pal.sig : pal.stroke;
        const x1 = p.x + ux * R;
        const y1 = p.y + uy * R;
        const x2 = q.x - ux * (R + (s.directed ? 1 : 0));
        const y2 = q.y - uy * (R + (s.directed ? 1 : 0));
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={k}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={hot ? 4 : 1.8} />
            {s.directed && <polygon points={`${x2},${y2} ${x2 - ux * 10 - uy * 5},${y2 - uy * 10 + ux * 5} ${x2 - ux * 10 + uy * 5},${y2 - uy * 10 - ux * 5}`} fill={color} />}
            {e.w !== null && (
              <g>
                <rect x={mx - 9} y={my - 9} width={18} height={16} fill={pal.surface} stroke={hot ? pal.sig : pal.faint} strokeWidth={1} />
                <text x={mx} y={my + 4} textAnchor="middle" fontSize={11 * fs} fontWeight={700} fill={pal.ink} fontFamily={MONO}>
                  {e.w}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {Array.from({ length: s.n }, (_, i) => {
        const { x, y } = pos(i);
        const cur = s.current === i;
        const lit = mark.has(i) || path.has(i);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={R} fill={cur ? pal.sig : lit ? pal.hl : pal.surface} stroke={cur || lit ? pal.sig : pal.stroke} strokeWidth={cur ? 3.2 : lit ? 2.4 : 1.6} />
            <text x={x} y={y + 5 * fs} textAnchor="middle" fontSize={15 * fs} fontWeight={700} fill={cur ? pal.onSig : pal.ink} fontFamily={MONO}>
              {i}
            </text>
            {labelsAt.has(i) && (
              <text x={x} y={y - R - 6} textAnchor="middle" fontSize={11 * fs} fontWeight={700} fill={pal.sig} fontFamily={MONO}>
                {labelsAt.get(i)!.join(" ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ListSvg({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const rows = adjacency(s);
  const CW = 38;
  const RH = 31;
  const widest = Math.max(1, ...rows.map((r) => r.length));
  const width = 40 + widest * CW + 6;
  const height = s.n * RH + 6;
  const mark = new Set(s.mark);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="presentation" style={{ width: "100%", height: "auto", display: "block" }}>
      {rows.map((row, i) => {
        const y = 3 + i * RH;
        const cur = s.current === i;
        return (
          <g key={i}>
            <rect x={2} y={y} width={32} height={RH - 5} fill={cur ? pal.sig : mark.has(i) ? pal.hl : pal.surface} stroke={cur ? pal.sig : pal.stroke} strokeWidth={cur ? 2.4 : 1.4} />
            <text x={18} y={y + (RH - 5) / 2 + 5 * fs} textAnchor="middle" fontSize={14 * fs} fontWeight={700} fill={cur ? pal.onSig : pal.ink} fontFamily={MONO}>
              {i}
            </text>
            {row.length === 0 && (
              <text x={44} y={y + (RH - 5) / 2 + 4 * fs} fontSize={11.5 * fs} fill={pal.sub} fontFamily={MONO}>
                empty
              </text>
            )}
            {row.map((x, j) => {
              const bx = 40 + j * CW;
              const hot = isEdge(s, i, x.to) && s.edge !== null && (s.edge[0] === i ? s.edge[1] === x.to : !s.directed);
              const lit = mark.has(x.to) && cur;
              return (
                <g key={j}>
                  <rect x={bx} y={y} width={CW - 6} height={RH - 5} fill={hot ? pal.sig : lit ? pal.hl : pal.surface} stroke={hot || cur ? pal.sig : pal.stroke} strokeWidth={hot ? 2.6 : 1.4} />
                  <text x={bx + (CW - 6) / 2} y={y + (RH - 5) / 2 + 5 * fs} textAnchor="middle" fontSize={(x.w !== null ? 11 : 14) * fs} fontWeight={700} fill={hot ? pal.onSig : pal.ink} fontFamily={MONO}>
                    {x.w !== null ? `${x.to}:${x.w}` : x.to}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function MatrixSvg({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const C = 29;
  const size = 24 + s.n * C + 4;
  const cell = new Map<string, number | null>();
  for (const e of s.edges) {
    cell.set(`${e.a},${e.b}`, e.w);
    if (!s.directed) cell.set(`${e.b},${e.a}`, e.w);
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="presentation" style={{ width: "100%", height: "auto", display: "block", maxWidth: 300 }}>
      {Array.from({ length: s.n }, (_, i) => (
        <g key={i}>
          <text x={24 + i * C + C / 2} y={15} textAnchor="middle" fontSize={11.5 * fs} fontWeight={s.current === i ? 800 : 500} fill={s.current === i ? pal.sig : pal.sub} fontFamily={MONO}>
            {i}
          </text>
          <text x={11} y={24 + i * C + C / 2 + 4 * fs} textAnchor="middle" fontSize={11.5 * fs} fontWeight={s.current === i ? 800 : 500} fill={s.current === i ? pal.sig : pal.sub} fontFamily={MONO}>
            {i}
          </text>
          {Array.from({ length: s.n }, (_, j) => {
            const on = cell.has(`${i},${j}`);
            const w = cell.get(`${i},${j}`);
            const hot = isEdge(s, i, j);
            const row = s.current === i;
            return (
              <g key={j}>
                <rect x={24 + j * C} y={24 + i * C} width={C - 2} height={C - 2} fill={hot ? pal.sig : row ? pal.hl : on ? pal.surface : "transparent"} stroke={hot ? pal.sig : pal.faint} strokeWidth={hot ? 2.6 : 1} />
                <text x={24 + j * C + (C - 2) / 2} y={24 + i * C + (C - 2) / 2 + 4.5 * fs} textAnchor="middle" fontSize={12.5 * fs} fontWeight={700} fill={hot ? pal.onSig : on ? pal.ink : pal.faint} fontFamily={MONO}>
                  {on ? (w !== null && w !== undefined ? w : 1) : 0}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export default function GraphDraw({
  state,
  pal,
  fs = 1,
  stack = false,
  style,
  className,
}: {
  state: GraphState;
  prev?: GraphState | null;
  t?: number;
  pal: TreePalette;
  /** type scale for the text (the vertical short draws bigger) */
  fs?: number;
  /** put the panels one under the other (the phone-shaped short) instead of side by side */
  stack?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const g = state.show === "graph" || state.show === "both" || state.show === "all";
  const list = state.show === "list" || state.show === "both" || state.show === "all";
  const matrix = state.show === "matrix" || state.show === "all";
  const panels = [g, list, matrix].filter(Boolean).length;
  const side = !stack && panels > 1;
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }} role="img" aria-label={describeGraph(state)}>
      <div style={{ display: "flex", flexDirection: side ? "row" : "column", alignItems: side ? "center" : "stretch", justifyContent: "center", gap: 14, width: "100%" }}>
        {g && (
          <div style={{ flex: side ? "1 1 0" : undefined, minWidth: 0, width: side ? undefined : "min(100%, 340px)", margin: side ? undefined : "0 auto" }}>
            <GraphSvg s={state} pal={pal} fs={fs} />
          </div>
        )}
        {(list || matrix) && (
          <div style={{ flex: side ? "1 1 0" : undefined, minWidth: 0, width: side ? undefined : "min(100%, 340px)", margin: side ? undefined : "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {list && <ListSvg s={state} pal={pal} fs={fs} />}
            {matrix && <MatrixSvg s={state} pal={pal} fs={fs} />}
          </div>
        )}
      </div>
      {state.out && (
        <span style={{ background: state.out === "no" || state.out === "no such edge" ? pal.bad : pal.pillBg, color: state.out === "no" || state.out === "no such edge" ? pal.badInk : pal.pillInk, fontFamily: MONO, fontWeight: 700, fontSize: `${13 * fs}px`, padding: "3px 10px" }}>{state.out}</span>
      )}
    </div>
  );
}
