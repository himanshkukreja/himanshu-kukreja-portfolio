import Link from "next/link";
import { notFound } from "next/navigation";
import { COURSE_ID } from "@/lib/learn/course";
import { getRevisionWeek } from "@/lib/learn/revision/load";
import RevisionDeck from "@/components/learn/revise/RevisionDeck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ week: string }> };

export async function generateMetadata({ params }: Props) {
  const w = await getRevisionWeek((await params).week);
  if (!w) return { title: "Not Found" };
  return {
    title: `Revise World ${w.code} · ${w.title} in ${Math.max(5, w.lessons.length * 5)} min · System Design Mastery`,
    description: `Interview-night revision for ${w.title}: ${w.cards} cards across ${w.lessons.length} lessons. Key ideas, numbers to remember, trade-offs and classic mistakes. Free, works offline.`,
  };
}

export default async function ReviseWeekPage({ params }: Props) {
  const w = await getRevisionWeek((await params).week);
  if (!w) notFound();
  if (!w.lessons.length) {
    return (
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 pb-16 pt-12 sm:px-6">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Revise · World {w.code}</span>
        <h1 className="font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] text-fg">{w.title}: cards on the way</h1>
        <p className="text-[17px] leading-relaxed text-fg-2">The revision cards for this world aren&apos;t written yet. The other worlds are ready.</p>
        <Link href="/learn/revise" className="self-start font-mono text-sm text-signal-text underline underline-offset-4">
          all revision decks →
        </Link>
      </main>
    );
  }
  return <RevisionDeck course={COURSE_ID} week={w} exitHref="/learn/revise" exitLabel="all revision decks" />;
}
