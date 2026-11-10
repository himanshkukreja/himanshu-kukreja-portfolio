/**
 * The drawing behind the strings view (A7 String basics): one SVG for a StringsState, used by the step player's view (StringsView.tsx,
 * themed with CSS variables) and by the lecture stage's `chars` scene (DsaCharsScene.tsx, the stage's own colours).
 *
 * A text is a strip of letter cells with an index under each. A letter that matched is tinted with an accent edge, a letter that differs
 * has a heavy warning edge, a finished match is filled in the accent. Named pointers sit under the strip as small pills. A pattern is a
 * second strip under the text, starting under the text index `shift`. A count array is a grid of letter slots, 13 to a row, each with the
 * letter above and its count in the cell; the slot in focus has a heavy accent edge. Pure SVG with a viewBox: it scales to its box.
 */
import type { StringsState } from "@/lib/dsa/viz/types";
import type { QueuePalette } from "./QueueDraw";

export type StringsPalette = QueuePalette;

const MONO = "ui-monospace, monospace";
const W = 640;

export function describeStrings(s: StringsState): string {
  const bits: string[] = [`The text ${s.text.join("")} has ${s.text.length} characters.`];
  if (s.pattern) bits.push(`The pattern ${s.pattern.join("")} sits at position ${s.shift}.`);
  if (s.ok.length) bits.push(`${s.ok.length} matched.`);
  if (s.bad.length) bits.push(`Mismatch at position ${s.bad.join(" and ")}.`);
  const pointers = Object.entries(s.marks).map(([k, v]) => `${k} at ${v}`);
  if (pointers.length) bits.push(pointers.join(", ") + ".");
  if (s.counts) {
    const some = s.counts.letters.map((l, i) => (s.counts!.values[i] ? `${l} ${s.counts!.values[i]}` : null)).filter(Boolean);
    bits.push(`Letter counts: ${some.join(", ") || "all zero"}.`);
  }
  if (s.out) bits.push(s.out + ".");
  return bits.join(" ");
}

const show = (c: string) => (c === " " ? "␣" : c);

function Cell({ x, y, w, h, ch, kind, pal, fs }: { x: number; y: number; w: number; h: number; ch: string; kind: "plain" | "ok" | "bad" | "found" | "pattern"; pal: StringsPalette; fs: number }) {
  const fill = kind === "found" ? pal.sig : kind === "ok" ? pal.hl : pal.surface;
  const stroke = kind === "bad" ? pal.bad : kind === "found" || kind === "ok" ? pal.sig : kind === "pattern" ? pal.stroke : pal.faint;
  const ink = kind === "found" ? pal.onSig : pal.ink;
  return (
    <g>
      <rect x={x + 1} y={y} width={w - 2} height={h} rx={3} fill={fill} stroke={stroke} strokeWidth={kind === "bad" ? 3.5 : kind === "ok" || kind === "found" ? 2 : 1.4} />
      <text x={x + w / 2} y={y + h / 2 + Math.min(w * 0.18, 8 * fs)} textAnchor="middle" fontSize={Math.min(w * 0.55, 24) * Math.max(1, fs * 0.9)} fontWeight={600} fill={ink} fontFamily={MONO}>
        {show(ch)}
      </text>
    </g>
  );
}

export default function StringsDraw({ state, pal, fs = 1, className, style }: { state: StringsState; pal: StringsPalette; fs?: number; className?: string; style?: React.CSSProperties }) {
  const n = Math.max(1, state.text.length);
  const cw = Math.min(44, (W - 16) / n);
  const ch = Math.min(46, cw * 1.12);
  const x0 = (W - cw * n) / 2;
  const small = 11.5 * fs;
  let y = state.out ? 30 : 4;
  const parts: React.ReactNode[] = [];

  const foundSet = new Set<number>();
  if (state.found) for (let k = 0; k < state.found[1]; k++) foundSet.add(state.found[0] + k);
  const okSet = new Set(state.ok);
  const badSet = new Set(state.bad);

  // the text strip, with its indexes
  state.text.forEach((c, i) => {
    const kind = foundSet.has(i) ? "found" : badSet.has(i) ? "bad" : okSet.has(i) ? "ok" : "plain";
    parts.push(<Cell key={`t${i}`} x={x0 + i * cw} y={y} w={cw} h={ch} ch={c} kind={kind} pal={pal} fs={fs} />);
    parts.push(
      <text key={`i${i}`} x={x0 + i * cw + cw / 2} y={y + ch + 14 * fs} textAnchor="middle" fontSize={small} fill={pal.sub} fontFamily={MONO}>
        {i}
      </text>,
    );
  });
  y += ch + 14 * fs + 8;

  // named pointers (one pill per index)
  const byIndex = new Map<number, string[]>();
  for (const [name, idx] of Object.entries(state.marks)) byIndex.set(idx, [...(byIndex.get(idx) ?? []), name]);
  if (byIndex.size) {
    for (const [idx, names] of byIndex) {
      const label = names.join(" ");
      const pw = Math.max(cw - 4, label.length * 7.2 * fs + 12);
      const cx = x0 + idx * cw + cw / 2;
      parts.push(
        <g key={`m${idx}`}>
          <path d={`M ${cx - 5} ${y + 8} L ${cx} ${y} L ${cx + 5} ${y + 8} Z`} fill={pal.pillBg} />
          <rect x={cx - pw / 2} y={y + 8} width={pw} height={20 * fs} rx={3} fill={pal.pillBg} />
          <text x={cx} y={y + 8 + 14 * fs} textAnchor="middle" fontSize={12.5 * fs} fontWeight={600} fill={pal.pillInk} fontFamily={MONO}>
            {label}
          </text>
        </g>,
      );
    }
    y += 34 * fs;
  }

  // the pattern strip, under the text
  if (state.pattern) {
    const pat = state.pattern;
    parts.push(
      <text key="pl" x={4} y={y + 10} fontSize={small} fill={pal.sub} fontFamily={MONO}>
        pattern
      </text>,
    );
    y += 16;
    pat.forEach((c, j) => {
      const at = state.shift + j;
      const kind = state.found ? "found" : badSet.has(at) ? "bad" : okSet.has(at) ? "ok" : "pattern";
      parts.push(<Cell key={`p${j}`} x={x0 + at * cw} y={y} w={cw} h={ch} ch={c} kind={kind} pal={pal} fs={fs} />);
    });
    y += ch + 8;
  }

  // the count array: 13 slots to a row, the letter above and the count in the cell
  if (state.counts) {
    const { letters, values, hot } = state.counts;
    const per = 13;
    const sw = (W - 16) / per;
    const sh = Math.min(34, sw * 0.8);
    parts.push(
      <text key="cl" x={4} y={y + 10} fontSize={small} fill={pal.sub} fontFamily={MONO}>
        slots
      </text>,
    );
    y += 16;
    letters.forEach((l, k) => {
      const row = Math.floor(k / per);
      const col = k % per;
      const sx = 8 + col * sw;
      const sy = y + row * (sh + 26 * fs);
      const on = hot === k;
      parts.push(
        <g key={`s${k}`}>
          <text x={sx + sw / 2} y={sy + 11 * fs} textAnchor="middle" fontSize={small} fill={on ? pal.ink : pal.sub} fontWeight={on ? 700 : 400} fontFamily={MONO}>
            {l}
          </text>
          <rect x={sx + 1} y={sy + 16 * fs} width={sw - 2} height={sh} rx={3} fill={values[k] ? pal.hl : pal.surface} stroke={on ? pal.sig : pal.faint} strokeWidth={on ? 3 : 1.2} />
          <text x={sx + sw / 2} y={sy + 16 * fs + sh / 2 + 6 * fs} textAnchor="middle" fontSize={15 * Math.max(1, fs * 0.9)} fontWeight={600} fill={pal.ink} fontFamily={MONO}>
            {values[k]}
          </text>
        </g>,
      );
    });
    y += 2 * (sh + 26 * fs);
  }

  const H = y + 4;
  const w = state.out ? Math.max(60, state.out.length * 8.4 * fs + 18) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describeStrings(state)} className={className} style={{ display: "block", ...style }}>
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
