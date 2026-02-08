"use client";

import { useEffect, useState, useRef } from "react";
import type { TocHeading } from "@/lib/toc";

type Props = {
  headings: TocHeading[];
};

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>("");
  const tocContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // Get all heading elements
    const headingElements = headings.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    // Scroll-based detection for better accuracy
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120; // Account for header height

      // Find the heading that's currently in view
      let currentHeading = headingElements[0];

      for (const heading of headingElements) {
        const headingTop = heading.offsetTop;
        if (scrollPosition >= headingTop) {
          currentHeading = heading;
        } else {
          break;
        }
      }

      if (currentHeading && currentHeading.id !== activeId) {
        setActiveId(currentHeading.id);
      }
    };

    // Set initial active heading
    handleScroll();

    // Listen to scroll events
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Also use IntersectionObserver as a fallback for better precision
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-100px 0px -66%",
        threshold: [0, 0.5, 1.0],
      }
    );

    headingElements.forEach((elem) => observer.observe(elem));

    return () => {
      window.removeEventListener("scroll", handleScroll);
      headingElements.forEach((elem) => observer.unobserve(elem));
    };
  }, [headings, activeId]);

  // Auto-scroll the active item into view in the TOC
  useEffect(() => {
    if (!activeId || !activeItemRef.current || !tocContainerRef.current) return;

    const tocContainer = tocContainerRef.current;
    const activeItem = activeItemRef.current;

    // Use a small delay to ensure the DOM is updated
    const timeoutId = setTimeout(() => {
      // Get the position of the active item relative to the container
      const containerTop = tocContainer.scrollTop;
      const containerBottom = containerTop + tocContainer.clientHeight;

      const itemTop = activeItem.offsetTop;
      const itemBottom = itemTop + activeItem.offsetHeight;

      // Add some padding for better visibility
      const PADDING = 20;

      // Check if the active item is outside the visible scroll area
      const isAboveView = itemTop < containerTop + PADDING;
      const isBelowView = itemBottom > containerBottom - PADDING;

      if (isAboveView || isBelowView) {
        // Calculate the ideal scroll position to center the item
        const idealScrollTop = itemTop - (tocContainer.clientHeight / 2) + (activeItem.offsetHeight / 2);

        // Scroll the container smoothly
        tocContainer.scrollTo({
          top: idealScrollTop,
          behavior: "smooth",
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [activeId]);

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
    <div className="sticky top-24 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4 text-sm uppercase tracking-wide">
        On This Page
      </h3>
      <nav ref={tocContainerRef} className="space-y-1 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
        {headings.map((heading) => {
          const isActive = activeId === heading.id;
          const paddingLeft = heading.level === 1 ? "0" : heading.level === 2 ? "0.75rem" : "1.5rem";

          return (
            <a
              key={heading.id}
              ref={isActive ? activeItemRef : null}
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
