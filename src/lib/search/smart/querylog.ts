import "server-only";
/**
 * The smart-search query log behind the content-gap radar (/admin/gaps). One row per (day, learner,
 * normalised query) in `search_queries` (supabase/migrations/20261029_search_queries.sql): the normalised
 * text, the scope the answer came back with, the ids it cited, the UTC day and a keyed hash of the learner's
 * id. Never the raw query, an email, an IP or a timestamp. Off-topic asks are not logged.
 *
 * Fire and forget (the caller runs it in `after()`): a failure never touches the search. Until the migration
 * is applied the insert fails with "missing table"; that is remembered for 10 minutes so the route doesn't
 * keep paying for a doomed round trip.
 */
import { createHmac } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { dayOf, normaliseQuery } from "@/lib/admin/gaps/text";

export const SEARCH_LOG_TABLE = "search_queries";
export type LoggedScope = "covered" | "partial" | "none";

const SECRET = () => process.env.SEARCH_LOG_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "hk-search-log";

/** A stable, non-reversible key for a learner (HMAC-SHA256 with a server secret, 24 hex chars). */
export const hashUser = (userId: string): string => createHmac("sha256", SECRET()).update(`user:${userId}`).digest("hex").slice(0, 24);

type PgError = { code?: string; message?: string; details?: string | null } | null;
export function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

let missingUntil = 0;

export async function logSearchQuery(e: { userId: string | null | undefined; q: string; scope: LoggedScope | "off_topic"; top?: string[] }): Promise<void> {
  if (!e.userId || e.scope === "off_topic" || Date.now() < missingUntil) return;
  const q = normaliseQuery(e.q);
  if (q.length < 3) return;
  const row = {
    day: dayOf(),
    source: "smart-search",
    q,
    scope: e.scope,
    top_ids: [...new Set((e.top ?? []).filter((x) => typeof x === "string" && x.length > 0 && x.length <= 200))].slice(0, 5),
    user_hash: hashUser(e.userId),
  };
  try {
    const { error } = await supabase.from(SEARCH_LOG_TABLE).upsert(row, { onConflict: "day,user_hash,source,q", ignoreDuplicates: true });
    if (!error) return;
    if (isMissingTable(error)) missingUntil = Date.now() + 10 * 60_000;
    else console.error("[search-log]", error.message);
  } catch (err) {
    console.error("[search-log]", err instanceof Error ? err.message : err);
  }
}
