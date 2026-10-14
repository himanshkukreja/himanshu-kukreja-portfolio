import { Suspense } from "react";
import { formatWeekTopic, getWeekResources, type LearningResource } from "@/lib/github";
import type { MCQAssessment } from "@/lib/mcq-parser";
import LessonComments from "./LessonComments";
import TrialApp from "./learn/trial/TrialApp";
import type { TrialLesson, TrialPart } from "./learn/trial/engine";

/**
 * Server wrapper for an MCQ lesson. Splits the week's assessment into per-part trials
 * (`?part=N`), a trial hub (no `part`) and the original all-questions practice page (`?view=all`).
 * It looks up the week's lessons itself so each part can link to (and unlock with) its lesson.
 *
 * Must be rendered from a server component (it is async).
 */
interface MCQAssessmentWrapperProps {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
  weekDisplayName?: string;
  previousResource?: { week: string; slug: string; title: string } | null;
  nextResource?: { week: string; slug: string; title: string } | null;
  /** e.g. "Previous · Week 1" when the link leaves this week */
  previousLabel?: string;
  nextLabel?: string;
  /** Kept for compatibility with the old layout; the trial screens are full width. */
  sidebarLeft?: React.ReactNode;
  /** Render the discussion thread under the hub / practice views (default true). */
  showComments?: boolean;
}

const sentenceCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

function weekLabelFor(week: string): string {
  const m = week.match(/^week-(\d+)/);
  return m ? `Week ${m[1].padStart(2, "0")}` : formatWeekTopic(week);
}

function lessonFor(r: LearningResource): TrialLesson {
  let label = r.title;
  if (r.type === "day-content" && r.day) label = `Day ${parseInt(r.day.replace(/\D/g, ""), 10) || r.day}`;
  else if (r.type === "foundations") {
    const m = r.slug.match(/part-(\d+)/);
    label = m ? `Foundations ${m[1]}` : "Foundations";
  } else if (r.type === "capstone") label = "the capstone";
  return { slug: r.slug, title: r.title, label };
}

/** Pair each MCQ part with the lesson it tests: Part N ↔ Day N (or Foundations part N); "Integration" ↔ the capstone. */
function buildParts(assessment: MCQAssessment, resources: LearningResource[]): TrialPart[] {
  const byOrder = (a: LearningResource, b: LearningResource) => a.order - b.order || a.slug.localeCompare(b.slug);
  const days = resources.filter((r) => r.type === "day-content").sort(byOrder);
  const foundations = resources.filter((r) => r.type === "foundations").sort(byOrder);
  const capstone = resources.find((r) => r.type === "capstone") ?? null;
  const pool = days.length ? days : foundations;

  return assessment.sections.map((section, idx) => {
    const nums = section.questions.map((q) => q.number);
    const title = section.title.replace(/^(?:part|section)\s+\d+\s*[:.\-–—]\s*/i, "").trim() || section.title;
    let lesson: TrialLesson | null = null;
    let boss = false;
    if (/integration|advanced/i.test(title) && capstone && !pool[idx]) {
      lesson = lessonFor(capstone);
      boss = true;
    } else if (/integration/i.test(title) && capstone) {
      lesson = lessonFor(capstone);
      boss = true;
    } else if (pool[idx]) {
      lesson = lessonFor(pool[idx]);
    }
    return {
      n: idx + 1,
      title,
      first: nums.length ? Math.min(...nums) : 0,
      last: nums.length ? Math.max(...nums) : 0,
      count: section.questions.length,
      lesson,
      boss,
    };
  });
}

export default async function MCQAssessmentWrapper({
  assessment,
  courseId,
  week,
  lessonSlug,
  nextResource,
  nextLabel = "Next",
  showComments = true,
}: MCQAssessmentWrapperProps) {
  let resources: LearningResource[] = [];
  try {
    resources = await getWeekResources(week);
  } catch {
    // Parts still work without lesson links; they just never show as locked.
  }
  const parts = buildParts(assessment, resources);

  return (
    <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
      <TrialApp
        assessment={assessment}
        courseId={courseId}
        week={week}
        lessonSlug={lessonSlug}
        weekLabel={weekLabelFor(week)}
        weekTopic={sentenceCase(formatWeekTopic(week))}
        parts={parts}
        nextResource={nextResource ?? null}
        nextLabel={nextLabel}
        comments={showComments ? <LessonComments courseId={courseId} week={week} lessonSlug={lessonSlug} /> : null}
      />
    </Suspense>
  );
}
