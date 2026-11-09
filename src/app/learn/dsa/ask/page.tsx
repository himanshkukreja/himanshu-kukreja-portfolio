import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getProblemIndex } from "@/lib/dsa/load";
import DsaAsk from "@/components/dsa/ask/DsaAsk";

// /dsa/ask: DSA Mastery's AI tutor as a page (the course chat's layout: history, the conversation, the sources), grounded
// in DSA content by /api/learn/ai/dsa/ask. The shell is static (ISR, refreshed with the content); every learner's chat,
// history and quota load on the client. Staging only until launch.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Ask · DSA Mastery",
  description: "Ask DSA Mastery's tutor about data structures, algorithms and the course's problems: answers from the lessons, lectures and problems, with their sources.",
  alternates: { canonical: "/dsa/ask" },
  robots: { index: false, follow: false },
};

export default async function DsaAskPage() {
  if (!DSA_FULL) notFound();
  const [concepts, problems] = await Promise.all([getConceptIndex().catch(() => []), getProblemIndex().catch(() => [])]);
  const built = concepts.filter((c) => c.status === "built").map((c) => ({ id: c.id, title: c.title, summary: c.summary }));
  return (
    <div className="dsa-theme">
      {/* the starters need only a few problems: the first rung of each ladder */}
      <Suspense fallback={<main className="min-h-[60vh]" />}>
        <DsaAsk concepts={built} problems={problems.filter((p) => p.order === 1).slice(0, 4).map((p) => ({ id: p.id, title: p.title, concept: p.concept, level: p.level }))} />
      </Suspense>
    </div>
  );
}
