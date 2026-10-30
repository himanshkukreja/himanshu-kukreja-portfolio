"use client";

/**
 * A handwritten note drawn as a picture: the ruled paper and the ink, cropped to the part with writing on it
 * (lib/learn/ink/passage.ts paintInkNote), at the width of its box and in the current theme. Used by the note
 * viewer in the lesson and the notebook's Notes tab.
 */
import { memo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { inkCrop, paintInkNote, type InkNoteInk } from "@/lib/learn/ink/passage";

function InkNoteThumb({ ink, label, className = "", minH = 150 }: { ink: InkNoteInk; label: string; className?: string; minH?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const crop = inkCrop(ink, minH);
  const ratio = (crop.x2 - crop.x1) / Math.max(1, crop.y2 - crop.y1);

  useEffect(() => {
    const el = wrap.current;
    const c = cv.current;
    if (!el || !c) return;
    let last = 0;
    const draw = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (!w || w === last) return;
      last = w;
      paintInkNote(c, ink, theme, w, inkCrop(ink, minH));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ink, theme, minH]);

  return (
    <div ref={wrap} className={className}>
      <canvas ref={cv} role="img" aria-label={label} className="block w-full" style={{ aspectRatio: String(ratio) }} />
    </div>
  );
}

export default memo(InkNoteThumb);
