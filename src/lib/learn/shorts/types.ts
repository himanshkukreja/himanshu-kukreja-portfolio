/** Shorts shared by the server loader and the client feed. */
export const SHORT_CATEGORIES = [
  { id: "course", label: "Course" },
  { id: "quests", label: "Side quests" },
  { id: "stories", label: "Real incidents" },
  { id: "problems", label: "Interview problems" },
  { id: "lld", label: "Low-level design" },
  { id: "cases", label: "Case files" },
  { id: "mocks", label: "Mock interviews" },
] as const;
export type ShortCategory = (typeof SHORT_CATEGORIES)[number]["id"];

/** One vertical short in the feed. */
export type PlayableShort = {
  id: string;
  title: string;
  /** what it is: "W04 · Caching", "War story · GitLab · 2017" */
  label: string;
  category: ShortCategory;
  topics: string[];
  /** the long lecture's id (views and share links count against it) */
  lecture: string;
  /** the full lecture, opened at this idea (null: none) */
  full: string | null;
  /** the written article or story */
  article: string;
  src: string;
  poster: string;
  /** about how long, in seconds */
  seconds: number;
};
