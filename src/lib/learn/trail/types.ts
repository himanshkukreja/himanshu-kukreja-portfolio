/**
 * Engineering-blog reading trail: 2-3 real write-ups per lesson and side quest (company engineering
 * blogs, papers, talks, postmortems), each with a three-line summary tying it to the lesson.
 * Source: resources/reading-trail/*.yml in the content repo (format: README.md there).
 * Client-safe: no server imports.
 */

export const TRAIL_TYPES = ["blog post", "paper", "talk", "postmortem", "docs"] as const;
export type TrailType = (typeof TRAIL_TYPES)[number];

export const TRAIL_TYPE_LABEL: Record<TrailType, string> = {
  "blog post": "Blog post",
  paper: "Paper",
  talk: "Talk",
  postmortem: "Postmortem",
  docs: "Docs",
};

export type TrailSummary = {
  /** what the piece is */
  what: string;
  /** its key idea */
  idea: string;
  /** how it connects to this lesson */
  connects: string;
};

export type TrailEntry = {
  /** unique within the lesson; the read flag refers to it */
  id: string;
  title: string;
  /** the organisation behind the system or the writing (Uber, Google, Zerodha…): shown as text, no logos; the index filters by it */
  company: string;
  /** where it is published ("Uber Engineering Blog", "USENIX OSDI"): "Read on <publisher>" */
  publisher: string;
  authors: string[];
  year: number | null;
  /** canonical https URL */
  url: string;
  /** hostname of url, for "Read on …" when the publisher name is long */
  host: string;
  type: TrailType;
  /** estimated reading (or watching) minutes */
  minutes: number;
  /** the lesson concept it illustrates ("taught here: …") */
  concept: string;
  summary: TrailSummary;
  /** verification note (e.g. checked through an archive snapshot because the site blocks bots) */
  note: string | null;
  /** date the link and title were last checked (YYYY-MM-DD) */
  checked: string | null;
};

/** "<week folder>/<lesson slug>", e.g. "week-02-failure-first-design/day-03-circuit-breakers" */
export type TrailLessonKey = string;

export type TrailLessonRef = {
  key: TrailLessonKey;
  week: string;
  slug: string;
  title: string;
  /** "D3", "B", "P2", "SQ-07" */
  code: string;
  /** "W02 · DAY 03", "SQ-07" */
  tag: string;
  href: string;
};

export type TrailIndexLesson = TrailLessonRef & { entries: TrailEntry[] };

export type TrailIndexGroup = {
  /** week folder or "bonus-problems" */
  key: string;
  /** "W02", "SQ" */
  code: string;
  title: string;
  lessons: TrailIndexLesson[];
};

/** Game-flag key holding a lesson's read marks: { [entryId]: epochMs }. Synced for signed-in learners. */
export const trailFlagKey = (lesson: TrailLessonKey) => `trail:${lesson}`;

export function readMarks(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === "number" && t > 0) out[k] = t;
  return out;
}
