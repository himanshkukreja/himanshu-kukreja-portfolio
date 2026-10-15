"use client";

import Link from "next/link";
import { LEVELS, levelProgress } from "@/game/catalog";
import type { Resume, WeekState } from "@/lib/learn/progress";
import { resumeDetails, type ResumeStage } from "@/components/ContinueReadingBanner";
import { fmtMinutes } from "./derive";
import { Bar, Label, Stat } from "./ui";

type Props = {
  name: string;
  signedIn: boolean;
  xp: number;
  coursePct: number;
  nodes: { done: number; total: number };
  lessonsDone: number;
  lessonsTotal: number;
  minutes: number;
  timeTracked: boolean;
  streak: { current: number; best: number; today: boolean };
  states: WeekState[];
  currentWeek: string | null;
  resume: Resume | null;
  stages: ResumeStage[] | null;
  nextTrial: { label: string; href: string; best: number | null } | null;
  due: number | null;
};

export default function ProgressHeader(p: Props) {
  const lp = levelProgress(p.xp);
  return (
    <section aria-labelledby="overview-h" id="overview" className="grid scroll-mt-28 gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Label>
            <span className="text-signal-text">00</span> · progress · {p.signedIn ? "synced to your account" : "guest · this browser only"}
          </Label>
          <h1 id="overview-h" className="break-words font-display text-[clamp(40px,9vw,84px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
            {p.name}
            <span className="text-signal-text">.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="bg-signal px-2 py-1 font-mono text-[12px] font-semibold tracking-label text-on-signal">
              {lp.level.code} · {lp.level.name.toUpperCase()}
            </span>
            <span className="font-mono text-[12px] text-fg-2">
              {p.xp} XP{lp.next ? ` · ${lp.next.min - p.xp} to ${lp.next.code} ${lp.next.name}` : " · max level"}
            </span>
          </div>
          <Bar pct={lp.pct} className="h-1.5 max-w-[560px]" label="Progress to the next level" />
          {lp.next && <span className="text-[13px] text-fg-3">Next unlock: {LEVELS[lp.index + 1]?.unlock}</span>}
        </div>

        <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <Stat value={p.coursePct} unit="%" label="course" sub={`${p.nodes.done} of ${p.nodes.total} nodes`} accent />
          <Stat value={p.streak.current || "0"} unit={p.streak.current === 1 ? "day" : "days"} label="streak" sub={p.streak.current ? `${p.streak.today ? "today counted" : "today not yet"} · best ${p.streak.best}` : p.streak.best ? `best ${p.streak.best} days` : "a stage starts one"} />
          <Stat value={fmtMinutes(p.minutes)} label={p.timeTracked ? "time learning" : "est. reading"} sub={p.timeTracked ? "tracked in lessons" : "from what you've read"} />
          <Stat value={p.lessonsDone} unit={`/${p.lessonsTotal}`} label="lessons" sub="core lessons + bosses" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label>by week</Label>
            <span className="font-mono text-[11px] text-fg-3">{p.states.filter((s) => s.cleared).length} cleared</span>
          </div>
          <ol className="flex gap-[3px]" aria-label="Completion per week">
            {p.states.map((s) => {
              const pct = s.nodesTotal ? Math.round((s.nodesDone / s.nodesTotal) * 100) : 0;
              const cur = s.week.key === p.currentWeek;
              return (
                <li key={s.week.key} className="flex min-w-0 flex-1 flex-col gap-1">
                  <a href={`#map-${s.week.key}`} aria-label={`Week ${s.week.code}: ${pct}%`} title={`W${s.week.code} · ${s.week.title} · ${pct}%`} className="block py-1.5">
                    <span className={`relative block h-2.5 ${s.cleared ? "bg-fg" : "bg-surface-2"} ${cur ? "outline outline-1 outline-offset-1 outline-signal" : ""}`}>
                      {!s.cleared && <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${pct}%` }} />}
                    </span>
                  </a>
                  <span className={`text-center font-mono text-[10px] ${cur ? "text-signal-text" : "text-fg-4"}`}>{s.week.code}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 self-start">
        <ResumeCard resume={p.resume} stages={p.stages} />
        {p.nextTrial && (
          <Link href={p.nextTrial.href} className="flex min-h-14 items-center justify-between gap-3 border border-line bg-surface px-4 py-2.5 hover:border-line-strong">
            <span className="flex min-w-0 flex-col gap-0.5">
              <Label>next trial</Label>
              <span className="truncate text-sm text-fg">{p.nextTrial.label}</span>
            </span>
            <span className="shrink-0 font-mono text-[12px] text-signal-text">{p.nextTrial.best !== null ? `best ${p.nextTrial.best}% →` : "take it →"}</span>
          </Link>
        )}
        {p.due !== null && (
          <Link href="/learn/review" className="flex min-h-14 items-center justify-between gap-3 border border-line bg-surface px-4 py-2.5 hover:border-line-strong">
            <span className="flex min-w-0 flex-col gap-0.5">
              <Label>daily standup</Label>
              <span className="text-sm text-fg">{p.due ? `${p.due} review card${p.due === 1 ? "" : "s"} due` : "Nothing due today"}</span>
            </span>
            <span className="shrink-0 font-mono text-[12px] text-signal-text">review →</span>
          </Link>
        )}
      </div>
    </section>
  );
}

function ResumeCard({ resume, stages }: { resume: Resume | null; stages: ResumeStage[] | null }) {
  if (!resume) return null;
  const l = resume.lesson;
  const d = resumeDetails(resume, stages);
  const multi = d.total > 1;
  const head = resume.mode === "start" ? "start here" : resume.mode === "next" ? "up next" : "resume where you left off";
  const line =
    resume.mode === "start"
      ? `${l.minutes} min read · nothing to resume yet`
      : multi && d.stage
        ? `Stage ${d.stageIdx + 1} of ${d.total} · ${d.stage.label}${d.stage.title && d.stage.title !== d.stage.label ? ` · ${d.stage.title}` : ""}`
        : `${l.minutes} min read${d.pct ? ` · ${d.pct}% read` : ""}`;
  const cta = resume.mode !== "resume" ? "Start lesson" : multi && d.stageIdx > 0 ? `Resume stage ${d.stageIdx + 1}` : "Resume lesson";
  return (
    <aside aria-label="Resume" className="flex flex-col gap-3.5 border border-signal bg-surface p-4 sm:p-6">
      <div className="flex justify-between gap-3">
        <Label className="text-signal-text">{head}</Label>
        <Label>{l.tag}</Label>
      </div>
      <span className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[28px]">{l.title}</span>
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
          <Bar pct={d.pct} />
        )}
        <span className="text-[13px] leading-snug text-fg-2">{line}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">left</span>
        <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-fg">
          ~{resume.mode === "resume" ? d.minsLeft : l.minutes}
          <span className="ml-1 font-mono text-[12px] font-normal tracking-normal text-fg-3">min</span>
        </span>
      </div>
      <Link href={d.href} className="flex min-h-[52px] items-center justify-between bg-signal px-5 text-base font-semibold text-on-signal hover:brightness-110">
        <span>{cta}</span>
        <span aria-hidden className="font-mono">
          →
        </span>
      </Link>
    </aside>
  );
}
