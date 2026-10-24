import Link from "next/link";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import ReviseIndex from "@/components/learn/revise/ReviseIndex";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata = {
  title: "Interview-night revision · System Design Mastery",
  description:
    "Five-minute revision decks for every System Design Mastery lesson: key ideas, the numbers to remember, the trade-off table and the classic mistakes. Flip a whole world before an interview, offline on the flight.",
};

export default async function RevisePage() {
  const weeks = await getRevisionWeeks();
  const lessons = weeks.reduce((a, w) => a + w.lessons.length, 0);
  const cards = weeks.reduce((a, w) => a + w.cards, 0);
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Interview night · revision mode</span>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[56px]">Five minutes a lesson.</h1>
        <p className="max-w-[640px] text-[17px] leading-relaxed text-fg-2">
          Each lesson boiled down to swipeable cards: the key ideas, the numbers to remember, one trade-off table, the classic mistakes and what to say when the interviewer asks.
          Flip a whole world the night before. Save it offline and it works on the flight.
        </p>
        <span className="font-mono text-xs text-fg-3">
          {lessons} lessons · {cards} cards ·{" "}
          <Link href="/learn/review" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
            cards you mark &quot;again&quot; join your Daily standup
          </Link>
        </span>
        <div className="flex flex-wrap gap-2">
          <Link href="/learn/cheatsheet/all" className="inline-flex min-h-11 items-center border border-line-strong px-3.5 text-sm font-medium text-fg hover:border-fg-3">
            Every cheat sheet as one PDF
          </Link>
          <a href="/learn/revise/anki.txt" download className="inline-flex min-h-11 items-center border border-line-strong px-3.5 text-sm font-medium text-fg hover:border-fg-3">
            Download all {cards} cards for Anki
          </a>
        </div>
      </header>
      <ReviseIndex
        weeks={weeks.map((w) => ({
          key: w.key,
          id: w.id,
          code: w.code,
          title: w.title,
          cards: w.cards,
          missing: w.missing,
          lessons: w.lessons.map((l) => ({ slug: l.slug, short: l.short, title: l.title, cards: l.cards.length })),
        }))}
      />
    </main>
  );
}
