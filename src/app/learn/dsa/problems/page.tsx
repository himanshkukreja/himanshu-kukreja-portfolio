import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getProblemIndex } from "@/lib/dsa/load";
import SolvedMark from "@/components/dsa/problem/SolvedMark";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";

// /dsa/problems: every built problem, grouped by concept in ladder order, with the learner's solved ticks. Staging only.

export const revalidate = 604800;

export const metadata: Metadata = { title: "Problems · DSA Mastery", robots: { index: false, follow: false } };

export default async function ProblemsPage() {
  if (!DSA_FULL) notFound();
  const [problems, concepts] = await Promise.all([getProblemIndex().catch(() => []), getConceptIndex().catch(() => [])]);
  const byConcept = new Map<string, typeof problems>();
  for (const p of problems) byConcept.set(p.concept, [...(byConcept.get(p.concept) || []), p]);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">The problem bank</span>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            Problems<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">
            Original problems set in everyday apps, each tied to the concept it practises. Python and JavaScript run in your browser; Java and C++ run on the judge.
          </p>
          <SaveGroupButton group="dsa-problems" label="Save every problem offline" className="self-start" />
        </header>
        {[...byConcept.entries()].map(([cid, list]) => {
          const c = concepts.find((x) => x.id === cid);
          return (
            <section key={cid} aria-labelledby={`pc-${cid}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`pc-${cid}`} className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
                  {c?.title || cid}
                </h2>
                <Link href={`/dsa/concepts/${cid}`} className="font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4">
                  the lesson →
                </Link>
              </div>
              <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
                {list.map((p) => (
                  <li key={p.id} className="bg-surface">
                    <Link href={`/dsa/problems/${p.id}`} className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      <span className="w-6 font-mono text-[12px] text-fg-3">{p.order}</span>
                      <SolvedMark id={p.id} />
                      <span className="min-w-0 flex-1 text-[15px] text-fg">{p.title}</span>
                      <span className="hidden font-mono text-[11px] text-fg-3 sm:inline">{p.patterns.join(", ")}</span>
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{p.level}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </main>
    </div>
  );
}
