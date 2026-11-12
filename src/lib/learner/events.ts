import "server-only";
/**
 * The outcome log on the server (table learner_events, view learner_outcomes; the shape and rules are in
 * ./events-model.ts). Always by the verified user id, through the service role.
 *
 *   recordOutcome(request, userId, event)   after a route has graded something. Nothing is written when the request
 *                                           carries Global Privacy Control or the site's analytics opt-out
 *                                           (x-hk-notrack), or while the learner's memory is paused or unavailable:
 *                                           the same rules as the chat's memory notes (lib/ai/chat/capture.ts,
 *                                           memory.ts). Never throws; false when nothing was written.
 *   loadOutcomes(userId)                    the learner's recent outcomes, newest first (≤ 200, the last 120 days),
 *                                           kept 30 seconds per learner; a missing table reads as none.
 *   clearOutcomes(userId, course?)          a course reset (lib/learn/reset.ts).
 */
import { supabase } from "@/lib/supabase";
import { privateRequest } from "@/lib/ai/chat/capture";
import { forgetProgress, loadMemory } from "@/lib/ai/chat/server";
import { eventRow, type EventCourse, type NewEvent, type OutcomeEvent } from "./events-model";

const isMissing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "42703", "PGRST204", "PGRST205"].includes(e.code || "") || /does not exist|could not find the/i.test(e.message || ""));

const cache = new Map<string, { at: number; p: Promise<OutcomeEvent[]> }>();
export const forgetOutcomes = (userId: string) => cache.delete(userId);

export function loadOutcomes(userId: string): Promise<OutcomeEvent[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 30_000) return hit.p;
  const p = (async () => {
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const { data, error } = await supabase.from("learner_outcomes").select("course, kind, ref, outcome, detail, at").eq("user_id", userId).gte("at", since).order("at", { ascending: false }).limit(200);
    if (error) {
      if (!isMissing(error)) console.warn("[learner] outcomes:", error.message);
      return [];
    }
    return ((data ?? []) as { course: EventCourse; kind: OutcomeEvent["kind"]; ref: string; outcome: string | null; detail: OutcomeEvent["detail"] | null; at: string }[]).map((r) => ({ ...r, detail: r.detail ?? {}, at: Date.parse(r.at) || 0 }));
  })();
  cache.set(userId, { at: Date.now(), p });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  p.catch(() => cache.delete(userId));
  return p;
}

/** Whether outcomes may be noted for this request: no GPC or opt-out, memory on. */
export async function mayRecord(request: Request | null, userId: string): Promise<boolean> {
  if (!userId || (request && privateRequest(request))) return false;
  const m = await loadMemory(userId).catch(() => null);
  return !!m && m.available && !m.paused;
}

export async function recordOutcome(request: Request | null, userId: string, e: NewEvent | NewEvent[]): Promise<boolean> {
  try {
    const rows = (Array.isArray(e) ? e : [e]).map((x) => eventRow(userId, x)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!rows.length || !(await mayRecord(request, userId))) return false;
    const { error } = await supabase.from("learner_events").insert(rows);
    if (error) {
      if (!isMissing(error)) console.warn("[learner] record:", error.message);
      return false;
    }
    forgetOutcomes(userId);
    // the course chat's next message sees it (its snapshot is kept a minute)
    forgetProgress(userId);
    return true;
  } catch (err) {
    console.warn("[learner] record failed:", (err as Error).message);
    return false;
  }
}

export async function clearOutcomes(userId: string, course?: EventCourse): Promise<void> {
  let q = supabase.from("learner_events").delete().eq("user_id", userId);
  if (course) q = q.eq("course", course);
  const { error } = await q;
  if (error && !isMissing(error)) throw new Error(error.message);
  forgetOutcomes(userId);
}
