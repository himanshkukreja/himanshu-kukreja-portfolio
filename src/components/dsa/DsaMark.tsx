import { DSA_MARK as M, DSA_MARK_COLORS as K } from "@/lib/site/dsaMark";

/** DSA Mastery's mark, "the index": three array cells on a black tile, a pointer under the middle one, which is teal. */
export function DsaMark({ className = "h-7 w-7", size }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden className={`shrink-0 ${className}`} style={size ? { width: size, height: size } : undefined}>
      <rect width="100" height="100" fill={K.tile} />
      {[...M.cells, M.pointer.stem].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={K.ink} />
      ))}
      <polygon points={M.pointer.head} fill={K.ink} shapeRendering="geometricPrecision" />
      <rect x={M.accent.x} y={M.accent.y} width={M.accent.w} height={M.accent.h} fill={K.accent} />
    </svg>
  );
}

/**
 * The wordmark: the mark + "DSA Mastery." in the display face, the full stop in the theme's teal text token
 * (readable in every theme). `size` is the type size in px; the mark follows it.
 */
export function DsaWordmark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center font-display font-extrabold tracking-[-0.03em] text-fg ${className}`} style={{ fontSize: size, gap: size * 0.45 }}>
      <DsaMark className="" size={Math.round(size * 1.5)} />
      <span>
        DSA Mastery<span className="text-dsa-text">.</span>
      </span>
    </span>
  );
}
