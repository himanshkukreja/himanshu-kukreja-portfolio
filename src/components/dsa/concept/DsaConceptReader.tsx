"use client";

/**
 * A DSA Mastery concept page: a thin adapter. It owns the progress engine (LessonProgressProvider with course_id 'dsa':
 * each 6S beat is a stage earned by reading time, synced to learning_progress, XP keys dsa:s:/dsa:c:, DSA Bits) and
 * builds the props for the shared lesson shell (components/dsa/lesson/LessonShell: Learn, Try it, Practice, Check).
 * DSA's widgets mount into the lesson body through DsaHydrator.
 *
 * Redesign (Phase 2a, Nov 2026): the old "Show everything" switch is gone; showing the whole lesson on one page is a
 * preference in the Aa reading panel. The lesson HTML itself is unchanged.
 */
import { useMemo } from "react";
import { LessonProgressProvider } from "@/components/LessonProgressTracker";
import { useDsaLessonAward } from "@/components/dsa/rewards/useDsaBits";
import { DSA_COURSE_ID, dsaKeys, type ConceptPage } from "@/lib/dsa/types";
import LessonShell, { type LectureCardInfo, type LessonShellProps } from "../lesson/LessonShell";
import DsaHydrator from "./DsaHydrator";

export type LessonExtras = Pick<LessonShellProps, "nav" | "shorts" | "shortsHref" | "buildsOn" | "usedLater">;

const NO_EXTRAS: LessonExtras = { nav: { position: "", prev: null, next: null }, shorts: [], shortsHref: null };

export default function DsaConceptReader({ concept: c, lecture = null, extras = NO_EXTRAS }: { concept: ConceptPage; lecture?: LectureCardInfo; extras?: LessonExtras }) {
  const xpKeys = useMemo(() => ({ stage: (id: string) => dsaKeys.stage(c.id, id), lesson: dsaKeys.concept(c.id) }), [c.id]);
  // beats and the finished lesson earn DSA Mastery Bits, never SD Mastery XP
  const award = useDsaLessonAward();
  const keyIdea = c.picture
    ? { title: c.picture.title || c.title, html: c.picture.html, more: c.picture.more }
    : c.keyPoints.length
      ? { title: c.title, points: c.keyPoints }
      : c.invariant
        ? { title: c.title, text: c.invariant }
        : null;
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={c.module} lessonSlug={c.id} title={c.title} stages={c.stages} contentVersion={c.contentVersion} xpKeys={xpKeys} award={award}>
      <LessonShell
        kind="concept"
        id={c.id}
        module={c.module}
        title={c.title}
        summary={c.summary}
        level={c.level}
        minutes={c.readingMinutes || c.minutes}
        moduleTitle={c.moduleTitle}
        regionTitle={c.regionTitle}
        lineLabel={c.lineLabel}
        html={c.html}
        stages={c.stages}
        toc={c.toc}
        gateKind="dsa-concept"
        lecture={lecture}
        keyIdea={keyIdea}
        practice={c.practice}
        practiceIntro="Easiest first. Each one uses what this lesson taught."
        checkpoint={c.checkpoint}
        traces={c.traces}
        races={c.races}
        hasQuiz={!!c.checkpoint?.own}
        cheatsheet={`/dsa/cheatsheets/${c.id}`}
        hydrator={(rootRef) => <DsaHydrator rootRef={rootRef} concept={c} />}
        {...extras}
      />
    </LessonProgressProvider>
  );
}
