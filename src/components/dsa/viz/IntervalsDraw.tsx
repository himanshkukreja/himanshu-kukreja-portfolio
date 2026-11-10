/**
 * The drawing behind the intervals view (greedy choices): one SVG for an IntervalsState, used by the step player's view
 * (IntervalsView.tsx, themed with CSS variables) and by the lecture stage's `intervals` scene (DsaIntervalsScene.tsx, the stage's own
 * colours).
 *
 * Each talk is a row: its letter, then a bar from its start hour to its end hour on a shared hour axis. A talk the rule has taken is
 * filled in the accent, a talk it skipped is dashed and crossed out, the talk being looked at has a heavy outline, and lit talks sit on
 * a tinted band (a talk that overlaps the one being skipped, or the pair under discussion). A vertical line marks the end of the last
 * talk taken. Pure SVG with a viewBox: it scales to its box and never overflows the page.
 */
import type { IntervalsState } from "@/lib/dsa/viz/types";
import type { QueuePalette } from "./QueueDraw";

export type IntervalsPalette = QueuePalette;

const MONO = "ui-monospace, monospace";
const W = 640;
const LEFT = 44;
const RIGHT = 18;
const TOP = 34;
const ROW = 36;
const BAR = 24;
const letter = (i: number) => String.fromCharCode(65 + i);

export function describeIntervals(s: IntervalsState): string {
  const talks = s.spans.map((t, i) => `${letter(i)} ${t[0]} to ${t[1]}`).join(", ");
  const bits = [`Talks: ${talks}.`];
  if (s.picked.length) bits.push(`Taken: ${s.picked.map(letter).join(", ")}.`);
  if (s.skipped.length) bits.push(`Skipped: ${s.skipped.map(letter).join(", ")}.`);
  if (s.current !== null) bits.push(`Looking at talk ${letter(s.current)}.`);
  if (s.lastEnd !== null) bits.push(`The last talk taken ends at ${s.lastEnd}.`);
  if (s.out) bits.push(s.out + ".");
  return bits.join(" ");
}

export default function IntervalsDraw({ state, pal, fs = 1, className, style }: { state: IntervalsState; pal: IntervalsPalette; fs?: number; className?: string; style?: React.CSSProperties }) {
  const n = state.spans.length;
  const first = Math.min(...state.spans.map((t) => t[0]));
  const last = Math.max(...state.spans.map((t) => t[1]), state.lastEnd ?? -Infinity);
  const x = (h: number) => LEFT + ((h - first) / Math.max(1, last - first)) * (W - LEFT - RIGHT);
  const height = TOP + n * ROW + 40;
  const step = last - first > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let h = first; h <= last; h++) if ((h - first) % step === 0 || h === last) ticks.push(h);
  const y = (i: number) => TOP + i * ROW;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={className ?? "block h-auto w-full"} style={style} aria-hidden>
      {state.lit.map((i) => (
        <rect key={`l${i}`} x={4} y={y(i) + 1} width={W - 8} height={ROW - 2} fill={pal.hl} />
      ))}
      {ticks.map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={TOP - 6} y2={TOP + n * ROW} stroke={pal.faint} strokeWidth={1} opacity={0.35} />
          <text x={x(h)} y={TOP - 12} textAnchor="middle" fontSize={13 * fs} fill={pal.sub} fontFamily={MONO}>
            {h}
          </text>
        </g>
      ))}
      {state.spans.map((t, i) => {
        const taken = state.picked.includes(i);
        const skipped = state.skipped.includes(i);
        const here = state.current === i;
        const bx = x(t[0]);
        const bw = Math.max(6, x(t[1]) - x(t[0]));
        const by = y(i) + (ROW - BAR) / 2;
        const label = `${t[0]}–${t[1]}`;
        const inside = bw > 62 * fs;
        return (
          <g key={i} opacity={skipped ? 0.62 : 1}>
            <text x={LEFT - 12} y={by + BAR / 2 + 5} textAnchor="end" fontSize={15 * fs} fontWeight={700} fill={pal.ink} fontFamily={MONO}>
              {letter(i)}
            </text>
            <rect
              x={bx}
              y={by}
              width={bw}
              height={BAR}
              rx={3}
              fill={taken ? pal.sig : pal.surface}
              stroke={taken ? pal.sig : skipped ? pal.faint : pal.stroke}
              strokeWidth={here ? 4 : 2}
              strokeDasharray={skipped ? "5 4" : undefined}
            />
            {here && !taken && <rect x={bx - 3} y={by - 3} width={bw + 6} height={BAR + 6} rx={5} fill="none" stroke={pal.sig} strokeWidth={2.5} />}
            {inside ? (
              <text x={bx + bw / 2} y={by + BAR / 2 + 5} textAnchor="middle" fontSize={13 * fs} fontWeight={600} fill={taken ? pal.onSig : pal.ink} fontFamily={MONO}>
                {label}
              </text>
            ) : (
              <text x={bx + bw + 60 * fs < W ? bx + bw + 8 : bx - 8} y={by + BAR / 2 + 5} textAnchor={bx + bw + 60 * fs < W ? "start" : "end"} fontSize={13 * fs} fill={pal.sub} fontFamily={MONO}>
                {label}
              </text>
            )}
            {skipped && <line x1={bx - 2} x2={bx + bw + 2} y1={by + BAR / 2} y2={by + BAR / 2} stroke={pal.bad} strokeWidth={2.5} />}
          </g>
        );
      })}
      {state.lastEnd !== null && (
        <g>
          <line x1={x(state.lastEnd)} x2={x(state.lastEnd)} y1={TOP - 4} y2={TOP + n * ROW + 4} stroke={pal.sig} strokeWidth={3} strokeDasharray="7 4" />
          <text x={x(state.lastEnd)} y={TOP + n * ROW + 22} textAnchor="middle" fontSize={13 * fs} fontWeight={700} fill={pal.sig} fontFamily={MONO}>
            last end {state.lastEnd}
          </text>
        </g>
      )}
      {state.out && (
        <g transform={`translate(${W - RIGHT - Math.max(60, state.out.length * 8.4 * fs + 18)} ${height - 24})`}>
          <rect width={Math.max(60, state.out.length * 8.4 * fs + 18)} height={22} rx={3} fill={pal.pillBg} />
          <text x={9} y={15.5} fontSize={13 * fs} fontWeight={600} fill={pal.pillInk} fontFamily={MONO}>
            {state.out}
          </text>
        </g>
      )}
    </svg>
  );
}
