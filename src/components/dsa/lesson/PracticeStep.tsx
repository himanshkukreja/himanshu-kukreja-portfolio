"use client";

/** Practice: the lesson's problems in order, easiest first, each with its level as a word and its state as a glyph and a word. */
import Link from "next/link";
import SolvedMark from "../problem/SolvedMark";
import { useDsaProgress } from "../progress/useDsaProgress";
import type { ProblemSummary } from "@/lib/dsa/types";

const LEVEL_TONE: Record<string, string> = { easy: "text-ok-text", medium: "text-amber", hard: "text-bad-text" };

export default function PracticeStep({ problems, intro, module }: { problems: ProblemSummary[]; intro: string; module: string }) {
  const p = useDsaProgress();
  const first = problems.find((x) => !p.solved.has(x.id)) ?? problems[0];
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-fg-2">{intro}</p>
      {problems.length ? (
        <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
          {problems.map((x, i) => {
            const solved = p.solved.has(x.id);
            return (
              <li key={x.id} className="bg-surface">
                <Link href={`/dsa/problems/${x.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="w-5 font-mono text-[12px] text-fg-3">{i + 1}</span>
                  <SolvedMark id={x.id} />
                  <span className="min-w-0 flex-1 text-[15px] text-fg">{x.title}</span>
                  <span className={`font-mono text-[11px] font-semibold uppercase tracking-label ${LEVEL_TONE[x.level] || "text-fg-3"}`}>{x.level}</span>
                  <span className="hidden w-24 text-right font-mono text-[12px] text-fg-3 sm:block">{solved ? "✓ Solved" : "Not started"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-[15px] text-fg-2">Problems for this lesson are on the way.</p>
      )}
      <div className="flex flex-wrap gap-3">
        {first ? (
          <Link href={`/dsa/problems/${first.id}`} className="inline-flex min-h-11 items-center bg-signal px-4 text-[15px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))]">
            {problems.some((x) => p.solved.has(x.id)) ? "Next problem →" : "Start problem 1 →"}
          </Link>
        ) : null}
        {/* TODO(phase 2c): /dsa/practice is built by the Practice phase; until it lands the old route redirects there */}
        <Link href={`/dsa/practice?step=${encodeURIComponent(module)}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg hover:border-signal">
          More on this pattern
        </Link>
      </div>
    </div>
  );
}
