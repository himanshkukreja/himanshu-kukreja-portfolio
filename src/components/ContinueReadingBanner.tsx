"use client";

/**
 * Continue card: resume by stage (last_stage / stage checkpoints), never by scroll position.
 * Presentational: the hub passes the resume target (from one batched progress load), the lesson's
 * stages (server action) and the due review count.
 */
import Link from "next/link";
import type { Resume } from "@/lib/learn/progress";

export type ResumeStage = { id: string; label: string; title: string; minutes: number };

type Props = {
  ready: boolean;
  resume: Resume | null;
  stages: ResumeStage[] | null;
  dueCount: number;
  dueReady: boolean;
  streak: { current: number; today: boolean } | null;
  compact?: boolean;
};

export function resumeDetails(resume: Resume, stages: ResumeStage[] | null) {
  const done = new Set(resume.progress?.completedStages || []);
  const list = stages && stages.length ? stages : null;
  if (!list) return { stageIdx: -1, total: 0, stage: null as ResumeStage | null, minsLeft: resume.lesson.minutes, pct: resume.progress?.pct || 0, href: resume.lesson.href };
  let idx = list.findIndex((s) => !done.has(s.id));
  const last = resume.progress?.lastStage;
  const li = last ? list.findIndex((s) => s.id === last) : -1;
  if (li >= 0 && !done.has(last as string)) idx = li;
  if (idx < 0) idx = list.length - 1;
  const minsLeft = list.reduce((a, s, i) => a + (i >= idx && !done.has(s.id) ? s.minutes : 0), 0) || list[idx].minutes;
  const pct = Math.round((list.filter((s) => done.has(s.id)).length / list.length) * 100);
  const href = idx > 0 ? `${resume.lesson.href}#${list[idx].id}` : resume.lesson.href;
  return { stageIdx: idx, total: list.length, stage: list[idx], minsLeft, pct: Math.max(pct, resume.progress?.pct && list.length === 1 ? resume.progress.pct : 0), href };
}

export default function ContinueReadingBanner({ ready, resume, stages, dueCount, dueReady, streak, compact = false }: Props) {
  if (!ready || !resume) {
    return (
      <div aria-busy="true" className="flex min-h-[300px] flex-col gap-3.5 border border-line bg-surface p-6">
        <span className="h-3 w-40 animate-pulse bg-surface-2" />
        <span className="h-8 w-3/4 animate-pulse bg-surface-2" />
        <span className="h-1.5 w-full bg-surface-2" />
        <span className="mt-auto h-[52px] w-full animate-pulse bg-surface-2" />
      </div>
    );
  }
  const l = resume.lesson;
  const d = resumeDetails(resume, stages);
  const multi = d.total > 1;
  const head = resume.mode === "start" ? "Start here" : resume.mode === "next" ? "Up next" : "Continue";
  const stageLine =
    resume.mode === "start"
      ? `${l.minutes} min read · nothing to resume yet. Progress saves by stage.`
      : multi && d.stage
        ? `Stage ${d.stageIdx + 1} of ${d.total} · ${d.stage.label}${d.stage.title && d.stage.title !== d.stage.label ? ` · ${d.stage.title}` : ""} · ~${d.minsLeft} min left`
        : resume.mode === "next"
          ? `${l.minutes} min read · the next lesson after your last cleared one`
          : `${l.minutes} min read${d.pct ? ` · ${d.pct}% read` : ""}`;
  const cta =
    resume.mode === "start" ? "Start lesson" : resume.mode === "next" ? "Start lesson" : multi && d.stageIdx > 0 ? `Resume stage ${d.stageIdx + 1}` : "Resume lesson";

  return (
    <div className={`flex flex-col gap-3.5 border border-signal bg-surface ${compact ? "p-4" : "p-6"}`}>
      <div className="flex justify-between gap-3 font-mono text-xs uppercase tracking-label">
        <span className="text-signal-text">{head}</span>
        <span className="text-fg-3">{l.tag}</span>
      </div>
      <span className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[30px]">{l.kind === "week-preview" ? `${l.title}` : l.title}</span>
      <div className="flex flex-col gap-1.5">
        {multi ? (
          <span aria-hidden className="flex gap-[3px]">
            {(stages || []).map((s, i) => {
              const isDone = resume.progress?.completedStages.includes(s.id);
              return (
                <span key={s.id} className={`h-1.5 flex-1 ${isDone ? "bg-fg" : "bg-surface-2"}`}>
                  {i === d.stageIdx && !isDone && <span className="block h-1.5 w-[40%] bg-signal" />}
                </span>
              );
            })}
          </span>
        ) : (
          <span aria-hidden className="h-1.5 bg-surface-2">
            <span className="block h-1.5 bg-signal" style={{ width: `${d.pct}%` }} />
          </span>
        )}
        <span className="text-[13px] text-fg-3">{stageLine}</span>
      </div>
      <Link href={d.href} className="flex min-h-[52px] items-center justify-center bg-signal px-5 text-base font-semibold text-on-signal hover:brightness-110">
        {cta}
      </Link>
      <Link href="/learn/review" className="flex min-h-12 items-center justify-between gap-3 border border-line-strong px-3.5 py-2 text-sm text-fg hover:bg-surface-2">
        <span>{dueReady ? (dueCount ? `Daily standup · ${dueCount} card${dueCount === 1 ? "" : "s"} · ~${Math.max(1, Math.ceil((dueCount * 25) / 60))} min` : "Daily standup · nothing due today") : "Daily standup"}</span>
        <span className="shrink-0 whitespace-nowrap font-mono text-signal-text">review →</span>
      </Link>
      <span className="text-[13px] text-fg-3">
        {streak && streak.current > 0
          ? `${streak.current}-day streak${streak.today ? "" : " · today not counted yet"}. A stage or a review session keeps it alive.`
          : "Finish a stage or review a card to start a streak."}
      </span>
    </div>
  );
}
