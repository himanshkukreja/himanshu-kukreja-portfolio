"use client";

/** /learn/mock: every mock interview loop, where it sits in the course, and how you did. */
import Link from "next/link";
import { useMemo } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { LEARN_XP } from "@/lib/learn/types";
import { useLearnProgress, weekStates } from "@/lib/learn/progress";
import { useMockStatus } from "@/lib/learn/mock/store";
import { LEVEL_LABEL } from "@/lib/learn/mock/types";
import { MockGlyph, mockStateText } from "@/components/learn/hub/SkillTree";

export default function MockIndex({ map }: { map: CourseMap }) {
  const { ready, lessons, done } = useLearnProgress(map.courseId);
  const states = useMemo(() => weekStates(map, lessons, done, null), [map, lessons, done]);
  const started = useMemo(() => (ready ? new Set(states.filter((s) => s.status !== "ahead").map((s) => s.week.key)) : null), [ready, states]);
  const mocks = useMockStatus(map.mocks, started);
  const finished = mocks.filter((m) => m.state === "done").length;
  const offers = mocks.filter((m) => m.offer).length;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · mock interviews · free</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          The interview loop<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Between the worlds of the course sit {mocks.length} timed mock interviews. Each one is an unseen problem from a fictional company, a named interviewer who keeps time and throws curveballs, and a debrief with model answers, a levelled
          rubric and a hire / no-hire verdict.
        </p>
        <div className="flex flex-wrap gap-px self-start border border-line bg-line font-mono">
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-fg">{finished}</span>/{mocks.length} finished
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-signal-text">{offers}</span> offers
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            +{LEARN_XP.mock} XP each · +{LEARN_XP.mockOffer} for an offer
          </span>
        </div>
        <Link href="/learn/guide#mocks" className="inline-flex min-h-10 items-center self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
          how mock interviews work →
        </Link>
      </header>

      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {mocks.map((m) => {
          const k = m.mock;
          return (
            <li key={k.id}>
              <Link href={k.href} className="flex h-full flex-col gap-4 border border-line-strong bg-surface p-5 hover:border-fg-3 sm:p-6">
                <span className="flex items-start justify-between gap-3">
                  <span className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] tracking-label text-signal-text">
                      MOCK {String(k.n).padStart(2, "0")} · AFTER WORLD {k.afterCode} · COVERS {k.coversLabel}
                    </span>
                    <span className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.03em] text-fg">{k.company}</span>
                    <span className="text-[16px] text-fg-2">{k.title}</span>
                  </span>
                  <MockGlyph state={m.state} text={k.code} />
                </span>
                <span className="text-sm text-fg-3">
                  {k.role} · with {k.interviewer}
                </span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[12px]">
                  <span className="text-fg-3">
                    {k.minutes} min · {k.phases} phases · {k.curveballs} curveballs · suggested {LEVEL_LABEL[k.level]}
                  </span>
                  <span className={m.state === "done" ? "text-fg" : m.state === "ahead" ? "text-fg-3" : "text-signal-text"}>{mockStateText(m)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
