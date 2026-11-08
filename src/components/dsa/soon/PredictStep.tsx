"use client";

/**
 * A taste of the "predict the next step" dry runs (plan §3.5, the sliding-window lesson): Kestrel Stream's
 * hourly play starts, a three-hour window, and the learner predicts each new sum before it is shown.
 * Self-contained and client-only; nothing is saved.
 */
import { useState } from "react";

const PLAYS = [4, 2, 7, 1, 8, 3];
const K = 3;
const SUMS = PLAYS.slice(0, PLAYS.length - K + 1).map((_, i) => PLAYS.slice(i, i + K).reduce((a, b) => a + b, 0));
/** answer options per slide (step 1..3), the right one included */
const OPTIONS: number[][] = [
  [10, 12, 14],
  [14, 16, 18],
  [12, 13, 15],
];
const BEST = Math.max(...SUMS);
const BEST_AT = SUMS.indexOf(BEST);

export default function PredictStep() {
  // step = index of the window being asked about (1..3); 0 = the first window, given
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const finished = step >= SUMS.length;
  const shown = finished ? BEST_AT : picked !== null ? step : step - 1;
  const leaving = finished ? -1 : step - 1;
  const joining = finished ? -1 : step + K - 1;
  const right = !finished && picked === SUMS[step];

  const next = () => {
    setPicked(null);
    setStep((s) => s + 1);
  };
  const restart = () => {
    setPicked(null);
    setStep(1);
  };

  return (
    <div className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Predict the next step</span>
        <span className="font-mono text-[11px] text-fg-3">
          window k = {K} · step {Math.min(step, SUMS.length - 1)} of {SUMS.length - 1}
        </span>
      </div>

      <p className="m-0 text-[14px] leading-relaxed text-fg-2">Hourly play starts on Kestrel Stream, in thousands. Find the busiest three-hour stretch.</p>

      <ol aria-label="Hourly play starts" className="m-0 grid list-none grid-cols-6 gap-1.5 p-0">
        {PLAYS.map((v, i) => {
          const inWindow = i >= shown && i < shown + K;
          const isLeaving = picked === null && i === leaving;
          const isJoining = picked === null && i === joining;
          return (
            <li key={i} className="flex flex-col items-center gap-1">
              <span
                className={`grid aspect-square w-full max-w-[64px] place-items-center border font-mono text-[18px] font-semibold sm:text-[22px] ${
                  inWindow ? "border-signal bg-signal/15 text-fg" : isJoining ? "border-dashed border-signal text-fg" : "border-line-strong text-fg-3"
                } ${isLeaving ? "opacity-50" : ""}`}
              >
                {v}
              </span>
              <span className="font-mono text-[10px] text-fg-4">h{i + 1}</span>
            </li>
          );
        })}
      </ol>

      <div aria-live="polite" className="flex min-h-[132px] flex-col gap-3">
        {finished ? (
          <>
            <p className="m-0 text-[15px] leading-relaxed text-fg">
              Best stretch: <span className="font-mono font-semibold text-signal-text">{BEST}</span>, hours {BEST_AT + 1} to {BEST_AT + K}. Each slide cost two operations, one out and
              one in, instead of re-adding the whole window.
            </p>
            <p className="m-0 font-mono text-xs text-fg-3">That is the sliding-window invariant. In the course, it comes next as a template in four languages.</p>
            <button type="button" onClick={restart} className="min-h-10 self-start border border-line-strong px-3.5 font-mono text-xs text-fg-2 hover:border-signal hover:text-fg">
              Run it again
            </button>
          </>
        ) : (
          <>
            <p className="m-0 text-[15px] leading-relaxed text-fg">
              The window sum is <span className="font-mono font-semibold">{SUMS[step - 1]}</span>. It slides right: <span className="font-mono">{PLAYS[leaving]}</span> leaves and{" "}
              <span className="font-mono">{PLAYS[joining]}</span> joins. What is the new sum?
            </p>
            <div className="flex flex-wrap gap-2">
              {OPTIONS[step - 1].map((o) => {
                const chosen = picked === o;
                const correct = picked !== null && o === SUMS[step];
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={picked !== null}
                    onClick={() => setPicked(o)}
                    className={`min-h-11 min-w-16 border px-4 font-mono text-[16px] font-semibold ${
                      correct ? "border-signal bg-signal text-on-signal" : chosen ? "border-bad text-bad-text" : "border-line-strong text-fg hover:border-signal"
                    } disabled:cursor-default`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="m-0 text-[14px] text-fg-2">
                  {right ? "Right. " : "Not quite. "}
                  <span className="font-mono">
                    {SUMS[step - 1]} − {PLAYS[leaving]} + {PLAYS[joining]} = {SUMS[step]}
                  </span>
                </p>
                <button type="button" onClick={next} className="min-h-10 bg-signal px-3.5 text-[14px] font-semibold text-on-signal hover:brightness-110">
                  {step + 1 < SUMS.length ? "Next step" : "See the result"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
