"use client";

/**
 * Mounted by the lesson reader: tells the course's one Notebook panel (NotebookPanelHost, in the Learn layout)
 * what the URL can't, the lesson's title and its week's label and topic, so a new page is filed in the notebook
 * named after the week ("Week 04 · Caching"), as before the panel went course-wide. Renders nothing.
 */
import { useEffect } from "react";
import { publishLessonContext } from "./context";

export default function LessonNotebookContext({ lesson }: { lesson: { week: string; slug: string; title: string; weekLabel: string; weekTopic: string } }) {
  const { week, slug, title, weekLabel, weekTopic } = lesson;
  useEffect(() => {
    // "Week 04 · Caching"; a track whose topic repeats its label ("Bonus problems · Bonus Problems") is named once
    const parts = weekTopic && weekTopic.toLowerCase() !== weekLabel.toLowerCase() ? [weekLabel, weekTopic] : [weekLabel];
    publishLessonContext({ key: `${week}/${slug}`, title, notebook: parts.filter(Boolean).join(" · ") || "Lessons" });
    return () => publishLessonContext(null);
  }, [week, slug, title, weekLabel, weekTopic]);
  return null;
}
