import "server-only";
import crypto from "crypto";
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { lessonLectureId, type Lecture } from "./types";

/** The lecture for a side quest, or null (none yet, or a broken file). */
export async function getLecture(slug: string): Promise<Lecture | null> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
  try {
    const raw = await fetchMarkdownContent(`resources/lectures/${slug}.json`);
    const l = JSON.parse(raw) as Lecture;
    return Array.isArray(l.scenes) && l.scenes.length ? l : null;
  } catch (e) {
    if (!isContentMissing(e) && process.env.NODE_ENV !== "production") console.warn(`[lecture] ${slug}:`, (e as Error).message);
    return null;
  }
}

/** Fingerprint of a lecture's script; recorded media made from another version is ignored. */
export const lectureHash = (l: Lecture) => crypto.createHash("sha1").update(JSON.stringify(l)).digest("hex").slice(0, 12);

/** Where recorded lecture media lives: the R2 public URL, or public/lecture-media in development. */
export const lectureMediaBase = () => process.env.NEXT_PUBLIC_LECTURE_MEDIA || (process.env.NODE_ENV === "development" ? "/lecture-media" : null);

/** What the side-quest page shows about its lecture (v2 lectures only; v1 was the experiment). */
export function lectureCard(l: Lecture | null) {
  if (!l || l.v !== 2) return null;
  // course-lesson lectures appear once their whole phase is released; side quests are all live
  const words = l.scenes.reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).length, 0), 0);
  return { href: `/learn/lectures/${l.quest}`, minutes: Math.max(1, Math.round((words / 150) * 1.08)), checkpoints: l.scenes.filter((s) => s.kind === "quiz").length, chapters: l.scenes.length };
}

export type LectureSummary = {
  slug: string;
  code: string;
  title: string;
  /** what it teaches: the side quest's or the lesson's title */
  quest: string;
  summary: string;
  href: string;
  questHref: string;
  minutes: number;
  checkpoints: number;
  chapters: number;
  /** playlist section: "W04 · Caching", or "Side quests" */
  group: string;
};

/**
 * Every released (v2) lecture in course order: weeks 0–10 (preview, days, boss), then the side
 * quests. Also the order "up next" follows.
 */
export async function listLectures(): Promise<LectureSummary[]> {
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  if (!map) return [];
  const course = map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])].map((l) => ({ id: lessonLectureId(l.week, l.slug), l, group: `W${w.code} · ${w.title}` })));
  const quests = map.sideQuests.map((l) => ({ id: l.slug, l, group: "Side quests" }));
  const all = await Promise.all(
    [...course, ...quests].map(async ({ id, l, group }) => {
      const lec = await getLecture(id).catch(() => null);
      const card = lectureCard(lec);
      return lec && card ? { slug: id, code: l.tag || l.code, title: lec.title, quest: l.title, summary: lec.summary, href: card.href, questHref: l.href, minutes: card.minutes, checkpoints: card.checkpoints, chapters: card.chapters, group } : null;
    }),
  );
  return all.filter((x): x is LectureSummary => !!x);
}

/** The course page a lecture teaches (its side quest or lesson), for the player's header and links. */
export async function lectureSubject(l: Lecture): Promise<{ title: string; href: string; code: string } | null> {
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  if (!map) return null;
  if (l.lesson) {
    const w = map.weeks.find((x) => x.key === l.lesson!.week);
    const hit = w && [...w.lessons, ...(w.boss ? [w.boss] : [])].find((x) => x.slug === l.lesson!.slug);
    return hit ? { title: hit.title, href: hit.href, code: hit.tag || hit.code } : null;
  }
  const q = map.sideQuests.find((x) => x.slug === l.quest);
  return q ? { title: q.title, href: q.href, code: q.code } : null;
}
