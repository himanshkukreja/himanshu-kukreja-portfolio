import { notFound } from "next/navigation";
import { getLecture } from "@/lib/learn/lecture/load";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import LecturePlayer from "@/components/learn/lecture/LecturePlayer";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const l = await getLecture((await params).slug);
  if (!l) return { title: "Not Found" };
  // experimental: kept out of search until the format is decided
  return { title: `${l.title} · Lecture (beta)`, description: l.summary, robots: { index: false, follow: false } };
}

export default async function LecturePage({ params }: Props) {
  const { slug } = await params;
  const [l, map] = await Promise.all([getLecture(slug), getCourseMap(COURSE_ID).catch(() => null)]);
  if (!l) notFound();
  const q = map?.sideQuests.find((x) => x.slug === l.quest) ?? null;
  return <LecturePlayer lecture={l} quest={q ? { title: q.title, href: q.href, code: q.code } : null} />;
}
