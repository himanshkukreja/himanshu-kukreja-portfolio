"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Stage } from "@/lib/course/types";
import { loadBossMode } from "@/lib/offline/lazy";
import { useGame } from "@/game/GameProvider";

// Boss mode controls the stage sections inside .course-content by DOM; loaded on demand
// (through lib/offline/lazy, so offline saving caches the same chunk).
const BossMode = dynamic(loadBossMode, { ssr: false });

type Props = { week: string; slug: string; stages: Stage[]; title: string; weekCode: string };

/** Capstone entry card: fight the boss (timed phases) or just read the model answer. */
export default function BossEntry({ week, slug, stages, title, weekCode }: Props) {
  const [fighting, setFighting] = useState(false);
  const { done, hydrated } = useGame();
  const phases = stages.filter((s) => s.budgetMinutes);
  const budget = phases.reduce((n, s) => n + (s.budgetMinutes ?? 0), 0);
  const defeated = hydrated && !!done[`boss:${week}`];

  // Boss mode brings its own briefing, so the entry card hands over to it.
  if (fighting) return <BossMode week={week} slug={slug} stages={stages} title={title} />;

  return (
    <>
      <section aria-label="Boss fight" className="mb-8 flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:mb-10 sm:gap-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-8 w-8 place-items-center">
            <span className={`h-[18px] w-[18px] rotate-45 border-2 ${defeated ? "border-fg bg-fg" : "border-signal"}`} />
          </span>
          <span className="min-w-0 font-mono text-xs uppercase tracking-label text-fg-3">
            Boss · {weekCode}
            {phases.length > 0 && (
              <>
                {` · ${phases.length} `}
                <span className="hidden sm:inline">timed </span>phases
              </>
            )}
            {budget > 0 && (
              <>
                {` · ${budget} min`}
                <span className="hidden sm:inline"> interview</span>
              </>
            )}
          </span>
        </div>
        <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
          {defeated
            ? "Boss defeated. Fight it again any time: phases run against the clock, your scratchpad answer comes first, the model answer after."
            : "Fight it like the real interview: each phase runs against its time budget, you write your answer in a scratchpad first, then reveal the model answer side by side and grade yourself."}
        </p>
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-2.5">
          <button
            type="button"
            onClick={() => setFighting(true)}
            className="min-h-12 w-full bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 sm:w-auto"
          >
            {defeated ? "Fight the boss again →" : "Fight the boss →"}
          </button>
          <span className="flex min-h-10 items-center justify-center px-1 text-sm text-fg-3 sm:min-h-12 sm:justify-start">or read the model answer below</span>
        </div>
      </section>
    </>
  );
}
