"use client";

import { useGame } from "@/game/GameProvider";
import { DEBRIEF_FLAG, type Debrief } from "./case-types";

const DEBRIEF_XP = 50;

function picks(v: unknown): Record<string, number> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
}

/** Optional end-of-story question from `debrief` frontmatter. One answer per case, persisted in game flags. */
export default function DebriefCard({ slug, caseId, debrief }: { slug: string; caseId: string; debrief: Debrief }) {
  const { hydrated, flags, setFlag, grant } = useGame();
  const all = picks(flags[DEBRIEF_FLAG]);
  const saved = hydrated ? all[slug] : undefined;
  const pick = typeof saved === "number" && saved >= 0 && saved < debrief.options.length ? saved : null;
  const answered = pick !== null;
  const right = answered && pick === debrief.answer;
  const correctKey = String.fromCharCode(65 + debrief.answer);

  const choose = (k: number) => {
    if (!hydrated || answered) return;
    // grant() before setFlag(): grant writes a whole state snapshot, setFlag is a functional update on top of it.
    if (k === debrief.answer) grant(DEBRIEF_XP, `Case closed · ${caseId}`);
    setFlag(DEBRIEF_FLAG, { ...all, [slug]: k });
  };

  return (
    <section aria-labelledby="debrief-h" className="flex flex-col gap-[18px] border border-line-strong bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label-mono text-signal-text">Debrief · close the case</span>
        <span className="font-mono text-xs text-fg-3">+{DEBRIEF_XP} XP for the right call</span>
      </div>
      <h2 id="debrief-h" className="m-0 font-display text-[22px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">
        {debrief.question}
      </h2>
      <div className="flex flex-col gap-2" role="group" aria-label="Answers">
        {debrief.options.map((text, k) => {
          const key = String.fromCharCode(65 + k);
          const isRight = answered && k === debrief.answer;
          const isChosenWrong = answered && pick === k && !isRight;
          const cls = isRight
            ? "border-signal bg-signal text-on-signal"
            : isChosenWrong
              ? "border-bad bg-bg text-fg"
              : "border-line-strong bg-bg text-fg-2 enabled:hover:border-fg-3 enabled:hover:text-fg";
          return (
            <button
              key={k}
              type="button"
              onClick={() => choose(k)}
              disabled={answered || !hydrated}
              aria-pressed={pick === k}
              className={`flex min-h-14 w-full items-center gap-3.5 border px-3.5 py-3 text-left text-[15px] leading-[1.4] disabled:cursor-default ${cls}`}
            >
              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center border border-current font-mono text-[13px] font-semibold">
                {key}
              </span>
              <span className="sr-only">Option {key}: </span>
              <span className="grow">{text}</span>
              {(isRight || isChosenWrong) && (
                <span className="shrink-0 font-mono text-xs">{isRight ? "CORRECT" : "NOT QUITE"}</span>
              )}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {answered && (
          <div className={`flex animate-hk-in flex-col gap-1.5 border bg-bg p-4 ${right ? "border-signal" : "border-line-strong"}`}>
            <span className="text-[15px] font-semibold">{right ? `Correct. +${DEBRIEF_XP} XP · ${caseId} closed.` : `Not quite. The answer is ${correctKey}.`}</span>
            {debrief.explain && <span className="text-[15px] leading-relaxed text-fg-2">{debrief.explain}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
