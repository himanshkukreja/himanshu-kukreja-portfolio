"use client";

import { useRef } from "react";
import HighlightableContent from "./HighlightableContent";
import ReadAloud from "./ReadAloud";

type LessonContentWrapperProps = {
  htmlContent: string;
  courseId: string;
  week: string;
  lessonSlug: string;
  lessonTitle: string;
};

export default function LessonContentWrapper({
  htmlContent,
  courseId,
  week,
  lessonSlug,
  lessonTitle,
}: LessonContentWrapperProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={contentRef}>
        <HighlightableContent
          htmlContent={htmlContent}
          courseId={courseId}
          week={week}
          lessonSlug={lessonSlug}
          lessonTitle={lessonTitle}
        />
      </div>
      <ReadAloud contentRef={contentRef} />
    </>
  );
}
