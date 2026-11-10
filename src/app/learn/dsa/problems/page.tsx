import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getProblemIndex, getStepLabels } from "@/lib/dsa/load";
import { problemsWithVideo } from "@/lib/dsa/media";
import { buildProblemData } from "@/lib/dsa/problem-rows";
import ProblemBrowser from "@/components/dsa/problems/ProblemBrowser";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";

// /dsa/problems: every built problem, searchable and filterable (src/lib/dsa/problem-filters.ts), grouped by concept in course order, with the learner's solved ticks. Staging only.

export const revalidate = 604800;

export const metadata: Metadata = { title: "Problems · DSA Mastery", robots: { index: false, follow: false } };

export default async function ProblemsPage() {
  if (!DSA_FULL) notFound();
  const [problems, concepts, labels] = await Promise.all([getProblemIndex().catch(() => []), getConceptIndex().catch(() => []), getStepLabels().catch(() => ({}))]);
  const videos = await problemsWithVideo(problems.map((p) => p.id)).catch(() => []);
  const data = buildProblemData(problems, { labels, concepts, videos });
  if (data.unknown.length) console.warn(`[dsa taxonomy] pattern tags with no facets yet: ${data.unknown.join(", ")}`);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">The problem bank</span>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            Problems<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">
            Original problems set in everyday apps, each tied to the concept it practises. Filter by data structure, algorithm, pattern, difficulty and more. Python and JavaScript run in your browser; Java and C++ run on the judge.
          </p>
          <SaveGroupButton group="dsa-problems" label="Save every problem offline" className="self-start" />
        </header>
        <ProblemBrowser data={data} />
      </main>
    </div>
  );
}
