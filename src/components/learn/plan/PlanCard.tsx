"use client";

/**
 * Study plan card for the Progress page (beside the weekly goal): today's session and how the
 * learner stands against their plan, or an invitation to make one (seeded with the goal's date).
 */
import Link from "next/link";
import { useMemo } from "react";
import type { CourseMap } from "@/lib/learn/types";
import type { LessonProgress } from "@/lib/learn/progress";
import { daysBetween, dayTitle } from "@/lib/learn/plan/schedule";
import { fmtDate, fmtMinutes } from "@/components/learn/progress/derive";
import { Label } from "@/components/learn/progress/ui";
import { computePlan, usePlanRecord, useToday } from "./usePlan";

type Props = { map: CourseMap; lessons: Record<string, LessonProgress>; done: Record<string, number>; goalTarget: string | null };

export default function PlanCard({ map, lessons, done, goalTarget }: Props) {
  const today = useToday();
  const { record } = usePlanRecord();
  const view = useMemo(() => (record && today ? computePlan(map, record, lessons, done, today) : null), [record, today, map, lessons, done]);

  if (!view || !today) {
    return (
      <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
        <Label>study plan</Label>
        <span className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-fg">Got an interview date?</span>
        <p className="m-0 text-[14px] leading-relaxed text-fg-2">
          Get a day-by-day plan to it from your real progress, with revision days at the end and a calendar file. Fall behind and it adjusts.
          {goalTarget ? ` Starts from your goal's target, ${fmtDate(goalTarget, true)}.` : ""}
        </p>
        <Link href="/learn/plan" className="inline-flex min-h-11 items-center self-start border border-signal px-4 text-sm font-semibold text-signal-text hover:bg-surface-2">
          Make a study plan →
        </Link>
      </div>
    );
  }

  const day = view.live.days.find((d) => d.date === today && d.type !== "buffer") || null;
  const next = view.live.days.find((d) => d.date > today && d.type !== "buffer") || null;
  const dr = view.drift;
  const status =
    view.live.problem === "past"
      ? "Interview date passed"
      : dr.status === "behind"
        ? `${dr.days} day${dr.days === 1 ? "" : "s"} behind · plan adjusted`
        : dr.status === "ahead"
          ? `${dr.days} day${dr.days === 1 ? "" : "s"} ahead`
          : view.live.fits
            ? "On track"
            : "Doesn't fit yet";
  const left = daysBetween(today, view.settings.target);
  return (
    <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>study plan · interview {fmtDate(view.settings.target, true)}</Label>
        <span className={`font-mono text-[11px] ${dr.status === "behind" || !view.live.fits ? "text-signal-text" : "text-fg-3"}`}>{status}</span>
      </div>
      <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.04em] text-fg">{left > 0 ? `${left} days to go` : "Today's the day"}</span>
      <p className="m-0 text-[14px] leading-relaxed text-fg-2">
        {day ? `Today, ${fmtMinutes(day.minutes)}: ${dayTitle(day)}.` : next ? `No session today. Next: ${fmtDate(next.date)} · ${dayTitle(next)}.` : "Nothing left to schedule."}
        {!view.live.fits && view.needMinutes ? ` At this pace it runs past the interview: ${fmtMinutes(view.needMinutes)}/day would fit.` : ""}
      </p>
      <Link href="/learn/plan" className="inline-flex min-h-11 items-center self-start border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
        Open plan · calendar →
      </Link>
    </div>
  );
}
