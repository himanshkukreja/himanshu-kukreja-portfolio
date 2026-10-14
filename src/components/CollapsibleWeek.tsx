"use client";

/**
 * A world as a collapsible list of lessons. Progress is passed in as one map (no per-card queries).
 */
import { useState } from "react";
import type { LearningResource } from "@/lib/github";
import type { LessonProgress } from "@/lib/learn/progress";
import LessonCard from "./LessonCard";

type Props = {
  weekKey: string;
  weekNumber: string;
  weekBadge?: string;
  resources: LearningResource[];
  course: string;
  defaultOpen?: boolean;
  readingTimes: Record<string, string>;
  /** keyed `${week}/${slug}` */
  progress?: Record<string, LessonProgress>;
  currentKey?: string | null;
};

export default function CollapsibleWeek({ weekKey, weekNumber, weekBadge, resources, course, defaultOpen = false, readingTimes, progress = {}, currentKey = null }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const done = resources.filter((r) => progress[`${r.week}/${r.slug}`]?.status === "completed").length;
  const panelId = `week-panel-${weekKey}`;

  return (
    <section className="border border-line bg-surface">
      <button type="button" onClick={() => setIsOpen((o) => !o)} aria-expanded={isOpen} aria-controls={panelId} className="flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left sm:px-5">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {weekBadge && <span className="font-mono text-[11px] tracking-label text-fg-3">{weekBadge.toUpperCase()}</span>}
          <span className="font-display text-xl font-bold tracking-[-0.02em] text-fg sm:text-2xl">{weekNumber || "Course overview"}</span>
        </span>
        <span className="font-mono text-xs text-fg-3">
          {done}/{resources.length}
        </span>
        <span aria-hidden className="font-mono text-fg-3">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div id={panelId} className="flex flex-col gap-1.5 border-t border-line p-3 sm:p-4">
          {resources.map((resource) => (
            <LessonCard
              key={resource.slug}
              resource={resource}
              course={course}
              readingTime={readingTimes[resource.slug]}
              progress={progress[`${resource.week}/${resource.slug}`]}
              current={currentKey === `${resource.week}/${resource.slug}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
