"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { MCQQuestion } from "@/lib/mcq-parser";
import { passMark, shuffleLabel, type OptionLabel, type RunState, type TrialPart } from "./engine";
import { Kbd } from "./PartsStrip";

export type SaveState = "idle" | "saving" | "saved" | "local";

const LETTERS = ["A", "B", "C", "D"];

type Props = {
  part: TrialPart;
  weekLabel: string;
  hubHref: string;
  questions: MCQQuestion[];
  run: RunState;
  index: number;
  order: OptionLabel[];
  sel: number | null;
  save: SaveState;
  signedIn: boolean;
  revealed: boolean;
  pick?: OptionLabel;
  onChoose: (k: number) => void;
  onLockIn: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFlag: () => void;
  onEnd: () => void;
  onJump: (k: number) => void;
  isTyping: (t: EventTarget | null) => boolean;
};

export default function TrialQuestion(props: Props) {
  const { part, questions, run, index: i, order, sel, revealed, pick } = props;
  const N = questions.length;
  const pm = passMark(N);
  const q = questions[i];
  const right = revealed && pick === q.correctAnswer;
  const optText = new Map(q.options.map((o) => [o.label, o.text]));
  const answered = Object.keys(run.picks).length;
  const correct = questions.filter((qq) => run.picks[qq.number] && run.picks[qq.number] === qq.correctAnswer).length;
  const wrong = answered - correct;
  const missesLeft = N - pm - wrong;
  const flagged = questions.filter((qq) => run.flags[qq.number]);
  const isFlagged = !!run.flags[q.number];
  const isLast = i + 1 >= N;
  const firstSkipped = questions.findIndex((qq, k) => k !== i && !run.picks[qq.number]);
  const skippedCount = questions.filter((qq) => !run.picks[qq.number]).length - (revealed ? 0 : 1);
  const groupRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Keyboard: 1-4 choose, ↑↓ move (inside the options), ↵ lock in / next, F flag
  const { onChoose, onLockIn, onNext, onFlag, isTyping } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const target = e.target as HTMLElement | null;
      const inGroup = !!target && !!groupRef.current?.contains(target);
      if (/^[1-4]$/.test(e.key)) {
        const k = Number(e.key) - 1;
        if (!revealed && k < order.length) {
          e.preventDefault();
          onChoose(k);
          (groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[k])?.focus();
        }
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") && inGroup && !revealed) {
        e.preventDefault();
        const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        const k = sel === null ? (dir > 0 ? 0 : order.length - 1) : (sel + dir + order.length) % order.length;
        onChoose(k);
        (groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[k])?.focus();
      } else if (e.key === "Enter") {
        const tag = target?.tagName;
        if ((tag === "BUTTON" || tag === "A") && !inGroup) return;
        e.preventDefault();
        if (revealed) onNext();
        else onLockIn();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        onFlag();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, order.length, sel, onChoose, onLockIn, onNext, onFlag, isTyping]);

  // After lock in, move focus to "Next" so ↵ / Space continue
  useEffect(() => {
    if (revealed) nextRef.current?.focus({ preventScroll: true });
  }, [revealed, q.number]);

  const saveLabel =
    props.save === "saving"
      ? "saving…"
      : props.save === "saved"
      ? `saved ✓ · ${answered}/${N} synced`
      : props.save === "local"
      ? `saved ✓ · ${answered}/${N} on this device`
      : "autosave on";

  let outlook: string;
  let outlookCls: string;
  if (missesLeft >= 2) {
    outlook = `On track. You can miss ${missesLeft} more and still pass.`;
    outlookCls = "text-fg-2";
  } else if (missesLeft >= 0) {
    outlook = missesLeft === 0 ? "No room left: one more miss and this attempt fails." : "Careful: one more miss is your last.";
    outlookCls = "text-signal-text";
  } else {
    outlook = "Pass is out of reach this attempt. Finish anyway: every question you miss becomes a review card.";
    outlookCls = "text-bad-text";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress: compact on phones, full bar on desktop */}
      <section aria-label="Trial progress" className="flex flex-col gap-2.5 border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7 sm:gap-y-4 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2 sm:min-w-[180px]">
          <Link
            href={props.hubHref}
            aria-label="Exit trial, progress is saved"
            className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg no-underline hover:border-fg-3 sm:hidden"
          >
            ×
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-label text-signal-text sm:text-[11px]">
              Trial · {props.weekLabel} · Part {part.n}
              <span className="hidden sm:inline"> · {part.title}</span>
            </span>
            <span className="font-display text-sm font-bold tracking-[-0.02em] text-fg sm:text-[22px]">
              <span className="sm:hidden">{part.title} · </span>Question {i + 1} of {N}
            </span>
          </div>
          <span role="status" aria-live="polite" className={`font-mono text-[11px] sm:hidden ${props.save === "saved" || props.save === "local" ? "text-ok" : "text-fg-3"}`}>
            {props.save === "saving" ? "saving…" : props.save === "idle" ? "" : "saved ✓"}
          </span>
        </div>
        <div className="min-w-0 sm:flex-[1_1_520px]">
          <ol aria-label="Questions" className="m-0 flex list-none flex-wrap gap-[3px] p-0 py-1">
            {questions.map((qq, k) => {
              const p = run.picks[qq.number];
              const flag = run.flags[qq.number];
              let cls = "border border-dashed border-line-strong text-fg-4";
              let label = `Q${qq.number}: `;
              let text = "";
              if (p && p === qq.correctAnswer) {
                cls = "bg-ok text-[#04140B]";
                label += "correct";
                text = "✓";
              } else if (p) {
                cls = "bg-bad text-[#1A0405]";
                label += "wrong";
                text = "✕";
              } else if (k === i) {
                cls = "border-2 border-signal text-signal-text";
                label += "current";
                text = String(k + 1);
              } else if (k < i) {
                cls = "border border-line-strong text-fg-3";
                label += "skipped";
                text = "–";
              } else {
                label += "ahead";
              }
              if (flag) label += ", flagged";
              return (
                <li
                  key={qq.number}
                  title={label}
                  aria-label={label}
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center font-mono text-[9px] font-semibold sm:h-[22px] sm:w-[22px] sm:text-[10px] ${cls} ${flag ? "shadow-[inset_0_-4px_0_var(--c-signal)]" : ""}`}
                >
                  {text}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="hidden min-w-[150px] flex-col gap-1.5 sm:flex">
          <div className="flex justify-between gap-2.5 font-mono text-xs">
            <span className="text-fg-3">COMBO</span>
            <span className={`font-semibold ${run.combo >= 3 ? "text-signal-text" : "text-fg"}`}>×{run.combo}</span>
          </div>
          <div aria-hidden="true" className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={`h-2 flex-1 ${k < Math.min(run.combo, 5) ? "bg-signal" : "bg-surface-2"}`} />
            ))}
          </div>
          <span className="font-mono text-[11px] text-fg-4">best ×{run.bestCombo}</span>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`hidden border border-line px-2.5 py-1.5 font-mono text-xs sm:inline ${props.save === "saved" || props.save === "local" ? "text-ok" : "text-fg-3"}`}
        >
          {saveLabel}
        </span>
      </section>

      <div className="flex flex-wrap items-start gap-8">
        <article className="flex min-w-0 max-w-[860px] flex-[999_1_620px] flex-col gap-5">
          <div className="flex flex-wrap gap-2 font-mono text-xs tracking-[0.06em]">
            <span className="bg-signal px-2 py-1 font-semibold text-on-signal">Q{q.number}</span>
            <span className="border border-line-strong px-2 py-1 text-fg-2">ATTEMPT {run.attempt}</span>
            <span className="hidden border border-line-strong px-2 py-1 text-fg-2 sm:inline">SHUFFLE #{shuffleLabel(run.seed)}</span>
            {run.combo >= 2 && <span className="px-2 py-1 text-signal-text sm:hidden">×{run.combo} combo</span>}
          </div>
          <h1 id="trial-q" className="m-0 font-display text-[25px] font-bold leading-[1.15] tracking-[-0.02em] text-fg sm:text-[clamp(30px,3.2vw,42px)] sm:leading-[1.1]">
            {q.text}
          </h1>

          <div ref={groupRef} role="radiogroup" aria-labelledby="trial-q" className="flex flex-col gap-2">
            {order.map((orig, k) => {
              const isRight = orig === q.correctAnswer;
              const chosen = revealed ? pick === orig : sel === k;
              let cls = "border border-line-strong text-fg";
              let keyCls = "border border-line-strong text-fg-2";
              let verdict = "";
              let verdictCls = "";
              if (revealed) {
                if (isRight) {
                  cls = "border-2 border-ok text-fg";
                  keyCls = "bg-ok text-[#04140B]";
                  verdict = chosen ? "✓ YOUR PICK" : "✓ ANSWER";
                  verdictCls = "text-ok";
                } else if (chosen) {
                  cls = "border-2 border-bad text-fg";
                  keyCls = "border border-bad text-bad-text";
                  verdict = "✕ YOUR PICK";
                  verdictCls = "text-bad-text";
                } else {
                  cls = "border border-line text-fg-4";
                  keyCls = "border border-line text-fg-4";
                }
              } else if (chosen) {
                cls = "border-2 border-signal bg-surface-2 text-fg";
                keyCls = "bg-signal text-on-signal";
                verdict = "SELECTED";
                verdictCls = "text-signal-text";
              }
              const tabIndex = revealed ? -1 : sel === null ? (k === 0 ? 0 : -1) : sel === k ? 0 : -1;
              return (
                <button
                  key={orig}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-disabled={revealed || undefined}
                  tabIndex={tabIndex}
                  onClick={() => !revealed && props.onChoose(k)}
                  className={`flex min-h-[58px] w-full items-center gap-3.5 bg-bg px-3 py-2.5 text-left text-[15px] leading-snug sm:min-h-[60px] sm:px-4 sm:py-3 sm:text-base ${revealed ? "cursor-default" : chosen ? "cursor-pointer" : "cursor-pointer hover:border-fg-3"} ${cls}`}
                >
                  <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center font-mono text-[13px] font-semibold ${keyCls}`}>
                    <span className="sm:hidden">{LETTERS[k]}</span>
                    <span className="hidden sm:inline">{k + 1}</span>
                  </span>
                  <span className="flex-grow">{optText.get(orig)}</span>
                  {verdict && <span className={`whitespace-nowrap font-mono text-xs ${verdictCls}`}>{verdict}</span>}
                </button>
              );
            })}
          </div>

          {revealed && (
            <div className={`flex animate-hk-in flex-col gap-2.5 border bg-surface px-5 py-[18px] ${right ? "border-ok" : "border-bad"}`}>
              <span
                className={`self-start px-2 py-1 font-mono text-xs font-semibold tracking-label ${right ? "bg-ok text-[#04140B]" : "border border-bad text-bad-text"}`}
              >
                {right ? (run.combo >= 3 ? `CORRECT · COMBO ×${run.combo}` : "CORRECT") : "NOT QUITE · COMBO RESET"}
              </span>
              <span className="text-base font-semibold leading-normal text-fg">Answer: {optText.get(q.correctAnswer)}</span>
              {q.explanation && <span className="text-base leading-relaxed text-fg-2">{q.explanation}</span>}
              {!right && <span className="text-sm text-fg-3">Added to your review queue. It comes back in your next review.</span>}
            </div>
          )}

          {!revealed && <span className="text-xs leading-normal text-fg-3 sm:hidden">Options are shuffled for you and saved as you go. Pass mark 80% ({pm} of {N}).</span>}

          {/* Actions: a fixed bar above the dock on phones, inline on desktop */}
          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+58px)] z-40 flex flex-wrap items-center justify-between gap-2.5 border-t border-line bg-bg px-4 py-2.5 sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:px-0 sm:pt-1">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onFlag}
                aria-pressed={isFlagged}
                aria-label={isFlagged ? "Flagged for review" : "Flag for review"}
                className={`inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 px-3.5 text-sm ${isFlagged ? "border border-signal text-signal-text" : "border border-line-strong text-fg"}`}
              >
                <span aria-hidden="true">⚑</span>
                <span className="hidden sm:inline">{isFlagged ? "Flagged for review" : "Flag for review"}</span>
              </button>
              <button
                type="button"
                onClick={props.onEnd}
                className="hidden min-h-[48px] px-3.5 text-sm text-fg-3 underline underline-offset-[3px] hover:text-fg sm:inline-flex sm:items-center"
              >
                End trial now
              </button>
            </div>
            <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
              {!revealed && (
                <button
                  type="button"
                  onClick={props.onSkip}
                  className="min-h-[52px] border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3"
                >
                  Skip
                </button>
              )}
              {!revealed ? (
                <button
                  type="button"
                  onClick={props.onLockIn}
                  disabled={sel === null}
                  className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2.5 bg-signal px-6 text-base font-semibold text-on-signal disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-4 sm:flex-none"
                >
                  Lock in{sel !== null ? <span className="sm:hidden"> {LETTERS[sel]}</span> : null}
                  <span aria-hidden="true" className="hidden font-mono text-xs opacity-70 sm:inline">
                    ↵
                  </span>
                </button>
              ) : (
                <>
                  {isLast && firstSkipped >= 0 && skippedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => props.onJump(firstSkipped)}
                      className="min-h-[52px] border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3"
                    >
                      Back to {skippedCount} skipped
                    </button>
                  )}
                  <button
                    ref={nextRef}
                    type="button"
                    onClick={props.onNext}
                    className="min-h-[52px] flex-1 bg-fg px-6 text-base font-semibold text-bg sm:flex-none"
                  >
                    {isLast ? "See results →" : "Next question →"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="hidden flex-wrap gap-x-[18px] gap-y-2 border-t border-line pt-3.5 font-mono text-xs text-fg-3 sm:flex">
            <span>
              <Kbd>1</Kbd>–<Kbd>4</Kbd> choose
            </span>
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
            </span>
            <span>
              <Kbd>↵</Kbd> lock in · next
            </span>
            <span>
              <Kbd>F</Kbd> flag
            </span>
            <span className="text-fg-4">no answer is shown before you lock in</span>
          </div>
          <div aria-hidden="true" className="h-16 sm:hidden" />
        </article>

        <aside aria-label="Running score" className="flex w-full flex-col gap-4 sm:max-w-[340px] sm:flex-[1_1_260px]">
          <div className="flex flex-col gap-1.5 border border-line bg-surface p-5">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">Score so far</span>
            <span className="font-mono text-[40px] font-semibold tracking-[-0.02em] text-fg">
              {correct}
              <span className="text-xl text-fg-3">/{N}</span>
            </span>
            <span className="pb-2 text-[13px] text-fg-3">counted against all {N}, not just the ones answered</span>
            <ScoreRow label="Correct" value={correct} cls="text-ok" />
            <ScoreRow label="Wrong" value={wrong} cls="text-bad-text" />
            <ScoreRow label="Still to answer" value={N - answered} />
            <ScoreRow label="Pass needs" value={pm} />
            <span className={`pt-2.5 text-sm leading-normal ${outlookCls}`}>{outlook}</span>
          </div>
          <div className="flex flex-col gap-2.5 border border-line bg-surface p-5">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">Flagged · {flagged.length}</span>
            <span className="text-sm leading-normal text-fg-2">
              {flagged.length ? flagged.map((qq) => `Q${qq.number}`).join(" · ") : "Nothing flagged yet. Flag anything you guessed."}
            </span>
            <span className="text-[13px] leading-normal text-fg-3">Flagged questions are pinned to the top of your results, right or wrong.</span>
          </div>
          <button
            type="button"
            onClick={props.onEnd}
            className="min-h-[48px] self-start text-sm text-fg-3 underline underline-offset-[3px] hover:text-fg sm:hidden"
          >
            End trial now
          </button>
        </aside>
      </div>
    </div>
  );
}

function ScoreRow({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="flex justify-between border-t border-line py-2 text-sm">
      <span className="text-fg-3">{label}</span>
      <span className={`font-mono ${cls || "text-fg"}`}>{value}</span>
    </div>
  );
}
