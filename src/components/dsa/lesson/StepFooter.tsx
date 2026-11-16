"use client";

/**
 * The sticky footer: "STEP 1 OF 4 · LEARN", "Mark as learnt" (the reader's own `complete`, disabled until the progress
 * engine allows it, with the reason as its tooltip) and "Next: <step>"; on Check it becomes "Next lesson".
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { STEP_ORDER, STEP_TITLE, nextStep, type StepId } from "@/lib/dsa/lesson-steps";

export default function StepFooter({ step, onNext, nextLesson, backHref }: { step: StepId; onNext: (s: StepId) => void; nextLesson: { href: string; title: string } | null; backHref: string }) {
  const p = useLessonProgress();
  const n = STEP_ORDER.indexOf(step) + 1;
  const next = nextStep(step);
  const reason = p.completed
    ? "You have learnt this lesson"
    : p.canComplete
      ? "Mark this lesson as learnt"
      : p.completeLeftMin > 0
        ? `Keep reading: about ${Math.ceil(p.completeLeftMin)} min of reading left before this can be marked as learnt`
        : "Read the parts of the lesson first";
  return (
    <div data-focus-hide data-reader-ui className="hk-safe-x fixed inset-x-0 z-40 border-t border-line-strong bg-bg" style={{ bottom: "var(--site-dock, 0px)" }}>
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-1.5 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-2">
        <span className="min-w-0 basis-full truncate font-mono text-[11px] uppercase tracking-label text-fg-3 sm:basis-auto sm:text-[12px]" aria-live="polite">
          Step {n} of {STEP_ORDER.length} · {STEP_TITLE[step]}
        </span>
        <span className="hidden flex-1 sm:block" />
        <button
          type="button"
          onClick={p.complete}
          disabled={p.completed || !p.canComplete || !p.ready}
          title={reason}
          aria-label={p.completed ? "Learnt" : `Mark as learnt. ${reason}`}
          className={`inline-flex min-h-11 items-center whitespace-nowrap px-3 font-mono text-[13px] sm:px-4 ${p.completed ? "border border-fg text-fg" : "border border-line-strong text-fg hover:border-signal disabled:text-fg-4 disabled:hover:border-line-strong"}`}
        >
          {p.completed ? "✓ Learnt" : "Mark as learnt"}
        </button>
        {next ? (
          <button type="button" onClick={() => onNext(next)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap bg-signal px-4 text-[14px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))] sm:flex-none sm:text-[15px]">
            Next: {STEP_TITLE[next]}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <Link href={nextLesson?.href ?? backHref} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap bg-signal px-4 text-[14px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))] sm:flex-none sm:text-[15px]">
            {nextLesson ? "Next lesson" : "Back to the course"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
