import "server-only";
/**
 * The course chat's history in the database (table chat_threads, supabase/migrations/20261029_chat_threads.sql),
 * always by the verified user id. Every call says `available: false` while the table is missing (the browser then
 * keeps history on the device only and uploads it once the table exists).
 */
import { supabase } from "@/lib/supabase";
import { THREADS_MAX, type ThreadBody, type ThreadMeta, type ThreadRecord } from "./chat-history";

type Row = { id: string; title: string; created_at: string; updated_at: string; deleted: boolean; messages?: unknown; state?: unknown };
export type Store<T> = { available: false } | { available: true; ok: boolean; value: T };

const isMissing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "42703", "PGRST204", "PGRST205"].includes(e.code || "") || /does not exist|could not find the/i.test(e.message || ""));
const ms = (s: string) => Date.parse(s) || 0;
const meta = (r: Row): ThreadMeta => ({ id: r.id, title: r.title, createdAt: ms(r.created_at), updatedAt: ms(r.updated_at) });
const fail = <T>(error: { code?: string; message?: string } | null, value: T): Store<T> => {
  if (isMissing(error)) return { available: false };
  if (error) console.error("[chat-history]", error.message);
  return { available: true, ok: !error, value };
};

/** Titles and dates of the learner's live conversations, newest first. */
export async function listThreads(userId: string): Promise<Store<ThreadMeta[]>> {
  const { data, error } = await supabase.from("chat_threads").select("id, title, created_at, updated_at, deleted").eq("user_id", userId).eq("deleted", false).order("updated_at", { ascending: false }).limit(THREADS_MAX);
  return fail(error, ((data ?? []) as Row[]).map(meta));
}

/** One conversation: the record, "deleted" (a tombstone: deleted on another device), or null (never stored or expired). */
export async function getThread(userId: string, id: string): Promise<Store<ThreadRecord | "deleted" | null>> {
  const { data, error } = await supabase.from("chat_threads").select("id, title, created_at, updated_at, deleted, messages, state").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) return fail(error, null);
  const r = data as Row | null;
  if (!r) return { available: true, ok: true, value: null };
  if (r.deleted) return { available: true, ok: true, value: "deleted" };
  return { available: true, ok: true, value: { ...meta(r), messages: (Array.isArray(r.messages) ? r.messages : []) as ThreadBody["messages"], state: (r.state ?? {}) as ThreadBody["state"] } };
}

/**
 * Create or replace one conversation. A conversation deleted on another device stays deleted ("deleted": the
 * browser drops its copy). After a new one, the oldest beyond 100 are removed.
 */
export async function putThread(userId: string, id: string, t: { title: string; createdAt: number; body: ThreadBody }): Promise<Store<ThreadMeta | "deleted">> {
  const { data: prev, error: e1 } = await supabase.from("chat_threads").select("deleted").eq("user_id", userId).eq("id", id).maybeSingle();
  if (e1) return fail(e1, "deleted" as const);
  if ((prev as { deleted?: boolean } | null)?.deleted) return { available: true, ok: true, value: "deleted" };
  const now = new Date().toISOString();
  const created = Number.isFinite(t.createdAt) && t.createdAt > 0 && t.createdAt <= Date.now() + 60_000 ? new Date(t.createdAt).toISOString() : now;
  const { data, error } = await supabase
    .from("chat_threads")
    .upsert({ user_id: userId, id, title: t.title, messages: t.body.messages, state: t.body.state, created_at: created, updated_at: now, deleted: false }, { onConflict: "user_id,id" })
    .select("id, title, created_at, updated_at, deleted")
    .single();
  if (error) return fail(error, "deleted" as const);
  if (!prev) await trim(userId);
  return { available: true, ok: true, value: meta(data as Row) };
}

/** At most 100 live conversations: the oldest beyond that are removed. */
async function trim(userId: string) {
  const { data } = await supabase.from("chat_threads").select("id").eq("user_id", userId).eq("deleted", false).order("updated_at", { ascending: false }).range(THREADS_MAX, THREADS_MAX + 50);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) await supabase.from("chat_threads").delete().eq("user_id", userId).in("id", ids);
}

export async function renameThread(userId: string, id: string, title: string): Promise<Store<boolean>> {
  const { data, error } = await supabase.from("chat_threads").update({ title }).eq("user_id", userId).eq("id", id).eq("deleted", false).select("id");
  return fail(error, ((data ?? []) as unknown[]).length > 0);
}

/** Delete one conversation (or every one): the text goes at once; a tombstone without text stays until the 90-day cleanup. */
export async function deleteThreads(userId: string, id: string | null): Promise<Store<boolean>> {
  let q = supabase.from("chat_threads").update({ deleted: true, title: "", messages: [], state: {}, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (id) q = q.eq("id", id);
  else q = q.eq("deleted", false);
  const { error } = await q;
  if (!error && id) {
    // deleting one that was never uploaded: leave a tombstone anyway, so another device's copy goes too
    await supabase.from("chat_threads").upsert({ user_id: userId, id, title: "", messages: [], state: {}, deleted: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,id", ignoreDuplicates: true });
  }
  return fail(error, !error);
}

/* ------------------------------------------------------------------ rate limit (per instance, per learner) */

const hits = new Map<string, number[]>();
/** Reads 120 a minute, writes 40 a minute, per learner and server instance. */
export function rateLimited(userId: string, kind: "read" | "write"): boolean {
  const key = `${kind}:${userId}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 2000) hits.delete(hits.keys().next().value as string);
  return list.length > (kind === "read" ? 120 : 40);
}
