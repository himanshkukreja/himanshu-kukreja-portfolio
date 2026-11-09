"use client";

/**
 * The step player: plays any step-engine script (src/lib/dsa/viz) on its view. One player for the structure
 * sandboxes, the lessons' demos (::viz) and algorithm step-throughs.
 *
 * - Back / Next / Play-Pause / Restart, and the keyboard when the player has focus: ← → step, Space plays or pauses,
 *   Home and End jump. Every control is a real button with a label.
 * - The narration line is announced (aria-live); the picture carries a full text description (role="img").
 * - A live cost counter in the script's unit (pointer hops, comparisons, shifts) that pulses when it changes.
 * - Predict-then-reveal: a frame with an `ask` stops before it is shown; a wrong pick explains itself, the right one
 *   reveals the step. Auto-play pauses at every question.
 * - Motion follows prefers-reduced-motion (frames swap without tweening).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Frame, Script } from "@/lib/dsa/viz/types";
import { VIEWS } from "./views";

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/** 0 → 1 over `ms` each time `key` changes (1 at once with reduced motion). */
function useTween(key: unknown, ms: number, reduced: boolean): number {
  const [t, setT] = useState(1);
  // a new key starts the tween from 0 in the same render (React's "adjust state while rendering" pattern)
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setT(reduced ? 1 : 0);
  }
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setT(ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms, reduced]);
  return reduced ? 1 : t;
}

const fmt = (v: unknown) => (v === null || v === undefined ? "–" : Array.isArray(v) ? `[${v.join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function StepPlayer({
  script,
  autoPlay = false,
  stepMs = 1300,
  label,
  onDone,
  footer,
}: {
  script: Script;
  autoPlay?: boolean;
  stepMs?: number;
  /** an accessible name for the player ("Sandbox: insert 5 at the head") */
  label?: string;
  onDone?: () => void;
  footer?: React.ReactNode;
}) {
  const frames = script.frames as Frame<unknown>[];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [solved, setSolved] = useState<Record<number, boolean>>({});
  const [wrong, setWrong] = useState<string | null>(null);
  const [firstTry, setFirstTry] = useState<Record<number, boolean>>({});
  const reduced = useReducedMotion();
  const t = useTween(`${i}-${frames.length}-${script.title}`, 460, reduced);
  const doneRef = useRef(false);

  // a new script starts from the top (adjusted while rendering, not in an effect)
  const [current, setCurrent] = useState(script);
  if (current !== script) {
    setCurrent(script);
    setI(0);
    setSolved({});
    setFirstTry({});
    setWrong(null);
    setPlaying(autoPlay);
  }
  useEffect(() => {
    doneRef.current = false;
  }, [script]);

  const pending = !!frames[i]?.ask && !solved[i];
  const shownIdx = pending ? Math.max(0, i - 1) : i;
  const frame = frames[shownIdx];
  const prevFrame = shownIdx > 0 ? frames[shownIdx - 1] : null;
  const last = frames.length - 1;
  const done = i === last && !pending;
  const asks = useMemo(() => frames.filter((f) => f.ask).length, [frames]);
  const right = Object.values(firstTry).filter(Boolean).length;

  useEffect(() => {
    if (done && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  const next = useCallback(() => {
    setWrong(null);
    setI((k) => (frames[k]?.ask && !solved[k] ? k : Math.min(last, k + 1)));
  }, [frames, solved, last]);
  const back = useCallback(() => {
    setWrong(null);
    setPlaying(false);
    setI((k) => Math.max(0, k - 1));
  }, []);
  const restart = useCallback(() => {
    setWrong(null);
    setI(0);
    setSolved({});
    setFirstTry({});
    doneRef.current = false;
  }, []);

  // auto-play: one step every stepMs; it waits at a question (and goes on once it is answered) and stops at the end
  const running = playing && !pending && i < last;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(next, reduced ? stepMs * 0.8 : stepMs);
    return () => window.clearTimeout(id);
  }, [running, i, next, stepMs, reduced]);

  const pick = (c: { correct: boolean; why?: string; label: string }) => {
    if (firstTry[i] === undefined) setFirstTry((f) => ({ ...f, [i]: c.correct }));
    if (c.correct) {
      setSolved((s) => ({ ...s, [i]: true }));
      setWrong(null);
    } else setWrong(c.why || "Not quite. Look at the arrows before this step.");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    } else if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === "Home") {
      e.preventDefault();
      restart();
    } else if (e.key === "End" && !asks) {
      e.preventDefault();
      setI(last);
    }
  };

  const view = VIEWS[script.view] as { Component: React.ComponentType<{ state: unknown; prev: unknown; t: number }>; describe: (s: unknown) => string };
  // a new script is adopted while rendering: for that one pass `i` can still be past its end, so check the frame first
  if (!frame) return null;
  const costChanged = prevFrame ? prevFrame.cost !== frame.cost : false;

  return (
    <div
      role="group"
      aria-label={label || script.title}
      aria-roledescription="step player"
      tabIndex={0}
      onKeyDown={onKey}
      className="dsa-ui flex min-w-0 flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[12px] uppercase tracking-label text-fg-3">
          {script.title} · step {i + 1} of {frames.length}
          {asks > 0 ? ` · ${right}/${asks} predicted` : ""}
        </span>
        <span className="flex items-baseline gap-1.5 font-mono text-[12px] text-fg-3" aria-live="off">
          <span className={`inline-block min-w-[2ch] text-right text-[20px] font-bold text-fg transition-transform ${costChanged && t < 1 ? "scale-125 text-signal-text" : ""}`}>{frame.cost}</span>
          {script.costUnit}
        </span>
      </div>

      <div role="img" aria-label={view.describe(frame.state)} className="overflow-x-auto overscroll-x-contain border border-line bg-bg px-1 py-2">
        <view.Component state={frame.state} prev={prevFrame?.state ?? null} t={t} />
      </div>

      {frame.vars && Object.keys(frame.vars).length > 0 && (
        <table className="w-full max-w-[520px] table-fixed border-collapse font-mono text-[13px]">
          <tbody>
            <tr>
              {Object.entries(frame.vars).map(([k, v]) => (
                <td key={k} className="border border-line px-2 py-1 text-fg-2">
                  <span className="text-fg-3">{k}</span> {fmt(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {pending && frames[i].ask && (
        <div className="flex flex-col gap-3 border border-signal bg-bg p-3 sm:p-4" role="group" aria-label="Predict the next step">
          <p className="m-0 text-[15px] font-semibold text-fg">Predict: {frames[i].ask!.prompt}</p>
          <div className="flex flex-wrap gap-2">
            {frames[i].ask!.choices.map((c) => (
              <button key={c.label} type="button" onClick={() => pick(c)} className="min-h-11 min-w-14 border-2 border-line-strong bg-surface px-3 font-mono text-[15px] text-fg hover:border-signal">
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p aria-live="polite" className={`m-0 min-h-[3em] text-[15px] leading-snug sm:min-h-[1.5em] ${wrong ? "text-bad-text" : "text-fg"}`}>
        {wrong ? `✗ ${wrong.charAt(0).toUpperCase()}${wrong.slice(1)}.` : pending ? "" : `${frames[i].ask ? "✓ " : ""}${frame.note}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={back} disabled={i === 0} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg disabled:opacity-40" aria-label="Previous step">
          ← Back
        </button>
        <button
          type="button"
          onClick={() => (done ? (restart(), setPlaying(true)) : setPlaying(!running))}
          disabled={pending}
          className="min-h-11 min-w-[92px] border border-line-strong px-3 text-[14px] text-fg disabled:opacity-40"
          aria-pressed={running}
        >
          {running ? "❚❚ Pause" : done ? "↻ Replay" : "▶ Play"}
        </button>
        <button type="button" onClick={next} disabled={pending || i >= last} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal disabled:opacity-40" aria-label="Next step">
          {frames[i + 1]?.ask && i < last ? "Next: predict →" : "Next step →"}
        </button>
        <button type="button" onClick={restart} className="min-h-11 px-2 font-mono text-[12px] text-fg-3 underline">
          restart
        </button>
        {done && script.result && <span className="font-mono text-[12px] text-ok-text">Result: {script.result}</span>}
      </div>
      {footer}
    </div>
  );
}
