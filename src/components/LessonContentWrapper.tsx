"use client";

import { forwardRef } from "react";
import dynamic from "next/dynamic";
import HighlightableContent from "./HighlightableContent";
import styles from "@/components/learn/lesson/reader.module.css";

// Interactive chrome for the rendered course components (blueprints, code, reveals, checklists…).
// Client-only; it never changes text content, so highlight / bookmark offsets stay valid.
const CourseEnhancer = dynamic(() => import("@/components/learn/content/CourseEnhancer"), { ssr: false });

type LessonContentWrapperProps = {
  htmlContent: string;
  courseId: string;
  week: string;
  lessonSlug: string;
  lessonTitle: string;
  /** reading size in px (17 / 19 / 21), applied through --reader-size */
  textSize?: number;
};

/**
 * The lesson body: `.course-content` wraps the renderer's stage sections. Boss mode and the
 * reader tools find stages inside it by DOM (`section[data-sd=stage]`).
 */
const LessonContentWrapper = forwardRef<HTMLDivElement, LessonContentWrapperProps>(function LessonContentWrapper(
  { htmlContent, courseId, week, lessonSlug, lessonTitle, textSize = 17 },
  ref
) {
  return (
    <div ref={ref} className={`course-content ${styles.content}`} style={{ ["--reader-size" as string]: `${textSize}px` }}>
      <HighlightableContent htmlContent={htmlContent} courseId={courseId} week={week} lessonSlug={lessonSlug} lessonTitle={lessonTitle} />
      <CourseEnhancer lessonKey={`${week}/${lessonSlug}`} />
    </div>
  );
});

export default LessonContentWrapper;
