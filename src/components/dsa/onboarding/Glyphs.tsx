import type { CSSProperties, ReactNode } from "react";
import type { TopicId } from "@/lib/dsa/onboarding/puzzles";
import "./onboarding.css";

/**
 * The twelve topic glyphs: tiny SVG scenes in the lessons' visual language (array cells, list nodes, stack plates,
 * a queue line, graph ripples, a growing DP table...), each looping a couple of seconds. They are drawn here, not
 * with the lesson step-engine views, which are sized for a whole lesson and heavy for twelve cards on one screen.
 * Every still frame already reads (reduced motion freezes them); they are decorative (aria-hidden), the card's text
 * names the topic.
 */
const INK = "var(--ob-ink)";
const TEAL = "var(--c-signal)";
const line = { stroke: INK, strokeWidth: 1.5, fill: "none" } as const;

const d = (s: number): CSSProperties => ({ ["--d" as string]: `${s}s` });
const lit = (i: number): CSSProperties => ({ opacity: i === 0 ? 1 : 0.12 });

function Cells({ n, x = 8, y = 22, w = 18, h = 20, gap = 2, seq }: { n: number; x?: number; y?: number; w?: number; h?: number; gap?: number; seq?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + i * (w + gap)} y={y} width={w} height={h} {...line} />
      ))}
      {seq
        ? Array.from({ length: n }, (_, i) => (
            <rect key={`l${i}`} className={`ob-a ob-seq${n}`} style={{ ...lit(i), ...d((i * 2.4) / n) }} x={x + i * (w + gap)} y={y} width={w} height={h} fill={TEAL} />
          ))
        : null}
    </>
  );
}

const G: Record<TopicId, () => ReactNode> = {
  arrays: () => (
    <>
      <Cells n={4} x={7} seq />
      <rect className="ob-a ob-hop" style={{ ["--ob-pitch" as string]: "20px" }} x={13} y={48} width={6} height={6} fill={INK} />
      <text x="16" y="14" fontSize="8" fill={INK} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace">0</text>
      <text x="76" y="14" fontSize="8" fill={INK} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace">3</text>
    </>
  ),
  hashing: () => (
    <>
      <rect x="6" y="24" width="22" height="16" {...line} />
      <text x="17" y="35" fontSize="8" fill={INK} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace">key</text>
      <path d="M30 32 h12" {...line} />
      <path d="M40 29 l4 3 -4 3" {...line} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="52" y={6 + i * 13.5} width="36" height="11" {...line} />
          <rect className="ob-a ob-seq4" style={{ ...lit(i), ...d((i * 2.4) / 4) }} x="52" y={6 + i * 13.5} width="36" height="11" fill={TEAL} />
        </g>
      ))}
    </>
  ),
  lists: () => (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={5 + i * 31} y="22" width="22" height="20" {...line} />
          <path d={`M${5 + i * 31 + 15} 22 v20`} {...line} />
          {i < 2 ? <path d={`M${5 + i * 31 + 21} 32 h12 m-3 -3 l3 3 -3 3`} {...line} /> : null}
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={`l${i}`} className="ob-a ob-seq3" style={{ ...lit(i), ...d((i * 2.4) / 3) }} x={5 + i * 31} y="22" width="15" height="20" fill={TEAL} />
      ))}
    </>
  ),
  stacks: () => (
    <>
      <path d="M20 54 h56" {...line} />
      <rect x="26" y="40" width="44" height="10" fill="none" stroke={INK} strokeWidth="1.5" />
      <rect x="26" y="28" width="44" height="10" fill="none" stroke={INK} strokeWidth="1.5" />
      <rect className="ob-a ob-plate" x="26" y="16" width="44" height="10" fill={TEAL} />
    </>
  ),
  queues: () => (
    <>
      <path d="M4 18 h88 M4 46 h88" stroke={INK} strokeWidth="1.5" />
      <rect className="ob-a ob-qout" style={{ ["--ob-pitch" as string]: "21px" }} x="6" y="22" width="19" height="20" fill={TEAL} />
      {[1, 2, 3].map((i) => (
        <rect key={i} className="ob-a ob-qmove" style={{ ["--ob-pitch" as string]: "21px" }} x={6 + i * 21} y="22" width="19" height="20" {...line} />
      ))}
      <rect className="ob-a ob-qin" style={{ ["--ob-pitch" as string]: "21px", opacity: 1 }} x={6 + 3 * 21} y="22" width="19" height="20" fill={INK} opacity="0" />
    </>
  ),
  trees: () => (
    <>
      <path d="M48 16 L26 34 M48 16 L70 34 M26 34 L14 52 M26 34 L38 52 M70 34 L58 52 M70 34 L82 52" {...line} />
      {[[48, 14], [26, 34], [70, 34], [14, 52], [38, 52], [58, 52], [82, 52]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" {...line} fill="var(--c-bg)" />
      ))}
      {[[48, 14, 0], [26, 34, 0.6], [38, 52, 1.2]].map(([x, y, dl], i) => (
        <circle key={`t${i}`} className="ob-a ob-pop" style={{ ...d(dl), opacity: 1 }} cx={x} cy={y} r="6" fill={TEAL} />
      ))}
    </>
  ),
  heaps: () => (
    <>
      <path d="M48 16 L30 36 M48 16 L66 36 M30 36 L20 54 M30 36 L40 54" {...line} />
      {[[30, 36], [66, 36], [20, 54], [40, 54]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" {...line} />
      ))}
      <circle className="ob-a ob-heapswap" cx="48" cy="14" r="6" fill={INK} opacity="0.35" />
      <circle className="ob-a ob-heapswap2" cx="30" cy="36" r="6" fill={TEAL} />
      <circle cx="48" cy="14" r="6" {...line} />
    </>
  ),
  graphs: () => (
    <>
      <path d="M20 32 L44 14 M20 32 L44 50 M44 14 L72 20 M44 50 L72 44 M72 20 L72 44 M44 14 L44 50" {...line} />
      {[[20, 32, 0], [44, 14, 0.6], [44, 50, 0.6], [72, 20, 1.3], [72, 44, 1.3]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" {...line} fill="var(--c-bg)" />
      ))}
      {[[20, 32, 0], [44, 14, 0.7], [44, 50, 0.7], [72, 20, 1.4], [72, 44, 1.4]].map(([x, y, dl], i) => (
        <circle key={`r${i}`} className="ob-a ob-ring" style={{ ...d(dl), opacity: i === 0 ? 0.9 : 0.1 }} cx={x} cy={y} r="9" fill="none" stroke={TEAL} strokeWidth="2" />
      ))}
      <circle cx="20" cy="32" r="6" fill={TEAL} />
    </>
  ),
  bsearch: () => (
    <>
      <Cells n={8} x={4} w={9.5} gap={1.5} y={22} h={20} />
      <rect className="ob-a ob-win" x="4" y="19" width="88" height="26" fill="none" stroke={TEAL} strokeWidth="2.5" />
    </>
  ),
  recursion: () => (
    <>
      {[0, 1, 2].map((i) => (
        <rect key={i} className="ob-a ob-pop" style={{ ...d(i * 0.35), opacity: i === 2 ? 1 : 0.5 }} x={10 + i * 10} y={6 + i * 8} width={76 - i * 20} height={52 - i * 16} fill="none" stroke={i === 2 ? TEAL : INK} strokeWidth={i === 2 ? 2.5 : 1.5} />
      ))}
    </>
  ),
  sorting: () => (
    <>
      <path d="M8 54 h80" {...line} />
      <rect x="10" y="22" width="12" height="32" fill={INK} opacity="0.35" />
      <rect className="ob-a ob-swapl" x="28" y="14" width="12" height="40" fill={TEAL} />
      <rect className="ob-a ob-swapr" x="44" y="38" width="12" height="16" fill={TEAL} opacity="0.45" />
      <rect x="62" y="30" width="12" height="24" fill={INK} opacity="0.35" />
      <rect x="78" y="46" width="10" height="8" fill={INK} opacity="0.35" />
    </>
  ),
  dp: () => (
    <>
      {Array.from({ length: 12 }, (_, k) => {
        const r = Math.floor(k / 4);
        const c = k % 4;
        return (
          <g key={k}>
            <rect x={9 + c * 20} y={6 + r * 18} width="18" height="16" {...line} />
            <rect className="ob-a ob-pop" style={{ ...d((k * 2.4) / 14), opacity: k < 2 ? 1 : 0.1 }} x={9 + c * 20} y={6 + r * 18} width="18" height="16" fill={TEAL} />
          </g>
        );
      })}
    </>
  ),
};

export default function TopicGlyph({ id, className = "h-14 w-24" }: { id: TopicId; className?: string }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className={`ob-glyph shrink-0 ${className}`} style={{ color: INK }}>
      {G[id]()}
    </svg>
  );
}
