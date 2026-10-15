/**
 * Course numbers strip (computed from the real resources) and, when the learner has started,
 * their true counts against the same denominators. Presentational; no queries.
 */
import type { CourseStats } from "@/lib/learn/types";

export type LearnerCounts = {
  coreDone: number;
  bossesDone: number;
  partsPassed: number;
  sideDone: number;
};

function Cell({ n, of, label, accent, wide }: { n: React.ReactNode; of?: number; label: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 bg-bg px-4 py-3 sm:px-[18px] ${wide ? "col-span-2" : ""}`}>
      <span className={`font-mono text-[22px] font-semibold ${accent ? "text-signal-text" : "text-fg"}`}>
        {n}
        {of !== undefined && <span className="text-sm text-fg-3">/{of}</span>}
      </span>
      <span className="text-[13px] text-fg-3">{label}</span>
    </div>
  );
}

export default function CourseProgressStats({ stats, learner }: { stats: CourseStats; learner?: LearnerCounts | null }) {
  const started = learner && learner.coreDone + learner.bossesDone + learner.partsPassed + learner.sideDone > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-px self-stretch border border-line bg-line sm:flex sm:flex-wrap sm:self-start">
        <Cell n={stats.worlds} label="worlds" />
        <Cell n={stats.coreLessons} label="core lessons" />
        <Cell n={stats.bosses} label="bosses" />
        <Cell n={stats.sideQuests} label="side quests" />
        <Cell n={`~${stats.coreHours}h`} label="of reading" wide />
      </div>
      {started && learner && (
        <p className="font-mono text-xs text-fg-3">
          you · <span className="text-fg">{learner.coreDone}</span>/{stats.coreLessons} core lessons · <span className="text-fg">{learner.bossesDone}</span>/{stats.bosses} bosses ·{" "}
          <span className="text-fg">{learner.partsPassed}</span>/{stats.trialParts} trial parts · <span className="text-fg">{learner.sideDone}</span>/{stats.sideQuests} side quests
        </p>
      )}
    </div>
  );
}
