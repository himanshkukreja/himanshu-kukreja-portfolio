import "server-only";
/**
 * Smart-search asks, from two places:
 *   searchLogSource   `search_queries` (20261029_search_queries.sql): normalised text, scope, cited ids, day,
 *                     hashed user. The real source once the migration is applied.
 *   transcriptSource  `ai_transcripts` rows of feature "smart-search" (kept 30 days): the query and the model's
 *                     JSON, which carries the scope. Cited ids there are per-call ("c3"), so `top` stays empty
 *                     and the report finds the closest material itself. Only read for days the log doesn't
 *                     cover yet, so nothing is counted twice. The raw text never leaves this file: it is
 *                     normalised here and the user id is hashed here.
 */
import { supabase } from "@/lib/supabase";
import { hashUser, SEARCH_LOG_TABLE } from "@/lib/search/smart/querylog";
import { dayOf, normaliseQuery } from "../text";
import type { GapEvent, GapScope, GapSource } from "../types";
import { readPaged } from "./db";

type LogRow = { day: string; q: string; scope: string; top_ids: string[] | null; user_hash: string };

const scopeOf = (s: unknown): GapScope | null => (s === "covered" || s === "partial" || s === "none" || s === "off_topic" ? s : null);

export const searchLogSource: GapSource = {
  id: "smart-search-log",
  label: "Smart search log",
  async load(since) {
    const r = await readPaged<LogRow>((from, to) =>
      supabase.from(SEARCH_LOG_TABLE).select("day, q, scope, top_ids, user_hash").gte("day", dayOf(since)).order("day", { ascending: false }).range(from, to),
    );
    if (r.missing) return { status: "missing", events: [], note: "search_queries isn't applied yet" };
    const events: GapEvent[] = r.rows.map((x) => ({ source: "smart-search", day: String(x.day).slice(0, 10), q: x.q, user: x.user_hash || null, scope: scopeOf(x.scope), top: (x.top_ids ?? []).slice(0, 5) }));
    return { status: r.error ? "error" : "ok", events, note: r.error };
  },
};

type TxRow = { input: string | null; output: string | null; user_id: string | null; created_at: string };

/** the scope the model wrote ("partial" / "off_topic"; anything else is covered, as parseSmartAnswer reads it) */
function txScope(output: string | null): GapScope | null {
  if (!output) return null;
  const m = output.match(/"scope"\s*:\s*"([a-z_]+)"/);
  if (!m) return null;
  return m[1] === "partial" || m[1] === "off_topic" ? m[1] : "covered";
}

/** `before`: only days before this one (where the query log has no rows yet) */
export function transcriptSource(before: string | null): GapSource {
  return {
    id: "smart-search-transcripts",
    label: "Smart search transcripts (30 days)",
    async load(since) {
      // a fresh builder per page (a builder's filters accumulate)
      const page = (from: number, to: number) => {
        let query = supabase.from("ai_transcripts").select("input, output, user_id, created_at").eq("feature", "smart-search").gte("created_at", since.toISOString());
        if (before) query = query.lt("created_at", `${before}T00:00:00Z`);
        return query.order("created_at", { ascending: false }).range(from, to);
      };
      const r = await readPaged<TxRow>(page, 10_000);
      if (r.missing) return { status: "missing", events: [] };
      // one ask per (day, learner, query), like the log
      const seen = new Set<string>();
      const events: GapEvent[] = [];
      for (const x of r.rows) {
        const q = normaliseQuery(x.input ?? "");
        if (q.length < 3) continue;
        const day = dayOf(x.created_at);
        const user = x.user_id ? hashUser(x.user_id) : null;
        const k = `${day}|${user}|${q}`;
        if (seen.has(k)) continue;
        seen.add(k);
        events.push({ source: "smart-search", day, q, user, scope: txScope(x.output), top: [] });
      }
      return { status: r.error ? "error" : "ok", events, note: before ? `days before ${before} only (the log covers the rest)` : r.error };
    },
  };
}
