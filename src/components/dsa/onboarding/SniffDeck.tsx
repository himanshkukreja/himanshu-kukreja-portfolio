"use client";

/**
 * The quick sniff test: a deck of micro-puzzle cards. A true/false card is swiped (right = true, left = false) or
 * answered with its two buttons or the arrow keys; a pick card is answered by tapping an option. Every swipe has a
 * button, so keyboard and screen-reader users lose nothing. After an answer the card shows a one-line reveal.
 */
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { RIGHT_LINES, WRONG_LINES, type Puzzle } from "@/lib/dsa/onboarding/puzzles";
import { TOPIC_BY_ID } from "@/lib/dsa/onboarding/topics";
import "./onboarding.css";

const THRESHOLD = 90;

export default function SniffDeck({ puzzles, onAnswer, onFinish, reduced }: { puzzles: Puzzle[]; onAnswer: (id: string, right: boolean) => void; onFinish: () => void; reduced: boolean }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const p = puzzles[i];
  const last = i === puzzles.length - 1;
  const done = picked !== null;
  const right = done && picked === p.answer;

  const answer = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    setDx(0);
    onAnswer(p.id, n === p.answer);
  };
  const next = () => {
    if (last) return onFinish();
    setI(i + 1);
    setPicked(null);
  };

  const swipeable = p.kind === "tf" && !done;
  const onDown = (e: React.PointerEvent) => {
    if (!swipeable) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDx(Math.max(-160, Math.min(160, e.clientX - drag.current.x)));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (dx > THRESHOLD) answer(0);
    else if (dx < -THRESHOLD) answer(1);
    else setDx(0);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!swipeable) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    answer(e.key === "ArrowRight" ? 0 : 1);
  };

  const lead = right ? RIGHT_LINES[i % RIGHT_LINES.length] : WRONG_LINES[i % WRONG_LINES.length];
  const tint = dx > 12 ? "right" : dx < -12 ? "left" : null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3" aria-live="polite">
        Puzzle {i + 1} of {puzzles.length} · {TOPIC_BY_ID[p.topic].label}
      </p>
      <div className="relative w-full max-w-[440px]">
        {/* the cards waiting behind this one */}
        {puzzles.length - i > 1 ? <span aria-hidden className="absolute inset-x-3 -bottom-2 top-2 border border-line-strong bg-surface-2" /> : null}
        <div
          key={p.id}
          role="group"
          aria-label={`Puzzle ${i + 1} of ${puzzles.length}`}
          tabIndex={swipeable ? 0 : -1}
          onKeyDown={onKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{
            touchAction: "pan-y",
            transform: dx ? `translateX(${dx}px)${reduced ? "" : ` rotate(${dx / 18}deg)`}` : undefined,
            transition: dragging || reduced ? undefined : "transform 0.18s ease-out",
          }}
          className={`ob-card-in relative flex select-none flex-col gap-4 border-2 bg-surface p-5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal ${
            tint === "right" ? "border-signal" : tint === "left" ? "border-fg" : done ? (right ? "border-signal" : "border-line-strong") : "border-line-strong"
          } ${swipeable ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          {swipeable ? (
            <>
              <span aria-hidden className={`pointer-events-none absolute right-3 top-3 border-2 border-signal px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-label text-signal-text ${tint === "right" ? "opacity-100" : "opacity-0"}`}>
                True
              </span>
              <span aria-hidden className={`pointer-events-none absolute left-3 top-3 border-2 border-fg px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-label text-fg ${tint === "left" ? "opacity-100" : "opacity-0"}`}>
                False
              </span>
            </>
          ) : null}
          <span className="pt-5 font-mono text-[11px] uppercase tracking-label text-fg-3">{p.kind === "tf" ? "True or false?" : "Pick one"}</span>
          <h3 className="m-0 font-display text-[21px] font-extrabold leading-[1.15] tracking-[-0.02em] text-fg">{p.q}</h3>
          {p.code ? (
            <pre className="m-0 overflow-x-auto border border-line bg-surface-2 p-3 font-mono text-[13px] leading-[1.55] text-fg" tabIndex={0} aria-label="Code">
              <code>{p.code}</code>
            </pre>
          ) : null}

          {p.kind === "pick" ? (
            <div role="group" aria-label="Answers" className={`grid gap-2 ${p.options.every((o) => o.length < 8) ? "grid-cols-2" : "grid-cols-1"}`}>
              {p.options.map((o, n) => (
                <button
                  key={o}
                  type="button"
                  disabled={done}
                  onClick={() => answer(n)}
                  aria-pressed={picked === n}
                  className={`flex min-h-12 items-center justify-between gap-2 border px-3 py-2 text-left text-[15px] font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    done && n === p.answer
                      ? "border-signal bg-[var(--c-dsa-hl,transparent)] text-fg"
                      : done && picked === n
                        ? "border-fg bg-surface-2 text-fg-2 line-through decoration-fg-3"
                        : "border-line-strong bg-surface text-fg hover:border-fg disabled:opacity-60"
                  }`}
                >
                  <span>{o}</span>
                  {done && n === p.answer ? <Check className="h-4 w-4 shrink-0 text-signal-text" aria-label="right answer" /> : null}
                  {done && picked === n && n !== p.answer ? <X className="h-4 w-4 shrink-0" aria-label="your answer, not right" /> : null}
                </button>
              ))}
            </div>
          ) : !done ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => answer(1)} className="inline-flex min-h-12 items-center justify-center gap-2 border border-fg bg-surface px-3 text-[15px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                <ArrowLeft className="h-4 w-4" aria-hidden /> False
              </button>
              <button type="button" onClick={() => answer(0)} className="inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-3 text-[15px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                True <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
          {swipeable ? <p className="m-0 text-center font-mono text-[11.5px] text-fg-3">Swipe right for true, left for false. Or use the buttons.</p> : null}

          {done ? (
            <div role="status" className="ob-card-in flex flex-col gap-1.5 border-t border-line pt-3">
              <span className={`inline-flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-label ${right ? "text-signal-text" : "text-fg"}`}>
                {right ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                {right ? "Right" : "Not quite"}
              </span>
              <p className="m-0 text-[14.5px] leading-snug text-fg-2">
                <strong className="font-semibold text-fg">{lead}</strong> {p.why}
              </p>
              {p.kind === "tf" ? <p className="m-0 font-mono text-[12px] text-fg-3">The answer was {p.answer === 0 ? "true" : "false"}.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      {done ? (
        <button type="button" autoFocus onClick={next} className="inline-flex min-h-12 w-full max-w-[440px] items-center justify-center gap-2 bg-signal px-6 text-[16px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
          {last ? "Done, pick my pace" : "Next puzzle"}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
