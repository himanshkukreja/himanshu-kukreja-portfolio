"use client";

import { useState } from "react";
import Link from "next/link";
import { useOptionalLessonProgress } from "@/components/LessonProgressTracker";
import { useRailStatus } from "@/components/learn/lesson/useRailStatus";
import { stageLine } from "@/components/learn/lesson/stageText";
import type { RailData, RailEntry, RailWeek } from "@/components/learn/lesson/types";

type Props = {
  course: string;
  rail: RailData;
};

const MARK = "grid h-[22px] w-[22px] shrink-0 place-items-center text-[11px]";

/**
 * Left course path: the previous world's summary, this world's nodes with ticks, and the next
 * world's first node — Next carries on across weeks. Collapsible below 1280px (trial page).
 */
export default function CollapsibleWeekNav({ course, rail }: Props) {
  const [open, setOpen] = useState(false);
  const weeks = [rail.prev?.week, rail.week.week, rail.next?.week].filter(Boolean) as string[];
  const { status, trialPassed } = useRailStatus(course, weeks);
  const lesson = useOptionalLessonProgress();

  const weekDone = (w: RailWeek) => w.entries.filter((e) => e.kind !== "mcq" && status(e.week, e.slug) === "done").length;
  const weekTotal = (w: RailWeek) => w.entries.filter((e) => e.kind !== "mcq").length;

  const row = (e: RailEntry) => {
    const st = status(e.week, e.slug);
    let tone = "text-fg-3";
    let mark = <span className={`${MARK} border border-dashed border-line-strong`} />;
    let sub: string | null = null;

    if (e.kind === "capstone") {
      tone = "text-fg-2";
      mark = (
        <span className={MARK}>
          <span className={`h-[13px] w-[13px] rotate-45 border-[1.5px] ${st === "done" ? "border-fg bg-fg" : "border-fg"}`} />
        </span>
      );
      sub = st === "done" ? "boss defeated" : "timed phases";
    } else if (e.kind === "mcq") {
      tone = "text-fg-2";
      mark = <span className={`${MARK} border border-signal font-mono text-signal-text`}>T</span>;
      const passed = trialPassed(e.week);
      sub = e.parts ? `${passed}/${e.parts} parts passed` : passed ? `${passed} parts passed` : "per-part trials";
    } else if (st === "done") {
      tone = "text-fg-2";
      mark = <span className={`${MARK} bg-fg text-bg`}>✓</span>;
      sub = "cleared";
    } else if (st === "started") {
      tone = "text-fg-2";
      mark = <span className={`${MARK} border border-fg-3 text-[9px] text-fg-3`}>▶</span>;
      sub = "in progress";
    }

    if (e.current) {
      tone = "bg-surface-2 font-semibold text-fg";
      const cleared = st === "done" || lesson?.completed;
      mark = <span className={`${MARK} bg-signal text-on-signal ${cleared ? "" : "text-[9px]"}`}>{cleared ? "✓" : "▶"}</span>;
      if (lesson) {
        sub = lesson.completed
          ? "cleared · you are here"
          : `${stageLine(lesson)}${lesson.minutesLeft ? ` · ~${lesson.minutesLeft} min left` : ""}`;
      } else {
        sub = "you are here";
      }
    }

    return (
      <li key={`${e.week}/${e.slug}`}>
        <Link
          href={e.href}
          aria-current={e.current ? "page" : undefined}
          className={`flex min-h-12 items-center gap-2.5 px-2 py-1 text-sm ${tone} ${e.current ? "" : "hover:bg-surface hover:text-fg"}`}
        >
          {mark}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="line-clamp-2 leading-snug">{e.label}</span>
            {sub && <span className="truncate font-mono text-[11px] font-normal text-fg-3">{sub}</span>}
          </span>
        </Link>
      </li>
    );
  };

  const prev = rail.prev;
  const next = rail.next;
  const prevCleared = prev ? weekDone(prev) === weekTotal(prev) && weekTotal(prev) > 0 : false;
  const nextFirst = next?.entries[0];

  return (
    <nav
      aria-label="Course path"
      data-reader-ui
      className="flex flex-col gap-1 xl:sticky xl:overflow-y-auto"
      style={{
        top: "calc(var(--reader-top, 61px) + var(--reader-rail, 90px) + 24px)",
        maxHeight: "calc(100vh - var(--reader-top, 61px) - var(--reader-rail, 90px) - 48px)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 items-center justify-between border border-line px-3 font-mono text-xs uppercase tracking-label text-fg-2 xl:hidden"
      >
        <span>
          {rail.week.label} · {rail.week.topic}
        </span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>

      <div className={`${open ? "flex" : "hidden"} flex-col gap-1 xl:flex`}>
        {prev && (
          <Link
            href={`/learn/${course}`}
            className="flex min-h-11 items-center gap-2.5 border border-line px-2 py-1 text-[13px] text-fg-3 hover:text-fg"
          >
            {prevCleared ? <span className={`${MARK} bg-fg text-bg`}>✓</span> : <span className={`${MARK} border border-dashed border-line-strong`} />}
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[11px] tracking-label">
                {prev.code} · {prevCleared ? "CLEARED" : `${weekDone(prev)}/${weekTotal(prev)}`}
              </span>
              <span className="truncate">{prev.topic}</span>
            </span>
          </Link>
        )}

        <span className="hidden px-0 pb-1.5 pt-4 font-mono text-xs uppercase tracking-label text-fg-3 xl:block">
          {rail.week.week === "bonus-problems" ? "Side quests" : `${rail.week.label} · world`}
        </span>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0">{rail.week.entries.map(row)}</ol>

        {next && nextFirst && (
          <>
            <span className="pb-1.5 pt-4 font-mono text-xs uppercase tracking-label text-fg-3">Next world ↓</span>
            <Link href={nextFirst.href} className="flex min-h-12 items-center gap-2.5 border border-dashed border-line-strong px-2 py-1.5 text-[13px] text-fg-2 hover:text-fg">
              <span aria-hidden className={`${MARK} border border-dashed border-line-strong`} />
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-[11px] tracking-label text-fg-3">
                  {next.code} · {nextFirst.label.toUpperCase()}
                </span>
                <span className="truncate">{next.topic}</span>
              </span>
            </Link>
            <span className="px-0.5 pt-2 text-xs leading-normal text-fg-4">Next carries on across worlds, no dead end after the trial.</span>
          </>
        )}
      </div>
    </nav>
  );
}

