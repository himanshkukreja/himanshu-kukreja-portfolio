import Link from "next/link";

/** "week-01-data-at-scale" → "week-01" (the revision and cheat sheet URL segment). */
export const reviseWeekId = (week: string) => week.match(/^week-\d+/)?.[0] ?? week;

/** End-of-lesson entry: this lesson's 5-minute revision deck, and the world's cheat sheet. */
export default function ReviseLink({ week, slug, label }: { week: string; slug: string; label: string }) {
  const id = reviseWeekId(week);
  return (
    <div className="flex flex-col gap-2 border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <Link href={`/learn/revise/${id}/${slug}`} className="group flex min-w-0 flex-col gap-1 text-fg no-underline">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Interview night</span>
        <span className="text-[17px] font-semibold group-hover:underline">Revise {label} in 5 min →</span>
        <span className="text-sm leading-normal text-fg-2">Key ideas, the numbers to remember, the trade-off and the classic mistakes as swipeable cards. Works offline.</span>
      </Link>
      <Link href={`/learn/cheatsheet/${id}`} className="inline-flex min-h-11 shrink-0 items-center justify-center border border-line-strong px-3.5 font-mono text-xs text-fg-2 hover:border-fg-3 hover:text-fg">
        World cheat sheet
      </Link>
    </div>
  );
}
