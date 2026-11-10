/**
 * The drawing behind the bits view (A8 Bits and maths): one SVG for a BitsState, used by the step player's view (BitsView.tsx, themed
 * with CSS variables) and by the lecture stage's `bits` scene (DsaBitsScene.tsx, the stage's own colours).
 *
 * A number is a row of bit cells, bit 7 on the left and bit 0 on the right for 8 bits, with its label at the left and its decimal
 * value at the right. A 1 is tinted with an accent edge and a 0 is plain. The result row sits under a rule that carries the operator, and
 * its 1 bits are filled in the accent. A bit that has not been worked out yet is drawn as a dashed empty cell. Columns in `hot` are
 * framed with a dashed accent outline across every row. Optional names (permissions) sit under the last row. A signed state reads the
 * top bit as negative. Pure SVG with a viewBox: it scales to its box.
 */
import type { BitsState } from "@/lib/dsa/viz/types";
import type { QueuePalette } from "./QueueDraw";

export type BitsPalette = QueuePalette;

const MONO = "ui-monospace, monospace";
const W = 640;
const LABEL_W = 176;
const VALUE_W = 78;

/** bit i (0 at the right) of a whole number held in `width` bits, in two's complement for a negative number */
export function bitAt(value: number, i: number, width: number): number {
  const m = 2 ** width;
  const u = ((value % m) + m) % m;
  return Math.floor(u / 2 ** i) % 2;
}

/** the number as the row shows it: signed when the top bit counts as negative */
export function shownValue(value: number, width: number, signed: boolean): number {
  const m = 2 ** width;
  const u = ((value % m) + m) % m;
  return signed && u >= m / 2 ? u - m : u;
}

export function describeBits(s: BitsState): string {
  const rows = s.rows.map((r) => {
    const bits = Array.from({ length: s.width }, (_, k) => bitAt(r.value, s.width - 1 - k, s.width)).join("");
    return `${r.label} is ${shownValue(r.value, s.width, s.signed)} (${bits})`;
  });
  const bits: string[] = [`${rows.join(", ")}.`];
  if (s.op) bits.push(`Operator ${s.op}.`);
  if (s.hot.length) bits.push(`Outlined bits: ${s.hot.join(", ")}.`);
  if (s.out) bits.push(s.out + ".");
  return bits.join(" ");
}

export default function BitsDraw({ state, pal, fs = 1, className, style }: { state: BitsState; pal: BitsPalette; fs?: number; className?: string; style?: React.CSSProperties }) {
  const n = state.width;
  const cw = Math.min(46, (W - LABEL_W - VALUE_W - 12) / n);
  const ch = Math.min(40, cw * 0.95);
  const gridW = cw * n;
  const x0 = LABEL_W;
  const small = 11.5 * fs;
  const digit = Math.min(cw * 0.52, 22) * Math.max(1, fs * 0.9);
  const rowGap = 12;
  const top = state.out ? 32 : 6;
  const headerH = 18 * fs;
  const parts: React.ReactNode[] = [];

  // bit positions above the first row
  for (let k = 0; k < n; k++) {
    const pos = n - 1 - k;
    parts.push(
      <text key={`h${pos}`} x={x0 + k * cw + cw / 2} y={top + 12 * fs} textAnchor="middle" fontSize={small} fill={state.hot.includes(pos) ? pal.ink : pal.sub} fontWeight={state.hot.includes(pos) ? 700 : 400} fontFamily={MONO}>
        {pos}
      </text>,
    );
  }

  let y = top + headerH;
  const ys: number[] = [];
  state.rows.forEach((r, i) => {
    const isOut = r.kind === "out";
    // the rule and the operator above the result row
    if (isOut) {
      y += 4;
      parts.push(<line key="rule" x1={x0 - 4} x2={x0 + gridW + 4} y1={y} y2={y} stroke={pal.ink} strokeWidth={2} />);
      if (state.op) {
        const label = state.op;
        const pw = Math.max(26, label.length * 9.5 + 14);
        parts.push(
          <g key="op">
            <rect x={LABEL_W - pw - 10} y={y - 11} width={pw} height={22} rx={3} fill={pal.pillBg} />
            <text x={LABEL_W - pw / 2 - 10} y={y + 5} textAnchor="middle" fontSize={14 * fs} fontWeight={700} fill={pal.pillInk} fontFamily={MONO}>
              {label}
            </text>
          </g>,
        );
      }
      y += 8;
    }
    ys.push(y);
    parts.push(
      <text key={`l${i}`} x={x0 - 12} y={y + ch / 2 + 5 * fs} textAnchor="end" fontSize={15 * fs} fontWeight={isOut ? 700 : 500} fill={pal.ink} fontFamily={MONO}>
        {r.label}
      </text>,
    );
    for (let k = 0; k < n; k++) {
      const pos = n - 1 - k;
      const x = x0 + k * cw;
      const shown = r.from === undefined || pos >= r.from;
      if (!shown) {
        parts.push(<rect key={`c${i}-${k}`} x={x + 1} y={y} width={cw - 2} height={ch} rx={3} fill="none" stroke={pal.faint} strokeWidth={1.2} strokeDasharray="3 3" />);
        continue;
      }
      const b = bitAt(r.value, pos, n);
      const fill = b ? (isOut ? pal.sig : pal.hl) : pal.surface;
      const stroke = b ? pal.sig : pal.faint;
      const ink = b && isOut ? pal.onSig : pal.ink;
      parts.push(
        <g key={`c${i}-${k}`}>
          <rect x={x + 1} y={y} width={cw - 2} height={ch} rx={3} fill={fill} stroke={stroke} strokeWidth={b ? 2 : 1.4} />
          <text x={x + cw / 2} y={y + ch / 2 + digit * 0.35} textAnchor="middle" fontSize={digit} fontWeight={600} fill={ink} fontFamily={MONO}>
            {b}
          </text>
        </g>,
      );
    }
    const dec = shownValue(r.value, n, state.signed);
    const unknown = r.from !== undefined && r.from > 0;
    parts.push(
      <text key={`d${i}`} x={x0 + gridW + 12} y={y + ch / 2 + 5 * fs} fontSize={15 * fs} fontWeight={isOut ? 700 : 400} fill={isOut ? pal.ink : pal.sub} fontFamily={MONO}>
        {unknown ? "" : dec}
      </text>,
    );
    y += ch + rowGap;
  });
  const bottom = y - rowGap;

  // dashed frames around the columns in focus
  for (const pos of state.hot) {
    if (pos < 0 || pos >= n) continue;
    const k = n - 1 - pos;
    parts.push(<rect key={`f${pos}`} x={x0 + k * cw - 1} y={top + 14 * fs} width={cw + 2} height={bottom - top - 14 * fs + 4} rx={5} fill="none" stroke={pal.sig} strokeWidth={2.6} strokeDasharray="6 3" />);
  }

  // names under the last row
  let H = bottom + 8;
  if (state.names) {
    for (let k = 0; k < n; k++) {
      const pos = n - 1 - k;
      parts.push(
        <text key={`n${pos}`} x={x0 + k * cw + cw / 2} y={bottom + 18 * fs} textAnchor="middle" fontSize={10.5 * fs} fill={state.hot.includes(pos) ? pal.ink : pal.sub} fontWeight={state.hot.includes(pos) ? 700 : 400} fontFamily={MONO}>
          {state.names[pos] ?? ""}
        </text>,
      );
    }
    H = bottom + 28 * fs;
  }

  const w = state.out ? Math.max(60, state.out.length * 8.4 * fs + 18) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describeBits(state)} className={className} style={{ display: "block", ...style }}>
      {state.out && (
        <g transform={`translate(${W - w - 4} 2)`}>
          <rect width={w} height={22} rx={3} fill={pal.pillBg} />
          <text x={9} y={15.5} fontSize={13 * fs} fontWeight={600} fill={pal.pillInk} fontFamily={MONO}>
            {state.out}
          </text>
        </g>
      )}
      {parts}
    </svg>
  );
}
