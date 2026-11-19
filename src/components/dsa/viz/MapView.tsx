"use client";

/**
 * The "map" view: a hash map filling up while a loop walks an input (the explainers of hashing problems). The input strip
 * sits on top with its pointers; the map below is a two-column table of entries in insertion order. A looked-up key is
 * outlined (or shown as a miss when it is absent), a changed value is lit, and a new entry slides in.
 */
import type { MapState } from "@/lib/dsa/viz/types";

const CELL = 50;
const GAP = 6;
const PAD = 20;
const ROW = 34;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (v: unknown) => (v === null || v === undefined ? "–" : Array.isArray(v) ? `[${v.join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : String(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function describeMapState(s: MapState): string {
  const input = s.input ? `Input: [${s.input.map((v) => fmt(v)).join(", ")}]. ` : "";
  const ptrs = Object.entries(s.pointers).map(([k, i]) => `${k} at index ${i}`);
  const map = s.entries.length ? `Map: ${s.entries.map((e) => `${fmt(e.key)} → ${fmt(e.value)}`).join(", ")}.` : "The map is empty.";
  return `${input}${ptrs.length ? `${ptrs.join(", ")}. ` : ""}${map}${s.out ? ` ${s.out}.` : ""}`;
}

export default function MapView({ state, prev, t }: { state: MapState; prev: MapState | null; t: number }) {
  const n = state.input?.length ?? 0;
  const stripW = n ? n * CELL + (n - 1) * GAP : 0;
  const names = Object.keys(state.pointers);
  const stripH = n ? 22 + CELL + 10 + Math.max(1, names.length) * 24 + 14 : 0;
  const keyW = Math.max(90, ...state.entries.map((e) => fmt(e.key).length * 11 + 28));
  const valW = Math.max(110, ...state.entries.map((e) => fmt(e.value).length * 11 + 28));
  const tableW = keyW + valW;
  const misses = state.lit.filter((k) => !state.entries.some((e) => same(e.key, k)));
  const rows = Math.max(1, state.entries.length + misses.length);
  const width = PAD * 2 + Math.max(stripW, tableW);
  const top = stripH + 30;
  const height = top + ROW * (rows + 1) + (state.out ? 46 : 14);
  const cx = (i: number) => PAD + i * (CELL + GAP);
  const tx = PAD;
  const stack = (k: string) => names.filter((x) => state.pointers[x] === state.pointers[k]).indexOf(k);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ minWidth: Math.min(width, 320) }} aria-hidden>
      {state.input?.map((v, i) => {
        const lit = state.mark.includes(i);
        return (
          <g key={`c${i}`}>
            <text x={cx(i) + CELL / 2} y={14} textAnchor="middle" fontSize={12} className="font-mono" fill="var(--c-fg-3)">
              {i}
            </text>
            <rect x={cx(i)} y={22} width={CELL} height={CELL} fill={lit ? "var(--c-signal)" : "var(--c-surface)"} stroke={lit ? "var(--c-signal)" : "var(--c-fg-2)"} strokeWidth={lit ? 3 : 2} />
            <text x={cx(i) + CELL / 2} y={22 + CELL / 2 + 7} textAnchor="middle" fontSize={19} fontWeight={700} className="font-mono" fill={lit ? "var(--c-on-signal)" : "var(--c-fg)"}>
              {fmt(v)}
            </text>
          </g>
        );
      })}
      {names.map((k) => {
        const to = cx(state.pointers[k]) + CELL / 2;
        const from = prev && k in prev.pointers ? cx(prev.pointers[k]) + CELL / 2 : to;
        const tw = k.length * 9 + 16;
        return (
          <g key={`p${k}`} transform={`translate(${lerp(from, to, t) - tw / 2} ${22 + CELL + 10 + stack(k) * 24})`}>
            <rect width={tw} height={21} rx={3} fill="var(--c-signal)" />
            <text x={tw / 2} y={15} textAnchor="middle" fontSize={12.5} fontWeight={600} className="font-mono" fill="var(--c-on-signal)">
              {k}
            </text>
          </g>
        );
      })}
      <text x={tx} y={top - 10} fontSize={12} className="font-mono" fill="var(--c-fg-3)">
        {state.title || "hash map"} · {state.entries.length} {state.entries.length === 1 ? "entry" : "entries"}
      </text>
      <g transform={`translate(${tx} ${top})`}>
        <rect width={tableW} height={ROW} fill="var(--c-surface-2)" stroke="var(--c-line-strong)" />
        <text x={12} y={22} fontSize={12} fontWeight={600} className="font-mono" fill="var(--c-fg-3)">
          key
        </text>
        <text x={keyW + 12} y={22} fontSize={12} fontWeight={600} className="font-mono" fill="var(--c-fg-3)">
          value
        </text>
        {state.entries.length === 0 && misses.length === 0 && (
          <text x={12} y={ROW + 22} fontSize={13} className="font-mono" fill="var(--c-fg-4)">
            empty
          </text>
        )}
        {state.entries.map((e, r) => {
          const isNew = state.new.some((k) => same(k, e.key));
          const lit = state.lit.some((k) => same(k, e.key));
          const changed = state.changed.some((k) => same(k, e.key));
          const y = ROW * (r + 1);
          const enter = isNew ? 1 - t : 0;
          return (
            <g key={`e${fmt(e.key)}`} transform={`translate(${enter * 24} ${y})`} opacity={isNew ? Math.max(0.15, t) : 1}>
              <rect width={keyW} height={ROW} fill={lit ? "var(--c-dsa-hl)" : "var(--c-surface)"} stroke={lit ? "var(--c-signal)" : "var(--c-line-strong)"} strokeWidth={lit ? 2.5 : 1} />
              <rect x={keyW} width={valW} height={ROW} fill={changed || isNew ? "var(--c-signal)" : "var(--c-surface)"} stroke={changed || isNew ? "var(--c-signal)" : "var(--c-line-strong)"} strokeWidth={changed || isNew ? 2.5 : 1} />
              <text x={12} y={22} fontSize={15} fontWeight={700} className="font-mono" fill="var(--c-fg)">
                {fmt(e.key)}
              </text>
              <text x={keyW + 12} y={22} fontSize={15} fontWeight={600} className="font-mono" fill={changed || isNew ? "var(--c-on-signal)" : "var(--c-fg)"}>
                {fmt(e.value)}
              </text>
            </g>
          );
        })}
        {misses.map((k, m) => (
          <g key={`m${fmt(k)}`} transform={`translate(0 ${ROW * (state.entries.length + 1 + m)})`}>
            <rect width={tableW} height={ROW} fill="none" stroke="var(--c-bad, var(--c-fg-3))" strokeDasharray="5 4" strokeWidth={2} />
            <text x={12} y={22} fontSize={14} className="font-mono" fill="var(--c-bad-text, var(--c-fg-2))">
              {fmt(k)}: not in the map
            </text>
          </g>
        ))}
      </g>
      {state.out && (
        <g transform={`translate(${tx} ${height - 38})`}>
          <rect width={Math.min(width - PAD * 2, state.out.length * 8.6 + 24)} height={28} rx={4} fill="var(--c-ok, var(--c-signal))" />
          <text x={12} y={19} fontSize={13.5} fontWeight={600} className="font-mono" fill="var(--c-on-signal)">
            {state.out}
          </text>
        </g>
      )}
    </svg>
  );
}
