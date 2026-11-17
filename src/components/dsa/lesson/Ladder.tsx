"use client";

/**
 * A lean lesson's ladder (`::ladder`): its problems as an ordered list of cards, easy to hard. Each card is one link to the
 * problem room: the step number, the solved mark, the title, its difficulty (a camp tent also its rating, a set its time
 * box) and a "what it adds" line, so the learner sees why this rung follows the last. The first unsolved rung is marked
 * "Next". The static markup the server renders (src/lib/course/detect/dsa.ts) is the fallback until this mounts.
 */
import Link from "next/link";
import type { LadderItem } from "@/lib/dsa/kinds";
import SolvedMark from "../problem/SolvedMark";
import { useDsaProgress } from "../progress/useDsaProgress";

const LEVEL_TONE: Record<string, string> = { easy: "text-ok-text", medium: "text-amber", hard: "text-bad-text" };

export default function Ladder({ items }: { items: LadderItem[] }) {
  const p = useDsaProgress();
  const next = items.findIndex((x) => !p.solved.has(x.id));
  const solved = items.filter((x) => p.solved.has(x.id)).length;
  return (
    <div className="dsa-ui flex flex-col gap-2 p-3 sm:p-4" data-ladder>
      <p className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3" aria-live="polite">
        {solved} of {items.length} solved
      </p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="The ladder, easy to hard">
        {items.map((x, i) => {
          const done = p.solved.has(x.id);
          return (
            <li key={x.id}>
              <Link href={x.href} className={`flex min-h-14 items-start gap-3 rounded-xl border bg-surface px-3.5 py-3 hover:bg-surface-2 ${i === next ? "border-signal" : "border-line"}`} data-ladder-step={i + 1}>
                <span className="w-5 pt-0.5 text-right font-mono text-[12px] text-fg-3">{i + 1}</span>
                <span className="pt-px">
                  <SolvedMark id={x.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="text-[15px] font-medium text-fg">{x.title}</span>
                    {i === next ? <span className="rounded-full bg-signal px-2 py-px text-[11px] font-semibold text-on-signal">Next</span> : null}
                  </span>
                  {x.adds ? <span className="mt-0.5 block text-[13.5px] leading-snug text-fg-2">{x.adds}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-right">
                  <span className={`font-mono text-[12px] uppercase ${LEVEL_TONE[x.level] || "text-fg-3"}`}>{x.level}</span>
                  {x.rating ? <span className="font-mono text-[11.5px] text-fg-3">{x.rating}</span> : null}
                  {x.minutes ? <span className="font-mono text-[11.5px] text-fg-3">{x.minutes} min</span> : null}
                  <span className="text-[12px] text-fg-3">{done ? "Solved" : "Not started"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
