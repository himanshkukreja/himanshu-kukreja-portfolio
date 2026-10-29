/**
 * Example searches: what smart search can do, one category per kind of thing, for the empty search page
 * (and the course chat's conversation starters). Every one was run against the real index (29 Oct 2026:
 * index parts a-e plus production's transcripts with its shorts) and kept only when the results lead with
 * what the category promises; `expect` names that kind, so they can be re-checked after the index changes.
 *
 * `ai`: the example uses Ask (the AI answer and learning path, signed-in learners, metered). The rest are
 * instant (deterministic results, no AI): they must not read as a plain-English ask (isNaturalQuery false),
 * or they would start the AI path on their own (scripts/smart-search-check.ts holds them to that).
 */
import type { Kind } from "./types";

/** The icon a category shows: a result kind's icon, or "ask" / "path" for the AI ones. */
export type ExampleIcon = Kind | "ask" | "path";

export type ExampleCategory = {
  id: string;
  label: string;
  /** one line on what this kind of search gives you */
  blurb: string;
  icon: ExampleIcon;
  /** these use Ask (AI): an answer in plain words and a learning path */
  ai: boolean;
};

export type SearchExample = {
  text: string;
  /** an ExampleCategory id */
  category: string;
  ai: boolean;
  icon: ExampleIcon;
  /** the kind the results should lead with (for re-checking against the index); none for AI asks */
  expect?: Kind;
};

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  { id: "learn", label: "Find a lesson or concept", blurb: "The concept, the lesson that teaches it, and the exact section.", icon: "concept", ai: false },
  { id: "moment", label: "Jump to the second in a lecture", blurb: "Lecture moments open the video at the second the idea starts.", icon: "moment", ai: false },
  { id: "short", label: "Shorts", blurb: "One idea in under a minute.", icon: "short", ai: false },
  { id: "quest", label: "Side quests by company", blurb: "How real products are built: UPI, WhatsApp, Zerodha and 33 more.", icon: "quest", ai: false },
  { id: "interview", label: "Interview prep, problems and LLD", blurb: "Company prep pages, interview problems and low-level design rounds.", icon: "problem", ai: false },
  { id: "mock", label: "Mock interviews", blurb: "Full rounds with an interviewer, phase by phase.", icon: "mock", ai: false },
  { id: "war", label: "War stories and outages", blurb: "Real outages, what broke and what fixed it.", icon: "war", ai: false },
  { id: "case", label: "Case files", blurb: "Long-form stories of one system under pressure.", icon: "case", ai: false },
  { id: "practice", label: "Drills, labs, sheets, revision and reading", blurb: "Practise, revise, and read the papers and postmortems behind a lesson.", icon: "drill", ai: false },
  { id: "ask", label: "Ask in plain English", blurb: "A direct answer from the course, with its sources, then where to read more.", icon: "ask", ai: true },
  { id: "path", label: "Get a learning path", blurb: "The right lessons, moments and practice, in order, with why each one.", icon: "path", ai: true },
];

const CAT = new Map(EXAMPLE_CATEGORIES.map((c) => [c.id, c]));
const ex = (category: string, text: string, expect?: Kind): SearchExample => {
  const c = CAT.get(category)!;
  return { text, category, ai: c.ai, icon: c.icon, ...(expect ? { expect } : {}) };
};

export const SEARCH_EXAMPLES: SearchExample[] = [
  ex("learn", "consistent hashing", "concept"),
  ex("learn", "leader election", "concept"),
  ex("learn", "CAP theorem", "concept"),
  ex("moment", "request coalescing video", "moment"),
  ex("moment", "token bucket video", "moment"),
  ex("moment", "thundering herd video", "lecture"),
  ex("short", "shorts on circuit breakers", "short"),
  ex("short", "shorts on UPI", "short"),
  ex("short", "shorts on payments", "short"),
  ex("quest", "India's UPI", "quest"),
  ex("quest", "WhatsApp", "quest"),
  ex("quest", "Zerodha Kite", "company"),
  ex("quest", "IRCTC tatkal booking", "quest"),
  ex("quest", "BookMyShow seat booking", "quest"),
  ex("quest", "Flipkart Big Billion Days", "quest"),
  ex("interview", "Google interview prep", "company"),
  ex("interview", "design a chat system", "problem"),
  ex("interview", "LLD parking lot", "lld"),
  ex("interview", "machine coding round", "lld"),
  ex("mock", "flash sale mock interview", "mock"),
  ex("mock", "Billbolt mock interview", "mock"),
  ex("war", "Facebook outage", "war"),
  ex("war", "Cloudflare outage", "trail"),
  ex("war", "retry storm outage", "war"),
  ex("case", "CrowdStrike case file", "case"),
  ex("case", "Hotstar case file", "case"),
  ex("case", "Tatkal case file", "case"),
  ex("practice", "follow-up drills on sharding", "drill"),
  ex("practice", "code lab LRU cache", "lab"),
  ex("practice", "design sheet WhatsApp", "sheet"),
  ex("practice", "revision cards rate limiting", "card"),
  ex("practice", "Dynamo paper", "trail"),
  ex("ask", "Why does my cache stampede at midnight?"),
  ex("ask", "Why do users get charged twice when they double-click pay?"),
  ex("ask", "How does WhatsApp deliver messages to offline users?"),
  ex("ask", "How do I prepare for a system design interview in 2 weeks?"),
  ex("path", "Teach me caching from scratch"),
  ex("path", "I'm a beginner. Where do I start?"),
  ex("path", "I have a Flipkart interview next week. What should I study?"),
];

/** The examples of one category, in order. */
export const examplesIn = (category: string) => SEARCH_EXAMPLES.filter((e) => e.category === category);
