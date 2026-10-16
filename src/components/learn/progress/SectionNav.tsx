"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  ["overview", "overview"],
  ["map", "map"],
  ["activity", "activity"],
  ["goals", "goals"],
  ["mastery", "mastery"],
  ["share", "share"],
  ["data", "data"],
] as const;

/** Sticky in-page tabs under the site header; scrolls sideways inside its own box on phones. */
export default function SectionNav() {
  const [on, setOn] = useState<string>("overview");
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setOn(vis.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="Progress sections" className="sticky top-[var(--hk-header-h,57px)] z-30 -mx-4 border-y border-line bg-bg/95 backdrop-blur sm:-mx-6">
      <ol className="flex overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map(([id, label], i) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              aria-current={on === id ? "true" : undefined}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 font-mono text-[12px] ${on === id ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
            >
              <span className={on === id ? "text-signal-text" : "text-fg-4"}>{String(i).padStart(2, "0")}</span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
