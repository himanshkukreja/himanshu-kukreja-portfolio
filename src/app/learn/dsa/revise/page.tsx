import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblemIndex } from "@/lib/dsa/load";
import { getDsaDecks } from "@/lib/dsa/revise-load";
import DsaRevise from "@/components/dsa/revise/DsaRevise";

// /dsa/revise: re-solve reminders, the learner's due cards and the pattern decks. The decks come from the content repo
// (ISR, refreshed on every content sync); the queues are per learner and load in the browser. Staging only.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Revise · DSA Mastery",
  description: "Re-solve the problems that tripped you up after 1, 3 and 7 days, and flip a pattern deck for every concept.",
  robots: { index: false, follow: false },
};

export default async function DsaRevisePage() {
  if (!DSA_FULL) notFound();
  const [decks, problems] = await Promise.all([getDsaDecks().catch(() => []), getProblemIndex().catch(() => [])]);
  return <DsaRevise decks={decks} problems={problems.map((p) => ({ id: p.id, title: p.title, level: p.level, concept: p.concept }))} />;
}
