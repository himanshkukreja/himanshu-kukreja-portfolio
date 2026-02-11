"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

type WeekResource = {
  slug: string;
  title: string;
  week: string;
  day?: string;
};

type CollapsibleWeekNavProps = {
  weekDisplayName: string;
  weekResources: WeekResource[];
  currentSlug: string;
  course: string;
};

export default function CollapsibleWeekNav({
  weekDisplayName,
  weekResources,
  currentSlug,
  course,
}: CollapsibleWeekNavProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sticky top-24 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      {/* Header - Always visible, clickable on mobile */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between lg:cursor-default"
      >
        <h3 className="text-gray-900 dark:text-white font-semibold flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4" />
          {weekDisplayName}
        </h3>
        {/* Toggle icon - only visible on mobile */}
        <div className="lg:hidden">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500 dark:text-white/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-white/60" />
          )}
        </div>
      </button>

      {/* Navigation links - Collapsible on mobile, always visible on desktop */}
      <nav
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        } lg:max-h-none lg:opacity-100 lg:block`}
      >
        <div className="px-4 pb-4 space-y-1">
          {weekResources.map((r) => (
            <Link
              key={r.slug}
              href={`/learn/${course}/${r.week}/${r.slug}`}
              className={`block px-3 py-2 rounded text-xs transition-all ${
                r.slug === currentSlug
                  ? "bg-blue-500/20 text-blue-400 font-medium"
                  : "text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2">
                {r.day && (
                  <span className="text-xs opacity-60">
                    {r.day.replace("day-", "D")}
                  </span>
                )}
                <span className="truncate">{r.title}</span>
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
