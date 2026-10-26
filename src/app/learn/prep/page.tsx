import type { Metadata } from "next";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { getSheetSummaries } from "@/lib/learn/sheets/load";
import { getCompanies, getQuestionBank } from "@/lib/learn/prep/load";
import { listLectures } from "@/lib/learn/lecture/load";
import PrepHub, { type PracticeData } from "@/components/learn/prep/PrepHub";
import { lectureGroupAnchor, lectureGroupCode } from "@/lib/learn/lecture/types";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Interview prep · System Design Mastery",
  description:
    "System design interview prep in one place: company pages with reported questions and sources, a question bank, the classic problems and low-level design, timed mock interviews (solo or with a peer), revision decks, cheat and design sheets, code labs, a numbers playground and a study planner.",
  alternates: { canonical: "/learn/prep" },
};

/**
 * /learn/prep: the Prep tab's hub. The counts come from the same loaders as each tool's own page (all
 * cached, none of them can fail the page); the learner's state is read in the browser, so a saved copy
 * works offline.
 */
export default async function PrepPage() {
  const [map, labs, revision, sheets, companies, bank, lectures] = await Promise.all([
    getCourseMap(COURSE_ID).catch(() => null),
    getLabSummaries().catch(() => []),
    getRevisionWeeks().catch(() => []),
    getSheetSummaries().catch(() => []),
    getCompanies().catch(() => []),
    getQuestionBank().catch(() => []),
    listLectures().catch(() => []),
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
    companies: [...companies].sort((a, b) => b.reported - a.reported || a.name.localeCompare(b.name)),
    bank: { questions: bank.length, reported: bank.filter((b) => b.companies.some((c) => c.evidence === "reported")).length },
    problems: (map?.problems ?? []).map((l) => ({ code: l.code, title: l.title, href: l.href })),
    lld: (map?.lld ?? []).map((l) => ({ code: l.code, title: l.title, href: l.href })),
    sheets: sheets.map((s) => ({ slug: s.slug, code: s.code, title: s.title, href: s.href, diagrams: s.diagrams })),
    mockVideos: Object.fromEntries(
      lectures.filter((l) => l.track === "mocks").map((l) => [l.slug.replace(/^mock-interviews--/, ""), { href: l.href, minutes: l.minutes }])
    ),
    lectures: {
      count: lectures.length,
      minutes: lectures.reduce((a, l) => a + l.minutes, 0),
      first: lectures[0] ? { href: lectures[0].href, title: lectures[0].title } : null,
      groups: lectures.reduce<{ name: string; anchor: string; code: string; count: number }[]>((out, l) => {
        const g = out[out.length - 1];
        if (g && g.name === l.group) g.count++;
        else out.push({ name: l.group, anchor: lectureGroupAnchor(l.group), code: lectureGroupCode(l.group), count: 1 });
        return out;
      }, []),
    },
  };
  return <PrepHub data={data} />;
}
