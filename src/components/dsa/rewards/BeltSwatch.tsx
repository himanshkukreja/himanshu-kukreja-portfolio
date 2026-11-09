import type { Belt } from "@/lib/dsa/rewards";

/**
 * A small belt: a strip in the belt's colour with its knot and tails, outlined so White shows on the light theme and
 * Black on true-black dark. Decorative (the belt's name is always in the text next to it).
 */
export function BeltSwatch({ belt, size = 18, className = "" }: { belt: Pick<Belt, "color">; size?: number; className?: string }) {
  const h = Math.round(size * 0.62);
  return (
    <svg aria-hidden width={size} height={h} viewBox="0 0 26 16" className={`shrink-0 ${className}`}>
      <rect x="0.75" y="3.5" width="24.5" height="5" fill={belt.color} stroke="var(--c-line-strong)" strokeWidth="1" />
      <path d="M10 8.5 L7.5 15 L10.5 15 L12.5 9.5 Z M16 8.5 L18.5 15 L15.5 15 L13.5 9.5 Z" fill={belt.color} stroke="var(--c-line-strong)" strokeWidth="1" strokeLinejoin="round" />
      <rect x="10.5" y="2.25" width="5" height="7.5" fill={belt.color} stroke="var(--c-line-strong)" strokeWidth="1" />
    </svg>
  );
}
