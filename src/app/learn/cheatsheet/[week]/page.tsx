import Link from "next/link";
import { notFound } from "next/navigation";
import { getRevisionWeek } from "@/lib/learn/revision/load";
import { SITE_ORIGIN } from "@/lib/share/model";
import CheatSheet from "@/components/learn/cheatsheet/CheatSheet";
import CheatSheetTools, { FitToPage } from "@/components/learn/cheatsheet/CheatSheetTools";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import "@/components/learn/cheatsheet/cheatsheet.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ week: string }> };

export async function generateMetadata({ params }: Props) {
  const w = await getRevisionWeek((await params).week);
  if (!w) return { title: "Not Found" };
  const title = `${w.title} cheat sheet · World ${w.code} · System Design Mastery`;
  const description = `One printable page: the key ideas, numbers to remember, trade-offs and classic mistakes of ${w.title}${w.lessons.length ? ` (${w.lessons.length} lessons)` : ""}. Free, from the System Design Mastery course.`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function CheatSheetPage({ params }: Props) {
  const w = await getRevisionWeek((await params).week);
  if (!w) notFound();
  const path = `/learn/cheatsheet/${w.id}`;
  const host = SITE_ORIGIN.replace(/^https?:\/\//, "");
  return (
    <main className="cs-root mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="cs-noprint flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/revise" className="hover:text-fg">
            Revision
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">World {w.code} cheat sheet</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[44px]">{w.title}, on one page.</h1>
            <p className="max-w-[560px] text-[15px] leading-relaxed text-fg-2">
              {w.lessons.length
                ? "Prints on a single A4 or Letter page. Download PDF opens your browser's print dialog: choose “Save as PDF”."
                : "The cards for this world are still being written, so the sheet is empty for now."}
            </p>
          </div>
          {w.lessons.length > 0 && <CheatSheetTools title={`World ${w.code} · ${w.title} cheat sheet`} url={`${SITE_ORIGIN}${path}`} week={w.key} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {w.lessons.length > 0 && (
            <Link href={`/learn/revise/${w.id}`} className="inline-flex min-h-11 items-center border border-line-strong px-3.5 text-sm font-medium text-fg-2 hover:border-fg-3 hover:text-fg">
              Revise it as cards · ~{w.lessons.length * 5} min
            </Link>
          )}
          <SaveOfflineButton title={`World ${w.code} cheat sheet`} kind="cheatsheet" />
        </div>
      </div>
      <div className="cs-stage -mx-4 sm:mx-0 lg:py-2">
        <CheatSheet id="cs-sheet" week={w} url={`${host}${path}`} site={host} />
      </div>
      <FitToPage target="cs-sheet" />
    </main>
  );
}
