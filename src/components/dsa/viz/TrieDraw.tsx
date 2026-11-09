"use client";

/**
 * The drawing behind the trie view: a TrieState drawn as a tree of letters. The root is at the top, every edge carries the letter
 * that leads to its child, and a node that ends a word is drawn with a double ring. The path walked so far is in the accent, the
 * node being looked at is filled, new nodes have a heavy outline, and nodes lit by a prefix question are tinted. Used by the step
 * player's view (TrieView.tsx, themed with CSS variables) and by the lecture stage's `trie` scene (DsaTrieScene.tsx).
 */
import type { TrieState } from "@/lib/dsa/viz/types";
import { prefixesOf } from "@/lib/dsa/viz/trie";
import type { TreePalette } from "./TreeDraw";

const MONO = "ui-monospace, monospace";
const DX = 40;
const DY = 46;

export function describeTrie(s: TrieState): string {
  const n = prefixesOf(s.words, s.grow).length - 1;
  const cur = s.current !== null ? (s.current === "" ? " At the root." : ` At the node for "${s.current}".`) : "";
  return `Trie of ${s.words.length} word${s.words.length === 1 ? "" : "s"}${s.words.length ? `: ${s.words.join(", ")}` : ""}, ${n} node${n === 1 ? "" : "s"}.${cur}${s.out ? ` ${s.out}.` : ""}`;
}

type Pos = { x: number; y: number };

/** Leaves get the next free column, a parent sits over the middle of its children, depth gives the row. */
function layout(prefixes: string[]): { pos: Map<string, Pos>; cols: number; depth: number } {
  const kids = new Map<string, string[]>();
  for (const p of prefixes) if (p !== "") kids.set(p.slice(0, -1), [...(kids.get(p.slice(0, -1)) ?? []), p]);
  const pos = new Map<string, Pos>();
  let col = 0;
  let depth = 0;
  const walk = (p: string, d: number): number => {
    depth = Math.max(depth, d);
    const ch = kids.get(p) ?? [];
    let x: number;
    if (!ch.length) x = col++;
    else {
      const xs = ch.map((c) => walk(c, d + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(p, { x, y: d });
    return x;
  };
  walk("", 0);
  return { pos, cols: col, depth };
}

export default function TrieDraw({
  state,
  pal,
  fs = 1,
  style,
  className,
}: {
  state: TrieState;
  prev?: TrieState | null;
  t?: number;
  pal: TreePalette;
  /** type scale for the text (the vertical short draws bigger) */
  fs?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const prefixes = prefixesOf(state.words, state.grow);
  const { pos, cols, depth } = layout(prefixes);
  const ends = new Set(state.words);
  const lit = new Set(state.lit);
  const fresh = new Set(state.fresh);
  const onWalk = (p: string) => state.walk.startsWith(p) && p.length <= state.walk.length && (state.walk !== "" || p === "");
  const W = Math.max(cols, 2) * DX + 30;
  const H = (depth + 1) * DY + 20;
  const at = (p: string) => {
    const q = pos.get(p)!;
    const off = (W - (Math.max(cols, 1) - 1) * DX) / 2;
    return { x: off + q.x * DX, y: 18 + q.y * DY };
  };
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }} role="img" aria-label={describeTrie(state)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="presentation" style={{ width: "100%", height: "auto", display: "block", maxHeight: 420 }}>
        {prefixes.filter((p) => p !== "").map((p) => {
          const a = at(p.slice(0, -1));
          const b = at(p);
          const hot = onWalk(p);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={`e${p}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? pal.sig : pal.stroke} strokeWidth={hot ? 3.4 : 1.6} />
              <rect x={mx - 8} y={my - 9} width={16} height={17} fill={hot ? pal.sig : pal.surface} stroke={hot ? pal.sig : pal.faint} strokeWidth={1} />
              <text x={mx} y={my + 4.5 * fs} textAnchor="middle" fontSize={13 * fs} fontWeight={700} fill={hot ? pal.onSig : pal.ink} fontFamily={MONO}>
                {p[p.length - 1]}
              </text>
            </g>
          );
        })}
        {prefixes.map((p) => {
          const { x, y } = at(p);
          const cur = state.current === p;
          const hot = onWalk(p);
          const isEnd = ends.has(p);
          const focus = state.endAt === p;
          const tint = lit.has(p);
          const r = p === "" ? 8 : 7;
          return (
            <g key={`n${p}`}>
              {isEnd && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={focus ? pal.sig : pal.stroke} strokeWidth={focus ? 3.4 : 1.8} />}
              <circle cx={x} cy={y} r={r} fill={cur ? pal.sig : tint || (isEnd && focus) ? pal.hl : pal.surface} stroke={cur || hot || tint ? pal.sig : pal.stroke} strokeWidth={fresh.has(p) ? 3.6 : cur || hot ? 2.6 : 1.6} />
              {p === "" && (
                <text x={x + r + 8} y={y + 4 * fs} fontSize={11 * fs} fill={pal.sub} fontFamily={MONO}>
                  root
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {state.out && (
        <span style={{ background: state.out === "no" ? pal.bad : pal.pillBg, color: state.out === "no" ? pal.badInk : pal.pillInk, fontFamily: MONO, fontWeight: 700, fontSize: `${13 * fs}px`, padding: "3px 10px" }}>{state.out}</span>
      )}
    </div>
  );
}
