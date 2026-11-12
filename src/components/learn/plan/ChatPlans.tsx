"use client";

/**
 * Plans made in the course chat (make_study_plan: a saved path whose steps carry dates) on /plan, re-dated from progress
 * (lib/learner/planning-model.ts redatePath): a step that slipped past its day moves to today and the rest keep their
 * spacing; ticked steps and finished lessons drop out. "Keep the new dates" writes them into the saved path (so its
 * calendar file follows). Shown only when there is such a plan.
 */
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { useLearnProgress } from "@/lib/learn/progress";
import { COURSE_ID } from "@/lib/learn/paths";
import { hasStepDues, lessonKeyOfStep, listSavedPaths, savedPathKey, withStepDues, type SavedPath } from "@/lib/learn/saved-paths";
import { redatePath } from "@/lib/learner/planning-model";
import { fmtDate } from "@/components/learn/progress/derive";

export default function ChatPlans({ today }: { today: string }) {
  const { flags, setFlag, hydrated } = useGame();
  const { lessons } = useLearnProgress(COURSE_ID);
  const plans = useMemo(() => {
    if (!hydrated) return [];
    return listSavedPaths(flags)
      .filter(hasStepDues)
      .map((p) => {
        const isDone = (id: string) => {
          if (p.ticks[id]) return true;
          const s = p.steps.find((x) => x.id === id);
          const lk = s ? lessonKeyOfStep(s) : null;
          return !!lk && lessons[lk]?.status === "completed";
        };
        const { dues, slipped } = redatePath(p.steps, isDone, today);
        const live = p.steps.filter((s) => s.due && !isDone(s.id)).map((s) => ({ ...s, live: dues[s.id] ?? s.due! }));
        return { p, dues, slipped, live };
      })
      .filter((x) => x.live.length)
      .slice(0, 3);
  }, [flags, hydrated, lessons, today]);
  const keep = useCallback((p: SavedPath, dues: Record<string, string>) => setFlag(savedPathKey(p.id), withStepDues(p, dues, Date.now())), [setFlag]);
  if (!plans.length) return null;

  return (
    <section aria-labelledby="chat-plans-h" className="flex flex-col gap-3">
      <h2 id="chat-plans-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">
        plans from the chat · re-dated from your progress
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        {plans.map(({ p, dues, slipped, live }) => {
          const next = live.sort((a, b) => (a.live < b.live ? -1 : 1))[0];
          return (
            <li key={p.id} className="flex flex-col gap-2 border border-line bg-surface p-4">
              <span className="text-[16px] font-semibold leading-snug text-fg">{p.title}</span>
              <span className="text-[14px] text-fg-2">
                Next, {next.live === today ? "today" : fmtDate(next.live)}:{" "}
                <Link href={next.href} className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                  {next.title}
                </Link>
                {` · ${live.length} step${live.length === 1 ? "" : "s"} left, last on ${fmtDate(live[live.length - 1].live)}.`}
              </span>
              {slipped > 0 && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-3">
                  Moved {slipped} day{slipped === 1 ? "" : "s"} on: a step slipped past its day.
                  <button type="button" onClick={() => keep(p, dues)} className="min-h-9 font-semibold text-signal-text underline decoration-line-strong underline-offset-4">
                    keep the new dates
                  </button>
                </span>
              )}
              <Link href="/saved" className="self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                open in saved paths →
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
