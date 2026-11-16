import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getPracticeData } from "@/lib/dsa/practice-load";
import PracticeBank from "@/components/dsa/practice/PracticeBank";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";

// /dsa/practice: the problem bank (the Practice tab). Lists (all, daily, Core 150, interview patterns, by company type, mine),
// a filter bar and a compact 50-row table; filters, URL state and the export are the old bank's (src/lib/dsa/problem-filters.ts).
// The page is ISR (refreshed with the content); the learner's ticks, saved problems and the daily load in the browser.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Practice · DSA Mastery",
  description: "Original problems set in everyday apps, tied to the lesson that teaches them. Filter by module, pattern and difficulty, or follow a curated list.",
  robots: { index: false, follow: false },
};

export default async function PracticePage() {
  if (!DSA_FULL) notFound();
  const { data, lists } = await getPracticeData();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pb-24 pt-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">Practice</span>
            <h1 className="m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">
              The problem bank<span className="text-signal-text">.</span>
            </h1>
          </div>
          <SaveGroupButton group="dsa-problems" label="Save every problem offline" />
        </header>
        <PracticeBank data={data} lists={lists} />
      </main>
    </div>
  );
}
