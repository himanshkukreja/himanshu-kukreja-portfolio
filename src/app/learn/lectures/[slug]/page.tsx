import { notFound } from "next/navigation";
import { controlMap, isLive, questKey } from "@/lib/learn/controls";
import { getLecture, lectureHash, lectureMediaBase, lectureSubject, listLectures } from "@/lib/learn/lecture/load";
import { getLectureFaq } from "@/lib/learn/lecture/faq";
import LecturePlayer from "@/components/learn/lecture/LecturePlayer";
import { JsonLd, videoObject } from "@/lib/seo/jsonld";
import { isoDuration, mediaInfo } from "@/lib/seo/video";

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
  // a shared link (often ?t=<seconds>, from the player's Share) previews with the lecture's own poster frame
  const base = lectureMediaBase();
  const poster = base && /^https?:\/\//.test(base) ? `${base.replace(/\/$/, "")}/${l.quest}/poster.jpg` : null;
  const title = `${l.title} · Lecture`;
  const social = poster
    ? { openGraph: { title, description: l.summary, type: "video.other" as const, images: [{ url: poster, width: 1920, height: 1080, alt: l.title }] }, twitter: { card: "summary_large_image" as const, title, description: l.summary, images: [poster] } }
    : {};
  // v2 lectures are the released format; the v1 experiments stay out of search
  return { title, description: l.summary, alternates: { canonical: `/learn/lectures/${l.quest}` }, ...social, ...(l.v === 2 ? {} : { robots: { index: false, follow: false } }) };
}

export default async function LecturePage({ params }: Props) {
  const { slug } = await params;
  const [l, all, faq, media] = await Promise.all([getLecture(slug), listLectures().catch(() => []), getLectureFaq(slug).catch(() => null), mediaInfo(slug)]);
  if (!l) notFound();
  // a hidden side quest's lecture is hidden too
  if (slug.startsWith("bonus-") && !isLive((await controlMap()).get(questKey(slug)))) notFound();
  const q = await lectureSubject(l);
  const at = all.findIndex((x) => x.slug === l.quest);
  // up next: the next lecture in the same track (course lessons, side quests, problems, LLD)
  const nx = at >= 0 && at + 1 < all.length && all[at + 1].track === all[at].track ? all[at + 1] : null;
  // Google video results (released lectures only): the file, the poster, the length and the chapters
  const video =
    media && l.v === 2
      ? videoObject({
          name: l.title,
          description: l.summary,
          path: `/learn/lectures/${l.quest}`,
          thumbnailUrl: media.thumbnailUrl,
          contentUrl: media.contentUrl,
          uploadDate: media.uploadDate,
          duration: isoDuration(media.duration),
          durationSec: media.duration,
          chapters: media.chapters,
        })
      : null;
  return (
    <>
      {video && <JsonLd data={video} />}
      <LecturePlayer lecture={l} quest={q} source={lectureHash(l)} mediaBase={lectureMediaBase()} next={nx ? { href: nx.href, title: nx.title, code: nx.code } : null} faq={faq?.scenes ?? null} />
    </>
  );
}
