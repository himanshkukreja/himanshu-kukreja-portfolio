/**
 * The drawing behind the dp view (dynamic programming): one SVG for a DpState, used by the step player's view (DpView.tsx, themed with
 * CSS variables) and by the lecture stage's `dp` scene (DsaDpScene.tsx, the stage's own colours).
 *
 * A table is a header row of indexes, then the cells. A filled cell shows its value, an empty cell is blank, a base-case cell has a dashed
 * edge, a closed cell is crossed out, the cell being filled has a heavy accent edge, and the cells it reads from sit on a tinted fill with a
 * line to it. A tree is the recursion tree: a circle for each call, a line to its parent, the value a call returned under it. A call that
 * repeats an earlier call is outlined in the warning colour, and a call answered from the memo is filled in the accent. Pure SVG with a
 * viewBox: it scales to its box and never overflows the page.
 */
import type { DpState } from "@/lib/dsa/viz/types";
import type { QueuePalette } from "./QueueDraw";

export type DpPalette = QueuePalette;

const MONO = "ui-monospace, monospace";
const W = 640;

export function describeDp(s: DpState): string {
  const bits: string[] = [];
  if (s.table) {
    const t = s.table;
    const done = t.cells.flat().filter((v) => v !== null).length;
    bits.push(t.rows ? `A table of ${t.rows.length} rows and ${t.cols.length} columns, ${done} cells filled.` : `A table of ${t.cols.length} cells, ${done} filled: ${t.cells[0].map((v, i) => (v === null ? null : `${t.cols[i]} is ${v}`)).filter(Boolean).join(", ") || "none yet"}.`);
    if (t.now) bits.push(`Filling row ${t.now[0] + 1}, column ${t.now[1] + 1}, from ${t.reads.length} cell${t.reads.length === 1 ? "" : "s"}.`);
  }
  if (s.tree) {
    const r = s.tree;
    bits.push(`A recursion tree with ${r.shown} of ${r.calls.length} calls shown.`);
    if (r.repeat.length) bits.push(`${r.repeat.length} repeat an earlier call.`);
    if (r.hit.length) bits.push(`${r.hit.length} read the memo.`);
  }
  if (s.out) bits.push(s.out + ".");
  return bits.join(" ");
}

type Pt = { x: number; y: number };

/** Positions for every call: leaves take consecutive slots, a parent sits over its children, and depth sets the row. */
export function treeLayout(calls: { parent: number }[]): { pos: Pt[]; leaves: number; depth: number } {
  const kids: number[][] = calls.map(() => []);
  const depthOf: number[] = [];
  calls.forEach((c, i) => {
    depthOf[i] = c.parent < 0 ? 0 : depthOf[c.parent] + 1;
    if (c.parent >= 0) kids[c.parent].push(i);
  });
  const x: number[] = [];
  let slot = 0;
  const place = (i: number) => {
    if (!kids[i].length) {
      x[i] = slot++;
      return;
    }
    kids[i].forEach(place);
    x[i] = (x[kids[i][0]] + x[kids[i][kids[i].length - 1]]) / 2;
  };
  if (calls.length) place(0);
  return { pos: calls.map((_, i) => ({ x: x[i], y: depthOf[i] })), leaves: Math.max(1, slot), depth: Math.max(0, ...depthOf) };
}

export default function DpDraw({ state, pal, fs = 1, className, style }: { state: DpState; pal: DpPalette; fs?: number; className?: string; style?: React.CSSProperties }) {
  if (state.tree) return <TreeDraw state={state} pal={pal} fs={fs} className={className} style={style} />;
  if (state.table) return <TableDraw state={state} pal={pal} fs={fs} className={className} style={style} />;
  return null;
}

function Chip({ text, pal, x, y, fs }: { text: string; pal: DpPalette; x: number; y: number; fs: number }) {
  const w = Math.max(60, text.length * 8.4 * fs + 18);
  return (
    <g transform={`translate(${x - w} ${y})`}>
      <rect width={w} height={22} rx={3} fill={pal.pillBg} />
      <text x={9} y={15.5} fontSize={13 * fs} fontWeight={600} fill={pal.pillInk} fontFamily={MONO}>
        {text}
      </text>
    </g>
  );
}

function TableDraw({ state, pal, fs, className, style }: { state: DpState; pal: DpPalette; fs: number; className?: string; style?: React.CSSProperties }) {
  const t = state.table!;
  const R = t.cells.length;
  const C = t.cols.length;
  const headW = t.rows ? 40 : 8;
  const cw = Math.min(64, Math.floor((W - headW - 16) / C));
  const ch = Math.min(46, Math.max(34, cw));
  const left = Math.max(8, (W - headW - cw * C) / 2);
  const top = 30;
  const height = top + R * ch + (state.out ? 40 : 14);
  const cx = (c: number) => left + headW + c * cw + cw / 2;
  const cy = (r: number) => top + r * ch + ch / 2;
  const isIn = (list: [number, number][], r: number, c: number) => list.some(([a, b]) => a === r && b === c);
  const font = Math.min(18, cw * 0.38) * fs;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={className ?? "block h-auto w-full"} style={style} aria-hidden>
      {t.cols.map((h, c) => (
        <text key={`h${c}`} x={cx(c)} y={top - 10} textAnchor="middle" fontSize={Math.min(14, cw * 0.32) * fs} fill={pal.sub} fontFamily={MONO}>
          {h}
        </text>
      ))}
      {t.rows?.map((h, r) => (
        <text key={`r${r}`} x={left + headW - 8} y={cy(r) + 5} textAnchor="end" fontSize={14 * fs} fill={pal.sub} fontFamily={MONO}>
          {h}
        </text>
      ))}
      {t.now &&
        t.reads.map(([r, c], k) => (
          <line key={`l${k}`} x1={cx(c)} y1={cy(r)} x2={cx(t.now![1])} y2={cy(t.now![0])} stroke={pal.sig} strokeWidth={2.5} strokeDasharray="5 4" opacity={0.85} />
        ))}
      {t.cells.map((row, r) =>
        row.map((v, c) => {
          const now = t.now && t.now[0] === r && t.now[1] === c;
          const read = isIn(t.reads, r, c);
          const base = isIn(t.base, r, c);
          const closed = isIn(t.blocked, r, c);
          const x = left + headW + c * cw;
          const y = top + r * ch;
          return (
            <g key={`${r},${c}`}>
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={cw - 3}
                height={ch - 3}
                rx={3}
                fill={read ? pal.hl : v !== null || closed ? pal.surface : "none"}
                stroke={now ? pal.sig : read ? pal.sig : v === null && !closed ? pal.faint : pal.stroke}
                strokeWidth={now ? 4 : read ? 2.5 : 1.5}
                strokeDasharray={base && !now ? "4 3" : undefined}
                opacity={v === null && !closed && !now ? 0.55 : 1}
              />
              {v !== null && (
                <text x={x + cw / 2} y={y + ch / 2 + font * 0.35} textAnchor="middle" fontSize={font} fontWeight={now ? 800 : 600} fill={now ? pal.sig : pal.ink} fontFamily={MONO}>
                  {v}
                </text>
              )}
              {closed && <line x1={x + 6} y1={y + 6} x2={x + cw - 6} y2={y + ch - 6} stroke={pal.bad} strokeWidth={2.5} />}
              {closed && <line x1={x + cw - 6} y1={y + 6} x2={x + 6} y2={y + ch - 6} stroke={pal.bad} strokeWidth={2.5} />}
            </g>
          );
        }),
      )}
      {state.out && <Chip text={state.out} pal={pal} x={W - 16} y={height - 28} fs={fs} />}
    </svg>
  );
}

function TreeDraw({ state, pal, fs, className, style }: { state: DpState; pal: DpPalette; fs: number; className?: string; style?: React.CSSProperties }) {
  const t = state.tree!;
  const { pos, leaves, depth } = treeLayout(t.calls);
  const slot = Math.min(80, (W - 40) / leaves);
  const r = Math.min(19, slot * 0.4) * Math.max(1, fs * 0.9);
  const rowH = 58;
  const left = (W - slot * leaves) / 2 + slot / 2;
  const px = (i: number) => left + pos[i].x * slot;
  const py = (i: number) => 28 + pos[i].y * rowH;
  const height = 28 + depth * rowH + 52 + (state.out ? 30 : 0);
  const shown = t.calls.map((_, i) => i).filter((i) => i < t.shown);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={className ?? "block h-auto w-full"} style={style} aria-hidden>
      {shown.map((i) => {
        const p = t.calls[i].parent;
        return p < 0 ? null : <line key={`e${i}`} x1={px(p)} y1={py(p) + r} x2={px(i)} y2={py(i) - r} stroke={pal.stroke} strokeWidth={1.8} opacity={t.hit.includes(i) ? 0.8 : 1} strokeDasharray={t.hit.includes(i) ? "4 3" : undefined} />;
      })}
      {shown.map((i) => {
        const hit = t.hit.includes(i);
        const rep = t.repeat.includes(i);
        const hot = t.hot.includes(i);
        const val = t.vals[i];
        return (
          <g key={i}>
            {hot && <circle cx={px(i)} cy={py(i)} r={r + 5} fill="none" stroke={pal.sig} strokeWidth={2.5} />}
            <circle cx={px(i)} cy={py(i)} r={r} fill={hit ? pal.sig : pal.surface} stroke={rep ? pal.bad : hit ? pal.sig : pal.stroke} strokeWidth={rep ? 3.5 : 2} strokeDasharray={rep ? "5 3" : undefined} />
            <text x={px(i)} y={py(i) + 5 * fs} textAnchor="middle" fontSize={Math.min(16, r * 0.95) * fs} fontWeight={700} fill={hit ? pal.onSig : rep ? pal.bad : pal.ink} fontFamily={MONO}>
              {t.calls[i].label}
            </text>
            {val !== undefined && (
              <text x={px(i)} y={py(i) + r + 15 * fs} textAnchor="middle" fontSize={Math.min(14, r * 0.85) * fs} fontWeight={600} fill={hit ? pal.sig : pal.sub} fontFamily={MONO}>
                {val}
              </text>
            )}
            {hit && (
              <text x={px(i) + r + 3} y={py(i) - r + 2} fontSize={11 * fs} fontWeight={700} fill={pal.sig} fontFamily={MONO}>
                memo
              </text>
            )}
            {rep && !hit && (
              <text x={px(i) + r + 3} y={py(i) - r + 2} fontSize={11 * fs} fontWeight={700} fill={pal.bad} fontFamily={MONO}>
                again
              </text>
            )}
          </g>
        );
      })}
      {state.out && <Chip text={state.out} pal={pal} x={W - 16} y={height - 28} fs={fs} />}
    </svg>
  );
}
