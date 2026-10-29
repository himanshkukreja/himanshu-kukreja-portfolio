import { Suspense } from "react";
import SmartSearch from "@/components/learn/search/SmartSearch";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";

export const runtime = "nodejs";
// A static shell (no data at build time): the query is in the URL and the results load on the client
// from /api/search/smart, so the page itself costs no function time per view.
export const revalidate = 86400;

export const metadata = {
  title: "Smart search · System Design Mastery",
  description:
    "Search the whole course in plain English: lessons and their sections, lecture moments at the exact second, shorts, side quests, interview problems, LLD rounds, case files, mock interviews, war stories, concepts, FAQs, labs and design sheets. Ask, and get a short learning path.",
  alternates: { canonical: "/learn/search" },
  // until launch (lib/search/smart/flag.ts) the page is an admin preview: keep it out of search engines
  robots: SMART_SEARCH_PUBLIC ? undefined : { index: false, follow: false },
};

export default function SmartSearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1080px] px-4 pb-32 pt-10 sm:px-6 sm:pt-14" />}>
      <SmartSearch />
    </Suspense>
  );
}
