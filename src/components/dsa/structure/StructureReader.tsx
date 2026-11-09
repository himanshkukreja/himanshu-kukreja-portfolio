"use client";

/**
 * A visual lesson on the course reader: a structure lesson (Academy Part 2, /dsa/structures/<id>) or an algorithm
 * lesson (Part 3, /dsa/algorithms/<id>; beats Meet it, See it move, Why it works, Build it, Use it well, Recap), like a
 * concept page: the progress
 * engine (course_id 'dsa', each beat a stage earned by reading, XP keys dsa:s:/dsa:c:), the stage rail, contents,
 * reading tools, and the lesson body. Its six beats are Meet it, Operations, Try it (the sandbox), Build it (the lab),
 * Use it well and Recap; the warm-up problems close the page.
 */
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
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import { DSA_COURSE_ID, dsaKeys } from "@/lib/dsa/types";
import type { StructurePage } from "@/lib/dsa/structures";
import SolvedMark from "../problem/SolvedMark";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import DsaCrumbs from "../DsaCrumbs";
import StructureHydrator from "./StructureHydrator";

type LectureCardInfo = { href: string; minutes: number; checkpoints: number; chapters: number } | null;

function Hero({ s }: { s: StructurePage }) {
  const p = useLessonProgress();
  const { n, total } = stagePosition(p.current, p.required);
  const chip = p.completed ? `Completed · ${total}/${total} parts` : n ? `Part ${n} of ${total} · ~${p.minutesLeft} min left` : `~${p.minutesLeft} min left`;
  return (
    <section className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-6 pt-6 sm:px-6 lg:pt-8">
      <DsaCrumbs items={[{ href: "/dsa", label: "World map" }, { label: s.regionTitle || s.moduleTitle }]} />
      <p className="m-0 font-mono text-[12px] uppercase tracking-label text-signal-text">
        {s.kind === "algorithm" ? "Part 3 · Algorithms" : "Part 2 · Data structures"} · {s.moduleTitle} · Lesson
      </p>
      <h1 className="m-0 max-w-[900px] font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[48px]">{s.title}</h1>
      <p className="m-0 max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[18px]">{s.summary}</p>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-fg-3">
        <span className="border border-line-strong px-2 py-1">{fmtMin(s.minutes)}</span>
        <span className="border border-line-strong px-2 py-1">{s.level}</span>
        {s.lineLabel && <span className="border border-line-strong px-2 py-1">{s.lineLabel}</span>}
        <span className="border border-signal px-2 py-1 text-signal-text">{chip}</span>
        {/* saved, the lesson keeps its clips, demos and lab for offline reading */}
        <SaveOfflineButton title={s.title} kind="dsa-concept" />
      </div>
      <nav aria-label="Jump to" className="flex flex-wrap gap-2">
        {(s.kind === "algorithm"
          ? [
              ["see", "Watch it run"],
              ["build", "Build it yourself"],
              ["warmups-h", "Warm-up problems"],
            ]
          : [
              ["sandbox", "Try the sandbox"],
              ["build", "Build it yourself"],
              ["warmups-h", "Warm-up problems"],
            ]
        ).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToId(id);
            }}
            className="inline-flex min-h-10 items-center border border-line-strong px-3 text-[14px] text-fg hover:border-signal"
          >
            {label} →
          </a>
        ))}
      </nav>
    </section>
  );
}

function Rail({ s }: { s: StructurePage }) {
  const p = useLessonProgress();
  return (
    <nav aria-label="This lesson" className="sticky top-[calc(var(--reader-top,64px)+var(--reader-rail,0px)+16px)] flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The lesson</span>
        <ol className="m-0 flex list-none flex-col p-0">
          {p.stages
            .filter((x) => x.id !== "intro")
            .map((x, i) => {
              const done = p.completed || p.done.has(x.id);
              return (
                <li key={x.id}>
                  <a
                    href={`#${x.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToId(x.id);
                    }}
                    aria-current={x.id === p.current ? "step" : undefined}
                    className={`flex min-h-10 items-center gap-2 border-l-2 pl-3 text-[14px] ${x.id === p.current ? "border-signal text-fg" : "border-line text-fg-2 hover:text-fg"}`}
                  >
                    <span className="w-4 font-mono text-[11px] text-fg-3">{done ? "✓" : i + 1}</span>
                    {x.label}
                  </a>
                </li>
              );
            })}
        </ol>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Warm-up problems</span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {s.practice.map((x) => (
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

function End({ s }: { s: StructurePage }) {
  return (
    <section aria-labelledby="warmups-h" className="mt-12 flex flex-col gap-4 border-t border-line pt-8">
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">Next: practice</span>
      <h2 id="warmups-h" className="m-0 scroll-mt-24 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-fg">
        Warm-up problems
      </h2>
      <p className="m-0 max-w-[680px] text-[15px] text-fg-2">
        {s.kind === "algorithm"
          ? "Short problems that use what you just built: a fill, a count of regions, the fewest moves, a spread from many starts. Each takes a grid as input, as rows of text or rows of numbers."
          : s.structure === "linked-list"
            ? "Short, easy problems on the moves you just built: walking, turning arrows, two pointers. Each takes a linked list as input (ListNode in every language)."
            : s.structure === "stack"
              ? "Short problems that use the stack you just built: matching brackets, undoing, evaluating an expression, and finding the next bigger value. The first ones are easy; the last ones are a step up, and each says so."
              : s.structure === "queue"
                ? "Short problems that use the queue you just built: counting recent requests, a moving average, a simulation that sends items to the back, a stack made from queues and a ring of log lines. The first ones are easy; the last one is a step up, and each says so."
                : s.structure === "tree"
                  ? "Short problems that walk the trees you just met: the total size of a folder, the levels of an org chart, a mirrored menu, a price tree that must follow the search rule, and a thread listed row by row. Each takes a tree as arrays of left and right children. The first ones are easy; the last two are a step up."
                  : "Short problems on the operations you just built."}
      </p>
      <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {s.practice.map((p, i) => (
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
        {s.practice[0] && (
          <Link href={`/dsa/problems/${s.practice[0].id}`} className="inline-flex min-h-11 items-center bg-signal px-4 text-[15px] font-semibold text-on-signal">
            Start warm-up 1 →
          </Link>
        )}
        <Link href={`/dsa?node=${encodeURIComponent(s.checkpoint?.nodeId || "")}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Back to the map
        </Link>
        <Link href={`/dsa/shorts?of=${encodeURIComponent(`dsa--${s.module}--${s.id}`)}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          Its shorts
        </Link>
      </div>
    </section>
  );
}

function Body({ s, lecture }: { s: StructurePage; lecture: LectureCardInfo }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState(false);
  const { size } = useReadingSettings();
  const readAloud = useReadAloud(contentRef, { listenKey: listenKey("dsa", s.module, s.id) });
  const toggleFocus = useCallback(() => setFocus((f) => !f), []);
  const tools = { readAloud, focus, onFocus: toggleFocus, size, onContents: () => setSheet(true) };
  return (
    <>
      <Hero s={s} />
      <StageRail onOpenContents={() => setSheet(true)} />
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
        <FocusMode focus={focus} onFocusChange={setFocus} leftOnMobile={false} sidebarLeft={<Rail s={s} />} sidebarRight={<TableOfContents toc={s.toc} stages={s.stages} />}>
          {lecture && <LectureEntry lecture={lecture} what="The whole lesson" />}
          <LessonContentWrapper ref={contentRef} htmlContent={s.html} courseId={DSA_COURSE_ID} week={s.module} lessonSlug={s.id} lessonTitle={s.title} />
          <StructureHydrator rootRef={contentRef} page={s} />
          <End s={s} />
        </FocusMode>
      </div>
      <div aria-hidden data-focus-hide className="h-20 lg:hidden" />
      <ReadingDock {...tools} />
      <MobileReadingBar {...tools} />
      {focus && <FocusControls stages={s.stages} size={size} onExit={() => setFocus(false)} />}
      <ContentsSheet open={sheet} onClose={() => setSheet(false)} toc={s.toc} stages={s.stages} kicker={s.moduleTitle.toUpperCase()} title={s.title} />
    </>
  );
}

export default function StructureReader({ page: s, lecture = null }: { page: StructurePage; lecture?: LectureCardInfo }) {
  const xpKeys = useMemo(() => ({ stage: (id: string) => dsaKeys.stage(s.id, id), lesson: dsaKeys.concept(s.id) }), [s.id]);
  // beats and the finished lesson earn DSA Mastery Bits, never SD Mastery XP
  const award = useDsaLessonAward();
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={s.module} lessonSlug={s.id} title={s.title} stages={s.stages} contentVersion={s.contentVersion} xpKeys={xpKeys} award={award}>
      <Body s={s} lecture={lecture} />
    </LessonProgressProvider>
  );
}
