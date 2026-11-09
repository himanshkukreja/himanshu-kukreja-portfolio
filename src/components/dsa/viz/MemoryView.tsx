"use client";

/**
 * The "memory" view: an array as one block of side-by-side cells with their addresses, above a linked list's nodes
 * scattered through memory, each holding its value and the next node's address, with the head pointer and the hops
 * to reach a position. The picture behind "indexing is O(1) in an array and O(n) in a list".
 */
import type { MemoryState } from "@/lib/dsa/viz/types";

const W = 900;
const CELL = 74;
/** where each node sits in the "memory" area (a scatter, so nodes are visibly not side by side) */
const SPOTS = [
  { x: 420, y: 250 },
  { x: 60, y: 330 },
  { x: 700, y: 330 },
  { x: 260, y: 400 },
  { x: 560, y: 410 },
  { x: 60, y: 450 },
  { x: 740, y: 450 },
  { x: 300, y: 480 },
];
const NW = 150;
const NH = 46;

export function describeMemory(s: MemoryState): string {
  const a = `Array at addresses ${s.array.values.map((v, i) => `${s.array.base + 4 * i}: ${v}`).join(", ")}.`;
  if (!s.list.show) return a;
  const l = s.list.nodes.map((n, i) => `${n.value} at ${n.addr}, next ${i + 1 < s.list.nodes.length ? s.list.nodes[i + 1].addr : "null"}`).join("; ");
  return `${a} Linked list nodes: ${l}.${s.list.head ? ` Head is ${s.list.nodes[0]?.addr}.` : ""}`;
}

export default function MemoryView({ state, t }: { state: MemoryState; prev: MemoryState | null; t: number }) {
  const a = state.array;
  const l = state.list;
  const ax = (W - a.values.length * CELL) / 2;
  const fade = (on: boolean) => (on ? Math.min(1, 0.25 + t) : 0);
  return (
    <svg viewBox={`0 0 ${W} 540`} className="block h-auto w-full" style={{ minWidth: 520 }} aria-hidden>
      <defs>
        <marker id="mem-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--c-signal)" />
        </marker>
      </defs>
      <text x={20} y={30} fontSize={16} fontWeight={700} className="font-mono" fill="var(--c-fg-3)" letterSpacing="0.08em">
        ARRAY · ONE BLOCK
      </text>
      {a.values.map((v, i) => {
        const lit = a.lit === i;
        return (
          <g key={i}>
            <rect x={ax + i * CELL} y={52} width={CELL} height={58} fill={lit ? "var(--c-signal)" : "var(--c-surface)"} stroke={lit ? "var(--c-signal)" : "var(--c-fg-2)"} strokeWidth={lit ? 3 : 2} />
            <text x={ax + i * CELL + CELL / 2} y={89} textAnchor="middle" fontSize={22} fontWeight={700} className="font-mono" fill={lit ? "var(--c-on-signal)" : "var(--c-fg)"}>
              {v}
            </text>
            <text x={ax + i * CELL + CELL / 2} y={132} textAnchor="middle" fontSize={13} className="font-mono" fill="var(--c-fg-3)">
              {a.base + 4 * i}
            </text>
            <text x={ax + i * CELL + CELL / 2} y={44} textAnchor="middle" fontSize={12} className="font-mono" fill="var(--c-fg-4)">
              [{i}]
            </text>
          </g>
        );
      })}

      <line x1={20} x2={W - 20} y1={168} y2={168} stroke="var(--c-line)" strokeWidth={1.5} strokeDasharray="6 6" />
      <g opacity={fade(l.show)}>
        <text x={20} y={204} fontSize={16} fontWeight={700} className="font-mono" fill="var(--c-fg-3)" letterSpacing="0.08em">
          LINKED LIST · NODES ANYWHERE
        </text>
        {l.head && l.nodes[0] && (
          <g>
            <rect x={SPOTS[0].x + NW + 56} y={SPOTS[0].y + 8} width={124} height={30} rx={3} fill="var(--c-fg)" />
            <text x={SPOTS[0].x + NW + 118} y={SPOTS[0].y + 29} textAnchor="middle" fontSize={14} fontWeight={600} className="font-mono" fill="var(--c-bg)">
              head = {l.nodes[0].addr}
            </text>
            <path d={`M${SPOTS[0].x + NW + 54} ${SPOTS[0].y + 23} L${SPOTS[0].x + NW + 8} ${SPOTS[0].y + 23}`} stroke="var(--c-fg)" strokeWidth={2.5} markerEnd="url(#mem-ah)" fill="none" />
          </g>
        )}
        {l.showLinks &&
          l.nodes.slice(0, -1).map((n, i) => {
            const p = SPOTS[i];
            const q = SPOTS[i + 1];
            const x1 = p.x + NW - 10;
            const y1 = p.y + NH / 2;
            const x2 = q.x + (q.x > p.x ? 0 : NW);
            const y2 = q.y + NH / 2;
            return <path key={`ln-${i}`} d={`M${x1} ${y1} C${x1 + 40} ${y1 + 50}, ${x2 - 40} ${y2 - 50}, ${x2} ${y2}`} stroke="var(--c-signal)" strokeWidth={2.5} fill="none" markerEnd="url(#mem-ah)" opacity={Math.min(1, t * 1.4)} />;
          })}
        {l.nodes.map((n, i) => {
          const p = SPOTS[i];
          const lit = l.lit === i;
          const reached = l.lit !== null && i < (l.lit ?? 0);
          const nextAddr = i + 1 < l.nodes.length ? String(l.nodes[i + 1].addr) : "null";
          return (
            <g key={n.addr}>
              <text x={p.x} y={p.y - 8} fontSize={13} className="font-mono" fill="var(--c-fg-3)">
                @{n.addr}
              </text>
              <rect x={p.x} y={p.y} width={NW} height={NH} fill={lit ? "var(--c-dsa-hl)" : "var(--c-surface)"} stroke={lit ? "var(--c-signal)" : reached ? "var(--c-signal)" : "var(--c-fg-2)"} strokeWidth={lit ? 3 : 2} />
              <line x1={p.x + 58} x2={p.x + 58} y1={p.y} y2={p.y + NH} stroke="var(--c-fg-3)" strokeWidth={1.5} />
              <text x={p.x + 29} y={p.y + 31} textAnchor="middle" fontSize={22} fontWeight={700} className="font-mono" fill="var(--c-fg)">
                {n.value}
              </text>
              <text x={p.x + 104} y={p.y + 29} textAnchor="middle" fontSize={14} className="font-mono" fill={l.showLinks ? "var(--c-signal-text)" : "var(--c-fg-4)"}>
                {l.showLinks ? `next ${nextAddr}` : "next ?"}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
