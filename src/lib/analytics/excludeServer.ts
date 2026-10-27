import "server-only";
/**
 * Server half of lib/analytics/exclude.ts: the test accounts' user ids and every browser (visitor id) they
 * used, so admin views can drop their rows, including signed-out visits from the same browser. Cached 10 min.
 */
import { supabase } from "@/lib/supabase";
import { isExcludedEmail } from "./exclude";

type Ids = { users: Set<string>; visitors: Set<string> };
let cache: { at: number; p: Promise<Ids> } | null = null;

async function load(): Promise<Ids> {
  const users = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) if (isExcludedEmail(u.email)) users.add(u.id);
    if (data.users.length < 1000) break;
  }
  const visitors = new Set<string>();
  if (users.size) {
    const { data } = await supabase.from("analytics_events").select("visitor_id").in("user_id", [...users]).not("visitor_id", "is", null).limit(20000);
    for (const r of (data || []) as { visitor_id: string | null }[]) if (r.visitor_id) visitors.add(r.visitor_id);
  }
  return { users, visitors };
}

export function excludedIds(): Promise<Ids> {
  const now = Date.now();
  if (!cache || now - cache.at > 10 * 60_000) cache = { at: now, p: load().catch(() => ({ users: new Set<string>(), visitors: new Set<string>() })) };
  return cache.p;
}

type Row = { user_id?: string | null; visitor_id?: string | null; metadata?: Record<string, unknown> | null };

/** Rows from analytics_events minus internal traffic (test accounts, their browsers, localhost/dev). */
export async function dropInternal<T extends Row>(rows: T[]): Promise<T[]> {
  const { users, visitors } = await excludedIds();
  return rows.filter((r) => !(r.user_id && users.has(r.user_id)) && !(r.visitor_id && visitors.has(r.visitor_id)) && !(r.metadata && (r.metadata as { dev?: unknown }).dev));
}
