import { notFound } from "next/navigation";
import { getLecture, lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
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
  // v2 lectures are the released format; the v1 experiments stay out of search
  return { title: `${l.title} · Lecture`, description: l.summary, alternates: { canonical: `/learn/lectures/${l.quest}` }, ...(l.v === 2 ? {} : { robots: { index: false, follow: false } }) };
}

export default async function LecturePage({ params }: Props) {
  const { slug } = await params;
  const [l, map] = await Promise.all([getLecture(slug), getCourseMap(COURSE_ID).catch(() => null)]);
  if (!l) notFound();
  const q = map?.sideQuests.find((x) => x.slug === l.quest) ?? null;
  return <LecturePlayer lecture={l} quest={q ? { title: q.title, href: q.href, code: q.code } : null} source={lectureHash(l)} mediaBase={lectureMediaBase()} />;
}
