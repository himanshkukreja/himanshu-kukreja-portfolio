import type { Metadata } from "next";
import { getCourseMap } from "@/lib/learn/course";
import Guide from "@/components/learn/guide/Guide";
import { listStorySources } from "@/lib/stories";
import { ACTIVITY_SLUGS } from "@/components/stories/activities/types";

export const runtime = "nodejs";
// the course map (real numbers) is cached by getCourseMap; refresh the page hourly
export const revalidate = 3600;

const TITLE = "How the course works · System Design Mastery · Himanshu Kukreja";
const DESCRIPTION =
  "A visual guide to System Design Mastery: worlds, lessons and stages, how progress counts, the Notebook, the daily standup, trials and boss fights, the Arena, XP, levels and leagues.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/learn/guide" },
  openGraph: { title: "How System Design Mastery works", description: DESCRIPTION, url: "/learn/guide", type: "article" },
  twitter: { card: "summary_large_image", title: "How System Design Mastery works", description: DESCRIPTION },
};

export default async function GuidePage() {
  const [map, caseActivities] = await Promise.all([getCourseMap().catch(() => null), countCaseActivities().catch(() => undefined)]);
  return <Guide map={map} caseActivities={caseActivities} />;
}

/** Repo stories with a TSX activity + published CMS case files with a data activity. */
async function countCaseActivities(): Promise<number> {
  const sources = await listStorySources();
  const repo = new Set<string>(ACTIVITY_SLUGS);
  return sources.filter((s) => (s.activity && s.activity.steps.length) || repo.has(s.slug)).length;
}
