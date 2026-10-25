"use client";

import { useEffect, useRef } from "react";
import { markStoryRead } from "./store";

/** Marks the story read (this browser) once its end has been on screen. */
export default function StoryRead({ slug }: { slug: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        markStoryRead(slug);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [slug]);
  return <span ref={ref} aria-hidden className="block h-px" />;
}
