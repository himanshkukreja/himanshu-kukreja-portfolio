"use client";

/**
 * The guest's first-visit welcome on the DSA home: three taps (experience, language, goal), skippable. The language becomes
 * the one the lessons, cheat sheets and the problem room use (dsa.lang). Signed-in learners get the full onboarding instead
 * (OnboardingHost). The old "Show everything" switch is retired, so the experience answer no longer flips a view.
 */
import { useEffect, useState } from "react";
import { holdAttention } from "@/lib/learn/guide/attention";
import { track } from "@/lib/track";
import type { DsaLang } from "@/lib/dsa/types";
import { useLang } from "../concept/widgets";
import { saveWelcome, type Experience, type Goal } from "../simple/view";

const EXPERIENCE: { id: Experience; label: string; line: string }[] = [
  { id: "new", label: "New to coding", line: "I'm just starting out" },
  { id: "some", label: "Some coding", line: "I can write loops and functions" },
  { id: "experienced", label: "Experienced", line: "I've solved DSA problems before" },
];
const LANGS: { id: DsaLang; label: string; line?: string }[] = [
  { id: "python", label: "Python", line: "Recommended: the easiest to read" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
];
const GOALS: { id: Goal; label: string; line: string }[] = [
  { id: "placements", label: "Placements", line: "Campus hiring and online tests" },
  { id: "interviews", label: "Interviews", line: "Coding rounds at tech companies" },
  { id: "cp", label: "Competitive programming", line: "Contests and harder problems" },
];

function Choice({ label, line, on, onPick }: { label: string; line?: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={`flex min-h-16 w-full flex-col items-start justify-center gap-0.5 border px-4 py-3 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text ${
        on ? "border-signal bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : "border-line-strong bg-surface hover:border-fg"
      }`}
    >
      <span className="text-[16px] font-semibold text-fg">{label}</span>
      {line ? <span className="text-[13.5px] text-fg-3">{line}</span> : null}
    </button>
  );
}

export default function Welcome() {
  const [, setLang] = useLang();
  // the welcome has the floor: other first-visit tips (the Notebook coach) wait until it's answered or skipped
  useEffect(() => holdAttention(), []);
  const [step, setStep] = useState(0);
  const [exp, setExp] = useState<Experience | null>(null);
  const [lang, pickLang] = useState<DsaLang | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);

  const finish = (g: Goal | null, skipped = false) => {
    if (lang) setLang(lang);
    saveWelcome({ exp, goal: g, skipped });
    track("dsa_welcome", { exp: exp ?? "", lang: lang ?? "", goal: g ?? "", skipped });
  };

  const steps = [
    { q: "How much coding have you done?", items: EXPERIENCE.map((e) => ({ ...e, on: exp === e.id, pick: () => (setExp(e.id), setStep(1)) })) },
    { q: "Which language do you want to learn in?", items: LANGS.map((l) => ({ ...l, on: lang === l.id, pick: () => (pickLang(l.id), setStep(2)) })) },
    { q: "What are you preparing for?", items: GOALS.map((g) => ({ ...g, on: goal === g.id, pick: () => (setGoal(g.id), finish(g.id)) })) },
  ];
  const s = steps[step];
  return (
    <section aria-labelledby="dsa-welcome-h" className="flex flex-col gap-5 border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">Welcome to DSA Mastery · {step + 1} of 3</span>
        <button type="button" onClick={() => finish(goal, true)} className="min-h-10 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
          Skip
        </button>
      </div>
      <div aria-hidden className="flex gap-1">
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 ${i <= step ? "bg-signal" : "bg-line dark:bg-line-strong"}`} />
        ))}
      </div>
      <h1 id="dsa-welcome-h" className="m-0 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[36px]">
        {s.q}
      </h1>
      <div role="group" aria-labelledby="dsa-welcome-h" className={`grid gap-2 ${s.items.length === 4 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {s.items.map((it) => (
          <Choice key={it.id} label={it.label} line={it.line} on={it.on} onPick={it.pick} />
        ))}
      </div>
      {step > 0 ? (
        <button type="button" onClick={() => setStep(step - 1)} className="min-h-10 self-start font-mono text-[12px] text-fg-3 hover:text-fg">
          ← Back
        </button>
      ) : (
        <p className="m-0 text-[14px] text-fg-3">Three taps, then we take you straight to your first lesson. Everything stays open; you can change these any time.</p>
      )}
    </section>
  );
}
