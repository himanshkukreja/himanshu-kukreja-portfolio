"use client";

/**
 * The top of the /dsa hub (the beginner pass, owner 9 Nov 2026): one clear next step.
 *
 * - First visit: the welcome, three taps (experience, language, goal), skippable. "Experienced" turns on the full view;
 *   the language becomes the one the lessons, cheat sheets and the problem room use (dsa.lang).
 * - After that: one big "Start lesson 1" / "Continue: <next>" (the Academy's frontier from computeWorld, the same stop
 *   the map's "you are here" marks), and a compact "Today" line (the daily problem, what's due in Revise). The full
 *   view shows the daily, Revise and certificate cards instead of the line.
 * Nothing is locked anywhere: the button only recommends.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { computeWorld } from "@/lib/dsa/map/progress";
import type { DsaLang, WorldNode, WorldSpec } from "@/lib/dsa/types";
import { STOP } from "@/lib/dsa/words";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { track } from "@/lib/track";
import { useDsaProgress } from "../progress/useDsaProgress";
import { useDsaDaily, useDsaStreak } from "../daily/useDsaDaily";
import { useResolves } from "../revise/useResolves";
import { useLang } from "../concept/widgets";
import HubToday from "./HubToday";
import { ShowEverything, saveWelcome, setDsaFull, useDsaFull, useWelcome, type Experience, type Goal } from "../simple/view";

/* ------------------------------------------------------------------ the welcome */

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
      className={`flex min-h-16 w-full flex-col items-start justify-center gap-0.5 border px-4 py-3 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
        on ? "border-signal bg-[var(--c-dsa-hl,transparent)] shadow-[inset_4px_0_0_var(--c-signal)]" : "border-line-strong bg-surface hover:border-fg"
      }`}
    >
      <span className="text-[16px] font-semibold text-fg">{label}</span>
      {line ? <span className="text-[13.5px] text-fg-3">{line}</span> : null}
    </button>
  );
}

function Welcome() {
  const [, setLang] = useLang();
  const [step, setStep] = useState(0);
  const [exp, setExp] = useState<Experience | null>(null);
  const [lang, pickLang] = useState<DsaLang | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);

  const finish = (g: Goal | null, skipped = false) => {
    if (lang) setLang(lang);
    if (exp) setDsaFull(exp === "experienced");
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
          <span key={i} className={`h-1 flex-1 ${i <= step ? "bg-signal" : "bg-surface-2"}`} />
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

/* ------------------------------------------------------------------ continue */

function nodeKind(n: WorldNode): string {
  if (n.type === "concept") return STOP.concept;
  if (n.type === "practice") return STOP.practice;
  if (n.type === "checkpoint") return STOP.checkpoint;
  return "";
}

function TodayLine() {
  const { data } = useDsaDaily();
  const streak = useDsaStreak();
  const r = useResolves();
  const { due, ready } = useReviewCards("dsa");
  const d = data?.daily;
  const n = r.due.length + due.length;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Today</span>
      {d ? (
        <Link href={`/dsa/problems/${d.problem.id}`} className="inline-flex min-h-10 items-center gap-2 text-[14.5px] text-fg hover:text-signal-text">
          {streak?.today ? <Check className="h-4 w-4 text-ok-text" aria-label="solved" /> : null}
          <span className="font-semibold">Daily problem:</span>
          <span className="min-w-0 truncate underline decoration-line-strong underline-offset-4">{d.problem.title}</span>
        </Link>
      ) : (
        <span className="inline-flex min-h-10 items-center gap-2 text-[14.5px] text-fg-3">
          <span className="font-semibold">Daily problem:</span> …
        </span>
      )}
      <Link href="/dsa/revise" className="inline-flex min-h-10 items-center gap-2 text-[14.5px] text-fg hover:text-signal-text">
        <span className="font-semibold">Revise:</span>
        <span className="underline decoration-line-strong underline-offset-4">{r.ready && ready ? (n ? `${n} due` : "nothing due") : "…"}</span>
      </Link>
      {streak && streak.current > 0 ? <span className="font-mono text-[12px] text-fg-3">{streak.current}-day streak</span> : null}
    </div>
  );
}

function ContinueCard({ academy }: { academy: WorldSpec }) {
  const progress = useDsaProgress();
  const full = useDsaFull();
  const world = useMemo(() => computeWorld(academy, progress), [academy, progress]);
  const at = useMemo(() => {
    if (!world.frontier) return null;
    const region = academy.regions.find((r) => r.id === world.frontier!.regionId) || null;
    const node = region?.stretches.flatMap((s) => s.nodes).find((n) => n.id === world.frontier!.nodeId) || null;
    return node && region ? { node, region } : null;
  }, [world.frontier, academy]);
  const started = world.done > 0 || progress.solved.size > 0 || progress.concepts.size > 0;
  const first = !started && at?.node.type === "concept";
  const verb = first ? `Start ${STOP.concept.toLowerCase()} 1` : "Continue";
  return (
    <section aria-labelledby="dsa-next-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">{started ? "Pick up where you left off" : "Your first step"}</span>
        <ShowEverything />
      </div>
      {at?.node.href ? (
        <>
          <h1 id="dsa-next-h" className="m-0 flex flex-col gap-1">
            <span className="font-mono text-[12px] font-normal text-fg-3">
              {nodeKind(at.node)} · {at.region.code.toUpperCase()} {at.region.moduleTitle || at.region.title}
            </span>
            <span className="font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">{at.node.title}</span>
          </h1>
          <Link
            href={at.node.href}
            aria-busy={!progress.ready}
            onClick={() => track("dsa_continue", { node: at.node.id, first })}
            className={`inline-flex min-h-14 w-full items-center justify-center gap-2 bg-signal px-6 text-center text-[17px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:w-auto sm:self-start ${progress.ready ? "" : "invisible"}`}
          >
            {verb}: {at.node.title}
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        </>
      ) : (
        <h1 id="dsa-next-h" className="m-0 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-fg">
          {progress.ready ? "Everything written so far is done. Browse everything below." : " "}
        </h1>
      )}
      {full ? null : <TodayLine />}
    </section>
  );
}

/** The hub's top: the welcome on a first visit, else the one next step (and, in the full view, today's cards). */
export default function HubStart({ academy }: { academy: WorldSpec | null }) {
  const welcome = useWelcome();
  const full = useDsaFull();
  // the server and the first paint don't know this browser yet: hold the space so nothing jumps
  if (welcome === undefined) return <div aria-hidden className="min-h-[260px] border border-line bg-surface" />;
  if (welcome === null) return <Welcome />;
  return (
    <div className="flex flex-col gap-3">
      {academy ? <ContinueCard academy={academy} /> : null}
      {full ? <HubToday academy={academy} /> : null}
    </div>
  );
}
