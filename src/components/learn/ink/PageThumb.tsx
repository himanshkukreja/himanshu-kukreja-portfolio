"use client";

/** A page's thumbnail, drawn from its strokes (paper, items as blocks, ink) when it scrolls into view. `width` is the
 * drawing resolution (CSS px); the canvas fills its box at the page's aspect ratio. */
import { memo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { drawPage } from "@/lib/learn/ink/render";
import { PAGE_H, PAGE_W, type NotebookPage } from "@/lib/learn/ink/types";

const NO_IMAGES = new Map<string, CanvasImageSource>();

function PageThumb({ page, width }: { page: Pick<NotebookPage, "paper" | "strokes" | "items">; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const height = Math.round((width * PAGE_H) / PAGE_W);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let done = false;
    const draw = () => {
      if (done) return;
      done = true;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform((width * dpr) / PAGE_W, 0, 0, (height * dpr) / PAGE_H, 0, 0);
      drawPage(ctx, page, theme, NO_IMAGES, false);
    };
    if (typeof IntersectionObserver === "undefined") {
      draw();
      return;
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        draw();
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(c);
    return () => io.disconnect();
  }, [page, theme, width, height]);

  return <canvas ref={ref} aria-hidden className="block w-full bg-surface" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }} />;
}

export default memo(PageThumb);
