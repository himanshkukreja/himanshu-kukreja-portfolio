import type { Metadata } from "next";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { getCatalogue } from "@/lib/concepts/load";
import PracticeHub, { type PracticeData } from "@/components/learn/practice/PracticeHub";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Practice · System Design Mastery",
  description:
    "The interview-prep toolkit of System Design Mastery: five-minute revision decks, one-page cheat sheets, Python code labs, mock interviews, design of the week, a numbers playground, a study planner, a concept map and a reading trail.",
  alternates: { canonical: "/learn/practice" },
};

/**
 * /learn/practice: one page for every practice tool outside the lessons. The counts come from the
 * same loaders as each tool's own page (all cached, none of them can fail the page); the learner's
 * state (revised, cleared, planned) is read in the browser, so a saved copy works offline.
 */
export default async function PracticePage() {
  const [map, labs, revision, concepts] = await Promise.all([
    getCourseMap(COURSE_ID).catch(() => null),
    getLabSummaries().catch(() => []),
    getRevisionWeeks().catch(() => []),
    getCatalogue()
      .then((c) => c.catalogue.concepts.length)
      .catch(() => 0),
  ]);
  const decks = revision.filter((w) => w.lessons.length > 0);
  const data: PracticeData = {
    revision: {
      weeks: decks.map((w) => ({ key: w.key, id: w.id, code: w.code, title: w.title, lessons: w.lessons.map((l) => l.slug) })),
      lessons: decks.reduce((a, w) => a + w.lessons.length, 0),
      cards: decks.reduce((a, w) => a + w.cards, 0),
    },
    labs: labs.map((l) => ({ id: l.id, xp: l.xp })),
    mocks: map?.mocks ?? [],
    concepts,
  };
  return <PracticeHub data={data} />;
}
