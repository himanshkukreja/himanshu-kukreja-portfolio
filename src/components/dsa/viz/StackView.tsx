"use client";

/**
 * The "stack" view: items stacked bottom to top like plates, a `top` pointer on the newest one, and three ways to draw
 * the same idea. Array-backed: numbered cells in a block, the free cells above dashed. List-backed: nodes (value | next)
 * with arrows pointing down at the node underneath, head = top. The call stack: wide frames with the function call
 * written on them and, when it is about to return, the value it returns.
 *
 * An item being pushed or popped hovers above the top (dashed). Positions tween between frames (t: 0 → 1), so a pushed
 * item drops in, a popped one lifts off and the pointer glides. SVG with a viewBox: it scales to its box (capped in
 * height) and never overflows the page, on a phone too.
 */
import type { NodeId, StackItem, StackState } from "@/lib/dsa/viz/types";

const H = 40;
const LEFT = 62;
const TOP_PAD = 44;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const widthOf = (mode: StackState["mode"]) => (mode === "calls" ? 270 : 214);
const gapOf = (mode: StackState["mode"]) => (mode === "list" ? 24 : 7);

const rowsOf = (s: StackState) => Math.max(s.capacity ?? 0, s.items.length, 3) + (s.lifted ? 1 : 0);

export function describeStack(s: StackState): string {
  const how = s.mode === "array" ? "array-backed" : s.mode === "list" ? "list-backed" : "call stack";
  const vals = s.items.map((i) => i.value);
  const top = s.labels.top === null || s.labels.top === undefined ? null : s.items.find((i) => i.id === s.labels.top)?.value;
  const lifted = s.lifted ? ` ${s.lifted.value} is in the air above the stack.` : "";
  const cursor = s.labels.curr !== undefined && s.labels.curr !== null ? ` curr at ${s.items.find((i) => i.id === s.labels.curr)?.value}.` : "";
  const cap = s.capacity !== null ? ` Room for ${s.capacity}.` : "";
  return `Stack (${how}), ${vals.length ? `bottom to top: ${vals.join(", ")}. Top is ${top}.` : "empty."}${cap}${lifted}${cursor}${s.out ? ` ${s.out}.` : ""}`;
}

export default function StackView({ state, prev, t }: { state: StackState; prev: StackState | null; t: number }) {
  const mode = state.mode;
  const W = widthOf(mode);
  const GAP = gapOf(mode);
  const pitch = H + GAP;
  const rows = Math.max(rowsOf(state), prev ? rowsOf(prev) : 0);
  const height = TOP_PAD + rows * pitch + 10;
  const width = LEFT + W + 150;
  const slotY = (s: number) => TOP_PAD + (rows - 1 - s) * pitch;

  const place = (st: StackState): Map<NodeId, { x: number; y: number }> => {
    const m = new Map<NodeId, { x: number; y: number }>();
    st.items.forEach((it, i) => m.set(it.id, { x: LEFT, y: slotY(i) }));
    if (st.lifted) {
      const away = st.mode === "list" ? 0 : 30;
      m.set(st.lifted.id, { x: LEFT + away, y: slotY(st.items.length) - (st.mode === "list" ? 0 : 10) });
    }
    return m;
  };
  const now = place(state);
  const was = prev ? place(prev) : now;
  const pos = (id: NodeId) => {
    const a = was.get(id);
    const b = now.get(id);
    if (!b) return a ?? { x: LEFT, y: slotY(0) };
    if (!a) return b;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  };
  const fresh = (id: NodeId) => !!prev && !was.has(id);
  const all: StackItem[] = [...state.items, ...(state.lifted ? [state.lifted] : [])];

  const cap = state.capacity ?? 0;
  const free: number[] = [];
  for (let k = state.items.length; k < cap; k++) free.push(k);

  const labelKeys = ["top", "curr"].filter((k) => k in state.labels);
  const labelY = (k: string, id: NodeId | null | undefined, which: "now" | "was") => {
    const src = which === "now" ? now : was;
    const st = which === "now" ? state : (prev as StackState);
    const base = id === null || id === undefined ? slotY(0) + H / 2 : (src.get(id)?.y ?? slotY(0)) + H / 2;
    const peers = ["top", "curr"].filter((q) => q in st.labels && st.labels[q] === id);
    const idx = peers.indexOf(k);
    const off = peers.length > 1 ? (idx === 0 ? -12 : 12) : 0;
    return base + off;
  };

  const valueFs = mode === "calls" ? 19 : 22;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full" style={{ maxHeight: 460 }} aria-hidden>
      <defs>
        <marker id="sk-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--c-fg-3)" />
        </marker>
        <marker id="sk-ah-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--c-signal)" />
        </marker>
      </defs>

      {/* the floor the stack stands on */}
      <line x1={LEFT - 10} x2={LEFT + W + 10} y1={slotY(0) + H + (GAP > 10 ? 6 : 3)} y2={slotY(0) + H + (GAP > 10 ? 6 : 3)} stroke="var(--c-fg-2)" strokeWidth={3} />

      {/* free cells (array and call stack): room left in the block */}
      {free.map((k) => (
        <g key={`free-${k}`}>
          {mode === "array" && (
            <text x={LEFT - 12} y={slotY(k) + H / 2 + 5} textAnchor="end" fontSize={13} className="font-mono" fill="var(--c-fg-3)">
              {k}
            </text>
          )}
          <rect x={LEFT} y={slotY(k)} width={W} height={H} fill="none" stroke="var(--c-line-strong, var(--c-fg-3))" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />
        </g>
      ))}

      {/* list mode: next arrows point down at the node underneath */}
      {mode === "list" &&
        state.items.map((it, i) => {
          if (i === 0) return null;
          const a = pos(it.id);
          const b = pos(state.items[i - 1].id);
          const x = LEFT + W - 17;
          return <line key={`arrow-${it.id}`} x1={x} x2={x} y1={a.y + H} y2={b.y - 3} stroke="var(--c-fg-3)" strokeWidth={2} markerEnd="url(#sk-ah)" />;
        })}
      {mode === "list" && state.lifted && state.changed.includes(state.lifted.id) && state.items.length > 0 && (
        <line x1={LEFT + W - 17} x2={LEFT + W - 17} y1={pos(state.lifted.id).y + H} y2={pos(state.items[state.items.length - 1].id).y - 3} stroke="var(--c-signal)" strokeWidth={3} markerEnd="url(#sk-ah-hot)" />
      )}

      {/* the items */}
      {all.map((it) => {
        const p = pos(it.id);
        const lifted = state.lifted?.id === it.id;
        const index = state.items.findIndex((x) => x.id === it.id);
        const lit = state.mark.includes(it.id);
        const chg = state.changed.includes(it.id);
        const op = fresh(it.id) ? Math.min(1, t * 1.6) : 1;
        const addr = state.addrs[it.id];
        const ret = state.ret[it.id];
        const isList = mode === "list";
        const fill = lit ? "var(--c-signal)" : chg || lifted ? "var(--c-dsa-hl)" : "var(--c-surface)";
        const ink = lit ? "var(--c-on-signal)" : "var(--c-fg)";
        const sub = lit ? "var(--c-on-signal)" : "var(--c-fg-3)";
        const bottomList = isList && index === 0;
        return (
          <g key={it.id} opacity={op}>
            {mode === "array" && !lifted && (
              <text x={LEFT - 12} y={p.y + H / 2 + 5} textAnchor="end" fontSize={13} className="font-mono" fill="var(--c-fg-3)">
                {index}
              </text>
            )}
            <rect x={p.x} y={p.y} width={W} height={H} fill={fill} stroke={lit || chg || lifted ? "var(--c-signal)" : "var(--c-fg-2)"} strokeWidth={lit || chg || lifted ? 3 : 2} strokeDasharray={lifted ? "6 4" : undefined} />
            {isList && <line x1={p.x + W - 34} x2={p.x + W - 34} y1={p.y} y2={p.y + H} stroke={lit ? "var(--c-on-signal)" : "var(--c-fg-3)"} strokeWidth={1.5} />}
            <text x={p.x + (isList ? (W - 34) / 2 : mode === "calls" ? 14 : W / 2)} y={p.y + H / 2 + valueFs * 0.35} textAnchor={mode === "calls" ? "start" : "middle"} fontSize={valueFs} fontWeight={700} className="font-mono" fill={ink}>
              {it.value}
            </text>
            {isList &&
              (bottomList ? (
                <text x={p.x + W - 17} y={p.y + H / 2 + 4} textAnchor="middle" fontSize={11} className="font-mono" fill={sub}>
                  null
                </text>
              ) : lifted && !state.changed.includes(it.id) ? (
                <text x={p.x + W - 17} y={p.y + H / 2 + 4} textAnchor="middle" fontSize={11} className="font-mono" fill={sub}>
                  null
                </text>
              ) : (
                <circle cx={p.x + W - 17} cy={p.y + H / 2} r={4.5} fill={lit ? "var(--c-on-signal)" : chg ? "var(--c-signal)" : "var(--c-fg-2)"} />
              ))}
            {addr !== undefined && (
              <text x={p.x + W - (isList ? 40 : 8)} y={p.y + H - 6} textAnchor="end" fontSize={10.5} className="font-mono" fill={sub}>
                @{addr}
              </text>
            )}
            {ret !== undefined && (
              <text x={p.x + W - 12} y={p.y + H / 2 + 5} textAnchor="end" fontSize={15} fontWeight={700} className="font-mono" fill={lit ? "var(--c-on-signal)" : "var(--c-signal-text, var(--c-signal))"}>
                {ret}
              </text>
            )}
          </g>
        );
      })}

      {state.items.length === 0 && !state.lifted && (
        <text x={LEFT + W / 2} y={slotY(0) + H / 2 + 5} textAnchor="middle" fontSize={16} className="font-mono" fill="var(--c-fg-3)">
          {mode === "list" ? "top is null: the stack is empty" : "the stack is empty"}
        </text>
      )}

      {/* the pointers: top (and a search's curr) glide to their item */}
      {labelKeys.map((k) => {
        const id = state.labels[k];
        const to = labelY(k, id, "now");
        const from = prev && k in prev.labels ? labelY(k, prev.labels[k], "was") : to;
        const y = lerp(from, to, t);
        const label = k === "top" ? (mode === "list" ? "top (head)" : "top") : k;
        const tw = label.length * 10 + 18;
        const hot = k !== "top";
        return (
          <g key={k} transform={`translate(${LEFT + W + 14} ${y - 11})`}>
            <path d={`M-12 11 L0 11`} stroke={hot ? "var(--c-signal)" : "var(--c-fg)"} strokeWidth={2.5} markerStart="url(#sk-ah)" fill="none" />
            <rect width={tw} height={22} rx={3} fill={hot ? "var(--c-signal)" : "var(--c-fg)"} />
            <text x={tw / 2} y={16} textAnchor="middle" fontSize={13.5} fontWeight={600} className="font-mono" fill={hot ? "var(--c-on-signal)" : "var(--c-bg)"}>
              {label}
            </text>
          </g>
        );
      })}

      {state.out && (
        <g>
          <rect x={LEFT} y={6} width={Math.max(90, state.out.length * 9.5 + 20)} height={26} rx={3} fill={state.out === "stack overflow" || state.out === "empty" ? "var(--c-bad-text, #b3261e)" : "var(--c-fg)"} />
          <text x={LEFT + 10} y={24} fontSize={14} fontWeight={700} className="font-mono" fill="var(--c-bg)">
            {state.out}
          </text>
        </g>
      )}
    </svg>
  );
}
