"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus } from "lucide-react";
import { track } from "@/lib/track";
import { checkOrder, seedOf, shuffleIndices, type ExLang, type OrderEx } from "@/lib/dsa/exercises";
import { Explain, FOCUS_RING, PRIMARY, SECONDARY, Status } from "./ExerciseCard";

type Where = "prog" | "tray";
type Result = ReturnType<typeof checkOrder>;

/**
 * Put it in order (a Parsons puzzle). Drag a line, or use the keyboard: Space or Enter picks a line up, the arrow keys move it
 * (Up/Down within a list, Right/Left between the program and the "Not needed" tray), Space or Escape puts it down. Each line also
 * has small up, down and not-needed buttons, which is the tap alternative.
 */
export default function OrderExercise({ ex, lang, completed, onComplete }: { ex: OrderEx; lang: ExLang; completed: boolean; onComplete: () => void }) {
  const lines = ex.code[lang]!;
  const sol = useMemo(() => lines.map((l, i) => (l.distractor ? -1 : i)).filter((i) => i >= 0), [lines]);
  const distractors = useMemo(() => lines.map((l, i) => (l.distractor ? i : -1)).filter((i) => i >= 0), [lines]);
  const start = () => shuffleIndices(lines.length, seedOf(ex.id + lang));
  const [prog, setProg] = useState<number[]>(() => (completed ? sol : start()));
  const [tray, setTray] = useState<number[]>(() => (completed ? distractors : []));
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [solved, setSolved] = useState(completed);
  const [revealed, setRevealed] = useState(false);
  const [checks, setChecks] = useState(0);
  const [live, setLive] = useState("");
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<{ where: Where; at: number } | null>(null);
  const locked = solved || revealed;

  const place = (line: number, to: Where, at: number) => {
    const fromProg = prog.includes(line);
    const p = prog.filter((x) => x !== line);
    const t = tray.filter((x) => x !== line);
    const list = to === "prog" ? p : t;
    const before = (fromProg ? prog : tray).indexOf(line);
    const sameList = fromProg === (to === "prog");
    const idx = Math.max(0, Math.min(list.length, sameList && before < at ? at - 1 : at));
    list.splice(idx, 0, line);
    setProg(to === "prog" ? list : p);
    setTray(to === "tray" ? list : t);
    setResult(null);
  };

  const move = (line: number, by: number) => {
    const inProg = prog.includes(line);
    const list = inProg ? prog : tray;
    const at = list.indexOf(line);
    const to = at + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[at], next[to]] = [next[to], next[at]];
    if (inProg) setProg(next);
    else setTray(next);
    setResult(null);
    setLive(`Moved to position ${to + 1} of ${next.length} in the ${inProg ? "program" : "tray"}.`);
  };

  const send = (line: number) => {
    const inProg = prog.includes(line);
    place(line, inProg ? "tray" : "prog", inProg ? tray.length : prog.length);
    setLive(inProg ? "Set aside as not needed." : "Put back in the program.");
  };

  const onKey = (e: React.KeyboardEvent, line: number) => {
    if (locked) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setLive(picked === line ? "Put down." : "Picked up. Use the arrow keys to move it, then press Space.");
      setPicked((p) => (p === line ? null : line));
      return;
    }
    if (picked !== line) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setPicked(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(line, e.key === "ArrowUp" ? -1 : 1);
    } else if ((e.key === "ArrowRight" && prog.includes(line)) || (e.key === "ArrowLeft" && tray.includes(line))) {
      e.preventDefault();
      send(line);
    }
  };

  const check = () => {
    const r = checkOrder(lines, prog, tray);
    setResult(r);
    setChecks((c) => c + 1);
    setPicked(null);
    if (r.ok) {
      setSolved(true);
      onComplete();
    }
    setLive(r.ok ? "Correct. Every line is in place." : r.firstWrong !== null && r.firstWrong < prog.length ? `Line ${r.firstWrong + 1} of your program is the first one out of place.` : "A line you need is still in the tray.");
    track("dsa_exercise", { kind: "order", id: ex.id, result: r.ok ? "right" : "wrong", checks: checks + 1 });
  };

  const showSolution = () => {
    setProg(sol);
    setTray(distractors);
    setResult(null);
    setPicked(null);
    setRevealed(true);
  };
  const reset = () => {
    setProg(start());
    setTray([]);
    setResult(null);
    setPicked(null);
    setSolved(false);
    setRevealed(false);
  };

  const wrongAt = result && !result.ok ? result.firstWrong : null;

  const row = (line: number, i: number, where: Where, n: number) => {
    const l = lines[line];
    const isPicked = picked === line;
    const isWrong = where === "prog" && wrongAt === i;
    const isRight = solved || revealed || (where === "prog" && wrongAt !== null && i < wrongAt);
    const state = isWrong ? "wrong" : isRight ? "ok" : "idle";
    const insertBefore = over?.where === where && over.at === i;
    return (
      <div role="listitem"
        key={line}
        draggable={!locked}
        onDragStart={(e) => {
          drag.current = line;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(line));
        }}
        onDragEnd={() => {
          drag.current = null;
          setOver(null);
        }}
        onDragOver={(e) => {
          if (drag.current === null) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setOver({ where, at: i + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (drag.current !== null) place(drag.current, where, over?.where === where ? over.at : i);
          drag.current = null;
          setOver(null);
        }}
        data-state={state}
        className={`flex items-stretch gap-1 rounded-lg border bg-surface ${insertBefore ? "shadow-[0_-3px_0_0_var(--c-signal)]" : ""} ${state === "wrong" ? "border-bad bg-bad/10" : state === "ok" ? "border-ok bg-ok/10" : isPicked ? "border-signal bg-[var(--c-dsa-hl)]" : "border-line"}`}
      >
        <button
          type="button"
          disabled={locked}
          aria-pressed={isPicked}
          aria-label={`${l.text.trim()}. ${where === "prog" ? `Position ${i + 1} of ${n} in your program.` : "In the not needed tray."}${state === "wrong" ? " The first line out of place." : ""}`}
          onKeyDown={(e) => onKey(e, line)}
          onClick={() => setPicked((p) => (p === line ? null : line))}
          className={`flex min-h-11 min-w-0 flex-1 cursor-grab items-center gap-2 rounded-lg px-2 text-left disabled:cursor-default ${FOCUS_RING}`}
        >
          <GripVertical className="h-4 w-4 shrink-0 text-fg-4" aria-hidden />
          <span className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[13px] leading-[1.5] text-fg">{l.text}</span>
          {state === "wrong" ? (
            <>
              <span className="hidden shrink-0 font-mono text-[11px] text-bad-text sm:inline">first one out of place</span>
              <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bad font-mono text-[11px] font-bold text-on-bad sm:hidden">
                !
              </span>
            </>
          ) : null}
        </button>
        {!locked ? (
          <span className="flex shrink-0 items-center pr-1">
            <button type="button" onClick={() => move(line, -1)} disabled={i === 0} aria-label={`Move up: ${l.text.trim()}`} className={`grid h-9 w-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2 disabled:opacity-30 max-[400px]:w-8 ${FOCUS_RING}`}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => move(line, 1)} disabled={i === n - 1} aria-label={`Move down: ${l.text.trim()}`} className={`grid h-9 w-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2 disabled:opacity-30 max-[400px]:w-8 ${FOCUS_RING}`}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
            {distractors.length ? (
              <button
                type="button"
                onClick={() => send(line)}
                aria-label={where === "prog" ? `Not needed: ${l.text.trim()}` : `Put back in the program: ${l.text.trim()}`}
                title={where === "prog" ? "Not needed" : "Put back"}
                className={`grid h-9 w-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2 max-[400px]:w-8 ${FOCUS_RING}`}
              >
                {where === "prog" ? <Minus className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  const zone = (where: Where) => ({
    onDragOver: (e: React.DragEvent) => {
      if (drag.current === null) return;
      e.preventDefault();
      setOver({ where, at: (where === "prog" ? prog : tray).length });
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag.current !== null) place(drag.current, where, (where === "prog" ? prog : tray).length);
      drag.current = null;
      setOver(null);
    },
  });

  const message = solved
    ? "Correct. Every line is in place."
    : revealed
      ? "Here is the solution."
      : result && !result.ok
        ? result.firstWrong !== null && result.firstWrong < prog.length
          ? `Line ${result.firstWrong + 1} is the first one out of place.`
          : "A line you need is still in the tray."
        : "Drag the lines into order, or use the buttons, then check.";

  return (
    <>
      <p className="m-0 text-[13px] text-fg-3">
        Your program, top to bottom. Indentation is already part of each line.{distractors.length ? " Some lines are not needed: set them aside." : ""} Keyboard: Space picks a line up, the arrow keys move it, Space puts it down.
      </p>
      <div role="list" aria-label="Your program" className="m-0 flex min-h-[52px] list-none flex-col gap-1.5 p-0" {...zone("prog")}>
        {prog.map((line, i) => row(line, i, "prog", prog.length))}
      </div>
      {distractors.length ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-bg p-2" {...zone("tray")}>
          <p className="m-0 mb-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
            Not needed · {tray.length} {tray.length === 1 ? "line" : "lines"}
          </p>
          <div role="list" aria-label="Not needed" className="m-0 flex min-h-9 list-none flex-col gap-1.5 p-0">
            {tray.map((line, i) => row(line, i, "tray", tray.length))}
            {!tray.length ? <div role="listitem" className="px-1 text-[13px] text-fg-4">Drop the lines you don&apos;t need here.</div> : null}
          </div>
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="assertive">
        {live}
      </span>
      <Status tone={solved ? "ok" : result ? "bad" : "plain"}>{message}</Status>
      <div className="flex flex-wrap items-center gap-2">
        {!locked ? (
          <button type="button" onClick={check} className={PRIMARY}>
            Check the order
          </button>
        ) : null}
        {!locked && checks >= 1 ? (
          <button type="button" onClick={showSolution} className={SECONDARY}>
            Show the solution
          </button>
        ) : null}
        {locked ? (
          <button type="button" onClick={reset} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
            Shuffle and retry
          </button>
        ) : null}
      </div>
      {locked ? <Explain lines={ex.explain} tone={solved ? "ok" : "bad"} /> : null}
    </>
  );
}
