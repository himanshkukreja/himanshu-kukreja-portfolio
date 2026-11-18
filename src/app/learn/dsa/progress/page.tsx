import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getBadgeDefs, getConceptIndex, getProblemIndex, getStepLabels, getWorld } from "@/lib/dsa/load";
import { buildProblemData } from "@/lib/dsa/problem-rows";
import type { StatRow } from "@/lib/dsa/stats";
import { loadOutline } from "@/lib/dsa/toolbox-load";
import { getLeanIndex } from "@/lib/dsa/kinds-load";
import ProgressPage from "@/components/dsa/progress/ProgressPage";

// /dsa/progress (the Progress tab): summary, readiness, streak, plan, belt and badges, leaderboard, stats, certificate, share,
// settings. The page carries the bank and the lessons in short form (ISR, refreshed with the content); everything personal is
// computed in the browser from the learner's synced progress. Staging only.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Progress · DSA Mastery",
  description: "Your DSA Mastery progress: lessons and problems done, interview readiness, streak, belt, certificate and settings.",
  robots: { index: false, follow: false },
};

export default async function DsaProgressPage() {
  if (!DSA_FULL) notFound();
  const [defs, problems, concepts, labels, academy, { outline }, lean] = await Promise.all([
    getBadgeDefs().catch(() => null),
    getProblemIndex().catch(() => []),
    getConceptIndex().catch(() => []),
    getStepLabels().catch(() => ({})),
    getWorld("academy").catch(() => null),
    loadOutline(),
    getLeanIndex().catch(() => []),
  ]);
  const data = buildProblemData(problems, { labels, concepts, videos: [] });
  const rows: StatRow[] = data.rows.map((r) => ({ id: r.id, level: r.level, module: r.module, structures: r.structures, algorithms: r.algorithms }));
  const built = concepts.filter((c) => c.status === "built");
  // the Academy's parts, each with its ready lessons (a module belongs to the part of its region)
  const partOfModule = new Map<string, string>((academy?.regions || []).filter((r) => r.part).map((r) => [r.module, String(r.part)]));
  const parts = (academy?.parts || [])
    .map((p) => ({ id: p.id, title: p.label ? `${p.label} ${p.title}`.trim() : p.title, concepts: built.filter((c) => partOfModule.get(c.module) === p.id).map((c) => c.id) }))
    .filter((p) => p.concepts.length);
  // the streets, camp tents and sets count as lessons done (their `dsa:c:` key is their progress slug), in a part of their own
  if (lean.length) parts.push({ id: "beyond", title: "Beyond the Academy: streets, camps and sets", concepts: lean.map((l) => l.key) });
  return (
    <ProgressPage
      defs={defs}
      outline={outline}
      problemRefs={problems.map((p) => ({ id: p.id, concept: p.concept, level: p.level }))}
      problems={problems.map((p) => ({ id: p.id, level: p.level }))}
      parts={parts}
      lessonTotal={parts.reduce((a, p) => a + p.concepts.length, 0)}
      plannedLessons={concepts.length - built.length}
      rows={rows}
      steps={data.steps.map((s) => ({ id: s.id, label: s.label }))}
    />
  );
}
