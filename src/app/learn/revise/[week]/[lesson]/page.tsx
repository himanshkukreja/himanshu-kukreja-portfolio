import { notFound } from "next/navigation";
import { COURSE_ID } from "@/lib/learn/course";
import { getRevisionWeek } from "@/lib/learn/revision/load";
import RevisionDeck from "@/components/learn/revise/RevisionDeck";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ week: string; lesson: string }> };

async function load(params: Props["params"]) {
  const { week, lesson } = await params;
  const w = await getRevisionWeek(week);
  const i = w ? w.lessons.findIndex((l) => l.slug === decodeURIComponent(lesson)) : -1;
  return w && i >= 0 ? { w, i, l: w.lessons[i] } : null;
}

export async function generateMetadata({ params }: Props) {
  const hit = await load(params);
  if (!hit) return { title: "Not Found" };
  return {
    title: `Revise ${hit.l.title} in 5 min · System Design Mastery`,
    description: `${hit.l.cards.length} revision cards for ${hit.l.label} (World ${hit.w.code} · ${hit.w.title}): key ideas, numbers to remember, the trade-off and the classic mistakes.`,
  };
}

export default async function ReviseLessonPage({ params }: Props) {
  const hit = await load(params);
  if (!hit) notFound();
  const { w, i, l } = hit;
  const after = w.lessons[i + 1];
  return (
    <RevisionDeck
      course={COURSE_ID}
      // only this lesson's cards ship; the others' slugs still count toward "world revised"
      week={{ ...w, lessons: w.lessons.map((x) => (x.slug === l.slug ? x : { ...x, cards: [] })) }}
      lesson={l.slug}
      exitHref={l.href}
      exitLabel={l.label}
      next={after ? { href: `/learn/revise/${w.id}/${after.slug}`, label: `Revise ${after.short}` } : null}
    />
  );
}
