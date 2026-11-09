/**
 * The drawing behind the tree view: one SVG for a TreeState, used by the step player's view (TreeView.tsx, themed with CSS
 * variables) and by the lecture stage's `tree` scene (DsaTreeScene.tsx, the stage's own colours).
 *
 * Nodes are circles joined by straight links. A node's column is its place in an in-order walk and its row is its depth, so
 * a search tree reads left to right in sorted order, and a chain is plain to see. The path walked so far is drawn in the
 * accent, the node being looked at is filled, a found node has an extra ring, and a node whose links changed has a heavy
 * outline. A value about to be inserted hovers above the root. A walk's output so far is a row of chips under the tree.
 * With addresses (the memory picture) each node shows where it lives and each missing child a null stub.
 *
 * Positions tween between frames (t: 0 → 1). Pure SVG with a viewBox: it scales to its box and never overflows the page.
 */
import type { NodeId, TreeState } from "@/lib/dsa/viz/types";
import type { QueuePalette } from "./QueueDraw";

export type TreePalette = QueuePalette;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const MONO = "ui-monospace, monospace";

const COL = 58;
const R = 21;
const PAD = 14;
const TOP = 58;
const GUT = 34;

const fsOf = (s: string, base: number) => (s.length > 4 ? base * 0.62 : s.length > 3 ? base * 0.74 : s.length > 2 ? base * 0.88 : base);

type Grid = { col: number; row: number };

/** Each node's place: its column in an in-order walk, its row down from the root. */
export function layoutTree(s: Pick<TreeState, "nodes" | "root">): { pos: Map<NodeId, Grid>; cols: number; rows: number } {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const pos = new Map<NodeId, Grid>();
  let col = 0;
  let rows = 0;
  const go = (id: NodeId | null, depth: number) => {
    if (id === null || !byId.has(id) || pos.has(id)) return;
    const n = byId.get(id)!;
    go(n.left, depth + 1);
    pos.set(id, { col: col++, row: depth });
    rows = Math.max(rows, depth + 1);
    go(n.right, depth + 1);
  };
  go(s.root, 0);
  return { pos, cols: col, rows };
}

export function describeTree(s: TreeState): string {
  if (!s.nodes.length) return `Empty tree.${s.lifted ? ` ${s.lifted.value} is ready to be inserted.` : ""}${s.out ? ` ${s.out}.` : ""}`;
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const { rows } = layoutTree(s);
  const kids = (id: NodeId | null): string => {
    if (id === null || !byId.has(id)) return "";
    const n = byId.get(id)!;
    const l = n.left !== null && byId.has(n.left) ? byId.get(n.left)!.value : null;
    const r = n.right !== null && byId.has(n.right) ? byId.get(n.right)!.value : null;
    return l === null && r === null ? "" : ` ${n.value} has ${[l !== null ? `left child ${l}` : null, r !== null ? `right child ${r}` : null].filter(Boolean).join(" and ")}.`;
  };
  const links = s.nodes.map((n) => kids(n.id)).join("");
  const walked = s.path.length ? ` Path so far: ${s.path.filter((id) => byId.has(id)).map((id) => byId.get(id)!.value).join(", ")}.` : "";
  const cur = s.current !== null && byId.has(s.current) ? ` Looking at ${byId.get(s.current)!.value}.` : "";
  const seq = s.seq ? ` ${s.seq.title} output: ${s.seq.values.length ? s.seq.values.join(", ") : "nothing yet"}.` : "";
  return `Binary tree of ${s.nodes.length} node${s.nodes.length === 1 ? "" : "s"}, ${rows} level${rows === 1 ? "" : "s"}, root ${s.root !== null ? byId.get(s.root)?.value : "none"}.${links}${walked}${cur}${seq}${s.lifted ? ` ${s.lifted.value} is ready to be inserted.` : ""}${s.out ? ` ${s.out}.` : ""}`;
}

export default function TreeDraw({
  state,
  prev,
  t,
  pal,
  fs = 1,
  style,
  className,
}: {
  state: TreeState;
  prev: TreeState | null;
  t: number;
  pal: TreePalette;
  /** type scale for the text (the vertical short draws bigger) */
  fs?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const { pos, cols, rows } = layoutTree(state);
  const prevPos = prev ? layoutTree(prev).pos : new Map<NodeId, Grid>();
  const withAddr = Object.keys(state.addrs).length > 0;
  const ROW = withAddr ? 88 : 64;
  const gut = state.levels ? GUT : 0;
  const seqLen = state.seq ? state.seq.values.length : 0;
  const seqTitleW = state.seq ? state.seq.title.length * 8.4 + 14 : 0;
  const treeW = Math.max(cols, 5) * COL;
  const seqW = state.seq ? PAD + seqTitleW + Math.max(seqLen, 1) * 40 + PAD : 0;
  const width = Math.max(PAD * 2 + gut + treeW, seqW, 200);
  const treeBottom = TOP + Math.max(rows, 1) * ROW - (ROW - 2 * R) / 2;
  const height = treeBottom + (state.seq ? 60 : 12);
  const cx = (g: Grid) => PAD + gut + g.col * COL + COL / 2;
  const cy = (g: Grid) => TOP + g.row * ROW + R;
  const at = (id: NodeId): { x: number; y: number; appear: number } | null => {
    const g = pos.get(id);
    if (!g) return null;
    const p = prevPos.get(id);
    if (!p) return { x: cx(g), y: cy(g), appear: prev ? t : 1 };
    return { x: lerp(cx(p), cx(g), t), y: lerp(cy(p), cy(g), t), appear: 1 };
  };
  const inPath = new Set(state.path);
  const hot = new Set<string>();
  for (let i = 1; i < state.path.length; i++) hot.add(`${state.path[i - 1]}>${state.path[i]}`);
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const mark = new Set(state.mark);
  const changed = new Set(state.changed);
  const labelsAt = new Map<NodeId, string[]>();
  for (const [name, id] of Object.entries(state.labels)) if (id !== null && byId.has(id)) labelsAt.set(id, [...(labelsAt.get(id) ?? []), name]);

  const edges: React.ReactNode[] = [];
  for (const n of state.nodes) {
    for (const child of [n.left, n.right]) {
      if (child === null || !byId.has(child)) continue;
      const a = at(n.id);
      const b = at(child);
      if (!a || !b) continue;
      const isHot = hot.has(`${n.id}>${child}`);
      edges.push(<line key={`e${n.id}-${child}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isHot ? pal.sig : pal.faint} strokeWidth={isHot ? 3.5 : 2} opacity={b.appear} />);
    }
  }

  const stubs: React.ReactNode[] = [];
  if (withAddr) {
    for (const n of state.nodes) {
      const a = at(n.id);
      if (!a) continue;
      const missing: ("left" | "right")[] = [];
      if (n.left === null || !byId.has(n.left)) missing.push("left");
      if (n.right === null || !byId.has(n.right)) missing.push("right");
      for (const side of missing) {
        const sx = a.x + (side === "left" ? -22 : 22);
        stubs.push(
          <g key={`s${n.id}${side}`} opacity={a.appear}>
            <line x1={a.x} y1={a.y + R} x2={sx} y2={a.y + R + 34} stroke={pal.faint} strokeWidth={1.5} strokeDasharray="3 3" />
            <rect x={sx - 16} y={a.y + R + 34} width={32} height={17} rx={3} fill="none" stroke={pal.faint} strokeWidth={1.2} />
            <text x={sx} y={a.y + R + 46.5} textAnchor="middle" fontSize={10.5 * fs} fontFamily={MONO} fill={pal.sub}>
              null
            </text>
          </g>,
        );
      }
    }
  }

  const nodes = state.nodes.map((n) => {
    const a = at(n.id);
    if (!a) return null;
    const isCur = state.current === n.id;
    const isFound = state.found === n.id;
    const lit = isCur || isFound;
    const onPath = inPath.has(n.id);
    const fill = lit ? pal.sig : onPath || mark.has(n.id) ? pal.hl : pal.surface;
    const ink = lit ? pal.onSig : pal.ink;
    const stroke = changed.has(n.id) ? pal.sig : onPath || lit ? pal.sig : pal.stroke;
    const sw = changed.has(n.id) ? 4 : onPath || lit ? 3 : 2;
    const tags = labelsAt.get(n.id) ?? [];
    return (
      <g key={`n${n.id}`} opacity={a.appear}>
        {isFound && <circle cx={a.x} cy={a.y} r={R + 6} fill="none" stroke={pal.ink} strokeWidth={2.5} />}
        <circle cx={a.x} cy={a.y} r={R} fill={fill} stroke={stroke} strokeWidth={sw} />
        <text x={a.x} y={a.y + 5} textAnchor="middle" fontSize={fsOf(n.value, 15) * fs} fontWeight={700} fontFamily={MONO} fill={ink}>
          {n.value}
        </text>
        {withAddr && (
          <text x={a.x} y={a.y + R + 13} textAnchor="middle" fontSize={10.5 * fs} fontFamily={MONO} fill={pal.sub}>
            @{state.addrs[n.id]}
          </text>
        )}
        {tags.map((name, i) => {
          const w = name.length * 7.6 + 12;
          const ty = a.y - R - 6 - i * 20;
          return (
            <g key={name}>
              <rect x={a.x + R * 0.55} y={ty - 15} width={w} height={18} rx={3} fill={pal.pillBg} />
              <text x={a.x + R * 0.55 + w / 2} y={ty - 2} textAnchor="middle" fontSize={12 * fs} fontWeight={700} fontFamily={MONO} fill={pal.pillInk}>
                {name}
              </text>
            </g>
          );
        })}
      </g>
    );
  });

  // a value in flight above the root
  let lifted: React.ReactNode = null;
  if (state.lifted) {
    const ra = state.root !== null ? at(state.root) : null;
    const lx = ra ? ra.x : PAD + gut + COL / 2;
    const ly = 24;
    lifted = (
      <g>
        <circle cx={lx} cy={ly} r={R - 2} fill={pal.surface} stroke={pal.sig} strokeWidth={2.5} strokeDasharray="5 4" />
        <text x={lx} y={ly + 5} textAnchor="middle" fontSize={fsOf(state.lifted.value, 14) * fs} fontWeight={700} fontFamily={MONO} fill={pal.ink}>
          {state.lifted.value}
        </text>
      </g>
    );
  }

  const outW = state.out ? Math.max(90, state.out.length * 9.5 + 20) : 0;
  const bad = state.out === "not found" || state.out === "invalid" || state.out === "already there";
  const out = state.out ? (
    <g>
      <rect x={width - 8 - outW} y={6} width={outW} height={26} rx={3} fill={bad ? pal.bad : pal.ink} />
      <text x={width - 8 - outW + 10} y={24} fontSize={14 * fs} fontWeight={700} fontFamily={MONO} fill={bad ? pal.badInk : pal.surface}>
        {state.out}
      </text>
    </g>
  ) : null;

  const levels = state.levels
    ? Array.from({ length: Math.max(rows, 1) }, (_, r) => (
        <g key={`l${r}`}>
          <line x1={PAD + gut - 6} x2={width - PAD} y1={TOP + r * ROW + R} y2={TOP + r * ROW + R} stroke={pal.faint} strokeWidth={1} strokeDasharray="2 6" opacity={0.45} />
          <text x={PAD - 6} y={TOP + r * ROW + R + 4} fontSize={12 * fs} fontFamily={MONO} fontWeight={700} fill={pal.sub}>
            L{r + 1}
          </text>
        </g>
      ))
    : null;

  const seq = state.seq ? (
    <g>
      <text x={PAD} y={treeBottom + 38} fontSize={13 * fs} fontFamily={MONO} fontWeight={700} fill={pal.sub}>
        {state.seq.title}
      </text>
      {state.seq.values.map((v, i) => {
        const x = PAD + seqTitleW + i * 40;
        const last = i === state.seq!.values.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={treeBottom + 20} width={36} height={26} rx={3} fill={last ? pal.sig : pal.surface} stroke={last ? pal.sig : pal.stroke} strokeWidth={1.6} />
            <text x={x + 18} y={treeBottom + 38} textAnchor="middle" fontSize={fsOf(v, 14) * fs} fontWeight={700} fontFamily={MONO} fill={last ? pal.onSig : pal.ink}>
              {v}
            </text>
          </g>
        );
      })}
    </g>
  ) : null;

  const empty = !state.nodes.length && !state.lifted ? (
    <text x={width / 2} y={TOP + 30} textAnchor="middle" fontSize={15 * fs} fontFamily={MONO} fill={pal.sub}>
      empty tree
    </text>
  ) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={style} aria-hidden>
      {levels}
      {edges}
      {stubs}
      {nodes}
      {lifted}
      {empty}
      {seq}
      {out}
    </svg>
  );
}
