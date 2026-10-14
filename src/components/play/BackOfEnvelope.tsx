"use client";

import { useState } from "react";
import { BTN_GHOST, BTN_PRIMARY, type GameProps } from "./shared";

type Q = { q: string; opts: string[]; answer: number; math: string };

const QUESTIONS: Q[] = [
  {
    q: "2 billion users send 50 messages a day. Average messages per second?",
    opts: ["12k/s", "120k/s", "1.2M/s", "12M/s"],
    answer: 2,
    math: "2e9 × 50 = 1e11 a day ÷ 86,400 s ≈ 1.16M/s",
  },
  {
    q: "Store 1 billion photos at 2 MB each. How much disk, before replication?",
    opts: ["2 TB", "20 TB", "200 TB", "2 PB"],
    answer: 3,
    math: "1e9 × 2e6 B = 2e15 B = 2 PB",
  },
  {
    q: "10M daily users make 20 API calls each; peak is 3× average. Peak QPS?",
    opts: ["700", "7k", "70k", "700k"],
    answer: 1,
    math: "2e8 a day ÷ 86,400 ≈ 2.3k/s average × 3 ≈ 6.9k/s",
  },
  {
    q: "A 1 Gbps link carrying 1 KB messages. Messages per second, max?",
    opts: ["1.25k", "12.5k", "125k", "1.25M"],
    answer: 2,
    math: "1 Gbps = 125 MB/s ÷ 1 KB ≈ 125k/s",
  },
  {
    q: "Tatkal: 2M users each send 5 requests in the first 60 seconds. Average req/s?",
    opts: ["1.7k", "17k", "170k", "1.7M"],
    answer: 2,
    math: "1e7 requests ÷ 60 s ≈ 167k/s, and the first 10 s are far worse",
  },
];
const TOTAL = QUESTIONS.length;
const WIN = 4;

export default function BackOfEnvelope({ onWin }: GameProps) {
  const [eq, setEq] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const over = eq >= TOTAL;
  const cur = QUESTIONS[Math.min(eq, TOTAL - 1)];
  const answered = pick !== null;

  const choose = (k: number) => {
    if (answered) return;
    setPick(k);
    if (k === cur.answer) setScore(score + 1);
  };

  const next = () => {
    const n = eq + 1;
    setEq(n);
    setPick(null);
    if (n >= TOTAL && score >= WIN) onWin(score, `${score}/${TOTAL}`);
  };

  const reset = () => {
    setEq(0);
    setPick(null);
    setScore(0);
  };

  return (
    <>
      <div className="flex justify-between font-mono text-[13px] text-fg-3">
        <span>
          question {Math.min(eq + 1, TOTAL)}/{TOTAL}
        </span>
        <span>
          score <span className="font-semibold text-signal-text">{score}</span>
        </span>
      </div>

      {!over && (
        <>
          <span className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-fg sm:text-[30px]">{cur.q}</span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
            {cur.opts.map((t, k) => {
              const style =
                answered && k === cur.answer
                  ? "border-signal bg-signal text-on-signal"
                  : answered && k === pick
                    ? "border-bad bg-bg text-fg"
                    : "border-line-strong bg-bg text-fg hover:bg-surface-2";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => choose(k)}
                  disabled={answered}
                  aria-pressed={answered ? k === pick : undefined}
                  className={`min-h-16 border font-mono text-xl font-semibold disabled:cursor-default ${style}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {answered && (
            <>
              <div className="flex flex-col gap-1.5 border border-line bg-bg p-3.5" aria-live="polite">
                <span className="font-semibold text-fg">{pick === cur.answer ? "Right order of magnitude." : "Off by 10×."}</span>
                <span className="font-mono text-[13px] leading-[1.6] text-fg-2">{cur.math}</span>
              </div>
              <button type="button" onClick={next} className={`${BTN_PRIMARY} min-h-12 self-start`}>
                {eq >= TOTAL - 1 ? "see score" : "next estimate"}
              </button>
            </>
          )}
        </>
      )}

      {over && (
        <>
          <span className="font-display text-[clamp(32px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">
            {score}/{TOTAL} within an order of magnitude.
          </span>
          <span className="text-base text-fg-2">
            {score >= WIN
              ? "Staff-level napkin. You would pass the estimation round."
              : "Memorize three numbers: 86,400 seconds a day, 125 MB/s per Gbps, 1e9 × 1 KB = 1 TB."}
          </span>
          <button type="button" onClick={reset} className={`${BTN_GHOST} min-h-12 self-start`}>
            play again
          </button>
        </>
      )}
    </>
  );
}
