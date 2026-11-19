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
const TOP0 = 30;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const cx = (i: number) => PAD + i * (CELL + GAP);
/** long values (-1500, 12.75) shrink to stay inside their cell */
const valueSize = (v: unknown) => {
  const len = v === null ? 0 : String(v).length;
  return len <= 3 ? 22 : len === 4 ? 18 : len === 5 ? 15 : 12.5;
};

export function describeArray(s: ArrayState): string {
  const ptrs = Object.entries(s.pointers).map(([k, i]) => `${k} at index ${i}`);
  return `Array: [${s.values.map((v) => (v === null ? "empty" : String(v))).join(", ")}].${ptrs.length ? ` ${ptrs.join(", ")}.` : ""}`;
}

export default function ArrayView({ state, prev, t }: { state: ArrayState; prev: ArrayState | null; t: number }) {
  const n = Math.max(1, state.values.length);
  const width = PAD * 2 + n * CELL + (n - 1) * GAP;
  const names = Object.keys(state.pointers);
  // bars (explainers): each value as a bar above its cell, scaled to the largest
  const BAR = state.bars ? 110 : 0;
  const TOP = TOP0 + BAR;
  const nums = state.values.map((v) => (typeof v === "number" ? v : 0));
  const wet = (i: number) => state.water?.[i] ?? 0;
  const max = Math.max(1, ...nums.map((v, i) => v + wet(i)));
  const LAB = state.labels ? 20 : 0;
  const height = TOP + CELL + LAB + (names.length ? 24 + names.length * 26 : 8) + 12;
  const stack = (k: string) => names.filter((x) => state.pointers[x] === state.pointers[k]).indexOf(k);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ minWidth: Math.min(width, 46 * n + 40) }} aria-hidden>
      {state.bars &&
        state.values.map((v, i) => {
          const h = Math.max(3, (nums[i] / max) * (BAR - 34));
          const lit = state.mark.includes(i) || (state.range ? i >= state.range[0] && i <= state.range[1] : false);
          const wh = (wet(i) / max) * (BAR - 34);
          return (
            <g key={`b${i}`}>
              {wh > 0 && <rect x={cx(i) + 2} y={TOP - 26 - h - wh} width={CELL - 4} height={wh} fill="var(--c-sky)" opacity={0.55} />}
              <rect x={cx(i) + 8} y={TOP - 26 - h} width={CELL - 16} height={h} rx={3} fill={lit ? "var(--c-signal)" : "var(--c-line-strong)"} opacity={state.dim.includes(i) ? 0.35 : 1} />
            </g>
          );
        })}
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
            <text x={cx(i) + CELL / 2} y={TOP + CELL / 2 + 8} textAnchor="middle" fontSize={valueSize(v)} fontWeight={700} className="font-mono" fill={lit ? "var(--c-on-signal)" : "var(--c-fg)"}>
              {v === null ? "" : String(v)}
            </text>
            {state.labels?.[i] && (
              <text x={cx(i) + CELL / 2} y={TOP + CELL + 16} textAnchor="middle" fontSize={11.5} className="font-mono" fill="var(--c-fg-3)">
                {state.labels[i]}
              </text>
            )}
          </g>
        );
      })}
      {names.map((k) => {
        const to = cx(state.pointers[k]) + CELL / 2;
        const from = prev && k in prev.pointers ? cx(prev.pointers[k]) + CELL / 2 : to;
        const x = lerp(from, to, t);
        const tw = k.length * 9.5 + 16;
        return (
          <g key={k} transform={`translate(${x - tw / 2} ${TOP + CELL + LAB + 12 + stack(k) * 26})`}>
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
