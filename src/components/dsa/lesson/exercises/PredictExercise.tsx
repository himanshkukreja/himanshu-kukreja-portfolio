"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import { answerMatches, type ExLang, type PredictEx } from "@/lib/dsa/exercises";
import { CODE, Explain, FOCUS_RING, PRIMARY, SECONDARY, Status } from "./ExerciseCard";

/** Predict the output: choices or an exact answer, then the reveal (with a link to the trace when one is given). */
export default function PredictExercise({ ex, lang, completed, onComplete, traceTitle }: { ex: PredictEx; lang: ExLang; completed: boolean; onComplete: () => void; traceTitle?: string }) {
  const code = ex.code[lang] || "";
  const [pick, setPick] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [given, setGiven] = useState<string | null>(completed ? ex.answer : null);
  const answered = given !== null;
  const right = answered && (ex.mode === "choices" ? given === ex.answer : answerMatches(given, ex.answer));

  const submit = (value: string) => {
    if (answered) return;
    setGiven(value);
    const ok = ex.mode === "choices" ? value === ex.answer : answerMatches(value, ex.answer);
    if (ok) onComplete();
    track("dsa_exercise", { kind: "predict", id: ex.id, result: ok ? "right" : "wrong" });
  };
  const again = () => {
    setGiven(null);
    setPick(null);
    setText("");
  };
  const openTrace = () => {
    const el = ex.trace ? document.querySelector<HTMLElement>(`figure[data-dsa="trace"][data-id="${CSS.escape(ex.trace)}"], figure[data-dsa="handsolve"][data-id="${CSS.escape(ex.trace)}"]`) : null;
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el?.focus?.({ preventScroll: true });
  };
  const traceThere = typeof document !== "undefined" && !!ex.trace && !!document.querySelector(`figure[data-dsa="trace"][data-id="${CSS.escape(ex.trace)}"], figure[data-dsa="handsolve"][data-id="${CSS.escape(ex.trace)}"]`);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-bg">
        <div role="list" className="m-0 list-none p-0 py-1.5" aria-label="Code">
          {code.split("\n").map((l, i) => (
            <div role="listitem" key={i} className="flex">
              <span aria-hidden className="w-10 shrink-0 select-none border-r border-line px-2 text-right font-mono text-[12px] leading-[1.6] text-fg-4">{i + 1}</span>
              <span className={`${CODE} px-3`}>{l || " "}</span>
            </div>
          ))}
        </div>
      </div>
      {ex.mode === "choices" ? (
        <div role="radiogroup" aria-label="What does it print?" className="grid gap-2 sm:grid-cols-2">
          {ex.choices.map((c, i) => {
            const chosen = answered && given === c.text;
            const state = answered ? (c.correct ? "right" : chosen ? "wrong" : "idle") : pick === i ? "pick" : "idle";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={answered ? chosen : pick === i}
                disabled={answered}
                onClick={() => {
                  setPick(i);
                  submit(c.text);
                }}
                className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left font-mono text-[14px] disabled:cursor-default ${FOCUS_RING} ${state === "right" ? "border-ok bg-ok/15 text-fg" : state === "wrong" ? "border-bad bg-bad/10 text-fg" : "border-line-strong bg-surface text-fg hover:bg-surface-2"}`}
              >
                <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11px] text-fg-3">{"ABCDEF"[i]}</span>
                <span className="min-w-0 break-words">{c.text}</span>
                {answered && c.correct ? <span className="ml-auto text-[11px] text-ok-text">answer</span> : answered && chosen ? <span className="ml-auto text-[11px] text-bad-text">your pick</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) submit(text);
          }}
        >
          <label className="sr-only" htmlFor={`ex-${ex.id}-answer`}>Your prediction</label>
          <input
            id={`ex-${ex.id}-answer`}
            value={answered ? given : text}
            onChange={(e) => setText(e.target.value)}
            disabled={answered}
            placeholder="Type exactly what it prints"
            autoComplete="off"
            spellCheck={false}
            className={`min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3 font-mono text-[14px] text-fg placeholder:text-fg-4 ${FOCUS_RING}`}
          />
          <button type="submit" disabled={answered || !text.trim()} className={PRIMARY}>Check</button>
        </form>
      )}
      <Status tone={answered ? (right ? "ok" : "bad") : "plain"}>
        {answered ? (right ? "Right." : ex.mode === "exact" ? `Not quite. It prints ${ex.answer}.` : "Not quite. The answer is highlighted.") : "Predict first, then it checks you."}
      </Status>
      {answered ? (
        <div className="flex flex-col gap-3">
          <Explain lines={ex.explain} tone={right ? "ok" : "bad"} />
          <div className="flex flex-wrap items-center gap-2">
            {ex.trace && traceThere ? (
              <button type="button" onClick={openTrace} className={SECONDARY}>
                Step through it: {traceTitle || ex.trace.replace(/-/g, " ")}
              </button>
            ) : null}
            {!right ? (
              <button type="button" onClick={again} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
