import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { excludedUserIds, externalOnly } from "@/lib/admin/aiCalls";
import { FEEDBACK_FEATURES, reasonOf } from "@/lib/ai/feedback-model";
import { answerExcerpt, qualityStats, type CallRow, type FeedbackRow } from "@/lib/admin/aiQuality-model";

export const dynamic = "force-dynamic";

/** Where the nightly eval workflow keeps its pass rates (.github/workflows/ai-evals-nightly.yml): a branch of this
 *  public repo that never deploys. */
const NIGHTLY_URL = process.env.AI_EVALS_HISTORY_URL || "https://raw.githubusercontent.com/himanshkukreja/himanshu-kukreja-portfolio/ai-evals/scripts/ai-eval/nightly/history.json";
let nightlyCache: { at: number; data: unknown } | null = null;
async function nightly(): Promise<unknown> {
  if (nightlyCache && Date.now() - nightlyCache.at < 10 * 60_000) return nightlyCache.data;
  const data = await fetch(NIGHTLY_URL, { signal: AbortSignal.timeout(4000), cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  nightlyCache = { at: Date.now(), data };
  return data;
}

const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (["42703", "PGRST204"].includes(e.code || "") || /column .* does not exist|could not find/i.test(e.message || ""));

/**
 * GET /api/admin/ai/quality?days=14[&ext=1] → the AI quality dashboard (/admin/ai/quality): per feature and per day, the
 * thumbs-up rate, the down reasons, errors, p50/p90 latency and cost (ai_calls), the citation check's unsupported rate and
 * the turns the routing sent to Sonnet; the latest downs (feature, reason, model, prompt version and an excerpt of the AI's
 * answer, never the learner's message); and the nightly evals' pass rates. Counts and aggregates only for learner data:
 * no learner ids or emails leave the route. `ext=1`: the admins' own calls and ratings left out.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(p.get("days")) || 14));
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  let exclude: Set<string>;
  try {
    exclude = new Set(await excludedUserIds(externalOnly(p)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }

  // the metering rows of the rateable features in the window
  const calls: CallRow[] = [];
  let partial = false;
  for (let from = 0; ; from += 1000) {
    if (from >= 50_000) {
      partial = true;
      break;
    }
    const { data, error } = await supabase
      .from("ai_calls")
      .select("id, created_at, user_id, feature, model, status, cost_usd, latency_ms, cites:meta->cites, routed:meta->>routed")
      .in("feature", [...FEEDBACK_FEATURES])
      .gte("created_at", since.toISOString())
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data ?? []) as (CallRow & { user_id: string | null })[]) if (!r.user_id || !exclude.has(r.user_id)) calls.push(r);
    if ((data ?? []).length < 1000) break;
  }

  // the ratings in the window (the 12 Nov 2026 columns when the migration is applied; the interim reason code otherwise)
  type Fb = FeedbackRow & { user_id: string; model?: string | null; prompt_hash?: string | null };
  let fb: Fb[] = [];
  let migrated = true;
  let enabled = true;
  const read = async (cols: string) => {
    const out: Fb[] = [];
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error } = await supabase.from("chat_feedback").select(cols).gte("created_at", since.toISOString()).order("id", { ascending: true }).range(from, from + 999);
      if (error) return { rows: out, error };
      out.push(...((data ?? []) as unknown as Fb[]));
      if ((data ?? []).length < 1000) break;
    }
    return { rows: out, error: null };
  };
  let r = await read("call_id, user_id, created_at, rating, wrong, note, reason, feature, model, prompt_hash");
  if (isMissingColumn(r.error)) {
    migrated = false;
    r = await read("call_id, user_id, created_at, rating, wrong, note");
  }
  if (r.error) enabled = false;
  else fb = r.rows.filter((x) => !exclude.has(x.user_id));

  const stats = qualityStats(calls, fb, since);

  // the latest downs: what the AI said (its own answer, from the transcript kept 30/90 days), never the learner's message
  const byCall = new Map(calls.map((c) => [c.id, c]));
  const downs = fb
    .filter((x) => x.rating === -1)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 25);
  const missing = downs.filter((d) => !byCall.has(d.call_id)).map((d) => d.call_id);
  if (missing.length) {
    const { data } = await supabase.from("ai_calls").select("id, created_at, feature, model, status, cost_usd, latency_ms").in("id", missing);
    for (const c of (data ?? []) as CallRow[]) byCall.set(c.id, c);
  }
  const pvs = new Map<number, string | null>();
  if (downs.length) {
    const { data } = await supabase.from("ai_calls").select("id, pv:meta->>pv").in("id", downs.map((d) => d.call_id));
    for (const x of (data ?? []) as { id: number; pv: string | null }[]) pvs.set(x.id, x.pv);
  }
  const tr = downs.length ? await supabase.from("ai_transcripts").select("call_id, output").in("call_id", downs.map((d) => d.call_id)) : { data: [] };
  const outOf = new Map(((tr.data ?? []) as { call_id: number; output: string | null }[]).map((t) => [t.call_id, t.output]));
  const recentDowns = downs.map((d) => ({
    callId: d.call_id,
    at: d.created_at,
    feature: d.feature || byCall.get(d.call_id)?.feature || "unknown",
    model: d.model || byCall.get(d.call_id)?.model || null,
    pv: d.prompt_hash || pvs.get(d.call_id) || null,
    reason: reasonOf(d),
    excerpt: outOf.has(d.call_id) ? answerExcerpt(outOf.get(d.call_id)) : null,
  }));

  return NextResponse.json(
    { window: days, since: since.toISOString(), feedback: { enabled, migrated }, partial, total: stats.total, daily: stats.days, features: stats.features, recentDowns, nightly: await nightly() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
