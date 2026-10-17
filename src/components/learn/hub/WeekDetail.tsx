"use client";

import Link from "next/link";
import type { CourseLesson } from "@/lib/learn/types";
import { LEARN_XP, lessonKey } from "@/lib/learn/types";
import type { LessonProgress, WeekState } from "@/lib/learn/progress";
import { hoursLabel } from "@/lib/learn/progress";
import type { MockStatus } from "@/lib/learn/mock/store";
import { MockGlyph, mockStateText } from "./SkillTree";

/** Selected-world panel: lessons with real titles + minutes, boss, trial parts, reward, CTA. */
export default function WeekDetail({
  state,
  lessons,
  currentKey,
  current,
  done,
  onClose,
  headingId,
  mock,
}: {
  state: WeekState;
  lessons: Record<string, LessonProgress>;
  /** `${week}/${slug}` of the resume lesson */
  currentKey: string | null;
  current: boolean;
  done: Record<string, number>;
  onClose?: () => void;
  headingId?: string;
  /** the mock interview that follows this world, if any */
  mock?: MockStatus | null;
}) {
  const w = state.week;
  const st = (l: CourseLesson) => lessons[lessonKey(l.week, l.slug)];
  const isDone = (l: CourseLesson) => st(l)?.status === "completed";
  const nextUp = [...w.lessons, ...(w.boss ? [w.boss] : [])].find((l) => !isDone(l));
  const pct = state.nodesTotal ? Math.round((state.nodesDone / state.nodesTotal) * 100) : 0;
  const worldEarned = !!done[`world:${w.key}`];
  const ctaLesson = nextUp || w.lessons[0];
  const short = (l: CourseLesson) => (l.kind === "week-preview" ? "the Preview" : l.kind === "capstone" ? "the boss" : l.label.split(" · ")[0]);
  const ctaLabel = !ctaLesson
    ? null
    : !nextUp
      ? `Re-read ${short(ctaLesson)}`
      : st(nextUp)?.status === "in_progress"
        ? `Resume ${short(nextUp)}`
        : `${state.started ? "Continue with" : "Start with"} ${short(nextUp)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className={`font-mono text-xs uppercase tracking-label ${current ? "text-signal-text" : "text-fg-3"}`}>
            Week {w.code} · {state.status}
          </span>
          <h3 id={headingId} className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[32px]">
            {w.title}
          </h3>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3 hover:text-fg">
            ×
          </button>
        )}
      </div>
      <span className="font-mono text-xs text-fg-3">
        {w.lessons.length + (w.boss ? 1 : 0)} lessons · about {hoursLabel(w.minutes).replace("~", "")} of reading · {state.nodesDone} of {state.nodesTotal} nodes
      </span>
      <div className="h-1 bg-surface-2" aria-hidden>
        <div className="h-1 bg-signal" style={{ width: `${pct}%` }} />
      </div>

      <ol className="flex flex-col">
        {w.lessons.map((l) => {
          const d = isDone(l);
          const cur = !d && currentKey === lessonKey(l.week, l.slug);
          const p = st(l);
          return (
            <li key={l.slug} className="flex items-center gap-3 border-b border-line py-2.5">
              <span
                aria-hidden
                className={`grid h-[22px] w-[22px] shrink-0 place-items-center text-[11px] ${d ? "bg-fg text-bg" : cur ? "bg-signal text-on-signal" : "border border-line-strong"}`}
              >
                {d ? "✓" : cur ? "▶" : ""}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <Link href={l.href} className={`text-[15px] hover:underline ${cur ? "font-semibold text-signal-text" : "text-fg"}`}>
                  {l.kind === "week-preview" ? "Preview" : l.label}
                  <span className="sr-only">{d ? " (done)" : cur ? " (current)" : ""}</span>
                </Link>
                {cur && p && p.completedStages.length > 0 && <span className="text-[11px] text-fg-3">{p.completedStages.length} stage{p.completedStages.length === 1 ? "" : "s"} done</span>}
              </span>
              <span className="whitespace-nowrap font-mono text-xs text-fg-3">{l.minutes}m</span>
            </li>
          );
        })}
        {w.boss && (
          <li className="flex items-center gap-3 border-b border-line py-2.5">
            <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center">
              <span className={`h-[13px] w-[13px] rotate-45 border-[1.5px] border-fg ${state.bossDone ? "bg-fg" : ""}`} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <Link href={w.boss.href} className="text-[15px] font-semibold text-fg hover:underline">
                Boss · {w.boss.title}
                <span className="sr-only">{state.bossDone ? " (defeated)" : ""}</span>
              </Link>
              <span className="text-[11px] text-fg-3">{state.bossDone ? "defeated" : "timed interview · scratchpad first"}</span>
            </span>
            <span className="whitespace-nowrap font-mono text-xs text-fg-3">{w.boss.minutes}m · timed</span>
          </li>
        )}
      </ol>

      {w.trial ? (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-label text-fg-3">
            TRIAL · {w.trial.parts.length} PARTS · {w.trial.totalQuestions} Q · PASS {w.trial.passPct}%
          </span>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {w.trial.parts.map((p) => {
              const passed = state.partsPassed.includes(p.n);
              return (
                <Link
                  key={p.n}
                  href={p.href}
                  className={`flex min-h-11 flex-col gap-0.5 px-2 py-1.5 hover:bg-surface-2 ${passed ? "border border-line-strong" : "border border-signal/60"}`}
                >
                  <span className={`font-mono text-[11px] ${passed ? "text-ok" : "text-signal-text"}`}>
                    P{p.n} · {passed ? "passed" : `${p.questions} Q`}
                  </span>
                  <span className="line-clamp-2 text-xs text-fg-2">{p.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border border-dashed border-line-strong px-3 py-2.5">
          <span className="text-sm text-fg-3">Trial · in the works</span>
          <span className="font-mono text-xs text-fg-4">—</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border border-line px-3.5 py-3">
        <span className="text-sm text-fg">World reward</span>
        <span className="font-mono text-[13px] text-signal-text">
          {worldEarned ? `EARNED ✓ · ${w.badge}` : `+${LEARN_XP.world} XP · ${w.badge} badge`}
        </span>
      </div>

      {mock && (
        <Link href={mock.mock.href} className="flex items-center gap-3 border border-dashed border-signal px-3.5 py-3 hover:bg-surface-2">
          <MockGlyph state={mock.state} text={mock.mock.code} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-[11px] tracking-label text-signal-text">AFTER THIS WORLD · {mockStateText(mock)}</span>
            <span className="text-[15px] font-semibold text-fg">
              Mock interview · {mock.mock.company}
            </span>
            <span className="text-xs text-fg-3">
              {mock.mock.minutes} min · covers {mock.mock.coversLabel} · +{LEARN_XP.mock} XP
            </span>
          </span>
          <span aria-hidden className="font-mono text-sm text-signal-text">
            ❯
          </span>
        </Link>
      )}

      {ctaLesson && ctaLabel && (
        <Link href={ctaLesson.href} className="flex min-h-[52px] items-center justify-center bg-signal px-5 text-[15px] font-semibold text-on-signal">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
