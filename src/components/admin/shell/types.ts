/** Shapes of the admin APIs the shell + Overview + Content screens consume (see admin brief). */

export type TrafficKpis = {
  visitors: number;
  pageviews: number;
  sessions: number;
  bounceRate: number;
  avgEngagedSec: number;
  newPct: number;
  signedIn: number;
  live: number;
};
export type TrafficOverview = {
  kpis: TrafficKpis & { prev: Partial<TrafficKpis> };
  series: { t: string; visitors: number; pageviews: number; sessions: number }[];
};
export type TrafficLive = {
  live: number;
  pages: { path: string; n: number }[];
  recent: { at: string; path: string; country: string | null; city: string | null; device: string | null; channel: string | null }[];
};

export type LearnersSummary = {
  learners: number;
  guests: number;
  activeToday: number;
  active7d: number;
  lessonsCompleted: number;
  stagesDone: number;
  avgMinutesPerLearner: number;
  topLessons: { course: string; week: string; lesson: string; title: string; readers: number; completions: number }[];
  recent: { userId: string; name: string | null; email: string | null; lesson: string; title: string; stage: string | null; at: string }[];
};

export type Subscriber = {
  email: string;
  created_at: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone?: string | null;
  unsubscribed?: boolean | null;
  unsubscribed_at?: string | null;
};

export type ContactQuery = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: "new" | "replied" | "resolved" | string;
  created_at: string;
  admin_notes?: string | null;
};

export type SendLog = {
  email: string;
  status: string;
  detail?: string | null;
  created_at: string;
  campaign_id?: number | null;
  story_slugs?: string[] | null;
};

export type StoryLite = { slug: string; title: string; excerpt?: string; date?: string };

export type { AdminUserRow } from "@/app/api/admin/users/route";
export type { AdminComment } from "@/app/api/admin/comments/route";
export type { StoryStat } from "@/app/api/admin/stories/route";
