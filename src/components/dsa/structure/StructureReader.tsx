"use client";

/**
 * A visual lesson: a structure lesson (Academy Part 2, /dsa/structures/<id>) or an algorithm lesson (Part 3,
 * /dsa/algorithms/<id>). A thin adapter like the concept reader: it owns the progress engine (course_id 'dsa', each beat
 * a stage earned by reading, XP keys dsa:s:/dsa:c:, DSA Bits) and builds the props for the shared lesson shell
 * (components/dsa/lesson/LessonShell). A structure's beats are Meet it, Operations, Try it (the sandbox), Build it (the
 * lab), Use it well and Recap; an algorithm's are Meet it, See it move, Why it works, Build it, Use it well and Recap.
 * lib/dsa/lesson-steps.ts maps them onto Learn, Try it, Practice and Check.
 */
import { useMemo } from "react";
import { useExerciseGate } from "@/components/dsa/lesson/exercises/useExerciseGate";
import { LessonProgressProvider } from "@/components/LessonProgressTracker";
import { useDsaLessonAward } from "@/components/dsa/rewards/useDsaBits";
import { DSA_COURSE_ID, dsaKeys } from "@/lib/dsa/types";
import type { StructurePage } from "@/lib/dsa/structures";
import LessonShell, { type LectureCardInfo } from "../lesson/LessonShell";
import type { LessonExtras } from "../concept/DsaConceptReader";
import StructureHydrator from "./StructureHydrator";

const NO_EXTRAS: LessonExtras = { nav: { position: "", prev: null, next: null }, shorts: [], shortsHref: null };

export default function StructureReader({ page: s, lecture = null, extras = NO_EXTRAS }: { page: StructurePage; lecture?: LectureCardInfo; extras?: LessonExtras }) {
  const xpKeys = useMemo(() => ({ stage: (id: string) => dsaKeys.stage(s.id, id), lesson: dsaKeys.concept(s.id) }), [s.id]);
  // beats and the finished lesson earn DSA Mastery Bits, never SD Mastery XP
  const award = useDsaLessonAward();
  const gate = useExerciseGate(s.id, s.html);
  return (
    <LessonProgressProvider courseId={DSA_COURSE_ID} week={s.module} lessonSlug={s.id} title={s.title} stages={s.stages} contentVersion={s.contentVersion} xpKeys={xpKeys} award={award} gate={gate}>
      <LessonShell
        kind={s.kind === "algorithm" ? "algorithm" : "structure"}
        id={s.id}
        module={s.module}
        title={s.title}
        summary={s.summary}
        level={s.level}
        minutes={s.minutes}
        moduleTitle={s.moduleTitle}
        lineLabel={s.lineLabel}
        html={s.html}
        stages={s.stages}
        toc={s.toc}
        gateKind={s.kind === "algorithm" ? "dsa-algorithm" : "dsa-structure"}
        lecture={lecture}
        keyIdea={s.keyPoints.length ? { title: s.title, points: s.keyPoints } : null}
        practice={s.practice}
        practiceIntro={s.warmupsIntro}
        checkpoint={s.checkpoint}
        visualizer={s.visualizer}
        labId={s.lab?.spec.id ?? null}
        hasQuiz={!!s.checkpoint?.own}
        cheatsheet={null}
        hydrator={(rootRef) => <StructureHydrator rootRef={rootRef} page={s} />}
        {...extras}
      />
    </LessonProgressProvider>
  );
}
