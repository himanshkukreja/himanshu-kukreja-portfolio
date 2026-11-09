"use client";

/**
 * The "array" view: cells with their indexes, named pointers under them (lo, mid, hi, i, j), a highlighted range,
 * lit cells, cells that just moved (shifts) and cells ruled out (dimmed). Pointers glide between frames. Algorithm
 * step-throughs (binary search, sorting, any generated trace) draw on it.
 */
import type { ArrayState } from "@/lib/dsa/viz/types";

const CELL = 58;
const GAP = 8;
const PAD = 24;
const TOP = 30;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const cx = (i: number) => PAD + i * (CELL + GAP);

export function describeArray(s: ArrayState): string {
  const ptrs = Object.entries(s.pointers).map(([k, i]) => `${k} at index ${i}`);
  return `Array: [${s.values.map((v) => (v === null ? "empty" : String(v))).join(", ")}].${ptrs.length ? ` ${ptrs.join(", ")}.` : ""}`;
}

export default function ArrayView({ state, prev, t }: { state: ArrayState; prev: ArrayState | null; t: number }) {
  const n = Math.max(1, state.values.length);
  const width = PAD * 2 + n * CELL + (n - 1) * GAP;
  const names = Object.keys(state.pointers);
  const height = TOP + CELL + 24 + Math.max(1, names.length) * 26 + 12;
  const stack = (k: string) => names.filter((x) => state.pointers[x] === state.pointers[k]).indexOf(k);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ minWidth: Math.min(width, 46 * n + 40) }} aria-hidden>
      {state.range && (
        <rect x={cx(state.range[0]) - 5} y={TOP - 5} width={cx(state.range[1]) - cx(state.range[0]) + CELL + 10} height={CELL + 10} fill="var(--c-dsa-hl)" stroke="var(--c-signal)" strokeWidth={2.5} />
      )}
      {state.values.map((v, i) => {
        const lit = state.mark.includes(i);
        const moved = state.moved.includes(i);
        const dim = state.dim.includes(i);
        return (
          <g key={i} opacity={dim ? 0.35 : 1}>
            <text x={cx(i) + CELL / 2} y={TOP - 10} textAnchor="middle" fontSize={13} className="font-mono" fill="var(--c-fg-3)">
              {i}
            </text>
            <rect
              x={cx(i)}
              y={TOP}
              width={CELL}
              height={CELL}
              fill={lit ? "var(--c-signal)" : moved ? "var(--c-dsa-hl)" : "var(--c-surface)"}
              stroke={lit || moved ? "var(--c-signal)" : "var(--c-fg-2)"}
              strokeWidth={lit || moved ? 3 : 2}
              strokeDasharray={v === null ? "5 4" : undefined}
            />
            <text x={cx(i) + CELL / 2} y={TOP + CELL / 2 + 8} textAnchor="middle" fontSize={22} fontWeight={700} className="font-mono" fill={lit ? "var(--c-on-signal)" : "var(--c-fg)"}>
              {v === null ? "" : String(v)}
            </text>
          </g>
        );
      })}
      {names.map((k) => {
        const to = cx(state.pointers[k]) + CELL / 2;
        const from = prev && k in prev.pointers ? cx(prev.pointers[k]) + CELL / 2 : to;
        const x = lerp(from, to, t);
        const tw = k.length * 9.5 + 16;
        return (
          <g key={k} transform={`translate(${x - tw / 2} ${TOP + CELL + 12 + stack(k) * 26})`}>
            <rect width={tw} height={22} rx={3} fill="var(--c-signal)" />
            <text x={tw / 2} y={15.5} textAnchor="middle" fontSize={13} fontWeight={600} className="font-mono" fill="var(--c-on-signal)">
              {k}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
