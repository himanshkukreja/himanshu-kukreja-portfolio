import "server-only";
import { adminEmails } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { isLikelyBot } from "@/lib/admin/traffic/model";
import type { Features } from "./types";

/**
 * Raw learner data, loaded once and shared by every learner/course report for 30 s.
 * The data set is small (tens of learners, ~100 progress rows, a few thousand learn events), so
 * the reports aggregate in memory; each table is read in parallel pages of 1000.
 */

export type ProgressRow = {
  id: string;
  user_id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  status: string | null;
  progress_percentage: number | null;
  time_spent: number | null;
  scroll_position: number | null;
  started_at: string | null;
  completed_at: string | null;
  last_accessed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  // migration 20261014 (optional)
  completed_stages?: string[] | null;
  last_stage?: string | null;
  max_progress?: number | null;
};

export type EventRow = {
  id: string;
  event_type: string;
  page_path: string | null;
  page_title: string | null;
  visitor_id: string | null;
  session_id: string | null;
  referrer: string | null;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  screen_width: number | null;
  screen_height: number | null;
  country: string | null;
  city: string | null;
  created_at: string;
  duration: number | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  provider: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  total_lessons_completed: number | null;
  total_time_spent: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  xp?: number | null;
  game_done?: Record<string, number> | null;
};

export type Dataset = {
  loadedAt: number;
  users: AuthUser[];
  profiles: Map<string, ProfileRow>;
  progress: ProgressRow[];
  streaks: { user_id: string; activity_date: string; lessons_completed: number | null; time_spent: number | null }[];
  assessments: { id: string; course_id: string; week: string; lesson_slug: string; title: string; total_questions: number | null }[];
  answers: { user_id: string; assessment_id: string; question_number: number; selected_option: string; created_at: string; updated_at: string | null }[];
  notes: { id: string; user_id: string; course_id: string; week: string; lesson_slug: string; created_at: string }[];
  bookmarks: { id: string; user_id: string; course_id: string; week: string; lesson_slug: string; created_at: string }[];
  comments: { id: string; user_id: string; course_id: string; week: string; lesson_slug: string; created_at: string }[];
  /** learn-path events + every event of a signed-in user, bots removed, oldest first */
  events: EventRow[];
  trials: { user_id: string; week: string; part: number; score: number; total: number; passed: boolean; finished_at: string | null; started_at: string }[];
  admins: Set<string>;
  features: Features;
};

const PAGE = 1000;

type PgError = { code?: string; message?: string; details?: string | null } | null;
function isMissing(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

/** Read every row of a query in parallel pages. `optional` tables that don't exist return []. */
async function readAll<T>(table: string, columns: string, apply: (q: Builder) => Builder = (q) => q, optional = false): Promise<T[]> {
  if (optional) {
    // HEAD requests don't surface "table not found"; probe with a tiny GET first
    const probe = await supabase.from(table).select("id").limit(1);
    if (probe.error) {
      if (isMissing(probe.error)) return [];
      throw new Error(`${table}: ${probe.error.message}`);
    }
  }
  const head = await apply(supabase.from(table).select(columns, { count: "exact", head: true }));
  if (head.error) {
    if (optional && isMissing(head.error)) return [];
    throw new Error(`${table}: ${head.error.message}`);
  }
  const total: number = head.count ?? 0;
  if (!total) return [];
  const pages = Math.ceil(total / PAGE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => apply(supabase.from(table).select(columns)).order("id").range(i * PAGE, i * PAGE + PAGE - 1))
  );
  const out: T[] = [];
  for (const r of results) {
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    out.push(...((r.data || []) as T[]));
  }
  return out;
}

async function listAuthUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    const users = data?.users || [];
    users.forEach((u) => {
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      out.push({
        id: u.id,
        email: u.email || "",
        name: (meta.full_name as string) || (meta.name as string) || null,
        avatar: (meta.avatar_url as string) || (meta.picture as string) || null,
        provider: (u.app_metadata?.provider as string) || null,
        createdAt: u.created_at || null,
        lastSignInAt: u.last_sign_in_at || null,
      });
    });
    if (users.length < 1000) break;
  }
  return out;
}

const EVENT_COLS =
  "id,event_type,page_path,page_title,visitor_id,session_id,referrer,referrer_domain,utm_source,utm_medium,utm_campaign,user_agent,device_type,browser,os,screen_width,screen_height,country,city,created_at,duration,metadata,user_id";

async function load(): Promise<Dataset> {
  const admins = new Set(adminEmails());
  const [users, profiles, progress, streaks, assessments, answers, notes, bookmarks, comments, events, trials] = await Promise.all([
    listAuthUsers(),
    readAll<ProfileRow>("user_profiles", "*"),
    readAll<ProgressRow>("learning_progress", "*"),
    readAll<Dataset["streaks"][number]>("learning_streaks", "id,user_id,activity_date,lessons_completed,time_spent"),
    readAll<Dataset["assessments"][number]>("mcq_assessments", "id,course_id,week,lesson_slug,title,total_questions"),
    readAll<Dataset["answers"][number]>("mcq_user_answers", "id,user_id,assessment_id,question_number,selected_option,created_at,updated_at"),
    readAll<Dataset["notes"][number]>("content_notes", "id,user_id,course_id,week,lesson_slug,created_at"),
    readAll<Dataset["bookmarks"][number]>("bookmarks", "id,user_id,course_id,week,lesson_slug,created_at"),
    readAll<Dataset["comments"][number]>("lesson_comments", "id,user_id,course_id,week,lesson_slug,created_at"),
    readAll<EventRow>("analytics_events", EVENT_COLS, (q) => q.or("user_id.not.is.null,page_path.like./learn/*")),
    readAll<Dataset["trials"][number]>("trial_attempts", "id,user_id,week,part,score,total,passed,finished_at,started_at", (q) => q, true),
  ]);

  const cleanEvents = events
    // signed-in rows are people; anonymous rows go through the bot filter
    .filter((e) => (e.user_id || !isLikelyBot(e)) && !(e.page_path || "").startsWith("/admin"))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const sampleProgress = progress[0] as ProgressRow | undefined;
  const sampleProfile = profiles[0];
  const learnEvents = cleanEvents.some((e) => e.event_type === "event" && typeof e.metadata?.name === "string" && /^(lesson_open|stage_reach|stage_done|lesson_complete)$/.test(String(e.metadata?.name)));

  let reviewCards = false;
  {
    const { error } = await supabase.from("review_cards").select("id").limit(1);
    reviewCards = !error;
  }
  let trialAttempts = false;
  {
    const { error } = await supabase.from("trial_attempts").select("id").limit(1);
    trialAttempts = !error;
  }

  return {
    loadedAt: Date.now(),
    users,
    profiles: new Map(profiles.map((p) => [p.id, p])),
    progress: progress.filter((p) => p.user_id && p.week && p.lesson_slug),
    streaks,
    assessments,
    answers,
    notes,
    bookmarks,
    comments,
    events: cleanEvents,
    trials,
    admins,
    features: {
      stageColumns: !!sampleProgress && "completed_stages" in sampleProgress,
      gameColumns: !!sampleProfile && "xp" in sampleProfile,
      trialAttempts,
      reviewCards,
      learnEvents,
      pageLeave: cleanEvents.some((e) => e.event_type === "page_leave"),
    },
  };
}

const TTL = 30_000;
let cache: { at: number; value: Promise<Dataset> } | null = null;

export async function getDataset(opts: { fresh?: boolean } = {}): Promise<Dataset> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const value = load();
  cache = { at: Date.now(), value };
  try {
    return await value;
  } catch (e) {
    cache = null;
    throw e;
  }
}

/** Drop the cache (after a reset). */
export function invalidateDataset() {
  cache = null;
}
