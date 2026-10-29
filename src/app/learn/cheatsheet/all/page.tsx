import Link from "next/link";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { SITE_ORIGIN } from "@/lib/share/model";
import CheatSheet from "@/components/learn/cheatsheet/CheatSheet";
import CheatSheetTools, { FitToPage } from "@/components/learn/cheatsheet/CheatSheetTools";
import "@/components/learn/cheatsheet/cheatsheet.css";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish).
export const revalidate = 86400;

const title = "Every cheat sheet, one PDF · System Design Mastery";
const description = "All twelve worlds' one-page cheat sheets in a single printable document: key ideas, numbers to remember, trade-offs and classic mistakes. Free.";
export const metadata = { title, description, alternates: { canonical: "/learn/cheatsheet/all" }, openGraph: { title, description, type: "article" } };

/** The interview-night pack: every world's cheat sheet, one sheet per printed page. */
export default async function AllCheatSheetsPage() {
  const weeks = (await getRevisionWeeks().catch(() => [])).filter((w) => w.lessons.length > 0);
  const host = SITE_ORIGIN.replace(/^https?:\/\//, "");
  return (
    <main className="cs-root cs-all mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="cs-noprint flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/revise" className="hover:text-fg">
            Revision
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">Every cheat sheet</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[44px]">The whole course, {weeks.length} pages.</h1>
            <p className="max-w-[600px] text-[15px] leading-relaxed text-fg-2">
              Every world&apos;s cheat sheet, one per page: the pack for the night before an interview. Download PDF opens your browser&apos;s print dialog: choose “Save as PDF”.
            </p>
          </div>
          {weeks.length > 0 && <CheatSheetTools title="System Design Mastery · every cheat sheet" url={`${SITE_ORIGIN}/learn/cheatsheet/all`} week="all" />}
        </div>
      </div>
      {weeks.map((w) => (
        <div key={w.id} className="cs-stage -mx-4 sm:mx-0 lg:py-2">
          <CheatSheet id={`cs-sheet-${w.id}`} week={w} url={`${host}/learn/cheatsheet/${w.id}`} site={host} />
          <FitToPage target={`cs-sheet-${w.id}`} />
        </div>
      ))}
    </main>
  );
}
