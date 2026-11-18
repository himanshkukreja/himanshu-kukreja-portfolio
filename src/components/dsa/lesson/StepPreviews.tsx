"use client";

/**
 * The lesson's other steps, under the open one (the canvas's Lesson artboard): each is its own rounded card with its number,
 * a line on what it holds and one button that opens it. Practice lists its problems (ring, title, level, state), so the
 * learner sees the whole lesson at a glance; the open step's full content stays in the card above.
 * Phase 2 slots: the predict checks and the inline visualiser mount inside the Learn card, not here.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STEP_TITLE, stepOrderOf, type LessonKind, type StepId } from "@/lib/dsa/lesson-steps";
import type { ProblemSummary } from "@/lib/dsa/types";
import SolvedMark from "../problem/SolvedMark";
import { useDsaProgress } from "../progress/useDsaProgress";
import { BTN_SECONDARY, MID } from "../ui/kit";
import type { StepView } from "./StepRail";

const LEVEL_TONE: Record<string, string> = { easy: "text-ok-text", medium: "text-amber", hard: "text-bad-text" };
const CARD = "rounded-2xl border border-line bg-surface p-[18px] sm:rounded-[18px] sm:p-[22px]";
const H = "m-0 text-[17px] font-semibold text-fg sm:text-[18px]";

const LINE: Record<StepId, string> = {
  learn: "Watch the lecture, read the lesson or listen to it.",
  try: "Step through the idea on your own input, then build it in the lab. Runs in your browser.",
  practice: "Easy first. Hints come before solutions.",
  check: "A few questions, then explain the idea back in your own words. Your tutor marks it.",
};
const OPEN: Record<StepId, string> = { learn: "Back to Learn", try: "Open Try it", practice: "Open Practice", check: "Start the check" };

export default function StepPreviews({ steps, current, problems, onPick, kind }: { kind?: LessonKind; steps: StepView[]; current: StepId; problems: ProblemSummary[]; onPick: (s: StepId) => void }) {
  const p = useDsaProgress();
  const others = steps.filter((s) => s.id !== current);
  return (
    <div className="flex flex-col gap-4 sm:gap-[22px]" data-focus-hide data-step-previews>
      {others.map((s) => {
        const n = stepOrderOf(kind).indexOf(s.id) + 1;
        const open = (
          <button type="button" onClick={() => onPick(s.id)} className={`${BTN_SECONDARY} ${MID} shrink-0`}>
            {OPEN[s.id]}
          </button>
        );
        if (s.id === "practice") {
          const solved = problems.filter((x) => p.solved.has(x.id)).length;
          return (
            <section key={s.id} aria-label={`Step ${n}: ${STEP_TITLE[s.id]}`} className={`${CARD} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className={H}>
                  {n} · {STEP_TITLE[s.id]}
                  {problems.length ? <span className="ml-2 text-[14px] font-normal text-fg-3">{solved} of {problems.length} solved</span> : null}
                </h2>
                <span className="text-[13px] text-fg-3">{LINE.practice}</span>
              </div>
              {problems.length ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {problems.map((x) => {
                    const done = p.solved.has(x.id);
                    return (
                      <li key={x.id}>
                        <Link href={`/dsa/problems/${x.id}`} className="flex min-h-12 items-center gap-3.5 rounded-xl border border-line px-3.5 py-3 hover:bg-surface-2">
                          <SolvedMark id={x.id} />
                          <span className="min-w-0 flex-1 text-[14px] font-medium text-fg sm:text-[15px]">{x.title}</span>
                          <span className={`font-mono text-[11px] uppercase sm:text-[12px] ${LEVEL_TONE[x.level] || "text-fg-3"}`}>{x.level}</span>
                          <span className="hidden w-[90px] text-right text-[13px] text-fg-3 sm:block">{done ? "Solved" : "Not started"}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="m-0 text-[14px] text-fg-3">Problems for this lesson are on the way.</p>
              )}
              <button type="button" onClick={() => onPick("practice")} className="inline-flex min-h-10 items-center gap-1.5 self-start text-[14px] font-medium text-signal-text hover:underline hover:underline-offset-4">
                {OPEN.practice}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </section>
          );
        }
        return (
          <section key={s.id} aria-label={`Step ${n}: ${STEP_TITLE[s.id]}`} className={`${CARD} flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-[22px]`}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h2 className={H}>
                {n} · {STEP_TITLE[s.id]}
                {s.state === "done" ? <span className="ml-2 text-[13px] font-medium text-ok-text">✓ Done</span> : null}
              </h2>
              <p className="m-0 text-[14px] leading-normal text-fg-2">
                {LINE[s.id]}
                {s.id !== "learn" && s.sub ? <span className="text-fg-3"> {s.sub}.</span> : null}
              </p>
            </div>
            {open}
          </section>
        );
      })}
    </div>
  );
}
