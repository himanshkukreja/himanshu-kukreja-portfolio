"use client";

/**
 * A card flow that balances itself: the cards keep their importance order inside a column, but which column each one goes in
 * is chosen from their measured heights so the columns end within a card-sized rounding of each other (a brute-force search
 * over the few cards of the DSA home; CSS multi-column and plain grids cannot do this because they split by order only).
 * Plain in-flow grid items on 4 px rows, each spanning its own height so the columns are independent (no absolute positioning, no remounting when a card moves), one column on phones, two from md and
 * three from 2xl once there are at least six cards (with fewer, a third column is a lone card and leaves a gap).
 */
import { Children, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMedia } from "./useMetroPrefs";
import { GAP, balance, stretch } from "@/lib/dsa/metro/flow";

export default function Balanced({ items, className = "" }: { items: ReactNode[]; className?: string }) {
  const md = useMedia("(min-width: 768px)");
  const xxl = useMedia("(min-width: 1536px)");
  const nodes = Children.toArray(items);
  const count = nodes.length;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  // the extra height each card was given last render: a measurement at or under it is the card's own height unchanged
  const grown = useRef<number[]>([]);
  const natural = useRef<number[]>([]);

  useLayoutEffect(() => {
    const els = refs.current;
    const measure = () => {
      const next = Array.from({ length: count }, (_, i) => {
        const h = Math.round(els[i]?.getBoundingClientRect().height ?? 0);
        const g = grown.current[i] ?? 0;
        // a card that was grown reports its grown height: keep its natural one unless it got taller than that
        return g > 0 && h <= g + 1 && natural.current[i] ? natural.current[i] : h;
      });
      natural.current = next;
      setHeights((h) => (h.length === next.length && h.every((v, i) => Math.abs(v - next[i]) < 2) ? h : next));
    };
    // a width change can shrink a grown card below its grown height unseen: drop the growth and measure afresh
    const reset = () => {
      grown.current = [];
      els.forEach((r) => r && (r.style.minHeight = ""));
      measure();
    };
    measure();
    const ro = new ResizeObserver(measure);
    els.forEach((r) => r && ro.observe(r));
    window.addEventListener("resize", reset);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", reset);
    };
  }, [count]);

  const visible = heights.filter((h) => h > 8).length;
  const cols = !md ? 1 : xxl && visible >= 6 ? 3 : 2;
  const idx = heights.map((h, i) => (h > 8 ? i : -1)).filter((i) => i >= 0);
  const asg = balance(idx.map((i) => heights[i]), cols);
  const place: number[] = Array.from({ length: count }, () => 0);
  idx.forEach((i, k) => (place[i] = asg[k]));
  const extra: number[] = Array.from({ length: count }, () => 0);
  if (cols > 1) stretch(idx.map((i) => heights[i]), asg, cols).forEach((e, k) => (extra[idx[k]] = e));
  const grownKey = extra.map((e, i) => (e > 0 ? (heights[i] ?? 0) + e : 0)).join(",");
  useLayoutEffect(() => {
    grown.current = grownKey.split(",").map(Number);
  }, [grownKey]);

  return (
    <div style={{ gridAutoRows: "4px" }} className={`grid items-start gap-x-4 [grid-auto-flow:dense] ${cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"} ${className}`} data-balanced>
      {nodes.map((n, i) => {
        const h = (heights[i] ?? 0) + extra[i];
        return (
          <div
            key={i}
            ref={(el) => void (refs.current[i] = el)}
            style={{ gridColumn: (place[i] ?? 0) + 1, gridRowEnd: `span ${(heights[i] ?? 0) > 8 ? Math.ceil((h + GAP) / 4) : 1}`, minHeight: extra[i] > 0 ? h : undefined }}
            className={`min-w-0 self-start ${extra[i] > 0 ? "flex flex-col [&>*]:flex-1" : ""}`}
          >
            {n}
          </div>
        );
      })}
    </div>
  );
}
