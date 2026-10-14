"use client";

import { useEffect, useState } from "react";

/** Thin scroll-position line along the top edge (trial pages). Decorative: no progress is saved. */
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div className="h-full bg-signal" style={{ width: `${progress}%` }} />
    </div>
  );
}
