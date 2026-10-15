"use client";

import CourseEnhancer from "@/components/learn/content/CourseEnhancer";
import "@/app/learn/course-content.css";
import "@/components/learn/quiz/quiz.css";

/** Dev-only: the renderer's HTML inside .course-content with the same client chrome lessons get. */
export default function QuizFixture({ html, title }: { html: string; title: string }) {
  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pb-28 pt-8 sm:px-6">
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">dev fixture · not in production</span>
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-fg">{title}</h1>
      <div className="course-content">
        <div className="sd-body" dangerouslySetInnerHTML={{ __html: html }} />
        <CourseEnhancer lessonKey="dev/quiz-fixture" />
      </div>
    </main>
  );
}
