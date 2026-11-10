"use client";

/**
 * The interview walkthrough's step tracker, on the right of a case study (from lg up; phones use the
 * Contents sheet, which lists the same seven steps). It is the lesson's stage progress under another
 * name: each step is a stage (src/lib/learn/lld/steps.ts), so "done", the current step, the checkpoint
 * and resume all come from useLessonProgress and sync like every other lesson's.
 */
import type { Stage } from "@/lib/course/types";
import { useOptionalLessonProgress } from "@/components/LessonProgressTracker";
import { scrollToId } from "@/components/learn/lesson/layout";
import { STEPS } from "@/lib/learn/lld/steps";
import type { LldMeta } from "@/lib/learn/lld/types";
import { TryFirstSwitch } from "./LldPrefs";

export default function LldSideTracker({ stages, lld }: { stages: Stage[]; lld: LldMeta | null }) {
  const p = useOptionalLessonProgress();
  const byId = new Map(stages.map((s) => [s.id, s]));
  const present = new Set(lld?.present ?? STEPS.map((s) => s.key));
  const doneCount = STEPS.filter((s) => p?.completed || p?.done.has(s.id)).length;
  const resume = p?.ready && !p.completed && p.lastStage && p.lastStage !== "intro" && p.lastStage !== p.current ? byId.get(p.lastStage) : null;
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToId(id);
  };

  return (
    <aside
      aria-label="Interview steps"
      data-reader-ui
      className="sticky flex flex-col gap-3 overflow-y-auto pb-4"
      style={{
        top: "calc(var(--reader-top, 61px) + var(--reader-rail, 90px) + 24px)",
        maxHeight: "calc(100vh - var(--reader-top, 61px) - var(--reader-rail, 90px) - 120px)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-label text-fg-3">Interview steps</span>
        <span className="font-mono text-[11px] text-fg-3" aria-label={`${doneCount} of ${STEPS.length} steps done`}>
          {doneCount}/{STEPS.length}
        </span>
      </div>
      <div className="h-1 bg-surface-2" role="presentation">
        <div className="h-full bg-signal" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
      </div>

      <ol className="m-0 flex list-none flex-col p-0">
        {STEPS.map((s) => {
          const st = byId.get(s.id);
          const isDone = !!(p?.completed || p?.done.has(s.id));
          const isCur = p?.current === s.id;
          const written = present.has(s.key);
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={go(s.id)}
                aria-current={isCur ? "step" : undefined}
                className={`flex min-h-11 items-center gap-2.5 px-1.5 py-1 text-[13px] leading-snug hover:text-fg ${isCur ? "bg-surface-2 font-semibold text-fg" : "text-fg-2"}`}
              >
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center border font-mono text-[11px] ${
                    isDone ? "border-fg bg-fg text-bg" : isCur ? "border-signal text-signal-text" : "border-line-strong text-fg-3"
                  }`}
                >
                  {isDone ? "✓" : s.n}
                </span>
                <span className="min-w-0 flex-1">
                  {s.short}
                  {isDone && <span className="sr-only"> (done)</span>}
                  {!written && <span className="block text-[11px] font-normal text-fg-4">not written yet</span>}
                </span>
                {st && <span className={`font-mono text-[11px] font-normal ${isCur ? "text-signal-text" : "text-fg-4"}`}>{st.minutes}m</span>}
              </a>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        {resume && (
          <button type="button" onClick={() => scrollToId(resume.id)} className="min-h-11 bg-fg px-3 text-left text-sm font-semibold text-bg hover:opacity-90">
            Resume at {resume.label} ›
          </button>
        )}
        {p && !p.completed && (
          <button
            type="button"
            onClick={p.saveCheckpoint}
            className="min-h-11 border border-line-strong px-3 text-left text-sm text-fg-2 hover:border-fg hover:text-fg"
          >
            Save checkpoint here
          </button>
        )}
        <TryFirstSwitch compact />
      </div>
    </aside>
  );
}
