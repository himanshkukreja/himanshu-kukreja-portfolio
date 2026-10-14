"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import SimpleMCQAssessment, { type SimpleMCQAssessmentHandle } from "@/components/SimpleMCQAssessment";
import MCQSectionsWithReset from "@/components/MCQSectionsWithReset";
import type { MCQAssessment } from "@/lib/mcq-parser";

/** The original all-questions page: untimed practice, no XP, answers kept in mcq_user_answers. */
export default function PracticeView({
  assessment,
  courseId,
  week,
  lessonSlug,
  hubHref,
  comments,
}: {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
  hubHref: string;
  comments?: React.ReactNode;
}) {
  const mcqRef = useRef<SimpleMCQAssessmentHandle>(null);
  const [answeredCount, setAnsweredCount] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-[13px] text-fg-3">
        <Link href={hubHref} className="py-1.5 text-fg-3 no-underline hover:text-fg">
          ← trials
        </Link>
        <span className="text-line-strong">/</span>
        <span aria-current="page" className="text-fg">
          practice · all {assessment.totalQuestions}
        </span>
      </nav>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <SimpleMCQAssessment
            key={`${week}/${lessonSlug}`}
            ref={mcqRef}
            assessment={assessment}
            courseId={courseId}
            week={week}
            lessonSlug={lessonSlug}
            onAnsweredCountChange={setAnsweredCount}
          />
        </div>
        <aside className="hidden lg:block">
          <MCQSectionsWithReset
            sections={assessment.sections}
            courseId={courseId}
            week={week}
            lessonSlug={lessonSlug}
            assessmentRef={mcqRef}
            answeredCount={answeredCount}
          />
        </aside>
      </div>
      {comments}
    </div>
  );
}
