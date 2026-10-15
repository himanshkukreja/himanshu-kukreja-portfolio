/**
 * Who gets a learn announcement. Server-only (service-role Supabase). Read-only: nothing here writes.
 *
 *   learners = auth users with an email AND any learn activity (progress, streaks, quick-check/trial
 *              answers, notes, bookmarks, arena results, or a signed-in /learn page view)
 *   all      = every auth user with an email
 *
 * Both exclude anyone unsubscribed in newsletter_subscribers (the same switch the newsletter honours)
 * and anyone this campaign already reached (newsletter_logs, type "announce", status sent/sending).
 */
import { supabase } from "@/lib/supabase";
import { ANNOUNCE_KEY } from "./learn-revamp";

export type Audience = "learners" | "all";
export type Recipient = { email: string; name: string | null; userId: string };

const PAGE = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthUser = { id: string; email?: string | null; banned_until?: string | null; user_metadata?: Record<string, unknown> | null };

async function allAuthUsers(): Promise<AuthUser[]> {
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

/** user_id column of a table, paged. Missing table / column → empty set (fail soft). */
async function userIdsFrom(table: string, like?: { column: string; pattern: string }): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; from < 2_000_000; from += PAGE) {
    let q = supabase.from(table).select("user_id").not("user_id", "is", null);
    if (like) q = q.like(like.column, like.pattern);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return ids;
    for (const r of (data || []) as { user_id: string | null }[]) if (r.user_id) ids.add(r.user_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

export async function learnActiveUserIds(): Promise<Set<string>> {
  const sets = await Promise.all([
    userIdsFrom("learning_progress"),
    userIdsFrom("learning_streaks"),
    userIdsFrom("mcq_user_answers"),
    userIdsFrom("content_notes"),
    userIdsFrom("bookmarks"),
    userIdsFrom("quiz_answers"),
    userIdsFrom("daily_results"),
    userIdsFrom("analytics_events", { column: "page_path", pattern: "/learn%" }),
  ]);
  const all = new Set<string>();
  for (const s of sets) s.forEach((id) => all.add(id));
  return all;
}

async function unsubscribedEmails(): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase.from("newsletter_subscribers").select("email").eq("unsubscribed", true);
  if (error) throw new Error(`newsletter_subscribers read failed: ${error.message}`);
  for (const r of data || []) if (r.email) out.add(String(r.email).toLowerCase().trim());
  return out;
}

/** Emails this campaign already sent to (or is sending to right now). */
export async function alreadyReached(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; from < 1_000_000; from += PAGE) {
    const { data, error } = await supabase
      .from("newsletter_logs")
      .select("email")
      .eq("type", "announce")
      .in("status", ["sent", "sending"])
      .filter("story_slugs", "cs", JSON.stringify([ANNOUNCE_KEY])) // jsonb containment
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`newsletter_logs read failed: ${error.message}`);
    for (const r of data || []) out.add(String(r.email).toLowerCase().trim());
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function profileNames(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; from < 1_000_000; from += PAGE) {
    const { data, error } = await supabase.from("user_profiles").select("id, full_name").not("full_name", "is", null).range(from, from + PAGE - 1);
    if (error) return out;
    for (const r of (data || []) as { id: string; full_name: string | null }[]) if (r.full_name) out.set(r.id, r.full_name);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export type AudienceReport = {
  /** eligible now (after unsubscribes and already-sent are removed) */
  learners: Recipient[];
  all: Recipient[];
  totals: { authUsers: number; withEmail: number; learnActive: number; unsubscribed: number; alreadySent: number };
};

export async function buildAudience(): Promise<AudienceReport> {
  const [users, active, unsub, reached, names] = await Promise.all([allAuthUsers(), learnActiveUserIds(), unsubscribedEmails(), alreadyReached(), profileNames()]);
  const now = Date.now();
  const seen = new Set<string>();
  const withEmail: (Recipient & { active: boolean })[] = [];
  for (const u of users) {
    const email = (u.email || "").toLowerCase().trim();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    if (u.banned_until && new Date(u.banned_until).getTime() > now) continue;
    seen.add(email);
    const meta = u.user_metadata || {};
    const metaName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
    withEmail.push({ email, userId: u.id, name: names.get(u.id) || metaName, active: active.has(u.id) });
  }
  const eligible = withEmail.filter((r) => !unsub.has(r.email) && !reached.has(r.email));
  const strip = ({ email, name, userId }: Recipient) => ({ email, name, userId });
  return {
    learners: eligible.filter((r) => r.active).map(strip),
    all: eligible.map(strip),
    totals: {
      authUsers: users.length,
      withEmail: withEmail.length,
      learnActive: withEmail.filter((r) => r.active).length,
      unsubscribed: withEmail.filter((r) => unsub.has(r.email)).length,
      alreadySent: withEmail.filter((r) => reached.has(r.email)).length,
    },
  };
}
