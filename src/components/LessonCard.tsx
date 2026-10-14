/**
 * One lesson row. Presentational: progress comes in through props from a single batched load
 * (useLearnProgress), so a list of N lessons costs one query, not N (the old per-card queries).
 */
import Link from "next/link";
import type { LearningResource } from "@/lib/github";
import type { LessonProgress } from "@/lib/learn/progress";

type LessonCardProps = {
  resource: Pick<LearningResource, "week" | "slug" | "title" | "type"> & { day?: string };
  course: string;
  readingTime?: string;
  progress?: LessonProgress | null;
  /** the lesson the learner is on */
  current?: boolean;
  /** short node text, e.g. "D3" */
  code?: string;
};

export default function LessonCard({ resource, course, readingTime, progress, current = false, code }: LessonCardProps) {
  const done = progress?.status === "completed";
  const stagesDone = progress?.completedStages.length || 0;
  const href = `/learn/${course}/${resource.week}/${resource.slug}${!done && progress?.lastStage ? `#${progress.lastStage}` : ""}`;
  const label = code || (resource.day ? resource.day.replace("day-", "D").replace(/^D0/, "D") : resource.type === "capstone" ? "B" : resource.type === "week-preview" ? "PRE" : "");

  return (
    <Link
      href={href}
      className={`group flex min-h-14 items-center gap-3 border px-3 py-2.5 sm:px-4 ${current ? "border-signal bg-surface" : "border-line bg-raised hover:border-line-strong"}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center font-mono text-[11px] font-semibold ${
          done ? "bg-fg text-bg" : current ? "border-2 border-signal text-signal-text" : "border border-dashed border-line-strong text-fg-4"
        }`}
      >
        {done ? "✓" : label || "·"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] ${current ? "font-semibold text-signal-text" : "text-fg"} group-hover:underline`}>{resource.title}</span>
        <span className="font-mono text-[11px] text-fg-3">
          {readingTime || ""}
          {done ? " · done" : current ? " · you are here" : stagesDone ? ` · ${stagesDone} stage${stagesDone === 1 ? "" : "s"} done` : ""}
        </span>
      </span>
      <span aria-hidden className="font-mono text-sm text-fg-3 group-hover:text-fg">
        →
      </span>
      <span className="sr-only">{done ? "Completed" : current ? "Current lesson" : "Not started"}</span>
    </Link>
  );
}
