import { Suspense } from "react";
import SearchChat from "@/components/learn/chat/SearchChat";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";

export const runtime = "nodejs";
// A static shell (no data at build time): the query is in the URL, the instant results come from
// /api/search/smart and the chat from /api/learn/ai/chat, both on the client, so a view costs no function time.
export const revalidate = 86400;

export const metadata = {
  title: "Ask the course · System Design Mastery",
  description:
    "Ask the course tutor anything about system design: answers with their sources, the exact second in a lecture, learning paths you can save, practice questions from the course and what to learn next. Instant results across lessons, lecture moments, shorts, side quests, problems, LLD rounds, case files, mocks, war stories, concepts, FAQs, labs, drills and design sheets as you type.",
  alternates: { canonical: "/learn/chat" },
  robots: SMART_SEARCH_PUBLIC ? undefined : { index: false, follow: false },
};

export default function SmartSearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1280px] px-4 pb-32 pt-10 sm:px-6 sm:pt-14" />}>
      <SearchChat />
    </Suspense>
  );
}
