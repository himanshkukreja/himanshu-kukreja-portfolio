"use client";

/**
 * A DSA Mastery concept page, on the course's reader: the same progress engine (LessonProgressProvider with course_id
 * 'dsa': each 6S beat is a stage earned by reading time, synced to learning_progress, XP keys dsa:s:/dsa:c:), the stage
 * rail, contents, reading tools (reading modes, text size, focus, notebook), and the lesson body with its highlights.
 * DSA's widgets mount into the body through DsaHydrator; the practice ladder and the way back to the map close the page.
 */
import "../dsa.css";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { LessonProgressProvider, useLessonProgress } from "@/components/LessonProgressTracker";
import LessonContentWrapper from "@/components/LessonContentWrapper";
import FocusMode from "@/components/FocusMode";
import TableOfContents from "@/components/TableOfContents";
import { useReadAloud } from "@/components/ReadAloud";
import StageRail from "@/components/learn/lesson/StageRail";
import ContentsSheet from "@/components/learn/lesson/ContentsSheet";
import { FocusControls, MobileReadingBar, ReadingDock } from "@/components/learn/lesson/ReadingTools";
import { useReadingSettings } from "@/components/learn/reading/useReading";
import { scrollToId } from "@/components/learn/lesson/layout";
import { stagePosition, fmtMin } from "@/components/learn/lesson/stageText";
import { DSA_COURSE_ID, dsaKeys, type ConceptPage } from "@/lib/dsa/types";
import DsaHydrator from "./DsaHydrator";
import SolvedMark from "../problem/SolvedMark";
import DsaCrumbs from "../DsaCrumbs";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";

type LectureCardInfo = { href: string; minutes: number; checkpoints: number; chapters: number } | null;

function Hero({ c }: { c: ConceptPage }) {
  const p = useLessonProgress();
  const { n, total } = stagePosition(p.current, p.required);
  const chip = p.completed ? `Completed · ${total}/${total} beats` : n ? `Beat ${n} of ${total} · ~${p.minutesLeft} min left` : `~${p.minutesLeft} min left`;
  return (
    <section className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-6 pt-6 sm:px-6 lg:pt-8">
      <DsaCrumbs items={[{ href: "/dsa", label: "World map" }, { label: c.regionTitle || c.moduleTitle }]} />
      <p className="m-0 font-mono text-[12px] uppercase tracking-label text-signal-text">{c.regionTitle ? `${c.moduleTitle} · Concept` : "Concept"}</p>
      <h1 className="m-0 max-w-[900px] font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[48px]">{c.title}</h1>
      <p className="m-0 max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[18px]">{c.summary}</p>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-fg-3">
        <span className="border border-line-strong px-2 py-1">{fmtMin(c.minutes)}</span>
        <span className="border border-line-strong px-2 py-1">{c.level}</span>
        <span className="border border-line-strong px-2 py-1">Kestrel {c.line.charAt(0).toUpperCase() + c.line.slice(1)}</span>
        <span className="border border-signal px-2 py-1 text-signal-text">{chip}</span>
      </div>
    </section>
  );
}

/** Left rail (xl): the six beats with their read state, and the practice ladder. */
function Rail({ c }: { c: ConceptPage }) {
  const p = useLessonProgress();
  return (
    <nav aria-label="This concept" className="sticky top-[calc(var(--reader-top,64px)+var(--reader-rail,0px)+16px)] flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The 6S loop</span>
        <ol className="m-0 flex list-none flex-col p-0">
          {p.stages
            .filter((s) => s.id !== "intro")
            .map((s, i) => {
              const done = p.completed || p.done.has(s.id);
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToId(s.id);
                    }}
                    aria-current={s.id === p.current ? "step" : undefined}
                    className={`flex min-h-10 items-center gap-2 border-l-2 pl-3 text-[14px] ${s.id === p.current ? "border-signal text-fg" : "border-line text-fg-2 hover:text-fg"}`}
                  >
                    <span className="w-4 font-mono text-[11px] text-fg-3">{done ? "✓" : i + 1}</span>
                    {s.label}
                  </a>
                </li>
              );
            })}
        </ol>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Practice</span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {c.practice.map((x) => (
            <li key={x.id}>
              <Link href={`/dsa/problems/${x.id}`} className="flex min-h-10 items-center gap-2 text-[13px] leading-snug text-fg-2 hover:text-fg">
                <SolvedMark id={x.id} />
                {x.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function End({ c }: { c: ConceptPage }) {
  return (
    <section aria-labelledby="ladder-h" className="mt-12 flex flex-col gap-4 border-t border-line pt-8">
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">Next on the road</span>
      <h2 id="ladder-h" className="m-0 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-fg">
        Practice ladder
      </h2>
      <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {c.practice.map((p, i) => (
          <li key={p.id} className="bg-surface">
            <Link href={`/dsa/problems/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="w-6 font-mono text-[12px] text-fg-3">{i + 1}</span>
              <SolvedMark id={p.id} />
              <span className="min-w-0 flex-1 text-[15px] text-fg">{p.title}</span>
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{p.level}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        {c.practice[0] && (
          <Link href={`/dsa/problems/${c.practice[0].id}`} className="inline-flex min-h-11 items-center bg-signal px-4 text-[15px] font-semibold text-on-signal">
            Start step 1 →
          </Link>
        )}
        <Link href={`/dsa?node=${encodeURIComponent(c.checkpoint?.nodeId || "")}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Back to the map
        </Link>
      </div>
    </section>
  );
}

function Body({ c, lecture }: { c: ConceptPage; lecture: LectureCardInfo }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState(false);
  const { size } = useReadingSettings();
  const readAloud = useReadAloud(contentRef);
  const toggleFocus = useCallback(() => setFocus((f) => !f), []);
  const tools = { readAloud, focus, onFocus: toggleFocus, size, onContents: () => setSheet(true) };
  return (
    <>
      <Hero c={c} />
      <StageRail onOpenContents={() => setSheet(true)} />
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
        <FocusMode focus={focus} onFocusChange={setFocus} leftOnMobile={false} sidebarLeft={<Rail c={c} />} sidebarRight={<TableOfContents toc={c.toc} stages={c.stages} />}>
          {lecture && <LectureEntry lecture={lecture} what="The whole concept" />}
          <LessonContentWrapper ref={contentRef} htmlContent={c.html} courseId={DSA_COURSE_ID} week={c.module} lessonSlug={c.id} lessonTitle={c.title} />
          <DsaHydrator rootRef={contentRef} concept={c} />
          <End c={c} />
        </FocusMode>
      </div>
      <div aria-hidden data-focus-hide className="h-20 lg:hidden" />
      <ReadingDock {...tools} />
      <MobileReadingBar {...tools} />
      {focus && <FocusControls stages={c.stages} size={size} onExit={() => setFocus(false)} />}
      <ContentsSheet open={sheet} onClose={() => setSheet(false)} toc={c.toc} stages={c.stages} kicker={c.moduleTitle.toUpperCase()} title={c.title} />
    </>
  );
}

export default function DsaConceptReader({ concept: c, lecture = null }: { concept: ConceptPage; lecture?: LectureCardInfo }) {
  const xpKeys = useMemo(() => ({ stage: (id: string) => dsaKeys.stage(c.id, id), lesson: dsaKeys.concept(c.id) }), [c.id]);
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={c.module} lessonSlug={c.id} title={c.title} stages={c.stages} contentVersion={c.contentVersion} xpKeys={xpKeys}>
      <Body c={c} lecture={lecture} />
    </LessonProgressProvider>
  );
}
