import Link from "next/link";
import { getSheetSummaries } from "@/lib/learn/sheets/load";
import { getCourseMap, COURSE_ID } from "@/lib/learn/course";
import QuestEmblem from "@/components/learn/sidequest/QuestEmblem";
import { questBrand } from "@/components/learn/sidequest/brands";

export const runtime = "nodejs";
export const revalidate = 86400;

export const metadata = {
  title: "Design sheets · System Design Mastery",
  description:
    "Every side quest's system design on a few printable pages: numbers, architecture diagrams with real tech icons, sequence, class and state diagrams, decisions and failure modes. Revise a whole design in minutes.",
  alternates: { canonical: "/learn/sheets" },
};

export default async function SheetsIndex() {
  const [sheets, map] = await Promise.all([getSheetSummaries(), getCourseMap(COURSE_ID).catch(() => null)]);
  const quests = map?.sideQuests.length ?? sheets.length;
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/practice" className="hover:text-fg">
            Practice
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">Design sheets</span>
        </nav>
        <h1 className="m-0 font-display text-[clamp(44px,8vw,92px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          Design sheets<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Each side quest&apos;s whole design on a few pages: the numbers, the architecture with real tech icons, the key flows as sequence diagrams, the data model, the state
          machine, the decisions and what breaks. Read the quest once; revise it here in ten minutes, or download the PDF.
        </p>
        <p className="m-0 font-mono text-xs text-fg-3">
          {sheets.length} of {quests} side quests have a sheet{sheets.length < quests ? " · the rest are on the way" : ""}
        </p>
      </header>
      {sheets.length === 0 ? (
        <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The first sheets are being drawn. Check back soon.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <li key={s.slug} className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <QuestEmblem brand={questBrand(s.slug)} size={40} />
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                  {s.code} · {s.diagrams} diagrams
                </span>
              </div>
              <Link href={s.href} className="group flex flex-col gap-1.5">
                <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.02em] text-fg group-hover:text-signal-text">{s.title}</span>
                {s.summary && <span className="line-clamp-3 text-[14px] leading-snug text-fg-2">{s.summary}</span>}
              </Link>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
                <Link href={s.quest.href} className="font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                  the quest · {s.quest.minutes} min
                </Link>
                <Link href={s.href} className="font-mono text-xs text-signal-text underline underline-offset-4">
                  open sheet →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
