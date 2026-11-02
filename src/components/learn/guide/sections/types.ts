import type { CourseMap } from "@/lib/learn/types";

export type GuideLectures = { total: number; minutes: number; parts: string };

/** What the guide reads from the live course (all optional: the guide still renders without it). */
export type GuideData = { map: CourseMap | null; caseActivities: number; lectures: GuideLectures | null };

export const COURSE = "/";
/** The lecture player's checkpoint reward (LecturePlayer's QUIZ_XP). */
export const LECTURE_QUIZ_XP = 10;
/** An in-page link inside prose. */
export const INLINE = "text-signal-text underline underline-offset-4";
