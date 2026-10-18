"use client";

/** /learn/labs: every code lab by world, with difficulty, time, tests and your progress. */
import Link from "next/link";
import { useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { useLabProgress } from "@/lib/learn/labs/progress";
import { PYTHON_VERSION, RUNTIME_DOWNLOAD_LABEL } from "@/lib/learn/labs/runtime";
import { DIFFICULTY_LABEL, labKey, type LabSummary } from "@/lib/learn/labs/types";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";

export default function LabsIndex({ labs }: { labs: LabSummary[] }) {
  const { done, hydrated } = useGame();
  const progress = useLabProgress();
  const state = (l: LabSummary) => ((hydrated && done[labKey(l.id)]) || progress[l.id]?.passedAt ? "done" : progress[l.id]?.runs ? "started" : "new");
  const cleared = labs.filter((l) => state(l) === "done").length;
  const xpLeft = labs.filter((l) => state(l) !== "done").reduce((a, l) => a + l.xp, 0);
  const worlds = useMemo(() => {
    const m = new Map<number, LabSummary[]>();
    for (const l of labs) m.set(l.week, [...(m.get(l.week) ?? []), l]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [labs]);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · code labs · free</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          Build it yourself<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[760px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          More interviews now include an &ldquo;implement this component&rdquo; round: a rate limiter, an LRU cache, a consistent hashing ring. Each lab here is one of those, taken straight from a lesson. Write Python in the browser and run it against example tests and hidden edge cases.
        </p>
        <div className="flex flex-wrap gap-px self-start border border-line bg-line font-mono">
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-fg">{cleared}</span>/{labs.length} cleared
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-signal-text">{xpLeft}</span> XP to earn
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">Python {PYTHON_VERSION} · runs on your device</span>
        </div>
        <ul className="m-0 grid max-w-[980px] list-none gap-px border border-line bg-line p-0 text-sm text-fg-2 sm:grid-cols-3">
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">No install, no server</span>
            Python runs in your browser (Pyodide, CPython compiled to WebAssembly). The first run downloads it once, {RUNTIME_DOWNLOAD_LABEL}.
          </li>
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">Hidden tests</span>
            Edge cases you only see after a run. They ship with the page, so they aren&apos;t secret: they&apos;re practice, not an exam.
          </li>
          <li className="bg-surface p-4">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-label text-fg">Works offline</span>
            Save a lab (or a whole world) and it runs with no internet. Your code autosaves in this browser.
          </li>
        </ul>
      </header>

      {!labs.length && <p className="text-fg-3">No labs are published yet. Check back soon.</p>}

      {worlds.map(([week, list]) => (
        <section key={week} aria-labelledby={`labs-w${week}`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <h2 id={`labs-w${week}`} className="m-0 flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">World {list[0].weekCode}</span>
              <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg">{list[0].worldTitle}</span>
            </h2>
            {list[0].weekKey && <SaveGroupButton group={list[0].weekKey} label="Save world offline" />}
          </div>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
            {list.map((l) => {
              const s = state(l);
              const runs = progress[l.id]?.runs ?? 0;
              return (
                <li key={l.id}>
                  <Link href={l.href} className={`flex h-full flex-col gap-3 border bg-surface p-5 hover:border-fg-3 ${s === "done" ? "border-line" : "border-line-strong"}`}>
                    <span className="flex items-center justify-between gap-2 font-mono text-[11px] tracking-label">
                      <span className="text-signal-text">LAB · W{l.weekCode} · {l.topic.toUpperCase()}</span>
                      <span className={s === "done" ? "text-ok" : s === "started" ? "text-signal-text" : "text-fg-3"}>{s === "done" ? "CLEARED ✓" : s === "started" ? `${runs} RUN${runs === 1 ? "" : "S"}` : "NEW"}</span>
                    </span>
                    <span className="font-display text-[24px] font-bold leading-[1.08] tracking-[-0.02em] text-fg">{l.title}</span>
                    {l.summary && <span className="text-sm leading-relaxed text-fg-2">{l.summary}</span>}
                    {l.lessons[0] && (
                      <span className="text-xs text-fg-3">
                        From {l.lessons[0].code} · {l.lessons[0].title}
                      </span>
                    )}
                    <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[12px] text-fg-3">
                      <span className="text-fg">{DIFFICULTY_LABEL[l.difficulty]}</span>
                      <span>~{l.minutes} min</span>
                      <span>
                        {l.tests.visible} + {l.tests.hidden} hidden tests
                      </span>
                      <span className={`ml-auto ${s === "done" ? "text-fg-3" : "text-signal-text"}`}>+{l.xp} XP</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </main>
  );
}
