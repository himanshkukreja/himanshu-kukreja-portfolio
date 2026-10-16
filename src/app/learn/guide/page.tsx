import type { Metadata } from "next";
import { getCourseMap } from "@/lib/learn/course";
import Guide from "@/components/learn/guide/Guide";

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
  const map = await getCourseMap().catch(() => null);
  return <Guide map={map} />;
}
