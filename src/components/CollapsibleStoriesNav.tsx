"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

type Story = {
  slug: string;
  title: string;
  date?: string;
};

type CollapsibleStoriesNavProps = {
  allStories: Story[];
  currentSlug: string;
};

export default function CollapsibleStoriesNav({
  allStories,
  currentSlug,
}: CollapsibleStoriesNavProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sticky top-24 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
      {/* Header - Always visible on mobile, collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-gray-900 dark:text-white font-semibold text-sm lg:cursor-default"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          <span>All Stories</span>
        </div>
        {/* Show toggle icon only on mobile */}
        <div className="lg:hidden">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Stories List - Collapsible on mobile, always visible on desktop */}
      <nav
        className={`space-y-1 max-h-[60vh] overflow-y-auto transition-all duration-300 ${
          isExpanded ? 'mt-4 opacity-100' : 'mt-0 h-0 opacity-0 overflow-hidden lg:mt-4 lg:h-auto lg:opacity-100 lg:overflow-y-auto'
        }`}
      >
        {allStories.map((s) => (
          <Link
            key={s.slug}
            href={`/stories/${s.slug}`}
            className={`block px-3 py-2 rounded text-xs transition-all ${
              s.slug === currentSlug
                ? 'bg-blue-500/20 text-blue-400 font-medium'
                : 'text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <div className="truncate">{s.title}</div>
            {s.date && (
              <div className="text-[10px] opacity-60 mt-1">
                {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
