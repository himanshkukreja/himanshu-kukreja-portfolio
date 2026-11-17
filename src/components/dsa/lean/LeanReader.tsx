"use client";

/**
 * A lean lesson beyond the Academy: a street (Product Districts practice group), a camp tent (CP camp topic) or a set
 * (company-type or Core 150 gap set). Like StructureReader it owns the progress engine (course_id 'dsa', week = the module,
 * slug = module--lesson so a repeated lesson id never shares progress, each beat a stage earned by reading, Bits like any
 * lesson) and builds the props for the shared lesson shell with kind "lean": Learn, Practice (the ladder) and Check.
 */
import { useMemo } from "react";
import { useExerciseGate } from "@/components/dsa/lesson/exercises/useExerciseGate";
import { LessonProgressProvider } from "@/components/LessonProgressTracker";
import { useDsaLessonAward } from "@/components/dsa/rewards/useDsaBits";
import { DSA_COURSE_ID, dsaKeys } from "@/lib/dsa/types";
import { LEAN_KIND_WORD } from "@/lib/dsa/kinds";
import type { LeanPage } from "@/lib/dsa/kinds-load";
import LessonShell, { type LectureCardInfo } from "../lesson/LessonShell";
import type { LessonExtras } from "../concept/DsaConceptReader";
import LeanHydrator from "./LeanHydrator";

const NO_EXTRAS: LessonExtras = { nav: { position: "", prev: null, next: null }, shorts: [], shortsHref: null };

export default function LeanReader({ page: s, lecture = null, extras = NO_EXTRAS }: { page: LeanPage; lecture?: LectureCardInfo; extras?: LessonExtras }) {
  const xpKeys = useMemo(() => ({ stage: (id: string) => dsaKeys.stage(s.key, id), lesson: dsaKeys.concept(s.key) }), [s.key]);
  const award = useDsaLessonAward();
  const gate = useExerciseGate(s.key, s.html);
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={s.module} lessonSlug={s.key} title={s.title} stages={s.stages} contentVersion={s.contentVersion} xpKeys={xpKeys} award={award} gate={gate}>
      <LessonShell
        kind="lean"
        id={s.key}
        module={s.module}
        title={s.title}
        summary={s.summary}
        level={LEAN_KIND_WORD[s.kind]}
        minutes={s.minutes}
        moduleTitle={s.moduleTitle}
        lineLabel={s.rating ? `Rating ${s.rating[0]} to ${s.rating[1]}` : s.groupLabel}
        html={s.html}
        stages={s.stages}
        toc={s.toc}
        gateKind="dsa-lean"
        lecture={lecture}
        keyIdea={s.keyPoints.length ? { title: s.title, points: s.keyPoints } : null}
        practice={s.practice}
        practiceIntro=""
        checkpoint={s.checkpoint}
        hasQuiz
        cheatsheet={null}
        buildsOn={s.buildsOn}
        backHref={s.back.href}
        backLabel={s.back.label}
        hydrator={(rootRef) => <LeanHydrator rootRef={rootRef} page={s} />}
        {...extras}
      />
    </LessonProgressProvider>
  );
}
