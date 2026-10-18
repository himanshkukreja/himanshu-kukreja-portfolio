"use client";

/**
 * /learn/numbers: the estimation calculator on top, the reference numbers below, a drill link to
 * the estimation trial. All client-side; the query lives in ?q= so a link reproduces the maths.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LESSONS } from "@/lib/learn/numbers/reference";
import Calculator, { DEFAULT_Q, type CalcSource } from "./Calculator";
import ReferenceTables from "./ReferenceTables";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";

export default function NumbersPlayground() {
  const [calc, setCalc] = useState<{ q: string; source: CalcSource }>({ q: DEFAULT_Q, source: "default" });
  const calcRef = useRef<HTMLElement>(null);

  // a shared link (?q=…) opens on its calculation; read after mount so the server render matches
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const q = new URLSearchParams(window.location.search).get("q");
        if (q && q.trim()) setCalc({ q: q.slice(0, 4000), source: "link" });
      } catch {
        // no URL access: keep the default example
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const onChange = useCallback((q: string, source: CalcSource) => setCalc({ q, source }), []);

  const tryExpr = useCallback((q: string) => {
    setCalc({ q, source: "table" });
    calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:gap-16 lg:pb-24">
      <header className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · tools · W00 · Part 3</span>
        <h1 className="font-display text-[clamp(40px,6.4vw,88px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          Numbers playground<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[720px] text-[16px] leading-relaxed text-fg-2 sm:text-[19px]">
          Type an estimate the way you&apos;d say it in an interview and get the worked answer: storage, bandwidth, QPS, servers. Below are the numbers the course teaches, each linked to the lesson it comes from.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12.5px] sm:text-[13px]">
          <SaveOfflineButton title="Numbers playground" kind="tool" url="/learn/numbers" />
          <Link href={LESSONS.part3} className="inline-flex min-h-10 items-center text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            the estimation lesson →
          </Link>
          <a href="#drill" className="inline-flex min-h-10 items-center text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            drill it
          </a>
          <a href="#reference" className="inline-flex min-h-10 items-center text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            reference numbers
          </a>
        </div>
      </header>

      <section ref={calcRef} aria-labelledby="calc-h" className="scroll-mt-24">
        <Calculator q={calc.q} source={calc.source} onChange={onChange} />
      </section>

      <Drill />

      <ReferenceTables onTry={tryExpr} />

      <p className="max-w-[760px] border-t border-line pt-6 text-[13px] leading-relaxed text-fg-3">
        Every number here is copied from the lesson named under its table. If one ever disagrees with its lesson, the lesson is the source of truth. Data units follow the course: 1 KB = 1,000 bytes (decimal); KiB, MiB and GiB are the 1,024-based units.
      </p>
    </main>
  );
}

function Drill() {
  return (
    <section id="drill" aria-labelledby="drill-h" className="flex scroll-mt-24 flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Mini drill · 15 questions</span>
        <h2 id="drill-h" className="m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[32px]">
          Can you do it without the calculator?
        </h2>
        <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
          Week 0&apos;s trial has a part just for estimation: RPS from daily volume, peak factors, storage with replication, bits vs bytes. Pass it with 80% for +100 XP. The lesson&apos;s own quick checks are a gentler warm-up.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        <Link href={`${LESSONS.trial}?part=3`} className="inline-flex min-h-[52px] items-center bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
          Trial · Part 3 · Estimation →
        </Link>
        <Link href={`${LESSONS.part3}#sd-quiz-0-t`} className="inline-flex min-h-[52px] items-center border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-surface-2">
          Quick checks in the lesson
        </Link>
      </div>
    </section>
  );
}
