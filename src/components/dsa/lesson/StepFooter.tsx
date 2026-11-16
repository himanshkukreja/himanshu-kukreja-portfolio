"use client";

/**
 * The sticky footer: "STEP 1 OF 4 · LEARN", "Mark as learnt" (the reader's own `complete`, disabled until the progress
 * engine allows it, with the reason as its tooltip) and "Next: <step>"; on Check it becomes "Next lesson".
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { STEP_ORDER, STEP_TITLE, nextStep, type StepId } from "@/lib/dsa/lesson-steps";

export default function StepFooter({ step, onNext, nextPart, nextLesson, backHref }: { step: StepId; onNext: (s: StepId) => void; nextPart: (() => void) | null; nextLesson: { href: string; title: string } | null; backHref: string }) {
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
    <div data-focus-hide data-reader-ui data-ask-shift className="hk-safe-x fixed inset-x-0 z-40 border-t border-line bg-surface" style={{ bottom: "var(--site-dock, 0px)" }}>
      <div className="mx-auto flex min-h-[72px] max-w-[1248px] items-center gap-2.5 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 sm:gap-4 sm:px-6 sm:py-3.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 sm:text-[12px]" aria-live="polite">
          Step {n} of {STEP_ORDER.length}
          <span className="hidden sm:inline"> · {STEP_TITLE[step]}</span>
        </span>
        <button
          type="button"
          onClick={p.complete}
          disabled={p.completed || !p.canComplete || !p.ready}
          title={reason}
          aria-label={p.completed ? "Learnt" : `Mark as learnt. ${reason}`}
          className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[10px] border bg-surface px-3 text-[14px] font-medium max-sm:w-11 max-sm:px-0 sm:px-4 ${p.completed ? "border-fg text-fg" : "border-line-strong text-fg hover:bg-surface-2 disabled:text-fg-4 disabled:hover:bg-surface"}`}
        >
          <span className="sm:hidden" aria-hidden>
            ✓
          </span>
          <span className="hidden sm:inline">{p.completed ? "✓ Learnt" : "Mark as learnt"}</span>
        </button>
        {next ? (
          <button type="button" onClick={() => (nextPart ? nextPart() : onNext(next))} className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-signal px-5 text-[15px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))] sm:min-h-11 sm:rounded-[10px] sm:text-[14px]">
            {nextPart ? "Next part" : `Next: ${STEP_TITLE[next]}`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <Link href={nextLesson?.href ?? backHref} className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-signal px-5 text-[15px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))] sm:min-h-11 sm:rounded-[10px] sm:text-[14px]">
            {nextLesson ? "Next lesson" : "Back to the course"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
