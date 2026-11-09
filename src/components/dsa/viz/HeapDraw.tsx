"use client";

/**
 * The drawing behind the heap view: a HeapState drawn as a complete binary tree (TreeDraw, with each array index as a node id,
 * so the node in cell i has its children in cells 2i + 1 and 2i + 2) and, under it, the array itself as a row of cells with
 * their indexes. Used by the step player's view (HeapView.tsx, themed with CSS variables) and by the lecture stage's `heap`
 * scene (DsaHeapScene.tsx, the stage's own colours).
 *
 * The two cells being compared are outlined, the two just swapped are filled and heavily outlined, the cell being worked on
 * has the accent ring, and the path an item walked is drawn in the accent.
 */
import type { HeapState, TreeState } from "@/lib/dsa/viz/types";
import TreeDraw, { type TreePalette } from "./TreeDraw";

const MONO = "ui-monospace, monospace";
const CW = 46;
const CH = 38;

/** The heap's array as a tree: node id = array index. */
export function heapAsTree(s: HeapState): TreeState {
  const n = s.values.length;
  const swap = s.swap ?? [];
  const compare = s.compare ?? [];
  return {
    nodes: s.values.map((v, i) => ({ id: i, value: v, left: 2 * i + 1 < n ? 2 * i + 1 : null, right: 2 * i + 2 < n ? 2 * i + 2 : null })),
    root: n ? 0 : null,
    path: [...s.path].sort((a, b) => a - b),
    current: s.current,
    found: null,
    mark: [...new Set([...s.mark, ...compare, ...swap])],
    changed: [...swap],
    lifted: null,
    labels: s.labels,
    seq: null,
    out: s.out,
    levels: false,
    addrs: {},
  };
}

export function describeHeap(s: HeapState): string {
  const n = s.values.length;
  const name = s.kind === "max" ? "Max-heap" : "Min-heap";
  if (!n) return `${name}: empty.${s.out ? ` ${s.out}.` : ""}`;
  const rows = Math.floor(Math.log2(n)) + 1;
  const cmp = s.compare ? ` Comparing cells ${s.compare[0]} and ${s.compare[1]}: ${s.values[s.compare[0]]} and ${s.values[s.compare[1]]}.` : "";
  const sw = s.swap ? ` Cells ${s.swap[0]} and ${s.swap[1]} just swapped.` : "";
  const cur = s.current !== null && s.current < n ? ` Working on cell ${s.current}, which holds ${s.values[s.current]}.` : "";
  return `${name} of ${n} value${n === 1 ? "" : "s"}, ${rows} level${rows === 1 ? "" : "s"}. Array: ${s.values.join(", ")}. The ${s.kind === "max" ? "largest" : "smallest"} is on top.${cmp}${sw}${cur}${s.out ? ` ${s.out}.` : ""}`;
}

function ArrayRow({ state, pal, fs }: { state: HeapState; pal: TreePalette; fs: number }) {
  const n = state.values.length;
  const width = Math.max(n, 5) * CW + 8;
  const height = CH + (state.indexes ? 32 : 10) + 6;
  const swap = new Set(state.swap ?? []);
  const compare = new Set(state.compare ?? []);
  const mark = new Set(state.mark);
  const labelsAt = new Map<number, string[]>();
  for (const [name, id] of Object.entries(state.labels)) if (id !== null && id < n) labelsAt.set(id, [...(labelsAt.get(id) ?? []), name]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="presentation" style={{ width: "100%", height: "auto", display: "block" }}>
      {n === 0 && (
        <text x={width / 2} y={CH / 2 + 5} textAnchor="middle" fontSize={13 * fs} fill={pal.sub} fontFamily={MONO}>
          empty array
        </text>
      )}
      {state.values.map((v, i) => {
        const x = 4 + i * CW;
        const isSwap = swap.has(i);
        const isCur = state.current === i;
        const fill = isSwap ? pal.sig : mark.has(i) || compare.has(i) ? pal.hl : pal.surface;
        const stroke = isSwap || isCur || compare.has(i) ? pal.sig : pal.stroke;
        return (
          <g key={i}>
            <rect x={x} y={2} width={CW - 4} height={CH} fill={fill} stroke={stroke} strokeWidth={isSwap || isCur ? 3 : compare.has(i) ? 2 : 1.4} strokeDasharray={compare.has(i) && !isSwap ? "5 3" : undefined} />
            <text x={x + (CW - 4) / 2} y={2 + CH / 2 + 5 * fs} textAnchor="middle" fontSize={15 * fs} fontWeight={700} fill={isSwap ? pal.onSig : pal.ink} fontFamily={MONO}>
              {v}
            </text>
            {state.indexes && (
              <text x={x + (CW - 4) / 2} y={CH + 18} textAnchor="middle" fontSize={11.5 * fs} fill={pal.sub} fontFamily={MONO}>
                {i}
              </text>
            )}
            {labelsAt.has(i) && (
              <text x={x + (CW - 4) / 2} y={CH + 31} textAnchor="middle" fontSize={10.5 * fs} fontWeight={700} fill={pal.sig} fontFamily={MONO}>
                {labelsAt.get(i)!.join(" ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function HeapDraw({
  state,
  prev,
  t,
  pal,
  fs = 1,
  style,
  className,
}: {
  state: HeapState;
  prev: HeapState | null;
  t: number;
  pal: TreePalette;
  /** type scale for the text (the vertical short draws bigger) */
  fs?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const tree = state.show !== "array";
  const array = state.show !== "tree";
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, ...style }} role="img" aria-label={describeHeap(state)}>
      {tree && <TreeDraw state={heapAsTree(state)} prev={prev ? heapAsTree(prev) : null} t={t} pal={pal} fs={fs} style={{ width: "100%", height: "auto", maxHeight: array ? "none" : undefined }} />}
      {array && (
        <div style={{ width: `${Math.min(100, Math.max(state.values.length, 5) * 11.5)}%`, minWidth: "40%" }}>
          <ArrayRow state={state} pal={pal} fs={fs} />
        </div>
      )}
    </div>
  );
}
