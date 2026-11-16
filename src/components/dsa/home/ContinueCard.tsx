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

const CARD = "flex flex-col gap-4 border border-line bg-surface p-5 sm:p-7";
const BTN =
  "inline-flex min-h-12 items-center justify-center gap-2 px-5 py-2 text-center text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

function Strip({ steps }: { steps: Extract<NextStep, { lessonId: string }>["steps"] }) {
  return (
    <ol aria-label="Steps of this lesson" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0 sm:gap-2">
      {steps.map((s) => (
        <li key={s.id} aria-current={s.now ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
          <span aria-hidden className={`h-1.5 ${s.done ? "bg-fg-2" : s.now ? "bg-signal" : "bg-line dark:bg-line-strong"}`} />
          <span className={`flex min-w-0 items-center gap-1 text-[12.5px] leading-tight sm:text-[13px] ${s.now ? "font-semibold text-fg" : s.done ? "text-fg-2" : "text-fg-3"}`}>
            {s.done ? <Check className="h-3 w-3 shrink-0" aria-label="done" /> : null}
            <span className="truncate">{s.label}</span>
            {s.optional && !s.done ? <span className="hidden text-fg-3 sm:inline">(optional)</span> : null}
            {s.now ? <span className="sr-only"> (current step)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ContinueCard({ next, ready }: { next: NextStep; ready: boolean }) {
  if (!ready) {
    return <div aria-hidden aria-busy="true" className="min-h-[300px] border border-line bg-surface sm:min-h-[330px]" />;
  }
  if (next.state === "empty") {
    return (
      <section aria-labelledby="dsa-next-h" className={CARD}>
        <h1 id="dsa-next-h" className="m-0 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-fg">
          The first lessons are on their way
        </h1>
        <p className="m-0 text-[15px] text-fg-2">Practice problems are open in the meantime.</p>
        <Link href="/dsa/practice" className={`${BTN} self-start bg-signal text-on-signal hover:bg-[var(--c-signal-strong)]`}>
          Open Practice
        </Link>
      </section>
    );
  }
  if (next.state === "caught-up") {
    return (
      <section aria-labelledby="dsa-next-h" className={CARD}>
        <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">Continue</span>
        <h1 id="dsa-next-h" className="m-0 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[38px]">
          You&apos;re up to date
        </h1>
        <p className="m-0 text-[15.5px] leading-relaxed text-fg-2">
          Every lesson written so far is done{next.planned ? `, and ${next.planned} more ${next.planned === 1 ? "is" : "are"} coming` : ""}. Keep your edge with more problems.
        </p>
        <Link href="/dsa/practice?list=core-150" className={`${BTN} self-start bg-signal text-on-signal hover:bg-[var(--c-signal-strong)]`}>
          Practise more
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </section>
    );
  }
  const start = next.state === "start";
  return (
    <section aria-labelledby="dsa-next-h" className={CARD}>
      <span className="font-mono text-[11.5px] uppercase tracking-label text-signal-text sm:text-[12px]">
        {start ? "Your first step" : "Continue"} · {next.partTitle ? `${next.partTitle} · ` : ""}
        {next.moduleTitle} · Lesson {next.n} of {next.of}
      </span>
      <h1 id="dsa-next-h" className="m-0 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">
        {next.lessonTitle}
      </h1>
      {next.summary ? <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-fg-2 sm:text-[16px]">{next.summary}</p> : null}
      <Strip steps={next.steps} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href={next.href}
          onClick={() => track("dsa_continue", { lesson: next.lessonId, step: next.step, first: start })}
          className={`${BTN} w-full bg-signal text-on-signal hover:bg-[var(--c-signal-strong)] sm:w-auto`}
        >
          <span className="min-w-0 sm:truncate">{next.label}</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
        <Link href={next.lessonHref} className={`${BTN} w-full border border-line-strong text-fg hover:bg-surface-2 sm:w-auto`}>
          Open the lesson
        </Link>
        {start ? null : (
          <span className="text-[14px] text-fg-3">
            {next.stepLabel} · about {next.minutesLeft} min left
          </span>
        )}
      </div>
    </section>
  );
}
