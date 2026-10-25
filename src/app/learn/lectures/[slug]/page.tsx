import { notFound } from "next/navigation";
import { getLecture, lectureHash, lectureMediaBase, lectureSubject, listLectures } from "@/lib/learn/lecture/load";
import { getLectureFaq } from "@/lib/learn/lecture/faq";
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
  const [l, all, faq] = await Promise.all([getLecture(slug), listLectures().catch(() => []), getLectureFaq(slug).catch(() => null)]);
  if (!l) notFound();
  const q = await lectureSubject(l);
  const at = all.findIndex((x) => x.slug === l.quest);
  // up next: the next lecture in the same track (course lessons, or side quests)
  const nx = at >= 0 && at + 1 < all.length && (all[at + 1].group === "Side quests") === (all[at].group === "Side quests") ? all[at + 1] : null;
  return <LecturePlayer lecture={l} quest={q} source={lectureHash(l)} mediaBase={lectureMediaBase()} next={nx ? { href: nx.href, title: nx.title, code: nx.code } : null} faq={faq?.scenes ?? null} />;
}
