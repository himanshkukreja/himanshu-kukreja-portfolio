"use client";

import { useState, type ReactNode } from "react";
import ActivityShell from "./ActivityShell";
import { ChoiceStep, ClassifyStep, Feedback, OPT_DIM, OPT_IDLE, OPT_RIGHT, OPT_WRONG, OPTION, OrderStep, SpotStep, StepPrompt, seededShuffle } from "./kit";
import { stepMax, type CaseActivityData, type DataChoiceStep, type DataStep } from "./data";
import type { ActivityDef, ActivityStep, StepCtx } from "./types";

/**
 * A choice where every option has its own outcome ("decide" scenarios): same look and scoring as
 * the kit's ChoiceStep (shuffled, one point for the right call), but the feedback says what your
 * pick would have done, then why the right one works.
 */
function OutcomeChoice({ ctx, s }: { ctx: StepCtx; s: DataChoiceStep }) {
  const [pick, setPick] = useState<number | null>(null);
  const [order] = useState(() => seededShuffle(s.options.map((_, i) => i), `${s.options.join("|")}#44`));
  const answered = pick !== null;
  const right = pick === s.answer;
  const choose = (k: number) => {
    if (answered) return;
    setPick(k);
    ctx.done(k === s.answer ? 1 : 0);
  };
  const letter = (k: number) => String.fromCharCode(65 + order.indexOf(k));
  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={s.sub}>{s.prompt}</StepPrompt>
      <div className="flex flex-col gap-2" role="group" aria-label="Answers">
        {order.map((k, pos) => {
          const cls = !answered ? OPT_IDLE : k === s.answer ? OPT_RIGHT : k === pick ? OPT_WRONG : OPT_DIM;
          return (
            <button key={s.options[k]} type="button" disabled={answered} onClick={() => choose(k)} aria-pressed={pick === k} className={`${OPTION} ${cls}`}>
              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center border border-current font-mono text-[12px] font-semibold">
                {String.fromCharCode(65 + pos)}
              </span>
              <span className="sr-only">Option {String.fromCharCode(65 + pos)}: </span>
              <span className="grow">{s.options[k]}</span>
              {answered && k === s.answer && <span className="shrink-0 font-mono text-[11px]">✓</span>}
              {answered && k === pick && k !== s.answer && <span className="shrink-0 font-mono text-[11px] text-bad-text">✗</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {answered && (
          <Feedback ok={right} title={right ? "Right call." : `The better call is ${letter(s.answer)}.`}>
            {!right && s.outcomes?.[pick!] ? <p className="m-0 mb-2">{s.outcomes[pick!]}</p> : null}
            <p className="m-0">{s.outcomes?.[s.answer] || s.explain}</p>
            {s.outcomes?.[s.answer] && s.explain && s.explain !== s.outcomes[s.answer] ? <p className="m-0 mt-2">{s.explain}</p> : null}
          </Feedback>
        )}
      </div>
    </div>
  );
}

/** Wraps a kit step so an explanation shows once the reader has checked it. */
function WithExplain({ ctx, explain, children }: { ctx: StepCtx; explain?: string; children: (ctx: StepCtx) => ReactNode }) {
  const [done, setDone] = useState(false);
  const [inner] = useState<StepCtx>(() => ({
    reduced: ctx.reduced,
    done: (score) => {
      setDone(true);
      ctx.done(score);
    },
  }));
  return (
    <div className="flex flex-col gap-3">
      {children(explain ? inner : ctx)}
      {explain && done && (
        <div aria-live="polite">
          <Feedback ok={null} title="Why">
            {explain}
          </Feedback>
        </div>
      )}
    </div>
  );
}

function renderStep(s: DataStep, slug: string, ctx: StepCtx) {
  const sub = s.sub || undefined;
  switch (s.type) {
    case "choice":
      return s.outcomes && s.outcomes.some(Boolean) ? <OutcomeChoice ctx={ctx} s={s} /> : <ChoiceStep ctx={ctx} prompt={s.prompt} sub={sub} options={s.options} answer={s.answer} explain={s.explain} />;
    case "order":
      return <WithExplain ctx={ctx} explain={s.explain}>{(c) => <OrderStep ctx={c} seed={`${slug}:${s.id}`} prompt={s.prompt} sub={sub} items={s.items} />}</WithExplain>;
    case "spot":
      return <WithExplain ctx={ctx} explain={s.explain}>{(c) => <SpotStep ctx={c} prompt={s.prompt} sub={sub} file={s.file} lines={s.lines} />}</WithExplain>;
    case "decide":
      return <ClassifyStep ctx={ctx} prompt={s.prompt} sub={sub} buckets={s.buckets} items={s.items} />;
  }
}

/** Builds the ActivityDef from a CMS case file's activity JSON: same shell, steps, scoring and XP as the TSX activities. */
export function toActivityDef(data: CaseActivityData, slug: string): ActivityDef {
  const steps: ActivityStep[] = data.steps.map((s) => ({
    id: s.id,
    label: s.label,
    max: Math.max(1, stepMax(s)),
    render: (ctx) => renderStep(s, slug, ctx),
  }));
  return { kind: data.kind, title: data.title, blurb: data.blurb, minutes: data.minutes, steps };
}

export default function DataActivity({ slug, caseId, data }: { slug: string; caseId: string; data: CaseActivityData }) {
  if (!data.steps.length) return null;
  return <ActivityShell slug={slug} caseId={caseId} def={toActivityDef(data, slug)} />;
}
