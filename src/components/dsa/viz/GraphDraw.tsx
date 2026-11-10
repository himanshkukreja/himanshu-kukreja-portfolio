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
const RING_R = 17;
const R = RING_R;

export function describeGraph(s: GraphState): string {
  const e = s.edges.length;
  const list = s.edges.map((x) => `${x.a}${s.directed ? " to " : " and "}${x.b}${x.w !== null ? ` (weight ${x.w})` : ""}`).join(", ");
  const cur = s.current !== null ? ` Working on vertex ${s.current}.` : "";
  const ed = s.edge ? ` Edge ${s.edge[0]} ${s.directed ? "to" : "and"} ${s.edge[1]} in focus.` : "";
  const dist = s.dist ? ` Distances: ${s.dist.map((d, i) => `${i} ${d === null ? "not reached" : d}${s.done?.includes(i) ? " (final)" : ""}`).join(", ")}.` : "";
  const topo = s.indeg ? ` In-degrees: ${s.indeg.map((d, i) => `${i} is ${d}`).join(", ")}. Ready queue: ${s.ready?.length ? s.ready.join(", ") : "empty"}. Order so far: ${s.topo?.length ? s.topo.join(", ") : "none yet"}.${s.stuck?.length ? ` Stuck in a cycle: ${s.stuck.join(", ")}.` : ""}` : "";
  const dsu = s.parent ? ` Parents: ${s.parent.map((p, i) => (p === i ? `${i} is a root${s.size ? ` of a group of ${s.size[i]}` : ""}` : `${i} points to ${p}`)).join(", ")}.` : "";
  const heap = s.heap ? ` Heap: ${s.heap.length ? s.heap.map((h) => `${h[0]} for ${h[1]}${h[2] ? " (stale)" : ""}`).join(", ") : "empty"}.` : "";
  return `${s.directed ? "Directed" : "Undirected"} graph of ${s.n} vertices and ${e} edge${e === 1 ? "" : "s"}${e ? `: ${list}` : ""}.${cur}${ed}${dist}${heap}${topo}${dsu}${s.out ? ` ${s.out}.` : ""}`;
}

const isEdge = (s: GraphState, a: number, b: number) => !!s.edge && ((s.edge[0] === a && s.edge[1] === b) || (!s.directed && s.edge[0] === b && s.edge[1] === a));

/**
 * Union-find: where each vertex sits when the parent pointers are drawn as trees. Roots are on top and children below them; the
 * leaves are spread from left to right, and a parent sits over the middle of its children. A tall forest gets a taller picture
 * and smaller circles, so a long chain stays readable.
 */
export function forestLayout(parent: number[], W: number): { pos: { x: number; y: number }[]; H: number; r: number } {
  const n = parent.length;
  const kids: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  parent.forEach((p, i) => (p === i ? roots.push(i) : kids[p].push(i)));
  const depth: number[] = Array(n).fill(0);
  const col: number[] = Array(n).fill(0);
  let leaves = 0;
  let deepest = 0;
  const place = (v: number, d: number, guard: number): void => {
    depth[v] = d;
    deepest = Math.max(deepest, d);
    if (!kids[v].length || guard > n) {
      col[v] = leaves++;
      return;
    }
    for (const c of kids[v]) place(c, d + 1, guard + 1);
    col[v] = (col[kids[v][0]] + col[kids[v][kids[v].length - 1]]) / 2;
  };
  for (const r of roots) place(r, 0, 0);
  const r = deepest > 4 ? 13 : R;
  const step = leaves > 1 ? Math.min(60, (W - 2 * 22) / (leaves - 1)) : 0;
  const x0 = W / 2 - (step * (leaves - 1)) / 2;
  const ystep = deepest > 0 ? Math.max(Math.min(64, (250 - 68) / deepest), 2 * r + 10) : 0;
  const H = Math.max(250, 68 + ystep * deepest);
  const top = Math.max(34, (H - ystep * deepest) / 2);
  return { pos: depth.map((d, i) => ({ x: x0 + col[i] * step, y: top + d * ystep })), H, r };
}

function GraphSvg({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const W = 300;
  const forest = s.parent && s.parent.length === s.n ? forestLayout(s.parent, W) : null;
  const H = forest ? forest.H : 250;
  const R = forest ? forest.r : RING_R;
  const cx = W / 2;
  const cy = H / 2;
  const rad = s.n <= 2 ? 60 : 92;
  const pos = (i: number) => {
    if (forest) return forest.pos[i];
    const a = -Math.PI / 2 + (2 * Math.PI * i) / s.n;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const isRoot = (i: number) => !!s.parent && s.parent[i] === i;
  const mark = new Set(s.mark);
  const path = new Set(s.path);
  const done = new Set(s.done ?? []);
  const stuck = new Set(s.stuck ?? []);
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
        const lit = mark.has(i) || path.has(i) || done.has(i);
        const warn = stuck.has(i);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={R} fill={warn ? pal.bad : cur ? pal.sig : lit ? pal.hl : pal.surface} stroke={warn ? pal.bad : cur || lit ? pal.sig : isRoot(i) ? pal.ink : pal.stroke} strokeWidth={cur || warn ? 3.2 : lit ? 2.4 : isRoot(i) ? 2.6 : 1.6} />
            <text x={x} y={y + 5 * fs} textAnchor="middle" fontSize={(R < RING_R ? 13 : 15) * fs} fontWeight={700} fill={warn ? pal.badInk : cur ? pal.onSig : pal.ink} fontFamily={MONO}>
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

/** The distance table (one row for each vertex) and Dijkstra's waiting heap, beside the graph. */
function DistPanel({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const dist = s.dist ?? [];
  const done = new Set(s.done ?? []);
  const lit = new Set(s.mark);
  const cell: React.CSSProperties = { padding: "2px 8px", fontFamily: MONO, fontWeight: 700, fontSize: `${12.5 * fs}px`, textAlign: "center", borderBottom: `1px solid ${pal.faint}` };
  const head: React.CSSProperties = { ...cell, fontWeight: 500, fontSize: `${11 * fs}px`, color: pal.sub };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", color: pal.ink }}>
        <thead>
          <tr>
            <th style={head}>vertex</th>
            <th style={head}>distance</th>
            {s.done && <th style={head}>final</th>}
          </tr>
        </thead>
        <tbody>
          {dist.map((d, i) => {
            const cur = s.current === i;
            return (
              <tr key={i} style={{ background: cur ? pal.sig : lit.has(i) ? pal.hl : "transparent", color: cur ? pal.onSig : pal.ink }}>
                <td style={cell}>{i}</td>
                <td style={{ ...cell, color: d === null && !cur ? pal.sub : undefined }}>{d === null ? "∞" : d}</td>
                {s.done && <td style={cell}>{done.has(i) ? "✓" : ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.heap && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: MONO, fontSize: `${11 * fs}px`, color: pal.sub, marginRight: 2 }}>heap</span>
          {s.heap.length === 0 && <span style={{ fontFamily: MONO, fontSize: `${12 * fs}px`, color: pal.sub }}>empty</span>}
          {s.heap.map((h, k) => {
            const top = k === 0 && !h[2];
            return (
              <span key={k} style={{ fontFamily: MONO, fontWeight: 700, fontSize: `${12 * fs}px`, padding: "2px 6px", border: `1.4px solid ${top ? pal.sig : pal.stroke}`, background: top ? pal.hl : pal.surface, color: h[2] ? pal.sub : pal.ink, textDecoration: h[2] ? "line-through" : "none" }}>
                ({h[0]}, {h[1]})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Topological sort: the in-degree table (one row for each vertex), Kahn's ready queue and the order built so far. */
function TopoPanel({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const indeg = s.indeg ?? [];
  const lit = new Set(s.mark);
  const stuck = new Set(s.stuck ?? []);
  const cell: React.CSSProperties = { padding: "2px 8px", fontFamily: MONO, fontWeight: 700, fontSize: `${12.5 * fs}px`, textAlign: "center", borderBottom: `1px solid ${pal.faint}` };
  const head: React.CSSProperties = { ...cell, fontWeight: 500, fontSize: `${11 * fs}px`, color: pal.sub };
  const chip = (v: number, k: number, hot: boolean) => (
    <span key={k} style={{ fontFamily: MONO, fontWeight: 700, fontSize: `${12 * fs}px`, padding: "2px 7px", border: `1.4px solid ${hot ? pal.sig : pal.stroke}`, background: hot ? pal.hl : pal.surface, color: pal.ink }}>
      {v}
    </span>
  );
  const row = (label: string, items: number[], empty: string, first: boolean) => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
      <span style={{ fontFamily: MONO, fontSize: `${11 * fs}px`, color: pal.sub, minWidth: "4.2em" }}>{label}</span>
      {items.length === 0 && <span style={{ fontFamily: MONO, fontSize: `${12 * fs}px`, color: pal.sub }}>{empty}</span>}
      {items.map((v, k) => chip(v, k, first && k === 0))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", color: pal.ink }}>
        <thead>
          <tr>
            <th style={head}>vertex</th>
            <th style={head}>in-degree</th>
          </tr>
        </thead>
        <tbody>
          {indeg.map((d, i) => {
            const cur = s.current === i;
            const warn = stuck.has(i);
            return (
              <tr key={i} style={{ background: warn ? pal.bad : cur ? pal.sig : lit.has(i) ? pal.hl : "transparent", color: warn ? pal.badInk : cur ? pal.onSig : pal.ink }}>
                <td style={cell}>{i}</td>
                <td style={cell}>{d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.ready && row("queue", s.ready, "empty", true)}
      {s.topo && row("order", s.topo, "none yet", false)}
    </div>
  );
}

/** Union-find: the parent of every vertex and, at each root, the size of its group. A root is its own parent. */
function ParentPanel({ s, pal, fs }: { s: GraphState; pal: TreePalette; fs: number }) {
  const parent = s.parent ?? [];
  const lit = new Set([...s.mark, ...s.path]);
  const cell: React.CSSProperties = { padding: "2px 8px", fontFamily: MONO, fontWeight: 700, fontSize: `${12.5 * fs}px`, textAlign: "center", borderBottom: `1px solid ${pal.faint}` };
  const head: React.CSSProperties = { ...cell, fontWeight: 500, fontSize: `${11 * fs}px`, color: pal.sub };
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", color: pal.ink }}>
      <thead>
        <tr>
          <th style={head}>account</th>
          <th style={head}>parent</th>
          <th style={head}>size</th>
        </tr>
      </thead>
      <tbody>
        {parent.map((p, i) => {
          const cur = s.current === i;
          const root = p === i;
          return (
            <tr key={i} style={{ background: cur ? pal.sig : lit.has(i) ? pal.hl : "transparent", color: cur ? pal.onSig : pal.ink }}>
              <td style={cell}>{i}</td>
              <td style={cell}>{p}</td>
              <td style={{ ...cell, color: cur ? pal.onSig : root ? pal.ink : pal.sub, fontWeight: root ? 700 : 400 }}>{root ? (s.size?.[i] ?? 1) : "\u00b7"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const table = !!state.dist || !!state.indeg || !!state.parent;
  const panels = [g, list, matrix, table].filter(Boolean).length;
  const side = !stack && panels > 1;
  const bad = ["no", "no such edge", "wrong answer", "too late", "negative cycle", "cycle"].includes(state.out ?? "");
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }} role="img" aria-label={describeGraph(state)}>
      <div style={{ display: "flex", flexDirection: side ? "row" : "column", alignItems: side ? "center" : "stretch", justifyContent: "center", gap: 14, width: "100%" }}>
        {g && (
          <div style={{ flex: side ? "1 1 0" : undefined, minWidth: 0, width: side ? undefined : "min(100%, 340px)", margin: side ? undefined : "0 auto" }}>
            <GraphSvg s={state} pal={pal} fs={fs} />
          </div>
        )}
        {table && (
          <div style={{ flex: side ? "1 1 0" : undefined, minWidth: 0, width: side ? undefined : "min(100%, 340px)", margin: side ? undefined : "0 auto" }}>
            {state.parent ? <ParentPanel s={state} pal={pal} fs={fs} /> : state.indeg ? <TopoPanel s={state} pal={pal} fs={fs} /> : <DistPanel s={state} pal={pal} fs={fs} />}
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
        <span style={{ background: bad ? pal.bad : pal.pillBg, color: bad ? pal.badInk : pal.pillInk, fontFamily: MONO, fontWeight: 700, fontSize: `${13 * fs}px`, padding: "3px 10px" }}>{state.out}</span>
      )}
    </div>
  );
}
