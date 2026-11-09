"use client";

/**
 * The "list" view: nodes as boxes (value | next slot, plus a prev slot when doubly linked), next pointers as arrows,
 * head and tail above the chain, cursors (curr, prev, next, slow, fast) below it, a node being added or removed
 * lowered off the chain. Positions tween between frames (t: 0 → 1), so nodes slide, cursors glide and a changed arrow
 * draws itself in. SVG with a viewBox: it scales to its box and never overflows the page.
 *
 * On a phone (560 px or narrower) the chain wraps after four nodes, so the values and labels stay readable instead
 * of an eight-node chain shrinking to a third of its size or scrolling sideways.
 */
import { useEffect, useState } from "react";
import type { ListState, NodeId } from "@/lib/dsa/viz/types";

const PAD_L = 74;
const PAD_R = 74;
const VAL = 58;
const SLOT = 34;
const NH = 50;
const GAP = 46;
const TOP = 46; // head / tail pills above
const CHAIN_Y = TOP + 24;
/** one wrapped row of the chain: the node, the cursors below it and the head/tail pills of the next row above */
const ROW_H = NH + 136;
const PER_ROW_NARROW = 4;
const ABOVE = new Set(["head", "tail", "new"]);
const LABEL_ORDER = ["head", "tail", "new", "prev", "curr", "next", "slow", "fast"];

const nodeW = (doubly: boolean) => VAL + SLOT + (doubly ? SLOT : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pos = { x: number; y: number };

const rowsOf = (s: ListState, perRow: number) => Math.max(1, Math.ceil(s.order.length / perRow));
/** where a node being added or removed sits: below the last row */
const detachY = (rows: number) => CHAIN_Y + (rows - 1) * ROW_H + NH + 92;

function layout(s: ListState, perRow: number, rows: number): Map<NodeId, Pos> {
  const w = nodeW(s.doubly);
  const m = new Map<NodeId, Pos>();
  s.order.forEach((id, i) => m.set(id, { x: PAD_L + (i % perRow) * (w + GAP), y: s.detached.includes(id) ? detachY(rows) : CHAIN_Y + Math.floor(i / perRow) * ROW_H }));
  return m;
}

export const listWidth = (s: ListState, perRow = Infinity) => PAD_L + Math.max(1, Math.min(perRow, s.order.length)) * (nodeW(s.doubly) + GAP) - GAP + PAD_R;

function useNarrow(): boolean {
  const [n, setN] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 560px)");
    const on = () => setN(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
}

export function describeList(s: ListState): string {
  const byId = new Map(s.nodes.map((n) => [n.id, n.value]));
  const head = s.labels.head ?? null;
  const seen = new Set<NodeId>();
  const chain: string[] = [];
  for (let c: NodeId | null = head; c !== null && !seen.has(c); c = s.next[c] ?? null) {
    seen.add(c);
    chain.push(String(byId.get(c)));
  }
  const cursors = Object.entries(s.labels)
    .filter(([k]) => k !== "head" && k !== "tail")
    .map(([k, id]) => `${k} at ${id === null ? "null" : byId.get(id)}`);
  return `Linked list: head → ${chain.length ? `${chain.join(" → ")} → ` : ""}null.${cursors.length ? ` ${cursors.join(", ")}.` : ""}`;
}

export default function ListView({ state, prev, t }: { state: ListState; prev: ListState | null; t: number }) {
  const w = nodeW(state.doubly);
  const narrow = useNarrow();
  const perRow = narrow ? PER_ROW_NARROW : Infinity;
  const rows = Math.max(rowsOf(state, perRow), prev ? rowsOf(prev, perRow) : 1);
  const DETACH_Y = detachY(rows);
  const now = layout(state, perRow, rows);
  const was = prev ? layout(prev, perRow, rows) : now;
  const VFS = narrow ? 27 : 23;
  const LFS = narrow ? 16 : 13;
  const pos = (id: NodeId): Pos => {
    const a = was.get(id);
    const b = now.get(id);
    if (!b) return a || { x: PAD_L, y: CHAIN_Y };
    if (!a) return b;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  };
  const width = Math.max(listWidth(state, perRow), prev ? listWidth(prev, perRow) : 0);
  // room below the chain: the detached row only when a node is off the chain in this frame or the last one
  const cursorsBelow = Object.keys(state.labels).filter((k) => !ABOVE.has(k)).length;
  const anyDetached = state.detached.length > 0 || (prev?.detached.length ?? 0) > 0;
  const height = anyDetached ? DETACH_Y + NH + 64 : CHAIN_Y + (rows - 1) * ROW_H + NH + 22 + Math.max(1, Math.min(3, cursorsBelow)) * 26;
  const values = new Map(state.nodes.map((n) => [n.id, n.value]));
  const live = state.order.filter((id) => values.has(id));

  // labels, grouped by node and side, stacked; a label on null sits just past the chain (prev: just before it)
  const labelAt = (s: ListState, lay: Map<NodeId, Pos>, k: string): { x: number; y: number } => {
    const id = s.labels[k];
    const p = id === null || id === undefined ? null : lay.get(id);
    if (!p) {
      // a label on null: just past the last node (prev: just before the first)
      const last = s.order.length ? lay.get(s.order[s.order.length - 1]) : null;
      if (k === "prev" || !last) return { x: PAD_L - 40, y: CHAIN_Y + NH / 2 };
      return { x: last.x + w + GAP * 0.6, y: (s.detached.includes(s.order[s.order.length - 1]) ? CHAIN_Y : last.y) + NH / 2 };
    }
    return { x: p.x + w / 2, y: p.y + NH / 2 };
  };
  const stackIndex = (k: string) => {
    const id = state.labels[k];
    const above = ABOVE.has(k);
    const peers = LABEL_ORDER.filter((x) => x in state.labels && ABOVE.has(x) === above && state.labels[x] === id);
    return Math.max(0, peers.indexOf(k));
  };

  const arrow = (from: NodeId, to: NodeId | null, kind: "next" | "prev", hot: boolean) => {
    const a = pos(from);
    const det = state.detached.includes(from);
    if (to === null) return null;
    const b = pos(to);
    const off = state.doubly ? (kind === "next" ? -8 : 8) : 0;
    const y1 = a.y + NH / 2 + off;
    const y2 = b.y + NH / 2 + off;
    let x1: number, x2: number;
    if (kind === "next") {
      x1 = a.x + w - SLOT / 2;
      x2 = b.x + (b.x >= a.x ? 0 : w);
    } else {
      x1 = a.x + SLOT / 2;
      x2 = b.x + (b.x <= a.x ? w : 0);
    }
    const forward = kind === "next" ? b.x > a.x : b.x < a.x;
    const adjacent = Math.abs(b.x - a.x) <= w + GAP + 1 && Math.abs(b.y - a.y) < 1;
    let d: string;
    if ((forward && adjacent) || det || state.detached.includes(to) || Math.abs(b.y - a.y) > 1) d = `M${x1} ${y1} L${x2 - (x2 > x1 ? 4 : -4)} ${y2}`;
    else if (kind === "next" && adjacent && !state.doubly) d = `M${a.x} ${y1} L${b.x + w + 4} ${y2}`; // a turned arrow (reverse): straight back across the gap
    else {
      // a backward or skipping arrow arcs over the chain (next) or under it (prev)
      const lift = (kind === "next" ? -1 : 1) * (30 + Math.min(60, Math.abs(b.x - a.x) * 0.12));
      const yTop = Math.min(y1, y2) + lift;
      const startY = kind === "next" ? a.y : a.y + NH;
      const endY = kind === "next" ? b.y : b.y + NH;
      const sx = kind === "next" ? a.x + w - SLOT / 2 : a.x + SLOT / 2;
      const ex = b.x + w / 2 + (kind === "next" ? (b.x > a.x ? -10 : 10) : 0);
      d = `M${sx} ${startY + (kind === "next" ? 6 : -6)} C${sx} ${yTop}, ${ex} ${yTop}, ${ex} ${endY + (kind === "next" ? -3 : 3)}`;
    }
    const draw = hot ? Math.min(1, t * 1.6) : 1;
    return (
      <path
        key={`${kind}-${from}`}
        d={d}
        fill="none"
        stroke={hot ? "var(--c-signal)" : "var(--c-fg-3)"}
        strokeWidth={hot ? 3 : 2}
        strokeDasharray={kind === "prev" ? "5 4" : hot ? "1" : undefined}
        pathLength={hot && kind === "next" ? 1 : undefined}
        strokeDashoffset={hot && kind === "next" ? 1 - draw : undefined}
        markerEnd={`url(#ah-${hot ? "hot" : "cold"})`}
        opacity={state.detached.includes(from) && !hot ? 0.75 : 1}
      />
    );
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={narrow ? undefined : { minWidth: Math.round(width * 0.6) }} aria-hidden>
      <defs>
        <marker id="ah-cold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--c-fg-3)" />
        </marker>
        <marker id="ah-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--c-signal)" />
        </marker>
      </defs>

      {/* arrows first, under the boxes */}
      {state.order.map((id) => arrow(id, state.next[id] ?? null, "next", state.changed.includes(id)))}
      {state.doubly && state.prev && state.order.map((id) => arrow(id, state.prev?.[id] ?? null, "prev", false))}

      {!live.length && (
        <text x={PAD_L} y={CHAIN_Y + NH / 2 + 6} className="font-mono" fontSize={18} fill="var(--c-fg-3)">
          empty list: head is null
        </text>
      )}

      {/* nodes */}
      {state.order.map((id) => {
        if (!values.has(id)) return null;
        const p = pos(id);
        const lit = state.mark.includes(id);
        const fresh = prev && !was.has(id);
        const op = fresh ? Math.min(1, t * 1.5) : 1;
        const nextNull = (state.next[id] ?? null) === null;
        const prevNull = (state.prev?.[id] ?? null) === null;
        const vx = p.x + (state.doubly ? SLOT : 0);
        return (
          <g key={id} opacity={op}>
            <rect x={p.x} y={p.y} width={w} height={NH} fill={lit ? "var(--c-dsa-hl)" : "var(--c-surface)"} stroke={lit ? "var(--c-signal)" : "var(--c-fg-2)"} strokeWidth={lit ? 3 : 2} />
            {state.doubly && <line x1={p.x + SLOT} y1={p.y} x2={p.x + SLOT} y2={p.y + NH} stroke="var(--c-fg-3)" strokeWidth={1.5} />}
            <line x1={vx + VAL} y1={p.y} x2={vx + VAL} y2={p.y + NH} stroke="var(--c-fg-3)" strokeWidth={1.5} />
            <text x={vx + VAL / 2} y={p.y + NH / 2 + VFS * 0.35} textAnchor="middle" fontSize={VFS} fontWeight={700} className="font-mono" fill="var(--c-fg)">
              {values.get(id)}
            </text>
            {/* next slot: a dot where the arrow leaves, or null */}
            {nextNull ? (
              <text x={vx + VAL + SLOT / 2} y={p.y + NH / 2 + 4} textAnchor="middle" fontSize={11} className="font-mono" fill="var(--c-fg-3)">
                null
              </text>
            ) : (
              <circle cx={vx + VAL + SLOT / 2} cy={p.y + NH / 2 + (state.doubly ? -8 : 0)} r={4} fill={state.changed.includes(id) ? "var(--c-signal)" : "var(--c-fg-2)"} />
            )}
            {state.doubly &&
              (prevNull ? (
                <text x={p.x + SLOT / 2} y={p.y + NH / 2 + 4} textAnchor="middle" fontSize={11} className="font-mono" fill="var(--c-fg-3)">
                  null
                </text>
              ) : (
                <circle cx={p.x + SLOT / 2} cy={p.y + NH / 2 + 8} r={4} fill="var(--c-fg-2)" />
              ))}
          </g>
        );
      })}

      {/* labels: head/tail/new above, cursors below; they glide to their new node */}
      {LABEL_ORDER.filter((k) => k in state.labels).map((k) => {
        const above = ABOVE.has(k);
        const to = labelAt(state, now, k);
        const from = prev && k in prev.labels ? labelAt(prev, was, k) : to;
        const x = lerp(from.x, to.x, t);
        const id = state.labels[k];
        const detached = id !== null && id !== undefined && state.detached.includes(id);
        const rowTop = lerp(from.y, to.y, t) - NH / 2;
        const baseY = detached ? DETACH_Y + NH + 10 : above ? rowTop - 32 : rowTop + NH + 12;
        const y = baseY + (above && !detached ? -stackIndex(k) * 26 : stackIndex(k) * 26);
        const hot = k !== "head" && k !== "tail";
        const tw = k.length * (LFS * 0.73) + 16;
        return (
          <g key={`l-${k}`} transform={`translate(${x - tw / 2} ${y})`}>
            <rect width={tw} height={22} rx={3} fill={hot ? "var(--c-signal)" : "var(--c-fg)"} />
            <text x={tw / 2} y={11 + LFS * 0.35} textAnchor="middle" fontSize={LFS} fontWeight={600} className="font-mono" fill={hot ? "var(--c-on-signal)" : "var(--c-bg)"}>
              {k}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
