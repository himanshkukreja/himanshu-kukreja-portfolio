"use client";

/**
 * "Continue" on the DSA home: the lesson the learner is on, its four steps (Learn, Try it, Practice, Check) and the
 * one button that goes to the right place. Rule-based (src/lib/dsa/continue.ts), no AI call. While progress is still
 * loading it holds a skeleton of the same height, so a returning learner never sees "Start lesson 1" flash by.
 */
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { track } from "@/lib/track";
import type { NextStep } from "@/lib/dsa/continue";
import { BIG, BTN_PRIMARY, BTN_SECONDARY } from "../ui/kit";

/** the canvas's dominant card: 18 px corners, 30 px padding and 18 px between its rows (16 / 18 / 12 on phones) */
const SHELL = "rounded-2xl border border-line bg-surface sm:rounded-[18px]";
const CARD = `${SHELL} flex flex-col gap-3 p-[18px] sm:gap-[18px] sm:p-[30px]`;
const PRIMARY = `${BTN_PRIMARY} ${BIG}`;
const SECONDARY = `${BTN_SECONDARY} ${BIG} px-[18px]`;

function Strip({ steps }: { steps: Extract<NextStep, { lessonId: string }>["steps"] }) {
  return (
    <ol aria-label="Steps of this lesson" className="m-0 grid list-none grid-cols-4 gap-[5px] p-0 sm:gap-2">
      {steps.map((s) => (
        <li key={s.id} aria-current={s.now ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
          <span aria-hidden className={`h-[5px] rounded-full sm:h-1.5 ${s.done ? "bg-fg-2" : s.now ? "bg-signal" : "bg-line dark:bg-line-strong"}`} />
          <span className={`flex min-w-0 items-center gap-1 text-[12px] font-medium leading-tight sm:text-[13px] ${s.now || s.done ? "text-fg" : "text-fg-4"}`}>
            {s.done ? <Check className="h-3 w-3 shrink-0" aria-label="done" /> : null}
            <span className="truncate">{s.label}</span>
            {s.now ? <span className="sr-only"> (current step)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ContinueCard({ next, ready }: { next: NextStep; ready: boolean }) {
  if (!ready) {
    return <div aria-hidden aria-busy="true" className={`${SHELL} min-h-[260px] sm:min-h-[330px]`} />;
  }
  if (next.state === "empty") {
    return (
      <section aria-labelledby="dsa-next-h" className={CARD}>
        <h1 id="dsa-next-h" className="m-0 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-fg">
          The first lessons are on their way
        </h1>
        <p className="m-0 text-[15px] text-fg-2">Practice problems are open in the meantime.</p>
        <Link href="/dsa/practice" className={`${PRIMARY} self-start`}>
          Open Practice
        </Link>
      </section>
    );
  }
  if (next.state === "caught-up") {
    return (
      <section aria-labelledby="dsa-next-h" className={CARD}>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-signal-text sm:text-[12px]">Continue</span>
        <h1 id="dsa-next-h" className="m-0 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[38px]">
          You&apos;re up to date
        </h1>
        <p className="m-0 text-[15.5px] leading-relaxed text-fg-2">
          Every lesson written so far is done{next.planned ? `, and ${next.planned} more ${next.planned === 1 ? "is" : "are"} coming` : ""}. Keep your edge with more problems.
        </p>
        <Link href="/dsa/practice?list=core-150" className={`${PRIMARY} self-start`}>
          Practise more
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </section>
    );
  }
  const start = next.state === "start";
  return (
    <section aria-labelledby="dsa-next-h" className={CARD}>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-signal-text sm:text-[12px]">
        {start ? "Your first step" : "Continue"} · <span className="hidden sm:inline">{next.partTitle ? `${next.partTitle} · ` : ""}</span>
        {next.moduleTitle} · Lesson {next.n}
        <span className="hidden sm:inline"> of {next.of}</span>
      </span>
      <h1 id="dsa-next-h" className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] text-fg sm:text-[40px] sm:tracking-[-0.025em]">
        {next.lessonTitle}
      </h1>
      {next.summary ? <p className="m-0 hidden max-w-[640px] text-[16px] leading-normal text-fg-2 sm:block">{next.summary}</p> : null}
      <Strip steps={next.steps} />
      {/* phones: the meta line, then one full-width Continue (HomeMobile); computers: Continue, Open the lesson, the meta */}
      {start ? null : (
        <span className="text-[13px] text-fg-3 sm:hidden">
          {next.stepLabel} · about {next.minutesLeft} min left
        </span>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
        <Link
          href={next.href}
          onClick={() => track("dsa_continue", { lesson: next.lessonId, step: next.step, first: start })}
          className={`${PRIMARY} w-full sm:w-auto`}
        >
          <span className="min-w-0 sm:hidden">{start ? next.label : "Continue"}</span>
          <span className="hidden min-w-0 truncate sm:inline">{next.label}</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
        <Link href={next.lessonHref} className={`${SECONDARY} hidden sm:inline-flex`}>
          Open the lesson
        </Link>
        {start ? null : (
          <span className="hidden text-[14px] text-fg-3 sm:inline">
            {next.stepLabel} · about {next.minutesLeft} min left
          </span>
        )}
      </div>
    </section>
  );
}
