"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Stage } from "@/lib/course/types";

// Boss mode drives the stage sections inside .course-content by DOM; loaded on demand.
const BossMode = dynamic(() => import("@/components/learn/boss/BossMode"), { ssr: false });

type Props = { week: string; slug: string; stages: Stage[]; title: string };

/**
 * Side quest entry card for the "timed run": the quest's own interview phases, answered in a
 * scratchpad against their time budgets before the model answer is revealed (boss mode, quest
 * variant). This is a side-quest feature; the course's separate mock interviews live elsewhere.
 */
export default function QuestRunEntry({ week, slug, stages, title }: Props) {
  const [running, setRunning] = useState(false);
  const phases = stages.filter((s) => s.id.startsWith("phase-"));
  const budget = phases.reduce((n, s) => n + (s.budgetMinutes ?? 0), 0);
  if (!phases.length) return null;
  if (running) return <BossMode week={week} slug={slug} stages={stages} title={title} variant="quest" />;

  return (
    <section aria-label="Timed run" className="mb-8 flex flex-col gap-3 border border-dashed border-line-strong bg-surface p-4 sm:mb-10 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-mono text-xs uppercase tracking-label text-fg-3">
          Optional · timed run · {phases.length} phases{budget ? ` · ${budget} min` : ""}
        </span>
        <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
          Want it harder? Hide the model answer and work each phase in a scratchpad{budget ? " against its time budget" : ""}, then reveal and score yourself. Or simply read on: the checkpoints below work either way.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setRunning(true)}
        className="min-h-12 w-full shrink-0 border border-signal px-5 text-[15px] font-semibold text-signal-text hover:bg-surface-2 sm:w-auto"
      >
        Start a timed run →
      </button>
    </section>
  );
}
