"use client";

import { useEffect, useRef, useState } from "react";
import { useLessonProgress, isOptionalStage } from "@/components/LessonProgressTracker";
import { useChromeHidden } from "@/components/site/readerChrome";
import type { Stage } from "@/lib/course/types";
import { scrollToId } from "./layout";
import { doneCount, numberedStages, stageLine } from "./stageText";
import styles from "./reader.module.css";

type StageState = "done" | "done-cur" | "cur" | "ahead";

function stageState(id: string, current: string, done: ReadonlySet<string>, completed: boolean): StageState {
  const isDone = completed || done.has(id);
  if (isDone) return id === current ? "done-cur" : "done";
  return id === current ? "cur" : "ahead";
}

/** Tooltip for "Save checkpoint": a bookmark, which also clears the stage once its reading time is met. */
export function checkpointHint(r: { seconds: number; need: number } | undefined): string {
  if (!r) return "Save checkpoint";
  const left = r.need - r.seconds;
  return left <= 0 ? "Save checkpoint · clears this stage" : `Save checkpoint · resume here. The stage clears after ~${Math.max(1, Math.ceil(left / 60))} more min of reading`;
}

const glyphBase = "grid h-[18px] w-[18px] shrink-0 place-items-center text-[10px]";

export function StageGlyph({ state, className = "" }: { state: StageState; className?: string }) {
  if (state === "done")
    return (
      <span aria-hidden className={`${glyphBase} bg-fg text-bg ${className}`}>
        ✓
      </span>
    );
  if (state === "done-cur")
    return (
      <span aria-hidden className={`${glyphBase} bg-signal text-on-signal ${className}`}>
        ✓
      </span>
    );
  if (state === "cur")
    return (
      <span aria-hidden className={`${glyphBase} border border-signal text-signal-text ${styles.ring} ${className}`}>
        ▶
      </span>
    );
  return <span aria-hidden className={`${glyphBase} border border-dashed border-line-strong ${className}`} />;
}

/** Segmented progress bar: one segment per stage, width by minutes, fill by reading progress. */
export function StageSegments({ stages, className = "", height = "h-1" }: { stages: Stage[]; className?: string; height?: string }) {
  const { current, done, completed, reading } = useLessonProgress();
  return (
    <span aria-hidden className={`flex gap-[3px] ${className}`}>
      {stages.map((s) => {
        const isDone = completed || done.has(s.id);
        // fill = reading progress (time + coverage), so a jump never fills a segment
        const pct = isDone ? 100 : Math.round((reading[s.id]?.progress ?? 0) * 100);
        const ahead = !isDone && s.id !== current;
        return (
          <span key={s.id} className={`relative ${height} ${ahead ? "bg-surface-2" : "bg-line"}`} style={{ flex: `${Math.max(s.minutes, 6)} 1 0` }}>
            <span className={`absolute inset-y-0 left-0 ${isDone ? "bg-fg" : "bg-signal"}`} style={{ width: `${pct}%` }} />
          </span>
        );
      })}
    </span>
  );
}

/** True once `ref` has scrolled up under the top of the viewport (plus the header when shown). */
function usePast(ref: React.RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = ref.current;
      if (el) setPast(el.getBoundingClientRect().top < 72);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [ref]);
  return past;
}

/**
 * Pinned once the full rail has scrolled away: one thin line with the current stage, clickable
 * stage segments and the checkpoint button (phones: the strip that opens the contents sheet).
 * Rides directly under the site header, or at the very top while the header is slid away.
 */
function CompactStageBar({ show, onOpenContents }: { show: boolean; onOpenContents: () => void }) {
  const p = useLessonProgress();
  const { stages, current, done, completed, reading, minutesLeft, saveCheckpoint, ready } = p;
  const headerHidden = useChromeHidden();
  const line = stageLine(p);
  const numbered = numberedStages(p.required);
  const nDone = doneCount(p);
  const curDone = completed || done.has(current);
  const st = stageState(current, current, done, completed);
  return (
    <div
      data-stage-rail
      data-reader-ui
      data-focus-hide
      aria-hidden={!show || undefined}
      inert={!show || undefined}
      className={`fixed inset-x-0 z-40 border-b border-line bg-bg/95 backdrop-blur transition-[top,opacity] duration-200 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ top: headerHidden ? 0 : "var(--hk-header-h, 61px)" }}
    >
      <button
        type="button"
        onClick={onOpenContents}
        className="flex w-full flex-col gap-1.5 px-4 pb-2 pt-2 text-left lg:hidden"
        aria-label={`${line}. ${completed ? "All stages cleared" : `~${minutesLeft} min left`}. Open contents`}
      >
        <StageSegments stages={stages} className="w-full" height="h-[3px]" />
        <span className="flex w-full items-center justify-between gap-3 font-mono text-[11px] text-fg-2">
          <span className="truncate">
            {line}
            {!completed && ` · ~${minutesLeft} min left`}
          </span>
          <span className="shrink-0 text-fg-3">contents ▾</span>
        </span>
      </button>
      <div className="mx-auto hidden h-11 max-w-[1320px] items-center gap-4 px-6 lg:flex">
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <StageGlyph state={st} />
          <span className="truncate font-mono text-xs font-semibold text-fg">{line}</span>
          <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">{completed ? "all cleared" : `~${minutesLeft} min left · ${nDone}/${numbered.length}`}</span>
        </span>
        <ol aria-label="Lesson stages" className="m-0 flex min-w-0 flex-1 list-none gap-[3px] p-0">
          {stages.map((s) => {
            const isDone = completed || done.has(s.id);
            const pct = isDone ? 100 : Math.round((reading[s.id]?.progress ?? 0) * 100);
            return (
              <li key={s.id} className="flex" style={{ flex: `${Math.max(s.minutes, 6)} 1 0` }}>
                <button type="button" onClick={() => scrollToId(s.id)} title={`${s.label} · ${s.title}`} aria-label={`Go to ${s.label}, ${s.title}`} className="group flex h-6 w-full items-center">
                  <span className={`relative h-1 w-full group-hover:h-1.5 ${!isDone && s.id !== current ? "bg-surface-2" : "bg-line"}`}>
                    <span className={`absolute inset-y-0 left-0 ${isDone ? "bg-fg" : "bg-signal"}`} style={{ width: `${pct}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={saveCheckpoint}
          disabled={!ready || curDone}
          title={curDone ? undefined : checkpointHint(reading[current])}
          className={`min-h-8 shrink-0 px-3 text-[13px] font-semibold ${curDone ? "border border-line-strong text-fg-2" : "bg-signal text-on-signal hover:brightness-110"} disabled:cursor-default`}
        >
          {completed ? "Cleared ✓" : curDone ? "Read ✓" : "Save checkpoint"}
        </button>
      </div>
    </div>
  );
}

export default function StageRail({ onOpenContents }: { onOpenContents: () => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const past = usePast(endRef);
  const p = useLessonProgress();
  const { stages, required, current, done, completed, minutesLeft, saveCheckpoint, ready, reading } = p;
  const main = stages.filter((s) => !isOptionalStage(s));
  const optional = stages.filter(isOptionalStage);
  const numbered = numberedStages(required);
  const line = stageLine(p);
  const nDone = doneCount(p);
  const curDone = completed || done.has(current);
  const leftLine = completed ? "all stages cleared" : `~${minutesLeft} min left · ${nDone}/${numbered.length} done`;

  return (
    <>
      <div data-reader-ui className="border-y border-line bg-bg">
        {/* phones: compact strip, opens the contents sheet */}
        <button type="button" onClick={onOpenContents} className="flex w-full flex-col gap-1.5 px-4 pb-2.5 pt-2 text-left lg:hidden" aria-label={`${line}. ${leftLine}. Open contents`}>
          <StageSegments stages={stages} className="w-full" />
          <span className="flex w-full items-center justify-between gap-3 font-mono text-[11px] text-fg-2">
            <span className="truncate">
              {line}
              {!completed && ` · ~${minutesLeft} min left`}
            </span>
            <span className="shrink-0 text-fg-3">contents ▾</span>
          </span>
        </button>

        {/* desktop: full stage rail */}
        <div className="mx-auto hidden max-w-[1320px] flex-col gap-2.5 px-6 pt-2.5 lg:flex">
          <div className="flex items-stretch gap-4">
            <div className="flex min-w-[150px] shrink-0 flex-col justify-center gap-0.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Stages</span>
              <span className="font-mono text-sm font-semibold text-fg">{line}</span>
              <span className="font-mono text-xs text-fg-3">{leftLine}</span>
            </div>
            <ol aria-label="Lesson stages" className={`m-0 flex min-w-0 flex-1 list-none gap-1.5 overflow-x-auto p-0 ${styles.rail}`}>
              {main.map((s) => {
                const st = stageState(s.id, current, done, completed);
                const word = st === "cur" || st === "done-cur" ? "current" : st === "done" ? "done" : "ahead";
                const box =
                  st === "done"
                    ? "border border-line bg-surface text-fg-2"
                    : st === "ahead"
                      ? "border border-dashed border-line-strong text-fg-3"
                      : "border border-signal bg-surface-2 text-fg shadow-[0_0_0_3px_rgba(255,107,43,0.16)]";
                return (
                  <li key={s.id} className="flex min-w-[150px] flex-1">
                    <button
                      type="button"
                      onClick={() => scrollToId(s.id)}
                      aria-current={s.id === current ? "step" : undefined}
                      aria-label={`${s.label}, ${s.title}, ${s.minutes} minutes, ${word}`}
                      className={`flex min-h-[58px] w-full flex-col items-start gap-1 px-2.5 py-2 text-left ${box} hover:border-fg-3`}
                    >
                      <span className="flex w-full items-center gap-1.5">
                        <StageGlyph state={st} />
                        <span className="whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.04em]">{s.label}</span>
                        <span className="flex-1" />
                        <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">{s.budgetMinutes ?? s.minutes} min</span>
                      </span>
                      <span className="line-clamp-1 text-[13px] leading-tight">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {optional.length > 0 && (
              <div className="flex shrink-0 flex-col justify-center gap-0.5 border border-dashed border-line-strong px-3">
                <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-label text-fg-3">Optional · {optional.reduce((n, s) => n + s.minutes, 0)} min</span>
                <span className="flex gap-2.5">
                  {optional.map((s) => (
                    <button key={s.id} type="button" onClick={() => scrollToId(s.id)} className="min-h-7 whitespace-nowrap text-[13px] text-fg-2 underline-offset-2 hover:text-fg hover:underline">
                      {s.label}
                    </button>
                  ))}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={saveCheckpoint}
              disabled={!ready || curDone}
              title={curDone ? undefined : checkpointHint(reading[current])}
              className={`min-h-11 shrink-0 self-center px-4 text-sm font-semibold ${curDone ? "border border-line-strong text-fg-2" : "bg-signal text-on-signal hover:brightness-110"} disabled:cursor-default`}
            >
              {completed ? "Cleared ✓" : curDone ? "Read ✓" : "Save checkpoint"}
            </button>
          </div>
          <div role="progressbar" aria-label="Lesson progress by stage" aria-valuemin={0} aria-valuemax={numbered.length} aria-valuenow={completed ? numbered.length : nDone} className="-mb-px">
            <StageSegments stages={stages} />
          </div>
        </div>
      </div>
      <div ref={endRef} aria-hidden />
      <CompactStageBar show={past} onOpenContents={onOpenContents} />
    </>
  );
}
