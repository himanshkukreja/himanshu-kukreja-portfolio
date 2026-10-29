import "server-only";
/**
 * The course chat's search_course calls, from the chat's own log table (owned by the chat code, not this
 * file). Until that table exists this source reports "missing" and the radar runs on smart search alone.
 *
 * The contract (one row per search_course call the tutor made); if the chat's table differs, change the
 * names in CHAT_GAP_LOG, nothing else:
 *   time      created_at timestamptz, or day date                      (CHAT_GAP_LOG.time)
 *   query     the search_course query, raw or normalised (normalised here again)
 *   scope     'covered' | 'partial' | 'none'  (or a `gap` boolean: true = partial/none)
 *   top_ids   text[] of search-index doc ids it returned, best first (optional)
 *   user      user_hash text, or user_id uuid (hashed here; never shown)
 * Rows the chat marks off-topic may carry scope 'off_topic' and are counted apart.
 */
import { supabase } from "@/lib/supabase";
import { hashUser } from "@/lib/search/smart/querylog";
import { dayOf, normaliseQuery } from "../text";
import type { GapEvent, GapScope, GapSource } from "../types";
import { readPaged } from "./db";

export const CHAT_GAP_LOG = {
  table: process.env.CHAT_GAP_TABLE || "chat_search_log",
  /** the column a time window filters on */
  time: process.env.CHAT_GAP_TIME_COLUMN || "created_at",
};

type Row = Record<string, unknown>;

const pick = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
  return undefined;
};

/** One chat log row as a GapEvent (null when it has no usable query). Exported for the dev check. */
export function chatRowToEvent(r: Row): GapEvent | null {
  const q = normaliseQuery(String(pick(r, "query", "q", "search_query") ?? ""));
  if (q.length < 3) return null;
  const when = pick(r, "day", "created_at", "at");
  const day = when ? dayOf(String(when).length === 10 ? `${when}T00:00:00Z` : String(when)) : dayOf();
  const s = pick(r, "scope", "coverage");
  const gap = pick(r, "gap", "is_gap");
  const scope: GapScope | null =
    s === "covered" || s === "partial" || s === "none" || s === "off_topic" ? s : typeof gap === "boolean" ? (gap ? "partial" : "covered") : null;
  const ids = pick(r, "top_ids", "result_ids", "refs", "top");
  const top = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  const uh = pick(r, "user_hash");
  const uid = pick(r, "user_id");
  const user = typeof uh === "string" && uh ? uh : typeof uid === "string" && uid ? hashUser(uid) : null;
  return { source: "chat", day, q, user, scope, top };
}

/**
 * The chat logs each turn's search_course calls in its metering row: ai_calls (feature "course-chat"),
 * meta.searches = [{ q, gap, n }] (lib/ai/chat/tools.ts; cleared after 90 days by the cleanup cron).
 * One event per search; user ids are hashed here and never shown.
 */
export const chatSource: GapSource = {
  id: "chat",
  label: "Course chat (search_course)",
  async load(since) {
    const r = await readPaged<Row>((from, to) =>
      supabase
        .from("ai_calls")
        .select("user_id, created_at, meta")
        .eq("feature", "course-chat")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    if (r.missing) return { status: "missing", events: [], note: "ai_calls isn't readable" };
    const events: GapEvent[] = [];
    for (const row of r.rows) {
      const searches = (row.meta as { searches?: unknown } | null)?.searches;
      if (!Array.isArray(searches)) continue;
      for (const s of searches) {
        if (!s || typeof s !== "object") continue;
        const e = chatRowToEvent({ query: (s as Row).q, gap: (s as Row).gap, user_id: row.user_id, created_at: row.created_at });
        if (e) events.push(e);
      }
    }
    return { status: r.error ? "error" : "ok", events, note: r.error };
  },
};
