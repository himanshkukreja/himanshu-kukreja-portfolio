"use client";

import { useState } from "react";
import Link from "next/link";
import type { MCQQuestion } from "@/lib/mcq-parser";
import { mmss, passMark, type OptionLabel, type TrialPart } from "./engine";
import PartsStrip, { type PartView } from "./PartsStrip";

export type TrialResult = {
  attempt: number;
  picks: Record<number, OptionLabel>;
  flags: Record<number, boolean>;
  score: number;
  passed: boolean;
  /** XP awarded by this attempt (0 when not passed or already cleared) */
  award: number;
  alreadyCleared: boolean;
  bestCombo: number;
  /** cards sent to the review queue */
  queued: number;
  seconds: number;
  best: number;
};

type Props = {
  part: TrialPart;
  questions: MCQQuestion[];
  result: TrialResult;
  weekLabel: string;
  views: PartView[];
  hrefFor: (n: number) => string;
  now: number;
  cooldown: number;
  onRetry: () => void;
  continueHref: string;
  continueLabel: string;
  signedIn: boolean;
};

export default function TrialResults({ part, questions, result, weekLabel, views, hrefFor, now, cooldown, onRetry, continueHref, continueLabel }: Props) {
  const [showCorrect, setShowCorrect] = useState(false);
  const N = questions.length;
  const pm = passMark(N);
  const { score, passed, picks, flags } = result;
  const pct = N ? Math.round((score / N) * 100) : 0;
  const answered = questions.filter((q) => picks[q.number]).length;
  const skipped = N - answered;
  const wrong = answered - score;
  const passMarkPct = N ? (pm / N) * 100 : 80;

  const items = questions.map((q) => ({ q, p: picks[q.number], ok: !!picks[q.number] && picks[q.number] === q.correctAnswer, flag: !!flags[q.number] }));
  const miss = items.filter((t) => !t.ok);
  const flaggedOk = items.filter((t) => t.ok && t.flag);
  const okRest = items.filter((t) => t.ok && !t.flag);
  const nSkip = miss.filter((t) => !t.p).length;
  const text = (q: MCQQuestion, l?: OptionLabel) => (l ? q.options.find((o) => o.label === l)?.text ?? "" : "");
  // The parent has already stored this attempt, so `views` include it.
  const passedCount = views.filter((v) => v.state === "pass").length;

  const xpNote = result.award
    ? "First pass of this trial. The XP is yours; retakes only raise your best score."
    : passed
    ? "Already cleared earlier, XP is awarded once per trial. Your best score still updates."
    : "XP is awarded on a pass. Retry opens in 10 minutes with a new shuffle.";

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-stretch gap-8">
        <div className="flex min-w-0 flex-[999_1_600px] animate-hk-in flex-col gap-[18px]">
          <span className="font-mono text-xs uppercase tracking-label text-fg-3">
            Trial result · Part {part.n} · {part.title} · attempt {result.attempt}
          </span>
          <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
            <span className="font-display text-[clamp(76px,11vw,160px)] font-extrabold leading-[0.8] tracking-[-0.04em] text-fg">
              {score}
              <span className="text-fg-4">/{N}</span>
            </span>
            <div className="flex flex-col gap-2.5 pb-1.5">
              <span
                className={`self-start px-3 py-[7px] font-mono text-sm font-semibold tracking-label ${passed ? "bg-ok text-[#04140B]" : "border border-bad text-bad-text"}`}
              >
                {passed ? "PASSED ✓" : "NOT YET ✕"}
              </span>
              <span className="font-mono text-[28px] font-semibold text-fg">{pct}%</span>
            </div>
          </div>
          <div className="flex max-w-[720px] flex-col gap-2">
            <div role="img" aria-label={`${score} of ${N} correct, pass mark ${pm}`} className="relative h-3.5 bg-surface-2">
              <div className={`h-3.5 ${passed ? "bg-ok" : "bg-bad"}`} style={{ width: `${pct}%` }} />
              <div className="absolute -bottom-1.5 -top-1.5 w-0.5 bg-fg" style={{ left: `${passMarkPct}%` }} />
            </div>
            <div className="relative h-4 font-mono text-[11px] text-fg-3" aria-hidden="true">
              <span className="absolute left-0">0</span>
              <span className="absolute -translate-x-1/2 text-fg" style={{ left: `${passMarkPct}%` }}>
                PASS 80%
              </span>
              <span className="absolute right-0">{N}</span>
            </div>
          </div>
          <span className="text-base leading-normal text-fg-2">
            Scored against all {N} questions. {wrong} wrong{skipped ? `, ${skipped} skipped (counted as misses)` : ""}.{" "}
            {passed ? `Part ${part.n} is cleared and counts toward ${weekLabel}.` : `You need ${pm - score} more correct to pass.`}
          </span>
        </div>

        <div className="flex max-w-[440px] flex-[1_1_340px] flex-col gap-px border border-line bg-line">
          <div className="flex flex-col gap-1.5 bg-surface p-5">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">XP awarded</span>
            <span className={`font-display text-[56px] font-extrabold leading-none tracking-[-0.04em] ${result.award ? "text-signal-text" : "text-fg-3"}`}>
              +{result.award} XP
            </span>
            <span className="text-sm leading-normal text-fg-2">{xpNote}</span>
          </div>
          <Row label="Best score" value={`${result.best}/${N} · ${N ? Math.round((result.best / N) * 100) : 0}%`} />
          <Row label="Best combo" value={`×${result.bestCombo}`} />
          <Row label="Time" value={result.seconds >= 60 ? `${Math.round(result.seconds / 60)} min` : `${result.seconds} s`} />
          <Row label="Flagged" value={String(Object.values(flags).filter(Boolean).length)} />
          <Row label={`${weekLabel} trials`} value={`${passedCount} of ${views.length} passed`} />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border border-signal bg-surface px-6 py-5">
        <span className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
          <span className="text-[17px] font-semibold text-fg">
            {result.queued === 0
              ? "Clean run. Nothing added to your review queue."
              : `${result.queued} ${result.queued === 1 ? "question" : "questions"} added to your review queue`}
          </span>
          <span className="text-sm leading-normal text-fg-3">
            {result.queued === 0
              ? "Flagged questions still show below if you want another look."
              : `Misses${flaggedOk.length ? " and flagged answers" : ""} come back in your daily review, with the explanation one tap away.${nSkip ? ` Includes ${nSkip} skipped.` : ""}`}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/learn/review"
            className="inline-flex min-h-[52px] items-center border border-signal px-[18px] text-[15px] font-semibold text-signal-text no-underline hover:bg-surface-2"
          >
            Open review queue →
          </Link>
          <button
            type="button"
            onClick={onRetry}
            disabled={cooldown > 0}
            className="min-h-[52px] border border-line-strong px-[18px] text-[15px] text-fg hover:border-fg-3 disabled:cursor-not-allowed disabled:text-fg-3"
          >
            {cooldown > 0 ? `Retry in ${mmss(cooldown)}` : "Retry (shuffled)"}
          </button>
          <Link
            href={continueHref}
            className="inline-flex min-h-[52px] items-center bg-signal px-[22px] text-[15px] font-semibold text-on-signal no-underline hover:opacity-90"
          >
            {continueLabel} →
          </Link>
        </div>
      </section>

      <PartsStrip views={views} hrefFor={hrefFor} now={now} highlight={part.n} />

      <section aria-labelledby="rev-h" className="flex max-w-[980px] flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="rev-h" className="m-0 font-display text-[32px] font-bold tracking-[-0.025em] text-fg">
            Review, misses first
          </h2>
          <span className="font-mono text-xs text-fg-3">
            {miss.length} missed · {flaggedOk.length} flagged · {okRest.length} more correct
          </span>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {miss.concat(flaggedOk).map(({ q, p, ok, flag }) => (
            <li key={q.number} className={`border bg-surface px-5 py-[18px] ${ok ? "border-line-strong" : "border-bad/50"}`}>
              <div className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className={`grid h-[30px] w-[30px] shrink-0 place-items-center font-mono text-sm font-semibold ${ok ? "bg-ok text-[#04140B]" : "bg-bad text-[#1A0405]"}`}
                >
                  {ok ? "✓" : "✕"}
                </span>
                <div className="flex min-w-0 flex-grow flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-[0.06em]">
                    <span className="text-fg-3">Q{q.number}</span>
                    <span className={ok ? "text-ok" : "text-bad-text"}>{ok ? "CORRECT · FLAGGED" : !p ? "SKIPPED · COUNTS AS A MISS" : "WRONG · ADDED TO REVIEW"}</span>
                    {flag && <span className="text-signal-text">⚑ flagged</span>}
                  </div>
                  <span className="text-[17px] font-semibold leading-snug text-fg">{q.text}</span>
                  {p && !ok && (
                    <span className="flex gap-2.5 text-[15px] leading-normal text-bad-text">
                      <span className="w-[74px] shrink-0 pt-[3px] font-mono text-xs">YOU ✕</span>
                      <span>{text(q, p)}</span>
                    </span>
                  )}
                  <span className="flex gap-2.5 text-[15px] leading-normal text-fg">
                    <span className="w-[74px] shrink-0 pt-[3px] font-mono text-xs text-ok">ANSWER ✓</span>
                    <span>{text(q, q.correctAnswer)}</span>
                  </span>
                  {q.explanation && <span className="border-t border-line pt-2.5 text-[15px] leading-relaxed text-fg-2">{q.explanation}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {okRest.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowCorrect((v) => !v)}
              aria-expanded={showCorrect}
              className="min-h-[48px] self-start border border-line-strong px-4 text-sm text-fg hover:border-fg-3"
            >
              {showCorrect ? "Hide" : "Show"} {okRest.length} correct answers
            </button>
            {showCorrect && (
              <ol className="m-0 list-none border border-line bg-raised p-0">
                {okRest.map(({ q }) => (
                  <li key={q.number} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-line px-4 py-3 text-sm leading-snug last:border-b-0">
                    <span className="w-11 shrink-0 font-mono text-xs text-ok">✓ Q{q.number}</span>
                    <span className="min-w-0 flex-[1_1_300px] text-fg-2">{q.text}</span>
                    <span className="min-w-0 flex-[1_1_260px] text-fg-3">{text(q, q.correctAnswer)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between bg-surface px-5 py-3.5 text-sm">
      <span className="text-fg-3">{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}
