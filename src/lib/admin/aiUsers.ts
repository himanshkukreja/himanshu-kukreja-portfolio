import "server-only";
/**
 * /admin/ai's "Who spends what (this cycle)": each learner's AI use in the credit cycle, filtered by feature and
 * learner and sorted (most recent, cost, credits, tokens) here on the server, 25 a page. The cycle's learner rows
 * (five small columns) are read once and kept 30 seconds. Credits leave out the course chat's calls (its own
 * message quota, never the learner's credits); cost counts everything, as the budget does.
 */
import { supabase } from "@/lib/supabase";
import { FEATURES } from "@/lib/ai/features";
import { emailsFor, isChatFeature, userOf, withEmails } from "./aiCalls";

export const USERS_PAGE = 25;
export const USER_SORTS = ["new", "cost.desc", "cost.asc", "credits.desc", "credits.asc", "tokens.desc", "tokens.asc"] as const;

type Row = { user_id: string; feature: string; status: string; cost_usd: number | null; credits: number | null; input_tokens: number | null; output_tokens: number | null; created_at: string };
export type UserSpend = { user_id: string; email: string | null; calls: number; refused: number; cost: number; credits: number; tokens: number; today: number; last_at: string; blocked: boolean };

const cache = new Map<string, { at: number; rows: Row[] }>();

async function cycleRows(from: string): Promise<Row[]> {
  const hit = cache.get(from);
  if (hit && Date.now() - hit.at < 30_000) return hit.rows;
  const rows: Row[] = [];
  for (let at = 0; at < 100_000; at += 1000) {
    const { data, error } = await supabase
      .from("ai_calls")
      .select("user_id, feature, status, cost_usd, credits, input_tokens, output_tokens, created_at")
      .gte("created_at", from)
      .not("user_id", "is", null)
      .order("id", { ascending: true })
      .range(at, at + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  cache.set(from, { at: Date.now(), rows });
  if (cache.size > 10) cache.clear();
  return rows;
}

export async function usersSpend(p: URLSearchParams, cycleStart: string, today: string) {
  const f = p.get("feature");
  const feature = f && f in FEATURES ? f : null;
  const user = userOf(p.get("user"));
  const sort = (USER_SORTS as readonly string[]).includes(p.get("sort") || "") ? (p.get("sort") as (typeof USER_SORTS)[number]) : "new";
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(p.get("page"))) || 1));
  const rows = await cycleRows(cycleStart);

  // the filters' choices: the features learners used this cycle, and who used the picked one
  const byFeature = new Map<string, number>();
  const forFeature = new Map<string, number>();
  for (const r of rows) {
    byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + 1);
    if (!feature || r.feature === feature) forFeature.set(r.user_id, (forFeature.get(r.user_id) ?? 0) + 1);
  }

  const by = new Map<string, UserSpend>();
  for (const r of rows) {
    if ((feature && r.feature !== feature) || (user && r.user_id !== user)) continue;
    const u = by.get(r.user_id) ?? { user_id: r.user_id, email: null, calls: 0, refused: 0, cost: 0, credits: 0, tokens: 0, today: 0, last_at: r.created_at, blocked: false };
    if (r.status === "ok") u.calls++;
    else u.refused++;
    const cost = Number(r.cost_usd) || 0;
    u.cost += cost;
    if (!isChatFeature(r.feature)) u.credits += Number(r.credits) || 0;
    u.tokens += (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0);
    if (r.created_at >= today) u.today += cost;
    if (r.created_at > u.last_at) u.last_at = r.created_at;
    by.set(r.user_id, u);
  }
  let list = [...by.values()];
  if (sort === "new") list.sort((a, b) => b.last_at.localeCompare(a.last_at));
  else {
    const [k, dir] = sort.split(".") as ["cost" | "credits" | "tokens", "asc" | "desc"];
    list = list.sort((a, b) => (a[k] - b[k]) * (dir === "asc" ? 1 : -1) || b.last_at.localeCompare(a.last_at));
  }
  const slice = list.slice((page - 1) * USERS_PAGE, page * USERS_PAGE);
  const ids = slice.map((u) => u.user_id);
  const [emails, blocks, users] = await Promise.all([
    emailsFor(ids),
    ids.length ? supabase.from("ai_blocks").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string }[] }),
    withEmails(forFeature),
  ]);
  const blocked = new Set(((blocks.data ?? []) as { user_id: string }[]).map((b) => b.user_id));
  return {
    rows: slice.map((u) => ({ ...u, email: emails.get(u.user_id) ?? null, blocked: blocked.has(u.user_id) })),
    total: list.length,
    page,
    pageSize: USERS_PAGE,
    features: [...byFeature.entries()].map(([id, calls]) => ({ id, label: FEATURES[id as keyof typeof FEATURES]?.label ?? id, calls })).sort((a, b) => b.calls - a.calls),
    users,
  };
}
