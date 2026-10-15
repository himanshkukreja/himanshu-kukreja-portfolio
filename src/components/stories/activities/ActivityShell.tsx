"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { BTN_GHOST, BTN_PRIMARY, useReducedMotion } from "./kit";
import {
  ACTIVITY_FLAG,
  ACTIVITY_KEY_PREFIX,
  ACTIVITY_SLUGS,
  ACTIVITY_XP,
  ALL_ACTIVITIES_QUEST,
  readActivityResults,
  type ActivityDef,
  type StepCtx,
} from "./types";

type Phase = "idle" | "run" | "done";

function rank(score: number, max: number): string {
  const p = max ? score / max : 0;
  if (p >= 0.9) return "Staff on-call";
  if (p >= 0.7) return "Senior on-call";
  if (p >= 0.45) return "SDE on-call";
  return "Intern · rerun the drill";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * The end-of-file activity frame: "> debrief --interactive" header, step rail, score,
 * results with XP, share line and retry. Steps are plain components that call ctx.done(score).
 */
export default function ActivityShell({ slug, caseId, def }: { slug: string; caseId: string; def: ActivityDef }) {
  const { hydrated, flags, done: questsDone, awardOnce, award, setFlag } = useGame();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<(number | null)[]>(() => def.steps.map(() => null));
  const [run, setRun] = useState(0);
  const [gained, setGained] = useState(0);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const rootRef = useRef<HTMLElement>(null);
  const stepHeadRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);

  const steps = def.steps;
  const max = steps.reduce((s, x) => s + x.max, 0);
  const total = scores.reduce<number>((s, x) => s + (x ?? 0), 0);
  const stepDone = scores[idx] !== null && scores[idx] !== undefined;
  const results = readActivityResults(flags[ACTIVITY_FLAG]);
  const prev = hydrated ? results[slug] : undefined;
  const xpBanked = hydrated && !!questsDone[`${ACTIVITY_KEY_PREFIX}${slug}`];

  // Move focus (and the viewport, if needed) to the new step after a user-initiated step change.
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    const head = stepHeadRef.current;
    const root = rootRef.current;
    if (!head || !root) return;
    head.focus({ preventScroll: true });
    const top = root.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.6) root.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [idx, phase, run, reduced]);

  const makeCtx = (i: number): StepCtx => ({
    reduced,
    done: (score: number) => {
      setScores((s) => {
        if (s[i] !== null) return s;
        const next = [...s];
        next[i] = Math.max(0, Math.min(steps[i].max, Math.round(score)));
        return next;
      });
    },
  });

  const start = () => {
    focusNext.current = true;
    setScores(steps.map(() => null));
    setIdx(0);
    setGained(0);
    setCopied("");
    setRun((r) => r + 1);
    setPhase("run");
  };

  const finish = useCallback(() => {
    const final = scores.reduce<number>((s, x) => s + (x ?? 0), 0);
    // awardOnce()/award() before setFlag(): they write a whole state snapshot, setFlag is applied on top.
    let xp = awardOnce(`${ACTIVITY_KEY_PREFIX}${slug}`, ACTIVITY_XP, `Case activity · ${caseId}`);
    const doneNow = { ...questsDone, [`${ACTIVITY_KEY_PREFIX}${slug}`]: 1 };
    if (ACTIVITY_SLUGS.every((s) => doneNow[`${ACTIVITY_KEY_PREFIX}${s}`])) xp += award(ALL_ACTIVITIES_QUEST, "Case cracker · every case activity solved");
    const old = readActivityResults(flags[ACTIVITY_FLAG]);
    const mine = old[slug];
    setFlag(ACTIVITY_FLAG, { ...old, [slug]: { best: Math.max(mine?.best ?? 0, final), max, runs: (mine?.runs ?? 0) + 1 } });
    track("case_activity", { slug, kind: def.kind, score: final, max });
    setGained(xp);
    focusNext.current = true;
    setPhase("done");
  }, [scores, awardOnce, award, setFlag, flags, questsDone, slug, caseId, max, def.kind]);

  const next = () => {
    if (!stepDone) return;
    if (idx >= steps.length - 1) {
      finish();
      return;
    }
    focusNext.current = true;
    setIdx(idx + 1);
  };

  const share = async () => {
    const url = `${window.location.origin}/stories/${slug}`;
    const text = [`$ debrief --interactive --case ${caseId}`, `> ${def.title}`, `> score ${total}/${max} · ${rank(total, max)}`, `> ${url}`].join("\n");
    const ok = await copyText(text);
    setCopied(ok ? "ok" : "fail");
  };

  const cur = steps[idx];

  return (
    <section
      ref={rootRef}
      aria-labelledby={`act-${slug}-h`}
      className="scroll-mt-[calc(var(--reader-top,112px)+16px)] border border-line-strong bg-surface"
    >
      {/* Terminal title bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-bg px-4 py-2.5 font-mono text-[12px] sm:px-5">
        <span className="text-fg">
          <span className="text-signal-text">&gt;</span> debrief --interactive
        </span>
        <span className="text-fg-3">
          {caseId} · {xpBanked ? "solved ✓" : `+${ACTIVITY_XP} XP`}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-7">
        <div className="flex flex-col gap-2">
          <span className="label-mono text-signal-text">End-of-file activity · {def.kind}</span>
          <h2 id={`act-${slug}-h`} className="m-0 font-display text-[28px] font-extrabold leading-[1.02] tracking-[-0.035em] text-fg sm:text-[36px]">
            {def.title}
          </h2>
        </div>

        {phase === "idle" && (
          <div className="flex flex-col gap-4">
            <p className="m-0 max-w-[60ch] text-[15.5px] leading-relaxed text-fg-2">{def.blurb}</p>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 font-mono text-[11px] text-fg-2">
              <li className="border border-line-strong px-2 py-1">~{def.minutes} MIN</li>
              <li className="border border-line-strong px-2 py-1">
                {steps.length} STEPS · {max} PTS
              </li>
              <li className="border border-line-strong px-2 py-1">{xpBanked ? "XP BANKED" : `+${ACTIVITY_XP} XP`}</li>
              {prev && (
                <li className="border border-signal px-2 py-1 text-signal-text">
                  BEST {prev.best}/{prev.max}
                </li>
              )}
            </ul>
            <button type="button" onClick={start} className={`${BTN_PRIMARY} self-start`}>
              ▶ {prev ? "run it again" : "run debrief"}
            </button>
          </div>
        )}

        {phase === "run" && cur && (
          <>
            {/* Progress rail + score */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 font-mono text-[12px] text-fg-3">
                <span>
                  step {idx + 1}/{steps.length} · <span className="text-fg-2">{cur.label}</span>
                </span>
                <span aria-live="polite">
                  score <span className="font-semibold text-signal-text">{total}</span>/{max}
                </span>
              </div>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
                role="progressbar"
                aria-label="Activity progress"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={idx + (stepDone ? 1 : 0)}
              >
                {steps.map((s, i) => (
                  <span key={s.id} className={`h-1.5 ${i < idx || (i === idx && stepDone) ? "bg-signal" : i === idx ? "bg-fg-3" : "bg-line-strong"}`} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 ref={stepHeadRef} tabIndex={-1} className="sr-only">
                Step {idx + 1} of {steps.length}: {cur.label}
              </h3>
              <div key={`${run}-${idx}`}>{cur.render(makeCtx(idx))}</div>
            </div>

            {stepDone && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <button type="button" onClick={next} className={BTN_PRIMARY}>
                  {idx >= steps.length - 1 ? "see the debrief →" : "next step →"}
                </button>
                <span className="font-mono text-[12px] text-fg-3">
                  +{scores[idx]} / {cur.max} this step
                </span>
              </div>
            )}
          </>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-5">
            <h3 ref={stepHeadRef} tabIndex={-1} className="sr-only">
              Results
            </h3>
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6">
              <span className="font-display text-[64px] font-extrabold leading-none tracking-[-0.05em] text-fg sm:text-[80px]">
                {total}
                <span className="text-fg-4">/{max}</span>
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[13px] font-semibold uppercase tracking-label text-signal-text">{rank(total, max)}</span>
                <span className="text-[15px] leading-relaxed text-fg-2">
                  {gained > 0
                    ? `+${gained} XP filed to your record.`
                    : xpBanked
                      ? "XP for this case is already banked. Runs still count toward your best."
                      : ""}
                  {prev && prev.best >= total && prev.runs > 1 ? ` Best so far: ${prev.best}/${prev.max}.` : ""}
                </span>
              </div>
            </div>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0">
                  <span className="text-fg-2">
                    <span className="mr-2 font-mono text-[12px] text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                    {s.label}
                  </span>
                  <span className={`font-mono text-[13px] ${scores[i] === s.max ? "text-signal-text" : "text-fg-3"}`}>
                    {scores[i] ?? 0}/{s.max}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2 border border-line bg-bg p-3 font-mono text-[12.5px] leading-[1.6] text-fg-2">
              <span className="text-fg">
                <span className="text-signal-text">$</span> debrief --interactive --case {caseId}
              </span>
              <span>&gt; score {total}/{max} · {rank(total, max).toLowerCase()}</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={share} className={BTN_PRIMARY}>
                {copied === "ok" ? "copied ✓" : "copy result"}
              </button>
              <button type="button" onClick={start} className={BTN_GHOST}>
                ↻ retry
              </button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copied === "ok" ? "Result copied to clipboard." : copied === "fail" ? "Could not copy. Select the result text instead." : ""}
            </span>
            {copied === "fail" && <span className="font-mono text-[12px] text-bad-text">Clipboard blocked. Select the lines above to copy.</span>}
          </div>
        )}
      </div>
    </section>
  );
}
