import type { Metadata } from "next";
import { getCourseMap } from "@/lib/learn/course";
import Guide, { type GuideLectures } from "@/components/learn/guide/Guide";
import { listLectures } from "@/lib/learn/lecture/load";
import { listStorySources } from "@/lib/stories";
import { ACTIVITY_SLUGS } from "@/components/stories/activities/types";

export const runtime = "nodejs";
// the course map (real numbers) is cached by getCourseMap; refresh the page hourly
export const revalidate = 3600;

const TITLE = "How the course works · System Design Mastery · Himanshu Kukreja";
const DESCRIPTION =
  "A visual guide to System Design Mastery: worlds, lessons and stages, the video lectures, how progress counts, the Notebook, the daily standup, trials and boss fights, the Arena, XP, levels and leagues.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/learn/guide" },
  openGraph: { title: "How System Design Mastery works", description: DESCRIPTION, url: "/learn/guide", type: "article" },
  twitter: { card: "summary_large_image", title: "How System Design Mastery works", description: DESCRIPTION },
};

export default async function GuidePage() {
  const [map, caseActivities, lectures] = await Promise.all([getCourseMap().catch(() => null), countCaseActivities().catch(() => undefined), lectureCounts().catch(() => null)]);
  return <Guide map={map} caseActivities={caseActivities} lectures={lectures} />;
}

/** How many lectures there are, per track, for the guide's video section. */
async function lectureCounts(): Promise<GuideLectures | null> {
  const all = await listLectures();
  if (!all.length) return null;
  const names: Record<string, string> = { course: "course lessons", mocks: "recorded mock interviews", quests: "side quests", problems: "interview problems", lld: "low-level design", cases: "case files" };
  const by = new Map<string, number>();
  all.forEach((l) => by.set(l.track, (by.get(l.track) || 0) + 1));
  return { total: all.length, minutes: all.reduce((a, l) => a + l.minutes, 0), parts: [...by].map(([t, n]) => `${n} ${names[t] || t}`).join(", ") };
}

/** Repo stories with a TSX activity + published CMS case files with a data activity. */
async function countCaseActivities(): Promise<number> {
  const sources = await listStorySources();
  const repo = new Set<string>(ACTIVITY_SLUGS);
  return sources.filter((s) => (s.activity && s.activity.steps.length) || repo.has(s.slug)).length;
}
