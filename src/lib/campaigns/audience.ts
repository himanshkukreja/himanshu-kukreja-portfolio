/**
 * Who a campaign goes to, and the merge data for each person. Server-only, read-only.
 *
 *   all            every account with an email
 *   learners       accounts with any learn activity (same definition as the old announce tab)
 *   subscribers    active newsletter_subscribers (with or without an account)
 *   active         accounts with lesson progress / streak activity in the last N days
 *   never_started  accounts with no learn activity at all
 *   completed      accounts with ≥ N completed lessons
 *   custom         pasted addresses (matched to accounts for names + merge data)
 *
 * Always excluded: unsubscribed (newsletter_subscribers), suppressed (bounces, email_suppressions),
 * banned accounts. Addresses are lower-cased and de-duplicated. Base data is cached for 60 s so the
 * composer's live counts are cheap.
 */
import { supabase } from "@/lib/supabase";
import { learnActiveUserIds } from "@/lib/announce/audience";
import { COURSE_ID } from "@/lib/learn/course";
import { SITE } from "./links";
import { firstNameOf, type MergeVars } from "./tags";
import { getStore } from "./store";
import type { AudienceCount, AudienceSpec, Recipient, RecipientPreview } from "./types";

const PAGE = 1000;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const lc = (s: string) => s.toLowerCase().trim();

type Person = {
  userId: string;
  email: string;
  name: string | null;
  createdAt: string | null;
  streak: number;
  completed: number;
  lastActivity: number;
  current: { course: string; week: string; slug: string } | null;
  active: boolean;
};

type Base = {
  at: number;
  people: Map<string, Person>; // by email
  subscribers: Set<string>; // active subscribers
  unsubscribed: Set<string>;
  suppressed: Set<string>;
  titles: Map<string, { title: string; href: string }>;
};

async function pageAll<T>(fn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, soft = true): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 2_000_000; from += PAGE) {
    const { data, error } = await fn(from, from + PAGE - 1);
    if (error) {
      if (soft) return out;
      throw new Error(error.message);
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type AuthUser = { id: string; email?: string | null; banned_until?: string | null; created_at?: string; user_metadata?: Record<string, unknown> | null };

async function authUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page < 200; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = (data?.users || []) as AuthUser[];
    out.push(...users);
    if (users.length < PAGE) break;
  }
  return out;
}

async function lessonTitles(): Promise<Map<string, { title: string; href: string }>> {
  const out = new Map<string, { title: string; href: string }>();
  try {
    const { getCourseIndex } = await import("@/lib/admin/learners/course");
    const idx = await getCourseIndex();
    for (const l of idx.ordered) out.set(`${l.week}/${l.slug}`, { title: l.title, href: l.href });
  } catch {
    /* course map unavailable (GitHub down, scripts): fall back to slugs */
  }
  return out;
}

let baseCache: { at: number; value: Promise<Base> } | null = null;

async function buildBase(): Promise<Base> {
  type Prof = { id: string; full_name: string | null; current_streak?: number | null; total_lessons_completed?: number | null };
  type Prog = { user_id: string; course_id: string | null; week: string; lesson_slug: string; status: string | null; last_accessed_at: string | null; updated_at: string | null; completed_at: string | null };
  const [users, active, profiles, progress, streaks, subs, blocked, titles] = await Promise.all([
    authUsers(),
    learnActiveUserIds(),
    pageAll<Prof>((a, b) => supabase.from("user_profiles").select("id, full_name, current_streak, total_lessons_completed").range(a, b)).then(async (rows) =>
      rows.length ? rows : pageAll<Prof>((a, b) => supabase.from("user_profiles").select("id, full_name").range(a, b))
    ),
    pageAll<Prog>((a, b) => supabase.from("learning_progress").select("user_id, course_id, week, lesson_slug, status, last_accessed_at, updated_at, completed_at").range(a, b)),
    pageAll<{ user_id: string; activity_date: string }>((a, b) => supabase.from("learning_streaks").select("user_id, activity_date").range(a, b)),
    pageAll<{ email: string; unsubscribed: boolean | null }>((a, b) => supabase.from("newsletter_subscribers").select("email, unsubscribed").range(a, b), false),
    getStore().allBlocked(),
    lessonTitles(),
  ]);

  const prof = new Map(profiles.map((p) => [p.id, p]));
  const stat = new Map<string, { done: Set<string>; last: number; current: Person["current"]; currentAt: number }>();
  const ts = (s: string | null | undefined) => (s ? new Date(s).getTime() || 0 : 0);
  for (const r of progress) {
    const s = stat.get(r.user_id) || { done: new Set<string>(), last: 0, current: null, currentAt: 0 };
    const key = `${r.week}/${r.lesson_slug}`;
    if (r.status === "completed") s.done.add(key);
    const at = Math.max(ts(r.last_accessed_at), ts(r.updated_at), ts(r.completed_at));
    s.last = Math.max(s.last, at);
    if (at >= s.currentAt) {
      s.currentAt = at;
      s.current = { course: r.course_id || COURSE_ID, week: r.week, slug: r.lesson_slug };
    }
    stat.set(r.user_id, s);
  }
  for (const r of streaks) {
    const s = stat.get(r.user_id) || { done: new Set<string>(), last: 0, current: null, currentAt: 0 };
    s.last = Math.max(s.last, ts(r.activity_date));
    stat.set(r.user_id, s);
  }

  const now = Date.now();
  const people = new Map<string, Person>();
  for (const u of users) {
    const email = lc(u.email || "");
    if (!email || !EMAIL_RE.test(email) || people.has(email)) continue;
    if (u.banned_until && new Date(u.banned_until).getTime() > now) continue;
    const meta = u.user_metadata || {};
    const metaName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
    const p = prof.get(u.id);
    const s = stat.get(u.id);
    people.set(email, {
      userId: u.id,
      email,
      name: p?.full_name || metaName || null,
      createdAt: u.created_at || null,
      streak: Number(p?.current_streak || 0),
      completed: Math.max(s?.done.size || 0, Number(p?.total_lessons_completed || 0)),
      lastActivity: s?.last || 0,
      current: s?.current || null,
      active: active.has(u.id) || !!s,
    });
  }
  const subscribers = new Set<string>();
  for (const r of subs) if (r.email && !r.unsubscribed) subscribers.add(lc(r.email));
  return { at: now, people, subscribers, unsubscribed: blocked.unsubscribed, suppressed: blocked.suppressed, titles };
}

async function base(): Promise<Base> {
  if (baseCache && Date.now() - baseCache.at < 60_000) return baseCache.value;
  const value = buildBase();
  baseCache = { at: Date.now(), value };
  value.catch(() => {
    if (baseCache?.value === value) baseCache = null;
  });
  return value;
}

export const invalidateAudience = () => {
  baseCache = null;
};

function parseCustom(raw: string) {
  const parts = raw.split(/[\s,;]+/).map((s) => s.replace(/^<|>$/g, "").trim()).filter(Boolean);
  const valid = parts.filter((p) => EMAIL_RE.test(p)).map(lc);
  return { valid, invalid: parts.length - valid.length };
}

/** Recipients for a spec (eligible only) + the counts shown next to the picker. */
export async function resolveAudience(spec: AudienceSpec, opts: { exclude?: Set<string>; storyExclude?: Set<string> } = {}): Promise<{ recipients: Recipient[]; count: AudienceCount }> {
  const b = await base();
  const now = Date.now();
  let candidates: string[] = [];
  let invalid = 0;
  const accounts = [...b.people.values()];
  switch (spec.kind) {
    case "all":
      candidates = accounts.map((p) => p.email);
      break;
    case "learners":
      candidates = accounts.filter((p) => p.active).map((p) => p.email);
      break;
    case "subscribers":
      candidates = [...b.subscribers];
      break;
    case "subscribers_learners":
      candidates = [...b.subscribers, ...accounts.filter((p) => p.active).map((p) => p.email)];
      break;
    case "active": {
      const days = Math.min(Math.max(Math.round(spec.days || 30), 1), 3650);
      candidates = accounts.filter((p) => p.lastActivity && now - p.lastActivity <= days * 86_400_000).map((p) => p.email);
      break;
    }
    case "never_started":
      candidates = accounts.filter((p) => !p.active).map((p) => p.email);
      break;
    case "completed": {
      const min = Math.max(Math.round(spec.min || 1), 1);
      candidates = accounts.filter((p) => p.completed >= min).map((p) => p.email);
      break;
    }
    case "custom": {
      const c = parseCustom(spec.emails || "");
      candidates = c.valid;
      invalid = c.invalid;
      break;
    }
  }
  const seen = new Set<string>();
  let duplicates = 0;
  let unsubscribed = 0;
  let suppressed = 0;
  let alreadyQueued = 0;
  let alreadyGotStory = 0;
  const recipients: Recipient[] = [];
  for (const e of candidates) {
    if (seen.has(e)) {
      duplicates++;
      continue;
    }
    seen.add(e);
    if (b.unsubscribed.has(e)) {
      unsubscribed++;
      continue;
    }
    if (b.suppressed.has(e)) {
      suppressed++;
      continue;
    }
    if (opts.exclude?.has(e)) {
      alreadyQueued++;
      continue;
    }
    if (opts.storyExclude?.has(e)) {
      alreadyGotStory++;
      continue;
    }
    const p = b.people.get(e);
    recipients.push({ email: e, name: p?.name || null, userId: p?.userId || null });
  }
  recipients.sort((x, y) => x.email.localeCompare(y.email));
  return { recipients, count: { eligible: recipients.length, unsubscribed, suppressed, invalid, duplicates, alreadyQueued, alreadyGotStory, sample: recipients.slice(0, 6).map((r) => r.email) } };
}

/** Counts for every preset at once (the picker shows them side by side). */
export async function presetCounts(): Promise<Record<"all" | "learners" | "subscribers" | "subscribers_learners" | "never_started", number>> {
  const [all, learners, subscribers, never, both] = await Promise.all((["all", "learners", "subscribers", "never_started", "subscribers_learners"] as const).map((kind) => resolveAudience({ kind })));
  return { all: all.count.eligible, learners: learners.count.eligible, subscribers: subscribers.count.eligible, subscribers_learners: both.count.eligible, never_started: never.count.eligible };
}

function varsFromBase(b: Base, email: string, fallbackName?: string | null): MergeVars {
  const p = b.people.get(lc(email));
  const name = (p?.name || fallbackName || "").trim();
  let current = "";
  let resume = `${SITE}/learn`;
  if (p?.current) {
    const t = b.titles.get(`${p.current.week}/${p.current.slug}`);
    current = t?.title || p.current.slug.replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    resume = `${SITE}${t?.href || `/learn/${p.current.course}/${p.current.week}/${p.current.slug}`}`;
  }
  return {
    first_name: firstNameOf(name),
    name,
    email: lc(email),
    streak: String(p?.streak || 0),
    lessons_completed: String(p?.completed || 0),
    current_lesson: current,
    resume_url: resume,
    site_url: SITE,
    unsubscribe_url: "",
  };
}

/** Merge data for a batch (fresh within 60 s). `unsubscribe_url` is filled in by the sender. */
export async function mergeVarsFor(list: { email: string; name?: string | null }[]): Promise<Map<string, MergeVars>> {
  const b = await base();
  return new Map(list.map((r) => [lc(r.email), varsFromBase(b, r.email, r.name)]));
}

/** "Preview as": search accounts + subscribers by email or name. */
export async function searchRecipients(q: string, limit = 8): Promise<RecipientPreview[]> {
  const b = await base();
  const term = lc(q);
  const out: RecipientPreview[] = [];
  const push = (email: string, source: RecipientPreview["source"]) => {
    const p = b.people.get(email);
    out.push({ email, name: p?.name || null, userId: p?.userId || null, vars: varsFromBase(b, email), source });
  };
  if (EMAIL_RE.test(term) && !b.people.has(term) && !b.subscribers.has(term)) {
    push(term, "custom");
    return out;
  }
  const people = [...b.people.values()].sort((x, y) => y.lastActivity - x.lastActivity);
  for (const p of people) {
    if (out.length >= limit) break;
    if (!term || p.email.includes(term) || (p.name || "").toLowerCase().includes(term)) push(p.email, "account");
  }
  for (const e of b.subscribers) {
    if (out.length >= limit) break;
    if (!b.people.has(e) && (!term || e.includes(term))) push(e, "subscriber");
  }
  return out;
}
