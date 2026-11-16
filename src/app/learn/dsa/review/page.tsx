import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblemIndex } from "@/lib/dsa/load";
import { getDsaDecks } from "@/lib/dsa/revise-load";
import { listCheatsheets } from "@/lib/dsa/cheatsheet";
import { listDsaShorts } from "@/lib/dsa/media";
import ReviewPage from "@/components/dsa/review/ReviewPage";

// /dsa/review (the Review tab): due cards, mistakes to redo, shorts, cheat sheets, plans, drills, reference. Decks, shorts and
// sheets come from the content (ISR; the shorts go through the publishing controls and the page is refreshed when they change);
// the queues are per learner and load in the browser. Staging only.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Review · DSA Mastery",
  description: "Cards that are due, problems to redo, 60-second shorts and cheat sheets for the lessons you have done.",
  robots: { index: false, follow: false },
};

const conceptOf = (href: string) => href.split("/").filter(Boolean).pop() || "";

export default async function DsaReviewPage() {
  if (!DSA_FULL) notFound();
  const [decks, problems, shorts, sheets] = await Promise.all([getDsaDecks().catch(() => []), getProblemIndex().catch(() => []), listDsaShorts().catch(() => []), listCheatsheets().catch(() => [])]);
  return (
    <ReviewPage
      decks={decks}
      problems={problems.map((p) => ({ id: p.id, title: p.title, level: p.level, concept: p.concept }))}
      shorts={shorts.map((s) => ({ id: s.id, title: s.title, label: s.label, poster: s.poster, seconds: s.seconds, concept: conceptOf(s.article) }))}
      sheets={sheets.map((s) => ({ id: s.id, title: s.title, code: s.code, moduleTitle: s.moduleTitle, invariant: s.invariant, concept: s.id }))}
    />
  );
}
