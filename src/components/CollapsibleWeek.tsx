"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Calendar, Award, Target, BookOpen } from "lucide-react";
import type { LearningResource } from "@/lib/github";

type Props = {
  weekKey: string;
  weekNumber: string;
  weekBadge?: string; // Optional badge like "Week 01"
  resources: LearningResource[];
  course: string;
  defaultOpen?: boolean;
};

export default function CollapsibleWeek({ weekKey, weekNumber, weekBadge, resources, course, defaultOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 hover:border-white/20 transition-all overflow-hidden">
      {/* Header - Clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {isOpen ? (
              <ChevronUp className="w-5 h-5 text-white/60" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white/60" />
            )}
          </div>
          <div className="text-left">
            <h2 className="text-2xl font-bold text-white mb-2">
              {weekNumber || 'Course Overview'}
            </h2>
            {resources.find(r => r.type === 'week-preview') && (
              <p className="text-white/60 text-sm">
                {resources.length - 1} lessons
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
            <Link
              key={resource.slug}
              href={`/learn/${course}/${resource.week}/${resource.slug}`}
              className="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ResourceTypeIcon type={resource.type} />
                  <div>
                    <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                      {resource.title}
                    </h3>
                    {resource.day && (
                      <p className="text-white/40 text-sm mt-1">
                        {resource.day.replace('day-', 'Day ')}
                      </p>
                    )}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-white/40 group-hover:text-white/60 group-hover:translate-x-1 transition-all flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResourceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'week-preview':
      return <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0" />;
    case 'capstone':
      return <Award className="w-5 h-5 text-yellow-400 flex-shrink-0" />;
    case 'foundations':
      return <Target className="w-5 h-5 text-purple-400 flex-shrink-0" />;
    case 'overview':
      return <BookOpen className="w-5 h-5 text-green-400 flex-shrink-0" />;
    default:
      return <BookOpen className="w-5 h-5 text-white/60 flex-shrink-0" />;
  }
}
