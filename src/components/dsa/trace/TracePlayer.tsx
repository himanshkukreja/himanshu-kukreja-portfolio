"use client";

/**
 * The predict-the-next-step player (plan §3.6), driven by a generated trace (dsa-mastery generated/traces/<id>.json):
 * the array with its window, the pointers, the value leaving and joining, and the variable table, frame by frame.
 *
 *   mode "predict"  frames with an `ask` stop before they are shown: pick the next value; a wrong pick names the
 *                   mistake it stands for (`why`), and the frame reveals once you have it right.
 *   mode "watch"    step through freely.
 *   mode "hand"     the hand-solve sheet: type the asked variable (the running total) for each step yourself.
 *
 * Client-only (loaded with next/dynamic, ssr:false). Keyboard: every control is a button; the note is announced.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { DSA_XP, type Trace, type TraceFrame } from "@/lib/dsa/types";

type Mode = "predict" | "watch" | "hand";

const fmt = (v: unknown) => (v === null || v === undefined ? "–" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

function arrayInput(trace: Trace): { name: string; values: unknown[] } | null {
  for (const [name, v] of Object.entries(trace.input)) if (Array.isArray(v)) return { name, values: v };
  return null;
}

/** The variable the hand sheet asks for: "window" (the running total) when there is one, else the last var. */
const handVar = (t: Trace) => (t.vars.includes("window") ? "window" : t.vars[t.vars.length - 1]);

function ArrayView({ trace, frame, hideWindow }: { trace: Trace; frame: TraceFrame; hideWindow?: boolean }) {
  const arr = arrayInput(trace);
  if (!arr) return null;
  const win = frame.view.window;
  const ptr = frame.view.pointers || {};
  const byIndex: Record<number, string[]> = {};
  for (const [k, i] of Object.entries(ptr)) (byIndex[i] ||= []).push(k);
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`${arr.name}: ${arr.values.join(", ")}`}>
        {arr.values.map((v, i) => {
          const inWin = !hideWindow && win && i >= win[0] && i <= win[1];
          const leaving = frame.view.leaving === i;
          const joining = frame.view.joining === i;
          return (
            <li key={i} className="flex w-12 shrink-0 flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-fg-4">{i}</span>
              <span
                className={`grid h-12 w-12 place-items-center border-2 font-mono text-[16px] font-semibold ${
                  leaving ? "border-bad text-bad-text line-through" : joining ? "border-signal bg-signal text-on-signal" : inWin ? "border-signal bg-[var(--c-dsa-hl)] text-fg" : "border-line-strong text-fg-2"
                }`}
              >
                {fmt(v)}
              </span>
              <span className="min-h-[28px] text-center font-mono text-[10px] uppercase leading-tight tracking-label text-signal-text">
                {(byIndex[i] || []).join(" ")}
                {leaving ? <span className="block text-bad-text">leaves</span> : null}
                {joining ? <span className="block">joins</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function TracePlayer({ trace, mode = "predict", conceptId }: { trace: Trace; mode?: Mode; conceptId: string }) {
  const frames = trace.frames;
  const [i, setI] = useState(0);
  /** frame index → solved (predict: picked the right value; hand: typed it) */
  const [solved, setSolved] = useState<Record<number, boolean>>({});
  const [firstTry, setFirstTry] = useState<Record<number, boolean>>({});
  const [wrong, setWrong] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const { awardOnce } = useGame();
  const hv = handVar(trace);

  const asks = useMemo(() => frames.map((f, k) => (mode === "predict" ? !!f.ask : mode === "hand" ? k === 0 || f.state[hv] !== frames[k - 1].state[hv] : false)), [frames, mode, hv]);
  const totalAsks = asks.filter(Boolean).length;
  const pending = asks[i] && !solved[i];
  const frame = frames[i];
  const prev = i > 0 ? frames[i - 1] : null;
  const done = i === frames.length - 1 && !pending;
  const firstRight = Object.values(firstTry).filter(Boolean).length;

  const finish = useCallback(
    (score: number) => {
      track("dsa_predict", { trace: trace.id, concept: conceptId, mode, score, of: totalAsks });
      if (mode !== "watch" && totalAsks > 0 && score === totalAsks) awardOnce(`dsa:tr:${trace.id}`, DSA_XP.trace, "Dry run · every step predicted");
    },
    [trace.id, conceptId, mode, totalAsks, awardOnce],
  );

  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    finish(firstRight);
  }, [done, firstRight, finish]);

  const answer = (right: boolean, why?: string) => {
    if (firstTry[i] === undefined) setFirstTry((f) => ({ ...f, [i]: right }));
    if (right) {
      setSolved((s) => ({ ...s, [i]: true }));
      setWrong(null);
      setTyped("");
    } else setWrong(why || "Not quite. Look at what leaves and what joins.");
  };

  const next = () => {
    if (pending || i >= frames.length - 1) return;
    setWrong(null);
    setI(i + 1);
  };
  const back = () => {
    setWrong(null);
    setI(Math.max(0, i - 1));
  };
  const restart = () => {
    reported.current = false;
    setI(0);
    setSolved({});
    setFirstTry({});
    setWrong(null);
    setTyped("");
  };

  // while asking, the asked variable is hidden in the table
  const askVar = pending ? (mode === "predict" ? frame.ask?.var : hv) : null;
  const shownVars = trace.vars;

  return (
    <div className="dsa-ui flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          {mode === "hand" ? "Hand-solve sheet" : mode === "predict" ? "Predict the next step" : "Dry run"} · step {i + 1} of {frames.length}
        </span>
        {totalAsks > 0 && (
          <span className="font-mono text-[11px] text-fg-3">
            {firstRight}/{totalAsks} first try
          </span>
        )}
      </div>
      <p className="m-0 text-[15px] font-semibold text-fg">{trace.title}</p>

      <ArrayView trace={trace} frame={pending && prev && mode === "predict" ? { ...frame, view: { ...frame.view } } : frame} />

      <table className="w-full max-w-[520px] border-collapse font-mono text-[13px]">
        <thead>
          <tr>
            {shownVars.map((v) => (
              <th key={v} scope="col" className="border border-line px-2 py-1.5 text-left font-medium text-fg-3">
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {shownVars.map((v) => {
              const changed = prev && prev.state[v] !== frame.state[v];
              return (
                <td key={v} className={`border border-line px-2 py-1.5 ${changed && !pending ? "bg-[var(--c-dsa-hl)] font-semibold text-fg" : "text-fg-2"}`}>
                  {askVar === v ? "?" : fmt(frame.state[v])}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {pending && mode === "predict" && frame.ask && (
        <div className="flex flex-col gap-3 border border-signal bg-bg p-4" role="group" aria-label="Your prediction">
          <p className="m-0 text-[15px] font-semibold text-fg">{frame.ask.prompt}</p>
          <div className="flex flex-wrap gap-2">
            {frame.ask.choices.map((c) => (
              <button
                key={String(c.value)}
                type="button"
                onClick={() => answer(c.correct, c.why)}
                className="min-h-11 min-w-14 border-2 border-line-strong bg-surface px-3 font-mono text-[15px] text-fg hover:border-signal"
              >
                {fmt(c.value)}
              </button>
            ))}
          </div>
        </div>
      )}
      {pending && mode === "hand" && (
        <form
          className="flex flex-wrap items-end gap-2 border border-signal bg-bg p-4"
          onSubmit={(e) => {
            e.preventDefault();
            answer(String(frame.state[hv]) === typed.trim(), `Not quite. Add up the values in the window by hand (indexes ${frame.view.window?.join(" to ")}).`);
          }}
        >
          <label className="flex flex-col gap-1 text-[14px] text-fg">
            {hv === "window" ? `Total of the window, indexes ${frame.view.window?.join(" to ")}` : `Value of ${hv}`}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="numeric"
              className="min-h-11 w-32 border border-line-strong bg-surface px-3 font-mono text-[15px] text-fg focus:border-signal focus:outline-none"
            />
          </label>
          <button type="submit" className="min-h-11 bg-signal px-4 font-semibold text-on-signal">
            Check
          </button>
          <button type="button" onClick={() => answer(true)} className="min-h-11 px-2 font-mono text-[12px] text-fg-3 underline">
            show me
          </button>
        </form>
      )}
      <p aria-live="polite" className={`m-0 min-h-[1.5em] text-[14px] ${wrong ? "text-bad-text" : "text-fg-2"}`}>
        {wrong ? `✗ ${wrong.charAt(0).toUpperCase()}${wrong.slice(1)}.` : pending ? "" : `${asks[i] ? "✓ " : ""}${frame.note}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={back} disabled={i === 0} className="min-h-11 border border-line-strong px-4 text-[14px] text-fg disabled:opacity-40">
          ← Back
        </button>
        <button type="button" onClick={next} disabled={pending || i >= frames.length - 1} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal disabled:opacity-40">
          {asks[i + 1] && i < frames.length - 1 ? "Next: predict →" : "Next step →"}
        </button>
        <button type="button" onClick={restart} className="min-h-11 px-3 font-mono text-[12px] text-fg-3 underline">
          restart
        </button>
        {done && totalAsks > 0 && (
          <span className="font-mono text-[12px] text-ok-text">
            Finished: {firstRight} of {totalAsks} on the first try{trace.result !== undefined ? ` · result ${fmt(trace.result)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
