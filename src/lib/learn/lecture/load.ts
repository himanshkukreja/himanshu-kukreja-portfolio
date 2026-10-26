import "server-only";
import crypto from "crypto";
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getCaseFiles } from "@/components/stories/case-files";
import { lessonLectureId, type Lecture } from "./types";
import type { Level } from "@/lib/learn/level";

/** A mock's target level (intern … staff) as a playlist difficulty. */
const mockLevel = (l: string): Level => (/staff|principal/i.test(l) ? "Expert" : /senior/i.test(l) ? "Advanced" : "Intermediate");

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
  /** playlist section: "W04 · Caching", "Side quests", "Interview problems", "Low-level design", "Case files" */
  group: string;
  /** "up next" stays inside a track */
  track: "course" | "quests" | "problems" | "lld" | "cases" | "mocks";
  /** difficulty (lib/learn/level.ts) */
  level?: Level;
};

/**
 * Every released (v2) lecture in course order: weeks 0–10 (preview, days, boss), then the side
 * quests, the interview problems, low-level design and the case files (oldest first). Also the order
 * "up next" follows.
 */
export async function listLectures(): Promise<LectureSummary[]> {
  const [map, cases] = await Promise.all([getCourseMap(COURSE_ID).catch(() => null), getCaseFiles().catch(() => [])]);
  if (!map) return [];
  const course = map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])].map((l) => ({ id: lessonLectureId(l.week, l.slug), l, group: `W${w.code} · ${w.title}`, track: "course" as const })));
  const quests = map.sideQuests.map((l) => ({ id: l.slug, l, group: "Side quests", track: "quests" as const }));
  const problems = (map.problems ?? []).map((l) => ({ id: lessonLectureId(l.week, l.slug), l, group: "Interview problems", track: "problems" as const }));
  const lld = (map.lld ?? []).map((l) => ({ id: lessonLectureId(l.week, l.slug), l, group: "Low-level design", track: "lld" as const }));
  const mocks = (map.mocks ?? []).map((m) => ({ id: lessonLectureId("mock-interviews", m.slug), l: { tag: `M${String(m.n).padStart(2, "0")}`, code: `M${String(m.n).padStart(2, "0")}`, title: `${m.company} · ${m.title}`, href: m.href, level: mockLevel(m.level) }, group: "Mock interviews", track: "mocks" as const }));
  const files = [...cases].reverse().map((c) => ({ id: lessonLectureId("case-files", c.slug), l: { tag: c.caseId, code: c.caseId, title: c.title, href: `/stories/${c.slug}`, level: "Intermediate" as Level }, group: "Case files", track: "cases" as const }));
  const all = await Promise.all(
    [...course, ...mocks, ...quests, ...problems, ...lld, ...files].map(async ({ id, l, group, track }) => {
      const lec = await getLecture(id).catch(() => null);
      const card = lectureCard(lec);
      return lec && card ? { slug: id, code: l.tag || l.code, title: lec.title, quest: l.title, summary: lec.summary, href: card.href, questHref: l.href, minutes: card.minutes, checkpoints: card.checkpoints, chapters: card.chapters, group, track, ...(l.level ? { level: l.level } : {}) } : null;
    }),
  );
  return all.filter((x): x is LectureSummary => !!x);
}

/** The course page a lecture teaches (its side quest or lesson), for the player's header and links. */
export async function lectureSubject(l: Lecture): Promise<{ title: string; href: string; code: string; level?: Level } | null> {
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  if (!map) return null;
  if (l.lesson?.week === "mock-interviews") {
    const m = (map.mocks ?? []).find((x) => x.slug === l.lesson!.slug);
    return m ? { title: `${m.company} · ${m.title}`, href: m.href, code: `M${String(m.n).padStart(2, "0")}`, level: mockLevel(m.level) } : null;
  }
  if (l.lesson?.week === "case-files") {
    const c = (await getCaseFiles().catch(() => [])).find((x) => x.slug === l.lesson!.slug);
    return c ? { title: c.title, href: `/stories/${c.slug}`, code: c.caseId, level: "Intermediate" } : null;
  }
  if (l.lesson) {
    const { week, slug } = l.lesson;
    const w = map.weeks.find((x) => x.key === week);
    const pool = w ? [...w.lessons, ...(w.boss ? [w.boss] : [])] : week === "problem-bank" ? (map.problems ?? []) : week === "low-level-design" ? (map.lld ?? []) : [];
    const hit = pool.find((x) => x.slug === slug);
    return hit ? { title: hit.title, href: hit.href, code: hit.tag || hit.code, level: hit.level } : null;
  }
  const q = map.sideQuests.find((x) => x.slug === l.quest);
  return q ? { title: q.title, href: q.href, code: q.code, level: q.level } : null;
}
