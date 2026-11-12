"use client";

/**
 * /mock: every mock interview loop, where it sits in the course, and how you did. Two tabs: the system design loops
 * between the worlds, and the machine-coding (LLD) mocks, one per low-level design case study (/mock#lld opens it).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CourseMap } from "@/lib/learn/types";
import type { CourseMock } from "@/lib/learn/mock/types";
import { LEARN_XP } from "@/lib/learn/types";
import { useLearnProgress, weekStates } from "@/lib/learn/progress";
import { useMockStatus } from "@/lib/learn/mock/store";
import { LEVEL_LABEL } from "@/lib/learn/mock/types";
import { MockGlyph, mockStateText } from "@/components/learn/hub/SkillTree";
import WatchHowItWorks from "@/components/learn/guide/videos/WatchHowItWorks";

type LldMock = CourseMock & { name: string; blurb: string; difficulty: string };
const LLD_OPEN = new Set(["lld"]);
const NONE: LldMock[] = [];

export default function MockIndex({ map, lld = NONE }: { map: CourseMap; lld?: LldMock[] }) {
  const { ready, lessons, done } = useLearnProgress(map.courseId);
  const states = useMemo(() => weekStates(map, lessons, done, null), [map, lessons, done]);
  const started = useMemo(() => (ready ? new Set(states.filter((s) => s.status !== "ahead").map((s) => s.week.key)) : null), [ready, states]);
  const mocks = useMockStatus(map.mocks, started);
  // machine-coding mocks are open from the start (the case studies stand alone)
  const lldMocks = useMockStatus(lld, LLD_OPEN);
  const [tab, setTab] = useState<"hld" | "lld">("hld");
  useEffect(() => {
    const t = window.setTimeout(() => window.location.hash === "#lld" && setTab("lld"), 0);
    return () => window.clearTimeout(t);
  }, []);
  const pick = (t: "hld" | "lld") => {
    setTab(t);
    try {
      window.history.replaceState(null, "", t === "lld" ? "#lld" : window.location.pathname);
    } catch {
      // history blocked: the tab still switches
    }
  };
  const shown = tab === "lld" ? lldMocks : mocks;
  const finished = shown.filter((m) => m.state === "done").length;
  const offers = shown.filter((m) => m.offer).length;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · mock interviews · free</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          The interview loop<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Between the worlds of the course sit {mocks.length} timed mock interviews. Each one is an unseen problem from a fictional company, a named interviewer who keeps time and throws curveballs, and a debrief with model answers, a levelled
          rubric and a hire / no-hire verdict.{lld.length > 0 && <> And {lld.length} machine-coding rounds, one per low-level design case study, with an AI interviewer and a code editor.</>}
        </p>
        <WatchHowItWorks id="mock-interviews" guide={false} />
        <div className="flex flex-wrap gap-px self-start border border-line bg-line font-mono">
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-fg">{finished}</span>/{shown.length} finished
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            <span className="text-xl font-semibold text-signal-text">{offers}</span> offers
          </span>
          <span className="bg-bg px-4 py-2.5 text-[13px] text-fg-3">
            +{LEARN_XP.mock} XP each · +{LEARN_XP.mockOffer} for an offer
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/mock/peers" className="inline-flex min-h-11 items-center border border-signal px-4 font-mono text-[13px] font-semibold text-signal-text hover:bg-surface-2">
            practise with a real person: peer mocks →
          </Link>
          <Link href="/guide#mocks" className="inline-flex min-h-10 items-center font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            how mock interviews work →
          </Link>
        </div>
      </header>

      {lld.length > 0 && (
        <div role="tablist" aria-label="Kind of round" className="-mb-4 flex gap-1 overflow-x-auto border-b border-line">
          {(
            [
              ["hld", `System design · ${mocks.length}`],
              ["lld", `Machine coding (LLD) · ${lld.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`mock-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`mock-panel-${k}`}
              onClick={() => pick(k)}
              className={`-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 font-mono text-[12px] uppercase tracking-label ${tab === k ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "lld" && lld.length > 0 && (
        <section id="mock-panel-lld" role="tabpanel" aria-labelledby="mock-tab-lld" className="flex flex-col gap-4">
          <p className="m-0 max-w-[760px] text-[15px] leading-relaxed text-fg-2">
            A 60–75 minute machine-coding round on a case study: clarify the requirements, the entities and class diagram, patterns and their trade-offs, the code in an editor, then concurrency and edge cases. The AI interviewer answers from
            the case study&apos;s own requirements and brings one of its follow-ups as a requirement change while you code. The debrief grades you against the case study&apos;s interview checklist. Free with a signed-in account, on your
            daily AI credits.
          </p>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
            {lldMocks.map((m) => {
              const k = m.mock as LldMock;
              return (
                <li key={k.id}>
                  <Link href={k.href} className="flex h-full flex-col gap-3 border border-line-strong bg-surface p-5 hover:border-fg-3">
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-[11px] tracking-label text-signal-text">
                          LLD-{String(k.n).padStart(2, "0")} · {k.difficulty.toUpperCase()} · {k.minutes} MIN
                        </span>
                        <span className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.03em] text-fg">{k.name}</span>
                      </span>
                      <MockGlyph state={m.state} text={k.code} />
                    </span>
                    <span className="text-[14px] leading-snug text-fg-2">{k.blurb}</span>
                    <span className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[12px]">
                      <span className="text-fg-3">
                        {k.interviewer} · {k.company}
                      </span>
                      <span className={m.state === "done" ? "text-fg" : "text-signal-text"}>{m.state === "ready" ? "START" : mockStateText(m)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {tab === "hld" && (
      <ol id="mock-panel-hld" role={lld.length > 0 ? "tabpanel" : undefined} aria-labelledby={lld.length > 0 ? "mock-tab-hld" : undefined} className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
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
      )}
    </main>
  );
}
