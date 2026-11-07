"use client";

/**
 * Interview mode: a timer against the lab's interview minutes, no hints and no solution, then the
 * interviewer's follow-ups one at a time (with their extra tests where the lab has them), and a short
 * scored summary. State lives in progress.ts (hk.labs.iv.v1); a pass also goes in the game state.
 */
import { useState } from "react";
import { Check, Clock, Flag, MessageSquare, Play, X } from "lucide-react";
import { INTERVIEW_PASS_SCORE } from "@/lib/learn/labs/types";
import type { InterviewLive, InterviewResult } from "@/lib/learn/labs/progress";
import "@/app/learn/course-content.css";

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function InterviewBar({ live, now, targetMs, followTotal, onEnd }: { live: InterviewLive; now: number; targetMs: number; followTotal: number; onEnd: () => void }) {
  const ms = now - live.startedAt;
  const over = ms > targetMs;
  const pct = Math.min(100, (ms / targetMs) * 100);
  const phase = live.baseMs == null ? "Coding: pass every test" : followTotal ? `Follow-up ${Math.min(live.followIdx + 1, followTotal)} of ${followTotal}` : "Wrapping up";
  return (
    <div className="sticky top-[var(--hk-header-h,61px)] z-20 -mx-4 flex flex-col border-y border-signal bg-surface px-4 sm:-mx-6 sm:px-6" role="status" aria-label="Interview in progress" data-hk-interview-bar="">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <span aria-hidden className="inline-block h-2 w-2 animate-pulse bg-signal" /> interview<span className="hidden sm:inline"> mode</span>
        </span>
        <span className={`inline-flex items-center gap-1.5 font-mono text-[20px] font-semibold tabular-nums ${over ? "text-bad-text" : "text-fg"}`}>
          <Clock className="h-4 w-4" aria-hidden />
          {fmtClock(ms)}
          <span className="text-[13px] font-normal text-fg-3">/ {fmtClock(targetMs)}</span>
        </span>
        <span className="hidden text-[13px] text-fg-2 sm:inline">{phase}</span>
        <span className="hidden font-mono text-[11px] text-fg-3 md:inline">
          {live.runs} run{live.runs === 1 ? "" : "s"} · no hints, no solution
        </span>
        <button type="button" onClick={onEnd} className="ml-auto inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3">
          <Flag className="h-3.5 w-3.5" aria-hidden /> End<span className="hidden sm:inline"> interview</span>
        </button>
      </div>
      <div className="h-1 w-full bg-line" aria-hidden>
        <div className={`h-full ${over ? "bg-bad" : "bg-signal"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The current follow-up: a question, and either its tests to pass or an answer to give. */
export function FollowUpCard({
  index,
  total,
  title,
  promptHtml,
  answerHtml,
  hasTests,
  testsCount,
  onAnswered,
  onSkip,
}: {
  index: number;
  total: number;
  title: string;
  promptHtml: string;
  answerHtml: string;
  hasTests: boolean;
  testsCount: number;
  onAnswered: (covered: boolean | null, answered: boolean) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  return (
    <section aria-label="Interviewer follow-up" className="flex min-w-0 flex-col gap-3 border border-signal bg-surface p-4" data-hk-followup="">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> interviewer · follow-up {index + 1} of {total}
      </span>
      <h2 className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">{title}</h2>
      <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: promptHtml }} />
      {hasTests ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13.5px] leading-relaxed text-fg-2">
            Change your code, then run the tests: {testsCount} new test{testsCount === 1 ? "" : "s"} for this follow-up run with the lab&apos;s own, which must keep passing.
          </p>
          <button type="button" onClick={onSkip} className="self-start font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            skip this follow-up (it scores nothing)
          </button>
        </div>
      ) : !revealed ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="hk-fu-answer" className="text-[13.5px] text-fg-2">
            Answer as you would out loud. A few lines is enough; nothing is sent anywhere.
          </label>
          <textarea id="hk-fu-answer" value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full min-w-0 resize-y border border-line bg-bg p-2.5 text-[15px] leading-relaxed text-fg" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!text.trim()} onClick={() => setRevealed(true)} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
              Submit answer
            </button>
            <button type="button" onClick={onSkip} className="min-h-11 border border-line-strong px-3 font-mono text-xs text-fg-3 hover:text-fg">
              skip
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="border-l-2 border-ok bg-raised p-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-ok-text">what a strong answer covers</span>
            <div className="course-content mt-1.5 max-w-none text-[14.5px]" dangerouslySetInnerHTML={{ __html: answerHtml || "<p>The interviewer would move on here.</p>" }} />
          </div>
          <span className="text-[13.5px] text-fg-2">Be honest: did your answer cover that?</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onAnswered(true, true)} className="inline-flex min-h-11 items-center gap-1.5 bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
              <Check className="h-4 w-4" aria-hidden /> Yes, mostly
            </button>
            <button type="button" onClick={() => onAnswered(false, true)} className="inline-flex min-h-11 items-center gap-1.5 border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
              <X className="h-4 w-4" aria-hidden /> I missed some
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function InterviewSummary({ r, best, onAgain, onClose }: { r: InterviewResult; best: InterviewResult | undefined; onAgain: () => void; onClose: () => void }) {
  const tone = r.score >= INTERVIEW_PASS_SCORE ? "text-ok-text" : r.score >= 60 ? "text-signal-text" : "text-bad-text";
  return (
    <section aria-label="Interview result" className="flex min-w-0 flex-col gap-4 border-2 border-signal bg-surface p-4 sm:p-5" data-hk-interview-summary="">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">interview result</span>
          <span className={`font-display text-[44px] font-extrabold leading-none tracking-tightest ${tone}`}>
            {r.score}
            <span className="text-[20px] text-fg-3">/100</span>
          </span>
        </div>
        <div className="flex flex-col gap-1 pb-1">
          <span className={`font-display text-[22px] font-bold leading-tight ${tone}`}>{r.grade}</span>
          <span className="font-mono text-[12px] text-fg-3">
            {r.passed ? "interview pass" : "not a pass yet"} · best {best ? best.score : r.score}
          </span>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <Stat label="time" value={fmtClock(r.ms)} sub={`target ${fmtClock(r.targetMs)}`} bad={r.ms > r.targetMs} />
        <Stat label="runs" value={String(r.runs)} sub={`${r.failedRuns} failed`} bad={r.failedRuns > 3} />
        <Stat label="tests" value={r.ms ? "all pass" : "–"} sub={r.lang} />
        <Stat
          label="follow-ups"
          value={r.followUps.length ? `${r.followUps.filter((f) => f.passed || f.covered).length}/${r.followUps.length}` : "none"}
          sub={r.followUps.length ? "passed or covered" : "this lab has none"}
        />
      </dl>
      {r.followUps.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px]">
          {r.followUps.map((f, k) => (
            <li key={k} className="flex items-center gap-2 text-fg-2">
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center font-mono text-[11px] ${f.passed || f.covered ? "bg-ok text-on-ok" : f.answered ? "bg-signal text-on-signal" : "bg-line-strong text-fg-3"}`}>
                {f.passed || f.covered ? "✓" : f.answered ? "½" : "–"}
              </span>
              <span className="min-w-0 flex-1">{f.title}</span>
              <span className="font-mono text-[11px] text-fg-4">{f.tests ? (f.passed ? "tests pass" : "skipped") : f.covered ? "covered" : f.answered ? "partly" : "skipped"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[12px] leading-snug text-fg-3">Score: passing 45 · time against the target 20 · clean runs 10 · follow-ups 25 (labs without follow-ups weigh time and runs instead). {INTERVIEW_PASS_SCORE}+ is a pass and earns the interview badge.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
          Back to practice
        </button>
        <button type="button" onClick={onAgain} className="inline-flex min-h-11 items-center gap-1.5 border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
          <Play className="h-4 w-4" aria-hidden /> Interview again
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface p-3">
      <dt className="font-mono text-[10px] uppercase tracking-label text-fg-3">{label}</dt>
      <dd className={`m-0 font-mono text-[18px] font-semibold ${bad ? "text-bad-text" : "text-fg"}`}>{value}</dd>
      <dd className="m-0 truncate font-mono text-[11px] text-fg-4">{sub}</dd>
    </div>
  );
}
