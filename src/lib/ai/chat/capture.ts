import "server-only";
/**
 * Memory capture for chats that end quietly (AI audit 12 Nov 2026, O4): the memory was written only on every few
 * learner messages and on "New chat", so a chat of one to three messages that the learner simply left was never
 * noted (4 of 6 signed-in chat users had no memory at all). Now a chat is also noted
 *   - when it goes idle (the page posts it after 10 quiet minutes: useCourseChat), and
 *   - when the learner starts the next chat (the server picks the previous one from chat_threads),
 * through the same writers as before (memory.ts updateMemory, lib/dsa/ai/memory.ts updateDsaMemory), never a second one.
 *
 * Rules:
 *   - idempotent: every memory update logs the learner messages it covered (ai_calls meta.users); a chat whose
 *     messages are all covered is skipped, and a chat's session line is replaced, never added twice (mergeMemory);
 *   - at most one background capture (idle or next chat) per chat, so one Haiku call (~$0.0005) at most for it;
 *   - memory switched off or unavailable: nothing (the writers check); GPC or the site's analytics opt-out on the
 *     request that would start a background capture (Sec-GPC, or the page's x-hk-notrack): nothing.
 */
import { supabase } from "@/lib/supabase";
import { getThread, listThreads } from "@/lib/learn/chat-history-server";
import type { ChatCourse } from "@/lib/learn/chat-history";
import { updateDsaMemory } from "@/lib/dsa/ai/memory";
import { updateMemory } from "./memory";
import type { ChatTurn } from "./text";

export type CaptureVia = "idle" | "next" | "end";
const BACKGROUND: CaptureVia[] = ["idle", "next"];
/** the previous chat is noted when the next one starts only if it was active this recently */
const NEXT_WITHIN_MS = 7 * 86_400_000;

/** A Global Privacy Control signal or the site's analytics opt-out (hk.notrack, sent by the page as x-hk-notrack). */
export const privateRequest = (request: Request) => request.headers.get("sec-gpc") === "1" || request.headers.get("x-hk-notrack") === "1";

/** What earlier memory updates of this chat covered: the most learner messages, and whether one was a background capture. */
async function coverage(userId: string, chat: string): Promise<{ users: number; background: boolean }> {
  const { data, error } = await supabase.from("ai_calls").select("meta").eq("user_id", userId).eq("feature", "chat-memory").eq("status", "ok").eq("meta->>chat", chat).limit(50);
  // unreadable: treat as covered (a missed note costs less than a double call)
  if (error) return { users: Number.MAX_SAFE_INTEGER, background: true };
  let users = 0;
  let background = false;
  for (const r of (data ?? []) as { meta: { users?: unknown; turns?: unknown; via?: unknown } | null }[]) {
    const m = r.meta ?? {};
    // rows from before `users` was logged: their turns alternate learner / tutor
    users = Math.max(users, Number(m.users) || Math.ceil((Number(m.turns) || 0) / 2));
    if (BACKGROUND.includes(m.via as CaptureVia)) background = true;
  }
  return { users, background };
}

const inflight = new Set<string>();

/**
 * Note one finished (or quiet) conversation in the learner's memory, unless its messages are already covered.
 * `course` picks the writer: the course chat's, or DSA Mastery's (with `where`).
 */
export async function captureChat(a: { userId: string; admin: boolean; userKey: string | null; chat: string; turns: ChatTurn[]; course: ChatCourse; via: CaptureVia; where?: string }): Promise<boolean> {
  const users = a.turns.filter((t) => t.role === "user").length;
  if (!a.userId || !users) return false;
  const key = `${a.userId}:${a.chat}`;
  if (inflight.has(key)) return false;
  inflight.add(key);
  try {
    const c = await coverage(a.userId, a.chat);
    if (c.users >= users) return false;
    if (BACKGROUND.includes(a.via) && c.background) return false;
    const base = { userId: a.userId, admin: a.admin, userKey: a.userKey, chat: a.chat, turns: a.turns, via: a.via };
    return a.course === "dsa" ? await updateDsaMemory({ ...base, where: a.where ?? "DSA Mastery (a finished conversation)" }) : await updateMemory(base);
  } finally {
    inflight.delete(key);
  }
}

/** A stored conversation's messages as turns (errors and empty lines left out). */
export function turnsOf(messages: Record<string, unknown>[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const m of messages) {
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null;
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (role && text && !m.error) out.push({ role, text: text.slice(0, 4000) });
  }
  return out;
}

/**
 * The learner started a new chat (`current`): note their previous conversation of the same course, from chat_threads,
 * if it was active in the last week and isn't covered yet. Runs after the new chat's first answer is out.
 */
export async function captureLastChat(a: { userId: string; admin: boolean; userKey: string | null; current: string; course: ChatCourse }): Promise<boolean> {
  const list = await listThreads(a.userId, a.course);
  if (!list.available || !list.ok) return false;
  const prev = list.value.find((t) => t.id !== a.current);
  if (!prev || Date.now() - prev.updatedAt > NEXT_WITHIN_MS) return false;
  const t = await getThread(a.userId, prev.id);
  if (!t.available || !t.ok || !t.value || t.value === "deleted") return false;
  return captureChat({ userId: a.userId, admin: a.admin, userKey: a.userKey, chat: prev.id, turns: turnsOf(t.value.messages), course: a.course, via: "next" });
}
