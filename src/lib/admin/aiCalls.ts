import "server-only";
/**
 * The admin's one query helper for ai_calls logs (/admin/ai's call log, /admin/chat's message log and the chat
 * conversations, a learner's AI calls): the date window, filters (feature, status, learner, content jobs) and the
 * sort (newest, cost, credits, input or output tokens) all applied in the database, 50 rows a page; plus the
 * filters' choices (facets): the features that appear in the window and the learners who used the picked feature.
 *
 * A surface narrows every query with its scope: the chat's features only (`scope=chat`), or one learner
 * (`learner=<id>`). Emails come from the auth admin API by user id (as the log always did), through a short cache
 * so the 30 s refresh and the dropdowns don't ask again for the same accounts.
 */
import { supabase } from "@/lib/supabase";
import { CHAT_FEATURES } from "@/lib/ai/chat/quota";
import { CONTENT_FEATURES, FEATURES, type FeatureId } from "@/lib/ai/features";

export const PAGE_SIZE = 50;
const DAY = 86_400_000;

/** The windows: the RangePicker values (`range`, default 30d) or a page's own `days` (1-365). */
export const CALL_WINDOWS = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY, "12m": 365 * DAY } as const;
export type CallWindow = { key: string; ms: number };
export function windowOf(p: URLSearchParams): CallWindow {
  const days = Math.floor(Number(p.get("days")));
  if (days >= 1 && days <= 365) return { key: `${days}d`, ms: days * DAY };
  const r = p.get("range") || "30d";
  return r in CALL_WINDOWS ? { key: r, ms: CALL_WINDOWS[r as keyof typeof CALL_WINDOWS] } : { key: "30d", ms: CALL_WINDOWS["30d"] };
}
export const windowStart = (w: CallWindow) => new Date(Date.now() - w.ms).toISOString();

/** Sorts: "new" (newest first, the default) or `<column>.<asc|desc>`. */
const SORT_COLUMNS = { cost: "cost_usd", credits: "credits", in: "input_tokens", out: "output_tokens" } as const;
export type CallSort = "new" | `${keyof typeof SORT_COLUMNS}.${"asc" | "desc"}`;
export const sortOf = (v: string | null): CallSort => (/^(cost|credits|in|out)\.(asc|desc)$/.test(v || "") ? (v as CallSort) : "new");

export const isChatFeature = (f: string | null | undefined) => !!f && (CHAT_FEATURES as readonly string[]).includes(f);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const userOf = (v: string | null) => (v && UUID.test(v) ? v : null);

/** What a surface may see: the chat's features only, or one learner's calls. */
export type CallScope = { features: readonly FeatureId[] | null; learner: string | null };
export const scopeOf = (p: URLSearchParams): CallScope => ({ features: p.get("scope") === "chat" ? CHAT_FEATURES : null, learner: userOf(p.get("learner")) });

export type CallQuery = { scope: CallScope; window: CallWindow; sort: CallSort; feature: FeatureId | null; status: string | null; user: string | null; content: boolean; page: number };

export function readCallQuery(p: URLSearchParams): CallQuery {
  const scope = scopeOf(p);
  const f = p.get("feature");
  // content jobs (eval, batch: features.ts CONTENT_FEATURES, the same split as ai_spend_v2) are left out unless asked for
  const content = p.get("content") === "1";
  const feature = f && f in FEATURES && (!scope.features || scope.features.includes(f as FeatureId)) && (content || !CONTENT_FEATURES.includes(f as FeatureId)) ? (f as FeatureId) : null;
  return {
    scope,
    window: windowOf(p),
    sort: sortOf(p.get("sort")),
    feature,
    status: /^[a-z_]{2,20}$/.test(p.get("status") || "") ? p.get("status") : null,
    // a learner's page has its learner fixed
    user: scope.learner ?? userOf(p.get("user")),
    content,
    page: Math.min(10_000, Math.max(1, Math.floor(Number(p.get("page"))) || 1)),
  };
}

const CALL_COLUMNS = "id, created_at, user_id, feature, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, credits, latency_ms, status, error, request_id, meta, byok";
const CHAT_LIST = `(${CHAT_FEATURES.join(",")})`;
const CONTENT_LIST = `(${CONTENT_FEATURES.join(",")})`;

/** The window, the scope and the content-jobs switch every log query shares. Live rows without a learner (a guest's
 *  smart search, a test script's lesson question) stay in: only content-job features are left out. */
type Chain = { gte(c: string, v: string): Chain; in(c: string, v: readonly string[]): Chain; eq(c: string, v: string): Chain; not(c: string, op: string, v: string): Chain };
function base<T>(x: T, q: Pick<CallQuery, "scope" | "window" | "content">): T {
  // (a small structural view of the query builder: its own generic types are too deep to thread through here)
  let y = (x as unknown as Chain).gte("created_at", windowStart(q.window));
  if (q.scope.features) y = y.in("feature", q.scope.features);
  if (q.scope.learner) y = y.eq("user_id", q.scope.learner);
  if (!q.content && !q.scope.features) y = y.not("feature", "in", CONTENT_LIST);
  return y as unknown as T;
}

/** One page of the log, every filter and the sort in the database (exported so a test can read its URL). */
export function callsQuery(q: CallQuery) {
  let x = base(supabase.from("ai_calls").select(CALL_COLUMNS, { count: "exact" }), q);
  if (q.feature) x = x.eq("feature", q.feature);
  if (q.status) x = x.eq("status", q.status);
  if (q.user && !q.scope.learner) x = x.eq("user_id", q.user);
  if (q.sort === "new") x = x.order("created_at", { ascending: false });
  else {
    const [col, dir] = q.sort.split(".") as [keyof typeof SORT_COLUMNS, "asc" | "desc"];
    // course-chat, chat-memory and chat-title don't spend the learner's credits (the chat's own quota): a credits
    // sort lists the calls that do (older chat rows still carry a credits number from before 30 Oct 2026)
    if (col === "credits" && !isChatFeature(q.feature)) x = x.not("feature", "in", CHAT_LIST);
    x = x.order(SORT_COLUMNS[col], { ascending: dir === "asc" }).order("created_at", { ascending: false });
  }
  // ties (same cost, same second) keep a stable order across pages
  return x.order("id", { ascending: false }).range((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE - 1);
}

/* ─────────────────────────────── emails ─────────────────────────────── */

const EMAIL_TTL = 10 * 60_000;
const emailCache = new Map<string, { email: string | null; at: number }>();

/** id → email for these accounts (auth admin API, as the call log always did), cached 10 minutes. */
export async function emailsFor(ids: string[]): Promise<Map<string, string | null>> {
  const now = Date.now();
  const out = new Map<string, string | null>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = emailCache.get(id);
    if (hit && now - hit.at < EMAIL_TTL) out.set(id, hit.email);
    else missing.push(id);
  }
  // a few at a time: a long dropdown list shouldn't fire hundreds of auth requests at once
  for (let i = 0; i < missing.length; i += 20) {
    await Promise.all(
      missing.slice(i, i + 20).map(async (id) => {
        const { data } = await supabase.auth.admin.getUserById(id).catch(() => ({ data: null }));
        const email = data?.user?.email ?? null;
        emailCache.set(id, { email, at: now });
        out.set(id, email);
      }),
    );
  }
  if (emailCache.size > 5000) for (const [k, v] of emailCache) if (now - v.at >= EMAIL_TTL) emailCache.delete(k);
  return out;
}

/* ─────────────────────────────── facets ─────────────────────────────── */

export type CallFacets = {
  features: { id: string; label: string; calls: number }[];
  /** empty on a learner's page (the learner is fixed) */
  users: { id: string; email: string | null; calls: number }[];
  /** the window had more rows than were read for the learner list (it may miss a few rare users) */
  usersPartial: boolean;
  /** what the content-jobs switch is hiding in the window (null: shown, or a scope without content jobs) */
  contentHidden: { calls: number; cost: number } | null;
};

const FACET_TTL = 60_000;
const FACET_PAGE = 1000;
const FACET_MAX_ROWS = 40_000;
const facetCache = new Map<string, { at: number; v: CallFacets }>();

/** Calls per feature in the window: one indexed count per feature (ai_calls_feature_idx), all at once. */
async function featureCounts(q: CallQuery) {
  const ids = ((q.scope.features ?? (Object.keys(FEATURES) as FeatureId[])) as FeatureId[]).filter((id) => q.content || !CONTENT_FEATURES.includes(id));
  const counts = await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await base(supabase.from("ai_calls").select("id", { count: "exact", head: true }), q).eq("feature", id);
      if (error) throw new Error(error.message);
      return { id, label: FEATURES[id].label, calls: count ?? 0 };
    }),
  );
  return counts.filter((c) => c.calls > 0).sort((a, b) => b.calls - a.calls);
}

/** The learners with calls in the window (for one feature, or any): their user ids read in pages, counted here. */
export async function userCounts(q: Pick<CallQuery, "scope" | "window" | "content">, feature: string | null) {
  const page = (i: number) => {
    let x = base(supabase.from("ai_calls").select("user_id", i === 0 ? { count: "exact" } : undefined), q).not("user_id", "is", null);
    if (feature) x = x.eq("feature", feature);
    return x.order("id", { ascending: false }).range(i * FACET_PAGE, (i + 1) * FACET_PAGE - 1);
  };
  const first = await page(0);
  if (first.error) throw new Error(first.error.message);
  const total = first.count ?? 0;
  const pages = Math.min(Math.ceil(total / FACET_PAGE), FACET_MAX_ROWS / FACET_PAGE);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 1)));
  const n = new Map<string, number>();
  for (const r of [first, ...rest]) {
    if (r.error) throw new Error(r.error.message);
    for (const row of (r.data ?? []) as { user_id: string }[]) n.set(row.user_id, (n.get(row.user_id) ?? 0) + 1);
  }
  return { counts: n, partial: total > FACET_MAX_ROWS };
}

/** id → calls as a list with emails, sorted by email (accounts without one last). */
export async function withEmails(counts: Map<string, number>) {
  const emails = await emailsFor([...counts.keys()]);
  return [...counts.entries()].map(([id, calls]) => ({ id, email: emails.get(id) ?? null, calls })).sort((a, b) => (a.email || `~${a.id}`).localeCompare(b.email || `~${b.id}`));
}

/** The content jobs in the window (what the switch hides): their calls, and their spend as the budget counts it. */
export async function contentInWindow(w: CallWindow): Promise<{ calls: number; cost: number }> {
  const from = windowStart(w);
  const [n, spend] = await Promise.all([
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).in("feature", CONTENT_FEATURES).gte("created_at", from),
    // ai_spend_v2 with p_live false: exactly the content jobs' spend (same split as the governor's)
    supabase.rpc("ai_spend_v2", { p_from: from, p_live: false, p_user: null }),
  ]);
  return { calls: n.count ?? 0, cost: Number((spend.data as { cost?: number }[] | null)?.[0]?.cost ?? 0) };
}

export async function callFacets(q: CallQuery): Promise<CallFacets> {
  const key = [q.scope.features ? "chat" : "", q.scope.learner ?? "", q.window.key, q.feature ?? "", q.content ? 1 : 0].join("|");
  const hit = facetCache.get(key);
  if (hit && Date.now() - hit.at < FACET_TTL) return hit.v;
  const hides = !q.content && !q.scope.features && !q.scope.learner;
  const [features, users, hidden] = await Promise.all([featureCounts(q), q.scope.learner ? null : userCounts(q, q.feature), hides ? contentInWindow(q.window) : null]);
  const v: CallFacets = { features, users: users ? await withEmails(users.counts) : [], usersPartial: !!users?.partial, contentHidden: hidden };
  facetCache.set(key, { at: Date.now(), v });
  if (facetCache.size > 200) facetCache.clear();
  return v;
}
