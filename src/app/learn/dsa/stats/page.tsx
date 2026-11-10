import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getProblemIndex, getStepLabels } from "@/lib/dsa/load";
import { buildProblemData } from "@/lib/dsa/problem-rows";
import type { StatRow } from "@/lib/dsa/stats";
import DsaStats from "@/components/dsa/stats/DsaStats";

// /dsa/stats: the learner's own numbers. The page only carries the problem bank in short form (ISR, refreshed with the
// content); everything personal is computed in the browser from their synced progress (src/lib/dsa/stats.ts). Staging only.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "My stats · DSA Mastery",
  description: "Your DSA Mastery numbers: problems solved, streaks, lessons, Bits and belts.",
  robots: { index: false, follow: false },
};

export default async function DsaStatsPage() {
  if (!DSA_FULL) notFound();
  const [problems, concepts, labels] = await Promise.all([getProblemIndex().catch(() => []), getConceptIndex().catch(() => []), getStepLabels().catch(() => ({}))]);
  const data = buildProblemData(problems, { labels, concepts, videos: [] });
  const rows: StatRow[] = data.rows.map((r) => ({ id: r.id, level: r.level, module: r.module, structures: r.structures, algorithms: r.algorithms }));
  return <DsaStats rows={rows} steps={data.steps.map((s) => ({ id: s.id, label: s.label }))} />;
}
