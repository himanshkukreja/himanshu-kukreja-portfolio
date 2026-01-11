"use client";

import { useEffect, useState } from "react";
import type { TocHeading } from "@/lib/toc";

type Props = {
  headings: TocHeading[];
};

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Get all heading elements
    const headingElements = headings.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    // Intersection Observer to track which heading is currently visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-100px 0px -66%",
        threshold: 1.0,
      }
    );

    headingElements.forEach((elem) => observer.observe(elem));

    return () => {
      headingElements.forEach((elem) => observer.unobserve(elem));
    };
  }, [headings]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -80; // Offset for sticky header
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4 text-sm uppercase tracking-wide">
        On This Page
      </h3>
      <nav className="space-y-1">
        {headings.map((heading) => {
          const isActive = activeId === heading.id;
          const paddingLeft = heading.level === 1 ? "0" : heading.level === 2 ? "0.75rem" : "1.5rem";

          return (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              onClick={(e) => handleClick(e, heading.id)}
              className={`block py-2 px-3 rounded text-sm transition-all ${
                isActive
                  ? "bg-blue-500/20 text-blue-400 font-medium border-l-2 border-blue-400"
                  : "text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border-l-2 border-transparent"
              }`}
              style={{ paddingLeft }}
            >
              <span className="line-clamp-2">{heading.text}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
