"use client";

/**
 * A DSA Mastery concept page, on the course's reader: the same progress engine (LessonProgressProvider with course_id
 * 'dsa': each 6S beat is a stage earned by reading time, synced to learning_progress, XP keys dsa:s:/dsa:c:), the stage
 * rail, contents, reading tools (reading modes, text size, focus, notebook), and the lesson body with its highlights.
 * DSA's widgets mount into the body through DsaHydrator; the practice problems and the way back close the page.
 *
 * Beginner pass (owner, 9 Nov 2026): plain stage names ("The problem", with "Scenario" small), "In one picture" (the
 * lesson's own pattern card) and the lecture first, jargon tooltips on the lesson text, and in the simple view the
 * small print in one quiet line and the lesson one stage at a time with the edge cases folded (OneStage). The full
 * view ("Show everything") keeps every chip and the whole lesson on one page.
 */
import ConnectedPanel from "@/components/learn/connections/ConnectedPanel";
import "../dsa.css";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { LessonProgressProvider, useLessonProgress } from "@/components/LessonProgressTracker";
import { useDsaLessonAward } from "@/components/dsa/rewards/useDsaBits";
import LessonContentWrapper from "@/components/LessonContentWrapper";
import FocusMode from "@/components/FocusMode";
import TableOfContents from "@/components/TableOfContents";
import { useReadAloud } from "@/components/ReadAloud";
import { listenKey } from "@/lib/listen/manifest";
import StageRail from "@/components/learn/lesson/StageRail";
import ContentsSheet from "@/components/learn/lesson/ContentsSheet";
import { FocusControls, MobileReadingBar, ReadingDock } from "@/components/learn/lesson/ReadingTools";
import { useReadingSettings } from "@/components/learn/reading/useReading";
import { scrollToId } from "@/components/learn/lesson/layout";
import { stagePosition, fmtMin } from "@/components/learn/lesson/stageText";
import { DSA_COURSE_ID, dsaKeys, type ConceptPage } from "@/lib/dsa/types";
import { mapHref } from "@/lib/dsa/lesson-stops";
import DsaHydrator from "./DsaHydrator";
import SolvedMark from "../problem/SolvedMark";
import DsaCrumbs from "../DsaCrumbs";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import styles from "@/components/learn/lesson/reader.module.css";
import { BEAT_6S } from "@/lib/dsa/words";
import Jargon from "../glossary/Jargon";
import OneStage from "./OneStage";
import { ShowEverything, useDsaFull } from "../simple/view";

type LectureCardInfo = { href: string; minutes: number; checkpoints: number; chapters: number } | null;

const lineName = (c: ConceptPage) => c.lineLabel;

function Hero({ c }: { c: ConceptPage }) {
  const p = useLessonProgress();
  const full = useDsaFull();
  const { n, total } = stagePosition(p.current, p.required);
  const chip = p.completed ? `Completed · ${total}/${total} steps` : n ? `Step ${n} of ${total} · ~${p.minutesLeft} min left` : `~${p.minutesLeft} min left`;
  return (
    <section className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-6 pt-6 sm:px-6 lg:pt-8">
      <DsaCrumbs items={[{ href: "/dsa", label: "Learn" }, { label: c.moduleTitle }]} />
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] uppercase tracking-label text-signal-text">
        Lesson · {c.moduleTitle}
        {c.regionTitle ? <span className="normal-case tracking-normal text-fg-3">{c.regionTitle}</span> : null}
      </p>
      <h1 className="m-0 max-w-[900px] font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[48px]">{c.title}</h1>
      <p className="m-0 max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[18px]">{c.summary}</p>
      {full ? null : (
        // the simple view: the small print in one quiet line that opens on tap
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-fg-3">
          <span>
            {fmtMin(c.minutes)} · {c.level} · {p.completed ? "completed" : n ? `step ${n} of ${total}` : `${total} steps`}
          </span>
          <details className="group">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center underline decoration-line-strong underline-offset-4 hover:text-fg [&::-webkit-details-marker]:hidden">
              more<span className="sr-only"> about this lesson</span>
            </summary>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              {lineName(c) ? <span>{lineName(c)}</span> : null}
              <span>{chip}</span>
              <Link href={`/dsa/cheatsheets/${c.id}`} className="underline decoration-line-strong underline-offset-4 hover:text-fg">
                cheat sheet →
              </Link>
              <SaveOfflineButton title={c.title} kind="dsa-concept" />
            </div>
          </details>
          <ShowEverything />
        </div>
      )}
      {full ? (
        <>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-fg-3">
            <span className="border border-line-strong px-2 py-1">{fmtMin(c.minutes)}</span>
            <span className="border border-line-strong px-2 py-1">{c.level}</span>
            {lineName(c) ? <span className="border border-line-strong px-2 py-1">{lineName(c)}</span> : null}
            <span className="border border-signal px-2 py-1 text-signal-text">{chip}</span>
            <Link href={`/dsa/cheatsheets/${c.id}`} className="border border-line-strong px-2 py-1 text-fg-2 underline-offset-4 hover:border-signal hover:text-fg">
              cheat sheet →
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SaveOfflineButton title={c.title} kind="dsa-concept" />
            <ShowEverything />
          </div>
        </>
      ) : null}
    </section>
  );
}

/** "In one picture": the lesson's own pattern card at the top (its key points when it has none). Never new text. */
function Picture({ c }: { c: ConceptPage }) {
  if (!c.picture && !c.keyPoints.length) return null;
  return (
    <section aria-labelledby="dsa-picture-h" className="mb-8 border border-line border-l-4 border-l-signal bg-surface px-4 py-4 sm:px-6 sm:py-5">
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">In one picture</span>
      <h2 id="dsa-picture-h" className="m-0 mt-1 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">
        {c.picture?.title || c.title}
      </h2>
      {c.picture ? (
        <>
          <div className={`course-content ${styles.content} dsa-picture`} dangerouslySetInnerHTML={{ __html: c.picture.html }} />
          {c.picture.more ? (
            <details className="group mt-1">
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">the whole pattern card</span>
                <span className="hidden group-open:inline">fold it</span>
              </summary>
              <div className={`course-content ${styles.content} dsa-picture`} dangerouslySetInnerHTML={{ __html: c.picture.more }} />
            </details>
          ) : null}
        </>
      ) : (
        <ul className="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-fg-2">
          {c.keyPoints.slice(0, 4).map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Left rail (xl): the six beats with their read state, and the practice ladder. */
function Rail({ c }: { c: ConceptPage }) {
  const p = useLessonProgress();
  return (
    <nav aria-label="This concept" className="sticky top-[calc(var(--reader-top,64px)+var(--reader-rail,0px)+16px)] flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Lesson steps</span>
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
                    <span className="w-4 shrink-0 font-mono text-[11px] text-fg-3">{done ? "✓" : i + 1}</span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      {s.label}
                      {BEAT_6S[s.id] ? <span className="font-mono text-[10.5px] text-fg-3">{BEAT_6S[s.id]}</span> : null}
                    </span>
                  </a>
                </li>
              );
            })}
        </ol>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Practice problems</span>
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
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">Next: practise it</span>
      <h2 id="ladder-h" className="m-0 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-fg">
        Practice problems
      </h2>
      <p className="m-0 text-[15px] text-fg-2">Easiest first. Each one uses what this lesson taught.</p>
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
            Start practice problem 1 →
          </Link>
        )}
        <Link href={mapHref(c.checkpoint)} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Back to Learn
        </Link>
        <Link href={`/dsa/cheatsheets/${c.id}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Cheat sheet
        </Link>
        <Link href={`/dsa/shorts?of=${encodeURIComponent(`dsa--${c.module}--${c.id}`)}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Short videos
        </Link>
      </div>
    </section>
  );
}

function Body({ c, lecture }: { c: ConceptPage; lecture: LectureCardInfo }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const full = useDsaFull();
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState(false);
  const { size } = useReadingSettings();
  // Listen: the lesson's recorded narration (Kokoro, scripts/listen, listen/dsa/<module>/<concept>/) when its text
  // still matches, else the browser's voice
  const readAloud = useReadAloud(contentRef, { listenKey: listenKey("dsa", c.module, c.id) });
  const toggleFocus = useCallback(() => setFocus((f) => !f), []);
  const tools = { readAloud, focus, onFocus: toggleFocus, size, onContents: () => setSheet(true) };
  return (
    <>
      <Hero c={c} />
      <StageRail onOpenContents={() => setSheet(true)} />
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
        <FocusMode focus={focus} onFocusChange={setFocus} leftOnMobile={false} sidebarLeft={<Rail c={c} />} sidebarRight={<TableOfContents toc={c.toc} stages={c.stages} />}>
          <Picture c={c} />
          {lecture && <LectureEntry lecture={lecture} what="The whole lesson" />}
          <div data-dsa-one={full ? undefined : ""}>
            <LessonContentWrapper ref={contentRef} htmlContent={c.html} courseId={DSA_COURSE_ID} week={c.module} lessonSlug={c.id} lessonTitle={c.title} />
          </div>
          <DsaHydrator rootRef={contentRef} concept={c} />
          <Jargon rootRef={contentRef} />
          {full ? <End c={c} /> : <OneStage rootRef={contentRef} stages={c.stages} end={<End c={c} />} />}
          <ConnectedPanel page={`dsa-concept:${c.id}`} className="mt-6" />
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
  // beats and the finished lesson earn DSA Mastery Bits, never SD Mastery XP
  const award = useDsaLessonAward();
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={c.module} lessonSlug={c.id} title={c.title} stages={c.stages} contentVersion={c.contentVersion} xpKeys={xpKeys} award={award}>
      <Body c={c} lecture={lecture} />
    </LessonProgressProvider>
  );
}
