"use client";

/**
 * Activity on Progress: a GitHub-style calendar of active days and the current / best streak. Nothing new is stored for it:
 * every lesson step, finished lesson, exercise, problem, lab, quiz, revision card and lecture is a dated `dsa:` key in the
 * synced game store, and submits on this device add to it (src/lib/dsa/stats.ts computeStats reads them). Exercises and tools
 * are dated keys too (`dsa:ex:`, `dsa:tool:`), so they count from the day they were first recorded.
 */
import { useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { SOLVE_BITS } from "@/lib/dsa/rewards";
import { warmDaysOf } from "@/lib/dsa/warmup";
import { computeStats, type StatRow } from "@/lib/dsa/stats";
import { CARD, KICKER } from "../ui/kit";
import { Heatmap, useHistories } from "../stats/DsaStats";
import { useDsaProgress } from "./useDsaProgress";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg px-4 py-3">
      <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg tabular-nums">{value}</span>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
    </div>
  );
}

export default function Activity({ rows }: { rows: StatRow[] }) {
  const { done, hydrated } = useGame();
  const progress = useDsaProgress();
  const histories = useHistories();
  const [clock] = useState(() => ({ now: Date.now(), tz: new Date().getTimezoneOffset() }));
  const ready = hydrated && progress.ready && histories !== null;
  const a = useMemo(() => (ready ? computeStats({ extraDays: warmDaysOf(done), done, solved: progress.solved, rows, histories: histories || {}, solveBits: {}, tiers: SOLVE_BITS, awards: [], now: clock.now, tzOffsetMin: clock.tz, weeks: 32 }).activity : null), [ready, done, progress.solved, rows, histories, clock]);
  return (
    <div className={`${CARD} grid items-center gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_240px]`}>
      <div className="flex min-w-0 flex-col gap-2">
        <p className={KICKER}>Last eight months</p>
        {a ? <Heatmap heat={a.heat} className="max-w-[720px]" /> : <p role="status" className="m-0 font-mono text-[12px] text-fg-3">Counting your days…</p>}
        <p className="m-0 text-[12.5px] leading-snug text-fg-3">A day is active when you finish a lesson step, a lesson, an exercise, a problem, a lab, a quiz, a lecture or a revision card, or submit code. Streaks count days in a row; one quiet day does not end today&apos;s.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
        <Stat value={a ? a.current : "–"} label="Day streak" />
        <Stat value={a ? a.longest : "–"} label="Best streak" />
        <Stat value={a ? a.activeDays : "–"} label={a ? (a.activeDays === 1 ? "Active day" : "Active days") : "Active days"} />
      </div>
      <span className="sr-only">{a ? `${plural(a.activeDays, "active day")}, current streak ${plural(a.current, "day")}, best streak ${plural(a.longest, "day")}.` : ""}</span>
    </div>
  );
}
