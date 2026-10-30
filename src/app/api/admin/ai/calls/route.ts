import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { callsQuery, emailsFor, readCallQuery } from "@/lib/admin/aiCalls";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/calls?range=30d&sort=new&feature=&user=&status=&content=1&page=1 → one page (50) of the AI call
 * log, filtered and sorted in the database (lib/admin/aiCalls.ts), with each learner's email.
 * range: 24h | 7d | 30d (default) | 90d | 12m, or days=N (a page's own window). sort: new (default) or
 * cost|credits|in|out . asc|desc. user: a learner's id. content=1 adds the content jobs (eval, batch), left out by
 * default. scope=chat: the course chat's calls only (/admin/chat); learner=<id>: one learner's (their admin page).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const q = readCallQuery(new URL(request.url).searchParams);
  const { data, error, count } = await callsQuery(q);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emails = await emailsFor((data ?? []).map((r) => r.user_id as string | null).filter((id): id is string => !!id));
  const rows = (data ?? []).map((r) => ({ ...r, email: r.user_id ? emails.get(r.user_id as string) ?? null : null }));
  return NextResponse.json({ rows, total: count ?? 0, page: q.page }, { headers: { "Cache-Control": "no-store" } });
}
