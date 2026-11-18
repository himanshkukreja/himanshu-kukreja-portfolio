"use client";

/**
 * A card flow that balances itself: the cards keep their importance order inside a column, but which column each one goes in
 * is chosen from their measured heights so the columns end as level as the card sizes allow (cards are never stretched: a stretched card has a blank interior) (a brute-force search
 * over the few cards of the DSA home; CSS multi-column and plain grids cannot do this because they split by order only).
 * Plain in-flow grid items on 4 px rows, each spanning its own height so the columns are independent (no absolute positioning, no remounting when a card moves), one column on phones, two from md and
 * three from 2xl once there are at least six cards (with fewer, a third column is a lone card and leaves a gap).
 */
import { Children, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMedia } from "./useMetroPrefs";
import { GAP, balance } from "@/lib/dsa/metro/flow";

export default function Balanced({ items, className = "" }: { items: ReactNode[]; className?: string }) {
  const md = useMedia("(min-width: 768px)");
  const xxl = useMedia("(min-width: 1536px)");
  const nodes = Children.toArray(items);
  const count = nodes.length;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  useLayoutEffect(() => {
    const els = refs.current;
    const measure = () => {
      const next = Array.from({ length: count }, (_, i) => {
        return Math.round(els[i]?.getBoundingClientRect().height ?? 0);
      });
      setHeights((h) => (h.length === next.length && h.every((v, i) => Math.abs(v - next[i]) < 2) ? h : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    els.forEach((r) => r && ro.observe(r));
    return () => {
      ro.disconnect();
    };
  }, [count]);

  const visible = heights.filter((h) => h > 8).length;
  const cols = !md ? 1 : xxl && visible >= 6 ? 3 : 2;
  const idx = heights.map((h, i) => (h > 8 ? i : -1)).filter((i) => i >= 0);
  const asg = balance(idx.map((i) => heights[i]), cols);
  const place: number[] = Array.from({ length: count }, () => 0);
  idx.forEach((i, k) => (place[i] = asg[k]));
  return (
    <div style={{ gridAutoRows: "4px" }} className={`grid items-start gap-x-4 [grid-auto-flow:dense] ${cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"} ${className}`} data-balanced>
      {nodes.map((n, i) => {
        const h = heights[i] ?? 0;
        return (
          <div
            key={i}
            ref={(el) => void (refs.current[i] = el)}
            style={{ gridColumn: (place[i] ?? 0) + 1, gridRowEnd: `span ${(heights[i] ?? 0) > 8 ? Math.ceil((h + GAP) / 4) : 1}` }}
            className={`min-w-0 self-start`}
          >
            {n}
          </div>
        );
      })}
    </div>
  );
}
