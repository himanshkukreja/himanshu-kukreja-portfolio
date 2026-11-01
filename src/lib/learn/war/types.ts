/** War stories (/learn/war-stories): real stories and war-room incident simulations. */

export const STORY_THEMES = ["scale", "outage", "migration", "cost", "human", "oddity"] as const;
export type StoryTheme = (typeof STORY_THEMES)[number];

export const THEME_LABEL: Record<StoryTheme, string> = {
  scale: "Scale surprise",
  outage: "Outage",
  migration: "Live migration",
  cost: "Money",
  human: "People",
  oddity: "Strange but true",
};

export type StorySource = { label: string; url: string };
export type LessonLink = { title: string; href: string; code: string };

export type StorySummary = {
  slug: string;
  title: string;
  hook: string;
  company: string;
  when: string;
  theme: StoryTheme;
  minutes: number;
  href: string;
};

export type Story = StorySummary & { html: string; sources: StorySource[]; lesson: LessonLink | null };

export type CastMember = { id: string; name: string; role: string };

/** `who`: a cast id, or pager / status / note */
export type Beat =
  | { kind: "msg"; at: string; who: string; html: string }
  | { kind: "chart"; at: string; title: string; points: number[] }
  | { kind: "log"; at: string; title: string; lines: string[] }
  | { kind: "decision"; question: string; options: DecisionOption[] };

export type Reply = { who: string; html: string };
export type DecisionOption = { html: string; best: boolean; minutes: number; users: number; replies: Reply[] };

/** How hard a war room plays (optional `difficulty:` in its front matter). */
export const ROOM_LEVELS = ["intro", "standard", "hard"] as const;
export type RoomLevel = (typeof ROOM_LEVELS)[number];
export const ROOM_LEVEL_LABEL: Record<RoomLevel, string> = { intro: "Warm-up", standard: "Standard", hard: "Hard" };

export type WarRoomSummary = {
  slug: string;
  title: string;
  sev: string;
  /** the card's topic tag: `topic:` in the front matter, else the course week its lesson sits in ("Failure-First Design") */
  topic: string;
  difficulty: RoomLevel | null;
  company: string;
  product: string;
  starts: string;
  minutes: number;
  decisions: number;
  basedOn: string;
  basedOnUrl: string;
  href: string;
};

export type WarRoom = WarRoomSummary & {
  cast: CastMember[];
  beats: Beat[];
  postmortemHtml: string;
  realHtml: string;
  lesson: LessonLink | null;
  /** `week-folder/lesson-slug` of the lesson (the AI routes load its text) */
  lessonRef: string | null;
};

/** The run review's grade (fixed by the server from the run: wrong picks + harmful typed moves). */
export type RunGrade = "strong" | "solid" | "shaky" | "rough";

export const storyHref = (slug: string) => `/learn/war-stories/${slug}`;
export const warRoomHref = (slug: string) => `/learn/war-stories/war-room/${slug}`;
export const warRoomKey = (slug: string) => `warroom:${slug}`;
export const WAR_ROOM_XP = 60;
