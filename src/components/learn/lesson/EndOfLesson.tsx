"use client";

import Link from "next/link";
import NewsletterStrip from "@/components/stories/NewsletterStrip";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import ShareButton from "@/components/share/ShareButton";
import QuestClear from "@/components/learn/sidequest/QuestClear";
import FollowUpDrills from "@/components/learn/sidequest/FollowUpDrills";
import ReviseLink from "@/components/learn/revise/ReviseLink";
import LessonLabs from "@/components/learn/labs/LessonLabs";
import ReadingTrail from "@/components/learn/trail/ReadingTrail";
import LessonFaq from "@/components/learn/ai/LessonFaq";
import PaperCard from "@/components/learn/papers/PaperCard";
import { doneCount, numberedStages } from "./stageText";
import type { NavLink, ReaderMeta, TrialPartLink } from "./types";

type Props = {
  meta: ReaderMeta;
  prev: NavLink | null;
  next: NavLink | null;
  trial: TrialPartLink | null;
};

/** End of lesson: explicit completion, up next (across weeks), trial part, prev / next. */
export default function EndOfLesson({ meta, prev, next, trial }: Props) {
  const p = useLessonProgress();
  const { completed, complete, ready, canComplete, completeLeftMin } = p;
  const total = numberedStages(p.required).length;
  const nDone = doneCount(p);
  const name = meta.shortLabel === "Lesson" ? meta.title : meta.shortLabel.replace(/^Day 0/, "Day ");
  // the week's last lesson (the boss, or the lesson before the next world): its written paper is up next
  const lastOfWeek = meta.kind !== "bonus" && (meta.kind === "capstone" || !next || next.week !== meta.week);

  return (
    <section aria-label="End of lesson" className="mt-14 flex flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-label text-fg-3">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="text-center">
          End of {meta.shortLabel} · {meta.title}
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      {meta.kind === "bonus" ? (
        <QuestClear meta={meta} />
      ) : (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 border bg-surface p-4 sm:px-5 sm:py-5 ${completed ? "border-line-strong" : "border-signal"}`}>
        <span className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
          <span className="text-[17px] font-semibold">{completed ? `${name} cleared` : `Finish ${name}`}</span>
          <span className="text-sm leading-normal text-fg-2">
            {completed
              ? "Saved to your skill tree. Completed stays completed, revisiting never resets it."
              : canComplete
                ? `Marks the node complete on your skill tree. Stages read so far: ${nDone}/${total}.`
                : `Stages clear as you read them (${nDone}/${total} so far). Skipping ahead doesn't count: marking complete unlocks after ~${completeLeftMin} more min of reading.`}
          </span>
        </span>
        <button
          type="button"
          onClick={complete}
          disabled={completed || !ready || !canComplete}
          className={`min-h-[52px] w-full px-5 text-[15px] font-semibold sm:w-auto ${
            completed
              ? "border border-line-strong bg-surface-2 text-fg-2"
              : canComplete
                ? "bg-signal text-on-signal hover:brightness-110"
                : "border border-dashed border-line-strong text-fg-2"
          } disabled:cursor-default`}
        >
          {completed ? "Completed ✓" : canComplete ? `Mark ${name} complete · +60 XP` : `Keep reading · ~${completeLeftMin} min left`}
        </button>
        {completed && <ShareButton kind="lesson" title={meta.title} label="Share" className="min-h-[52px] w-full sm:w-auto" />}
      </div>
      )}

      {(meta.kind === "day-content" || meta.kind === "foundations" || meta.kind === "capstone") && <ReviseLink week={meta.week} slug={meta.slug} label={meta.kind === "capstone" ? "the boss" : name} />}

      {meta.drills && <FollowUpDrills drills={meta.drills} title={meta.title} />}

      {meta.sheet && (
        <Link
          href={meta.sheet.href}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-line-strong bg-surface p-4 text-fg no-underline hover:border-fg-3 sm:px-5"
        >
          <span className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">design sheet · {meta.sheet.diagrams} diagrams · pdf</span>
            <span className="text-[17px] font-semibold">Revise the whole design in ten minutes</span>
            <span className="text-sm leading-normal text-fg-2">The numbers, architecture, sequence, class and state diagrams, decisions and failure modes of this quest on a few printable pages.</span>
          </span>
          <span className="font-mono text-sm text-signal-text">open the sheet →</span>
        </Link>
      )}

      {meta.labs?.length ? <LessonLabs labs={meta.labs} /> : null}

      <LessonFaq week={meta.week} slug={meta.slug} />

      {meta.trail?.length ? <ReadingTrail lesson={`${meta.week}/${meta.slug}`} entries={meta.trail} /> : null}

      {meta.kind === "bonus" && (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          <PaperCard paperKey={meta.slug} variant="quest" />
        </div>
      )}

      {lastOfWeek && (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          <PaperCard paperKey={meta.week} variant="next" />
        </div>
      )}

      {(next || trial) && (
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-xs uppercase tracking-label text-fg-3">Up next</span>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
            {next && (
              <Link
                href={next.href}
                className={`flex flex-col gap-2.5 border bg-surface p-[18px] text-fg no-underline hover:border-fg-3 ${
                  completed ? "border-signal shadow-[0_0_0_3px_rgba(255,107,43,0.16)]" : "border-line-strong"
                }`}
              >
                <span className="flex justify-between gap-2 font-mono text-xs tracking-[0.06em]">
                  <span className="text-signal-text">{next.kicker}</span>
                  {next.week !== meta.week && <span className="text-fg-3">NEW WORLD</span>}
                </span>
                <span className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{next.title}</span>
                {next.teaser && <span className="text-sm leading-normal text-fg-2">{next.teaser}</span>}
                <span className="font-mono text-[13px] text-signal-text">
                  {next.kind === "capstone" ? "Face the boss →" : next.kind === "mcq" ? "Take the trial →" : "Start →"}
                </span>
              </Link>
            )}
            {trial && (
              <Link href={trial.href} className="flex flex-col gap-2.5 border border-line-strong bg-raised p-[18px] text-fg no-underline hover:border-fg-3">
                <span className="flex justify-between gap-2 font-mono text-xs tracking-[0.06em]">
                  <span className="text-fg-2">TRIAL · PART {trial.part}</span>
                  {trial.questions > 0 && <span className="text-fg-3">{trial.questions} Q</span>}
                </span>
                <span className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{trial.title}</span>
                <span className="text-sm leading-normal text-fg-2">Pass mark 80%. Autosaves every answer; wrong ones join your review queue.</span>
                <span className="font-mono text-[13px] text-fg">Take the trial →</span>
              </Link>
            )}
          </div>
        </div>
      )}

      <NewsletterStrip id="lesson-news-h" title="New lessons by email" body="New lessons, side quests and case files as they ship, at most once a week. No spam, unsubscribe anytime." />

      <nav aria-label="Previous and next lesson" className="grid grid-cols-1 gap-2.5 border-t border-line pt-6 sm:grid-cols-2">
        {prev ? (
          <Link href={prev.href} className="group flex min-h-14 flex-col justify-center gap-1 border border-line px-4 py-3 text-left hover:border-line-strong">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">← {prev.label}</span>
            <span className="text-sm font-medium text-fg">{prev.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link href={next.href} className="group flex min-h-14 flex-col justify-center gap-1 border border-line px-4 py-3 text-right hover:border-line-strong">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{next.label} →</span>
            <span className="text-sm font-medium text-fg">{next.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}
