/**
 * The drawing behind the queue view: one SVG for a QueueState, used by the step player's view (QueueView.tsx, themed with
 * CSS variables) and by the lecture stage's `queue` scene (DsaQueueScene.tsx, the stage's own colours).
 *
 * Three ways to draw it:
 *   ring   numbered cells in a row, the free ones dashed; `head` (the front) and `tail` (the next free cell) are pills
 *          under their cells; a return arrow runs from the last cell round to the first, and lights up when a pointer
 *          wraps. The cells hold the values where the memory does, so a queue that wraps shows its values on both sides.
 *   list   nodes left to right, the front on the left (value | next); arrows to the right; a deque has arrows both ways.
 *   window the sliding-window maximum: the stream with the window over it, the deque of indexes, and the answers so far.
 *
 * An item in flight (about to join, or just removed) hovers above its end, dashed. Positions tween between frames
 * (t: 0 → 1). Pure SVG with a viewBox: it scales to its box and never overflows the page, on a phone too.
 */
import type { NodeId, QueueItem, QueueState } from "@/lib/dsa/viz/types";

export type QueuePalette = {
  ink: string;
  sub: string;
  surface: string;
  stroke: string;
  faint: string;
  sig: string;
  hl: string;
  onSig: string;
  pillBg: string;
  pillInk: string;
  bad: string;
  badInk: string;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const MONO = "ui-monospace, monospace";

const CW = 52; // ring cell
const CH = 56;
const PITCH = 58;
const NW = 74; // list node
const NH = 50;
const NPITCH = 98;

const fsOf = (s: string, base: number) => (s.length > 4 ? base * 0.62 : s.length > 3 ? base * 0.74 : s.length > 2 ? base * 0.88 : base);

export function describeQueue(s: QueueState): string {
  if (s.mode === "window" && s.win) {
    const w = s.win;
    const dq = w.deque.map((i) => w.stream[i]);
    return `Sliding maximum, window of ${w.k}. Stream: ${w.stream.join(", ")}.${w.window ? ` Window covers indexes ${w.window[0]} to ${w.window[1]}.` : ""} Deque, front to back: ${dq.length ? dq.join(", ") : "empty"}. Answers so far: ${w.results.length ? w.results.join(", ") : "none"}.${s.out ? ` ${s.out}.` : ""}`;
  }
  const vals = s.items.map((i) => i.value);
  const lifted = s.lifted ? ` ${s.lifted.value} is in the air at the ${s.liftAt}.` : "";
  const how = s.mode === "ring" ? "ring buffer" : s.doubly ? "doubly linked list" : "linked list";
  const ring = s.mode === "ring" && s.cells ? ` ${s.cells.length} cells, head at cell ${s.head}, tail at cell ${s.tail}.` : "";
  return `Queue (${how}), ${vals.length ? `front to back: ${vals.join(", ")}.` : "empty."}${ring}${lifted}${s.out ? ` ${s.out}.` : ""}`;
}

function Pill({ x, y, label, hot, pal, up }: { x: number; y: number; label: string; hot?: boolean; pal: QueuePalette; up?: boolean }) {
  const w = label.length * 9.5 + 14;
  const bg = hot ? pal.sig : pal.pillBg;
  const ink = hot ? pal.onSig : pal.pillInk;
  return (
    <g>
      <line x1={x} x2={x} y1={up ? y + 22 : y} y2={up ? y + 36 : y - 14} stroke={hot ? pal.sig : pal.ink} strokeWidth={2.5} markerEnd="url(#qd-ah)" />
      <rect x={x - w / 2} y={y} width={w} height={22} rx={3} fill={bg} />
      <text x={x} y={y + 16} textAnchor="middle" fontSize={14} fontWeight={700} fontFamily={MONO} fill={ink}>
        {label}
      </text>
    </g>
  );
}

export default function QueueDraw({
  state,
  prev,
  t,
  pal,
  fs = 1,
  style,
  className,
}: {
  state: QueueState;
  prev: QueueState | null;
  t: number;
  pal: QueuePalette;
  /** type scale for the text (the vertical short draws bigger) */
  fs?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const svgProps = { className, style, "aria-hidden": true as const };
  const defs = (
    <defs>
      <marker id="qd-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={pal.sub} />
      </marker>
      <marker id="qd-ah-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={pal.sig} />
      </marker>
    </defs>
  );
  const chip = (w: number) =>
    state.out ? (
      <g>
        <rect x={8} y={6} width={Math.max(90, state.out.length * 9.5 + 20)} height={26} rx={3} fill={state.out === "empty" || state.out.startsWith("full") ? pal.bad : pal.ink} />
        <text x={18} y={24} fontSize={14} fontWeight={700} fontFamily={MONO} fill={state.out === "empty" || state.out.startsWith("full") ? pal.badInk : pal.surface}>
          {state.out}
        </text>
        <title>{w ? "" : ""}</title>
      </g>
    ) : null;

  /* ------------------------------------------------------------------ the sliding-window maximum */
  if (state.mode === "window" && state.win) {
    const w = state.win;
    const n = w.stream.length;
    const X0 = 84;
    const P = 52;
    const BW = 44;
    const width = X0 + Math.max(n, 6) * P + 10;
    const yA = 56;
    const yB = 140;
    const yC = 224;
    const height = 292;
    const cx = (j: number) => X0 + j * P;
    const inWin = (i: number) => !!w.window && i >= w.window[0] && i <= w.window[1];
    const arrived = (i: number) => w.cur !== null && i <= w.cur;
    const label = (y: number, text: string) => (
      <text x={6} y={y + BW / 2 + 5} fontSize={14} fontWeight={700} fontFamily={MONO} fill={pal.sub}>
        {text}
      </text>
    );
    const dropIsBack = w.dropping !== null && w.deque.every((i) => w.dropping! > i);
    const prevDeque = prev?.win?.deque ?? [];
    return (
      <svg viewBox={`0 0 ${width} ${height}`} {...svgProps}>
        {defs}
        {label(yA, "stream")}
        {label(yB, "deque")}
        {label(yC, "answers")}
        {w.window && (
          <g>
            <rect x={cx(w.window[0]) - 5} y={yA - 8} width={(w.window[1] - w.window[0] + 1) * P - 2 + 6} height={BW + 34} rx={4} fill="none" stroke={pal.sig} strokeWidth={3} strokeDasharray="7 4" />
            <text x={cx(w.window[0])} y={yA - 14} fontSize={13} fontWeight={700} fontFamily={MONO} fill={pal.sig}>
              {`window of ${w.k}`}
            </text>
          </g>
        )}
        {w.stream.map((v, i) => {
          const cur = w.cur === i;
          return (
            <g key={`s${i}`} opacity={arrived(i) ? 1 : 0.5}>
              <rect x={cx(i)} y={yA} width={BW} height={BW} fill={cur ? pal.sig : inWin(i) ? pal.hl : pal.surface} stroke={cur ? pal.sig : pal.stroke} strokeWidth={cur ? 3 : 2} />
              <text x={cx(i) + BW / 2} y={yA + BW / 2 + 7} textAnchor="middle" fontSize={fsOf(String(v), 20) * fs} fontWeight={700} fontFamily={MONO} fill={cur ? pal.onSig : pal.ink}>
                {v}
              </text>
              <text x={cx(i) + BW / 2} y={yA + BW + 16} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={pal.sub}>
                {i}
              </text>
            </g>
          );
        })}
        <text x={X0 - 2} y={yB - 8} fontSize={12} fontFamily={MONO} fill={pal.sub}>
          front
        </text>
        <text x={cx(Math.max(w.deque.length, 1)) - 4} y={yB - 8} fontSize={12} fontFamily={MONO} fill={pal.sub} textAnchor="end">
          {w.deque.length > 1 ? "back" : ""}
        </text>
        <line x1={X0 - 6} x2={X0 + Math.max(n, 6) * P - 8} y1={yB + BW + 6} y2={yB + BW + 6} stroke={pal.faint} strokeWidth={2} />
        {w.deque.map((idx, j) => {
          const fresh = !prevDeque.includes(idx);
          const front = j === 0;
          return (
            <g key={`d${idx}`} opacity={fresh ? Math.min(1, t * 1.6) : 1}>
              <rect x={cx(j)} y={yB} width={BW} height={BW} fill={front ? pal.sig : pal.surface} stroke={front ? pal.sig : pal.stroke} strokeWidth={front ? 3 : 2} />
              <text x={cx(j) + BW / 2} y={yB + BW / 2 + 7} textAnchor="middle" fontSize={fsOf(String(w.stream[idx]), 20) * fs} fontWeight={700} fontFamily={MONO} fill={front ? pal.onSig : pal.ink}>
                {w.stream[idx]}
              </text>
              <text x={cx(j) + BW / 2} y={yB + BW + 21} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={pal.sub}>
                {`#${idx}`}
              </text>
            </g>
          );
        })}
        {w.dropping !== null && (
          <g opacity={1 - 0.0 * t}>
            <rect x={cx(dropIsBack ? w.deque.length : 0) + 6} y={yB - 38} width={BW} height={BW} fill={pal.hl} stroke={pal.sig} strokeWidth={3} strokeDasharray="6 4" />
            <text x={cx(dropIsBack ? w.deque.length : 0) + 6 + BW / 2} y={yB - 38 + BW / 2 + 7} textAnchor="middle" fontSize={fsOf(String(w.stream[w.dropping]), 20) * fs} fontWeight={700} fontFamily={MONO} fill={pal.ink}>
              {w.stream[w.dropping]}
            </text>
            <text x={cx(dropIsBack ? w.deque.length : 0) + 6 + BW + 6} y={yB - 38 + 14} fontSize={12} fontFamily={MONO} fill={pal.sig}>
              {dropIsBack ? "out the back" : "out the front"}
            </text>
          </g>
        )}
        {w.results.map((v, j) => (
          <g key={`r${j}`} opacity={j === w.results.length - 1 && prev && (prev.win?.results.length ?? 0) < w.results.length ? Math.min(1, t * 1.6) : 1}>
            <rect x={cx(j)} y={yC} width={BW} height={BW} fill={pal.surface} stroke={j === w.results.length - 1 ? pal.sig : pal.stroke} strokeWidth={j === w.results.length - 1 ? 3 : 2} />
            <text x={cx(j) + BW / 2} y={yC + BW / 2 + 7} textAnchor="middle" fontSize={fsOf(String(v), 20) * fs} fontWeight={700} fontFamily={MONO} fill={pal.ink}>
              {v}
            </text>
          </g>
        ))}
        {!w.results.length && (
          <text x={X0} y={yC + BW / 2 + 5} fontSize={14} fontFamily={MONO} fill={pal.sub}>
            none yet
          </text>
        )}
        {chip(1)}
      </svg>
    );
  }

  /* ------------------------------------------------------------------ the ring buffer */
  if (state.mode === "ring" && state.cells) {
    const N = Math.max(state.cells.length, prev?.cells?.length ?? 0, 4);
    const LM = 42;
    const width = LM * 2 + N * PITCH - (PITCH - CW);
    const cellY = 66;
    const rowHead = cellY + CH + 16;
    const rowTail = rowHead + 36;
    const loopY = rowTail + 44;
    const height = loopY + 26;
    const cx = (i: number) => LM + i * PITCH;
    const where = (s: QueueState | null, id: NodeId): number | null => {
      if (!s?.cells) return null;
      const k = s.cells.findIndex((c) => c?.id === id);
      return k < 0 ? null : k;
    };
    const cap = state.cells.length;
    const same = state.head === state.tail;
    const ptr = (key: "head" | "tail", s: QueueState) => cx(s[key]) + CW / 2 + (s.head === s.tail ? (key === "head" ? -14 : 14) : 0);
    const hx = lerp(prev ? ptr("head", prev) : ptr("head", state), ptr("head", state), t);
    const tx = lerp(prev ? ptr("tail", prev) : ptr("tail", state), ptr("tail", state), t);
    const xR = cx(N - 1) + CW;
    const xL = cx(0);
    const midY = cellY + CH / 2;
    const lit = !!state.wrapped;
    const show = (it: QueueItem | null, i: number) => {
      if (!it) return null;
      const from = where(prev, it.id);
      const x = from === null ? cx(i) : lerp(cx(from), cx(i), t);
      const lit1 = state.mark.includes(it.id);
      const chg = state.changed.includes(it.id);
      const op = from === null && prev ? Math.min(1, t * 1.6) : 1;
      return (
        <g key={`c${it.id}`} opacity={op}>
          <rect x={x} y={cellY} width={CW} height={CH} fill={lit1 ? pal.sig : chg ? pal.hl : pal.surface} stroke={lit1 || chg ? pal.sig : pal.stroke} strokeWidth={lit1 || chg ? 3 : 2} />
          <text x={x + CW / 2} y={cellY + CH / 2 + 8} textAnchor="middle" fontSize={fsOf(it.value, 22) * fs} fontWeight={700} fontFamily={MONO} fill={lit1 ? pal.onSig : pal.ink}>
            {it.value}
          </text>
          <text x={x + 5} y={cellY + 13} fontSize={11} fontFamily={MONO} fill={lit1 ? pal.onSig : pal.sub}>
            {i}
          </text>
          {state.base !== null && (
            <text x={x + CW / 2} y={cellY + CH - 5} textAnchor="middle" fontSize={10} fontFamily={MONO} fill={lit1 ? pal.onSig : pal.sub}>
              {`@${state.base + 4 * i}`}
            </text>
          )}
        </g>
      );
    };
    const lifted = state.lifted;
    const lc = state.liftCell ?? (state.liftAt === "front" ? state.head : state.tail);
    const pl = prev?.lifted && prev.lifted.id === lifted?.id ? (prev.liftCell ?? lc) : lc;
    const lx = lerp(cx(pl), cx(lc), t);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} {...svgProps}>
        {defs}
        {Array.from({ length: cap }, (_, i) =>
          state.cells![i] ? null : (
            <g key={`f${i}`}>
              <rect x={cx(i)} y={cellY} width={CW} height={CH} fill="none" stroke={pal.faint} strokeWidth={1.5} strokeDasharray="5 5" />
              <text x={cx(i) + 5} y={cellY + 13} fontSize={11} fontFamily={MONO} fill={pal.sub}>
                {i}
              </text>
              {state.base !== null && (
                <text x={cx(i) + CW / 2} y={cellY + CH - 5} textAnchor="middle" fontSize={10} fontFamily={MONO} fill={pal.sub}>
                  {`@${state.base + 4 * i}`}
                </text>
              )}
            </g>
          ),
        )}
        {state.cells.map((c, i) => show(c, i))}
        {lifted && (
          <g>
            <rect x={lx} y={cellY - 58} width={CW} height={CH - 8} fill={pal.hl} stroke={pal.sig} strokeWidth={3} strokeDasharray="6 4" />
            <text x={lx + CW / 2} y={cellY - 58 + (CH - 8) / 2 + 8} textAnchor="middle" fontSize={fsOf(lifted.value, 22) * fs} fontWeight={700} fontFamily={MONO} fill={pal.ink}>
              {lifted.value}
            </text>
          </g>
        )}
        {/* the return arrow: the ring closes here */}
        <path
          d={`M ${xR + 3} ${midY} H ${xR + 22} Q ${xR + 32} ${midY} ${xR + 32} ${midY + 10} V ${loopY - 10} Q ${xR + 32} ${loopY} ${xR + 22} ${loopY} H ${xL - 22} Q ${xL - 32} ${loopY} ${xL - 32} ${loopY - 10} V ${midY + 10} Q ${xL - 32} ${midY} ${xL - 22} ${midY} H ${xL - 4}`}
          fill="none"
          stroke={lit ? pal.sig : pal.faint}
          strokeWidth={lit ? 3.5 : 2}
          strokeDasharray={lit ? undefined : "6 5"}
          markerEnd={lit ? "url(#qd-ah-hot)" : "url(#qd-ah)"}
        />
        <text x={width / 2} y={loopY - 7} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={lit ? pal.sig : pal.sub} fontWeight={lit ? 700 : 400}>
          {lit ? `${state.wrapped} wraps round` : "after the last cell comes cell 0"}
        </text>
        <Pill x={hx} y={rowHead} label="head" pal={pal} up />
        <Pill x={tx} y={same ? rowHead + 36 : rowHead} label="tail" pal={pal} up hot={false} />
        {chip(1)}
      </svg>
    );
  }

  /* ------------------------------------------------------------------ the linked list */
  const items = state.items;
  const lifted = state.lifted;
  const slotsOf = (s: QueueState) => s.items.length + (s.lifted && s.liftAt === "back" ? 1 : 0);
  const S = Math.max(slotsOf(state), prev ? slotsOf(prev) : 0, 3);
  const LM = 24;
  const width = LM * 2 + S * NPITCH - (NPITCH - NW);
  const nodeY = 74;
  const rowHead = nodeY + NH + 16;
  const height = rowHead + 78;
  const nx = (i: number) => LM + i * NPITCH;
  const idxOf = (s: QueueState | null, id: NodeId) => {
    const k = s ? s.items.findIndex((x) => x.id === id) : -1;
    return k < 0 ? null : k;
  };
  const posX = (id: NodeId, i: number) => {
    const f = idxOf(prev, id);
    return f === null ? nx(i) : lerp(nx(f), nx(i), t);
  };
  const has = (k: string) => k in state.labels;
  const headId = has("head") ? state.labels.head : (items[0]?.id ?? null);
  const tailId = has("tail") ? state.labels.tail : (items[items.length - 1]?.id ?? null);
  const idxHead = headId === null ? null : idxOf(state, headId);
  const idxTail = tailId === null ? null : idxOf(state, tailId);
  const prevHead = prev ? (("head" in prev.labels ? prev.labels.head : (prev.items[0]?.id ?? null)) ?? null) : null;
  const prevTail = prev ? (("tail" in prev.labels ? prev.labels.tail : (prev.items[prev.items.length - 1]?.id ?? null)) ?? null) : null;
  const sameNode = idxHead !== null && idxHead === idxTail;
  const px = (id: NodeId | null, s: QueueState | null, shift: number) => {
    const i = id === null ? null : idxOf(s, id);
    return i === null ? null : nx(i) + NW / 2 + shift;
  };
  const targetH = px(headId, state, sameNode ? -16 : 0);
  const targetT = px(tailId, state, sameNode ? 16 : 0);
  const fromH = prev ? px(prevHead, prev, 0) : null;
  const fromT = prev ? px(prevTail, prev, 0) : null;
  const gx = (to: number | null, from: number | null) => (to === null ? null : from === null ? to : lerp(from, to, t));
  const hX = gx(targetH, fromH);
  const tX = gx(targetT, fromT);
  const curr = state.labels.curr;
  const liftX = lifted ? (state.liftAt === "front" ? nx(0) : nx(items.length)) : 0;
  const midY = nodeY + NH / 2;
  const dbl = state.doubly;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} {...svgProps}>
      {defs}
      {items.map((it, i) => {
        if (i === 0) return null;
        const a = posX(items[i - 1].id, i - 1) + NW;
        const b = posX(it.id, i);
        return (
          <g key={`ar${it.id}`}>
            <line x1={a - 14} x2={b - 3} y1={dbl ? midY - 7 : midY} y2={dbl ? midY - 7 : midY} stroke={pal.sub} strokeWidth={2} markerEnd="url(#qd-ah)" />
            {dbl && <line x1={b + 8} x2={a + 3} y1={midY + 7} y2={midY + 7} stroke={pal.sub} strokeWidth={2} markerEnd="url(#qd-ah)" />}
          </g>
        );
      })}
      {lifted && state.changed.includes(lifted.id) && items.length > 0 && (
        <line
          x1={state.liftAt === "back" ? nx(items.length - 1) + NW - 14 : liftX + NW / 2}
          y1={state.liftAt === "back" ? midY : nodeY - 56 + NH}
          x2={state.liftAt === "back" ? liftX + 3 : nx(0) + NW / 2}
          y2={state.liftAt === "back" ? nodeY - 56 + NH / 2 : nodeY - 3}
          stroke={pal.sig}
          strokeWidth={3}
          markerEnd="url(#qd-ah-hot)"
        />
      )}
      {items.map((it, i) => {
        const x = posX(it.id, i);
        const lit = state.mark.includes(it.id);
        const chg = state.changed.includes(it.id);
        const op = prev && idxOf(prev, it.id) === null ? Math.min(1, t * 1.6) : 1;
        const last = i === items.length - 1;
        return (
          <g key={it.id} opacity={op}>
            <rect x={x} y={nodeY} width={NW} height={NH} fill={lit ? pal.sig : chg ? pal.hl : pal.surface} stroke={lit || chg ? pal.sig : pal.stroke} strokeWidth={lit || chg ? 3 : 2} />
            <line x1={x + NW - 28} x2={x + NW - 28} y1={nodeY} y2={nodeY + NH} stroke={lit ? pal.onSig : pal.sub} strokeWidth={1.5} />
            <text x={x + (NW - 28) / 2} y={nodeY + NH / 2 + 8} textAnchor="middle" fontSize={fsOf(it.value, 22) * fs} fontWeight={700} fontFamily={MONO} fill={lit ? pal.onSig : pal.ink}>
              {it.value}
            </text>
            {last ? (
              <text x={x + NW - 14} y={nodeY + NH / 2 + 4} textAnchor="middle" fontSize={11} fontFamily={MONO} fill={lit ? pal.onSig : pal.sub}>
                null
              </text>
            ) : (
              <circle cx={x + NW - 14} cy={nodeY + NH / 2} r={4.5} fill={lit ? pal.onSig : pal.stroke} />
            )}
            {state.addrs[it.id] !== undefined && (
              <text x={x + (NW - 28) / 2} y={nodeY + NH + 15} textAnchor="middle" fontSize={11} fontFamily={MONO} fill={pal.sub}>
                {`@${state.addrs[it.id]}`}
              </text>
            )}
          </g>
        );
      })}
      {lifted && (
        <g>
          <rect x={liftX + (state.liftAt === "front" ? 0 : 8)} y={nodeY - 56} width={NW} height={NH} fill={pal.hl} stroke={pal.sig} strokeWidth={3} strokeDasharray="6 4" />
          <text x={liftX + (state.liftAt === "front" ? 0 : 8) + (NW - 28) / 2} y={nodeY - 56 + NH / 2 + 8} textAnchor="middle" fontSize={fsOf(lifted.value, 22) * fs} fontWeight={700} fontFamily={MONO} fill={pal.ink}>
            {lifted.value}
          </text>
        </g>
      )}
      {items.length === 0 && !lifted && (
        <text x={width / 2} y={nodeY + NH / 2 + 6} textAnchor="middle" fontSize={16} fontFamily={MONO} fill={pal.sub}>
          head and tail are null: the queue is empty
        </text>
      )}
      {typeof curr === "number" && idxOf(state, curr) !== null && (
        <g transform={`translate(${nx(idxOf(state, curr) as number) + NW / 2} ${nodeY - 40})`}>
          <rect x={-22} width={44} height={22} rx={3} fill={pal.sig} />
          <text x={0} y={16} textAnchor="middle" fontSize={14} fontWeight={700} fontFamily={MONO} fill={pal.onSig}>
            curr
          </text>
          <line x1={0} x2={0} y1={22} y2={36} stroke={pal.sig} strokeWidth={2.5} markerEnd="url(#qd-ah-hot)" />
        </g>
      )}
      {hX !== null && <Pill x={hX} y={rowHead} label="head" pal={pal} up />}
      {tX !== null && <Pill x={tX} y={sameNode ? rowHead + 36 : rowHead} label="tail" pal={pal} up />}
      {chip(1)}
    </svg>
  );
}
