"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { LearningResource } from "@/lib/github";
import LessonCard from "./LessonCard";

type Props = {
  weekKey: string;
  weekNumber: string;
  weekBadge?: string; // Optional badge like "Week 01"
  resources: LearningResource[];
  course: string;
  defaultOpen?: boolean;
  readingTimes: Record<string, string>;
};

export default function CollapsibleWeek({ weekKey, weekNumber, weekBadge, resources, course, defaultOpen = false, readingTimes }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all overflow-hidden">
      {/* Header - Clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {isOpen ? (
              <ChevronUp className="w-5 h-5 text-gray-500 dark:text-white/60" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500 dark:text-white/60" />
            )}
          </div>
          <div className="text-left">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {weekNumber || 'Course Overview'}
            </h2>
            {resources.length > 0 && (
              <p className="text-gray-500 dark:text-white/60 text-sm">
                {resources.find(r => r.type === 'week-preview')
                  ? `${resources.length - 1} lessons`
                  : `${resources.length} lessons`}
              </p>
            )}
          </div>
        </div>
        {weekBadge && (
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium flex-shrink-0">
            {weekBadge}
          </span>
        )}
      </button>

      {/* Content - Collapsible */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="px-6 pb-6 space-y-2">
          {resources.map((resource) => (
            <LessonCard
              key={resource.slug}
              resource={resource}
              course={course}
              readingTime={readingTimes[resource.slug]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
