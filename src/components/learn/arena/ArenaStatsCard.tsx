"use client";

/** Compact Arena summary for the Progress page: daily streak, today's run, league, weekly points. */
import Link from "next/link";
import { dailyStreakLocal, useArenaLocal, useBoard, useToday } from "./store";
import { LABEL, ResultSquares, TierBadge } from "./ui";

export default function ArenaStatsCard() {
  const today = useToday();
  const local = useArenaLocal();
  const { data } = useBoard("week");
  const me = data?.me || null;
  const streak = today && local ? dailyStreakLocal(local.daily, today) : null;
  const run = today && local ? local.daily[today] : undefined;
  const streakNow = Math.max(streak?.current || 0, me?.dailyStreak || 0);

  return (
    <section aria-labelledby="arena-stats-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="arena-stats-h" className="font-display text-[28px] font-bold tracking-[-0.025em] text-fg">
          Arena
        </h2>
        <Link href="/learn/arena" className="font-mono text-xs text-signal-text underline underline-offset-4">
          open the arena →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <div className="flex flex-col gap-1 bg-bg px-4 py-3">
          <span className={LABEL}>daily streak</span>
          <span className="font-display text-[26px] font-extrabold leading-none text-signal-text">{streakNow}d</span>
        </div>
        <div className="flex flex-col gap-1.5 bg-bg px-4 py-3">
          <span className={LABEL}>today</span>
          {run ? <ResultSquares results={run.results} size={14} /> : <Link href="/learn/arena/daily" className="font-mono text-sm text-signal-text underline underline-offset-4">play →</Link>}
        </div>
        <div className="flex flex-col gap-1.5 bg-bg px-4 py-3">
          <span className={LABEL}>league</span>
          <TierBadge tier={me?.tier ?? 0} />
        </div>
        <div className="flex flex-col gap-1 bg-bg px-4 py-3">
          <span className={LABEL}>{me ? "points this week" : "local pts"}</span>
          <span className="font-display text-[26px] font-extrabold leading-none text-fg">{me ? me.points : local ? local.local : "–"}</span>
        </div>
      </div>
    </section>
  );
}
